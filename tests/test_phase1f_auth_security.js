/**
 * Automated Verification Suite for Phase 1F: Authentication & Security
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');
const authService = require('../services/authService');

async function runAuthSecurityTests() {
  console.log('================================================================');
  console.log('TEST SUITE: Phase 1F Authentication & Session Security');
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

  let testAdmin = null;
  let testStaff = null;

  try {
    // Setup clean test entities
    console.log('--- 1. Admin Authentication & Session Issuance ---');
    const adminPass = 'SecretAdmin123!';
    const adminHash = authService.hashPasswordScrypt(adminPass);
    testAdmin = await repos.adminUsers.createAdmin({
      username: 'test_admin_auth_p1f',
      passwordHash: adminHash,
      role: 'superadmin'
    });
    assert(testAdmin && testAdmin.id, 'Test admin created');

    // Test invalid password
    const badLogin = await authService.loginAdmin({
      username: 'test_admin_auth_p1f',
      password: 'WrongPassword!'
    });
    assert(badLogin.success === false, 'Invalid admin password rejected');

    // Test valid password login
    const goodLogin = await authService.loginAdmin({
      username: 'test_admin_auth_p1f',
      password: adminPass,
      ipAddress: '127.0.0.1'
    });
    assert(goodLogin.success === true && goodLogin.token, 'Valid admin login succeeds with token');
    assert(goodLogin.token.startsWith('adm_'), 'Admin token has adm_ prefix');
    assert(goodLogin.expiresIn === 43200, 'Session has 12-hour TTL (43200 seconds)');

    // Verify token hash is stored in database
    const tokenHash = authService.hashToken(goodLogin.token);
    const dbSess = await repos.authSessions.findActiveSession(tokenHash);
    assert(dbSess && dbSess.admin_id === testAdmin.id, 'SHA-256 token hash stored and verifiable in auth_sessions');

    // Test session validation
    const validCheck = await authService.validateSession(goodLogin.token);
    assert(validCheck.valid === true && validCheck.userType === 'admin', 'validateSession verifies active admin session');

    // Test Admin Logout & Revocation
    await authService.logout(goodLogin.token);
    const revokedCheck = await authService.validateSession(goodLogin.token);
    assert(revokedCheck.valid === false, 'Revoked admin token is strictly rejected');

    // 2. Staff Authentication & Lockout
    console.log('\n--- 2. Staff PIN Authentication & Rate Limiting ---');
    testStaff = await repos.staff.createStaff({
      staffCode: 'STFAUTH01',
      name: 'Auth Test Staff',
      phone: '9876540001',
      isActive: true
    });
    const pin = '123456';
    const pinHash = authService.hashPinScrypt(pin);
    const salt = pinHash.split(':')[1];
    await repos.staffAuth.setPin(testStaff.id, pinHash, salt);
    assert(testStaff && testStaff.id, 'Test staff created with 6-digit PIN');

    // Test valid staff login
    const staffLogin = await authService.loginStaff({
      identifier: '9876540001',
      pin: '123456',
      ipAddress: '127.0.0.1'
    });
    assert(staffLogin.success === true && staffLogin.token, 'Staff phone + PIN login succeeds');
    assert(staffLogin.token.startsWith('stf_'), 'Staff token has stf_ prefix');
    assert(staffLogin.staffId === 'STFAUTH01', 'Staff code resolved correctly');

    // Validate active staff session
    const staffSessCheck = await authService.validateSession(staffLogin.token);
    assert(staffSessCheck.valid === true && staffSessCheck.userType === 'staff', 'validateSession verifies active staff session');

    // Test failed attempts rate limiting (5 attempts -> lockout)
    console.log('\n--- 3. Failed Attempts & 5-Minute Lockout ---');
    for (let i = 1; i <= 4; i++) {
      const failRes = await authService.loginStaff({
        identifier: 'STFAUTH01',
        pin: '000000'
      });
      assert(failRes.success === false && !failRes.rateLimited, `Wrong PIN attempt ${i} rejected`);
    }

    // 5th attempt triggers lockout
    const lockRes = await authService.loginStaff({
      identifier: 'STFAUTH01',
      pin: '000000'
    });
    assert(lockRes.success === false && lockRes.rateLimited === true, '5th failed attempt triggers rate-limiting lockout');

    // Subsequent attempt during lockout is blocked even with correct PIN
    const blockedRes = await authService.loginStaff({
      identifier: 'STFAUTH01',
      pin: '123456'
    });
    assert(blockedRes.success === false && blockedRes.rateLimited === true, 'Correct PIN blocked during active lockout period');

    // Admin resets lockout and PIN
    console.log('\n--- 4. PIN Reset & Session Invalidation ---');
    const resetRes = await authService.resetStaffPin({
      staffId: testStaff.id,
      newPin: '654321',
      adminUser: 'test_admin'
    });
    assert(resetRes.success === true, 'Admin successfully resets staff PIN');

    // Previous active staff session must now be invalidated
    const oldStaffSess = await authService.validateSession(staffLogin.token);
    assert(oldStaffSess.valid === false, 'Previous staff session revoked on PIN reset');

    // Login with new PIN succeeds
    const newStaffLogin = await authService.loginStaff({
      identifier: 'STFAUTH01',
      pin: '654321'
    });
    assert(newStaffLogin.success === true, 'Login with new PIN succeeds after reset');

    // Test Staff Deactivation Revocation
    console.log('\n--- 5. Staff Deactivation Session Invalidation ---');
    await repos.staff.toggleActive(testStaff.id, false);
    const deactivatedSess = await authService.validateSession(newStaffLogin.token);
    assert(deactivatedSess.valid === false && deactivatedSess.inactive === true, 'Deactivated staff session immediately revoked');

    const deactivatedLogin = await authService.loginStaff({
      identifier: 'STFAUTH01',
      pin: '654321'
    });
    assert(deactivatedLogin.success === false && deactivatedLogin.inactive === true, 'Login rejected for deactivated staff');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Cleanup test records
    console.log('\n--- Cleaning up Test Fixtures ---');
    if (testStaff) {
      await db.query('DELETE FROM public.auth_sessions WHERE staff_id = $1', [testStaff.id]);
      await db.query('DELETE FROM public.staff_auth WHERE staff_id = $1', [testStaff.id]);
      await db.query('DELETE FROM public.staff WHERE id = $1', [testStaff.id]);
    }
    if (testAdmin) {
      await db.query('DELETE FROM public.auth_sessions WHERE admin_id = $1', [testAdmin.id]);
      await db.query('DELETE FROM public.admin_users WHERE id = $1', [testAdmin.id]);
    }
    await db.query('DELETE FROM public.audit_logs WHERE changed_by IN (\'test_admin\')').catch(() => {});
  }

  // Verification of 0 test business data
  const finalStaffCount = await repos.staff.countStaff();
  assert(finalStaffCount === 0, 'staff table has 0 test records retained', `(count: ${finalStaffCount})`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  await db.close();
  if (failed > 0) {
    process.exit(1);
  }
}

runAuthSecurityTests().catch(err => {
  console.error('Fatal Auth Test Error:', err);
  process.exit(1);
});
