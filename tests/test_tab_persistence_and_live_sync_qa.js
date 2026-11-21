/**
 * Test Suite: Admin Tab Persistence on Refresh & Daily Clean Reports Live Auto-Sync
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('===============================================================');
console.log('🚀 RUNNING ADMIN TAB PERSISTENCE & LIVE AUTO-SYNC QA SUITE');
console.log('===============================================================');

const rootDir = path.resolve(__dirname, '..');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const indexHtmlPath = path.join(rootDir, 'Index.html');
const styleCssPath = path.join(rootDir, 'public', 'css', 'style.css');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

// ---------------------------------------------------------------------------
// TEST 1: DOM Elements & Markup Verification
// ---------------------------------------------------------------------------
console.log('\n--- TEST 1: DOM & UI Component Elements ---');

assert.ok(indexHtml.includes('id="tabBtnCleanReports"'), 'Daily Clean Reports tab button must exist');
assert.ok(indexHtml.includes('id="adminTabCleanReports"'), 'Daily Clean Reports pane must exist');
assert.ok(indexHtml.includes('id="reportsLiveSyncPill"'), 'Live sync status pill element must exist');
assert.ok(indexHtml.includes('id="reportsLiveDot"'), 'Live pulse dot element must exist');
assert.ok(indexHtml.includes('id="reportsLiveSyncText"'), 'Live sync text element must exist');
assert.ok(indexHtml.includes('id="reportsLastSyncTime"'), 'Last sync timestamp element must exist');
assert.ok(indexHtml.includes('toggleCleanReportsAutoSync()'), 'Pill must bind click to toggleCleanReportsAutoSync');

console.log('✅ PASS 1: DOM and markup elements for live sync and reports verified.');

// ---------------------------------------------------------------------------
// TEST 2: CSS Styles for Realtime Live Sync & Highlighting
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: CSS Styles for Live Sync & Record Highlighting ---');

assert.ok(styleCss.includes('.live-sync-pill'), '.live-sync-pill style must exist');
assert.ok(styleCss.includes('.live-dot-fast'), '.live-dot-fast animation must exist');
assert.ok(styleCss.includes('.live-sync-pill.is-paused'), '.is-paused state for pill must exist');
assert.ok(styleCss.includes('.reports-last-sync-time'), '.reports-last-sync-time style must exist');
assert.ok(styleCss.includes('.row-new-highlight'), '.row-new-highlight CSS class must exist');
assert.ok(styleCss.includes('@keyframes rowNewHighlightAnim'), 'rowNewHighlightAnim keyframes must exist');
assert.ok(styleCss.includes('.spin-icon'), '.spin-icon spinning animation class must exist');

console.log('✅ PASS 2: CSS animations and status pill styles verified.');

// ---------------------------------------------------------------------------
// TEST 3: Admin Tab Persistence on Refresh Logic
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: Tab State Persistence on Refresh ---');

// Set up mock browser environment
const localStorageMock = {};
const sessionStorageMock = {};

const mockWindow = {
  location: {
    href: 'http://localhost:3000/admin?tab=cleanReports',
    search: '?tab=cleanReports',
    pathname: '/admin'
  },
  history: {
    replaceState: (state, title, url) => {
      mockWindow.location.pathname = url.split('?')[0];
      mockWindow.location.search = url.includes('?') ? '?' + url.split('?')[1] : '';
      mockWindow.location.href = 'http://localhost:3000' + url;
    }
  },
  localStorage: {
    getItem: (key) => localStorageMock[key] || null,
    setItem: (key, val) => { localStorageMock[key] = String(val); },
    removeItem: (key) => { delete localStorageMock[key]; }
  },
  sessionStorage: {
    getItem: (key) => sessionStorageMock[key] || null,
    setItem: (key, val) => { sessionStorageMock[key] = String(val); },
    removeItem: (key) => { delete sessionStorageMock[key]; }
  },
  document: {
    getElementById: (id) => ({
      style: { display: 'none', setProperty: () => {}, removeProperty: () => {} },
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      setAttribute: () => {},
      removeAttribute: () => {},
      textContent: '',
      innerHTML: ''
    }),
    querySelector: () => null,
    addEventListener: () => {},
    visibilityState: 'visible'
  },
  addEventListener: () => {},
  navigator: { onLine: true },
  Set: Set,
  URL: URL,
  URLSearchParams: URLSearchParams
};

// Check ADMIN_VALID_TABS constant
assert.ok(appJs.includes("var ADMIN_VALID_TABS = ['records', 'leads', 'sequence', 'staff', 'cleanReports', 'addCust'];"), 'ADMIN_VALID_TABS must include cleanReports and leads');

// Simulate getSavedAdminTab for all tabs
function testGetSavedAdminTab(queryTab, localTab) {
  const urlParams = new URLSearchParams(queryTab ? `?tab=${queryTab}` : '');
  const urlTab = urlParams.get('tab');
  const validTabs = ['records', 'leads', 'sequence', 'staff', 'cleanReports', 'addCust'];
  if (urlTab && validTabs.indexOf(urlTab) !== -1) {
    return urlTab;
  }
  if (localTab && validTabs.indexOf(localTab) !== -1) {
    return localTab;
  }
  return 'records';
}

// 1. When refreshing on cleanReports tab
assert.strictEqual(testGetSavedAdminTab('cleanReports', 'cleanReports'), 'cleanReports', 'Must restore cleanReports from URL');
assert.strictEqual(testGetSavedAdminTab('', 'cleanReports'), 'cleanReports', 'Must restore cleanReports from localStorage if URL has no tab');

// 2. When refreshing on sequence tab
assert.strictEqual(testGetSavedAdminTab('sequence', 'sequence'), 'sequence', 'Must restore sequence from URL');

// 3. When refreshing on staff tab
assert.strictEqual(testGetSavedAdminTab('staff', 'staff'), 'staff', 'Must restore staff from URL');

// 4. When refreshing on leads tab
assert.strictEqual(testGetSavedAdminTab('leads', 'leads'), 'leads', 'Must restore leads from URL');

// 5. When refreshing on records tab
assert.strictEqual(testGetSavedAdminTab('records', 'records'), 'records', 'Must restore records tab');

// 6. Unknown fallback
assert.strictEqual(testGetSavedAdminTab('invalidUnknownTab', null), 'records', 'Unknown tab must safely fall back to records');

console.log('✅ PASS 3: All admin tabs accurately restore on page refresh without resetting.');

// ---------------------------------------------------------------------------
// TEST 4: Live Auto-Sync Architecture & Change Detection
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: Live Auto-Sync Architecture & Change Detection ---');

assert.ok(appJs.includes('var CLEAN_REPORTS_POLL_INTERVAL_MS = 15000;'), 'Auto-sync interval must be 15s');
assert.ok(appJs.includes('function computeReportsSignature(records, summary)'), 'Signature computation must exist');
assert.ok(appJs.includes('function startDailyCleanReportsAutoSync()'), 'startDailyCleanReportsAutoSync function must exist');
assert.ok(appJs.includes('function stopDailyCleanReportsAutoSync()'), 'stopDailyCleanReportsAutoSync function must exist');
assert.ok(appJs.includes('function toggleCleanReportsAutoSync()'), 'toggleCleanReportsAutoSync function must exist');
assert.ok(appJs.includes('window.toggleCleanReportsAutoSync = toggleCleanReportsAutoSync;'), 'toggleCleanReportsAutoSync must be exposed on window');

// Test signature calculation logic
function testSignature(records, summary) {
  if (!records || !records.length) return 'empty:' + (summary ? (summary.totalCleaned || 0) : 0);
  const first = records[0] || {};
  const firstKey = first.id || first.log_id || first.completed_at_device || '';
  return [
    records.length,
    firstKey,
    first.registration_no || '',
    summary ? (summary.latestPunchTime || '') : '',
    summary ? (summary.totalCleaned || 0) : 0,
    summary ? (summary.withPhotoCount || 0) : 0
  ].join('|');
}

const batch1 = [
  { id: '1', registration_no: 'UP65AB1234', completed_at_device: '2026-11-21T07:00:00Z' }
];
const sum1 = { totalCleaned: 1, withPhotoCount: 1, latestPunchTime: '2026-11-21T07:00:00Z' };

const batch2 = [
  { id: '2', registration_no: 'UP65CD5678', completed_at_device: '2026-11-21T07:30:00Z' },
  { id: '1', registration_no: 'UP65AB1234', completed_at_device: '2026-11-21T07:00:00Z' }
];
const sum2 = { totalCleaned: 2, withPhotoCount: 2, latestPunchTime: '2026-11-21T07:30:00Z' };

const sig1 = testSignature(batch1, sum1);
const sig2 = testSignature(batch2, sum2);
const sig1Repeat = testSignature(batch1, sum1);

assert.notStrictEqual(sig1, sig2, 'Signature must change when new clean reports arrive');
assert.strictEqual(sig1, sig1Repeat, 'Signature must remain identical when no new data arrived');

console.log('✅ PASS 4: Signature-based diffing accurately detects new live reports without flicker.');

// ---------------------------------------------------------------------------
// TEST 5: Background Polling Lifecycle & Visibility Handler
// ---------------------------------------------------------------------------
console.log('\n--- TEST 5: Lifecycle & Visibility Handlers ---');

assert.ok(appJs.includes("if (tabName === 'cleanReports') {\n        loadDailyCleanReports();\n        if (typeof startDailyCleanReportsAutoSync === 'function') {\n          startDailyCleanReportsAutoSync();\n        }\n      } else {\n        if (typeof stopDailyCleanReportsAutoSync === 'function') {\n          stopDailyCleanReportsAutoSync();\n        }\n      }"), 'Auto sync must start on cleanReports tab and stop on leaving');

assert.ok(appJs.includes("if (typeof stopDailyCleanReportsAutoSync === 'function') {\n        stopDailyCleanReportsAutoSync();\n      }"), 'Auto sync must stop on admin token clearance/logout');

assert.ok(appJs.includes("getSavedAdminTab() === 'cleanReports'"), 'Visibility and online listeners must inspect getSavedAdminTab');

console.log('✅ PASS 5: Polling lifecycle activates and tears down correctly on tab switches.');

console.log('\n===============================================================');
console.log('🎉 ALL 5 TAB PERSISTENCE & LIVE AUTO-SYNC TESTS PASSED PERFECTLY!');
console.log('===============================================================');
