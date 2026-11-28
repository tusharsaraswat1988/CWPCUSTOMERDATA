'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { getIstDateString, isAlternateCleanDay } = require('./config');

function isValidIndianMobile(phone) {
  return typeof phone === 'string' && /^[6-9]\d{9}$/.test(phone.trim());
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin.trim());
}

function computeSolarAmount(tiers, panelCount, isAmc, durationMonths = 1, frequency = 'monthly') {
  const activeTiers = tiers.filter((t) => t.is_active !== false);
  let matched = activeTiers.find(
    (t) => panelCount >= t.min_panels && (t.max_panels === null || t.max_panels === undefined || panelCount <= t.max_panels)
  );
  if (!matched && activeTiers.length > 0) {
    matched = activeTiers[activeTiers.length - 1];
  }
  const perPanel = matched ? Number(matched.per_panel_rate) : 50;
  const minFloor = matched
    ? Number(isAmc ? matched.min_billing_amc : matched.min_billing_onetime)
    : (isAmc ? 600 : 800);
  const perClean = Math.max(panelCount * perPanel, minFloor);
  if (!isAmc) return perClean;
  const freqMult = frequency === 'weekly' ? 4 : frequency === 'biweekly' ? 2 : 1;
  return perClean * freqMult * Math.max(1, Number(durationMonths || 1));
}

function createMockBrdServer(options = {}) {
  const adminPassword = options.adminPassword || process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';
  const adminUsername = options.adminUsername || process.env.E2E_ADMIN_USERNAME || 'admin';

  let idCounter = 1;
  const nextId = () => idCounter++;

  const state = {
    adminSessions: new Map(), // token -> { username, csrfToken, deviceRef, createdAt, expiresAt }
    adminDevices: new Map(),  // deviceRef -> { deviceRef, label, createdAt, revoked }
    captchas: new Map(),      // challengeId -> { answer, expiresAt }
    adminFailedAttempts: new Map(), // username -> count
    adminLockUntil: new Map(),      // username -> timestamp
    staffFailedAttempts: new Map(), // staffId -> count
    staffLockUntil: new Map(),      // staffId -> timestamp
    staffSessions: new Map(),       // token -> { staffId, deviceId, createdAt }

    customers: [],
    locations: [],
    vehicles: [],
    solarInstallations: [],
    staff: [],
    services: [
      { id: nextId(), category: 'dcc', name: 'Daily Car Cleaning', description: 'Daily exterior/interior sweep', is_active: true, sort_order: 1 },
      { id: nextId(), category: 'car_wash', name: 'Foam Car Wash', description: 'Pressure foam wash', is_active: true, sort_order: 2 },
      { id: nextId(), category: 'solar', name: 'Solar Panel Wash', description: 'De-mineralized rooftop cleaning', is_active: true, sort_order: 3 },
      { id: nextId(), category: 'detailing', name: 'Interior & Exterior Detailing', description: 'Deep detailing service', is_active: true, sort_order: 4 }
    ],
    packages: [],
    solarPricingTiers: [
      { id: nextId(), tier_name: 'Residential 1-20', min_panels: 1, max_panels: 20, per_panel_rate: 60, min_billing_onetime: 800, min_billing_amc: 600, is_active: true },
      { id: nextId(), tier_name: 'Commercial 21+', min_panels: 21, max_panels: null, per_panel_rate: 45, min_billing_onetime: 1200, min_billing_amc: 900, is_active: true }
    ],
    addons: [],
    bookings: [],
    bookingAddons: [],
    routes: [],
    routeStops: [],
    routeTempAssignments: [],
    dccDailyJobs: [],
    serviceJobs: [],
    leads: [],
    jobApplications: [],
    staffHeartbeats: [],
    staffPings: [],
    trackingEvents: [],
    adminSettings: {
      auto_verify_hours: 24
    },
    homepageConfig: {
      contact: { phone: '7054007733', phoneDisplay: '+91 7054007733', city: 'Varanasi' },
      gst: { percent: 18, label: 'GST additional', notice: 'GST additional' },
      rates: {
        carCare: {
          dcc: {
            fiveSeater: { basic: 1100, silver: 1500, gold: 2000 },
            fivePlusSeater: { basic: 1200, silver: 1600, gold: 2200 }
          },
          wash: {
            fiveSeater: { oneTime: 600, subscription4: 1800 },
            fivePlusSeater: { oneTime: 700, subscription4: 2100 }
          },
          detailing: {
            ceramicCoatingStarts: 11999,
            interiorDetailingStarts: 1499
          }
        },
        solarCare: {
          oneTime: { tier1_30: 60, tier30_100: 50, tier100Plus: 'Site Visit', minBilling: 800 },
          amc6Month: { tier1_30: 50, tier30_100: 45, tier100Plus: 'Site Visit' },
          amc12Month: { tier1_30: 45, tier30_100: 40, tier100Plus: 'Site Visit' }
        }
      },
      offers: [{ id: 'offer_1', code: 'CWPFIRST300', title: 'Pehla Mahina Welcome Offer', active: true }],
      coupons: [{ code: 'CWPFIRST300', discount: 300, type: 'flat', active: true }],
      stats: { googleRating: '4.9', activeMembers: '450+' }
    }
  };

  const adminSseClients = new Set();
  const staffSseClients = new Set(); // { res, staffId }

  function broadcastAdminSse(type, payload = {}) {
    const data = JSON.stringify({ type, timestamp: new Date().toISOString(), ...payload });
    const frame = `event: message\ndata: ${data}\n\n`;
    for (const client of adminSseClients) {
      try { client.write(frame); } catch {}
    }
  }

  function broadcastStaffSse(staffId, eventType, payload = {}) {
    const data = JSON.stringify({ type: eventType, staffId, timestamp: new Date().toISOString(), ...payload });
    const frame = `event: message\ndata: ${data}\n\n`;
    for (const c of staffSseClients) {
      if (!staffId || Number(c.staffId) === Number(staffId)) {
        try { c.res.write(frame); } catch {}
      }
    }
  }

  function parseCookies(req) {
    const header = req.headers.cookie || '';
    const map = {};
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
    }
    return map;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res, status, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders
    });
    res.end(body);
  }

  function sendHtml(res, status, html, cacheControl = 'no-cache, no-store, must-revalidate, max-age=0') {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
      'Content-Length': Buffer.byteLength(html)
    });
    res.end(html);
  }

  function resolveAdminAuth(req, payload = {}) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const sess = state.adminSessions.get(token);
      if (sess && sess.expiresAt > Date.now()) {
        return { ok: true, mode: 'bearer', token, sess };
      }
      return { ok: false };
    }
    const cookies = parseCookies(req);
    if (cookies.cwp_adm_sess) {
      const sess = state.adminSessions.get(cookies.cwp_adm_sess);
      if (sess && sess.expiresAt > Date.now()) {
        return { ok: true, mode: 'cookie', token: cookies.cwp_adm_sess, csrfCookie: cookies.cwp_csrf, sess };
      }
    }
    if (payload && payload.adminToken) {
      const sess = state.adminSessions.get(payload.adminToken);
      if (sess && sess.expiresAt > Date.now()) {
        return { ok: true, mode: 'token', token: payload.adminToken, sess };
      }
    }
    return { ok: false };
  }

  function checkCsrf(req, adminAuth) {
    if (!adminAuth || adminAuth.mode !== 'cookie') return true;
    const headerToken = req.headers['x-csrf-token'] || '';
    return Boolean(headerToken && adminAuth.csrfCookie && headerToken === adminAuth.csrfCookie);
  }

  function resolveStaffAuth(req, payload = {}) {
    const authHeader = req.headers.authorization || '';
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (payload && (payload.staffToken || payload.token)) {
      token = payload.staffToken || payload.token;
    }
    if (!token) return { ok: false };
    const sess = state.staffSessions.get(token);
    if (!sess) return { ok: false };
    const stf = state.staff.find((s) => s.id === sess.staffId && !s.deleted_at);
    if (!stf || stf.status !== 'Active') return { ok: false };
    return { ok: true, token, staff: stf, sess };
  }

  function getActiveTempCover(routeId, dateStr) {
    return state.routeTempAssignments.find(
      (ta) => ta.route_id === routeId && ta.is_active && ta.start_date <= dateStr && ta.end_date >= dateStr
    ) || null;
  }

  function enrichRoute(route) {
    const today = getIstDateString(0);
    const permanentStaff = state.staff.find((s) => s.id === route.staff_id && !s.deleted_at) || null;
    const activeCover = getActiveTempCover(route.id, today);
    const coverStaff = activeCover ? state.staff.find((s) => s.id === activeCover.cover_staff_id && !s.deleted_at) : null;
    const stops = state.routeStops
      .filter((st) => st.route_id === route.id && st.is_active)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((st) => {
        const veh = state.vehicles.find((v) => v.id === st.vehicle_id && !v.deleted_at);
        const cust = veh ? state.customers.find((c) => c.id === veh.customer_id && !c.deleted_at) : null;
        const loc = veh ? state.locations.find((l) => l.id === veh.location_id && !l.deleted_at) : null;
        return {
          ...st,
          registration_no: veh ? veh.registration_no : null,
          seater_type: veh ? veh.seater_type : null,
          car_model: veh ? veh.car_model : null,
          customer_id: cust ? cust.id : null,
          customer_name: cust ? cust.name : null,
          location_id: loc ? loc.id : null,
          address_text: loc ? loc.address_text : null
        };
      });
    return {
      ...route,
      staff_name: permanentStaff ? permanentStaff.name : null,
      active_cover: activeCover
        ? {
            ...activeCover,
            cover_staff_name: coverStaff ? coverStaff.name : null
          }
        : null,
      stop_count: stops.length,
      stops
    };
  }

  function generateDccJobsForDate(dateStr) {
    let generatedCount = 0;
    for (const route of state.routes) {
      if (!route.is_active || !route.staff_id) continue;
      const activeCover = getActiveTempCover(route.id, dateStr);
      const effectiveStaffId = activeCover ? activeCover.cover_staff_id : route.staff_id;
      const stops = state.routeStops
        .filter((s) => s.route_id === route.id && s.is_active)
        .sort((a, b) => a.sequence_order - b.sequence_order);

      for (const stop of stops) {
        const veh = state.vehicles.find((v) => v.id === stop.vehicle_id && !v.deleted_at);
        if (!veh) continue;
        const booking = stop.booking_id
          ? state.bookings.find((b) => b.id === stop.booking_id && b.status === 'active')
          : state.bookings.find((b) => b.vehicle_id === veh.id && b.status === 'active' && b.frequency);
        const frequency = booking && booking.frequency ? booking.frequency : 'daily';
        const anchorDate = booking && booking.start_date ? booking.start_date : dateStr;

        if (frequency === 'alternate' && !isAlternateCleanDay(dateStr, anchorDate)) {
          continue;
        }

        const exists = state.dccDailyJobs.find((j) => j.job_date === dateStr && j.vehicle_id === veh.id);
        if (exists) continue;

        const job = {
          id: nextId(),
          job_date: dateStr,
          booking_id: booking ? booking.id : null,
          route_id: route.id,
          route_stop_id: stop.id,
          vehicle_id: veh.id,
          customer_id: veh.customer_id,
          location_id: veh.location_id,
          assigned_staff_id: effectiveStaffId,
          actual_staff_id: null,
          frequency,
          status: 'auto_generated',
          photo_url: null,
          gps_lat: null,
          gps_lng: null,
          notes: null,
          completed_at: null
        };
        state.dccDailyJobs.push(job);
        generatedCount += 1;
      }
    }
    return generatedCount;
  }

  function buildStaffDataPayload(staff) {
    const today = getIstDateString(0);
    generateDccJobsForDate(today);

    const activeRoutes = state.routes.filter((r) => {
      if (!r.is_active) return false;
      const cover = getActiveTempCover(r.id, today);
      if (cover) return cover.cover_staff_id === staff.id;
      return r.staff_id === staff.id;
    });

    const dailyCarCleaning = [];
    for (const route of activeRoutes) {
      const isCover = Boolean(getActiveTempCover(route.id, today));
      const stops = state.routeStops
        .filter((s) => s.route_id === route.id && s.is_active)
        .sort((a, b) => a.sequence_order - b.sequence_order);

      for (const stop of stops) {
        const job = state.dccDailyJobs.find((j) => j.job_date === today && j.vehicle_id === stop.vehicle_id);
        if (!job) continue; // respects Alternate parity!
        const cust = state.customers.find((c) => c.id === job.customer_id);
        const veh = state.vehicles.find((v) => v.id === job.vehicle_id);
        const loc = state.locations.find((l) => l.id === job.location_id);
        const addresses = state.locations.filter((l) => l.customer_id === job.customer_id && !l.deleted_at);
        dailyCarCleaning.push({
          dccJobId: job.id,
          routeId: route.id,
          routeName: route.name,
          routeStopId: stop.id,
          sequenceOrder: stop.sequence_order,
          isTempCover: isCover,
          bookingId: job.booking_id,
          vehicleId: veh.id,
          registrationNo: veh.registration_no,
          seaterType: veh.seater_type,
          carModel: veh.car_model,
          customerId: cust.id,
          customerName: cust.name,
          locationId: loc.id,
          linkedAddress: loc.address_text,
          addresses,
          frequency: job.frequency,
          status: job.status
        });
      }
    }

    const otherJobs = state.serviceJobs
      .filter((j) => j.assigned_staff_id === staff.id && ['assigned', 'enrolled', 'in_progress', 'completed'].includes(j.status))
      .map((j) => {
        const cust = state.customers.find((c) => c.id === j.customer_id);
        const loc = state.locations.find((l) => l.id === j.location_id);
        const addresses = state.locations.filter((l) => l.customer_id === j.customer_id && !l.deleted_at);
        return {
          ...j,
          customerName: cust ? cust.name : null,
          linkedAddress: loc ? loc.address_text : null,
          addresses
        };
      });

    return {
      success: true,
      staffId: staff.id,
      staffName: staff.name,
      staffPhotoUrl: staff.photo_url || null,
      serviceCapabilities: {
        can_dcc: Boolean(staff.can_dcc),
        can_car_wash: Boolean(staff.can_car_wash),
        can_solar: Boolean(staff.can_solar),
        can_detailing: Boolean(staff.can_detailing)
      },
      isDccEligible: Boolean(staff.can_dcc),
      dailyCarCleaning,
      otherJobs,
      carWashing: otherJobs.filter((j) => j.service_category === 'car_wash'),
      solarCleaning: otherJobs.filter((j) => j.service_category === 'solar'),
      detailingJobs: otherJobs.filter((j) => j.service_category === 'detailing'),
      totalCount: dailyCarCleaning.length + otherJobs.length,
      serviceDate: today,
      version: `v-${state.dccDailyJobs.length}-${state.serviceJobs.length}-${Date.now()}`,
      unchanged: false
    };
  }

  function renderAdminHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CWP Admin Panel</title>
  <link rel="stylesheet" href="/admin-v2/css/v2-style.css?v=20261128">
