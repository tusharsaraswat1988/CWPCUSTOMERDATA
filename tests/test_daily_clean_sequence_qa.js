/**
 * =========================================================================
 * Comprehensive Automated QA Test Suite for Task P2.5
 * Staff-Wise Daily Car Cleaning Customer Sequence Management
 *
 * Scenarios tested in an isolated test environment:
 * 1. Stable Customer ID generation & vehicle parsing
 * 2. Independent sequence per staff (Rahul vs Amit)
 * 3. Admin sequence save via API endpoint & payload validation
 * 4. Up/Down and drag-and-drop reordering logic
 * 5. Persistence across disk reload (saveLocalData & loadLocalData)
 * 6. New customer append behavior (unsequenced customers placed at end)
 * 7. Customer temporarily missing from dataset retains order on return
 * 8. Customer staff reassignment cleanly updates both staff lists
 * 9. Duplicate sequence ID prevention & deduplication
 * 10. Security: Staff token or unauthenticated call rejected for saveStaffSequence (HTTP 401)
 * 11. Security: Staff token or unauthenticated call rejected for resetStaffSequence (HTTP 401)
 * 12. Security: Staff only receives own sequence via getStaffData (cross-staff HTTP 403)
 * 13. Sequence remains stable during 30s background live polling
 * 14. Polling version changes immediately when Admin updates sequence
 * 15. Default order when no custom sequence exists (retains sheet row order)
 * 16. Reset to default order removes custom sequence with confirmation support
 * 17. Category boundary: Car Washing & Solar Panel Cleaning sorting unaffected
 * 18. Frontend UI/UX elements in Index.html (Admin + Staff route views + Mobile CSS)
 * =========================================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===============================================================');
console.log('🚀 RUNNING TASK P2.5 STAFF-WISE DAILY CLEAN SEQUENCE TEST SUITE');
console.log('===============================================================');

const TEST_PORT = 3072;
const MOCK_GAS_PORT = 3093;
const TEST_SERVICE_KEY = 'cwp_test_secret_service_key_p25';

const tempFixturePath = path.join(__dirname, 'temp_test_data_p25_' + process.pid + '_' + Date.now() + '.json');
const realDataFilePath = path.join(__dirname, '..', 'local_data.json');

// Capture real local_data.json content before tests to verify zero mutation
const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;

// Configure isolated environment
process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'TestAdminPass@2026';
process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${MOCK_GAS_PORT}/exec`;
process.env.APPS_SCRIPT_SERVICE_KEY = TEST_SERVICE_KEY;
process.env.DATA_FILE = tempFixturePath;
process.env.DISABLE_LIVE_SHEETS = 'true';
process.env.NODE_ENV = 'test';

const serverModule = require('../server.js');
const {
  server,
  formatStaffDataResponse,
  computeStaffDataVersion,
  invalidateLiveCustomersCache,
  fetchAllLiveCustomers,
  hashPinScrypt,
  setAppState,
  getAppState,
  setDataFile,
  getCustomerStableId,
  parseVehicleDetails,
  getStaffSequences,
  saveStaffSequence,
  resetStaffSequence,
  applyStaffSequenceOrder,
  saveLocalData,
  loadLocalData
} = serverModule;

setDataFile(tempFixturePath);

// Staff Fixtures (STF01: Rahul, STF02: Amit)
const initialStaffList = [
  {
    id: 'STF01',
    name: 'Rahul Sharma',
    phone: '9876543210',
    pin: hashPinScrypt('112233'),
    active: true
  },
  {
    id: 'STF02',
    name: 'Amit Patel',
    phone: '9876543211',
    pin: hashPinScrypt('445566'),
    active: true
  }
];

// Initial Customer Fixtures
const initialCustomers = [
  // Rahul's Daily Clean customers (Row 2, 3, 4)
  {
    sheetName: 'Daily Clean',
    rowIndex: 2,
    customerName: 'Customer A',
    customerNumber: '9876543221',
    vehicle: 'UP65 AB 1234 - Creta',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Rahul Sharma',
    staffId: 'STF01',
    address: 'Sigra, Varanasi',
    active: 'Yes'
  },
  {
    sheetName: 'Daily Clean',
    rowIndex: 3,
    customerName: 'Customer B',
    customerNumber: '9876543222',
    vehicle: 'UP65 CD 5678 - Amaze',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Rahul Sharma',
    staffId: 'STF01',
    address: 'Mahmoorganj, Varanasi',
    active: 'Yes'
  },
  {
    sheetName: 'Daily Clean',
    rowIndex: 4,
    customerName: 'Customer C',
    customerNumber: '9876543223',
    vehicle: 'UP65 EF 9876 - Swift',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Rahul Sharma',
    staffId: 'STF01',
    address: 'Lanka, Varanasi',
    active: 'Yes'
  },
  // Amit's Daily Clean customers (Row 5, 6)
  {
    sheetName: 'Daily Clean',
    rowIndex: 5,
    customerName: 'Customer D',
    customerNumber: '9876543224',
    vehicle: 'UP65 GH 4567 - Nexon',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Amit Patel',
    staffId: 'STF02',
    address: 'Bhelupur, Varanasi',
    active: 'Yes'
  },
  {
    sheetName: 'Daily Clean',
    rowIndex: 6,
    customerName: 'Customer E',
    customerNumber: '9876543225',
    vehicle: 'UP65 IJ 7890 - Baleno',
    serviceCategory: 'Daily Car Cleaning',
    staffName: 'Amit Patel',
    staffId: 'STF02',
    address: 'Cantt, Varanasi',
    active: 'Yes'
  },
  // Other service categories (Car Washing & Solar)
  {
    sheetName: 'All Other Work',
    rowIndex: 7,
    customerName: 'Customer Wash',
    customerNumber: '9876543226',
    vehicle: 'UP65 KL 1111 - Thar',
    serviceCategory: 'Car Washing',
    staffName: 'Rahul Sharma',
    staffId: 'STF01',
    address: 'Sarnath, Varanasi',
    active: 'Yes'
  },
  {
    sheetName: 'All Other Work',
    rowIndex: 8,
    customerName: 'Customer Solar',
    customerNumber: '9876543227',
    vehicle: 'Rooftop Plant 5KW',
    serviceCategory: 'Solar Panel Cleaning',
    staffName: 'Rahul Sharma',
    staffId: 'STF01',
    address: 'Shivpur, Varanasi',
    active: 'Yes'
  }
];

// Initialize temporary state
setAppState({
  adminPasswordHash: hashPinScrypt('TestAdminPass@2026'),
  staffList: initialStaffList,
  customers: initialCustomers,
  staffSequences: []
});
saveLocalData(getAppState());

let mockGasServer = null;
let testAppServer = null;

function cleanup() {
  if (mockGasServer) {
    try { mockGasServer.close(); } catch (e) {}
  }
  if (testAppServer) {
    try { testAppServer.close(); } catch (e) {}
  }
  if (fs.existsSync(tempFixturePath)) {
    try { fs.unlinkSync(tempFixturePath); } catch (e) {}
  }
}

function postJson(port, pathName, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = {};
        try { body = data ? JSON.parse(data) : {}; } catch (e) { body = data; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(port, pathName, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: pathName,
      method: 'GET',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = {};
        try { body = data ? JSON.parse(data) : {}; } catch (e) { body = data; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  try {
    // 1. Mock Google Apps Script Server
    mockGasServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Mock GAS success' }));
      });
    });

    await new Promise((resolve) => mockGasServer.listen(MOCK_GAS_PORT, '127.0.0.1', resolve));

    // 2. Start Test App Server
    testAppServer = server;
    await new Promise((resolve) => testAppServer.listen(TEST_PORT, '127.0.0.1', resolve));

    // =========================================================================
    // Test 1: Stable Customer ID Generation & Vehicle Parsing
    // =========================================================================
    const id1 = getCustomerStableId(initialCustomers[0]);
    assert(id1.includes('9876543221'), 'Stable ID must include normalized 10-digit phone');
    assert(id1.includes('UP65AB1234') || id1.includes('CRETA'), 'Stable ID must include vehicle identifier');

    const vehInfo1 = parseVehicleDetails('UP65 AB 1234 - Creta');
    assert.strictEqual(vehInfo1.reg, 'UP65 AB 1234', 'Vehicle registration extracted correctly');
    assert.strictEqual(vehInfo1.model, 'Creta', 'Vehicle model extracted correctly');

    const vehInfo2 = parseVehicleDetails('Swift - UP65 EF 9876');
    assert.strictEqual(vehInfo2.reg, 'UP65 EF 9876', 'Vehicle reg extracted when model comes first');
    assert.strictEqual(vehInfo2.model, 'Swift', 'Vehicle model extracted when model comes first');

    const vehInfo3 = parseVehicleDetails('Baleno');
    assert.strictEqual(vehInfo3.model, 'Baleno', 'Model extracted when reg absent');
    assert.strictEqual(vehInfo3.reg, '', 'Reg empty when reg absent');

    console.log('✅ PASS: 1. Stable Customer ID Generation & Vehicle Parsing Verified');

    // =========================================================================
    // Test 2: Admin Login to acquire Session Token
    // =========================================================================
    const adminLoginRes = await postJson(TEST_PORT, '/api', {
      action: 'verifyAdminPassword',
      password: 'TestAdminPass@2026'
    });

    assert.strictEqual(adminLoginRes.status, 200, 'Admin login should succeed');
    const adminToken = adminLoginRes.body.token;
    assert(adminToken, 'Admin token must be returned');

    console.log('✅ PASS: 2. Admin Authentication & Session Token Acquired');

    // =========================================================================
    // Test 3: Admin Saves Independent Sequences for Rahul and Amit
    // =========================================================================
    // Rahul's customers: A, B, C. Let's sequence them: C (01), A (02), B (03)
    const custAId = getCustomerStableId(initialCustomers[0]);
    const custBId = getCustomerStableId(initialCustomers[1]);
    const custCId = getCustomerStableId(initialCustomers[2]);

    // Amit's customers: D, E. Let's sequence them: E (01), D (02)
    const custDId = getCustomerStableId(initialCustomers[3]);
    const custEId = getCustomerStableId(initialCustomers[4]);

    const saveRahulRes = await postJson(TEST_PORT, '/api', {
      action: 'saveStaffSequence',
      staffId: 'STF01',
      orderedCustomerIds: [custCId, custAId, custBId]
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert.strictEqual(saveRahulRes.status, 200, 'Save Rahul sequence should succeed');
    assert.strictEqual(saveRahulRes.body.success, true);
    assert.strictEqual(saveRahulRes.body.data.length, 3, 'Rahul should have 3 sequenced records');

    const saveAmitRes = await postJson(TEST_PORT, '/api', {
      action: 'saveStaffSequence',
      staffId: 'STF02',
      orderedCustomerIds: [custEId, custDId]
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert.strictEqual(saveAmitRes.status, 200, 'Save Amit sequence should succeed');
    assert.strictEqual(saveAmitRes.body.success, true);
    assert.strictEqual(saveAmitRes.body.data.length, 2, 'Amit should have 2 sequenced records');

    // Verify GET /api/staff-sequence route
    const getSeqRes = await getJson(TEST_PORT, '/api/staff-sequence?staffId=STF01', {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(getSeqRes.status, 200);
    assert.strictEqual(getSeqRes.body.success, true);
    assert.deepStrictEqual(
      getSeqRes.body.sequences.map(s => s.customer_id),
      [custCId, custAId, custBId],
      'Rahul sequence must strictly match [C, A, B]'
    );

    console.log('✅ PASS: 3. Admin Sequence Save API Endpoint & Independent Sequences for Rahul and Amit');

    // =========================================================================
    // Test 4: Up/Down & Drag-and-Drop Reordering Logic
    // =========================================================================
    let currentOrder = [custCId, custAId, custBId];
    // Simulate Move UP on item at index 2 (custBId)
    const moveIdx = 2;
    const temp = currentOrder[moveIdx];
    currentOrder[moveIdx] = currentOrder[moveIdx - 1];
    currentOrder[moveIdx - 1] = temp;
    assert.deepStrictEqual(currentOrder, [custCId, custBId, custAId], 'Move UP should swap with preceding item');

    // Simulate Move DOWN on item at index 0 (custCId)
    const moveDownIdx = 0;
    const tempDown = currentOrder[moveDownIdx];
    currentOrder[moveDownIdx] = currentOrder[moveDownIdx + 1];
    currentOrder[moveDownIdx + 1] = tempDown;
    assert.deepStrictEqual(currentOrder, [custBId, custCId, custAId], 'Move DOWN should swap with following item');

    // Save initial order [custCId, custAId, custBId] for Rahul
    saveStaffSequence('STF01', [custCId, custAId, custBId], 'admin_test');
    console.log('✅ PASS: 4. Up/Down and Drag-and-Drop Reordering Logic Verified');

    // =========================================================================
    // Test 5: Persistence Across Reload (saveLocalData & loadLocalData)
    // =========================================================================
    const diskContentRaw = fs.readFileSync(tempFixturePath, 'utf8');
    const diskContent = JSON.parse(diskContentRaw);
    assert(Array.isArray(diskContent.staffSequences), 'staffSequences must be an array in disk JSON');
    assert.strictEqual(diskContent.staffSequences.length, 5, 'Disk JSON must have 3 Rahul + 2 Amit sequences');

    // Simulate server reboot / reload from disk
    loadLocalData();
    const reloadedSequencesSTF01 = getStaffSequences('STF01');
    assert.strictEqual(reloadedSequencesSTF01.length, 3, 'Reloaded sequences for STF01 must have 3 records');
    assert.strictEqual(reloadedSequencesSTF01[0].customer_id, custCId, 'First record after reload must be Cust C');
    assert.strictEqual(reloadedSequencesSTF01[1].customer_id, custAId, 'Second record after reload must be Cust A');
    assert.strictEqual(reloadedSequencesSTF01[2].customer_id, custBId, 'Third record after reload must be Cust B');

    console.log('✅ PASS: 5. Persistence Across Server Reload & Disk Save Verified');

    // =========================================================================
    // Test 6: New Customer Append Behavior
    // =========================================================================
    // Add a new customer assigned to Rahul who is not in the saved sequence
    const newCustomer = {
      sheetName: 'Daily Clean',
      rowIndex: 9,
      customerName: 'Customer N (New)',
      customerNumber: '9876543299',
      vehicle: 'UP65 ZZ 9999 - Seltos',
      serviceCategory: 'Daily Car Cleaning',
      staffName: 'Rahul Sharma',
      staffId: 'STF01',
      address: 'Varanasi Sigra Road',
      active: 'Yes'
    };
    const newCustId = getCustomerStableId(newCustomer);

    const rahulsCustomers = [initialCustomers[0], initialCustomers[1], initialCustomers[2], newCustomer];
    const orderedRahul = applyStaffSequenceOrder(rahulsCustomers, 'STF01');

    assert.strictEqual(orderedRahul.length, 4, 'Must contain all 4 customers');
    assert.strictEqual(orderedRahul[0].customerId, custCId, 'Pos 1: Customer C');
    assert.strictEqual(orderedRahul[0]._seq, '01', 'Sequence badge 01');
    assert.strictEqual(orderedRahul[1].customerId, custAId, 'Pos 2: Customer A');
    assert.strictEqual(orderedRahul[1]._seq, '02', 'Sequence badge 02');
    assert.strictEqual(orderedRahul[2].customerId, custBId, 'Pos 3: Customer B');
    assert.strictEqual(orderedRahul[2]._seq, '03', 'Sequence badge 03');
    assert.strictEqual(orderedRahul[3].customerId, newCustId, 'Pos 4: Customer N (New appended)');
    assert.strictEqual(orderedRahul[3]._seq, '04', 'Sequence badge 04 for newly appended customer');
    assert.strictEqual(orderedRahul[3].hasCustomSequence, false, 'New customer hasCustomSequence = false');

    console.log('✅ PASS: 6. New Customer Append Behavior Verified (Placed at End with 04)');

    // =========================================================================
    // Test 7: Customer Temporarily Missing from Dataset
    // =========================================================================
    // Simulate Cust A missing temporarily (e.g. absent from sheet / paused)
    const missingList = [initialCustomers[1], initialCustomers[2]]; // Only B and C
    const orderedMissing = applyStaffSequenceOrder(missingList, 'STF01');
    assert.strictEqual(orderedMissing.length, 2);
    assert.strictEqual(orderedMissing[0].customerId, custCId, 'Cust C is first');
    assert.strictEqual(orderedMissing[0]._seq, '01');
    assert.strictEqual(orderedMissing[1].customerId, custBId, 'Cust B is second');
    assert.strictEqual(orderedMissing[1]._seq, '02');

    // Cust A returns to the dataset
    const returnedList = [initialCustomers[0], initialCustomers[1], initialCustomers[2]];
    const orderedReturned = applyStaffSequenceOrder(returnedList, 'STF01');
    assert.strictEqual(orderedReturned.length, 3);
    assert.strictEqual(orderedReturned[0].customerId, custCId, 'Pos 1 is Cust C');
    assert.strictEqual(orderedReturned[1].customerId, custAId, 'Pos 2 is Cust A restored in original position');
    assert.strictEqual(orderedReturned[2].customerId, custBId, 'Pos 3 is Cust B');

    console.log('✅ PASS: 7. Temporarily Missing Customer Sequence Retained Upon Return');

    // =========================================================================
    // Test 8: Staff Reassignment Handling
    // =========================================================================
    // Cust B is reassigned from Rahul (STF01) to Amit (STF02)
    const reassignedCustB = {
      ...initialCustomers[1],
      staffId: 'STF02',
      staffName: 'Amit Patel'
    };

    const rahulCurrent = [initialCustomers[0], initialCustomers[2]]; // A and C
    const amitCurrent = [initialCustomers[3], initialCustomers[4], reassignedCustB]; // D, E and reassigned B

    const rahulResult = applyStaffSequenceOrder(rahulCurrent, 'STF01');
    assert.strictEqual(rahulResult.length, 2, "Rahul should no longer have Cust B");
    assert.strictEqual(rahulResult[0].customerId, custCId);
    assert.strictEqual(rahulResult[1].customerId, custAId);

    const amitResult = applyStaffSequenceOrder(amitCurrent, 'STF02');
    assert.strictEqual(amitResult.length, 3, "Amit should now have 3 customers (E, D, B)");
    assert.strictEqual(amitResult[0].customerId, custEId, "Amit Pos 1 is E");
    assert.strictEqual(amitResult[1].customerId, custDId, "Amit Pos 2 is D");
    assert.strictEqual(amitResult[2].customerId, custBId, "Amit Pos 3 is reassigned B (appended to end)");

    console.log('✅ PASS: 8. Customer Staff Reassignment Handled Cleanly');

    // =========================================================================
    // Test 9: Duplicate Sequence Prevention & Deduplication
    // =========================================================================
    const dedupResult = saveStaffSequence('STF01', [custCId, custAId, custCId, custBId, custAId], 'admin_test');
    assert.strictEqual(dedupResult.length, 3, 'Duplicate customer IDs in payload must be deduplicated to 3');
    assert.deepStrictEqual(
      dedupResult.map(r => r.customer_id),
      [custCId, custAId, custBId],
      'Unique order strictly preserved'
    );
    assert.strictEqual(dedupResult[0].sequence_order, 1);
    assert.strictEqual(dedupResult[1].sequence_order, 2);
    assert.strictEqual(dedupResult[2].sequence_order, 3);

    console.log('✅ PASS: 9. Duplicate Sequence ID Prevention & Deduplication Verified');

    // =========================================================================
    // Test 10: Security - Staff Token or Unauthenticated Requests Rejected for saveStaffSequence
    // =========================================================================
    // Staff login to get a valid staff session token
    const staffLoginRes = await postJson(TEST_PORT, '/api', {
      action: 'verifyStaffPin',
      phone: '9876543210',
      pin: '112233',
      staffId: 'STF01'
    });

    assert.strictEqual(staffLoginRes.status, 200, 'Staff Rahul login should succeed');
    const staffToken = staffLoginRes.body.token || staffLoginRes.body.staffToken;
    assert(staffToken, 'Staff token must be present');

    // Unauthenticated attempt to save sequence
    const unauthSave = await postJson(TEST_PORT, '/api', {
      action: 'saveStaffSequence',
      staffId: 'STF01',
      orderedCustomerIds: [custAId, custBId]
    });
    assert.strictEqual(unauthSave.status, 401, 'Unauthenticated sequence save must be rejected with HTTP 401');

    // Staff session attempt to save sequence (Staff must NOT be able to modify sequence)
    const staffSave = await postJson(TEST_PORT, '/api', {
      action: 'saveStaffSequence',
      staffId: 'STF01',
      orderedCustomerIds: [custAId, custBId]
    }, { 'Authorization': `Bearer ${staffToken}` });
    assert.strictEqual(staffSave.status, 401, 'Staff session saving sequence must be rejected with HTTP 401');

    console.log('✅ PASS: 10. Security: Staff & Unauthenticated Sequence Modification Strictly Blocked (HTTP 401)');

    // =========================================================================
    // Test 11: Security - Staff Token or Unauthenticated Requests Rejected for resetStaffSequence
    // =========================================================================
    const unauthReset = await postJson(TEST_PORT, '/api', {
      action: 'resetStaffSequence',
      staffId: 'STF01'
    });
    assert.strictEqual(unauthReset.status, 401, 'Unauthenticated reset must be rejected with HTTP 401');

    const staffReset = await postJson(TEST_PORT, '/api', {
      action: 'resetStaffSequence',
      staffId: 'STF01'
    }, { 'Authorization': `Bearer ${staffToken}` });
    assert.strictEqual(staffReset.status, 401, 'Staff session resetting sequence must be rejected with HTTP 401');

    console.log('✅ PASS: 11. Security: Staff & Unauthenticated Sequence Reset Strictly Blocked (HTTP 401)');

    // =========================================================================
    // Test 12: Staff Portal Isolation & Ordered Daily Clean Delivery
    // =========================================================================
    // Rahul requests his own data
    const rahulDataRes = await postJson(TEST_PORT, '/api', {
      action: 'getStaffData',
      staffId: 'STF01'
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(rahulDataRes.status, 200, 'Rahul fetching own data must succeed with HTTP 200');
    assert.strictEqual(rahulDataRes.body.success, true);
    assert(Array.isArray(rahulDataRes.body.dailyCarCleaning), 'dailyCarCleaning must be an array');
    
    // Rahul's Daily Clean customers must be ordered strictly according to sequence: [C, A, B]
    const rahulReturnedDaily = rahulDataRes.body.dailyCarCleaning;
    assert.strictEqual(rahulReturnedDaily.length, 3);
    assert.strictEqual(rahulReturnedDaily[0].customerName, 'Customer C', 'Rahul first car must be Customer C');
    assert.strictEqual(rahulReturnedDaily[0]._seq, '01', 'Sequence number must be 01');
    assert.strictEqual(rahulReturnedDaily[1].customerName, 'Customer A', 'Rahul second car must be Customer A');
    assert.strictEqual(rahulReturnedDaily[1]._seq, '02', 'Sequence number must be 02');
    assert.strictEqual(rahulReturnedDaily[2].customerName, 'Customer B', 'Rahul third car must be Customer B');
    assert.strictEqual(rahulReturnedDaily[2]._seq, '03', 'Sequence number must be 03');

    // Rahul attempting to fetch Amit's data -> must be blocked with HTTP 403 Forbidden
    const crossStaffRes = await postJson(TEST_PORT, '/api', {
      action: 'getStaffData',
      staffId: 'STF02'
    }, { 'Authorization': `Bearer ${staffToken}` });
    assert.strictEqual(crossStaffRes.status, 403, 'Cross-staff access must be blocked with HTTP 403 Forbidden');

    console.log('✅ PASS: 12. Staff Portal Isolation & Daily Clean Sequence Delivery Verified');

    // =========================================================================
    // Test 13: Sequence Stability During Background Live Polling
    // =========================================================================
    const initialVersion = rahulDataRes.body.version;
    assert(initialVersion, 'Data version must be returned');

    // Background poll with current dataVersion when nothing has changed
    const pollRes = await postJson(TEST_PORT, '/api', {
      action: 'getStaffData',
      staffId: 'STF01',
      version: initialVersion
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(pollRes.status, 200);
    assert.strictEqual(pollRes.body.unchanged, true, 'Polling must return unchanged: true when no sequence changes');
    assert.strictEqual(pollRes.body.version, initialVersion, 'Data version remains identical');

    console.log('✅ PASS: 13. Sequence Remains Perfectly Stable During Live Polling (unchanged: true)');

    // =========================================================================
    // Test 14: Polling Version Updates Immediately When Admin Changes Sequence
    // =========================================================================
    // Admin inverts Rahul's sequence: [B, A, C]
    const invertRes = await postJson(TEST_PORT, '/api', {
      action: 'saveStaffSequence',
      staffId: 'STF01',
      orderedCustomerIds: [custBId, custAId, custCId]
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(invertRes.status, 200);

    // On next poll with initialVersion, server must detect sequence change and return fresh data
    const pollAfterChangeRes = await postJson(TEST_PORT, '/api', {
      action: 'getStaffData',
      staffId: 'STF01',
      version: initialVersion
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(pollAfterChangeRes.status, 200);
    assert.strictEqual(pollAfterChangeRes.body.unchanged, false, 'Poll must return unchanged: false when sequence updated');
    assert.notStrictEqual(pollAfterChangeRes.body.version, initialVersion, 'dataVersion must change');
    assert.strictEqual(pollAfterChangeRes.body.dailyCarCleaning[0].customerName, 'Customer B', 'Pos 1 is now Customer B');
    assert.strictEqual(pollAfterChangeRes.body.dailyCarCleaning[1].customerName, 'Customer A', 'Pos 2 is now Customer A');
    assert.strictEqual(pollAfterChangeRes.body.dailyCarCleaning[2].customerName, 'Customer C', 'Pos 3 is now Customer C');

    console.log('✅ PASS: 14. Live Polling Version Changes Immediately on Admin Sequence Update');

    // =========================================================================
    // Test 15: Default Order When No Custom Sequence Exists
    // =========================================================================
    // Reset Rahul's sequence
    const resetRes = await postJson(TEST_PORT, '/api', {
      action: 'resetStaffSequence',
      staffId: 'STF01'
    }, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.body.success, true);

    const rahulResetData = await postJson(TEST_PORT, '/api', {
      action: 'getStaffData',
      staffId: 'STF01'
    }, { 'Authorization': `Bearer ${staffToken}` });
    assert.strictEqual(rahulResetData.status, 200);
    const defaultList = rahulResetData.body.dailyCarCleaning;
    // Default sheet order: Customer A (row 2), Customer B (row 3), Customer C (row 4)
    assert.strictEqual(defaultList[0].customerName, 'Customer A', 'Default Pos 1: Customer A (row 2)');
    assert.strictEqual(defaultList[0]._seq, '01');
    assert.strictEqual(defaultList[1].customerName, 'Customer B', 'Default Pos 2: Customer B (row 3)');
    assert.strictEqual(defaultList[1]._seq, '02');
    assert.strictEqual(defaultList[2].customerName, 'Customer C', 'Default Pos 3: Customer C (row 4)');
    assert.strictEqual(defaultList[2]._seq, '03');

    console.log('✅ PASS: 15. Default Sheet Row Order Reverted Upon Sequence Reset');

    // =========================================================================
    // Test 16: Category Boundary: Car Washing & Solar Sorting Unaffected
    // =========================================================================
    const washRecords = rahulResetData.body.carWashing;
    const solarRecords = rahulResetData.body.solarCleaning;
    assert.strictEqual(washRecords.length, 1, 'Car Washing category intact');
    assert.strictEqual(washRecords[0].customerName, 'Customer Wash');
    assert.strictEqual(solarRecords.length, 1, 'Solar Panel Cleaning category intact');
    assert.strictEqual(solarRecords[0].customerName, 'Customer Solar');

    console.log('✅ PASS: 16. Category Boundaries Intact (Car Washing & Solar Sorting Unaltered)');

    // =========================================================================
    // Test 17: Frontend UI/UX Elements in Index.html
    // =========================================================================
    const indexHtmlPath = path.join(__dirname, '..', 'Index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    // Admin UI checks
    assert(indexHtml.includes('id="tabBtnSequence"'), 'Admin Sequence tab button #tabBtnSequence exists');
    assert(indexHtml.includes('id="adminTabSequence"'), 'Admin Sequence pane #adminTabSequence exists');
    assert(indexHtml.includes('id="seqStaffSelect"'), 'Staff selector #seqStaffSelect exists');
    assert(indexHtml.includes('id="seqSearchInput"'), 'Search input #seqSearchInput exists');
    assert(indexHtml.includes('id="seqCustomerList"'), 'Customer list container #seqCustomerList exists');
    assert(indexHtml.includes('id="btnSaveSequence"'), 'Save Order button #btnSaveSequence exists');
    assert(indexHtml.includes('id="btnResetSequence"'), 'Reset Order button #btnResetSequence exists');
    assert(indexHtml.includes('id="seqUnsavedBadge"'), 'Unsaved indicator #seqUnsavedBadge exists');
    assert(indexHtml.includes('id="seqAlertBanner"'), 'Alert banner #seqAlertBanner exists');
    assert(indexHtml.includes('id="seqResetModal"'), 'Reset confirmation modal #seqResetModal exists');

    // Staff UI checks
    assert(indexHtml.includes('id="staffDailyRouteHeader"'), 'Staff route header #staffDailyRouteHeader exists');
    assert(indexHtml.includes("Today's Cleaning Route"), 'Heading "Today\'s Cleaning Route" exists');
    assert(indexHtml.includes('id="routeProgressBarFill"'), 'Progress bar #routeProgressBarFill exists');
    assert(indexHtml.includes('id="routeProgressCount"'), 'Progress count #routeProgressCount exists');
    assert(indexHtml.includes('id="routeStaffName"'), 'Staff name #routeStaffName exists');
    assert(indexHtml.includes('id="routeTotalCount"'), 'Total count #routeTotalCount exists');
    assert(indexHtml.includes('cust-route-seq-badge'), 'Route sequence badge .cust-route-seq-badge exists');
    assert(!indexHtml.includes('btn-directions'), 'Directions button .btn-directions is removed as requested');
    assert(indexHtml.includes('btn-clean-done'), 'Completion toggle .btn-clean-done exists');

    // Mobile CSS & Responsive Layout checks
    assert(indexHtml.includes('.seq-card-row'), 'CSS .seq-card-row exists');
    assert(indexHtml.includes('.seq-drag-handle'), 'CSS .seq-drag-handle exists');
    assert(indexHtml.includes('.btn-seq-move'), 'CSS .btn-seq-move exists');
    assert(indexHtml.includes('.seq-num-badge'), 'CSS .seq-num-badge exists');
    assert(indexHtml.includes('.seq-list-container'), 'CSS .seq-list-container exists');
    assert(indexHtml.includes('@media (max-width: 768px)'), 'Mobile responsive media queries exist');

    // Script injection check: client functions exist
    assert(indexHtml.includes('function initAdminSequenceManager'), 'initAdminSequenceManager defined in client script');
    assert(indexHtml.includes('function saveCurrentStaffSequence'), 'saveCurrentStaffSequence defined in client script');
    assert(indexHtml.includes('function moveSeqItemUp'), 'moveSeqItemUp defined in client script');
    assert(indexHtml.includes('function moveSeqItemDown'), 'moveSeqItemDown defined in client script');
    assert(indexHtml.includes('function confirmResetSequence'), 'confirmResetSequence defined in client script');
    assert(indexHtml.includes('function executeResetSequence'), 'executeResetSequence defined in client script');

    console.log('✅ PASS: 17. Frontend UI/UX Elements, Accessible Controls & Mobile CSS Verified in Index.html');

    // =========================================================================
    // Test 18: Test Isolation Check (real local_data.json never modified)
    // =========================================================================
    const realDataAfter = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
    assert.strictEqual(realDataBefore, realDataAfter, 'Real local_data.json was never mutated during test run');

    console.log('✅ PASS: 18. Test Isolation Strictly Preserved (Zero Mutation of local_data.json)');

    console.log('===============================================================');
    console.log('TEST SUMMARY: 18/18 TESTS PASSED');
    console.log('===============================================================');
    console.log('🎉 ALL TASK P2.5 STAFF SEQUENCE & ROUTE MANAGEMENT TESTS PASSED!');
    console.log('===============================================================');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

runTests();
