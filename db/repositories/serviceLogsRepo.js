/**
 * Repository for table: service_logs
 * Offline synchronization and checkoff ledger
 */
const db = require('../index');

/**
 * Validates and ensures service_date matches completed_at_device in Asia/Kolkata timezone
 */
function computeIstServiceDate(completedAtDevice) {
  const d = new Date(completedAtDevice);
  // Format as YYYY-MM-DD in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

async function recordCompletion({
  clientMutationId,
  staffId,
  subscriptionId = null,
  vehicleId = null,
  jobId = null,
  serviceDate = null,
  status = 'completed',
  completedAtDevice,
  notes = null,
  photoUrl = null,
  source = 'staff_portal',
  deviceMetadata = null,
  carNotPresent = false,
  tag = null,
  punchLatitude = null,
  punchLongitude = null,
  punchAccuracyMeters = null,
  punchDistanceMeters = null,
  punchVerified = null,
  punchVerificationStatus = null,
  punchMetadata = null
}, client = null) {
  const runner = client || db;

  // Calculate IST date if not provided or to ensure strict compliance
  const computedDate = computeIstServiceDate(completedAtDevice);
  const targetDate = serviceDate || computedDate;
  const effectiveTag = tag || (carNotPresent ? 'car_not_present' : null);

  // Idempotent insert with client_mutation_id
  let res;
  try {
    res = await runner.query(
      `INSERT INTO public.service_logs (
         client_mutation_id, staff_id, subscription_id, vehicle_id, job_id,
         service_date, status, completed_at_device, synced_at_server,
         notes, photo_url, source, device_metadata, car_not_present, tag,
         punch_latitude, punch_longitude, punch_accuracy_meters, punch_distance_meters,
         punch_verified, punch_verification_status, punch_metadata
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21
       )
       ON CONFLICT (client_mutation_id) DO NOTHING
       RETURNING *`,
      [
        clientMutationId,
        staffId,
        subscriptionId,
        vehicleId,
        jobId,
        targetDate,
        status || 'completed',
        completedAtDevice,
        notes ? notes.trim() : null,
        photoUrl,
        source || 'staff_portal',
        deviceMetadata ? (typeof deviceMetadata === 'string' ? deviceMetadata : JSON.stringify(deviceMetadata)) : null,
        Boolean(carNotPresent),
        effectiveTag,
        punchLatitude !== null && punchLatitude !== undefined ? parseFloat(punchLatitude) : null,
        punchLongitude !== null && punchLongitude !== undefined ? parseFloat(punchLongitude) : null,
        punchAccuracyMeters !== null && punchAccuracyMeters !== undefined ? parseFloat(punchAccuracyMeters) : null,
        punchDistanceMeters !== null && punchDistanceMeters !== undefined ? parseFloat(punchDistanceMeters) : null,
        punchVerified !== null && punchVerified !== undefined ? Boolean(punchVerified) : null,
        punchVerificationStatus || (punchLatitude !== null ? 'pending' : null),
        punchMetadata ? (typeof punchMetadata === 'string' ? punchMetadata : JSON.stringify(punchMetadata)) : null
      ]
    );
  } catch (err) {
    if (err.code === '23505') {
      if (jobId && (!err.constraint || err.constraint === 'uq_service_logs_job_once')) {
        const dupJob = await findByJobId(jobId, runner);
        if (dupJob) {
          return { inserted: false, duplicate: true, idempotent: true, log: dupJob };
        }
      }
      if (clientMutationId && (!err.constraint || err.constraint.includes('client_mutation_id'))) {
        const dupMut = await findByClientMutationId(clientMutationId, runner);
        if (dupMut) {
          return { inserted: false, idempotent: true, log: dupMut };
        }
      }
      if (subscriptionId && vehicleId) {
        const dup = await runner.query(
          'SELECT * FROM public.service_logs WHERE subscription_id = $1 AND vehicle_id = $2 AND service_date = $3 LIMIT 1',
          [subscriptionId, vehicleId, targetDate]
        );
        if (dup.rows.length > 0) {
          return { inserted: false, duplicate: true, idempotent: true, log: dup.rows[0] };
        }
      }
    }
    throw err;
  }

  if (res.rows.length > 0) {
    return { inserted: true, log: res.rows[0] };
  }

  // If duplicate client_mutation_id, return existing record
  const existing = await runner.query(
    'SELECT * FROM public.service_logs WHERE client_mutation_id = $1 LIMIT 1',
    [clientMutationId]
  );
  return { inserted: false, idempotent: true, log: existing.rows[0] || null };
}

async function findByStaffAndDate(staffId, serviceDate, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_logs 
     WHERE staff_id = $1 AND service_date = $2
     ORDER BY completed_at_device ASC`,
    [staffId, serviceDate]
  );
  return res.rows;
}

async function findBySubscriptionVehicleAndDate(subscriptionId, vehicleId, serviceDate, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_logs 
     WHERE subscription_id = $1 AND vehicle_id = $2 AND service_date = $3
     LIMIT 1`,
    [subscriptionId, vehicleId, serviceDate]
  );
  return res.rows[0] || null;
}

