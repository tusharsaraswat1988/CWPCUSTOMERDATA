/**
 * Test Suite: Staff Route Assignment & UUID Validation QA
 * Verifies permanent fix for "invalid input syntax for type uuid: 'STF01'"
 */
const assert = require('assert');
const repos = require('../db/repositories');
const routeService = require('../services/routeService');
const serverModule = require('../server');

function pass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING STAFF ROUTE ASSIGNMENT & UUID SAFETY QA TESTS');
  console.log('===============================================================\n');

  // Test 1: repos.staff.findById returns null for non-UUID strings
  console.log('--- TEST 1: repos.staff.findById non-UUID safety ---');
  const nonUuidResult = await repos.staff.findById('STF01');
  assert.strictEqual(nonUuidResult, null, 'Must return null for non-UUID string without throwing');
  pass('repos.staff.findById safely returns null for "STF01" without Postgres error');

  // Test 2: repos.routes.findRouteByAssignedStaffId non-UUID safety
  console.log('\n--- TEST 2: repos.routes.findRouteByAssignedStaffId non-UUID safety ---');
  const routeByStaffResult = await repos.routes.findRouteByAssignedStaffId('STF01');
  assert.strictEqual(routeByStaffResult, null, 'Must return null for non-UUID staffId');
  pass('repos.routes.findRouteByAssignedStaffId safely handles non-UUID staffId');

  // Test 3: server.js sanitizeStaffForAdmin preserves dbId, staffCode, staff_code
  console.log('\n--- TEST 3: sanitizeStaffForAdmin and sanitizeStaffForPublic preservation ---');
  const rawStaffAdmin = {
    id: 'STF01',
    dbId: '00000000-0000-4000-8000-000000000001',
    name: 'Gaurav Kr Gupta',
    is_active: true,
    displayPin: '123456'
  };
  const sanitizedAdmin = serverModule.sanitizeStaffForAdmin(rawStaffAdmin);
  assert.strictEqual(sanitizedAdmin.id, 'STF01', 'id remains staff_code for UI backward compatibility');
  assert.strictEqual(sanitizedAdmin.dbId, '00000000-0000-4000-8000-000000000001', 'dbId UUID is preserved');
  assert.strictEqual(sanitizedAdmin.staffId, '00000000-0000-4000-8000-000000000001', 'staffId UUID is populated');
  assert.strictEqual(sanitizedAdmin.staffCode, 'STF01', 'staffCode is preserved');
  assert.strictEqual(sanitizedAdmin.staff_code, 'STF01', 'staff_code is preserved');
  pass('sanitizeStaffForAdmin correctly preserves dbId, staffId, and staffCode');

  const sanitizedPublic = serverModule.sanitizeStaffForPublic(rawStaffAdmin);
  assert.strictEqual(sanitizedPublic.dbId, '00000000-0000-4000-8000-000000000001', 'public dbId UUID is preserved');
  assert.strictEqual(sanitizedPublic.staffCode, 'STF01', 'public staffCode is preserved');
  pass('sanitizeStaffForPublic correctly preserves dbId and staffCode');

  // Test 4: routeService.assignStaffToRoute with staff code
  console.log('\n--- TEST 4: routeService.assignStaffToRoute with staff code string ---');
  const testStaffCode = `STF_T${Date.now().toString().slice(-4)}`;
  const createdStaff = await repos.staff.createStaff({
    staffCode: testStaffCode,
    name: 'Gaurav Kr Gupta',
    phone: `9${Date.now().toString().slice(-9)}`,
    workType: 'dcc_only',
    serviceCapabilities: ['daily_car_cleaning']
  });
  assert.ok(createdStaff && createdStaff.id, 'Test staff created in repository');

  const testRoute = await routeService.createRoute({
    routeCode: `RT_TEST_${Date.now()}`,
    routeName: 'Test Operational Route',
    adminUser: 'test_admin'
  });
  assert.ok(testRoute && testRoute.id, 'Test route created');

  try {
    // 4a. Assign using staff code string (the exact flow that previously caused 22P02 error)
    const assignResult = await routeService.assignStaffToRoute({
      routeId: testRoute.id,
      staffId: testStaffCode,
      adminUser: 'test_admin'
    });

    assert.strictEqual(assignResult.success, true, 'Assignment with staff code must succeed');
    assert.strictEqual(assignResult.staffId, createdStaff.id, 'Returned staffId must be the canonical UUID');

    // Verify route was updated with staff UUID
    const updatedRoute = await routeService.getRouteDetails(testRoute.id);
    assert.strictEqual(updatedRoute.assigned_staff_id, createdStaff.id, 'Route assigned_staff_id must be staff UUID');
    assert.strictEqual(updatedRoute.assignedStaff.name, 'Gaurav Kr Gupta', 'assignedStaff.name must match');
    assert.strictEqual(updatedRoute.assignedStaff.staffCode, testStaffCode, 'assignedStaff.staffCode must match');
    pass(`assignStaffToRoute with staffId="${testStaffCode}" succeeds without UUID syntax error`);

    // 4b. Also assign using UUID directly (idempotent / reassign)
    const assignUuidResult = await routeService.assignStaffToRoute({
      routeId: testRoute.id,
      staffId: createdStaff.id,
      adminUser: 'test_admin'
    });
    assert.strictEqual(assignUuidResult.success, true, 'Assignment with canonical UUID succeeds');
    pass('assignStaffToRoute with canonical UUID also succeeds');
  } finally {
    // Clean up test data
    try { await routeService.deleteRoute(testRoute.id); } catch (_) {}
    try { await repos.staff.softDelete(createdStaff.id); } catch (_) {}
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL STAFF ROUTE ASSIGNMENT & UUID SAFETY QA TESTS PASSED!');
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
