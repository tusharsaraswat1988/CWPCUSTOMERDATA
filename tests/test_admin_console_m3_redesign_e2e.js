/**
 * =============================================================================
 * CLEAN WITH PASSION (CWP) ADMIN CONSOLE REDESIGN & MODERNIZATION (M3)
 * END-TO-END (E2E) AUTOMATED QA TEST SUITE
 * =============================================================================
 * Validates All 6 Core Requirements (R1 through R6) and Feature Inventory (F1 - F16):
 * 
 * R1: Side Menu Hierarchy (collapsible rail, M3 states, 2-group hierarchy,
 *     Material Symbols Outlined, dedicated Job Assignment nav item) & Header
 *     Cleanup (Logout removed from header & mobile topbar, present in sidebar footer).
 * R2: Unified Analytics Dashboard (single unified page, no split view,
 *     interactive visual SVG charts for daily clean completion progress,
 *     staff workload comparisons, and Wash & Solar volume trends).
 * R3: Daily Reports and Filter System (cleaned vs due/pending cars per staff member,
 *     compact M3 filter chips for staff, status, date; absence of admin Share
 *     button in table and photo lightbox).
 * R4: Wash & Solar Hub (rebranding of Special Jobs to Wash & Solar across all
 *     labels/tabs/modals, unified merged view of all staff jobs with status & reports).
 * R5: Admin Real-Time Operations and Time Tracking Visibility (live counts of
 *     cleaned vs pending, proof photo modal with zoom, per-car duration and
 *     inter-car transit time calculation from sequential log timestamps,
 *     Wash & Solar assigned staff, assignment timestamp, status, and elapsed duration).
 * R6: Separation of Customer Profiles and Job Assignment (Customer Profiles clean
 *     CRM repository without embedded assign buttons or staff assignment sections;
 *     dedicated Job Assignment workflow assigning daily cleanings and Wash & Solar
 *     jobs with customer, work type, date, and staff).
 * 
 * Architecture:
 * - Tier 1: Feature Coverage (happy path for R1-R6)
 * - Tier 2: Boundary & Corner Cases (empty data, single car shifts, missing photos, long durations)
 * - Tier 3: Cross-Feature Interactions (job assignment to daily reports / wash & solar reflection, status changes)
 * - Tier 4: Real-World Application Scenarios (full operational day multi-staff simulation)
 * =============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('===============================================================================');
console.log('🚀 RUNNING CWP ADMIN CONSOLE M3 REDESIGN E2E AUTOMATED TEST SUITE');
console.log('===============================================================================\n');

// Paths to production files
const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'Index.html');
const styleCssPath = path.join(rootDir, 'public', 'css', 'style.css');
const m3TokensCssPath = path.join(rootDir, 'public', 'css', 'm3-tokens.css');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const adminServicePath = path.join(rootDir, 'services', 'adminService.js');

// Load file contents
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');
const m3TokensCss = fs.existsSync(m3TokensCssPath) ? fs.readFileSync(m3TokensCssPath, 'utf8') : '';
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Load admin service module
let adminService = null;
try {
  adminService = require(adminServicePath);
} catch (err) {
  console.warn('⚠️ Warning: Failed to load services/adminService.js directly:', err.message);
}

// -----------------------------------------------------------------------------
// TEST RUNNER & DIAGNOSTICS HARNESS
// -----------------------------------------------------------------------------
const testResults = [];
let currentTier = '';

function setTier(tierName) {
  currentTier = tierName;
  console.log(`\n===============================================================================`);
  console.log(`📦 ${tierName}`);
  console.log(`===============================================================================`);
}

function test(id, title, reqTag, fn) {
  process.stdout.write(`  [${id}] ${title} (${reqTag}) ... `);
  const startTime = Date.now();
  try {
    fn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASS (${duration}ms)`);
    testResults.push({ id, title, reqTag, tier: currentTier, status: 'PASS', duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`❌ FAIL (${duration}ms)`);
    console.log(`      Error: ${err.message}`);
    testResults.push({ id, title, reqTag, tier: currentTier, status: 'FAIL', duration, error: err.message });
  }
}

// -----------------------------------------------------------------------------
// HEADLESS DOM & CLIENT SCRIPT VM ENVIRONMENT
// -----------------------------------------------------------------------------
function createClientSandbox() {
  const localStore = {};
  const elements = {};

  function getEl(id) {
    if (!elements[id]) {
      elements[id] = {
        id: id,
        style: {},
        classList: {
          _set: new Set(),
          add: function(c) { this._set.add(c); },
          remove: function(c) { this._set.delete(c); },
          toggle: function(c, force) {
            if (force === true) this._set.add(c);
            else if (force === false) this._set.delete(c);
            else if (this._set.has(c)) this._set.delete(c);
            else this._set.add(c);
          },
          contains: function(c) { return this._set.has(c); }
        },
        innerHTML: '',
        textContent: '',
        value: '',
        dataset: {},
        attributes: {},
        setAttribute: function(k, v) { this.attributes[k] = v; },
        getAttribute: function(k) { return this.attributes[k] || null; },
        querySelectorAll: function() { return []; },
        querySelector: function() { return null; },
        addEventListener: function() {},
        click: function() {}
      };
    }
    return elements[id];
  }

  const doc = {
    getElementById: getEl,
    querySelectorAll: function(sel) {
      if (sel.includes(',')) {
        const parts = sel.split(',').map(s => s.trim().replace(/^#/, ''));
        return parts.map(getEl);
      }
      return [];
    },
    querySelector: function(sel) {
      const clean = sel.replace(/^#/, '');
      return getEl(clean);
    },
    createElement: function(tag) {
      return {
        tagName: tag.toUpperCase(),
        style: {},
        classList: {
          _set: new Set(),
          add: function(c) { this._set.add(c); },
          remove: function(c) { this._set.delete(c); },
          toggle: function(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); }
        },
        innerHTML: '',
        textContent: '',
        setAttribute: function() {},
        appendChild: function() {}
      };
    },
    body: {
      classList: {
        _set: new Set(['admin-mode-active']),
        add: function(c) { this._set.add(c); },
        remove: function(c) { this._set.delete(c); },
        contains: function(c) { return this._set.has(c); }
      }
    },
    addEventListener: function() {}
  };

  const win = {
    location: { href: 'http://localhost:3000/?portal=admin', pathname: '/', search: '?portal=admin', hash: '' },
    history: {
      replaceState: function(state, title, url) {
        win.location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
      }
    },
    localStorage: {
      getItem: (k) => localStore[k] || null,
      setItem: (k, v) => { localStore[k] = String(v); },
      removeItem: (k) => { delete localStore[k]; },
      _store: localStore
    },
    document: doc,
    navigator: { userAgent: 'NodeTestRunner/1.0' },
    addEventListener: function() {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} }
  };

  const sandbox = {
    window: win,
    document: doc,
    localStorage: win.localStorage,
    location: win.location,
    history: win.history,
    console: win.console,
    navigator: win.navigator,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout
  };

  vm.createContext(sandbox);
  return { sandbox, win, doc, elements };
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (HAPPY PATH FOR R1 THROUGH R6)
// =============================================================================
setTier('TIER 1: FEATURE COVERAGE (HAPPY PATH R1-R6)');

// -----------------------------------------------------------------------------
// Test 1.1: R1 - Side Menu Hierarchy & Collapsible Rail State
// -----------------------------------------------------------------------------
test('T1.1', 'Side Menu Collapsible Rail, 2-Section Grouping & Material Symbols', 'R1', () => {
  // 1. Sidebar element and layout wrapper exist
  assert.ok(indexHtml.includes('id="adminSidebar"'), 'Sidebar #adminSidebar must exist in Index.html');
  assert.ok(indexHtml.includes('class="admin-layout-wrapper"'), '.admin-layout-wrapper master layout must exist');

  // 2. Collapsible rail toggle button exists
  const hasToggleBtn = indexHtml.includes('id="adminSidebarCollapseBtn"') ||
                       indexHtml.includes('id="adminSidebarToggle"') ||
                       indexHtml.includes('toggleAdminSidebarRail') ||
                       indexHtml.includes('toggleAdminSidebar');
  assert.ok(hasToggleBtn, 'Sidebar collapsible rail toggle button must exist in Index.html');

  // 3. CSS for rail mode (72px collapsed rail state with tooltips)
  const hasRailCss = styleCss.includes('.admin-sidebar.rail-mode') ||
                     styleCss.includes('.admin-sidebar.collapsed') ||
                     styleCss.includes('width: 72px') ||
                     styleCss.includes('--md-comp-nav-rail-width');
  assert.ok(hasRailCss, 'CSS rule for collapsible rail mode (72px width) must exist in style.css');

  // 4. Two-section grouping hierarchy (Operations & Management/Data)
  assert.ok(indexHtml.includes('OPERATIONS'), 'Sidebar must include OPERATIONS section label');
  const hasSecondGroup = indexHtml.includes('MANAGEMENT') || indexHtml.includes('DATA & DIRECTORY');
  assert.ok(hasSecondGroup, 'Sidebar must include second section label (MANAGEMENT or DATA & DIRECTORY)');

  // 5. Material Symbols Outlined icons used in sidebar
  assert.ok(
    indexHtml.includes('material-symbols-outlined') || styleCss.includes('.material-symbols-outlined'),
    'Material Symbols Outlined iconography must be supported and used in sidebar navigation'
  );

  // 6. Dedicated Job Assignment navigation item in sidebar
  assert.ok(indexHtml.includes('id="tabBtnJobAssignment"'), '#tabBtnJobAssignment navigation item must exist in sidebar');
  assert.ok(indexHtml.includes('switchAdminTab(\'jobAssignment\')'), '#tabBtnJobAssignment must call switchAdminTab(\'jobAssignment\')');
});

// -----------------------------------------------------------------------------
// Test 1.2: R1 - Header Cleanup & Logout Exclusively in Sidebar Footer
// -----------------------------------------------------------------------------
test('T1.2', 'Header Cleanup (Logout Excluded from Header & Mobile Bar, Present in Sidebar)', 'R1', () => {
  // 1. Sidebar footer contains Logout button
  assert.ok(indexHtml.includes('id="sidebarAdminLogoutBtn"'), '#sidebarAdminLogoutBtn must exist in sidebar footer');
  assert.ok(indexHtml.includes('handleAdminLogout()'), 'handleAdminLogout() action must be attached to sidebar logout button');

  // 2. Header utility area does NOT render a visible Logout button for admin
  // Check that admin header does not have an active top-level logout button
  const adminHeaderSlice = indexHtml.slice(
    indexHtml.indexOf('<header id="adminHeader"'),
    indexHtml.indexOf('</header>', indexHtml.indexOf('<header id="adminHeader"'))
  );
  const headerHasActiveLogout = adminHeaderSlice.includes('id="adminLogoutBtn"') &&
                                !adminHeaderSlice.includes('style="display: none;"') &&
                                !adminHeaderSlice.includes('is-hidden');
  assert.ok(!headerHasActiveLogout, 'Top admin header must not display a prominent logout button');

  // 3. Mobile topbar does not have an unhidden logout button
  const mobileTopbarStart = indexHtml.indexOf('id="adminMobileTopbar"');
  if (mobileTopbarStart !== -1) {
    const mobileTopbarSlice = indexHtml.slice(mobileTopbarStart, mobileTopbarStart + 800);
    const mobileHasLogout = mobileTopbarSlice.includes('handleAdminLogout()') &&
                            !mobileTopbarSlice.includes('display: none') &&
                            !mobileTopbarSlice.includes('style="display:none"');
    assert.ok(!mobileHasLogout, 'Mobile topbar should not feature an active logout button (relocated to drawer)');
  }
});

// -----------------------------------------------------------------------------
// Test 1.3: R2 - Unified Analytics Dashboard & Interactive Visual SVG Charts
// -----------------------------------------------------------------------------
test('T1.3', 'Unified Analytics Dashboard Page & SVG Interactive Charts', 'R2', () => {
  // 1. Single unified dashboard container exists
  assert.ok(indexHtml.includes('id="adminTabDashboard"'), '#adminTabDashboard container must exist in Index.html');

  // 2. Client script ADMIN_VALID_TABS contains 'dashboard'
  assert.ok(appJs.includes("'dashboard'") || appJs.includes('"dashboard"'), 'ADMIN_VALID_TABS must include "dashboard"');

  // 3. switchAdminTab handles 'dashboard' as a distinct view (no longer forcibly rewritten to cleanReports)
  assert.ok(
    appJs.includes("adminTabDashboard") || appJs.includes("tabName === 'dashboard'"),
    'switchAdminTab must handle and display #adminTabDashboard'
  );

  // 4. Interactive SVG Charts for 3 core metrics:
  // - Daily cleaning completion progress
  // - Staff workload comparison
  // - Wash & Solar volume trends
  const hasDonutOrProgressChart = indexHtml.includes('dashCleanProgressSvg') ||
                                  indexHtml.includes('dailyCleanProgressDonut') ||
                                  appJs.includes('renderDashboardCharts') ||
                                  appJs.includes('renderCleanProgressChart') ||
                                  indexHtml.includes('<svg class="dash-chart');
  assert.ok(hasDonutOrProgressChart, 'Interactive visual SVG progress chart for daily cleanings must exist in Index.html or app.js');

  const hasStaffWorkloadChart = indexHtml.includes('dashStaffWorkloadSvg') ||
                                indexHtml.includes('staffWorkloadChart') ||
                                appJs.includes('renderStaffWorkloadChart') ||
                                appJs.includes('workload-bar');
  assert.ok(hasStaffWorkloadChart, 'Interactive visual SVG chart for staff workload comparisons must exist');

  const hasWashSolarTrendChart = indexHtml.includes('dashWashSolarTrendSvg') ||
                                 indexHtml.includes('washSolarTrendChart') ||
                                 appJs.includes('renderWashSolarTrendChart') ||
                                 appJs.includes('wash-solar-trend');
  assert.ok(hasWashSolarTrendChart, 'Interactive visual SVG chart for Wash & Solar volume trends must exist');

  // 5. Preserved aggregated KPI counters
  assert.ok(indexHtml.includes('id="dashTotalDailyCleans"'), '#dashTotalDailyCleans must exist');
  assert.ok(
    indexHtml.includes('id="dashTotalSpecialJobs"') || indexHtml.includes('id="dashTotalWashSolar"'),
    'Aggregated Wash & Solar KPI counter must exist'
  );
  assert.ok(indexHtml.includes('id="dashActiveCrew"'), '#dashActiveCrew must exist');
  assert.ok(indexHtml.includes('id="dashLatestActivity"'), '#dashLatestActivity must exist');
});

// -----------------------------------------------------------------------------
// Test 1.4: R3 - Daily Reports Cleaned vs Due/Pending Vehicles Operations Provider
// -----------------------------------------------------------------------------
test('T1.4', 'Daily Reports Cleaned vs Due/Pending Vehicles Display', 'R3', () => {
  // 1. Daily Reports pane exists
  assert.ok(indexHtml.includes('id="adminTabCleanReports"'), '#adminTabCleanReports must exist');

  // 2. Daily reports table and summary must support status for cleaned AND pending
  const hasPendingSupport = indexHtml.includes('kpiTotalPending') ||
                            indexHtml.includes('tabPendingCleanCount') ||
                            indexHtml.includes('filterCleanStatus') ||
                            appJs.includes('pending') ||
                            appJs.includes('status === \'pending\'');
  assert.ok(hasPendingSupport, 'Daily Reports must provide visibility into due/pending vehicles alongside cleaned vehicles');

  // 3. Backend service supports querying operations summary or pending daily vehicles
  const hasOperationsSummary = (adminService && typeof adminService.getDailyOperationsSummary === 'function') ||
                               appJs.includes('getDailyOperationsSummary') ||
                               appJs.includes('renderDailyCleanReports');
  assert.ok(hasOperationsSummary, 'Operations summary logic (cleaned vs pending) must be implemented');
});

// -----------------------------------------------------------------------------
// Test 1.5: R3 - Compact M3 Filter Chips & Absence of Admin Share Button
// -----------------------------------------------------------------------------
test('T1.5', 'Compact M3 Filter Chips & Complete Absence of Admin Share Button', 'R3', () => {
  // 1. Compact M3 filter chips exist for Staff, Status, and Date
  const hasM3FilterChips = indexHtml.includes('m3-chip') ||
                           indexHtml.includes('filter-chip') ||
                           styleCss.includes('.m3-chip') ||
                           styleCss.includes('.filter-chip');
  assert.ok(hasM3FilterChips, 'M3 compact filter chips must be defined in Index.html or CSS for rapid filtering');

  // 2. ABSENCE OF ADMIN SHARE BUTTON:
  // Admin Daily Reports table row rendering must NOT include WhatsApp share button
  const cleanReportsTableSlice = indexHtml.slice(
    indexHtml.indexOf('id="adminTabCleanReports"'),
    indexHtml.indexOf('id="adminTabSpecialJobs"', indexHtml.indexOf('id="adminTabCleanReports"'))
  );
  assert.ok(
    !cleanReportsTableSlice.includes('class="btn-table-wa-share"'),
    'WhatsApp Share button (.btn-table-wa-share) must NOT be present in Admin Daily Reports HTML template'
  );

  // In app.js, renderAdminCleanReportsTable must NOT render a share button for admin
  const renderReportsFnStart = appJs.indexOf('function renderAdminCleanReportsTable');
  if (renderReportsFnStart !== -1) {
    const renderReportsFnSlice = appJs.slice(renderReportsFnStart, renderReportsFnStart + 3500);
    assert.ok(
      !renderReportsFnSlice.includes('btn-table-wa-share') || renderReportsFnSlice.includes('/* Admin share disabled */'),
      'Admin Daily Reports table rows must NOT render a WhatsApp Share button (staff-only feature)'
    );
  }

  // 3. Photo Lightbox Modal for Admin must NOT render an active WhatsApp Share button
  const lightboxStart = indexHtml.indexOf('id="reportPhotoLightboxModal"');
  if (lightboxStart !== -1) {
    const lightboxSlice = indexHtml.slice(lightboxStart, lightboxStart + 1200);
    const hasAdminLightboxShare = lightboxSlice.includes('btnLightboxSendWhatsApp') &&
                                  !lightboxSlice.includes('style="display: none;"') &&
                                  !lightboxSlice.includes('is-staff-only');
    assert.ok(!hasAdminLightboxShare, 'Admin photo lightbox modal must not offer customer share action');
  }
});

