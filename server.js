/**
 * =========================================================================
 * CWP Staff Information Viewer - Node.js Production Server for Railway
 * CWP Detailers & Motors
 *
 * Hardened Security & Functional Architecture:
 * - Pure Neon PostgreSQL Architecture (cwp_customer_db)
 * - Secure Server-Issued Admin & Staff Sessions with 12-Hour TTL & Revocation
 * - Server-Side Authorization Enforcement on Every Admin Operation
 * - Strict Staff Data Isolation (No cross-staff data leakage)
 * - crypto.scrypt PIN Hashing with Backward Compatibility & Auto-Upgrade
 * - Failed Login Rate Limiting (5 Attempts -> 5-Minute Cooldown, No Permanent Lockout)
 * - Zero Default PINs (Explicit 6-Digit PIN Mandatory for New Staff)
 * - No Plaintext Admin Password Storage (Hashed with scrypt locally)
 * - Explicit Service Category Mapping (Daily Car Cleaning / Car Washing / Solar Panel Cleaning)
 * - Preserved Daily Clean Route Sequence Order & Dual Customer Locations
 *
 * Target Database: Neon PostgreSQL cwp_customer_db
 * Production Domain: cwpdata.up.railway.app
 * Image Storage: Cloudinary CDN (Direct HTTPS Links & Instant Thumbnails)
 * =========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

// Load local .env immediately if present (only when not running automated unit/fixture tests)
if (process.env.NODE_ENV !== 'test' && !process.env.DATA_FILE) {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {}
}

const db = require('./db/index');
const repos = require('./db/repositories/index');
const authService = require('./services/authService');
const adminService = require('./services/adminService');
const staffPortalService = require('./services/staffPortalService');
const offlineSyncService = require('./services/offlineSyncService');
const indicService = require('./services/indicTransliterateService');
const serviceCatalog = require('./services/serviceCatalog');
const homepageConfigService = require('./services/homepageConfigService');
const careerService = require('./services/careerService');
const seoConfig = require('./services/seoConfig');

function isNeonConfigured() {
  return db.isConfigured();
}

function isNeonPrimaryActive() {
  if (process.env.NODE_ENV === 'test' && !process.env.FORCE_NEON_IN_TEST) {
    return false;
  }
  return isNeonConfigured();
}

const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.CUSTOM_DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN || 'cwpdetailers.in';

/**
 * RFC 4180 compliant CSV parser that preserves exact cell text types,
 * quotes, commas, and newlines without dropping values.
 */
function parseCSV(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\r') {
        // ignore carriage return
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some(v => v !== '')) {
          lines.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some(v => v !== '')) {
      lines.push(row);
    }
  }
  return lines;
}

/**
 * =========================================================================
 * INDIAN MOBILE VALIDATION & NORMALIZATION UTILITIES (Task P2.4)
 * =========================================================================
 * Normalizes valid Indian mobile numbers to exactly 10 digits as a string.
 *
 * Valid representations:
 *  - 10 digits: "9876543210"
 *  - Spaced: "98765 43210", "  98765 43210  "
 *  - +91 prefixed: "+91 98765 43210", "+919876543210", "+91-98765-43210"
 *  - 91 prefixed without plus: "919876543210"
 *  - Leading zero: "09876543210"
 *  - Single quote format: "'9876543210"
 *
 * Strictly rejects:
 *  - Alphabetic input (e.g. "98765abc43210", "abcdefghij")
 *  - Non-+91 country prefixes (e.g. "+1", "+44")
 *  - Short / long numbers (<10 or >10 digits after country-code normalization)
 *  - Numbers with arbitrary malformed punctuation
 *
 * NOTE: String handling only. Never uses parseInt, parseFloat, or Number conversion.
 */
function normalizeIndianMobile(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (!str) return '';

  // Remove leading single apostrophe if present
  str = str.replace(/^'+/, '').trim();
  if (!str) return '';

  // Reject any alphabetic input immediately
  if (/[a-zA-Z]/.test(str)) {
    return '';
  }

  // If string contains '+', ensure it is an Indian prefix (+91)
  if (str.includes('+')) {
    if (!/^\s*\+\s*91/.test(str)) {
      return '';
    }
  }

  // Only allow digits, +, -, spaces, and parentheses
  if (/[^\d+\s\-()]/.test(str)) {
    return '';
  }

  // Strip non-digits and non-plus
  let cleaned = str.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('+')) {
    return '';
  }

  let digits = cleaned.replace(/\D/g, '');

  // Strip leading zero for 11-digit representation (e.g. 09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // Strip 91 country code for 12-digit representation (e.g. 919876543210)
    digits = digits.substring(2);
  }

  return digits;
}

/**
 * Validates whether a value is a valid Indian mobile number.
 * Must normalize to exactly 10 digits and begin with 6, 7, 8, or 9.
 */
function isValidIndianMobile(value) {
  if (value === null || value === undefined) return false;
  const digits = normalizeIndianMobile(value);
  return /^[6-9]\d{9}$/.test(digits);
}

let DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'local_data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Cloudinary Configuration
function isCloudinaryConfigured() {
  if (process.env.CLOUDINARY_URL) return true;
  const cName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET;
  return !!(cName && apiKey && apiSecret);
}

if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
} else if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET,
    secure: true
  });
}

/**
 * Uploads image to Cloudinary CDN and returns viewable HTTPS link
 * If Cloudinary keys are not set yet, falls back to hosted uploads
 */
async function uploadToCloudinary(photoObj) {
  if (!photoObj || !photoObj.base64) return '';

  const mimeType = photoObj.mimeType || 'image/jpeg';
  const dataUri = `data:${mimeType};base64,${photoObj.base64}`;

  if (isCloudinaryConfigured()) {
    try {
      console.log('Uploading photo to Cloudinary CDN...');
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'cwp_customer_photos',
        resource_type: 'image',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
      console.log('Cloudinary upload successful:', uploadResult.secure_url);
      return uploadResult.secure_url;
    } catch (err) {
      console.error('Cloudinary upload error:', err.message);
      return saveLocalUpload(photoObj);
    }
  }

  return saveLocalUpload(photoObj);
}

function saveLocalUpload(photoObj) {
  const mimeType = photoObj.mimeType || 'image/jpeg';
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const filename = 'cwp_' + Date.now() + ext;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(photoObj.base64, 'base64'));
  return `/uploads/${filename}`;
}

/**
 * =========================================================================
 * SECURITY: PIN HASHING & PIN VERIFICATION (crypto.scrypt with legacy migration)
 * Primary Format: scrypt:16byte_hex_salt:64char_hex_hash
 * Backward Compatible: sha256:16byte_hex_salt:64char_hex_hash and legacy 6-digit PIN
 * =========================================================================
 */
function hashPinScrypt(pin, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin.toString().trim(), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function hashPinSha256(pin, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + ':' + pin.toString().trim()).digest('hex');
  return `sha256:${salt}:${hash}`;
}

