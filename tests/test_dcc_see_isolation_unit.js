'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repos = require('../db/repositories');
const catalogue = require('../services/seeCatalogueService');
const execution = require('../services/seeExecutionService');
const entitlement = require('../services/seeEntitlementService');

async function rejects(promise, message) {
  await assert.rejects(promise, new RegExp(message, 'i'));
}

async function run() {
  let passed = 0;
  const check = (condition, label) => { assert.ok(condition, label); passed += 1; };
  await rejects(catalogue.createService({ serviceCode: 'X1', name: 'Wash', serviceCategoryId: 'daily_car_cleaning' }), 'dedicated DCC'); passed++;
  await rejects(catalogue.createService({ serviceCode: 'DCC_DAILY', name: 'Wash', serviceCategoryId: 'car_washing' }), 'dedicated DCC'); passed++;
  await rejects(catalogue.createService({ serviceCode: 'SVC-DCC-1', name: 'Wash', serviceCategoryId: 'car_washing' }), 'dedicated DCC'); passed++;
  check(catalogue.isDccService({ service_category_id: 'DCC' }), 'DCC category aliases are recognized');
  check(catalogue.isDccService({ name: 'Daily Car Cleaning (DCC)' }), 'DCC service name aliases are recognized');
  check(catalogue.isDccService({ execution_config: '{"dcc_isolated":true}' }), 'DCC isolation configuration is recognized');

  const oldFind = repos.seeCatalogue.findServiceById;
  const oldFindByCode = repos.seeCatalogue.findServiceByCode;
  const oldFindAddonById = repos.seeCatalogue.findAddonById;
  const oldFindPackageByCode = repos.seeCatalogue.findPackageByCode;
  repos.seeCatalogue.findServiceById = async () => ({ id: 'legacy', status: 'active', service_category_id: 'daily_car_cleaning', service_code: 'DCC_DAILY', name: 'Daily Car Cleaning' });
  repos.seeCatalogue.findServiceByCode = repos.seeCatalogue.findServiceById;
  repos.seeCatalogue.findPackageByCode = async () => null;
  try {
    await rejects(catalogue.updateService('legacy', { name: 'Renamed' }), 'dedicated DCC'); passed++;
    await rejects(execution.createCanonicalJob({ customerId: 'c', locationId: 'l', serviceIdOrCode: 'legacy' }), 'dedicated DCC workflow'); passed++;
    await rejects(execution.assertNotDccGenericJob({ id: 'job', service_id: 'legacy', service_category_id: 'car_washing' }), 'dedicated DCC workflow'); passed++;
    await rejects(catalogue.createPackage({ packageCode: 'DCC-PKG', name: 'Invalid package', mainServiceId: 'legacy' }), 'isolated from generic SEE packages'); passed++;
    await rejects(catalogue.createAddon({ addonCode: 'DCC-ADDON', name: 'Invalid add-on', applicableServiceIds: ['legacy'] }), 'cannot reference Daily Car Cleaning'); passed++;
    repos.seeCatalogue.findAddonById = async () => ({ id: 'addon', applicable_service_ids: [] });
    await rejects(catalogue.updateAddon('addon', { applicableServiceIds: ['legacy'] }), 'cannot reference Daily Car Cleaning'); passed++;
    const originalDetail = catalogue.getPackageDetail;
    catalogue.getPackageDetail = async () => ({ status: 'active', benefits: [{ service_category_id: 'daily_car_cleaning', service_code: 'DCC_DAILY' }] });
    try {
      await rejects(entitlement.createPurchase({ customerId: 'c', packageIdOrCode: 'p', saleReference: 'test' }), 'cannot include Daily Car Cleaning'); passed++;
    } finally { catalogue.getPackageDetail = originalDetail; }
  } finally {
    repos.seeCatalogue.findServiceById = oldFind;
    repos.seeCatalogue.findServiceByCode = oldFindByCode;
    repos.seeCatalogue.findAddonById = oldFindAddonById;
    repos.seeCatalogue.findPackageByCode = oldFindPackageByCode;
  }

  const cap = require('../services/staffCapabilityService');
  check(JSON.stringify(cap.validateCapabilityCombination('dcc_only', [])).includes('daily_car_cleaning'), 'DCC-only work type requires DCC capability');
  assert.throws(() => cap.validateCapabilityCombination('dcc_only', ['daily_car_cleaning', 'car_washing']), /cannot have non-DCC/i); passed++;
  assert.deepStrictEqual(cap.validateCapabilityCombination('services_only', ['car_washing']).serviceCapabilities, ['car_washing']); passed++;

  const readUi = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const servicesUi = readUi('public/admin-v2/js/v2-see-services.js');
  const addonsUi = readUi('public/admin-v2/js/v2-see-addons.js');
  const packagesUi = readUi('public/admin-v2/js/v2-see-packages.js');
  check(servicesUi.includes("!['daily_car_cleaning', 'daily_clean', 'dcc'].includes(String(c.id).toLowerCase())"), 'SEE service category selector omits DCC aliases');
  check(servicesUi.includes('if (!isGenericSeeService(s)) return false;'), 'SEE service catalogue omits DCC records');
  check(addonsUi.includes('if (isDccService(s)) return false;') && addonsUi.includes('availableServiceIds.has(id)'), 'Add-on compatibility selector drops DCC and stale IDs');
  check(packagesUi.includes('allServices.filter(visibleService)') && packagesUi.includes('dccServiceIds.has(String(id))'), 'Package composition omits DCC services and compatible add-ons');
  console.log(`DCC/SEE isolation unit tests: ${passed} passed, 0 failed`);
}

run().catch(err => { console.error(err); process.exitCode = 1; });