async function findByJobId(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_logs 
     WHERE job_id = $1
     LIMIT 1`,
    [jobId]
  );
  return res.rows[0] || null;
}

async function findByClientMutationId(clientMutationId, client = null) {
  if (!clientMutationId) return null;
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_logs
     WHERE client_mutation_id = $1
     LIMIT 1`,
    [clientMutationId]
  );
  return res.rows[0] || null;
}

async function resolveConflict({
  id,
  status,
  notes,
  conflictResolved = true
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_logs
     SET status = $2,
         notes = $3,
         conflict_resolved = $4,
         synced_at_server = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status, notes, conflictResolved]
  );
  return res.rows[0] || null;
}

/**
 * Query daily clean reports for Admin Portal with multi-dimensional filtering
 */
async function queryDailyCleanReports({
  startDate = null,
  endDate = null,
  staffId = null,
  search = null,
  hasPhoto = null,
  carNotPresent = null,
  status = null,
  tag = null,
  limit = 200,
  offset = 0
} = {}, client = null) {
  const runner = client || db;

  const conditions = [];
  const params = [];

  // Default to today's date in IST if no dates are provided
  const todayIst = computeIstServiceDate(new Date().toISOString());
  const effectiveStart = startDate || todayIst;
  const effectiveEnd = endDate || effectiveStart;

  params.push(effectiveStart);
  conditions.push(`sl.service_date >= $${params.length}`);

  params.push(effectiveEnd);
  conditions.push(`sl.service_date <= $${params.length}`);

  if (staffId && staffId !== 'all') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffId)) {
      params.push(staffId);
      conditions.push(`sl.staff_id = $${params.length}`);
    } else {
      params.push(staffId.toUpperCase());
      conditions.push(`s.staff_code = $${params.length}`);
    }
  }

  if (search && search.trim()) {
    const sTerm = `%${search.trim().toLowerCase()}%`;
    params.push(sTerm);
    const pIdx = params.length;
    conditions.push(`(
      LOWER(COALESCE(c.name, jc.name, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(c.phone, jc.phone, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(v.registration_no, jv.registration_no, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(v.brand_or_model, jv.brand_or_model, '')) LIKE $${pIdx}
    )`);
  }

  if (hasPhoto === 'yes' || hasPhoto === true || hasPhoto === 'true') {
    conditions.push(`(sl.photo_url IS NOT NULL AND TRIM(sl.photo_url) != '')`);
  } else if (hasPhoto === 'no' || hasPhoto === false || hasPhoto === 'false') {
    conditions.push(`(sl.photo_url IS NULL OR TRIM(sl.photo_url) = '')`);
  }

  if (carNotPresent === 'yes' || carNotPresent === true || carNotPresent === 'true' || tag === 'car_not_present') {
    conditions.push(`(sl.car_not_present = TRUE OR sl.tag = 'car_not_present')`);
  } else if (carNotPresent === 'no' || carNotPresent === false || carNotPresent === 'false') {
    conditions.push(`(sl.car_not_present = FALSE AND (sl.tag IS NULL OR sl.tag != 'car_not_present'))`);
  }

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`sl.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Fetch Records
  const querySql = `
    SELECT 
      sl.id,
      sl.client_mutation_id,
      sl.service_date,
      sl.status,
      sl.completed_at_device,
      sl.synced_at_server,
      sl.notes,
      sl.photo_url,
      sl.source,
      sl.device_metadata,
      sl.car_not_present, sl.tag,
      sl.admin_notes,
      sl.admin_updated_at,
      sl.admin_updated_by,
      s.id AS staff_id,
      s.staff_code,
      s.name AS staff_name,
      s.phone AS staff_phone,
      COALESCE(c.id, jc.id) AS customer_id,
      COALESCE(c.customer_code, jc.customer_code) AS customer_code,
      COALESCE(c.name, jc.name) AS customer_name,
      COALESCE(c.phone, jc.phone) AS customer_phone,
      COALESCE(c.alt_phone, jc.alt_phone) AS customer_alt_phone,
      COALESCE(v.id, jv.id) AS vehicle_id,
      COALESCE(v.registration_no, jv.registration_no) AS registration_no,
      COALESCE(v.brand_or_model, jv.brand_or_model) AS brand_or_model,
      COALESCE(v.photo_url, jv.photo_url) AS vehicle_master_photo,
      sub.package_name,
      COALESCE(loc.address_text, jloc.address_text) AS address_text,
      COALESCE(loc.parking_details, jloc.parking_details) AS parking_details,
      COALESCE(loc.google_maps_url, jloc.google_maps_url) AS google_maps_url
    FROM public.service_logs sl
    LEFT JOIN public.staff s ON sl.staff_id = s.id
    LEFT JOIN public.subscriptions sub ON sl.subscription_id = sub.id
    LEFT JOIN public.customers c ON sub.customer_id = c.id
    LEFT JOIN public.vehicles v ON sl.vehicle_id = v.id
    LEFT JOIN public.subscription_vehicles sv ON sv.subscription_id = sl.subscription_id AND sv.vehicle_id = sl.vehicle_id
    LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
    LEFT JOIN public.service_jobs sj ON sl.job_id = sj.id
    LEFT JOIN public.customers jc ON sj.customer_id = jc.id
    LEFT JOIN public.vehicles jv ON sj.vehicle_id = jv.id
    LEFT JOIN public.service_locations jloc ON sj.location_id = jloc.id
    ${whereClause}
    ORDER BY sl.completed_at_device DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const queryParams = [...params, limit, offset];
  const recordsRes = await runner.query(querySql, queryParams);

  // 2. Fetch Summary Statistics
  const countSql = `
    SELECT 
      COUNT(*)::int AS total_cleaned,
      COUNT(CASE WHEN sl.photo_url IS NOT NULL AND TRIM(sl.photo_url) != '' THEN 1 END)::int AS with_photo_count,
      COUNT(CASE WHEN sl.photo_url IS NULL OR TRIM(sl.photo_url) = '' THEN 1 END)::int AS without_photo_count,
      COUNT(CASE WHEN sl.car_not_present = TRUE OR sl.tag = 'car_not_present' THEN 1 END)::int AS car_not_present_count,
      COUNT(DISTINCT sl.staff_id)::int AS active_staff_count,
      MAX(sl.completed_at_device) AS latest_punch_time
    FROM public.service_logs sl
    LEFT JOIN public.staff s ON sl.staff_id = s.id
    LEFT JOIN public.subscriptions sub ON sl.subscription_id = sub.id
    LEFT JOIN public.customers c ON sub.customer_id = c.id
    LEFT JOIN public.vehicles v ON sl.vehicle_id = v.id
    LEFT JOIN public.service_jobs sj ON sl.job_id = sj.id
    LEFT JOIN public.customers jc ON sj.customer_id = jc.id
    LEFT JOIN public.vehicles jv ON sj.vehicle_id = jv.id
    ${whereClause}
  `;

  const countRes = await runner.query(countSql, params);
  const summary = countRes.rows[0] || {
    total_cleaned: 0,
    with_photo_count: 0,
    without_photo_count: 0,
    car_not_present_count: 0,
    active_staff_count: 0,
    latest_punch_time: null
  };

  return {
    records: recordsRes.rows,
    summary: {
      totalCleaned: summary.total_cleaned || 0,
      withPhotoCount: summary.with_photo_count || 0,
      withoutPhotoCount: summary.without_photo_count || 0,
      carNotPresentCount: summary.car_not_present_count || 0,
      activeStaffCount: summary.active_staff_count || 0,
      photoRate: (summary.total_cleaned && summary.total_cleaned > 0)
        ? Math.round((summary.with_photo_count / summary.total_cleaned) * 100)
        : 0,
      latestPunchTime: summary.latest_punch_time
    },
    filterApplied: {
      startDate: effectiveStart,
      endDate: effectiveEnd,
      staffId: staffId || 'all',
      search: search || '',
      hasPhoto: hasPhoto || 'all',
      carNotPresent: carNotPresent || 'all',
      tag: tag || null
    }
  };
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sl.*,
            v.registration_no,
            COALESCE(c.name, jc.name) AS customer_name,
            s.name AS staff_name,
            s.staff_code
     FROM public.service_logs sl
     LEFT JOIN public.staff s ON sl.staff_id = s.id
     LEFT JOIN public.subscriptions sub ON sl.subscription_id = sub.id
     LEFT JOIN public.customers c ON sub.customer_id = c.id
     LEFT JOIN public.vehicles v ON sl.vehicle_id = v.id
     LEFT JOIN public.service_jobs sj ON sl.job_id = sj.id
     LEFT JOIN public.customers jc ON sj.customer_id = jc.id
     WHERE sl.id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function updateStatusAndReason(id, { status, adminNotes, adminUser = 'admin' }, client = null) {
  const runner = client || db;
  const isCnp = (status === 'car_not_present' || status === 'customer_absent');
  const effTag = status === 'completed' ? null : (status || 'car_not_present');
  const effStatus = status || (isCnp ? 'car_not_present' : 'completed');
  const effNotes = isCnp
    ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)'
    : (status === 'skipped' ? 'Daily clean skipped upon customer request' : (status === 'unable_to_complete' ? 'Unable to complete service' : 'Daily clean verified with photo proof'));

  const res = await runner.query(
    `UPDATE public.service_logs
     SET status = $1::varchar,
         car_not_present = $2,
         tag = $3,
         admin_notes = $4,
         admin_updated_at = CURRENT_TIMESTAMP,
         admin_updated_by = $5,
         notes = CASE 
           WHEN $2 = FALSE AND (car_not_present = TRUE OR notes LIKE '%Car not present%') THEN $6
           WHEN $2 = TRUE AND notes NOT LIKE '%Car not present%' THEN $6
           ELSE notes
         END
     WHERE id = $7
     RETURNING *`,
    [effStatus, isCnp, effTag, adminNotes ? adminNotes.trim() : null, adminUser, effNotes, id]
  );
  return res.rows[0] || null;
}

async function deleteReport(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `DELETE FROM public.service_logs WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  computeIstServiceDate,
  recordCompletion,
  findByStaffAndDate,
  findBySubscriptionVehicleAndDate,
  findByJobId,
  findByClientMutationId,
  findById,
  updateStatusAndReason,
  deleteReport,
  resolveConflict,
  queryDailyCleanReports
};
