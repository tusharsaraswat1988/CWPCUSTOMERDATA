/**
 * Automated QA Test Suite: CWP 3D Neural Core Admin Login Console
 *
 * Verifies:
 * 1. DOM Elements & Semantic Structure in Index.html
 * 2. Visual & Animation Styles in public/css/cwp-neural-login.css
 * 3. 3D Neural Core Canvas Engine in public/js/cwp-neural-core.js
 * 4. Auth Lifecycle & Zero-Header Isolation in public/js/app.js
 * 5. Backward Compatibility of Admin Auth IDs and Handlers
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('⚡ RUNNING CWP 3D NEURAL CORE ADMIN LOGIN QA TEST SUITE');
console.log('===============================================================\n');

const indexPath = path.join(__dirname, '../Index.html');
const cssPath = path.join(__dirname, '../public/css/cwp-neural-login.css');
const jsCorePath = path.join(__dirname, '../public/js/cwp-neural-core.js');
const jsAppPath = path.join(__dirname, '../public/js/app.js');

assert.ok(fs.existsSync(indexPath), 'Index.html must exist');
assert.ok(fs.existsSync(cssPath), 'public/css/cwp-neural-login.css must exist');
assert.ok(fs.existsSync(jsCorePath), 'public/js/cwp-neural-core.js must exist');
assert.ok(fs.existsSync(jsAppPath), 'public/js/app.js must exist');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const jsCoreContent = fs.readFileSync(jsCorePath, 'utf8');
const jsAppContent = fs.readFileSync(jsAppPath, 'utf8');

let passCount = 0;

// TEST 1: DOM Elements & Structure in Index.html
console.log('--- TEST 1: DOM Elements & Structure in Index.html ---');
const requiredIds = [
  'adminAuthGate',
  'cwpCoreBtn',
  'cwpNeuralCoreCanvas',
  'cwpCoreIntroCta',
  'cwpCoreIntroBtn',
  'cwpCorePasswordBox',
  'adminAuthForm',
  'adminPasswordInput',
  'btnAdminLogin',
  'adminAuthError',
  'rememberAdminDevice',
  'cwpAuthenticatingIndicator'
];

requiredIds.forEach(id => {
  assert.ok(indexHtml.includes(`id="${id}"`), `Index.html must contain element with id="${id}"`);
});

assert.ok(indexHtml.includes('/cwp_logo.jpg'), 'Index.html must reference /cwp_logo.jpg');
assert.ok(indexHtml.includes('TAP CORE TO AUTHENTICATE'), 'Index.html must contain "TAP CORE TO AUTHENTICATE" CTA');
assert.ok(indexHtml.includes('/css/cwp-neural-login.css'), 'Index.html must link /css/cwp-neural-login.css');
assert.ok(indexHtml.includes('/js/cwp-neural-core.js'), 'Index.html must load /js/cwp-neural-core.js');
console.log('✅ PASS 1: All 12 core DOM IDs and asset bindings verified.');
passCount++;

// TEST 2: Visual Styling & Keyframes in cwp-neural-login.css
console.log('--- TEST 2: Visual Styling & Keyframes in cwp-neural-login.css ---');
const requiredCssClasses = [
  '#adminAuthGate.cwp-neural-login-root',
  '.cwp-login-mesh-bg',
  '.cwp-mesh-base',
  '.cwp-mesh-a',
  '.cwp-mesh-b',
  '.cwp-mesh-c',
  '.cwp-core-backlight',
  '.cwp-core-ring',
  '.cwp-core-btn',
  '.cwp-core-cta-btn',
  '.cwp-password-prompt-box',
  '.cwp-password-input'
];

requiredCssClasses.forEach(cls => {
  assert.ok(cssContent.includes(cls), `CSS must define class/selector ${cls}`);
});

assert.ok(cssContent.includes('@keyframes cwpPulse'), 'CSS must declare @keyframes cwpPulse');
assert.ok(cssContent.includes('@keyframes cwpLoginFloatA'), 'CSS must declare @keyframes cwpLoginFloatA');
assert.ok(cssContent.includes('@keyframes cwpLoginFloatB'), 'CSS must declare @keyframes cwpLoginFloatB');
assert.ok(cssContent.includes('body.theme-dark'), 'CSS must support body.theme-dark overrides');
assert.ok(cssContent.includes('prefers-reduced-motion'), 'CSS must include prefers-reduced-motion accessibility');
assert.ok(cssContent.includes('100dvh'), 'CSS must use 100dvh for mobile viewport fit');
console.log('✅ PASS 2: All CSS classes, ambient meshes, keyframes, and theme overrides validated.');
passCount++;

// TEST 3: 3D Fibonacci Neural Core Engine in cwp-neural-core.js
console.log('--- TEST 3: 3D Fibonacci Neural Core Engine ---');
assert.ok(jsCoreContent.includes('goldenRatioAngle = Math.PI * (3 - Math.sqrt(5))'), 'Engine must use Fibonacci golden ratio angle');
assert.ok(jsCoreContent.includes('colorType'), 'Engine must configure node color taxonomies');
assert.ok(jsCoreContent.includes('radiantCyan'), 'Engine must feature radiant cyan starburst nodes');
assert.ok(jsCoreContent.includes('sapphire'), 'Engine must feature metallic sapphire cobalt nodes');
assert.ok(jsCoreContent.includes('pearl'), 'Engine must feature polished pearl porcelain nodes');
assert.ok(jsCoreContent.includes('window.CwpNeuralCore ='), 'Engine must expose window.CwpNeuralCore API');
assert.ok(jsCoreContent.includes('calculateCoreSize'), 'Engine must support responsive dynamic core sizing');
assert.ok(jsCoreContent.includes('INACTIVITY_TIMEOUT_MS = 6000'), 'Engine must implement 6-second inactivity auto-reset');
assert.ok(jsCoreContent.includes('visibilitychange'), 'Engine must handle visibilitychange to conserve battery');
console.log('✅ PASS 3: 3D Fibonacci canvas math, node taxonomies, and lifecycle API verified.');
passCount++;

// TEST 4: Zero-Header Isolation & Auth Status in public/js/app.js
console.log('--- TEST 4: Zero-Header Isolation & Auth Status in app.js ---');
// Verify that when not authenticated, adminHeader is explicitly hidden
assert.ok(
  jsAppContent.includes("if (adminHeader) adminHeader.style.setProperty('display', 'none', 'important');"),
  'app.js must explicitly hide adminHeader when user is unauthenticated on admin login'
);
// Verify that when authenticated, adminHeader is displayed
assert.ok(
  jsAppContent.includes("if (adminHeader) adminHeader.style.setProperty('display', 'block', 'important');"),
  'app.js must display adminHeader once authenticated'
);
// Verify CwpNeuralCore hooks
assert.ok(jsAppContent.includes('window.CwpNeuralCore.setStage'), 'app.js must set CwpNeuralCore stages on auth events');
assert.ok(jsAppContent.includes('window.CwpNeuralCore.reset'), 'app.js must reset CwpNeuralCore on successful auth');
console.log('✅ PASS 4: Zero-header isolation on login screen and CwpNeuralCore lifecycle hooks verified.');
passCount++;

// TEST 5: Backward Compatibility & Customization Assertions
console.log('--- TEST 5: Backward Compatibility & Customization Assertions ---');
assert.ok(indexHtml.includes('onsubmit="handleAdminAuth(event)"'), 'adminAuthForm must invoke handleAdminAuth(event)');
assert.ok(!indexHtml.includes('Switch to Staff Portal'), 'Switch to Staff Portal button must be removed as requested');
assert.ok(indexHtml.includes('togglePasswordVisibility(\'adminPasswordInput\''), 'Password toggle must target adminPasswordInput');
assert.ok(cssContent.includes('.admin-login-lock'), 'CSS must include zero-scrollbar .admin-login-lock rules');
console.log('✅ PASS 5: All legacy event handlers, attributes, and user customizations verified.');
passCount++;

console.log('===============================================================');
console.log(`🎉 ALL ${passCount} CWP 3D NEURAL CORE ADMIN LOGIN TESTS PASSED CLEANLY (100%)!`);
console.log('===============================================================\n');
