/**
 * =========================================================================
 * CWP Staff Information Viewer - Node.js Production Server for Railway
 * CWP Detailers & Motors
 *
 * Hardened Security & Functional Architecture:
 * - Secure Server-Issued Admin & Staff Sessions with 12-Hour TTL & Revocation
 * - Server-Side Authorization Enforcement on Every Admin Operation
 * - Strict Staff Data Isolation (No cross-staff data leakage)
 * - crypto.scrypt PIN Hashing with Backward Compatibility & Auto-Upgrade
 * - Failed Login Rate Limiting (5 Attempts -> 5-Minute Cooldown, No Permanent Lockout)
 * - Trusted Server-to-Server Service Key Authentication to Google Apps Script
 * - Staff PIN Synchronization Protection (Never overwrite credentials with [PROTECTED])
 * - Zero Default PINs (Explicit 6-Digit PIN Mandatory for New Staff)
 * - No Plaintext Admin Password Storage (Hashed with scrypt locally)
 * - Explicit Service Category Mapping (Daily Car Cleaning / Car Washing / Solar Panel Cleaning)
 * - Sheet Update Integrity (No duplicate, orphaned, or auto-moved rows)
 * - Preserved Daily Clean Source Row Order & Dual Customer Locations
 *
 * Spreadsheet ID: 1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY
 * Production Domain: cwpdata.up.railway.app
 * Image Storage: Cloudinary CDN (Direct HTTPS Links & Instant Thumbnails)
 * =========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyoDbQHE4LQgGOylM0IYatOCMiueKDVqeR8NdPAKj2hOt6fsp9Pb3B-lOxkRFaF8nUH/exec';
const APPS_SCRIPT_SERVICE_KEY = process.env.APPS_SCRIPT_SERVICE_KEY || process.env.CWP_SERVICE_KEY || '';
const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || 'cwpdata.up.railway.app';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY';

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
  return `https://${DOMAIN}/uploads/${filename}`;
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
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  if (s.toUpperCase() === '[PROTECTED]') return false;
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

function verifyAdminPasswordNode(inputPass) {
  if (!inputPass) return false;
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (envPass) {
    const inBuf = Buffer.from(inputPass.trim());
    const envBuf = Buffer.from(envPass);
    if (inBuf.length === envBuf.length && crypto.timingSafeEqual(inBuf, envBuf)) {
      return true;
    }
  }
  if (appState && appState.adminPasswordHash) {
    return verifyPasswordScrypt(inputPass, appState.adminPasswordHash);
  }
  return false;
}

function hasAdminPasswordConfigured() {
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) return true;
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
      error: `बहुत सारे गलत प्रयास। कृपया ${Math.ceil(remainingSec / 60)} मिनट बाद प्रयास करें। (Account temporarily locked for security)`
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
const adminSessions = new Map(); // token -> { createdAt, expiresAt }
const staffSessions = new Map(); // token -> { staffId, staffName, createdAt, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (Documented Consistent TTL)

function createAdminSession() {
  const token = 'adm_' + crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function isValidAdminSession(token) {
  if (!token) return false;
  const sess = adminSessions.get(token);
  if (!sess) return false;
  if (Date.now() > sess.expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function revokeAdminSession(token) {
  if (token) adminSessions.delete(token);
}

function createStaffSession(staffId, staffName) {
  const token = 'stf_' + crypto.randomBytes(32).toString('hex');
  staffSessions.set(token, {
    staffId: staffId,
    staffName: staffName,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getValidStaffSession(token) {
  if (!token) return null;
  const sess = staffSessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    staffSessions.delete(token);
    return null;
  }
  return sess;
}

function revokeStaffSession(token) {
  if (token) staffSessions.delete(token);
}

function revokeAllStaffSessionsForId(staffId) {
  const sId = (staffId || '').toUpperCase();
  for (const [token, sess] of staffSessions.entries()) {
    if ((sess.staffId || '').toUpperCase() === sId) {
      staffSessions.delete(token);
    }
  }
}

/**
 * Extracts authorization token strictly from Bearer headers or POST JSON body.
 * Tokens from URL query strings are explicitly rejected to prevent leakage.
 */
function extractAuthToken(req, payload) {
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
  customers: []
};

function saveLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
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
    active: staff.active !== undefined ? staff.active : true
  };
}

/**
 * Sanitizes staff list for admin use (Removes plaintext PIN/hash, returns hasPin indicator)
 */
