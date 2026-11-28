/**
 * Repository for table: service_jobs (BRD v1.0 Non-DCC 6-Step + Cancel Lifecycle)
 * Statuses: scheduled -> assigned -> enrolled -> in_progress -> completed -> verified | cancelled
 * Categories: car_wash | solar | detailing
 */

'use strict';

const db = require('../index');

const NON_DCC_CATEGORIES = ['car_wash', 'solar', 'detailing'];
const JOB_STATUSES = ['scheduled', 'assigned', 'enrolled', 'in_progress', 'completed', 'verified', 'cancelled'];

function normalizeCategory(cat) {
  const c = String(cat || '').trim().toLowerCase();
  if (c === 'car_washing' || c === 'car_wash') return 'car_wash';
  if (c === 'solar_cleaning' || c === 'solar') return 'solar';
  if (c === 'interior_detailing' || c === 'exterior_detailing' || c === 'detailing') return 'detailing';
  throw new Error(`Invalid Non-DCC service_category '${cat}'. Allowed: car_wash, solar, detailing.`);
}

async function findAll({
  status = null,
  serviceCategory = null,
  staffId = null,
  customerId = null,
  dateFrom = null,
  dateTo = null,
  limit = 200,
  offset = 0,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`j.status = $${params.length}`);
  }
  if (serviceCategory && serviceCategory !== 'all') {
    params.push(normalizeCategory(serviceCategory));
    conditions.push(`j.service_category = $${params.length}`);
  }
  if (staffId && staffId !== 'all') {
    params.push(staffId);
    conditions.push(`j.assigned_staff_id = $${params.length}`);
  }
  if (customerId) {
    params.push(customerId);
    conditions.push(`j.customer_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`COALESCE(j.scheduled_date, (j.created_at AT TIME ZONE 'Asia/Kolkata')::date) >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`COALESCE(j.scheduled_date, (j.created_at AT TIME ZONE 'Asia/Kolkata')::date) <= $${params.length}::date`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.seater_type, v.car_model, v.car_color,
            si.panel_count, si.kw_load,
            loc.label AS location_label, loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details, loc.latitude, loc.longitude,
            s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code, s.phone AS assigned_staff_phone,
            svc.name AS service_name,
            b.payment_status, b.total_amount AS booking_total_amount
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     LEFT JOIN public.solar_installations si ON j.solar_id = si.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.staff s ON j.assigned_staff_id = s.id
     LEFT JOIN public.services svc ON j.service_id = svc.id
     LEFT JOIN public.bookings b ON j.booking_id = b.id
     ${whereClause}
     ORDER BY j.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.seater_type, v.car_model, v.car_color,
            si.panel_count, si.kw_load,
            loc.label AS location_label, loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details, loc.latitude, loc.longitude,
            s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code, s.phone AS assigned_staff_phone,
            svc.name AS service_name
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     LEFT JOIN public.solar_installations si ON j.solar_id = si.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.staff s ON j.assigned_staff_id = s.id
     LEFT JOIN public.services svc ON j.service_id = svc.id
     WHERE j.id = $1
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
    'SELECT * FROM public.service_jobs WHERE id = $1 FOR UPDATE',
    [id]
  );
  return res.rows[0] || null;
}

async function findByCustomerId(customerId, client = null) {
  return findAll({ customerId, client });
}

async function findByBookingId(bookingId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code, svc.name AS service_name
     FROM public.service_jobs j
     LEFT JOIN public.staff s ON j.assigned_staff_id = s.id
     LEFT JOIN public.services svc ON j.service_id = svc.id
     WHERE j.booking_id = $1
     ORDER BY j.created_at DESC`,
    [bookingId]
  );
  return res.rows;
}

async function findDispatchedForStaff(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT j.*,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.seater_type, v.car_model, v.car_color,
            si.panel_count, si.kw_load,
            loc.label AS location_label, loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details, loc.latitude, loc.longitude,
            svc.name AS service_name
     FROM public.service_jobs j
     JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
     LEFT JOIN public.solar_installations si ON j.solar_id = si.id
     JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.services svc ON j.service_id = svc.id
     WHERE j.assigned_staff_id = $1
       AND (
         j.status IN ('assigned', 'enrolled', 'in_progress', 'completed')
         OR (j.status IN ('verified', 'cancelled') AND (j.updated_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
       )
     ORDER BY
       CASE j.status
         WHEN 'in_progress' THEN 1
         WHEN 'enrolled' THEN 2
         WHEN 'assigned' THEN 3
         WHEN 'completed' THEN 4
         ELSE 5
       END ASC,
       j.scheduled_date ASC NULLS LAST,
       j.created_at ASC`,
    [staffId]
  );
  return res.rows;
}

