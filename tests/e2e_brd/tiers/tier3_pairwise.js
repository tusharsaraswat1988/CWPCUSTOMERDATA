'use strict';

const assert = require('node:assert/strict');
const { getIstDateString } = require('../lib/config');
const seed = require('../fixtures/brd_seed');
const {
  createEntityTracker,
  createCustomerWithLocation,
  createStaff,
  createDccBookingForVehicle,
  computeExpectedSolarTotal,
  makePricePattern
} = require('../lib/test_helpers');

function registerTier3Tests(registry) {
  registry.register({
    id: 'T3-PW-01',
    tier: 3,
    feature: ['E2E-F2', 'E2E-F5'],
    title: 'Multi-address customer pins Car A at Address 1, Car B at Address 2, and Solar at Address 3 across bookings',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const c = await createCustomerWithLocation(admin, 0);
      const l2 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(c.customerId, 1, { isPrimary: false }))).json.location;
      const l3 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(c.customerId, 2, { isPrimary: false }))).json.location;

      const v1 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId, { seaterType: '5_seater' }))).json.vehicle;
      const v2 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, l2.id, { seaterType: '5_plus_seater' }))).json.vehicle;
      const sol = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(c.customerId, l3.id, { panelCount: 14 }))).json.solarInstallation;

      const dccStaff = await createStaff(admin, { can_dcc: true });
      const svcs = (await admin.apiAction('getServices')).json.services;
      const dccSvc = svcs.find((s) => s.category === 'dcc');
      const solarSvc = svcs.find((s) => s.category === 'solar');

      const b1 = (await admin.apiAction('createBooking', { customerId: c.customerId, serviceId: dccSvc.id, assetType: 'vehicle', vehicleId: v1.id, locationId: c.locationId, assignedDccStaffId: dccStaff.staffId, frequency: 'daily' })).json.booking;
      const b2 = (await admin.apiAction('createBooking', { customerId: c.customerId, serviceId: dccSvc.id, assetType: 'vehicle', vehicleId: v2.id, locationId: l2.id, assignedDccStaffId: dccStaff.staffId, frequency: 'alternate' })).json.booking;
      const b3 = (await admin.apiAction('createBooking', { customerId: c.customerId, serviceId: solarSvc.id, assetType: 'solar', solarId: sol.id, locationId: l3.id, frequency: 'monthly' })).json.booking;

      assert.equal(b1.location_id, c.locationId);
      assert.equal(b2.location_id, l2.id);
      assert.equal(b3.location_id, l3.id);

      const prof = (await admin.apiAction('getCustomerProfile', { customerId: c.customerId })).json.profile;
      assert.equal(prof.addresses.length, 3);
      assert.equal(prof.vehicles.length, 2);
      assert.equal(prof.solarInstallations.length, 1);
      assert.equal(prof.bookings.length, 3);
    }
  });

  registry.register({
    id: 'T3-PW-02',
    tier: 3,
    feature: ['E2E-F3', 'E2E-F6'],
    title: 'Multi-capability staff matrix enforces exact capability matching across car_wash, solar, and detailing jobs',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const c = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
      const sol = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(c.customerId, c.locationId))).json.solarInstallation;

      const washAndSolar = await createStaff(admin, { can_dcc: false, can_car_wash: true, can_solar: true, can_detailing: false });
      const detailOnly = await createStaff(admin, { can_dcc: false, can_car_wash: false, can_solar: false, can_detailing: true });

      const jWash = (await admin.apiAction('createServiceJob', { customerId: c.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: c.locationId })).json.job;
      const jSol = (await admin.apiAction('createServiceJob', { customerId: c.customerId, serviceCategory: 'solar', solarId: sol.id, locationId: c.locationId })).json.job;
      const jDet = (await admin.apiAction('createServiceJob', { customerId: c.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: c.locationId })).json.job;

      assert.equal((await admin.apiAction('assignSpecialJob', { jobId: jWash.id, staffId: washAndSolar.staffId })).status, 200);
      assert.equal((await admin.apiAction('assignSpecialJob', { jobId: jSol.id, staffId: washAndSolar.staffId })).status, 200);
      assert.equal((await admin.apiAction('assignSpecialJob', { jobId: jDet.id, staffId: detailOnly.staffId })).status, 200);

      assert.ok([400, 403].includes((await admin.apiAction('assignSpecialJob', { jobId: jDet.id, staffId: washAndSolar.staffId })).status));
      assert.ok([400, 403].includes((await admin.apiAction('assignSpecialJob', { jobId: jWash.id, staffId: detailOnly.staffId })).status));
    }
  });

  registry.register({
    id: 'T3-PW-03',
    tier: 3,
    feature: ['E2E-F4', 'E2E-F5'],
    title: 'Mixed package (DCC + 2x Car Wash) + paid & ₹0 global add-ons creates central booking with add-on pricing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const c = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId, { seaterType: '5_plus_seater' }))).json.vehicle;
      const dccStaff = await createStaff(admin, { can_dcc: true });

      const svcs = (await admin.apiAction('getServices')).json.services;
      const dccSvc = svcs.find((s) => s.category === 'dcc');
      const washSvc = svcs.find((s) => s.category === 'car_wash');

      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `DCC Gold PW ${seed.uniqueSuffix('p')}`,
          validity_days: 30,
          price_5_seater: 1500,
          price_5_plus_seater: 2000,
          items: [
            { serviceId: dccSvc.id, quantity: 1, frequency: 'daily' },
            { serviceId: washSvc.id, quantity: 2 }
          ]
        }
      })).json.package;

      const freeAd = (await admin.apiAction('saveAddon', { addon: { name: `Mat Vacuum ${seed.uniqueSuffix('a')}`, price: 0, default_quantity: 2 } })).json.addon;
      const paidAd = (await admin.apiAction('saveAddon', { addon: { name: `Dashboard Polish ${seed.uniqueSuffix('a')}`, price: 250, default_quantity: 1 } })).json.addon;

      const bRes = await admin.apiAction('createBooking', {
        customerId: c.customerId,
        packageId: pkg.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: c.locationId,
        assignedDccStaffId: dccStaff.staffId,
        addons: [{ addonId: freeAd.id, quantity: 2 }, { addonId: paidAd.id, quantity: 1 }]
      });
      assert.equal(bRes.status, 200);
      assert.equal(bRes.json.booking.total_amount, 2250);
      assert.equal(bRes.json.booking.remaining_count, 2);
      assert.equal(bRes.json.booking.addons.length, 2);
    }
  });

  registry.register({
    id: 'T3-PW-04',
    tier: 3,
    feature: ['E2E-F5', 'E2E-F6', 'E2E-F9'],
    title: 'Booking remaining_count decrements on Non-DCC job create, restores on cancel, and consumes on verify',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const c = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_car_wash: true, pin: '3131' });
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: { name: `Pack-2 ${seed.uniqueSuffix('p')}`, validity_days: 60, price_5_seater: 800, price_5_plus_seater: 1000, items: [{ serviceId: washSvc.id, quantity: 2 }] }
      })).json.package;
      const booking = (await admin.apiAction('createBooking', { customerId: c.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: veh.id, locationId: c.locationId })).json.booking;

      const j1 = (await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId: c.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: c.locationId })).json.job;
      assert.equal((await admin.apiAction('getBookings', { customerId: c.customerId })).json.bookings[0].remaining_count, 1);

      await admin.apiAction('cancelSpecialJob', { jobId: j1.id, reason: 'Postponed' });
      assert.equal((await admin.apiAction('getBookings', { customerId: c.customerId })).json.bookings[0].remaining_count, 2);

      const j2 = (await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId: c.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: c.locationId, staffId: staff.staffId })).json.job;
      const sc = ctx.newClient();
      await sc.staffLogin({ phone: staff.phone, pin: '3131', deviceId: 'dev-pw4' });
      await sc.apiAction('enrollSpecialJob', { jobId: j2.id });
      await sc.apiAction('startSpecialJob', { jobId: j2.id, photos: [seed.TINY_PNG_BASE64] });
      await sc.apiAction('completeSpecialJob', { jobId: j2.id, photos: [seed.TINY_PNG_BASE64] });
      await admin.apiAction('verifySpecialJob', { jobId: j2.id });

      assert.equal((await admin.apiAction('getBookings', { customerId: c.customerId })).json.bookings[0].remaining_count, 1);
    }
  });

  registry.register({
    id: 'T3-PW-05',
    tier: 3,
    feature: ['E2E-F7', 'E2E-F8', 'E2E-F10'],
    title: 'Reordering route_stops updates generateDccDailyJobs & Staff Portal /api/staff-data sequence order',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker);
        const v1 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        const v2 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        const v3 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', v1.id);
        tracker.track('vehicles', v2.id);
        tracker.track('vehicles', v3.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '3232' });
        const b1 = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: v1.id, locationId: c.locationId, staffId: staff.staffId });
        const b2 = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: v2.id, locationId: c.locationId, staffId: staff.staffId });
        const b3 = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: v3.id, locationId: c.locationId, staffId: staff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `PW Seq ${seed.uniqueSuffix('r')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);

        const s1 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v1.id, bookingId: b1.id })).json.stop;
        const s2 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v2.id, bookingId: b2.id })).json.stop;
        const s3 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v3.id, bookingId: b3.id })).json.stop;
        tracker.track('routeStops', s1.id);
        tracker.track('routeStops', s2.id);
        tracker.track('routeStops', s3.id);

        await admin.apiAction('reorderRouteStops', { routeId: route.id, orderedStopIds: [s3.id, s1.id, s2.id] });

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '3232', deviceId: 'dev-pw5' });
        const feed = (await sc.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.deepEqual(
          feed.dailyCarCleaning.map((x) => x.vehicleId),
          [v3.id, v1.id, v2.id]
        );
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-06',
    tier: 3,
    feature: ['E2E-F7', 'E2E-F8', 'E2E-F10'],
    title: 'Temporary route cover redirects today dcc_daily_jobs and Staff feed to cover staff while preserving owner',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const perm = await createStaff(admin, tracker, { can_dcc: true, pin: '3301' });
        const cover = await createStaff(admin, tracker, { can_dcc: true, pin: '3302' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: veh.id, locationId: c.locationId, staffId: perm.staffId });
        const route = (await admin.apiAction('createRoute', { name: `PW Cov ${seed.uniqueSuffix('r')}`, staffId: perm.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const today = getIstDateString(0);
        const cov = (await admin.apiAction('createTempRouteAssignment', { routeId: route.id, coverStaffId: cover.staffId, startDate: today, endDate: today })).json.assignment;
        tracker.track('tempAssignments', cov.id);

        const scPerm = ctx.newClient();
        await scPerm.staffLogin({ phone: perm.phone, pin: '3301', deviceId: 'dev-perm' });
        const permFeed = (await scPerm.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.equal(permFeed.dailyCarCleaning.length, 0);

        const scCov = ctx.newClient();
        await scCov.staffLogin({ phone: cover.phone, pin: '3302', deviceId: 'dev-cov' });
        const covFeed = (await scCov.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.equal(covFeed.dailyCarCleaning.length, 1);
        assert.equal(covFeed.dailyCarCleaning[0].isTempCover, true);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-07',
    tier: 3,
    feature: ['E2E-F2', 'E2E-F10'],
    title: 'Customer with 3 Varanasi addresses exposes full N addresses array & asset-linked address in Staff Portal',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker, 0);
        const l2 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(c.customerId, 1, { isPrimary: false }))).json.location;
        const l3 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(c.customerId, 2, { isPrimary: false }))).json.location;
        tracker.track('locations', l2.id);
        tracker.track('locations', l3.id);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, l2.id))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '3401' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: veh.id, locationId: l2.id, staffId: staff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `PW Addr ${seed.uniqueSuffix('r')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '3401', deviceId: 'dev-pw7' });
        const feed = (await sc.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        const foundStop = feed.dailyCarCleaning[0];
        assert.equal(foundStop.locationId, l2.id);
        assert.equal(foundStop.addresses.length, 3);
        assert.ok(foundStop.addresses.some((a) => a.id === l3.id));
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-08',
    tier: 3,
    feature: ['E2E-F3', 'E2E-F10'],
    title: 'Staff PIN changed from 4 digits to 5 digits works seamlessly on Staff Portal login + getStaffData',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const stf = await createStaff(admin, tracker, { can_dcc: true, pin: '4499' });

        const sc1 = ctx.newClient();
        assert.equal((await sc1.staffLogin({ phone: stf.phone, pin: '4499', deviceId: 'dev-pin1' })).status, 200);
        await sc1.apiAction('logoutStaff', {}, { authMode: 'bearer-staff' });

        await admin.apiAction('resetStaffPin', { staffId: stf.staffId, newPin: '55119' });
        const sc2 = ctx.newClient();
        assert.equal((await sc2.staffLogin({ phone: stf.phone, pin: '55119', deviceId: 'dev-pin2' })).status, 200);
        const data = await sc2.get('/api/staff-data', { authMode: 'bearer-staff' });
        assert.equal(data.status, 200);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-09',
    tier: 3,
    feature: ['E2E-F1', 'E2E-F9'],
    title: 'Settings auto_verify_hours update dynamically changes completeSpecialJob auto_verify_at deadline',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      const initSettings = await admin.apiAction('getAdminSettings');
      const origHours = Number((initSettings.json && initSettings.json.settings && initSettings.json.settings.auto_verify_hours) || 24);
      try {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: 6 });

        const c = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await createStaff(admin, tracker, { can_dcc: false, can_car_wash: true, pin: '3501' });
        const job = (await admin.apiAction('createServiceJob', { customerId: c.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: c.locationId, staffId: stf.staffId })).json.job;
        tracker.track('serviceJobs', job.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: stf.phone, pin: '3501', deviceId: 'dev-pw9' });
        await sc.apiAction('enrollSpecialJob', { jobId: job.id });
        await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
        const comp = await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });

        const hrs = Math.round((Date.parse(comp.json.job.auto_verify_at) - Date.parse(comp.json.job.completed_at)) / 3600000);
        assert.equal(hrs, 6);
      } finally {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: origHours });
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-10',
    tier: 3,
    feature: ['E2E-F1', 'E2E-F11'],
    title: 'Updating nested homepageConfig via Admin PUT reflects on /api/public/homepage-config and rendered / DOM',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const pub = ctx.newClient();
      const origRes = await pub.get('/api/public/homepage-config');
      assert.equal(origRes.status, 200);
      const origRates = JSON.parse(JSON.stringify(origRes.json.rates || {}));

      const updatedRates = JSON.parse(JSON.stringify(origRates));
      updatedRates.carCare = updatedRates.carCare || {};
      updatedRates.carCare.dcc = updatedRates.carCare.dcc || {};
      updatedRates.carCare.dcc.fiveSeater = updatedRates.carCare.dcc.fiveSeater || {};
      const targetRate = 1425;
      updatedRates.carCare.dcc.fiveSeater.basic = targetRate;

      try {
        const putRes = await admin.put('/api/admin/homepage-config', { rates: updatedRates });
        assert.equal(putRes.status, 200);

        const cfg = (await pub.get('/api/public/homepage-config')).json;
        assert.equal(cfg.rates.carCare.dcc.fiveSeater.basic, targetRate);

        await ctx.browser.goto('/');
        if (!ctx.browser.isHttpFallback()) {
          await ctx.browser.waitForText(makePricePattern(targetRate), 5000);
          const dom = await ctx.browser.queryDomSummary();
          assert.equal(dom.consoleErrors.length, 0, `Homepage console errors: ${dom.consoleErrors.join('; ')}`);
          assert.match(dom.textContent || dom.html, makePricePattern(targetRate));
        } else {
          const dom = await ctx.browser.queryDomSummary();
          assert.ok(dom.scriptSrcs.some((s) => s.includes('home.js')), 'Expected /js/home.js script link on /');
          const assets = await ctx.browser.fetchLinkedAssets();
          const homeJs = assets.find((a) => a.ref.includes('home.js'));
          assert.ok(homeJs && homeJs.status === 200, 'Expected /js/home.js to return HTTP 200');
          assert.match(homeJs.text, /\/api\/public\/homepage-config/);
        }
      } finally {
        await admin.put('/api/admin/homepage-config', { rates: origRates });
      }
    }
  });

  registry.register({
    id: 'T3-PW-11',
    tier: 3,
    feature: ['E2E-F2', 'E2E-F11'],
    title: 'Public lead capture -> Admin stage/note update -> convertLead -> VIEW-ONLY getCustomerProfile',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const pub = ctx.newClient();
        const lRes = await pub.post('/api/leads', seed.makeLeadPayload({ interestedService: 'detailing', address: 'Sarnath, Varanasi' }));
        assert.equal(lRes.status, 200);
        const leadId = lRes.json.lead.id;
        tracker.track('leads', leadId);

        await admin.apiAction('updateLeadStage', { leadId, stage: 'qualified' });
        await admin.apiAction('addLeadNote', { leadId, note: 'Interested in Detailing Pro' });
        const conv = await admin.apiAction('convertLead', { leadId, convertData: { addressText: 'Sarnath Road, Varanasi' } });
        assert.equal(conv.status, 200);
        tracker.track('customers', conv.json.customerId);
        if (conv.json.location) tracker.track('locations', conv.json.location.id);

        const prof = await admin.apiAction('getCustomerProfile', { customerId: conv.json.customerId });
        assert.equal(prof.status, 200);
        assert.equal(prof.json.profile.addresses.length, 1);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-12',
    tier: 3,
    feature: ['E2E-F4', 'E2E-F5'],
    title: 'Solar tier pricing applies dynamic tier rates and min billing in createBooking',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker, 2);
        const smallPanels = 4;
        const largePanels = 30;
        const smallSol = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(c.customerId, c.locationId, { panelCount: smallPanels }))).json.solarInstallation;
        const largeSol = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(c.customerId, c.locationId, { panelCount: largePanels }))).json.solarInstallation;
        tracker.track('solarInstallations', smallSol.id);
        tracker.track('solarInstallations', largeSol.id);

        const solarSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'solar');
        let tiers = ((await admin.apiAction('getSolarPricingTiers')).json.tiers || []).filter((t) => t.is_active !== false);
        if (tiers.length === 0) {
          const t1 = (await admin.apiAction('saveSolarPricingTier', {
            tier: { tier_name: `E2E Res ${seed.uniqueSuffix('t')}`, min_panels: 1, max_panels: 20, per_panel_rate: 60, min_billing_onetime: 800, min_billing_amc: 600 }
          })).json.tier;
          const t2 = (await admin.apiAction('saveSolarPricingTier', {
            tier: { tier_name: `E2E Com ${seed.uniqueSuffix('t')}`, min_panels: 21, max_panels: null, per_panel_rate: 45, min_billing_onetime: 1200, min_billing_amc: 900 }
          })).json.tier;
          tracker.track('solarTiers', t1.id);
          tracker.track('solarTiers', t2.id);
          tiers = [t1, t2];
        }

        const expectedSmall = computeExpectedSolarTotal(tiers, smallPanels, false);
        const expectedLarge = computeExpectedSolarTotal(tiers, largePanels, false);

        const bSmall = (await admin.apiAction('createBooking', {
          customerId: c.customerId, serviceId: solarSvc.id, assetType: 'solar', solarId: smallSol.id, locationId: c.locationId, frequency: 'one_time'
        })).json.booking;
        tracker.track('bookings', bSmall.id);
        assert.equal(bSmall.total_amount, expectedSmall);

        const bLarge = (await admin.apiAction('createBooking', {
          customerId: c.customerId, serviceId: solarSvc.id, assetType: 'solar', solarId: largeSol.id, locationId: c.locationId, frequency: 'one_time'
        })).json.booking;
        tracker.track('bookings', bLarge.id);
        assert.equal(bLarge.total_amount, expectedLarge);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-13',
    tier: 3,
    feature: ['E2E-F6', 'E2E-F9', 'E2E-F10'],
    title: 'Assigned Non-DCC job appears in Staff Portal feed and completes full 6-step handoff to Admin verify',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await createStaff(admin, tracker, { can_dcc: false, can_detailing: true, pin: '3601' });

        const job = (await admin.apiAction('createServiceJob', { customerId: c.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: c.locationId })).json.job;
        tracker.track('serviceJobs', job.id);
        await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: stf.staffId });

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: stf.phone, pin: '3601', deviceId: 'dev-pw13' });
        const feed1 = (await sc.get('/api/staff-data', { authMode: 'bearer-staff' })).json;
        assert.ok(feed1.detailingJobs.some((j) => j.id === job.id && j.status === 'assigned'));

        await sc.apiAction('enrollSpecialJob', { jobId: job.id });
        await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
        await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });

        const ver = await admin.apiAction('verifySpecialJob', { jobId: job.id });
        assert.equal(ver.status, 200);
        assert.equal(ver.json.job.status, 'verified');
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-14',
    tier: 3,
    feature: ['E2E-F1', 'E2E-F8', 'E2E-F9'],
    title: 'Cookie-authed Admin session receives live SSE DAILY_CLEAN_CHANGED when DCC staff punches job',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cookieAdmin = ctx.newClient();
        await cookieAdmin.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
        assert.ok(cookieAdmin.cookies.has('cwp_adm_sess'), 'Expected cwp_adm_sess cookie for cookie-only SSE auth');

        const c = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const stf = await createStaff(admin, tracker, { can_dcc: true, pin: '3701' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: veh.id, locationId: c.locationId, staffId: stf.staffId });
        const route = (await admin.apiAction('createRoute', { name: `PW SSE ${seed.uniqueSuffix('r')}`, staffId: stf.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: stf.phone, pin: '3701', deviceId: 'dev-pw14' });

        const sse = await cookieAdmin.readSseEvents('/api/admin-realtime-stream', {
          authMode: 'cookie',
          timeoutMs: 3000,
          maxEvents: 2,
          triggerFn: async () => {
            await sc.apiAction('recordDailyCleanWithPhoto', { vehicleId: veh.id, photoBase64: seed.TINY_PNG_BASE64 });
          }
        });
        assert.equal(sse.status, 200);
        assert.ok(sse.events.some((e) => e.data && e.data.type === 'DAILY_CLEAN_CHANGED'));
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-15',
    tier: 3,
    feature: ['E2E-F3', 'E2E-F7'],
    title: 'Removing route stop restores vehicle to getUnassignedDccVehicles and Inactive staff blocked from cover',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const c = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(c.customerId, c.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const s1 = await createStaff(admin, tracker, { can_dcc: true });
        const s2 = await createStaff(admin, tracker, { can_dcc: true, status: 'Inactive' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: c.customerId, vehicleId: veh.id, locationId: c.locationId, staffId: s1.staffId });
        const route = (await admin.apiAction('createRoute', { name: `PW Rem ${seed.uniqueSuffix('r')}`, staffId: s1.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        await admin.apiAction('removeStopFromRoute', { stopId: stop.id });
        const unassigned = (await admin.apiAction('getUnassignedDccVehicles')).json.unassigned;
        assert.ok(unassigned.some((v) => v.id === veh.id));

        const today = getIstDateString(0);
        const covRes = await admin.apiAction('createTempRouteAssignment', { routeId: route.id, coverStaffId: s2.staffId, startDate: today, endDate: today });
        assert.ok([400, 403].includes(covRes.status));
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T3-PW-16',
    tier: 3,
    feature: ['E2E-F4', 'E2E-F11'],
    title: 'Unified detailing category flows consistently from catalog -> lead -> job -> /staff UI chip',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const svc = (await admin.apiAction('saveService', { service: { category: 'detailing', name: `Gloss Polish ${seed.uniqueSuffix('d')}` } })).json.service;
        tracker.track('services', svc.id);
        assert.equal(svc.category, 'detailing');

        const pub = ctx.newClient();
        const leadRes = await pub.post('/api/leads', seed.makeLeadPayload({ interestedService: 'detailing' }));
        assert.equal(leadRes.status, 200);
        tracker.track('leads', leadRes.json.lead.id);
        assert.equal(leadRes.json.lead.interested_service, 'detailing');

        const staffHtml = (await pub.get('/staff')).text;
        assert.match(staffHtml, /data-category=["']detailing["']/);
        assert.equal(staffHtml.includes('interior_detailing'), false);
        assert.equal(staffHtml.includes('exterior_detailing'), false);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });
}

module.exports = { registerTier3Tests };