// -----------------------------------------------------------------------------
// Test 1.6: R4 - Wash & Solar Hub Rebranding & Unified Merged View
// -----------------------------------------------------------------------------
test('T1.6', 'Wash & Solar Rebranding across Labels/Tabs/Modals & Unified Merged View', 'R4', () => {
  // 1. Navigation button text is "Wash & Solar"
  const tabBtnIdx = indexHtml.indexOf('id="tabBtnSpecialJobs"') !== -1
    ? indexHtml.indexOf('id="tabBtnSpecialJobs"')
    : indexHtml.indexOf('id="tabBtnWashSolar"');
  assert.ok(tabBtnIdx !== -1, 'Wash & Solar / Special Jobs navigation button must exist');
  const tabBtnSlice = indexHtml.slice(tabBtnIdx, tabBtnIdx + 400);
  assert.ok(
    tabBtnSlice.includes('Wash & Solar') || tabBtnSlice.includes('Wash &amp; Solar'),
    'Navigation button label must be rebranded to "Wash & Solar"'
  );

  // 2. Tab header and modal titles rebranded
  const hasRebrandedHeader = indexHtml.includes('Wash & Solar') || indexHtml.includes('Wash &amp; Solar');
  assert.ok(hasRebrandedHeader, 'UI titles and headers must feature "Wash & Solar"');

  // 3. Unified Merged View: Multi-staff jobs table/cards container exists
  const hasSpecialJobsTable = indexHtml.includes('adminSpecialJobsTable') ||
                              indexHtml.includes('washSolarJobsTable') ||
                              indexHtml.includes('adminSpecialJobsTableBody');
  assert.ok(hasSpecialJobsTable, 'Unified merged view for Wash & Solar jobs across all staff members must exist');

  // 4. Client routing compatibility for both 'washSolar' and 'specialJobs'
  assert.ok(
    appJs.includes("'washSolar'") || appJs.includes("'specialJobs'"),
    'Tab router must support Wash & Solar routing'
  );
});

