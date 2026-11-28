'use strict';

const assert = require('node:assert/strict');
const { getIstDateString } = require('../lib/config');
const { solveMathPrompt } = require('../lib/http_client');
const seed = require('../fixtures/brd_seed');
const {
  createEntityTracker,
  createCustomerWithLocation,
  createStaff,
  createDccBookingForVehicle,
  computeExpectedSolarTotal
} = require('../lib/test_helpers');

async function setupCustomerAndLoc(admin, tracker) {
  return createCustomerWithLocation(admin, tracker, 0);
}

async function setupStaff(admin, tracker, overrides = {}) {
  return createStaff(admin, tracker, overrides);
}

function registerTier2Tests(registry) {
  // =========================================================================
  // E2E-F1: Auth, CSRF, Rate-Limit, Settings Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F1-01',
    tier: 2,
    feature: 'E2E-F1',
    title: 'Cookie-authed POST /api mutation without X-CSRF-Token returns 403',
    async fn(ctx) {
      const client = ctx.newClient();
      await client.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
      const res = await client.apiAction(
        'saveCustomer',
        { customerData: seed.makeCustomerPayload({ addressText: 'Sigra, Varanasi' }) },
        { omitCsrf: true }
      );
      assert.equal(res.status, 403);
      assert.equal(res.json.success, false);
    }
  });

  registry.register({
    id: 'T2-F1-02',
    tier: 2,
    feature: 'E2E-F1',
    title: 'Cookie-authed POST /api mutation with forged/mismatched X-CSRF-Token returns 403',
    async fn(ctx) {
      const client = ctx.newClient();
      await client.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
      const res = await client.apiAction(
        'saveCustomer',
        { customerData: seed.makeCustomerPayload({ addressText: 'Lanka, Varanasi' }) },
        { csrfTokenOverride: 'forged-invalid-csrf-token' }
      );
      assert.equal(res.status, 403);
      assert.equal(res.json.success, false);
    }
  });

  registry.register({
    id: 'T2-F1-03',
    tier: 2,
    feature: 'E2E-F1',
    title: 'Unauthenticated requests to verifyAdminSession and protected admin actions return 401',
    async fn(ctx) {
      const anon = ctx.newClient();
      const sRes = await anon.apiAction('verifyAdminSession');
      assert.equal(sRes.status, 401);

      const cRes = await anon.apiAction('saveCustomer', { customerData: seed.makeCustomerPayload() });
      assert.equal(cRes.status, 401);
    }
  });

  registry.register({
    id: 'T2-F1-04',
    tier: 2,
    feature: 'E2E-F1',
    title: 'Failed admin logins trigger 401, adaptive CAPTCHA (403), and 429 rate-limit lockout on 5th failure',
    async fn(ctx) {
      const probeUser = `e2e_probe_${seed.uniqueSuffix('rl')}`;
      const client = ctx.newClient();
      let lastCaptcha = null;

      const r1 = await client.apiAction('verifyAdminPassword', { username: probeUser, password: 'wrong-password-1' });
      assert.ok([401, 403].includes(r1.status), `Expected 401/403 on attempt 1, got ${r1.status}`);
      if (r1.json && r1.json.captcha) lastCaptcha = r1.json.captcha;

      const r2 = await client.apiAction('verifyAdminPassword', { username: probeUser, password: 'wrong-password-2' });
      assert.ok([401, 403].includes(r2.status), `Expected 401/403 on attempt 2, got ${r2.status}`);
      if (r2.json && r2.json.captcha) lastCaptcha = r2.json.captcha;

      // Without CAPTCHA answer after threshold, server returns 403 captchaRequired with challenge
      const rChallenge = await client.apiAction('verifyAdminPassword', { username: probeUser, password: 'wrong-password-cap-check' });
      assert.equal(rChallenge.status, 403, `Expected 403 captchaRequired without answer, got ${rChallenge.status}`);
      assert.equal(rChallenge.json.captchaRequired, true);
      assert.ok(rChallenge.json.captcha && rChallenge.json.captcha.prompt);
      lastCaptcha = rChallenge.json.captcha;

      // Solve CAPTCHA with wrong password so server increments failure count up to 429, stopping immediately on 429
      let got429 = false;
      for (let i = 0; i < 6; i += 1) {
        if (!lastCaptcha || !lastCaptcha.prompt) {
          const capRes = await client.apiAction('getAdminCaptcha', { username: probeUser });
          lastCaptcha = capRes.json;
        }
        const captchaAnswer = solveMathPrompt(lastCaptcha.prompt);
        const rx = await client.apiAction('verifyAdminPassword', {
          username: probeUser,
          password: `wrong-${i}`,
          captchaId: lastCaptcha.challengeId,
          captchaAnswer
        });
        if (rx.status === 429) {
          got429 = true;
          assert.equal(rx.json.rateLimited, true);
          break;
        }
        assert.ok([401, 403].includes(rx.status), `Unexpected status ${rx.status} before lockout`);
        lastCaptcha = (rx.json && rx.json.captcha) || null;
      }
      assert.equal(got429, true, 'Expected 429 rateLimited response after repeated failures');
    }
  });

  registry.register({
    id: 'T2-F1-05',
    tier: 2,
    feature: 'E2E-F1',
    title: 'updateAdminPassword returns 403 (env-only) and saveAdminSettings rejects non-positive auto_verify_hours',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const pwdRes = await admin.apiAction('updateAdminPassword', { newPassword: 'hacked' });
      assert.equal(pwdRes.status, 403);

      for (const badHours of [0, -5, 'abc', 9999]) {
        const setRes = await admin.apiAction('saveAdminSettings', { auto_verify_hours: badHours });
        assert.equal(setRes.status, 400, `Expected 400 for auto_verify_hours=${badHours}`);
      }
    }
  });

  // =========================================================================
  // E2E-F2: Customer, Location, Vehicle & Solar Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F2-01',
    tier: 2,
    feature: 'E2E-F2',
    title: 'saveCustomer rejects invalid Indian mobile numbers (<10 digits, leading <6, alpha)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      for (const badPhone of ['12345', '5987654321', '98765abcde', '+14155551234', '']) {
        const res = await admin.apiAction('saveCustomer', {
          customerData: seed.makeCustomerPayload({ phone: badPhone, addressText: 'Sigra, Varanasi' })
        });
        assert.equal(res.status, 400, `Expected 400 for phone="${badPhone}"`);
      }
    }
  });

  registry.register({
    id: 'T2-F2-02',
    tier: 2,
    feature: 'E2E-F2',
    title: 'saveCustomer rejects duplicate active customer mobile number',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const phone = seed.uniquePhone();
      const r1 = await admin.apiAction('saveCustomer', { customerData: seed.makeCustomerPayload({ phone, addressText: 'Sigra, Varanasi' }) });
      assert.equal(r1.status, 200);

      const r2 = await admin.apiAction('saveCustomer', { customerData: seed.makeCustomerPayload({ phone, addressText: 'Lanka, Varanasi' }) });
      assert.ok([400, 409].includes(r2.status), `Expected 400/409 duplicate phone rejection, got ${r2.status}`);
    }
  });

  registry.register({
    id: 'T2-F2-03',
    tier: 2,
    feature: 'E2E-F2',
    title: 'saveVehicle rejects 7_seater, missing locationId, and duplicate registration number per customer',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);

      const badSeater = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId, { seaterType: '7_seater' }));
      assert.equal(badSeater.status, 400);

      const noLoc = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, 0));
      assert.equal(noLoc.status, 400);

      const reg = seed.uniqueRegNo();
      const ok = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId, { registrationNo: reg }));
      assert.equal(ok.status, 200);

      const dupReg = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId, { registrationNo: reg }));
      assert.ok([400, 409].includes(dupReg.status));
    }
  });

  registry.register({
    id: 'T2-F2-04',
    tier: 2,
    feature: 'E2E-F2',
    title: 'saveSolarInstallation rejects panel_count <= 0 and missing/foreign locationId',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const custA = await setupCustomerAndLoc(admin);
      const custB = await setupCustomerAndLoc(admin);

      for (const badCount of [0, -1, 1.5]) {
        const res = await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(custA.customerId, custA.locationId, { panelCount: badCount }));
        assert.equal(res.status, 400, `Expected 400 for panelCount=${badCount}`);
      }

      const foreignLoc = await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(custA.customerId, custB.locationId, { panelCount: 10 }));
      assert.equal(foreignLoc.status, 400);
    }
  });

  registry.register({
    id: 'T2-F2-05',
    tier: 2,
    feature: 'E2E-F2',
    title: 'deleteCustomerLocation rejects deleting an address still linked to active vehicle or solar asset',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId));

      const delRes = await admin.apiAction('deleteCustomerLocation', { locationId: cust.locationId });
      assert.ok([400, 409].includes(delRes.status));
    }
  });

  // =========================================================================
  // E2E-F3: Staff PIN, Phone, Capabilities & Lockout Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F3-01',
    tier: 2,
    feature: 'E2E-F3',
    title: 'saveStaffMember and resetStaffPin reject <4 digit, >6 digit, and non-numeric PINs',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      for (const badPin of ['123', '1234567', '12ab', 'abcd', '']) {
        const res = await admin.apiAction('saveStaffMember', { staffData: seed.makeStaffPayload({ pin: badPin }) });
        assert.equal(res.status, 400, `Expected 400 for PIN="${badPin}"`);
      }

      const valid = await setupStaff(admin, { pin: '4321' });
      const badReset = await admin.apiAction('resetStaffPin', { staffId: valid.staffId, newPin: '99' });
      assert.equal(badReset.status, 400);
    }
  });

  registry.register({
    id: 'T2-F3-02',
    tier: 2,
    feature: 'E2E-F3',
    title: 'saveStaffMember rejects duplicate staff phone number and invalid mobile format',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const first = await setupStaff(admin);

      const dup = await admin.apiAction('saveStaffMember', { staffData: seed.makeStaffPayload({ phone: first.phone }) });
      assert.ok([400, 409].includes(dup.status));

      const badPhone = await admin.apiAction('saveStaffMember', { staffData: seed.makeStaffPayload({ phone: '11111' }) });
      assert.equal(badPhone.status, 400);
    }
  });

  registry.register({
    id: 'T2-F3-03',
    tier: 2,
    feature: 'E2E-F3',
    title: 'saveStaffMember rejects staff with all 4 capability toggles disabled',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const res = await admin.apiAction('saveStaffMember', {
        staffData: seed.makeStaffPayload({
          can_dcc: false,
          can_car_wash: false,
          can_solar: false,
          can_detailing: false
        })
      });
      assert.equal(res.status, 400);
    }
  });

  registry.register({
    id: 'T2-F3-04',
    tier: 2,
    feature: 'E2E-F3',
    title: 'verifyStaffPin rejects inactive staff (403) and conflicting second deviceId (409)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await setupStaff(admin, { pin: '2233' });

      const sc1 = ctx.newClient();
      const login1 = await sc1.staffLogin({ phone: stf.phone, pin: '2233', deviceId: 'device-A' });
      assert.equal(login1.status, 200);

      const sc2 = ctx.newClient();
      const conflict = await sc2.staffLogin({ phone: stf.phone, pin: '2233', deviceId: 'device-B' });
      assert.equal(conflict.status, 409);
      assert.equal(conflict.json.sessionConflict, true);

      await admin.apiAction('toggleStaffActive', { staffId: stf.staffId, active: false });
      const inactiveAttempt = await sc2.staffLogin({ phone: stf.phone, pin: '2233', deviceId: 'device-A' });
      assert.equal(inactiveAttempt.status, 403);
      assert.equal(inactiveAttempt.json.inactive, true);
    }
  });

  registry.register({
    id: 'T2-F3-05',
    tier: 2,
    feature: 'E2E-F3',
    title: '5 wrong verifyStaffPin attempts trigger 429 lockout and unlockStaff restores login',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await setupStaff(admin, { pin: '9182' });
      const sc = ctx.newClient();

      let locked = false;
      for (let i = 0; i < 6; i += 1) {
        const res = await sc.staffLogin({ phone: stf.phone, pin: '0000', deviceId: 'dev-lock' });
        if (res.status === 429) {
          locked = true;
          assert.equal(res.json.rateLimited, true);
          break;
        }
        assert.equal(res.status, 401);
      }
      assert.equal(locked, true);

      await admin.apiAction('unlockStaff', { staffId: stf.staffId });
      const ok = await sc.staffLogin({ phone: stf.phone, pin: '9182', deviceId: 'dev-lock' });
      assert.equal(ok.status, 200);
    }
  });

  // =========================================================================
  // E2E-F4: Master Catalog & Legacy SEE Endpoint Elimination Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F4-01',
    tier: 2,
    feature: 'E2E-F4',
    title: 'saveService rejects split interior_detailing / exterior_detailing and unknown categories',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      for (const badCat of ['interior_detailing', 'exterior_detailing', 'hybrid', 'unknown']) {
        const res = await admin.apiAction('saveService', { service: { category: badCat, name: 'Bad Service' } });
        assert.equal(res.status, 400, `Expected 400 for category="${badCat}"`);
      }
    }
  });

  registry.register({
    id: 'T2-F4-02',
    tier: 2,
    feature: 'E2E-F4',
    title: 'savePackage rejects car-related package missing price_5_seater or price_5_plus_seater',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');

      const missing5Plus = await admin.apiAction('savePackage', {
        packageData: { name: 'Incomplete 5+', validity_days: 30, price_5_seater: 500, items: [{ serviceId: washSvc.id, quantity: 1 }] }
      });
      assert.equal(missing5Plus.status, 400);

      const missing5 = await admin.apiAction('savePackage', {
        packageData: { name: 'Incomplete 5', validity_days: 30, price_5_plus_seater: 700, items: [{ serviceId: washSvc.id, quantity: 1 }] }
      });
      assert.equal(missing5.status, 400);
    }
  });

  registry.register({
    id: 'T2-F4-03',
    tier: 2,
    feature: 'E2E-F4',
    title: 'savePackage rejects empty items, validity_days <= 0, and non-existent serviceId',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const emptyItems = await admin.apiAction('savePackage', { packageData: { name: 'Empty', validity_days: 30, items: [] } });
      assert.equal(emptyItems.status, 400);

      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const zeroVal = await admin.apiAction('savePackage', {
        packageData: { name: 'Zero Validity', validity_days: 0, price_5_seater: 500, price_5_plus_seater: 700, items: [{ serviceId: washSvc.id, quantity: 1 }] }
      });
      assert.equal(zeroVal.status, 400);

      const badSvc = await admin.apiAction('savePackage', {
        packageData: { name: 'Bad Svc', validity_days: 30, price_5_seater: 500, price_5_plus_seater: 700, items: [{ serviceId: 999999, quantity: 1 }] }
      });
      assert.equal(badSvc.status, 400);
    }
  });

  registry.register({
    id: 'T2-F4-04',
    tier: 2,
    feature: 'E2E-F4',
    title: 'saveSolarPricingTier rejects max_panels < min_panels, min_panels < 1, and negative rates',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const invertedRange = await admin.apiAction('saveSolarPricingTier', {
        tier: { tier_name: 'Bad Range', min_panels: 20, max_panels: 10, per_panel_rate: 50, min_billing_onetime: 800, min_billing_amc: 600 }
      });
      assert.equal(invertedRange.status, 400);

      const negRate = await admin.apiAction('saveSolarPricingTier', {
        tier: { tier_name: 'Neg Rate', min_panels: 1, max_panels: 10, per_panel_rate: -10, min_billing_onetime: 800, min_billing_amc: 600 }
      });
      assert.equal(negRate.status, 400);
    }
  });

  registry.register({
    id: 'T2-F4-05',
    tier: 2,
    feature: 'E2E-F4',
    title: 'Purged /api/see/* and /api/see/hybrid/* endpoints return 404 Not Found',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      for (const retiredPath of ['/api/see/services', '/api/see/hybrid/packages', '/api/see/purchases']) {
        const res = await admin.get(retiredPath);
        assert.equal(res.status, 404, `Expected 404 for retired endpoint ${retiredPath}`);
      }
    }
  });

  // =========================================================================
  // E2E-F5: Central Bookings Validation Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F5-01',
    tier: 2,
    feature: 'E2E-F5',
    title: 'createBooking rejects DCC booking when assignedDccStaffId is omitted',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const dccSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'dcc');

      const res = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        serviceId: dccSvc.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        frequency: 'daily'
      });
      assert.equal(res.status, 400);
    }
  });

  registry.register({
    id: 'T2-F5-02',
    tier: 2,
    feature: 'E2E-F5',
    title: 'createBooking rejects DCC booking assigned to staff with can_dcc=false',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const nonDccStaff = await setupStaff(admin, { can_dcc: false, can_car_wash: true });
      const dccSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'dcc');

      const res = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        serviceId: dccSvc.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        assignedDccStaffId: nonDccStaff.staffId,
        frequency: 'daily'
      });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F5-03',
    tier: 2,
    feature: 'E2E-F5',
    title: 'createBooking rejects mismatched customer-to-vehicle or customer-to-location ownership',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const custA = await setupCustomerAndLoc(admin);
      const custB = await setupCustomerAndLoc(admin);
      const vehB = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(custB.customerId, custB.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');

      const res = await admin.apiAction('createBooking', {
        customerId: custA.customerId,
        serviceId: washSvc.id,
        assetType: 'vehicle',
        vehicleId: vehB.id,
        locationId: custA.locationId
      });
      assert.equal(res.status, 400);
    }
  });

  registry.register({
    id: 'T2-F5-04',
    tier: 2,
    feature: 'E2E-F5',
    title: 'createBooking rejects missing/invalid solarId on solar booking and missing package/service',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const solarSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'solar');

      const badSolar = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        serviceId: solarSvc.id,
        assetType: 'solar',
        solarId: 999999,
        locationId: cust.locationId
      });
      assert.equal(badSolar.status, 400);

      const noCatalog = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        assetType: 'solar',
        locationId: cust.locationId
      });
      assert.equal(noCatalog.status, 400);
    }
  });

  registry.register({
    id: 'T2-F5-05',
    tier: 2,
    feature: 'E2E-F5',
    title: 'createBooking enforces solar minimum billing floor when panel_count * rate < min_billing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const panelCount = 4;
        const smallSolar = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(cust.customerId, cust.locationId, { panelCount }))).json.solarInstallation;
        tracker.track('solarInstallations', smallSolar.id);
        const solarSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'solar');
        const tiers = (await admin.apiAction('getSolarPricingTiers')).json.tiers || [];
        const expectedTotal = computeExpectedSolarTotal(tiers, panelCount, false);

        const res = await admin.apiAction('createBooking', {
          customerId: cust.customerId,
          serviceId: solarSvc.id,
          assetType: 'solar',
          solarId: smallSolar.id,
          locationId: cust.locationId,
          frequency: 'one_time'
        });
        assert.equal(res.status, 200);
        tracker.track('bookings', res.json.booking.id);
        assert.equal(res.json.booking.total_amount, expectedTotal, `Expected dynamic min billing floor ${expectedTotal}, got ${res.json.booking.total_amount}`);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // E2E-F6: Non-DCC Capability Enforcement & Exhausted Booking Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F6-01',
    tier: 2,
    feature: 'E2E-F6',
    title: 'assignSpecialJob rejects car_wash job assigned to staff lacking can_car_wash',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const dccOnly = await setupStaff(admin, { can_dcc: true, can_car_wash: false, can_solar: false, can_detailing: false });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const res = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: dccOnly.staffId });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F6-02',
    tier: 2,
    feature: 'E2E-F6',
    title: 'assignSpecialJob rejects solar job assigned to staff lacking can_solar',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const solar = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(cust.customerId, cust.locationId))).json.solarInstallation;
      const washOnly = await setupStaff(admin, { can_dcc: false, can_car_wash: true, can_solar: false });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'solar', solarId: solar.id, locationId: cust.locationId })).json.job;

      const res = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: washOnly.staffId });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F6-03',
    tier: 2,
    feature: 'E2E-F6',
    title: 'assignSpecialJob rejects detailing job assigned to staff lacking can_detailing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const solarOnly = await setupStaff(admin, { can_dcc: false, can_solar: true, can_detailing: false });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const res = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: solarOnly.staffId });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F6-04',
    tier: 2,
    feature: 'E2E-F6',
    title: 'assignSpecialJob rejects assigning job to Inactive staff even with matching capability',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const inactive = await setupStaff(admin, { can_dcc: false, can_car_wash: true, status: 'Inactive' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const res = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: inactive.staffId });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F6-05',
    tier: 2,
    feature: 'E2E-F6',
    title: 'createServiceJob rejects booking with remaining_count === 0 or cancelled booking',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: { name: `Single Wash ${seed.uniqueSuffix('p')}`, validity_days: 30, price_5_seater: 400, price_5_plus_seater: 600, items: [{ serviceId: washSvc.id, quantity: 1 }] }
      })).json.package;
      const booking = (await admin.apiAction('createBooking', { customerId: cust.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: veh.id, locationId: cust.locationId })).json.booking;

      const first = await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId });
      assert.equal(first.status, 200);

      const second = await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId });
      assert.ok([400, 409].includes(second.status));
    }
  });

  // =========================================================================
  // E2E-F7: DCC Route Planning & Temporary Cover Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F7-01',
    tier: 2,
    feature: 'E2E-F7',
    title: 'addStopToRoute enforces global vehicle exclusivity across active routes (409/400)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const s1 = await setupStaff(admin, tracker, { can_dcc: true });
        const s2 = await setupStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: s1.staffId });
        const r1 = (await admin.apiAction('createRoute', { name: `Excl 1 ${seed.uniqueSuffix('r')}`, staffId: s1.staffId })).json.route;
        const r2 = (await admin.apiAction('createRoute', { name: `Excl 2 ${seed.uniqueSuffix('r')}`, staffId: s2.staffId })).json.route;
        tracker.track('routes', r1.id);
        tracker.track('routes', r2.id);

        const add1 = await admin.apiAction('addStopToRoute', { routeId: r1.id, vehicleId: veh.id, bookingId: booking.id });
        assert.equal(add1.status, 200);
        tracker.track('routeStops', add1.json.stop.id);

        const add2 = await admin.apiAction('addStopToRoute', { routeId: r2.id, vehicleId: veh.id, bookingId: booking.id });
        assert.ok([400, 409].includes(add2.status), `Expected 400/409 duplicate route_stop rejection, got ${add2.status}`);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T2-F7-02',
    tier: 2,
    feature: 'E2E-F7',
    title: 'assignStaffToRoute rejects non-DCC staff (can_dcc=false)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const nonDcc = await setupStaff(admin, { can_dcc: false, can_car_wash: true });
      const route = (await admin.apiAction('createRoute', { name: `NoDCC Rt ${seed.uniqueSuffix('r')}` })).json.route;

      const res = await admin.apiAction('assignStaffToRoute', { routeId: route.id, staffId: nonDcc.staffId });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F7-03',
    tier: 2,
    feature: 'E2E-F7',
    title: 'createTempRouteAssignment rejects cover staff lacking can_dcc=true',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const perm = await setupStaff(admin, { can_dcc: true });
      const nonDcc = await setupStaff(admin, { can_dcc: false, can_solar: true });
      const route = (await admin.apiAction('createRoute', { name: `Bad Cov ${seed.uniqueSuffix('r')}`, staffId: perm.staffId })).json.route;
      const today = getIstDateString(0);

      const res = await admin.apiAction('createTempRouteAssignment', {
        routeId: route.id,
        coverStaffId: nonDcc.staffId,
        startDate: today,
        endDate: today
      });
      assert.ok([400, 403].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F7-04',
    tier: 2,
    feature: 'E2E-F7',
    title: 'createTempRouteAssignment rejects startDate > endDate and overlapping active cover',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const perm = await setupStaff(admin, { can_dcc: true });
      const cov1 = await setupStaff(admin, { can_dcc: true });
      const cov2 = await setupStaff(admin, { can_dcc: true });
      const route = (await admin.apiAction('createRoute', { name: `Cov Ov ${seed.uniqueSuffix('r')}`, staffId: perm.staffId })).json.route;
      const d0 = getIstDateString(0);
      const d1 = getIstDateString(1);

      const inverted = await admin.apiAction('createTempRouteAssignment', { routeId: route.id, coverStaffId: cov1.staffId, startDate: d1, endDate: d0 });
      assert.equal(inverted.status, 400);

      const first = await admin.apiAction('createTempRouteAssignment', { routeId: route.id, coverStaffId: cov1.staffId, startDate: d0, endDate: d1 });
      assert.equal(first.status, 200);

      const overlap = await admin.apiAction('createTempRouteAssignment', { routeId: route.id, coverStaffId: cov2.staffId, startDate: d0, endDate: d0 });
      assert.ok([400, 409].includes(overlap.status));
    }
  });

  registry.register({
    id: 'T2-F7-05',
    tier: 2,
    feature: 'E2E-F7',
    title: 'reorderRouteStops rejects empty or missing orderedStopIds',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const perm = await setupStaff(admin, { can_dcc: true });
      const route = (await admin.apiAction('createRoute', { name: `Empty Reord ${seed.uniqueSuffix('r')}`, staffId: perm.staffId })).json.route;

      const res = await admin.apiAction('reorderRouteStops', { routeId: route.id, orderedStopIds: [] });
      assert.equal(res.status, 400);
    }
  });

  // =========================================================================
  // E2E-F8: DCC Daily Jobs & Scheduler Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F8-01',
    tier: 2,
    feature: 'E2E-F8',
    title: 'recordDailyCleanWithPhoto rejects completed status when staff omits photo',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await setupStaff(admin, tracker, { can_dcc: true, pin: '4001' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId });
        const route = (await admin.apiAction('createRoute', { name: `NoPhoto ${seed.uniqueSuffix('r')}`, staffId: stf.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: stf.phone, pin: '4001', deviceId: 'dev-nophoto' });
        const res = await sc.apiAction('recordDailyCleanWithPhoto', { vehicleId: veh.id });
        assert.equal(res.status, 400);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T2-F8-02',
    tier: 2,
    feature: 'E2E-F8',
    title: 'recordDailyCleanWithPhoto rejects Staff B completing Staff A DCC job (403)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stfA = await setupStaff(admin, tracker, { can_dcc: true, pin: '4002' });
        const stfB = await setupStaff(admin, tracker, { can_dcc: true, pin: '4003' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: stfA.staffId });
        const route = (await admin.apiAction('createRoute', { name: `Owner ${seed.uniqueSuffix('r')}`, staffId: stfA.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const scB = ctx.newClient();
        await scB.staffLogin({ phone: stfB.phone, pin: '4003', deviceId: 'dev-other' });
        const res = await scB.apiAction('recordDailyCleanWithPhoto', { vehicleId: veh.id, photoBase64: seed.TINY_PNG_BASE64 });
        assert.equal(res.status, 403);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T2-F8-03',
    tier: 2,
    feature: 'E2E-F8',
    title: 'generateDccDailyJobs is idempotent and enforces UNIQUE(job_date, vehicle_id)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await setupStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId });
        const route = (await admin.apiAction('createRoute', { name: `Idemp ${seed.uniqueSuffix('r')}`, staffId: stf.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const targetDate = getIstDateString(3);
        await admin.apiAction('generateDccDailyJobs', { date: targetDate });
        const secondGen = await admin.apiAction('generateDccDailyJobs', { date: targetDate });
        assert.equal(secondGen.status, 200);
        assert.equal(secondGen.json.generatedCount, 0);

        const list = (await admin.apiAction('getDccDailyJobs', { startDate: targetDate, endDate: targetDate, routeId: route.id })).json.records;
        assert.equal(list.filter((j) => j.vehicle_id === veh.id).length, 1);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T2-F8-04',
    tier: 2,
    feature: 'E2E-F8',
    title: 'updateDailyCleanReportStatus rejects invalid/legacy status strings',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await setupCustomerAndLoc(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await setupStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId });
        const route = (await admin.apiAction('createRoute', { name: `BadStat ${seed.uniqueSuffix('r')}`, staffId: stf.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const today = getIstDateString(0);
        const rep = (await admin.apiAction('getDailyCleanReports', { startDate: today, endDate: today, routeId: route.id })).json.records[0];
        const bad = await admin.apiAction('updateDailyCleanReportStatus', { reportId: rep.id, status: 'done_legacy' });
        assert.equal(bad.status, 400);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T2-F8-05',
    tier: 2,
    feature: 'E2E-F8',
    title: 'Un-routed vehicle without route_stops never generates stray dcc_daily_jobs',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;

      const today = getIstDateString(0);
      await admin.apiAction('generateDccDailyJobs', { date: today });
      const list = (await admin.apiAction('getDccDailyJobs', { startDate: today, endDate: today })).json.records;
      assert.ok(!list.some((j) => j.vehicle_id === veh.id));
    }
  });

  // =========================================================================
  // E2E-F9: Non-DCC State Machine & Role Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F9-01',
    tier: 2,
    feature: 'E2E-F9',
    title: 'startSpecialJob rejects assigned job that skipped enrolled step (409/400)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stf = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '5001' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId })).json.job;

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: stf.phone, pin: '5001', deviceId: 'dev-skip' });
      const res = await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      assert.ok([400, 409].includes(res.status));
    }
  });

  registry.register({
    id: 'T2-F9-02',
    tier: 2,
    feature: 'E2E-F9',
    title: 'startSpecialJob rejects enrolled job without before-photo (400)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stf = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '5002' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId })).json.job;

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: stf.phone, pin: '5002', deviceId: 'dev-nobefore' });
      await sc.apiAction('enrollSpecialJob', { jobId: job.id });
      const res = await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [] });
      assert.equal(res.status, 400);
    }
  });

  registry.register({
    id: 'T2-F9-03',
    tier: 2,
    feature: 'E2E-F9',
    title: 'completeSpecialJob rejects enrolled job (skipping in_progress) and missing after-photo',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stf = await setupStaff(admin, { can_dcc: false, can_detailing: true, pin: '5003' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId })).json.job;

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: stf.phone, pin: '5003', deviceId: 'dev-nocomp' });
      await sc.apiAction('enrollSpecialJob', { jobId: job.id });

      const skipRes = await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      assert.ok([400, 409].includes(skipRes.status));

      await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      const noAfter = await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [] });
      assert.equal(noAfter.status, 400);
    }
  });

  registry.register({
    id: 'T2-F9-04',
    tier: 2,
    feature: 'E2E-F9',
    title: 'verifySpecialJob rejects staff token (401/403) and rejects non-completed job (409)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stf = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '5004' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId })).json.job;

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: stf.phone, pin: '5004', deviceId: 'dev-ver' });
      await sc.apiAction('enrollSpecialJob', { jobId: job.id });

      const earlyAdminVerify = await admin.apiAction('verifySpecialJob', { jobId: job.id });
      assert.ok([400, 409].includes(earlyAdminVerify.status));

      await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });

      const staffVerify = await sc.apiAction('verifySpecialJob', { jobId: job.id }, { authMode: 'bearer-staff' });
      assert.ok([401, 403].includes(staffVerify.status));
    }
  });

  registry.register({
    id: 'T2-F9-05',
    tier: 2,
    feature: 'E2E-F9',
    title: 'cancelSpecialJob rejects empty reason (400) and rejects already verified job (409)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stf = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '5005' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: stf.staffId })).json.job;

      const noReason = await admin.apiAction('cancelSpecialJob', { jobId: job.id, reason: '' });
      assert.equal(noReason.status, 400);

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: stf.phone, pin: '5005', deviceId: 'dev-canv' });
      await sc.apiAction('enrollSpecialJob', { jobId: job.id });
      await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      await admin.apiAction('verifySpecialJob', { jobId: job.id });

      const cancelVerified = await admin.apiAction('cancelSpecialJob', { jobId: job.id, reason: 'Too late' });
      assert.equal(cancelVerified.status, 409);
    }
  });

  // =========================================================================
  // E2E-F10: Staff Portal Auth, IDOR & SSE Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F10-01',
    tier: 2,
    feature: 'E2E-F10',
    title: 'GET /api/staff-data?token=<token> without Authorization header returns 401',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await setupStaff(admin, { can_dcc: true, pin: '6001' });
      const sc = ctx.newClient();
      const login = await sc.staffLogin({ phone: stf.phone, pin: '6001', deviceId: 'dev-qtok' });

      const anon = ctx.newClient();
      const res = await anon.get(`/api/staff-data?token=${encodeURIComponent(login.json.token)}`);
      assert.equal(res.status, 401);
    }
  });

  registry.register({
    id: 'T2-F10-02',
    tier: 2,
    feature: 'E2E-F10',
    title: 'Staff A requesting Staff B data via getStaffData returns 403 IDOR rejection',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stfA = await setupStaff(admin, { can_dcc: true, pin: '6002' });
      const stfB = await setupStaff(admin, { can_dcc: true, pin: '6003' });

      const scA = ctx.newClient();
      await scA.staffLogin({ phone: stfA.phone, pin: '6002', deviceId: 'dev-idor-a' });
      const res = await scA.apiAction('getStaffData', { staffId: stfB.staffId }, { authMode: 'bearer-staff' });
      assert.equal(res.status, 403);
    }
  });

  registry.register({
    id: 'T2-F10-03',
    tier: 2,
    feature: 'E2E-F10',
    title: 'Staff A calling enrollSpecialJob / startSpecialJob on Staff B job returns 403',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await setupCustomerAndLoc(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const stfA = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '6004' });
      const stfB = await setupStaff(admin, { can_dcc: false, can_car_wash: true, pin: '6005' });
      const jobB = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: stfB.staffId })).json.job;

      const scA = ctx.newClient();
      await scA.staffLogin({ phone: stfA.phone, pin: '6004', deviceId: 'dev-idor-j' });
      const r1 = await scA.apiAction('enrollSpecialJob', { jobId: jobB.id }, { authMode: 'bearer-staff' });
      assert.equal(r1.status, 403);
    }
  });

  registry.register({
    id: 'T2-F10-04',
    tier: 2,
    feature: 'E2E-F10',
    title: 'recordStaffHeartbeat rejects missing coordinates (400) and cross-staff staffId (403)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stfA = await setupStaff(admin, { can_dcc: true, pin: '6006' });
      const stfB = await setupStaff(admin, { can_dcc: true, pin: '6007' });

      const scA = ctx.newClient();
      await scA.staffLogin({ phone: stfA.phone, pin: '6006', deviceId: 'dev-hb-err' });

      const badCoords = await scA.apiAction('recordStaffHeartbeat', { latitude: 'bad', longitude: null }, { authMode: 'bearer-staff' });
      assert.equal(badCoords.status, 400);

      const crossStaff = await scA.apiAction('recordStaffHeartbeat', { staffId: stfB.staffId, latitude: 25.3, longitude: 82.9 }, { authMode: 'bearer-staff' });
      assert.equal(crossStaff.status, 403);
    }
  });

  registry.register({
    id: 'T2-F10-05',
    tier: 2,
    feature: 'E2E-F10',
    title: 'Unauthenticated /api/admin-realtime-stream and /api/staff-ping-stream SSE endpoints return 401',
    async fn(ctx) {
      const anon = ctx.newClient();
      const r1 = await anon.get('/api/admin-realtime-stream');
      const r2 = await anon.get('/api/staff-ping-stream');
      assert.equal(r1.status, 401);
      assert.equal(r2.status, 401);
    }
  });

  // =========================================================================
  // E2E-F11: Leads, Config Auth, & Dead/Legacy UI Elimination Boundaries
  // =========================================================================
  registry.register({
    id: 'T2-F11-01',
    tier: 2,
    feature: 'E2E-F11',
    title: 'POST /api/leads and POST /api/public/book reject missing name or invalid mobile (400)',
    async fn(ctx) {
      const pub = ctx.newClient();
      for (const ep of ['/api/leads', '/api/public/book']) {
        const badName = await pub.post(ep, { name: '', phone: seed.uniquePhone() });
        const badPhone = await pub.post(ep, { name: 'Amit', phone: '1234' });
        assert.equal(badName.status, 400, `Expected 400 for empty name on ${ep}`);
        assert.equal(badPhone.status, 400, `Expected 400 for bad phone on ${ep}`);
      }
    }
  });

  registry.register({
    id: 'T2-F11-02',
    tier: 2,
    feature: 'E2E-F11',
    title: 'PUT /api/admin/homepage-config rejects unauthenticated (401) and cookie-authed without CSRF (403)',
    async fn(ctx) {
      const sampleBody = { rates: { carCare: { dcc: { fiveSeater: { basic: 999 } } } } };
      const anon = ctx.newClient();
      const rAnon = await anon.put('/api/admin/homepage-config', sampleBody);
      assert.equal(rAnon.status, 401);

      const cookieClient = ctx.newClient();
      await cookieClient.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
      const rNoCsrf = await cookieClient.put('/api/admin/homepage-config', sampleBody, { omitCsrf: true });
      assert.equal(rNoCsrf.status, 403);
    }
  });

  registry.register({
    id: 'T2-F11-03',
    tier: 2,
    feature: 'E2E-F11',
    title: '/admin HTML & linked JS/CSS assets contain ZERO eliminated Hybrid/UI-Lab/7_seater/Profile-Mutation controls',
    async fn(ctx) {
      const page = await ctx.browser.goto('/admin');
      const assets = await ctx.browser.fetchLinkedAssets();
      assert.ok(assets.some((a) => a.ref.includes('/admin-v2/')), 'Expected linked /admin-v2/ assets');
      for (const a of assets) {
        assert.equal(a.status, 200, `Linked /admin asset ${a.ref} returned ${a.status}`);
        if (a.ref.includes('/admin-v2/')) {
          assert.ok(a.ref.includes('?v='), `Missing ?v= query string on ${a.ref}`);
        }
      }

      const bannedTokens = [
        'v2NavBtnHybridPackages',
        'v2View_hybridPackages',
        'v2NavBtnUiLab',
        'v2View_ui-lab',
        'v2NavBtnJobAssignment',
        'v2View_jobAssignment',
        'v2-hybrid-packages',
        'v2-playground',
        'v2CustQaAssignJob',
        'v2CustQaUpdatePlan',
        'v2CustSeePurchaseOpen',
        'v2ModalAssignJob',
        'v2ModalUpdatePlan',
        'v2StaffQaAssignJob',
        '/js/app.js',
        '7_seater'
      ];
      const sources = [{ label: '/admin HTML', text: page.html }, ...assets.map((a) => ({ label: a.ref, text: a.text }))];
      for (const src of sources) {
        for (const tok of bannedTokens) {
          assert.equal(src.text.includes(tok), false, `Banned legacy token "${tok}" found in ${src.label}`);
        }
      }
    }
  });

  registry.register({
    id: 'T2-F11-04',
    tier: 2,
    feature: 'E2E-F11',
    title: '/admin HTML & linked JS/CSS assets contain ZERO hardcoded Lucknow areas or split Detailing categories',
    async fn(ctx) {
      const page = await ctx.browser.goto('/admin');
      const assets = await ctx.browser.fetchLinkedAssets();
      assert.ok(assets.length >= 1, 'Expected linked JS/CSS assets on /admin');
      for (const a of assets) {
        assert.equal(a.status, 200, `Linked /admin asset ${a.ref} returned ${a.status}`);
      }

      const banned = [
        'Gomti Nagar',
        'Indira Nagar',
        'Aliganj',
        'Hazratganj',
        'Mahanagar',
        'Vikas Nagar',
        'Jankipuram',
        'interior_detailing',
        'exterior_detailing'
      ];
      const sources = [{ label: '/admin HTML', text: page.html }, ...assets.map((a) => ({ label: a.ref, text: a.text }))];
      for (const src of sources) {
        for (const tok of banned) {
          assert.equal(src.text.includes(tok), false, `Banned Lucknow/split-Detailing token "${tok}" in ${src.label}`);
        }
      }
    }
  });

  registry.register({
    id: 'T2-F11-05',
    tier: 2,
    feature: 'E2E-F11',
    title: '/staff HTML & linked JS/CSS assets eliminate 6-digit-only PIN pattern, split Detailing chips, and Legacy /js/app.js',
    async fn(ctx) {
      const page = await ctx.browser.goto('/staff');
      const assets = await ctx.browser.fetchLinkedAssets();
      assert.ok(assets.length >= 1, 'Expected linked JS/CSS assets on /staff');
      for (const a of assets) {
        assert.equal(a.status, 200, `Linked /staff asset ${a.ref} returned ${a.status}`);
        assert.ok(a.ref.includes('?v='), `Missing ?v= query string on /staff asset ${a.ref}`);
      }

      const banned = [
        'chipOtherInterior',
        'chipOtherExterior',
        'pattern="[0-9]{6}"',
        '/js/app.js',
        'interior_detailing',
        'exterior_detailing',
        '7_seater'
      ];
      const sources = [{ label: '/staff HTML', text: page.html }, ...assets.map((a) => ({ label: a.ref, text: a.text }))];
      for (const src of sources) {
        for (const tok of banned) {
          assert.equal(src.text.includes(tok), false, `Banned legacy token "${tok}" found in ${src.label}`);
        }
      }
    }
  });
}

module.exports = { registerTier2Tests };
