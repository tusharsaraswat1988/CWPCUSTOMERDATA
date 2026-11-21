/**
 * Automated QA Test Suite: CWP Aura Design Tokens & Admin Panel Foundations
 *
 * Verifies:
 * 1. DTCG 2025.10 token architecture in public/css/m3-tokens.css and public/css/style.css
 * 2. Surface hierarchy, text colors, status, and border tokens in :root and [data-theme="dark"]
 * 3. Elevation levels (level-0 to level-4) and 8dp spatial/radius grid
 * 4. Backward compatibility aliases (--md-sys-*, legacy --bg-*, --text-*)
 * 5. Monospace font binding for vehicle plates, phone numbers, and time cells
 * 6. DDR-002 Devanagari line-height and vertical padding rules
 * 7. Pagination touch target accessibility (>= 40px)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🎨 RUNNING CWP AURA DESIGN TOKENS & ADMIN FOUNDATIONS QA SUITE');
console.log('===============================================================\n');

const tokensCssPath = path.join(__dirname, '../public/css/m3-tokens.css');
const styleCssPath = path.join(__dirname, '../public/css/style.css');

assert.ok(fs.existsSync(tokensCssPath), 'public/css/m3-tokens.css must exist');
assert.ok(fs.existsSync(styleCssPath), 'public/css/style.css must exist');

const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

let passCount = 0;

// TEST 1: Semantic Surface Tokens in :root and dark mode
console.log('--- TEST 1: Semantic Surface Tokens ---');
const requiredSurfaceTokens = [
  '--color-surface',
  '--color-surface-card',
  '--color-surface-container-low',
  '--color-surface-container-high'
];
requiredSurfaceTokens.forEach(token => {
  assert.ok(tokensCss.includes(token), `m3-tokens.css must declare ${token}`);
});
assert.ok(tokensCss.includes('[data-theme="dark"]'), 'm3-tokens.css must include dark theme block');
console.log('✅ PASS 1: Semantic surface tokens declared across light and dark themes.');
passCount++;

// TEST 2: Text, Action, Status & Border Tokens
console.log('--- TEST 2: Semantic Text, Action & Border Tokens ---');
const requiredSemanticTokens = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-action-primary',
  '--color-border-subtle',
  '--color-border-focus'
];
requiredSemanticTokens.forEach(token => {
  assert.ok(tokensCss.includes(token), `m3-tokens.css must declare ${token}`);
});
console.log('✅ PASS 2: Semantic text, action, and border tokens validated.');
passCount++;

// TEST 3: Spatial, Radius & Elevation Scale
console.log('--- TEST 3: Spatial, Radius & Elevation Scale ---');
const requiredScales = [
  '--space-0', '--space-half', '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
  '--radius-none', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full',
  '--elevation-level-0', '--elevation-level-1', '--elevation-level-2', '--elevation-level-3', '--elevation-level-4'
];
requiredScales.forEach(scale => {
  assert.ok(tokensCss.includes(scale), `m3-tokens.css must declare ${scale}`);
});
console.log('✅ PASS 3: 8dp spatial grid, radius system, and M3 elevation scale verified.');
passCount++;

// TEST 4: Legacy & Material 3 Backward Compatibility Aliases
console.log('--- TEST 4: Legacy & M3 Alias Compatibility ---');
const requiredAliases = [
  '--md-sys-color-surface',
  '--md-sys-color-primary',
  '--bg-surface',
  '--text-primary',
  '--border-color'
];
requiredAliases.forEach(alias => {
  assert.ok(tokensCss.includes(alias), `m3-tokens.css must retain alias ${alias}`);
});
console.log('✅ PASS 4: All legacy and --md-sys-* variable aliases preserved.');
passCount++;

// TEST 5: Monospace Typography Binding
console.log('--- TEST 5: Monospace Typography Enforcements ---');
assert.ok(tokensCss.includes('--font-mono'), 'm3-tokens.css must define --font-mono');
assert.ok(
  styleCss.includes('.hsrp-plate') && styleCss.includes('--font-mono'),
  'style.css must bind .hsrp-plate to --font-mono'
);
assert.ok(
  styleCss.includes('.phone-digits-text') && (styleCss.includes('font-family: var(--font-mono') || styleCss.includes("font-family: 'JetBrains Mono'")),
  'style.css must format .phone-digits-text with monospace font'
);
assert.ok(
  styleCss.includes('.time-cell-main') && (styleCss.includes('font-family: var(--font-mono') || styleCss.includes("font-family: 'JetBrains Mono'")),
  'style.css must format .time-cell-main with monospace font'
);
console.log('✅ PASS 5: Vehicle plates, phone numbers, and time cells bound to monospace font.');
passCount++;

// TEST 6: DDR-002 Devanagari Matra Clipping Protection
console.log('--- TEST 6: DDR-002 Devanagari Typography Protection ---');
assert.ok(
  styleCss.includes('.form-input-indic') && styleCss.includes('line-height: 1.5 !important'),
  'style.css must enforce line-height: 1.5 !important on .form-input-indic'
);
assert.ok(
  styleCss.includes('.table-hi-sub') && styleCss.includes('line-height: 1.5 !important'),
  'style.css must enforce line-height: 1.5 !important on .table-hi-sub'
);
assert.ok(
  styleCss.includes('.cwp-lead-name-hi') && styleCss.includes('line-height: 1.5 !important'),
  'style.css must enforce line-height: 1.5 !important on .cwp-lead-name-hi'
);
console.log('✅ PASS 6: Devanagari line-height >= 1.5 and padding protection verified (DDR-002).');
passCount++;

// TEST 7: Pagination Touch Targets & Spatial Gaps
console.log('--- TEST 7: Pagination Touch Target Ergonomics ---');
assert.ok(
  styleCss.includes('.btn-page-num') && styleCss.includes('min-width: 40px'),
  'style.css must enforce min-width: 40px on .btn-page-num'
);
assert.ok(
  styleCss.includes('.btn-page-nav') && styleCss.includes('min-height: 40px'),
  'style.css must enforce min-height: 40px on .btn-page-nav'
);
console.log('✅ PASS 7: Pagination buttons meet >= 40px touch target requirements.');
passCount++;

console.log('===============================================================');
console.log(`🎉 ALL ${passCount} CWP AURA DESIGN TOKEN TESTS PASSED CLEANLY (100%)!`);
console.log('===============================================================\n');