</head>
<body>
  <div id="v2LoginGate" style="display:flex;">
    <form id="v2LoginForm">
      <input id="v2AdminPasswordInput" type="password" />
      <button id="v2LoginPasswordToggle" type="button">Show</button>
      <div id="v2LoginError" hidden></div>
      <div id="v2LoginCaptchaBox" hidden>
        <span id="v2LoginCaptchaPrompt"></span>
        <input id="v2LoginCaptchaInput" type="text" />
        <button id="v2LoginCaptchaRefreshBtn" type="button">Refresh</button>
      </div>
      <button id="v2LoginSubmitBtn" type="submit">Sign In</button>
    </form>
  </div>
  <div id="v2AppContainer" hidden aria-hidden="true">
    <aside id="v2Sidebar">
      <button id="v2NavBtnDashboard" data-tab="dashboard">Dashboard</button>
      <button id="v2NavBtnCustomers" data-tab="records">Customers</button>
      <button id="v2NavBtnStaff" data-tab="staff">Staff</button>
      <button id="v2NavBtnCatalog" data-tab="catalog">Services &amp; Packages</button>
      <button id="v2NavBtnBookings" data-tab="bookings">Bookings</button>
      <button id="v2NavBtnJobAssign" data-tab="nonDccAssign">Job Assignment</button>
      <button id="v2NavBtnRoutes" data-tab="sequence">Route Planning</button>
      <button id="v2NavBtnLiveStatus" data-tab="liveStatus">Live Work Status</button>
      <button id="v2NavBtnTracking" data-tab="tracking">Staff Tracking</button>
      <button id="v2NavBtnLeads" data-tab="leads">Leads</button>
      <button id="v2NavBtnSettings" data-tab="settings">Settings</button>
    </aside>
    <main>
      <header>
        <h1 id="v2HeaderTitle">CWP Admin</h1>
        <span id="v2HeaderSubtitle">Varanasi Operations</span>
        <span id="v2BreadcrumbGroup">Operations</span>
        <span id="v2BreadcrumbTab">Customers</span>
      </header>
      <section id="v2View_dashboard"></section>
      <section id="v2View_records">
        <button id="v2BtnAddCustomer" type="button">Add Customer</button>
        <select id="v2CustFilterSeater">
          <option value="">All Seaters</option>
          <option value="5_seater">5-seater</option>
          <option value="5_plus_seater">5+ seater</option>
        </select>
        <table><tbody id="v2CustTableBody"></tbody></table>
        <div id="v2CustSplitView">
          <div id="v2CustDetailScroll" data-mode="view-only">
            <h3>Customer Profile (View Only)</h3>
            <p>Personal Info, Addresses, Cars, Solar Installations, Active Packages, Assigned Staff, Booking History.</p>
          </div>
        </div>
        <div id="v2ModalAddCustomer"></div>
        <div id="v2ModalEditCustomer"></div>
      </section>
      <section id="v2View_staff">
        <input id="v2AddStaffPin" type="password" minlength="4" maxlength="6" pattern="[0-9]{4,6}" />
        <label><input id="v2StaffCapDcc" type="checkbox" /> DCC</label>
        <label><input id="v2StaffCapCarWash" type="checkbox" /> Car Wash</label>
        <label><input id="v2StaffCapSolar" type="checkbox" /> Solar</label>
        <label><input id="v2StaffCapDetailing" type="checkbox" /> Detailing</label>
      </section>
      <section id="v2View_catalog">
        <div id="v2CatalogCategories">dcc, car_wash, solar, detailing</div>
      </section>
      <section id="v2View_bookings"></section>
      <section id="v2View_nonDccAssign"></section>
      <section id="v2View_sequence" data-dnd="enabled"></section>
      <section id="v2View_liveStatus"></section>
      <section id="v2View_tracking"></section>
      <section id="v2View_leads"></section>
      <section id="v2View_settings"></section>
    </main>
  </div>
  <script src="/admin-v2/js/v2-app.js?v=20261128"></script>
</body>
</html>`;
  }

  function renderStaffHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CWP Staff Portal</title>
  <link rel="stylesheet" href="/css/staff-m3.css?v=20261128">
</head>
<body>
  <div id="staffAuthGate" style="display:block;">
    <form id="staffAuthForm">
      <input id="staffPhoneInput" type="tel" />
      <input id="staffPinInput" type="password" minlength="4" maxlength="6" pattern="[0-9]{4,6}" />
      <button id="btnStaffLogin" type="submit">Login</button>
    </form>
  </div>
  <div id="staffContent" style="display:none;">
    <nav>
      <button id="pillDailyClean">Daily Clean</button>
      <button id="pillOtherJobs">Other Jobs</button>
      <button id="pillStaffSettings">Settings</button>
    </nav>
    <div id="otherJobsFilterBar">
      <button id="chipOtherAll" data-category="all">All</button>
      <button id="chipOtherWash" data-category="car_wash">Car Wash</button>
      <button id="chipOtherSolar" data-category="solar">Solar</button>
      <button id="chipOtherDetailing" data-category="detailing">Detailing</button>
    </div>
    <div id="customerFeed"></div>
  </div>
  <div id="cleaningCameraModal">
    <input id="cameraCarNotPresentCheck" type="checkbox" />
    <button id="btnConfirmCleanPhoto" type="button">Confirm</button>
  </div>
  <div id="enrollSpecialJobSection"><button id="enrollSpecialJobBtn" type="button">Enrolled / Accept</button></div>
  <div id="startSpecialJobModal"></div>
  <div id="completeSpecialJobModal"></div>
  <div id="cancelSpecialJobModal"></div>
  <div id="addressViewModal"></div>
  <script src="/js/staff-portal.js?v=20261128"></script>
</body>
</html>`;
  }

  function renderHomeHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CWP Detailers &amp; Motors — Varanasi</title>
</head>
<body>
  <main>
    <h1>CWP Detailers &amp; Motors</h1>
    <button id="toggleCarBtn" type="button">Car Services</button>
    <button id="toggleSolarBtn" type="button">Solar Cleaning</button>
    <button id="subtabDcc" type="button">DCC</button>
    <button id="subtabWash" type="button">Car Wash</button>
    <button id="vPill5Seater" type="button">5-seater</button>
    <button id="vPill5PlusSeater" type="button">5+ seater</button>
    <div id="pricingCardsContainer">Loading rates...</div>
    <div id="detailingHighlightsWrap">Detailing Packages &amp; Services</div>
    <form id="bookingForm">
      <div id="bookingModal">
        <input id="modalName" type="text" />
        <input id="modalPhone" type="tel" />
        <input id="modalVehicle" type="text" />
        <input id="modalLocality" type="text" />
      </div>
    </form>
  </main>
  <script src="/js/home.js?v=20261128"></script>
