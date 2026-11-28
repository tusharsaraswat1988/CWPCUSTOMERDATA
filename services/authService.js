/**
 * =========================================================================
 * CWP DATA APP - AUTHENTICATION & SECURITY SERVICE
 * Phase 2: Complete Neon PostgreSQL Authentication & Session Management
 * =========================================================================
 */

const crypto = require('crypto');
const repos = require('../db/repositories/index');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 Hours (Absolute Max Lifetime)
const ADMIN_IDLE_TIMEOUT_MS = Math.min(Math.max(parseInt(process.env.ADMIN_SESSION_IDLE_MINUTES, 10) || 30, 5), 240) * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_PERIOD_MS = 5 * 60 * 1000; // 5 Minutes

/**
 * SHA-256 Hash of session token for secure database storage
 */
function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Scrypt Password Hashing for Admin
 */
function hashPasswordScrypt(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password.toString().trim(), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPasswordScrypt(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  const parts = storedHash.toString().trim().split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const expectedHash = parts[2];
  try {
    const derived = crypto.scryptSync(inputPassword.toString().trim(), salt, 32, { N: 16384, r: 8, p: 1 });
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch (e) {
    return false;
  }
}

/**
 * PIN Hashing & Verification for Staff (Supports scrypt with sha256/legacy fallback & auto-upgrade)
 */
function hashPinScrypt(pin, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin.toString().trim(), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPin(inputPin, storedValue) {
  if (!storedValue || !inputPin) return false;
  const str = storedValue.toString().trim();
  const inputStr = inputPin.toString().trim();

  // 1. Scrypt format: scrypt:salt:hash
  if (str.startsWith('scrypt:')) {
    const parts = str.split(':');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      try {
        const derived = crypto.scryptSync(inputStr, salt, 32, { N: 16384, r: 8, p: 1 });
        const expectedBuf = Buffer.from(expectedHash, 'hex');
        if (derived.length !== expectedBuf.length) return false;
        return crypto.timingSafeEqual(derived, expectedBuf);
      } catch (e) {
        return false;
      }
    }
  }

  // 2. Salted SHA-256 format: sha256:salt:hash
  if (str.startsWith('sha256:')) {
    const parts = str.split(':');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = parts[2];
      const actualHash = crypto.createHash('sha256').update(salt + ':' + inputStr).digest('hex');
      const actualBuf = Buffer.from(actualHash, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      if (actualBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(actualBuf, expectedBuf);
    }
  }

  // 3. Plaintext legacy numeric PIN
  if (/^\d{4,8}$/.test(str)) {
    const inBuf = Buffer.from(inputStr);
    const storedBuf = Buffer.from(str);
    if (inBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(inBuf, storedBuf);
  }

  return false;
}

function needsPinRehash(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return false;
  return !storedValue.startsWith('scrypt:');
}

/**
 * Bootstrap default admin user if admin_users is empty
 */
async function ensureAdminUser(envPassword = null) {
  const count = await repos.adminUsers.countAdmins();
  if (count === 0) {
    const password = (envPassword || process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123')).trim();
    if (!password) {
      throw new Error('[Auth] Cannot bootstrap admin user: ADMIN_PASSWORD environment variable is required in production.');
    }
    const hash = hashPasswordScrypt(password);
    return repos.adminUsers.createAdmin({
      username: 'admin',
      phone: null,
      passwordHash: hash,
      role: 'superadmin'
    });
  }
  return null;
}

/**
 * Admin Login Handler
 */
async function loginAdmin({ username = 'admin', password, ipAddress = null, userAgent = null, deviceLabel = null, browser = null, os = null, trustedDeviceId = null }) {
  if (!password || !password.trim()) {
    return { success: false, error: 'Invalid administrator credentials.' };
  }

  // Auto-seed admin if database is newly initialized
  await ensureAdminUser();

  const cleanUser = (username || 'admin').trim();
  const cleanPass = password.trim();
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();

  // Environment-only password enforcement for primary 'admin' account when ADMIN_PASSWORD is set
  if (cleanUser.toLowerCase() === 'admin' && envPass) {
    const inBuf = Buffer.from(cleanPass);
    const envBuf = Buffer.from(envPass);
    const isEnvMatch = inBuf.length === envBuf.length && crypto.timingSafeEqual(inBuf, envBuf);
    if (!isEnvMatch) {
      return { success: false, error: 'Invalid administrator credentials.' };
    }
    let user = await repos.adminUsers.findByUsername('admin');
    if (!user) {
      const hash = hashPasswordScrypt(envPass);
      user = await repos.adminUsers.createAdmin({
        username: 'admin',
        passwordHash: hash,
        role: 'superadmin'
      });
    }
    if (!user.is_active) {
      return { success: false, error: 'Admin account is deactivated.' };
    }
    await repos.adminUsers.updateLastLogin(user.id);
    return issueAdminSession(user, ipAddress, userAgent, { deviceLabel, browser, os, trustedDeviceId });
  }

  const user = await repos.adminUsers.findByUsername(cleanUser);
  if (!user) {
    if (envPass) {
      const inBuf = Buffer.from(cleanPass);
      const envBuf = Buffer.from(envPass);
      if (inBuf.length === envBuf.length && crypto.timingSafeEqual(inBuf, envBuf)) {
        const hash = hashPasswordScrypt(envPass);
        const newAdmin = await repos.adminUsers.createAdmin({
          username: cleanUser,
          passwordHash: hash,
          role: 'superadmin'
        });
        return issueAdminSession(newAdmin, ipAddress, userAgent, { deviceLabel, browser, os, trustedDeviceId });
      }
    }
    return { success: false, error: 'Invalid administrator credentials.' };
  }

  if (!user.is_active) {
    return { success: false, error: 'Admin account is deactivated.' };
  }

  const isValid = verifyPasswordScrypt(cleanPass, user.password_hash);
  if (!isValid) {
    return { success: false, error: 'Invalid administrator credentials.' };
  }

  await repos.adminUsers.updateLastLogin(user.id);
  return issueAdminSession(user, ipAddress, userAgent, { deviceLabel, browser, os, trustedDeviceId });
}

async function issueAdminSession(user, ipAddress, userAgent, deviceMeta = {}) {
  const token = 'adm_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await repos.authSessions.createSession({
    tokenHash,
    userType: 'admin',
    adminId: user.id,
    expiresAt,
    ipAddress,
    userAgent,
    deviceLabel: deviceMeta.deviceLabel || null,
    browser: deviceMeta.browser || null,
    os: deviceMeta.os || null,
    trustedDeviceId: deviceMeta.trustedDeviceId || null
  });

  return {
    success: true,
    token,
    role: user.role,
    username: user.username,
    adminId: user.id,
    expiresIn: SESSION_TTL_MS / 1000
  };
}

/**
 * Staff PIN Login Handler
 */
async function loginStaff({ identifier, pin, ipAddress = null, userAgent = null, deviceId = null }) {
  if (!identifier || !pin) {
    return { success: false, error: 'Please enter staff ID or mobile number and PIN (4–6 digits).' };
  }

  const cleanIdent = identifier.trim();
  const cleanPin = pin.trim();

  // Staff lookup by phone or staff_code
  let staff = null;
  if (/^[6-9]\d{9}$/.test(cleanIdent)) {
    staff = await repos.staff.findByPhone(cleanIdent);
  } else {
    staff = await repos.staff.findByStaffCode(cleanIdent);
  }

  if (!staff) {
    return { success: false, error: 'स्टाफ सदस्य नहीं मिला। कृपया सही मोबाइल नंबर या आईडी दर्ज करें।' };
  }

  if (!staff.is_active) {
    return {
      success: false,
      error: 'आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।',
      inactive: true
    };
  }

  // Check auth credentials and rate limiting
  const auth = await repos.staffAuth.findByStaffId(staff.id);
  if (!auth) {
    return { success: false, error: 'इस स्टाफ के लिए पिन सेट नहीं है। कृपया एडमिन से संपर्क करें।' };
  }

  // Rate Limiting & Cooldown Check
  if (auth.locked_until && new Date() < new Date(auth.locked_until)) {
    const remainingSec = Math.ceil((new Date(auth.locked_until).getTime() - Date.now()) / 1000);
    return {
      success: false,
      rateLimited: true,
      remainingSec,
      error: `Too many failed attempts. Please try again after ${Math.ceil(remainingSec / 60)} minutes. (Account temporarily locked for security)`
    };
  }

  // Verify PIN
  const isMatch = verifyPin(cleanPin, auth.pin_hash);
  if (!isMatch) {
    const updatedAuth = await repos.staffAuth.recordFailedAttempt(staff.id, MAX_FAILED_ATTEMPTS, 5);
    const attempts = updatedAuth ? updatedAuth.failed_attempts : 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      return {
        success: false,
        rateLimited: true,
        remainingSec: 300,
        error: 'Too many failed attempts. Please try again after 5 minutes. (Account temporarily locked for security)'
      };
    }
    return {
      success: false,
      error: `गलत पिन (Wrong PIN). प्रयास: ${attempts}/${MAX_FAILED_ATTEMPTS}`
    };
  }

  // Successful Login
  await repos.staffAuth.recordSuccessfulLogin(staff.id);

  // Auto-upgrade legacy hash to scrypt if necessary
  if (needsPinRehash(auth.pin_hash)) {
    const newHash = hashPinScrypt(cleanPin);
    const salt = newHash.split(':')[1];
    await repos.staffAuth.setPin(staff.id, newHash, salt);
    console.log(`[Security] Upgraded PIN hash for staff ${staff.staff_code} to scrypt.`);
  }

  // Option 1: Active Session Protection (Shield existing active device)
  // If staff already has an active, non-expired, non-revoked session on a DIFFERENT device,
  // BLOCK the new login to protect the active field worker from unauthorized takeover/interruption.
  const existingActive = await repos.authSessions.findActiveForStaff(staff.id);
  if (existingActive) {
    // Check if this is the SAME device (re-login or token refresh on the same device)
    const isSameDevice = (deviceId && existingActive.device_id && existingActive.device_id === deviceId) ||
                         (!deviceId && existingActive.ip_address === ipAddress && existingActive.user_agent === userAgent);
    
    if (!isSameDevice) {
      return {
        success: false,
        sessionConflict: true,
        error: 'यह स्टाफ अकाउंट पहले से किसी अन्य मोबाइल/डिवाइस पर एक्टिव है। सुरक्षा और गोपनीयता के लिए नया लॉगिन ब्लॉक किया गया है। कृपया पहले पुराने फोन से लॉगआउट करें या एडमिन से रीसेट करवाएं।'
      };
    }

    // If it is the SAME device, revoke old token for this device cleanly and issue refreshed session
    await repos.authSessions.revokeSession(existingActive.token_hash, 'device_refresh');
  }

  // Issue 12-hour session with deviceId binding
  const token = 'stf_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await repos.authSessions.createSession({
    tokenHash,
    userType: 'staff',
    staffId: staff.id,
    expiresAt,
    ipAddress,
    userAgent,
    deviceId: deviceId || null
  });

  return {
    success: true,
    token,
    staff: {
      id: staff.id,
      staff_code: staff.staff_code,
      name: staff.name,
      phone: staff.phone
    },
    staffId: staff.staff_code,
    staffName: staff.name,
    phone: staff.phone,
    expiresIn: SESSION_TTL_MS / 1000
  };
}

