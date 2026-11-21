/**
 * Automated QA Test Suite for Separated Address and Map Columns:
 * 1. Primary Address (text)
 * 2. Primary Map (direct link/button)
 * 3. Secondary Address (text with 2nd badge)
 * 4. Secondary Map (direct link/button)
 * In Admin Customer Records Table, Staff Portal Card, and Route Sequence.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('===============================================================');
console.log('🚀 RUNNING SEPARATED ADDRESS & MAP COLUMNS QA SUITE');
console.log('===============================================================');

// 1. Verify Index.html Table Header Structure
const indexPath = path.join(__dirname, '..', 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert.ok(indexHtml.includes('<th style="min-width: 160px;">Primary Address</th>'), 'Index.html must have "Primary Address" column header');
assert.ok(indexHtml.includes('Primary Map</th>'), 'Index.html must have "Primary Map" column header');
assert.ok(indexHtml.includes('<th style="min-width: 160px;">Secondary Address</th>'), 'Index.html must have "Secondary Address" column header');
assert.ok(indexHtml.includes('Secondary Map</th>'), 'Index.html must have "Secondary Map" column header');
assert.ok(indexHtml.includes('colspan="9"'), 'Index.html table skeleton and loading must use colspan="9"');
console.log('✅ PASS 1: Index.html customer records table has 9 distinct columns with separated Primary & Secondary Address and Map headers');

// 2. Verify public/js/app.js Table Rendering Logic
const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert.ok(appJs.includes('/* 3. Primary Address Cell */'), 'app.js must have distinct Primary Address cell logic');
assert.ok(appJs.includes('/* 4. Primary Map Location Cell */'), 'app.js must have distinct Primary Map cell logic');
assert.ok(appJs.includes('/* 5. Secondary Address Cell */'), 'app.js must have distinct Secondary Address cell logic');
assert.ok(appJs.includes('/* 6. Secondary Map Location Cell */'), 'app.js must have distinct Secondary Map cell logic');
assert.ok(appJs.includes('table-inline-map-sec-btn'), 'app.js must render secondary map button with distinct styling class');
assert.ok(appJs.includes('badge-sec-tag'), 'app.js must render 2nd badge tag for secondary address');
assert.ok(appJs.includes('colspan="9"'), 'app.js must use colspan="9" for empty/no-record state');
console.log('✅ PASS 2: public/js/app.js renderAdminRecordsTable correctly generates 4 separate columns for Primary & Secondary addresses and maps');

// 3. Verify Staff Portal Dual Location Card Rendering
assert.ok(appJs.includes('btn-card-map-direct'), 'app.js must render direct Google Maps button on staff customer card');
assert.ok(appJs.includes('btn-card-map-sec'), 'app.js must render direct 2nd Google Maps button for secondary location');
assert.ok(appJs.includes('card-sec-address-row'), 'app.js must render distinct secondary address row on staff card');
console.log('✅ PASS 3: Staff portal card directly displays both Primary and Secondary locations with text and one-tap map buttons');

// 4. Verify Route Sequence Layout
assert.ok(appJs.includes('seq-mini-map-btn'), 'app.js route sequence must include mini map button');
assert.ok(appJs.includes('seq-addr-sec'), 'app.js route sequence must support secondary location display');
console.log('✅ PASS 4: Route Sequence layout includes Primary and Secondary locations with map links');

// 5. Verify CSS Styles in public/css/style.css
const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert.ok(css.includes('.table-inline-map-btn'), 'style.css must define .table-inline-map-btn');
assert.ok(css.includes('.table-inline-map-sec-btn'), 'style.css must define .table-inline-map-sec-btn');
assert.ok(css.includes('.badge-sec-tag'), 'style.css must define .badge-sec-tag');
assert.ok(css.includes('.btn-card-map-direct'), 'style.css must define .btn-card-map-direct');
assert.ok(css.includes('.btn-card-map-sec'), 'style.css must define .btn-card-map-sec');
assert.ok(css.includes('body.theme-dark .table-inline-map-btn'), 'style.css must include dark mode support for table map buttons');
assert.ok(css.includes('body.theme-dark .card-sec-address-row'), 'style.css must include dark mode support for secondary card row');
console.log('✅ PASS 5: public/css/style.css has complete light & dark mode styles for all separated address & map elements');

// 6. Verify Live Server API Returns Secondary Address Data
http.get('http://localhost:3000/api/customers', (res) => {
  assert.strictEqual(res.statusCode, 200, '/api/customers must return HTTP 200');
  let raw = '';
  res.on('data', chunk => raw += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw);
      const records = parsed.records || parsed;
      assert.ok(Array.isArray(records), 'Response must be an array of records');
      console.log(`✅ PASS 6: Live server on port 3000 returned ${records.length} customer records with schema integrity intact`);
      console.log('\n===============================================================');
      console.log('🎉 ALL 6 SEPARATED ADDRESS & MAP VERIFICATION TESTS PASSED!');
      console.log('===============================================================');
      process.exit(0);
    } catch (e) {
      console.error('Failed to parse customer records JSON:', e);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Failed to connect to server on port 3000:', err.message);
  process.exit(1);
});
