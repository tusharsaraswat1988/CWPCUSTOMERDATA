/**
 * =========================================================================
 * CWP ADMIN V2 — PHASE 0, REAL AUTH & PHASE 1 QA VERIFICATION SUITE
 * =========================================================================
 * Verifies:
 * 1. Phase 0 Isolation, Scoped CSS, Self-Hosted Icons, Devanagari Typography,
 *    and Zero Mock Datasets in Production Shell JS
 * 2. Real Admin Auth & Session API (verifyAdminSession, verifyAdminPassword user,
 *    logoutAdmin revocation, staff token rejection, SSE auth)
 * 3. Live Headless Browser Verification (CDP) across 360x800, 768x1024, 1024x768, 1440x900:
 *    - Keyboard-accessible login gate & deep-link ?tab=leads preservation
 *    - v2-auth.js checkSession() returning { valid: false } on missing/bogus/stf_ tokens
 *    - All 10 production tabs, aliases (washSolar, addCust), collapsible groups & rail
 *    - Live global search, live SSE status pill & notification drawer (zero mocks)
 *    - Overlay LIFO popstate & Back/Forward tab navigation
 *    - Zero horizontal overflow (scrollWidth <= innerWidth)
 *    - Profile menu + real logoutAdmin revocation + zero uncaught page/console errors
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestV2Admin@2026';
const TEST_PASS = process.env.ADMIN_PASSWORD;
const TEST_PORT = 5997;

const ROOT = path.join(__dirname, '..');
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_qa_data_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');
fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [],
  serviceJobs: [
    {
      id: 'job_done_qa_1',
      customerName: 'Completed QA Owner',
      serviceCategory: 'Car Washing',
      status: 'completed'
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
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function checkSseConnect(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
        return;
      }
      let chunkBuf = '';
      const timer = setTimeout(() => {
        req.destroy();
        resolve({ status: res.statusCode, headers: res.headers, body: chunkBuf });
      }, 600);
      res.on('data', chunk => {
        chunkBuf += chunk.toString('utf8');
        if (chunkBuf.includes('CONNECTED')) {
          clearTimeout(timer);
          req.destroy();
          resolve({ status: res.statusCode, headers: res.headers, body: chunkBuf });
        }
      });
    });
    req.on('error', reject);
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
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('===============================================================');
  console.log('🧪 CWP ADMIN V2 — PHASE 0, REAL AUTH & PHASE 1 QA SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Static Isolation, Typography, Self-Hosted Icons & Mock-Free JS
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Static Isolation, Fonts, Scoping & Mock-Free Production JS ---');
  const htmlPath = path.join(ROOT, 'public/admin-v2/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(!html.includes('fonts.googleapis.com'), 'index.html must not load Google Fonts CDN');
  assert.ok(!html.includes('fonts.gstatic.com'), 'index.html must not preconnect fonts.gstatic.com');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/fonts/material-symbols-outlined.woff2')), 'Self-hosted Material Symbols WOFF2 must exist');

  const tokensCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-tokens.css'), 'utf8');
  const baseCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-base.css'), 'utf8');
  const layoutCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-layout.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-components.css'), 'utf8');

  assert.ok(tokensCss.includes('Noto Sans Devanagari'), 'v2-tokens.css must include Noto Sans Devanagari');
  assert.ok(baseCss.includes("url('/fonts/material-symbols-outlined.woff2')"), 'v2-base.css must declare self-hosted Material Symbols @font-face');
  assert.ok(baseCss.includes('line-height: 1.5'), 'v2-base.css must set line-height: 1.5');
  assert.ok(layoutCss.includes('@media (max-width: 1023px)'), 'v2-layout.css must define responsive tablet/mobile breakpoint');
  assert.ok(layoutCss.includes('.cwp-v2-sidebar.is-collapsed'), 'v2-layout.css must define .is-collapsed rail');

  for (const [name, content] of [['v2-tokens.css', tokensCss], ['v2-base.css', baseCss], ['v2-layout.css', layoutCss], ['v2-components.css', componentsCss]]) {
    for (const line of content.split('\n')) {
      const t = line.trim();
      assert.ok(t !== 'body {' && t !== 'html {', `${name} must not contain bare body/html selector`);
    }
  }

  const prodJsFiles = [
    'v2-api.js',
    'v2-toast.js',
    'v2-ui-helpers.js',
    'v2-auth.js',
    'v2-overlay.js',
    'v2-search.js',
    'v2-notifications.js',
    'v2-shell.js',
    'v2-app.js'
  ];
  const forbiddenSymbols = [
    'MOCK_OPERATIONS',
    'SEARCHABLE_SERVICES',
    'TASK06_OPERATIONS',
    'ZONE_DEFINITIONS',
    'TASK07_OPERATIONS_DATASET',
    'v2-playground.js'
  ];
  for (const file of prodJsFiles) {
    const content = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js', file), 'utf8');
    for (const sym of forbiddenSymbols) {
      assert.ok(!content.includes(sym), `Production shell file ${file} must NOT reference ${sym}`);
    }
  }
  console.log('✅ PASS 1: Static isolation, self-hosted icons, Devanagari typography, and mock-free production shell verified.');

  // -------------------------------------------------------------------------
  // TEST 2: Live Server API Auth, Session Wiring & SSE Verification
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Server Auth, verifyAdminSession, Staff Rejection & SSE ---');
  const { server } = require('../server.js');
  await new Promise((resolve, reject) => {
    server.listen(TEST_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });

  let browserProc = null;
  let cdp = null;
  let tempUserDir = null;

  try {
    // 2a. Missing / bogus / stf_ tokens must return 401
    const rMissing = await httpRequest('POST', '/api', { action: 'verifyAdminSession' });
    assert.strictEqual(rMissing.status, 401, 'verifyAdminSession without token must return 401');

    const rBogus = await httpRequest('POST', '/api', { action: 'verifyAdminSession', token: 'adm_bogus_123' }, { Authorization: 'Bearer adm_bogus_123' });
    assert.strictEqual(rBogus.status, 401, 'verifyAdminSession with bogus token must return 401');

    const rStaff = await httpRequest('POST', '/api', { action: 'verifyAdminSession', token: 'stf_bogus_123' }, { Authorization: 'Bearer stf_bogus_123' });
    assert.strictEqual(rStaff.status, 401, 'verifyAdminSession with staff-prefixed token must return 401');

    // 2b. verifyAdminPassword returns token + user
    const rLogin = await httpRequest('POST', '/api', { action: 'verifyAdminPassword', password: TEST_PASS });
    assert.strictEqual(rLogin.status, 200, 'verifyAdminPassword with valid password must return 200');
    assert.ok(rLogin.json && rLogin.json.success && rLogin.json.token, 'verifyAdminPassword must return token');
    assert.ok(rLogin.json.user && rLogin.json.user.username && rLogin.json.user.role, 'verifyAdminPassword must return user metadata');
    const adminToken = rLogin.json.token;

    // 2c. verifyAdminSession succeeds with valid admin token & exposes storageMode
    const rSess = await httpRequest('POST', '/api', { action: 'verifyAdminSession' }, { Authorization: `Bearer ${adminToken}` });
    assert.strictEqual(rSess.status, 200, 'verifyAdminSession with valid token must return 200');
    assert.strictEqual(rSess.json.valid, true, 'verifyAdminSession must return valid: true');
    assert.strictEqual(rSess.json.user.userType, 'admin', 'verifyAdminSession must confirm userType: admin');
    assert.strictEqual(rSess.json.user.storageMode, 'local', 'verifyAdminSession must expose storageMode: local in test mode');
    assert.strictEqual(rSess.json.capabilities && rSess.json.capabilities.auditLogs, false, 'verifyAdminSession must expose capabilities.auditLogs: false in local mode');

    // 2c-2. Seed a live customer record using real saveCustomer API for browser search & badge QA
    const rSeedCust = await httpRequest('POST', '/api', {
      action: 'saveCustomer',
      customerData: {
        customerName: 'Adversarial Probe Owner',
        customerNumber: '9876501122',
        vehicle: 'Hyundai Creta UP65ZZ9988',
        address: 'Sigra Varanasi',
        serviceCategory: 'Daily Car Cleaning',
        active: true
      }
    }, { Authorization: `Bearer ${adminToken}` });
    assert.strictEqual(rSeedCust.status, 200, 'saveCustomer must succeed for live QA seed record');
    assert.strictEqual(rSeedCust.json.success, true, 'saveCustomer must return success: true');

    // 2d. SSE auth check
    const sseBad = await checkSseConnect('/api/admin-realtime-stream?token=invalid_tok');
    assert.strictEqual(sseBad.status, 401, 'SSE stream must reject invalid token with 401');
    const sseOk = await checkSseConnect(`/api/admin-realtime-stream?token=${encodeURIComponent(adminToken)}`);
    assert.strictEqual(sseOk.status, 200, 'SSE stream must accept valid admin token with 200');
    assert.ok(sseOk.body.includes('CONNECTED'), 'SSE stream must emit CONNECTED event');

    // 2e. logoutAdmin revokes token
    const rLogout = await httpRequest('POST', '/api', { action: 'logoutAdmin', adminToken }, { Authorization: `Bearer ${adminToken}` });
    assert.strictEqual(rLogout.status, 200, 'logoutAdmin must return 200');
    const rAfterLogout = await httpRequest('POST', '/api', { action: 'verifyAdminSession' }, { Authorization: `Bearer ${adminToken}` });
    assert.strictEqual(rAfterLogout.status, 401, 'verifyAdminSession after logoutAdmin must return 401');

    console.log('✅ PASS 2: Server session wiring, verifyAdminPassword user metadata, SSE auth, and logout revocation verified.');

    // -----------------------------------------------------------------------
    // TEST 3: Live Headless Browser (CDP) End-to-End & Responsive Checks
    // -----------------------------------------------------------------------
    const browserBin = findBrowserBinary();
    if (!browserBin) {
      console.log('⚠️ Edge/Chrome binary not found; skipping CDP browser checks.');
    } else {
      console.log(`--- TEST 3: Live Browser CDP Verification (${path.basename(browserBin)}) ---`);
      const CDP_PORT = 9237;
      tempUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_qa_'));

      browserProc = spawn(browserBin, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tempUserDir}`,
        `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=leads`
      ], { stdio: 'ignore' });

      let targets = null;
      for (let i = 0; i < 30; i++) {
        await sleep(250);
        try {
          const list = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
          if (Array.isArray(list) && list.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) {
            targets = list;
            break;
          }
        } catch (e) {}
      }
      assert.ok(targets, 'CDP debugger page target must become available');
      const pageTarget = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
      await cdp.connect();
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Network.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(700);

      // 3a. Verify zero uncaught pageerrors & zero v2-playground.js loaded on /admin-v2?tab=leads
      const bootState = await cdp.evaluate(`
        const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
        const gate = document.getElementById('v2LoginGate');
        const app = document.getElementById('v2AppContainer');
        const pwInput = document.getElementById('v2AdminPasswordInput');
        return {
          scripts,
          playgroundLoaded: scripts.some(s => s.includes('v2-playground.js')),
          gateVisible: gate && !gate.hidden && gate.style.display !== 'none',
          gateRole: gate ? gate.getAttribute('role') : null,
          gateModal: gate ? gate.getAttribute('aria-modal') : null,
          appHidden: app ? app.hidden : false,
          activeElId: document.activeElement ? document.activeElement.id : null,
          hasPlaygroundObj: !!(window.CWP_ADMIN_V2 && window.CWP_ADMIN_V2.playground)
        };
      `);
      assert.strictEqual(bootState.playgroundLoaded, false, 'v2-playground.js must NOT load on normal /admin-v2');
      assert.strictEqual(bootState.hasPlaygroundObj, false, 'CWP_ADMIN_V2.playground must NOT execute on normal /admin-v2');
      assert.strictEqual(bootState.gateVisible, true, 'Login gate must be visible when unauthenticated');
      assert.strictEqual(bootState.gateRole, 'dialog', 'Login gate must have role="dialog"');
      assert.strictEqual(bootState.gateModal, 'true', 'Login gate must have aria-modal="true"');
      assert.strictEqual(bootState.appHidden, true, '#v2AppContainer must be hidden while locked');
      assert.strictEqual(bootState.activeElId, 'v2AdminPasswordInput', 'Password input must receive immediate focus');

      // 3b. Verify v2-auth.js checkSession() returns { valid: false } on missing, bogus, and stf_ tokens
      const authChecks = await cdp.evaluate(`
        localStorage.removeItem('cwp_admin_token');
        sessionStorage.removeItem('cwp_admin_token');
        const rEmpty = await window.CWP_ADMIN_V2.auth.checkSession();

        sessionStorage.setItem('cwp_admin_token', 'adm_bogus_token_xyz');
        const rBogus = await window.CWP_ADMIN_V2.auth.checkSession();

        sessionStorage.setItem('cwp_admin_token', 'stf_staff_token_xyz');
        const rStaff = await window.CWP_ADMIN_V2.auth.checkSession();

        return { rEmpty, rBogus, rStaff };
      `);
      assert.strictEqual(authChecks.rEmpty.valid, false, 'checkSession() empty token -> valid: false');
      assert.strictEqual(authChecks.rBogus.valid, false, 'checkSession() bogus token -> valid: false');
      assert.strictEqual(authChecks.rStaff.valid, false, 'checkSession() stf_ token -> valid: false');

      // 3c. Test bad login shows inline error, then valid login lands on preserved ?tab=leads
      const wrongLoginRes = await cdp.evaluate(`
        const pwInput = document.getElementById('v2AdminPasswordInput');
        const form = document.getElementById('v2LoginForm');
        pwInput.value = 'wrong_password_1';
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 350));
        return document.getElementById('v2LoginError').textContent;
      `);
      assert.ok(wrongLoginRes.length > 0, 'Wrong password must populate #v2LoginError');

      // Reset CDP event buffer before valid login to assert zero >= 400 /api responses during normal session
      cdp.events.length = 0;

      const loginFlow = await cdp.evaluate(`
        const pwInput = document.getElementById('v2AdminPasswordInput');
        const form = document.getElementById('v2LoginForm');
        pwInput.value = ${JSON.stringify(TEST_PASS)};
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 800));
        const app = document.getElementById('v2AppContainer');
        const gate = document.getElementById('v2LoginGate');
        return {
          appHidden: app.hidden,
          gateHidden: gate.hidden,
          activeTab: window.CWP_ADMIN_V2.shell.getActiveTab(),
          headerTitle: document.getElementById('v2HeaderTitle').textContent,
          profileName: document.getElementById('v2ProfileName').textContent,
          sseStatus: window.CWP_ADMIN_V2.notifications.getState().sseStatus,
          storageMode: window.CWP_ADMIN_V2.auth.getUser() ? window.CWP_ADMIN_V2.auth.getUser().storageMode : null,
          badgeRecords: document.getElementById('v2BadgeRecords').textContent.trim(),
          badgeServiceAssign: document.getElementById('v2BadgeServiceAssign').textContent.trim(),
          badgeSpecialJobs: document.getElementById('v2BadgeSpecialJobs').textContent.trim()
        };
      `);
      assert.strictEqual(loginFlow.appHidden, false, 'Valid login must unlock #v2AppContainer');
      assert.strictEqual(loginFlow.gateHidden, true, 'Valid login must hide #v2LoginGate');
      assert.strictEqual(loginFlow.activeTab, 'leads', 'Deep-linked ?tab=leads must be preserved across login');
      assert.strictEqual(loginFlow.headerTitle, 'Leads', 'Header title must reflect Leads tab');
      assert.strictEqual(loginFlow.profileName, 'admin', 'Profile menu must reflect authenticated admin user');
      assert.strictEqual(loginFlow.sseStatus, 'live', 'SSE connection must reach live status after login');
      assert.strictEqual(loginFlow.storageMode, 'local', 'Auth user storageMode must be local in test mode');
      assert.strictEqual(loginFlow.badgeRecords, '1', 'v2BadgeRecords must reflect 1 seeded live customer');
      assert.strictEqual(loginFlow.badgeServiceAssign, '1', 'v2BadgeServiceAssign must reflect 1 active customer with serviceCategory/vehicle');
      assert.strictEqual(loginFlow.badgeSpecialJobs, '0', 'v2BadgeSpecialJobs must show 0 when all special jobs are completed');

      // 3d. Verify all 10 production tabs + aliases + Back/Forward + LIFO overlay popstate
      const navChecks = await cdp.evaluate(`
        const expectedTabs = [
          'dashboard', 'cleanReports', 'specialJobs', 'jobAssignment', 'staffTracking',
          'sequence', 'records', 'serviceAssign', 'leads', 'staff'
        ];
        const results = {};
        for (const t of expectedTabs) {
          window.CWP_ADMIN_V2.shell.navigateTo(t);
          results[t] = {
            active: window.CWP_ADMIN_V2.shell.getActiveTab(),
            viewActive: document.getElementById('v2View_' + t).classList.contains('is-active')
          };
        }

        // Aliases
        window.CWP_ADMIN_V2.shell.navigateTo('washSolar');
        const aliasWashSolar = window.CWP_ADMIN_V2.shell.getActiveTab();
        window.CWP_ADMIN_V2.shell.navigateTo('addCust');
        const aliasAddCust = window.CWP_ADMIN_V2.shell.getActiveTab();

        // Test Notification Drawer + popstate LIFO
        window.CWP_ADMIN_V2.shell.navigateTo('dashboard');
        window.CWP_ADMIN_V2.shell.navigateTo('records');
        window.CWP_ADMIN_V2.notifications.openDrawer();
        await new Promise(r => setTimeout(r, 150));
        const depthWithDrawer = window.CWP_ADMIN_V2.overlay.getStackDepth();

        window.history.back();
        await new Promise(r => setTimeout(r, 200));
        const depthAfterFirstBack = window.CWP_ADMIN_V2.overlay.getStackDepth();
        const tabAfterFirstBack = window.CWP_ADMIN_V2.shell.getActiveTab();

        window.history.back();
        await new Promise(r => setTimeout(r, 200));
        const tabAfterSecondBack = window.CWP_ADMIN_V2.shell.getActiveTab();

        // Test manual drawer close followed by a SINGLE window.history.back()
        window.CWP_ADMIN_V2.shell.navigateTo('dashboard');
        window.CWP_ADMIN_V2.shell.navigateTo('leads');
        document.getElementById('v2NotificationsBtn').click();
        await new Promise(r => setTimeout(r, 150));
        const depthManualOpen = window.CWP_ADMIN_V2.overlay.getStackDepth();
        document.querySelector('#v2NotificationsDrawer [data-overlay-close]').click();
        const depthImmediateAfterManualClose = window.CWP_ADMIN_V2.overlay.getStackDepth();
        await new Promise(r => setTimeout(r, 150));
        window.history.back();
        await new Promise(r => setTimeout(r, 200));
        const tabAfterSingleBackPostManualClose = window.CWP_ADMIN_V2.shell.getActiveTab();

        // Test hashchange precedence when ?tab= query param is present
        window.CWP_ADMIN_V2.shell.navigateTo('records');
        window.location.hash = '#admin/leads';
        await new Promise(r => setTimeout(r, 150));
        const tabAfterHashChange = window.CWP_ADMIN_V2.shell.getActiveTab();
        const searchAfterHashChange = window.location.search;

        return {
          results,
          aliasWashSolar,
          aliasAddCust,
          depthWithDrawer,
          depthAfterFirstBack,
          tabAfterFirstBack,
          tabAfterSecondBack,
          depthManualOpen,
          depthImmediateAfterManualClose,
          tabAfterSingleBackPostManualClose,
          tabAfterHashChange,
          searchAfterHashChange
        };
      `);

      for (const [tab, state] of Object.entries(navChecks.results)) {
        assert.strictEqual(state.active, tab, `Tab ${tab} should become active`);
        assert.strictEqual(state.viewActive, true, `#v2View_${tab} should have .is-active`);
      }
      assert.strictEqual(navChecks.aliasWashSolar, 'specialJobs', 'washSolar alias must resolve to specialJobs');
      assert.strictEqual(navChecks.aliasAddCust, 'records', 'addCust alias must resolve to records');
      assert.strictEqual(navChecks.depthWithDrawer, 1, 'Notification drawer must push onto overlay stack');
      assert.strictEqual(navChecks.depthAfterFirstBack, 0, 'First Back must close topmost overlay via popstate');
      assert.strictEqual(navChecks.tabAfterFirstBack, 'records', 'First Back must keep current tab when closing overlay');
      assert.strictEqual(navChecks.tabAfterSecondBack, 'dashboard', 'Second Back must restore previous tab');
      assert.strictEqual(navChecks.depthManualOpen, 1, 'Manual open must push drawer onto overlay stack');
      assert.strictEqual(navChecks.depthImmediateAfterManualClose, 0, 'Manual close must decrement overlay stack synchronously');
      assert.strictEqual(navChecks.tabAfterSingleBackPostManualClose, 'dashboard', 'Single Back after manual drawer close must return directly to previous tab');
      assert.strictEqual(navChecks.tabAfterHashChange, 'leads', 'hashchange to #admin/leads must override existing ?tab= query param');
      assert.ok(navChecks.searchAfterHashChange.includes('tab=leads'), 'hashchange must normalize ?tab= URL query param via replaceState');

      // 3e. Sidebar collapse, global search, EN/HI + Devanagari line-height, responsive overflow
      const uiChecks = await cdp.evaluate(`
        // Collapse sidebar on desktop (wait for 200ms CSS width transition)
        window.CWP_ADMIN_V2.shell.toggleSidebarCollapse();
        await new Promise(r => setTimeout(r, 320));
        const sidebar = document.getElementById('v2Sidebar');
        const collapsedWidth = Math.round(sidebar.getBoundingClientRect().width);
        window.CWP_ADMIN_V2.shell.toggleSidebarCollapse();
        await new Promise(r => setTimeout(r, 320));

        // Live global search: no-match empty state AND live customer matches (name, phone, vehicle) -> navigate to records
        window.CWP_ADMIN_V2.shell.navigateTo('dashboard');
        await window.CWP_ADMIN_V2.search.executeSearch('zz_unlikely_match_999', true);
        const searchPopoverVisible = !document.getElementById('v2GlobalSearchResults').hidden;

        await window.CWP_ADMIN_V2.search.executeSearch('Adversarial Probe', false);
        const byNameText = document.getElementById('v2GlobalSearchResults').textContent;
        const byNameItems = document.querySelectorAll('#v2GlobalSearchResults .cwp-v2-search-result-item').length;

        await window.CWP_ADMIN_V2.search.executeSearch('9876501122', false);
        const byPhoneItems = document.querySelectorAll('#v2GlobalSearchResults .cwp-v2-search-result-item').length;

        await window.CWP_ADMIN_V2.search.executeSearch('UP65ZZ9988', false);
        const byVehicleItems = document.querySelectorAll('#v2GlobalSearchResults .cwp-v2-search-result-item').length;
        const firstResultBtn = document.querySelector('#v2GlobalSearchResults .cwp-v2-search-result-item');
        if (firstResultBtn) firstResultBtn.click();
        const tabAfterCustomerSearchClick = window.CWP_ADMIN_V2.shell.getActiveTab();
        document.getElementById('v2GlobalSearchResults').hidden = true;

        // Language switch HI & Devanagari line-height check
        window.CWP_ADMIN_V2.shell.applyLanguage('hi');
        const hiTitle = document.getElementById('v2HeaderTitle').textContent;
        const bodyStyle = window.getComputedStyle(document.body);
        const fontSize = parseFloat(bodyStyle.fontSize);
        const lineHeight = parseFloat(bodyStyle.lineHeight);
        window.CWP_ADMIN_V2.shell.applyLanguage('en');

        return {
          collapsedWidth,
          searchPopoverVisible,
          byNameText,
          byNameItems,
          byPhoneItems,
          byVehicleItems,
          tabAfterCustomerSearchClick,
          hiTitle,
          lineHeightRatio: lineHeight / fontSize,
          navBg: window.getComputedStyle(sidebar).backgroundColor
        };
      `);
      assert.strictEqual(uiChecks.collapsedWidth, 68, 'Collapsed desktop sidebar rail must be 68px');
      assert.strictEqual(uiChecks.searchPopoverVisible, true, 'Global search popover must render live search state');
      assert.ok(uiChecks.byNameItems >= 1 && uiChecks.byNameText.includes('Adversarial Probe Owner'), 'Global search must match live customer by customerName');
      assert.ok(uiChecks.byPhoneItems >= 1, 'Global search must match live customer by customerNumber');
      assert.ok(uiChecks.byVehicleItems >= 1, 'Global search must match live customer by vehicle');
      assert.strictEqual(uiChecks.tabAfterCustomerSearchClick, 'records', 'Clicking live customer search result must navigate to records');
      assert.ok(uiChecks.hiTitle.length > 0 && uiChecks.hiTitle !== 'Dashboard', 'HI language switch must localize header title');
      assert.ok(uiChecks.lineHeightRatio >= 1.49, `Body line-height ratio must be >= 1.5 (got ${uiChecks.lineHeightRatio.toFixed(2)})`);
      assert.strictEqual(uiChecks.navBg, 'rgb(11, 26, 43)', 'Sidebar background must be dark navy #0b1a2b');

      // 3f. Responsive horizontal overflow checks across 360x800, 768x1024, 1024x768, 1440x900
      const viewports = [
        { width: 360, height: 800, mobile: true },
        { width: 768, height: 1024, mobile: true },
        { width: 1024, height: 768, mobile: false },
        { width: 1440, height: 900, mobile: false }
      ];
      for (const vp of viewports) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.mobile
        });
        await sleep(150);
        const overflow = await cdp.evaluate(`
          return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth
          };
        `);
        assert.ok(
          overflow.scrollWidth <= overflow.innerWidth,
          `Viewport ${vp.width}x${vp.height} must have zero horizontal overflow (scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth})`
        );
      }

      // 3f-2. Verify mobile drawer open/close at 360x800
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 360,
        height: 800,
        deviceScaleFactor: 1,
        mobile: true
      });
      await sleep(150);
      const mobileDrawerCheck = await cdp.evaluate(`
        window.CWP_ADMIN_V2.shell.openMobileDrawer();
        await new Promise(r => setTimeout(r, 260));
        const sidebar = document.getElementById('v2Sidebar');
        const backdrop = document.getElementById('v2SidebarBackdrop');
        const openState = sidebar.classList.contains('is-drawer-open') && backdrop.classList.contains('is-visible');
        window.CWP_ADMIN_V2.shell.closeMobileDrawer();
        await new Promise(r => setTimeout(r, 260));
        const closedState = !sidebar.classList.contains('is-drawer-open') && !backdrop.classList.contains('is-visible');
        return { openState, closedState, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      `);
      assert.strictEqual(mobileDrawerCheck.openState, true, 'Mobile drawer & backdrop must open at 360px');
      assert.strictEqual(mobileDrawerCheck.closedState, true, 'Mobile drawer & backdrop must close cleanly');
      assert.ok(mobileDrawerCheck.scrollWidth <= mobileDrawerCheck.innerWidth, 'Zero horizontal overflow after mobile drawer toggle');

      // Verify zero >= 400 /api responses occurred during login, badge sync, drawer open & search
      const failedApiResponses = cdp.events
        .filter(ev => ev.method === 'Network.responseReceived')
        .map(ev => ev.params && ev.params.response)
        .filter(r => r && r.url && r.url.includes('/api') && r.status >= 400);
      assert.strictEqual(
        failedApiResponses.length,
        0,
        `Expected 0 >=400 /api responses in local mode, found: ${failedApiResponses.map(r => `${r.status}:${r.url}`).join(', ')}`
      );

      // 3g. Logout revokes token & returns to login gate
      const logoutCheck = await cdp.evaluate(`
        const tokenBefore = window.CWP_ADMIN_V2.auth.getToken();
        await window.CWP_ADMIN_V2.app.performLogout();
        const tokenAfter = window.CWP_ADMIN_V2.auth.getToken();
        const gateVisible = !document.getElementById('v2LoginGate').hidden;
        const appHidden = document.getElementById('v2AppContainer').hidden;
        return { tokenBefore, tokenAfter, gateVisible, appHidden };
      `);
      assert.ok(logoutCheck.tokenBefore.startsWith('adm_'), 'Token must exist before logout');
      assert.strictEqual(logoutCheck.tokenAfter, '', 'Token must be cleared after logout');
      assert.strictEqual(logoutCheck.gateVisible, true, 'Login gate must reappear after logout');
      assert.strictEqual(logoutCheck.appHidden, true, '#v2AppContainer must be hidden after logout');

      // Ensure old token was revoked server-side
      const rRevoked = await httpRequest('POST', '/api', { action: 'verifyAdminSession' }, { Authorization: `Bearer ${logoutCheck.tokenBefore}` });
      assert.strictEqual(rRevoked.status, 401, 'Server must reject revoked token after UI logout');

      // 3h. Re-login and verify mid-session 401 lockout during background refreshBadges()
      const midSessionSetup = await cdp.evaluate(`
        const pwInput = document.getElementById('v2AdminPasswordInput');
        const form = document.getElementById('v2LoginForm');
        pwInput.value = ${JSON.stringify(TEST_PASS)};
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 600));
        return {
          unlocked: !document.getElementById('v2AppContainer').hidden,
          token: window.CWP_ADMIN_V2.auth.getToken()
        };
      `);
      assert.strictEqual(midSessionSetup.unlocked, true, 'Re-login must succeed before mid-session 401 probe');
      assert.ok(midSessionSetup.token.startsWith('adm_'), 'Re-login must store fresh admin token');

      // Revoke token server-side out-of-band, then trigger background refreshBadges()
      await httpRequest('POST', '/api', { action: 'logoutAdmin', adminToken: midSessionSetup.token }, { Authorization: `Bearer ${midSessionSetup.token}` });
      const midSessionLockout = await cdp.evaluate(`
        await window.CWP_ADMIN_V2.notifications.refreshBadges().catch(() => {});
        await new Promise(r => setTimeout(r, 200));
        return {
          appHidden: document.getElementById('v2AppContainer').hidden,
          gateVisible: !document.getElementById('v2LoginGate').hidden,
          tokenAfter: window.CWP_ADMIN_V2.auth.getToken(),
          loginError: document.getElementById('v2LoginError').textContent.trim()
        };
      `);
      assert.strictEqual(midSessionLockout.appHidden, true, 'Mid-session 401 in refreshBadges() must lock #v2AppContainer');
      assert.strictEqual(midSessionLockout.gateVisible, true, 'Mid-session 401 in refreshBadges() must show #v2LoginGate');
      assert.strictEqual(midSessionLockout.tokenAfter, '', 'Mid-session 401 in refreshBadges() must clear stored token');
      assert.ok(midSessionLockout.loginError.length > 0, 'Mid-session 401 in refreshBadges() must show lockout reason in #v2LoginError');

      // 3i. Verify real 429 login rate-limit error display in #v2LoginError
      const rateLimitRes = await cdp.evaluate(`
        const pwInput = document.getElementById('v2AdminPasswordInput');
        const form = document.getElementById('v2LoginForm');
        let lastErr = '';
        let sawRateLimit = false;
        for (let i = 0; i < 6; i++) {
          pwInput.value = 'wrong_rate_limit_' + i;
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 250));
          lastErr = document.getElementById('v2LoginError').textContent.trim();
          if (/too many failed.*attempts|temporarily locked|wait/i.test(lastErr)) {
            sawRateLimit = true;
            break;
          }
        }
        return {
          sawRateLimit,
          lastErr,
          errHidden: document.getElementById('v2LoginError').hidden
        };
      `);
      assert.strictEqual(rateLimitRes.sawRateLimit, true, `Expected 429 rate-limit message in #v2LoginError, got: "${rateLimitRes.lastErr}"`);
      assert.strictEqual(rateLimitRes.errHidden, false, '#v2LoginError must be visible on 429 rate limit');

      // Check zero runtime exceptions in CDP events
      const exceptions = cdp.events.filter(ev => ev.method === 'Runtime.exceptionThrown');
      assert.strictEqual(exceptions.length, 0, `Expected 0 uncaught runtime exceptions, found ${exceptions.length}`);

      console.log('✅ PASS 3: Live CDP browser verification passed across all viewports (360/768/1024/1440), auth, routing, overlays, search, SSE & logout.');
    }
  } finally {
    if (cdp) cdp.close();
    if (browserProc) {
      try { browserProc.kill(); } catch (e) {}
    }
    if (tempUserDir) {
      try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
    }
    if (tempDataDir) {
      try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
    }
    server.close();
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL PHASE 0, REAL AUTH & PHASE 1 QA TESTS PASSED!');
  console.log('===============================================================');
}

run().catch((err) => {
  console.error('❌ QA Suite failed:', err);
  process.exit(1);
});
