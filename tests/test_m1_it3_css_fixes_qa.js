const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🚀 RUNNING M1 ITERATION 3 TARGETED CSS FIXES QA SUITE');
console.log('===============================================================');

const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// TEST 1: No duplicate .ops-club-btn with 9px 14px padding
console.log('\n--- TEST 1: Duplicate .ops-club-btn Block Elimination ---');
const duplicateMatch = cssContent.match(/\.ops-club-btn\s*\{[^}]*padding:\s*9px\s*14px/s);
assert.strictEqual(duplicateMatch, null, '1.1 Duplicate .ops-club-btn with padding 9px 14px must NOT exist');

// Verify compact .ops-club-btn styling preserved
assert.ok(cssContent.includes('padding: 2px 8px !important;'), '1.2 Compact padding 2px 8px must exist');
assert.ok(cssContent.includes('height: 22px !important;'), '1.3 Compact height 22px must exist');
assert.ok(cssContent.includes('font-size: 11px !important;'), '1.4 Compact font-size 11px must exist');
console.log('✅ PASS 1: Duplicate .ops-club-btn eliminated; compact 22px button styling preserved.');

// TEST 2: .quick-chip-group wrapping and 320px containment
console.log('\n--- TEST 2: .quick-chip-group Flex-Wrap & Max-Width Containment ---');
const allChipRules = cssContent.match(/(?:^|\n)\s*\.quick-chip-group\s*\{[^}]+\}/g) || [];
assert.ok(allChipRules.length >= 2, '2.1 .quick-chip-group base rules must exist');

allChipRules.forEach((rule, idx) => {
  assert.ok(rule.includes('flex-wrap: wrap'), `2.2 Rule ${idx + 1} must include flex-wrap: wrap`);
  assert.ok(rule.includes('max-width: 100%'), `2.3 Rule ${idx + 1} must include max-width: 100%`);
});
console.log('✅ PASS 2: .quick-chip-group has flex-wrap: wrap and max-width: 100% across all base declarations.');

// TEST 3: Mobile media query rules for .quick-chip-group and .btn-quick-chip
console.log('\n--- TEST 3: Mobile Breakpoint Rules (max-width: 640px) ---');
const mobile640Index = cssContent.lastIndexOf('@media (max-width: 640px)');
assert.ok(mobile640Index !== -1, '3.1 @media (max-width: 640px) block exists');
const mobileSlice = cssContent.slice(mobile640Index, mobile640Index + 2500);

assert.ok(mobileSlice.includes('.quick-chip-group'), '3.2 Mobile breakpoint contains .quick-chip-group');
assert.ok(mobileSlice.includes('flex-wrap: wrap !important'), '3.3 Mobile .quick-chip-group wraps flex items');
assert.ok(mobileSlice.includes('.btn-quick-chip'), '3.4 Mobile breakpoint contains .btn-quick-chip');
assert.ok(mobileSlice.includes('flex: 1 1 auto !important'), '3.5 Mobile .btn-quick-chip allows fluid flex reflow');
assert.ok(mobileSlice.includes('.reports-filter-panel'), '3.6 Mobile breakpoint contains .reports-filter-panel containment');
console.log('✅ PASS 3: Mobile @media (max-width: 640px) responsive wrap rules verified.');

console.log('\n===============================================================');
console.log('🎉 ALL M1 ITERATION 3 TARGETED CSS FIXES PASSED (100%)!');
console.log('===============================================================\n');
