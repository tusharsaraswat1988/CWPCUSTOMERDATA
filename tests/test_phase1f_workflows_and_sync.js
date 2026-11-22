/**
 * Automated Verification Suite for Phase 1F: Admin & Staff Workflows, Isolation, and Offline Sync
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');
const adminService = require('../services/adminService');
const staffPortalService = require('../services/staffPortalService');
const offlineSyncService = require('../services/offlineSyncService');

async function runWorkflowsAndSyncTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Phase 1F Admin & Staff Workflows, Isolation, Sync');
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

  let staff1 = null;
  let staff2 = null;
  let createdCustId = null;

  try {
    // -------------------------------------------------------------------------
    // 1. EMPTY DATABASE BEHAVIOR TEST
    // -------------------------------------------------------------------------
    console.log('--- 1. Empty Database Handling ---');
    const emptyCustomers = await adminService.getAllCustomers();
    assert(Array.isArray(emptyCustomers) && emptyCustomers.length === 0, 'Admin customer list handles empty database gracefully (returns [])');

    // -------------------------------------------------------------------------
    // 2. STAFF SETUP
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Staff Setup ---');
    const s1Res = await adminService.saveStaffMember({
      staffId: 'STF91',
      name: 'Ramesh Kumar',
      phone: '9876591001',
      pin: '123456',
      active: true
    }, 'test_admin');
    assert(s1Res.success === true, 'Staff 1 (STF91) created');

    const s2Res = await adminService.saveStaffMember({
      staffId: 'STF92',
      name: 'Suresh Verma',
      phone: '9876592002',
      pin: '654321',
      active: true
    }, 'test_admin');
    assert(s2Res.success === true, 'Staff 2 (STF92) created');

    staff1 = await repos.staff.findByStaffCode('STF91');
    staff2 = await repos.staff.findByStaffCode('STF92');

    // Check empty staff portal data when staff has no assignments
    const emptyStaffData = await staffPortalService.getStaffData('STF91');
    assert(emptyStaffData.dailyCarCleaning.length === 0, 'Empty staff portal dailyCarCleaning returns []');
    assert(emptyStaffData.carWashing.length === 0, 'Empty staff portal carWashing returns []');
    assert(emptyStaffData.solarCleaning.length === 0, 'Empty staff portal solarCleaning returns []');
    assert(emptyStaffData.totalCount === 0, 'Empty staff portal totalCount is 0');

    // -------------------------------------------------------------------------
    // 3. ADMIN CUSTOMER MANAGEMENT (Multi-vehicle & Multi-location)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Customer Creation with Multi-Vehicle & Multi-Location ---');
    const custRes = await adminService.saveCustomer({
      customerName: 'Anil Sharma',
      customerNumber: '9876543210',
      address: 'House 42, Green Park, Sector 5',
      googleMapsUrl: 'https://maps.google.com/?q=27.18,78.01',
      parkingDetails: 'Front Porch / Stilt',
      secondaryAddress: 'Office Plot 12, Cyber Hub',
      secondaryMapsUrl: 'https://maps.google.com/?q=27.20,78.05',
      secondaryParkingDetails: 'Basement B2 Bay 14',
      vehicle: 'UP85AB1234 (White Hyundai Creta)',
      secondVehicleDetails: 'UP85CD5678 (Red Maruti Swift)',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      serviceCategory: 'Daily Car Cleaning',
      packageType: 'Daily Clean',
      packagesPurchased: '2',
      rotationType: 'aaj_kal',
      rotationNotes: 'Creta on Aaj, Swift on Kal',
      staffId: 'STF91' // Assigned to Staff 1!
    }, 'test_admin');

    assert(custRes.success === true && custRes.customerId, 'Customer Anil Sharma created with multi-vehicle & multi-location');
    createdCustId = custRes.customerId;

    // Search tests
    console.log('\n--- 4. Customer Search Workflows ---');
    const searchByName = await adminService.getAllCustomers({ search: 'Anil' });
    assert(searchByName.length === 1 && searchByName[0].customerName === 'Anil Sharma', 'Search by customer name matches');

    const searchByPhone = await adminService.getAllCustomers({ search: '9876543210' });
    assert(searchByPhone.length === 1 && searchByPhone[0].customerNumber === '9876543210', 'Search by phone matches');

    const searchByCode = await adminService.getAllCustomers({ search: custRes.customerCode.slice(0, 10) });
    assert(searchByCode.length === 1, 'Search by customer code matches');

    // Verify multi-vehicle and multi-location in detailed view
    const custDetails = await adminService.getCustomerById(createdCustId);
    assert(custDetails.locations.length === 2, 'Customer has exactly 2 service locations');
    assert(custDetails.vehicles.length === 2, 'Customer has exactly 2 vehicles associated');
    assert(custDetails.assignedStaff && custDetails.assignedStaff.staff_code === 'STF91', 'Customer assigned to STF91');

    // -------------------------------------------------------------------------
    // 5. STAFF DATA ISOLATION (Strict Staff Boundary)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Staff Portal Data Isolation ---');
    const staff1Data = await staffPortalService.getStaffData('STF91');
    assert(staff1Data.dailyCarCleaning.length === 1, 'Staff 1 sees assigned customer Anil Sharma');
    assert(staff1Data.dailyCarCleaning[0].customerName === 'Anil Sharma', 'Customer name verified');
    assert(staff1Data.dailyCarCleaning[0].vehicles.length === 2, 'Staff 1 sees both vehicles for customer');
    assert(staff1Data.dailyCarCleaning[0].rotationType === 'aaj_kal', 'Aaj/Kal rotation instructions visible');

    // STRICT ISOLATION CHECK: Staff 2 MUST see ZERO records!
    const staff2Data = await staffPortalService.getStaffData('STF92');
    assert(staff2Data.dailyCarCleaning.length === 0, 'Staff 2 CANNOT see Staff 1 assignments (0 records returned)');
    assert(staff2Data.totalCount === 0, 'Staff 2 total count is strictly 0');

    // -------------------------------------------------------------------------
    // 6. ROUTE SEQUENCE MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Route Sequence Management ---');
    const subId = staff1Data.dailyCarCleaning[0].subscriptionId;
    const veh1Id = staff1Data.dailyCarCleaning[0].vehicles[0].id;
    const subVehId = staff1Data.dailyCarCleaning[0].vehicles[0].subVehId;

    const routeRes = await adminService.saveStaffSequence('STF91', [
      { subscriptionId: subId, subscriptionVehicleId: subVehId }
    ], 'test_admin');
    assert(routeRes.success === true, 'Staff 1 route sequence saved');

    const seqInfo = await adminService.getStaffSequence('STF91');
    assert(seqInfo.hasCustomSequence === true && seqInfo.sequences.length === 1, 'Staff 1 route sequence retrieved');

    // -------------------------------------------------------------------------
    // 7. ON-DEMAND SERVICE JOBS DISPATCH (Car Wash & Solar Cleaning)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. On-Demand Job Dispatch ---');
    // Dispatch Car Wash Job to Staff 2
    const washJob = await repos.serviceJobs.createJob({
      customerId: createdCustId,
      vehicleId: custDetails.vehicles[0].id,
      locationId: custDetails.locations[0].id,
      serviceCategoryId: 'car_washing',
      serviceType: 'Foam Wash & Interior Cleaning',
      scheduledDate: staffPortalService.getIstCurrentDate(),
      status: 'assigned',
      specialInstructions: 'Parked in porch'
    });
    await repos.staffAssignments.assignStaffToJob({
      staffId: staff2.id,
      jobId: washJob.id,
      assignedBy: 'test_admin'
    });

    // Dispatch Solar Job to Staff 2
    const solarJob = await repos.serviceJobs.createJob({
      customerId: createdCustId,
      locationId: custDetails.locations[0].id,
      serviceCategoryId: 'solar_cleaning',
      serviceType: 'Rooftop Solar 10 Panels',
      siteDetails: { panelCount: 10, roofAccess: 'Staircase' },
      scheduledDate: staffPortalService.getIstCurrentDate(),
      status: 'assigned',
      specialInstructions: 'Watch out for dog'
    });
    await repos.staffAssignments.assignStaffToJob({
      staffId: staff2.id,
      jobId: solarJob.id,
      assignedBy: 'test_admin'
    });

    // Check Staff 2 Portal Data: Should now see car wash and solar jobs, but STILL 0 daily cleans!
    const staff2UpdatedData = await staffPortalService.getStaffData('STF92');
    assert(staff2UpdatedData.dailyCarCleaning.length === 0, 'Staff 2 still has 0 daily car cleaning assignments');
    assert(staff2UpdatedData.carWashing.length === 1, 'Staff 2 sees dispatched Car Wash job');
    assert(staff2UpdatedData.solarCleaning.length === 1, 'Staff 2 sees dispatched Solar Cleaning job');
    assert(staff2UpdatedData.solarCleaning[0].siteDetails.panelCount === 10, 'Solar job site details accurately populated');

    // Check Staff 1 Portal Data: Must NOT see Staff 2's car wash or solar jobs!
    const staff1CheckJobs = await staffPortalService.getStaffData('STF91');
    assert(staff1CheckJobs.carWashing.length === 0, 'Staff 1 cannot see Staff 2 car wash jobs');
    assert(staff1CheckJobs.solarCleaning.length === 0, 'Staff 1 cannot see Staff 2 solar cleaning jobs');

    // -------------------------------------------------------------------------
    // 8. OFFLINE SYNCHRONIZATION, IDEMPOTENCY & CONFLICT HANDLING
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Offline Synchronization & Conflict Handling ---');
    const mutation1 = '11111111-1111-1111-1111-111111111111';
    const syncRes1 = await offlineSyncService.processCompletionBatch({
      staffCodeOrId: 'STF91',
      completions: [
        {
          clientMutationId: mutation1,
          subscriptionId: subId,
          vehicleId: veh1Id,
          completedAtDevice: '2026-11-21T07:15:00+05:30',
          status: 'completed',
          notes: 'Exterior clean done'
        }
      ]
    });

    assert(syncRes1.success === true && syncRes1.syncedCount === 1, 'Offline completion synced successfully');
    assert(syncRes1.results[0].status === 'synced', 'Result status is synced');

    // Test Idempotent Retry (Same clientMutationId re-sent after network restore)
    const retryRes = await offlineSyncService.processCompletionBatch({
      staffCodeOrId: 'STF91',
      completions: [
        {
          clientMutationId: mutation1,
          subscriptionId: subId,
          vehicleId: veh1Id,
          completedAtDevice: '2026-11-21T07:15:00+05:30',
          status: 'completed'
        }
      ]
    });
    assert(retryRes.success === true && retryRes.results[0].idempotent === true, 'Duplicate mutation acknowledged idempotently without error');

    // Test Conflict Resolution (e.g. Existing status was marked unavailable, staff uploads completion)
    const mutationConflict = '22222222-2222-2222-2222-222222222222';
    // First simulate admin or previous status
    await db.query(
      `UPDATE public.service_logs 
       SET status = 'customer_unavailable', notes = 'Admin note: gate locked' 
       WHERE client_mutation_id = $1`,
      [mutation1]
    );

    // Now Staff submits with new mutation ID for same subscription and vehicle on same date
    const conflictRes = await offlineSyncService.processCompletionBatch({
      staffCodeOrId: 'STF91',
      completions: [
        {
          clientMutationId: mutationConflict,
          subscriptionId: subId,
          vehicleId: veh1Id,
          completedAtDevice: '2026-11-21T07:45:00+05:30',
          status: 'completed',
          notes: 'Owner unlocked gate later'
        }
      ]
    });
    assert(conflictRes.success === true, 'Conflict resolution handled cleanly');
    assert(conflictRes.results[0].status === 'conflict_resolved', 'Conflict resolution status reported');

    // Verify conflict audit log
    const conflictLogs = await repos.auditLogs.queryLogs({ entityType: 'service_logs', limit: 5 });
    const hasConflictAudit = conflictLogs.some(l => l.action === 'conflict_resolution');
    assert(hasConflictAudit === true, 'Conflict resolution recorded in immutable audit_logs');

    // Verify Staff Portal shows completedToday for the vehicle
    const staff1CompletedData = await staffPortalService.getStaffData('STF91', { todayDate: '2026-11-21' });
    assert(staff1CompletedData.dailyCarCleaning[0].vehicles[0].completedToday === true, 'Staff portal reflects same-day completion state');

    // -------------------------------------------------------------------------
    // 9. CUSTOMER EDIT & REASSIGNMENT WORKFLOWS
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Customer Reassignment & Soft Deletion ---');
    // Reassign Customer Anil Sharma from STF91 to STF92
    const editRes = await adminService.updateCustomer({
      id: createdCustId,
      customerName: 'Anil Sharma (VIP)',
      staffId: 'STF92'
    }, 'test_admin');
    assert(editRes.success === true, 'Customer updated & reassigned to STF92');

    // Verify STF91 no longer sees the customer, and STF92 now sees them!
    const staff1AfterReassign = await staffPortalService.getStaffData('STF91');
    assert(staff1AfterReassign.dailyCarCleaning.length === 0, 'Customer successfully removed from old staff (STF91)');

    const staff2AfterReassign = await staffPortalService.getStaffData('STF92');
    assert(staff2AfterReassign.dailyCarCleaning.length === 1, 'Customer successfully visible to newly assigned staff (STF92)');

    // Soft delete customer
    const delRes = await adminService.deleteCustomer(createdCustId, {
      reason: 'Customer relocated to another city',
      adminUser: 'test_admin'
    });
    assert(delRes.success === true, 'Customer soft-deleted with mandatory reason');

    // After soft-deletion, customer must be hidden from both staff and active admin queries
    const staff2AfterDel = await staffPortalService.getStaffData('STF92');
    assert(staff2AfterDel.dailyCarCleaning.length === 0, 'Soft-deleted customer hidden from staff portal');

    const adminCustsAfterDel = await adminService.getAllCustomers();
    assert(adminCustsAfterDel.length === 0, 'Soft-deleted customer hidden from active admin list');

  } catch (err) {
    console.error('Workflow test error:', err);
    failed++;
  } finally {
    // Clean up test fixtures completely
    console.log('\n--- Cleaning up Test Fixtures ---');
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
      await db.query("DELETE FROM public.auth_sessions WHERE staff_id IN (SELECT id FROM public.staff WHERE staff_code LIKE 'STF9%' OR staff_code LIKE 'TEST%') OR admin_id IN (SELECT id FROM public.admin_users WHERE username LIKE 'test%')");
      await db.query('DELETE FROM public.staff_auth');
      await db.query('DELETE FROM public.staff');
      await db.query('DELETE FROM public.audit_logs WHERE changed_by IN (\'test_admin\', \'STF91\', \'STF92\')');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
  }

  // Verify zero test records remain
  const finalCustCount = await repos.customers.countCustomers();
  assert(finalCustCount === 0, 'Zero test customers retained in database', `(count: ${finalCustCount})`);
  const finalStaffCount = await repos.staff.countStaff();
  assert(finalStaffCount === 0, 'Zero test staff retained in database', `(count: ${finalStaffCount})`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  await db.close();
  if (failed > 0) {
    process.exit(1);
  }
}

runWorkflowsAndSyncTests().catch(err => {
  console.error('Fatal Workflow Test Error:', err);
  process.exit(1);
});