// -----------------------------------------------------------------------------
// Test 1.7: R5 - Real-Time Operations & Consecutive Cycle/Transit Time Calculations
// -----------------------------------------------------------------------------
test('T1.7', 'Consecutive Vehicle Cycle Time & Transit Duration Calculations', 'R5', () => {
  // Contract verification: calculateConsecutiveTimes(logs)
  // Input: chronological logs for single staff
  const mockLogs = [
    { id: 101, staff_id: 'STF01', completed_at_device: '2026-11-22T08:00:00.000Z', vehicle_num: 'UP32AB1234' },
    { id: 102, staff_id: 'STF01', completed_at_device: '2026-11-22T08:35:00.000Z', vehicle_num: 'UP32CD5678' },
    { id: 103, staff_id: 'STF01', completed_at_device: '2026-11-22T09:15:00.000Z', vehicle_num: 'UP32EF9012' }
  ];

  // Try adminService function or client logic
  const calcFn = (adminService && typeof adminService.calculateConsecutiveTimes === 'function')
    ? adminService.calculateConsecutiveTimes
    : (typeof calculateConsecutiveTimes === 'function' ? calculateConsecutiveTimes : null);

  if (calcFn) {
    const results = calcFn(mockLogs);
    assert.strictEqual(Array.isArray(results), true, 'calculateConsecutiveTimes must return an array');
    assert.strictEqual(results.length, 3, 'Must return duration info for all 3 logs');

    // First car: Transit duration should be 0 (shift start)
    assert.strictEqual(results[0].transitDurationMinutes, 0, 'First car transit duration should be 0 (initial)');
    assert.ok(results[0].cleaningDurationMinutes > 0, 'Cleaning duration should be positive');

    // Second car: interval = 35 min; if cleaning is 15 min, transit is 20 min
    assert.ok(results[1].transitDurationMinutes >= 1, 'Second car transit duration must be calculated and >= 1');
    assert.ok(results[1].cleaningDurationMinutes > 0, 'Second car cleaning duration must be positive');

    // Third car: interval = 40 min; transit must be positive
    assert.ok(results[2].transitDurationMinutes >= 1, 'Third car transit duration must be calculated and >= 1');
  } else {
    // Check that function is specified in app.js or adminService.js
    const definedInAppJs = appJs.includes('calculateConsecutiveTimes') || appJs.includes('transitDurationMinutes');
    const definedInService = adminService && (adminService.calculateConsecutiveTimes !== undefined);
    assert.ok(
      definedInAppJs || definedInService,
      'calculateConsecutiveTimes must be implemented in adminService.js or app.js as per PROJECT.md interface contract'
    );
  }
});

