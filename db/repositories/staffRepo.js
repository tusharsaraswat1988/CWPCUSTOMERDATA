/**
 * Repository for table: staff
 * Manages Staff Master, Extended Profile, Service Capabilities (Task 01.8),
 * and Designation, Hierarchy & Operational Scope (Task 01.9).
 */
const db = require('../index');

function isNeonConfigured() {
  const isConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_STAFF_TEST);
}

// In-memory local fallback store for isolated unit/QA testing
let localStaffStore = [];

function __resetLocalStores() {
  localStaffStore = [];
}

function normalizeStaffRow(row) {
  if (!row) return null;
  let caps = row.service_capabilities;
  if (typeof caps === 'string') {
    try {
      caps = JSON.parse(caps);
    } catch (_) {
      caps = ['daily_car_cleaning'];
    }
  }
  return {
    ...row,
    service_capabilities: caps || ['daily_car_cleaning'],
    serviceCapabilities: caps || ['daily_car_cleaning'],
    workType: row.work_type || 'dcc_only',
    work_type: row.work_type || 'dcc_only',
    designationId: row.designation_id || 'cleaner',
    designation_id: row.designation_id || 'cleaner',
    reportsToId: row.reports_to_id || null,
    reports_to_id: row.reports_to_id || null,
    teamName: row.team_name || null,
    team_name: row.team_name || null,
    operationalScope: row.operational_scope || null,
    operational_scope: row.operational_scope || null
  };
}

async function findAll({ includeInactive = true, client = null } = {}) {
  if (isNeonConfigured()) {
    const runner = client || db;
    let sql = 'SELECT * FROM public.staff WHERE deleted_at IS NULL';
    if (!includeInactive) {
      sql += ' AND is_active = TRUE';
    }
    sql += ' ORDER BY staff_code ASC';
    const res = await runner.query(sql);
    return res.rows.map(normalizeStaffRow);
  }

  // Local fallback
  return localStaffStore
    .filter(s => !s.deleted_at && (includeInactive || s.is_active))
    .sort((a, b) => (a.staff_code || '').localeCompare(b.staff_code || ''))
    .map(normalizeStaffRow);
}

async function findById(id, client = null) {
  if (!id) return null;
  const target = String(id).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

  if (isNeonConfigured()) {
    if (!isUuid) return null;
    const runner = client || db;
    const res = await runner.query(
      'SELECT * FROM public.staff WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [target]
    );
    return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
  }

  // Local fallback
  const found = localStaffStore.find(s => s.id === target && !s.deleted_at);
  return found ? normalizeStaffRow(found) : null;
}

async function findByStaffCode(staffCode, client = null) {
  if (!staffCode) return null;
  const cleanCode = String(staffCode).trim().toUpperCase();

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      'SELECT * FROM public.staff WHERE UPPER(staff_code) = UPPER($1) AND deleted_at IS NULL LIMIT 1',
      [cleanCode]
    );
    return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
  }

  // Local fallback
  const found = localStaffStore.find(s => (s.staff_code || '').toUpperCase() === cleanCode && !s.deleted_at);
  return found ? normalizeStaffRow(found) : null;
}

async function findByPhone(phone, client = null) {
  if (!phone) return null;
  const cleanPhone = String(phone).trim();

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      'SELECT * FROM public.staff WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
      [cleanPhone]
    );
    return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
  }

  // Local fallback
  const found = localStaffStore.find(s => s.phone === cleanPhone && !s.deleted_at);
  return found ? normalizeStaffRow(found) : null;
}

