/**
 * Repository for table: service_locations
 */
const db = require('../index');

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  let sql = 'SELECT * FROM public.service_locations WHERE customer_id = $1';
  if (!includeDeleted) {
    sql += ' AND deleted_at IS NULL';
  }
  sql += ' ORDER BY is_primary DESC, created_at ASC';
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.service_locations WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findPrimaryByCustomerId(customerId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.service_locations WHERE customer_id = $1 AND is_primary = TRUE AND deleted_at IS NULL LIMIT 1',
    [customerId]
  );
  return res.rows[0] || null;
}

async function createLocation({
  customerId,
  addressType = 'primary',
  addressText,
  googleMapsUrl = null,
  latitude = null,
  longitude = null,
  parkingDetails = null,
  photoUrl = null,
  photoStorageKey = null,
  isPrimary = true,
  isActive = true
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_locations (
       customer_id, address_type, address_text, google_maps_url,
       latitude, longitude, parking_details, photo_url, photo_storage_key,
       is_primary, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      customerId,
      addressType,
      addressText.trim(),
      googleMapsUrl ? googleMapsUrl.trim() : null,
      latitude,
      longitude,
      parkingDetails ? parkingDetails.trim() : null,
      photoUrl,
      photoStorageKey,
      Boolean(isPrimary),
      Boolean(isActive)
    ]
  );
  return res.rows[0];
}

async function updateLocation(id, {
  addressType,
  addressText,
  googleMapsUrl,
  latitude,
  longitude,
  parkingDetails,
  photoUrl,
  photoStorageKey,
  isPrimary,
  isActive
}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (addressType !== undefined) {
    params.push(addressType);
    updates.push(`address_type = $${params.length}`);
  }
  if (addressText !== undefined) {
    params.push(addressText.trim());
    updates.push(`address_text = $${params.length}`);
  }
  if (googleMapsUrl !== undefined) {
    params.push(googleMapsUrl ? googleMapsUrl.trim() : null);
    updates.push(`google_maps_url = $${params.length}`);
  }
  if (latitude !== undefined) {
    params.push(latitude);
    updates.push(`latitude = $${params.length}`);
  }
  if (longitude !== undefined) {
    params.push(longitude);
    updates.push(`longitude = $${params.length}`);
  }
  if (parkingDetails !== undefined) {
    params.push(parkingDetails ? parkingDetails.trim() : null);
    updates.push(`parking_details = $${params.length}`);
  }
  if (photoUrl !== undefined) {
    params.push(photoUrl);
    updates.push(`photo_url = $${params.length}`);
  }
  if (photoStorageKey !== undefined) {
    params.push(photoStorageKey);
    updates.push(`photo_storage_key = $${params.length}`);
  }
  if (isPrimary !== undefined) {
    params.push(Boolean(isPrimary));
    updates.push(`is_primary = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.service_locations
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function setPrimary(customerId, locationId, client = null) {
  const runner = client || db;
  await runner.query(
    'UPDATE public.service_locations SET is_primary = FALSE WHERE customer_id = $1 AND deleted_at IS NULL',
    [customerId]
  );
  const res = await runner.query(
    'UPDATE public.service_locations SET is_primary = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND customer_id = $2 RETURNING *',
    [locationId, customerId]
  );
  return res.rows[0] || null;
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_locations
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
  findPrimaryByCustomerId,
  createLocation,
  updateLocation,
  setPrimary,
  softDelete
};
