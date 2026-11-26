/**
 * =========================================================================
 * CWP ADMIN V2 - BASIC SECURITY SERVICE (CWP-SECURITY-BASIC-01)
 * =========================================================================
 * Provides:
 * - Multi-dimensional server-side login rate limiting & concurrency guard
 * - First-party adaptive arithmetic CAPTCHA (single-use, bound, rate-limited)
 * - Cookie-based Trusted Device recognition (HttpOnly, hashed in DB)
 * - Idle & absolute session timeout enforcement
 * - Sanitized security event logging (no secrets, no tokens, no DB IDs in UI)
 * =========================================================================
 */

const crypto = require('crypto');
const repos = require('../db/repositories/index');

// -------------------------------------------------------------------------
// Validated Policy Configuration
// -------------------------------------------------------------------------
function parseClampedInt(val, def, min, max) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

const IDLE_MINUTES = parseClampedInt(process.env.ADMIN_SESSION_IDLE_MINUTES, 30, 5, 240);
const MAX_HOURS = parseClampedInt(process.env.ADMIN_SESSION_MAX_HOURS, 12, 1, 24);

const ADMIN_IDLE_TIMEOUT_MS = IDLE_MINUTES * 60 * 1000; // Default 30 minutes
const ADMIN_ABSOLUTE_TTL_MS = MAX_HOURS * 60 * 60 * 1000; // Default 12 hours
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CAPTCHA_TTL_MS = 3 * 60 * 1000; // 3 minutes

const IP_ACCT_MAX_FAILS = 5;
const IP_ACCT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const IP_MAX_FAILS = 10;
const IP_COOLDOWN_MS = 5 * 60 * 1000;
const ACCT_SOFT_CAPTCHA_THRESHOLD = 4;
const CAPTCHA_TRIGGER_THRESHOLD = 2;
const ENDPOINT_VOL_WINDOW_MS = 60 * 1000;
const ENDPOINT_VOL_MAX = 30;
const CAPTCHA_GEN_WINDOW_MS = 5 * 60 * 1000;
const CAPTCHA_GEN_MAX = 15;

const COOKIE_SESSION = 'cwp_adm_sess';
const COOKIE_DEVICE = 'cwp_adm_dev';
const COOKIE_CSRF = 'cwp_csrf';

// Ephemeral HMAC key for opaque UI references (never exposes DB UUIDs or token hashes)
const REF_HMAC_KEY = crypto.randomBytes(32);

function makeOpaqueRef(prefix, rawId) {
  const sig = crypto.createHmac('sha256', REF_HMAC_KEY).update(String(rawId)).digest('hex').slice(0, 16);
  return `${prefix}_${sig}`;
}

function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

// -------------------------------------------------------------------------
// Cookie & Request Helpers
// -------------------------------------------------------------------------
function parseCookies(req) {
  const out = {};
  const header = req && req.headers && req.headers.cookie;
  if (!header || typeof header !== 'string') return out;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch (e) {
      out[key] = val;
    }
  }
  return out;
}

