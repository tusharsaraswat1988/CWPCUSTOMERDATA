/**
 * =========================================================================
 * CWP ADMIN V2 — OTHER CLEANING STATUS MIGRATION & OPERATIONAL QA SUITE
 * =========================================================================
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_STAFF_TEST = '1';
process.env.USE_LOCAL_JOBS_TEST = '1';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestV2Admin@2026';
const TEST_PASS = process.env.ADMIN_PASSWORD;
const TEST_PORT = 5996;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_sj_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

function getIstKey(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}
const todayIso = getIstKey(new Date());
const yesterdayIso = getIstKey(new Date(Date.now() - 86400000));

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [
    {
      id: 'cust_sj_1',
      customerCode: 'CWP-201',
      customerName: 'Vikramaditya Rao',
      customerNumber: '9876500201',
      phone: '9876500201',
      address: 'Sector 18, Indira Nagar, Lucknow',
      vehicle: 'UP32 XX 1111 (Fortuner)',
      routeName: 'Indira Nagar Central',
      active: 'Yes',
      isActive: true
    },
    {
      id: 'cust_sj_2',
      customerCode: 'CWP-202',
      customerName: 'Meera Kapoor',
      customerNumber: '9876500202',
      phone: '9876500202',
      address: 'Gomti Nagar Extension, Lucknow',
      vehicle: 'UP32 YY 2222 (Swift)',
      routeName: 'Gomti Nagar East',
      active: 'Yes',
      isActive: true
    }
  ],
  staffList: [
    {
      id: 'STF01',
      staffCode: 'STF01',
      name: 'Amit Kumar',
      phone: '9876500011',
      pin: '123456',
      active: true,
      isActive: true,
      designationId: 'cleaner',
      designationName: 'Cleaner',
      workType: 'dcc_and_services',
      serviceCapabilities: ['daily_car_cleaning', 'car_washing', 'interior_detailing', 'exterior_detailing', 'solar_cleaning'],
      route: 'Indira Nagar Central'
    },
    {
      id: 'STF02',
      staffCode: 'STF02',
      name: 'Rajesh Singh',
      phone: '9876500022',
      pin: '654321',
      active: true,
      isActive: true,
      designationId: 'detailer',
      designationName: 'Senior Detailer',
      workType: 'dcc_and_services',
      serviceCapabilities: ['car_washing', 'interior_detailing', 'exterior_detailing', 'solar_cleaning'],
      route: 'Gomti Nagar East'
    }
  ],
  serviceJobs: [],
  leads: [],
  routes: [
    { id: 'r1', routeName: 'Indira Nagar Central' },
    { id: 'r2', routeName: 'Gomti Nagar East' }
  ]
}, null, 2));

process.env.DATA_FILE = tempDataFile;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpPostApi(payload, token = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class SimpleCdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
  }

  async connect() {
    const WS = global.WebSocket || require('ws');
    return new Promise((resolve, reject) => {
      this.ws = new WS(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || 'CDP Error'));
          else res(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.pageErrors.push(msg.params?.exceptionDetails?.text || 'Runtime exception');
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          this.consoleErrors.push(msg.params.args?.map(a => a.value || a.description).join(' '));
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async function(){ ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res && res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval failed');
    }
    return res && res.result ? res.result.value : undefined;
  }

  close() {
    try { if (this.ws) this.ws.close(); } catch (e) {}
  }
}

async function runStaticChecks() {
  const sjJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-special-jobs.js'), 'utf8');
  const sjCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-special-jobs.css'), 'utf8');
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const v2App = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-app.js'), 'utf8');

  assert.ok(sjJs.includes('window.CWP_ADMIN_V2.specialJobs'), 'Must be scoped to window.CWP_ADMIN_V2.specialJobs');
  assert.ok(!/[\u0900-\u097F]/.test(sjJs), 'v2-special-jobs.js must be English-only');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(sjJs), 'v2-special-jobs.js must contain zero emojis');
  assert.ok(!/LIVE\s*SSE/i.test(sjJs), 'v2-special-jobs.js must not include LIVE SSE UI');
  assert.ok(!/\bmockData\b|\bFAKE_JOBS\b/i.test(sjJs), 'Must not contain mock production data');

  assert.ok(sjCss.includes('#v2View_specialJobs.is-active'), 'CSS must scope to #v2View_specialJobs');
  assert.ok(!/^\s*(body|html|\*)\s*\{/m.test(sjCss), 'CSS must not have global body/html/* overrides');

  assert.ok(v2Html.includes('id="v2View_specialJobs"'), 'HTML must contain #v2View_specialJobs');
  assert.ok(v2Html.includes('v2-special-jobs.css'), 'HTML must load v2-special-jobs.css');
  assert.ok(v2Html.includes('v2-special-jobs.js'), 'HTML must load v2-special-jobs.js');
  assert.ok(v2App.includes('window.CWP_ADMIN_V2.specialJobs.init()'), 'v2-app.js must initialize specialJobs');

  const idMatches = [...v2Html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const sjIds = idMatches.filter(id => id.startsWith('v2Sj') || id.startsWith('v2ModalSj'));
  assert.strictEqual(new Set(sjIds).size, sjIds.length, 'All v2Sj* DOM IDs must be unique');

  console.log('✅ PASS 1: Static isolation, CSS scoping, unique IDs, English-only & Material Symbols verified.');
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 CWP ADMIN V2 — OTHER CLEANING STATUS MIGRATION QA SUITE');
  console.log('===============================================================');

  await runStaticChecks();

  const { server } = require('../server.js');
  await new Promise((resolve, reject) => server.listen(TEST_PORT, '127.0.0.1', err => err ? reject(err) : resolve()));

  let browserProc = null;
  let cdp = null;

  try {
    const loginRes = await httpPostApi({ action: 'verifyAdminPassword', password: TEST_PASS });
    assert.strictEqual(loginRes.status, 200);
    const adminToken = loginRes.json.token;
    assert.ok(adminToken, 'Admin token must be returned');

    // Seed 5 operational jobs via real APIs
    // 1. Solar (Assigned, Today)
    const s1 = await httpPostApi({
      action: 'assignSpecialJob',
      jobData: {
        customerId: 'cust_sj_1',
        customerCode: 'CWP-201',
        customerName: 'Vikramaditya Rao',
        customerPhone: '9876500201',
        address: 'Sector 18, Indira Nagar, Lucknow',
        serviceCategoryId: 'solar_cleaning',
        serviceCategory: 'Solar Panel Cleaning',
        serviceType: 'Solar Panel Cleaning',
        panelCount: 16,
        siteDetails: { panelCount: 16, roofScope: '3rd Floor Terrace' },
        scheduledDate: todayIso,
        scheduledTime: '09:00 AM - 10:30 AM',
        sequenceOrder: 1,
        status: 'assigned',
        staffId: 'STF01',
        staffName: 'Amit Kumar'
      }
    }, adminToken);
    assert.strictEqual(s1.status, 200);

    // 2. Car Wash (Booked/Unassigned, Today)
    const s2 = await httpPostApi({
      action: 'assignSpecialJob',
      jobData: {
        customerId: 'cust_sj_2',
        customerName: 'Meera Kapoor',
        customerPhone: '9876500202',
        address: 'Gomti Nagar Extension, Lucknow',
        vehicle: 'UP32 YY 2222 (Swift)',
        registrationNo: 'UP32 YY 2222',
        seaterType: '5_seater',
        serviceCategoryId: 'car_washing',
        serviceType: 'Deep Foam Wash',
        scheduledDate: todayIso,
        scheduledTime: '11:00 AM - 12:30 PM',
        status: 'booked',
        staffId: '',
        staffName: 'Unassigned'
      }
    }, adminToken);
    assert.strictEqual(s2.status, 200);

    // 3. Interior Detailing (In Progress, Today, with before photo)
    const s3 = await httpPostApi({
      action: 'assignSpecialJob',
      jobData: {
        customerId: 'cust_sj_1',
        customerName: 'Vikramaditya Rao',
        customerPhone: '9876500201',
        address: 'Sector 18, Indira Nagar, Lucknow',
        vehicle: 'UP32 XX 1111 (Fortuner)',
        seaterType: '5_plus_seater',
        serviceCategoryId: 'interior_detailing',
        serviceType: 'Interior Deep Cleaning',
        scheduledDate: todayIso,
        scheduledTime: '02:00 PM - 03:30 PM',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 25 * 60000).toISOString(),
        beforePhotos: ['https://example.com/before3.jpg'],
        staffId: 'STF02',
        staffName: 'Rajesh Singh'
      }
    }, adminToken);
    assert.strictEqual(s3.status, 200);

    // 4. Exterior Detailing (Completed, Today, with before + after photos)
    const s4 = await httpPostApi({
      action: 'assignSpecialJob',
      jobData: {
        customerId: 'cust_sj_2',
        customerName: 'Meera Kapoor',
        customerPhone: '9876500202',
        address: 'Gomti Nagar Extension, Lucknow',
        vehicle: 'UP32 YY 2222 (Swift)',
        seaterType: '5_seater',
        serviceCategoryId: 'exterior_detailing',
        serviceType: 'Ceramic Coating',
        scheduledDate: todayIso,
        scheduledTime: '04:00 PM - 05:30 PM',
        status: 'completed',
        startedAt: new Date(Date.now() - 90 * 60000).toISOString(),
        completedAt: new Date(Date.now() - 30 * 60000).toISOString(),
        durationMinutes: 60,
        beforePhotos: ['https://example.com/b4.jpg'],
        afterPhotos: ['https://example.com/a4.jpg'],
        completionNotes: 'Ceramic coat cured',
        staffId: 'STF02',
        staffName: 'Rajesh Singh'
      }
    }, adminToken);
    assert.strictEqual(s4.status, 200);
    const j4Id = s4.json.job.id;

    // 5. Solar (Unable to Complete, Yesterday)
    const s5 = await httpPostApi({
      action: 'assignSpecialJob',
      jobData: {
        customerId: 'cust_sj_1',
        customerName: 'Vikramaditya Rao',
        customerPhone: '9876500201',
        address: 'Sector 18, Indira Nagar, Lucknow',
        serviceCategoryId: 'solar_cleaning',
        serviceType: 'Solar Panel Cleaning',
        panelCount: 12,
        scheduledDate: yesterdayIso,
        status: 'unable_to_complete',
        failureReason: 'Terrace locked',
        staffId: 'STF01',
        staffName: 'Amit Kumar'
      }
    }, adminToken);
    assert.strictEqual(s5.status, 200);

    // Also verify bookingService lifecycle transitions (start -> complete) on a booking
    const rejectedLegacyPayload = await httpPostApi({
      action: 'createServiceBooking',
      bookingData: {
        customerId: 'cust_sj_1',
        serviceCategoryId: 'car_washing',
        serviceType: 'Quick Wash',
        scheduledDate: todayIso,
        bookingSource: 'admin'
      }
    }, adminToken);
    assert.strictEqual(rejectedLegacyPayload.status, 400, 'Non-canonical booking payload must remain rejected');
    assert.match(rejectedLegacyPayload.json.error, /canonical service, vehicle, and service location/);

    const lcCreate = await httpPostApi({
      action: 'createServiceBooking',
      bookingData: {
        customerId: 'cust_sj_1',
        serviceCategoryId: 'car_washing',
        serviceType: 'Quick Wash',
        scheduledDate: todayIso,
        bookingSource: 'admin',
        legacyCompatibility: true
      }
    }, adminToken);
    assert.strictEqual(lcCreate.status, 200);
    const lcId = lcCreate.json.booking.id;
    const lcStart = await httpPostApi({ action: 'startSpecialJob', jobId: lcId, beforePhotoUrls: ['https://example.com/b.jpg'] }, adminToken);
    assert.strictEqual(lcStart.status, 200);
    const lcComp = await httpPostApi({ action: 'completeSpecialJob', jobId: lcId, afterPhotoUrls: ['https://example.com/a.jpg'] }, adminToken);
    assert.strictEqual(lcComp.status, 200);

    const jobsRes = await httpPostApi({ action: 'getSpecialJobs' }, adminToken);
    assert.strictEqual(jobsRes.status, 200);
    assert.strictEqual(jobsRes.json.success, true);
    assert.ok(Array.isArray(jobsRes.json.jobs) && jobsRes.json.jobs.length >= 5, 'Should return 5 seeded service jobs');

    console.log('✅ PASS 2: Backend getSpecialJobs & lifecycle APIs verified.');

    // Live CDP Browser Verification
    const chromeBin = findChromeBinary();
    assert.ok(chromeBin, 'Chrome/Edge binary required for live browser QA');

    const cdpPort = 9335;
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_sj_cdp_'));
    browserProc = spawn(chromeBin, [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=specialJobs`
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const listRes = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${cdpPort}/json/list`, (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => resolve(JSON.parse(d)));
          }).on('error', reject);
        });
        const target = (listRes || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) {
          wsUrl = target.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
      await sleep(250);
    }
    assert.ok(wsUrl, 'CDP WebSocket URL must be available');

    cdp = new SimpleCdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await sleep(600);
    await cdp.evaluate(`
      const inp = document.getElementById('v2AdminPasswordInput');
      if (inp) {
        inp.value = ${JSON.stringify(TEST_PASS)};
        document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    `);

    for (let i = 0; i < 30; i++) {
      const ready = await cdp.evaluate(`
        const st = window.CWP_ADMIN_V2?.specialJobs?.getState();
        return st && !st.isLoading && st.allJobs.length >= 5;
      `);
      if (ready) break;
      await sleep(250);
    }

    // 3a. Initial state, English-only, KPI counts, badge stability, no visible DB IDs
    const initCheck = await cdp.evaluate(`
      const view = document.getElementById('v2View_specialJobs');
      const split = document.getElementById('v2SjSplitView');
      const rows = document.querySelectorAll('#v2SjTableBody tr');
      const tableText = document.getElementById('v2SjTableBody').innerText;
      const badgeBefore = document.getElementById('v2BadgeSpecialJobs')?.textContent;
      if (window.CWP_ADMIN_V2?.notifications?.refreshBadges) {
        await window.CWP_ADMIN_V2.notifications.refreshBadges();
      }
      const badgeAfterNotif = document.getElementById('v2BadgeSpecialJobs')?.textContent;
      const hasRawJobId = /job_\\d+|job_sj_/.test(view.innerText);
      const hasJobIdHeader = /JOB\\s*ID/i.test(document.getElementById('v2SjTable').querySelector('thead').innerText);
      return {
        isActive: view?.classList.contains('is-active'),
        detailClosed: split?.classList.contains('is-detail-closed'),
        rowCount: rows.length,
        kpiTotal: document.getElementById('v2SjKpiTotal')?.textContent,
        kpiUnassigned: document.getElementById('v2SjKpiUnassigned')?.textContent,
        kpiAssigned: document.getElementById('v2SjKpiAssigned')?.textContent,
        kpiInProgress: document.getElementById('v2SjKpiInProgress')?.textContent,
        kpiCompleted: document.getElementById('v2SjKpiCompleted')?.textContent,
        badgeBefore,
        badgeAfterNotif,
        hasRawJobId,
        hasJobIdHeader,
        hasSolarPanels: tableText.includes('16 Panels'),
        hasVehicleReg: tableText.includes('UP32 YY 2222'),
        hasHindi: /[\\u0900-\\u097F]/.test(view.innerText),
        hasLiveSse: /LIVE\\s*SSE/i.test(view.innerText)
      };
    `);
    assert.strictEqual(initCheck.isActive, true, 'Other Cleaning Status view must be active');
    assert.strictEqual(initCheck.detailClosed, true, 'Detail panel must be closed by default');
    assert.strictEqual(initCheck.rowCount, 4, 'Today period must show 4 jobs scheduled today');
    assert.strictEqual(initCheck.kpiTotal, '4', 'Total KPI must be 4 for today');
    assert.strictEqual(initCheck.kpiUnassigned, '1', 'Unassigned KPI must be 1');
    assert.strictEqual(initCheck.kpiAssigned, '1', 'Assigned KPI must be 1');
    assert.strictEqual(initCheck.kpiInProgress, '1', 'In Progress KPI must be 1');
    assert.strictEqual(initCheck.kpiCompleted, '1', 'Completed KPI must be 1');
    assert.strictEqual(initCheck.badgeBefore, '4', 'Sidebar badge must match Today jobs count (4)');
    assert.strictEqual(initCheck.badgeAfterNotif, '4', 'Sidebar badge must not fluctuate after notifications.refreshBadges()');
    assert.strictEqual(initCheck.hasRawJobId, false, 'No internal DB/job IDs may be visible in the UI');
    assert.strictEqual(initCheck.hasJobIdHeader, false, 'Table header must not show Job ID column');
    assert.strictEqual(initCheck.hasSolarPanels, true, 'Solar row must display panel count');
    assert.strictEqual(initCheck.hasVehicleReg, true, 'Car wash row must display vehicle registration');
    assert.strictEqual(initCheck.hasHindi, false, 'UI must be English-only');
    assert.strictEqual(initCheck.hasLiveSse, false, 'UI must not show LIVE SSE');

    // 3b. Period switching (All Time shows 5 including yesterday failed job) & KPI + Category filtering
    const filterCheck = await cdp.evaluate(`
      const periodSel = document.getElementById('v2SjPeriodSelect');
      periodSel.value = 'all';
      periodSel.dispatchEvent(new Event('change'));
      const allCount = document.querySelectorAll('#v2SjTableBody tr').length;
      const excKpi = document.getElementById('v2SjKpiExceptions').textContent;

      document.querySelector('#v2SjKpiStrip [data-kpi="exceptions"]').click();
      const excRows = document.querySelectorAll('#v2SjTableBody tr').length;

      document.getElementById('v2SjResetFilters').click();
      const afterResetCount = document.querySelectorAll('#v2SjTableBody tr').length;

      document.querySelector('#v2SjCategoryBar [data-cat="solar_cleaning"]').click();
      const solarRows = document.querySelectorAll('#v2SjTableBody tr').length;
      document.getElementById('v2SjResetFilters').click();

      return { allCount, excKpi, excRows, afterResetCount, solarRows };
    `);
    assert.strictEqual(filterCheck.allCount, 5, 'All Time must show all 5 jobs');
    assert.strictEqual(filterCheck.excKpi, '1', 'Exceptions KPI must be 1 in All Time');
    assert.strictEqual(filterCheck.excRows, 1, 'Clicking Exceptions KPI must filter to 1 row');
    assert.strictEqual(filterCheck.afterResetCount, 4, 'Reset must restore Today default (4 rows)');
    assert.strictEqual(filterCheck.solarRows, 1, 'Solar category chip must filter to 1 solar job today');

    // 3c. Detail panel open/close + photo proof section
    const detailCheck = await cdp.evaluate(`
      const row = document.querySelector('#v2SjTableBody tr[data-sj-row="' + ${JSON.stringify(j4Id)} + '"]');
      row.click();
      const open = !document.getElementById('v2SjSplitView').classList.contains('is-detail-closed');
      const detailText = document.getElementById('v2SjDetailScroll').innerText;
      document.getElementById('v2SjDetailCloseBtn').click();
      const closed = document.getElementById('v2SjSplitView').classList.contains('is-detail-closed');
      return { open, closed, hasPhotoSection: detailText.includes('PHOTO PROOF') || detailText.includes('Photo Proof') };
    `);
    assert.strictEqual(detailCheck.open, true, 'Row click must open detail panel');
    assert.strictEqual(detailCheck.closed, true, 'Close button must dismiss detail panel');
    assert.strictEqual(detailCheck.hasPhotoSection, true, 'Detail panel must include photo proof section');

    // 3d. Viewport & Scroll checks (Desktop 1440x900, Tablet 768x1024, Mobile 390x844)
    const viewports = [
      { name: 'Desktop', width: 1440, height: 900, mobile: false },
      { name: 'Tablet', width: 768, height: 1024, mobile: true },
      { name: 'Mobile', width: 390, height: 844, mobile: true }
    ];
    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(200);
      const layout = await cdp.evaluate(`
        const docOverflow = document.documentElement.scrollWidth > window.innerWidth;
        const ws = document.querySelector('.cwp-v2-workspace');
        const wsOverflowY = ws ? getComputedStyle(ws).overflowY : '';
        return { docOverflow, wsOverflowY, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
      `);
      assert.strictEqual(layout.docOverflow, false, `${vp.name} (${vp.width}x${vp.height}) must have zero horizontal overflow (scrollWidth=${layout.scrollWidth}, innerWidth=${layout.innerWidth})`);
      if (vp.name === 'Desktop') {
        assert.strictEqual(layout.wsOverflowY, 'hidden', 'Desktop workspace must hide outer vertical scroll so only table scrolls');
      }
    }

    assert.strictEqual(cdp.pageErrors.length, 0, `Page runtime errors detected: ${cdp.pageErrors.join('; ')}`);
    assert.strictEqual(cdp.consoleErrors.length, 0, `Console errors detected: ${cdp.consoleErrors.join('; ')}`);

    console.log('✅ PASS 3: Live CDP Browser verification across Desktop (1440x900), Tablet (768x1024), Mobile (390x844), KPIs, categories, filters, detail panel & scrolling passed.');
    console.log('\n🎉 ALL OTHER CLEANING STATUS MIGRATION QA TESTS PASSED!');
  } finally {
    if (cdp) cdp.close();
    if (browserProc) {
      try { browserProc.kill('SIGTERM'); } catch (e) {}
    }
    try { server.close(); } catch (e) {}
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

runTests().catch(err => {
  console.error('❌ QA SUITE FAILED:', err);
  process.exit(1);
});
