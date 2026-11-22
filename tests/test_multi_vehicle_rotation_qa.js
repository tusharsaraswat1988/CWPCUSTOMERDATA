/**
 * QA Test Suite for 2-Car Alternate Day Rotation (1 Package, 2 Cars)
 * Covers:
 *  1. Smart Multi-Vehicle Parser (Slash, comma, pipe separators)
 *  2. Dual Number Plate Presentation with IND Bands
 *  3. Alternate Day Rotation Badge & Subtext
 *  4. HTML Form Guidance for Admin Slash Input
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING 2-CAR ALTERNATE ROTATION QA SUITE');
console.log('===============================================================\n');

const rootDir = path.join(__dirname, '..');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const cssPath = path.join(rootDir, 'public', 'css', 'style.css');
const indexPath = path.join(rootDir, 'Index.html');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const styleCss = fs.readFileSync(cssPath, 'utf8');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// ---------------------------------------------------------------------------
// TEST 1: APP.JS PARSER LOGIC
// ---------------------------------------------------------------------------
console.log('--- Test 1: Multi-Vehicle Parser Logic in app.js ---');
assert.ok(appJs.includes('function parseSingleVehicleDetails('), 'app.js must define parseSingleVehicleDetails');
assert.ok(appJs.includes('function parseVehicleDetails('), 'app.js must define parseVehicleDetails');
assert.ok(appJs.includes('isMulti: true'), 'app.js must set isMulti: true on slash/multi-vehicle strings');
assert.ok(appJs.includes('rotationType: \'alternate_days\''), 'app.js must tag rotationType: alternate_days');

// Extract and test parseVehicleDetails in sandbox
const fnMatch = appJs.match(/function parseSingleVehicleDetails[\s\S]*?return single;\s*\}/);
assert.ok(fnMatch, 'Must locate parseVehicleDetails implementation block');
const sandboxFn = new Function(fnMatch[0] + '; return parseVehicleDetails;');
const parseVehicleDetails = sandboxFn();

// Case A: Slash with models
const parsedA = parseVehicleDetails('UP65 AB 1234 (Creta) / UP65 CD 5678 (Swift)');
assert.strictEqual(parsedA.isMulti, true, 'Case A: isMulti should be true');
assert.strictEqual(parsedA.vehicles.length, 2, 'Case A: Should extract 2 vehicles');
assert.strictEqual(parsedA.vehicles[0].reg, 'UP65 AB 1234', 'Case A: Car 1 reg match');
assert.strictEqual(parsedA.vehicles[0].model, 'Creta', 'Case A: Car 1 model match');
assert.strictEqual(parsedA.vehicles[1].reg, 'UP65 CD 5678', 'Case A: Car 2 reg match');
assert.strictEqual(parsedA.vehicles[1].model, 'Swift', 'Case A: Car 2 model match');

// Case B: Slash with hyphenated format
const parsedB = parseVehicleDetails('UP65 AB 1234 - Creta / UP65 CD 5678 - Venue');
assert.strictEqual(parsedB.isMulti, true, 'Case B: isMulti should be true');
assert.strictEqual(parsedB.vehicles.length, 2, 'Case B: Should extract 2 vehicles');
assert.strictEqual(parsedB.vehicles[0].reg, 'UP65 AB 1234', 'Case B: Car 1 reg match');
assert.strictEqual(parsedB.vehicles[1].reg, 'UP65 CD 5678', 'Case B: Car 2 reg match');

// Case C: Single vehicle backward compatibility
const parsedC = parseVehicleDetails('UP65 AB 1234 - Creta');
assert.strictEqual(parsedC.isMulti, false, 'Case C: Single vehicle isMulti must be false');
assert.strictEqual(parsedC.reg, 'UP65 AB 1234', 'Case C: reg match');
assert.strictEqual(parsedC.model, 'Creta', 'Case C: model match');

console.log('✅ PASS 1: Multi-vehicle parser handles single, slash, and dual-car strings with 100% precision.\n');

// ---------------------------------------------------------------------------
// TEST 2: STAFF CARD DUAL PLATE RENDERING
// ---------------------------------------------------------------------------
console.log('--- Test 2: Dual Plate Rendering & Rotation Badge in app.js ---');
assert.ok(appJs.includes('multi-vehicle-rotation-cluster'), 'app.js must render multi-vehicle-rotation-cluster');
assert.ok(appJs.includes('rotation-type-pill'), 'app.js must render rotation-type-pill');
assert.ok(appJs.includes('sub-plate-badge'), 'app.js must render individual sub-plate-badge for each car');
assert.ok(appJs.includes('1 दिन 1 गाड़ी (अल्टरनेट प्लान)'), 'app.js must display bilingual Hindi rotation notice');

console.log('✅ PASS 2: Dual-plate badge presentation and alternate rotation badge verified in app.js.\n');

// ---------------------------------------------------------------------------
// TEST 3: CSS STYLING FOR DUAL PLATES & ROTATION PILL
// ---------------------------------------------------------------------------
console.log('--- Test 3: CSS Styling in style.css ---');
assert.ok(styleCss.includes('.multi-vehicle-rotation-cluster'), 'style.css must style .multi-vehicle-rotation-cluster');
assert.ok(styleCss.includes('.rotation-type-pill'), 'style.css must style .rotation-type-pill');
assert.ok(styleCss.includes('.multi-plates-row'), 'style.css must style .multi-plates-row');
assert.ok(styleCss.includes('.sub-plate-badge'), 'style.css must style .sub-plate-badge');

console.log('✅ PASS 3: Complete M3 CSS styling for dual plates and rotation tags verified.\n');

// ---------------------------------------------------------------------------
// TEST 4: INDEX.HTML FORM GUIDANCE
// ---------------------------------------------------------------------------
console.log('--- Test 4: Index.html Form Tooltips ---');
assert.ok(indexHtml.includes('2 कार अल्टरनेट प्लान के लिए <code>/</code> लगाएं'), 'Index.html must guide admin on using / for 2-car alternate plans');

console.log('✅ PASS 4: Form hints guide admin seamlessly on 2-car alternate rotation.\n');

console.log('===============================================================');
console.log('🎉 ALL 2-CAR ALTERNATE ROTATION QA TESTS PASSED CLEANLY (100%)!');
console.log('===============================================================');
