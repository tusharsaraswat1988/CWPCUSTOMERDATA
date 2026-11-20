/**
 * Repository for table: staff
 */
const db = require('../index');

async function findAll({ includeInactive = true, client = null } = {}) {
  const runner = client || db;
  let sql = 'SELECT * FROM public.staff WHERE deleted_at IS NULL';
  if (!includeInactive) {
    sql += ' AND is_active = TRUE';
  }
  sql += ' ORDER BY staff_code ASC';
  const res = await runner.query(sql);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findByStaffCode(staffCode, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE UPPER(staff_code) = UPPER($1) AND deleted_at IS NULL LIMIT 1',
    [staffCode.trim()]
  );
  return res.rows[0] || null;
}

async function findByPhone(phone, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
    [phone.trim()]
  );
  return res.rows[0] || null;
}

async function createStaff({ staffCode, name, phone, isActive = true }, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.staff (staff_code, name, phone, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [staffCode.trim().toUpperCase(), name.trim(), phone.trim(), Boolean(isActive)]
  );
  return res.rows[0];
}

async function updateStaff(id, { name, phone, isActive }, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (name !== undefined) {
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone.trim());
    updates.push(`phone = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.staff
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function toggleActive(id, isActive, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff
     SET is_active = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, Boolean(isActive)]
  );
  return res.rows[0] || null;
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff
     SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function countStaff(client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT count(*)::int AS count FROM public.staff WHERE deleted_at IS NULL');
  return res.rows[0].count;
}

module.exports = {
  findAll,
  findById,
  findByStaffCode,
  findByPhone,
  createStaff,
  updateStaff,
  toggleActive,
  softDelete,
  countStaff
};
