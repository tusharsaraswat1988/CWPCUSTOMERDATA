# CWP Aura V2 Live-Migration Master Audit & Workflow Preservation Blueprint (Phases A & C)

**Audit Target:** `e:\CWP DATA APP` (`cwp-staff-viewer` v`3.2.1`)  
**Audit Date:** 2026-11-26  
**Scope & Boundaries:** Strict read-only repository and architecture audit. Zero production application, backend, database, Staff Portal, or public website files were modified.  
**Design System Baseline:** `docs/design-system/01–07` (v1.0.0) & `public/admin-v2/` (Tasks 01–07 + Overlay System)  
**Companion Deliverables in `docs/admin-v2/`:**
- `docs/admin-v2/CWP_ADMIN_V2_API_DATA_MAP.md` — End-to-end API, service, repository, PostgreSQL, and `API GAP — REQUIRES INVESTIGATION` data map (Phase B)
- `docs/admin-v2/CWP_AURA_PRODUCTION_COMPONENT_MAPPING.md` — Production UI to CWP Aura component mapping (Phase D)
- `docs/admin-v2/CWP_ADMIN_V2_MIGRATION_ROADMAP.md` — Admin shell migration contract & phased roadmap Phases 0–9 (Phases E, F, G & Design Rules)
- `docs/admin-v2/CWP_ADMIN_V2_REGRESSION_MATRIX.md` — Test infrastructure audit & 18-area module verification matrix

---

