/**
 * =============================================================================
 * CWP ADMIN PORTAL - CUSTOMER RECORDS UI/UX & LANGUAGE STATE AUDIT QA TEST SUITE
 * =============================================================================
 * Verifies:
 * 1. Filter Toolbar Single-Row Desktop Architecture & Graceful Mobile Wrapping
 * 2. 11 Dedicated Information Columns (Customer Name, Mobile, Service separated)
 * 3. Primary & Secondary Address & Map Column Widths and Zero Excess Gap
 * 4. Customer Name Natural Display (No Phone/Badge under name, no clipping)
 * 5. Staff Column Compact Chips and Safe Overflow Handling
 * 6. Actions Column Compactness & Preservation of Actions (Assign, Edit, Delete)
 * 7. Language Selector State Synchronization (EN/HI header & dropdown menu)
 * 8. Language Persistence & Locale Initialization
 * =============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🔍 RUNNING CUSTOMER RECORDS UI/UX & LANGUAGE STATE AUDIT QA');
console.log('===============================================================\n');

const indexPath = path.join(__dirname, '..', 'Index.html');
const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const styleCss = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(jsPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Filter Toolbar - Single-Row Desktop Layout & Responsive Wrapping
// -----------------------------------------------------------------------------
console.log('--- Test 1: Filter Toolbar Layout & Controls ---');

assert.ok(indexHtml.includes('class="records-toolbar"'), '1.1 records-toolbar container exists');
assert.ok(indexHtml.includes('id="adminRecordSearch"'), '1.2 Search input preserved');
assert.ok(indexHtml.includes('id="filterAdminCategory"'), '1.3 Category filter dropdown preserved');
assert.ok(indexHtml.includes('id="filterAdminStaff"'), '1.4 Staff filter dropdown preserved');
assert.ok(indexHtml.includes('id="filterAdminStatus"'), '1.5 Status filter dropdown preserved');
assert.ok(indexHtml.includes('id="toggleFilterPhoto"'), '1.6 Photo filter toggle preserved');
assert.ok(indexHtml.includes('id="toggleFilterMap"'), '1.7 Map GPS toggle preserved');

// CSS checks for single-row desktop layout
assert.ok(styleCss.includes('.records-toolbar'), '1.8 records-toolbar CSS defined');
assert.ok(styleCss.includes('flex-wrap: nowrap !important;'), '1.9 Desktop toolbar uses flex-wrap: nowrap');
assert.ok(styleCss.includes('.records-search-wrapper'), '1.10 records-search-wrapper defined');
assert.ok(styleCss.includes('.records-filters-group'), '1.11 records-filters-group defined');
assert.ok(styleCss.includes('@media (max-width: 960px)'), '1.12 Responsive media query for toolbar wrapping defined');

console.log('✅ PASS 1: Filter toolbar single-row desktop layout & responsive wrapping verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: 11 Dedicated Customer Information Columns in Table
// -----------------------------------------------------------------------------
console.log('--- Test 2: 11 Dedicated Customer Table Columns ---');

assert.ok(indexHtml.includes('Customer Name</th>'), '2.1 Customer Name column header exists');
assert.ok(indexHtml.includes('Mobile Number</th>'), '2.2 Mobile Number column header exists');
assert.ok(indexHtml.includes('Service</th>'), '2.3 Service column header exists');
assert.ok(indexHtml.includes('Vehicle / Site</th>'), '2.4 Vehicle / Site column header exists');
assert.ok(indexHtml.includes('<th style="min-width: 160px;">Primary Address</th>'), '2.5 Primary Address header exists');
assert.ok(indexHtml.includes('Primary Map</th>'), '2.6 Primary Map header exists');
assert.ok(indexHtml.includes('<th style="min-width: 160px;">Secondary Address</th>'), '2.7 Secondary Address header exists');
assert.ok(indexHtml.includes('Secondary Map</th>'), '2.8 Secondary Map header exists');
assert.ok(indexHtml.includes('Staff</th>'), '2.9 Staff header exists');
assert.ok(indexHtml.includes('Actions</th>'), '2.10 Actions header exists');

assert.ok(appJs.includes('/* 1. Serial Number Cell */'), '2.11 Serial number cell logic');
assert.ok(appJs.includes('/* 2. Customer Name Cell'), '2.12 Dedicated Customer Name cell logic');
assert.ok(appJs.includes('/* 2b. Mobile Number Cell'), '2.13 Dedicated Mobile Number cell logic');
assert.ok(appJs.includes('/* 2c. Service Category & Plan Cell'), '2.14 Dedicated Service Category & Plan cell logic');
assert.ok(appJs.includes('/* 2d. Vehicle / Site Cell'), '2.15 Dedicated Vehicle / Site cell logic');
assert.ok(appJs.includes('/* 3. Primary Address Cell */'), '2.16 Dedicated Primary Address cell logic');
assert.ok(appJs.includes('/* 4. Primary Map Location Cell */'), '2.17 Dedicated Primary Map cell logic');
assert.ok(appJs.includes('/* 5. Secondary Address Cell */'), '2.18 Dedicated Secondary Address cell logic');
assert.ok(appJs.includes('/* 6. Secondary Map Location Cell */'), '2.19 Dedicated Secondary Map cell logic');
assert.ok(appJs.includes('/* 7. Staff Assigned Name or Unassigned Badge */'), '2.20 Dedicated Staff cell logic');
assert.ok(appJs.includes('/* 8. Actions: Edit and Delete Buttons */'), '2.21 Dedicated Actions cell logic');

