/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Phases 7 & 8: Immutable Purchase Snapshot & Entitlement Ledger
 *
 * Invariants:
 * 1. Purchase creates an immutable snapshot; catalogue edits never mutate past sales.
 * 2. Entitlement accounts track purchased, reserved, consumed, expired, adjusted, refunded, remaining.
 * 3. Assignment does NOT automatically consume entitlement.
 * 4. Reservation and consumption are separate, transactional, and idempotent.
 * 5. DCC daily cleaning is separate from DCC wash credits and add-on entitlements.
 * 6. Solar visit credits are tracked independently of actual panel quantities.
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeCatalogueService = require('./seeCatalogueService');

function computeValidityDates(validityValue, validityUnit, startDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(start);
  const val = Math.max(1, parseInt(validityValue, 10) || 30);
  if (validityUnit === 'years') {
    end.setFullYear(end.getFullYear() + val);
  } else if (validityUnit === 'months') {
    end.setMonth(end.getMonth() + val);
  } else {
    end.setDate(end.getDate() + val);
  }
  return { validFrom: start.toISOString(), validTo: end.toISOString() };
}

function mapEntitlementKind(serviceCategoryId, benefitType) {
  if (benefitType === 'wash_credit') return 'wash_credit';
  if (benefitType === 'visit_credit') return serviceCategoryId === 'solar_cleaning' ? 'solar_visit' : 'wash_credit';
  if (serviceCategoryId === 'daily_car_cleaning') return 'dcc_daily';
  if (serviceCategoryId === 'car_washing') return 'wash_credit';
  if (serviceCategoryId === 'solar_cleaning') return 'solar_visit';
  if (serviceCategoryId === 'interior_detailing' || serviceCategoryId === 'exterior_detailing' || serviceCategoryId === 'detailing') {
    return 'detailing_visit';
  }
  return 'custom';
}

/**
 * Phase 7: Create an immutable Purchase Snapshot & initialize Entitlement Accounts + Ledger
 */