/**
 * Validate Token & Session Recovery Middleware
 */
async function validateSession(token) {
  if (!token) return { valid: false, error: 'Missing token' };
  const tokenHash = hashToken(token);
  const sess = await repos.authSessions.findActiveSession(tokenHash);

  if (!sess) {
    return { valid: false, error: 'Session expired or invalid' };
  }

  // If staff session, verify staff member is still active
  if (sess.user_type === 'staff') {
    if (!sess.staff_active) {
      // Inactive staff -> revoke session immediately
      await repos.authSessions.revokeSession(tokenHash, 'system_staff_deactivated');
      return { valid: false, error: 'Staff account has been deactivated', inactive: true };
    }
    return {
      valid: true,
      userType: 'staff',
      staffId: sess.staff_id,
      staffCode: sess.staff_code,
      staffName: sess.staff_name,
      staffPhone: sess.staff_phone,
      tokenHash
    };
  }

  if (sess.user_type === 'admin') {
    if (!sess.admin_active) {
      await repos.authSessions.revokeSession(tokenHash, 'system_admin_deactivated');
      return { valid: false, error: 'Admin account is deactivated' };
    }
    const lastAct = sess.last_activity_at ? new Date(sess.last_activity_at).getTime() : new Date(sess.created_at).getTime();
    if (Date.now() - lastAct > ADMIN_IDLE_TIMEOUT_MS) {
      await repos.authSessions.revokeSession(tokenHash, 'session_expired_idle');
      return { valid: false, expiredReason: 'idle', error: 'Session expired due to inactivity' };
    }
    if (Date.now() - lastAct > 60000) {
      repos.authSessions.touchAdminSession(tokenHash).catch(() => {});
    }
    return {
      valid: true,
      userType: 'admin',
      adminId: sess.admin_id,
      adminUsername: sess.admin_username,
      adminRole: sess.admin_role,
      createdAt: sess.created_at,
      lastActivityAt: sess.last_activity_at || sess.created_at,
      expiresAt: sess.expires_at,
      deviceLabel: sess.device_label,
      browser: sess.browser,
      os: sess.os,
      tokenHash
    };
  }

  return { valid: false, error: 'Unknown session type' };
}

