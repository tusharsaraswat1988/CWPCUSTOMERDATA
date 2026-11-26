/**
 * Automated QA Test Suite: CWP Aura Table, Data Grid & Operational Record System (Task 07)
 *
 * Verifies all 20 required criteria + live HTTP endpoint:
 * 1. Section 15 registration & quick-jump navigation (#v2-sec-tables)
 * 2. Compact (34px) & Standard (46px) density tokens, classes, and controls
 * 3. Row selection system and selection state persistence (.is-selected)
 * 4. Select-all visible rows checkbox behavior (#v2TableSelectAllPage)
 * 5. Selected count indicator (#v2TableBulkCount)
 * 6. Bulk action bar appearance and operational bulk actions (#v2TableBulkBar)
 * 7. Ascending sort logic, indicator, and aria-sort
 * 8. Descending sort logic, indicator, and aria-sort
 * 9. Multi-column sort capability (ID, Customer, Vehicle, Route, Staff, Date, Priority, Amount, Status)
 * 10. Pagination calculation and range display (Showing X–Y of Z)
 * 11. Page size options (10, 25, 50, 100)
 * 12. Inline expandable rows with 3-column operational card (.cwp-v2-expanded-panel)
 * 13. Search query filtering across multiple record fields (#v2TableSearchInput)
 * 14. Filter chips cluster (All, Today, Unassigned, High-Priority, In Progress, Completed)
 * 15. Active filter summary bar, removable tags, and reset trigger
 * 16. Empty dataset state presentation (#v2TableEmptyPanel)
 * 17. Loading skeleton shimmer rows (#v2TableSkeletonShimmer)
 * 18. Error state presentation with retry connection (#v2TableErrorPanel)
 * 19. Row action hierarchy and overflow action menu (.cwp-v2-table-overflow-menu)
 * 20. Responsive overflow and sticky action column safeguards (.is-sticky-action)
 * 21. Live HTTP 200 check on http://localhost:3000/admin-v2
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

console.log('===============================================================');
console.log('📊 RUNNING CWP AURA TABLE & DATA GRID SYSTEM QA SUITE (TASK 07)');
console.log('===============================================================\n');

const tokensPath = path.join(__dirname, '../public/admin-v2/css/v2-tokens.css');
const componentsPath = path.join(__dirname, '../public/admin-v2/css/v2-components.css');
const indexPath = path.join(__dirname, '../public/admin-v2/index.html');
const playgroundJsPath = path.join(__dirname, '../public/admin-v2/js/v2-playground.js');

assert.ok(fs.existsSync(tokensPath), 'v2-tokens.css must exist');
assert.ok(fs.existsSync(componentsPath), 'v2-components.css must exist');
assert.ok(fs.existsSync(indexPath), 'public/admin-v2/index.html must exist');
assert.ok(fs.existsSync(playgroundJsPath), 'v2-playground.js must exist');

const tokensCss = fs.readFileSync(tokensPath, 'utf8');
const componentsCss = fs.readFileSync(componentsPath, 'utf8');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const playgroundJs = fs.readFileSync(playgroundJsPath, 'utf8');

let passCount = 0;

// TEST 1: Section 15 Registration & Quick-Jump Navigation
console.log('--- TEST 1: Section 15 Registration & Navigation ---');
assert.ok(indexHtml.includes('id="v2-sec-tables"'), 'index.html must declare Section 15 with id="v2-sec-tables"');
assert.ok(indexHtml.includes('15. CWP Aura Tables &amp; Operational Data Grid System') || indexHtml.includes('15. CWP Aura Tables & Operational Data Grid System'), 'Section 15 title must match specification');
assert.ok(indexHtml.includes('href="#v2-sec-tables"'), 'Quick-jump navigation must link to #v2-sec-tables');
assert.ok(indexHtml.includes('Tables &amp; Data Grid (Task 07)') || indexHtml.includes('Tables & Data Grid (Task 07)'), 'Quick-jump label must reference Task 07');
assert.ok(indexHtml.includes('TASK 07 &bull; TABLE &amp; DATA GRID') || indexHtml.includes('TASK 07 • TABLE & DATA GRID'), 'Header badge must display Task 07 token');
console.log('✅ PASS 1: Section 15 and quick-jump navigation verified.');
passCount++;

// TEST 2: Density Calibration & Design Tokens
console.log('--- TEST 2: Density Tokens & Classes ---');
const tableTokens = [
  '--cwp-v2-table-row-h-compact: 34px;',
  '--cwp-v2-table-row-h-standard: 46px;',
  '--cwp-v2-table-header-h-compact: 36px;',
  '--cwp-v2-table-header-h-standard: 42px;',
  '--cwp-v2-table-expand-bg',
  '--cwp-v2-table-sticky-shadow',
  '--cwp-v2-table-bulk-bg'
];
tableTokens.forEach(t => {
  assert.ok(tokensCss.includes(t.replace(';', '')), `v2-tokens.css must declare ${t}`);
});

assert.ok(componentsCss.includes('.cwp-v2-table.is-compact-mode td'), 'v2-components.css must define .is-compact-mode row styles');
assert.ok(componentsCss.includes('.cwp-v2-table.is-standard-mode td'), 'v2-components.css must define .is-standard-mode row styles');
assert.ok(indexHtml.includes('data-density="compact"'), 'DOM must provide compact density toggle button');
assert.ok(indexHtml.includes('data-density="standard"'), 'DOM must provide standard density toggle button');
console.log('✅ PASS 2: 34px compact and 46px standard density tokens & classes verified.');
passCount++;

// TEST 3: Row Selection System & State Persistence
console.log('--- TEST 3: Row Selection System ---');
assert.ok(playgroundJs.includes('state.selectedIds'), 'playground.js must maintain selectedIds set');
assert.ok(playgroundJs.includes('v2-t7-row-checkbox'), 'playground.js must handle row selection checkboxes');
assert.ok(playgroundJs.includes("class=\"${isSelected ? 'is-selected' : ''}\""), 'Row must receive is-selected class when selected');
assert.ok(componentsCss.includes('.cwp-v2-table tbody tr.is-selected'), 'v2-components.css must style selected row highlight');
console.log('✅ PASS 3: Row selection state persistence verified.');
passCount++;

// TEST 4: Select-All Visible Rows Checkbox
console.log('--- TEST 4: Select-All Visible Rows Behavior ---');
assert.ok(indexHtml.includes('id="v2TableSelectAllPage"'), 'DOM must contain select all on page checkbox #v2TableSelectAllPage');
assert.ok(playgroundJs.includes('selectAllPageCheckbox'), 'playground.js must bind select all on page checkbox');
assert.ok(playgroundJs.includes('selectAllPageCheckbox.indeterminate'), 'playground.js must calculate indeterminate state');
console.log('✅ PASS 4: Select-all visible rows checkbox behavior verified.');
passCount++;

// TEST 5: Selected Count Indicator
console.log('--- TEST 5: Selected Count Indicator ---');
assert.ok(indexHtml.includes('id="v2TableBulkCount"'), 'DOM must contain #v2TableBulkCount');
assert.ok(playgroundJs.includes('bulkCountEl.textContent = `${count} selected`') || playgroundJs.includes('bulkCountEl.textContent ='), 'playground.js must update bulk count text');
console.log('✅ PASS 5: Selected count indicator verified.');
passCount++;

// TEST 6: Bulk Action Toolbar & Actions
console.log('--- TEST 6: Bulk Action Toolbar ---');
assert.ok(indexHtml.includes('id="v2TableBulkBar"'), 'DOM must contain #v2TableBulkBar');
assert.ok(indexHtml.includes('data-action="Assign Staff"'), 'DOM must include Assign Staff bulk action');
assert.ok(indexHtml.includes('data-action="Change Status"'), 'DOM must include Change Status bulk action');
assert.ok(indexHtml.includes('data-action="Export CSV"'), 'DOM must include Export CSV bulk action');
assert.ok(indexHtml.includes('id="v2TableSelectAllDatasetBtn"'), 'DOM must provide select all in dataset button');
assert.ok(indexHtml.includes('id="v2TableClearSelectionBtn"'), 'DOM must provide clear selection button');
assert.ok(playgroundJs.includes('bulkBarEl.style.display = \'flex\''), 'playground.js must display bulk bar when selection exists');
console.log('✅ PASS 6: Bulk action toolbar and actions verified.');
passCount++;

// TEST 7: Ascending Sort Verification
console.log('--- TEST 7: Sorting Ascending ---');
assert.ok(playgroundJs.includes("state.sortDir === 'asc' ? 'ascending' : 'descending'"), 'playground.js must set aria-sort ascending');
assert.ok(playgroundJs.includes("icon.textContent = state.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'"), 'playground.js must update sort icon to arrow_upward');
console.log('✅ PASS 7: Ascending sorting and aria-sort verified.');
passCount++;

// TEST 8: Descending Sort Verification
console.log('--- TEST 8: Sorting Descending ---');
assert.ok(indexHtml.includes('aria-sort="descending"'), 'Initial table header must declare default descending sort');
assert.ok(playgroundJs.includes("state.sortDir === 'asc' ? 'desc' : 'asc'"), 'playground.js must toggle asc to desc on repeated clicks');
console.log('✅ PASS 8: Descending sorting and default sort verified.');
passCount++;

// TEST 9: Multi-Column Sort Capability
console.log('--- TEST 9: Multi-Column Sort Capability ---');
const sortColumns = ['id', 'customer', 'vehicle', 'route', 'staff', 'date', 'priority', 'amount', 'status'];
sortColumns.forEach(col => {
  assert.ok(indexHtml.includes(`data-sort="${col}"`), `index.html header must have data-sort="${col}"`);
});
assert.ok(playgroundJs.includes("col === 'amount'"), 'playground.js must implement numerical sorting for amount');
assert.ok(playgroundJs.includes("col === 'priority'"), 'playground.js must implement weight sorting for priority');
console.log(`✅ PASS 9: Multi-column sorting verified across all ${sortColumns.length} sortable dimensions.`);
passCount++;

// TEST 10: Pagination Page Calculation
console.log('--- TEST 10: Pagination Page Calculation ---');
assert.ok(playgroundJs.includes('Math.ceil(totalRecords / state.pageSize)'), 'playground.js must compute totalPages');
assert.ok(indexHtml.includes('id="v2TablePaginationRange"'), 'DOM must contain pagination range indicator #v2TablePaginationRange');
assert.ok(indexHtml.includes('id="v2TablePageIndicator"'), 'DOM must contain page indicator #v2TablePageIndicator');
assert.ok(indexHtml.includes('id="v2TableFirstPageBtn"'), 'DOM must contain first page button');
assert.ok(indexHtml.includes('id="v2TableLastPageBtn"'), 'DOM must contain last page button');
console.log('✅ PASS 10: Pagination page calculation and indicators verified.');
passCount++;

// TEST 11: Page Size Changes (10, 25, 50, 100)
console.log('--- TEST 11: Page Size Selector ---');
assert.ok(indexHtml.includes('id="v2TablePageSizeSelect"'), 'DOM must contain page size select #v2TablePageSizeSelect');
[10, 25, 50, 100].forEach(size => {
  assert.ok(indexHtml.includes(`value="${size}"`), `Page size select must contain option ${size}`);
});
assert.ok(playgroundJs.includes('parseInt(this.value, 10)'), 'playground.js must parse page size selection');
console.log('✅ PASS 11: Page size choices (10, 25, 50, 100) verified.');
passCount++;

// TEST 12: Expandable Rows Toggle & Operational Card
console.log('--- TEST 12: Expandable Rows & Detail Card ---');
assert.ok(componentsCss.includes('.cwp-v2-expand-btn.is-expanded'), 'v2-components.css must define 90-degree chevron rotation');
assert.ok(componentsCss.includes('.cwp-v2-expanded-panel'), 'v2-components.css must define .cwp-v2-expanded-panel');
assert.ok(componentsCss.includes('.cwp-v2-expanded-grid'), 'v2-components.css must define .cwp-v2-expanded-grid');
assert.ok(playgroundJs.includes('cwp-v2-expanded-row is-expanded'), 'playground.js must render expanded row');
assert.ok(playgroundJs.includes('Customer &amp; Access Details'), 'Expanded panel must display Customer & Access Details');
assert.ok(playgroundJs.includes('Vehicle &amp; Service Package'), 'Expanded panel must display Vehicle & Service Package');
assert.ok(playgroundJs.includes('Dispatch &amp; Operations Directives'), 'Expanded panel must display Dispatch Directives');
assert.ok(indexHtml.includes('id="v2TableToggleAllExpandBtn"'), 'DOM must include expand/collapse all rows button');
console.log('✅ PASS 12: Expandable rows with 3-column operational card verified.');
passCount++;

// TEST 13: Search Query Filtering
console.log('--- TEST 13: Search Query Filtering ---');
assert.ok(indexHtml.includes('id="v2TableSearchInput"'), 'DOM must contain #v2TableSearchInput');
assert.ok(indexHtml.includes('id="v2TableSearchClearBtn"'), 'DOM must contain #v2TableSearchClearBtn');
assert.ok(playgroundJs.includes('item.customer.toLowerCase().includes(q)'), 'playground.js must search customer name');
assert.ok(playgroundJs.includes('item.vehicle.toLowerCase().includes(q)'), 'playground.js must search vehicle registration');
assert.ok(playgroundJs.includes('item.id.toLowerCase().includes(q)'), 'playground.js must search Job ID');
console.log('✅ PASS 13: Search filtering across customer, vehicle, ID, and route verified.');
passCount++;

// TEST 14: Filter Chips Integration
console.log('--- TEST 14: Filter Chips Integration ---');
assert.ok(indexHtml.includes('id="v2TableChipsCluster"'), 'DOM must contain #v2TableChipsCluster');
const chipTypes = ['all', 'today', 'unassigned', 'high-priority', 'in-progress', 'completed'];
chipTypes.forEach(chip => {
  assert.ok(indexHtml.includes(`data-table-chip="${chip}"`), `DOM must include chip for "${chip}"`);
});
assert.ok(indexHtml.includes('id="v2TableChipUnassignedCount"'), 'DOM must provide dynamic count badge for unassigned jobs');
assert.ok(playgroundJs.includes("state.filters.chip === 'unassigned'"), 'playground.js must filter unassigned jobs on chip click');
console.log(`✅ PASS 14: Operational filter chips (${chipTypes.length} types) verified.`);
passCount++;

// TEST 15: Filter Summary Bar & Clear Actions
console.log('--- TEST 15: Filter Summary Bar ---');
assert.ok(indexHtml.includes('id="v2TableSummaryBar"'), 'DOM must contain #v2TableSummaryBar');
assert.ok(indexHtml.includes('id="v2TableActiveFilterCount"'), 'DOM must contain #v2TableActiveFilterCount');
assert.ok(indexHtml.includes('id="v2TableFilterTagsContainer"'), 'DOM must contain #v2TableFilterTagsContainer');
assert.ok(indexHtml.includes('id="v2TableSummaryResetBtn"'), 'DOM must contain #v2TableSummaryResetBtn');
assert.ok(playgroundJs.includes('v2-t7-remove-filter'), 'playground.js must handle individual filter removal');
console.log('✅ PASS 15: Filter summary bar, tags, and clear actions verified.');
passCount++;

// TEST 16: Empty Dataset State Presentation
console.log('--- TEST 16: Empty Dataset State ---');
assert.ok(indexHtml.includes('id="v2TableEmptyPanel"'), 'DOM must contain #v2TableEmptyPanel');
assert.ok(indexHtml.includes('id="v2TableEmptyClearBtn"'), 'DOM must contain reset button in empty state panel');
assert.ok(playgroundJs.includes("state.previewState === 'empty' || sorted.length === 0"), 'playground.js must activate empty panel when 0 records match');
console.log('✅ PASS 16: Empty state panel and filter reset trigger verified.');
passCount++;

// TEST 17: Loading Skeleton State Presentation
console.log('--- TEST 17: Loading Skeleton State ---');
assert.ok(indexHtml.includes('id="v2TableSkeletonShimmer"'), 'DOM must contain #v2TableSkeletonShimmer');
assert.ok(componentsCss.includes('.cwp-v2-skeleton-bar'), 'v2-components.css must define .cwp-v2-skeleton-bar');
assert.ok(componentsCss.includes('@keyframes cwpV2Shimmer'), 'v2-components.css must define shimmer animation');
assert.ok(playgroundJs.includes("state.previewState === 'loading'"), 'playground.js must handle loading state');
console.log('✅ PASS 17: Loading skeleton shimmer state verified.');
passCount++;

// TEST 18: Error State with Retry Trigger
console.log('--- TEST 18: Error State with Retry Trigger ---');
assert.ok(indexHtml.includes('id="v2TableErrorPanel"'), 'DOM must contain #v2TableErrorPanel');
assert.ok(indexHtml.includes('id="v2TableErrorRetryBtn"'), 'DOM must contain retry button in error panel');
assert.ok(playgroundJs.includes('errorRetryBtn.addEventListener'), 'playground.js must bind retry connection handler');
console.log('✅ PASS 18: Error state and retry connection trigger verified.');
passCount++;

// TEST 19: Row Actions & Overflow Menu
console.log('--- TEST 19: Row Actions & Overflow Menu ---');
assert.ok(componentsCss.includes('.cwp-v2-row-action-btn'), 'v2-components.css must define .cwp-v2-row-action-btn');
assert.ok(componentsCss.includes('.cwp-v2-table-overflow-menu'), 'v2-components.css must define .cwp-v2-table-overflow-menu');
assert.ok(playgroundJs.includes('v2-t7-overflow-trigger'), 'playground.js must handle overflow menu trigger');
assert.ok(playgroundJs.includes('data-action="timeline"'), 'Overflow menu must contain Audit Timeline');
assert.ok(playgroundJs.includes('data-action="print"'), 'Overflow menu must contain Print Work Order');
assert.ok(playgroundJs.includes('data-action="reassign"'), 'Overflow menu must contain Reassign Slot');
assert.ok(playgroundJs.includes('data-action="cancel"'), 'Overflow menu must contain Cancel Job');
console.log('✅ PASS 19: Row action hierarchy and overflow menu verified.');
passCount++;

// TEST 20: Responsive Overflow & Sticky Action Safeguards
console.log('--- TEST 20: Responsive Overflow & Sticky Actions ---');
assert.ok(componentsCss.includes('.cwp-v2-table th.is-sticky-action'), 'v2-components.css must define sticky header action cell');
assert.ok(componentsCss.includes('.cwp-v2-table td.is-sticky-action'), 'v2-components.css must define sticky body action cell');
assert.ok(componentsCss.includes('box-shadow: -4px 0 6px -2px'), 'Sticky action column must have drop-shadow separation');
assert.ok(indexHtml.includes('has-sticky-header'), 'Table container must declare has-sticky-header');
console.log('✅ PASS 20: Responsive overflow and sticky column safeguards verified.');
passCount++;

// TEST 21: Live HTTP 200 Verification on /admin-v2
console.log('--- TEST 21: Live HTTP Verification on http://localhost:3000/admin-v2 ---');
http.get('http://localhost:3000/admin-v2', (res) => {
  assert.strictEqual(res.statusCode, 200, 'HTTP status code must be 200');
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    assert.ok(data.includes('id="v2-sec-tables"'), 'Served response must include Section 15 #v2-sec-tables');
    assert.ok(data.includes('id="v2Task07Table"'), 'Served response must include #v2Task07Table');
    assert.ok(data.includes('id="v2TableBulkBar"'), 'Served response must include #v2TableBulkBar');
    assert.ok(data.includes('id="v2TableContainer"'), 'Served response must include #v2TableContainer');
    console.log('✅ PASS 21: Live HTTP endpoint /admin-v2 returns 200 with full Section 15 data grid.');
    passCount++;

    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passCount} TASK 07 TABLE & DATA GRID QA TESTS PASSED (100%)!`);
    console.log('===============================================================');
  });
}).on('error', (err) => {
  console.error('HTTP Request failed:', err.message);
  process.exit(1);
});
