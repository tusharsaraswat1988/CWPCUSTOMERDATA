/**
 * =========================================================================
 * CWP Detailers & Motors - Daily Car Cleaning (DCC) Core Operations Service
 * Module: Task 01.4 — Daily Car Cleaning Core Operations
 *
 * Core Invariants:
 * 1. DCC is a recurring operational service, independent of one-off bookings and packages.
 * 2. DCC subscription represents customer eligibility; daily record represents actual execution.
 * 3. Daily cleaning completion is recorded only when cleaning actually occurs.
 * 4. Non-completion (customer absent, vehicle not available, skip, unable to complete)
 *    is never recorded as completed and is permanently traceable.
 * 5. Exactly-once daily completion per vehicle per operational date (Asia/Kolkata).
 * 6. Zero deduction of car wash package entitlements; zero creation of service jobs.
 * 7. Active subscriptions are never cancelled or overwritten by on-demand service sales.
 * =========================================================================
 */

'use strict';

const crypto = require('crypto');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const staffCapabilityService = require('./staffCapabilityService');

// In-memory mock stores for isolated test / offline execution
let localSubscriptionsStore = [];
let localSubscriptionVehiclesStore = [];
let localServiceLogsStore = [];
let localStaffAssignmentsStore = [];

function isNeonActive() {
  const isNeonConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isNeonConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_DCC_TEST);
}

/**
 * Valid operational outcomes / statuses for a Daily Clean
 */
const DCC_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CAR_NOT_PRESENT: 'car_not_present',
  CUSTOMER_ABSENT: 'customer_absent',
  VEHICLE_NOT_AVAILABLE: 'vehicle_not_available',
  SKIPPED: 'skipped',
  UNABLE_TO_COMPLETE: 'unable_to_complete'
};

const VALID_DCC_STATUSES = Object.values(DCC_STATUSES);

/**
 * Standard Asia/Kolkata date helper (YYYY-MM-DD)
 */
