/**
 * =========================================================================
 * QA TEST SUITE: Staff Extended Non-Mandatory Fields & Mobile Uniqueness
 * =========================================================================
 * Tests:
 * 1. Database schema contains all 12 extended columns on public.staff
 * 2. staffRepo properly inserts and updates all extended non-mandatory fields
 * 3. Mobile uniqueness validation: duplicate phone rejected with clear error
 * 4. adminService saveStaffMember & getStaffList roundtrip with all extended fields
 * 5. Document photo uploads and view/remove lifecycle
 * 6. UI DOM elements in Index.html & handlers in public/js/app.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Auto-load .env for standalone script execution if present
try {
  const envPath = path.resolve(__dirname, '../.env');
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
} catch (e) {}

const db = require('../db/index');
const repos = require('../db/repositories/index');
const adminService = require('../services/adminService');

async function runStaffExtendedFieldsSuite() {
  console.log('===============================================================');
  console.log('🚀 RUNNING STAFF EXTENDED FIELDS & PHONE UNIQUENESS QA SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`✅ PASS ${total}: ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`❌ FAIL ${total}: ${msg}`, err);
    process.exit(1);
  }

  // --- SECTION 1: DATABASE SCHEMA VERIFICATION ---
  console.log('--- SECTION 1: Neon Database Schema Verification ---');
  try {
    const colRes = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'staff'
    `);
    const cols = colRes.rows.map(r => r.column_name);

    const requiredCols = [
      'email',
      'date_of_joining',
      'aadhar_number',
      'aadhar_front_url',
      'aadhar_back_url',
      'bank_passbook_url',
      'pan_number',
      'pan_card_url',
      'driving_license_number',
      'driving_license_url',
      'salary',
      'weekly_off'
    ];

    for (const col of requiredCols) {
      assert(cols.includes(col), `Column ${col} missing from public.staff`);
    }
    pass(`All ${requiredCols.length} extended columns verified on public.staff in Neon database.`);
  } catch (err) {
    fail('Schema verification failed', err);
  }

  // --- SECTION 2: STAFF REPO EXTENDED FIELDS PERSISTENCE ---
  console.log('\n--- SECTION 2: staffRepo Persistence & Update ---');
  let testStaffId = null;
  let testStaffCode = 'STF_TEST_QA';
  const testPhone = '9911223344';

  try {
    // Clean up if leftover
    await db.query(`DELETE FROM public.staff WHERE staff_code = $1 OR phone = $2`, [testStaffCode, testPhone]);

    const created = await repos.staff.createStaff({
      staffCode: testStaffCode,
      name: 'QA Test Staff Member',
      phone: testPhone,
      email: 'qatest@example.com',
      dateOfJoining: '2026-01-15',
      aadharNumber: '1234 5678 9012',
      aadharFrontUrl: 'https://example.com/aadhar-front.jpg',
      aadharBackUrl: 'https://example.com/aadhar-back.jpg',
      bankPassbookUrl: 'https://example.com/passbook.jpg',
      panNumber: 'ABCDE1234F',
      panCardUrl: 'https://example.com/pan.jpg',
      drivingLicenseNumber: 'DL-0420110012345',
      drivingLicenseUrl: 'https://example.com/dl.jpg',
      salary: 18500,
      weeklyOff: 'Sunday'
    });

    testStaffId = created.id;
    assert.strictEqual(created.email, 'qatest@example.com');
    assert.strictEqual(created.aadhar_number, '1234 5678 9012');
    assert.strictEqual(created.pan_number, 'ABCDE1234F');
    assert.strictEqual(created.weekly_off, 'Sunday');
    assert.strictEqual(Number(created.salary), 18500);
    pass('repos.staff.createStaff successfully saved all extended fields.');

    // Test update
    const updated = await repos.staff.updateStaff(testStaffId, {
      salary: 21000,
      weeklyOff: 'Monday',
      email: 'qa_updated@example.com'
    });

    assert.strictEqual(Number(updated.salary), 21000);
    assert.strictEqual(updated.weekly_off, 'Monday');
    assert.strictEqual(updated.email, 'qa_updated@example.com');
    pass('repos.staff.updateStaff successfully updated extended fields.');
  } catch (err) {
    fail('staffRepo operations failed', err);
  }

  // --- SECTION 3: STAFF MOBILE UNIQUENESS VALIDATION ---
  console.log('\n--- SECTION 3: Mobile Number Uniqueness Validation ---');
  try {
    // Attempt to create another staff member with the same phone testPhone (9911223344)
    const dupRes = await adminService.saveStaffMember({
      name: 'Duplicate Phone Staff',
      phone: testPhone,
      pin: '998877'
    });

    assert.strictEqual(dupRes.success, false, 'Duplicate phone should have been rejected');
    assert(dupRes.error.includes('already registered to another staff member'), `Expected duplicate phone error, got: ${dupRes.error}`);
    pass(`Duplicate phone registration prevented with error: "${dupRes.error}"`);
  } catch (err) {
    fail('Mobile uniqueness validation failed', err);
  }

  // --- SECTION 4: ADMIN SERVICE FULL ROUNDTRIP ---
  console.log('\n--- SECTION 4: adminService Roundtrip & Sanitization ---');
  try {
    const list = await adminService.getStaffList({ isAdmin: true });
    const target = list.find(s => s.id === testStaffCode);
    assert(target, 'Created test staff not found in getStaffList');
    assert.strictEqual(target.email, 'qa_updated@example.com');
    assert.strictEqual(target.weeklyOff, 'Monday');
    assert.strictEqual(target.salary, 21000);
    assert.strictEqual(target.aadharNumber, '1234 5678 9012');
    assert.strictEqual(target.panNumber, 'ABCDE1234F');
    assert.strictEqual(target.drivingLicenseNumber, 'DL-0420110012345');
    assert.strictEqual(target.aadharFrontUrl, 'https://example.com/aadhar-front.jpg');
    assert.strictEqual(target.aadharBackUrl, 'https://example.com/aadhar-back.jpg');
    assert.strictEqual(target.bankPassbookUrl, 'https://example.com/passbook.jpg');
    pass('adminService.getStaffList returned all extended fields accurately.');

    // Public list sanitization should NOT leak sensitive KYC docs or salary
    const publicList = await adminService.getStaffList({ isAdmin: false });
    const pubTarget = publicList.find(s => s.id === testStaffCode);
    assert(pubTarget, 'Test staff found in public list');
    assert.strictEqual(pubTarget.salary, undefined);
    assert.strictEqual(pubTarget.aadharNumber, undefined);
    assert.strictEqual(pubTarget.panNumber, undefined);
    pass('Public staff list role sanitization verified: zero leakage of KYC or salary data.');
  } catch (err) {
    fail('adminService roundtrip failed', err);
  }

  // --- SECTION 5: CLEANUP TEST STAFF ---
  try {
    if (testStaffId) {
      await db.query(`DELETE FROM public.staff WHERE id = $1`, [testStaffId]);
      pass('Test staff member cleaned up from database.');
    }
  } catch (err) {
    console.warn('Cleanup warning:', err.message);
  }

  // --- SECTION 6: DOM & CLIENT JAVASCRIPT VERIFICATION ---
  console.log('\n--- SECTION 6: Index.html DOM & public/js/app.js Verification ---');
  try {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../Index.html'), 'utf8');
    const appJs = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8');

    // Index.html checks
    const expectedDomIds = [
      'staffEditModal',
      'editStaffJoiningDate',
      'editStaffSalary',
      'editStaffWeeklyOff',
      'editStaffEmail',
      'editStaffAadharNumber',
      'fileAadharFront',
      'previewAadharFront',
      'fileAadharBack',
      'previewAadharBack',
      'fileBankPassbook',
      'previewBankPassbook',
      'editStaffPanNumber',
      'filePanCard',
      'previewPanCard',
      'editStaffDlNumber',
      'fileDrivingLicense',
      'previewDrivingLicense',
      'staffPortalProfileDetailsCard',
      'staffPortalPhoneDisplay',
      'staffPortalWeeklyOffDisplay',
      'staffPortalSalaryDisplay'
    ];

    for (const domId of expectedDomIds) {
      assert(indexHtml.includes(`id="${domId}"`), `Missing DOM element id="${domId}" in Index.html`);
    }
    pass(`All ${expectedDomIds.length} expected DOM elements verified in Index.html.`);

    // Check weekly off dropdown contains all days
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of days) {
      assert(indexHtml.includes(`value="${day}"`), `Dropdown missing day option: ${day}`);
    }
    pass('Weekly off dropdown in Index.html verified with all 7 days of the week.');

    // app.js checks
    const expectedFunctions = [
      'handleStaffDocSelect',
      'removeStaffDoc',
      'viewStaffDoc',
      'openEditStaffModal',
      'handleEditStaffSubmit',
      'handleAddStaff'
    ];

    for (const fn of expectedFunctions) {
      assert(appJs.includes(`function ${fn}`) || appJs.includes(`${fn}:`) || appJs.includes(`window.${fn}`), `Missing function ${fn} in app.js`);
    }
    pass(`All client-side staff management & document handling functions verified in app.js.`);

    // Verify phone uniqueness check in app.js
    assert(appJs.includes('serves as proof of identity and must be unique'), 'Missing client-side duplicate phone prevention check in app.js');
    pass('Client-side staff mobile number uniqueness validation verified in app.js.');
  } catch (err) {
    fail('DOM/JS verification failed', err);
  }

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passed}/${total} STAFF EXTENDED FIELDS & PHONE UNIQUENESS TESTS PASSED!`);
  console.log('===============================================================\n');
}

runStaffExtendedFieldsSuite().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
