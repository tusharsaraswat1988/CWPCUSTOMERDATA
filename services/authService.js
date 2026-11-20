/**
 * =========================================================================
 * CWP DATA APP - AUTHENTICATION & SECURITY SERVICE
 * Phase 2: Complete Neon PostgreSQL Authentication & Session Management
 * =========================================================================
 */

const crypto = require('crypto');
const repos = require('../db/repositories/index');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 Hours
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
async function loginAdmin({ username = 'admin', password, ipAddress = null, userAgent = null }) {
  if (!password || !password.trim()) {
    return { success: false, error: 'Please enter admin password.' };
  }

  // Auto-seed admin if database is newly initialized
  await ensureAdminUser();

  const user = await repos.adminUsers.findByUsername(username);
  if (!user) {
    // If user not found, verify fallback against .env ADMIN_PASSWORD
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (envPass && envPass === password.trim()) {
      // Create user and proceed
      const hash = hashPasswordScrypt(envPass);
      const newAdmin = await repos.adminUsers.createAdmin({
        username: username.trim(),
        passwordHash: hash,
        role: 'superadmin'
      });
      return issueAdminSession(newAdmin, ipAddress, userAgent);
    }
    return { success: false, error: 'Invalid admin credentials.' };
  }

  if (!user.is_active) {
    return { success: false, error: 'Admin account is deactivated.' };
  }

  const isValid = verifyPasswordScrypt(password.trim(), user.password_hash);
  if (!isValid) {
    // Fallback check against process.env.ADMIN_PASSWORD in case .env was updated
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (envPass && envPass === password.trim()) {
      // Auto-update user's password_hash to match new .env password
      const newHash = hashPasswordScrypt(envPass);
      await repos.adminUsers.updatePassword(user.id, newHash);
      return issueAdminSession(user, ipAddress, userAgent);
    }
    return { success: false, error: 'Invalid admin password.' };
  }

  await repos.adminUsers.updateLastLogin(user.id);
  return issueAdminSession(user, ipAddress, userAgent);
}

async function issueAdminSession(user, ipAddress, userAgent) {
  const token = 'adm_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await repos.authSessions.createSession({
    tokenHash,
    userType: 'admin',
    adminId: user.id,
    expiresAt,
    ipAddress,
    userAgent
  });

  return {
    success: true,
    token,
    role: user.role,
    username: user.username,
    expiresIn: SESSION_TTL_MS / 1000
  };
}

/**
 * Staff PIN Login Handler
 */
async function loginStaff({ identifier, pin, ipAddress = null, userAgent = null }) {
  if (!identifier || !pin) {
    return { success: false, error: 'Please enter staff ID or mobile number and 6-digit PIN.' };
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

  // Issue 12-hour session
  const token = 'stf_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await repos.authSessions.createSession({
    tokenHash,
    userType: 'staff',
    staffId: staff.id,
    expiresAt,
    ipAddress,
    userAgent
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
    return {
      valid: true,
      userType: 'admin',
      adminId: sess.admin_id,
      adminUsername: sess.admin_username,
      adminRole: sess.admin_role,
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
 * Update Admin Password
 */
async function updateAdminPassword({ adminId, currentPassword, newPassword }) {
  if (!newPassword || newPassword.trim().length < 6) {
    return { success: false, error: 'New password must be at least 6 characters long.' };
  }

  const admin = await repos.adminUsers.findById(adminId);
  if (!admin) {
    return { success: false, error: 'Admin user not found.' };
  }

  const isCurrentValid = verifyPasswordScrypt(currentPassword, admin.password_hash);
  if (!isCurrentValid) {
    // Check .env ADMIN_PASSWORD fallback
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (envPass !== currentPassword.trim()) {
      return { success: false, error: 'Incorrect current password.' };
    }
  }

  const newHash = hashPasswordScrypt(newPassword.trim());
  await repos.adminUsers.updatePassword(admin.id, newHash);

  // Revoke all existing sessions for this admin except current session could be maintained
  await repos.authSessions.revokeAllForAdmin(admin.id, 'password_change');

  return { success: true, message: 'Password updated successfully. Please log in with your new password.' };
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

  const pinHash = hashPinScrypt(newPin.trim());
  const salt = pinHash.split(':')[1];

  await repos.staffAuth.setPin(staff.id, pinHash, salt);
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
  resetStaffPin
};
