/**
 * CWP Detailers & Motors - Rate Card & Brand Logos Verification QA
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🚀 RUNNING CWP RATE CARD & DETAILING BRANDS QA TEST SUITE');
console.log('===============================================================');

// 1. Check Brand SVG Assets
console.log('\n--- Test 1: Professional Detailing Brand SVGs ---');
const brands = ['3m.svg', 'turtlewax.svg', 'meguiars.svg', 'wavex.svg', 'glasspaints.svg', 'luminor.svg'];
for (const b of brands) {
  const filePath = path.join(__dirname, '../public/images/brands', b);
  assert.ok(fs.existsSync(filePath), `Brand asset ${b} must exist in public/images/brands/`);
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('<svg'), `${b} must be valid SVG markup`);
}
console.log('✅ PASS 1: All 6 professional detailing brand SVG assets verified (3M, Turtle Wax, Meguiar\'s, WaveX, Glasspaints, Luminor)');

// 2. Check DOM Elements in home.html
console.log('\n--- Test 2: Rate Card HTML Markup & Elements ---');
const homeHtml = fs.readFileSync(path.join(__dirname, '../public/home.html'), 'utf8');
assert.ok(homeHtml.includes('subtabDcc'), 'home.html must include DCC subsegment tab');
assert.ok(homeHtml.includes('subtabWash'), 'home.html must include Doorstep Wash subsegment tab');
assert.ok(homeHtml.includes('vPill5Seater'), 'home.html must include 5-Seater vehicle selector');
assert.ok(homeHtml.includes('vPill5PlusSeater'), 'home.html must include 5+ Seater vehicle selector');
assert.ok(homeHtml.includes('detailingHighlightsWrap'), 'home.html must include detailing highlights');
assert.ok(homeHtml.includes('brandsShowcaseWrap'), 'home.html must include brands showcase');
assert.ok(homeHtml.includes('GST additional'), 'home.html must state "GST additional"');
assert.ok(homeHtml.includes('₹11,999'), 'home.html must include Ceramic Coating starting price ₹11,999');
assert.ok(homeHtml.includes('₹1,499'), 'home.html must include Interior Detailing starting price ₹1,499');
console.log('✅ PASS 2: Rate card DOM elements, 2-part car subsegments, detailing callouts & GST notices verified in home.html');

// 3. Check public/js/home.js Client Logic
console.log('\n--- Test 3: Client JavaScript Rate Card Logic ---');
const homeJs = fs.readFileSync(path.join(__dirname, '../public/js/home.js'), 'utf8');
assert.ok(homeJs.includes('window.setCarSubSegment'), 'home.js must expose setCarSubSegment');
assert.ok(homeJs.includes('window.setVehicleCategory'), 'home.js must expose setVehicleCategory');
assert.ok(homeJs.includes('1100') && homeJs.includes('1500') && homeJs.includes('2000'), 'home.js must include 5-Seater DCC rates 1100, 1500, 2000');
assert.ok(homeJs.includes('1200') && homeJs.includes('1600') && homeJs.includes('2200'), 'home.js must include 5+ Seater DCC rates 1200, 1600, 2200');
assert.ok(homeJs.includes('600') && homeJs.includes('700'), 'home.js must include Doorstep Wash one-time rates 600, 700');
assert.ok(homeJs.includes('1800') && homeJs.includes('2100'), 'home.js must include Car Wash 4-wash subscription rates 1800, 2100');
assert.ok(homeJs.includes('solar-matrix-table'), 'home.js must render solar matrix table');
assert.ok(homeJs.includes('साइट विजिट के बाद फैसला लिया जाएगा'), 'home.js must render Hindi quote decision for 100+ panels');
console.log('✅ PASS 3: Complete rate card logic, DCC 5-seater vs 5+ seater, wash subscriptions, and solar matrix verified in home.js');

// 4. Live Server HTTP API Rate Card Config
console.log('\n--- Test 4: Live Server /api/public/homepage-config ---');
const req = http.get('http://127.0.0.1:3000/api/public/homepage-config', (res) => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    assert.strictEqual(res.statusCode, 200, 'Config API must return 200');
    const json = JSON.parse(body);

    // Car Care DCC rates
    assert.strictEqual(json.rates.carCare.dcc.fiveSeater.basic, 1100);
    assert.strictEqual(json.rates.carCare.dcc.fiveSeater.silver, 1500);
    assert.strictEqual(json.rates.carCare.dcc.fiveSeater.gold, 2000);

    assert.strictEqual(json.rates.carCare.dcc.fivePlusSeater.basic, 1200);
    assert.strictEqual(json.rates.carCare.dcc.fivePlusSeater.silver, 1600);
    assert.strictEqual(json.rates.carCare.dcc.fivePlusSeater.gold, 2200);

    // Car Care Doorstep Wash rates
    assert.strictEqual(json.rates.carCare.wash.fiveSeater.oneTime, 600);
    assert.strictEqual(json.rates.carCare.wash.fiveSeater.subscription4, 1800);
    assert.strictEqual(json.rates.carCare.wash.fivePlusSeater.oneTime, 700);
    assert.strictEqual(json.rates.carCare.wash.fivePlusSeater.subscription4, 2100);

    // Detailing
    assert.strictEqual(json.rates.carCare.detailing.ceramicCoatingStarts, 11999);
    assert.strictEqual(json.rates.carCare.detailing.interiorDetailingStarts, 1499);

    // Solar Care
    assert.strictEqual(json.rates.solarCare.oneTime.tier1_30, 60);
    assert.strictEqual(json.rates.solarCare.oneTime.tier30_100, 50);
    assert.strictEqual(json.rates.solarCare.oneTime.minBilling, 800);
    assert.strictEqual(json.rates.solarCare.amc6Month.tier1_30, 50);
    assert.strictEqual(json.rates.solarCare.amc6Month.tier30_100, 45);
    assert.strictEqual(json.rates.solarCare.amc12Month.tier1_30, 45);
    assert.strictEqual(json.rates.solarCare.amc12Month.tier30_100, 40);

    // GST
    assert.strictEqual(json.gst.label, 'GST additional');

    console.log('✅ PASS 4: Live server returns 100% accurate rate card JSON matching user requirements');

    console.log('\n===============================================================');
    console.log('🎉 ALL 4 RATE CARD & DETAILING BRAND QA TESTS PASSED CLEANLY (100%)!');
    console.log('===============================================================');
  });
});

req.on('error', (err) => {
  console.error('Test 4 Error connecting to server:', err.message);
  process.exit(1);
});