function isHttpsRequest(req) {
  if (!req) return false;
  if (req.socket && req.socket.encrypted) return true;
  const proto = req.headers && (req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol']);
  if (proto && String(proto).toLowerCase().split(',')[0].trim() === 'https') return true;
  return false;
}

function buildCookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value || '')}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  }
  if (opts.expires) {
    parts.push(`Expires=${new Date(opts.expires).toUTCString()}`);
  }
  if (opts.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function appendSetCookie(res, cookieStr) {
  if (!res || !cookieStr) return;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
}

function parseUserAgent(ua) {
  const s = String(ua || '').trim();
  let browser = 'Unknown Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';
  else if (/Node|curl|Postman/i.test(s)) browser = 'API Client';

  let os = 'Unknown OS';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  const deviceLabel = `${browser} on ${os}`;
  return { browser, os, deviceLabel };
}

function maskIp(ip) {
  if (!ip || ip === 'unknown') return 'Unknown';
  const s = String(ip).trim();
  if (s === '::1' || s === '127.0.0.1') return 'Localhost';
  if (s.includes('.')) {
    const segs = s.split('.');
    if (segs.length === 4) return `${segs[0]}.${segs[1]}.*.*`;
  }
  if (s.includes(':')) {
    const segs = s.split(':');
    return `${segs.slice(0, 2).join(':')}:*`;
  }
  return 'Masked';
}

// -------------------------------------------------------------------------
// Multi-Dimensional Rate Limiter & Concurrency Guard
// -------------------------------------------------------------------------
const ipAcctFailures = new Map(); // `${ip}:${user}` -> { count, firstFailAt, lockedUntil, recentlyLocked }
const ipFailures = new Map();     // `${ip}` -> { count, firstFailAt, lockedUntil }
const acctFailures = new Map();   // `${user}` -> { count, firstFailAt }
const endpointVolume = new Map(); // `${ip}` -> { count, windowStart }
const inFlightLogins = new Map(); // `${ip}:${user}` -> number

function pruneMapIfNeeded(map, maxEntries = 5000) {
  if (map.size <= maxEntries) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if ((v.expiresAt && v.expiresAt < now) || (v.lockedUntil && v.lockedUntil < now - 600000)) {
      map.delete(k);
    }
  }
}

function checkRateLimitBucket(map, key, maxFails, cooldownMs) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec) return { locked: false, count: 0, recentlyLocked: false };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return {
      locked: true,
      remainingSec: Math.ceil((rec.lockedUntil - now) / 1000),
      count: rec.count,
      recentlyLocked: true
    };
  }
  if (rec.lockedUntil && now >= rec.lockedUntil) {
    // Cooldown expired: allow retry, but flag recentlyLocked so CAPTCHA is required
    rec.lockedUntil = 0;
    rec.count = Math.max(CAPTCHA_TRIGGER_THRESHOLD, Math.floor(maxFails / 2));
    rec.recentlyLocked = true;
    map.set(key, rec);
  }
  if (now - rec.firstFailAt > cooldownMs * 2) {
    map.delete(key);
    return { locked: false, count: 0, recentlyLocked: false };
  }
  return { locked: false, count: rec.count, recentlyLocked: !!rec.recentlyLocked };
}

