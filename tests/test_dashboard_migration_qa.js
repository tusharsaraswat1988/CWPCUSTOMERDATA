/**
 * =========================================================================
 * CWP ADMIN V2 — EXECUTIVE OPERATIONS DASHBOARD MIGRATION QA SUITE
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
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestV2Dash@2026';
const TEST_PASS = process.env.ADMIN_PASSWORD;
const TEST_PORT = 5996;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_dash_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

function getTodayIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function shiftIsoDate(isoDate, deltaDays) {
  const parts = isoDate.split('-').map(Number);
  const utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2]) + (deltaDays * 86400000);
  return new Date(utcMs).toISOString().slice(0, 10);
}

const TODAY_IST = getTodayIst();
const YESTERDAY_IST = shiftIsoDate(TODAY_IST, -1);

const sampleCustomers = [
  {
    id: 'CUST_DB_101',
    name: 'Aarav Sharma',
    phone: '9876500001',
    address: 'Sigra Colony, Varanasi',
    active: true,
    is_active: true,
    serviceCategory: 'DCC ONLY',
    vehicle: 'UP65AB1001'
  },
  {
    id: 'CUST_DB_102',
    name: 'Neha Verma',
    phone: '9876500002',
    address: '',
    active: true,
    is_active: true,
    serviceCategory: 'CAR WASH',
    vehicle: 'UP65CD2002'
  },
  {
    id: 'CUST_DB_103',
    name: 'Inactive Client',
    phone: '9876500003',
    address: 'Lanka, Varanasi',
    active: false,
    is_active: false,
    serviceCategory: 'DCC ONLY',
    vehicle: 'UP65EF3003'
  }
];

const sampleLeads = [
  { id: 'LEAD_DB_1', name: 'Rohan Mehta', phone: '9811100001', stage: 'new', createdAt: new Date().toISOString() },
  { id: 'LEAD_DB_2', name: 'Priya Singh', phone: '9811100002', stage: 'contacted', createdAt: new Date().toISOString() },
  { id: 'LEAD_DB_3', name: 'Converted Lead', phone: '9811100003', stage: 'converted', createdAt: new Date().toISOString() }
];

const sampleStaff = [
  { id: 'STF01', staffCode: 'STF01', name: 'Amit Kumar', phone: '9876500011', active: true, isActive: true },
  { id: 'STF02', staffCode: 'STF02', name: 'Gaurav Gupta', phone: '9876500022', active: true, isActive: true },
  { id: 'STF03', staffCode: 'STF03', name: 'Vikram Inactive', phone: '9876500033', active: false, isActive: false }
];

const sampleLogs = [
  {
    id: 'cr_log_dash_1',
    service_date: TODAY_IST,
    status: 'completed',
    car_not_present: false,
    completed_at_device: new Date(Date.now() - 120000).toISOString(),
    staff_id: 'STF01',
    staff_code: 'STF01',
    staff_name: 'Amit Kumar',
    customer_id: 'CUST_DB_101',
    customer_name: 'Aarav Sharma',
    registration_no: 'UP65AB1001',
    photo_url: 'https://example.com/photo1.jpg'
  },
  {
    id: 'cr_log_dash_2',
    service_date: TODAY_IST,
    status: 'car_not_present',
    car_not_present: true,
    tag: 'car_not_present',
    completed_at_device: new Date(Date.now() - 240000).toISOString(),
    staff_id: 'STF02',
    staff_code: 'STF02',
    staff_name: 'Gaurav Gupta',
    customer_id: 'CUST_DB_102',
    customer_name: 'Neha Verma',
    registration_no: 'UP65CD2002',
    photo_url: ''
  },
  {
    id: 'cr_log_dash_yest',
    service_date: YESTERDAY_IST,
    status: 'completed',
    car_not_present: false,
    completed_at_device: new Date(Date.now() - 86400000).toISOString(),
    staff_id: 'STF_DB_01',
    staff_code: 'STF01',
    staff_name: 'Amit Kumar',
    customer_id: 'CUST_DB_101',
    customer_name: 'Aarav Sharma',
    registration_no: 'UP65AB1001',
    photo_url: 'https://example.com/yest.jpg'
  }
];

const sampleJobs = [
  {
    id: 'JOB_DB_1',
    customer_name: 'Aarav Sharma',
    service_category: 'car_washing',
    status: 'pending',
    scheduled_date: TODAY_IST,
    staff_id: '',
    staff_name: '',
    created_at: new Date(Date.now() - 60000).toISOString()
  },
  {
    id: 'JOB_DB_2',
    customer_name: 'Neha Verma',
    service_category: 'solar_cleaning',
    status: 'completed',
    scheduled_date: TODAY_IST,
    completed_at: new Date(Date.now() - 30000).toISOString(),
    staff_id: 'STF_DB_01',
    staff_name: 'Amit Kumar',
    created_at: new Date(Date.now() - 300000).toISOString()
  },
  {
    id: 'JOB_DB_3',
    customer_name: 'Rohan Mehta',
    service_category: 'interior_detailing',
    status: 'failed',
    scheduled_date: TODAY_IST,
    staff_id: 'STF_DB_02',
    staff_name: 'Gaurav Gupta',
    created_at: new Date(Date.now() - 400000).toISOString()
  },
  {
    id: 'JOB_DB_4',
    customer_name: 'Aarav Sharma',
    service_category: 'car_washing',
    status: 'assigned',
    scheduled_date: TODAY_IST,
    staff_id: 'STF_DB_03',
    staff_name: 'Vikram Inactive',
    created_at: new Date(Date.now() - 500000).toISOString()
  }
];

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: sampleCustomers,
  leads: sampleLeads,
  staffList: sampleStaff,
  serviceJobs: sampleJobs,
  serviceLogs: sampleLogs
}, null, 2), 'utf8');

process.env.DATA_FILE = tempDataFile;

function httpRequest(method, urlPath, bodyObj = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const reqHeaders = Object.assign({}, headers);
    if (bodyStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method,
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function findChromeBinary() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', err => reject(err));
      ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || 'CDP error'));
          else res(msg.result);
        }
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Browser eval exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

function runStaticChecks() {
  console.log('--- PHASE 1: Static Hygiene, CSS Scoping & DB ID Guard ---');
  const html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-dashboard.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-dashboard.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-app.js'), 'utf8');

  assert(html.includes('v2-dashboard.css'), 'index.html must include v2-dashboard.css');
  assert(html.includes('v2-dashboard.js'), 'index.html must include v2-dashboard.js');
  assert(html.includes('id="v2View_dashboard"'), 'index.html must contain #v2View_dashboard');
  assert(html.includes('id="v2DashKpiGrid"'), 'Dashboard must have KPI grid');
  assert(html.includes('id="v2DashOpsOverview"'), 'Dashboard must have Operational Overview');
  assert(html.includes('id="v2DashExceptionsList"'), 'Dashboard must have Exceptions list');
  assert(html.includes('id="v2DashStaffTableBody"'), 'Dashboard must have Staff workload table');
  assert(html.includes('id="v2DashActivityList"'), 'Dashboard must have Recent Operations list');
  assert(!html.includes('Live SSE Connected'), 'Placeholder dashboard card must be removed');

  assert(css.includes('#v2View_dashboard.is-active'), 'CSS must scope to #v2View_dashboard');
  assert(js.includes('window.CWP_ADMIN_V2.dashboard'), 'JS must export window.CWP_ADMIN_V2.dashboard');
  assert(js.includes('Asia/Kolkata'), 'JS must use Asia/Kolkata timezone');
  assert(appJs.includes('window.CWP_ADMIN_V2.dashboard.init()'), 'v2-app.js must initialize dashboard');

  const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
  assert(!emojiRegex.test(js), 'v2-dashboard.js must not contain emojis');
  console.log('PASS 1: Static hygiene, CSS scoping & structure verified.');
}

async function waitForCondition(fn, timeoutMs = 10000, intervalMs = 150) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await fn();
    if (val) return val;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}

async function runBrowserChecks() {
  console.log('\n--- PHASE 2: Live Server & API Verification ---');
  const serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      USE_LOCAL_STAFF_TEST: '1',
      USE_LOCAL_JOBS_TEST: '1',
      ADMIN_PASSWORD: TEST_PASS,
      DATA_FILE: tempDataFile,
      LOCAL_DATA_FILE: tempDataFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    serverProc.stderr.on('data', chunk => {
      const msg = chunk.toString();
      if (!settled && msg.includes('EADDRINUSE')) {
        settled = true;
        reject(new Error(msg));
      }
    });
    function pingHealth() {
      if (settled) return;
      http.get(`http://127.0.0.1:${TEST_PORT}/health`, (res) => {
        res.resume();
        if (!settled) {
          settled = true;
          resolve();
        }
      }).on('error', () => {
        if (settled) return;
        if (Date.now() - start > 15000) {
          settled = true;
          reject(new Error('Server boot timeout'));
        } else {
          setTimeout(pingHealth, 250);
        }
      });
    }
    pingHealth();
  });

  let chromeProc = null;
  let cdp = null;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_dash_cdp_'));

  try {
    const loginRes = await httpRequest('POST', '/api', {
      action: 'verifyAdminPassword',
      password: TEST_PASS
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.body.success && loginRes.body.token, 'Admin login failed');
    const token = loginRes.body.token;

    // Seed leads & special jobs via real admin APIs
    await httpRequest('POST', '/api', {
      action: 'saveLead',
      token,
      customerData: { customerName: 'Rohan Mehta', customerNumber: '9811100001', stage: 'new', isLead: true }
    });
    await httpRequest('POST', '/api', {
      action: 'saveLead',
      token,
      customerData: { customerName: 'Priya Singh', customerNumber: '9811100002', stage: 'contacted', isLead: true }
    });

    // Job 1: unassigned car wash today
    await httpRequest('POST', '/api', {
      action: 'assignSpecialJob',
      token,
      jobData: {
        customerName: 'Aarav Sharma',
        customerPhone: '9876500001',
        address: 'Sigra Colony, Varanasi',
        serviceCategory: 'car_washing',
        scheduledDate: TODAY_IST,
        scheduledTime: '10:00',
        status: 'pending',
        staffId: ''
      }
    });

    // Job 2: solar cleaning completed today
    await httpRequest('POST', '/api', {
      action: 'assignSpecialJob',
      token,
      jobData: {
        customerName: 'Neha Verma',
        customerPhone: '9876500002',
        address: 'Lanka, Varanasi',
        serviceCategory: 'solar_cleaning',
        scheduledDate: TODAY_IST,
        scheduledTime: '11:00',
        status: 'completed',
        completed_at: new Date().toISOString(),
        staffId: 'STF01',
        staffName: 'Amit Kumar'
      }
    });

    // Job 3: failed detailing job
    await httpRequest('POST', '/api', {
      action: 'assignSpecialJob',
      token,
      jobData: {
        customerName: 'Rohan Mehta',
        customerPhone: '9811100001',
        address: 'Bhelupur, Varanasi',
        serviceCategory: 'interior_detailing',
        scheduledDate: TODAY_IST,
        scheduledTime: '12:00',
        status: 'failed',
        staffId: 'STF02',
        staffName: 'Gaurav Gupta'
      }
    });

    // Job 4: active job assigned to inactive staff STF03
    await httpRequest('POST', '/api', {
      action: 'assignSpecialJob',
      token,
      jobData: {
        customerName: 'Aarav Sharma',
        customerPhone: '9876500001',
        address: 'Sigra Colony, Varanasi',
        serviceCategory: 'car_washing',
        scheduledDate: TODAY_IST,
        scheduledTime: '14:00',
        status: 'assigned',
        staffId: 'STF03',
        staffName: 'Vikram Inactive'
      }
    });

    console.log('PASS 2: Backend API verified.');

    console.log('\n--- PHASE 3: Live CDP Browser Verification ---');
    const chromePath = findChromeBinary();
    assert.ok(chromePath, 'Chrome/Edge binary not found');
    const cdpPort = 9336;

    chromeProc = spawn(chromePath, [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox'
    ], { stdio: 'ignore' });

    let targets = [];
    for (let i = 0; i < 30; i++) {
      try {
        const list = await new Promise((res, rej) => {
          http.get(`http://127.0.0.1:${cdpPort}/json/list`, r => {
            let d = '';
            r.on('data', c => { d += c; });
            r.on('end', () => res(JSON.parse(d)));
          }).on('error', rej);
        });
        if (Array.isArray(list) && list.length > 0) {
          targets = list;
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, 'No CDP page target found');
    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=dashboard` });
    await waitForCondition(() => cdp.eval(`Boolean(document.getElementById('v2AdminPasswordInput'))`));

    await cdp.eval(`
      (function () {
        var inp = document.getElementById('v2AdminPasswordInput');
        inp.value = ${JSON.stringify(TEST_PASS)};
        document.getElementById('v2LoginSubmitBtn').click();
      })()
    `);

    await waitForCondition(() => cdp.eval(`
      (function () {
        var app = document.getElementById('v2AppContainer');
        var kpi = document.getElementById('v2DashKpiCustomers');
        return Boolean(app && !app.hidden && kpi && kpi.querySelector('.cwp-v2-dash-kpi-value').textContent.trim() !== '—');
      })()
    `));

    // 1. Verify KPI values
    const kpis = await cdp.eval(`
      ({
        cust: document.querySelector('#v2DashKpiCustomers .cwp-v2-dash-kpi-value').textContent.trim(),
        clean: document.querySelector('#v2DashKpiDailyClean .cwp-v2-dash-kpi-value').textContent.trim(),
        openJobs: document.querySelector('#v2DashKpiPendingJobs .cwp-v2-dash-kpi-value').textContent.trim(),
        doneToday: document.querySelector('#v2DashKpiCompletedJobs .cwp-v2-dash-kpi-value').textContent.trim(),
        staff: document.querySelector('#v2DashKpiStaff .cwp-v2-dash-kpi-value').textContent.trim(),
        leads: document.querySelector('#v2DashKpiLeads .cwp-v2-dash-kpi-value').textContent.trim()
      })
    `);
    assert.strictEqual(kpis.cust, '2', `Expected 2 active customers, got ${kpis.cust}`);
    assert.strictEqual(kpis.clean, '2/2', `Expected 2/2 daily clean logs today, got ${kpis.clean}`);
    assert.strictEqual(kpis.openJobs, '2', `Expected 2 open service jobs, got ${kpis.openJobs}`);
    assert.strictEqual(kpis.doneToday, '1', `Expected 1 completed job today, got ${kpis.doneToday}`);
    assert.strictEqual(kpis.staff, '2', `Expected 2 active staff accounts, got ${kpis.staff}`);
    assert.strictEqual(kpis.leads, '2', `Expected 2 open leads, got ${kpis.leads}`);

    // 2. Verify ZERO DB IDs visible
    const dashText = await cdp.eval(`document.getElementById('v2View_dashboard').innerText`);
    ['CUST_DB_', 'LEAD_DB_', 'STF01', 'STF02', 'STF03', 'JOB_DB_', 'cr_log_dash_'].forEach(prefix => {
      assert(!dashText.includes(prefix), `DB ID prefix "${prefix}" leaked in Dashboard UI!`);
    });
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(dashText), 'UUID leaked in Dashboard UI!');

    // 3. Verify Exceptions, Staff, Ops, Activity
    const excText = await cdp.eval(`document.getElementById('v2DashExceptionsList').innerText`);
    assert(excText.includes('Unassigned Service Bookings'), 'Missing Unassigned Service Bookings exception');
    assert(excText.includes('Failed Service Jobs'), 'Missing Failed Service Jobs exception');
    assert(excText.includes('Daily Cleaning Exceptions Today'), 'Missing Daily Cleaning Exceptions Today');
    assert(excText.includes('Inactive or Locked Staff with Active Work'), 'Missing Inactive Staff exception');
    assert(excText.includes('Active Customers Missing Address'), 'Missing Missing Address exception');

    const staffText = await cdp.eval(`document.getElementById('v2DashStaffTableBody').innerText`);
    assert(staffText.includes('Amit Kumar') && staffText.includes('Gaurav Gupta') && staffText.includes('Vikram Inactive'));

    const opsText = await cdp.eval(`document.getElementById('v2DashOpsOverview').innerText`);
    assert(opsText.includes('Daily Car Cleaning') && opsText.includes('Car Washing & Detailing') && opsText.includes('Solar Panel Cleaning'));

    const actText = await cdp.eval(`document.getElementById('v2DashActivityList').innerText`);
    assert(actText.includes('Aarav Sharma'), 'Recent activity must include real customer name');

    // 4. Responsive checks
    const viewports = [
      { name: 'Desktop 1440', width: 1440, height: 900, mobile: false },
      { name: 'Laptop 1366', width: 1366, height: 768, mobile: false },
      { name: 'Tablet 768', width: 768, height: 1024, mobile: false },
      { name: 'Mobile 390', width: 390, height: 844, mobile: true }
    ];
    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await new Promise(r => setTimeout(r, 150));
      const layout = await cdp.eval(`
        ({
          docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          doubleScroll: (function () {
            var viewEl = document.getElementById('v2View_dashboard');
            var ws = document.querySelector('.cwp-v2-workspace');
            return Boolean(viewEl && ws && viewEl.scrollHeight > viewEl.clientHeight + 5 && getComputedStyle(viewEl).overflowY === 'auto');
          })()
        })
      `);
      assert(!layout.docOverflow, `Horizontal overflow at ${vp.name}`);
      assert(!layout.doubleScroll, `Double vertical scroll at ${vp.name}`);
      console.log(`[PASS] Viewport ${vp.name} (${vp.width}x${vp.height}): no horizontal overflow, no double scroll`);
    }

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // 5. KPI Navigation & Quick Action
    await cdp.eval(`document.getElementById('v2DashKpiLeads').click()`);
    await waitForCondition(() => cdp.eval(`document.getElementById('v2View_leads').classList.contains('is-active')`));

    await cdp.eval(`document.getElementById('v2NavBtnDashboard').click()`);
    await waitForCondition(() => cdp.eval(`document.getElementById('v2View_dashboard').classList.contains('is-active')`));

    await cdp.eval(`document.querySelector('[data-dash-quick-action="createBooking"]').click()`);
    await waitForCondition(() => cdp.eval(`document.getElementById('v2View_serviceAssign').classList.contains('is-active')`));

    // 6. Partial API Error Resilience (getLeads fails -> shows "—", NOT "0", banner visible)
    await cdp.eval(`
      (function () {
        var origFetch = window.fetch;
        window.fetch = function (url, opts) {
          if (opts && typeof opts.body === 'string' && opts.body.indexOf('"getLeads"') !== -1) {
            return Promise.resolve(new Response(JSON.stringify({ success: false, error: 'Simulated Leads failure' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
          return origFetch.apply(this, arguments);
        };
        document.getElementById('v2NavBtnDashboard').click();
      })()
    `);

    await waitForCondition(() => cdp.eval(`
      (function () {
        var sub = document.querySelector('#v2DashKpiLeads .cwp-v2-dash-kpi-sub');
        return Boolean(sub && sub.textContent.includes('Failed to load'));
      })()
    `));

    const failedState = await cdp.eval(`
      ({
        val: document.querySelector('#v2DashKpiLeads .cwp-v2-dash-kpi-value').textContent.trim(),
        bannerHidden: document.getElementById('v2DashPartialBanner').hidden
      })
    `);
    assert.strictEqual(failedState.val, '—', `Failed leads KPI must show "—", got ${failedState.val}`);
    assert.strictEqual(failedState.bannerHidden, false, 'Partial failure banner must be visible');

    console.log('PASS 3: Live Dashboard KPIs, zero DB IDs, exceptions, navigation, error resilience & responsive QA verified.');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) chromeProc.kill();
    serverProc.kill();
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  try {
    runStaticChecks();
    await runBrowserChecks();
    console.log('\nALL DASHBOARD MIGRATION QA CHECKS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('\nDASHBOARD QA FAILED:', err);
    process.exit(1);
  }
})();
