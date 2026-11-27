# CWP SEE-13.1 — Functional Verification Report

## 1. Executive Verdict
**PASS WITH LIMITATIONS**
- All backend/API & PostgreSQL persistence flows for Services, Add-ons, Marketing Tag attachment, Compatibility sync, and Media Upload/Replace/Remove/Validation are **VERIFIED** via real DB + API router execution (`tests/test_see_13_1_functional_qa.js` and `tests/test_see_engine_qa.js`).
- Test-data pollution defects in Services (`S03_*`, `S07_*` missed) and Add-ons (no `Hide Test Data` or `Hide Test Services` filter, missing drag-and-drop/Replace/Lightbox/checklist reorder parity) were remediated and verified.
- Live interactive browser DOM clicks (file picker dialog, drag-and-drop in browser) were **not executed** in a live browser session (code/DOM/syntax verified; API/DB verified).

## 2. Scope & Exact Files Inspected
- [public/admin-v2/index.html](file:///d:/cwp%20customer%20data%20app/public/admin-v2/index.html)
- [public/admin-v2/js/v2-see-services.js](file:///d:/cwp%20customer%20data%20app/public/admin-v2/js/v2-see-services.js)
- [public/admin-v2/js/v2-see-addons.js](file:///d:/cwp%20customer%20data%20app/public/admin-v2/js/v2-see-addons.js)
- [services/seeApiRouter.js](file:///d:/cwp%20customer%20data%20app/services/seeApiRouter.js)
- [services/seeCatalogueService.js](file:///d:/cwp%20customer%20data%20app/services/seeCatalogueService.js)
- [db/repositories/seeCatalogueRepo.js](file:///d:/cwp%20customer%20data%20app/db/repositories/seeCatalogueRepo.js)
- [server.js](file:///d:/cwp%20customer%20data%20app/server.js)

## 3. Service Functional Test Results
- **API & DB Persistence (Verified)**: Create (`name`, `nameHi`, `serviceCode`, `serviceCategoryId`, `serviceModel`, `status`, `expectedDurationMinutes`, `tagline`, `description`, `details`, `executionConfig`, `checklistRequirements`, `photoRequirements`, `cityZoneApplicability`), `GET /api/see/services/:id`, `PATCH /api/see/services/:id` (version `1 -> 2`), `POST /api/see/services/:id/status` (`retired`), and `POST /api/see/marketing-tags/attach` — **PASS**.
- **Frontend Controls (Code/DOM/Syntax Verified, Live Browser Pending)**: Search, model/status filters, `Hide Test Data` (`TEST_*`, `S03_*`, `S07_*`, `SEE03`, `SEE07`), pagination, DCC isolation notice/lock, checklist add/edit/reorder/remove/duplicate+empty validation, photo proof toggle, and zone chips.

## 4. Add-on Functional Test Results
- **API & DB Persistence (Verified)**: Create (`addonCode`, `name`, `tagline`, `details`, `pricingModel`, `defaultPrice`, `expectedDurationMinutes`, `defaultQuantity`, `executionMode`, `isOptional`, `checklistRequirements`, `proofRequirements`, `applicableServiceIds`), `GET /api/see/addons/:id`, `PATCH /api/see/addons/:id` (compatibility sync + `retired`) — **PASS**.
- **Frontend Controls (Code/DOM/Syntax Verified, Live Browser Pending)**: Listing, search, mode/status filters, `Hide Test Data`, `Hide Test Services` in compatibility chips (with DCC excluded), all 5 execution modes, checklist add/edit/reorder/remove, photo proof, and Details drawer.

## 5. Media Upload, Persistence, Replace & Remove Results
- `POST /api/see/media/upload` (PNG 1:1, JPEG 4:3, WebP 1:1 replace) — **PASS** (real DB `media_assets` persistence verified).
- Slot isolation (`square_1_1` replace does not overwrite `rectangle_4_3`) — **PASS**.
- `DELETE /api/see/media/:id` — **PASS** (removes target slot row while preserving other slot).

## 6. Image Validation Results
- Client-side (`readImageFile`): JPG/PNG/WebP, `<= 5 MB`, 1:1 (`|ratio - 1.0| <= 0.08`), 4:3 (`|ratio - 4/3| <= 0.15`).
- Server-side (`seeApiRouter.js` + `seeCatalogueService.js`):
  - Unauthorized request -> `401` (**PASS**)
  - Unsupported MIME (`image/gif`) -> `400` (**PASS**)
  - Payload `> 5 MB` -> `400` (**PASS**)
  - Empty `base64` -> `400` (**PASS**)
  - Wrong 1:1 ratio (`200x100`, tolerance `0.05`) -> `400` (**PASS**)
  - Wrong 4:3 ratio (`100x200`, tolerance `0.10`) -> `400` (**PASS**)

## 7. Playground Component Compliance Matrix
| Component | Playground Component Expected | Actual Implementation | Result |
|---|---|---|---|
| Upload | `.cwp-v2-file-dropzone` | `.cwp-v2-file-dropzone` on all 4 slots (Services & Add-ons) | **Pass** |
| Preview | `<img>` thumbnail + Replace/Remove + Lightbox | `<img>` `56x56` / `76x57` `object-fit:cover` + `#v2SeeMediaLightbox` | **Pass** |
| Switch | `.cwp-v2-switch.cwp-v2-switch-sm` | `.cwp-v2-switch.cwp-v2-switch-sm` | **Pass** |
| Chip | `.cwp-v2-filter-chip` | `.cwp-v2-filter-chip` (tags, zones, compatibility, Hide Test Data) | **Pass** |
| Modal / Drawer | `.cwp-v2-modal` / `.cwp-v2-drawer` | `.cwp-v2-modal-lg`/`sm` + `.cwp-v2-drawer-lg` | **Pass** |
| Table / Grid | `.cwp-v2-data-grid` + `.cwp-v2-table.is-compact` | `.cwp-v2-data-grid` + `.cwp-v2-table.is-compact` + `.is-sticky-action` | **Pass** |

## 8. Test-Data Pollution Findings
- Inspected `public.services` (27 rows: 5 production + 22 `TEST_SVC_*`, `S03_SVC_*`, `S07_WASH_*`) and `public.addons` (23 rows: 4 production + 19 `TEST_ADDON_*`, `S03_ADDON_*`).
- Updated `isTestRecord` in Services and added `Hide Test Data` + `Hide Test Services` filters in Add-ons without deleting any existing DB records.

## 9. Tests Rerun & Exact Results
- **Real DB + API Integration**: `node --env-file-if-exists=.env tests/test_see_13_1_functional_qa.js` — **ALL PASSED** (`exit code 0`).
- **Real DB + Engine QA**: `node --env-file-if-exists=.env tests/test_see_engine_qa.js` — **8 PASSED, 0 FAILED** (`exit code 0`).
- **Syntax Checks**: `node --check` on `v2-see-services.js` and `v2-see-addons.js` — **PASSED** (`exit code 0`).

## 10. Untested Items & Scope Integrity
- **Untested**: Live browser file-picker OS dialog and live browser drag-and-drop interaction.
- **Scope Integrity**: No unrelated Admin V2, Staff, Customer, or DCC route workflows modified; no Playground components modified; no migrations executed; no deployment or git commit/push performed.
