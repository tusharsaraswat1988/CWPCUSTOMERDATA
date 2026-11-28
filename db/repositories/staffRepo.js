/**
 * Repository for table: staff (BRD v1.0)
 * Manages Staff Master & 4 Boolean Capabilities:
 * can_dcc, can_car_wash, can_solar, can_detailing
 */

'use strict';

const db = require('../index');

const CAPABILITY_COLUMN_MAP = {
  dcc: 'can_dcc',
  daily_car_cleaning: 'can_dcc',
  car_wash: 'can_car_wash',
  car_washing: 'can_car_wash',
  solar: 'can_solar',
  solar_cleaning: 'can_solar',
  detailing: 'can_detailing',
  interior_detailing: 'can_detailing',
  exterior_detailing: 'can_detailing'
};

function normalizeStaffRow(row) {
  if (!row) return null;
  let docs = row.documents || {};
  if (typeof docs === 'string') {
    try { docs = JSON.parse(docs); } catch (_) { docs = {}; }
  }
  return {
    ...row,
    documents: docs,
    is_active: row.status === 'Active',
    salary: row.salary_amount !== undefined ? row.salary_amount : null,
    date_of_joining: row.joining_date || null,
    capabilities: {
      dcc: Boolean(row.can_dcc),
      car_wash: Boolean(row.can_car_wash),
      solar: Boolean(row.can_solar),
      detailing: Boolean(row.can_detailing)
    }
  };
}

function normalizeStatus(status, isActive) {
  if (status !== undefined && status !== null) {
    const s = String(status).trim().toLowerCase();
    if (s === 'inactive' || s === 'false') return 'Inactive';
    return 'Active';
  }
  if (isActive !== undefined && isActive !== null) {
    return Boolean(isActive) ? 'Active' : 'Inactive';
  }
  return 'Active';
}

async function findAll({ includeInactive = true, capability = null, client = null } = {}) {
  const runner = client || db;
  const conditions = ['deleted_at IS NULL'];

  if (!includeInactive) {
    conditions.push("status = 'Active'");
  }

  if (capability) {
    const capCol = CAPABILITY_COLUMN_MAP[String(capability).trim().toLowerCase()];
    if (!capCol) {
      throw new Error(`Invalid staff capability filter '${capability}'.`);
    }
    conditions.push(`${capCol} = TRUE`);
  }

  const sql = `
    SELECT * FROM public.staff
    WHERE ${conditions.join(' AND ')}
    ORDER BY staff_code ASC
  `;
  const res = await runner.query(sql);
  return res.rows.map(normalizeStaffRow);
}