async function createJob({
  bookingId = null,
  customerId,
  serviceCategory,
  serviceId = null,
  assetType = null,
  vehicleId = null,
  solarId = null,
  locationId,
  assignedStaffId = null,
  status = null,
  scheduledDate = null,
  notes = null
}, client = null) {
  const runner = client || db;
  const normCat = normalizeCategory(serviceCategory);
  const resolvedAssetType = assetType || (normCat === 'solar' ? 'solar' : 'vehicle');
  const resolvedStatus = status || (assignedStaffId ? 'assigned' : 'scheduled');

  if (!JOB_STATUSES.includes(resolvedStatus)) {
    throw new Error(`Invalid job status '${resolvedStatus}'.`);
  }

  let resolvedServiceId = serviceId;
  if (!resolvedServiceId) {
    const svcRes = await runner.query(
      'SELECT id FROM public.services WHERE category = $1 AND is_active = TRUE ORDER BY sort_order ASC LIMIT 1',
      [normCat]
    );
    resolvedServiceId = svcRes.rows[0]?.id || null;
  }

  const res = await runner.query(
    `INSERT INTO public.service_jobs (
       booking_id, customer_id, service_category, service_id, asset_type,
       vehicle_id, solar_id, location_id, assigned_staff_id, status, scheduled_date, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      bookingId || null,
      customerId,
      normCat,
      resolvedServiceId,
      resolvedAssetType,
      resolvedAssetType === 'vehicle' ? vehicleId : null,
      resolvedAssetType === 'solar' ? solarId : null,
      locationId,
      assignedStaffId || null,
      resolvedStatus,
      scheduledDate || null,
      notes ? String(notes).trim() : null
    ]
  );
  return res.rows[0];
}

async function assignStaff(id, staffId, { scheduledDate = null, notes = null } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET assigned_staff_id = $2,
         status = 'assigned',
         scheduled_date = COALESCE($3::date, scheduled_date),
         notes = COALESCE($4, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('scheduled', 'assigned')
     RETURNING *`,
    [id, staffId, scheduledDate || null, notes ? String(notes).trim() : null]
  );
  return res.rows[0] || null;
}

async function enrollJob(id, staffId = null, client = null) {
  const runner = client || db;
  const params = [id];
  let staffFilter = '';
  if (staffId) {
    params.push(staffId);
    staffFilter = ` AND assigned_staff_id = $${params.length}`;
  }
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'enrolled',
         enrolled_at = COALESCE(enrolled_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'assigned' ${staffFilter}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function startJob(id, opts = {}, client = null) {
  const runner = client || db;
  const beforePhotos = Array.isArray(opts) ? opts : (opts?.beforePhotos || []);
  const startedAt = Array.isArray(opts) ? null : (opts?.startedAt || null);
  const stAt = startedAt || new Date().toISOString();

  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'in_progress',
         started_at = $2,
         before_photos = $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'enrolled'
     RETURNING *`,
    [id, stAt, JSON.stringify(beforePhotos || [])]
  );
  return res.rows[0] || null;
}

async function appendProofPhotos(id, { beforePhotos = null, afterPhotos = null } = {}, client = null) {
  const runner = client || db;
  const cur = await findById(id, runner);
  if (!cur) return null;
  const nextBefore = Array.isArray(beforePhotos)
    ? [...(Array.isArray(cur.before_photos) ? cur.before_photos : []), ...beforePhotos]
    : (Array.isArray(cur.before_photos) ? cur.before_photos : []);
  const nextAfter = Array.isArray(afterPhotos)
    ? [...(Array.isArray(cur.after_photos) ? cur.after_photos : []), ...afterPhotos]
    : (Array.isArray(cur.after_photos) ? cur.after_photos : []);

  const res = await runner.query(
    `UPDATE public.service_jobs
     SET before_photos = $2::jsonb,
         after_photos = $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(nextBefore), JSON.stringify(nextAfter)]
  );
  return res.rows[0] || null;
}

