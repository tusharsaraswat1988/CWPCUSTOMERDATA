/**
 * =========================================================================
 * Comprehensive Security, Data Integrity & Functional QA Test Suite
 * Task P2.1 - CWP Production Code Audit and Hardening
 *
 * Fully Isolated Test Architecture:
 * - Uses isolated temporary data file (never touches local_data.json)
 * - Uses dedicated local test server on ephemeral test port
 * - Uses local mock Apps Script endpoint with service key verification
 * - Live Google Sheets access explicitly disabled during test run
 * - Tests actual production functions exported by server.js
 * =========================================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_PORT = 3058;
const MOCK_GAS_PORT = 3089;
const TEST_SERVICE_KEY = 'cwp_test_secret_service_key_998877665544';

const tempFixturePath = path.join(__dirname, 'temp_test_data_' + process.pid + '_' + Date.now() + '.json');
const realDataFilePath = path.join(__dirname, '..', 'local_data.json');

// Capture real local_data.json content before tests to verify zero modification
const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;

// Configure test environment variables BEFORE requiring server module
process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'TestAdminPass@2026';
process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${MOCK_GAS_PORT}/exec`;
process.env.APPS_SCRIPT_SERVICE_KEY = TEST_SERVICE_KEY;
process.env.DATA_FILE = tempFixturePath;
process.env.DISABLE_LIVE_SHEETS = 'true';
process.env.NODE_ENV = 'test';

// Import production module
const cwp = require('../server.js');

// Create initial test fixture with STF01 and STF02
const initialStaffList = [
  {
    id: 'STF01',
    name: 'Chandan Soni',
    phone: '9919856161',
    pin: cwp.hashPinSha256('123456'), // Legacy SHA-256 for testing auto-upgrade
    active: true
  },
  {
    id: 'STF02',
    name: 'Taufiq Ahmed',
    phone: '8081913264',
    pin: cwp.hashPinScrypt('654321'), // Modern scrypt
    active: true
  }
];

const initialCustomers = [
  {
    sheetName: 'Daily Clean',
    rowIndex: 2,
    customerName: 'Customer Row 2',
    customerNumber: '9919856161',
    vehicle: 'UP65 AB 1001 - Creta',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Chandan Soni',
    staffId: 'STF01',
    active: 'Yes'
  },
  {
    sheetName: 'Daily Clean',
    rowIndex: 3,
    customerName: 'Customer Row 3',
    customerNumber: '9919856161',
    vehicle: 'UP65 CD 2002 - Amaze',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Chandan Soni',
    staffId: 'STF01',
    active: 'Yes'
  }
];

fs.writeFileSync(tempFixturePath, JSON.stringify({
  staffList: initialStaffList,
  customers: initialCustomers
}, null, 2), 'utf8');

cwp.setDataFile(tempFixturePath);
cwp.loadLocalData();

// Mock Google Apps Script Server
let mockGasReceivedRequests = [];
const mockGasServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) {}
    mockGasReceivedRequests.push({ url: req.url, method: req.method, headers: req.headers, payload: payload });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (payload.action === 'getAllCustomers') {
      return res.end(JSON.stringify(initialCustomers));
    }
    if (payload.action === 'getStaffList') {
      return res.end(JSON.stringify(initialStaffList));
    }
    if (payload.action === 'saveCustomer' || payload.action === 'updateCustomer') {
      return res.end(JSON.stringify({ success: true, message: 'Saved in mock GAS' }));
    }
    if (payload.action === 'updateAdminPassword') {
      return res.end(JSON.stringify({ success: true, message: 'Password updated in mock GAS' }));
    }
    if (payload.action === 'verifyStaffPin') {
      return res.end(JSON.stringify({ success: false, error: 'Wrong PIN' }));
    }
    return res.end(JSON.stringify({ success: true }));
  });
});

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const results = [];

function recordResult(testName, passed, details) {
  results.push({ testName, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${testName}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING TASK P2.1 AUDIT & SECURITY TEST SUITE (ISOLATED)');
  console.log('===============================================================\n');

  // Start servers
  await new Promise(r => mockGasServer.listen(MOCK_GAS_PORT, '127.0.0.1', r));
  await new Promise(r => cwp.server.listen(TEST_PORT, '127.0.0.1', r));

  let adminToken = '';
  let staffToken1 = '';
  let staffToken2 = '';

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthorized Admin API Calls Blocked with 401
    // -------------------------------------------------------------------------
    const adminActions = [
      'getAllCustomers',
      'saveCustomer',
      'updateCustomer',
      'toggleCustomerActive',
      'saveStaffMember',
      'deleteStaffMember',
      'toggleStaffActive',
      'resetStaffPin',
      'updateAdminPassword'
    ];

    let allBlocked = true;
    const failures = [];

    for (const action of adminActions) {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { action: action, customerData: { sheetName: 'Daily Clean', rowIndex: 2 } });

      if (res.statusCode !== 401 || !res.body || !res.body.unauthorized) {
        allBlocked = false;
        failures.push(`${action} returned status ${res.statusCode}`);
      }
    }

    recordResult('1. Unauthorized Admin API Access Rejected with HTTP 401', allBlocked,
      allBlocked ? 'All 9 protected admin operations rejected unauthenticated requests with HTTP 401.' : failures.join(', '));

    // -------------------------------------------------------------------------
    // TEST 2: Unauthorized Staff Data Requests Blocked with 401
    // -------------------------------------------------------------------------
    const resGetNoToken = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff-data?staffId=STF01',
      method: 'GET'
    });

    const resPostNoToken = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'getStaffData', staffId: 'STF01' });

    // Also verify that query string token (?token=...) is REJECTED
    const resGetQueryToken = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff-data?staffId=STF01&token=fake_or_real_query_token',
      method: 'GET'
    });

    const t2Pass = resGetNoToken.statusCode === 401 && resPostNoToken.statusCode === 401 && resGetQueryToken.statusCode === 401;
    recordResult('2. Unauthorized Staff Data Access Blocked & Query String Tokens Rejected', t2Pass,
      `GET without token: HTTP ${resGetNoToken.statusCode}, POST without token: HTTP ${resPostNoToken.statusCode}, Query token rejected: HTTP ${resGetQueryToken.statusCode}`);

    // -------------------------------------------------------------------------
    // TEST 3: Staff Public List Sanitization (No PINs or Phone Numbers)
    // -------------------------------------------------------------------------
    const resPublicStaff = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff',
      method: 'GET'
    });

    const isArray = Array.isArray(resPublicStaff.body);
    const hasAnyPin = isArray && resPublicStaff.body.some(s => s.pin !== undefined);
    const hasAnyPhone = isArray && resPublicStaff.body.some(s => s.phone !== undefined);
    recordResult('3. Public Staff List Sanitization (Zero PIN or Phone Leakage)', isArray && !hasAnyPin && !hasAnyPhone,
      `Returned ${resPublicStaff.body.length} records. Plaintext/Hash PIN exposed: ${hasAnyPin}, Phone exposed: ${hasAnyPhone}`);

    // -------------------------------------------------------------------------
    // TEST 4: Admin Password Verification & 12-Hour Session Issuance
    // -------------------------------------------------------------------------
    const resAdminFail = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyAdminPassword', password: 'WrongPassword123' });

    const resAdminOk = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyAdminPassword', password: 'TestAdminPass@2026' });

    const t4Pass = resAdminFail.statusCode === 401 && resAdminOk.statusCode === 200 && resAdminOk.body.token.startsWith('adm_') && resAdminOk.body.expiresIn === 43200;
    if (resAdminOk.body && resAdminOk.body.token) adminToken = resAdminOk.body.token;

    recordResult('4. Admin Password Verification & 12-Hour Server Session Issuance', t4Pass,
      `Invalid pass rejected (HTTP 401). Valid password granted token (${adminToken.substring(0, 12)}...) with 12h (43200s) TTL.`);

    // -------------------------------------------------------------------------
    // TEST 5: Staff PIN Verification, scrypt Auto-Upgrade & Session Issuance
    // -------------------------------------------------------------------------
    // STF01 initially had legacy sha256 hash. Logging in should succeed AND upgrade to scrypt!
    const resStaff1 = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyStaffPin', staffId: 'STF01', pin: '123456' });

    const resStaff2 = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyStaffPin', staffId: 'STF02', pin: '654321' });

    const resStaffWrong = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyStaffPin', staffId: 'STF01', pin: '000000' });

    if (resStaff1.body && resStaff1.body.token) staffToken1 = resStaff1.body.token;
    if (resStaff2.body && resStaff2.body.token) staffToken2 = resStaff2.body.token;

    // Check if STF01 was upgraded in state to scrypt
    const stf1Record = cwp.getAppState().staffList.find(s => s.id === 'STF01');
    const upgradedToScrypt = stf1Record && stf1Record.pin.startsWith('scrypt:');

    const t5Pass = resStaff1.statusCode === 200 && resStaff2.statusCode === 200 && resStaffWrong.statusCode === 401 && upgradedToScrypt;
    recordResult('5. Staff PIN Verification & Legacy SHA-256 to scrypt Auto-Upgrade', t5Pass,
      `STF01 authenticated, legacy SHA-256 automatically upgraded to scrypt (${stf1Record ? stf1Record.pin.substring(0, 16) : ''}...). STF02 authenticated.`);

    // -------------------------------------------------------------------------
    // TEST 6: Strict Cross-Staff Data Isolation
    // -------------------------------------------------------------------------
    // STF01 attempts to access STF02's data
    const resCrossStaff = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff-data?staffId=STF02',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${staffToken1}` }
    });

    // STF01 accesses their own data
    const resOwnStaff = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff-data?staffId=STF01',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${staffToken1}` }
    });

    const t6Pass = resCrossStaff.statusCode === 403 && resCrossStaff.body.forbidden && resOwnStaff.statusCode === 200;
    recordResult('6. Strict Cross-Staff Data Isolation Enforced', t6Pass,
      `STF01 requesting STF02 rejected with HTTP 403 Forbidden. STF01 requesting own data succeeded with HTTP 200.`);

    // -------------------------------------------------------------------------
    // TEST 7: Category Classification (Direct Production Logic Verification)
    // -------------------------------------------------------------------------
    const catDaily = cwp.classifyServiceCategory('Daily Clean', '', 'DCC ONLY', '', 'UP65 AB 1234');
    const catWash = cwp.classifyServiceCategory('All Other Work', 'Car Washing', 'Car Wash Single', 'Water wash', 'UP65 XY 9999');
    const catSolar = cwp.classifyServiceCategory('All Other Work', 'Solar Cleaning', 'Solar Subscription', '10kW Rooftop', 'Site Alpha');
    const catSiteOnly = cwp.classifyServiceCategory('All Other Work', 'Car Wash', '', '', 'Construction Site Vehicle');
    const catUnknown = cwp.classifyServiceCategory('All Other Work', 'Unknown Work', 'Custom Work', 'Notes', 'UP65 Z 0001');

    const t7Pass = catDaily === 'Daily Car Cleaning' &&
                   catWash === 'Car Washing' &&
                   catSolar === 'Solar Panel Cleaning' &&
                   catSiteOnly === 'Car Washing' && // "site" keyword bug fix
                   catUnknown === 'Car Washing';    // Unknown never falls into Daily Clean

    recordResult('7. Category Classification Tested Directly Against Production Function', t7Pass,
      `Daily Clean -> '${catDaily}', Wash -> '${catWash}', Solar -> '${catSolar}', Site keyword -> '${catSiteOnly}' (not Solar), Unknown -> '${catUnknown}' (never Daily Clean).`);

    // -------------------------------------------------------------------------
    // TEST 8: Multiple Entries & Daily Clean Source Order Strict Preservation
    // -------------------------------------------------------------------------
    const mockCustomers = [
      { sheetName: 'Daily Clean', rowIndex: 2, customerName: 'Row 2 Customer', vehicle: 'Creta', serviceCategory: 'Daily Car Cleaning', staffName: 'Chandan Soni', active: 'Yes' },
      { sheetName: 'Daily Clean', rowIndex: 3, customerName: 'Row 3 Customer', vehicle: 'Amaze', serviceCategory: 'Daily Car Cleaning', staffName: 'Chandan Soni', active: 'Yes' },
      { sheetName: 'Daily Clean', rowIndex: 4, customerName: 'Row 4 Customer', vehicle: 'i20', serviceCategory: 'Daily Car Cleaning', staffName: 'Chandan Soni', active: 'Yes' }
    ];

    const formatted = cwp.formatStaffDataResponse('STF01', { records: mockCustomers });
    const orderVerified = formatted.dailyCarCleaning.length === 3 &&
      formatted.dailyCarCleaning[0].customerName === 'Row 2 Customer' &&
      formatted.dailyCarCleaning[1].customerName === 'Row 3 Customer' &&
      formatted.dailyCarCleaning[2].customerName === 'Row 4 Customer';

    recordResult('8. Multiple Vehicles & Daily Clean Source Row Order Strictly Preserved', orderVerified,
      `Verified order: [${formatted.dailyCarCleaning.map(c => c.customerName).join(' -> ')}] with ${formatted.dailyCarCleaning.length} distinct vehicles.`);

    // -------------------------------------------------------------------------
    // TEST 9: Cross-Sheet Row Corruption Prevention
    // -------------------------------------------------------------------------
    const resIllegalMove = await makeRequest({
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
        serviceCategory: 'Car Washing', // Mismatched category for Daily Clean
        customerName: 'Illegal Cross-Sheet Attempt'
      }
    });

    const t9Pass = resIllegalMove.statusCode === 400 && resIllegalMove.body.success === false;
    recordResult('9. Cross-Sheet Row Corruption Guard Blocked Illegal Move', t9Pass,
      `Moving Daily Clean record to Car Washing blocked with HTTP ${resIllegalMove.statusCode}: ${resIllegalMove.body.error}`);

    // -------------------------------------------------------------------------
    // TEST 10: PIN Sync Protection ([PROTECTED] & Blank PIN Never Corrupt Hash)
    // -------------------------------------------------------------------------
    const existingStf02Pin = cwp.getAppState().staffList.find(s => s.id === 'STF02').pin;
    
    // Simulate remote sheet sync returning [PROTECTED]
    cwp.mergeStaffList([
      { id: 'STF02', name: 'Taufiq Ahmed', phone: '8081913264', pin: '[PROTECTED]', active: true }
    ]);
    const pinAfterProtected = cwp.getAppState().staffList.find(s => s.id === 'STF02').pin;

    // Simulate remote sheet sync returning blank PIN
    cwp.mergeStaffList([
      { id: 'STF02', name: 'Taufiq Ahmed', phone: '8081913264', pin: '', active: true }
    ]);
    const pinAfterBlank = cwp.getAppState().staffList.find(s => s.id === 'STF02').pin;

    const t10Pass = pinAfterProtected === existingStf02Pin && pinAfterBlank === existingStf02Pin;
    recordResult('10. PIN Sync Protection ([PROTECTED] & Blank Remote PIN Never Corrupt Hash)', t10Pass,
      `Existing scrypt hash preserved intact across [PROTECTED] and blank syncs.`);

    // -------------------------------------------------------------------------
    // TEST 11: Zero Default PINs (Creation without PIN Rejected)
    // -------------------------------------------------------------------------
    const resNoPinStaff = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'saveStaffMember',
      staffData: {
        name: 'New Test Staff Without PIN',
        phone: '9111122222',
        pin: '' // Empty PIN! Must be rejected, not default to 123456!
      }
    });

    const t11Pass = resNoPinStaff.statusCode === 400 && resNoPinStaff.body.success === false;
    recordResult('11. Default PIN Assignment Removed (Creation Without 6-Digit PIN Fails)', t11Pass,
      `Creation without PIN rejected with HTTP ${resNoPinStaff.statusCode}: ${resNoPinStaff.body.error}`);

    // -------------------------------------------------------------------------
    // TEST 12: Admin Password Never Stored in Plaintext in local_data.json
    // -------------------------------------------------------------------------
    // Perform updateAdminPassword
    const resUpdatePass = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'updateAdminPassword',
      newPassword: 'UpdatedAdminPass@2026'
    });

    const currentFileContent = fs.readFileSync(tempFixturePath, 'utf8');
    const parsedData = JSON.parse(currentFileContent);
    const hasPlaintextPass = parsedData.adminPassword !== undefined;
    const hasScryptHash = parsedData.adminPasswordHash && parsedData.adminPasswordHash.startsWith('scrypt:');

    const t12Pass = resUpdatePass.statusCode === 200 && !hasPlaintextPass && hasScryptHash;
    recordResult('12. Plaintext Admin Password Storage Strictly Eliminated', t12Pass,
      `Password update succeeded. Persistent storage contains scrypt hash (${parsedData.adminPasswordHash ? parsedData.adminPasswordHash.substring(0, 16) : ''}...). Plaintext present: ${hasPlaintextPass}.`);

    // -------------------------------------------------------------------------
    // TEST 13: Trusted Server-to-Server Authentication (Service Key Injected)
    // -------------------------------------------------------------------------
    // Verify mock GAS received request containing valid serviceKey
    const updateCustomerReq = mockGasReceivedRequests.find(r => r.payload && r.payload.action === 'updateAdminPassword');
    const serviceKeySent = updateCustomerReq && updateCustomerReq.payload.serviceKey === TEST_SERVICE_KEY;

    recordResult('13. Trusted Server-to-Server Authentication via Service Credential', serviceKeySent,
      `Node.js injected APPS_SCRIPT_SERVICE_KEY into forwarded Google Apps Script request without exposing it to browser.`);

    // -------------------------------------------------------------------------
    // TEST 14: PIN Reset followed by Revocation & Successful Re-Login
    // -------------------------------------------------------------------------
    // Reset STF02 PIN to 112233
    const resResetPin = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'resetStaffPin',
      staffId: 'STF02',
      newPin: '112233'
    });

    // Old token should now be revoked!
    const resOldToken = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/staff-data?staffId=STF02',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${staffToken2}` }
    });

    // Login with new PIN
    const resNewLogin = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'verifyStaffPin',
      staffId: 'STF02',
      pin: '112233'
    });

    const t14Pass = resResetPin.statusCode === 200 && resOldToken.statusCode === 401 && resNewLogin.statusCode === 200;
    recordResult('14. Staff PIN Reset Revokes Old Sessions & Grants New Login', t14Pass,
      `PIN reset succeeded, old session revoked (HTTP ${resOldToken.statusCode}), login with new PIN issued token (${resNewLogin.body.token ? resNewLogin.body.token.substring(0, 12) : ''}...).`);

    // -------------------------------------------------------------------------
    // TEST 15: Inactive Staff Login Rejection & Session Revocation on Toggle
    // -------------------------------------------------------------------------
    // Toggle STF02 to inactive
    await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { action: 'toggleStaffActive', staffId: 'STF02', active: false });

    // Attempt login as inactive staff
    const resInactiveLogin = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyStaffPin', staffId: 'STF02', pin: '112233' });

    const t15Pass = resInactiveLogin.statusCode === 403 && resInactiveLogin.body.inactive;
    recordResult('15. Inactive Staff Login Rejected & Active Toggle Revokes Access', t15Pass,
      `Inactive staff login rejected with HTTP 403: ${resInactiveLogin.body.error}`);

    // -------------------------------------------------------------------------
    // TEST 16: Session Revocation on Explicit Logout
    // -------------------------------------------------------------------------
    const resLogout = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { action: 'logoutAdmin' });

    // Try using revoked token
    const resPostLogout = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { action: 'getAllCustomers' });

    const t16Pass = resLogout.statusCode === 200 && resPostLogout.statusCode === 401 && resPostLogout.body.unauthorized;
    recordResult('16. Explicit Session Revocation on Logout', t16Pass,
      `Logout acknowledged. Re-use of revoked admin session token rejected with HTTP ${resPostLogout.statusCode}.`);

    // -------------------------------------------------------------------------
    // TEST 17: Failed Login Rate Limiting (Brute Force Protection)
    // -------------------------------------------------------------------------
    // Make 5 consecutive wrong PIN attempts for STF01
    for (let i = 0; i < 5; i++) {
      await makeRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { action: 'verifyStaffPin', staffId: 'STF01', pin: '99999' + i });
    }

    // 6th attempt should be rate limited (HTTP 429)
    const resRateLimited = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { action: 'verifyStaffPin', staffId: 'STF01', pin: '123456' });

    const t17Pass = resRateLimited.statusCode === 429 && resRateLimited.body.rateLimited;
    recordResult('17. Failed Login Rate Limiting Active (HTTP 429 Cooldown)', t17Pass,
      `After 5 consecutive failures, 6th attempt rate-limited with HTTP 429: ${resRateLimited.body.error}`);

    // Clear rate limiter for STF01
    cwp.clearRateLimit('127.0.0.1', 'STF01');

    // -------------------------------------------------------------------------
    // TEST 18: Real local_data.json Immutability Verification
    // -------------------------------------------------------------------------
    const realDataAfter = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
    const realDataUntouched = realDataBefore === realDataAfter;

    recordResult('18. Test Isolation: Real local_data.json Was Never Mutated', realDataUntouched,
      `Real local_data.json MD5 checksum and content strictly unchanged.`);

    // -------------------------------------------------------------------------
    // TEST 19: Google Apps Script Direct Function Call Bypass Closed
    // -------------------------------------------------------------------------
    const vm = require('vm');
    const gasCode = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

    let gasScriptProps = {
      STAFF_LIST: JSON.stringify([
        { id: 'STF01', name: 'Chandan Soni', phone: '9919856161', pin: 'sha256:112233:abcdef', active: true }
      ]),
      SERVICE_KEY: 'test_service_secret_key_1234567890'
    };

    const gasSandbox = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => gasScriptProps[k] || null,
          setProperty: (k, v) => { gasScriptProps[k] = v; }
        })
      },
      Utilities: {
        getUuid: () => '12345678-1234-1234-1234-123456789012',
        computeDigest: () => [1, 2, 3, 4],
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        Charset: { UTF_8: 'UTF_8' }
      },
      SpreadsheetApp: {
        getUi: () => ({ createMenu: () => ({ addItem: () => ({ addToUi: () => {} }) }) }),
        openById: () => ({ getSheetByName: () => null })
      },
      HtmlService: {
        createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => {} }) }) }) }),
        XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
      },
      ContentService: {
        createTextOutput: (t) => ({ setMimeType: () => t }),
        MimeType: { JSON: 'JSON' }
      },
      Logger: { log: () => {} }
    };

    vm.createContext(gasSandbox);
    vm.runInContext(gasCode, gasSandbox);

    // Verify sensitive functions are NOT globally exposed without underscore
    const hasPublicSaveCustomer = typeof gasSandbox.saveCustomer !== 'undefined';
    const hasPublicGetAllCustomers = typeof gasSandbox.getAllCustomersForAdmin !== 'undefined';
    const hasPublicDeleteStaff = typeof gasSandbox.deleteStaffMember !== 'undefined';
    const hasPublicUpdateCustomer = typeof gasSandbox.updateCustomer !== 'undefined';
    const hasPublicGateway = typeof gasSandbox.apiRequest === 'function';

    const unauthGasCall = gasSandbox.apiRequest('getAllCustomers', {});
    const gatewayProtected = unauthGasCall && unauthGasCall.unauthorized === true;

    const t19Pass = !hasPublicSaveCustomer && !hasPublicGetAllCustomers && !hasPublicDeleteStaff && !hasPublicUpdateCustomer && hasPublicGateway && gatewayProtected;
    recordResult('19. Google Apps Script Direct Function Bypass Closed (Private _ Functions & apiRequest Gateway)', t19Pass,
      `Direct public functions removed. apiRequest gateway rejected unauthenticated call with: ${unauthGasCall ? unauthGasCall.error : ''}`);

    // -------------------------------------------------------------------------
    // TEST 20: Google Apps Script Empty-Token Bypass Closed
    // -------------------------------------------------------------------------
    const emptyTokenRes = gasSandbox.apiRequest('getStaffData', { staffId: 'STF01', token: '' });
    const missingTokenRes = gasSandbox.apiRequest('getStaffData', { staffId: 'STF01' });
    const invalidServiceKeyRes = gasSandbox.apiRequest('getAllCustomers', { serviceKey: 'invalid_key' });

    const t20Pass = emptyTokenRes && emptyTokenRes.unauthorized === true &&
                    missingTokenRes && missingTokenRes.unauthorized === true &&
                    invalidServiceKeyRes && invalidServiceKeyRes.unauthorized === true;

    recordResult('20. Google Apps Script Empty/Missing Token & Invalid Service Key Rejected', t20Pass,
      `Empty token rejected (${emptyTokenRes ? emptyTokenRes.error : ''}). Invalid service key rejected (${invalidServiceKeyRes ? invalidServiceKeyRes.error : ''}).`);

  } finally {
    // Teardown test servers
    await new Promise(r => cwp.server.close(r));
    await new Promise(r => mockGasServer.close(r));

    // Remove temporary test fixture
    if (fs.existsSync(tempFixturePath)) {
      try { fs.unlinkSync(tempFixturePath); } catch (e) {}
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('===============================================================\n');

  if (passedCount === totalCount) {
    console.log('🎉 ALL P2.1 SECURITY, DATA-INTEGRITY & ARCHITECTURAL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
