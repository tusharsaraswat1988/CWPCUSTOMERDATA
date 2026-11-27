/**
 * =========================================================================
 * P0 E2E QA Suite 4: Cross-Engine Protection & Legacy Path Compatibility (E4)
 * Requirements: ORIGINAL_REQUEST.md R4, R5 | PROJECT.md F6, F9
 * Tiers: Tier 1 (5), Tier 2 (5), Tier 3 (3 pairwise), Tier 4 (5 workloads)
 * =========================================================================
 */

'use strict';

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

async function setupSeeAndLegacyFixtures() {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
  const tokens = harness.createAuthTokens({ staff });

  const { service, pkg: seePkg } = await harness.seedSeeServiceAndPackage({
    categoryId: 'car_washing',
    packageQuantity: 3
  });

  const purch = await harness.withTransactionalDbMode(() =>
    harness.services.seeEntitlement.createPurchase({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      packageIdOrCode: seePkg.id,
      saleReference: `CE_${crypto.randomUUID()}`
    })
  );
  const seeAcct = purch.accounts[0];

  const legPkg = (await harness.withTransactionalDbMode(() =>
    harness.services.package.sellPackage({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      packageCode: 'WASH_SUB_4',
      packageName: 'Legacy 4 Wash',
      totalQuantity: 4
    })
  )).package;

  const seeJob = await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.createCanonicalJob({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: seeAcct.id,
      purchaseSnapshotId: purch.snapshot.id,
      staffId: staff.id,
      actor: 'qa_admin'
    })
  );

  // Legacy job — note serviceJobsRepo.createJob auto-populates service_id because `services` has an active car_washing row!
  const legacyJob = (await harness.withTransactionalDbMode(() =>
    harness.services.booking.createBooking({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Legacy On-Demand Wash',
      packageId: legPkg.id,
      staffId: staff.id
    })
  )).job;

  return { customer, location, vehicle, staff, tokens, service, seePkg, seeAcct, legPkg, seeJob, legacyJob };
}

