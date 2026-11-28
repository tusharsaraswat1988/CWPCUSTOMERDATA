'use strict';

const assert = require('node:assert/strict');
const { getIstDateString } = require('../lib/config');
const seed = require('../fixtures/brd_seed');
const {
  createEntityTracker,
  createDccBookingForVehicle,
  computeExpectedSolarTotal,
  makePricePattern,
  loginAdminBrowser,
  loginStaffBrowser
} = require('../lib/test_helpers');

function registerTier4Tests(registry) {
  // =========================================================================
  // S1: Varanasi Morning DCC Dispatch & Alternate-Day Parity
  // =========================================================================
  registry.register({
    id: 'T4-S1',
    tier: 4,
    feature: ['E2E-F1', 'E2E-F2', 'E2E-F3', 'E2E-F4', 'E2E-F5', 'E2E-F7', 'E2E-F8', 'E2E-F10'],
    title: 'S1: Varanasi Morning DCC Dispatch, Route Sequence, Alternate-Day Parity & Staff Punch',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      const today = getIstDateString(0);
      const tomorrow = getIstDateString(1);

      try {
        // 1. Multi-address customer: Sigra (5_seater) + Lanka (5_plus_seater)
        const custRes = await admin.apiAction('saveCustomer', {
          customerData: seed.makeCustomerPayload({
            name: 'Rajeshwar Tiwari',
            addressLabel: 'Home',
            addressText: seed.VARANASI_AREAS[0].addressText,
            latitude: seed.VARANASI_AREAS[0].latitude,
            longitude: seed.VARANASI_AREAS[0].longitude
          })
        });
        assert.equal(custRes.status, 200);
        const customerId = custRes.json.customerId;
        const locSigra = custRes.json.location.id;
        tracker.track('customers', customerId);
        tracker.track('locations', locSigra);

        const locLanka = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(customerId, 1, { isPrimary: false }))).json.location.id;
        tracker.track('locations', locLanka);

        const carSigra = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(customerId, locSigra, { seaterType: '5_seater', carModel: 'Swift' }))).json.vehicle;
        const carLanka = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(customerId, locLanka, { seaterType: '5_plus_seater', carModel: 'Innova' }))).json.vehicle;
        tracker.track('vehicles', carSigra.id);
        tracker.track('vehicles', carLanka.id);

        // 2. Staff with 4-digit PIN + DCC Gold & DCC Alternate packages
        const stf = seed.makeStaffPayload({ name: 'Ramesh Yadav', pin: '4812', can_dcc: true, can_car_wash: true });
        const staffId = (await admin.apiAction('saveStaffMember', { staffData: stf })).json.staffId;
        tracker.track('staff', staffId);

        const svcs = (await admin.apiAction('getServices')).json.services;
        const dccSvc = svcs.find((s) => s.category === 'dcc');
        const washSvc = svcs.find((s) => s.category === 'car_wash');

        const pkgDaily = (await admin.apiAction('savePackage', {
          packageData: {
            name: `DCC Gold S1 ${seed.uniqueSuffix('p')}`,
            validity_days: 30,
            price_5_seater: 1499,
            price_5_plus_seater: 1999,
            items: [{ serviceId: dccSvc.id, quantity: 1, frequency: 'daily' }, { serviceId: washSvc.id, quantity: 2 }]
          }
        })).json.package;
        tracker.track('packages', pkgDaily.id);

        const pkgAlt = (await admin.apiAction('savePackage', {
          packageData: {
            name: `DCC Alt S1 ${seed.uniqueSuffix('p')}`,
            validity_days: 30,
            price_5_seater: 899,
            price_5_plus_seater: 1199,
            items: [{ serviceId: dccSvc.id, quantity: 1, frequency: 'alternate' }]
          }
        })).json.package;
        tracker.track('packages', pkgAlt.id);

        // 3. Central bookings with mandatory DCC staff
        const b1 = (await admin.apiAction('createBooking', {
          customerId, packageId: pkgDaily.id, assetType: 'vehicle', vehicleId: carSigra.id, locationId: locSigra, assignedDccStaffId: staffId, startDate: today
        })).json.booking;
        const b2 = (await admin.apiAction('createBooking', {
          customerId, packageId: pkgAlt.id, assetType: 'vehicle', vehicleId: carLanka.id, locationId: locLanka, assignedDccStaffId: staffId, startDate: today
        })).json.booking;
        tracker.track('bookings', b1.id);
        tracker.track('bookings', b2.id);
        assert.equal(b1.total_amount, 1499);
        assert.equal(b2.total_amount, 1199);

        // 4. Route Planning + drag-and-drop sequence
        const route = (await admin.apiAction('createRoute', { name: `Varanasi South ${seed.uniqueSuffix('rt')}`, area: 'Sigra-Lanka', staffId })).json.route;
        tracker.track('routes', route.id);
        const stop1 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: carSigra.id, bookingId: b1.id })).json.stop;
        const stop2 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: carLanka.id, bookingId: b2.id })).json.stop;
        tracker.track('routeStops', stop1.id);
        tracker.track('routeStops', stop2.id);
        await admin.apiAction('reorderRouteStops', { routeId: route.id, orderedStopIds: [stop2.id, stop1.id] });

        // 5. Generate IST daily jobs for today and tomorrow
        await admin.apiAction('generateDccDailyJobs', { date: today });
        await admin.apiAction('generateDccDailyJobs', { date: tomorrow });

        // 6. Staff logs in with 4-digit PIN, views sequenced feed, punches carLanka completed & carSigra CNA
        const sc = ctx.newClient();
        const login = await sc.staffLogin({ phone: stf.phone, pin: '4812', deviceId: 's1-mobile' });
        assert.equal(login.status, 200);
        const feed = (await sc.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.deepEqual(feed.dailyCarCleaning.map((x) => x.vehicleId), [carLanka.id, carSigra.id]);

        await sc.apiAction('recordDailyCleanWithPhoto', { vehicleId: carLanka.id, photoBase64: seed.TINY_PNG_BASE64, punchLatitude: 25.2797, punchLongitude: 82.9996 }, { authMode: 'bearer-staff' });
        await sc.apiAction('recordDailyCleanWithPhoto', { vehicleId: carSigra.id, carNotPresent: true }, { authMode: 'bearer-staff' });

        // 7. Live Work Status & Tomorrow Alternate Parity check
        const repToday = (await admin.apiAction('getDailyCleanReports', { startDate: today, endDate: today, routeId: route.id })).json;
        assert.equal(repToday.summary.totalCleaned, 1);
        assert.equal(repToday.summary.carNotPresentCount, 1);

        const repTomorrow = (await admin.apiAction('getDccDailyJobs', { startDate: tomorrow, endDate: tomorrow, routeId: route.id })).json.records;
        assert.ok(repTomorrow.some((j) => j.vehicle_id === carSigra.id), 'Daily car should appear tomorrow');
        assert.ok(!repTomorrow.some((j) => j.vehicle_id === carLanka.id), 'Alternate car should skip tomorrow');
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // S2: DCC Staff Absence & Temporary Cover Lifecycle
  // =========================================================================
  registry.register({
    id: 'T4-S2',
    tier: 4,
    feature: ['E2E-F3', 'E2E-F7', 'E2E-F8', 'E2E-F10'],
    title: 'S2: DCC Staff Absence & Temporary Route Cover Lifecycle',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      const today = getIstDateString(0);

      try {
        const custRes = await admin.apiAction('saveCustomer', {
          customerData: seed.makeCustomerPayload({ addressText: seed.VARANASI_AREAS[1].addressText })
        });
        tracker.track('customers', custRes.json.customerId);
        tracker.track('locations', custRes.json.location.id);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(custRes.json.customerId, custRes.json.location.id))).json.vehicle;
        tracker.track('vehicles', veh.id);

        const permData = seed.makeStaffPayload({ name: 'Permanent Mohan', pin: '1122', can_dcc: true });
        const coverData = seed.makeStaffPayload({ name: 'Cover Suresh', pin: '3344', can_dcc: true });
        const permId = (await admin.apiAction('saveStaffMember', { staffData: permData })).json.staffId;
        const coverId = (await admin.apiAction('saveStaffMember', { staffData: coverData })).json.staffId;
        tracker.track('staff', permId);
        tracker.track('staff', coverId);

        const booking = await createDccBookingForVehicle(admin, tracker, {
          customerId: custRes.json.customerId,
          vehicleId: veh.id,
          locationId: custRes.json.location.id,
          staffId: permId
        });

        const route = (await admin.apiAction('createRoute', { name: `Lanka Morning ${seed.uniqueSuffix('rt')}`, staffId: permId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);
        await admin.apiAction('generateDccDailyJobs', { date: today });

        // Assign temporary cover for today
        const cov = (await admin.apiAction('createTempRouteAssignment', {
          routeId: route.id, coverStaffId: coverId, startDate: today, endDate: today, reason: 'Family emergency'
        })).json.assignment;
        tracker.track('tempAssignments', cov.id);

        const routeState = (await admin.apiAction('getAllRoutes')).json.routes.find((r) => r.id === route.id);
        assert.equal(routeState.staff_id, permId, 'Permanent owner must remain intact');
        assert.equal(routeState.active_cover.cover_staff_id, coverId);

        // Cover staff sees route & completes stop
        const scCov = ctx.newClient();
        await scCov.staffLogin({ phone: coverData.phone, pin: '3344', deviceId: 's2-cover' });
        const feed = (await scCov.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.ok(feed.dailyCarCleaning.some((s) => s.vehicleId === veh.id && s.isTempCover === true));

        const punch = await scCov.apiAction('recordDailyCleanWithPhoto', { vehicleId: veh.id, photoBase64: seed.TINY_PNG_BASE64 }, { authMode: 'bearer-staff' });
        assert.equal(punch.status, 200);
        assert.equal(punch.json.job.actual_staff_id, coverId);

        // End cover cleanly; permanent owner remains intact
        await admin.apiAction('endTempRouteAssignment', { assignmentId: cov.id });
        const afterEnd = (await admin.apiAction('getAllRoutes')).json.routes.find((r) => r.id === route.id);
        assert.equal(afterEnd.staff_id, permId);
        assert.equal(afterEnd.active_cover, null);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // S3: Non-DCC 6-Step Lifecycle & Booking Remaining-Count Ledger
  // =========================================================================
  registry.register({
    id: 'T4-S3',
    tier: 4,
    feature: ['E2E-F3', 'E2E-F4', 'E2E-F5', 'E2E-F6', 'E2E-F9', 'E2E-F10'],
    title: 'S3: Non-DCC Car Wash Pack-4 + Add-Ons, 6-Step Lifecycle, Cancel Restore & Auto-Verify Metadata',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();

      try {
        const custRes = await admin.apiAction('saveCustomer', { customerData: seed.makeCustomerPayload({ addressText: seed.VARANASI_AREAS[3].addressText }) });
        const customerId = custRes.json.customerId;
        const locationId = custRes.json.location.id;
        tracker.track('customers', customerId);
        tracker.track('locations', locationId);

        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(customerId, locationId, { seaterType: '5_plus_seater' }))).json.vehicle;
        tracker.track('vehicles', veh.id);

        const washStaffData = seed.makeStaffPayload({ name: 'Wash Specialist', pin: '55667', can_dcc: false, can_car_wash: true });
        const washStaffId = (await admin.apiAction('saveStaffMember', { staffData: washStaffData })).json.staffId;
        tracker.track('staff', washStaffId);

        const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
        const pkg = (await admin.apiAction('savePackage', {
          packageData: { name: `Wash Pack-4 S3 ${seed.uniqueSuffix('p')}`, validity_days: 180, price_5_seater: 1600, price_5_plus_seater: 2200, items: [{ serviceId: washSvc.id, quantity: 4 }] }
        })).json.package;
        tracker.track('packages', pkg.id);

        const addon = (await admin.apiAction('saveAddon', { addon: { name: `Underbody Rinse ${seed.uniqueSuffix('a')}`, price: 200, default_quantity: 1 } })).json.addon;
        tracker.track('addons', addon.id);

        const booking = (await admin.apiAction('createBooking', {
          customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: veh.id, locationId, addons: [{ addonId: addon.id, quantity: 1 }]
        })).json.booking;
        tracker.track('bookings', booking.id);
        assert.equal(booking.total_amount, 2400);
        assert.equal(booking.remaining_count, 4);

        // Job 1: full 6-step lifecycle
        const j1 = (await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId })).json.job;
        tracker.track('serviceJobs', j1.id);
        await admin.apiAction('assignSpecialJob', { jobId: j1.id, staffId: washStaffId });

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: washStaffData.phone, pin: '55667', deviceId: 's3-staff' });
        await sc.apiAction('enrollSpecialJob', { jobId: j1.id }, { authMode: 'bearer-staff' });
        await sc.apiAction('startSpecialJob', { jobId: j1.id, photos: [seed.TINY_PNG_BASE64] }, { authMode: 'bearer-staff' });
        const comp = await sc.apiAction('completeSpecialJob', { jobId: j1.id, photos: [seed.TINY_PNG_BASE64], notes: 'Sparkling clean' }, { authMode: 'bearer-staff' });
        assert.ok(comp.json.job.auto_verify_at);
        await admin.apiAction('verifySpecialJob', { jobId: j1.id });

        // Job 2: created and then cancelled -> remaining_count restored from 2 back to 3
        const j2 = (await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId })).json.job;
        tracker.track('serviceJobs', j2.id);
        assert.equal((await admin.apiAction('getBookings', { customerId })).json.bookings[0].remaining_count, 2);
        await admin.apiAction('cancelSpecialJob', { jobId: j2.id, reason: 'Customer traveling' });
        assert.equal((await admin.apiAction('getBookings', { customerId })).json.bookings[0].remaining_count, 3);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // S4: Solar Panel Tiered AMC + Lead Conversion + VIEW-ONLY Customer Profile
  // =========================================================================
  registry.register({
    id: 'T4-S4',
    tier: 4,
    feature: ['E2E-F2', 'E2E-F3', 'E2E-F4', 'E2E-F5', 'E2E-F6', 'E2E-F11'],
    title: 'S4: Public Lead -> Solar Factory Conversion -> Solar AMC Booking -> VIEW-ONLY Customer Profile',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();

      try {
        const pub = ctx.newClient();
        const leadRes = await pub.post('/api/leads', seed.makeLeadPayload({ name: `Kashi Solar Mills ${seed.uniqueSuffix('ksm')}`, interestedService: 'solar', address: seed.VARANASI_AREAS[2].addressText }));
        assert.equal(leadRes.status, 200);
        tracker.track('leads', leadRes.json.lead.id);

        const conv = (await admin.apiAction('convertLead', {
          leadId: leadRes.json.lead.id,
          convertData: { addressText: seed.VARANASI_AREAS[2].addressText, panelCount: 25, kwLoad: 12.5 }
        })).json;
        assert.ok(conv.customerId);
        tracker.track('customers', conv.customerId);
        if (conv.location) tracker.track('locations', conv.location.id);
        if (conv.solarInstallation) tracker.track('solarInstallations', conv.solarInstallation.id);
        assert.equal(conv.solarInstallation.panel_count, 25);

        const solarStaffData = seed.makeStaffPayload({ name: 'Solar Tech', pin: '654321', can_dcc: false, can_solar: true });
        const solarStaffId = (await admin.apiAction('saveStaffMember', { staffData: solarStaffData })).json.staffId;
        tracker.track('staff', solarStaffId);

        const solarSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'solar');
        let tiers = ((await admin.apiAction('getSolarPricingTiers')).json.tiers || []).filter((t) => t.is_active !== false);
        if (tiers.length === 0) {
          const t1 = (await admin.apiAction('saveSolarPricingTier', {
            tier: { tier_name: `S4 Tier ${seed.uniqueSuffix('t')}`, min_panels: 1, max_panels: null, per_panel_rate: 45, min_billing_onetime: 800, min_billing_amc: 900 }
          })).json.tier;
          tracker.track('solarTiers', t1.id);
          tiers = [t1];
        }
        const expectedAmcTotal = computeExpectedSolarTotal(tiers, 25, true, 12, 'monthly');

        const pkg = (await admin.apiAction('savePackage', {
          packageData: { name: `Solar AMC S4 ${seed.uniqueSuffix('p')}`, validity_days: 365, items: [{ serviceId: solarSvc.id, quantity: 12, frequency: 'monthly', duration_months: 12 }] }
        })).json.package;
        tracker.track('packages', pkg.id);

        const booking = (await admin.apiAction('createBooking', {
          customerId: conv.customerId, packageId: pkg.id, assetType: 'solar', solarId: conv.solarInstallation.id, locationId: conv.location.id
        })).json.booking;
        tracker.track('bookings', booking.id);
        assert.equal(booking.total_amount, expectedAmcTotal);

        const job = (await admin.apiAction('createServiceJob', {
          bookingId: booking.id, customerId: conv.customerId, serviceCategory: 'solar', solarId: conv.solarInstallation.id, locationId: conv.location.id, staffId: solarStaffId
        })).json.job;
        tracker.track('serviceJobs', job.id);
        assert.equal(job.status, 'assigned');

        const prof = (await admin.apiAction('getCustomerProfile', { customerId: conv.customerId })).json.profile;
        assert.equal(prof.viewOnly, true);
        assert.equal(prof.solarInstallations.length, 1);
        assert.equal(prof.bookings.length, 1);

        // Browser/DOM check verifying authenticated Customer Profile is strictly VIEW-ONLY
        await ctx.browser.goto('/admin');
        if (!ctx.browser.isHttpFallback()) {
          await loginAdminBrowser(ctx.browser, ctx.creds);
          await ctx.browser.click('[data-tab="records"]');
          await ctx.browser.waitForSelector('#v2CustTableBody tr', 5000);
          await ctx.browser.evaluate(`
            const rows = Array.from(document.querySelectorAll('#v2CustTableBody tr'));
            const target = rows.find(r => r.textContent.includes('Kashi Solar Mills')) || rows[0];
            if (target) target.click();
          `);
          await ctx.browser.waitForSelector('#v2CustDetailScroll', 5000);
        }

        const dom = await ctx.browser.queryDomSummary();
        assert.equal(dom.consoleErrors.length, 0, `Admin console errors: ${dom.consoleErrors.join('; ')}`);
        assert.ok(dom.elementIds.includes('v2CustDetailScroll'));
        for (const forbiddenBtn of ['v2CustQaAssignJob', 'v2CustQaUpdatePlan', 'v2CustSeePurchaseOpen', 'v2ModalAssignJob', 'v2ModalUpdatePlan']) {
          assert.equal(dom.elementIds.includes(forbiddenBtn), false, `Forbidden mutation control ${forbiddenBtn} found in Customer Profile`);
        }
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // S5: Settings Update -> Public Homepage Dynamic Pricing & Security Center
  // =========================================================================
  registry.register({
    id: 'T4-S5',
    tier: 4,
    feature: ['E2E-F1', 'E2E-F4', 'E2E-F9', 'E2E-F11'],
    title: 'S5: Settings Update -> Public Homepage Dynamic Pricing & Security Center Device Revocation',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const pub = ctx.newClient();
      const initSettings = await admin.apiAction('getAdminSettings');
      const origHours = Number((initSettings.json && initSettings.json.settings && initSettings.json.settings.auto_verify_hours) || 24);
      const origCfgRes = await pub.get('/api/public/homepage-config');
      assert.equal(origCfgRes.status, 200);
      const origRates = JSON.parse(JSON.stringify(origCfgRes.json.rates || {}));

      const updatedDcc5 = 1299;
      const updatedDet5 = 2199;

      const updatedRates = JSON.parse(JSON.stringify(origRates));
      updatedRates.carCare = updatedRates.carCare || {};
      updatedRates.carCare.dcc = updatedRates.carCare.dcc || {};
      updatedRates.carCare.dcc.fiveSeater = updatedRates.carCare.dcc.fiveSeater || {};
      updatedRates.carCare.detailing = updatedRates.carCare.detailing || {};
      updatedRates.carCare.dcc.fiveSeater.basic = updatedDcc5;
      updatedRates.carCare.detailing.interiorDetailingStarts = updatedDet5;

      try {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: 36 });
        const sRes = await admin.apiAction('getAdminSettings');
        assert.equal(sRes.json.settings.auto_verify_hours, 36);

        const cfgRes = await admin.put('/api/admin/homepage-config', { rates: updatedRates });
        assert.equal(cfgRes.status, 200);

        // Revoke secondary device in Security Center
        const secClient = ctx.newClient();
        await secClient.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
        const secOverview = (await admin.apiAction('getAdminSecurityOverview')).json;
        assert.ok(Array.isArray(secOverview.trustedDevices) && secOverview.trustedDevices.length >= 1);
        await admin.apiAction('revokeOtherAdminDevices');

        // Browser/DOM verification of public homepage `/`
        await ctx.browser.goto('/');
        if (!ctx.browser.isHttpFallback()) {
          await ctx.browser.waitForText(makePricePattern(updatedDcc5), 5000);
          const dom = await ctx.browser.queryDomSummary();
          assert.equal(dom.consoleErrors.length, 0, `Homepage console errors: ${dom.consoleErrors.join('; ')}`);
          assert.match(dom.textContent || dom.html, makePricePattern(updatedDcc5));
          assert.match(dom.textContent || dom.html, /Detailing/i);
        } else {
          const dom = await ctx.browser.queryDomSummary();
          assert.ok(dom.scriptSrcs.some((s) => s.includes('home.js')), 'Expected /js/home.js script link on /');
          const pubCfg = (await pub.get('/api/public/homepage-config')).json;
          assert.equal(pubCfg.rates.carCare.dcc.fiveSeater.basic, updatedDcc5);
          assert.equal(pubCfg.rates.carCare.detailing.interiorDetailingStarts, updatedDet5);
          assert.match(dom.html, /Detailing/i);
        }
      } finally {
        await admin.put('/api/admin/homepage-config', { rates: origRates });
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: origHours });
      }
    }
  });

  // =========================================================================
  // S6: Full Portal Hygiene, Legacy Elimination & Staff Tracking Check
  // =========================================================================
  registry.register({
    id: 'T4-S6',
    tier: 4,
    feature: ['E2E-F1', 'E2E-F2', 'E2E-F3', 'E2E-F4', 'E2E-F10', 'E2E-F11'],
    title: 'S6: Full Portal Browser/DOM Hygiene (/admin 11 tabs, /staff mobile, /api/see/* 404) & Live Tracking',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();

      try {
        // 1. /admin DOM + linked JS/CSS asset audit + interactive login & tab traversal
        const adminPage = await ctx.browser.goto('/admin', { viewport: { width: 1280, height: 800 } });
        const adminDom = await ctx.browser.queryDomSummary();
        assert.equal(adminDom.consoleErrors.length, 0, `Admin console errors: ${adminDom.consoleErrors.join('; ')}`);
        assert.equal(adminDom.navTabIds.length, 11, `Expected 11 Admin nav sections, got ${adminDom.navTabIds.length}`);
        assert.equal(adminDom.assetVersionErrors.length, 0, adminDom.assetVersionErrors.join('; '));

        const adminAssets = await ctx.browser.fetchLinkedAssets();
        assert.ok(adminAssets.some((a) => a.ref.includes('/admin-v2/')), 'Expected linked /admin-v2/ JS/CSS assets');
        for (const a of adminAssets) {
          assert.equal(a.status, 200, `Linked /admin asset ${a.ref} returned ${a.status}`);
          if (a.ref.includes('/admin-v2/')) {
            assert.ok(a.ref.includes('?v='), `Missing ?v= cache-buster on ${a.ref}`);
          }
        }

        const adminBanned = [
          'v2NavBtnHybridPackages',
          'v2NavBtnUiLab',
          'v2NavBtnJobAssignment',
          'v2View_jobAssignment',
          'v2-hybrid-packages',
          'v2-playground',
          '/js/app.js',
          '7_seater',
          'Gomti Nagar',
          'Indira Nagar',
          'Hazratganj',
          'Aliganj',
          'Jankipuram',
          'interior_detailing',
          'exterior_detailing'
        ];
        for (const src of [{ label: '/admin HTML', text: adminPage.html }, ...adminAssets.map((a) => ({ label: a.ref, text: a.text }))]) {
          for (const banned of adminBanned) {
            assert.equal(src.text.includes(banned), false, `Found banned token "${banned}" in ${src.label}`);
          }
        }

        if (!ctx.browser.isHttpFallback()) {
          await loginAdminBrowser(ctx.browser, ctx.creds);
          const tabCount = await ctx.browser.evaluate(`
            const btns = Array.from(document.querySelectorAll('#v2Sidebar button[data-tab]'));
            for (const b of btns) b.click();
            return btns.length;
          `);
          assert.equal(tabCount, 11, `Expected 11 clickable Admin V2 tabs, clicked ${tabCount}`);
          const afterTabsDom = await ctx.browser.queryDomSummary();
          assert.equal(afterTabsDom.consoleErrors.length, 0, `Admin tab traversal console errors: ${afterTabsDom.consoleErrors.join('; ')}`);
        }

        // 2. Staff creation + Retired /api/see/* 404 audit + Staff GPS Tracking operational check
        assert.equal((await admin.get('/api/see/services')).status, 404);
        assert.equal((await admin.get('/api/see/hybrid/packages')).status, 404);

        const stfData = seed.makeStaffPayload({ name: 'Tracked Runner', pin: '9090', can_dcc: true });
        const staffId = (await admin.apiAction('saveStaffMember', { staffData: stfData })).json.staffId;
        tracker.track('staff', staffId);

        const sc = ctx.newClient();
        const scLogin = await sc.staffLogin({ phone: stfData.phone, pin: '9090', deviceId: 's6-track' });
        assert.equal(scLogin.status, 200, `Staff API login failed: ${scLogin.text}`);

        await sc.apiAction('recordStaffHeartbeat', { latitude: 25.3119, longitude: 82.9873 }, { authMode: 'bearer-staff' });
        const pingRes = await admin.apiAction('pingStaffLocation', { staffId });
        assert.equal(pingRes.status, 200);
        assert.equal(pingRes.json.success, true);
        assert.equal(pingRes.json.status, 'pending');
        const pingId = pingRes.json.pingId;
        assert.ok(pingId, 'Expected top-level pingId from pingStaffLocation');

        const pendingBefore = (await sc.apiAction('getPendingStaffPings', {}, { authMode: 'bearer-staff' })).json;
        assert.equal(pendingBefore.success, true);
        assert.ok(Array.isArray(pendingBefore.pings) && pendingBefore.pings.some((p) => p.id === pingId), 'Expected pending ping in getPendingStaffPings');

        const resp = await sc.apiAction('respondToLocationPing', { pingId, latitude: 25.3125, longitude: 82.9880 }, { authMode: 'bearer-staff' });
        assert.equal(resp.status, 200);
        assert.equal(resp.json.success, true);
        assert.equal(resp.json.pingId, pingId);

        const pendingAfter = (await sc.apiAction('getPendingStaffPings', {}, { authMode: 'bearer-staff' })).json;
        assert.equal(pendingAfter.success, true);
        assert.ok(!pendingAfter.pings.some((p) => p.id === pingId), 'Expected fulfilled ping to clear from getPendingStaffPings');
        await sc.apiAction('logoutStaff', {}, { authMode: 'bearer-staff' });

        // 3. /staff mobile viewport DOM + linked JS/CSS asset audit + interactive PIN login
        const staffPage = await ctx.browser.goto('/staff', { viewport: { width: 390, height: 844 } });
        const staffDom = await ctx.browser.queryDomSummary();
        assert.equal(staffDom.consoleErrors.length, 0, `Staff console errors: ${staffDom.consoleErrors.join('; ')}`);
        assert.ok(staffDom.elementIds.includes('staffAuthGate'));
        assert.ok(staffDom.elementIds.includes('staffPinInput'));
        assert.ok(staffDom.elementIds.includes('otherJobsFilterBar'));

        const staffAssets = await ctx.browser.fetchLinkedAssets();
        assert.ok(staffAssets.length >= 1, 'Expected linked JS/CSS assets on /staff');
        for (const a of staffAssets) {
          assert.equal(a.status, 200, `Linked /staff asset ${a.ref} returned ${a.status}`);
          assert.ok(a.ref.includes('?v='), `Missing ?v= cache-buster on /staff asset ${a.ref}`);
        }

        const staffBanned = [
          'chipOtherInterior',
          'chipOtherExterior',
          'pattern="[0-9]{6}"',
          '/js/app.js',
          'interior_detailing',
          'exterior_detailing',
          '7_seater'
        ];
        for (const src of [{ label: '/staff HTML', text: staffPage.html }, ...staffAssets.map((a) => ({ label: a.ref, text: a.text }))]) {
          for (const banned of staffBanned) {
            assert.equal(src.text.includes(banned), false, `Found banned token "${banned}" in ${src.label}`);
          }
        }

        if (!ctx.browser.isHttpFallback()) {
          await loginStaffBrowser(ctx.browser, stfData.phone, '9090');
          const afterStaffLogin = await ctx.browser.queryDomSummary();
          assert.equal(afterStaffLogin.consoleErrors.length, 0, `Staff login console errors: ${afterStaffLogin.consoleErrors.join('; ')}`);
        }
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });
}

module.exports = { registerTier4Tests };