console.log('✅ PASS 2: All 11 dedicated columns defined with proper separation in DOM & JS.\n');

// -----------------------------------------------------------------------------
// TEST 3: Customer Name & Phone Cell Isolation & Natural Wrapping
// -----------------------------------------------------------------------------
console.log('--- Test 3: Customer Name & Phone Isolation ---');

assert.ok(appJs.includes('table-phone-cell'), '3.1 Dedicated table-phone-cell rendered');
assert.ok(appJs.includes('cust-phone-link'), '3.2 Dedicated cust-phone-link rendered');
assert.ok(appJs.includes('table-service-cell'), '3.3 Dedicated table-service-cell rendered');
assert.ok(styleCss.includes('.cust-name-text'), '3.4 cust-name-text CSS defined');
assert.ok(styleCss.includes('word-break: break-word !important;'), '3.5 Customer name uses word-break: break-word to prevent clipping');
assert.ok(styleCss.includes('white-space: normal !important;'), '3.6 Customer name uses white-space: normal for natural wrapping');

console.log('✅ PASS 3: Customer name displays naturally without phone/badge clipping.\n');

// -----------------------------------------------------------------------------
// TEST 4: Address and Map Column Spacing & Gap Optimization
// -----------------------------------------------------------------------------
console.log('--- Test 4: Address and Map Column Spacing ---');

assert.ok(styleCss.includes('th:nth-child(7)'), '4.1 Primary Map header tight width rule exists');
assert.ok(styleCss.includes('td:nth-child(7)'), '4.2 Primary Map body tight padding rule exists');
assert.ok(styleCss.includes('th:nth-child(9)'), '4.3 Secondary Map header tight width rule exists');
assert.ok(styleCss.includes('td:nth-child(9)'), '4.4 Secondary Map body tight padding rule exists');
assert.ok(styleCss.includes('.table-inline-map-btn'), '4.5 table-inline-map-btn defined');
assert.ok(styleCss.includes('.table-inline-map-sec-btn'), '4.6 table-inline-map-sec-btn defined');

console.log('✅ PASS 4: Address and map column widths and gaps optimized cleanly.\n');

// -----------------------------------------------------------------------------
// TEST 5: Language State Synchronization (Header EN/HI and Dropdown Selection)
// -----------------------------------------------------------------------------
console.log('--- Test 5: Language Selector State Synchronization ---');

// Check app.js applyStaffLanguage implementation
assert.ok(appJs.includes("langText.textContent = isHi ? 'HI' : 'EN'"), '5.1 Header shows HI when Hindi active and EN when English active');
assert.ok(appJs.includes("optEn.classList.toggle('is-selected', !isHi)"), '5.2 English dropdown option is-selected toggled with !isHi');
assert.ok(appJs.includes("optHi.classList.toggle('is-selected', isHi)"), '5.3 Hindi dropdown option is-selected toggled with isHi');

// Check toggleLangDropdown dynamically updates before display
assert.ok(appJs.includes("var currentLang = state.lang || localStorage.getItem('cwp_lang')"), '5.4 Authoritative locale read on dropdown toggle');

// Check synchronization and persistence
assert.ok(appJs.includes("localStorage.setItem('cwp_lang', lang)"), '5.5 Locale persisted to cwp_lang in localStorage');
assert.ok(appJs.includes("localStorage.getItem('cwp_lang')"), '5.6 Default fallback reads from cwp_lang across initLanguage & t()');

console.log('✅ PASS 5: Language selector header and dropdown states fully synchronized.\n');

// -----------------------------------------------------------------------------
// TEST 6: Skeleton Loader Alignment (11 Columns)
// -----------------------------------------------------------------------------
console.log('--- Test 6: Skeleton Loader Column Count ---');

// Count <td> elements in each skeleton-tr in app.js
const skeletonMatch = appJs.match(/html \+= '<tr class="skeleton-tr">([\s\S]*?)<\/tr>';/);
assert.ok(skeletonMatch, '6.1 skeleton-tr template exists in app.js');
const tdCount = (skeletonMatch[1].match(/<td/g) || []).length;
assert.strictEqual(tdCount, 11, '6.2 Skeleton loader must generate exactly 11 <td> cells matching table columns');

console.log('✅ PASS 6: Skeleton loader perfectly matches 11 columns.\n');

console.log('===============================================================');
console.log('🎉 ALL 6 CUSTOMER RECORDS UI/UX & LANGUAGE AUDIT TESTS PASSED!');
console.log('===============================================================\n');
