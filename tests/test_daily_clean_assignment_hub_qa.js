/**
 * Automated QA Test Suite for Daily Car Cleaning Route Allocation Hub Redesign
 * Verifies backend APIs, UI elements in Index.html, and client controllers in app.js.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(rootDir, 'Index.html');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const serverJsPath = path.join(rootDir, 'server.js');
const styleCssPath = path.join(rootDir, 'public', 'css', 'style.css');
const adminServicePath = path.join(rootDir, 'services', 'adminService.js');

console.log('=== Starting Daily Clean Route Allocation Hub QA Tests ===\n');

// ---------------------------------------------------------------------------
// TEST 1: Server and AdminService Endpoint Registrations
// ---------------------------------------------------------------------------
console.log('Test 1: Server and AdminService Endpoint Registrations...');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const adminServiceJs = fs.readFileSync(adminServicePath, 'utf8');

assert.ok(serverJs.includes('assignDailyCleanCustomer'), 'server.js includes assignDailyCleanCustomer');
assert.ok(serverJs.includes('unassignDailyCleanCustomer'), 'server.js includes unassignDailyCleanCustomer');
assert.ok(serverJs.includes('getDailyCleanAssignments'), 'server.js includes getDailyCleanAssignments');

assert.ok(adminServiceJs.includes('async function assignDailyCleanCustomer'), 'adminService exports assignDailyCleanCustomer');
assert.ok(adminServiceJs.includes('async function unassignDailyCleanCustomer'), 'adminService exports unassignDailyCleanCustomer');
assert.ok(adminServiceJs.includes('async function getDailyCleanAssignments'), 'adminService exports getDailyCleanAssignments');
console.log('✓ Test 1 Passed: Server endpoints and adminService methods declared.');

// ---------------------------------------------------------------------------
// TEST 2: Index.html Job Assignment Hub Sub-tabs & DCC Pane
// ---------------------------------------------------------------------------
console.log('\nTest 2: Index.html Job Assignment Sub-tabs & DCC Pane...');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

assert.ok(indexHtml.includes('id="btnSubTabDailyRoutes"'), 'btnSubTabDailyRoutes exists');
assert.ok(indexHtml.includes('id="btnSubTabSpecialJobs"'), 'btnSubTabSpecialJobs exists');
assert.ok(indexHtml.includes('id="jobAssignSubPaneDaily"'), 'jobAssignSubPaneDaily exists');
assert.ok(indexHtml.includes('id="jobAssignSubPaneSpecial"'), 'jobAssignSubPaneSpecial exists');
assert.ok(indexHtml.includes('id="dccUnassignedBanner"'), 'dccUnassignedBanner exists');
assert.ok(indexHtml.includes('id="dccAssignForm"'), 'dccAssignForm exists');
assert.ok(indexHtml.includes('id="dccAssignCustomerSelect"'), 'dccAssignCustomerSelect exists');
assert.ok(indexHtml.includes('id="dccAssignStaffSelect"'), 'dccAssignStaffSelect exists');
assert.ok(indexHtml.includes('id="dccAssignSequenceOrder"'), 'dccAssignSequenceOrder exists');
assert.ok(indexHtml.includes('id="dccRouteRosterTable"'), 'dccRouteRosterTable exists');
assert.ok(indexHtml.includes('id="dccRouteRosterTableBody"'), 'dccRouteRosterTableBody exists');
assert.ok(indexHtml.includes('id="dccRosterStaffFilter"'), 'dccRosterStaffFilter exists');
assert.ok(indexHtml.includes('id="dccRosterSearch"'), 'dccRosterSearch exists');
console.log('✓ Test 2 Passed: Job Assignment sub-tabs and DCC route roster elements present.');

// ---------------------------------------------------------------------------
// TEST 3: Modal Decoupling & Backward Compatibility Preservation
// ---------------------------------------------------------------------------
console.log('\nTest 3: Modal Decoupling & Invariant Assertions...');
// Edit Customer Modal
assert.ok(indexHtml.includes('id="editCustAssignmentCard"'), 'editCustAssignmentCard exists');
assert.ok(indexHtml.includes('id="editCustCleanerName"'), 'editCustCleanerName exists');
assert.ok(indexHtml.includes('navigateToJobAssignmentFromModal()'), 'navigateToJobAssignmentFromModal action attached');
assert.ok(indexHtml.includes('id="editCustStaff" class="form-select"'), 'editCustStaff hidden select preserved for test invariants');
assert.ok(!indexHtml.includes('id="editCustStaff" class="form-select" required'), 'editCustStaff is not required');

// Add Customer Modal
assert.ok(indexHtml.includes('id="custStaffSelect" class="form-select"'), 'custStaffSelect hidden select preserved for test invariants');
assert.ok(!indexHtml.includes('id="custStaffSelect" class="form-select" required'), 'custStaffSelect is not required');
assert.ok(indexHtml.includes('<option value="">Unassigned</option>'), 'custStaffSelect Unassigned option preserved');
console.log('✓ Test 3 Passed: Modals decoupled with backward-compatible hidden elements.');

// ---------------------------------------------------------------------------
// TEST 4: Client Controllers in app.js
// ---------------------------------------------------------------------------
console.log('\nTest 4: Client Controllers in app.js...');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert.ok(appJs.includes('function switchJobAssignSubTab'), 'switchJobAssignSubTab defined in app.js');
assert.ok(appJs.includes('function loadDailyCleanRouteAssignments'), 'loadDailyCleanRouteAssignments defined in app.js');
assert.ok(appJs.includes('function renderDccRouteRosterTable'), 'renderDccRouteRosterTable defined in app.js');
assert.ok(appJs.includes('function handleDccAssignmentSubmit'), 'handleDccAssignmentSubmit defined in app.js');
assert.ok(appJs.includes('function handleDccInlineReassign'), 'handleDccInlineReassign defined in app.js');
assert.ok(appJs.includes('function handleDccUnassign'), 'handleDccUnassign defined in app.js');
assert.ok(appJs.includes('function navigateToJobAssignmentFromModal'), 'navigateToJobAssignmentFromModal defined in app.js');
assert.ok(appJs.includes('window.switchJobAssignSubTab = switchJobAssignSubTab'), 'switchJobAssignSubTab exposed on window');
console.log('✓ Test 4 Passed: Client controllers implemented and exposed on window.');

// ---------------------------------------------------------------------------
// TEST 5: CSS Styles in style.css
// ---------------------------------------------------------------------------
console.log('\nTest 5: CSS Styles in style.css...');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

assert.ok(styleCss.includes('.cwp-tab-segmented-control'), '.cwp-tab-segmented-control styled');
assert.ok(styleCss.includes('.cwp-segment-btn'), '.cwp-segment-btn styled');
assert.ok(styleCss.includes('.cwp-cleaner-status-box'), '.cwp-cleaner-status-box styled');
assert.ok(styleCss.includes('.btn-manage-dispatch'), '.btn-manage-dispatch styled');
assert.ok(styleCss.includes('.btn-table-action-sm'), '.btn-table-action-sm styled');
console.log('✓ Test 5 Passed: CSS styling verified.');

// ---------------------------------------------------------------------------
// TEST 6: Mock Backend Logic Verification for AdminService DCC Methods
// ---------------------------------------------------------------------------
console.log('\nTest 6: Backend Unit Logic Verification...');
const adminService = require(adminServicePath);

assert.strictEqual(typeof adminService.assignDailyCleanCustomer, 'function', 'assignDailyCleanCustomer is a function');
assert.strictEqual(typeof adminService.unassignDailyCleanCustomer, 'function', 'unassignDailyCleanCustomer is a function');
assert.strictEqual(typeof adminService.getDailyCleanAssignments, 'function', 'getDailyCleanAssignments is a function');
console.log('✓ Test 6 Passed: AdminService exports verified.');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
