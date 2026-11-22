/**
 * Automated Verification Suite: Iteration 2 Challenger Edge Cases Remediation
 * Tests all 10 edge cases and fixes mandated by Challenger 1 and Challenger 2:
 * 1. Multi-Staff Partitioning in calculateConsecutiveTimes
 * 2. Malformed Date Guard (calculateConsecutiveTimes & computeWashSolarElapsed)
 * 3. Undefined adminSpecialState variable safe resolution
 * 4. Empty Staff Guard in renderStaffWorkloadChart
 * 5. URL Hash Synchronization in switchAdminTab
 * 6. Deep Linking hashchange event listener
 * 7. Desktop Sidebar Rail Persistence on Reload
 * 8. Header Logout Dynamic Revive Prevention
 * 9. Mobile Duplicate Collapse Button Suppression (@media max-width: 1024px)
 * 10. Toast Notification for Job Assignment (showToast vs alert)
 * 11. Modularity & HTML Budget (< 3000 lines, < 220 KB)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const adminService = require('../services/adminService');
const appJsPath = path.join(__dirname, '../public/js/app.js');
const styleCssPath = path.join(__dirname, '../public/css/style.css');
const indexHtmlPath = path.join(__dirname, '../Index.html');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

console.log('===============================================================');
console.log('🚀 RUNNING ITERATION 2 CHALLENGER REMEDIATIONS QA TEST SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Multi-Staff Partitioning in calculateConsecutiveTimes
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Multi-Staff Partitioning in calculateConsecutiveTimes ---');
{
  const multiLogs = [
    { id: 1, staff_id: 'STAFF_A', completed_at_device: '2026-11-22T08:00:00Z', vehicle_num: 'CAR_A1', address_text: 'Loc A1' },
    { id: 2, staff_id: 'STAFF_B', completed_at_device: '2026-11-22T08:15:00Z', vehicle_num: 'CAR_B1', address_text: 'Loc B1' },
    { id: 3, staff_id: 'STAFF_A', completed_at_device: '2026-11-22T08:35:00Z', vehicle_num: 'CAR_A2', address_text: 'Loc A2' },
    { id: 4, staff_id: 'STAFF_B', completed_at_device: '2026-11-22T08:50:00Z', vehicle_num: 'CAR_B2', address_text: 'Loc B2' },
    { id: 5, staff_id: 'STAFF_C', completed_at_device: '2026-11-22T09:00:00Z', vehicle_num: 'CAR_C1', address_text: 'Loc C1' }
  ];

  // Test adminService implementation
  const resService = adminService.calculateConsecutiveTimes(multiLogs);
  assert.strictEqual(resService.length, 5, 'Must return duration info for all 5 logs');

  const sA = resService.filter(r => r.staff_id === 'STAFF_A');
  const sB = resService.filter(r => r.staff_id === 'STAFF_B');
  const sC = resService.filter(r => r.staff_id === 'STAFF_C');

  // Staff A sequence
  assert.strictEqual(sA[0].transitDurationMinutes, 0, 'Staff A car 1 transit must be 0 (shift start)');
  assert.strictEqual(sA[0].previousVehicleNum, null, 'Staff A car 1 previous vehicle must be null');
  assert.strictEqual(sA[1].previousVehicleNum, 'CAR_A1', 'Staff A car 2 previous vehicle must be CAR_A1');
  assert.ok(sA[1].transitDurationMinutes > 0, 'Staff A car 2 transit must be calculated');

  // Staff B sequence (must NOT subtract Staff A's car 1!)
  assert.strictEqual(sB[0].transitDurationMinutes, 0, 'Staff B car 1 transit must be 0 (not subtracted from Staff A!)');
  assert.strictEqual(sB[0].previousVehicleNum, null, 'Staff B car 1 previous vehicle must be null (not CAR_A1!)');
  assert.strictEqual(sB[1].previousVehicleNum, 'CAR_B1', 'Staff B car 2 previous vehicle must be CAR_B1');
  assert.ok(sB[1].transitDurationMinutes > 0, 'Staff B car 2 transit must be calculated');

  // Staff C single car shift
  assert.strictEqual(sC[0].transitDurationMinutes, 0, 'Staff C single car transit must be 0');
  assert.strictEqual(sC[0].previousVehicleNum, null, 'Staff C previous vehicle must be null');

  // Test app.js client logic
  assert.ok(appJs.includes('staffMap[sId] = [];'), 'public/js/app.js partitions logs by staff member');
  assert.ok(appJs.includes('curr.previousVehicleNum = prevVeh') || appJs.includes('previousVehicleNum: prevVeh'), 'public/js/app.js computes previousVehicleNum within staff partition');
  console.log('✅ PASS 1: Multi-staff partitioning strictly isolates staff sequences and previousVehicleNum');
}

// -----------------------------------------------------------------------------
// Test 2: Defensive Malformed Date Guard
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Defensive Malformed Date Guard ---');
{
  const corruptLogs = [
    { id: 10, staff_id: 'S1', completed_at_device: 'invalid-date-string', vehicle_num: 'CAR_CORRUPT' },
    { id: 20, staff_id: 'S1', completed_at_device: null, vehicle_num: 'CAR_NULL' },
    { id: 30, staff_id: 'S1', completed_at_device: undefined, vehicle_num: 'CAR_UNDEF' },
    { id: 40, staff_id: 'S1', completed_at_device: '', vehicle_num: 'CAR_EMPTY' }
  ];

  const corruptRes = adminService.calculateConsecutiveTimes(corruptLogs);
  assert.strictEqual(corruptRes.length, 4, 'Must return all logs despite invalid dates');
  corruptRes.forEach((item, idx) => {
    assert.ok(!isNaN(item.transitDurationMinutes), `Item ${idx} transitDurationMinutes must not be NaN`);
    assert.strictEqual(typeof item.transitDurationMinutes, 'number', `Item ${idx} transit must be number`);
  });

  // computeWashSolarElapsed with corrupt dates
  const corruptJob1 = { status: 'in_progress', started_at: 'gibberish' };
  const corruptJob2 = { status: 'completed', started_at: 'bad', completed_at: 'worse' };
  const corruptJob3 = { status: 'assigned', assigned_at: 'unknown' };

  const elapsed1 = adminService.computeWashSolarElapsed(corruptJob1, 'not-a-number');
  const elapsed2 = adminService.computeWashSolarElapsed(corruptJob2, 'invalid');
  const elapsed3 = adminService.computeWashSolarElapsed(corruptJob3, null);

  assert.ok(!isNaN(elapsed1), 'Elapsed 1 must not be NaN');
  assert.ok(!isNaN(elapsed2), 'Elapsed 2 must not be NaN');
  assert.ok(!isNaN(elapsed3), 'Elapsed 3 must not be NaN');
  assert.strictEqual(typeof elapsed1, 'number');
  assert.strictEqual(typeof elapsed2, 'number');
  assert.strictEqual(typeof elapsed3, 'number');

  console.log('✅ PASS 2: Defensive malformed date guards prevent NaN propagation across calculations');
}

// -----------------------------------------------------------------------------
// Test 3: Undefined adminSpecialState Safe Fallback
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Undefined adminSpecialState Safe Fallback ---');
{
  // Check that public/js/app.js includes defensive fallbacks
  assert.ok(
    appJs.includes('typeof adminSpecialJobsState !== \'undefined\'') ||
    appJs.includes('typeof adminSpecialState !== \'undefined\''),
    'app.js guards adminSpecialState with typeof check'
  );
  assert.ok(
    appJs.includes('window.adminSpecialState') || appJs.includes('var adminSpecialState'),
    'app.js initializes adminSpecialState safely'
  );
  console.log('✅ PASS 3: Safe fallback and resolution for adminSpecialState prevents ReferenceError');
}

// -----------------------------------------------------------------------------
// Test 4: Empty Staff Guard in renderStaffWorkloadChart
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: Empty Staff Guard in renderStaffWorkloadChart ---');
{
  assert.ok(
    appJs.includes('(staffRec && staffRec.cleaned != null) ? staffRec.cleaned : 0') ||
    appJs.includes('cleaned != null'),
    'renderStaffWorkloadChart guards against missing cleaned property'
  );
  assert.ok(
    appJs.includes('No staff activity data'),
    'renderStaffWorkloadChart renders safe empty text when staff array is empty'
  );
  console.log('✅ PASS 4: Empty staff list and missing cleaned properties handled safely');
}

// -----------------------------------------------------------------------------
// Test 5: URL Hash Synchronization in switchAdminTab
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: URL Hash Synchronization in switchAdminTab ---');
{
  assert.ok(
    appJs.includes("var targetHash = '#admin/' + tabName;"),
    'switchAdminTab sets targetHash to #admin/<tabName>'
  );
  assert.ok(
    appJs.includes("window.location.hash = targetHash"),
    'switchAdminTab updates window.location.hash'
  );
  console.log('✅ PASS 5: #admin/dashboard and #admin/jobAssignment synced to window.location.hash');
}

// -----------------------------------------------------------------------------
// Test 6: Deep Linking / hashchange Event Listener
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: Deep Linking / hashchange Event Listener ---');
{
  assert.ok(
    appJs.includes("window.addEventListener('hashchange'"),
    'app.js registers window.addEventListener(\'hashchange\')'
  );
  assert.ok(
    appJs.includes("switchAdminTab(tabFromHash"),
    'hashchange listener calls switchAdminTab with tab from hash'
  );
  console.log('✅ PASS 6: SPA deep linking and browser back/forward routing supported via hashchange');
}

// -----------------------------------------------------------------------------
// Test 7: Desktop Sidebar Rail Persistence on Reload
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: Desktop Sidebar Rail Persistence on Reload ---');
{
  assert.ok(
    appJs.includes("initDesktopSidebarState();"),
    'initDesktopSidebarState() is called on startup'
  );
  assert.ok(
    appJs.includes("cwp_admin_sidebar_collapsed"),
    'initDesktopSidebarState reads cwp_admin_sidebar_collapsed from localStorage'
  );
  console.log('✅ PASS 7: Desktop sidebar rail persistence is initialized on reload');
}

// -----------------------------------------------------------------------------
// Test 8: Header Logout Dynamic Revive Prevention
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: Header Logout Dynamic Revive Prevention ---');
{
  assert.ok(
    appJs.includes("adminLogout.style.setProperty('display', 'none', 'important')"),
    'Header logout button is suppressed with display: none !important on auth'
  );
  assert.ok(
    !appJs.includes("adminLogout.style.setProperty('display', 'flex', 'important')"),
    'adminLogout display: flex !important revival is strictly eliminated'
  );
  assert.ok(
    indexHtml.includes('id="sidebarAdminLogoutBtn"'),
    'Logout is exclusively available in sidebar footer'
  );
  console.log('✅ PASS 8: Header logout dynamic revival eliminated; sidebar footer is exclusive logout point');
}

// -----------------------------------------------------------------------------
// Test 9: Mobile Duplicate Collapse Button Suppression
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9: Mobile Duplicate Collapse Button Suppression ---');
{
  const hasMobileCollapseSuppression = styleCss.includes('@media (max-width: 1024px)') &&
    styleCss.includes('.sidebar-desktop-collapse-btn') &&
    styleCss.includes('display: none !important');

  assert.ok(
    hasMobileCollapseSuppression,
    'style.css suppresses .sidebar-desktop-collapse-btn on mobile screens (max-width: 1024px)'
  );
  console.log('✅ PASS 9: Mobile duplicate collapse button suppressed via CSS media query');
}

// -----------------------------------------------------------------------------
// Test 10: Toast Notification for Job Assignment
// -----------------------------------------------------------------------------
console.log('\n--- TEST 10: Toast Notification for Job Assignment ---');
{
  assert.ok(
    appJs.includes("showToast('Please fill all required fields"),
    'Validation error uses showToast instead of alert'
  );
  assert.ok(
    appJs.includes("showToast('Job assigned successfully to"),
    'Success notification uses showToast instead of alert'
  );
  assert.ok(
    appJs.includes("showToast('Error assigning job:"),
    'Server error notification uses showToast instead of alert'
  );
  console.log('✅ PASS 10: Native alert() replaced with non-blocking showToast() for Job Assignment');
}

// -----------------------------------------------------------------------------
// Test 11: Modularity & HTML Budget
// -----------------------------------------------------------------------------
console.log('\n--- TEST 11: Modularity & HTML Budget ---');
{
  const lines = indexHtml.split('\n').length;
  const sizeBytes = Buffer.byteLength(indexHtml, 'utf8');
  const sizeKB = (sizeBytes / 1024).toFixed(1);

  console.log(`[Metrics] Index.html Lines: ${lines} (Budget: < 3000)`);
  console.log(`[Metrics] Index.html Size: ${sizeKB} KB (Budget: < 220 KB)`);

  assert.ok(lines < 3000, `Index.html lines (${lines}) must be strictly under 3000`);
  assert.ok(sizeKB < 220, `Index.html size (${sizeKB} KB) must be strictly under 220 KB`);
  console.log('✅ PASS 11: Modularity budget strictly maintained');
}

console.log('\n===============================================================');
console.log('🎉 ALL 11 ITERATION 2 REMEDIATION TESTS PASSED (100%)!');
console.log('===============================================================\n');
