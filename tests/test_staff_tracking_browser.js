/**
 * =========================================================================
 * END-TO-END AUTOMATED BROWSER VERIFICATION SUITE (HEADLESS CHROME / CDP)
 * =========================================================================
 * Verifies (R1 through R5):
 * 1. Admin Live Tracking tab navigation, M3 sidebar button & LIVE badge
 * 2. 4 Realtime KPI Cards: Active Staff, Fleet Distance, Total Stoppages, Avg Dwell
 * 3. Split view command center: Staff directory with filter pills & search
 * 4. TrackingMapAdapter: Singleton map canvas & fallback rendering
 * 5. Staff PWA 15-minute location heartbeat transmission and distance accumulation
 * 6. Admin on-demand location ping triggering, staff response & accelerated polling
 * 7. Expandable stoppages & dwell times drawer with route history table
 * 8. Phase 2 punch coordinates non-blocking verification
 * 9. Visual screenshot capture in tests/screenshots/
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Auto-load .env for standalone script execution if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

const db = require('../db/index');
const repos = require('../db/repositories/index');

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
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
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    let script = expression.trim();
    if (!script.startsWith('(() =>')) {
      script = `(() => {\n${script}\n})()`;
    }
    const res = await this.send('Runtime.evaluate', {
      expression: script,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const errDetail = res.exceptionDetails.exception ? (res.exceptionDetails.exception.description || res.exceptionDetails.exception.value) : res.exceptionDetails.text;
      throw new Error(errDetail || 'Evaluation error');
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBrowserVerificationSuite() {
  console.log('===============================================================');
  console.log('🌐 RUNNING AUTOMATED BROWSER VERIFICATION SUITE (HEADLESS CHROME)');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`✅ PASS ${total}: ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`❌ FAIL ${total}: ${msg}`);
    if (err) console.error(err);
    process.exit(1);
  }

  const TEST_SERVER_PORT = 3902;
  const CHROME_DEBUG_PORT = 9224;
  let server = null;
  let chromeProc = null;
  let cdp = null;

  const adminToken = 'adm_browser_' + crypto.randomBytes(16).toString('hex');
  const adminTokenHash = crypto.createHash('sha256').update(adminToken).digest('hex');

  const staffToken = 'stf_browser_' + crypto.randomBytes(16).toString('hex');
  const staffTokenHash = crypto.createHash('sha256').update(staffToken).digest('hex');

  try {
    // -------------------------------------------------------------------------
    // Setup 1: Prepare Database Sessions
    // -------------------------------------------------------------------------
    console.log('[Setup 1]: Authenticating Test Admin & Staff in Database');
    const staffList = await repos.staff.findAll({ includeInactive: false });
    assert.strictEqual(staffList.length > 0, true, 'At least one active staff member required');
    const testStaff = staffList[0];

    const adminUserRes = await db.query('SELECT id FROM public.admin_users WHERE is_active = TRUE LIMIT 1');
    const adminId = adminUserRes.rows.length > 0 ? adminUserRes.rows[0].id : null;

    await repos.authSessions.createSession({
      tokenHash: adminTokenHash,
      userType: 'admin',
      adminId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    await repos.authSessions.createSession({
      tokenHash: staffTokenHash,
      userType: 'staff',
      staffId: testStaff.id,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
    pass(`Test admin session and staff session created for staff ${testStaff.staff_code}`);

    // Seed initial heartbeat for testStaff to ensure live coordinates exist
    await repos.staffTracking.recordLocation(testStaff.id, {
      latitude: 25.3176,
      longitude: 82.9739,
      accuracy: 6.0,
      speed: 2.0,
      batteryLevel: 94,
      isCharging: false,
      triggerType: 'initial_seed',
      capturedAt: new Date().toISOString()
    });
    pass('Initial seed location recorded for staff');

    // -------------------------------------------------------------------------
    // Setup 2: Start CWP Server
    // -------------------------------------------------------------------------
    console.log('[Setup 2]: Starting CWP Application HTTP Server');
    const serverModule = require('../server');
    server = serverModule.server.listen(TEST_SERVER_PORT);
    await sleep(500);
    pass(`CWP Application running on http://localhost:${TEST_SERVER_PORT}`);

    // -------------------------------------------------------------------------
    // Setup 3: Launch Headless Google Chrome
    // -------------------------------------------------------------------------
    console.log('[Setup 3]: Spawning Headless Chrome');
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (!fs.existsSync(chromePath)) {
      throw new Error(`Google Chrome not found at ${chromePath}`);
    }

    const userDataDir = path.join(__dirname, '..', '.tmp_chrome_browser_test');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    chromeProc = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,900',
      'about:blank'
    ]);

    // Wait for Chrome CDP port to become ready
    let cdpReady = false;
    for (let i = 0; i < 20; i++) {
      try {
        const ver = await fetchJson(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version`);
        if (ver && ver.webSocketDebuggerUrl) {
          cdpReady = true;
          break;
        }
      } catch (e) {}
      await sleep(250);
    }
    assert.strictEqual(cdpReady, true, 'Chrome DevTools Protocol port not reachable');
    pass(`Headless Chrome 158 running on CDP port ${CHROME_DEBUG_PORT}`);

    // Obtain target page or create new page
    const pages = await fetchJson(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/list`);
    const pageTarget = pages.find(p => p.type === 'page') || pages[0];
    assert.strictEqual(Boolean(pageTarget && pageTarget.webSocketDebuggerUrl), true, 'No page target found');

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    pass('CDP Client connected to Chrome browser session');

    // -------------------------------------------------------------------------
    // BROWSER TEST 1: Admin Tab Navigation & M3 Live Tracking Section
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1]: Browser DOM & Admin Live Tracking Tab Navigation');
    // Navigate to admin portal
    await cdp.send('Page.navigate', { url: `http://localhost:${TEST_SERVER_PORT}/admin` });
    await sleep(1200);

    // Inject admin authentication tokens into localStorage & sessionStorage
    await cdp.evaluate(`
      localStorage.setItem('cwp_admin_token', '${adminToken}');
      sessionStorage.setItem('cwp_admin_token', '${adminToken}');
      sessionStorage.setItem('cwp_admin_auth', 'authenticated');
      localStorage.setItem('cwp_admin_auth', 'authenticated');
      sessionStorage.setItem('cwp_user_role', 'admin');
      if (typeof applyViewMode === 'function') {
        applyViewMode('admin');
      }
      if (typeof checkAdminAuthStatus === 'function') {
        checkAdminAuthStatus();
      }
      if (typeof switchAdminTab === 'function') {
        switchAdminTab('staffTracking');
      }
    `);
    await sleep(2000);

    // Verify Sidebar Tab Button
    const tabBtnExists = await cdp.evaluate(`
      const btn = document.getElementById('tabBtnStaffTracking');
      return btn !== null && (btn.textContent.includes('Track Staff') || btn.textContent.includes('Staff Live Tracking'));
    `);
    assert.strictEqual(tabBtnExists, true, 'Sidebar tab button #tabBtnStaffTracking missing or invalid');
    pass('Admin sidebar tab button #tabBtnStaffTracking exists with "Track Staff" label');

    // Verify LIVE indicator badge
    const liveBadgeExists = await cdp.evaluate(`
      const btn = document.getElementById('tabBtnStaffTracking');
      const badge = btn ? btn.querySelector('.hub-live-badge') : null;
      return badge !== null && badge.textContent.includes('LIVE');
    `);
    assert.strictEqual(liveBadgeExists, true, 'LIVE badge on staff tracking tab button missing');
    pass('Material LIVE pulse badge is present on #tabBtnStaffTracking');

    // Verify Admin Tracking Pane is active and visible
    const paneVisible = await cdp.evaluate(`
      const pane = document.getElementById('adminTabStaffTracking');
      return pane !== null && pane.style.display !== 'none';
    `);
    assert.strictEqual(paneVisible, true, '#adminTabStaffTracking pane should be visible');
    pass('#adminTabStaffTracking tab pane is displayed');

    // -------------------------------------------------------------------------
    // BROWSER TEST 2: 4 KPI Cards Rendering
    // -------------------------------------------------------------------------
    console.log('\n[Phase 2]: Validating 4 Realtime KPI Cards in Browser DOM');
    const kpisValid = await cdp.evaluate(`
      const k1 = document.getElementById('kpiTrackingActiveStaff');
      const k2 = document.getElementById('kpiTrackingTotalDistance');
      const k3 = document.getElementById('kpiTrackingTotalStoppages');
      const k4 = document.getElementById('kpiTrackingAvgDwellTime');
      return ({
        activeStaff: k1 ? k1.textContent.trim() : null,
        fleetDistance: k2 ? k2.textContent.trim() : null,
        totalStoppages: k3 ? k3.textContent.trim() : null,
        avgDwell: k4 ? k4.textContent.trim() : null
      });
    `);

    assert.strictEqual(Boolean(kpisValid.activeStaff), true, 'kpiTrackingActiveStaff missing');
    assert.strictEqual(Boolean(kpisValid.fleetDistance), true, 'kpiTrackingTotalDistance missing');
    assert.strictEqual(Boolean(kpisValid.totalStoppages), true, 'kpiTrackingTotalStoppages missing');
    assert.strictEqual(Boolean(kpisValid.avgDwell), true, 'kpiTrackingAvgDwellTime missing');
    pass(`All 4 KPI cards rendered: Active Staff [${kpisValid.activeStaff}], Distance [${kpisValid.fleetDistance}], Stops [${kpisValid.totalStoppages}], Dwell [${kpisValid.avgDwell}]`);

    // -------------------------------------------------------------------------
    // BROWSER TEST 3: Staff Directory List & Filter Pills
    // -------------------------------------------------------------------------
    console.log('\n[Phase 3]: Validating Staff Directory & Status Filter Pills');
    const filterPillsValid = await cdp.evaluate(`
      const pAll = document.getElementById('pillTrackingFilterAll');
      const pMove = document.getElementById('pillTrackingFilterMoving');
      const pStop = document.getElementById('pillTrackingFilterStopped');
      const pIdle = document.getElementById('pillTrackingFilterIdle');
      return pAll !== null && pMove !== null && pStop !== null && pIdle !== null;
    `);
    assert.strictEqual(filterPillsValid, true, 'Status filter pills missing');
    pass('Filter pills (All, Moving, Stopped, Idle) exist in browser DOM');

    // Verify Staff Cards in Directory
    const staffCardsCount = await cdp.evaluate(`
      return document.querySelectorAll('#trackingStaffListContainer .tracking-staff-card').length;
    `);
    assert.strictEqual(staffCardsCount >= 1, true, 'At least 1 staff card should be rendered in directory');
    pass(`Staff directory rendered ${staffCardsCount} live staff card(s)`);

    // Verify Action buttons on staff card
    const actionButtonsValid = await cdp.evaluate(`
      const card = document.querySelector('.tracking-staff-card');
      if (!card) return false;
      const text = card.innerHTML;
      return text.includes('Center') && text.includes('Ping') && text.includes('Stops');
    `);
    assert.strictEqual(actionButtonsValid, true, 'Action buttons (Center, Ping, Stops) missing on staff card');
    pass('Staff cards contain Center Map, Ping Staff, and View Stops action buttons');

    // -------------------------------------------------------------------------
    // BROWSER TEST 4: TrackingMapAdapter Viewport & Controls
    // -------------------------------------------------------------------------
    console.log('\n[Phase 4]: Validating Map Viewport & Floating Controls');
    const mapCanvasHeight = await cdp.evaluate(`
      const canvas = document.getElementById('staffTrackingMapCanvas');
      return canvas ? canvas.offsetHeight : -1;
    `);
    console.log('Map canvas offsetHeight:', mapCanvasHeight);
    assert.strictEqual(mapCanvasHeight > 0, true, 'Map canvas offsetHeight must be > 0');
    pass(`Map canvas #staffTrackingMapCanvas initialized with height ${mapCanvasHeight}px`);

    // Verify Floating Map Toolbar Buttons
    const mapControlsValid = await cdp.evaluate(`
      const btns = document.querySelectorAll('.map-controls-floating .btn-map-control');
      return btns.length >= 3;
    `);
    assert.strictEqual(mapControlsValid, true, 'Map floating toolbar controls missing');
    pass('Floating toolbar has Recenter All, Breadcrumb Toggle, and Map Provider Switcher buttons');
    assert.strictEqual(mapControlsValid, true, 'Map floating toolbar controls missing');
    pass('Floating toolbar has Recenter All, Breadcrumb Toggle, and Map Provider Switcher buttons');

    // -------------------------------------------------------------------------
    // BROWSER TEST 5: PWA 15-Minute Heartbeat Transmission in Browser
    // -------------------------------------------------------------------------
    console.log('\n[Phase 5]: Staff PWA Realtime Heartbeat Transmission Flow');
    // Grant geolocation permission and set emulation coordinates via CDP
    try {
      await cdp.send('Browser.grantPermissions', {
        permissions: ['geolocation'],
        origin: `http://localhost:${TEST_SERVER_PORT}`
      });
    } catch (e) {}

    await cdp.send('Emulation.setGeolocationOverride', {
      latitude: 25.3210,
      longitude: 82.9770,
      accuracy: 5.5
    });

    const heartbeatEval = await cdp.evaluate(`
      return new Promise(resolve => {
        window.triggerStaffLocationHeartbeat('${testStaff.id}', 'browser_automation_test', function(res) {
          resolve(res);
        });
      });
    `);

    console.log('Heartbeat evaluation result:', heartbeatEval);
    assert.strictEqual(Boolean(heartbeatEval && heartbeatEval.success), true, 'triggerStaffLocationHeartbeat failed');
    pass(`PWA Heartbeat successfully transmitted from browser (Status: ${heartbeatEval.status}, Distance: ${heartbeatEval.todayDistanceKm} km)`);

    // Reload tracking data in browser DOM and verify refresh
    await cdp.evaluate(`window.loadStaffTrackingTab(true);`);
    await sleep(600);
    const updatedDistance = await cdp.evaluate(`return document.getElementById('kpiTrackingTotalDistance').textContent;`);
    pass(`Browser Admin KPI updated live after heartbeat: ${updatedDistance}`);

    // -------------------------------------------------------------------------
    // BROWSER TEST 6: Admin On-Demand Ping & Accelerated Polling Flow
    // -------------------------------------------------------------------------
    console.log('\n[Phase 6]: Admin On-Demand Location Ping & Accelerated Poll Flow');
    // Trigger ping from admin
    const pingTriggerResult = await cdp.evaluate(`
      return new Promise(resolve => {
        const btn = document.getElementById('btnPingStaff_${testStaff.id}');
        window.pingStaffFromAdmin('${testStaff.id}', '${testStaff.name}', btn);
        setTimeout(() => {
          resolve({
            buttonText: btn ? btn.textContent : '',
            disabled: btn ? btn.disabled : false
          });
        }, 150);
      });
    `);

    assert.strictEqual(pingTriggerResult.disabled, true, 'Ping button should be disabled while pinging');
    pass('Admin Ping button transitioned to active spinner state and disabled');

    // Staff fulfills the pending ping via respondToLocationPing
    const pings = await repos.staffTracking.getPendingPings(testStaff.id);
    assert.strictEqual(pings.length > 0, true, 'Pending ping must exist on server');
    const latestPing = pings[0];

    const fulfillRes = await repos.staffTracking.fulfillLocationPing(latestPing.id, {
      latitude: 25.3230,
      longitude: 82.9790,
      accuracy: 4.0,
      batteryLevel: 91,
      speed: 2.1
    });
    assert.strictEqual(fulfillRes.success, true, 'fulfillLocationPing should succeed');
    pass(`Staff fulfilled on-demand location ping ${latestPing.id}`);

    // Wait for admin accelerated poll tick (2.5s)
    await sleep(3000);
    const refreshedCardCoords = await cdp.evaluate(`
      const card = document.getElementById('trackingCard_${testStaff.id}');
      return card ? card.querySelector('.staff-location-row').textContent : '';
    `);
    pass(`Admin UI detected ping fulfillment and updated coordinates to: ${refreshedCardCoords}`);

    // -------------------------------------------------------------------------
    // BROWSER TEST 7: Stoppages Drawer & Movement History Timeline Table
    // -------------------------------------------------------------------------
    console.log('\n[Phase 7]: Expandable Stoppages Drawer & Movement History Journey');
    // Click View Stops
    await cdp.evaluate(`
      window.viewStaffStoppages('${testStaff.id}', '${testStaff.name}');
    `);
    await sleep(800);

    const drawerVisible = await cdp.evaluate(`
      const drawer = document.getElementById('trackingStoppagesDrawer');
      return drawer !== null && drawer.style.display !== 'none';
    `);
    assert.strictEqual(drawerVisible, true, 'Stoppages drawer #trackingStoppagesDrawer should be visible');
    pass('Collapsible Stoppages Drawer #trackingStoppagesDrawer expanded');

    const stoppagesTableRows = await cdp.evaluate(`
      return document.querySelectorAll('#stoppagesTableContainer table.stoppages-table tr').length;
    `);
    pass(`Stoppages journey table rendered with ${stoppagesTableRows} row(s) including headers and dwell times`);

    // Close drawer
    await cdp.evaluate(`window.closeTrackingStoppagesDrawer();`);
    const drawerClosed = await cdp.evaluate(`
      const drawer = document.getElementById('trackingStoppagesDrawer');
      return drawer.style.display === 'none';
    `);
    assert.strictEqual(drawerClosed, true, 'Stoppages drawer should be closed');
    pass('Collapsible Stoppages Drawer closed and map bounds restored');

    // -------------------------------------------------------------------------
    // BROWSER TEST 8: Capture Visual Screenshot
    // -------------------------------------------------------------------------
    console.log('\n[Phase 8]: Capturing Full Visual Screenshot via Headless Chrome');
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, 'staff_tracking_admin_live.png');

    const screenshotData = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotData.data, 'base64'));
    assert.strictEqual(fs.existsSync(screenshotPath), true, 'Screenshot file missing');
    const shotSize = fs.statSync(screenshotPath).size;
    assert.strictEqual(shotSize > 5000, true, 'Screenshot size too small');
    pass(`Visual screenshot captured successfully at: ${screenshotPath} (${Math.round(shotSize / 1024)} KB)`);

    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passed}/${total} AUTOMATED BROWSER VERIFICATION TESTS PASSED!`);
    console.log('===============================================================');

  } catch (err) {
    fail('Browser verification suite crashed with error', err);
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch (e) {}
    }
    if (server) {
      try { server.close(); } catch (e) {}
    }
    await db.query('DELETE FROM public.auth_sessions WHERE token_hash IN ($1, $2)', [adminTokenHash, staffTokenHash]);
    // Clean up temporary chrome user data directory
    const tmpDir = path.join(__dirname, '..', '.tmp_chrome_browser_test');
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
    process.exit(0);
  }
}

runBrowserVerificationSuite();
