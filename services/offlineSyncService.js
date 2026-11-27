/**
 * =========================================================================
 * CWP DATA APP - OFFLINE SYNCHRONIZATION SERVICE
 * Phase 5: Resilient, Idempotent Field Synchronization with Conflict Handling
 * =========================================================================
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');
const dccService = require('./dccService');
const packageService = require('./packageService');
const { detectSeeManagedJob } = require('./seeExecutionService');

const TERMINAL_JOB_STATUSES = ['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'];

/**
 * Process a batch of completion events uploaded from a staff field device
 */
async function processCompletionBatch({ staffCodeOrId, completions = [], clientIp = null }) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return { success: true, processed: 0, results: [] };
  }

  // 1. Resolve Staff
  let staff = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffCodeOrId)) {
    staff = await repos.staff.findById(staffCodeOrId);
  } else {
    staff = await repos.staff.findByStaffCode(staffCodeOrId);
  }

  if (!staff) {
    throw new Error(`Staff member '${staffCodeOrId}' not found.`);
  }

  const results = [];

  for (const item of completions) {
    const mutationId = item.clientMutationId || item.mutationId;
    if (!mutationId) {
      results.push({
        status: 'error',
        error: 'Missing clientMutationId UUID for offline idempotency guard'
      });
      continue;
    }

    const completedAtDevice = item.completedAtDevice || new Date().toISOString();
    const istServiceDate = repos.serviceLogs.computeIstServiceDate(completedAtDevice);
    const isCarNotPresent = Boolean(item.carNotPresent || item.tag === 'car_not_present');
    const targetStatus = item.status || (isCarNotPresent ? 'car_not_present' : 'completed');

    try {
      const outcome = await db.withTransaction(async (client) => {
        const subId = item.subscriptionId || null;
        const vehId = item.vehicleId || null;
        const jobId = item.jobId || null;

        // -------------------------------------------------------------------
        // PATH A: Service Job Sync (Legacy Jobs Only; SEE Jobs Rejected)
        // -------------------------------------------------------------------
        if (jobId) {
          const job = await repos.serviceJobs.findByIdForUpdate(jobId, client);
          if (!job) {
            throw new Error(`Job '${jobId}' not found.`);
          }

          // P0-B Guard: Canonical SEE-managed jobs must NEVER sync through generic offline endpoint
          // Check BEFORE staff assignment so any offline attempt on an SEE job returns SEE_CANONICAL_COMPLETION_REQUIRED
          if (await detectSeeManagedJob(job, client)) {
            const seeErr = new Error(
              `SEE_CANONICAL_COMPLETION_REQUIRED: Job '${jobId}' is a canonical SEE-managed job. ` +
              `Use canonical SEE completion endpoint with full checklist, proof, and entitlement validation.`
            );
            seeErr.code = 'SEE_CANONICAL_COMPLETION_REQUIRED';
            seeErr.jobId = jobId;
            seeErr.retryVia = `/api/see/jobs/${jobId}/complete`;
            throw seeErr;
          }

          // Strict Authorization: job must be actively assigned to this staff (no job.staff_id fallback)
          const jobAssignment = await repos.staffAssignments.findActiveByJobId(jobId, client);
          if (!jobAssignment || String(jobAssignment.staff_id) !== String(staff.id)) {
            throw new Error(`Unauthorized: Job ${jobId} is not assigned to this staff member.`);
          }

          // Idempotency replay guard by clientMutationId (with cross-entity collision protection)
          const existingByMut = await repos.serviceLogs.findByClientMutationId(mutationId, client);
          if (existingByMut) {
            if (String(existingByMut.job_id || '') !== String(jobId) || existingByMut.subscription_id) {
              throw new Error(`clientMutationId '${mutationId}' has already been used for another record.`);
            }
            return {
              status: 'synced',
              mutationId,
              idempotent: true,
              logId: existingByMut.id,
              serviceDate: existingByMut.service_date || istServiceDate
            };
          }

          // Prevent duplicate or post-terminal completion for legacy jobs
          const existingJobLog = await repos.serviceLogs.findByJobId(jobId, client);
          if (TERMINAL_JOB_STATUSES.includes(job.status)) {
            if (existingJobLog && existingJobLog.client_mutation_id === mutationId) {
              return {
                status: 'synced',
                mutationId,
                idempotent: true,
                logId: existingJobLog.id,
                serviceDate: existingJobLog.service_date || istServiceDate
              };
            }
            throw new Error(`Job '${jobId}' is already in terminal status '${job.status}'.`);
          }

          let logRecord = null;
          let logIdempotent = false;
          if (existingJobLog) {
            if (existingJobLog.status === 'completed') {
              throw new Error(`Job '${jobId}' already has a completed service log.`);
            }
            // Prior non-completion outcome (e.g., unable_to_complete / car_not_present):
            // update in place inside the tx instead of inserting (avoids uq_service_logs_job_once 23505/25P02 tx abort & split state)
            const mergedNotes = item.notes
              ? `${existingJobLog.notes ? existingJobLog.notes + ' | ' : ''}${String(item.notes).trim()}`
              : existingJobLog.notes;
            const updLogRes = await client.query(
              `UPDATE public.service_logs
               SET status = $2,
                   client_mutation_id = $3,
                   staff_id = $4,
                   service_date = $5,
                   completed_at_device = $6,
                   notes = $7,
                   photo_url = COALESCE($8, photo_url),
                   car_not_present = $9,
                   tag = $10,
                   conflict_resolved = TRUE,
                   synced_at_server = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING *`,
              [
                existingJobLog.id,
                targetStatus,
                mutationId,
                staff.id,
                istServiceDate,
                completedAtDevice,
                mergedNotes || null,
                item.photoUrl || null,
                isCarNotPresent,
                item.tag || (isCarNotPresent ? 'car_not_present' : null)
              ]
            );
            logRecord = updLogRes.rows[0] || existingJobLog;
          } else {
            const insertRes = await repos.serviceLogs.recordCompletion({
              clientMutationId: mutationId,
              staffId: staff.id,
              subscriptionId: null,
              vehicleId: job.vehicle_id || vehId,
              jobId,
              serviceDate: istServiceDate,
              status: targetStatus,
              completedAtDevice,
              notes: item.notes || null,
              photoUrl: item.photoUrl || null,
              source: 'staff_portal',
              deviceMetadata: item.deviceMetadata || null,
              carNotPresent: isCarNotPresent,
              tag: item.tag || (isCarNotPresent ? 'car_not_present' : null)
            }, client);
            logRecord = insertRes.log || null;
            logIdempotent = Boolean(insertRes.idempotent);
          }

          // Only mark completed & redeem legacy package when outcome is actually 'completed'
          if (targetStatus === 'completed') {
            let entitlementDeducted = false;
            if (job.package_id && !job.entitlement_consumed) {
              await packageService.redeemPackage({
                packageId: job.package_id,
                quantity: 1,
                vehicleId: job.vehicle_id,
                locationId: job.location_id,
                serviceJobId: job.id,
                notes: `Auto-redeemed upon offline completion of job #${job.id.slice(0, 8)}`,
                adminUser: staff.staff_code || staff.id,
                client
              }, staff.staff_code || staff.id, client);
              entitlementDeducted = true;
            }

            const existingAfter = Array.isArray(job.after_photos) ? job.after_photos : [];
            const nextAfter = item.photoUrl ? [item.photoUrl] : existingAfter;
            const cleanNotes = item.notes ? String(item.notes).trim() : (job.completion_notes || null);
            const nextConsumed = Boolean(job.entitlement_consumed || entitlementDeducted);

            await client.query(
              `UPDATE public.service_jobs
               SET status = 'completed',
                   completed_at = $2,
                   after_photos = $3,
                   completion_notes = $4,
                   entitlement_consumed = $5,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1 AND deleted_at IS NULL`,
              [jobId, completedAtDevice, JSON.stringify(nextAfter), cleanNotes, nextConsumed]
            );
          }

          return {
            status: 'synced',
            mutationId,
            logId: logRecord?.id,
            serviceDate: istServiceDate,
            idempotent: logIdempotent
          };
        }

        // -------------------------------------------------------------------
        // PATH B: Daily Car Cleaning (DCC) Offline Sync
        // -------------------------------------------------------------------
        if (!subId) {
          throw new Error('Either subscriptionId or jobId is required for offline sync.');
        }

        // Strict Authorization: Verify subscription is actively assigned to this staff
        const assignment = await repos.staffAssignments.findActiveBySubscriptionId(subId, client);
        if (assignment && assignment.staff_id !== staff.id) {
          throw new Error(`Unauthorized: Subscription ${subId} is assigned to another staff member.`);
        }
        if (repos.routes && typeof repos.routes.findActiveStopBySubscriptionAndVehicle === 'function') {
          const activeStop = await repos.routes.findActiveStopBySubscriptionAndVehicle(subId, vehId);
          if (activeStop && activeStop.assigned_staff_id && activeStop.assigned_staff_id !== staff.id) {
            throw new Error(`Unauthorized: Route stop for subscription ${subId} is assigned to another staff member.`);
          }
        }

        // Idempotent replay check by clientMutationId BEFORE eligibility so stopped/expired replays stay idempotent
        const existingByMut = await repos.serviceLogs.findByClientMutationId(mutationId, client);
        if (existingByMut) {
          if (
            existingByMut.job_id ||
            String(existingByMut.subscription_id || '') !== String(subId) ||
            (vehId && String(existingByMut.vehicle_id || '') !== String(vehId))
          ) {
            throw new Error(`clientMutationId '${mutationId}' has already been used for another record.`);
          }
          return {
            status: 'synced',
            mutationId,
            idempotent: true,
            logId: existingByMut.id,
            serviceDate: existingByMut.service_date || istServiceDate
          };
        }

        // Transactional DCC Eligibility Validation using client (works under NODE_ENV=test and preserves historical back-syncs)
        const subRes = await client.query(
          `SELECT * FROM public.subscriptions WHERE id = $1 LIMIT 1`,
          [subId]
        );
        const sub = subRes.rows[0] || null;
        if (!sub) {
          throw new Error(`Ineligible for DCC: DCC subscription '${subId}' not found.`);
        }
        if (sub.deleted_at) {
          throw new Error('Ineligible for DCC: DCC subscription has been deleted.');
        }
        if (sub.status !== 'active') {
          throw new Error(`Ineligible for DCC: DCC subscription is not active (status: '${sub.status}').`);
        }
        const endStr = sub.end_date
          ? (sub.end_date instanceof Date ? sub.end_date.toISOString().split('T')[0] : String(sub.end_date).split('T')[0])
          : null;
        if (endStr && istServiceDate > endStr) {
          throw new Error(`Ineligible for DCC: DCC subscription expired on ${endStr} (requested for ${istServiceDate}).`);
        }
        if (vehId) {
          const svRes = await client.query(
            `SELECT vehicle_id FROM public.subscription_vehicles WHERE subscription_id = $1`,
            [subId]
          );
          if (svRes.rows && svRes.rows.length > 0 && !svRes.rows.some(sv => String(sv.vehicle_id) === String(vehId))) {
            throw new Error(`Ineligible for DCC: Vehicle '${vehId}' is not enrolled under subscription '${subId}'.`);
          }
        }

        // Check existing daily record for (subscriptionId, vehicleId, serviceDate)
        const existingConflict = (subId && vehId)
          ? await repos.serviceLogs.findBySubscriptionVehicleAndDate(subId, vehId, istServiceDate, client)
          : null;

        if (existingConflict) {
          if (existingConflict.status === targetStatus) {
            return {
              status: 'synced',
              mutationId,
              idempotent: true,
              logId: existingConflict.id,
              serviceDate: istServiceDate
            };
          }

          // Protect already-completed daily cleans from being overwritten by non-completed staff syncs
          if (existingConflict.status === 'completed' && targetStatus !== 'completed') {
            throw new Error(
              `Conflict rejected: Vehicle already has a 'completed' log for ${istServiceDate}; ` +
              `non-admin offline sync cannot overwrite completed status with '${targetStatus}'.`
            );
          }

          await repos.serviceLogs.resolveConflict({
            id: existingConflict.id,
            status: targetStatus,
            notes: `${existingConflict.notes ? existingConflict.notes + ' | ' : ''}Staff Sync Override: ${item.notes || 'Field checkoff'}`,
            conflictResolved: true
          }, client);

          await repos.auditLogs.logChange({
            entityType: 'service_logs',
            entityId: existingConflict.id,
            action: 'conflict_resolution',
            changedBy: staff.staff_code,
            beforeState: { status: existingConflict.status, notes: existingConflict.notes },
            afterState: { status: targetStatus, conflictResolved: true },
            ipAddress: clientIp
          }, client);

          return {
            status: 'conflict_resolved',
            mutationId,
            logId: existingConflict.id,
            serviceDate: istServiceDate
          };
        }

        const insertRes = await repos.serviceLogs.recordCompletion({
          clientMutationId: mutationId,
          staffId: staff.id,
          subscriptionId: subId,
          vehicleId: vehId,
          jobId: null,
          serviceDate: istServiceDate,
          status: targetStatus,
          completedAtDevice,
          notes: item.notes || null,
          photoUrl: item.photoUrl || null,
          source: 'staff_portal',
          deviceMetadata: item.deviceMetadata || null,
          carNotPresent: isCarNotPresent,
          tag: item.tag || (isCarNotPresent ? 'car_not_present' : null)
        }, client);

        return {
          status: 'synced',
          mutationId,
          logId: insertRes.log?.id,
          serviceDate: istServiceDate,
          idempotent: Boolean(insertRes.idempotent)
        };
      });

      results.push(outcome);
    } catch (err) {
      console.error(`[OfflineSync] Error processing mutation ${mutationId}:`, err.message);
      results.push({
        status: 'error',
        mutationId,
        ...(err.code ? { code: err.code } : {}),
        ...(err.jobId ? { jobId: err.jobId } : {}),
        ...(err.retryVia ? { retryVia: err.retryVia } : {}),
        error: err.message
      });
    }
  }

  const successCount = results.filter(r => r.status === 'synced' || r.status === 'conflict_resolved').length;
  return {
    success: true,
    processed: results.length,
    syncedCount: successCount,
    results
  };
}

module.exports = {
  processCompletionBatch
};
