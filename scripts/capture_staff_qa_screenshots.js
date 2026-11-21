const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;
const TARGET_URL = 'http://localhost:3000/';
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'staff_refinement');

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
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
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

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved screenshot: ${filePath} (${buffer.length} bytes)`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('Starting headless Chrome...');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + path.join(__dirname, '..', '.chrome_qa_profile')
  ]);

  let connected = false;
  let versionInfo;
  for (let i = 0; i < 20; i++) {
    await wait(400);
    try {
      versionInfo = await getJson(`http://localhost:${DEBUG_PORT}/json/version`);
      connected = true;
      break;
    } catch (e) {}
  }

  if (!connected) {
    chromeProc.kill();
    throw new Error('Could not connect to Chrome debugging port.');
  }

  console.log('Connected to Chrome. Getting target list...');
  const targets = await getJson(`http://localhost:${DEBUG_PORT}/json/list`);
  let target = targets.find(t => t.type === 'page');
  if (!target) {
    const newTarget = await getJson(`http://localhost:${DEBUG_PORT}/json/new?${encodeURIComponent(TARGET_URL)}`);
    target = newTarget;
  }

  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();
  console.log('CDP Client connected.');

  await client.send('Page.enable');
  await client.send('Runtime.enable');

  console.log('Navigating to', TARGET_URL);
  await client.send('Page.navigate', { url: TARGET_URL });
  await wait(2500);

  // 1. Staff Login Screen at various viewports
  console.log('--- Capturing Login Screens ---');
  await client.eval(`
    // Ensure we are in staff view login gate
    if (typeof switchAppView === 'function') switchAppView('staff');
    if (typeof clearStaffSession === 'function') clearStaffSession();
    var gate = document.getElementById('staffAuthGate');
    var content = document.getElementById('staffContent');
    if (gate) gate.style.display = 'flex';
    if (content) content.style.display = 'none';
  `);
  await wait(500);

  const viewports = [
    { name: 'login_320px.png', w: 320, h: 640 },
    { name: 'login_360px.png', w: 360, h: 740 },
    { name: 'login_390px.png', w: 390, h: 844 },
    { name: 'login_768px.png', w: 768, h: 1024 },
    { name: 'login_1280px.png', w: 1280, h: 800 }
  ];

  for (const vp of viewports) {
    await client.setViewport(vp.w, vp.h);
    await wait(300);
    await client.screenshot(path.join(OUT_DIR, vp.name));
  }

  // 2. Set up Authenticated Staff View with Mock / Sample Data
  console.log('--- Setting up Authenticated Staff View ---');
  await client.eval(`
    // Inject active staff session & dummy customers if needed
    state.currentStaff = { id: 'STF01', name: 'विकास शर्मा', phone: '9876543210', photoUrl: '' };
    state.currentStaffFilteredList = [
      {
        id: 'CUST-001',
        customerName: 'अमित कुमार (Amit Kumar)',
        phone: '9876543210',
        vehicleNumber: 'DL 01 AB 1234',
        vehicleMake: 'Tata Motors',
        vehicleColor: 'Daytona Grey',
        serviceType: 'दैनिक सफाई',
        address: 'B-402, रॉयल रेजीडेंसी, सेक्टर 62, नोएडा',
        landmark: 'अपोजिट मेट्रो स्टेशन',
        routeSeq: 1,
        status: 'pending',
        specialInstructions: 'कृपया पहियों की सफाई पर विशेष ध्यान दें'
      },
      {
        id: 'CUST-002',
        customerName: 'सुनील शर्मा',
        phone: '9876512345',
        vehicleNumber: 'UP 16 CD 5678',
        vehicleMake: 'Maruti Suzuki',
        vehicleColor: 'Silver',
        serviceType: 'दैनिक सफाई',
        address: 'Villa 12, ग्रीन वैली, ग्रेटर नोएडा',
        routeSeq: 2,
        status: 'cleaned',
        cleanedTime: '07:15 AM'
      },
      {
        id: 'CUST-003',
        jobId: 'JOB-CW-101',
        name: 'दीपक वर्मा',
        customerName: 'दीपक वर्मा',
        phone: '9811223344',
        vehicleNumber: 'DL 03 XY 9999',
        vehicleMake: 'Mahindra',
        vehicleColor: 'Napoli Black',
        serviceCategory: 'car_washing',
        serviceType: 'एक्सटीरियर फोम वॉश',
        category: 'car_washing',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 25 * 60000).toISOString(),
        address: 'A-108, गौर सिटी 2, ग्रेटर नोएडा वेस्ट',
        beforePhotos: ['https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&q=80']
      }
    ];
    state.customers = state.currentStaffFilteredList;
    state.currentCategory = 'daily_clean';

    var gate = document.getElementById('staffAuthGate');
    var content = document.getElementById('staffContent');
    if (gate) gate.style.display = 'none';
    if (content) content.style.display = 'block';

    if (typeof renderCustomerCards === 'function') {
      renderCustomerCards(state.currentStaffFilteredList);
    }
    if (typeof updateInlineRouteProgress === 'function') {
      updateInlineRouteProgress(1, 2);
    }
  `);
  await wait(500);

  // Capture Feed across mobile widths
  const feedViewports = [
    { name: 'feed_320px.png', w: 320, h: 640 },
    { name: 'feed_360px.png', w: 360, h: 740 },
    { name: 'feed_390px.png', w: 390, h: 844 },
    { name: 'feed_412px.png', w: 412, h: 892 },
    { name: 'feed_768px.png', w: 768, h: 1024 },
    { name: 'feed_1280px.png', w: 1280, h: 800 }
  ];

  for (const vp of feedViewports) {
    await client.setViewport(vp.w, vp.h);
    await wait(250);
    await client.screenshot(path.join(OUT_DIR, vp.name));
  }

  // 3. Dark Mode Feed at 390px
  console.log('--- Capturing Dark Theme Feed ---');
  await client.eval(`
    if (typeof setTheme === 'function') setTheme('dark');
  `);
  await wait(300);
  await client.setViewport(390, 844);
  await client.screenshot(path.join(OUT_DIR, 'feed_390px_dark.png'));

  // Switch back to light theme
  await client.eval(`
    if (typeof setTheme === 'function') setTheme('light');
  `);
  await wait(200);

  // 4. Car Wash Category Tab
  console.log('--- Capturing Car Wash Tab ---');
  await client.eval(`
    state.currentCategory = 'car_wash';
    var jobsPanel = document.getElementById('staffJobsPanel');
    var setPanel = document.getElementById('staffSettingsPanel');
    if (jobsPanel) jobsPanel.style.display = 'block';
    if (setPanel) setPanel.style.display = 'none';
    if (typeof renderCustomerCards === 'function') {
      renderCustomerCards(state.currentStaffFilteredList.filter(c => c.category === 'car_wash' || c.serviceCategory === 'car_washing'));
    }
  `);
  await wait(300);
  await client.screenshot(path.join(OUT_DIR, 'car_wash_390px.png'));

  // 5. Settings Screen
  console.log('--- Capturing Settings Screen ---');
  await client.eval(`
    var jobsPanel = document.getElementById('staffJobsPanel');
    var setPanel = document.getElementById('staffSettingsPanel');
    if (jobsPanel) jobsPanel.style.display = 'none';
    if (setPanel) setPanel.style.display = 'block';
    if (typeof updateSettingsPrefButtons === 'function') updateSettingsPrefButtons();
  `);
  await wait(300);
  await client.screenshot(path.join(OUT_DIR, 'settings_390px.png'));

  // Settings in Dark Mode
  await client.eval(`
    if (typeof setTheme === 'function') setTheme('dark');
  `);
  await wait(300);
  await client.screenshot(path.join(OUT_DIR, 'settings_390px_dark.png'));

  // Switch back to light theme
  await client.eval(`
    if (typeof setTheme === 'function') setTheme('light');
    var jobsPanel = document.getElementById('staffJobsPanel');
    var setPanel = document.getElementById('staffSettingsPanel');
    if (jobsPanel) jobsPanel.style.display = 'block';
    if (setPanel) setPanel.style.display = 'none';
  `);
  await wait(200);

  // 6. Location Bottom Sheet Modal
  console.log('--- Capturing Location Bottom Sheet ---');
  await client.eval(`
    var m = document.getElementById('addressViewModal');
    if (m) {
      var nameEl = document.getElementById('addrModalCustName');
      if (nameEl) nameEl.textContent = 'अमित कुमार (Amit Kumar)';
      var addrEl = document.getElementById('addrModalPrimary');
      if (addrEl) addrEl.textContent = 'B-402, रॉयल रेजीडेंसी, सेक्टर 62, नोएडा';
      var card1 = document.getElementById('addrModalPrimaryCard');
      if (card1) card1.style.display = 'block';
      var card2 = document.getElementById('addrModalSecondaryCard');
      if (card2) card2.style.display = 'none';
      m.style.display = 'flex';
    }
  `);
  await wait(300);
  await client.screenshot(path.join(OUT_DIR, 'location_sheet_390px.png'));
  await client.eval(`
    var m = document.getElementById('addressViewModal');
    if (m) m.style.display = 'none';
  `);

  // 7. Special Job Completion Dialog
  console.log('--- Capturing Job Completion Dialog ---');
  await client.eval(`
    if (typeof openCompleteSpecialJobModal === 'function') {
      openCompleteSpecialJobModal('JOB-CW-101');
    }
  `);
  await wait(300);
  await client.screenshot(path.join(OUT_DIR, 'completion_dialog_390px.png'));
  await client.eval(`
    var m = document.getElementById('completeSpecialJobModal');
    if (m) m.style.display = 'none';
  `);

  // 8. Photo Lightbox
  console.log('--- Capturing Photo Lightbox ---');
  await client.eval(`
    if (typeof openImageModal === 'function') {
      openImageModal('https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80', 'अमित कुमार', 'गाड़ी का फोटो');
    }
  `);
  await wait(400);
  await client.screenshot(path.join(OUT_DIR, 'photo_lightbox_390px.png'));
  await client.eval(`
    var m = document.getElementById('imageModal');
    if (m) m.style.display = 'none';
  `);

  console.log('--- ALL QA SCREENSHOTS CAPTURED SUCCESSFULLY ---');

  client.close();
  chromeProc.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal screenshot error:', err);
  process.exit(1);
});
