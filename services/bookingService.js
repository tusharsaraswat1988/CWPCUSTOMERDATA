/**
 * =========================================================================
 * CWP Detailers & Motors - Service Booking & Job Lifecycle Service
 * Module: Task 01.3 — Service Booking & Job Lifecycle
 *
 * Core Invariants:
 * 1. Booking a service and executing a service are separate events.
 * 2. Booking does not automatically assign staff/route unless explicitly specified.
 * 3. Package purchase does NOT create a booking.
 * 4. Package entitlement is NOT deducted upon booking.
 * 5. Package entitlement is consumed EXACTLY ONCE upon successful service completion.
 * 6. Cancellation or inability-to-complete does NOT consume package entitlement.
 * 7. Completed or cancelled jobs cannot be casually reopened, modified or re-completed.
 * 8. Full auditability with timestamps and actor attribution.
 * =========================================================================
 */

'use strict';

const crypto = require('crypto');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const serviceCatalog = require('./serviceCatalog');
const packageService = require('./packageService');
const staffCapabilityService = require('./staffCapabilityService');
const seeEntitlementService = require('./seeEntitlementService');
const seeStaffCapabilityService = require('./seeStaffCapabilityService');
const { isSeeManagedJob } = require('./seeExecutionService');

function normalizeMutationUuid(rawId) {
  if (rawId === undefined || rawId === null) return null;
  const s = String(rawId).trim();
  if (!s) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  const hex = crypto.createHash('sha256').update(`cwp-mut:${s}`).digest('hex');
  const ver = ((parseInt(hex.slice(12, 14), 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
  const varByte = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${ver}${hex.slice(14, 16)}-${varByte}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

async function checkJobIsSeeManaged(job, client = null) {
  if (!job) return false;
  if (isSeeManagedJob(job)) return true;
  if (isNeonActive() && repos.seeOperations) {
    const [addons, solar] = await Promise.all([
      typeof repos.seeOperations.findJobAddons === 'function'
        ? repos.seeOperations.findJobAddons(job.id, client)
        : Promise.resolve([]),
      typeof repos.seeOperations.findSolarVerificationByJob === 'function'
        ? repos.seeOperations.findSolarVerificationByJob(job.id, client)
        : Promise.resolve(null)
    ]);
    return isSeeManagedJob(job, {
      hasAddons: Array.isArray(addons) && addons.length > 0,
      hasSolar: Boolean(solar)
    });
  }
  return false;
}

const ALLOWED_BOOKING_SOURCES = ['admin', 'customer_request', 'verbal', 'call_center', 'app'];
function normalizeBookingSource(val) {
  const s = val ? String(val).trim().toLowerCase() : 'admin';
  return ALLOWED_BOOKING_SOURCES.includes(s) ? s : 'admin';
}

// In-memory mock store for test / offline execution
let localJobsStore = [];

function isNeonActive() {
  const isNeonConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isNeonConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_JOBS_TEST);
}

// Canonical lifecycle states and permitted forward transitions
const VALID_STATES = [
  'requested',
  'booked',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
  'unable_to_complete'
];

const TERMINAL_STATES = ['completed', 'cancelled', 'unable_to_complete'];

const PERMITTED_TRANSITIONS = {
  requested: ['booked', 'assigned', 'cancelled'],
  booked: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'cancelled', 'unable_to_complete'],
  in_progress: ['completed', 'unable_to_complete'], // Cancellation disallowed once work has commenced
  completed: [], // Terminal state
  cancelled: [], // Terminal state
  unable_to_complete: [] // Terminal state for this job instance
};

function isTerminalState(status) {
  return Boolean(status && TERMINAL_STATES.includes(String(status).toLowerCase()));
}

function isValidTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  const from = String(fromStatus).toLowerCase();
  const to = String(toStatus).toLowerCase();
  if (isTerminalState(from)) {
    return false; // Terminal states can never transition to any state, not even themselves
  }
  if (from === to) return true;
  const allowed = PERMITTED_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Find active packages belonging to customer eligible to cover a specific service
 */
async function getEligiblePackagesForBooking(arg1, arg2, arg3 = null) {
  let customerId, serviceCategoryId, vehicleId;
  if (typeof arg1 === 'object' && arg1 !== null) {
    customerId = arg1.customerId;
    serviceCategoryId = arg1.serviceCategoryId || arg1.serviceCategory;
    vehicleId = arg1.vehicleId || arg1.assetId || null;
  } else {
    customerId = arg1;
    serviceCategoryId = arg2;
    vehicleId = arg3;
  }

  if (!customerId) return [];

  const normCat = serviceCatalog.resolveCanonicalCategory(serviceCategoryId);
  const legacyPackages = await packageService.getCustomerPackages(customerId, { includeExhausted: false, includeCancelled: false });

  const eligibleLegacy = legacyPackages.filter(pkg => {
    // 1. Must be active with remaining balance
    const rem = pkg.remaining_quantity != null ? pkg.remaining_quantity : pkg.remainingQuantity;
    if (rem <= 0) return false;
    if ((pkg.status || '').toLowerCase() !== 'active') return false;

    // 2. Category match
    const pkgCat = serviceCatalog.resolveCanonicalCategory(pkg.service_category_id || pkg.serviceCategoryId);
    if (normCat && pkgCat !== normCat) return false;

    // 3. Vehicle match if package is asset-specific
    const pkgVehId = pkg.vehicle_id || pkg.vehicleId || pkg.asset_id || pkg.assetId;
    if (pkgVehId && vehicleId && pkgVehId !== vehicleId) {
      return false;
    }

    return true;
  }).map(p => ({ ...p, source: 'legacy' }));

  const eligibleSee = [];
  if (isNeonActive()) {
    try {
      const bal = await seeEntitlementService.getCustomerBalance(customerId);
      const accounts = Array.isArray(bal && bal.accounts) ? bal.accounts : [];
      const now = new Date();
      for (const acct of accounts) {
        if (acct.entitlement_kind === 'addon_credit' || !acct.service_id) continue;
        if ((acct.status || '').toLowerCase() !== 'active') continue;
        if (acct.valid_to && new Date(acct.valid_to) < now) continue;
        const rem = Number(acct.remaining_qty || 0);
        if (rem <= 0) continue;

        const rawAcctCat = acct.service_category_id || (
          acct.entitlement_kind === 'wash_credit' ? 'car_washing' :
          acct.entitlement_kind === 'solar_credit' ? 'solar_cleaning' :
          acct.entitlement_kind === 'dcc_credit' ? 'daily_car_cleaning' : null
        );
        if (normCat && rawAcctCat) {
          const resolvedAcctCat = serviceCatalog.resolveCanonicalCategory(rawAcctCat);
          const detailingMatch = rawAcctCat === 'detailing' && (normCat === 'interior_detailing' || normCat === 'exterior_detailing');
          if (!detailingMatch && resolvedAcctCat !== normCat) continue;
        }
        if (acct.vehicle_id && vehicleId && acct.vehicle_id !== vehicleId) continue;

        eligibleSee.push({
          id: acct.id,
          source: 'see',
          entitlementAccountId: acct.id,
          entitlement_account_id: acct.id,
          purchaseSnapshotId: acct.purchase_snapshot_id || null,
          purchase_snapshot_id: acct.purchase_snapshot_id || null,
          serviceId: acct.service_id,
          service_id: acct.service_id,
          packageCode: acct.package_code || acct.service_code || 'SEE_PKG',
          package_code: acct.package_code || acct.service_code || 'SEE_PKG',
          packageName: acct.package_name || acct.service_name || 'Service Entitlement',
          package_name: acct.package_name || acct.service_name || 'Service Entitlement',
          serviceCategoryId: rawAcctCat || normCat,
          service_category_id: rawAcctCat || normCat,
          vehicleId: acct.vehicle_id || null,
          vehicle_id: acct.vehicle_id || null,
          totalQuantity: Number(acct.purchased_qty || 0),
          total_quantity: Number(acct.purchased_qty || 0),
          reservedQuantity: Number(acct.reserved_qty || 0),
          reserved_quantity: Number(acct.reserved_qty || 0),
          consumedQuantity: Number(acct.consumed_qty || 0),
          consumed_quantity: Number(acct.consumed_qty || 0),
          remainingQuantity: rem,
          remaining_quantity: rem,
          expiryDate: acct.valid_to || null,
          expiry_date: acct.valid_to || null,
          status: acct.status
        });
      }
    } catch (seeErr) {
      console.warn('getEligiblePackagesForBooking SEE lookup warning:', seeErr.message);
    }
  }

  return [...eligibleSee, ...eligibleLegacy];
}

/**
 * Create a Service Booking (Transactional & Decoupled)
 */
async function createBooking(params = {}, actor = 'admin') {
  const customerId = params.customerId;
  const locationId = params.locationId || null;
  const vehicleId = params.vehicleId || params.assetId || null;
  const serviceCategoryId = params.serviceCategoryId || params.serviceCategory || 'car_washing';
  const serviceIdParam = params.serviceId || null;
  const serviceType = params.serviceType;
  const packageId = params.packageId || null;
  const entitlementAccountIdParam = params.entitlementAccountId || null;
  const packageCode = params.packageCode || null;
  const packageDetails = params.packageDetails || null;
  const seaterType = params.seaterType || null;
  const panelCount = params.panelCount || null;
  const siteDetails = params.siteDetails || null;
  const scheduledDate = params.scheduledDate || null;
  const scheduledTime = params.scheduledTime || params.preferredTimeSlot || null;
  const sequenceOrder = params.sequenceOrder || null;
  const staffId = params.staffId || params.assignedCleanerId || params.assignedStaffId || null;
  const specialInstructions = params.specialInstructions || null;
  const servicePrice = params.servicePrice != null ? params.servicePrice : 0.00;
  const paymentStatus = params.paymentStatus || null;
  const bookingSource = normalizeBookingSource(params.bookingSource);
  const city = params.city || null;
  const zone = params.zone || null;

  if (!customerId) {
    throw new Error('Customer ID is required to create a booking.');
  }

  if (!serviceType || !String(serviceType).trim()) {
    throw new Error('Service type / name is required to create a booking.');
  }

  const normCat = serviceCatalog.resolveCanonicalCategory(serviceCategoryId);
  if (!normCat) {
    throw new Error(`Invalid service category: '${serviceCategoryId}'`);
  }

  if (entitlementAccountIdParam || params.purchaseSnapshotId) {
    throw new Error('SEE entitlement bookings must use canonical seeExecutionService.createCanonicalJob.');
  }

  // 1. Validate Service & Asset combinations
  const isSolar = normCat === 'solar_cleaning';

  if (isSolar) {
    const panels = parseInt(panelCount, 10);
    if (!isNaN(panels) && panels <= 0) {
      throw new Error('Solar cleaning booking requires a positive panel count.');
    }
  }

  // 2. Legacy Package Validation (SEE entitlement bookings are guarded above)
  let linkedPackage = null;
  if (packageId) {
    const custPackages = await packageService.getCustomerPackages(customerId);
    linkedPackage = custPackages.find(p => p.id === packageId) || null;

    if (linkedPackage) {
      if ((linkedPackage.status || '').toLowerCase() !== 'active') {
        throw new Error(`Cannot book against package '${linkedPackage.package_name || linkedPackage.packageName}' with status '${linkedPackage.status}'.`);
      }

      const rem = linkedPackage.remaining_quantity != null ? linkedPackage.remaining_quantity : linkedPackage.remainingQuantity;
      if (rem <= 0) {
        throw new Error(`Package '${linkedPackage.package_name || linkedPackage.packageName}' has zero remaining entitlement.`);
      }

      const pkgCat = serviceCatalog.resolveCanonicalCategory(linkedPackage.service_category_id || linkedPackage.serviceCategoryId);
      if (pkgCat !== normCat) {
        throw new Error(`Package category '${linkedPackage.service_category || pkgCat}' is not valid for '${serviceCategoryId}'.`);
      }

      const pkgVehId = linkedPackage.vehicle_id || linkedPackage.vehicleId || linkedPackage.asset_id || linkedPackage.assetId;
      if (pkgVehId && vehicleId && pkgVehId !== vehicleId) {
        throw new Error(`Package is restricted to vehicle '${pkgVehId}', but '${vehicleId}' was selected.`);
      }
    } else {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(packageId));
      if (isUuid && isNeonActive() && repos.seeEntitlement && typeof repos.seeEntitlement.findAccountById === 'function') {
        const seeAcct = await repos.seeEntitlement.findAccountById(packageId);
        if (seeAcct) {
          throw new Error('SEE entitlement bookings must use canonical seeExecutionService.createCanonicalJob.');
        }
      }
      throw new Error(`Package '${packageId}' does not belong to this customer or does not exist.`);
    }
  }

  // Validate staff capability if staff is assigned (local fallback vs Neon)
  let resolvedLocalStaff = null;
  if (staffId && !isNeonActive()) {
    let staffObj = null;
    if (repos.staff && typeof repos.staff.findById === 'function') {
      try {
        staffObj = await repos.staff.findById(staffId);
        if (!staffObj && typeof repos.staff.findByStaffCode === 'function') {
          staffObj = await repos.staff.findByStaffCode(staffId);
        }
      } catch (err) {
        // If DB is unconfigured in test mode and repos.staff throws, ignore
      }
    }
    if (staffObj) {
      if (!staffObj.is_active) {
        throw new Error(`Cannot assign booking to deactivated staff member '${staffObj.name}'.`);
      }
      if (!staffCapabilityService.hasServiceCapability(staffObj, normCat)) {
        const eff = staffCapabilityService.getStaffEffectiveCapabilities(staffObj);
        const catMeta = serviceCatalog.getCategory(normCat);
        const catName = catMeta ? catMeta.name : normCat;
        throw new Error(`Staff member '${staffObj.name}' is classified as '${eff.workType}' and does not have the capability for '${catName}'.`);
      }
      resolvedLocalStaff = staffObj;
    }
  }

  // Determine initial status: if staff assigned right away -> 'assigned', else 'booked'
  const initialStatus = staffId ? 'assigned' : 'booked';
  const finalPaymentStatus = linkedPackage ? 'package_covered' : (paymentStatus || 'pending');

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      // Validate customer existence
      const customer = await repos.customers.findById(customerId, client);
      if (!customer) {
        throw new Error(`Customer with ID '${customerId}' not found.`);
      }

      // Validate location (fallback to first non-primary location if primary missing)
      let targetLocId = locationId;
      if (!targetLocId) {
        const primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customerId, client);
        targetLocId = primaryLoc ? primaryLoc.id : null;
      }
      if (!targetLocId) {
        const allLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
        targetLocId = allLocs && allLocs[0] ? allLocs[0].id : null;
      }
      if (!targetLocId) {
        throw new Error('Customer must have a service location before creating a booking.');
      }
      const loc = await repos.serviceLocations.findById(targetLocId, client);
      if (!loc || loc.customer_id !== customer.id) {
        throw new Error('Selected location does not belong to this customer.');
      }

      // Validate vehicle
      if (vehicleId) {
        const veh = await repos.vehicles.findById(vehicleId, client);
        if (!veh || veh.customer_id !== customer.id) {
          throw new Error('Selected vehicle does not belong to this customer.');
        }
      }

      const effectiveServiceId = serviceIdParam || null;
      let svc = null;
      if (effectiveServiceId) {
        svc = await repos.seeCatalogue.findServiceById(effectiveServiceId, client);
      }

      // Resolve & validate staff eligibility inside transaction with FOR UPDATE lock
      let resolvedStaffObj = null;
      if (staffId) {
        resolvedStaffObj = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
        if (!resolvedStaffObj) {
          const allStaff = await repos.staff.findAll({ client });
          const targetLower = String(staffId).trim().toLowerCase();
          resolvedStaffObj = (allStaff || []).find(s =>
            (s.name && s.name.toLowerCase() === targetLower) ||
            (s.staff_code && s.staff_code.toLowerCase() === targetLower)
          ) || null;
        }
        if (!resolvedStaffObj) {
          throw new Error(`Staff member '${staffId}' not found.`);
        }
        const reqEquip = Array.isArray(svc && svc.execution_config && svc.execution_config.required_equipment)
          ? svc.execution_config.required_equipment
          : [];
        const elig = await seeStaffCapabilityService.evaluateStaffEligibility(resolvedStaffObj.id, {
          serviceId: svc ? svc.id : effectiveServiceId,
          serviceCode: svc ? svc.service_code : null,
          serviceCategoryId: normCat,
          city,
          zone,
          scheduledDate,
          scheduledTime,
          durationMinutes: (svc && svc.expected_duration_minutes) || 60,
          allowConcurrent: Boolean(svc && svc.execution_config && svc.execution_config.allow_concurrent),
          requiredEquipment: reqEquip
        }, client);
        if (!elig.eligible) {
          throw new Error(elig.reasons.join('; '));
        }
      }

      const jobRecord = await repos.serviceJobs.createJob({
        customerId: customer.id,
        vehicleId: vehicleId || null,
        locationId: targetLocId,
        serviceCategoryId: normCat,
        serviceId: effectiveServiceId,
        serviceType: serviceType || normCat,
        packageDetails: packageDetails || (linkedPackage ? (linkedPackage.package_name || linkedPackage.packageName) : null),
        packageCode: packageCode || (linkedPackage ? (linkedPackage.package_code || linkedPackage.packageCode) : null),
        packageId: linkedPackage ? linkedPackage.id : null,
        seaterType: seaterType || null,
        panelCount: isSolar ? (parseInt(panelCount, 10) || 10) : null,
        siteDetails: isSolar ? (siteDetails || { panelCount: parseInt(panelCount, 10) || 10, roofType: 'RCC' }) : null,
        scheduledDate: scheduledDate || null,
        scheduledTime: scheduledTime || null,
        sequenceOrder: sequenceOrder != null ? parseInt(sequenceOrder, 10) : null,
        status: initialStatus,
        specialInstructions: specialInstructions ? String(specialInstructions).trim() : null,
        servicePrice: linkedPackage ? 0.00 : (parseFloat(servicePrice) || 0.00),
        paymentStatus: finalPaymentStatus,
        bookingSource,
        city,
        zone,
        entitlementConsumed: false
      }, client);

      // Staff assignment if provided
      if (resolvedStaffObj) {
        await repos.staffAssignments.assignStaffToJob({
          staffId: resolvedStaffObj.id,
          jobId: jobRecord.id,
          assignedBy: actor || 'admin'
        }, client);
      }

      return {
        ...jobRecord,
        success: true,
        job: jobRecord,
        message: `Booking created successfully in '${initialStatus}' status.`
      };
    });
  }

  // Local fallback
  const jId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const localJob = {
    id: jId,
    customer_id: customerId,
    location_id: locationId || 'loc_primary',
    vehicle_id: vehicleId || null,
    service_category_id: normCat,
    service_type: serviceType || normCat,
    package_details: packageDetails || (linkedPackage ? linkedPackage.package_name : null),
    package_code: packageCode || (linkedPackage ? linkedPackage.package_code : null),
    package_id: linkedPackage ? linkedPackage.id : null,
    seater_type: seaterType || null,
    panel_count: isSolar ? (parseInt(panelCount, 10) || 10) : null,
    site_details: isSolar ? (siteDetails || { panelCount: parseInt(panelCount, 10) || 10 }) : null,
    scheduled_date: scheduledDate || null,
    scheduled_time: scheduledTime || null,
    sequence_order: sequenceOrder != null ? parseInt(sequenceOrder, 10) : null,
    status: initialStatus,
    staff_id: staffId || null,
    special_instructions: specialInstructions ? String(specialInstructions).trim() : null,
    service_price: linkedPackage ? 0.00 : (parseFloat(servicePrice) || 0.00),
    payment_status: finalPaymentStatus,
    booking_source: bookingSource || 'admin',
    entitlement_consumed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localJobsStore.unshift(localJob);
  return {
    ...localJob,
    success: true,
    job: localJob,
    message: `Booking created successfully in '${initialStatus}' status.`
  };
}

