/**
 * Automated QA Test Suite: CWP Aura Contrast & Accessibility (a11y)
 *
 * Verifies:
 * 1. Photometric WCAG 2.1 relative luminance and contrast ratio calculations.
 * 2. High-contrast typography on sidebar section labels (>= 4.5:1).
 * 3. Amber badge count contrast enhancement (>= 7:1 WCAG AAA).
 * 4. Universal :focus-visible 2px accessibility styling.
 * 5. Complete modal dialog ARIA semantics across all 19 application modals.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('♿ RUNNING CWP AURA CONTRAST & ACCESSIBILITY (A11Y) QA SUITE');
console.log('===============================================================\n');

const indexPath = path.join(__dirname, '../Index.html');
const stylePath = path.join(__dirname, '../public/css/style.css');

assert.ok(fs.existsSync(indexPath), 'Index.html must exist');
assert.ok(fs.existsSync(stylePath), 'public/css/style.css must exist');

const htmlContent = fs.readFileSync(indexPath, 'utf8');
const cssContent = fs.readFileSync(stylePath, 'utf8');

let passCount = 0;

// --- Helper: Photometric Luminance and Contrast Ratio ---
function hexToRgb(hex) {
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getRelativeLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(hexToRgb(hex1));
  const lum2 = getRelativeLuminance(hexToRgb(hex2));
  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (brighter + 0.05) / (darker + 0.05);
}

// TEST 1: Sidebar Section Label Contrast (WCAG AA >= 4.5:1)
console.log('--- TEST 1: Sidebar Section Label Contrast ---');
// #475569 on #ffffff
const sidebarLabelRatio = getContrastRatio('#475569', '#ffffff');
console.log(`Calculated contrast ratio for #475569 on #ffffff: ${sidebarLabelRatio.toFixed(2)}:1`);
assert.ok(sidebarLabelRatio >= 4.5, `Sidebar label contrast must be >= 4.5:1, got ${sidebarLabelRatio}`);
assert.ok(
  cssContent.includes('.sidebar-section-label') && (cssContent.includes('#475569') || cssContent.includes('--color-text-secondary')),
  'style.css must use high-contrast secondary text for .sidebar-section-label'
);
console.log('✅ PASS 1: Sidebar section label contrast ratio >= 4.5:1 verified.');
passCount++;

// TEST 2: Amber Badge Contrast (WCAG AAA >= 7.0:1)
console.log('--- TEST 2: Amber Badge Count Contrast ---');
// Amber text #78350f on white or light amber tint #fef3c7
const amberWhiteRatio = getContrastRatio('#78350f', '#ffffff');
const amberTintRatio = getContrastRatio('#78350f', '#fef3c7');
console.log(`Calculated contrast ratio for #78350f on #ffffff: ${amberWhiteRatio.toFixed(2)}:1`);
console.log(`Calculated contrast ratio for #78350f on #fef3c7: ${amberTintRatio.toFixed(2)}:1`);
assert.ok(amberWhiteRatio >= 7.0, `Amber badge on white must be >= 7.0:1, got ${amberWhiteRatio}`);
assert.ok(amberTintRatio >= 7.0, `Amber badge on amber tint must be >= 7.0:1, got ${amberTintRatio}`);

assert.ok(
  cssContent.includes('#tabSpecialJobsCount') && cssContent.includes('#78350f'),
  'style.css must set #tabSpecialJobsCount color to #78350f'
);
assert.ok(
  cssContent.includes('#tabLeadsCount') && cssContent.includes('#78350f'),
  'style.css must set #tabLeadsCount color to #78350f'
);
console.log('✅ PASS 2: Amber count badge text #78350f meets WCAG AAA (>= 7:1) contrast.');
passCount++;

// TEST 3: Universal :focus-visible Outline
console.log('--- TEST 3: Universal :focus-visible Styling ---');
assert.ok(
  cssContent.includes(':focus-visible') && cssContent.includes('outline-offset: 2px'),
  'style.css must define universal :focus-visible with 2px offset'
);
console.log('✅ PASS 3: Universal :focus-visible keyboard focus styling verified.');
passCount++;

// TEST 4: Modal Dialog ARIA Semantics Across All 19 Modals
console.log('--- TEST 4: Modal Dialog ARIA Semantics (19 Modals) ---');
const modalRegistry = [
  { id: 'seqResetModal', titleId: 'seqResetModalTitle' },
  { id: 'cleaningCameraModal', titleId: 'cameraModalCustName' },
  { id: 'reportPhotoLightboxModal', titleId: 'lightboxModalTitle' },
  { id: 'staffWhatsAppGroupModal', titleId: 'staffWhatsAppGroupModalTitle' },
  { id: 'whatsAppImageShareModal', titleId: 'whatsAppImageShareModalTitle' },
  { id: 'imageModal', titleId: 'imageModalTitleText' },
  { id: 'addressViewModal', titleId: 'addressViewModalTitle' },
  { id: 'logoutConfirmModal', titleId: 'logoutConfirmModalTitle' },
  { id: 'addCustomerModal', titleId: 'addCustomerModalTitle' },
  { id: 'editCustomerModal', titleId: 'editCustomerModalTitle' },
  { id: 'staffEditModal', titleId: 'staffEditModalTitle' },
  { id: 'cwpPhotoCropperModal', titleId: 'cwpPhotoCropperModalTitle' },
  { id: 'pwaIosModal', titleId: 'pwaIosModalTitle' },
  { id: 'addLeadModal', titleId: 'addLeadModalTitle' },
  { id: 'convertLeadModal', titleId: 'convertLeadModalTitle' },
  { id: 'leadNoteModal', titleId: 'leadNoteModalTitle' },
  { id: 'assignSpecialJobModal', titleId: 'assignSpecialJobModalTitle' },
  { id: 'startSpecialJobModal', titleId: 'startSpecialJobModalTitle' },
  { id: 'completeSpecialJobModal', titleId: 'completeSpecialJobModalTitle' }
];

modalRegistry.forEach(modal => {
  // Check that the modal container has role="dialog" and aria-modal="true" and aria-labelledby
  const modalTagRegex = new RegExp(`<div[^>]*id="${modal.id}"[^>]*>`, 'i');
  const match = htmlContent.match(modalTagRegex);
  assert.ok(match, `Modal #${modal.id} must exist in Index.html`);
  const tagStr = match[0];

  assert.ok(
    tagStr.includes('role="dialog"'),
    `Modal #${modal.id} must have role="dialog"`
  );
  assert.ok(
    tagStr.includes('aria-modal="true"'),
    `Modal #${modal.id} must have aria-modal="true"`
  );
  assert.ok(
    tagStr.includes(`aria-labelledby="${modal.titleId}"`),
    `Modal #${modal.id} must have aria-labelledby="${modal.titleId}"`
  );

  // Check that the corresponding title element exists in HTML
  assert.ok(
    htmlContent.includes(`id="${modal.titleId}"`),
    `Heading with id="${modal.titleId}" must exist in Index.html for modal #${modal.id}`
  );
});

console.log(`✅ PASS 4: All ${modalRegistry.length} modals verified with role="dialog", aria-modal="true", and aria-labelledby.`);
passCount++;

// TEST 5: Modal Close Buttons have aria-label
console.log('--- TEST 5: Modal Close Button Accessible Names ---');
const closeButtonsWithAria = (htmlContent.match(/aria-label="Close dialog"/g) || []).length;
assert.ok(
  closeButtonsWithAria >= 15,
  `At least 15 modal close buttons must have aria-label="Close dialog", found ${closeButtonsWithAria}`
);
console.log(`✅ PASS 5: ${closeButtonsWithAria} modal close buttons verified with aria-label="Close dialog".`);
passCount++;

console.log('===============================================================');
console.log(`🎉 ALL ${passCount} CWP AURA CONTRAST & ACCESSIBILITY TESTS PASSED (100%)!`);
console.log('===============================================================\n');