</body>
</html>`;
  }

  async function handlePostApi(req, res) {
    const payload = await readBody(req);
    if (!payload || typeof payload !== 'object') {
      return sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
    }
    const action = payload.action;
    if (!action) {
      return sendJson(res, 400, { success: false, error: 'Missing action' });
    }

    // --- Public Auth Endpoints ---
    if (action === 'getAdminCaptcha') {
      const a = 3 + crypto.randomInt(1, 9);
      const b = 2 + crypto.randomInt(1, 9);
      const challengeId = crypto.randomUUID();
      state.captchas.set(challengeId, { answer: String(a + b), expiresAt: Date.now() + 300000 });
      return sendJson(res, 200, {
        success: true,
        challengeId,
        prompt: `What is ${a} + ${b}?`
      });
    }

    if (action === 'verifyAdminPassword') {
      const uname = String(payload.username || adminUsername).trim();
      const lockUntil = state.adminLockUntil.get(uname) || 0;
      if (lockUntil > Date.now()) {
        return sendJson(res, 429, {
          success: false,
          rateLimited: true,
          remainingSec: Math.ceil((lockUntil - Date.now()) / 1000),
          captchaRequired: true,
          error: 'Too many failed login attempts. Try again later.'
        });
      }

      const failCount = state.adminFailedAttempts.get(uname) || 0;
      const makeCaptcha = () => {
        const a = 4 + crypto.randomInt(1, 8);
        const b = 2 + crypto.randomInt(1, 7);
        const challengeId = crypto.randomUUID();
        state.captchas.set(challengeId, { answer: String(a + b), expiresAt: Date.now() + 300000 });
        return { challengeId, prompt: `What is ${a} + ${b}?` };
      };

      if (failCount >= 2) {
        const hasAnswer = payload.captchaId && payload.captchaAnswer !== undefined && String(payload.captchaAnswer).trim() !== '';
        if (!hasAnswer) {
          // Matches server.js:2945-2961: returns 403 without incrementing failure count
          return sendJson(res, 403, {
            success: false,
            captchaRequired: true,
            captcha: makeCaptcha(),
            error: 'Security verification challenge is required to continue.'
          });
        }
        const cap = state.captchas.get(payload.captchaId);
        if (!cap || cap.expiresAt < Date.now() || String(payload.captchaAnswer).trim() !== cap.answer) {
          const nextFail = failCount + 1;
          state.adminFailedAttempts.set(uname, nextFail);
          if (nextFail >= 5) {
            state.adminLockUntil.set(uname, Date.now() + 60000);
            return sendJson(res, 429, {
              success: false,
              rateLimited: true,
              remainingSec: 60,
              captchaRequired: true,
              error: 'Too many failed login attempts'
            });
          }
          return sendJson(res, 403, {
            success: false,
            captchaRequired: true,
            captcha: makeCaptcha(),
            error: 'Security challenge failed'
          });
        }
        state.captchas.delete(payload.captchaId);
      }

      if (uname !== adminUsername || payload.password !== adminPassword) {
        const nextFail = (state.adminFailedAttempts.get(uname) || 0) + 1;
        state.adminFailedAttempts.set(uname, nextFail);
        const locked = nextFail >= 5;
        if (locked) {
          state.adminLockUntil.set(uname, Date.now() + 60000);
        }
        return sendJson(res, locked ? 429 : 401, {
          success: false,
          rateLimited: locked,
          captchaRequired: nextFail >= 2,
          captcha: nextFail >= 2 && !locked ? makeCaptcha() : null,
          error: locked ? 'Too many failed login attempts. Please try again in 5 minute(s).' : 'Invalid admin credentials'
        });
      }

      state.adminFailedAttempts.delete(uname);
      state.adminLockUntil.delete(uname);
      const token = `adm_${crypto.randomBytes(16).toString('hex')}`;
      const csrfToken = crypto.randomBytes(16).toString('hex');
      const cookies = parseCookies(req);
      const deviceRef = cookies.cwp_adm_dev || `dev_${crypto.randomBytes(8).toString('hex')}`;
      const deviceRecognized = state.adminDevices.has(deviceRef);
      if (!deviceRecognized) {
        state.adminDevices.set(deviceRef, {
          deviceRef,
          deviceLabel: 'E2E Browser/Client',
          browser: 'Chrome',
          os: 'Windows',
          createdAt: new Date().toISOString(),
          revoked: false
        });
      }
      state.adminSessions.set(token, {
        username: uname,
        csrfToken,
        deviceRef,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 43200 * 1000
      });

      return sendJson(
        res,
        200,
        {
          success: true,
          token,
          csrfToken,
          expiresIn: 43200,
          deviceRecognized,
          user: { username: uname, role: 'admin', userType: 'admin' }
        },
        {
          'Set-Cookie': [
            `cwp_adm_sess=${token}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax`,
            `cwp_csrf=${csrfToken}; Path=/; Max-Age=43200; SameSite=Lax`,
            `cwp_adm_dev=${deviceRef}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`
          ]
        }
      );
    }

    if (action === 'verifyStaffPin') {
      const identifier = String(payload.phone || payload.mobile || payload.staffPhone || payload.staffId || payload.identifier || '').trim();
      const pin = String(payload.pin || '').trim();
      if (!identifier || !isValidPin(pin)) {
        return sendJson(res, 400, { success: false, error: 'Phone/Staff ID and 4-6 digit numeric PIN are required' });
      }

      const staff = state.staff.find(
        (s) => !s.deleted_at && (s.phone === identifier || String(s.id) === identifier || s.staff_code === identifier)
      );
      if (!staff) {
        return sendJson(res, 404, { success: false, error: 'Staff member not found' });
      }
      if (staff.status !== 'Active') {
        return sendJson(res, 403, { success: false, inactive: true, error: 'Staff account is inactive' });
      }

      const lockUntil = state.staffLockUntil.get(staff.id) || 0;
      if (lockUntil > Date.now()) {
        return sendJson(res, 429, { success: false, rateLimited: true, error: 'Staff PIN locked due to failed attempts' });
      }

      if (staff.pin !== pin) {
        const fails = (state.staffFailedAttempts.get(staff.id) || 0) + 1;
        state.staffFailedAttempts.set(staff.id, fails);
        if (fails >= 5) {
          state.staffLockUntil.set(staff.id, Date.now() + 60000);
          return sendJson(res, 429, { success: false, rateLimited: true, error: 'Too many failed PIN attempts' });
        }
        return sendJson(res, 401, { success: false, error: 'Invalid PIN' });
      }

      const deviceId = payload.deviceId || null;
      for (const [, existing] of state.staffSessions.entries()) {
        if (existing.staffId === staff.id && deviceId && existing.deviceId && existing.deviceId !== deviceId) {
          return sendJson(res, 409, { success: false, sessionConflict: true, error: 'Active session exists on another device' });
        }
      }

      state.staffFailedAttempts.delete(staff.id);
      state.staffLockUntil.delete(staff.id);
      const token = `stf_${crypto.randomBytes(16).toString('hex')}`;
      state.staffSessions.set(token, { staffId: staff.id, deviceId, createdAt: new Date().toISOString() });

      return sendJson(res, 200, {
        success: true,
        token,
        staffId: staff.id,
        staffName: staff.name,
        staffPhone: staff.phone,
        staff: {
          id: staff.id,
          name: staff.name,
          phone: staff.phone,
          can_dcc: staff.can_dcc,
          can_car_wash: staff.can_car_wash,
          can_solar: staff.can_solar,
          can_detailing: staff.can_detailing
        }
      });
    }

    if (action === 'logoutStaff') {
      const staffAuth = resolveStaffAuth(req, payload);
      if (staffAuth.ok) {
        state.staffSessions.delete(staffAuth.token);
      }
      return sendJson(res, 200, { success: true });
    }

    // --- Staff or Admin Shared Actions ---
    if (action === 'getStaffData') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) {
        return sendJson(res, 401, { success: false, unauthorized: true, error: 'Unauthorized' });
      }
      let targetStaff = staffAuth.ok ? staffAuth.staff : null;
      if (payload.staffId) {
        if (staffAuth.ok && Number(payload.staffId) !== staffAuth.staff.id) {
          return sendJson(res, 403, { success: false, forbidden: true, error: 'Forbidden: cross-staff access denied' });
        }
        targetStaff = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at);
      }
      if (!targetStaff) {
        return sendJson(res, 404, { success: false, error: 'Staff not found' });
      }
      return sendJson(res, 200, buildStaffDataPayload(targetStaff));
    }

    if (action === 'recordDailyCleanWithPhoto') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      }
      if (adminAuth.ok && !checkCsrf(req, adminAuth)) {
        return sendJson(res, 403, { success: false, error: 'CSRF verification failed. Please refresh the page and try again.' });
      }
      const today = getIstDateString(0);
      generateDccJobsForDate(today);
      const job = state.dccDailyJobs.find(
        (j) =>
          (payload.dccJobId && j.id === Number(payload.dccJobId)) ||
          (j.job_date === today && j.vehicle_id === Number(payload.vehicleId))
      );
      if (!job) {
        return sendJson(res, 404, { success: false, error: 'DCC daily job not found for today' });
      }
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden: DCC job belongs to another staff' });
      }
      const isCarNotPresent = Boolean(payload.carNotPresent || payload.tag === 'car_not_present' || payload.status === 'car_not_available');
      if (!isCarNotPresent && !payload.photoData && !payload.photoBase64 && !payload.photoUrl) {
        return sendJson(res, 400, { success: false, error: 'Cleaning photo is required for completed DCC job' });
      }
      job.status = isCarNotPresent ? 'car_not_available' : 'completed';
      job.photo_url = isCarNotPresent ? null : (payload.photoUrl || 'https://mock.local/dcc-photo.png');
      job.gps_lat = payload.punchLatitude ?? null;
      job.gps_lng = payload.punchLongitude ?? null;
      job.notes = payload.notes || null;
      job.actual_staff_id = staffAuth.ok ? staffAuth.staff.id : job.assigned_staff_id;
      job.completed_at = new Date().toISOString();
      broadcastAdminSse('DAILY_CLEAN_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'enrollSpecialJob') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      if (adminAuth.ok && !checkCsrf(req, adminAuth)) {
        return sendJson(res, 403, { success: false, error: 'CSRF verification failed' });
      }
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Job not found' });
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden: job assigned to another staff' });
      }
      if (job.status !== 'assigned') {
        return sendJson(res, 409, { success: false, error: `Cannot enroll job from status "${job.status}"` });
      }
      job.status = 'enrolled';
      job.enrolled_at = new Date().toISOString();
      job.updated_at = job.enrolled_at;
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'startSpecialJob') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      if (adminAuth.ok && !checkCsrf(req, adminAuth)) {
        return sendJson(res, 403, { success: false, error: 'CSRF verification failed' });
      }
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Job not found' });
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden: job assigned to another staff' });
      }
      if (job.status !== 'enrolled') {
        return sendJson(res, 409, { success: false, error: `Job must be in "enrolled" state before starting (current: "${job.status}")` });
      }
      const photos = Array.isArray(payload.photos)
        ? payload.photos
        : (payload.beforePhotoUrls || (payload.photoBase64 ? [payload.photoBase64] : []));
      if (!photos || photos.length === 0) {
        return sendJson(res, 400, { success: false, error: 'At least one before-photo is required to start job' });
      }
      job.status = 'in_progress';
      job.before_photos = photos;
      job.started_at = new Date().toISOString();
      job.updated_at = job.started_at;
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'uploadSpecialJobProofPhotos') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Job not found' });
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden' });
      }
      if (job.status !== 'in_progress') {
        return sendJson(res, 409, { success: false, error: 'Job must be in_progress to upload proof photos' });
      }
      const photos = Array.isArray(payload.photos) ? payload.photos : [];
      if (photos.length === 0) return sendJson(res, 400, { success: false, error: 'Photos array required' });
      job.after_photos = [...(job.after_photos || []), ...photos];
      return sendJson(res, 200, { success: true, afterPhotos: job.after_photos });
    }

    if (action === 'completeSpecialJob') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      if (adminAuth.ok && !checkCsrf(req, adminAuth)) {
        return sendJson(res, 403, { success: false, error: 'CSRF verification failed' });
      }
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Job not found' });
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden: job assigned to another staff' });
      }
      if (job.status !== 'in_progress') {
        return sendJson(res, 409, { success: false, error: `Cannot complete job from status "${job.status}"` });
      }
      const afterPhotos = Array.isArray(payload.photos)
        ? payload.photos
        : (payload.afterPhotoUrls || job.after_photos || []);
      if (!afterPhotos || afterPhotos.length === 0) {
        return sendJson(res, 400, { success: false, error: 'After-photo is required to complete job' });
      }
      const nowMs = Date.now();
      const autoHours = Number(state.adminSettings.auto_verify_hours || 24);
      job.status = 'completed';
      job.after_photos = afterPhotos;
      job.notes = payload.notes || payload.completionNotes || job.notes;
      job.completed_at = new Date(nowMs).toISOString();
      job.auto_verify_at = new Date(nowMs + autoHours * 3600 * 1000).toISOString();
      job.updated_at = job.completed_at;
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'cancelSpecialJob') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      if (adminAuth.ok && !checkCsrf(req, adminAuth)) {
        return sendJson(res, 403, { success: false, error: 'CSRF verification failed' });
      }
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Job not found' });
      if (staffAuth.ok && job.assigned_staff_id !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden' });
      }
      const reason = String(payload.reason || payload.cancellationReason || '').trim();
      if (!reason) {
        return sendJson(res, 400, { success: false, error: 'Cancellation reason is required' });
      }
      if (job.status === 'verified' || job.status === 'cancelled') {
        return sendJson(res, 409, { success: false, error: `Cannot cancel job in status "${job.status}"` });
      }
      job.status = 'cancelled';
      job.cancellation_reason = reason;
      if (job.booking_id) {
        const booking = state.bookings.find((b) => b.id === job.booking_id);
        if (booking && booking.total_count !== null && booking.remaining_count < booking.total_count) {
          booking.remaining_count += 1;
        }
      }
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'syncCompletions') {
      const staffAuth = resolveStaffAuth(req, payload);
      if (!staffAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const items = Array.isArray(payload.completions) ? payload.completions : [];
      const synced = [];
      for (const item of items) {
        const today = getIstDateString(0);
        generateDccJobsForDate(today);
        const job = state.dccDailyJobs.find((j) => j.id === Number(item.dccJobId) || (j.job_date === today && j.vehicle_id === Number(item.vehicleId)));
        if (job && job.assigned_staff_id === staffAuth.staff.id) {
          job.status = item.carNotPresent ? 'car_not_available' : 'completed';
          job.completed_at = new Date().toISOString();
          synced.push(job.id);
        }
      }
      return sendJson(res, 200, { success: true, syncedCount: synced.length, synced });
    }

    if (action === 'recordStaffHeartbeat') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const targetStaffId = staffAuth.ok ? staffAuth.staff.id : Number(payload.staffId);
      if (staffAuth.ok && payload.staffId && Number(payload.staffId) !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden' });
      }
      if (typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number') {
        return sendJson(res, 400, { success: false, error: 'Valid numeric latitude and longitude required' });
      }
      state.staffHeartbeats.push({
        id: nextId(),
        staffId: targetStaffId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        capturedAt: payload.capturedAt || new Date().toISOString()
      });
      const pending = state.staffPings.find((p) => p.staffId === targetStaffId && p.status === 'pending');
      return sendJson(res, 200, {
        success: true,
        todayDistanceKm: Number((state.staffHeartbeats.filter((h) => h.staffId === targetStaffId).length * 0.4).toFixed(2)),
        status: 'online',
        hasPendingPing: Boolean(pending),
        pendingPingId: pending ? pending.id : null
      });
    }

    if (action === 'respondToLocationPing') {
      const staffAuth = resolveStaffAuth(req, payload);
      if (!staffAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const ping = state.staffPings.find((p) => p.id === Number(payload.pingId) && p.staffId === staffAuth.staff.id);
      if (!ping) return sendJson(res, 404, { success: false, error: 'Ping not found' });
      ping.status = 'completed';
      ping.latitude = payload.latitude;
      ping.longitude = payload.longitude;
      ping.respondedAt = new Date().toISOString();
      state.staffHeartbeats.push({
        id: nextId(),
        staffId: staffAuth.staff.id,
        latitude: Number(payload.latitude || 0),
        longitude: Number(payload.longitude || 0),
        capturedAt: ping.respondedAt
      });
      const dist = Number((state.staffHeartbeats.filter((h) => h.staffId === staffAuth.staff.id).length * 0.4).toFixed(2));
      return sendJson(res, 200, {
        success: true,
        message: 'Location ping fulfilled',
        pingId: ping.id,
        staffId: staffAuth.staff.id,
        todayDistanceKm: dist,
        status: 'online'
      });
    }

    if (action === 'getPendingStaffPings') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const targetId = staffAuth.ok ? staffAuth.staff.id : Number(payload.staffId || 0);
      const pings = state.staffPings.filter((p) => p.status === 'pending' && (!targetId || p.staffId === targetId));
      return sendJson(res, 200, { success: true, pings });
    }

    if (action === 'getStaffMovementHistory') {
      const staffAuth = resolveStaffAuth(req, payload);
      const adminAuth = resolveAdminAuth(req, payload);
      if (!staffAuth.ok && !adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const staffId = Number(payload.staffId || (staffAuth.ok ? staffAuth.staff.id : 0));
      if (staffAuth.ok && staffId !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, error: 'Forbidden' });
      }
      const breadcrumbs = state.staffHeartbeats.filter((h) => h.staffId === staffId);
      return sendJson(res, 200, { success: true, staffId, breadcrumbs, stoppages: [] });
    }

    // --- Public Staff List (when unauthenticated) or Admin Filtered Staff List ---
    if (action === 'getStaffList') {
      const adminAuth = resolveAdminAuth(req, payload);
      let list = state.staff.filter((s) => !s.deleted_at);
      if (payload.activeOnly) {
        list = list.filter((s) => s.status === 'Active');
      }
      if (payload.capability) {
        const capKey = {
          dcc: 'can_dcc',
          car_wash: 'can_car_wash',
          solar: 'can_solar',
          detailing: 'can_detailing'
        }[payload.capability];
        if (!capKey) {
          return sendJson(res, 400, { success: false, error: `Invalid capability filter: ${payload.capability}` });
        }
        list = list.filter((s) => Boolean(s[capKey]));
      }
      const mapped = list.map((s) => {
        if (!adminAuth.ok) {
          return {
            id: s.id,
            staffCode: s.staff_code,
            name: s.name,
            active: s.status === 'Active',
            photoUrl: s.photo_url || null
          };
        }
        const { pin, ...rest } = s;
        return { ...rest, hasPin: Boolean(pin), active: s.status === 'Active' };
      });
      return sendJson(res, 200, { success: true, staff: mapped });
    }

    // --- Admin-Protected Actions ---
    const adminAuth = resolveAdminAuth(req, payload);
    if (!adminAuth.ok) {
      return sendJson(res, 401, { success: false, unauthorized: true, error: 'Admin authentication required' });
    }

    const readOnlyAdminActions = new Set([
      'verifyAdminSession',
      'getAdminSecurityOverview',
      'getAdminSettings',
      'getAllCustomers',
      'getCustomerProfile',
      'getLeads',
      'getServices',
      'getPackages',
      'getSolarPricingTiers',
      'getAddons',
      'getBookings',
      'getSpecialJobs',
      'getAllRoutes',
      'getRoutes',
      'getRouteDetails',
      'getUnassignedDccVehicles',
      'getTempRouteAssignments',
      'getDccDailyJobs',
      'getDailyCleanReports',
      'getStaffTrackingSummary',
      'getStaffTrackingEvents',
      'getMapsConfig'
    ]);

    if (!readOnlyAdminActions.has(action) && !checkCsrf(req, adminAuth)) {
      return sendJson(res, 403, {
        success: false,
        error: 'CSRF verification failed. Please refresh the page and try again.'
      });
    }

    if (action === 'verifyAdminSession') {
      return sendJson(res, 200, {
        success: true,
        valid: true,
        csrfToken: adminAuth.sess.csrfToken,
        user: { username: adminAuth.sess.username, role: 'admin', userType: 'admin' }
      });
    }

    if (action === 'logoutAdmin') {
      state.adminSessions.delete(adminAuth.token);
      return sendJson(
        res,
        200,
        { success: true, message: 'Logged out' },
        {
          'Set-Cookie': [
            'cwp_adm_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
            'cwp_csrf=; Path=/; Max-Age=0; SameSite=Lax'
          ]
        }
      );
    }

    if (action === 'updateAdminPassword') {
      return sendJson(res, 403, { success: false, error: 'Admin password can only be changed via environment configuration' });
    }

    if (action === 'getAdminSecurityOverview') {
      const trustedDevices = Array.from(state.adminDevices.values())
        .filter((d) => !d.revoked)
        .map((d) => ({
          deviceRef: d.deviceRef,
          deviceLabel: d.deviceLabel,
          browser: d.browser || 'Chrome',
          os: d.os || 'Windows',
          createdAt: d.createdAt,
          isCurrent: d.deviceRef === adminAuth.sess.deviceRef
        }));
      const activeSessions = Array.from(state.adminSessions.entries()).map(([t, s]) => ({
        sessionRef: t.slice(0, 12),
        username: s.username,
        deviceRef: s.deviceRef,
        createdAt: s.createdAt,
        isCurrent: t === adminAuth.token
      }));
      return sendJson(res, 200, {
        success: true,
        accountSecurity: {
          passwordAuthEnabled: true,
          currentDeviceRecognized: true,
          currentSessionStatus: 'Active'
        },
        trustedDevices,
        activeSessions,
        securityEvents: []
      });
    }

    if (action === 'renameAdminDevice') {
      const dev = state.adminDevices.get(payload.deviceRef);
      if (!dev || dev.revoked) return sendJson(res, 404, { success: false, error: 'Device not found' });
      const cleanLabel = String(payload.deviceLabel || '').trim();
      if (!cleanLabel) return sendJson(res, 400, { success: false, error: 'Device name cannot be empty' });
      dev.deviceLabel = cleanLabel;
      return sendJson(res, 200, { success: true, deviceLabel: dev.deviceLabel });
    }

    if (action === 'revokeAdminDevice') {
      const dev = state.adminDevices.get(payload.deviceRef);
      if (!dev) return sendJson(res, 404, { success: false, error: 'Device not found' });
      dev.revoked = true;
      return sendJson(res, 200, { success: true });
    }

    if (action === 'revokeOtherAdminDevices') {
      for (const dev of state.adminDevices.values()) {
        if (dev.deviceRef !== adminAuth.sess.deviceRef) dev.revoked = true;
      }
      return sendJson(res, 200, { success: true });
    }

    if (action === 'logoutOtherAdminSessions') {
      for (const [tok] of state.adminSessions.entries()) {
        if (tok !== adminAuth.token) state.adminSessions.delete(tok);
      }
      return sendJson(res, 200, { success: true });
    }

    if (action === 'logoutAllAdminSessions') {
      state.adminSessions.clear();
      return sendJson(res, 200, { success: true });
    }

    if (action === 'getAdminSettings') {
      return sendJson(res, 200, { success: true, settings: { ...state.adminSettings } });
    }

    if (action === 'saveAdminSettings') {
      const hours = Number(payload.auto_verify_hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
        return sendJson(res, 400, { success: false, error: 'auto_verify_hours must be between 1 and 720' });
      }
      state.adminSettings.auto_verify_hours = hours;
      return sendJson(res, 200, { success: true, settings: { ...state.adminSettings } });
    }

    // --- Customers, Locations, Vehicles, Solar ---
    if (action === 'getAllCustomers') {
      return sendJson(res, 200, state.customers.filter((c) => !c.deleted_at && !c.is_lead));
    }

    if (action === 'getCustomerProfile') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      const addresses = state.locations.filter((l) => l.customer_id === cust.id && !l.deleted_at);
      const vehicles = state.vehicles.filter((v) => v.customer_id === cust.id && !v.deleted_at);
      const solarInstallations = state.solarInstallations.filter((s) => s.customer_id === cust.id && !s.deleted_at);
      const bookings = state.bookings.filter((b) => b.customer_id === cust.id).map((b) => {
        const stf = b.assigned_dcc_staff_id ? state.staff.find((s) => s.id === b.assigned_dcc_staff_id) : null;
        return {
          ...b,
          assigned_dcc_staff_name: stf ? stf.name : null
        };
      });
      return sendJson(res, 200, {
        success: true,
        profile: {
          viewOnly: true,
          customer: cust,
          addresses,
          vehicles,
          solarInstallations,
          bookings
        }
      });
    }

    if (action === 'saveCustomer') {
      const d = payload.customerData || payload;
      const name = String(d.name || '').trim();
      const phone = String(d.phone || '').trim();
      if (!name) return sendJson(res, 400, { success: false, error: 'Customer name is required' });
      if (!isValidIndianMobile(phone)) {
        return sendJson(res, 400, { success: false, error: 'Valid 10-digit Indian mobile number is required' });
      }
      const dup = state.customers.find((c) => !c.deleted_at && !c.is_lead && c.phone === phone);
      if (dup) {
        return sendJson(res, 409, { success: false, error: 'Customer phone number already exists' });
      }
      const customer = {
        id: nextId(),
        name,
        phone,
        email: d.email || null,
        is_lead: false,
        notes: d.notes || null,
        created_at: new Date().toISOString(),
        deleted_at: null
      };
      state.customers.push(customer);

      let location = null;
      if (d.addressText || d.address) {
        location = {
          id: nextId(),
          customer_id: customer.id,
          label: d.addressLabel || 'Home',
          address_text: String(d.addressText || d.address).trim(),
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          google_maps_url: d.googleMapsUrl || null,
          parking_details: d.parkingDetails || null,
          is_primary: true,
          deleted_at: null
        };
        state.locations.push(location);
      }

      broadcastAdminSse('CUSTOMERS_CHANGED', { customerId: customer.id });
      return sendJson(res, 200, { success: true, customerId: customer.id, customer, location });
    }

    if (action === 'updateCustomer') {
      const d = payload.customerData || payload;
      const cust = state.customers.find((c) => c.id === Number(d.id || d.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      if (d.phone !== undefined) {
        const phone = String(d.phone).trim();
        if (!isValidIndianMobile(phone)) return sendJson(res, 400, { success: false, error: 'Invalid Indian mobile' });
        const dup = state.customers.find((c) => c.id !== cust.id && !c.deleted_at && !c.is_lead && c.phone === phone);
        if (dup) return sendJson(res, 409, { success: false, error: 'Duplicate customer phone' });
        cust.phone = phone;
      }
      if (d.name !== undefined) cust.name = String(d.name).trim();
      if (d.email !== undefined) cust.email = d.email;
      if (d.notes !== undefined) cust.notes = d.notes;
      broadcastAdminSse('CUSTOMERS_CHANGED', { customerId: cust.id });
      return sendJson(res, 200, { success: true, customer: cust });
    }

    if (action === 'deleteCustomer') {
      const cust = state.customers.find((c) => c.id === Number(payload.id || payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      cust.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    if (action === 'saveCustomerLocation') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      const addressText = String(payload.addressText || payload.address_text || '').trim();
      if (!addressText) return sendJson(res, 400, { success: false, error: 'addressText is required' });
      if (payload.locationId) {
        const existing = state.locations.find((l) => l.id === Number(payload.locationId) && l.customer_id === cust.id && !l.deleted_at);
        if (!existing) return sendJson(res, 404, { success: false, error: 'Location not found' });
        existing.label = payload.label ?? existing.label;
        existing.address_text = addressText;
        existing.latitude = payload.latitude ?? existing.latitude;
        existing.longitude = payload.longitude ?? existing.longitude;
        return sendJson(res, 200, { success: true, location: existing });
      }
      const loc = {
        id: nextId(),
        customer_id: cust.id,
        label: payload.label || 'Address',
        address_text: addressText,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        google_maps_url: payload.googleMapsUrl || null,
        parking_details: payload.parkingDetails || null,
        is_primary: Boolean(payload.isPrimary),
        deleted_at: null
      };
      state.locations.push(loc);
      return sendJson(res, 200, { success: true, location: loc });
    }

    if (action === 'deleteCustomerLocation') {
      const loc = state.locations.find((l) => l.id === Number(payload.locationId || payload.id) && !l.deleted_at);
      if (!loc) return sendJson(res, 404, { success: false, error: 'Location not found' });
      const hasVeh = state.vehicles.some((v) => v.location_id === loc.id && !v.deleted_at);
      const hasSol = state.solarInstallations.some((s) => s.location_id === loc.id && !s.deleted_at);
      if (hasVeh || hasSol) {
        return sendJson(res, 409, { success: false, error: 'Cannot delete location still linked to active assets' });
      }
      loc.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    if (action === 'saveVehicle') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      const locId = Number(payload.locationId || payload.location_id);
      const loc = state.locations.find((l) => l.id === locId && l.customer_id === cust.id && !l.deleted_at);
      if (!loc) return sendJson(res, 400, { success: false, error: 'Valid location_id belonging to customer is mandatory' });

      const reg = String(payload.registrationNo || payload.registration_no || '').trim().toUpperCase();
      if (!reg) return sendJson(res, 400, { success: false, error: 'registrationNo is required' });
      const seater = payload.seaterType || payload.seater_type;
      if (!['5_seater', '5_plus_seater'].includes(seater)) {
        return sendJson(res, 400, { success: false, error: 'seater_type must be strictly 5_seater or 5_plus_seater' });
      }

      const dup = state.vehicles.find(
        (v) => v.customer_id === cust.id && !v.deleted_at && v.registration_no === reg && v.id !== Number(payload.vehicleId || 0)
      );
      if (dup) {
        return sendJson(res, 409, { success: false, error: 'Duplicate vehicle registration number for this customer' });
      }

      if (payload.vehicleId) {
        const existing = state.vehicles.find((v) => v.id === Number(payload.vehicleId) && v.customer_id === cust.id && !v.deleted_at);
        if (!existing) return sendJson(res, 404, { success: false, error: 'Vehicle not found' });
        existing.location_id = loc.id;
        existing.registration_no = reg;
        existing.seater_type = seater;
        existing.car_model = payload.carModel ?? existing.car_model;
        existing.car_color = payload.carColor ?? existing.car_color;
        return sendJson(res, 200, { success: true, vehicle: existing });
      }

      const vehicle = {
        id: nextId(),
        customer_id: cust.id,
        location_id: loc.id,
        registration_no: reg,
        seater_type: seater,
        car_model: payload.carModel || null,
        car_color: payload.carColor || null,
        deleted_at: null
      };
      state.vehicles.push(vehicle);
      return sendJson(res, 200, { success: true, vehicle });
    }

    if (action === 'deleteVehicle') {
      const veh = state.vehicles.find((v) => v.id === Number(payload.vehicleId || payload.id) && !v.deleted_at);
      if (!veh) return sendJson(res, 404, { success: false, error: 'Vehicle not found' });
      veh.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    if (action === 'saveSolarInstallation') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      const locId = Number(payload.locationId || payload.location_id);
      const loc = state.locations.find((l) => l.id === locId && l.customer_id === cust.id && !l.deleted_at);
      if (!loc) return sendJson(res, 400, { success: false, error: 'Valid location_id belonging to customer is mandatory' });
      const panelCount = Number(payload.panelCount ?? payload.panel_count);
      if (!Number.isInteger(panelCount) || panelCount <= 0) {
        return sendJson(res, 400, { success: false, error: 'panel_count must be a positive integer (> 0)' });
      }
      const solar = {
        id: nextId(),
        customer_id: cust.id,
        location_id: loc.id,
        panel_count: panelCount,
        kw_load: payload.kwLoad ?? payload.kw_load ?? null,
        notes: payload.notes || null,
        deleted_at: null
      };
      state.solarInstallations.push(solar);
      return sendJson(res, 200, { success: true, solarInstallation: solar });
    }

    if (action === 'deleteSolarInstallation') {
      const s = state.solarInstallations.find((x) => x.id === Number(payload.solarId || payload.id) && !x.deleted_at);
      if (!s) return sendJson(res, 404, { success: false, error: 'Solar installation not found' });
      s.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    // --- Leads ---
    if (action === 'getLeads') {
      return sendJson(res, 200, state.leads.filter((l) => !l.deleted_at));
    }

    if (action === 'saveLead') {
      const d = payload.customerData || payload;
      const name = String(d.name || '').trim();
      const phone = String(d.phone || '').trim();
      if (!name || !isValidIndianMobile(phone)) {
        return sendJson(res, 400, { success: false, error: 'Name and valid 10-digit Indian mobile required' });
      }
      const svc = d.interestedService || d.interested_service || null;
      if (svc && !['dcc', 'car_wash', 'solar', 'detailing'].includes(svc)) {
        return sendJson(res, 400, { success: false, error: 'Invalid interestedService category' });
      }
      const lead = {
        id: nextId(),
        name,
        phone,
        address: d.address || null,
        interested_service: svc,
        lead_stage: d.leadStage || 'new',
        notes: d.notes || null,
        is_lead: true,
        deleted_at: null
      };
      state.leads.push(lead);
      return sendJson(res, 200, { success: true, isLead: true, lead, customerId: lead.id });
    }

    if (action === 'updateLead' || action === 'updateLeadStage' || action === 'addLeadNote') {
      const lead = state.leads.find((l) => l.id === Number(payload.leadId || payload.id) && !l.deleted_at);
      if (!lead) return sendJson(res, 404, { success: false, error: 'Lead not found' });
      if (action === 'updateLead' && payload.leadData) {
        Object.assign(lead, payload.leadData);
      }
      if (payload.stage || payload.leadStatus) {
        lead.lead_stage = payload.stage || payload.leadStatus;
      }
      if (payload.note || payload.notes || payload.leadNotes) {
        lead.notes = payload.note || payload.notes || payload.leadNotes;
      }
      return sendJson(res, 200, { success: true, customerId: lead.id, leadStatus: lead.lead_stage, notes: lead.notes, lead });
    }

    if (action === 'convertLead') {
      const lead = state.leads.find((l) => l.id === Number(payload.leadId) && !l.deleted_at);
      if (!lead) return sendJson(res, 404, { success: false, error: 'Lead not found' });
      const cd = payload.convertData || payload.customerData || {};
      const phone = String(cd.phone || lead.phone).trim();
      const dup = state.customers.find((c) => !c.deleted_at && !c.is_lead && c.phone === phone);
      if (dup) return sendJson(res, 409, { success: false, error: 'Customer with this phone already exists' });

      const cust = {
        id: nextId(),
        name: cd.name || lead.name,
        phone,
        email: cd.email || null,
        is_lead: false,
        notes: lead.notes,
        created_at: new Date().toISOString(),
        deleted_at: null
      };
      state.customers.push(cust);

      const addressText = cd.addressText || lead.address || 'Varanasi';
      const loc = {
        id: nextId(),
        customer_id: cust.id,
        label: cd.addressLabel || 'Primary',
        address_text: addressText,
        latitude: cd.latitude ?? null,
        longitude: cd.longitude ?? null,
        is_primary: true,
        deleted_at: null
      };
      state.locations.push(loc);

      let solarInstallation = null;
      if (cd.panelCount) {
        solarInstallation = {
          id: nextId(),
          customer_id: cust.id,
          location_id: loc.id,
          panel_count: Number(cd.panelCount),
          kw_load: cd.kwLoad ?? null,
          deleted_at: null
        };
        state.solarInstallations.push(solarInstallation);
      }

      lead.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true, customerId: cust.id, customer: cust, location: loc, solarInstallation });
    }

    if (action === 'deleteLead') {
      const lead = state.leads.find((l) => l.id === Number(payload.leadId || payload.id) && !l.deleted_at);
      if (!lead) return sendJson(res, 404, { success: false, error: 'Lead not found' });
      lead.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    // --- Staff Management ---
    if (action === 'saveStaffMember') {
      const d = payload.staffData || payload;
      const name = String(d.name || '').trim();
      const phone = String(d.phone || '').trim();
      if (!name || !isValidIndianMobile(phone)) {
        return sendJson(res, 400, { success: false, error: 'Staff name and valid 10-digit Indian mobile required' });
      }
      const existingId = Number(d.id || d.staffId || 0);
      const dup = state.staff.find((s) => !s.deleted_at && s.phone === phone && s.id !== existingId);
      if (dup) {
        return sendJson(res, 409, { success: false, error: 'Staff phone number already exists' });
      }

      const canDcc = Boolean(d.can_dcc);
      const canCarWash = Boolean(d.can_car_wash);
      const canSolar = Boolean(d.can_solar);
      const canDetailing = Boolean(d.can_detailing);
      if (!canDcc && !canCarWash && !canSolar && !canDetailing) {
        return sendJson(res, 400, { success: false, error: 'At least one capability toggle must be enabled' });
      }

      if (existingId) {
        const stf = state.staff.find((s) => s.id === existingId && !s.deleted_at);
        if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
        if (d.pin !== undefined && !isValidPin(String(d.pin))) {
          return sendJson(res, 400, { success: false, error: 'PIN must be 4-6 digits' });
        }
        stf.name = name;
        stf.phone = phone;
        stf.can_dcc = canDcc;
        stf.can_car_wash = canCarWash;
        stf.can_solar = canSolar;
        stf.can_detailing = canDetailing;
        if (d.pin !== undefined) stf.pin = String(d.pin).trim();
        if (d.status) stf.status = d.status;
        const { pin, ...safe } = stf;
        return sendJson(res, 200, { success: true, staff: { ...safe, hasPin: true } });
      }

      const pinStr = String(d.pin || '').trim();
      if (!isValidPin(pinStr)) {
        return sendJson(res, 400, { success: false, error: 'PIN must be 4 to 6 numeric digits' });
      }

      const newId = nextId();
      const staff = {
        id: newId,
        staff_code: `STF-${String(newId).padStart(4, '0')}`,
        name,
        phone,
        pin: pinStr,
        can_dcc: canDcc,
        can_car_wash: canCarWash,
        can_solar: canSolar,
        can_detailing: canDetailing,
        status: d.status || 'Active',
        weekly_off: d.weekly_off || null,
        salary_amount: d.salary_amount ?? null,
        joining_date: d.joining_date || null,
        address: d.address || null,
        documents: d.documents || {},
        deleted_at: null
      };
      state.staff.push(staff);
      const { pin, ...safe } = staff;
      return sendJson(res, 200, { success: true, staffId: staff.id, staff: { ...safe, hasPin: true } });
    }

    if (action === 'resetStaffPin') {
      const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      const newPin = String(payload.newPin || '').trim();
      if (!isValidPin(newPin)) {
        return sendJson(res, 400, { success: false, error: 'PIN must be 4 to 6 numeric digits' });
      }
      stf.pin = newPin;
      return sendJson(res, 200, { success: true, pinLength: newPin.length });
    }

    if (action === 'toggleStaffActive') {
      const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      stf.status = payload.active === false || payload.status === 'Inactive' ? 'Inactive' : 'Active';
      return sendJson(res, 200, { success: true, status: stf.status });
    }

    if (action === 'unlockStaff') {
      const stf = state.staff.find((s) => s.id === Number(payload.staffId) || s.staff_code === payload.staffCode);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      state.staffFailedAttempts.delete(stf.id);
      state.staffLockUntil.delete(stf.id);
      return sendJson(res, 200, { success: true });
    }

    if (action === 'deleteStaffMember') {
      const stf = state.staff.find((s) => s.id === Number(payload.id || payload.staffId) && !s.deleted_at);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      stf.deleted_at = new Date().toISOString();
      return sendJson(res, 200, { success: true });
    }

    // --- Master Catalog ---
    if (action === 'getServices') {
      return sendJson(res, 200, { success: true, services: state.services.filter((s) => s.is_active) });
    }

    if (action === 'saveService') {
      const d = payload.service || payload;
      if (!['dcc', 'car_wash', 'solar', 'detailing'].includes(d.category)) {
        return sendJson(res, 400, { success: false, error: 'Invalid service category; must be dcc, car_wash, solar, or detailing' });
      }
      if (!d.name || !String(d.name).trim()) {
        return sendJson(res, 400, { success: false, error: 'Service name is required' });
      }
      const svc = {
        id: nextId(),
        category: d.category,
        name: String(d.name).trim(),
        description: d.description || '',
        is_active: d.is_active !== false,
        sort_order: d.sort_order ?? 10
      };
      state.services.push(svc);
      return sendJson(res, 200, { success: true, service: svc });
    }

    if (action === 'deleteService') {
      const svc = state.services.find((s) => s.id === Number(payload.serviceId || payload.id));
      if (!svc) return sendJson(res, 404, { success: false, error: 'Service not found' });
      svc.is_active = false;
      return sendJson(res, 200, { success: true });
    }

    if (action === 'getPackages') {
      return sendJson(res, 200, { success: true, packages: state.packages.filter((p) => p.is_active) });
    }

    if (action === 'savePackage') {
      const d = payload.packageData || payload;
      const name = String(d.name || '').trim();
      const items = Array.isArray(d.items) ? d.items : [];
      const validityDays = Number(d.validity_days ?? d.validityDays);
      if (!name || items.length === 0 || !Number.isFinite(validityDays) || validityDays <= 0) {
        return sendJson(res, 400, { success: false, error: 'Package name, items, and positive validity_days are required' });
      }

      const resolvedItems = [];
      let includesCarService = false;
      for (const it of items) {
        const svc = state.services.find((s) => s.id === Number(it.serviceId || it.service_id) && s.is_active);
        if (!svc) return sendJson(res, 400, { success: false, error: `Unknown serviceId in package item` });
        if (['dcc', 'car_wash', 'detailing'].includes(svc.category)) includesCarService = true;
        resolvedItems.push({
          service_id: svc.id,
          category: svc.category,
          service_name: svc.name,
          quantity: Number(it.quantity || 1),
          frequency: it.frequency || null,
          duration_months: it.duration_months || null
        });
      }

      const p5 = d.price_5_seater ?? d.price5Seater;
      const p5Plus = d.price_5_plus_seater ?? d.price5PlusSeater;
      if (includesCarService) {
        if (p5 === undefined || p5 === null || p5Plus === undefined || p5Plus === null || Number(p5) < 0 || Number(p5Plus) < 0) {
          return sendJson(res, 400, { success: false, error: 'Car-related packages require both price_5_seater and price_5_plus_seater' });
        }
      }

      const pkg = {
        id: nextId(),
        name,
        description: d.description || '',
        validity_days: validityDays,
        price_5_seater: p5 !== undefined && p5 !== null ? Number(p5) : null,
        price_5_plus_seater: p5Plus !== undefined && p5Plus !== null ? Number(p5Plus) : null,
        is_active: d.is_active !== false,
        items: resolvedItems
      };
      state.packages.push(pkg);
      return sendJson(res, 200, { success: true, package: pkg });
    }

    if (action === 'deletePackage') {
      const pkg = state.packages.find((p) => p.id === Number(payload.packageId || payload.id));
      if (!pkg) return sendJson(res, 404, { success: false, error: 'Package not found' });
      pkg.is_active = false;
      return sendJson(res, 200, { success: true });
    }

    if (action === 'getSolarPricingTiers') {
      return sendJson(res, 200, { success: true, tiers: state.solarPricingTiers.filter((t) => t.is_active) });
    }

    if (action === 'saveSolarPricingTier') {
      const d = payload.tier || payload;
      const minP = Number(d.min_panels ?? d.minPanels);
      const maxP = d.max_panels !== undefined && d.max_panels !== null ? Number(d.max_panels) : null;
      const rate = Number(d.per_panel_rate ?? d.perPanelRate);
      const minOne = Number(d.min_billing_onetime ?? d.minBillingOnetime);
      const minAmc = Number(d.min_billing_amc ?? d.minBillingAmc);
      if (!d.tier_name && !d.tierName) {
        return sendJson(res, 400, { success: false, error: 'tier_name is required' });
      }
      if (!Number.isFinite(minP) || minP < 1 || rate < 0 || minOne < 0 || minAmc < 0 || (maxP !== null && maxP < minP)) {
        return sendJson(res, 400, { success: false, error: 'Invalid solar pricing tier bounds or rates' });
      }
      const tier = {
        id: nextId(),
        tier_name: String(d.tier_name || d.tierName).trim(),
        min_panels: minP,
        max_panels: maxP,
        per_panel_rate: rate,
        min_billing_onetime: minOne,
        min_billing_amc: minAmc,
        is_active: d.is_active !== false
      };
      state.solarPricingTiers.push(tier);
      return sendJson(res, 200, { success: true, tier });
    }

    if (action === 'deleteSolarPricingTier') {
      const t = state.solarPricingTiers.find((x) => x.id === Number(payload.tierId || payload.id));
      if (!t) return sendJson(res, 404, { success: false, error: 'Tier not found' });
      t.is_active = false;
      return sendJson(res, 200, { success: true });
    }

    if (action === 'getAddons') {
      return sendJson(res, 200, { success: true, addons: state.addons.filter((a) => a.is_active) });
    }

    if (action === 'saveAddon') {
      const d = payload.addon || payload;
      const name = String(d.name || '').trim();
      const price = Number(d.price);
      const qty = Number(d.default_quantity ?? d.defaultQuantity ?? 1);
      if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(qty) || qty < 1) {
        return sendJson(res, 400, { success: false, error: 'Addon name, price >= 0, and default_quantity >= 1 required' });
      }
      const addon = {
        id: nextId(),
        name,
        price,
        default_quantity: qty,
        is_active: d.is_active !== false
      };
      state.addons.push(addon);
      return sendJson(res, 200, { success: true, addon });
    }

    if (action === 'deleteAddon') {
      const a = state.addons.find((x) => x.id === Number(payload.addonId || payload.id));
      if (!a) return sendJson(res, 404, { success: false, error: 'Addon not found' });
      a.is_active = false;
      return sendJson(res, 200, { success: true });
    }

    // --- Central Bookings Engine ---
    if (action === 'getBookings') {
      const list = state.bookings
        .filter((b) => !payload.customerId || b.customer_id === Number(payload.customerId))
        .map((b) => ({
          ...b,
          addons: state.bookingAddons.filter((ba) => ba.booking_id === b.id)
        }));
      return sendJson(res, 200, { success: true, bookings: list });
    }

    if (action === 'createBooking') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });

      const pkg = payload.packageId ? state.packages.find((p) => p.id === Number(payload.packageId) && p.is_active) : null;
      const svc = payload.serviceId ? state.services.find((s) => s.id === Number(payload.serviceId) && s.is_active) : null;
      if (!pkg && !svc) {
        return sendJson(res, 400, { success: false, error: 'Either packageId or serviceId is required' });
      }

      const assetType = payload.assetType || (payload.solarId ? 'solar' : 'vehicle');
      let asset = null;
      let location = null;
      if (assetType === 'vehicle') {
        asset = state.vehicles.find((v) => v.id === Number(payload.vehicleId) && v.customer_id === cust.id && !v.deleted_at);
        if (!asset) return sendJson(res, 400, { success: false, error: 'Valid vehicleId belonging to customer is required' });
        if (!['5_seater', '5_plus_seater'].includes(asset.seater_type)) {
          return sendJson(res, 400, { success: false, error: 'Vehicle must have confirmed 5_seater or 5_plus_seater' });
        }
        const locId = Number(payload.locationId || asset.location_id);
        location = state.locations.find((l) => l.id === locId && l.customer_id === cust.id && !l.deleted_at);
      } else {
        asset = state.solarInstallations.find((s) => s.id === Number(payload.solarId) && s.customer_id === cust.id && !s.deleted_at);
        if (!asset || asset.panel_count <= 0) {
          return sendJson(res, 400, { success: false, error: 'Valid solarId with panel_count > 0 belonging to customer is required' });
        }
        const locId = Number(payload.locationId || asset.location_id);
        location = state.locations.find((l) => l.id === locId && l.customer_id === cust.id && !l.deleted_at);
      }

      if (!location) {
        return sendJson(res, 400, { success: false, error: 'Valid locationId belonging to customer is required' });
      }

      const items = pkg ? pkg.items : [{ service_id: svc.id, category: svc.category, quantity: 1, frequency: payload.frequency || null }];
      const hasDcc = items.some((it) => it.category === 'dcc');
      const dccItem = items.find((it) => it.category === 'dcc');
      const frequency = payload.frequency || (dccItem && dccItem.frequency) || (items[0] && items[0].frequency) || null;

      let assignedDccStaffId = null;
      if (hasDcc) {
        assignedDccStaffId = Number(payload.assignedDccStaffId || payload.assigned_dcc_staff_id || 0);
        const dccStaff = state.staff.find((s) => s.id === assignedDccStaffId && !s.deleted_at && s.status === 'Active');
        if (!dccStaff || !dccStaff.can_dcc) {
          return sendJson(res, 400, { success: false, error: 'DCC bookings require an active assigned staff with can_dcc=true' });
        }
      }

      let baseAmount = 0;
      if (pkg) {
        if (assetType === 'vehicle' && pkg.price_5_seater !== null) {
          baseAmount = asset.seater_type === '5_plus_seater' ? Number(pkg.price_5_plus_seater) : Number(pkg.price_5_seater);
        } else {
          const solarItem = items.find((it) => it.category === 'solar');
          baseAmount = computeSolarAmount(
            state.solarPricingTiers,
            asset.panel_count,
            Boolean(solarItem && solarItem.frequency && solarItem.frequency !== 'one_time'),
            (solarItem && solarItem.duration_months) || 1,
            (solarItem && solarItem.frequency) || 'monthly'
          );
        }
      } else if (svc.category === 'solar') {
        const isAmc = Boolean(frequency && frequency !== 'one_time');
        baseAmount = computeSolarAmount(state.solarPricingTiers, asset.panel_count, isAmc, payload.durationMonths || 1, frequency || 'monthly');
      } else {
        baseAmount = asset.seater_type === '5_plus_seater' ? 800 : 500;
      }

      const requestedAddons = Array.isArray(payload.addons) ? payload.addons : [];
      let addonsTotal = 0;
      const createdAddons = [];
      for (const reqA of requestedAddons) {
        const addon = state.addons.find((a) => a.id === Number(reqA.addonId || reqA.id) && a.is_active);
        if (!addon) return sendJson(res, 400, { success: false, error: 'Invalid addonId' });
        const qty = Number(reqA.quantity ?? addon.default_quantity ?? 1);
        addonsTotal += addon.price * qty;
        createdAddons.push({ addon_id: addon.id, name: addon.name, quantity: qty, unit_price: addon.price });
      }

      const nonDccCount = items
        .filter((it) => it.category !== 'dcc')
        .reduce((acc, it) => acc + Number(it.quantity || 1), 0);
      const startDate = payload.startDate || getIstDateString(0);
      const validityDays = pkg ? pkg.validity_days : Number(payload.validityDays || 30);
      const startMs = Date.parse(`${startDate}T00:00:00Z`);
      const endDate = new Date(startMs + validityDays * 86400000).toISOString().slice(0, 10);

      const booking = {
        id: nextId(),
        customer_id: cust.id,
        package_id: pkg ? pkg.id : null,
        service_id: svc ? svc.id : null,
        asset_type: assetType,
        vehicle_id: assetType === 'vehicle' ? asset.id : null,
        solar_id: assetType === 'solar' ? asset.id : null,
        location_id: location.id,
        assigned_dcc_staff_id: assignedDccStaffId,
        frequency,
        start_date: startDate,
        end_date: endDate,
        total_amount: baseAmount + addonsTotal,
        payment_status: payload.paymentStatus || 'paid',
        total_count: nonDccCount > 0 ? nonDccCount : 30,
        remaining_count: nonDccCount > 0 ? nonDccCount : 30,
        status: 'active',
        notes: payload.notes || null,
        created_at: new Date().toISOString()
      };
      state.bookings.push(booking);

      for (const ca of createdAddons) {
        state.bookingAddons.push({ id: nextId(), booking_id: booking.id, ...ca });
      }

      return sendJson(res, 200, { success: true, booking: { ...booking, addons: createdAddons } });
    }

    if (action === 'cancelBooking') {
      const b = state.bookings.find((x) => x.id === Number(payload.bookingId || payload.id));
      if (!b) return sendJson(res, 404, { success: false, error: 'Booking not found' });
      b.status = 'cancelled';
      return sendJson(res, 200, { success: true, booking: b });
    }

    // --- Non-DCC Job Creation & Assignment ---
    if (action === 'getSpecialJobs') {
      let jobs = state.serviceJobs.slice();
      if (payload.status) jobs = jobs.filter((j) => j.status === payload.status);
      if (payload.serviceCategoryId || payload.category) {
        const cat = payload.serviceCategoryId || payload.category;
        jobs = jobs.filter((j) => j.service_category === cat);
      }
      if (payload.staffId) jobs = jobs.filter((j) => j.assigned_staff_id === Number(payload.staffId));
      return sendJson(res, 200, { success: true, jobs });
    }

    if (action === 'createServiceJob') {
      const cust = state.customers.find((c) => c.id === Number(payload.customerId) && !c.deleted_at);
      if (!cust) return sendJson(res, 404, { success: false, error: 'Customer not found' });
      const cat = payload.serviceCategory || payload.service_category;
      if (!['car_wash', 'solar', 'detailing'].includes(cat)) {
        return sendJson(res, 400, { success: false, error: 'Non-DCC serviceCategory must be car_wash, solar, or detailing' });
      }

      let booking = null;
      if (payload.bookingId) {
        booking = state.bookings.find((b) => b.id === Number(payload.bookingId) && b.customer_id === cust.id && b.status === 'active');
        if (!booking) return sendJson(res, 400, { success: false, error: 'Active booking not found for customer' });
        if (booking.remaining_count <= 0) {
          return sendJson(res, 409, { success: false, error: 'No remaining services left on this booking' });
        }
        booking.remaining_count -= 1;
      }

      const locId = Number(payload.locationId || (booking && booking.location_id));
      const loc = state.locations.find((l) => l.id === locId && l.customer_id === cust.id && !l.deleted_at);
      if (!loc) return sendJson(res, 400, { success: false, error: 'Valid locationId is required' });

      let initialStatus = 'scheduled';
      let assignedStaffId = null;
      if (payload.staffId) {
        const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at && s.status === 'Active');
        const capField = { car_wash: 'can_car_wash', solar: 'can_solar', detailing: 'can_detailing' }[cat];
        if (!stf || !stf[capField]) {
          return sendJson(res, 403, { success: false, error: `Staff lacks required ${cat} capability` });
        }
        initialStatus = 'assigned';
        assignedStaffId = stf.id;
      }

      const job = {
        id: nextId(),
        booking_id: booking ? booking.id : null,
        customer_id: cust.id,
        service_category: cat,
        service_id: payload.serviceId || null,
        asset_type: cat === 'solar' ? 'solar' : 'vehicle',
        vehicle_id: payload.vehicleId || (booking && booking.vehicle_id) || null,
        solar_id: payload.solarId || (booking && booking.solar_id) || null,
        location_id: loc.id,
        assigned_staff_id: assignedStaffId,
        status: initialStatus,
        scheduled_date: payload.scheduledDate || getIstDateString(0),
        before_photos: [],
        after_photos: [],
        auto_verify_at: null,
        verified_at: null,
        created_at: new Date().toISOString()
      };
      state.serviceJobs.push(job);
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'assignSpecialJob' || action === 'reassignSpecialJob') {
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Service job not found' });
      const staffId = Number(payload.staffId || payload.toStaffId || payload.newStaffId);
      const stf = state.staff.find((s) => s.id === staffId && !s.deleted_at);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      if (stf.status !== 'Active') {
        return sendJson(res, 400, { success: false, error: 'Cannot assign job to inactive staff' });
      }
      const capField = { car_wash: 'can_car_wash', solar: 'can_solar', detailing: 'can_detailing' }[job.service_category];
      if (!stf[capField]) {
        return sendJson(res, 403, { success: false, error: `Staff lacks capability "${capField}" for ${job.service_category}` });
      }
      job.assigned_staff_id = stf.id;
      job.status = 'assigned';
      job.updated_at = new Date().toISOString();
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'verifySpecialJob') {
      const job = state.serviceJobs.find((j) => j.id === Number(payload.jobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'Service job not found' });
      if (job.status !== 'completed') {
        return sendJson(res, 409, { success: false, error: `Only completed jobs can be verified (current: "${job.status}")` });
      }
      job.status = 'verified';
      job.verified_at = new Date().toISOString();
      job.verified_by = adminAuth.sess.username;
      broadcastAdminSse('SPECIAL_JOB_CHANGED', { jobId: job.id, status: job.status });
      return sendJson(res, 200, { success: true, job });
    }

    if (action === 'deleteSpecialJob') {
      const idx = state.serviceJobs.findIndex((j) => j.id === Number(payload.jobId || payload.id));
      if (idx < 0) return sendJson(res, 404, { success: false, error: 'Job not found' });
      state.serviceJobs.splice(idx, 1);
      return sendJson(res, 200, { success: true });
    }

    // --- DCC Route Planning & Temporary Cover ---
    if (action === 'getAllRoutes' || action === 'getRoutes') {
      const routes = state.routes.filter((r) => r.is_active).map(enrichRoute);
      return sendJson(res, 200, { success: true, count: routes.length, routes });
    }

    if (action === 'getRouteDetails') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId || payload.id));
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      const enriched = enrichRoute(r);
      return sendJson(res, 200, { success: true, ...enriched });
    }

    if (action === 'createRoute') {
      const name = String(payload.name || '').trim();
      if (!name) return sendJson(res, 400, { success: false, error: 'Route name is required' });
      let staffId = null;
      if (payload.staffId) {
        const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at && s.status === 'Active');
        if (!stf || !stf.can_dcc) {
          return sendJson(res, 400, { success: false, error: 'Route staff must be active with can_dcc=true' });
        }
        staffId = stf.id;
      }
      const route = {
        id: nextId(),
        name,
        area: payload.area || 'Varanasi',
        staff_id: staffId,
        is_active: true,
        created_at: new Date().toISOString()
      };
      state.routes.push(route);
      return sendJson(res, 200, { success: true, route: enrichRoute(route) });
    }

    if (action === 'updateRoute') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId || payload.id));
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      if (payload.name) r.name = String(payload.name).trim();
      if (payload.area !== undefined) r.area = payload.area;
      return sendJson(res, 200, { success: true, route: enrichRoute(r) });
    }

    if (action === 'deleteRoute') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId || payload.id));
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      r.is_active = false;
      for (const s of state.routeStops) {
        if (s.route_id === r.id) s.is_active = false;
      }
      return sendJson(res, 200, { success: true });
    }

    if (action === 'assignStaffToRoute') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId) && x.is_active);
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at && s.status === 'Active');
      if (!stf || !stf.can_dcc) {
        return sendJson(res, 400, { success: false, error: 'Assigned route staff must have can_dcc=true' });
      }
      r.staff_id = stf.id;
      generateDccJobsForDate(getIstDateString(0));
      return sendJson(res, 200, { success: true, route: enrichRoute(r) });
    }

    if (action === 'unassignStaffFromRoute') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId) && x.is_active);
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      r.staff_id = null;
      return sendJson(res, 200, { success: true, route: enrichRoute(r) });
    }

    if (action === 'addStopToRoute') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId) && x.is_active);
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      const veh = state.vehicles.find((v) => v.id === Number(payload.vehicleId) && !v.deleted_at);
      if (!veh) return sendJson(res, 404, { success: false, error: 'Vehicle not found' });

      // Global vehicle exclusivity across all active route_stops
      const existingStop = state.routeStops.find((s) => s.vehicle_id === veh.id && s.is_active);
      if (existingStop) {
        return sendJson(res, 409, {
          success: false,
          error: `Vehicle ${veh.registration_no} is already assigned to route ${existingStop.route_id}`
        });
      }

      const routeStops = state.routeStops.filter((s) => s.route_id === r.id && s.is_active);
      const stop = {
        id: nextId(),
        route_id: r.id,
        vehicle_id: veh.id,
        booking_id: payload.bookingId ? Number(payload.bookingId) : null,
        sequence_order: routeStops.length + 1,
        is_active: true
      };
      state.routeStops.push(stop);
      generateDccJobsForDate(getIstDateString(0));
      return sendJson(res, 200, { success: true, stop, route: enrichRoute(r) });
    }

    if (action === 'removeStopFromRoute') {
      const stop = state.routeStops.find((s) => s.id === Number(payload.stopId) && s.is_active);
      if (!stop) return sendJson(res, 404, { success: false, error: 'Route stop not found' });
      stop.is_active = false;
      return sendJson(res, 200, { success: true });
    }

    if (action === 'moveStopBetweenRoutes') {
      const stop = state.routeStops.find((s) => s.id === Number(payload.stopId) && s.route_id === Number(payload.sourceRouteId) && s.is_active);
      const target = state.routes.find((r) => r.id === Number(payload.targetRouteId) && r.is_active);
      if (!stop || !target) return sendJson(res, 404, { success: false, error: 'Stop or target route not found' });
      const targetStops = state.routeStops.filter((s) => s.route_id === target.id && s.is_active);
      stop.route_id = target.id;
      stop.sequence_order = payload.targetSequenceOrder || targetStops.length + 1;
      return sendJson(res, 200, { success: true, stop });
    }

    if (action === 'reorderRouteStops') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId) && x.is_active);
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      const orderedIds = payload.orderedStopIds || payload.stopIds || [];
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return sendJson(res, 400, { success: false, error: 'orderedStopIds array required' });
      }
      orderedIds.forEach((sid, idx) => {
        const st = state.routeStops.find((s) => s.id === Number(sid) && s.route_id === r.id && s.is_active);
        if (st) st.sequence_order = idx + 1;
      });
      return sendJson(res, 200, { success: true, route: enrichRoute(r) });
    }

    if (action === 'getUnassignedDccVehicles') {
      const activeAssignedIds = new Set(state.routeStops.filter((s) => s.is_active).map((s) => s.vehicle_id));
      const unassigned = state.vehicles.filter((v) => !v.deleted_at && !activeAssignedIds.has(v.id));
      return sendJson(res, 200, { success: true, unassigned });
    }

    if (action === 'createTempRouteAssignment') {
      const r = state.routes.find((x) => x.id === Number(payload.routeId) && x.is_active);
      if (!r) return sendJson(res, 404, { success: false, error: 'Route not found' });
      const cover = state.staff.find((s) => s.id === Number(payload.coverStaffId) && !s.deleted_at && s.status === 'Active');
      if (!cover || !cover.can_dcc) {
        return sendJson(res, 400, { success: false, error: 'Cover staff must be active with can_dcc=true' });
      }
      const startDate = payload.startDate || getIstDateString(0);
      const endDate = payload.endDate || startDate;
      if (startDate > endDate) {
        return sendJson(res, 400, { success: false, error: 'startDate cannot be after endDate' });
      }
      const overlap = state.routeTempAssignments.find(
        (ta) => ta.route_id === r.id && ta.is_active && !(ta.end_date < startDate || ta.start_date > endDate)
      );
      if (overlap) {
        return sendJson(res, 409, { success: false, error: 'Overlapping temporary cover assignment already exists for this route' });
      }
      const assignment = {
        id: nextId(),
        route_id: r.id,
        original_staff_id: r.staff_id,
        cover_staff_id: cover.id,
        start_date: startDate,
        end_date: endDate,
        reason: payload.reason || 'Staff absence',
        is_active: true
      };
      state.routeTempAssignments.push(assignment);
      // Re-assign today's uncompleted auto_generated DCC daily jobs on this route to cover staff
      const today = getIstDateString(0);
      if (startDate <= today && endDate >= today) {
        for (const j of state.dccDailyJobs) {
          if (j.route_id === r.id && j.job_date === today && j.status === 'auto_generated') {
            j.assigned_staff_id = cover.id;
          }
        }
      }
      return sendJson(res, 200, { success: true, assignment });
    }

    if (action === 'endTempRouteAssignment') {
      const ta = state.routeTempAssignments.find(
        (x) => (payload.assignmentId && x.id === Number(payload.assignmentId)) || (payload.routeId && x.route_id === Number(payload.routeId) && x.is_active)
      );
      if (!ta) return sendJson(res, 404, { success: false, error: 'Temporary assignment not found' });
      ta.is_active = false;
      return sendJson(res, 200, { success: true, assignment: ta });
    }

    if (action === 'getTempRouteAssignments') {
      let list = state.routeTempAssignments.slice();
      if (payload.routeId) list = list.filter((x) => x.route_id === Number(payload.routeId));
      if (payload.activeOnly) list = list.filter((x) => x.is_active);
      return sendJson(res, 200, { success: true, assignments: list });
    }

    // --- DCC Daily Jobs & Live Status ---
    if (action === 'generateDccDailyJobs') {
      const dateStr = payload.date || getIstDateString(0);
      const generatedCount = generateDccJobsForDate(dateStr);
      return sendJson(res, 200, { success: true, date: dateStr, generatedCount });
    }

    if (action === 'getDccDailyJobs' || action === 'getDailyCleanReports') {
      const dateFilter = payload.date || payload.startDate || null;
      let jobs = state.dccDailyJobs.slice();
      if (dateFilter) jobs = jobs.filter((j) => j.job_date >= dateFilter && (!payload.endDate || j.job_date <= payload.endDate));
      if (payload.staffId) jobs = jobs.filter((j) => j.assigned_staff_id === Number(payload.staffId));
      if (payload.routeId) jobs = jobs.filter((j) => j.route_id === Number(payload.routeId));
      if (payload.status) jobs = jobs.filter((j) => j.status === payload.status);

      const summary = {
        totalScheduled: jobs.length,
        totalCleaned: jobs.filter((j) => j.status === 'completed').length,
        totalPending: jobs.filter((j) => j.status === 'auto_generated').length,
        carNotPresentCount: jobs.filter((j) => j.status === 'car_not_available').length,
        missedCount: jobs.filter((j) => j.status === 'missed').length
      };
      return sendJson(res, 200, {
        success: true,
        records: jobs,
        pendingRecords: jobs.filter((j) => j.status === 'auto_generated'),
        summary
      });
    }

    if (action === 'updateDailyCleanReportStatus') {
      const job = state.dccDailyJobs.find((j) => j.id === Number(payload.reportId || payload.dccJobId));
      if (!job) return sendJson(res, 404, { success: false, error: 'DCC job not found' });
      if (!['auto_generated', 'completed', 'car_not_available', 'missed'].includes(payload.status)) {
        return sendJson(res, 400, { success: false, error: 'Invalid DCC status' });
      }
      job.status = payload.status;
      if (payload.reason) job.notes = payload.reason;
      return sendJson(res, 200, { success: true, job });
    }

    // --- Staff Live Tracking ---
    if (action === 'getStaffTrackingSummary') {
      const activeStaff = state.staff.filter((s) => !s.deleted_at && s.status === 'Active');
      return sendJson(res, 200, {
        success: true,
        kpis: { activeStaff: activeStaff.length, fleetDistanceKm: 0, totalStoppages: 0 },
        staff: activeStaff.map((s) => ({
          id: s.id,
          name: s.name,
          lastHeartbeat: state.staffHeartbeats.filter((h) => h.staffId === s.id).slice(-1)[0] || null
        })),
        stoppages: []
      });
    }

    if (action === 'pingStaffLocation') {
      const stf = state.staff.find((s) => s.id === Number(payload.staffId) && !s.deleted_at);
      if (!stf) return sendJson(res, 404, { success: false, error: 'Staff not found' });
      const ping = { id: nextId(), staffId: stf.id, status: 'pending', createdAt: new Date().toISOString() };
      state.staffPings.push(ping);
      broadcastStaffSse(stf.id, 'LOCATION_PING', { pingId: ping.id });
      return sendJson(res, 200, {
        success: true,
        pingId: ping.id,
        staffId: stf.id,
        status: 'pending',
        requestedAt: ping.createdAt
      });
    }

    if (action === 'acknowledgeTrackingAlert' || action === 'getStaffTrackingEvents' || action === 'getMapsConfig') {
      return sendJson(res, 200, { success: true, events: state.trackingEvents, googleMapsApiKey: '' });
    }

    return sendJson(res, 400, { success: false, error: `Unknown action: ${action}` });
  }

  function renderAdminJs() {
    return `/* CWP Admin V2 BRD Script */
