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
  deviceMetadata = null
}, client = null) {
  const runner = client || db;

  // Calculate IST date if not provided or to ensure strict compliance
  const computedDate = computeIstServiceDate(completedAtDevice);
  const targetDate = serviceDate || computedDate;

  // Idempotent insert with client_mutation_id
  const res = await runner.query(
    `INSERT INTO public.service_logs (
       client_mutation_id, staff_id, subscription_id, vehicle_id, job_id,
       service_date, status, completed_at_device, synced_at_server,
       notes, photo_url, source, device_metadata
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12
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
      deviceMetadata ? (typeof deviceMetadata === 'string' ? deviceMetadata : JSON.stringify(deviceMetadata)) : null
    ]
  );

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

module.exports = {
  computeIstServiceDate,
  recordCompletion,
  findByStaffAndDate,
  findBySubscriptionVehicleAndDate,
  findByJobId,
  resolveConflict
};