/**
 * Start a service job (Move to in_progress)
 */
async function startJob(arg1, arg2 = {}) {
  let jobId, opts;
  if (typeof arg1 === 'object' && arg1 !== null) {
    jobId = arg1.jobId || arg1.id;
    opts = arg1;
  } else {
    jobId = arg1;
    opts = arg2 || {};
  }

  const beforePhotos = opts.beforePhotos || [];
  const startedAt = opts.startedAt || null;
  const staffId = opts.staffId || null;
  const actor = opts.actor || 'staff';

  if (!jobId) {
    throw new Error('Job ID is required to start service.');
  }

  const stAt = startedAt || new Date().toISOString();

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      const existing = await repos.serviceJobs.findByIdForUpdate(jobId, client);
      if (!existing) {
        throw new Error(`Job '${jobId}' not found.`);
      }
      if (await checkJobIsSeeManaged(existing, client)) {
        throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be started via seeExecutionService.`);
      }

      if (isTerminalState(existing.status)) {
        throw new Error(`Cannot start job in ${existing.status} status (terminal).`);
      }

      if (!isValidTransition(existing.status, 'in_progress')) {
        throw new Error(`Cannot start service: invalid transition from '${existing.status}' to 'in_progress'.`);
      }

      const updated = await repos.serviceJobs.startJob(jobId, {
        beforePhotos: Array.isArray(beforePhotos) ? beforePhotos : [],
        startedAt: stAt
      }, client);

      if (!updated) {
        throw new Error(`Cannot start service: job '${jobId}' status changed concurrently.`);
      }

      return {
        ...updated,
        success: true,
        job: updated,
        message: 'Service marked in progress.'
      };
    });
  }

  // Local fallback
  const job = localJobsStore.find(j => j.id === jobId);
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }
  if (await checkJobIsSeeManaged(job)) {
    throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be started via seeExecutionService.`);
  }
  if (isTerminalState(job.status)) {
    throw new Error(`Cannot start job in ${job.status} status (terminal).`);
  }
  if (!isValidTransition(job.status, 'in_progress')) {
    throw new Error(`Cannot start service: invalid transition from '${job.status}' to 'in_progress'.`);
  }

  job.status = 'in_progress';
  job.started_at = stAt;
  job.before_photos = beforePhotos;
  job.updated_at = new Date().toISOString();

  return {
    ...job,
    success: true,
    job,
    message: 'Service marked in progress.'
  };
}

