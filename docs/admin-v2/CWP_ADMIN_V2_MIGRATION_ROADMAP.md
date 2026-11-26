# CWP Admin V2 — Shell Migration Plan & Phased Migration Roadmap (Phases E, F, G & Design Rules)

**Deliverable ID:** M4 (`CWP_ADMIN_V2_MIGRATION_ROADMAP.md`)  
**Target Repository:** `e:\CWP DATA APP` (`cwp-staff-viewer` v`3.2.1`, branch `main`)  
**Audit Date:** 2026-11-26  
**Scope & Boundaries:** Read-only architecture, shell migration, and phased execution blueprint. **Zero production application, backend, database, Staff Portal, or public website files were modified (`Production application files modified: NONE`).**

**Companion Deliverables in `docs/admin-v2/`:**
- `docs/admin-v2/CWP_AURA_LIVE_MIGRATION_MASTER_AUDIT.md` (M1 — Module Inventory & Operational Workflows, Phases A & C)
- `docs/admin-v2/CWP_ADMIN_V2_API_DATA_MAP.md` (M2 — End-to-End Live Data & API Map, Phase B)
- `docs/admin-v2/CWP_AURA_PRODUCTION_COMPONENT_MAPPING.md` (M3 — CWP Aura Component Mapping, Phase D)
- `docs/admin-v2/CWP_ADMIN_V2_REGRESSION_MATRIX.md` (M5 — Test Infrastructure Audit & 18-Area Verification Matrix)

**Design System & Baseline Cross-References:**
- `docs/design-system/01-product-and-user-context.md` through `07-validation-checklist-and-governance.md` (v1.0.0)
- `public/admin-v2/` (Aura V2 Playground: Tasks 01–07 + `v2-overlay.js`)
- Root UX audits (`CWP_UNIFIED_DESIGN_SYSTEM_PLAN.md`, `CWP_UX_BASELINE_AUDIT.md`, `CWP_UX_ISSUE_REGISTER.md`, `CWP_UX_REDESIGN_ROADMAP.md`)

---

