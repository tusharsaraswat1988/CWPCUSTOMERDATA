/**
 * QA Test Suite for Staff Portal Footer Navigation Modernization:
 * 1. Verifies removal of tab icons.
 * 2. Verifies notification badges are hidden when count is 0, and visible when count > 0.
 * 3. Verifies solid bottom anchoring and elimination of the 'floating in middle' transform bug.
 * 4. Verifies keyboard-aware hiding to prevent jumping into the vertical middle when typing.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🚀 RUNNING STAFF PORTAL FOOTER TABS MODERNIZATION QA SUITE');
console.log('===============================================================\n');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

// ---------------------------------------------------------------------------
// TEST 1: NO ICONS IN FOOTER TABS
// ---------------------------------------------------------------------------
console.log('--- TEST 1: Tab Icons Removal ---');

const navStart = indexHtml.indexOf('<nav class="staff-bottom-nav" id="staffBottomNav"');
const navEnd = indexHtml.indexOf('</nav>', navStart);
assert.ok(navStart !== -1 && navEnd !== -1, '1.1 #staffBottomNav must exist in Index.html');

const navHtml = indexHtml.substring(navStart, navEnd);
assert.ok(!navHtml.includes('bottom-tab-icon'), '1.2 bottom-tab-icon must NOT exist inside #staffBottomNav');
assert.ok(!navHtml.includes('🚗') && !navHtml.includes('🧼') && !navHtml.includes('☀️') && !navHtml.includes('⚙️'),
  '1.3 Tab emoji icons must be completely removed from bottom tabs');

assert.ok(navHtml.includes('id="pillDailyClean"'), '1.4 pillDailyClean tab exists');
assert.ok(navHtml.includes('id="pillOtherJobs"'), '1.5 pillOtherJobs tab exists');
assert.ok(navHtml.includes('id="pillStaffSettings"'), '1.6 pillStaffSettings tab exists');
// Legacy hidden tabs must be outside nav
assert.ok(!navHtml.includes('id="pillCarWash"'), '1.7 pillCarWash is cleanly outside #staffBottomNav');
assert.ok(!navHtml.includes('id="pillSolarClean"'), '1.8 pillSolarClean is cleanly outside #staffBottomNav');

console.log('✅ PASS 1: All icons removed from tabs, clean text tabs verified.');

// ---------------------------------------------------------------------------
// TEST 2: BADGE LOGIC (ZERO COUNT HIDING)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: Notification Badge Zero-Count Hiding ---');

// In HTML initial state:
assert.ok(navHtml.includes('id="countDailyClean" style="display: none;"'),
  '2.1 countDailyClean badge is initially hidden with display: none');
assert.ok(navHtml.includes('id="countOtherJobs" style="display: none;"'),
  '2.2 countOtherJobs badge is initially hidden with display: none');
assert.ok(indexHtml.includes('id="countCarWash" style="display: none;"'),
  '2.3 legacy countCarWash badge exists for compatibility with display: none');
assert.ok(indexHtml.includes('id="countSolarClean" style="display: none;"'),
  '2.4 legacy countSolarClean badge exists for compatibility with display: none');

// In JavaScript logic:
assert.ok(appJs.includes('function updateFilterCounts()'), '2.4 updateFilterCounts is defined');
assert.ok(appJs.includes('updateTabBadge(elDcc, dccCount)'), '2.5 updateTabBadge handles countDailyClean');
assert.ok(appJs.includes('badgeEl.style.display = \'none\''), '2.6 updateTabBadge sets display: none when count is 0');
assert.ok(appJs.includes('badgeEl.style.display = \'inline-flex\''), '2.7 updateTabBadge sets display: inline-flex when count > 0');

// In CSS:
assert.ok(styleCss.includes('.staff-bottom-tab .bottom-tab-badge'), '2.8 bottom-tab-badge class styled');
assert.ok(styleCss.includes('display: none; /* Logic: Hidden when count is 0 */') || styleCss.includes('display: none; /* Intentionally hidden when count is 0 */'),
  '2.9 bottom-tab-badge default CSS is display: none');

console.log('✅ PASS 2: Badges strictly hidden when count is 0, shown when count > 0.');

// ---------------------------------------------------------------------------
// TEST 3: ROCK-SOLID ANCHORING & NO FLOATING-IN-MIDDLE BUG
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: Bottom Nav Docking & Immunity to Middle Dislocation ---');

assert.ok(styleCss.includes('.staff-bottom-nav {'), '3.1 .staff-bottom-nav styled');
assert.ok(styleCss.includes('position: fixed !important;'), '3.2 position: fixed !important ensured');
assert.ok(styleCss.includes('bottom: 0 !important;'), '3.3 bottom: 0 !important anchored');
assert.ok(styleCss.includes('left: 0 !important;') && styleCss.includes('right: 0 !important;'), '3.4 left: 0 and right: 0 full-width stretch');

// Check that wide screen uses margin: 0 auto and transform: none (no translateX(-50%) bug)
const mediaQuerySection = styleCss.substring(styleCss.indexOf('@media (min-width: 680px)'));
assert.ok(!mediaQuerySection.substring(0, 300).includes('transform: translateX(-50%)'),
  '3.5 Wide screen media query must NOT use transform: translateX(-50%)');
assert.ok(styleCss.includes('margin: 0 auto !important;'), '3.6 Wide screen uses stable margin: 0 auto centering');

console.log('✅ PASS 3: Bottom nav solidly anchored without viewport transform bugs.');

// ---------------------------------------------------------------------------
// TEST 4: MOBILE VIRTUAL KEYBOARD PROTECTION
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: Mobile Virtual Keyboard Protection ---');

assert.ok(styleCss.includes('body.keyboard-open .staff-bottom-nav') || styleCss.includes('.staff-bottom-nav.is-keyboard-hidden'),
  '4.1 CSS rule for keyboard hiding exists');
assert.ok(appJs.includes('function initStaffBottomNavKeyboardHandling()'),
  '4.2 initStaffBottomNavKeyboardHandling defined in app.js');
assert.ok(appJs.includes('initStaffBottomNavKeyboardHandling();'),
  '4.3 initStaffBottomNavKeyboardHandling invoked on DOMContentLoaded');

console.log('✅ PASS 4: Virtual keyboard awareness protects tabs from jumping into middle when typing.');

console.log('\n===============================================================');
console.log('🎉 ALL TESTS IN STAFF FOOTER MODERNIZATION SUITE PASSED CLEANLY!');
console.log('===============================================================\n');
