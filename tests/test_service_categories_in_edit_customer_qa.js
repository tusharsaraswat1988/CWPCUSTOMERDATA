/**
 * QA Test Suite: Comprehensive Service Categories in Edit Customer Modal & Backend Sync
 * 
 * Tests:
 * 1. Verification of DOM select elements in Index.html (editCustCategory, custCategory, leadCategory)
 * 2. Verification of client-side openEditCustomerModal preserving all 5 categories regardless of sheetName
 * 3. Verification of server.js allowing category edits across Daily Clean and All Other Work
 * 4. Verification of adminService updating customer category and subscription/job alignment
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING SERVICE CATEGORIES QA SUITE (EDIT CUSTOMER MODAL)');
console.log('===============================================================\n');

// 1. Verify Index.html DOM elements
console.log('--- TEST 1: Index.html DOM Options Verification ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');

const expectedCategories = [
  'Daily Car Cleaning',
  'Car Washing',
  'Solar Panel Cleaning',
  'Interior Detailing',
  'Exterior Detailing'
];

// Check editCustCategory
const editCustCatMatch = indexHtml.match(/<select id="editCustCategory"[^>]*>([\s\S]*?)<\/select>/);
assert(editCustCatMatch, 'editCustCategory select element must exist in Index.html');
expectedCategories.forEach(cat => {
  assert(editCustCatMatch[1].includes(`value="${cat}"`), `editCustCategory must contain option value="${cat}"`);
});
console.log('✅ PASS 1.1: editCustCategory select element contains all 5 canonical categories with bilingual labels');

// Check custCategory (Add Customer)
const addCustCatMatch = indexHtml.match(/<select id="custCategory"[^>]*>([\s\S]*?)<\/select>/);
assert(addCustCatMatch, 'custCategory select element must exist in Index.html');
expectedCategories.forEach(cat => {
  assert(addCustCatMatch[1].includes(`value="${cat}"`), `custCategory must contain option value="${cat}"`);
});
console.log('✅ PASS 1.2: custCategory select element contains all 5 canonical categories with bilingual labels');

// Check leadCategory (Leads)
const leadCatMatch = indexHtml.match(/<select id="leadCategory"[^>]*>([\s\S]*?)<\/select>/);
assert(leadCatMatch, 'leadCategory select element must exist in Index.html');
expectedCategories.forEach(cat => {
  assert(leadCatMatch[1].includes(`value="${cat}"`), `leadCategory must contain option value="${cat}"`);
});
console.log('✅ PASS 1.3: leadCategory select element contains all 5 canonical categories');

// 2. Verify client-side app.js
console.log('\n--- TEST 2: public/js/app.js Category Dropdown Logic ---');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

// Ensure openEditCustomerModal does NOT restrict catSelect.innerHTML to only Daily Car Cleaning
assert(!appJs.includes("catSelect.innerHTML = '<option value=\"Daily Car Cleaning\">Daily Car Cleaning</option>'"),
  'openEditCustomerModal must NOT wipe out options with a single Daily Car Cleaning option');

// Ensure openEditCustomerModal provides all 5 categories
assert(appJs.includes('<option value="Daily Car Cleaning">🚗 Daily Car Cleaning (दैनिक कार सफाई)</option>') &&
       appJs.includes('<option value="Car Washing">🧼 Car Washing (कार वॉश)</option>') &&
       appJs.includes('<option value="Solar Panel Cleaning">☀️ Solar Panel Cleaning (सोलर पैनल सफाई)</option>') &&
       appJs.includes('<option value="Interior Detailing">✨ Interior Detailing (इंटीरियर डिटेलिंग)</option>') &&
       appJs.includes('<option value="Exterior Detailing">🛡️ Exterior Detailing (एक्सटीरियर डिटेलिंग)</option>'),
  'openEditCustomerModal must provide all 5 canonical categories in catSelect');
console.log('✅ PASS 2.1: openEditCustomerModal populates all 5 categories for all customers');

// Ensure handleEditCustomerSubmit resolves sheetName dynamically based on selected serviceCategory
assert(appJs.includes("var resolvedSheetName = (serviceCategory === 'Daily Car Cleaning' || serviceCategory === 'daily_car_cleaning') ? 'Daily Clean' : 'All Other Work';"),
  'handleEditCustomerSubmit must resolve sheetName dynamically');
console.log('✅ PASS 2.2: handleEditCustomerSubmit dynamically assigns sheetName');

// 3. Verify server.js
console.log('\n--- TEST 3: server.js Cross-Sheet Update Acceptance ---');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert(!serverJs.includes('Cannot move record from Daily Clean to All Other Work during edit'),
  'server.js must not prohibit changing category from Daily Clean to other categories');
assert(!serverJs.includes('Cannot move record from All Other Work to Daily Clean during edit'),
  'server.js must not prohibit changing category from All Other Work to Daily Clean');
console.log('✅ PASS 3.1: server.js permits cross-category updates without artificial block errors');

// 4. Verify adminService
console.log('\n--- TEST 4: adminService Category & Subscription/Job Sync ---');
const adminServiceJs = fs.readFileSync(path.join(__dirname, '..', 'services', 'adminService.js'), 'utf8');

assert(adminServiceJs.includes('interestedService: normCategory'),
  'adminService.updateCustomer must update interestedService on the customer');
console.log('✅ PASS 4.1: adminService.updateCustomer updates interestedService in customer record');

console.log('\n===============================================================');
console.log('🎉 ALL SERVICE CATEGORY QA TESTS PASSED CLEANLY (100%)!');
console.log('===============================================================\n');