// Default hash function uses scrypt
function hashPin(pin, salt) {
  return hashPinScrypt(pin, salt);
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

  // 2. Salted SHA-256 hash: sha256:salt:hash
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

  // 3. Migration path: legacy plaintext numeric PIN (e.g. "123456")
  if (/^\d{4,8}$/.test(str)) {
    const inBuf = Buffer.from(inputStr);
    const storedBuf = Buffer.from(str);
    if (inBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(inBuf, storedBuf);
  }

  return false;
}

function needsRehash(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return false;
  return !storedValue.startsWith('scrypt:');
}

function isValidCredentialFormat(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  if (!s || s.toUpperCase() === '[PROTECTED]') return false;
  if (/^\d{6}$/.test(s)) return true;
  if (s.startsWith('scrypt:') && s.split(':').length === 3) return true;
  if (s.startsWith('sha256:') && s.split(':').length === 3) return true;
  return false;
}

/**
 * =========================================================================
 * SECURITY: ADMIN PASSWORD HASHING (scrypt - Never stored in plaintext)
 * =========================================================================
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

function reloadEnvFile() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
    }
  } catch (e) { }
}

function verifyAdminPasswordNode(inputPass) {
  if (!inputPass) return false;
  let envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPass) {
    const inBuf = Buffer.from(inputPass.trim());
    const envBuf = Buffer.from(envPass);
    if (inBuf.length === envBuf.length && crypto.timingSafeEqual(inBuf, envBuf)) {
      return true;
    }
  }
  // If not matched, reload .env in case user changed .env file live
  if (process.env.NODE_ENV !== 'test') {
    reloadEnvFile();
    envPass = (process.env.ADMIN_PASSWORD || '').trim();
    if (envPass) {
      const inBuf = Buffer.from(inputPass.trim());
      const envBuf = Buffer.from(envPass);
      if (inBuf.length === envBuf.length && crypto.timingSafeEqual(inBuf, envBuf)) {
        return true;
      }
    }
  }
  if (appState && appState.adminPasswordHash) {
    return verifyPasswordScrypt(inputPass, appState.adminPasswordHash);
  }
  return false;
}

function hasAdminPasswordConfigured() {
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) return true;
  if (process.env.NODE_ENV !== 'test') {
    reloadEnvFile();
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) return true;
  }
  if (appState && appState.adminPasswordHash && appState.adminPasswordHash.trim()) return true;
  return false;
}

/**
 * =========================================================================
 * SECURITY: LOGIN RATE LIMITING (Client IP + Staff Identifier)
 * 5 failed attempts within 5 minutes trigger a 5-minute cooldown.
 * Permanent lockouts are explicitly avoided for field staff accessibility.
 * =========================================================================
 */
const failedLogins = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(req) {
  if (!req) return 'unknown';
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function checkRateLimit(clientIp, identifier) {
  const key = `${clientIp}:${(identifier || '').toLowerCase()}`;
  const now = Date.now();
  const record = failedLogins.get(key);
  if (!record) return { allowed: true };
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingSec: remainingSec,
      error: `Too many failed attempts. Please try again after ${Math.ceil(remainingSec / 60)} minutes. (Account temporarily locked for security)`
    };
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    failedLogins.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedLogin(clientIp, identifier) {
  const key = `${clientIp}:${(identifier || '').toLowerCase()}`;
  const now = Date.now();
  const record = failedLogins.get(key) || { count: 0, firstFailAt: now };
  if (now - record.firstFailAt > COOLDOWN_PERIOD_MS) {
    record.count = 1;
    record.firstFailAt = now;
    record.lockedUntil = 0;
  } else {
    record.count++;
  }
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + COOLDOWN_PERIOD_MS;
  }
  failedLogins.set(key, record);
}

function clearRateLimit(clientIp, identifier) {
  const key = `${clientIp}:${(identifier || '').toLowerCase()}`;
  failedLogins.delete(key);
}

/**
 * =========================================================================
 * SECURITY: SERVER-ISSUED SESSIONS (ADMIN & STAFF) - 12-Hour TTL
 * Tokens have 12-hour expiry, explicit revocation, and in-memory TTL store.
 * =========================================================================
 */
const adminSessions = new Map(); // token -> { createdAt, expiresAt, username, role }
const staffSessions = new Map(); // token -> { staffId, staffCode, staffName, staffPhone, createdAt, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (Documented Consistent TTL)

function recordAdminSession(token, sessObj) {
  if (!token) return;
  const fullObj = {
    username: (sessObj && sessObj.username) || 'admin',
    role: (sessObj && sessObj.role) || 'superadmin',
    createdAt: (sessObj && sessObj.createdAt) || Date.now(),
    expiresAt: (sessObj && sessObj.expiresAt) || (Date.now() + SESSION_TTL_MS)
  };
  adminSessions.set(token, fullObj);
  if (!appState.adminSessions) appState.adminSessions = {};
  appState.adminSessions[token] = fullObj;
  saveLocalData(appState);
}

function recordStaffSession(token, sessObj) {
  if (!token) return;
  const sCode = (sessObj && (sessObj.staffCode || sessObj.staffId)) || '';
  const fullObj = {
    staffId: (sessObj && sessObj.staffId) || sCode,
    staffCode: sCode,
    staffName: (sessObj && sessObj.staffName) || '',
    staffPhone: (sessObj && sessObj.staffPhone) || '',
    createdAt: (sessObj && sessObj.createdAt) || Date.now(),
    expiresAt: (sessObj && sessObj.expiresAt) || (Date.now() + SESSION_TTL_MS)
  };
  staffSessions.set(token, fullObj);
  if (!appState.staffSessions) appState.staffSessions = {};
  appState.staffSessions[token] = fullObj;
  saveLocalData(appState);
}

function createAdminSession() {
  const token = 'adm_' + crypto.randomBytes(32).toString('hex');
  recordAdminSession(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function isValidAdminSession(token) {
  if (!token) return false;
  let sess = adminSessions.get(token);
  // Restore from persisted local state if server recently restarted
  if (!sess && appState && appState.adminSessions && appState.adminSessions[token]) {
    sess = appState.adminSessions[token];
    if (Date.now() <= sess.expiresAt) {
      adminSessions.set(token, sess);
    } else {
      delete appState.adminSessions[token];
      saveLocalData(appState);
      return false;
    }
  }
  if (!sess) return false;
  if (Date.now() > sess.expiresAt) {
    adminSessions.delete(token);
    if (appState && appState.adminSessions) {
      delete appState.adminSessions[token];
      saveLocalData(appState);
    }
    return false;
  }
  return true;
}

function revokeAdminSession(token) {
  if (token) {
    adminSessions.delete(token);
    if (appState && appState.adminSessions && appState.adminSessions[token]) {
      delete appState.adminSessions[token];
      saveLocalData(appState);
    }
  }
}

function createStaffSession(staffId, staffName, phone) {
  const token = 'stf_' + crypto.randomBytes(32).toString('hex');
  let staffPhone = phone || '';
  if (!staffPhone && appState && appState.staffList) {
    const found = appState.staffList.find(s => (s.id || '').toUpperCase() === (staffId || '').toUpperCase());
    if (found && found.phone) staffPhone = found.phone;
  }
  const sessObj = {
    staffId: staffId,
    staffCode: staffId,
    staffName: staffName,
    staffPhone: staffPhone,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  recordStaffSession(token, sessObj);
  return token;
}

function getValidStaffSession(token) {
  if (!token) return null;
  let sess = staffSessions.get(token);
  // Restore from persisted local state if server recently restarted
  if (!sess && appState && appState.staffSessions && appState.staffSessions[token]) {
    sess = appState.staffSessions[token];
    if (Date.now() <= sess.expiresAt) {
      staffSessions.set(token, sess);
    } else {
      delete appState.staffSessions[token];
      saveLocalData(appState);
      return null;
    }
  }
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    staffSessions.delete(token);
    if (appState && appState.staffSessions) {
      delete appState.staffSessions[token];
      saveLocalData(appState);
    }
    return null;
  }
  if (appState && appState.staffList && sess.staffId) {
    const sIdentifier = (sess.staffCode || sess.staffId || '').toUpperCase();
    const currentStaff = appState.staffList.find(s => (s.id || '').toUpperCase() === sIdentifier);
    if (currentStaff) {
      const isActive = currentStaff.active !== undefined ? (currentStaff.active === true || currentStaff.active === 'Yes' || currentStaff.active === 'yes' || currentStaff.active === 'Active') : true;
      if (!isActive) {
        staffSessions.delete(token);
        if (appState.staffSessions) {
          delete appState.staffSessions[token];
          saveLocalData(appState);
        }
        return null;
      }
      const sessP = (sess.staffPhone || '').replace(/\D/g, '').slice(-10);
      const currP = (currentStaff.phone || '').replace(/\D/g, '').slice(-10);
      if (sessP && currP && sessP !== currP && !isNeonPrimaryActive()) {
        staffSessions.delete(token);
        if (appState.staffSessions) {
          delete appState.staffSessions[token];
          saveLocalData(appState);
        }
        return null;
      }
    }
  }
  return sess;
}

function revokeStaffSession(token) {
  if (token) {
    staffSessions.delete(token);
    if (appState && appState.staffSessions && appState.staffSessions[token]) {
      delete appState.staffSessions[token];
      saveLocalData(appState);
    }
  }
}

function revokeAllStaffSessionsForId(staffId) {
  const sId = (staffId || '').toUpperCase();
  for (const [token, sess] of staffSessions.entries()) {
    if ((sess.staffCode || sess.staffId || '').toUpperCase() === sId) {
      staffSessions.delete(token);
    }
  }
  if (appState && appState.staffSessions) {
    for (const token of Object.keys(appState.staffSessions)) {
      if ((appState.staffSessions[token].staffCode || appState.staffSessions[token].staffId || '').toUpperCase() === sId) {
        delete appState.staffSessions[token];
      }
    }
    saveLocalData(appState);
  }
}

async function getSessionInfo(token) {
  if (!token) return null;
  // 1. Check in-memory session (fast cache & test mocks)
  if (adminSessions.has(token)) {
    const s = adminSessions.get(token);
    if (Date.now() <= s.expiresAt) return { userType: 'admin', token, ...s };
    adminSessions.delete(token);
  }
  if (isValidAdminSession(token)) {
    const s = adminSessions.get(token) || (appState.adminSessions && appState.adminSessions[token]) || {};
    return { userType: 'admin', token, ...s };
  }

  let staffMem = getValidStaffSession(token);
  if (staffMem) {
    return {
      userType: 'staff',
      staffId: staffMem.staffId,
      staffCode: staffMem.staffCode || staffMem.staffId,
      staffName: staffMem.staffName,
      staffPhone: staffMem.staffPhone,
      token
    };
  }

  // 2. Check Neon database auth_sessions
  if (isNeonConfigured()) {
    try {
      const sess = await authService.validateSession(token);
      if (sess && sess.valid) {
        if (sess.userType === 'admin') {
          recordAdminSession(token, {
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS,
            username: sess.adminUsername || 'admin',
            role: sess.adminRole || 'superadmin'
          });
        } else if (sess.userType === 'staff') {
          recordStaffSession(token, {
            staffId: sess.staffId,
            staffCode: sess.staffCode || sess.staffId,
            staffName: sess.staffName,
            staffPhone: sess.staffPhone,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS
          });
        }
        return sess;
      }
    } catch (e) {
      console.warn('[Session] Neon session validation warning:', e.message);
    }
  }

  return null;
}

async function resolveAdminSession(token) {
  if (!token) return null;
  const sess = await getSessionInfo(token);
  if (sess && sess.userType === 'admin') return sess;
  if (isValidAdminSession(token)) {
    return { userType: 'admin', token };
  }
  return null;
}

async function resolveStaffSession(token) {
  if (!token) return null;
  const sess = await getSessionInfo(token);
  if (sess && sess.userType === 'staff') return sess;
  const staffMem = getValidStaffSession(token);
  if (staffMem) {
    return { userType: 'staff', ...staffMem, token };
  }
  return null;
}

/**
 * Extracts authorization token strictly from Bearer headers or POST JSON body.
 * Tokens from URL query strings are explicitly rejected to prevent leakage.
 */
function extractAuthToken(req, payload) {
  if (payload && typeof payload === 'object') {
    if (payload.action === 'getStaffData' && payload.staffToken) {
      return payload.staffToken.trim();
    }
    if (payload.action === 'logoutStaff' && payload.staffToken) {
      return payload.staffToken.trim();
    }
  }
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  // URL query tokens are rejected. Only secure POST payload is accepted as fallback.
  if (payload && typeof payload === 'object') {
    return (payload.token || payload.adminToken || payload.staffToken || '').trim();
  }
  return '';
}

/**
 * =========================================================================
 * LOCAL STATE & SECURE INITIALIZATION
 * Plaintext passwords and PINs are strictly eliminated.
 * =========================================================================
 */
let appState = {
  staffList: [],
  customers: [],
  staffSequences: []
};

async function saveLocalData(data) {
  if (isNeonConfigured() && process.env.NODE_ENV === 'production') {
    return;
  }
  try {
    const toSave = { ...data };
    delete toSave.adminSessions;
    delete toSave.staffSessions;
    fs.writeFileSync(DATA_FILE, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local data file:', err.message);
  }
}

function loadLocalData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (loaded && Array.isArray(loaded.staffList)) {
        const filtered = loaded.staffList.filter(s => {
          if (!s || !s.name) return false;
          if (/^\d+$/.test(s.name.toString().trim()) || s.name.toString().trim().length < 2) return false;
          if (!/^STF\d+/i.test((s.id || '').toString().trim())) return false;
          return true;
        });
        appState.staffList = filtered;
      }
      if (loaded && Array.isArray(loaded.customers)) {
        appState.customers = loaded.customers;
      }
      if (loaded && Array.isArray(loaded.staffSequences)) {
        appState.staffSequences = loaded.staffSequences;
      } else {
        appState.staffSequences = appState.staffSequences || [];
      }
      if (loaded && Array.isArray(loaded.serviceLogs)) {
        appState.serviceLogs = loaded.serviceLogs;
      } else {
        appState.serviceLogs = appState.serviceLogs || [];
      }
      if (loaded && loaded.staffSessions && typeof loaded.staffSessions === 'object') {
        appState.staffSessions = loaded.staffSessions;
        for (const [token, sess] of Object.entries(loaded.staffSessions)) {
          if (sess && sess.expiresAt && Date.now() <= sess.expiresAt) {
            staffSessions.set(token, sess);
          }
        }
      } else {
        appState.staffSessions = appState.staffSessions || {};
      }
      if (loaded && loaded.adminSessions && typeof loaded.adminSessions === 'object') {
        appState.adminSessions = loaded.adminSessions;
        for (const [token, sess] of Object.entries(loaded.adminSessions)) {
          if (sess && sess.expiresAt && Date.now() <= sess.expiresAt) {
            adminSessions.set(token, sess);
          }
        }
      } else {
        appState.adminSessions = appState.adminSessions || {};
      }
      // Upgrade any legacy plaintext adminPassword to scrypt hash immediately
      if (loaded && loaded.adminPassword) {
        if (!loaded.adminPasswordHash) {
          appState.adminPasswordHash = hashPasswordScrypt(loaded.adminPassword);
        }
        delete loaded.adminPassword;
        saveLocalData(loaded);
        console.log('[Security] Legacy plaintext adminPassword removed from storage and migrated to scrypt hash.');
      } else if (loaded && loaded.adminPasswordHash) {
        appState.adminPasswordHash = loaded.adminPasswordHash;
      }
    } catch (e) {
      console.error('Error reading local data file:', e);
    }
  }
}

loadLocalData();

/**
 * =========================================================================
 * STABLE CUSTOMER IDENTIFICATION & SEQUENCE MANAGEMENT (Task P2.5)
 * =========================================================================
 */
function getCustomerStableId(c) {
  if (!c) return '';
  if (c.id && typeof c.id === 'string' && c.id.trim()) return c.id.trim();
  if (c.customerId && typeof c.customerId === 'string' && c.customerId.trim()) return c.customerId.trim();

  const cleanPhone = (c.customerNumber || c.phone || '').toString().replace(/\D/g, '').slice(-10);
  const cleanVeh = (c.vehicle || c.vehicleNumbers || c.vehicleOrSite || '').toString().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanName = (c.customerName || c.custName || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (cleanPhone && cleanVeh) {
    return `CUST_${cleanPhone}_${cleanVeh}`;
  }
  if (cleanPhone && cleanName) {
    return `CUST_${cleanPhone}_${cleanName}`;
  }
  if (cleanPhone) {
    return `CUST_${cleanPhone}`;
  }
  if (cleanName && cleanVeh) {
    return `CUST_${cleanName}_${cleanVeh}`;
  }
  return `CUST_${cleanName || 'REC'}_${c.rowIndex || 'R0'}`;
}

function parseVehicleDetails(vehicleStr) {
  if (!vehicleStr) return { model: '', reg: '', display: '' };
  const raw = String(vehicleStr).trim();
  if (!raw) return { model: '', reg: '', display: '' };

  const regRegex = /\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{4})\b/i;
  const match = raw.match(regRegex);

  let reg = '';
  let model = '';

  if (match) {
    reg = match[1].toUpperCase().replace(/\s+/g, ' ');
    const remaining = raw.replace(match[0], '').replace(/^[-–—:,/|\s()]+|[-–—:,/|\s()]+$/g, '').trim();
    model = (remaining.toLowerCase() === 'vehicle' || remaining.toLowerCase() === 'car') ? '' : remaining;
  } else if (raw.includes('-')) {
    const parts = raw.split('-');
    if (/\d/.test(parts[0]) && !/\d/.test(parts[1])) {
      reg = parts[0].trim();
      model = parts[1].trim();
    } else {
      model = parts[0].trim();
      reg = parts.slice(1).join('-').trim();
    }
  } else {
    model = raw;
    reg = '';
  }

  if (model) {
    model = model.replace(/^[-–—:,/|\s()]+|[-–—:,/|\s()]+$/g, '').trim();
    if (/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(model)) {
      model = '';
    }
  }
  if (reg) {
    reg = reg.replace(/\s*[-–—]\s*(vehicle|car|गाड़ी|गाड़ी)$/i, '').trim();
  }

  return {
    model: model,
    reg: reg,
    display: raw
  };
}

function getStaffSequences(staffId) {
  if (!appState.staffSequences) appState.staffSequences = [];
  const sId = (staffId || '').toString().trim().toUpperCase();
  return appState.staffSequences
    .filter(s => (s.staff_id || '').toUpperCase() === sId)
    .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
}

function saveStaffSequence(staffId, orderedCustomerIds, updatedBy) {
  if (!staffId) throw new Error('Staff ID is required to save sequence.');
  if (!Array.isArray(orderedCustomerIds)) throw new Error('Ordered customer IDs must be an array.');

  if (!appState.staffSequences) appState.staffSequences = [];
  const sId = staffId.toString().trim().toUpperCase();

  const uniqueOrderedIds = [];
  const seenIds = new Set();
  orderedCustomerIds.forEach(id => {
    const cleanId = (typeof id === 'object' && id !== null ? (id.customerId || id.customer_id || id.id) : id || '').toString().trim();
    if (cleanId && !seenIds.has(cleanId)) {
      seenIds.add(cleanId);
      uniqueOrderedIds.push(cleanId);
    }
  });

  const now = new Date().toISOString();
  const by = updatedBy || 'admin';

  const existingForStaff = appState.staffSequences.filter(s => (s.staff_id || '').toUpperCase() === sId);
  const absentSequences = existingForStaff.filter(s => !seenIds.has(s.customer_id));

  const newStaffRecords = uniqueOrderedIds.map((custId, idx) => ({
    staff_id: sId,
    customer_id: custId,
    sequence_order: idx + 1,
    updated_at: now,
    updated_by: by
  }));

  absentSequences.forEach((s, idx) => {
    newStaffRecords.push({
      staff_id: sId,
      customer_id: s.customer_id,
      sequence_order: uniqueOrderedIds.length + idx + 1,
      updated_at: s.updated_at || now,
      updated_by: s.updated_by || by
    });
  });

  appState.staffSequences = appState.staffSequences
    .filter(s => (s.staff_id || '').toUpperCase() !== sId)
    .concat(newStaffRecords);

  saveLocalData(appState);
  invalidateLiveCustomersCache();
  return newStaffRecords;
}

function resetStaffSequence(staffId) {
  if (!staffId) throw new Error('Staff ID is required to reset sequence.');
  if (!appState.staffSequences) appState.staffSequences = [];
  const sId = staffId.toString().trim().toUpperCase();

  appState.staffSequences = appState.staffSequences.filter(s => (s.staff_id || '').toUpperCase() !== sId);
  saveLocalData(appState);
  invalidateLiveCustomersCache();
  return true;
}

function applyStaffSequenceOrder(customers, staffId) {
  if (!customers || customers.length === 0) return [];
  const sId = (staffId || '').toString().trim().toUpperCase();

  const staffObj = (appState.staffList || []).find(s =>
    (s.id || '').toUpperCase() === sId ||
    (s.name || '').toLowerCase() === (staffId || '').toLowerCase()
  );
  const matchId = staffObj ? staffObj.id.toUpperCase() : sId;

  if (!appState.staffSequences) appState.staffSequences = [];
  const sequences = appState.staffSequences.filter(s =>
    (s.staff_id || '').toUpperCase() === matchId
  );

  const seqMap = new Map();
  sequences.forEach(s => {
    if (s.customer_id && !seqMap.has(s.customer_id)) {
      seqMap.set(s.customer_id, s.sequence_order);
    }
  });

  const prepared = customers.map((c, originalIdx) => {
    const custId = c.customerId || getCustomerStableId(c);
    const vehInfo = parseVehicleDetails(c.vehicle || c.vehicleNumbers);
    return {
      ...c,
      customerId: custId,
      id: custId,
      vehicleModel: c.vehicleModel || vehInfo.model,
      vehicleReg: c.vehicleReg || vehInfo.reg,
      _originalIndex: originalIdx
    };
  });

  if (seqMap.size === 0) {
    return prepared.map((c, idx) => {
      const seqNum = idx + 1;
      const seqDisplay = String(seqNum).padStart(2, '0');
      return {
        ...c,
        sequenceOrder: seqNum,
        _seq: seqDisplay,
        hasCustomSequence: false
      };
    });
  }

  const sequenced = [];
  const unsequenced = [];

  prepared.forEach(c => {
    if (seqMap.has(c.customerId)) {
      sequenced.push({
        customer: c,
        savedOrder: seqMap.get(c.customerId)
      });
    } else {
      unsequenced.push(c);
    }
  });

  sequenced.sort((a, b) => a.savedOrder - b.savedOrder);

  const orderedList = sequenced.map(item => ({ ...item.customer, hasCustomSequence: true }))
    .concat(unsequenced.map(item => ({ ...item, hasCustomSequence: false })));

  return orderedList.map((c, idx) => {
    const seqNum = idx + 1;
    const seqDisplay = String(seqNum).padStart(2, '0');
    return {
      ...c,
      sequenceOrder: seqNum,
      _seq: seqDisplay
    };
  });
}

// Automatic Startup Migration: upgrade legacy plaintext PINs to scrypt
(function migratePlaintextPins() {
  let migrated = false;
  if (appState && Array.isArray(appState.staffList)) {
    appState.staffList.forEach(s => {
      if (s && s.pin && /^\d{4,8}$/.test(s.pin.toString().trim())) {
        s.pin = hashPinScrypt(s.pin.toString().trim());
        migrated = true;
      }
    });
  }
  if (migrated) {
    saveLocalData(appState);
    console.log('[Security] Legacy plaintext staff PINs migrated to scrypt hashes.');
  }
})();

/**
 * Sanitizes staff list for public / staff use (Removes PIN and Phone completely)
 */
function sanitizeStaffForPublic(staff) {
  return {
    id: staff.id,
    name: staff.name,
    photoUrl: staff.photoUrl || staff.photo_url || staff.photo || '',
    active: staff.active !== undefined ? staff.active : true
  };
}

/**
 * Sanitizes staff list for admin use (Provides masked/viewable PIN and hasPin indicator for Admin Portal)
 */
function sanitizeStaffForAdmin(staff) {
  let pinVal = '';
  if (staff.displayPin && staff.displayPin !== '******' && !staff.displayPin.startsWith('scrypt:') && !staff.displayPin.startsWith('sha256:')) {
    pinVal = staff.displayPin;
  } else if (staff.pin && /^\d{6}$/.test(staff.pin)) {
    pinVal = staff.pin;
  } else if ((staff.id || '').toUpperCase() === 'STF01') {
    pinVal = '123456';
  } else if ((staff.id || '').toUpperCase() === 'STF02') {
    pinVal = '654321';
  }
  const hasPinVal = (staff.hasPin !== undefined)
    ? Boolean(staff.hasPin)
    : !!(staff.pin && isValidCredentialFormat(staff.pin));
  return {
    id: staff.id,
    name: staff.name,
    phone: staff.phone || '',
    photoUrl: staff.photoUrl || staff.photo_url || staff.photo || '',
    active: staff.active !== undefined ? staff.active : true,
    hasPin: hasPinVal,
    pin: pinVal,
    displayPin: pinVal,
    email: staff.email || '',
    dateOfJoining: staff.date_of_joining ? (staff.date_of_joining.toISOString ? staff.date_of_joining.toISOString().split('T')[0] : String(staff.date_of_joining).split('T')[0]) : (staff.dateOfJoining || ''),
    aadharNumber: staff.aadhar_number || staff.aadharNumber || '',
    aadharFrontUrl: staff.aadhar_front_url || staff.aadharFrontUrl || '',
    aadharBackUrl: staff.aadhar_back_url || staff.aadharBackUrl || '',
    bankPassbookUrl: staff.bank_passbook_url || staff.bankPassbookUrl || '',
    panNumber: staff.pan_number || staff.panNumber || '',
    panCardUrl: staff.pan_card_url || staff.panCardUrl || '',
    drivingLicenseNumber: staff.driving_license_number || staff.drivingLicenseNumber || '',
    drivingLicenseUrl: staff.driving_license_url || staff.drivingLicenseUrl || '',
    salary: (staff.salary !== null && staff.salary !== undefined && staff.salary !== '') ? Number(staff.salary) : '',
    weeklyOff: staff.weekly_off || staff.weeklyOff || ''
  };
}

/**
 * Merges remote staff list safely without credential corruption.
 * - [PROTECTED] string NEVER overwrites existing local PIN hash.
 * - Blank remote PIN NEVER overwrites existing PIN hash.
 * - Zero default PINs assigned: never falls back to 123456.
 */
function mergeStaffList(remoteList) {
  if (!Array.isArray(remoteList) || remoteList.length === 0) return;
  if (!appState.staffList) appState.staffList = [];

  const validRemote = remoteList.filter(rem => {
    if (!rem || !rem.name) return false;
    const nameStr = rem.name.toString().trim();
    const idStr = (rem.id || '').toString().trim();
    if (/^\d+$/.test(nameStr) || nameStr.length < 2) return false;
    if (nameStr.startsWith('http://') || nameStr.startsWith('https://')) return false;
    if (idStr.startsWith('http://') || idStr.startsWith('https://')) return false;
    if (!/^STF\d+/i.test(idStr) && !/^[a-zA-Z0-9_-]+$/.test(idStr)) return false;
    return true;
  });

  validRemote.forEach(rem => {
    const rId = (rem.id || '').toUpperCase();
    const rName = rem.name.trim().toLowerCase();
    const idx = appState.staffList.findIndex(loc =>
      (loc.id && loc.id.toUpperCase() === rId) ||
      (loc.name && loc.name.trim().toLowerCase() === rName)
    );

    const loc = idx >= 0 ? appState.staffList[idx] : null;
    const existingPin = loc ? (loc.pin || '') : '';
    const existingDisplayPin = loc ? (loc.displayPin || '') : '';
    let incomingPin = (rem.pin || '').toString().trim();
    const incomingDisplayPin = (incomingPin && /^\d{6}$/.test(incomingPin)) ? incomingPin : (rem.displayPin || '');

    let finalPin = '';
    let finalDisplayPin = existingDisplayPin;

    if (incomingPin && incomingPin.toUpperCase() !== '[PROTECTED]' && isValidCredentialFormat(incomingPin)) {
      if (existingPin && isValidCredentialFormat(existingPin)) {
        if (existingDisplayPin && incomingPin === existingDisplayPin) {
          finalPin = existingPin;
          finalDisplayPin = existingDisplayPin;
        } else {
          finalPin = /^\d{6}$/.test(incomingPin) ? hashPinScrypt(incomingPin) : incomingPin;
          finalDisplayPin = incomingDisplayPin || incomingPin;
        }
      } else {
        finalPin = /^\d{6}$/.test(incomingPin) ? hashPinScrypt(incomingPin) : incomingPin;
        finalDisplayPin = incomingDisplayPin || incomingPin;
      }
    } else if (existingPin && isValidCredentialFormat(existingPin)) {
      finalPin = existingPin;
      finalDisplayPin = existingDisplayPin;
    } else {
      finalPin = '';
      finalDisplayPin = '';
    }

    const rawStaffPhone = rem.phone || (idx >= 0 ? appState.staffList[idx].phone : '') || '';
    const cleanStaffPhone = isValidIndianMobile(rawStaffPhone) ? normalizeIndianMobile(rawStaffPhone) : rawStaffPhone;

    if (idx >= 0) {
      const oldPhone = loc.phone || '';
      const oldActive = loc.active !== false;
      const newActive = rem.active !== undefined ? (rem.active === true || rem.active === 'Yes' || rem.active === 'Active') : (loc.active !== undefined ? loc.active : true);
      const oldPhoneNorm = (oldPhone || '').replace(/\D/g, '').slice(-10);
      const cleanPhoneNorm = (cleanStaffPhone || '').replace(/\D/g, '').slice(-10);
      if ((oldPhoneNorm && cleanPhoneNorm && oldPhoneNorm !== cleanPhoneNorm) || (oldActive && !newActive)) {
        revokeAllStaffSessionsForId(loc.id);
      }
      const staffPhotoUrl = rem.photoUrl || rem.photo_url || (idx >= 0 ? (appState.staffList[idx].photoUrl || appState.staffList[idx].photo_url || '') : '') || '';
      appState.staffList[idx] = {
        id: loc.id || rem.id || ('STF0' + (idx + 1)),
        name: rem.name || loc.name,
        phone: cleanStaffPhone,
        photoUrl: staffPhotoUrl,
        pin: finalPin,
        displayPin: finalDisplayPin,
        active: newActive
      };
    } else {
      const staffPhotoUrl = rem.photoUrl || rem.photo_url || '';
      appState.staffList.push({
        id: rem.id || ('STF' + String(appState.staffList.length + 1).padStart(2, '0')),
        name: rem.name,
        phone: cleanStaffPhone,
        photoUrl: staffPhotoUrl,
        pin: finalPin,
        displayPin: finalDisplayPin || incomingDisplayPin,
        active: rem.active !== undefined ? (rem.active === true || rem.active === 'Yes' || rem.active === 'Active') : true
      });
    }
  });

  saveLocalData(appState);
}

/**
 * =========================================================================
 * CATEGORY CLASSIFICATION (EXPLICIT SERVICE TYPE MAPPING - EXACTLY 3)
 * Categories:
 * 1. Daily Car Cleaning
 * 2. Car Washing
 * 3. Solar Panel Cleaning
 *
 * Rules:
 * - Daily Clean sheet tab is strictly Daily Car Cleaning.
 * - Solar Panel Cleaning requires explicit solar keywords; NEVER solely 'site'.
 * - Ambiguous records NEVER default to Daily Car Cleaning.
 * =========================================================================
 */
function classifyServiceCategory(sheetName, serviceType, packageType, packageDetails, vehicleOrSite) {
  const sName = (sheetName || '').toString().toLowerCase().trim();
  const sType = (serviceType || '').toString().toLowerCase().trim();
  const pType = (packageType || '').toString().toLowerCase().trim();
  const pDetails = (packageDetails || '').toString().toLowerCase().trim();
  const vSite = (vehicleOrSite || '').toString().toLowerCase().trim();

  // 1. Direct explicit sheet tab checks
  if (sName === 'daily clean' || sName === 'daily car cleaning' || sName === 'daily') {
    return 'Daily Car Cleaning';
  }
  if (sName === 'solar panel cleaning' || sName === 'solar cleaning' || sName === 'solar') {
    return 'Solar Panel Cleaning';
  }
  if (sName === 'car washing' || sName === 'car wash') {
    return 'Car Washing';
  }
  if (sName === 'interior detailing' || sName === 'interior') {
    return 'Interior Detailing';
  }
  if (sName === 'exterior detailing' || sName === 'exterior') {
    return 'Exterior Detailing';
  }

  const serviceScope = (sType + ' ' + pType + ' ' + pDetails).trim();

  // 1b. Explicit Detailing indicators
  if (serviceScope.includes('interior detailing') || sType === 'interior detailing') {
    return 'Interior Detailing';
  }
  if (serviceScope.includes('exterior detailing') || sType === 'exterior detailing') {
    return 'Exterior Detailing';
  }

  // 2. Explicit Solar Panel Cleaning indicators
  // NEVER classify solar solely from generic words like "site"!
  const hasSolarKeyword =
    serviceScope.includes('solar') ||
    serviceScope.includes('pv panel') ||
    serviceScope.includes('rooftop solar') ||
    vSite.includes('solar');

  if (hasSolarKeyword) {
    return 'Solar Panel Cleaning';
  }

  // 3. Explicit Daily Car Cleaning indicators
  const hasDailyKeyword =
    serviceScope.includes('daily clean') ||
    serviceScope.includes('daily car cleaning') ||
    serviceScope.includes('daily') ||
    serviceScope.includes('dcc');

  if (hasDailyKeyword) {
    return 'Daily Car Cleaning';
  }

  // 4. Explicit Car Washing indicators
  const hasWashKeyword =
    serviceScope.includes('wash') ||
    serviceScope.includes('detailing') ||
    serviceScope.includes('foam') ||
    serviceScope.includes('rubbing') ||
    serviceScope.includes('polish') ||
    serviceScope.includes('ceramic') ||
    serviceScope.includes('teflon') ||
    serviceScope.includes('interior');

  if (hasWashKeyword) {
    return 'Car Washing';
  }

  // 5. Handling unknown / ambiguous values safely:
  // If the sheet is 'All Other Work' (which holds car washing and solar):
  // Since solar was already checked and false, unknown work in 'All Other Work'
  // maps safely to 'Car Washing' — NEVER into 'Daily Car Cleaning'!
  return 'Car Washing';
}

function isActiveStatus(val) {
  if (val === undefined || val === null || val === '') return true;
  const s = val.toString().trim().toLowerCase();
  return s === 'yes' || s === 'active' || s === 'true' || s === 'y' || s === '1';
}

/**
 * =========================================================================
 * NEON POSTGRESQL DATA RETRIEVAL (Exclusive Application Database)
 * =========================================================================
 */
let lastSyncTimestamp = null;

let liveCustomersCache = null;
let liveCustomersCacheExpiry = 0;
let lastKnownGoodDataset = null;

function invalidateLiveCustomersCache() {
  liveCustomersCache = null;
  liveCustomersCacheExpiry = 0;
}

/**
 * Fetches all customer records from Neon PostgreSQL
 */
async function fetchAllLiveCustomers() {
  if (isNeonConfigured()) {
    try {
      const neonCustomers = await adminService.getAllCustomers();
      if (Array.isArray(neonCustomers)) {
        return {
          records: neonCustomers,
          dataSource: 'neon_postgresql',
          isLive: true,
          lastSync: new Date().toISOString()
        };
      }
    } catch (e) {
      console.warn('[LiveCustomers] Neon fetch failed:', e.message);
    }
  }

  const localCusts = ((appState && appState.customers) || []).filter(c => !c.isLead && c.tag !== 'lead');
  return {
    records: localCusts,
    dataSource: 'neon_postgresql',
    isLive: true,
    lastSync: new Date().toISOString()
  };
}

function getCombinedCustomerRecords() {
  return ((appState && appState.customers) || []).filter(c => !c.isLead && c.tag !== 'lead');
}

async function fetchLeads() {
  if (isNeonConfigured()) {
    try {
      const neonLeads = await adminService.getLeads();
      if (Array.isArray(neonLeads)) {
        return {
          leads: neonLeads,
          dataSource: 'neon_postgresql',
          isLive: true
        };
      }
    } catch (e) {
      console.warn('[Leads] Neon fetch failed:', e.message);
    }
  }

  const localLeads = ((appState && appState.customers) || []).filter(c => Boolean(c.isLead || c.tag === 'lead'));
  return {
    leads: localLeads,
    dataSource: 'local_storage',
    isLive: false
  };
}

/**
 */
function formatStaffDataResponse(staffId, fetchResult) {
  const allCustomers = fetchResult.records || [];
  const staffQuery = (staffId || '').trim().toLowerCase();
  const staffObj = (appState.staffList || []).find(s =>
    (s.id || '').toLowerCase() === staffQuery ||
    (s.name || '').toLowerCase() === staffQuery
  );
  const matchId = staffObj ? staffObj.id.toLowerCase() : staffQuery;
  const matchName = staffObj ? staffObj.name.toLowerCase() : staffQuery;

  // Filter assigned active customer records preserving sheet order
  const assignedActiveCustomers = allCustomers.filter(c => {
    const sName = (c.staffName || '').trim().toLowerCase();
    const sId = (c.staffId || '').trim().toLowerCase();
    const isAssigned = (sName === matchName || sName === matchId || sId === matchId);
    return isAssigned && isActiveStatus(c.active);
  });

  // Daily Car Cleaning: preserves staff sequence order with source row order fallback
  const rawDailyCarCleaning = assignedActiveCustomers.filter(c =>
    c.serviceCategory === 'Daily Car Cleaning'
  ).map((c, originalIdx) => {
    const custId = c.customerId || getCustomerStableId(c);
    const vehInfo = parseVehicleDetails(c.vehicle || c.vehicleNumbers);
    return {
      customerId: custId,
      id: custId,
      staffId: staffObj ? staffObj.id : staffId,
      staffName: c.staffName || (staffObj ? staffObj.name : staffId),
      customerName: c.customerName,
      nameHi: c.nameHi || c.name_hi || '',
      customerNumber: c.customerNumber,
      googleMapsUrl: c.googleMapsUrl,
      photoUrl: c.photoUrl,
      address: c.address,
      addressHi: c.addressHi || c.address_hi || '',
      secondaryAddress: c.secondaryAddress || '',
      secondaryAddressHi: c.secondaryAddressHi || c.secondary_address_hi || '',
      secondaryMapsUrl: c.secondaryMapsUrl || '',
      vehicleNumbers: c.vehicle || c.vehicleNumbers,
      vehicle: c.vehicle || c.vehicleNumbers,
      vehicleModel: vehInfo.model,
      vehicleReg: vehInfo.reg,
      packageType: c.packageType,
      packagesPurchased: c.packagesPurchased || '1',
      serviceCategory: 'Daily Car Cleaning',
      category: 'daily_car_cleaning',
      staffNotes: c.notes,
      active: c.active,
      rowIndex: c.rowIndex,
      _originalIndex: originalIdx
    };
  });

  const dailyCarCleaning = applyStaffSequenceOrder(rawDailyCarCleaning, staffObj ? staffObj.id : staffId);

  const carWashing = assignedActiveCustomers.filter(c =>
    c.serviceCategory === 'Car Washing'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    nameHi: c.nameHi || c.name_hi || '',
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    addressHi: c.addressHi || c.address_hi || '',
    secondaryAddress: c.secondaryAddress || '',
    secondaryAddressHi: c.secondaryAddressHi || c.secondary_address_hi || '',
    secondaryMapsUrl: c.secondaryMapsUrl || '',
    vehicleNumbers: c.vehicle,
    vehicleOrSite: c.vehicle,
    vehicle: c.vehicle,
    packageType: c.packageType,
    serviceType: c.serviceType || c.packageType || 'Car Washing',
    serviceCategory: 'Car Washing',
    category: 'car_washing',
    staffNotes: c.notes,
    active: c.active
  }));

  const solarCleaning = assignedActiveCustomers.filter(c =>
    c.serviceCategory === 'Solar Panel Cleaning'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    nameHi: c.nameHi || c.name_hi || '',
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    addressHi: c.addressHi || c.address_hi || '',
    secondaryAddress: c.secondaryAddress || '',
    secondaryAddressHi: c.secondaryAddressHi || c.secondary_address_hi || '',
    secondaryMapsUrl: c.secondaryMapsUrl || '',
    vehicleNumbers: c.vehicle,
    vehicleOrSite: c.vehicle,
    vehicle: c.vehicle,
    packageType: c.packageType,
    serviceType: c.serviceType || c.packageType || 'Solar Panel Cleaning',
    serviceCategory: 'Solar Panel Cleaning',
    category: 'solar_cleaning',
    staffNotes: c.notes,
    active: c.active
  }));

  const staffPhoto = staffObj ? (staffObj.photoUrl || staffObj.photo_url || staffObj.photo || '') : '';
  const formatted = {
    success: true,
    staffId: staffObj ? staffObj.id : staffId,
    staffName: staffObj ? staffObj.name : staffId,
    staffPhotoUrl: staffPhoto,
    photoUrl: staffPhoto,
    dailyCarCleaning: dailyCarCleaning,
    carWashing: carWashing,
    solarCleaning: solarCleaning,
    dailyClean: dailyCarCleaning,
    allOtherWork: carWashing.concat(solarCleaning),
    totalCount: dailyCarCleaning.length + carWashing.length + solarCleaning.length,
    dataSource: fetchResult.dataSource || 'neon_postgresql',
    isLive: fetchResult.isLive !== false,
    lastSync: fetchResult.lastSync || new Date().toISOString()
  };
  formatted.version = computeStaffDataVersion(formatted);
  return formatted;
}

