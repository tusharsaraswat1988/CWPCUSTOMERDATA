const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;
const BASE_URL = 'http://localhost:3005';
const TARGET_URL = `${BASE_URL}/admin`;
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'p0_stabilization');

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
          reject(e);
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
    this.consoleErrors = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          const errText = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
          this.consoleErrors.push(errText);
        }
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
    console.log(`[Screenshot Saved]: ${filename} (${buffer.length} bytes)`);
    return filePath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('--- Step 1: Getting Admin Auth Session Token ---');
  let adminPass = '';
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = envContent.match(/ADMIN_PASSWORD=([^\r\n]+)/);
    if (m) adminPass = m[1].trim();
  } catch (e) {}

  const authRes = await postJson(`${BASE_URL}/api`, {
    action: 'verifyAdminPassword',
    password: adminPass
  });
  console.log('Auth response:', authRes.success ? 'Admin authenticated' : authRes);
  const adminToken = authRes.token || '';

  console.log('\n--- Step 2: Spawning Headless Chrome with Fresh Temp Profile ---');
  const tempProfile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'cwp_qa_' + Date.now());
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + tempProfile
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let connected = false;
  for (let i = 0; i < 25; i++) {
    await wait(400);
    try {
      await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      connected = true;
      break;
    } catch (e) {}
  }

  if (!connected) {
    chromeProc.kill();
    throw new Error('Could not connect to Chrome debugging port.');
  }

  console.log('Connected to Chrome. Getting target list...');
  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  let target = targets.find(t => t.type === 'page');
  if (!target) {
    target = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(TARGET_URL)}`);
  }

  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();
  console.log('CDP Client connected.');

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await client.setViewport(1440, 900);

  console.log('\n--- Step 3: Navigating to Admin Portal & Setting Auth ---');
  await client.send('Page.navigate', { url: TARGET_URL });
  await wait(2500);

  await client.eval(`
    (function() {
      sessionStorage.setItem('cwp_admin_token', ${JSON.stringify(adminToken)});
      localStorage.setItem('cwp_admin_token', ${JSON.stringify(adminToken)});
      if (typeof checkAdminAuthStatus === 'function') {
        checkAdminAuthStatus();
      }
    })()
  `);
  await wait(1500);

  const authState = await client.eval(`
    ({
      isAuth: typeof isUserAdminAuthenticated === 'function' ? isUserAdminAuthenticated() : false,
      unlockedVisible: document.getElementById('adminUnlockedContent') ? !document.getElementById('adminUnlockedContent').classList.contains('is-hidden') : false,
      openSellPackageAvailable: typeof window.openSellPackageModal === 'function',
      openStartSpecialAvailable: typeof window.openStartSpecialJobModal === 'function'
    })
  `);
  console.log('Admin Auth State in Browser:', authState);

  // Set up test fixture data
  await client.eval(`
    (function() {
      window.testFixtureCustomer = {
        id: 'cust_qa_test_01',
        customerId: 'cust_qa_test_01',
        customerName: 'Rajesh Kumar',
        name: 'Rajesh Kumar',
        phone: '9876543210',
        customerNumber: '9876543210',
        mobileNumber: '9876543210',
        address: 'Sigra, Varanasi, UP',
        vehicles: [{ id: 'veh_01', plateNumber: 'UP 65 AB 1234', make: 'Hyundai Creta', seaterType: '5_seater' }],
        locations: [{ id: 'loc_01', name: 'Home Sigra', address: 'Sigra, Varanasi' }]
      };
      window.testFixturePackage = {
        id: 'pkg_qa_test_01',
        package_id: 'pkg_qa_test_01',
        name: 'Premium Car Wash (5 Pack)',
        packageName: 'Premium Car Wash (5 Pack)',
        customer_id: 'cust_qa_test_01',
        customer_name: 'Rajesh Kumar',
        customerName: 'Rajesh Kumar',
        category: 'car_wash',
        vehicle_id: 'veh_01',
        location_id: 'loc_01',
        total_quantity: 5,
        totalQuantity: 5,
        remaining_quantity: 3,
        remainingQuantity: 3,
        redeemed_quantity: 2,
        redeemedQuantity: 2,
        price: 1500,
        status: 'active',
        created_at: new Date().toISOString()
      };
      window.testFixtureJob = {
        id: 'job_qa_test_01',
        jobId: 'job_qa_test_01',
        customerId: 'cust_qa_test_01',
        customerName: 'Rajesh Kumar',
        name: 'Rajesh Kumar',
        phone: '9876543210',
        address: 'Sigra, Varanasi, UP',
        serviceCategory: 'car_wash',
        serviceType: 'Premium Detailing & Foam Wash',
        status: 'assigned',
        staffId: 'staff_qa_01',
        staffName: 'Vikas Patel (Senior Detailer)',
        vehicle: 'UP 65 AB 1234 (Hyundai Creta)',
        scheduledDate: '2026-11-25',
        timeSlot: '10:00 AM - 12:00 PM',
        specialInstructions: 'Park car under shade, careful with side mirror sensors'
      };
      if (typeof cachedRecords !== 'undefined' && Array.isArray(cachedRecords)) {
        if (!cachedRecords.find(r => r.id === window.testFixtureCustomer.id)) {
          cachedRecords.push(window.testFixtureCustomer);
        }
      }
      if (typeof state !== 'undefined') {
        if (!state.customers) state.customers = [];
        state.customers.push(window.testFixtureJob);
        if (!state.adminRecords) state.adminRecords = [];
        state.adminRecords.push(window.testFixtureCustomer);
        if (!state.customerPackages) state.customerPackages = [];
        state.customerPackages.push(window.testFixturePackage);
      }
      if (!window.customerPackagesCache) window.customerPackagesCache = {};
      window.customerPackagesCache['pkg_qa_test_01'] = window.testFixturePackage;
    })()
  `);

  console.log('\n--- Step 4: Testing & Capturing All 11 Modals ---');

  const modalsToTest = [
    {
      id: 'assignSpecialJobModal',
      name: '01_assign_special_job_modal.png',
      open: `openAssignSpecialJobModal('cust_qa_test_01')`,
      close: `closeAssignSpecialJobModal()`
    },
    {
      id: 'reassignJobModal',
      name: '02_reassign_job_modal.png',
      open: `openReassignJobModal('job_qa_test_01')`,
      close: `closeReassignJobModal()`
    },
    {
      id: 'startSpecialJobModal',
      name: '03_start_special_job_modal.png',
      open: `openStartSpecialJobModal(window.testFixtureJob)`,
      close: `closeStartSpecialJobModal()`
    },
    {
      id: 'completeSpecialJobModal',
      name: '04_complete_special_job_modal.png',
      open: `openCompleteSpecialJobModal(window.testFixtureJob)`,
      close: `closeCompleteSpecialJobModal()`
    },
    {
      id: 'cancelSpecialJobModal',
      name: '05_cancel_special_job_modal.png',
      open: `openCancelSpecialJobModal(window.testFixtureJob)`,
      close: `closeCancelSpecialJobModal()`
    },
    {
      id: 'designationManagementModal',
      name: '06_designation_management_modal.png',
      open: `openDesignationManagementModal()`,
      close: `closeDesignationManagementModal()`
    },
    {
      id: 'sellPackageModal',
      name: '07_sell_package_modal.png',
      open: `openSellPackageModal(window.testFixtureCustomer)`,
      close: `closeSellPackageModal()`
    },
    {
      id: 'redeemPackageModal',
      name: '08_redeem_package_modal.png',
      open: `openRedeemPackageModal(window.testFixturePackage)`,
      close: `closeRedeemPackageModal()`
    },
    {
      id: 'packageHistoryModal',
      name: '09_package_history_modal.png',
      open: `openPackageHistoryModal(window.testFixturePackage)`,
      close: `closePackageHistoryModal()`
    },
    {
      id: 'createBookingModal',
      name: '10_create_booking_modal.png',
      open: `openCreateBookingModal(window.testFixtureCustomer)`,
      close: `closeCreateBookingModal()`
    },
    {
      id: 'staffHierarchyModal',
      name: '11_staff_hierarchy_modal.png',
      open: `openStaffHierarchyView()`,
      close: `closeStaffHierarchyModal()`
    }
  ];

  const modalVerificationResults = [];

  for (const m of modalsToTest) {
    console.log(`\nTesting Modal: ${m.id}`);

    const parentCheck = await client.eval(`
      (function() {
        var el = document.getElementById(${JSON.stringify(m.id)});
        return {
          exists: !!el,
          parentTagName: el ? el.parentElement.tagName : null,
          isBodyChild: el ? el.parentElement === document.body : false
        };
      })()
    `);

    // Open modal
    await client.eval(m.open);
    await wait(400);

    const openedState = await client.eval(`
      (function() {
        var el = document.getElementById(${JSON.stringify(m.id)});
        if (!el) return { error: 'Element not found' };
        var cs = window.getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        return {
          display: cs.display,
          visibility: cs.visibility,
          zIndex: cs.zIndex,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          isVisible: cs.display !== 'none' && cs.visibility !== 'hidden' && rect.height > 0
        };
      })()
    `);
    console.log(`- Opened state:`, openedState);

    await client.screenshot(m.name);

    // Close modal
    await client.eval(m.close);
    await wait(300);

    const closedState = await client.eval(`
      (function() {
        var el = document.getElementById(${JSON.stringify(m.id)});
        if (!el) return { error: 'Element not found' };
        var cs = window.getComputedStyle(el);
        return {
          display: cs.display,
          isClosed: cs.display === 'none'
        };
      })()
    `);
    console.log(`- Closed state:`, closedState);

    modalVerificationResults.push({
      id: m.id,
      parentIsBody: parentCheck.isBodyChild,
      openedSuccessfully: openedState.isVisible,
      closedSuccessfully: closedState.isClosed,
      zIndex: openedState.zIndex
    });
  }

  console.log('\n--- Step 5: Testing Special Jobs Ledger with Real Fixture Data ---');
  await client.eval(`
    (function() {
      if (typeof switchAdminTab === 'function') switchAdminTab('jobAssignment');
      if (typeof switchJobAssignSubTab === 'function') switchJobAssignSubTab('special');
    })()
  `);
  await wait(600);

  const ledgerResult = await client.eval(`
    (function() {
      var fixtureJobs = [
        {
          id: 'job_001',
          customerName: 'Rajesh Kumar (Sigra)',
          serviceCategory: 'Car Washing & Wax',
          staffName: 'Vikas Patel',
          vehicle: 'UP 65 AB 1234 (Creta)',
          scheduledDate: '2026-11-25',
          timeSlot: '10:00 AM',
          status: 'assigned',
          notes: 'Customer requested extra rim cleaning'
        },
        {
          id: 'job_002',
          customerName: 'Amit Sharma (Lanka)',
          serviceCategory: 'Solar Panel Deep Clean (12 Panels)',
          staffName: 'Rahul Verma',
          vehicle: 'Rooftop 5kW',
          scheduledDate: '2026-11-25',
          timeSlot: '02:00 PM',
          status: 'in_progress',
          notes: 'Water connection available on terrace'
        },
        {
          id: 'job_003',
          customerName: 'Priya Singh (Cantt)',
          serviceCategory: 'Interior Foam & Detailing',
          staffName: 'Unassigned',
          vehicle: 'UP 65 CD 5678 (Kia Seltos)',
          scheduledDate: '2026-11-26',
          timeSlot: '11:00 AM',
          status: 'pending',
          notes: 'Call before arriving'
        }
      ];
      window.adminSpecialJobsCache = fixtureJobs;
      if (window.adminSpecialJobsState) window.adminSpecialJobsState.allJobs = fixtureJobs;
      if (window.adminSpecialState) window.adminSpecialState.allJobs = fixtureJobs;
      if (typeof renderJobAssignmentsLedger === 'function') renderJobAssignmentsLedger();
      var tbody = document.getElementById('jobAssignmentsTableBody');
      return {
        renderedHtml: tbody ? tbody.innerHTML.slice(0, 500) : '',
        hasGenericCustomer: tbody ? (tbody.innerHTML.includes('>Customer<') || tbody.textContent.includes('Customer |')) : false,
        hasGenericStaff: tbody ? (tbody.innerHTML.includes('>Staff<') || tbody.textContent.includes('| Staff')) : false,
        hasGenericJob: tbody ? (tbody.innerHTML.includes('>Job<') || tbody.textContent.includes('| Job |')) : false,
        hasRajesh: tbody ? tbody.textContent.includes('Rajesh Kumar') : false,
        hasAmit: tbody ? tbody.textContent.includes('Amit Sharma') : false,
        hasVikas: tbody ? tbody.textContent.includes('Vikas Patel') : false
      };
    })()
  `);
  console.log('Ledger Render Evaluation:', ledgerResult);
  await client.screenshot('13_special_jobs_ledger_with_fixture_data.png');

  console.log('\n--- Step 6: Testing Reassign Workflow Triggered from Ledger ---');
  await client.eval(`
    (function() {
      openReassignJobModal('job_001');
    })()
  `);
  await wait(400);
  await client.screenshot('14_reassign_workflow_from_ledger.png');
  await client.eval(`closeReassignJobModal()`);
  await wait(300);

  console.log('\n--- Step 7: Testing Packages Tab View & Sell Package Form ---');
  await client.eval(`
    (function() {
      openSellPackageModal(window.testFixtureCustomer);
      var nameEl = document.getElementById('sellPkgName');
      if (nameEl) nameEl.value = 'Ceramic Maintenance (3 Pack)';
      var priceEl = document.getElementById('sellPkgPrice');
      if (priceEl) priceEl.value = '2400';
      var qtyEl = document.getElementById('sellPkgTotalQuantity');
      if (qtyEl) qtyEl.value = '3';
    })()
  `);
  await wait(400);
  await client.screenshot('12_packages_tab_view.png');
  await client.eval(`closeSellPackageModal()`);
  await wait(300);

  console.log('\n--- Step 8: Multi-Viewport Responsive Verifications ---');

  // 1. Tablet: 768px
  console.log('Capturing Tablet (768px)...');
  await client.setViewport(768, 1024);
  await client.eval(`openSellPackageModal(window.testFixtureCustomer)`);
  await wait(400);
  await client.screenshot('15_sell_package_modal_tablet_768px.png');
  await client.eval(`closeSellPackageModal()`);
  await wait(300);

  await client.screenshot('16_special_jobs_ledger_tablet_768px.png');

  // 2. Mobile: 390px
  console.log('Capturing Mobile (390px)...');
  await client.setViewport(390, 844);
  await client.eval(`openSellPackageModal(window.testFixtureCustomer)`);
  await wait(400);
  await client.screenshot('17_sell_package_modal_mobile_390px.png');
  await client.eval(`closeSellPackageModal()`);
  await wait(300);

  await client.screenshot('18_special_jobs_ledger_mobile_390px.png');

  // 3. Narrow Mobile: 360px
  console.log('Capturing Narrow Mobile (360px)...');
  await client.setViewport(360, 800);
  await client.eval(`openCreateBookingModal(window.testFixtureCustomer)`);
  await wait(400);
  await client.screenshot('19_create_booking_modal_narrow_mobile_360px.png');
  await client.eval(`closeCreateBookingModal()`);
  await wait(300);

  // Close browser and exit
  client.close();
  chromeProc.kill();

  console.log('\n======================================================');
  console.log('EVIDENCE CAPTURE & VERIFICATION COMPLETE');
  console.log('======================================================');
  console.log('Modal Results Summary:');
  console.table(modalVerificationResults);
  console.log('Special Jobs Ledger Generic Label Check:', {
    hasGenericCustomer: ledgerResult.hasGenericCustomer,
    hasGenericStaff: ledgerResult.hasGenericStaff,
    hasGenericJob: ledgerResult.hasGenericJob,
    hasRealCustomerData: ledgerResult.hasRajesh && ledgerResult.hasAmit && ledgerResult.hasVikas
  });

  const allModalsPass = modalVerificationResults.every(r => r.parentIsBody && r.openedSuccessfully && r.closedSuccessfully);
  const ledgerPass = !ledgerResult.hasGenericCustomer && !ledgerResult.hasGenericStaff && !ledgerResult.hasGenericJob && ledgerResult.hasRajesh;

  if (allModalsPass && ledgerPass) {
    console.log('\n✔ ALL 11 MODALS AND LEDGER CHECKS PASSED PERFECTLY!');
  } else {
    console.error('\n❌ SOME VERIFICATIONS FAILED');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