async function findSubordinates(managerId, client = null) {
  if (!managerId) return [];

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      'SELECT * FROM public.staff WHERE reports_to_id = $1 AND deleted_at IS NULL ORDER BY staff_code ASC',
      [managerId]
    );
    return res.rows.map(normalizeStaffRow);
  }

  // Local fallback
  return localStaffStore
    .filter(s => s.reports_to_id === managerId && !s.deleted_at)
    .sort((a, b) => (a.staff_code || '').localeCompare(b.staff_code || ''))
    .map(normalizeStaffRow);
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
  weeklyOff = null,
  workType = 'dcc_only',
  work_type = null,
  serviceCapabilities = ['daily_car_cleaning'],
  service_capabilities = null,
  designationId = 'cleaner',
  designation_id = null,
  reportsToId = null,
  reports_to_id = null,
  teamName = null,
  team_name = null,
  operationalScope = null,
  operational_scope = null
}, client = null) {
  const effectiveWorkType = (work_type || workType || 'dcc_only').toLowerCase().trim();
  const effectiveCaps = Array.isArray(service_capabilities) ? service_capabilities : (Array.isArray(serviceCapabilities) ? serviceCapabilities : ['daily_car_cleaning']);
  const effectiveDesignation = (designation_id || designationId || (effectiveWorkType === 'services_only' ? 'service_specialist' : 'cleaner')).toLowerCase().trim();
  const effectiveReportsTo = reports_to_id || reportsToId || null;
  const effectiveTeam = (team_name || teamName || '').trim() || null;
  const effectiveScope = (operational_scope || operationalScope || '').trim() || null;
  const code = staffCode.trim().toUpperCase();
  const stfName = name.trim();
  const stfPhone = phone.trim();

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `INSERT INTO public.staff (
         staff_code, name, phone, photo_url, is_active,
         email, date_of_joining, aadhar_number, aadhar_front_url, aadhar_back_url,
         bank_passbook_url, pan_number, pan_card_url, driving_license_number, driving_license_url,
         salary, weekly_off, work_type, service_capabilities,
         designation_id, reports_to_id, team_name, operational_scope
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING *`,
      [
        code,
        stfName,
        stfPhone,
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
        weeklyOff ? weeklyOff.trim() : null,
        effectiveWorkType,
        JSON.stringify(effectiveCaps),
        effectiveDesignation,
        effectiveReportsTo,
        effectiveTeam,
        effectiveScope
      ]
    );
    return normalizeStaffRow(res.rows[0]);
  }

  // Local fallback
  const newStaff = {
    id: 'stf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    staff_code: code,
    name: stfName,
    phone: stfPhone,
    photo_url: photoUrl ? photoUrl.trim() : null,
    is_active: Boolean(isActive),
    email: email ? email.trim() : null,
    date_of_joining: dateOfJoining || null,
    aadhar_number: aadharNumber ? aadharNumber.trim() : null,
    aadhar_front_url: aadharFrontUrl ? aadharFrontUrl.trim() : null,
    aadhar_back_url: aadharBackUrl ? aadharBackUrl.trim() : null,
    bank_passbook_url: bankPassbookUrl ? bankPassbookUrl.trim() : null,
    pan_number: panNumber ? panNumber.trim().toUpperCase() : null,
    pan_card_url: panCardUrl ? panCardUrl.trim() : null,
    driving_license_number: drivingLicenseNumber ? drivingLicenseNumber.trim() : null,
    driving_license_url: drivingLicenseUrl ? drivingLicenseUrl.trim() : null,
    salary: salary !== null && salary !== undefined && salary !== '' ? Number(salary) : null,
    weekly_off: weeklyOff ? weeklyOff.trim() : null,
    work_type: effectiveWorkType,
    service_capabilities: effectiveCaps,
    designation_id: effectiveDesignation,
    reports_to_id: effectiveReportsTo,
    team_name: effectiveTeam,
    operational_scope: effectiveScope,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null
  };

  localStaffStore.push(newStaff);
  return normalizeStaffRow(newStaff);
}