/**
 * Explicit Logout & Revocation
 */
async function logout(token, revokedBy = 'user') {
  if (!token) return { success: true };
  const tokenHash = hashToken(token);
  await repos.authSessions.revokeSession(tokenHash, revokedBy);
  return { success: true, message: 'Session logged out and revoked successfully' };
}

/**
 * Revoke all sessions for a staff member (called upon deactivation or PIN change)
 */
async function revokeAllStaffSessions(staffId, reason = 'admin_action') {
  return repos.authSessions.revokeAllForStaff(staffId, reason);
}

/**
 * Update Admin Password (DISABLED: Environment-only admin password policy)
 */
async function updateAdminPassword() {
  return {
    success: false,
    error: 'Admin password management is disabled. The administrator password is configured exclusively via server environment variables.'
  };
}

/**
 * Reset Staff PIN
 */
async function resetStaffPin({ staffId, staffCodeOrId, newPin, adminUser = 'admin' }) {
  const targetId = (staffId || staffCodeOrId || '').toString().trim();
  if (!newPin || !/^\d{6}$/.test(newPin.trim())) {
    return { success: false, error: 'PIN must be exactly 6 digits.' };
  }

  let staff = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(targetId)) {
    staff = await repos.staff.findById(targetId);
  } else {
    staff = await repos.staff.findByStaffCode(targetId);
  }
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  const cleanPin = newPin.trim();
  const pinHash = hashPinScrypt(cleanPin);
  const salt = pinHash.split(':')[1];

  await repos.staffAuth.setPin(staff.id, pinHash, salt, null, cleanPin);
  await repos.staffAuth.resetLockout(staff.id);
  // Immediately revoke all active sessions for this staff member
  await revokeAllStaffSessions(staff.id, `pin_reset_by_${adminUser}`);

  // Log to audit_logs
  await repos.auditLogs.logChange({
    entityType: 'staff_auth',
    entityId: staff.id,
    action: 'pin_reset',
    changedBy: adminUser,
    afterState: { staffCode: staff.staff_code, pinReset: true }
  });

  return { success: true, message: `PIN for staff ${staff.name} (${staff.staff_code}) reset successfully.` };
}

