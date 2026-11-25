/**
 * QA TEST SUITE: AUTOMATED DOM CONTRACT RECONCILIATION (Task 01.10 P0-3)
 *
 * Verifies that all 11 critical workflows have valid HTML elements matching
 * public/js/app.js DOM contracts, preventing null reference crashes and
 * broken user interactions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runDomContractTests() {
  console.log('--- Running Automated DOM Contract Reconciliation Tests ---');

  const htmlPath = path.join(__dirname, '..', 'Index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Helper to extract id attributes
  const idRegex = /\bid=["']([^"']+)["']/g;
  const htmlIds = new Set();
  let m;
  while ((m = idRegex.exec(html)) !== null) {
    htmlIds.add(m[1]);
  }

  function assertIdExists(id, workflowName) {
    assert.ok(htmlIds.has(id), `[${workflowName}] Element #${id} must exist in Index.html`);
  }

  // 1. Sell Package Workflow
  console.log('\nChecking Sell Package Workflow elements:');
  const sellPkgIds = [
    'sellPackageModal',
    'sellPackageForm',
    'sellPkgCustomerId',
    'sellPkgCustName',
    'sellPkgCustMeta',
    'sellPkgCategory',
    'sellPkgCatalogSelect',
    'sellPkgName',
    'sellPkgTotalQuantity',
    'sellPkgPrice',
    'sellPkgValidityMonths',
    'sellPkgPaymentStatus',
    'sellPkgAssetSelect',
    'sellPkgLocationSelect',
    'sellPkgNotes',
    'btnSubmitSellPackage'
  ];
  sellPkgIds.forEach(id => assertIdExists(id, 'Sell Package'));
  console.log(`✅ PASS: All ${sellPkgIds.length} Sell Package DOM contract elements verified`);

  // 2. Redeem Package Workflow
  console.log('\nChecking Redeem Package Workflow elements:');
  const redeemPkgIds = [
    'redeemPackageModal',
    'redeemPackageForm',
    'redeemPackageId',
    'redeemPkgNameDisplay',
    'redeemPkgCustDisplay',
    'redeemPkgRemainingQty',
    'redeemPkgTotalQty',
    'redeemQuantity',
    'redeemServiceDate',
    'redeemAssetSelect',
    'redeemLocationSelect',
    'redeemNotes',
    'btnSubmitRedeemPackage'
  ];
  redeemPkgIds.forEach(id => assertIdExists(id, 'Redeem Package'));
  console.log(`✅ PASS: All ${redeemPkgIds.length} Redeem Package DOM contract elements verified`);

  // 3. Package History Workflow
  console.log('\nChecking Package History Workflow elements:');
  const pkgHistoryIds = [
    'packageHistoryModal',
    'pkgHistoryTitle',
    'pkgHistoryMeta',
    'pkgHistoryListContainer'
  ];
  pkgHistoryIds.forEach(id => assertIdExists(id, 'Package History'));
  console.log(`✅ PASS: All ${pkgHistoryIds.length} Package History DOM contract elements verified`);

  // 4. Create Booking Workflow
  console.log('\nChecking Create Booking Workflow elements:');
  const bookingIds = [
    'createBookingModal',
    'createBookingForm',
    'bookingCustomerId',
    'bookingCustNameDisplay',
    'bookingCustPhoneDisplay',
    'bookingCustIdBadge',
    'bookingCategorySelect',
    'bookingServiceType',
    'bookingTimeSlot',
    'bookingPrice',
    'bookingPaymentStatus',
    'bookingPackageSelect',
    'bookingVehicleSelect',
    'bookingLocationSelect',
    'bookingScheduledDate',
    'bookingCleanerSelect',
    'bookingNotes',
    'btnSubmitCreateBooking'
  ];
  bookingIds.forEach(id => assertIdExists(id, 'Create Booking'));
  console.log(`✅ PASS: All ${bookingIds.length} Create Booking DOM contract elements verified`);

  // 5. Cleaning Camera / Non-Completion Workflow
  console.log('\nChecking Camera Non-completion Workflow elements:');
  const cameraIds = [
    'cameraReviewView',
    'cameraCarNotPresentCheck',
    'cameraCarNotPresentBadge',
    'cameraNonCompletionReasonBox',
    'cameraNonCompletionReasonSelect',
    'cameraNonCompletionNotes',
    'btnReviewRetake',
    'btnConfirmCleanPhoto'
  ];
  cameraIds.forEach(id => assertIdExists(id, 'Cleaning Camera'));
  console.log(`✅ PASS: All ${cameraIds.length} Cleaning Camera Non-completion DOM elements verified`);

  // 6. Staff Edit Modal Lock/Session Banners
  console.log('\nChecking Staff Edit Lock & Active Session Workflow elements:');
  const staffEditIds = [
    'editStaffId',
    'editStaffIdDisplay',
    'editStaffName',
    'editStaffPhone',
    'modalStaffLockedBanner',
    'modalStaffLockedReason',
    'modalStaffActiveSessionBanner',
    'modalStaffActiveSessionInfo'
  ];
  staffEditIds.forEach(id => assertIdExists(id, 'Staff Edit'));
  console.log(`✅ PASS: All ${staffEditIds.length} Staff Edit Lock/Session DOM elements verified`);

  // 7. Special Job Actions & Reassign Workflow
  console.log('\nChecking Special Job Actions & Reassign Workflow elements:');
  const specialJobIds = [
    'assignSpecialJobModal',
    'assignSpecialJobForm',
    'specialExistingCustSelect',
    'specialCustName',
    'specialCustPhone',
    'specialCustAddress',
    'specialServiceCategory',
    'specialScheduledDate',
    'specialScheduledTime',
    'specialSequenceOrder',
    'specialStaffSelect',
    'btnSubmitAssignSpecial',
    'reassignJobModal',
    'reassignJobForm',
    'reassignJobTargetId',
    'reassignCustName',
    'reassignServiceMeta',
    'reassignCurrentStaff',
    'reassignNewStaffSelect',
    'reassignScheduledTime',
    'reassignSequenceOrder',
    'reassignReason',
    'btnSubmitReassignJob',
    'jobAssignmentsTableBody',
    'jobAssignmentActiveCount',
    'specialActiveBadge'
  ];
  specialJobIds.forEach(id => assertIdExists(id, 'Special Jobs / Reassign'));
  console.log(`✅ PASS: All ${specialJobIds.length} Special Job & Reassign DOM elements verified`);

  // 8. Designation & Authorities Workflow
  console.log('\nChecking Designation & Authorities Workflow elements:');
  const designationIds = [
    'designationManagementModal',
    'addDesignationFormContainer',
    'btnToggleAddDesigForm',
    'designationsTableContainer'
  ];
  designationIds.forEach(id => assertIdExists(id, 'Designations'));
  console.log(`✅ PASS: All ${designationIds.length} Designation Management DOM elements verified`);

  // 9. Staff Hierarchy Workflow
  console.log('\nChecking Staff Hierarchy Workflow elements:');
  const hierarchyIds = [
    'staffHierarchyModal',
    'staffHierarchyTreeContainer',
    'staffHierarchySummaryChips'
  ];
  hierarchyIds.forEach(id => assertIdExists(id, 'Staff Hierarchy'));
  console.log(`✅ PASS: All ${hierarchyIds.length} Staff Hierarchy DOM elements verified`);

  // 10. Seater Sizing & Vehicle Labels Workflow
  console.log('\nChecking Seater Sizing & Vehicle Labels Workflow elements:');
  const seaterIds = [
    'custVehicleLabel',
    'custVehicles',
    'custSeaterRow',
    'labelCustSeater5',
    'labelCustSeater5Plus',
    'custSeaterTypeHidden',
    'editCustVehiclesLabel',
    'editCustVehicles',
    'editCustSeaterRow',
    'labelEditCustSeater5',
    'labelEditCustSeater5Plus',
    'editCustSeaterTypeHidden',
    'labelConvertSeater5',
    'labelConvertSeater5Plus',
    'convertSeaterTypeHidden'
  ];
  seaterIds.forEach(id => assertIdExists(id, 'Vehicle & Seater'));
  console.log(`✅ PASS: All ${seaterIds.length} Vehicle Label & Seater Sizing DOM elements verified`);

  // 11. Reports Route Filter
  console.log('\nChecking Daily Clean Reports Route Filter elements:');
  const reportFilterIds = [
    'reportStaffFilter',
    'reportPhotoFilter',
    'reportRouteFilter',
    'reportSearchFilter'
  ];
  reportFilterIds.forEach(id => assertIdExists(id, 'Clean Reports Filter'));
  console.log(`✅ PASS: All ${reportFilterIds.length} Daily Clean Reports Filter DOM elements verified`);

  console.log('\n===============================================================');
  console.log('🎉 ALL 11 DOM CONTRACT WORKFLOWS VERIFIED PERFECTLY (100+ IDS)!');
  console.log('===============================================================\n');
}

runDomContractTests();
