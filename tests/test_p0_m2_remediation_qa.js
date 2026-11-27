/**
 * =========================================================================
 * P0 M2 Remediation QA Suite
 * Covers all 6 Reviewer findings & 10 Challenger defect clusters (F7, F8, F9)
 * =========================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const { createP0E2EHarness } = require('./helpers/p0_e2e_harness');

const harness = createP0E2EHarness();

let passed = 0;
let failed = 0;

async function test(id, name, fn) {
  harness.reset();
  try {
    await fn();
    console.log(`PASS [${id}] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`FAIL [${id}] ${name}\n   ${err.stack || err.message}`);
    failed += 1;
  }
}

const VALID_CHECKLIST = [
  { id: 'exterior_clean', completed: true },
  { id: 'glass_clean', completed: true },
  { id: 'wheel_clean', completed: true }
];
const VALID_PROOF = {
  before: ['https://cdn.example.com/b.jpg'],
  after: ['https://cdn.example.com/a.jpg']
};

async function setupSeeJobFixture({ checklistRequirements = null, includeAddon = false } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
  const { service, addon, pkg } = await harness.seedSeeServiceAndPackage({
    packageQuantity: 3,
    includeAddon,
    ...(checklistRequirements ? { checklistRequirements } : {})
  });
  const tokens = harness.createAuthTokens({ staff });
  const purch = await harness.withTransactionalDbMode(() =>
    harness.services.seeEntitlement.createPurchase({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      packageIdOrCode: pkg.id,
      saleReference: `M2_${crypto.randomUUID()}`
    })
  );
  const mainAcct = purch.accounts.find(a => a.service_id === service.id);
  const job = await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.createCanonicalJob({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purch.snapshot.id,
      staffId: staff.id,
      addonIds: addon ? [addon.id] : [],
      actor: 'qa_admin'
    })
  );
  return { customer, location, vehicle, staff, service, addon, pkg, mainAcct, job, tokens };
}

async function setupLegacyJobFixture({ withPackage = true, totalQuantity = 3, assignStaff = true } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
  const tokens = harness.createAuthTokens({ staff });
  let legacyPkg = null;
  if (withPackage) {
    legacyPkg = (await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        serviceCategoryId: 'car_washing',
        packageCode: 'WASH_SUB_4',
        packageName: 'Legacy Wash Pack',
        totalQuantity,
        unitPrice: 500,
        totalPrice: 500 * totalQuantity
      }, 'qa_admin')
    )).package;
  }
  const job = (await harness.withTransactionalDbMode(() =>
    harness.services.booking.createBooking({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Legacy Car Wash',
      packageId: legacyPkg ? legacyPkg.id : null,
      staffId: assignStaff ? staff.id : null
    }, 'qa_admin')
  )).job;
  return { customer, location, vehicle, staff, legacyPkg, job, tokens };
}

async function setupDccFixture({ assignedStaff = null, status = 'active', startDate = '2026-11-01', endDate = '2026-12-31' } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = assignedStaff || await harness.seedStaff({ workType: 'dcc_only', serviceCapabilities: ['daily_car_cleaning'] });
  const tokens = harness.createAuthTokens({ staff });
  const sub = (await harness.withTransactionalDbMode(() =>
    harness.services.dcc.createSubscription({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      staffId: staff.id,
      packageName: 'DCC 30D',
      startDate,
      endDate
    }, 'qa_admin')
  )).subscription;
  if (status !== 'active') {
    await harness.engine.query(`UPDATE public.subscriptions SET status = $2 WHERE id = $1`, [sub.id, status]);
  }
  return { customer, location, vehicle, staff, subscription: sub, tokens };
}

async function run() {
  // =========================================================================
  // M2-R01: Unassigned SEE job via syncCompletions & strict staff_assignments
  // =========================================================================
  await test('M2-R01', 'Unassigned staff on SEE syncCompletions returns SEE_CANONICAL_COMPLETION_REQUIRED + jobId; stale job.staff_id rejected', async () => {
    const seeCtx = await setupSeeJobFixture();
    const otherStaff = await harness.seedStaff({ name: 'Other Staff', workType: 'dcc_and_services' });
    const otherTok = harness.createAuthTokens({ staff: otherStaff });

    const rSee = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: seeCtx.job.id,
        status: 'completed'
      }]
    }, otherTok.staffToken);

    assert.strictEqual(rSee.statusCode, 200);
    assert.strictEqual(rSee.body.results[0].status, 'error');
    assert.strictEqual(rSee.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    assert.strictEqual(rSee.body.results[0].jobId, seeCtx.job.id);
    assert.strictEqual(rSee.body.results[0].retryVia, `/api/see/jobs/${seeCtx.job.id}/complete`);

    // Legacy job with deactivated staff_assignments but stale job.staff_id must be rejected
    const legCtx = await setupLegacyJobFixture({ assignStaff: true });
    await harness.withTransactionalDbMode(() =>
      harness.repos.staffAssignments.unassignJob({ jobId: legCtx.job.id, unassignedBy: 'admin', reason: 'Unassigned' })
    );
    await harness.engine.query(`UPDATE public.service_jobs SET staff_id = $2 WHERE id = $1`, [legCtx.job.id, legCtx.staff.id]);

    const rLeg = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: legCtx.job.id,
        status: 'completed'
      }]
    }, legCtx.tokens.staffToken);
    assert.strictEqual(rLeg.body.results[0].status, 'error');
    assert.ok(/not assigned/i.test(rLeg.body.results[0].error));
  });

  // =========================================================================
  // M2-R02: serviceJobsRepo.updateJobStatus terminal guard & softDelete on cancelled/terminated
  // =========================================================================
  await test('M2-R02', 'serviceJobsRepo.updateJobStatus blocks all 5 terminal statuses; softDelete works on cancelled/terminated jobs', async () => {
    const terminalStatuses = ['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete'];
    for (const st of terminalStatuses) {
      harness.reset();
      const leg = await setupLegacyJobFixture({ withPackage: false });
      await harness.engine.query(`UPDATE public.service_jobs SET status = $2 WHERE id = $1`, [leg.job.id, st]);
      await assert.rejects(() =>
        harness.withTransactionalDbMode(() =>
          harness.repos.serviceJobs.updateJobStatus(leg.job.id, 'assigned')
        ),
        /terminal/i
      );
      assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === leg.job.id).status, st);
    }

    // softDelete on cancelled SEE job via deleteSpecialJob sets deleted_at & deactivates staff_assignments
    harness.reset();
    const seeCtx = await setupSeeJobFixture();
    await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.terminateJobWithoutCompletion(seeCtx.job.id, 'cancelled', { reason: 'Customer cancelled', actor: 'qa_admin' })
    );
    const delRes = await harness.postApi({
      action: 'deleteSpecialJob',
      jobId: seeCtx.job.id,
      reason: 'Cleanup cancelled job'
    }, seeCtx.tokens.adminToken);
    assert.strictEqual(delRes.statusCode, 200);
    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === seeCtx.job.id);
    assert.ok(jobRow.deleted_at, 'softDelete must set deleted_at on already-cancelled SEE job');
    assert.strictEqual(harness.getTableRows('staff_assignments').filter(sa => sa.job_id === seeCtx.job.id && sa.is_active).length, 0);
  });

  // =========================================================================
  // M2-R03: Offline sync Path B replay-before-eligibility & cross-entity collision
  // =========================================================================
  await test('M2-R03', 'Offline Path B replays stopped/expired DCC idempotently and rejects cross-entity clientMutationId reuse', async () => {
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });
    const dcc1 = await setupDccFixture({ assignedStaff: staff });
    const dcc2 = await setupDccFixture({ assignedStaff: staff });
    const leg = await setupLegacyJobFixture({ assignStaff: false });
    await harness.withTransactionalDbMode(() =>
      harness.repos.staffAssignments.assignStaffToJob({ staffId: staff.id, jobId: leg.job.id, assignedBy: 'qa' })
    );

    const dccMut = crypto.randomUUID();
    const first = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: dccMut,
        subscriptionId: dcc1.subscription.id,
        vehicleId: dcc1.vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/1.jpg'
      }]
    }, tokens.staffToken);
    assert.strictEqual(first.body.results[0].status, 'synced');

    // Stop subscription, then replay same mutationId -> must return idempotent: true
    await harness.engine.query(`UPDATE public.subscriptions SET status = 'stopped' WHERE id = $1`, [dcc1.subscription.id]);
    const replayStopped = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: dccMut,
        subscriptionId: dcc1.subscription.id,
        vehicleId: dcc1.vehicle.id,
        status: 'completed'
      }]
    }, tokens.staffToken);
    assert.strictEqual(replayStopped.body.results[0].status, 'synced');
    assert.strictEqual(replayStopped.body.results[0].idempotent, true);

    // Cross-entity reuse: DCC mut -> other DCC sub, DCC mut -> legacy job, legacy mut -> DCC sub
    const legMut = crypto.randomUUID();
    await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: legMut, jobId: leg.job.id, status: 'completed' }]
    }, tokens.staffToken);

    const cross = await harness.postApi({
      action: 'syncCompletions',
      completions: [
        { clientMutationId: dccMut, subscriptionId: dcc2.subscription.id, vehicleId: dcc2.vehicle.id, status: 'completed' },
        { clientMutationId: legMut, subscriptionId: dcc2.subscription.id, vehicleId: dcc2.vehicle.id, status: 'completed' },
        { clientMutationId: dccMut, jobId: leg.job.id, status: 'completed' }
      ]
    }, tokens.staffToken);
    assert.strictEqual(cross.body.results[0].status, 'error');
    assert.strictEqual(cross.body.results[1].status, 'error');
    assert.strictEqual(cross.body.results[2].status, 'error');
  });

  // =========================================================================
  // M2-R04: Legacy non-completion offline sync -> subsequent completion (no split state / 23505)
  // =========================================================================
  await test('M2-R04', 'Legacy unable_to_complete offline sync followed by completed sync updates service_logs atomically without split state', async () => {
    const leg = await setupLegacyJobFixture({ withPackage: true, totalQuantity: 3 });

    const r1 = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: leg.job.id,
        status: 'unable_to_complete',
        notes: 'Gate locked'
      }]
    }, leg.tokens.staffToken);
    assert.strictEqual(r1.body.results[0].status, 'synced');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === leg.job.id).status, 'assigned');
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === leg.legacyPkg.id).remaining_quantity, 3);

    const r2 = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: leg.job.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/done.jpg',
        notes: 'Gate opened'
      }]
    }, leg.tokens.staffToken);
    assert.strictEqual(r2.body.results[0].status, 'synced');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === leg.job.id).status, 'completed');
    const logs = harness.getTableRows('service_logs').filter(l => l.job_id === leg.job.id);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].status, 'completed');
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === leg.legacyPkg.id).remaining_quantity, 2);
  });

  // =========================================================================
  // M2-R05: Historical DCC back-sync & direct NODE_ENV=test offlineSyncService call
  // =========================================================================
  await test('M2-R05', 'Direct offlineSyncService call in NODE_ENV=test supports historical back-sync (< start_date) while blocking expired/unenrolled', async () => {
    const dcc = await setupDccFixture({ startDate: '2026-11-27', endDate: '2026-12-31' });
    const otherVeh = (await harness.seedCustomerAndAssets()).vehicle;

    // Directly invoke offlineSyncService with NODE_ENV=test while db queries run against the engine
    assert.strictEqual(process.env.NODE_ENV, 'test');
    const origFindByCode = harness.repos.staff.findByStaffCode;
    harness.repos.staff.findByStaffCode = async () => dcc.staff;
    let backRes;
    let badRes;
    try {
      backRes = await harness.services.offlineSync.processCompletionBatch({
        staffCodeOrId: dcc.staff.staff_code,
        completions: [{
          clientMutationId: crypto.randomUUID(),
          subscriptionId: dcc.subscription.id,
          vehicleId: dcc.vehicle.id,
          completedAtDevice: '2026-11-21T07:15:00+05:30',
          status: 'completed',
          notes: 'Historical back-sync'
        }]
      });

      badRes = await harness.services.offlineSync.processCompletionBatch({
        staffCodeOrId: dcc.staff.staff_code,
        completions: [
          {
            clientMutationId: crypto.randomUUID(),
            subscriptionId: dcc.subscription.id,
            vehicleId: dcc.vehicle.id,
            completedAtDevice: '2027-01-05T07:15:00+05:30',
            status: 'completed'
          },
          {
            clientMutationId: crypto.randomUUID(),
            subscriptionId: dcc.subscription.id,
            vehicleId: otherVeh.id,
            completedAtDevice: '2026-11-27T07:15:00+05:30',
            status: 'completed'
          }
        ]
      });
    } finally {
      harness.repos.staff.findByStaffCode = origFindByCode;
    }
    assert.strictEqual(backRes.results[0].status, 'synced');
    assert.strictEqual(badRes.results[0].status, 'error');
    assert.strictEqual(badRes.results[1].status, 'error');
  });

  // =========================================================================
  // M2-R06: reassignSpecialJob SEE unassign -> 'booked', terminal & in_progress guards
  // =========================================================================
  await test('M2-R06', 'reassignSpecialJob routes SEE unassign to booked, blocks in_progress unassign, and blocks all terminal statuses', async () => {
    const seeCtx = await setupSeeJobFixture();

    const unassignSee = await harness.postApi({
      action: 'reassignSpecialJob',
      jobId: seeCtx.job.id,
      unassign: true,
      reason: 'Staff on leave'
    }, seeCtx.tokens.adminToken);
    assert.strictEqual(unassignSee.statusCode, 200);
    assert.strictEqual(unassignSee.body.status, 'booked');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeCtx.job.id).status, 'booked');
    assert.strictEqual(harness.getTableRows('staff_assignments').filter(sa => sa.job_id === seeCtx.job.id && sa.is_active).length, 0);

    // Reassign back, start job (in_progress), then unassign must be rejected
    await harness.withTransactionalDbMode(() => harness.services.seeExecution.assignJob(seeCtx.job.id, seeCtx.staff.id, 'qa_admin'));
    await harness.withTransactionalDbMode(() => harness.services.seeExecution.startExecution(seeCtx.job.id, seeCtx.staff.id, { beforePhotos: VALID_PROOF.before }));

    const unassignInProg = await harness.postApi({
      action: 'reassignSpecialJob',
      jobId: seeCtx.job.id,
      toStaffId: 'unassigned'
    }, seeCtx.tokens.adminToken);
    assert.strictEqual(unassignInProg.statusCode, 400);

    // Terminal statuses rejected by adminService.reassignSpecialJob
    for (const st of ['completed', 'cancelled', 'failed', 'no_show', 'unable_to_complete']) {
      const leg = await setupLegacyJobFixture({ withPackage: false });
      await harness.engine.query(`UPDATE public.service_jobs SET status = $2 WHERE id = $1`, [leg.job.id, st]);
      const res = await harness.withTransactionalDbMode(() =>
        harness.services.admin.reassignSpecialJob({ jobId: leg.job.id, newStaffId: leg.staff.id })
      );
      assert.strictEqual(res.success, false, `Terminal status ${st} must be rejected`);
    }
  });

  // =========================================================================
  // M2-R07: deleteSpecialJob & stopCustomerService deactivate staff_assignments
  // =========================================================================
  await test('M2-R07', 'deleteSpecialJob & stopCustomerService deactivate active staff_assignments inside transaction', async () => {
    const seeCtx1 = await setupSeeJobFixture();
    const delRes = await harness.postApi({ action: 'deleteSpecialJob', jobId: seeCtx1.job.id, reason: 'Deleted' }, seeCtx1.tokens.adminToken);
    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(harness.getTableRows('staff_assignments').filter(sa => sa.job_id === seeCtx1.job.id && sa.is_active).length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeCtx1.mainAcct.id).reserved_qty, 0);

    harness.reset();
    const seeCtx2 = await setupSeeJobFixture();
    const stopRes = await harness.postApi({ action: 'stopCustomerService', customerId: seeCtx2.customer.id, reason: 'Paused' }, seeCtx2.tokens.adminToken);
    assert.strictEqual(stopRes.statusCode, 200);
    assert.strictEqual(harness.getTableRows('staff_assignments').filter(sa => sa.job_id === seeCtx2.job.id && sa.is_active).length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeCtx2.mainAcct.id).reserved_qty, 0);
  });

  // =========================================================================
  // M2-R08: recordDailyCleanWithPhoto Neon guards & completeSpecialJob legacy single log
  // =========================================================================
  await test('M2-R08', 'recordDailyCleanWithPhoto enforces subscriptionId+vehicleId, isDccEligible, and blocks completed overwrite (400)', async () => {
    const dcc = await setupDccFixture();
    const svcOnlyStaff = await harness.seedStaff({ workType: 'services_only', serviceCapabilities: ['car_washing'] });
    const svcOnlyTok = harness.createAuthTokens({ staff: svcOnlyStaff });

    // 1. Missing vehicleId/subscriptionId -> 400
    const missingVeh = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc.subscription.id,
      status: 'completed',
      photoUrl: 'https://cdn.example.com/1.jpg'
    }, dcc.tokens.staffToken);
    assert.strictEqual(missingVeh.statusCode, 400);

    // 2. services_only staff -> 403
    const nonDcc = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc.subscription.id,
      vehicleId: dcc.vehicle.id,
      status: 'completed',
      photoUrl: 'https://cdn.example.com/1.jpg'
    }, svcOnlyTok.staffToken);
    assert.strictEqual(nonDcc.statusCode, 403);

    // 3. Valid completed log, then non-admin car_not_present overwrite -> 400
    const ts = '2026-11-27T07:00:00.000Z';
    const ok = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc.subscription.id,
      vehicleId: dcc.vehicle.id,
      status: 'completed',
      completedAtDevice: ts,
      photoUrl: 'https://cdn.example.com/1.jpg'
    }, dcc.tokens.staffToken);
    assert.strictEqual(ok.statusCode, 200);

    const overwrite = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc.subscription.id,
      vehicleId: dcc.vehicle.id,
      carNotPresent: true,
      completedAtDevice: ts,
      photoUrl: 'https://cdn.example.com/empty.jpg'
    }, dcc.tokens.staffToken);
    assert.strictEqual(overwrite.statusCode, 400);
    assert.strictEqual(harness.getTableRows('service_logs')[0].status, 'completed');

    // 4. Static verification that completeSpecialJob legacy branch has no redundant post-tx service_logs insert
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const compBlock = serverSrc.slice(serverSrc.indexOf("payload.action === 'completeSpecialJob'"), serverSrc.indexOf("payload.action === 'deleteSpecialJob'"));
    assert.strictEqual(/repos\.serviceLogs\.recordCompletion/.test(compBlock), false, 'completeSpecialJob must not have post-tx service_logs fallback');
  });

  // =========================================================================
  // M2-R09: Daily Clean report admin endpoints & serviceLogsRepo guards
  // =========================================================================
  await test('M2-R09', 'Daily Clean report endpoints return 400/404 cleanly and serviceLogsRepo SQL blocks job_id / null subscription_id rows', async () => {
    const leg = await setupLegacyJobFixture({ withPackage: false });
    await harness.postApi({ action: 'startSpecialJob', jobId: leg.job.id, beforePhotoUrls: VALID_PROOF.before }, leg.tokens.staffToken);
    await harness.postApi({ action: 'completeSpecialJob', jobId: leg.job.id, afterPhotoUrls: VALID_PROOF.after }, leg.tokens.staffToken);
    const jobLog = harness.getTableRows('service_logs').find(l => l.job_id === leg.job.id);

    // Insert an orphan non-DCC log (job_id = null, subscription_id = null)
    const orphanRes = await harness.engine.query(
      `INSERT INTO public.service_logs (client_mutation_id, staff_id, subscription_id, vehicle_id, job_id, service_date, status, completed_at_device)
       VALUES ($1, $2, NULL, NULL, NULL, '2026-11-27', 'completed', '2026-11-27T08:00:00Z') RETURNING *`,
      [crypto.randomUUID(), leg.staff.id]
    );
    const orphanLog = orphanRes.rows[0];

    for (const targetId of [jobLog.id, orphanLog.id]) {
      const upd = await harness.postApi({ action: 'updateDailyCleanReportStatus', reportId: targetId, status: 'car_not_present' }, leg.tokens.adminToken);
      assert.strictEqual(upd.statusCode, 400);
      const del = await harness.postApi({ action: 'deleteDailyCleanReport', reportId: targetId }, leg.tokens.adminToken);
      assert.strictEqual(del.statusCode, 400);

      const directUpd = await harness.withTransactionalDbMode(() =>
        harness.repos.serviceLogs.updateStatusAndReason(targetId, { status: 'car_not_present', adminNotes: 'hack' })
      );
      assert.strictEqual(directUpd, null);
      const directDel = await harness.withTransactionalDbMode(() =>
        harness.repos.serviceLogs.deleteReport(targetId)
      );
      assert.strictEqual(directDel, null);
    }

    const notFoundUpd = await harness.postApi({ action: 'updateDailyCleanReportStatus', reportId: crypto.randomUUID(), status: 'car_not_present' }, leg.tokens.adminToken);
    assert.strictEqual(notFoundUpd.statusCode, 404);
    const notFoundDel = await harness.postApi({ action: 'deleteDailyCleanReport', reportId: crypto.randomUUID() }, leg.tokens.adminToken);
    assert.strictEqual(notFoundDel.statusCode, 404);
  });

  // =========================================================================
  // M2-R10: Remaining SEE endpoints cross-engine guards
  // =========================================================================
  await test('M2-R10', 'GET /staff-contract, POST /addons/:id/complete, POST /solar-verify, POST /solar-approve reject non-SEE jobs with 400', async () => {
    // Seed active SEE service so legacy job auto-populates service_id!
    await harness.seedSeeServiceAndPackage({ categoryId: 'car_washing', packageQuantity: 1 });
    const leg = await setupLegacyJobFixture({ withPackage: false });
    assert.ok(leg.job.service_id, 'Legacy job has service_id');

    const rContract = await harness.callSee('GET', `/api/see/jobs/${leg.job.id}/staff-contract`, null, leg.tokens.staffToken);
    assert.strictEqual(rContract.statusCode, 400);

    const rAddon = await harness.callSee('POST', `/api/see/jobs/${leg.job.id}/addons/${crypto.randomUUID()}/complete`, {}, leg.tokens.staffToken);
    assert.strictEqual(rAddon.statusCode, 400);

    const rVerify = await harness.callSee('POST', `/api/see/jobs/${leg.job.id}/solar-verify`, { actualPanelCount: 12 }, leg.tokens.staffToken);
    assert.strictEqual(rVerify.statusCode, 400);
    assert.strictEqual(harness.getTableRows('solar_verifications').length, 0);
    assert.strictEqual(await harness.withTransactionalDbMode(() => harness.services.seeExecution.detectSeeManagedJob(leg.job)), false);

    const rApprove = await harness.callSee('POST', `/api/see/jobs/${leg.job.id}/solar-approve`, { approved: true }, leg.tokens.adminToken);
    assert.strictEqual(rApprove.statusCode, 400);

    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.seeExecution.submitSolarVerification(leg.job.id, { staffId: leg.staff.id, actualPanelCount: 10 })
      ),
      /not a canonical SEE-managed job/i
    );
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.seeExecution.approveSolarDiscrepancy(leg.job.id, { approved: true, approvedBy: 'admin' })
      ),
      /not a canonical SEE-managed job/i
    );
  });

  // =========================================================================
  // M2-R11: Client public/js/app.js checklist ID + optional item compatibility
  // =========================================================================
  await test('M2-R11', 'public/js/app.js emits data-see-checklist-id & required, allows unchecked optional items, and submits valid checklistResults', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    const startIdx = appCode.indexOf('/* Staff: Completing Special Job (After Photos & Notes) */');
    const endIdx = appCode.indexOf('/* Staff: Cancelling Special Job (Reason & Remarks) */');
    assert.ok(startIdx > 0 && endIdx > startIdx);
    const slice = appCode.slice(startIdx, endIdx);

    const parsedInputs = [];
    let lastApiCall = null;
    const dom = {
      completeJobChecklistBlock: { style: {} },
      completeJobChecklist: {
        _html: '',
        set innerHTML(v) {
          this._html = v;
          parsedInputs.length = 0;
          const re = /<input[^>]+>/g;
          let m;
          while ((m = re.exec(v)) !== null) {
            const tag = m[0];
            const idxM = tag.match(/data-see-checklist-index="(\d+)"/);
            const idM = tag.match(/data-see-checklist-id="([^"]*)"/);
            const reqM = tag.match(/data-see-checklist-required="([^"]*)"/);
            parsedInputs.push({
              checked: false,
              getAttribute(name) {
                if (name === 'data-see-checklist-index') return idxM ? idxM[1] : null;
                if (name === 'data-see-checklist-id') return idM ? idM[1] : null;
                if (name === 'data-see-checklist-required') return reqM ? reqM[1] : null;
                return null;
              }
            });
          }
        },
        get innerHTML() { return this._html; }
      },
      completeJobErrorMsg: { textContent: '', style: { display: 'none' } },
      completeJobConfirmError: { hidden: true, textContent: '' },
      completeJobNotes: { value: 'Cleaned well' },
      completeJobEditStage: { hidden: false },
      completeJobConfirmStage: { hidden: true },
      completeJobSuccessStage: { hidden: true }
    };

    const ctx = vm.createContext({
      crypto,
      escapeHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      staffUploadCopy: (en) => en,
      setSpecialJobSubmitControls: () => {},
      setSpecialJobPhotoStatus: () => {},
      playTaskCompletedChime: () => {},
      showToast: () => {},
      loadStaffCustomerData: () => {},
      getStaffToken: () => 'stf_tok',
      state: { activeStaffId: 'STF01' },
      window: { setTimeout: () => {} },
      completeSpecialJobSubmitting: false,
      currentCompleteJobMutationId: null,
      document: {
        getElementById: (id) => dom[id] || null,
        querySelectorAll: (sel) => {
          if (sel === '#completeJobChecklist input[data-see-checklist-index]') return parsedInputs;
          if (sel === '#completeJobChecklist input[data-see-checklist-index]:checked') return parsedInputs.filter(i => i.checked);
          return [];
        }
      },
      apiCall: (action, payload) => { lastApiCall = { action, payload }; }
    });
    vm.runInContext(slice, ctx);

    const jobChecklist = [
      { id: 'ext_wash', key: 'ext_wash', label: 'Exterior Wash', required: true },
      { id: 'tyre_shine', key: 'tyre_shine', label: 'Tyre Shine', required: false }
    ];
    ctx.renderCompleteJobChecklist({ seeManaged: true, checklistRequirements: jobChecklist });
    assert.strictEqual(parsedInputs.length, 2);
    assert.strictEqual(parsedInputs[0].getAttribute('data-see-checklist-id'), 'ext_wash');
    assert.strictEqual(parsedInputs[0].getAttribute('data-see-checklist-required'), '1');
    assert.strictEqual(parsedInputs[1].getAttribute('data-see-checklist-id'), 'tyre_shine');
    assert.strictEqual(parsedInputs[1].getAttribute('data-see-checklist-required'), '0');

    // Setup edit stage with 1 photo, required item UNCHECKED -> must block
    ctx.currentCompleteJobId = 'job-1';
    ctx.completeJobPhotos = [{ base64: 'x' }];
    ctx.completeJobAfterPhotoUrls = ['https://cdn.example.com/after.jpg'];
    ctx.completeJobStage = 'edit';
    ctx.submitCompleteSpecialJob();
    assert.strictEqual(ctx.completeJobStage, 'edit');
    assert.strictEqual(dom.completeJobErrorMsg.style.display, 'block');

    // Check ONLY required item, leave optional item unchecked -> must advance to confirm stage
    parsedInputs[0].checked = true;
    parsedInputs[1].checked = false;
    ctx.submitCompleteSpecialJob();
    assert.strictEqual(ctx.completeJobStage, 'confirm');

    // Confirm completion -> submits { id, key, item, completed } + clientMutationId accepted by backend validator
    ctx.confirmCompleteSpecialJob();
    assert.strictEqual(lastApiCall.action, 'completeSpecialJob');
    assert.ok(lastApiCall.payload.clientMutationId);
    const submittedResults = JSON.parse(JSON.stringify(lastApiCall.payload.checklistResults));
    assert.deepStrictEqual(submittedResults.map(x => ({ id: x.id, key: x.key, completed: x.completed })), [
      { id: 'ext_wash', key: 'ext_wash', completed: true },
      { id: 'tyre_shine', key: 'tyre_shine', completed: false }
    ]);

    const valRes = harness.services.seeExecution.validateChecklistSubmission(jobChecklist, submittedResults);
    assert.strictEqual(valRes.valid, true);
  });

  // =========================================================================
  // M2-R12: Admin public/admin-v2/js/v2-see-services.js preserves {id, key, label, required}
  // =========================================================================
  await test('M2-R12', 'public/admin-v2/js/v2-see-services.js preserves structured {id, key, label, required} across load, edit, add, and save', async () => {
    const svcCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'js', 'v2-see-services.js'), 'utf8');
    const listeners = {};
    const makeEl = (id, init = {}) => ({
      id,
      value: '',
      checked: false,
      disabled: false,
      textContent: '',
      innerHTML: '',
      style: {},
      options: [{ value: 'car_washing' }],
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      addEventListener(ev, fn) { (listeners[`${id}:${ev}`] = listeners[`${id}:${ev}`] || []).push(fn); },
      ...init
    });

    const els = {
      v2SeeProdServicesTableBody: makeEl('v2SeeProdServicesTableBody'),
      v2SeeProdServiceModalTitle: makeEl('v2SeeProdServiceModalTitle'),
      v2SeeProdServiceModalSub: makeEl('v2SeeProdServiceModalSub'),
      v2SeeProdSvcCode: makeEl('v2SeeProdSvcCode', { value: 'SVC_TST' }),
      v2SeeProdSvcName: makeEl('v2SeeProdSvcName', { value: 'Foam Wash' }),
      v2SeeProdSvcNameHi: makeEl('v2SeeProdSvcNameHi'),
      v2SeeProdSvcCategory: makeEl('v2SeeProdSvcCategory', { value: 'car_washing' }),
      v2SeeProdSvcModel: makeEl('v2SeeProdSvcModel', { value: 'visit_credit' }),
      v2SeeProdSvcStatus: makeEl('v2SeeProdSvcStatus', { value: 'active' }),
      v2SeeProdSvcDuration: makeEl('v2SeeProdSvcDuration', { value: '45' }),
      v2SeeProdSvcTagline: makeEl('v2SeeProdSvcTagline'),
      v2SeeProdSvcDesc: makeEl('v2SeeProdSvcDesc'),
      v2SeeProdSvcDetails: makeEl('v2SeeProdSvcDetails'),
      v2SeeProdSvcChkInput: makeEl('v2SeeProdSvcChkInput'),
      v2SeeProdSvcChkAddBtn: makeEl('v2SeeProdSvcChkAddBtn'),
      v2SeeProdSvcChkList: makeEl('v2SeeProdSvcChkList'),
      v2SeeProdSvcChkError: makeEl('v2SeeProdSvcChkError'),
      v2SeeProdSvcPhotoRequired: makeEl('v2SeeProdSvcPhotoRequired', { checked: true }),
      v2SeeProdSvcBeforeMin: makeEl('v2SeeProdSvcBeforeMin', { value: '1' }),
      v2SeeProdSvcAfterMin: makeEl('v2SeeProdSvcAfterMin', { value: '1' }),
      v2SeeProdSvcAllCities: makeEl('v2SeeProdSvcAllCities', { checked: true }),
      v2SeeProdSvcReasonWrap: makeEl('v2SeeProdSvcReasonWrap'),
      v2SeeProdSvcReason: makeEl('v2SeeProdSvcReason', { value: 'Checklist update' }),
      v2SeeProdSvcSaveBtn: makeEl('v2SeeProdSvcSaveBtn'),
      v2SeeProdSvcFormError: makeEl('v2SeeProdSvcFormError')
    };

    let patchBody = null;
    const svcDetail = {
      id: 'svc-1',
      service_code: 'SVC_TST',
      name: 'Foam Wash',
      service_category_id: 'car_washing',
      service_model: 'visit_credit',
      status: 'active',
      expected_duration_minutes: 45,
      checklist_requirements: [
        { id: 'ext_wash', key: 'ext_wash', label: 'Exterior Wash', required: true },
        { id: 'tyre_polish', key: 'tyre_polish', label: 'Tyre Polish', required: false }
      ],
      photo_requirements: { required: true, before_min: 1, after_min: 1 },
      city_zone_applicability: { all_cities: true, cities: [], zones: [] }
    };

    const windowObj = {
      CWP_ADMIN_V2: {
        auth: { getCsrfToken: () => 'csrf' },
        toast: { show: () => {} },
        overlay: { open: () => {}, close: () => {} },
        shell: { getActiveTab: () => '' }
      },
      addEventListener: () => {}
    };

    const ctx = vm.createContext({
      window: windowObj,
      document: { getElementById: (id) => els[id] || null },
      fetch: async (url, opts = {}) => {
        if (opts.method === 'PATCH') {
          patchBody = JSON.parse(opts.body);
          return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, service: { ...svcDetail, checklist_requirements: patchBody.checklistRequirements } }) };
        }
        if (url.includes('/api/see/services/svc-1')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, service: svcDetail }) };
        }
        if (url.includes('/api/see/services')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, services: [svcDetail] }) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, tags: [] }) };
      }
    });
    vm.runInContext(svcCode, ctx);
    windowObj.CWP_ADMIN_V2.seeServices.init();
    await windowObj.CWP_ADMIN_V2.seeServices.loadServices();

    // Open Edit modal for svc-1
    await listeners['v2SeeProdServicesTableBody:click'][0]({
      target: { closest: (sel) => sel === '[data-see-prod-edit]' ? { getAttribute: () => 'svc-1' } : null }
    });
    // Wait a tick for async openServiceModal
    await new Promise(r => setTimeout(r, 20));
    assert.ok(els.v2SeeProdSvcChkList.innerHTML.includes('data-chk-req="1"'));

    // Edit label of item 0 inline & toggle required of item 0 off, then add a new item
    const changeHandler = listeners['v2SeeProdSvcChkList:change'][0];
    changeHandler({
      target: {
        value: 'Exterior Foam Wash',
        getAttribute: () => '0',
        closest: (sel) => sel === '.v2-see-chk-edit' ? { value: 'Exterior Foam Wash', getAttribute: () => '0' } : null
      }
    });
    changeHandler({
      target: {
        checked: false,
        getAttribute: () => '0',
        closest: (sel) => sel === '[data-chk-req]' ? { checked: false, getAttribute: () => '0' } : null
      }
    });
    els.v2SeeProdSvcChkInput.value = 'Glass Wipe';
    listeners['v2SeeProdSvcChkAddBtn:click'][0]();

    // Save
    await listeners['v2SeeProdSvcSaveBtn:click'][0]();
    assert.ok(patchBody && Array.isArray(patchBody.checklistRequirements));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(patchBody.checklistRequirements)), [
      { id: 'ext_wash', key: 'ext_wash', label: 'Exterior Foam Wash', required: false },
      { id: 'tyre_polish', key: 'tyre_polish', label: 'Tyre Polish', required: false },
      { id: 'glass_wipe', key: 'glass_wipe', label: 'Glass Wipe', required: true }
    ]);
  });

  console.log(`\n[P0 M2 Remediation Summary] Passed: ${passed}, Failed: ${failed}`);
  harness.teardown();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  harness.teardown();
  process.exit(1);
});
