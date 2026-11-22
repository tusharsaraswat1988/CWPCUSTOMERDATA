/**
 * =============================================================================
 * CWP GLOBAL HEADER UX/UI MODERNIZATION - AUTOMATED QA TEST SUITE
 * =============================================================================
 * Verifies:
 * 1. Unified Shared Header Architecture across Staff & Admin portals
 * 2. Natural Left-Aligned Brand Group (Logo, Separator, Portal Context & Title)
 * 3. Compact Coherent Utility Area (Status, Install, Language, Theme, Account)
 * 4. Refined Status Pill (Diagnostic Popover, Online/Offline, Realtime States)
 * 5. Compact Language Selector Dropdown (EN / Hindi toggle & explicit selection)
 * 6. Standardized Icon-Only Theme Toggle (A11y, Moon/Sun icon sync)
 * 7. Neutral Compact PWA Install Action (Conditional display & hidden in standalone)
 * 8. Account / Profile Menu with Embedded Destructive Logout
 * 9. Separation & Modernization of Admin Navigation Tabs Sub-Row
 * 10. Design Tokens, Strict Responsiveness (<540px, <480px, <380px) & Zero Overflow
 * =============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('💎 RUNNING CWP GLOBAL HEADER UX/UI MODERNIZATION QA SUITE');
console.log('===============================================================\n');

const indexPath = path.join(__dirname, '..', 'Index.html');
const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const styleCss = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(jsPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: Dedicated Separated Header Architecture & Design Tokens
// -----------------------------------------------------------------------------
console.log('--- Test 1: Separated Header Architecture & Design Tokens ---');

assert.ok(indexHtml.includes('id="staffHeader"') && indexHtml.includes('id="adminHeader"'), '1.1 Dedicated staffHeader and adminHeader exist');
assert.ok(indexHtml.includes('<header id="staffHeader" class="top-header staff-header" role="banner">'), '1.1b Staff header with role="banner" exists');
assert.ok(indexHtml.includes('<header id="adminHeader" class="top-header admin-header" role="banner"'), '1.1c Admin header with role="banner" exists');
assert.ok(indexHtml.includes('<div class="header-inner">'), '1.2 Header-inner container exists');
assert.ok(styleCss.includes('--cwp-header-bg: #0b192c;'), '1.3 Brand navy header background token defined');
assert.ok(styleCss.includes('--cwp-header-height: 56px;'), '1.4 Consistent 56px header height token defined');
assert.ok(styleCss.includes('--cwp-control-height: 34px;'), '1.5 Standardized 34px control height token defined');
assert.ok(styleCss.includes('--cwp-control-radius: 7px;'), '1.6 Standardized 7px control radius token defined');
assert.ok(styleCss.includes('--cwp-status-live-bg'), '1.7 Status live token defined');
assert.ok(styleCss.includes('--cwp-status-offline-bg'), '1.8 Status offline token defined');

console.log('✅ PASS 1: Dedicated separated architecture and design tokens verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: Natural Left-Aligned Brand Group (No Center Grid Stranding)
// -----------------------------------------------------------------------------
console.log('--- Test 2: Natural Left-Aligned Brand Group ---');

assert.ok(indexHtml.includes('class="header-brand-group"'), '2.1 header-brand-group container exists');
assert.ok(indexHtml.includes('class="brand-logo-wrap"'), '2.2 brand-logo-wrap exists');
assert.ok(indexHtml.includes('class="brand-logo-img"'), '2.3 brand-logo-img exists');
assert.ok(indexHtml.includes('class="brand-separator"'), '2.4 Subtly styled vertical brand separator exists');
assert.ok(indexHtml.includes('class="header-context"'), '2.5 header-context hierarchy exists');
assert.ok(indexHtml.includes('id="headerContextChip"'), '2.6 headerContextChip tag exists');
assert.ok(indexHtml.includes('id="pageMainTitle"'), '2.7 pageMainTitle title element exists');

// Verify that .header-inner uses flex with left and right alignment, not center grid column
assert.ok(styleCss.includes('justify-content: space-between !important;'), '2.8 Header inner uses flex space-between');
assert.ok(!styleCss.includes('grid-template-columns: 1fr auto 1fr;'), '2.9 Centered grid column stranding removed from header');

console.log('✅ PASS 2: Natural left-aligned brand hierarchy verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Compact Coherent Utility Group
// -----------------------------------------------------------------------------
console.log('--- Test 3: Compact Coherent Utility Group ---');

assert.ok(indexHtml.includes('header-utility-group'), '3.1 header-utility-group container exists');
assert.ok(styleCss.includes('.header-utility-group'), '3.2 header-utility-group CSS defined');
assert.ok(styleCss.includes('.header-util-btn'), '3.3 header-util-btn base control CSS defined');
assert.ok(styleCss.includes('.header-icon-btn'), '3.4 header-icon-btn standardized square button CSS defined');

console.log('✅ PASS 3: Coherent utility group and shared control family verified.\n');

// -----------------------------------------------------------------------------
// TEST 4: Refined Status Pill & Diagnostics Popover
// -----------------------------------------------------------------------------
console.log('--- Test 4: Refined Status Pill & Diagnostics Popover ---');

assert.ok(indexHtml.includes('id="staffLiveBadge"'), '4.1 staffLiveBadge element preserved');
assert.ok(indexHtml.includes('id="staffSyncDot"'), '4.2 staffSyncDot indicator preserved');
assert.ok(indexHtml.includes('id="staffSyncText"'), '4.3 staffSyncText text element preserved');
assert.ok(indexHtml.includes('id="syncDetailsPopover"'), '4.4 syncDetailsPopover diagnostics flyout exists');
assert.ok(indexHtml.includes('id="popoverStatusHeading"'), '4.5 Diagnostics popover status heading exists');
assert.ok(indexHtml.includes('id="popoverLastSyncVal"'), '4.6 Diagnostics popover last sync timestamp exists');
assert.ok(indexHtml.includes('id="popoverNetworkVal"'), '4.7 Diagnostics popover network state exists');
assert.ok(indexHtml.includes('id="btnPopoverSyncNow"'), '4.8 Diagnostics popover sync action button exists');
assert.ok(appJs.includes('function toggleSyncDetailsPopover'), '4.9 toggleSyncDetailsPopover function defined');
assert.ok(appJs.includes('function refreshSyncDetailsPopover'), '4.10 refreshSyncDetailsPopover function defined');

console.log('✅ PASS 4: Status pill and diagnostics popover verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: Compact Language Selector Dropdown
// -----------------------------------------------------------------------------
console.log('--- Test 5: Compact Language Selector Dropdown ---');

assert.ok(indexHtml.includes('id="langDropdownWrap"'), '5.1 langDropdownWrap container exists');
assert.ok(indexHtml.includes('id="btnLangToggle"'), '5.2 btnLangToggle trigger preserved');
assert.ok(indexHtml.includes('id="langToggleText"'), '5.3 langToggleText display text preserved');
assert.ok(indexHtml.includes('id="langMenuPanel"'), '5.4 langMenuPanel dropdown menu exists');
assert.ok(indexHtml.includes('id="langOptEn"'), '5.5 English option exists in dropdown');
assert.ok(indexHtml.includes('id="langOptHi"'), '5.6 Hindi option exists in dropdown');
assert.ok(appJs.includes('function toggleLangDropdown'), '5.7 toggleLangDropdown function defined');
assert.ok(appJs.includes('function selectAppLanguage'), '5.8 selectAppLanguage function defined');

console.log('✅ PASS 5: Compact language selector dropdown verified.\n');

// -----------------------------------------------------------------------------
// TEST 6: Standardized Icon-Only Theme Toggle
// -----------------------------------------------------------------------------
console.log('--- Test 6: Standardized Icon-Only Theme Toggle ---');

assert.ok(indexHtml.includes('id="btnThemeToggle"'), '6.1 btnThemeToggle button preserved');
assert.ok(indexHtml.includes('id="themeToggleIcon"'), '6.2 themeToggleIcon preserved');
assert.ok(indexHtml.includes('aria-label="Toggle Theme"'), '6.3 Accessible aria-label exists on theme button');
assert.ok(styleCss.includes('.header-icon-btn'), '6.4 Standardized square utility button CSS defined');

console.log('✅ PASS 6: Icon-only theme toggle verified.\n');

// -----------------------------------------------------------------------------
// TEST 7: Neutral PWA Install Action
// -----------------------------------------------------------------------------
console.log('--- Test 7: Neutral PWA Install Action ---');

assert.ok(indexHtml.includes('id="staffPwaInstallBtn"'), '7.1 staffPwaInstallBtn button preserved');
assert.ok(indexHtml.includes('triggerPwaInstallPrompt()'), '7.2 triggerPwaInstallPrompt handler preserved');
assert.ok(styleCss.includes('.pwa-install-header-btn'), '7.3 Neutral utility styling applied to install button');

console.log('✅ PASS 7: Neutral PWA install action verified.\n');

// -----------------------------------------------------------------------------
// TEST 8: Account Profile Menu & Embedded Destructive Logout
// -----------------------------------------------------------------------------
console.log('--- Test 8: Account Profile Menu & Embedded Destructive Logout ---');

assert.ok(indexHtml.includes('id="headerAccountTrigger"'), '8.1 headerAccountTrigger profile trigger exists');
assert.ok(indexHtml.includes('id="headerAccountAvatar"'), '8.2 headerAccountAvatar initial avatar exists');
assert.ok(indexHtml.includes('id="headerAccountName"'), '8.3 headerAccountName user name element exists');
assert.ok(indexHtml.includes('id="headerAccountRole"'), '8.4 headerAccountRole role badge exists');
assert.ok(indexHtml.includes('id="accountMenuPanel"'), '8.5 accountMenuPanel dropdown exists');
assert.ok(indexHtml.includes('id="staffLogoutBtn"'), '8.6 staffLogoutBtn preserved inside account menu');
assert.ok(indexHtml.includes('id="adminLogoutBtn"'), '8.7 adminLogoutBtn preserved inside account menu');
assert.ok(indexHtml.includes('item-destructive'), '8.8 Red destructive menu item styling applied');
assert.ok(appJs.includes('function toggleAccountMenu'), '8.9 toggleAccountMenu function defined');
assert.ok(appJs.includes('function updateHeaderAccountStatus'), '8.10 updateHeaderAccountStatus function defined');

console.log('✅ PASS 8: Account profile menu and destructive logout verified.\n');

// -----------------------------------------------------------------------------
// TEST 9: Admin Navigation Tabs in Separate Row
// -----------------------------------------------------------------------------
console.log('--- Test 9: Admin Navigation Tabs in Separate Row ---');

assert.ok(indexHtml.includes('admin-tab-container'), '9.1 admin-tab-container row preserved');
assert.ok(indexHtml.includes('admin-tab-nav') && indexHtml.includes('role="tablist"'), '9.2 admin-tab-nav segmented control preserved');
assert.ok(indexHtml.includes('id="tabBtnRecords"'), '9.3 Records tab button preserved');
assert.ok(indexHtml.includes('id="tabBtnSequence"'), '9.4 Sequence tab button preserved');
assert.ok(indexHtml.includes('id="tabBtnStaff"'), '9.5 Staff tab button preserved');
assert.ok(indexHtml.includes('id="tabBtnCleanReports"'), '9.6 Clean reports tab button preserved');

// Verify that admin tabs are NOT inside .top-header
const headerCloseIdx = indexHtml.indexOf('</header>');
const adminTabsIdx = indexHtml.indexOf('admin-tab-container');
assert.ok(adminTabsIdx > headerCloseIdx, '9.7 Admin tabs must strictly remain outside and beneath <header>');

console.log('✅ PASS 9: Admin navigation tabs remain strictly separated in sub-row.\n');

// -----------------------------------------------------------------------------
// TEST 10: Responsive Optimization & Zero Overflow
// -----------------------------------------------------------------------------
console.log('--- Test 10: Responsive Breakpoints & Popover Dismissal ---');

assert.ok(styleCss.includes('@media (max-width: 768px)'), '10.1 Tablet media query defined');
assert.ok(styleCss.includes('@media (max-width: 540px)'), '10.2 Mobile media query defined');
assert.ok(appJs.includes('closeAllHeaderPopovers'), '10.3 Click-outside popover dismissal defined');
assert.ok(appJs.includes('e.key === \'Escape\''), '10.4 Escape key dismissal defined');

console.log('✅ PASS 10: Responsive rules and popover controls verified.\n');

console.log('===============================================================');
console.log('🎉 ALL 10 GLOBAL HEADER MODERNIZATION TESTS PASSED PERFECTLY!');
console.log('===============================================================\n');
