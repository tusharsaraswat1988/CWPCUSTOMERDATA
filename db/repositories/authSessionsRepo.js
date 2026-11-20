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
  userAgent = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.auth_sessions (
       token_hash, user_type, staff_id, admin_id, expires_at, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tokenHash, userType, staffId, adminId, expiresAt, ipAddress, userAgent]
  );
  return res.rows[0];
}

async function findActiveSession(tokenHash, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT s.*, 
            st.staff_code, st.name AS staff_name, st.phone AS staff_phone, st.is_active AS staff_active,
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
  revokeSession,
  revokeAllForStaff,
  revokeAllForAdmin,
  cleanupExpired
};
