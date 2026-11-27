/**
 * =========================================================================
 * P0 E2E QA Suite 3: Checklist Validation by Item Identity (E3)
 * Requirements: ORIGINAL_REQUEST.md R3, R5 | PROJECT.md F5, F9
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

const VALID_PROOF = {
  before: ['https://cdn.example.com/b.jpg'],
  after: ['https://cdn.example.com/a.jpg']
};

const DEFAULT_CHECKLIST = [
  { id: 'exterior_clean', key: 'exterior_clean', label: 'Exterior Clean', required: true },
  { id: 'glass_clean', key: 'glass_clean', label: 'Glass Clean', required: true },
  { id: 'wheel_clean', key: 'wheel_clean', label: 'Wheel Clean', required: true }
];

async function setupChecklistJob({
  checklistRequirements = DEFAULT_CHECKLIST,
  photoRequirements = { before_min: 1, after_min: 1, required: true },
  categoryId = 'car_washing',
  includeAddon = false,
  addonOptional = false
} = {}) {
  const { customer, location, vehicle } = await harness.seedCustomerAndAssets();
  const staff = await harness.seedStaff();
  const { service, addon, pkg } = await harness.seedSeeServiceAndPackage({
    categoryId,
    checklistRequirements,
    photoRequirements,
    packageQuantity: 3,
    includeAddon,
    addonOptional
  });
  const tokens = harness.createAuthTokens({ staff });

  const purch = await harness.withTransactionalDbMode(() =>
    harness.services.seeEntitlement.createPurchase({
      customerId: customer.id,
      vehicleId: categoryId === 'solar_cleaning' ? null : vehicle.id,
      locationId: location.id,
      packageIdOrCode: pkg.id,
      saleReference: `CHK_${crypto.randomUUID()}`
    })
  );
  const mainAcct = purch.accounts.find(a => a.service_id === service.id);

  const job = await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.createCanonicalJob({
      customerId: customer.id,
      vehicleId: categoryId === 'solar_cleaning' ? null : vehicle.id,
      locationId: location.id,
      serviceIdOrCode: service.id,
      entitlementAccountId: mainAcct.id,
      purchaseSnapshotId: purch.snapshot.id,
      staffId: staff.id,
      addonIds: addon ? [addon.id] : [],
      actor: 'qa_admin'
    })
  );

  await harness.withTransactionalDbMode(() =>
    harness.services.seeExecution.startExecution(job.id, staff.id, {
      beforePhotos: VALID_PROOF.before
    })
  );

  return { customer, location, vehicle, staff, service, addon, pkg, mainAcct, job, tokens };
}

function assertCleanRejection(res, ctx) {
  assert.ok(res.statusCode >= 400 && res.statusCode < 500, `Expected 4xx rejection, got ${res.statusCode}`);
  assert.strictEqual(res.body.success, false);
  const jobRow = harness.getTableRows('service_jobs').find(j => j.id === ctx.job.id);
  assert.strictEqual(jobRow.status, 'in_progress', 'Rejected checklist must leave job in_progress');
  assert.strictEqual(harness.getTableRows('service_executions').filter(e => e.job_id === ctx.job.id && e.outcome === 'completed').length, 0);
  assert.strictEqual(harness.getTableRows('service_logs').filter(l => l.job_id === ctx.job.id).length, 0);
  assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 0);
}

async function run() {
  // =========================================================================
  // TIER 1: Core Checklist Identity Invariants (6 tests)
  // =========================================================================

  await test('E3-T1-01', 'All required server-authoritative checklist item IDs supplied via /api/see/complete and completeSpecialJob succeed', async () => {
    const c1 = await setupChecklistJob();
    const r1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { itemId: 'glass_clean', completed: true },
        { key: 'wheel_clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c1.tokens.staffToken);
    assert.strictEqual(r1.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c1.job.id).status, 'completed');
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === c1.mainAcct.id).consumed_qty, 1);

    const c2 = await setupChecklistJob();
    const r2 = await harness.postApi({
      action: 'completeSpecialJob',
      jobId: c2.job.id,
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { id: 'glass_clean', completed: true },
        { id: 'wheel_clean', completed: true }
      ],
      afterPhotoUrls: VALID_PROOF.after,
      clientMutationId: crypto.randomUUID()
    }, c2.tokens.staffToken);
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(harness.getTableRows('service_jobs').find(j => j.id === c2.job.id).status, 'completed');
  });

  await test('E3-T1-02', 'Missing required checklist item ID (2 of 3 submitted) is rejected with zero state mutation', async () => {
    const ctx = await setupChecklistJob();
    const res = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { id: 'glass_clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(res, ctx);
  });

  await test('E3-T1-03', 'Duplicate item ID substitution matching exact item count (3/3) is rejected', async () => {
    const ctx = await setupChecklistJob();
    const res = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { id: 'exterior_clean', completed: true },
        { id: 'wheel_clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(res, ctx);
  });

  await test('E3-T1-04', 'Unknown checklist item ID matching exact item count (3/3) is rejected', async () => {
    const ctx = await setupChecklistJob();
    const res = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { id: 'glass_clean', completed: true },
        { id: 'fake_unknown_item', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(res, ctx);
  });

  await test('E3-T1-05', 'Wrong-service checklist item ID (valid ID from Service B on Service A job with same count) is rejected', async () => {
    const svcA = await setupChecklistJob({
      checklistRequirements: [
        { id: 'wash_foam', key: 'wash_foam', label: 'Foam Wash', required: true },
        { id: 'wash_rinse', key: 'wash_rinse', label: 'Rinse', required: true }
      ]
    });

    // Seed Service B in same DB
    await harness.seedSeeServiceAndPackage({
      categoryId: 'solar_cleaning',
      checklistRequirements: [
        { id: 'solar_brush', key: 'solar_brush', label: 'Solar Brush', required: true },
        { id: 'solar_meter', key: 'solar_meter', label: 'Meter Check', required: true }
      ]
    });

    const res = await harness.callSee('POST', `/api/see/jobs/${svcA.job.id}/complete`, {
      checklistResults: [
        { id: 'wash_foam', completed: true },
        { id: 'solar_brush', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, svcA.tokens.staffToken);
    assertCleanRejection(res, svcA);
  });

  await test('E3-T1-06', 'Optional checklist items (required: false) succeed when omitted, completed: false, or completed: true', async () => {
    const mixedChecklist = [
      { id: 'req_wash', key: 'req_wash', label: 'Wash', required: true },
      { id: 'opt_scent', key: 'opt_scent', label: 'Air Freshener', required: false }
    ];

    // (a) Omitted optional item
    const c1 = await setupChecklistJob({ checklistRequirements: mixedChecklist });
    const r1 = await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, {
      checklistResults: [{ id: 'req_wash', completed: true }],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c1.tokens.staffToken);
    assert.strictEqual(r1.statusCode, 200);

    // (b) Submitted with completed: false
    harness.reset();
    const c2 = await setupChecklistJob({ checklistRequirements: mixedChecklist });
    const r2 = await harness.callSee('POST', `/api/see/jobs/${c2.job.id}/complete`, {
      checklistResults: [
        { id: 'req_wash', completed: true },
        { id: 'opt_scent', completed: false }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c2.tokens.staffToken);
    assert.strictEqual(r2.statusCode, 200);

    // (c) Submitted with completed: true
    harness.reset();
    const c3 = await setupChecklistJob({ checklistRequirements: mixedChecklist });
    const r3 = await harness.callSee('POST', `/api/see/jobs/${c3.job.id}/complete`, {
      checklistResults: [
        { id: 'req_wash', completed: true },
        { id: 'opt_scent', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, c3.tokens.staffToken);
    assert.strictEqual(r3.statusCode, 200);
  });

  // =========================================================================
  // TIER 2: Edge Cases & Adversarial Payloads (6 tests)
  // =========================================================================

  await test('E3-T2-01', 'Client-supplied label-only submission and wrong-ID-with-matching-label are rejected', async () => {
    const ctx = await setupChecklistJob();

    // Label-only without id/itemId/key
    const rLabelOnly = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { label: 'Exterior Clean', item: 'Exterior Clean', completed: true },
        { label: 'Glass Clean', item: 'Glass Clean', completed: true },
        { label: 'Wheel Clean', item: 'Wheel Clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(rLabelOnly, ctx);

    // Wrong ID paired with valid label
    const rWrongIdWithLabel = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', label: 'Exterior Clean', completed: true },
        { id: 'glass_clean', label: 'Glass Clean', completed: true },
        { id: 'spoofed_wheel', label: 'Wheel Clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(rWrongIdWithLabel, ctx);
  });

  await test('E3-T2-02', 'Required item submitted with completed: false or checked: false is rejected', async () => {
    const ctx = await setupChecklistJob();

    const r1 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', completed: true },
        { id: 'glass_clean', completed: false },
        { id: 'wheel_clean', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(r1, ctx);

    const r2 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'exterior_clean', checked: true },
        { id: 'glass_clean', checked: true },
        { id: 'wheel_clean', checked: false }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(r2, ctx);
  });

  await test('E3-T2-03', 'Duplicate optional item ID is rejected even when all required IDs are valid', async () => {
    const ctx = await setupChecklistJob({
      checklistRequirements: [
        { id: 'req_1', key: 'req_1', label: 'Required 1', required: true },
        { id: 'opt_1', key: 'opt_1', label: 'Optional 1', required: false }
      ]
    });

    const res = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: 'req_1', completed: true },
        { id: 'opt_1', completed: true },
        { id: 'opt_1', completed: true }
      ],
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(res, ctx);
  });

  await test('E3-T2-04', 'Malformed checklist payloads (non-array, null elements, primitives, empty id) fail cleanly with 4xx (no 500)', async () => {
    const ctx = await setupChecklistJob();
    const malformedPayloads = [
      null,
      {},
      'exterior_clean,glass_clean,wheel_clean',
      [null, { id: 'glass_clean', completed: true }, { id: 'wheel_clean', completed: true }],
      ['exterior_clean', 'glass_clean', 'wheel_clean'],
      [123, 456, 789],
      [{ id: '', completed: true }, { id: 'glass_clean', completed: true }, { id: 'wheel_clean', completed: true }],
      [{ id: 'exterior_clean' }, { id: 'glass_clean', completed: true }, { id: 'wheel_clean', completed: true }] // missing boolean completed
    ];

    for (const bad of malformedPayloads) {
      const res = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
        checklistResults: bad,
        proofPhotos: VALID_PROOF,
        clientMutationId: crypto.randomUUID()
      }, ctx.tokens.staffToken);
      assertCleanRejection(res, ctx);
    }
  });

  await test('E3-T2-05', 'Legacy string-array service checklist normalizes to deterministic IDs exposed on staff-contract', async () => {
    const ctx = await setupChecklistJob({
      checklistRequirements: ['Pre-rinse', 'Foam Wash', 'Dry Wipe']
    });

    const contractRes = await harness.callSee('GET', `/api/see/jobs/${ctx.job.id}/staff-contract`, null, ctx.tokens.staffToken);
    assert.strictEqual(contractRes.statusCode, 200);
    const reqItems = contractRes.body.job.checklistRequirements;
    assert.strictEqual(reqItems.length, 3);
    for (const item of reqItems) {
      assert.ok(item.id && typeof item.id === 'string');
      assert.ok(item.label);
    }

    // Raw labels without IDs rejected
    const badRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: reqItems.map(i => ({ label: i.label, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(badRes, ctx);

    // Server-provided IDs succeed
    const goodRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: reqItems.map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assert.strictEqual(goodRes.statusCode, 200);
  });

  await test('E3-T2-06', 'authorizedException bypasses incomplete checklist ONLY for admin (stripped for staff)', async () => {
    const ctx = await setupChecklistJob();

    const staffRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [{ id: 'exterior_clean', completed: true }],
      proofPhotos: VALID_PROOF,
      authorizedException: { reason: 'Staff bypass attempt', approvalReference: 'NOPE' },
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assertCleanRejection(staffRes, ctx);

    const adminRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [{ id: 'exterior_clean', completed: true }],
      proofPhotos: VALID_PROOF,
      authorizedException: { reason: 'Customer hurried departure', approvalReference: 'ADM-101' },
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.adminToken);
    assert.strictEqual(adminRes.statusCode, 200);
    assert.strictEqual(adminRes.body.execution.outcome, 'partial_exception');
  });

  // =========================================================================
  // TIER 3: Pairwise Combinations (3 matrices)
  // =========================================================================

  await test('E3-T3-01', 'Pairwise: (required-only vs mixed vs empty) x (valid IDs vs missing required vs duplicate ID vs wrong-service ID)', async () => {
    const configs = [
      { name: 'required-only', req: [{ id: 'a', label: 'A', required: true }, { id: 'b', label: 'B', required: true }] },
      { name: 'mixed', req: [{ id: 'a', label: 'A', required: true }, { id: 'opt', label: 'Opt', required: false }] },
      { name: 'empty', req: [] }
    ];

    for (const cfg of configs) {
      // Valid
      harness.reset();
      const cValid = await setupChecklistJob({ checklistRequirements: cfg.req });
      const validPayload = cfg.req.filter(i => i.required !== false).map(i => ({ id: i.id, completed: true }));
      const rValid = await harness.callSee('POST', `/api/see/jobs/${cValid.job.id}/complete`, {
        checklistResults: validPayload, proofPhotos: VALID_PROOF, clientMutationId: crypto.randomUUID()
      }, cValid.tokens.staffToken);
      assert.strictEqual(rValid.statusCode, 200, `${cfg.name} valid should succeed`);

      // Wrong-service ID (rejected in all 3 including empty!)
      harness.reset();
      const cWrong = await setupChecklistJob({ checklistRequirements: cfg.req });
      const wrongPayload = cfg.req.length === 0
        ? [{ id: 'other_svc_item', completed: true }]
        : [{ id: 'a', completed: true }, { id: 'other_svc_item', completed: true }];
      const rWrong = await harness.callSee('POST', `/api/see/jobs/${cWrong.job.id}/complete`, {
        checklistResults: wrongPayload, proofPhotos: VALID_PROOF, clientMutationId: crypto.randomUUID()
      }, cWrong.tokens.staffToken);
      assertCleanRejection(rWrong, cWrong);

      if (cfg.req.length > 0) {
        // Missing required
        harness.reset();
        const cMiss = await setupChecklistJob({ checklistRequirements: cfg.req });
        const rMiss = await harness.callSee('POST', `/api/see/jobs/${cMiss.job.id}/complete`, {
          checklistResults: [], proofPhotos: VALID_PROOF, clientMutationId: crypto.randomUUID()
        }, cMiss.tokens.staffToken);
        assertCleanRejection(rMiss, cMiss);

        // Duplicate ID
        harness.reset();
        const cDup = await setupChecklistJob({ checklistRequirements: cfg.req });
        const rDup = await harness.callSee('POST', `/api/see/jobs/${cDup.job.id}/complete`, {
          checklistResults: [{ id: 'a', completed: true }, { id: 'a', completed: true }],
          proofPhotos: VALID_PROOF, clientMutationId: crypto.randomUUID()
        }, cDup.tokens.staffToken);
        assertCleanRejection(rDup, cDup);
      }
    }
  });

  await test('E3-T3-02', 'Pairwise: (/api/see/complete vs completeSpecialJob vs seeExecutionService) x (label-only vs count-match-wrong-ID vs valid IDs)', async () => {
    const valid = DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true }));
    const labelOnly = DEFAULT_CHECKLIST.map(i => ({ label: i.label, completed: true }));
    const countWrong = [{ id: 'exterior_clean', completed: true }, { id: 'exterior_clean', completed: true }, { id: 'wheel_clean', completed: true }];

    // 1. /api/see/jobs/:id/complete
    const c1 = await setupChecklistJob();
    assertCleanRejection(await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, { checklistResults: labelOnly, proofPhotos: VALID_PROOF }, c1.tokens.staffToken), c1);
    assertCleanRejection(await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, { checklistResults: countWrong, proofPhotos: VALID_PROOF }, c1.tokens.staffToken), c1);
    assert.strictEqual((await harness.callSee('POST', `/api/see/jobs/${c1.job.id}/complete`, { checklistResults: valid, proofPhotos: VALID_PROOF }, c1.tokens.staffToken)).statusCode, 200);

    // 2. POST /api completeSpecialJob
    harness.reset();
    const c2 = await setupChecklistJob();
    assertCleanRejection(await harness.postApi({ action: 'completeSpecialJob', jobId: c2.job.id, checklistResults: labelOnly, afterPhotoUrls: VALID_PROOF.after }, c2.tokens.staffToken), c2);
    assertCleanRejection(await harness.postApi({ action: 'completeSpecialJob', jobId: c2.job.id, checklistResults: countWrong, afterPhotoUrls: VALID_PROOF.after }, c2.tokens.staffToken), c2);
    assert.strictEqual((await harness.postApi({ action: 'completeSpecialJob', jobId: c2.job.id, checklistResults: valid, afterPhotoUrls: VALID_PROOF.after }, c2.tokens.staffToken)).statusCode, 200);

    // 3. Direct seeExecutionService.completeExecution
    harness.reset();
    const c3 = await setupChecklistJob();
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.seeExecution.completeExecution(c3.job.id, { staffId: c3.staff.id, checklistResults: labelOnly, proofPhotos: VALID_PROOF })));
    await assert.rejects(() => harness.withTransactionalDbMode(() => harness.services.seeExecution.completeExecution(c3.job.id, { staffId: c3.staff.id, checklistResults: countWrong, proofPhotos: VALID_PROOF })));
    const ok3 = await harness.withTransactionalDbMode(() => harness.services.seeExecution.completeExecution(c3.job.id, { staffId: c3.staff.id, checklistResults: valid, proofPhotos: VALID_PROOF }));
    assert.strictEqual(ok3.outcome, 'completed');
  });

  await test('E3-T3-03', 'Pairwise: (id vs itemId vs key) x (normalized object config vs legacy string-array config)', async () => {
    for (const field of ['id', 'itemId', 'key']) {
      harness.reset();
      const objCtx = await setupChecklistJob({ checklistRequirements: [{ id: 'step_one', key: 'step_one', label: 'Step One', required: true }] });
      const r1 = await harness.callSee('POST', `/api/see/jobs/${objCtx.job.id}/complete`, {
        checklistResults: [{ [field]: 'step_one', completed: true }],
        proofPhotos: VALID_PROOF
      }, objCtx.tokens.staffToken);
      assert.strictEqual(r1.statusCode, 200, `object config with ${field} must succeed`);

      harness.reset();
      const strCtx = await setupChecklistJob({ checklistRequirements: ['Step One'] });
      const r2 = await harness.callSee('POST', `/api/see/jobs/${strCtx.job.id}/complete`, {
        checklistResults: [{ [field]: 'step_one', completed: true }],
        proofPhotos: VALID_PROOF
      }, strCtx.tokens.staffToken);
      assert.strictEqual(r2.statusCode, 200, `string-array config with ${field} must succeed`);
    }
  });

  // =========================================================================
  // TIER 4: Real-World Multi-Feature Workloads (5 workloads)
  // =========================================================================

  await test('E3-T4-01', 'Workload: Staff fetches staff-contract -> tampered payload fails -> retries with contract IDs -> succeeds', async () => {
    const ctx = await setupChecklistJob({
      checklistRequirements: [
        { id: 'hood_polish', label: 'Hood Polish', required: true },
        { id: 'interior_wipe', label: 'Interior Wipe', required: true },
        { id: 'tyre_dress', label: 'Tyre Dressing', required: false }
      ]
    });

    const contract = await harness.callSee('GET', `/api/see/jobs/${ctx.job.id}/staff-contract`, null, ctx.tokens.staffToken);
    assert.strictEqual(contract.statusCode, 200);
    const items = contract.body.job.checklistRequirements;

    // Tampered count-matching payload (duplicates hood_polish)
    const tampered = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [
        { id: items[0].id, completed: true },
        { id: items[0].id, completed: true }
      ],
      proofPhotos: VALID_PROOF
    }, ctx.tokens.staffToken);
    assertCleanRejection(tampered, ctx);

    // Valid contract submission (omits optional tyre_dress)
    const valid = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: items.filter(i => i.required).map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assert.strictEqual(valid.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 1);
  });

  await test('E3-T4-02', 'Workload: Service versioning immutability (v1 job validates v1 checklist even after service updated to v2)', async () => {
    const v1Ctx = await setupChecklistJob({
      checklistRequirements: [
        { id: 'v1_a', label: 'V1 A', required: true },
        { id: 'v1_b', label: 'V1 B', required: true }
      ]
    });

    // Admin updates service to v2 adding v2_c
    const updRes = await harness.callSee('PATCH', `/api/see/services/${v1Ctx.service.id}`, {
      checklistRequirements: [
        { id: 'v1_a', label: 'V1 A', required: true },
        { id: 'v1_b', label: 'V1 B', required: true },
        { id: 'v2_c', label: 'V2 C', required: true }
      ]
    }, v1Ctx.tokens.adminToken);
    assert.strictEqual(updRes.statusCode, 200);

    // Create v2 job
    const job2 = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: v1Ctx.customer.id,
        vehicleId: v1Ctx.vehicle.id,
        locationId: v1Ctx.location.id,
        serviceIdOrCode: v1Ctx.service.id,
        entitlementAccountId: v1Ctx.mainAcct.id,
        staffId: v1Ctx.staff.id
      })
    );
    await harness.callSee('POST', `/api/see/jobs/${job2.id}/start`, { beforePhotos: VALID_PROOF.before }, v1Ctx.tokens.staffToken);

    // v1 job completes with [v1_a, v1_b]
    const comp1 = await harness.callSee('POST', `/api/see/jobs/${v1Ctx.job.id}/complete`, {
      checklistResults: [{ id: 'v1_a', completed: true }, { id: 'v1_b', completed: true }],
      proofPhotos: VALID_PROOF
    }, v1Ctx.tokens.staffToken);
    assert.strictEqual(comp1.statusCode, 200);

    // v2 job rejects [v1_a, v1_b] and requires v2_c
    const fail2 = await harness.callSee('POST', `/api/see/jobs/${job2.id}/complete`, {
      checklistResults: [{ id: 'v1_a', completed: true }, { id: 'v1_b', completed: true }],
      proofPhotos: VALID_PROOF
    }, v1Ctx.tokens.staffToken);
    assert.ok(fail2.statusCode >= 400);

    const comp2 = await harness.callSee('POST', `/api/see/jobs/${job2.id}/complete`, {
      checklistResults: [{ id: 'v1_a', completed: true }, { id: 'v1_b', completed: true }, { id: 'v2_c', completed: true }],
      proofPhotos: VALID_PROOF
    }, v1Ctx.tokens.staffToken);
    assert.strictEqual(comp2.statusCode, 200);
  });

  await test('E3-T4-03', 'Workload: Multi-service customer day (Solar + Car Wash) prevents cross-service checklist ID confusion', async () => {
    const wash = await setupChecklistJob({
      categoryId: 'car_washing',
      checklistRequirements: [
        { id: 'wash_1', label: 'Wash 1', required: true },
        { id: 'wash_2', label: 'Wash 2', required: true }
      ]
    });
    const { service: solarSvc, pkg: solarPkg } = await harness.seedSeeServiceAndPackage({
      categoryId: 'solar_cleaning',
      name: 'Solar Clean',
      checklistRequirements: [
        { id: 'solar_1', label: 'Solar 1', required: true },
        { id: 'solar_2', label: 'Solar 2', required: true }
      ]
    });
    const solarPurch = await harness.withTransactionalDbMode(() =>
      harness.services.seeEntitlement.createPurchase({
        customerId: wash.customer.id,
        locationId: wash.location.id,
        packageIdOrCode: solarPkg.id,
        saleReference: `SOL_${crypto.randomUUID()}`
      })
    );
    const solarAcct = solarPurch.accounts[0];
    const solarJob = await harness.withTransactionalDbMode(() =>
      harness.services.seeExecution.createCanonicalJob({
        customerId: wash.customer.id,
        locationId: wash.location.id,
        serviceIdOrCode: solarSvc.id,
        entitlementAccountId: solarAcct.id,
        staffId: wash.staff.id
      })
    );
    await harness.callSee('POST', `/api/see/jobs/${solarJob.id}/start`, { beforePhotos: VALID_PROOF.before }, wash.tokens.staffToken);

    // Staff accidentally sends Car Wash checklist IDs to Solar job -> rejected
    const wrongRes = await harness.callSee('POST', `/api/see/jobs/${solarJob.id}/complete`, {
      checklistResults: [{ id: 'wash_1', completed: true }, { id: 'wash_2', completed: true }],
      proofPhotos: VALID_PROOF
    }, wash.tokens.staffToken);
    assert.ok(wrongRes.statusCode >= 400);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === solarAcct.id).consumed_qty, 0);

    // Staff sends Solar IDs -> succeeds
    const okSolar = await harness.callSee('POST', `/api/see/jobs/${solarJob.id}/complete`, {
      checklistResults: [{ id: 'solar_1', completed: true }, { id: 'solar_2', completed: true }],
      proofPhotos: VALID_PROOF
    }, wash.tokens.staffToken);
    assert.strictEqual(okSolar.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === solarAcct.id).consumed_qty, 1);
  });

  await test('E3-T4-04', 'Workload: Multi-gate validation (checklist + photos + required addon) consumes entitlement exactly once at final valid call', async () => {
    const ctx = await setupChecklistJob({
      includeAddon: true,
      addonOptional: false,
      photoRequirements: { before_min: 1, after_min: 1, required: true }
    });

    // Gate 1: Fail on bad checklist
    const g1 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [{ id: 'exterior_clean', completed: true }, { id: 'exterior_clean', completed: true }, { id: 'wheel_clean', completed: true }],
      proofPhotos: VALID_PROOF
    }, ctx.tokens.staffToken);
    assertCleanRejection(g1, ctx);

    // Gate 2: Valid checklist but missing after photos
    const g2 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true })),
      proofPhotos: { before: VALID_PROOF.before, after: [] }
    }, ctx.tokens.staffToken);
    assertCleanRejection(g2, ctx);

    // Gate 3: Valid checklist + photos but pending required addon
    const g3 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF
    }, ctx.tokens.staffToken);
    assertCleanRejection(g3, ctx);

    // Complete addon then final valid completion
    const jobAddon = harness.getTableRows('service_job_addons').find(a => a.job_id === ctx.job.id);
    await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/addons/${jobAddon.id}/complete`, { status: 'completed' }, ctx.tokens.staffToken);

    const g4 = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: crypto.randomUUID()
    }, ctx.tokens.staffToken);
    assert.strictEqual(g4.statusCode, 200);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 1);
  });

  await test('E3-T4-05', 'Workload: Failed checklist with clientMutationId M1 never poisons M1 for subsequent valid submission & replay', async () => {
    const ctx = await setupChecklistJob();
    const mutM1 = crypto.randomUUID();

    const failRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: [{ id: 'exterior_clean', completed: true }],
      proofPhotos: VALID_PROOF,
      clientMutationId: mutM1
    }, ctx.tokens.staffToken);
    assertCleanRejection(failRes, ctx);

    const okRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: mutM1
    }, ctx.tokens.staffToken);
    assert.strictEqual(okRes.statusCode, 200);

    const replayRes = await harness.callSee('POST', `/api/see/jobs/${ctx.job.id}/complete`, {
      checklistResults: DEFAULT_CHECKLIST.map(i => ({ id: i.id, completed: true })),
      proofPhotos: VALID_PROOF,
      clientMutationId: mutM1
    }, ctx.tokens.staffToken);
    assert.strictEqual(replayRes.statusCode, 200);
    assert.strictEqual(replayRes.body.execution.idempotent, true);
    assert.strictEqual(harness.getTableRows('entitlement_accounts').find(a => a.id === ctx.mainAcct.id).consumed_qty, 1);
  });

  console.log(`\n[E3 Checklist Identity Summary] Passed: ${passed}, Failed: ${failed}`);
  harness.teardown();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  harness.teardown();
  process.exit(1);
});