/**
 * Complete a service job (Move to completed)
 * CRITICAL INVARIANT: Consumes linked package entitlement EXACTLY ONCE.
 */
async function completeJob(arg1, arg2 = {}) {
  let jobId, opts;
  if (typeof arg1 === 'object' && arg1 !== null) {
    jobId = arg1.jobId || arg1.id;
    opts = arg1;
  } else {
    jobId = arg1;
    opts = arg2 || {};
  }

  const afterPhotos = opts.afterPhotos || [];
  const completedAt = opts.completedAt || null;
  const completionNotes = opts.completionNotes || opts.completionRemarks || null;
  const staffId = opts.staffId || null;
  const actor = opts.actor || 'staff';
  const clientMutationId = opts.clientMutationId || null;
  const completedAtDevice = opts.completedAtDevice || completedAt || null;
  const source = opts.source || null;

  if (!jobId) {
    throw new Error('Job ID is required to complete service.');
  }

  const compAt = completedAt || new Date().toISOString();

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      // 1. Lock job row
      const job = await repos.serviceJobs.findByIdForUpdate(jobId, client);
      if (!job) {
        throw new Error(`Job '${jobId}' not found.`);
      }

      if (await checkJobIsSeeManaged(job, client)) {
        throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be completed via seeExecutionService.completeExecution.`);
      }

      const normMutationId = normalizeMutationUuid(clientMutationId);
      if (normMutationId && repos.serviceLogs && typeof repos.serviceLogs.findByClientMutationId === 'function') {
        const existingByMut = await repos.serviceLogs.findByClientMutationId(normMutationId, client);
        if (existingByMut && String(existingByMut.job_id || '') !== String(jobId)) {
          throw new Error(`clientMutationId '${clientMutationId}' has already been used for another job.`);
        }
      }

      if (job.status === 'completed') {
        const existingLog = (repos.serviceLogs && typeof repos.serviceLogs.findByJobId === 'function')
          ? await repos.serviceLogs.findByJobId(jobId, client)
          : null;
        if (normMutationId && existingLog && existingLog.client_mutation_id === normMutationId) {
          return {
            ...job,
            success: true,
            job,
            serviceLog: existingLog,
            entitlementDeducted: Boolean(job.entitlement_consumed),
            idempotent: true,
            message: 'Service already completed (idempotent replay).'
          };
        }
        throw new Error(`Cannot complete job in ${job.status} status (terminal).`);
      }

      if (isTerminalState(job.status)) {
        throw new Error(`Cannot complete job in ${job.status} status (terminal).`);
      }

      if (!isValidTransition(job.status, 'completed')) {
        throw new Error(`Cannot complete service: invalid transition from '${job.status}' to 'completed'.`);
      }

      let entitlementDeducted = false;
      let redemptionRecord = null;

      // 2. Exact-once package entitlement consumption
      if (job.package_id && !job.entitlement_consumed) {
        const redResult = await packageService.redeemPackage({
          packageId: job.package_id,
          quantity: 1,
          vehicleId: job.vehicle_id,
          locationId: job.location_id,
          serviceJobId: job.id,
          notes: `Auto-redeemed upon completion of job #${job.id.slice(0, 8)}`,
          adminUser: actor,
          client
        }, actor, client);
        entitlementDeducted = true;
        redemptionRecord = redResult.redemption || redResult.redemptionLog;
      }

      // 3. Mark job completed
      const afterList = Array.isArray(afterPhotos) ? afterPhotos : [];
      const cleanNotes = completionNotes ? String(completionNotes).trim() : null;
      const updatedJob = await repos.serviceJobs.completeJob(job.id, {
        afterPhotos: afterList,
        completedAt: compAt,
        completionNotes: cleanNotes
      }, client);
      if (!updatedJob) {
        throw new Error(`Cannot complete job '${job.id}' in status '${job.status}'.`);
      }

      if (entitlementDeducted) {
        await repos.serviceJobs.updateJob(job.id, { entitlementConsumed: true }, client);
        updatedJob.entitlement_consumed = true;
      }

      // 4. Atomic service_logs insert inside the same transaction
      let resolvedStaffUuid = null;
      if (staffId) {
        const sRec = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
        if (!sRec) {
          throw new Error(`Staff '${staffId}' not found.`);
        }
        resolvedStaffUuid = sRec.id;
      } else if (repos.staffAssignments && typeof repos.staffAssignments.findActiveByJobId === 'function') {
        const activeAssign = await repos.staffAssignments.findActiveByJobId(job.id, client);
        resolvedStaffUuid = activeAssign ? activeAssign.staff_id : null;
      }

      let serviceLog = (repos.serviceLogs && typeof repos.serviceLogs.findByJobId === 'function')
        ? await repos.serviceLogs.findByJobId(job.id, client)
        : null;
      if (!serviceLog && repos.serviceLogs && typeof repos.serviceLogs.recordCompletion === 'function') {
        const completedAtStr = completedAtDevice || updatedJob.completed_at || compAt;
        const istDate = repos.serviceLogs.computeIstServiceDate(completedAtStr);
        const logRes = await repos.serviceLogs.recordCompletion({
          clientMutationId: normMutationId || crypto.randomUUID(),
          staffId: resolvedStaffUuid,
          jobId: job.id,
          serviceDate: istDate,
          status: 'completed',
          completedAtDevice: completedAtStr,
          notes: cleanNotes || 'Special job completed with photo proof',
          photoUrl: afterList[0] || null,
          source: source || (resolvedStaffUuid ? 'staff_portal' : 'admin_manual')
        }, client);
        serviceLog = logRes ? logRes.log : null;
      }

      return {
        ...updatedJob,
        success: true,
        job: updatedJob,
        serviceLog,
        entitlementDeducted,
        redemptionRecord,
        idempotent: false,
        message: 'Service completed successfully.'
      };
    });
  }

  // Local fallback
  const job = localJobsStore.find(j => j.id === jobId);
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }
  if (await checkJobIsSeeManaged(job)) {
    throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be completed via seeExecutionService.completeExecution.`);
  }
  const normMutationId = normalizeMutationUuid(clientMutationId);
  if (normMutationId) {
    const conflictJob = localJobsStore.find(other => other.id !== job.id && other._completionMutationId === normMutationId);
    if (conflictJob) {
      throw new Error(`clientMutationId '${clientMutationId}' has already been used for another job.`);
    }
  }
  if (job.status === 'completed') {
    if (normMutationId && job._completionMutationId === normMutationId) {
      return {
        ...job,
        success: true,
        job,
        entitlementDeducted: Boolean(job.entitlement_consumed),
        idempotent: true,
        message: 'Service already completed (idempotent replay).'
      };
    }
    throw new Error(`Cannot complete job in ${job.status} status (terminal).`);
  }
  if (isTerminalState(job.status)) {
    throw new Error(`Cannot complete job in ${job.status} status (terminal).`);
  }
  if (!isValidTransition(job.status, 'completed')) {
    throw new Error(`Cannot complete service: invalid transition from '${job.status}' to 'completed'.`);
  }

  let entitlementDeducted = false;
  let redemptionRecord = null;

  // Exact-once package entitlement consumption
  if (job.package_id && !job.entitlement_consumed) {
    const redRes = await packageService.redeemPackage({
      packageId: job.package_id,
      quantity: 1,
      vehicleId: job.vehicle_id,
      locationId: job.location_id,
      serviceJobId: job.id,
      notes: `Auto-redeemed upon completion of job #${job.id.slice(0, 8)}`,
      adminUser: actor
    });
    job.entitlement_consumed = true;
    entitlementDeducted = true;
    redemptionRecord = redRes.redemption || redRes.redemptionLog;
  }

  job.status = 'completed';
  job.completed_at = compAt;
  job.after_photos = afterPhotos;
  job.completion_notes = completionNotes;
  job._completionMutationId = normMutationId;
  job.updated_at = new Date().toISOString();

  return {
    ...job,
    success: true,
    job,
    entitlementDeducted,
    redemptionRecord,
    idempotent: false,
    message: 'Service completed successfully.'
  };
}

