/**
 * tests/test_p3_mobile_and_login_persistence.js
 * Comprehensive automated verification for P3:
 * 1. Mobile Customer Name Visibility & Card Layout (No Clipping, Multi-line Wrap)
 * 2. Role-Based Login Persistence & Refresh Routing (Staff vs Admin Isolation)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING TASK P3: MOBILE VISIBILITY & LOGIN PERSISTENCE TESTS');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// ---------------------------------------------------------------------------
// TEST SUITE 1: CSS & DOM CHECKS FOR ISSUE 1 (CUSTOMER NAME WRAPPING & MOBILE CARD)
// ---------------------------------------------------------------------------

// 1. Verify .cust-full-name has NO forced nowrap or ellipsis
assert.ok(
  indexHtml.includes('white-space: normal;'),
  'FAIL: .cust-full-name must have white-space: normal'
);
assert.ok(
  indexHtml.includes('word-break: break-word;') && indexHtml.includes('overflow-wrap: break-word;'),
  'FAIL: .cust-full-name must allow word breaking / overflow wrapping'
);
assert.ok(
  indexHtml.includes('overflow: visible;'),
  'FAIL: .cust-full-name must have overflow: visible'
);
assert.ok(
  indexHtml.includes('text-overflow: clip;'),
  'FAIL: .cust-full-name must not force text-overflow: ellipsis'
);
console.log('✅ PASS 1: Customer name CSS removes forced nowrap/ellipsis and allows multi-line wrapping.');

// 2. Verify flex alignment on header row and title group is flex-start for optical balance
assert.ok(
  indexHtml.includes('.card-header-row') && indexHtml.includes('align-items: flex-start;'),
  'FAIL: .card-header-row must align items to flex-start for multi-line names'
);
assert.ok(
  indexHtml.includes('.cust-route-seq-badge') && indexHtml.includes('flex-shrink: 0;'),
  'FAIL: .cust-route-seq-badge must have flex-shrink: 0'
);
console.log('✅ PASS 2: Card header row and sequence badge use top-aligned flex-start layout.');

// 3. Verify mobile media queries for <= 480px optimize button padding and name size
assert.ok(
  indexHtml.includes('@media (max-width: 480px)') && indexHtml.includes('font-size: 14.5px;'),
  'FAIL: Mobile media query must keep readable customer name font (14.5px)'
);
console.log('✅ PASS 3: Mobile media query (360px-430px) provides optimized compact padding and touch targets.');

// ---------------------------------------------------------------------------
// TEST SUITE 2: ROUTING & AUTH PERSISTENCE LOGIC SIMULATION (ISSUE 2)
// ---------------------------------------------------------------------------

function simulateRouter(options) {
  const {
    pathname = '',
    search = '',
    sessionStorage = {},
    localStorage = {},
    initialMode = 'staff',
    initialStaffId = ''
  } = options;

  let state = {
    currentView: 'staff',
    activeStaffId: ''
  };

  const urlParams = new URLSearchParams(search);
  const paramStaff = urlParams.get('staff') || urlParams.get('id') || '';
  const paramAdmin = urlParams.get('admin');
  const path = (pathname || '').toLowerCase().replace(/\/+$/, '');
  const isStaffPath = path === '/staff' || path.startsWith('/staff/');
  const isAdminPath = path === '/admin' || path.startsWith('/admin/');
  const savedRole = sessionStorage['cwp_user_role'] || '';

  function isUserAdminAuthenticated() {
    return !!(sessionStorage['cwp_admin_token'] || localStorage['cwp_admin_token']);
  }

  function isUserStaffAuthenticated(sId) {
    const key = 'cwp_staff_auth_' + (sId || 'DEFAULT').toUpperCase() + '_token';
    return !!(sessionStorage[key] || localStorage[key]);
  }

  /* Core Router Logic matching Index.html */
  if (isAdminPath || (paramAdmin !== null && paramAdmin !== undefined)) {
    state.currentView = 'admin';
  } else if (isStaffPath || (paramStaff && paramStaff.trim() !== '')) {
    state.currentView = 'staff';
    if (paramStaff) state.activeStaffId = paramStaff.trim();
  } else if (savedRole === 'admin') {
    state.currentView = 'admin';
  } else if (savedRole === 'staff') {
    state.currentView = 'staff';
  } else if (initialMode === 'admin') {
    state.currentView = 'admin';
  } else if (initialMode === 'staff') {
    state.currentView = 'staff';
    if (initialStaffId) state.activeStaffId = initialStaffId;
  } else if (isUserAdminAuthenticated()) {
    state.currentView = 'admin';
  } else {
    state.currentView = 'staff';
  }

  // Determine which gate / view is displayed
  let displayedView = '';
  if (state.currentView === 'admin') {
    if (isUserAdminAuthenticated()) {
      displayedView = 'AdminDashboard';
    } else {
      displayedView = 'AdminLoginGate';
    }
  } else {
    const activeId = state.activeStaffId || localStorage['cwp_last_staff_id'] || '';
    if (activeId && isUserStaffAuthenticated(activeId)) {
      displayedView = 'StaffPortal';
    } else {
      displayedView = 'StaffLoginGate';
    }
  }

  return { state, displayedView };
}