async function completeJob(id, opts = {}, client = null) {
  const runner = client || db;
  const afterPhotos = Array.isArray(opts) ? opts : (opts?.afterPhotos || []);
  const checklistResults = Array.isArray(opts) ? null : (opts?.checklistResults || null);
  const notes = Array.isArray(opts) ? null : (opts?.notes || opts?.completionNotes || null);
  const completedAt = Array.isArray(opts) ? new Date() : new Date(opts?.completedAt || Date.now());
  const autoVerifyHours = Math.max(1, Number(opts?.autoVerifyHours || 24));
  const autoVerifyAt = new Date(completedAt.getTime() + autoVerifyHours * 3600 * 1000);

  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'completed',
         completed_at = $2,
         after_photos = $3::jsonb,
         checklist_results = COALESCE($4::jsonb, checklist_results),
         notes = COALESCE($5, notes),
         auto_verify_at = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'in_progress'
     RETURNING *`,
    [
      id,
      completedAt.toISOString(),
      JSON.stringify(afterPhotos || []),
      checklistResults ? JSON.stringify(checklistResults) : null,
      notes ? String(notes).trim() : null,
      autoVerifyAt.toISOString()
    ]
  );
  return res.rows[0] || null;
}

async function verifyJob(id, { verifiedBy = 'admin', notes = null } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'verified',
         verified_at = CURRENT_TIMESTAMP,
         verified_by = $2,
         notes = COALESCE($3, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'completed'
     RETURNING *`,
    [id, verifiedBy || 'admin', notes ? String(notes).trim() : null]
  );
  return res.rows[0] || null;
}

async function autoVerifyExpiredJobs(client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'verified',
         verified_at = CURRENT_TIMESTAMP,
         verified_by = 'auto_verify',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'completed'
       AND auto_verify_at IS NOT NULL
       AND auto_verify_at <= CURRENT_TIMESTAMP
     RETURNING *`
  );
  return res.rows;
}

async function cancelJob(id, { notes = null } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_jobs
     SET status = 'cancelled',
         notes = COALESCE($2, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status NOT IN ('verified', 'cancelled')
     RETURNING *`,
    [id, notes ? String(notes).trim() : null]
  );
  return res.rows[0] || null;
}

async function updateJob(id, updates = {}, client = null) {
  const runner = client || db;
  const fields = [];
  const params = [id];

  if (updates.locationId !== undefined) {
    params.push(updates.locationId);
    fields.push(`location_id = $${params.length}`);
  }
  if (updates.assignedStaffId !== undefined) {
    params.push(updates.assignedStaffId || null);
    fields.push(`assigned_staff_id = $${params.length}`);
  }
  if (updates.scheduledDate !== undefined) {
    params.push(updates.scheduledDate || null);
    fields.push(`scheduled_date = $${params.length}`);
  }
  if (updates.status !== undefined) {
    if (!JOB_STATUSES.includes(updates.status)) {
      throw new Error(`Invalid job status '${updates.status}'.`);
    }
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.notes !== undefined) {
    params.push(updates.notes ? String(updates.notes).trim() : null);
    fields.push(`notes = $${params.length}`);
  }

  if (fields.length === 0) return findById(id, runner);
  fields.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.service_jobs
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

module.exports = {
  NON_DCC_CATEGORIES,
  JOB_STATUSES,
  normalizeCategory,
  findAll,
  findById,
  findByIdForUpdate,
  findByCustomerId,
  findByBookingId,
  findDispatchedForStaff,
  createJob,
  assignStaff,
  enrollJob,
  startJob,
  appendProofPhotos,
  completeJob,
  verifyJob,
  autoVerifyExpiredJobs,
  cancelJob,
  updateJob
};