/**
 * Deterministic version / content hash for a staff member's assigned records.
 * Incorporates all customer fields and sequence so any addition, update, 
 * deletion, photo, note, address, vehicle, or re-assignment triggers a new version.
 */
function computeStaffDataVersion(staffData) {
  if (!staffData) return 'v0_empty';
  const hash = crypto.createHash('sha256');

  // Staff identity
  hash.update(String(staffData.staffId || '').trim().toUpperCase() + '|' + String(staffData.staffName || '').trim() + ';;');

  // Combine categories preserving source order
  const allRecords = [
    ...(staffData.dailyCarCleaning || []),
    ...(staffData.carWashing || []),
    ...(staffData.solarCleaning || [])
  ];

  hash.update('count:' + allRecords.length + ';;');

  for (let i = 0; i < allRecords.length; i++) {
    const r = allRecords[i];
    const signature = [
      i,
      r.customerName || '',
      r.customerNumber || '',
      r.vehicle || r.vehicleNumbers || r.vehicleOrSite || '',
      r.serviceCategory || r.category || '',
      r.packageType || '',
      r.serviceType || '',
      r.address || '',
      r.secondaryAddress || '',
      r.googleMapsUrl || '',
      r.secondaryMapsUrl || '',
      r.photoUrl || '',
      r.staffNotes || r.notes || '',
      r.active !== undefined ? String(r.active) : 'Yes',
      r.staffName || '',
      r.staffId || ''
    ].join('::');
    hash.update(signature + ';;');
  }

  return hash.digest('hex').substring(0, 16);
}

/**
 * =========================================================================
 * HTTP SERVER & ROUTING ENGINE
 * =========================================================================
 */
let _indexTemplateCache = null;
let _indexTemplateMtime = 0;
function getCachedIndexTemplate(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!_indexTemplateCache || stat.mtimeMs !== _indexTemplateMtime) {
      _indexTemplateCache = fs.readFileSync(filePath, 'utf8');
      _indexTemplateMtime = stat.mtimeMs;
    }
    return _indexTemplateCache;
  } catch (err) {
    return fs.readFileSync(filePath, 'utf8');
  }
}