function checkAdminLoginRateLimit({ clientIp = 'unknown', username = 'admin', hasTrustedDevice = false } = {}) {
  const ip = String(clientIp || 'unknown').trim();
  const user = String(username || 'admin').trim().toLowerCase();
  const ipAcctKey = `${ip}:${user}`;
  const now = Date.now();

  // 1. Endpoint request volume per IP
  const vol = endpointVolume.get(ip) || { count: 0, windowStart: now };
  if (now - vol.windowStart > ENDPOINT_VOL_WINDOW_MS) {
    vol.count = 1;
    vol.windowStart = now;
  } else {
    vol.count++;
  }
  endpointVolume.set(ip, vol);
  if (vol.count > ENDPOINT_VOL_MAX) {
    const retrySec = Math.max(10, Math.ceil((vol.windowStart + ENDPOINT_VOL_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remainingSec: retrySec,
      captchaRequired: true,
      reason: 'volume_limit',
      error: `Too many requests. Please wait ${retrySec} seconds before trying again.`
    };
  }

  // 2. IP + Account combination check
  const ipAcctStatus = checkRateLimitBucket(ipAcctFailures, ipAcctKey, IP_ACCT_MAX_FAILS, IP_ACCT_COOLDOWN_MS);
  if (ipAcctStatus.locked) {
    return {
      allowed: false,
      remainingSec: ipAcctStatus.remainingSec,
      captchaRequired: true,
      reason: 'ip_account_lockout',
      error: `Too many failed login attempts. Please try again in ${Math.ceil(ipAcctStatus.remainingSec / 60)} minute(s).`
    };
  }

  // 3. IP-level check
  const ipStatus = checkRateLimitBucket(ipFailures, ip, IP_MAX_FAILS, IP_COOLDOWN_MS);
  if (ipStatus.locked) {
    return {
      allowed: false,
      remainingSec: ipStatus.remainingSec,
      captchaRequired: true,
      reason: 'ip_lockout',
      error: `Too many failed login attempts from this network. Please try again in ${Math.ceil(ipStatus.remainingSec / 60)} minute(s).`
    };
  }

  // 4. Concurrency guard (prevents parallel burst from bypassing 5-attempt limit)
  const activeCount = inFlightLogins.get(ipAcctKey) || 0;
  if (activeCount >= 2 || (ipAcctStatus.count + activeCount >= IP_ACCT_MAX_FAILS && activeCount > 0)) {
    return {
      allowed: false,
      remainingSec: 5,
      captchaRequired: ipAcctStatus.count >= CAPTCHA_TRIGGER_THRESHOLD,
      reason: 'concurrent_limit',
      error: 'Another login attempt is currently in progress. Please wait a moment.'
    };
  }

  // 5. Account-level soft risk (never locks out other IPs indefinitely; escalates to CAPTCHA)
  const acctRec = acctFailures.get(user);
  const acctCount = (acctRec && (now - acctRec.firstFailAt <= IP_ACCT_COOLDOWN_MS * 2)) ? acctRec.count : 0;

  // Determine adaptive CAPTCHA requirement
  const captchaRequired =
    ipAcctStatus.count >= CAPTCHA_TRIGGER_THRESHOLD ||
    ipAcctStatus.recentlyLocked ||
    ipStatus.count >= 4 ||
    vol.count >= 12 ||
    (!hasTrustedDevice && acctCount >= ACCT_SOFT_CAPTCHA_THRESHOLD) ||
    acctCount >= ACCT_SOFT_CAPTCHA_THRESHOLD;

  // Progressive delay (capped so legitimate users / tests aren't hung)
  let progressiveDelayMs = 0;
  if (ipAcctStatus.count === 2) progressiveDelayMs = 250;
  else if (ipAcctStatus.count === 3) progressiveDelayMs = 500;
  else if (ipAcctStatus.count >= 4) progressiveDelayMs = 900;

  return {
    allowed: true,
    captchaRequired,
    progressiveDelayMs,
    failCount: ipAcctStatus.count
  };
}

function beginAdminLoginAttempt(clientIp = 'unknown', username = 'admin') {
  const key = `${String(clientIp || 'unknown').trim()}:${String(username || 'admin').trim().toLowerCase()}`;
  inFlightLogins.set(key, (inFlightLogins.get(key) || 0) + 1);
}

function endAdminLoginAttempt(clientIp = 'unknown', username = 'admin') {
  const key = `${String(clientIp || 'unknown').trim()}:${String(username || 'admin').trim().toLowerCase()}`;
  const cur = inFlightLogins.get(key) || 0;
  if (cur <= 1) inFlightLogins.delete(key);
  else inFlightLogins.set(key, cur - 1);
}

function recordBucketFailure(map, key, maxFails, cooldownMs) {
  const now = Date.now();
  const rec = map.get(key) || { count: 0, firstFailAt: now, lockedUntil: 0, recentlyLocked: false };
  if (now - rec.firstFailAt > cooldownMs * 2) {
    rec.count = 1;
    rec.firstFailAt = now;
    rec.lockedUntil = 0;
    rec.recentlyLocked = false;
  } else {
    rec.count++;
  }
  if (rec.count >= maxFails) {
    rec.lockedUntil = now + cooldownMs;
    rec.recentlyLocked = true;
  }
  map.set(key, rec);
  return rec;
}

function recordAdminLoginFailure({ clientIp = 'unknown', username = 'admin' } = {}) {
  const ip = String(clientIp || 'unknown').trim();
  const user = String(username || 'admin').trim().toLowerCase();
  const ipAcctKey = `${ip}:${user}`;

  pruneMapIfNeeded(ipAcctFailures);
  pruneMapIfNeeded(ipFailures);

  const ipAcctRec = recordBucketFailure(ipAcctFailures, ipAcctKey, IP_ACCT_MAX_FAILS, IP_ACCT_COOLDOWN_MS);
  recordBucketFailure(ipFailures, ip, IP_MAX_FAILS, IP_COOLDOWN_MS);

  const now = Date.now();
  const acctRec = acctFailures.get(user) || { count: 0, firstFailAt: now };
  if (now - acctRec.firstFailAt > IP_ACCT_COOLDOWN_MS * 2) {
    acctRec.count = 1;
    acctRec.firstFailAt = now;
  } else {
    acctRec.count++;
  }
  acctFailures.set(user, acctRec);

  return {
    ipAcctCount: ipAcctRec.count,
    locked: !!(ipAcctRec.lockedUntil && Date.now() < ipAcctRec.lockedUntil),
    captchaRequired: ipAcctRec.count >= CAPTCHA_TRIGGER_THRESHOLD
  };
}

function resetAdminLoginRateLimit({ clientIp = 'unknown', username = 'admin' } = {}) {
  const ip = String(clientIp || 'unknown').trim();
  const user = String(username || 'admin').trim().toLowerCase();
  ipAcctFailures.delete(`${ip}:${user}`);
  ipFailures.delete(ip);
  const acctRec = acctFailures.get(user);
  if (acctRec) {
    acctRec.count = Math.max(0, Math.floor(acctRec.count / 2) - 1);
    if (acctRec.count === 0) acctFailures.delete(user);
    else acctFailures.set(user, acctRec);
  }
}

function clearAllAdminRateLimitsForTest() {
  ipAcctFailures.clear();
  ipFailures.clear();
  acctFailures.clear();
  endpointVolume.clear();
  inFlightLogins.clear();
  captchaStore.clear();
  captchaGenRate.clear();
}

// -------------------------------------------------------------------------
// First-Party Adaptive Arithmetic CAPTCHA
// -------------------------------------------------------------------------
const captchaStore = new Map(); // challengeId -> { answerHash, clientIp, username, expiresAt, used }
const captchaGenRate = new Map(); // clientIp -> { count, windowStart }

function hashCaptchaAnswer(challengeId, answer) {
  return crypto.createHash('sha256').update(`${challengeId}:${String(answer).trim()}`).digest('hex');
}

function generateCaptchaChallenge({ clientIp = 'unknown', username = 'admin' } = {}) {
  const ip = String(clientIp || 'unknown').trim();
  const user = String(username || 'admin').trim().toLowerCase();
  const now = Date.now();

  const genRec = captchaGenRate.get(ip) || { count: 0, windowStart: now };
  if (now - genRec.windowStart > CAPTCHA_GEN_WINDOW_MS) {
    genRec.count = 1;
    genRec.windowStart = now;
  } else {
    genRec.count++;
  }
  captchaGenRate.set(ip, genRec);
  if (genRec.count > CAPTCHA_GEN_MAX) {
    return {
      success: false,
      rateLimited: true,
      error: 'Too many security challenges requested. Please wait a few minutes.'
    };
  }

  pruneMapIfNeeded(captchaStore, 2000);

  const opIdx = crypto.randomInt(0, 3);
  let a, b, answer, prompt;
  if (opIdx === 0) {
    a = crypto.randomInt(6, 29);
    b = crypto.randomInt(3, 19);
    answer = a + b;
    prompt = `What is ${a} + ${b}?`;
  } else if (opIdx === 1) {
    a = crypto.randomInt(15, 39);
    b = crypto.randomInt(2, a - 1);
    answer = a - b;
    prompt = `What is ${a} - ${b}?`;
  } else {
    a = crypto.randomInt(2, 9);
    b = crypto.randomInt(3, 9);
    answer = a * b;
    prompt = `What is ${a} × ${b}?`;
  }

  const challengeId = 'cap_' + crypto.randomBytes(16).toString('hex');
  const expiresAt = now + CAPTCHA_TTL_MS;
  captchaStore.set(challengeId, {
    answerHash: hashCaptchaAnswer(challengeId, answer),
    clientIp: ip,
    username: user,
    expiresAt,
    used: false
  });

  return {
    success: true,
    challengeId,
    prompt,
    expiresInSec: Math.floor(CAPTCHA_TTL_MS / 1000)
  };
}

function verifyCaptchaChallenge({ challengeId, answer, clientIp = 'unknown', username = 'admin' } = {}) {
  const id = String(challengeId || '').trim();
  const ans = String(answer === undefined || answer === null ? '' : answer).trim();
  const ip = String(clientIp || 'unknown').trim();
  const user = String(username || 'admin').trim().toLowerCase();

  if (!id || !ans) {
    return { valid: false, reason: 'missing', error: 'Please solve the security verification challenge.' };
  }

  const record = captchaStore.get(id);
  if (!record) {
    return { valid: false, reason: 'invalid_or_replayed', error: 'Security challenge expired or already used. Please solve the new challenge.' };
  }

  // Single-use: invalidate immediately on first verification attempt to prevent replay & guessing
  captchaStore.delete(id);

  if (record.used || Date.now() > record.expiresAt) {
    return { valid: false, reason: 'expired', error: 'Security challenge has expired. Please solve the new challenge.' };
  }

  if (record.clientIp !== ip || record.username !== user) {
    return { valid: false, reason: 'context_mismatch', error: 'Security challenge context mismatch. Please try again.' };
  }

  const actualHash = hashCaptchaAnswer(id, ans);
  const actualBuf = Buffer.from(actualHash, 'hex');
  const expectedBuf = Buffer.from(record.answerHash, 'hex');
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'wrong_answer', error: 'Incorrect security challenge answer. Please try again.' };
  }

  return { valid: true };
}