function getIstDate(dateObjOrString = null) {
  const d = dateObjOrString ? new Date(dateObjOrString) : new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Validates DCC service eligibility for a specific subscription, vehicle, and operational date
 *
 * Rules:
 * - Subscription must exist and have status 'active'
 * - Not deleted
 * - operationalDate must be >= start_date
 * - If end_date is set, operationalDate must be <= end_date
 * - Vehicle must be linked to the subscription
 */
async function validateDccEligibility({ subscriptionId, vehicleId = null, customerId = null, operationalDate = null }) {
  const targetDate = operationalDate || getIstDate();

  if (!subscriptionId) {
    return { eligible: false, reason: 'Subscription ID is required.' };
  }

  if (isNeonActive()) {
    const sub = await repos.subscriptions.findById(subscriptionId);
    if (!sub) {
      return { eligible: false, reason: `DCC subscription '${subscriptionId}' not found.` };
    }
    if (sub.deleted_at) {
      return { eligible: false, reason: 'DCC subscription has been deleted.' };
    }
    if (sub.status !== 'active') {
      return { eligible: false, reason: `DCC subscription is not active (status: '${sub.status}').` };
    }
    if (customerId && sub.customer_id !== customerId) {
      return { eligible: false, reason: `DCC subscription does not belong to customer '${customerId}'.` };
    }

    const startStr = sub.start_date ? (sub.start_date.toISOString ? sub.start_date.toISOString().split('T')[0] : String(sub.start_date).split('T')[0]) : null;
    if (startStr && targetDate < startStr) {
      return { eligible: false, reason: `DCC subscription has not started yet (starts on ${startStr}, requested for ${targetDate}).` };
    }

    const endStr = sub.end_date ? (sub.end_date.toISOString ? sub.end_date.toISOString().split('T')[0] : String(sub.end_date).split('T')[0]) : null;
    if (endStr && targetDate > endStr) {
      return { eligible: false, reason: `DCC subscription expired on ${endStr} (requested for ${targetDate}).` };
    }

    if (vehicleId) {
      const svList = await repos.subscriptionVehicles.findBySubscriptionId(subscriptionId);
      const vehLinked = svList.some(sv => sv.vehicle_id === vehicleId);
      if (!vehLinked) {
        return { eligible: false, reason: `Vehicle '${vehicleId}' is not enrolled under subscription '${subscriptionId}'.` };
      }
    }

    return { eligible: true, subscription: sub, operationalDate: targetDate };
  }

  // Local fallback
  const sub = localSubscriptionsStore.find(s => s.id === subscriptionId && !s.deleted_at);
  if (!sub) {
    return { eligible: false, reason: `DCC subscription '${subscriptionId}' not found.` };
  }
  if (sub.status !== 'active') {
    return { eligible: false, reason: `DCC subscription is not active (status: '${sub.status}').` };
  }
  if (customerId && sub.customer_id !== customerId) {
    return { eligible: false, reason: `DCC subscription does not belong to customer '${customerId}'.` };
  }

  const startStr = sub.start_date || sub.startDate;
  if (startStr && targetDate < startStr) {
    return { eligible: false, reason: `DCC subscription has not started yet (starts on ${startStr}, requested for ${targetDate}).` };
  }

  const endStr = sub.end_date || sub.endDate;
  if (endStr && targetDate > endStr) {
    return { eligible: false, reason: `DCC subscription expired on ${endStr} (requested for ${targetDate}).` };
  }

  if (vehicleId) {
    const hasEnrollmentsForSub = localSubscriptionVehiclesStore.some(sv => sv.subscription_id === subscriptionId);
    if (hasEnrollmentsForSub) {
      const vehLinked = localSubscriptionVehiclesStore.some(
        sv => sv.subscription_id === subscriptionId && sv.vehicle_id === vehicleId
      );
      if (!vehLinked) {
        return { eligible: false, reason: `Vehicle '${vehicleId}' is not enrolled under subscription '${subscriptionId}'.` };
      }
    }
  }

  return { eligible: true, subscription: sub, operationalDate: targetDate };
}

/**
 * Create a new DCC Subscription for a Customer
 */
async function createSubscription(params = {}, actor = 'admin', externalClient = null) {
  const customerId = params.customerId;
  if (!customerId) {
    throw new Error('Customer ID is required to create a DCC subscription.');
  }

  const packageName = params.packageName || params.packageType || 'DCC ONLY';
  const startDate = params.startDate || getIstDate();
  const endDate = params.endDate || null;
  const packagesPurchased = parseInt(params.packagesPurchased || 1, 10) || 1;
  const rotationType = params.rotationType || 'none';
  const rotationNotes = params.rotationNotes || null;
  const rawVehicles = Array.isArray(params.vehicles) ? params.vehicles :
                      (Array.isArray(params.vehicleIds) ? params.vehicleIds :
                      (params.vehicleId ? [{ vehicleId: params.vehicleId, locationId: params.locationId }] : []));
  const vehicles = rawVehicles.map(v => typeof v === 'string' ? { vehicleId: v, locationId: params.locationId } : v);

  if (isNeonActive()) {
    const provision = async (client) => {
      const sub = await repos.subscriptions.createSubscription({
        customerId,
        serviceCategoryId: 'daily_car_cleaning',
        packageName,
        packagesPurchased,
        rotationType,
        rotationNotes,
        status: 'active',
        startDate,
        endDate,
        hybridMembershipId: params.hybridMembershipId || null
      }, client);

      // Link vehicles
      for (const v of vehicles) {
        const vId = typeof v === 'object' ? v.vehicleId || v.id : v;
        const locId = typeof v === 'object' ? v.locationId : null;
        if (vId) {
          await repos.subscriptionVehicles.addVehicleToSubscription({
            subscriptionId: sub.id,
            customerId,
            vehicleId: vId,
            locationId: locId || null,
            scheduleTag: v.scheduleTag || 'daily'
          }, client);
        }
      }

      // Assign staff if provided
      if (params.staffId) {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: params.staffId,
          subscriptionId: sub.id,
          assignedBy: actor
        }, client);
      }

      await repos.auditLogs.logChange({
        entityType: 'dcc_subscription',
        entityId: sub.id,
        action: 'create_subscription',
        changedBy: actor,
        afterState: { customerId, packageName, startDate, endDate, status: 'active' }
      }, client);

      return {
        ...sub,
        success: true,
        subscription: sub,
        message: 'DCC subscription activated successfully.'
      };
    };
    return externalClient ? provision(externalClient) : db.withTransaction(provision);
  }

  // Local fallback
  const subId = 'dcc_sub_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const localSub = {
    id: subId,
    customer_id: customerId,
    service_category_id: 'daily_car_cleaning',
    package_name: packageName,
    packages_purchased: packagesPurchased,
    rotation_type: rotationType,
    rotation_notes: rotationNotes,
    status: 'active',
    start_date: startDate,
    end_date: endDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null
  };

  localSubscriptionsStore.unshift(localSub);

  for (const v of vehicles) {
    const vId = typeof v === 'object' ? v.vehicleId || v.id : v;
    const locId = typeof v === 'object' ? v.locationId : null;
    if (vId) {
      localSubscriptionVehiclesStore.push({
        id: 'sv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        subscription_id: subId,
        customer_id: customerId,
        vehicle_id: vId,
        location_id: locId || null,
        schedule_tag: v.scheduleTag || 'daily',
        created_at: new Date().toISOString()
      });
    }
  }

  if (params.staffId) {
    localStaffAssignmentsStore.push({
      id: 'sa_' + Date.now(),
      staff_id: params.staffId,
      subscription_id: subId,
      assigned_by: actor,
      assigned_at: new Date().toISOString(),
      is_active: true
    });
  }

  return {
    ...localSub,
    success: true,
    subscription: localSub,
    message: 'DCC subscription activated successfully.'
  };
}

