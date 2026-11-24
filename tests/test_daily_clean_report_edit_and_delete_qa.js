/**
 * Test Suite: Admin Daily Clean Report Edit (Status Override) and Deletion with Reason
 * Tests:
 * 1. Unauthorized access rejection
 * 2. Status update from car_not_present to completed with reason
 * 3. Status update from completed to car_not_present with reason
 * 4. Deletion of report with reason
 * 5. Reason visibility in getDailyCleanReports query
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🧪 RUNNING CLEAN REPORT STATUS UPDATE & DELETE QA TEST');
console.log('===============================================================');

const TEST_PORT = 3089;
const tempFixturePath = path.join(__dirname, 'temp_test_data_report_edit_' + process.pid + '_' + Date.now() + '.json');

process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'AuditAdminPass@2026';
process.env.DATA_FILE = tempFixturePath;
process.env.NODE_ENV = 'test';

const cwp = require('../server.js');

const initialStaffList = [
  {
    id: 'STF01',
    name: 'Chandan Soni',
    phone: '9919856161',
    pin: cwp.hashPinScrypt('123456'),
    active: true
  }
];

const mockReport = {
  id: 'test-report-uuid-001',
  client_mutation_id: 'test-report-uuid-001',
  staff_code: 'STF01',
  subscription_id: 'sub-001',
  vehicle_id: 'veh-001',
  customer_id: 'cust-001',
  customer_name: 'Dr. Amber',
  registration_no: 'UP65FJ3252',
  photo_url: 'https://example.com/photo.jpg',
  service_date: '2026-11-24',
  completed_at_device: '2026-11-24T02:47:16.939Z',
  synced_at_server: '2026-11-24T02:47:18.000Z',
  status: 'car_not_present',
  notes: 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)',
  car_not_present: true,
  tag: 'car_not_present'
};

cwp.setDataFile(tempFixturePath);
cwp.setAppState({
  adminPasswordHash: cwp.hashPinScrypt('AuditAdminPass@2026'),
  staffList: initialStaffList,
  customers: [],
  serviceLogs: [mockReport]
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
    }, res => {
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

async function run() {
  await new Promise(resolve => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`Test server running at http://127.0.0.1:${TEST_PORT}`);

  try {
    // 1. Verify unauthenticated call is rejected
    console.log('\n--- 1. Testing Unauthenticated Request Rejection ---');
    const unauthRes = await postApi({
      action: 'updateDailyCleanReportStatus',
      reportId: 'test-report-uuid-001',
      status: 'completed',
      reason: 'Should fail'
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    assert.strictEqual(unauthRes.data.unauthorized, true);
    console.log('✔ Unauthenticated request properly rejected with 401');

    // 2. Login as Admin
    console.log('\n--- 2. Admin Authentication ---');
    const loginRes = await postApi({
      action: 'verifyAdminPassword',
      password: 'AuditAdminPass@2026'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.success, true);
    const adminToken = loginRes.data.token;
    assert.ok(adminToken, 'Admin token received');
    const authHeader = { 'Authorization': `Bearer ${adminToken}` };
    console.log('✔ Admin authenticated successfully');

    // 3. Update report status from car_not_present to completed with reason
    console.log('\n--- 3. Update Status from car_not_present to completed with Reason ---');
    const updateRes1 = await postApi({
      action: 'updateDailyCleanReportStatus',
      reportId: 'test-report-uuid-001',
      status: 'completed',
      reason: 'स्टाफ ने गलती से कार नॉट प्रेजेंट मार्क किया था - गाड़ी साफ हो चुकी है'
    }, authHeader);

    assert.strictEqual(updateRes1.status, 200);
    assert.strictEqual(updateRes1.data.success, true);
    assert.strictEqual(updateRes1.data.report.status, 'completed');
    assert.strictEqual(updateRes1.data.report.car_not_present, false);
    assert.strictEqual(updateRes1.data.report.admin_notes, 'स्टाफ ने गलती से कार नॉट प्रेजेंट मार्क किया था - गाड़ी साफ हो चुकी है');
    console.log('✔ Report status updated to "completed" with admin reason');

    // 4. Query Daily Clean Reports and verify reason is returned
    console.log('\n--- 4. Verify Reason in getDailyCleanReports ---');
    const queryRes1 = await postApi({
      action: 'getDailyCleanReports',
      startDate: '2026-11-24',
      endDate: '2026-11-24'
    }, authHeader);

    assert.strictEqual(queryRes1.status, 200);
    assert.strictEqual(queryRes1.data.records.length, 1);
    const rec1 = queryRes1.data.records[0];
    assert.strictEqual(rec1.status, 'completed');
    assert.strictEqual(rec1.car_not_present, false);
    assert.strictEqual(rec1.admin_notes, 'स्टाफ ने गलती से कार नॉट प्रेजेंट मार्क किया था - गाड़ी साफ हो चुकी है');
    console.log('✔ Query returns updated status and admin reason accurately');

    // 5. Update status back to car_not_present
    console.log('\n--- 5. Update Status back to car_not_present with Reason ---');
    const updateRes2 = await postApi({
      action: 'updateDailyCleanReportStatus',
      reportId: 'test-report-uuid-001',
      status: 'car_not_present',
      reason: 'गाड़ी वास्तव में अनुपस्थित थी - पुनः जांच उपरांत रीसेट'
    }, authHeader);

    assert.strictEqual(updateRes2.status, 200);
    assert.strictEqual(updateRes2.data.success, true);
    assert.strictEqual(updateRes2.data.report.status, 'car_not_present');
    assert.strictEqual(updateRes2.data.report.car_not_present, true);
    console.log('✔ Report status switched back to "car_not_present" with new reason');

    // 6. Delete report with reason
    console.log('\n--- 6. Delete Clean Report with Reason ---');
    const deleteRes = await postApi({
      action: 'deleteDailyCleanReport',
      reportId: 'test-report-uuid-001',
      reason: 'स्टाफ को पुनः ताज़ा फोटो के साथ पंच करने हेतु रिकॉर्ड हटाया गया'
    }, authHeader);

    assert.strictEqual(deleteRes.status, 200);
    assert.strictEqual(deleteRes.data.success, true);
    assert.strictEqual(deleteRes.data.deleted, true);
    console.log('✔ Report deleted successfully');

    // 7. Verify report no longer exists in query
    console.log('\n--- 7. Verify Deletion in getDailyCleanReports ---');
    const queryRes2 = await postApi({
      action: 'getDailyCleanReports',
      startDate: '2026-11-24',
      endDate: '2026-11-24'
    }, authHeader);

    assert.strictEqual(queryRes2.status, 200);
    assert.strictEqual(queryRes2.data.records.length, 0);
    console.log('✔ Record no longer present in daily reports query');

    console.log('\n===============================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('===============================================================');
  } finally {
    cwp.server.close();
    if (fs.existsSync(tempFixturePath)) {
      try { fs.unlinkSync(tempFixturePath); } catch (e) {}
    }
  }
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
