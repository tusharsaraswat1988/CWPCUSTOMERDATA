/**
 * Comprehensive Automated Frontend QA Test Suite for:
 * 1. Daily Clean Photo Verification & Camera Modal
 * 2. Instant WhatsApp Sharing & Persistent Customer Card WhatsApp Button
 * 3. Staff Team WhatsApp Group Configuration
 * 4. Admin Daily Clean Reports Section (KPIs, Filters, Table, Lightbox & CSV Export)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('===============================================================');
console.log('🚀 RUNNING DAILY CLEAN PHOTO & ADMIN REPORTS FRONTEND TEST SUITE');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// 1. Static HTML Assertions
console.log('\n--- TEST 1: DOM Elements Verification ---');
assert.ok(indexHtml.includes('id="cleaningCameraModal"'), 'Camera modal element must exist in Index.html');
assert.ok(indexHtml.includes('id="cameraCaptureView"'), 'Camera capture view must exist');
assert.ok(indexHtml.includes('id="cleaningCameraFeed"'), 'Camera video feed element must exist');
assert.ok(indexHtml.includes('id="cameraReviewView"'), 'Visual check review view must exist');
assert.ok(indexHtml.includes('id="cameraPreviewImg"'), 'Camera preview image must exist');
assert.ok(indexHtml.includes('id="cameraNativeFileInput"'), 'Native camera file input fallback must exist');
assert.ok(indexHtml.includes('id="btnConfirmCleanPhoto"'), 'Confirm and save photo button must exist');
console.log('✅ PASS: Camera modal and all visual check components exist in DOM');

assert.ok(indexHtml.includes('id="reportPhotoLightboxModal"'), 'Report photo lightbox modal must exist');
assert.ok(indexHtml.includes('id="lightboxModalImg"'), 'Lightbox modal image must exist');
assert.ok(indexHtml.includes('id="btnLightboxSendWhatsApp"'), 'Lightbox forward to WhatsApp button must exist');
console.log('✅ PASS: Admin photo lightbox modal exists in DOM');

assert.ok(indexHtml.includes('id="staffWhatsAppGroupModal"'), 'Staff WhatsApp group modal must exist');
assert.ok(indexHtml.includes('id="staffWaGroupInput"'), 'Staff WhatsApp group input must exist');
console.log('✅ PASS: Staff WhatsApp group setting modal exists in DOM');

assert.ok(indexHtml.includes('id="tabBtnCleanReports"'), 'Admin Daily Clean Reports tab button must exist');
assert.ok(indexHtml.includes('id="adminTabCleanReports"'), 'Admin Daily Clean Reports pane must exist');
assert.ok(indexHtml.includes('id="kpiTotalCleaned"'), 'KPI Total Cleaned element must exist');
assert.ok(indexHtml.includes('id="kpiPhotoRate"'), 'KPI Photo Verified Rate element must exist');
assert.ok(indexHtml.includes('id="kpiActiveStaff"'), 'KPI Active Staff element must exist');
assert.ok(indexHtml.includes('id="kpiLatestPunch"'), 'KPI Latest Punch element must exist');
assert.ok(indexHtml.includes('id="adminCleanReportsTableBody"'), 'Reports table body must exist');
console.log('✅ PASS: Admin Daily Clean Reports tab, KPI cards, and table exist in DOM');

// 2. Functional Client-Side Verification in VM
console.log('\n--- TEST 2: Functional Client-Side JavaScript Logic ---');
const scriptStart = indexHtml.lastIndexOf('<script>');
const scriptEnd = indexHtml.lastIndexOf('</script>');
const clientScriptCode = indexHtml.slice(scriptStart + 8, scriptEnd);

function createMockEnv() {
  const localStore = {};
  const mockElements = {};

  function getMockEl(id) {
    if (!mockElements[id]) {
      mockElements[id] = {
        id: id,
        style: {},
        classList: {
          _classes: new Set(),
          add: function(c) { this._classes.add(c); },
          remove: function(c) { this._classes.delete(c); },
          toggle: function(c, force) {
            if (force === true) this._classes.add(c);
            else if (force === false) this._classes.delete(c);
            else if (this._classes.has(c)) this._classes.delete(c);
            else this._classes.add(c);
          },
          contains: function(c) { return this._classes.has(c); }
        },
        innerHTML: '',
        textContent: '',
        value: '',
        options: [{ value: 'all', textContent: 'All Staff' }],
        appendChild: function(opt) { this.options.push(opt); },
        click: function() {}
      };
    }
    return mockElements[id];
  }

  const documentMock = {
    addEventListener: () => {},
    getElementById: (id) => getMockEl(id),
    createElement: (tag) => {
      return {
        tagName: tag,
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        getContext: () => ({
          drawImage: () => {},
          fillRect: () => {},
          fillText: () => {}
        }),
        toDataURL: () => 'data:image/jpeg;base64,mockdata'
      };
    },
    body: {
      style: {},
      appendChild: () => {},
      removeChild: () => {}
    }
  };

  const windowMock = {
    location: { href: 'http://localhost:3000/?staff=STF01', pathname: '/', search: '?staff=STF01' },
    history: { replaceState: () => {} },
    localStorage: {
      getItem: (k) => localStore[k] || null,
      setItem: (k, v) => { localStore[k] = String(v); },
      removeItem: (k) => { delete localStore[k]; },
      _store: localStore
    },
    document: documentMock,
    navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0',
      mediaDevices: { getUserMedia: () => Promise.resolve({}) }
    },
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    open: () => {},
    print: () => {}
  };

  const sandbox = {
    window: windowMock,
    document: documentMock,
    localStorage: windowMock.localStorage,
    navigator: windowMock.navigator,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    URL: {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {}
    },
    Blob: function(parts) { this.parts = parts; },
    Image: function() {
      this.onload = () => {};
      this.src = '';
    },
    Intl: Intl,
    Set: Set,
    Map: Map,
    Date: Date,
    JSON: JSON,
    Math: Math,
    confirm: () => true,
    showToast: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(clientScriptCode, sandbox);

  return { sandbox, localStore, getMockEl };
}

const { sandbox, localStore, getMockEl } = createMockEnv();

// Verify Exported Functions
assert.strictEqual(typeof sandbox.window.handleDailyCleanClick, 'function', 'handleDailyCleanClick must be a function');
assert.strictEqual(typeof sandbox.window.openCleaningCameraModal, 'function', 'openCleaningCameraModal must be a function');
assert.strictEqual(typeof sandbox.window.confirmAndSaveCleaningPhoto, 'function', 'confirmAndSaveCleaningPhoto must be a function');
assert.strictEqual(typeof sandbox.window.handleCustomerWhatsAppShare, 'function', 'handleCustomerWhatsAppShare must be a function');
assert.strictEqual(typeof sandbox.window.loadDailyCleanReports, 'function', 'loadDailyCleanReports must be a function');
assert.strictEqual(typeof sandbox.window.setReportPeriodChip, 'function', 'setReportPeriodChip must be a function');
assert.strictEqual(typeof sandbox.window.openReportPhotoLightbox, 'function', 'openReportPhotoLightbox must be a function');
assert.strictEqual(typeof sandbox.window.exportDailyCleanReportsCSV, 'function', 'exportDailyCleanReportsCSV must be a function');
assert.strictEqual(typeof sandbox.window.saveStaffWhatsAppGroupSetting, 'function', 'saveStaffWhatsAppGroupSetting must be a function');
console.log('✅ PASS: All required window functions are defined and exposed');

// Test Staff WhatsApp Group Persistence
const testGroupLink = 'https://chat.whatsapp.com/TestGroup123';
getMockEl('staffWaGroupInput').value = testGroupLink;
sandbox.window.saveStaffWhatsAppGroupSetting();
const savedLink = sandbox.window.localStorage.getItem('cwp_staff_wa_group');
assert.strictEqual(savedLink, testGroupLink, 'Staff WhatsApp group link persisted to localStorage');
console.log('✅ PASS: Staff Team WhatsApp group settings persist correctly');

// Test Lightbox Open & Close
const testPhotoUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
sandbox.window.openReportPhotoLightbox(testPhotoUrl, 'UP 16 AB 1234 - Ramesh Sharma', 'Staff: Chandan • 09:30 AM', '9919856161');
assert.strictEqual(getMockEl('lightboxModalImg').src, testPhotoUrl, 'Lightbox image src updated');
assert.strictEqual(getMockEl('reportPhotoLightboxModal').style.display, 'flex', 'Lightbox displayed');
sandbox.window.closeReportPhotoLightbox();
assert.strictEqual(getMockEl('reportPhotoLightboxModal').style.display, 'none', 'Lightbox closed cleanly');
console.log('✅ PASS: Report photo lightbox opens and closes cleanly with metadata');

// Test Daily Clean Store & Completion Object
const todayKey = sandbox.window.getTodayDateKey();
const mockStore = sandbox.window.getDailyCleanStore();
mockStore['STF01'] = {};
mockStore['STF01'][todayKey] = {
  'cust_99': {
    done: true,
    photoUrl: testPhotoUrl,
    completedAt: '2026-11-21T09:30:00+05:30',
    vehicle: 'UP 16 AB 1234'
  }
};
sandbox.window.saveDailyCleanStore(mockStore);

const compData = sandbox.window.getCustomerCompletionData('cust_99', 'STF01');
assert.ok(compData, 'Completion data found');
assert.strictEqual(compData.done, true, 'Marked done');
assert.strictEqual(compData.photoUrl, testPhotoUrl, 'Photo URL preserved');
assert.strictEqual(sandbox.window.isCustomerDoneToday('cust_99', 'STF01'), true, 'isCustomerDoneToday returns true');
console.log('✅ PASS: Structured completion data preserves photoUrl and timestamp in store');

console.log('\n===============================================================');
console.log('🎉 ALL FRONTEND AND DOM COMPONENT TESTS PASSED PERFECTLY!');
console.log('===============================================================');
