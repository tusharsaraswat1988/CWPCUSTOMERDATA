/**
 * =========================================================================
 * CWP Detailers & Motors - Task 01.8 Staff Service Capability & Work-Type QA
 * Module: Task 01.8 — Staff Service Capability & Work-Type Classification
 *
 * Covers:
 * - Section A: Taxonomy & Model Validation (Valid/invalid work types, capability matrices)
 * - Section B: Repository Persistence & Normalization (Creation, defaults, safe backfill)
 * - Section C: DCC & Route Enforcement (DCC eligibility, route assignment, worklist 403, clean execution)
 * - Section D: Service Jobs & On-Demand Assignment (DCC-only rejection, category matching, reassignment)
 * - Section E: Booking Service Creation Enforcement (Direct assignment validation)
 * - Section F: Staff Portal Scoping (DCC-only zero special jobs, services-only zero DCC, category filtering)
 * - Section G: Capability Change Conflict Handling (Blocking demotion/removal with active routes/jobs)
 * - Section H: Isolation Invariants (Zero package deductions, zero ghost jobs, zero state corruption)
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Ensure isolated testing environment
process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_ROUTES_TEST = 'true';
process.env.USE_LOCAL_DCC_TEST = 'true';
process.env.USE_LOCAL_PACKAGES_TEST = 'true';
process.env.USE_LOCAL_JOBS_TEST = 'true';

const staffCapabilityService = require('../services/staffCapabilityService');
const routeService = require('../services/routeService');
const dccService = require('../services/dccService');
const adminService = require('../services/adminService');
const bookingService = require('../services/bookingService');
const staffPortalService = require('../services/staffPortalService');
const repos = require('../db/repositories/index');
const db = require('../db/index');

// Mock db.withTransaction and db.query for isolated unit/QA testing
db.withTransaction = async (callback) => {
  const mockClient = {
    query: async () => ({ rows: [] }),
    release: () => {}
  };
  return callback(mockClient);
};
db.query = async () => ({ rows: [] });

// Mock customer, vehicle, location, and assignment repositories for isolated adminService execution
repos.customers.findByPhone = async (phone) => ({ id: 'cust_qa_1', name: 'Test Customer', phone: phone, mobile: phone });
repos.customers.findById = async (id) => ({ id: id || 'cust_qa_1', name: 'Test Customer', mobile: '9876543210' });
repos.customers.createCustomer = async (data) => ({ id: 'cust_qa_1', ...data });

repos.serviceLocations.findByCustomerId = async () => [{ id: 'loc_qa_1', is_primary: true }];
repos.serviceLocations.createLocation = async (data) => ({ id: 'loc_qa_1', ...data });

repos.vehicles.findByCustomerId = async () => [{ id: 'veh_qa_1', registration_no: 'DL01AB1234', seater_type: '5_seater' }];
repos.vehicles.findById = async (id) => ({ id: id || 'veh_qa_1', reg_no: 'DL01AB1234' });
repos.vehicles.createVehicle = async (data) => ({ id: 'veh_qa_1', ...data });

let localMockJobs = [];
repos.serviceJobs.createJob = async (jobData) => {
  const newJob = {
    id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ...jobData,
    status: jobData.status || 'assigned',
    assigned_staff_id: jobData.staffId || jobData.assignedStaffId || null,
    created_at: new Date().toISOString()
  };
  localMockJobs.push(newJob);
  return newJob;
};
repos.serviceJobs.findById = async (id) => localMockJobs.find(j => j.id === id) || null;
repos.serviceJobs.updateJobStatus = async (id, status, client, extra) => {
  const j = localMockJobs.find(x => x.id === id);
  if (j) {
    j.status = status;
    if (extra && extra.assignedStaffId) j.assigned_staff_id = extra.assignedStaffId;
  }
  return true;
};

repos.staffAssignments.createAssignment = async (data) => ({ id: 'asgn_' + Date.now(), ...data });
repos.staffAssignments.assignStaffToJob = async (data) => ({ id: 'asgn_' + Date.now(), ...data });
repos.staffAssignments.findActiveByJobId = async (jobId) => {
  const j = localMockJobs.find(x => x.id === jobId);
  return j ? { id: 'asgn_cur', job_id: jobId, staff_id: j.assigned_staff_id } : null;
};
repos.staffAssignments.reassignJob = async (jobId, staffId) => {
  const j = localMockJobs.find(x => x.id === jobId);
  if (j) j.assigned_staff_id = staffId;
  return { success: true };
};

repos.auditLogs.logChange = async () => true;

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

async function runStaffCapabilitiesTestSuite() {
  console.log('\n====================================================================');
  console.log('🧪 RUNNING TASK 01.8 STAFF SERVICE CAPABILITY & WORK-TYPE QA SUITE');
  console.log('====================================================================\n');

  // Reset local stores
  repos.routes.__resetLocalStores();
  dccService.__resetLocalStores();

  // -------------------------------------------------------------------------
  // SECTION A: TAXONOMY & MODEL VALIDATION
  // -------------------------------------------------------------------------
  console.log('--- SECTION A: Taxonomy & Capability Model Validation ---');

  // Test 1: Valid work types are recognized
  assert.strictEqual(staffCapabilityService.WORK_TYPES.DCC_ONLY, 'dcc_only');
  assert.strictEqual(staffCapabilityService.WORK_TYPES.DCC_AND_SERVICES, 'dcc_and_services');
  assert.strictEqual(staffCapabilityService.WORK_TYPES.SERVICES_ONLY, 'services_only');
  pass('Canonical work types correctly defined');

  // Test 2: Invalid work type rejected
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('superuser', ['daily_car_cleaning']);
  }, /Invalid work type/i);
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('', ['daily_car_cleaning']);
  }, /Work type is required/i);
  pass('Invalid work types strictly rejected with ValidationError');

  // Test 3: dcc_only produces strictly ['daily_car_cleaning'] and rejects non-DCC capabilities
  const dccOnlyRes = staffCapabilityService.validateCapabilityCombination('dcc_only', ['daily_car_cleaning']);
  assert.strictEqual(dccOnlyRes.workType, 'dcc_only');
  assert.deepStrictEqual(dccOnlyRes.serviceCapabilities, ['daily_car_cleaning']);

  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('dcc_only', ['daily_car_cleaning', 'car_washing']);
  }, /cannot have non-DCC service capabilities/i);
  pass('dcc_only strictly enforces daily_car_cleaning and rejects non-DCC capabilities');

  // Test 4: dcc_and_services requires daily_car_cleaning and at least one non-DCC capability
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('dcc_and_services', ['daily_car_cleaning']);
  }, /must have at least one additional service capability/i);
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('dcc_and_services', []);
  }, /must have at least one additional service capability/i);

  const dccAndWash = staffCapabilityService.validateCapabilityCombination('dcc_and_services', ['car_washing']);
  assert.ok(dccAndWash.serviceCapabilities.includes('daily_car_cleaning'));
  assert.ok(dccAndWash.serviceCapabilities.includes('car_washing'));
  pass('dcc_and_services enforces daily_car_cleaning plus non-DCC capabilities');

  // Test 5: services_only cannot have daily_car_cleaning and requires at least one service
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('services_only', ['daily_car_cleaning']);
  }, /cannot have Daily Car Cleaning capability/i);
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('services_only', []);
  }, /must have at least one service capability enabled/i);

  const servOnlyRes = staffCapabilityService.validateCapabilityCombination('services_only', ['solar_cleaning']);
  assert.strictEqual(servOnlyRes.workType, 'services_only');
  assert.ok(!servOnlyRes.serviceCapabilities.includes('daily_car_cleaning'));
  assert.ok(servOnlyRes.serviceCapabilities.includes('solar_cleaning'));
  pass('services_only strictly excludes daily_car_cleaning and retains valid services');

  // Test 6: Unknown/unrecognized service IDs are rejected
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('services_only', ['oil_change']);
  }, /Unknown or unsupported service capability/i);
  assert.throws(() => {
    staffCapabilityService.validateCapabilityCombination('dcc_and_services', ['daily_car_cleaning', 'workshop_service']);
  }, /Unknown or unsupported service capability/i);
  pass('Unrecognized service categories strictly rejected against canonical catalog');

  // -------------------------------------------------------------------------
  // SECTION B: REPOSITORY PERSISTENCE & NORMALIZATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION B: Repository Persistence & Normalization ---');

  // Create staff fixtures for test scenarios
  // Staff 1: Ramesh - DCC Only
  const staffRamesh = {
    id: 'stf_qa_ramesh',
    name: 'Ramesh Cleaner',
    staff_code: 'STF_RAMESH',
    phone: '9876543210',
    is_active: true,
    work_type: 'dcc_only',
    service_capabilities: ['daily_car_cleaning']
  };

  // Staff 2: Suresh - DCC + Car Washing & Solar
  const staffSuresh = {
    id: 'stf_qa_suresh',
    name: 'Suresh Multi',
    staff_code: 'STF_SURESH',
    phone: '9876543211',
    is_active: true,
    work_type: 'dcc_and_services',
    service_capabilities: ['daily_car_cleaning', 'car_washing', 'solar_cleaning']
  };

  // Staff 3: Vijay - Services Only (Detailing & Wash)
  const staffVijay = {
    id: 'stf_qa_vijay',
    name: 'Vijay Specialist',
    staff_code: 'STF_VIJAY',
    phone: '9876543212',
    is_active: true,
    work_type: 'services_only',
    service_capabilities: ['car_washing', 'interior_detailing', 'exterior_detailing']
  };

  // Staff 4: Legacy Staff with no workType set (defaults to dcc_only)
  const staffLegacy = {
    id: 'stf_qa_legacy',
    name: 'Legacy Laxman',
    staff_code: 'STF_LEGACY',
    phone: '9876543213',
    is_active: true
  };

  const staffMockList = [staffRamesh, staffSuresh, staffVijay, staffLegacy];

  repos.staff.findById = async (id) => staffMockList.find(s => s.id === id) || null;
  repos.staff.findByStaffCode = async (c) => staffMockList.find(s => s.staff_code && s.staff_code.toUpperCase() === String(c).toUpperCase()) || null;
  repos.staff.findByPhone = async (p) => staffMockList.find(s => s.phone === p) || null;
  repos.staff.findAll = async () => staffMockList;

  // Test 7: Capability lookup helper works across object shapes
  assert.strictEqual(staffCapabilityService.isDccEligible(staffRamesh), true);
  assert.strictEqual(staffCapabilityService.isDccEligible(staffSuresh), true);
  assert.strictEqual(staffCapabilityService.isDccEligible(staffVijay), false);
  assert.strictEqual(staffCapabilityService.isDccEligible(staffLegacy), true); // Defaults to dcc_only
  pass('isDccEligible correctly identifies DCC vs non-DCC staff');

  // Test 8: hasServiceCapability checks specific categories accurately
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffRamesh, 'car_washing'), false);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffSuresh, 'car_washing'), true);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffSuresh, 'solar_cleaning'), true);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffSuresh, 'interior_detailing'), false);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffVijay, 'car_washing'), true);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffVijay, 'interior_detailing'), true);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffVijay, 'solar_cleaning'), false);
  assert.strictEqual(staffCapabilityService.hasServiceCapability(staffVijay, 'daily_car_cleaning'), false);
  pass('hasServiceCapability evaluates category permissions with precision');

  // -------------------------------------------------------------------------
  // SECTION C: ROUTE MANAGEMENT & DCC OPERATIONS ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION C: Route Management & DCC Operations Enforcement ---');

  // Test 9: Assigning dcc_only staff to route succeeds
  const route1 = await routeService.createRoute({
    routeCode: 'ROUTE-CAP-01',
    routeName: 'Morning North Route',
    assignedStaffId: staffRamesh.id
  });
  assert.strictEqual(route1.assigned_staff_id || route1.assignedStaffId, staffRamesh.id);
  pass('Assigning dcc_only staff to route succeeds');

  // Test 10: Assigning dcc_and_services staff to route succeeds
  const route2 = await routeService.createRoute({
    routeCode: 'ROUTE-CAP-02',
    routeName: 'Morning South Route',
    assignedStaffId: staffSuresh.id
  });
  assert.strictEqual(route2.assigned_staff_id || route2.assignedStaffId, staffSuresh.id);
  pass('Assigning dcc_and_services staff to route succeeds');

  // Test 11: Assigning services_only staff to route is strictly REJECTED
  await assert.rejects(async () => {
    await routeService.assignStaffToRoute({
      routeId: route1.id,
      staffId: staffVijay.id,
      effectiveDate: '2026-03-01'
    });
  }, (err) => {
    assert.ok(err.message.includes('not authorized for Daily Car Cleaning'));
    return true;
  });
  pass('Assigning services_only staff to route strictly rejected with clear error');

  // Test 12: getStaffRouteWorklist for services_only staff returns unauthorized 403
  const worklistRes = await routeService.getStaffRouteWorklist({
    staffId: staffVijay.id,
    date: '2026-03-01'
  });
  assert.strictEqual(worklistRes.success, false);
  assert.strictEqual(worklistRes.unauthorized, true);
  assert.ok(worklistRes.error.includes('not authorized for Daily Car Cleaning'));
  pass('getStaffRouteWorklist returns unauthorized: true for services_only staff');

  // Test 13: dccService.recordDailyClean attempted by services_only staff fails
  // Add a stop to route1
  const sub1 = await dccService.createSubscription({
    customerId: 'cust_cap_1',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    vehicleIds: ['veh_cap_1'],
    staffId: staffRamesh.id
  });
  const stop1 = await routeService.addStopToRoute({
    routeId: route1.id,
    subscriptionId: sub1.id,
    customerId: 'cust_cap_1',
    vehicleId: 'veh_cap_1'
  });

  await assert.rejects(async () => {
    await dccService.recordDailyClean({
      subscriptionId: sub1.id,
      vehicleId: 'veh_cap_1',
      staffId: staffVijay.id, // services_only cleaner
      cleaningDate: '2026-03-01',
      status: 'completed',
      photoUrl: 'https://storage.cwp.com/photos/proof1.jpg'
    });
  }, (err) => {
    assert.ok(err.message.includes('not authorized to execute Daily Car Cleaning operations'));
    return true;
  });
  pass('dccService.recordDailyClean strictly rejects non-DCC staff');

  // -------------------------------------------------------------------------
  // SECTION D: SERVICE JOBS & ON-DEMAND ASSIGNMENT ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION D: Service Jobs & On-Demand Assignment Enforcement ---');
  // -------------------------------------------------------------------------

  // Test 14: Assigning dcc_only staff to special job (car_washing) fails
  const assignWashFail = await adminService.assignSpecialJob({
    customerName: 'Test Customer',
    phone: '9876543210',
    serviceCategoryId: 'car_washing',
    serviceType: 'Car Foam Wash',
    staffId: staffRamesh.id
  });
  assert.strictEqual(assignWashFail.success, false);
  assert.ok(assignWashFail.error.includes('does not have the capability'));
  pass('Assigning dcc_only staff to Car Washing job strictly rejected');

  // Test 15: Assigning dcc_and_services staff with car_washing capability succeeds
  const assignWashSuccess = await adminService.assignSpecialJob({
    customerName: 'Test Customer',
    phone: '9876543210',
    serviceCategoryId: 'car_washing',
    serviceType: 'Car Foam Wash',
    staffId: staffSuresh.id
  });
  assert.strictEqual(assignWashSuccess.success, true);
  assert.strictEqual(assignWashSuccess.job.assignedStaffId, staffSuresh.staff_code);
  pass('Assigning qualified dcc_and_services staff to Car Washing succeeds');

  // Test 16: Assigning dcc_and_services staff to solar_cleaning succeeds
  const assignSolarSuccess = await adminService.assignSpecialJob({
    customerName: 'Test Customer',
    phone: '9876543210',
    serviceCategoryId: 'solar_cleaning',
    serviceType: 'Solar Panel Wash',
    panelCount: 12,
    staffId: staffSuresh.id
  });
  assert.strictEqual(assignSolarSuccess.success, true);
  assert.strictEqual(assignSolarSuccess.job.assignedStaffId, staffSuresh.staff_code);
  pass('Assigning qualified staff to Solar Cleaning succeeds');

  // Test 17: Assigning dcc_and_services staff (Suresh) to detailing (unauthorized for him) fails
  const assignDetailFail = await adminService.assignSpecialJob({
    customerName: 'Test Customer',
    phone: '9876543210',
    serviceCategoryId: 'interior_detailing',
    serviceType: 'Interior Deep Clean',
    staffId: staffSuresh.id
  });
  assert.strictEqual(assignDetailFail.success, false);
  assert.ok(assignDetailFail.error.includes('does not have the capability'));
  pass('Assigning staff lacking Interior Detailing capability strictly rejected');

  // Test 18: Assigning services_only staff (Vijay) with detailing capability succeeds
  const assignDetailVijay = await adminService.assignSpecialJob({
    customerName: 'Test Customer',
    phone: '9876543210',
    serviceCategoryId: 'interior_detailing',
    serviceType: 'Interior Deep Clean',
    staffId: staffVijay.id
  });
  assert.strictEqual(assignDetailVijay.success, true);
  assert.strictEqual(assignDetailVijay.job.assignedStaffId, staffVijay.staff_code);
  pass('Assigning services_only specialist to authorized Detailing job succeeds');

  // Test 19: Reassigning special job to staff lacking capability is strictly blocked
  const specialJobDetail = assignDetailVijay.job;
  specialJobDetail.service_category_id = specialJobDetail.serviceCategoryId || 'interior_detailing';
  repos.serviceJobs.findById = async (id) => (id === specialJobDetail.id ? specialJobDetail : null);
  repos.staffAssignments.findActiveByJobId = async () => ({ staff_id: staffVijay.id });

  const reassignFail = await adminService.reassignSpecialJob({
    jobId: specialJobDetail.id,
    newStaffId: staffRamesh.id,
    reason: 'Testing capability enforcement'
  });
  assert.strictEqual(reassignFail.success, false);
  assert.ok(reassignFail.error.includes('does not have the capability'));
  pass('Reassigning special job to unqualified staff strictly rejected');

  // -------------------------------------------------------------------------
  // SECTION E: BOOKING SERVICE CREATION ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION E: Booking Service Creation Enforcement ---');

  // Test 20: createBooking with assignedStaffId lacking capability is rejected
  repos.customers.findById = async () => ({ id: 'cust_bkg_1', name: 'Test Customer', mobile: '9998887770' });
  repos.vehicles.findById = async () => ({ id: 'veh_bkg_1', reg_no: 'DL01AB1234' });

  await assert.rejects(async () => {
    await bookingService.createBooking({
      customerId: 'cust_bkg_1',
      serviceCategory: 'solar_cleaning',
      serviceType: 'Solar Panel Clean',
      vehicleId: 'veh_bkg_1',
      assignedStaffId: staffRamesh.id // Ramesh is DCC only
    });
  }, (err) => {
    assert.ok(err.message.includes('does not have the capability'));
    return true;
  });
  pass('Booking creation with unqualified staff strictly rejected');

  // Test 21: createBooking with qualified staff succeeds
  const bkgSuccess = await bookingService.createBooking({
    customerId: 'cust_bkg_1',
    serviceCategory: 'car_washing',
    serviceType: 'Full Foam Wash',
    vehicleId: 'veh_bkg_1',
    assignedStaffId: staffSuresh.id // Suresh has car_washing
  });
  assert.strictEqual(bkgSuccess.success, true);
  assert.strictEqual(bkgSuccess.job.staff_id || bkgSuccess.job.assigned_staff_id, staffSuresh.id);
  pass('Booking creation with qualified staff succeeds');

  // -------------------------------------------------------------------------
  // SECTION F: STAFF PORTAL SCOPING
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION F: Staff Portal Scoping ---');

  // Setup mock service jobs in repo for staff portal tests
  const mockPortalJobs = [
    {
      id: 'job_wash_suresh',
      job_number: 'JOB-WASH-SUR',
      service_category_id: 'car_washing',
      service_type: 'car_washing',
      status: 'assigned',
      assigned_staff_id: staffSuresh.id,
      scheduled_date: '2026-03-01'
    },
    {
      id: 'job_detail_vijay',
      job_number: 'JOB-DET-VIJ',
      service_category_id: 'interior_detailing',
      service_type: 'interior_detailing',
      status: 'assigned',
      assigned_staff_id: staffVijay.id,
      scheduled_date: '2026-03-01'
    }
  ];
  repos.serviceJobs.findDispatchedForStaff = async (stfId) => mockPortalJobs.filter(j => j.assigned_staff_id === stfId);
  repos.serviceJobs.findJobsByStaff = repos.serviceJobs.findDispatchedForStaff;

  // Test 22: Portal for dcc_only staff contains DCC route and zero non-DCC service jobs
  const portalRamesh = await staffPortalService.getStaffPortalData(staffRamesh.id, '2026-03-01');
  assert.strictEqual(portalRamesh.workType, 'dcc_only');
  assert.strictEqual(portalRamesh.isDccEligible, true);
  assert.strictEqual(portalRamesh.otherJobs.length, 0);
  assert.ok(Array.isArray(portalRamesh.dailyCarCleaning));
  pass('Staff Portal for dcc_only cleaner returns DCC route and zero non-DCC jobs');

  // Test 23: Portal for services_only staff returns empty DCC list and only authorized jobs
  const portalVijay = await staffPortalService.getStaffPortalData(staffVijay.id, '2026-03-01');
  assert.strictEqual(portalVijay.workType, 'services_only');
  assert.strictEqual(portalVijay.isDccEligible, false);
  assert.deepStrictEqual(portalVijay.dailyCarCleaning, []);
  assert.strictEqual(portalVijay.otherJobs.length, 1);
  assert.strictEqual(portalVijay.otherJobs[0].serviceCategoryId, 'interior_detailing');
  pass('Staff Portal for services_only specialist returns empty DCC and authorized jobs only');

  // Test 24: Portal for dcc_and_services staff returns both DCC route and authorized jobs
  const portalSuresh = await staffPortalService.getStaffPortalData(staffSuresh.id, '2026-03-01');
  assert.strictEqual(portalSuresh.workType, 'dcc_and_services');
  assert.strictEqual(portalSuresh.isDccEligible, true);
  assert.strictEqual(portalSuresh.otherJobs.length, 1);
  assert.strictEqual(portalSuresh.otherJobs[0].serviceCategoryId, 'car_washing');
  assert.ok(Array.isArray(portalSuresh.dailyCarCleaning));
  pass('Staff Portal for dcc_and_services returns both DCC and authorized service jobs');

  // -------------------------------------------------------------------------
  // SECTION G: CAPABILITY CHANGE CONFLICT PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION G: Capability Change Conflict Protection ---');

  // Test 25: Demoting staff with active DCC route to services_only is BLOCKED
  repos.routes.findRouteByAssignedStaffId = async (stfId) => {
    if (stfId === staffRamesh.id) return route1;
    return null;
  };

  await assert.rejects(async () => {
    await staffCapabilityService.checkCapabilityChangeConflicts(
      staffRamesh.id,
      'services_only',
      ['car_washing']
    );
  }, /currently assigned to active Route/);
  pass('Capability change conflict checker blocks demoting staff with active route to services_only');

  // Test 26: Removing a capability while active service jobs exist is BLOCKED
  repos.serviceJobs.findDispatchedForStaff = async (stfId) => {
    if (stfId === staffSuresh.id) {
      return [{ id: 'job_wash_suresh', status: 'assigned', service_category_id: 'car_washing' }];
    }
    return [];
  };

  await assert.rejects(async () => {
    await staffCapabilityService.checkCapabilityChangeConflicts(
      staffSuresh.id,
      'dcc_and_services',
      ['solar_cleaning'] // Attempting to remove car_washing while active job exists
    );
  }, /Cannot remove capability/);
  pass('Capability change conflict checker blocks removing capability with active jobs');

  // Test 27: Capability change with no conflicts is APPROVED
  repos.routes.findRouteByAssignedStaffId = async () => null;
  repos.serviceJobs.findDispatchedForStaff = async () => [];

  const conflictNone = await staffCapabilityService.checkCapabilityChangeConflicts(
    staffRamesh.id,
    'dcc_and_services',
    ['daily_car_cleaning', 'car_washing']
  );
  assert.strictEqual(conflictNone.hasConflict, false);
  pass('Capability change without conflicts is safely approved');

  // -------------------------------------------------------------------------
  // SECTION H: ISOLATION INVARIANTS & CROSS-MODULE NON-INTERFERENCE
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION H: Isolation Invariants & Cross-Module Non-Interference ---');

  // Test 28: Rejected operations produce zero package deductions
  // Customer with active package balance
  const pkgCust = { id: 'cust_pkg_inv_1' };
  let deductCount = 0;
  repos.packages.decrementEntitlement = async () => { deductCount++; return true; };

  try {
    await bookingService.createBooking({
      customerId: pkgCust.id,
      serviceCategory: 'car_washing',
      vehicleId: 'veh_inv_1',
      assignedStaffId: staffRamesh.id // Unauthorized
    });
  } catch (e) {
    // Expected rejection
  }
  assert.strictEqual(deductCount, 0, 'No package deductions must occur on capability rejection');
  pass('Isolation invariant: Zero package deductions on capability rejection');

  // Test 29: Rejected operations create zero ghost jobs in database
  let insertedJobsCount = 0;
  const origCreateJob = repos.serviceJobs.createJob;
  repos.serviceJobs.createJob = async () => { insertedJobsCount++; return origCreateJob ? origCreateJob.apply(repos.serviceJobs, arguments) : {}; };

  try {
    await bookingService.createBooking({
      customerId: pkgCust.id,
      serviceCategory: 'interior_detailing',
      vehicleId: 'veh_inv_1',
      assignedStaffId: staffRamesh.id // Unauthorized
    });
  } catch (e) {
    // Expected rejection
  }
  assert.strictEqual(insertedJobsCount, 0, 'No job records must be inserted on capability rejection');
  pass('Isolation invariant: Zero ghost jobs inserted on capability rejection');

  // Test 30: Route stop sequence integrity remains uncontaminated
  const routeStops = await repos.routes.getStopsByRouteId(route1.id);
  assert.strictEqual(routeStops.length, 1);
  assert.strictEqual(routeStops[0].vehicle_id || routeStops[0].vehicleId, 'veh_cap_1');
  pass('Isolation invariant: Route sequence and stops remain uncontaminated');

  console.log('\n====================================================================');
  console.log(`🎉 ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================================\n');
}

runStaffCapabilitiesTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