// -------------------------------------------------------------------------
// In-Memory Fallbacks (when Neon DB is not configured in standalone tests)
// -------------------------------------------------------------------------
const memoryTrustedDevices = new Map(); // tokenHash -> deviceObj
const memorySecurityEvents = []; // ring buffer max 200

function pushMemoryEvent(evt) {
  memorySecurityEvents.unshift(evt);
  if (memorySecurityEvents.length > 200) {
    memorySecurityEvents.length = 200;
  }
}

async function logSecurityEvent({
  eventType,
  actor = 'admin',
  ipAddress = null,
  userAgent = null,
  summary,
  isNeon = false
}) {
  const { browser, os } = parseUserAgent(userAgent);
  const safeSummary = String(summary || eventType).slice(0, 300);
  const evt = {
    event_type: eventType,
    actor: String(actor || 'admin').slice(0, 80),
    ip_address: ipAddress ? String(ipAddress).slice(0, 45) : null,
    browser,
    os,
    summary: safeSummary,
    created_at: new Date().toISOString()
  };

  pushMemoryEvent(evt);

  if (isNeon) {
    try {
      await repos.adminSecurity.logSecurityEvent({
        eventType: evt.event_type,
        actor: evt.actor,
        ipAddress: evt.ip_address,
        browser: evt.browser,
        os: evt.os,
        summary: evt.summary
      });
    } catch (e) {
      // Never fail auth flow if audit log write has transient issue
    }
  }
  return evt;
}