/**
 * Renew an existing DCC subscription cleanly
 */
async function renewSubscription({ subscriptionId, newEndDate = null, durationMonths = 1, newPackageName = null, notes = null, actor = 'admin' }, externalClient = null) {
  if (!subscriptionId) {
    throw new Error('Subscription ID is required to renew.');
  }

  let computedEnd = newEndDate;
  if (!computedEnd) {
    const base = new Date();
    base.setMonth(base.getMonth() + (parseInt(durationMonths, 10) || 1));
    computedEnd = getIstDate(base);
  }

  if (isNeonActive()) {
    const renew = async (client) => {
      const existing = await repos.subscriptions.findById(subscriptionId, client);
      if (!existing) {
        throw new Error(`Subscription '${subscriptionId}' not found.`);
      }

      const updates = {
        status: 'active',
        endDate: computedEnd
      };
      if (newPackageName) updates.packageName = newPackageName;
      if (notes) updates.rotationNotes = notes;

      const updated = await repos.subscriptions.updateSubscription(subscriptionId, updates, client);

      // Clear any stopped state
      await client.query(
        `UPDATE public.subscriptions 
         SET status = 'active', end_date = $2, stopped_at = NULL, stopped_reason = NULL, stopped_by = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [subscriptionId, computedEnd]
      );

      await repos.auditLogs.logChange({
        entityType: 'dcc_subscription',
        entityId: subscriptionId,
        action: 'renew_subscription',
        changedBy: actor,
        beforeState: { status: existing.status, endDate: existing.end_date },
        afterState: { status: 'active', endDate: computedEnd, renewedBy: actor }
      }, client);

      return {
        ...updated,
        success: true,
        subscription: updated,
        message: `DCC subscription renewed successfully until ${computedEnd}.`
      };
    };
    return externalClient ? renew(externalClient) : db.withTransaction(renew);
  }

  // Local fallback
  const sub = localSubscriptionsStore.find(s => s.id === subscriptionId && !s.deleted_at);
  if (!sub) {
    throw new Error(`Subscription '${subscriptionId}' not found.`);
  }

  const prevStatus = sub.status;
  const prevEnd = sub.end_date;

  sub.status = 'active';
  sub.end_date = computedEnd;
  if (newPackageName) sub.package_name = newPackageName;
  if (notes) sub.rotation_notes = notes;
  sub.stopped_at = null;
  sub.stopped_reason = null;
  sub.stopped_by = null;
  sub.updated_at = new Date().toISOString();

  return {
    ...sub,
    success: true,
    subscription: sub,
    message: `DCC subscription renewed successfully until ${computedEnd}.`
  };
}

/**
 * Stop a DCC subscription (e.g. customer on vacation or pause)
 */
async function stopSubscription({ subscriptionId, reason = 'Customer requested service stop', actor = 'admin' }) {
  if (!subscriptionId) throw new Error('Subscription ID is required.');

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      const existing = await repos.subscriptions.findById(subscriptionId, client);
      if (!existing) throw new Error(`Subscription '${subscriptionId}' not found.`);

      await client.query(
        `UPDATE public.subscriptions
         SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP, stopped_reason = $2, stopped_by = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [subscriptionId, reason, actor]
      );

      await repos.auditLogs.logChange({
        entityType: 'dcc_subscription',
        entityId: subscriptionId,
        action: 'stop_subscription',
        changedBy: actor,
        afterState: { status: 'stopped', reason }
      }, client);

      return { success: true, subscriptionId, message: 'DCC subscription stopped successfully.' };
    });
  }

  // Local fallback
  const sub = localSubscriptionsStore.find(s => s.id === subscriptionId && !s.deleted_at);
  if (!sub) throw new Error(`Subscription '${subscriptionId}' not found.`);

  sub.status = 'stopped';
  sub.stopped_at = new Date().toISOString();
  sub.stopped_reason = reason;
  sub.stopped_by = actor;
  sub.updated_at = new Date().toISOString();

  return { success: true, subscriptionId, message: 'DCC subscription stopped successfully.' };
}

