/**
 * Repository for table: service_jobs
 * On-Demand / Special Jobs (Solar Panel Cleaning, Car Washing, Detailing)
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
           c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
           v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
           loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details,
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
            v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details,
            sa.staff_id, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     LEFT JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     LEFT JOIN public.staff s ON sa.staff_id = s.id
     WHERE j.id = $1 AND j.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByIdForUpdate(id, client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('client with active transaction is required for findByIdForUpdate');
  }
  const res = await client.query(
    `SELECT * FROM public.service_jobs
     WHERE id = $1 AND deleted_at IS NULL
     FOR UPDATE`,
    [id]
  );
  return res.rows[0] || null;
}

async function findDispatchedForStaff(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     WHERE sa.staff_id = $1 AND j.deleted_at IS NULL AND (j.status != 'cancelled' OR (j.status = 'cancelled' AND (j.cancelled_at::date = CURRENT_DATE OR j.updated_at::date = CURRENT_DATE)))
     ORDER BY 
       CASE j.status 
         WHEN 'in_progress' THEN 1 
         WHEN 'assigned' THEN 2 
         WHEN 'completed' THEN 3 
         WHEN 'cancelled' THEN 4
         ELSE 5 
       END ASC,
       j.scheduled_date ASC NULLS LAST,
       j.sequence_order ASC NULLS LAST,
       j.scheduled_time ASC NULLS LAST,
       j.created_at ASC`,
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
  packageCode = null,
  seaterType = null,
  panelCount = null,
  siteDetails = null,
  scheduledDate = null,
  scheduledTime = null,
  sequenceOrder = null,
  status = 'assigned',
  specialInstructions = null,
  photoUrl = null,
  photoStorageKey = null,
  beforePhotos = [],
  afterPhotos = []
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_jobs (
       customer_id, vehicle_id, location_id, service_category_id,
       service_type, package_details, package_code, seater_type, panel_count,
       site_details, scheduled_date, scheduled_time, sequence_order,
       status, special_instructions, photo_url, photo_storage_key,
       before_photos, after_photos
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      customerId,
      vehicleId,
      locationId,
      serviceCategoryId,
      serviceType,
      packageDetails ? packageDetails.trim() : null,
      packageCode ? packageCode.trim() : null,
      seaterType || null,
      panelCount != null && !isNaN(parseInt(panelCount, 10)) ? parseInt(panelCount, 10) : null,
      siteDetails ? (typeof siteDetails === 'string' ? siteDetails : JSON.stringify(siteDetails)) : null,
      scheduledDate,
      scheduledTime ? scheduledTime.trim() : null,
      sequenceOrder != null && !isNaN(parseInt(sequenceOrder, 10)) ? parseInt(sequenceOrder, 10) : null,
      status || 'assigned',
      specialInstructions ? specialInstructions.trim() : null,
      photoUrl,
      photoStorageKey,
      JSON.stringify(beforePhotos || []),
      JSON.stringify(afterPhotos || [])
    ]
  );
  return res.rows[0];
}

async function startJob(id, opts = {}, client = null) {
  const runner = client || db;
  const beforePhotos = Array.isArray(opts) ? opts : (opts && opts.beforePhotos ? opts.beforePhotos : []);
  const startedAt = Array.isArray(opts) ? null : (opts && opts.startedAt);
  const stAt = startedAt || new Date().toISOString();
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'in_progress',
         started_at = $2,
         before_photos = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL AND status IN ('requested', 'booked', 'assigned')
     RETURNING *`,
    [id, stAt, JSON.stringify(beforePhotos || [])]
  );
  return res.rows[0] || null;
}

async function completeJob(id, opts = {}, clientOrNotes = null, maybeClient = null) {
  const isLegacySig = Array.isArray(opts);
  const afterPhotos = isLegacySig ? opts : (opts && opts.afterPhotos ? opts.afterPhotos : []);
  const completedAt = isLegacySig ? null : (opts && opts.completedAt);
  const completionNotes = isLegacySig 
    ? (typeof clientOrNotes === 'string' ? clientOrNotes : null)
    : (opts && opts.completionNotes ? opts.completionNotes : null);
  const runner = (isLegacySig ? maybeClient : clientOrNotes) || db;

  const compAt = completedAt || new Date().toISOString();
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'completed',
         completed_at = $2,
         after_photos = $3,
         completion_notes = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL AND status = 'in_progress'
     RETURNING *`,
    [id, compAt, JSON.stringify(afterPhotos || []), completionNotes ? completionNotes.trim() : null]
  );
  return res.rows[0] || null;
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

async function cancelJob(id, {
  cancellationReason,
  cancellationRemarks = null,
  cancelledAt = null,
  cancelledBy = null
} = {}, client = null) {
  const runner = client || db;
  const cAt = cancelledAt || new Date().toISOString();
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'cancelled',
         cancellation_reason = $2,
         cancellation_remarks = $3,
         cancelled_at = $4,
         cancelled_by = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL AND status IN ('requested', 'booked', 'assigned')
     RETURNING *`,
    [
      id,
      cancellationReason ? String(cancellationReason).trim() : 'booking cancelled due to other reason',
      cancellationRemarks ? String(cancellationRemarks).trim() : null,
      cAt,
      cancelledBy || null
    ]
  );
  return res.rows[0] || null;
}

async function softDelete(id, client = null) {
  const actualClient = (client && typeof client.query === 'function') ? client : null;
  const runner = actualClient || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET deleted_at = CURRENT_TIMESTAMP, status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL AND status IN ('requested', 'booked', 'assigned')
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  const conditions = ['j.customer_id = $1'];
  if (!includeDeleted) {
    conditions.push('j.deleted_at IS NULL');
  }
  const sql = `
    SELECT j.*,
           c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
           v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
           loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details,
           sa.staff_id, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code
    FROM public.service_jobs j
    JOIN public.customers c ON j.customer_id = c.id
    LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
    JOIN public.service_locations loc ON j.location_id = loc.id
    LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
    LEFT JOIN public.staff s ON sa.staff_id = s.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY j.created_at DESC
  `;
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function updateJob(id, updates = {}, client = null) {
  const runner = client || db;
  const setClauses = [];
  const params = [id];

  const fieldMap = {
    vehicleId: 'vehicle_id',
    locationId: 'location_id',
    serviceCategoryId: 'service_category_id',
    serviceType: 'service_type',
    packageDetails: 'package_details',
    packageCode: 'package_code',
    seaterType: 'seater_type',
    panelCount: 'panel_count',
    siteDetails: 'site_details',
    scheduledDate: 'scheduled_date',
    scheduledTime: 'scheduled_time',
    sequenceOrder: 'sequence_order',
    status: 'status',
    specialInstructions: 'special_instructions',
    photoUrl: 'photo_url',
    photoStorageKey: 'photo_storage_key',
    completionNotes: 'completion_notes'
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      let val = updates[key];
      if (key === 'siteDetails' && val && typeof val === 'object') {
        val = JSON.stringify(val);
      } else if (key === 'panelCount' && val != null) {
        val = isNaN(parseInt(val, 10)) ? null : parseInt(val, 10);
      }
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findById(id, client);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  const sql = `
    UPDATE public.service_jobs
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *
  `;
  const res = await runner.query(sql, params);
  return res.rows[0] || null;
}


async function failJob(id, {
  failureReason,
  failureRemarks = null,
  failedAt = null,
  failedBy = null
} = {}, client = null) {
  const runner = client || db;
  const fAt = failedAt || new Date().toISOString();
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'unable_to_complete',
         failure_reason = $2,
         failure_remarks = $3,
         failed_at = $4,
         failed_by = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL AND status IN ('assigned', 'in_progress')
     RETURNING *`,
    [
      id,
      failureReason ? String(failureReason).trim() : 'Unable to complete service',
      failureRemarks ? String(failureRemarks).trim() : null,
      fAt,
      failedBy || null
    ]
  );
  return res.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findByIdForUpdate,
  findByCustomerId,
  findDispatchedForStaff,
  createJob,
  updateJob,
  startJob,
  completeJob,
  cancelJob,
  failJob,
  updateJobStatus,
  softDelete
};