## Table of Contents
1. [Non-Negotiable Architecture, Live Data Integrity & Aura High-Density Rules](#1-non-negotiable-architecture-live-data-integrity--aura-high-density-rules)
2. [Phase E — Complete Admin Shell Audit & Migration Plan](#2-phase-e--complete-admin-shell-audit--migration-plan)
3. [Phases F & G — Phased Implementation Roadmap (Phases 0–9)](#3-phases-f--g--phased-implementation-roadmap-phases-09)
4. [Cutover & Rollback Strategy](#4-cutover--rollback-strategy)

---

## 1. Non-Negotiable Architecture, Live Data Integrity & Aura High-Density Rules

Every implementation phase (`Phase 0` through `Phase 9`) MUST strictly obey the following three rule pillars. Any PR or task that violates these constraints fails acceptance review.

### 1.1 Strict Architecture Rule (Zero Stack Rewrite)

1. **Backend Stack Locked:** All server behavior remains on the existing native Node.js `http.createServer` monolith (`server.js`, 6,886 lines; zero Express/Fastify/Koa), backed by the 16 domain services in `services/*.js` and 21 repository files in `db/repositories/*.js`.
2. **Database Stack Locked:** Persistence remains on Neon PostgreSQL (`27` `public.*` tables + `meta.schema_migrations` across 23 `.sql` files `001`–`022`, with local fallback `local_data.json` for non-production/test runs via `db/connectionResolver.js`). No ORM introduction or destructive schema rewrites.
3. **API Transport Locked:** Preserve existing `POST /api` (and `POST /`) RPC `payload.action` dispatcher (`100` implemented actions), `14` REST/health endpoints (`13` `/api/*` REST endpoints + `/health`/`/healthz`/`/ping` health group), and `2` SSE streams (`GET /api/admin-realtime-stream` and `GET /api/staff-ping-stream`) as mapped in M2.
4. **Frontend Stack Locked:** **Vanilla ES6+ JavaScript, semantic HTML5, and scoped CSS custom properties (`--cwp-v2-*` / `.cwp-v2-root`) ONLY.** Explicitly **NO** React, Next.js, Vue, Angular, Svelte, Tailwind build pipelines, TypeScript transpile steps, or npm frontend bundlers (`package.json` has zero `devDependencies`).
5. **Auth & Business Logic Locked:** Preserve `resolveAdminSession(token)` (`adm_` tokens, 12h `SESSION_TTL_MS`, SHA-256 `public.auth_sessions`), `scryptSync` password verification, 5-attempts/5-minute IP rate limiting, `audit_logs` immutability, `staffCapabilityService` conflict checks, `staffDesignationService` hierarchy BFS validation, `packageService` `FOR UPDATE` locks, `routeService` negative-offset stop reordering, and `recordMatchesBilingualSearch()` phonetic matching.
6. **Hard Portal Isolation:**
   - **Staff PWA (`/staff`, `/staff/*`, `/?staff=`, `/?id=`, `sw.js` `cwp-staff-pwa-v1.0.33`, `public/css/staff-m3.css`, `#staffView`, 6 Staff-only modals):** **DO NOT MODIFY OR BREAK.**
   - **Public Website (`/`, `/home`, `public/home.html`) & Careers Portal (`/careers`, `public/careers.html`):** **DO NOT MODIFY.**
   - All Aura V2 CSS selectors must remain strictly scoped under `.cwp-v2-root` / `body.cwp-v2-body` (`scripts/verify_admin_v2_isolation.js:252–265`) and JS under `window.CWP_ADMIN_V2` until V1 retirement in Phase 9.

---

### 1.2 Live Data & Action Integrity Rules

1. **Real Data Only (Ban All Mock/Seed Fixtures from Production):**
   - `public/admin-v2/js/v2-playground.js` (4,296 lines) currently embeds 5 hardcoded datasets (`MOCK_OPERATIONS` `L223`, `SEARCHABLE_SERVICES` `L1098`, `TASK06_OPERATIONS` `L1121`, `ZONE_DEFINITIONS` `L1509`, `TASK07_OPERATIONS_DATASET` `L2285`).
   - **Mandatory Rule:** Before any Task 06/07 UI widget is wired into a live Admin module, its controller logic must be extracted into pure parameterized factories (`createAuraDataGrid`, `createAuraFilterBar`, `createAuraDropdown`, `createAuraDateRange`) with **zero** mock arrays imported into production Admin bundles. Playground mock data stays confined to the `/admin-v2/ui-lab` sandbox view.
2. **Preserve Domain IDs, Relationships, Calculations & Timestamps:**
   - Preserve PostgreSQL UUID/code identifiers (`customerCode`, `staffCode`, `routeCode`, `jobId`, `packageId`), IST (`Asia/Kolkata`) date boundaries (`service_date`, `completed_at_device`), consecutive cleaning/transit time calculations (`computeConsecutiveTimes` in `adminService.js:1743+`), `Aaj`/`Kal` multi-vehicle rotation tags, HSRP plate formatting (`CMP-03`), and `staff_assignments` / `staff_route_sequences` mirroring.
3. **True Action Integrity (Zero Decorative Controls, Fake Toasts, Double-Submits, or Silent Failures):**
   - **No Decorative Buttons:** Every visible button, badge, or link must execute a real action or display a truthful status. Hidden/suppressed controls (`#btnAdminBackfillHindi`, `#accountDropdownWrap`, `.admin-tab-badge`, `#dccUnassignedBanner`) must either be deliberately wired with security/data backing or cleanly removed/decommissioned.
   - **Fix Pre-Validation Button Lock (`M-STAFF`):** `handleEditStaffSubmit()` (`public/js/app.js:8732–8749`) disables `#btnSaveEditStaff` at `L8733` *before* validating `editCaps.length === 0` at `L8746`, permanently locking the modal button on validation failure. Validation MUST run before disabling any submit button, and `onFailure` / `catch` MUST always restore button state.
   - **Fix Missing `onFailure` Callback (`M-CUSTOMERS`):** `handleBackfillHindi()` (`app.js:1728–1753`) disables `#btnAdminBackfillHindi` and passes only `onSuccess` to `apiCall('backfillHindi', ...)`. Every `apiCall` invocation that disables a trigger MUST define an `onFailure` handler that re-enables the button and displays an actionable error.
   - **Fix Hardcoded Index-0 Dispatch (`M-SERVICE-ASSIGN`):** `Index.html:1060` calls `openAssignServiceModal(0)`, always targeting `state.adminRecords[0]`. Header-level `+ Assign Service` MUST open an Aura searchable customer picker (`createAuraDropdown`) instead of silently selecting row `0`.
   - **Replace Browser `prompt()` / `confirm()` in Critical Paths:** Replace `prompt()` in `handleStopServiceClickFromModal()` (`app.js:13870–13897`) and raw `confirm()` deletes (`deleteCustomer`, `deleteStaffMember`, `deleteLead`, `deleteAdminSpecialJob`) with `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` confirmation dialogs.
   - **Fix Silent Backend Audit & Query Bugs:** Fix `cancelSpecialJob` (`server.js:6593–6600`) passing wrong keys (`tableName`/`recordId`/`oldData`/`newData` instead of `entityType`/`entityId`/`beforeState`/`afterState`) to `repos.auditLogs.logChange` (silently caught at `L6601`), and fix `INNER JOIN public.service_locations` (`serviceJobsRepo.js:54`, `adminService.js:2847`) hiding jobs with `location_id IS NULL`.
4. **Sound State Management:**
   - **Loading States:** Use Task 07 `.cwp-v2-skeleton-cell` / `.cwp-v2-skeleton-bar` on initial table fetches and `.cwp-v2-btn.is-loading` on submit buttons (preventing duplicate submissions).
   - **Refresh & Real-Time Sync:** Preserve `EventSource('/api/admin-realtime-stream')` + 15s `startAdminRealtimePulse()` (`app.js:3278–3422`), fix the `LEAD_CHANGED` dead listener (`app.js:3347` vs missing server broadcast on `updateLeadStage`/`addLeadNote`), and pause auto-refresh while typing in search/filter inputs (preserving the `M-CLEAN-REPORTS` pattern at `app.js:19579–19599`).
   - **Actionable Errors & Input Preservation:** On failed mutations, keep the modal/form open, preserve all user-entered fields (and `localStorage` auto-drafts in `addCustomerModal` / `editCustomerModal`), focus the first invalid field, and render `.cwp-v2-form-alert.is-error` or `.has-error` inline messages.
   - **Contextual Empty States:** Use Task 06 `.cwp-v2-empty-state-panel` distinguishing "No data yet" from "No results match active filters" with a one-click `Reset Filters` action.
   - **Consistent Selection & Expansion Across Re-Renders:** Store `selectedIds`, `expandedIds`, and `openMenuId` in module state and delegate table events on stable parent containers so SSE background refreshes (`CUSTOMERS_CHANGED`, `DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`) do not wipe selections or collapse open row details (`M3 RISK-05`).
   - **Accurate Partial-Failure Bulk Reporting:** For multi-item operations such as `executeBatchAssignToRoute()` (`M-ROUTE-PLAN`, which loops `addStopToRoute` sequentially) and any future bulk action, track per-item outcomes (`succeeded[]`, `failed[{ id, label, error }]`), render a structured summary (toast + inline list of failed items), and keep only failed items checked for immediate retry.

---

### 1.3 CWP Aura High-Density Operational Design Rules

| Rule Area | Approved Aura V2 Standard (`public/admin-v2/` + `docs/design-system/`) | Mandatory Production Remediation |
|---|---|---|
| **Table Row Density** | Task 07 `.cwp-v2-data-grid`: **Compact `34px`** (`--cwp-v2-table-row-h-compact`, `.is-compact`) for high-volume operational ledgers; **Standard `46px`** (`--cwp-v2-table-row-h-standard`, `.is-comfortable`) for multi-line photo/timeline rows (`M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`). | Standardize all 7 static + 4 JS-rendered Admin tables (`M3 §2`). Use `min-height: 34px` (not rigid clipped `height`) so bilingual Devanagari rows wrap cleanly without clipping matras. |
| **Sticky Headers & Horizontal Actions** | Sticky `thead th` (`36px`/`42px`) + **`.is-sticky-action`** pinned right action column (`--cwp-v2-table-sticky-col-shadow`) with explicit opaque row backgrounds (`#ffffff`, hover `#f8fafc`, selected `#f0f7ff`) and overflow menu (`⋮`) escaping horizontal scroll (`M3 RISK-04`). | Prevent horizontal scroll text bleed-through and clipped action menus on 9–10 column tables (`#adminRecordsTable`, `#adminCleanReportsTableBody`, `#adminSpecialJobsTable`). |
| **Truthful Sorting & Pagination** | Task 07 `aria-sort` column headers + `.cwp-v2-table-pagination` (`Showing X–Y of Z`, page-size selector). **Never** show a misleading total if backend truncated rows! | **Reconcile Backend Caps (`M2 §4 #9`):** `getAllCustomers` (`limit=500`), `getLeads` (`limit=500`), `getDailyCleanReports` (`limit=200`), `getSpecialJobs` (`limit=200`), and `getAuditLogs` (`limit=100`) currently omit `totalCount` and ignore `offset`/`sort`. Either add `{ page, pageSize, sortBy, sortDir, totalCount }` in coordinated backend endpoints OR display an explicit `"Showing latest N loaded records (cap reached — refine filters)"` indicator whenever `rows.length === cap` until server pagination is wired. |
| **Compact Primary & Collapsible Secondary Filters** | Task 06 `.cwp-v2-filter-bar` (single compact row: search + primary status/date presets) + collapsible `.cwp-v2-filter-drawer` for secondary facets + `.cwp-v2-selection-summary-bar` active filter pills. | Collapse `M-SPECIAL-JOBS` 520px triple-stacked filter bars (`CWP_UX_BASELINE_AUDIT.md`) and `M-CLEAN-REPORTS` 2-tier panel into one compact primary bar + toggleable secondary drawer. |
| **Live Search & Bilingual Phonetic Match** | Debounced live search (`350ms` for server-backed lists; instant for cached lists) + `/` keyboard shortcut (`M-CUSTOMERS`). | Preserve `recordMatchesBilingualSearch()` (`app.js:275–397`) and `/api/indic/transliterate` 100% across Customers, Leads, Clean Reports, and Route Management. |
| **Aura Forms & Consequential Confirmations** | Task 02/05 `.cwp-v2-form`, `.cwp-v2-input-box`, `.has-error` inline field messages, `.cwp-v2-form-alert`, and `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` (`v2-overlay.js`) for destructive/high-impact actions. | Fix `FRM-01` (`#editCustomerModal` 6-tab overflow -> `.cwp-v2-tabs`) and `FRM-03` (`Delete Customer` separated from `Save Changes` footer into Profile danger zone + confirmation modal). |
| **Color Polarity & Brand Tokens** | **Light workspace** (`#f8fafc` `--cwp-v2-sys-surface-ground`, `#ffffff` cards), **Dark Navy sidebar** (`#0b1a2b` `--cwp-v2-ref-navy-900`, Locked Decision #1 & #11), **CWP Blue accent** (`#2563eb` `--cwp-v2-sys-primary`). | Replace V1's white light-mode sidebar (`style.css:18199`) with `#0b1a2b` dark navy. Explicitly resolve `#btnThemeToggle` scope (either remove dark toggle in Admin V2 per Locked Decision #11 or provide complete `[data-theme="dark"]` `--cwp-v2-*` overrides). |
| **Self-Hosted WOFF2 Fonts & Devanagari (`DDR-002`)** | `docs/design-system/01 §7` & `07 §3 DDR-002`: **Zero external CDN calls** for fonts/icons; include **`Noto Sans Devanagari`** with **`line-height: 1.5`** and `>=4px` vertical badge/cell padding. | Replace `https://fonts.googleapis.com` in `public/admin-v2/index.html:10–12` with self-hosted `@font-face` (`/fonts/material-symbols-outlined.woff2` + self-hosted Latin & Devanagari WOFF2 files). Add `'Noto Sans Devanagari'` to `--cwp-v2-font-sans` (`v2-tokens.css:112`) and raise `body.cwp-v2-body` `line-height` from `1.4` (`v2-base.css:14`) to `1.5` on bilingual text. |
| **Material Symbols Outlined ONLY** | `CWP_UNIFIED_DESIGN_SYSTEM_PLAN.md §3`: Standardize 100% on `<span class="material-symbols-outlined">` (`font-variation-settings` self-hosted WOFF2). | Eliminate **~574 emoji lines** (`213` in `Index.html`, `361` in `app.js` Admin ranges) and **~24 non-chart UI SVGs** (`M3 §3.2`). **Preserve** the 3 Dashboard SVG data charts (`#dashCleanProgressSvg`, `#dashStaffBarSvg`, `#dashWashSolarSvg`) and SVG radar fallback in `TrackingMapAdapter`. |

---

## 2. Phase E — Complete Admin Shell Audit & Migration Plan

### 2.1 Exhaustive Production Admin Shell Audit (`Index.html`, `app.js`, `style.css`, `server.js`)

Every structural, behavioral, and styling dimension of the current Production Admin shell was directly audited against source code:

| Shell Element / Contract | Verified Production Implementation (`file:line`) | Identified Defects & Gaps | Aura V2 Migration Decision |
|---|---|---|---|
| **Dual-Mode Boot & Route Resolution** | `server.js:6657–6750` serves `Index.html` for `/admin`, `/admin/*`, `/?admin=` (`initialMode='admin'`, injects `admin-mode-active`). `DOMContentLoaded` (`app.js:1881–1916`) & `applyViewMode()` (`app.js:1919–2017`) switch `#staffHeader`/`#staffView` vs `#adminHeader`/`#adminView`, set `sessionStorage.cwp_user_role`, and sync `/admin` via `history.replaceState`/`pushState`. | Monolithic `Index.html` (4,486 lines) & `app.js` (23,843 lines) mix Staff PWA and Admin code; CSS/JS edits risk breaking `/staff` or `sw.js` precache (`PRECACHE_ASSETS` caches `/css/style.css`, `/js/app.js`). | Keep `/staff` completely isolated on `Index.html` + `style.css` + `staff-m3.css`. Serve Admin V2 shell cleanly via isolated `/admin-v2` shadow route first, then switch `/admin` server route in Phase 9 cutover (Section 4). |
| **Top Header (`#adminHeader`)** | `Index.html:61–150`, `style.css` (`56px` `--cwp-header-height`). Left: `.brand-logo-wrap` (`handleBrandLogoClick()` -> `'records'`), `#headerContextChip` (`ADMIN`), static `#adminHeaderTitle` (`"Admin Portal"`). Right: `#staffLiveBadge` + `#syncDetailsPopover`, `#langDropdownWrap` (EN/HI), `#btnThemeToggle`, `#accountDropdownWrap`. | **Static title:** `#adminHeaderTitle` stays `"Admin Portal"` across all 10 tabs (only mobile `#adminMobileActivePane` updates at `app.js:2984–2999`). Uses **4 inline SVGs** (`L101, 107, 109, 135`) and **5 emojis** (`✕`, `✓`, `🌙`, `🛡️`). | Adopt `.cwp-v2-header` (`56px`, `--cwp-v2-header-bg`). Dynamically update `#v2HeaderTitle` & `#v2HeaderSubtitle` on every `switchAdminTab()` (`v2-shell.js:107–112`). Replace all 4 SVGs & 5 emojis with Material Symbols. |
| **Left Sidebar (`#adminSidebar`)** | `Index.html:542–636`, `style.css:18181–18225`. Desktop (`min-width: 1025px`): `position: fixed; top: 56px; width: 260px`, collapsible via `#adminSidebarCollapseBtn` (`localStorage.cwp_admin_sidebar_collapsed`) to `72px` `.rail-mode`/`.collapsed`. | White background (`#ffffff`, dark mode `#0b1329`) violates **Dark Navy Sidebar** rule (`#0b1a2b`). `v2-layout.css` currently lacks `.is-collapsed` CSS even though `--cwp-v2-sidebar-width-collapsed: 68px` exists at `v2-tokens.css:92`. | Implement `.cwp-v2-sidebar` (`#0b1a2b`, `250px` expanded / `68px` `.is-collapsed` rail persisted in `localStorage.cwp_admin_sidebar_collapsed`) starting at `top: 0` (full-height left rail per `v2-layout.css:18–28`). |
| **Navigation Groups & Hidden Items** | 2 `.sidebar-section-label` groups (`Index.html:556–627`): **OPERATIONS** (`Dashboard`, `Daily Cleaning Status`, `Other Cleaning Status`, `Assign Jobs`, `Track Staff`, `DCC Route Plan`) and **MANAGEMENT** (`Customers`, `Assign Booking`, `Leads`, `Staff`), plus hidden `#sideNavDashboard` (`L598`, `display: none !important; hidden`). | `public/admin-v2/index.html:40–77` only scaffolds 6 playground views (`ui-lab`, `dashboard`, `customers`, `staff`, `dispatch`, `settings`) and misses 6 of the 10 production Admin tabs (`cleanReports`, `specialJobs`, `jobAssignment`, `staffTracking`, `sequence`, `serviceAssign`, `leads`). | Map all **10 production Admin tabs** cleanly into the 2 Aura sidebar groups (`OPERATIONS` + `MANAGEMENT`) plus an optional `SYSTEM` group (Phase 9 Audit Logs/Settings). Deprecate `#sideNavDashboard` while preserving `switchAdminTab('dashboard')`. |
| **Active Indicator & Suppressed Badges** | `switchAdminTab()` (`app.js:2963`) toggles `.active` on `#tabBtn*`. JS updates counts on `#tabCleanReportsCount`, `#tabSpecialJobsCount`, `#tabRecordsCount`, `#tabLeadsCount`, `#tabStaffCount`, etc. | **CSS Suppression Defect:** `style.css:15774–15778` sets `.sidebar-nav-list .admin-tab-badge, .sidebar-nav-list .hub-live-badge, .sidebar-nav-list .badge-pill-tag { display: none !important; }` — hiding all sidebar badges despite background JS polling! | Use `.cwp-v2-nav-item.is-active` + `aria-current="page"`. Remove CSS blanket suppression and selectively show `.cwp-v2-nav-badge` **only** where counts are truthful and non-truncated (e.g., Pending Leads, Unassigned DCC, Live Staff count; `hide` or mark `500+` if capped). |
| **Page Title & Breadcrumbs** | Static `#adminHeaderTitle` (`"Admin Portal"`) on desktop; `#adminMobileActivePane` (`Index.html:643`) updates dynamically. **No global breadcrumb bar** exists; only `#rmRouteDetailView` (`Index.html:755–759`) has an internal breadcrumb (`Routes Hub / ROUTE-01`). | Deep subviews (`#rmRouteDetailView`, Edit Customer tabs, Route/Assign modals) lack shell-level context on desktop. | Update `#v2HeaderTitle` + `#v2HeaderSubtitle` per tab and add an optional shell breadcrumb slot (`Section / Active Tab / Sub-view`) inside `.cwp-v2-header-context` when drilled into `#rmRouteDetailView` or sub-views. |
| **Global Search & Notification Center** | **Neither exists** in V1 Admin shell (`Index.html:61–150`). Search is local per module (`#adminRecordSearch`, `#leadsSearchInput`, etc.). Alerts use `showToast()` + SSE `/api/admin-realtime-stream` + Web Audio chimes (`playNewTaskChime`, `playTaskCompletedChime`). | M2 (`§4 #10–11`) confirms **zero** backend global cross-module search endpoint and **zero** notifications feed endpoint (`API GAP — REQUIRES INVESTIGATION`). | Do **not** add fake/decorative search or notification bells in Phase 1. Keep local module search + upgrade `#toastNotification` to `.cwp-v2-toast-container` + `.cwp-v2-sync-popover` (SSE status). Global search / notification inbox only if backed by new `/api` endpoints in a post-parity phase. |
| **Profile Menu, Logout & Change Password** | `#accountDropdownWrap` (`Index.html:126–148`) & `#adminLogoutBtn` (`L145`) are forced `display: none !important` in HTML, though `updateHeaderAccountStatus()` (`app.js:1232–1254`) toggles `display: inline-flex !important` with hardcoded `'Admin'` / `'SUPER ADMIN'` / `'🛡️'`. Primary logout is `#sidebarAdminLogoutBtn` (`L631`) -> `#logoutConfirmModal` (`L1998`). Change Password (`#newAdminPasswordInput`) is buried in `#adminTabStaff` (`L920–925`). | Conflicting HTML `display: none !important` vs JS `setProperty('display', 'inline-flex', 'important')`; `#logoutConfirmModal` uses Staff-centric Hindi text (`स्टाफ लॉगआउट`, `🚗`) until `openLogoutModal('admin')` overrides it; `updateAdminPassword` (`server.js:4143`) bypasses `authService.updateAdminPassword` (`authService.js:403`). | Unify Admin profile popover in `.cwp-v2-header-actions` (clean `admin_panel_settings` Material Symbol, `Administrator` label, **Change Admin Password** trigger opening an Aura Security modal calling `authService.updateAdminPassword`, and **Logout**) while keeping `#sidebarAdminLogoutBtn` in the sidebar footer for quick exit. |
| **Permissions & Auth Gate (`M-AUTH`)** | Binary auth (`cwp_admin_token` in `sessionStorage` + optional `localStorage` via `#rememberAdminDevice`). `#adminAuthGate` (`Index.html:450–538`) hides `#adminPasswordInput` behind `#cwpNeuralCoreCanvas` tap gate (`A11Y-01`). `v2-auth.js:42–68` calls public `getStaffList` to "verify" session! | **2 Critical Defects:** (1) `A11Y-01` blocks keyboard-only login behind canvas tap; (2) `v2-auth.js:42–68` treats any non-empty/expired/staff token as valid `{ valid: true }` because `getStaffList` returns `HTTP 200` without auth (`M2 §1.6`). | Remediate `v2-auth.js` (`checkSession()` must call an `adminProtectedActions` endpoint or dedicated `verifyAdminSession` action; honor `#rememberAdminDevice` `sessionStorage`-only mode; call `logoutAdmin` on sign-out). Remediate `A11Y-01` with immediate keyboard-focusable Aura login card (preserving optional `prefers-reduced-motion` canvas backdrop). |
| **Responsive Behavior & Scroll Container** | V1 `style.css:16687–16805, 18228–18237`: `1024px` breakpoint converts `#adminSidebar` to `280px` (`max-width: 85vw`) slide-over drawer with `#adminSidebarBackdrop` (`z: 2050`/`2100`) and sticky `#adminMobileTopbar`; secondary breakpoints at `960/768/640/480/360px`. `.admin-main-workspace` shifts `margin-left: 260px` (`72px` rail) on `>=1025px`; `html, body` lock `overflow-x: hidden`. | **Critical V2 Gap:** `public/admin-v2/css/v2-layout.css` (292 lines) has **0 `@media` queries**, hardcodes `width: 100vw; overflow: hidden` (`L10–11`), and clips `<1024px` screens. `v2-components.css` has only 1 `@media (max-width: 640px)` at `L1783`. | Implement all 3 `docs/design-system/06 §1` tiers in `v2-layout.css`: **Expanded (`>=1024px`)** `250px`/`68px` sidebar + scrollable `.cwp-v2-workspace`, **Medium (`600–1023px`)** slide-over drawer + backdrop + mobile header trigger, **Compact (`<600px`)** compact header + single-col KPI/filter stacking + mobile card/table horizontal scroll. |
| **URL, History & Modal Stack Contracts** | `getSavedAdminTab()` (`app.js:2668–2691`) resolves `?tab=` -> `#admin/<tab>` -> `localStorage.cwp_admin_active_tab` -> `'records'`; maps `washSolar` -> `specialJobs`; handles `addCust` -> opens `#addCustomerModal`. `switchAdminTab()` updates URL via `history.replaceState` (`?tab=<t>#admin/<t>`). `popstate` (`app.js:5694–5717`) intercepts Back to close `getTopmostOpenModal()` or sync tab; `hashchange` (`L5720–5727`) syncs `#admin/<tab>`. | **3 Defects:** (1) `v2-shell.js` only reads `#ui-lab`/`#customers` hashes and ignores `?tab=` and `#admin/<tab>`; (2) `switchAdminTab` uses `replaceState` so browser Back doesn't step between tabs (only modals); (3) `getTopmostOpenModal()` (`app.js:1369–1418`) hardcodes 22 IDs (including `#seqResetModal` at `L1372`) and omits **16 modals (+ 1 drawer)** (`17` overlays total: 7 `#rm*` modals, `#editCleanReportModal`, `#deleteCleanReportModal`, `#assignServiceModal`, `#sell/redeem/packageHistory/createBookingModal`, `#designationManagementModal`, `#staffHierarchyModal`, plus `#trackingStoppagesDrawer`). | Upgrade `v2-shell.js` router to support `?tab=` + `#admin/<tab>` + `washSolar`/`addCust` aliases + `popstate`/`hashchange` + `localStorage.cwp_admin_active_tab`, and preserve `history.pushState` / `replaceState` behavior cleanly. Replace `getTopmostOpenModal()`'s hardcoded list with `window.CWP_ADMIN_V2.overlay` unified stack (`v2-overlay.js`) integrated with `pushModalHistory()`/`popModalHistory()`. |

---

### 2.2 Shell Migration Plan & Contract Preservation Checklist

To guarantee zero operational disruption during incremental migration:

1. **Preserve 100% of Entry URLs & Deep-Links:**
   - `/admin`, `/admin/*`, `/?admin=`, `/admin?tab=<tabName>`, `/admin#admin/<tabName>`, and aliases `?tab=washSolar` (`-> specialJobs`) and `?tab=addCust` (`-> records` + open `#addCustomerModal`) MUST resolve identically in V2 (`v2-shell.js`).
   - Direct URL entry while unauthenticated MUST display the Admin Auth Gate (`M-AUTH`), preserve the requested `?tab=` / `#admin/<tab>` target, and land directly on that tab immediately after `verifyAdminPassword` succeeds (`app.js:2722–2723`).
2. **Preserve Browser Back/Forward & Modal History Stack:**
   - Retain `_modalHistoryStack` / `pushModalHistory()` / `popModalHistory()` (`app.js:1438–1467`) inside `v2-overlay.js` so Android hardware Back and desktop browser Back close the topmost open modal/drawer first without navigating away from `/admin`, and nested modals (e.g., `#editCustomerModal` -> `#cwpPhotoCropperModal` or `#sellPackageModal`) pop in LIFO order.
   - Maintain `popstate` fallback to `switchAdminTab(urlParams.get('tab') || 'records', false)` and `hashchange` `#admin/<tab>` listener (`app.js:5712–5727`).
3. **Preserve Auth, Session Persistence & 401 Lockout:**
   - Support both `sessionStorage` (`cwp_admin_token`, `cwp_admin_auth`) and `localStorage` (only when `#rememberAdminDevice` is checked — fixing `v2-auth.js:30–40` which currently forces `localStorage`).
   - Preserve mid-session `401`/`403` global handler (`handleUnauthorizedResponse` `app.js:5827–5856`), clearing tokens, stopping SSE/pollers, and locking the shell back to `#adminAuthGate`.
   - Enforce `logoutAdmin` (`server.js:2722`) server-side token revocation with 1,200ms failsafe timeout (`app.js:2584`) instead of `v2-auth.js:96–99`'s client-only `localStorage.removeItem`.
4. **Preserve Staff PWA Isolation (`/staff`):**
   - `sw.js` (`PRECACHE_ASSETS` `L14–40`) caches `/staff`, `/css/style.css`, `/css/m3-tokens.css`, `/css/staff-m3.css`, `/js/app.js`, `/fonts/material-symbols-outlined.woff2`. Do **not** alter `/staff` asset paths, Staff DOM IDs, or shared modal contracts (`#imageModal`, `#addressViewModal`, `#logoutConfirmModal`) in a way that breaks Staff mode.
5. **Preserve Module Entry Points & DOM Contracts:**
   - Keep all 10 canonical `ADMIN_VALID_TABS` keys (`dashboard`, `cleanReports`, `specialJobs`, `jobAssignment`, `staffTracking`, `sequence`, `records`, `serviceAssign`, `leads`, `staff`) and functional DOM IDs verified by `tests/test_dom_contract_reconciliation_qa.js` until test assertions are explicitly migrated in Phase 9.

---

## 3. Phases F & G — Phased Implementation Roadmap (Phases 0–9)

### 3.1 Master Phase Overview (Aligned with M1–M3)

| Phase | Phase Name (Aligned with M1) | Agent Task ID | Task IDs | Canonical Modules | Primary Objective | Risk |
|---|---|---|---|---|---|---|
| **0** | Foundation & Hardening Prerequisites | **AGENT TASK 09** | `T09-01` .. `T09-10` | `M-AUTH`, `M-SHELL`, `M-CUSTOMERS`, `M-SPECIAL-JOBS`, `M-LEADS`, `M-UNWIRED-BACKEND` | Fix security/API blockers, extract mock-free Aura factories, add responsive CSS, self-host fonts + `Noto Sans Devanagari`, bridge `v2-overlay.js`. | Medium |
| **1** | Admin Shell, Auth Gate & Shared Overlays | **AGENT TASK 10** | `T10-01` .. `T10-06` | `M-AUTH`, `M-SHELL`, `M-HIDDEN-SUPPRESSED` | Live Aura Shell (`/admin-v2` shadow mode), accessible login gate (`A11Y-01`), dark navy sidebar + 10 nav tabs, `?tab=`/`#admin/` router, SSE pill/toast stack, profile menu + password relocation. | High |
| **2** | Operations Dashboard & Daily Clean Reports | **AGENT TASK 11** | `T11-01` .. `T11-05` | `M-DASH`, `M-CLEAN-REPORTS`, `M-HIDDEN-SUPPRESSED` | Migrate `#adminOpsDashboardHub` + 3 SVG charts + Crew Pulse; migrate Daily Cleaning Status to Task 07 grid + Task 06 filter bar + lightbox/edit/delete modals + 200-cap reconciliation. | High |
| **3** | Customer Directory, Onboarding & Edit Modals | **AGENT TASK 12** | `T12-01` .. `T12-06` | `M-CUSTOMERS`, `M-HIDDEN-SUPPRESSED` | Migrate Customer Directory Task 07 grid + bilingual search + 500-cap handling, 4-step Onboarding Wizard (`.cwp-v2-stepper`), 6-tab Edit Modal (`FRM-01`/`FRM-03` fixes), nested Cropper.js, `handleBackfillHindi` fix. | High |
| **4** | Service Assignment, Packages, Bookings & DCC Lifecycle | **AGENT TASK 13** | `T13-01` .. `T13-05` | `M-SERVICE-ASSIGN`, `M-CUSTOMERS`, `M-UNWIRED-BACKEND` | Migrate `M-SERVICE-ASSIGN` (fix `openAssignServiceModal(0)` + replace `prompt()`), Packages & Bookings nested modals, and wire `M-UNWIRED-BACKEND` DCC lifecycle (`getCustomerDccDetails`/`renew`/`stop`/`cancel`). | Medium–High |
| **5** | Dispatch, Job Assignment & Wash & Solar Hub | **AGENT TASK 14** | `T14-01` .. `T14-05` | `M-JOB-ASSIGN`, `M-SPECIAL-JOBS` | Migrate DCC & On-Demand Dispatch (`M-JOB-ASSIGN`), consolidate `M-SPECIAL-JOBS` 520px triple-filter bar, migrate 10-col Task 07 grid & modals (with `LEFT JOIN` + audit fixes from Phase 0), exclude `M-LEGACY-ORPHANS`. | High |
| **6** | Leads Pipeline & Staff Live Tracking | **AGENT TASK 15** | `T15-01` .. `T15-05` | `M-LEADS`, `M-STAFF-TRACKING` | Migrate Leads Table (Task 07) & Kanban DnD (strip emojis, wire `LEAD_CHANGED` SSE), wrap `TrackingMapAdapter`, migrate `#trackingStoppagesDrawer` to Aura drawer (`role="dialog"`). | Medium |
| **7** | DCC Route Management, Stop Sequence & Reconciliation | **AGENT TASK 16** | `T16-01` .. `T16-06` | `M-ROUTE-PLAN`, `M-UNWIRED-BACKEND` | Align Routes Hub, Detail (`CMP-09` `.cwp-v2-sequence-item`), Unassigned Workbench (`.cwp-v2-bulk-bar` + partial-failure summary), Legacy Sequence (emoji strip), 7 `rm*` + `#seqResetModal` overlays, wire `getDailyRouteReconciliation`. | High |
| **8** | Staff Roster, Capabilities, Designations & Hierarchy | **AGENT TASK 17** | `T17-01` .. `T17-05` | `M-STAFF`, `M-UNWIRED-BACKEND` | Migrate Staff Roster cards & modals, fix `handleEditStaffSubmit` button lock, 5 KYC dropzones, capability conflict & BFS hierarchy modals, wire `resetStaffPin` modal. | High |
| **9** | E2E Verification, Audit/CMS Decisions, Cleanup & Cutover | **AGENT TASK 18** | `T18-01` .. `T18-06` | `M-UNWIRED-BACKEND`, `M-LEGACY-ORPHANS`, `M-HIDDEN-SUPPRESSED`, All | Wire or scope `getAuditLogs`/Homepage CMS/Careers Inbox, remove `M-LEGACY-ORPHANS` (`app.js:4746–5606`), run 18-area regression + Devanagari/A11y + SSE soak, execute `/admin` cutover. | High |

---

### 3.2 Detailed Phase-by-Phase Blueprint (Phases 0–9)

#### Phase 0 — Foundation & Hardening Prerequisites (**AGENT TASK 09**)

- **Canonical Modules:** `M-AUTH`, `M-SHELL`, `M-CUSTOMERS`, `M-SPECIAL-JOBS`, `M-LEADS`, `M-UNWIRED-BACKEND`
- **Task IDs & Exact Scope:**
  - **`T09-01` — Critical Backend Security Remediations (`server.js`):**
    1. Add `'backfillHindi'` to `adminProtectedActions` (`server.js:3038–3109`) so unauthenticated callers receive `401` (`M2 §4 #15`).
    2. Route `updateAdminPassword` (`server.js:4143–4182`) through `authService.updateAdminPassword` (`services/authService.js:403–429`) enforcing `min 6 chars`, `currentPassword` verification, and active session revocation (`M2 §4 #16`).
    3. Remove `NODE_ENV === 'test'` auth bypasses on `GET /api/customers` (`server.js:2199`), `GET /api/leads` (`2223`), and `GET /api/admin/job-applications` (`2384`) (`M2 §4 #22`).
    4. Reconcile duplicate `019_` migration prefix (`019_add_device_id_to_auth_sessions.sql` vs `019_enhance_dcc_core_operations.sql`) in `migrations/migrate.js:85–95` (`M2 §3.3`).
  - **`T09-02` — Backend Data Visibility & Audit Integrity Fixes (`server.js`, `services/`, `db/repositories/`):**
    1. Fix `cancelSpecialJob` (`server.js:6593–6600`) to pass `{ entityType, entityId, beforeState, afterState }` to `repos.auditLogs.logChange` (`M2 §4 #17`).
    2. Change `INNER JOIN public.service_locations` to `LEFT JOIN` in `db/repositories/serviceJobsRepo.js:54` and `services/adminService.js:2847` (`M2 §4 #18`).
    3. Resolve `toggleCustomerActive` (`API GAP — REQUIRES INVESTIGATION`, `server.js:3050` stub vs `customersRepo.toggleActive` `L300–310`): either wire handler + `audit_logs` + `CUSTOMERS_CHANGED` or remove dead stub (`M2 §4 #1`).
    4. Emit `LEAD_CHANGED` (or `CUSTOMERS_CHANGED`) via `broadcastAdminRealtimeEvent` on `saveLead`, `updateLead`, `updateLeadStage`, `addLeadNote`, `convertLead`, `deleteLead` (`M2 §4 #14`).
  - **`T09-03` — Fix `v2-auth.js` Session Verification & Storage Parity (`public/admin-v2/js/v2-auth.js`):**
    - Replace `getStaffList` call in `checkSession()` (`v2-auth.js:42–68`) with an `adminProtectedActions` endpoint (or new `verifyAdminSession` read-only action), add `rememberDevice` (`sessionStorage`-only when false), and call `logoutAdmin` on `logout()`.
  - **`T09-04` — Self-Hosted Fonts & Devanagari Typography (`public/admin-v2/index.html`, `v2-tokens.css`, `v2-base.css`):**
    - Remove `https://fonts.googleapis.com` links (`public/admin-v2/index.html:10–12`), load self-hosted `/fonts/material-symbols-outlined.woff2` + self-hosted Latin (`Inter`/`Poppins`), `Noto Sans Devanagari`, and `JetBrains Mono` WOFF2 assets (`docs/design-system/01 §7`).
    - Update `--cwp-v2-font-sans` (`v2-tokens.css:112`) to include `'Noto Sans Devanagari'` and enforce `line-height: 1.5` (`DDR-002`) on bilingual inputs, badges, and table cells (`v2-base.css:14`).
  - **`T09-05` — Responsive Layout & Collapsed Rail CSS (`public/admin-v2/css/v2-layout.css`, `v2-components.css`):**
    - Implement `.is-collapsed` `68px` rail using `--cwp-v2-sidebar-width-collapsed` (`v2-tokens.css:92`) and add `@media` rules for `<600px` (Compact), `600–1023px` (Medium slide-over drawer + backdrop), and `>=1024px` (Expanded) per `docs/design-system/06 §1`.
  - **`T09-06` — Extract Mock-Free Task 06 & Task 07 Reusable Factories (`public/admin-v2/js/`):**
    - Extract `bindSelectionPlayground()` and `bindTableDataGridPlayground()` from `v2-playground.js` (`L1094–4280`) into clean, parameterized Vanilla JS factories (`v2-selection.js`: `createAuraDropdown`, `createAuraFilterBar`, `createAuraDateRange`; `v2-datagrid.js`: `createAuraDataGrid`) with **zero** mock arrays (`MOCK_OPERATIONS`, `TASK06_OPERATIONS`, `TASK07_OPERATIONS_DATASET` stay strictly in `v2-playground.js` for `/admin-v2/ui-lab`).
  - **`T09-07` — Build Missing Core Aura Primitives (`v2-components.css`, `v2-toast.js`):**
    - Implement reusable CSS/JS primitives identified in `M3 §4`: `.cwp-v2-toast-container` + `.cwp-v2-toast` (supporting partial-failure summaries), `.cwp-v2-sync-popover`, `.cwp-v2-tabs` (`role="tablist"`), `.cwp-v2-stepper`, clickable `.cwp-v2-kpi-card.is-clickable`, `.cwp-v2-intel-card`, `.cwp-v2-license-plate` (`CMP-03`), `.cwp-v2-indic-field` (`DDR-002`), `.cwp-v2-sequence-item` (`CMP-09`), and `.cwp-v2-lightbox`.
  - **`T09-08` — Unified Overlay & History Stack Bridge (`public/admin-v2/js/v2-overlay.js`):**
    - Integrate `pushModalHistory()` / `popModalHistory()` and `popstate` compatibility into `window.CWP_ADMIN_V2.overlay`, eliminating `getTopmostOpenModal()`'s brittle hardcoded 22-ID array (`app.js:1369–1418`).
  - **`T09-09` — Server List Pagination / `totalCount` Contract Strategy (`API GAP — REQUIRES INVESTIGATION`):**
    - Decide and implement additive `{ page, pageSize, sortBy, sortDir, totalCount }` (or dedicated `getDashboardSummary` KPI query) on `getAllCustomers` (`500`), `getLeads` (`500`), `getDailyCleanReports` (`200`), `getSpecialJobs` (`200`), and `getAuditLogs` (`100`) while keeping default response backwards-compatible for V1 callers (`M2 §4 #9, #12`).
  - **`T09-10` — Isolation & Baseline Regression Verification:**
    - Run `npm test` (56 tests) and `scripts/verify_admin_v2_isolation.js` to prove zero regression to V1 `/admin`, `/staff` PWA, or `/home`.
- **Dependencies:** None (entry prerequisite phase).
- **Specific Risks & Mitigations:**
  - *Risk:* Changing `updateAdminPassword` to require `currentPassword` breaks existing V1 inline staff-tab form (`Index.html:920–925`) if shipped before Phase 1. *Mitigation:* Support optional `currentPassword` fallback strictly when called from legacy V1 or update V1 form simultaneously if required, enforcing `currentPassword` in Aura Security modal.
  - *Risk:* Adding `page`/`limit`/`totalCount` alters raw array return shape expected by V1 `getAllCustomers` (`app.js` expects `[...]` array). *Mitigation:* Only return `{ records, totalCount }` when `payload.paginated === true` (opt-in flag for V2), keeping default raw array for V1 callers.
- **Concrete Acceptance Criteria:**
  1. `POST /api { action: 'backfillHindi' }` without valid `adm_` token returns HTTP `401`.
  2. `v2-auth.js` `checkSession()` returns `{ valid: false }` for unauthenticated/staff/expired tokens.
  3. `/admin-v2` loads with **zero** network requests to `fonts.googleapis.com` or `fonts.gstatic.com`, renders `Noto Sans Devanagari` at `line-height: 1.5`, and passes responsive layout checks at `360px`, `768px`, `1024px`, and `1440px` without horizontal page overflow.
  4. `createAuraDataGrid` and `createAuraFilterBar` instantiate cleanly with live API data and zero references to `MOCK_*` or `TASK06/07_*` datasets.
  5. All 56 `npm test` scripts and `scripts/verify_admin_v2_isolation.js` pass.
- **Evidence & Rationale for Sequence:** Security holes (`backfillHindi`, `v2-auth.js`, `updateAdminPassword`), data-loss/audit bugs (`serviceJobsRepo` `INNER JOIN`, `cancelSpecialJob`), self-hosted Devanagari typography, responsive layout CSS, and mock-free reusable JS factories are foundational blockers for every single module (Phases 1–8). Fixing them first eliminates repeated rework and ensures `AGENT TASK 09` lands a clean, production-safe toolkit.

---

#### Phase 1 — Admin Shell, Enterprise Auth Gate & Shared Overlays (**AGENT TASK 10**)

- **Canonical Modules:** `M-AUTH`, `M-SHELL`, `M-HIDDEN-SUPPRESSED` (shell badges & `#accountDropdownWrap`)
- **Task IDs & Exact Scope:**
  - **`T10-01` — Accessible Enterprise Auth Gate (`M-AUTH`, fixes `A11Y-01`):**
    - Replace/remediate `#adminAuthGate` (`Index.html:450–538`) in Aura V2 using Task 02 password input (`#adminPasswordInput`), eye toggle, `#rememberAdminDevice` checkbox, `#btnAdminLogin`, `#adminAuthError` (`.cwp-v2-form-alert`), and `429` cooldown feedback. Ensure immediate keyboard focus on `#adminPasswordInput` without requiring canvas click, while respecting `prefers-reduced-motion` if subtle brand canvas is kept. Preserve `initAdminAutoLogin()` (optional/configurable) and `verifyAdminPassword`.
  - **`T10-02` — Dark Navy Sidebar & 10-Module Navigation (`M-SHELL`):**
    - Wire `.cwp-v2-sidebar` (`#0b1a2b`, `250px` / `68px` `.is-collapsed` rail persisted in `localStorage.cwp_admin_sidebar_collapsed`) with **OPERATIONS** (`Dashboard`, `Daily Cleaning Status`, `Other Cleaning Status`, `Assign Jobs`, `Track Staff`, `DCC Route Plan`) and **MANAGEMENT** (`Customers`, `Assign Booking`, `Leads`, `Staff`) + `#sidebarAdminLogoutBtn` (`M1 §3.2`). Restore truthful `.cwp-v2-nav-badge` counts (lifting `style.css:15774–15778` suppression inside V2).
  - **`T10-03` — Contextual Header, SSE Sync Popover & EN/HI Switcher:**
    - Wire `.cwp-v2-header` dynamic `#v2HeaderTitle` & `#v2HeaderSubtitle` (`v2-shell.js`), `.cwp-v2-live-status-pill` + `.cwp-v2-sync-popover` connected to `EventSource('/api/admin-realtime-stream')` and 15s `startAdminRealtimePulse()`, and Task 06 `.cwp-v2-dropdown` for EN/HI language toggle (`selectAppLanguage`), replacing all 4 inline SVGs and 5 emojis in `Index.html:61–150`.
  - **`T10-04` — Account Profile Popover, Change Admin Password & Logout Modal:**
    - Unify `#accountDropdownWrap` in the Aura header (`Administrator`), relocate Change Admin Password (`#newAdminPasswordInput`) out of `#adminTabStaff` (`Index.html:920–925`) into an Aura Security modal backed by `T09-01`'s `authService.updateAdminPassword` (`currentPassword` + `newPassword`), and migrate `#logoutConfirmModal` (`Index.html:1998`) to `v2-overlay.js` `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` (preserving `/staff` compatibility).
  - **`T10-05` — URL Router & Browser History Parity (`v2-shell.js`):**
    - Port `getSavedAdminTab()`, `?tab=` + `#admin/<tab>` sync, `washSolar`/`addCust` aliases, `popstate` (closing topmost `v2-overlay.js` dialog before tab fallback), and `hashchange` handling (`app.js:2668–2691, 3076–3089, 5694–5727`).
  - **`T10-06` — Shared Overlays & Toast Stack (`#imageModal`, `#addressViewModal`, `#toastNotification`):**
    - Migrate `#imageModal` (`Index.html:1922`) -> `.cwp-v2-lightbox` and `#addressViewModal` (`L1943`) -> `v2-overlay.js` `.cwp-v2-modal-md` with Material Symbols, and deploy `.cwp-v2-toast-container` (`aria-live="polite"`) preserving `showToast()`.
- **Dependencies:** Phase 0 (`T09-01`, `T09-03`..`T09-08`).
- **Specific Risks & Mitigations:**
  - *Risk:* `cwp-neural-core.js` / `#adminAuthGate` tests (`test_cwp_admin_neural_login_qa.js`) or DOM contract tests fail if V1 DOM is mutated prematurely. *Mitigation:* Build live Aura V2 shell inside `/admin-v2` shadow route (`public/admin-v2/`) first (Section 4), keeping V1 `Index.html` untouched until Phase 9 cutover.
  - *Risk:* `localStorage` vs `sessionStorage` mismatch logs out users or breaks `401` lockout. *Mitigation:* Replicate `getAdminToken()`, `clearAdminTokens()`, and `handleUnauthorizedResponse()` semantics (`app.js:2640–2665, 5827–5856`).
- **Concrete Acceptance Criteria:**
  1. Unauthenticated access to `/admin-v2?tab=leads` prompts keyboard-accessible login (`Tab` reaches password field immediately), authenticates via `verifyAdminPassword`, and lands directly on `leads`.
  2. Sidebar collapses (`250px` <-> `68px`), persists across reload, and converts to slide-over drawer at `375px` and `768px`.
  3. Browser Back closes open `v2-overlay.js` modals in LIFO order before changing tabs; `401` response locks shell and stops SSE/timers.
  4. Zero emojis and zero non-chart inline SVGs exist in the Admin Shell chrome.
- **Evidence & Rationale for Sequence:** Shell, Auth, Router, SSE, and Shared Overlays form the execution frame for all 10 modules. Landing this in Phase 1 enables incremental, module-by-module live migration inside `/admin-v2` without touching production `/admin` or `/staff`.

---

#### Phase 2 — Operations Dashboard & Daily Clean Reports (**AGENT TASK 11**)

- **Canonical Modules:** `M-DASH`, `M-CLEAN-REPORTS`, `M-HIDDEN-SUPPRESSED` (`.reports-kpi-grid`)
- **Task IDs & Exact Scope:**
  - **`T11-01` — Operations Hub Strip & KPI Cards (`M-DASH`):**
    - Migrate `#adminOpsDashboardHub` (`Index.html:1114–1197`) into Aura `.cwp-v2-card`, 4 clickable `.cwp-v2-kpi-card` tiles (`Daily Cleans Today` -> `cleanReports`, `Wash & Solar Tasks` -> `specialJobs`, `Field Crew Active` -> `staff`, `Latest Activity` -> `cleanReports`), 3 `.cwp-v2-intel-card`s, `#reportsLiveSyncPill`, `Refresh All`, `Export CSV`, and `Print`. Decouple dashboard aggregation from hidden `.reports-kpi-grid` (`Index.html:1256`).
  - **`T11-02` — Dashboard SVG Charts & Crew Pulse Strip (`M-DASH`):**
    - Wrap `#dashCleanProgressSvg`, `#dashStaffBarSvg`, `#dashWashSolarSvg` (`app.js:3505–3645`) in `.cwp-v2-card` containers with `--cwp-v2-*` palette colors, and migrate `#dashboardCrewPulseStrip` (`app.js:3647–3703`) to `.cwp-v2-card` + Material Symbols (zero emojis).
  - **`T11-03` — Daily Cleaning Status Filter Bar & Task 07 Data Grid (`M-CLEAN-REPORTS`):**
    - Replace `.reports-filter-panel` with Task 06 `.cwp-v2-filter-bar` + `.cwp-v2-date-range-group` (Today / Yesterday / 7 Days / Month / Custom) + searchable Staff & Route (`getAllRoutes`) dropdowns + Photo/Exception filter + debounced search (`350ms`, pauses 15s auto-sync while typing).
    - Replace 9-column table (`Index.html:1315`, adding explicit table `id`) with Task 07 `createAuraDataGrid` (`.is-comfortable` `46px` for photo proof thumbnails + bilingual `line-height: 1.5`, sticky header, `.is-sticky-action`, `.cwp-v2-license-plate` `CMP-03`, server pagination or explicit `200`-row cap warning per `T09-09`). Keep direct row WhatsApp share disabled (`app.js:20097`).
  - **`T11-04` — Photo Lightbox, Edit Status & Delete Report Modals (`M-CLEAN-REPORTS`):**
    - Migrate `#reportPhotoLightboxModal` (`Index.html:1729`) to `.cwp-v2-lightbox` (Download, Full Size, Edit Status, Delete; keeping `#btnLightboxSendWhatsApp` hidden for Admin), `#editCleanReportModal` (`L1784`) to `v2-overlay.js` `.cwp-v2-modal-md` + `.cwp-v2-choice-group` (`completed`/`car_not_present`), and `#deleteCleanReportModal` (`L1845`) to `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` (preserving Hindi quick-reason chips, mandatory `reason` validation, input preservation on error, and `DAILY_CLEAN_CHANGED` SSE).
  - **`T11-05` — Exports & Real-Time SSE Verification:**
    - Verify `exportDailyCleanReportsCSV()`, `printDailyCleanReports()`, 15s auto-sync pause-on-type, and SSE `DAILY_CLEAN_CHANGED` live row + KPI updates.
- **Dependencies:** Phase 1 (`M-SHELL`, `M-AUTH`), `T09-06` (`createAuraDataGrid`, `createAuraFilterBar`), `T09-09` (200-cap reconciliation).
- **Specific Risks & Mitigations:**
  - *Risk:* Removing hidden `.reports-kpi-grid` breaks `updateOperationsDashboardKPIs()` (`app.js:3133+`). *Mitigation:* Feed `M-DASH` directly from `getDailyCleanReports` `summary` object (`M2 §2.4`) and `getDashboardSummary` (if added in `T09-09`) before removing hidden DOM bridges.
  - *Risk:* SSE `DAILY_CLEAN_CHANGED` re-render disrupts open photo lightbox or edit modal. *Mitigation:* Refresh table data behind open `v2-overlay.js` modal without closing or resetting active modal inputs.
- **Concrete Acceptance Criteria:**
  1. Dashboard KPIs, 3 SVG charts, and Crew Pulse render accurate live counts and drill down to `cleanReports` / `specialJobs` / `staff`.
  2. Daily Cleaning Status filters, photo lightbox, status override (`completed` <-> `car_not_present`), and delete (with mandatory reason) persist to `service_logs` + `audit_logs` and broadcast `DAILY_CLEAN_CHANGED`.
  3. Zero emojis (`✏️`, `✓`, `🚫`, `⚡`, `🗑️`, `⚠️`, `📸`, `🟡`, `🔴`) remain in HTML or JS templates.
- **Evidence & Rationale for Sequence:** `M-DASH` and `M-CLEAN-REPORTS` are high-visibility daily supervisor workflows with read-heavy analytics and well-bounded write surfaces (only status override & delete). Migrating them immediately after the shell validates Task 06, Task 07, SSE sync, and Lightbox overlays early before tackling the complex Customer & Route engines.

---

#### Phase 3 — Customer Directory, Onboarding & Edit Modals (**AGENT TASK 12**)

- **Canonical Modules:** `M-CUSTOMERS` (Core Directory, Add Wizard, Edit Tabs `profile`/`locations`/`service`/`dispatch`, Delete), `M-HIDDEN-SUPPRESSED` (`#btnAdminBackfillHindi`, `.cwp-seg-nav`, `#filterAdminCategory`, `#filterAdminStaff`)
- **Task IDs & Exact Scope:**
  - **`T12-01` — Customer Directory Grid & Bilingual Filter Bar (`M-CUSTOMERS`):**
    - Replace `.cwp-search-toolbar` (`Index.html:975`) with Task 06 `.cwp-v2-filter-bar` preserving `recordMatchesBilingualSearch()`, `/` keyboard shortcut, Status filter (`all`/`yes`/`no`), and Photo/GPS filter chips. Decommission hidden `.cwp-seg-nav` (`L958`), `#filterAdminCategory` (`L981`), and `#filterAdminStaff` (`L990`).
    - Upgrade 10-col `#adminRecordsTable` (`Index.html:1022`) to Task 07 `createAuraDataGrid` (`.is-compact` `34px` with `min-height` & `Noto Sans Devanagari` `line-height: 1.5`, sticky header, `.is-sticky-action`, `.cwp-v2-table-overflow-menu` for `⋮`, `.cwp-v2-license-plate` `CMP-03`, and pagination `25/50/100/All` reconciled against `500`-row cap via `T09-09`).
  - **`T12-02` — 4-Step Customer Onboarding Wizard (`#addCustomerModal`):**
    - Migrate `#addCustomerModal` (`Index.html:2038–2279`) onto `v2-overlay.js` `.cwp-v2-modal-lg` + `.cwp-v2-stepper` (`1 Profile & Contact` -> `2 Addresses & GPS` -> `3 Service & Vehicles` -> `4 Cleaner Dispatch`), `.cwp-v2-indic-field` (live `/api/indic/transliterate`), multi-location GPS cards, multi-vehicle (`Aaj`/`Kal`, HSRP, Make/Color, 5/5+ Seater) / Solar config, `#custIsLeadCheck`, and `cwp_add_customer_draft_v1` `localStorage` draft restore/discard.
  - **`T12-03` — 6-Tab Customer Edit Modal (`#editCustomerModal`, fixes `FRM-01` & `FRM-03`):**
    - Migrate `#editCustomerModal` (`Index.html:2280–2577`) onto `v2-overlay.js` `.cwp-v2-modal-lg` + `.cwp-v2-tabs` (wrapping/clean WAI-ARIA tablist eliminating horizontal scrollbar **`FRM-01`**).
    - Move `Delete Customer` out of the `Save Changes` footer (`L2567`) into a dedicated Danger Zone inside the Profile tab (**`FRM-03`**) backed by a nested `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` confirmation calling `deleteCustomer`. Preserve edit auto-draft (`initEditCustomerAutoDraft`).
  - **`T12-04` — Nested Cropper.js Modal (`#cwpPhotoCropperModal`):**
    - Wrap `#cwpPhotoCropperModal` (`Index.html:3114–3190`) in `v2-overlay.js` `.cwp-v2-modal-lg.is-nested` (`z-index: 1250`), keeping `public/js/cropper.min.js` (`rotate`, `flip`, `aspectRatio`, `zoom`, `straighten`) 100% intact and replacing 8 emojis (`✂️`, `📐`, `🔁`, `🖐️`, `🔍+`, `🔍-`, `✓`) with Material Symbols.
  - **`T12-05` — Fix & Surface/Decide `handleBackfillHindi()` (`#btnAdminBackfillHindi`):**
    - Fix `handleBackfillHindi()` (`app.js:1728–1753`) by adding `onFailure` to re-enable `#btnAdminBackfillHindi`, replacing `confirm()` with `.cwp-v2-consequence-box`, and wiring only after `T09-01` secures `backfillHindi` behind `adminProtectedActions`.
  - **`T12-06` — CSV Export & `CUSTOMERS_CHANGED` SSE Continuity:**
    - Verify `exportAdminRecordsCSV()` and SSE `CUSTOMERS_CHANGED` refreshes preserve pagination page, search query, and open row state.
- **Dependencies:** Phase 1 (`M-SHELL`), Phase 0 (`T09-01`, `T09-04`, `T09-06`..`T09-09`).
- **Specific Risks & Mitigations:**
  - *Risk:* `updateCustomer` overwrites child `service_locations`, `vehicles`, or `subscriptions` if multi-card form state desyncs (`M1 §3.9`). *Mitigation:* Preserve exact DOM serialization contract and payload shape of `handleEditCustomerSubmit()`, verified via existing customer edit tests + neon integration tests.
  - *Risk:* Devanagari matra clipping in `34px` compact rows (`M3 RISK-03`). *Mitigation:* Enforce `Noto Sans Devanagari`, `line-height: 1.5`, `min-height: 34px`, and `4px` vertical cell padding.
- **Concrete Acceptance Criteria:**
  1. Bilingual search matches both Latin (`"Rahul"`) and Devanagari (`"राहुल"`) customer records without layout clipping.
  2. `#editCustomerModal` displays all 6 tabs at `1024px` and `1280px` with zero horizontal tab scrollbar (`FRM-01`), and `Delete Customer` is separated from `Save Changes` with confirmation (`FRM-03`).
  3. `#cwpPhotoCropperModal` opens nested over `#addCustomerModal` / `#editCustomerModal`, crops/rotates, and restores focus to trigger on close.
  4. `handleBackfillHindi` re-enables button on simulated `500` error and rejects unauthenticated requests (`401`).
- **Evidence & Rationale for Sequence:** `M-CUSTOMERS` is the central master data store (`state.adminRecords`) upon which `M-SERVICE-ASSIGN`, `M-JOB-ASSIGN`, `M-ROUTE-PLAN`, and `M-LEADS` (conversion) depend. Migrating Customer Core + Add/Edit before Service/Packages/Dispatch ensures every downstream workflow inherits clean customer data and modals.

---

#### Phase 4 — Service Assignment, Prepaid Packages, Bookings & DCC Lifecycle (**AGENT TASK 13**)

- **Canonical Modules:** `M-SERVICE-ASSIGN`, `M-CUSTOMERS` (`Packages` & `Bookings` sub-tabs + modals), `M-UNWIRED-BACKEND` (DCC subscription lifecycle)
- **Task IDs & Exact Scope:**
  - **`T13-01` — Service & Asset Assignment Console (`M-SERVICE-ASSIGN`, fixes `openAssignServiceModal(0)`):**
    - Replace 5-tab `.cwp-seg-nav` (`Index.html:1067–1083`, stripping `🚗`, `🧼`, `☀️`, `⚠️` emojis) with `.cwp-v2-tabs`, `#serviceAssignSearch` with Task 06 search bar, and 7-col `#serviceAssignTable` with Task 07 `createAuraDataGrid` + `.cwp-v2-license-plate`.
    - Fix `Index.html:1060` `openAssignServiceModal(0)` defect: when launched from header `+ Assign Service`, render a searchable Aura customer selector (`createAuraDropdown` backed by `state.adminRecords`) inside `#assignServiceModal` instead of silently selecting `state.adminRecords[0]`.
  - **`T13-02` — `#assignServiceModal` & Aura `Stop Service` Dialog:**
    - Migrate `#assignServiceModal` (`Index.html:2578–2718`) to `v2-overlay.js` `.cwp-v2-modal-md` + Task 05 form controls. Replace browser `prompt()` in `handleStopServiceClickFromModal()` (`app.js:13870–13897`) with a nested `.cwp-v2-modal-sm` + `.cwp-v2-consequence-box` + required reason textarea calling `stopCustomerService`.
  - **`T13-03` — Customer Prepaid Packages Modals (`M-CUSTOMERS`):**
    - Migrate `#editCustomerModal` `Packages` sub-tab (`loadCustomerPackagesForEditModal`) and nested modals `#sellPackageModal` (`L3924`), `#redeemPackageModal` (`L4008`), `#packageHistoryModal` (`L4067`, Task 07 compact grid) onto `v2-overlay.js` `.is-nested` (`z-index: 1250`), preserving `FOR UPDATE` balance/expiry error handling and replacing `confirm()` on `cancelCustomerPackage` with `.cwp-v2-consequence-box`.
  - **`T13-04` — Customer Service Bookings & Lifecycle Actions (`M-CUSTOMERS`):**
    - Migrate `#editCustomerModal` `Bookings` sub-tab (`getCustomerServiceJobs`) and `#createBookingModal` (`L4090`, `getEligiblePackagesForBooking`, `createServiceBooking`) onto `v2-overlay.js` `.is-nested`. Wire inline booking lifecycle actions (`startSpecialJob`, `completeSpecialJob`, `cancelSpecialJob`, `failServiceJob`) with Aura confirmation & reason modals.
  - **`T13-05` — Wire `M-UNWIRED-BACKEND` Transactional DCC Subscription Lifecycle (`API GAP — REQUIRES INVESTIGATION`):**
    - Inside `#editCustomerModal` `Service` / `Cleaner & Route` panel, wire `getCustomerDccDetails` / `getCustomerDccSubscriptions` (`server.js:5839`) and expose `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription` (`server.js:5857–5923`) via Aura `.cwp-v2-consequence-box` dialogs (`dccService.js`).
- **Dependencies:** Phase 3 (`M-CUSTOMERS` core & `#editCustomerModal`), `T09-02` (`cancelSpecialJob` audit fix).
- **Specific Risks & Mitigations:**
  - *Risk:* Nested modals (`#editCustomerModal` -> `#sellPackageModal` / `#assignServiceModal` / `#createBookingModal`) lose focus or lock scroll on close. *Mitigation:* `v2-overlay.js` stack tracks `.is-nested` depth (`z: 1200/1250`) and restores focus to the triggering button inside `#editCustomerModal`.
  - *Risk:* Exposing `dccService` lifecycle alongside `assignCustomerService`/`stopCustomerService` creates state divergence. *Mitigation:* Confirm `dccService` updates the same `subscriptions` / `staff_assignments` tables and broadcasts `CUSTOMER_ASSIGNMENT_CHANGED`, reloading both Customer Edit and Assignment views.
- **Concrete Acceptance Criteria:**
  1. Clicking header `+ Assign Service` in `Assign Booking` opens an empty customer selector rather than silently loading customer index `0`.
  2. Clicking `Stop Service` opens an Aura confirmation dialog with required reason (zero `window.prompt()`).
  3. Selling, redeeming, viewing history, cancelling packages, and creating/cancelling bookings inside `#editCustomerModal` work end-to-end with zero nested focus-trap bugs and proper `audit_logs` entries.
- **Evidence & Rationale for Sequence:** Packages, Bookings, and Service/DCC assignments are sub-workflows anchored directly to `#editCustomerModal` and `state.adminRecords`. Completing them right after Phase 3 keeps the entire Customer + Subscription domain cohesive before moving to operational Dispatch.

---

#### Phase 5 — Dispatch, Job Assignment & Wash & Solar Hub (**AGENT TASK 14**)

- **Canonical Modules:** `M-JOB-ASSIGN`, `M-SPECIAL-JOBS` *(explicitly excludes `M-LEGACY-ORPHANS`)*
- **Task IDs & Exact Scope:**
  - **`T14-01` — Job Assignment Segmented Shell & DCC Allocation (`M-JOB-ASSIGN`):**
    - Migrate `#adminTabJobAssignment` (`Index.html:1433–1552`) segmented toggle (`Daily Clean Routes` / `On-Demand Jobs`) to `.cwp-v2-tabs`. Migrate `#dccAssignForm` to `.cwp-v2-card` + `.cwp-v2-form-grid-3` + Task 06 searchable customer/staff `.cwp-v2-dropdown`s + `#dccCustomerContextCard` preview. Keep `#dccUnassignedBanner` retired (`app.js:4246–4249`).
  - **`T14-02` — DCC Route Roster & On-Demand Dispatch Ledger (`M-JOB-ASSIGN`):**
    - Upgrade `#dccRouteRosterTable` (7 cols) and `#jobAssignmentsLedgerTable` (7 cols) to Task 07 `createAuraDataGrid` (`34px` compact, `.is-sticky-action`), preserving inline cleaner `<select>` (`handleDccInlineReassign`), `Unassign` (`handleDccUnassign` wrapped in `.cwp-v2-consequence-box`), and `#jobAssignForm` capability filtering (`handleJobAssignWorkTypeChange`).
    - **Exclude `M-LEGACY-ORPHANS`:** Do **not** port `app.js:4746–5606` (`renderUnifiedAssignmentsLedger`, `openUnifiedJobAssignModal`, `renderStaffWorkloadAndPerformance`) and remove the dead call at `app.js:4742`.
  - **`T14-03` — Wash & Solar Hub Consolidation (`M-SPECIAL-JOBS`):**
    - Migrate 4 clickable `.special-kpi-card`s to `.cwp-v2-kpi-card.is-clickable`.
    - Consolidate the 520px triple-stacked filter bars (`.special-period-bar` + `.special-category-chips-bar` + `.special-filter-toolbar`, `Index.html:1351–1411`) into Task 06 `.cwp-v2-filter-bar` (Search + Status + Period presets) + collapsible `.cwp-v2-filter-drawer` (Work-type category chips, Custom date range, Staff select) + `.cwp-v2-selection-summary-bar`.
  - **`T14-04` — Wash & Solar 10-Column Grid & Modals (`M-SPECIAL-JOBS`):**
    - Upgrade `#adminSpecialJobsTable` (`Index.html:1413`) to Task 07 `createAuraDataGrid` (`.is-comfortable` `46px`, sticky header, `.is-sticky-action`, `.cwp-v2-license-plate`, clickable `Unassigned` pill, Before/After photo buttons -> `.cwp-v2-lightbox`, timeline lag/duration badges, `Reassign`/`Cancel`/`Delete` actions, reconciled against `200`-row cap via `T09-09`).
    - Migrate `#assignSpecialJobModal` (`L3517–3652`) and `#reassignJobModal` (`L3653–3692`) to `v2-overlay.js` `.cwp-v2-modal-md` (preserving existing/new customer toggle, `datalist#tentativeTimePresets`, solar/car sizing, and `staffCapabilityService` filtering); replace `confirm()` on `deleteAdminSpecialJob` with `.cwp-v2-consequence-box`.
  - **`T14-05` — Cross-Portal Staff PWA Dispatch Verification:**
    - Verify `assignDailyCleanCustomer` / `unassignDailyCleanCustomer` (`CUSTOMER_ASSIGNMENT_CHANGED`) and `assignSpecialJob` / `reassignSpecialJob` / `deleteSpecialJob` (`SPECIAL_JOB_CHANGED`) update Staff PWA (`/staff`) data and chimes without regressions.
- **Dependencies:** Phase 3 (`state.adminRecords`), Phase 4 (booking/service catalog parity), `T09-02` (`serviceJobsRepo` `LEFT JOIN` fix + `cancelSpecialJob` audit fix).
- **Specific Risks & Mitigations:**
  - *Risk:* `M-JOB-ASSIGN` inline cleaner `<select>` (`handleDccInlineReassign`) loses focus or triggers unintended mutation during SSE table re-render. *Mitigation:* Lock row control during in-flight `assignDailyCleanCustomer` call and preserve row key across delegated `change` handler.
  - *Risk:* `M-SPECIAL-JOBS` filter drawer hides active filters from operators. *Mitigation:* Always render active secondary filter chips inside `.cwp-v2-selection-summary-bar` above the grid even when `.cwp-v2-filter-drawer` is collapsed.
- **Concrete Acceptance Criteria:**
  1. `M-SPECIAL-JOBS` filter area vertical footprint drops from triple-stacked bars to a single primary bar + collapsible secondary drawer with zero lost filter capabilities.
  2. Jobs with `location_id IS NULL` appear properly in `#adminSpecialJobsTable` (`T09-02` verified).
  3. DCC assignment/unassignment immediately reflects in `staff_assignments` and `staff_route_sequences` consumed by `/staff`, with zero references to `M-LEGACY-ORPHANS`.
- **Evidence & Rationale for Sequence:** Dispatch (`M-JOB-ASSIGN`) and Special Jobs (`M-SPECIAL-JOBS`) share `#reassignJobModal`, `assignSpecialJob`, and SSE `SPECIAL_JOB_CHANGED` / `CUSTOMER_ASSIGNMENT_CHANGED` streams. Grouping them in Phase 5 leverages Phase 3–4 customer/service foundations before tackling Route Management's multi-stop ordering engine.

---

#### Phase 6 — Leads Pipeline & Staff Live Tracking (**AGENT TASK 15**)

- **Canonical Modules:** `M-LEADS`, `M-STAFF-TRACKING`
- **Task IDs & Exact Scope:**
  - **`T15-01` — Leads Funnel, Filter Bar & Table View (`M-LEADS`):**
    - Migrate `#adminTabLeads` (`Index.html:645–684`) funnel cards to clickable `.cwp-v2-kpi-card`s, search/category chips to Task 06 `.cwp-v2-filter-bar`, `Table` vs `Pipeline` switcher to `.cwp-v2-tabs`, and dynamic 8-col Leads Table to Task 07 `createAuraDataGrid` (`34px` compact, prominent `Convert` primary/tonal CTA fixing `ACT-04`, `Notes` badge fixing `TBL-03`).
  - **`T15-02` — Leads Kanban Pipeline & Modals (`M-LEADS`):**
    - Build `.cwp-v2-kanban*` 4-column board preserving HTML5 Drag & Drop (`ondragstart`/`ondrop`), accessible `←`/`Next →` keyboard stage buttons, and optimistic `updateLeadStage` rollback on API failure.
    - Migrate `#addLeadModal` (`L3222`), `#convertLeadModal` (`L3398`), `#leadNoteModal` (`L3482`) to `v2-overlay.js` + `.cwp-v2-indic-field`, stripping all emojis (`🎯`, `✨`, `📥`, `📞`, `🌟`, `🚗`, `☀️`, `🧼`, `💬`, `📝`, `🚀`, `🏷️`) and inline SVGs. Wire `T09-02`'s `LEAD_CHANGED` SSE broadcast for cross-session sync.
  - **`T15-03` — Staff Live Tracking Shell, KPIs & Status List (`M-STAFF-TRACKING`):**
    - Migrate `#adminTabStaffTracking` (`Index.html:1553–1635`) KPI strip to `.cwp-v2-kpi-grid`, `#trackingLivePill` to `.cwp-v2-live-status-pill`, left staff filter pills (`All`/`Moving`/`Stopped`/`Idle`, replacing `🟢`/`🛑`/`⏳` emojis with Material Symbols `directions_run`, `stop_circle`, `hourglass_empty`), and `#trackingStaffListContainer` cards with `.cwp-v2-btn-sm` (`Center`, `Ping`, `Stops`), preserving `2.5s x 8` accelerated ping polling.
  - **`T15-04` — `TrackingMapAdapter` Frame & Accessible Stoppages Drawer (`M-STAFF-TRACKING`):**
    - Wrap `#staffTrackingMapCanvas` in `.cwp-v2-card` preserving `TrackingMapAdapter` (`Google Maps` -> `Leaflet/OSM` -> `SVG Radar` fallback + breadcrumbs + floating `.cwp-v2-btn-icon` controls) untouched.
    - Migrate `#trackingStoppagesDrawer` (`Index.html:1626–1635`) to `v2-overlay.js` `.cwp-v2-drawer-lg` with **`role="dialog"` and `aria-modal="true"`** (fixing missing A11Y attributes and `✕` emoji close) and upgrade `#stoppagesTableContainer` to Task 07 `createAuraDataGrid`.
  - **`T15-05` — Map Resize & Headless Browser Tracking Check:**
    - Verify `TrackingMapAdapter` resizes cleanly on sidebar collapse (`250px` <-> `68px`) and responsive drawer toggles, validated against `tests/test_staff_tracking_browser.js` logic.
- **Dependencies:** Phase 1 (`M-SHELL`), Phase 3 (`M-CUSTOMERS` for `convertLead` landing on `'records'` + Cropper/Indic), `T09-02` (`LEAD_CHANGED` SSE).
- **Specific Risks & Mitigations:**
  - *Risk:* Changing `.cwp-v2-workspace` scroll or sidebar collapse breaks Leaflet/Google Maps canvas dimensions (`0px` height). *Mitigation:* Enforce explicit `min-height` on `#staffTrackingMapCanvas` container and invoke `TrackingMapAdapter` resize hook after sidebar collapse transition.
  - *Risk:* `LEAD_CHANGED` SSE refreshes wipe an in-progress Kanban drag. *Mitigation:* Defer SSE re-render while `isDraggingLead === true`.
- **Concrete Acceptance Criteria:**
  1. Leads Table and Kanban DnD both support stage moves (`updateLeadStage` with rollback on `500`), notes (`addLeadNote`), conversion (`convertLead` -> `'records'`), and live cross-session updates via `LEAD_CHANGED`.
  2. `#trackingStoppagesDrawer` has `role="dialog" aria-modal="true"`, traps Tab focus, closes on `Escape`/Back, and renders stoppages dwell grid.
  3. Zero emojis remain in Leads or Staff Tracking UI.
- **Evidence & Rationale for Sequence:** `M-LEADS` and `M-STAFF-TRACKING` are moderately complex, self-contained operational surfaces (Kanban + Map adapter) that do not mutate route-stop ordering or staff capability matrices; placing them in Phase 6 keeps risk isolated ahead of the high-stakes Route (`Phase 7`) and Staff (`Phase 8`) engines.

---

#### Phase 7 — DCC Route Management, Stop Sequence & Route Reconciliation (**AGENT TASK 16**)

- **Canonical Modules:** `M-ROUTE-PLAN`, `M-UNWIRED-BACKEND` (`getDailyRouteReconciliation`)
- **Task IDs & Exact Scope:**
  - **`T16-01` — Routes Hub & KPI Alignment (`M-ROUTE-PLAN`):**
    - Align `.rm-nav-bar` (`Routes Hub`, `Unassigned Workbench`, `Staff Sequence View`) to `.cwp-v2-tabs`, `.rm-kpi-grid` (6 KPIs) to `.cwp-v2-kpi-grid`, `.rm-toolbar` to Task 06 `.cwp-v2-filter-bar`, and `#rmRoutesGrid` route cards to `.cwp-v2-card` + `--cwp-v2-*` tokens (preserving existing Material Symbols).
  - **`T16-02` — Route Detail & Stop Sequence (`CMP-09`, `M-ROUTE-PLAN`):**
    - Style `#rmRouteDetailView` (`Index.html:753–809`) breadcrumb bar, 3-col master card, `#rmSeqUnsavedPill`, and `#rmStopsList` using `.cwp-v2-sequence-item` (`CMP-09`), `.cwp-v2-license-plate` (`CMP-03`), keyboard-accessible `Top`/`Up`/`Down`/`Bottom` buttons, and atomic `reorderRouteStops` negative-offset tx save. Preserve unsaved-sequence navigation guard (`closeRouteDetailView()`).
  - **`T16-03` — Unassigned Workbench & Bulk Partial-Failure Reporting (`M-ROUTE-PLAN`):**
    - Upgrade `.rm-unassigned-table` (`Index.html:747`) to Task 07 `createAuraDataGrid` with `.cwp-v2-bulk-bar` (`#rmBatchBar`, `#0b1a2b` dark navy).
    - Replace `alert(msg)` in `executeBatchAssignToRoute()` (`app.js:17500+`) with an accurate Aura partial-failure summary modal/toast reporting exact `succeededCount`, `failedCount`, and per-vehicle failure reasons, keeping failed checkboxes selected for retry.
  - **`T16-04` — Legacy Staff Sequence Cleanup (`#rmLegacySeqView`):**
    - Strip all emojis (`⚠️`, `🔄`, `✓`, `🔍`, `📋`, `⚡`, `👤`, `🚗`) from `#rmLegacySeqView` (`Index.html:810–863`) and `app.js:17768–18398`, align Cards/Compact toggle with `.cwp-v2-tabs` + `CMP-09`, preserving `getStaffSequence`/`saveStaffSequence`/`resetStaffSequence`.
  - **`T16-05` — Migrate All 8 Route Modals onto `v2-overlay.js`:**
    - Migrate `#rmCreateRouteModal`, `#rmEditRouteModal`, `#rmAssignStaffModal`, `#rmAddStopModal`, `#rmTransferStopModal`, `#rmDeleteRouteModal`, `#rmRemoveStopModal` (`Index.html:4222–4462`), and `#seqResetModal` (`L864`) onto `v2-overlay.js` (fixing the omission of the 7 `#rm*` modals from V1 `getTopmostOpenModal()` at `app.js:1371–1394`; `#seqResetModal` is already listed at `L1372`), using `.cwp-v2-consequence-box` on Delete/Remove/Reset and Task 06 searchable dropdowns for candidate stops & DCC-eligible cleaners.
  - **`T16-06` — Wire `M-UNWIRED-BACKEND` Daily Route Reconciliation (`API GAP — REQUIRES INVESTIGATION`):**
    - Add a 4th subtab or drawer (`Daily Reconciliation`) inside `M-ROUTE-PLAN` calling `POST /api { action: 'getDailyRouteReconciliation', operationalDate }` (`server.js:3104, 6243–6252` -> `routeService.getDailyRouteReconciliation`), rendered in a Task 07 `createAuraDataGrid` comparing planned `route_stops` vs completed/exception/pending `service_logs`.
- **Dependencies:** Phase 1 (`M-SHELL`, `v2-overlay.js`), Phase 3–5 (`M-CUSTOMERS`, `M-JOB-ASSIGN`), `T09-06`..`T09-08`.
- **Specific Risks & Mitigations:**
  - *Risk:* Stop reorder or cleaner transfer scrambles live morning `staff_route_sequences` for Staff PWA. *Mitigation:* Preserve exact `orderedStopIds` payload, dirty-state exit guard, and `isDccEligible` staff filter (`app.js:16826–16845`).
  - *Risk:* Legacy `#rmLegacySeqView` conflicts with Route Hub if both edit the same cleaner simultaneously. *Mitigation:* Reload route hub/detail state when switching back from `Staff Sequence View`.
- **Concrete Acceptance Criteria:**
  1. All 8 route/sequence modals open/close via `v2-overlay.js`, trap focus, and dismiss cleanly on `Escape` / browser Back.
  2. `executeBatchAssignToRoute()` reports exact per-stop successes and failures without raw `alert()`, retaining failed rows selected.
  3. `reorderRouteStops` maintains contiguous `1..N` stop numbering and mirrors `staff_route_sequences` for `/staff`.
  4. `getDailyRouteReconciliation` renders real route-level coverage metrics for any selected date.
- **Evidence & Rationale for Sequence:** `M-ROUTE-PLAN` already received partial Material Symbols modernization (`rm-*` classes), but carries high operational blast radius (`route_stops` + `staff_route_sequences` live morning order) and 7 modals missing from V1's modal stack (the 7 `#rm*` modals; `#seqResetModal` is already listed at `app.js:1372`). Migrating it in Phase 7 leverages stabilized `v2-overlay.js`, Task 06/07 factories, and partial-failure bulk patterns proven in Phases 1–6.

---

#### Phase 8 — Staff Roster, Capabilities, Designations & Hierarchy (**AGENT TASK 17**)

- **Canonical Modules:** `M-STAFF`, `M-UNWIRED-BACKEND` (`resetStaffPin`)
- **Task IDs & Exact Scope:**
  - **`T17-01` — Staff Roster Grid & Card Actions (`M-STAFF`):**
    - Migrate `#adminStaffList` (`Index.html:885–926`) to Aura `.cwp-v2-card` roster grid (with optional compact table toggle) using `.cwp-v2-switch-sm` (`toggleStaffActive`), `.cwp-v2-badge` (`Logged In` / `Locked` / Work Type / Designation), `.cwp-v2-cell-mono` (`revealStaffPin`), and `.cwp-v2-table-overflow-menu` (`Open Portal`, `Reset Device Session`, `Unlock Account`, `Reset PIN`, `Delete` via `.cwp-v2-consequence-box`). Strip all 52 emoji lines from `app.js:7353–9115`.
    - Confirm Change Admin Password form (`Index.html:920–925`) has been removed from `#adminTabStaff` (relocated to Shell Account/Security in `T10-04`).
  - **`T17-02` — Fix `handleEditStaffSubmit()` Button-Lock & Migrate Staff Modals (`M-STAFF`):**
    - Migrate `#addStaffModal` (`Index.html:3067–3113`) and `#staffEditModal` (`L2719–3066`) onto `v2-overlay.js` `.cwp-v2-modal-lg` + Task 05 `.cwp-v2-form-section`, `.cwp-v2-choice-group`, and `.cwp-v2-file-dropzone` (5 KYC documents: Aadhar Front/Back, PAN, DL, Bank Passbook), stripping all emojis (`✏️`, `📷`, `🗑️`, `👁️`, `✅`, `🚫`, `🪪`, `💳`, `🚗`, `🏦`, `💾`).
    - **Mandatory Bug Fix (`app.js:8732–8749`):** Validate `editCaps.length === 0`, phone uniqueness, and PIN format **before** disabling `#btnSaveEditStaff` (`.is-loading`), and always restore button state on validation/API error (`staffCapabilityService` conflict error preserves inputs and highlights error alert).
  - **`T17-03` — Designations & Organizational Hierarchy Modals (`M-STAFF`):**
    - Migrate `#designationManagementModal` (`Index.html:3808–3923`, 6 authority switches, `is_system_protected` guard) and `#staffHierarchyModal` (`L4190–4221`, reporting tree + BFS cycle guard) onto `v2-overlay.js` `.cwp-v2-modal-lg` (fixing their omission from V1 `getTopmostOpenModal()`).
  - **`T17-04` — Wire `M-UNWIRED-BACKEND` Dedicated `resetStaffPin` Action (`API GAP — REQUIRES INVESTIGATION`):**
    - Wire `POST /api { action: 'resetStaffPin', staffId, newPin }` (`server.js:3054, 3475–3528` -> `authService.resetStaffPin`) into a dedicated Aura `.cwp-v2-modal-sm` confirmation modal from Staff card `⋮` menu and `#staffEditModal` so PIN resets generate proper `staff_auth` audit entries and revoke active mobile `auth_sessions`.
  - **`T17-05` — Staff Lockout, Multi-Device & Capability Regression Check:**
    - Verify `unlockStaff` (DB + cross-IP rate limits), `revealStaffPin` (`audit_logs`), `toggleStaffActive`, and capability conflict blocking against active routes/jobs (`M-ROUTE-PLAN`, `M-SPECIAL-JOBS`).
- **Dependencies:** Phase 1 (`T10-04` password relocation), Phase 5 & Phase 7 (active job & route capability dependencies).
- **Specific Risks & Mitigations:**
  - *Risk:* Changing staff phone, PIN, or active flag revokes active `staffSessions` on `/staff` PWA unexpectedly without operator awareness. *Mitigation:* Render a visible `.cwp-v2-form-alert.is-warning` inside `#staffEditModal` whenever phone/PIN/active is modified, warning that active mobile sessions will be revoked on save.
  - *Risk:* 5 KYC file dropzones break base64/Cloudinary upload limits (`15 MB` cap on `POST /api`). *Mitigation:* Preserve existing client-side image resize/compression pipeline and file `<input>` listeners.
- **Concrete Acceptance Criteria:**
  1. Submitting `#editStaffForm` with `non_dcc_only` and 0 capabilities displays inline error and leaves `#btnSaveEditStaff` enabled and clickable.
  2. `#designationManagementModal` and `#staffHierarchyModal` dismiss on `Escape` / browser Back via `v2-overlay.js`.
  3. Dedicated `resetStaffPin` updates PIN, revokes active staff session, and writes `audit_logs`.
  4. Zero emojis remain in `#adminTabStaff` or Staff modals.
- **Evidence & Rationale for Sequence:** `M-STAFF` enforces cross-cutting capability conflicts against `M-SPECIAL-JOBS` (Phase 5) and `M-ROUTE-PLAN` (Phase 7), and previously housed the misplaced Change Admin Password form (`M-AUTH`, Phase 1). Placing `M-STAFF` in Phase 8 ensures all route and job dependencies are already live and verifiable in Aura V2.

---

#### Phase 9 — Full E2E Regression, Audit/CMS Decisions, Cleanup & Cutover (**AGENT TASK 18**)

- **Canonical Modules:** `M-UNWIRED-BACKEND` (`getAuditLogs`, Homepage CMS, Careers Inbox), `M-LEGACY-ORPHANS`, `M-HIDDEN-SUPPRESSED`, All Modules
- **Task IDs & Exact Scope:**
  - **`T18-01` — Wire `getAuditLogs` & Resolve Remaining `M-UNWIRED-BACKEND` Scope (`API GAP — REQUIRES INVESTIGATION`):**
    - Wire `POST /api { action: 'getAuditLogs' }` (`server.js:4571–4588`) into the `Settings & Logs` view (already scaffolded in `public/admin-v2/index.html:73–76`) using Task 07 `createAuraDataGrid` + Task 06 filters (`entityType`, `entityId`, `action`, `actor`) + `.cwp-v2-timeline` diff viewer (`before_state` vs `after_state`, reconciled for `limit=100`).
    - Formally either wire or defer post-parity: `PUT/POST /api/admin/homepage-config` (`server.js:2254`, Homepage CMS form) and `GET /api/admin/job-applications` (`server.js:2381` + missing `updateJobApplicationStatus` route). Keep `moveStopInRoute` (`server.js:6133`) & `cleanAndSyncStaff` (`5075`) as backend-retained utilities unless needed.
  - **`T18-02` — Decommission `M-LEGACY-ORPHANS` & `M-HIDDEN-SUPPRESSED`:**
    - Remove dead orphaned functions `app.js:4746–5606` (`renderUnifiedAssignmentsLedger`, `openUnifiedJobAssignModal`, `renderStaffWorkloadAndPerformance`) and dead HTML containers (`#adminTabAddCust`, `.reports-kpi-grid`, `#adminTabRecords .cwp-seg-nav`, `#sideNavDashboard` if no longer referenced by tests) while keeping URL aliases (`washSolar`, `addCust`) in `v2-shell.js`.
    - Clean up `v2-playground.js` mock data strictly to `/admin-v2/ui-lab` (or gate behind `?lab=1` / non-prod flag) so zero mock payloads load in `/admin` production bundle.
  - **`T18-03` — Complete 18-Area Regression Verification Matrix (Deliverable M5):**
    - Execute every unit, API, Neon DB (`npm run test:neon`), CDP browser, and interactive workflow test across all 18 required test areas (`CWP_ADMIN_V2_REGRESSION_MATRIX.md`), updating any source-string assertions in `tests/` that previously matched removed emojis (`M3 RISK-07`).
  - **`T18-04` — Visual, Accessibility (WCAG 2.2 AA) & Devanagari Audit:**
    - Verify keyboard navigation (`Tab`, `Shift+Tab`, `Escape`, focus restoration), `role="dialog" aria-modal="true"` on all 32 modals + 1 drawer, `:focus-visible` contrast, zero Unicode emojis, zero Google CDN requests, `Noto Sans Devanagari` `line-height: 1.5` matra rendering across `360px`/`768px`/`1024px`/`1440px`, and `scripts/verify_admin_v2_isolation.js`.
  - **`T18-05` — Performance & Live-Sync Soak Verification:**
    - Verify SSE `/api/admin-realtime-stream` reconnects, 15s pulse visibility gating, zero memory/listener leaks across repeated tab switches (`100+` cycles) and `createAuraDataGrid` re-renders, and `/staff` PWA offline precache (`sw.js`) integrity.
  - **`T18-06` — Production Cutover & Rollback Readiness:**
    - Switch default `/admin` route flag to serve Aura V2 (`Section 4`) while retaining V1 fallback flag & smoke-verified rollback path.
- **Dependencies:** Phases 0–8 complete.
- **Specific Risks & Mitigations:**
  - *Risk:* Removing `#adminTabAddCust` or `.reports-kpi-grid` breaks existing `tests/test_dom_contract_reconciliation_qa.js` checks. *Mitigation:* Audit and update DOM contract tests concurrently in `T18-03` only after V1 fallback is retired or keep separate V1/V2 contract assertions during dual-route shadow period.
  - *Risk:* Service Worker `sw.js` caches old `/css/style.css` or `/js/app.js` on devices that visited both `/staff` and `/admin`. *Mitigation:* Bump `ACTIVE_ASSET_REV` in `server.js:6739` and `CACHE_NAME` in `sw.js:12` ONLY for Staff-impacting updates; serve Admin V2 from separate `/admin-v2/` asset paths so `/staff` Service Worker cache stays clean.
- **Concrete Acceptance Criteria:**
  1. `100%` of `npm test`, `npm run test:neon`, and M5 18-area regression checks pass against live Aura V2 `/admin`.
  2. Zero requests to external font CDNs, zero mock datasets in production Admin JS, zero Unicode emojis in Admin UI.
  3. `/staff`, `/home`, and `/careers` pass full smoke tests with zero regressions.
  4. Rollback toggle restores V1 `/admin` in `< 1` minute without DB rollback.
- **Evidence & Rationale for Sequence:** Additive `M-UNWIRED-BACKEND` tooling (Audit Logs/CMS/Careers), dead-code deletion (`M-LEGACY-ORPHANS`), soak testing, and final `/admin` cutover must happen only after every operational workflow (Phases 1–8) achieves verified feature parity.

---

### 3.3 Disposition Summary: `M-UNWIRED-BACKEND`, `M-HIDDEN-SUPPRESSED` & `M-LEGACY-ORPHANS`

| Category | Item | Phase | Disposition Decision |
|---|---|---|---|
| `M-UNWIRED-BACKEND` | `getCustomerDccDetails`, `getCustomerDccSubscriptions`, `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription` | **Phase 4 (`T13-05`)** | **Wire** inside `#editCustomerModal` DCC Service panel. |
| `M-UNWIRED-BACKEND` | `getDailyRouteReconciliation` | **Phase 7 (`T16-06`)** | **Wire** inside `M-ROUTE-PLAN` Reconciliation tab/drawer. |
| `M-UNWIRED-BACKEND` | `resetStaffPin` | **Phase 8 (`T17-04`)** | **Wire** dedicated PIN Reset modal in `M-STAFF`. |
| `M-UNWIRED-BACKEND` | `getAuditLogs` | **Phase 9 (`T18-01`)** | **Wire** into `Settings & Logs` view using Task 07 Data Grid + `.cwp-v2-timeline`. |
| `M-UNWIRED-BACKEND` | `PUT/POST /api/admin/homepage-config`, `GET /api/admin/job-applications` | **Phase 9 (`T18-01`)** | **Scope Decision:** Wire as Settings/Careers Admin subtabs OR formally defer post-parity (remove `NODE_ENV==='test'` bypass in `T09-01` either way). |
| `M-UNWIRED-BACKEND` | `toggleCustomerActive` (`server.js:3050` stub) | **Phase 0 (`T09-02`)** | **Resolve `API GAP — REQUIRES INVESTIGATION`:** Implement handler or remove stub from `adminProtectedActions`. |
| `M-UNWIRED-BACKEND` | `moveStopInRoute`, `getServiceCatalog`, `cleanAndSyncStaff` | **Retain Backend** | Keep backend handlers intact; UI continues using `reorderRouteStops` & catalog defaults. |
| `M-HIDDEN-SUPPRESSED` | `.admin-tab-badge`, `.hub-live-badge`, `#accountDropdownWrap` | **Phase 1 (`T10-02`, `T10-04`)** | **Restore Intentionally** using truthful live counts & Aura Account Popover. |
| `M-HIDDEN-SUPPRESSED` | `.reports-kpi-grid`, `#btnAdminBackfillHindi`, `#filterAdminCategory`/`Staff`/`.cwp-seg-nav`, `#dccUnassignedBanner`, `#sideNavDashboard` | **Phases 2, 3, 5, 9** | **Decouple & Retire** once JS callers read direct state/API summaries; keep `washSolar` & `addCust` URL aliases. |
| `M-LEGACY-ORPHANS` | `app.js:4746–5606` (`unifiedJobAssignModal`, `unifiedAssignmentsTableBody`, `staffPerformanceSection`) | **Phase 5 (`T14-02`) / Phase 9 (`T18-02`)** | **Exclude & Delete** (dead JS with zero HTML DOM). |

---

## 4. Cutover & Rollback Strategy

### 4.1 Three-Stage Shadow-to-Cutover Architecture (`server.js:6657–6750`)

Because `Index.html` (`#staffView` + `#adminView`) and `sw.js` (`start_url: "/staff"`) share the same Node origin, the safest zero-downtime migration path uses **server-side route switching** with isolated `/admin-v2/` assets:

1. **Stage A — Authenticated Shadow Mode (Phases 1–8):**
   - Production `/admin`, `/admin/*`, `/?admin=` continue serving V1 `Index.html` unchanged.
   - `/admin-v2` and `/admin/v2` (`server.js:6658, 6682–6693`) host the live Aura V2 modules incrementally as Phases 1–8 ship.
   - Both V1 and V2 share the **exact same** `cwp_admin_token` (`localStorage`/`sessionStorage`), `POST /api` endpoints, Neon PostgreSQL database, and SSE `/api/admin-realtime-stream` — so operators can test live workflows in `/admin-v2` and cross-verify results in `/admin` in real time.
   - During Stage A, `scripts/verify_admin_v2_isolation.js` continues asserting zero `.cwp-v2-*` bleed into V1 `/admin` and `/staff`.
2. **Stage B — Canary / Feature-Flagged Opt-In (Phase 9 Pre-Cutover):**
   - Introduce an environment/config switch in `server.js` (e.g., `process.env.CWP_ADMIN_UI_VERSION === 'v2'` plus optional `?v2=1` / `?v1=1` query override or cookie opt-in for admin pilots) inside the `isAdminRoute || adminParam !== null` branch (`server.js:6722–6735`).
   - Route `/staff`, `/staff/*`, `/?staff=`, `/?id=`, `/`, `/home`, and `/careers` **never** inspect the Admin V2 flag — guaranteeing 100% immunity for field staff and public visitors.
   - Preserve `?tab=` and `#admin/<tab>` across redirects/switches so deep links and bookmarks work seamlessly in both V1 and V2.
3. **Stage C — Full `/admin` Cutover & Post-Cutover Stabilization (Phase 9 Final):**
   - Flip default for `/admin`, `/admin/*`, and `/?admin=` to serve the Aura V2 HTML/JS/CSS bundle (`public/admin-v2/` refactored as production `/admin` shell, keeping `/admin-v2` aliasing to it or redirecting cleanly).
   - Keep `v2-playground.js` (`#v2View_ui-lab`) stripped or gated behind non-production / `?lab=1` so production `/admin` loads zero mock data.
   - Retain V1 `/admin` fallback (`?v1=1` or `CWP_ADMIN_UI_VERSION=v1`) for one full operational stabilization cycle (7–14 days) before removing Admin-only HTML/CSS/JS from `Index.html`, `public/css/style.css`, and `public/js/app.js` (which simultaneously shrinks the Staff PWA payload!).

### 4.2 Deterministic Rollback Plan (`< 5 Minutes`, Zero Data Loss)

| Trigger Condition | Rollback Action | Data / Staff PWA Impact |
|---|---|---|
| Critical P0/P1 defect discovered on `/admin` post-cutover (auth failure, broken CRUD, route-order corruption, SSE disconnect storm) | Set `CWP_ADMIN_UI_VERSION=v1` (env var or Railway config) and restart Node process (`< 1 min`), or direct operators to `/admin?v1=1` emergency override. | **Zero database migration rollback needed** (schema & API contracts unchanged). Existing `cwp_admin_token` remains valid in `public.auth_sessions`. **Zero impact on `/staff` PWA, `/home`, or `/careers`.** |
| Post-rollback defect triage | Reproduce in `/admin-v2` shadow route (`server.js:6682`) against staging/local DB, add failing test to M5 regression suite, fix, and re-verify before re-enabling Stage B/C. | Staff operations continue uninterrupted on V1/Staff PWA. |
