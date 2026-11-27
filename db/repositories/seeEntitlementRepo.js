/**
 * Repository for SEE Purchase Snapshots, Entitlement Accounts, and Entitlement Ledger
 */
const db = require('../index');

async function createPurchaseSnapshot(data, client) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.purchase_snapshots (
       sale_reference, customer_id, vehicle_id, location_id, package_id,
       package_version, package_code, package_name, service_definitions,
       addon_definitions, quantities, frequencies, validity,
       vehicle_segment, city, zone, base_price, discount_amount, final_price,
       currency, terms, status, purchased_at, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,COALESCE($23, CURRENT_TIMESTAMP),$24)
     RETURNING *`,
    [
      data.saleReference,
      data.customerId,
      data.vehicleId || null,
      data.locationId || null,
      data.packageId || null,
      data.packageVersion || 1,
      data.packageCode,
      data.packageName,
      JSON.stringify(data.serviceDefinitions || []),
      JSON.stringify(data.addonDefinitions || []),
      JSON.stringify(data.quantities || {}),
      JSON.stringify(data.frequencies || {}),
      JSON.stringify(data.validity || {}),
      data.vehicleSegment || null,
      data.city || null,
      data.zone || null,
      data.basePrice ?? 0,
      data.discountAmount ?? 0,
      data.finalPrice ?? 0,
      data.currency || 'INR',
      JSON.stringify(data.terms || {}),
      data.status || 'active',
      data.purchasedAt || null,
      data.createdBy || 'admin'
    ]
  );
  return res.rows[0];
}

async function findSnapshotById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.purchase_snapshots WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function findSnapshotBySaleReference(saleRef, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.purchase_snapshots WHERE sale_reference = $1 LIMIT 1', [saleRef]);
  return res.rows[0] || null;
}

async function findSnapshotsByCustomer(customerId, { limit = 100, offset = 0 } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.purchase_snapshots WHERE customer_id = $1 ORDER BY purchased_at DESC LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );
  return res.rows;
}

async function createEntitlementAccount(data, client) {
  const runner = client || db;
  const purchasedQty = parseInt(data.purchasedQty, 10) || 0;
  const res = await runner.query(
    `INSERT INTO public.entitlement_accounts (
       purchase_snapshot_id, customer_id, vehicle_id, location_id,
       service_id, addon_id, entitlement_kind,
       purchased_qty, reserved_qty, consumed_qty, expired_qty, adjusted_qty, refunded_qty, remaining_qty,
       valid_from, valid_to, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,0,0,$8,COALESCE($9, CURRENT_TIMESTAMP),$10,$11)
     RETURNING *`,
    [
      data.purchaseSnapshotId,
      data.customerId,
      data.vehicleId || null,
      data.locationId || null,
      data.serviceId || null,
      data.addonId || null,
      data.entitlementKind,
      purchasedQty,
      data.validFrom || null,
      data.validTo || null,
      data.status || 'active'
    ]
  );
  return res.rows[0];
}

async function findAccountById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.entitlement_accounts WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function findAccountByIdForUpdate(id, client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Active transaction client required for findAccountByIdForUpdate');
  }
  const res = await client.query('SELECT * FROM public.entitlement_accounts WHERE id = $1 FOR UPDATE', [id]);
  return res.rows[0] || null;
}

async function findAccountsByCustomer(customerId, { status = null, serviceId = null, addonId = null } = {}, client = null) {
  const runner = client || db;
  const conditions = ['ea.customer_id = $1'];
  const params = [customerId];
  if (status) { params.push(status); conditions.push(`ea.status = $${params.length}`); }
  if (serviceId) { params.push(serviceId); conditions.push(`ea.service_id = $${params.length}`); }
  if (addonId) { params.push(addonId); conditions.push(`ea.addon_id = $${params.length}`); }
  const res = await runner.query(
    `SELECT ea.*, s.service_code, s.name AS service_name, a.addon_code, a.name AS addon_name
     FROM public.entitlement_accounts ea
     LEFT JOIN public.services s ON ea.service_id = s.id
     LEFT JOIN public.addons a ON ea.addon_id = a.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ea.created_at DESC`,
    params
  );
  return res.rows;
}

async function findLedgerByIdempotencyKey(idempotencyKey, client = null) {
  if (!idempotencyKey) return null;
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.entitlement_ledger WHERE idempotency_key = $1 LIMIT 1', [idempotencyKey]);
  return res.rows[0] || null;
}

async function updateAccountBalances(id, balances, client) {
  const res = await client.query(
    `UPDATE public.entitlement_accounts SET
       reserved_qty = $2,
       consumed_qty = $3,
       expired_qty = $4,
       adjusted_qty = $5,
       refunded_qty = $6,
       remaining_qty = $7,
       status = $8,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      id,
      balances.reservedQty,
      balances.consumedQty,
      balances.expiredQty,
      balances.adjustedQty,
      balances.refundedQty,
      balances.remainingQty,
      balances.status
    ]
  );
  return res.rows[0];
}

async function insertLedgerEntry(entry, client) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.entitlement_ledger (
       entitlement_account_id, entry_type, quantity, balance_after,
       reference_type, reference_id, sale_reference, execution_reference,
       idempotency_key, reason, actor
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      entry.entitlementAccountId,
      entry.entryType,
      entry.quantity,
      entry.balanceAfter,
      entry.referenceType || null,
      entry.referenceId || null,
      entry.saleReference || null,
      entry.executionReference || null,
      entry.idempotencyKey || null,
      entry.reason,
      entry.actor
    ]
  );
  return res.rows[0];
}

async function findLedgerByAccount(accountId, { limit = 100, offset = 0 } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.entitlement_ledger WHERE entitlement_account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [accountId, limit, offset]
  );
  return res.rows;
}

module.exports = {
  createPurchaseSnapshot,
  findSnapshotById,
  findSnapshotBySaleReference,
  findSnapshotsByCustomer,
  createEntitlementAccount,
  findAccountById,
  findAccountByIdForUpdate,
  findAccountsByCustomer,
  findLedgerByIdempotencyKey,
  updateAccountBalances,
  insertLedgerEntry,
  findLedgerByAccount
};
