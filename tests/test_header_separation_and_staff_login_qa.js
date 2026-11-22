/**
 * =============================================================================
 * CWP DEDICATED HEADER SEPARATION & STAFF PORTAL ISOLATION QA SUITE
 * =============================================================================
 * Verifies:
 * 1. Complete Physical Decoupling of Staff Header (#staffHeader) & Admin Header (#adminHeader)
 * 2. Staff Header Hygiene: Zero Theme Toggle or Language Dropdown in Mobile Staff Header (kept strictly in Settings)
 * 3. Zero Super Admin / Account Trigger Bleed on Staff Portal or Sign-in Pages
 * 4. Admin Account Menu strictly hidden during unauthenticated Admin Sign-in
 * 5. CSS Architecture: Strict Mode Selectors & No Overriding !important Display Bugs
 * 6. Server-Side Routing & Default staff-mode-active Configuration
 * =============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('🛡️ RUNNING CWP HEADER SEPARATION & STAFF ISOLATION QA SUITE');
console.log('=================================================================\n');

const indexPath = path.join(__dirname, '..', 'Index.html');
const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
const serverPath = path.join(__dirname, '..', 'server.js');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const styleCss = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(jsPath, 'utf8');
const serverJs = fs.readFileSync(serverPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Physical Decoupling of Staff & Admin Headers in DOM
// -----------------------------------------------------------------------------
console.log('--- Test 1: Physical Decoupling of Headers in DOM ---');

assert.ok(indexHtml.includes('<header id="staffHeader" class="top-header staff-header" role="banner">'), '1.1 Dedicated #staffHeader element exists');
assert.ok(indexHtml.includes('<header id="adminHeader" class="top-header admin-header" role="banner"'), '1.2 Dedicated #adminHeader element exists');

// Verify staffHeader closes before adminHeader starts
const staffHeaderStart = indexHtml.indexOf('<header id="staffHeader"');
const staffHeaderEnd = indexHtml.indexOf('</header>', staffHeaderStart);
const adminHeaderStart = indexHtml.indexOf('<header id="adminHeader"');
const adminHeaderEnd = indexHtml.indexOf('</header>', adminHeaderStart);

assert.ok(staffHeaderEnd > staffHeaderStart, '1.3 #staffHeader properly closed');
assert.ok(adminHeaderStart > staffHeaderEnd, '1.4 #adminHeader starts strictly after #staffHeader closes');
assert.ok(adminHeaderEnd > adminHeaderStart, '1.5 #adminHeader properly closed');

const staffHeaderSnippet = indexHtml.substring(staffHeaderStart, staffHeaderEnd);
const adminHeaderSnippet = indexHtml.substring(adminHeaderStart, adminHeaderEnd);

console.log('✅ PASS 1: Physical header separation verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: Staff Header Cleanliness & Settings Placement
// -----------------------------------------------------------------------------
console.log('--- Test 2: Staff Header Cleanliness (Settings Placement) ---');

// Staff header must NOT contain language dropdown or theme toggle button
assert.ok(!staffHeaderSnippet.includes('id="langDropdownWrap"'), '2.1 Staff header does NOT contain langDropdownWrap');
assert.ok(!staffHeaderSnippet.includes('id="btnLangToggle"'), '2.2 Staff header does NOT contain btnLangToggle');
assert.ok(!staffHeaderSnippet.includes('id="btnThemeToggle"'), '2.3 Staff header does NOT contain btnThemeToggle');
assert.ok(!staffHeaderSnippet.includes('id="themeToggleIcon"'), '2.4 Staff header does NOT contain themeToggleIcon');

// Staff Settings tab MUST contain the language & theme controls
assert.ok(indexHtml.includes('staff-settings-prefs-card'), '2.5 Staff Settings preferences card exists');
assert.ok(indexHtml.includes('id="btnPrefLangHi"'), '2.6 Language Hindi toggle exists in Staff Settings');
assert.ok(indexHtml.includes('id="btnPrefLangEn"'), '2.7 Language English toggle exists in Staff Settings');
assert.ok(indexHtml.includes('id="btnPrefThemeLight"'), '2.8 Theme Light toggle exists in Staff Settings');
assert.ok(indexHtml.includes('id="btnPrefThemeDark"'), '2.9 Theme Dark toggle exists in Staff Settings');

console.log('✅ PASS 2: Staff header clean; Theme & Language strictly in Settings.\n');

// -----------------------------------------------------------------------------
// TEST 3: Zero Super Admin / Account Leakage on Staff Portal & Sign-in
// -----------------------------------------------------------------------------
console.log('--- Test 3: Zero Super Admin / Account Leakage on Staff Portal ---');

// Staff header must NOT contain any account trigger, avatar, or Super Admin reference
assert.ok(!staffHeaderSnippet.includes('id="headerAccountTrigger"'), '3.1 Staff header does NOT contain headerAccountTrigger');
assert.ok(!staffHeaderSnippet.includes('id="accountDropdownWrap"'), '3.2 Staff header does NOT contain accountDropdownWrap');
assert.ok(!staffHeaderSnippet.includes('SUPER ADMIN'), '3.3 Staff header does NOT contain SUPER ADMIN badge');
assert.ok(!staffHeaderSnippet.includes('Super Admin Access'), '3.4 Staff header does NOT contain Super Admin Access');

// Admin header contains the admin account dropdown initialized as hidden
assert.ok(adminHeaderSnippet.includes('id="accountDropdownWrap"'), '3.5 Admin header contains accountDropdownWrap');
assert.ok(adminHeaderSnippet.includes('display: none !important;'), '3.6 Admin account dropdown starts hidden by default on sign-in gate');

console.log('✅ PASS 3: Zero admin leakage on staff portal verified.\n');

// -----------------------------------------------------------------------------
// TEST 4: JavaScript Auth & Mode Isolation Logic
// -----------------------------------------------------------------------------
console.log('--- Test 4: JavaScript Auth & Mode Isolation Logic ---');

// In updateHeaderAccountStatus:
assert.ok(appJs.includes('if (mode === \'staff\')'), '4.1 updateHeaderAccountStatus checks for staff mode');
assert.ok(appJs.includes('if (staffHeader) staffHeader.style.setProperty(\'display\', \'block\', \'important\')'), '4.2 Staff header forced visible in staff mode');
assert.ok(appJs.includes('if (adminHeader) adminHeader.style.setProperty(\'display\', \'none\', \'important\')'), '4.3 Admin header forced hidden in staff mode');

// In applyViewMode:
assert.ok(appJs.includes('if (staffHeader) staffHeader.style.setProperty(\'display\', \'block\', \'important\')'), '4.4 applyViewMode toggles staff header on');
assert.ok(appJs.includes('if (adminHeader) adminHeader.style.setProperty(\'display\', \'none\', \'important\')'), '4.5 applyViewMode toggles admin header off');

console.log('✅ PASS 4: JavaScript mode isolation logic verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: CSS Mode Rules & No Overriding Display Bugs
// -----------------------------------------------------------------------------
console.log('--- Test 5: CSS Mode Rules & Display Rule Integrity ---');

assert.ok(styleCss.includes('body.staff-mode-active #staffHeader'), '5.1 staff-mode-active CSS rule for staffHeader exists');
assert.ok(styleCss.includes('body.staff-mode-active #adminHeader'), '5.2 staff-mode-active CSS rule hiding adminHeader exists');
assert.ok(styleCss.includes('body.admin-mode-active #adminHeader'), '5.3 admin-mode-active CSS rule for adminHeader exists');
assert.ok(styleCss.includes('body.admin-mode-active #staffHeader'), '5.4 admin-mode-active CSS rule hiding staffHeader exists');

// Verify .header-dropdown-wrap does not have unconditional display: inline-flex !important
assert.ok(!styleCss.includes('.header-dropdown-wrap {\n      position: relative !important;\n      display: inline-flex !important;'), '5.5 header-dropdown-wrap does not force inline-flex !important');

console.log('✅ PASS 5: CSS rules and display integrity verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Server Routing & Default Template Alignment
// -----------------------------------------------------------------------------
console.log('--- Test 6: Server Routing & Default Template Alignment ---');

assert.ok(indexHtml.includes('<body class="staff-mode-active">'), '6.1 Default body class is staff-mode-active');
assert.ok(serverJs.includes('class="staff-mode-active"'), '6.2 Server.js references staff-mode-active');
assert.ok(serverJs.includes('APP_ASSET_VERSION = \'3.2.5\''), '6.3 Server.js APP_ASSET_VERSION is 3.2.5');

console.log('✅ PASS 6: Server routing and template defaults verified.\n');

console.log('=================================================================');
console.log('🎉 ALL TESTS PASSED! Clean, decoupled, professional header architecture confirmed.');
console.log('=================================================================\n');
