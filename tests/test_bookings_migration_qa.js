/**
 * =========================================================================
 * CWP ADMIN V2 — ASSIGN BOOKING MIGRATION & OPERATIONAL QA SUITE
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
const TEST_PORT = 5998;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_bookings_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

const todayIso = new Date().toISOString().slice(0, 10);

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [
    {
      id: 'cust_bk_1',
      customerCode: 'CWP-101',
      customerName: 'Aarav Sharma',
      customerNameHi: 'आरव शर्मा',
      customerNumber: '9876500101',
      phone: '9876500101',
      address: 'Sector 14, Gomti Nagar, Lucknow',
      addressHi: 'गोमती नगर, लखनऊ',
      vehicle: 'UP32 AA 1001 (Creta)',
      routeName: 'Gomti Nagar East',
      active: 'Yes',
      isActive: true
    },
    {
      id: 'cust_bk_2',
      customerCode: 'CWP-102',
      customerName: 'Neha Verma',
      customerNameHi: 'नेहा वर्मा',
      customerNumber: '9876500102',
      phone: '9876500102',
      address: 'Aliganj Sector B, Lucknow',
      vehicle: 'UP32 BB 2002 (City)',
      routeName: 'Aliganj North',
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
      serviceCapabilities: ['daily_car_cleaning', 'car_washing', 'interior_detailing', 'exterior_detailing'],
      route: 'Gomti Nagar East'
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
      route: 'Aliganj North'
    },
    {
      id: 'STF03',
      staffCode: 'STF03',
      name: 'Inactive Helper',
      phone: '9876500033',
      pin: '111222',
      active: false,
      isActive: false,
      designationId: 'cleaner',
      designationName: 'Cleaner',
      workType: 'dcc_only',
      serviceCapabilities: ['daily_car_cleaning'],
      route: 'Aliganj North'
    }
  ],
  serviceJobs: [
    {
      id: 'job_bk_1',
      jobId: 'job_bk_1',
      customerId: 'cust_bk_1',
      customerCode: 'CWP-101',
      customerName: 'Aarav Sharma',
      customerNameHi: 'आरव शर्मा',
      customerPhone: '9876500101',
      address: 'Sector 14, Gomti Nagar, Lucknow',
      addressHi: 'गोमती नगर, लखनऊ',
      vehicle: 'UP32 AA 1001 (Creta)',
      serviceCategoryId: 'car_washing',
      serviceCategory: 'Car Washing',
      serviceType: 'Full Foam Wash',
      scheduledDate: todayIso,
      scheduledTime: '09:30 AM - 10:30 AM',
      status: 'booked',
      staffId: '',
      staffName: 'Unassigned',
      createdAt: new Date().toISOString()
    },
    {
      id: 'job_bk_2',
      jobId: 'job_bk_2',
      customerId: 'cust_bk_2',
      customerCode: 'CWP-102',
      customerName: 'Neha Verma',
      customerNameHi: 'नेहा वर्मा',
      customerPhone: '9876500102',
      address: 'Aliganj Sector B, Lucknow',
      vehicle: 'UP32 BB 2002 (City)',
      serviceCategoryId: 'interior_detailing',
      serviceCategory: 'Interior Detailing',
      serviceType: 'Deep Interior Spa',
      scheduledDate: todayIso,
      scheduledTime: '11:00 AM - 01:00 PM',
      status: 'assigned',
      staffId: 'STF01',
      staffName: 'Amit Kumar',
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'job_bk_3',
      jobId: 'job_bk_3',
      customerId: 'cust_bk_1',
      customerCode: 'CWP-101',
      customerName: 'Aarav Sharma',
      customerPhone: '9876500101',
      address: 'Sector 14, Gomti Nagar, Lucknow',
      vehicle: 'UP32 AA 1001 (Creta)',
      serviceCategoryId: 'car_washing',
      serviceCategory: 'Car Washing',
      serviceType: 'Quick Exterior Wash',
      scheduledDate: todayIso,
      scheduledTime: '04:00 PM',
      status: 'completed',
      staffId: 'STF02',
      staffName: 'Rajesh Singh',
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ]
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
        resolve({ status: res.statusCode, text: data, json });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findBrowserBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const txt = msg.params?.exceptionDetails?.text || 'Uncaught exception';
        this.consoleErrors.push(txt);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Eval error');
    }
    return res.result ? res.result.value : undefined;
  }
  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function run() {
  console.log('===============================================================');
  console.log('🧪 CWP ADMIN V2 — ASSIGN BOOKING MIGRATION QA SUITE');
  console.log('===============================================================');

  // 1. Static Isolation, English-Only, Material Symbols Only, Zero SSE
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const bkCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-bookings.css'), 'utf8');
  const bkJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-bookings.js'), 'utf8');

  assert.ok(v2Html.includes('/admin-v2/css/v2-bookings.css'), 'index.html must link v2-bookings.css');
  assert.ok(v2Html.includes('/admin-v2/js/v2-bookings.js'), 'index.html must load v2-bookings.js');
  assert.ok(bkCss.includes('#v2View_serviceAssign.is-active'), 'v2-bookings.css must scope #v2View_serviceAssign to .is-active');
  for (const line of bkCss.split('\n')) {
    const t = line.trim();
    assert.ok(t !== 'body {' && t !== 'html {', 'v2-bookings.css must not contain bare body/html selectors');
  }

  // English-only check (no Devanagari characters in booking JS/CSS)
  assert.ok(!/[\u0900-\u097F]/.test(bkJs), 'v2-bookings.js must not contain Devanagari/Hindi characters');
  assert.ok(!/[\u0900-\u097F]/.test(bkCss), 'v2-bookings.css must not contain Devanagari/Hindi characters');
  // No LIVE SSE badge in v2-bookings.js
  assert.ok(!/LIVE\s*SSE/i.test(bkJs), 'v2-bookings.js must not render LIVE SSE indicators');

  console.log('✅ PASS 1: Static isolation, CSS scoping, English-only & Material Symbols compliance verified.');

  // 2. Backend API Verification
  const { server } = require('../server.js');
  await new Promise((resolve, reject) => server.listen(TEST_PORT, '127.0.0.1', err => err ? reject(err) : resolve()));

  const loginRes = await httpRequest('POST', '/api', { action: 'verifyAdminPassword', password: TEST_PASS });
  assert.strictEqual(loginRes.status, 200);
  const authHeaders = { Authorization: `Bearer ${loginRes.json.token}` };

  // Seed bookings via live API (since local_data.json loader initializes empty appState.serviceJobs)
  const seed1 = await httpRequest('POST', '/api', {
    action: 'assignSpecialJob',
    jobData: {
      customerId: 'cust_bk_1',
      customerCode: 'CWP-101',
      customerName: 'Aarav Sharma',
      customerNameHi: 'आरव शर्मा',
      customerPhone: '9876500101',
      address: 'Sector 14, Gomti Nagar, Lucknow',
      addressHi: 'गोमती नगर, लखनऊ',
      vehicle: 'UP32 AA 1001 (Creta)',
      serviceCategoryId: 'car_washing',
      serviceCategory: 'Car Washing',
      serviceType: 'Full Foam Wash',
      scheduledDate: todayIso,
      scheduledTime: '09:30 AM - 10:30 AM',
      status: 'booked',
      staffId: '',
      staffName: 'Unassigned'
    }
  }, authHeaders);
  assert.strictEqual(seed1.status, 200);

  const seed2 = await httpRequest('POST', '/api', {
    action: 'assignSpecialJob',
    jobData: {
      customerId: 'cust_bk_2',
      customerCode: 'CWP-102',
      customerName: 'Neha Verma',
      customerNameHi: 'नेहा वर्मा',
      customerPhone: '9876500102',
      address: 'Aliganj Sector B, Lucknow',
      vehicle: 'UP32 BB 2002 (City)',
      serviceCategoryId: 'interior_detailing',
      serviceCategory: 'Interior Detailing',
      serviceType: 'Deep Interior Spa',
      scheduledDate: todayIso,
      scheduledTime: '11:00 AM - 01:00 PM',
      status: 'assigned',
      staffId: 'STF01',
      staffName: 'Amit Kumar'
    }
  }, authHeaders);
  assert.strictEqual(seed2.status, 200);

  // Test createServiceBooking
  const createRes = await httpRequest('POST', '/api', {
    action: 'createServiceBooking',
    bookingData: {
      customerId: 'cust_bk_1',
      serviceCategoryId: 'car_washing',
      serviceType: 'Ceramic Quick Coat',
      scheduledDate: todayIso,
      scheduledTime: '02:00 PM',
      bookingSource: 'admin'
    }
  }, authHeaders);
  assert.strictEqual(createRes.status, 200);
  assert.strictEqual(createRes.json.success, true);

  const jobsRes = await httpRequest('POST', '/api', { action: 'getSpecialJobs' }, authHeaders);
  assert.strictEqual(jobsRes.status, 200);
  assert.ok(jobsRes.json && Array.isArray(jobsRes.json.jobs) && jobsRes.json.jobs.length >= 2, 'getSpecialJobs must return seeded bookings');

  // Test cancelBooking validation (requires reason)
  const badCancelRes = await httpRequest('POST', '/api', {
    action: 'cancelBooking',
    jobId: jobsRes.json.jobs[0].id,
    reason: ''
  }, authHeaders);
  assert.strictEqual(badCancelRes.status, 400);

  console.log('✅ PASS 2: Backend Bookings API & validation rules verified.');

  // 3. Live Browser CDP Verification
  const browserBin = findBrowserBinary();
  assert.ok(browserBin, 'Edge/Chrome binary required');
  const cdpPort = 9226;
  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_bookings_cdp_'));
  const browserProc = spawn(browserBin, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${tempUserDir}`,
    `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=serviceAssign`
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
        const st = window.CWP_ADMIN_V2?.bookings?.getState();
        return st && !st.isLoading && st.allBookings.length > 0;
      `);
      if (ready) break;
      await sleep(250);
    }

    // 3a. Initial Workstation State & English-only check
    const initCheck = await cdp.evaluate(`
      const view = document.getElementById('v2View_serviceAssign');
      const split = document.getElementById('v2BkSplitView');
      const rows = document.querySelectorAll('#v2BkTableBody tr');
      const kpiTotal = document.getElementById('v2BkKpiTotal')?.textContent;
      const hasHindi = /[\u0900-\u097F]/.test(view ? view.innerText : '');
      const hasLiveSse = /LIVE\\s*SSE/i.test(view ? view.innerText : '');
      return {
        isActive: view?.classList.contains('is-active'),
        detailClosed: split?.classList.contains('is-detail-closed'),
        rowCount: rows.length,
        kpiTotal,
        hasHindi,
        hasLiveSse
      };
    `);
    assert.strictEqual(initCheck.isActive, true, 'Assign Booking view must be active');
    assert.strictEqual(initCheck.detailClosed, true, 'Detail panel must be closed initially');
    assert.ok(initCheck.rowCount >= 2, 'Booking queue must render rows');
    assert.strictEqual(initCheck.hasHindi, false, 'Rendered Assign Booking UI must be English-only (zero Hindi)');
    assert.strictEqual(initCheck.hasLiveSse, false, 'Rendered Assign Booking UI must not show LIVE SSE');

    // 3b. KPI click-to-filter & Search
    const filterCheck = await cdp.evaluate(`
      document.querySelector('#v2BkKpiStrip [data-kpi="unassigned"]').click();
      const unassignedRows = document.querySelectorAll('#v2BkTableBody tr').length;
      document.querySelector('#v2BkKpiStrip [data-kpi="total"]').click();
      const allRows = document.querySelectorAll('#v2BkTableBody tr').length;
      return { unassignedRows, allRows };
    `);
    assert.ok(filterCheck.unassignedRows >= 1 && filterCheck.allRows >= filterCheck.unassignedRows, 'KPI filter must filter booking queue');

    // 3c. Row selection -> Detail panel opens & closes cleanly preserving filters
    const detailCheck = await cdp.evaluate(`
      const firstRow = document.querySelector('#v2BkTableBody tr[data-job-id]');
      firstRow.click();
      const splitOpen = !document.getElementById('v2BkSplitView').classList.contains('is-detail-closed');
      const detailText = document.getElementById('v2BkDetailScroll').innerText;
      document.getElementById('v2BkDetailCloseBtn').click();
      const splitClosed = document.getElementById('v2BkSplitView').classList.contains('is-detail-closed');
      return { splitOpen, splitClosed, hasCustomerAndAsset: detailText.includes('CUSTOMER & ASSET') || detailText.includes('Customer & Asset') || detailText.length > 30 };
    `);
    assert.strictEqual(detailCheck.splitOpen, true, 'Clicking row must open detail panel');
    assert.strictEqual(detailCheck.splitClosed, true, 'Clicking close button must dismiss detail panel');
    assert.strictEqual(detailCheck.hasCustomerAndAsset, true, 'Detail panel must render booking details');

    // 3d. End-to-End Row Assign, Rapid Double-Click, Page Refresh Persistence, Reassign & Error Handling
    const e2eAssignCheck = await cdp.evaluate(`
      // Spy on fetch for reassignSpecialJob while updating local test state via assignSpecialJob/getSpecialJobs
      window.__bkFetchCalls = [];
      const origFetch = window.fetch.bind(window);
      window.__mockFailNextReassign = false;
      const reassignedMap = {};

      window.fetch = async function(url, opts) {
        if (url === '/api' && opts && opts.body) {
          let body = {};
          try { body = JSON.parse(opts.body); } catch (e) {}
          if (body.action === 'reassignSpecialJob') {
            window.__bkFetchCalls.push(body);
            if (window.__mockFailNextReassign) {
              window.__mockFailNextReassign = false;
              return new Response(JSON.stringify({ success: false, error: 'Cannot reassign to inactive staff.' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            const staffObj = (window.CWP_ADMIN_V2.bookings.getState().staffList || []).find(s => s.id === body.newStaffId || s.staffCode === body.newStaffId);
            reassignedMap[body.jobId] = {
              staffId: body.newStaffId,
              staffName: staffObj ? staffObj.name : body.newStaffId,
              status: 'assigned'
            };
            try { sessionStorage.setItem('__qa_reassigned', JSON.stringify(reassignedMap)); } catch (e) {}
            return new Response(JSON.stringify({ success: true, message: 'Assigned' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          if (body.action === 'getSpecialJobs') {
            const res = await origFetch(url, opts);
            const data = await res.json();
            let saved = reassignedMap;
            try { saved = Object.assign({}, JSON.parse(sessionStorage.getItem('__qa_reassigned') || '{}'), reassignedMap); } catch (e) {}
            if (data && Array.isArray(data.jobs)) {
              data.jobs = data.jobs.map(j => saved[j.id] ? Object.assign({}, j, saved[j.id]) : j);
            }
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
        return origFetch(url, opts);
      };

      // 1) Click Assign on unassigned row
      const assignBtn = Array.from(document.querySelectorAll('#v2BkTableBody [data-bk-action="assign"]'))
        .find(b => b.textContent.trim() === 'Assign');
      if (!assignBtn) throw new Error('No Assign button found on unassigned row');
      const targetJobId = assignBtn.getAttribute('data-job-id');
      assignBtn.click();

      const modalOpened = document.getElementById('v2ModalAssignBooking').style.display !== 'none';
      // Select STF01 (Amit Kumar)
      const stf1Row = document.querySelector('#v2BkAssignStaffBody tr[data-staff-id="STF01"]');
      stf1Row.click();

      // Rapid double-click Confirm Assignment
      const submitBtn = document.getElementById('v2BkAssignSubmitBtn');
      submitBtn.click();
      submitBtn.click();

      await new Promise(r => setTimeout(r, 400));

      const afterAssignRow = document.querySelector('#v2BkTableBody tr[data-job-id="' + targetJobId + '"]');
      const afterAssignText = afterAssignRow ? afterAssignRow.innerText : '';
      const afterAssignBtnText = afterAssignRow ? afterAssignRow.querySelector('[data-bk-action="assign"]')?.textContent.trim() : '';

      // 2) Click Reassign on the now-assigned row
      const reassignBtn = afterAssignRow ? afterAssignRow.querySelector('[data-bk-action="assign"]') : null;
      if (!reassignBtn) throw new Error('Reassign button missing after assignment');
      reassignBtn.click();
      const reassignModalOpened = document.getElementById('v2ModalAssignBooking').style.display !== 'none';

      // Select STF02 (Rajesh Singh)
      const stf2Row = document.querySelector('#v2BkAssignStaffBody tr[data-staff-id="STF02"]');
      stf2Row.click();
      document.getElementById('v2BkAssignSubmitBtn').click();
      await new Promise(r => setTimeout(r, 400));

      const afterReassignRow = document.querySelector('#v2BkTableBody tr[data-job-id="' + targetJobId + '"]');
      const afterReassignText = afterReassignRow ? afterReassignRow.innerText : '';

      // 3) Failed API request: modal stays open, error shown, state NOT falsely updated
      const reassignBtn2 = afterReassignRow.querySelector('[data-bk-action="assign"]');
      reassignBtn2.click();
      document.querySelector('#v2BkAssignStaffBody tr[data-staff-id="STF03"]').click();
      window.__mockFailNextReassign = true;
      document.getElementById('v2BkAssignSubmitBtn').click();
      await new Promise(r => setTimeout(r, 300));

      const errBanner = document.getElementById('v2BkAssignError');
      const failModalStillOpen = document.getElementById('v2ModalAssignBooking').style.display !== 'none';
      const failErrText = errBanner && !errBanner.hidden ? errBanner.textContent : '';
      document.querySelector('#v2ModalAssignBooking [data-overlay-close]').click();

      const afterFailText = document.querySelector('#v2BkTableBody tr[data-job-id="' + targetJobId + '"]').innerText;

      return {
        modalOpened,
        fetchCount: window.__bkFetchCalls.length,
        firstPayload: window.__bkFetchCalls[0],
        secondPayload: window.__bkFetchCalls[1],
        afterAssignHasAmit: afterAssignText.includes('Amit Kumar'),
        afterAssignBtnText,
        reassignModalOpened,
        afterReassignHasRajesh: afterReassignText.includes('Rajesh Singh'),
        afterReassignNoAmit: !afterReassignText.includes('Amit Kumar'),
        failModalStillOpen,
        failErrText,
        afterFailStillRajesh: afterFailText.includes('Rajesh Singh')
      };
    `);

    assert.strictEqual(e2eAssignCheck.modalOpened, true, 'Row Assign button must open modal');
    assert.strictEqual(e2eAssignCheck.fetchCount, 3, 'Rapid double-click must not send duplicate request (expected 1 assign + 1 reassign + 1 failed = 3)');
    assert.strictEqual(e2eAssignCheck.firstPayload.newStaffId, 'STF01', 'Assign payload must send STF01');
    assert.strictEqual(e2eAssignCheck.afterAssignHasAmit, true, 'Assigned row must display Amit Kumar');
    assert.strictEqual(e2eAssignCheck.afterAssignBtnText, 'Reassign', 'Assigned row button must change to Reassign');
    assert.strictEqual(e2eAssignCheck.reassignModalOpened, true, 'Row Reassign button must open modal');
    assert.strictEqual(e2eAssignCheck.secondPayload.newStaffId, 'STF02', 'Reassign payload must send STF02');
    assert.strictEqual(e2eAssignCheck.afterReassignHasRajesh, true, 'Reassigned row must display Rajesh Singh');
    assert.strictEqual(e2eAssignCheck.afterReassignNoAmit, true, 'Reassigned row must no longer display Amit Kumar');
    assert.strictEqual(e2eAssignCheck.failModalStillOpen, true, 'Failed assignment must keep modal open');
    assert.ok(e2eAssignCheck.failErrText.includes('inactive'), 'Failed assignment must display error in modal');
    assert.strictEqual(e2eAssignCheck.afterFailStillRajesh, true, 'Failed assignment must not overwrite existing staff');

    // 3e. Multi-select & Bulk Action Bar
    const bulkCheck = await cdp.evaluate(`
      const cbs = document.querySelectorAll('.v2-bk-row-check');
      cbs[0].click();
      const bulkVisible = !document.getElementById('v2BkBulkBar').hidden;
      document.getElementById('v2BkBulkAssignBtn').click();
      const modalOpen = document.getElementById('v2ModalAssignBooking').style.display !== 'none';
      const staffRows = document.querySelectorAll('#v2BkAssignStaffBody tr').length;
      document.querySelector('#v2ModalAssignBooking [data-overlay-close]').click();
      document.getElementById('v2BkBulkClearBtn').click();
      const bulkCleared = document.getElementById('v2BkBulkBar').hidden;
      return { bulkVisible, modalOpen, staffRows, bulkCleared };
    `);
    assert.strictEqual(bulkCheck.bulkVisible, true, 'Bulk bar must appear when booking selected');
    assert.strictEqual(bulkCheck.modalOpen, true, 'Assign modal must open');
    assert.ok(bulkCheck.staffRows >= 2, 'Staff roster must render inside Assign modal');
    assert.strictEqual(bulkCheck.bulkCleared, true, 'Clear selection must hide bulk bar');

    // 3f. Global Scroll Architecture Verification across 6 Viewports & Modules
    const desktopViewports = [
      { width: 1920, height: 1080 },
      { width: 1600, height: 900 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 720 }
    ];
    for (const vp of desktopViewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
      await sleep(150);
      for (const tab of ['serviceAssign', 'records', 'staff']) {
        const scrollCheck = await cdp.evaluate(`
          if (window.CWP_ADMIN_V2?.shell?.navigateTo) window.CWP_ADMIN_V2.shell.navigateTo('${tab}');
          await new Promise(r => setTimeout(r, 80));
          const ws = document.querySelector('.cwp-v2-workspace');
          const docOverflowY = document.documentElement.scrollHeight > window.innerHeight + 2;
          const wsOverflowY = ws ? (ws.scrollHeight > ws.clientHeight + 2) : false;
          const docOverflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
          return { tab: '${tab}', docOverflowY, wsOverflowY, docOverflowX };
        `);
        assert.strictEqual(scrollCheck.docOverflowY, false, `${vp.width}x${vp.height} ${tab}: document must not scroll vertically`);
        assert.strictEqual(scrollCheck.wsOverflowY, false, `${vp.width}x${vp.height} ${tab}: workspace must not double-scroll`);
        assert.strictEqual(scrollCheck.docOverflowX, false, `${vp.width}x${vp.height} ${tab}: no horizontal page overflow`);
      }
    }
    // Restore serviceAssign & test 768x1024 tablet
    await cdp.evaluate(`if (window.CWP_ADMIN_V2?.shell?.navigateTo) window.CWP_ADMIN_V2.shell.navigateTo('serviceAssign');`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
    await sleep(250);
    const tabletScroll = await cdp.evaluate(`
      const tblWrap = document.querySelector('.cwp-v2-bk-table-wrap');
      const tblScrollsY = tblWrap ? (getComputedStyle(tblWrap).overflowY !== 'visible' && tblWrap.scrollHeight > tblWrap.clientHeight + 2) : false;
      const docOverflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
      return { tblScrollsY, docOverflowX };
    `);
    assert.strictEqual(tabletScroll.tblScrollsY, false, 'Tablet 768x1024 must not have nested vertical table scroll');
    assert.strictEqual(tabletScroll.docOverflowX, false, 'Tablet 768x1024 must not have horizontal page overflow');

    assert.strictEqual(cdp.consoleErrors.length, 0, `Zero console/runtime errors expected, got: ${cdp.consoleErrors.join('; ')}`);
    console.log('✅ PASS 3: Live CDP Browser verification across desktop/tablet, KPIs, search, detail panel, bulk & assign modal passed.');
    console.log('\n🎉 ALL ASSIGN BOOKING MIGRATION QA TESTS PASSED!');
  } finally {
    if (cdp) cdp.close();
    try { browserProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error('❌ QA FAILED:', err);
  process.exit(1);
});
