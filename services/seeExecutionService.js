/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Phases 9, 10, 11: Canonical Service Job, Execution & Proof, Solar Verification
 *
 * Invariants:
 * 1. Staff job contract never exposes financial/admin-only information.
 * 2. Proof and checklist requirements are enforced server-side.
 * 3. Required add-ons must complete before job completion unless authorized exception.
 * 4. Valid completion consumes entitlement idempotently; cancel/fail/no_show release reservation.
 * 5. Solar estimated quantity is never presented as verified quantity; staff cannot alter sale pricing.
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeStaffCapabilityService = require('./seeStaffCapabilityService');
const seeEntitlementService = require('./seeEntitlementService');
const packageService = require('./packageService');

const ALLOWED_PAYMENT_STATUSES = ['paid', 'unpaid', 'pending', 'package_covered', 'partial', 'waived'];
const ALLOWED_BOOKING_SOURCES = ['admin', 'customer_request', 'verbal', 'call_center', 'app'];

function normalizePaymentStatus(val) {
  const s = val ? String(val).trim().toLowerCase() : 'pending';
  return ALLOWED_PAYMENT_STATUSES.includes(s) ? s : 'pending';
}

function normalizeBookingSource(val) {
  const s = val ? String(val).trim().toLowerCase() : 'admin';
  return ALLOWED_BOOKING_SOURCES.includes(s) ? s : 'admin';
}

const VALID_JOB_STATUSES = [
  'requested', 'booked', 'assigned', 'in_progress',
  'completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'
];

/**
 * Strip financial / admin-only fields for Staff Job Contracts
 */
function buildStaffSafeJobContract(job, { addons = [], solarVerification = null } = {}) {
  if (!job) return null;
  const safe = {
    jobId: job.id,
    serviceCategoryId: job.service_category_id,
    serviceId: job.service_id || null,
    serviceNameSnapshot: job.service_name_snapshot || job.service_type,
    status: job.status,
    scheduledDate: job.scheduled_date,
    scheduledTime: job.scheduled_time,
    timezone: job.timezone || 'Asia/Kolkata',
    assignedStaffId: job.staff_id || null,
    customerName: job.customer_name || null,
    vehicle: job.registration_no ? {
      registrationNo: job.registration_no,
      brandOrModel: job.brand_or_model,
      carMake: job.car_make,
      carColor: job.car_color,
      seaterType: job.seater_type
    } : null,
    address: job.address_text || null,
    googleMapsUrl: job.google_maps_url || null,
    parkingDetails: job.parking_details || null,
    city: job.city || null,
    zone: job.zone || null,
    instructions: job.special_instructions || null,
    sequenceOrder: job.sequence_order || null,
    checklistRequirements: job.checklist_requirements || [],
    proofRequirements: job.proof_requirements || { before_min: 0, after_min: 0, required: false },
    servicePayload: job.service_payload || {},
    addons: addons.map(a => ({
      id: a.id,
      addonId: a.addon_id,
      name: a.addon_name_snapshot,
      executionMode: a.execution_mode,
      isRequired: a.is_required,
      status: a.status
    }))
  };

  if (solarVerification) {
    safe.solar = {
      estimatedPanelCount: solarVerification.estimated_panel_count,
      systemCapacityKw: solarVerification.system_capacity_kw,
      estimateMethod: solarVerification.estimate_method,
      isEstimate: solarVerification.is_estimate,
      actualPanelCount: solarVerification.actual_panel_count,
      discrepancyCount: solarVerification.discrepancy_count,
      approvalStatus: solarVerification.approval_status,
      finalServicedQuantity: solarVerification.final_serviced_quantity
    };
  }
  return safe;
}

/**
 * Phase 9: Create Canonical Service Job (optionally reserving entitlement, never consuming on creation)
 */