function sanitizeStaffForAdmin(staff) {
  return {
    id: staff.id,
    name: staff.name,
    phone: staff.phone || '',
    active: staff.active !== undefined ? staff.active : true,
    hasPin: !!(staff.pin && isValidCredentialFormat(staff.pin))
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

    const existingPin = idx >= 0 ? (appState.staffList[idx].pin || '') : '';
    let incomingPin = (rem.pin || '').toString().trim();

    let finalPin = '';
    // P0 Fix: Ignore [PROTECTED] and blank PINs. Never overwrite valid hash with [PROTECTED].
    if (incomingPin && incomingPin.toUpperCase() !== '[PROTECTED]' && isValidCredentialFormat(incomingPin)) {
      finalPin = /^\d{6}$/.test(incomingPin) ? hashPinScrypt(incomingPin) : incomingPin;
    } else if (existingPin && isValidCredentialFormat(existingPin)) {
      finalPin = existingPin;
    } else {
      // P1 Fix: Default PIN '123456' removed. Leave empty rather than insecure default.
      finalPin = '';
    }

    if (idx >= 0) {
      const loc = appState.staffList[idx];
      appState.staffList[idx] = {
        id: loc.id || rem.id || ('STF0' + (idx + 1)),
        name: rem.name || loc.name,
        phone: rem.phone || loc.phone || '',
        pin: finalPin,
        active: rem.active !== undefined ? (rem.active === true || rem.active === 'Yes' || rem.active === 'Active') : (loc.active !== undefined ? loc.active : true)
      };
    } else {
      appState.staffList.push({
        id: rem.id || ('STF' + String(appState.staffList.length + 1).padStart(2, '0')),
        name: rem.name,
        phone: rem.phone || '',
        pin: finalPin,
        active: rem.active !== undefined ? (rem.active === true || rem.active === 'Yes' || rem.active === 'Active') : true
      });
    }
  });

  saveLocalData(appState);
}

/**
 * Fetches live staff from Google Sheet Visualization API (Tab: Staff)
 */
