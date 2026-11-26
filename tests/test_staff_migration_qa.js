/**
 * =========================================================================
 * CWP ADMIN V2 — STAFF MANAGEMENT MIGRATION & OPERATIONAL QA SUITE
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
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestV2Admin@2026';
const TEST_PASS = process.env.ADMIN_PASSWORD;
const TEST_PORT = 5999;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_staff_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [
    {
      id: 'cust_stf_qa_1',
      customerName: 'Rohan Mehta',
      customerNumber: '9876511111',
      phone: '9876511111',
      address: 'Gomti Nagar, Lucknow',
      vehicle: 'UP32 AB 1111 (Creta)',
      staffId: 'STF01',
      staffName: 'Amit Kumar',
      serviceCategory: 'Daily Car Cleaning',
      active: 'Yes',
      isActive: true
    }
  ],
  staffList: [
    {
      id: 'STF01',
      name: 'Amit Kumar',
      phone: '9876500011',
      pin: '123456',
      active: true,
      isActive: true,
      designationId: 'cleaner',
      designationName: 'Cleaner',
      workType: 'dcc_and_services',
      serviceCapabilities: ['daily_car_cleaning', 'car_washing'],
      weeklyOff: 'Sunday'
    },
    {
      id: 'STF02',
      name: 'Gaurav Gupta',
      phone: '9876500022',
      pin: '654321',
      active: true,
      isActive: true,
      designationId: 'supervisor',
      designationName: 'Field Supervisor',
      workType: 'dcc_only',
      serviceCapabilities: ['daily_car_cleaning'],
      weeklyOff: 'Monday'
    }
  ],
  serviceJobs: []
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
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function findBrowserBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        } else if (msg.method) {
          this.events.push(msg);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => {\n${expression}\n})()`,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const detail = res.exceptionDetails.exception
        ? (res.exceptionDetails.exception.description || res.exceptionDetails.exception.value)
        : res.exceptionDetails.text;
      throw new Error(detail || 'Runtime evaluation error');
    }
    return res.result ? res.result.value : undefined;
  }
  close() {
    if (this.ws) try { this.ws.close(); } catch (e) {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function run() {
  console.log('===============================================================');
  console.log('🧪 CWP ADMIN V2 — STAFF MANAGEMENT MIGRATION QA SUITE');
  console.log('===============================================================');

  // 1. Static Isolation & Scoping
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  assert.ok(v2Html.includes('/admin-v2/css/v2-staff.css'), 'index.html must link v2-staff.css');
  assert.ok(v2Html.includes('/admin-v2/js/v2-staff.js'), 'index.html must load v2-staff.js');

  const staffCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-staff.css'), 'utf8');
  assert.ok(staffCss.includes('#v2View_staff.is-active'), 'v2-staff.css must scope #v2View_staff to .is-active');
  for (const line of staffCss.split('\n')) {
    const t = line.trim();
    assert.ok(t !== 'body {' && t !== 'html {', 'v2-staff.css must not contain bare body/html selectors');
  }
  console.log('✅ PASS 1: Static isolation and CSS scoping verified.');

  // 2. Backend API Verification
  const { server } = require('../server.js');
  await new Promise((resolve, reject) => server.listen(TEST_PORT, '127.0.0.1', err => err ? reject(err) : resolve()));

  const loginRes = await httpRequest('POST', '/api', { action: 'verifyAdminPassword', password: TEST_PASS });
  assert.strictEqual(loginRes.status, 200);
  const authHeaders = { Authorization: `Bearer ${loginRes.json.token}` };

  const listRes = await httpRequest('POST', '/api', { action: 'getStaffList' }, authHeaders);
  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.json) && listRes.json.length >= 2, 'getStaffList must return staff records');

  const desigRes = await httpRequest('POST', '/api', { action: 'getDesignationsList' }, authHeaders);
  assert.strictEqual(desigRes.status, 200);
  console.log('✅ PASS 2: Backend Staff & Designations API verified.');

  // 3. Live Browser CDP Verification
  const browserBin = findBrowserBinary();
  assert.ok(browserBin, 'Edge/Chrome binary required');
  const cdpPort = 9225;
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_staff_cdp_'));
  const browserProc = spawn(browserBin, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${tempUserDir}`,
    `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=staff`
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      try {
        const list = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
        if (Array.isArray(list) && list.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) {
          targets = list;
          break;
        }
      } catch (e) {}
    }
    assert.ok(targets, 'CDP page target must become available');
    cdp = new CdpClient(targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl).webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    await cdp.evaluate(`
      document.getElementById('v2AdminPasswordInput').value = '${TEST_PASS}';
      document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);

    for (let i = 0; i < 20; i++) {
      const ready = await cdp.evaluate(`
        const st = window.CWP_ADMIN_V2?.staff?.getState();
        return st && !st.isLoading && st.allStaff.length > 0;
      `);
      if (ready) break;
      await sleep(250);
    }

    // 3a. Module isolation & Initial Split-View state
    const initCheck = await cdp.evaluate(`
      const staffView = document.getElementById('v2View_staff');
      const custView = document.getElementById('v2View_records');
      const splitView = document.getElementById('v2StaffSplitView');
      const rows = document.querySelectorAll('#v2StaffTableBody tr');
      const tbodyText = document.getElementById('v2StaffTableBody')?.innerText || '';
      return {
        staffDisplay: window.getComputedStyle(staffView).display,
        custDisplay: window.getComputedStyle(custView).display,
        detailClosed: splitView.classList.contains('is-detail-closed'),
        rowCount: rows.length,
        hasDevanagari: /[\u0900-\u097F]/.test(tbodyText)
      };
    `);
    assert.notStrictEqual(initCheck.staffDisplay, 'none', 'Staff view must be visible');
    assert.strictEqual(initCheck.custDisplay, 'none', 'Customer view must be hidden when on Staff tab');
    assert.strictEqual(initCheck.detailClosed, true, 'Staff detail panel must start closed');
    assert.ok(initCheck.rowCount >= 2, 'Staff directory must render live rows');
    assert.strictEqual(initCheck.hasDevanagari, false, 'Staff table must be English-only');

    // 3b. Select row, test 5 Detail Tabs, masked PIN, and Dismiss button
    const detailCheck = await cdp.evaluate(`
      document.querySelectorAll('#v2StaffTableBody tr')[0].click();
      const splitOpen = !document.getElementById('v2StaffSplitView').classList.contains('is-detail-closed');
      const maskedPin = document.getElementById('v2StaffMaskedPin')?.textContent;
      const tabResults = {};
      for (const t of ['overview', 'assignments', 'performance', 'leave', 'activity']) {
        document.querySelector('.cwp-v2-staff-detail-tab-btn[data-staff-detail-tab="' + t + '"]').click();
        tabResults[t] = (document.getElementById('v2StaffDetailScroll')?.innerText || '').length > 10;
      }
      document.getElementById('v2StaffBtnCloseDetail').click();
      const closedAfter = document.getElementById('v2StaffSplitView').classList.contains('is-detail-closed');
      return { splitOpen, maskedPin, tabResults, closedAfter };
    `);
    assert.strictEqual(detailCheck.splitOpen, true, 'Clicking staff row must open detail panel');
    assert.strictEqual(detailCheck.maskedPin, '••••••', 'PIN must be masked by default');
    for (const [tab, ok] of Object.entries(detailCheck.tabResults)) {
      assert.strictEqual(ok, true, `Detail tab "${tab}" must render content`);
    }
    assert.strictEqual(detailCheck.closedAfter, true, 'Close button must dismiss detail panel');

    // 3c. Search & Reset
    await cdp.evaluate(`
      const inp = document.getElementById('v2StaffSearchInput');
      inp.value = 'Gaurav';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await sleep(350);
    const searchRows = await cdp.evaluate(`return document.querySelectorAll('#v2StaffTableBody tr').length;`);
    assert.strictEqual(searchRows, 1, 'Search for "Gaurav" must match 1 row');
    await cdp.evaluate(`document.getElementById('v2StaffResetFilters').click();`);
    await sleep(200);

    // 3d. Add Staff 5-step wizard + Outlined Inputs
    const wizCheck = await cdp.evaluate(`
      document.getElementById('v2BtnAddStaff').click();
      const open = document.getElementById('v2ModalAddStaff').style.display !== 'none';
      const borderW = window.getComputedStyle(document.getElementById('v2AddStaffName')).borderTopWidth;
      document.getElementById('v2StaffWizNext').click(); // fails validation
      const errVisible = document.getElementById('v2AddStaffNameField').classList.contains('has-error');
      document.getElementById('v2AddStaffName').value = 'New QA Cleaner';
      document.getElementById('v2AddStaffPhone').value = '9876500099';
      document.getElementById('v2StaffWizNext').click(); // step 2
      document.getElementById('v2AddStaffPin').value = '112233';
      document.getElementById('v2StaffWizNext').click(); // step 3
      document.getElementById('v2StaffWizNext').click(); // step 4
      document.getElementById('v2StaffWizNext').click(); // step 5
      const step5Active = document.querySelector('#v2ModalAddStaff .cwp-v2-wizard-pane[data-step-pane="5"]').classList.contains('is-active');
      document.querySelector('#v2ModalAddStaff [data-overlay-close]').click();
      return { open, borderW, errVisible, step5Active };
    `);
    assert.strictEqual(wizCheck.open, true);
    assert.notStrictEqual(wizCheck.borderW, '0px', 'Add Staff inputs must have visible outlined border');
    assert.strictEqual(wizCheck.errVisible, true, 'Step 1 validation must trigger inline error');
    assert.strictEqual(wizCheck.step5Active, true, 'Must reach Step 5 review');

    // 3e. Responsive viewports (1024, 768, 360)
    for (const [w, h, mob] of [[1024, 768, false], [768, 1024, false], [360, 800, true]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
      await sleep(250);
      const overflowOk = await cdp.evaluate(`return document.documentElement.scrollWidth <= window.innerWidth;`);
      assert.strictEqual(overflowOk, true, `Viewport ${w}x${h} must have zero horizontal overflow`);
    }

    const consoleErrors = cdp.events
      .filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map(e => (e.params.args || []).map(a => a.value || a.description).join(' '));
    assert.strictEqual(consoleErrors.length, 0, `Zero console errors expected. Found: ${consoleErrors.join(', ')}`);

    console.log('✅ PASS 3: Live CDP Browser verification across all viewports, tabs, wizard & security passed.');
    console.log('\n🎉 ALL STAFF MODULE MIGRATION QA TESTS PASSED!');
  } finally {
    if (cdp) cdp.close();
    if (browserProc) try { browserProc.kill(); } catch (e) {}
    if (fs.existsSync(tempUserDir)) try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
    if (fs.existsSync(tempDataDir)) try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
    server.close();
  }
}

run().catch(err => {
  console.error('❌ STAFF QA FAILED:', err);
  process.exit(1);
});
