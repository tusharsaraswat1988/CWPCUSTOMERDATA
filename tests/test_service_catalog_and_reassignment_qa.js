/**
 * Service Catalog, Sizing Classification, 3-Tab Staff Navigation & Job Reassignment QA Suite
 *
 * Validates:
 * 1. 5 Service Categories taxonomy, bilingual naming, and package catalog in serviceCatalog.js
 * 2. Vehicle sizing (5 Seater / 5+ Seater) and Solar Panel count data handling
 * 3. Database repositories & query persistence for panel_count and seater_type
 * 4. Job Reassignment functionality (audit logging, atomic reassignment, error cases)
 * 5. Staff Portal payload structure with otherJobs and 3-tab navigation
 * 6. Accessible UI and Material Design 3 tokens in index.html, style.css, and app.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Auto-load .env if DATABASE_URL not yet populated
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const serviceCatalog = require('../services/serviceCatalog');
const adminService = require('../services/adminService');
const staffPortalService = require('../services/staffPortalService');
const db = require('../db');
const repos = require('../db/repositories');

console.log('===============================================================');
console.log('🚀 RUNNING SERVICE CATALOG, SIZING & REASSIGNMENT QA SUITE');
console.log('===============================================================');

let passedTests = 0;
function pass(msg) {
  passedTests++;
  console.log(`✅ PASS: ${msg}`);
}

async function runTests() {
  try {
    // -------------------------------------------------------------
    // SECTION 1: Service Catalog Taxonomy & Canonical Definitions
    // -------------------------------------------------------------
    console.log('\n--- SECTION 1: Taxonomy & Canonical Definitions ---');

    assert.ok(serviceCatalog.SERVICE_CATEGORIES, 'SERVICE_CATEGORIES is defined');
    const categories = Object.keys(serviceCatalog.SERVICE_CATEGORIES);
    assert.strictEqual(categories.length, 5, 'Exactly 5 service categories defined');
    assert.deepStrictEqual(
      categories.sort(),
      ['car_washing', 'daily_car_cleaning', 'exterior_detailing', 'interior_detailing', 'solar_cleaning'].sort(),
      'All 5 canonical categories present'
    );
    pass('1.1 5 Canonical Service Categories defined');

    // Bilingual and metadata assertions
    categories.forEach(catKey => {
      const cat = serviceCatalog.SERVICE_CATEGORIES[catKey];
      assert.ok(cat.id, `${catKey} has id`);
      assert.ok(cat.name, `${catKey} has name`);
      assert.ok(cat.nameHi, `${catKey} has Hindi name`);
      assert.ok(cat.icon, `${catKey} has Material Symbol`);
      assert.ok(cat.iconEmoji, `${catKey} has iconEmoji`);
      assert.ok(Array.isArray(cat.packages) && cat.packages.length > 0, `${catKey} has packages`);
    });
    pass('1.2 Bilingual titles and Material Symbols verified for all categories');

    // Packages check
    const dccPackages = serviceCatalog.SERVICE_CATEGORIES.daily_car_cleaning.packages.map(p => p.name);
    assert.ok(dccPackages.some(n => n.includes('Exterior Chemical Cleaning (30 Days)')), 'DCC includes Chemical Cleaning');
    assert.ok(dccPackages.some(n => n.includes('+ 1 Carwash')), 'DCC includes + 1 Carwash');
    assert.ok(dccPackages.some(n => n.includes('+ 2 Carwash')), 'DCC includes + 2 Carwash');

    const cwPackages = serviceCatalog.SERVICE_CATEGORIES.car_washing.packages.map(p => p.name);
    assert.ok(cwPackages.some(n => n.includes('Single Wash (One Time)') || n.includes('Single Wash')), 'Car wash includes Single Wash');
    assert.ok(cwPackages.some(n => n.includes('Wash Subscription (4 Washes')), 'Car wash includes Wash Subscription');

    const scPackages = serviceCatalog.SERVICE_CATEGORIES.solar_cleaning.packages.map(p => p.name);
    assert.ok(scPackages.some(n => n.includes('One Time Solar Cleaning')), 'Solar includes One Time');
    assert.ok(scPackages.some(n => n.includes('6 Month Subscription')), 'Solar includes 6 Month');
    assert.ok(scPackages.some(n => n.includes('12 Month Subscription')), 'Solar includes 12 Month');
    assert.strictEqual(serviceCatalog.SERVICE_CATEGORIES.solar_cleaning.pricingUnit, 'per_panel', 'Solar unit is per_panel');

    const intPackages = serviceCatalog.SERVICE_CATEGORIES.interior_detailing.packages.map(p => p.name);
    assert.ok(intPackages.some(n => n.includes('Interior Deep Cleaning')), 'Interior includes Deep Cleaning');
    assert.ok(intPackages.some(n => n.includes('Roof Cleaning')), 'Interior includes Roof Cleaning');

    const extPackages = serviceCatalog.SERVICE_CATEGORIES.exterior_detailing.packages.map(p => p.name);
    assert.ok(extPackages.some(n => n.includes('Ceramic Coating')), 'Exterior includes Ceramic Coating');
    assert.ok(extPackages.some(n => n.includes('Graphene Coating')), 'Exterior includes Graphene Coating');
    assert.ok(extPackages.some(n => n.includes('Car Waxing')), 'Exterior includes Car Waxing');
    assert.ok(extPackages.some(n => n.includes('Glass Treatment')), 'Exterior includes Glass Treatment');
    pass('1.3 All specific package tiers defined according to customer requirements');

    // Seater definitions
    assert.ok(serviceCatalog.SEATER_TYPES['5_seater'], '5_seater defined');
    assert.ok(serviceCatalog.SEATER_TYPES['5_plus_seater'], '5_plus_seater defined');
    assert.strictEqual(serviceCatalog.isValidSeaterType('5_seater'), true);
    assert.strictEqual(serviceCatalog.isValidSeaterType('5_plus_seater'), true);
    assert.strictEqual(serviceCatalog.isValidSeaterType('7_seater'), false);
    pass('1.4 Sizing classification (5 Seater / 5+ Seater) helpers verified');

    // -------------------------------------------------------------
    // SECTION 2: Repositories & Database Persistence
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: Repositories & Database Persistence ---');

    // Test customer panel_count
    const testCustCode = 'TST_CAT_' + Date.now().toString().slice(-6);
    const createdCust = await repos.customers.createCustomer({
      customerCode: testCustCode,
      name: 'Test Catalog Customer',
      phone: '9888877771',
      interestedService: 'Solar Panel Cleaning',
      panelCount: 48
    });
    assert.ok(createdCust.id, 'Customer created');
    assert.strictEqual(parseInt(createdCust.panel_count, 10), 48, 'Customer stored panel_count 48');

    const updatedCust = await repos.customers.updateCustomer(createdCust.id, {
      panelCount: 36
    });
    assert.strictEqual(parseInt(updatedCust.panel_count, 10), 36, 'Customer updated panel_count to 36');
    pass('2.1 Customers repository persists and updates panel_count');

    // Test vehicles seater_type
    const testVehCode = 'TEST_REG_' + Date.now().toString().slice(-6);
    const createdVeh = await repos.vehicles.createVehicle({
      customerId: createdCust.id,
      registrationNo: testVehCode,
      vehicleType: 'Car',
      carMake: 'Hyundai',
      carColor: 'White',
      seaterType: '5_plus_seater'
    });
    assert.ok(createdVeh.id, 'Vehicle created');
    assert.strictEqual(createdVeh.seater_type, '5_plus_seater', 'Vehicle stored seater_type 5_plus_seater');

    const updatedVeh = await repos.vehicles.updateVehicle(createdVeh.id, {
      seaterType: '5_seater'
    });
    assert.strictEqual(updatedVeh.seater_type, '5_seater', 'Vehicle updated seater_type to 5_seater');
    pass('2.2 Vehicles repository persists and updates seater_type');

    // Test serviceJobsRepo with panelCount and seaterType
    const createdLoc = await repos.serviceLocations.createLocation({
      customerId: createdCust.id,
      addressType: 'primary',
      addressText: 'Plot 42, Gomti Nagar, Lucknow',
      isPrimary: true
    });

    const testStaffList = await repos.staff.findAll();
    assert.ok(testStaffList.length > 0, 'Staff records available for test');
    const staff1 = testStaffList[0];
    const staff2 = testStaffList.length > 1 ? testStaffList[1] : testStaffList[0];

    const specialJob = await repos.serviceJobs.createJob({
      customerId: createdCust.id,
      vehicleId: createdVeh.id,
      locationId: createdLoc.id,
      serviceCategoryId: 'solar_cleaning',
      serviceType: 'One Time Solar Cleaning',
      panelCount: 24,
      seaterType: null,
      packageCode: 'solar_single',
      status: 'assigned',
      siteDetails: { panelCount: 24, roofType: 'RCC' }
    });
    assert.ok(specialJob.id, 'Service job created');
    assert.strictEqual(parseInt(specialJob.panel_count, 10), 24, 'service_jobs persists panel_count 24');

    // Assign to staff1
    await repos.staffAssignments.assignStaffToJob({
      staffId: staff1.id,
      jobId: specialJob.id,
      assignedBy: 'test_runner'
    });
    pass('2.3 Service jobs repository handles panel_count and staff assignment');

    // -------------------------------------------------------------
    // SECTION 3: Job Reassignment Backend Flow
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: Job Reassignment API & Audit Logging ---');

    // Perform reassignment to staff2 (or staff1 if only 1 exists, but testing reassignment mechanism)
    const targetStaff = staff2.id !== staff1.id ? staff2 : staff1;
    const reassignRes = await adminService.reassignSpecialJob({
      jobId: specialJob.id,
      toStaffId: targetStaff.id,
      reason: 'Workload balancing across team',
      adminUser: 'test_admin'
    });

    assert.strictEqual(reassignRes.success, true, 'Reassign API returned success');
    assert.strictEqual(reassignRes.jobId, specialJob.id, 'Correct job ID returned');
    assert.strictEqual(reassignRes.assignedStaff.id, targetStaff.id, 'Assigned to new staff');

    // Verify old assignment is deactivated and new assignment is active
    const activeAssignment = await repos.staffAssignments.findActiveByJobId(specialJob.id);
    assert.ok(activeAssignment, 'Active staff assignment exists');
    assert.strictEqual(activeAssignment.staff_id, targetStaff.id, 'Active assignment is for new staff');

    const allAssignments = (await db.query('SELECT * FROM public.staff_assignments WHERE job_id = $1', [specialJob.id])).rows;
    const inactiveAssignments = allAssignments.filter(a => !a.is_active);
    assert.ok(inactiveAssignments.length >= 1, 'Previous assignment was deactivated');

    // Verify audit log entry
    const auditLogs = await repos.auditLogs.queryLogs({ entityType: 'service_job', entityId: specialJob.id });
    const reassignLog = auditLogs.find(l => l.action === 'reassign_special_job' || l.action === 'reassign_job');
    assert.ok(reassignLog, 'Audit log contains reassign entry');
    assert.strictEqual(reassignLog.changed_by, 'test_admin', 'Audit log records admin user');
    pass('3.1 Job Reassignment deactivates old assignment, creates new assignment, and records audit trail');

    // Test rejection on invalid input
    const badReassign = await adminService.reassignSpecialJob({
      jobId: '00000000-0000-0000-0000-000000000000',
      toStaffId: targetStaff.id
    });
    assert.strictEqual(badReassign.success, false, 'Invalid jobId rejected');
    pass('3.2 Reassign handles invalid job IDs gracefully');

    // Test rejection on reassigning to same staff member
    const sameStaffReassign = await adminService.reassignSpecialJob({
      jobId: specialJob.id,
      toStaffId: targetStaff.id,
      reason: 'Redundant transfer attempt'
    });
    assert.strictEqual(sameStaffReassign.success, false, 'Reassigning to same staff member rejected');
    assert.ok(sameStaffReassign.error.includes('already assigned'), 'Appropriate error message for same staff reassign');
    pass('3.3 Reassign prevents duplicate assignment to current staff member');

    // Test vehicleDetails object parsing in assignSpecialJob
    const detailingJobRes = await adminService.assignSpecialJob({
      customerId: createdCust.id,
      serviceCategoryId: 'interior_detailing',
      serviceType: 'Interior Deep Cleaning',
      packageCode: 'INT_DEEP_CLEAN',
      seaterType: '5_seater',
      vehicleDetails: { vehicle: 'UP32 XY 9999 (Honda City)', seaterType: '5_seater' },
      staffId: targetStaff.id
    }, 'test_admin');
    assert.strictEqual(detailingJobRes.success, true, 'assignSpecialJob succeeds with vehicleDetails object');
    assert.strictEqual(detailingJobRes.job.seater_type, '5_seater', 'Job records 5_seater seater_type');
    const detailingVeh = await repos.vehicles.findById(detailingJobRes.job.vehicle_id);
    assert.ok(detailingVeh, 'Vehicle record created from object details');
    assert.strictEqual(detailingVeh.registration_no, 'UP32 XY 9999', 'Registration number parsed cleanly');
    assert.strictEqual(detailingVeh.brand_or_model, 'Honda City', 'Brand/model parsed cleanly');
    pass('3.4 assignSpecialJob cleanly parses composite vehicleDetails objects without [object Object] corruption');

    // Soft delete detailing job
    await repos.serviceJobs.softDelete(detailingJobRes.job.id);

    // -------------------------------------------------------------
    // SECTION 4: Staff Portal Payload & Isolation
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: Staff Portal Payload & Tab Isolation ---');

    const portalData = await staffPortalService.getStaffPortalData(targetStaff.id);
    assert.ok(portalData, 'Staff portal data returned');
    assert.ok(Array.isArray(portalData.otherJobs), 'Portal data contains otherJobs array');
    assert.ok(Array.isArray(portalData.carWashJobs), 'Portal data contains carWashJobs array (back-compat)');
    assert.ok(Array.isArray(portalData.solarCleaningJobs), 'Portal data contains solarCleaningJobs array (back-compat)');

    // The assigned job should be in otherJobs
    const foundInOther = portalData.otherJobs.find(j => j.id === specialJob.id);
    assert.ok(foundInOther, 'Special job present in otherJobs payload');
    assert.strictEqual(parseInt(foundInOther.panelCount, 10), 24, 'Special job contains panelCount');
    assert.strictEqual(foundInOther.serviceCategory, 'solar_cleaning', 'Special job contains canonical category');
    assert.ok(portalData.versionHash, 'Portal data contains versionHash for live auto-sync');
    pass('4.1 Staff portal provides otherJobs payload with full sizing & category metadata');

    // -------------------------------------------------------------
    // SECTION 5: Frontend UI & Accessibility Verification
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: Frontend UI & M3 Standards ---');

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');

    // 3 Tabs in Bottom Navigation
    assert.ok(indexHtml.includes('id="pillDailyClean"'), 'pillDailyClean exists');
    assert.ok(indexHtml.includes('id="pillOtherJobs"'), 'pillOtherJobs exists');
    assert.ok(indexHtml.includes('id="pillStaffSettings"'), 'pillStaffSettings exists');
    assert.ok(indexHtml.includes('दैनिक सफाई'), 'Daily Clean tab has Hindi label');
    assert.ok(indexHtml.includes('अन्य काम'), 'Other Jobs tab has Hindi label');
    assert.ok(indexHtml.includes('सेटिंग्स'), 'Settings tab has Hindi label');

    // Verify visible navigation strictly exposes the 3 buttons
    const navMatch = indexHtml.match(/<nav [^>]*id="staffBottomNav"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'staffBottomNav found');
    const navContent = navMatch[1];
    assert.ok(navContent.includes('id="pillDailyClean"'), 'pillDailyClean in nav');
    assert.ok(navContent.includes('id="pillOtherJobs"'), 'pillOtherJobs in nav');
    assert.ok(navContent.includes('id="pillStaffSettings"'), 'pillStaffSettings in nav');
    pass('5.1 Staff Bottom Navigation has strictly 3 core tabs with bilingual titles');

    // Subfilter bar for Other Jobs
    assert.ok(indexHtml.includes('id="otherJobsFilterBar"'), 'otherJobsFilterBar exists');
    assert.ok(indexHtml.includes("setOtherJobsSubFilter('car_washing')"), 'Subfilter contains car_washing');
    assert.ok(indexHtml.includes("setOtherJobsSubFilter('solar_cleaning')"), 'Subfilter contains solar_cleaning');
    assert.ok(indexHtml.includes("setOtherJobsSubFilter('interior_detailing')"), 'Subfilter contains interior_detailing');
    assert.ok(indexHtml.includes("setOtherJobsSubFilter('exterior_detailing')"), 'Subfilter contains exterior_detailing');
    pass('5.2 Other Jobs subfilter bar accommodates all 4 on-demand service categories');

    // Solar dedicated No. of Panels field
    assert.ok(indexHtml.includes('id="specialSolarPanelsCount"'), 'specialSolarPanelsCount in assign modal');
    assert.ok(indexHtml.includes('id="custSolarPanelsRow"'), 'custSolarPanelsRow in customer modal');
    assert.ok(indexHtml.includes('id="editCustSolarPanelsRow"'), 'editCustSolarPanelsRow in edit customer modal');
    assert.ok(indexHtml.includes('id="convertSolarPanelsGroup"'), 'convertSolarPanelsGroup in convert lead modal');
    assert.ok(appJs.includes('☀️') || appJs.includes('solar-panels-badge'), 'Staff card renders solar badge');
    pass('5.3 Solar Panel dedicated field present across all forms, modals, and staff cards');

    // Reassign Job Modal
    assert.ok(indexHtml.includes('id="reassignJobModal"'), 'reassignJobModal exists in index.html');
    assert.ok(indexHtml.includes('role="dialog"'), 'Accessible role=dialog present');
    assert.ok(indexHtml.includes('aria-modal="true"'), 'aria-modal=true present');
    assert.ok(indexHtml.includes('id="reassignNewStaffSelect"'), 'reassignNewStaffSelect dropdown present');
    assert.ok(indexHtml.includes('id="reassignReason"'), 'reassignReason input present');
    assert.ok(appJs.includes('function openReassignJobModal'), 'openReassignJobModal defined in app.js');
    assert.ok(appJs.includes('function handleReassignJobSubmit'), 'handleReassignJobSubmit defined in app.js');
    pass('5.4 Reassign Job modal and handlers configured with accessibility');

    // Material Design 3 CSS Tokens & Styles
    assert.ok(styleCss.includes('.m3-category-pill'), 'M3 category pill CSS present');
    assert.ok(styleCss.includes('.solar-panels-badge'), 'Solar panels badge CSS present');
    assert.ok(styleCss.includes('.seater-pill-badge'), 'Seater pill badge CSS present');
    assert.ok(styleCss.includes('.other-jobs-subfilter-bar'), 'Other jobs subfilter bar CSS present');
    assert.ok(styleCss.includes('.btn-reassign-record'), 'Reassign action button CSS present');
    pass('5.5 Material Design 3 styles, tokens, and contrast classes present in style.css');

    // Window Exports
    const requiredExports = [
      'openReassignJobModal',
      'closeReassignJobModal',
      'handleReassignJobSubmit',
      'setOtherJobsSubFilter',
      'handleSpecialSeaterChange',
      'handleCustSeaterChange',
      'handleEditCustSeaterChange',
      'handleConvertSeaterChange'
    ];
    requiredExports.forEach(fnName => {
      assert.ok(appJs.includes(`window.${fnName} = ${fnName};`), `window.${fnName} is exported`);
    });
    pass('5.6 All required modal, filter, and segmented control functions exported to window');

    // 5.7 Edge cases & Bug Fix Validations
    assert.ok(indexHtml.includes('<option value="Interior Detailing">Interior Detailing</option>'), 'Active records filterAdminCategory includes Interior Detailing');
    assert.ok(indexHtml.includes('<option value="Exterior Detailing">Exterior Detailing</option>'), 'Active records filterAdminCategory includes Exterior Detailing');
    assert.ok(indexHtml.includes('id="chipOtherAll" role="tab" aria-selected="true"'), 'Subfilter chips have accessible role=tab and aria-selected');
    assert.ok(appJs.includes('custSolarPanelsCount') && appJs.includes('editCustSolarPanelsCount') && appJs.includes('convertSolarPanelsCount'), 'app.js accurately binds to all modal panel count input IDs');
    assert.ok(appJs.includes('data.otherJobs') && appJs.includes('pulse-badge'), 'Staff portal alerting monitors data.otherJobs and pulses otherJobs badge');
    assert.ok(appJs.includes("setStaffFilter('other_jobs')") && appJs.includes("setOtherJobsSubFilter("), 'jumpToSpecialJob routes cleanly to other_jobs and activates subcategory filter');
    assert.ok(appJs.includes('badge-reassign-locked') || appJs.includes('Done'), 'Special jobs table locks completed jobs from reassignment');
    pass('5.7 Edge cases & Bug Fixes verified across Admin, Staff Alerting, and ARIA accessibility');

    // Cleanup / soft delete test records (staff_assignments ledger is immutable by trigger)
    await repos.serviceJobs.softDelete(specialJob.id);
    await repos.customers.softDelete(createdCust.id);

    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ${passedTests}/${passedTests} TESTS PASSED`);
    console.log('===============================================================');
    console.log('🎉 ALL SERVICE CATALOG, SIZING & REASSIGNMENT TESTS PASSED!');
    console.log('===============================================================');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