window.__CWP_ADMIN_V2__ = true;
(function () {
  var gate = document.getElementById('v2LoginGate');
  var app = document.getElementById('v2AppContainer');
  var form = document.getElementById('v2LoginForm');
  var passEl = document.getElementById('v2AdminPasswordInput');
  var capBox = document.getElementById('v2LoginCaptchaBox');
  var capPrompt = document.getElementById('v2LoginCaptchaPrompt');
  var capInput = document.getElementById('v2LoginCaptchaInput');
  var errEl = document.getElementById('v2LoginError');
  var activeCapId = null;

  function getCsrf() {
    var m = document.cookie.match(/(?:^|;\\s*)cwp_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function loadCustomers() {
    fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
      body: JSON.stringify({ action: 'getAllCustomers' })
    }).then(function (r) { return r.json(); }).then(function (rows) {
      var tbody = document.getElementById('v2CustTableBody');
      if (!tbody || !Array.isArray(rows)) return;
      tbody.innerHTML = rows.map(function (c) {
        return '<tr data-customer-id="' + c.id + '"><td>' + c.name + '</td><td>' + c.phone + '</td></tr>';
      }).join('');
      Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
        tr.addEventListener('click', function () {
          var id = Number(tr.getAttribute('data-customer-id'));
          fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
            body: JSON.stringify({ action: 'getCustomerProfile', customerId: id })
          }).then(function (r) { return r.json(); }).then(function (res) {
            var detail = document.getElementById('v2CustDetailScroll');
            if (detail && res && res.profile) {
              detail.innerHTML = '<h3>Customer Profile (View Only)</h3><p>' + res.profile.customer.name + ' (' + res.profile.addresses.length + ' addresses)</p>';
            }
          });
        });
      });
    }).catch(function () {});
  }

  function unlock() {
    if (gate) { gate.hidden = true; gate.style.display = 'none'; }
    if (app) { app.hidden = false; app.removeAttribute('hidden'); app.setAttribute('aria-hidden', 'false'); }
    loadCustomers();
  }

  Array.prototype.forEach.call(document.querySelectorAll('#v2Sidebar button[data-tab]'), function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      var title = document.getElementById('v2BreadcrumbTab');
      if (title) title.textContent = btn.textContent;
      Array.prototype.forEach.call(document.querySelectorAll('section[id^="v2View_"]'), function (sec) {
        sec.hidden = sec.id !== ('v2View_' + tab);
      });
    });
  });

  fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verifyAdminSession' })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res && res.valid) unlock();
  }).catch(function () {});

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = { action: 'verifyAdminPassword', password: passEl ? passEl.value : '' };
      if (activeCapId && capInput) {
        payload.captchaId = activeCapId;
        payload.captchaAnswer = capInput.value;
      }
      fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.success) {
          activeCapId = null;
          if (capBox) capBox.hidden = true;
          unlock();
        } else {
          if (res && res.captcha && capBox && capPrompt) {
            activeCapId = res.captcha.challengeId;
            capPrompt.textContent = res.captcha.prompt;
            capBox.hidden = false;
          }
          if (errEl) { errEl.textContent = (res && res.error) || 'Login failed'; errEl.hidden = false; }
        }
      });
    });
  }
})();`;
  }

  function renderHomeJs() {
    return `/* CWP Public Homepage Client */
