/**
 * Verification test for Staff Login, Lockout, Admin Unlock, and Multi-device concurrency.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env if present
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
  console.log('--- Starting Staff Login, Lockout, Unlock & Multi-device Verification ---');

  // Ensure clean baseline by clearing any leftover session for STF02 from earlier tests
  try {
    const stf = await repos.staff.findByStaffCode('STF02');
    if (stf) {
      await repos.authSessions.revokeAllForStaff(stf.id);
      await repos.staff.unlockStaff(stf.id);
    }
  } catch (_) {}

  // Test 1: STF02 clean login with correct PIN 654321
  console.log('\n[Test 1] Testing STF02 login with phone 8603756369 and PIN 654321...');
  const initialLogin = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '127.0.0.1'
  });
  console.log('Login result:', { success: initialLogin.success, staffId: initialLogin.staffId, error: initialLogin.error });
  if (!initialLogin.success) {
    throw new Error('Initial login failed: ' + initialLogin.error);
  }
  console.log('✓ Initial login succeeded with token:', initialLogin.token.substring(0, 15) + '...');

  // Test 2: Single Active Device Enforcement (Device B logs in -> Device A is automatically revoked)
  console.log('\n[Test 2] Testing Single Active Device Policy (Device A logs in, then Device B logs in)...');
  const sessionDevA = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '192.168.1.100',
    userAgent: 'Device-A-Android'
  });
  const validABefore = await authService.validateSession(sessionDevA.token);
  console.log('Device A initial session valid:', validABefore.valid);

  const sessionDevB = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '192.168.1.101',
    userAgent: 'Device-B-iPhone'
  });

  const validAAfter = await authService.validateSession(sessionDevA.token);
  const validBAfter = await authService.validateSession(sessionDevB.token);

  console.log('Device A session after Device B login (should be revoked):', validAAfter.valid, validAAfter.error);
  console.log('Device B session (should be active):', validBAfter.valid, validBAfter.staffCode);

  if (validAAfter.valid) {
    throw new Error('Single Active Device Policy failed! Device A token was NOT revoked when Device B logged in.');
  }
  if (!validBAfter.valid) {
    throw new Error('Device B session is not active!');
  }
  console.log('✓ Single Active Device confirmed: Device A was automatically logged out when Device B logged in.');

  // Test 3: Lockout after 5 failed attempts
  console.log('\n[Test 3] Simulating 5 failed PIN attempts to trigger lockout...');
  for (let i = 1; i <= 5; i++) {
    const failRes = await authService.loginStaff({
      identifier: '8603756369',
      pin: '000000',
      ipAddress: '127.0.0.1'
    });
    console.log(` Attempt ${i}:`, { success: failRes.success, rateLimited: failRes.rateLimited, error: failRes.error });
  }

  // 6th attempt with correct password should now be blocked due to lockout
  const blockedRes = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '127.0.0.1'
  });
  console.log('Attempt with correct PIN while locked:', blockedRes);
  if (blockedRes.success) {
    throw new Error('Expected login to be blocked due to lockout, but it succeeded!');
  }
  console.log('✓ Account is confirmed locked (rateLimited:', blockedRes.rateLimited, ')');

  // Test 4: Check admin getStaffList sees isLocked = true
  console.log('\n[Test 4] Checking adminService.getStaffList for isLocked status...');
  const staffList = await adminService.getStaffList({ isAdmin: true });
  const stf02AdminView = staffList.find(s => s.id === 'STF02');
  console.log('STF02 in admin list:', {
    id: stf02AdminView.id,
    isLocked: stf02AdminView.isLocked,
    failedAttempts: stf02AdminView.failedAttempts,
    lockedUntil: stf02AdminView.lockedUntil
  });
  if (!stf02AdminView.isLocked) {
    throw new Error('Expected STF02 isLocked to be true in admin list!');
  }
  console.log('✓ Admin list correctly shows isLocked = true');

  // Test 5: Admin unlocks staff via unlockStaff
  console.log('\n[Test 5] Calling authService.unlockStaff for STF02...');
  const unlockRes = await authService.unlockStaff({ staffCodeOrId: 'STF02', adminUser: 'admin' });
  console.log('Unlock result:', unlockRes);
  if (!unlockRes.success) {
    throw new Error('unlockStaff failed: ' + unlockRes.error);
  }
  console.log('✓ unlockStaff returned success.');

  // Check admin list again - isLocked should now be false
  const staffListAfter = await adminService.getStaffList({ isAdmin: true });
  const stf02AfterUnlock = staffListAfter.find(s => s.id === 'STF02');
  console.log('STF02 in admin list after unlock:', {
    id: stf02AfterUnlock.id,
    isLocked: stf02AfterUnlock.isLocked,
    failedAttempts: stf02AfterUnlock.failedAttempts
  });
  if (stf02AfterUnlock.isLocked) {
    throw new Error('Expected STF02 isLocked to be false after unlock!');
  }
  console.log('✓ Admin list correctly reflects unlocked status (isLocked = false).');

  // Test 6: Login with correct PIN now succeeds immediately
  console.log('\n[Test 6] Testing login immediately after unlock with PIN 654321...');
  const postUnlockLogin = await authService.loginStaff({
    identifier: '8603756369',
    pin: '654321',
    ipAddress: '127.0.0.1'
  });
  console.log('Post-unlock login result:', { success: postUnlockLogin.success, token: postUnlockLogin.token ? postUnlockLogin.token.substring(0, 15) + '...' : null });
  if (!postUnlockLogin.success) {
    throw new Error('Login failed after unlock: ' + postUnlockLogin.error);
  }
  console.log('✓ Post-unlock login succeeded immediately!');

  console.log('\n========================================');
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