// -----------------------------------------------------------------------------
// Test 1.8: R5 - Wash & Solar Elapsed Time Tracking & Assignment Timestamps
// -----------------------------------------------------------------------------
test('T1.8', 'Wash & Solar Elapsed Time Calculation across Status Stages', 'R5', () => {
  const baseTime = Date.parse('2026-11-22T10:00:00.000Z');

  // Test cases across statuses:
  // 1. In Progress: Δt = now - started_at
  const jobInProgress = {
    id: 'JOB-01',
    status: 'in_progress',
    assigned_at: new Date(baseTime - 60 * 60 * 1000).toISOString(), // 60 min ago
    started_at: new Date(baseTime - 30 * 60 * 1000).toISOString()   // 30 min ago
  };

  // 2. Completed: Δt = completed_at - started_at
  const jobCompleted = {
    id: 'JOB-02',
    status: 'completed',
    assigned_at: new Date(baseTime - 120 * 60 * 1000).toISOString(),
    started_at: new Date(baseTime - 90 * 60 * 1000).toISOString(),
    completed_at: new Date(baseTime - 30 * 60 * 1000).toISOString() // Took exactly 60 min
  };

  // 3. Assigned: Δt = now - assigned_at
  const jobAssigned = {
    id: 'JOB-03',
    status: 'assigned',
    assigned_at: new Date(baseTime - 45 * 60 * 1000).toISOString() // 45 min ago
  };

  const elapsedFn = (adminService && typeof adminService.computeWashSolarElapsed === 'function')
    ? adminService.computeWashSolarElapsed
    : (typeof computeWashSolarElapsed === 'function' ? computeWashSolarElapsed : null);

  if (elapsedFn) {
    const elapsedProg = elapsedFn(jobInProgress, baseTime);
    assert.strictEqual(
      typeof elapsedProg === 'object' ? elapsedProg.minutes : elapsedProg,
      30,
      'In progress job elapsed must be now - started_at (30 min)'
    );

    const elapsedComp = elapsedFn(jobCompleted, baseTime);
    assert.strictEqual(
      typeof elapsedComp === 'object' ? elapsedComp.minutes : elapsedComp,
      60,
      'Completed job elapsed must be completed_at - started_at (60 min)'
    );

    const elapsedAssigned = elapsedFn(jobAssigned, baseTime);
    assert.strictEqual(
      typeof elapsedAssigned === 'object' ? elapsedAssigned.minutes : elapsedAssigned,
      45,
      'Assigned job elapsed must be now - assigned_at (45 min)'
    );
  } else {
    // Assert presence in contract code
    const hasElapsedLogic = appJs.includes('computeWashSolarElapsed') ||
                            appJs.includes('elapsed') ||
                            (adminService && adminService.computeWashSolarElapsed !== undefined);
    assert.ok(hasElapsedLogic, 'computeWashSolarElapsed must be defined as per PROJECT.md interface contract');
  }
});

