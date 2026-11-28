'use strict';

const assert = require('node:assert/strict');
const { solveMathPrompt } = require('./http_client');
const seed = require('../fixtures/brd_seed');

function createEntityTracker() {
  const tracked = {
    tempAssignments: [],
    routeStops: [],
    routes: [],
    serviceJobs: [],
    bookings: [],
    vehicles: [],
    solarInstallations: [],
    locations: [],
    customers: [],
    leads: [],
    staff: [],
    packages: [],
    addons: [],
    services: [],
    solarTiers: []
  };

  return {
    track(kind, id) {
      if (id !== undefined && id !== null && tracked[kind]) {
        if (!tracked[kind].includes(id)) tracked[kind].push(id);
      }
      return id;
    },
    async cleanup(admin) {
      if (!admin) return;
      const tryAction = async (action, payload) => {
        try {
          await admin.apiAction(action, payload);
        } catch {
          // Best-effort live teardown: ignore already-deleted/404/network errors
        }
      };

      for (const assignmentId of tracked.tempAssignments.slice().reverse()) {
        await tryAction('endTempRouteAssignment', { assignmentId });
      }
      for (const stopId of tracked.routeStops.slice().reverse()) {
        await tryAction('removeStopFromRoute', { stopId });
      }
      for (const routeId of tracked.routes.slice().reverse()) {
        await tryAction('deleteRoute', { routeId });
      }
      for (const jobId of tracked.serviceJobs.slice().reverse()) {
        await tryAction('deleteSpecialJob', { jobId });
      }
      for (const bookingId of tracked.bookings.slice().reverse()) {
        await tryAction('cancelBooking', { bookingId });
      }
      for (const vehicleId of tracked.vehicles.slice().reverse()) {
        await tryAction('deleteVehicle', { vehicleId });
      }
      for (const solarId of tracked.solarInstallations.slice().reverse()) {
        await tryAction('deleteSolarInstallation', { solarId });
      }
      for (const locationId of tracked.locations.slice().reverse()) {
        await tryAction('deleteCustomerLocation', { locationId });
      }
      for (const customerId of tracked.customers.slice().reverse()) {
        await tryAction('deleteCustomer', { customerId });
      }
      for (const leadId of tracked.leads.slice().reverse()) {
        await tryAction('deleteLead', { leadId });
      }
      for (const staffId of tracked.staff.slice().reverse()) {
        await tryAction('deleteStaffMember', { staffId });
      }
      for (const packageId of tracked.packages.slice().reverse()) {
        await tryAction('deletePackage', { packageId });
      }
      for (const addonId of tracked.addons.slice().reverse()) {
        await tryAction('deleteAddon', { addonId });
      }
      for (const serviceId of tracked.services.slice().reverse()) {
        await tryAction('deleteService', { serviceId });
      }
      for (const tierId of tracked.solarTiers.slice().reverse()) {
        await tryAction('deleteSolarPricingTier', { tierId });
      }
    }
  };
}

async function createCustomerWithLocation(admin, trackerOrIdx, maybeOverrides) {
  let tracker = null;
  let idxOrOverrides = trackerOrIdx;
  if (trackerOrIdx && typeof trackerOrIdx.track === 'function') {
    tracker = trackerOrIdx;
    idxOrOverrides = maybeOverrides;
  }
  let overrides = {};
  let areaIdx = 0;
  if (typeof idxOrOverrides === 'number') {
    areaIdx = idxOrOverrides;
  } else if (idxOrOverrides && typeof idxOrOverrides === 'object') {
    overrides = idxOrOverrides;
  }
  const preset = seed.VARANASI_AREAS[areaIdx % seed.VARANASI_AREAS.length];
  const res = await admin.apiAction('saveCustomer', {
    customerData: seed.makeCustomerPayload({
      addressLabel: preset.label,
      addressText: preset.addressText,
      latitude: preset.latitude,
      longitude: preset.longitude,
      ...overrides
    })
  });
  assert.equal(res.status, 200, `saveCustomer failed: ${res.text}`);
  assert.equal(res.json.success, true);
  const customerId = res.json.customerId || res.json.customer.id;
  const locationId = res.json.location.id;
  if (tracker) {
    tracker.track('customers', customerId);
    tracker.track('locations', locationId);
  }
  return { customerId, locationId, customer: res.json.customer, location: res.json.location };
}

async function createStaff(admin, trackerOrOverrides, maybeOverrides) {
  let tracker = null;
  let overrides = trackerOrOverrides || {};
  if (trackerOrOverrides && typeof trackerOrOverrides.track === 'function') {
    tracker = trackerOrOverrides;
    overrides = maybeOverrides || {};
  }
  const staffData = seed.makeStaffPayload(overrides);
  const res = await admin.apiAction('saveStaffMember', { staffData });
  assert.equal(res.status, 200, `saveStaffMember failed: ${res.text}`);
  assert.equal(res.json.success, true);
  const staffId = res.json.staffId || res.json.staff.id;
  if (tracker) tracker.track('staff', staffId);
  return { staffId, staff: res.json.staff, pin: staffData.pin, phone: staffData.phone };
}