/**
 * Cancel a DCC subscription permanently
 */
async function cancelSubscription(arg1, arg2 = 'Subscription cancelled', arg3 = 'admin', externalClient = null) {
  const subscriptionId = typeof arg1 === 'object' && arg1 !== null ? arg1.subscriptionId : arg1;
  const reason = typeof arg1 === 'object' && arg1 !== null ? (arg1.reason || 'Subscription cancelled') : arg2;
  const actor = typeof arg1 === 'object' && arg1 !== null ? (arg1.actor || 'admin') : arg3;

  if (!subscriptionId) throw new Error('Subscription ID is required.');

  if (isNeonActive()) {
    const cancel = async (client) => {
      const existing = await repos.subscriptions.findById(subscriptionId, client);
      if (!existing) throw new Error(`Subscription '${subscriptionId}' not found.`);

      const cancelled = await repos.subscriptions.cancelSubscription(subscriptionId, client);
      await repos.staffAssignments.unassignSubscription({
        subscriptionId,
        unassignedBy: actor,
        reason: reason || 'Subscription cancelled'
      }, client);

      await repos.auditLogs.logChange({
        entityType: 'dcc_subscription',
        entityId: subscriptionId,
        action: 'cancel_subscription',
        changedBy: actor,
        afterState: { status: 'cancelled', reason }
      }, client);

      return { success: true, subscription: cancelled, message: 'DCC subscription cancelled successfully.' };
    };
    return externalClient ? cancel(externalClient) : db.withTransaction(cancel);
  }

  // Local fallback
  const sub = localSubscriptionsStore.find(s => s.id === subscriptionId && !s.deleted_at);
  if (!sub) throw new Error(`Subscription '${subscriptionId}' not found.`);

  sub.status = 'cancelled';
  sub.end_date = getIstDate();
  sub.updated_at = new Date().toISOString();

  // Deactivate local assignment
  const assign = localStaffAssignmentsStore.find(sa => sa.subscription_id === subscriptionId && sa.is_active);
  if (assign) {
    assign.is_active = false;
    assign.unassigned_at = new Date().toISOString();
  }

  return { success: true, subscription: sub, message: 'DCC subscription cancelled successfully.' };
}

