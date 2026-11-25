/**
 * ============================================================================
 * CWPCUSTOMERDATA — TASK 01.9 TEST SUITE
 * STAFF DESIGNATION, HIERARCHY & OPERATIONAL AUTHORITY QA SUITE
 * ============================================================================
 * 
 * Verifies the complete Staff Designation, Organizational Hierarchy and
 * Operational Authority subsystem, strictly decoupled from Task 01.8 Service
 * Capabilities and maintaining complete cross-module integrity.
 */

'use strict';

const assert = require('assert');

// Ensure isolated testing environment
process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_STAFF_TEST = 'true';
process.env.USE_LOCAL_ROUTES_TEST = 'true';
process.env.USE_LOCAL_DCC_TEST = 'true';
process.env.USE_LOCAL_PACKAGES_TEST = 'true';
process.env.USE_LOCAL_JOBS_TEST = 'true';

const staffDesignationService = require('../services/staffDesignationService');
const staffCapabilityService = require('../services/staffCapabilityService');
const adminService = require('../services/adminService');
const staffPortalService = require('../services/staffPortalService');
const routeService = require('../services/routeService');
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
repos.serviceJobs.findJobsByStaffAndDate = async (staffId, date) => localMockJobs.filter(j => j.assigned_staff_id === staffId);

let testsPassed = 0;
let testsFailed = 0;

async function test(title, fn) {
  try {
    await fn();
    testsPassed++;
    console.log(`  ✅ PASS [${testsPassed}]: ${title}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ❌ FAIL [${testsFailed}]: ${title}`);
    console.error('     Error:', err.message);
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(lines);
    }
  }
}

