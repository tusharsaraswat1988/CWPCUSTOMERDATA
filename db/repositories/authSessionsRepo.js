/**
 * Repository for table: auth_sessions
 */
const db = require('../index');

async function createSession({
  tokenHash,
  userType,
  staffId = null,
  adminId = null,
  expiresAt,
  ipAddress = null,
  userAgent = null,
  deviceId = null,
  deviceLabel = null,
  browser = null,
  os = null,
  trustedDeviceId = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.auth_sessions (
       token_hash, user_type, staff_id, admin_id, expires_at, ip_address, user_agent, device_id,
       last_activity_at, device_label, browser, os, trusted_device_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12)
     RETURNING *`,
    [tokenHash, userType, staffId, adminId, expiresAt, ipAddress, userAgent, deviceId, deviceLabel, browser, os, trustedDeviceId]
  );
  return res.rows[0];
}

async function findActiveSession(tokenHash, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT s.*, 
            st.staff_code, st.name AS staff_name, st.phone AS staff_phone, (st.status = 'Active') AS staff_active,
            adm.username AS admin_username, adm.role AS admin_role, adm.is_active AS admin_active
     FROM public.auth_sessions s
     LEFT JOIN public.staff st ON s.staff_id = st.id
     LEFT JOIN public.admin_users adm ON s.admin_id = adm.id
     WHERE s.token_hash = $1 
       AND s.revoked_at IS NULL 
       AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function findActiveForStaff(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.auth_sessions
     WHERE staff_id = $1 
       AND revoked_at IS NULL 
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC
     LIMIT 1`,
    [staffId]
  );
  return res.rows[0] || null;
}

async function revokeSession(tokenHash, revokedBy = 'user', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING *`,
    [tokenHash, revokedBy]
  );
  return res.rows[0] || null;
}

async function revokeAllForStaff(staffId, revokedBy = 'system', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE staff_id = $1 AND revoked_at IS NULL`,
    [staffId, revokedBy]
  );
  return res.rowCount || 0;
}

async function revokeAllForAdmin(adminId, revokedBy = 'system', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE admin_id = $1 AND revoked_at IS NULL`,
    [adminId, revokedBy]
  );
  return res.rowCount || 0;
}

async function touchAdminSession(tokenHash, client = null) {
  const runner = client || db;
  await runner.query(
    `UPDATE public.auth_sessions
     SET last_activity_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function listActiveAdminSessions(adminId = null, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT token_hash, ip_address, user_agent, device_label, browser, os,
            trusted_device_id, created_at, last_activity_at, expires_at
     FROM public.auth_sessions
     WHERE user_type = 'admin'
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND ($1::uuid IS NULL OR admin_id = $1 OR admin_id IS NULL)
     ORDER BY last_activity_at DESC`,
    [adminId]
  );
  return res.rows;
}

async function revokeOtherAdminSessions(currentTokenHash, revokedBy = 'admin_logout_others', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2
     WHERE user_type = 'admin'
       AND revoked_at IS NULL
       AND token_hash <> $1`,
    [currentTokenHash, revokedBy]
  );
  return res.rowCount || 0;
}

async function revokeAllAdminSessionsAny(revokedBy = 'admin_logout_all', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.auth_sessions
     SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $1
     WHERE user_type = 'admin'
       AND revoked_at IS NULL`,
    [revokedBy]
  );
  return res.rowCount || 0;
}

async function cleanupExpired(client = null) {
  const runner = client || db;
  const res = await runner.query(
    `DELETE FROM public.auth_sessions
     WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
  );
  return res.rowCount || 0;
}

module.exports = {
  createSession,
  findActiveSession,
  findActiveForStaff,
  revokeSession,
  revokeAllForStaff,
  revokeAllForAdmin,
  touchAdminSession,
  listActiveAdminSessions,
  revokeOtherAdminSessions,
  revokeAllAdminSessionsAny,
  cleanupExpired
};
