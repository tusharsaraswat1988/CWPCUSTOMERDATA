'use strict';

const assert = require('node:assert/strict');
const { getIstDateString } = require('../lib/config');
const seed = require('../fixtures/brd_seed');
const {
  createEntityTracker,
  createCustomerWithLocation,
  createStaff,
  createDccBookingForVehicle
} = require('../lib/test_helpers');

function registerTier1Tests(registry) {
  // =========================================================================
  // E2E-F1: Health, Admin Auth, CSRF Transport, Security Center & Settings
  // =========================================================================
  registry.register({
    id: 'T1-F1-01',
    tier: 1,
    feature: 'E2E-F1',
    title: 'Health endpoints (/health, /healthz, /ping) report databaseHealthy and ok status',
    async fn(ctx) {
      const client = ctx.newClient();
      for (const path of ['/health', '/healthz', '/ping']) {
        const res = await client.get(path);
        assert.equal(res.status, 200, `${path} status mismatch`);
        assert.equal(res.json.status, 'ok');
        assert.equal(res.json.databaseHealthy, true);
      }
    }
  });

  registry.register({
    id: 'T1-F1-02',
    tier: 1,
    feature: 'E2E-F1',
    title: 'Admin login issues session + CSRF cookies and verifyAdminSession validates session',
    async fn(ctx) {
      const client = ctx.newClient();
      const loginRes = await client.adminLogin({
        username: ctx.creds.adminUsername,
        password: ctx.creds.adminPassword,
        useCookies: true
      });
      assert.equal(loginRes.status, 200, `Login failed: ${loginRes.text}`);
      assert.equal(loginRes.json.success, true);
      assert.ok(loginRes.json.token, 'Expected admin token');
      assert.ok(client.cookies.get('cwp_adm_sess'), 'Expected cwp_adm_sess cookie');
      assert.ok(client.cookies.get('cwp_csrf'), 'Expected cwp_csrf cookie');

      const verifyRes = await client.apiAction('verifyAdminSession');
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.json.valid, true);
      assert.equal(verifyRes.json.user.role, 'admin');
    }
  });

  registry.register({
    id: 'T1-F1-03',
    tier: 1,
    feature: 'E2E-F1',
    title: 'Cookie + X-CSRF-Token and Bearer token transports both authorize admin mutations',
    async fn(ctx) {
      const tracker = createEntityTracker();
      const admin = await ctx.getAdminClient();
      try {
        const cookieClient = ctx.newClient();
        await cookieClient.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });
        const custRes1 = await cookieClient.apiAction('saveCustomer', { customerData: seed.makeCustomerPayload({ addressText: 'Sigra, Varanasi' }) });
        assert.equal(custRes1.status, 200);
        assert.equal(custRes1.json.success, true);
        tracker.track('customers', custRes1.json.customerId || custRes1.json.customer.id);

        const bearerClient = ctx.newClient();
        const loginRes = await bearerClient.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: false });
        assert.equal(loginRes.status, 200);
        const custRes2 = await bearerClient.apiAction(
          'saveCustomer',
          { customerData: seed.makeCustomerPayload({ addressText: 'Lanka, Varanasi' }) },
          { authMode: 'bearer-admin', omitCookies: true }
        );
        assert.equal(custRes2.status, 200);
        assert.equal(custRes2.json.success, true);
        tracker.track('customers', custRes2.json.customerId || custRes2.json.customer.id);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F1-04',
    tier: 1,
    feature: 'E2E-F1',
    title: 'Security Center lists trustedDevices/activeSessions, renames device, and logoutAdmin revokes session',
    async fn(ctx) {
      const client = ctx.newClient();
      await client.adminLogin({ username: ctx.creds.adminUsername, password: ctx.creds.adminPassword, useCookies: true });

      const overview = await client.apiAction('getAdminSecurityOverview');
      assert.equal(overview.status, 200);
      assert.equal(overview.json.success, true);
      assert.ok(overview.json.accountSecurity && overview.json.accountSecurity.passwordAuthEnabled === true);
      assert.ok(Array.isArray(overview.json.trustedDevices) && overview.json.trustedDevices.length >= 1);
      assert.ok(Array.isArray(overview.json.activeSessions) && overview.json.activeSessions.length >= 1);

      const devRef = overview.json.trustedDevices[0].deviceRef;
      const renameRes = await client.apiAction('renameAdminDevice', { deviceRef: devRef, deviceLabel: 'Varanasi Ops Desk' });
      assert.equal(renameRes.status, 200);
      assert.equal(renameRes.json.success, true);
      assert.equal(renameRes.json.deviceLabel, 'Varanasi Ops Desk');

      const overviewAfter = await client.apiAction('getAdminSecurityOverview');
      assert.equal(overviewAfter.status, 200);
      const renamedDev = overviewAfter.json.trustedDevices.find((d) => d.deviceRef === devRef);
      assert.ok(renamedDev && renamedDev.deviceLabel === 'Varanasi Ops Desk');

      const logoutRes = await client.apiAction('logoutAdmin');
      assert.equal(logoutRes.status, 200);
      const afterLogout = await client.apiAction('verifyAdminSession');
      assert.equal(afterLogout.status, 401);
    }
  });

  registry.register({
    id: 'T1-F1-05',
    tier: 1,
    feature: 'E2E-F1',
    title: 'getAdminSettings and saveAdminSettings manage configurable auto_verify_hours',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const initRes = await admin.apiAction('getAdminSettings');
      assert.equal(initRes.status, 200);
      assert.equal(initRes.json.success, true);
      const origHours = Number(initRes.json.settings.auto_verify_hours || 24);
      assert.ok(origHours > 0);

      try {
        const saveRes = await admin.apiAction('saveAdminSettings', { auto_verify_hours: 18 });
        assert.equal(saveRes.status, 200);
        assert.equal(saveRes.json.settings.auto_verify_hours, 18);

        const verifyRes = await admin.apiAction('getAdminSettings');
        assert.equal(verifyRes.json.settings.auto_verify_hours, 18);
      } finally {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: origHours });
      }
    }
  });

  // =========================================================================
  // E2E-F2: Customers, Multi-Address, Multi-Car, Multi-Solar & VIEW-ONLY Profile
  // =========================================================================
  registry.register({
    id: 'T1-F2-01',
    tier: 1,
    feature: 'E2E-F2',
    title: 'saveCustomer creates customer with Varanasi address and getAllCustomers + GET /api/customers return it',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const created = await createCustomerWithLocation(admin);

      const allRes = await admin.apiAction('getAllCustomers');
      assert.equal(allRes.status, 200);
      assert.ok(Array.isArray(allRes.json));
      assert.ok(allRes.json.some((c) => c.id === created.customerId));

      const restRes = await admin.get('/api/customers');
      assert.equal(restRes.status, 200);
      assert.ok(restRes.json.records.some((c) => c.id === created.customerId));
    }
  });

  registry.register({
    id: 'T1-F2-02',
    tier: 1,
    feature: 'E2E-F2',
    title: 'saveCustomerLocation adds N distinct addresses (Home, Office, Factory) to one customer',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const created = await createCustomerWithLocation(admin);

      const loc2 = await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(created.customerId, 1, { isPrimary: false }));
      const loc3 = await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(created.customerId, 2, { isPrimary: false }));
      assert.equal(loc2.status, 200);
      assert.equal(loc3.status, 200);

      const prof = await admin.apiAction('getCustomerProfile', { customerId: created.customerId });
      assert.equal(prof.status, 200);
      assert.equal(prof.json.profile.addresses.length, 3);
    }
  });

  registry.register({
    id: 'T1-F2-03',
    tier: 1,
    feature: 'E2E-F2',
    title: 'saveVehicle registers multiple cars (5_seater & 5_plus_seater) linked to distinct addresses',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const created = await createCustomerWithLocation(admin);
      const loc2Res = await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(created.customerId, 1, { isPrimary: false }));
      const loc2Id = loc2Res.json.location.id;

      const v1 = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(created.customerId, created.locationId, { seaterType: '5_seater' }));
      const v2 = await admin.apiAction('saveVehicle', seed.makeVehiclePayload(created.customerId, loc2Id, { seaterType: '5_plus_seater', carModel: 'Toyota Innova' }));
      assert.equal(v1.status, 200);
      assert.equal(v2.status, 200);
      assert.equal(v1.json.vehicle.location_id, created.locationId);
      assert.equal(v2.json.vehicle.location_id, loc2Id);
      assert.equal(v2.json.vehicle.seater_type, '5_plus_seater');
    }
  });

  registry.register({
    id: 'T1-F2-04',
    tier: 1,
    feature: 'E2E-F2',
    title: 'saveSolarInstallation registers multiple solar setups linked to specific addresses',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const created = await createCustomerWithLocation(admin);
      const loc2Res = await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(created.customerId, 2, { isPrimary: false }));

      const s1 = await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(created.customerId, created.locationId, { panelCount: 10, kwLoad: 4.5 }));
      const s2 = await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(created.customerId, loc2Res.json.location.id, { panelCount: 28, kwLoad: 15 }));
      assert.equal(s1.status, 200);
      assert.equal(s2.status, 200);
      assert.equal(s1.json.solarInstallation.panel_count, 10);
      assert.equal(s2.json.solarInstallation.panel_count, 28);
    }
  });

  registry.register({
    id: 'T1-F2-05',
    tier: 1,
    feature: 'E2E-F2',
    title: 'getCustomerProfile returns strictly VIEW-ONLY aggregate with addresses, vehicles, solar, and bookings',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const created = await createCustomerWithLocation(admin);
      await admin.apiAction('saveVehicle', seed.makeVehiclePayload(created.customerId, created.locationId));
      await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(created.customerId, created.locationId));

      const prof = await admin.apiAction('getCustomerProfile', { customerId: created.customerId });
      assert.equal(prof.status, 200);
      assert.equal(prof.json.success, true);
      assert.equal(prof.json.profile.customer.id, created.customerId);
      assert.equal(prof.json.profile.addresses.length, 1);
      assert.equal(prof.json.profile.vehicles.length, 1);
      assert.equal(prof.json.profile.solarInstallations.length, 1);
      assert.ok(Array.isArray(prof.json.profile.bookings));
    }
  });

  // =========================================================================
  // E2E-F3: Staff Management, 4 Boolean Capabilities & 4-6 Digit PIN Auth
  // =========================================================================
  registry.register({
    id: 'T1-F3-01',
    tier: 1,
    feature: 'E2E-F3',
    title: 'Create staff with 4-digit PIN and verifyStaffPin authenticates cleanly',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await createStaff(admin, { pin: '4192', can_dcc: true });

      const staffClient = ctx.newClient();
      const loginRes = await staffClient.staffLogin({ phone: stf.phone, pin: '4192', deviceId: 'dev-4d' });
      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.json.success, true);
      assert.ok(loginRes.json.token);
      assert.equal(loginRes.json.staffId, stf.staffId);
    }
  });

  registry.register({
    id: 'T1-F3-02',
    tier: 1,
    feature: 'E2E-F3',
    title: 'Create staff with 5-digit PIN and multi-capability combination (DCC + Car Wash + Solar)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await createStaff(admin, {
        pin: '58391',
        can_dcc: true,
        can_car_wash: true,
        can_solar: true,
        can_detailing: false
      });
      assert.equal(stf.staff.can_dcc, true);
      assert.equal(stf.staff.can_car_wash, true);
      assert.equal(stf.staff.can_solar, true);
      assert.equal(stf.staff.can_detailing, false);

      const staffClient = ctx.newClient();
      const loginRes = await staffClient.staffLogin({ phone: stf.phone, pin: '58391', deviceId: 'dev-5d' });
      assert.equal(loginRes.status, 200);
    }
  });

  registry.register({
    id: 'T1-F3-03',
    tier: 1,
    feature: 'E2E-F3',
    title: 'Create staff with 6-digit PIN and resetStaffPin updates PIN to 4 digits',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await createStaff(admin, { pin: '654321', can_detailing: true, can_dcc: false });

      const resetRes = await admin.apiAction('resetStaffPin', { staffId: stf.staffId, newPin: '7382' });
      assert.equal(resetRes.status, 200);

      const staffClient = ctx.newClient();
      const loginRes = await staffClient.staffLogin({ phone: stf.phone, pin: '7382', deviceId: 'dev-6to4' });
      assert.equal(loginRes.status, 200);
    }
  });

  registry.register({
    id: 'T1-F3-04',
    tier: 1,
    feature: 'E2E-F3',
    title: 'getStaffList filters strictly by each of the 4 capabilities and activeOnly',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const solarOnly = await createStaff(admin, { can_dcc: false, can_car_wash: false, can_solar: true, can_detailing: false });
      const inactiveSolar = await createStaff(admin, { can_dcc: false, can_solar: true, status: 'Inactive' });

      const res = await admin.apiAction('getStaffList', { capability: 'solar', activeOnly: true });
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.ok(res.json.staff.some((s) => s.id === solarOnly.staffId));
      assert.ok(!res.json.staff.some((s) => s.id === inactiveSolar.staffId));
      assert.ok(res.json.staff.every((s) => s.can_solar === true));
    }
  });

  registry.register({
    id: 'T1-F3-05',
    tier: 1,
    feature: 'E2E-F3',
    title: 'Public GET /api/staff redacts phone and PIN while Admin getStaffList includes capabilities',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const stf = await createStaff(admin, { can_dcc: true });

      const pubClient = ctx.newClient();
      const pubRes = await pubClient.get('/api/staff');
      assert.equal(pubRes.status, 200);
      assert.ok(Array.isArray(pubRes.json));
      const pubEntry = pubRes.json.find((s) => s.id === stf.staffId);
      assert.ok(pubEntry, 'Expected staff in public list');
      assert.equal(pubEntry.phone, undefined);
      assert.equal(pubEntry.pin, undefined);

      const admRes = await admin.apiAction('getStaffList');
      const admEntry = admRes.json.staff.find((s) => s.id === stf.staffId);
      assert.equal(admEntry.phone, stf.phone);
      assert.equal(admEntry.pin, undefined);
      assert.equal(admEntry.hasPin, true);
    }
  });

  // =========================================================================
  // E2E-F4: Master Catalog (4 Canonical Services, Packages, Solar Tiers, Add-Ons)
  // =========================================================================
  registry.register({
    id: 'T1-F4-01',
    tier: 1,
    feature: 'E2E-F4',
    title: 'getServices returns 4 canonical categories and saveService adds named sub-service under detailing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const svcRes = await admin.apiAction('getServices');
      assert.equal(svcRes.status, 200);
      const cats = new Set(svcRes.json.services.map((s) => s.category));
      for (const expected of ['dcc', 'car_wash', 'solar', 'detailing']) {
        assert.ok(cats.has(expected), `Missing canonical category ${expected}`);
      }
      assert.ok(!cats.has('interior_detailing'));
      assert.ok(!cats.has('exterior_detailing'));

      const saveRes = await admin.apiAction('saveService', {
        service: { category: 'detailing', name: `Ceramic Coat ${seed.uniqueSuffix('svc')}`, description: '9H ceramic protection' }
      });
      assert.equal(saveRes.status, 200);
      assert.equal(saveRes.json.service.category, 'detailing');
    }
  });

  registry.register({
    id: 'T1-F4-02',
    tier: 1,
    feature: 'E2E-F4',
    title: 'savePackage creates flexible DCC Gold package combining DCC + Car Wash with 5/5+ pricing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const svcList = (await admin.apiAction('getServices')).json.services;
      const dccSvc = svcList.find((s) => s.category === 'dcc');
      const washSvc = svcList.find((s) => s.category === 'car_wash');

      const pkgRes = await admin.apiAction('savePackage', {
        packageData: {
          name: `DCC Gold ${seed.uniqueSuffix('pkg')}`,
          validity_days: 30,
          price_5_seater: 1499,
          price_5_plus_seater: 1899,
          items: [
            { serviceId: dccSvc.id, quantity: 1, frequency: 'daily' },
            { serviceId: washSvc.id, quantity: 2 }
          ]
        }
      });
      assert.equal(pkgRes.status, 200);
      assert.equal(pkgRes.json.package.price_5_seater, 1499);
      assert.equal(pkgRes.json.package.price_5_plus_seater, 1899);
      assert.equal(pkgRes.json.package.items.length, 2);
    }
  });

  registry.register({
    id: 'T1-F4-03',
    tier: 1,
    feature: 'E2E-F4',
    title: 'savePackage creates mixed Full Care package (DCC + Car Wash + Solar) and getPackages lists it',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const svcList = (await admin.apiAction('getServices')).json.services;
      const dccSvc = svcList.find((s) => s.category === 'dcc');
      const washSvc = svcList.find((s) => s.category === 'car_wash');
      const solarSvc = svcList.find((s) => s.category === 'solar');

      const pkgRes = await admin.apiAction('savePackage', {
        packageData: {
          name: `Full Care ${seed.uniqueSuffix('pkg')}`,
          validity_days: 30,
          price_5_seater: 2299,
          price_5_plus_seater: 2799,
          items: [
            { serviceId: dccSvc.id, quantity: 1, frequency: 'alternate' },
            { serviceId: washSvc.id, quantity: 2 },
            { serviceId: solarSvc.id, quantity: 1, frequency: 'monthly', duration_months: 1 }
          ]
        }
      });
      assert.equal(pkgRes.status, 200);

      const listRes = await admin.apiAction('getPackages');
      assert.equal(listRes.status, 200);
      assert.ok(listRes.json.packages.some((p) => p.id === pkgRes.json.package.id));
    }
  });

  registry.register({
    id: 'T1-F4-04',
    tier: 1,
    feature: 'E2E-F4',
    title: 'saveSolarPricingTier and getSolarPricingTiers persist panel tiers with one-time & AMC min billing',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const saveRes = await admin.apiAction('saveSolarPricingTier', {
        tier: {
          tier_name: `Mid Rooftop ${seed.uniqueSuffix('tier')}`,
          min_panels: 11,
          max_panels: 20,
          per_panel_rate: 55,
          min_billing_onetime: 850,
          min_billing_amc: 650
        }
      });
      assert.equal(saveRes.status, 200);
      assert.equal(saveRes.json.tier.per_panel_rate, 55);

      const listRes = await admin.apiAction('getSolarPricingTiers');
      assert.equal(listRes.status, 200);
      assert.ok(listRes.json.tiers.some((t) => t.id === saveRes.json.tier.id));
    }
  });

  registry.register({
    id: 'T1-F4-05',
    tier: 1,
    feature: 'E2E-F4',
    title: 'saveAddon creates paid and complimentary (₹0) global add-ons',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const freeAddon = await admin.apiAction('saveAddon', {
        addon: { name: `Interior Vacuum ${seed.uniqueSuffix('adn')}`, price: 0, default_quantity: 2 }
      });
      const paidAddon = await admin.apiAction('saveAddon', {
        addon: { name: `Tyre Polish ${seed.uniqueSuffix('adn')}`, price: 150, default_quantity: 1 }
      });
      assert.equal(freeAddon.status, 200);
      assert.equal(freeAddon.json.addon.price, 0);
      assert.equal(paidAddon.status, 200);
      assert.equal(paidAddon.json.addon.price, 150);

      const listRes = await admin.apiAction('getAddons');
      assert.ok(listRes.json.addons.some((a) => a.id === freeAddon.json.addon.id));
      assert.ok(listRes.json.addons.some((a) => a.id === paidAddon.json.addon.id));
    }
  });

  // =========================================================================
  // E2E-F5: Central Bookings Engine
  // =========================================================================
  registry.register({
    id: 'T1-F5-01',
    tier: 1,
    feature: 'E2E-F5',
    title: 'createBooking creates DCC booking with mandatory can_dcc staff and validity dates',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const dccStaff = await createStaff(admin, { can_dcc: true });
      const dccSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'dcc');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `DCC Basic ${seed.uniqueSuffix('p')}`,
          validity_days: 30,
          price_5_seater: 1100,
          price_5_plus_seater: 1500,
          items: [{ serviceId: dccSvc.id, quantity: 1, frequency: 'daily' }]
        }
      })).json.package;

      const bRes = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        packageId: pkg.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        assignedDccStaffId: dccStaff.staffId,
        paymentStatus: 'paid'
      });
      assert.equal(bRes.status, 200);
      assert.equal(bRes.json.booking.assigned_dcc_staff_id, dccStaff.staffId);
      assert.equal(bRes.json.booking.total_amount, 1100);
      assert.equal(bRes.json.booking.status, 'active');
    }
  });

  registry.register({
    id: 'T1-F5-02',
    tier: 1,
    feature: 'E2E-F5',
    title: 'createBooking creates Non-DCC Car Wash Pack-4 booking with deferred staff and remaining_count=4',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `Wash Pack-4 ${seed.uniqueSuffix('p')}`,
          validity_days: 180,
          price_5_seater: 1600,
          price_5_plus_seater: 2000,
          items: [{ serviceId: washSvc.id, quantity: 4 }]
        }
      })).json.package;

      const bRes = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        packageId: pkg.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId
      });
      assert.equal(bRes.status, 200);
      assert.equal(bRes.json.booking.assigned_dcc_staff_id, null);
      assert.equal(bRes.json.booking.total_count, 4);
      assert.equal(bRes.json.booking.remaining_count, 4);
    }
  });

  registry.register({
    id: 'T1-F5-03',
    tier: 1,
    feature: 'E2E-F5',
    title: 'createBooking applies 5_seater vs 5_plus_seater pricing automatically from vehicle asset',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const v5 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId, { seaterType: '5_seater' }))).json.vehicle;
      const v5Plus = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId, { seaterType: '5_plus_seater' }))).json.vehicle;
      const detSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'detailing');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `Detailing Pro ${seed.uniqueSuffix('p')}`,
          validity_days: 30,
          price_5_seater: 1800,
          price_5_plus_seater: 2400,
          items: [{ serviceId: detSvc.id, quantity: 1 }]
        }
      })).json.package;

      const b5 = await admin.apiAction('createBooking', { customerId: cust.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: v5.id, locationId: cust.locationId });
      const b5Plus = await admin.apiAction('createBooking', { customerId: cust.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: v5Plus.id, locationId: cust.locationId });
      assert.equal(b5.json.booking.total_amount, 1800);
      assert.equal(b5Plus.json.booking.total_amount, 2400);
    }
  });

  registry.register({
    id: 'T1-F5-04',
    tier: 1,
    feature: 'E2E-F5',
    title: 'createBooking calculates Solar AMC price from solar installation panel_count and tier',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const solar = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(cust.customerId, cust.locationId, { panelCount: 15 }))).json.solarInstallation;
      const solarSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'solar');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `Solar Monthly AMC ${seed.uniqueSuffix('p')}`,
          validity_days: 365,
          items: [{ serviceId: solarSvc.id, quantity: 12, frequency: 'monthly', duration_months: 12 }]
        }
      })).json.package;

      const bRes = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        packageId: pkg.id,
        assetType: 'solar',
        solarId: solar.id,
        locationId: cust.locationId
      });
      assert.equal(bRes.status, 200);
      assert.ok(bRes.json.booking.total_amount >= 600 * 12);
      assert.equal(bRes.json.booking.solar_id, solar.id);
    }
  });

  registry.register({
    id: 'T1-F5-05',
    tier: 1,
    feature: 'E2E-F5',
    title: 'createBooking attaches global add-ons (booking_addons) and cancelBooking updates status to cancelled',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: {
          name: `Wash + Addon ${seed.uniqueSuffix('p')}`,
          validity_days: 60,
          price_5_seater: 500,
          price_5_plus_seater: 700,
          items: [{ serviceId: washSvc.id, quantity: 1 }]
        }
      })).json.package;
      const addon = (await admin.apiAction('saveAddon', { addon: { name: `Wax ${seed.uniqueSuffix('a')}`, price: 200, default_quantity: 1 } })).json.addon;

      const bRes = await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        packageId: pkg.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        addons: [{ addonId: addon.id, quantity: 2 }]
      });
      assert.equal(bRes.status, 200);
      assert.equal(bRes.json.booking.total_amount, 900); // 500 + 2*200
      assert.equal(bRes.json.booking.addons.length, 1);

      const cancelRes = await admin.apiAction('cancelBooking', { bookingId: bRes.json.booking.id });
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.json.booking.status, 'cancelled');
    }
  });

  // =========================================================================
  // E2E-F6: Non-DCC Job Assignment & Server-Side 4-Capability Filtering
  // =========================================================================
  registry.register({
    id: 'T1-F6-01',
    tier: 1,
    feature: 'E2E-F6',
    title: 'createServiceJob creates scheduled Non-DCC job from booking and decrements remaining_count',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: { name: `Wash 3 ${seed.uniqueSuffix('p')}`, validity_days: 90, price_5_seater: 1200, price_5_plus_seater: 1500, items: [{ serviceId: washSvc.id, quantity: 3 }] }
      })).json.package;
      const booking = (await admin.apiAction('createBooking', { customerId: cust.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: veh.id, locationId: cust.locationId })).json.booking;

      const jobRes = await admin.apiAction('createServiceJob', {
        bookingId: booking.id,
        customerId: cust.customerId,
        serviceCategory: 'car_wash',
        vehicleId: veh.id,
        locationId: cust.locationId
      });
      assert.equal(jobRes.status, 200);
      assert.equal(jobRes.json.job.status, 'scheduled');

      const bAfter = (await admin.apiAction('getBookings', { customerId: cust.customerId })).json.bookings.find((b) => b.id === booking.id);
      assert.equal(bAfter.remaining_count, 2);
    }
  });

  registry.register({
    id: 'T1-F6-02',
    tier: 1,
    feature: 'E2E-F6',
    title: 'assignSpecialJob assigns car_wash job to active staff with can_car_wash=true',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_car_wash: true });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const assignRes = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: staff.staffId });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.json.job.status, 'assigned');
      assert.equal(assignRes.json.job.assigned_staff_id, staff.staffId);
    }
  });

  registry.register({
    id: 'T1-F6-03',
    tier: 1,
    feature: 'E2E-F6',
    title: 'assignSpecialJob assigns solar job to active staff with can_solar=true',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const solar = (await admin.apiAction('saveSolarInstallation', seed.makeSolarPayload(cust.customerId, cust.locationId))).json.solarInstallation;
      const staff = await createStaff(admin, { can_dcc: false, can_solar: true });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'solar', solarId: solar.id, locationId: cust.locationId })).json.job;

      const assignRes = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: staff.staffId });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.json.job.assigned_staff_id, staff.staffId);
    }
  });

  registry.register({
    id: 'T1-F6-04',
    tier: 1,
    feature: 'E2E-F6',
    title: 'assignSpecialJob assigns detailing job to active staff with can_detailing=true',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_detailing: true });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const assignRes = await admin.apiAction('assignSpecialJob', { jobId: job.id, staffId: staff.staffId });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.json.job.service_category, 'detailing');
      assert.equal(assignRes.json.job.assigned_staff_id, staff.staffId);
    }
  });

  registry.register({
    id: 'T1-F6-05',
    tier: 1,
    feature: 'E2E-F6',
    title: 'reassignSpecialJob switches authorized staff and getSpecialJobs filters by category and status',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const s1 = await createStaff(admin, { can_dcc: false, can_detailing: true });
      const s2 = await createStaff(admin, { can_dcc: false, can_detailing: true });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId, staffId: s1.staffId })).json.job;

      const reRes = await admin.apiAction('reassignSpecialJob', { jobId: job.id, toStaffId: s2.staffId });
      assert.equal(reRes.status, 200);
      assert.equal(reRes.json.job.assigned_staff_id, s2.staffId);

      const listRes = await admin.apiAction('getSpecialJobs', { status: 'assigned', category: 'detailing', staffId: s2.staffId });
      assert.equal(listRes.status, 200);
      assert.ok(listRes.json.jobs.some((j) => j.id === job.id));
    }
  });

  // =========================================================================
  // E2E-F7: DCC Route Planning, Exclusivity, Drag-and-Drop & Temporary Cover
  // =========================================================================
  registry.register({
    id: 'T1-F7-01',
    tier: 1,
    feature: 'E2E-F7',
    title: 'createRoute + assignStaffToRoute + getAllRoutes returns { success, count, routes }',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const dccStaff = await createStaff(admin, { can_dcc: true });
      const rRes = await admin.apiAction('createRoute', { name: `Sigra Morning ${seed.uniqueSuffix('rt')}`, area: 'Sigra, Varanasi' });
      assert.equal(rRes.status, 200);

      const assignRes = await admin.apiAction('assignStaffToRoute', { routeId: rRes.json.route.id, staffId: dccStaff.staffId });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.json.route.staff_id, dccStaff.staffId);

      const allRes = await admin.apiAction('getAllRoutes');
      assert.equal(allRes.status, 200);
      assert.equal(allRes.json.success, true);
      assert.equal(typeof allRes.json.count, 'number');
      assert.ok(Array.isArray(allRes.json.routes));
      assert.ok(allRes.json.routes.some((r) => r.id === rRes.json.route.id));
    }
  });

  registry.register({
    id: 'T1-F7-02',
    tier: 1,
    feature: 'E2E-F7',
    title: 'addStopToRoute adds vehicle to route and removes it from getUnassignedDccVehicles',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const dccStaff = await createStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, {
          customerId: cust.customerId,
          vehicleId: veh.id,
          locationId: cust.locationId,
          staffId: dccStaff.staffId
        });
        const route = (await admin.apiAction('createRoute', { name: `Lanka Route ${seed.uniqueSuffix('rt')}`, staffId: dccStaff.staffId })).json.route;
        tracker.track('routes', route.id);

        const beforeUnassigned = await admin.apiAction('getUnassignedDccVehicles');
        assert.ok(beforeUnassigned.json.unassigned.some((v) => v.id === veh.id));

        const addRes = await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id });
        assert.equal(addRes.status, 200);
        tracker.track('routeStops', addRes.json.stop.id);

        const afterUnassigned = await admin.apiAction('getUnassignedDccVehicles');
        assert.ok(!afterUnassigned.json.unassigned.some((v) => v.id === veh.id));
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F7-03',
    tier: 1,
    feature: 'E2E-F7',
    title: 'reorderRouteStops updates car cleaning sequence order for drag-and-drop planning',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const v1 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        const v2 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', v1.id);
        tracker.track('vehicles', v2.id);
        const dccStaff = await createStaff(admin, tracker, { can_dcc: true });
        const b1 = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: v1.id, locationId: cust.locationId, staffId: dccStaff.staffId });
        const b2 = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: v2.id, locationId: cust.locationId, staffId: dccStaff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `Seq Route ${seed.uniqueSuffix('rt')}`, staffId: dccStaff.staffId })).json.route;
        tracker.track('routes', route.id);

        const s1 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v1.id, bookingId: b1.id })).json.stop;
        const s2 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v2.id, bookingId: b2.id })).json.stop;
        tracker.track('routeStops', s1.id);
        tracker.track('routeStops', s2.id);

        const reRes = await admin.apiAction('reorderRouteStops', { routeId: route.id, orderedStopIds: [s2.id, s1.id] });
        assert.equal(reRes.status, 200);

        const det = (await admin.apiAction('getRouteDetails', { routeId: route.id })).json;
        assert.equal(det.stops[0].id, s2.id);
        assert.equal(det.stops[0].sequence_order, 1);
        assert.equal(det.stops[1].id, s1.id);
        assert.equal(det.stops[1].sequence_order, 2);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F7-04',
    tier: 1,
    feature: 'E2E-F7',
    title: 'moveStopBetweenRoutes transfers stop cleanly from source route to target route',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const sA = await createStaff(admin, tracker, { can_dcc: true });
        const sB = await createStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: sA.staffId });
        const rA = (await admin.apiAction('createRoute', { name: `Route A ${seed.uniqueSuffix('rt')}`, staffId: sA.staffId })).json.route;
        const rB = (await admin.apiAction('createRoute', { name: `Route B ${seed.uniqueSuffix('rt')}`, staffId: sB.staffId })).json.route;
        tracker.track('routes', rA.id);
        tracker.track('routes', rB.id);

        const stop = (await admin.apiAction('addStopToRoute', { routeId: rA.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);
        const moveRes = await admin.apiAction('moveStopBetweenRoutes', { sourceRouteId: rA.id, targetRouteId: rB.id, stopId: stop.id });
        assert.equal(moveRes.status, 200);

        const detA = (await admin.apiAction('getRouteDetails', { routeId: rA.id })).json;
        const detB = (await admin.apiAction('getRouteDetails', { routeId: rB.id })).json;
        assert.equal(detA.stops.length, 0);
        assert.equal(detB.stops.length, 1);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F7-05',
    tier: 1,
    feature: 'E2E-F7',
    title: 'createTempRouteAssignment covers route without overwriting permanent staff and endTempRouteAssignment closes cover',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const perm = await createStaff(admin, { can_dcc: true });
      const cover = await createStaff(admin, { can_dcc: true });
      const route = (await admin.apiAction('createRoute', { name: `Cover Route ${seed.uniqueSuffix('rt')}`, staffId: perm.staffId })).json.route;
      const today = getIstDateString(0);

      const covRes = await admin.apiAction('createTempRouteAssignment', {
        routeId: route.id,
        coverStaffId: cover.staffId,
        startDate: today,
        endDate: today,
        reason: 'Medical leave'
      });
      assert.equal(covRes.status, 200);

      const allRes = (await admin.apiAction('getAllRoutes')).json;
      const found = allRes.routes.find((r) => r.id === route.id);
      assert.equal(found.staff_id, perm.staffId); // permanent owner untouched
      assert.equal(found.active_cover.cover_staff_id, cover.staffId);

      const endRes = await admin.apiAction('endTempRouteAssignment', { assignmentId: covRes.json.assignment.id });
      assert.equal(endRes.status, 200);
      const afterEnd = (await admin.apiAction('getAllRoutes')).json.routes.find((r) => r.id === route.id);
      assert.equal(afterEnd.active_cover, null);
    }
  });

  // =========================================================================
  // E2E-F8: DCC Daily Jobs, IST Schedulers & Live Work Status
  // =========================================================================
  registry.register({
    id: 'T1-F8-01',
    tier: 1,
    feature: 'E2E-F8',
    title: 'generateDccDailyJobs generates auto_generated jobs on consecutive IST days for daily frequency',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: true });
      const dccSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'dcc');
      const booking = (await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        serviceId: dccSvc.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        assignedDccStaffId: staff.staffId,
        frequency: 'daily'
      })).json.booking;
      const route = (await admin.apiAction('createRoute', { name: `Daily Gen ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
      await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id });

      const d0 = getIstDateString(0);
      const d1 = getIstDateString(1);
      await admin.apiAction('generateDccDailyJobs', { date: d0 });
      await admin.apiAction('generateDccDailyJobs', { date: d1 });

      const j0 = (await admin.apiAction('getDccDailyJobs', { startDate: d0, endDate: d0, routeId: route.id })).json.records;
      const j1 = (await admin.apiAction('getDccDailyJobs', { startDate: d1, endDate: d1, routeId: route.id })).json.records;
      assert.ok(j0.some((j) => j.vehicle_id === veh.id && j.status === 'auto_generated'));
      assert.ok(j1.some((j) => j.vehicle_id === veh.id && j.status === 'auto_generated'));
    }
  });

  registry.register({
    id: 'T1-F8-02',
    tier: 1,
    feature: 'E2E-F8',
    title: 'generateDccDailyJobs enforces Alternate day parity (Day+0 yes, Day+1 skip, Day+2 yes)',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: true });
      const dccSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'dcc');
      const d0 = getIstDateString(0);
      const d1 = getIstDateString(1);
      const d2 = getIstDateString(2);

      const booking = (await admin.apiAction('createBooking', {
        customerId: cust.customerId,
        serviceId: dccSvc.id,
        assetType: 'vehicle',
        vehicleId: veh.id,
        locationId: cust.locationId,
        assignedDccStaffId: staff.staffId,
        frequency: 'alternate',
        startDate: d0
      })).json.booking;

      const route = (await admin.apiAction('createRoute', { name: `Alt Gen ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
      await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id });

      await admin.apiAction('generateDccDailyJobs', { date: d0 });
      await admin.apiAction('generateDccDailyJobs', { date: d1 });
      await admin.apiAction('generateDccDailyJobs', { date: d2 });

      const j0 = (await admin.apiAction('getDccDailyJobs', { startDate: d0, endDate: d0, routeId: route.id })).json.records;
      const j1 = (await admin.apiAction('getDccDailyJobs', { startDate: d1, endDate: d1, routeId: route.id })).json.records;
      const j2 = (await admin.apiAction('getDccDailyJobs', { startDate: d2, endDate: d2, routeId: route.id })).json.records;

      assert.ok(j0.some((j) => j.vehicle_id === veh.id), 'Expected job on anchor day d0');
      assert.ok(!j1.some((j) => j.vehicle_id === veh.id), 'Expected alternate day d1 to be skipped');
      assert.ok(j2.some((j) => j.vehicle_id === veh.id), 'Expected job on alternating day d2');
    }
  });

  registry.register({
    id: 'T1-F8-03',
    tier: 1,
    feature: 'E2E-F8',
    title: 'recordDailyCleanWithPhoto marks today DCC job as completed with photo proof',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '4321' });
        const booking = await createDccBookingForVehicle(admin, tracker, {
          customerId: cust.customerId,
          vehicleId: veh.id,
          locationId: cust.locationId,
          staffId: staff.staffId
        });
        const route = (await admin.apiAction('createRoute', { name: `Clean Punch ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const staffClient = ctx.newClient();
        await staffClient.staffLogin({ phone: staff.phone, pin: '4321', deviceId: 'dev-clean' });

        const res = await staffClient.apiAction('recordDailyCleanWithPhoto', {
          vehicleId: veh.id,
          photoBase64: seed.TINY_PNG_BASE64,
          punchLatitude: 25.3119,
          punchLongitude: 82.9873
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.job.status, 'completed');
        assert.ok(res.json.job.photo_url);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F8-04',
    tier: 1,
    feature: 'E2E-F8',
    title: 'recordDailyCleanWithPhoto with carNotPresent marks job car_not_available without photo',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '5151' });
        const booking = await createDccBookingForVehicle(admin, tracker, {
          customerId: cust.customerId,
          vehicleId: veh.id,
          locationId: cust.locationId,
          staffId: staff.staffId
        });
        const route = (await admin.apiAction('createRoute', { name: `CNA Route ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const staffClient = ctx.newClient();
        await staffClient.staffLogin({ phone: staff.phone, pin: '5151', deviceId: 'dev-cna' });

        const res = await staffClient.apiAction('recordDailyCleanWithPhoto', {
          vehicleId: veh.id,
          carNotPresent: true,
          notes: 'Car out of station'
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.job.status, 'car_not_available');
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F8-05',
    tier: 1,
    feature: 'E2E-F8',
    title: 'getDailyCleanReports filters live DCC status and updateDailyCleanReportStatus supports missed',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true });
        const booking = await createDccBookingForVehicle(admin, tracker, {
          customerId: cust.customerId,
          vehicleId: veh.id,
          locationId: cust.locationId,
          staffId: staff.staffId
        });
        const route = (await admin.apiAction('createRoute', { name: `Missed Route ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const today = getIstDateString(0);
        const rep1 = await admin.apiAction('getDailyCleanReports', { startDate: today, endDate: today, routeId: route.id });
        assert.equal(rep1.status, 200);
        const job = rep1.json.records.find((r) => r.vehicle_id === veh.id);
        assert.ok(job);

        const upd = await admin.apiAction('updateDailyCleanReportStatus', { reportId: job.id, status: 'missed', reason: 'EOD sweep test' });
        assert.equal(upd.status, 200);
        assert.equal(upd.json.job.status, 'missed');
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  // =========================================================================
  // E2E-F9: Non-DCC 6-Step Lifecycle, Auto-Verify & SSE
  // =========================================================================
  registry.register({
    id: 'T1-F9-01',
    tier: 1,
    feature: 'E2E-F9',
    title: 'Full 6-step Non-DCC lifecycle: scheduled -> assigned -> enrolled -> in_progress -> completed -> verified',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_car_wash: true, pin: '4455' });

      const created = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId })).json.job;
      assert.equal(created.status, 'scheduled');

      const assigned = (await admin.apiAction('assignSpecialJob', { jobId: created.id, staffId: staff.staffId })).json.job;
      assert.equal(assigned.status, 'assigned');

      const staffClient = ctx.newClient();
      await staffClient.staffLogin({ phone: staff.phone, pin: '4455', deviceId: 'dev-6step' });

      const enrolled = (await staffClient.apiAction('enrollSpecialJob', { jobId: created.id })).json.job;
      assert.equal(enrolled.status, 'enrolled');

      const started = (await staffClient.apiAction('startSpecialJob', { jobId: created.id, photos: [seed.TINY_PNG_BASE64] })).json.job;
      assert.equal(started.status, 'in_progress');

      const completed = (await staffClient.apiAction('completeSpecialJob', { jobId: created.id, photos: [seed.TINY_PNG_BASE64], notes: 'Done' })).json.job;
      assert.equal(completed.status, 'completed');

      const verified = (await admin.apiAction('verifySpecialJob', { jobId: created.id })).json.job;
      assert.equal(verified.status, 'verified');
    }
  });

  registry.register({
    id: 'T1-F9-02',
    tier: 1,
    feature: 'E2E-F9',
    title: 'uploadSpecialJobProofPhotos uploads after-photos during in_progress before completion',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_detailing: true, pin: '9911' });
      const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId, staffId: staff.staffId })).json.job;

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: staff.phone, pin: '9911', deviceId: 'dev-proof' });
      await sc.apiAction('enrollSpecialJob', { jobId: job.id });
      await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });

      const proofRes = await sc.apiAction('uploadSpecialJobProofPhotos', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
      assert.equal(proofRes.status, 200);
      assert.equal(proofRes.json.afterPhotos.length, 1);
    }
  });

  registry.register({
    id: 'T1-F9-03',
    tier: 1,
    feature: 'E2E-F9',
    title: 'completeSpecialJob sets auto_verify_at based on configured auto_verify_hours',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      const initSettings = await admin.apiAction('getAdminSettings');
      const origHours = Number((initSettings.json && initSettings.json.settings && initSettings.json.settings.auto_verify_hours) || 24);
      try {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: 12 });

        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: false, can_car_wash: true, pin: '8822' });
        const job = (await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: staff.staffId })).json.job;
        tracker.track('serviceJobs', job.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '8822', deviceId: 'dev-autover' });
        await sc.apiAction('enrollSpecialJob', { jobId: job.id });
        await sc.apiAction('startSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
        const compRes = await sc.apiAction('completeSpecialJob', { jobId: job.id, photos: [seed.TINY_PNG_BASE64] });
        assert.equal(compRes.status, 200);

        const completedAtMs = Date.parse(compRes.json.job.completed_at);
        const autoVerifyMs = Date.parse(compRes.json.job.auto_verify_at);
        const diffHours = Math.round((autoVerifyMs - completedAtMs) / 3600000);
        assert.equal(diffHours, 12);
      } finally {
        await admin.apiAction('saveAdminSettings', { auto_verify_hours: origHours });
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F9-04',
    tier: 1,
    feature: 'E2E-F9',
    title: 'cancelSpecialJob cancels job with reason and restores booking remaining_count',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const washSvc = (await admin.apiAction('getServices')).json.services.find((s) => s.category === 'car_wash');
      const pkg = (await admin.apiAction('savePackage', {
        packageData: { name: `Wash Rest ${seed.uniqueSuffix('p')}`, validity_days: 60, price_5_seater: 900, price_5_plus_seater: 1200, items: [{ serviceId: washSvc.id, quantity: 2 }] }
      })).json.package;
      const booking = (await admin.apiAction('createBooking', { customerId: cust.customerId, packageId: pkg.id, assetType: 'vehicle', vehicleId: veh.id, locationId: cust.locationId })).json.booking;
      const job = (await admin.apiAction('createServiceJob', { bookingId: booking.id, customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId })).json.job;

      const cancelRes = await admin.apiAction('cancelSpecialJob', { jobId: job.id, reason: 'Customer rescheduled' });
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.json.job.status, 'cancelled');

      const bAfter = (await admin.apiAction('getBookings', { customerId: cust.customerId })).json.bookings.find((b) => b.id === booking.id);
      assert.equal(bAfter.remaining_count, 2);
    }
  });

  registry.register({
    id: 'T1-F9-05',
    tier: 1,
    feature: 'E2E-F9',
    title: 'GET /api/admin-realtime-stream emits CONNECTED and live SPECIAL_JOB_CHANGED SSE event',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;

      const sseRes = await admin.readSseEvents('/api/admin-realtime-stream', {
        authMode: 'bearer-admin',
        timeoutMs: 3000,
        maxEvents: 2,
        triggerFn: async () => {
          await admin.apiAction('createServiceJob', {
            customerId: cust.customerId,
            serviceCategory: 'detailing',
            vehicleId: veh.id,
            locationId: cust.locationId
          });
        }
      });
      assert.equal(sseRes.status, 200);
      assert.ok(sseRes.events.some((e) => e.data && e.data.type === 'CONNECTED'));
      assert.ok(sseRes.events.some((e) => e.data && e.data.type === 'SPECIAL_JOB_CHANGED'));
    }
  });

  // =========================================================================
  // E2E-F10: Staff Portal Mobile PWA & Live Tracking
  // =========================================================================
  registry.register({
    id: 'T1-F10-01',
    tier: 1,
    feature: 'E2E-F10',
    title: 'GET /api/staff-data returns canonical DCC stops in exact sequence_order',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const v1 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        const v2 = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', v1.id);
        tracker.track('vehicles', v2.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '3456' });
        const b1 = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: v1.id, locationId: cust.locationId, staffId: staff.staffId });
        const b2 = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: v2.id, locationId: cust.locationId, staffId: staff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `Staff Seq ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const s1 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v1.id, bookingId: b1.id })).json.stop;
        const s2 = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: v2.id, bookingId: b2.id })).json.stop;
        tracker.track('routeStops', s1.id);
        tracker.track('routeStops', s2.id);
        await admin.apiAction('reorderRouteStops', { routeId: route.id, orderedStopIds: [s2.id, s1.id] });

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '3456', deviceId: 'dev-feed' });
        const feedRes = await sc.get('/api/staff-data', { authMode: 'bearer-staff' });
        assert.equal(feedRes.status, 200);
        assert.equal(feedRes.json.dailyCarCleaning.length, 2);
        assert.equal(feedRes.json.dailyCarCleaning[0].vehicleId, v2.id);
        assert.equal(feedRes.json.dailyCarCleaning[1].vehicleId, v1.id);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F10-02',
    tier: 1,
    feature: 'E2E-F10',
    title: 'getStaffData includes N linked addresses per customer and exact asset linkedAddress',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const l2 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(cust.customerId, 1, { isPrimary: false }))).json.location;
        const l3 = (await admin.apiAction('saveCustomerLocation', seed.makeLocationPayload(cust.customerId, 2, { isPrimary: false }))).json.location;
        tracker.track('locations', l2.id);
        tracker.track('locations', l3.id);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, l3.id))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '6789' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: l3.id, staffId: staff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `N-Addr ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '6789', deviceId: 'dev-naddr' });
        const feed = (await sc.apiAction('getStaffData', {}, { authMode: 'bearer-staff' })).json;
        assert.equal(feed.dailyCarCleaning[0].locationId, l3.id);
        assert.equal(feed.dailyCarCleaning[0].addresses.length, 3);
        assert.ok(feed.dailyCarCleaning[0].addresses.some((a) => a.id === l2.id));
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F10-03',
    tier: 1,
    feature: 'E2E-F10',
    title: 'getStaffData exposes unified detailing category alongside car_wash and solar jobs',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const cust = await createCustomerWithLocation(admin);
      const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
      const staff = await createStaff(admin, { can_dcc: false, can_car_wash: true, can_detailing: true, pin: '2468' });

      await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'detailing', vehicleId: veh.id, locationId: cust.locationId, staffId: staff.staffId });
      await admin.apiAction('createServiceJob', { customerId: cust.customerId, serviceCategory: 'car_wash', vehicleId: veh.id, locationId: cust.locationId, staffId: staff.staffId });

      const sc = ctx.newClient();
      await sc.staffLogin({ phone: staff.phone, pin: '2468', deviceId: 'dev-det' });
      const feed = (await sc.apiAction('getStaffData', {}, { authMode: 'bearer-staff' })).json;
      assert.equal(feed.detailingJobs.length, 1);
      assert.equal(feed.carWashing.length, 1);
      assert.ok(feed.otherJobs.every((j) => j.service_category !== 'interior_detailing' && j.service_category !== 'exterior_detailing'));
    }
  });

  registry.register({
    id: 'T1-F10-04',
    tier: 1,
    feature: 'E2E-F10',
    title: 'syncCompletions offline batch sync completes assigned DCC job',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const tracker = createEntityTracker();
      try {
        const cust = await createCustomerWithLocation(admin, tracker);
        const veh = (await admin.apiAction('saveVehicle', seed.makeVehiclePayload(cust.customerId, cust.locationId))).json.vehicle;
        tracker.track('vehicles', veh.id);
        const staff = await createStaff(admin, tracker, { can_dcc: true, pin: '1357' });
        const booking = await createDccBookingForVehicle(admin, tracker, { customerId: cust.customerId, vehicleId: veh.id, locationId: cust.locationId, staffId: staff.staffId });
        const route = (await admin.apiAction('createRoute', { name: `Sync Rt ${seed.uniqueSuffix('rt')}`, staffId: staff.staffId })).json.route;
        tracker.track('routes', route.id);
        const stop = (await admin.apiAction('addStopToRoute', { routeId: route.id, vehicleId: veh.id, bookingId: booking.id })).json.stop;
        tracker.track('routeStops', stop.id);

        const sc = ctx.newClient();
        await sc.staffLogin({ phone: staff.phone, pin: '1357', deviceId: 'dev-sync' });
        const syncRes = await sc.apiAction('syncCompletions', { completions: [{ vehicleId: veh.id }] }, { authMode: 'bearer-staff' });
        assert.equal(syncRes.status, 200);
        assert.equal(syncRes.json.syncedCount, 1);
      } finally {
        await tracker.cleanup(admin);
      }
    }
  });

  registry.register({
    id: 'T1-F10-05',
    tier: 1,
    feature: 'E2E-F10',
    title: 'Staff Live Tracking heartbeat, admin ping + SSE, ping response, summary & movement history',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const staff = await createStaff(admin, { can_dcc: true, pin: '7788' });
      const sc = ctx.newClient();
      await sc.staffLogin({ phone: staff.phone, pin: '7788', deviceId: 'dev-track' });

      const hbRes = await sc.apiAction('recordStaffHeartbeat', { latitude: 25.312, longitude: 82.987 }, { authMode: 'bearer-staff' });
      assert.equal(hbRes.status, 200);
      assert.equal(hbRes.json.success, true);

      const sseRes = await sc.readSseEvents(`/api/staff-ping-stream?staffId=${staff.staffId}`, {
        authMode: 'bearer-staff',
        timeoutMs: 3000,
        maxEvents: 2,
        triggerFn: async () => {
          await admin.apiAction('pingStaffLocation', { staffId: staff.staffId });
        }
      });
      assert.equal(sseRes.status, 200);
      assert.ok(sseRes.events.some((e) => e.data && e.data.type === 'LOCATION_PING'));

      const pending = (await sc.apiAction('getPendingStaffPings', {}, { authMode: 'bearer-staff' })).json;
      assert.ok(pending.pings.length >= 1);

      const respRes = await sc.apiAction('respondToLocationPing', { pingId: pending.pings[0].id, latitude: 25.313, longitude: 82.988 }, { authMode: 'bearer-staff' });
      assert.equal(respRes.status, 200);

      const summary = await admin.apiAction('getStaffTrackingSummary');
      assert.equal(summary.status, 200);
      assert.ok(summary.json.staff.some((s) => s.id === staff.staffId));

      const hist = await admin.apiAction('getStaffMovementHistory', { staffId: staff.staffId });
      assert.equal(hist.status, 200);
      assert.ok(hist.json.breadcrumbs.length >= 1);
    }
  });

  // =========================================================================
  // E2E-F11: Leads, Public Homepage, Careers, ?v= Cache-Busting & Legacy Elimination
  // =========================================================================
  registry.register({
    id: 'T1-F11-01',
    tier: 1,
    feature: 'E2E-F11',
    title: 'Public POST /api/leads creates lead and Admin convertLead converts to customer with solar',
    async fn(ctx) {
      const pub = ctx.newClient();
      const leadInput = seed.makeLeadPayload({ interestedService: 'solar' });
      const lRes = await pub.post('/api/leads', leadInput);
      assert.equal(lRes.status, 200);
      assert.equal(lRes.json.success, true);

      const admin = await ctx.getAdminClient();
      const convRes = await admin.apiAction('convertLead', {
        leadId: lRes.json.lead.id,
        convertData: { addressText: 'Bhelupur, Varanasi', panelCount: 16, kwLoad: 7.5 }
      });
      assert.equal(convRes.status, 200);
      assert.ok(convRes.json.customerId);
      assert.equal(convRes.json.solarInstallation.panel_count, 16);
    }
  });

  registry.register({
    id: 'T1-F11-02',
    tier: 1,
    feature: 'E2E-F11',
    title: 'PUT /api/admin/homepage-config updates nested rates.carCare and GET /api/public/homepage-config reflects them',
    async fn(ctx) {
      const admin = await ctx.getAdminClient();
      const pub = ctx.newClient();
      const initCfgRes = await pub.get('/api/public/homepage-config');
      assert.equal(initCfgRes.status, 200);
      const origRates = JSON.parse(JSON.stringify(initCfgRes.json.rates || {}));

      const updatedRates = JSON.parse(JSON.stringify(origRates));
      updatedRates.carCare = updatedRates.carCare || {};
      updatedRates.carCare.dcc = updatedRates.carCare.dcc || {};
      updatedRates.carCare.dcc.fiveSeater = updatedRates.carCare.dcc.fiveSeater || {};
      updatedRates.carCare.detailing = updatedRates.carCare.detailing || {};
      const newRate = 1349;
      updatedRates.carCare.dcc.fiveSeater.basic = newRate;
      updatedRates.carCare.detailing.interiorDetailingStarts = 1999;

      try {
        const upd = await admin.put('/api/admin/homepage-config', { rates: updatedRates });
        assert.equal(upd.status, 200);
        assert.equal(upd.json.config.rates.carCare.dcc.fiveSeater.basic, newRate);
        assert.equal(upd.json.config.rates.carCare.detailing.interiorDetailingStarts, 1999);

        const pubCfg = await pub.get('/api/public/homepage-config');
        assert.equal(pubCfg.status, 200);
        assert.equal(pubCfg.json.rates.carCare.dcc.fiveSeater.basic, newRate);
      } finally {
        await admin.put('/api/admin/homepage-config', { rates: origRates });
      }
    }
  });

  registry.register({
    id: 'T1-F11-03',
    tier: 1,
    feature: 'E2E-F11',
    title: 'Careers page /careers, POST /api/careers/apply, and Admin GET /api/admin/job-applications work end-to-end',
    async fn(ctx) {
      const pub = ctx.newClient();
      const page = await pub.get('/careers');
      assert.equal(page.status, 200);
      assert.match(page.text, /<html/i);

      const appRes = await pub.post('/api/careers/apply', { name: 'Rohan Kumar', phone: seed.uniquePhone(), role: 'DCC Cleaner' });
      assert.equal(appRes.status, 200);

      const admin = await ctx.getAdminClient();
      const listRes = await admin.get('/api/admin/job-applications');
      assert.equal(listRes.status, 200);
      assert.ok(listRes.json.applications.some((a) => a.id === appRes.json.application.id));
    }
  });

  registry.register({
    id: 'T1-F11-04',
    tier: 1,
    feature: 'E2E-F11',
    title: '/admin-v2 and /admin/v2 return 302 redirect to /admin, and /admin & /staff linked assets include ?v= cache-busters',
    async fn(ctx) {
      const pub = ctx.newClient();
      for (const oldPath of ['/admin-v2', '/admin/v2']) {
        const res = await pub.get(oldPath);
        assert.equal(res.status, 302, `Expected 302 for ${oldPath}`);
        assert.match(String(res.headers.location || ''), /^\/admin/);
      }

      await ctx.browser.goto('/admin');
      const adminDom = await ctx.browser.queryDomSummary();
      assert.equal(adminDom.assetVersionErrors.length, 0, adminDom.assetVersionErrors.join('; '));
      const adminAssets = await ctx.browser.fetchLinkedAssets();
      assert.ok(adminAssets.some((a) => a.ref.includes('/admin-v2/')), 'Expected at least one /admin-v2/ asset reference');
      for (const asset of adminAssets) {
        assert.equal(asset.status, 200, `Linked asset ${asset.ref} returned ${asset.status}`);
        if (asset.ref.includes('/admin-v2/')) {
          assert.ok(asset.ref.includes('?v='), `Missing ?v= cache-buster on ${asset.ref}`);
        }
      }

      await ctx.browser.goto('/staff');
      const staffAssets = await ctx.browser.fetchLinkedAssets();
      assert.ok(staffAssets.length >= 1, 'Expected at least one local JS/CSS asset on /staff');
      for (const asset of staffAssets) {
        assert.equal(asset.status, 200, `Linked /staff asset ${asset.ref} returned ${asset.status}`);
        assert.ok(asset.ref.includes('?v='), `Missing ?v= cache-buster on /staff asset ${asset.ref}`);
      }
    }
  });

  registry.register({
    id: 'T1-F11-05',
    tier: 1,
    feature: 'E2E-F11',
    title: '/admin renders 11 canonical nav sections + VIEW-ONLY profile and /staff renders 4-6 PIN + unified Detailing',
    async fn(ctx) {
      const pub = ctx.newClient();
      const adm = await pub.get('/admin');
      assert.equal(adm.status, 200);
      const navMatches = adm.text.match(/id=["']v2NavBtn[^"']+["']/g) || [];
      assert.equal(navMatches.length, 11, `Expected exactly 11 Admin nav tabs, found ${navMatches.length}`);
      assert.match(adm.text, /v2View_settings/);
      assert.match(adm.text, /5_seater/);
      assert.match(adm.text, /5_plus_seater/);

      const stf = await pub.get('/staff');
      assert.equal(stf.status, 200);
      assert.match(stf.text, /staffPinInput/);
      assert.match(stf.text, /data-category=["']detailing["']/);
    }
  });
}

module.exports = { registerTier1Tests };