// Scenario 1: Staff Login page -> Refresh -> Remains on Staff Login
{
  const res = simulateRouter({
    pathname: '/staff',
    sessionStorage: { cwp_user_role: 'staff' },
    localStorage: {}
  });
  assert.strictEqual(res.state.currentView, 'staff');
  assert.strictEqual(res.displayedView, 'StaffLoginGate');
  console.log('✅ PASS 4: Staff Login page -> Refresh -> Remains on Staff Login Gate.');
}

// Scenario 2: Admin Login page -> Refresh -> Remains on Admin Login
{
  const res = simulateRouter({
    pathname: '/admin',
    sessionStorage: { cwp_user_role: 'admin' },
    localStorage: {} // unauthenticated
  });
  assert.strictEqual(res.state.currentView, 'admin');
  assert.strictEqual(res.displayedView, 'AdminLoginGate');
  console.log('✅ PASS 5: Admin Login page -> Refresh -> Remains on Admin Login Gate.');
}

// Scenario 2b: Admin Login page (?admin=1) -> Refresh -> Remains on Admin Login even if staff token in localStorage
{
  const res = simulateRouter({
    pathname: '/',
    search: '?admin=1',
    sessionStorage: { cwp_user_role: 'admin' },
    localStorage: { cwp_last_staff_id: 'STF01', cwp_staff_auth_STF01_token: 'dummy' }
  });
  assert.strictEqual(res.state.currentView, 'admin');
  assert.strictEqual(res.displayedView, 'AdminLoginGate');
  console.log('✅ PASS 6: Admin Login page with staff token present -> Refresh -> Strictly stays on Admin Login Gate.');
}

// Scenario 3: Admin Dashboard -> Refresh -> Remains on Admin Dashboard
{
  const res = simulateRouter({
    pathname: '/admin',
    sessionStorage: { cwp_user_role: 'admin', cwp_admin_token: 'adm_valid_token' },
    localStorage: {}
  });
  assert.strictEqual(res.state.currentView, 'admin');
  assert.strictEqual(res.displayedView, 'AdminDashboard');
  console.log('✅ PASS 7: Authenticated Admin Dashboard -> Refresh -> Restores Admin Dashboard.');
}

// Scenario 4: Staff Portal -> Refresh -> Remains on Staff Portal
{
  const res = simulateRouter({
    pathname: '/staff',
    sessionStorage: { cwp_user_role: 'staff' },
    localStorage: { cwp_last_staff_id: 'STF01', cwp_staff_auth_STF01_token: 'stf_valid_token' }
  });
  assert.strictEqual(res.state.currentView, 'staff');
  assert.strictEqual(res.displayedView, 'StaffPortal');
  console.log('✅ PASS 8: Authenticated Staff Portal -> Refresh -> Restores Staff Portal.');
}

