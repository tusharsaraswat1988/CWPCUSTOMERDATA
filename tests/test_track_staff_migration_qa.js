/**
 * =========================================================================
 * CWP ADMIN V2 — TRACK STAFF MIGRATION & FUNCTIONAL QA SUITE
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
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_track_qa_'));
const tempDataFile = path.join(tempDataDir, 'local_data.json');

fs.writeFileSync(tempDataFile, JSON.stringify({
  customers: [],
  staffList: [
    { id: 'STF01', staffCode: 'STF01', name: 'Amit Kumar', phone: '9876500011', active: true, isActive: true },
    { id: 'STF02', staffCode: 'STF02', name: 'Gaurav Gupta', phone: '9876500022', active: true, isActive: true }
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
    this.ws.addEventListener('message', evt => {
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
  console.log('CWP ADMIN V2 — TRACK STAFF MIGRATION & FUNCTIONAL QA SUITE');
  console.log('===============================================================');

  // 1. Static Checks
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const trkCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-track-staff.css'), 'utf8');
  const trkJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-track-staff.js'), 'utf8');

  assert.ok(v2Html.includes('/admin-v2/css/v2-track-staff.css'), 'index.html must link v2-track-staff.css');
  assert.ok(v2Html.includes('/admin-v2/js/v2-track-staff.js'), 'index.html must load v2-track-staff.js');
  assert.ok(trkCss.includes('#v2View_staffTracking.is-active'), 'v2-track-staff.css must scope #v2View_staffTracking.is-active');
  assert.ok(!v2Html.includes('Live staff tracking workspace ready.'), 'Placeholder text must be removed');
  assert.ok(trkJs.includes('window.CWP_ADMIN_V2.trackStaff'), 'v2-track-staff.js must register window.CWP_ADMIN_V2.trackStaff');

  for (const line of trkCss.split('\n')) {
    const t = line.trim();
    assert.ok(t !== 'body {' && t !== 'html {', 'v2-track-staff.css must not contain bare body/html selectors');
  }

  // English-only & no UI emojis
  assert.ok(!/[\u0900-\u097F]/.test(trkJs), 'v2-track-staff.js must not contain Devanagari/Hindi');
  assert.ok(!/[\u0900-\u097F]/.test(trkCss), 'v2-track-staff.css must not contain Devanagari/Hindi');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(trkJs), 'v2-track-staff.js must not contain UI emojis');

  // Duplicate ID check in admin-v2/index.html
  const idMatches = [...v2Html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const seenIds = new Set();
  for (const id of idMatches) {
    assert.ok(!seenIds.has(id), `Duplicate DOM id found in admin-v2/index.html: ${id}`);
    seenIds.add(id);
  }
  console.log('[PASS] Static hygiene, scoping, English-only, emoji-free, and unique DOM IDs');

  // 2. Start test server
  const serverProc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(TEST_PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await httpRequest('GET', '/admin-v2');
      if (r.status === 200) { serverReady = true; break; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(serverReady, 'Test server must start on port ' + TEST_PORT);

  const chromePath = findChromeBinary();
  assert.ok(chromePath, 'Chrome or Edge binary must be installed for browser QA');

  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_track_chrome_'));
  const cdpPort = 9344;
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${chromeDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const list = await res.json();
      const target = list.find(t => t.type === 'page');
      if (target && target.webSocketDebuggerUrl) { wsUrl = target.webSocketDebuggerUrl; break; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(wsUrl, 'CDP WebSocket URL must be available');

  const cdp = new CdpClient(wsUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  try {
    // Login & navigate to Track Staff
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${TEST_PORT}/admin-v2` });
    await new Promise(r => setTimeout(r, 900));

    await cdp.evaluate(`
      const input = document.getElementById('v2AdminPasswordInput');
      if (input) {
        input.value = ${JSON.stringify(TEST_PASS)};
        document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 1200));

    // Install controlled API interceptor on window.CWP_ADMIN_V2.api.request to test real contract scenarios
    await cdp.evaluate(`
      const now = Date.now();
      window.__qaTrackState = {
        pingCalledWith: null,
        stopsMode: 'normal',
        summaryMode: 'initial',
        latOffset: 0
      };
      const origRequest = window.CWP_ADMIN_V2.api.request;
      window.CWP_ADMIN_V2.api.request = async function(action, payload, opts) {
        if (action === 'getMapsConfig') {
          return { success: true, googleMapsApiKey: '' };
        }
        if (action === 'getStaffTrackingSummary') {
          if (window.__qaTrackState.summaryMode === 'error') {
            throw new Error('Telemetry service unreachable');
          }
          const off = window.__qaTrackState.latOffset;
          return {
            success: true,
            date: '2026-11-27',
            kpis: {
              activeStaffCount: 2,
              totalStaffCount: 5,
              fleetDistanceKm: 18.4 + (off > 0 ? 1.2 : 0),
              totalStoppages: 4,
              avgDwellMinutes: 14.5
            },
            staff: [
              {
                staffId: 'uuid-stf-1',
                staffCode: 'STF01',
                name: 'Amit Kumar',
                phone: '9876500011',
                photoUrl: null,
                latitude: 25.3176 + off,
                longitude: 82.9739 + off,
                batteryLevel: 84,
                status: 'moving',
                lastSeenAt: new Date(now - 30 * 1000).toISOString(),
                todayDistanceKm: 11.2,
                stoppageCount: 2,
                lastLocationText: 'Sigra Crossing'
              },
              {
                staffId: 'uuid-stf-2',
                staffCode: 'STF02',
                name: 'Gaurav Gupta',
                phone: '9876500022',
                photoUrl: null,
                latitude: 25.3240,
                longitude: 82.9850,
                batteryLevel: null,
                status: 'stopped',
                lastSeenAt: new Date(now - 5 * 60 * 1000).toISOString(),
                todayDistanceKm: 7.2,
                stoppageCount: 2,
                lastLocationText: 'Lanka Gate'
              },
              {
                staffId: 'uuid-stf-3',
                staffCode: 'STF03',
                name: 'Ramesh Yadav',
                phone: '9876500033',
                photoUrl: null,
                latitude: 25.3100,
                longitude: 82.9600,
                batteryLevel: 42,
                status: 'idle',
                lastSeenAt: new Date(now - 90 * 60 * 1000).toISOString(),
                todayDistanceKm: 0,
                stoppageCount: 0,
                lastLocationText: 'Old Position'
              },
              {
                staffId: 'uuid-stf-4',
                staffCode: 'STF04',
                name: 'Zero Sentinel Staff',
                phone: '9876500044',
                photoUrl: null,
                latitude: 0,
                longitude: 0,
                batteryLevel: null,
                status: 'idle',
                lastSeenAt: null,
                todayDistanceKm: 0,
                stoppageCount: 0,
                lastLocationText: 'No GPS fix yet'
              },
              {
                staffId: 'uuid-stf-5',
                staffCode: 'STF05',
                name: 'Missing GPS Staff',
                phone: '9876500055',
                photoUrl: null,
                latitude: null,
                longitude: null,
                batteryLevel: null,
                status: 'idle',
                lastSeenAt: null,
                todayDistanceKm: 0,
                stoppageCount: 0,
                lastLocationText: 'No GPS fix yet'
              }
            ],
            stoppages: []
          };
        }
        if (action === 'pingStaffLocation') {
          window.__qaTrackState.pingCalledWith = payload.staffId;
          return { success: true, pingId: 'ping-123', status: 'pending' };
        }
        if (action === 'getStaffMovementHistory') {
          if (window.__qaTrackState.stopsMode === 'error') {
            throw new Error('History endpoint error');
          }
          if (window.__qaTrackState.stopsMode === 'empty') {
            return { success: true, staffId: payload.staffId, date: '2026-11-27', breadcrumbs: [], stoppages: [] };
          }
          return {
            success: true,
            staffId: payload.staffId,
            date: '2026-11-27',
            breadcrumbs: [
              { lat: 25.3150, lng: 82.9710, time: new Date(now - 3600000).toISOString() },
              { lat: 25.3176, lng: 82.9739, time: new Date(now - 60000).toISOString() }
            ],
            stoppages: [
              {
                id: 'stop-1',
                lat: 25.3176,
                lng: 82.9739,
                arrivedAt: new Date(now - 900000).toISOString(),
                departedAt: null,
                dwellMinutes: 15,
                locationText: 'Sigra Society Gate',
                isActive: true
              },
              {
                id: 'stop-2',
                lat: 25.3150,
                lng: 82.9710,
                arrivedAt: new Date(now - 3600000).toISOString(),
                departedAt: new Date(now - 2700000).toISOString(),
                dwellMinutes: 15,
                locationText: 'Cantt Parking',
                isActive: false
              }
            ]
          };
        }
        return origRequest.call(window.CWP_ADMIN_V2.api, action, payload, opts);
      };
    `);

    // Navigate to Track Staff tab
    await cdp.evaluate(`window.CWP_ADMIN_V2.shell.navigateTo('staffTracking');`);
    await new Promise(r => setTimeout(r, 1200));

    // Verify KPIs, Connection Pill, Roster, Markers, Invalid GPS exclusion
    const dataCheck = await cdp.evaluate(`
      const activeKpi = document.getElementById('v2TrkKpiActive')?.textContent.trim();
      const distKpi = document.getElementById('v2TrkKpiDistance')?.textContent.trim();
      const stopsKpi = document.getElementById('v2TrkKpiStops')?.textContent.trim();
      const dwellKpi = document.getElementById('v2TrkKpiDwell')?.textContent.trim();
      const connText = document.getElementById('v2TrkConnText')?.textContent.trim();
      const cards = Array.from(document.querySelectorAll('#v2TrkRosterList .cwp-v2-trk-staff-card'));
      const mapState = window.CWP_ADMIN_V2.trackStaff.getMapState();
      const markerIds = mapState.engine === 'svg'
        ? Array.from(document.querySelectorAll('#v2TrkSvgCanvas [data-svg-staff-id]')).map(e => e.getAttribute('data-svg-staff-id'))
        : Array.from(mapState.markersById.keys());
      const staleCardText = document.querySelector('[data-staff-id="uuid-stf-3"]')?.textContent || '';
      const zeroCardText = document.querySelector('[data-staff-id="uuid-stf-4"]')?.textContent || '';
      return { activeKpi, distKpi, stopsKpi, dwellKpi, connText, cardCount: cards.length, engine: mapState.engine, markerIds, staleCardText, zeroCardText };
    `);

    assert.strictEqual(dataCheck.activeKpi, '2 / 5', 'Active Field Staff KPI should be 2 / 5');
    assert.strictEqual(dataCheck.distKpi, '18.4 km', 'Distance KPI should be 18.4 km');
    assert.strictEqual(dataCheck.stopsKpi, '4', 'Total Stoppages KPI should be 4');
    assert.strictEqual(dataCheck.dwellKpi, '14.5 min', 'Avg Dwell KPI should be 14.5 min');
    assert.strictEqual(dataCheck.connText, 'Connected', 'Connection pill should show Connected for live data');
    assert.strictEqual(dataCheck.cardCount, 5, 'All 5 staff cards should render');
    assert.strictEqual(dataCheck.markerIds.length, 3, 'Only 3 staff with valid GPS should have map markers');
    assert.ok(!dataCheck.markerIds.includes('uuid-stf-4'), '0,0 sentinel GPS must NOT get a marker');
    assert.ok(!dataCheck.markerIds.includes('uuid-stf-5'), 'null GPS must NOT get a marker');
    assert.ok(dataCheck.staleCardText.includes('Stale'), 'Old timestamp must show Stale');
    assert.ok(dataCheck.zeroCardText.includes('GPS unavailable'), 'Invalid GPS card must show GPS unavailable');
    console.log(`[PASS] Data & Markers verified (engine=${dataCheck.engine}, 3 valid markers, 2 invalid excluded)`);

    // Test Search & Filter
    await cdp.evaluate(`
      const inp = document.getElementById('v2TrkSearchInput');
      inp.value = 'Gaurav';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 250));
    const searchCount = await cdp.evaluate(`return document.querySelectorAll('#v2TrkRosterList .cwp-v2-trk-staff-card').length`);
    assert.strictEqual(searchCount, 1, 'Search by name should filter to 1 staff card');

    await cdp.evaluate(`document.getElementById('v2TrkSearchClear').click();`);
    await new Promise(r => setTimeout(r, 150));
    await cdp.evaluate(`document.querySelector('[data-trk-filter="moving"]').click();`);
    const movingCount = await cdp.evaluate(`return document.querySelectorAll('#v2TrkRosterList .cwp-v2-trk-staff-card').length`);
    assert.strictEqual(movingCount, 1, 'Moving filter should show 1 staff');
    await cdp.evaluate(`document.querySelector('[data-trk-filter="all"]').click();`);
    console.log('[PASS] Search and status filter pills verified');

    // Test List Selection -> Map Detail Card & Marker Highlight
    await cdp.evaluate(`document.querySelector('[data-staff-id="uuid-stf-2"]').click();`);
    await new Promise(r => setTimeout(r, 250));
    const listSel = await cdp.evaluate(`
      const cardSel = document.querySelector('[data-staff-id="uuid-stf-2"]')?.classList.contains('is-selected');
      const detailVisible = !document.getElementById('v2TrkMapDetailCard').hidden;
      const detailText = document.getElementById('v2TrkMapDetailCard').textContent;
      return { cardSel, detailVisible, detailText };
    `);
    assert.ok(listSel.cardSel, 'Clicked staff card must have is-selected');
    assert.ok(listSel.detailVisible, 'Map detail card must open on list selection');
    assert.ok(listSel.detailText.includes('Gaurav Gupta'), 'Map detail card must show Gaurav Gupta');

    // Test Map Selection -> List Synchronization
    await cdp.evaluate(`window.CWP_ADMIN_V2.trackStaff.selectStaff('uuid-stf-1', { source: 'map', centerMap: false });`);
    await new Promise(r => setTimeout(r, 250));
    const mapSel = await cdp.evaluate(`
      const card1Sel = document.querySelector('[data-staff-id="uuid-stf-1"]')?.classList.contains('is-selected');
      const card2Sel = document.querySelector('[data-staff-id="uuid-stf-2"]')?.classList.contains('is-selected');
      const detailText = document.getElementById('v2TrkMapDetailCard').textContent;
      return { card1Sel, card2Sel, detailText };
    `);
    assert.ok(mapSel.card1Sel && !mapSel.card2Sel, 'Selecting on map must sync selection to roster card');
    assert.ok(mapSel.detailText.includes('Amit Kumar'), 'Map detail card must update to Amit Kumar');
    console.log('[PASS] Bidirectional selection sync (List <-> Map) verified');

    // Test Refresh updates coordinates & preserves selection without duplicate markers
    await cdp.evaluate(`
      window.__qaTrackState.latOffset = 0.0025;
      await window.CWP_ADMIN_V2.trackStaff.loadData(false);
    `);
    await new Promise(r => setTimeout(r, 250));
    const refreshCheck = await cdp.evaluate(`
      const distKpi = document.getElementById('v2TrkKpiDistance')?.textContent.trim();
      const selId = window.CWP_ADMIN_V2.trackStaff.getState().selectedStaffId;
      const mapState = window.CWP_ADMIN_V2.trackStaff.getMapState();
      const markerCount = mapState.engine === 'svg'
        ? document.querySelectorAll('#v2TrkSvgCanvas [data-svg-staff-id]').length
        : mapState.markersById.size;
      return { distKpi, selId, markerCount };
    `);
    assert.strictEqual(refreshCheck.distKpi, '19.6 km', 'KPI should update on refresh');
    assert.strictEqual(refreshCheck.selId, 'uuid-stf-1', 'Selection must persist across refresh');
    assert.strictEqual(refreshCheck.markerCount, 3, 'No duplicate markers after refresh');
    console.log('[PASS] Refresh updates KPIs/markers without duplicates and preserves selection');

    // Test Ping action
    await cdp.evaluate(`document.querySelector('[data-staff-id="uuid-stf-1"] [data-trk-action="ping"]').click();`);
    await new Promise(r => setTimeout(r, 300));
    const pingStaffId = await cdp.evaluate(`return window.__qaTrackState.pingCalledWith`);
    assert.strictEqual(pingStaffId, 'uuid-stf-1', 'Ping must invoke pingStaffLocation with correct staffId');
    console.log('[PASS] Ping action verified');

    // Test Stops Modal (normal, empty, error)
    await cdp.evaluate(`document.querySelector('[data-staff-id="uuid-stf-1"] [data-trk-action="stops"]').click();`);
    await new Promise(r => setTimeout(r, 350));
    const stopsNormal = await cdp.evaluate(`
      const modalOpen = document.getElementById('v2ModalTrackStops').style.display !== 'none';
      const rows = document.querySelectorAll('#v2TrkStopsContent tbody tr').length;
      const txt = document.getElementById('v2TrkStopsContent').textContent;
      return { modalOpen, rows, txt };
    `);
    assert.ok(stopsNormal.modalOpen, 'Stops modal must open');
    assert.strictEqual(stopsNormal.rows, 2, 'Stops modal must render 2 stops');
    assert.ok(stopsNormal.txt.includes('Active Stop') && stopsNormal.txt.includes('Departed'), 'Stops modal must distinguish active vs departed stops');

    await cdp.evaluate(`
      window.__qaTrackState.stopsMode = 'empty';
      await window.CWP_ADMIN_V2.trackStaff.openStopsModal('uuid-stf-1');
    `);
    const stopsEmptyTxt = await cdp.evaluate(`return document.getElementById('v2TrkStopsContent').textContent`);
    assert.ok(stopsEmptyTxt.includes('No stoppages recorded today'), 'Empty stops state must render');

    await cdp.evaluate(`
      window.__qaTrackState.stopsMode = 'error';
      await window.CWP_ADMIN_V2.trackStaff.openStopsModal('uuid-stf-1');
    `);
    const stopsErrTxt = await cdp.evaluate(`return document.getElementById('v2TrkStopsContent').textContent`);
    assert.ok(stopsErrTxt.includes('Unable to load stoppages'), 'Stops error state must render');
    await cdp.evaluate(`window.CWP_ADMIN_V2.overlay.close('v2ModalTrackStops', { pushHistory: false });`);
    console.log('[PASS] Stops modal (normal, empty, error) verified');

    // Test Disconnected state on API failure
    await cdp.evaluate(`
      window.__qaTrackState.summaryMode = 'error';
      await window.CWP_ADMIN_V2.trackStaff.loadData(false);
    `);
    const errConn = await cdp.evaluate(`return document.getElementById('v2TrkConnText').textContent.trim()`);
    assert.strictEqual(errConn, 'Disconnected', 'Connection pill must show Disconnected on error');
    await cdp.evaluate(`
      window.__qaTrackState.summaryMode = 'initial';
      await window.CWP_ADMIN_V2.trackStaff.loadData(false);
    `);
    console.log('[PASS] Disconnected state verified');

    // Test Viewports: Desktop 1440x900, Tablet 768x1024, Mobile 390x844
    const viewports = [
      { name: 'Desktop', width: 1440, height: 900, mobile: false },
      { name: 'Tablet', width: 768, height: 1024, mobile: false },
      { name: 'Mobile', width: 390, height: 844, mobile: true }
    ];
    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile
      });
      await new Promise(r => setTimeout(r, 300));
      const metrics = await cdp.evaluate(`
        const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const mapBox = document.getElementById('v2TrkMapCanvas')?.getBoundingClientRect();
        const workspace = document.querySelector('.cwp-v2-workspace');
        const wsStyle = workspace ? getComputedStyle(workspace) : null;
        return {
          docOverflow,
          mapWidth: mapBox ? mapBox.width : 0,
          mapHeight: mapBox ? mapBox.height : 0,
          wsOverflowY: wsStyle ? wsStyle.overflowY : ''
        };
      `);
      assert.ok(!metrics.docOverflow, `${vp.name} (${vp.width}x${vp.height}) must have zero horizontal overflow`);
      assert.ok(metrics.mapWidth > 200 && metrics.mapHeight >= 300, `${vp.name} map canvas must have non-crushed dimensions (${metrics.mapWidth}x${metrics.mapHeight})`);
      if (vp.name === 'Desktop') {
        assert.strictEqual(metrics.wsOverflowY, 'hidden', 'Desktop workspace must have overflow-y: hidden to prevent double vertical scrolling');
      }
      console.log(`[PASS] Viewport ${vp.name} (${vp.width}x${vp.height}): map=${Math.round(metrics.mapWidth)}x${Math.round(metrics.mapHeight)}, overflow=false`);
    }

    assert.strictEqual(cdp.consoleErrors.length, 0, `Expected 0 console errors, got: ${cdp.consoleErrors.join('; ')}`);
    console.log('[PASS] Zero console/runtime exceptions');
    console.log('ALL TRACK STAFF MIGRATION QA CHECKS PASSED!');
  } finally {
    try { await cdp.evaluate(`window.CWP_ADMIN_V2.trackStaff.stopPolling();`); } catch (e) {}
    cdp.close();
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
    try { serverProc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(tempDataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error('TRACK STAFF QA FAILED:', err);
  process.exit(1);
});