async function findById(id, client = null) {
  if (!id) return null;
  const target = String(id).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);
  if (!isUuid) return null;

  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [target]
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function findByStaffCode(staffCode, client = null) {
  if (!staffCode) return null;
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE UPPER(staff_code) = UPPER($1) AND deleted_at IS NULL LIMIT 1',
    [String(staffCode).trim()]
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function findByPhone(phone, client = null) {
  if (!phone) return null;
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.staff WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
    [String(phone).trim()]
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function createStaff({
  staffCode,
  name,
  phone,
  canDcc = false,
  canCarWash = false,
  canSolar = false,
  canDetailing = false,
  can_dcc,
  can_car_wash,
  can_solar,
  can_detailing,
  status,
  isActive,
  photoUrl = null,
  weeklyOff = null,
  weekly_off = null,
  salaryAmount = null,
  salary = null,
  joiningDate = null,
  dateOfJoining = null,
  address = null,
  documents = {}
}, client = null) {
  const runner = client || db;
  const code = String(staffCode || '').trim().toUpperCase();
  const stfName = String(name || '').trim();
  const stfPhone = String(phone || '').trim();
  if (!code || !stfName || !stfPhone) {
    throw new Error('staffCode, name, and phone are required.');
  }

  const effDcc = Boolean(can_dcc !== undefined ? can_dcc : canDcc);
  const effCarWash = Boolean(can_car_wash !== undefined ? can_car_wash : canCarWash);
  const effSolar = Boolean(can_solar !== undefined ? can_solar : canSolar);
  const effDetailing = Boolean(can_detailing !== undefined ? can_detailing : canDetailing);
  const effStatus = normalizeStatus(status, isActive);
  const effSalary = salaryAmount !== undefined && salaryAmount !== null && salaryAmount !== ''
    ? Number(salaryAmount)
    : (salary !== undefined && salary !== null && salary !== '' ? Number(salary) : null);
  const effJoining = joiningDate || dateOfJoining || null;
  const effWeeklyOff = weeklyOff !== undefined ? weeklyOff : weekly_off;
  const effDocs = (documents && typeof documents === 'object') ? documents : {};

  const res = await runner.query(
    `INSERT INTO public.staff (
       staff_code, name, phone, can_dcc, can_car_wash, can_solar, can_detailing,
       status, photo_url, weekly_off, salary_amount, joining_date, address, documents
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     RETURNING *`,
    [
      code,
      stfName,
      stfPhone,
      effDcc,
      effCarWash,
      effSolar,
      effDetailing,
      effStatus,
      photoUrl ? String(photoUrl).trim() : null,
      effWeeklyOff ? String(effWeeklyOff).trim() : null,
      effSalary,
      effJoining,
      address ? String(address).trim() : null,
      JSON.stringify(effDocs)
    ]
  );
  return normalizeStaffRow(res.rows[0]);
}

async function updateStaff(id, updateData = {}, client = null) {
  if (!id) throw new Error('Staff ID is required.');
  const runner = client || db;
  const updates = [];
  const params = [id];

  const {
    name,
    phone,
    canDcc,
    canCarWash,
    canSolar,
    canDetailing,
    can_dcc,
    can_car_wash,
    can_solar,
    can_detailing,
    status,
    isActive,
    photoUrl,
    weeklyOff,
    weekly_off,
    salaryAmount,
    salary,
    joiningDate,
    dateOfJoining,
    date_of_joining,
    address,
    documents
  } = updateData;

  if (name !== undefined) {
    params.push(String(name || '').trim());
    updates.push(`name = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(String(phone || '').trim());
    updates.push(`phone = $${params.length}`);
  }
  const effDcc = can_dcc !== undefined ? can_dcc : canDcc;
  if (effDcc !== undefined) {
    params.push(Boolean(effDcc));
    updates.push(`can_dcc = $${params.length}`);
  }
  const effCarWash = can_car_wash !== undefined ? can_car_wash : canCarWash;
  if (effCarWash !== undefined) {
    params.push(Boolean(effCarWash));
    updates.push(`can_car_wash = $${params.length}`);
  }
  const effSolar = can_solar !== undefined ? can_solar : canSolar;
  if (effSolar !== undefined) {
    params.push(Boolean(effSolar));
    updates.push(`can_solar = $${params.length}`);
  }
  const effDetailing = can_detailing !== undefined ? can_detailing : canDetailing;
  if (effDetailing !== undefined) {
    params.push(Boolean(effDetailing));
    updates.push(`can_detailing = $${params.length}`);
  }
  if (status !== undefined || isActive !== undefined) {
    params.push(normalizeStatus(status, isActive));
    updates.push(`status = $${params.length}`);
  }
  if (photoUrl !== undefined) {
    params.push(photoUrl ? String(photoUrl).trim() : null);
    updates.push(`photo_url = $${params.length}`);
  }
  const effWeeklyOff = weeklyOff !== undefined ? weeklyOff : weekly_off;
  if (effWeeklyOff !== undefined) {
    params.push(effWeeklyOff ? String(effWeeklyOff).trim() : null);
    updates.push(`weekly_off = $${params.length}`);
  }
  const effSalary = salaryAmount !== undefined ? salaryAmount : salary;
  if (effSalary !== undefined) {
    params.push(effSalary !== null && effSalary !== '' ? Number(effSalary) : null);
    updates.push(`salary_amount = $${params.length}`);
  }
  const effJoining = joiningDate !== undefined ? joiningDate : (dateOfJoining !== undefined ? dateOfJoining : date_of_joining);
  if (effJoining !== undefined) {
    params.push(effJoining || null);
    updates.push(`joining_date = $${params.length}`);
  }
  if (address !== undefined) {
    params.push(address ? String(address).trim() : null);
    updates.push(`address = $${params.length}`);
  }
  if (documents !== undefined) {
    const docsObj = typeof documents === 'string' ? JSON.parse(documents) : (documents || {});
    params.push(JSON.stringify(docsObj));
    updates.push(`documents = $${params.length}::jsonb`);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.staff
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function toggleActive(id, isActive, client = null) {
  const runner = client || db;
  const nextStatus = Boolean(isActive) ? 'Active' : 'Inactive';
  const res = await runner.query(
    `UPDATE public.staff
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, nextStatus]
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff
     SET deleted_at = CURRENT_TIMESTAMP, status = 'Inactive', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
}

async function countStaff({ activeOnly = false, client = null } = {}) {
  const runner = client || db;
  const activeFilter = activeOnly ? "AND status = 'Active'" : '';
  const res = await runner.query(
    `SELECT count(*)::int AS count FROM public.staff WHERE deleted_at IS NULL ${activeFilter}`
  );
  return res.rows[0].count;
}

module.exports = {
  CAPABILITY_COLUMN_MAP,
  normalizeStaffRow,
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