/**
 * Record a Daily Car Cleaning Operational Event (Completion, Absence, or Non-Completion)
 *
 * Enforces:
 * 1. Active DCC eligibility on operational date
 * 2. Strict exactly-once completion per vehicle per operational date
 * 3. Authenticated staff attribution
 * 4. Structured non-completion tagging
 * 5. Permanent auditable ledger
 */
async function recordDailyClean({
  subscriptionId,
  vehicleId,
  customerId = null,
  staffId = null,
  operationalDate = null,
  status = DCC_STATUSES.COMPLETED,
  completedAtDevice = null,
  clientMutationId = null,
  photoUrl = null,
  notes = null,
  tag = null,
  carNotPresent = false,
  punchLatitude = null,
  punchLongitude = null,
  punchAccuracyMeters = null,
  punchDistanceMeters = null,
  punchVerified = null,
  punchVerificationStatus = null,
  punchMetadata = null,
  source = 'staff_portal',
  bypassAuthCheck = false,
  actor = 'staff'
} = {}) {
  if (!subscriptionId) {
    throw new Error('Subscription ID is required to record a daily cleaning event.');
  }
  if (!vehicleId) {
    throw new Error('Vehicle ID is required to record a daily cleaning event.');
  }

  const compAt = completedAtDevice || new Date().toISOString();
  const istDate = operationalDate || repos.serviceLogs.computeIstServiceDate(compAt);
  const mutationId = clientMutationId || crypto.randomUUID();

  // Validate operational status
  const normStatus = String(status || '').toLowerCase().trim();
  const effectiveCarNotPresent = Boolean(carNotPresent || tag === 'car_not_present' || normStatus === 'car_not_present' || normStatus === 'customer_absent');
  let effectiveStatus = normStatus || DCC_STATUSES.COMPLETED;
  if (effectiveCarNotPresent && effectiveStatus === DCC_STATUSES.COMPLETED) {
    effectiveStatus = DCC_STATUSES.CAR_NOT_PRESENT;
  }
  const effectiveTag = tag || (effectiveCarNotPresent ? 'car_not_present' : null);

  // 1. Verify Active DCC Eligibility
  const eligCheck = await validateDccEligibility({
    subscriptionId,
    vehicleId,
    customerId,
    operationalDate: istDate
  });

  if (!eligCheck.eligible) {
    throw new Error(`Cannot record daily clean: ${eligCheck.reason}`);
  }

  // Evidence Integrity Guard: Photo proof is mandatory for completed daily clean
  if (effectiveStatus === DCC_STATUSES.COMPLETED && !photoUrl) {
    throw new Error('Photo proof is strictly required to record completed daily car cleaning.');
  }

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      // 1. Idempotency Check by client mutation ID
      if (mutationId && repos.serviceLogs.findByClientMutationId) {
        const existingByMutation = await repos.serviceLogs.findByClientMutationId(mutationId, client);
        if (existingByMutation) {
          return {
            ...existingByMutation,
            staffId: existingByMutation.staff_id,
            success: true,
            idempotent: true,
            duplicate: false,
            log: existingByMutation,
            serviceDate: istDate,
            message: `Daily clean event for mutation '${mutationId}' already processed (idempotent acknowledge).`
          };
        }
      }

      // 2. Concurrency & Duplicate Check: Check existing completion for (subscription_id, vehicle_id, service_date)
      const existing = await repos.serviceLogs.findBySubscriptionVehicleAndDate(subscriptionId, vehicleId, istDate, client);
      if (existing) {
        if (existing.status === effectiveStatus) {
          // Idempotent retry: return existing record safely
          return {
            ...existing,
            success: true,
            idempotent: true,
            duplicate: false,
            log: existing,
            serviceDate: istDate,
            message: `Daily clean event for ${istDate} already recorded (idempotent acknowledge).`
          };
        }

        // If previously completed, do not allow arbitrary overwrite without admin override
        if (existing.status === 'completed' && effectiveStatus !== 'completed' && actor !== 'admin') {
          throw new Error(`Cannot overwrite already completed daily clean for vehicle on ${istDate}. Admin authorization required.`);
        }
      }

      // 3. Staff Authorization Guard (for new records or status changes)
      let staffDbId = staffId;
      if (staffId && !bypassAuthCheck) {
        let staffObj = null;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffId)) {
          staffObj = await repos.staff.findById(staffId, client);
        } else {
          staffObj = await repos.staff.findByStaffCode(staffId, client);
        }
        if (!staffObj) {
          throw new Error(`Staff '${staffId}' not found.`);
        }
        staffDbId = staffObj.id;

        // Staff Service Capability Guard: Must have DCC capability
        if (!staffCapabilityService.isDccEligible(staffObj)) {
          const eff = staffCapabilityService.getStaffEffectiveCapabilities(staffObj);
          throw new Error(`Staff member '${staffObj.name || staffId}' is classified as '${eff.workType}' and is not authorized to execute Daily Car Cleaning operations.`);
        }

        // Verify staff is actively assigned to this subscription or route (unless admin actor)
        if (actor !== 'admin' && actor !== 'superadmin') {
          let isAssigned = false;
          if (repos.routes && repos.routes.findActiveStopBySubscriptionAndVehicle) {
            const activeStop = await repos.routes.findActiveStopBySubscriptionAndVehicle(subscriptionId, vehicleId, client);
            if (activeStop && activeStop.assigned_staff_id) {
              if (activeStop.assigned_staff_id !== staffObj.id) {
                throw new Error(`Unauthorized: Route is assigned to another staff member.`);
              }
              isAssigned = true;
            }
          }
          if (!isAssigned) {
            const assignment = await repos.staffAssignments.findActiveBySubscriptionId(subscriptionId, client);
            if (assignment) {
              if (assignment.staff_id === staffObj.id) {
                isAssigned = true;
              } else {
                throw new Error(`Unauthorized: Daily Clean subscription is assigned to another staff member.`);
              }
            }
          }
        }
      }

      // If existing status conflict being resolved with authorization
      if (existing) {
        const updated = await repos.serviceLogs.updateStatusAndReason(existing.id, {
          status: effectiveStatus,
          adminNotes: `Status changed to '${effectiveStatus}' by ${actor}. Previous: '${existing.status}'`,
          adminUser: actor
        }, client);

        return {
          ...updated,
          success: true,
          conflictResolved: true,
          log: updated,
          serviceDate: istDate,
          message: `Daily clean status updated to '${effectiveStatus}'.`
        };
      }

      // 4. Insert Service Log
      const insertResult = await repos.serviceLogs.recordCompletion({
        clientMutationId: mutationId,
        staffId: staffDbId,
        subscriptionId,
        vehicleId,
        jobId: null, // Strictly NULL for DCC: decoupled from one-time service_jobs
        serviceDate: istDate,
        status: effectiveStatus,
        completedAtDevice: compAt,
        notes: notes || (effectiveCarNotPresent ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)' : 'Daily car cleaning completed with photo proof'),
        photoUrl: photoUrl || null,
        source: source || 'staff_portal',
        deviceMetadata: null,
        carNotPresent: effectiveCarNotPresent,
        tag: effectiveTag,
        punchLatitude,
        punchLongitude,
        punchAccuracyMeters,
        punchDistanceMeters,
        punchVerified,
        punchVerificationStatus,
        punchMetadata
      }, client);

      return {
        ...insertResult.log,
        staffId: insertResult.log?.staff_id || staffDbId,
        success: true,
        idempotent: insertResult.idempotent || false,
        log: insertResult.log,
        serviceDate: istDate,
        message: effectiveCarNotPresent ? 'Absence / Car not present logged successfully.' : 'Daily cleaning recorded successfully.'
      };
    });
  }

  // Local fallback
  // 1. Idempotency: Check if client_mutation_id was already processed
  const existingByMutation = localServiceLogsStore.find(l => l.client_mutation_id === mutationId);
  if (existingByMutation) {
    return {
      ...existingByMutation,
      staffId: existingByMutation.staff_id,
      success: true,
      idempotent: true,
      duplicate: false,
      log: existingByMutation,
      serviceDate: istDate,
      message: `Daily clean event for mutation '${mutationId}' already processed (idempotent acknowledge).`
    };
  }

  // 2. Concurrency & Duplicate Check
  const existingLocal = localServiceLogsStore.find(
    l => l.subscription_id === subscriptionId && l.vehicle_id === vehicleId && l.service_date === istDate
  );

  if (existingLocal) {
    if (existingLocal.status === effectiveStatus) {
      return {
        ...existingLocal,
        success: true,
        idempotent: true,
        duplicate: false,
        log: existingLocal,
        serviceDate: istDate,
        message: `Daily clean event for ${istDate} already recorded (idempotent acknowledge).`
      };
    }

    if (existingLocal.status === 'completed' && effectiveStatus !== 'completed' && actor !== 'admin') {
      throw new Error(`Cannot overwrite already completed daily clean for vehicle on ${istDate}. Admin authorization required.`);
    }
  }

  // 3. Staff Authorization Guard (Local fallback)
  if (!bypassAuthCheck && actor !== 'admin' && actor !== 'superadmin' && staffId) {
    if (repos.staff && typeof repos.staff.findById === 'function') {
      try {
        let localStaff = await repos.staff.findById(staffId);
        if (!localStaff && typeof repos.staff.findByStaffCode === 'function') {
          localStaff = await repos.staff.findByStaffCode(staffId);
        }
        if (localStaff && !staffCapabilityService.isDccEligible(localStaff)) {
          const eff = staffCapabilityService.getStaffEffectiveCapabilities(localStaff);
          throw new Error(`Staff member '${localStaff.name || staffId}' is classified as '${eff.workType}' and is not authorized to execute Daily Car Cleaning operations.`);
        }
      } catch (err) {
        if (err.message && err.message.includes('not authorized to execute Daily Car Cleaning operations')) {
          throw err;
        }
        // In local mock test mode without DB configured, ignore unconfigured DB lookup errors
      }
    }

    let isAssigned = false;
    if (repos.routes && repos.routes.findActiveStopBySubscriptionAndVehicle) {
      const activeStop = await repos.routes.findActiveStopBySubscriptionAndVehicle(subscriptionId, vehicleId);
      if (activeStop && activeStop.assigned_staff_id) {
        if (activeStop.assigned_staff_id !== staffId) {
          throw new Error(`Unauthorized: Route is assigned to another staff member.`);
        }
        isAssigned = true;
      }
    }
    if (!isAssigned) {
      const assignment = localStaffAssignmentsStore.find(sa => sa.subscription_id === subscriptionId && sa.is_active);
      if (assignment) {
        if (assignment.staff_id === staffId) {
          isAssigned = true;
        } else {
          throw new Error(`Unauthorized: Daily Clean subscription is assigned to another staff member.`);
        }
      }
    }
  }

  if (existingLocal) {
    existingLocal.status = effectiveStatus;
    existingLocal.car_not_present = effectiveCarNotPresent;
    existingLocal.tag = effectiveTag;
    existingLocal.notes = notes || existingLocal.notes;
    existingLocal.updated_at = new Date().toISOString();

    return {
      ...existingLocal,
      success: true,
      conflictResolved: true,
      log: existingLocal,
      serviceDate: istDate,
      message: `Daily clean status updated to '${effectiveStatus}'.`
    };
  }

  const newLog = {
    id: mutationId,
    client_mutation_id: mutationId,
    staff_id: staffId || 'staff_default',
    subscription_id: subscriptionId,
    vehicle_id: vehicleId,
    job_id: null,
    service_date: istDate,
    status: effectiveStatus,
    completed_at_device: compAt,
    synced_at_server: new Date().toISOString(),
    notes: notes || (effectiveCarNotPresent ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)' : 'Daily clean verified with photo proof'),
    photo_url: photoUrl || null,
    source: source || 'staff_portal',
    car_not_present: effectiveCarNotPresent,
    tag: effectiveTag,
    punch_latitude: punchLatitude,
    punch_longitude: punchLongitude,
    created_at: new Date().toISOString()
  };

  localServiceLogsStore.unshift(newLog);

  return {
    ...newLog,
    staffId: newLog.staff_id,
    success: true,
    idempotent: false,
    log: newLog,
    serviceDate: istDate,
    message: effectiveCarNotPresent ? 'Absence / Car not present logged successfully.' : 'Daily cleaning recorded successfully.'
  };
}