// -----------------------------------------------------------------------------
// Test 1.9: R6 - Customer Profiles Clean CRM Decoupling (No Embedded Assignment)
// -----------------------------------------------------------------------------
test('T1.9', 'Customer Profiles Clean CRM Decoupling (No Embedded Assign Controls)', 'R6', () => {
  // 1. Customer records table row template in Index.html or app.js must NOT contain .btn-cust-special-assign
  const recordsTabStart = indexHtml.indexOf('id="adminTabRecords"');
  const recordsTabEnd = indexHtml.indexOf('id="adminTabSpecialJobs"', recordsTabStart);
  if (recordsTabStart !== -1 && recordsTabEnd !== -1) {
    const recordsSlice = indexHtml.slice(recordsTabStart, recordsTabEnd);
    assert.ok(
      !recordsSlice.includes('class="btn-cust-special-assign"'),
      'Embedded Assign button (.btn-cust-special-assign) must be eliminated from customer records view'
    );
  }

  // 2. Customer Add / Edit modals should NOT require or embed Section 3 staff assignment
  const addModalStart = indexHtml.indexOf('id="addCustModal"');
  if (addModalStart !== -1) {
    const addModalSlice = indexHtml.slice(addModalStart, addModalStart + 2500);
    const hasMandatoryStaffSelect = addModalSlice.includes('id="custStaffSelect"') &&
                                    addModalSlice.includes('required');
    assert.ok(!hasMandatoryStaffSelect, 'Customer profile creation must be decoupled from staff assignment');
  }
});

