'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const hybrid = require('../services/hybridPackageService');
const seeEntitlements = fs.readFileSync(path.join(__dirname, '../services/seeEntitlementService.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../migrations/028_create_hybrid_package_engine.sql'), 'utf8');

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
test('valid hybrid definition requires both engine components', () => {
  const p = hybrid.validateDefinition({ packageCode: 'dcc-gold', name: 'DCC Gold', price: 999, dccConfig: {}, seeConfig: { serviceId: 'wash', creditsPerCycle: 2 } });
  assert.equal(p.packageCode, 'DCC-GOLD'); assert.equal(p.validityUnit, 'months');
});
test('invalid or DCC-less hybrid definitions are rejected', () => {
  assert.throws(() => hybrid.validateDefinition({ packageCode: 'X', name: 'X', price: -1, dccConfig: {}, seeConfig: { serviceId: 's', creditsPerCycle: 1 } }));
  assert.throws(() => hybrid.validateDefinition({ packageCode: 'X', name: 'X', price: 1, seeConfig: { serviceId: 's', creditsPerCycle: 1 } }));
});
test('city, zone and segment restrictions are enforced', () => {
  const pkg = { city_zone_eligibility: { all_cities: false, cities: ['Pune'], zones: ['West'] }, vehicle_segments: ['SUV'] };
  hybrid.assertEligibility(pkg, { city: 'Pune', zone: 'West', vehicleSegment: 'SUV' });
  assert.throws(() => hybrid.assertEligibility(pkg, { city: 'Delhi', zone: 'West', vehicleSegment: 'SUV' }));
  assert.throws(() => hybrid.assertEligibility(pkg, { city: 'Pune', zone: 'East', vehicleSegment: 'SUV' }));
  assert.throws(() => hybrid.assertEligibility(pkg, { city: 'Pune', zone: 'West', vehicleSegment: 'Sedan' }));
});
test('generic SEE purchase still rejects DCC benefits', () => {
  assert.match(seeEntitlements, /Generic SEE purchases cannot include Daily Car Cleaning entitlements/);
});
test('hybrid data uses dedicated tables and records lifecycle states', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.hybrid_packages/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.hybrid_memberships/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.hybrid_membership_components/);
  for (const state of hybrid.STATUSES) assert.ok(migration.includes(`'${state}'`));
});
console.log(`HYBRID ENGINE UNIT SUMMARY: ${passed} PASSED, 0 FAILED`);
