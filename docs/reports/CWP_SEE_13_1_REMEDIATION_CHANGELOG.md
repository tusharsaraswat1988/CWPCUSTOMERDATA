# CWP SEE-13.1 — Remediation Changelog

## 1. Test-Data Pollution in Services & Add-ons Compatibility
- **Defect**: `S03_SVC_*` and `S07_WASH_*` test services bypassed Services `Hide Test Data`, and Add-ons lacked `Hide Test Data` in listing and `Hide Test Services` in the Compatible Services selector.
- **Root Cause**: `isTestRecord()` in `v2-see-services.js` only checked `TEST_` / `SEE03`; `v2-see-addons.js` had no test-record filter.
- **Files Modified**: `public/admin-v2/js/v2-see-services.js`, `public/admin-v2/js/v2-see-addons.js`, `public/admin-v2/index.html`
- **Fix**: Expanded `isTestRecord()` to match `TEST_`, `S03_`, `S07_`, `SEE03`, `SEE07`; added `.cwp-v2-filter-chip` `Hide Test Data` (`#v2SeeProdAddonHideTestBtn`) and `Hide Test Services` (`#v2SeeProdAddonCompatHideTestBtn`) while preserving already-selected IDs and showing `service_code` on test chips.

## 2. Add-ons Media & Checklist Parity with Services
- **Defect**: Add-ons media dropzones lacked drag-and-drop, `Replace` button, and `#v2SeeMediaLightbox` enlarge; Add-ons checklist lacked inline Edit and Move Up/Down reorder.
- **Root Cause**: `v2-see-addons.js` implemented a subset of the Services handlers.
- **Files Modified**: `public/admin-v2/js/v2-see-addons.js`
- **Fix**: Added `dragover`/`dragleave`/`drop`, `Replace`, and `#v2SeeMediaLightbox` enlarge on modal & drawer; added inline Edit, Move Up/Down, and empty/duplicate validation to Add-ons checklist.

## 3. Regression Tests Added & Results
- **Test Added**: [tests/test_see_13_1_functional_qa.js](file:///d:/cwp%20customer%20data%20app/tests/test_see_13_1_functional_qa.js)
- **Result**: `ALL PASSED` (`exit code 0`); `tests/test_see_engine_qa.js` `8 PASSED, 0 FAILED`.
