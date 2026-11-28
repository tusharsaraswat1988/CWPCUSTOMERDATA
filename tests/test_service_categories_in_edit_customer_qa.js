'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/admin-v2/index.html'), 'utf8');
const customers = fs.readFileSync(path.join(root, 'public/admin-v2/js/v2-customers.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'services/adminService.js'), 'utf8');

const categories = ['Daily Car Cleaning', 'Car Washing', 'Solar Panel Cleaning', 'Interior Detailing', 'Exterior Detailing'];
const categorySelect = html.match(/<select id="v2EditCustCategory"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(categorySelect, 'Admin V2 Customer Edit must render the service category control');
for (const category of categories) assert.ok(categorySelect[1].includes(`value="${category}"`), `missing ${category}`);

assert.match(customers, /function openEditCustomerModal\(cust = null\)/);
assert.match(customers, /overlay\.open\('v2ModalEditCustomer'\)/, 'customer edit modal remains openable');
assert.match(customers, /function setCustomerEditIdentityDisplayOnly\(/);
assert.match(customers, /select\.disabled = true/);
assert.match(customers, /new Option\(value, value\)/, 'unmapped legacy labels are preserved in the display');
assert.match(customers, /profileOnly: true/);
assert.match(customers, /request\('updateCustomer', \{ customerData: updatedData \}\)/);
for (const id of ['v2EditCustName', 'v2EditCustPhone', 'v2EditCustAddress', 'v2EditCustNotes']) {
  const field = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`));
  assert.ok(field && !/\sdisabled(?:\s|=|>)/i.test(field[0]), `${id} must remain editable`);
}

const updateStart = admin.indexOf('async function updateCustomer(');
const updateEnd = admin.indexOf('\n/**', updateStart + 1);
const updateFlow = admin.slice(updateStart, updateEnd);
assert.match(updateFlow, /if \(!custData\.profileOnly && \(custData\.packageType \|\| custData\.packageName\)\)/);
assert.match(updateFlow, /else if \(!custData\.profileOnly\)/, 'profile saves do not mutate DCC/job assignment records');
assert.match(updateFlow, /HYBRID_PACKAGE_REQUIRES_ORCHESTRATION/);

console.log('Customer Edit QA: 9 passed (category rendering, modal open, display-only identity, legacy fallback, editable profile fields, profile-only save)');
