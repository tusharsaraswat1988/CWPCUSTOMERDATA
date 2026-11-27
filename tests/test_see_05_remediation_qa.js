/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-05)
 * Concurrency-Safe Assignment, Equipment/Schedule Wiring & Legacy Closure QA
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const { Readable } = require('stream');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeApiRouter = require('../services/seeApiRouter');
const seeCatalogueService = require('../services/seeCatalogueService');
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

async function callEligibilityApi(bodyObj) {
  const req = Readable.from([Buffer.from(JSON.stringify(bodyObj))]);
  req.method = 'POST';
  req.url = '/api/see/staff/eligibility';
  req.headers = { host: 'localhost:3000', authorization: 'Bearer adm' };
  let statusCode = 200;
  let raw = '';
  const res = {
    writeHead(code) { statusCode = code; },
    end(chunk) { if (chunk) raw += chunk; }
  };
  await seeApiRouter.handleSeeRequest(req, res, new URL(req.url, 'http://localhost:3000'), {
    extractAuthToken: () => 'adm',
    resolveAdminSession: async () => ({ userType: 'admin', username: 'admin' }),
    resolveStaffSession: async () => null
  });
  return { statusCode, body: JSON.parse(raw) };
}

async function run() {
  console.log('================================================================');
  console.log('CWP SEE-05 CONCURRENCY, WIRING & LEGACY CLOSURE TEST SUITE');
  console.log('================================================================');

  const suffix = Date.now();
  let cust, loc, staffWithEquip, staffNoEquip, svcEquip;

  try {
    cust = await repos.customers.createCustomer({ name: `SEE05 Cust ${suffix}`, phone: `95${String(suffix).slice(-8)}`, isActive: true });
    loc = await repos.serviceLocations.createLocation({ customerId: cust.id, locationName: 'Loc 05', addressText: 'Addr 05', isPrimary: true });

    const s1 = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, equipment_available, max_daily_jobs)
       VALUES ($1, 'Staff Equip', $2, TRUE, 'services_only', '["solar_cleaning"]'::jsonb, '["Safety Harness","TDS Meter"]'::jsonb, 10) RETURNING *`,
      [`S05E${String(suffix).slice(-4)}`, `96${String(suffix).slice(-8)}`]
    );
    staffWithEquip = s1.rows[0];

    const s2 = await db.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active, work_type, service_capabilities, equipment_available, max_daily_jobs)
       VALUES ($1, 'Staff NoEquip', $2, TRUE, 'services_only', '["solar_cleaning"]'::jsonb, '[]'::jsonb, 10) RETURNING *`,
      [`S05N${String(suffix).slice(-4)}`, `97${String(suffix).slice(-8)}`]
    );
    staffNoEquip = s2.rows[0];

    svcEquip = await seeCatalogueService.createService({
      serviceCode: `S05_SOLAR_${suffix}`,
      name: 'SEE05 Solar',
      serviceCategoryId: 'solar_cleaning',
      serviceModel: 'site_quantity',
      expectedDurationMinutes: 60,
      executionConfig: { required_equipment: ['Safety Harness', 'TDS Meter'], allow_concurrent: false },
      status: 'active'
    }, 'test_admin');

    // 1. Real DB Integration: Equipment wiring from service execution_config
    await test('Real DB: createCanonicalJob & assignJob enforce service execution_config.required_equipment', async () => {
      await assert.rejects(
        () => seeExecutionService.createCanonicalJob({
          customerId: cust.id, locationId: loc.id, serviceIdOrCode: svcEquip.id,
          scheduledDate: '2026-12-10', scheduledTime: '09:00', staffId: staffNoEquip.id, actor: 'test_admin'
        }),
        /unknown\/empty equipment inventory/
      );

      // Client-supplied empty requiredEquipment cannot bypass server-side service config
      const apiRes = await callEligibilityApi({
        staffId: staffNoEquip.id,
        serviceId: svcEquip.id,
        requiredEquipment: []
      });
      assert.strictEqual(apiRes.body.eligibility.eligible, false);
    });

    // 2. Transaction Integration: Concurrent assignment race condition prevented by FOR UPDATE lock
    await test('Transaction Integration: Concurrent assignJob calls for overlapping slots allow strictly one winner', async () => {
      const jobA = await seeExecutionService.createCanonicalJob({
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svcEquip.id,
        scheduledDate: '2026-12-11', scheduledTime: '10:00', actor: 'test_admin'
      });
      const jobB = await seeExecutionService.createCanonicalJob({
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svcEquip.id,
        scheduledDate: '2026-12-11', scheduledTime: '10:30', actor: 'test_admin'
      });

      const results = await Promise.allSettled([
        seeExecutionService.assignJob(jobA.id, staffWithEquip.id, 'test_admin'),
        seeExecutionService.assignJob(jobB.id, staffWithEquip.id, 'test_admin')
      ]);
      const successes = results.filter(r => r.status === 'fulfilled');
      const rejections = results.filter(r => r.status === 'rejected');
      assert.strictEqual(successes.length, 1, 'Exactly 1 concurrent overlapping assignment must succeed');
      assert.strictEqual(rejections.length, 1, 'Conflicting concurrent assignment must be rejected');
      assert.ok(/overlapping job/i.test(rejections[0].reason.message));
    });

    // 3. Real DB Integration: Midnight-crossing interval overlap
    await test('Real DB: Midnight-crossing scheduledTime (23:30 + 60m) conflicts with 00:15', async () => {
      await seeExecutionService.createCanonicalJob({
        customerId: cust.id, locationId: loc.id, serviceIdOrCode: svcEquip.id,
        scheduledDate: '2026-12-12', scheduledTime: '23:30', staffId: staffWithEquip.id, actor: 'test_admin'
      });

      await assert.rejects(
        () => seeExecutionService.createCanonicalJob({
          customerId: cust.id, locationId: loc.id, serviceIdOrCode: svcEquip.id,
          scheduledDate: '2026-12-13', scheduledTime: '00:15', staffId: staffWithEquip.id, actor: 'test_admin'
        }),
        /overlapping job/
      );
    });
  } finally {
    if (cust) {
      await db.query(`UPDATE public.service_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE customer_id = $1`, [cust.id]).catch(() => {});
    }
    if (svcEquip) await db.query(`DELETE FROM public.services WHERE id = $1`, [svcEquip.id]).catch(() => {});
    if (staffWithEquip) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffWithEquip.id]).catch(() => {});
    if (staffNoEquip) await db.query(`DELETE FROM public.staff WHERE id = $1`, [staffNoEquip.id]).catch(() => {});
    await db.close();
  }

  console.log(`\n================================================================`);
  console.log(`SEE-05 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