async function listSecurityEventsForUI({ limit = 50, isNeon = false } = {}) {
  let rows = [];
  if (isNeon) {
    try {
      rows = await repos.adminSecurity.listSecurityEvents(limit);
    } catch (e) {
      rows = memorySecurityEvents.slice(0, limit);
    }
  } else {
    rows = memorySecurityEvents.slice(0, limit);
  }

  return rows.map(r => ({
    eventType: r.event_type,
    actor: r.actor,
    browser: r.browser || 'Unknown',
    os: r.os || 'Unknown',
    ipMasked: maskIp(r.ip_address),
    summary: r.summary,
    createdAt: r.created_at
  }));
}

// -------------------------------------------------------------------------
// Trusted Device Management
// -------------------------------------------------------------------------
async function recognizeTrustedDevice({ req, isNeon = false } = {}) {
  const cookies = parseCookies(req);
  const rawToken = (cookies[COOKIE_DEVICE] || '').trim();
  if (!rawToken) {
    return { recognized: false, hasCookie: false, tokenHash: null, device: null };
  }
  const tokenHash = hashToken(rawToken);

  if (isNeon) {
    try {
      const dev = await repos.adminSecurity.findActiveTrustedDeviceByHash(tokenHash);
      if (dev) {
        return { recognized: true, hasCookie: true, tokenHash, device: dev };
      }
      return { recognized: false, hasCookie: true, tokenHash, device: null };
    } catch (e) {
      return { recognized: false, hasCookie: true, tokenHash, device: null };
    }
  }

  const memDev = memoryTrustedDevices.get(tokenHash);
  if (memDev && !memDev.revoked_at && new Date(memDev.trust_expires_at).getTime() > Date.now()) {
    return { recognized: true, hasCookie: true, tokenHash, device: memDev };
  }
  return { recognized: false, hasCookie: true, tokenHash, device: null };
}

