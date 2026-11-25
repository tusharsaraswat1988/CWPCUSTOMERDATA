/**
 * =========================================================================
 * BROWSER EVIDENCE CAPTURE: TASK 01.11 ROUTE MANAGEMENT UI-FIRST
 * Uses Chrome DevTools Protocol (CDP) to drive actual headless browser and
 * capture real screenshots across all 4 mandatory viewports:
 * - Desktop: 1440px (1440x900)
 * - Tablet: 768px (768x1024)
 * - Mobile: 390px (390x844)
 * - Narrow Mobile: 360px (360x780)
 * =========================================================================
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '3006';
process.env.USE_LOCAL_ROUTES_TEST = 'true';
process.env.USE_LOCAL_DCC_TEST = 'true';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = global.WebSocket || require('ws');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9225;
const BASE_URL = 'http://127.0.0.1:3006';
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'route_management');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: e.message, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = err => reject(err);
      this.ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: width < 768
    });
  }

  async screenshot(filename) {
    const filePath = path.join(OUT_DIR, filename);
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`  📸 [Saved]: ${filename} (${buffer.length} bytes)`);
    return filePath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function captureEvidence() {
  console.log('\n===============================================================');
  console.log('🌐 CAPTURING VISUAL EVIDENCE FOR TASK 01.11 ROUTE MANAGEMENT');
  console.log('===============================================================\n');

  // 1. Start App Server
  console.log('1. Starting CWP server on port 3006...');
  const cwp = require('../server.js');
  const server = cwp.server;
  await new Promise(resolve => server.listen(3006, '127.0.0.1', resolve));

  // 2. Obtain Admin Session Token
  console.log('2. Authenticating admin session...');
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const authRes = await postJson(`${BASE_URL}/api`, {
    action: 'verifyAdminPassword',
    password: adminPass
  });
  const adminToken = authRes.token || '';
  console.log(`   Admin authenticated: ${Boolean(adminToken)}`);

  // 3. Populate Safe Isolated Route Fixtures for Visual QA
  console.log('3. Seeding representative Route & Sequence fixture data...');
  const routeService = require('../services/routeService');
  const repos = require('../db/repositories/index');

  // Reset stores for deterministic visual state
  repos.routes.__resetLocalStores();

  // Create Route 1: North Jaipur Morning Route
  const r1 = await routeService.createRoute({
    routeCode: 'ROUTE-NORTH-01',
    routeName: 'North Jaipur Morning Route',
    description: 'Covers Malviya Nagar, Jagatpura, and Calgiri Marg residential complexes',
    operationalArea: 'Jaipur North'
  });

  // Assign Staff
  await repos.routes.updateRoute(r1.id, {
    assignedStaffId: 'stf_01'
  });

  // Add 4 Stops to Route 1
  await repos.routes.addStopToRoute({
    routeId: r1.id,
    subscriptionId: 'sub_dcc_01',
    customerId: 'cust_01',
    sequenceOrder: 1,
    notes: 'Tower A Basement Parking #14'
  });
  // Manually enrich local stop with customer and vehicle details for UI display
  const stopsR1 = await repos.routes.getStopsByRouteId(r1.id);
  if (stopsR1[0]) {
    stopsR1[0].customer_name = 'Vikram Singhania';
    stopsR1[0].customer_phone = '+91 9829012345';
    stopsR1[0].customer_code = 'CUST-001';
    stopsR1[0].registration_no = 'RJ14 CA 7890';
    stopsR1[0].brand_or_model = 'Tata Nexon EV';
    stopsR1[0].car_color = 'Teal Blue';
    stopsR1[0].package_name = 'Daily Car Cleaning Premium';
    stopsR1[0].address_text = 'Flat 402, Royal Residency, Calgiri Marg, Malviya Nagar, Jaipur';
    stopsR1[0].parking_details = 'Basement Slot B-14';
  }

  const s2 = await repos.routes.addStopToRoute({
    routeId: r1.id,
    subscriptionId: 'sub_dcc_02',
    customerId: 'cust_02',
    sequenceOrder: 2,
    notes: 'Ground Floor Porch'
  });
  s2.customer_name = 'Pooja Agarwal';
  s2.customer_phone = '+91 9829054321';
  s2.customer_code = 'CUST-002';
  s2.registration_no = 'RJ14 CC 4321';
  s2.brand_or_model = 'Hyundai Creta';
  s2.car_color = 'Polar White';
  s2.package_name = 'Daily Car Cleaning Standard';
  s2.address_text = 'Villa 12, Jagatpura Green Valley, Jaipur';
  s2.parking_details = 'Covered Garage Porch';

  const s3 = await repos.routes.addStopToRoute({
    routeId: r1.id,
    subscriptionId: 'sub_dcc_03',
    customerId: 'cust_03',
    sequenceOrder: 3,
    notes: 'Driveway Near Main Gate'
  });
  s3.customer_name = 'Rajesh Meena';
  s3.customer_phone = '+91 9988776655';
  s3.customer_code = 'CUST-003';
  s3.registration_no = 'RJ14 CD 9988';
  s3.brand_or_model = 'Mahindra XUV700';
  s3.car_color = 'Midnight Black';
  s3.package_name = 'Daily Car Cleaning Standard';
  s3.address_text = 'B-45, Siddharth Nagar, Malviya Nagar, Jaipur';
  s3.parking_details = 'Open Driveway';

  // Create Route 2: South Jaipur Evening Route
  const r2 = await routeService.createRoute({
    routeCode: 'ROUTE-SOUTH-02',
    routeName: 'Mansarovar & Gopalpura Cluster',
    description: 'Covers VT Road, Shipra Path, and Gopalpura Bypass residences',
    operationalArea: 'Jaipur South'
  });
  await repos.routes.updateRoute(r2.id, { assignedStaffId: 'stf_02' });

  // Create Route 3: West Jaipur Inactive Route
  await routeService.createRoute({
    routeCode: 'ROUTE-WEST-03',
    routeName: 'Vaishali Nagar Express Cluster',
    description: 'Planned cluster for Amrapali Circle and Chitrakoot',
    operationalArea: 'Jaipur West',
    status: 'inactive'
  });

  console.log('   Fixture routes and sequenced stops ready.');

  // 4. Launch Headless Browser
  console.log('4. Spawning Headless Chrome for visual capture...');
  const browserBin = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
  const tempProfile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'cwp_route_qa_' + Date.now());

  const chromeProc = spawn(browserBin, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + tempProfile
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let connected = false;
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      connected = true;
      break;
    } catch (e) {}
  }

  if (!connected) {
    chromeProc.kill();
    server.close();
    throw new Error('Could not connect to Chrome debugging port.');
  }

  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  let target = targets.find(t => t.type === 'page');
  if (!target) {
    target = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(BASE_URL)}`);
  }

  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();
  console.log('   CDP connected to browser tab.');

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Navigate to root with admin param
  await client.send('Page.navigate', { url: BASE_URL + '/?admin=true&tab=sequence' });
  await wait(1200);

  // Set Auth and active tab in browser localStorage & switch to admin mode
  console.log('5. Injecting admin session and activating Route Management tab...');
  await client.eval(`
    localStorage.setItem('cwp_admin_token', '${adminToken}');
    sessionStorage.setItem('cwp_admin_token', '${adminToken}');
    sessionStorage.setItem('cwp_user_role', 'admin');
    localStorage.setItem('cwp_admin_active_tab', 'sequence');
    if (typeof applyViewMode === 'function') {
      applyViewMode('admin', false);
    }
    if (typeof checkAdminAuthStatus === 'function') {
      checkAdminAuthStatus();
    }
    if (typeof switchAdminTab === 'function') {
      switchAdminTab('sequence', false);
    }
    if (typeof initAdminRouteManagement === 'function') {
      initAdminRouteManagement();
    }
    if (typeof refreshRouteManagementData === 'function') {
      refreshRouteManagementData(true);
    }
  `);
  await wait(1500);

  // =========================================================================
  // VIEWPORT 1: DESKTOP (1440px)
  // =========================================================================
  console.log('\n--- Viewport 1: Desktop (1440px) ---');
  await client.setViewport(1440, 900);
  await wait(500);

  // 1.1 Routes Hub Overview
  await client.screenshot('01_desktop_1440_routes_hub.png');

  // 1.2 Open Create Route Modal
  await client.eval(`
    if (typeof openCreateRouteModal === 'function') openCreateRouteModal();
  `);
  await wait(600);
  await client.screenshot('02_desktop_1440_create_route_modal.png');

  // Close Create Route Modal
  await client.eval(`
    if (typeof closeCreateRouteModal === 'function') closeCreateRouteModal();
  `);
  await wait(400);

  // 1.3 Open Route Detail & Stop Sequence Workspace
  await client.eval(`
    if (typeof openRouteDetailView === 'function') openRouteDetailView('${r1.id}');
  `);
  await wait(800);
  await client.screenshot('03_desktop_1440_route_detail_sequence.png');

  // 1.4 Open Assign Staff Modal
  await client.eval(`
    if (typeof openAssignStaffModal === 'function') openAssignStaffModal('${r1.id}');
  `);
  await wait(600);
  await client.screenshot('04_desktop_1440_assign_staff_modal.png');

  // Close Assign Staff Modal
  await client.eval(`
    if (typeof closeAssignStaffModal === 'function') closeAssignStaffModal();
  `);
  await wait(400);

  // 1.5 Switch to Unassigned Workbench
  await client.eval(`
    if (typeof switchRouteSubtab === 'function') switchRouteSubtab('unassigned');
  `);
  await wait(800);
  await client.screenshot('05_desktop_1440_unassigned_workbench.png');

  // Return to Routes Hub
  await client.eval(`
    if (typeof switchRouteSubtab === 'function') switchRouteSubtab('routes');
  `);
  await wait(500);

  // =========================================================================
  // VIEWPORT 2: TABLET (768px)
  // =========================================================================
  console.log('\n--- Viewport 2: Tablet (768px) ---');
  await client.setViewport(768, 1024);
  await wait(600);

  await client.screenshot('06_tablet_768_routes_hub.png');

  // Route Detail on Tablet
  await client.eval(`
    if (typeof openRouteDetailView === 'function') openRouteDetailView('${r1.id}');
  `);
  await wait(600);
  await client.screenshot('07_tablet_768_route_detail_sequence.png');

  await client.eval(`
    if (typeof closeRouteDetailView === 'function') closeRouteDetailView();
  `);
  await wait(400);

  // =========================================================================
  // VIEWPORT 3: MOBILE (390px)
  // =========================================================================
  console.log('\n--- Viewport 3: Mobile (390px) ---');
  await client.setViewport(390, 844);
  await wait(600);

  await client.screenshot('08_mobile_390_routes_hub.png');

  // Route Detail on Mobile
  await client.eval(`
    if (typeof openRouteDetailView === 'function') openRouteDetailView('${r1.id}');
  `);
  await wait(600);
  await client.screenshot('09_mobile_390_route_detail_sequence.png');

  await client.eval(`
    if (typeof closeRouteDetailView === 'function') closeRouteDetailView();
  `);
  await wait(400);

  // =========================================================================
  // VIEWPORT 4: NARROW MOBILE (360px)
  // =========================================================================
  console.log('\n--- Viewport 4: Narrow Mobile (360px) ---');
  await client.setViewport(360, 780);
  await wait(600);

  await client.screenshot('10_narrow_360_routes_hub.png');

  // Route Detail on Narrow Mobile
  await client.eval(`
    if (typeof openRouteDetailView === 'function') openRouteDetailView('${r1.id}');
  `);
  await wait(600);
  await client.screenshot('11_narrow_360_route_detail_sequence.png');

  console.log('\n--- Cleanup & Teardown ---');
  client.close();
  chromeProc.kill();
  await new Promise(resolve => server.close(resolve));

  console.log('\n===============================================================');
  console.log('🎉 ALL 11 ACTUAL BROWSER SCREENSHOTS CAPTURED SUCCESSFULLY!');
  console.log('Saved to: ' + OUT_DIR);
  console.log('===============================================================\n');
}

captureEvidence().catch(err => {
  console.error('\n❌ Screenshot capture failed:', err);
  process.exit(1);
});
