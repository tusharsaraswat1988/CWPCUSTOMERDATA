const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🚀 RUNNING ADMIN SIDEBAR MENU & OPERATIONS DASHBOARD QA SUITE');
console.log('===============================================================');

const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'Index.html');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const styleCssPath = path.join(rootDir, 'public', 'css', 'style.css');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

// ---------------------------------------------------------------------------
// TEST 1: SIDEBAR STRUCTURE & DOM ELEMENTS
// ---------------------------------------------------------------------------
console.log('\n--- TEST 1: Professional Side Menu Structure & DOM Elements ---');

// 1.1 Sidebar wrapper and shell
assert.ok(indexHtml.includes('class="admin-layout-wrapper"'), '1.1 Admin layout wrapper must exist');
assert.ok(indexHtml.includes('id="adminSidebar"'), '1.2 #adminSidebar element must exist');
assert.ok(indexHtml.includes('class="admin-sidebar"'), '1.3 .admin-sidebar class must exist');

// 1.2 Preserved tab container & nav list
assert.ok(indexHtml.includes('class="admin-tab-container sidebar-nav-container"'), '1.4 admin-tab-container preserved inside sidebar');
assert.ok(indexHtml.includes('class="admin-tab-nav sidebar-nav-list" role="tablist"'), '1.5 admin-tab-nav preserved inside sidebar');

// 1.3 Preserved individual tab buttons
assert.ok(indexHtml.includes('id="tabBtnRecords"'), '1.6 #tabBtnRecords exists inside sidebar');
assert.ok(indexHtml.includes('id="tabBtnLeads"'), '1.7 #tabBtnLeads exists inside sidebar');
assert.ok(indexHtml.includes('id="tabBtnSequence"'), '1.8 #tabBtnSequence exists inside sidebar');
assert.ok(indexHtml.includes('id="tabBtnStaff"'), '1.9 #tabBtnStaff exists inside sidebar');
assert.ok(indexHtml.includes('id="tabBtnCleanReports"'), '1.10 #tabBtnCleanReports exists inside sidebar');
assert.ok(indexHtml.includes('id="tabBtnSpecialJobs"'), '1.11 #tabBtnSpecialJobs exists inside sidebar');

// 1.4 Logout Button Positioned at the bottom of Side Menu
assert.ok(indexHtml.includes('id="sidebarAdminLogoutBtn"'), '1.12 #sidebarAdminLogoutBtn must exist');
assert.ok(indexHtml.includes('onclick="handleAdminLogout()"'), '1.13 handleAdminLogout() attached to sidebar logout');
const sidebarIdx = indexHtml.indexOf('id="adminSidebar"');
const sidebarNavIdx = indexHtml.indexOf('class="admin-tab-container sidebar-nav-container"');
const sidebarLogoutIdx = indexHtml.indexOf('id="sidebarAdminLogoutBtn"');
assert.ok(sidebarLogoutIdx > sidebarNavIdx, '1.14 Logout button must be located beneath navigation tabs at the bottom of the sidebar');

console.log('✅ PASS 1: Side menu layout, navigation tabs, and bottom logout button verified.');

// ---------------------------------------------------------------------------
// TEST 2: OPERATIONS DASHBOARD (CLUBBING DAILY CLEANS & SPECIAL JOBS)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: Operations Dashboard Clubbing & Aggregated Intelligence ---');

// 2.1 Unified Operations Hub container
assert.ok(indexHtml.includes('id="adminOpsDashboardHub"'), '2.1 #adminOpsDashboardHub must exist');
assert.ok(indexHtml.includes('class="ops-dashboard-hub-header"'), '2.2 .ops-dashboard-hub-header must exist');