async function registerOrTouchTrustedDevice({
  req,
  adminId = null,
  ipAddress = null,
  userAgent = null,
  isNeon = false
} = {}) {
  const recognition = await recognizeTrustedDevice({ req, isNeon });
  const { browser, os, deviceLabel } = parseUserAgent(userAgent);

  if (recognition.recognized && recognition.device) {
    if (isNeon) {
      try {
        await repos.adminSecurity.touchTrustedDevice(recognition.device.id, ipAddress);
      } catch (e) {}
    } else {
      recognition.device.last_used_at = new Date().toISOString();
      recognition.device.ip_address = ipAddress || recognition.device.ip_address;
    }
    return {
      isNew: false,
      rawToken: null, // Existing cookie remains valid
      tokenHash: recognition.tokenHash,
      device: recognition.device
    };
  }

  // Issue new cryptographically random device token
  const rawToken = 'dev_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const trustExpiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);

  if (isNeon) {
    const dev = await repos.adminSecurity.createTrustedDevice({
      adminId,
      tokenHash,
      deviceLabel,
      browser,
      os,
      trustExpiresAt,
      ipAddress
    });
    return { isNew: true, rawToken, tokenHash, device: dev };
  }

  const memDev = {
    id: crypto.randomUUID(),
    admin_id: adminId,
    token_hash: tokenHash,
    device_label: deviceLabel,
    browser,
    os,
    first_registered_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
    trust_expires_at: trustExpiresAt.toISOString(),
    revoked_at: null,
    ip_address: ipAddress
  };
  memoryTrustedDevices.set(tokenHash, memDev);
  return { isNew: true, rawToken, tokenHash, device: memDev };
}

async function listTrustedDevicesForUI({ adminId = null, currentDeviceHash = null, isNeon = false } = {}) {
  let rows = [];
  if (isNeon) {
    rows = await repos.adminSecurity.listActiveTrustedDevices(adminId);
  } else {
    const now = Date.now();
    rows = Array.from(memoryTrustedDevices.values()).filter(
      d => !d.revoked_at && new Date(d.trust_expires_at).getTime() > now
    );
  }

  return rows.map(d => ({
    deviceRef: makeOpaqueRef('dev', d.id),
    deviceLabel: d.device_label,
    browser: d.browser,
    os: d.os,
    firstRegisteredAt: d.first_registered_at,
    lastUsedAt: d.last_used_at,
    trustExpiresAt: d.trust_expires_at,
    isCurrent: !!(currentDeviceHash && d.token_hash === currentDeviceHash)
  }));
}

