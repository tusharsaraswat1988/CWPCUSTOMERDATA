/**
 * Repository for table: service_locations (BRD v1.0)
 */

'use strict';

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
  label = null,
  locationName = null,
  addressType = null,
  addressText,
  addressTextHi = null,
  googleMapsUrl = null,
  latitude = null,
  longitude = null,
  parkingDetails = null,
  isPrimary = false,
  isActive = true
}, client = null) {
  const execute = async (runner) => {
    const cleanAddr = String(addressText || '').trim();
    if (!cleanAddr) {
      throw new Error('addressText is required for service_locations.');
    }
    const resolvedLabel = (label || locationName || (addressType ? (addressType.charAt(0).toUpperCase() + addressType.slice(1)) : 'Home')).trim();

    let shouldBePrimary = Boolean(isPrimary);
    if (!shouldBePrimary) {
      const existing = await runner.query(
        'SELECT 1 FROM public.service_locations WHERE customer_id = $1 AND is_primary = TRUE AND deleted_at IS NULL LIMIT 1',
        [customerId]
      );
      if (existing.rows.length === 0) {
        shouldBePrimary = true;
      }
    } else {
      await runner.query(
        'UPDATE public.service_locations SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND is_primary = TRUE AND deleted_at IS NULL',
        [customerId]
      );
    }

    const res = await runner.query(
      `INSERT INTO public.service_locations (
         customer_id, label, address_text, address_text_hi,
         latitude, longitude, google_maps_url, parking_details,
         is_primary, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        customerId,
        resolvedLabel,
        cleanAddr,
        addressTextHi ? String(addressTextHi).trim() : null,
        latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : null,
        longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : null,
        googleMapsUrl ? String(googleMapsUrl).trim() : null,
        parkingDetails ? String(parkingDetails).trim() : null,
        shouldBePrimary,
        Boolean(isActive)
      ]
    );
    return res.rows[0];
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function updateLocation(id, {
  label,
  locationName,
  addressText,
  addressTextHi,
  googleMapsUrl,
  latitude,
  longitude,
  parkingDetails,
  isPrimary,
  isActive
} = {}, client = null) {
  const execute = async (runner) => {
    if (isPrimary === true) {
      const cur = await findById(id, runner);
      if (!cur) return null;
      await runner.query(
        'UPDATE public.service_locations SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND id <> $2 AND is_primary = TRUE AND deleted_at IS NULL',
        [cur.customer_id, id]
      );
    }

    const updates = [];
    const params = [id];

    const effLabel = label !== undefined ? label : locationName;
    if (effLabel !== undefined) {
      params.push(effLabel ? String(effLabel).trim() : 'Home');
      updates.push(`label = $${params.length}`);
    }
    if (addressText !== undefined) {
      const cleanAddr = String(addressText || '').trim();
      if (!cleanAddr) throw new Error('addressText cannot be empty.');
      params.push(cleanAddr);
      updates.push(`address_text = $${params.length}`);
    }
    if (addressTextHi !== undefined) {
      params.push(addressTextHi ? String(addressTextHi).trim() : null);
      updates.push(`address_text_hi = $${params.length}`);
    }
    if (googleMapsUrl !== undefined) {
      params.push(googleMapsUrl ? String(googleMapsUrl).trim() : null);
      updates.push(`google_maps_url = $${params.length}`);
    }
    if (latitude !== undefined) {
      params.push(latitude !== null && latitude !== '' ? Number(latitude) : null);
      updates.push(`latitude = $${params.length}`);
    }
    if (longitude !== undefined) {
      params.push(longitude !== null && longitude !== '' ? Number(longitude) : null);
      updates.push(`longitude = $${params.length}`);
    }
    if (parkingDetails !== undefined) {
      params.push(parkingDetails ? String(parkingDetails).trim() : null);
      updates.push(`parking_details = $${params.length}`);
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
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function setPrimary(customerId, locationId, client = null) {
  const execute = async (runner) => {
    await runner.query(
      'UPDATE public.service_locations SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1 AND is_primary = TRUE AND deleted_at IS NULL',
      [customerId]
    );
    const res = await runner.query(
      'UPDATE public.service_locations SET is_primary = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL RETURNING *',
      [locationId, customerId]
    );
    return res.rows[0] || null;
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_locations
     SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE, is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
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
