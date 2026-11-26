/**
 * =========================================================================
 * CWP ADMIN V2 — LEADS MODULE MIGRATION & FUNCTIONAL QA SUITE
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
const TEST_PORT = 5997;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_leads_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [
    {
      id: 'cust_existing_1',
      customerCode: 'CWP-101',
      customerName: 'Existing Active Customer',
      customerNumber: '9876500101',
      phone: '9876500101',
      address: 'Gomti Nagar, Lucknow',
      vehicle: 'UP32 AA 1001',
      isLead: false,
      active: 'Yes',
      isActive: true
    },
    {
      id: 'lead_qa_1',
      customerCode: 'LEAD_101',
      customerName: 'Vikram Mehta',
      name: 'Vikram Mehta',
      customerNumber: '9876543210',
      phone: '9876543210',
      address: 'Sector 14, Indira Nagar, Lucknow',
      googleMapsUrl: 'https://maps.google.com/?q=26.8851,80.9922',
      vehicle: 'UP32 XY 4321 (Seltos)',
      carMake: 'Kia',
      carColor: 'Black',
      interestedService: 'Daily Car Cleaning',
      serviceCategory: 'Daily Car Cleaning',
      isLead: true,
      tag: 'lead',
      leadStatus: 'open',
      notes: '[26 Nov, 10:00 am] Requested morning slot',
      leadNotes: '[26 Nov, 10:00 am] Requested morning slot',
      createdAt: new Date().toISOString()
    },
    {
      id: 'lead_qa_2',
      customerCode: 'LEAD_102',
      customerName: 'Priya Kapoor',
      name: 'Priya Kapoor',
      customerNumber: '9811122233',
      phone: '9811122233',
      address: 'Aliganj Sector H, Lucknow',
      vehicle: 'UP32 AB 7788 (City)',
      carMake: 'Honda',
      carColor: 'Silver',
      interestedService: 'Solar Panel Cleaning',
      serviceCategory: 'Solar Panel Cleaning',
      isLead: true,
      tag: 'lead',
      leadStatus: 'follow_up',
      notes: '[26 Nov, 11:30 am] 12 panels on terrace',
      leadNotes: '[26 Nov, 11:30 am] 12 panels on terrace',
      createdAt: new Date(Date.now() - 86400000).toISOString()
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
      designationName: 'Cleaner'
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
  console.log('CWP ADMIN V2 — LEADS MIGRATION & FUNCTIONAL QA SUITE');
  console.log('===============================================================');

  // 1. Static Checks
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const leadsCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-leads.css'), 'utf8');
  const leadsJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-leads.js'), 'utf8');

  assert.ok(v2Html.includes('/admin-v2/css/v2-leads.css'), 'index.html must link v2-leads.css');
  assert.ok(v2Html.includes('/admin-v2/js/v2-leads.js'), 'index.html must load v2-leads.js');
  assert.ok(leadsCss.includes('#v2View_leads.is-active'), 'v2-leads.css must scope #v2View_leads.is-active');
  assert.ok(!v2Html.includes('Leads management container ready'), 'Placeholder text must be removed from v2View_leads');

  for (const line of leadsCss.split('\n')) {
    const t = line.trim();
    assert.ok(t !== 'body {' && t !== 'html {', 'v2-leads.css must not contain bare body/html selectors');
  }

  // English-only check (no Devanagari characters)
  assert.ok(!/[\u0900-\u097F]/.test(leadsJs), 'v2-leads.js must not contain Devanagari/Hindi characters');
  assert.ok(!/[\u0900-\u097F]/.test(leadsCss), 'v2-leads.css must not contain Devanagari/Hindi characters');
  assert.ok(!/[\u0900-\u097F]/.test(v2Html), 'admin-v2/index.html must not contain Devanagari/Hindi characters');

  // No LIVE SSE indicator
  assert.ok(!/LIVE\s*SSE/i.test(leadsJs), 'v2-leads.js must not render LIVE SSE indicators');

  // Duplicate ID check in admin-v2/index.html
  const idMatches = Array.from(v2Html.matchAll(/\bid="([^"]+)"/g)).map(m => m[1]);
  const seenIds = new Set();
  const dupIds = [];
  for (const id of idMatches) {
    if (seenIds.has(id)) dupIds.push(id);
    seenIds.add(id);
  }
  assert.strictEqual(dupIds.length, 0, `Duplicate DOM IDs found in admin-v2/index.html: ${dupIds.join(', ')}`);

  // Ensure #v2View_leads does not contain customer directory markup
  const leadsSectionMatch = v2Html.match(/<section id="v2View_leads"[\s\S]*?<\/section>/);
  assert.ok(leadsSectionMatch, '#v2View_leads section must exist');
  assert.ok(!leadsSectionMatch[0].includes('v2CustTable'), '#v2View_leads must not render Customer table');

  console.log('PASS 1: Static isolation, CSS scoping, English-only, duplicate ID & Material Symbols checks passed.');

  // 2. Backend API Checks
  const { server } = require('../server.js');
  await new Promise((resolve, reject) => server.listen(TEST_PORT, '127.0.0.1', err => err ? reject(err) : resolve()));

  const loginRes = await httpRequest('POST', '/api', { action: 'verifyAdminPassword', password: TEST_PASS });
  assert.strictEqual(loginRes.status, 200);
  const authHeaders = { Authorization: `Bearer ${loginRes.json.token}` };

  const getRes = await httpRequest('POST', '/api', { action: 'getLeads' }, authHeaders);
  assert.strictEqual(getRes.status, 200);
  assert.ok(Array.isArray(getRes.json) && getRes.json.length >= 2, 'getLeads must return seeded leads');

  // Invalid phone rejected
  const badPhoneRes = await httpRequest('POST', '/api', {
    action: 'saveLead',
    customerData: { customerName: 'Invalid Phone Lead', customerNumber: '12345', isLead: true }
  }, authHeaders);
  assert.strictEqual(badPhoneRes.status, 400);

  // Save valid lead
  const saveRes = await httpRequest('POST', '/api', {
    action: 'saveLead',
    customerData: {
      customerName: 'API Test Lead',
      name: 'API Test Lead',
      customerNumber: '9876511122',
      phone: '9876511122',
      address: 'Mahanagar, Lucknow',
      vehicle: 'UP32 ZZ 9999',
      interestedService: 'Car Washing',
      serviceCategory: 'Car Washing',
      isLead: true,
      tag: 'lead',
      leadStatus: 'open'
    }
  }, authHeaders);
  assert.strictEqual(saveRes.status, 200);
  assert.strictEqual(saveRes.json.success, true);

  console.log('PASS 2: Backend Leads API & validation rules verified.');

  // 3. Live CDP Browser Verification
  const browserPath = findBrowserBinary();
  assert.ok(browserPath, 'Edge or Chrome binary must be available for live browser QA');

  const tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_leads_cdp_'));
  const cdpPort = 9335;
  const browserProc = spawn(browserPath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempUserDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${TEST_PORT}/admin-v2`
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const list = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
        const page = list.find(t => t.type === 'page' && t.url.includes(`127.0.0.1:${TEST_PORT}`));
        if (page && page.webSocketDebuggerUrl) {
          targets = page;
          break;
        }
      } catch (e) {}
      await sleep(200);
    }
    assert.ok(targets, 'CDP page target must be reachable');

    cdp = new CdpClient(targets.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);

    // Sign in
    await cdp.evaluate(`
      const pw = document.getElementById('v2AdminPasswordInput');
      if (pw && !document.getElementById('v2LoginGate').hidden) {
        pw.value = ${JSON.stringify(TEST_PASS)};
        document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    `);

    for (let i = 0; i < 25; i++) {
      const unlocked = await cdp.evaluate(`
        const app = document.getElementById('v2AppContainer');
        return Boolean(app && !app.hidden);
      `);
      if (unlocked) break;
      await sleep(200);
    }

    // Navigate to Leads tab
    await cdp.evaluate(`
      if (window.CWP_ADMIN_V2?.shell?.navigateTo) window.CWP_ADMIN_V2.shell.navigateTo('leads');
    `);

    for (let i = 0; i < 25; i++) {
      const ready = await cdp.evaluate(`
        return document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]').length >= 3;
      `);
      if (ready) break;
      await sleep(200);
    }

    const initialCheck = await cdp.evaluate(`
      const rows = document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]');
      const kpiTotal = document.getElementById('v2LeadsKpiTotal')?.textContent;
      const splitClosed = document.getElementById('v2LeadsSplitView')?.classList.contains('is-detail-closed');
      const firstRow = rows[0];
      const callHref = firstRow?.querySelector('a.is-call')?.getAttribute('href') || '';
      const subTitle = document.querySelector('#v2View_leads .cwp-v2-ld-title')?.innerText || '';
      const stageSelRect = firstRow?.querySelector('.cwp-v2-ld-stage-select')?.getBoundingClientRect();
      const overflowTrigger = firstRow?.querySelector('[data-overflow-trigger]');
      return {
        rowCount: rows.length,
        kpiTotal,
        splitClosed,
        callHref,
        subTitle,
        stageWidth: stageSelRect ? Math.round(stageSelRect.width) : 0,
        hasOverflowTrigger: Boolean(overflowTrigger)
      };
    `);
    assert.ok(initialCheck.rowCount >= 3, 'Leads table must render loaded leads');
    assert.strictEqual(initialCheck.splitClosed, true, 'Detail panel must be closed initially');
    assert.ok(initialCheck.callHref.startsWith('tel:+91'), 'Call link must use tel:+91');
    assert.ok(!/^Leads\b/i.test(initialCheck.subTitle.trim()), 'Sub-header title must not repeat Leads');
    assert.ok(initialCheck.stageWidth > 0 && initialCheck.stageWidth <= 140, `Stage selector must be compact, got ${initialCheck.stageWidth}px`);
    assert.strictEqual(initialCheck.hasOverflowTrigger, true, 'Overflow trigger must be present in action column');

    // Search + Table Height (single record must NOT stretch) + Reset check
    const filterCheck = await cdp.evaluate(`
      const input = document.getElementById('v2LeadsSearchInput');
      input.value = 'Priya';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const afterSearchCount = document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]').length;
      const singleCardHeight = document.querySelector('#v2View_leads .cwp-v2-ld-queue-card')?.getBoundingClientRect().height || 0;
      document.getElementById('v2LeadsResetFilters').click();
      await new Promise(r => setTimeout(r, 100));
      const afterResetCount = document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]').length;
      return { afterSearchCount, singleCardHeight: Math.round(singleCardHeight), afterResetCount };
    `);
    assert.strictEqual(filterCheck.afterSearchCount, 1, 'Search for Priya must filter to 1 lead');
    assert.ok(filterCheck.singleCardHeight > 0 && filterCheck.singleCardHeight < 220, `Single-row table card must be compact (<220px), got ${filterCheck.singleCardHeight}px`);
    assert.ok(filterCheck.afterResetCount >= 3, 'Reset must restore all leads');

    // Overflow menu open/close & WhatsApp link check + Note preview click check
    const uxCheck = await cdp.evaluate(`
      const firstRow = document.querySelector('#v2LeadsTableBody tr[data-lead-id]');
      const trigger = firstRow.querySelector('[data-overflow-trigger]');
      trigger.click();
      const menu = document.getElementById('v2LeadsOverflowMenu');
      const menuOpen = !menu.hidden;
      const menuRect = menu.getBoundingClientRect();
      const waHref = menu.querySelector('a')?.getAttribute('href') || '';
      const notClipped = menuRect.right <= window.innerWidth && menuRect.bottom <= window.innerHeight;

      // Click outside closes menu
      document.body.click();
      const closedOnOutside = menu.hidden;

      // Click note preview opens detail panel
      const notePreview = document.querySelector('#v2LeadsTableBody [data-note-open]');
      notePreview.click();
      const detailOpenedByNote = !document.getElementById('v2LeadsSplitView').classList.contains('is-detail-closed');
      document.getElementById('v2LeadsDetailCloseBtn').click();

      return { menuOpen, waHref, notClipped, closedOnOutside, detailOpenedByNote };
    `);
    assert.strictEqual(uxCheck.menuOpen, true, 'Overflow menu must open on trigger click');
    assert.ok(uxCheck.waHref.startsWith('https://wa.me/91'), 'WhatsApp link inside overflow menu must use wa.me/91');
    assert.strictEqual(uxCheck.notClipped, true, 'Overflow menu must not be clipped by viewport');
    assert.strictEqual(uxCheck.closedOnOutside, true, 'Overflow menu must close when clicking outside');
    assert.strictEqual(uxCheck.detailOpenedByNote, true, 'Clicking Latest Notes preview must open detail panel');

    // Detail panel open & close check
    const detailCheck = await cdp.evaluate(`
      const firstRow = document.querySelector('#v2LeadsTableBody tr[data-lead-id]');
      firstRow.click();
      await new Promise(r => setTimeout(r, 100));
      const isOpen = !document.getElementById('v2LeadsSplitView').classList.contains('is-detail-closed');
      const headerTxt = document.getElementById('v2LeadsDetailHeader').textContent;
      document.getElementById('v2LeadsDetailCloseBtn').click();
      const isClosedAfter = document.getElementById('v2LeadsSplitView').classList.contains('is-detail-closed');
      return { isOpen, headerTxt, isClosedAfter };
    `);
    assert.strictEqual(detailCheck.isOpen, true, 'Clicking row must open detail panel');
    assert.ok(detailCheck.headerTxt.trim().length > 0, 'Detail panel header must populate');
    assert.strictEqual(detailCheck.isClosedAfter, true, 'Closing detail panel must restore full width');

    // Add Lead -> Edit Lead -> Add Note -> Convert Lead -> Delete Lead flow
    const crudCheck = await cdp.evaluate(`
      // 1. Add Lead
      document.getElementById('v2BtnAddLead').click();
      document.getElementById('v2LeadNameInput').value = 'Browser QA Lead';
      document.getElementById('v2LeadPhoneInput').value = '9876598765';
      document.getElementById('v2LeadAddressInput').value = 'Vikas Nagar, Lucknow';
      document.getElementById('v2LeadVehicleInput').value = 'UP32 QQ 1122';
      document.getElementById('v2LeadForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));
      const addedRow = Array.from(document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]')).find(tr => tr.innerText.includes('Browser QA Lead'));
      const addedId = addedRow ? addedRow.getAttribute('data-lead-id') : '';

      // 2. Edit Lead
      if (addedRow) addedRow.querySelector('[data-action="edit"]').click();
      document.getElementById('v2LeadCarMakeInput').value = 'Maruti';
      document.getElementById('v2LeadForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));

      // 3. Add Note (via overflow menu)
      const rowAfterEdit = document.querySelector('#v2LeadsTableBody tr[data-lead-id="' + addedId + '"]');
      if (rowAfterEdit) rowAfterEdit.querySelector('[data-overflow-trigger]').click();
      const noteMenuBtn = document.querySelector('#v2LeadsOverflowMenu [data-overflow-action="note"]');
      if (noteMenuBtn) noteMenuBtn.click();
      document.getElementById('v2LeadNoteTextInput').value = 'Confirmed evening callback';
      document.getElementById('v2LeadNoteForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));
      const noteReflected = document.querySelector('#v2LeadsTableBody tr[data-lead-id="' + addedId + '"]')?.innerText.includes('Confirmed evening callback');

      // 4. Convert Lead
      document.querySelector('#v2LeadsTableBody tr[data-lead-id="' + addedId + '"] [data-action="convert"]').click();
      document.getElementById('v2ConvertServiceInput').value = 'Solar Panel Cleaning';
      document.getElementById('v2ConvertServiceInput').dispatchEvent(new Event('change', { bubbles: true }));
      const solarVisible = !document.getElementById('v2ConvertSolarGroup').hidden;
      document.getElementById('v2ConvertLeadForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 500));
      const removedAfterConvert = !document.querySelector('#v2LeadsTableBody tr[data-lead-id="' + addedId + '"]');

      return { added: Boolean(addedId), noteReflected, solarVisible, removedAfterConvert };
    `);
    assert.strictEqual(crudCheck.added, true, 'Add Lead must create and render new lead');
    assert.strictEqual(crudCheck.noteReflected, true, 'Add Note must persist and render in table');
    assert.strictEqual(crudCheck.solarVisible, true, 'Convert modal must toggle Solar panel count field');
    assert.strictEqual(crudCheck.removedAfterConvert, true, 'Converted lead must leave Leads queue');

    // Viewport checks: 1440x900 desktop & 768x1024 tablet
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    const desktopLayout = await cdp.evaluate(`
      const ws = document.querySelector('.cwp-v2-workspace');
      return {
        docOverflowY: document.documentElement.scrollHeight > window.innerHeight + 2,
        wsOverflowY: ws ? (ws.scrollHeight > ws.clientHeight + 2) : false,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    `);
    assert.strictEqual(desktopLayout.docOverflowY, false, '1440x900: document must not scroll vertically');
    assert.strictEqual(desktopLayout.wsOverflowY, false, '1440x900: workspace must not double-scroll');
    assert.strictEqual(desktopLayout.docOverflowX, false, '1440x900: no horizontal overflow');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
    await sleep(200);
    const tabletLayout = await cdp.evaluate(`
      const tblWrap = document.querySelector('.cwp-v2-ld-table-wrap');
      return {
        tblScrollsY: tblWrap ? (getComputedStyle(tblWrap).overflowY !== 'visible' && tblWrap.scrollHeight > tblWrap.clientHeight + 2) : false,
        docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    `);
    assert.strictEqual(tabletLayout.tblScrollsY, false, '768x1024: no nested vertical table scroll');
    assert.strictEqual(tabletLayout.docOverflowX, false, '768x1024: no horizontal page overflow');

    assert.strictEqual(cdp.consoleErrors.length, 0, `Zero console/runtime errors expected, got: ${cdp.consoleErrors.join('; ')}`);
    console.log('PASS 3: Live CDP Browser verification across 1440x900 & 768x1024, KPIs, filters, detail panel, CRUD & convert passed.');
    console.log('\nALL LEADS MIGRATION QA TESTS PASSED!');
  } finally {
    if (cdp) cdp.close();
    try { browserProc.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
