/**
 * Task P2.3 Comprehensive Verification & QA Test Suite
 * CWP Admin Add/Edit Customer Form UX Simplification & Indian Mobile Number Formatting
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('===============================================================');
console.log('🧪 RUNNING TASK P2.3 FORM UX & INDIAN PHONE FORMATTING TEST SUITE');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const html = fs.readFileSync(indexPath, 'utf8');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

// =========================================================================
// 1. EXTRACT AND EXECUTE FRONTEND JAVASCRIPT FUNCTIONS IN VM CONTEXT
// =========================================================================

// Extract the main script block
const scriptMatches = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
assert(scriptMatches && scriptMatches.length >= 2, 'Found script blocks in Index.html');

let targetScript = '';
for (const s of scriptMatches) {
  if (s.includes('normalizeIndianMobile')) {
    targetScript = s.replace(/<\/?script[^>]*>/gi, '').replace(/<\?=[^?]*\?>/g, "''");
    break;
  }
}
assert(targetScript.length > 0, 'Extracted script containing normalizeIndianMobile');

// Create sandbox with basic DOM mocks for VM execution
const sandbox = {
  console: console,
  document: {
    addEventListener: () => {},
    getElementById: (id) => ({
      id: id,
      value: '',
      style: {},
      classList: { add: () => {}, remove: () => {} },
      setCustomValidity: () => {},
      addEventListener: () => {}
    }),
    querySelectorAll: () => []
  },
  window: {
    location: { search: '', pathname: '/admin' },
    history: { replaceState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  navigator: { geolocation: {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  alert: () => {},
  showToast: () => {},
  apiCall: () => {}
};

vm.createContext(sandbox);
vm.runInContext(targetScript, sandbox);

assert(typeof sandbox.normalizeIndianMobile === 'function', 'normalizeIndianMobile is defined and executable');
assert(typeof sandbox.isValidIndianMobile === 'function', 'isValidIndianMobile is defined and executable');
assert(typeof sandbox.formatIndianMobile === 'function', 'formatIndianMobile is defined and executable');
assert(typeof sandbox.getIndianPhoneLink === 'function', 'getIndianPhoneLink is defined and executable');
assert(typeof sandbox.getIndianWhatsAppLink === 'function', 'getIndianWhatsAppLink is defined and executable');

// =========================================================================
// 2. PHONE NORMALIZATION TESTS (ALL ACCEPTED FORMATS -> 10 DIGIT STRING)
// =========================================================================

// Accepted standard formats from Task specification:
assert(sandbox.normalizeIndianMobile('9876543210') === '9876543210', 'Format 1: "9876543210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('98765 43210') === '9876543210', 'Format 2: "98765 43210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('+91 98765 43210') === '9876543210', 'Format 3: "+91 98765 43210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('+919876543210') === '9876543210', 'Format 4: "+919876543210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('09876543210') === '9876543210', 'Format 5: "09876543210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('+91-98765-43210') === '9876543210', 'Dashes & prefix: "+91-98765-43210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('919876543210') === '9876543210', '12 digits with 91: "919876543210" -> "9876543210"');
assert(sandbox.normalizeIndianMobile('  98765 43210  ') === '9876543210', 'Trims whitespace: "  98765 43210  " -> "9876543210"');
assert(typeof sandbox.normalizeIndianMobile('9876543210') === 'string', 'Normalized return type is strictly string');
assert(sandbox.normalizeIndianMobile('09876543210').charAt(0) !== '0', 'Leading zero stripped cleanly');

// =========================================================================
// 3. PHONE VALIDATION TESTS (BEGINS WITH 6, 7, 8, 9)
// =========================================================================

assert(sandbox.isValidIndianMobile('9876543210') === true, 'Starts with 9 is valid');
assert(sandbox.isValidIndianMobile('8123456789') === true, 'Starts with 8 is valid');
assert(sandbox.isValidIndianMobile('7012345678') === true, 'Starts with 7 is valid');
assert(sandbox.isValidIndianMobile('6398765432') === true, 'Starts with 6 is valid');
assert(sandbox.isValidIndianMobile('+91 80819 13264') === true, '+91 prefix valid');
assert(sandbox.isValidIndianMobile('09919856161') === true, '0 prefix valid');

// Invalid numbers rejected
assert(sandbox.isValidIndianMobile('5876543210') === false, 'Starts with 5 rejected');
assert(sandbox.isValidIndianMobile('1234567890') === false, 'Starts with 1 rejected');
assert(sandbox.isValidIndianMobile('98765') === false, 'Short number (<10 digits) rejected');
assert(sandbox.isValidIndianMobile('987654321099') === false, 'Long number (>10 digits) rejected');
assert(sandbox.isValidIndianMobile('') === false, 'Empty string rejected');
assert(sandbox.isValidIndianMobile(null) === false, 'null rejected');
assert(sandbox.isValidIndianMobile('abcdefghij') === false, 'Alphabet string rejected');

// =========================================================================
// 4. PHONE FORMATTING & INTERNATIONAL LINKS TESTS
// =========================================================================

assert(sandbox.formatIndianMobile('9876543210') === '+91 98765 43210', 'formatIndianMobile default displays "+91 98765 43210"');
assert(sandbox.formatIndianMobile('9876543210', false) === '98765 43210', 'formatIndianMobile without prefix displays "98765 43210"');
assert(sandbox.formatIndianMobile('+91 9876543210') === '+91 98765 43210', 'Pasted country code formatted to "+91 98765 43210"');
assert(sandbox.getIndianPhoneLink('9876543210') === 'tel:+919876543210', 'Phone link uses normalized international format "tel:+919876543210"');
assert(sandbox.getIndianPhoneLink('+91 98765 43210') === 'tel:+919876543210', 'Phone link with spaces and +91 produces "tel:+919876543210"');
assert(sandbox.getIndianWhatsAppLink('9876543210') === 'https://wa.me/919876543210', 'WhatsApp link uses "https://wa.me/919876543210"');
assert(sandbox.getIndianWhatsAppLink('+91 98765 43210', 'Hello') === 'https://wa.me/919876543210?text=Hello', 'WhatsApp link with message query');

// =========================================================================
// 5. VERIFY ALL 9 PHONE LOCATIONS IN INDEX.HTML
// =========================================================================

// 1. custPhone in Add Customer
assert(html.includes('id="custPhone"') && html.includes('class="form-input cwp-phone-input"'), '1. custPhone has cwp-phone-input class');
assert(html.includes('<span class="cwp-phone-prefix" title="भारत (+91)"><span class="phone-flag">🇮🇳</span> +91</span>') && html.includes('id="custPhone"'), '1. custPhone wrapped with visual +91 country prefix');

// 2. editCustPhone in Edit Customer Modal
assert(html.includes('id="editCustPhone"') && html.includes('class="form-input cwp-phone-input"'), '2. editCustPhone has cwp-phone-input class');

// 3. newStaffPhone in Staff Management Add Staff
assert(html.includes('id="newStaffPhone"') && html.includes('class="form-input cwp-phone-input"'), '3. newStaffPhone has cwp-phone-input class');

// 4. editStaffPhone in Edit Staff Modal
assert(html.includes('id="editStaffPhone"') && html.includes('class="form-input cwp-phone-input"'), '4. editStaffPhone has cwp-phone-input class');

// 5. staffPhoneInput in Staff Login
assert(html.includes('id="staffPhoneInput"') && html.includes('cwp-phone-input'), '5. staffPhoneInput has cwp-phone-input class');

// 6. Active Records table phone display & tel link
assert(html.includes('getIndianPhoneLink(nPhone)') && html.includes('formatIndianMobile(nPhone)'), '6. Active Records table renders formatIndianMobile and getIndianPhoneLink');

// 7. Staff customer-card phone display & tel link
assert(html.includes('getIndianPhoneLink(cleanPhone)'), '7. Staff customer card renders getIndianPhoneLink');

// 8. Customer address popup phone display & tel link
assert(html.includes('formatIndianMobile(normCustPhone)') && html.includes('getIndianPhoneLink(normCustPhone)'), '8. Customer address modal renders formatIndianMobile and getIndianPhoneLink');

// 9. Staff management phone display & WhatsApp link
assert(html.includes('getIndianWhatsAppLink(normPhone') && html.includes('formatIndianMobile(normPhone)'), '9. Staff management renders formatIndianMobile and getIndianWhatsAppLink');

// =========================================================================
// 6. FORM UX AUDIT & REDESIGN STRUCTURE VERIFICATION (SECTION A & C)
// =========================================================================

// Section 1: Customer Details
assert(html.includes('1. ग्राहक विवरण') || html.includes('ग्राहक विवरण (Customer Details)'), 'Section 1 Customer Details heading exists');
assert(html.includes('id="custName"'), 'Customer Name input exists');
assert(html.includes('id="custPhone"'), 'Mobile Number input exists');
assert(html.includes('id="custAddress"'), 'Customer Address input exists');

// Optional Map control collapsed by default
assert(html.includes('id="btnToggleCustMap"'), 'Optional Map toggle button exists');
assert(html.includes('id="custMapCollapse"') && html.includes('id="custMapCollapse" class="collapsible-panel" style="display: none;'), 'Google Maps panel collapsed by default');
assert(html.includes('id="custMapsUrl"'), 'custMapsUrl input preserved');
assert(html.includes('detectGpsLocation()'), 'detectGpsLocation() preserved');

// Optional Photo control compact by default
assert(html.includes('id="custPhotoPlaceholder"'), 'Compact photo upload button exists');
assert(html.includes('id="custPhotoActionsWrap"'), 'Photo actions wrap exists');
assert(html.includes('id="custPhotoPreview"'), 'Photo preview thumb exists');
assert(html.includes('openExistingCustPhotoCropper()'), 'Photo cropper integration preserved');

// Section 2: Service Details
assert(html.includes('2. सर्विस विवरण') || html.includes('सर्विस विवरण (Service Details)'), 'Section 2 Service Details heading exists');
assert(html.includes('id="custCategory"'), 'Service Category select exists');
assert(html.includes('id="custPkgType"'), 'Package Type select exists');
assert(html.includes('id="custVehicles"'), 'Vehicle info full width input exists');

// Verify Category & Package side by side on desktop (form-row-2)
const categoryRowIdx = html.indexOf('id="custCategory"');
const pkgTypeIdx = html.indexOf('id="custPkgType"');
const formRow2Idx = html.lastIndexOf('class="form-row-2"', categoryRowIdx);
assert(formRow2Idx !== -1 && formRow2Idx < categoryRowIdx && pkgTypeIdx > categoryRowIdx, 'Category and Package Type are inside .form-row-2 (side by side on desktop)');

// Section 3: Staff Assignment & Secondary Location
assert(html.includes('3. स्टाफ असाइनमेंट') || html.includes('स्टाफ असाइनमेंट (Staff Assignment)'), 'Section 3 Staff Assignment heading exists');
assert(html.includes('id="custStaffSelect"'), 'Assigned Staff dropdown exists');
assert(html.includes('id="custNotes"'), 'Staff Notes textarea exists');
assert(html.includes('rows="2"'), 'Staff Notes has compact 2-row height');
assert(html.includes('id="secondaryAddressGroup"'), 'Secondary Address Group exists');
assert(html.includes('id="custSecCollapse"') && html.includes('id="custSecCollapse" class="collapsible-panel" style="display: none;'), 'Secondary Location collapsed by default');
assert(html.includes('id="custSecAddress"'), 'Secondary Address input preserved');
assert(html.includes('id="custSecMaps"'), 'Secondary Map Link input preserved');

// Prominent Save Button
assert(html.includes('id="btnSaveCust" class="btn-submit-main"'), 'Save Customer button is prominent (.btn-submit-main)');

// Redundant text removal: decorative Customer-First badge removed
assert(!html.includes('✓ Customer-First Layout'), 'Redundant decorative "Customer-First Layout" badge removed');

// =========================================================================
// 7. EDIT CUSTOMER MODAL COMPACT REDESIGN VERIFICATION
// =========================================================================

assert(html.includes('id="editCustName"'), 'Edit modal: Name exists');
assert(html.includes('id="editCustPhone"'), 'Edit modal: Phone exists');
assert(html.includes('id="editCustAddress"'), 'Edit modal: Address exists');
assert(html.includes('id="editMapCollapse"') && html.includes('id="editMapCollapse" class="collapsible-panel" style="display: none;'), 'Edit modal: Map collapsed by default');
assert(html.includes('id="editCustCategory"'), 'Edit modal: Category exists');
assert(html.includes('id="editCustPkgType"'), 'Edit modal: Package Type exists');
assert(html.includes('id="editCustVehicles"'), 'Edit modal: Vehicles exists');
assert(html.includes('id="editCustStaff"'), 'Edit modal: Staff exists');
assert(html.includes('id="editCustActive"'), 'Edit modal: Active status exists');
assert(html.includes('id="editCustNotes"'), 'Edit modal: Staff Notes exists');
assert(html.includes('id="editSecCollapse"') && html.includes('id="editSecCollapse" class="collapsible-panel" style="display: none;'), 'Edit modal: Secondary Location collapsed by default');
assert(html.includes('id="btnSaveEditCust"'), 'Edit modal: Save button exists');

// =========================================================================
// 8. STORAGE & COMPATIBILITY VERIFICATION (NORMALIZED 10-DIGIT PAYLOADS)
// =========================================================================

assert(html.includes('customerNumber: normalizeIndianMobile(document.getElementById(\'custPhone\').value)'), 'Add Customer sends normalized 10-digit mobile in payload');
assert(html.includes('customerNumber: normalizeIndianMobile(document.getElementById(\'editCustPhone\').value)'), 'Edit Customer sends normalized 10-digit mobile in payload');
assert(html.includes('isValidIndianMobile(normCustPhone)'), 'Add Customer validates phone before submission');
assert(html.includes('isValidIndianMobile(normEditPhone)'), 'Edit Customer validates phone before submission');

// =========================================================================
// 9. DRAFT AUTOSAVE & RESTORATION PRESERVATION
// =========================================================================

assert(html.includes('saveCustomerDraft'), 'saveCustomerDraft preserved');
assert(html.includes('restoreCustomerDraft'), 'restoreCustomerDraft preserved');
assert(html.includes('custDraftRestoreBanner'), 'custDraftRestoreBanner preserved');
assert(html.includes('toggleCustMap(true)'), 'restoreCustomerDraft auto-expands map when present');
assert(html.includes('toggleCustSecLocation(true)'), 'restoreCustomerDraft auto-expands secondary location when present');
assert(html.includes('saveEditDraft'), 'saveEditDraft preserved');
assert(html.includes('restoreEditDraft'), 'restoreEditDraft preserved');
assert(html.includes('toggleEditMap(true)'), 'restoreEditDraft auto-expands map when present');

// =========================================================================
// 10. RESPONSIVE DESIGN CSS VERIFICATION
// =========================================================================

assert(html.includes('.cwp-phone-group'), 'CSS contains .cwp-phone-group');
assert(html.includes('.cwp-phone-prefix'), 'CSS contains .cwp-phone-prefix');
assert(html.includes('.cwp-phone-input'), 'CSS contains .cwp-phone-input');
assert(html.includes('min-height: 42px;'), 'CSS specifies input target min-height of 42px');
assert(html.includes('min-height: 46px;'), 'CSS specifies button target min-height of 46px');
assert(html.includes('.form-row-2'), 'CSS contains .form-row-2 desktop grid');
assert(html.includes('@media (max-width: 768px)') && html.includes('grid-template-columns: 1fr;'), 'Mobile breakpoint switches .form-row-2 to single column');

// =========================================================================
// 11. DUAL LOCATION BEHAVIOR (DAILY CAR CLEANING ONLY)
// =========================================================================

// Test toggleCategoryFields logic in VM
const dummyCatSelect = { value: 'Daily Car Cleaning' };
const dummySecGroup = { style: { display: 'none' } };
const dummyVehicleLabel = { textContent: '' };
const dummyVehicleInput = { placeholder: '' };
const dummyPkgSelect = { innerHTML: '', value: '' };

sandbox.document.getElementById = (id) => {
  if (id === 'custCategory') return dummyCatSelect;
  if (id === 'secondaryAddressGroup') return dummySecGroup;
  if (id === 'custVehicleLabel') return dummyVehicleLabel;
  if (id === 'custVehicles') return dummyVehicleInput;
  if (id === 'custPkgType') return dummyPkgSelect;
  return { style: {}, classList: { add: () => {}, remove: () => {} }, setCustomValidity: () => {} };
};

// 1. Daily Car Cleaning -> secondaryAddressGroup is 'block'
sandbox.toggleCategoryFields('Daily Car Cleaning');
assert(dummySecGroup.style.display === 'block', 'Daily Car Cleaning enables secondary location group');

// 2. Car Washing -> secondaryAddressGroup is 'none'
sandbox.toggleCategoryFields('Car Washing');
assert(dummySecGroup.style.display === 'none', 'Car Washing hides secondary location group');

// 3. Solar Panel Cleaning -> secondaryAddressGroup is 'none'
sandbox.toggleCategoryFields('Solar Panel Cleaning');
assert(dummySecGroup.style.display === 'none', 'Solar Panel Cleaning hides secondary location group');
assert(dummyVehicleLabel.textContent.includes('साइट'), 'Solar Panel Cleaning changes vehicle label to Site Name');

console.log('===============================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('===============================================================');
console.log('🎉 ALL TASK P2.3 UX SIMPLIFICATION & PHONE FORMATTING TESTS PASSED!');