async function createDccBookingForVehicle(admin, tracker, {
  customerId,
  vehicleId,
  locationId,
  staffId,
  frequency = 'daily',
  startDate
}) {
  const svcs = (await admin.apiAction('getServices')).json.services;
  const dccSvc = svcs.find((s) => s.category === 'dcc');
  assert.ok(dccSvc, 'Expected canonical dcc service in getServices');
  const payload = {
    customerId,
    serviceId: dccSvc.id,
    assetType: 'vehicle',
    vehicleId,
    locationId,
    assignedDccStaffId: staffId,
    frequency
  };
  if (startDate) payload.startDate = startDate;
  const res = await admin.apiAction('createBooking', payload);
  assert.equal(res.status, 200, `createBooking (DCC) failed: ${res.text}`);
  const booking = res.json.booking;
  if (tracker) tracker.track('bookings', booking.id);
  return booking;
}

function computeExpectedSolarTotal(tiers, panelCount, isAmc, durationMonths = 1, frequency = 'monthly') {
  const active = (tiers || []).filter((t) => t.is_active !== false);
  const matched = active.find(
    (t) => panelCount >= Number(t.min_panels) && (t.max_panels === null || t.max_panels === undefined || panelCount <= Number(t.max_panels))
  ) || active[active.length - 1];
  assert.ok(matched, `No active solar pricing tier found for panelCount=${panelCount}`);
  const perPanel = Number(matched.per_panel_rate);
  const minBilling = Number(isAmc ? matched.min_billing_amc : matched.min_billing_onetime);
  const perClean = Math.max(panelCount * perPanel, minBilling);
  if (!isAmc) return perClean;
  const freqMult = frequency === 'weekly' ? 4 : frequency === 'biweekly' ? 2 : 1;
  return perClean * freqMult * Math.max(1, Number(durationMonths || 1));
}

function makePricePattern(amount) {
  return new RegExp(String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',?'));
}

async function loginAdminBrowser(browser, creds) {
  if (browser.isHttpFallback()) return;
  await browser.waitForCondition(
    `(() => {
      const app = document.getElementById('v2AppContainer');
      const gate = document.getElementById('v2LoginGate');
      return (app && !app.hidden) || (gate && !gate.hidden && gate.style.display !== 'none');
    })()`,
    5000
  );

  const alreadyUnlocked = await browser.evaluate(`
    const app = document.getElementById('v2AppContainer');
    return Boolean(app && !app.hidden && app.getAttribute('aria-hidden') !== 'true');
  `);
  if (alreadyUnlocked) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await browser.fill('#v2AdminPasswordInput', creds.adminPassword);
    const capPrompt = await browser.evaluate(`
      const box = document.getElementById('v2LoginCaptchaBox');
      const p = document.getElementById('v2LoginCaptchaPrompt');
      if (box && !box.hidden && p && p.textContent.trim()) return p.textContent.trim();
      return '';
    `);
    if (capPrompt) {
      const answer = solveMathPrompt(capPrompt);
      await browser.fill('#v2LoginCaptchaInput', answer);
    }
    await browser.click('#v2LoginSubmitBtn');

    const settled = await browser.waitForCondition(
      `(() => {
        const app = document.getElementById('v2AppContainer');
        if (app && !app.hidden && app.getAttribute('aria-hidden') !== 'true') return 'unlocked';
        const capBox = document.getElementById('v2LoginCaptchaBox');
        const capPrompt = document.getElementById('v2LoginCaptchaPrompt');
        if (capBox && !capBox.hidden && capPrompt && capPrompt.textContent.trim()) return 'captcha';
        return false;
      })()`,
      5000
    );
    if (settled === 'unlocked') break;
  }

  const unlocked = await browser.evaluate(`
    const app = document.getElementById('v2AppContainer');
    return Boolean(app && !app.hidden);
  `);
  assert.equal(unlocked, true, 'Expected #v2AppContainer to become visible after interactive Admin UI login');
}

async function loginStaffBrowser(browser, phone, pin) {
  if (browser.isHttpFallback()) return;
  const gateVisible = await browser.evaluate(`
    const gate = document.getElementById('staffAuthGate');
    return Boolean(gate && !gate.hidden && !gate.classList.contains('is-hidden') && getComputedStyle(gate).display !== 'none');
  `);
  if (!gateVisible) return;

  await browser.fill('#staffPhoneInput', phone);
  await browser.fill('#staffPinInput', pin);
  await browser.click('#btnStaffLogin');

  await browser.waitForCondition(
    `(() => {
      const content = document.getElementById('staffContent');
      return Boolean(content && !content.hidden && getComputedStyle(content).display !== 'none');
    })()`,
    5000
  );
}

module.exports = {
  createEntityTracker,
  createCustomerWithLocation,
  createStaff,
  createDccBookingForVehicle,
  computeExpectedSolarTotal,
  makePricePattern,
  loginAdminBrowser,
  loginStaffBrowser
};