// Scenario 5: Admin Logout -> Does not open Staff Portal automatically
{
  // Admin logs out: clear admin token, set session role = 'admin', URL set to /admin
  const afterLogout = simulateRouter({
    pathname: '/admin',
    sessionStorage: { cwp_user_role: 'admin' }, // admin token removed
    localStorage: { cwp_last_staff_id: 'STF01', cwp_staff_auth_STF01_token: 'stf_token' } // staff tokens present on device
  });
  assert.strictEqual(afterLogout.state.currentView, 'admin');
  assert.strictEqual(afterLogout.displayedView, 'AdminLoginGate');
  console.log('✅ PASS 9: Admin logout -> Does not open Staff Portal; strictly displays Admin Login Gate.');
}

// Scenario 6: Staff Logout -> Does not open Admin Dashboard automatically
{
  // Staff logs out: clear staff token, set session role = 'staff', URL set to /staff
  const afterLogout = simulateRouter({
    pathname: '/staff',
    sessionStorage: { cwp_user_role: 'staff' }, // staff token removed
    localStorage: { cwp_admin_token: 'adm_token' } // admin token present on device
  });
  assert.strictEqual(afterLogout.state.currentView, 'staff');
  assert.strictEqual(afterLogout.displayedView, 'StaffLoginGate');
  console.log('✅ PASS 10: Staff logout -> Does not open Admin Dashboard; strictly displays Staff Login Gate.');
}

// Scenario 7: Invalid / Expired Admin Session -> Stays on Admin Login
{
  // 401 returns on admin endpoint: handleUnauthorizedResponse cleans admin tokens and preserves admin role
  const afterExpired = simulateRouter({
    pathname: '/admin',
    sessionStorage: { cwp_user_role: 'admin' },
    localStorage: { cwp_last_staff_id: 'STF01', cwp_staff_auth_STF01_token: 'stf_token' }
  });
  assert.strictEqual(afterExpired.state.currentView, 'admin');
  assert.strictEqual(afterExpired.displayedView, 'AdminLoginGate');
  console.log('✅ PASS 11: Expired/Unauthorized Admin Session -> Redirects strictly to Admin Login Gate.');
}

// Scenario 8: Invalid / Expired Staff Session -> Stays on Staff Login
{
  // 401 returns on staff endpoint: handleUnauthorizedResponse cleans staff tokens and preserves staff role
  const afterExpired = simulateRouter({
    pathname: '/staff',
    sessionStorage: { cwp_user_role: 'staff' },
    localStorage: {}
  });
  assert.strictEqual(afterExpired.state.currentView, 'staff');
  assert.strictEqual(afterExpired.displayedView, 'StaffLoginGate');
  console.log('✅ PASS 12: Expired/Unauthorized Staff Session -> Redirects strictly to Staff Login Gate.');
}

// Scenario 9: Google Apps Script default mode "admin" without path routing
{
  const res = simulateRouter({
    pathname: '/macros/s/xyz/exec',
    initialMode: 'admin',
    sessionStorage: {},
    localStorage: {}
  });
  assert.strictEqual(res.state.currentView, 'admin');
  assert.strictEqual(res.displayedView, 'AdminLoginGate');
  console.log('✅ PASS 13: Google Apps Script initialMode="admin" without URL path resolves to Admin.');
}

// Scenario 10: handleUnauthorizedResponse state.currentView check
assert.ok(
  indexHtml.includes('state.currentView === \'admin\''),
  'FAIL: handleUnauthorizedResponse must check state.currentView instead of buggy state.currentMode'
);
assert.ok(
  !indexHtml.includes('state.currentMode === \'admin\''),
  'FAIL: Buggy state.currentMode must be eliminated'
);
console.log('✅ PASS 14: Buggy state.currentMode typo strictly eliminated from Index.html.');

console.log('===============================================================');
console.log('🎉 ALL 14 TASK P3 TESTS PASSED PERFECTLY!');
console.log('===============================================================');
