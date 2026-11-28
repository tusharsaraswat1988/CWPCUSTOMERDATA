#!/usr/bin/env node
'use strict';

/**
 * Inspect and cleanly remove legacy (non-SEE / non-Hybrid) plans, bookings,
 * and their linked staff assignments while preserving customer profiles,
 * vehicles, locations, staff records, and any canonical SEE/Hybrid records.
 *
 * Usage:
 *   node scripts/cleanup_legacy_plans.js            # Dry-run report only
 *   node scripts/cleanup_legacy_plans.js --execute  # Transactional cleanup
 */

const db = require('../db');

async function inspectLegacyState(client = db) {
  const customersRes = await client.query(
    `SELECT id, customer_code, name, phone, interested_service, is_active
     FROM public.customers
     WHERE deleted_at IS NULL AND COALESCE(is_lead, FALSE) = FALSE
     ORDER BY name ASC`
  );

  const legacySubsRes = await client.query(
    `SELECT sub.id, sub.customer_id, c.name AS customer_name, sub.status,
            sub.service_category_id, sub.package_name
     FROM public.subscriptions sub
     JOIN public.customers c ON c.id = sub.customer_id
     WHERE sub.deleted_at IS NULL
       AND sub.hybrid_membership_id IS NULL
       AND c.deleted_at IS NULL`
  );

  const legacyJobsRes = await client.query(
    `SELECT j.id, j.customer_id, c.name AS customer_name, j.status,
            j.service_category_id, j.service_type, j.package_details
     FROM public.service_jobs j
     JOIN public.customers c ON c.id = j.customer_id
     WHERE j.deleted_at IS NULL
       AND COALESCE(j.service_payload->>'_seeManaged', 'false') <> 'true'
       AND c.deleted_at IS NULL`
  );

  const subIds = legacySubsRes.rows.map(r => r.id);
  const jobIds = legacyJobsRes.rows.map(r => r.id);

  const staffAssignRes = (subIds.length || jobIds.length)
    ? await client.query(
      `SELECT sa.id, sa.staff_id, st.name AS staff_name, st.staff_code,
              sa.subscription_id, sa.job_id
       FROM public.staff_assignments sa
       LEFT JOIN public.staff st ON st.id = sa.staff_id
       WHERE sa.is_active = TRUE
         AND (
           ($1::uuid[] <> '{}'::uuid[] AND sa.subscription_id = ANY($1::uuid[]))
           OR ($2::uuid[] <> '{}'::uuid[] AND sa.job_id = ANY($2::uuid[]))
         )`,
      [subIds, jobIds]
    )
    : { rows: [] };

  const routeSeqRes = subIds.length
    ? await client.query(
      `SELECT id, staff_id, subscription_id
       FROM public.staff_route_sequences
       WHERE subscription_id = ANY($1::uuid[])`,
      [subIds]
    )
    : { rows: [] };

  const subVehRes = subIds.length
    ? await client.query(
      `SELECT id, subscription_id, vehicle_id
       FROM public.subscription_vehicles
       WHERE subscription_id = ANY($1::uuid[])`,
      [subIds]
    )
    : { rows: [] };

  let legacyCustPkgs = [];
  const custPkgTbl = await client.query("SELECT to_regclass('public.customer_packages') AS tbl");
  if (custPkgTbl.rows[0]?.tbl) {
    const cpRes = await client.query(
      `SELECT cp.id, cp.customer_id, cp.package_name, cp.status
       FROM public.customer_packages cp
       WHERE cp.deleted_at IS NULL`
    );
    legacyCustPkgs = cpRes.rows;
  }

  let canonicalActiveCustomerIds = new Set();
  const hybTbl = await client.query("SELECT to_regclass('public.hybrid_memberships') AS tbl");
  if (hybTbl.rows[0]?.tbl) {
    const hRes = await client.query(
      `SELECT DISTINCT customer_id FROM public.hybrid_memberships
       WHERE status IN ('active', 'renewal_pending', 'provisioning', 'pending_provisioning', 'cancellation_pending')`
    );
    hRes.rows.forEach(r => canonicalActiveCustomerIds.add(r.customer_id));
  }
  const entTbl = await client.query("SELECT to_regclass('public.entitlement_accounts') AS tbl");
  if (entTbl.rows[0]?.tbl) {
    const eRes = await client.query(
      `SELECT DISTINCT customer_id FROM public.entitlement_accounts
       WHERE status = 'active' AND COALESCE(remaining_qty, 0) > 0`
    );
    eRes.rows.forEach(r => canonicalActiveCustomerIds.add(r.customer_id));
  }

  const customersToResetInterest = customersRes.rows.filter(
    c => !canonicalActiveCustomerIds.has(c.id)
      && c.interested_service
      && c.interested_service.trim().toLowerCase() !== 'none'
  );

  return {
    totalCustomers: customersRes.rows.length,
    legacySubscriptions: legacySubsRes.rows,
    legacyJobs: legacyJobsRes.rows,
    activeStaffAssignments: staffAssignRes.rows,
    routeSequenceLinks: routeSeqRes.rows,
    subscriptionVehicleLinks: subVehRes.rows,
    legacyCustomerPackages: legacyCustPkgs,
    customersToResetInterest
  };
}