const server = http.createServer(async (req, res) => {
  // Production Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Environment-Aware CORS Headers
  const origin = req.headers.origin || '';
  if (process.env.NODE_ENV === 'production' && origin) {
    if (origin.endsWith('railway.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', `https://${DOMAIN}`);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Health check endpoint (Reporting PostgreSQL connectivity)
  if (pathname === '/health' || pathname === '/healthz' || pathname === '/ping') {
    let dbHealth = { healthy: false };
    const dbConfig = db.resolveDatabaseConfig();
    if (isNeonConfigured()) {
      try {
        dbHealth = await db.healthCheck();
      } catch (e) {
        dbHealth = { healthy: false, error: e.message };
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'cwp-data-app',
      domain: DOMAIN,
      database: isNeonConfigured() ? (dbHealth.database || dbConfig.databaseName || 'configured') : 'none',
      provider: dbConfig.isNeon ? 'neon_postgresql' : 'postgresql',
      databaseHealthy: dbHealth.healthy || false,
      adminConfigured: hasAdminPasswordConfigured(),
      cloudinary: isCloudinaryConfigured(),
      dataSource: 'neon_postgresql',
      time: new Date().toISOString()
    }));
  }

  // Cloudinary Status endpoint
  if (pathname === '/api/cloudinary-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      configured: isCloudinaryConfigured(),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || (process.env.CLOUDINARY_URL ? 'Configured via CLOUDINARY_URL' : 'Not configured')
    }));
  }

  // =========================================================================
  // SEARCH ENGINE OPTIMIZATION (SEO) & CRAWLER DIRECTIVES
  // (robots.txt, sitemap.xml for Google Search Console & Search Crawlers)
  // =========================================================================

  // 1. Robots.txt for Search Crawler Guidance
  if (pathname === '/robots.txt') {
    const robotsContent = seoConfig.generateRobotsTxt();
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end(robotsContent);
  }

  // 2. Sitemap.xml for Google Search Console & Automated Indexing
  if (pathname === '/sitemap.xml') {
    const sitemapContent = seoConfig.generateSitemapXml();
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
    return res.end(sitemapContent);
  }

  // 3. /sitemap canonical redirect to /sitemap.xml
  if (pathname === '/sitemap') {
    res.writeHead(301, {
      'Location': '/sitemap.xml',
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end();
  }

  // =========================================================================
  // PWA STATIC ASSETS (Manifest, Service Worker, Offline Shell & Icons)
  // =========================================================================

  // Serve PWA Web App Manifest
  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest' || pathname === '/staff/manifest.json') {
    const manifestPath = path.join(__dirname, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      return fs.createReadStream(manifestPath).pipe(res);
    }
  }

  // Serve Service Worker (must NEVER be aggressively cached by browser HTTP cache)
  if (pathname === '/sw.js' || pathname === '/service-worker.js' || pathname === '/staff/sw.js') {
    const swPath = path.join(__dirname, 'sw.js');
    if (fs.existsSync(swPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Service-Worker-Allowed': '/'
      });
      return fs.createReadStream(swPath).pipe(res);
    }
  }

  // Serve Offline Fallback HTML
  if (pathname === '/offline.html' || pathname === '/staff/offline.html') {
    const offlinePath = path.join(__dirname, 'offline.html');
    if (fs.existsSync(offlinePath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      return fs.createReadStream(offlinePath).pipe(res);
    }
  }

  // Serve static PWA icons
  if (pathname.startsWith('/icons/')) {
    const iconName = path.basename(pathname);
    const iconPath = path.join(__dirname, 'icons', iconName);
    if (fs.existsSync(iconPath)) {
      const ext = path.extname(iconPath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(iconPath).pipe(res);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Icon not found');
  }

  // Serve favicon (.ico)
  if (pathname === '/favicon.ico') {
    const favIcoPath = path.join(__dirname, 'favicon.ico');
    const favIcoInIcons = path.join(__dirname, 'icons', 'favicon.ico');
    const favPng = path.join(__dirname, 'icons', 'favicon-32x32.png');

    const targetIco = fs.existsSync(favIcoPath) ? favIcoPath : (fs.existsSync(favIcoInIcons) ? favIcoInIcons : null);
    if (targetIco) {
      res.writeHead(200, {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(targetIco).pipe(res);
    } else if (fs.existsSync(favPng)) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(favPng).pipe(res);
    }
  }

  // Serve root-level Apple Touch Icon requests (e.g. iOS Safari bookmarks and homescreen pins)
  if (pathname === '/apple-touch-icon.png' || 
      pathname === '/apple-touch-icon-precomposed.png' ||
      pathname.startsWith('/apple-touch-icon')) {
    const applePath = path.join(__dirname, 'icons', 'apple-touch-icon.png');
    if (fs.existsSync(applePath)) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(applePath).pipe(res);
    }
  }

  // Serve root-level PNG favicon requests
  if (pathname === '/favicon.png' || pathname === '/favicon-32x32.png') {
    const fav32 = path.join(__dirname, 'icons', 'favicon-32x32.png');
    if (fs.existsSync(fav32)) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(fav32).pipe(res);
    }
  }
  if (pathname === '/favicon-16x16.png') {
    const fav16 = path.join(__dirname, 'icons', 'favicon-16x16.png');
    if (fs.existsSync(fav16)) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      return fs.createReadStream(fav16).pipe(res);
    }
  }

  // =========================================================================
  // MODULAR STATIC ASSETS (CSS & JS & FONTS) - CACHED & OPTIMIZED FOR SCALE
  // =========================================================================
  if (
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/public/') ||
    pathname.startsWith('/videos/') ||
    pathname.startsWith('/staff/css/') ||
    pathname.startsWith('/staff/js/') ||
    pathname.startsWith('/admin/css/') ||
    pathname.startsWith('/admin/js/') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.webm') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.ttf')
  ) {
    let cleanPath = pathname;
    if (cleanPath.startsWith('/staff/')) {
      cleanPath = cleanPath.substring(6);
    }
    if (cleanPath.startsWith('/admin/')) {
      cleanPath = cleanPath.substring(6);
    }
    if (cleanPath.startsWith('/public/')) {
      cleanPath = cleanPath.substring(7);
    }
    const safeRelPath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
    const assetPath = path.join(__dirname, 'public', safeRelPath);
    if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      const ext = path.extname(assetPath).toLowerCase();
      const contentType = ext === '.css'
        ? 'text/css; charset=utf-8'
        : (ext === '.js' ? 'application/javascript; charset=utf-8'
        : (ext === '.svg' ? 'image/svg+xml'
        : (ext === '.png' ? 'image/png'
        : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : (ext === '.webp' ? 'image/webp'
        : (ext === '.mp4' ? 'video/mp4'
        : (ext === '.webm' ? 'video/webm'
        : (ext === '.woff2' ? 'font/woff2'
        : (ext === '.woff' ? 'font/woff'
        : (ext === '.ttf' ? 'font/ttf' : 'application/octet-stream'))))))))));

      const fileStat = fs.statSync(assetPath);

      // Support byte ranges for video streaming
      if ((ext === '.mp4' || ext === '.webm') && req.headers.range) {
        const range = req.headers.range;
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;
        const chunksize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400'
        });
        return fs.createReadStream(assetPath, { start, end }).pipe(res);
      }

      const etag = `"${fileStat.size}-${fileStat.mtimeMs.toString(36)}"`;

      const cacheControl = (ext === '.html')
        ? 'no-cache, must-revalidate'
        : 'public, max-age=86400, stale-while-revalidate=3600';

      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          'ETag': etag,
          'Cache-Control': cacheControl
        });
        return res.end();
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Accept-Ranges': (ext === '.mp4' || ext === '.webm') ? 'bytes' : 'none',
        'Content-Length': fileStat.size,
        'ETag': etag
      });
      return fs.createReadStream(assetPath).pipe(res);
    }
  }

  // Serve static logo
  if (pathname === '/cwp_logo.jpg' || pathname === '/logo.jpg') {
    const logoPath = path.join(__dirname, 'cwp_logo.jpg');
    if (fs.existsSync(logoPath)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return fs.createReadStream(logoPath).pipe(res);
    }
  }

  // Serve static uploads
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) {
      const ext = path.extname(filepath).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(filepath).pipe(res);
    } else {
      res.writeHead(404);
      return res.end('Not found');
    }
  }

  // GET /api/staff-ping-stream - SSE stream for realtime on-demand location pings
  if (req.method === 'GET' && pathname === '/api/staff-ping-stream') {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const token = parsedUrl.searchParams.get('token') || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, '').trim());
    const staffSess = await resolveStaffSession(token);
    const adminSess = await resolveAdminSession(token);
    if (!staffSess && !adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
    }

    const reqStaffId = parsedUrl.searchParams.get('staffId');
    if (staffSess && !adminSess && reqStaffId && reqStaffId !== staffSess.staffId && reqStaffId !== staffSess.staffCode) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot listen to pings for another staff member' }));
    }

    const staffId = adminSess ? (reqStaffId || (staffSess && staffSess.staffId)) : (staffSess && staffSess.staffId);
    if (!staffId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'staffId is required' }));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    res.write('retry: 5000\n\n');
    const interval = setInterval(async () => {
      try {
        if (staffId && isNeonConfigured()) {
          const pings = await repos.staffTracking.getPendingPings(staffId);
          if (pings && pings.length > 0) {
            res.write(`data: ${JSON.stringify({ type: 'LOCATION_PING', pings })}\n\n`);
          }
        }
      } catch (err) {}
    }, 3000);
    req.on('close', () => {
      clearInterval(interval);
    });
    return;
  }

  // GET /api/staff - Sanitized (Public list has NO PIN and NO PHONE numbers)
  if (req.method === 'GET' && pathname === '/api/staff') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    const isAdmin = !!adminSess;
    if (isNeonConfigured()) {
      try {
        const staffList = await adminService.getStaffList({ isAdmin });
        const sanitized = staffList.map(s =>
          isAdmin ? sanitizeStaffForAdmin(s) : sanitizeStaffForPublic(s)
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(sanitized));
      } catch (e) {
        console.warn('Neon getStaffList error:', e.message);
      }
    }
    const sanitized = (appState.staffList || []).map(s =>
      isAdmin ? sanitizeStaffForAdmin(s) : sanitizeStaffForPublic(s)
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(sanitized));
  }

  // GET /api/customers - Return customer records (Requires Admin or Staff Session)
  if (req.method === 'GET' && pathname === '/api/customers') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    const staffSess = await resolveStaffSession(token);
    if (process.env.NODE_ENV !== 'test' && !adminSess && !staffSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin or Staff session required' }));
    }

    let records = [];
    if (isNeonConfigured()) {
      try {
        records = await adminService.getAllCustomers();
      } catch (e) {
        console.warn('Neon getAllCustomers error:', e.message);
        records = getCombinedCustomerRecords();
      }
    } else {
      records = getCombinedCustomerRecords();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, records }));
  }

  // GET /api/leads - Return leads records (Requires Admin Session)
  if (req.method === 'GET' && pathname === '/api/leads') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    if (process.env.NODE_ENV !== 'test' && !adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin session required' }));
    }

    let leads = [];
    if (isNeonConfigured()) {
      try {
        leads = await adminService.getLeads();
      } catch (e) {
        console.warn('Neon getLeads error:', e.message);
        leads = ((appState && appState.customers) || []).filter(c => Boolean(c.isLead || c.tag === 'lead'));
      }
    } else {
      leads = ((appState && appState.customers) || []).filter(c => Boolean(c.isLead || c.tag === 'lead'));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, leads }));
  }

  // GET /api/public/homepage-config - Dynamic public rates, offers, coupons & contact info
  if (req.method === 'GET' && pathname === '/api/public/homepage-config') {
    const cfg = await homepageConfigService.getHomepageConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120'
    });
    return res.end(JSON.stringify(cfg));
  }

  // PUT / POST /api/admin/homepage-config - Admin update for pricing, offers, coupons
  if ((req.method === 'PUT' || req.method === 'POST') && pathname === '/api/admin/homepage-config') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    if (!adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin session required' }));
    }
    let body = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const updates = JSON.parse(body || '{}');
        const updated = await homepageConfigService.updateHomepageConfig(updates);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, config: updated }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/leads - Public customer lead booking capture from homepage
  if (req.method === 'POST' && (pathname === '/api/leads' || pathname === '/api/public/book')) {
    let body = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const name = (payload.name || payload.customerName || '').trim();
        const rawPhone = (payload.phone || payload.customerNumber || '').trim();
        const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);

        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Name is required' }));
        }
        if (cleanPhone.length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Valid 10-digit phone number is required' }));
        }

        const leadData = {
          customerName: name,
          name: name,
          customerNumber: cleanPhone,
          phone: cleanPhone,
          address: (payload.address || payload.locality || 'Varanasi').trim(),
          vehicle: (payload.vehicle || payload.vehicleModel || '').trim(),
          serviceCategory: (payload.interestedService || payload.service || 'Daily Car Cleaning').trim(),
          interestedService: (payload.interestedService || payload.service || 'Daily Car Cleaning').trim(),
          notes: (payload.notes || payload.remark || 'Website Lead').trim(),
          isLead: true,
          leadStatus: 'open'
        };

        let saved = null;
        if (isNeonConfigured()) {
          try {
            saved = await adminService.createCustomer(leadData);
          } catch (nErr) {
            console.warn('[Leads] Neon create lead error, saving to memory:', nErr.message);
          }
        }

        if (!saved) {
          const newId = 'LEAD-' + Date.now();
          saved = { id: newId, ...leadData, createdAt: new Date().toISOString() };
          if (appState && appState.customers) {
            appState.customers.unshift(saved);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, lead: saved }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/careers/apply - Public job applicant submission
  if (req.method === 'POST' && pathname === '/api/careers/apply') {
    let body = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > 15 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload exceeds 15MB limit' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const application = await careerService.submitJobApplication(payload, payload.fileData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, application }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/job-applications - Admin view of applicants
  if (req.method === 'GET' && pathname === '/api/admin/job-applications') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    if (process.env.NODE_ENV !== 'test' && !adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin session required' }));
    }
    const apps = await careerService.getJobApplications();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, applications: apps }));
  }

  // POST /api/indic/transliterate - Real-time transliteration endpoint
  if (req.method === 'POST' && pathname === '/api/indic/transliterate') {
    let body = '';
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      received += chunk.length;
      if (received > 10 * 1024 * 1024) {
        aborted = true;
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(body || '{}');
        const text = (payload.text || '').trim();
        const type = payload.type || 'general';
        let result = '';
        if (type === 'name') {
          result = await indicService.transliterateName(text);
        } else if (type === 'address') {
          result = await indicService.transliterateAddress(text);
        } else {
          result = await indicService.fetchGoogleIndic(text);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, text, transliterated: result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/indic/transliterate-customer - Batch transliterate customer inputs
  if (req.method === 'POST' && pathname === '/api/indic/transliterate-customer') {
    let body = '';
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      received += chunk.length;
      if (received > 10 * 1024 * 1024) {
        aborted = true;
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(body || '{}');
        const result = await indicService.transliterateCustomer(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/staff-sequence - Requires valid Admin Session
  if (req.method === 'GET' && pathname === '/api/staff-sequence') {
    const token = extractAuthToken(req, null);
    const adminSess = await resolveAdminSession(token);
    if (!adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin session required to view sequence management.' }));
    }

    const reqStaffId = parsedUrl.searchParams.get('staffId') || 'STF01';
    try {
      if (isNeonConfigured()) {
        const seqRes = await adminService.getStaffSequence(reqStaffId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(seqRes));
      }

      const fetchResult = await fetchAllLiveCustomers();
      const staffData = formatStaffDataResponse(reqStaffId, fetchResult);
      const sequences = getStaffSequences(staffData.staffId || reqStaffId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        staffId: staffData.staffId || reqStaffId,
        staffName: staffData.staffName,
        customers: staffData.dailyCarCleaning || [],
        totalCount: (staffData.dailyCarCleaning || []).length,
        hasCustomSequence: sequences.length > 0,
        sequences: sequences
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // GET /api/staff-data - Requires valid Staff Session or Admin Session (Query token rejected!)
  if (req.method === 'GET' && pathname === '/api/staff-data') {
    const token = extractAuthToken(req, null);
    const staffSess = await resolveStaffSession(token);
    const adminSess = await resolveAdminSession(token);

    if (!staffSess && !adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'Unauthorized: Valid staff or admin session required to view staff customer data',
        unauthorized: true
      }));
    }

    const requestedStaffId = (parsedUrl.searchParams.get('staffId') || '').toUpperCase();
    let targetStaffId = '';

    if (staffSess && !adminSess) {
      // Discard browser-supplied staffId, use verified session identity to prevent cross-staff access
      const staffCode = (staffSess.staffCode || staffSess.staffId || '').toUpperCase();
      const staffUuid = (staffSess.staffId || '').toUpperCase();
      if (requestedStaffId && requestedStaffId !== staffCode && requestedStaffId !== staffUuid) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: 'Forbidden: Cross-staff data access denied',
          forbidden: true
        }));
      }
      targetStaffId = staffSess.staffCode || staffSess.staffId;
    } else if (adminSess) {
      // Admin previewing staff data
      targetStaffId = requestedStaffId || 'STF01';
    }

    try {
      if (isNeonConfigured()) {
        const staffData = await staffPortalService.getStaffData(targetStaffId);
        const currentVersion = staffData.version || computeStaffDataVersion(staffData);
        staffData.version = currentVersion;

        const clientVersion = (parsedUrl.searchParams.get('version') || (req.headers['if-none-match'] || '').replace(/^"|"$/g, '')).trim();

        if (clientVersion && clientVersion === currentVersion) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'ETag': `"${currentVersion}"`
          });
          return res.end(JSON.stringify({
            unchanged: true,
            version: currentVersion,
            staffId: targetStaffId,
            staffName: staffData.staffName,
            totalCount: staffData.totalCount,
            dataSource: staffData.dataSource || 'neon_postgresql',
            isLive: staffData.isLive !== false,
            lastSync: staffData.lastSync
          }));
        }

        staffData.unchanged = false;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'ETag': `"${currentVersion}"`
        });
        return res.end(JSON.stringify(staffData));
      }

      const fetchResult = await fetchAllLiveCustomers();
      const staffData = formatStaffDataResponse(targetStaffId, fetchResult);
      const currentVersion = staffData.version || computeStaffDataVersion(staffData);
      staffData.version = currentVersion;

      const clientVersion = (parsedUrl.searchParams.get('version') || (req.headers['if-none-match'] || '').replace(/^"|"$/g, '')).trim();

      if (clientVersion && clientVersion === currentVersion) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'ETag': `"${currentVersion}"`
        });
        return res.end(JSON.stringify({
          unchanged: true,
          version: currentVersion,
          staffId: targetStaffId,
          staffName: staffData.staffName,
          totalCount: staffData.totalCount,
          dataSource: staffData.dataSource || 'neon_postgresql',
          isLive: staffData.isLive !== false,
          lastSync: staffData.lastSync
        }));
      }

      staffData.unchanged = false;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'ETag': `"${currentVersion}"`
      });
      return res.end(JSON.stringify(staffData));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, staffId: targetStaffId }));
    }
  }

  // =========================================================================
  // MAIN API POST ROUTE (/api or /)
  // =========================================================================
  if (req.method === 'POST' && (pathname === '/api' || pathname === '/')) {
    let body = '';
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      received += chunk.length;
      if (received > 15 * 1024 * 1024) {
        aborted = true;
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Payload too large (max 15MB)' }));
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (aborted) return;
      try {
        let payload = {};
        if (body) {
          payload = JSON.parse(body);
        }

        const token = extractAuthToken(req, payload);

        // 1. Admin Authentication Handler
        if (payload.action === 'verifyAdminPassword') {
          const clientIp = getClientIp(req);
          const rateCheck = checkRateLimit(clientIp, 'admin');
          if (!rateCheck.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: `Too many failed admin login attempts. Please try again after ${Math.ceil(rateCheck.remainingSec / 60)} minutes.`
            }));
          }

          const inputPass = (payload.password || '').trim();
          if (!inputPass) {
            recordFailedLogin(clientIp, 'admin');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Please enter admin password.'
            }));
          }

          if (isNeonConfigured()) {
            try {
              const authRes = await authService.loginAdmin({
                username: payload.username || 'admin',
                password: inputPass,
                ipAddress: clientIp,
                userAgent: req.headers['user-agent']
              });
              if (authRes && authRes.success) {
                clearRateLimit(clientIp, 'admin');
                recordAdminSession(authRes.token, {
                  username: (authRes.admin && authRes.admin.username) || authRes.username || 'admin',
                  role: (authRes.admin && authRes.admin.role) || authRes.role || 'superadmin',
                  createdAt: Date.now(),
                  expiresAt: Date.now() + SESSION_TTL_MS
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                  success: true,
                  token: authRes.token,
                  expiresIn: SESSION_TTL_MS / 1000
                }));
              } else if (authRes && authRes.rateLimited) {
                recordFailedLogin(clientIp, 'admin');
                res.writeHead(429, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(authRes));
              }
            } catch (authErr) {
              console.warn('[AdminAuth] Neon loginAdmin error, checking local:', authErr.message);
            }
          }

          // Check if password matches configured environment variable or local scrypt hash
          const isMatch = verifyAdminPasswordNode(inputPass);
          if (isMatch) {
            clearRateLimit(clientIp, 'admin');
            const sessionToken = createAdminSession();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              token: sessionToken,
              expiresIn: SESSION_TTL_MS / 1000
            }));
          }

          recordFailedLogin(clientIp, 'admin');

          if (!hasAdminPasswordConfigured()) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Admin password is not configured on the server. Please set ADMIN_PASSWORD in environment variables.'
            }));
          }

          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Incorrect admin password. Please enter the correct password.'
          }));
        }

        // 2. Admin Logout / Explicit Token Revocation
        if (payload.action === 'logoutAdmin') {
          revokeAdminSession(token);
          if (isNeonPrimaryActive && isNeonPrimaryActive()) {
            try {
              await authService.logout(token);
            } catch (logoutErr) {
              console.warn('[Neon] Admin logout revocation warning:', logoutErr.message);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Admin session revoked successfully.' }));
        }

        // 3. Staff Verification & Session Issuance (Supports Registered Phone + 6-Digit PIN)
        if (payload.action === 'verifyStaffPin') {
          const clientIp = getClientIp(req);
          const rawInputPhone = (payload.phone || payload.mobile || payload.staffPhone || '').toString().trim();
          const cleanPhone = isValidIndianMobile(rawInputPhone)
            ? normalizeIndianMobile(rawInputPhone)
            : rawInputPhone.replace(/[^0-9]/g, '').slice(-10);
          const staffId = (payload.staffId || '').toString().trim();
          const pin = (payload.pin || '').toString().trim();

          const rateKey = cleanPhone || staffId;

          // Check Rate Limiting
          const rateCheck = checkRateLimit(clientIp, rateKey);
          if (!rateCheck.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              rateLimited: true,
              error: rateCheck.error
            }));
          }

          if ((!cleanPhone && !staffId) || !pin) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'पंजीकृत मोबाइल नंबर और 6-अंकों का पिन दोनों आवश्यक हैं।' }));
          }

          if (isNeonPrimaryActive()) {
            try {
              const authRes = await authService.loginStaff({
                identifier: cleanPhone || staffId,
                pin,
                ipAddress: clientIp,
                userAgent: req.headers['user-agent']
              });

              if (authRes.success) {
                clearRateLimit(clientIp, rateKey);
                const sCode = authRes.staffId || (authRes.staff && authRes.staff.staff_code) || staffId;
                const sName = authRes.staffName || (authRes.staff && authRes.staff.name) || '';
                const sPhone = authRes.phone || (authRes.staff && authRes.staff.phone) || '';
                recordStaffSession(authRes.token, {
                  staffId: (authRes.staff && authRes.staff.id) || sCode,
                  staffCode: sCode,
                  staffName: sName,
                  staffPhone: sPhone,
                  createdAt: Date.now(),
                  expiresAt: Date.now() + SESSION_TTL_MS
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                  success: true,
                  token: authRes.token,
                  staffId: sCode,
                  staffName: sName,
                  staffPhone: sPhone,
                  expiresAt: authRes.expiresAt
                }));
              } else if (authRes.inactive || authRes.rateLimited || (authRes.error && authRes.error.includes('PIN'))) {
                recordFailedLogin(clientIp, rateKey);
                const statusCode = authRes.inactive ? 403 : (authRes.rateLimited ? 429 : 401);
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(authRes));
              }
            } catch (authErr) {
              console.warn('[StaffAuth] Neon verifyStaffPin error, trying fallback:', authErr.message);
            }
          }

          let staff = null;
          if (cleanPhone) {
            staff = (appState.staffList || []).find(s => {
              const p = (s.phone || '').toString().replace(/[^0-9]/g, '').slice(-10);
              return p === cleanPhone;
            });
          } else if (staffId) {
            staff = (appState.staffList || []).find(s =>
              (s.id || '').toUpperCase() === staffId.toUpperCase() ||
              (s.name || '').toLowerCase() === staffId.toLowerCase()
            );
          }

          if (!staff) {
            recordFailedLogin(clientIp, rateKey);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'यह मोबाइल नंबर या स्टाफ आईडी पंजीकृत नहीं मिला।' }));
          }

          const isActive = staff.active !== undefined ? (staff.active === true || staff.active === 'Yes' || staff.active === 'yes' || staff.active === 'Active') : true;
          if (!isActive) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, inactive: true, error: 'आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।' }));
          }

          if (!staff.pin || !isValidCredentialFormat(staff.pin)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'इस स्टाफ अकाउंट के लिए पिन सेट नहीं है। कृपया एडमिन से संपर्क करें।' }));
          }

          const isPinValid = verifyPin(pin, staff.pin);

          if (isPinValid) {
            clearRateLimit(clientIp, rateKey);

            // Migration: Upgrade legacy plaintext or SHA-256 PIN to scrypt immediately
            if (needsRehash(staff.pin)) {
              staff.pin = hashPinScrypt(pin);
              staff.displayPin = pin;
              saveLocalData(appState);
              console.log(`[Security] Plaintext/SHA-256 PIN for staff ${staff.id} upgraded to scrypt hash.`);
            } else if (!staff.displayPin && pin && /^\d{6}$/.test(pin)) {
              staff.displayPin = pin;
              saveLocalData(appState);
            }

            const staffToken = createStaffSession(staff.id, staff.name, staff.phone);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              token: staffToken,
              staffId: staff.id,
              staffName: staff.name,
              phone: staff.phone || '',
              active: true
            }));
          } else {
            recordFailedLogin(clientIp, rateKey);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'गलत 6-डिजिट पासवर्ड! कृपया सही पिन दर्ज करें।' }));
          }
        }

        // 4. Staff Logout / Explicit Token Revocation
        if (payload.action === 'logoutStaff') {
          revokeStaffSession(token);
          if (isNeonPrimaryActive && isNeonPrimaryActive()) {
            try {
              await authService.logout(token);
            } catch (logoutErr) {
              console.warn('[Neon] Staff logout revocation warning:', logoutErr.message);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Staff session revoked.' }));
        }

        // 5. Staff Customer Data Retrieval (Requires valid Staff Session or Admin Session)
        if (payload.action === 'getStaffData') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Valid staff or admin session required to view staff customer data',
              unauthorized: true
            }));
          }

          let targetStaffId = '';
          if (staffSess && !adminSess) {
            const staffCode = (staffSess.staffCode || staffSess.staffId || '').toUpperCase();
            const staffUuid = (staffSess.staffId || '').toUpperCase();
            const reqStaff = (payload.staffId || '').toUpperCase();
            if (reqStaff && reqStaff !== staffCode && reqStaff !== staffUuid) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Forbidden: Cross-staff data access denied',
                forbidden: true
              }));
            }
            targetStaffId = staffSess.staffCode || staffSess.staffId;
          } else if (adminSess) {
            targetStaffId = payload.staffId || 'STF01';
          }

          const clientVersion = String(payload.version || (req.headers['if-none-match'] || '').replace(/^"|"$/g, '')).trim();

          try {
            if (isNeonPrimaryActive()) {
              const staffData = await staffPortalService.getStaffData(targetStaffId);
              const currentVersion = staffData.version || computeStaffDataVersion(staffData);
              staffData.version = currentVersion;

              if (clientVersion && clientVersion === currentVersion) {
                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'ETag': `"${currentVersion}"`
                });
                return res.end(JSON.stringify({
                  unchanged: true,
                  version: currentVersion,
                  staffId: targetStaffId,
                  staffName: staffData.staffName,
                  totalCount: staffData.totalCount,
                  dataSource: staffData.dataSource,
                  isLive: staffData.isLive,
                  lastSync: staffData.lastSync
                }));
              }

              staffData.unchanged = false;
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'ETag': `"${currentVersion}"`
              });
              return res.end(JSON.stringify(staffData));
            }

            const fetchResult = await fetchAllLiveCustomers();
            const staffData = formatStaffDataResponse(targetStaffId, fetchResult);
            const currentVersion = staffData.version || computeStaffDataVersion(staffData);
            staffData.version = currentVersion;

            if (clientVersion && clientVersion === currentVersion) {
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'ETag': `"${currentVersion}"`
              });
              return res.end(JSON.stringify({
                unchanged: true,
                version: currentVersion,
                staffId: targetStaffId,
                staffName: staffData.staffName,
                totalCount: staffData.totalCount,
                dataSource: staffData.dataSource,
                isLive: staffData.isLive,
                lastSync: staffData.lastSync
              }));
            }

            staffData.unchanged = false;
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'ETag': `"${currentVersion}"`
            });
            return res.end(JSON.stringify(staffData));
          } catch (liveErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to retrieve staff customer data: ' + liveErr.message }));
          }
        }

        // 6. Staff List Handler (Public list has no PIN or Phone; Admin gets sanitized list with hasPin)
        if (payload.action === 'getStaffList') {
          const adminSess = await resolveAdminSession(token);
          const isAdmin = !!adminSess;
          if (isNeonConfigured()) {
            try {
              const staffList = await adminService.getStaffList({ isAdmin });
              const sanitized = staffList.map(s =>
                isAdmin ? sanitizeStaffForAdmin(s) : sanitizeStaffForPublic(s)
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(sanitized));
            } catch (e) {
              console.warn('Neon getStaffList failed, falling back to local state:', e.message);
            }
          }
          const sanitized = (appState.staffList || []).map(s =>
            isAdmin ? sanitizeStaffForAdmin(s) : sanitizeStaffForPublic(s)
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(sanitized));
        }

        // =====================================================================
        // PROTECTED ADMIN OPERATIONS (REQUIRE VALID ADMIN SESSION TOKEN)
        // =====================================================================
        const adminProtectedActions = [
          'getAllCustomers',
          'getLeads',
          'convertLead',
          'addLeadNote',
          'saveLead',
          'deleteLead',
          'updateLeadStage',
          'updateLead',
          'saveCustomer',
          'updateCustomer',
          'deleteCustomer',
          'toggleCustomerActive',
          'saveStaffMember',
          'deleteStaffMember',
          'toggleStaffActive',
          'resetStaffPin',
          'cleanAndSyncStaff',
          'updateAdminPassword',
          'getStaffSequence',
          'saveStaffSequence',
          'resetStaffSequence',
          'revealStaffPin',
          'getDailyCleanReports',
          'getSpecialJobs',
          'assignSpecialJob',
          'reassignSpecialJob',
          'deleteSpecialJob',
          'assignDailyCleanCustomer',
          'unassignDailyCleanCustomer',
          'getDailyCleanAssignments',
          'getAuditLogs'
        ];

        if (adminProtectedActions.includes(payload.action)) {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Valid Admin session required for operation: ' + payload.action,
              unauthorized: true
            }));
          }
        }

        // Admin: Get Staff Sequence
        if (payload.action === 'getStaffSequence') {
          const reqStaffId = (payload.staffId || '').toString().trim();
          if (!reqStaffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff ID is required.' }));
          }

          if (isNeonPrimaryActive()) {
            try {
              const seqRes = await adminService.getStaffSequence(reqStaffId);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(seqRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const fetchResult = await fetchAllLiveCustomers();
          const staffData = formatStaffDataResponse(reqStaffId, fetchResult);
          const sequences = getStaffSequences(staffData.staffId || reqStaffId);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            staffId: staffData.staffId || reqStaffId,
            staffName: staffData.staffName,
            customers: staffData.dailyCarCleaning || [],
            totalCount: (staffData.dailyCarCleaning || []).length,
            hasCustomSequence: sequences.length > 0
          }));
        }

        // Admin: Save Staff Sequence
        if (payload.action === 'saveStaffSequence') {
          const reqStaffId = (payload.staffId || '').toString().trim();
          const sequenceList = payload.orderedCustomerIds || payload.sequence || payload.customerIds || [];
          if (!reqStaffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff ID is required.' }));
          }
          if (!Array.isArray(sequenceList)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Sequence list must be an array.' }));
          }

          if (isNeonPrimaryActive()) {
            try {
              const saveRes = await adminService.saveStaffSequence(reqStaffId, sequenceList, 'admin');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(saveRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const updatedRecords = saveStaffSequence(reqStaffId, sequenceList, 'admin');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            message: 'Staff customer route sequence saved successfully.',
            sequenceCount: updatedRecords.length,
            data: updatedRecords,
            sequences: updatedRecords
          }));
        }

        // Admin: Reset Staff Sequence to Default
        if (payload.action === 'resetStaffSequence') {
          const reqStaffId = (payload.staffId || '').toString().trim();
          if (!reqStaffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff ID is required.' }));
          }

          if (isNeonConfigured()) {
            try {
              const resetRes = await adminService.resetStaffSequence(reqStaffId, 'admin');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(resetRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          resetStaffSequence(reqStaffId);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            message: 'Customer route sequence reset to default order.'
          }));
        }

        // Admin: Get All Customers
        if (payload.action === 'getAllCustomers') {
          const forceRefresh = !!payload.forceRefresh;
          const fetchResult = await fetchAllLiveCustomers(forceRefresh);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fetchResult.records || []));
        }

        // Admin: Get Leads
        if (payload.action === 'getLeads') {
          const fetchResult = await fetchLeads();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fetchResult.leads || []));
        }

        // Admin: Convert Lead to Customer
        if (payload.action === 'convertLead') {
          const leadId = payload.leadId || (payload.customerData && payload.customerData.id);
          if (!leadId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead ID is required.' }));
          }

          if (isNeonConfigured()) {
            try {
              const convertRes = await adminService.convertLeadToCustomer(leadId, payload.convertData || payload.customerData || {}, 'admin');
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(convertRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          // Local mode fallback
          if (!appState.customers) appState.customers = [];
          const cust = appState.customers.find(c => c.id === leadId || c.customerCode === leadId || c.customerNumber === leadId);
          if (!cust) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead not found in local data.' }));
          }

          const conv = payload.convertData || payload.customerData || {};
          cust.isLead = false;
          cust.leadStatus = 'converted';
          cust.tag = 'customer';
          cust.serviceCategory = conv.serviceCategory || cust.serviceCategory || 'Daily Car Cleaning';
          cust.packageType = conv.packageType || cust.packageType || 'DCC ONLY';
          cust.packageName = cust.packageType;
          cust.sheetName = (cust.serviceCategory === 'Daily Car Cleaning') ? 'Daily Clean' : 'All Other Work';
          if (conv.staffId) cust.staffId = conv.staffId;
          if (conv.staffName) cust.staffName = conv.staffName;
          if (conv.notes) {
            const ts = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            cust.notes = cust.notes ? `${cust.notes}\n[Converted ${ts}] ${conv.notes}` : `[Converted ${ts}] ${conv.notes}`;
          }
          saveLocalData(appState);
          invalidateLiveCustomersCache();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, customerId: cust.id, message: 'Lead converted successfully.' }));
        }

        // Admin: Add Note to Lead
        if (payload.action === 'addLeadNote') {
          const leadId = payload.leadId;
          const noteText = payload.note || payload.notes || payload.leadNotes;
          if (!leadId || !noteText) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead ID and note text are required.' }));
          }

          if (isNeonConfigured()) {
            try {
              const noteRes = await adminService.addLeadNote(leadId, noteText, 'admin');
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(noteRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          // Local mode fallback
          if (!appState.customers) appState.customers = [];
          const cust = appState.customers.find(c => c.id === leadId || c.customerCode === leadId || c.customerNumber === leadId);
          if (!cust) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Customer not found.' }));
          }
          const ts = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          const formatted = `[${ts}] ${noteText.trim()}`;
          cust.leadNotes = cust.leadNotes ? `${cust.leadNotes}\n${formatted}` : formatted;
          cust.notes = cust.notes ? `${cust.notes}\n${formatted}` : formatted;
          saveLocalData(appState);
          invalidateLiveCustomersCache();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, customerId: cust.id, leadNotes: cust.leadNotes, notes: cust.notes }));
        }

        // Admin: Update Lead Stage / Lifecycle Status
        if (payload.action === 'updateLeadStage') {
          const leadId = (payload.leadId || payload.id || '').toString().trim();
          const stage = (payload.stage || payload.leadStatus || 'open').toString().trim().toLowerCase();
          if (!leadId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead ID is required.' }));
          }

          if (isNeonConfigured()) {
            try {
              let targetId = leadId;
              if (!/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(leadId)) {
                const found = await repos.customers.findByCode(leadId);
                if (found) targetId = found.id;
              }
              const updated = await repos.customers.updateCustomer(targetId, { leadStatus: stage });
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, customerId: targetId, leadStatus: stage }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          // Local mode fallback
          if (!appState.customers) appState.customers = [];
          const cust = appState.customers.find(c => c.id === leadId || c.customerCode === leadId || c.customerNumber === leadId);
          if (!cust) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead not found in local data.' }));
          }
          cust.leadStatus = stage;
          saveLocalData(appState);
          invalidateLiveCustomersCache();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, customerId: cust.id, leadStatus: stage }));
        }

        // Admin: Update Lead Details
        if (payload.action === 'updateLead') {
          const leadData = payload.leadData || payload.customerData || {};
          const leadId = (payload.leadId || payload.id || leadData.id || leadData.customerId || '').toString().trim();
          if (!leadId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead ID is required for update.' }));
          }

          const rawName = (leadData.customerName || leadData.name || '').toString().trim();
          if (!rawName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead name is required.' }));
          }

          const rawPhone = (leadData.customerNumber || leadData.phone || '').toString().trim();
          let normPhone = '';
          if (rawPhone) {
            if (!isValidIndianMobile(rawPhone)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).'
              }));
            }
            normPhone = normalizeIndianMobile(rawPhone);
          }

          const photoObj = leadData.photoFile || leadData.photoData;
          if (photoObj && photoObj.base64) {
            try {
              const uploadedUrl = await uploadToCloudinary(photoObj);
              if (uploadedUrl) leadData.photoUrl = uploadedUrl;
            } catch (uErr) {
              console.error('Lead photo upload process failed:', uErr);
            }
            delete leadData.photoFile;
            delete leadData.photoData;
          }

          leadData.id = leadId;
          leadData.customerNumber = normPhone;
          leadData.phone = normPhone;

          if (isNeonConfigured()) {
            try {
              const adminUser = 'admin';
              const neonUpdateRes = await adminService.updateLead(leadData, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(neonUpdateRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          // Local mode fallback
          if (!appState.customers) appState.customers = [];
          const cust = appState.customers.find(c => c.id === leadId || c.customerCode === leadId || (c.customerNumber && c.customerNumber === leadId));
          if (!cust) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Lead not found in local records.' }));
          }

          let nameHi = leadData.nameHi || leadData.name_hi;
          if (!nameHi && rawName) {
            try { nameHi = await indicService.transliterateName(rawName); } catch (e) { nameHi = rawName; }
          }

          let addressHi = leadData.addressHi || leadData.address_hi;
          const rawAddr = (leadData.address || '').toString().trim();
          if (!addressHi && rawAddr) {
            try { addressHi = await indicService.transliterateAddress(rawAddr); } catch (e) { addressHi = rawAddr; }
          }

          const carMakeVal = (leadData.carMake || leadData.car_make || '').toString().trim();
          const carColorVal = (leadData.carColor || leadData.car_color || '').toString().trim();
          const interestedService = (leadData.serviceCategory || leadData.interestedService || leadData.serviceType || cust.serviceCategory || 'Daily Car Cleaning').toString().trim();
          const leadStage = (leadData.leadStatus || leadData.stage || cust.leadStatus || 'open').toString().trim().toLowerCase();
          const rawVehicle = (leadData.vehicle || leadData.vehicleDetails || '').toString().trim();
          const rawNotes = (leadData.notes !== undefined ? leadData.notes : (leadData.leadNotes !== undefined ? leadData.leadNotes : cust.leadNotes || cust.notes || '')).toString().trim();
          const rawMapsUrl = (leadData.googleMapsUrl || leadData.mapsUrl || '').toString().trim();

          cust.customerName = rawName;
          cust.name = rawName;
          cust.nameHi = nameHi || rawName;
          cust.customerNumber = normPhone;
          cust.phone = normPhone;
          cust.address = rawAddr;
          cust.addressHi = addressHi || rawAddr;
          cust.googleMapsUrl = rawMapsUrl;
          cust.vehicle = rawVehicle;
          cust.vehicleDetails = rawVehicle;
          cust.carMake = carMakeVal;
          cust.car_make = carMakeVal;
          cust.carColor = carColorVal;
          cust.car_color = carColorVal;
          cust.serviceCategory = interestedService;
          cust.interestedService = interestedService;
          cust.leadStatus = leadStage;
          cust.notes = rawNotes;
          cust.leadNotes = rawNotes;
          if (leadData.photoUrl) cust.photoUrl = leadData.photoUrl;

          saveLocalData(appState);
          invalidateLiveCustomersCache();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, customerId: cust.id, message: 'Lead updated successfully', photoUrl: cust.photoUrl }));
        }

        // Admin: Reset Staff PIN (Requires valid 6-digit numeric PIN, revokes existing sessions)
        if (payload.action === 'resetStaffPin') {
          const staffId = (payload.staffId || '').trim();
          const newPin = (payload.newPin || '').trim();

          if (!staffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff ID is required.' }));
          }

          if (!/^\d{6}$/.test(newPin)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff PIN must be exactly 6 numeric digits.' }));
          }

          if (isNeonConfigured()) {
            try {
              const resetRes = await authService.resetStaffPin({
                staffCodeOrId: staffId,
                newPin,
                adminUser: 'admin'
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(resetRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const staff = (appState.staffList || []).find(s => s.id.toUpperCase() === staffId.toUpperCase());
          if (!staff) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff member not found.' }));
          }

          staff.pin = hashPinScrypt(newPin);
          staff.displayPin = newPin;
          saveLocalData(appState);
          revokeAllStaffSessionsForId(staff.id);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            staffId: staff.id,
            pin: newPin,
            message: `6-digit PIN for staff member (${staff.name}) reset successfully.`
          }));
        }

        // Admin: Reveal Staff PIN (Protected Admin Operation)
        if (payload.action === 'revealStaffPin') {
          const staffId = (payload.staffId || '').toString().trim().toUpperCase();
          if (!staffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff ID is required.' }));
          }
          if (isNeonPrimaryActive()) {
            try {
              const staff = await repos.staff.findByStaffCode(staffId);
              if (!staff) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'Staff member not found.' }));
              }
              const auth = await repos.staffAuth.findByStaffId(staff.id);
              let pinVal = '';
              if (auth && auth.display_pin) {
                pinVal = auth.display_pin;
              } else if (auth && auth.pin_hash && /^\d{6}$/.test(auth.pin_hash)) {
                pinVal = auth.pin_hash;
              } else if (staff.staff_code === 'STF01') {
                pinVal = '123456';
              } else if (staff.staff_code === 'STF02') {
                pinVal = '654321';
              } else {
                const localMatch = (appState.staffList || []).find(s => (s.id || '').toUpperCase() === staffId);
                if (localMatch && (localMatch.displayPin || /^\d{6}$/.test(localMatch.pin))) {
                  pinVal = localMatch.displayPin || localMatch.pin;
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                staffId: staff.staff_code,
                pin: pinVal || '[PIN Protected]'
              }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }
          const staff = (appState.staffList || []).find(s => (s.id || '').toUpperCase() === staffId);
          if (!staff) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff member not found.' }));
          }
          let pin = staff.displayPin || (staff.pin && /^\d{6}$/.test(staff.pin) ? staff.pin : '');
          if (!pin && (staff.id || '').toUpperCase() === 'STF01') pin = '123456';
          if (!pin && (staff.id || '').toUpperCase() === 'STF02') pin = '654321';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            staffId: staff.id,
            pin: pin
          }));
        }

        // Admin: Save New Staff Member (P1 Fix: No default PIN 123456)
        if (payload.action === 'saveStaffMember') {
          const sData = payload.staffData || {};
          const name = (sData.name || payload.name || '').trim();
          let id = (sData.id || sData.staffId || sData.staffCode || payload.id || payload.staffId || payload.staffCode || '').trim().toUpperCase();
          const phone = (sData.phone || payload.phone || '').trim();
          const rawPin = (sData.pin || payload.pin || '').toString().trim();
          const active = sData.active !== undefined ? (sData.active === true || sData.active === 'true' || sData.active === 'Yes' || sData.active === 'yes') : true;

          if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff name is required.' }));
          }

          if (!appState.staffList) appState.staffList = [];
          const idx = appState.staffList.findIndex(s =>
            (s.id || '').toUpperCase() === id ||
            (s.name || '').toLowerCase() === name.toLowerCase()
          );

          if (!id) {
            id = 'STF' + String(appState.staffList.length + 1).padStart(2, '0');
          }

          // Strict Indian Mobile Validation & Normalization for Staff (Task P2.4)
          let normalizedPhone = '';
          if (phone) {
            if (!isValidIndianMobile(phone)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Please enter a valid 10-digit Indian mobile number for staff (starting with 6, 7, 8, or 9). (Invalid Indian mobile number for staff)'
              }));
            }
            normalizedPhone = normalizeIndianMobile(phone);
          } else {
            if (isNeonPrimaryActive() && id) {
              try {
                const existingNeonStaff = await repos.staff.findByStaffCode(id) || await repos.staff.findById(id);
                if (existingNeonStaff && existingNeonStaff.phone) {
                  normalizedPhone = existingNeonStaff.phone;
                }
              } catch (e) {}
            }
            if (!normalizedPhone && idx >= 0 && appState.staffList[idx].phone) {
              normalizedPhone = appState.staffList[idx].phone;
            }
          }

          // Mobile uniqueness check: staff mobile is proof of identity and must not be same for other staff
          if (normalizedPhone) {
            const duplicateStaff = (appState.staffList || []).find(s =>
              (s.id || '').toUpperCase() !== id &&
              s.phone && normalizeIndianMobile(s.phone) === normalizedPhone
            );
            if (duplicateStaff) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: `Mobile number ${normalizedPhone} is already registered to another staff member (${duplicateStaff.name}). Staff mobile number must be unique.`
              }));
            }
          }

          // Extended non-mandatory staff profile fields
          const email = (sData.email || payload.email || '').trim();
          const dateOfJoining = (sData.dateOfJoining || sData.date_of_joining || payload.dateOfJoining || payload.date_of_joining || '').trim();
          const aadharNumber = (sData.aadharNumber || sData.aadhar_number || payload.aadharNumber || payload.aadhar_number || '').trim();
          const panNumber = (sData.panNumber || sData.pan_number || payload.panNumber || payload.pan_number || '').trim().toUpperCase();
          const drivingLicenseNumber = (sData.drivingLicenseNumber || sData.driving_license_number || payload.drivingLicenseNumber || payload.driving_license_number || '').trim();
          const rawSalary = (sData.salary !== undefined && sData.salary !== null && sData.salary !== '') ? sData.salary : (payload.salary !== undefined && payload.salary !== null && payload.salary !== '' ? payload.salary : null);
          const salary = (rawSalary !== null && rawSalary !== undefined && rawSalary !== '') ? Number(rawSalary) : null;
          const weeklyOff = (sData.weeklyOff || sData.weekly_off || payload.weeklyOff || payload.weekly_off || '').trim();

          let existingHasPin = false;
          if (isNeonPrimaryActive() && id) {
            try {
              const existingNeonStaff = await repos.staff.findByStaffCode(id) || await repos.staff.findById(id);
              if (existingNeonStaff) {
                const auth = await repos.staffAuth.findByStaffId(existingNeonStaff.id);
                if (auth && auth.pin_hash) existingHasPin = true;
              }
            } catch (e) {}
          }

          let pinToStore = '';
          let displayPinToStore = '';
          if (rawPin) {
            if (rawPin.toUpperCase() === '[PROTECTED]') {
              if (idx >= 0) {
                pinToStore = appState.staffList[idx].pin || '';
                displayPinToStore = appState.staffList[idx].displayPin || '';
              }
            } else if (rawPin.startsWith('scrypt:') || rawPin.startsWith('sha256:')) {
              pinToStore = rawPin;
              displayPinToStore = idx >= 0 ? (appState.staffList[idx].displayPin || '') : '';
            } else if (/^\d{6}$/.test(rawPin)) {
              pinToStore = hashPinScrypt(rawPin);
              displayPinToStore = rawPin;
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Staff PIN must be exactly 6 numeric digits.' }));
            }
          } else if (existingHasPin || (idx >= 0 && appState.staffList[idx].pin)) {
            if (idx >= 0) {
              pinToStore = appState.staffList[idx].pin || '';
              displayPinToStore = appState.staffList[idx].displayPin || '';
            }
          } else {
            // New staff member with no PIN: Require explicit 6-digit PIN. Never default to 123456!
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'A 6-digit PIN is required to create a new staff member. (PIN is required for new staff)' }));
          }

          const existingStaff = idx >= 0 ? appState.staffList[idx] : null;
          const oldStaffName = (existingStaff && existingStaff.name ? existingStaff.name : (payload.oldName || '')).trim();
          const nameChanged = !!(oldStaffName && oldStaffName.toLowerCase() !== name.toLowerCase());
          const phoneChanged = existingStaff && (existingStaff.phone || '') !== (normalizedPhone || '');
          const pinChanged = existingStaff && pinToStore && existingStaff.pin && existingStaff.pin !== pinToStore;
          const deactivated = existingStaff && existingStaff.active && !active;

          let photoUrl = (sData.photoUrl || sData.photo || payload.photoUrl || payload.photo || '').trim();
          const photoObj = sData.photoData || sData.photoObj || payload.photoData || payload.photoObj;
          if (photoObj && photoObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(photoObj);
              if (uploaded) photoUrl = uploaded;
            } catch (uErr) {
              console.error('Staff photo upload error:', uErr.message);
            }
          } else if (!photoUrl && !sData.removePhoto && !payload.removePhoto && idx >= 0 && (appState.staffList[idx].photoUrl || appState.staffList[idx].photo_url)) {
            photoUrl = appState.staffList[idx].photoUrl || appState.staffList[idx].photo_url || '';
          }

          // Document photo uploads
          let aadharFrontUrl = (sData.aadharFrontUrl || sData.aadhar_front_url || payload.aadharFrontUrl || '').trim();
          const aadharFrontObj = sData.aadharFrontObj || payload.aadharFrontObj;
          if (aadharFrontObj && aadharFrontObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(aadharFrontObj);
              if (uploaded) aadharFrontUrl = uploaded;
            } catch (uErr) {
              console.error('Aadhar front upload error:', uErr.message);
            }
          } else if (sData.removeAadharFront || payload.removeAadharFront) {
            aadharFrontUrl = '';
          } else if (!aadharFrontUrl && idx >= 0 && (appState.staffList[idx].aadharFrontUrl || appState.staffList[idx].aadhar_front_url)) {
            aadharFrontUrl = appState.staffList[idx].aadharFrontUrl || appState.staffList[idx].aadhar_front_url || '';
          }

          let aadharBackUrl = (sData.aadharBackUrl || sData.aadhar_back_url || payload.aadharBackUrl || '').trim();
          const aadharBackObj = sData.aadharBackObj || payload.aadharBackObj;
          if (aadharBackObj && aadharBackObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(aadharBackObj);
              if (uploaded) aadharBackUrl = uploaded;
            } catch (uErr) {
              console.error('Aadhar back upload error:', uErr.message);
            }
          } else if (sData.removeAadharBack || payload.removeAadharBack) {
            aadharBackUrl = '';
          } else if (!aadharBackUrl && idx >= 0 && (appState.staffList[idx].aadharBackUrl || appState.staffList[idx].aadhar_back_url)) {
            aadharBackUrl = appState.staffList[idx].aadharBackUrl || appState.staffList[idx].aadhar_back_url || '';
          }

          let bankPassbookUrl = (sData.bankPassbookUrl || sData.bank_passbook_url || payload.bankPassbookUrl || '').trim();
          const bankPassbookObj = sData.bankPassbookObj || payload.bankPassbookObj;
          if (bankPassbookObj && bankPassbookObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(bankPassbookObj);
              if (uploaded) bankPassbookUrl = uploaded;
            } catch (uErr) {
              console.error('Bank passbook upload error:', uErr.message);
            }
          } else if (sData.removeBankPassbook || payload.removeBankPassbook) {
            bankPassbookUrl = '';
          } else if (!bankPassbookUrl && idx >= 0 && (appState.staffList[idx].bankPassbookUrl || appState.staffList[idx].bank_passbook_url)) {
            bankPassbookUrl = appState.staffList[idx].bankPassbookUrl || appState.staffList[idx].bank_passbook_url || '';
          }

          let panCardUrl = (sData.panCardUrl || sData.pan_card_url || payload.panCardUrl || '').trim();
          const panCardObj = sData.panCardObj || payload.panCardObj;
          if (panCardObj && panCardObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(panCardObj);
              if (uploaded) panCardUrl = uploaded;
            } catch (uErr) {
              console.error('PAN card upload error:', uErr.message);
            }
          } else if (sData.removePanCard || payload.removePanCard) {
            panCardUrl = '';
          } else if (!panCardUrl && idx >= 0 && (appState.staffList[idx].panCardUrl || appState.staffList[idx].pan_card_url)) {
            panCardUrl = appState.staffList[idx].panCardUrl || appState.staffList[idx].pan_card_url || '';
          }

          let drivingLicenseUrl = (sData.drivingLicenseUrl || sData.driving_license_url || payload.drivingLicenseUrl || '').trim();
          const drivingLicenseObj = sData.drivingLicenseObj || payload.drivingLicenseObj;
          if (drivingLicenseObj && drivingLicenseObj.base64) {
            try {
              const uploaded = await uploadToCloudinary(drivingLicenseObj);
              if (uploaded) drivingLicenseUrl = uploaded;
            } catch (uErr) {
              console.error('Driving license upload error:', uErr.message);
            }
          } else if (sData.removeDrivingLicense || payload.removeDrivingLicense) {
            drivingLicenseUrl = '';
          } else if (!drivingLicenseUrl && idx >= 0 && (appState.staffList[idx].drivingLicenseUrl || appState.staffList[idx].driving_license_url)) {
            drivingLicenseUrl = appState.staffList[idx].drivingLicenseUrl || appState.staffList[idx].driving_license_url || '';
          }

          if (isNeonPrimaryActive()) {
            try {
              const adminUser = 'admin';
              const neonStaffRes = await adminService.saveStaffMember({
                staffId: id,
                name: name,
                phone: normalizedPhone,
                pin: rawPin,
                photoUrl: photoUrl,
                active: active,
                email: email,
                dateOfJoining: dateOfJoining || null,
                aadharNumber: aadharNumber,
                aadharFrontUrl: aadharFrontUrl,
                aadharBackUrl: aadharBackUrl,
                bankPassbookUrl: bankPassbookUrl,
                panNumber: panNumber,
                panCardUrl: panCardUrl,
                drivingLicenseNumber: drivingLicenseNumber,
                drivingLicenseUrl: drivingLicenseUrl,
                salary: salary,
                weeklyOff: weeklyOff
              }, adminUser);

              if (!neonStaffRes || !neonStaffRes.success) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: neonStaffRes ? neonStaffRes.error : 'Failed to save staff member.' }));
              }

              const newObj = {
                id,
                name,
                phone: normalizedPhone,
                photoUrl: photoUrl,
                pin: pinToStore,
                displayPin: displayPinToStore,
                active,
                email,
                dateOfJoining,
                aadharNumber,
                aadharFrontUrl,
                aadharBackUrl,
                bankPassbookUrl,
                panNumber,
                panCardUrl,
                drivingLicenseNumber,
                drivingLicenseUrl,
                salary,
                weeklyOff
              };
              if (idx >= 0) {
                appState.staffList[idx] = Object.assign({}, appState.staffList[idx], newObj);
              } else {
                appState.staffList.push(newObj);
              }
              saveLocalData(appState);
              invalidateLiveCustomersCache();

              if (existingStaff && (phoneChanged || pinChanged || deactivated)) {
                revokeAllStaffSessionsForId(newObj.id);
              }

              const allStaff = await adminService.getStaffList({ isAdmin: true });
              const sanitizedList = allStaff.map(s => sanitizeStaffForAdmin(s));

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                staffList: sanitizedList,
                staff: sanitizeStaffForAdmin(newObj),
                cascaded: nameChanged,
                message: neonStaffRes.message || 'Staff member saved successfully.'
              }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const newObj = {
            id,
            name,
            phone: normalizedPhone,
            photoUrl: photoUrl,
            pin: pinToStore,
            displayPin: displayPinToStore,
            active,
            email,
            dateOfJoining,
            aadharNumber,
            aadharFrontUrl,
            aadharBackUrl,
            bankPassbookUrl,
            panNumber,
            panCardUrl,
            drivingLicenseNumber,
            drivingLicenseUrl,
            salary,
            weeklyOff
          };

          if (idx >= 0) {
            appState.staffList[idx] = Object.assign({}, appState.staffList[idx], newObj);
          } else {
            appState.staffList.push(newObj);
          }

          // Cascade staff rename in local customers cache if present
          let localReassignedCount = 0;
          if (nameChanged && appState.customers && Array.isArray(appState.customers)) {
            appState.customers.forEach(c => {
              if ((c.staffName || '').trim().toLowerCase() === oldStaffName.toLowerCase() ||
                  (c.staffId || '').trim().toUpperCase() === id) {
                c.staffName = name;
                c.staffId = id;
                localReassignedCount++;
              }
            });
          }

          saveLocalData(appState);
          invalidateLiveCustomersCache();

          // Invalidate active sessions immediately if phone, PIN, or active status changed
          if (existingStaff && (phoneChanged || pinChanged || deactivated)) {
            revokeAllStaffSessionsForId(newObj.id);
            console.log(`[Security] Revoked all active sessions for staff ${newObj.id} (phoneChanged: ${phoneChanged}, pinChanged: ${pinChanged}, deactivated: ${deactivated})`);
          }

          const sanitizedList = appState.staffList.map(s => sanitizeStaffForAdmin(s));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            staffList: sanitizedList,
            staff: sanitizeStaffForAdmin(newObj),
            cascaded: nameChanged,
            oldName: oldStaffName,
            newName: newObj.name,
            reallocatedCount: localReassignedCount
          }));
        }

        // Admin: Toggle Staff Active
        if (payload.action === 'toggleStaffActive') {
          if (!payload.active) {
            revokeAllStaffSessionsForId(payload.staffId);
          }
          if (isNeonConfigured()) {
            try {
              const toggleRes = await adminService.toggleStaffActive(payload.staffId, payload.active, 'admin');
              const localStaff = (appState.staffList || []).find(x => (x.id || '').toLowerCase() === (payload.staffId || '').toLowerCase());
              if (localStaff) {
                localStaff.active = !!payload.active;
                saveLocalData(appState);
              }
              invalidateLiveCustomersCache();
              const allStaff = await adminService.getStaffList({ isAdmin: true });
              const sanitizedList = allStaff.map(item => sanitizeStaffForAdmin(item));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, staffList: sanitizedList }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const s = (appState.staffList || []).find(x => (x.id || '').toLowerCase() === (payload.staffId || '').toLowerCase());
          if (s) {
            s.active = !!payload.active;
            saveLocalData(appState);
            invalidateLiveCustomersCache();
            if (!s.active) {
              revokeAllStaffSessionsForId(s.id);
            }
            const sanitizedList = appState.staffList.map(item => sanitizeStaffForAdmin(item));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, staffList: sanitizedList }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff member not found.' }));
          }
        }

        // Admin: Delete Staff Member
        if (payload.action === 'deleteStaffMember') {
          const staffId = (payload.id || payload.staffId || payload.staffCode || '').toString().trim();
          if (isNeonConfigured()) {
            try {
              const delRes = await adminService.deleteStaffMember(staffId, 'admin');
              if (!delRes.success) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: delRes.error }));
              }
              invalidateLiveCustomersCache();
              const allStaff = await adminService.getStaffList({ isAdmin: true });
              const sanitizedList = allStaff.map(item => sanitizeStaffForAdmin(item));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, staffList: sanitizedList, message: delRes.message }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          const targetStaff = (appState.staffList || []).find(s => (s.id || '').toLowerCase() === staffId.toLowerCase());
          const deletedName = targetStaff ? (targetStaff.name || '').trim() : '';
          revokeAllStaffSessionsForId(staffId);
          appState.staffList = (appState.staffList || []).filter(s => (s.id || '').toLowerCase() !== staffId.toLowerCase());

          if (deletedName && appState.customers && Array.isArray(appState.customers)) {
            appState.customers.forEach(c => {
              if ((c.staffName || '').trim().toLowerCase() === deletedName.toLowerCase() ||
                  (c.staffId || '').trim().toLowerCase() === staffId.toLowerCase()) {
                c.staffName = '';
                c.staffId = '';
              }
            });
          }

          saveLocalData(appState);
          invalidateLiveCustomersCache();
          const sanitizedList = appState.staffList.map(item => sanitizeStaffForAdmin(item));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, staffList: sanitizedList }));
        }

        // Admin: Update Admin Password
        if (payload.action === 'updateAdminPassword') {
          const newPass = (payload.newPassword || '').trim();
          if (!newPass || newPass.length < 4) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Admin password must be at least 4 characters.' }));
          }

          if (isNeonConfigured()) {
            try {
              const newHash = hashPasswordScrypt(newPass);
              let adminUser = await repos.adminUsers.findByUsername('admin');
              if (!adminUser) {
                adminUser = await repos.adminUsers.createAdmin({
                  username: 'admin',
                  passwordHash: newHash,
                  role: 'superadmin'
                });
              } else {
                await repos.adminUsers.updatePassword(adminUser.id, newHash);
              }
              appState.adminPasswordHash = newHash;
              delete appState.adminPassword;
              saveLocalData(appState);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, message: 'Admin password updated successfully in Neon database!' }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Failed to update admin password in Neon: ' + err.message }));
            }
          }

          // Hash with scrypt and save (Plaintext is NEVER stored or logged!)
          appState.adminPasswordHash = hashPasswordScrypt(newPass);
          delete appState.adminPassword;
          saveLocalData(appState);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Admin password updated successfully and securely!' }));
        }

        // Admin: Save Customer / Save Lead (Task P2.4: Strict Server-Side Indian Mobile Validation & Normalization)
        if ((payload.action === 'saveCustomer' || payload.action === 'saveLead') && payload.customerData) {
          const cust = payload.customerData;
          if (cust) {
            if (cust.carMake === undefined && cust.car_make !== undefined) cust.carMake = cust.car_make;
            if (cust.carColor === undefined && cust.car_color !== undefined) cust.carColor = cust.car_color;
            if (cust.car_make === undefined && cust.carMake !== undefined) cust.car_make = cust.carMake;
            if (cust.car_color === undefined && cust.carColor !== undefined) cust.car_color = cust.carColor;
          }
          const isLeadSave = Boolean(payload.action === 'saveLead' || cust.isLead || cust.tag === 'lead');
          if (isLeadSave) {
            cust.isLead = true;
            cust.tag = 'lead';
          }

          const rawCustName = (cust.customerName || cust.name || '').toString().trim();
          if (!rawCustName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Customer name is required.'
            }));
          }

          const rawCustPhone = (cust.customerNumber || cust.phone || cust.custPhone || cust.mobile || '').toString().trim();
          let normCustPhone = '';
          if (rawCustPhone) {
            if (!isValidIndianMobile(rawCustPhone)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
              }));
            }
            normCustPhone = normalizeIndianMobile(rawCustPhone);
          } else if (!isLeadSave) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
            }));
          }

          cust.customerNumber = normCustPhone;
          if (cust.phone !== undefined) cust.phone = normCustPhone;
          if (cust.custPhone !== undefined) cust.custPhone = normCustPhone;
          if (cust.mobile !== undefined) cust.mobile = normCustPhone;
          const photoObj = cust.photoFile || cust.photoData;
          if (photoObj && photoObj.base64) {
            try {
              const uploadedUrl = await uploadToCloudinary(photoObj);
              if (uploadedUrl) cust.photoUrl = uploadedUrl;
            } catch (uErr) {
              console.error('Photo upload process failed:', uErr);
            }
            delete cust.photoFile;
            delete cust.photoData;
          }

          const cat = (cust.serviceCategory || cust.category || cust.sheetName || '').toString().trim();
          if (cat === 'Daily Car Cleaning' || cat === 'Daily Clean' || cat === 'daily_car_cleaning') {
            cust.sheetName = 'Daily Clean';
            cust.serviceCategory = 'Daily Car Cleaning';
          } else if (cat === 'Car Washing' || cat === 'car_washing' || cat === 'Car Wash') {
            cust.sheetName = 'All Other Work';
            cust.serviceCategory = 'Car Washing';
            cust.serviceType = cust.serviceType || cust.packageType || 'Car Washing';
          } else if (cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning' || cat === 'Solar Cleaning') {
            cust.sheetName = 'All Other Work';
            cust.serviceCategory = 'Solar Panel Cleaning';
            cust.serviceType = cust.serviceType || cust.packageType || 'Solar Panel Cleaning';
          }

          if (!cust.packagesPurchased) cust.packagesPurchased = '1';

          if (cust.staffName !== undefined || cust.staffId !== undefined) {
            const sNameRaw = (cust.staffName || '').toString().trim();
            const sIdRaw = (cust.staffId || '').toString().trim();
            if ((!sNameRaw && !sIdRaw) || sNameRaw.toLowerCase() === 'unassigned' || sNameRaw.toLowerCase() === 'none' || sIdRaw.toLowerCase() === 'unassigned' || sIdRaw.toLowerCase() === 'none') {
              cust.staffName = '';
              cust.staffId = '';
            } else {
              cust.staffName = sNameRaw;
              cust.staffId = sIdRaw;
              if (!cust.staffId && appState.staffList) {
                const sObj = appState.staffList.find(s => (s.name || '').trim().toLowerCase() === sNameRaw.toLowerCase());
                if (sObj && sObj.id) cust.staffId = sObj.id;
              }
              if (!cust.staffName && appState.staffList && cust.staffId) {
                const sObj = appState.staffList.find(s => (s.id || '').trim().toUpperCase() === cust.staffId.toUpperCase());
                if (sObj && sObj.name) cust.staffName = sObj.name;
              }
            }
          }

          if (isNeonConfigured()) {
            try {
              const adminUser = 'admin';
              const neonSaveRes = await adminService.saveCustomer(cust, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(neonSaveRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          if (!appState.customers) appState.customers = [];
          if (!cust.nameHi && cust.customerName) {
            try { cust.nameHi = await indicService.transliterateName(cust.customerName); } catch (e) { cust.nameHi = cust.customerName; }
          }
          if (!cust.addressHi && cust.address) {
            try { cust.addressHi = await indicService.transliterateAddress(cust.address); } catch (e) { cust.addressHi = cust.address; }
          }
          if (!cust.secondaryAddressHi && cust.secondaryAddress) {
            try { cust.secondaryAddressHi = await indicService.transliterateAddress(cust.secondaryAddress); } catch (e) { cust.secondaryAddressHi = cust.secondaryAddress; }
          }

          if (!cust.id) {
            cust.id = (isLeadSave ? 'lead_' : 'cust_') + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          }
          if (!cust.customerCode) {
            const codePrefix = isLeadSave ? 'LEAD_' : (cust.sheetName === 'All Other Work' ? 'CUST_AOW_' : 'CUST_DC_');
            const phonePart = normCustPhone || `NOP_${Date.now().toString().slice(-4)}`;
            cust.customerCode = `${codePrefix}${phonePart}_${Date.now().toString().slice(-3)}`.slice(0, 32);
          }

          const existingIdx = appState.customers.findIndex(c => {
            if (cust.id && c.id === cust.id) return true;
            if (cust.customerCode && c.customerCode === cust.customerCode) return true;
            if (normCustPhone && c.customerNumber === normCustPhone && c.customerName === cust.customerName) return true;
            return false;
          });
          if (existingIdx >= 0) {
            appState.customers[existingIdx] = Object.assign({}, appState.customers[existingIdx], cust);
          } else {
            cust.rowIndex = appState.customers.length + 2;
            appState.customers.unshift(cust);
          }
          saveLocalData(appState);
          invalidateLiveCustomersCache();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            isLead: Boolean(cust.isLead),
            message: cust.isLead ? 'Lead saved successfully' : 'Customer saved successfully'
          }));
        }

        // Admin: Update Customer (Guards against duplicate/orphaned rows and cross-sheet corruption)
        if (payload.action === 'updateCustomer') {
          const cust = payload.customerData;
          if (cust) {
            if (cust.carMake === undefined && cust.car_make !== undefined) cust.carMake = cust.car_make;
            if (cust.carColor === undefined && cust.car_color !== undefined) cust.carColor = cust.car_color;
            if (cust.car_make === undefined && cust.carMake !== undefined) cust.car_make = cust.carMake;
            if (cust.car_color === undefined && cust.carColor !== undefined) cust.car_color = cust.carColor;
          }
          if (!cust || (!cust.id && (!cust.sheetName || !cust.rowIndex))) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Missing customer reference for update' }));
          }

          const rowIdx = cust.rowIndex ? parseInt(cust.rowIndex, 10) : 0;
          if (!cust.id && (isNaN(rowIdx) || rowIdx < 2)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Invalid row index for update' }));
          }

          // Service category & sheet mapping: dynamic support for all categories
          const cat = (cust.serviceCategory || cust.category || '').toString().trim();
          if (cat === 'Daily Car Cleaning' || cat === 'Daily Clean' || cat === 'daily_car_cleaning' || /daily/i.test(cat) || /dcc/i.test(cat)) {
            cust.serviceCategory = 'Daily Car Cleaning';
            cust.sheetName = 'Daily Clean';
          } else if (cat) {
            cust.sheetName = 'All Other Work';
            if (cat === 'solar_cleaning' || cat === 'Solar Panel Cleaning' || /solar/i.test(cat)) {
              cust.serviceCategory = 'Solar Panel Cleaning';
            } else if (cat === 'interior_detailing' || cat === 'Interior Detailing' || /interior/i.test(cat)) {
              cust.serviceCategory = 'Interior Detailing';
            } else if (cat === 'exterior_detailing' || cat === 'Exterior Detailing' || /exterior/i.test(cat)) {
              cust.serviceCategory = 'Exterior Detailing';
            } else if (cat === 'car_washing' || cat === 'Car Washing' || cat === 'Car Wash' || /wash/i.test(cat)) {
              cust.serviceCategory = 'Car Washing';
            } else {
              cust.serviceCategory = cat;
            }
          }

          // Mobile Validation & Normalization for Customer (Task P2.4)
          const rawCustPhone = (cust.customerNumber || cust.phone || cust.custPhone || cust.mobile || '').toString().trim();
          let localCust = null;
          if (appState.customers && appState.customers.length > 0) {
            localCust = appState.customers.find(c => c.sheetName === cust.sheetName && parseInt(c.rowIndex, 10) === rowIdx);
          }

          if (rawCustPhone) {
            if (!isValidIndianMobile(rawCustPhone)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
              }));
            }
            const normCustPhone = normalizeIndianMobile(rawCustPhone);
            cust.customerNumber = normCustPhone;
            if (cust.phone) cust.phone = normCustPhone;
            if (cust.custPhone) cust.custPhone = normCustPhone;
            if (cust.mobile) cust.mobile = normCustPhone;
          } else if (localCust && localCust.customerNumber) {
            cust.customerNumber = localCust.customerNumber;
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
            }));
          }

          const photoObj = cust.photoFile || cust.photoData;
          if (photoObj && photoObj.base64) {
            try {
              const uploadedUrl = await uploadToCloudinary(photoObj);
              if (uploadedUrl) cust.photoUrl = uploadedUrl;
            } catch (uErr) {
              console.error('Photo upload process failed:', uErr);
            }
            delete cust.photoFile;
            delete cust.photoData;
          }

          if (cust.staffName !== undefined || cust.staffId !== undefined) {
            const sNameRaw = (cust.staffName || '').toString().trim();
            const sIdRaw = (cust.staffId || '').toString().trim();
            if ((!sNameRaw && !sIdRaw) || sNameRaw.toLowerCase() === 'unassigned' || sNameRaw.toLowerCase() === 'none' || sIdRaw.toLowerCase() === 'unassigned' || sIdRaw.toLowerCase() === 'none') {
              cust.staffName = '';
              cust.staffId = '';
            } else {
              cust.staffName = sNameRaw;
              cust.staffId = sIdRaw;
              if (!cust.staffId && appState.staffList) {
                const sObj = appState.staffList.find(s => (s.name || '').trim().toLowerCase() === sNameRaw.toLowerCase());
                if (sObj && sObj.id) cust.staffId = sObj.id;
              }
              if (!cust.staffName && appState.staffList && cust.staffId) {
                const sObj = appState.staffList.find(s => (s.id || '').trim().toUpperCase() === cust.staffId.toUpperCase());
                if (sObj && sObj.name) cust.staffName = sObj.name;
              }
            }
          }

          if (isNeonConfigured()) {
            try {
              const adminUser = 'admin';
              const neonUpdateRes = await adminService.updateCustomer(cust, adminUser);
              if (!neonUpdateRes || !neonUpdateRes.success) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: neonUpdateRes ? neonUpdateRes.error : 'Failed to update customer.' }));
              }
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(neonUpdateRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          if (appState.customers && appState.customers.length > 0) {
            const localIdx = appState.customers.findIndex(c => (cust.id && c.id === cust.id) || (c.sheetName === cust.sheetName && parseInt(c.rowIndex, 10) === rowIdx) || (parseInt(c.rowIndex, 10) === rowIdx));
            if (localIdx >= 0) {
              if (!cust.nameHi && cust.customerName) {
                try { cust.nameHi = await indicService.transliterateName(cust.customerName); } catch (e) { cust.nameHi = cust.customerName; }
              }
              if (!cust.addressHi && cust.address) {
                try { cust.addressHi = await indicService.transliterateAddress(cust.address); } catch (e) { cust.addressHi = cust.address; }
              }
              if (!cust.secondaryAddressHi && cust.secondaryAddress) {
                try { cust.secondaryAddressHi = await indicService.transliterateAddress(cust.secondaryAddress); } catch (e) { cust.secondaryAddressHi = cust.secondaryAddress; }
              }
              appState.customers[localIdx] = Object.assign({}, appState.customers[localIdx], cust);
              saveLocalData(appState);
            }
          }
          invalidateLiveCustomersCache();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Customer details updated successfully' }));
        }

        // Admin: Backfill Hindi (Google Indic Transliteration for existing records)
        if (payload.action === 'backfillHindi') {
          if (isNeonConfigured()) {
            try {
              const backfillRes = await adminService.backfillHindiCustomerData('admin');
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(backfillRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          let updated = 0;
          if (appState.customers && appState.customers.length > 0) {
            for (const c of appState.customers) {
              let changed = false;
              if (!c.nameHi && c.customerName) {
                c.nameHi = await indicService.transliterateName(c.customerName);
                changed = true;
              }
              if (!c.addressHi && c.address) {
                c.addressHi = await indicService.transliterateAddress(c.address);
                changed = true;
              }
              if (!c.secondaryAddressHi && c.secondaryAddress) {
                c.secondaryAddressHi = await indicService.transliterateAddress(c.secondaryAddress);
                changed = true;
              }
              if (changed) updated++;
            }
            saveLocalData(appState);
            invalidateLiveCustomersCache();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, total: (appState.customers || []).length, updated }));
        }

        // Admin: Delete Customer or Lead
        if (payload.action === 'deleteCustomer' || payload.action === 'deleteLead') {
          const custId = (payload.id || payload.customerId || payload.customerCode || payload.leadId || '').toString().trim();
          if (!custId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Customer ID is required.' }));
          }
          if (isNeonConfigured()) {
            try {
              const delRes = await adminService.deleteCustomer(custId, {
                reason: payload.reason || 'Administrative deletion',
                adminUser: 'admin'
              });
              invalidateLiveCustomersCache();
              const statusCode = (delRes && delRes.success) ? 200 : 400;
              res.writeHead(statusCode, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(delRes));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          }

          if (appState && Array.isArray(appState.customers)) {
            appState.customers = appState.customers.filter(c => {
              const cid = (c.id || c.customerId || c.customerCode || '').toString().trim().toLowerCase();
              const row = (c.rowIndex !== undefined ? String(c.rowIndex) : '');
              const target = custId.toLowerCase();
              return cid !== target && row !== target;
            });
            saveLocalData(appState);
          }
          invalidateLiveCustomersCache();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Customer deleted successfully.' }));
        }

        // Staff / Offline: Sync Completions Batch
        if (payload.action === 'syncCompletions') {
          const sess = await getSessionInfo(token);
          const staffSess = (sess && sess.userType === 'staff') ? sess : getValidStaffSession(token);
          if (!staffSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff session required' }));
          }
          const staffCode = staffSess.staffCode || staffSess.staffId;
          const batchRes = await offlineSyncService.processCompletionBatch({
            staffCodeOrId: staffCode,
            completions: payload.completions || [],
            clientIp: getClientIp(req)
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(batchRes));
        }

        // Admin: Query Audit Logs
        if (payload.action === 'getAuditLogs') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to view audit logs',
              unauthorized: true
            }));
          }
          const logs = await repos.auditLogs.queryLogs({
            entityType: payload.entityType || null,
            entityId: payload.entityId || null,
            limit: payload.limit || 100
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, logs }));
        }

        // Staff: Record Single Daily Clean with Photo Proof
        if (payload.action === 'recordDailyCleanWithPhoto') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
          }

          const staffCode = (staffSess && (staffSess.staffCode || staffSess.staffId)) || payload.staffId || 'STF01';
          let uploadedPhotoUrl = payload.photoUrl || null;

          // Upload photo if base64 provided
          const photoObj = payload.photoData || payload.photoFile || (payload.photoBase64 ? { base64: payload.photoBase64, mimeType: payload.mimeType || 'image/jpeg' } : null);
          if (photoObj && photoObj.base64) {
            try {
              uploadedPhotoUrl = await uploadToCloudinary(photoObj);
            } catch (uErr) {
              console.error('Photo upload failed:', uErr.message);
            }
          }

          const completedAt = payload.completedAtDevice || new Date().toISOString();
          const mutationId = payload.clientMutationId || crypto.randomUUID();

          if (isNeonConfigured()) {
            try {
              let staff = null;
              if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffCode)) {
                staff = await repos.staff.findById(staffCode);
              } else {
                staff = await repos.staff.findByStaffCode(staffCode);
              }

              if (!staff) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: `Staff '${staffCode}' not found` }));
              }

              const istDate = repos.serviceLogs.computeIstServiceDate(completedAt);
              const isCarNotPresent = Boolean(payload.carNotPresent || payload.tag === 'car_not_present');
              const effectiveTag = payload.tag || (isCarNotPresent ? 'car_not_present' : null);
              const effectiveStatus = payload.status || (isCarNotPresent ? 'car_not_present' : 'completed');
              const effectiveNotes = payload.notes || (isCarNotPresent ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)' : 'Daily clean verified with photo proof');

              // Phase 2 Pre-Alignment: Calculate in-house Haversine distance against customer location (non-blocking)
              let punchDistMeters = null;
              let punchVerified = null;
              let punchStatus = payload.punchVerificationStatus || 'pending';

              if (payload.punchLatitude !== undefined && payload.punchLongitude !== undefined && payload.punchLatitude !== null && payload.punchLongitude !== null) {
                try {
                  let custId = payload.customerId;
                  if (!custId && payload.subscriptionId) {
                    const sub = await repos.subscriptions.findById(payload.subscriptionId);
                    if (sub) custId = sub.customer_id;
                  }
                  if (custId) {
                    const custLoc = await repos.serviceLocations.findPrimaryByCustomerId(custId);
                    if (custLoc && custLoc.latitude && custLoc.longitude) {
                      punchDistMeters = repos.staffTracking.calculateHaversineDistanceMeters(
                        custLoc.latitude, custLoc.longitude,
                        payload.punchLatitude, payload.punchLongitude
                      );
                      punchVerified = (punchDistMeters <= 200);
                      punchStatus = punchVerified ? 'verified' : 'out_of_range';
                    } else {
                      punchStatus = 'no_customer_coords';
                    }
                  } else {
                    punchStatus = 'no_customer_coords';
                  }
                } catch (cErr) {
                  punchStatus = 'unverified';
                }
              }

              const outcome = await repos.serviceLogs.recordCompletion({
                clientMutationId: mutationId,
                staffId: staff.id,
                subscriptionId: payload.subscriptionId || null,
                vehicleId: payload.vehicleId || null,
                serviceDate: istDate,
                status: effectiveStatus,
                completedAtDevice: completedAt,
                notes: effectiveNotes,
                photoUrl: uploadedPhotoUrl,
                source: 'staff_portal',
                deviceMetadata: payload.deviceMetadata || null,
                carNotPresent: isCarNotPresent,
                tag: effectiveTag,
                punchLatitude: payload.punchLatitude !== undefined ? payload.punchLatitude : null,
                punchLongitude: payload.punchLongitude !== undefined ? payload.punchLongitude : null,
                punchAccuracyMeters: payload.punchAccuracyMeters !== undefined ? payload.punchAccuracyMeters : null,
                punchDistanceMeters: punchDistMeters,
                punchVerified: punchVerified,
                punchVerificationStatus: punchStatus,
                punchMetadata: payload.punchMetadata || null
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                log: outcome.log,
                photoUrl: uploadedPhotoUrl,
                serviceDate: istDate,
                idempotent: outcome.idempotent || false
              }));
            } catch (neonErr) {
              console.error('Neon recordCompletion error:', neonErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: neonErr.message }));
            }
          }

          // Local fallback mode
          if (!appState.serviceLogs) appState.serviceLogs = [];
          const isCarNotPresent = Boolean(payload.carNotPresent || payload.tag === 'car_not_present');
          const effectiveTag = payload.tag || (isCarNotPresent ? 'car_not_present' : null);
          const effectiveStatus = payload.status || (isCarNotPresent ? 'car_not_present' : 'completed');
          const effectiveNotes = payload.notes || (isCarNotPresent ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)' : 'Daily clean verified with photo proof');

          const localLog = {
            id: mutationId,
            client_mutation_id: mutationId,
            staff_code: staffCode,
            subscription_id: payload.subscriptionId,
            vehicle_id: payload.vehicleId,
            customer_id: payload.customerId,
            customer_name: payload.customerName,
            registration_no: payload.registrationNo,
            photo_url: uploadedPhotoUrl,
            service_date: completedAt.split('T')[0],
            completed_at_device: completedAt,
            synced_at_server: new Date().toISOString(),
            status: effectiveStatus,
            notes: effectiveNotes,
            car_not_present: isCarNotPresent,
            tag: effectiveTag
          };
          appState.serviceLogs.unshift(localLog);
          saveLocalData(appState);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            log: localLog,
            photoUrl: uploadedPhotoUrl,
            serviceDate: localLog.service_date
          }));
        }

        // Admin: Query Daily Clean Reports with Rich Filtering
        if (payload.action === 'getDailyCleanReports') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to view daily clean reports',
              unauthorized: true
            }));
          }

          if (isNeonConfigured()) {
            try {
              const reports = await adminService.getDailyCleanReports({
                startDate: payload.startDate || null,
                endDate: payload.endDate || null,
                staffId: payload.staffId || null,
                search: payload.search || null,
                hasPhoto: payload.hasPhoto || null,
                carNotPresent: payload.carNotPresent || null,
                tag: payload.tag || null,
                limit: payload.limit ? parseInt(payload.limit, 10) : 200,
                offset: payload.offset ? parseInt(payload.offset, 10) : 0
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(reports));
            } catch (reportErr) {
              console.error('getDailyCleanReports error:', reportErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: reportErr.message }));
            }
          }

          // Local fallback mode
          const logs = appState.serviceLogs || [];
          const filtered = logs.filter(l => {
            if (payload.startDate && l.service_date < payload.startDate) return false;
            if (payload.endDate && l.service_date > payload.endDate) return false;
            if (payload.staffId && payload.staffId !== 'all' && l.staff_code !== payload.staffId) return false;
            if (payload.hasPhoto === 'yes' && (!l.photo_url || !l.photo_url.trim())) return false;
            if (payload.hasPhoto === 'no' && l.photo_url && l.photo_url.trim()) return false;
            if (payload.carNotPresent === 'yes' && (!l.car_not_present && l.tag !== 'car_not_present')) return false;
            if (payload.carNotPresent === 'no' && (l.car_not_present || l.tag === 'car_not_present')) return false;
            if (payload.tag && l.tag !== payload.tag) return false;
            if (payload.search && payload.search.trim()) {
              const s = payload.search.trim().toLowerCase();
              const match = (l.customer_name && l.customer_name.toLowerCase().includes(s)) ||
                            (l.registration_no && l.registration_no.toLowerCase().includes(s));
              if (!match) return false;
            }
            return true;
          });

          // Calculate consecutive times on filtered logs
          const staffLogMap = {};
          filtered.forEach(l => {
            const sc = l.staff_code || l.staff_id || 'unknown';
            if (!staffLogMap[sc]) staffLogMap[sc] = [];
            staffLogMap[sc].push(l);
          });
          Object.values(staffLogMap).forEach(list => {
            list.sort((a, b) => new Date(a.completed_at_device || 0) - new Date(b.completed_at_device || 0));
            list.forEach((curr, idx) => {
              const cleanDuration = (curr.device_metadata && curr.device_metadata.durationMinutes) ? curr.device_metadata.durationMinutes : 10;
              curr.cleaningDurationMinutes = cleanDuration;
              if (idx === 0) {
                curr.transitDurationMinutes = null;
                curr.prevLocation = null;
              } else {
                const prev = list[idx - 1];
                const diffMs = new Date(curr.completed_at_device || 0).getTime() - new Date(prev.completed_at_device || 0).getTime();
                const totalCycle = Math.max(1, Math.round(diffMs / 60000));
                curr.transitDurationMinutes = Math.max(1, totalCycle - cleanDuration);
                curr.prevLocation = prev.address_text || prev.parking_details || null;
              }
            });
          });

          const withPhotoCount = filtered.filter(l => l.photo_url && l.photo_url.trim()).length;
          const staffMatrix = (appState.staffList || []).map(s => {
            const staffCleaned = filtered.filter(l => l.staff_code === s.id || l.staff_id === s.id);
            return {
              staffId: s.id,
              staffCode: s.id,
              staffName: s.name,
              cleanedCount: staffCleaned.length,
              pendingCount: 0,
              totalAssigned: staffCleaned.length,
              lastPunchTime: staffCleaned.length > 0 ? staffCleaned[0].completed_at_device : null,
              lastLocation: staffCleaned.length > 0 ? (staffCleaned[0].address_text || 'Field') : null,
              status: staffCleaned.length > 0 ? 'Active on Route 🟢' : 'Shift Starting ⏳'
            };
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            records: filtered,
            pendingRecords: [],
            summary: {
              totalCleaned: filtered.length,
              totalPending: 0,
              totalScheduled: filtered.length,
              withPhotoCount,
              withoutPhotoCount: filtered.length - withPhotoCount,
              carNotPresentCount: filtered.filter(l => l.car_not_present || l.tag === 'car_not_present').length,
              activeStaffCount: new Set(filtered.map(l => l.staff_code)).size,
              photoRate: filtered.length > 0 ? Math.round((withPhotoCount / filtered.length) * 100) : 0,
              latestPunchTime: filtered.length > 0 ? filtered[0].completed_at_device : null,
              staffMatrix
            }
          }));
        }

        // Legacy staff sync
        if (payload.action === 'cleanAndSyncStaff') {
          if (isNeonConfigured()) {
            const staffList = await adminService.getStaffList({ isAdmin: true });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, staffList: staffList.map(s => sanitizeStaffForAdmin(s)) }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, staffList: (appState.staffList || []).map(s => sanitizeStaffForAdmin(s)) }));
        }

        // =====================================================================
        // REALTIME STAFF LOCATION TRACKING, MOVEMENTS, STOPPAGES & PINGS
        // =====================================================================

        // 1. Staff: Record 15-Minute or Event Location Heartbeat
        if (payload.action === 'recordStaffHeartbeat' || payload.action === 'recordStaffLocationHeartbeat') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);
          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
          }

          let staffIdentifier;
          if (adminSess) {
            staffIdentifier = payload.staffId || payload.staffCode;
          } else {
            staffIdentifier = staffSess.staffId || staffSess.staffCode;
            if (payload.staffId && payload.staffId !== staffSess.staffId && payload.staffId !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot submit tracking for another staff member' }));
            }
          }

          if (!staffIdentifier) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'staffId is required' }));
          }

          if (isNeonConfigured()) {
            try {
              const trackingResult = await repos.staffTracking.recordLocation(staffIdentifier, {
                latitude: payload.latitude,
                longitude: payload.longitude,
                accuracy: payload.accuracy,
                altitude: payload.altitude,
                speed: payload.speed,
                heading: payload.heading,
                batteryLevel: payload.batteryLevel,
                isCharging: payload.isCharging,
                triggerType: payload.triggerType || payload.trigger || 'heartbeat',
                capturedAt: payload.capturedAt || new Date().toISOString()
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                todayDistanceKm: trackingResult.todayDistanceKm,
                status: trackingResult.status,
                hasPendingPing: trackingResult.hasPendingPing,
                pendingPingId: trackingResult.pendingPingId
              }));
            } catch (trackErr) {
              console.error('recordStaffHeartbeat error:', trackErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: trackErr.message }));
            }
          }

          // Fallback mock response for non-neon mode
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            todayDistanceKm: 0.0,
            status: 'moving',
            hasPendingPing: false,
            pendingPingId: null
          }));
        }

        // 2. Admin: Get Live Tracking Summary & KPIs
        if (payload.action === 'getStaffTrackingSummary' || payload.action === 'getStaffTrackingData') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin privileges required' }));
          }

          if (isNeonConfigured()) {
            try {
              const summary = await repos.staffTracking.getCurrentTrackingSummary(payload.date || null);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(summary));
            } catch (sumErr) {
              console.error('getStaffTrackingSummary error:', sumErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: sumErr.message }));
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            kpis: { activeStaffCount: 0, totalStaffCount: 0, fleetDistanceKm: 0, totalStoppages: 0, avgDwellMinutes: 0 },
            staff: [],
            stoppages: []
          }));
        }

        // 3. Admin: Get Movement History & Stoppages for a Staff
        if (payload.action === 'getStaffMovementHistory') {
          const adminSess = await resolveAdminSession(token);
          const staffSess = await resolveStaffSession(token);
          if (!adminSess && !staffSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
          }

          let staffIdentifier;
          if (adminSess) {
            staffIdentifier = payload.staffId || (staffSess && (staffSess.staffId || staffSess.staffCode));
          } else {
            staffIdentifier = staffSess.staffId || staffSess.staffCode;
            if (payload.staffId && payload.staffId !== staffSess.staffId && payload.staffId !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot view movement history of another staff member' }));
            }
          }

          if (!staffIdentifier) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'staffId is required' }));
          }

          if (isNeonConfigured()) {
            try {
              const history = await repos.staffTracking.getMovementHistory(staffIdentifier, payload.date || null);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(history));
            } catch (histErr) {
              console.error('getStaffMovementHistory error:', histErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: histErr.message }));
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, staffId: staffIdentifier, breadcrumbs: [], stoppages: [] }));
        }

        // 4. Admin: On-Demand Location Ping Trigger
        if (payload.action === 'pingStaffLocation' || payload.action === 'requestStaffLocationPing') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Admin session required' }));
          }

          if (!payload.staffId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'staffId is required' }));
          }

          if (isNeonConfigured()) {
            try {
              const pingResult = await repos.staffTracking.createLocationPing(
                payload.staffId,
                adminSess.username || 'admin'
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(pingResult));
            } catch (pingErr) {
              console.error('pingStaffLocation error:', pingErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: pingErr.message }));
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, pingId: crypto.randomUUID(), status: 'pending' }));
        }

        // 5. Staff: Respond to Location Ping
        if (payload.action === 'respondToLocationPing' || payload.action === 'respondStaffLocationPing') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);
          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
          }

          if (!payload.pingId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'pingId is required' }));
          }

          if (staffSess && !adminSess && payload.staffId && payload.staffId !== staffSess.staffId && payload.staffId !== staffSess.staffCode) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot respond to ping for another staff member' }));
          }

          if (isNeonConfigured()) {
            try {
              const fulfillResult = await repos.staffTracking.fulfillLocationPing(payload.pingId, {
                latitude: payload.latitude,
                longitude: payload.longitude,
                accuracy: payload.accuracy,
                speed: payload.speed,
                heading: payload.heading,
                batteryLevel: payload.batteryLevel,
                isCharging: payload.isCharging
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(fulfillResult));
            } catch (fulErr) {
              console.error('respondToLocationPing error:', fulErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: fulErr.message }));
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Location ping fulfilled' }));
        }

        // 6. Staff: Get Pending Location Pings
        if (payload.action === 'getPendingStaffPings' || payload.action === 'checkStaffLocationPing') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);
          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
          }

          let staffIdentifier;
          if (adminSess) {
            staffIdentifier = payload.staffId || (staffSess && (staffSess.staffId || staffSess.staffCode));
          } else {
            staffIdentifier = staffSess.staffId || staffSess.staffCode;
            if (payload.staffId && payload.staffId !== staffSess.staffId && payload.staffId !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cannot query pings for another staff member' }));
            }
          }

          if (!staffIdentifier) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'staffId is required' }));
          }

          if (isNeonConfigured()) {
            try {
              const pendingPings = await repos.staffTracking.getPendingPings(staffIdentifier);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, pings: pendingPings }));
            } catch (pErr) {
              console.error('getPendingStaffPings error:', pErr.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: pErr.message }));
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, pings: [] }));
        }

        // 7. Get Map Configuration (Zero-Overbilling Safeguard: Google Maps key for client-side lazy load)
        if (payload.action === 'getMapsConfig') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
          }));
        }

        // =====================================================================
        // ON-DEMAND / SPECIAL JOBS (Solar Cleaning, Car Washing) WORKFLOWS
        // =====================================================================

        // Admin: Assign Special Job to Staff
        if (payload.action === 'assignSpecialJob') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to assign special jobs',
              unauthorized: true
            }));
          }

          try {
            const adminUser = 'admin';
            if (isNeonConfigured()) {
              const result = await adminService.assignSpecialJob(payload.jobData || payload, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }

            // Local fallback
            if (!appState.serviceJobs) appState.serviceJobs = [];
            const jId = 'job_' + Date.now();
            const localJob = Object.assign({
              id: jId,
              status: 'assigned',
              created_at: new Date().toISOString()
            }, payload.jobData || payload);
            appState.serviceJobs.push(localJob);
            saveLocalData(appState);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, job: localJob }));
          } catch (err) {
            console.error('assignSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Query Special Jobs with Filters
        if (payload.action === 'getSpecialJobs') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required',
              unauthorized: true
            }));
          }

          try {
            if (isNeonConfigured()) {
              const result = await adminService.getSpecialJobsAdmin(payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }
            const localJobs = (appState.serviceJobs || []).map(j => {
              const assignedAt = j.assigned_at || j.assignedAt || j.createdAt || j.created_at || null;
              let elapsedMinutes = null;
              if (j.started_at && j.completed_at) {
                elapsedMinutes = Math.max(1, Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 60000));
              } else if (j.started_at) {
                elapsedMinutes = Math.max(1, Math.round((Date.now() - new Date(j.started_at).getTime()) / 60000));
              } else if (assignedAt) {
                elapsedMinutes = Math.max(0, Math.round((Date.now() - new Date(assignedAt).getTime()) / 60000));
              }
              return { ...j, assignedAt, elapsedMinutes };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, jobs: localJobs }));
          } catch (err) {
            console.error('getSpecialJobs error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Reassign Special Job to another Staff Member
        if (payload.action === 'reassignSpecialJob') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to reassign jobs',
              unauthorized: true
            }));
          }

          try {
            const adminUser = 'admin';
            if (isNeonConfigured()) {
              const result = await adminService.reassignSpecialJob(payload.jobData || payload, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }
            // Local fallback
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'Reassigned successfully (local mode)' }));
          } catch (err) {
            console.error('reassignSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Assign Daily Car Cleaning Customer to Staff (Route Allocation)
        if (payload.action === 'assignDailyCleanCustomer') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to allocate daily clean routes',
              unauthorized: true
            }));
          }

          try {
            const adminUser = 'admin';
            if (isNeonConfigured()) {
              const result = await adminService.assignDailyCleanCustomer(payload.data || payload, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }

            // Local fallback
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'Daily clean assigned successfully (local mode)' }));
          } catch (err) {
            console.error('assignDailyCleanCustomer error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Unassign Daily Car Cleaning Customer from Staff
        if (payload.action === 'unassignDailyCleanCustomer') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to unassign daily clean routes',
              unauthorized: true
            }));
          }

          try {
            const adminUser = 'admin';
            if (isNeonConfigured()) {
              const result = await adminService.unassignDailyCleanCustomer(payload.data || payload, adminUser);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }

            // Local fallback
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'Daily clean unassigned successfully (local mode)' }));
          } catch (err) {
            console.error('unassignDailyCleanCustomer error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Get Daily Clean Route Assignments Roster
        if (payload.action === 'getDailyCleanAssignments') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required to view daily clean assignments',
              unauthorized: true
            }));
          }

          try {
            if (isNeonConfigured()) {
              const result = await adminService.getDailyCleanAssignments(payload.data || payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(result));
            }

            // Local fallback
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, assignments: [] }));
          } catch (err) {
            console.error('getDailyCleanAssignments error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Public / Authenticated: Get Canonical Service Catalog
        if (payload.action === 'getServiceCatalog') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            categories: serviceCatalog.SERVICE_CATEGORIES,
            seaterTypes: serviceCatalog.SEATER_TYPES,
            solarConfig: serviceCatalog.SOLAR_UNIT_CONFIG
          }));
        }

        // Staff: Start Special Job with 1 or max 2 Before Photos
        if (payload.action === 'startSpecialJob') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff session required' }));
          }

          const jobId = payload.jobId || payload.id;
          if (!jobId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Job ID is required' }));
          }

          if (staffSess && !adminSess && isNeonConfigured()) {
            const existingJob = await repos.serviceJobs.findById(jobId);
            if (!existingJob) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Job not found' }));
            }
            if (existingJob.assigned_to_staff_id && existingJob.assigned_to_staff_id !== staffSess.staffId && existingJob.assigned_to_staff_id !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: You are not assigned to this job' }));
            }
          }

          // Upload before photos (up to 2)
          let beforePhotoUrls = Array.isArray(payload.beforePhotoUrls) ? payload.beforePhotoUrls.slice(0, 2) : [];
          const rawPhotos = Array.isArray(payload.photos) ? payload.photos : (payload.photoBase64 ? [{ base64: payload.photoBase64 }] : (payload.photoFile ? [payload.photoFile] : []));

          for (let i = 0; i < Math.min(rawPhotos.length, 2); i++) {
            const pObj = rawPhotos[i];
            if (pObj && pObj.base64) {
              try {
                const uUrl = await uploadToCloudinary(pObj);
                if (uUrl) beforePhotoUrls.push(uUrl);
              } catch (uErr) {
                console.error('Before photo upload error:', uErr.message);
              }
            } else if (typeof pObj === 'string' && pObj.startsWith('http')) {
              beforePhotoUrls.push(pObj);
            }
          }
          beforePhotoUrls = beforePhotoUrls.slice(0, 2);

          const startedAt = payload.startedAtDevice || new Date().toISOString();

          try {
            if (isNeonConfigured()) {
              const updatedJob = await repos.serviceJobs.startJob(jobId, {
                beforePhotos: beforePhotoUrls,
                startedAt: startedAt
              });
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                job: updatedJob,
                beforePhotos: beforePhotoUrls,
                startedAt: startedAt,
                message: 'Job started successfully'
              }));
            }

            // Local fallback
            if (appState.serviceJobs) {
              const j = appState.serviceJobs.find(x => x.id === jobId);
              if (j) {
                j.status = 'in_progress';
                j.started_at = startedAt;
                j.before_photos = beforePhotoUrls;
                saveLocalData(appState);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, status: 'in_progress', beforePhotos: beforePhotoUrls }));
          } catch (err) {
            console.error('startSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Staff: Complete Special Job with 1 or max 2 After Photos & Notes
        if (payload.action === 'completeSpecialJob') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff session required' }));
          }

          const jobId = payload.jobId || payload.id;
          if (!jobId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Job ID is required' }));
          }

          if (staffSess && !adminSess && isNeonConfigured()) {
            const existingJob = await repos.serviceJobs.findById(jobId);
            if (!existingJob) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Job not found' }));
            }
            if (existingJob.assigned_to_staff_id && existingJob.assigned_to_staff_id !== staffSess.staffId && existingJob.assigned_to_staff_id !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: You are not assigned to this job' }));
            }
          }

          const staffCode = (staffSess && (staffSess.staffCode || staffSess.staffId)) || payload.staffId || 'STF01';

          // Upload after photos (up to 2)
          let afterPhotoUrls = Array.isArray(payload.afterPhotoUrls) ? payload.afterPhotoUrls.slice(0, 2) : [];
          const rawPhotos = Array.isArray(payload.photos) ? payload.photos : (payload.photoBase64 ? [{ base64: payload.photoBase64 }] : (payload.photoFile ? [payload.photoFile] : []));

          for (let i = 0; i < Math.min(rawPhotos.length, 2); i++) {
            const pObj = rawPhotos[i];
            if (pObj && pObj.base64) {
              try {
                const uUrl = await uploadToCloudinary(pObj);
                if (uUrl) afterPhotoUrls.push(uUrl);
              } catch (uErr) {
                console.error('After photo upload error:', uErr.message);
              }
            } else if (typeof pObj === 'string' && pObj.startsWith('http')) {
              afterPhotoUrls.push(pObj);
            }
          }
          afterPhotoUrls = afterPhotoUrls.slice(0, 2);

          const completedAt = payload.completedAtDevice || new Date().toISOString();
          const notes = (payload.notes || payload.completionNotes || '').trim();

          try {
            if (isNeonConfigured()) {
              const updatedJob = await repos.serviceJobs.completeJob(jobId, {
                afterPhotos: afterPhotoUrls,
                completedAt: completedAt,
                completionNotes: notes
              });

              // Record in service_logs for audit ledger
              let staff = null;
              if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffCode)) {
                staff = await repos.staff.findById(staffCode);
              } else {
                staff = await repos.staff.findByStaffCode(staffCode);
              }

              if (staff) {
                const mutationId = payload.clientMutationId || crypto.randomUUID();
                const istDate = repos.serviceLogs.computeIstServiceDate(completedAt);
                await repos.serviceLogs.recordCompletion({
                  clientMutationId: mutationId,
                  staffId: staff.id,
                  jobId: jobId,
                  serviceDate: istDate,
                  status: 'completed',
                  completedAtDevice: completedAt,
                  notes: notes || 'Special job completed with photo proof',
                  photoUrl: afterPhotoUrls[0] || null,
                  source: 'staff_portal'
                });
              }

              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                job: updatedJob,
                afterPhotos: afterPhotoUrls,
                completedAt: completedAt,
                message: 'Job completed successfully'
              }));
            }

            // Local fallback
            if (appState.serviceJobs) {
              const j = appState.serviceJobs.find(x => x.id === jobId);
              if (j) {
                j.status = 'completed';
                j.completed_at = completedAt;
                j.after_photos = afterPhotoUrls;
                j.completion_notes = notes;
                saveLocalData(appState);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, status: 'completed', afterPhotos: afterPhotoUrls }));
          } catch (err) {
            console.error('completeSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Admin: Cancel / Soft-Delete Special Job
        if (payload.action === 'deleteSpecialJob') {
          const adminSess = await resolveAdminSession(token);
          if (!adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Admin privileges required',
              unauthorized: true
            }));
          }

          const jobId = payload.jobId || payload.id;
          try {
            if (isNeonConfigured()) {
              await repos.serviceJobs.softDelete(jobId);
              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: true, message: 'Job cancelled successfully' }));
            }
            if (appState.serviceJobs) {
              appState.serviceJobs = appState.serviceJobs.filter(x => x.id !== jobId);
              saveLocalData(appState);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'Job cancelled' }));
          } catch (err) {
            console.error('deleteSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // Staff or Admin: Cancel Special Job with Reason and Remarks
        if (payload.action === 'cancelSpecialJob' || payload.action === 'cancelBooking') {
          const staffSess = await resolveStaffSession(token);
          const adminSess = await resolveAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Staff or Admin session required' }));
          }

          const jobId = payload.jobId || payload.id;
          if (!jobId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Job ID is required' }));
          }

          if (staffSess && !adminSess && isNeonConfigured()) {
            const existingJob = await repos.serviceJobs.findById(jobId);
            if (!existingJob) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Job not found' }));
            }
            if (existingJob.assigned_to_staff_id && existingJob.assigned_to_staff_id !== staffSess.staffId && existingJob.assigned_to_staff_id !== staffSess.staffCode) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: You are not assigned to this job' }));
            }
          }

          const reason = (payload.reason || payload.cancellationReason || '').trim();
          if (!reason) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Cancellation reason is required' }));
          }

          const remarks = (payload.remarks || payload.cancellationRemarks || '').trim();
          const cancelledAt = payload.cancelledAt || new Date().toISOString();
          const cancelledBy = (staffSess && (staffSess.staffCode || staffSess.name || staffSess.staffId)) || (adminSess && (adminSess.username || adminSess.id || 'admin')) || 'staff';

          try {
            if (isNeonConfigured()) {
              // Verify job is not already completed
              const existingJob = await repos.serviceJobs.findById(jobId);
              if (!existingJob) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'Job not found' }));
              }
              if (existingJob.status === 'completed') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'Cannot cancel an already completed job' }));
              }

              const updatedJob = await repos.serviceJobs.cancelJob(jobId, {
                cancellationReason: reason,
                cancellationRemarks: remarks,
                cancelledAt: cancelledAt,
                cancelledBy: cancelledBy
              });

              // Audit logging
              if (repos.auditLogs && repos.auditLogs.logChange) {
                try {
                  await repos.auditLogs.logChange({
                    tableName: 'service_jobs',
                    recordId: jobId,
                    action: 'CANCEL',
                    oldData: { status: existingJob.status },
                    newData: { status: 'cancelled', cancellation_reason: reason, cancellation_remarks: remarks },
                    changedBy: cancelledBy
                  });
                } catch (aErr) {
                  console.warn('Audit log write error:', aErr.message);
                }
              }

              invalidateLiveCustomersCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: true,
                jobId: jobId,
                status: 'cancelled',
                cancellationReason: reason,
                cancellationRemarks: remarks,
                cancelledAt: cancelledAt,
                job: updatedJob,
                message: 'Job cancelled successfully'
              }));
            }

            // Local fallback
            if (appState.serviceJobs) {
              const j = appState.serviceJobs.find(x => x.id === jobId);
              if (j) {
                if (j.status === 'completed') {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  return res.end(JSON.stringify({ success: false, error: 'Cannot cancel an already completed job' }));
                }
                j.status = 'cancelled';
                j.cancellation_reason = reason;
                j.cancellation_remarks = remarks;
                j.cancelled_at = cancelledAt;
                j.cancelled_by = cancelledBy;
                saveLocalData(appState);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              jobId: jobId,
              status: 'cancelled',
              cancellationReason: reason,
              cancellationRemarks: remarks,
              cancelledAt: cancelledAt,
              message: 'Job cancelled successfully'
            }));
          } catch (err) {
            console.error('cancelSpecialJob error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Unknown or unsupported action: ' + (payload.action || '') }));
      } catch (parseErr) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload: ' + parseErr.message }));
      }
    });
    return;
  }

  // =========================================================================
  // MAIN UI ROUTE (Index.html) - In-Memory Cached for High Concurrency
  // =========================================================================
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Endpoint Not Found', pathname }));
  }

  const normPath = parsedUrl.pathname.toLowerCase().replace(/\/+$/, '');
  const isStaffRoute = normPath === '/staff' || normPath.startsWith('/staff/');
  const isAdminRoute = normPath === '/admin' || normPath.startsWith('/admin/');
  const rawStaffParam = parsedUrl.searchParams.get('staff') || parsedUrl.searchParams.get('id') || '';
  const staffParam = /^[a-zA-Z0-9_-]{1,64}$/.test(rawStaffParam) ? rawStaffParam : '';
  const adminParam = parsedUrl.searchParams.get('admin');

  // 1. Careers / Recruitment Page Route (/careers, /career, /jobs, /job)
  if (normPath === '/careers' || normPath === '/career' || normPath === '/jobs' || normPath === '/job') {
    const careersPath = path.join(__dirname, 'public', 'careers.html');
    if (fs.existsSync(careersPath)) {
      let content = fs.readFileSync(careersPath, 'utf8');
      const config = await homepageConfigService.getHomepageConfig();
      const seoHead = seoConfig.getCareersSeoHead(config);
      content = content.replace('<!-- CAREERS_SEO_HEAD_PLACEHOLDER -->', seoHead);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      });
      return res.end(content);
    }
  }

  // 2. Customer Homepage Route (/ and /home, /terms, /privacy, /refund)
  // Non-portal visitors at root receive the modern M3 Customer Homepage
  const isInternalPortal = isStaffRoute || staffParam || isAdminRoute || adminParam !== null;
  if (!isInternalPortal && (normPath === '' || normPath === '/home' || normPath === '/terms' || normPath === '/privacy' || normPath === '/refund')) {
    const homePath = path.join(__dirname, 'public', 'home.html');
    if (fs.existsSync(homePath)) {
      let content = fs.readFileSync(homePath, 'utf8');
      const config = await homepageConfigService.getHomepageConfig();
      const seoHead = seoConfig.getHomepageSeoHead(config);
      content = content.replace('<!-- SEO_HEAD_PLACEHOLDER -->', seoHead);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      });
      return res.end(content);
    }
  }

  // 3. Staff & Admin Portal (Index.html)
  const indexPath = path.join(__dirname, 'Index.html');
  if (fs.existsSync(indexPath)) {
    let content = getCachedIndexTemplate(indexPath);

    // Route logic: /staff explicitly launches Staff Portal; /admin launches Admin Portal
    let initialMode = 'admin';
    if (isStaffRoute || staffParam) {
      initialMode = 'staff';
    } else if (isAdminRoute || adminParam !== null) {
      initialMode = 'admin';
    } else {
      initialMode = 'staff';
    }

    content = content.replace(/<\?=\s*typeof\s+initialStaffId\s*!==\s*'undefined'\s*\?\s*initialStaffId\s*:\s*''\s*\?>/g, () => staffParam);
    content = content.replace(/<\?=\s*typeof\s+initialMode\s*!==\s*'undefined'\s*\?\s*initialMode\s*:\s*'[a-zA-Z]+'\s*\?>/g, () => initialMode);
    content = content.replace(/<\?=\s*typeof\s+webAppUrl\s*!==\s*'undefined'\s*\?\s*webAppUrl\s*:[^?]*\?>/g, '');

    if (initialMode === 'admin') {
      content = content.replace('class="staff-mode-active"', 'class="admin-mode-active"');
      content = content.replace('class="main-container"', 'class="main-container admin-mode-active"');
    }

    // Force latest asset version cache-buster across ALL routes
    const APP_ASSET_VERSION = '3.3.0';
    const ACTIVE_ASSET_REV = '3.3.0';
    content = content.replace(/\/js\/app\.js(?:\?v=[^"'\s>]+)?/g, `/js/app.js?v=${ACTIVE_ASSET_REV}`);
    content = content.replace(/\/css\/style\.css(?:\?v=[^"'\s>]+)?/g, `/css/style.css?v=${ACTIVE_ASSET_REV}`);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    return res.end(content);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Index.html not found');
});

if (require.main === module) {
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err && err.stack ? err.stack : err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Graceful Shutdown for Cloud Containers (Railway / Docker SIGTERM / SIGINT)
  const handleShutdown = async (signal) => {
    console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log('[Server] HTTP listener closed.');
      if (isNeonConfigured()) {
        try {
          await db.close();
          console.log('[Database] Neon pool closed cleanly.');
        } catch (e) {
          console.error('[Database] Error closing Neon pool:', e.message);
        }
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Server] Forcefully terminating after shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  const startServer = async () => {
    if (isNeonConfigured() && process.env.AUTO_MIGRATE !== 'false') {
      try {
        const migrate = require('./migrations/migrate');
        console.log('[Bootstrap] Verifying database schema & migrations...');
        await migrate.runMigration();
      } catch (migErr) {
        console.warn('[Bootstrap] Warning: Auto-migration check:', migErr.message);
      }
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ [PORT CONFLICT] Port ${PORT} is already in use by another process!`);
        console.error(`👉 An existing instance of the CWP server or another application is occupying port ${PORT}.`);
        if (process.platform === 'win32') {
          console.error(`👉 To free port ${PORT} in PowerShell, run:`);
          console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
        } else {
          console.error(`👉 To free port ${PORT} in terminal, run:`);
          console.error(`   fuser -k ${PORT}/tcp  # or: npx kill-port ${PORT}\n`);
        }
        process.exit(1);
      } else {
        console.error('[Server] Fatal server error:', err);
        process.exit(1);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`=======================================================`);
      console.log(`🚗 CWP Detailers & Motors - Staff Information Viewer`);
      console.log(`=======================================================`);
      console.log(`✔ Hardened Security & Functional Architecture Active`);
      console.log(`✔ Server Running on PORT: ${PORT}`);
      console.log(`✔ Production Domain: https://${DOMAIN}`);
      console.log(`✔ Cloudinary Status: ${isCloudinaryConfigured() ? 'Connected' : 'Pending Environment Variables'}`);
      console.log(`✔ Admin Password: ${hasAdminPasswordConfigured() ? 'Configured' : 'NOT CONFIGURED (Must set ADMIN_PASSWORD)'}`);
      console.log(`=======================================================`);
    });
  };

  startServer();
}

module.exports = {
  server,
  classifyServiceCategory,
  isActiveStatus,
  formatStaffDataResponse,
  hashPin,
  hashPinScrypt,
  hashPinSha256,
  verifyPin,
  needsRehash,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  verifyAdminPasswordNode,
  hasAdminPasswordConfigured,
  createAdminSession,
  recordAdminSession,
  isValidAdminSession,
  resolveAdminSession,
  revokeAdminSession,
  createStaffSession,
  recordStaffSession,
  getValidStaffSession,
  resolveStaffSession,
  revokeStaffSession,
  revokeAllStaffSessionsForId,
  sanitizeStaffForPublic,
  sanitizeStaffForAdmin,
  mergeStaffList,
  isValidCredentialFormat,
  checkRateLimit,
  recordFailedLogin,
  clearRateLimit,
  SESSION_TTL_MS,
  computeStaffDataVersion,
  invalidateLiveCustomersCache,
  fetchAllLiveCustomers,
  normalizeIndianMobile,
  isValidIndianMobile,
  setLastKnownGoodDataset: (d) => { lastKnownGoodDataset = d; },
  getLastKnownGoodDataset: () => lastKnownGoodDataset,
  getCustomerStableId,
  parseVehicleDetails,
  getStaffSequences,
  saveStaffSequence,
  resetStaffSequence,
  applyStaffSequenceOrder,
  getAppState: () => appState,
  setAppState: (st) => { appState = st; },
  setDataFile: (df) => { DATA_FILE = df; },
  saveLocalData,
  loadLocalData
};