window.__CWP_HOME__ = true;
(function () {
  fetch('/api/public/homepage-config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      var el = document.getElementById('pricingCardsContainer');
      if (!el || !cfg || !cfg.rates) return;
      var cc = cfg.rates.carCare || {};
      var dcc5 = cc.dcc && cc.dcc.fiveSeater ? cc.dcc.fiveSeater.basic : 1100;
      var dcc5p = cc.dcc && cc.dcc.fivePlusSeater ? cc.dcc.fivePlusSeater.basic : 1200;
      var wash5 = cc.wash && cc.wash.fiveSeater ? cc.wash.fiveSeater.oneTime : 600;
      var det5 = cc.detailing ? cc.detailing.interiorDetailingStarts : 1499;
      var sol1 = cfg.rates.solarCare && cfg.rates.solarCare.oneTime ? cfg.rates.solarCare.oneTime.tier1_30 : 60;
      el.innerHTML =
        '<div class="rate-card">DCC 5-Seater: ₹' + Number(dcc5).toLocaleString('en-IN') + '</div>' +
        '<div class="rate-card">DCC 5+ Seater: ₹' + Number(dcc5p).toLocaleString('en-IN') + '</div>' +
        '<div class="rate-card">Car Wash 5-Seater: ₹' + Number(wash5).toLocaleString('en-IN') + '</div>' +
        '<div class="rate-card">Detailing Starts: ₹' + Number(det5).toLocaleString('en-IN') + '</div>' +
        '<div class="rate-card">Solar Per Panel: ₹' + Number(sol1) + '</div>';
    })
    .catch(function () {});
})();`;
  }

  function renderStaffJs() {
    return `/* CWP Staff Portal Standalone Script */
