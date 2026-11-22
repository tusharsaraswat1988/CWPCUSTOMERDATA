/**
 * =========================================================================
 * CWP DATA APP - OFFLINE SYNCHRONIZATION SERVICE
 * Phase 5: Resilient, Idempotent Field Synchronization with Conflict Handling
 * =========================================================================
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');

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

    try {
      // Execute each checkoff safely within transaction
      const outcome = await db.withTransaction(async (client) => {
        // Resolve target IDs (subscription / vehicle or job)
        let subId = item.subscriptionId || null;
        let vehId = item.vehicleId || null;
        let jobId = item.jobId || null;

        // Strict Authorization: Verify this subscription or job is actively assigned to this staff
        if (subId) {
          const assignment = await repos.staffAssignments.findActiveBySubscriptionId(subId, client);
          if (assignment && assignment.staff_id !== staff.id) {
            throw new Error(`Unauthorized: Subscription ${subId} is assigned to another staff member.`);
          }
        }
        if (jobId) {
          const jobAssignment = await repos.staffAssignments.findActiveByJobId(jobId, client);
          if (jobAssignment && jobAssignment.staff_id !== staff.id) {
            throw new Error(`Unauthorized: Job ${jobId} is assigned to another staff member.`);
          }
        }

        // 1. Check if an existing completion already exists for (subId, vehId, date) or jobId
        let existingConflict = null;
        if (subId && vehId) {
          existingConflict = await repos.serviceLogs.findBySubscriptionVehicleAndDate(subId, vehId, istServiceDate, client);
        } else if (jobId) {
          existingConflict = await repos.serviceLogs.findByJobId(jobId, client);
        }

        if (existingConflict) {
          if (existingConflict.status === (item.status || 'completed')) {
            // Exactly matching status: acknowledged idempotently
            return {
              status: 'synced',
              mutationId,
              idempotent: true,
              logId: existingConflict.id,
              serviceDate: istServiceDate
            };
          } else {
            // Conflict: Status mismatch (e.g. Admin marked unavailable, but Staff uploads completed with photo)
            await repos.serviceLogs.resolveConflict({
              id: existingConflict.id,
              status: item.status || 'completed',
              notes: `${existingConflict.notes ? existingConflict.notes + ' | ' : ''}Staff Sync Override: ${item.notes || 'Field checkoff'}`,
              conflictResolved: true
            }, client);

            // Audit the conflict resolution
            await repos.auditLogs.logChange({
              entityType: 'service_logs',
              entityId: existingConflict.id,
              action: 'conflict_resolution',
              changedBy: staff.staff_code,
              beforeState: { status: existingConflict.status, notes: existingConflict.notes },
              afterState: { status: item.status || 'completed', conflictResolved: true },
              ipAddress: clientIp
            }, client);

            return {
              status: 'conflict_resolved',
              mutationId,
              logId: existingConflict.id,
              serviceDate: istServiceDate
            };
          }
        }

        // 2. Insert standard completion log with client_mutation_id idempotency guard
        const isCarNotPresent = Boolean(item.carNotPresent || item.tag === 'car_not_present');
        const insertRes = await repos.serviceLogs.recordCompletion({
          clientMutationId: mutationId,
          staffId: staff.id,
          subscriptionId: subId,
          vehicleId: vehId,
          jobId: jobId,
          serviceDate: istServiceDate,
          status: item.status || (isCarNotPresent ? 'car_not_present' : 'completed'),
          completedAtDevice: completedAtDevice,
          notes: item.notes || null,
          photoUrl: item.photoUrl || null,
          source: 'staff_portal',
          deviceMetadata: item.deviceMetadata || null,
          carNotPresent: isCarNotPresent,
          tag: item.tag || (isCarNotPresent ? 'car_not_present' : null)
        }, client);

        // If job was dispatched, update service_jobs status to 'completed'
        if (jobId) {
          await repos.serviceJobs.updateJobStatus(jobId, 'completed', client);
        }

        return {
          status: 'synced',
          mutationId,
          logId: insertRes.log?.id,
          serviceDate: istServiceDate,
          idempotent: insertRes.idempotent || false
        };
      });

      results.push(outcome);
    } catch (err) {
      console.error(`[OfflineSync] Error processing mutation ${mutationId}:`, err.message);
      results.push({
        status: 'error',
        mutationId,
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
