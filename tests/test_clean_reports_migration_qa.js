/**
 * =========================================================================
 * CWP ADMIN V2 — DAILY CLEANING STATUS MIGRATION & FUNCTIONAL QA SUITE
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
const TEST_PORT = 5995;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_cr_qa_'));
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

const sampleLogs = [];
for (let i = 1; i <= 14; i++) {
  const isCnp = i === 12;
  const isNoPhoto = i === 13;
  const isSkipped = i === 14;
  sampleLogs.push({
    id: `cr_log_${i}`,
    service_date: TODAY_IST,
    status: isCnp ? 'car_not_present' : (isSkipped ? 'skipped' : 'completed'),
    car_not_present: isCnp,
    tag: isCnp ? 'car_not_present' : null,
    completed_at_device: new Date(Date.now() - i * 180000).toISOString(),
    staff_id: i % 2 === 0 ? 'STF02' : 'STF01',
    staff_code: i % 2 === 0 ? 'STF02' : 'STF01',
    staff_name: i % 2 === 0 ? 'Gaurav Gupta' : 'Amit Kumar',
    customer_id: `CUST_${i}`,
    customer_name: `Customer ${i}`,
    customer_phone: `98765001${String(i).padStart(2, '0')}`,
    registration_no: `UP65CR${1000 + i}`,
    brand_or_model: i % 2 === 0 ? 'Hyundai Creta' : 'Maruti Swift',
    address_text: i % 3 === 0 ? 'Sigra Colony' : 'Lanka Sector',
    parking_details: `Slot P-${i}`,
    photo_url: (isNoPhoto || isCnp || isSkipped) ? '' : 'https://example.com/photo.jpg',
    notes: isCnp ? 'Car not present in parking' : 'Daily clean verified'
  });
}
sampleLogs.push({
  id: 'cr_log_yest_1',
  service_date: YESTERDAY_IST,
  status: 'completed',
  car_not_present: false,
  completed_at_device: new Date(Date.now() - 86400000).toISOString(),
  staff_id: 'STF01',
  staff_code: 'STF01',
  staff_name: 'Amit Kumar',
  customer_id: 'CUST_Y1',
  customer_name: 'Yesterday Customer',
  customer_phone: '9876599901',
  registration_no: 'UP65Y0001',
  brand_or_model: 'Tata Nexon',
  address_text: 'Bhelupur',
  photo_url: 'https://example.com/yest.jpg',
  notes: 'Cleaned yesterday'
});

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [],
  staffList: [
    { id: 'STF01', staffCode: 'STF01', name: 'Amit Kumar', phone: '9876500011', active: true, isActive: true },
    { id: 'STF02', staffCode: 'STF02', name: 'Gaurav Gupta', phone: '9876500022', active: true, isActive: true }
  ],
  serviceJobs: [],
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

async function runStaticTests() {
  console.log('--- PHASE 1: Static Hygiene, CSS Scoping & Unique IDs ---');
  const html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-clean-reports.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-clean-reports.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-app.js'), 'utf8');

  assert.ok(html.includes('v2-clean-reports.css'), 'index.html must include v2-clean-reports.css');
  assert.ok(html.includes('v2-clean-reports.js'), 'index.html must include v2-clean-reports.js');
  assert.ok(appJs.includes('window.CWP_ADMIN_V2.cleanReports.init()'), 'v2-app.js must initialize cleanReports');

  // Unique DOM IDs
  const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  const dups = [];
  for (const id of idMatches) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  assert.strictEqual(dups.length, 0, `Duplicate DOM IDs found in index.html: ${dups.join(', ')}`);

  // CSS scoping check
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
  const selectors = [...cssWithoutComments.matchAll(/([^{}@]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of selectors) {
    const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const ok = p.startsWith('#v2View_cleanReports') ||
        p.startsWith('.cwp-v2-cr-') ||
        p.startsWith('#v2ModalCleanReport') ||
        p.startsWith('.cwp-v2-workspace:has(> #v2View_cleanReports');
      assert.ok(ok, `Unscoped CSS selector in v2-clean-reports.css: "${p}"`);
    }
  }

  // No emojis in JS UI strings or cleanReports HTML section
  const crHtmlMatch = html.match(/<section id="v2View_cleanReports"[\s\S]*?<\/section>/);
  assert.ok(crHtmlMatch, 'v2View_cleanReports section must exist');
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emojiRe.test(crHtmlMatch[0]), 'Emoji found in v2View_cleanReports HTML');
  assert.ok(!emojiRe.test(js), 'Emoji found in v2-clean-reports.js');

  console.log('PASS 1: Static hygiene, CSS scoping, English-only & unique IDs verified.');
}

async function run() {
  await runStaticTests();

  console.log('\n--- PHASE 2: Live Server & API Verification ---');
  const serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(TEST_PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 12000);
    serverProc.stdout.on('data', chunk => {
      if (chunk.toString().includes('Server running') || chunk.toString().includes(String(TEST_PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc.stderr.on('data', chunk => {
      const msg = chunk.toString();
      if (msg.includes('EADDRINUSE')) {
        clearTimeout(timer);
        reject(new Error(msg));
      }
    });
  });

  let chromeProc = null;
  let cdp = null;

  try {
    const loginRes = await httpRequest('POST', '/api', {
      action: 'verifyAdminPassword',
      password: TEST_PASS
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.body.success && loginRes.body.token, 'Admin login failed');
    const token = loginRes.body.token;

    const repRes = await httpRequest('POST', '/api', {
      action: 'getDailyCleanReports',
      startDate: TODAY_IST,
      endDate: TODAY_IST,
      token
    });
    assert.strictEqual(repRes.status, 200);
    assert.strictEqual(repRes.body.records.length, 14, 'Expected 14 records for today');

    console.log('PASS 2: Backend API verified.');

    console.log('\n--- PHASE 3: Live CDP Browser Verification ---');
    const chromePath = findChromeBinary();
    assert.ok(chromePath, 'Chrome/Edge binary not found');
    const cdpPort = 9335;
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_cr_cdp_'));

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
        const res = await httpRequest('GET', '/json', null, {});
        // query cdpPort directly
      } catch (e) {}
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
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=cleanReports` });
    await new Promise(r => setTimeout(r, 1200));

    // Track console & runtime errors and sign in through the Aura login gate
    await cdp.eval(`(() => {
      window.__crErrors = [];
      window.addEventListener('error', e => window.__crErrors.push(e.message || 'error'));
      window.addEventListener('unhandledrejection', e => window.__crErrors.push(String(e.reason || 'rejection')));
      const input = document.getElementById('v2AdminPasswordInput');
      if (input) {
        input.value = ${JSON.stringify(TEST_PASS)};
        document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Wait for rows to load
    const loaded = await cdp.eval(`(async () => {
      for (let i = 0; i < 30; i++) {
        const rows = document.querySelectorAll('#v2CrTableBody tr[data-cr-row]');
        if (rows.length > 0) return rows.length;
        await new Promise(r => setTimeout(r, 150));
      }
      return 0;
    })()`);
    assert.strictEqual(loaded, 14, `Expected 14 rows rendered on page 1 (pageSize=25), got ${loaded}`);

    // Verify KPIs
    const kpis = await cdp.eval(`(() => ({
      scheduled: document.getElementById('v2CrKpiScheduled').textContent,
      completed: document.getElementById('v2CrKpiCompleted').textContent,
      exceptions: document.getElementById('v2CrKpiExceptions').textContent,
      staff: document.getElementById('v2CrKpiStaff').textContent
    }))()`);
    assert.strictEqual(kpis.scheduled, '14');
    assert.strictEqual(kpis.completed, '12');
    assert.strictEqual(kpis.exceptions, '3'); // 1 car_not_present + 1 skipped + 1 completed without photo
    assert.strictEqual(kpis.staff, '2');

    // Test KPI click filtering (Exceptions -> 3 rows, click again -> 14 rows)
    await cdp.eval(`document.querySelector('[data-kpi-filter="exceptions"]').click()`);
    const excRows = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(excRows, 3, 'Clicking Exceptions KPI must filter to 3 rows');
    await cdp.eval(`document.querySelector('[data-kpi-filter="exceptions"]').click()`);
    const resetRows = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(resetRows, 14, 'Clicking Exceptions KPI again must reset to 14 rows');

    // Test Pagination (10 per page -> 10 on page 1, 4 on page 2)
    await cdp.eval(`(() => {
      const sel = document.getElementById('v2CrPageSizeSelect');
      sel.value = '10';
      sel.dispatchEvent(new Event('change'));
    })()`);
    const p1Count = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(p1Count, 10, 'Page size 10 should show 10 rows on page 1');
    await cdp.eval(`document.getElementById('v2CrNextPageBtn').click()`);
    const p2Count = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(p2Count, 4, 'Page 2 should show 4 rows');

    // Test Debounced Search
    await cdp.eval(`(() => {
      const inp = document.getElementById('v2CrSearchInput');
      inp.value = 'UP65CR1005';
      inp.dispatchEvent(new Event('input'));
    })()`);
    await new Promise(r => setTimeout(r, 320));
    const searchCount = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(searchCount, 1, 'Search for UP65CR1005 should return 1 row');
    await cdp.eval(`document.getElementById('v2CrClearFiltersBtn').click()`);

    // Test Staff Progress toggle & click filter
    await cdp.eval(`document.getElementById('v2CrStaffToggleCard').click()`);
    const staffPanelVisible = await cdp.eval(`!document.getElementById('v2CrStaffPanel').hidden`);
    assert.ok(staffPanelVisible, 'Staff progress panel should open');
    await cdp.eval(`document.querySelector('[data-staff-filter="STF01"]').click()`);
    const stf1Count = await cdp.eval(`window.CWP_ADMIN_V2.cleanReports.getState().filteredRows`);
    assert.strictEqual(stf1Count, 7, 'STF01 should have 7 rows');
    await cdp.eval(`document.getElementById('v2CrClearFiltersBtn').click()`);

    // Test Detail Panel open & scroll preservation
    await cdp.eval(`(() => {
      const wrap = document.getElementById('v2CrTableWrap');
      wrap.scrollTop = 40;
      document.querySelector('#v2CrTableBody tr[data-cr-row]').click();
    })()`);
    const detailOpen = await cdp.eval(`!document.getElementById('v2CrSplitView').classList.contains('is-detail-closed')`);
    assert.ok(detailOpen, 'Detail panel should open on row click');
    await cdp.eval(`document.getElementById('v2CrDetailCloseBtn').click()`);

    // Test Update Status modal
    await cdp.eval(`document.querySelector('[data-cr-edit="cr_log_1"]').click()`);
    await cdp.eval(`(() => {
      document.getElementById('v2CrEditStatusSelect').value = 'car_not_present';
      document.getElementById('v2CrEditReasonInput').value = 'QA status check';
      document.getElementById('v2CrEditForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    })()`);
    await new Promise(r => setTimeout(r, 500));
    const updatedExc = await cdp.eval(`document.getElementById('v2CrKpiExceptions').textContent`);
    assert.strictEqual(updatedExc, '4', 'Exceptions count should increment to 4 after status update');

    // Test Previous Day navigation & Today shortcut
    await cdp.eval(`document.getElementById('v2CrPrevDayBtn').click()`);
    await new Promise(r => setTimeout(r, 500));
    const yestRows = await cdp.eval(`document.querySelectorAll('#v2CrTableBody tr[data-cr-row]').length`);
    assert.strictEqual(yestRows, 1, 'Previous day should show 1 record');
    await cdp.eval(`document.getElementById('v2CrTodayBtn').click()`);
    await new Promise(r => setTimeout(r, 500));
    const backToday = await cdp.eval(`window.CWP_ADMIN_V2.cleanReports.getState().totalRows`);
    assert.strictEqual(backToday, 14, 'Today shortcut should restore 14 records');

    // Viewport & Double-Scroll Verification: Desktop 1440x900, Tablet 768x1024, Mobile 390x844
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
      await new Promise(r => setTimeout(r, 250));
      const metrics = await cdp.eval(`(() => {
        const doc = document.documentElement;
        const ws = document.querySelector('.cwp-v2-workspace');
        const tw = document.getElementById('v2CrTableWrap');
        return {
          docOverflowX: doc.scrollWidth > doc.clientWidth + 1,
          docScrollY: doc.scrollHeight > doc.clientHeight + 2,
          wsScrollY: ws ? ws.scrollHeight > ws.clientHeight + 2 : false,
          twScrollY: tw ? tw.scrollHeight > tw.clientHeight + 2 : false
        };
      })()`);
      assert.strictEqual(metrics.docOverflowX, false, `${vp.name}: Horizontal overflow detected`);
      if (vp.width >= 1024) {
        assert.strictEqual(metrics.docScrollY, false, `${vp.name}: Document should not vertically scroll on desktop`);
        assert.strictEqual(metrics.wsScrollY, false, `${vp.name}: Workspace should not double-scroll on desktop`);
      } else {
        assert.strictEqual(metrics.wsScrollY, false, `${vp.name}: Workspace should not double-scroll on ${vp.name}`);
        assert.strictEqual(metrics.twScrollY, false, `${vp.name}: Table wrap should not nest vertical scroll on ${vp.name}`);
      }
      console.log(`[PASS] Viewport ${vp.name} (${vp.width}x${vp.height}): no horizontal overflow, no double scroll`);
    }

    const errors = await cdp.eval(`window.__crErrors || []`);
    assert.strictEqual(errors.length, 0, `Console/runtime errors detected: ${errors.join('; ')}`);

    console.log('\nALL DAILY CLEANING STATUS MIGRATION QA CHECKS PASSED!');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) chromeProc.kill();
    serverProc.kill();
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