/**
 * Unlock Staff Member Account (Reset failed attempts & clear lockout)
 */
async function unlockStaff({ staffCodeOrId, adminUser = 'admin', clearSessions = true }) {
  const targetId = (staffCodeOrId || '').toString().trim();
  if (!targetId) return { success: false, error: 'Staff ID is required.' };
  let staff = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(targetId)) {
    staff = await repos.staff.findById(targetId);
  } else {
    staff = await repos.staff.findByStaffCode(targetId);
  }
  if (!staff) return { success: false, error: 'Staff member not found.' };

  await repos.staffAuth.resetLockout(staff.id);
  if (clearSessions) {
    await repos.authSessions.revokeAllForStaff(staff.id, `admin_unlock_by_${adminUser}`);
  }
  await repos.auditLogs.logChange({
    entityType: 'staff_auth',
    entityId: staff.id,
    action: 'unlock_account',
    changedBy: adminUser,
    afterState: { staffCode: staff.staff_code, lockedUntil: null, failedAttempts: 0, sessionsCleared: clearSessions }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    phone: staff.phone,
    name: staff.name,
    message: `Staff member (${staff.name}) unlocked & device sessions reset successfully!`
  };
}

module.exports = {
  SESSION_TTL_MS,
  MAX_FAILED_ATTEMPTS,
  COOLDOWN_PERIOD_MS,
  hashToken,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  hashPinScrypt,
  verifyPin,
  needsPinRehash,
  ensureAdminUser,
  loginAdmin,
  loginStaff,
  validateSession,
  logout,
  revokeAllStaffSessions,
  updateAdminPassword,
  resetStaffPin,
  unlockStaff
};
