/**
 * Repository for table: solar_installations (BRD v1.0)
 */

'use strict';

const db = require('../index');

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  let sql = `
    SELECT si.*,
           loc.label AS location_label,
           loc.address_text,
           loc.address_text_hi,
           loc.google_maps_url,
           loc.latitude,
           loc.longitude
    FROM public.solar_installations si
    JOIN public.service_locations loc ON si.location_id = loc.id
    WHERE si.customer_id = $1
  `;
  if (!includeDeleted) {
    sql += ' AND si.deleted_at IS NULL';
  }
  sql += ' ORDER BY si.created_at ASC';
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT si.*,
            loc.label AS location_label,
            loc.address_text,
            loc.address_text_hi,
            loc.google_maps_url,
            loc.latitude,
            loc.longitude
     FROM public.solar_installations si
     JOIN public.service_locations loc ON si.location_id = loc.id
     WHERE si.id = $1 AND si.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function createSolarInstallation({
  customerId,
  locationId,
  panelCount,
  kwLoad = null,
  notes = null,
  isActive = true
}, client = null) {
  const runner = client || db;
  if (!customerId || !locationId) {
    throw new Error('customerId and locationId are mandatory for solar_installations.');
  }
  const panels = parseInt(panelCount, 10);
  if (!Number.isInteger(panels) || panels <= 0) {
    throw new Error('panelCount must be a positive integer (> 0).');
  }
  const kw = kwLoad !== undefined && kwLoad !== null && kwLoad !== '' ? Number(kwLoad) : null;
  if (kw !== null && (!Number.isFinite(kw) || kw <= 0)) {
    throw new Error('kwLoad must be greater than 0 when provided.');
  }

  const res = await runner.query(
    `INSERT INTO public.solar_installations (
       customer_id, location_id, panel_count, kw_load, notes, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      customerId,
      locationId,
      panels,
      kw,
      notes ? String(notes).trim() : null,
      Boolean(isActive)
    ]
  );
  return res.rows[0];
}

async function updateSolarInstallation(id, {
  locationId,
  panelCount,
  kwLoad,
  notes,
  isActive
} = {}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (locationId !== undefined) {
    if (!locationId) throw new Error('locationId cannot be null.');
    params.push(locationId);
    updates.push(`location_id = $${params.length}`);
  }
  if (panelCount !== undefined) {
    const panels = parseInt(panelCount, 10);
    if (!Number.isInteger(panels) || panels <= 0) {
      throw new Error('panelCount must be a positive integer (> 0).');
    }
    params.push(panels);
    updates.push(`panel_count = $${params.length}`);
  }
  if (kwLoad !== undefined) {
    const kw = kwLoad !== null && kwLoad !== '' ? Number(kwLoad) : null;
    if (kw !== null && (!Number.isFinite(kw) || kw <= 0)) {
      throw new Error('kwLoad must be greater than 0 when provided.');
    }
    params.push(kw);
    updates.push(`kw_load = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes ? String(notes).trim() : null);
    updates.push(`notes = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.solar_installations
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
    `UPDATE public.solar_installations
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
  createSolarInstallation,
  updateSolarInstallation,
  softDelete
};
