/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-03)
 * Security, Transaction Integrity, Ownership, Equipment, Schedule & P2 QA Suite
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const { Readable } = require('stream');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeApiRouter = require('../services/seeApiRouter');
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

function mockRequest(method, urlPath, bodyObj = null, token = null) {
  const payload = bodyObj ? JSON.stringify(bodyObj) : '';
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);
  req.method = method;
  req.url = urlPath;
  req.headers = {
    host: 'localhost:3000',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
  return req;
}

function mockResponse() {
  let statusCode = 200;
  let raw = '';
  const res = {
    writeHead(code) { statusCode = code; },
    end(chunk) { if (chunk) raw += chunk; }
  };
  return {
    res,
    getResult() {
      return { statusCode, body: raw ? JSON.parse(raw) : null };
    }
  };
}

async function callSeeApi(method, urlPath, bodyObj, { adminSess = null, staffSess = null } = {}) {
  const req = mockRequest(method, urlPath, bodyObj, 'tok');
  const { res, getResult } = mockResponse();
  const parsedUrl = new URL(urlPath, 'http://localhost:3000');
  await seeApiRouter.handleSeeRequest(req, res, parsedUrl, {
    extractAuthToken: () => 'tok',
    resolveAdminSession: async () => adminSess,
    resolveStaffSession: async () => staffSess
  });
  return getResult();
}