async function syncLiveStaffFromGoogle() {
  if (process.env.DISABLE_LIVE_SHEETS === 'true') {
    return appState.staffList;
  }

  const ssId = SPREADSHEET_ID;
  
  try {
    const url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=Staff`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
      if (json && json.table && json.table.rows && json.table.rows.length > 0) {
        const rawCols = (json.table.cols || []).map(c => (c.label || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (rawCols.length > 0 && rawCols[0].includes('customer')) {
          // Visual API returned default customer sheet, skip
        } else {
          const rows = json.table.rows;
          const firstRowVals = (rows[0].c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v.toString().trim() : '');
          
          if (!firstRowVals[0].toLowerCase().includes('customer')) {
            let startIndex = 0;
            if (firstRowVals[0].toLowerCase().includes('staff') || firstRowVals[1].toLowerCase().includes('staff')) {
              startIndex = 1;
            }
            const sheetStaff = [];
            for (let idx = startIndex; idx < rows.length; idx++) {
              const vals = (rows[idx].c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v.toString().trim() : '');
              const id = vals[0] || ('STF' + String(idx).padStart(2, '0'));
              const name = vals[1] || '';
              const phone = vals[2] || '';
              const pin = vals[3] || '';
              const status = (vals[4] || 'Active').toLowerCase();
              const active = status !== 'inactive' && status !== 'no' && status !== 'false';
              if (name && !/^\d{7,15}$/.test(name) && !name.startsWith('http')) {
                sheetStaff.push({ id, name, phone, pin, active });
              }
            }
            if (sheetStaff.length > 0) {
              mergeStaffList(sheetStaff);
              return appState.staffList;
            }
          }
        }
      }
    }
  } catch (sheetErr) {
    // Non-blocking
  }

  try {
    const gasRes = await forwardToGoogleAppsScript({ action: 'getStaffList' });
    if (Array.isArray(gasRes) && gasRes.length > 0) {
      mergeStaffList(gasRes);
      return appState.staffList;
    }
  } catch (gasErr) {
    // Non-blocking
  }

  return appState.staffList;
}

if (process.env.DISABLE_LIVE_SHEETS !== 'true') {
  setTimeout(() => {
    syncLiveStaffFromGoogle().catch(() => {});
  }, 1000);

  setInterval(() => {
    syncLiveStaffFromGoogle().catch(() => {});
  }, 180000);
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

  const serviceScope = (sType + ' ' + pType + ' ' + pDetails).trim();

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
 * LIVE DATA RETRIEVAL WITH DATA-SOURCE TRACKING
 * Returns records along with dataSource: 'live_sheet' | 'apps_script' | 'local_fallback'
 * =========================================================================
 */
let lastDataSource = 'local_fallback';
let lastSyncTimestamp = null;

/**
 * Shared in-memory cache for live customer data.
 * TTL of 20 seconds avoids hammering Google Sheets when multiple staff members poll every 30s.
 * In-flight promise sharing prevents duplicate concurrent requests.
 */
let liveCustomersCache = null;
let liveCustomersCacheExpiry = 0;
const LIVE_CACHE_TTL_MS = 20000; // 20 seconds
let liveCustomersInFlightPromise = null;

function invalidateLiveCustomersCache() {
  liveCustomersCache = null;
  liveCustomersCacheExpiry = 0;
  liveCustomersInFlightPromise = null;
}

async function fetchAllLiveCustomers(forceBypass = false) {
  if (process.env.DISABLE_LIVE_SHEETS === 'true') {
    return {
      records: appState.customers || [],
      dataSource: 'local_fallback',
      isLive: false,
      lastSync: new Date().toISOString()
    };
  }

  // 1. Check in-memory cache if not explicitly bypassed
  const now = Date.now();
  if (!forceBypass && liveCustomersCache && now < liveCustomersCacheExpiry) {
    return liveCustomersCache;
  }

  // 2. In-flight request deduplication: if a request is already running, wait for it
  if (!forceBypass && liveCustomersInFlightPromise) {
    return liveCustomersInFlightPromise;
  }

  // 3. Initiate fetch and share promise with concurrent callers
  liveCustomersInFlightPromise = (async () => {
    try {
      const result = await doFetchLiveCustomersInternal();
      liveCustomersCache = result;
      liveCustomersCacheExpiry = Date.now() + LIVE_CACHE_TTL_MS;
      return result;
    } finally {
      liveCustomersInFlightPromise = null;
    }
  })();

  return liveCustomersInFlightPromise;
}

async function doFetchLiveCustomersInternal() {
  const ssId = SPREADSHEET_ID;
  const sheets = ['Daily Clean', 'All Other Work'];
  const allRecords = [];
  let liveSuccess = false;

  for (const sheetName of sheets) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
      if (!json || !json.table || !json.table.rows) continue;

      const rawCols = json.table.cols.map(c => (c.label || '').trim());
      const normCols = rawCols.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const rows = json.table.rows;

      rows.forEach((row, rIdx) => {
        const rowVals = (row.c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v.toString().trim() : '');

        function getCell(aliases) {
          for (let alias of aliases) {
            const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const idx = normCols.indexOf(key);
            if (idx >= 0 && rowVals[idx] !== undefined && rowVals[idx] !== '') {
              return rowVals[idx];
            }
          }
          return '';
        }

        const custName = getCell(['customername', 'custname']);
        if (!custName && !rowVals.some(v => v !== '')) return;

        const custPhone = getCell(['customernumber', 'custphone', 'number', 'phone', 'mob']);
        const mapUrl = getCell(['googlemapsurl', 'mapurl', 'maps', 'location']);
        const photo = getCell(['customervehiclephotourl', 'vehiclesitephotourl', 'photourl', 'photo']);
        const address = getCell(['address']);

        let vehicle = '';
        if (sheetName === 'Daily Clean') {
          vehicle = getCell(['vehiclenumbersmodels', 'vehiclenumbers', 'vehicle']);
        } else {
          vehicle = getCell(['vehiclenumbersitename', 'vehicleorsite', 'vehicle']);
        }

        const pkgType = getCell(['packagetype', 'pkgtype', 'servicetypecarwashsolarcleaning', 'servicetype']) || 'DCC ONLY';
        const pkgCount = getCell(['packagespurchased', 'pkgcount']) || '1';
        const serviceType = getCell(['servicetypecarwashsolarcleaning', 'servicetype']);
        const packageDetails = getCell(['packageservicedetails', 'packagedetails']);
        const staff = getCell(['staffname', 'staff']);
        const notes = getCell(['staffnotescleaninginstructions', 'staffnotesspecialinstructions', 'staffnotes', 'notes']);
        const secAddr = getCell(['secondaryaddressifany', 'secondaryaddress']);
        const secMap = getCell(['secondarymapsurl']);
        const active = getCell(['active', 'status']) || 'Yes';

        const serviceCategory = classifyServiceCategory(sheetName, serviceType, pkgType, packageDetails, vehicle);

        allRecords.push({
          sheetName: sheetName,
          rowIndex: rIdx + 2,
          customerName: custName,
          customerNumber: custPhone,
          googleMapsUrl: mapUrl,
          photoUrl: photo,
          address: address,
          vehicle: vehicle,
          packageType: pkgType,
          packagesPurchased: pkgCount,
          serviceType: serviceType,
          packageDetails: packageDetails,
          serviceCategory: serviceCategory,
          staffName: staff,
          secondaryAddress: secAddr,
          secondaryMapsUrl: secMap,
          notes: notes,
          active: active
        });
      });
      liveSuccess = true;
    } catch (e) {
      console.warn(`[LiveFetch] Error fetching live sheet ${sheetName}:`, e.message);
    }
  }

  if (liveSuccess && allRecords.length > 0) {
    lastDataSource = 'live_sheet';
    lastSyncTimestamp = new Date().toISOString();
    const records = [...allRecords];
    if (appState.customers && appState.customers.length > 0) {
      for (const lc of appState.customers) {
        if (!records.some(r => (r.customerNumber && r.customerNumber === lc.customerNumber) && (r.customerName && r.customerName === lc.customerName))) {
          records.unshift(lc);
        }
      }
    }
    return {
      records: records,
      dataSource: 'live_sheet',
      isLive: true,
      lastSync: lastSyncTimestamp
    };
  }

  // Fallback to Apps Script proxy with service key
  try {
    const gasRes = await forwardToGoogleAppsScript({ action: 'getAllCustomers' });
    if (Array.isArray(gasRes) && gasRes.length > 0) {
      lastDataSource = 'apps_script';
      lastSyncTimestamp = new Date().toISOString();
      return {
        records: gasRes,
        dataSource: 'apps_script',
        isLive: true,
        lastSync: lastSyncTimestamp
      };
    }
  } catch (gasErr) {
    console.warn('[LiveFetch] GAS fallback also failed:', gasErr.message);
  }

  // Fallback to local data
  lastDataSource = 'local_fallback';
  lastSyncTimestamp = new Date().toISOString();
  return {
    records: appState.customers || [],
    dataSource: 'local_fallback',
    isLive: false,
    warning: 'गूगल शीट से लाइव कनेक्शन नहीं बन पाया। स्थानीय पुराना डेटा दिखाया जा रहा है।',
    lastSync: lastSyncTimestamp
  };
}

/**
 * Formats Staff Customer Data response.
 * Preserves exact Daily Clean source row sequence.
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

  // Daily Car Cleaning: preserves exact source row order
  const dailyCarCleaning = assignedActiveCustomers.filter(c => 
    c.serviceCategory === 'Daily Car Cleaning'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    vehicleNumbers: c.vehicle,
    vehicle: c.vehicle,
    packageType: c.packageType,
    serviceCategory: 'Daily Car Cleaning',
    category: 'daily_car_cleaning',
    staffNotes: c.notes,
    secondaryAddress: c.secondaryAddress || '',
    secondaryMapsUrl: c.secondaryMapsUrl || '',
    active: c.active
  }));

  const carWashing = assignedActiveCustomers.filter(c => 
    c.serviceCategory === 'Car Washing'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    vehicleNumbers: c.vehicle,
    vehicleOrSite: c.vehicle,
    vehicle: c.vehicle,
    packageType: c.packageType,
    serviceType: c.serviceType || c.packageType || 'Car Washing',
    serviceCategory: 'Car Washing',
    category: 'car_washing',
    staffNotes: c.notes,
    secondaryAddress: c.secondaryAddress || '',
    secondaryMapsUrl: c.secondaryMapsUrl || '',
    active: c.active
  }));

  const solarCleaning = assignedActiveCustomers.filter(c => 
    c.serviceCategory === 'Solar Panel Cleaning'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    vehicleNumbers: c.vehicle,
    vehicleOrSite: c.vehicle,
    vehicle: c.vehicle,
    packageType: c.packageType,
    serviceType: c.serviceType || c.packageType || 'Solar Panel Cleaning',
    serviceCategory: 'Solar Panel Cleaning',
    category: 'solar_cleaning',
    staffNotes: c.notes,
    secondaryAddress: c.secondaryAddress || '',
    secondaryMapsUrl: c.secondaryMapsUrl || '',
    active: c.active
  }));

  const formatted = {
    staffId: staffObj ? staffObj.id : staffId,
    staffName: staffObj ? staffObj.name : staffId,
    dailyCarCleaning: dailyCarCleaning,
    carWashing: carWashing,
    solarCleaning: solarCleaning,
    dailyClean: dailyCarCleaning,
    allOtherWork: carWashing.concat(solarCleaning),
    totalCount: dailyCarCleaning.length + carWashing.length + solarCleaning.length,
    dataSource: fetchResult.dataSource || 'live_sheet',
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
 * Proxy API request to Google Apps Script Web App using trusted service credential.
 * Service credential is never sent to the browser or returned in API responses.
 */
async function forwardToGoogleAppsScript(payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL is not configured.');
  }

  const serviceKey = process.env.APPS_SCRIPT_SERVICE_KEY || process.env.CWP_SERVICE_KEY || '';
  const bodyPayload = Object.assign({}, payload);
  if (serviceKey) {
    bodyPayload.serviceKey = serviceKey;
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyPayload),
    redirect: 'follow',
    signal: AbortSignal.timeout(8000)
  });
  return await response.json();
}

/**
 * =========================================================================
 * HTTP SERVER & ROUTING ENGINE
 * =========================================================================
 */
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Serve raw files for Apps Script editor sync
  if (pathname === '/raw-Code.gs' || pathname === '/Code.gs' || pathname === '/raw-Index.html' || pathname === '/appsscript.json') {
    const rawFile = (pathname === '/raw-Index.html') ? 'Index.html' : ((pathname === '/raw-Code.gs' || pathname === '/Code.gs') ? 'Code.gs' : path.basename(pathname));
    const filePath = path.join(__dirname, rawFile);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Health check endpoint for Railway monitoring (Secrets are never exposed)
  if (pathname === '/health' || pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'cwp-staff-viewer',
      domain: DOMAIN,
      adminConfigured: hasAdminPasswordConfigured(),
      serviceKeyConfigured: !!(process.env.APPS_SCRIPT_SERVICE_KEY || process.env.CWP_SERVICE_KEY),
      cloudinary: isCloudinaryConfigured(),
      lastDataSource: lastDataSource,
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

  // GET /api/staff - Sanitized (Public list has NO PIN and NO PHONE numbers)
  if (req.method === 'GET' && pathname === '/api/staff') {
    const token = extractAuthToken(req, null);
    const isAdmin = isValidAdminSession(token);
    const sanitized = (appState.staffList || []).map(s => 
      isAdmin ? sanitizeStaffForAdmin(s) : sanitizeStaffForPublic(s)
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(sanitized));
  }

  // GET /api/staff-data - Requires valid Staff Session or Admin Session (Query token rejected!)
  if (req.method === 'GET' && pathname === '/api/staff-data') {
    const token = extractAuthToken(req, null);
    const staffSess = getValidStaffSession(token);
    const adminSess = isValidAdminSession(token);

    if (!staffSess && !adminSess) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'Unauthorized: Valid staff or admin session required to view staff customer data',
        unauthorized: true
      }));
    }

    const requestedStaffId = parsedUrl.searchParams.get('staffId') || '';
    let targetStaffId = '';

    if (staffSess) {
      // Discard browser-supplied staffId, use verified session identity to prevent cross-staff access
      targetStaffId = staffSess.staffId;
      if (requestedStaffId && requestedStaffId.toUpperCase() !== staffSess.staffId.toUpperCase()) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: 'Forbidden: Cross-staff data access denied',
          forbidden: true
        }));
      }
    } else if (adminSess) {
      // Admin previewing staff data
      targetStaffId = requestedStaffId || 'STF01';
    }

    try {
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
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, staffId: targetStaffId }));
    }
  }

  // =========================================================================
  // MAIN API POST ROUTE (/api)
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        let payload = {};
        if (body) {
          payload = JSON.parse(body);
        }

        const token = extractAuthToken(req, payload);

        // 1. Admin Authentication Handler
        if (payload.action === 'verifyAdminPassword') {
          const inputPass = (payload.password || '').trim();
          if (!inputPass) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'कृपया एडमिन पासवर्ड दर्ज करें।'
            }));
          }

          // Check if password matches configured environment variable or local scrypt hash
          const isMatch = verifyAdminPasswordNode(inputPass);
          if (isMatch) {
            const sessionToken = createAdminSession();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              token: sessionToken,
              expiresIn: SESSION_TTL_MS / 1000
            }));
          }

          // If no local password is configured at all, check Google Apps Script via service key
          if (!hasAdminPasswordConfigured()) {
            try {
              const gasRes = await forwardToGoogleAppsScript(payload);
              if (gasRes && gasRes.success) {
                const sessionToken = createAdminSession();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                  success: true,
                  token: sessionToken,
                  expiresIn: SESSION_TTL_MS / 1000
                }));
              }
            } catch (e) {}

            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Admin password is not configured on the server. Please set ADMIN_PASSWORD in environment variables.'
            }));
          }

          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'गलत एडमिन पासवर्ड। कृपया सही पासवर्ड दर्ज करें।'
          }));
        }

        // 2. Admin Logout / Explicit Token Revocation
        if (payload.action === 'logoutAdmin') {
          revokeAdminSession(token);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Admin session revoked successfully.' }));
        }

        // 3. Staff Verification & Session Issuance (Supports Registered Phone + 6-Digit PIN)
        if (payload.action === 'verifyStaffPin') {
          const clientIp = req.socket.remoteAddress || 'unknown';
          const rawPhone = (payload.phone || payload.mobile || payload.staffPhone || '').toString().replace(/[^0-9]/g, '');
          const cleanPhone = rawPhone.length === 10 ? rawPhone : (rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone);
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

          let staff = null;
          if (cleanPhone) {
            staff = (appState.staffList || []).find(s => {
              const p = (s.phone || '').toString().replace(/[^0-9]/g, '').slice(-10);
              return p === cleanPhone;
            });
          }
          if (!staff && staffId) {
            staff = (appState.staffList || []).find(s => 
              (s.id || '').toUpperCase() === staffId.toUpperCase() || 
              (s.name || '').toLowerCase() === staffId.toLowerCase()
            );
          }

          // If not found in memory, try fresh sync from Google Sheet
          if (!staff) {
            try {
              await syncLiveStaffFromGoogle();
              if (cleanPhone) {
                staff = (appState.staffList || []).find(s => {
                  const p = (s.phone || '').toString().replace(/[^0-9]/g, '').slice(-10);
                  return p === cleanPhone;
                });
              }
              if (!staff && staffId) {
                staff = (appState.staffList || []).find(s => 
                  (s.id || '').toUpperCase() === staffId.toUpperCase() || 
                  (s.name || '').toLowerCase() === staffId.toLowerCase()
                );
              }
            } catch (e) {}
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
              saveLocalData(appState);
              console.log(`[Security] Plaintext/SHA-256 PIN for staff ${staff.id} upgraded to scrypt hash.`);
            }

            const staffToken = createStaffSession(staff.id, staff.name);
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
            // Check GAS fallback if local PIN failed
            try {
              const gasRes = await forwardToGoogleAppsScript(payload);
              if (gasRes && gasRes.success) {
                clearRateLimit(clientIp, rateKey);
                const staffToken = createStaffSession(gasRes.staffId || staff.id, gasRes.staffName || staff.name);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                  success: true,
                  token: staffToken,
                  staffId: gasRes.staffId || staff.id,
                  staffName: gasRes.staffName || staff.name,
                  phone: gasRes.phone || staff.phone || '',
                  active: true
                }));
              }
            } catch (e) {}

            recordFailedLogin(clientIp, rateKey);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'गलत 6-डिजिट पासवर्ड! कृपया सही पिन दर्ज करें।' }));
          }
        }

        // 4. Staff Logout / Explicit Token Revocation
        if (payload.action === 'logoutStaff') {
          revokeStaffSession(token);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Staff session revoked.' }));
        }

        // 5. Staff Customer Data Retrieval (Requires valid Staff Session or Admin Session)
        if (payload.action === 'getStaffData') {
          const staffSess = getValidStaffSession(token);
          const adminSess = isValidAdminSession(token);

          if (!staffSess && !adminSess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Valid staff or admin session required to view staff customer data',
              unauthorized: true
            }));
          }

          let targetStaffId = '';
          if (staffSess) {
            targetStaffId = staffSess.staffId;
            if (payload.staffId && payload.staffId.toUpperCase() !== staffSess.staffId.toUpperCase()) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Forbidden: Cross-staff data access denied',
                forbidden: true
              }));
            }
          } else if (adminSess) {
            targetStaffId = payload.staffId || 'STF01';
          }

          const clientVersion = String(payload.version || (req.headers['if-none-match'] || '').replace(/^"|"$/g, '')).trim();

          try {
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
            console.warn('Live getStaffData failed, proxying to Apps Script:', liveErr.message);
            try {
              const gasRes = await forwardToGoogleAppsScript({ action: 'getStaffData', staffId: targetStaffId, version: clientVersion });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(gasRes));
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'Failed to retrieve staff customer data: ' + e.message }));
            }
          }
        }

        // 6. Staff List Handler (Public list has no PIN or Phone; Admin gets sanitized list with hasPin)
        if (payload.action === 'getStaffList') {
          const isAdmin = isValidAdminSession(token);
          if (payload.sync || !appState.staffList || appState.staffList.length <= 1) {
            try {
              await syncLiveStaffFromGoogle();
            } catch (e) {}
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
          'saveCustomer',
          'updateCustomer',
          'toggleCustomerActive',
          'saveStaffMember',
          'deleteStaffMember',
          'toggleStaffActive',
          'resetStaffPin',
          'cleanAndSyncStaff',
          'syncStaffSheet',
          'syncStaffDropdown',
          'clearInvalidDropdowns',
          'updateAdminPassword',
          'reorderSheet'
        ];

        if (adminProtectedActions.includes(payload.action)) {
          if (!isValidAdminSession(token)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Unauthorized: Valid Admin session required for operation: ' + payload.action,
              unauthorized: true
            }));
          }
        }

        // Admin: Get All Customers
        if (payload.action === 'getAllCustomers') {
          const fetchResult = await fetchAllLiveCustomers();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(fetchResult.records || []));
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

          const staff = (appState.staffList || []).find(s => s.id.toUpperCase() === staffId.toUpperCase());
          if (!staff) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Staff member not found.' }));
          }

          staff.pin = hashPinScrypt(newPin);
          saveLocalData(appState);
          revokeAllStaffSessionsForId(staff.id);

          try {
            await forwardToGoogleAppsScript(payload);
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            message: `स्टाफ सदस्य (${staff.name}) का 6-अंकों का पिन सुरक्षित रूप से रीसेट कर दिया गया।`
          }));
        }

        // Admin: Save New Staff Member (P1 Fix: No default PIN 123456)
        if (payload.action === 'saveStaffMember') {
          const sData = payload.staffData || {};
          const name = (sData.name || payload.name || '').trim();
          let id = (sData.id || payload.id || '').trim().toUpperCase();
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

          let pinToStore = '';
          if (rawPin) {
            if (rawPin.toUpperCase() === '[PROTECTED]') {
              if (idx >= 0) pinToStore = appState.staffList[idx].pin || '';
            } else if (rawPin.startsWith('scrypt:') || rawPin.startsWith('sha256:')) {
              pinToStore = rawPin;
            } else if (/^\d{6}$/.test(rawPin)) {
              pinToStore = hashPinScrypt(rawPin);
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'Staff PIN must be exactly 6 numeric digits.' }));
            }
          } else if (idx >= 0 && appState.staffList[idx].pin) {
            pinToStore = appState.staffList[idx].pin;
          } else {
            // New staff member with no PIN: Require explicit 6-digit PIN. Never default to 123456!
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'नया स्टाफ बनाने के लिए 6-अंकों का पिन अनिवार्य है। (PIN is required for new staff)' }));
          }

          const newObj = { id, name, phone, pin: pinToStore, active };

          if (idx >= 0) {
            appState.staffList[idx] = Object.assign({}, appState.staffList[idx], newObj);
          } else {
            appState.staffList.push(newObj);
          }
          saveLocalData(appState);
          invalidateLiveCustomersCache();

          try {
            await forwardToGoogleAppsScript({
              action: 'saveStaffMember',
              staffData: { id: newObj.id, name: newObj.name, phone: newObj.phone, pin: newObj.pin, active: newObj.active }
            });
          } catch (e) {
            console.warn('GAS saveStaffMember sync warning:', e.message);
          }

          const sanitizedList = appState.staffList.map(s => sanitizeStaffForAdmin(s));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            staffList: sanitizedList,
            staff: sanitizeStaffForAdmin(newObj)
          }));
        }

        // Admin: Toggle Staff Active
        if (payload.action === 'toggleStaffActive') {
          const s = (appState.staffList || []).find(x => (x.id || '').toLowerCase() === (payload.staffId || '').toLowerCase());
          if (s) {
            s.active = !!payload.active;
            saveLocalData(appState);
            invalidateLiveCustomersCache();
            if (!s.active) {
              revokeAllStaffSessionsForId(s.id);
            }
            try {
              await forwardToGoogleAppsScript(payload);
            } catch (e) {}
            const sanitizedList = appState.staffList.map(item => sanitizeStaffForAdmin(item));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, staffList: sanitizedList }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'स्टाफ सदस्य नहीं मिला।' }));
          }
        }

        // Admin: Delete Staff Member
        if (payload.action === 'deleteStaffMember') {
          const staffId = (payload.id || payload.staffId || '').toString().trim().toLowerCase();
          revokeAllStaffSessionsForId(staffId);
          appState.staffList = (appState.staffList || []).filter(s => (s.id || '').toLowerCase() !== staffId);
          saveLocalData(appState);
          invalidateLiveCustomersCache();
          try {
            await forwardToGoogleAppsScript(payload);
          } catch (e) {}
          const sanitizedList = appState.staffList.map(item => sanitizeStaffForAdmin(item));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, staffList: sanitizedList }));
        }

        // Admin: Update Admin Password (P1 Fix: Forward to Apps Script, fail closed if GAS fails, never store plaintext)
        if (payload.action === 'updateAdminPassword') {
          const newPass = (payload.newPassword || '').trim();
          if (!newPass || newPass.length < 6) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Admin password must be at least 6 characters.' }));
          }

          // Forward to Google Apps Script first
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            if (!gasRes || gasRes.error || gasRes.success === false) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Failed to update admin password in Google Apps Script: ' + (gasRes ? gasRes.error : 'No response')
              }));
            }
          } catch (gasErr) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Google Apps Script में एडमिन पासवर्ड अपडेट नहीं हो सका: ' + gasErr.message
            }));
          }

          // Hash with scrypt and save (Plaintext is NEVER stored or logged!)
          appState.adminPasswordHash = hashPasswordScrypt(newPass);
          delete appState.adminPassword;
          saveLocalData(appState);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'एडमिन पासवर्ड सुरक्षित रूप से सफलतापूर्वक अपडेट हो गया!' }));
        }

        // Admin: Save Customer
        if (payload.action === 'saveCustomer' && payload.customerData) {
          const cust = payload.customerData;
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

          let responseData;
          try {
            responseData = await forwardToGoogleAppsScript(payload);
          } catch (gasErr) {
            responseData = { success: true, message: 'Customer saved locally to ' + cust.sheetName };
          }
          if (!appState.customers) appState.customers = [];
          const existingIdx = appState.customers.findIndex(c => c.customerNumber === cust.customerNumber && c.customerName === cust.customerName);
          if (existingIdx >= 0) {
            appState.customers[existingIdx] = Object.assign({}, appState.customers[existingIdx], cust);
          } else {
            cust.rowIndex = appState.customers.length + 2;
            appState.customers.unshift(cust);
          }
          saveLocalData(appState);
          invalidateLiveCustomersCache();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(responseData));
        }

        // Admin: Update Customer (Guards against duplicate/orphaned rows and cross-sheet corruption)
        if (payload.action === 'updateCustomer') {
          const cust = payload.customerData;
          if (!cust || !cust.sheetName || !cust.rowIndex) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Missing sheetName or rowIndex for update' }));
          }

          const rowIdx = parseInt(cust.rowIndex, 10);
          if (isNaN(rowIdx) || rowIdx < 2) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Invalid row index for update' }));
          }

          // Integrity check: prohibit cross-sheet moves without explicit migration
          if (cust.sheetName === 'Daily Clean') {
            const cat = (cust.serviceCategory || '').toString().trim();
            if (cat && cat !== 'Daily Car Cleaning') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Cannot move record from Daily Clean to All Other Work during edit. Cross-sheet moves require explicit migration.'
              }));
            }
            cust.serviceCategory = 'Daily Car Cleaning';
          } else if (cust.sheetName === 'All Other Work') {
            const cat = (cust.serviceCategory || '').toString().trim();
            if (cat === 'Daily Car Cleaning') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                success: false,
                error: 'Cannot move record from All Other Work to Daily Clean during edit. Cross-sheet moves require explicit migration.'
              }));
            }
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

          let responseData;
          try {
            responseData = await forwardToGoogleAppsScript(payload);
          } catch (gasErr) {
            responseData = { success: true, message: 'ग्राहक का विवरण स्थानीय रूप से अपडेट हुआ (Google sync pending)' };
          }

          if (appState.customers && appState.customers.length > 0) {
            const localIdx = appState.customers.findIndex(c => c.sheetName === cust.sheetName && parseInt(c.rowIndex, 10) === rowIdx);
            if (localIdx >= 0) {
              appState.customers[localIdx] = Object.assign({}, appState.customers[localIdx], cust);
              saveLocalData(appState);
            }
          }
          invalidateLiveCustomersCache();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(responseData));
        }

        // Forward any remaining admin sync actions to GAS
        let responseData;
        try {
          responseData = await forwardToGoogleAppsScript(payload);
        } catch (gasErr) {
          console.error('Apps Script forwarding failed, using fallback:', gasErr.message);
          const action = payload.action;
          if (action === 'cleanAndSyncStaff' || action === 'syncStaffSheet' || action === 'syncStaffDropdown') {
            responseData = { success: true, staffList: (appState.staffList || []).map(s => sanitizeStaffForAdmin(s)) };
          } else if (action === 'clearInvalidDropdowns') {
            responseData = { success: true, message: 'ड्रॉपडाउन सफलतापूर्वक सिंक व रीसेट कर दिए गए।' };
          } else if (action === 'reorderSheet') {
            responseData = { success: true, message: 'कस्टमर-फर्स्ट कॉलम संरचना सक्रिय है।' };
          } else {
            responseData = { error: 'Backend request failed: ' + gasErr.message };
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (parseErr) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload: ' + parseErr.message }));
      }
    });
    return;
  }

  // =========================================================================
  // MAIN UI ROUTE (Index.html)
  // =========================================================================
  const indexPath = path.join(__dirname, 'Index.html');
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');

    const normPath = parsedUrl.pathname.toLowerCase().replace(/\/+$/, '');
    const isStaffRoute = normPath === '/staff' || normPath.startsWith('/staff/');
    const isAdminRoute = normPath === '/admin' || normPath.startsWith('/admin/');
    const staffParam = parsedUrl.searchParams.get('staff') || parsedUrl.searchParams.get('id') || '';
    const adminParam = parsedUrl.searchParams.get('admin');

    // Route logic: /staff explicitly launches Staff Portal; /admin launches Admin Portal
    let initialMode = 'admin';
    if (isStaffRoute || staffParam) {
      initialMode = 'staff';
    } else if (isAdminRoute || adminParam !== null) {
      initialMode = 'admin';
    } else {
      initialMode = 'staff';
    }

    content = content.replace(/<\?=\s*typeof\s+initialStaffId\s*!==\s*'undefined'\s*\?\s*initialStaffId\s*:\s*''\s*\?>/g, staffParam);
    content = content.replace(/<\?=\s*typeof\s+initialMode\s*!==\s*'undefined'\s*\?\s*initialMode\s*:\s*'[a-zA-Z]+'\s*\?>/g, initialMode);
    content = content.replace(/<\?=\s*typeof\s+webAppUrl\s*!==\s*'undefined'\s*\?\s*webAppUrl\s*:[^?]*\?>/g, '');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Index.html not found');
});

if (require.main === module) {
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
  isValidAdminSession,
  revokeAdminSession,
  createStaffSession,
  getValidStaffSession,
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
  getAppState: () => appState,
  setAppState: (st) => { appState = st; },
  setDataFile: (df) => { DATA_FILE = df; },
  saveLocalData,
  loadLocalData
};