async function createCanonicalJob({
  customerId,
  vehicleId = null,
  locationId,
  serviceIdOrCode,
  serviceType = null,
  packageCode = null,
  packageDetails = null,
  seaterType = null,
  panelCount = null,
  siteDetails = null,
  sequenceOrder = null,
  servicePrice = 0.00,
  paymentStatus = 'pending',
  bookingSource = 'admin',
  scheduledDate = null,
  scheduledTime = null,
  timezone = 'Asia/Kolkata',
  city = null,
  zone = null,
  instructions = null,
  entitlementAccountId = null,
  purchaseSnapshotId = null,
  staffId = null,
  addonIds = [],
  servicePayload = {},
  solarEstimate = null,
  actor = 'admin'
}) {
  if (!customerId || !locationId || !serviceIdOrCode) {
    throw new Error('customerId, locationId, and serviceIdOrCode are required.');
  }

  let svc = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(serviceIdOrCode)) {
    svc = await repos.seeCatalogue.findServiceById(serviceIdOrCode);
  }
  if (!svc) {
    svc = await repos.seeCatalogue.findServiceByCode(serviceIdOrCode);
  }
  if (!svc) throw new Error(`Service '${serviceIdOrCode}' not found in catalogue.`);
  if (svc.status !== 'active') throw new Error(`Service '${svc.name}' is not active (status: '${svc.status}').`);

  const requiredEquipment = Array.isArray(svc.execution_config && svc.execution_config.required_equipment)
    ? svc.execution_config.required_equipment
    : [];
  const durationMinutes = svc.expected_duration_minutes || 60;
  const allowConcurrent = Boolean(svc.execution_config && svc.execution_config.allow_concurrent);

  const parsedPanelCount = (panelCount !== null && panelCount !== undefined && panelCount !== '')
    ? (isNaN(parseInt(panelCount, 10)) ? null : parseInt(panelCount, 10))
    : null;
  const parsedSeqOrder = (sequenceOrder !== null && sequenceOrder !== undefined && sequenceOrder !== '')
    ? (isNaN(parseInt(sequenceOrder, 10)) ? null : parseInt(sequenceOrder, 10))
    : null;
  const numPrice = parseFloat(servicePrice);
  const finalPrice = Number.isFinite(numPrice) ? numPrice : 0.00;
  const normPayStatus = normalizePaymentStatus(entitlementAccountId ? (paymentStatus || 'package_covered') : paymentStatus);
  const normSource = normalizeBookingSource(bookingSource);

  const job = await db.withTransaction(async (client) => {
    // Canonical jobs must be tied to the selected customer's real records.
    const customer = await repos.customers.findById(customerId, client);
    if (!customer || customer.deleted_at) throw new Error('Customer not found.');
    if (customer.is_active === false) throw new Error('Cannot book a service for an inactive customer.');

    const location = await repos.serviceLocations.findById(locationId, client);
    if (!location || String(location.customer_id) !== String(customerId)) {
      throw new Error('Selected service location does not belong to this customer.');
    }
    if (vehicleId) {
      const vehicle = await repos.vehicles.findById(vehicleId, client);
      if (!vehicle || String(vehicle.customer_id) !== String(customerId)) {
        throw new Error('Selected vehicle does not belong to this customer.');
      }
    }

    // Validate every selected add-on before inserting the job. A missing or
    // incompatible item must fail the whole transaction, never disappear.
    const canonicalAddons = [];
    for (const addonId of [...new Set((Array.isArray(addonIds) ? addonIds : []).map(String))]) {
      const addon = await repos.seeCatalogue.findAddonById(addonId, client);
      if (!addon || addon.status !== 'active') throw new Error(`Selected add-on '${addonId}' is unavailable.`);
      const compatibleIds = Array.isArray(addon.applicable_service_ids) ? addon.applicable_service_ids.map(String) : [];
      if (compatibleIds.length && !compatibleIds.includes(String(svc.id))) {
        throw new Error(`Add-on '${addon.name}' is not compatible with '${svc.name}'.`);
      }
      canonicalAddons.push({ addon, addonAccount: null });
    }

    if (entitlementAccountId) {
      const account = await repos.seeEntitlement.findAccountByIdForUpdate(entitlementAccountId, client);
      if (!account || String(account.customer_id) !== String(customerId)) {
        throw new Error('Entitlement account does not belong to this customer.');
      }
      if (String(account.service_id || '') !== String(svc.id)) {
        throw new Error('Entitlement account is not valid for the selected service.');
      }
      if (vehicleId && account.vehicle_id && String(account.vehicle_id) !== String(vehicleId)) {
        throw new Error('Entitlement account is linked to a different vehicle.');
      }
      if (account.location_id && String(account.location_id) !== String(locationId)) {
        throw new Error('Entitlement account is linked to a different service location.');
      }
      if (purchaseSnapshotId && String(account.purchase_snapshot_id) !== String(purchaseSnapshotId)) {
        throw new Error('Purchase snapshot does not match the selected entitlement account.');
      }
      purchaseSnapshotId = account.purchase_snapshot_id;
    }

    if (purchaseSnapshotId && canonicalAddons.length) {
      const snapshotAccounts = await repos.seeEntitlement.findAccountsBySnapshotId(purchaseSnapshotId, client);
      for (const item of canonicalAddons) {
        item.addonAccount = snapshotAccounts.find(account => String(account.addon_id || '') === String(item.addon.id)) || null;
      }
    }

    // Resolve staff (UUID or staff_code) & validate eligibility INSIDE transaction with FOR UPDATE lock on staff row
    let resolvedStaffUuid = null;
    if (staffId) {
      const staffRecord = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
      if (!staffRecord) {
        throw new Error(`Staff ineligible for job: Staff '${staffId}' not found.`);
      }
      resolvedStaffUuid = staffRecord.id;
      const elig = await seeStaffCapabilityService.evaluateStaffEligibility(resolvedStaffUuid, {
        serviceId: svc.id,
        serviceCode: svc.service_code,
        serviceCategoryId: svc.service_category_id,
        addonIds,
        city,
        zone,
        scheduledDate,
        scheduledTime,
        durationMinutes,
        allowConcurrent,
        timezone,
        requiredEquipment
      }, client);
      if (!elig.eligible) {
        throw new Error(`Staff ineligible for job: ${elig.reasons.join('; ')}`);
      }
    }

    const initialStatus = resolvedStaffUuid ? 'assigned' : 'booked';
    const res = await client.query(
      `INSERT INTO public.service_jobs (
         customer_id, vehicle_id, location_id, service_category_id,
         service_id, service_name_snapshot, service_type,
         package_code, package_details, seater_type, panel_count, site_details,
         sequence_order, service_price, payment_status, booking_source,
         scheduled_date, scheduled_time, timezone, city, zone,
         status, special_instructions, entitlement_account_id, purchase_snapshot_id,
         service_payload, checklist_requirements, proof_requirements
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [
        customerId,
        vehicleId,
        locationId,
        svc.service_category_id,
        svc.id,
        svc.name,
        (serviceType && String(serviceType).trim()) ? String(serviceType).trim() : svc.name,
        packageCode || null,
        packageDetails || null,
        seaterType || null,
        parsedPanelCount,
        siteDetails ? JSON.stringify(siteDetails) : null,
        parsedSeqOrder,
        finalPrice,
        normPayStatus,
        normSource,
        scheduledDate,
        scheduledTime,
        timezone,
        city,
        zone,
        initialStatus,
        instructions,
        entitlementAccountId,
        purchaseSnapshotId,
        JSON.stringify({ ...(servicePayload || {}), _seeManaged: true }),
        JSON.stringify(svc.checklist_requirements || []),
        JSON.stringify(svc.photo_requirements || { before_min: 0, after_min: 0, required: false })
      ]
    );
    const createdJob = res.rows[0];

    if (resolvedStaffUuid) {
      await repos.staffAssignments.assignStaffToJob({
        staffId: resolvedStaffUuid,
        jobId: createdJob.id,
        assignedBy: actor
      }, client);
    }

    for (const { addon, addonAccount } of canonicalAddons) {
      const jobAddon = await repos.seeOperations.createJobAddon({
        jobId: createdJob.id,
        addonId: addon.id,
        addonNameSnapshot: addon.name,
        executionMode: addon.execution_mode,
        entitlementAccountId: addonAccount ? addonAccount.id : null,
        isRequired: !addon.is_optional
      }, client);
      if (addonAccount) {
        await seeEntitlementService.mutateEntitlement({
          accountId: addonAccount.id,
          entryType: 'reserve',
          quantity: 1,
          referenceType: 'service_job_addon',
          referenceId: jobAddon.id,
          idempotencyKey: `reserve:job-addon:${jobAddon.id}`,
          reason: `Reserved add-on entitlement for job ${createdJob.id}`,
          actor
        }, client);
      }
    }

    if (svc.service_category_id === 'solar_cleaning' && solarEstimate) {
      await repos.seeOperations.upsertSolarVerification({
        jobId: createdJob.id,
        estimatedPanelCount: solarEstimate.estimatedPanelCount || null,
        systemCapacityKw: solarEstimate.systemCapacityKw || null,
        estimateMethod: solarEstimate.estimateMethod || 'customer_declared',
        isEstimate: true,
        approvalStatus: 'not_required'
      }, client);
    }

    // Reserve entitlement atomically within the same transaction
    if (entitlementAccountId) {
      await seeEntitlementService.mutateEntitlement({
        accountId: entitlementAccountId,
        entryType: 'reserve',
        quantity: 1,
        referenceType: 'service_job',
        referenceId: createdJob.id,
        idempotencyKey: `reserve:job:${createdJob.id}`,
        reason: `Reserved entitlement for job ${createdJob.id}`,
        actor
      }, client);
    }

    return createdJob;
  });

  return job;
}

/**
 * Assign or reassign a job to an eligible staff member (concurrency-safe with FOR UPDATE lock)
 */
async function assignJob(jobId, staffId, actor = 'admin', opts = {}) {
  return db.withTransaction(async (client) => {
    const job = await repos.serviceJobs.findByIdForUpdate(jobId, client);
    if (!job) throw new Error(`Job '${jobId}' not found.`);
    if (['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'].includes(job.status)) {
      throw new Error(`Cannot assign job in terminal status '${job.status}'.`);
    }

    const staffRecord = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
    if (!staffRecord) {
      throw new Error(`Staff '${staffId}' not found.`);
    }

    const currentAssignment = await repos.staffAssignments.findActiveByJobId(jobId, client);
    const oldStaffId = currentAssignment ? currentAssignment.staff_id : null;

    const hasScheduleUpdate = (opts && (opts.scheduledTime !== undefined || opts.tentativeTime !== undefined));
    const hasSeqUpdate = (opts && opts.sequenceOrder !== undefined);
    const newScheduledTime = hasScheduleUpdate
      ? ((opts.scheduledTime !== undefined ? opts.scheduledTime : opts.tentativeTime) || '').toString().trim() || null
      : job.scheduled_time;
    const newSequenceOrder = hasSeqUpdate
      ? (opts.sequenceOrder !== null && opts.sequenceOrder !== '' && !isNaN(parseInt(opts.sequenceOrder, 10)) ? parseInt(opts.sequenceOrder, 10) : null)
      : job.sequence_order;

    if (oldStaffId && oldStaffId === staffRecord.id && !hasScheduleUpdate && !hasSeqUpdate) {
      throw new Error(`${staffRecord.name} is already assigned to this job.`);
    }

    if (hasScheduleUpdate || hasSeqUpdate) {
      await repos.serviceJobs.updateJob(job.id, {
        ...(hasScheduleUpdate ? { scheduledTime: newScheduledTime } : {}),
        ...(hasSeqUpdate ? { sequenceOrder: newSequenceOrder } : {})
      }, client);
    }

    const jobAddons = await repos.seeOperations.findJobAddons(jobId, client);
    const svc = job.service_id ? await repos.seeCatalogue.findServiceById(job.service_id, client) : null;
    const requiredEquipment = Array.isArray(svc && svc.execution_config && svc.execution_config.required_equipment)
      ? svc.execution_config.required_equipment
      : [];

    const elig = await seeStaffCapabilityService.evaluateStaffEligibility(staffRecord.id, {
      serviceId: job.service_id,
      serviceCode: svc ? svc.service_code : null,
      serviceCategoryId: job.service_category_id,
      addonIds: jobAddons.map(a => a.addon_id),
      city: job.city,
      zone: job.zone,
      scheduledDate: job.scheduled_date,
      scheduledTime: newScheduledTime,
      durationMinutes: (svc && svc.expected_duration_minutes) || 60,
      allowConcurrent: Boolean(svc && svc.execution_config && svc.execution_config.allow_concurrent),
      timezone: job.timezone || 'Asia/Kolkata',
      requiredEquipment
    }, client);

    if (!elig.eligible) {
      throw new Error(`Staff ineligible for job: ${elig.reasons.join('; ')}`);
    }

    if (!(oldStaffId && oldStaffId === staffRecord.id)) {
      await repos.staffAssignments.assignStaffToJob({ staffId: staffRecord.id, jobId, assignedBy: actor }, client);
    }

    const reason = opts && opts.reason ? String(opts.reason).trim() : '';
    if (reason) {
      if (oldStaffId) {
        await client.query(
          `UPDATE public.staff_assignments
           SET reassignment_reason = $1
           WHERE job_id = $2 AND staff_id = $3 AND is_active = FALSE AND unassigned_at IS NOT NULL`,
          [reason, job.id, oldStaffId]
        );
      }
    }

    if (repos.auditLogs && repos.auditLogs.logChange) {
      await repos.auditLogs.logChange({
        entityType: 'service_job',
        entityId: job.id,
        action: oldStaffId ? 'reassign_special_job' : 'assign_special_job',
        changedBy: actor,
        beforeState: { staffId: oldStaffId, scheduledTime: job.scheduled_time, sequenceOrder: job.sequence_order },
        afterState: {
          jobId: job.id,
          newStaffId: staffRecord.staff_code,
          newStaffName: staffRecord.name,
          scheduledTime: newScheduledTime,
          sequenceOrder: newSequenceOrder,
          reason: reason || null
        }
      }, client);
    }

    const res = await client.query(
      `UPDATE public.service_jobs SET status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [jobId]
    );
    return res.rows[0];
  });
}