/**
 * Get customer DCC subscriptions and vehicle enrollments
 */
async function getCustomerDccDetails(customerId) {
  if (!customerId) return { subscriptions: [], vehicles: [] };

  if (isNeonActive()) {
    const subs = await repos.subscriptions.findByCustomerId(customerId);
    const dccSubs = subs.filter(s => s.service_category_id === 'daily_car_cleaning');
    const enriched = [];

    for (const sub of dccSubs) {
      const svList = await repos.subscriptionVehicles.findBySubscriptionId(sub.id);
      const assignment = await repos.staffAssignments.findActiveBySubscriptionId(sub.id);
      enriched.push({
        ...sub,
        vehicles: svList,
        assignedStaff: assignment ? { id: assignment.staff_id, name: assignment.staff_name, code: assignment.staff_code } : null
      });
    }

    return { customerId, subscriptions: enriched };
  }

  // Local fallback
  const dccSubs = localSubscriptionsStore.filter(
    s => (s.customer_id === customerId || s.customerId === customerId) && !s.deleted_at && s.service_category_id === 'daily_car_cleaning'
  );

  const enriched = dccSubs.map(sub => {
    const svList = localSubscriptionVehiclesStore.filter(sv => sv.subscription_id === sub.id);
    const assign = localStaffAssignmentsStore.find(sa => sa.subscription_id === sub.id && sa.is_active);
    return {
      ...sub,
      vehicles: svList,
      assignedStaff: assign ? { id: assign.staff_id, staffId: assign.staff_id } : null
    };
  });

  return { customerId, subscriptions: enriched };
}