async function run() {
  // =========================================================================
  // TIER 1: Core Cross-Engine Isolation (5 tests)
  // =========================================================================

  await test('E4-T1-01', 'SEE-managed job is rejected by bookingService.{completeJob, startJob, cancelBooking, failJob}', async () => {
    const { seeJob, seeAcct, staff } = await setupSeeAndLegacyFixtures();

    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.startJob(seeJob.id, { staffId: staff.id })));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.cancelBooking(seeJob.id, { reason: 'Legacy cancel attempt' })));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.failJob(seeJob.id, { failureReason: 'Legacy fail attempt' })));

    await harness.withTransactionalDbMode(() => harness.services.seeExecution.startExecution(seeJob.id, staff.id, { beforePhotos: VALID_PROOF.before }));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.completeJob(seeJob.id, { afterPhotos: VALID_PROOF.after, staffId: staff.id })));

    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeJob.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 0);
  });

  await test('E4-T1-02', 'Legacy job (even with auto-populated service_id) is rejected by SEE execution methods & /api/see/jobs/:id/complete', async () => {
    const { legacyJob, staff, tokens } = await setupSeeAndLegacyFixtures();
    assert.ok(legacyJob.service_id, 'Test precondition: legacyJob has auto-populated service_id');

    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.seeExecution.startExecution(legacyJob.id, staff.id)));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.seeExecution.terminateJobWithoutCompletion(legacyJob.id, 'cancelled', { reason: 'Wrong engine' })));

    // Start via legacy engine, then attempt SEE completion via service & HTTP
    await harness.withTransactionalDbMode(() => harness.services.booking.startJob(legacyJob.id, { beforePhotos: VALID_PROOF.before }));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.seeExecution.completeExecution(legacyJob.id, { staffId: staff.id, checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF })));

    const seeHttp = await harness.callSee('POST', `/api/see/jobs/${legacyJob.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF
    }, tokens.staffToken);
    assert.ok(seeHttp.statusCode >= 400 && seeHttp.statusCode < 500);
    assert.strictEqual(seeHttp.body.success, false);
    assert.strictEqual(harness.getTableRows('service_executions').length, 0);

    // Legacy completeSpecialJob succeeds cleanly
    const legHttp = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: legacyJob.id,
      afterPhotoUrls: VALID_PROOF.after
    }, tokens.staffToken);
    assert.strictEqual(legHttp.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === legacyJob.id).status, 'completed');
  });

  await test('E4-T1-03', 'Legacy job completion never invokes SEE entitlement consumption or writes service_executions', async () => {
    const { legacyJob, seeAcct, legPkg, tokens } = await setupSeeAndLegacyFixtures();

    await harness.postApi({ action: 'startSpecialJob', jobId: legacyJob.id, beforePhotoUrls: VALID_PROOF.before }, tokens.staffToken);
    const res = await harness.postApi({ action: 'completeSpecialJob', jobId: legacyJob.id, afterPhotoUrls: VALID_PROOF.after }, tokens.staffToken);
    assert.strictEqual(res.statusCode, 200);

    assert.strictEqual(harness.getTableRows('service_executions').length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_ledger').filter(l => l.entry_type === 'consume').length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 0);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === legacyJob.id).length, 1);
  });

  await test('E4-T1-04', 'bookingService.createBooking rejects entitlementAccountId and createServiceBooking rejects SEE account on legacyCompatibility path', async () => {
    const { customer, location, vehicle, seeAcct, tokens } = await setupSeeAndLegacyFixtures();

    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.booking.createBooking({
          customerId: customer.id,
          vehicleId: vehicle.id,
          locationId: location.id,
          serviceCategoryId: 'car_washing',
          serviceType: 'Hybrid Hack',
          entitlementAccountId: seeAcct.id
        })
      ),
    /SEE|entitlement|canonical/i
    );

    const httpRes = await harness.postApi({
      action: 'createServiceBooking',
      legacyCompatibility: true,
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Hybrid HTTP Hack',
      packageId: seeAcct.id
    }, tokens.adminToken);
    assert.ok(httpRes.statusCode >= 400 && httpRes.statusCode < 500);
    assert.strictEqual(httpRes.body.success, false);
    assert.ok(/SEE|entitlement|canonical/i.test(String(httpRes.body.error || '')), `Expected SEE/entitlement/canonical error, got: ${httpRes.body.error}`);
  });

  await test('E4-T1-05', 'POST /api routes SEE vs Legacy (with auto-populated service_id) to their exact owning engines', async () => {
    const { seeJob, legacyJob, seeAcct, legPkg, tokens } = await setupSeeAndLegacyFixtures();

    // Start & complete SEE job via /api
    await harness.postApi({ action: 'startSpecialJob', jobId: seeJob.id, beforePhotoUrls: VALID_PROOF.before }, tokens.staffToken);
    const rSee = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: seeJob.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(rSee.statusCode, 200);

    // Start & complete Legacy job (with service_id!) via /api WITHOUT checklistResults
    await harness.postApi({ action: 'startSpecialJob', jobId: legacyJob.id, beforePhotoUrls: VALID_PROOF.before }, tokens.staffToken);
    const rLeg = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: legacyJob.id,
      afterPhotoUrls: VALID_PROOF.after
    }, tokens.staffToken);
    assert.strictEqual(rLeg.statusCode, 200);

    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === seeJob.id && e.outcome === 'completed').length, 1);
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === legacyJob.id).length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
  });

  // =========================================================================
  // TIER 2: Edge Cases & Engine Classification Matrix (5 tests)
  // =========================================================================

  await test('E4-T2-01', 'isSeeManagedJob(job, opts) classifies every canonical signal accurately without misclassifying service_id alone', async () => {
    const fn = harness.services.seeExecution.isSeeManagedJob;
    assert.strictEqual(typeof fn, 'function', 'seeExecutionService.isSeeManagedJob must be exported');

    assert.strictEqual(fn({ id: '1', service_id: 'svc-1' }), false, 'service_id alone must NOT classify job as SEE');
    assert.strictEqual(fn({ id: '2', service_payload: { _seeManaged: true } }), true);
    assert.strictEqual(fn({ id: '3', entitlement_account_id: 'acct-1' }), true);
    assert.strictEqual(fn({ id: '4', purchase_snapshot_id: 'snap-1' }), true);
    assert.strictEqual(fn({ id: '5' }, { hasAddons: true }), true);
    assert.strictEqual(fn({ id: '6' }, { hasSolar: true }), true);
    assert.strictEqual(fn({ id: '7', service_id: 'svc-1', package_id: 'pkg-1' }), false);
  });

  await test('E4-T2-02', 'SEE job with entitlement_account_id vs Legacy job with package_id + service_id never leak across storage tables', async () => {
    const { seeJob, legacyJob, seeAcct, legPkg, staff } = await setupSeeAndLegacyFixtures();

    await harness.withTransactionalDbMode(() => harness.services.seeExecution.startExecution(seeJob.id, staff.id, { beforePhotos: VALID_PROOF.before }));
    await harness.withTransactionalDbMode(() => harness.services.seeExecution.completeExecution(seeJob.id, { staffId: staff.id, checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF }));

    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 4);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 0);

    await harness.withTransactionalDbMode(() => harness.services.booking.startJob(legacyJob.id, { beforePhotos: VALID_PROOF.before }));
    await harness.withTransactionalDbMode(() => harness.services.booking.completeJob(legacyJob.id, { afterPhotos: VALID_PROOF.after, staffId: staff.id }));

    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
  });

  await test('E4-T2-03', 'DCC isolation: DCC operations never create service_jobs or touch packages/entitlements, and createPackage rejects DCC_DAILY', async () => {
    const { customer, location, vehicle, staff, tokens, seeAcct, legPkg } = await setupSeeAndLegacyFixtures();
    const jobsBefore = harness.getTableRows('service_jobs').length;

    const subRes = await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        staffId: staff.id,
        startDate: '2026-11-01',
        endDate: '2026-12-31'
      })
    );

    const dccRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: subRes.subscription.id,
        vehicleId: vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/dcc.jpg'
      }]
    }, tokens.staffToken);
    assert.strictEqual(dccRes.body.results[0].status, 'synced');
    assert.strictEqual(harness.getTableRows('service_jobs').length, jobsBefore);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 4);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 0);

    // SEE createPackage rejects DCC_DAILY
    const dccSvc = await harness.withTransactionalDbMode(() =>
      harness.services.seeCatalogue.createService({
        serviceCode: 'DCC_SVC', name: 'DCC Service', serviceCategoryId: 'daily_car_cleaning', serviceModel: 'recurring', status: 'active'
      })
    );
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.seeCatalogue.createPackage({
          packageCode: 'BAD_DCC_PKG', name: 'Bad DCC', mainServiceId: dccSvc.id, packageType: 'DCC_DAILY', status: 'active'
        })
      )
    );
  });

  await test('E4-T2-04', 'Wrong-endpoint IDs (DCC reportId -> completeSpecialJob; SEE jobId -> syncCompletions / DCC report actions) rejected cleanly', async () => {
    const { customer, location, vehicle, staff, tokens, seeJob } = await setupSeeAndLegacyFixtures();
    const sub = (await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: customer.id, vehicleId: vehicle.id, locationId: location.id, staffId: staff.id, startDate: '2026-11-01', endDate: '2026-12-31'
      })
    )).subscription;
    const dccRec = await harness.withTransactionalDbMode(() =>
      harness.services.dcc.recordDailyClean({
        subscriptionId: sub.id, vehicleId: vehicle.id, staffId: staff.id, photoUrl: 'https://cdn.example.com/d.jpg'
      })
    );

    const r1 = await harness.postApi({ action: 'completeSpecialJob', jobId: dccRec.log.id }, tokens.staffToken);
    assert.ok(r1.statusCode >= 400);

    const r2 = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: 'completed' }]
    }, tokens.staffToken);
    assert.strictEqual(r2.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');

    // Complete SEE job canonically, then try DCC report admin actions on its log
    await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/start`, { beforePhotos: VALID_PROOF.before }, tokens.staffToken);
    await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/complete`, { checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF }, tokens.staffToken);
    const seeLog = harness.getTableRows('service_logs').find(l => l.job_id === seeJob.id);

    const r3 = await harness.postApi({ action: 'updateDailyCleanReportStatus', reportId: seeLog.id, status: 'car_not_present' }, tokens.adminToken);
    assert.ok(r3.statusCode >= 400);
    const r4 = await harness.postApi({ action: 'deleteDailyCleanReport', reportId: seeLog.id }, tokens.adminToken);
    assert.ok(r4.statusCode >= 400);
  });

  await test('E4-T2-05', 'assignSpecialJob / reassignSpecialJob route SEE jobs to SEE and legacy jobs with service_id to legacy/capability path', async () => {
    const { seeJob, legacyJob, tokens } = await setupSeeAndLegacyFixtures();
    const staff2 = await harness.seedStaff({ name: 'Staff Two', workType: 'dcc_and_services' });

    const rSee = await harness.postApi({
      action: 'reassignSpecialJob',
      jobId: seeJob.id,
      toStaffId: staff2.id,
      reason: 'Reassign SEE'
    }, tokens.adminToken);
    assert.strictEqual(rSee.statusCode, 200);
    assert.strictEqual(harness.getTableRows('staff_assignments').find(sa => sa.job_id === seeJob.id && sa.is_active).staff_id, staff2.id);

    const rLeg = await harness.postApi({
      action: 'reassignSpecialJob',
      jobId: legacyJob.id,
      toStaffId: staff2.id,
      reason: 'Reassign Legacy'
    }, tokens.adminToken);
    assert.strictEqual(rLeg.statusCode, 200);
    assert.strictEqual(harness.getTableRows('staff_assignments').find(sa => sa.job_id === legacyJob.id && sa.is_active).staff_id, staff2.id);
  });

  // =========================================================================
  // TIER 3: Pairwise Cross-Engine Matrices (3 matrices)
  // =========================================================================

  await test('E4-T3-01', 'Pairwise: (SEE vs Legacy w/ service_id vs Legacy w/o service_id vs DCC) x (SEE complete vs bookingService vs syncCompletions vs completeSpecialJob)', async () => {
    const ctx = await setupSeeAndLegacyFixtures();
    const legNoSvc = (await harness.withTransactionalDbMode(() =>
      harness.repos.serviceJobs.createJob({
        customerId: ctx.customer.id,
        vehicleId: ctx.vehicle.id,
        locationId: ctx.location.id,
        serviceCategoryId: 'solar_cleaning', // no active solar SEE service exists -> service_id stays NULL
        serviceType: 'Legacy Solar Manual'
      })
    ));
    await harness.withTransactionalDbMode(() =>
      harness.repos.staffAssignments.assignStaffToJob({ staffId: ctx.staff.id, jobId: legNoSvc.id, assignedBy: 'qa' })
    );
    const dccSub = (await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: ctx.customer.id, vehicleId: ctx.vehicle.id, locationId: ctx.location.id, staffId: ctx.staff.id, startDate: '2026-11-01', endDate: '2026-12-31'
      })
    )).subscription;

    // 1. SEE job only succeeds on SEE / completeSpecialJob
    assert.strictEqual((await harness.postApi({ action: 'syncCompletions', completions: [{ clientMutationId: crypto.randomUUID(), jobId: ctx.seeJob.id, status: 'completed' }] }, ctx.tokens.staffToken)).body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    await harness.callSee('POST', `/api/see/jobs/${ctx.seeJob.id}/start`, { beforePhotos: VALID_PROOF.before }, ctx.tokens.staffToken);
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.completeJob(ctx.seeJob.id, { afterPhotos: VALID_PROOF.after })));
    assert.strictEqual((await harness.callSee('POST', `/api/see/jobs/${ctx.seeJob.id}/complete`, { checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF }, ctx.tokens.staffToken)).statusCode, 200);

    // 2. Legacy w/ service_id succeeds on bookingService & completeSpecialJob, rejected on /api/see/complete
    await harness.withTransactionalDbMode(() => harness.services.booking.startJob(ctx.legacyJob.id, { beforePhotos: VALID_PROOF.before }));
    assert.ok((await harness.callSee('POST', `/api/see/jobs/${ctx.legacyJob.id}/complete`, { checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF }, ctx.tokens.staffToken)).statusCode >= 400);
    assert.strictEqual((await harness.postApi({ action: 'completeSpecialJob', jobId: ctx.legacyJob.id, afterPhotoUrls: VALID_PROOF.after }, ctx.tokens.staffToken)).statusCode, 200);

    // 3. Legacy w/o service_id succeeds via syncCompletions, rejected on /api/see/complete
    assert.ok((await harness.callSee('POST', `/api/see/jobs/${legNoSvc.id}/complete`, { checklistResults: [], proofPhotos: VALID_PROOF }, ctx.tokens.staffToken)).statusCode >= 400);
    assert.strictEqual((await harness.postApi({ action: 'syncCompletions', completions: [{ clientMutationId: crypto.randomUUID(), jobId: legNoSvc.id, status: 'completed' }] }, ctx.tokens.staffToken)).body.results[0].status, 'synced');

    // 4. DCC succeeds via syncCompletions, rejected on /api/see/complete
    assert.ok((await harness.callSee('POST', `/api/see/jobs/${dccSub.id}/complete`, { checklistResults: [], proofPhotos: VALID_PROOF }, ctx.tokens.staffToken)).statusCode >= 400);
    assert.strictEqual((await harness.postApi({ action: 'syncCompletions', completions: [{ clientMutationId: crypto.randomUUID(), subscriptionId: dccSub.id, vehicleId: ctx.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/d.jpg' }] }, ctx.tokens.staffToken)).body.results[0].status, 'synced');
  });

  await test('E4-T3-02', 'Pairwise: (SEE vs Legacy w/ service_id) x (startSpecialJob vs cancelSpecialJob vs failServiceJob) via POST /api', async () => {
    const f1 = await setupSeeAndLegacyFixtures();
    assert.strictEqual((await harness.postApi({ action: 'cancelSpecialJob', jobId: f1.seeJob.id, reason: 'Cancel SEE' }, f1.tokens.staffToken)).statusCode, 200);
    assert.strictEqual((await harness.postApi({ action: 'cancelSpecialJob', jobId: f1.legacyJob.id, reason: 'Cancel Legacy' }, f1.tokens.staffToken)).statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === f1.seeAcct.id).reserved_qty, 0);

    harness.reset();
    const f2 = await setupSeeAndLegacyFixtures();
    assert.strictEqual((await harness.postApi({ action: 'startSpecialJob', jobId: f2.seeJob.id, beforePhotoUrls: VALID_PROOF.before }, f2.tokens.staffToken)).statusCode, 200);
    assert.strictEqual((await harness.postApi({ action: 'startSpecialJob', jobId: f2.legacyJob.id, beforePhotoUrls: VALID_PROOF.before }, f2.tokens.staffToken)).statusCode, 200);
    assert.strictEqual((await harness.postApi({ action: 'failServiceBooking', jobId: f2.seeJob.id, failureReason: 'Fail SEE' }, f2.tokens.staffToken)).statusCode, 200);
    assert.strictEqual((await harness.postApi({ action: 'failServiceBooking', jobId: f2.legacyJob.id, failureReason: 'Fail Legacy' }, f2.tokens.staffToken)).statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === f2.seeAcct.id).reserved_qty, 0);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === f2.legPkg.id).remaining_quantity, 4);
  });

  await test('E4-T3-03', 'Pairwise: (admin vs staff) x (SEE vs Legacy) across deleteSpecialJob and stopCustomerService', async () => {
    const f1 = await setupSeeAndLegacyFixtures();
    // Staff cannot call admin deleteSpecialJob or stopCustomerService
    assert.strictEqual((await harness.postApi({ action: 'deleteSpecialJob', jobId: f1.seeJob.id }, f1.tokens.staffToken)).statusCode, 401);
    assert.strictEqual((await harness.postApi({ action: 'stopCustomerService', customerId: f1.customer.id }, f1.tokens.staffToken)).statusCode, 401);

    // Admin deleteSpecialJob releases SEE reservation and deletes legacy cleanly
    assert.strictEqual((await harness.postApi({ action: 'deleteSpecialJob', jobId: f1.seeJob.id }, f1.tokens.adminToken)).statusCode, 200);
    assert.strictEqual((await harness.postApi({ action: 'deleteSpecialJob', jobId: f1.legacyJob.id }, f1.tokens.adminToken)).statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === f1.seeAcct.id).reserved_qty, 0);
  });

  // =========================================================================
  // TIER 4: Real-World Multi-Feature Workloads (5 workloads)
  // =========================================================================

  await test('E4-T4-01', 'Workload: Customer with DCC + Legacy 4-wash + SEE Solar active simultaneously executes all 3 on same day without leakage', async () => {
    const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });

    // 1. DCC
    const dccSub = (await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: customer.id, vehicleId: vehicle.id, locationId: location.id, staffId: staff.id, startDate: '2026-11-01', endDate: '2026-12-31'
      })
    )).subscription;

    // 2. Active SEE Car Wash service (so legacy car_washing job auto-populates service_id) + Legacy 4-wash package
    await harness.seedSeeServiceAndPackage({ categoryId: 'car_washing', packageQuantity: 1 });
    const legPkg = (await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: customer.id, vehicleId: vehicle.id, locationId: location.id,
        serviceCategoryId: 'car_washing', packageCode: 'WASH_SUB_4', packageName: '4 Wash Pack', totalQuantity: 4
      })
    )).package;
    const legJob = (await harness.withTransactionalDbMode(() =>
      harness.services.booking.createBooking({
        customerId: customer.id, vehicleId: vehicle.id, locationId: location.id,
        serviceCategoryId: 'car_washing', serviceType: 'Legacy Wash', packageId: legPkg.id, staffId: staff.id
      })
    )).job;

    // 3. SEE Solar package + job
    const { service: solarSvc, pkg: solarPkg } = await harness.seedSeeServiceAndPackage({
      categoryId: 'solar_cleaning',
      name: 'Solar Visit',
      checklistRequirements: [{ id: 'solar_brush', label: 'Solar Brush', required: true }],
      packageQuantity: 2
    });
    const solarPurch = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.createPurchase({
        customerId: customer.id, locationId: location.id, packageIdOrCode: solarPkg.id, saleReference: `SIM_${crypto.randomUUID()}`
      })
    );
    const solarAcct = solarPurch.accounts[0];
    const solarJob = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: customer.id, locationId: location.id, serviceIdOrCode: solarSvc.id,
        entitlementAccountId: solarAcct.id, purchaseSnapshotId: solarPurch.snapshot.id, staffId: staff.id
      })
    );

    // Execute all 3
    const dccRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: crypto.randomUUID(), subscriptionId: dccSub.id, vehicleId: vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/dcc.jpg' }]
    }, tokens.staffToken);
    assert.strictEqual(dccRes.body.results[0].status, 'synced');

    await harness.postApi({ action: 'startSpecialJob', jobId: legJob.id, beforePhotoUrls: VALID_PROOF.before }, tokens.staffToken);
    const legRes = await harness.postApi({ action: 'completeSpecialJob', jobId: legJob.id, afterPhotoUrls: VALID_PROOF.after }, tokens.staffToken);
    assert.strictEqual(legRes.statusCode, 200);

    await harness.callSee('POST', `/api/see/jobs/${solarJob.id}/start`, { beforePhotos: VALID_PROOF.before }, tokens.staffToken);
    const solRes = await harness.callSee('POST', `/api/see/jobs/${solarJob.id}/complete`, {
      checklistResults: [{ id: 'solar_brush', completed: true }],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(solRes.statusCode, 200);

    assert.strictEqual(harness.getTableRows('service_logs').length, 3);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === null).length, 1);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === solarAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === solarAcct.id).remaining_qty, 1);
  });

  await test('E4-T4-02', 'Workload: Sequential bypass attack resilience on SEE job -> 0 premature mutations -> canonical completion succeeds', async () => {
    const { seeJob, seeAcct, tokens } = await setupSeeAndLegacyFixtures();

    // Attempt 1: offline sync
    const a1 = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: 'completed' }]
    }, tokens.staffToken);
    assert.strictEqual(a1.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');

    // Attempt 2: legacy bookingService.completeJob
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.booking.completeJob(seeJob.id, { afterPhotos: VALID_PROOF.after })));

    // Attempt 3: DCC recordDailyCleanWithPhoto with jobId
    const a3 = await harness.postApi({ action: 'recordDailyCleanWithPhoto', jobId: seeJob.id, status: 'completed', photoUrl: 'https://cdn.example.com/x.jpg' }, tokens.staffToken);
    assert.ok(a3.statusCode >= 400);

    // Attempt 4: completeSpecialJob without checklist
    await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/start`, { beforePhotos: VALID_PROOF.before }, tokens.staffToken);
    const a4 = await harness.postApi({ action: 'completeSpecialJob', jobId: seeJob.id, checklistResults: [], afterPhotoUrls: VALID_PROOF.after }, tokens.staffToken);
    assert.ok(a4.statusCode >= 400);

    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeJob.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 0);

    // Canonical completion succeeds
    const ok = await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(ok.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 1);
  });

  await test('E4-T4-03', 'Workload: Full legacy lifecycle via HTTP when SEE services exist (auto-populating service_id) completes without SEE interference', async () => {
    const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });
    await harness.seedSeeServiceAndPackage({ categoryId: 'car_washing', packageQuantity: 1 });

    const sellRes = await harness.postApi({
      action: 'sellCustomerPackage',
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      packageName: 'Legacy Continuity Pack',
      totalQuantity: 3,
      unitPrice: 400
    }, tokens.adminToken);
    assert.strictEqual(sellRes.statusCode, 200);
    const legPkgId = sellRes.body.package.id;

    const bookRes = await harness.postApi({
      action: 'createServiceBooking',
      legacyCompatibility: true,
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Legacy Continuity Wash',
      packageId: legPkgId,
      staffId: staff.id
    }, tokens.adminToken);
    assert.strictEqual(bookRes.statusCode, 200);
    const jobId = bookRes.body.booking.id;

    const startRes = await harness.postApi({ action: 'startSpecialJob', jobId, beforePhotoUrls: VALID_PROOF.before }, tokens.staffToken);
    assert.strictEqual(startRes.statusCode, 200);

    const compRes = await harness.postApi({ action: 'completeSpecialJob', jobId, afterPhotoUrls: VALID_PROOF.after }, tokens.staffToken);
    assert.strictEqual(compRes.statusCode, 200);

    const histRes = await harness.postApi({ action: 'getCustomerServiceJobs', customerId: customer.id }, tokens.adminToken);
    assert.strictEqual(histRes.statusCode, 200);
    assert.strictEqual(histRes.body.history.length, 1);
    assert.strictEqual(histRes.body.history[0].status, 'completed');
    assert.strictEqual(harness.getTableRows('service_executions').length, 0);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkgId).remaining_quantity, 2);
  });

  await test('E4-T4-04', 'Workload: Mixed cancellation & failure day (cancel SEE + fail Legacy + car_not_present DCC)', async () => {
    const { customer, location, vehicle, staff, tokens, seeJob, legacyJob, seeAcct, legPkg } = await setupSeeAndLegacyFixtures();
    const dccSub = (await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: customer.id, vehicleId: vehicle.id, locationId: location.id, staffId: staff.id, startDate: '2026-11-01', endDate: '2026-12-31'
      })
    )).subscription;

    const cancelRes = await harness.postApi({ action: 'cancelSpecialJob', jobId: seeJob.id, reason: 'Customer away' }, tokens.staffToken);
    assert.strictEqual(cancelRes.statusCode, 200, `cancelSpecialJob failed: ${JSON.stringify(cancelRes.body)}`);
    assert.strictEqual(cancelRes.body.success, true);

    const failRes = await harness.postApi({ action: 'failServiceBooking', jobId: legacyJob.id, failureReason: 'No water' }, tokens.staffToken);
    assert.strictEqual(failRes.statusCode, 200, `failServiceBooking failed: ${JSON.stringify(failRes.body)}`);
    assert.strictEqual(failRes.body.success, true);

    const syncRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: crypto.randomUUID(), subscriptionId: dccSub.id, vehicleId: vehicle.id, status: 'car_not_present' }]
    }, tokens.staffToken);
    assert.strictEqual(syncRes.statusCode, 200, `syncCompletions failed: ${JSON.stringify(syncRes.body)}`);
    assert.strictEqual(syncRes.body.success, true);

    const jobs = harness.getTableRows('service_jobs');
    const seeRow = jobs.find(j => j.id === seeJob.id);
    const legacyRow = jobs.find(j => j.id === legacyJob.id);
    assert.strictEqual(seeRow.status, 'cancelled');
    assert.strictEqual(legacyRow.status, 'unable_to_complete');

    const acct = harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id);
    assert.strictEqual(acct.reserved_qty, 0);
    assert.strictEqual(acct.consumed_qty, 0);
    assert.strictEqual(acct.remaining_qty, 3);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 4);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.status === 'car_not_present').length, 1);
  });

  await test('E4-T4-05', 'Workload: stopCustomerService on Customer A isolates Customer B (DCC + SEE + Legacy)', async () => {
    const ctxA = await setupSeeAndLegacyFixtures();
    const dccA = (await harness.withTransactionalDbMode(() =>
      harness.services.dcc.createSubscription({
        customerId: ctxA.customer.id, vehicleId: ctxA.vehicle.id, locationId: ctxA.location.id, staffId: ctxA.staff.id, startDate: '2026-11-01', endDate: '2026-12-31'
      })
    )).subscription;

    // Customer B
    const assetsB = await harness.seedCustomerAndAssets({ name: 'Customer B' });
    const purchB = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.createPurchase({
        customerId: assetsB.customer.id, vehicleId: assetsB.vehicle.id, locationId: assetsB.location.id, packageIdOrCode: ctxA.seePkg.id, saleReference: `CB_${crypto.randomUUID()}`
      })
    );
    const acctB = purchB.accounts[0];
    const jobB = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: assetsB.customer.id, vehicleId: assetsB.vehicle.id, locationId: assetsB.location.id,
        serviceIdOrCode: ctxA.service.id, entitlementAccountId: acctB.id, purchaseSnapshotId: purchB.snapshot.id, staffId: ctxA.staff.id
      })
    );

    const stopA = await harness.postApi({
      action: 'stopCustomerService',
      customerId: ctxA.customer.id,
      reason: 'Customer A paused'
    }, ctxA.tokens.adminToken);
    assert.strictEqual(stopA.statusCode, 200);

    // Customer A stopped & released
    assert.strictEqual(harness.getTableRows('subscriptions').find(s => s.id === dccA.id).status, 'stopped');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === ctxA.seeJob.id).status, 'cancelled');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === ctxA.legacyJob.id).status, 'cancelled');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctxA.seeAcct.id).reserved_qty, 0);

    // Customer B untouched
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === jobB.id).status, 'assigned');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === acctB.id).reserved_qty, 1);
  });

  console.log(`\n[E4 Cross-Engine Summary] Passed: ${passed}, Failed: ${failed}`);
  harness.teardown();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  harness.teardown();
  process.exit(1);
});
