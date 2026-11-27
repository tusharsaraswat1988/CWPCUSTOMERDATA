/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-07)
 * Legacy Completion Bypass, Locked Legacy Assignment & Cross-Date Midnight QA
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const { Readable } = require('stream');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const { server, createAdminSession, createStaffSession } = require('../server');
const seeCatalogueService = require('../services/seeCatalogueService');
const seeEntitlementService = require('../services/seeEntitlementService');
const seeExecutionService = require('../services/seeExecutionService');
const seeStaffCapabilityService = require('../services/seeStaffCapabilityService');

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

function callLegacyApi(payload, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const req = Readable.from([Buffer.from(bodyStr)]);
    req.method = 'POST';
    req.url = '/api';
    req.headers = {
      host: 'localhost:3000',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 200;
    let raw = '';
    const res = {
      headersSent: false,
      setHeader() {},
      writeHead(code) { statusCode = code; this.headersSent = true; },
      end(chunk) {
        if (chunk) raw += chunk;
        try {
          resolve({ statusCode, body: raw ? JSON.parse(raw) : null });
        } catch (e) {
          resolve({ statusCode, body: raw });
        }
      }
    };
    server.emit('request', req, res);
  });
}

async function run() {
  console.log('================================================================');
  console.log('CWP SEE-07 REGRESSION TEST SUITE (REAL DB + SERVER.JS HANDLER)');
  console.log('================================================================');

  const suffix = Date.now();
  let cust, loc, staffOk, staffIncompat, svc, pkg, adminToken, staffToken;

  try {
    cust = await repos.customers.createCustomer({ name: `SEE07 Cust ${suffix}`, phone: `91${String(suffix).slice(-8)}`, isActive: true });
    loc = await repos.serviceLocations.createLocation({ customerId: cust.id, locationName: 'Loc 07', addressText: 'Addr 07', isPrimary: true });

    const s1 = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, equipment_available, max_daily_jobs)
       VALUES ($1, 'SEE07 Staff OK', $2, TRUE, 'services_only', '["car_washing"]'::jsonb, '["Foam Cannon"]'::jsonb, 10) RETURNING *`,
      [`S07A${String(suffix).slice(-4)}`, `92${String(suffix).slice(-8)}`]
    );
    staffOk = s1.rows[0];

    const s2 = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, equipment_available, max_daily_jobs)
       VALUES ($1, 'SEE07 Staff Incompat', $2, TRUE, 'dcc_only', '["daily_car_cleaning"]'::jsonb, '[]'::jsonb, 10) RETURNING *`,
      [`S07B${String(suffix).slice(-4)}`, `93${String(suffix).slice(-8)}`]
    );
    staffIncompat = s2.rows[0];

    svc = await seeCatalogueService.createService({
      serviceCode: `S07_WASH_${suffix}`,
      name: 'SEE07 Wash',
      serviceCategoryId: 'car_washing',
      serviceModel: 'visit_credit',
      expectedDurationMinutes: 60,
      executionConfig: { required_equipment: ['Foam Cannon'] },
      checklistRequirements: ['Pre-rinse', 'Foam'],
      photoRequirements: { before_min: 0, after_min: 1, required: true },
      status: 'active'
    }, 'test_admin');

    pkg = await seeCatalogueService.createPackage({
      packageCode: `S07_PKG_${suffix}`,
      name: 'SEE07 Pack',
      mainServiceId: svc.id,
      validityValue: 30,
      validityUnit: 'days',
      basePrice: 600,
      status: 'active',
      benefits: [{ serviceId: svc.id, benefitType: 'wash_credit', quantity: 2 }]
    }, 'test_admin');

    adminToken = await createAdminSession('test_admin');
    staffToken = await createStaffSession(staffOk.id, staffOk.name, staffOk.phone);

    // 1. Finding 1: Legacy completeSpecialJob cannot bypass SEE proof/checklist or skip entitlement
    await test('Finding 1 (Endpoint + Real DB): completeSpecialJob enforces SEE proof/checklist and consumes entitlement once', async () => {
      const purchase = await seeEntitlementService.createPurchase({
        saleReference: `S07_PURCHASE_${suffix}`, customerId: cust.id, packageIdOrCode: pkg.id, actor: 'test_admin'
      });
      const acct = purchase.accounts[0];

      const job = await seeExecutionService.createCanonicalJob({
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svc.id,
        entitlementAccountId: acct.id, purchaseSnapshotId: purchase.snapshot.id,
        scheduledDate: '2026-12-15', scheduledTime: '09:00', staffId: staffOk.id, actor: 'test_admin'
      });

      // Attempt legacy completeSpecialJob WITHOUT after photo -> must fail 400 (no legacy fallback!)
      const missingProofRes = await callLegacyApi({
        action: 'completeSpecialJob',
        jobId: job.id,
        checklistResults: ['Pre-rinse', 'Foam']
      }, staffToken);
      assert.strictEqual(missingProofRes.statusCode, 400);
      assert.ok(/Required proof photos missing/.test(missingProofRes.body.error));

      // Attempt legacy completeSpecialJob WITH valid proof & checklist -> succeeds via SEE & consumes 1
      const okRes = await callLegacyApi({
        action: 'completeSpecialJob',
        jobId: job.id,
        checklistResults: [{ id: 'pre_rinse', completed: true }, { id: 'foam', completed: true }],
        afterPhotoUrls: ['https://cdn.example.com/after.jpg']
      }, staffToken);
      assert.strictEqual(okRes.statusCode, 200);
      assert.strictEqual(okRes.body.entitlementDeducted, true);

      const acctAfter = await repos.seeEntitlement.findAccountById(acct.id);
      assert.strictEqual(acctAfter.consumed_qty, 1);
      assert.strictEqual(acctAfter.remaining_qty, 1);

      // Duplicate legacy completeSpecialJob -> rejected, no double consumption
      const dupRes = await callLegacyApi({
        action: 'completeSpecialJob',
        jobId: job.id,
        checklistResults: [{ id: 'pre_rinse', completed: true }, { id: 'foam', completed: true }],
        afterPhotoUrls: ['https://cdn.example.com/after.jpg']
      }, staffToken);
      assert.strictEqual(dupRes.statusCode, 400);
      const acctDup = await repos.seeEntitlement.findAccountById(acct.id);
      assert.strictEqual(acctDup.consumed_qty, 1);
    });

    // 2. Finding 2: Legacy assignSpecialJob & reassignSpecialJob use locked SEE assignment
    await test('Finding 2 (Endpoint + Transaction): Concurrent assignSpecialJob & reassignSpecialJob enforce SEE lock & capability', async () => {
      // Unauthorized assignSpecialJob rejected
      const unauth = await callLegacyApi({
        action: 'assignSpecialJob',
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svc.id,
        scheduledDate: '2026-12-16', scheduledTime: '10:00', staffId: staffOk.id
      }, staffToken);
      assert.strictEqual(unauth.statusCode, 401);

      // Concurrent overlapping assignSpecialJob calls -> strictly 1 succeeds
      const results = await Promise.all([
        callLegacyApi({
          action: 'assignSpecialJob',
          customerId: cust.id, locationId: loc.id, serviceIdOrCode: svc.id,
          scheduledDate: '2026-12-16', scheduledTime: '10:00', staffId: staffOk.id
        }, adminToken),
        callLegacyApi({
          action: 'assignSpecialJob',
          customerId: cust.id, locationId: loc.id, serviceIdOrCode: svc.id,
          scheduledDate: '2026-12-16', scheduledTime: '10:30', staffId: staffOk.id
        }, adminToken)
      ]);
      const okCount = results.filter(r => r.statusCode === 200 && r.body.success).length;
      assert.strictEqual(okCount, 1, 'Exactly 1 concurrent overlapping assignSpecialJob must succeed');

      const createdJobId = results.find(r => r.statusCode === 200).body.job.id;

      // Reassign to incompatible staff -> rejected
      const badReassign = await callLegacyApi({
        action: 'reassignSpecialJob',
        jobId: createdJobId,
        toStaffId: staffIncompat.id
      }, adminToken);
      assert.ok(badReassign.statusCode >= 400 || badReassign.body.success === false);
    });

    // 3. Finding 3: Cross-date midnight spillover (Day D 23:30-00:30 vs Day D+1 00:15-01:00)
    await test('Finding 3 (Real DB): Day D 23:30 (60m) conflicts with Day D+1 00:15, allows 00:30 and Day D+2 00:15', async () => {
      await seeExecutionService.createCanonicalJob({
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svc.id,
        scheduledDate: '2026-12-20', scheduledTime: '23:30', staffId: staffOk.id, actor: 'test_admin'
      });

      // Day D+1 00:15 overlaps Day D 23:30-00:30
      const conflictElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffOk.id, {
        serviceId: svc.id, serviceCode: svc.service_code, serviceCategoryId: 'car_washing',
        scheduledDate: '2026-12-21', scheduledTime: '00:15', durationMinutes: 45,
        requiredEquipment: ['Foam Cannon']
      });
      assert.strictEqual(conflictElig.eligible, false);
      assert.ok(conflictElig.reasons.some(r => r.includes('overlapping job')));

      // Day D+1 00:30 is adjacent (non-overlapping) -> eligible
      const adjacentElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffOk.id, {
        serviceId: svc.id, serviceCode: svc.service_code, serviceCategoryId: 'car_washing',
        scheduledDate: '2026-12-21', scheduledTime: '00:30', durationMinutes: 45,
        requiredEquipment: ['Foam Cannon']
      });
      assert.strictEqual(adjacentElig.eligible, true);

      // Day D+2 00:15 (unrelated date) -> eligible
      const unrelatedElig = await seeStaffCapabilityService.evaluateStaffEligibility(staffOk.id, {
        serviceId: svc.id, serviceCode: svc.service_code, serviceCategoryId: 'car_washing',
        scheduledDate: '2026-12-22', scheduledTime: '00:15', durationMinutes: 45,
        requiredEquipment: ['Foam Cannon']
      });
      assert.strictEqual(unrelatedElig.eligible, true);
    });
  } finally {
    if (cust) {
      await db.query(`UPDATE public.service_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE customer_id = $1`, [cust.id]).catch(() => {});
    }
    if (pkg) await db.query(`DELETE FROM public.packages WHERE id = $1`, [pkg.id]).catch(() => {});
    if (svc) await db.query(`DELETE FROM public.services WHERE id = $1`, [svc.id]).catch(() => {});
    if (staffOk) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffOk.id]).catch(() => {});
    if (staffIncompat) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffIncompat.id]).catch(() => {});
    await db.close();
  }

  console.log(`\n================================================================`);
  console.log(`SEE-07 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
