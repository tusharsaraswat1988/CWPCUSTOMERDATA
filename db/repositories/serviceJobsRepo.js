/**
 * Repository for table: service_jobs
 */
const db = require('../index');

async function findAll({
  status = null,
  serviceCategoryId = null,
  customerId = null,
  includeDeleted = false,
  limit = 200,
  offset = 0,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (!includeDeleted) {
    conditions.push('j.deleted_at IS NULL');
  }

  if (status) {
    params.push(status);
    conditions.push(`j.status = $${params.length}`);
  }

  if (serviceCategoryId) {
    params.push(serviceCategoryId);
    conditions.push(`j.service_category_id = $${params.length}`);
  }

  if (customerId) {
    params.push(customerId);
    conditions.push(`j.customer_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT j.*,
           c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
           v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
           loc.address_text, loc.google_maps_url, loc.parking_details,
           sa.staff_id, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code
    FROM public.service_jobs j
    JOIN public.customers c ON j.customer_id = c.id
    LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
    JOIN public.service_locations loc ON j.location_id = loc.id
    LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
    LEFT JOIN public.staff s ON sa.staff_id = s.id
    ${whereClause}
    ORDER BY j.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await runner.query(sql, params);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details,
            sa.staff_id, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     LEFT JOIN public.staff s ON sa.staff_id = s.id
     WHERE j.id = $1 AND j.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findDispatchedForStaff(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     WHERE sa.staff_id = $1 AND j.deleted_at IS NULL AND j.status != 'cancelled'
     ORDER BY j.scheduled_date ASC NULLS LAST, j.created_at ASC`,
    [staffId]
  );
  return res.rows;
}

async function createJob({
  customerId,
  vehicleId = null,
  locationId,
  serviceCategoryId,
  serviceType,
  packageDetails = null,
  siteDetails = null,
  scheduledDate = null,
  status = 'assigned',
  specialInstructions = null,
  photoUrl = null,
  photoStorageKey = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_jobs (
       customer_id, vehicle_id, location_id, service_category_id,
       service_type, package_details, site_details, scheduled_date,
       status, special_instructions, photo_url, photo_storage_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      customerId,
      vehicleId,
      locationId,
      serviceCategoryId,
      serviceType,
      packageDetails ? packageDetails.trim() : null,
      siteDetails ? (typeof siteDetails === 'string' ? siteDetails : JSON.stringify(siteDetails)) : null,
      scheduledDate,
      status || 'assigned',
      specialInstructions ? specialInstructions.trim() : null,
      photoUrl,
      photoStorageKey
    ]
  );
  return res.rows[0];
}

async function updateJobStatus(id, status, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, status]
  );
  return res.rows[0] || null;
}

async function softDelete(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET deleted_at = CURRENT_TIMESTAMP, status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findDispatchedForStaff,
  createJob,
  updateJobStatus,
  softDelete
};
