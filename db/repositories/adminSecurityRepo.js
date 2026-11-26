/**
 * Repository for Admin Security:
 * - admin_trusted_devices
 * - admin_security_events
 */
const db = require('../index');

async function createTrustedDevice({
  adminId = null,
  tokenHash,
  deviceLabel,
  browser,
  os,
  trustExpiresAt,
  ipAddress = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.admin_trusted_devices (
       admin_id, token_hash, device_label, browser, os, trust_expires_at, ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [adminId, tokenHash, deviceLabel, browser, os, trustExpiresAt, ipAddress]
  );
  return res.rows[0];
}

async function findActiveTrustedDeviceByHash(tokenHash, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.admin_trusted_devices
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND trust_expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function findTrustedDeviceByHashAny(tokenHash, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.admin_trusted_devices
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function touchTrustedDevice(id, ipAddress = null, client = null) {
  const runner = client || db;
  await runner.query(
    `UPDATE public.admin_trusted_devices
     SET last_used_at = CURRENT_TIMESTAMP,
         ip_address = COALESCE($2, ip_address)
     WHERE id = $1`,
    [id, ipAddress]
  );
}

async function listActiveTrustedDevices(adminId = null, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT id, admin_id, token_hash, device_label, browser, os,
            first_registered_at, last_used_at, trust_expires_at
     FROM public.admin_trusted_devices
     WHERE revoked_at IS NULL
       AND trust_expires_at > CURRENT_TIMESTAMP
       AND ($1::uuid IS NULL OR admin_id = $1 OR admin_id IS NULL)
     ORDER BY last_used_at DESC`,
    [adminId]
  );
  return res.rows;
}

async function renameTrustedDevice(id, deviceLabel, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.admin_trusted_devices
     SET device_label = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
    [id, deviceLabel]
  );
  return res.rows[0] || null;
}

async function revokeTrustedDevice(id, revokedBy = 'admin', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.admin_trusted_devices
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
    [id, revokedBy]
  );
  return res.rows[0] || null;
}

async function revokeOtherTrustedDevices(currentDeviceId, revokedBy = 'admin', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.admin_trusted_devices
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE revoked_at IS NULL
       AND ($1::uuid IS NULL OR id <> $1)`,
    [currentDeviceId || null, revokedBy]
  );
  return res.rowCount || 0;
}

async function logSecurityEvent({
  eventType,
  actor = 'admin',
  ipAddress = null,
  browser = null,
  os = null,
  summary
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.admin_security_events (
       event_type, actor, ip_address, browser, os, summary
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [eventType, actor, ipAddress, browser, os, summary]
  );
  return res.rows[0];
}

async function listSecurityEvents(limit = 50, client = null) {
  const runner = client || db;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const res = await runner.query(
    `SELECT event_type, actor, ip_address, browser, os, summary, created_at
     FROM public.admin_security_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return res.rows;
}

module.exports = {
  createTrustedDevice,
  findActiveTrustedDeviceByHash,
  findTrustedDeviceByHashAny,
  touchTrustedDevice,
  listActiveTrustedDevices,
  renameTrustedDevice,
  revokeTrustedDevice,
  revokeOtherTrustedDevices,
  logSecurityEvent,
  listSecurityEvents
};
