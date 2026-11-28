'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'services/adminService.js'), 'utf8');
const hybridRouter = fs.readFileSync(path.join(root, 'services/seeApiRouter.js'), 'utf8');
const hybrid = fs.readFileSync(path.join(root, 'services/hybridPackageService.js'), 'utf8');
const doc = fs.readFileSync(path.join(root, 'docs/architecture/CWP_PACKAGE_CATALOGUE_ALIGNMENT.md'), 'utf8');

assert.ok(/function markEditPackageAsDisplayOnly\(\)/.test(app));
assert.ok(/pkgSelect\.disabled = true/.test(app));
assert.ok(/categorySelect\.disabled = true/.test(app));
assert.ok(/profileOnly: true/.test(app));
assert.ok(/Current service and legacy package label \(display only\)/.test(app));
assert.ok(/Hybrid memberships require Hybrid provisioning/.test(app));
assert.ok(/function handleEditCategoryChange\(cat\)/.test(app));
assert.ok(/function openEditCustomerModal\(index, triggerEl\)/.test(app));
assert.match(admin, /interestedService: normCategory/);
const updateStart = admin.indexOf('async function updateCustomer(');
const updateEnd = admin.indexOf('\n/**', updateStart + 1);
const updateFlow = admin.slice(updateStart, updateEnd);
assert.match(updateFlow, /to_regclass\('public\.hybrid_packages'\)/,
  'legacy updates remain compatible with databases before the Hybrid migration');
assert.match(updateFlow, /HYBRID_PACKAGE_REQUIRES_ORCHESTRATION/);
assert.match(updateFlow, /lower\(package_code\) = lower\(\$1\) OR lower\(name\) = lower\(\$1\)/,
  'hybrid names and codes cannot be routed through the legacy customer update path');
assert.match(updateFlow, /if \(!custData\.profileOnly && \(custData\.packageType \|\| custData\.packageName\)\)/);
assert.match(updateFlow, /else if \(!custData\.profileOnly\)/,
  'profile-only edits do not create or mutate service/package records');
assert.match(hybridRouter, /pathname === '\/api\/see\/hybrid\/purchases'/);
assert.match(hybrid, /async function purchase\(/);
assert.match(doc, /Hybrid purchase orchestration only/);
assert.match(doc, /not migrated or rewritten/);

console.log('PASS package catalogue alignment safeguards');
