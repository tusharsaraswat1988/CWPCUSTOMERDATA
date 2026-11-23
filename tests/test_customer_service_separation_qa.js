/**
 * test_customer_service_separation_qa.js
 * End-to-end QA Test Suite for:
 * 1. Customer Creation without Service (Pure CRM profile)
 * 2. Dedicated Service Assignment (Vehicle + Package + Route Cleaner)
 * 3. Stop Service Workflow (Safe preservation of customer profile, subscription stopped)
 * 4. Staff Portal DO NOT CLEAN Warning state & Hindi Audio Notification
 * 5. Frontend Modal & Markup Integrity
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load local .env immediately if present
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const adminService = require('../services/adminService');
const staffPortalService = require('../services/staffPortalService');
const repos = require('../db/repositories/index');
const db = require('../db/index');

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING CUSTOMER-SERVICE DECOUPLING & DO NOT CLEAN QA TESTS');
  console.log('===============================================================');

  const testPhone = '9811' + Math.floor(100000 + Math.random() * 900000);
  const testCustomerName = 'QA Decoupled Cust ' + Date.now().toString().slice(-4);
  let createdCustId = null;
  let testStaffId = null;

  try {
    // 0. Resolve an active staff member for assignment tests
    const staffList = await adminService.getStaffList();
    const activeStaff = staffList.find(s => s.active !== false && s.is_active !== false);
    assert(activeStaff, 'At least one active staff member should exist in DB');
    testStaffId = activeStaff.id;
    console.log(`ℹ️ Using staff member: ${activeStaff.name} (${testStaffId})`);

    // -------------------------------------------------------------
    // TEST 1: Pure Customer Creation without Service
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Pure Customer Creation (No Service Assigned) ---');
    const pureCustData = {
      customerName: testCustomerName,
      nameHi: 'क्यूए टेस्ट ग्राहक',
      customerNumber: testPhone,
      address: 'Plot 42, Gomti Nagar, Lucknow',
      addressHi: 'प्लॉट 42, गोमती नगर, लखनऊ',
      googleMapsUrl: 'https://maps.google.com/?q=26.85,80.95',
      staffNotes: 'Customer registered without active service yet',
      serviceCategory: 'None',
      noService: true,
      hasService: false
    };

    const saveRes = await adminService.saveCustomer(pureCustData, 'qa_tester');
    assert.strictEqual(saveRes.success, true, 'saveCustomer should succeed');
    assert(saveRes.customerId, 'saveCustomer should return customerId');
    assert.strictEqual(saveRes.hasService, false, 'hasService flag should be false');
    createdCustId = saveRes.customerId;

    // Verify DB state
    const custInDb = await repos.customers.findById(createdCustId);
    assert(custInDb, 'Customer must exist in DB');
    assert.strictEqual(custInDb.is_active, true, 'Customer profile must be active');

    // Verify primary location exists
    const locations = await repos.serviceLocations.findByCustomerId(createdCustId);
    assert(locations.length >= 1, 'Primary location should be saved');

    // Verify NO subscriptions exist
    const subs = await repos.subscriptions.findByCustomerId(createdCustId);
    assert.strictEqual(subs.length, 0, 'No subscriptions should exist for pure customer');

    // Verify NO service jobs exist
    const jobs = await repos.serviceJobs.findByCustomerId(createdCustId);
    assert.strictEqual(jobs.length, 0, 'No service jobs should exist for pure customer');

    // Verify getAllCustomers reflection
    const allCusts = await adminService.getAllCustomers();
    const foundInList = allCusts.find(c => c.id === createdCustId || c.customerNumber === testPhone);
    assert(foundInList, 'Customer must appear in admin records list');
    assert.strictEqual(foundInList.hasService, false, 'Admin record hasService should be false');
    assert.strictEqual(foundInList.isStopped, false, 'Admin record isStopped should be false');
    assert.strictEqual(foundInList.serviceStatus, 'none', 'Admin record serviceStatus should be none');
    console.log('✅ PASS 1: Pure customer saved successfully with zero forced subscriptions or jobs.');

    // -------------------------------------------------------------
    // TEST 2: Dedicated Service Assignment via assignCustomerService
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Dedicated Service Assignment (assignCustomerService) ---');
    const testVehicle = 'UP32 QA ' + Math.floor(1000 + Math.random() * 9000);
    const assignPayload = {
      customerId: createdCustId,
      serviceCategory: 'Daily Car Cleaning',
      packageType: 'DCC ONLY',
      vehicleNumbers: testVehicle + ' - Creta',
      carMake: 'Hyundai',
      carColor: 'Polar White',
      seaterType: '5_seater',
      staffId: testStaffId,
      staffName: activeStaff.name,
      staffNotes: 'Clean early morning before 7:30 AM'
    };

    const assignRes = await adminService.assignCustomerService(assignPayload, 'qa_tester');
    assert.strictEqual(assignRes.success, true, 'assignCustomerService should succeed');
    assert(assignRes.subscriptionId, 'Should create and return subscriptionId');
    console.log(`ℹ️ Subscription created: ${assignRes.subscriptionId}`);

    // Verify vehicles table
    const vehList = await repos.vehicles.findByCustomerId(createdCustId);
    assert(vehList.length >= 1, 'Vehicle record should be created');
    const normTestVeh = testVehicle.replace(/\s+/g, '').toUpperCase();
    assert(vehList.some(v => v.registration_no && v.registration_no.replace(/\s+/g, '').toUpperCase().includes(normTestVeh)), 'Vehicle registration must match');

    // Verify active subscription
    const activeSub = await repos.subscriptions.findActiveByCustomerId(createdCustId);
    assert(activeSub, 'Customer should now have an active subscription');
    assert.strictEqual(activeSub.status, 'active', 'Subscription status must be active');
    assert.strictEqual(activeSub.package_name, 'DCC ONLY', 'Package name must match');

    // Verify staff assignment
    const currentStaffAssigned = await repos.staffAssignments.findActiveBySubscriptionId(activeSub.id);
    assert(currentStaffAssigned, 'Staff should be assigned to the subscription');
    const staffMember = await repos.staff.findById(currentStaffAssigned.staff_id);
    assert(staffMember && (staffMember.staff_code === activeStaff.id || staffMember.id === activeStaff.id || staffMember.name === activeStaff.name), 'Staff must match assigned staff');

    // Verify getAllCustomers reflection
    const allCustsAfterAssign = await adminService.getAllCustomers();
    const custAfterAssign = allCustsAfterAssign.find(c => c.id === createdCustId);
    assert(custAfterAssign, 'Customer must be in records list');
    assert.strictEqual(custAfterAssign.hasService, true, 'Customer now hasService = true');
    assert.strictEqual(custAfterAssign.isStopped, false, 'Customer isStopped = false');
    assert.strictEqual(custAfterAssign.serviceStatus, 'active', 'Customer serviceStatus = active');
    console.log('✅ PASS 2: Service and route staff cleanly assigned in dedicated workflow.');

    // -------------------------------------------------------------
    // TEST 3: Staff Portal Data (Active State)
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Staff Portal Data in Active State ---');
    const staffDataBeforeStop = await staffPortalService.getStaffData(testStaffId);
    assert(staffDataBeforeStop && Array.isArray(staffDataBeforeStop.dailyCarCleaning), 'Staff data should have dailyCarCleaning list');
    const staffItemActive = staffDataBeforeStop.dailyCarCleaning.find(c => c.customerId === createdCustId || c.customerName === testCustomerName);
    assert(staffItemActive, 'Assigned customer must appear in staff daily list');
    assert.strictEqual(staffItemActive.isStopped, false, 'isStopped must be false for active service');
    console.log('✅ PASS 3: Staff portal feeds active customer to morning cleaning list.');

    // -------------------------------------------------------------
    // TEST 4: Stop Customer Service (stopCustomerService)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Stop Customer Service (Preserves CRM, stops service) ---');
    const stopReason = 'Customer out of station for winter vacation';
    const stopRes = await adminService.stopCustomerService({
      customerId: createdCustId,
      reason: stopReason,
      adminUser: 'qa_tester'
    });
    assert.strictEqual(stopRes.success, true, 'stopCustomerService should succeed');
    assert(stopRes.stoppedSubscriptions >= 1, 'At least 1 subscription should be stopped');

    // Verify DB state
    const custStillInDb = await repos.customers.findById(createdCustId);
    assert(custStillInDb, 'Customer profile must NOT be deleted');
    assert.strictEqual(custStillInDb.is_active, true, 'Customer profile MUST REMAIN ACTIVE');

    const stoppedSubs = await repos.subscriptions.findByCustomerId(createdCustId);
    const subRecord = stoppedSubs.find(s => s.id === activeSub.id);
    assert(subRecord, 'Subscription must exist in DB');
    assert.strictEqual(subRecord.status, 'stopped', 'Subscription status must transition to "stopped"');
    assert(subRecord.stopped_at, 'stopped_at timestamp must be recorded');
    assert.strictEqual(subRecord.stopped_reason, stopReason, 'stopped_reason must match');

    // Verify getAllCustomers reflection
    const allCustsAfterStop = await adminService.getAllCustomers();
    const custAfterStop = allCustsAfterStop.find(c => c.id === createdCustId);
    assert(custAfterStop, 'Customer must remain in records');
    assert.strictEqual(custAfterStop.isStopped, true, 'isStopped must be true');
    assert.strictEqual(custAfterStop.stoppedReason, stopReason, 'stoppedReason must match');
    assert.strictEqual(custAfterStop.serviceStatus, 'stopped', 'serviceStatus must be stopped');
    console.log('✅ PASS 4: Customer service stopped cleanly without deleting customer profile.');

    // -------------------------------------------------------------
    // TEST 5: Staff Portal Feed DO NOT CLEAN Alert State
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Staff Portal Feed DO NOT CLEAN Alert Card ---');
    const staffDataAfterStop = await staffPortalService.getStaffData(testStaffId);
    const staffItemStopped = staffDataAfterStop.dailyCarCleaning.find(c => c.customerId === createdCustId || c.customerName === testCustomerName);
    assert(staffItemStopped, 'CRITICAL: Stopped customer must NOT silently disappear from staff list!');
    assert.strictEqual(staffItemStopped.isStopped, true, 'staffItemStopped.isStopped must be true');
    assert.strictEqual(staffItemStopped.stoppedReason, stopReason, 'staffItemStopped.stoppedReason must match');
    console.log('✅ PASS 5: Staff portal receives stopped customer with isStopped=true for explicit alert rendering.');

    // -------------------------------------------------------------
    // TEST 6: Frontend Markup & JavaScript Integration Checks
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Frontend Markup & Audio Notification Functions ---');
    const htmlPath = path.join(__dirname, '..', 'Index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    assert(htmlContent.includes('id="assignServiceModal"'), 'Index.html must have #assignServiceModal');
    assert(htmlContent.includes('id="btnStopServiceAction"'), 'Index.html must have #btnStopServiceAction');
    assert(htmlContent.includes('id="assignVehicleNumbers"'), 'Index.html must have #assignVehicleNumbers');
    assert(htmlContent.includes('id="assignServiceCategory"'), 'Index.html must have #assignServiceCategory');
    assert(htmlContent.includes('openAssignServiceFromEditModal'), 'Index.html must reference openAssignServiceFromEditModal');

    const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');

    assert(appJsContent.includes('function speakHindiStoppedCustomerWarning'), 'app.js must define speakHindiStoppedCustomerWarning');
    assert(appJsContent.includes('function speakHindiStoppedSummary'), 'app.js must define speakHindiStoppedSummary');
    assert(appJsContent.includes('card-service-stopped'), 'app.js must render card-service-stopped class');
    assert(appJsContent.includes('staff-stopped-card-banner'), 'app.js must render staff-stopped-card-banner');
    assert(appJsContent.includes('btn-clean-blocked'), 'app.js must render btn-clean-blocked');
    assert(appJsContent.includes('openAssignServiceModal'), 'app.js must define openAssignServiceModal');
    assert(appJsContent.includes('handleStopServiceClickFromModal'), 'app.js must define handleStopServiceClickFromModal');

    // Verify Speech text content includes Hindi alert with customer's name
    assert(appJsContent.includes("सावधान! ' + cName + ' जी का काम रोका गया है।"), 'Speech text must announce warning with customer name');
    console.log('✅ PASS 6: Frontend templates, CSS classes, speech synthesis and modal wiring verified.');

    console.log('\n===============================================================');
    console.log('🎉 ALL 6 CUSTOMER-SERVICE DECOUPLING & STOP TESTS PASSED (100%)!');
    console.log('===============================================================');

  } finally {
    // Cleanup created test records
    if (createdCustId) {
      try {
        await adminService.deleteCustomer(createdCustId, 'qa_cleanup');
        console.log('🧹 Cleanup: Test customer records purged.');
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', cleanupErr.message);
      }
    }
    // Close DB pool if running standalone
    if (db.getPool && typeof db.getPool === 'function') {
      try {
        const pool = db.getPool();
        if (pool) await pool.end();
      } catch (poolErr) {}
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ QA TEST FAILED:', err);
  process.exit(1);
});