async function createPurchase({
  customerId,
  vehicleId = null,
  locationId = null,
  packageIdOrCode,
  vehicleSegment = null,
  city = null,
  zone = null,
  quantity = 1,
  discountAmount = 0,
  saleReference = null,
  terms = {},
  actor = 'admin'
}) {
  if (!customerId) throw new Error('customerId is required.');
  if (!packageIdOrCode) throw new Error('packageIdOrCode is required.');
  if (!saleReference || !String(saleReference).trim()) {
    throw new Error('A stable saleReference is required to make package purchase retries idempotent.');
  }
  if (String(saleReference).trim().length > 120) throw new Error('saleReference must be 120 characters or fewer.');
  const purchaseUnits = parseInt(quantity, 10);
  if (!Number.isInteger(purchaseUnits) || purchaseUnits < 1) throw new Error('quantity must be a positive integer.');

  const pkg = await seeCatalogueService.getPackageDetail(packageIdOrCode);
  if (!pkg) throw new Error(`Package '${packageIdOrCode}' not found.`);
  if (pkg.status !== 'active') {
    throw new Error(`Cannot purchase package '${pkg.name}' in status '${pkg.status}'.`);
  }
  for (const benefit of pkg.benefits || []) {
    const service = benefit.service_id ? await repos.seeCatalogue.findServiceById(benefit.service_id) : null;
    if (!service || seeCatalogueService.isDccService(service) || seeCatalogueService.isDccService(benefit)) {
      throw new Error('Generic SEE purchases cannot include Daily Car Cleaning entitlements or unresolved services.');
    }
  }

  const pricing = seeCatalogueService.calculatePackagePrice(pkg, {
    city,
    zone,
    vehicleSegment: vehicleSegment || pkg.vehicle_segment,
    quantity: purchaseUnits
  });
  const discount = Math.max(0, parseFloat(discountAmount) || 0);
  const finalPrice = Math.max(0, Math.round((pricing.basePrice - discount) * 100) / 100);
  const saleRef = String(saleReference).trim().slice(0, 120);
  const { validFrom, validTo } = computeValidityDates(pkg.validity_value, pkg.validity_unit);

  // P2: Validate package effective dates (Asia/Kolkata)
  const toYmd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (pkg.effective_from && toYmd(pkg.effective_from) > todayIst) {
    throw new Error(`Package '${pkg.name}' is not effective yet (starts ${toYmd(pkg.effective_from)}).`);
  }
  if (pkg.effective_to && toYmd(pkg.effective_to) < todayIst) {
    throw new Error(`Package '${pkg.name}' has expired (ended ${toYmd(pkg.effective_to)}).`);
  }

  // P1: Validate city/zone eligibility
  const elig = pkg.city_zone_eligibility || { all_cities: true, cities: [], zones: [] };
  if (elig.all_cities === false) {
    const allowedCities = Array.isArray(elig.cities) ? elig.cities.map(c => c.toLowerCase()) : [];
    if (!city || !allowedCities.includes(city.toLowerCase())) {
      throw new Error(`Package '${pkg.name}' is not available in city '${city || 'unspecified'}'.`);
    }
  }
  if (Array.isArray(elig.zones) && elig.zones.length > 0) {
    const allowedZones = elig.zones.map(z => z.toLowerCase());
    if (!zone || !allowedZones.includes(zone.toLowerCase())) {
      throw new Error(`Package '${pkg.name}' is not available in zone '${zone || 'unspecified'}'.`);
    }
  }

  return db.withTransaction(async (client) => {
    // Serialize retries using the caller's stable sale reference before the
    // unique insert. A repeat with the same purchase facts returns the exact
    // original snapshot and accounts instead of creating another sale.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [saleRef]);
    const existingSnapshot = await repos.seeEntitlement.findSnapshotBySaleReference(saleRef, client);
    if (existingSnapshot) {
      const samePurchase = String(existingSnapshot.customer_id) === String(customerId) &&
        String(existingSnapshot.package_id) === String(pkg.id) &&
        String(existingSnapshot.vehicle_id || '') === String(vehicleId || '') &&
        String(existingSnapshot.location_id || '') === String(locationId || '') &&
        String(existingSnapshot.city || '') === String(city || '') &&
        String(existingSnapshot.zone || '') === String(zone || '') &&
        String(existingSnapshot.vehicle_segment || '') === String(vehicleSegment || pkg.vehicle_segment || '') &&
        Number(existingSnapshot.discount_amount || 0) === discount &&
        Number(existingSnapshot.quantities?.purchaseUnits || 1) === purchaseUnits;
      if (!samePurchase) throw new Error('saleReference is already used for a different package purchase.');
      const accounts = await repos.seeEntitlement.findAccountsBySnapshotId(existingSnapshot.id, client);
      return { snapshot: existingSnapshot, accounts, idempotentReplay: true };
    }

    const customer = await repos.customers.findById(customerId, client);
    if (!customer || customer.deleted_at) throw new Error(`Customer '${customerId}' not found.`);
    if (customer.is_active === false) throw new Error(`Customer '${customerId}' is inactive.`);

    // P1: Validate vehicle ownership & service compatibility
    if (vehicleId) {
      const vehicle = await repos.vehicles.findById(vehicleId, client);
      if (!vehicle || vehicle.customer_id !== customer.id) {
        throw new Error(`Vehicle '${vehicleId}' does not belong to customer '${customerId}'.`);
      }
      if (vehicle.is_active === false) throw new Error(`Vehicle '${vehicleId}' is inactive.`);
      if (pkg.service_category_id === 'solar_cleaning') {
        throw new Error(`Vehicle '${vehicleId}' cannot be attached to solar cleaning package '${pkg.name}'.`);
      }
    }

    // P1: Validate location ownership
    if (locationId) {
      const location = await repos.serviceLocations.findById(locationId, client);
      if (!location || location.customer_id !== customer.id) {
        throw new Error(`Location '${locationId}' does not belong to customer '${customerId}'.`);
      }
      if (location.is_active === false) throw new Error(`Location '${locationId}' is inactive.`);
    }

    const snapshot = await repos.seeEntitlement.createPurchaseSnapshot({
      saleReference: saleRef,
      customerId,
      vehicleId,
      locationId,
      packageId: pkg.id,
      packageVersion: pkg.version || 1,
      packageCode: pkg.package_code,
      packageName: pkg.name,
      serviceDefinitions: pkg.benefits || [],
      addonDefinitions: pkg.addons || [],
      quantities: { purchaseUnits, benefits: (pkg.benefits || []).map(b => ({ serviceId: b.service_id, quantity: (parseInt(b.quantity, 10) || 1) * purchaseUnits })), addons: (pkg.addons || []).map(a => ({ addonId: a.addon_id, quantity: (parseInt(a.quantity, 10) || 1) * purchaseUnits })) },
      frequencies: (pkg.benefits || []).reduce((acc, b) => {
        if (b.frequency_code) acc[b.service_id] = b.frequency_code;
        return acc;
      }, {}),
      validity: { value: pkg.validity_value, unit: pkg.validity_unit, validFrom, validTo },
      vehicleSegment: vehicleSegment || pkg.vehicle_segment,
      city,
      zone,
      basePrice: pricing.basePrice,
      discountAmount: discount,
      finalPrice,
      terms,
      createdBy: actor
    }, client);

    const accounts = [];

    // Initialize separate entitlement accounts for each package benefit
    for (const b of (pkg.benefits || [])) {
      const kind = mapEntitlementKind(b.service_category_id || pkg.service_category_id, b.benefit_type);
      const qty = (parseInt(b.quantity, 10) || 1) * purchaseUnits;
      const acct = await repos.seeEntitlement.createEntitlementAccount({
        purchaseSnapshotId: snapshot.id,
        customerId,
        vehicleId,
        locationId,
        serviceId: b.service_id,
        entitlementKind: kind,
        purchasedQty: qty,
        validFrom,
        validTo
      }, client);

      await repos.seeEntitlement.insertLedgerEntry({
        entitlementAccountId: acct.id,
        entryType: 'purchase',
        quantity: qty,
        balanceAfter: qty,
        referenceType: 'purchase_snapshot',
        referenceId: snapshot.id,
        saleReference: saleRef,
        idempotencyKey: `purchase:${snapshot.id}:svc:${b.id}`,
        reason: `Initial purchase credit for ${pkg.name}`,
        actor
      }, client);

      accounts.push(acct);
    }

    // Initialize separate entitlement accounts for included package add-ons
    for (const a of (pkg.addons || [])) {
      if (a.is_included === false) continue;
      const qty = (parseInt(a.quantity, 10) || 1) * purchaseUnits;
      const acct = await repos.seeEntitlement.createEntitlementAccount({
        purchaseSnapshotId: snapshot.id,
        customerId,
        vehicleId,
        locationId,
        addonId: a.addon_id,
        entitlementKind: 'addon_credit',
        purchasedQty: qty,
        validFrom,
        validTo
      }, client);

      await repos.seeEntitlement.insertLedgerEntry({
        entitlementAccountId: acct.id,
        entryType: 'purchase',
        quantity: qty,
        balanceAfter: qty,
        referenceType: 'purchase_snapshot',
        referenceId: snapshot.id,
        saleReference: saleRef,
        idempotencyKey: `purchase:${snapshot.id}:addon:${a.id}`,
        reason: `Included add-on credit for ${a.addon_name}`,
        actor
      }, client);

      accounts.push(acct);
    }

    await repos.auditLogs.logChange({
      entityType: 'purchase_snapshot',
      entityId: snapshot.id,
      action: 'purchase',
      changedBy: actor,
      afterState: { saleReference: saleRef, packageCode: pkg.package_code, finalPrice }
    }, client);

    return { snapshot, accounts };
  });
}

