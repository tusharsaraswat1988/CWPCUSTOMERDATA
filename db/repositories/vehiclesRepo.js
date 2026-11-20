/**
 * Repository for table: vehicles
 */
const db = require('../index');

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  let sql = 'SELECT * FROM public.vehicles WHERE customer_id = $1';
  if (!includeDeleted) {
    sql += ' AND deleted_at IS NULL';
  }
  sql += ' ORDER BY created_at ASC';
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.vehicles WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findByRegistration(registrationNo, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.vehicles WHERE UPPER(registration_no) = UPPER($1) AND deleted_at IS NULL',
    [registrationNo.trim()]
  );
  return res.rows;
}

async function createVehicle({
  customerId,
  defaultLocationId = null,
  registrationNo,
  brandOrModel = null,
  vehicleType = 'Car',
  photoUrl = null,
  photoStorageKey = null,
  isActive = true
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.vehicles (
       customer_id, default_location_id, registration_no, brand_or_model,
       vehicle_type, photo_url, photo_storage_key, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      customerId,
      defaultLocationId,
      registrationNo.trim().toUpperCase(),
      brandOrModel ? brandOrModel.trim() : null,
      vehicleType || 'Car',
      photoUrl,
      photoStorageKey,
      Boolean(isActive)
    ]
  );
  return res.rows[0];
}

async function updateVehicle(id, {
  defaultLocationId,
  registrationNo,
  brandOrModel,
  vehicleType,
  photoUrl,
  photoStorageKey,
  isActive
}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (defaultLocationId !== undefined) {
    params.push(defaultLocationId);
    updates.push(`default_location_id = $${params.length}`);
  }
  if (registrationNo !== undefined) {
    params.push(registrationNo.trim().toUpperCase());
    updates.push(`registration_no = $${params.length}`);
  }
  if (brandOrModel !== undefined) {
    params.push(brandOrModel ? brandOrModel.trim() : null);
    updates.push(`brand_or_model = $${params.length}`);
  }
  if (vehicleType !== undefined) {
    params.push(vehicleType || 'Car');
    updates.push(`vehicle_type = $${params.length}`);
  }
  if (photoUrl !== undefined) {
    params.push(photoUrl);
    updates.push(`photo_url = $${params.length}`);
  }
  if (photoStorageKey !== undefined) {
    params.push(photoStorageKey);
    updates.push(`photo_storage_key = $${params.length}`);
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
  findByCustomerId,
  findById,
  findByRegistration,
  createVehicle,
  updateVehicle,
  softDelete
};
