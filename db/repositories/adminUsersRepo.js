/**
 * Repository for table: admin_users
 */
const db = require('../index');

async function findByUsername(username, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.admin_users WHERE LOWER(username) = LOWER($1) LIMIT 1',
    [username.trim()]
  );
  return res.rows[0] || null;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.admin_users WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function createAdmin({ username, phone = null, passwordHash, role = 'superadmin' }, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.admin_users (username, phone, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [username.trim(), phone ? phone.trim() : null, passwordHash, role]
  );
  return res.rows[0];
}

async function updatePassword(id, passwordHash, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.admin_users 
     SET password_hash = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $1
     RETURNING *`,
    [id, passwordHash]
  );
  return res.rows[0] || null;
}

async function updateLastLogin(id, client = null) {
  const runner = client || db;
  await runner.query(
    'UPDATE public.admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
}

async function countAdmins(client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT count(*)::int AS count FROM public.admin_users');
  return res.rows[0].count;
}

module.exports = {
  findByUsername,
  findById,
  createAdmin,
  updatePassword,
  updateLastLogin,
  countAdmins
};
