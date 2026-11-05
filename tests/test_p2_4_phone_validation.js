/**
 * =========================================================================
 * TASK P2.4: SERVER-SIDE INDIAN MOBILE VALIDATION & NORMALIZATION TEST SUITE
 * =========================================================================
 * Covers all required phone validation scenarios:
 * 1. Valid 10-digit number
 * 2. Valid +91 prefixed number
 * 3. Valid leading-zero number
 * 4. Valid hyphenated number
 * 5. Valid spaced number
 * 6. Invalid 5-digit number
 * 7. Invalid 11-digit number
 * 8. Invalid 0–5 starting mobile prefix
 * 9. Alphabetic input
 * 10. Null and empty values
 * 11. Add Customer API validation & normalization
 * 12. Update Customer API validation & normalization
 * 13. Staff API validation & normalization (saveStaffMember)
 * 14. Strict Google Sheets payload verification
 * =========================================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===============================================================');
console.log('🚀 RUNNING TASK P2.4 SERVER-SIDE PHONE VALIDATION TEST SUITE');
console.log('===============================================================');

const TEST_PORT = 3077;
const MOCK_GAS_PORT = 3097;
const TEST_SERVICE_KEY = 'cwp_test_secret_service_key_p24';

const tempFixturePath = path.join(__dirname, 'temp_test_data_p24_' + process.pid + '_' + Date.now() + '.json');
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
const { normalizeIndianMobile, isValidIndianMobile } = cwp;

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

function cleanup() {
  try { mockGasServer.close(); } catch (e) {}
  try { cwp.server.close(); } catch (e) {}
  if (fs.existsSync(tempFixturePath)) {
    try { fs.unlinkSync(tempFixturePath); } catch (e) {}
  }
  if (realDataBefore !== null && fs.existsSync(realDataFilePath)) {
    const after = fs.readFileSync(realDataFilePath, 'utf8');
    assert.strictEqual(after, realDataBefore, 'CRITICAL: real local_data.json was mutated!');
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

async function runPhoneValidationSuite() {
  // =========================================================================
  // UNIT TESTS: normalizeIndianMobile & isValidIndianMobile
  // =========================================================================

  // 1. Valid 10-digit number
  assert.strictEqual(normalizeIndianMobile('9876543210'), '9876543210');
  assert.strictEqual(isValidIndianMobile('9876543210'), true);
  console.log('✅ PASS: Valid 10-digit number (9876543210)');

  // 2. Valid +91 prefixed number
  assert.strictEqual(normalizeIndianMobile('+919876543210'), '9876543210');
  assert.strictEqual(normalizeIndianMobile('+91 98765 43210'), '9876543210');
  assert.strictEqual(normalizeIndianMobile('+91-98765-43210'), '9876543210');
  assert.strictEqual(isValidIndianMobile('+91 98765 43210'), true);
  console.log('✅ PASS: Valid +91 prefixed numbers (+919876543210, +91 98765 43210, +91-98765-43210)');

  // 3. Valid leading-zero number
  assert.strictEqual(normalizeIndianMobile('09876543210'), '9876543210');
  assert.strictEqual(isValidIndianMobile('09876543210'), true);
  console.log('✅ PASS: Valid leading-zero number (09876543210 -> 9876543210)');

  // 4. Valid hyphenated number
  assert.strictEqual(normalizeIndianMobile('98765-43210'), '9876543210');
  assert.strictEqual(isValidIndianMobile('98765-43210'), true);
  console.log('✅ PASS: Valid hyphenated number (98765-43210 -> 9876543210)');

  // 5. Valid spaced number
  assert.strictEqual(normalizeIndianMobile('98765 43210'), '9876543210');
  assert.strictEqual(normalizeIndianMobile('  98765 43210  '), '9876543210');
  assert.strictEqual(isValidIndianMobile('98765 43210'), true);
  console.log('✅ PASS: Valid spaced number (98765 43210 -> 9876543210)');

  // 6. Invalid 5-digit number
  assert.strictEqual(isValidIndianMobile('98765'), false);
  console.log('✅ PASS: Invalid 5-digit number rejected (98765)');

  // 7. Invalid 11-digit number
  assert.strictEqual(isValidIndianMobile('98765432109'), false);
  assert.strictEqual(isValidIndianMobile('+91987654321099'), false);
  console.log('✅ PASS: Invalid 11-digit and 12-digit numbers rejected');

  // 8. Invalid 0–5 starting mobile prefix
  assert.strictEqual(isValidIndianMobile('5876543210'), false);
  assert.strictEqual(isValidIndianMobile('01234567890'), false);
  assert.strictEqual(isValidIndianMobile('4876543210'), false);
  assert.strictEqual(isValidIndianMobile('1234567890'), false);
  console.log('✅ PASS: Invalid 0-5 starting mobile prefix rejected');

  // 9. Alphabetic input
  assert.strictEqual(normalizeIndianMobile('abcdefghij'), '');
  assert.strictEqual(isValidIndianMobile('abcdefghij'), false);
  assert.strictEqual(normalizeIndianMobile('98765abc43210'), '');
  assert.strictEqual(isValidIndianMobile('98765abc43210'), false);
  assert.strictEqual(normalizeIndianMobile('9876543210a'), '');
  assert.strictEqual(isValidIndianMobile('9876543210a'), false);
  console.log('✅ PASS: Alphabetic input strictly rejected');

  // 10. Null and empty values
  assert.strictEqual(normalizeIndianMobile(null), '');
  assert.strictEqual(isValidIndianMobile(null), false);
  assert.strictEqual(normalizeIndianMobile(undefined), '');
  assert.strictEqual(isValidIndianMobile(undefined), false);
  assert.strictEqual(normalizeIndianMobile(''), '');
  assert.strictEqual(isValidIndianMobile(''), false);
  assert.strictEqual(normalizeIndianMobile('   '), '');
  assert.strictEqual(isValidIndianMobile('   '), false);
  console.log('✅ PASS: Null and empty values rejected');

  // 10b. Foreign country prefixes rejected
  assert.strictEqual(isValidIndianMobile('+1 9876543210'), false);
  assert.strictEqual(isValidIndianMobile('+44 7911 123456'), false);
  console.log('✅ PASS: Foreign country prefixes rejected (+1, +44)');

  // 10c. Pure string handling preserved (no parseInt, no scientific notation)
  assert.strictEqual(typeof normalizeIndianMobile('09876543210'), 'string');
  assert.strictEqual(normalizeIndianMobile('9876543210').length, 10);
  console.log('✅ PASS: Pure string handling preserved without numeric type coercion');

  // =========================================================================
  // INTEGRATION TESTS: API Handlers
  // =========================================================================

  cwp.setDataFile(tempFixturePath);
  cwp.setAppState({
    adminPasswordHash: cwp.hashPinScrypt('TestAdminPass@2026'),
    staffList: [
      { id: 'STF01', name: 'Chandan Soni', phone: '9919856161', pin: cwp.hashPinScrypt('123456'), active: true }
    ],
    customers: [
      {
        sheetName: 'Daily Clean',
        rowIndex: 2,
        customerName: 'Aman Sharma',
        customerNumber: '9919856161',
        serviceCategory: 'Daily Car Cleaning',
        staffName: 'Chandan Soni',
        active: 'Yes'
      }
    ]
  });
  cwp.saveLocalData(cwp.getAppState());

  await new Promise((resolve) => mockGasServer.listen(MOCK_GAS_PORT, '127.0.0.1', resolve));
  await new Promise((resolve) => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));

  // Admin login
  const authRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { action: 'verifyAdminPassword', password: 'TestAdminPass@2026' });
  const adminToken = authRes.body.token;

  // 11. Add Customer API Validation
  // 11a. Invalid phone rejected with HTTP 400
  const addInvalidRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Bad Phone Cust',
      customerNumber: '12345', // Short
      serviceCategory: 'Daily Car Cleaning'
    }
  });
  assert.strictEqual(addInvalidRes.statusCode, 400);
  assert.strictEqual(addInvalidRes.body.success, false);
  console.log('✅ PASS: Add Customer API rejected short phone with HTTP 400');

  const addAlphaRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Alpha Phone Cust',
      customerNumber: '98765abc10',
      serviceCategory: 'Daily Car Cleaning'
    }
  });
  assert.strictEqual(addAlphaRes.statusCode, 400);
  console.log('✅ PASS: Add Customer API rejected alphabetic phone with HTTP 400');

  // 11b. Valid phone normalized to exactly 10 digits in local_data and Google Sheets payload
  gasForwardedPayloads = [];
  const addValidRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'saveCustomer',
    customerData: {
      customerName: 'Vikram Malhotra',
      customerNumber: '+91 98765 43210', // Needs normalization
      serviceCategory: 'Daily Car Cleaning',
      packageType: 'DCC SILVER',
      vehicle: 'UP65 AB 7777 - Seltos',
      staffName: 'Chandan Soni'
    }
  });
  assert.strictEqual(addValidRes.statusCode, 200);
  const savedCust = cwp.getAppState().customers.find(c => c.customerName === 'Vikram Malhotra');
  assert.ok(savedCust, 'Customer saved in appState');
  assert.strictEqual(savedCust.customerNumber, '9876543210', 'Normalized to 10 digits in local storage');

  // 14. Strict Google Sheets payload verification
  assert.strictEqual(gasForwardedPayloads.length, 1);
  const gasCustPayload = gasForwardedPayloads[0].customerData;
  assert.strictEqual(gasCustPayload.customerNumber, '9876543210', 'Google Sheets payload contains normalized 10-digit phone');
  console.log('✅ PASS: Add Customer API normalized phone and forwarded strict 10-digit string to Google Sheets');

  // 12. Update Customer API Validation
  // 12a. Invalid update phone rejected
  const updateInvalidRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'updateCustomer',
    customerData: {
      sheetName: 'Daily Clean',
      rowIndex: 2,
      customerName: 'Aman Sharma',
      customerNumber: '5876543210' // Starts with 5 -> invalid!
    }
  });
  assert.strictEqual(updateInvalidRes.statusCode, 400);
  console.log('✅ PASS: Update Customer API rejected invalid starting prefix (5) with HTTP 400');

  // 12b. Valid update phone normalized
  gasForwardedPayloads = [];
  const updateValidRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'updateCustomer',
    customerData: {
      sheetName: 'Daily Clean',
      rowIndex: 2,
      customerName: 'Aman Sharma Updated',
      customerNumber: '09876543210', // Leading zero -> should normalize to 9876543210
      serviceCategory: 'Daily Car Cleaning'
    }
  });
  assert.strictEqual(updateValidRes.statusCode, 200);
  const updatedCust = cwp.getAppState().customers.find(c => c.rowIndex === 2 || parseInt(c.rowIndex, 10) === 2);
  assert.strictEqual(updatedCust.customerNumber, '9876543210', 'Normalized in local appState on update');
  assert.strictEqual(gasForwardedPayloads[0].customerData.customerNumber, '9876543210', 'Normalized in GAS forwarded payload on update');
  console.log('✅ PASS: Update Customer API normalized leading zero to 10 digits');

  // 13. Staff API Validation (saveStaffMember)
  // 13a. Invalid staff phone rejected with HTTP 400
  const staffBadPhoneRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'saveStaffMember',
    staffData: {
      name: 'Ramesh Staff',
      phone: '98765', // Invalid 5 digits
      pin: '123456'
    }
  });
  assert.strictEqual(staffBadPhoneRes.statusCode, 400);
  assert.strictEqual(staffBadPhoneRes.body.success, false);
  console.log('✅ PASS: Staff API rejected invalid phone with HTTP 400');

  // 13b. Valid staff phone normalized to 10 digits
  gasForwardedPayloads = [];
  const staffGoodPhoneRes = await makeRequest({
    hostname: '127.0.0.1',
    port: TEST_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
  }, {
    action: 'saveStaffMember',
    staffData: {
      name: 'Ramesh Staff',
      phone: '+91 99887 76655', // Valid +91 spaced
      pin: '123456'
    }
  });
  assert.strictEqual(staffGoodPhoneRes.statusCode, 200);
  assert.strictEqual(staffGoodPhoneRes.body.success, true);
  const storedStaff = cwp.getAppState().staffList.find(s => s.name === 'Ramesh Staff');
  assert.ok(storedStaff, 'Staff saved');
  assert.strictEqual(storedStaff.phone, '9988776655', 'Staff phone normalized to 10 digits');
  assert.strictEqual(gasForwardedPayloads[0].staffData.phone, '9988776655', 'Staff phone forwarded to GAS as normalized 10 digits');
  console.log('✅ PASS: Staff API normalized valid phone (+91 99887 76655 -> 9988776655)');

  // Verify test isolation
  const finalFileContent = fs.readFileSync(tempFixturePath, 'utf8');
  assert.ok(finalFileContent.length > 0, 'Test fixture written');
  const realCurrent = fs.readFileSync(realDataFilePath, 'utf8');
  assert.strictEqual(realCurrent, realDataBefore, 'Production local_data.json remained 100% untouched');
  console.log('✅ PASS: Production local_data.json strictly untouched');

  console.log('===============================================================');
  console.log('🎉 ALL TASK P2.4 PHONE VALIDATION & NORMALIZATION TESTS PASSED!');
  console.log('===============================================================');
  cleanup();
  process.exit(0);
}

runPhoneValidationSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  cleanup();
  process.exit(1);
});
