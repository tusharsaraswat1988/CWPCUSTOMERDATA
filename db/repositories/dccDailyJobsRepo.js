/**
 * Repository for table: dcc_daily_jobs (BRD v1.0)
 * Replaces legacy DCC service_logs checkoff & daily report queries.
 * Statuses: auto_generated | completed | car_not_available | missed
 * Frequencies: daily | alternate
 */

'use strict';

const db = require('../index');

function computeIstServiceDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function getTodayIstDate() {
  return computeIstServiceDate(new Date());
}

function toIstDateString(val) {
  if (!val) return null;
  if (val instanceof Date) return computeIstServiceDate(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return computeIstServiceDate(new Date(s));
}

function isAlternateDayDue(startDateVal, targetDateStr) {
  const startStr = toIstDateString(startDateVal) || targetDateStr;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((targetUtc - startUtc) / 86400000);
  return diffDays >= 0 && diffDays % 2 === 0;
}

async function generateForDate(istDate = null, { staffId = null, vehicleId = null } = {}, client = null) {
  const runner = client || db;
  const targetDate = istDate || getTodayIstDate();

  const conditions = [
    'r.is_active = TRUE',
    'rs.is_active = TRUE',
    'v.deleted_at IS NULL',
    'v.is_active = TRUE',
    'c.deleted_at IS NULL',
    'COALESCE(rta.cover_staff_id, r.staff_id) IS NOT NULL',
    `(b.id IS NULL OR (b.status = 'active' AND b.start_date <= $1::date AND (b.end_date IS NULL OR b.end_date >= $1::date)))`
  ];
  const params = [targetDate];

  if (staffId) {
    params.push(staffId);
    conditions.push(`COALESCE(rta.cover_staff_id, r.staff_id) = $${params.length}`);
  }
  if (vehicleId) {
    params.push(vehicleId);
    conditions.push(`v.id = $${params.length}`);
  }

  const candidatesRes = await runner.query(
    `SELECT rs.id AS route_stop_id,
            rs.route_id,
            rs.vehicle_id,
            rs.booking_id,
            v.customer_id,
            v.location_id,
            COALESCE(rta.cover_staff_id, r.staff_id) AS effective_staff_id,
            COALESCE(b.frequency, 'daily') AS frequency,
            b.start_date::text AS booking_start_date
     FROM public.route_stops rs
     JOIN public.routes r ON rs.route_id = r.id
     JOIN public.vehicles v ON rs.vehicle_id = v.id
     JOIN public.customers c ON v.customer_id = c.id
     LEFT JOIN public.bookings b ON rs.booking_id = b.id
     LEFT JOIN public.route_temp_assignments rta
       ON rta.route_id = r.id
      AND rta.is_active = TRUE
      AND rta.start_date <= $1::date
      AND rta.end_date >= $1::date
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.id, rs.sequence_order ASC`,
    params
  );

  const inserted = [];
  for (const row of candidatesRes.rows) {
    const freq = row.frequency === 'alternate' ? 'alternate' : 'daily';
    if (freq === 'alternate' && !isAlternateDayDue(row.booking_start_date || targetDate, targetDate)) {
      continue;
    }

    const insRes = await runner.query(
      `INSERT INTO public.dcc_daily_jobs (
         job_date, booking_id, route_id, route_stop_id, vehicle_id, customer_id, location_id,
         assigned_staff_id, frequency, status
       ) VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, 'auto_generated')
       ON CONFLICT (job_date, vehicle_id) DO NOTHING
       RETURNING *`,
      [
        targetDate,
        row.booking_id || null,
        row.route_id,
        row.route_stop_id,
        row.vehicle_id,
        row.customer_id,
        row.location_id,
        row.effective_staff_id,
        freq
      ]
    );
    if (insRes.rows[0]) inserted.push(insRes.rows[0]);
  }
  return inserted;
}

async function findByStaffAndDate(staffId, istDate = null, client = null) {
  const runner = client || db;
  const targetDate = istDate || getTodayIstDate();
  const res = await runner.query(
    `SELECT dj.*,
            v.registration_no, v.seater_type, v.car_model, v.car_color,
            c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
            loc.label AS location_label, loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details, loc.latitude, loc.longitude,
            rs.sequence_order,
            r.name AS route_name,
            p.name AS package_name
     FROM public.dcc_daily_jobs dj
     JOIN public.vehicles v ON dj.vehicle_id = v.id
     JOIN public.customers c ON dj.customer_id = c.id
     JOIN public.service_locations loc ON dj.location_id = loc.id
     LEFT JOIN public.route_stops rs ON dj.route_stop_id = rs.id
     LEFT JOIN public.routes r ON dj.route_id = r.id
     LEFT JOIN public.bookings b ON dj.booking_id = b.id
     LEFT JOIN public.packages p ON b.package_id = p.id
     WHERE dj.job_date = $1::date
       AND (dj.assigned_staff_id = $2 OR dj.actual_staff_id = $2)
     ORDER BY rs.sequence_order ASC NULLS LAST, dj.created_at ASC`,
    [targetDate, staffId]
  );
  return res.rows;
}

async function findByDateAndVehicle(istDate, vehicleId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.dcc_daily_jobs WHERE job_date = $1::date AND vehicle_id = $2 LIMIT 1',
    [istDate, vehicleId]
  );
  return res.rows[0] || null;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT dj.*,
            v.registration_no, v.seater_type, v.car_model, v.car_color,
            c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
            loc.label AS location_label, loc.address_text, loc.google_maps_url, loc.parking_details,
            s.name AS staff_name, s.staff_code,
            act.name AS actual_staff_name, act.staff_code AS actual_staff_code,
            r.name AS route_name,
            p.name AS package_name
     FROM public.dcc_daily_jobs dj
     JOIN public.vehicles v ON dj.vehicle_id = v.id
     JOIN public.customers c ON dj.customer_id = c.id
     JOIN public.service_locations loc ON dj.location_id = loc.id
     JOIN public.staff s ON dj.assigned_staff_id = s.id
     LEFT JOIN public.staff act ON dj.actual_staff_id = act.id
     LEFT JOIN public.routes r ON dj.route_id = r.id
     LEFT JOIN public.bookings b ON dj.booking_id = b.id
     LEFT JOIN public.packages p ON b.package_id = p.id
     WHERE dj.id = $1
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByClientMutationId(clientMutationId, client = null) {
  if (!clientMutationId) return null;
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.dcc_daily_jobs WHERE client_mutation_id = $1 LIMIT 1',
    [clientMutationId]
  );
  return res.rows[0] || null;
}