window.__CWP_STAFF_PORTAL__ = true;
(function () {
  var form = document.getElementById('staffAuthForm');
  var phoneEl = document.getElementById('staffPhoneInput');
  var pinEl = document.getElementById('staffPinInput');
  var gate = document.getElementById('staffAuthGate');
  var content = document.getElementById('staffContent');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verifyStaffPin',
        phone: phoneEl ? phoneEl.value : '',
        pin: pinEl ? pinEl.value : '',
        deviceId: 'staff-browser-ui'
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.success && res.token) {
        if (gate) gate.style.display = 'none';
        if (content) content.style.display = 'block';
        return fetch('/api/staff-data', { headers: { Authorization: 'Bearer ' + res.token } }).then(function (r2) { return r2.json(); });
      }
      return null;
    }).catch(function () {});
  });
})();`;
  }

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // 302 redirects for retired admin-v2 paths
    if (pathname === '/admin-v2' || pathname.startsWith('/admin-v2/') || pathname === '/admin/v2' || pathname.startsWith('/admin/v2/')) {
      if (pathname.endsWith('.js')) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
        return res.end(renderAdminJs());
      }
      if (pathname.endsWith('.css')) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
        return res.end('/* CWP Admin V2 BRD Styles */\nbody { font-family: sans-serif; }\n');
      }
      res.writeHead(302, { Location: '/admin' });
      return res.end();
    }

    // Eliminated SEE & Hybrid endpoints MUST return 404
    if (pathname.startsWith('/api/see/') || pathname === '/api/see') {
      return sendJson(res, 404, { error: 'Endpoint Not Found', pathname });
    }

    if (req.method === 'GET' && ['/health', '/healthz', '/ping'].includes(pathname)) {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'cwp-data-app',
        databaseHealthy: true,
        adminConfigured: true,
        dataSource: 'postgres',
        time: new Date().toISOString()
      });
    }

    if (req.method === 'GET' && (pathname === '/admin' || pathname.startsWith('/admin/'))) {
      return sendHtml(res, 200, renderAdminHtml());
    }
    if (req.method === 'GET' && (pathname === '/staff' || pathname.startsWith('/staff/'))) {
      return sendHtml(res, 200, renderStaffHtml());
    }
    if (req.method === 'GET' && ['/', '/home', '/terms', '/privacy', '/refund'].includes(pathname)) {
      return sendHtml(res, 200, renderHomeHtml(), 'public, max-age=300');
    }
    if (req.method === 'GET' && ['/careers', '/career'].includes(pathname)) {
      return sendHtml(res, 200, '<!DOCTYPE html><html><head><title>CWP Careers</title></head><body><h1>Join CWP Varanasi</h1></body></html>');
    }
    if (req.method === 'GET' && pathname.endsWith('.js')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      if (pathname === '/js/home.js') return res.end(renderHomeJs());
      if (pathname === '/js/staff-portal.js') return res.end(renderStaffJs());
      return res.end('window.__CWP_PORTAL__ = true;\n');
    }
    if (req.method === 'GET' && pathname.endsWith('.css')) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end('/* CWP Portal BRD Styles */\nbody { font-family: sans-serif; }\n');
    }

    // REST APIs
    if (req.method === 'GET' && pathname === '/api/public/homepage-config') {
      return sendJson(res, 200, state.homepageConfig);
    }

    if ((req.method === 'PUT' || req.method === 'POST') && pathname === '/api/admin/homepage-config') {
      const adminAuth = resolveAdminAuth(req);
      if (!adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      if (!checkCsrf(req, adminAuth)) return sendJson(res, 403, { success: false, error: 'CSRF verification failed' });
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      state.homepageConfig = {
        ...state.homepageConfig,
        ...body,
        rates: { ...state.homepageConfig.rates, ...(body.rates || {}) }
      };
      return sendJson(res, 200, { success: true, config: state.homepageConfig });
    }

    if (req.method === 'POST' && (pathname === '/api/leads' || pathname === '/api/public/book')) {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      const name = String(body.name || body.customerName || '').trim();
      const phone = String(body.phone || body.customerNumber || '').trim();
      if (!name || !isValidIndianMobile(phone)) {
        return sendJson(res, 400, { success: false, error: 'Name and 10-digit Indian mobile number are required' });
      }
      const lead = {
        id: nextId(),
        name,
        phone,
        address: body.address || body.locality || null,
        interested_service: body.interestedService || body.service || 'detailing',
        lead_stage: 'new',
        notes: body.notes || body.remark || null,
        is_lead: true,
        deleted_at: null
      };
      state.leads.push(lead);
      return sendJson(res, 200, { success: true, lead });
    }

    if (req.method === 'POST' && pathname === '/api/careers/apply') {
      const body = await readBody(req);
      if (!body || !body.name || !isValidIndianMobile(String(body.phone || ''))) {
        return sendJson(res, 400, { success: false, error: 'Valid name and 10-digit Indian phone required' });
      }
      const application = { id: nextId(), ...body, created_at: new Date().toISOString() };
      state.jobApplications.push(application);
      return sendJson(res, 200, { success: true, application });
    }

    if (req.method === 'GET' && pathname === '/api/admin/job-applications') {
      const adminAuth = resolveAdminAuth(req);
      if (!adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      return sendJson(res, 200, { success: true, applications: state.jobApplications });
    }

    if (req.method === 'GET' && pathname === '/api/staff') {
      const adminAuth = resolveAdminAuth(req);
      const list = state.staff.filter((s) => !s.deleted_at).map((s) =>
        adminAuth.ok
          ? { id: s.id, name: s.name, phone: s.phone, can_dcc: s.can_dcc, can_car_wash: s.can_car_wash, can_solar: s.can_solar, can_detailing: s.can_detailing, status: s.status }
          : { id: s.id, staffCode: s.staff_code, name: s.name, active: s.status === 'Active' }
      );
      return sendJson(res, 200, list);
    }

    if (req.method === 'GET' && pathname === '/api/customers') {
      const adminAuth = resolveAdminAuth(req);
      const staffAuth = resolveStaffAuth(req);
      if (!adminAuth.ok && !staffAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      return sendJson(res, 200, { success: true, records: state.customers.filter((c) => !c.deleted_at && !c.is_lead) });
    }

    if (req.method === 'GET' && pathname === '/api/leads') {
      const adminAuth = resolveAdminAuth(req);
      if (!adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      return sendJson(res, 200, { success: true, leads: state.leads.filter((l) => !l.deleted_at) });
    }

    if (req.method === 'GET' && pathname === '/api/staff-data') {
      // Query token MUST be rejected — Bearer header only
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return sendJson(res, 401, { success: false, unauthorized: true, error: 'Authorization Bearer header required' });
      }
      const staffAuth = resolveStaffAuth(req);
      if (!staffAuth.ok) return sendJson(res, 401, { success: false, unauthorized: true, error: 'Unauthorized' });
      const qStaffId = parsedUrl.searchParams.get('staffId');
      if (qStaffId && Number(qStaffId) !== staffAuth.staff.id) {
        return sendJson(res, 403, { success: false, forbidden: true, error: 'Forbidden' });
      }
      return sendJson(res, 200, buildStaffDataPayload(staffAuth.staff));
    }

    if (req.method === 'GET' && pathname === '/api/admin-realtime-stream') {
      const adminAuth = resolveAdminAuth(req);
      if (!adminAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(`event: message\ndata: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
      adminSseClients.add(res);
      req.on('close', () => adminSseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/staff-ping-stream') {
      const staffAuth = resolveStaffAuth(req);
      if (!staffAuth.ok) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(`event: message\ndata: ${JSON.stringify({ type: 'CONNECTED', staffId: staffAuth.staff.id })}\n\n`);
      const entry = { res, staffId: staffAuth.staff.id };
      staffSseClients.add(entry);
      req.on('close', () => staffSseClients.delete(entry));
      return;
    }

    if (req.method === 'POST' && pathname === '/api') {
      return handlePostApi(req, res);
    }

    return sendJson(res, 404, { error: 'Endpoint Not Found', pathname });
  });

  return {
    server,
    state,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve({ port: addr.port, baseUrl: `http://127.0.0.1:${addr.port}` });
        });
      });
    },
    stop() {
      for (const c of adminSseClients) {
        try { c.end(); } catch {}
      }
      adminSseClients.clear();
      for (const c of staffSseClients) {
        try { c.res.end(); } catch {}
      }
      staffSseClients.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}

module.exports = {
  createMockBrdServer
};
