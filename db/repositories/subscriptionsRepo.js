/**
 * Repository for table: subscriptions
 */
const db = require('../index');

async function findByCustomerId(customerId, { includeDeleted = false, client = null } = {}) {
  const runner = client || db;
  let sql = 'SELECT * FROM public.subscriptions WHERE customer_id = $1';
  if (!includeDeleted) {
    sql += ' AND deleted_at IS NULL';
  }
  sql += ' ORDER BY created_at DESC';
  const res = await runner.query(sql, [customerId]);
  return res.rows;
}

async function findActiveByCustomerId(customerId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.subscriptions 
     WHERE customer_id = $1 AND status = 'active' AND deleted_at IS NULL 
     LIMIT 1`,
    [customerId]
  );
  return res.rows[0] || null;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.subscriptions WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findByHybridMembershipId(membershipId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.subscriptions WHERE hybrid_membership_id = $1 ORDER BY created_at ASC',
    [membershipId]
  );
  return res.rows;
}

async function createSubscription({
  customerId,
  serviceCategoryId = 'daily_car_cleaning',
  packageName = 'Daily Clean',
  packagesPurchased = 1,
  rotationType = 'none',
  rotationNotes = null,
  status = 'active',
  startDate = null,
  endDate = null,
  hybridMembershipId = null
}, client = null) {
  const runner = client || db;
  const baseValues = [
      customerId,
      serviceCategoryId,
      packageName,
      parseInt(packagesPurchased, 10) || 1,
      rotationType || 'none',
      rotationNotes ? rotationNotes.trim() : null,
      status || 'active',
      startDate,
      endDate
  ];
  const res = hybridMembershipId
    ? await runner.query(
      `INSERT INTO public.subscriptions (
         customer_id, service_category_id, package_name, packages_purchased,
         rotation_type, rotation_notes, status, start_date, end_date, hybrid_membership_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_DATE),$9,$10) RETURNING *`,
      [...baseValues, hybridMembershipId]
    )
    : await runner.query(
      `INSERT INTO public.subscriptions (
         customer_id, service_category_id, package_name, packages_purchased,
         rotation_type, rotation_notes, status, start_date, end_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_DATE),$9) RETURNING *`,
      baseValues
    );
  return res.rows[0];
}

async function updateSubscription(id, {
  packageName,
  packagesPurchased,
  rotationType,
  rotationNotes,
  status,
  startDate,
  endDate
}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (packageName !== undefined) {
    params.push(packageName);
    updates.push(`package_name = $${params.length}`);
  }
  if (packagesPurchased !== undefined) {
    params.push(parseInt(packagesPurchased, 10) || 1);
    updates.push(`packages_purchased = $${params.length}`);
  }
  if (rotationType !== undefined) {
    params.push(rotationType || 'none');
    updates.push(`rotation_type = $${params.length}`);
  }
  if (rotationNotes !== undefined) {
    params.push(rotationNotes ? rotationNotes.trim() : null);
    updates.push(`rotation_notes = $${params.length}`);
  }
  if (status !== undefined) {
    params.push(status);
    updates.push(`status = $${params.length}`);
  }
  if (startDate !== undefined) {
    params.push(startDate);
    updates.push(`start_date = $${params.length}`);
  }
  if (endDate !== undefined) {
    params.push(endDate);
    updates.push(`end_date = $${params.length}`);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.subscriptions
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function cancelSubscription(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.subscriptions
     SET status = 'cancelled', end_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

module.exports = {
  findByCustomerId,
  findActiveByCustomerId,
  findById,
  findByHybridMembershipId,
  createSubscription,
  updateSubscription,
  cancelSubscription
};