/**
 * Cancel a service booking
 * Invariant: Never consumes package entitlement.
 */
async function cancelBooking(arg1, arg2 = {}) {
  let jobId, opts;
  if (typeof arg1 === 'object' && arg1 !== null) {
    jobId = arg1.jobId || arg1.id;
    opts = arg1;
  } else {
    jobId = arg1;
    opts = arg2 || {};
  }

  const cancellationReason = opts.cancellationReason || opts.reason || 'Cancelled by customer';
  const cancellationRemarks = opts.cancellationRemarks || null;
  const cancelledBy = opts.cancelledBy || null;
  const actor = opts.actor || 'admin';

  if (!jobId) {
    throw new Error('Job ID is required to cancel booking.');
  }

  const cBy = cancelledBy || actor || 'admin';
  const cAt = new Date().toISOString();

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      const existing = await repos.serviceJobs.findByIdForUpdate(jobId, client);
      if (!existing) {
        throw new Error(`Job '${jobId}' not found.`);
      }
      if (await checkJobIsSeeManaged(existing, client)) {
        throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be cancelled via seeExecutionService.terminateJobWithoutCompletion.`);
      }

      if (isTerminalState(existing.status)) {
        throw new Error(`Cannot cancel job in ${existing.status} status (terminal).`);
      }

      if (existing.status === 'in_progress') {
        throw new Error(`Cannot cancel service job after work has commenced (in_progress). Use 'unable_to_complete' instead.`);
      }

      if (!isValidTransition(existing.status, 'cancelled')) {
        throw new Error(`Cannot cancel: invalid transition from '${existing.status}' to 'cancelled'.`);
      }

      const cancelled = await repos.serviceJobs.cancelJob(jobId, {
        cancellationReason,
        cancellationRemarks,
        cancelledAt: cAt,
        cancelledBy: cBy
      }, client);

      if (!cancelled) {
        throw new Error(`Cannot cancel job '${jobId}' in status '${existing.status}'.`);
      }

      return {
        ...cancelled,
        success: true,
        job: cancelled,
        message: 'Booking cancelled successfully. Zero entitlement consumed.'
      };
    });
  }

  // Local fallback
  const job = localJobsStore.find(j => j.id === jobId);
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }
  if (await checkJobIsSeeManaged(job)) {
    throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be cancelled via seeExecutionService.terminateJobWithoutCompletion.`);
  }
  if (isTerminalState(job.status)) {
    throw new Error(`Cannot cancel job in ${job.status} status (terminal).`);
  }
  if (job.status === 'in_progress') {
    throw new Error(`Cannot cancel service job after work has commenced (in_progress). Use 'unable_to_complete' instead.`);
  }
  if (!isValidTransition(job.status, 'cancelled')) {
    throw new Error(`Cannot cancel: invalid transition from '${job.status}' to 'cancelled'.`);
  }

  job.status = 'cancelled';
  job.cancellation_reason = cancellationReason;
  job.cancellation_remarks = cancellationRemarks;
  job.cancelled_at = cAt;
  job.cancelled_by = cBy;
  job.updated_at = cAt;

  return {
    ...job,
    success: true,
    job,
    message: 'Booking cancelled successfully. Zero entitlement consumed.'
  };
}

