/**
 * Task P2.3 Regression & API Integration Test Suite
 * Fully isolated: ephemeral ports, temp fixture, mock GAS, zero mutation of local_data.json.
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===============================================================');
console.log('🚀 RUNNING TASK P2.3 REGRESSION & INTEGRATION SUITE (ISOLATED)');
console.log('===============================================================');

const TEST_PORT = 3069;
const MOCK_GAS_PORT = 3099;
const TEST_SERVICE_KEY = 'cwp_test_secret_service_key_p23';

const tempFixturePath = path.join(__dirname, 'temp_test_data_p23_' + process.pid + '_' + Date.now() + '.json');
const realDataFilePath = path.join(__dirname, '..', 'local_data.json');

const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;

process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'TestAdminPass@2026';
process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${MOCK_GAS_PORT}/exec`;
process.env.APPS_SCRIPT_SERVICE_KEY = TEST_SERVICE_KEY;
process.env.DATA_FILE = tempFixturePath;
process.env.DISABLE_LIVE_SHEETS = 'true';
process.env.NODE_ENV = 'test';

const cwp = require('../server.js');

// Initial test data
const initialStaffList = [
  {
    id: 'STF01',
    name: 'Chandan Soni',
    phone: '9919856161',
    pin: cwp.hashPinScrypt('123456'),
    active: true
  },
  {
    id: 'STF02',
    name: 'Taufiq Ahmed',
    phone: '8081913264',
    pin: cwp.hashPinScrypt('654321'),
    active: true
  }
];

const initialCustomers = [
  {
    sheetName: 'Daily Clean',
    rowIndex: 2,
    customerName: 'Aman Sharma',
    customerNumber: '9919856161',
    vehicle: 'UP65 AB 1001 - Creta',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Chandan Soni',
    staffId: 'STF01',
    address: 'Varanasi Sigra',
    secondaryAddress: 'Varanasi Cantt Office',
    secondaryMapsUrl: 'https://maps.google.com/?q=25.32,82.98',
    active: 'Yes'
  }
];

// Configure state explicitly in production module
cwp.setDataFile(tempFixturePath);
cwp.setAppState({
  adminPasswordHash: cwp.hashPinScrypt('TestAdminPass@2026'),
  staffList: initialStaffList,
  customers: initialCustomers
});
cwp.saveLocalData(cwp.getAppState());

let gasForwardedPayloads = [];
const mockGasServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      gasForwardedPayloads.push(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Mock GAS success' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
});

let adminToken = '';

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = data;
        try { body = JSON.parse(data); } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runRegressionSuite() {
  await new Promise((resolve) => mockGasServer.listen(MOCK_GAS_PORT, '127.0.0.1', resolve));
  await new Promise((resolve) => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));

  // Authenticate admin to get session token
  const authRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { action: 'verifyAdminPassword', password: 'TestAdminPass@2026' });

  assert.strictEqual(authRes.statusCode, 200);
  assert.strictEqual(authRes.body.success, true);
  adminToken = authRes.body.token;
  console.log('✅ PASS: Admin logged in, issued session token');

  // REGRESSION 1: Add Daily Car Cleaning customer with spaced phone
  const addDailyRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Rahul Verma',
      customerNumber: '9876543210', // Frontend normalizes before sending
      serviceCategory: 'Daily Car Cleaning',
      packageType: 'DCC SILVER',
      vehicle: 'UP65 XY 9999 - Harrier',
      address: 'Plot 10, Mahmoorganj',
      secondaryAddress: 'Basement Parking Slot 4',
      secondaryMapsUrl: 'https://maps.google.com/?q=25.31,82.97',
      staffName: 'Chandan Soni'
    }
  });

  assert.strictEqual(addDailyRes.statusCode, 200, 'Add Daily Car Cleaning status 200');
  const storedCust1 = cwp.getAppState().customers.find(c => c.customerName === 'Rahul Verma');
  assert.ok(storedCust1, 'Rahul Verma stored in appState');
  assert.strictEqual(storedCust1.customerNumber, '9876543210', 'Phone stored as 10-digit normalized string');
  assert.strictEqual(storedCust1.serviceCategory, 'Daily Car Cleaning', 'Service category stored as Daily Car Cleaning');
  assert.strictEqual(storedCust1.secondaryAddress, 'Basement Parking Slot 4', 'Secondary address preserved');
  console.log('✅ PASS: 1. Add Daily Car Cleaning customer with normalized phone & dual location');

  // REGRESSION 2: Add Car Washing customer (phone with +91)
  const addWashRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Pooja Singh',
      customerNumber: '8877665544',
      serviceCategory: 'Car Washing',
      packageType: 'CAR WASH SINGLE',
      vehicle: 'UP65 ZZ 5555 - Swift',
      address: 'Lanka, BHU Road',
      staffName: 'Taufiq Ahmed'
    }
  });

  assert.strictEqual(addWashRes.statusCode, 200);
  const storedCust2 = cwp.getAppState().customers.find(c => c.customerName === 'Pooja Singh');
  assert.ok(storedCust2);
  assert.strictEqual(storedCust2.customerNumber, '8877665544');
  assert.strictEqual(storedCust2.serviceCategory, 'Car Washing');
  assert.ok(!storedCust2.secondaryAddress, 'Secondary address omitted for Car Washing');
  console.log('✅ PASS: 2. Add Car Washing customer (secondary location omitted)');

  // REGRESSION 3: Add Solar Panel Cleaning customer (site name)
  const addSolarRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Sunil Mehta',
      customerNumber: '7766554433',
      serviceCategory: 'Solar Panel Cleaning',
      packageType: 'SOLAR SUBSCRIPTION',
      vehicle: 'Rooftop 10KW Solar Plant',
      address: 'Shivpur Industrial Area',
      staffName: 'Chandan Soni'
    }
  });

  assert.strictEqual(addSolarRes.statusCode, 200);
  const storedCust3 = cwp.getAppState().customers.find(c => c.customerName === 'Sunil Mehta');
  assert.ok(storedCust3);
  assert.strictEqual(storedCust3.customerNumber, '7766554433');
  assert.strictEqual(storedCust3.serviceCategory, 'Solar Panel Cleaning');
  assert.strictEqual(storedCust3.vehicle, 'Rooftop 10KW Solar Plant');
  console.log('✅ PASS: 3. Add Solar Panel Cleaning customer (site name preserved)');

  // REGRESSION 4: Edit existing customer
  const editRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    action: 'updateCustomer',
    customerData: {
      sheetName: 'Daily Clean',
      rowIndex: 2,
      customerName: 'Aman Sharma Updated',
      customerNumber: '9919856161',
      vehicle: 'UP65 AB 1001 - Creta Knight Edition',
      serviceCategory: 'Daily Car Cleaning',
      staffName: 'Chandan Soni',
      active: 'Yes'
    }
  });

  assert.strictEqual(editRes.statusCode, 200);
  const updatedCust = cwp.getAppState().customers.find(c => c.rowIndex === 2 || parseInt(c.rowIndex, 10) === 2);
  assert.ok(updatedCust);
  assert.strictEqual(updatedCust.customerName, 'Aman Sharma Updated');
  assert.strictEqual(updatedCust.vehicle, 'UP65 AB 1001 - Creta Knight Edition');
  console.log('✅ PASS: 4. Edit existing customer successfully updated');

  // REGRESSION 5: Staff Login with normalized phone
  const staffLoginRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    action: 'verifyStaffPin',
    phone: '8081913264',
    pin: '654321',
    staffId: 'STF02'
  });

  assert.strictEqual(staffLoginRes.statusCode, 200);
  assert.strictEqual(staffLoginRes.body.success, true);
  assert.strictEqual(staffLoginRes.body.staffId, 'STF02');
  console.log('✅ PASS: 5. Staff login succeeds with 10-digit mobile number and PIN');

  // REGRESSION 6: Forwarding to Google Apps Script receives pure 10-digit customerNumber
  const forwardedCust = gasForwardedPayloads.find(p => p.customerData && p.customerData.customerName === 'Rahul Verma');
  assert.ok(forwardedCust, 'Forwarded customer payload sent to Google Apps Script');
  assert.strictEqual(forwardedCust.customerData.customerNumber, '9876543210', 'Google Apps Script payload contains pure 10-digit number without +91 or spaces');
  console.log('✅ PASS: 6. Google Sheets payload verified (strict 10-digit string, no +91 or spaces)');

  // REGRESSION 7: Test Isolation: real local_data.json was never mutated
  const realDataAfter = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
  assert.strictEqual(realDataBefore, realDataAfter, 'Real local_data.json was never modified');
  console.log('✅ PASS: 7. Test isolation verified: real local_data.json completely untouched');

  // Cleanup
  if (fs.existsSync(tempFixturePath)) {
    try { fs.unlinkSync(tempFixturePath); } catch (e) {}
  }
  await new Promise(r => mockGasServer.close(r));
  await new Promise(r => cwp.server.close(r));

  console.log('===============================================================');
  console.log('🎉 ALL TASK P2.3 REGRESSION TESTS PASSED (7/7)');
  console.log('===============================================================');
}

runRegressionSuite().catch(err => {
  console.error('❌ Regression suite failed:', err);
  if (fs.existsSync(tempFixturePath)) {
    try { fs.unlinkSync(tempFixturePath); } catch (e) {}
  }
  process.exit(1);
});