async function findDeviceByOpaqueRef({ adminId = null, deviceRef, isNeon = false } = {}) {
  let rows = [];
  if (isNeon) {
    rows = await repos.adminSecurity.listActiveTrustedDevices(adminId);
  } else {
    const now = Date.now();
    rows = Array.from(memoryTrustedDevices.values()).filter(
      d => !d.revoked_at && new Date(d.trust_expires_at).getTime() > now
    );
  }
  return rows.find(d => makeOpaqueRef('dev', d.id) === deviceRef) || null;
}

async function renameTrustedDeviceByRef({ adminId = null, deviceRef, newLabel, isNeon = false } = {}) {
  const cleanLabel = String(newLabel || '').replace(/[\r\n\t<>]/g, '').trim().slice(0, 80);
  if (!cleanLabel) return { success: false, error: 'Device name cannot be empty.' };

  const target = await findDeviceByOpaqueRef({ adminId, deviceRef, isNeon });
  if (!target) return { success: false, error: 'Trusted device not found.' };

  if (isNeon) {
    await repos.adminSecurity.renameTrustedDevice(target.id, cleanLabel);
  } else {
    target.device_label = cleanLabel;
  }
  return { success: true, deviceLabel: cleanLabel };
}

async function revokeTrustedDeviceByRef({ adminId = null, deviceRef, revokedBy = 'admin', isNeon = false } = {}) {
  const target = await findDeviceByOpaqueRef({ adminId, deviceRef, isNeon });
  if (!target) return { success: false, error: 'Trusted device not found.' };

  if (isNeon) {
    await repos.adminSecurity.revokeTrustedDevice(target.id, revokedBy);
  } else {
    target.revoked_at = new Date().toISOString();
    target.revoked_by = revokedBy;
  }
  return { success: true, tokenHash: target.token_hash, deviceLabel: target.device_label };
}

async function revokeOtherTrustedDevices({ adminId = null, currentDeviceHash = null, revokedBy = 'admin', isNeon = false } = {}) {
  let currentId = null;
  if (currentDeviceHash) {
    if (isNeon) {
      const cur = await repos.adminSecurity.findActiveTrustedDeviceByHash(currentDeviceHash);
      if (cur) currentId = cur.id;
    } else {
      const cur = memoryTrustedDevices.get(currentDeviceHash);
      if (cur) currentId = cur.id;
    }
  }

  if (isNeon) {
    const count = await repos.adminSecurity.revokeOtherTrustedDevices(currentId, revokedBy);
    return { success: true, revokedCount: count };
  }

  let count = 0;
  for (const d of memoryTrustedDevices.values()) {
    if (!d.revoked_at && (!currentId || d.id !== currentId)) {
      d.revoked_at = new Date().toISOString();
      d.revoked_by = revokedBy;
      count++;
    }
  }
  return { success: true, revokedCount: count };
}

module.exports = {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_ABSOLUTE_TTL_MS,
  TRUSTED_DEVICE_TTL_MS,
  CAPTCHA_TTL_MS,
  COOKIE_SESSION,
  COOKIE_DEVICE,
  COOKIE_CSRF,
  makeOpaqueRef,
  hashToken,
  parseCookies,
  isHttpsRequest,
  buildCookieHeader,
  appendSetCookie,
  parseUserAgent,
  maskIp,
  checkAdminLoginRateLimit,
  beginAdminLoginAttempt,
  endAdminLoginAttempt,
  recordAdminLoginFailure,
  resetAdminLoginRateLimit,
  clearAllAdminRateLimitsForTest,
  generateCaptchaChallenge,
  verifyCaptchaChallenge,
  logSecurityEvent,
  listSecurityEventsForUI,
  recognizeTrustedDevice,
  registerOrTouchTrustedDevice,
  listTrustedDevicesForUI,
  renameTrustedDeviceByRef,
  revokeTrustedDeviceByRef,
  revokeOtherTrustedDevices
};