/**
 * Query daily cleaning service logs for an operational date
 */
async function getDailyLogsForDate(operationalDate = null, staffId = null) {
  const targetDate = operationalDate || getIstDate();
  if (isNeonActive()) {
    if (staffId) {
      return repos.serviceLogs.findByStaffAndDate(staffId, targetDate);
    }
    const result = await repos.serviceLogs.queryDailyCleanReports({ startDate: targetDate, endDate: targetDate, limit: 1000 });
    return result.records || [];
  }
  // Local fallback
  return localServiceLogsStore.filter(l => {
    if (l.service_date !== targetDate) return false;
    if (staffId && l.staff_id !== staffId) return false;
    return true;
  });
}

/**
 * Find daily cleaning log for a specific subscription and vehicle on an operational date
 */
async function findDailyLog({ subscriptionId, vehicleId, operationalDate = null }) {
  const targetDate = operationalDate || getIstDate();
  if (!subscriptionId || !vehicleId) return null;

  if (isNeonActive()) {
    return repos.serviceLogs.findBySubscriptionVehicleAndDate(subscriptionId, vehicleId, targetDate);
  }

  return localServiceLogsStore.find(
    l => l.subscription_id === subscriptionId && l.vehicle_id === vehicleId && l.service_date === targetDate
  ) || null;
}

/**
 * Reset local test stores
 */
function __resetLocalStores() {
  localSubscriptionsStore = [];
  localSubscriptionVehiclesStore = [];
  localServiceLogsStore = [];
  localStaffAssignmentsStore = [];
}

module.exports = {
  DCC_STATUSES,
  VALID_DCC_STATUSES,
  getIstDate,
  validateDccEligibility,
  createSubscription,
  renewSubscription,
  stopSubscription,
  cancelSubscription,
  recordDailyClean,
  getCustomerDccDetails,
  getDailyLogsForDate,
  findDailyLog,
  __resetLocalStores
};
