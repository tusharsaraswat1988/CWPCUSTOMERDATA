/**
 * Verification Suite for Option 1: Active Session Protection & Device Shield
 */
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(l => {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const authService = require('../services/authService');
const adminService = require('../services/adminService');
const repos = require('../db/repositories');

async function runTests() {
  console.log('===============================================================');
  console.log('🛡️  TESTING OPTION 1: ACTIVE SESSION PROTECTION (DEVICE SHIELD)');
  console.log('===============================================================');

  const staff = await repos.staff.findByStaffCode('STF02');
  if (!staff) throw new Error('STF02 not found');

  // Step 0: Clean up any previous sessions for a clean test
  await repos.authSessions.revokeAllForStaff(staff.id, 'test_cleanup');
  await repos.staffAuth.resetLockout(staff.id);

  // Test 1: Genuine Device A logs in
  console.log('\n[Test 1] Genuine Staff Device A logs in...');
  const devALogin = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '192.168.1.101',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Samsung Galaxy M31)',
    deviceId: 'dev_gaurav_phone_001'
  });
  console.log('Device A login result:', { success: devALogin.success, token: devALogin.token ? devALogin.token.slice(0, 15) + '...' : null });
  if (!devALogin.success) throw new Error('Device A login failed: ' + devALogin.error);
  console.log('✅ PASS: Genuine Device A logged in successfully.');

  // Verify Device A session is valid
  const devAValid1 = await authService.validateSession(devALogin.token);
  if (!devAValid1.valid) throw new Error('Device A session should be valid');
  console.log('✅ PASS: Device A session is active in database.');

  // Test 2: Unauthorized / Second Device B attempts to log in with STF02's credentials
  console.log('\n[Test 2] Another Device B tries to log in with same phone & PIN while Device A is on duty...');
  const devBLogin = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '203.0.113.55',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    deviceId: 'dev_another_device_002'
  });
  console.log('Device B login result:', {
    success: devBLogin.success,
    sessionConflict: devBLogin.sessionConflict,
    error: devBLogin.error
  });

  if (devBLogin.success) {
    throw new Error('SECURITY VIOLATION! Device B was allowed to log in while Device A was active!');
  }
  if (!devBLogin.sessionConflict) {
    throw new Error('Expected sessionConflict to be true on Device B login attempt!');
  }
  console.log('✅ PASS: Device B was BLOCKED with sessionConflict protection.');

  // Test 3: Verify Genuine Device A was NOT kicked out and is still 100% active!
  console.log('\n[Test 3] Verifying Genuine Device A session was NOT terminated by Device B attempt...');
  const devAValid2 = await authService.validateSession(devALogin.token);
  if (!devAValid2.valid) {
    throw new Error('REGRESSION! Device A was kicked out by Device B attempt!');
  }
  console.log('✅ PASS: Genuine Device A is still active and uninterrupted on shift!');

  // Test 4: Genuine Device A reloads / re-enters PIN on the SAME phone
  console.log('\n[Test 4] Genuine Device A re-enters PIN on the same phone (token refresh)...');
  const devARefresh = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '192.168.1.101',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Samsung Galaxy M31)',
    deviceId: 'dev_gaurav_phone_001'
  });
  console.log('Device A re-login result:', { success: devARefresh.success, error: devARefresh.error });
  if (!devARefresh.success) {
    throw new Error('Device A should be allowed to re-login on its own device!');
  }
  console.log('✅ PASS: Same device re-login succeeded smoothly.');

  // Test 5: Genuine Device A logs out explicitly
  console.log('\n[Test 5] Genuine Device A logs out at shift end...');
  await authService.logout(devARefresh.token);
  const devAAfterLogout = await authService.validateSession(devARefresh.token);
  if (devAAfterLogout.valid) throw new Error('Device A should be invalid after logout');
  console.log('✅ PASS: Device A logged out cleanly.');

  // Test 6: Now Device B logs in after Device A logged out
  console.log('\n[Test 6] Device B logs in now that Device A is logged out...');
  const devBLoginAfter = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '203.0.113.55',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    deviceId: 'dev_another_device_002'
  });
  if (!devBLoginAfter.success) throw new Error('Device B should succeed after Device A logged out');
  console.log('✅ PASS: Device B logged in successfully.');

  // Test 7: Admin "Reset Device Session" feature
  console.log('\n[Test 7] Testing Admin "Reset Device Session" (Admin unlocks / resets device)...');
  const devCTry = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '10.0.0.5',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    deviceId: 'dev_device_c_003'
  });
  if (devCTry.success) throw new Error('Device C should be blocked while Device B is active');
  console.log('Device C was blocked as expected.');

  // Admin resets staff session
  const adminResetRes = await authService.unlockStaff({ staffCodeOrId: 'STF02', adminUser: 'admin', clearSessions: true });
  console.log('Admin reset result:', adminResetRes.message);

  // Device C can now log in
  const devCLoginAfterReset = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '10.0.0.5',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    deviceId: 'dev_device_c_003'
  });
  if (!devCLoginAfterReset.success) throw new Error('Device C should succeed after Admin reset device session');
  console.log('✅ PASS: Device C logged in successfully after Admin reset!');

  console.log('\n===============================================================');
  console.log('🎉 ALL 7 OPTION 1 ACTIVE SESSION PROTECTION TESTS PASSED (100%)!');
  console.log('===============================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