async function run() {
  console.log('================================================================');
  console.log('CWP SEE-03 REMEDIATION SECURITY & INTEGRITY TEST SUITE');
  console.log('================================================================');

  const suffix = Date.now();
  let custA, custB, locA, locB, vehB, staffA, staffB, svc, pkg, addon;

  try {
    custA = await repos.customers.createCustomer({ name: `SEE03 CustA ${suffix}`, phone: `91${String(suffix).slice(-8)}`, isActive: true });
    custB = await repos.customers.createCustomer({ name: `SEE03 CustB ${suffix}`, phone: `92${String(suffix).slice(-8)}`, isActive: true });
    locA = await repos.serviceLocations.createLocation({ customerId: custA.id, locationName: 'Loc A', addressText: 'Addr A', isPrimary: true });
    locB = await repos.serviceLocations.createLocation({ customerId: custB.id, locationName: 'Loc B', addressText: 'Addr B', isPrimary: true });
    vehB = await repos.vehicles.createVehicle({ customerId: custB.id, registrationNo: `SEE03B${String(suffix).slice(-4)}`, vehicleType: 'Car' });

    const sA = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, weekly_off, equipment_available, max_daily_jobs)
       VALUES ($1, 'Staff A', $2, TRUE, 'services_only', '["car_washing","solar_cleaning"]'::jsonb, 'Sunday', '["Pressure Washer"]'::jsonb, 5) RETURNING *`,
      [`S03A${String(suffix).slice(-4)}`, `93${String(suffix).slice(-8)}`]
    );
    staffA = sA.rows[0];

    const sB = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, equipment_available, max_daily_jobs)
       VALUES ($1, 'Staff B', $2, TRUE, 'services_only', '["car_washing","solar_cleaning"]'::jsonb, '[]'::jsonb, 5) RETURNING *`,
      [`S03B${String(suffix).slice(-4)}`, `94${String(suffix).slice(-8)}`]
    );
    staffB = sB.rows[0];

    svc = await seeCatalogueService.createService({
      serviceCode: `S03_SVC_${suffix}`,
      name: 'SEE03 Test Wash',
      serviceCategoryId: 'car_washing',
      serviceModel: 'visit_credit',
      checklistRequirements: ['Wash'],
      photoRequirements: { before_min: 0, after_min: 0, required: false },
      status: 'active'
    }, 'test_admin');

    addon = await seeCatalogueService.createAddon({
      addonCode: `S03_ADDON_${suffix}`,
      name: 'SEE03 Addon',
      defaultPrice: 100,
      executionMode: 'during_main_service',
      isOptional: false,
      status: 'active'
    }, 'test_admin');

    pkg = await seeCatalogueService.createPackage({
      packageCode: `S03_PKG_${suffix}`,
      name: 'SEE03 Pack',
      mainServiceId: svc.id,
      validityValue: 30,
      validityUnit: 'days',
      basePrice: 500,
      cityZoneEligibility: { all_cities: false, cities: ['Jaipur'], zones: ['Zone-A'] },
      effectiveFrom: '2020-01-01',
      effectiveTo: '2099-12-31',
      status: 'active',
      benefits: [{ serviceId: svc.id, benefitType: 'wash_credit', quantity: 1 }]
    }, 'test_admin');

    // -------------------------------------------------------------------
    // 1. P0: Staff Job Ownership & IDOR Security
    // -------------------------------------------------------------------
    await test('P0 IDOR: Staff A cannot read/start/complete/terminate/solar-verify Staff B job or unassigned job', async () => {
      const unassignedJob = await seeExecutionService.createCanonicalJob({
        customerId: custA.id, locationId: locA.id, serviceIdOrCode: svc.id, scheduledDate: '2026-12-01', actor: 'test_admin'
      });
      const jobB = await seeExecutionService.createCanonicalJob({
        customerId: custA.id, locationId: locA.id, serviceIdOrCode: svc.id, scheduledDate: '2026-12-01', staffId: staffB.id, addonIds: [addon.id], actor: 'test_admin'
      });
      const jobBAddons = await repos.seeOperations.findJobAddons(jobB.id);

      const sessA = { userType: 'staff', staffId: staffA.id, staffCode: staffA.staff_code };
      const sessB = { userType: 'staff', staffId: staffB.id, staffCode: staffB.staff_code };
      const adminSess = { userType: 'admin', username: 'admin' };

      // Unassigned job rejected for Staff A
      assert.strictEqual((await callSeeApi('GET', `/api/see/jobs/${unassignedJob.id}/staff-contract`, null, { staffSess: sessA })).statusCode, 403);
      // Admin can read unassigned job
      assert.strictEqual((await callSeeApi('GET', `/api/see/jobs/${unassignedJob.id}/staff-contract`, null, { adminSess })).statusCode, 200);

      // Staff A blocked on all Job B endpoints (even if spoofing body.staffId = staffB.id)
      assert.strictEqual((await callSeeApi('GET', `/api/see/jobs/${jobB.id}/staff-contract`, null, { staffSess: sessA })).statusCode, 403);
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${jobB.id}/start`, { staffId: staffB.id }, { staffSess: sessA })).statusCode, 403);
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${jobB.id}/complete`, { staffId: staffB.id, checklistResults: ['Wash'] }, { staffSess: sessA })).statusCode, 403);
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${jobB.id}/terminate`, { outcome: 'cancelled', reason: 'hack' }, { staffSess: sessA })).statusCode, 403);
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${jobB.id}/addons/${jobBAddons[0].id}/complete`, {}, { staffSess: sessA })).statusCode, 403);
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${jobB.id}/solar-verify`, { actualPanelCount: 10 }, { staffSess: sessA })).statusCode, 403);

      // Cross-job add-on mismatch rejected even for Staff B
      assert.strictEqual((await callSeeApi('POST', `/api/see/jobs/${unassignedJob.id}/addons/${jobBAddons[0].id}/complete`, {}, { adminSess })).statusCode, 404);

      // Reassign jobB to Staff A -> Staff B now rejected, Staff A allowed
      await seeExecutionService.assignJob(jobB.id, staffA.id, 'test_admin');
      assert.strictEqual((await callSeeApi('GET', `/api/see/jobs/${jobB.id}/staff-contract`, null, { staffSess: sessB })).statusCode, 403);
      assert.strictEqual((await callSeeApi('GET', `/api/see/jobs/${jobB.id}/staff-contract`, null, { staffSess: sessA })).statusCode, 200);
    });

    // -------------------------------------------------------------------
    // 2. P0: Atomic Job + Entitlement Transaction Boundaries
    // -------------------------------------------------------------------
    await test('P0 Atomic Tx: Failed reservation rolls back job creation; concurrent completion cannot double-consume', async () => {
      const purchase = await seeEntitlementService.createPurchase({
        saleReference: `S03_ATOMIC_${suffix}`, customerId: custA.id, packageIdOrCode: pkg.id, city: 'Jaipur', zone: 'Zone-A', actor: 'test_admin'
      });
      const acct = purchase.accounts[0]; // purchased_qty = 1

      // First job succeeds & reserves 1
      const job1 = await seeExecutionService.createCanonicalJob({
        customerId: custA.id, locationId: locA.id, serviceIdOrCode: svc.id,
        entitlementAccountId: acct.id, purchaseSnapshotId: purchase.snapshot.id,
        scheduledDate: '2026-12-02', staffId: staffA.id, actor: 'test_admin'
      });

      // Second job must fail reservation AND roll back service_jobs row (no orphan!)
      const beforeCnt = (await db.query(`SELECT COUNT(*)::int AS c FROM public.service_jobs WHERE customer_id = $1`, [custA.id])).rows[0].c;
      await assert.rejects(
        () => seeExecutionService.createCanonicalJob({
          customerId: custA.id, locationId: locA.id, serviceIdOrCode: svc.id,
          entitlementAccountId: acct.id, purchaseSnapshotId: purchase.snapshot.id,
          scheduledDate: '2026-12-03', actor: 'test_admin'
        }),
        /Insufficient remaining entitlement|Cannot reserve from account in status 'exhausted'/
      );
      const afterCnt = (await db.query(`SELECT COUNT(*)::int AS c FROM public.service_jobs WHERE customer_id = $1`, [custA.id])).rows[0].c;
      assert.strictEqual(afterCnt, beforeCnt, 'Orphan service_jobs row must not exist after failed reservation');

      // Concurrent completion attempts on job1 -> exactly 1 succeeds, 0 double consumption
      const results = await Promise.allSettled([
        seeExecutionService.completeExecution(job1.id, { staffId: staffA.id, checklistResults: [{ id: 'wash', completed: true }], actor: staffA.staff_code }),
        seeExecutionService.completeExecution(job1.id, { staffId: staffA.id, checklistResults: [{ id: 'wash', completed: true }], actor: staffA.staff_code })
      ]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      assert.strictEqual(fulfilled.length, 1, `Expected one completion winner; failures: ${results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message).join(' | ')}`);
      const acctAfter = await repos.seeEntitlement.findAccountById(acct.id);
      assert.strictEqual(acctAfter.consumed_qty, 1);
      assert.strictEqual(acctAfter.remaining_qty, 0);
    });

    // -------------------------------------------------------------------
    // 3. P1: Customer/Vehicle/Location Ownership & Package Effective Dates
    // -------------------------------------------------------------------
    await test('P1 Ownership & Dates: Foreign vehicle/location, wrong city, and expired package rejected', async () => {
      await assert.rejects(
        () => seeEntitlementService.createPurchase({ saleReference: `S03_FOREIGN_VEH_${suffix}`, customerId: custA.id, vehicleId: vehB.id, packageIdOrCode: pkg.id, city: 'Jaipur', zone: 'Zone-A' }),
        /does not belong to customer/
      );
      await assert.rejects(
        () => seeEntitlementService.createPurchase({ saleReference: `S03_FOREIGN_LOC_${suffix}`, customerId: custA.id, locationId: locB.id, packageIdOrCode: pkg.id, city: 'Jaipur', zone: 'Zone-A' }),
        /does not belong to customer/
      );
      await assert.rejects(
        () => seeEntitlementService.createPurchase({ saleReference: `S03_WRONG_CITY_${suffix}`, customerId: custA.id, packageIdOrCode: pkg.id, city: 'Delhi', zone: 'Zone-A' }),
        /not available in city/
      );

      const expiredPkg = await seeCatalogueService.createPackage({
        packageCode: `S03_EXP_${suffix}`,
        name: 'Expired Pack',
        mainServiceId: svc.id,
        effectiveFrom: '2020-01-01',
        effectiveTo: '2021-01-01',
        status: 'active'
      }, 'test_admin');
      await assert.rejects(
        () => seeEntitlementService.createPurchase({ saleReference: `S03_EXPIRED_${suffix}`, customerId: custA.id, packageIdOrCode: expiredPkg.id }),
        /has expired/
      );
      await db.query(`DELETE FROM public.packages WHERE id = $1`, [expiredPkg.id]).catch(() => {});
    });

    // -------------------------------------------------------------------
    // 4. P1: Equipment Eligibility by Default
    // -------------------------------------------------------------------
    await test('P1 Equipment: Empty equipment_available fails when equipment is required', async () => {
      const eligB = await seeStaffCapabilityService.evaluateStaffEligibility(staffB.id, {
        serviceId: svc.id, serviceCategoryId: 'car_washing', requiredEquipment: ['Pressure Washer']
      });
      assert.strictEqual(eligB.eligible, false);
      assert.ok(eligB.reasons.some(r => r.includes('unknown/empty equipment inventory')));

      const eligA = await seeStaffCapabilityService.evaluateStaffEligibility(staffA.id, {
        serviceId: svc.id, serviceCategoryId: 'car_washing', requiredEquipment: ['Pressure Washer']
      });
      assert.strictEqual(eligA.eligible, true);
    });

    // -------------------------------------------------------------------
    // 5. P1: Weekly-Off & Schedule Overlap Validation
    // -------------------------------------------------------------------
    await test('P1 Schedule: Weekly-off and overlapping time slots rejected; non-overlapping accepted', async () => {
      // 2026-11-29 is Sunday (staffA.weekly_off = 'Sunday')
      const offElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffA.id, {
        serviceId: svc.id, serviceCategoryId: 'car_washing', scheduledDate: '2026-11-29', scheduledTime: '10:00'
      });
      assert.strictEqual(offElig.eligible, false);
      assert.ok(offElig.reasons.some(r => r.includes('weekly off')));

      // Create job on 2026-12-04 at 10:00 for staffA
      await seeExecutionService.createCanonicalJob({
        customerId: custA.id, locationId: locA.id, serviceIdOrCode: svc.id,
        scheduledDate: '2026-12-04', scheduledTime: '10:00', staffId: staffA.id, actor: 'test_admin'
      });

      const overlapElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffA.id, {
        serviceId: svc.id, serviceCategoryId: 'car_washing', scheduledDate: '2026-12-04', scheduledTime: '10:15', durationMinutes: 30
      });
      assert.strictEqual(overlapElig.eligible, false);
      assert.ok(overlapElig.reasons.some(r => r.includes('overlapping job')));

      const nonOverlapElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffA.id, {
        serviceId: svc.id, serviceCategoryId: 'car_washing', scheduledDate: '2026-12-04', scheduledTime: '11:30', durationMinutes: 60
      });
      assert.strictEqual(nonOverlapElig.eligible, true);
    });

    // -------------------------------------------------------------------
    // 6. P2: Snapshot DELETE Protection & Month-End Frequency Anchor
    // -------------------------------------------------------------------
    await test('P2 Snapshot DELETE & Month-End Anchor: Snapshot DELETE blocked; Jan 31 preserves day 31 across Feb', async () => {
      const snaps = await repos.seeEntitlement.findSnapshotsByCustomer(custA.id);
      assert.ok(snaps.length > 0);
      await assert.rejects(
        () => db.query(`DELETE FROM public.purchase_snapshots WHERE id = $1`, [snaps[0].id]),
        /cannot be deleted/
      );

      const occ = seeFrequencyService.generateOccurrences(
        { frequency_type: 'monthly', interval_value: 1 },
        { fromDate: '2026-01-31', toDate: '2026-05-31' }
      );
      assert.deepStrictEqual(occ.map(o => o.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);

      const leapEvery2 = seeFrequencyService.generateOccurrences(
        { frequency_type: 'every_n_months', interval_value: 2 },
        { fromDate: '2024-01-31', toDate: '2024-05-31' }
      );
      assert.deepStrictEqual(leapEvery2.map(o => o.date), ['2024-01-31', '2024-03-31', '2024-05-31']);
    });
  } finally {
    if (custA) {
      await db.query(`UPDATE public.service_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE customer_id = $1`, [custA.id]).catch(() => {});
    }
    if (pkg) await db.query(`DELETE FROM public.packages WHERE id = $1`, [pkg.id]).catch(() => {});
    if (addon) await db.query(`DELETE FROM public.addons WHERE id = $1`, [addon.id]).catch(() => {});
    if (svc) await db.query(`DELETE FROM public.services WHERE id = $1`, [svc.id]).catch(() => {});
    if (staffA) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffA.id]).catch(() => {});
    if (staffB) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffB.id]).catch(() => {});
    await db.close();
  }

  console.log(`\n================================================================`);
  console.log(`SEE-03 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