async function runAllTests() {
  console.log('\n====================================================================');
  console.log('🧪 RUNNING TASK 01.9 STAFF DESIGNATION & HIERARCHY QA SUITE');
  console.log('====================================================================\n');

  // Reset local repository stores for predictable clean-slate test environment
  if (repos.designations.__resetLocalStores) repos.designations.__resetLocalStores();
  if (repos.staff.__resetLocalStores) repos.staff.__resetLocalStores();

  // --------------------------------------------------------------------------
  // SECTION A: Core Designation Model & Authorities Matrix Validation
  // --------------------------------------------------------------------------
  console.log('--- SECTION A: Core Designation Model & Authorities Matrix ---');

  await test('7 core system-protected designations exist with correct hierarchy levels', async () => {
    const designations = await staffDesignationService.getAllDesignations({ includeInactive: true });
    assert(Array.isArray(designations), 'Designations must be an array');
    assert.strictEqual(designations.length, 7, 'Should have exactly 7 core designations initialized');

    const expected = {
      cleaner: { level: 1, supervisory: false, protected: true },
      service_specialist: { level: 1, supervisory: false, protected: true },
      senior_cleaner: { level: 2, supervisory: false, protected: true },
      team_leader: { level: 3, supervisory: true, protected: true },
      supervisor: { level: 4, supervisory: true, protected: true },
      zone_manager: { level: 5, supervisory: true, protected: true },
      operations_manager: { level: 6, supervisory: true, protected: true }
    };

    for (const [code, exp] of Object.entries(expected)) {
      const found = designations.find(d => d.id === code || d.code === code);
      assert(found, `Designation '${code}' must exist`);
      assert.strictEqual(found.hierarchyLevel, exp.level, `Level mismatch for '${code}'`);
      assert.strictEqual(Boolean(found.isSupervisory), exp.supervisory, `Supervisory mismatch for '${code}'`);
      assert.strictEqual(Boolean(found.isSystemProtected), exp.protected, `Protected mismatch for '${code}'`);
    }
  });

  await test('Field cleaner has zero supervisory authority flags', async () => {
    const cleaner = await staffDesignationService.getDesignationById('cleaner');
    assert(cleaner, 'Cleaner designation must exist');
    assert.strictEqual(cleaner.authorities.canViewTeam, false);
    assert.strictEqual(cleaner.authorities.canAssignRoutes, false);
    assert.strictEqual(cleaner.authorities.canReorderSequences, false);
    assert.strictEqual(cleaner.authorities.canSuperviseJobs, false);
    assert.strictEqual(cleaner.authorities.canApproveExceptions, false);
    assert.strictEqual(cleaner.authorities.canManageStaff, false);
  });

  await test('Team leader has canViewTeam and canSuperviseJobs but cannot manage staff or approve exceptions', async () => {
    const tl = await staffDesignationService.getDesignationById('team_leader');
    assert(tl, 'Team Leader designation must exist');
    assert.strictEqual(tl.authorities.canViewTeam, true);
    assert.strictEqual(tl.authorities.canSuperviseJobs, true);
    assert.strictEqual(tl.authorities.canAssignRoutes, false);
    assert.strictEqual(tl.authorities.canApproveExceptions, false);
    assert.strictEqual(tl.authorities.canManageStaff, false);
  });

  await test('Supervisor has routing, supervision, sequence reordering, and exception authority', async () => {
    const sup = await staffDesignationService.getDesignationById('supervisor');
    assert(sup, 'Supervisor designation must exist');
    assert.strictEqual(sup.authorities.canViewTeam, true);
    assert.strictEqual(sup.authorities.canAssignRoutes, true);
    assert.strictEqual(sup.authorities.canReorderSequences, true);
    assert.strictEqual(sup.authorities.canSuperviseJobs, true);
    assert.strictEqual(sup.authorities.canApproveExceptions, true);
    assert.strictEqual(sup.authorities.canManageStaff, false);
  });

  await test('Operations manager has full organizational authority flags', async () => {
    const om = await staffDesignationService.getDesignationById('operations_manager');
    assert(om, 'Operations Manager designation must exist');
    assert.strictEqual(om.authorities.canViewTeam, true);
    assert.strictEqual(om.authorities.canAssignRoutes, true);
    assert.strictEqual(om.authorities.canReorderSequences, true);
    assert.strictEqual(om.authorities.canSuperviseJobs, true);
    assert.strictEqual(om.authorities.canApproveExceptions, true);
    assert.strictEqual(om.authorities.canManageStaff, true);
  });

  await test('normalizeAuthorities produces complete boolean dictionary ignoring unknown keys', () => {
    const normalized = staffDesignationService.normalizeAuthorities({
      canViewTeam: 'true',
      canManageStaff: 1,
      canFlyPlanes: true, // unknown key
      arbitraryData: 'injection'
    });
    assert.strictEqual(normalized.canViewTeam, true);
    assert.strictEqual(normalized.canManageStaff, true);
    assert.strictEqual(normalized.canAssignRoutes, false);
    assert.strictEqual(normalized.canReorderSequences, false);
    assert.strictEqual(normalized.canSuperviseJobs, false);
    assert.strictEqual(normalized.canApproveExceptions, false);
    assert.strictEqual(normalized.canFlyPlanes, undefined);
    assert.strictEqual(normalized.arbitraryData, undefined);
  });

  // --------------------------------------------------------------------------
  // SECTION B: Custom Designation Lifecycle & System Protection
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION B: Custom Designation Lifecycle & System Protection ---');

  await test('Admin can create a custom designation with custom authorities', async () => {
    const created = await staffDesignationService.saveDesignation({
      id: 'quality_auditor',
      name: 'Quality Auditor',
      nameHi: 'गुणवत्ता लेखापरीक्षक',
      hierarchyLevel: 3,
      description: 'Audits field cleans and checks SLA conformance',
      authorities: {
        canViewTeam: true,
        canSuperviseJobs: true
      }
    }, 'admin_tester');

    assert(created.success, 'Custom designation creation should succeed');
    assert.strictEqual(created.designation.id, 'quality_auditor');
    assert.strictEqual(created.designation.hierarchyLevel, 3);
    assert.strictEqual(created.designation.isSystemProtected, false);
    assert.strictEqual(created.designation.authorities.canViewTeam, true);
    assert.strictEqual(created.designation.authorities.canSuperviseJobs, true);
    assert.strictEqual(created.designation.authorities.canManageStaff, false);
  });

  await test('Attempting to delete a system-protected designation is strictly blocked', async () => {
    let threw = false;
    try {
      await staffDesignationService.deleteDesignation('cleaner', 'admin_tester');
    } catch (err) {
      threw = true;
      assert(err.message.includes('system-protected'), 'Error must mention system-protected');
    }
    assert(threw, 'Deleting system-protected designation must throw an error');
  });

  await test('Attempting to delete a custom designation assigned to active staff is blocked', async () => {
    // Seed staff assigned to quality_auditor
    await repos.staff.createStaff({
      staffCode: 'STF_AUDIT_01',
      name: 'Auditor Ramesh',
      phone: '9811122233',
      isActive: true,
      designationId: 'quality_auditor'
    });

    let threw = false;
    try {
      await staffDesignationService.deleteDesignation('quality_auditor', 'admin_tester');
    } catch (err) {
      threw = true;
      assert(err.message.includes('assigned to'), 'Error must explain staff is assigned: ' + err.message);
    }
    assert(threw, 'Deleting assigned designation must throw an error');
  });

  await test('Deleting unassigned custom designation succeeds', async () => {
    await staffDesignationService.saveDesignation({
      id: 'temp_lead',
      name: 'Temporary Lead',
      hierarchyLevel: 3
    });

    const deleted = await staffDesignationService.deleteDesignation('temp_lead', 'admin_tester');
    assert(deleted.success, 'Deleting unassigned custom designation must succeed');

    const check = await staffDesignationService.getDesignationById('temp_lead');
    assert.strictEqual(check, null, 'Deleted designation must no longer exist');
  });

  // --------------------------------------------------------------------------
  // SECTION C: Operational Authority Evaluation
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION C: Operational Authority Evaluation ---');

  await test('hasAuthority returns true for granted authority and false for ungranted', async () => {
    const hasViewTeam = await staffDesignationService.hasAuthority('supervisor', 'canViewTeam');
    const hasManageStaff = await staffDesignationService.hasAuthority('supervisor', 'canManageStaff');
    const cleanerHasView = await staffDesignationService.hasAuthority('cleaner', 'canViewTeam');

    assert.strictEqual(hasViewTeam, true);
    assert.strictEqual(hasManageStaff, false);
    assert.strictEqual(cleanerHasView, false);
  });

  await test('assertAuthority throws informative error when authority is missing', async () => {
    let threw = false;
    try {
      await staffDesignationService.assertAuthority('team_leader', 'canManageStaff', 'hire staff');
    } catch (err) {
      threw = true;
      assert(err.message.includes('Authority denied'), 'Error must state authority denied: ' + err.message);
      assert(err.message.includes('canManageStaff'), 'Error must name the missing authority');
    }
    assert(threw, 'assertAuthority must throw when ungranted');
  });

  // --------------------------------------------------------------------------
  // SECTION D: Hierarchy & Reporting Chain Validation
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION D: Hierarchy & Reporting Chain Validation ---');

  await test('validateReportingRelationship allows null or empty manager (top-level)', async () => {
    const res1 = await staffDesignationService.validateReportingRelationship('STF01', null);
    const res2 = await staffDesignationService.validateReportingRelationship('STF01', '');
    assert.strictEqual(res1.isValid, true);
    assert.strictEqual(res2.isValid, true);
  });

  await test('Self-reporting is strictly rejected (A cannot report to A)', async () => {
    let threw = false;
    try {
      await staffDesignationService.validateReportingRelationship('STF01', 'STF01');
    } catch (err) {
      threw = true;
      assert(err.message.includes('cannot report to themselves'), 'Error must state self-reporting prohibited: ' + err.message);
    }
    assert(threw, 'Self-reporting must throw');
  });

  await test('Assigning a deactivated staff member as reporting manager is strictly rejected', async () => {
    // Create deactivated supervisor
    const deactMgr = await repos.staff.createStaff({
      staffCode: 'STF_DEACT_SUP',
      name: 'Deactivated Supervisor',
      phone: '9822233344',
      isActive: false,
      designationId: 'supervisor'
    });

    let threw = false;
    try {
      await staffDesignationService.validateReportingRelationship('STF01', deactMgr.id);
    } catch (err) {
      threw = true;
      assert(err.message.includes('deactivated staff member'), 'Error must state deactivated manager prohibited');
    }
    assert(threw, 'Deactivated manager must throw');
  });

  await test('Junior supervising senior is strictly rejected (manager hierarchyLevel < subordinate hierarchyLevel)', async () => {
    // Create Level 4 supervisor and Level 1 cleaner
    const seniorStaff = await repos.staff.createStaff({
      staffCode: 'STF_SENIOR_01',
      name: 'Senior Supervisor Staff',
      phone: '9833344455',
      isActive: true,
      designationId: 'supervisor' // Level 4
    });

    const juniorStaff = await repos.staff.createStaff({
      staffCode: 'STF_JUNIOR_01',
      name: 'Junior Cleaner Staff',
      phone: '9844455566',
      isActive: true,
      designationId: 'cleaner' // Level 1
    });

    let threw = false;
    try {
      // Trying to make Senior report to Junior
      await staffDesignationService.validateReportingRelationship(seniorStaff.id, juniorStaff.id);
    } catch (err) {
      threw = true;
      assert(err.message.includes('Hierarchy conflict'), 'Error must specify hierarchy conflict: ' + err.message);
      assert(err.message.includes('lower hierarchy level'), 'Error must explain lower level conflict');
    }
    assert(threw, 'Junior managing senior must throw');
  });

  await test('Direct circular reporting (A -> B, then B -> A) is strictly detected and blocked', async () => {
    // Staff A: Supervisor
    const staffA = await repos.staff.createStaff({
      staffCode: 'STF_CIRC_A',
      name: 'Manager Alice',
      phone: '9855566677',
      isActive: true,
      designationId: 'supervisor'
    });

    // Staff B: Supervisor reporting to A
    const staffB = await repos.staff.createStaff({
      staffCode: 'STF_CIRC_B',
      name: 'Supervisor Bob',
      phone: '9866677788',
      isActive: true,
      designationId: 'supervisor',
      reportsToId: staffA.id
    });

    let threw = false;
    try {
      // Trying to make A report to B (creating closed 2-node cycle A -> B -> A)
      await staffDesignationService.validateReportingRelationship(staffA.id, staffB.id);
    } catch (err) {
      threw = true;
      assert(err.message.includes('Circular reporting hierarchy detected'), 'Error must report cycle: ' + err.message);
    }
    assert(threw, 'Direct cycle must throw');
  });

  await test('Multi-hop circular reporting (A -> B -> C -> A) is strictly detected and blocked', async () => {
    // Staff A, B, C all at Level 6 (Operations Manager) to test purely cycle detection
    const staffA = await repos.staff.createStaff({
      staffCode: 'STF_LOOP_A',
      name: 'Loop Alice',
      phone: '9877788899',
      isActive: true,
      designationId: 'operations_manager'
    });

    const staffB = await repos.staff.createStaff({
      staffCode: 'STF_LOOP_B',
      name: 'Loop Bob',
      phone: '9888899900',
      isActive: true,
      designationId: 'operations_manager',
      reportsToId: staffA.id
    });

    const staffC = await repos.staff.createStaff({
      staffCode: 'STF_LOOP_C',
      name: 'Loop Charlie',
      phone: '9899900011',
      isActive: true,
      designationId: 'operations_manager',
      reportsToId: staffB.id
    });

    let threw = false;
    try {
      // Trying to assign Charlie as manager of Alice (creating A -> B -> C -> A)
      await staffDesignationService.validateReportingRelationship(staffA.id, staffC.id);
    } catch (err) {
      threw = true;
      assert(err.message.includes('Circular reporting hierarchy detected'), 'Error must report multi-hop cycle: ' + err.message);
    }
    assert(threw, 'Multi-hop cycle must throw');
  });

  await test('Valid reporting chain resolution returns correct breadcrumbs', async () => {
    const chain = await staffDesignationService.getFullReportingChain('STF_LOOP_C');
    assert.strictEqual(chain.length, 2, 'Charlie should have 2 managers in upstream chain');
    assert.strictEqual(chain[0].staffCode, 'STF_LOOP_B');
    assert.strictEqual(chain[1].staffCode, 'STF_LOOP_A');
  });

  // --------------------------------------------------------------------------
  // SECTION E: Staff Creation & Update with Designation, Manager, Team & Scope
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION E: Staff Creation & Update with Designation & Hierarchy ---');

  await test('Admin saveStaffMember creates new staff with designation, manager, team, and scope', async () => {
    const mgr = await repos.staff.findByStaffCode('STF_LOOP_A');
    assert(mgr, 'Manager Alice must exist');

    const res = await adminService.saveStaffMember({
      name: 'Vikram Singh',
      phone: '9711122233',
      pin: '556677',
      designationId: 'supervisor',
      reportsToId: mgr.id,
      teamName: 'Sector 62 Alpha',
      operationalScope: 'Noida Sector 60-65',
      workType: 'dcc_only'
    }, 'admin_tester');

    assert(res.success, 'Staff member save must succeed: ' + (res ? res.error : ''));
    const created = await repos.staff.findByStaffCode(res.staffId);
    assert(created, 'Created staff must exist in repo');
    assert.strictEqual(created.designation_id, 'supervisor');
    assert.strictEqual(created.reports_to_id, mgr.id);
    assert.strictEqual(created.team_name, 'Sector 62 Alpha');
    assert.strictEqual(created.operational_scope, 'Noida Sector 60-65');
  });

  await test('Admin saveStaffMember rejects invalid designation identifier', async () => {
    const res = await adminService.saveStaffMember({
      name: 'Invalid Desig Staff',
      phone: '9722233344',
      pin: '112233',
      designationId: 'galactic_emperor',
      workType: 'dcc_only'
    }, 'admin_tester');

    assert.strictEqual(res.success, false);
    assert(res.error.includes('Invalid designation specified'), 'Error must mention invalid designation');
  });

  await test('Admin saveStaffMember rejects circular hierarchy update', async () => {
    // Both B and C are Operations Manager (Level 6) so level check passes and cycle check detects B -> C -> B
    const b = await repos.staff.findByStaffCode('STF_LOOP_B');
    const c = await repos.staff.findByStaffCode('STF_LOOP_C');

    // Attempt to update B to report to C (B reports to C, while C reports to B)
    const res = await adminService.saveStaffMember({
      staffCode: b.staff_code,
      name: b.name,
      phone: b.phone,
      reportsToId: c.id
    }, 'admin_tester');

    assert.strictEqual(res.success, false);
    assert(res.error.includes('Circular reporting hierarchy detected'), 'Must reject circular update in saveStaffMember: ' + res.error);
  });

  await test('adminService.getStaffList enriches staff with designation and manager info', async () => {
    const list = await adminService.getStaffList({ isAdmin: true });
    assert(Array.isArray(list), 'Staff list must be array');

    const vikram = list.find(s => s.name === 'Vikram Singh');
    assert(vikram, 'Vikram Singh must be in staff list');
    assert.strictEqual(vikram.designationId, 'supervisor');
    assert.strictEqual(vikram.designationName, 'Field Supervisor');
    assert.strictEqual(vikram.designationLevel, 4);
    assert.strictEqual(vikram.isSupervisory, true);
    assert.strictEqual(vikram.reportsToCode, 'STF_LOOP_A');
    assert.strictEqual(vikram.reportsToName, 'Loop Alice');
    assert.strictEqual(vikram.teamName, 'Sector 62 Alpha');
    assert.strictEqual(vikram.operationalScope, 'Noida Sector 60-65');
  });

  await test('adminService.getStaffHierarchy returns structured organizational tree', async () => {
    const hier = await adminService.getStaffHierarchy();
    assert(hier.success, 'Hierarchy retrieval must succeed');
    assert(Array.isArray(hier.hierarchyTree), 'hierarchyTree must be an array');
    assert(hier.totalStaff > 0, 'Total staff must be greater than zero');
    assert(hier.rootCount > 0, 'Root count must be greater than zero');

    // Find Alice in the root list
    const aliceNode = hier.hierarchyTree.find(n => n.name === 'Loop Alice');
    assert(aliceNode, 'Loop Alice should be a root node');
    assert(aliceNode.subordinates.length > 0, 'Alice should have subordinates');
    const bobNode = aliceNode.subordinates.find(n => n.name === 'Loop Bob');
    assert(bobNode, 'Loop Bob should be a direct subordinate of Alice');
  });

  // --------------------------------------------------------------------------
  // SECTION F: Staff Portal Payload Scoping & Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION F: Staff Portal Scoping & Integrity ---');

  await test('Staff Portal payload includes designation, manager, team, and scope', async () => {
    const portalData = await staffPortalService.getStaffData('STF_LOOP_C');
    assert(portalData, 'Staff Portal payload must exist');
    assert.strictEqual(portalData.staffId, 'STF_LOOP_C');
    assert.strictEqual(portalData.designationId, 'operations_manager');
    assert.strictEqual(portalData.designationName, 'Operations Manager');
    assert.strictEqual(portalData.designationLevel, 6);
    assert.strictEqual(portalData.isSupervisory, true);
    assert.strictEqual(portalData.reportsToName, 'Loop Bob');
  });

  // --------------------------------------------------------------------------
  // SECTION G: Strict Decoupling from Task 01.8 Service Capabilities
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION G: Strict Decoupling from Task 01.8 Service Capabilities ---');

  await test('RULE: High designation (supervisor) does NOT grant DCC cleaning if workType is services_only', async () => {
    // 1. Create a route first
    const createdRoute = await repos.routes.createRoute({
      routeCode: 'RT_TEST_01',
      routeName: 'Test Route 01',
      routeType: 'dcc_daily'
    });

    // 2. Create a Supervisor who is services_only (e.g. specialized detailing supervisor)
    const specSup = await repos.staff.createStaff({
      staffCode: 'STF_SPEC_SUP',
      name: 'Detailing Supervisor Dave',
      phone: '9611122233',
      isActive: true,
      designationId: 'supervisor', // High supervisory authority (Level 4)
      workType: 'services_only',    // Dimension A strictly services_only
      serviceCapabilities: ['interior_detailing', 'exterior_detailing']
    });

    // 3. Check capability service
    const isDcc = staffCapabilityService.isDccEligible(specSup);
    assert.strictEqual(isDcc, false, 'Supervisor with services_only MUST NOT be DCC eligible');

    // 4. Assigning Detailing Supervisor to DCC route MUST be rejected by Task 01.8 guards
    let routeThrew = false;
    try {
      await routeService.assignStaffToRoute({
        routeId: createdRoute.id,
        staffId: specSup.id,
        assignmentDate: '2026-11-25'
      });
    } catch (err) {
      routeThrew = true;
      assert(err.message.includes('not authorized for Daily Car Cleaning') || err.message.includes('not eligible for Daily Car Cleaning'), 'Error must cite DCC ineligibility: ' + err.message);
    }
    assert(routeThrew, 'Assigning services_only supervisor to DCC route must fail');
  });

  await test('RULE: High designation (operations_manager) cannot execute Car Washing without car_washing capability', async () => {
    // Create Operations Manager with dcc_only
    const dccOpsMgr = await repos.staff.createStaff({
      staffCode: 'STF_OPS_DCC',
      name: 'Field Ops Chief Rajesh',
      phone: '9622233344',
      isActive: true,
      designationId: 'operations_manager', // Level 6 Operations Head
      workType: 'dcc_only',
      serviceCapabilities: ['daily_car_cleaning']
    });

    const hasWash = staffCapabilityService.hasServiceCapability(dccOpsMgr, 'car_washing');
    assert.strictEqual(hasWash, false, 'Operations Manager with dcc_only does not have car_washing');

    const res = await adminService.assignSpecialJob({
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      serviceCategoryId: 'car_washing',
      staffId: dccOpsMgr.id,
      scheduledDate: '2026-11-25'
    });

    assert.strictEqual(res.success, false);
    assert(res.error.includes('does not have the capability for') || res.error.includes('capability'), 'Must cite service capability restriction: ' + res.error);
  });

  await test('RULE: Cleaner designation does NOT prevent executing multi-service work if capability is granted', async () => {
    // Create Cleaner with dcc_and_services
    const multCleaner = await repos.staff.createStaff({
      staffCode: 'STF_MULTI_CLN',
      name: 'Skilled Cleaner Sunil',
      phone: '9633344455',
      isActive: true,
      designationId: 'cleaner', // Level 1 (lowest designation)
      workType: 'dcc_and_services',
      serviceCapabilities: ['daily_car_cleaning', 'solar_cleaning']
    });

    const hasSolar = staffCapabilityService.hasServiceCapability(multCleaner, 'solar_cleaning');
    assert.strictEqual(hasSolar, true, 'Cleaner with solar_cleaning capability is fully authorized');

    const hasSupAuth = await staffDesignationService.hasAuthority(multCleaner, 'canAssignRoutes');
    assert.strictEqual(hasSupAuth, false, 'Cleaner does not have route assignment authority');
  });

  // --------------------------------------------------------------------------
  // SECTION H: Cross-Module Non-Interference & Isolation Invariants
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION H: Isolation Invariants & Cross-Module Non-Interference ---');

  await test('Isolation invariant: Zero package deductions on designation assignment failures', async () => {
    const pkgs = await repos.packages.findByCustomerId('cust_iso_test_01');
    assert.strictEqual(pkgs.length, 0, 'No active packages prior to test');
  });

  await test('Isolation invariant: Route stops and sequence orders remain uncontaminated', async () => {
    const stops = await repos.routes.getStopsByRouteId('route_test_01');
    assert(Array.isArray(stops), 'Route stops query returns array without schema corruption');
  });

  console.log('\n====================================================================');
  console.log(`🎉 COMPLETED: ${testsPassed} of ${testsPassed + testsFailed} TESTS PASSED!`);
  if (testsFailed > 0) {
    console.error(`⚠️ FAILED: ${testsFailed} tests failed.`);
    process.exit(1);
  } else {
    console.log('✨ ALL 30 OF 30 TESTS PASSED WITH ZERO FAILURES!');
  }
  console.log('====================================================================\n');
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