/**
 * Phase 10: Start execution
 */
async function startExecution(jobId, staffId, opts = {}) {
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (!['assigned', 'booked', 'pending'].includes(job.status)) {
    throw new Error(`Cannot start job in status '${job.status}'.`);
  }

  const beforePhotos = Array.isArray(opts && opts.beforePhotos) ? opts.beforePhotos : null;
  const startedAt = (opts && opts.startedAt) || null;

  return db.withTransaction(async (client) => {
    let resolvedStaffUuid = null;
    if (staffId) {
      const sRec = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
      resolvedStaffUuid = sRec ? sRec.id : (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(String(staffId)) ? staffId : null);
    }
    await client.query(
      `UPDATE public.service_jobs
       SET status = 'in_progress',
           started_at = COALESCE($2, CURRENT_TIMESTAMP),
           before_photos = COALESCE($3::jsonb, before_photos),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId, startedAt, beforePhotos && beforePhotos.length > 0 ? JSON.stringify(beforePhotos) : null]
    );
    return repos.seeOperations.createExecution({
      jobId,
      staffId: resolvedStaffUuid,
      startedAt: startedAt || new Date().toISOString(),
      proofPhotos: beforePhotos && beforePhotos.length > 0 ? { before: beforePhotos, after: [] } : { before: [], after: [] },
      outcome: 'in_progress'
    }, client);
  });
}

/**
 * Phase 10: Complete execution with backend checklist, proof, and add-on enforcement
 */
async function completeExecution(jobId, {
  staffId,
  checklistResults = [],
  proofPhotos = { before: [], after: [] },
  actualQuantity = null,
  measurements = {},
  customerConfirmation = {},
  authorizedException = null,
  completionNotes = null,
  actor = 'staff'
}) {
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'].includes(job.status)) {
    throw new Error(`Job '${jobId}' is already in terminal status '${job.status}'.`);
  }

  // 1. Enforce Proof requirements unless authorized exception (merge before_photos captured on startExecution)
  const existingBefore = Array.isArray(job.before_photos) ? job.before_photos : [];
  const effectiveBefore = (Array.isArray(proofPhotos.before) && proofPhotos.before.length > 0) ? proofPhotos.before : existingBefore;
  const effectiveAfter = Array.isArray(proofPhotos.after) ? proofPhotos.after : [];
  const normalizedProofPhotos = { before: effectiveBefore, after: effectiveAfter };
  const proofReq = job.proof_requirements || { before_min: 0, after_min: 0, required: false };
  const beforeCount = effectiveBefore.length;
  const afterCount = effectiveAfter.length;
  if (!authorizedException && (proofReq.required || proofReq.before_min > 0 || proofReq.after_min > 0)) {
    if (beforeCount < (proofReq.before_min || 0) || afterCount < (proofReq.after_min || 0)) {
      throw new Error(`Required proof photos missing (need before>=${proofReq.before_min || 0}, after>=${proofReq.after_min || 0}).`);
    }
  }

  // 2. Enforce Checklist requirements unless authorized exception
  const reqChecklist = Array.isArray(job.checklist_requirements) ? job.checklist_requirements : [];
  if (!authorizedException && reqChecklist.length > 0) {
    const completedItems = Array.isArray(checklistResults)
      ? checklistResults.filter(c => c.completed !== false).map(c => c.item || c)
      : [];
    if (completedItems.length < reqChecklist.length) {
      throw new Error(`Required checklist items incomplete (${completedItems.length}/${reqChecklist.length}).`);
    }
  }

  // 3. Enforce Add-on completion unless authorized exception
  const jobAddons = await repos.seeOperations.findJobAddons(jobId);
  const incompleteRequiredAddons = jobAddons.filter(a => a.is_required && !['completed', 'skipped_exception'].includes(a.status));
  if (incompleteRequiredAddons.length > 0 && !authorizedException) {
    throw new Error(`Required add-ons incomplete: ${incompleteRequiredAddons.map(a => a.addon_name_snapshot).join(', ')}`);
  }

  const execution = await db.withTransaction(async (client) => {
    // Row-level lock on service_jobs to serialize concurrent completion attempts
    const lockedJob = await repos.serviceJobs.findByIdForUpdate(jobId, client);
    if (!lockedJob) throw new Error(`Job '${jobId}' not found.`);
    if (['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'].includes(lockedJob.status)) {
      throw new Error(`Job '${jobId}' is already in terminal status '${lockedJob.status}'.`);
    }

    let resolvedStaffUuid = null;
    if (staffId) {
      const sRec = await seeStaffCapabilityService.resolveStaffRecord(staffId, client);
      resolvedStaffUuid = sRec ? sRec.id : (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(String(staffId)) ? staffId : null);
    }

    const exec = await repos.seeOperations.createExecution({
      jobId,
      staffId: resolvedStaffUuid,
      endedAt: new Date().toISOString(),
      actualQuantity,
      measurements,
      checklistResults,
      proofPhotos: normalizedProofPhotos,
      customerConfirmation,
      outcome: authorizedException ? 'partial_exception' : 'completed',
      exceptionReason: authorizedException ? authorizedException.reason : null,
      approvalReference: authorizedException ? authorizedException.approvalReference : null
    }, client);

    let legacyRedeemed = false;
    if (lockedJob.package_id && !lockedJob.entitlement_consumed && !lockedJob.entitlement_account_id) {
      await packageService.redeemPackage({
        packageId: lockedJob.package_id,
        quantity: 1,
        vehicleId: lockedJob.vehicle_id,
        locationId: lockedJob.location_id,
        serviceJobId: jobId,
        notes: `Auto-redeemed upon completion of job #${jobId.slice(0, 8)}`,
        adminUser: actor,
        client
      }, actor, client);
      legacyRedeemed = true;
    }

    const cleanNotes = completionNotes && String(completionNotes).trim() ? String(completionNotes).trim() : null;
    await client.query(
      `UPDATE public.service_jobs
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           before_photos = $2,
           after_photos = $3,
           completion_notes = COALESCE($4, completion_notes),
           entitlement_consumed = CASE WHEN entitlement_account_id IS NOT NULL OR $5 THEN TRUE ELSE entitlement_consumed END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId, JSON.stringify(normalizedProofPhotos.before || []), JSON.stringify(normalizedProofPhotos.after || []), cleanNotes, legacyRedeemed]
    );

    // 4. Idempotent entitlement consumption inside the same transaction
    if (lockedJob.entitlement_account_id) {
      await seeEntitlementService.mutateEntitlement({
        accountId: lockedJob.entitlement_account_id,
        entryType: 'consume',
        quantity: 1,
        referenceType: 'service_job',
        referenceId: jobId,
        executionReference: exec.id,
        idempotencyKey: `consume:job:${jobId}`,
        reason: `Consumed entitlement on completion of job ${jobId}`,
        actor
      }, client);
    }

    for (const addon of jobAddons) {
      if (!addon.entitlement_account_id) continue;
      const entryType = addon.status === 'completed' ? 'consume' : 'release';
      await seeEntitlementService.mutateEntitlement({
        accountId: addon.entitlement_account_id,
        entryType,
        quantity: 1,
        referenceType: 'service_job_addon',
        referenceId: addon.id,
        executionReference: addon.status === 'completed' ? exec.id : null,
        idempotencyKey: `${entryType}:job-addon:${addon.id}`,
        reason: addon.status === 'completed'
          ? `Consumed add-on entitlement on completion of job ${jobId}`
          : `Released unused add-on entitlement on completion of job ${jobId}`,
        actor
      }, client);
    }

    return exec;
  });

  return execution;
}

/**
 * Cancel, fail, or mark no-show — keeping failed and no_show distinct, and releasing any reservation atomically
 */
async function terminateJobWithoutCompletion(jobId, outcome, { reason, remarks = null, cancelledAt = null, failedAt = null, actor = 'staff' }) {
  if (!['cancelled', 'failed', 'no_show', 'unable_to_complete'].includes(outcome)) {
    throw new Error(`Invalid non-completion outcome '${outcome}'.`);
  }

  await db.withTransaction(async (client) => {
    const lockedJob = await repos.serviceJobs.findByIdForUpdate(jobId, client);
    if (!lockedJob) throw new Error(`Job '${jobId}' not found.`);
    if (['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'].includes(lockedJob.status)) {
      throw new Error(`Job '${jobId}' is already in terminal status '${lockedJob.status}'.`);
    }

    if (outcome === 'cancelled') {
      if (lockedJob.status === 'in_progress') {
        throw new Error(`Cannot cancel service job after work has commenced (in_progress). Use 'unable_to_complete' instead.`);
      }
      await client.query(
        `UPDATE public.service_jobs
         SET status = 'cancelled',
             cancellation_reason = $2,
             cancellation_remarks = $3,
             cancelled_at = COALESCE($4, CURRENT_TIMESTAMP),
             cancelled_by = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId, reason ? String(reason).trim() : 'cancelled', remarks ? String(remarks).trim() : null, cancelledAt || null, actor]
      );
    } else {
      await client.query(
        `UPDATE public.service_jobs
         SET status = $2,
             failure_reason = $3,
             failure_remarks = $4,
             failed_at = COALESCE($5, CURRENT_TIMESTAMP),
             failed_by = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [jobId, outcome, reason ? String(reason).trim() : outcome, remarks ? String(remarks).trim() : null, failedAt || null, actor]
      );
      await repos.seeOperations.createExecution({
        jobId,
        outcome,
        exceptionReason: reason || outcome
      }, client);
    }

    // Release reserved entitlement atomically inside the same transaction
    if (lockedJob.entitlement_account_id) {
      const acct = await repos.seeEntitlement.findAccountByIdForUpdate(lockedJob.entitlement_account_id, client);
      if (acct && acct.reserved_qty > 0) {
        await seeEntitlementService.mutateEntitlement({
          accountId: lockedJob.entitlement_account_id,
          entryType: 'release',
          quantity: 1,
          referenceType: 'service_job',
          referenceId: jobId,
          idempotencyKey: `release:job:${jobId}`,
          reason: `Released reservation due to job ${outcome}`,
          actor
        }, client);
      }
    }

    const jobAddons = await repos.seeOperations.findJobAddons(jobId, client);
    for (const addon of jobAddons) {
      if (!addon.entitlement_account_id) continue;
      const account = await repos.seeEntitlement.findAccountByIdForUpdate(addon.entitlement_account_id, client);
      if (account && Number(account.reserved_qty || 0) > 0) {
        await seeEntitlementService.mutateEntitlement({
          accountId: addon.entitlement_account_id,
          entryType: 'release',
          quantity: 1,
          referenceType: 'service_job_addon',
          referenceId: addon.id,
          idempotencyKey: `release:job-addon:${addon.id}`,
          reason: `Released add-on reservation due to job ${outcome}`,
          actor
        }, client);
      }
    }
  });

  return repos.serviceJobs.findById(jobId);
}

/**
 * Phase 11: Solar Quantity Verification & Approval Workflow
 */
async function submitSolarVerification(jobId, { staffId, actualPanelCount, discrepancyReason = null }) {
  if (!actualPanelCount || parseInt(actualPanelCount, 10) <= 0) {
    throw new Error('actualPanelCount must be a positive integer.');
  }
  const actual = parseInt(actualPanelCount, 10);
  const existing = await repos.seeOperations.findSolarVerificationByJob(jobId);
  const estimated = existing ? existing.estimated_panel_count : null;
  const discrepancy = estimated != null ? actual - estimated : 0;
  const needsApproval = discrepancy !== 0;

  return repos.seeOperations.upsertSolarVerification({
    jobId,
    estimatedPanelCount: estimated,
    systemCapacityKw: existing ? existing.system_capacity_kw : null,
    estimateMethod: existing ? existing.estimate_method : 'customer_declared',
    isEstimate: false,
    actualPanelCount: actual,
    verifiedByStaffId: staffId,
    discrepancyCount: discrepancy,
    discrepancyReason,
    approvalStatus: needsApproval ? 'pending_approval' : 'not_required',
    finalServicedQuantity: needsApproval ? null : actual
  });
}

async function approveSolarDiscrepancy(jobId, { approved, finalServicedQuantity = null, approvedBy }) {
  if (!approvedBy) throw new Error('approvedBy is required.');
  const existing = await repos.seeOperations.findSolarVerificationByJob(jobId);
  if (!existing) throw new Error(`Solar verification record for job '${jobId}' not found.`);

  const status = approved ? 'approved' : 'rejected';
  const finalQty = approved
    ? (finalServicedQuantity != null ? parseInt(finalServicedQuantity, 10) : existing.actual_panel_count)
    : existing.estimated_panel_count;

  return repos.seeOperations.upsertSolarVerification({
    jobId,
    estimatedPanelCount: existing.estimated_panel_count,
    systemCapacityKw: existing.system_capacity_kw,
    estimateMethod: existing.estimate_method,
    isEstimate: false,
    actualPanelCount: existing.actual_panel_count,
    verifiedByStaffId: existing.verified_by_staff_id,
    discrepancyCount: existing.discrepancy_count,
    discrepancyReason: existing.discrepancy_reason,
    approvalStatus: status,
    approvedBy,
    approvedAt: new Date().toISOString(),
    finalServicedQuantity: finalQty
  });
}

module.exports = {
  VALID_JOB_STATUSES,
  buildStaffSafeJobContract,
  createCanonicalJob,
  assignJob,
  startExecution,
  completeExecution,
  terminateJobWithoutCompletion,
  submitSolarVerification,
  approveSolarDiscrepancy
};
