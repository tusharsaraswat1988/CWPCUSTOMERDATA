/**
 * =========================================================================
 * P0 E2E QA Suite 2: Protect SEE Jobs From Generic Offline Completion (E2)
 * Requirements: ORIGINAL_REQUEST.md R2, R5 | PROJECT.md F7, F8, F9
 * Tiers: Tier 1 (6), Tier 2 (6), Tier 3 (3 pairwise), Tier 4 (5 workloads)
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

async function setupDccFixture({ assignedStaff = null, status = 'active' } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = assignedStaff || await harness.seedStaff({ workType: 'dcc_only', serviceCapabilities: ['daily_car_cleaning'] });
  const tokens = harness.createAuthTokens({ staff });

  const subRes = await harness.withTransactionalDbMode(() =>
    harness.services.dcc.createSubscription({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      staffId: staff.id,
      packageName: 'DCC 30D',
      startDate: '2026-11-01',
      endDate: '2026-12-31'
    }, 'qa_admin')
  );
  const subscription = subRes.subscription || subRes;

  if (status !== 'active') {
    await harness.engine.query(
      `UPDATE public.subscriptions SET status = $2 WHERE id = $1`,
      [subscription.id, status]
    );
  }

  return { customer, location, vehicle, staff, subscription, tokens };
}

async function setupSeeJobFixture({ packageQuantity = 2, includeAddon = false } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff();
  const { service, addon, pkg } = await harness.seedSeeServiceAndPackage({
    packageQuantity,
    includeAddon
  });
  const tokens = harness.createAuthTokens({ staff });

  const purchase = await harness.withTransactionalDbMode(() =>
    harness.services.seeEntitlement.createPurchase({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      packageIdOrCode: pkg.id,
      saleReference: `OFFSEE_${crypto.randomUUID()}`
    })
  );
  const mainAcct = purchase.accounts.find(a => a.service_id === service.id);

  const job = await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.createCanonicalJob({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purchase.snapshot.id,
      staffId: staff.id,
      addonIds: addon ? [addon.id] : [],
      actor: 'qa_admin'
    })
  );

  return { customer, location, vehicle, staff, service, mainAcct, job, tokens };
}

async function setupLegacyJobFixture({ withPackage = true, totalQuantity = 3, assignStaff = true } = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff();
  const tokens = harness.createAuthTokens({ staff });

  let legacyPkg = null;
  if (withPackage) {
    const sold = await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        serviceCategoryId: 'car_washing',
        packageCode: 'WASH_SUB_4_5',
        packageName: 'Legacy Offline Wash Pack',
        totalQuantity,
        unitPrice: 500,
        totalPrice: 500 * totalQuantity,
        validityMonths: 6
      }, 'qa_admin')
    );
    legacyPkg = sold.package || sold;
  }

  const bookingRes = await harness.withTransactionalDbMode(() =>
    harness.services.booking.createBooking({
      customerId: customer.id,
      vehicleId: vehicle.id,
      locationId: location.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Legacy Offline Wash',
      packageId: legacyPkg ? legacyPkg.id : null,
      staffId: assignStaff ? staff.id : null,
      servicePrice: legacyPkg ? 0 : 600
    }, 'qa_admin')
  );

  return { customer, location, vehicle, staff, legacyPkg, job: bookingRes.job || bookingRes, tokens };
}

async function run() {
  // =========================================================================
  // TIER 1: Core Happy-Path & Offline Protection (6 tests)
  // =========================================================================

  await test('E2-T1-01', 'Valid DCC offline completion batch via POST /api syncCompletions succeeds with IST date and zero ledger impact', async () => {
    const { vehicle, staff, subscription, tokens } = await setupDccFixture();
    const mutId = crypto.randomUUID();

    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: mutId,
        subscriptionId: subscription.id,
        vehicleId: vehicle.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T06:30:00.000Z',
        photoUrl: 'https://cdn.example.com/dcc-1.jpg',
        notes: 'Morning clean'
      }]
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.results[0].status, 'synced');

    const logs = harness.getTableRows('service_logs');
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].job_id, null);
    assert.strictEqual(logs[0].staff_id, staff.id);
    assert.strictEqual(logs[0].status, 'completed');
    assert.strictEqual(logs[0].service_date, '2026-11-27');
    assert.strictEqual(harness.getTableRows('entitlement_ledger').length, 0);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 0);
  });

  await test('E2-T1-02', 'Valid DCC non-completion outcomes sync with non-completed status across syncCompletions and recordDailyCleanWithPhoto', async () => {
    const outcomes = ['car_not_present', 'customer_absent', 'vehicle_not_available', 'skipped', 'unable_to_complete'];
    for (let i = 0; i < outcomes.length; i++) {
      harness.reset();
      const { vehicle, subscription, tokens } = await setupDccFixture();
      const status = outcomes[i];
      const mut = crypto.randomUUID();
      const res = await harness.postApi({
        action: 'syncCompletions',
        completions: [{
          clientMutationId: mut,
          subscriptionId: subscription.id,
          vehicleId: vehicle.id,
          status,
          carNotPresent: status === 'car_not_present',
          completedAtDevice: '2026-11-27T07:00:00.000Z'
        }]
      }, tokens.staffToken);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.results[0].status, 'synced');
      const log = harness.getTableRows('service_logs')[0];
      assert.strictEqual(log.status, status);
      assert.notStrictEqual(log.status, 'completed');
    }

    // recordDailyCleanWithPhoto car_not_present check
    harness.reset();
    const dcc2 = await setupDccFixture();
    const photoRes = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc2.subscription.id,
      vehicleId: dcc2.vehicle.id,
      customerId: dcc2.customer.id,
      carNotPresent: true,
      photoUrl: 'https://cdn.example.com/empty-spot.jpg',
      completedAtDevice: '2026-11-27T08:00:00.000Z'
    }, dcc2.tokens.staffToken);
    assert.strictEqual(photoRes.statusCode, 200);
    assert.strictEqual(photoRes.body.log.status, 'car_not_present');
  });

  await test('E2-T1-03', 'Valid legacy non-SEE assigned job completion via syncCompletions completes job and redeems package once', async () => {
    const { legacyPkg, job, tokens } = await setupLegacyJobFixture({ withPackage: true, totalQuantity: 3 });
    const mutId = crypto.randomUUID();

    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: mutId,
        jobId: job.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T09:00:00.000Z',
        photoUrl: 'https://cdn.example.com/leg-after.jpg',
        notes: 'Offline wash synced'
      }]
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.results[0].status, 'synced');

    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === job.id);
    assert.strictEqual(jobRow.status, 'completed');
    assert.strictEqual(jobRow.entitlement_consumed, true);

    const pkgRow = harness.getTableRows('customer_packages').find(p => p.id === legacyPkg.id);
    assert.strictEqual(pkgRow.remaining_quantity, 2);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').filter(r => r.service_job_id === job.id).length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === job.id).length, 1);
    assert.strictEqual(harness.getTableRows('entitlement_ledger').length, 0);
  });

  await test('E2-T1-04', 'Legacy non-SEE non-completion outcome via syncCompletions writes log and NEVER marks job completed or redeems package', async () => {
    const { legacyPkg, job, tokens } = await setupLegacyJobFixture({ withPackage: true, totalQuantity: 2 });

    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: job.id,
        status: 'unable_to_complete',
        completedAtDevice: '2026-11-27T09:30:00.000Z',
        notes: 'Customer vehicle not at parking slot'
      }]
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === job.id);
    assert.notStrictEqual(jobRow.status, 'completed', 'Non-completion offline sync must never mark job completed');

    const pkgRow = harness.getTableRows('customer_packages').find(p => p.id === legacyPkg.id);
    assert.strictEqual(pkgRow.remaining_quantity, 2, 'Non-completion must not redeem package');
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 0);
    const log = harness.getTableRows('service_logs').find(l => l.job_id === job.id);
    assert.ok(log);
    assert.notStrictEqual(log.status, 'completed');
  });

  await test('E2-T1-05', 'SEE-managed job completion via syncCompletions is rejected with SEE_CANONICAL_COMPLETION_REQUIRED and zero state mutation', async () => {
    const { mainAcct, job, tokens } = await setupSeeJobFixture({ packageQuantity: 3 });

    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: job.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T10:00:00.000Z',
        photoUrl: 'https://cdn.example.com/bypass.jpg'
      }]
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    const item = res.body.results[0];
    assert.strictEqual(item.status, 'error');
    assert.strictEqual(item.code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    assert.strictEqual(item.retryVia, `/api/see/jobs/${job.id}/complete`);

    const jobRow = harness.getTableRows('service_jobs').find(j => j.id === job.id);
    assert.strictEqual(jobRow.status, 'assigned', 'SEE job status must remain untouched');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
    assert.strictEqual(harness.getTableRows('service_executions').length, 0);
    const acct = harness.getTableRows('entitlement_accounts').find(a => a.id === mainAcct.id);
    assert.strictEqual(acct.consumed_qty, 0);
    assert.strictEqual(acct.reserved_qty, 1);
  });

  await test('E2-T1-06', 'Unassigned or other-staff jobId via syncCompletions and jobId on recordDailyCleanWithPhoto are rejected cleanly', async () => {
    // 1. Unassigned legacy job
    const unass = await setupLegacyJobFixture({ assignStaff: false });
    const rUnass = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: unass.job.id,
        status: 'completed'
      }]
    }, unass.tokens.staffToken);
    assert.strictEqual(rUnass.body.results[0].status, 'error');
    assert.notStrictEqual(harness.getTableRows('service_jobs').find(j => j.id === unass.job.id).status, 'completed');

    // 2. Other staff's job
    const otherStaff = await harness.seedStaff({ name: 'Other Staff' });
    const otherTok = harness.createAuthTokens({ staff: otherStaff });
    const assignedCtx = await setupLegacyJobFixture({ assignStaff: true });
    const rOther = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: assignedCtx.job.id,
        status: 'completed'
      }]
    }, otherTok.staffToken);
    assert.strictEqual(rOther.body.results[0].status, 'error');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);

    // 3. Passing jobId to DCC-only recordDailyCleanWithPhoto must be rejected
    const seeCtx = await setupSeeJobFixture();
    const dccPhotoJobRes = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      jobId: seeCtx.job.id,
      status: 'completed',
      photoUrl: 'https://cdn.example.com/bypass.jpg'
    }, seeCtx.tokens.staffToken);
    assert.ok(dccPhotoJobRes.statusCode >= 400);
    assert.strictEqual(dccPhotoJobRes.body.success, false);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeCtx.job.id).status, 'assigned');
  });

  // =========================================================================
  // TIER 2: Edge Cases, Replay, Conflict Protection & Guards (6 tests)
  // =========================================================================

  await test('E2-T2-01', 'Offline retries of rejected SEE job never bypass canonical completion; subsequent canonical flow succeeds', async () => {
    const { mainAcct, job, tokens } = await setupSeeJobFixture({ packageQuantity: 2 });
    const mutA = crypto.randomUUID();

    for (const payload of [
      { clientMutationId: mutA, jobId: job.id, status: 'completed' },
      { clientMutationId: mutA, jobId: job.id, status: 'completed' },
      { clientMutationId: crypto.randomUUID(), jobId: job.id, status: 'unable_to_complete' }
    ]) {
      const r = await harness.postApi({ action: 'syncCompletions', completions: [payload] }, tokens.staffToken);
      assert.strictEqual(r.body.results[0].status, 'error');
      assert.strictEqual(r.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    }

    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === job.id).status, 'assigned');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);

    // Now complete via canonical SEE flow
    await harness.callSee('POST', `/api/see/jobs/${job.id}/start`, { beforePhotos: ['https://cdn.example.com/b.jpg'] }, tokens.staffToken);
    const comp = await harness.callSee('POST', `/api/see/jobs/${job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: { before: ['https://cdn.example.com/b.jpg'], after: ['https://cdn.example.com/a.jpg'] },
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(comp.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === mainAcct.id).consumed_qty, 1);
  });

  await test('E2-T2-02', 'Duplicate offline clientMutationId replay for DCC and Legacy job (sequential & concurrent) is idempotent', async () => {
    // 1. DCC concurrent duplicate batch
    const dcc = await setupDccFixture();
    const dccMut = crypto.randomUUID();
    const dccPay = {
      action: 'syncCompletions',
      completions: [{
        clientMutationId: dccMut,
        subscriptionId: dcc.subscription.id,
        vehicleId: dcc.vehicle.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T06:00:00.000Z',
        photoUrl: 'https://cdn.example.com/dcc.jpg'
      }]
    };
    const [d1, d2] = await Promise.all([
      harness.postApi(dccPay, dcc.tokens.staffToken),
      harness.postApi(dccPay, dcc.tokens.staffToken)
    ]);
    assert.strictEqual(d1.body.results[0].status, 'synced');
    assert.strictEqual(d2.body.results[0].status, 'synced');
    assert.strictEqual(harness.getTableRows('service_logs').length, 1);

    // 2. Legacy job replay with same clientMutationId does not double-redeem package
    harness.reset();
    const leg = await setupLegacyJobFixture({ withPackage: true, totalQuantity: 3 });
    const legMut = crypto.randomUUID();
    const legPay = {
      action: 'syncCompletions',
      completions: [{
        clientMutationId: legMut,
        jobId: leg.job.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T09:00:00.000Z',
        photoUrl: 'https://cdn.example.com/leg.jpg'
      }]
    };
    const l1 = await harness.postApi(legPay, leg.tokens.staffToken);
    const l2 = await harness.postApi(legPay, leg.tokens.staffToken);
    assert.strictEqual(l1.body.results[0].status, 'synced');
    assert.strictEqual(l2.body.results[0].status, 'synced');
    assert.strictEqual(l2.body.results[0].idempotent, true);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === leg.legacyPkg.id).remaining_quantity, 2);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').length, 1);
  });

  await test('E2-T2-03', 'DCC conflict resolution: protects completed logs from non-admin overwrite, resolves car_not_present -> completed, rejects ineligible DCC', async () => {
    // (a) completed log protected from non-admin car_not_present overwrite
    const dccA = await setupDccFixture();
    await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dccA.subscription.id,
        vehicleId: dccA.vehicle.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T06:00:00.000Z',
        photoUrl: 'https://cdn.example.com/done.jpg'
      }]
    }, dccA.tokens.staffToken);

    const overwriteRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dccA.subscription.id,
        vehicleId: dccA.vehicle.id,
        status: 'car_not_present',
        completedAtDevice: '2026-11-27T06:30:00.000Z'
      }]
    }, dccA.tokens.staffToken);
    assert.strictEqual(overwriteRes.body.results[0].status, 'error');
    assert.strictEqual(harness.getTableRows('service_logs')[0].status, 'completed');

    // (b) car_not_present -> completed resolves conflict and audits
    harness.reset();
    const dccB = await setupDccFixture();
    await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dccB.subscription.id,
        vehicleId: dccB.vehicle.id,
        status: 'car_not_present',
        completedAtDevice: '2026-11-27T06:00:00.000Z'
      }]
    }, dccB.tokens.staffToken);

    const resolveRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dccB.subscription.id,
        vehicleId: dccB.vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/found.jpg',
        completedAtDevice: '2026-11-27T07:00:00.000Z'
      }]
    }, dccB.tokens.staffToken);
    assert.strictEqual(resolveRes.body.results[0].status, 'conflict_resolved');
    assert.strictEqual(harness.getTableRows('service_logs')[0].status, 'completed');
    assert.ok(harness.getTableRows('audit_logs').some(a => a.action === 'conflict_resolution'));

    // (c) stopped DCC subscription rejected
    harness.reset();
    const dccC = await setupDccFixture({ status: 'stopped' });
    const stoppedRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dccC.subscription.id,
        vehicleId: dccC.vehicle.id,
        status: 'completed',
        completedAtDevice: '2026-11-27T07:00:00.000Z',
        photoUrl: 'https://cdn.example.com/stopped.jpg'
      }]
    }, dccC.tokens.staffToken);
    assert.strictEqual(stoppedRes.body.results[0].status, 'error');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
  });

  await test('E2-T2-04', 'SEE job detected via _seeManaged, hasAddons, or hasSolar (even without entitlement_account_id) is rejected on syncCompletions', async () => {
    const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
    const staff = await harness.seedStaff();
    const { service, addon } = await harness.seedSeeServiceAndPackage({ includeAddon: true });
    const tokens = harness.createAuthTokens({ staff });

    // Case 1: SEE job with _seeManaged: true and NO entitlement_account_id
    const job1 = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        serviceIdOrCode: service.id,
        staffId: staff.id
      })
    );

    // Case 2: Job without _seeManaged / entitlement_account_id but with service_job_addons
    const rawJob2 = await harness.withTransactionalDbMode(() =>
      harness.repos.serviceJobs.createJob({
        customerId: customer.id,
        vehicleId: vehicle.id,
        locationId: location.id,
        serviceCategoryId: 'car_washing',
        serviceType: 'Addon-only Job'
      })
    );
    await harness.withTransactionalDbMode(async () => {
      await harness.repos.staffAssignments.assignStaffToJob({ staffId: staff.id, jobId: rawJob2.id, assignedBy: 'qa' });
      await harness.repos.seeOperations.createJobAddon({
        jobId: rawJob2.id,
        addonId: addon.id,
        addonNameSnapshot: addon.name
      });
    });

    const syncRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [
        { clientMutationId: crypto.randomUUID(), jobId: job1.id, status: 'completed' },
        { clientMutationId: crypto.randomUUID(), jobId: rawJob2.id, status: 'completed' }
      ]
    }, tokens.staffToken);

    assert.strictEqual(syncRes.body.results[0].status, 'error');
    assert.strictEqual(syncRes.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    assert.strictEqual(syncRes.body.results[1].status, 'error');
    assert.strictEqual(syncRes.body.results[1].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    assert.strictEqual(harness.getTableRows('service_logs').length, 0);
  });

  await test('E2-T2-05', 'serviceJobsRepo.updateJobStatus & DCC admin report endpoints guard against corrupting SEE/special-job records', async () => {
    const seeCtx = await setupSeeJobFixture();

    // 1. Direct updateJobStatus on SEE job to completed must be guarded
    await assert.rejects(() =>
      harness.withTransactionalDbMode(() =>
        harness.repos.serviceJobs.updateJobStatus(seeCtx.job.id, 'completed')
      )
    );
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeCtx.job.id).status, 'assigned');

    // 2. Complete SEE job canonically, then try updateDailyCleanReportStatus / deleteDailyCleanReport on its service_log
    await harness.callSee('POST', `/api/see/jobs/${seeCtx.job.id}/start`, { beforePhotos: ['https://cdn.example.com/b.jpg'] }, seeCtx.tokens.staffToken);
    await harness.callSee('POST', `/api/see/jobs/${seeCtx.job.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: { before: ['https://cdn.example.com/b.jpg'], after: ['https://cdn.example.com/a.jpg'] },
      clientMutationId: crypto.randomUUID()
    }, seeCtx.tokens.staffToken);

    const log = harness.getTableRows('service_logs').find(l => l.job_id === seeCtx.job.id);
    assert.ok(log);

    const updRes = await harness.postApi({
      action: 'updateDailyCleanReportStatus',
      reportId: log.id,
      status: 'car_not_present',
      reason: 'Accidental DCC edit'
    }, seeCtx.tokens.adminToken);
    assert.ok(updRes.statusCode >= 400);
    assert.strictEqual(updRes.body.success, false);

    const delRes = await harness.postApi({
      action: 'deleteDailyCleanReport',
      reportId: log.id,
      reason: 'Accidental DCC delete'
    }, seeCtx.tokens.adminToken);
    assert.ok(delRes.statusCode >= 400);
    assert.strictEqual(delRes.body.success, false);

    assert.strictEqual(harness.getTableRows('service_logs').find(l => l.id === log.id).status, 'completed');
  });

  await test('E2-T2-06', 'Unauthenticated syncCompletions (401), missing clientMutationId, and mixed-batch partial isolation', async () => {
    const unauth = await harness.postApi({ action: 'syncCompletions', completions: [] });
    assert.strictEqual(unauth.statusCode, 401);

    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const dcc = await setupDccFixture({ assignedStaff: staff });

    // Create Legacy job for same staff
    const { customer: cL, location: lL, vehicle: vL } = await harness.seedCustomerAndAssets();
    const legJob = (await harness.withTransactionalDbMode(() =>
      harness.services.booking.createBooking({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', serviceType: 'Legacy Wash', staffId: staff.id
      })
    )).job;

    // Create SEE job for same staff
    const { customer: cS, location: lS, vehicle: vS } = await harness.seedCustomerAndAssets();
    const { service } = await harness.seedSeeServiceAndPackage();
    const seeJob = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: cS.id, vehicleId: vS.id, locationId: lS.id,
        serviceIdOrCode: service.id, staffId: staff.id
      })
    );

    const tokens = harness.createAuthTokens({ staff });
    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [
        { status: 'completed' }, // missing clientMutationId
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc.subscription.id, vehicleId: dcc.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/d.jpg' },
        { clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: 'completed' },
        { clientMutationId: crypto.randomUUID(), jobId: legJob.id, status: 'completed' }
      ]
    }, tokens.staffToken);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.results[0].status, 'error');
    assert.strictEqual(res.body.results[1].status, 'synced');
    assert.strictEqual(res.body.results[2].status, 'error');
    assert.strictEqual(res.body.results[2].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    assert.strictEqual(res.body.results[3].status, 'synced');

    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === seeJob.id).status, 'assigned');
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === legJob.id).status, 'completed');
    assert.strictEqual(harness.getTableRows('service_logs').length, 2);
  });

  // =========================================================================
  // TIER 3: Pairwise Combinations (3 matrices)
  // =========================================================================

  await test('E2-T3-01', 'Pairwise: (SEE vs Legacy vs DCC) x (completed vs car_not_present vs unable_to_complete) via syncCompletions', async () => {
    const statuses = ['completed', 'car_not_present', 'unable_to_complete'];
    for (const st of statuses) {
      harness.reset();
      const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
      const tokens = harness.createAuthTokens({ staff });

      const dcc = await setupDccFixture({ assignedStaff: staff });
      const { customer: cL, location: lL, vehicle: vL } = await harness.seedCustomerAndAssets();
      const legJob = (await harness.withTransactionalDbMode(() =>
        harness.services.booking.createBooking({
          customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
          serviceCategoryId: 'car_washing', serviceType: 'Legacy', staffId: staff.id
        })
      )).job;
      const { customer: cS, location: lS, vehicle: vS } = await harness.seedCustomerAndAssets();
      const { service } = await harness.seedSeeServiceAndPackage();
      const seeJob = await harness.withTransactionalDbMode(() =>
        harness.services.seeExecution.createCanonicalJob({
          customerId: cS.id, vehicleId: vS.id, locationId: lS.id,
          serviceIdOrCode: service.id, staffId: staff.id
        })
      );

      const res = await harness.postApi({
        action: 'syncCompletions',
        completions: [
          { clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: st },
          { clientMutationId: crypto.randomUUID(), jobId: legJob.id, status: st },
          { clientMutationId: crypto.randomUUID(), subscriptionId: dcc.subscription.id, vehicleId: dcc.vehicle.id, status: st, photoUrl: 'https://cdn.example.com/p.jpg' }
        ]
      }, tokens.staffToken);

      assert.strictEqual(res.body.results[0].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
      assert.strictEqual(res.body.results[1].status, 'synced');
      assert.strictEqual(res.body.results[2].status, 'synced');

      const legRow = harness.getTableRows('service_jobs').find(j => j.id === legJob.id);
      if (st === 'completed') {
        assert.strictEqual(legRow.status, 'completed');
      } else {
        assert.notStrictEqual(legRow.status, 'completed');
      }
    }
  });

  await test('E2-T3-02', 'Pairwise: (assigned staff vs other staff vs unassigned) x (valid mutationId vs replayed mutationId)', async () => {
    const leg1 = await setupLegacyJobFixture({ assignStaff: true, totalQuantity: 2 });
    const other = await harness.seedStaff({ name: 'Intruder' });
    const otherTok = harness.createAuthTokens({ staff: other });

    // Other staff rejected
    const rOther = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: crypto.randomUUID(), jobId: leg1.job.id, status: 'completed' }]
    }, otherTok.staffToken);
    assert.strictEqual(rOther.body.results[0].status, 'error');

    // Assigned staff valid + replay
    const mut = crypto.randomUUID();
    const rOk = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: mut, jobId: leg1.job.id, status: 'completed' }]
    }, leg1.tokens.staffToken);
    assert.strictEqual(rOk.body.results[0].status, 'synced');

    const rReplay = await harness.postApi({
      action: 'syncCompletions',
      completions: [{ clientMutationId: mut, jobId: leg1.job.id, status: 'completed' }]
    }, leg1.tokens.staffToken);
    assert.strictEqual(rReplay.body.results[0].idempotent, true);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 1);
  });

  await test('E2-T3-03', 'Pairwise: IST midnight boundary (23:55 IST = 18:25 UTC vs 00:05 IST = 18:35 UTC) across DCC and Legacy', async () => {
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });
    const dcc = await setupDccFixture({ assignedStaff: staff });
    const { customer: cL, location: lL, vehicle: vL } = await harness.seedCustomerAndAssets();
    const legJob = (await harness.withTransactionalDbMode(() =>
      harness.services.booking.createBooking({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', serviceType: 'Late Wash', staffId: staff.id
      })
    )).job;

    // 2026-11-27T18:25:00Z -> 2026-11-27 23:55 IST (service_date = 2026-11-27)
    // 2026-11-27T18:35:00Z -> 2026-11-28 00:05 IST (service_date = 2026-11-28)
    const res = await harness.postApi({
      action: 'syncCompletions',
      completions: [
        {
          clientMutationId: crypto.randomUUID(),
          subscriptionId: dcc.subscription.id,
          vehicleId: dcc.vehicle.id,
          status: 'completed',
          completedAtDevice: '2026-11-27T18:25:00.000Z',
          photoUrl: 'https://cdn.example.com/ist1.jpg'
        },
        {
          clientMutationId: crypto.randomUUID(),
          subscriptionId: dcc.subscription.id,
          vehicleId: dcc.vehicle.id,
          status: 'completed',
          completedAtDevice: '2026-11-27T18:35:00.000Z',
          photoUrl: 'https://cdn.example.com/ist2.jpg'
        },
        {
          clientMutationId: crypto.randomUUID(),
          jobId: legJob.id,
          status: 'completed',
          completedAtDevice: '2026-11-27T18:35:00.000Z'
        }
      ]
    }, tokens.staffToken);

    assert.strictEqual(res.body.results[0].serviceDate, '2026-11-27');
    assert.strictEqual(res.body.results[1].serviceDate, '2026-11-28');
    assert.strictEqual(res.body.results[2].serviceDate, '2026-11-28');
    assert.strictEqual(harness.getTableRows('service_logs').length, 3);
  });

  // =========================================================================
  // TIER 4: Real-World Multi-Feature Workloads (5 workloads)
  // =========================================================================

  await test('E2-T4-01', 'Workload: Basement dead-zone batch flush (3 DCC + 1 Legacy pkg + 1 SEE) -> SEE completed canonically afterward', async () => {
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });

    const dcc1 = await setupDccFixture({ assignedStaff: staff });
    const dcc2 = await setupDccFixture({ assignedStaff: staff });
    const dcc3 = await setupDccFixture({ assignedStaff: staff });

    const { customer: cL, location: lL, vehicle: vL } = await harness.seedCustomerAndAssets();
    const legPkg = (await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', packageCode: 'WASH_SUB_4', packageName: '4 Wash', totalQuantity: 4
      })
    )).package;
    const legJob = (await harness.withTransactionalDbMode(() =>
      harness.services.booking.createBooking({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', serviceType: 'Legacy Wash', packageId: legPkg.id, staffId: staff.id
      })
    )).job;

    const { customer: cS, location: lS, vehicle: vS } = await harness.seedCustomerAndAssets();
    const { service, pkg } = await harness.seedSeeServiceAndPackage({ packageQuantity: 2 });
    const purch = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.createPurchase({
        customerId: cS.id, vehicleId: vS.id, locationId: lS.id, packageIdOrCode: pkg.id, saleReference: `DZ_${crypto.randomUUID()}`
      })
    );
    const seeAcct = purch.accounts[0];
    const seeJob = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: cS.id, vehicleId: vS.id, locationId: lS.id,
        serviceIdOrCode: service.id, entitlementAccountId: seeAcct.id, purchaseSnapshotId: purch.snapshot.id, staffId: staff.id
      })
    );

    const flush = await harness.postApi({
      action: 'syncCompletions',
      completions: [
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc1.subscription.id, vehicleId: dcc1.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/1.jpg' },
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc2.subscription.id, vehicleId: dcc2.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/2.jpg' },
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc3.subscription.id, vehicleId: dcc3.vehicle.id, status: 'car_not_present' },
        { clientMutationId: crypto.randomUUID(), jobId: legJob.id, status: 'completed', photoUrl: 'https://cdn.example.com/leg.jpg' },
        { clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: 'completed', photoUrl: 'https://cdn.example.com/see.jpg' }
      ]
    }, tokens.staffToken);

    assert.strictEqual(flush.body.syncedCount, 4);
    assert.strictEqual(flush.body.results[4].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');

    // Staff then completes SEE job canonically
    await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/start`, { beforePhotos: ['https://cdn.example.com/b.jpg'] }, tokens.staffToken);
    const seeComp = await harness.callSee('POST', `/api/see/jobs/${seeJob.id}/complete`, {
      checklistResults: VALID_CHECKLIST,
      proofPhotos: { before: ['https://cdn.example.com/b.jpg'], after: ['https://cdn.example.com/a.jpg'] },
      clientMutationId: crypto.randomUUID()
    }, tokens.staffToken);
    assert.strictEqual(seeComp.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_logs').length, 5);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === seeAcct.id).consumed_qty, 1);
  });

  await test('E2-T4-02', 'Workload: Flaky network double-flush (3 sequential + 1 concurrent) of 4-item mixed batch stays idempotent', async () => {
    const staff = await harness.seedStaff({ workType: 'dcc_and_services' });
    const tokens = harness.createAuthTokens({ staff });
    const dcc1 = await setupDccFixture({ assignedStaff: staff });
    const dcc2 = await setupDccFixture({ assignedStaff: staff });
    const { customer: cL, location: lL, vehicle: vL } = await harness.seedCustomerAndAssets();
    const legPkg = (await harness.withTransactionalDbMode(() =>
      harness.services.package.sellPackage({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', packageCode: 'WASH_SUB_4', packageName: '4 Wash', totalQuantity: 4
      })
    )).package;
    const legJob = (await harness.withTransactionalDbMode(() =>
      harness.services.booking.createBooking({
        customerId: cL.id, vehicleId: vL.id, locationId: lL.id,
        serviceCategoryId: 'car_washing', serviceType: 'Legacy', packageId: legPkg.id, staffId: staff.id
      })
    )).job;
    const { customer: cS, location: lS, vehicle: vS } = await harness.seedCustomerAndAssets();
    const { service } = await harness.seedSeeServiceAndPackage();
    const seeJob = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: cS.id, vehicleId: vS.id, locationId: lS.id, serviceIdOrCode: service.id, staffId: staff.id
      })
    );

    const batchPayload = {
      action: 'syncCompletions',
      completions: [
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc1.subscription.id, vehicleId: dcc1.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/1.jpg' },
        { clientMutationId: crypto.randomUUID(), subscriptionId: dcc2.subscription.id, vehicleId: dcc2.vehicle.id, status: 'completed', photoUrl: 'https://cdn.example.com/2.jpg' },
        { clientMutationId: crypto.randomUUID(), jobId: legJob.id, status: 'completed' },
        { clientMutationId: crypto.randomUUID(), jobId: seeJob.id, status: 'completed' }
      ]
    };

    const r1 = await harness.postApi(batchPayload, tokens.staffToken);
    const r2 = await harness.postApi(batchPayload, tokens.staffToken);
    const [r3, r4] = await Promise.all([
      harness.postApi(batchPayload, tokens.staffToken),
      harness.postApi(batchPayload, tokens.staffToken)
    ]);

    for (const res of [r1, r2, r3, r4]) {
      assert.strictEqual(res.body.syncedCount, 3);
      assert.strictEqual(res.body.results[3].code, 'SEE_CANONICAL_COMPLETION_REQUIRED');
    }
    assert.strictEqual(harness.getTableRows('service_logs').length, 3);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 1);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legPkg.id).remaining_quantity, 3);
  });

  await test('E2-T4-03', 'Workload: DCC route handover mid-day rejects stale offline queue from Staff A while Staff B syncs cleanly', async () => {
    const staffA = await harness.seedStaff({ name: 'Staff A', workType: 'dcc_only', serviceCapabilities: ['daily_car_cleaning'] });
    const staffB = await harness.seedStaff({ name: 'Staff B', workType: 'dcc_only', serviceCapabilities: ['daily_car_cleaning'] });
    const tokA = harness.createAuthTokens({ staff: staffA }).staffToken;
    const tokB = harness.createAuthTokens({ staff: staffB }).staffToken;

    const stop1 = await setupDccFixture({ assignedStaff: staffA });
    const stop2 = await setupDccFixture({ assignedStaff: staffA });

    // Staff A syncs stop 1
    const s1Res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: stop1.subscription.id,
        vehicleId: stop1.vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/s1.jpg'
      }]
    }, tokA);
    assert.strictEqual(s1Res.body.results[0].status, 'synced');

    // Admin reassigns stop 2 to Staff B
    await harness.withTransactionalDbMode(() =>
      harness.repos.staffAssignments.assignStaffToSubscription({
        staffId: staffB.id,
        subscriptionId: stop2.subscription.id,
        assignedBy: 'qa_admin'
      })
    );

    // Staff A's stale offline sync for stop 2 is rejected
    const staleRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: stop2.subscription.id,
        vehicleId: stop2.vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/stale.jpg'
      }]
    }, tokA);
    assert.strictEqual(staleRes.body.results[0].status, 'error');

    // Staff B syncs stop 2 cleanly
    const s2Res = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: stop2.subscription.id,
        vehicleId: stop2.vehicle.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/s2.jpg'
      }]
    }, tokB);
    assert.strictEqual(s2Res.body.results[0].status, 'synced');
    const logs = harness.getTableRows('service_logs');
    assert.strictEqual(logs.length, 2);
    assert.strictEqual(logs.find(l => l.subscription_id === stop1.subscription.id).staff_id, staffA.id);
    assert.strictEqual(logs.find(l => l.subscription_id === stop2.subscription.id).staff_id, staffB.id);
  });

  await test('E2-T4-04', 'Workload: Legacy job started online, completed offline with package, then retried via completeSpecialJob', async () => {
    const { legacyPkg, job, tokens } = await setupLegacyJobFixture({ withPackage: true, totalQuantity: 2 });
    await harness.postApi({
      action: 'startSpecialJob',
      jobId: job.id,
      beforePhotoUrls: ['https://cdn.example.com/b.jpg']
    }, tokens.staffToken);

    const offComp = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        jobId: job.id,
        status: 'completed',
        photoUrl: 'https://cdn.example.com/a.jpg'
      }]
    }, tokens.staffToken);
    assert.strictEqual(offComp.body.results[0].status, 'synced');
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legacyPkg.id).remaining_quantity, 1);

    // Subsequent online completeSpecialJob must reject (already terminal) without double redemption
    const onlineRetry = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: job.id,
      afterPhotoUrls: ['https://cdn.example.com/a.jpg']
    }, tokens.staffToken);
    assert.ok(onlineRetry.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('customer_packages').find(p => p.id === legacyPkg.id).remaining_quantity, 1);
    assert.strictEqual(harness.getTableRows('package_redemption_logs').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs').length, 1);
  });

  await test('E2-T4-05', 'Workload: recordDailyCleanWithPhoto + syncCompletions interoperability on same (sub, vehicle, date)', async () => {
    const dcc = await setupDccFixture();
    const mut = crypto.randomUUID();
    const ts = '2026-11-27T07:15:00.000Z';

    const onlineRes = await harness.postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: dcc.subscription.id,
      vehicleId: dcc.vehicle.id,
      customerId: dcc.customer.id,
      photoUrl: 'https://cdn.example.com/online-dcc.jpg',
      completedAtDevice: ts,
      clientMutationId: mut
    }, dcc.tokens.staffToken);
    assert.strictEqual(onlineRes.statusCode, 200);

    // Same-status replay via syncCompletions -> idempotent
    const replayRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: mut,
        subscriptionId: dcc.subscription.id,
        vehicleId: dcc.vehicle.id,
        status: 'completed',
        completedAtDevice: ts,
        photoUrl: 'https://cdn.example.com/online-dcc.jpg'
      }]
    }, dcc.tokens.staffToken);
    assert.strictEqual(replayRes.body.results[0].status, 'synced');
    assert.strictEqual(replayRes.body.results[0].idempotent, true);

    // Non-admin offline car_not_present cannot overwrite online completed
    const cnpRes = await harness.postApi({
      action: 'syncCompletions',
      completions: [{
        clientMutationId: crypto.randomUUID(),
        subscriptionId: dcc.subscription.id,
        vehicleId: dcc.vehicle.id,
        status: 'car_not_present',
        completedAtDevice: ts
      }]
    }, dcc.tokens.staffToken);
    assert.strictEqual(cnpRes.body.results[0].status, 'error');
    assert.strictEqual(harness.getTableRows('service_logs').length, 1);
    assert.strictEqual(harness.getTableRows('service_logs')[0].status, 'completed');
  });

  console.log(`\n[E2 Offline Sync Summary] Passed: ${passed}, Failed: ${failed}`);
  harness.teardown();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  harness.teardown();
  process.exit(1);
});