/**
 * Mark a service job as unable to complete / failed
 * Invariant: Zero entitlement consumed.
 */
async function failJob(arg1, arg2 = {}) {
  let jobId, opts;
  if (typeof arg1 === 'object' && arg1 !== null) {
    jobId = arg1.jobId || arg1.id;
    opts = arg1;
  } else {
    jobId = arg1;
    opts = arg2 || {};
  }

  const failureReason = opts.failureReason || opts.reason || 'Customer not available / Premises locked';
  const failureRemarks = opts.failureRemarks || null;
  const failedBy = opts.failedBy || null;
  const failedAt = opts.failedAt || null;
  const actor = opts.actor || 'staff';

  if (!jobId) {
    throw new Error('Job ID is required to record failure.');
  }

  const fBy = failedBy || actor || 'staff';
  const fAt = failedAt || new Date().toISOString();

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      const existing = await repos.serviceJobs.findByIdForUpdate(jobId, client);
      if (!existing) {
        throw new Error(`Job '${jobId}' not found.`);
      }
      if (await checkJobIsSeeManaged(existing, client)) {
        throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be terminated via seeExecutionService.terminateJobWithoutCompletion.`);
      }
      if (isTerminalState(existing.status)) {
        throw new Error(`Cannot fail job in ${existing.status} status (terminal).`);
      }
      if (!isValidTransition(existing.status, 'unable_to_complete')) {
        throw new Error(`Cannot mark unable to complete: invalid transition from '${existing.status}'.`);
      }

      const failed = await repos.serviceJobs.failJob(jobId, {
        failureReason,
        failureRemarks,
        failedAt: fAt,
        failedBy: fBy
      }, client);

      if (!failed) {
        throw new Error(`Cannot fail job '${jobId}' in status '${existing.status}'.`);
      }

      return {
        ...failed,
        success: true,
        job: failed,
        message: 'Service marked unable to complete. Zero entitlement consumed.'
      };
    });
  }

  // Local fallback
  const job = localJobsStore.find(j => j.id === jobId);
  if (!job) {
    throw new Error(`Job '${jobId}' not found.`);
  }
  if (await checkJobIsSeeManaged(job)) {
    throw new Error(`Job '${jobId}' is a canonical SEE-managed job and must be terminated via seeExecutionService.terminateJobWithoutCompletion.`);
  }
  if (isTerminalState(job.status)) {
    throw new Error(`Cannot fail job in ${job.status} status (terminal).`);
  }
  if (!isValidTransition(job.status, 'unable_to_complete')) {
    throw new Error(`Cannot mark unable to complete: invalid transition from '${job.status}'.`);
  }

  job.status = 'unable_to_complete';
  job.failure_reason = failureReason;
  job.failure_remarks = failureRemarks;
  job.failed_at = fAt;
  job.failed_by = fBy;
  job.updated_at = fAt;

  return {
    ...job,
    success: true,
    job,
    message: 'Service marked unable to complete. Zero entitlement consumed.'
  };
}

/**
 * Get customer bookings and full service history partitioned
 */
async function getCustomerBookingsAndHistory(param) {
  const customerId = (typeof param === 'object' && param !== null) ? (param.customerId || param.id) : param;
  if (!customerId) return { jobs: [], upcoming: [], history: [], all: [] };

  let rawJobs = [];
  if (isNeonActive()) {
    rawJobs = await repos.serviceJobs.findByCustomerId(customerId);
  } else {
    rawJobs = localJobsStore.filter(j => (j.customer_id === customerId || j.customerId === customerId) && !j.deleted_at);
  }

  const upcoming = [];
  const history = [];

  rawJobs.forEach(job => {
    const st = (job.status || '').toLowerCase();
    const isPast = ['completed', 'cancelled', 'unable_to_complete', 'failed'].includes(st);
    if (isPast) {
      history.push(job);
    } else {
      upcoming.push(job);
    }
  });

  return {
    jobs: rawJobs,
    all: rawJobs,
    upcoming,
    history
  };
}

function __resetLocalStore() {
  localJobsStore = [];
}

module.exports = {
  VALID_STATES,
  PERMITTED_TRANSITIONS,
  isValidTransition,
  getEligiblePackagesForBooking,
  createBooking,
  startJob,
  completeJob,
  cancelBooking,
  failJob,
  getCustomerBookingsAndHistory,
  __resetLocalStore
};