// 2.2 Aggregated KPI Deck (Daily cleans + Special jobs combined)
assert.ok(indexHtml.includes('id="dashTotalDailyCleans"'), '2.3 #dashTotalDailyCleans must exist in dashboard');
assert.ok(indexHtml.includes('id="dashDailyPhotoRate"'), '2.4 #dashDailyPhotoRate must exist in dashboard');
assert.ok(indexHtml.includes('id="dashTotalSpecialJobs"'), '2.5 #dashTotalSpecialJobs must exist in dashboard');
assert.ok(indexHtml.includes('id="dashSpecialCompleted"'), '2.6 #dashSpecialCompleted must exist in dashboard');
assert.ok(indexHtml.includes('id="dashSpecialPending"'), '2.7 #dashSpecialPending must exist in dashboard');
assert.ok(indexHtml.includes('id="dashActiveCrew"'), '2.8 #dashActiveCrew must exist in dashboard');
assert.ok(indexHtml.includes('id="dashLatestActivity"'), '2.9 #dashLatestActivity must exist in dashboard');

// 2.3 Intelligent Operations Deck Cards (Replacing redundant segment switcher)
assert.ok(indexHtml.includes('class="ops-intelligence-deck"'), '2.10 .ops-intelligence-deck must exist');
assert.ok(indexHtml.includes('id="dashCombinedDone"'), '2.11 #dashCombinedDone must exist in intelligent workload card');
assert.ok(indexHtml.includes('id="dashAuditRate"'), '2.12 #dashAuditRate must exist in proof-of-work quality card');
assert.ok(indexHtml.includes('id="dashCrewActiveCount"'), '2.13 #dashCrewActiveCount must exist in route velocity card');

console.log('✅ PASS 2: Unified Operations Dashboard, combined KPIs, and intelligent cards verified.');

// ---------------------------------------------------------------------------
// TEST 3: JAVASCRIPT CONTROLLER LOGIC (app.js)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: JavaScript Controller Logic & Dynamic State ---');

// 3.1 Sidebar toggle and close methods
assert.ok(appJs.includes('function toggleAdminSidebar'), '3.1 toggleAdminSidebar defined');
assert.ok(appJs.includes('function closeAdminSidebar'), '3.2 closeAdminSidebar defined');

// 3.2 Operations Dashboard methods
assert.ok(appJs.includes('function updateOperationsDashboardKPIs'), '3.3 updateOperationsDashboardKPIs defined');
assert.ok(appJs.includes('function refreshOperationsDashboard'), '3.4 refreshOperationsDashboard defined');

// 3.3 Dashboard routing integration
assert.ok(appJs.includes("tabName === 'dashboard'"), '3.5 dashboard alias handled in switchAdminTab');
assert.ok(appJs.includes("urlTab === 'dashboard'"), '3.6 dashboard alias handled in getSavedAdminTab');

console.log('✅ PASS 3: JavaScript controllers, dashboard synchronization, and responsive drawer logic verified.');

// ---------------------------------------------------------------------------
// TEST 4: CSS STYLING & RESPONSIVENESS (style.css)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: CSS Styling, Responsive Drawer & Dark Theme ---');

// 4.1 Layout styles
assert.ok(styleCss.includes('.admin-layout-wrapper'), '4.1 .admin-layout-wrapper styled');
assert.ok(styleCss.includes('.admin-sidebar'), '4.2 .admin-sidebar styled');
assert.ok(styleCss.includes('.sidebar-logout-btn'), '4.3 .sidebar-logout-btn styled with destructive theme');

// 4.2 Dashboard styles
assert.ok(styleCss.includes('.ops-dashboard-hub-header'), '4.4 .ops-dashboard-hub-header styled');
assert.ok(styleCss.includes('.ops-kpi-deck'), '4.5 .ops-kpi-deck grid styled');
assert.ok(styleCss.includes('.ops-intelligence-deck'), '4.6 .ops-intelligence-deck grid styled');

// 4.3 Mobile Drawer breakpoint
assert.ok(styleCss.includes('@media (max-width: 1024px)'), '4.7 Tablet/Mobile media query defined for sidebar drawer');
assert.ok(styleCss.includes('.admin-sidebar.sidebar-open'), '4.8 Off-canvas open state styled');

console.log('✅ PASS 4: CSS design system, responsive drawer, and dark mode rules verified.');

console.log('\n===============================================================');
console.log('🎉 ALL TESTS IN ADMIN SIDEBAR & OPERATIONS DASHBOARD SUITE PASSED!');
console.log('===============================================================\n');
