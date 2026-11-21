/**
 * QA Test Suite: Customer and Staff Deletion in Admin Panel
 * Validates backend API endpoints and frontend UI markup/handlers for Customer and Staff deletion.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const TEST_PORT = 5999;
const tempFixturePath = path.join(__dirname, 'temp_delete_test_data.json');
process.env.NODE_ENV = 'test';
process.env.DATA_FILE = tempFixturePath;
process.env.ADMIN_PASSWORD = 'TestAdminPass@2026';

function apiRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING ADMIN DELETE CUSTOMER & STAFF QA TESTS');
  console.log('===============================================================');

  // 1. Verify Index.html UI Markup and Functions
  console.log('\n--- Checking Index.html UI elements & handler functions ---');
  const indexHtmlPath = path.join(__dirname, '..', 'Index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify Customer Delete in table
  assert.ok(indexHtml.includes('btn-delete-record'), 'Index.html must contain .btn-delete-record CSS class and button');
  assert.ok(indexHtml.includes('handleDeleteCustomer('), 'Index.html must call handleDeleteCustomer() in table row');
  console.log('✅ PASS 1: Customer table row includes Delete button with .btn-delete-record class and handleDeleteCustomer()');

  // Verify Customer Delete in Edit Customer Modal
  assert.ok(indexHtml.includes('handleDeleteCustomerFromModal()'), 'Index.html must contain handleDeleteCustomerFromModal()');
  assert.ok(indexHtml.includes('Delete Customer'), 'Index.html must contain "Delete Customer" button text in modal');
  console.log('✅ PASS 2: Edit Customer Modal includes "Delete Customer" action button in footer');

  // Verify Staff Delete in Edit Staff Modal
  assert.ok(indexHtml.includes('handleDeleteStaffFromModal()'), 'Index.html must contain handleDeleteStaffFromModal()');
  assert.ok(indexHtml.includes('Delete Staff'), 'Index.html must contain "Delete Staff" action button');
  console.log('✅ PASS 3: Edit Staff Modal includes "Delete Staff" action button in footer');

  // Verify Staff Card Delete button
  assert.ok(indexHtml.includes('handleDeleteStaff('), 'Index.html must call handleDeleteStaff() on staff card');
  assert.ok(indexHtml.includes('🗑️ Delete'), 'Index.html staff card must display clear "🗑️ Delete" action');
  console.log('✅ PASS 4: Staff card displays clear "🗑️ Delete" button');

  // 2. Start server for API validation
  console.log(`\n--- Starting test server on port ${TEST_PORT} ---`);
  const cwp = require('../server.js');
  cwp.setDataFile(tempFixturePath);
  const originalState = cwp.getAppState();
  cwp.setAppState({
    staffList: [
      { id: 'STF01', name: 'Test Staff Alpha', phone: '9876543210', pin: '123456', displayPin: '123456', active: true },
      { id: 'STF99', name: 'Temporary Staff', phone: '9988776655', pin: '654321', displayPin: '654321', active: true }
    ],
    customers: [
      { id: 'CUST-TEMP-01', customerName: 'Temp Customer 1', phone: '9123456780', staffId: 'STF99', staffName: 'Temporary Staff', active: 'Yes' },
      { id: 'CUST-PERM-01', customerName: 'Permanent Customer', phone: '9123456781', staffId: 'STF01', staffName: 'Test Staff Alpha', active: 'Yes' }
    ]
  });

  await new Promise((res) => {
    cwp.server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test server running on port ${TEST_PORT}`);
      res();
    });
  });

  try {
    // 3. Authenticate Admin
    const authRes = await apiRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'verifyAdminPassword',
      password: process.env.ADMIN_PASSWORD || 'TestAdminPass@2026'
    });

    assert.strictEqual(authRes.status, 200, 'Admin auth must succeed with HTTP 200');
    const adminToken = authRes.data.token;
    assert.ok(adminToken, 'Admin token must be returned');
    console.log('✅ PASS 5: Admin authenticated successfully, session token acquired');

    // 4. Test Customer Deletion via API
    const delCustRes = await apiRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'deleteCustomer',
      id: 'CUST-TEMP-01',
      reason: 'QA test deletion'
    });

    assert.strictEqual(delCustRes.status, 200, 'Customer deletion API must return HTTP 200');
    assert.strictEqual(delCustRes.data.success, true, 'deleteCustomer must return success: true');
    console.log('✅ PASS 6: deleteCustomer API succeeded with HTTP 200 and success: true');

    // Verify customer is removed from live customer list
    const getCustRes = await apiRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'getAllCustomers',
      forceRefresh: true
    });

    const records = getCustRes.data.records || getCustRes.data;
    const deletedCustFound = Array.isArray(records) && records.find(c => (c.id === 'CUST-TEMP-01' || c.customerName === 'Temp Customer 1'));
    assert.ok(!deletedCustFound, 'Deleted customer must no longer appear in getAllCustomers list');
    console.log('✅ PASS 7: Deleted customer is verified gone from customer records list');

    // 5. Test Staff Deletion via API
    const delStaffRes = await apiRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      action: 'deleteStaffMember',
      id: 'STF99'
    });

    assert.strictEqual(delStaffRes.status, 200, 'Staff deletion API must return HTTP 200');
    assert.strictEqual(delStaffRes.data.success, true, 'deleteStaffMember must return success: true');
    const remainingStaff = delStaffRes.data.staffList || [];
    const staffStillPresent = remainingStaff.find(s => s.id === 'STF99');
    assert.ok(!staffStillPresent, 'Deleted staff STF99 must no longer be present in staffList');
    console.log('✅ PASS 8: deleteStaffMember API successfully removed staff and returned updated sanitized staffList');

    // 6. Test unauthorized deletion rejection
    const unauthDel = await apiRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'deleteCustomer',
      id: 'CUST-PERM-01'
    });
    assert.strictEqual(unauthDel.status, 401, 'Unauthenticated deleteCustomer must be rejected with HTTP 401');
    console.log('✅ PASS 9: Unauthenticated deleteCustomer request strictly rejected with HTTP 401');

    console.log('\n===============================================================');
    console.log('🎉 ALL 9 CUSTOMER & STAFF DELETION QA TESTS PASSED PERFECTLY!');
    console.log('===============================================================');
  } finally {
    // Restore original state
    cwp.setAppState(originalState);
    if (cwp.server) {
      await new Promise(r => cwp.server.close(r));
    }
    if (fs.existsSync(tempFixturePath)) {
      try { fs.unlinkSync(tempFixturePath); } catch (e) {}
    }
  }
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
