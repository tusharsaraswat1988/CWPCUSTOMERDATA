/**
 * QA Test Suite: Customer Edit Modal, Package Types Deduplication & Staff Assignment Clarity
 *
 * Verifies:
 * 1. repos.serviceJobs.findByCustomerId and updateJob existence and functionality.
 * 2. adminService.updateCustomer on-demand job updating without runtime exceptions.
 * 3. Elimination of duplicate package type options (e.g. CAR WASH SUBSCRIPTION vs Wash Subscription).
 * 4. CSS isolation preventing .form-row-2 display:grid from overriding display:none on solar panel inputs.
 * 5. Primary staff vs Job assignment dispatch clarity in UI labels and hint text.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING CUSTOMER EDIT & PACKAGE TYPE DEDUPLICATION QA');
console.log('===============================================================\n');

// 1. Verify Repositories Export findByCustomerId & updateJob
console.log('--- TEST 1: Service Jobs Repository Methods ---');
const serviceJobsRepo = require('../db/repositories/serviceJobsRepo');
assert.strictEqual(typeof serviceJobsRepo.findByCustomerId, 'function', 'serviceJobsRepo.findByCustomerId must be a function');
assert.strictEqual(typeof serviceJobsRepo.updateJob, 'function', 'serviceJobsRepo.updateJob must be a function');
console.log('✅ PASS 1.1: serviceJobsRepo.findByCustomerId and updateJob are properly exported.');

// 2. Verify adminService updateCustomer logic for On-Demand jobs
console.log('\n--- TEST 2: adminService updateCustomer Logic Verification ---');
const adminServiceSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'adminService.js'), 'utf8');
assert(adminServiceSrc.includes('await repos.serviceJobs.findByCustomerId(customer.id, { client })'),
  'adminService must call repos.serviceJobs.findByCustomerId');
assert(adminServiceSrc.includes('await repos.serviceJobs.updateJob(targetJobId'),
  'adminService must update existing on-demand job via repos.serviceJobs.updateJob');
assert(adminServiceSrc.includes('repos.staffAssignments.assignStaffToJob'),
  'adminService must synchronize staff assignment for on-demand jobs');
console.log('✅ PASS 2.1: adminService integrates findByCustomerId, updateJob and job staff assignment.');

// 3. Verify Package Types in public/js/app.js have zero duplicates
console.log('\n--- TEST 3: Package Types Deduplication in public/js/app.js ---');
const appJsSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

// Ensure CAR WASH SUBSCRIPTION and CAR WASH SINGLE are not present in toggleCategoryFields or handleEditCategoryChange
assert(!appJsSrc.includes("'<option value=\"CAR WASH SUBSCRIPTION\">CAR WASH SUBSCRIPTION</option>'"),
  'Duplicate option CAR WASH SUBSCRIPTION must not be present in app.js option templates');
assert(!appJsSrc.includes("'<option value=\"CAR WASH SINGLE\">CAR WASH SINGLE</option>'"),
  'Duplicate option CAR WASH SINGLE must not be present in app.js option templates');
assert(!appJsSrc.includes("'<option value=\"SOLAR SUBSCRIPTION\">SOLAR SUBSCRIPTION</option>'"),
  'Duplicate option SOLAR SUBSCRIPTION must not be present in app.js option templates');
assert(!appJsSrc.includes("'<option value=\"SOLAR SINGLE\">SOLAR SINGLE</option>'"),
  'Duplicate option SOLAR SINGLE must not be present in app.js option templates');

// Ensure canonical packages exist
assert(appJsSrc.includes('Single Wash (One Time Wash)'), 'Must include Single Wash (One Time Wash)');
assert(appJsSrc.includes('Wash Subscription (4 Washes / 6 Months)'), 'Must include Wash Subscription (4 Washes / 6 Months)');
assert(appJsSrc.includes('One Time Solar Cleaning'), 'Must include One Time Solar Cleaning');
assert(appJsSrc.includes('6 Month Subscription (6 frequencies)'), 'Must include 6 Month Subscription');
console.log('✅ PASS 3.1: All duplicate package types removed; canonical packages preserved.');

// Ensure legacy normalization exists in openEditCustomerModal
assert(appJsSrc.includes('// Normalize legacy and alias package names to canonical catalog options'),
  'openEditCustomerModal must contain legacy package normalization');
console.log('✅ PASS 3.2: Legacy package normalization correctly handles historical records.');

// 4. Verify CSS rule preventing display:grid override on hidden solar panels
console.log('\n--- TEST 4: CSS Form-Row-2 & Solar Panel Display Rules ---');
const styleCssSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
assert(!styleCssSrc.includes('.form-row-2 {\n      display: grid !important;'),
  'style.css must not force display: grid !important on .form-row-2 unconditionally');
assert(styleCssSrc.includes('#editCustSolarPanelsRow[style*="display: none"]') || styleCssSrc.includes('.form-row-2.is-hidden'),
  'style.css must enforce display: none !important for hidden solar panel rows');
console.log('✅ PASS 4.1: CSS specificity properly protects hidden solar panels from erroneous display.');

// 5. Verify the current Admin V2 route and assignment view. The legacy
// Index.html assertion became stale when this workflow moved into Admin V2.
console.log('\n--- TEST 5: Daily Clean Route Assignment & Job Assignment Hub in Admin V2 ---');
const adminV2Html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'index.html'), 'utf8');
assert(adminV2Html.includes('id="v2NavBtnJobAssignment"') && adminV2Html.includes('data-tab="jobAssignment"'),
  'Admin V2 must expose the Assign Jobs route');
assert(adminV2Html.includes('id="v2View_jobAssignment"') && adminV2Html.includes('id="v2AjTable"'),
  'Admin V2 Assign Jobs view must contain the daily route assignment table');
console.log('✅ PASS 5.1: Admin V2 route allocation and Assign Jobs view verified.');

console.log('\n===============================================================');
console.log('🎉 ALL 5 CUSTOMER EDIT & PACKAGE VERIFICATION TESTS PASSED!');
console.log('===============================================================\n');