async function updateStaff(id, updateData = {}, client = null) {
  if (!id) throw new Error('Staff ID is required.');

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
    weekly_off,
    workType,
    work_type,
    serviceCapabilities,
    service_capabilities,
    designationId,
    designation_id,
    reportsToId,
    reports_to_id,
    teamName,
    team_name,
    operationalScope,
    operational_scope
  } = updateData;

  if (isNeonConfigured()) {
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
    const wType = workType !== undefined ? workType : work_type;
    if (wType !== undefined) {
      params.push(wType ? String(wType).toLowerCase().trim() : 'dcc_only');
      updates.push(`work_type = $${params.length}`);
    }
    const sCaps = serviceCapabilities !== undefined ? serviceCapabilities : service_capabilities;
    if (sCaps !== undefined) {
      const capsArray = Array.isArray(sCaps) ? sCaps : (typeof sCaps === 'string' ? JSON.parse(sCaps) : []);
      params.push(JSON.stringify(capsArray));
      updates.push(`service_capabilities = $${params.length}::jsonb`);
    }

    // Task 01.9: Designation & Hierarchy Updates
    const desig = designationId !== undefined ? designationId : designation_id;
    if (desig !== undefined) {
      params.push(desig ? String(desig).toLowerCase().trim() : 'cleaner');
      updates.push(`designation_id = $${params.length}`);
    }
    const mgr = reportsToId !== undefined ? reportsToId : reports_to_id;
    if (mgr !== undefined) {
      params.push(mgr || null);
      updates.push(`reports_to_id = $${params.length}`);
    }
    const tm = teamName !== undefined ? teamName : team_name;
    if (tm !== undefined) {
      params.push(tm ? String(tm).trim() : null);
      updates.push(`team_name = $${params.length}`);
    }
    const scp = operationalScope !== undefined ? operationalScope : operational_scope;
    if (scp !== undefined) {
      params.push(scp ? String(scp).trim() : null);
      updates.push(`operational_scope = $${params.length}`);
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

  // Local fallback
  const idx = localStaffStore.findIndex(s => s.id === id && !s.deleted_at);
  if (idx >= 0) {
    const s = localStaffStore[idx];
    if (name !== undefined) s.name = name.trim();
    if (phone !== undefined) s.phone = phone.trim();
    if (photoUrl !== undefined) s.photo_url = photoUrl ? photoUrl.trim() : null;
    if (isActive !== undefined) s.is_active = Boolean(isActive);
    if (email !== undefined) s.email = email ? email.trim() : null;
    const doj = dateOfJoining !== undefined ? dateOfJoining : date_of_joining;
    if (doj !== undefined) s.date_of_joining = doj || null;
    const aadharNo = aadharNumber !== undefined ? aadharNumber : aadhar_number;
    if (aadharNo !== undefined) s.aadhar_number = aadharNo ? aadharNo.trim() : null;
    const aadharF = aadharFrontUrl !== undefined ? aadharFrontUrl : aadhar_front_url;
    if (aadharF !== undefined) s.aadhar_front_url = aadharF ? aadharF.trim() : null;
    const aadharB = aadharBackUrl !== undefined ? aadharBackUrl : aadhar_back_url;
    if (aadharB !== undefined) s.aadhar_back_url = aadharB ? aadharB.trim() : null;
    const passbook = bankPassbookUrl !== undefined ? bankPassbookUrl : bank_passbook_url;
    if (passbook !== undefined) s.bank_passbook_url = passbook ? passbook.trim() : null;
    const panNo = panNumber !== undefined ? panNumber : pan_number;
    if (panNo !== undefined) s.pan_number = panNo ? panNo.trim().toUpperCase() : null;
    const panC = panCardUrl !== undefined ? panCardUrl : pan_card_url;
    if (panC !== undefined) s.pan_card_url = panC ? panC.trim() : null;
    const dlNo = drivingLicenseNumber !== undefined ? drivingLicenseNumber : driving_license_number;
    if (dlNo !== undefined) s.driving_license_number = dlNo ? dlNo.trim() : null;
    const dlUrl = drivingLicenseUrl !== undefined ? drivingLicenseUrl : driving_license_url;
    if (dlUrl !== undefined) s.driving_license_url = dlUrl ? dlUrl.trim() : null;
    if (salary !== undefined) s.salary = salary !== null && salary !== '' ? Number(salary) : null;
    const wOff = weeklyOff !== undefined ? weeklyOff : weekly_off;
    if (wOff !== undefined) s.weekly_off = wOff ? wOff.trim() : null;
    const wType = workType !== undefined ? workType : work_type;
    if (wType !== undefined) s.work_type = wType ? String(wType).toLowerCase().trim() : 'dcc_only';
    const sCaps = serviceCapabilities !== undefined ? serviceCapabilities : service_capabilities;
    if (sCaps !== undefined) {
      s.service_capabilities = Array.isArray(sCaps) ? sCaps : (typeof sCaps === 'string' ? JSON.parse(sCaps) : []);
    }
    const desig = designationId !== undefined ? designationId : designation_id;
    if (desig !== undefined) s.designation_id = desig ? String(desig).toLowerCase().trim() : 'cleaner';
    const mgr = reportsToId !== undefined ? reportsToId : reports_to_id;
    if (mgr !== undefined) s.reports_to_id = mgr || null;
    const tm = teamName !== undefined ? teamName : team_name;
    if (tm !== undefined) s.team_name = tm ? String(tm).trim() : null;
    const scp = operationalScope !== undefined ? operationalScope : operational_scope;
    if (scp !== undefined) s.operational_scope = scp ? String(scp).trim() : null;
    s.updated_at = new Date().toISOString();

    return normalizeStaffRow(s);
  }
  return null;
}

async function toggleActive(id, isActive, client = null) {
  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `UPDATE public.staff
       SET is_active = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, Boolean(isActive)]
    );
    return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
  }

  // Local fallback
  const s = localStaffStore.find(x => x.id === id && !x.deleted_at);
  if (s) {
    s.is_active = Boolean(isActive);
    s.updated_at = new Date().toISOString();
    return normalizeStaffRow(s);
  }
  return null;
}

async function softDelete(id, client = null) {
  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `UPDATE public.staff
       SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    return res.rows[0] ? normalizeStaffRow(res.rows[0]) : null;
  }

  // Local fallback
  const s = localStaffStore.find(x => x.id === id && !x.deleted_at);
  if (s) {
    s.deleted_at = new Date().toISOString();
    s.is_active = false;
    s.updated_at = new Date().toISOString();
    return normalizeStaffRow(s);
  }
  return null;
}

async function countStaff(client = null) {
  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query('SELECT count(*)::int AS count FROM public.staff WHERE deleted_at IS NULL');
    return res.rows[0].count;
  }

  // Local fallback
  return localStaffStore.filter(s => !s.deleted_at).length;
}

module.exports = {
  findAll,
  findById,
  findByStaffCode,
  findByPhone,
  findSubordinates,
  createStaff,
  updateStaff,
  toggleActive,
  softDelete,
  countStaff,
  normalizeStaffRow,
  __resetLocalStores
};
