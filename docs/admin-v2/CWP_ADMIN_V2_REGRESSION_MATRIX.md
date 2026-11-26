# CWP Admin V2 — Testing, Regression Plan & 18-Area Verification Matrix (Phase / Deliverable M5)

**Document ID:** M5 (`CWP_ADMIN_V2_REGRESSION_MATRIX.md`)  
**Target Repository:** `e:\CWP DATA APP` (`cwp-staff-viewer` v`3.2.1`)  
**Audit Date:** 2026-11-26  
**Scope & Boundaries:** Strict read-only test infrastructure audit and verification blueprint. Zero production application, backend, database, test, Staff Portal, or public website files were modified (`Production application files modified: NONE`).  
**Companion Deliverables in `docs/admin-v2/`:**
- `docs/admin-v2/CWP_AURA_LIVE_MIGRATION_MASTER_AUDIT.md` (M1 — Module Inventory & Workflows)
- `docs/admin-v2/CWP_ADMIN_V2_API_DATA_MAP.md` (M2 — Live Data & API Mapping)
- `docs/admin-v2/CWP_AURA_PRODUCTION_COMPONENT_MAPPING.md` (M3 — Aura Component Mapping)
- `docs/admin-v2/CWP_ADMIN_V2_MIGRATION_ROADMAP.md` (M4 — Shell Plan & Phased Roadmap)
- **Design System Cross-Reference:** `docs/design-system/01–07` (v1.0.0, especially `06-responsive-and-accessibility-contract.md` & `07-validation-checklist-and-governance.md`) and `public/admin-v2/` (Tasks 01–07 + `v2-overlay.js`).

---

