/**
 * =========================================================================
 * P0 E2E QA Suite 1: Job Completion & Service History Consistency (E1)
 * Requirements: ORIGINAL_REQUEST.md R1, R4, R5 | PROJECT.md F1, F2, F3, F4, F9
 * Tiers: Tier 1 (6), Tier 2 (7), Tier 3 (4 pairwise), Tier 4 (5 workloads)
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createP0E2EHarness } = require('./helpers/p0_e2e_harness');

const harness = createP0E2EHarness();

let passed = 0;
let failed = 0;
const failures = [];

async function test(id, name, fn) {
  harness.reset();
  try {
    await fn();
    console.log(`PASS [${id}] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`FAIL [${id}] ${name}\n   ${err.stack || err.message}`);
    failed += 1;
    failures.push({ id, name, error: err.message });
  }
}

const VALID_CHECKLIST = [
  { id: 'exterior_clean', completed: true },
  { id: 'glass_clean', completed: true },
  { id: 'wheel_clean', completed: true }
];
const VALID_PROOF = {
  before: ['https://cdn.example.com/before-1.jpg'],
  after: ['https://cdn.example.com/after-1.jpg']
};

async function setupSeeJob({
  packageQuantity = 3,
  includeAddon = false,
  addonOptional = false,
  startJob = true,
  categoryId = 'car_washing',
  checklistRequirements = undefined
} = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff();
  const { service, addon, pkg } = await harness.seedSeeServiceAndPackage({
    categoryId,
    packageQuantity,
    includeAddon,
    addonOptional,
    ...(checklistRequirements ? { checklistRequirements } : {})
  });
  const tokens = harness.createAuthTokens({ staff });

  const purchase = await harness.withTransactionalDbMode(() =>
    harness.services.seeEntitlement.createPurchase({
      customerId: customer.id,
      vehicleId: categoryId === 'solar_cleaning' ? null : vehicle.id,
      locationId: location.id,
      packageIdOrCode: pkg.id,
      saleReference: `SALE_${crypto.randomUUID()}`,
      actor: 'qa_admin'
    })
  );

  const mainAcct = purchase.accounts.find(a => a.service_id === service.id);
  const addonAcct = addon ? purchase.accounts.find(a => a.addon_id === addon.id) : null;

  const job = await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.createCanonicalJob({
      customerId: customer.id,
      vehicleId: categoryId === 'solar_cleaning' ? null : vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purchase.snapshot.id,
      staffId: staff.id,
      addonIds: addon ? [addon.id] : [],
      scheduledDate: '2026-11-27',
      scheduledTime: '10:00',
      actor: 'qa_admin'
    })
  );

  if (startJob) {
    await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.startExecution(job.id, staff.id, {
        beforePhotos: VALID_PROOF.before
      })
    );
  }

  return { customer, location, vehicle, staff, service, addon, pkg, purchase, mainAcct, addonAcct, job, tokens };
}

async function setupLegacyPackageJob({ totalQuantity = 3, startJob = true, withPackage = true } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff();
  const tokens = harness.createAuthTokens({ staff });

  // Also ensure an active SEE service exists in same category so service_id auto-population is exercised
  await harness.seedSeeServiceAndPackage({ categoryId: 'car_washing', packageQuantity: 1 });

  let legacyPkg = null;
  if (withPackage) {
    legacyPkg = await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        serviceCategoryId: 'car_washing',
        packageCode: 'WASH_SUB_4_5',
        packageName: 'Legacy 4 Wash Pack',
        totalQuantity,
        unitPrice: 500,
        totalPrice: 500 * totalQuantity,
        validityMonths: 6
      }, 'qa_admin')
    );
  }

  const bookingRes = await harness.withTransactionalDbMode(() =>
    harness.services.booking.createBooking({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Legacy Standard Wash',
      packageId: legacyPkg ? (legacyPkg.id || legacyPkg.package?.id) : null,
      staffId: staff.id,
      servicePrice: legacyPkg ? 0 : 600,
      scheduledDate: '2026-11-27'
    }, 'qa_admin')
  );
  const job = bookingRes.job || bookingRes;

  if (startJob) {
    await harness.withTransactionalDbMode(() =>
      harness.services.booking.startJob(job.id, {
        beforePhotos: VALID_PROOF.before,
        staffId: staff.id,
        actor: staff.staff_code
      })
    );
  }

  return { customer, location, vehicle, staff, legacyPkg: legacyPkg ? (legacyPkg.package || legacyPkg) : null, job, tokens };
}

async function run() {
  // =========================================================================
  // TIER 1: Core Happy-Path & Baseline Invariants (6 tests)
  // =========================================================================

  await test('E1-T1-01', 'Valid canonical SEE completion via POST /api/see/jobs/:id/complete updates job, execution, service_logs & entitlement atomically', async () => {
    const { staff, mainAcct, job, tokens } = await setupSeeJob({ packageQuantity: 3 });
    const mutId = crypto.randomUUID();

    const res = await harness.callSee('POST', `/api/see/jobs/${job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      completionNotes: 'Clean finish',
      clientMutationId: mutId
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);

    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === job.id);
    assert.strictEqual(jobRow.status, 'completed');
    assert.strictEqual(jobRow.entitlement_consumed, true);

    const termExecs = harness.getTableRows('service_executions').filter(e => e.job_id === job.id && e.outcome === 'completed');
    assert.strictEqual(termExecs.length, 1);

    const logs = harness.getTableRows('service_logs').filter(l => l.job_id === job.id);
    assert.strictEqual(logs.length, 1, 'Canonical SEE completion must create exactly 1 service_logs row');
    assert.strictEqual(logs[0].staff_id, staff.id);
    assert.strictEqual(logs[0].status, 'completed');

    const acct = harness.getTableRows('entitlement_accounts').find(a => a.id === mainAcct.id);
    assert.strictEqual(acct.reserved_qty, 0);
    assert.strictEqual(acct.consumed_qty, 1);
    assert.strictEqual(acct.remaining_qty, 2);

    const consumeEntries = harness.getTableRows('entitlement_ledger').filter(
      l => l.entitlement_account_id === mainAcct.id && l.entry_type === 'consume'
    );
    assert.strictEqual(consumeEntries.length, 1);
  });

  await test('E1-T1-02', 'Valid canonical SEE completion via POST /api completeSpecialJob produces zero duplicate service_logs', async () => {
    const { staff, mainAcct, job, tokens } = await setupSeeJob({ packageQuantity: 2 });
    const mutId = crypto.randomUUID();

    const res = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      notes: 'Done via staff portal',
      clientMutationId: mutId
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);

    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === job.id);
    assert.strictEqual(jobRow.status, 'completed');

    const logs = harness.getTableRows('service_logs').filter(l => l.job_id === job.id);
    assert.strictEqual(logs.length, 1, 'completeSpecialJob must leave exactly 1 service_logs row');
    assert.strictEqual(logs[0].staff_id, staff.id);

    const termExecs = harness.getTableRows('service_executions').filter(e => e.job_id === job.id && e.outcome === 'completed');
    assert.strictEqual(termExecs.length, 1);

    const acct = harness.getTableRows('entitlement_accounts').find(a => a.id === mainAcct.id);
    assert.strictEqual(acct.consumed_qty, 1);
    assert.strictEqual(acct.reserved_qty, 0);
    assert.strictEqual(acct.remaining_qty, 1);
  });

  await test('E1-T1-03', 'Valid legacy job completion with package_id via completeSpecialJob & bookingService.completeJob writes atomic log + redemption + audit', async () => {
    // Part A: HTTP completeSpecialJob
    const ctxA = await setupLegacyPackageJob({ totalQuantity: 3 });
    const resA = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: ctxA.job.id,
      afterPhotoUrls: VALID_PROOF.after,
      completionNotes: 'Legacy HTTP wash'
    }, ctxA.tokens.staffToken);

    assert.strictEqual(resA.statusCode, 200);
    assert.strictEqual(resA.body.success, true);

    const jobRowA = harness.getTableRows('service_jobs').find(j => j.id === ctxA.job.id);
    assert.strictEqual(jobRowA.status, 'completed');
    assert.strictEqual(jobRowA.entitlement_consumed, true);

    const pkgRowA = harness.getTableRows('customer_packages').find(p => p.id === ctxA.legacyPkg.id);
    assert.strictEqual(pkgRowA.remaining_quantity, 2);
    assert.strictEqual(pkgRowA.redeemed_quantity, 1);

    assert.strictEqual(harness.getTableRows('package_redemption_logs').filter(r => r.service_job_id === ctxA.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctxA.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_ledger').length, 0);
    assert.ok(harness.getTableRows('audit_logs').some(a => a.action === 'redeem_package'), 'package redemption must be audited');

    // Part B: Direct service bookingService.completeJob must also write service_logs atomically inside tx
    const ctxB = await setupLegacyPackageJob({ totalQuantity: 2 });
    const resB = await harness.withTransactionalDbMode(() =>
      harness.services.booking.completeJob(ctxB.job.id, {
        afterPhotos: VALID_PROOF.after,
        staffId: ctxB.staff.id,
        completionNotes: 'Direct bookingService complete',
        actor: ctxB.staff.staff_code
      })
    );
    assert.strictEqual(resB.success, true);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctxB.job.id).length, 1, 'bookingService.completeJob must write service_logs atomically');
  });

  await test('E1-T1-04', 'Idempotent retry via POST /api/see/jobs/:id/complete and completeSpecialJob with same clientMutationId does not double-consume', async () => {
    const ctx1 = await setupSeeJob({ packageQuantity: 3 });
    const mut1 = crypto.randomUUID();

    const first = await harness.callSee('POST', `/api/see/jobs/${ctx1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, ctx1.tokens.staffToken);
    assert.strictEqual(first.statusCode, 200);

    const replay1 = await harness.callSee('POST', `/api/see/jobs/${ctx1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, ctx1.tokens.staffToken);
    assert.strictEqual(replay1.statusCode, 200);
    assert.strictEqual(replay1.body.success, true);
    assert.strictEqual(replay1.body.execution.idempotent, true);

    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === ctx1.job.id && e.outcome === 'completed').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctx1.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx1.mainAcct.id).consumed_qty, 1);

    // Also test completeSpecialJob replay with same clientMutationId
    const ctx2 = await setupSeeJob({ packageQuantity: 3 });
    const mut2 = crypto.randomUUID();
    const first2 = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: ctx2.job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: mut2
    }, ctx2.tokens.staffToken);
    assert.strictEqual(first2.statusCode, 200);

    const replay2 = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: ctx2.job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: mut2
    }, ctx2.tokens.staffToken);
    assert.strictEqual(replay2.statusCode, 200);
    assert.strictEqual(replay2.body.success, true);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctx2.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx2.mainAcct.id).consumed_qty, 1);
  });

  await test('E1-T1-05', 'Customer service history read (getCustomerServiceJobs) includes latest_execution_id & outcome for completed SEE & legacy jobs', async () => {
    const seeCtx = await setupSeeJob({ packageQuantity: 2 });
    await harness.callSee('POST', `/api/see/jobs/${seeCtx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, seeCtx.tokens.staffToken);

    const histRes = await harness.postApi({
      action: 'getCustomerServiceJobs',
      customerId: seeCtx.customer.id
    }, seeCtx.tokens.adminToken);

    assert.strictEqual(histRes.statusCode, 200);
    assert.strictEqual(histRes.body.success, true);
    assert.strictEqual(histRes.body.history.length, 1);
    const entry = histRes.body.history[0];
    assert.strictEqual(entry.id, seeCtx.job.id);
    assert.strictEqual(entry.status, 'completed');
    assert.ok(entry.latest_execution_id, 'history item must include latest_execution_id');
    assert.strictEqual(entry.latest_execution_outcome, 'completed');
  });

  await test('E1-T1-06', 'Non-completion termination (failServiceJob / cancelSpecialJob / terminate) releases SEE reservation and writes zero completion logs', async () => {
    // 1. Cancel booked/assigned SEE job
    const c1 = await setupSeeJob({ packageQuantity: 2, startJob: false });
    const cancelRes = await harness.postApi({
      action: 'cancelSpecialJob',
      jobId: c1.job.id,
      reason: 'Customer rescheduled'
    }, c1.tokens.staffToken);
    assert.strictEqual(cancelRes.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c1.job.id).status, 'cancelled');
    const acct1 = harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id);
    assert.strictEqual(acct1.reserved_qty, 0);
    assert.strictEqual(acct1.consumed_qty, 0);
    assert.strictEqual(acct1.remaining_qty, 2);

    // 2. Fail in-progress SEE job via failServiceBooking (staff)
    const c2 = await setupSeeJob({ packageQuantity: 2, startJob: true });
    const failRes = await harness.postApi({
      action: 'failServiceBooking',
      jobId: c2.job.id,
      failureReason: 'Water supply unavailable'
    }, c2.tokens.staffToken);
    assert.strictEqual(failRes.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'unable_to_complete');
    const acct2 = harness.getTableRows('entitlement_accounts').find(a => a.id === c2.mainAcct.id);
    assert.strictEqual(acct2.reserved_qty, 0);
    assert.strictEqual(acct2.consumed_qty, 0);
    assert.strictEqual(acct2.remaining_qty, 2);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === c2.job.id).length, 0);

    // 3. Terminate via /api/see/jobs/:id/terminate (no_show)
    const c3 = await setupSeeJob({ packageQuantity: 2, startJob: false });
    const termRes = await harness.callSee('POST', `/api/see/jobs/${c3.job.id}/terminate`, {
      outcome: 'no_show',
      reason: 'Gate locked'
    }, c3.tokens.staffToken);
    assert.strictEqual(termRes.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c3.job.id).status, 'no_show');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c3.mainAcct.id).remaining_qty, 2);
  });

  // =========================================================================
  // TIER 2: Edge Cases, Fault Injection, Concurrency & Rollback (7 tests)
  // =========================================================================

  await test('E1-T2-01', 'Simulated service_logs INSERT failure mid-completion rolls back SEE and Legacy completion atomically', async () => {
    // SEE rollback on service_logs failure
    const seeCtx = await setupSeeJob({ packageQuantity: 3 });
    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT', error: new Error('Simulated service_logs write crash') });

    const seeRes = await harness.callSee('POST', `/api/see/jobs/${seeCtx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, seeCtx.tokens.staffToken);

    assert.ok(seeRes.statusCode >= 400);
    assert.strictEqual(seeRes.body.success, false);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeCtx.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === seeCtx.job.id && e.outcome === 'completed').length, 0);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === seeCtx.job.id).length, 0);
    const seeAcct = harness.getTableRows('entitlement_accounts').find(a => a.id === seeCtx.mainAcct.id);
    assert.strictEqual(seeAcct.reserved_qty, 1);
    assert.strictEqual(seeAcct.consumed_qty, 0);

    // Legacy rollback on service_logs failure
    const legCtx = await setupLegacyPackageJob({ totalQuantity: 3 });
    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT', error: new Error('Simulated legacy service_logs write crash') });

    const legRes = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: legCtx.job.id,
      afterPhotoUrls: VALID_PROOF.after
    }, legCtx.tokens.staffToken);

    assert.ok(legRes.statusCode >= 400);
    assert.strictEqual(legRes.body.success, false);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === legCtx.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === legCtx.job.id).length, 0);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').filter(r => r.service_job_id === legCtx.job.id).length, 0);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legCtx.legacyPkg.id).remaining_quantity, 3);
  });

  await test('E1-T2-02', 'Simulated service_executions / entitlement_ledger / package_redemption_logs failure mid-completion leaves zero partial state', async () => {
    // 1. entitlement_ledger INSERT fails
    const c1 = await setupSeeJob({ packageQuantity: 2 });
    harness.injectErrorOnce({ table: 'entitlement_ledger', op: 'INSERT', error: new Error('Simulated ledger failure') });
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.seeExecution.completeExecution(c1.job.id, {
          staffId: c1.staff.id,
          checklistResults: VALID_CHECKLIST,
          proofPhotos: VALID_PROOF,
          clientMutationId: crypto.randomUUID()
        })
      )
    );
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c1.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.outcome === 'completed').length, 0);
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).consumed_qty, 0);

    // 2. service_executions INSERT fails
    const c2 = await setupSeeJob({ packageQuantity: 2 });
    harness.injectErrorOnce({ table: 'service_executions', op: 'INSERT', error: new Error('Simulated execution insert failure') });
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.seeExecution.completeExecution(c2.job.id, {
          staffId: c2.staff.id,
          checklistResults: VALID_CHECKLIST,
          proofPhotos: VALID_PROOF
        })
      )
    );
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);

    // 3. package_redemption_logs INSERT fails
    const c3 = await setupLegacyPackageJob({ totalQuantity: 2 });
    harness.injectErrorOnce({ table: 'package_redemption_logs', op: 'INSERT', error: new Error('Simulated redemption log failure') });
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.booking.completeJob(c3.job.id, {
          afterPhotos: VALID_PROOF.after,
          staffId: c3.staff.id
        })
      )
    );
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c3.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === c3.legacyPkg.id).remaining_quantity, 2);
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
  });

  await test('E1-T2-03', 'Simulated audit_logs failure inside packageService.redeemPackage rolls back entire legacy booking completion', async () => {
    const legCtx = await setupLegacyPackageJob({ totalQuantity: 3 });
    harness.injectErrorOnce({ table: 'audit_logs', op: 'INSERT', error: new Error('Simulated audit_logs failure') });

    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.booking.completeJob(legCtx.job.id, {
          afterPhotos: VALID_PROOF.after,
          staffId: legCtx.staff.id,
          actor: legCtx.staff.staff_code
        })
      )
    );

    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === legCtx.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legCtx.legacyPkg.id).remaining_quantity, 3);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 0);
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
  });

  await test('E1-T2-04', 'Duplicate completion with different or omitted clientMutationId on already-completed job is rejected cleanly', async () => {
    const ctx = await setupSeeJob({ packageQuantity: 3 });
    const mut1 = crypto.randomUUID();
    const res1 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, ctx.tokens.staffToken);
    assert.strictEqual(res1.statusCode, 200);

    // Different clientMutationId
    const resDiff = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assert.ok(resDiff.statusCode >= 400 && resDiff.statusCode < 500);
    assert.strictEqual(resDiff.body.success, false);

    // Omitted clientMutationId
    const resOmit = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF
    }, ctx.tokens.staffToken);
    assert.ok(resOmit.statusCode >= 400 && resOmit.statusCode < 500);
    assert.strictEqual(resOmit.body.success, false);

    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === ctx.job.id && e.outcome === 'completed').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctx.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 1);
  });

  await test('E1-T2-05', 'Concurrent completion race (x5 distinct mutation IDs and x3 same clientMutationId) serializes cleanly without double consumption', async () => {
    // Part A: 5 concurrent calls with distinct mutation IDs -> strictly 1 succeeds, 4 fail cleanly
    const ctxA = await setupSeeJob({ packageQuantity: 4 });
    harness.setOpDelay({ table: 'service_executions', op: 'INSERT', ms: 15 });
    const distinctOutcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        harness.callSee('POST', `/api/see/jobs/${ctxA.job.id}/complete`, {
          checklistResults: VALID_CHECKLIST,
          proofPhotos: VALID_PROOF,
          clientMutationId: crypto.randomUUID()
        }, ctxA.tokens.staffToken)
      )
    );
    harness.clearFaults();

    const okA = distinctOutcomes.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200);
    const rejA = distinctOutcomes.filter(r => r.status === 'fulfilled' && r.value.statusCode >= 400);
    assert.strictEqual(okA.length, 1, `Expected strictly 1 winner in distinct-ID race, got ${okA.length}`);
    assert.strictEqual(rejA.length, 4);
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === ctxA.job.id && e.outcome === 'completed').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctxA.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctxA.mainAcct.id).consumed_qty, 1);

    // Part B: 3 concurrent calls with identical clientMutationId -> 1 executes, others replay idempotently
    const ctxB = await setupSeeJob({ packageQuantity: 4 });
    const sharedMut = crypto.randomUUID();
    harness.setOpDelay({ table: 'service_executions', op: 'INSERT', ms: 15 });
    const sameOutcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        harness.callSee('POST', `/api/see/jobs/${ctxB.job.id}/complete`, {
          checklistResults: VALID_CHECKLIST,
          proofPhotos: VALID_PROOF,
          clientMutationId: sharedMut
        }, ctxB.tokens.staffToken)
      )
    );
    harness.clearFaults();

    const okB = sameOutcomes.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200);
    assert.strictEqual(okB.length, 3, 'All concurrent retries with same clientMutationId should succeed idempotently');
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === ctxB.job.id && e.outcome === 'completed').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctxB.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctxB.mainAcct.id).consumed_qty, 1);
  });

  await test('E1-T2-06', 'Recovery after simulated post-commit network drop + retry, and pre-commit transient DB failure + retry', async () => {
    // 1. Post-commit network drop
    const c1 = await setupSeeJob({ packageQuantity: 3 });
    const mut1 = crypto.randomUUID();
    harness.simulatePostCommitNetworkDropOnce(Object.assign(new Error('ECONNRESET after commit'), { code: 'ECONNRESET' }));

    const dropped = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, c1.tokens.staffToken);
    assert.ok(dropped.statusCode >= 400);

    const retry1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, c1.tokens.staffToken);
    assert.strictEqual(retry1.statusCode, 200);
    assert.strictEqual(retry1.body.success, true);
    assert.strictEqual(retry1.body.execution.idempotent, true);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === c1.job.id).length, 1);

    // 2. Pre-commit transient DB failure -> rollback -> retry succeeds cleanly
    const c2 = await setupSeeJob({ packageQuantity: 3 });
    const mut2 = crypto.randomUUID();
    harness.injectErrorOnce({ table: 'service_jobs', op: 'UPDATE', error: new Error('Transient lock timeout') });

    const preFail = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut2
    }, c2.tokens.staffToken);
    assert.ok(preFail.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'in_progress');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c2.mainAcct.id).consumed_qty, 0);

    const retry2 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut2
    }, c2.tokens.staffToken);
    assert.strictEqual(retry2.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'completed');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c2.mainAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === c2.job.id).length, 1);
  });

  await test('E1-T2-07', 'deleteSpecialJob and stopCustomerService release reserved SEE entitlements without dangling reservations', async () => {
    // 1. deleteSpecialJob on assigned (reserved) SEE job
    const c1 = await setupSeeJob({ packageQuantity: 3, startJob: false });
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).reserved_qty, 1);

    const delRes = await harness.postApi({
      action: 'deleteSpecialJob',
      jobId: c1.job.id
    }, c1.tokens.adminToken);
    assert.strictEqual(delRes.statusCode, 200);
    assert.strictEqual(delRes.body.success, true);

    const acct1 = harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id);
    assert.strictEqual(acct1.reserved_qty, 0, 'deleteSpecialJob must release SEE reservation');
    assert.strictEqual(acct1.remaining_qty, 3);

    // 2. stopCustomerService on booked/assigned SEE job
    const c2 = await setupSeeJob({ packageQuantity: 2, startJob: false });
    const stopRes = await harness.postApi({
      action: 'stopCustomerService',
      customerId: c2.customer.id,
      reason: 'Moving cities'
    }, c2.tokens.adminToken);
    assert.strictEqual(stopRes.statusCode, 200);
    assert.strictEqual(stopRes.body.success, true);

    const acct2 = harness.getTableRows('entitlement_accounts').find(a => a.id === c2.mainAcct.id);
    assert.strictEqual(acct2.reserved_qty, 0, 'stopCustomerService must release SEE reservation');
    assert.strictEqual(acct2.remaining_qty, 2);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'cancelled');
  });

  // =========================================================================
  // TIER 3: Pairwise Cross-Feature Combinations (4 matrices)
  // =========================================================================

  await test('E1-T3-01', 'Pairwise: (SEE vs Legacy+Pkg) x (completeSpecialJob vs /api/see/complete vs bookingService) x (valid vs mid-tx fault)', async () => {
    // Valid SEE via completeSpecialJob
    const s1 = await setupSeeJob({ packageQuantity: 2 });
    const r1 = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: s1.job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: crypto.randomUUID()
    }, s1.tokens.staffToken);
    assert.strictEqual(r1.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === s1.job.id).length, 1);

    // Faulted SEE via completeSpecialJob
    const s2 = await setupSeeJob({ packageQuantity: 2 });
    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT' });
    const r2 = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: s2.job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: crypto.randomUUID()
    }, s2.tokens.staffToken);
    assert.ok(r2.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === s2.job.id).status, 'in_progress');

    // Valid Legacy+Pkg via bookingService.completeJob
    const l1 = await setupLegacyPackageJob({ totalQuantity: 2 });
    const r3 = await harness.withTransactionalDbMode(() =>
      harness.services.booking.completeJob(l1.job.id, { afterPhotos: VALID_PROOF.after, staffId: l1.staff.id })
    );
    assert.strictEqual(r3.success, true);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === l1.legacyPkg.id).remaining_quantity, 1);

    // Faulted Legacy+Pkg via bookingService.completeJob
    const l2 = await setupLegacyPackageJob({ totalQuantity: 2 });
    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT' });
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.services.booking.completeJob(l2.job.id, { afterPhotos: VALID_PROOF.after, staffId: l2.staff.id })
      )
    );
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === l2.legacyPkg.id).remaining_quantity, 2);
  });

  await test('E1-T3-02', 'Pairwise: (staff vs admin) x (authorizedException present vs absent) x (required addon pending vs completed)', async () => {
    // 1. Staff passes authorizedException with pending required addon -> stripped -> rejected!
    const c1 = await setupSeeJob({ packageQuantity: 2, includeAddon: true, addonOptional: false });
    const r1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      authorizedException: { reason: 'Staff spoof', approvalReference: 'FAKE' },
      clientMutationId: crypto.randomUUID()
    }, c1.tokens.staffToken);
    assert.ok(r1.statusCode >= 400 && r1.statusCode < 500, 'Staff cannot bypass required addon with authorizedException');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c1.job.id).status, 'in_progress');

    // 2. Admin passes authorizedException with pending required addon -> completes as partial_exception & releases addon reservation
    const r2 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      authorizedException: { reason: 'Customer declined add-on on site', approvalReference: 'ADM-99' },
      clientMutationId: crypto.randomUUID()
    }, c1.tokens.adminToken);
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(r2.body.execution.outcome, 'partial_exception');
    const addonAcct = harness.getTableRows('entitlement_accounts').find(a => a.id === c1.addonAcct.id);
    assert.strictEqual(addonAcct.reserved_qty, 0);
    assert.strictEqual(addonAcct.consumed_qty, 0);
    assert.strictEqual(addonAcct.remaining_qty, 1);

    // 3. Admin without authorizedException with pending addon -> fails cleanly
    const c2 = await setupSeeJob({ packageQuantity: 2, includeAddon: true, addonOptional: false });
    const r3 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c2.tokens.adminToken);
    assert.ok(r3.statusCode >= 400);

    // 4. Staff completes addon then completes job without exception -> consumes both main and addon
    const jobAddon = harness.getTableRows('service_job_addons').find(a => a.job_id === c2.job.id);
    const addonComp = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/addons/${jobAddon.id}/complete`, {
      status: 'completed'
    }, c2.tokens.staffToken);
    assert.strictEqual(addonComp.statusCode, 200);
    const r4 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c2.tokens.staffToken);
    assert.strictEqual(r4.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c2.addonAcct.id).consumed_qty, 1);
  });

  await test('E1-T3-03', 'Pairwise: (same clientMutationId vs new clientMutationId) x (sequential retry vs concurrent race)', async () => {
    const c1 = await setupSeeJob({ packageQuantity: 3 });
    const mutA = crypto.randomUUID();
    const sFirst = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mutA
    }, c1.tokens.staffToken);
    assert.strictEqual(sFirst.statusCode, 200);

    const sSame = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mutA
    }, c1.tokens.staffToken);
    assert.strictEqual(sSame.statusCode, 200);

    const sNew = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: crypto.randomUUID()
    }, c1.tokens.staffToken);
    assert.ok(sNew.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === c1.job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).consumed_qty, 1);
  });

  await test('E1-T3-04', 'Pairwise: pre-existing service_logs or entitlement_ledger idempotency records do not corrupt completion or double-consume', async () => {
    const ctx = await setupSeeJob({ packageQuantity: 2 });
    const mut = crypto.randomUUID();

    // First completion succeeds
    const r1 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mut
    }, ctx.tokens.staffToken);
    assert.strictEqual(r1.statusCode, 200);

    // Direct service_logs.recordCompletion for same jobId handles 23505 idempotently without duplicate row
    const dupLogRes = await harness.withTransactionalDbMode(() =>
      harness.repos.serviceLogs.recordCompletion({
        clientMutationId: crypto.randomUUID(),
        staffId: ctx.staff.id,
        jobId: ctx.job.id,
        status: 'completed',
        completedAtDevice: new Date().toISOString()
      })
    );
    assert.strictEqual(dupLogRes.inserted, false);
    assert.strictEqual(dupLogRes.idempotent, true);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctx.job.id).length, 1);

    // Direct mutateEntitlement with same idempotencyKey replays without double-consume
    const replayLed = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.mutateEntitlement({
        accountId: ctx.mainAcct.id,
        entryType: 'consume',
        quantity: 1,
        idempotencyKey: `consume:job:${ctx.job.id}`,
        reason: 'Replay check',
        actor: 'qa'
      })
    );
    assert.strictEqual(replayLed.idempotentReplay, true);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 1);
  });

  // =========================================================================
  // TIER 4: Real-World Multi-Feature Workloads (5 workloads)
  // =========================================================================

  await test('E1-T4-01', 'Workload: Purchase 2 SEE credits + 1 addon -> book/start/addon/complete job 1 (network drop + retry) -> book & cancel job 2', async () => {
    const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
    const staff = await harness.seedStaff();
    const { service, addon, pkg } = await harness.seedSeeServiceAndPackage({
      packageQuantity: 2,
      includeAddon: true,
      addonOptional: false,
      addonQuantity: 1
    });
    const tokens = harness.createAuthTokens({ staff });

    const purchaseRes = await harness.callSee('POST', '/api/see/purchases', {
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      packageIdOrCode: pkg.id,
      saleReference: `WORKLOAD_${crypto.randomUUID()}`
    }, tokens.adminToken);
    assert.strictEqual(purchaseRes.statusCode, 201);
    const mainAcct = purchaseRes.body.accounts.find(a => a.service_id === service.id);
    const addonAcct = purchaseRes.body.accounts.find(a => a.addon_id === addon.id);

    // Book job 1
    const j1Res = await harness.callSee('POST', '/api/see/jobs', {
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purchaseRes.body.snapshot.id,
      staffId: staff.id,
      addonIds: [addon.id]
    }, tokens.adminToken);
    assert.strictEqual(j1Res.statusCode, 201);
    const job1 = j1Res.body.job;

    await harness.callSee('POST', `/api/see/jobs/${job1.id}/start`, {}, tokens.staffToken);
    const jobAddon = harness.getTableRows('service_job_addons').find(a => a.job_id === job1.id);
    await harness.callSee('POST', `/api/see/jobs/${job1.id}/addons/${jobAddon.id}/complete`, { status: 'completed' }, tokens.staffToken);

    const mut1 = crypto.randomUUID();
    harness.simulatePostCommitNetworkDropOnce();
    const dropRes = await harness.callSee('POST', `/api/see/jobs/${job1.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, tokens.staffToken);
    assert.ok(dropRes.statusCode >= 400);

    const retryRes = await harness.callSee('POST', `/api/see/jobs/${job1.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: mut1
    }, tokens.staffToken);
    assert.strictEqual(retryRes.statusCode, 200);

    // Book job 2 -> cancel job 2
    const j2Res = await harness.callSee('POST', '/api/see/jobs', {
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purchaseRes.body.snapshot.id,
      staffId: staff.id
    }, tokens.adminToken);
    assert.strictEqual(j2Res.statusCode, 201);
    const job2 = j2Res.body.job;

    const cancel2 = await harness.postApi({
      action: 'cancelSpecialJob',
      jobId: job2.id,
      reason: 'Customer travelling'
    }, tokens.staffToken);
    assert.strictEqual(cancel2.statusCode, 200);

    const balRes = await harness.callSee('GET', `/api/see/customers/${customer.id}/balance`, null, tokens.adminToken);
    assert.strictEqual(balRes.statusCode, 200);
    const finalMain = balRes.body.accounts.find(a => a.id === mainAcct.id);
    const finalAddon = balRes.body.accounts.find(a => a.id === addonAcct.id);
    assert.strictEqual(finalMain.purchased_qty, 2);
    assert.strictEqual(finalMain.reserved_qty, 0);
    assert.strictEqual(finalMain.consumed_qty, 1);
    assert.strictEqual(finalMain.remaining_qty, 1);
    assert.strictEqual(finalAddon.consumed_qty, 1);
    assert.strictEqual(finalAddon.remaining_qty, 0);
    assert.strictEqual(harness.getTableRows('service_logs').length, 1);
  });

  await test('E1-T4-02', 'Workload: Mixed staff shift (1 SEE + 1 Legacy paid + 1 Legacy package) under concurrent retry bursts', async () => {
    const seeCtx = await setupSeeJob({ packageQuantity: 2 });
    const legPaid = await setupLegacyPackageJob({ withPackage: false });
    const legPkg = await setupLegacyPackageJob({ totalQuantity: 3, withPackage: true });

    const mutSee = crypto.randomUUID();
    const mutLegPaid = crypto.randomUUID();
    const mutLegPkg = crypto.randomUUID();

    harness.setOpDelay({ table: 'service_logs', op: 'INSERT', ms: 10 });
    const results = await Promise.allSettled([
      harness.postApi({ action: 'completeSpecialJob', jobId: seeCtx.job.id, checklistResults: VALID_CHECKLIST, afterPhotoUrls: VALID_PROOF.after, clientMutationId: mutSee }, seeCtx.tokens.staffToken),
      harness.postApi({ action: 'completeSpecialJob', jobId: seeCtx.job.id, checklistResults: VALID_CHECKLIST, afterPhotoUrls: VALID_PROOF.after, clientMutationId: mutSee }, seeCtx.tokens.staffToken),
      harness.postApi({ action: 'completeSpecialJob', jobId: legPaid.job.id, afterPhotoUrls: VALID_PROOF.after, clientMutationId: mutLegPaid }, legPaid.tokens.staffToken),
      harness.postApi({ action: 'completeSpecialJob', jobId: legPkg.job.id, afterPhotoUrls: VALID_PROOF.after, clientMutationId: mutLegPkg }, legPkg.tokens.staffToken),
      harness.postApi({ action: 'completeSpecialJob', jobId: legPkg.job.id, afterPhotoUrls: VALID_PROOF.after, clientMutationId: crypto.randomUUID() }, legPkg.tokens.staffToken)
    ]);
    harness.clearFaults();

    assert.strictEqual(results.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200).length, 4);
    assert.strictEqual(harness.getTableRows('service_logs').length, 3, 'Exactly 3 distinct service_logs for 3 distinct jobs');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeCtx.mainAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.legacyPkg.id).remaining_quantity, 2);
  });

  await test('E1-T4-03', 'Workload: Transient service_logs outage fails 2 attempts, recovery + retry with original clientMutationId succeeds 100%', async () => {
    const c1 = await setupSeeJob({ packageQuantity: 2 });
    const c2 = await setupSeeJob({ packageQuantity: 2 });
    const mut1 = crypto.randomUUID();
    const mut2 = crypto.randomUUID();

    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT', error: new Error('DB outage 1') });
    harness.injectErrorOnce({ table: 'service_logs', op: 'INSERT', error: new Error('DB outage 2') });

    const fail1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mut1
    }, c1.tokens.staffToken);
    const fail2 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mut2
    }, c2.tokens.staffToken);
    assert.ok(fail1.statusCode >= 400);
    assert.ok(fail2.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.outcome === 'completed').length, 0);

    // Service recovers -> retry with original clientMutationId
    const ok1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mut1
    }, c1.tokens.staffToken);
    const ok2 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST, proofPhotos: VALID_PROOF, clientMutationId: mut2
    }, c2.tokens.staffToken);
    assert.strictEqual(ok1.statusCode, 200);
    assert.strictEqual(ok2.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_logs').length, 2);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).consumed_qty, 1);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c2.mainAcct.id).consumed_qty, 1);
  });

  await test('E1-T4-04', 'Workload: Solar SEE job discrepancy verification + approval -> completion -> stopCustomerService on second booked job', async () => {
    const { customer, location } = await harness.seedCustomerAndAssets();
    const staff = await harness.seedStaff();
    const { service, pkg } = await harness.seedSeeServiceAndPackage({
      categoryId: 'solar_cleaning',
      name: 'Solar Panel Cleaning',
      packageQuantity: 2,
      checklistRequirements: [
        { id: 'solar_wash', key: 'solar_wash', label: 'Solar Wash', required: true }
      ]
    });
    const tokens = harness.createAuthTokens({ staff });

    const purchase = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.createPurchase({
        customerId: customer.id,
        locationId: location.id,
        packageIdOrCode: pkg.id,
        saleReference: `SOLAR_${crypto.randomUUID()}`
      })
    );
    const acct = purchase.accounts[0];

    const job1 = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: customer.id,
        locationId: location.id,
        serviceIdOrCode: service.id,
        entitlementAccountId: acct.id,
        purchaseSnapshotId: purchase.snapshot.id,
        staffId: staff.id,
        solarEstimate: { estimatedPanelCount: 12, systemCapacityKw: 5 },
        actor: 'qa_admin'
      })
    );
    const job2 = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: customer.id,
        locationId: location.id,
        serviceIdOrCode: service.id,
        entitlementAccountId: acct.id,
        purchaseSnapshotId: purchase.snapshot.id,
        actor: 'qa_admin'
      })
    );

    await harness.callSee('POST', `/api/see/jobs/${job1.id}/start`, {}, tokens.staffToken);
    const verRes = await harness.callSee('POST', `/api/see/jobs/${job1.id}/solar-verify`, {
      actualPanelCount: 16,
      discrepancyReason: '4 extra panels on annex roof'
    }, tokens.staffToken);
    assert.strictEqual(verRes.statusCode, 200);
    assert.strictEqual(verRes.body.verification.approval_status, 'pending_approval');

    const appRes = await harness.callSee('POST', `/api/see/jobs/${job1.id}/solar-approve`, {
      approved: true,
      finalServicedQuantity: 16
    }, tokens.adminToken);
    assert.strictEqual(appRes.statusCode, 200);
    assert.strictEqual(appRes.body.verification.approval_status, 'approved');

    const comp1 = await harness.callSee('POST', `/api/see/jobs/${job1.id}/complete`, {
      checklistResults: [{ id: 'solar_wash', completed: true }],
      proofPhotos: VALID_PROOF,
      actualQuantity: 16,
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(comp1.statusCode, 200);

    const stopRes = await harness.postApi({
      action: 'stopCustomerService',
      customerId: customer.id,
      reason: 'Pause remaining visits'
    }, tokens.adminToken);
    assert.strictEqual(stopRes.statusCode, 200);

    const finalAcct = harness.getTableRows('entitlement_accounts').find(a => a.id === acct.id);
    assert.strictEqual(finalAcct.consumed_qty, 1);
    assert.strictEqual(finalAcct.reserved_qty, 0);
    assert.strictEqual(finalAcct.remaining_qty, 1);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === job2.id).status, 'cancelled');
  });

  await test('E1-T4-05', 'Workload: Multi-staff authorization boundary (Staff B 403 -> Admin reassigns to Staff B -> Staff B completes)', async () => {
    const { job, staff: staffA, tokens: tokensA } = await setupSeeJob({ packageQuantity: 2, startJob: false });
    const staffB = await harness.seedStaff({ name: 'Staff Bravo' });
    const tokensB = harness.createAuthTokens({ staff: staffB });

    // Staff B tries to start & complete Staff A's job -> 403
    const unauthStart = await harness.callSee('POST', `/api/see/jobs/${job.id}/start`, {}, tokensB.staffToken);
    assert.strictEqual(unauthStart.statusCode, 403);
    const unauthComp = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: job.id,
      checklistResults: VALID_CHECKLIST,
      afterPhotoUrls: VALID_PROOF.after
    }, tokensB.staffToken);
    assert.strictEqual(unauthComp.statusCode, 403);

    // Admin reassigns to Staff B
    const reassRes = await harness.postApi({
      action: 'reassignSpecialJob',
      jobId: job.id,
      toStaffId: staffB.id,
      reason: 'Staff A on leave'
    }, tokensA.adminToken);
    assert.strictEqual(reassRes.statusCode, 200);

    // Staff A now gets 403
    const oldStaffStart = await harness.callSee('POST', `/api/see/jobs/${job.id}/start`, {}, tokensA.staffToken);
    assert.strictEqual(oldStaffStart.statusCode, 403);

    // Staff B starts and completes
    const startB = await harness.callSee('POST', `/api/see/jobs/${job.id}/start`, {}, tokensB.staffToken);
    assert.strictEqual(startB.statusCode, 200);
    const compB = await harness.callSee('POST', `/api/see/jobs/${job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, tokensB.staffToken);
    assert.strictEqual(compB.statusCode, 200);

    const log = harness.getTableRows('service_logs').find(l => l.job_id === job.id);
    assert.strictEqual(log.staff_id, staffB.id);
    assert.notStrictEqual(log.staff_id, staffA.id);
  });

  console.log(`\n[E1 Completion Integrity Summary] Passed: ${passed}, Failed: ${failed}`);
  harness.teardown();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  harness.teardown();
  process.exit(1);
});
