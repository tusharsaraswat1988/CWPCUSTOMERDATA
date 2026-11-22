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

async function createStaff({
  staffCode,
  name,
  phone,
  photoUrl = null,
  isActive = true,
  email = null,
  dateOfJoining = null,
  aadharNumber = null,
  aadharFrontUrl = null,
  aadharBackUrl = null,
  bankPassbookUrl = null,
  panNumber = null,
  panCardUrl = null,
  drivingLicenseNumber = null,
  drivingLicenseUrl = null,
  salary = null,
  weeklyOff = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.staff (
       staff_code, name, phone, photo_url, is_active,
       email, date_of_joining, aadhar_number, aadhar_front_url, aadhar_back_url,
       bank_passbook_url, pan_number, pan_card_url, driving_license_number, driving_license_url,
       salary, weekly_off
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      staffCode.trim().toUpperCase(),
      name.trim(),
      phone.trim(),
      photoUrl ? photoUrl.trim() : null,
      Boolean(isActive),
      email ? email.trim() : null,
      dateOfJoining || null,
      aadharNumber ? aadharNumber.trim() : null,
      aadharFrontUrl ? aadharFrontUrl.trim() : null,
      aadharBackUrl ? aadharBackUrl.trim() : null,
      bankPassbookUrl ? bankPassbookUrl.trim() : null,
      panNumber ? panNumber.trim().toUpperCase() : null,
      panCardUrl ? panCardUrl.trim() : null,
      drivingLicenseNumber ? drivingLicenseNumber.trim() : null,
      drivingLicenseUrl ? drivingLicenseUrl.trim() : null,
      salary !== null && salary !== undefined && salary !== '' ? Number(salary) : null,
      weeklyOff ? weeklyOff.trim() : null
    ]
  );
  return res.rows[0];
}

async function updateStaff(id, updateData = {}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  const {
    name,
    phone,
    photoUrl,
    isActive,
    email,
    dateOfJoining,
    date_of_joining,
    aadharNumber,
    aadhar_number,
    aadharFrontUrl,
    aadhar_front_url,
    aadharBackUrl,
    aadhar_back_url,
    bankPassbookUrl,
    bank_passbook_url,
    panNumber,
    pan_number,
    panCardUrl,
    pan_card_url,
    drivingLicenseNumber,
    driving_license_number,
    drivingLicenseUrl,
    driving_license_url,
    salary,
    weeklyOff,
    weekly_off
  } = updateData;

  if (name !== undefined) {
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone.trim());
    updates.push(`phone = $${params.length}`);
  }
  if (photoUrl !== undefined) {
    params.push(photoUrl ? photoUrl.trim() : null);
    updates.push(`photo_url = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  if (email !== undefined) {
    params.push(email ? email.trim() : null);
    updates.push(`email = $${params.length}`);
  }
  const doj = dateOfJoining !== undefined ? dateOfJoining : date_of_joining;
  if (doj !== undefined) {
    params.push(doj || null);
    updates.push(`date_of_joining = $${params.length}`);
  }
  const aadharNo = aadharNumber !== undefined ? aadharNumber : aadhar_number;
  if (aadharNo !== undefined) {
    params.push(aadharNo ? aadharNo.trim() : null);
    updates.push(`aadhar_number = $${params.length}`);
  }
  const aadharF = aadharFrontUrl !== undefined ? aadharFrontUrl : aadhar_front_url;
  if (aadharF !== undefined) {
    params.push(aadharF ? aadharF.trim() : null);
    updates.push(`aadhar_front_url = $${params.length}`);
  }
  const aadharB = aadharBackUrl !== undefined ? aadharBackUrl : aadhar_back_url;
  if (aadharB !== undefined) {
    params.push(aadharB ? aadharB.trim() : null);
    updates.push(`aadhar_back_url = $${params.length}`);
  }
  const passbook = bankPassbookUrl !== undefined ? bankPassbookUrl : bank_passbook_url;
  if (passbook !== undefined) {
    params.push(passbook ? passbook.trim() : null);
    updates.push(`bank_passbook_url = $${params.length}`);
  }
  const panNo = panNumber !== undefined ? panNumber : pan_number;
  if (panNo !== undefined) {
    params.push(panNo ? panNo.trim().toUpperCase() : null);
    updates.push(`pan_number = $${params.length}`);
  }
  const panC = panCardUrl !== undefined ? panCardUrl : pan_card_url;
  if (panC !== undefined) {
    params.push(panC ? panC.trim() : null);
    updates.push(`pan_card_url = $${params.length}`);
  }
  const dlNo = drivingLicenseNumber !== undefined ? drivingLicenseNumber : driving_license_number;
  if (dlNo !== undefined) {
    params.push(dlNo ? dlNo.trim() : null);
    updates.push(`driving_license_number = $${params.length}`);
  }
  const dlUrl = drivingLicenseUrl !== undefined ? drivingLicenseUrl : driving_license_url;
  if (dlUrl !== undefined) {
    params.push(dlUrl ? dlUrl.trim() : null);
    updates.push(`driving_license_url = $${params.length}`);
  }
  if (salary !== undefined) {
    params.push(salary !== null && salary !== '' ? Number(salary) : null);
    updates.push(`salary = $${params.length}`);
  }
  const wOff = weeklyOff !== undefined ? weeklyOff : weekly_off;
  if (wOff !== undefined) {
    params.push(wOff ? wOff.trim() : null);
    updates.push(`weekly_off = $${params.length}`);
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