## Table of Contents
1. [Repository & Application Boundaries](#1-repository--application-boundaries)
2. [Pre-Existing Design System & UX Audit Reconciliation](#2-pre-existing-design-system--ux-audit-reconciliation)
3. [Phase A: Exhaustive Admin Module Inventory (All 17 Required Fields)](#3-phase-a-exhaustive-admin-module-inventory-all-17-required-fields)
4. [Exhaustive Inventory of Modals, Drawers, Tables, Forms & Reports](#4-exhaustive-inventory-of-modals-drawers-tables-forms--reports)
5. [Phase C: Complete Operational Workflows & Aura V2 Migration Mapping](#5-phase-c-complete-operational-workflows--aura-v2-migration-mapping)

---

## 1. Repository & Application Boundaries

The `e:\CWP DATA APP` repository hosts five distinct web surfaces inside a single Node.js monolithic HTTP server (`server.js`, 6,886 lines, native `http.createServer` with zero Express dependency) backed by 16 service modules (`services/*.js`), 21 repository modules (`db/repositories/*.js`), and 23 SQL migration files (`migrations/001`–`022`, including duplicate `019_` prefix) targeting Neon/PostgreSQL (`27` public tables + `meta.schema_migrations`, `28` total tables).

### 1.1 Application Surface & Route Boundaries

| Surface | Entry Routes (`server.js:6657–6753`) | Frontend Files | Scope Status in Task 08 Migration |
|---|---|---|---|
| **Production CWP Admin** | `/admin`, `/admin/*`, `/?admin=...` (`initialMode = 'admin'`, injects `admin-mode-active` class on `Index.html`) | Shared `Index.html` (4,486 lines), `public/js/app.js` (23,843 lines), `public/css/style.css` (21,175 lines), `public/css/m3-tokens.css`, `public/js/cwp-neural-core.js` (701 lines), `public/css/cwp-neural-login.css`, `public/js/cropper.min.js`, `public/fonts/material-symbols-outlined.woff2` | **IN SCOPE (Target for Aura V2 migration)** |
| **Staff Portal PWA** | `/staff`, `/staff/*`, `/?staff=...`, `/?id=...`, and fallback unmatched non-`/api/` paths (`initialMode = 'staff'`) | Shared `Index.html` (`#staffHeader`, `#staffView`, 6 staff-only modals), shared `public/js/app.js`, `public/css/staff-m3.css`, `sw.js` (`cwp-staff-pwa-v1.0.33`, `start_url: "/staff"`), `manifest.json`, `offline.html` | **OUT OF SCOPE — DO NOT MODIFY** (must remain completely unaffected by Admin migration) |
| **Public Customer Website** | `/`, `/home`, `/terms`, `/privacy`, `/refund` (when `!isInternalPortal`, `server.js:6697–6711`) | `public/home.html`, `public/css/home.css`, `public/js/home.js` (calls `GET /api/public/homepage-config`, `POST /api/leads`, `POST /api/public/book`) | **OUT OF SCOPE — DO NOT MODIFY** |
| **Public Careers Portal** | `/careers`, `/career`, `/jobs`, `/job` (`server.js:6666–6679`) | `public/careers.html`, `public/css/careers.css`, `public/js/careers.js` (calls `POST /api/careers/apply`) | **OUT OF SCOPE — DO NOT MODIFY** |
| **Aura V2 Design System Playground** | `/admin-v2`, `/admin-v2/*`, `/admin/v2`, `/admin/v2/*` (`server.js:6658, 6682–6693`) | Isolated 10-file directory in `public/admin-v2/`: `index.html` (4,382 lines), `css/v2-{tokens,base,layout,components}.css`, `js/v2-{app,auth,shell,overlay,playground}.js` | **REFERENCE / COMPONENT SOURCE** (strictly isolated via `.cwp-v2-root`, `--cwp-v2-*`, `window.CWP_ADMIN_V2`; verified by `scripts/verify_admin_v2_isolation.js`) |

### 1.2 Dual-Mode Client Boundary (`Index.html` + `public/js/app.js`)
- `DOMContentLoaded` (`app.js:1881–1916`) resolves active mode in priority order: URL path/query (`/admin`, `?admin=` vs `/staff`, `?staff=`, `?id=`) -> `sessionStorage.getItem('cwp_user_role')` -> server-injected `initialMode` -> `isUserAdminAuthenticated()`, defaulting to `'staff'`.
- `applyViewMode(mode, isInitial)` (`app.js:1919–2017`) toggles `#staffHeader`/`#staffView` vs `#adminHeader`/`#adminView`, updates `cwp_user_role` in `sessionStorage`, and rewrites the URL via `history.replaceState` / `pushState` to `/admin` or `/staff`.
- Because `Index.html`, `public/js/app.js`, and `public/css/style.css` are **shared** between Staff PWA and Production Admin, any future Admin V2 migration MUST preserve Staff DOM hooks, CSS classes, and shared modal handlers (`#imageModal`, `#addressViewModal`, `#logoutConfirmModal`) or cleanly isolate Admin V2 assets while keeping `/staff` untouched.

---

## 2. Pre-Existing Design System & UX Audit Reconciliation

Before cataloging modules, existing documentation in `docs/design-system/` and root `CWP_*.md` files was audited against the actual live codebase (`Index.html`, `public/js/app.js`, `public/css/style.css`, `public/admin-v2/`).

### 2.1 `docs/design-system/01–07` (v1.0.0 Baseline) vs `public/admin-v2/` Playground
1. **Self-Hosted Font & Offline Rule (`01-product-and-user-context.md §7`, `07 §3 DDR-002`):** Spec mandates `Poppins` + `Noto Sans Devanagari` (`line-height: 1.5`) + `JetBrains Mono` and self-hosted `/fonts/material-symbols-outlined.woff2` with zero external CDN reliance. Live `public/admin-v2/index.html:12` currently loads `Inter`, `JetBrains Mono`, and `Material Symbols Outlined` from `https://fonts.googleapis.com` and omits `Noto Sans Devanagari` from `v2-tokens.css` (`--cwp-v2-font-sans`). Live production `Index.html` uses self-hosted `/fonts/material-symbols-outlined.woff2` via `public/css/m3-tokens.css:6–12`.
2. **Dark Mode vs Light-Only Workspace (`03-design-system-specification.md` vs `v2-tokens.css`):** `03` defines both Light and Dark contrast matrices; `public/admin-v2/` adopts Locked Decision #1 (Dark Navy Sidebar `#0b1a2b`) + Locked Decision #11 (Light Workspace `#f8fafc`).
3. **Responsive Reflow Contract (`06-responsive-and-accessibility-contract.md §1–2`):** Spec defines Compact (`<600px`), Medium (`600–1023px`), and Expanded (`>=1024px`) viewports with collapsible sidebar drawer. `public/admin-v2/css/v2-layout.css` currently has **0** `@media` queries and `v2-components.css` has only **1** (`@media (max-width: 640px)` at L1783 for overlays).
4. **Two Task Numbering Schemes:** `public/admin-v2/` internally labels Tasks `01` (Foundations/Buttons), `02` (Inputs), `03` (Compact Table Prototype), `04` (`v2-overlay.js` Modals/Drawers), `05` (Forms & Specialized Inputs), `06` (Selection/Dropdowns/Filters/Empty States), and `07` (Operational Data Grid `34px`/`46px`). `ORIGINAL_REQUEST.md` references Tasks `01`, `02`, `05`, `06`, `07` + existing modal/drawer overlay system. No standalone Task `01–07` markdown files exist outside `docs/design-system/01–07`; those specs reside directly inside `public/admin-v2/` and `tests/test_aura_*.js`.

### 2.2 Root `CWP_*.md` UX Audits vs Live Production Code (`Index.html` & `app.js`)
Six root UX documents exist (`CWP_UNIFIED_DESIGN_SYSTEM_PLAN.md`, `CWP_UX_BASELINE_AUDIT.md`, `CWP_UX_ISSUE_REGISTER.md`, `CWP_UX_REDESIGN_ROADMAP.md`, `CWP_SCREEN_BY_SCREEN_UX_AUDIT.md`, `CWP_USER_PERSONAS_AND_WORKFLOWS.md`). Direct inspection of `Index.html` and `public/js/app.js` reveals critical discrepancies against claims in `CWP_UX_REDESIGN_ROADMAP.md` (`§2 Living Implementation Status Matrix`):

| Claim in `CWP_UX_REDESIGN_ROADMAP.md` (2026-11-25) | Live Code Reality (`Index.html` & `public/js/app.js`) | Audit Implication for Aura V2 |
|---|---|---|
| **Batch 1 (`Verified`):** "Replace 'Tap core to authenticate' 3D canvas orb on `/admin` with a clean, accessible enterprise login card" | `#adminAuthGate` (`Index.html:450–538`) STILL renders `#cwpNeuralCoreCanvas`, `#cwpCoreIntroBtn` ("TAP CORE TO AUTHENTICATE"), and `cwp-neural-core.js` hiding `#cwpCorePasswordBox` until tapped. | Defect `A11Y-01` remains open in production; Aura V2 Phase 1 must replace or bypass the canvas gate with an accessible login card (`v2-auth.js`). |
| **Batch 1 (`Verified`):** "Relocate 'Change Admin Password' from the staff roster to a header profile popover menu" | `#newAdminPasswordInput` (`Index.html:920–925`) is STILL embedded inline at the bottom of `#adminTabStaff`; `#accountDropdownWrap` (`Index.html:126–148`) is forced `display: none !important;`. | Must be explicitly relocated in Aura V2 Shell (`M-SHELL` / `M-AUTH`) without breaking DOM contracts during transition. |
| **Batch 2 (`Implemented` / `Verified`):** "Fix Edit Customer modal header horizontal scrollbar and separate destructive Delete Customer action" | `#editCustomerModal` (`Index.html:2300–2319`) retains 6 horizontal `.edit-modal-tabs`; `Delete Customer` (`L2567`) sits inside the same `.modal-card-footer` row as `Save Changes` (`L2572`). | `FRM-01` and `FRM-03` remain unresolved in production; must be addressed in Phase 3 (`M-CUSTOMERS`). |
| **Batch 3–5 & Design Gate (`Verified`):** "Exactly zero Unicode system emojis in UI controls or badges" | Live Admin HTML (`Index.html:61–150, 449–1637, 1729–4486`) still contains **213** emoji lines and **~10** non-chart inline UI SVGs; Admin JS (`app.js`) contains **361** emoji lines alongside **203** Material Symbols. | `BRD-01` remains open across Leads, Customer Modals, Staff KYC, Clean Reports, Legacy Sequence, and Toasts. Aura V2 must enforce Material Symbols ONLY. |
| **Batch 5 (`Verified`):** Route Management (`T01.11`), Job Assignment, Wash & Solar Hub | `#adminTabSequence` (`rm-*` views, `Index.html:685–809`) and `#adminTabSpecialJobs` (`L1334–1432`) were genuinely modernized with Material Symbols, while `#rmLegacySeqView` (`L810–863`) and `#adminTabLeads` (`L645–684`) retain legacy styling/emojis. | Preserve `rm-*` and `specialJobs` domain logic while migrating chrome to Aura V2 tokens/components. |

---

## 3. Phase A: Exhaustive Admin Module Inventory (All 17 Required Fields)

**Canonical Module IDs Used Across All Deliverables:**
`M-AUTH`, `M-SHELL`, `M-DASH`, `M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`, `M-JOB-ASSIGN`, `M-STAFF-TRACKING`, `M-ROUTE-PLAN`, `M-CUSTOMERS`, `M-SERVICE-ASSIGN`, `M-LEADS`, `M-STAFF`, `M-HIDDEN-SUPPRESSED`, `M-LEGACY-ORPHANS`, `M-UNWIRED-BACKEND`.

Every module below explicitly documents all **17 required fields**.

---

### 3.1 `M-AUTH` — Admin Authentication Gate & Security Settings

- **Module:** `M-AUTH` (Admin Authentication Gate & Password Management)
- **Route:** `/admin`, `/admin/*`, `/?admin=...` (overlay gate `#adminAuthGate` shown when `!isUserAdminAuthenticated()`; password update form inside `/admin?tab=staff`)
- **Page files:** `Index.html:450–538, 915–926`, `public/js/app.js:2639–2941, 5827–5856`, `public/js/cwp-neural-core.js:1–701`, `public/css/cwp-neural-login.css`, `server.js:473–560, 2635–2734, 3057, 4143–4182`, `services/authService.js:11–200, 338–429`, `db/repositories/adminUsersRepo.js`, `db/repositories/authSessionsRepo.js`
- **Navigation:** Automatically displayed on unauthenticated `/admin` entry (`checkAdminAuthStatus()`, `app.js:2727–2760`); Logout via `#sidebarAdminLogoutBtn` (`Index.html:631`) -> `#logoutConfirmModal` (`L1998`); Change Password form currently sits at bottom of `#adminTabStaff` (`Index.html:915–926`).
- **Purpose:** Authenticates Admin operator via password, issues 12-hour (`43200s`) `adm_` session token, handles debounced auto-login (`4+` chars), persists session (`sessionStorage` + optional `localStorage`), revokes session on logout, and updates admin password.
- **Data source:** PostgreSQL `public.admin_users` (`username`, `password_hash`, `salt`) and `public.auth_sessions` (`token_hash` SHA-256, `user_type='admin'`, `expires_at`, `revoked_at`), plus in-memory IP rate-limit map (`server.js:473–554`).
- **Read operations:** Client session check reads `sessionStorage`/`localStorage` (`cwp_admin_token`, `cwp_admin_auth`, `cwp_admin_auth_ts`); backend `resolveAdminSession(token)` validates token against `public.auth_sessions` on every protected request.
- **Write operations:** `POST /api` `action: "verifyAdminPassword"` (validates scrypt password, inserts `auth_sessions` row, logs `audit_logs`); `POST /api` `action: "logoutAdmin"` (sets `revoked_at` in `auth_sessions`); `POST /api` `action: "updateAdminPassword"` (updates `admin_users` password hash/salt).
- **Actions:** Tap Neural Core (`#cwpCoreBtn` / `#cwpCoreIntroBtn`), auto-login after 450ms debounce (`initAdminAutoLogin`, `app.js:2762–2790`), manual submit (`handleAdminAuth`, `app.js:2792–2906`), toggle password eye (`togglePasswordVisibility`), remember-device toggle (`#rememberAdminDevice`), login theme toggle (`toggleTheme()`), logout (`handleAdminLogout` -> `proceedLogout`), update admin password (`handleUpdateAdminPassword`, `app.js:2925–2941`).
- **Filters:** None.
- **Forms:**
  1. `#adminAuthForm` (`Index.html:489–525`): `#adminPasswordInput` (`required`), `#rememberAdminDevice` (checkbox, default checked), `#btnAdminLogin`.
  2. Anonymous Change Admin Password `<form>` (`Index.html:920–925`): `#newAdminPasswordInput` (`minlength="4" required`).
- **Permissions:** `verifyAdminPassword` and `logoutAdmin` are public RPC actions (rate-limited at 5 failures / 5 min -> `429`). `updateAdminPassword` requires valid `cwp_admin_token` (`adminProtectedActions`, `server.js:3057`). Binary Admin access only.
- **Dependencies:** `cwp-neural-core.js`, `apiCall` (`app.js:5732–5825`), `handleUnauthorizedResponse` (`app.js:5827–5856`), `initAdminRealtimeStream()`, `switchAdminTab(getSavedAdminTab())`.
- **Current UI:** Fullscreen 3D Fibonacci Neural Core canvas (`#cwpNeuralCoreCanvas`) with animated mesh gradient (`cwp-neural-login.css`), tap-to-reveal `#cwpCorePasswordBox`, shake error banner (`#adminAuthError`), and inline password form buried in Staff tab (`Index.html:920–925`).
- **Migration complexity:** Medium (must replace/bypass canvas tap gate for keyboard accessibility while preserving `cwp_admin_token` storage keys, auto-login/rate-limit UX, `#logoutConfirmModal`, and moving Change Password to Settings/Account menu).
- **Risk:** High (broken auth lockouts, token clearing, or `401` handling breaks every Admin module).
- **Recommended migration phase:** Phase 1 (Admin Shell & Enterprise Auth Gate).

---

### 3.2 `M-SHELL` — Admin Shell, Header, Sidebar, Navigation Contracts & Shared Overlays

- **Module:** `M-SHELL` (Admin Global Frame, Navigation Rail, Header Utilities, URL/History Sync & Shared Modal Infrastructure)
- **Route:** `/admin`, `/admin/*`, `/?admin=...` with `?tab=<tabName>` and `#admin/<tabName>`
- **Page files:** `Index.html:61–150, 539–644, 1883–2035, 3114–3194`, `public/js/app.js:1229–1440, 1881–2017, 2447–2638, 2645–2726, 2943–3422, 5694–5856, 15429–15725`, `public/css/style.css:15760–15850, 16662–16805, 18175–18237`
- **Navigation:** Top fixed 56px header (`#adminHeader`), collapsible left sidebar (`#adminSidebar`, 260px expanded / 72px `.rail-mode.collapsed`, persisted in `localStorage.cwp_admin_sidebar_collapsed`), mobile slide-over drawer (`<=1024px`) with `#adminSidebarBackdrop` and sticky `#adminMobileTopbar`, 2 sidebar groups (`OPERATIONS` with 6 tabs, `MANAGEMENT` with 4 tabs), plus `#sidebarAdminLogoutBtn`.
- **Purpose:** Provides persistent Admin navigation, mode enforcement (`admin` vs `staff`), SSE real-time status & manual sync (`#staffLiveBadge` / `#syncDetailsPopover`), language toggle (EN/HI), dark/light theme toggle, URL state synchronization (`?tab=` + `#admin/<tab>`), modal back-button stack (`pushModalHistory` / `popModalHistory` / `getTopmostOpenModal`), audio chimes (`playNewTaskChime`, `playTaskCompletedChime`), and shared overlays (`#imageModal`, `#addressViewModal`, `#logoutConfirmModal`, `#cwpPhotoCropperModal`).
- **Data source:** `localStorage` (`cwp_admin_active_tab`, `cwp_admin_sidebar_collapsed`, `cwp_lang`, `cwp_theme`, `cwp_admin_token`), `sessionStorage` (`cwp_user_role`, `cwp_admin_token`), SSE `GET /api/admin-realtime-stream` (`CONNECTED`, `CUSTOMERS_CHANGED`, `DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, `CUSTOMER_ASSIGNMENT_CHANGED`, plus dead listener `LEAD_CHANGED`).
- **Read operations:** `GET /api/admin-realtime-stream?token=...` (EventSource with 20s heartbeat and 5s reconnect); 15s visibility-gated polling via `startAdminRealtimePulse()` (`app.js:3389–3406`) calling `loadAdminRecords`, `loadDailyCleanReports`, `loadAdminSpecialJobs`.
- **Write operations:** None directly (delegates logout to `M-AUTH` `logoutAdmin`).
- **Actions:** `switchAdminTab(tabName, updateUrl)`, `toggleDesktopSidebarCollapse()`, `toggleAdminSidebar()`, `closeAdminSidebar()`, `handleBrandLogoClick()` (routes to `'records'`), `toggleSyncDetailsPopover()`, `handleManualSyncClick()`, `toggleLangDropdown()` -> `selectAppLanguage('en'|'hi')`, `toggleTheme()`, `handleAdminLogout()`, `openImageModal()`, `openAddressModal()`, `openCropperModal()`, `closeTopmostModal()` on Escape/`popstate`.
- **Filters:** None (global search and notification center do NOT exist in current shell).
- **Forms:** None directly (shared modals are view/confirm/cropper).
- **Permissions:** Visible only when `state.currentView === 'admin'` and `isUserAdminAuthenticated()`. Binary Admin access; `#accountDropdownWrap` hardcodes `'Admin'` / `'SUPER ADMIN'` (currently `display: none !important`).
- **Dependencies:** All 10 Admin tab modules (`M-DASH` through `M-STAFF`), `v2-overlay.js` (target replacement for 3 legacy modal overlay classes + brittle `getTopmostOpenModal()`).
- **Current UI:** 56px light header with inline SVGs & emojis (`🌙`, `✓`, `✕`), light sidebar (`#ffffff` in light mode, `#0b1329` in dark mode) where all `.admin-tab-badge` / `.hub-live-badge` pills are CSS-suppressed (`style.css:15774–15778`), no global breadcrumbs, no global search, no notification center.
- **Migration complexity:** High (shared `Index.html` / `app.js` / `style.css` with `/staff`; must preserve `?tab=` / `#admin/<tab>` / `popstate` / `hashchange` contracts and all DOM IDs checked by `test_dom_contract_reconciliation_qa.js`).
- **Risk:** High (regression can break Staff mode `/` `/staff` routing, modal focus/back-button navigation, or SSE real-time updates).
- **Recommended migration phase:** Phase 0 (Foundation Tokens & Shared Overlay Adapter) & Phase 1 (Admin Shell & Auth).

---

### 3.3 `M-DASH` — Unified Analytics Dashboard

- **Module:** `M-DASH` (Operations & Field Analytics Dashboard)
- **Route:** `/admin?tab=dashboard` / `#admin/dashboard`
- **Page files:** `Index.html:1113–1243`, `public/js/app.js:2966–2981, 3006–3017, 3133–3255, 3423–3703`, `public/css/style.css`
- **Navigation:** Sidebar `OPERATIONS` -> `Dashboard` (`#tabBtnDashboard`, `Index.html:557`). Note: `#adminOpsDashboardHub` (`Index.html:1114–1197`) is shown above the active pane when tab is `dashboard`, `cleanReports`, or `specialJobs` (`app.js:2967–2971`).
- **Purpose:** Provides executive operations overview combining daily cleaning completion rate, photo audit compliance, Wash & Solar task counts, active field crew pulse, 3 inline SVG analytics charts, and quick CSV/Print exports.
- **Data source:** Client-side aggregation of in-memory module caches (`adminCleanReportsState`, `adminSpecialJobsCache`, `state.staffList`, `state.adminRecords`, `state.leads`).
- **Read operations:** `refreshOperationsDashboard()` (`app.js:3243`) invokes `loadDailyCleanReports(true)` (`getDailyCleanReports`), `loadAdminSpecialJobs(true)` (`getSpecialJobs`), `loadStaffListForAdmin()` (`getStaffList`), and `loadAdminRecords(true)` (`getAllCustomers`).
- **Write operations:** None (read-only analytics view).
- **Actions:** `toggleCleanReportsAutoSync()` (`#reportsLiveSyncPill`), `refreshOperationsDashboard()` (`Refresh All`), `exportDailyCleanReportsCSV()` (`Export CSV`), `printDailyCleanReports()` (`Print`), clickable KPI tiles (`Daily Cleans Today` -> `switchAdminTab('cleanReports')`, `Wash & Solar Tasks` -> `switchAdminTab('specialJobs')`), `renderDashboardCharts()`, `renderCrewPulseStrip()`.
- **Filters:** None on dashboard directly (reflects today's operations & underlying module caches).
- **Forms:** None.
- **Permissions:** Admin session (`cwp_admin_token`); underlying calls enforce `adminProtectedActions`.
- **Dependencies:** `M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`, `M-STAFF`, `M-CUSTOMERS` caches, SSE events (`DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, `CUSTOMERS_CHANGED`). **Known data caveat:** Underlying endpoints cap rows (`200` for clean reports & special jobs, `500` for customers) without `totalCount`, so dashboard KPIs silently undercount if DB exceeds caps.
- **Current UI:** `#adminOpsDashboardHub` (4 `.ops-kpi-tile`s + 3 `.ops-intel-card`s with progress bars and chips), `.dashboard-charts-grid` with 3 inline SVG charts (`#dashCleanProgressSvg` donut, `#dashStaffBarSvg` bar chart, `#dashWashSolarSvg` trend bar chart), and `#dashboardCrewPulseStrip` live staff cards. Uses Material Symbols (`analytics`, `directions_car`, `solar_power`, `pie_chart`, `bar_chart`).
- **Migration complexity:** Medium (shared `#adminOpsDashboardHub` visibility across 3 tabs must be cleanly decoupled or preserved; inline SVG chart rendering must stay intact).
- **Risk:** Medium (metric drift if dashboard KPIs stop syncing with `cleanReports`/`specialJobs` caches).
- **Recommended migration phase:** Phase 2 (Operations Dashboard & Daily Clean Reports).

---

### 3.4 `M-CLEAN-REPORTS` — Daily Cleaning Status & Proof-of-Work Reports

- **Module:** `M-CLEAN-REPORTS` (Daily Cleaning Status & Audit Reports)
- **Route:** `/admin?tab=cleanReports` / `#admin/cleanReports`
- **Page files:** `Index.html:1244–1333, 1729–1760, 1784–1882`, `public/js/app.js:19511–20446`, `server.js:3062–3064, 4842–5074`, `services/adminService.js:1743–1938`, `db/repositories/serviceLogsRepo.js:173–420`
- **Navigation:** Sidebar `OPERATIONS` -> `Daily Cleaning Status` (`#tabBtnCleanReports`, `Index.html:563`); also reachable via Dashboard KPI tile (`#dashTotalDailyCleans`) and `#dashBtnSubCleanReports`.
- **Purpose:** Displays daily car cleaning execution logs (`service_logs`) with IST timestamps, photo proof thumbnails, `car_not_present` flags, compliance analytics banner, admin status overrides with mandatory audit reason, deletion for re-punching, and CSV/Print reporting.
- **Data source:** PostgreSQL `public.service_logs` joined with `customers`, `vehicles`, `staff`, `service_locations`, `routes`/`route_stops` (`queryDailyCleanReports` hardcoded `limit=200, offset=0`), plus `getAllRoutes` for route filter dropdown.
- **Read operations:** `POST /api` `action: "getDailyCleanReports"` (`{ startDate, endDate, staffId, routeId, hasPhoto, carNotPresent, status, search }`); `POST /api` `action: "getAllRoutes"` (populates `#reportRouteFilter`).
- **Write operations:** `POST /api` `action: "updateDailyCleanReportStatus"` (`{ reportId, status, reason }`); `POST /api` `action: "deleteDailyCleanReport"` (`{ reportId, reason }`); both write to `public.service_logs` + `public.audit_logs` and broadcast SSE `DAILY_CLEAN_CHANGED`.
- **Actions:** Period quick chips (`Today`, `Yesterday`, `Last 7 Days`, `This Month`, `Custom`), `populateReportRouteDropdown()`, `debounceReportSearch()` (350ms), `resetReportFilters()`, `openReportPhotoLightbox()`, `downloadCurrentReportPhoto()`, `openEditReportStatusModal()` (`completed` / `car_not_present` + 3 Hindi quick-reason chips + required reason), `confirmDeleteCleanReport()` (3 quick-reason chips + required reason), `exportDailyCleanReportsCSV()`, `printDailyCleanReports()`, `startDailyCleanReportsAutoSync()` (15s interval, pauses while typing in `#reportSearchFilter`). *(Note: `shareDailyCleanReportDirectly` is defined at `app.js:19856` but table row direct-share is disabled per `app.js:20097`, and `#btnLightboxSendWhatsApp` is hidden `is-staff-only`.)*
- **Filters:**
  - Period chips: `#chipPeriodToday`, `#chipPeriodYesterday`, `#chipPeriod7Days`, `#chipPeriodMonth`, `#chipPeriodCustom` (`#reportStartDate`, `#reportEndDate`)
  - Dropdowns: `#reportStaffFilter`, `#reportPhotoFilter` (`all`/`yes`/`no`/`not_present`), `#reportRouteFilter`
  - Search: `#reportSearchFilter`
  - Reset: `resetReportFilters()`
- **Forms:**
  - `#editCleanReportModal` (`Index.html:1784–1844`, non-`<form>` inputs: `#editReportIdInput`, `radio[name="editReportStatusRadio"]`, `#editReportReasonText` required)
  - `#deleteCleanReportModal` (`Index.html:1845–1882`, non-`<form>` inputs: `#deleteReportIdInput`, `#deleteReportReasonText` required)
- **Permissions:** `getDailyCleanReports`, `updateDailyCleanReportStatus`, `deleteDailyCleanReport`, `getAllRoutes` all require valid Admin session (`adminProtectedActions`, `server.js:3062–3064, 3089`).
- **Dependencies:** `M-DASH` (shares `#adminOpsDashboardHub` & feeds KPI totals), `M-ROUTE-PLAN` (`getAllRoutes`), `M-STAFF` (staff filter dropdown), SSE `DAILY_CLEAN_CHANGED`.
- **Current UI:** Operations Intelligence banner (`#reportsIntelligenceBanner`), hidden legacy `.reports-kpi-grid` (`Index.html:1256`, `display: none !important`), 2-tier `.reports-filter-panel`, 9-column `.records-table` (missing `id` attribute on `<table>`, targets `tbody#adminCleanReportsTableBody`), photo lightbox `#reportPhotoLightboxModal`, edit/delete `.camera-modal-overlay` modals with Hindi labels & emojis (`✏️`, `✓`, `🚫`, `⚡`, `🗑️`, `⚠️`).
- **Migration complexity:** Medium (must preserve mandatory audit reason validation, photo lightbox actions, 15s sync pause-on-type, and CSV/Print exports while upgrading table to Aura Task 07 grid and removing emojis).
- **Risk:** High (silent 200-row truncation on high-volume days; status override/delete directly affects staff re-punch eligibility and audit logs).
- **Recommended migration phase:** Phase 2 (Operations Dashboard & Daily Clean Reports).

---

### 3.5 `M-SPECIAL-JOBS` — Other Cleaning Status / Wash & Solar Hub

- **Module:** `M-SPECIAL-JOBS` (Wash, Solar & Detailing Hub)
- **Route:** `/admin?tab=specialJobs` / `#admin/specialJobs` (legacy alias `'washSolar'` redirects to `'specialJobs'` at `app.js:2945–2947`)
- **Page files:** `Index.html:1334–1432, 3517–3692`, `public/js/app.js:21235–22479`, `server.js:3065–3068, 5356–5481, 6498–6542`, `services/adminService.js:2329–2929`, `db/repositories/serviceJobsRepo.js:1–404`
- **Navigation:** Sidebar `OPERATIONS` -> `Other Cleaning Status` (`#tabBtnSpecialJobs`, `Index.html:570`); also via Dashboard KPI tile (`#dashTotalSpecialJobs`) and `#dashBtnSubSpecialJobs`.
- **Purpose:** Manages on-demand special service jobs (`solar_cleaning`, `car_washing`, `interior_detailing`, `exterior_detailing`, and `daily_car_cleaning` ad-hoc tasks): direct dispatch, staff reassignment, schedule/sequence updates, before/after photo inspection, timeline/SLA duration audit, and soft cancellation/deletion.
- **Data source:** PostgreSQL `public.service_jobs` joined with `customers`, `service_locations`, `staff`, `vehicles` (`adminService.getSpecialJobsAdmin`, hardcoded `limit=200`). **Known Bug:** `INNER JOIN public.service_locations` (`serviceJobsRepo.js:54`, `adminService.js:2847`) hides jobs where `location_id IS NULL`.
- **Read operations:** `POST /api` `action: "getSpecialJobs"` (returns `{ success: true, jobs: [...] }`; all filtering/KPI counting runs client-side).
- **Write operations:** `POST /api` `action: "assignSpecialJob"` (`{ jobData }`); `POST /api` `action: "reassignSpecialJob"` (`{ jobId, newStaffId, reason, scheduledTime, tentativeTime, sequenceOrder }`); `POST /api` `action: "deleteSpecialJob"` (`{ jobId }`). All write `audit_logs` and broadcast SSE `SPECIAL_JOB_CHANGED`.
- **Actions:** `+ Assign Wash & Solar` (`openAssignSpecialJobModal`), KPI card status filters (`filterAdminSpecialByStatus`), period chips (`setSpecialPeriodChip`), category chips (`selectAdminSpecialCategoryChip`), staff reassignment (`openReassignJobModal` -> `handleReassignJobSubmit`), before/after photo view (`openImageModal`), cancel/delete job (`deleteAdminSpecialJob` with `confirm()`), reset filters (`resetAdminSpecialFilters`).
- **Filters:**
  - 4 clickable KPI cards: Total / Assigned / In Progress / Completed
  - Period chips: `today`, `yesterday`, `7days`, `month`, `all`, `custom` (`#specialStartDate`, `#specialEndDate`)
  - 6 category chips + synced `#adminSpecialCategoryFilter` select
  - Search `#adminSpecialSearch`, Status `#adminSpecialStatusFilter`, Staff `#adminSpecialStaffFilter`, Reset button
- **Forms:**
  1. `#assignSpecialJobForm` (`Index.html:3531–3651`, inside `#assignSpecialJobModal`): mode radio (`existing` / `new`), `#specialExistingCustSelect`, `#specialCustName`, `#specialCustPhone`, `#specialCustAddress`, `#specialServiceCategory`, `#specialScheduledDate`, `#specialScheduledTime` (`datalist#tentativeTimePresets` + 4 quick slot chips), `#specialSequenceOrder`, `#specialPackageType`, solar fields (`#specialSolarPanelsCount`, `#specialSolarPanels`) or car fields (`#specialCarVehicle`, `radio[name="specialSeaterType"]`), `#specialInstructions`, `#specialStaffSelect`.
  2. `#reassignJobForm` (`Index.html:3666–3691`, inside `#reassignJobModal`): `#reassignJobTargetId`, `#reassignNewStaffSelect`, `#reassignScheduledTime`, `#reassignSequenceOrder`, `#reassignReason`.
- **Permissions:** `getSpecialJobs`, `assignSpecialJob`, `reassignSpecialJob`, `deleteSpecialJob` are in `adminProtectedActions` (`server.js:3065–3068`). Backend enforces `staffCapabilityService.hasServiceCapability` and blocks deleting `completed`/`in_progress` jobs.
- **Dependencies:** `M-CUSTOMERS` (existing customer lookup/auto-creation on new customer dispatch), `M-STAFF` (capability-filtered staff dropdowns), `M-DASH` (shares `#adminOpsDashboardHub`), shared `#imageModal`, SSE `SPECIAL_JOB_CHANGED`.
- **Current UI:** Modernized M3 hero banner, 4 KPI cards, triple-stacked filter bars (period + category chips + toolbar), 10-column `#adminSpecialJobsTable.cwp-table.special-m3-table` with HSRP badges, `tel:`/WhatsApp links, Google Maps links, timeline lag/duration metrics, and before/after photo buttons. Still has minor emojis in JS toasts/modals (`⏳`, `🚀`, `✅`, `❌`).
- **Migration complexity:** Medium (triple-stacked filter bars need consolidation into Aura Task 06 primary/collapsible filter bar; 10-col table fits Aura Task 07 grid with sticky action column).
- **Risk:** Medium (`INNER JOIN service_locations` backend bug hides `NULL`-location bookings if not fixed; 200-row cap hides older jobs).
- **Recommended migration phase:** Phase 5 (Dispatch, Job Assignment & Wash & Solar Hub).

---

### 3.6 `M-JOB-ASSIGN` — Job Assignment & Dispatch

- **Module:** `M-JOB-ASSIGN` (Job Assignment & Dispatch Console)
- **Route:** `/admin?tab=jobAssignment` / `#admin/jobAssignment`
- **Page files:** `Index.html:1433–1552`, `public/js/app.js:4165–4745`, `server.js:3066, 3069–3071, 5356–5397, 5482–5576`, `services/adminService.js:2329–2626, 3005–3235`, `db/repositories/staffAssignmentsRepo.js`
- **Navigation:** Sidebar `OPERATIONS` -> `Assign Jobs` (`#tabBtnJobAssignment`, `Index.html:577`), with 2 segmented subtabs: `Daily Clean Routes` (`#btnSubTabDailyRoutes`) and `On-Demand Jobs` (`#btnSubTabSpecialJobs`).
- **Purpose:** Operational dispatch workbench for (1) assigning/reassigning/unassigning Daily Car Cleaning (DCC) customers to morning cleaners with stop order and route notes, and (2) quickly dispatching on-demand Wash/Solar/Detailing jobs and viewing the active crew queue ledger.
- **Data source:** PostgreSQL `public.staff_assignments`, `public.subscriptions`, `public.customers`, `public.staff`, `public.staff_route_sequences`, and `public.service_jobs`.
- **Read operations:** `POST /api` `action: "getDailyCleanAssignments"` (populates `#dccRouteRosterTable` and `#dccAssignCustomerSelect`); `getSpecialJobs` + `getAllCustomers` + `getStaffList` (populates `#jobAssignmentsLedgerTable` and `#jobAssignCustomerSelect` / `#jobAssignStaff`).
- **Write operations:** `POST /api` `action: "assignDailyCleanCustomer"` (`{ customerId, staffId, sequenceOrder, notes }`); `POST /api` `action: "unassignDailyCleanCustomer"` (`{ customerId }`); `POST /api` `action: "assignSpecialJob"` (`{ jobData }`); `reassignSpecialJob` / `deleteSpecialJob` via shared modal/row actions. Broadcasts `CUSTOMER_ASSIGNMENT_CHANGED` or `SPECIAL_JOB_CHANGED`.
- **Actions:** `switchJobAssignSubTab('daily'|'special')`, `handleDccAssignmentSubmit`, `handleDccCustomerSelectChange` (renders `#dccCustomerContextCard`), `handleDccInlineReassign` (inline table `<select>`), `handleDccUnassign` (`✕ Unassign`), `filterDccRosterByStaff`, `handleJobAssignmentSubmit`, inline reassign/delete on Active Assignments Ledger.
- **Filters:** Daily Clean Roster: `#dccRosterStaffFilter` (All Cleaners / Unassigned Only / per-staff) + `#dccRosterSearch`. On-Demand subtab: none beyond active/non-completed filter.
- **Forms:**
  1. `#dccAssignForm` (`Index.html:1467–1495`): `#dccAssignCustomerSelect` (`required`), `#dccAssignStaffSelect` (`required`), `#dccAssignSequenceOrder`, `#dccAssignNotes`.
  2. `#jobAssignForm` (`Index.html:1532–1544`): `#jobAssignCustomerSelect` (`required`), `#jobAssignWorkType` (`required`), `#jobAssignDate` (`required`), `#jobAssignStaff` (`required`), `#jobAssignTime` (`datalist#tentativeTimePresets`), `#jobAssignSequenceOrder`, `#jobAssignNotes`.
- **Permissions:** All 4 RPC actions are in `adminProtectedActions` (`server.js:3066, 3069–3071`).
- **Dependencies:** `M-CUSTOMERS`, `M-STAFF`, `M-ROUTE-PLAN` (writes also mirror `staff_route_sequences`), `M-SPECIAL-JOBS` (shares `#reassignJobModal`), SSE `CUSTOMER_ASSIGNMENT_CHANGED` & `SPECIAL_JOB_CHANGED`.
- **Current UI:** Segmented 2-tab hero card, inline multi-column dispatch cards, 7-column `#dccRouteRosterTable` with inline `<select>` cleaner reassigner, 7-column `#jobAssignmentsLedgerTable`, and suppressed `#dccUnassignedBanner` (`app.js:4246–4249`).
- **Migration complexity:** Medium (must preserve dual-mode Daily vs On-Demand dispatch flows and inline roster reassignment without porting orphaned functions at `app.js:4746–5606`).
- **Risk:** High (DCC assignments directly populate `staff_assignments` and `staff_route_sequences` consumed by the Staff PWA `/staff` morning route).
- **Recommended migration phase:** Phase 5 (Dispatch, Job Assignment & Wash & Solar Hub).

---

### 3.7 `M-STAFF-TRACKING` — Live Staff GPS Telemetry & Stoppages

- **Module:** `M-STAFF-TRACKING` (Live Staff GPS Telemetry, Breadcrumbs & Dwell Stoppages)
- **Route:** `/admin?tab=staffTracking` / `#admin/staffTracking`
- **Page files:** `Index.html:1553–1635`, `public/js/app.js:22906–23673`, `server.js:5156–5349`, `db/repositories/staffTrackingRepo.js:1–752`
- **Navigation:** Sidebar `OPERATIONS` -> `Track Staff` (`#tabBtnStaffTracking`, `Index.html:584`); sidebar `.hub-live-badge` is CSS-suppressed.
- **Purpose:** Tracks real-time field staff coordinates, fleet distance, movement state (`Moving`, `Stopped`, `Idle`), on-demand GPS ping requests, historical breadcrumb paths, and detected dwell stoppages (`>=5 min` dwell, `<=120m` customer geofence match).
- **Data source:** PostgreSQL `public.staff_tracking_current`, `public.staff_locations`, `public.staff_stoppages`, `public.staff_location_pings`, joined with `public.staff` and `public.customers`; map provider config via `getMapsConfig` (Google Maps key or Leaflet/OpenStreetMap `unpkg.com/leaflet@1.9.4` or built-in SVG radar fallback).
- **Read operations:** `POST /api` `action: "getStaffTrackingSummary"` (returns 4 KPIs + staff telemetry list + stoppages); `POST /api` `action: "getMapsConfig"` (public); `POST /api` `action: "getStaffMovementHistory"` (`{ staffId }` -> breadcrumbs + stoppages).
- **Write operations:** `POST /api` `action: "pingStaffLocation"` (`{ staffId }` -> inserts `staff_location_pings` with 5-min expiry and triggers 2.5s accelerated polling for 8 cycles / 20s).
- **Actions:** `refreshStaffTracking(force)`, `startStaffTrackingAutoSync()` (15s interval), `filterTrackingStaffList()`, `setTrackingStatusFilter('all'|'moving'|'stopped'|'idle')`, `centerStaffOnMap(staffId)`, `pingStaffFromAdmin(staffId, staffName, btnEl)`, `viewStaffStoppages(staffId, staffName)`, `closeTrackingStoppagesDrawer()`, `recenterAllStaffMarkers()`, `toggleBreadcrumbsDisplay()`, `toggleMapProviderEngine()` (Google Maps / OSM / SVG).
- **Filters:** `#trackingStaffSearch` (name/phone) + 4 status pills (`#pillTrackingFilterAll`, `#pillTrackingFilterMoving`, `#pillTrackingFilterStopped`, `#pillTrackingFilterIdle`).
- **Forms:** None.
- **Permissions:** `getStaffTrackingSummary` & `pingStaffLocation` enforce inline `resolveAdminSession` (`server.js:5156–5161, 5226–5231`); `getStaffMovementHistory` allows Admin or matching Staff (`403` otherwise); `getMapsConfig` is **public/unauthenticated** (`server.js:5343`).
- **Dependencies:** `TrackingMapAdapter` singleton (`app.js:22907+`), external Google Maps JS / Leaflet CDN (with offline SVG radar fallback), Staff PWA GPS heartbeat/ping responses.
- **Current UI:** 4 KPI cards (`Active Field Staff`, `Fleet Distance Today`, `Total Stoppages`, `Avg Dwell Time`), split workspace (left staff search + emoji pills `🟢`/`🛑`/`⏳` + cards; right `#staffTrackingMapCanvas` with floating controls + `#trackingStoppagesDrawer` missing `role="dialog"` / `aria-modal="true"`).
- **Migration complexity:** Medium (keep `TrackingMapAdapter` singleton untouched; wrap container, pills, KPIs, and `#trackingStoppagesDrawer` in Aura V2 drawer + WCAG dialog semantics + Material Symbols).
- **Risk:** Medium (breaking `TrackingMapAdapter` map resize/provider fallback or 15s/2.5s polling timers degrades live field visibility).
- **Recommended migration phase:** Phase 6 (Leads Pipeline & Staff Live Tracking).

---

### 3.8 `M-ROUTE-PLAN` — DCC Route Plan, Operational Sequence & Unassigned Workbench

- **Module:** `M-ROUTE-PLAN` (DCC Route Management, Stop Sequence & Legacy Staff Sequence)
- **Route:** `/admin?tab=sequence` / `#admin/sequence`
- **Page files:** `Index.html:685–884, 4222–4462`, `public/js/app.js:15818–18398`, `server.js:3058–3060, 3089–3104, 3124–3221, 5930–6252`, `services/routeService.js:37–1114`, `services/adminService.js:1612–1711`, `db/repositories/routesRepo.js`, `db/repositories/staffRouteSequencesRepo.js`
- **Navigation:** Sidebar `OPERATIONS` -> `DCC Route Plan` (`#tabBtnSequence`, `Index.html:591`), with 3 top-level subtabs (`#rmSubtabRoutesBtn` Routes Hub, `#rmSubtabUnassignedBtn` Unassigned Workbench, `#rmSubtabLegacyBtn` Staff Sequence View) plus drilled-in `#rmRouteDetailView` (breadcrumb `Routes Hub / <CODE>`).
- **Purpose:** Full cluster-based DCC route planning: create/edit/pause/archive/delete operational routes, assign/unassign DCC-eligible cleaners (with active-route transfer warnings), manage doorstep vehicle stops (`1..N` contiguous stop ordering, add/remove/transfer stops), batch-assign unassigned DCC vehicles from the workbench, and maintain backward-compatible per-staff sequence (`#rmLegacySeqView`).
- **Data source:** PostgreSQL `public.routes`, `public.route_stops`, `public.staff_assignments`, `public.staff_route_sequences`, `public.subscriptions`, `public.subscription_vehicles`, `public.vehicles`, `public.customers`, `public.service_locations`, `public.staff`, `public.audit_logs`.
- **Read operations:** `getAllRoutes`, `getRouteDetails` (`{ routeId }`), `getUnassignedDccVehicles`, `getStaffSequence` (`{ staffId }` for legacy view). *(Backend `getDailyRouteReconciliation` exists at `server.js:6243` but is unwired in UI.)*
- **Write operations:** `createRoute`, `updateRoute`, `setRouteStatus`, `deleteRoute`, `assignStaffToRoute`, `unassignStaffFromRoute`, `addStopToRoute`, `removeStopFromRoute`, `moveStopBetweenRoutes`, `reorderRouteStops` (`orderedStopIds` atomic negative-offset tx swap + mirrors `staff_route_sequences`), `saveStaffSequence`, `resetStaffSequence`.
- **Actions:** `switchRouteSubtab('routes'|'unassigned'|'legacy')`, `refreshRouteManagementData(true)`, `openCreateRouteModal()`, `openRouteDetailView(routeId)`, `closeRouteDetailView()` (guards unsaved sequence changes), `openEditRouteModal()` / `toggleRouteStatus()` / `confirmDeleteRoute()`, `openAssignStaffModal()` / `confirmUnassignStaff()`, `openAddStopModal()`, `moveStopPosition()` (`Up`/`Down`/`Top`/`Bottom`) + `saveRouteSequenceChanges()`, `openTransferStopModal()`, `confirmRemoveStop()`, `toggleSelectAllUnassigned()` + `executeBatchAssignToRoute()` (sequential loop of `addStopToRoute`), `quickAssignUnassigned()`, plus legacy `#rmLegacySeqView` drag-drop/position input/`saveCurrentStaffSequence()`/`confirmResetSequence()`.
- **Filters:**
  - Routes Hub: `#rmRouteSearchInput`, `#rmStatusFilter` (`all`/`active`/`inactive`/`archived`), `#rmStaffFilter` (`all`/`assigned`/`unassigned`), `#rmAreaFilter`, `#rmSortSelect` (`code_asc`, `name_asc`, `stops_desc`, `stops_asc`, `created_desc`), `#rmClearFiltersBtn`.
  - Unassigned Workbench: `#rmUnassignedSearchInput`, `#rmUnassignedAreaFilter`.
  - Add Stop Modal: `#rmAddStopSearch`.
  - Legacy Sequence: `#seqStaffSelect`, `#seqSearchInput`, `Cards`/`Compact List` toggle (`#btnSeqViewCard`, `#btnSeqViewCompact`).
- **Forms:** `#rmCreateRouteForm`, `#rmEditRouteForm`, plus modal action controls inside `#rmAssignStaffModal`, `#rmAddStopModal`, `#rmTransferStopModal`, `#rmDeleteRouteModal`, `#rmRemoveStopModal`, `#seqResetModal`.
- **Permissions:** All 19 route and sequence RPC actions are in `adminProtectedActions` (`server.js:3058–3060, 3089–3104`). Backend enforces `isDccEligible` on staff assignment and `validateDccEligibility` on stop addition.
- **Dependencies:** `M-STAFF` (DCC-eligible cleaners), `M-CUSTOMERS` (active DCC subscriptions & vehicles), Staff PWA (`getStaffData` / `getStaffRouteView` reads mirrored `staff_route_sequences` and `route_stops`).
- **Current UI:** Modernized `rm-*` UI (`Index.html:685–809`) with 6 KPI cards, Material Symbols, HSRP plate badges, bulk selection bar `#rmBatchBar`, 7 `rm-modal-overlay` dialogs; contrasted with legacy `#rmLegacySeqView` (`L810–884`) containing emojis (`⚠️`, `🔄`, `✓`, `📋`, `⚡`, `👤`, `🚗`, `🔍`).
- **Migration complexity:** High (deep multi-view state: Hub -> Detail -> Unassigned Batch -> Legacy View, unsaved sequence dirty-state guards, negative-offset DB swap + `staff_route_sequences` mirroring).
- **Risk:** High (stop reordering or staff transfer errors immediately scramble a cleaner's live daily route order).
- **Recommended migration phase:** Phase 7 (DCC Route Management & Sequence).

---

### 3.9 `M-CUSTOMERS` — Customer Directory, Onboarding, Packages & Bookings

- **Module:** `M-CUSTOMERS` (Customer Directory, 4-Step Onboarding Wizard, Multi-Location/Multi-Vehicle Edit, Prepaid Packages & Service Bookings)
- **Route:** `/admin?tab=records` / `#admin/records` (default landing tab after Admin login via `getSavedAdminTab()`)
- **Page files:** `Index.html:927–1045, 2038–2577, 3114–3190, 3924–4189`, `public/js/app.js:275–397, 1539–1753, 9117–10704, 11978–15674`, `public/js/cropper.min.js`, `server.js:2195–2217, 2394–2464, 3039, 3047–3050, 3075–3083, 3222–3229, 4185–4552, 5648–5838, 6305–6638`, `services/adminService.js:98–1190, 1940–2008`, `services/packageService.js`, `services/bookingService.js`, `services/indicTransliterateService.js`, `services/bilingualSearchService.js`
- **Navigation:** Sidebar `MANAGEMENT` -> `Customers` (`#tabBtnRecords`, `Index.html:600`), brand logo click (`handleBrandLogoClick`), and `addCust` redirect.
- **Purpose:** Core customer master directory with bilingual English/Devanagari phonetic search, multi-location/GPS management, multi-vehicle (`Aaj`/`Kal` rotation + HSRP plates + Car Make/Color + 5/5+ Seater) & rooftop solar configuration, Cropper.js photo editing, `localStorage` draft auto-save, prepaid package sales/redemption/history, and service booking lifecycle management.
- **Data source:** PostgreSQL `public.customers` (`tag='customer'`), `public.service_locations`, `public.vehicles`, `public.subscriptions`, `public.subscription_vehicles`, `public.customer_packages`, `public.package_redemption_logs`, `public.service_jobs`, `public.staff_assignments`, `public.audit_logs`. (`adminService.getAllCustomers` hardcodes `limit=500, offset=0`.)
- **Read operations:** `getAllCustomers` (`{ forceRefresh }`), `getCustomerPackages`, `getPackageCatalog` (public), `getPackageRedemptionHistory`, `getCustomerServiceJobs`, `getEligiblePackagesForBooking`, `POST /api/indic/transliterate` & `/api/indic/transliterate-customer` (public). *(REST `GET /api/customers` exists at `server.js:2195` but is unused by `app.js`.)*
- **Write operations:** `saveCustomer`, `updateCustomer`, `deleteCustomer` (soft-delete + stops active subs + cancels route stops/assignments), `backfillHindi` (**SECURITY GAP: unauthenticated**), `sellCustomerPackage`, `redeemPackageEntitlement`, `cancelCustomerPackage`, `createServiceBooking`, `startSpecialJob`, `completeSpecialJob`, `cancelSpecialJob`, `failServiceJob`. Broadcasts `CUSTOMERS_CHANGED` or `SPECIAL_JOB_CHANGED`.
- **Actions:** `loadAdminRecords(true)`, `exportAdminRecordsCSV()`, `openAddCustomerModal()` (4-step wizard + `cwp_add_customer_draft_v1` + `Save as Lead` toggle), `openEditCustomerModal()` (6 tabs: Profile, Locations, Service & Vehicles, Cleaner & Route, Packages, Bookings + auto-draft), `handleDeleteCustomerFromModal()`, `openCropperModal()` (angle slider, 90°/180° rotate, flip H/V, aspect chips, zoom), `openAddressModal()`, `openAdminPhotoModal()` (`#imageModal`), `openAssignServiceFromEditModal()`, `openSellPackageModalFromEditCustomer()`, `openRedeemPackageModal()`, `openPackageHistoryModal()`, `cancelCustomerPackageUI()`, `openCreateBookingModalFromCustomer()`, booking lifecycle buttons (`start`/`complete`/`cancel`/`fail`), and hidden `handleBackfillHindi()`.
- **Filters:** `#adminRecordSearch` (bilingual phonetic search, shortcut `/`), `#filterAdminStatus` (`all`/`yes`/`no`), `#toggleFilterPhoto`, `#toggleFilterMap`, Reset `#filterActiveNotice`. (Hidden legacy controls: `.cwp-seg-nav`, `#filterAdminCategory`, `#filterAdminStaff`.) Client-side pagination `#adminTablePagination` (`25`/`50`/`100`/`All`). Inside Edit modal: `#pkgFilterAll`/`Active`/`Exhausted`/`Cancelled` and `#bookingFilterAll`/`Upcoming`/`Completed`/`Cancelled`.
- **Forms:** `#addCustomerForm` (`L2075`), `#editCustomerForm` (`L2320`), `#sellPackageForm` (`L3937`), `#redeemPackageForm` (`L4028`), `#createBookingForm` (`L4106`).
- **Permissions:** Customer/Package/Booking actions in `adminProtectedActions` (`server.js:3039, 3047–3050, 3075–3083`). **Gaps:** `backfillHindi`, `getPackageCatalog`, and `/api/indic/*` lack Admin session checks; `toggleCustomerActive` (`server.js:3050`) is unimplemented (`400`).
- **Dependencies:** `cropper.min.js`, `M-SERVICE-ASSIGN` (`#assignServiceModal`), `M-STAFF` (cleaner select), `M-ROUTE-PLAN` (delete cascades route stops), SSE `CUSTOMERS_CHANGED` & `SPECIAL_JOB_CHANGED`.
- **Current UI:** 10-column `#adminRecordsTable` with `Edit` + `⋮` contextual action menu (`Edit Customer`, `Manage Service`, `View Location`, `Delete Customer`), large multi-step/6-tab modals (`#editCustomerModal` has horizontal tab scroll `FRM-01` and `Delete Customer` next to `Save Changes` `FRM-03`), extensive emojis in modal headers/labels/buttons.
- **Migration complexity:** High (richest domain model: multi-location, multi-vehicle rotation, Cropper.js, Indic transliteration, auto-draft recovery, prepaid packages with `FOR UPDATE` row locks, and booking lifecycle).
- **Risk:** High (silent 500-customer backend truncation; Edit Customer payload overwrites child locations/vehicles/subscriptions if state sync breaks).
- **Recommended migration phase:** Phase 3 (Customer Directory, Onboarding & Edit Modals) & Phase 4 (Service Assignment, Packages & Bookings).

---

### 3.10 `M-SERVICE-ASSIGN` — Assign Booking / Service & Asset Assignment Console

- **Module:** `M-SERVICE-ASSIGN` (Service & Asset Assignment Console)
- **Route:** `/admin?tab=serviceAssign` / `#admin/serviceAssign`
- **Page files:** `Index.html:1046–1112, 2578–2718`, `public/js/app.js:13484–13897, 23694–23813`, `server.js:3072–3073, 5577–5636`, `services/adminService.js:3240–3517`
- **Navigation:** Sidebar `MANAGEMENT` -> `Assign Booking` (`#tabBtnServiceAssign`, `Index.html:607`); also via `#editCustomerModal` (`openAssignServiceFromEditModal`) and `#adminRecordsTable` (`Manage Service` / `+ Assign Service`).
- **Purpose:** Provides a service-centric view across all customers showing active/inactive plans (Daily Recurring vs One-Time Job), registered vehicles or solar panel counts, assigned staff, and opens `#assignServiceModal` to configure/activate or stop a customer's service.
- **Data source:** Derived purely in-memory from `state.adminRecords` and `state.staffList`; mutations write to PostgreSQL `public.customers`, `public.subscriptions`, `public.vehicles`, `public.staff_assignments`, and `public.audit_logs`.
- **Read operations:** Relies on `M-CUSTOMERS` (`getAllCustomers`) and `M-STAFF` (`getStaffList`).
- **Write operations:** `POST /api` `action: "assignCustomerService"` (`{ serviceData }`); `POST /api` `action: "stopCustomerService"` (`{ customerId, reason }`). Both broadcast SSE `CUSTOMERS_CHANGED`.
- **Actions:** `exportAdminRecordsCSV()`, `+ Assign Service` header button (**Bug:** `Index.html:1060` passes hardcoded index `0` -> `openAssignServiceModal(0)`), segmented category filter tabs (`filterServiceAssign`), row `Manage` (`openAssignServiceModal(origIndex)`), `#assignServiceForm` submit (`handleAssignServiceSubmit`), `Stop Service` (`handleStopServiceClickFromModal()` using browser `prompt()` for reason).
- **Filters:** 5 segmented category tabs (`#assignTabAll`, `#assignTabDaily`, `#assignTabWash`, `#assignTabSolar`, `#assignTabNoPlan`) + `#serviceAssignSearch` text filter.
- **Forms:** `#assignServiceForm` (`Index.html:2596–2717` inside `#assignServiceModal`): `#assignServiceCustomerId`, `#assignServiceCategory`, `#assignServicePkgType`, `#assignServicePkgTypeCustom`, `#assignServiceLocationSelect`, car inputs (`#assignVehicleNumbers`, `radio[name="assignSeaterType"]`, `#assignCarMake`, `#assignCarColor`) or solar input (`#assignSolarPanelsCount`), `#assignStaffSelect`, `#assignStaffNotes`.
- **Permissions:** `assignCustomerService` and `stopCustomerService` in `adminProtectedActions` (`server.js:3072–3073`).
- **Dependencies:** `M-CUSTOMERS` (`state.adminRecords` + `#editCustomerModal`), `M-STAFF` (`state.staffList`), SSE `CUSTOMERS_CHANGED`.
- **Current UI:** 5-tab `.cwp-seg-nav` (with emojis `🚗`, `🧼`, `☀️`, `⚠️`), search bar, 7-column `#serviceAssignTable`, and `#assignServiceModal` (with emoji section headers and browser `prompt()` on Stop Service).
- **Migration complexity:** Medium (must fix `openAssignServiceModal(0)` bug by adding an Aura searchable customer selector when launched from header CTA, and replace `prompt()` with an Aura confirmation dialog).
- **Risk:** Medium (`assignCustomerService` updates subscriptions, vehicles, and `staff_assignments` simultaneously).
- **Recommended migration phase:** Phase 4 (Service Assignment, Packages & Bookings).

---

### 3.11 `M-LEADS` — Leads & Inquiries Pipeline

- **Module:** `M-LEADS` (Leads & Inquiries Directory — Table & Kanban Views)
- **Route:** `/admin?tab=leads` / `#admin/leads`
- **Page files:** `Index.html:645–684, 3222–3516`, `public/js/app.js:10706–11977`, `server.js:2220–2241, 3040–3046, 3230–3474, 4185–4335, 4516–4552`, `services/adminService.js:371–714, 2013–2323`, `db/repositories/customersRepo.js`
- **Navigation:** Sidebar `MANAGEMENT` -> `Leads` (`#tabBtnLeads`, `Index.html:614`); `+ Lead` shortcut button in Customer Directory (`Index.html:947`).
- **Purpose:** Captures prospective inquiries (from Admin entry, `Save as Lead` in Add Customer, or Public Website `POST /api/leads`), tracks follow-up call notes, progresses prospects across 4 pipeline stages (`open`, `follow_up`, `quoted`, `ready`) via Table or Kanban Drag-and-Drop, and converts ready leads into active customers.
- **Data source:** PostgreSQL `public.customers` (`tag = 'lead'`, `lead_status`, `lead_notes`, capped at `limit=500` in `adminService.getLeads`), `public.service_locations`, `public.vehicles`, `public.subscriptions`, `public.staff_assignments`, `public.audit_logs`.
- **Read operations:** `POST /api` `action: "getLeads"` (`{ forceRefresh }`). *(REST `GET /api/leads` exists at `server.js:2220` with `NODE_ENV==='test'` bypass, unused by `app.js`.)*
- **Write operations:** `saveLead` (creates lead via `saveCustomer`), `updateLead`, `updateLeadStage` (updates `lead_status`), `addLeadNote` (appends timestamped note), `convertLead` (promotes `tag='customer'`, creates subscription/vehicle/staff assignment + `audit_logs`, broadcasts `CUSTOMERS_CHANGED`), `deleteLead` (soft-delete). **SSE Bug:** `app.js:3347` listens for `LEAD_CHANGED`, which `server.js` never emits (`updateLeadStage` and `addLeadNote` emit no SSE event at all).
- **Actions:** `openAddLeadModal()`, `openEditLeadModal()`, `loadAdminLeads(true)`, `setLeadStageFilter`, `setLeadCategoryFilter`, `switchLeadsViewMode('table'|'kanban')`, inline stage `<select>` / Kanban HTML5 drag-and-drop / `←`/`Next →` arrows (`updateLeadStage` with optimistic UI + rollback on error), `openLeadNoteModal()` -> `handleSaveLeadNoteSubmit()`, `openConvertLeadModal()` -> `handleConvertLeadSubmit()` (auto-switches to `'records'` tab after 600ms), `deleteLead()` (`confirm()`), `openCropperModal()` for lead vehicle photo, `detectLeadGpsLocation()`.
- **Filters:** 4 Funnel KPI cards (`All`, `open`, `follow_up`, `ready`), `#leadsSearchInput` (bilingual search), 4 category quick chips (`All Services`, `Daily Car Cleaning`, `Solar Panel Cleaning`, `Car Washing`), View Switcher (`Table` vs `Pipeline`).
- **Forms:**
  1. `#addLeadForm` (`Index.html:3234–3396`): `#leadEditId`, `#leadName` (`required`), `#leadNameHi`, `#leadPhone`, `#leadAddress`, `#leadAddressHi`, `#leadMapsUrl` (+ GPS button), `#leadCategory`, `#leadVehicle`, `#leadCarMake`, `#leadCarColor`, `#leadPhotoFile`, `#leadStage`, `#leadNotes` (+ 3 quick-tag chips).
  2. `#convertLeadForm` (`Index.html:3409–3480`): `#convertLeadId`, `#convertServiceCategory`, `#convertPackageType`, `#convertSolarPanelsCount`, `radio[name="convertSeaterType"]`, `#convertStaffSelect`, `#convertNotes`.
  3. `#leadNoteForm` (`Index.html:3493–3515`): `#leadNoteTargetId`, `#newLeadNoteText` (`required`, + 3 quick-tag chips).
- **Permissions:** All 7 Lead RPC actions are in `adminProtectedActions` (`server.js:3040–3046`).
- **Dependencies:** `M-CUSTOMERS` (`convertLead` creates live customer & switches to `records`, shares Cropper.js & Hindi transliteration), `M-STAFF` (`convertStaffSelect`), Public Website `POST /api/leads` (`public/js/home.js`).
- **Current UI:** Heavy emoji usage (`🎯`, `✨`, `📥`, `📞`, `🌟`, `🚗`, `☀️`, `🧼`, `💬`, `📝`, `🚀`, `🏷️`), inline SVG refresh icon, dynamically generated 8-col Table or 4-col HTML5 Drag-and-Drop Kanban board.
- **Migration complexity:** Medium (preserve Kanban drag-and-drop, optimistic stage revert, lead note history, and lead-to-customer conversion while replacing emojis with Material Symbols and upgrading Table view to Aura Task 07).
- **Risk:** Medium (`LEAD_CHANGED` dead SSE listener causes cross-tab stale state on stage/note updates; 500-row cap silently truncates older leads).
- **Recommended migration phase:** Phase 6 (Leads Pipeline & Staff Live Tracking).

---

### 3.12 `M-STAFF` — Staff Management, Capabilities, Designations & Org Hierarchy

- **Module:** `M-STAFF` (Staff Roster, KYC, Capabilities, Designations & Organizational Hierarchy)
- **Route:** `/admin?tab=staff` / `#admin/staff`
- **Page files:** `Index.html:885–926, 2719–3113, 3808–3923, 4190–4221`, `public/js/app.js:7353–9115`, `server.js:2171–2192, 3013–3036, 3051–3056, 3061, 3105–3108, 3531–4142, 6255–6304`, `services/adminService.js:1195–1607, 3522–3602`, `services/staffCapabilityService.js`, `services/staffDesignationService.js`, `services/authService.js:434–504`, `db/repositories/staffRepo.js`, `db/repositories/staffAuthRepo.js`, `db/repositories/designationsRepo.js`
- **Navigation:** Sidebar `MANAGEMENT` -> `Staff` (`#tabBtnStaff`, `Index.html:621`), plus hero buttons for `Designations` (`#designationManagementModal`) and `Hierarchy` (`#staffHierarchyModal`).
- **Purpose:** Manages field staff accounts, 6-digit login PINs (creation, masked display & audited Admin reveal), active/inactive status, 5-failure lockout recovery (`unlockStaff` clearing DB lock + all IP rate limits), active mobile device session reset, employment/salary/weekly-off metadata, 5 KYC document photo uploads (Aadhar Front/Back, PAN, DL, Bank Passbook), service capabilities (`dcc_only` / `dcc_and_services` / `services_only` + conflict checks), custom designations (6 authority flags, hierarchy levels 1–6), and reporting-line org chart (with BFS cycle prevention).
- **Data source:** PostgreSQL `public.staff`, `public.staff_auth`, `public.staff_designations`, `public.auth_sessions`, `public.routes`, `public.service_jobs`, `public.audit_logs`.
- **Read operations:** `getStaffList` (`sanitizeStaffForAdmin` when Admin token valid), `revealStaffPin` (`{ staffId }` -> decrypts/returns `display_pin` + logs `audit_logs`), `getDesignationsList`, `getStaffHierarchy`.
- **Write operations:** `saveStaffMember` (create/update + `resetDeviceSession`), `toggleStaffActive`, `unlockStaff` (clears DB `locked_until` + `clearAllRateLimitsForIdentifier`), `deleteStaffMember`, `saveDesignation`, `deleteDesignation` (blocks `is_system_protected`). *(Backend `resetStaffPin` at `server.js:3475` and `cleanAndSyncStaff` at `server.js:5075` are unwired in UI.)*
- **Actions:** `openAddStaffModal()`, `openEditStaffModal()`, `handleStaffPhotoSelect()` / `handleStaffDocSelect()` / `viewStaffDoc()` (`#imageModal`), `toggleStaffPinReveal()` / `toggleModalCurrentPin()` (`revealStaffPin`), `toggleStaffActiveStatus()`, `handleUnlockStaff()` / `handleUnlockStaffFromModal()`, `handleResetStaffDeviceSession()` / `handleResetStaffDeviceSessionFromModal()`, `openStaffPortalForId()` (opens `/staff?id=...`), `deleteStaffMemberFromCard()` / `handleDeleteStaffFromModal()`, `openDesignationManagementModal()` -> `handleSaveCustomDesignation()` / `deleteCustomDesignation()`, `openStaffHierarchyView()` -> `refreshStaffHierarchy()`.
- **Filters:** None in `#adminTabStaff` (renders all staff cards in `#adminStaffList`).
- **Forms:**
  1. `#addStaffModalForm` (`Index.html:3076–3112`): `#newStaffPhotoFile`, `#newStaffName` (`required`), `#newStaffPhone` (`required`), `#newStaffPin` (`pattern="[0-9]{6}" required`), `#newStaffWorkType`, `#newStaffDesignation`, `#newStaffId`.
  2. `#editStaffForm` (`Index.html:2728–3065`): `#editStaffId`, `#editStaffPhotoFile`, `#editStaffName` (`required`), `#editStaffPhone` (`required`, unique identity check), `#editStaffPin` (optional 6-digit reset), `#editStaffActive`, `#editStaffDesignation`, `#editStaffReportsTo`, `#editStaffTeamName`, `#editStaffOperationalScope`, `#editStaffWorkType` + 5 capability checkboxes (`capCheck_edit_*`), `#editStaffJoiningDate`, `#editStaffSalary`, `#editStaffWeeklyOff`, `#editStaffEmail`, `#editStaffAadharNumber` + Front/Back files, `#editStaffPanNumber` + file, `#editStaffDlNumber` + file, `#fileBankPassbook`.
  3. `#addDesignationForm` (`Index.html:3834–3910`): `#newDesigId` (`pattern="[a-z0-9_]{3,32}" required`), `#newDesigName` (`required`), `#newDesigNameHi`, `#newDesigLevel`, `#newDesigDesc`, 6 authority checkboxes (`auth_canViewTeam`, `auth_canAssignRoutes`, `auth_canReorderSequences`, `auth_canSuperviseJobs`, `auth_canApproveExceptions`, `auth_canManageStaff`).
- **Permissions:** All staff, designation, and hierarchy actions are in `adminProtectedActions` (`server.js:3051–3056, 3061, 3105–3108`).
- **Dependencies:** `M-ROUTE-PLAN` & `M-SPECIAL-JOBS` (capability conflict check blocks removing DCC/category if staff has active route or `assigned`/`in_progress` job), `M-AUTH` (inline `#newAdminPasswordInput` currently lives in `#adminTabStaff` L920–925), Staff PWA (`/staff` login & session validity).
- **Current UI:** Staff cards list (`#adminStaffList`) with status/lockout pills, inline PIN reveal, and `⋮` overflow menu (`Open Portal`, `Reset Device Session`, `Unlock Account`, `Delete`); `#staffEditModal` & `#addStaffModal` use legacy emojis (`✏️`, `📷`, `🗑️`, `👁️`, `✅`, `🚫`, `🪪`, `💳`, `🚗`, `🏦`, `💾`). **Known Client Bug (`app.js:8733–8749`):** `handleEditStaffSubmit` disables `#btnSaveEditStaff` *before* validating `editCaps.length === 0`, leaving the button permanently disabled on alert failure.
- **Migration complexity:** High (KYC upload previews, capability conflict checks, designation authority matrix, hierarchy tree + BFS cycle check, PIN reveal, lockout & device session reset, and relocating Change Admin Password).
- **Risk:** High (editing staff phone/PIN/active/capabilities affects live field authentication and active routes/jobs).
- **Recommended migration phase:** Phase 8 (Staff Roster, Capabilities, Designations & Hierarchy).

---

### 3.13 `M-HIDDEN-SUPPRESSED` — Hidden, Suppressed & Alias UI Elements

- **Module:** `M-HIDDEN-SUPPRESSED` (Hidden Controls, CSS-Suppressed Badges & Tab Aliases)
- **Route:** Multiple tabs inside `/admin` (`#adminTabAddCust`, `#adminTabRecords`, `#adminTabCleanReports`, `#adminTabJobAssignment`, `#adminSidebar`, `#adminHeader`, `#reportPhotoLightboxModal`)
- **Page files:** `Index.html:126–148, 568–626, 598, 644, 943–946, 958–974, 981–995, 1256–1264, 1456–1464, 1757–1759`, `public/js/app.js:1728–1753, 2945–2956, 4246–4249, 20097`, `public/css/style.css:15774–15778`
- **Navigation:** Not directly reachable by user clicks (hidden via inline `style="display: none;"`, `hidden`, CSS `!important`, or JS force-hide), except `washSolar` / `addCust` aliases handled in `switchAdminTab()`.
- **Purpose:** Retains legacy/experimental DOM contracts and JS data bindings that were visually suppressed in prior redesigns without removing underlying DOM IDs or JS updates:
  1. `#sideNavDashboard` (`Index.html:598`, `display: none !important; hidden`) — legacy hidden dashboard button toggled by `switchAdminTab`.
  2. `#adminTabAddCust` (`Index.html:644`, empty `<div style="display: none;">`) & `addCust` in `ADMIN_VALID_TABS` (`app.js:2645, 2953–2956`) — redirects to `openAddCustomerModal()` and `'records'`.
  3. `washSolar` alias (`app.js:2645, 2945–2947`) — redirects to `'specialJobs'`.
  4. `#btnAdminBackfillHindi` (`Index.html:943`, `style="display: none;"`) — triggers `handleBackfillHindi()` (`app.js:1728–1753`).
  5. `#adminTabRecords .cwp-seg-nav` (`Index.html:958–974`, `style="display: none !important;"`), `#filterAdminCategory` (`L981`, `display: none`), `#filterAdminStaff` wrapper (`L990`, `display: none`) — legacy Customer Directory filters still referenced by JS (`setKpiCategoryFilter`, `filterAdminRecords`).
  6. `.reports-kpi-grid` (`Index.html:1256–1264`, `style="display: none !important;"`) — hidden KPI nodes still populated by `renderDailyCleanReports()` so `M-DASH` can aggregate counts.
  7. `#dccUnassignedBanner` (`Index.html:1456–1464`) — explicitly force-hidden in JS (`app.js:4246–4249`).
  8. `.sidebar-nav-list .admin-tab-badge, .sidebar-nav-list .hub-live-badge` (`style.css:15774–15778`) — JS updates badge counts (`tabRecordsCount`, `tabLeadsCount`, `tabStaffCount`, `tabCleanReportsCount`, `tabSpecialJobsCount`), but CSS hides them with `display: none !important;`.
  9. `#accountDropdownWrap`, `#headerAccountTrigger`, `#adminLogoutBtn` (`Index.html:126–148`, `display: none !important;`) — suppressed topbar account menu (logout moved to `#sidebarAdminLogoutBtn`).
  10. `#btnLightboxSendWhatsApp` (`Index.html:1757`, `is-staff-only`, `display: none !important; hidden`) — suppressed WhatsApp forward button in Admin photo lightbox.
- **Data source:** Same as parent modules (`M-CUSTOMERS`, `M-CLEAN-REPORTS`, `M-JOB-ASSIGN`, `M-SHELL`).
- **Read operations:** Populated passively by parent module loaders (`loadAdminRecords`, `loadDailyCleanReports`, `loadAdminLeads`, `loadStaffListForAdmin`).
- **Write operations:** `handleBackfillHindi()` calls unauthenticated `POST /api` `action: "backfillHindi"` (Google Input Tools batch transliteration up to 1,000 rows).
- **Actions:** `handleBackfillHindi()`, `setKpiCategoryFilter()`, `setKpiStaffFilter()`, `filterDccRosterByStaff('unassigned')`, `switchAdminTab('washSolar'|'addCust')`.
- **Filters:** Hidden `#filterAdminCategory`, `#filterAdminStaff`, and `.cwp-seg-nav` KPI filter tiles in `#adminTabRecords`.
- **Forms:** None.
- **Permissions:** Inherits parent module permissions; **`backfillHindi` (`server.js:4477–4513`) has NO auth check (`SECURITY GAP`)**.
- **Dependencies:** `tests/test_dom_contract_reconciliation_qa.js` and `app.js` `getElementById` calls rely on several of these hidden IDs remaining present or safely guarded until Aura V2 replaces the controllers.
- **Current UI:** Visually absent (`display: none`) in production Admin, though actively mutated in DOM by JS.
- **Migration complexity:** Low (decide per element: restore cleanly in Aura V2, keep URL alias, or deprecate after updating `app.js` references).
- **Risk:** Medium (deleting hidden DOM IDs like `.reports-kpi-grid` or `#filterAdminCategory` without updating `app.js` will break `M-DASH` KPIs or `filterAdminRecords()`).
- **Recommended migration phase:** Phase 1 (Shell badges/account menu), Phase 2 (`.reports-kpi-grid`), Phase 3 (`#btnAdminBackfillHindi` & Customer hidden filters), Phase 9 (Cutover cleanup).

---

### 3.14 `M-LEGACY-ORPHANS` — Orphaned Frontend Controllers

- **Module:** `M-LEGACY-ORPHANS` (Dead / Unmounted Legacy Dispatch & Staff Performance JS)
- **Route:** None (no active UI mount; code resides inside `public/js/app.js` loaded on `/admin` and `/staff`)
- **Page files:** `public/js/app.js:4746–5606`
- **Navigation:** None. `renderJobAssignmentsLedger()` (`app.js:4742`) calls `renderUnifiedAssignmentsLedger()`, which immediately exits/no-ops because `unifiedAssignmentsTableBody` does not exist in `Index.html`.
- **Purpose:** Superseded unified job assignment ledger, staff workload overview cards (`staffPerformanceSection`, `jobAssignStaffPerformanceGrid`), and unified assign modal (`unifiedJobAssignModal`) whose HTML was removed during prior redesigns. Note: `openUnifiedReassignModal` (`app.js:5035`) *does* target existing `#reassignJobModal`, but is only called by markup generated inside orphaned `renderUnifiedAssignmentsLedger()` (`app.js:5001`).
- **Data source:** Reads in-memory `dccRosterCache` and `adminSpecialJobsCache` when invoked; zero active UI consumers.
- **Read operations:** None independently.
- **Write operations:** Calls `assignDailyCleanCustomer` / `reassignSpecialJob` only if orphaned modal were manually triggered via console.
- **Actions:** `handleUniServiceFilterClick`, `handleUniAssignmentsFilterChange`, `handleUniAssignmentsSearch`, `renderUnifiedAssignmentsLedger`, `openUnifiedReassignModal`, `openUnifiedJobAssignModal`, `renderStaffWorkloadAndPerformance`, `filterJobLedgerByStaffName`, `toggleStaffPerformanceSection`.
- **Filters:** Targets non-existent `#unifiedFilterStaff` and `.cwp-service-filter-chips`.
- **Forms:** Targets non-existent `#unifiedJobAssignModal`.
- **Permissions:** Inherits `M-JOB-ASSIGN` if manually invoked.
- **Dependencies:** None in live DOM (`Index.html` has zero references to `unifiedAssignmentsTableBody`, `unifiedJobAssignModal`, `staffPerformanceSection`, `jobAssignStaffPerformanceGrid`, or `uniAssignmentsTotalChip`).
- **Current UI:** No rendered UI (dead code).
- **Migration complexity:** Low (exclude from Aura V2; do not port).
- **Risk:** Low (leaving unported carries zero functional risk; deleting in V1 before Phase 9 requires checking `window.*` exports).
- **Recommended migration phase:** Phase 9 (Final Cutover & Dead Code Decommissioning).

---

### 3.15 `M-UNWIRED-BACKEND` — Implemented Backend Admin Endpoints With Zero Active V1 UI

- **Module:** `M-UNWIRED-BACKEND` (Backend Admin Capabilities Without V1 Admin UI)
- **Route:** `POST /api` (7 RPC actions + 1 stub) and REST `/api/admin/homepage-config`, `/api/admin/job-applications`
- **Page files:** `server.js:2254–2283, 2381–2391, 3050, 3054, 3074, 3084–3088, 3102, 3104, 3475–3528, 4571–4588, 5075–5083, 5637–5647, 5839–5923, 6133–6150, 6243–6252, 6639`, `services/authService.js:434–469`, `services/dccService.js:288–461, 810–847`, `services/routeService.js:675–698, 941–1114`, `services/homepageConfigService.js:235–292`, `services/careerService.js:112–125`, `db/repositories/auditLogsRepo.js`, `db/repositories/customersRepo.js:300–310`, `db/repositories/jobApplicationsRepo.js:81–93`
- **Navigation:** None in V1 Admin (note that Aura V2 playground sidebar `public/admin-v2/index.html:73–76` includes a placeholder `Settings & Logs` nav item).
- **Purpose:** Covers 10 backend-implemented or stubbed Admin capabilities with zero active V1 Admin UI:
  1. `getAuditLogs` (`server.js:3074, 4571–4588`, `auditLogsRepo.queryLogs` `limit=100`) — Audit trail viewer (`API GAP — REQUIRES INVESTIGATION` for UI wiring).
  2. `getDailyRouteReconciliation` (`server.js:3104, 6243–6252`, `routeService.getDailyRouteReconciliation`) — Daily route planned-vs-completed reconciliation (`API GAP — REQUIRES INVESTIGATION` for UI wiring).
  3. `getCustomerDccDetails` / `getCustomerDccSubscriptions` (`server.js:3084–3085, 5839–5854`, `dccService.getCustomerDccDetails`) & `renewCustomerDccSubscription` / `stopCustomerDccSubscription` / `cancelCustomerDccSubscription` (`server.js:3086–3088, 5857–5923`) — Dedicated transactional DCC subscription lifecycle (`API GAP — REQUIRES INVESTIGATION` for UI wiring; V1 uses legacy `stopCustomerService` instead).
  4. `resetStaffPin` (`server.js:3054, 3475–3528`, `authService.resetStaffPin`) — Dedicated PIN reset with session revocation & audit log (`API GAP — REQUIRES INVESTIGATION` for UI wiring; V1 uses `saveStaffMember`).
  5. `moveStopInRoute` (`server.js:3102, 6133–6150`, `routeService.moveStopInRoute`) — Single-stop move (`API GAP — REQUIRES INVESTIGATION`; V1 uses `reorderRouteStops`).
  6. `PUT/POST /api/admin/homepage-config` (`server.js:2254–2283`, `homepageConfigService.updateHomepageConfig`) — Homepage rates/offers/coupons CMS (`API GAP — REQUIRES INVESTIGATION` for Admin UI).
  7. `GET /api/admin/job-applications` (`server.js:2381–2391`, `careerService.getJobApplications`, skips auth when `NODE_ENV==='test'`) + `jobApplicationsRepo.updateJobApplicationStatus` (`L81–93`, no `server.js` route) (`API GAP — REQUIRES INVESTIGATION`).
  8. `toggleCustomerActive` (`server.js:3050` in `adminProtectedActions`, `customersRepo.toggleActive` at `L300–310`, **missing `server.js` handler** returning `400 Unknown or unsupported action` — `API GAP — REQUIRES INVESTIGATION`).
  9. `cleanAndSyncStaff` (`server.js:3056, 5075–5083`) & `getServiceCatalog` (`server.js:5637–5647`, public, unused by Admin V1).
- **Data source:** `public.audit_logs`, `public.routes`/`route_stops`/`service_logs`, `public.subscriptions`, `public.staff_auth`, `public.homepage_settings`, `public.job_applications`, `public.customers`.
- **Read operations:** `getAuditLogs`, `getDailyRouteReconciliation`, `getCustomerDccDetails`, `getCustomerDccSubscriptions`, `GET /api/admin/job-applications`, `getServiceCatalog`.
- **Write operations:** `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription`, `resetStaffPin`, `moveStopInRoute`, `PUT/POST /api/admin/homepage-config`, `cleanAndSyncStaff`. (`toggleCustomerActive` and `updateJobApplicationStatus` have no working `server.js` route.)
- **Actions:** None wired in V1 Admin UI.
- **Filters:** Backend supports `entityType`, `entityId`, `action`, `actor` on `getAuditLogs`; `date` on `getDailyRouteReconciliation`; `limit`/`offset` on `jobApplicationsRepo`.
- **Forms:** None in V1 Admin UI.
- **Permissions:** RPC actions in `adminProtectedActions`; `PUT/POST /api/admin/homepage-config` uses inline `resolveAdminSession`; `GET /api/admin/job-applications` uses inline `resolveAdminSession` except `NODE_ENV === 'test'` bypass.
- **Dependencies:** `M-ROUTE-PLAN`, `M-CUSTOMERS`, `M-STAFF`, `public/home.html`, `public/careers.html`.
- **Current UI:** None in V1 Admin.
- **Migration complexity:** Medium (read-only Audit Logs & Route Reconciliation are straightforward Aura Data Grid views; DCC lifecycle & PIN reset integrate into existing Customer/Staff modals).
- **Risk:** Low–Medium (wiring existing audited endpoints improves operational integrity; must remove `NODE_ENV === 'test'` auth bypasses and fix `toggleCustomerActive` before exposing).
- **Recommended migration phase:** Phase 4 (DCC Subscription Lifecycle), Phase 7 (Route Reconciliation), Phase 8 (`resetStaffPin`), Phase 9 (Audit Logs, Homepage CMS & Careers Inbox — or formally scoped as post-parity).

---

## 4. Exhaustive Inventory of Modals, Drawers, Tables, Forms & Reports

### 4.1 Complete Modal & Drawer Registry (`Index.html`)

Inspection of `Index.html` identifies **38 total `<div id="*Modal*">` dialogs + 1 `<div id="trackingStoppagesDrawer">` drawer** across the shared SPA. Excluding the **6 Staff-only modals** (`#cleaningCameraModal` L1638, `#staffWhatsAppGroupModal` L1761, `#pwaIosModal` L3199, `#startSpecialJobModal` L3693, `#completeSpecialJobModal` L3728, `#cancelSpecialJobModal` L3769), there are **32 Admin/Shared modals + 1 drawer** in `Index.html`.

*Count Reconciliation:* 26 Admin-only modals reside in the global overlay block (`L1729–4462`) + 1 inline Admin-only modal (`#seqResetModal` at `L864` inside `#adminTabSequence`) = **27 Admin-only modals**. In the shared block (`L1883–2035, 3114–3190`), 4 modals are Admin-accessible/shared (`#imageModal`, `#addressViewModal`, `#logoutConfirmModal`, `#cwpPhotoCropperModal`), while `#whatsAppImageShareModal` (`L1883`) sits in the shared registry (`getTopmostOpenModal()`, `app.js:1379`) and shared block though currently invoked only by Staff (`openDesktopWhatsAppImageHelper`) because `#btnLightboxSendWhatsApp` (`L1757`) is hidden in Admin. All 32 Admin/Shared modals + 1 drawer are inventoried below.

| # | DOM ID & Line (`Index.html`) | Classification | Overlay Class | Module | Purpose / Opener & Closer | Form ID (if any) |
|---|---|---|---|---|---|---|
| 1 | `#seqResetModal` (`L864`) | Admin-only (inline) | `.image-modal-overlay` | `M-ROUTE-PLAN` | Confirm reset of legacy staff sequence (`openSeqResetModal` / `closeSeqResetModal`) | — |
| 2 | `#reportPhotoLightboxModal` (`L1729`) | Admin-only | `.image-modal-overlay` | `M-CLEAN-REPORTS` | Full-res daily clean photo proof + Download / Edit Status / Delete (`openReportPhotoLightbox` / `closeReportPhotoLightbox`) | — |
| 3 | `#editCleanReportModal` (`L1784`) | Admin-only | `.camera-modal-overlay` | `M-CLEAN-REPORTS` | Override clean status (`completed` / `car_not_present`) + required audit reason (`openEditReportStatusModal` / `closeEditReportStatusModal`) | — |
| 4 | `#deleteCleanReportModal` (`L1845`) | Admin-only | `.camera-modal-overlay` | `M-CLEAN-REPORTS` | Delete daily clean log with required reason so staff can re-punch (`confirmDeleteCleanReport` / `closeDeleteReportModal`) | — |
| 5 | `#whatsAppImageShareModal` (`L1883`) | Shared block (Staff-invoked) | `.camera-modal-overlay` | `M-SHELL` (Staff) | Clipboard image copy & WhatsApp Web share helper (`openDesktopWhatsAppImageHelper` / `closeWhatsAppImageModal`) | — |
| 6 | `#imageModal` (`L1922`) | **Shared (Admin + Staff)** | `.image-modal-overlay` | `M-SHELL` / `M-CUSTOMERS` / `M-SPECIAL-JOBS` / `M-STAFF` | Generic vehicle, before/after job, and KYC document photo viewer (`openImageModal` / `closeImageModal`) | — |
| 7 | `#addressViewModal` (`L1943`) | **Shared (Admin + Staff)** | `.image-modal-overlay` | `M-SHELL` / `M-CUSTOMERS` | Primary & Secondary address + Google Maps links + copy (`openAddressModal` / `closeAddressModal`) | — |
| 8 | `#logoutConfirmModal` (`L1998`) | **Shared (Admin + Staff)** | `.image-modal-overlay` | `M-AUTH` / `M-SHELL` | Branded Admin/Staff sign-out confirmation & progress scanner (`openLogoutModal` / `closeLogoutModal`) | — |
| 9 | `#addCustomerModal` (`L2038`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | 4-step Customer Onboarding Wizard + draft restore (`openAddCustomerModal` / `closeAddCustomerModal`) | `#addCustomerForm` (`L2075`) |
| 10 | `#editCustomerModal` (`L2280`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | 6-tab Customer Edit + Packages + Bookings + Delete (`openEditCustomerModal` / `closeEditCustomerModal`) | `#editCustomerForm` (`L2320`) |
| 11 | `#assignServiceModal` (`L2578`) | Admin-only | `.image-modal-overlay` | `M-SERVICE-ASSIGN` / `M-CUSTOMERS` | Assign/update service category, package, location, asset, cleaner & Stop Service (`openAssignServiceModal` / `closeAssignServiceModal`) | `#assignServiceForm` (`L2596`) |
| 12 | `#staffEditModal` (`L2719`) | Admin-only | `.image-modal-overlay` | `M-STAFF` | Edit staff profile, PIN reveal/reset, capabilities, designation, hierarchy, salary & 5 KYC uploads (`openEditStaffModal` / `closeEditStaffModal`) | `#editStaffForm` (`L2728`) |
| 13 | `#addStaffModal` (`L3067`) | Admin-only | `.image-modal-overlay` | `M-STAFF` | Create new field staff member + photo + PIN + work type + designation (`openAddStaffModal` / `closeAddStaffModal`) | `#addStaffModalForm` (`L3076`) |
| 14 | `#cwpPhotoCropperModal` (`L3114`) | **Shared block (Admin-invoked)** | `.image-modal-overlay` | `M-CUSTOMERS` / `M-LEADS` | Cropper.js photo straighten, rotate, flip, aspect ratio & zoom (`openCropperModal` / `closeCropperModal`) | — |
| 15 | `#addLeadModal` (`L3222`) | Admin-only | `.image-modal-overlay` | `M-LEADS` | Create or edit prospect lead with Hindi transliteration, GPS, vehicle photo & stage (`openAddLeadModal` / `openEditLeadModal` / `closeAddLeadModal`) | `#addLeadForm` (`L3234`) |
| 16 | `#convertLeadModal` (`L3398`) | Admin-only | `.image-modal-overlay` | `M-LEADS` | Convert lead to active customer with service, package, sizing/panels & cleaner (`openConvertLeadModal` / `closeConvertLeadModal`) | `#convertLeadForm` (`L3409`) |
| 17 | `#leadNoteModal` (`L3482`) | Admin-only | `.image-modal-overlay` | `M-LEADS` | View note history & append timestamped follow-up note (`openLeadNoteModal` / `closeLeadNoteModal`) | `#leadNoteForm` (`L3493`) |
| 18 | `#assignSpecialJobModal` (`L3517`) | Admin-only | `.image-modal-overlay` | `M-SPECIAL-JOBS` | Dispatch on-demand Wash/Solar/Detailing job for existing or new customer (`openAssignSpecialJobModal` / `closeAssignSpecialJobModal`) | `#assignSpecialJobForm` (`L3531`) |
| 19 | `#reassignJobModal` (`L3653`) | Admin-only | `.image-modal-overlay` | `M-SPECIAL-JOBS` / `M-JOB-ASSIGN` | Reassign staff, tentative time & stop # on special job (or DCC in unified handler) (`openReassignJobModal` / `closeReassignJobModal`) | `#reassignJobForm` (`L3666`) |
| 20 | `#designationManagementModal` (`L3808`) | Admin-only | `.image-modal-overlay` | `M-STAFF` | View system/custom designations & create custom roles with 6 authority flags (`openDesignationManagementModal` / `closeDesignationManagementModal`) | `#addDesignationForm` (`L3834`) |
| 21 | `#sellPackageModal` (`L3924`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | Sell prepaid multi-service package linked to catalog/vehicle/location (`openSellPackageModalFromEditCustomer` / `closeSellPackageModal`) | `#sellPackageForm` (`L3937`) |
| 22 | `#redeemPackageModal` (`L4008`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | Redeem package units against vehicle/location (`openRedeemPackageModal` / `closeRedeemPackageModal`) | `#redeemPackageForm` (`L4028`) |
| 23 | `#packageHistoryModal` (`L4067`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | Audit table of package entitlement redemptions (`openPackageHistoryModal` / `closePackageHistoryModal`) | — |
| 24 | `#createBookingModal` (`L4090`) | Admin-only | `.image-modal-overlay` | `M-CUSTOMERS` | Schedule service booking optionally linked to eligible prepaid package (`openCreateBookingModalFromCustomer` / `closeCreateBookingModal`) | `#createBookingForm` (`L4106`) |
| 25 | `#staffHierarchyModal` (`L4190`) | Admin-only | `.image-modal-overlay` | `M-STAFF` | Visual reporting-line org chart & summary chips (`openStaffHierarchyView` / `closeStaffHierarchyModal`) | — |
| 26 | `#rmCreateRouteModal` (`L4222`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Create new DCC operational route (`openCreateRouteModal` / `closeCreateRouteModal`) | `#rmCreateRouteForm` (`L4231`) |
| 27 | `#rmEditRouteModal` (`L4271`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Edit route name, area, notes, staff & status (`openEditRouteModal` / `closeEditRouteModal`) | `#rmEditRouteForm` (`L4280`) |
| 28 | `#rmAssignStaffModal` (`L4319`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Assign DCC-eligible cleaner with transfer-conflict warning (`openAssignStaffModal` / `closeAssignStaffModal`) | — |
| 29 | `#rmAddStopModal` (`L4361`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Search & add unassigned DCC vehicle stop to route (`openAddStopModal` / `closeAddStopModal`) | — |
| 30 | `#rmTransferStopModal` (`L4409`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Move stop between active operational routes (`openTransferStopModal` / `closeTransferStopModal`) | — |
| 31 | `#rmDeleteRouteModal` (`L4438`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Confirm route deletion (`openDeleteRouteModal` / `closeDeleteRouteModal`) | — |
| 32 | `#rmRemoveStopModal` (`L4450`) | Admin-only | `.image-modal-overlay.rm-modal-overlay` | `M-ROUTE-PLAN` | Confirm stop removal & 1..N sequence compaction (`openRemoveStopModal` / `closeRemoveStopModal`) | — |
| **D1** | `#trackingStoppagesDrawer` (`L1626`) | **Admin-only Drawer** | `.tracking-stoppages-drawer` | `M-STAFF-TRACKING` | Slide-over drawer showing staff journey & stoppages dwell table (`viewStaffStoppages` / `closeTrackingStoppagesDrawer`); lacks `role="dialog"` & `aria-modal="true"` | — |

### 4.2 Admin Tables, Forms & Reports Summary
- **Static HTML Tables (7):**
  1. `.rm-unassigned-table` (`Index.html:747`, 6 cols, `M-ROUTE-PLAN`)
  2. `#adminRecordsTable` (`Index.html:1022`, 10 cols, `M-CUSTOMERS`, paginated)
  3. `#serviceAssignTable` (`Index.html:1093`, 7 cols, `M-SERVICE-ASSIGN`)
  4. Daily Cleaning Status `.records-table` (`Index.html:1315`, 9 cols, no table `id`, targets `tbody#adminCleanReportsTableBody`, `M-CLEAN-REPORTS`)
  5. `#adminSpecialJobsTable` (`Index.html:1413`, 10 cols, `M-SPECIAL-JOBS`)
  6. `#dccRouteRosterTable` (`Index.html:1512`, 7 cols, `M-JOB-ASSIGN`)
  7. `#jobAssignmentsLedgerTable` (`Index.html:1548`, 7 cols, `M-JOB-ASSIGN`)
- **JS-Rendered Tables (4):** Leads Table View (`#leadsListContainer` when in `table` mode, 8 cols, `M-LEADS`), Legacy Sequence Compact View (`#seqCustomerList`, `M-ROUTE-PLAN`), Package Redemption History (`#pkgHistoryListContainer`, `M-CUSTOMERS`), Staff Stoppages Table (`#stoppagesTableContainer` inside `#trackingStoppagesDrawer`, 6 cols, `M-STAFF-TRACKING`). *(Orphaned `unifiedAssignmentsTableBody` at `app.js:4780` has no HTML table.)*
- **Admin `<form>` Elements (20):** `#adminAuthForm` (`L489`), Change Admin Password form (`L920`), `#dccAssignForm` (`L1467`), `#jobAssignForm` (`L1532`), `#addCustomerForm` (`L2075`), `#editCustomerForm` (`L2320`), `#assignServiceForm` (`L2596`), `#editStaffForm` (`L2728`), `#addStaffModalForm` (`L3076`), `#addLeadForm` (`L3234`), `#convertLeadForm` (`L3409`), `#leadNoteForm` (`L3493`), `#assignSpecialJobForm` (`L3531`), `#reassignJobForm` (`L3666`), `#addDesignationForm` (`L3834`), `#sellPackageForm` (`L3937`), `#redeemPackageForm` (`L4028`), `#createBookingForm` (`L4106`), `#rmCreateRouteForm` (`L4231`), `#rmEditRouteForm` (`L4280`).
- **Reports & Exports:**
  1. Daily Cleaning Status live report + compliance rate (`M-CLEAN-REPORTS`), CSV export (`exportDailyCleanReportsCSV`, `app.js:20398`), Print view (`printDailyCleanReports`, `app.js:20444`).
  2. Customer Records & Service Assignments CSV export (`exportAdminRecordsCSV`, `app.js:15386`).
  3. Unified Operations Dashboard KPIs, 3 SVG charts, and Crew Pulse (`M-DASH`).
  4. Staff Live Tracking KPIs & Stoppages/Dwell Report (`M-STAFF-TRACKING`).

---

## 5. Phase C: Complete Operational Workflows & Aura V2 Migration Mapping

Every operational workflow verified in production is traced below (`Trigger -> UI Interaction -> Client Validation -> API / Service / DB Side Effect -> SSE / Refresh -> Edge / Failure Behavior -> Aura V2 Migration Mapping`).

### Workflow 1: Admin Login, Auto-Login, Session Persistence, Password Update & Logout (`M-AUTH`)
- **Trigger:** Navigating to `/admin`, `/admin/*`, or `/?admin=...` without a valid `cwp_admin_token`, or clicking Logout / submitting Change Admin Password.
- **UI Interaction:**
  - *Login:* `#adminAuthGate` (`Index.html:450`) renders 3D canvas `#cwpNeuralCoreCanvas`. User clicks `#cwpCoreBtn` / `#cwpCoreIntroBtn` (or canvas transitions to `passwordPrompt`), revealing `#cwpCorePasswordBox`. User types into `#adminPasswordInput` (with optional `#rememberAdminDevice` checkbox, default checked) and either pauses 450ms after `4+` chars (`initAdminAutoLogin`, `app.js:2762–2790`) or submits `#adminAuthForm` (`handleAdminAuth`, `app.js:2792–2906`).
  - *Password Change:* User navigates to `Staff` tab (`#adminTabStaff`), enters new password in `#newAdminPasswordInput` (`Index.html:921`), submits (`handleUpdateAdminPassword`, `app.js:2925–2941`).
  - *Logout:* User clicks `#sidebarAdminLogoutBtn` (`Index.html:631`) -> `#logoutConfirmModal` (`openLogoutModal('admin')`, `app.js:2477–2522`) -> clicks `#btnLogoutProceed` (`proceedLogout`, `app.js:2544–2588`).
- **Client Validation:** `#adminPasswordInput` is `required`; `initAdminAutoLogin` skips if `length < 4` or already authenticating. `#newAdminPasswordInput` enforces `minlength="4" required`.
- **API / Service / DB Side Effect:**
  - `verifyAdminPassword` (`server.js:2635–2719`) -> `authService.loginAdmin` + `issueAdminSession` -> checks scrypt hash in `public.admin_users`, inserts 12h (`43200s`) `adm_` token hash in `public.auth_sessions`, writes `audit_logs`. Client saves `cwp_admin_token` / `cwp_admin_auth` in `sessionStorage` (and `localStorage` if Remember checked).
  - `updateAdminPassword` (`server.js:3057, 4143–4182`) -> **Security Gap:** `server.js:4143` bypasses `authService.updateAdminPassword` (`authService.js:403–429`, which requires `currentPassword`, 6+ chars, and revokes existing sessions) and calls `repos.adminUsers.updatePassword` directly.
  - `logoutAdmin` (`server.js:2722–2734`) -> `authService.logout` sets `revoked_at` on `auth_sessions`; client clears tokens, sets `cwp_user_role='admin'`, replaces URL to `/admin`.
- **SSE / Refresh:** On login success, unlocks `#adminUnlockedContent`, calls `switchAdminTab(getSavedAdminTab())` and `initAdminRealtimeStream()`.
- **Edge / Failure Behavior:** `401` shakes `#cwpCorePasswordBox` / `#adminPasswordInput`, displays `#adminAuthError`, preserves focus for retry; `429` (5 failed attempts in 5 min) displays cooldown error. On logout, 1,200ms failsafe timeout (`app.js:2584`) guarantees client token clear even if network stalls. Any `401`/`403` in `apiCall` invokes `handleUnauthorizedResponse` (`app.js:5827–5856`), locking the Admin UI.
- **Aura V2 Migration Mapping:**
  - Replace `#cwpNeuralCoreCanvas` tap-gate with an immediate accessible Aura Enterprise Login Card (`v2-auth.js` + Aura Task 02 password input + `v2-btn-primary` + `rememberDevice` checkbox), fixing `A11Y-01`.
  - Preserve `cwp_admin_token`, `cwp_admin_auth`, `initAdminAutoLogin` (optional/configurable), `429` cooldown feedback, and 12h `auth_sessions` TTL.
  - Relocate Change Admin Password out of `M-STAFF` into an Aura Account/Security modal or header menu (`M-SHELL`), and route `server.js:4143` through `authService.updateAdminPassword` in coordinated security remediation.
  - Migrate `#logoutConfirmModal` to `v2-overlay.js` `.cwp-v2-modal-sm` confirmation dialog while keeping shared Staff compatibility.

---

### Workflow 2: Customer Management — 4-Step Onboarding Wizard, Auto-Draft, Cropper, Hindi Transliteration, Edit & Delete (`M-CUSTOMERS`)
- **Trigger:** Clicking `Add Customer` (`#adminTabRecords` L951), `?tab=addCust`, row `Edit` / `⋮ -> Edit Customer`, or `Delete Customer`.
- **UI Interaction:**
  - *Create:* `openAddCustomerModal()` checks `localStorage.cwp_add_customer_draft_v1` and shows `#custDraftRestoreBanner` if found. User walks 4 steps (`1 Profile & Contact`, `2 Addresses & GPS`, `3 Service & Vehicles`, `4 Cleaner Dispatch`): enters name/phone (with debounced `/api/indic/transliterate` auto-filling `#custNameHi`), adds 1+ location cards (`addCustomerLocationCard('add')` with Hindi address transliteration & GPS detect), selects category/package (`Car` multi-vehicle cards with `Aaj`/`Kal` rotation, HSRP plate, make/color, 5/5+ Seater, Cropper.js `#cwpPhotoCropperModal` photo; or `Solar` panel count & site), optionally assigns cleaner/stop order/notes or checks `#custIsLeadCheck` (`Save as Lead`), and clicks `Save & Dispatch`.
  - *Edit:* `openEditCustomerModal(index)` populates 6 tabs (`Profile`, `Locations`, `Service & Vehicles`, `Cleaner & Route`, `Packages`, `Bookings`) + edit draft (`initEditCustomerAutoDraft`, `app.js:12592`) and submits `#editCustomerForm`.
  - *Delete:* Clicking `Delete Customer` (`#editCustomerModal` footer L2567 or table `⋮`) triggers `handleDeleteCustomerFromModal()` / confirmation -> `deleteCustomer`.
- **Client Validation:** `#custName` / `#editCustName` & `#custPhone` / `#editCustPhone` `required`, Indian 10-digit mobile regex (`isValidIndianMobile`), non-empty primary address (`app.js:12735`), required vehicle plate or solar panel count `>= 1`, custom package input required when `'OTHER'`.
- **API / Service / DB Side Effect:**
  - `saveCustomer` (`server.js:4185–4335`) / `updateCustomer` (`server.js:4336–4476`) -> `adminService.saveCustomer` / `updateCustomer` -> transactional upserts across `customers`, `service_locations`, `vehicles`, `subscriptions`, `subscription_vehicles`, `staff_assignments`, `audit_logs`, then `invalidateLiveCustomersCache()` broadcasts `CUSTOMERS_CHANGED`.
  - `deleteCustomer` (`server.js:4516–4552`) -> `adminService.deleteCustomer` -> soft-deletes customer (`deleted_at`, `is_active=false`), stops active subscriptions, cancels active `route_stops` and `staff_assignments`, logs `audit_logs`, broadcasts `CUSTOMERS_CHANGED`.
- **SSE / Refresh:** `CUSTOMERS_CHANGED` reloads `state.adminRecords` and re-renders `#adminRecordsTable` + `#adminTablePagination` (`25`/`50`/`100`/`All`).
- **Edge / Failure Behavior:** Auto-draft persists unsaved inputs in `localStorage`; failed API mutations keep modal open and inputs intact while showing error toast. **Known Scale Cap:** `getAllCustomers` truncates at `500` rows without `totalCount`.
- **Aura V2 Migration Mapping:**
  - Replace `#adminRecordsTable` with Aura Task 07 `.cwp-v2-data-grid` (`34px`/`46px` density, sticky header & sticky right action column, `more_vert` menu, truthful pagination).
  - Preserve bilingual phonetic search (`recordMatchesBilingualSearch`) and add `'Noto Sans Devanagari'` (`line-height: 1.5`) to `v2-tokens.css`.
  - Migrate `#addCustomerModal` and `#editCustomerModal` into `v2-overlay.js` `.cwp-v2-modal-lg`; fix `FRM-01` (wrapping/vertical sub-nav instead of scrolling 6-tab strip) and `FRM-03` (separate `Delete Customer` into Profile danger zone + nested `.cwp-v2-modal-sm` confirmation).
  - Wrap `#cwpPhotoCropperModal` chrome in Aura `.cwp-v2-modal-lg` while keeping `Cropper.js` core (`app.js:9767–10155`) intact.

---

### Workflow 3: Packages & Entitlements + Service Bookings Lifecycle (`M-CUSTOMERS` / `M-SERVICE-ASSIGN`)
- **Trigger:** Opening `Packages` or `Bookings` tab inside `#editCustomerModal`, or clicking `+ Assign Service` / `Manage Service` (`#assignServiceModal`).
- **UI Interaction:**
  - *Assign / Stop Service:* `#assignServiceModal` sets category, package, location (`#assignServiceLocationSelect`), vehicle/solar scope, cleaner, and notes -> `Save & Activate Service`; or clicks `#btnStopServiceAction` (prompts for `reason`).
  - *Prepaid Packages:* `Packages` tab (`loadCustomerPackagesForEditModal`, `app.js:13906`) lists packages with `All`/`Active`/`Exhausted`/`Cancelled` pills -> `Sell Package` (`#sellPackageModal`), `Redeem` (`#redeemPackageModal`), `History` (`#packageHistoryModal`), or `Cancel Package`.
  - *Service Bookings:* `Bookings` tab (`getCustomerServiceJobs`) lists bookings with `All`/`Upcoming`/`Completed`/`Cancelled` pills -> `New Booking` (`#createBookingModal`, optionally links eligible prepaid package via `getEligiblePackagesForBooking`) and inline lifecycle actions (`Start`, `Complete`, `Cancel`, `Fail`).
- **Client Validation:** `assignServiceCategory`, `assignServicePkgType`, `assignServiceLocationSelect`, `assignVehicleNumbers` (or `assignSolarPanelsCount`) `required`; `sellPkgTotalQuantity` & `redeemQuantity` `min="1" required`; `bookingCategorySelect`, `bookingServiceType`, `bookingScheduledDate` `required`.
- **API / Service / DB Side Effect:**
  - `assignCustomerService` / `stopCustomerService` (`server.js:5577–5636`) -> `adminService` -> updates `customers`, `subscriptions`, `vehicles`, `staff_assignments`, `audit_logs`, broadcasts `CUSTOMERS_CHANGED`.
  - `sellCustomerPackage`, `redeemPackageEntitlement`, `cancelCustomerPackage` (`server.js:5679–5736`) -> `packageService` -> `customer_packages` & `package_redemption_logs` + `audit_logs`.
  - `createServiceBooking`, `startSpecialJob`, `completeSpecialJob`, `cancelSpecialJob`, `failServiceJob` (`server.js:5755–5838, 6305–6638`) -> `bookingService` -> enforces state machine (`requested -> booked -> assigned -> in_progress -> completed/unable_to_complete/cancelled`), `staffCapabilityService` check, `FOR UPDATE` row-locked package unit deduction on completion, broadcasts `SPECIAL_JOB_CHANGED`. *(Bug: `cancelSpecialJob` at `server.js:6593` passes wrong audit keys silently caught by `try/catch`.)*
- **SSE / Refresh:** `CUSTOMERS_CHANGED` / `SPECIAL_JOB_CHANGED` refreshes directory, bookings tab, and Wash & Solar Hub.
- **Edge / Failure Behavior:** Insufficient package balance, expired validity, or conflicting job state returns `400`/`409` JSON error, keeping modal open with inputs preserved. **Bug:** Header CTA `openAssignServiceModal(0)` (`Index.html:1060`) hardcodes index `0` (first customer).
- **Aura V2 Migration Mapping:**
  - Add a searchable customer picker inside Aura `#assignServiceModal` when opened from `M-SERVICE-ASSIGN` header CTA (fixing `openAssignServiceModal(0)`).
  - Replace browser `prompt()` in `handleStopServiceClickFromModal()` with an Aura `.cwp-v2-modal-sm` reason dialog.
  - Migrate `#sellPackageModal`, `#redeemPackageModal`, `#packageHistoryModal`, `#createBookingModal` to `v2-overlay.js` stacked modals (using `.is-nested` z-index `1200`/`1250` when launched from Customer Edit drawer/modal).

---

### Workflow 4: Staff Management — Create/Edit, KYC Uploads, Capabilities, Designations, Hierarchy, PIN, Lockout & Toggle Active (`M-STAFF`)
- **Trigger:** Navigating to `Staff` (`#adminTabStaff`), clicking `+ Add New Staff`, `Edit`, `Designations`, `Hierarchy`, or card actions (`Show PIN`, Active toggle, `⋮ -> Reset Device Session / Unlock Account / Delete`).
- **UI Interaction:** User creates via `#addStaffModal` or edits via `#staffEditModal` (photo + 5 KYC uploads, PIN reveal/reset, work type + 5 capability checkboxes, designation + `Reports To` manager, salary/DOJ/weekly off), manages custom roles in `#designationManagementModal` (6 operational authority checkboxes), or inspects reporting tree in `#staffHierarchyModal`.
- **Client Validation:** Name `required`; 10-digit Indian mobile `required` + duplicate phone check across `state.staffList` (`app.js:8708–8718`); 6-digit PIN `^\d{6}$`; designation ID `[a-z0-9_]{3,32}`. **Bug (`app.js:8733–8749`):** `handleEditStaffSubmit` disables `#btnSaveEditStaff` *before* checking `editCaps.length === 0`, leaving button locked on validation failure.
- **API / Service / DB Side Effect:**
  - `saveStaffMember` (`server.js:3655–4058`) -> `adminService.saveStaffMember` + `staffCapabilityService.validateCapabilityCombination` & `checkCapabilityChangeConflicts` (blocks removing DCC if on active route or removing category if `assigned`/`in_progress` job exists) + `staffDesignationService.validateReportingRelationship` (`mgrLevel >= subLevel` + BFS cycle detection depth `<=25`) -> upserts `staff`, `staff_auth`, revokes sessions if `resetDeviceSession`, logs `audit_logs`.
  - `revealStaffPin` (`server.js:3598`), `unlockStaff` (`server.js:3531` -> clears DB lock + `clearAllRateLimitsForIdentifier` across all IPs), `toggleStaffActive` (`server.js:4059`), `deleteStaffMember` (`server.js:4100`), `saveDesignation`/`deleteDesignation` (`server.js:6267–6292`, blocks `is_system_protected`), `getStaffHierarchy` (`server.js:6293`).
- **SSE / Refresh:** Reloads `loadStaffListForAdmin()` after mutation; no SSE event emitted for staff changes.
- **Edge / Failure Behavior:** Capability conflict or reporting-cycle error returns `400`/`409` with descriptive error message; modal remains open.
- **Aura V2 Migration Mapping:**
  - Fix `handleEditStaffSubmit` validation-before-disable order (`app.js:8733–8749`).
  - Upgrade `#adminStaffList` cards & `#addStaffModal`/`#staffEditModal`/`#designationManagementModal`/`#staffHierarchyModal` to Aura Task 05/06/04 components (Material Symbols replacing all `🪪`/`💳`/`👁️`/`🗑️`/`💾` emojis; Task 05 `.cwp-v2-file-dropzone` for KYC uploads).
  - Preserve `staffCapabilityService` conflict checks, BFS hierarchy validation, audited `revealStaffPin`, and cross-IP `unlockStaff`.

---

### Workflow 5: Dispatch & Job Assignment — Daily Clean Routes + On-Demand Special Jobs (`M-JOB-ASSIGN` / `M-SPECIAL-JOBS`)
- **Trigger:** Navigating to `Assign Jobs` (`#adminTabJobAssignment`) or `Wash & Solar Hub` (`#adminTabSpecialJobs`).
- **UI Interaction:**
  - *Daily Clean Allocation:* Select customer (`#dccAssignCustomerSelect` showing `#dccCustomerContextCard`) + cleaner (`#dccAssignStaffSelect`) + stop order + notes -> submit `#dccAssignForm`; or use `#dccRouteRosterTable` inline cleaner `<select>` (`handleDccInlineReassign`) or `✕ Unassign`.
  - *On-Demand Special Job Dispatch:* Submit `#jobAssignForm` (`M-JOB-ASSIGN` subtab 2) or `+ Assign Wash & Solar` (`#assignSpecialJobModal` supporting Existing vs `+ New Customer`, category, date, tentative time slot chips, stop #, solar panels or car seater sizing, cleaner); reassign via `#reassignJobModal`; cancel/delete via row trash action.
- **Client Validation:** Required customer, work type, date, staff, phone (`10` digits), address, package; `#reassignJobForm` blocks reassigning `completed` jobs (`app.js:21656`).
- **API / Service / DB Side Effect:**
  - `assignDailyCleanCustomer` / `unassignDailyCleanCustomer` (`server.js:5482–5547`) -> `staff_assignments` + `staff_route_sequences` -> broadcasts `CUSTOMER_ASSIGNMENT_CHANGED`.
  - `assignSpecialJob` / `reassignSpecialJob` / `deleteSpecialJob` (`server.js:5356–5481, 6498–6542`) -> auto-creates customer/location/vehicle if `'new'`, inserts/updates/soft-deletes `service_jobs` + `audit_logs`, broadcasts `SPECIAL_JOB_CHANGED` (which triggers Staff PWA audio chime & vibration alert).
- **SSE / Refresh:** `CUSTOMER_ASSIGNMENT_CHANGED` and `SPECIAL_JOB_CHANGED` refresh rosters, Active Assignments Ledger, Special Jobs table, and Dashboard KPIs.
- **Edge / Failure Behavior:** Inline `#assignSpecialJobError` / `#reassignJobError` preserve modal inputs on error; Staff PWA receives real-time task alert on `/api/staff-ping-stream` or poll.
- **Aura V2 Migration Mapping:**
  - Consolidate `M-SPECIAL-JOBS` triple-stacked filter bars into Aura Task 06 `.cwp-v2-filter-bar` + collapsible secondary drawer.
  - Upgrade `#dccRouteRosterTable`, `#jobAssignmentsLedgerTable`, and `#adminSpecialJobsTable` to Aura Task 07 `.cwp-v2-data-grid` (`34px`/`46px`, sticky right actions).
  - Do NOT port `M-LEGACY-ORPHANS` (`app.js:4746–5606`).

---

### Workflow 6: DCC Route Management & Operational Sequence (`M-ROUTE-PLAN`)
- **Trigger:** Navigating to `DCC Route Plan` (`#adminTabSequence`).
- **UI Interaction:**
  - *Routes Hub:* View 6 KPI cards & `#rmRoutesGrid`; filter by search/status/staff/area/sort; create route (`#rmCreateRouteModal`), edit (`#rmEditRouteModal`), assign/transfer cleaner (`#rmAssignStaffModal`), toggle active/inactive, delete (`#rmDeleteRouteModal`), or click `Manage Stops`.
  - *Route Detail & Stop Sequence:* Inspect 3-col route summary; add stop (`#rmAddStopModal`), move stop `Up`/`Down`/`Top`/`Bottom` in memory (lighting `#rmSeqUnsavedPill` and enabling `#rmBtnSaveSequence`), transfer stop to another route (`#rmTransferStopModal`), remove stop (`#rmRemoveStopModal`), and click `Save Sequence`.
  - *Unassigned Workbench:* Filter unassigned DCC vehicles, check multiple rows to reveal `#rmBatchBar`, select target route, and click `Assign Selected` (or per-row `Assign to Route`).
  - *Legacy Staff Sequence:* Switch to `Staff Sequence View`, choose staff, drag-drop or edit stop numbers in Cards/Compact view, click `Save Order` or `Reset to Default` (`#seqResetModal`).
- **Client Validation:** Uppercase unique `rmNewRouteCode`, required `rmNewRouteName`/`rmEditRouteName`; non-DCC-eligible staff options disabled in `#rmSelectStaffForRoute`; `confirm()` guard before leaving `#rmRouteDetailView` with unsaved sequence changes.
- **API / Service / DB Side Effect:** `createRoute`, `updateRoute`, `setRouteStatus`, `deleteRoute`, `assignStaffToRoute` (transfers from previous route if busy + mirrors `staff_assignments` & `staff_route_sequences`), `unassignStaffFromRoute`, `addStopToRoute` (called sequentially in batch loop), `moveStopBetweenRoutes`, `removeStopFromRoute` (compacts `1..N`), `reorderRouteStops` (atomic negative-offset tx swap in `route_stops` + mirrors `staff_route_sequences`), and legacy `saveStaffSequence`/`resetStaffSequence`.
- **SSE / Refresh:** Mutations reload route details / hub / unassigned workbench directly (note: Route Hub does not auto-refresh on SSE while open).
- **Edge / Failure Behavior:** Route modals display inline `.rm-form-error` alerts preserving inputs; batch assign collects `successCount`/`failCount`/`lastErr` and reports summary; `confirm()` protects unsaved sequence state.
- **Aura V2 Migration Mapping:**
  - Keep `M-ROUTE-PLAN` domain state machine, unsaved-change guard, and negative-offset `reorderRouteStops` intact; migrate `rm-*` cards, `#rmBatchBar` (Task 07 `.cwp-v2-bulk-bar`), Unassigned table, and 7 `rm-*` modals to Aura tokens/components (`v2-overlay.js`).
  - Strip legacy emojis (`⚠️`, `🔄`, `✓`, `📋`, `⚡`, `👤`, `🚗`) from `#rmLegacySeqView` and `#seqResetModal`.

---

### Workflow 7: Daily Cleaning Status Reports, Lightbox, Status Override & Delete (`M-CLEAN-REPORTS`)
- **Trigger:** Navigating to `Daily Cleaning Status` (`#adminTabCleanReports`) or clicking Dashboard `Daily Cleans Today` KPI tile.
- **UI Interaction:** Select period chip (`Today`/`Yesterday`/`7 Days`/`Month`/`Custom`), staff/photo/route filters, or debounced search; click photo thumbnail -> `#reportPhotoLightboxModal` (Download, Full Size, Edit Status, Delete); click row Edit -> `#editCleanReportModal` (choose `completed` vs `car_not_present`, tap quick reason chip or type reason, save); click row Delete -> `#deleteCleanReportModal` (tap quick reason chip or type reason, confirm); or click `Export CSV` / `Print`.
- **Client Validation:** Non-empty `reason` strictly required in both `#editCleanReportModal` and `#deleteCleanReportModal` (red border + focus + toast if empty).
- **API / Service / DB Side Effect:** `getDailyCleanReports` (`limit=200`), `updateDailyCleanReportStatus` (updates `service_logs.status`, `car_not_present`, `admin_notes` + `audit_logs`), `deleteDailyCleanReport` (deletes `service_logs` row + `audit_logs`, allowing staff to re-punch vehicle today). Both broadcast `DAILY_CLEAN_CHANGED`.
- **SSE / Refresh:** Auto-sync polls every 15s (pausing while typing in `#reportSearchFilter`) + SSE `DAILY_CLEAN_CHANGED` refreshes table and `#adminOpsDashboardHub` KPIs.
- **Edge / Failure Behavior:** Load errors render inline table error row & `'Sync paused (retry in 15s)'`; modal mutation errors re-enable submit button, keep modal open, and preserve the entered `reason`.
- **Aura V2 Migration Mapping:**
  - Upgrade `#adminCleanReportsTableBody` parent `<table>` (add explicit DOM `id`) to Aura Task 07 `.cwp-v2-data-grid` (`34px`/`46px`, sticky header/actions), `.cwp-v2-filter-bar` (Task 06), and migrate `#reportPhotoLightboxModal`, `#editCleanReportModal`, `#deleteCleanReportModal` to `v2-overlay.js` with Material Symbols.

---

### Workflow 8: Unified Operations Dashboard, SVG Charts & Crew Pulse (`M-DASH`)
- **Trigger:** Navigating to `Dashboard` (`#adminTabDashboard`) or receiving SSE events while on `dashboard`/`cleanReports`/`specialJobs`.
- **UI Interaction:** View `#adminOpsDashboardHub` (4 KPI tiles + 3 Intelligence cards), 3 SVG charts (`#dashCleanProgressSvg`, `#dashStaffBarSvg`, `#dashWashSolarSvg`), and `#dashboardCrewPulseStrip`; click KPI tiles to drill into `cleanReports` or `specialJobs`; click `Refresh All`, `Export CSV`, `Print`, or toggle `#reportsLiveSyncPill`.
- **Client Validation:** None (read-only).
- **API / Service / DB Side Effect:** Triggers parallel reads (`getDailyCleanReports`, `getSpecialJobs`, `getStaffList`, `getAllCustomers`) and aggregates counts client-side.
- **SSE / Refresh:** Updates via `DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, `CUSTOMERS_CHANGED`, and 15s `startAdminRealtimePulse()`.
- **Edge / Failure Behavior:** Inherits `200`/`500`-row caps of underlying endpoints (KPIs undercount if DB exceeds caps).
- **Aura V2 Migration Mapping:**
  - Preserve inline SVG chart rendering (`renderDashboardCharts`) and crew pulse logic; rebind KPI tiles and intelligence cards to Aura `.cwp-v2-kpi-grid` / `.cwp-v2-card` tokens and add explicit truncation indicator or server-summary counts in future API enhancement.

---

### Workflow 9: Live Staff GPS Tracking, Provider Fallback, On-Demand Ping & Stoppages Drawer (`M-STAFF-TRACKING`)
- **Trigger:** Navigating to `Track Staff` (`#adminTabStaffTracking`).
- **UI Interaction:** Inspect 4 KPI cards and staff status list (`All`/`Moving`/`Stopped`/`Idle` + search); click `Center` to pan map; click `Ping` to request fresh staff GPS coordinates; click `Stops` to open `#trackingStoppagesDrawer` showing journey breadcrumb polyline and dwell stoppages table; toggle map provider (`Google Maps` / `OpenStreetMap` / `SVG Radar`), breadcrumbs, or recenter all.
- **Client Validation:** None.
- **API / Service / DB Side Effect:** `getStaffTrackingSummary` (`staffTrackingRepo` Haversine `<15m` jitter & `>150 km/h` glitch filtering, `>=5 min` stoppage detection, `<=120m` customer geofence match), `getMapsConfig` (public), `pingStaffLocation` (`staff_location_pings` 5-min TTL + 2.5s x 8 accelerated polling), `getStaffMovementHistory`.
- **SSE / Refresh:** 15s auto-sync interval (`startStaffTrackingAutoSync`) + 2.5s burst polling after ping.
- **Edge / Failure Behavior:** Automatic fallback from Google Maps -> Leaflet/OSM -> built-in SVG radar if API key missing or CDN unreachable; displays `'Sync Error'` on API failure without wiping last map markers.
- **Aura V2 Migration Mapping:**
  - Keep `TrackingMapAdapter` singleton and fallback chain untouched; migrate `#trackingStoppagesDrawer` to `v2-overlay.js` `.cwp-v2-drawer-lg` (fixing missing `role="dialog"` & `aria-modal="true"`), and replace `🟢`/`🛑`/`⏳` pills with Aura status badges + Material Symbols.

---

### Workflow 10: Leads & Inquiries Pipeline — Create/Edit, Stage Progression (Table + Kanban), Notes & Conversion (`M-LEADS`)
- **Trigger:** Navigating to `Leads` (`#adminTabLeads`) or clicking `+ Lead` in Customer Directory.
- **UI Interaction:** Create/Edit via `#addLeadModal`; filter by funnel KPI cards (`All`, `open`, `follow_up`, `ready`), category chips, or bilingual search; toggle `Table` vs `Pipeline` (Kanban); change stage via inline `<select>`, Kanban HTML5 Drag-and-Drop, or `←`/`Next →` buttons; add timestamped remarks via `#leadNoteModal`; click `Convert` -> `#convertLeadModal` (assign category, package, vehicle sizing or solar panels, optional cleaner & notes) -> `Confirm & Assign Customer`.
- **Client Validation:** Non-empty `#leadName`, valid Indian mobile if provided (`app.js:10948–10966`), required `#newLeadNoteText`, required category/package (or panels) on conversion.
- **API / Service / DB Side Effect:** `saveLead` / `updateLead` / `updateLeadStage` / `addLeadNote` / `deleteLead` / `convertLead` (`adminService.convertLeadToCustomer` promotes `tag='customer'`, creates subscription/vehicle/staff assignment + `audit_logs`, broadcasts `CUSTOMERS_CHANGED`).
- **SSE / Refresh:** On conversion, reloads leads & customers and auto-switches to `'records'` tab after 600ms. **Gap:** `app.js:3347` listens for `LEAD_CHANGED`, which `server.js` never emits.
- **Edge / Failure Behavior:** `updateLeadStage` optimistically updates UI and **reverts** `lead.leadStatus = oldStage` on API failure; `deleteLead` uses `confirm()`.
- **Aura V2 Migration Mapping:**
  - Upgrade Leads Table view to Aura Task 07 `.cwp-v2-data-grid` with prominent `Convert` primary/tonal CTA (`ACT-04`), keep Kanban Drag-and-Drop mechanics while stripping all emojis (`🎯`, `✨`, `📥`, `📞`, `🌟`, `🚗`, `☀️`, `🧼`, `💬`, `📝`, `🚀`), and migrate `#addLeadModal`, `#convertLeadModal`, `#leadNoteModal` to `v2-overlay.js`.

---

### Workflow 11: Unwired Backend & Hidden / Suppressed Workflows (`M-HIDDEN-SUPPRESSED` / `M-UNWIRED-BACKEND`)
- **`backfillHindi` (`#btnAdminBackfillHindi`, `Index.html:943`, `app.js:1728–1753`, `server.js:4477–4513`):** Currently hidden (`display: none`), **unauthenticated on backend (SECURITY GAP)**, and **lacks `onFailure` callback** (permanently locks button on error). *Migration Decision:* Add `backfillHindi` to `adminProtectedActions`, add `onFailure` reset, and optionally expose inside Customer Directory Tools menu (Phase 3 / Security Hardening).
- **`getAuditLogs` (`server.js:3074, 4571–4588`):** Backend returns latest 100 `audit_logs` rows with entity/action filters; zero V1 UI. *Migration Decision:* Wire into Aura `Settings & Logs` view (Phase 9) using Task 07 Data Grid + filters (`entityType`, `entityId`, `action`, `actor`).
- **`getDailyRouteReconciliation` (`server.js:3104, 6243–6252`):** Computes daily planned vs cleaned vs exception vs pending per route; zero V1 UI. *Migration Decision:* Wire into `M-ROUTE-PLAN` or `M-CLEAN-REPORTS` reconciliation drawer/tab (Phase 7).
- **Dedicated DCC Subscription Lifecycle (`getCustomerDccDetails`, `getCustomerDccSubscriptions`, `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription` at `server.js:3084–3088, 5839–5923`):** Implemented in `dccService.js`, unused by V1 UI (which uses `stopCustomerService`). *Migration Decision:* Expose in Aura Customer Edit `Service / DCC` panel (Phase 4) with proper modal confirmations.
- **`resetStaffPin` (`server.js:3054, 3475–3528`):** Dedicated `authService.resetStaffPin` with audit trail & session revocation; V1 edits PIN via `saveStaffMember`. *Migration Decision:* Wire dedicated PIN Reset modal action in `M-STAFF` (Phase 8).
- **`PUT/POST /api/admin/homepage-config` (`server.js:2254–2283`) & `GET /api/admin/job-applications` (`server.js:2381–2391` + unused `updateJobApplicationStatus`):** Manage public homepage pricing/offers and careers inbox; zero V1 UI. *Migration Decision:* Scope as optional Aura Settings / Careers Inbox module in Phase 9 (removing `NODE_ENV==='test'` bypass and adding `updateJobApplicationStatus` route if enabled).
- **`toggleCustomerActive` (`server.js:3050`):** Listed in `adminProtectedActions` and `customersRepo.toggleActive` exists (`L300–310`), but **`server.js` has no handler** (`400 Unknown or unsupported action`). *Migration Decision:* Tagged `API GAP — REQUIRES INVESTIGATION`; keep inactive or implement `server.js` handler in Phase 3.
