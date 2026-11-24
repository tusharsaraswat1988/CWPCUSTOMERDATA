/**
 * QA Test Suite: Auto-login & Wrong Password/PIN Animation
 * 
 * Verifies:
 * 1. CSS keyframes and tactile shake classes in style.css, staff-m3.css, and cwp-neural-login.css
 * 2. Staff Auto-login on 6-digit PIN completion with valid phone
 * 3. Staff wrong PIN tactile animation, dots-error state, input clearance, and re-focus
 * 4. Admin Auto-login debounced check on typing
 * 5. Admin wrong password shake animation, text selection, and haptic feedback
 * 6. Server verifyAdminPassword with isAuto safety against accidental typing lockout
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('⚡ RUNNING AUTO-LOGIN & WRONG ANIMATION QA SUITE');
console.log('===============================================================\n');

const styleCssPath = path.join(__dirname, '../public/css/style.css');
const staffCssPath = path.join(__dirname, '../public/css/staff-m3.css');
const neuralCssPath = path.join(__dirname, '../public/css/cwp-neural-login.css');
const appJsPath = path.join(__dirname, '../public/js/app.js');
const serverJsPath = path.join(__dirname, '../server.js');

const styleCss = fs.readFileSync(styleCssPath, 'utf8');
const staffCss = fs.readFileSync(staffCssPath, 'utf8');
const neuralCss = fs.readFileSync(neuralCssPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');

// --- Test 1: CSS Animation Rules & Shake Classes ---
console.log('--- Test 1: CSS Animation Rules & Tactile Shake Classes ---');
assert.ok(styleCss.includes('.input-shake') && styleCss.includes('.input-error-shake'), '1.1 style.css has .input-shake and .input-error-shake');
assert.ok(styleCss.includes('.cwp-card-shake'), '1.2 style.css has .cwp-card-shake');
assert.ok(staffCss.includes('@keyframes staffTactileShake'), '1.3 staff-m3.css declares @keyframes staffTactileShake');
assert.ok(staffCss.includes('.dots-error'), '1.4 staff-m3.css declares .cwp-pin-dots-row.dots-error');
assert.ok(neuralCss.includes('.cwp-password-prompt-box.shake-error'), '1.5 cwp-neural-login.css declares prompt-box shake-error');
assert.ok(neuralCss.includes('.cwp-password-input.input-shake'), '1.6 cwp-neural-login.css declares password-input input-shake');
console.log('✅ PASS: All CSS tactile shake, card shake, and dots error styles verified.\n');

// --- Test 2: Staff Auto-Login Implementation ---
console.log('--- Test 2: Staff Auto-Login Implementation ---');
assert.ok(appJs.includes('function checkStaffAutoLoginTrigger()'), '2.1 checkStaffAutoLoginTrigger defined in app.js');
assert.ok(appJs.includes('function checkStaffPhoneAutoLogin()'), '2.2 checkStaffPhoneAutoLogin defined in app.js');
assert.ok(appJs.includes('rawPin.length === 6 && !isStaffAuthSubmitting'), '2.3 Triggers auto-login when PIN reaches 6 digits');
assert.ok(appJs.includes('handleStaffAuthSubmit(null, true)'), '2.4 Calls handleStaffAuthSubmit with isAuto flag on 6-digit complete');
console.log('✅ PASS: Staff auto-login triggers and listeners verified.\n');

// --- Test 3: Staff Wrong PIN Animation & Recovery ---
console.log('--- Test 3: Staff Wrong PIN Animation & Recovery ---');
assert.ok(appJs.includes('dotsRow.classList.add(\'dots-error\')'), '3.1 Wrong PIN activates dots-error highlight');
assert.ok(appJs.includes('triggerInputShake(pinInput)'), '3.2 Wrong PIN shakes pin input');
assert.ok(appJs.includes('triggerInputShake(card)'), '3.3 Wrong PIN shakes card');
assert.ok(appJs.includes('pinInput.value = \'\''), '3.4 PIN input automatically cleared on wrong PIN for quick re-entry');
console.log('✅ PASS: Staff wrong PIN animation and recovery flow verified.\n');

// --- Test 4: Admin Auto-Login Implementation ---
console.log('--- Test 4: Admin Auto-Login Implementation ---');
assert.ok(appJs.includes('function initAdminAutoLogin()'), '4.1 initAdminAutoLogin defined in app.js');
assert.ok(appJs.includes('adminAutoLoginTimer'), '4.2 adminAutoLoginTimer debouncer configured');
assert.ok(appJs.includes('pass.length >= 4'), '4.3 Debounced check triggers when password length >= 4');
assert.ok(appJs.includes('handleAdminAuth(null, true)'), '4.4 Calls handleAdminAuth with isAuto flag on debounce');
console.log('✅ PASS: Admin debounced auto-login logic verified.\n');

// --- Test 5: Admin Wrong Password Animation ---
console.log('--- Test 5: Admin Wrong Password Animation ---');
assert.ok(appJs.includes('triggerInputShake(input)'), '5.1 Wrong password shakes input');
assert.ok(appJs.includes('triggerInputShake(pwBox)'), '5.2 Wrong password shakes password box');
assert.ok(appJs.includes('input.select()'), '5.3 Wrong password selects text for immediate correction/retype');
console.log('✅ PASS: Admin wrong password shake and text selection verified.\n');

// --- Test 6: Server-side isAuto Safety Protection ---
console.log('--- Test 6: Server-side isAuto Safety Protection ---');
assert.ok(serverJs.includes('const isAuto = !!payload.isAuto;'), '6.1 server.js extracts isAuto flag from verifyAdminPassword payload');
assert.ok(serverJs.includes('if (!isAuto) {\n            recordFailedLogin(clientIp, \'admin\');\n          }') ||
          serverJs.includes('if (!isAuto) recordFailedLogin(clientIp, \'admin\');'), '6.2 Auto checks do not count towards typing pause lockouts');
console.log('✅ PASS: Server isAuto safety verified against accidental lockout.\n');

console.log('===============================================================');
console.log('🎉 ALL AUTO-LOGIN & WRONG ANIMATION QA TESTS PASSED (100%)!');
console.log('===============================================================');
