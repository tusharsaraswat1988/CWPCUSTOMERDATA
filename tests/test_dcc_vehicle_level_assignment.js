/**
 * Automated Verification Test: DCC Vehicle-Level Assignment Isolation
 * 
 * Verifies that:
 * 1. For a customer with multiple vehicles, each vehicle has its own independent subscription.
 * 2. Assigning Staff A to Car 1 does not overwrite or force Staff A onto Car 2.
 * 3. Assigning Staff B to Car 2 preserves Staff A on Car 1.
 * 4. Unassigning Car 2 leaves Car 1 actively assigned to Staff A.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load environment variables from .env
if (fs.existsSync(path.resolve('.env'))) {
  const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) {
      let val = t.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[t.slice(0, idx).trim()]) {
        process.env[t.slice(0, idx).trim()] = val;
      }
    }
  }
}

const db = require('../db');
const adminService = require('../services/adminService');

async function testVehicleLevelAssignment() {
  console.log('=== TEST: DCC Vehicle-Level Assignment Isolation ===');

  // Find a multi-vehicle customer
  const { assignments } = await adminService.getDailyCleanAssignments({});
  const apurvRows = assignments.filter(r => r.customerName === 'अपूर्व मित्तल');
  assert(apurvRows.length >= 2, 'Expected Apurv Mittal to have at least 2 vehicles');

  const car1 = apurvRows[0];
  const car2 = apurvRows[1];

  console.log(`Customer: ${car1.customerName}`);
  console.log(`Car 1: Plate ${car1.vehicleNumber}, VehicleID: ${car1.vehicleId}, SubID: ${car1.subscriptionId}`);
  console.log(`Car 2: Plate ${car2.vehicleNumber}, VehicleID: ${car2.vehicleId}, SubID: ${car2.subscriptionId}`);

  assert.notStrictEqual(car1.subscriptionId, car2.subscriptionId, 'Car 1 and Car 2 must have distinct subscriptions');

  // Staff 1 = STF01, Staff 2 = STF02
  const staff1 = 'STF01';
  const staff2 = 'STF02';

  // Step 1: Assign Car 1 to Staff 1
  console.log('\nStep 1: Assigning Car 1 to Staff 1 (STF01)...');
  const res1 = await adminService.assignDailyCleanCustomer({
    customerId: car1.customerId,
    subscriptionId: car1.subscriptionId,
    vehicleId: car1.vehicleId,
    staffId: staff1
  });
  assert.strictEqual(res1.success, true, 'Assignment of Car 1 failed');

  // Step 2: Assign Car 2 to Staff 2
  console.log('Step 2: Assigning Car 2 to Staff 2 (STF02)...');
  const res2 = await adminService.assignDailyCleanCustomer({
    customerId: car2.customerId,
    subscriptionId: car2.subscriptionId,
    vehicleId: car2.vehicleId,
    staffId: staff2
  });
  assert.strictEqual(res2.success, true, 'Assignment of Car 2 failed');

  // Step 3: Verify both cars in getDailyCleanAssignments
  console.log('Step 3: Verifying both assignments are isolated and preserved...');
  const verifyRes = await adminService.getDailyCleanAssignments({});
  const vCar1 = verifyRes.assignments.find(r => r.vehicleId === car1.vehicleId);
  const vCar2 = verifyRes.assignments.find(r => r.vehicleId === car2.vehicleId);

  console.log(`-> Car 1 (${vCar1.vehicleNumber}): Assigned Staff = ${vCar1.staffCode} (${vCar1.staffName})`);
  console.log(`-> Car 2 (${vCar2.vehicleNumber}): Assigned Staff = ${vCar2.staffCode} (${vCar2.staffName})`);

  assert.strictEqual(vCar1.staffCode, 'STF01', 'Car 1 must remain assigned to STF01');
  assert.strictEqual(vCar2.staffCode, 'STF02', 'Car 2 must be assigned to STF02');

  // Step 4: Unassign Car 2 and verify Car 1 remains assigned to Staff 1
  console.log('\nStep 4: Unassigning Car 2...');
  const unassignRes = await adminService.unassignDailyCleanCustomer({
    customerId: car2.customerId,
    subscriptionId: car2.subscriptionId,
    vehicleId: car2.vehicleId,
    reason: 'Testing vehicle-level unassignment'
  });
  assert.strictEqual(unassignRes.success, true, 'Unassignment of Car 2 failed');

  const afterUnassign = await adminService.getDailyCleanAssignments({});
  const postCar1 = afterUnassign.assignments.find(r => r.vehicleId === car1.vehicleId);
  const postCar2 = afterUnassign.assignments.find(r => r.vehicleId === car2.vehicleId);

  console.log(`-> Car 1 after Car 2 unassigned: isAssigned=${postCar1.isAssigned}, Staff=${postCar1.staffCode}`);
  console.log(`-> Car 2 after Car 2 unassigned: isAssigned=${postCar2.isAssigned}, Staff=${postCar2.staffCode}`);

  assert.strictEqual(postCar1.isAssigned, true, 'Car 1 must remain assigned!');
  assert.strictEqual(postCar1.staffCode, 'STF01', 'Car 1 staff must still be STF01');
  assert.strictEqual(postCar2.isAssigned, false, 'Car 2 must now be unassigned!');

  // Cleanup: restore Car 2 back to STF01
  console.log('\nCleanup: Restoring Car 2 to STF01...');
  await adminService.assignDailyCleanCustomer({
    customerId: car2.customerId,
    subscriptionId: car2.subscriptionId,
    vehicleId: car2.vehicleId,
    staffId: 'STF01'
  });

  console.log('\n[PASS] DCC Vehicle-Level Assignment Isolation test PASSED completely!');
}

testVehicleLevelAssignment()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[FAIL]', err);
    process.exit(1);
  });
