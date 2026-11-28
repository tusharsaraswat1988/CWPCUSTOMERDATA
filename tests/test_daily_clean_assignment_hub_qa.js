/**
 * Admin V2 recurring DCC schedule assignment QA.
 * Verifies the active Admin V2 route, schedule UI, handlers, and backend API ownership.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('server.js');
const html = read('public/admin-v2/index.html');
const app = read('public/admin-v2/js/v2-app.js');
const assignments = read('public/admin-v2/js/v2-assign-jobs.js');
const customers = read('public/admin-v2/js/v2-customers.js');
const staff = read('public/admin-v2/js/v2-staff.js');
const sequence = read('public/admin-v2/js/v2-sequence.js');
const seeExecution = read('services/seeExecutionService.js');
const adminService = require('../services/adminService');

// Active runtime ownership: /admin serves Admin V2, not the retired Legacy Admin UI.
assert.match(server, /public', 'admin-v2', 'index\.html'/);
assert.match(html, /id="v2View_jobAssignment"[^>]*aria-label="DCC Schedule Assignments"/);
assert.match(html, /v2-assign-jobs\.js/);
assert.match(app, /CWP_ADMIN_V2\.assignJobs\.init\(\)/);

// The DCC hub retains both roster and staff workload views and its schedule forms.
for (const id of [
  'v2AjTabRoster', 'v2AjTabStaff', 'v2AjTableBody',
  'v2AjAssignForm', 'v2AjUnassignForm', 'v2AjModalStaffSelect',
  'v2AjModalBtnSubmit', 'v2AjModalBtnUnassign'
]) assert.ok(html.includes(`id="${id}"`), `${id} exists in the active DCC schedule hub`);
assert.match(assignments, /data-aj-action="assign"/);
assert.match(assignments, /data-aj-action="unassign"/);
assert.match(assignments, /api\.request\('getDailyCleanAssignments'/);
assert.match(assignments, /api\.request\('assignDailyCleanCustomer'/);
assert.match(assignments, /api\.request\('unassignDailyCleanCustomer'/);
assert.match(customers, /title="Assign DCC Schedule"/);
assert.match(staff, /title="Assign DCC Schedule"/);
assert.match(html, /<span>Assign DCC Schedule<\/span>/);

// Keep recurring DCC schedule APIs and route assignment while guarding SEE isolation.
assert.equal(typeof adminService.assignDailyCleanCustomer, 'function');
assert.equal(typeof adminService.unassignDailyCleanCustomer, 'function');
assert.equal(typeof adminService.getDailyCleanAssignments, 'function');
assert.match(server, /assignDailyCleanCustomer/);
assert.match(server, /unassignDailyCleanCustomer/);
assert.match(server, /getDailyCleanAssignments/);
assert.match(sequence, /assignStaffToRoute/);
assert.match(sequence, /unassignStaffFromRoute/);
assert.match(seeExecution, /Daily Car Cleaning jobs must use the dedicated DCC workflow/);

console.log('Admin V2 recurring DCC schedule assignment QA passed.');
