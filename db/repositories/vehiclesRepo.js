/**
 * Repository for table: vehicles (BRD v1.0)
 */

'use strict';

const db = require('../index');

const ALLOWED_SEATER_TYPES = ['5_seater', '5_plus_seater'];

function validateSeaterType(val) {
  const clean = String(val || '').trim().toLowerCase();
  if (!ALLOWED_SEATER_TYPES.includes(clean)) {
    throw new Error(`Invalid seater_type '${val}'. Allowed values: '5_seater' or '5_plus_seater'.`);
  }
  return clean;
}

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  let sql = `
    SELECT v.*,
           loc.label AS location_label,
           loc.address_text,
           loc.address_text_hi,
           loc.google_maps_url,
           loc.latitude,
           loc.longitude,
           loc.parking_details
    FROM public.vehicles v
    JOIN public.service_locations loc ON v.location_id = loc.id
    WHERE v.customer_id = $1
  `;
  if (!includeDeleted) {
    sql += ' AND v.deleted_at IS NULL';
  }
  sql += ' ORDER BY v.created_at ASC';
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT v.*,
            loc.label AS location_label,
            loc.address_text,
            loc.address_text_hi,
            loc.google_maps_url,
            loc.latitude,
            loc.longitude,
            loc.parking_details
     FROM public.vehicles v
     JOIN public.service_locations loc ON v.location_id = loc.id
     WHERE v.id = $1 AND v.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByRegistration(registrationNo, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT v.*,
            loc.label AS location_label,
            loc.address_text
     FROM public.vehicles v
     JOIN public.service_locations loc ON v.location_id = loc.id
     WHERE UPPER(TRIM(v.registration_no)) = UPPER(TRIM($1)) AND v.deleted_at IS NULL`,
    [String(registrationNo || '')]
  );
  return res.rows;
}

async function findByCustomerAndReg(customerId, registrationNo, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT v.*,
            loc.label AS location_label,
            loc.address_text
     FROM public.vehicles v
     JOIN public.service_locations loc ON v.location_id = loc.id
     WHERE v.customer_id = $1
       AND UPPER(TRIM(v.registration_no)) = UPPER(TRIM($2))
       AND v.deleted_at IS NULL
     LIMIT 1`,
    [customerId, String(registrationNo || '')]
  );
  return res.rows[0] || null;
}

async function createVehicle({
  customerId,
  locationId = null,
  defaultLocationId = null,
  registrationNo,
  seaterType = null,
  seater_type = null,
  carModel = null,
  brandOrModel = null,
  carMake = null,
  car_make = null,
  carColor = null,
  car_color = null,
  isActive = true
}, client = null) {
  const runner = client || db;
  const resolvedLocationId = locationId || defaultLocationId;
  if (!resolvedLocationId) {
    throw new Error('locationId is mandatory for creating a vehicle.');
  }
  const cleanReg = String(registrationNo || '').trim().toUpperCase().slice(0, 25);
  if (!cleanReg) {
    throw new Error('registrationNo is mandatory for creating a vehicle.');
  }
  const cleanSeater = validateSeaterType(seaterType !== null ? seaterType : seater_type);
  const modelVal = carModel || brandOrModel || carMake || car_make;
  const colorVal = carColor || car_color;

  const res = await runner.query(
    `INSERT INTO public.vehicles (
       customer_id, location_id, registration_no, seater_type, car_model, car_color, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      customerId,
      resolvedLocationId,
      cleanReg,
      cleanSeater,
      modelVal ? String(modelVal).trim() : null,
      colorVal ? String(colorVal).trim() : null,
      Boolean(isActive)
    ]
  );
  return res.rows[0];
}

async function updateVehicle(id, {
  locationId,
  defaultLocationId,
  registrationNo,
  seaterType,
  seater_type,
  carModel,
  brandOrModel,
  carMake,
  car_make,
  carColor,
  car_color,
  isActive
} = {}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  const effLocId = locationId !== undefined ? locationId : defaultLocationId;
  if (effLocId !== undefined) {
    if (!effLocId) throw new Error('locationId cannot be null.');
    params.push(effLocId);
    updates.push(`location_id = $${params.length}`);
  }
  if (registrationNo !== undefined) {
    const cleanReg = String(registrationNo || '').trim().toUpperCase().slice(0, 25);
    if (!cleanReg) throw new Error('registrationNo cannot be empty.');
    params.push(cleanReg);
    updates.push(`registration_no = $${params.length}`);
  }
  const effSeater = seaterType !== undefined ? seaterType : seater_type;
  if (effSeater !== undefined) {
    params.push(validateSeaterType(effSeater));
    updates.push(`seater_type = $${params.length}`);
  }
  const effModel = carModel !== undefined ? carModel : (brandOrModel !== undefined ? brandOrModel : (carMake !== undefined ? carMake : car_make));
  if (effModel !== undefined) {
    params.push(effModel ? String(effModel).trim() : null);
    updates.push(`car_model = $${params.length}`);
  }
  const effColor = carColor !== undefined ? carColor : car_color;
  if (effColor !== undefined) {
    params.push(effColor ? String(effColor).trim() : null);
    updates.push(`car_color = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.vehicles
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.vehicles
     SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  ALLOWED_SEATER_TYPES,
  validateSeaterType,
  findByCustomerId,
  findById,
  findByRegistration,
  findByCustomerAndReg,
  createVehicle,
  updateVehicle,
  softDelete
};
