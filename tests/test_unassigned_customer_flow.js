/**
 * QA Test Suite: Unassigned Customer Option & Subsequent Staff Assignment Flow
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const cwp = require('../server.js');

const localDataPath = path.join(__dirname, '..', 'local_data.json');
const originalLocalData = fs.readFileSync(localDataPath, 'utf8');

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING UNASSIGNED CUSTOMER OPTION & EDIT ASSIGNMENT QA TESTS');
  console.log('===============================================================');

  try {
    // 1. Verify Index.html structure
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

    // Add customer form staff select
    assert.ok(indexHtml.includes('id="custStaffSelect" class="form-select"'), 'custStaffSelect exists without required attribute');
    assert.ok(!indexHtml.includes('id="custStaffSelect" class="form-select" required'), 'custStaffSelect does not have required attribute');
    assert.ok(indexHtml.includes('<option value="">Unassigned</option>'), 'custStaffSelect has Unassigned option');

    // Edit customer modal staff select
    assert.ok(indexHtml.includes('id="editCustStaff" class="form-select"'), 'editCustStaff exists');
    assert.ok(!indexHtml.includes('id="editCustStaff" class="form-select" required'), 'editCustStaff does not have required attribute');

    // Labels
    assert.ok(!indexHtml.includes('for="custStaffSelect">Assign Staff *<'), 'custStaffSelect label does not have required asterisk');
    assert.ok(!indexHtml.includes('for="editCustStaff">Assign Staff *<'), 'editCustStaff label does not have required asterisk');

    // Unassigned badge in table
    assert.ok(indexHtml.includes('class="staff-none-badge" title="No staff assigned">Unassigned</span>'), 'Unassigned badge rendered for unassigned customers in table');

    console.log('✅ PASS 1: Index.html frontend markup & validation attributes verified');

    // 2. Start server on an ephemeral port to test HTTP saveCustomer & updateCustomer APIs
    const server = cwp.server;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const makeRequest = (body, token) => {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const req = http.request({
          hostname: '127.0.0.1',
          port: port,
          path: '/api',
          method: 'POST',
          headers: headers
        }, (res) => {
          let resData = '';
          res.on('data', chunk => { resData += chunk; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(resData) });
            } catch (e) {
              resolve({ status: res.statusCode, body: resData });
            }
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });
    };

    // Create an admin session for authenticated calls
    const adminToken = cwp.createAdminSession();

    // Reset app state for testing
    const testState = {
      staffList: [
        { id: 'STF01', name: 'Chandan Soni', phone: '8887759207', active: true },
        { id: 'STF02', name: 'Gaurav Kr Gupta', phone: '8081913264', active: true }
      ],
      customers: [],
      staffSequences: []
    };
    cwp.setAppState(testState);

    // Test 2: Add Customer as Unassigned
    const unassignedCustPayload = {
      action: 'saveCustomer',
      customerData: {
        customerName: 'Test Unassigned Cust',
        customerNumber: '9876543210',
        serviceCategory: 'Daily Car Cleaning',
        packageType: 'DCC SILVER',
        vehicleNumbers: 'UP65 AB 9999',
        address: 'Sigra, Varanasi',
        staffName: '',
        staffId: ''
      }
    };

    const saveRes = await makeRequest(unassignedCustPayload, adminToken);
    assert.strictEqual(saveRes.status, 200, 'saveCustomer returns 200');
    assert.strictEqual(saveRes.body.success, true, 'saveCustomer succeeds');

    const appState = cwp.getAppState();
    const savedCust = appState.customers.find(c => c.customerName === 'Test Unassigned Cust');
    assert.ok(savedCust, 'Customer was saved in appState.customers');
    assert.strictEqual(savedCust.staffName, '', 'staffName is empty string (Unassigned)');
    assert.strictEqual(savedCust.staffId, '', 'staffId is empty string (Unassigned)');
    console.log('✅ PASS 2: saveCustomer with Unassigned staff successfully saves with empty staffName and staffId');

    // Test 3: Edit Customer and Assign to Staff (Chandan Soni - STF01)
    const updateAssignPayload = {
      action: 'updateCustomer',
      customerData: {
        sheetName: 'Daily Clean',
        rowIndex: savedCust.rowIndex,
        customerName: 'Test Unassigned Cust',
        customerNumber: '9876543210',
        serviceCategory: 'Daily Car Cleaning',
        staffName: 'Chandan Soni',
        packageType: 'DCC SILVER',
        vehicleNumbers: 'UP65 AB 9999',
        address: 'Sigra, Varanasi',
        active: 'Yes'
      }
    };

    const updateRes = await makeRequest(updateAssignPayload, adminToken);
    assert.strictEqual(updateRes.status, 200, 'updateCustomer returns 200');
    assert.strictEqual(updateRes.body.success, true, 'updateCustomer succeeds');

    const updatedCust = appState.customers.find(c => c.customerName === 'Test Unassigned Cust');
    assert.strictEqual(updatedCust.staffName, 'Chandan Soni', 'staffName assigned to Chandan Soni');
    assert.strictEqual(updatedCust.staffId, 'STF01', 'staffId auto-resolved to STF01');
    console.log('✅ PASS 3: updateCustomer edits customer and assigns staff with auto-resolved staffId (STF01)');

    // Test 4: Edit Customer back to Unassigned
    const updateUnassignPayload = {
      action: 'updateCustomer',
      customerData: {
        sheetName: 'Daily Clean',
        rowIndex: savedCust.rowIndex,
        customerName: 'Test Unassigned Cust',
        customerNumber: '9876543210',
        serviceCategory: 'Daily Car Cleaning',
        staffName: '',
        packageType: 'DCC SILVER',
        vehicleNumbers: 'UP65 AB 9999',
        address: 'Sigra, Varanasi',
        active: 'Yes'
      }
    };

    const unassignRes = await makeRequest(updateUnassignPayload, adminToken);
    assert.strictEqual(unassignRes.status, 200, 'updateCustomer returns 200');
    assert.strictEqual(unassignRes.body.success, true, 'updateCustomer succeeds');

    const reUnassignedCust = appState.customers.find(c => c.customerName === 'Test Unassigned Cust');
    assert.strictEqual(reUnassignedCust.staffName, '', 'staffName reset to empty');
    assert.strictEqual(reUnassignedCust.staffId, '', 'staffId reset to empty');
    console.log('✅ PASS 4: updateCustomer can re-unassign customer back to empty staff');

    // Test 5: Verify that Unassigned customer does NOT appear in staff portal
    const staff1Data = await makeRequest({
      action: 'getStaffPortalData',
      staffId: 'STF01'
    });
    const staff1Custs = staff1Data.body.customers || [];
    assert.ok(!staff1Custs.some(c => c.customerName === 'Test Unassigned Cust'), 'Unassigned customer does not leak into staff portal');
    console.log('✅ PASS 5: Unassigned customer is isolated from staff portal until assigned');

    await new Promise((resolve) => server.close(resolve));

    console.log('===============================================================');
    console.log('🎉 ALL 5 UNASSIGNED CUSTOMER FLOW QA TESTS PASSED!');
    console.log('===============================================================');
  } finally {
    fs.writeFileSync(localDataPath, originalLocalData, 'utf8');
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
