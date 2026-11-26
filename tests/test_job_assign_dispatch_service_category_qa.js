/**
 * QA Test Suite: Job Assignment & Dispatch - Service Category Contract Verification
 * Tests fix for: "Error assigning job: Service category is required."
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING JOB ASSIGNMENT & DISPATCH SERVICE CATEGORY QA SUITE');
console.log('===============================================================\n');

// 1. Verify app.js handleJobAssignmentSubmit contract
console.log('--- Test 1: Frontend app.js handleJobAssignmentSubmit Contract ---');
const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert.ok(appJs.includes('serviceCategoryId: workType'), 'app.js must pass serviceCategoryId in handleJobAssignmentSubmit');
assert.ok(appJs.includes('serviceCategory: workType'), 'app.js must pass serviceCategory for backward compatibility');
assert.ok(appJs.includes('serviceType: selectedWorkTypeText'), 'app.js must pass human readable serviceType');
assert.ok(appJs.includes('specialInstructions: notes'), 'app.js must pass specialInstructions');
assert.ok(appJs.includes('vehicleDetails: custVeh'), 'app.js must pass vehicleDetails');
console.log('✅ PASS 1: app.js contains complete, robust payload contract for job assignment dispatch.\n');

// 2. Verify adminService.js assignSpecialJob contract
console.log('--- Test 2: Backend adminService.js assignSpecialJob Category Resolution ---');
const adminServicePath = path.join(__dirname, '..', 'services', 'adminService.js');
const adminServiceCode = fs.readFileSync(adminServicePath, 'utf8');

assert.ok(
  adminServiceCode.includes('rawCat = serviceCategoryId || params.serviceCategory || params.category || params.workType'),
  'adminService.js must support serviceCategory, category, and workType fallbacks'
);
assert.ok(
  adminServiceCode.includes('params.vehicleNum') || adminServiceCode.includes('params.vehicleNumber'),
  'adminService.js must support vehicleNum fallback for vehicle parsing'
);
assert.ok(
  adminServiceCode.includes('params.instructions') || adminServiceCode.includes('params.notes'),
  'adminService.js must support instructions and notes fallbacks'
);
console.log('✅ PASS 2: adminService.js has robust fallback parameter handling.\n');

// 3. Test adminService.assignSpecialJob category validation behavior
console.log('--- Test 3: Functional validation of service category resolution in adminService ---');
const adminService = require('../services/adminService');

(async () => {
  // A. Call with empty category -> should return failure before hitting DB
  const emptyRes = await adminService.assignSpecialJob({});
  assert.strictEqual(emptyRes.success, false, 'Should fail when no category is supplied');
  assert.strictEqual(emptyRes.error, 'Service category is required.', 'Should report Service category is required.');

  // Helper: call and verify that category validation passes (i.e. reaches DB step instead of failing on category)
  async function testPassesCategoryValidation(params) {
    try {
      const res = await adminService.assignSpecialJob(params);
      assert.notStrictEqual(res.error, 'Service category is required.');
    } catch (err) {
      // If DATABASE_URL is not set, reaching DB call confirms category validation succeeded
      assert.ok(err.message.includes('DATABASE_URL') || !err.message.includes('Service category is required.'));
    }
  }

  // B. Call with serviceCategory only -> should NOT fail with "Service category is required."
  await testPassesCategoryValidation({ serviceCategory: 'car_washing' });

  // C. Call with workType only -> should NOT fail with "Service category is required."
  await testPassesCategoryValidation({ workType: 'car_washing' });

  // D. Call with category only -> should NOT fail with "Service category is required."
  await testPassesCategoryValidation({ category: 'car_washing' });

  // E. Call with serviceCategoryId -> should NOT fail with "Service category is required."
  await testPassesCategoryValidation({ serviceCategoryId: 'car_washing' });

  console.log('✅ PASS 3: Category validation successfully accepts all field alias variants.\n');
  console.log('===============================================================');
  console.log('🎉 ALL JOB ASSIGNMENT & DISPATCH SERVICE CATEGORY TESTS PASSED!');
  console.log('===============================================================');
})().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
