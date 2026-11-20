/**
 * Automated Verification Suite for Phase 1F: 15 Database Repositories
 * Executes within a clean transaction or cleans up fixtures, ensuring zero test data remains.
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');

async function runRepoTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Phase 1F Database Repositories & Integrity');
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

  // 1. Health check
  console.log('--- 1. Health Check & Connection ---');
  const health = await db.healthCheck();
  assert(health.healthy === true, 'Database is healthy and reachable');
  assert(health.database === 'cwp_customer_db', `Connected to exact database 'cwp_customer_db' (got: ${health.database})`);

  // 2. Service categories (already seeded)
  console.log('\n--- 2. Service Categories Repository ---');
  const cats = await repos.serviceCategories.findAll();
  assert(cats.length === 3, 'Service categories has exactly 3 records', `(count: ${cats.length})`);
  const dcCat = await repos.serviceCategories.findById('daily_car_cleaning');
  assert(dcCat && dcCat.display_name === 'Daily Car Cleaning', 'daily_car_cleaning category found');

  // We test the remaining 14 repositories inside a managed transaction that is cleanly rolled back
  console.log('\n--- 3-15. Transactional Testing of 14 Repositories ---');
  await db.withTransaction(async (client) => {
    // 3. Admin Users
    const admin = await repos.adminUsers.createAdmin({
      username: 'test_superadmin_p1f',
      phone: '9876543210',
      passwordHash: 'scrypt:test:dummyhash',
      role: 'superadmin'
    }, client);
    assert(admin && admin.id, 'adminUsers.createAdmin successful', `id: ${admin.id}`);
    const foundAdmin = await repos.adminUsers.findByUsername('test_superadmin_p1f', client);
    assert(foundAdmin && foundAdmin.id === admin.id, 'adminUsers.findByUsername matches');

    // 4. Staff
    const staff = await repos.staff.createStaff({
      staffCode: 'STF99',
      name: 'Test Staff 99',
      phone: '9876500099',
      isActive: true
    }, client);
    assert(staff && staff.id, 'staff.createStaff successful', `staffCode: ${staff.staff_code}`);
    const foundStaff = await repos.staff.findByStaffCode('STF99', client);
    assert(foundStaff && foundStaff.id === staff.id, 'staff.findByStaffCode matches');

    // 5. Staff Auth
    const staffAuth = await repos.staffAuth.setPin(staff.id, 'scrypt:salt:hash', 'salt', client);
    assert(staffAuth && staffAuth.staff_id === staff.id, 'staffAuth.setPin successful');
    const authLookup = await repos.staffAuth.findByStaffId(staff.id, client);
    assert(authLookup && authLookup.pin_hash === 'scrypt:salt:hash', 'staffAuth.findByStaffId matches');

    // 6. Auth Sessions
    const session = await repos.authSessions.createSession({
      tokenHash: 'dummy_token_hash_phase1f_99',
      userType: 'staff',
      staffId: staff.id,
      expiresAt: new Date(Date.now() + 43200000),
      ipAddress: '127.0.0.1',
      userAgent: 'TestRunner/1.0'
    }, client);
    assert(session && session.id, 'authSessions.createSession successful');
    const activeSess = await repos.authSessions.findActiveSession('dummy_token_hash_phase1f_99', client);
    assert(activeSess && activeSess.staff_name === 'Test Staff 99', 'authSessions.findActiveSession joins staff info');
    const revoked = await repos.authSessions.revokeSession('dummy_token_hash_phase1f_99', 'test', client);
    assert(revoked && revoked.revoked_at !== null, 'authSessions.revokeSession sets revoked_at');

    // 7. Customers
    const customer = await repos.customers.createCustomer({
      customerCode: 'CUST_TEST_99',
      name: 'Test Customer 99',
      phone: '9876511199',
      notes: 'Test customer notes'
    }, client);
    assert(customer && customer.id, 'customers.createCustomer successful', `code: ${customer.customer_code}`);
    const foundCust = await repos.customers.findById(customer.id, client);
    assert(foundCust && foundCust.name === 'Test Customer 99', 'customers.findById matches');

    // 8. Service Locations
    const loc = await repos.serviceLocations.createLocation({
      customerId: customer.id,
      addressType: 'primary',
      addressText: 'Flat 101, Test Residency, Sector 10',
      googleMapsUrl: 'https://maps.google.com/?q=27.1,78.1',
      parkingDetails: 'Tower B, Basement Stilt'
    }, client);
    assert(loc && loc.id, 'serviceLocations.createLocation successful');
    const foundLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
    assert(foundLocs.length === 1 && foundLocs[0].id === loc.id, 'serviceLocations.findByCustomerId matches');

    // 9. Vehicles (with compound FK default_location_id)
    const veh = await repos.vehicles.createVehicle({
      customerId: customer.id,
      defaultLocationId: loc.id,
      registrationNo: 'UP85TEST99',
      brandOrModel: 'White Creta',
      vehicleType: 'Car'
    }, client);
    assert(veh && veh.id, 'vehicles.createVehicle successful', `reg: ${veh.registration_no}`);

    // Test Compound Foreign Key Enforcement on cross-customer location
    const otherCustomer = await repos.customers.createCustomer({
      customerCode: 'CUST_TEST_OTHER',
      name: 'Other Customer',
      phone: '9876522299'
    }, client);
    let crossCustBlocked = false;
    await client.query('SAVEPOINT sp_cross_cust');
    try {
      // Trying to attach customer.id's location to otherCustomer's vehicle
      await repos.vehicles.createVehicle({
        customerId: otherCustomer.id,
        defaultLocationId: loc.id, // Belong to customer.id!
        registrationNo: 'UP85OTHER',
        brandOrModel: 'Red Baleno'
      }, client);
    } catch (e) {
      crossCustBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT sp_cross_cust');
    }
    assert(crossCustBlocked === true, 'Compound FK blocks cross-customer vehicle location assignment');

    // 10. Subscriptions
    const sub = await repos.subscriptions.createSubscription({
      customerId: customer.id,
      serviceCategoryId: 'daily_car_cleaning',
      packageName: 'Daily Clean',
      packagesPurchased: 1,
      rotationType: 'aaj_kal',
      rotationNotes: 'Clean Creta on Aaj, Baleno on Kal'
    }, client);
    assert(sub && sub.id, 'subscriptions.createSubscription successful');

    // 11. Subscription Vehicles
    const subVeh = await repos.subscriptionVehicles.addVehicleToSubscription({
      subscriptionId: sub.id,
      customerId: customer.id,
      vehicleId: veh.id,
      locationId: loc.id,
      scheduleTag: 'aaj'
    }, client);
    assert(subVeh && subVeh.id, 'subscriptionVehicles.addVehicleToSubscription successful');

    // 12. Staff Assignments
    const assign = await repos.staffAssignments.assignStaffToSubscription({
      staffId: staff.id,
      subscriptionId: sub.id,
      assignedBy: 'test_admin'
    }, client);
    assert(assign && assign.id && assign.is_active === true, 'staffAssignments.assignStaffToSubscription successful');

    // Test Staff Assignment Immutability Trigger: Prohibit hard delete
    let assignDeleteBlocked = false;
    await client.query('SAVEPOINT sp_assign_del');
    try {
      await client.query('DELETE FROM public.staff_assignments WHERE id = $1', [assign.id]);
    } catch (e) {
      assignDeleteBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT sp_assign_del');
    }
    assert(assignDeleteBlocked === true, 'Trigger trg_staff_assignments_immutability blocks DELETE');

    // 13. Staff Route Sequences
    const route = await repos.staffRouteSequences.setStaffRoute(staff.id, [
      { subscriptionId: sub.id, subscriptionVehicleId: subVeh.id }
    ], 'test_admin', client);
    assert(route && route.length === 1, 'staffRouteSequences.setStaffRoute successful');
    const fetchedRoute = await repos.staffRouteSequences.getStaffRoute(staff.id, client);
    assert(fetchedRoute && fetchedRoute[0].customer_name === 'Test Customer 99', 'staffRouteSequences.getStaffRoute joins correctly');

    // 14. Service Jobs (Car washing and Solar)
    const washJob = await repos.serviceJobs.createJob({
      customerId: customer.id,
      vehicleId: veh.id,
      locationId: loc.id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Foam Wash & Polish',
      status: 'assigned'
    }, client);
    assert(washJob && washJob.id, 'serviceJobs.createJob (car_washing) successful');

    const solarJob = await repos.serviceJobs.createJob({
      customerId: customer.id,
      locationId: loc.id,
      serviceCategoryId: 'solar_cleaning',
      serviceType: 'Rooftop 5kW Solar Panels',
      siteDetails: { panelCount: 12, roofAccess: 'External Ladder' },
      status: 'assigned'
    }, client);
    assert(solarJob && solarJob.id, 'serviceJobs.createJob (solar_cleaning) successful');

    // 15. Service Logs (Offline Sync & IST Check)
    const mutationId = '00000000-0000-0000-0000-000000000099';
    const logResult = await repos.serviceLogs.recordCompletion({
      clientMutationId: mutationId,
      staffId: staff.id,
      subscriptionId: sub.id,
      vehicleId: veh.id,
      completedAtDevice: '2026-11-21T07:30:00+05:30',
      notes: 'Completed clean'
    }, client);
    assert(logResult.inserted === true, 'serviceLogs.recordCompletion inserted log');
    const istDate = repos.serviceLogs.computeIstServiceDate(logResult.log.service_date);
    assert(istDate === '2026-11-21', 'service_date matched IST device timestamp', `(got: ${istDate})`);

    // Test Idempotency with exact same client_mutation_id
    const dupResult = await repos.serviceLogs.recordCompletion({
      clientMutationId: mutationId,
      staffId: staff.id,
      subscriptionId: sub.id,
      vehicleId: veh.id,
      completedAtDevice: '2026-11-21T07:30:00+05:30'
    }, client);
    assert(dupResult.inserted === false && dupResult.idempotent === true, 'serviceLogs idempotent retry acknowledged');

    // 16. Audit Logs & Trigger
    const audit = await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'create',
      changedBy: 'test_admin',
      afterState: { name: 'Test Customer 99' }
    }, client);
    assert(audit && audit.id, 'auditLogs.logChange successful');

    // Test trigger prevent_audit_logs_mutation
    let auditMutationBlocked = false;
    await client.query('SAVEPOINT sp_audit_mut');
    try {
      await client.query('UPDATE public.audit_logs SET action = \'hacked\' WHERE id = $1', [audit.id]);
    } catch (e) {
      auditMutationBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT sp_audit_mut');
    }
    assert(auditMutationBlocked === true, 'Trigger prevent_audit_logs_mutation blocks UPDATE');

    // ROLLBACK transaction so no test records remain in database
    throw new Error('ROLLBACK_TEST_TRANSACTION_CLEANLY');
  }).catch((err) => {
    if (err.message === 'ROLLBACK_TEST_TRANSACTION_CLEANLY') {
      console.log('\n  [ROLLBACK]: Test transaction cleanly rolled back. Zero test records retained.');
    } else {
      console.error('Unexpected error in transaction:', err);
      failed++;
    }
  });

  // Verify that database tables still contain 0 business records
  console.log('\n--- Final Business Record Count Verification ---');
  const custCount = await repos.customers.countCustomers();
  assert(custCount === 0, 'customers table has 0 records after test rollback', `(count: ${custCount})`);
  const staffCount = await repos.staff.countStaff();
  assert(staffCount === 0, 'staff table has 0 records after test rollback', `(count: ${staffCount})`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  await db.close();
  if (failed > 0) {
    process.exit(1);
  }
}

runRepoTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
