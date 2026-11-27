/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Comprehensive Backend Test Suite (Phases 1-16)
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeCatalogueService = require('../services/seeCatalogueService');
const seeFrequencyService = require('../services/seeFrequencyService');
const seeStaffCapabilityService = require('../services/seeStaffCapabilityService');
const seeEntitlementService = require('../services/seeEntitlementService');
const seeExecutionService = require('../services/seeExecutionService');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}\n   ${err.stack || err.message}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('CWP SEE-01 BACKEND INTEGRATION & UNIT TEST SUITE');
  console.log('================================================================');

  const suffix = Date.now();
  let testService, testAddon, testPkg, testCustomer, testLoc, testStaff, testInactiveStaff;

  try {
    // Seed isolated test customer, location, and staff
    testCustomer = await repos.customers.createCustomer({
      name: `SEE Test Customer ${suffix}`,
      phone: `98${String(suffix).slice(-8)}`,
      isActive: true
    });
    testLoc = await repos.serviceLocations.createLocation({
      customerId: testCustomer.id,
      locationName: 'Test Home',
      addressText: '123 SEE Test Lane',
      isPrimary: true
    });

    const stRes = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, allowed_cities, allowed_zones, max_daily_jobs)
       VALUES ($1, $2, $3, TRUE, 'services_only', '["car_washing","solar_cleaning"]'::jsonb, '["Jaipur"]'::jsonb, '["Zone-A"]'::jsonb, 1)
       RETURNING *`,
      [`SEESTF${String(suffix).slice(-4)}`, 'SEE Active Staff', `97${String(suffix).slice(-8)}`]
    );
    testStaff = stRes.rows[0];

    const stInactRes = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type)
       VALUES ($1, $2, $3, FALSE, 'dcc_only')
       RETURNING *`,
      [`SEEINACT${String(suffix).slice(-3)}`, 'SEE Inactive Staff', `96${String(suffix).slice(-8)}`]
    );
    testInactiveStaff = stInactRes.rows[0];

    // -------------------------------------------------------------------
    // 1. Catalogue Tests
    // -------------------------------------------------------------------
    await test('Catalogue: Service create, duplicate code prevention, edit, version increment, retire', async () => {
      const code = `TEST_SVC_${suffix}`;
      testService = await seeCatalogueService.createService({
        serviceCode: code,
        name: 'Test Ceramic Wash',
        serviceCategoryId: 'car_washing',
        serviceModel: 'visit_credit',
        tagline: 'Glossy shield',
        expectedDurationMinutes: 45,
        checklistRequirements: ['Rinse', 'Foam', 'Dry'],
        photoRequirements: { before_min: 1, after_min: 1, required: true },
        status: 'draft'
      }, 'test_admin');

      assert.strictEqual(testService.status, 'draft');
      assert.strictEqual(testService.version, 1);

      await assert.rejects(
        () => seeCatalogueService.createService({ serviceCode: code, name: 'Dup', serviceCategoryId: 'car_washing' }),
        /Duplicate serviceCode/
      );

      const activated = await seeCatalogueService.changeServiceStatus(testService.id, 'active', 'test_admin', 'Go live');
      assert.strictEqual(activated.status, 'active');
      assert.strictEqual(activated.version, 2);

      const detail = await seeCatalogueService.getServiceDetail(code);
      assert.strictEqual(detail.id, testService.id);

      const retired = await seeCatalogueService.changeServiceStatus(testService.id, 'retired', 'test_admin', 'Retire test');
      assert.strictEqual(retired.status, 'retired');

      // Re-activate for downstream tests
      testService = await seeCatalogueService.changeServiceStatus(testService.id, 'active', 'test_admin', 'Re-enable');
    });

    // -------------------------------------------------------------------
    // 2. Frequency Engine Tests
    // -------------------------------------------------------------------
    await test('Frequency: Every 15 days vs Twice per calendar month distinction + calendar boundary + blackouts', () => {
      const rolling15 = seeFrequencyService.generateOccurrences(
        { frequency_type: 'every_15_days', interval_value: 15, timezone: 'Asia/Kolkata' },
        { fromDate: '2026-01-01', toDate: '2026-02-15' }
      );
      const twiceMonth = seeFrequencyService.generateOccurrences(
        { frequency_type: 'twice_per_month', interval_value: 2, recurrence_config: { days: [1, 15] }, timezone: 'Asia/Kolkata' },
        { fromDate: '2026-01-01', toDate: '2026-02-15' }
      );

      assert.deepStrictEqual(rolling15.map(o => o.date), ['2026-01-01', '2026-01-16', '2026-01-31', '2026-02-15']);
      assert.deepStrictEqual(twiceMonth.map(o => o.date), ['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15']);

      // Monthly Jan 31 -> Feb 28 clamp
      const monthly = seeFrequencyService.generateOccurrences(
        { frequency_type: 'monthly', interval_value: 1 },
        { fromDate: '2026-01-31', toDate: '2026-03-31' }
      );
      assert.deepStrictEqual(monthly.map(o => o.date), ['2026-01-31', '2026-02-28', '2026-03-28']);

      // Holiday blackout reschedule
      const withHoliday = seeFrequencyService.generateOccurrences(
        { frequency_type: 'daily', missed_visit_policy: 'reschedule_next' },
        { fromDate: '2026-05-01', toDate: '2026-05-03', blackoutDates: ['2026-05-01'] }
      );
      assert.strictEqual(withHoliday[0].status, 'rescheduled');
      assert.strictEqual(withHoliday[0].date, '2026-05-02');
    });

    // -------------------------------------------------------------------
    // 3. Add-on & Marketing/Media Tests
    // -------------------------------------------------------------------
    await test('Add-on & Media: Add-on creation, execution modes, and 1:1 / 4:3 media validation', async () => {
      testAddon = await seeCatalogueService.createAddon({
        addonCode: `TEST_ADDON_${suffix}`,
        name: 'Test Engine Bay Wipe',
        defaultPrice: 199,
        executionMode: 'during_main_service',
        isOptional: false,
        applicableServiceIds: [testService.id],
        status: 'active'
      }, 'test_admin');
      assert.strictEqual(testAddon.execution_mode, 'during_main_service');

      const sq = await seeCatalogueService.registerMediaAsset({
        entityType: 'service',
        entityId: testService.id,
        mediaSlot: 'square_1_1',
        storageUrl: 'https://cdn.example.com/sq.jpg',
        width: 800,
        height: 800
      });
      assert.strictEqual(sq.media_slot, 'square_1_1');

      await assert.rejects(
        () => seeCatalogueService.registerMediaAsset({
          entityType: 'service',
          entityId: testService.id,
          mediaSlot: 'square_1_1',
          storageUrl: 'https://cdn.example.com/bad.jpg',
          width: 800,
          height: 600
        }),
        /1:1 aspect ratio/
      );
    });

    // -------------------------------------------------------------------
    // 4. Package Engine & Pricing Tests
    // -------------------------------------------------------------------
    await test('Package: Multi-benefit composition + city/zone/segment pricing', async () => {
      testPkg = await seeCatalogueService.createPackage({
        packageCode: `TEST_PKG_${suffix}`,
        name: 'Custom Signature Pack',
        mainServiceId: testService.id,
        validityValue: 6,
        validityUnit: 'months',
        vehicleSegment: '5_seater',
        pricingModel: 'vehicle_segment',
        basePrice: 1800,
        status: 'active',
        benefits: [
          { serviceId: testService.id, benefitType: 'wash_credit', quantity: 4 }
        ],
        addons: [
          { addonId: testAddon.id, quantity: 2, isIncluded: true }
        ],
        pricingRules: [
          { city: 'Jaipur', zone: 'Zone-A', vehicleSegment: '5_plus_seater', pricingModel: 'vehicle_segment', unitPrice: 2400 }
        ]
      }, 'test_admin');

      const priceDefault = seeCatalogueService.calculatePackagePrice(testPkg, { vehicleSegment: '5_seater' });
      assert.strictEqual(priceDefault.basePrice, 1800);

      const priceZone = seeCatalogueService.calculatePackagePrice(testPkg, { city: 'Jaipur', zone: 'Zone-A', vehicleSegment: '5_plus_seater' });
      assert.strictEqual(priceZone.basePrice, 2400);
    });

    // -------------------------------------------------------------------
    // 5. Purchase Snapshot & Entitlement Ledger Tests
    // -------------------------------------------------------------------
    let snapshot, washAcct;
    await test('Purchase & Entitlement: Immutable snapshot + ledger purchase/reserve/release/consume/idempotency', async () => {
      const purchase = await seeEntitlementService.createPurchase({
        customerId: testCustomer.id,
        packageIdOrCode: testPkg.id,
        city: 'Jaipur',
        zone: 'Zone-A',
        vehicleSegment: '5_plus_seater',
        discountAmount: 200,
        actor: 'test_admin'
      });
      snapshot = purchase.snapshot;
      assert.strictEqual(parseFloat(snapshot.final_price), 2200);

      // Mutating package in catalogue must NOT affect existing snapshot
      await seeCatalogueService.updatePackage(testPkg.id, { name: 'Mutated Pack Name', basePrice: 9999 }, 'test_admin');
      const reloadedSnap = await repos.seeEntitlement.findSnapshotById(snapshot.id);
      assert.strictEqual(reloadedSnap.package_name, 'Custom Signature Pack');

      // Direct UPDATE on snapshot terms must be blocked by DB trigger
      await assert.rejects(
        () => db.query(`UPDATE public.purchase_snapshots SET final_price = 1 WHERE id = $1`, [snapshot.id]),
        /immutable/
      );

      washAcct = purchase.accounts.find(a => a.entitlement_kind === 'wash_credit');
      assert.strictEqual(washAcct.purchased_qty, 4);
      assert.strictEqual(washAcct.remaining_qty, 4);

      // Reserve -> Release -> Reserve -> Consume (with idempotency)
      const res1 = await seeEntitlementService.mutateEntitlement({
        accountId: washAcct.id, entryType: 'reserve', quantity: 1, idempotencyKey: `res1:${suffix}`, reason: 'Reserve 1', actor: 'test'
      });
      assert.strictEqual(res1.account.reserved_qty, 1);
      assert.strictEqual(res1.account.remaining_qty, 3);

      const rel1 = await seeEntitlementService.mutateEntitlement({
        accountId: washAcct.id, entryType: 'release', quantity: 1, idempotencyKey: `rel1:${suffix}`, reason: 'Release 1', actor: 'test'
      });
      assert.strictEqual(rel1.account.reserved_qty, 0);
      assert.strictEqual(rel1.account.remaining_qty, 4);

      const con1 = await seeEntitlementService.mutateEntitlement({
        accountId: washAcct.id, entryType: 'consume', quantity: 1, idempotencyKey: `con1:${suffix}`, reason: 'Consume 1', actor: 'test'
      });
      assert.strictEqual(con1.account.consumed_qty, 1);
      assert.strictEqual(con1.account.remaining_qty, 3);

      // Idempotent replay must NOT double-consume
      const conReplay = await seeEntitlementService.mutateEntitlement({
        accountId: washAcct.id, entryType: 'consume', quantity: 1, idempotencyKey: `con1:${suffix}`, reason: 'Consume 1', actor: 'test'
      });
      assert.strictEqual(conReplay.idempotentReplay, true);
      assert.strictEqual(conReplay.account.remaining_qty, 3);

      // Ledger immutability check
      await assert.rejects(
        () => db.query(`UPDATE public.entitlement_ledger SET quantity = 99 WHERE id = $1`, [con1.ledgerEntry.id]),
        /append-only/
      );
    });

    // -------------------------------------------------------------------
    // 6. Staff Type, Eligibility & Overrides Tests
    // -------------------------------------------------------------------
    await test('Staff Capabilities: Staff Type auto-wiring, city/zone/inactive checks, overrides & audit', async () => {
      const assigned = await seeStaffCapabilityService.assignStaffType(testStaff.id, 'WASH_SPECIALIST', 'test_admin');
      assert.ok(assigned.appliedDefaults.defaultServiceCapabilities.includes('CAR_WASH'));

      const okElig = await seeStaffCapabilityService.evaluateStaffEligibility(testStaff.id, {
        serviceId: testService.id,
        serviceCode: 'CAR_WASH',
        serviceCategoryId: 'car_washing',
        city: 'Jaipur',
        zone: 'Zone-A',
        scheduledDate: '2026-11-28'
      });
      assert.strictEqual(okElig.eligible, true);

      const wrongCity = await seeStaffCapabilityService.evaluateStaffEligibility(testStaff.id, {
        serviceId: testService.id,
        serviceCode: 'CAR_WASH',
        city: 'Mumbai'
      });
      assert.strictEqual(wrongCity.eligible, false);

      const inactiveElig = await seeStaffCapabilityService.evaluateStaffEligibility(testInactiveStaff.id, {
        serviceId: testService.id,
        serviceCode: 'CAR_WASH'
      });
      assert.strictEqual(inactiveElig.eligible, false);

      const ov = await seeStaffCapabilityService.grantCapabilityOverride({
        staffId: testStaff.id,
        capabilityType: 'addon',
        targetId: testAddon.id,
        isAllowed: true,
        reason: 'Trained on engine bay wipe',
        authorizedBy: 'test_admin'
      });
      assert.strictEqual(ov.is_allowed, true);
    });

    // -------------------------------------------------------------------
    // 7. Job Execution, Proof/Add-on Enforcement & Staff Contract Isolation
    // -------------------------------------------------------------------
    await test('Execution & Proof: Staff contract isolation, proof/add-on enforcement, and completion consumption', async () => {
      const job = await seeExecutionService.createCanonicalJob({
        customerId: testCustomer.id,
        locationId: testLoc.id,
        serviceIdOrCode: testService.id,
        scheduledDate: '2026-11-28',
        city: 'Jaipur',
        zone: 'Zone-A',
        entitlementAccountId: washAcct.id,
        purchaseSnapshotId: snapshot.id,
        staffId: testStaff.id,
        addonIds: [testAddon.id],
        actor: 'test_admin'
      });

      const jobAddons = await repos.seeOperations.findJobAddons(job.id);
      const staffContract = seeExecutionService.buildStaffSafeJobContract(job, { addons: jobAddons });
      assert.strictEqual(staffContract.servicePrice, undefined);
      assert.strictEqual(staffContract.finalPrice, undefined);

      // Cannot complete without proof
      await assert.rejects(
        () => seeExecutionService.completeExecution(job.id, {
          staffId: testStaff.id,
          checklistResults: ['Rinse', 'Foam', 'Dry'],
          proofPhotos: { before: [], after: [] }
        }),
        /Required proof photos missing/
      );

      // Cannot complete while required add-on is pending
      await assert.rejects(
        () => seeExecutionService.completeExecution(job.id, {
          staffId: testStaff.id,
          checklistResults: ['Rinse', 'Foam', 'Dry'],
          proofPhotos: { before: ['b1.jpg'], after: ['a1.jpg'] }
        }),
        /Required add-ons incomplete/
      );

      // Complete required add-on, then complete job
      await repos.seeOperations.updateJobAddonStatus(jobAddons[0].id, {
        status: 'completed',
        completedBy: testStaff.staff_code
      });

      const exec = await seeExecutionService.completeExecution(job.id, {
        staffId: testStaff.id,
        checklistResults: ['Rinse', 'Foam', 'Dry'],
        proofPhotos: { before: ['b1.jpg'], after: ['a1.jpg'] },
        actor: testStaff.staff_code
      });
      assert.strictEqual(exec.outcome, 'completed');

      const acctAfter = await repos.seeEntitlement.findAccountById(washAcct.id);
      assert.strictEqual(acctAfter.consumed_qty, 2);
      assert.strictEqual(acctAfter.remaining_qty, 2);
    });

    // -------------------------------------------------------------------
    // 8. Solar Verification & Legacy Mapping Tests
    // -------------------------------------------------------------------
    await test('Solar Verification & Legacy Mapping: Estimate vs actual discrepancy approval + backfill check', async () => {
      const solarSvc = await repos.seeCatalogue.findServiceByCode('SOLAR_CLEAN');
      const solarJob = await seeExecutionService.createCanonicalJob({
        customerId: testCustomer.id,
        locationId: testLoc.id,
        serviceIdOrCode: solarSvc.id,
        scheduledDate: '2026-11-29',
        city: 'Jaipur',
        zone: 'Zone-A',
        solarEstimate: { estimatedPanelCount: 10, systemCapacityKw: 5.0, estimateMethod: 'customer_declared' },
        actor: 'test_admin'
      });

      const ver = await seeExecutionService.submitSolarVerification(solarJob.id, {
        staffId: testStaff.id,
        actualPanelCount: 14,
        discrepancyReason: '4 extra panels on upper roof'
      });
      assert.strictEqual(ver.discrepancy_count, 4);
      assert.strictEqual(ver.approval_status, 'pending_approval');

      const approved = await seeExecutionService.approveSolarDiscrepancy(solarJob.id, {
        approved: true,
        approvedBy: 'test_admin'
      });
      assert.strictEqual(approved.approval_status, 'approved');
      assert.strictEqual(approved.final_serviced_quantity, 14);

      const mapRes = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.legacy_service_mapping`);
      assert.ok(mapRes.rows[0].cnt >= 5);
    });
  } finally {
    // Clean up test records safely in reverse dependency order
    if (testCustomer) {
      await db.query(`DELETE FROM public.service_executions WHERE job_id IN (SELECT id FROM public.service_jobs WHERE customer_id = $1)`, [testCustomer.id]).catch(() => {});
      await db.query(`DELETE FROM public.solar_verifications WHERE job_id IN (SELECT id FROM public.service_jobs WHERE customer_id = $1)`, [testCustomer.id]).catch(() => {});
      await db.query(`DELETE FROM public.service_job_addons WHERE job_id IN (SELECT id FROM public.service_jobs WHERE customer_id = $1)`, [testCustomer.id]).catch(() => {});
      await db.query(`UPDATE public.service_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE customer_id = $1`, [testCustomer.id]).catch(() => {});
    }
    if (testPkg) await db.query(`DELETE FROM public.packages WHERE id = $1`, [testPkg.id]).catch(() => {});
    if (testAddon) await db.query(`DELETE FROM public.addons WHERE id = $1`, [testAddon.id]).catch(() => {});
    if (testService) await db.query(`DELETE FROM public.services WHERE id = $1`, [testService.id]).catch(() => {});
    if (testStaff) await db.query(`DELETE FROM public.staff WHERE id = $1`, [testStaff.id]).catch(() => {});
    if (testInactiveStaff) await db.query(`DELETE FROM public.staff WHERE id = $1`, [testInactiveStaff.id]).catch(() => {});
    await db.close();
  }

  console.log(`\n================================================================`);
  console.log(`SEE-01 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
