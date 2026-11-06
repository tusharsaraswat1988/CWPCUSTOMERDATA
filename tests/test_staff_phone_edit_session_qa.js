/**
 * =========================================================================
 * Staff Mobile Number Edit & Active Session Invalidation QA Test Suite
 * Verifies the fix for:
 * - Admin editing staff mobile number immediately revokes all active sessions
 * - Old session tokens cannot continue accessing getStaffData
 * - Old mobile number is strictly rejected during login (no staffId fallback)
 * - New mobile number logs in successfully and gains access
 * - Frontend state cleanup for unauthorized responses
 * =========================================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING STAFF PHONE EDIT & SESSION INVALIDATION QA TESTS');
console.log('===============================================================');

const TEST_PORT = 3072;
const MOCK_GAS_PORT = 3092;
const TEST_SERVICE_KEY = 'cwp_test_secret_service_key_phone_edit';

const tempFixturePath = path.join(__dirname, 'temp_test_data_phone_edit_' + process.pid + '_' + Date.now() + '.json');
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
    customerId: 'CUST-001',
    customerName: 'Rahul Verma',
    customerNumber: '9876543210',
    address: 'Sector 14, Gurgaon',
    googleMapsUrl: 'https://maps.google.com/?q=Sector+14+Gurgaon',
    photoUrl: 'https://example.com/p1.jpg',
    vehicle: 'Swift Dzire (HR 26 AB 1234)',
    serviceCategory: 'Daily Car Cleaning',
    packageType: 'Daily Clean Regular',
    staffId: 'STF01',
    staffName: 'Chandan Soni',
    active: true
  }
];

const fixtureData = {
  adminPasswordHash: cwp.hashPasswordScrypt('TestAdminPass@2026'),
  staffList: initialStaffList,
  customers: initialCustomers,
  staffSequences: []
};

fs.writeFileSync(tempFixturePath, JSON.stringify(fixtureData, null, 2), 'utf8');

cwp.setDataFile(tempFixturePath);
cwp.loadLocalData();

// Mock GAS server
const mockGasServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, mocked: true, action: payload.action }));
  });
});

function makeRequest(method, urlPath, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const postData = bodyObj ? JSON.stringify(bodyObj) : '';
    const reqHeaders = Object.assign({}, headers || {});
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  try {
    await new Promise((resolve) => mockGasServer.listen(MOCK_GAS_PORT, '127.0.0.1', resolve));
    await new Promise((resolve) => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));

    // Step 1: Admin Login
    const adminLoginRes = await makeRequest('POST', '/api', {}, {
      action: 'verifyAdminPassword',
      password: 'TestAdminPass@2026'
    });
    assert.strictEqual(adminLoginRes.statusCode, 200, 'Admin login must succeed');
    const adminToken = adminLoginRes.body.token;
    assert.ok(adminToken, 'Admin token must be issued');
    console.log('✅ PASS 1: Admin authenticated successfully.');

    // Step 2: Staff STF01 Logs in with original phone (9919856161)
    const staffLoginOldRes = await makeRequest('POST', '/api', {}, {
      action: 'verifyStaffPin',
      phone: '9919856161',
      pin: '123456'
    });
    assert.strictEqual(staffLoginOldRes.statusCode, 200, 'Staff login with original phone must succeed');
    const oldStaffToken = staffLoginOldRes.body.token;
    assert.ok(oldStaffToken, 'Staff session token must be issued');
    assert.strictEqual(staffLoginOldRes.body.staffId, 'STF01');
    console.log('✅ PASS 2: Staff STF01 logged in with original phone (9919856161), token: ' + oldStaffToken.substring(0, 16) + '...');

    // Step 3: Staff verifies active session by fetching customer data
    const staffDataInitial = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + oldStaffToken
    }, {
      action: 'getStaffData',
      staffId: 'STF01'
    });
    assert.strictEqual(staffDataInitial.statusCode, 200, 'Staff getStaffData must succeed with active session');
    assert.ok(Array.isArray(staffDataInitial.body.dailyCarCleaning), 'Daily clean list must be returned');
    assert.strictEqual(staffDataInitial.body.dailyCarCleaning.length, 1);
    console.log('✅ PASS 3: Staff portal actively running and customer data accessible with original session.');

    // Step 4: Admin edits staff STF01 mobile number to 9876543210
    const newPhone = '9876543210';
    const editStaffRes = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + adminToken
    }, {
      action: 'saveStaffMember',
      staffData: {
        id: 'STF01',
        name: 'Chandan Soni',
        phone: newPhone,
        pin: '[PROTECTED]',
        active: true
      }
    });
    assert.strictEqual(editStaffRes.statusCode, 200, 'Admin edit of staff phone must return HTTP 200');
    assert.strictEqual(editStaffRes.body.staff.phone, newPhone, 'Staff phone must be updated to new number');
    console.log('✅ PASS 4: Admin updated STF01 mobile number from 9919856161 to 9876543210.');

    // Step 5: CRITICAL BUG CHECK - Verify old session is REVOKED
    // When the staff portal refreshes or polls with oldStaffToken, it MUST get HTTP 401 Unauthorized
    const oldSessionAttempt = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + oldStaffToken
    }, {
      action: 'getStaffData',
      staffId: 'STF01'
    });
    assert.strictEqual(oldSessionAttempt.statusCode, 401, 'Old session token MUST be rejected with HTTP 401 after phone edit');
    assert.strictEqual(oldSessionAttempt.body.unauthorized, true, 'Response must indicate unauthorized: true');
    console.log('✅ PASS 5: Old session IMMEDIATELY rejected with HTTP 401 Unauthorized (Cannot keep running on refresh).');

    // Step 6: CRITICAL BUG CHECK - Verify login with OLD mobile number is REJECTED
    // Even if client accidentally transmits cached staffId: 'STF01', old phone must NEVER succeed!
    const oldPhoneLoginAttempt = await makeRequest('POST', '/api', {}, {
      action: 'verifyStaffPin',
      phone: '9919856161',
      pin: '123456',
      staffId: 'STF01' // Simulating cached activeStaffId in client
    });
    assert.strictEqual(oldPhoneLoginAttempt.statusCode, 404, 'Login with old phone number must be rejected with HTTP 404');
    assert.strictEqual(oldPhoneLoginAttempt.body.success, false, 'Old phone login must fail');
    console.log('✅ PASS 6: Login attempt with old phone number (9919856161) strictly rejected with HTTP 404 (No fallback to staffId).');

    // Step 7: Verify login with NEW mobile number (9876543210) SUCCEEDS
    const newPhoneLoginRes = await makeRequest('POST', '/api', {}, {
      action: 'verifyStaffPin',
      phone: newPhone,
      pin: '123456'
    });
    assert.strictEqual(newPhoneLoginRes.statusCode, 200, 'Login with new phone number must succeed');
    assert.ok(newPhoneLoginRes.body.success, 'New phone login must return success: true');
    const newStaffToken = newPhoneLoginRes.body.token;
    assert.ok(newStaffToken, 'New session token must be issued');
    assert.notStrictEqual(newStaffToken, oldStaffToken, 'New session token must differ from old token');
    console.log('✅ PASS 7: Login with new phone number (9876543210) succeeded with fresh token: ' + newStaffToken.substring(0, 16) + '...');

    // Step 8: Verify new session has full access to staff portal
    const newSessionData = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + newStaffToken
    }, {
      action: 'getStaffData',
      staffId: 'STF01'
    });
    assert.strictEqual(newSessionData.statusCode, 200, 'New session must successfully access customer data');
    assert.strictEqual(newSessionData.body.dailyCarCleaning.length, 1);
    console.log('✅ PASS 8: New session active and customer data accessible.');

    // Step 9: Verify staff deactivation revokes active new session
    const deactivateRes = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + adminToken
    }, {
      action: 'toggleStaffActive',
      staffId: 'STF01',
      active: false
    });
    assert.strictEqual(deactivateRes.statusCode, 200);

    const postDeactivateAttempt = await makeRequest('POST', '/api', {
      'Authorization': 'Bearer ' + newStaffToken
    }, {
      action: 'getStaffData',
      staffId: 'STF01'
    });
    assert.strictEqual(postDeactivateAttempt.statusCode, 401, 'Deactivated staff session must be rejected with HTTP 401');
    console.log('✅ PASS 9: Staff deactivation immediately revokes active session (HTTP 401).');

    // Step 10: Test Isolation verification
    if (fs.existsSync(tempFixturePath)) {
      fs.unlinkSync(tempFixturePath);
    }
    const realDataAfter = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
    assert.strictEqual(realDataBefore, realDataAfter, 'Production local_data.json must never be mutated during test run');
    console.log('✅ PASS 10: Production local_data.json strictly untouched.');

    console.log('===============================================================');
    console.log('🎉 ALL 10 STAFF PHONE EDIT & SESSION INVALIDATION TESTS PASSED!');
    console.log('===============================================================');

  } finally {
    mockGasServer.close();
    cwp.server.close();
  }
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  if (fs.existsSync(tempFixturePath)) fs.unlinkSync(tempFixturePath);
  mockGasServer.close();
  cwp.server.close();
  process.exit(1);
});