function deriveAccountStatus(acct, remainingQty) {
  if (acct.status === 'cancelled') return 'cancelled';
  if (remainingQty <= 0) return 'exhausted';
  if (acct.valid_to && new Date(acct.valid_to) < new Date()) return 'expired';
  return 'active';
}

/**
 * Core atomic ledger mutation with FOR UPDATE lock + idempotency key.
 * Accepts optional externalClient to participate in a caller's transaction.
 */
async function mutateEntitlement({
  accountId,
  entryType,
  quantity = 1,
  referenceType = null,
  referenceId = null,
  saleReference = null,
  executionReference = null,
  idempotencyKey = null,
  reason,
  actor = 'system'
}, externalClient = null) {
  if (!accountId) throw new Error('accountId is required.');
  if (!reason) throw new Error('reason is required for ledger entry.');
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || (entryType !== 'adjust' && qty <= 0) || (entryType === 'adjust' && qty === 0)) {
    throw new Error('Invalid quantity for entitlement mutation.');
  }

  const executeInTx = async (client) => {
    // Idempotency check
    if (idempotencyKey) {
      const existingEntry = await repos.seeEntitlement.findLedgerByIdempotencyKey(idempotencyKey, client);
      if (existingEntry) {
        const acct = await repos.seeEntitlement.findAccountById(accountId, client);
        return { idempotentReplay: true, ledgerEntry: existingEntry, account: acct };
      }
    }

    const acct = await repos.seeEntitlement.findAccountByIdForUpdate(accountId, client);
    if (!acct) throw new Error(`Entitlement account '${accountId}' not found.`);

    let reserved = acct.reserved_qty;
    let consumed = acct.consumed_qty;
    let expired = acct.expired_qty;
    let adjusted = acct.adjusted_qty;
    let refunded = acct.refunded_qty;
    let remaining = acct.remaining_qty;

    if (entryType === 'reserve') {
      if (acct.status !== 'active') throw new Error(`Cannot reserve from account in status '${acct.status}'.`);
      if (remaining < qty) throw new Error(`Insufficient remaining entitlement (${remaining} < ${qty}).`);
      reserved += qty;
      remaining -= qty;
    } else if (entryType === 'release') {
      if (reserved < qty) throw new Error(`Cannot release ${qty}; only ${reserved} reserved.`);
      reserved -= qty;
      remaining += qty;
    } else if (entryType === 'consume') {
      // Can consume from reserved (preferred) or directly from remaining if unreserved
      if (reserved >= qty) {
        reserved -= qty;
        consumed += qty;
      } else {
        if (acct.status !== 'active') throw new Error(`Cannot consume from account in status '${acct.status}'.`);
        if (remaining < qty) throw new Error(`Insufficient remaining entitlement (${remaining} < ${qty}).`);
        remaining -= qty;
        consumed += qty;
      }
    } else if (entryType === 'expire') {
      const expQty = Math.min(remaining, qty);
      remaining -= expQty;
      expired += expQty;
    } else if (entryType === 'adjust') {
      if (remaining + qty < 0) throw new Error(`Adjustment would result in negative remaining balance.`);
      adjusted += qty;
      remaining += qty;
    } else if (entryType === 'refund' || entryType === 'reverse') {
      if (remaining < qty) throw new Error(`Insufficient remaining balance (${remaining}) to refund ${qty}.`);
      refunded += qty;
      remaining -= qty;
    } else {
      throw new Error(`Unsupported ledger entryType '${entryType}'.`);
    }

    const nextStatus = entryType === 'expire' && remaining === 0
      ? 'expired'
      : deriveAccountStatus(acct, remaining);

    const updatedAcct = await repos.seeEntitlement.updateAccountBalances(acct.id, {
      reservedQty: reserved,
      consumedQty: consumed,
      expiredQty: expired,
      adjustedQty: adjusted,
      refundedQty: refunded,
      remainingQty: remaining,
      status: nextStatus
    }, client);

    const ledgerEntry = await repos.seeEntitlement.insertLedgerEntry({
      entitlementAccountId: acct.id,
      entryType,
      quantity: qty,
      balanceAfter: remaining,
      referenceType,
      referenceId,
      saleReference: saleReference || null,
      executionReference: executionReference || null,
      idempotencyKey,
      reason,
      actor
    }, client);

    return { idempotentReplay: false, ledgerEntry, account: updatedAcct };
  };

  if (externalClient) {
    return executeInTx(externalClient);
  }
  return db.withTransaction(executeInTx);
}

async function getCustomerBalance(customerId) {
  const rawAccounts = await repos.seeEntitlement.findAccountsByCustomer(customerId);
  const accounts = rawAccounts.map(account => ({
    ...account,
    status: deriveAccountStatus(account, Number(account.remaining_qty || 0)),
    available_qty: account.valid_to && new Date(account.valid_to) < new Date() ? 0 : Number(account.remaining_qty || 0)
  }));
  const snapshots = await repos.seeEntitlement.findSnapshotsByCustomer(customerId);
  return { customerId, accounts, snapshots };
}

async function getEntitlementLedger(accountId, opts = {}) {
  return repos.seeEntitlement.findLedgerByAccount(accountId, opts);
}

module.exports = {
  createPurchase,
  mutateEntitlement,
  getCustomerBalance,
  getEntitlementLedger
};