async function run() {
  const execute = process.argv.includes('--execute');

  if (!execute) {
    const report = await inspectLegacyState();
    console.log(JSON.stringify({
      mode: 'DRY_RUN',
      summary: {
        totalCustomers: report.totalCustomers,
        legacySubscriptionsCount: report.legacySubscriptions.length,
        legacyJobsCount: report.legacyJobs.length,
        activeStaffAssignmentsToUnassign: report.activeStaffAssignments.length,
        routeSequenceLinksToDelete: report.routeSequenceLinks.length,
        subscriptionVehicleLinksToDelete: report.subscriptionVehicleLinks.length,
        legacyCustomerPackagesCount: report.legacyCustomerPackages.length,
        customersToResetInterestedService: report.customersToResetInterest.length
      },
      sampleLegacySubscriptions: report.legacySubscriptions.slice(0, 10),
      sampleLegacyJobs: report.legacyJobs.slice(0, 10),
      staffAssignments: report.activeStaffAssignments,
      customersToResetInterest: report.customersToResetInterest.map(c => ({
        id: c.id,
        name: c.name,
        interested_service: c.interested_service
      }))
    }, null, 2));
    return;
  }

  const result = await db.withTransaction(async (client) => {
    const report = await inspectLegacyState(client);
    const subIds = report.legacySubscriptions.map(r => r.id);
    const jobIds = report.legacyJobs.map(r => r.id);
    const cpIds = report.legacyCustomerPackages.map(r => r.id);
    const custResetIds = report.customersToResetInterest.map(c => c.id);
    const reason = 'Legacy plan cleanup — migrating to Catalogue packages';

    let unassignedStaffCount = 0;
    if (subIds.length || jobIds.length) {
      const saRes = await client.query(
        `UPDATE public.staff_assignments
         SET is_active = FALSE,
             unassigned_at = CURRENT_TIMESTAMP,
             unassigned_by = 'admin',
             unassignment_reason = $3
         WHERE is_active = TRUE
           AND (
             ($1::uuid[] <> '{}'::uuid[] AND subscription_id = ANY($1::uuid[]))
             OR ($2::uuid[] <> '{}'::uuid[] AND job_id = ANY($2::uuid[]))
           )`,
        [subIds, jobIds, reason]
      );
      unassignedStaffCount = saRes.rowCount;
    }

    let deletedRouteSeqs = 0;
    let deletedSubVehs = 0;
    let removedSubs = 0;
    if (subIds.length) {
      const seqDel = await client.query(
        'DELETE FROM public.staff_route_sequences WHERE subscription_id = ANY($1::uuid[])',
        [subIds]
      );
      deletedRouteSeqs = seqDel.rowCount;

      const svDel = await client.query(
        'DELETE FROM public.subscription_vehicles WHERE subscription_id = ANY($1::uuid[])',
        [subIds]
      );
      deletedSubVehs = svDel.rowCount;

      const subUpd = await client.query(
        `UPDATE public.subscriptions
         SET status = 'cancelled',
             stopped_reason = COALESCE(stopped_reason, $2),
             stopped_by = COALESCE(stopped_by, 'admin'),
             stopped_at = COALESCE(stopped_at, CURRENT_TIMESTAMP),
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [subIds, reason]
      );
      removedSubs = subUpd.rowCount;
    }

    let removedJobs = 0;
    if (jobIds.length) {
      const jobUpd = await client.query(
        `UPDATE public.service_jobs
         SET status = CASE WHEN status IN ('completed', 'cancelled') THEN status ELSE 'cancelled' END,
             cancellation_reason = COALESCE(cancellation_reason, $2),
             cancelled_by = COALESCE(cancelled_by, 'admin'),
             cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [jobIds, reason]
      );
      removedJobs = jobUpd.rowCount;
    }

    let removedCustPkgs = 0;
    if (cpIds.length) {
      const cpUpd = await client.query(
        `UPDATE public.customer_packages
         SET status = 'cancelled',
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [cpIds]
      );
      removedCustPkgs = cpUpd.rowCount;
    }

    let resetCustomers = 0;
    if (custResetIds.length) {
      const cUpd = await client.query(
        `UPDATE public.customers
         SET interested_service = 'None',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [custResetIds]
      );
      resetCustomers = cUpd.rowCount;
    }

    const summary = {
      mode: 'EXECUTED',
      unassignedStaffCount,
      deletedRouteSeqs,
      deletedSubVehs,
      removedSubs,
      removedJobs,
      removedCustPkgs,
      resetCustomers
    };

    await client.query(
      `INSERT INTO public.audit_logs (entity_type, entity_id, action, changed_by, after_state)
       VALUES ('system', $1, 'cleanup_legacy_plans', 'admin', $2::jsonb)`,
      [`legacy_cleanup_${Date.now()}`, JSON.stringify(summary)]
    );

    return summary;
  });

  console.log(JSON.stringify(result, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cleanup_legacy_plans] Failed:', err);
    process.exit(1);
  });