async function queryDailyJobs({
  startDate = null,
  endDate = null,
  staffId = null,
  routeId = null,
  status = null,
  hasPhoto = null,
  search = null,
  limit = 200,
  offset = 0
} = {}, client = null) {
  const runner = client || db;
  const todayIst = getTodayIstDate();
  const effectiveStart = startDate || todayIst;
  const effectiveEnd = endDate || effectiveStart;

  const conditions = [];
  const params = [];

  params.push(effectiveStart);
  conditions.push(`dj.job_date >= $${params.length}::date`);
  params.push(effectiveEnd);
  conditions.push(`dj.job_date <= $${params.length}::date`);

  if (staffId && staffId !== 'all') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffId)) {
      params.push(staffId);
      conditions.push(`(dj.assigned_staff_id = $${params.length} OR dj.actual_staff_id = $${params.length})`);
    } else {
      params.push(String(staffId).toUpperCase());
      conditions.push(`(s.staff_code = $${params.length} OR act.staff_code = $${params.length})`);
    }
  }
  if (routeId && routeId !== 'all') {
    params.push(routeId);
    conditions.push(`dj.route_id = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`dj.status = $${params.length}`);
  }
  if (hasPhoto === 'yes' || hasPhoto === true || hasPhoto === 'true') {
    conditions.push(`(dj.photo_url IS NOT NULL AND TRIM(dj.photo_url) <> '')`);
  } else if (hasPhoto === 'no' || hasPhoto === false || hasPhoto === 'false') {
    conditions.push(`(dj.photo_url IS NULL OR TRIM(dj.photo_url) = '')`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(c.name) LIKE $${idx} OR
      COALESCE(c.phone, '') LIKE $${idx} OR
      LOWER(v.registration_no) LIKE $${idx} OR
      LOWER(COALESCE(v.car_model, '')) LIKE $${idx}
    )`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const recordsSql = `
    SELECT dj.*,
           s.staff_code, s.name AS staff_name, s.phone AS staff_phone,
           act.staff_code AS actual_staff_code, act.name AS actual_staff_name,
           c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
           v.registration_no, v.seater_type, v.car_model, v.car_color,
           loc.label AS location_label, loc.address_text, loc.parking_details, loc.google_maps_url,
           r.name AS route_name,
           rs.sequence_order,
           p.name AS package_name
    FROM public.dcc_daily_jobs dj
    JOIN public.staff s ON dj.assigned_staff_id = s.id
    LEFT JOIN public.staff act ON dj.actual_staff_id = act.id
    JOIN public.customers c ON dj.customer_id = c.id
    JOIN public.vehicles v ON dj.vehicle_id = v.id
    JOIN public.service_locations loc ON dj.location_id = loc.id
    LEFT JOIN public.routes r ON dj.route_id = r.id
    LEFT JOIN public.route_stops rs ON dj.route_stop_id = rs.id
    LEFT JOIN public.bookings b ON dj.booking_id = b.id
    LEFT JOIN public.packages p ON b.package_id = p.id
    ${whereClause}
    ORDER BY dj.job_date DESC, rs.sequence_order ASC NULLS LAST, dj.completed_at DESC NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const recordsRes = await runner.query(recordsSql, [...params, limit, offset]);

  const countSql = `
    SELECT
      COUNT(*)::int AS total_jobs,
      COUNT(CASE WHEN dj.status = 'completed' THEN 1 END)::int AS completed_count,
      COUNT(CASE WHEN dj.status = 'car_not_available' THEN 1 END)::int AS car_not_available_count,
      COUNT(CASE WHEN dj.status = 'auto_generated' THEN 1 END)::int AS pending_count,
      COUNT(CASE WHEN dj.status = 'missed' THEN 1 END)::int AS missed_count,
      COUNT(CASE WHEN dj.photo_url IS NOT NULL AND TRIM(dj.photo_url) <> '' THEN 1 END)::int AS with_photo_count,
      COUNT(DISTINCT COALESCE(dj.actual_staff_id, dj.assigned_staff_id))::int AS active_staff_count,
      MAX(dj.completed_at) AS latest_punch_time
    FROM public.dcc_daily_jobs dj
    JOIN public.staff s ON dj.assigned_staff_id = s.id
    LEFT JOIN public.staff act ON dj.actual_staff_id = act.id
    JOIN public.customers c ON dj.customer_id = c.id
    JOIN public.vehicles v ON dj.vehicle_id = v.id
    ${whereClause}
  `;

  const countRes = await runner.query(countSql, params);
  const summary = countRes.rows[0] || {};

  return {
    records: recordsRes.rows,
    summary: {
      totalJobs: summary.total_jobs || 0,
      completedCount: summary.completed_count || 0,
      carNotAvailableCount: summary.car_not_available_count || 0,
      pendingCount: summary.pending_count || 0,
      missedCount: summary.missed_count || 0,
      withPhotoCount: summary.with_photo_count || 0,
      activeStaffCount: summary.active_staff_count || 0,
      latestPunchTime: summary.latest_punch_time || null
    },
    filterApplied: {
      startDate: effectiveStart,
      endDate: effectiveEnd,
      staffId: staffId || 'all',
      routeId: routeId || 'all',
      status: status || 'all',
      hasPhoto: hasPhoto || 'all',
      search: search || ''
    }
  };
}

async function punchDccJob({
  jobDate = null,
  bookingId = null,
  routeId = null,
  routeStopId = null,
  vehicleId,
  customerId,
  locationId,
  assignedStaffId,
  actualStaffId = null,
  frequency = 'daily',
  status = 'completed',
  photoUrl = null,
  gpsLat = null,
  gpsLng = null,
  gpsAccuracy = null,
  gpsDistanceMeters = null,
  gpsVerified = null,
  clientMutationId = null,
  notes = null,
  completedAt = null
}, client = null) {
  const runner = client || db;
  if (clientMutationId) {
    const existingMut = await findByClientMutationId(clientMutationId, runner);
    if (existingMut) {
      return { inserted: false, idempotent: true, job: existingMut };
    }
  }

  const effCompletedAt = completedAt ? new Date(completedAt) : new Date();
  const effJobDate = jobDate || computeIstServiceDate(effCompletedAt);
  const effActualStaff = actualStaffId || assignedStaffId;

  const res = await runner.query(
    `INSERT INTO public.dcc_daily_jobs (
       job_date, booking_id, route_id, route_stop_id, vehicle_id, customer_id, location_id,
       assigned_staff_id, actual_staff_id, frequency, status, photo_url,
       gps_lat, gps_lng, gps_accuracy, gps_distance_meters, gps_verified,
       client_mutation_id, notes, completed_at
     ) VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (job_date, vehicle_id) DO UPDATE SET
       actual_staff_id = COALESCE(EXCLUDED.actual_staff_id, public.dcc_daily_jobs.actual_staff_id),
       status = EXCLUDED.status,
       photo_url = COALESCE(EXCLUDED.photo_url, public.dcc_daily_jobs.photo_url),
       gps_lat = COALESCE(EXCLUDED.gps_lat, public.dcc_daily_jobs.gps_lat),
       gps_lng = COALESCE(EXCLUDED.gps_lng, public.dcc_daily_jobs.gps_lng),
       gps_accuracy = COALESCE(EXCLUDED.gps_accuracy, public.dcc_daily_jobs.gps_accuracy),
       gps_distance_meters = COALESCE(EXCLUDED.gps_distance_meters, public.dcc_daily_jobs.gps_distance_meters),
       gps_verified = COALESCE(EXCLUDED.gps_verified, public.dcc_daily_jobs.gps_verified),
       client_mutation_id = COALESCE(EXCLUDED.client_mutation_id, public.dcc_daily_jobs.client_mutation_id),
       notes = COALESCE(EXCLUDED.notes, public.dcc_daily_jobs.notes),
       completed_at = EXCLUDED.completed_at,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      effJobDate,
      bookingId || null,
      routeId || null,
      routeStopId || null,
      vehicleId,
      customerId,
      locationId,
      assignedStaffId,
      effActualStaff,
      frequency === 'alternate' ? 'alternate' : 'daily',
      status,
      photoUrl || null,
      gpsLat !== null && gpsLat !== undefined ? Number(gpsLat) : null,
      gpsLng !== null && gpsLng !== undefined ? Number(gpsLng) : null,
      gpsAccuracy !== null && gpsAccuracy !== undefined ? Number(gpsAccuracy) : null,
      gpsDistanceMeters !== null && gpsDistanceMeters !== undefined ? Number(gpsDistanceMeters) : null,
      gpsVerified !== null && gpsVerified !== undefined ? Boolean(gpsVerified) : null,
      clientMutationId || null,
      notes ? String(notes).trim() : null,
      effCompletedAt.toISOString()
    ]
  );

  return { inserted: true, idempotent: false, job: res.rows[0] };
}

