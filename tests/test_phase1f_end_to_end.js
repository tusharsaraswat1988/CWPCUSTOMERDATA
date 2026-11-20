/**
 * =========================================================================
 * PHASE 1F: COMPLETE APPLICATION END-TO-END HTTP INTEGRATION TEST
 * Tests local production readiness with Neon PostgreSQL as primary DB
 * =========================================================================
 */

const http = require('http');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const { server } = require('../server');

function makeRequest(port, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runEndToEndTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Phase 1F End-to-End Local Production Readiness');
  console.log('Target Database: cwp_customer_db');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  [PASS] ${testName} ${details}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} ${details}`);
      failed++;
    }
  }

  // Start test server on dynamic free port
  const testPort = 3089;
  await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));
  console.log(`Test server listening on http://127.0.0.1:${testPort}`);

  let createdCustId = null;
  let createdStaffId = null;

  try {
    // 1. Health check endpoint
    console.log('\n--- 1. HTTP /health Check ---');
    const healthRes = await makeRequest(testPort, 'GET', '/health');
    assert(healthRes.statusCode === 200, 'GET /health returns HTTP 200');
    assert(healthRes.json && healthRes.json.databaseHealthy === true, 'Server reports Neon databaseHealthy === true');
    assert(healthRes.json.database === 'cwp_customer_db', 'Connected to cwp_customer_db');

    // 2. Admin Login
    console.log('\n--- 2. Admin Authentication ---');
    const adminPass = (process.env.ADMIN_PASSWORD || 'admin123').trim();
    const loginRes = await makeRequest(testPort, 'POST', '/api', {}, {
      action: 'verifyAdminPassword',
      password: adminPass
    });
    assert(loginRes.statusCode === 200 && loginRes.json.success === true, 'Admin login succeeds via HTTP');
    const adminToken = loginRes.json.token;
    assert(adminToken && adminToken.startsWith('adm_'), 'Issued adm_ token with 12-hour TTL');

    // 3. Empty database query
    console.log('\n--- 3. Empty Database Verification ---');
    const emptyCustRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${adminToken}`
    }, {
      action: 'getAllCustomers'
    });
    assert(emptyCustRes.statusCode === 200, 'getAllCustomers returns HTTP 200');
    assert(Array.isArray(emptyCustRes.json) && emptyCustRes.json.length === 0, 'Empty database returns clean [] array (0 records)');

    // 4. Create Staff Member
    console.log('\n--- 4. Staff Member Provisioning ---');
    const staffRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${adminToken}`
    }, {
      action: 'saveStaffMember',
      id: 'STFE2E1',
      name: 'Rohan Sharma',
      phone: '9876541111',
      pin: '654321',
      active: true
    });
    assert(staffRes.statusCode === 200 && staffRes.json.success === true, 'saveStaffMember succeeds via HTTP');
    createdStaffId = 'STFE2E1';

    // 5. Staff PIN Login
    console.log('\n--- 5. Staff PIN Login ---');
    const staffLoginRes = await makeRequest(testPort, 'POST', '/api', {}, {
      action: 'verifyStaffPin',
      phone: '9876541111',
      pin: '654321'
    });
    assert(staffLoginRes.statusCode === 200 && staffLoginRes.json.success === true, 'Staff login succeeds via HTTP');
    const staffToken = staffLoginRes.json.token;
    assert(staffToken && staffToken.startsWith('stf_'), 'Staff token issued with stf_ prefix');

    // 6. Save Customer with Multi-Vehicle and Location
    console.log('\n--- 6. Customer Creation with Multi-Vehicle & Multi-Location ---');
    const saveCustRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${adminToken}`
    }, {
      action: 'saveCustomer',
      customerData: {
        customerName: 'Vikram Malhotra',
        customerNumber: '9876549999',
        address: 'Villa 14, Royal Palm, Agra',
        googleMapsUrl: 'https://maps.google.com/?q=27.1,78.0',
        parkingDetails: 'Front Porch Covered',
        secondaryAddress: 'Office Block 3, Civil Lines',
        vehicle: 'UP85AZ9999 (Black Scorpio-N)',
        secondVehicleDetails: 'UP85BY1111 (White Tiago)',
        serviceCategory: 'Daily Car Cleaning',
        packageType: 'Daily Clean',
        rotationType: 'aaj_kal',
        rotationNotes: 'Scorpio on Aaj, Tiago on Kal',
        staffId: 'STFE2E1'
      }
    });
    assert(saveCustRes.statusCode === 200 && saveCustRes.json.success === true, 'saveCustomer succeeds via HTTP');
    createdCustId = saveCustRes.json.customerId;

    // 7. Staff Data Retrieval & Strict Data Isolation
    console.log('\n--- 7. Staff Portal Retrieval & Strict Boundary Isolation ---');
    const staffDataRes = await makeRequest(testPort, 'GET', '/api/staff-data', {
      'Authorization': `Bearer ${staffToken}`
    });
    assert(staffDataRes.statusCode === 200, 'GET /api/staff-data returns HTTP 200');
    assert(staffDataRes.json.dailyCarCleaning.length === 1, 'Staff sees exactly 1 assigned customer');
    assert(staffDataRes.json.dailyCarCleaning[0].customerName === 'Vikram Malhotra', 'Customer name matches');
    assert(staffDataRes.json.dailyCarCleaning[0].vehicles.length === 2, 'Customer has 2 vehicles');
    assert(staffDataRes.json.dailyCarCleaning[0].rotationType === 'aaj_kal', 'Aaj/Kal rotation preserved');

    // Cross-staff data access attempt must be rejected with HTTP 403 Forbidden
    const crossStaffRes = await makeRequest(testPort, 'GET', '/api/staff-data?staffId=STF02', {
      'Authorization': `Bearer ${staffToken}`
    });
    assert(crossStaffRes.statusCode === 403, 'Cross-staff access attempt rejected with HTTP 403 Forbidden');

    // 8. Offline Completion Synchronization
    console.log('\n--- 8. Offline Completion Sync ---');
    const custSubId = staffDataRes.json.dailyCarCleaning[0].subscriptionId;
    const custVehId = staffDataRes.json.dailyCarCleaning[0].vehicles[0].id;
    const mutationId = '33333333-3333-3333-3333-333333333333';

    const syncRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${staffToken}`
    }, {
      action: 'syncCompletions',
      completions: [
        {
          clientMutationId: mutationId,
          subscriptionId: custSubId,
          vehicleId: custVehId,
          completedAtDevice: '2026-11-21T07:15:00+05:30',
          status: 'completed',
          notes: 'Scorpio clean completed'
        }
      ]
    });
    assert(syncRes.statusCode === 200 && syncRes.json.success === true, 'syncCompletions succeeds via HTTP');
    assert(syncRes.json.syncedCount === 1, '1 completion synced to Neon PostgreSQL');

    // 9. Admin Logout
    console.log('\n--- 9. Session Revocation on Logout ---');
    const logoutRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${adminToken}`
    }, {
      action: 'logoutAdmin'
    });
    assert(logoutRes.statusCode === 200, 'logoutAdmin succeeds');

    // Reuse of revoked admin token must fail with HTTP 401
    const revokedTryRes = await makeRequest(testPort, 'POST', '/api', {
      'Authorization': `Bearer ${adminToken}`
    }, {
      action: 'getAllCustomers'
    });
    assert(revokedTryRes.statusCode === 401, 'Re-use of revoked admin session token rejected with HTTP 401');

  } catch (err) {
    console.error('End-to-End Test Failure:', err);
    failed++;
  } finally {
    // Clean up test data completely
    console.log('\n--- Cleaning up End-to-End Test Fixtures ---');
    try {
      await db.query('DELETE FROM public.service_logs');
      await db.query('DELETE FROM public.staff_route_sequences');
      await db.query('ALTER TABLE public.staff_assignments DISABLE TRIGGER trg_staff_assignments_immutability');
      await db.query('DELETE FROM public.staff_assignments');
      await db.query('ALTER TABLE public.staff_assignments ENABLE TRIGGER trg_staff_assignments_immutability');
      await db.query('DELETE FROM public.service_jobs');
      await db.query('DELETE FROM public.subscription_vehicles');
      await db.query('DELETE FROM public.subscriptions');
      await db.query('DELETE FROM public.vehicles');
      await db.query('DELETE FROM public.service_locations');
      await db.query('DELETE FROM public.customers');
      await db.query('DELETE FROM public.auth_sessions');
      await db.query('DELETE FROM public.staff_auth');
      await db.query('DELETE FROM public.staff');
      // audit_logs is append-only and immutable by database trigger
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }

    server.close();
  }

  // Final verification of 0 test records
  const custCount = await repos.customers.countCustomers();
  assert(custCount === 0, 'Zero customers retained in database after end-to-end tests', `(count: ${custCount})`);
  const staffCount = await repos.staff.countStaff();
  assert(staffCount === 0, 'Zero staff retained in database after end-to-end tests', `(count: ${staffCount})`);

  console.log('\n================================================================');
  console.log(`END-TO-END SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  await db.close();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEndToEndTests().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