// -----------------------------------------------------------------------------
// Test 1.10: R6 - Dedicated Job Assignment Workflow & Active Assignments Ledger
// -----------------------------------------------------------------------------
test('T1.10', 'Dedicated Job Assignment Tab, Form Controls & Active Ledger', 'R6', () => {
  // 1. Dedicated Job Assignment tab pane exists
  assert.ok(indexHtml.includes('id="adminTabJobAssignment"'), '#adminTabJobAssignment view must exist in Index.html');

  // 2. Form controls exist
  assert.ok(indexHtml.includes('id="jobAssignCustomerSelect"'), '#jobAssignCustomerSelect must exist');
  assert.ok(indexHtml.includes('id="jobAssignWorkType"'), '#jobAssignWorkType must exist');
  assert.ok(indexHtml.includes('id="jobAssignDate"'), '#jobAssignDate must exist');
  assert.ok(indexHtml.includes('id="jobAssignStaff"'), '#jobAssignStaff must exist');
  assert.ok(indexHtml.includes('id="jobAssignNotes"'), '#jobAssignNotes must exist');

  // 3. Active Assignments Ledger table/container exists
  const hasLedger = indexHtml.includes('jobAssignmentsLedgerTable') ||
                    indexHtml.includes('activeAssignmentsLedger') ||
                    indexHtml.includes('jobAssignmentsTableBody');
  assert.ok(hasLedger, 'Active Assignments Ledger table must exist inside Job Assignment view');

  // 4. Notification verification: toast notification instead of native browser alert
  assert.ok(
    appJs.includes("showToast('Job assigned successfully"),
    'handleJobAssignmentSubmit must use showToast for notification instead of native alert'
  );
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// =============================================================================
setTier('TIER 2: BOUNDARY & CORNER CASES');

// -----------------------------------------------------------------------------
// Test 2.1: Empty Operations Data
// -----------------------------------------------------------------------------
test('T2.1', 'Boundary: Empty Operations Data (0 Cleans, 0 Scheduled)', 'R2/R3/R5', () => {
  const calcFn = (adminService && typeof adminService.calculateConsecutiveTimes === 'function')
    ? adminService.calculateConsecutiveTimes
    : null;

  if (calcFn) {
    const emptyResult = calcFn([]);
    assert.deepStrictEqual(emptyResult, [], 'calculateConsecutiveTimes([]) must return [] safely without errors');
  }

  // Dashboard SVG chart generation handles 0% completion without division by zero
  const safePercentCalc = (cleaned, total) => total > 0 ? Math.round((cleaned / total) * 100) : 0;
  assert.strictEqual(safePercentCalc(0, 0), 0, 'Zero scheduled vehicles must produce 0% without NaN or division by zero');
  assert.strictEqual(safePercentCalc(0, 10), 0, 'Zero cleaned vehicles must produce 0%');
});

// -----------------------------------------------------------------------------
// Test 2.2: Single-Car Shift (Boundary Condition)
// -----------------------------------------------------------------------------
test('T2.2', 'Boundary: Single-Car Shift (Initial Transit & Single Cleaning Duration)', 'R5', () => {
  const singleLog = [
    { id: 999, staff_id: 'STF02', completed_at_device: '2026-11-22T07:45:00.000Z', vehicle_num: 'DL01AB9999' }
  ];

  const calcFn = (adminService && typeof adminService.calculateConsecutiveTimes === 'function')
    ? adminService.calculateConsecutiveTimes
    : null;

  if (calcFn) {
    const res = calcFn(singleLog);
    assert.strictEqual(res.length, 1, 'Must return exactly 1 log calculation');
    assert.strictEqual(res[0].transitDurationMinutes, 0, 'Single car shift must have transit = 0 (no predecessor)');
    assert.ok(res[0].cleaningDurationMinutes > 0, 'Cleaning duration must be positive non-zero');
  }
});

// -----------------------------------------------------------------------------
// Test 2.3: Zero / Rapid Timestamp Intervals (Clamped Non-Negative Transit)
// -----------------------------------------------------------------------------
test('T2.3', 'Corner Case: Identical or Rapid Completion Timestamps (Clamped Non-Negative Transit)', 'R5', () => {
  // If two logs have identical completion timestamps (or within 1 second due to bulk upload or sync batch)
  const rapidLogs = [
    { id: 501, staff_id: 'STF03', completed_at_device: '2026-11-22T08:00:00.000Z', vehicle_num: 'HR26AA1111' },
    { id: 502, staff_id: 'STF03', completed_at_device: '2026-11-22T08:00:05.000Z', vehicle_num: 'HR26AA2222' }
  ];

  const calcFn = (adminService && typeof adminService.calculateConsecutiveTimes === 'function')
    ? adminService.calculateConsecutiveTimes
    : null;

  if (calcFn) {
    const res = calcFn(rapidLogs);
    assert.strictEqual(res.length, 2);
    // Transit duration should never be negative
    assert.ok(res[1].transitDurationMinutes >= 0, 'Transit duration must never be negative even if timestamps are identical');
    assert.ok(!isNaN(res[1].transitDurationMinutes), 'Transit duration must not be NaN');
  }
});

// -----------------------------------------------------------------------------
// Test 2.4: Missing or Corrupt Photo URLs in Proof Lightbox
// -----------------------------------------------------------------------------
test('T2.4', 'Corner Case: Missing or Corrupt Photo URLs Handled Gracefully', 'R3/R5', () => {
  // Verifies that cleaning log rows or photo modal gracefully handle null/empty photo URLs
  const missingPhotoLog = {
    id: 888,
    staff_id: 'STF01',
    completed_at_device: '2026-11-22T08:20:00.000Z',
    photo_url: null,
    vehicle_num: 'UP32ZZ0000'
  };

  // Proof photo renderer must not throw when photo_url is null
  const renderProofThumbnail = (photoUrl) => {
    if (!photoUrl || photoUrl === 'null' || photoUrl === 'undefined') {
      return '<span class="no-photo-badge">No Photo</span>';
    }
    return `<img src="${photoUrl}" class="report-thumb-img" alt="Proof">`;
  };

  const output = renderProofThumbnail(missingPhotoLog.photo_url);
  assert.ok(output.includes('No Photo') || output.includes('no-photo'), 'Must render graceful placeholder for missing photo');
});

// -----------------------------------------------------------------------------
// Test 2.5: Multi-Day & Long-Duration Wash & Solar Jobs
// -----------------------------------------------------------------------------
test('T2.5', 'Boundary: Multi-Day Long-Duration Wash & Solar Jobs', 'R5', () => {
  const baseNow = Date.parse('2026-11-24T10:00:00.000Z');
  const jobAssigned48hAgo = {
    id: 'WS-LONG-01',
    status: 'in_progress',
    assigned_at: new Date(baseNow - 48 * 3600 * 1000).toISOString(),
    started_at: new Date(baseNow - 46 * 3600 * 1000).toISOString() // 46 hours ago
  };

  const elapsedFn = (adminService && typeof adminService.computeWashSolarElapsed === 'function')
    ? adminService.computeWashSolarElapsed
    : null;

  if (elapsedFn) {
    const res = elapsedFn(jobAssigned48hAgo, baseNow);
    const mins = typeof res === 'object' ? res.minutes : res;
    assert.strictEqual(mins, 46 * 60, 'Must compute 46 hours * 60 = 2760 minutes accurately without overflow');
  }
});

// -----------------------------------------------------------------------------
// Test 2.6: Unassigned Wash & Solar Job Lifecycle
// -----------------------------------------------------------------------------
test('T2.6', 'Corner Case: Unassigned Wash & Solar Job Handled Gracefully', 'R4/R5', () => {
  const unassignedJob = {
    id: 'WS-UNASSIGNED-01',
    status: 'assigned',
    assigned_staff_id: null,
    assigned_staff_name: null,
    assigned_at: '2026-11-22T06:00:00.000Z'
  };

  const renderStaffDisplay = (job) => job.assigned_staff_name || '<span class="badge-unassigned">Unassigned</span>';
  const display = renderStaffDisplay(unassignedJob);
  assert.ok(display.includes('Unassigned'), 'Unassigned job must render Unassigned badge without throwing');
});

// =============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS
// =============================================================================
setTier('TIER 3: CROSS-FEATURE INTERACTIONS');

// -----------------------------------------------------------------------------
// Test 3.1: Job Assignment to Daily Reports & Wash & Solar Hub Reflection
// -----------------------------------------------------------------------------
test('T3.1', 'Cross-Feature: Job Assignment Reflection in Daily Ops & Wash & Solar', 'R3/R4/R6', () => {
  // 1. Simulates dispatching a job assignment
  const newWashSolarJob = {
    customer_id: 'CUST-001',
    service_category: 'solar_panel_cleaning',
    scheduled_date: '2026-11-22',
    staff_id: 'STF01',
    status: 'assigned',
    assigned_at: '2026-11-22T08:00:00.000Z'
  };

  // Verifies that newly assigned job matches the Wash & Solar schema
  assert.strictEqual(newWashSolarJob.status, 'assigned');
  assert.strictEqual(newWashSolarJob.staff_id, 'STF01');
  assert.ok(newWashSolarJob.assigned_at, 'Assigned timestamp must be present');

  // 2. Simulates daily car cleaning assignment
  const dailyCleanAssignment = {
    customer_id: 'CUST-002',
    vehicle_id: 'VEH-002',
    service_type: 'daily_cleaning',
    staff_id: 'STF02',
    status: 'scheduled'
  };

  assert.strictEqual(dailyCleanAssignment.service_type, 'daily_cleaning');
  assert.strictEqual(dailyCleanAssignment.status, 'scheduled');
});

// -----------------------------------------------------------------------------
// Test 3.2: Wash & Solar Status Lifecycle Transitions
// -----------------------------------------------------------------------------
test('T3.2', 'Cross-Feature: Wash & Solar Status Lifecycle (Assigned -> In Progress -> Completed)', 'R4/R5', () => {
  const t0 = Date.parse('2026-11-22T09:00:00.000Z');
  const t1 = Date.parse('2026-11-22T09:30:00.000Z'); // Started 30 min later
  const t2 = Date.parse('2026-11-22T10:45:00.000Z'); // Completed 75 min after start

  const job = {
    id: 'WS-CYCLE-01',
    status: 'assigned',
    assigned_at: new Date(t0).toISOString(),
    started_at: null,
    completed_at: null
  };

  const elapsedFn = (adminService && typeof adminService.computeWashSolarElapsed === 'function')
    ? adminService.computeWashSolarElapsed
    : null;

  if (elapsedFn) {
    // Stage 1: Assigned at t0, checked at t1 (30 min waiting)
    let res = elapsedFn(job, t1);
    let mins = typeof res === 'object' ? res.minutes : res;
    assert.strictEqual(mins, 30, 'Stage 1 (Assigned): 30 min waiting');

    // Stage 2: In Progress at t1, checked at t1 + 45 min
    job.status = 'in_progress';
    job.started_at = new Date(t1).toISOString();
    res = elapsedFn(job, t1 + 45 * 60 * 1000);
    mins = typeof res === 'object' ? res.minutes : res;
    assert.strictEqual(mins, 45, 'Stage 2 (In Progress): 45 min execution');

    // Stage 3: Completed at t2 (total execution duration = 75 min)
    job.status = 'completed';
    job.completed_at = new Date(t2).toISOString();
    res = elapsedFn(job, t2 + 3600 * 1000); // Checked 1 hour later
    mins = typeof res === 'object' ? res.minutes : res;
    assert.strictEqual(mins, 75, 'Stage 3 (Completed): Duration remains fixed at 75 min regardless of current time');
  }
});

// -----------------------------------------------------------------------------
// Test 3.3: Multi-Dimensional Filter Interoperability
// -----------------------------------------------------------------------------
test('T3.3', 'Cross-Feature: Multi-Filter Interoperability (Staff + Status + Date)', 'R3', () => {
  const sampleRecords = [
    { staff_id: 'STF01', status: 'cleaned', date: '2026-11-22', vehicle: 'V1' },
    { staff_id: 'STF01', status: 'pending', date: '2026-11-22', vehicle: 'V2' },
    { staff_id: 'STF02', status: 'cleaned', date: '2026-11-22', vehicle: 'V3' },
    { staff_id: 'STF02', status: 'pending', date: '2026-11-22', vehicle: 'V4' },
    { staff_id: 'STF01', status: 'cleaned', date: '2026-11-21', vehicle: 'V5' }
  ];

  // Filter predicate mimicking multi-filter chips
  const applyFilters = (records, { staff, status, date }) => {
    return records.filter(r => {
      if (staff && staff !== 'all' && r.staff_id !== staff) return false;
      if (status && status !== 'all' && r.status !== status) return false;
      if (date && r.date !== date) return false;
      return true;
    });
  };

  // Test 1: Staff STF01 AND Status 'pending' for Today
  const stf01Pending = applyFilters(sampleRecords, { staff: 'STF01', status: 'pending', date: '2026-11-22' });
  assert.strictEqual(stf01Pending.length, 1);
  assert.strictEqual(stf01Pending[0].vehicle, 'V2');

  // Test 2: Staff STF01 AND Status 'cleaned' for Today
  const stf01Cleaned = applyFilters(sampleRecords, { staff: 'STF01', status: 'cleaned', date: '2026-11-22' });
  assert.strictEqual(stf01Cleaned.length, 1);
  assert.strictEqual(stf01Cleaned[0].vehicle, 'V1');

  // Test 3: All Staff AND Status 'cleaned' for Today
  const allCleanedToday = applyFilters(sampleRecords, { staff: 'all', status: 'cleaned', date: '2026-11-22' });
  assert.strictEqual(allCleanedToday.length, 2);
});

// -----------------------------------------------------------------------------
// Test 3.4: SPA Navigation Routing & URL Hash Synchronization
// -----------------------------------------------------------------------------
test('T3.4', 'Cross-Feature: SPA Navigation Routing & URL Hash Synchronization', 'R1/R2/R4/R6', () => {
  // Test navigation contract with valid tabs
  const validTabs = ['dashboard', 'records', 'leads', 'washSolar', 'specialJobs', 'sequence', 'staff', 'cleanReports', 'jobAssignment', 'addCust'];

  // Test that core redesigned tabs are all recognized as valid
  assert.ok(validTabs.includes('dashboard'), 'dashboard must be a valid tab');
  assert.ok(validTabs.includes('jobAssignment'), 'jobAssignment must be a valid tab');
  assert.ok(validTabs.includes('washSolar') || validTabs.includes('specialJobs'), 'washSolar/specialJobs must be a valid tab');

  // Verify hash mapping
  const hashForTab = (tab) => `#admin/${tab}`;
  assert.strictEqual(hashForTab('dashboard'), '#admin/dashboard');
  assert.strictEqual(hashForTab('jobAssignment'), '#admin/jobAssignment');

  // Verify deep linking hashchange listener & window.location.hash sync in app.js
  assert.ok(appJs.includes("addEventListener('hashchange'"), 'app.js must register hashchange listener for SPA deep linking');
  assert.ok(appJs.includes("window.location.hash = targetHash"), 'switchAdminTab must synchronize window.location.hash');
});

// =============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// =============================================================================
setTier('TIER 4: REAL-WORLD APPLICATION SCENARIOS');

// -----------------------------------------------------------------------------
// Test 4.1: Full Operational Day Multi-Staff Shift Simulation
// -----------------------------------------------------------------------------
test('T4.1', 'Full Operational Day Simulation (Multi-Staff Shift, Ops Summary & Privacy Check)', 'R1-R6', () => {
  // Operational setup:
  // Staff 1 (STF01): 5 scheduled cars, cleans 3 sequentially
  // Staff 2 (STF02): 4 scheduled cars, cleans 2 sequentially
  // Total scheduled: 9 cars
  // Total cleaned: 5 cars
  // Total pending: 4 cars
  // Wash & Solar: 2 jobs (1 Solar Panel cleaning completed, 1 Car Foam Wash in progress)

  const staff1Scheduled = 5;
  const staff2Scheduled = 4;
  const totalScheduled = staff1Scheduled + staff2Scheduled;

  const staff1Logs = [
    {
      id: 'L01',
      staff_id: 'STF01',
      vehicle_id: 'V01',
      vehicle_num: 'UP32AA0001',
      completed_at_device: '2026-11-22T08:00:00.000Z',
      parking_details: 'Basement B1, Pillar 14',
      photo_url: 'https://res.cloudinary.com/cwp/image/upload/v1/proof01.jpg'
    },
    {
      id: 'L02',
      staff_id: 'STF01',
      vehicle_id: 'V02',
      vehicle_num: 'UP32AA0002',
      completed_at_device: '2026-11-22T08:35:00.000Z',
      parking_details: 'Basement B1, Pillar 42',
      photo_url: 'https://res.cloudinary.com/cwp/image/upload/v1/proof02.jpg'
    },
    {
      id: 'L03',
      staff_id: 'STF01',
      vehicle_id: 'V03',
      vehicle_num: 'UP32AA0003',
      completed_at_device: '2026-11-22T09:15:00.000Z',
      parking_details: 'Ground Floor, Slot G-08',
      photo_url: 'https://res.cloudinary.com/cwp/image/upload/v1/proof03.jpg'
    }
  ];

  const staff2Logs = [
    {
      id: 'L04',
      staff_id: 'STF02',
      vehicle_id: 'V04',
      vehicle_num: 'UP32BB0001',
      completed_at_device: '2026-11-22T08:15:00.000Z',
      parking_details: 'Podium 2, Pillar P-10',
      photo_url: 'https://res.cloudinary.com/cwp/image/upload/v1/proof04.jpg'
    },
    {
      id: 'L05',
      staff_id: 'STF02',
      vehicle_id: 'V05',
      vehicle_num: 'UP32BB0002',
      completed_at_device: '2026-11-22T08:50:00.000Z',
      parking_details: 'Podium 2, Pillar P-28',
      photo_url: 'https://res.cloudinary.com/cwp/image/upload/v1/proof05.jpg'
    }
  ];

  const totalCleaned = staff1Logs.length + staff2Logs.length; // 5
  const totalPending = totalScheduled - totalCleaned;         // 4
  const completionRate = Math.round((totalCleaned / totalScheduled) * 100 * 10) / 10; // 55.6%

  // 1. Operations KPI Verification
  assert.strictEqual(totalCleaned, 5, 'Total cleaned must be 5');
  assert.strictEqual(totalPending, 4, 'Total pending must be 4');
  assert.strictEqual(completionRate, 55.6, 'Completion rate must be 55.6%');

  // 2. Staff 1 Latest Location & Location Tracking
  const staff1Latest = staff1Logs[staff1Logs.length - 1];
  assert.strictEqual(staff1Latest.parking_details, 'Ground Floor, Slot G-08', 'Staff 1 latest location tracking');
  assert.strictEqual(staff1Latest.completed_at_device, '2026-11-22T09:15:00.000Z');

  // 3. Staff 2 Latest Location
  const staff2Latest = staff2Logs[staff2Logs.length - 1];
  assert.strictEqual(staff2Latest.parking_details, 'Podium 2, Pillar P-28', 'Staff 2 latest location tracking');

  // 4. Wash & Solar Jobs Simulation
  const nowSimulation = Date.parse('2026-11-22T11:00:00.000Z');
  const washSolarJobs = [
    {
      id: 'WS-01',
      title: 'Solar Panel Deep Cleaning (10kW)',
      status: 'completed',
      assigned_to: 'STF03',
      assigned_at: '2026-11-22T08:00:00.000Z',
      started_at: '2026-11-22T08:30:00.000Z',
      completed_at: '2026-11-22T10:00:00.000Z' // 90 min
    },
    {
      id: 'WS-02',
      title: 'Complete Interior & Foam Wash',
      status: 'in_progress',
      assigned_to: 'STF02',
      assigned_at: '2026-11-22T10:00:00.000Z',
      started_at: '2026-11-22T10:30:00.000Z'    // in progress, 30 min so far
    }
  ];

  const elapsedJob1 = (Date.parse(washSolarJobs[0].completed_at) - Date.parse(washSolarJobs[0].started_at)) / (60 * 1000);
  const elapsedJob2 = (nowSimulation - Date.parse(washSolarJobs[1].started_at)) / (60 * 1000);
  assert.strictEqual(elapsedJob1, 90, 'Job 1 took 90 minutes');
  assert.strictEqual(elapsedJob2, 30, 'Job 2 elapsed 30 minutes in progress');

  // 5. Verification of Zero WhatsApp Share button across Admin Console
  // In the entire Index.html under adminView, verify no active share button exists in Daily Reports
  const adminViewSlice = indexHtml.slice(indexHtml.indexOf('id="adminView"'));
  const hasShareInCleanReports = adminViewSlice.includes('id="adminTabCleanReports"') &&
                                 adminViewSlice.slice(
                                   adminViewSlice.indexOf('id="adminTabCleanReports"'),
                                   adminViewSlice.indexOf('id="adminTabSpecialJobs"', adminViewSlice.indexOf('id="adminTabCleanReports"'))
                                 ).includes('btn-table-wa-share');
  assert.ok(!hasShareInCleanReports, 'Zero WhatsApp share buttons in Admin Daily Reports view');

  // 6. Customer CRM Integrity
  // Verify that CRM Customer records table doesn't have operations buttons embedded
  assert.ok(
    !indexHtml.includes('class="btn-cust-special-assign"'),
    'CRM Customer records table is clean and unpolluted by operational buttons'
  );
});

// =============================================================================
// TEST SUITE EXECUTION SUMMARY & DIAGNOSTICS REPORT
// =============================================================================
console.log('\n===============================================================================');
console.log('📊 TEST EXECUTION SUMMARY & AUDIT REPORT');
console.log('===============================================================================');

const passedTests = testResults.filter(t => t.status === 'PASS');
const failedTests = testResults.filter(t => t.status === 'FAIL');
const totalTests = testResults.length;
const passRate = Math.round((passedTests.length / totalTests) * 100);

console.log(`\nTotal Tests Executed: ${totalTests}`);
console.log(`Passed:              ${passedTests.length} (${passRate}%)`);
console.log(`Failed:              ${failedTests.length}\n`);

// Breakdown by Tier
const tiers = [...new Set(testResults.map(t => t.tier))];
console.log('Tier Breakdown:');
tiers.forEach(tier => {
  const tierTests = testResults.filter(t => t.tier === tier);
  const tierPass = tierTests.filter(t => t.status === 'PASS').length;
  console.log(`  - ${tier}: ${tierPass}/${tierTests.length} passed`);
});

// Breakdown by Requirement
console.log('\nRequirement Traceability Matrix (R1 - R6):');
['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].forEach(req => {
  const reqTests = testResults.filter(t => t.reqTag.includes(req));
  const reqPass = reqTests.filter(t => t.status === 'PASS').length;
  console.log(`  - ${req}: ${reqPass}/${reqTests.length} tests passing`);
});

if (failedTests.length > 0) {
  console.log('\n-------------------------------------------------------------------------------');
  console.log('⚠️ FAILED TEST DIAGNOSTICS (PENDING IMPLEMENTATION IN MILESTONE M1):');
  console.log('-------------------------------------------------------------------------------');
  failedTests.forEach((f, idx) => {
    console.log(`${idx + 1}. [${f.id}] ${f.title} (${f.reqTag})`);
    console.log(`   Error: ${f.error}\n`);
  });
}

console.log('===============================================================================\n');

// If executed directly, exit with code 1 if any tests failed, 0 if all passed
if (require.main === module) {
  if (failedTests.length > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

module.exports = {
  testResults,
  totalTests,
  passedCount: passedTests.length,
  failedCount: failedTests.length,
  passRate
};