## Table of Contents
1. [Section 1: Existing Test Infrastructure Audit](#1-existing-test-infrastructure-audit)
   - [1.1 `package.json` & Runner Architecture](#11-packagejson--runner-architecture)
   - [1.2 Complete `tests/` & `scripts/` Inventory by Category (All 104 + 1 Files)](#12-complete-tests--scripts-inventory-by-category-all-104--1-files)
   - [1.3 Critical Test Infrastructure Gaps](#13-critical-test-infrastructure-gaps)
   - [1.4 Non-Negotiable Visual & Behavioral Verification Rule](#14-non-negotiable-visual--behavioral-verification-rule)
2. [Section 2: 18 Required Verification Areas (Definitions & Global Pass Standards)](#2-18-required-verification-areas-definitions--global-pass-standards)
3. [Section 3: 18-Area Module-by-Module Verification Matrix](#3-18-area-module-by-module-verification-matrix)
   - [3.1 `M-AUTH` — Admin Authentication Gate & Security Settings](#31-m-auth--admin-authentication-gate--security-settings)
   - [3.2 `M-SHELL` — Admin Shell, Header, Sidebar, Navigation & Shared Overlays](#32-m-shell--admin-shell-header-sidebar-navigation--shared-overlays)
   - [3.3 `M-DASH` — Unified Analytics Dashboard](#33-m-dash--unified-analytics-dashboard)
   - [3.4 `M-CLEAN-REPORTS` — Daily Cleaning Status & Proof-of-Work Reports](#34-m-clean-reports--daily-cleaning-status--proof-of-work-reports)
   - [3.5 `M-SPECIAL-JOBS` — Other Cleaning Status / Wash & Solar Hub](#35-m-special-jobs--other-cleaning-status--wash--solar-hub)
   - [3.6 `M-JOB-ASSIGN` — Job Assignment & Dispatch](#36-m-job-assign--job-assignment--dispatch)
   - [3.7 `M-STAFF-TRACKING` — Live Staff GPS Telemetry & Stoppages](#37-m-staff-tracking--live-staff-gps-telemetry--stoppages)
   - [3.8 `M-ROUTE-PLAN` — DCC Route Plan, Stop Sequence & Unassigned Workbench](#38-m-route-plan--dcc-route-plan-stop-sequence--unassigned-workbench)
   - [3.9 `M-CUSTOMERS` — Customer Directory, Onboarding, Packages & Bookings](#39-m-customers--customer-directory-onboarding-packages--bookings)
   - [3.10 `M-SERVICE-ASSIGN` — Service & Asset Assignment Console](#310-m-service-assign--service--asset-assignment-console)
   - [3.11 `M-LEADS` — Leads & Inquiries Pipeline (Table & Kanban)](#311-m-leads--leads--inquiries-pipeline-table--kanban)
   - [3.12 `M-STAFF` — Staff Management, Capabilities, Designations & Org Hierarchy](#312-m-staff--staff-management-capabilities-designations--org-hierarchy)
   - [3.13 `M-HIDDEN-SUPPRESSED` — Hidden, Suppressed & Alias Elements](#313-m-hidden-suppressed--hidden-suppressed--alias-elements)
   - [3.14 `M-LEGACY-ORPHANS` — Orphaned Frontend Controllers & Legacy Subviews](#314-m-legacy-orphans--orphaned-frontend-controllers--legacy-subviews)
   - [3.15 `M-UNWIRED-BACKEND` — Implemented Backend Admin APIs Without V1 UI](#315-m-unwired-backend--implemented-backend-admin-apis-without-v1-ui)
4. [Section 4: Phase-by-Phase Regression Gate Protocol (Phases 0–9)](#4-phase-by-phase-regression-gate-protocol-phases-09)
   - [4.1 Cross-App & Staff PWA Protection Gates (Mandatory on Every Phase)](#41-cross-app--staff-pwa-protection-gates-mandatory-on-every-phase)
   - [4.2 Phase 0–9 Gate Specifications & Legacy Test Reconciliation](#42-phase-09-gate-specifications--legacy-test-reconciliation)
   - [4.3 Non-Negotiable Audit & Integrity Verification Rules](#43-non-negotiable-audit--integrity-verification-rules)

---

## 1. Existing Test Infrastructure Audit

### 1.1 `package.json` & Runner Architecture

Inspection of `e:\CWP DATA APP\package.json` (32 lines) confirms a zero-framework, Node-native test architecture:

- **Package:** `cwp-staff-viewer` v`3.2.1`, `"engines": { "node": ">=18.0.0" }`.
- **Production Dependencies (`package.json:27–31`):** `cloudinary ^2.11.0`, `material-symbols ^0.49.0`, `pg ^8.23.1`.
- **Development Dependencies (`devDependencies`):** **NONE** (`0` packages). There is no Jest, Vitest, Mocha, Playwright, Cypress, Puppeteer, JSDOM, Axe-core, or ESLint in `package.json`.
- **Execution Mechanism:** All tests run via Node built-in modules (`assert`, `fs`, `path`, `http`, `crypto`, `vm`, `child_process`).
- **Configured `package.json` Scripts (`package.json:14–15`):**
  1. **`npm test`:** Sequential `&&`-chained execution of **56** scripts in `tests/` (`4` invoke `node --env-file-if-exists=.env ...`: `test_car_make_and_color_qa.js`, `test_session_persistence_and_audit_qa.js`, `test_staff_extended_fields_qa.js`, `test_tentative_time_and_sequence_qa.js`; the remaining `52` invoke `node tests/...`). Fails fast on the first non-zero exit code.
  2. **`npm run test:neon`:** Sequential `&&`-chained execution of **8** live Neon PostgreSQL verification/E2E suites using `node --env-file-if-exists=.env tests/...` (`verify_phase1d_schema.js`, `test_phase1f_repositories.js`, `test_phase1f_auth_security.js`, `test_phase1f_workflows_and_sync.js`, `test_phase1f_end_to_end.js`, `test_phase1g_admin.js`, `test_phase1g_staff.js`, `test_phase1g_db_integrity.js`).
- **Repository Test File Counts (`e:\CWP DATA APP\tests\` & `scripts/`):**
  - `tests/` contains **104 files** total (`103` `.js` scripts + `1` JSON fixture `phase1g_db_integrity_results.json`), plus `tests/screenshots/` (`7` PNG files: `admin_hub_desktop.png`, `admin_records_live.png`, `admin_shell_phase1_{desktop,mobile,tablet}.png`, `staff_portal_mobile_3tabs.png`, `staff_tracking_admin_live.png`).
  - Breakdown of the **104** files in `tests/`:
    - **`56`** `.js` scripts executed by `npm test`
    - **`8`** `.js` scripts executed by `npm run test:neon`
    - **`39`** standalone `.js` scripts not registered in `package.json` (including Aura V2 Task 06 & Task 07 suites, CDP browser tracking, security audits, and module-specific QA)
    - **`1`** JSON baseline fixture (`phase1g_db_integrity_results.json`)
  - `scripts/verify_admin_v2_isolation.js` (287 lines): Standalone Node HTTP isolation & smoke verification script for `/admin-v2` (Tasks 01–05) and V1 `/admin` + `/staff`.

---

### 1.2 Complete `tests/` & `scripts/` Inventory by Category (All 104 + 1 Files)

Across the `103` `.js` files in `tests/`, static inspection reveals overlapping execution techniques: `63` scripts read `Index.html` / `style.css` / `public/admin-v2/` source text; `37` perform `http` / `fetch` calls; `25` reference `db/index` or `DATABASE_URL`; `8` use Node `vm` sandboxes (`vm.runInNewContext`) for frontend logic; `2` spawn headless Windows browsers (`msedge.exe` or `chrome.exe`). Every file is categorized below by its primary verification purpose.

#### Category A — Unit, Sandbox (`vm`) & Pure Service Logic (`12` files)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_connection_resolver.js` | `npm test` (#1) | Unit checks on `db/connectionResolver.js` Neon URL resolution (`-pooler` vs direct) |
| `tests/test_photo_crop_rotation.js` | `npm test` (#3) | Pure JS math/canvas rotation & Cropper helper checks |
| `tests/test_regression_p2_3.js` | `npm test` (#5) | Unit/regression assertions for P2.3 core utilities |
| `tests/test_p2_4_phone_validation.js` | `npm test` (#6) | Indian mobile validation (`isValidIndianMobile`) edge cases |
| `tests/test_modularity_and_scale_qa.js` | `npm test` (#20) | Service/repo boundary & modularity structural assertions |
| `tests/test_bilingual_search.js` | `npm test` (#26) | `vm`/service unit tests for `recordMatchesBilingualSearch()` & phonetic matching |
| `tests/test_multi_vehicle_rotation_qa.js` | `npm test` (#33) | `vm` + static checks for `Aaj`/`Kal` multi-vehicle rotation logic |
| `tests/test_special_jobs_ledger_qa.js` | `npm test` (#53) | `vm` DOM-mock rendering tests for `M-SPECIAL-JOBS` / ledger JSONB parsing |
| `tests/test_admin_console_m3_redesign_e2e.js` | Standalone | 1,057-line `vm` + static HTML/CSS/JS suite covering R1–R6 (`Index.html` + `app.js` + `adminService.js`) |
| `tests/test_rate_card_qa.js` | Standalone | Rate card calculation & catalog validation |
| `tests/test_rating_switch_qa.js` | Standalone | Rating / switch logic checks |
| `tests/test_helpers.js` | Standalone | Shared test helper utilities (no standalone assertions) |

#### Category B — API, Backend Service & Neon Integration (`32` `.js` files + `1` JSON fixture)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_daily_clean_reports_backend.js` | `npm test` (#16) | `http` + backend `getDailyCleanReports` & consecutive duration calculations |
| `tests/test_indic_hindi_transliteration_qa.js` | `npm test` (#22) | `/api/indic/transliterate*` & Hindi field handling |
| `tests/test_leads_feature_qa.js` | `npm test` (#25) | Leads CRUD, notes, and `convertLeadToCustomer` lifecycle |
| `tests/test_ondemand_services_qa.js` | `npm test` (#27) | `assignSpecialJob`, `getSpecialJobs`, category normalization |
| `tests/test_car_make_and_color_qa.js` | `npm test` (#28, `.env`) | Vehicle `carMake` / `carColor` persistence |
| `tests/test_service_catalog_and_reassignment_qa.js` | `npm test` (#34) | Service catalog & `reassignSpecialJob` checks |
| `tests/test_car_not_present_and_booking_cancellation_qa.js` | `npm test` (#41) | `car_not_present` report state & `cancelSpecialJob` |
| `tests/test_car_wash_seater_and_solar_isolation_qa.js` | `npm test` (#48) | `5_seater` / `5_plus_seater` vs Solar panel field isolation |
| `tests/test_packages_sql_ambiguity_qa.js` | `npm test` (#51) | SQL query safety on `customer_packages` joins |
| `tests/verify_phase1d_schema.js` | `npm run test:neon` (#1) | Live Neon PostgreSQL schema & table/column verification (`localhost:3000` + DB) |
| `tests/test_phase1f_repositories.js` | `npm run test:neon` (#2) | Live Neon CRUD across `db/repositories/*.js` |
| `tests/test_phase1f_workflows_and_sync.js` | `npm run test:neon` (#4) | Live Neon operational workflows & offline sync idempotency |
| `tests/test_phase1f_end_to_end.js` | `npm run test:neon` (#5) | Live Neon end-to-end API + DB workflow verification |
| `tests/test_phase1g_admin.js` | `npm run test:neon` (#6) | Live HTTP (`localhost:3000/api`) + Neon 21 Admin scenarios |
| `tests/test_phase1g_staff.js` | `npm run test:neon` (#7) | Live HTTP (`localhost:3000`) + Neon Staff Portal isolation & completion sync |
| `tests/test_phase1g_db_integrity.js` (+ `phase1g_db_integrity_results.json`) | `npm run test:neon` (#8) | Live Neon FK, trigger, constraint, and audit log integrity checks |
| `tests/preflight_phase1d.js` | Standalone | Neon DB preflight connectivity & migration readiness |
| `tests/test_neon_phase1a.js` | Standalone | Phase 1A Neon connection & query verification |
| `tests/test_phase1b_dual_audit.js` | Standalone | Dual-mode DB/local fallback audit |
| `tests/test_customer_service_separation_qa.js` | Standalone | `assignCustomerService` & `stopCustomerService` DB/API checks |
| `tests/test_daily_clean_report_edit_and_delete_qa.js` | Standalone | `updateDailyCleanReportStatus` & `deleteDailyCleanReport` API + audit checks |
| `tests/test_daily_route_execution_qa.js` | Standalone | Daily route execution & cleaner completion API checks |
| `tests/test_dcc_core_operations_qa.js` | Standalone | `dccService.js` subscription lifecycle & `subscription_vehicles` |
| `tests/test_multi_location_and_dispatch_qa.js` | Standalone | Multi-location `service_locations` + route dispatch checks |
| `tests/test_packages_and_entitlements_qa.js` | Standalone | Prepaid package sell/redeem/cancel + `FOR UPDATE` balance enforcement |
| `tests/test_route_management_and_sequence_qa.js` | Standalone | `routeService.js` CRUD, negative-offset reorder, transfer, and reconciliation |
| `tests/test_service_booking_and_lifecycle_qa.js` | Standalone | `bookingService.js` state machine & package linkage |
| `tests/test_staff_tracking_api.js` | Standalone | `staffTrackingRepo.js` jitter/speed/stoppage rules & HTTP API |
| `tests/test_task_01_7_operational_integrity_qa.js` | Standalone | Cross-module operational integrity (subscriptions/routes/jobs) |
| `tests/test_task_01_8_staff_service_capabilities_qa.js` | Standalone | `staffCapabilityService.js` capability conflict enforcement |
| `tests/test_task_01_9_staff_designation_and_hierarchy_qa.js` | Standalone | `staffDesignationService.js` authorities & BFS cycle detection |
| `tests/verify_start_job_fix.js` | Standalone | Targeted regression script for `startSpecialJob` |

#### Category C — Frontend DOM Contract & Static Source Checks (`22` files)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_form_ux_phone_qa.js` | `npm test` (#4) | Static HTML/JS form UX & phone validation checks |
| `tests/test_card_location_display.js` | `npm test` (#7) | Staff card location rendering (`Index.html` / `app.js`) |
| `tests/test_p3_mobile_and_login_persistence.js` | `npm test` (#11) | Mobile layout CSS & login persistence static checks |
| `tests/test_daily_clean_photo_and_reports_frontend.js` | `npm test` (#17) | Clean Reports UI table, lightbox & filter markup checks |
| `tests/test_separated_address_columns_qa.js` | `npm test` (#21) | Separated address & GPS columns in `Index.html` / `app.js` |
| `tests/test_header_modernization_qa.js` | `npm test` (#23) | `#staffHeader` / `#adminHeader`, `--cwp-header-bg`, popover, language & account menu DOM |
| `tests/test_whatsapp_direct_image_share_qa.js` | `npm test` (#24) | `#whatsAppImageShareModal` & image share helper checks |
| `tests/test_sidebar_and_operations_dashboard_qa.js` | `npm test` (#29) | `#adminSidebar`, `#adminOpsDashboardHub`, KPI & Intelligence deck DOM checks |
| `tests/test_lead_edit_qa.js` | `npm test` (#38) | Lead edit modal (`#addLeadModal`) & update flow static/handler checks |
| `tests/test_alarming_dispatch_sound_qa.js` | `npm test` (#39) | Web Audio dispatch/completion chimes (`playNewTaskChime`) checks |
| `tests/test_service_categories_in_edit_customer_qa.js` | `npm test` (#42) | Edit Customer & Lead 5-category dropdown options (`Index.html` / `app.js`) |
| `tests/test_customer_edit_and_package_types_qa.js` | `npm test` (#43) | Edit Customer 6 tabs & package type controls |
| `tests/test_modal_dom_structure_qa.js` | `npm test` (#50) | Modal HTML tag nesting & structural integrity in `Index.html` |
| `tests/test_dom_contract_reconciliation_qa.js` | `npm test` (#52) | Verifies 100+ DOM IDs across 11 critical workflows in `Index.html` |
| `tests/test_p0_defect_remediation_qa.js` | `npm test` (#54) | Verifies DEF-02..DEF-07 fixes across `Index.html`, `app.js`, `style.css`, `package.json` |
| `tests/test_customer_records_ux_and_lang_audit.js` | Standalone | Customer directory UX, bilingual labels & language toggle audit |
| `tests/test_header_separation_and_staff_login_qa.js` | Standalone | Staff vs Admin header separation & login UI checks |
| `tests/test_iteration2_challenger_remediations_qa.js` | Standalone | Regression checks from prior UX audit challenger round |
| `tests/test_m1_it3_css_fixes_qa.js` | Standalone | CSS layout/overflow fix checks in `style.css` |
| `tests/test_part_a_technical_gaps.js` | Standalone | Static checks for technical gap remediations |
| `tests/test_staff_footer_tabs_modern_qa.js` | Standalone | Staff Portal bottom nav bar & zero-emoji nav check |
| `tests/test_task_01_3_1_audit_qa.js` | Standalone | Task 01.3.1 audit compliance checks |

#### Category D — E2E / Headless Browser Automation (`2` files)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_browser_service_catalog_and_m3_qa.js` | `npm test` (#35) | Hardcoded `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` `--headless --screenshot` against `http://localhost:3000/` + static `Index.html` / `style.css` checks (silently skips screenshots if Edge absent) |
| `tests/test_staff_tracking_browser.js` | Standalone | Hardcoded `C:\Program Files\Google\Chrome\Application\chrome.exe` (`--headless=new --remote-debugging-port=9224`), drives Admin Live Tracking via raw WebSocket `CdpClient` + ephemeral server port `3902` + live Neon DB + captures `tests/screenshots/staff_tracking_admin_live.png` |

#### Category E — Authentication, Session & Security Audits (`13` files)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_hardening_qa.js` | `npm test` (#2) | Ephemeral server HTTP security, isolated `DATA_FILE`, auth & scrypt upgrade checks |
| `tests/test_staff_phone_edit_session_qa.js` | `npm test` (#10) | Staff phone change revoking active sessions |
| `tests/test_staff_pin_reveal_qa.js` | `npm test` (#13) | Audited Admin `revealStaffPin` API + UI checks |
| `tests/test_session_persistence_and_audit_qa.js` | `npm test` (#37, `.env`) | Ephemeral server `50099`: 12h Admin & Staff sessions survive memory wipe, `getAuditLogs`, logout revocation |
| `tests/test_cwp_admin_neural_login_qa.js` | `npm test` (#44) | Static checks on `#adminAuthGate`, `cwp-neural-core.js`, `cwp-neural-login.css`, header hiding |
| `tests/test_phase1f_auth_security.js` | `npm run test:neon` (#3) | Live Neon scrypt hashing, `adm_`/`stf_` SHA-256 `auth_sessions`, lockout & logout revocation |
| `tests/test_auto_login_and_wrong_animation_qa.js` | Standalone | Admin auto-login debounce & wrong-password shake animation |
| `tests/test_login_api_e2e.js` | Standalone | Ephemeral server HTTP checks on `verifyAdminPassword` (`isAuto` rate-limit exemption) & `verifyStaffPin` |
| `tests/test_option1_active_session_shield.js` | Standalone | Active session protection / concurrent session checks |
| `tests/test_production_security_audit_qa.js` | Standalone | Checks `local_data.json` zero leaked sessions, `.gitignore`, zoom viewport, XSS `?staff=` stripping, `413` >15MB rejection, `401` on `/api/customers`, `/api/leads`, `getStaffTrackingSummary` |
| `tests/test_reviewer_adversarial.js` | Standalone | Adversarial security & input boundary checks |
| `tests/test_staff_lockout_unlock_and_multidevice.js` | Standalone | 5-attempt lockout, `unlockStaff` cross-IP reset, multi-device `device_id` sessions |
| `tests/test_staff_login_logout_branded_qa.js` | `npm test` (#19) | Staff Portal branded login/logout & `#logoutConfirmModal` checks |

#### Category F — Aura V2 Playground & Aura Admin Foundation QA (`6` files: `5` in `tests/` + `1` in `scripts/`)
| File | Runner | Mechanism & Coverage |
|---|---|---|
| `tests/test_aura_design_tokens_admin_qa.js` | `npm test` (#30) | Verifies `m3-tokens.css` & `style.css` DTCG tokens, `--font-mono`, DDR-002 Devanagari `line-height: 1.5`, pagination `>= 40px` |
| `tests/test_aura_contrast_and_a11y_qa.js` | `npm test` (#31) | Photometric luminance math (`#475569` on `#ffffff`, `#78350f` on `#fef3c7`), `:focus-visible`, ARIA semantics across 19 modals in `Index.html` |
| `tests/test_aura_admin_modal_focus_qa.js` | `npm test` (#32) | `vm` + static checks on `trapFocus`, `modalTriggerStack`, `getTopmostOpenModal`, `closeTopmostModal` in `app.js` |
| `tests/test_aura_selection_dropdown_filter_qa.js` | Standalone | Task 06 static token/CSS/DOM/JS checks (`v2-tokens.css`, `v2-components.css`, `v2-playground.js`, `public/admin-v2/index.html`) + live `GET http://localhost:3000/admin-v2` HTTP 200 check |
| `tests/test_aura_table_datagrid_qa.js` | Standalone | Task 07 static checks across 20 criteria (`34px`/`46px`, bulk bar, sort, pagination, expand, skeleton/empty/error, `.is-sticky-action`) + live `GET http://localhost:3000/admin-v2` HTTP 200 check |
| `scripts/verify_admin_v2_isolation.js` | Standalone (`scripts/`) | Boots `server.js` on port `5998`: asserts `/admin-v2`, `/admin-v2/ui-lab`, Tasks 01–05 CSS/JS/DOM, strict CSS scoping (no bare `body {`/`html {`), AND V1 isolation (`/admin` has `admin-mode-active` & zero `cwp-v2-root`; `/staff` has `staff-mode-active`) |

#### Category G — Admin Module Regression & Staff PWA / Public Isolation (`17` files)
| File | Runner | Module / Boundary Protected |
|---|---|---|
| `tests/test_unassigned_customer_flow.js` | `npm test` (#14) | `M-JOB-ASSIGN` / `M-ROUTE-PLAN` unassigned customer flow |
| `tests/test_delete_customer_staff_qa.js` | `npm test` (#15) | `M-CUSTOMERS` & `M-STAFF` delete endpoints & UI handlers |
| `tests/test_daily_clean_sequence_qa.js` | `npm test` (#9) | `M-ROUTE-PLAN` legacy sequence & ordering |
| `tests/test_daily_clean_assignment_hub_qa.js` | `npm test` (#46) | `M-JOB-ASSIGN` Daily Clean Routes subtab & inline reassign |
| `tests/test_tentative_time_and_sequence_qa.js` | `npm test` (#47, `.env`) | `M-JOB-ASSIGN` / `M-SPECIAL-JOBS` tentative time & stop order |
| `tests/test_realtime_and_special_jobs_date_filter_qa.js` | `npm test` (#49) | `M-SHELL` SSE + `M-SPECIAL-JOBS` date filters |
| `tests/test_kanban_compact_dnd_qa.js` | `npm test` (#36) | `M-LEADS` Kanban drag-and-drop & compact card UI |
| `tests/test_route_management_ui_first_qa.js` | `npm test` (#55) | `M-ROUTE-PLAN` Hub/Detail/Unassigned DOM, Material Symbols, breakpoints, HTTP API |
| `tests/test_job_assign_dispatch_service_category_qa.js` | `npm test` (#56) | `M-JOB-ASSIGN` On-Demand dispatch service categories |
| `tests/test_staff_extended_fields_qa.js` | `npm test` (#40, `.env`) | `M-STAFF` KYC, salary, weekly off, DOJ fields |
| `tests/test_tab_persistence_and_live_sync_qa.js` | Standalone | `M-SHELL` `?tab=` persistence & `M-CLEAN-REPORTS` 15s signature polling |
| `tests/test_staff_photo_and_inactive_qa.js` | Standalone | `M-STAFF` / Staff PWA inactive guard & photo handling |
| `tests/test_staff_status_button_qa.js` | Standalone | `M-STAFF` card action button cleanup |
| `tests/test_staff_auto_sync_qa.js` | `npm test` (#8) | **Staff PWA (`/staff`)** auto-sync protection |
| `tests/test_daily_clean_local_completion_qa.js` | `npm test` (#12) | **Staff PWA (`/staff`)** offline completion queue protection |
| `tests/test_pwa_staff_qa.js` | `npm test` (#18) | **Staff PWA (`/staff`)** `/manifest.json`, `/sw.js`, `/offline.html`, icons, view isolation (port `5899`) |
| `tests/test_homepage_and_careers_qa.js` | `npm test` (#45) | **Public Website (`/`) & Careers (`/careers`)** non-regression gate |

---

### 1.3 Critical Test Infrastructure Gaps

1. **Over-Reliance on Static Source Substring Assertions (`63` of `103` scripts):** Most UI QA suites verify `indexHtml.includes('id="..."')` or `appJs.includes('function ...')` via `fs.readFileSync`. They cannot detect runtime `TypeError`s, broken event delegation after `tbody.innerHTML` re-renders, CSS z-index occlusion, clipped Devanagari matras, horizontal overflow, or dead API bindings.
2. **Hardcoded Windows Browser Paths & Silent Screenshot Skips:**
   - `tests/test_browser_service_catalog_and_m3_qa.js:12` hardcodes `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` and logs a warning without failing if missing (`L20–21`), and captures `/` rather than authenticated `/admin` views.
   - `tests/test_staff_tracking_browser.js:213` hardcodes `C:\Program Files\Google\Chrome\Application\chrome.exe` (fails on machines without Chrome at that exact path).
3. **Zero Cross-Browser E2E Harness & Hardcoded `localhost:3000` Dependencies:** No Playwright/Cypress/WebDriver suite exists to exercise Admin CRUD, pagination, sorting, filtering, loading/error states, or browser `popstate`/`hashchange` across Chromium/Firefox/WebKit and `<600px`/`600–1023px`/`>=1024px` viewports. Six tests (`test_aura_selection_dropdown_filter_qa.js`, `test_aura_table_datagrid_qa.js`, `test_browser_service_catalog_and_m3_qa.js`, `test_phase1g_admin.js`, `test_phase1g_staff.js`, `verify_phase1d_schema.js`) assume a server is already running on `http://localhost:3000`.
4. **Aura V2 Tests Omitted from `npm test`:** `test_aura_selection_dropdown_filter_qa.js` (Task 06), `test_aura_table_datagrid_qa.js` (Task 07), and `scripts/verify_admin_v2_isolation.js` (Tasks 01–05 + V1 isolation) are NOT in `package.json`. Consequently, `v2-auth.js:42–68`'s `checkSession()` privilege-bypass bug (calling public `getStaffList`) and `v2-layout.css`'s missing `@media` queries were never caught by `npm test`.
5. **Brittle Legacy `npm test` Assertions That Block Aura V2 Migration Unless Synchronized:** Direct source inspection confirms specific `npm test` scripts currently assert legacy strings, emojis, or V1 styles that will intentionally change during Aura V2 rollout:
   - `tests/test_delete_customer_staff_qa.js:69` (`npm test` #15) asserts `indexHtml.includes('🗑️ Delete')` (legacy emoji).
   - `tests/test_service_categories_in_edit_customer_qa.js:64–68` (`npm test` #42) asserts exact `<option>` strings containing emojis `'🚗'`, `'🧼'`, `'☀️'`, `'✨'`, `'🛡️'`.
   - `tests/test_special_jobs_ledger_qa.js:215, 243` (`npm test` #53) asserts `'☀️ 30 Solar Panels'` and `'☀️ 24 Solar Panels'`.
   - `tests/test_cwp_admin_neural_login_qa.js:59–61, 97–105` (`npm test` #44) asserts `'TAP CORE TO AUTHENTICATE'`, `cwp-neural-login.css`, and `cwp-neural-core.js` Fibonacci math.
   - `tests/test_aura_contrast_and_a11y_qa.js:64–91` (`npm test` #31) asserts `.sidebar-section-label` contrast against `#ffffff` (V1 white sidebar) rather than `#0b1a2b` (Aura V2 dark navy sidebar).
   - `tests/test_header_modernization_qa.js:44–46` (`npm test` #23) asserts `--cwp-header-bg: #0b192c` and `--cwp-control-height: 34px` in `style.css`.
   - `tests/test_aura_admin_modal_focus_qa.js:34–90` (`npm test` #32) asserts exact V1 function signatures (`getTopmostOpenModal`, `modalDefinitions`) in `public/js/app.js`.
   - **Stale Standalone Drift Example:** `tests/test_tab_persistence_and_live_sync_qa.js:105` still asserts the obsolete 6-tab `ADMIN_VALID_TABS` array (`['records', 'leads', 'sequence', 'staff', 'cleanReports', 'addCust']`), which already fails against `public/js/app.js:2645` (12 tabs).
6. **Silent Coverage Blind Spots:** No automated tests verify:
   - Devanagari matra non-clipping (`line-height: 1.5`) in `34px` Task 07 compact rows;
   - Sticky action column (`.is-sticky-action`) non-overlap during horizontal table scroll;
   - Button re-enablement / input preservation on `400`/`429`/`500`/network failures (`handleEditStaffSubmit`, `handleBackfillHindi`);
   - `500`/`200`/`100` backend truncation awareness & partial-failure bulk reporting;
   - Orphaned `app.js:4746–5606` dead DOM isolation or CSS-suppressed sidebar badge truthfulness.

---

### 1.4 Non-Negotiable Visual & Behavioral Verification Rule

> **MANDATORY VERIFICATION POLICY:** Automated screenshots (such as `tests/screenshots/*.png` produced by `test_browser_service_catalog_and_m3_qa.js` or `test_staff_tracking_browser.js`) are **NEVER proof of visual or functional correctness on their own**. A screenshot passing `fs.existsSync()` proves only that a PNG was written—not that layout, contrast, responsiveness, or interactions work.

Every UI migration phase MUST require **all five** verification layers in a live headless browser (CDP / Playwright):
1. **DOM Geometry Assertions:** `getBoundingClientRect()` verifying zero horizontal page overflow (`document.documentElement.scrollWidth <= window.innerWidth`), sticky header/right-action column non-overlap, non-zero map/chart dimensions, and interactive target bounds (`>= 36px` desktop, `>= 44px` `<1024px` touch).
2. **Computed Style Assertions:** `getComputedStyle()` confirming `--cwp-v2-*` light workspace `#f8fafc`, dark navy sidebar `#0b1a2b`, `'Noto Sans Devanagari'` font inclusion with `lineHeight >= 1.5x fontSize` on bilingual cells, zero external CDN font failure, and WCAG 2.2 AA contrast ratios (`>= 4.5:1` text, `>= 3:1` UI/icons).
3. **Accessibility & Keyboard Assertions:** `role="dialog"`, `aria-modal="true"`, `aria-sort`, `aria-live="polite"`, `Tab`/`Shift+Tab` modal focus trapping, `Escape` dismissal, `:focus-visible` ring visibility, and zero `TAP CORE` canvas keyboard traps.
4. **Functional & Network State Assertions:** Live `POST /api` request/response interception verifying `200`/`400`/`401`/`403`/`429`/`500` handling, preserved modal inputs on failure, double-submit button lock/unlock, SSE/polling updates, and `popstate`/`?tab=`/`#admin/<tab>` navigation.
5. **Human Visual Inspection:** Manual review across Compact (`<600px`, e.g., `390x844`), Medium (`600–1023px`, e.g., `768x1024`), and Expanded (`>=1024px`, e.g., `1440x900`) viewports.

---

## 2. 18 Required Verification Areas (Definitions & Global Pass Standards)

Every canonical module in Section 3 is evaluated across all **18 required verification areas** (`TA-01` through `TA-18`):

| ID | Verification Area | Global Pass Standard |
|---|---|---|
| **TA-01** | **Page Loading & Initial Render** | Route/tab loads with HTTP `200`, zero uncaught JS `console.error`/page errors, Aura V2 `.cwp-v2-root` mounted, Material Symbols rendered (zero Unicode emojis, zero broken icons). |
| **TA-02** | **Actual Live Data Retrieval (No Mock/Placeholder Leakage)** | Data originates strictly from live `POST /api` / PostgreSQL (`services/` + `db/repositories/`) or live derived state; zero `MOCK_OPERATIONS`, `TASK07_OPERATIONS_DATASET`, `ZONE_DEFINITIONS`, or generic placeholder strings (`>Customer<`, `>Staff<`, `undefined`). |
| **TA-03** | **Search (incl. Bilingual/Phonetic)** | Live/debounced search filters accurately by English, phone digits, plate numbers, and Devanagari/phonetic Hindi (`recordMatchesBilingualSearch`) where applicable; clear button resets query cleanly. |
| **TA-04** | **Filtering (Primary Chips & Collapsible Drawers)** | Primary filter chips/selects and collapsible secondary filter drawers (`.cwp-v2-filter-drawer`) compose accurately (AND semantics), sync with summary bar tags, and Reset restores full dataset. |
| **TA-05** | **Sorting (Column/Header/Selector Truthfulness)** | Sort controls (`aria-sort="ascending|descending"`, `#rmSortSelect`, etc.) deterministically reorder records across numeric, IST date/time, and string fields; no misleading non-functional sort headers. |
| **TA-06** | **Pagination & Backend Cap Awareness** | Page size (`25`/`50`/`100`/`All` or `10`/`25`/`50`/`100`) and page navigation compute accurate `Showing X–Y of Z` bounds; backend truncation caps (`500` customers/leads, `200` clean reports/special jobs, `100` audit logs/applications) are surfaced or upgraded to server pagination with `totalCount`. |
| **TA-07** | **Row Expansion / Detail Drawer / Sub-panel Inspection** | Expandable rows (`.cwp-v2-expanded-row`), detail drawers (`#trackingStoppagesDrawer`), lightboxes (`#reportPhotoLightboxModal`, `#imageModal`), and drill-down views (`#rmRouteDetailView`) display accurate child/context records and preserve keyboard focus on close. |
| **TA-08** | **Create Operations & Draft Persistence** | Create flows persist to Neon PostgreSQL with real server-generated IDs/codes, trigger expected SSE/cache refresh, and preserve/restore `localStorage` drafts cleanly (`#addCustomerModal`). |
| **TA-09** | **Edit Operations & State Preservation** | Edit modals hydrate exact current record state (locations, vehicles, packages, capabilities, notes), persist delta/payload accurately without wiping sibling child rows, and keep UI in sync. |
| **TA-10** | **Operational & Bulk Actions (incl. Partial-Failure Reporting)** | Reassign, unassign, status override, stop reorder, CSV/Print export, and bulk actions execute real mutations; bulk loops report exact `succeeded / failed` counts and surface per-item errors (never fake success toasts). |
| **TA-11** | **Permission & Auth Enforcement (`401`/`403`)** | Protected endpoints reject missing/expired/staff tokens with `401`/`403`; client `handleUnauthorizedResponse` locks Admin shell and clears tokens; zero `getStaffList` `200`-bypass or `NODE_ENV==='test'` auth leaks in production builds. |
| **TA-12** | **Client & Server Validation (Inline & Consequence Confirm)** | Client validates required fields, Indian 10-digit mobiles, 6-digit PINs, mandatory audit reasons, and valid dates **before** locking submit buttons; destructive actions require explicit `.cwp-v2-consequence-box` confirmation; server rejects invalid payloads with `400`/`409`. |
| **TA-13** | **API Failure Handling (`500`/`429`/Network)** | Failed reads display actionable retry panels without crashing; failed mutations re-enable submit buttons (no button-lock bugs), keep modal open, preserve all typed inputs, and display server error message. |
| **TA-14** | **Empty States (Contextual Empty vs Zero-Filter-Match)** | Distinguishes "zero records in DB" from "zero records matching current filters/search", providing contextual CTAs (`Reset Filters`, `View Today`, `Add ...`) without stale table rows or fake numbers. |
| **TA-15** | **Loading States (Skeletons, Spinners, Double-Submit Prevention)** | Initial/async fetches show `.cwp-v2-skeleton-cell` / spinner without flashing empty states prematurely; active mutations show `.is-loading` and prevent duplicate submissions while in flight. |
| **TA-16** | **Regression & Cross-App Isolation** | Staff PWA (`/staff`, `#staffView`, `staff-m3.css`, `sw.js`), Public Website (`/`, `home.html`), and Careers (`/careers`) remain 100% untouched; Admin V2 CSS/JS does not bleed into Staff mode; SSE events & 15s pollers sync without memory leaks or duplicate listeners. |
| **TA-17** | **Responsive Layout (`<600px`, `600–1023px`, `>=1024px`)** | Sidebar collapses to slide-over drawer `<1024px`; tables scroll horizontally with opaque `.is-sticky-action` right column and zero page-level horizontal scroll; Devanagari cells enforce `line-height: 1.5` with zero matra clipping; modals stack cleanly without horizontal tab overflow (`FRM-01`). |
| **TA-18** | **Browser Navigation & History Stack** | Direct URLs (`/admin`, `/admin?tab=...`, `/admin#admin/<tab>`) load the exact module; browser Back/Forward navigates/closes topmost modal via `popstate` (`v2-overlay.js` stack) and resolves `hashchange`; refresh preserves active tab cleanly. |

---

## 3. 18-Area Module-by-Module Verification Matrix

### 3.1 `M-AUTH` — Admin Authentication Gate & Security Settings

**Scope:** `#adminAuthGate` (`Index.html:450–538`), `v2-auth.js`, Change Admin Password (`Index.html:920–925` -> relocated to Settings/Account in Phase 1), `#logoutConfirmModal` (`L1998`).

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | `/admin` renders accessible login card (`#adminAuthForm`, `#adminPasswordInput`, `#btnAdminLogin`) without requiring a canvas tap (`A11Y-01`); `#adminHeader` remains hidden (`display: none`) until authenticated. | Existing: `test_cwp_admin_neural_login_qa.js` (**must update** for A11Y-01). New: `test_v2_auth_e2e_cdp.js`. |
| **TA-02** | **Applicable** | `verifyAdminPassword` authenticates against `public.admin_users` / `.env` via scrypt and returns real `adm_` token persisted in `public.auth_sessions`; zero hardcoded client bypasses. | Existing: `test_phase1f_auth_security.js`, `test_login_api_e2e.js`. |
| **TA-03** | **N/A** | Single-session credential gate and password update form; no searchable dataset. | — |
| **TA-04** | **N/A** | No filterable dataset on authentication gate. | — |
| **TA-05** | **N/A** | No sortable dataset on authentication gate. | — |
| **TA-06** | **N/A** | No paginated dataset on authentication gate. | — |
| **TA-07** | **N/A** | No expandable rows; logout confirmation uses `#logoutConfirmModal`. | — |
| **TA-08** | **N/A** | Admin user creation is CLI/auto-seeded (`adminUsersRepo`); UI only authenticates/rotates password. | — |
| **TA-09** | **Applicable** | `updateAdminPassword` updates hash/salt cleanly; **Phase 1 security fix:** must route `server.js:4143` through `authService.updateAdminPassword` (requiring `currentPassword`, min 6 chars, and revoking prior `auth_sessions`). | Existing: `test_hardening_qa.js`. New: `test_admin_password_rotation_e2e.js`. |
| **TA-10** | **Applicable** | Auto-login (`450ms` debounce at `>= 4` chars with `isAuto: true`), manual submit, eye reveal toggle, Remember Device (`localStorage` vs `sessionStorage`-only when unchecked), and Logout (`logoutAdmin` revoking DB session + `1200ms` fail-safe). | Existing: `test_auto_login_and_wrong_animation_qa.js`, `test_login_api_e2e.js`, `test_session_persistence_and_audit_qa.js`. |
| **TA-11** | **Applicable** | **Critical Fix Gate:** `v2-auth.js:42–68` `checkSession()` MUST validate against an admin-protected endpoint (NOT public `getStaffList` which returns `200` to bogus/staff tokens); `updateAdminPassword` requires `cwp_admin_token`; `5` failed manual attempts in `5` min trigger HTTP `429`. | Existing: `test_phase1f_auth_security.js`. New: `test_v2_auth_session_check_qa.js` (asserts bogus/staff token returns `valid: false`). |
| **TA-12** | **Applicable** | Empty `#adminPasswordInput` blocked; `#newAdminPasswordInput` enforces `minlength` inline error via `.cwp-v2-input-box.has-error` (no silent fail); Logout triggers `#logoutConfirmModal` confirmation. | Existing: `test_cwp_admin_neural_login_qa.js`. New: `test_v2_auth_e2e_cdp.js`. |
| **TA-13** | **Applicable** | `401` / `429` / `500` displays `#adminAuthError` (`.cwp-v2-form-alert.is-error`) with cooldown timer on `429`, re-enables `#btnAdminLogin`, and keeps password input focused/intact for correction. | Existing: `test_auto_login_and_wrong_animation_qa.js`. New: `test_v2_auth_e2e_cdp.js`. |
| **TA-14** | **N/A** | Login gate does not display dataset empty states. | — |
| **TA-15** | **Applicable** | `#btnAdminLogin` enters `.is-loading` and disables duplicate submits during `verifyAdminPassword`; logout disables confirm button with `1200ms` timeout guard. | New: `test_v2_auth_e2e_cdp.js`. |
| **TA-16** | **Applicable** | Admin login/logout MUST NOT alter `cwp_staff_auth_<ID>_token` or break `/staff` PIN auth; 12h session survives server restart via `auth_sessions` DB persistence. | Existing: `test_session_persistence_and_audit_qa.js`, `test_phase1g_staff.js`. |
| **TA-17** | **Applicable** | Login card & `#logoutConfirmModal` fit `<600px` (`360px`–`412px`), `600–1023px`, and `>=1024px` (`100dvh`, zero overflow, `>=36px`/`44px` inputs/buttons); `prefers-reduced-motion` disables heavy canvas animations. | New: `test_v2_auth_e2e_cdp.js` (geometry assertions). |
| **TA-18** | **Applicable** | Unauthenticated deep-link `/admin?tab=leads` shows login gate and restores `leads` tab upon successful authentication; logout resets URL to `/admin`. | Existing: `test_tab_persistence_and_live_sync_qa.js`. New: `test_v2_shell_navigation_cdp.js`. |

---

### 3.2 `M-SHELL` — Admin Shell, Header, Sidebar, Navigation & Shared Overlays

**Scope:** `#adminHeader`, `#adminSidebar`, `#adminMobileTopbar`, `#staffLiveBadge`/`#syncDetailsPopover`, `#langDropdownWrap`, `#btnThemeToggle`, `#toastNotification`, `v2-shell.js`, `v2-overlay.js`, shared modals (`#imageModal`, `#addressViewModal`, `#logoutConfirmModal`, `#cwpPhotoCropperModal`).

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | `#0b1a2b` Dark Navy Sidebar (`250px`/`68px`) & `#f8fafc` Light Workspace mount with self-hosted `Material Symbols Outlined` WOFF2 (zero external Google Fonts CDN dependency per `01 §7`); zero emojis in header/sidebar/modals. | Existing: `scripts/verify_admin_v2_isolation.js`, `test_header_modernization_qa.js` (**update**), `test_sidebar_and_operations_dashboard_qa.js`. |
| **TA-02** | **Applicable** | Sidebar count badges (if un-suppressed from `style.css:15774–15778`) reflect real counts from live caches (`getAllCustomers`, `getLeads`, `getDailyCleanReports`, `getSpecialJobs`, `getStaffList`), never hardcoded playground numbers; SSE connects to `/api/admin-realtime-stream`. | Existing: `test_realtime_and_special_jobs_date_filter_qa.js`. New: `test_v2_shell_live_sync_cdp.js`. |
| **TA-03** | **N/A** (Current Scope) | V1 shell has **no global cross-module search bar** (`API GAP — REQUIRES INVESTIGATION` in M2); local search belongs to each module. *(Becomes Applicable only if a global search endpoint is added in later phase.)* | — |
| **TA-04** | **N/A** | Shell provides tab navigation, EN/HI language selector, and theme toggle rather than record filtering. | — |
| **TA-05** | **N/A** | Navigation items follow fixed operational IA order (`OPERATIONS` 6 items, `MANAGEMENT` 4 items). | — |
| **TA-06** | **N/A** | No paginated dataset in shell chrome. | — |
| **TA-07** | **Applicable** | `#syncDetailsPopover` opens/closes cleanly with live SSE/network/last-sync IST details; shared `#imageModal` & `#addressViewModal` display accurate photo/address/Maps metadata; `v2-overlay.js` handles nested `.is-nested` (`z-index: 1200/1250`). | Existing: `test_header_modernization_qa.js`, `test_aura_admin_modal_focus_qa.js`. New: `test_v2_overlay_stack_cdp.js`. |
| **TA-08** | **N/A** | Shell does not create domain entities. | — |
| **TA-09** | **Applicable** | Language switch (`EN` / `HI`) updates `localStorage.cwp_lang` & bilingual labels across shell/modules; desktop sidebar collapse updates `localStorage.cwp_admin_sidebar_collapsed` (`.is-collapsed` `68px` rail). | Existing: `test_header_modernization_qa.js`, `test_customer_records_ux_and_lang_audit.js`. |
| **TA-10** | **Applicable** | Manual `Sync Now` (`#btnPopoverSyncNow`) triggers `refreshAllAdminBadges()` + active module reload; EN/HI toggle, Theme toggle, and brand logo click (`'records'`) execute accurately; toast stack (`aria-live="polite"`) renders non-overlapping notifications. | Existing: `test_header_modernization_qa.js`, `test_alarming_dispatch_sound_qa.js`. |
| **TA-11** | **Applicable** | Shell container `#adminUnlockedContent` never renders without valid `cwp_admin_token`; `/api/admin-realtime-stream` rejects missing/staff tokens with `401`; mid-session `401`/`403` locks UI via `handleUnauthorizedResponse()`. | Existing: `test_production_security_audit_qa.js`, `test_header_separation_and_staff_login_qa.js`. |
| **TA-12** | **N/A** | Shell controls have no mutation forms (Account password change covered under `M-AUTH`). | — |
| **TA-13** | **Applicable** | SSE disconnect (`onerror`) transitions `#staffLiveBadge` to offline/reconnecting state, schedules `5000ms` reconnect without crashing, and preserves active tab state; 15s visibility-gated pulse pauses when tab hidden/offline. | Existing: `test_tab_persistence_and_live_sync_qa.js`. New: `test_v2_shell_live_sync_cdp.js`. |
| **TA-14** | **N/A** | Shell frame itself has no empty dataset state. | — |
| **TA-15** | **Applicable** | Manual `Sync Now` shows spinning state until completion and resets on both success and failure. | New: `test_v2_shell_live_sync_cdp.js`. |
| **TA-16** | **Applicable** | **Critical Isolation Gate:** `/staff`, `#staffHeader`, `#staffView`, `staff-m3.css`, `sw.js`, `/`, and `/careers` must have zero `.cwp-v2-*` / `--cwp-v2-*` bleed; shared `#imageModal`, `#addressViewModal`, `#logoutConfirmModal` still work when invoked from `/staff`. | Existing: `scripts/verify_admin_v2_isolation.js`, `test_pwa_staff_qa.js`, `test_homepage_and_careers_qa.js`, `test_dom_contract_reconciliation_qa.js`. |
| **TA-17** | **Applicable** | `<600px` & `600–1023px`: `#adminSidebar` becomes slide-over drawer (`280px`/`85vw`) with `#adminSidebarBackdrop`, sticky `#adminMobileTopbar` shows active tab title; `>=1024px`: `250px`/`68px` rail + `56px` header with zero horizontal overflow (`scrollWidth <= innerWidth`). | Existing: `test_m1_it3_css_fixes_qa.js`. New: `test_v2_shell_responsive_cdp.js` (across 390px, 768px, 1440px). |
| **TA-18** | **Applicable** | Direct URL `/admin?tab=<valid>`, `#admin/<tab>`, `washSolar` -> `specialJobs`, `addCust` -> modal + `records`; browser Back closes topmost of ALL **32** Admin/Shared modals + `#trackingStoppagesDrawer` via `v2-overlay.js` + `popstate` (fixing V1 `getTopmostOpenModal()` 17-modal omission). | Existing: `test_aura_admin_modal_focus_qa.js` (**update**), `test_tab_persistence_and_live_sync_qa.js` (**update** 6->12 tabs). New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.3 `M-DASH` — Unified Analytics Dashboard

**Scope:** `#adminTabDashboard`, `#adminOpsDashboardHub` (shared header strip across `dashboard`, `cleanReports`, `specialJobs`), 4 KPI tiles, 3 Intelligence cards, 3 inline SVG charts (`#dashCleanProgressSvg`, `#dashStaffBarSvg`, `#dashWashSolarSvg`), `#dashboardCrewPulseStrip`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | `#adminTabDashboard` & `#adminOpsDashboardHub` render all 4 KPI tiles, 3 Intelligence cards, 3 SVG charts, and Crew Pulse grid cleanly; switching away hides `#adminOpsDashboardHub` except on `cleanReports`/`specialJobs`. | Existing: `test_sidebar_and_operations_dashboard_qa.js`, `test_admin_console_m3_redesign_e2e.js`. |
| **TA-02** | **Applicable** | All KPI numbers, SVG chart arcs/bars, and Crew Pulse cards derive from live `getDailyCleanReports`, `getSpecialJobs`, `getStaffList`, and `getAllCustomers` responses (zero hardcoded numbers). | Existing: `test_admin_console_m3_redesign_e2e.js` (`vm` tests). New: `test_v2_dashboard_live_cdp.js`. |
| **TA-03** | **N/A** | Executive summary view; no search input on Dashboard. | — |
| **TA-04** | **N/A** | Reflects today's operational pulse; filtering lives in `M-CLEAN-REPORTS` & `M-SPECIAL-JOBS`. | — |
| **TA-05** | **N/A** | Staff chart & Crew Pulse follow deterministic workload/name order; no user sort controls. | — |
| **TA-06** | **Applicable** | **Cap Awareness:** Dashboard inherits `200`-row cap (`getDailyCleanReports`, `getSpecialJobs`) and `500`-row cap (`getAllCustomers`). If rows hit cap (`length === 200` or `500`), UI MUST display a truncation/cap warning badge until a server KPI summary endpoint (`M2` API Gap #12) is added. | New: `test_v2_dashboard_cap_warning_qa.js`. |
| **TA-07** | **Applicable** | Clicking `Daily Cleans Today` KPI tile drills into `cleanReports`; `Wash & Solar Tasks` drills into `specialJobs`; `Field Crew Active` drills into `staff`. | Existing: `test_sidebar_and_operations_dashboard_qa.js`. |
| **TA-08** | **N/A** | Read-only analytics module; no create forms. | — |
| **TA-09** | **N/A** | Read-only analytics module; no edit forms. | — |
| **TA-10** | **Applicable** | `Refresh All` (`refreshOperationsDashboard()`), `#reportsLiveSyncPill` toggle, `Export CSV` (`exportDailyCleanReportsCSV()`), and `Print` (`printDailyCleanReports()`) execute cleanly and export valid UTF-8/BOM CSV with real data. | Existing: `test_sidebar_and_operations_dashboard_qa.js`. |
| **TA-11** | **Applicable** | All underlying RPC actions (`getDailyCleanReports`, `getSpecialJobs`, `getAllCustomers`) enforce `adminProtectedActions` (`401` when unauthenticated). | Existing: `test_session_persistence_and_audit_qa.js`. |
| **TA-12** | **N/A** | No input forms or destructive mutations on Dashboard. | — |
| **TA-13** | **Applicable** | If any parallel fetch (`getDailyCleanReports` / `getSpecialJobs`) fails with `500`/network error, Dashboard shows actionable retry banner without throwing SVG `NaN`/`Infinity` errors on `0/0` division. | New: `test_v2_dashboard_live_cdp.js`. |
| **TA-14** | **Applicable** | Zero tasks/cleans today renders valid `0%` SVG donut placeholder and contextual Crew Pulse empty state without broken layout or `NaN%`. | Existing: `test_admin_console_m3_redesign_e2e.js` (Tier 2 boundary checks). |
| **TA-15** | **Applicable** | `Refresh All` displays loading/sync indicator while parallel fetches are in flight and updates KPIs/SVG charts after completion. | New: `test_v2_dashboard_live_cdp.js`. |
| **TA-16** | **Applicable** | SSE `DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, and `CUSTOMERS_CHANGED` automatically refresh Dashboard KPIs & charts; hidden `.reports-kpi-grid` bridge (if retired) does not break KPI calculations. | Existing: `test_realtime_and_special_jobs_date_filter_qa.js`. |
| **TA-17** | **Applicable** | KPI grid (`.cwp-v2-kpi-grid`), 3-col Intelligence deck, 3 SVG charts, and Crew Pulse stack cleanly into 1–2 columns at `<600px` and `600–1023px` with readable labels and zero horizontal overflow. | New: `test_v2_dashboard_live_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=dashboard` and `/admin#admin/dashboard` land directly on Dashboard; clicking KPI drill-down updates URL `?tab=` / `#admin/` accurately. | Existing: `test_sidebar_and_operations_dashboard_qa.js`. |

---

### 3.4 `M-CLEAN-REPORTS` — Daily Cleaning Status & Proof-of-Work Reports

**Scope:** `#adminTabCleanReports`, `.reports-filter-panel`, `#adminCleanReportsTableBody` (`<table>` needs explicit ID), `#reportPhotoLightboxModal`, `#editCleanReportModal`, `#deleteCleanReportModal`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Renders Operations Intelligence banner, Task 06 filter bar, and 9-column Task 07 Data Grid (`34px` compact / `46px` standard) with Material Symbols only (emojis removed from modals/table). | Existing: `test_daily_clean_photo_and_reports_frontend.js`. |
| **TA-02** | **Applicable** | `POST /api { action: 'getDailyCleanReports' }` queries `public.service_logs` + joins; renders IST timestamps, HSRP plates (`CMP-03`), consecutive cleaning/transit durations, photo thumbs, and `car_not_present` badges. | Existing: `test_daily_clean_reports_backend.js`, `test_phase1g_admin.js`. |
| **TA-03** | **Applicable** | `#reportSearchFilter` debounces (`350ms`), pauses 15s auto-sync while typing, searches customer/Hindi/vehicle/staff accurately; clear button resets query. | Existing: `test_tab_persistence_and_live_sync_qa.js`. New: `test_v2_clean_reports_cdp.js`. |
| **TA-04** | **Applicable** | Period chips (`Today`, `Yesterday`, `Last 7 Days`, `This Month`, `Custom` `#reportStartDate`–`#reportEndDate`), `#reportStaffFilter`, `#reportPhotoFilter`, and `#reportRouteFilter` (from `getAllRoutes`) compose accurately; `Reset` restores defaults. | Existing: `test_daily_clean_photo_and_reports_frontend.js`. |
| **TA-05** | **Applicable** | Default server order `completed_at_device DESC`; Task 07 client/server sort headers (`Date/Time`, `Staff`, `Customer`, `Status`) update `aria-sort` truthfully. | New: `test_v2_clean_reports_cdp.js`. |
| **TA-06** | **Applicable** | **Cap Awareness:** `serviceLogsRepo.queryDailyCleanReports` hardcodes `limit=200, offset=0` without `totalCount`. UI must either implement server pagination with `totalCount` or warn when `records.length === 200`. | New: `test_clean_reports_pagination_cap_qa.js`. |
| **TA-07** | **Applicable** | Clicking thumbnail opens `#reportPhotoLightboxModal` (`Download`, `Full Size`, `Edit Status`, `Delete`; `#btnLightboxSendWhatsApp` stays hidden for Admin); missing photo shows graceful empty state. | Existing: `test_daily_clean_photo_and_reports_frontend.js`. |
| **TA-08** | **N/A** | Clean logs are created by field staff via Staff PWA (`recordDailyCleanWithPhoto`); Admin cannot create clean punches here. | — |
| **TA-09** | **Applicable** | `#editCleanReportModal` toggles `completed` vs `car_not_present`, applies 3 reason chips, calls `updateDailyCleanReportStatus`, writes `audit_logs`, and refreshes table/KPIs. | Existing: `test_daily_clean_report_edit_and_delete_qa.js`, `test_car_not_present_and_booking_cancellation_qa.js`. |
| **TA-10** | **Applicable** | `#deleteCleanReportModal` deletes `service_logs` row + writes `audit_logs` (enabling staff re-punch); `Export CSV` & `Print` reflect filtered rows; table direct-share remains disabled (`app.js:20097`). | Existing: `test_daily_clean_report_edit_and_delete_qa.js`. |
| **TA-11** | **Applicable** | `getDailyCleanReports`, `updateDailyCleanReportStatus`, `deleteDailyCleanReport`, `getAllRoutes` reject non-admin tokens with `401`. | Existing: `test_daily_clean_reports_backend.js`, `test_session_persistence_and_audit_qa.js`. |
| **TA-12** | **Applicable** | `#editCleanReportModal` & `#deleteCleanReportModal` strictly block empty `reason` (inline `.has-error` + focus), require `startDate <= endDate` on Custom range, and use `.cwp-v2-consequence-box` on Delete. | Existing: `test_daily_clean_report_edit_and_delete_qa.js`. |
| **TA-13** | **Applicable** | Read error shows inline retry row + `'Sync paused (retry in 15s)'`; Edit/Delete API failure re-enables submit button, keeps modal open, and preserves typed `reason` text. | New: `test_v2_clean_reports_cdp.js`. |
| **TA-14** | **Applicable** | Zero records for selected date/filter renders `.cwp-v2-empty-state-panel` with contextual `View Today` & `Reset Filters` CTAs. | Existing: `test_daily_clean_photo_and_reports_frontend.js`. |
| **TA-15** | **Applicable** | Initial load displays `.cwp-v2-skeleton-cell` shimmer; silent 15s background sync updates only on signature diff without flickering; modal buttons lock `.is-loading` during submit. | Existing: `test_tab_persistence_and_live_sync_qa.js`. |
| **TA-16** | **Applicable** | Deleting a clean report allows Staff PWA `/staff` to re-punch that vehicle on the same IST date; SSE `DAILY_CLEAN_CHANGED` refreshes Admin table & Dashboard KPIs. | Existing: `test_phase1f_workflows_and_sync.js`, `test_realtime_and_special_jobs_date_filter_qa.js`. |
| **TA-17** | **Applicable** | 9-column table scrolls horizontally with opaque `.is-sticky-action` column; Devanagari customer names/reasons render with `line-height: 1.5`; modals fit `<600px` cleanly. | New: `test_v2_clean_reports_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=cleanReports` / `#admin/cleanReports` restores directly; Back button closes `#reportPhotoLightboxModal` / `#editCleanReportModal` / `#deleteCleanReportModal` cleanly via `v2-overlay.js`. | Existing: `test_tab_persistence_and_live_sync_qa.js`. |

---

### 3.5 `M-SPECIAL-JOBS` — Other Cleaning Status / Wash & Solar Hub

**Scope:** `#adminTabSpecialJobs`, 4 KPI status cards, consolidated Task 06 filter bar + secondary drawer, `#adminSpecialJobsTable` (10 cols), `#assignSpecialJobModal`, `#reassignJobModal`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | `#adminTabSpecialJobs` & alias `?tab=washSolar` mount cleanly with Material Symbols only (strip `⏳ 🚀 ✅ ❌` emojis in JS & update `test_special_jobs_ledger_qa.js` `'☀️'` assertion in Phase 5). | Existing: `test_ondemand_services_qa.js`, `test_special_jobs_ledger_qa.js` (**update**). |
| **TA-02** | **Applicable** | `getSpecialJobs` retrieves real `public.service_jobs`; **Backend Bug Gate:** changing `INNER JOIN service_locations` (`serviceJobsRepo.js:54`, `adminService.js:2847`) to `LEFT JOIN` ensures jobs with `location_id IS NULL` remain visible! | Existing: `test_ondemand_services_qa.js`. New: `test_special_jobs_null_location_qa.js`. |
| **TA-03** | **Applicable** | `#adminSpecialSearch` matches customer name, phone, vehicle/panels, staff, and instructions across cached jobs. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-04** | **Applicable** | 4 clickable KPI cards (`Total`/`Assigned`/`In Progress`/`Completed`), primary search/status/period bar, and collapsible `.cwp-v2-filter-drawer` (6 category chips + custom dates + staff select) compose accurately; `Reset` clears all filters. | Existing: `test_realtime_and_special_jobs_date_filter_qa.js`. |
| **TA-05** | **Applicable** | Server orders `created_at DESC`; Task 07 table sort headers (`Scheduled Date/Time`, `Work Type`, `Status`, `Duration`) sort truthfully. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-06** | **Applicable** | **Cap Awareness:** `getSpecialJobsAdmin` hardcodes `limit=200` without `totalCount`; client pagination + cap warning (or server pagination) prevents silent hiding of >200 jobs. | New: `test_special_jobs_pagination_cap_qa.js`. |
| **TA-07** | **Applicable** | Clicking Before/After photo thumbs opens `#imageModal` (`openImageModal`); timeline cell accurately renders Assign/Start/End IST timestamps & lag/duration. | Existing: `test_service_booking_and_lifecycle_qa.js`. |
| **TA-08** | **Applicable** | `+ Assign Wash & Solar` (`#assignSpecialJobModal`) supports both `existing` customer and `new` customer auto-creation, Car (`5`/`5+` Seater) vs Solar (panel count) isolation, tentative time presets, and `assignSpecialJob`. | Existing: `test_car_wash_seater_and_solar_isolation_qa.js`, `test_tentative_time_and_sequence_qa.js`. |
| **TA-09** | **Applicable** | Clicking `Unassigned` pill or `Reassign` opens `#reassignJobModal`, updates staff, tentative time, stop order, and reason via `reassignSpecialJob`; blocks reassigning `completed` jobs. | Existing: `test_service_catalog_and_reassignment_qa.js`, `test_p0_defect_remediation_qa.js` (`DEF-02`). |
| **TA-10** | **Applicable** | `Cancel/Delete` triggers `.cwp-v2-consequence-box` confirmation (replacing browser `confirm()`), calls `deleteSpecialJob` (blocking `in_progress`/`completed`); **Audit Bug Gate:** `cancelSpecialJob` (`server.js:6593`) fixed to pass `{ entityType, entityId, beforeState, afterState }` to `auditLogs.logChange`. | Existing: `test_car_not_present_and_booking_cancellation_qa.js`. New: `test_cancel_job_audit_log_qa.js`. |
| **TA-11** | **Applicable** | `getSpecialJobs`, `assignSpecialJob`, `reassignSpecialJob`, `deleteSpecialJob` require Admin session (`401`); backend enforces `staffCapabilityService.hasServiceCapability` (`400`/`409`). | Existing: `test_task_01_8_staff_service_capabilities_qa.js`. |
| **TA-12** | **Applicable** | `#assignSpecialJobForm` validates 10-digit mobile, address, category, date, time, package, and staff; Solar requires panels >=1; Car requires vehicle/seater. | Existing: `test_car_wash_seater_and_solar_isolation_qa.js`. |
| **TA-13** | **Applicable** | Failed `assignSpecialJob`/`reassignSpecialJob` displays `#assignSpecialJobError` / `#reassignJobError`, re-enables submit button, keeps modal open with inputs preserved. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-14** | **Applicable** | Zero matching jobs renders Task 06/07 empty state panel with `Reset Filters` & `+ Assign Wash & Solar` actions. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-15** | **Applicable** | Table renders skeleton rows on initial load; `#assignSpecialJobModal` & `#reassignJobModal` disable submit with `.is-loading` during mutation. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-16** | **Applicable** | `assignSpecialJob`/`reassignSpecialJob`/`deleteSpecialJob` emit SSE `SPECIAL_JOB_CHANGED`, updating Dashboard KPIs, Job Assignment Ledger, and Staff PWA `/staff` Other Jobs tab. | Existing: `test_realtime_and_special_jobs_date_filter_qa.js`, `test_phase1g_staff.js`. |
| **TA-17** | **Applicable** | Triple-stacked filter bloat consolidated into primary bar + collapsible drawer; 10-col table uses `.is-comfortable` (`46px`) + opaque `.is-sticky-action` column; modals fit `<600px`. | New: `test_v2_special_jobs_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=specialJobs` and legacy `/admin?tab=washSolar` resolve to Special Jobs; Back closes `#assignSpecialJobModal` / `#reassignJobModal` / `#imageModal`. | Existing: `test_tab_persistence_and_live_sync_qa.js`. |

---

### 3.6 `M-JOB-ASSIGN` — Job Assignment & Dispatch

**Scope:** `#adminTabJobAssignment`, Subtab 1 (`Daily Clean Routes`: `#dccAssignForm`, `#dccRouteRosterTable`), Subtab 2 (`On-Demand Jobs`: `#jobAssignForm`, `#jobAssignmentsLedgerTable`). *(Excludes `M-LEGACY-ORPHANS` at `app.js:4746–5606`.)*

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Segmented `.cwp-v2-tabs` (`Daily Clean Routes` / `On-Demand Jobs`) renders cleanly with Material Symbols; `#dccUnassignedBanner` remains suppressed or deliberately surfaced; zero errors from retired `app.js:4746–5606` orphans. | Existing: `test_daily_clean_assignment_hub_qa.js`, `test_job_assign_dispatch_service_category_qa.js`. |
| **TA-02** | **Applicable** | `getDailyCleanAssignments` + `getSpecialJobs` + `getAllCustomers` + `getStaffList` populate `#dccRouteRosterTable`, `#dccAssignCustomerSelect`, and `#jobAssignmentsLedgerTable` from live DB. | Existing: `test_daily_clean_assignment_hub_qa.js`. |
| **TA-03** | **Applicable** | `#dccRosterSearch` filters Daily Clean Roster by customer name, mobile, vehicle, or cleaner accurately. | Existing: `test_daily_clean_assignment_hub_qa.js`. |
| **TA-04** | **Applicable** | `#dccRosterStaffFilter` (`All Cleaners` / `Unassigned Only` / specific staff) filters roster rows accurately; On-Demand ledger excludes `completed`/`cancelled` jobs. | Existing: `test_daily_clean_assignment_hub_qa.js`, `test_unassigned_customer_flow.js`. |
| **TA-05** | **Applicable** | Roster & Ledger columns support truthful Task 07 sorting (`Stop #`, `Customer`, `Cleaner`, `Scheduled Date/Time`). | New: `test_v2_job_assign_cdp.js`. |
| **TA-06** | **Applicable** | Client pagination applied cleanly if roster/ledger exceeds 25/50 rows; inherits underlying customer/job backend caps. | New: `test_v2_job_assign_cdp.js`. |
| **TA-07** | **Applicable** | Selecting `#dccAssignCustomerSelect` populates `#dccCustomerContextCard` with accurate customer address, vehicle(s), and current cleaner preview. | Existing: `test_daily_clean_assignment_hub_qa.js`. |
| **TA-08** | **Applicable** | `#dccAssignForm` submits `assignDailyCleanCustomer` (updating `staff_assignments` + `staff_route_sequences`); `#jobAssignForm` submits `assignSpecialJob` with capability-filtered staff list. | Existing: `test_daily_clean_assignment_hub_qa.js`, `test_job_assign_dispatch_service_category_qa.js`. |
| **TA-09** | **Applicable** | Inline cleaner `<select>` (`handleDccInlineReassign`) reassigns DCC customer cleanly; On-Demand ledger row `Reassign` updates via `#reassignJobModal`. | Existing: `test_daily_clean_assignment_hub_qa.js`. |
| **TA-10** | **Applicable** | `Unassign` (`handleDccUnassign`) prompts `.cwp-v2-consequence-box` confirmation, calls `unassignDailyCleanCustomer`, deactivates `staff_assignments`, and updates roster; ledger delete calls `deleteSpecialJob`. | Existing: `test_daily_clean_assignment_hub_qa.js`. |
| **TA-11** | **Applicable** | All 4 RPC actions (`getDailyCleanAssignments`, `assignDailyCleanCustomer`, `unassignDailyCleanCustomer`, `assignSpecialJob`) enforce Admin session (`401`); backend rejects non-DCC/non-capable staff. | Existing: `test_task_01_8_staff_service_capabilities_qa.js`. |
| **TA-12** | **Applicable** | Required customer, work type, date, and cleaner enforced before submit; prevents assigning non-capable cleaner to selected work type (`handleJobAssignWorkTypeChange`). | Existing: `test_job_assign_dispatch_service_category_qa.js`. |
| **TA-13** | **Applicable** | Failed inline reassign reverts `<select>` to previous cleaner value and shows error toast; failed form submit re-enables button and preserves `#dccAssignForm` / `#jobAssignForm` inputs. | New: `test_v2_job_assign_cdp.js`. |
| **TA-14** | **Applicable** | Empty roster/ledger or zero-filter-match shows Task 07 `.cwp-v2-empty-state-panel` with `Reset Filters`. | New: `test_v2_job_assign_cdp.js`. |
| **TA-15** | **Applicable** | Disables submit/inline dropdown during mutation and prevents duplicate assignments. | New: `test_v2_job_assign_cdp.js`. |
| **TA-16** | **Applicable** | `assignDailyCleanCustomer` / `unassignDailyCleanCustomer` broadcast `CUSTOMER_ASSIGNMENT_CHANGED` and immediately reflect in Staff PWA `/staff` Daily Clean list & `M-ROUTE-PLAN`. | Existing: `test_phase1f_workflows_and_sync.js`, `test_phase1g_staff.js`. |
| **TA-17** | **Applicable** | `.cwp-v2-form-grid-3` stacks to 1-col at `<600px`; 7-col tables scroll horizontally with opaque `.is-sticky-action`. | New: `test_v2_job_assign_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=jobAssignment` / `#admin/jobAssignment` loads module directly; switching subtabs preserves active main tab. | Existing: `test_dom_contract_reconciliation_qa.js`. |

---

### 3.7 `M-STAFF-TRACKING` — Live Staff GPS Telemetry & Stoppages

**Scope:** `#adminTabStaffTracking`, 4 KPI cards, left staff list (`#trackingStaffSearch`, status pills, staff cards), right `#staffTrackingMapCanvas` (`TrackingMapAdapter`), `#trackingStoppagesDrawer` + `#stoppagesTableContainer`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Split workspace, 4 KPI cards, `#staffTrackingMapCanvas` (non-zero bounding box), and Material Symbols (`directions_run`, `stop_circle`, `hourglass_empty`, stripping `🟢 🛑 ⏳` emojis) render cleanly. | Existing: `test_staff_tracking_browser.js`. |
| **TA-02** | **Applicable** | `getStaffTrackingSummary` & `getStaffMovementHistory` render real coordinates, HSRP/customer geofence matches (`<=120m`), Haversine distance (`>=15m`, `<=150 km/h` filter), and dwell stoppages (`>=5 min`). | Existing: `test_staff_tracking_api.js`, `test_staff_tracking_browser.js`. |
| **TA-03** | **Applicable** | `#trackingStaffSearch` filters staff directory live by name/phone without tearing down `TrackingMapAdapter` singleton. | Existing: `test_staff_tracking_browser.js`. |
| **TA-04** | **Applicable** | Status filter chips (`All`, `Moving`, `Stopped`, `Idle`) filter staff cards and map focus cleanly. | Existing: `test_staff_tracking_browser.js`. |
| **TA-05** | **N/A** | Staff list & stoppages table follow live telemetry / chronological arrival order; no custom sort headers required (or chronological dwell sort). | — |
| **TA-06** | **N/A** | Bounded by active field staff roster & single-day movement history (`staff_locations` for current IST date). | — |
| **TA-07** | **Applicable** | `Stops` opens `#trackingStoppagesDrawer` (`v2-overlay.js` `.cwp-v2-drawer-lg` with **`role="dialog"` & `aria-modal="true"`** added!) showing breadcrumbs polyline + Stoppages dwell table; closing restores focus & preserves map state. | Existing: `test_staff_tracking_browser.js`. New: `test_v2_tracking_drawer_a11y_cdp.js`. |
| **TA-08** | **N/A** | Admin does not create GPS points; telemetry originates from Staff PWA heartbeats. | — |
| **TA-09** | **N/A** | Telemetry logs & stoppages are immutable read-only records in Admin. | — |
| **TA-10** | **Applicable** | `Center` pans map to marker; `Ping` calls `pingStaffLocation` and triggers `2.5s x 8` (20s) accelerated polling; `Recenter All`, `Toggle Breadcrumbs`, and `Switch Map Provider` (Google Maps -> Leaflet/OSM -> SVG radar fallback) work reliably. | Existing: `test_staff_tracking_api.js`, `test_staff_tracking_browser.js`. |
| **TA-11** | **Applicable** | `getStaffTrackingSummary` & `pingStaffLocation` return `401` without Admin token; `getStaffMovementHistory` enforces Admin or matching Staff (`403` cross-staff). *(Security Note: `getMapsConfig` is currently public; verify whether API key restriction/auth is added.)* | Existing: `test_production_security_audit_qa.js`, `test_staff_tracking_api.js`. |
| **TA-12** | **N/A** | No input forms in `M-STAFF-TRACKING`. | — |
| **TA-13** | **Applicable** | API failure displays `'Sync Error'` badge without clearing existing map markers; Google Maps key absence or Leaflet CDN block gracefully falls back to SVG radar without uncaught exceptions. | Existing: `test_staff_tracking_browser.js`. |
| **TA-14** | **Applicable** | Staff with zero GPS pings or zero stoppages displays contextual empty message inside `#trackingStaffListContainer` / `#stoppagesTableContainer`. | Existing: `test_staff_tracking_browser.js`. |
| **TA-15** | **Applicable** | `Ping` button shows loading state while awaiting `pingStaffLocation` & burst polling; `Stops` drawer shows loading indicator while fetching `getStaffMovementHistory`. | New: `test_v2_tracking_drawer_a11y_cdp.js`. |
| **TA-16** | **Applicable** | Leaving `staffTracking` tab immediately stops `startStaffTrackingAutoSync` 15s timer (`app.js:3041`); Staff PWA heartbeat (`recordStaffHeartbeat`) & ping stream (`/api/staff-ping-stream`) remain unaffected. | Existing: `test_staff_tracking_browser.js`. |
| **TA-17** | **Applicable** | Split workspace stacks staff list and `#staffTrackingMapCanvas` (explicit `min-height`) vertically `<1024px`; `#trackingStoppagesDrawer` adapts cleanly at `<640px`. | New: `test_v2_tracking_drawer_a11y_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=staffTracking` / `#admin/staffTracking` loads tracking view; Back button dismisses `#trackingStoppagesDrawer` via `v2-overlay.js` stack. | New: `test_v2_tracking_drawer_a11y_cdp.js`. |

---

### 3.8 `M-ROUTE-PLAN` — DCC Route Plan, Stop Sequence & Unassigned Workbench

**Scope:** `#adminTabSequence`: Routes Hub (`#rmRoutesView`), Route Detail & Stop Sequence (`#rmRouteDetailView`), Unassigned Workbench (`#rmUnassignedView` + `#rmBatchBar`), Legacy Staff Sequence (`#rmLegacySeqView` + `#seqResetModal`), and 7 `rm*` modals (`Index.html:4222–4462`).

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | All 3 subtabs (`Routes Hub`, `Unassigned Workbench`, `Staff Sequence View`), 6 KPI cards, and Material Symbols render cleanly; legacy `#rmLegacySeqView` & `#seqResetModal` emojis (`⚠️ 🔄 ✓ 📋 ⚡ 👤 🚗 🔍`) stripped. | Existing: `test_route_management_ui_first_qa.js`, `test_daily_clean_sequence_qa.js`. |
| **TA-02** | **Applicable** | `getAllRoutes`, `getRouteDetails`, `getUnassignedDccVehicles`, and `getStaffSequence` load live `routes`, `route_stops`, `subscriptions`, and `staff_route_sequences` records; HSRP plates (`CMP-03`) render accurately. | Existing: `test_route_management_and_sequence_qa.js`, `test_route_management_ui_first_qa.js`. |
| **TA-03** | **Applicable** | `#rmRouteSearchInput`, `#rmUnassignedSearchInput`, `#rmAddStopSearch`, and `#seqSearchInput` filter routes, unassigned vehicles, and stops accurately. | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-04** | **Applicable** | Routes Hub `#rmStatusFilter`, `#rmStaffFilter`, `#rmAreaFilter` and Unassigned `#rmUnassignedAreaFilter` compose accurately; `#rmClearFiltersBtn` resets. | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-05** | **Applicable** | `#rmSortSelect` (`code_asc`, `name_asc`, `stops_desc`, `stops_asc`, `created_desc`) reorders `#rmRoutesGrid` truthfully. | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-06** | **Applicable** | Unassigned Workbench Data Grid paginates cleanly if unassigned vehicles >25; route stops remain unpaginated `1..N` inside `#rmRouteDetailView` so full sequence reorder stays atomic. | New: `test_v2_route_plan_cdp.js`. |
| **TA-07** | **Applicable** | Clicking `Manage Stops` opens `#rmRouteDetailView` with breadcrumb (`Routes Hub / CODE`), 3-col Master Card, and `CMP-09` stop sequence workspace (`1..N` contiguity badge). | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-08** | **Applicable** | `#rmCreateRouteModal` creates route (`createRoute`), enforcing unique uppercase `routeCode`; `#rmAddStopModal` adds unassigned DCC vehicle (`addStopToRoute`). | Existing: `test_route_management_and_sequence_qa.js`. |
| **TA-09** | **Applicable** | `#rmEditRouteModal` (`updateRoute`), `#rmAssignStaffModal` (`assignStaffToRoute` with active-route transfer warning), stop reorder (`Up`/`Down`/`Top`/`Bottom` lighting `#rmSeqUnsavedPill` -> `reorderRouteStops` atomic negative-offset swap), and `#rmTransferStopModal` (`moveStopBetweenRoutes`). | Existing: `test_route_management_and_sequence_qa.js`, `test_task_01_7_operational_integrity_qa.js`. |
| **TA-10** | **Applicable** | **Bulk Partial-Failure Gate:** `#rmBatchBar` `executeBatchAssignToRoute()` loops `addStopToRoute`, reports exact `succeeded` & `failed` counts + error details (via Aura toast/summary, never fake success); `toggleRouteStatus`, `unassignStaffFromRoute`, `removeStopFromRoute` (compacts `1..N`), `deleteRoute`, and `resetStaffSequence` work cleanly. | Existing: `test_route_management_ui_first_qa.js`. New: `test_v2_route_batch_partial_fail_qa.js`. |
| **TA-11** | **Applicable** | All 19 route/sequence RPC actions enforce `adminProtectedActions` (`401`); backend rejects non-DCC staff (`isDccEligible`) and non-DCC subscriptions (`validateDccEligibility`). | Existing: `test_route_management_ui_first_qa.js`, `test_task_01_8_staff_service_capabilities_qa.js`. |
| **TA-12** | **Applicable** | Non-DCC staff disabled in `#rmSelectStaffForRoute`; `#rmDeleteRouteModal`, `#rmRemoveStopModal`, `#seqResetModal` use `.cwp-v2-consequence-box`; leaving `#rmRouteDetailView` with `#rmSeqUnsavedPill` active prompts unsaved-changes confirmation (`confirm` / Aura dialog). | Existing: `test_route_management_ui_first_qa.js`. New: `test_v2_route_plan_cdp.js`. |
| **TA-13** | **Applicable** | Route modals render inline `.cwp-v2-form-alert` preserving inputs; failed `reorderRouteStops` / `setRouteStatus` / `deleteRoute` uses Aura error alert (replacing raw `alert()`) without losing unsaved order. | New: `test_v2_route_plan_cdp.js`. |
| **TA-14** | **Applicable** | Empty Routes Hub, zero-stop route, and zero-unassigned workbench display contextual `.cwp-v2-empty-state-panel`s. | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-15** | **Applicable** | Save Sequence, Batch Assign, and route modals disable action buttons with `.is-loading` during async RPC calls. | New: `test_v2_route_plan_cdp.js`. |
| **TA-16** | **Applicable** | `reorderRouteStops` & `assignStaffToRoute` mirror `staff_route_sequences` & `staff_assignments`, so Staff PWA `/staff` (`getStaffData` / `getStaffRouteView`) immediately reflects the exact `1..N` stop sequence. | Existing: `test_daily_route_execution_qa.js`, `test_dcc_core_operations_qa.js`. |
| **TA-17** | **Applicable** | Route cards, 3-col Detail Master Card, Unassigned table (`.is-sticky-action`), and `44px` touch targets (`test_route_management_ui_first_qa.js:186`) adapt cleanly at `<600px`, `600–1023px`, `>=1024px`. | Existing: `test_route_management_ui_first_qa.js`. |
| **TA-18** | **Applicable** | `/admin?tab=sequence` restores Routes Hub; Back button closes all 7 `rm*` modals + `#seqResetModal` (fixing V1 `getTopmostOpenModal()` omission!). | New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.9 `M-CUSTOMERS` — Customer Directory, Onboarding, Packages & Bookings

**Scope:** `#adminTabRecords`, `#adminRecordsTable` (10 cols), `#adminTablePagination`, `#addCustomerModal` (4-step wizard + draft), `#editCustomerModal` (6 tabs + draft), `#cwpPhotoCropperModal`, `#sellPackageModal`, `#redeemPackageModal`, `#packageHistoryModal`, `#createBookingModal`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Default landing tab after Admin login mounts Task 06 filter bar + 10-col Task 07 Data Grid (`34px`/`46px`) with Material Symbols only (all 20+ emojis removed from `#addCustomerModal`, `#editCustomerModal`, `#cwpPhotoCropperModal`). | Existing: `test_dom_contract_reconciliation_qa.js`, `test_customer_records_ux_and_lang_audit.js`. |
| **TA-02** | **Applicable** | `getAllCustomers` renders live `customers`, `service_locations`, `vehicles`, `subscriptions`, `customer_packages`, and `service_jobs` data; HSRP plates (`CMP-03`) & Hindi `name_hi`/`address_text_hi` match DB. | Existing: `test_phase1g_admin.js`, `test_separated_address_columns_qa.js`. |
| **TA-03** | **Applicable** | `#adminRecordSearch` (shortcut `/`) executes `recordMatchesBilingualSearch()` matching English, Devanagari Hindi, phonetic transliteration, 10-digit phone, and vehicle plate. | Existing: `test_bilingual_search.js`, `test_indic_hindi_transliteration_qa.js`. |
| **TA-04** | **Applicable** | `#filterAdminStatus` (`all`/`yes`/`no`), `Photo` chip (`#toggleFilterPhoto`), and `GPS` chip (`#toggleFilterMap`) compose accurately; Reset `#filterActiveNotice` clears all; legacy hidden filters remain safely inactive. | Existing: `test_customer_records_ux_and_lang_audit.js`. |
| **TA-05** | **Applicable** | Default server order `created_at DESC`; Task 07 sortable column headers (`Customer Name`, `Service`, `Cleaner`, `Status`) sort truthfully across full `state.adminRecords` before slicing pagination. | New: `test_v2_customers_datagrid_cdp.js`. |
| **TA-06** | **Applicable** | `#adminTablePagination` (`25`/`50`/`100`/`All`) slices accurately and displays `Showing X–Y of Z`; **Cap Awareness:** `adminService.getAllCustomers` hardcodes `limit=500` without `totalCount` — UI MUST display cap indicator or migrate to server pagination with `totalCount`. | Existing: `test_aura_design_tokens_admin_qa.js` (`>=40px` pagination targets). New: `test_customers_pagination_cap_qa.js`. |
| **TA-07** | **Applicable** | Vehicle photo micro-thumb opens `#imageModal`; Primary Address opens `#addressViewModal`; Edit Customer `Packages` & `Bookings` tabs load `getCustomerPackages`, `getPackageRedemptionHistory`, and `getCustomerServiceJobs` with sub-filters. | Existing: `test_packages_and_entitlements_qa.js`, `test_service_booking_and_lifecycle_qa.js`. |
| **TA-08** | **Applicable** | 4-step `#addCustomerModal` saves `localStorage.cwp_add_customer_draft_v1` + restores via `#custDraftRestoreBanner`, runs `/api/indic/transliterate`, crops photo via nested `#cwpPhotoCropperModal`, supports `Save as Lead`, and creates customer via `saveCustomer`. | Existing: `test_photo_crop_rotation.js`, `test_multi_location_and_dispatch_qa.js`, `test_car_make_and_color_qa.js`. |
| **TA-09** | **Applicable** | 6-tab `#editCustomerModal` preserves draft, updates multi-locations, multi-vehicles (`Aaj`/`Kal` rotation), Solar panels, and cleaner assignment via `updateCustomer` without dropping sibling vehicles/locations; **UX Fixes:** 6-tab bar (`FRM-01`) wraps cleanly without horizontal scroll; `Delete Customer` (`FRM-03`) separated from `Save Changes`. | Existing: `test_customer_edit_and_package_types_qa.js`, `test_service_categories_in_edit_customer_qa.js` (**update** emoji options in Phase 3), `test_multi_vehicle_rotation_qa.js`. |
| **TA-10** | **Applicable** | Row `⋮` overflow menu (`Edit`, `Manage Service`, `View Location`, `Delete`), `Export CSV` (`exportAdminRecordsCSV`), Prepaid Package Sell/Redeem/Cancel (`FOR UPDATE` balance), and Booking lifecycle (`Start`/`Complete`/`Cancel`/`Fail`) execute cleanly. **Security Fix:** `backfillHindi` protected by Admin auth + `onFailure` button unlock if exposed. | Existing: `test_delete_customer_staff_qa.js` (**update**), `test_packages_and_entitlements_qa.js`, `test_service_booking_and_lifecycle_qa.js`. |
| **TA-11** | **Applicable** | All customer/package/booking RPC actions enforce `adminProtectedActions` (`401`); `backfillHindi` added to `adminProtectedActions`; `NODE_ENV==='test'` bypass on `GET /api/customers` documented/hardened; `toggleCustomerActive` (`server.js:3050` stub) implemented or explicitly disabled. | Existing: `test_production_security_audit_qa.js`, `test_hardening_qa.js`. |
| **TA-12** | **Applicable** | Required name, `isValidIndianMobile` (`10` digits), primary address, vehicle/solar sizing, and `quantity >= 1` validated before submit; Delete Customer requires `.cwp-v2-consequence-box` confirmation; insufficient package balance returns `400`/`409`. | Existing: `test_form_ux_phone_qa.js`, `test_p2_4_phone_validation.js`, `test_packages_and_entitlements_qa.js`. |
| **TA-13** | **Applicable** | Failed `saveCustomer`/`updateCustomer`/`sellCustomerPackage`/`redeemPackageEntitlement`/`createServiceBooking` re-enables submit button, keeps modal open, and preserves all entered fields + draft; `handleBackfillHindi` has `onFailure` unlock. | New: `test_v2_customers_modals_cdp.js`. |
| **TA-14** | **Applicable** | Zero customers or zero search/filter matches renders `.cwp-v2-empty-state-panel` with `Reset Filters` / `+ Add Customer`; empty Packages/Bookings sub-tabs show contextual empty cards. | New: `test_v2_customers_datagrid_cdp.js`. |
| **TA-15** | **Applicable** | Initial table load shows skeleton shimmer; indic transliteration shows subtle spinner; modal submit buttons show `.is-loading` preventing duplicate customer/package creation. | New: `test_v2_customers_modals_cdp.js`. |
| **TA-16** | **Applicable** | `deleteCustomer` soft-deletes customer, stops active subscriptions, and cancels `route_stops`/`staff_assignments`; `CUSTOMERS_CHANGED` refreshes `M-SERVICE-ASSIGN`, `M-DASH`, and Staff PWA `/staff` on next sync. | Existing: `test_delete_customer_staff_qa.js`, `test_phase1g_db_integrity.js`. |
| **TA-17** | **Applicable** | **DDR-002 Critical Check:** `34px` compact table rows enforce `Noto Sans Devanagari` + `line-height: 1.5` + `>=4px` vertical padding (zero Hindi matra clipping!); opaque `.is-sticky-action` column; `#editCustomerModal` 6 tabs wrap without horizontal scrollbar (`FRM-01`); `#cwpPhotoCropperModal` stacks cleanly (`.is-nested` `z-index: 1250`). | Existing: `test_aura_design_tokens_admin_qa.js`. New: `test_v2_customers_datagrid_cdp.js` (computed `lineHeight` & geometry check). |
| **TA-18** | **Applicable** | `/admin?tab=records`, `/admin?tab=addCust` (opens Add modal & sets `'records'`), brand logo click -> `'records'`; Back button closes nested Cropper/Sell/Redeem/Booking modal BEFORE closing `#editCustomerModal` (`v2-overlay.js` LIFO stack). | Existing: `test_aura_admin_modal_focus_qa.js`. New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.10 `M-SERVICE-ASSIGN` — Service & Asset Assignment Console

**Scope:** `#adminTabServiceAssign`, 5 segmented category tabs, `#serviceAssignSearch`, `#serviceAssignTable` (7 cols), `#assignServiceModal` (`#assignServiceForm`).

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | 5 `.cwp-v2-tabs` (`All Assignments`, `Daily Clean`, `Car Wash`, `Solar Cleaning`, `No Active Plan`) & 7-col Task 07 Data Grid render with Material Symbols (emojis `🚗 🧼 ☀️ ⚠️ 🛑 💾` stripped). | Existing: `test_service_catalog_and_reassignment_qa.js`. |
| **TA-02** | **Applicable** | Derived accurately from live `state.adminRecords` + `state.staffList`; `Plan Nature` truthfully shows `Daily Recurring` vs `One-Time Job` vs `No Active Plan`. | Existing: `test_customer_service_separation_qa.js`. |
| **TA-03** | **Applicable** | `#serviceAssignSearch` filters rows by customer name, phone, registered vehicle/solar asset, or assigned staff. | New: `test_v2_service_assign_cdp.js`. |
| **TA-04** | **Applicable** | 5 segmented category tabs filter rows accurately and combine cleanly with `#serviceAssignSearch`. | Existing: `test_customer_service_separation_qa.js`. |
| **TA-05** | **Applicable** | Task 07 column headers sort rows truthfully (`Customer`, `Service & Plan`, `Plan Nature`, `Assigned Staff`). | New: `test_v2_service_assign_cdp.js`. |
| **TA-06** | **Applicable** | Client-side pagination matches `M-CUSTOMERS` and displays `Showing X–Y of Z` (inheriting 500-customer backend cap). | New: `test_v2_service_assign_cdp.js`. |
| **TA-07** | **Applicable** | Row `Manage` opens `#assignServiceModal` pre-populated with that exact customer's locations, assets, category, package, and cleaner. | Existing: `test_customer_service_separation_qa.js`. |
| **TA-08** | **Applicable** | **Bug Fix Gate:** Header `+ Assign Service` button (`Index.html:1060`) MUST NOT call hardcoded `openAssignServiceModal(0)` (`state.adminRecords[0]`); must provide searchable Aura customer selector inside `#assignServiceModal` and persist via `assignCustomerService`. | New: `test_v2_service_assign_picker_qa.js` (verifies header CTA allows selecting any customer, not index `0`). |
| **TA-09** | **Applicable** | Updating service category, package (`OTHER` custom), location, vehicle/solar details, or cleaner via `assignCustomerService` updates `customers`, `subscriptions`, `vehicles`, and `staff_assignments`. | Existing: `test_customer_service_separation_qa.js`, `test_car_wash_seater_and_solar_isolation_qa.js`. |
| **TA-10** | **Applicable** | `Stop Service` (`#btnStopServiceAction`) replaces native browser `prompt()` with an Aura `.cwp-v2-modal-sm` `.cwp-v2-consequence-box` reason dialog and calls `stopCustomerService`; `Export` generates valid CSV. | Existing: `test_customer_service_separation_qa.js`. New: `test_v2_service_assign_cdp.js`. |
| **TA-11** | **Applicable** | `assignCustomerService` & `stopCustomerService` require Admin token (`401` otherwise). | Existing: `test_customer_service_separation_qa.js`. |
| **TA-12** | **Applicable** | Requires customer, category, package (and custom text if `'OTHER'`), location, and vehicle plate(s) or solar panel count `>= 1`; Stop Service requires reason. | Existing: `test_car_wash_seater_and_solar_isolation_qa.js`. |
| **TA-13** | **Applicable** | Failed `assignCustomerService` / `stopCustomerService` re-enables buttons, keeps `#assignServiceModal` open with inputs preserved, and displays error alert/toast. | New: `test_v2_service_assign_cdp.js`. |
| **TA-14** | **Applicable** | Category/search with zero matches displays `.cwp-v2-empty-state-panel` with `Reset Filters`. | New: `test_v2_service_assign_cdp.js`. |
| **TA-15** | **Applicable** | Submit/Stop buttons lock `.is-loading` during mutation; inherits loading state while `getAllCustomers` is fetching. | New: `test_v2_service_assign_cdp.js`. |
| **TA-16** | **Applicable** | Mutations emit SSE `CUSTOMERS_CHANGED`, syncing `M-CUSTOMERS`, `M-JOB-ASSIGN`, and Staff PWA `/staff` assigned worklist. | Existing: `test_phase1f_workflows_and_sync.js`. |
| **TA-17** | **Applicable** | 5 segmented tabs wrap cleanly on `<600px` without clipping; 7-col table uses opaque `.is-sticky-action`. | New: `test_v2_service_assign_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=serviceAssign` / `#admin/serviceAssign` loads directly; Back closes `#assignServiceModal` (fixing V1 `getTopmostOpenModal()` omission!). | New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.11 `M-LEADS` — Leads & Inquiries Pipeline (Table & Kanban)

**Scope:** `#adminTabLeads`, 4 Funnel KPI cards, `#leadsSearchInput`, category chips, Table/Pipeline switcher, `#leadsListContainer`, `#addLeadModal`, `#convertLeadModal`, `#leadNoteModal`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Funnel KPIs, filter bar, Table/Kanban switcher, and modals render cleanly with Material Symbols only (strip all `🎯 ✨ 📥 📞 🌟 🚗 ☀️ 🧼 💬 📝 🚀 🏷️` emojis & inline refresh SVG). | Existing: `test_leads_feature_qa.js`, `test_kanban_compact_dnd_qa.js`. |
| **TA-02** | **Applicable** | `getLeads` loads live `public.customers` (`tag='lead'`) rows including website inquiries (`POST /api/leads`); zero mock cards. | Existing: `test_leads_feature_qa.js`, `test_homepage_and_careers_qa.js`. |
| **TA-03** | **Applicable** | `#leadsSearchInput` filters both Table and Kanban views by bilingual name, phone, address, vehicle, or notes. | Existing: `test_leads_feature_qa.js`. |
| **TA-04** | **Applicable** | 4 Funnel KPI cards (`All`, `open`, `follow_up`, `ready`) and category chips (`All Services`, `Daily Car Cleaning`, `Solar Panel Cleaning`, `Car Washing`) filter Table & Kanban accurately. | Existing: `test_kanban_compact_dnd_qa.js`. |
| **TA-05** | **Applicable** | Table view columns sort truthfully (`Lead`, `Stage`, `Category`, `Created Date`); Kanban columns group strictly by `open`, `follow_up`, `quoted`, `ready`. | New: `test_v2_leads_cdp.js`. |
| **TA-06** | **Applicable** | **Cap Awareness:** `adminService.getLeads` hardcodes `limit=500` without `totalCount`; Table view supports Aura pagination + cap notice when `length === 500`. | New: `test_leads_pagination_cap_qa.js`. |
| **TA-07** | **Applicable** | `Notes` opens `#leadNoteModal` showing full timestamped note timeline + quick-tag chips; lead vehicle photo opens `#imageModal`. | Existing: `test_leads_feature_qa.js`. |
| **TA-08** | **Applicable** | `#addLeadModal` creates lead via `saveLead` with `/api/indic/transliterate`, GPS detect, and nested `#cwpPhotoCropperModal`; `+ Lead` in Customer Directory & `Save as Lead` in Add Customer both work. | Existing: `test_leads_feature_qa.js`, `test_lead_edit_qa.js`. |
| **TA-09** | **Applicable** | `#addLeadModal` in edit mode updates via `updateLead` preserving existing stage/notes; `#leadNoteModal` appends note via `addLeadNote`. | Existing: `test_lead_edit_qa.js`. |
| **TA-10** | **Applicable** | Inline Table `<select>`, Kanban HTML5 Drag & Drop, and keyboard `←`/`Next →` buttons trigger `updateLeadStage`; `Convert` (`#convertLeadModal`, prominent CTA `ACT-04`) calls `convertLead` and navigates to `records`; `Delete` uses `.cwp-v2-consequence-box` confirm (`deleteLead`). | Existing: `test_leads_feature_qa.js`, `test_kanban_compact_dnd_qa.js`. |
| **TA-11** | **Applicable** | All 7 Lead RPC actions enforce `adminProtectedActions` (`401`); `NODE_ENV==='test'` bypass on `GET /api/leads` (`server.js:2223`) verified disabled in production. | Existing: `test_production_security_audit_qa.js`. |
| **TA-12** | **Applicable** | `#leadName` required; optional phone validated via `isValidIndianMobile`; `#newLeadNoteText` required; `#convertLeadModal` requires category, package (or solar panels `>=1`). | Existing: `test_leads_feature_qa.js`, `test_car_wash_seater_and_solar_isolation_qa.js`. |
| **TA-13** | **Applicable** | **Optimistic Rollback:** Failed `updateLeadStage` reverts `lead.leadStatus = oldStage` and re-renders UI with error toast; failed modal saves preserve inputs and re-enable buttons. | New: `test_v2_leads_cdp.js`. |
| **TA-14** | **Applicable** | Empty Leads DB or zero filter matches renders `.cwp-v2-empty-state-panel` (in Table) or per-column empty placeholders (in Kanban) with `Reset Filters` / `New Lead`. | New: `test_v2_leads_cdp.js`. |
| **TA-15** | **Applicable** | Shows loading skeleton/spinner on fetch and `.is-loading` on `saveLead`/`convertLead`/`addLeadNote` to prevent duplicate leads/conversions. | New: `test_v2_leads_cdp.js`. |
| **TA-16** | **Applicable** | **SSE Gap Fix:** Backend emits `LEAD_CHANGED` (or `CUSTOMERS_CHANGED`) on `saveLead`, `updateLead`, `updateLeadStage`, `addLeadNote`, `convertLead`, `deleteLead`, fixing M2's dead `LEAD_CHANGED` listener (`app.js:3347`); public website `POST /api/leads` continues creating leads cleanly. | Existing: `test_homepage_and_careers_qa.js`. New: `test_leads_sse_broadcast_qa.js`. |
| **TA-17** | **Applicable** | 4-col Kanban stacks/scrolls cleanly `<1024px` with `←`/`→` tap buttons (touch fallback for DnD); Table view uses opaque `.is-sticky-action` & `line-height: 1.5` for Hindi addresses. | Existing: `test_kanban_compact_dnd_qa.js`. New: `test_v2_leads_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=leads` / `#admin/leads` loads directly; Back closes `#addLeadModal`, `#convertLeadModal`, `#leadNoteModal`, and nested `#cwpPhotoCropperModal`. | New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.12 `M-STAFF` — Staff Management, Capabilities, Designations & Org Hierarchy

**Scope:** `#adminTabStaff`, `#adminStaffList`, `#addStaffModal`, `#staffEditModal`, `#designationManagementModal`, `#staffHierarchyModal`. *(Relocates Change Admin Password `#newAdminPasswordInput` to `M-AUTH`/`M-SHELL` in Phase 1/8.)*

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01** | **Applicable** | Staff roster cards, `Designations`, `Hierarchy`, and `+ Add New Staff` render with Material Symbols only (strip all 52 emoji lines in `app.js:7353–9115` & modal emojis `✏️ 📷 🗑️ 👁️ ✅ 🚫 🪪 💳 🚗 🏦 💾`). | Existing: `test_staff_extended_fields_qa.js`, `test_task_01_8_staff_service_capabilities_qa.js`, `test_task_01_9_staff_designation_and_hierarchy_qa.js`. |
| **TA-02** | **Applicable** | `getStaffList` (with Admin token -> `sanitizeStaffForAdmin`), `getDesignationsList`, and `getStaffHierarchy` load live `staff`, `staff_auth`, `staff_designations`, and `staff_service_capabilities`. | Existing: `test_phase1g_admin.js`, `test_staff_extended_fields_qa.js`. |
| **TA-03** | **Applicable (Enhancement)** | V1 `#adminTabStaff` has no roster search input; if Aura V2 adds client search on `#adminStaffList`, verify live filtering by staff name, ID (`STF*`), phone, and designation. | New: `test_v2_staff_roster_cdp.js`. |
| **TA-04** | **Applicable (Enhancement)** | If active/inactive or work-type filter chips are added in Aura V2, verify truthful counts and reset; `M-STAFF` currently renders full roster. | New: `test_v2_staff_roster_cdp.js`. |
| **TA-05** | **Applicable** | Staff roster preserves deterministic `staff_code ASC` order; hierarchy tree groups cleanly by reporting depth & designation level. | Existing: `test_task_01_9_staff_designation_and_hierarchy_qa.js`. |
| **TA-06** | **N/A** | Staff roster is bounded (~dozens of field operators, `ORDER BY staff_code ASC`), no backend cap truncation. | — |
| **TA-07** | **Applicable** | Clicking KYC doc thumbnail opens `#imageModal`; `Hierarchy` opens `#staffHierarchyModal` org tree; `Designations` opens `#designationManagementModal` role & 6-authority matrix. | Existing: `test_staff_extended_fields_qa.js`, `test_task_01_9_staff_designation_and_hierarchy_qa.js`. |
| **TA-08** | **Applicable** | `#addStaffModal` creates staff (`saveStaffMember`) with photo, 10-digit phone, 6-digit PIN, work type, and designation; `#addDesignationForm` creates custom role (`saveDesignation`). | Existing: `test_task_01_9_staff_designation_and_hierarchy_qa.js`, `test_staff_extended_fields_qa.js`. |
| **TA-09** | **Applicable** | `#staffEditModal` updates profile, phone, optional PIN reset (or unwired `resetStaffPin`), capabilities (`capCheck_edit_*`), designation, `reportsTo`, salary/DOJ/weekly off, and 5 KYC doc uploads (`saveStaffMember`). | Existing: `test_staff_extended_fields_qa.js`, `test_staff_phone_edit_session_qa.js`, `test_task_01_8_staff_service_capabilities_qa.js`. |
| **TA-10** | **Applicable** | Card actions: `Active/Inactive` switch (`toggleStaffActive`), `Show/Hide PIN` (`revealStaffPin` + `audit_logs`), `Unlock Account` (`unlockStaff` clearing DB lock + all IP rate limits), `Reset Device Session` (`saveStaffMember`), `Open Portal` (`/staff?id=...`), `Delete` (`deleteStaffMember` + `.cwp-v2-consequence-box`, **update** `test_delete_customer_staff_qa.js:69` `'🗑️ Delete'`), `deleteDesignation` (blocks `is_system_protected`). | Existing: `test_staff_pin_reveal_qa.js`, `test_staff_lockout_unlock_and_multidevice.js`, `test_delete_customer_staff_qa.js` (**update**), `test_staff_status_button_qa.js`. |
| **TA-11** | **Applicable** | All mutating/sensitive staff, PIN reveal, unlock, designation, and hierarchy actions enforce `adminProtectedActions` (`401`); unauthenticated `getStaffList` returns `sanitizeStaffForPublic` only (zero phone/PIN/KYC/salary leaks). | Existing: `test_staff_pin_reveal_qa.js`, `test_phase1f_auth_security.js`. |
| **TA-12** | **Applicable** | Enforces 10-digit mobile + duplicate phone check, 6-digit `^\d{6}$` PIN, `>=1` capability (`editCaps.length > 0`), designation ID `[a-z0-9_]{3,32}`; backend rejects capability removal if active route/job exists (`checkCapabilityChangeConflicts`) and rejects reporting cycles (`BFS depth <= 25`, `mgrLevel >= subLevel`). | Existing: `test_task_01_8_staff_service_capabilities_qa.js`, `test_task_01_9_staff_designation_and_hierarchy_qa.js`. |
| **TA-13** | **Applicable** | **Button-Lock Bug Fix Gate (`app.js:8732–8749`):** `handleEditStaffSubmit` MUST validate `editCaps.length === 0` **before** disabling `#btnSaveEditStaff`, and MUST re-enable `#btnSaveEditStaff` on any `400`/`409`/`500` backend error while preserving modal inputs! | New: `test_v2_staff_edit_validation_unlock_qa.js` (explicitly tests zero-capability & 409 conflict button unlock). |
| **TA-14** | **Applicable** | Empty staff roster or custom designation list renders contextual `.cwp-v2-empty-state-panel` with `+ Add New Staff`. | New: `test_v2_staff_roster_cdp.js`. |
| **TA-15** | **Applicable** | Create/Edit staff, PIN reveal, KYC upload, and Unlock show `.is-loading` states preventing duplicate submissions. | New: `test_v2_staff_roster_cdp.js`. |
| **TA-16** | **Applicable** | Changing staff phone, PIN, or active=false revokes active Staff PWA `auth_sessions` (`staff_auth`), locking compromised/deactivated devices; `deleteStaffMember` unassigns active routes/customers safely. | Existing: `test_staff_phone_edit_session_qa.js`, `test_staff_photo_and_inactive_qa.js`, `test_option1_active_session_shield.js`. |
| **TA-17** | **Applicable** | Staff cards, 5-KYC upload dropzones (`.cwp-v2-file-dropzone`), `#designationManagementModal`, and `#staffHierarchyModal` stack cleanly on `<600px` and `600–1023px` without overflow. | New: `test_v2_staff_roster_cdp.js`. |
| **TA-18** | **Applicable** | `/admin?tab=staff` / `#admin/staff` restores directly; Back closes `#staffEditModal`, `#addStaffModal`, `#designationManagementModal`, and `#staffHierarchyModal` (fixing V1 `getTopmostOpenModal()` omission!). | New: `test_v2_overlay_stack_cdp.js`. |

---

### 3.13 `M-HIDDEN-SUPPRESSED` — Hidden, Suppressed & Alias Elements

**Scope:** `#sideNavDashboard`, `#adminTabAddCust`, `washSolar` / `addCust` aliases, `#btnAdminBackfillHindi`, `#adminTabRecords .cwp-seg-nav` / `#filterAdminCategory` / `#filterAdminStaff`, `.reports-kpi-grid`, `#dccUnassignedBanner`, CSS-suppressed `.sidebar-nav-list .admin-tab-badge` / `.hub-live-badge`, hidden `#accountDropdownWrap`, hidden `#btnLightboxSendWhatsApp`.

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01..TA-10** | **Mostly N/A** (Except Redirects & `backfillHindi`) | Hidden elements have zero visible UI unless deliberately promoted in M4 (`#accountDropdownWrap` -> Account/Security menu in Phase 1; sidebar badges -> `.cwp-v2-nav-badge` only where counts are truthful; `#btnAdminBackfillHindi` -> Tools menu only after auth fix). | Existing: `test_dom_contract_reconciliation_qa.js`. |
| **TA-11** | **Applicable** | **Critical Security Gate (`server.js:4477–4513`):** `backfillHindi` MUST be added to `adminProtectedActions` (unauthenticated `POST /api { action: 'backfillHindi' }` must return `401`). | New: `test_backfill_hindi_auth_security_qa.js`. |
| **TA-12** | **N/A** | No visible user forms; `backfillHindi` takes `{}` and processes up to 1,000 rows server-side. | — |
| **TA-13** | **Applicable** | If `#btnAdminBackfillHindi` is surfaced, `handleBackfillHindi` (`app.js:1728–1753`) MUST implement `onFailure` to re-enable the button on error. | New: `test_backfill_hindi_auth_security_qa.js`. |
| **TA-14..TA-15** | **N/A** | Visually suppressed in production Admin. | — |
| **TA-16** | **Applicable** | Removing `.reports-kpi-grid` (`Index.html:1256`) or `#filterAdminCategory` (`L981`) in Phase 2/3/9 MUST NOT throw `TypeError: Cannot set properties of null` in `renderDailyCleanReports()` / `filterAdminRecords()` / `M-DASH` KPIs, and `#btnLightboxSendWhatsApp` remains hidden in Admin. | Existing: `test_admin_console_m3_redesign_e2e.js`, `test_dom_contract_reconciliation_qa.js`. |
| **TA-17** | **N/A** | Suppressed nodes occupy zero layout space. | — |
| **TA-18** | **Applicable** | Legacy URL aliases `?tab=washSolar` (redirects to `'specialJobs'`) and `?tab=addCust` (opens `#addCustomerModal` & sets `'records'`) continue resolving cleanly without 404 or blank pane. | Existing: `test_tab_persistence_and_live_sync_qa.js` (**update**). |

---

### 3.14 `M-LEGACY-ORPHANS` — Orphaned Frontend Controllers & Legacy Subviews

**Scope:** Dead JS functions `app.js:4746–5606` (`renderUnifiedAssignmentsLedger`, `openUnifiedJobAssignModal`, `renderStaffWorkloadAndPerformance`, `toggleStaffPerformanceSection` targeting non-existent `unifiedAssignmentsTableBody`, `unifiedJobAssignModal`, `staffPerformanceSection`). *(Note: `#rmLegacySeqView` is active inside `M-ROUTE-PLAN` §3.8 above.)*

| Area | Status | Exact Pass Criterion & Edge Cases | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01..TA-15** | **N/A** (Do Not Port) | Orphaned `app.js:4746–5606` controllers target DOM IDs absent from `Index.html`. They MUST NOT be ported into Aura V2 or wired to mock data. | — |
| **TA-16** | **Applicable** | Decommissioning `app.js:4746–5606` in Phase 9 (including removing `renderUnifiedAssignmentsLedger()` call at `app.js:4742`) causes zero regressions in `M-JOB-ASSIGN` (`#jobAssignmentsLedgerTable`), `M-SPECIAL-JOBS` (`#reassignJobModal`), or `npm test`. | Existing: `test_job_assign_dispatch_service_category_qa.js`, `test_daily_clean_assignment_hub_qa.js`. |
| **TA-17..TA-18** | **N/A** | Zero rendered UI and zero routes. | — |

---

### 3.15 `M-UNWIRED-BACKEND` — Implemented Backend Admin APIs Without V1 UI

**Scope:** `getAuditLogs`, `getDailyRouteReconciliation`, `getCustomerDccDetails`/`Subscriptions`/`renew`/`stop`/`cancel`, `resetStaffPin`, `moveStopInRoute`, `PUT/POST /api/admin/homepage-config`, `GET /api/admin/job-applications` (+ unrouted `updateJobApplicationStatus`), `toggleCustomerActive` (`400` stub in `server.js:3050`), `getStaffRouteView`/`Worklist`, `getServiceCatalog`, `cleanAndSyncStaff`.

> **Rule:** Items below are **Applicable ONLY if/when explicitly scoped and wired into a Phase (Phases 3, 4, 7, 8, or 9)**; otherwise they remain **N/A (Unwired Backend)** and are tracked under `API GAP — REQUIRES INVESTIGATION` (`M2 §4`).

| Area | Status | Exact Pass Criterion & Edge Cases (When Wired in Target Phase) | Existing Test(s) & New Test Required |
|---|---|---|---|
| **TA-01..TA-02** | **Applicable** *(when wired)* | `getAuditLogs` (Phase 9), `getDailyRouteReconciliation` (Phase 7), DCC Subscription Lifecycle (Phase 4), `resetStaffPin` (Phase 8), Homepage CMS & Careers Inbox (Phase 9) load real DB rows without mock data. | Existing: `test_session_persistence_and_audit_qa.js` (`getAuditLogs`), `test_route_management_and_sequence_qa.js`, `test_dcc_core_operations_qa.js`, `test_homepage_and_careers_qa.js`. |
| **TA-03..TA-07** | **Applicable** *(when wired)* | Audit Logs Data Grid supports `entityType`/`entityId`/`action`/`actor` filtering & diff drawer (`.cwp-v2-timeline`); Route Reconciliation supports date filter & planned-vs-logged status badges; Careers Inbox lists `job_applications` + resume download. | New per-phase tests when wired (`test_v2_audit_logs_cdp.js`, `test_v2_route_recon_cdp.js`). |
| **TA-08..TA-10** | **Applicable** *(when wired)* | `renewCustomerDccSubscription` / `stopCustomerDccSubscription` / `cancelCustomerDccSubscription`, `resetStaffPin`, `PUT/POST /api/admin/homepage-config`, and `toggleCustomerActive` (once handler added in `server.js`) persist cleanly to PostgreSQL + `audit_logs`. | Existing: `test_dcc_core_operations_qa.js`. New: `test_toggle_customer_active_qa.js`, `test_reset_staff_pin_qa.js`. |
| **TA-11** | **Applicable** *(Mandatory)* | **Security Gates:** Remove `NODE_ENV==='test'` auth bypass on `GET /api/admin/job-applications` (`server.js:2384`), `GET /api/customers` (`2199`), and `GET /api/leads` (`2223`) for production; verify `401` without Admin token across all unwired endpoints; resolve `toggleCustomerActive` `400` stub (`server.js:3050`). | Existing: `test_production_security_audit_qa.js`. New: `test_unwired_endpoints_auth_qa.js`. |
| **TA-12..TA-15** | **Applicable** *(when wired)* | Enforces PIN 6-digit validation (`resetStaffPin`), valid Homepage JSON/rates (`homepageConfigService`), `1MB`/`15MB` body limits, button `.is-loading` guards, and empty/retry states. | Existing: `test_homepage_and_careers_qa.js`. |
| **TA-16** | **Applicable** *(Mandatory)* | **Migration `019_` Integrity Check:** Verify `migrations/019_add_device_id_to_auth_sessions.sql` AND `019_enhance_dcc_core_operations.sql` collision (`migrations/migrate.js:85–95` PK `version='019'`) is resolved/verified on clean DBs; Homepage CMS writes preserve public `/` (`home.html`) contract. | Existing: `verify_phase1d_schema.js`, `test_phase1g_db_integrity.js`, `test_homepage_and_careers_qa.js`. |
| **TA-17..TA-18** | **Applicable** *(when wired)* | New Settings/Audit/Reconciliation views obey `<600px`/`600–1023px`/`>=1024px` reflow and `?tab=`/`#admin/<tab>` URL routing. | New: `test_v2_audit_logs_cdp.js`. |

---

## 4. Phase-by-Phase Regression Gate Protocol (Phases 0–9)

### 4.1 Cross-App & Staff PWA Protection Gates (Mandatory on Every Phase)

Every single phase (Phases 0–9) MUST pass these **4 non-negotiable baseline gates** before merge:

1. **Production Suite:** `npm test` (all `56` scripts passing; any legacy assertion modified to match Aura V2's emoji-free/A11Y spec must be documented and justified in the phase PR).
2. **Neon DB Suite (when DB/API/schema touched):** `npm run test:neon` (all `8` scripts passing against Neon `DATABASE_URL`).
3. **Isolation & Cross-Portal Smoke:** `node scripts/verify_admin_v2_isolation.js` + `node tests/test_pwa_staff_qa.js` + `node tests/test_homepage_and_careers_qa.js` — guaranteeing:
   - `/staff`, `#staffView`, `staff-m3.css`, `sw.js`, `manifest.json`, `offline.html` render identically with zero `.cwp-v2-*` bleed;
   - `/`, `/home`, `/careers` render identically with zero regressions.
4. **Live CDP Browser Verification + Human Visual Sign-Off:** Run phase-specific CDP checks (`390x844`, `768x1024`, `1440x900`) verifying DOM geometry, computed styles, keyboard focus, and live `POST /api` state (never relying on screenshots alone).

---

### 4.2 Phase 0–9 Gate Specifications & Legacy Test Reconciliation

| Phase | Scope & Canonical Modules | Pre-Merge Gate Tests (Existing + New) | Legacy `npm test` Assertions Requiring Coordinated Update |
|---|---|---|---|
| **Phase 0** | **Aura V2 Hardening & Shared Factories:** Self-host Material Symbols/fonts in `public/admin-v2/` (`01 §7`); add `Noto Sans Devanagari` + `line-height: 1.5` (`DDR-002`); add `<600px`/`600–1023px`/`>=1024px` `@media` & `68px` `.is-collapsed` rail (`v2-layout.css`); extract Task 06/07 factories; extend `v2-overlay.js` bridge. | `npm test`, `node scripts/verify_admin_v2_isolation.js`, `node tests/test_aura_selection_dropdown_filter_qa.js`, `node tests/test_aura_table_datagrid_qa.js`. **New:** Add Task 06/07 + isolation + CDP responsive geometry & Devanagari `line-height: 1.5` check to `package.json`. | None (isolated inside `public/admin-v2/`). |
| **Phase 1** | **Admin Shell (`M-SHELL`) & Auth Gate (`M-AUTH`):** Dark Navy `#0b1a2b` Sidebar + Light `#f8fafc` Workspace; URL `?tab=`/`#admin/<tab>` & `popstate` overlay stack; accessible Login Card (`A11Y-01` fix); fix `v2-auth.js` `checkSession()`; relocate `#newAdminPasswordInput` & route `updateAdminPassword` via `authService`; Toast stack & SSE Sync Popover. | `npm test`, `npm run test:neon` (`test_phase1f_auth_security.js`), `test_login_api_e2e.js`, `test_session_persistence_and_audit_qa.js`, `test_production_security_audit_qa.js`. **New:** `test_v2_auth_session_check_qa.js`, `test_v2_shell_navigation_cdp.js`, `test_v2_overlay_stack_cdp.js`. | **Coordinated updates required in:** `test_cwp_admin_neural_login_qa.js` (`L59` `'TAP CORE TO AUTHENTICATE'` if canvas gate replaced), `test_aura_contrast_and_a11y_qa.js` (`L64–91` `#ffffff` -> `#0b1a2b` dark sidebar contrast), `test_header_modernization_qa.js` (`L44–46` header tokens), `test_aura_admin_modal_focus_qa.js` (`L34–90` `v2-overlay.js` adapter), `test_tab_persistence_and_live_sync_qa.js` (`L105` 6->12 tabs). |
| **Phase 2** | **Operations Dashboard (`M-DASH`) & Daily Clean Reports (`M-CLEAN-REPORTS`):** Aura KPI/Intel cards + 3 SVG charts + Crew Pulse; Task 06 filter bar + Task 07 Data Grid (`id` on `<table>`); `#reportPhotoLightboxModal`, `#editCleanReportModal`, `#deleteCleanReportModal` on `v2-overlay.js`; 200-row cap notice/pagination; strip emojis. | `npm test`, `test_sidebar_and_operations_dashboard_qa.js`, `test_daily_clean_reports_backend.js`, `test_daily_clean_photo_and_reports_frontend.js`, `test_daily_clean_report_edit_and_delete_qa.js`, `test_realtime_and_special_jobs_date_filter_qa.js`. **New:** `test_v2_dashboard_live_cdp.js`, `test_v2_clean_reports_cdp.js`, `test_clean_reports_pagination_cap_qa.js`. | Verify `.reports-kpi-grid` (`Index.html:1256`) consumers in `M-DASH` are migrated before removing hidden bridge DOM. |
| **Phase 3** | **Customer Directory (`M-CUSTOMERS` Core):** Task 06 filter bar + bilingual phonetic search + Task 07 Data Grid (`34px` compact + `line-height: 1.5` Devanagari + `.is-sticky-action`); `#addCustomerModal` 4-step wizard + draft; `#editCustomerModal` 6-tab wrap (`FRM-01`) + separated Delete (`FRM-03`); nested `#cwpPhotoCropperModal`; fix `backfillHindi` auth & button lock; resolve `toggleCustomerActive` & `500`-row cap. | `npm test`, `test_bilingual_search.js`, `test_indic_hindi_transliteration_qa.js`, `test_photo_crop_rotation.js`, `test_multi_location_and_dispatch_qa.js`, `test_car_make_and_color_qa.js`, `test_multi_vehicle_rotation_qa.js`, `test_separated_address_columns_qa.js`, `test_dom_contract_reconciliation_qa.js`. **New:** `test_v2_customers_datagrid_cdp.js`, `test_v2_customers_modals_cdp.js`, `test_backfill_hindi_auth_security_qa.js`. | **Coordinated updates required in:** `test_service_categories_in_edit_customer_qa.js` (`L64–68` emoji `<option>` strings), `test_delete_customer_staff_qa.js` (`L69` `'🗑️ Delete'`). |
| **Phase 4** | **Service Assignment (`M-SERVICE-ASSIGN`), Packages, Bookings & DCC Lifecycle:** Aura Task 07 tables + `#assignServiceModal` customer-picker fix (`openAssignServiceModal(0)`); replace `prompt()` on Stop Service; `#sellPackageModal`, `#redeemPackageModal`, `#packageHistoryModal`, `#createBookingModal` nested overlays; wire DCC lifecycle endpoints (`M-UNWIRED-BACKEND`). | `npm test`, `test_customer_service_separation_qa.js`, `test_packages_and_entitlements_qa.js`, `test_packages_sql_ambiguity_qa.js`, `test_service_booking_and_lifecycle_qa.js`, `test_dcc_core_operations_qa.js`, `test_p0_defect_remediation_qa.js`. **New:** `test_v2_service_assign_cdp.js`, `test_v2_service_assign_picker_qa.js`. | Preserve all DOM IDs checked by `test_dom_contract_reconciliation_qa.js` (`#sellPackageModal`, `#redeemPackageModal`, `#packageHistoryModal`, `#createBookingModal`). |
| **Phase 5** | **Job Assignment (`M-JOB-ASSIGN`) & Wash & Solar Hub (`M-SPECIAL-JOBS`):** Consolidate triple-stacked filter bars into Task 06 bar + collapsible drawer; Aura Data Grids for DCC Roster, Active Ledger, and Special Jobs; fix `serviceJobsRepo` `INNER JOIN` -> `LEFT JOIN`; fix `cancelSpecialJob` `auditLogs.logChange` keys; strip emojis. | `npm test`, `test_daily_clean_assignment_hub_qa.js`, `test_job_assign_dispatch_service_category_qa.js`, `test_ondemand_services_qa.js`, `test_car_wash_seater_and_solar_isolation_qa.js`, `test_tentative_time_and_sequence_qa.js`, `test_service_catalog_and_reassignment_qa.js`. **New:** `test_v2_job_assign_cdp.js`, `test_v2_special_jobs_cdp.js`, `test_special_jobs_null_location_qa.js`, `test_cancel_job_audit_log_qa.js`. | **Coordinated update required in:** `test_special_jobs_ledger_qa.js` (`L215, 243` `'☀️ 30 Solar Panels'` -> Material Symbol / clean text). |
| **Phase 6** | **Leads Pipeline (`M-LEADS`) & Live Staff Tracking (`M-STAFF-TRACKING`):** Aura Task 07 Leads Table + Kanban (keep HTML5 DnD + `←`/`→`, strip emojis); fix `LEAD_CHANGED` SSE broadcast; wrap `TrackingMapAdapter` & migrate `#trackingStoppagesDrawer` to `v2-overlay.js` `.cwp-v2-drawer-lg` with `role="dialog" aria-modal="true"`. | `npm test`, `test_leads_feature_qa.js`, `test_lead_edit_qa.js`, `test_kanban_compact_dnd_qa.js`, `test_staff_tracking_api.js`, `test_staff_tracking_browser.js` (CDP). **New:** `test_v2_leads_cdp.js`, `test_leads_sse_broadcast_qa.js`, `test_v2_tracking_drawer_a11y_cdp.js`. | Update `test_leads_feature_qa.js` / `test_kanban_compact_dnd_qa.js` only if emoji assertions are introduced. |
| **Phase 7** | **DCC Route Plan (`M-ROUTE-PLAN`) & Reconciliation:** Aura cards, `CMP-09` stop sequence items, `#rmBatchBar` partial-failure reporting, 7 `rm*` modals on `v2-overlay.js`, emoji-free `#rmLegacySeqView`, and optional `getDailyRouteReconciliation` UI. | `npm test`, `test_route_management_ui_first_qa.js`, `test_route_management_and_sequence_qa.js`, `test_daily_clean_sequence_qa.js`, `test_daily_route_execution_qa.js`, `test_task_01_7_operational_integrity_qa.js`, `test_phase1g_staff.js` (verifies Staff route mirror). **New:** `test_v2_route_plan_cdp.js`, `test_v2_route_batch_partial_fail_qa.js`. | `test_route_management_ui_first_qa.js` already enforces zero emojis on `.rm-*`; extend same zero-emoji rule to `#rmLegacySeqView`. |
| **Phase 8** | **Staff Management (`M-STAFF`):** Aura roster cards, `.cwp-v2-file-dropzone` (5 KYC docs), `staffCapabilityService` & `staffDesignationService` modals on `v2-overlay.js`, **fix `handleEditStaffSubmit` button-lock bug (`app.js:8732–8749`)**, optional `resetStaffPin` modal, strip 52 emoji lines. | `npm test`, `test_staff_extended_fields_qa.js`, `test_staff_pin_reveal_qa.js`, `test_staff_lockout_unlock_and_multidevice.js`, `test_staff_phone_edit_session_qa.js`, `test_task_01_8_staff_service_capabilities_qa.js`, `test_task_01_9_staff_designation_and_hierarchy_qa.js`. **New:** `test_v2_staff_roster_cdp.js`, `test_v2_staff_edit_validation_unlock_qa.js`. | **Coordinated update required in:** `test_delete_customer_staff_qa.js` (`L69` `'🗑️ Delete'` -> Material Symbol `delete` + `Delete`). |
| **Phase 9** | **Unwired Tools, Dead-Code Decommissioning & Cutover:** Optionally wire `getAuditLogs`, Homepage CMS, Careers Inbox; decommission `M-LEGACY-ORPHANS` (`app.js:4746–5606`), `#adminTabAddCust`, hidden bridge DOM; reconcile `019_` migration prefix; remove `NODE_ENV==='test'` auth bypasses; retire `/admin-v2` playground or promote `/admin` cleanly. | **Full Regression:** `npm test` + `npm run test:neon` + ALL CDP V2 suites + `test_pwa_staff_qa.js` + `test_homepage_and_careers_qa.js` + `test_production_security_audit_qa.js` + `verify_phase1d_schema.js`. **New:** `test_unwired_endpoints_auth_qa.js`, zero-emoji / zero-mock-data / zero-CDN static gate. | Update `scripts/verify_admin_v2_isolation.js` to reflect final promoted `/admin` V2 boundary while still asserting `/staff` V1/M3 isolation. |

---

### 4.3 Non-Negotiable Audit & Integrity Verification Rules

1. **Zero Mock Data in Production Admin:** Automated CI check MUST assert that production Admin JS bundles never reference `MOCK_OPERATIONS`, `TASK07_OPERATIONS_DATASET`, `TASK06_OPERATIONS`, `SEARCHABLE_SERVICES`, or `ZONE_DEFINITIONS` (from `v2-playground.js`).
2. **Zero Emoji & Mixed-Icon Regression:** Automated CI scan across Admin HTML (`Index.html` Admin sections + modals) and Admin JS (`app.js` / `v2-*.js`) MUST assert zero UI Unicode emojis and zero unapproved inline UI SVGs (preserving only the 3 Dashboard SVG charts and `TrackingMapAdapter` SVG radar fallback).
3. **Zero External Font CDN Reliance:** Automated check MUST confirm `public/admin-v2/index.html` and Admin V2 load `/fonts/material-symbols-outlined.woff2` locally (no `fonts.googleapis.com` network dependency per `docs/design-system/01 §7`).
4. **Zero Silent Failures or Button Locks:** Every mutation handler (`apiCall` or `fetch`) MUST provide an error callback (`onFailure` / `catch`) that re-enables disabled buttons, clears `.is-loading`, and preserves user-entered form/modal state.
5. **Strict Architecture Preservation:** Zero React, Next.js, Vue, Angular, or Express introductions; 100% Vanilla JS/HTML/CSS + native Node.js `server.js` + PostgreSQL/Neon (`services/` & `db/repositories/`).
6. **Screenshot Non-Sufficiency:** Any PR or QA handoff claiming visual verification via PNG screenshots alone without DOM geometry, computed-style, keyboard/a11y, functional network assertions, and human inspection MUST be rejected.
