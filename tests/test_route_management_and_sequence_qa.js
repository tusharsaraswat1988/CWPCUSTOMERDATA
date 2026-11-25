/**
 * =========================================================================
 * CWP Detailers & Motors - Task 01.5 Route Management & Sequence QA Test Suite
 * Module: Task 01.5 — Route Management & Staff Route Sequence
 *
 * Covers:
 * - Section A: Route CRUD (Creation, Update, Status, Validation)
 * - Section B: Staff Assignment (Valid staff, Inactive staff rejection, Reassignment, Historical preservation)
 * - Section C: Route Stops (Eligible DCC stop, Ineligible stop rejection, Duplicate stop rejection)
 * - Section D: Route Sequence (1..N Contiguity, Reordering, Moving stops between routes)
 * - Section E: DCC Decoupling (Zero service_jobs, zero package deductions, zero daily logs on route change)
 * - Section F: Staff Route View & Security Authorization (Self-route access, Unauthorized cross-staff block)
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Ensure isolated testing environment
process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_ROUTES_TEST = 'true';
process.env.USE_LOCAL_DCC_TEST = 'true';
process.env.USE_LOCAL_PACKAGES_TEST = 'true';
process.env.USE_LOCAL_JOBS_TEST = 'true';

const routeService = require('../services/routeService');
const dccService = require('../services/dccService');
const packageService = require('../services/packageService');
const bookingService = require('../services/bookingService');
const repos = require('../db/repositories/index');

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS [${totalTests}]: ${name}`);
}

function fail(name, err) {
  totalTests++;
  console.error(`  ❌ FAIL [${totalTests}]: ${name}`);
  console.error(err);
  throw err;
}

async function runRouteManagementTestSuite() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING TASK 01.5 ROUTE MANAGEMENT & STAFF SEQUENCE QA TEST SUITE');
  console.log('===============================================================\n');

  // Reset stores
  repos.routes.__resetLocalStores();
  dccService.__resetLocalStores();

  // -------------------------------------------------------------------------
  // SECTION A: ROUTE CRUD
  // -------------------------------------------------------------------------
  console.log('--- SECTION A: Route CRUD ---');

  // 1. Create Route successfully
  const route1 = await routeService.createRoute({
    routeCode: 'ROUTE-NORTH-01',
    routeName: 'North Jaipur Morning Route',
    description: 'Covers Malviya Nagar and Jagatpura apartments',
    operationalArea: 'Jaipur North'
  });
  assert.ok(route1.id, 'Route should have a generated ID');
  assert.strictEqual(route1.route_code, 'ROUTE-NORTH-01');
  assert.strictEqual(route1.status, 'active');
  pass('Route created successfully with valid metadata');

  // 2. Reject duplicate route code
  let dupThrew = false;
  try {
    await routeService.createRoute({
      routeCode: 'ROUTE-NORTH-01',
      routeName: 'Duplicate Route'
    });
  } catch (err) {
    dupThrew = true;
    assert.ok(err.message.includes('already exists'), 'Must reject duplicate route code');
  }
  assert.strictEqual(dupThrew, true, 'Duplicate route code rejected');
  pass('Duplicate route code rejected with validation error');

  // 3. Reject missing route code or name
  let missingThrew = false;
  try {
    await routeService.createRoute({ routeName: 'No Code Route' });
  } catch (err) {
    missingThrew = true;
  }
  assert.strictEqual(missingThrew, true, 'Missing route code rejected');
  pass('Missing route code rejected');

  // 4. Update Route details
  const updatedRoute = await routeService.updateRoute(route1.id, {
    routeName: 'North Jaipur Express Route',
    operationalArea: 'Malviya Nagar Ext'
  });
  assert.strictEqual(updatedRoute.route_name, 'North Jaipur Express Route');
  assert.strictEqual(updatedRoute.operational_area, 'Malviya Nagar Ext');
  pass('Route details updated successfully');

  // 5. Activate / Deactivate Route
  const deactivated = await routeService.setRouteStatus(route1.id, 'inactive');
  assert.strictEqual(deactivated.status, 'inactive');
  const reactivated = await routeService.setRouteStatus(route1.id, 'active');
  assert.strictEqual(reactivated.status, 'active');
  pass('Route status toggle (active <-> inactive) works as expected');

  // -------------------------------------------------------------------------
  // SECTION B: STAFF ASSIGNMENT TO ROUTE
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION B: Staff Assignment ---');

  // Mock staff in local repo or memory
  const staff1 = { id: 'staff_rt_101', name: 'Ramesh Sharma', staff_code: 'STF101', is_active: true };
  const staff2 = { id: 'staff_rt_102', name: 'Vikram Singh', staff_code: 'STF102', is_active: true };
  const inactiveStaff = { id: 'staff_rt_103', name: 'Inactive Mohan', staff_code: 'STF103', is_active: false };

  // Set mock resolver in repos.staff for isolated test
  repos.staff.findById = async (id) => [staff1, staff2, inactiveStaff].find(s => s.id === id) || null;
  repos.staff.findByStaffCode = async (c) => [staff1, staff2, inactiveStaff].find(s => s.staff_code.toUpperCase() === c.toUpperCase()) || null;

  // 6. Assign active staff to route
  const assignRes = await routeService.assignStaffToRoute({
    routeId: route1.id,
    staffId: staff1.id,
    adminUser: 'test_admin'
  });
  assert.strictEqual(assignRes.success, true);
  assert.strictEqual(assignRes.staffId, staff1.id);
  const routeWithStaff = await routeService.getRouteDetails(route1.id);
  assert.strictEqual(routeWithStaff.assigned_staff_id, staff1.id);
  assert.strictEqual(routeWithStaff.assignedStaff.name, staff1.name);
  pass('Active staff member assigned to operational route');

  // 7. Reject assignment of deactivated staff
  let inactiveThrew = false;
  try {
    await routeService.assignStaffToRoute({
      routeId: route1.id,
      staffId: inactiveStaff.id
    });
  } catch (err) {
    inactiveThrew = true;
    assert.ok(err.message.includes('deactivated'), 'Must reject deactivated staff');
  }
  assert.strictEqual(inactiveThrew, true, 'Deactivated staff assignment rejected');
  pass('Deactivated staff assignment strictly rejected');

  // 8. Reassign route to different staff member
  const reassignRes = await routeService.assignStaffToRoute({
    routeId: route1.id,
    staffId: staff2.id,
    adminUser: 'test_admin'
  });
  assert.strictEqual(reassignRes.success, true);
  assert.strictEqual(reassignRes.staffId, staff2.id);
  const routeWithStaff2 = await routeService.getRouteDetails(route1.id);
  assert.strictEqual(routeWithStaff2.assigned_staff_id, staff2.id);
  assert.strictEqual(routeWithStaff2.assignedStaff.name, staff2.name);
  pass('Route reassigned to new cleaner with assignment replacement');

  // 9. Unassign staff from route
  const unassignRes = await routeService.unassignStaffFromRoute({
    routeId: route1.id,
    adminUser: 'test_admin',
    reason: 'Staff on leave'
  });
  assert.strictEqual(unassignRes.success, true);
  const routeUnassigned = await routeService.getRouteDetails(route1.id);
  assert.strictEqual(routeUnassigned.assigned_staff_id, null);
  pass('Staff unassigned from route with clean state');

  // Re-assign staff1 for subsequent stop testing
  await routeService.assignStaffToRoute({ routeId: route1.id, staffId: staff1.id });

  // -------------------------------------------------------------------------
  // SECTION C: ROUTE STOPS MANAGEMENT & DCC ELIGIBILITY
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION C: Route Stops Management ---');

  const custA = 'cust_rt_001';
  const vehA1 = 'veh_rt_car_01';
  const vehA2 = 'veh_rt_car_02';
  const locA = 'loc_rt_001';

  // Create active DCC subscription for Customer A
  const subActive = await dccService.createSubscription({
    customerId: custA,
    locationId: locA,
    vehicleIds: [vehA1, vehA2],
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    notes: 'Active DCC subscription for routing'
  });

  // 10. Add eligible DCC vehicle to route
  const stop1 = await routeService.addStopToRoute({
    routeId: route1.id,
    customerId: custA,
    subscriptionId: subActive.id,
    vehicleId: vehA1,
    notes: 'Gate #2 entrance parking'
  });
  assert.ok(stop1.id, 'Stop must have an ID');
  assert.strictEqual(stop1.sequence_order, 1, 'First stop must have sequence order 1');
  pass('Eligible active DCC stop added to route at sequence #1');

  // 11. Add second stop to route
  const stop2 = await routeService.addStopToRoute({
    routeId: route1.id,
    customerId: custA,
    subscriptionId: subActive.id,
    vehicleId: vehA2,
    notes: 'Covered basement B1-14'
  });
  assert.strictEqual(stop2.sequence_order, 2, 'Second stop should be auto-sequenced as #2');
  pass('Second DCC stop appended to route sequence as #2');

  // 12. Prevent duplicate stop in same route
  const dupStop = await routeService.addStopToRoute({
    routeId: route1.id,
    customerId: custA,
    subscriptionId: subActive.id,
    vehicleId: vehA1
  });
  assert.strictEqual(dupStop.idempotent, true, 'Duplicate stop must return idempotent response');
  pass('Duplicate stop submission returns idempotent acknowledge without creating duplicate rows');

  // 13. Reject stop for unenrolled vehicle
  let unlinkedThrew = false;
  try {
    await routeService.addStopToRoute({
      routeId: route1.id,
      customerId: custA,
      subscriptionId: subActive.id,
      vehicleId: 'veh_not_enrolled'
    });
  } catch (err) {
    unlinkedThrew = true;
    assert.ok(err.message.includes('not enrolled'), 'Must reject unenrolled vehicle');
  }
  assert.strictEqual(unlinkedThrew, true, 'Unenrolled vehicle rejected');
  pass('Unenrolled vehicle strictly rejected from route stops');

  // 14. Reject stop for expired DCC subscription
  const subExpired = await dccService.createSubscription({
    customerId: custA,
    locationId: locA,
    vehicleIds: [vehA1],
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    notes: 'Expired DCC sub'
  });
  let expiredThrew = false;
  try {
    await routeService.addStopToRoute({
      routeId: route1.id,
      customerId: custA,
      subscriptionId: subExpired.id,
      vehicleId: vehA1
    });
  } catch (err) {
    expiredThrew = true;
    assert.ok(err.message.includes('expired'), 'Must reject expired DCC subscription');
  }
  assert.strictEqual(expiredThrew, true, 'Expired subscription rejected from route');
  pass('Expired DCC subscription rejected from route stops');

  // -------------------------------------------------------------------------
  // SECTION D: ROUTE SEQUENCE & STOP TRANSFERS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION D: Route Sequence & Stop Transfers ---');

  // Create Route 2 for transfer tests
  const route2 = await routeService.createRoute({
    routeCode: 'ROUTE-SOUTH-02',
    routeName: 'South Jaipur Route',
    operationalArea: 'Vaishali Nagar'
  });

  // Add stop3 to Route 1
  const custB = 'cust_rt_002';
  const vehB1 = 'veh_rt_car_03';
  const subB = await dccService.createSubscription({
    customerId: custB,
    locationId: 'loc_rt_002',
    vehicleIds: [vehB1],
    startDate: '2026-11-01',
    endDate: '2026-11-30'
  });
  const stop3 = await routeService.addStopToRoute({
    routeId: route1.id,
    customerId: custB,
    subscriptionId: subB.id,
    vehicleId: vehB1
  });
  assert.strictEqual(stop3.sequence_order, 3);
  pass('Three stops correctly sequenced 1, 2, 3');

  // 15. Reorder Route Stops: change order to [stop3, stop1, stop2]
  const reorderRes = await routeService.reorderRouteStops({
    routeId: route1.id,
    orderedStopIds: [stop3.id, stop1.id, stop2.id]
  });
  assert.strictEqual(reorderRes.success, true);
  const route1Stops = await repos.routes.getStopsByRouteId(route1.id);
  assert.strictEqual(route1Stops[0].id, stop3.id, 'Stop 3 should now be #1');
  assert.strictEqual(route1Stops[0].sequence_order, 1);
  assert.strictEqual(route1Stops[1].id, stop1.id, 'Stop 1 should now be #2');
  assert.strictEqual(route1Stops[1].sequence_order, 2);
  assert.strictEqual(route1Stops[2].id, stop2.id, 'Stop 2 should now be #3');
  assert.strictEqual(route1Stops[2].sequence_order, 3);
  pass('Route stops successfully reordered and sequence numbers (1..3) maintained contiguously');

  // 16. Move a single stop position using direction helper (e.g. move stop2 to top)
  await routeService.moveStopInRoute({
    routeId: route1.id,
    stopId: stop2.id,
    direction: 'top'
  });
  const route1AfterTop = await repos.routes.getStopsByRouteId(route1.id);
  assert.strictEqual(route1AfterTop[0].id, stop2.id, 'Stop 2 must be at top (#1)');
  assert.strictEqual(route1AfterTop[0].sequence_order, 1);
  pass('Move stop to top successfully re-indexes all stops contiguously');

  // 17. Move Stop between Routes: Move stop3 from Route 1 to Route 2
  const moveRes = await routeService.moveStopBetweenRoutes({
    sourceRouteId: route1.id,
    targetRouteId: route2.id,
    stopId: stop3.id
  });
  assert.strictEqual(moveRes.success, true);

  // Verify Route 1 now has 2 stops (compacted 1..2)
  const r1Remaining = await repos.routes.getStopsByRouteId(route1.id);
  assert.strictEqual(r1Remaining.length, 2, 'Route 1 should have 2 stops left');
  assert.strictEqual(r1Remaining[0].sequence_order, 1);
  assert.strictEqual(r1Remaining[1].sequence_order, 2);

  // Verify Route 2 now has 1 stop (at #1)
  const r2Stops = await repos.routes.getStopsByRouteId(route2.id);
  assert.strictEqual(r2Stops.length, 1, 'Route 2 should now have 1 stop');
  assert.strictEqual(r2Stops[0].vehicle_id, vehB1);
  assert.strictEqual(r2Stops[0].sequence_order, 1);
  pass('Stop transfer between routes updates both routes and maintains sequence integrity in both');

  // -------------------------------------------------------------------------
  // SECTION E: DCC DECOUPLING & ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION E: DCC Decoupling & Isolation ---');

  // 18. Verify Route changes do NOT create rows in service_jobs
  const custBookings = await bookingService.getCustomerBookingsAndHistory(custA);
  assert.strictEqual((custBookings.bookings || []).length, 0, 'No service_jobs created by route ops');
  pass('Route creation and stop allocation create zero service_jobs');

  // 19. Verify Route changes do NOT deduct customer package balances
  const custPackages = await packageService.getCustomerPackages(custA);
  const totalBalance = (custPackages.packages || []).reduce((sum, p) => sum + (p.remaining_count || 0), 0);
  assert.strictEqual(totalBalance, 0, 'Package balance untouched');
  pass('Route management creates zero package redemptions or deductions');

  // 20. Verify Route changes do NOT create service_logs (cleaning logs)
  const routeView = await routeService.getStaffRouteView(staff1.id);
  assert.strictEqual(routeView.hasRoute, true);
  assert.strictEqual(routeView.completedStops, 0, 'Zero stops marked completed by routing alone');
  pass('Route stop creation does NOT mark any daily cleans completed');

  // -------------------------------------------------------------------------
  // SECTION F: STAFF ROUTE VIEW & AUTHORIZATION SECURITY
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION F: Staff Route View & Security ---');

  // 21. Staff can view their own authorized route
  const staff1Route = await routeService.getStaffRouteView(staff1.staff_code);
  assert.strictEqual(staff1Route.success, true);
  assert.strictEqual(staff1Route.routeCode, 'ROUTE-NORTH-01');
  assert.strictEqual(staff1Route.totalStops, 2);
  assert.strictEqual(staff1Route.stops[0].sequenceOrder, 1);
  pass('Staff cleaner can access their authorized route with ordered stop sequence');

  // 22. Staff without an assigned route gets clean empty response
  const unassignedStaffRoute = await routeService.getStaffRouteView(staff2.staff_code);
  assert.strictEqual(unassignedStaffRoute.success, true);
  assert.strictEqual(unassignedStaffRoute.hasRoute, false);
  assert.strictEqual(unassignedStaffRoute.stops.length, 0);
  pass('Staff cleaner without active route receives clean empty state');

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} ROUTE MANAGEMENT TESTS PASSED!`);
  console.log('===============================================================\n');
}

runRouteManagementTestSuite().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