async function markCompleted(params, client = null) {
  return punchDccJob({ ...params, status: 'completed' }, client);
}

async function markCarNotAvailable(params, client = null) {
  return punchDccJob({ ...params, status: 'car_not_available' }, client);
}

async function updateStatusByAdmin(id, { status, adminNotes = null } = {}, client = null) {
  const runner = client || db;
  const allowed = ['auto_generated', 'completed', 'car_not_available', 'missed'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid DCC job status '${status}'.`);
  }
  const res = await runner.query(
    `UPDATE public.dcc_daily_jobs
     SET status = $2,
         admin_notes = COALESCE($3, admin_notes),
         completed_at = CASE WHEN $2 IN ('completed', 'car_not_available') THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status, adminNotes ? String(adminNotes).trim() : null]
  );
  return res.rows[0] || null;
}

async function sweepMissedForDate(istDate = null, client = null) {
  const runner = client || db;
  const targetDate = istDate || getTodayIstDate();
  const res = await runner.query(
    `UPDATE public.dcc_daily_jobs
     SET status = 'missed',
         updated_at = CURRENT_TIMESTAMP
     WHERE job_date = $1::date
       AND status = 'auto_generated'
     RETURNING *`,
    [targetDate]
  );
  return res.rows;
}

module.exports = {
  computeIstServiceDate,
  getTodayIstDate,
  isAlternateDayDue,
  generateForDate,
  findByStaffAndDate,
  findByDateAndVehicle,
  findById,
  findByClientMutationId,
  queryDailyJobs,
  markCompleted,
  markCarNotAvailable,
  updateStatusByAdmin,
  sweepMissedForDate
};
