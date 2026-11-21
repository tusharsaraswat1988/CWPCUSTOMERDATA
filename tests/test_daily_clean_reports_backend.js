/**
 * Test Suite: Daily Clean Photo Verification & Admin Daily Clean Reports
 * Verifies recordDailyCleanWithPhoto and getDailyCleanReports endpoints & business logic
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===============================================================');
console.log('🚀 RUNNING DAILY CLEAN REPORTS & PHOTO VERIFICATION SUITE');
console.log('===============================================================');

const TEST_PORT = 3088;
const tempFixturePath = path.join(__dirname, 'temp_test_data_clean_' + process.pid + '_' + Date.now() + '.json');
const realDataFilePath = path.join(__dirname, '..', 'local_data.json');

const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;

process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'ReportAdminPass@2026';
process.env.DATA_FILE = tempFixturePath;
process.env.NODE_ENV = 'test';

const cwp = require('../server.js');

// Seed test fixture
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

cwp.setDataFile(tempFixturePath);
cwp.setAppState({
  adminPasswordHash: cwp.hashPinScrypt('ReportAdminPass@2026'),
  staffList: initialStaffList,
  customers: [],
  staffSequences: [],
  serviceLogs: []
});
cwp.saveLocalData(cwp.getAppState());

function postApi(payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  try {
    await new Promise((resolve) => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));
    console.log(`[Setup] Using server on http://127.0.0.1:${TEST_PORT}`);

    // 1. Unauthorized Access Checks
    console.log('\n--- TEST 1: Unauthorized Access Protection ---');
    const unauthPhoto = await postApi({
      action: 'recordDailyCleanWithPhoto',
      subscriptionId: 'sub-001',
      vehicleId: 'veh-001'
    });
    assert.strictEqual(unauthPhoto.status, 401, 'Unauthenticated photo record rejected with 401');
    console.log('✅ PASS: Unauthorized recordDailyCleanWithPhoto rejected with HTTP 401');

    const unauthReports = await postApi({
      action: 'getDailyCleanReports'
    });
    assert.strictEqual(unauthReports.status, 401, 'Unauthenticated reports query rejected with 401');
    console.log('✅ PASS: Unauthorized getDailyCleanReports rejected with HTTP 401');
    passed += 2;

    // 2. Authentication: Staff & Admin Sessions
    console.log('\n--- TEST 2: Authentication ---');
    const adminLogin = await postApi({
      action: 'verifyAdminPassword',
      password: 'ReportAdminPass@2026'
    });
    assert.strictEqual(adminLogin.status, 200);
    assert.ok(adminLogin.data.token, 'Admin token issued');
    const adminToken = adminLogin.data.token;
    console.log('✅ PASS: Admin login successful, session token issued');

    const staffLogin = await postApi({
      action: 'verifyStaffPin',
      staffId: 'STF01',
      pin: '123456'
    });
    assert.strictEqual(staffLogin.status, 200);
    assert.ok(staffLogin.data.token, 'Staff token issued');
    const staffToken = staffLogin.data.token;
    console.log('✅ PASS: Staff login successful, session token issued');
    passed += 2;

    // 3. Record Daily Clean with Photo Proof
    console.log('\n--- TEST 3: Record Daily Clean with Photo Proof ---');
    // 1x1 transparent png in base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const nowIso = new Date().toISOString();
    const mutationId1 = crypto.randomUUID();

    const recordRes1 = await postApi({
      action: 'recordDailyCleanWithPhoto',
      clientMutationId: mutationId1,
      staffId: 'STF01',
      subscriptionId: 'sub-test-01',
      vehicleId: 'veh-test-01',
      customerId: 'cust-test-01',
      customerName: 'Anand Sharma',
      registrationNo: 'UP 16 AB 1234',
      completedAtDevice: nowIso,
      notes: 'Car cleaned spotless with tyre polish',
      photoBase64: samplePngBase64,
      mimeType: 'image/png'
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(recordRes1.status, 200, 'Record submission returned 200');
    assert.strictEqual(recordRes1.data.success, true, 'Record submission marked success');
    assert.ok(recordRes1.data.photoUrl, 'Returned valid photoUrl');
    console.log(`✅ PASS: Staff recorded daily clean with photo: ${recordRes1.data.photoUrl}`);
    passed++;

    // Record second clean for STF02 without photo
    const nowIso2 = new Date(Date.now() - 3600000).toISOString();
    const mutationId2 = crypto.randomUUID();
    const recordRes2 = await postApi({
      action: 'recordDailyCleanWithPhoto',
      clientMutationId: mutationId2,
      staffId: 'STF02',
      subscriptionId: 'sub-test-02',
      vehicleId: 'veh-test-02',
      customerId: 'cust-test-02',
      customerName: 'Priya Verma',
      registrationNo: 'DL 03 XY 9876',
      completedAtDevice: nowIso2,
      notes: 'Interior dust only',
      photoUrl: null
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert.strictEqual(recordRes2.status, 200);
    assert.strictEqual(recordRes2.data.success, true);
    console.log('✅ PASS: Second daily clean recorded successfully');
    passed++;

    // 4. Admin Daily Clean Reports Query & Filters
    console.log('\n--- TEST 4: Admin Daily Clean Reports & Filters ---');
    const reportsAll = await postApi({
      action: 'getDailyCleanReports'
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert.strictEqual(reportsAll.status, 200);
    assert.strictEqual(reportsAll.data.success, true);
    assert.ok(Array.isArray(reportsAll.data.records), 'Records is an array');
    assert.strictEqual(reportsAll.data.summary.totalCleaned >= 2, true, 'At least 2 records found');
    assert.strictEqual(reportsAll.data.summary.withPhotoCount >= 1, true, 'At least 1 photo verified');
    console.log(`✅ PASS: All reports fetched. Total: ${reportsAll.data.summary.totalCleaned}, With Photo: ${reportsAll.data.summary.withPhotoCount}, Rate: ${reportsAll.data.summary.photoRate}%`);
    passed++;

    // Filter by Staff STF01
    const reportsStaff1 = await postApi({
      action: 'getDailyCleanReports',
      staffId: 'STF01'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(reportsStaff1.status, 200);
    const allStf01 = reportsStaff1.data.records.every(r => (r.staff_code === 'STF01' || r.staff_id === 'STF01'));
    assert.strictEqual(allStf01, true, 'All filtered records match STF01');
    console.log('✅ PASS: Filter by staff STF01 strictly applied');
    passed++;

    // Filter by Search 'Priya'
    const reportsSearch = await postApi({
      action: 'getDailyCleanReports',
      search: 'Priya'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(reportsSearch.status, 200);
    assert.strictEqual(reportsSearch.data.records.length, 1);
    assert.strictEqual(reportsSearch.data.records[0].registration_no, 'DL 03 XY 9876');
    console.log('✅ PASS: Filter by customer/vehicle search strictly applied');
    passed++;

    // Filter by hasPhoto === 'yes'
    const reportsWithPhoto = await postApi({
      action: 'getDailyCleanReports',
      hasPhoto: 'yes'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(reportsWithPhoto.status, 200);
    assert.ok(reportsWithPhoto.data.records.every(r => !!r.photo_url), 'All records have photo_url');
    console.log('✅ PASS: Filter by hasPhoto=yes strictly applied');
    passed++;

    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ALL ${passed} TESTS PASSED CLEANLY`);
    console.log('===============================================================');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    failed++;
  } finally {
    if (cwp.server) {
      cwp.server.close();
    }
    // Cleanup temporary fixture
    if (fs.existsSync(tempFixturePath)) {
      try { fs.unlinkSync(tempFixturePath); } catch (e) {}
    }
    // Verify real local_data.json was never mutated
    if (realDataBefore && fs.existsSync(realDataFilePath)) {
      const realDataAfter = fs.readFileSync(realDataFilePath, 'utf8');
      assert.strictEqual(realDataBefore, realDataAfter, 'Real local_data.json must be preserved');
    }
  }

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runTests();
