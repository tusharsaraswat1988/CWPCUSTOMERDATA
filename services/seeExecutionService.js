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

  // Validate staff eligibility if assigned at creation
  if (staffId) {
    const elig = await seeStaffCapabilityService.evaluateStaffEligibility(staffId, {
      serviceId: svc.id,
      serviceCode: svc.service_code,
      serviceCategoryId: svc.service_category_id,
      addonIds,
      city,
      zone,
      scheduledDate
    });
    if (!elig.eligible) {
      throw new Error(`Staff ineligible for job: ${elig.reasons.join('; ')}`);
    }
  }

  const job = await db.withTransaction(async (client) => {
    const initialStatus = staffId ? 'assigned' : 'booked';
    const res = await client.query(
      `INSERT INTO public.service_jobs (
         customer_id, vehicle_id, location_id, service_category_id,
         service_id, service_name_snapshot, service_type,
         scheduled_date, scheduled_time, timezone, city, zone,
         status, special_instructions, entitlement_account_id, purchase_snapshot_id,
         service_payload, checklist_requirements, proof_requirements
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        customerId,
        vehicleId,
        locationId,
        svc.service_category_id,
        svc.id,
        svc.name,
        svc.name,
        scheduledDate,
        scheduledTime,
        timezone,
        city,
        zone,
        initialStatus,
        instructions,
        entitlementAccountId,
        purchaseSnapshotId,
        JSON.stringify(servicePayload || {}),
        JSON.stringify(svc.checklist_requirements || []),
        JSON.stringify(svc.photo_requirements || { before_min: 0, after_min: 0, required: false })
      ]
    );
    const createdJob = res.rows[0];

    if (staffId) {
      await repos.staffAssignments.assignStaffToJob({
        staffId,
        jobId: createdJob.id,
        assignedBy: actor
      }, client);
    }

    for (const addonId of addonIds) {
      const addon = await repos.seeCatalogue.findAddonById(addonId, client);
      if (addon) {
        await repos.seeOperations.createJobAddon({
          jobId: createdJob.id,
          addonId: addon.id,
          addonNameSnapshot: addon.name,
          executionMode: addon.execution_mode,
          isRequired: !addon.is_optional
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

    return createdJob;
  });

  // Reserve entitlement separately (never consume at creation/assignment)
  if (entitlementAccountId) {
    await seeEntitlementService.mutateEntitlement({
      accountId: entitlementAccountId,
      entryType: 'reserve',
      quantity: 1,
      referenceType: 'service_job',
      referenceId: job.id,
      idempotencyKey: `reserve:job:${job.id}`,
      reason: `Reserved entitlement for job ${job.id}`,
      actor
    });
  }

  return job;
}

/**
 * Assign or reassign a job to an eligible staff member
 */
async function assignJob(jobId, staffId, actor = 'admin') {
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (['completed', 'cancelled'].includes(job.status)) {
    throw new Error(`Cannot assign job in terminal status '${job.status}'.`);
  }

  const jobAddons = await repos.seeOperations.findJobAddons(jobId);
  const elig = await seeStaffCapabilityService.evaluateStaffEligibility(staffId, {
    serviceId: job.service_id,
    serviceCategoryId: job.service_category_id,
    addonIds: jobAddons.map(a => a.addon_id),
    city: job.city,
    zone: job.zone,
    scheduledDate: job.scheduled_date
  });
  if (!elig.eligible) {
    throw new Error(`Staff ineligible for job: ${elig.reasons.join('; ')}`);
  }

  return db.withTransaction(async (client) => {
    await repos.staffAssignments.assignStaffToJob({ staffId, jobId, assignedBy: actor }, client);
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
async function startExecution(jobId, staffId) {
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (!['assigned', 'booked'].includes(job.status)) {
    throw new Error(`Cannot start job in status '${job.status}'.`);
  }

  return db.withTransaction(async (client) => {
    await client.query(
      `UPDATE public.service_jobs SET status = 'in_progress', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [jobId]
    );
    return repos.seeOperations.createExecution({
      jobId,
      staffId,
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
  actor = 'staff'
}) {
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (['completed', 'cancelled', 'failed', 'no_show'].includes(job.status)) {
    throw new Error(`Job '${jobId}' is already in terminal status '${job.status}'.`);
  }

  // 1. Enforce Proof requirements unless authorized exception
  const proofReq = job.proof_requirements || { before_min: 0, after_min: 0, required: false };
  const beforeCount = Array.isArray(proofPhotos.before) ? proofPhotos.before.length : 0;
  const afterCount = Array.isArray(proofPhotos.after) ? proofPhotos.after.length : 0;
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
    const exec = await repos.seeOperations.createExecution({
      jobId,
      staffId,
      endedAt: new Date().toISOString(),
      actualQuantity,
      measurements,
      checklistResults,
      proofPhotos,
      customerConfirmation,
      outcome: authorizedException ? 'partial_exception' : 'completed',
      exceptionReason: authorizedException ? authorizedException.reason : null,
      approvalReference: authorizedException ? authorizedException.approvalReference : null
    }, client);

    await client.query(
      `UPDATE public.service_jobs
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           before_photos = $2,
           after_photos = $3,
           entitlement_consumed = CASE WHEN entitlement_account_id IS NOT NULL THEN TRUE ELSE entitlement_consumed END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId, JSON.stringify(proofPhotos.before || []), JSON.stringify(proofPhotos.after || [])]
    );
    return exec;
  });

  // 4. Idempotent entitlement consumption on valid completion
  if (job.entitlement_account_id) {
    await seeEntitlementService.mutateEntitlement({
      accountId: job.entitlement_account_id,
      entryType: 'consume',
      quantity: 1,
      referenceType: 'service_job',
      referenceId: jobId,
      executionReference: execution.id,
      idempotencyKey: `consume:job:${jobId}`,
      reason: `Consumed entitlement on completion of job ${jobId}`,
      actor
    });
  }

  return execution;
}

/**
 * Cancel, fail, or mark no-show — keeping failed and no_show distinct, and releasing any reservation
 */
async function terminateJobWithoutCompletion(jobId, outcome, { reason, actor = 'staff' }) {
  if (!['cancelled', 'failed', 'no_show'].includes(outcome)) {
    throw new Error(`Invalid non-completion outcome '${outcome}'.`);
  }
  const job = await repos.serviceJobs.findById(jobId);
  if (!job) throw new Error(`Job '${jobId}' not found.`);
  if (['completed', 'cancelled', 'failed', 'no_show'].includes(job.status)) {
    throw new Error(`Job '${jobId}' is already in terminal status '${job.status}'.`);
  }

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE public.service_jobs
       SET status = $2, failure_reason = $3, failed_at = CURRENT_TIMESTAMP, failed_by = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId, outcome, reason || outcome, actor]
    );
    if (outcome !== 'cancelled') {
      await repos.seeOperations.createExecution({
        jobId,
        outcome,
        exceptionReason: reason || outcome
      }, client);
    }
  });

  // Release reserved entitlement if any
  if (job.entitlement_account_id) {
    const acct = await repos.seeEntitlement.findAccountById(job.entitlement_account_id);
    if (acct && acct.reserved_qty > 0) {
      await seeEntitlementService.mutateEntitlement({
        accountId: job.entitlement_account_id,
        entryType: 'release',
        quantity: 1,
        referenceType: 'service_job',
        referenceId: jobId,
        idempotencyKey: `release:job:${jobId}`,
        reason: `Released reservation due to job ${outcome}`,
        actor
      });
    }
  }

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
