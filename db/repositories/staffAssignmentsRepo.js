/**
 * Repository for table: staff_assignments
 * Note: Immutable ledger protected by trg_staff_assignments_immutability
 */
const db = require('../index');

async function findActiveByStaffId(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sa.*, 
            s.staff_code, s.name AS staff_name, s.phone AS staff_phone
     FROM public.staff_assignments sa
     JOIN public.staff s ON sa.staff_id = s.id
     WHERE sa.staff_id = $1 AND sa.is_active = TRUE
     ORDER BY sa.assigned_at ASC`,
    [staffId]
  );
  return res.rows;
}

async function findActiveBySubscriptionId(subscriptionId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sa.*, 
            s.staff_code, s.name AS staff_name, s.phone AS staff_phone
     FROM public.staff_assignments sa
     JOIN public.staff s ON sa.staff_id = s.id
     WHERE sa.subscription_id = $1 AND sa.is_active = TRUE
     LIMIT 1`,
    [subscriptionId]
  );
  return res.rows[0] || null;
}

async function findActiveByJobId(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sa.*, 
            s.staff_code, s.name AS staff_name, s.phone AS staff_phone
     FROM public.staff_assignments sa
     JOIN public.staff s ON sa.staff_id = s.id
     WHERE sa.job_id = $1 AND sa.is_active = TRUE
     LIMIT 1`,
    [jobId]
  );
  return res.rows[0] || null;
}

async function assignStaffToSubscription({
  staffId,
  subscriptionId,
  assignedBy = 'admin'
}, client = null) {
  const runner = client || db;
  // If an active assignment exists, deactivate it first (respecting immutability trigger)
  await runner.query(
    `UPDATE public.staff_assignments
     SET is_active = FALSE,
         unassigned_at = CURRENT_TIMESTAMP,
         unassigned_by = $2,
         reassignment_reason = 'Reassigned to another staff member',
         updated_at = CURRENT_TIMESTAMP
     WHERE subscription_id = $1 AND is_active = TRUE`,
    [subscriptionId, assignedBy]
  );

  const res = await runner.query(
    `INSERT INTO public.staff_assignments (
       staff_id, subscription_id, job_id, assigned_by, is_active
     ) VALUES ($1, $2, NULL, $3, TRUE)
     RETURNING *`,
    [staffId, subscriptionId, assignedBy]
  );
  return res.rows[0];
}

async function assignStaffToJob({
  staffId,
  jobId,
  assignedBy = 'admin'
}, client = null) {
  const runner = client || db;
  // If active assignment exists, deactivate it
  await runner.query(
    `UPDATE public.staff_assignments
     SET is_active = FALSE,
         unassigned_at = CURRENT_TIMESTAMP,
         unassigned_by = $2,
         reassignment_reason = 'Reassigned to another staff member',
         updated_at = CURRENT_TIMESTAMP
     WHERE job_id = $1 AND is_active = TRUE`,
    [jobId, assignedBy]
  );

  const res = await runner.query(
    `INSERT INTO public.staff_assignments (
       staff_id, subscription_id, job_id, assigned_by, is_active
     ) VALUES ($1, NULL, $2, $3, TRUE)
     RETURNING *`,
    [staffId, jobId, assignedBy]
  );
  return res.rows[0];
}

async function unassignSubscription({
  subscriptionId,
  unassignedBy = 'admin',
  reason = 'Administrative unassignment'
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_assignments
     SET is_active = FALSE,
         unassigned_at = CURRENT_TIMESTAMP,
         unassigned_by = $2,
         reassignment_reason = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE subscription_id = $1 AND is_active = TRUE
     RETURNING *`,
    [subscriptionId, unassignedBy, reason]
  );
  return res.rows[0] || null;
}

async function unassignJob({
  jobId,
  unassignedBy = 'admin',
  reason = 'Administrative unassignment'
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_assignments
     SET is_active = FALSE,
         unassigned_at = CURRENT_TIMESTAMP,
         unassigned_by = $2,
         reassignment_reason = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE job_id = $1 AND is_active = TRUE
     RETURNING *`,
    [jobId, unassignedBy, reason]
  );
  return res.rows[0] || null;
}

async function unassignAllForStaff(staffId, unassignedBy = 'admin', reason = 'Staff deactivated', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_assignments
     SET is_active = FALSE,
         unassigned_at = CURRENT_TIMESTAMP,
         unassigned_by = $2,
         reassignment_reason = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE staff_id = $1 AND is_active = TRUE`,
    [staffId, unassignedBy, reason]
  );
  return res.rowCount || 0;
}

module.exports = {
  findActiveByStaffId,
  findActiveBySubscriptionId,
  findActiveByJobId,
  assignStaffToSubscription,
  assignStaffToJob,
  unassignSubscription,
  unassignJob,
  unassignAllForStaff
};
