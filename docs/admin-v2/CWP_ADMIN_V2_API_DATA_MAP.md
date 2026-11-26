# CWP Admin V2 — Live Data & API Mapping (Phase B / Deliverable M2)

**Target Repository:** `e:\CWP DATA APP` (`CWPCUSTOMERDATA`, branch `main`)  
**Scope:** Read-only end-to-end data path audit (`UI Component → Frontend Controller → API Client / Fetch Layer → Backend Route → Service / Business Logic → Database / Actual Source → Response → UI Rendering`) across all 15 canonical Admin modules (`M-AUTH`, `M-SHELL`, `M-DASH`, `M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`, `M-JOB-ASSIGN`, `M-STAFF-TRACKING`, `M-ROUTE-PLAN`, `M-CUSTOMERS`, `M-SERVICE-ASSIGN`, `M-LEADS`, `M-STAFF`, `M-HIDDEN-SUPPRESSED`, `M-LEGACY-ORPHANS`, `M-UNWIRED-BACKEND`).  
**Cross-References:**
- `docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md` (v2.1.1 PostgreSQL baseline specification)
- `docs/admin-v2/CWP_AURA_LIVE_MIGRATION_MASTER_AUDIT.md` (M1 — Module Inventory & Workflows)
- `docs/admin-v2/CWP_AURA_PRODUCTION_COMPONENT_MAPPING.md` (M3 — Aura Component Mapping)
- `docs/admin-v2/CWP_ADMIN_V2_MIGRATION_ROADMAP.md` (M4 — Shell Plan & Phases 0–9)
- `docs/admin-v2/CWP_ADMIN_V2_REGRESSION_MATRIX.md` (M5 — Verification Matrix)
- `public/admin-v2/` (CWP Aura V2 Playground, Tasks 01–07 + `v2-auth.js`)

> **Audit Rule:** Every endpoint, HTTP method, `POST /api` `action`, payload field, status code, SQL table/column, and line reference in this document was directly verified in `server.js` (6,886 lines), `public/js/app.js` (23,843 lines), `Index.html` (4,486 lines), `services/*.js` (16 files), `db/repositories/*.js` (21 files), `migrations/` (`001`–`022`), and `public/admin-v2/js/v2-auth.js` (108 lines). Unavailable, unimplemented, broken, or missing endpoints are explicitly tagged **`API GAP — REQUIRES INVESTIGATION`**.

---

## Executive Summary & Architecture Metrics

| Layer | Verified Component / File | Verified Inventory |
|---|---|---|
| **HTTP Server** | `server.js` (6,886 lines) | Native Node.js `http.createServer` (no Express/framework) |
| **REST & Health Endpoints** | `server.js:1767-2604` | **14** REST/health endpoints (13 `/api/*` + 1 `/health`/`/healthz`/`/ping` group) + **2** SSE streams (`GET /api/admin-realtime-stream`, `GET /api/staff-ping-stream`) (**16** total, matching §3.1) |
| **RPC Action Dispatcher** | `POST /api` & `POST /` (`server.js:2609-6647`) | **100** implemented `payload.action` handlers + **1** protected-list stub (`toggleCustomerActive`, no handler) |
| **Frontend RPC Client** | `apiCall()` (`public/js/app.js:5732-5825`) | `fetch('/api', { method: 'POST' })` + `EventSource` SSE + direct `/api/indic/*` `fetch` |
| **Service Layer** | `services/*.js` | **16** domain service modules |
| **Repository Layer** | `db/repositories/*.js` | **21** files (`index.js` + 20 table/domain repositories) |
| **Database Schema** | `migrations/001`–`022` + `migrations/migrate.js` | **27** `public.*` tables + `meta.schema_migrations` (**28** total across `23` `.sql` files; duplicate `019_` prefix) |
| **Aura V2 Auth Bridge** | `public/admin-v2/js/v2-auth.js` (108 lines) | Reads `cwp_admin_token`, calls `verifyAdminPassword` & `getStaffList` (**session check gap**) |

---

## 1. Transport, Session, Auth & Real-Time Architecture

### 1.1 Backend HTTP Server (`server.js`)
- **Runtime:** Native Node.js `http.createServer` (`server.js`), `package.json` v3.2.1 (`pg ^8.23.1`, `cloudinary ^2.11.0`, `material-symbols ^0.49.0`; zero Express middleware).
- **Security Headers & CORS (`server.js:1738-1761`):**
  - Response headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - CORS allows `GET, POST, OPTIONS` and `Content-Type, Authorization, X-Requested-With`.
- **Request Body Size Limits:**
  - `POST /api` and `POST /` (`server.js:2616`): **15 MB** max (`413 { success: false, error: 'Payload too large (max 15MB)' }`).
  - `POST /api/careers/apply` (`server.js:2360`): **15 MB** max (`413`).
  - `POST /api/indic/transliterate` & `POST /api/indic/transliterate-customer` (`server.js:2401, 2441`): **10 MB** max (`413`).
  - `PUT/POST /api/admin/homepage-config` & `POST /api/leads` / `/api/public/book` (`server.js:2265, 2291`): **1 MB** max (`413`).
- **Unmatched API Routes (`server.js:6652-6655`):** Any unmatched `/api/*` request returns `404 { error: 'Endpoint Not Found', pathname }`. Unknown `payload.action` values on `POST /api` fall through to `400 { success: false, error: 'Unknown or unsupported action: <action>' }` (`server.js:6639-6640`).

### 1.2 Frontend API Client & Token Extraction
- **Primary Frontend Transport (`apiCall`, `public/js/app.js:5732-5825`):**
  - Signature: `apiCall(action, payload, onSuccess, onFailure)`.
  - Automatically injects `action`, `adminToken` (when `!isStaffOp` and `getAdminToken()` exists), `staffToken`, and `token = effectiveToken` into the JSON body (stripped for `verifyAdminPassword` and `verifyStaffPin` at `app.js:5753-5762`).
  - Sends `POST /api` with `Content-Type: application/json` and `Authorization: Bearer <effectiveToken>` (omitted on login calls).
  - **Response & Error Routing (`app.js:5775-5824`):**
    - HTTP `401` / `403` (for actions other than `verifyStaffPin`/`verifyAdminPassword`): invokes `handleUnauthorizedResponse(errData)` and rejects into `.catch()` -> `onFailure(err)`.
    - Non-OK HTTP status (`!res.ok`, e.g. `400`, `404`, `409`, `413`, `429`, `500`): extracts `errData.error || errData.message` and rejects into `onFailure(err)` (or `showToast('Could not connect to server: ...')` if `onFailure` is omitted).
    - HTTP `200` with `{ unauthorized: true }` or `{ forbidden: true }`: invokes `handleUnauthorizedResponse(resData)` and calls `onFailure(new Error(resData.error || 'Unauthorized'))`.
    - HTTP `200` with `{ error }`: calls `onFailure(new Error(resData.error))` if provided, else `showToast('Error: ' + resData.error, '❌')`.
    - **Button-Lock Hazard:** Callers that disable a trigger button before calling `apiCall` and omit `onFailure` (e.g., `handleBackfillHindi` at `app.js:1728-1753`) leave the button permanently disabled on `4xx`/`5xx`/network errors.
- **Direct `fetch()` Callers (Outside `apiCall`):**
  - `transliterateTextViaApi()` (`app.js:1580-1635`) calls `fetch('/api/indic/transliterate', { method: 'POST' })` and `/api/indic/transliterate-customer`.
  - `public/admin-v2/js/v2-auth.js` calls `fetch('/api', ...)` directly for `verifyAdminPassword` (`v2-auth.js:76-83`) and `getStaffList` (`v2-auth.js:48-58`).
- **Backend Token Extraction (`extractAuthToken`, `server.js:822-840`):**
  - Special-cases `getStaffData` and `logoutStaff` to prefer `payload.staffToken`.
  - Otherwise reads `Authorization: Bearer <token>` header first, falling back to `payload.token || payload.adminToken || payload.staffToken`.
  - **Query string tokens are rejected** on all REST and `POST /api` routes, **except** the two SSE endpoints (`GET /api/admin-realtime-stream` at `server.js:2091` and `GET /api/staff-ping-stream` at `server.js:2128`), which accept `?token=` (or `Authorization: Bearer`) because browser `EventSource` cannot set custom HTTP headers.

### 1.3 Session Management, Password Hashing & Rate Limiting
- **Dual Session Store (`server.js:562-816`, `services/authService.js:11-106, 179-200, 338-398`):**
  - `SESSION_TTL_MS = 12 * 60 * 60 * 1000` (12 hours / `expiresIn: 43200`).
  - Admin tokens use `adm_` + 32 random hex bytes (`server.js:598`); Staff tokens use `stf_` + 32 random hex bytes (`server.js:643`).
  - Stored in-memory (`adminSessions` and `staffSessions` `Map`s) **and** persisted in Neon `public.auth_sessions` using SHA-256 `token_hash` (with `user_type`, `admin_id`/`staff_id`, `device_id`, `expires_at`, `revoked_at`).
  - `resolveAdminSession(token)` (`server.js:797-805`) and `resolveStaffSession(token)` (`server.js:807-816`) check in-memory maps first, then fall back to `authService.validateSession(token)` against `public.auth_sessions` and warm the in-memory `Map`.
  - On non-production local mode (`!isNeonConfigured() || NODE_ENV !== 'production'`), `saveLocalData` (`server.js:854-866`) strips `adminSessions` and `staffSessions` before writing `local_data.json` (while `loadLocalData` restores any unexpired entries if present).
- **Password & PIN Hashing (`services/authService.js`, `server.js:428-464`):**
  - `scryptSync` (`N:16384, r:8, p:1`, 64-byte derived key).
  - Admin login (`authService.loginAdmin`, `authService.js:133-177`) checks `public.admin_users` (auto-seeding `'admin'` with `role='superadmin'` from `process.env.ADMIN_PASSWORD`), with fallback to `process.env.ADMIN_PASSWORD` (reloaded from `.env`) and `appState.adminPasswordHash`.
  - **No Granular Sub-Role RBAC:** Although `admin_users.role` defaults to `'superadmin'` and `staff_designations` stores granular `authorities` JSONB for staff, `resolveAdminSession` only checks `userType === 'admin'` — every valid admin session has full access to all admin endpoints.
- **Rate Limiting (`server.js:473-554`, `authService.js:243-269`):**
  - Keyed by `${clientIp}:${identifier.toLowerCase()}` in `failedLogins` `Map`.
  - `MAX_FAILED_ATTEMPTS = 5` within `COOLDOWN_PERIOD_MS = 5 * 60 * 1000` (5 minutes) -> returns HTTP `429` with retry countdown message (`server.js:2643-2650` for admin, `server.js:2756-2765` for staff + `staff_auth.locked_until` in Neon).
  - Admin `unlockStaff` calls `clearAllRateLimitsForIdentifier` (`server.js:532-554`) to clear IP rate limits across all client IPs alongside resetting `staff_auth.failed_attempts = 0, locked_until = NULL`.
- **Client Unauthorized Handler (`handleUnauthorizedResponse`, `app.js:5827-5856`):**
  - When `state.currentView === 'admin'`, clears `sessionStorage`/`localStorage` keys (`cwp_admin_token`, `cwp_admin_auth`, `cwp_admin_active_tab`), stops SSE & report auto-sync, updates URL via `history.replaceState` to `/admin`, locks UI via `checkAdminAuthStatus()`, and displays toast `'🔒 Admin session expired or invalid. Please log in again.'`.

### 1.4 Real-Time SSE Stream & 15-Second Polling
- **Server SSE Stream (`GET /api/admin-realtime-stream`, `server.js:2089-2123`, `1463-1480`):**
  - Auth: `?token=` or `Authorization: Bearer` -> `resolveAdminSession(token)` (`401` JSON on failure).
  - Sends `retry: 3000`, initial `{ type: 'CONNECTED' }`, and `20,000 ms` `{ type: 'PING', time }` heartbeats.
  - Broadcast engine `broadcastAdminRealtimeEvent(eventType, eventData)` (`server.js:1465-1480`) emits **4 operational change events**:
    1. `CUSTOMERS_CHANGED` (`server.js:1457` via `invalidateLiveCustomersCache()` — called on `saveCustomer`, `saveLead`, `updateCustomer`, `backfillHindi`, `deleteCustomer`, `deleteLead`, `convertLead`, `updateLead`, `assignCustomerService`, `stopCustomerService`, `cancelSpecialJob`, etc.)
    2. `DAILY_CLEAN_CHANGED` (`server.js:4749, 4831, 4981, 5045` — `recordDailyCleanWithPhoto`, `updateDailyCleanReportStatus`, `deleteDailyCleanReport`)
    3. `SPECIAL_JOB_CHANGED` (`server.js:5372, 5387, 5453, 5471, 5762, 5828, 6373, 6480, 6519, 6532, 6620` — `assignSpecialJob`, `reassignSpecialJob`, `createServiceBooking`, `failServiceJob`, `startSpecialJob`, `completeSpecialJob`, `deleteSpecialJob`, `cancelSpecialJob`)
    4. `CUSTOMER_ASSIGNMENT_CHANGED` (`server.js:5498, 5504, 5531, 5537, 5871, 5893, 5915` — `assignDailyCleanCustomer`, `unassignDailyCleanCustomer`, `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription`)
  - **`LEAD_CHANGED` Dead-Listener Gap:** `handleAdminRealtimeEvent()` (`app.js:3347-3353`) subscribes to `payload.type === 'LEAD_CHANGED'` to refresh the leads badge and `loadAdminLeads(true)`, **but `server.js` never emits `LEAD_CHANGED`**. Furthermore, `updateLeadStage` (`server.js:3323-3362`) and `addLeadNote` (`server.js:3285-3322`) do not even call `invalidateLiveCustomersCache()`, so stage/note edits do not push SSE updates to other admin sessions.
- **Client SSE & Polling (`app.js:3278-3422`):**
  - `initAdminRealtimeStream()` suppresses `EventSource` when `navigator.userAgent` includes `'Headless'` (`app.js:3280`) to keep headless automated browsers stable.
  - Reconnects after `5,000 ms` on `onerror` (`app.js:3316-3320`).
  - `startAdminRealtimePulse()` (`app.js:3389-3406`) runs every **15,000 ms** (only when `document.visibilityState === 'visible'` and `navigator.onLine !== false`), calling `refreshAllAdminBadges()` plus refreshing `specialJobs`/`jobAssignment`, `cleanReports`, or `dashboard`.
  - Module-specific **15,000 ms** pollers also run in `M-CLEAN-REPORTS` (`startDailyCleanReportsAutoSync`, `app.js:19579-19599`) and `M-STAFF-TRACKING` (`startStaffTrackingAutoSync`, `app.js:23626-23633`), plus an accelerated **2,500 ms x 8 cycles (20s)** poll after `pingStaffLocation` (`app.js:23490-23524`).

### 1.5 Neon PostgreSQL vs `local_data.json` Fallback & DB Architecture Drift
- **Database Resolution (`db/index.js`, `db/connectionResolver.js`):**
  - Uses `pg.Pool` (`max: 10`, `connectionTimeoutMillis: 30000`, `idleTimeoutMillis: 30000`) with automatic Neon `-pooler.` / unpooled URL resolution.
  - `isNeonConfigured()` / `isNeonPrimaryActive()` controls primary PostgreSQL execution. When `NODE_ENV === 'test' && !FORCE_NEON_IN_TEST` or when `DATABASE_URL` is absent, `server.js` falls back to in-memory `appState` persisted to `local_data.json` (`server.js:848-931`).
  - Note: When `isNeonConfigured()` is true, several `GET` / `POST` handlers (`GET /api/customers`, `GET /api/leads`, `getStaffList`, etc.) still catch Neon errors and fall back to `appState` / `getCombinedCustomerRecords()` (`server.js:2183-2238`).
- **Cross-Reference to `docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md`:**
  - The v2.1.1 architecture doc documented the frozen Phase 1C.2 baseline (15 core tables: `customers`, `vehicles`, `service_locations`, `staff`, `staff_auth`, `service_categories`, `subscriptions`, `subscription_vehicles`, `staff_assignments`, `staff_route_sequences`, `service_jobs`, `service_logs`, `admin_users`, `auth_sessions`, `audit_logs` + `meta.schema_migrations`).
  - Subsequent migrations (`010`–`022`) extended the live schema to **27 `public.*` tables + `meta.schema_migrations` (28 total)**, adding: `staff_locations`, `staff_tracking_current`, `staff_stoppages`, `staff_location_pings` (`011`), `homepage_settings`, `job_applications` (`012`), `customer_packages`, `package_redemption_logs` (`017`), `routes`, `route_stops` (`020`), `staff_service_capabilities` (`021`), `staff_designations` (`022`), plus `auth_sessions.device_id` (`019_add_device_id_to_auth_sessions.sql`), `customers` Hindi/lead/solar/car columns (`002`–`007`), and `service_logs.admin_notes` / `car_not_present` (`009`, `016`, `019_enhance_dcc_core_operations.sql`).

### 1.6 Complete RBAC & Auth Bucket Matrix (`server.js`)

| Auth Bucket | Endpoints / Actions | Enforcement Location (`server.js`) | Security Nuances & Gaps |
|---|---|---|---|
| **1. Central `adminProtectedActions` (70 listed actions)** | `getAllCustomers`, `getLeads`, `convertLead`, `addLeadNote`, `saveLead`, `deleteLead`, `updateLeadStage`, `updateLead`, `saveCustomer`, `updateCustomer`, `deleteCustomer`, `toggleCustomerActive` *(no handler)*, `saveStaffMember`, `deleteStaffMember`, `toggleStaffActive`, `resetStaffPin`, `unlockStaff`, `cleanAndSyncStaff`, `updateAdminPassword`, `getStaffSequence`, `saveStaffSequence`, `resetStaffSequence`, `revealStaffPin`, `getDailyCleanReports`, `updateDailyCleanReportStatus`, `deleteDailyCleanReport`, `getSpecialJobs`, `assignSpecialJob`, `reassignSpecialJob`, `deleteSpecialJob`, `assignDailyCleanCustomer`, `unassignDailyCleanCustomer`, `getDailyCleanAssignments`, `assignCustomerService`, `stopCustomerService`, `getAuditLogs`, `sellCustomerPackage`, `redeemPackageEntitlement`, `cancelCustomerPackage`, `getCustomerPackages`, `getPackageRedemptionHistory`, `createServiceBooking`, `getEligiblePackagesForBooking`, `getCustomerServiceJobs`, `failServiceJob`, `getCustomerDccDetails`, `getCustomerDccSubscriptions`, `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription`, `getAllRoutes`, `getRoutes`, `getRouteDetails`, `createRoute`, `updateRoute`, `setRouteStatus`, `deleteRoute`, `assignStaffToRoute`, `unassignStaffFromRoute`, `addStopToRoute`, `removeStopFromRoute`, `reorderRouteStops`, `moveStopBetweenRoutes`, `moveStopInRoute`, `getUnassignedDccVehicles`, `getDailyRouteReconciliation`, `getDesignationsList`, `saveDesignation`, `deleteDesignation`, `getStaffHierarchy` | `server.js:3038-3121` | Calls `resolveAdminSession(token)`. Missing/expired token returns `401 { success: false, unauthorized: true }`. No granular sub-role RBAC checks. `toggleCustomerActive` passes auth check then fails with `400 Unknown or unsupported action` (`API GAP — REQUIRES INVESTIGATION`). |
| **2. Inline Admin-Only** | `getStaffTrackingSummary` / `getStaffTrackingData`, `pingStaffLocation` / `requestStaffLocationPing`, `PUT/POST /api/admin/homepage-config`, `GET /api/admin/job-applications`, `GET /api/admin-realtime-stream`, `GET /api/staff-sequence`, `GET /api/leads` | `5156-5161`, `5226-5231`, `2254-2260`, `2381-2387`, `2089-2096`, `2465-2471`, `2220-2226` | **Test-Mode Bypass:** `GET /api/admin/job-applications` (`server.js:2384`) and `GET /api/leads` (`server.js:2223`) skip `resolveAdminSession` when `process.env.NODE_ENV === 'test'`. |
| **3. Dual Admin or Staff** | `recordDailyCleanWithPhoto`, `getStaffMovementHistory`, `getPendingStaffPings` / `checkStaffLocationPing`, `respondToLocationPing` / `respondStaffLocationPing`, `recordStaffHeartbeat` / `recordStaffLocationHeartbeat`, `failServiceBooking` *(alias)*, `getStaffRouteView`, `getStaffRouteWorklist`, `startSpecialJob`, `completeSpecialJob` / `completeServiceBooking`, `cancelSpecialJob` / `cancelBooking`, `GET /api/customers`, `GET /api/staff-data`, `GET /api/staff-ping-stream` | `4591+`, `5185-5202`, `5258-5342`, `5090-5155`, `5811-5838`, `6165-6242`, `6305-6497`, `6543-6638`, `2195-2202`, `2502-2535`, `2126-2146` | Staff requests enforce `staffId`/`staffCode` self-match (`403 Forbidden` on cross-staff access). **`GET /api/customers`** (`server.js:2199`) skips auth when `NODE_ENV === 'test'`. Note `failServiceBooking` is NOT in `adminProtectedActions` and checks `resolveAdminSession \|\| resolveStaffSession` inline (`5811-5816`). |
| **4. Staff-Only** | `getStaffData` (`POST /api`), `logoutStaff`, `syncCompletions` | `2914-3011`, `2900-2911`, `4553-4570` | Uses `resolveStaffSession(token)`. `extractAuthToken` prioritizes `payload.staffToken` for `getStaffData` & `logoutStaff` (`824-829`). |
| **5. Mixed Sanitized Public / Admin** | `getStaffList` (`POST /api`), `GET /api/staff` | `3013-3033`, `2171-2192` | Returns `200` to unauthenticated callers using `sanitizeStaffForPublic` (`{ id, name, photoUrl, active }`); Admin token unlocks `sanitizeStaffForAdmin` (phone, PIN/displayPin, KYC, salary, capabilities, designation, hierarchy). **V2 Auth Bug:** `public/admin-v2/js/v2-auth.js:48-63` uses `getStaffList` for `checkSession()`, treating any non-empty token as valid admin auth! |
| **6. Public / Unauthenticated** | `verifyAdminPassword`, `logoutAdmin`, `verifyStaffPin`, `getMapsConfig`, `getServiceCatalog`, `getPackageCatalog`, **`backfillHindi`**, `POST /api/indic/transliterate`, `POST /api/indic/transliterate-customer`, `GET /api/public/homepage-config`, `POST /api/leads`, `POST /api/public/book`, `POST /api/careers/apply`, `GET /health`/`/healthz`/`/ping`, `GET /api/cloudinary-status` | `2635-2899`, `4477-4513`, `5343-5349`, `5637-5660`, `2244-2462`, `1767-1799` | **CRITICAL SECURITY GAP:** `backfillHindi` (`server.js:4477-4513`) is missing from `adminProtectedActions` and lacks any inline auth check — any unauthenticated `POST /api { action: 'backfillHindi' }` mutates up to 1,000 customer/location rows and triggers external Google Indic requests. `getMapsConfig` (exposes Google Maps API key) and `/api/indic/*` are also unauthenticated. |

---

## 2. End-to-End Data Path Trace per Module

Each module trace follows the exact execution chain:  
`UI Component → Frontend Controller → API Client / Fetch Layer → Backend Route → Service / Business Logic → Database / Actual Source → Response → UI Rendering`

---

### 2.1 `M-AUTH` — Admin Authentication & Security Settings

#### Data Paths
1. **Admin Login (`verifyAdminPassword`)**
   - `Index.html:489-532` (`#adminAuthForm`, `#adminPasswordInput`, `#rememberAdminDevice`, `#btnAdminLogin`) → `initAdminAutoLogin()` (`app.js:2762-2790`, 450ms debounce at `>= 4` chars) & `handleAdminAuth()` (`app.js:2792-2906`) → `apiCall('verifyAdminPassword', { password, isAuto })` (`app.js:2823`, strips existing tokens) → `POST /api` (`server.js:2635-2719`) → `authService.loginAdmin` (`services/authService.js:133-177`) + `authService.issueAdminSession` (`authService.js:179-200`) / fallback `process.env.ADMIN_PASSWORD` + `appState.adminPasswordHash` → `public.admin_users`, `public.auth_sessions` (`token_hash` SHA-256, `user_type='admin'`, 12h TTL) → `{ success: true, token: 'adm_...', expiresIn: 43200 }` (`200`) → stores `cwp_admin_token` & `cwp_admin_auth` in `sessionStorage` (and `localStorage` if `#rememberAdminDevice` checked), clears `#adminPasswordInput`, calls `checkAdminAuthStatus()` (`app.js:2693-2757`) & `initAdminRealtimeStream()`.
2. **Admin Logout (`logoutAdmin`)**
   - `Index.html:631` (`#sidebarAdminLogoutBtn`) / header account menu → `handleAdminLogout()` (`app.js:2908-2910`) → `openLogoutModal('admin')` → `executeConfirmedLogout()` (`app.js:2565-2588`) → `apiCall('logoutAdmin', { adminToken })` (with 1200ms safety timeout) → `POST /api` (`server.js:2722-2734`) → `revokeAdminSession(token)` + `authService.logout(token)` (`authService.js:386-391`) → `UPDATE public.auth_sessions SET revoked_at = CURRENT_TIMESTAMP` → `{ success: true, message }` (`200`) → `clearAdminTokens()`, `history.replaceState(..., '/admin')`, `checkAdminAuthStatus()`.
3. **Update Admin Password (`updateAdminPassword`)**
   - `Index.html:920-925` (`#newAdminPasswordInput`) → `handleUpdateAdminPassword(e)` (`app.js:2925-2941`) → `apiCall('updateAdminPassword', { newPassword })` → `POST /api` (`server.js:3057, 4143-4182`) → **Bypasses `authService.updateAdminPassword`** (`authService.js:403-429`); calls `repos.adminUsers.findByUsername('admin')` / `updatePassword()` (`adminUsersRepo.js`) + `appState.adminPasswordHash` → `public.admin_users` → `{ success: true, message }` (`200`) → `showToast(...)` and clears `#newAdminPasswordInput`.
4. **Aura V2 Playground Auth Bridge (`public/admin-v2/js/v2-auth.js`)**
   - `window.CWP_ADMIN_V2.auth.login(password)` (`v2-auth.js:70-94`) → `fetch('/api', { method: 'POST', body: { action: 'verifyAdminPassword', password } })` → writes `localStorage.cwp_admin_token`.
   - `window.CWP_ADMIN_V2.auth.checkSession()` (`v2-auth.js:42-68`) → `fetch('/api', { action: 'getStaffList', token })` → **Defect:** `getStaffList` returns HTTP `200` even for invalid/staff tokens (`server.js:3013`), so `checkSession()` falsely reports `{ valid: true }` without verifying admin role (`API GAP — REQUIRES INVESTIGATION`).

#### Request / Response, Validation, Auth & Lifecycle
- **Request Payloads:** `verifyAdminPassword`: `{ action: 'verifyAdminPassword', password: string, username?: string, isAuto?: boolean }`. `logoutAdmin`: `{ action: 'logoutAdmin', adminToken?: string, token?: string }`. `updateAdminPassword`: `{ action: 'updateAdminPassword', newPassword: string }`.
- **HTTP Status Codes:** `200` success; `400` missing/short password (`newPassword.length < 4`) or invalid JSON; `401` wrong password or missing admin session on `updateAdminPassword` (`{ success: false, unauthorized: true }`); `429` rate-limit lockout (5 fails in 5 min -> 5 min cooldown, `server.js:2643-2650`); `500` DB update error (`server.js:4170`).
- **Validation Rules:**
  - *Client:* `#adminPasswordInput` `required` (`Index.html:497`); auto-login at `length >= 4` (`app.js:2777`). `#newAdminPasswordInput` `minlength="4" required` (`Index.html:921`).
  - *Server:* `verifyAdminPassword` checks IP+username rate limit, then scrypt/env hash. `updateAdminPassword` in `server.js:4145` checks `newPassword.length >= 4`, **diverging** from `authService.updateAdminPassword` (`authService.js:403-429`) which enforces `min 6 chars`, requires `currentPassword`, and revokes active `auth_sessions`!
- **Pagination / Filtering / Sorting / Search:** N/A (single-session auth endpoints).
- **Error Handling & Input Preservation:** `401`/`429` triggers `triggerInputShake()` on `#adminPasswordInput` & `#cwpCorePasswordBox`, renders `#adminAuthError` banner, selects/focuses `#adminPasswordInput` for retry, and keeps input intact. Mid-session `401`/`403` anywhere invokes `handleUnauthorizedResponse()` (`app.js:5827-5856`), locking the Admin shell.
- **Loading / Empty / Refresh:** Disables `#btnAdminLogin`, shows `#cwpAuthenticatingIndicator` and neural-core `'authenticating'` state during `apiCall`. No polling; session validity checked reactively on API responses.

---

### 2.2 `M-SHELL` — Admin Shell, Navigation, Header, Badges & Real-Time Sync

#### Data Paths
- **Initial Shell Boot & Tab Routing:** `checkAdminAuthStatus()` (`app.js:2693-2728`) → reads `getSavedAdminTab()` (`?tab=` or `#admin/<tab>` or `localStorage.cwp_admin_active_tab`, default `'records'`) → `switchAdminTab(tabName, true)` (`app.js:2944-3103`) → toggles `#adminTab<Name>` panes, updates `#adminMobileActivePane` title, syncs URL via `window.history.replaceState` (`?tab=<tabName>#admin/<tabName>`), calls `loadStaffListForAdmin()`, `loadAdminRecords()`, `refreshAllAdminBadges()`, and `initAdminRealtimeStream()`.
- **Header & Sidebar Controls (`Index.html:61-140, 542-643`):**
  - `#adminHeader`: Brand logo, `ADMIN` chip, `#staffLiveBadge` SSE/sync status pill + `#syncDetailsPopover` (`handleManualSyncClick` triggers `refreshAllAdminBadges()` / active tab reload), language toggle (`en`/`hi`, client-side `localStorage`), theme toggle (`toggleTheme`, client-side).
  - **Missing Shell Features (Confirmed Absent in V1):** `#accountDropdownWrap` / `#headerAccountTrigger` are hidden (`style="display: none !important;"`, `Index.html:126-127`); `#sideNavDashboard` is hidden (`Index.html:598`); there is **no global cross-module search bar** (`API GAP — REQUIRES INVESTIGATION`) and **no notification bell/feed endpoint** (`API GAP — REQUIRES INVESTIGATION`) — only sidebar count badges (`#tabCleanReportsCount`, `#tabSpecialJobsCount`, `#tabRecordsCount`, `#tabLeadsCount`, `#tabStaffCount`).
- **Badge & Realtime Sync Pipeline:**
  - `refreshAllAdminBadges()` (`app.js:3264-3276`) triggers `loadAdminSpecialJobs(true)` (`POST /api { action: 'getSpecialJobs' }`), `loadDailyCleanReports(true)` (`POST /api { action: 'getDailyCleanReports' }`), and `refreshLeadsBadgeCount()` (`POST /api { action: 'getLeads' }`).
  - `initAdminRealtimeStream()` (`app.js:3278-3422`) opens `EventSource('/api/admin-realtime-stream?token=' + encodeURIComponent(token))` (suppressed when UA contains `'Headless'`) and runs 15s `startAdminRealtimePulse()` (`app.js:3389-3406`).
- **Auth / Error / Loading / Refresh:**
  - Shell routes require `cwp_admin_token` client-side; `GET /api/admin-realtime-stream` enforces `resolveAdminSession(token)` (`401` JSON).
  - SSE `onerror` sets UI offline state and schedules 5s reconnect (`app.js:3309-3321`). `switchAdminTab` uses `history.replaceState` rather than `pushState`, so browser Back/Forward does not step through tab history unless hash changes manually.

---

### 2.3 `M-DASH` — Operations Dashboard & KPIs

#### Data Paths
- `switchAdminTab('dashboard')` (`app.js:3006-3017`) / `#adminOpsDashboardHub` (`Index.html`) → `refreshOperationsDashboard()` (`app.js:3243-3255`) → triggers `loadDailyCleanReports(false)` (`POST /api { action: 'getDailyCleanReports' }`) + `loadAdminSpecialJobs(false)` (`POST /api { action: 'getSpecialJobs' }`) → after 300–350ms runs `updateOperationsDashboardKPIs()` (`app.js:3133-3240`) and `renderDashboardCharts()` (`app.js:3505-3560+`, reading `adminCleanReportsState.records`, `adminSpecialJobsCache`, `state.customers`, `state.staffList`) → updates `#dashCombinedDone`, `#dashCombinedTotal`, `#dashAuditRate`, `#dashCrewActiveCount`, and pure SVG charts (`renderCleanProgressChart`, `renderStaffWorkloadChart`, `renderWashSolarTrendChart`, `renderCrewPulseStrip`).
- **Dedicated Dashboard Endpoint:** **None** — `M-DASH` has no dedicated backend aggregation endpoint; it aggregates client-side caches populated by `M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`, `M-CUSTOMERS`, and `M-STAFF` (`API GAP — REQUIRES INVESTIGATION` if server-side aggregate KPIs beyond `limit=200/500` are required in V2).
- **Pagination / Filtering / Sorting / Search:** None on dashboard view; inherits underlying `200`-row cap on `getDailyCleanReports` & `getSpecialJobs` and `500`-row cap on `getAllCustomers`, meaning high-volume days silently undercount dashboard KPIs.
- **Auth / Validation / Error / Refresh:** Inherits Admin session auth (`adminProtectedActions`) from underlying calls; read-only view; refreshes via SSE (`DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, `CUSTOMERS_CHANGED`) and 15s `startAdminRealtimePulse()`.

---

### 2.4 `M-CLEAN-REPORTS` — Daily Clean Reports & Photo Audit

#### Data Paths
1. **Load Reports (`getDailyCleanReports` + `getAllRoutes`)**
   - `#adminTabCleanReports`, period chips (`setReportPeriodChip`, `app.js:19803`), date inputs, staff/route/status/photo filters, search (`debounceReportSearch` 350ms, `app.js:19831`) → `loadDailyCleanReports(isSilent)` (`app.js:19609-19730`) → `apiCall('getDailyCleanReports', { startDate, endDate, staffId, routeId, hasPhoto, carNotPresent, status, search })` → `POST /api` (`server.js:3062, 4842-4955`) → `adminService.getDailyCleanReports` (`services/adminService.js:1743-1870`, computes consecutive cleaning & transit durations via `computeConsecutiveTimes`) → `repos.serviceLogs.queryDailyCleanReports` (`serviceLogsRepo.js:173+`) → `public.service_logs` JOIN `customers`, `vehicles`, `staff`, `service_locations`, `routes`/`route_stops` → `{ success: true, records, pendingRecords, summary: { totalCleaned, totalPending, totalScheduled, withPhotoCount, withoutPhotoCount, carNotPresentCount, activeStaffCount, photoRate, latestPunchTime, staffMatrix }, filterApplied, fetchedAt }` (`200`) → `renderDailyCleanReports()` (`app.js:19873-20094`).
   - Route dropdown populated by `populateReportRouteDropdown()` (`app.js:19746`) → `apiCall('getAllRoutes', {})` → `server.js:3089, 5930`.
2. **Edit Report Status (`updateDailyCleanReportStatus`)**
   - Row action / Photo Lightbox button → `openEditReportStatusModal()` (`app.js:20187`) → `submitEditReportStatus()` (`app.js:20249-20298`) → `apiCall('updateDailyCleanReportStatus', { reportId, status, reason })` → `POST /api` (`server.js:3063, 4957-5021`) → `adminService.updateDailyCleanReportStatus` (`adminService.js:1872-1908`) → updates `public.service_logs` (`status`, `car_not_present`, `admin_notes`) + inserts `public.audit_logs` + broadcasts SSE `DAILY_CLEAN_CHANGED` (`server.js:4981`) → `{ success: true, report }` (`200`) → closes modal & calls `loadDailyCleanReports(true)`.
3. **Delete Report (`deleteDailyCleanReport`)**
   - Row action / Lightbox button → `confirmDeleteCleanReport()` (`app.js:20301`) → `submitDeleteReport()` (`app.js:20341-20386`) → `apiCall('deleteDailyCleanReport', { reportId, reason })` → `POST /api` (`server.js:3064, 5022-5074`) → `adminService.deleteDailyCleanReport` (`adminService.js:1910-1938`) → deletes `public.service_logs` row + inserts `public.audit_logs` + broadcasts SSE `DAILY_CLEAN_CHANGED` (`server.js:5045`) → `{ success: true }` (`200`) → closes modal & reloads.
4. **Client-Side Only Actions:** `exportDailyCleanReportsCSV()` (`app.js:20398-20442`), `printDailyCleanReports()` (`app.js:20444`), `shareDailyCleanReportDirectly()` (`app.js:19856`).

#### Pagination, Filtering, Sorting, Auth, Validation & Lifecycle
- **Pagination / Filtering / Sorting / Search:** Server filters by `startDate`/`endDate` (default `todayIst`), `staffId`, `routeId`, `hasPhoto`, `carNotPresent`, `status`, `search`, ordered `completed_at_device DESC`. **Hardcoded `limit = 200, offset = 0`** (`serviceLogsRepo.js:173+`), **no `totalCount` returned**, and **no UI pagination** (silently truncates >200 logs; `API GAP — REQUIRES INVESTIGATION`).
- **Auth/RBAC:** All 3 report actions + `getAllRoutes` are in `adminProtectedActions` (`server.js:3062-3064, 3089`).
- **Validation:** Client requires non-empty `reason` on Edit/Delete (`app.js:20261-20270, 20349-20358`, red border + focus + toast). Server validates `reportId`, `reason`, and status in `['completed', 'car_not_present', 'customer_absent', 'vehicle_not_available', 'skipped', 'unable_to_complete']`.
- **Error Handling & Input Preservation:** Load errors render an inline red error table row (when `!isSilent`) and set `#reportsLastSyncTime` to `'Sync paused (retry in 15s)'`. Edit/Delete errors re-enable submit button, keep modal open with entered `reason` preserved, and show `showToast(..., 'error')`.
- **Loading / Empty / Refresh:** Spinner row on initial load, spinning refresh SVG (`app.js:19620-19626`), disabled modal submit buttons (`'सेव हो रहा है...'` / `'हटाया जा रहा है...'`). Empty state `.reports-empty-card` offers `View Today` and `Reset Filters` CTAs (`app.js:19954-19964`). Refreshes via 15s `startDailyCleanReportsAutoSync` (`app.js:19579-19599`, pauses while typing in `#reportSearchFilter`) and SSE `DAILY_CLEAN_CHANGED`.

---

### 2.5 `M-SPECIAL-JOBS` — Wash, Solar & Detailing Jobs

#### Data Paths
1. **Load Special Jobs (`getSpecialJobs`)**
   - Tab entry / refresh → `loadAdminSpecialJobs(silent)` (`app.js:22024-22061`) → `apiCall('getSpecialJobs', {})` → `POST /api` (`server.js:3065, 5398-5436`) → `adminService.getSpecialJobsAdmin` (`adminService.js:2800-2929`) → `public.service_jobs` (`INNER JOIN customers`, `LEFT JOIN vehicles`, **`INNER JOIN service_locations`**, `LEFT JOIN staff_assignments`, `LEFT JOIN staff`) → `{ success: true, jobs: [...] }` (`200`) → `filterAdminSpecialJobs()` (`app.js:22112-22167`) → `renderAdminSpecialJobsTable()` (`app.js:22218-22465`).
2. **Assign New Special Job (`assignSpecialJob`)**
   - `#assignSpecialJobForm` (`Index.html:3531-3645`) → `handleAssignSpecialJobSubmit()` (`app.js:21498-21589`) → `apiCall('assignSpecialJob', { jobData })` → `POST /api` (`server.js:3066, 5356-5397`) → `adminService.assignSpecialJob` (`adminService.js:2329-2626`) → creates/reuses `customers`, `service_locations`, `vehicles`, inserts `service_jobs`, `staff_assignments`, `audit_logs`, broadcasts SSE `SPECIAL_JOB_CHANGED` (`server.js:5372`) → `{ success: true, job }` (`200`).
3. **Reassign Special Job (`reassignSpecialJob` / `assignDailyCleanCustomer`)**
   - `#reassignJobForm` (`Index.html:3666`) → `handleReassignJobSubmit()` (`app.js:21710-21788`) → if `targetType === 'daily'` calls `assignDailyCleanCustomer` (`app.js:21733-21759`); else `apiCall('reassignSpecialJob', { jobId, newStaffId, reason, scheduledTime, tentativeTime, sequenceOrder })` → `POST /api` (`server.js:3067, 5437-5481`) → `adminService.reassignSpecialJob` (`adminService.js:2631-2795`) → updates `service_jobs` & `staff_assignments` + `audit_logs` + broadcasts SSE `SPECIAL_JOB_CHANGED` (`server.js:5453`) → `{ success: true, job }` (`200`).
4. **Delete Special Job (`deleteSpecialJob`)**
   - Row trash icon → `deleteAdminSpecialJob(jobId)` (`app.js:22467-22479`) → browser `confirm()` → `apiCall('deleteSpecialJob', { jobId })` → `POST /api` (`server.js:3068, 6498-6542`) → `repos.serviceJobs.softDelete` (blocks `completed` or `in_progress`) + `audit_logs` + broadcasts SSE `SPECIAL_JOB_CHANGED` (`server.js:6519`) → `{ success: true }` (`200`).
5. **Backend Lifecycle Endpoints (Triggered from Staff Portal / Bookings API):** `createServiceBooking` (`server.js:5755`, Admin), `startSpecialJob` (`server.js:6305`, Dual), `completeSpecialJob`/`completeServiceBooking` (`server.js:6390`, Dual), `failServiceJob`/`failServiceBooking` (`server.js:5811`, Dual), `cancelSpecialJob`/`cancelBooking` (`server.js:6543`, Dual) → `services/bookingService.js`.

#### Pagination, Filtering, Sorting, Auth, Validation & Lifecycle
- **Data Visibility Defect:** Both `adminService.getSpecialJobsAdmin` (`adminService.js:2847`) and `serviceJobsRepo.findAll` (`serviceJobsRepo.js:54`) use **`INNER JOIN public.service_locations loc ON j.location_id = loc.id`**, silently hiding any job with `location_id IS NULL` (`API GAP — REQUIRES INVESTIGATION`).
- **Audit Log Defect on `cancelSpecialJob`:** `server.js:6593-6600` calls `repos.auditLogs.logChange({ tableName, recordId, oldData, newData })` instead of `{ entityType, entityId, beforeState, afterState }` (`auditLogsRepo.js:7-33`), causing a `NOT NULL` error silently caught at `server.js:6601` (`API GAP — REQUIRES INVESTIGATION`).
- **Pagination / Filtering / Sorting / Search:** Client sends `{}` (no filter/page params); server hardcodes **`limit = 200, offset = 0`**, ordered `created_at DESC`, **no `totalCount`**. Period (`today`/`yesterday`/`7days`/`month`/`all`/`custom`), category chips, status KPI cards, staff dropdown, and search run **100% client-side** (`filterAdminSpecialJobs`).
- **Auth/RBAC:** `getSpecialJobs`, `assignSpecialJob`, `reassignSpecialJob`, `deleteSpecialJob` are in `adminProtectedActions` (`server.js:3065-3068`).
- **Validation:** Client requires customer name, 10-digit phone, address, category, date, time, package type, and staff (`Index.html:3563-3642`); blocks reassigning `completed` jobs (`app.js:21656`). Server validates state transitions & `staffCapabilityService.hasServiceCapability` in `bookingService.js`.
- **Error / Loading / Empty / Refresh:** Assign/Reassign errors populate `#assignSpecialJobError` / `#reassignJobError`, re-enable submit button, and preserve modal inputs; delete failures show toast. Refreshes via SSE `SPECIAL_JOB_CHANGED` and 15s pulse.

---

### 2.6 `M-JOB-ASSIGN` — Job Assignment & Daily Assignment Ledger

#### Data Paths
1. **Load Assignment Ledger (`getDailyCleanAssignments` + `getSpecialJobs`)**
   - `switchAdminTab('jobAssignment')` → `loadJobAssignmentView()` (`app.js:4200+`) → `loadDailyCleanRouteAssignments()` (`app.js:4207`) → `apiCall('getDailyCleanAssignments', {})` (`server.js:3071, 5548-5576` → `adminService.getDailyCleanAssignments` `adminService.js:3158-3235` → `staff_assignments` + `subscriptions` + `customers` + `staff`) + `loadAdminSpecialJobs(true)` → `renderJobAssignmentsLedger()` (`app.js:4628-4744`).
2. **Inline DCC Assignment (`assignDailyCleanCustomer`)**
   - `#dccAssignCustomerSelect`, `#dccAssignStaffSelect` (`Index.html:1471-1477`) → `apiCall('assignDailyCleanCustomer', { customerId, staffId, sequenceOrder })` → `POST /api` (`server.js:3069, 5482-5514`) → `adminService.assignDailyCleanCustomer` (`adminService.js:3005-3111`) → deactivates prior `staff_assignments`, inserts new active assignment, updates `staff_route_sequences`, broadcasts SSE `CUSTOMER_ASSIGNMENT_CHANGED` (`server.js:5498`).
3. **Inline Unassign DCC (`unassignDailyCleanCustomer`)**
   - Ledger action → `apiCall('unassignDailyCleanCustomer', { customerId })` → `POST /api` (`server.js:3070, 5515-5547`) → `adminService.unassignDailyCleanCustomer` (`adminService.js:3116-3153`) → deactivates `staff_assignments`, broadcasts SSE `CUSTOMER_ASSIGNMENT_CHANGED` (`server.js:5531`).
4. **Inline Special Job Assignment (`assignSpecialJob`)**
   - `#jobAssignCustomerSelect`, `#jobAssignWorkType`, `#jobAssignDate`, `#jobAssignStaff` (`Index.html:1534-1537`) → `apiCall('assignSpecialJob', { jobData })` (`server.js:5356`).

#### Pagination, Auth, Validation & Lifecycle
- **Auth/RBAC:** `getDailyCleanAssignments`, `assignDailyCleanCustomer`, `unassignDailyCleanCustomer`, `assignSpecialJob` are all in `adminProtectedActions` (`server.js:3066, 3069-3071`).
- **Pagination / Filtering / Search:** No server-side pagination; client-side filtering on cached DCC roster & special jobs.
- **Validation / Error / Refresh:** HTML5 `required` attributes on inline `<select>`/`<input>`; errors surface via `showToast`; refreshes via SSE `CUSTOMER_ASSIGNMENT_CHANGED` / `SPECIAL_JOB_CHANGED` and 15s pulse. *(Note: `renderJobAssignmentsLedger` line `4742` calls orphaned `renderUnifiedAssignmentsLedger()` targeting missing DOM IDs; see `M-LEGACY-ORPHANS`.)*

---

### 2.7 `M-STAFF-TRACKING` — Live Staff GPS Telemetry & Stoppages

#### Data Paths
1. **Load Fleet Telemetry & Map Config (`getStaffTrackingSummary` + `getMapsConfig`)**
   - `switchAdminTab('staffTracking')` → `loadStaffTrackingTab(forceRefresh)` (`app.js:23338-23377`) → `apiCall('getStaffTrackingSummary', {})` → `POST /api` (`server.js:5156-5182`) → `repos.staffTracking.getCurrentTrackingSummary(date)` (`staffTrackingRepo.js`) → `public.staff_tracking_current`, `public.staff_stoppages`, `public.staff` → `{ success: true, kpis: { activeStaffCount, totalStaffCount, fleetDistanceKm, totalStoppages, avgDwellMinutes }, staff: [...], stoppages }` (`200`) → updates 4 KPI cards & `#trackingStaffListContainer`, initializes `TrackingMapAdapter.init('staffTrackingMapCanvas')` (`app.js:22927-22960`), which calls `apiCall('getMapsConfig', {})` (`server.js:5343-5349`) for `googleMapsApiKey` (falling back to OSM/Leaflet or SVG Radar).
2. **On-Demand Location Ping (`pingStaffLocation`)**
   - Staff row `Ping` button → `pingStaffFromAdmin(staffId, staffName, btnEl)` (`app.js:23490-23524`) → `apiCall('pingStaffLocation', { staffId })` → `POST /api` (`server.js:5226-5255`) → `repos.staffTracking.createLocationPing(staffId, admin)` → inserts `public.staff_location_pings` (5-min TTL) → `{ success: true, ping }` (`200`) → starts accelerated **2,500 ms poll loop (8 cycles = 20s)** calling `loadStaffTrackingTab(true)`.
3. **Movement History & Stoppages Drawer (`getStaffMovementHistory`)**
   - Staff row `Route / Stops` button → `viewStaffStoppages(staffId, staffName)` (`app.js:23526-23592`) → `apiCall('getStaffMovementHistory', { staffId })` → `POST /api` (`server.js:5185-5223`) → `repos.staffTracking.getMovementHistory(staffId, date)` → `public.staff_locations` + `public.staff_stoppages` → `{ success: true, staffId, breadcrumbs, stoppages }` (`200`) → plots polyline & renders `#stoppagesTableContainer`.

#### Algorithms, Auth, Filtering & Lifecycle
- **Server-Side Telemetry Rules (`staffTrackingRepo.js`):** Haversine jitter suppression `< 15 m`; speed glitch rejection `> 150 km/h` and `> 50 m`; stoppage dwell threshold `>= 5 min`; stoppage exit `> 50 m`; customer geofence match `<= 120 m`.
- **Auth/RBAC:** `getStaffTrackingSummary` (`server.js:5156-5161`) and `pingStaffLocation` (`5226-5231`) enforce inline `resolveAdminSession` (`401`). `getStaffMovementHistory` (`5185-5202`) allows Admin or Staff (self-only `403`). **`getMapsConfig` (`server.js:5343-5349`) is completely unauthenticated**, returning `googleMapsApiKey` to public callers.
- **Pagination / Filtering / Search:** No server pagination; client-side status pills (`All`/`Moving`/`Stopped`/`Idle`) and text search (`app.js:23379-23471`).
- **Loading / Error / Empty / Refresh:** Sync badge shows `'Syncing...'` / `'Live Sync Active'` / `'Sync Error'`; auto-polls every **15,000 ms** (`startStaffTrackingAutoSync`, `app.js:23626-23633`), stopped on tab switch (`app.js:3041`).

---

### 2.8 `M-ROUTE-PLAN` — Route Management, Stop Sequence & Unassigned Workbench

#### Data Paths
1. **Load Routes Hub & Unassigned Workbench (`getAllRoutes` + `getUnassignedDccVehicles`)**
   - `switchAdminTab('sequence')` (`app.js:3094-3102`) → `initAdminRouteManagement()` → `refreshRouteManagementData()` (`app.js:16012-16045`) → `apiCall('getAllRoutes', {})` (`server.js:3089, 5930` → `routeService.getAllRoutes` → `public.routes` + `route_stops` counts) & `apiCall('getUnassignedDccVehicles', {})` (`server.js:3103, 6153` → `routeService.getUnassignedDccVehicles` → active `subscriptions` + `subscription_vehicles` not in `route_stops`) → renders `#rmRoutesGrid`, 6 KPIs, and `#rmUnassignedTableBody`.
2. **Route Detail & Stop Sequence (`getRouteDetails` + `reorderRouteStops`)**
   - Route card click → `openRouteDetailView(routeId)` (`app.js:16308-16418`) → `apiCall('getRouteDetails', { routeId })` (`server.js:3091, 5942` → `routeService.getRouteDetails`) → `renderRouteStops()`. Reordering moves stops in memory (`moveStopPosition`, `app.js:16530`), then **Save Sequence** (`saveRouteSequenceChanges`, `app.js:16566-16604`) → `apiCall('reorderRouteStops', { routeId, orderedStopIds })` (`server.js:3100, 6114` → `routeService.reorderRouteStops` atomic negative-offset tx swap in `public.route_stops` + mirrors `public.staff_route_sequences` + `audit_logs`).
3. **Create / Edit / Status / Delete Route**
   - `handleCreateRouteSubmit` → `createRoute` (`server.js:3092, 5955`); `handleEditRouteSubmit` → `updateRoute` (`server.js:3093, 5972`); `toggleRouteStatus` → `setRouteStatus` (`server.js:3094, 5987`); `executeDeleteRoute` → `deleteRoute` (`server.js:3095, 6002`).
4. **Assign / Unassign Staff to Route**
   - `executeAssignStaffToRoute` → `assignStaffToRoute` (`server.js:3096, 6017` → validates `isDccEligible`, handles staff transfer conflicts, mirrors `staff_assignments` & `staff_route_sequences`); `confirmUnassignStaff` → `unassignStaffFromRoute` (`server.js:3097, 6036`).
5. **Add / Transfer / Remove Stop & Batch Assign**
   - `executeAddStopToRoute` & `quickAssignUnassigned` & `executeBatchAssignToRoute` (sequential client loop calling `addStopToRoute` at `server.js:3098, 6055` per selected vehicle — **no bulk route-stop endpoint**, `API GAP — REQUIRES INVESTIGATION`); `executeTransferStop` → `moveStopBetweenRoutes` (`server.js:3101, 6093`); `executeRemoveStopFromRoute` → `removeStopFromRoute` (`server.js:3099, 6073`, compacts sequence `1..N`).
6. **Legacy Sequence Subtab (`#rmLegacySeqView`)**
   - `loadStaffSequenceData` → `getStaffSequence` (`server.js:3058, 3124-3155`, REST `GET /api/staff-sequence` at `server.js:2465` unused by V1 UI); `saveCurrentStaffSequence` → `saveStaffSequence` (`server.js:3059, 3158-3191`); `executeResetSequence` → `resetStaffSequence` (`server.js:3060, 3194-3219`).

#### Pagination, Auth, Validation & Lifecycle
- **Auth/RBAC:** All route and sequence actions are in `adminProtectedActions` (`server.js:3058-3060, 3089-3104`). **Unwired Backend:** `moveStopInRoute` (`server.js:6133`) and `getDailyRouteReconciliation` (`server.js:6243`).
- **Pagination / Filtering / Sorting / Search:** Client-side search, status/staff/area filters, and sort (`code_asc`, `name_asc`, `stops_desc`, `stops_asc`, `created_desc`) at `app.js:16163-16213`. No server-side pagination or `totalCount`.
- **Validation:** Client requires uppercased `rmNewRouteCode` & `rmNewRouteName` (`Index.html:4231-4290`, `app.js:16654-16665`), disables non-DCC staff (`!isStaffDccEligible`, `app.js:16826-16845`), and confirms before discarding unsaved sequence edits (`app.js:16421-16425`). Server validates unique `routeCode`, `validateDccEligibility` on `addStopToRoute`, `isDccEligible` on `assignStaffToRoute`, and duplicate stops.
- **Error / Loading / Empty / Refresh:** Modals render inline `#rmCreateRouteFormAlert` / `#rmEditRouteFormAlert` / `#rmAssignStaffAlert` / `#rmAddStopAlert` / `#rmTransferStopAlert` preserving inputs; inline reorder/delete/status failures use `alert(...)`; batch assign aggregates `successCount`/`failCount`/`lastErr` into `alert(msg)`. Route hub does **not** auto-reload on SSE (manual refresh or mutation re-fetch only).

---

### 2.9 `M-CUSTOMERS` — Customer Records, Multi-Locations/Vehicles, Packages & Bookings

#### Data Paths
1. **Load Customers (`getAllCustomers`)**
   - `checkAdminAuthStatus()` / `switchAdminTab('records')` → `loadAdminRecords(forceRefresh)` → `apiCall('getAllCustomers', { forceRefresh })` → `POST /api` (`server.js:3039, 3222-3227`) → `fetchAllLiveCustomers(forceRefresh)` → `adminService.getAllCustomers` (`adminService.js:98-333`) → `repos.customers.findAll` + batch queries on `service_locations`, `vehicles`, `subscriptions`, `subscription_vehicles`, `staff_assignments`, `service_jobs` → raw JSON array `[...]` (`200`) → `state.adminRecords` → `adminPagination` (`app.js:12024-12136`). *(REST `GET /api/customers` at `server.js:2195-2217` exists but is unused by `app.js`.)*
2. **Add Customer (`saveCustomer`)**
   - `#addCustomerForm` (`Index.html:2075`) → `handleCustomerSubmit()` → `apiCall('saveCustomer', { customerData })` → `POST /api` (`server.js:3047, 4185-4333`) → optional Cloudinary photo upload (`uploadToCloudinary`), Indian mobile validation, `adminService.saveCustomer` (`adminService.js:371-714`) → inserts `customers`, `service_locations`, `vehicles`, optional `subscriptions`/`subscription_vehicles`, `staff_assignments`, `staff_route_sequences`, `audit_logs` → `invalidateLiveCustomersCache()` broadcasts SSE `CUSTOMERS_CHANGED` → `{ success: true, ... }` (`200`).
3. **Edit Customer (`updateCustomer`)**
   - `openEditCustomerModal()` (`app.js:12401-12629`) → `#editCustomerForm` (`Index.html:2320`) → `handleEditCustomerSubmit()` (`app.js:15289+`) → `apiCall('updateCustomer', { customerData })` → `POST /api` (`server.js:3048, 4336-4474`) → `adminService.updateCustomer` (`adminService.js:719-1114`) → updates `customers` + syncs `service_locations`, `vehicles`, `subscriptions`, `audit_logs` → broadcasts `CUSTOMERS_CHANGED`.
4. **Delete Customer (`deleteCustomer`)**
   - Row/Modal delete → `apiCall('deleteCustomer', { id|customerId|customerCode, reason })` → `POST /api` (`server.js:3049, 4516-4550`) → `adminService.deleteCustomer` (`adminService.js:1119-1190`) → soft-deletes `customers` (`deleted_at`), stops active subscriptions, cancels route stops/assignments, writes `audit_logs` → broadcasts `CUSTOMERS_CHANGED`.
5. **Hindi Transliteration & Backfill (`/api/indic/*` + `backfillHindi`)**
   - Live input blur/typing → `transliterateTextViaApi()` (`app.js:1580+`) → `fetch('/api/indic/transliterate')` / `/api/indic/transliterate-customer` (`server.js:2394-2462`) → `indicTransliterateService.js` (Google Input Tools HTTPS + 2000-entry Map LRU).
   - Hidden button `#btnAdminBackfillHindi` (`Index.html:943`, `style="display: none;"`) → `handleBackfillHindi()` (`app.js:1728-1753`) → `apiCall('backfillHindi', {})` → `POST /api` (`server.js:4477-4513`) → `adminService.backfillHindiCustomerData('admin')` (`adminService.js:1940-2008`, `limit=1000`).
6. **Customer Packages & Bookings Sub-Tabs (Inside Edit Customer Modal)**
   - **Packages:** `loadCustomerPackagesForEditModal()` (`app.js:13906`) → `getCustomerPackages` (`server.js:3078, 5661`); `openSellPackageModalFromEditCustomer()` (`app.js:14093`) → `getPackageCatalog` (`server.js:5648`) & `sellCustomerPackage` (`server.js:3075, 5679`); `openRedeemPackageModal()` (`app.js:14334`) → `redeemPackageEntitlement` (`server.js:3076, 5695`); `cancelCustomerPackage` (`server.js:3077, 5716`); `getPackageRedemptionHistory` (`server.js:3079, 5737`).
   - **Bookings:** `getCustomerServiceJobs` (`server.js:3082, 5793`); `openCreateBookingModalFromCustomer()` (`app.js:14843`) → `getEligiblePackagesForBooking` (`server.js:3081, 5773`) & `createServiceBooking` (`server.js:3080, 5755`, broadcasts `SPECIAL_JOB_CHANGED`); `failServiceJob` (`server.js:3083, 5811`).

#### Pagination, Auth, Validation & Defects
- **Silent Truncation & Client-Only Pagination/Sort:** `server.js:3222-3227` ignores `limit`, `offset`, `search`, and `sort` from `payload`; `adminService.getAllCustomers` (`adminService.js:98`) hardcodes **`limit = 500, offset = 0`**, ordered `created_at DESC`, returning a raw JSON array with **no `totalCount`**! Records beyond 500 are silently truncated (`API GAP — REQUIRES INVESTIGATION`). Client pagination `adminPagination` (`25`/`50`/`100`/`All`, `app.js:12024-12136`), bilingual phonetic search, and filters run strictly client-side.
- **Auth/RBAC & Security Gaps:** Customer, package, and booking actions are in `adminProtectedActions` (`server.js:3039, 3047-3050, 3075-3083`). **Gaps:**
  - `toggleCustomerActive` (`server.js:3050`) is in `adminProtectedActions` and `customersRepo.toggleActive` (`customersRepo.js:300-310`) exists, **but no handler exists in `server.js`** -> returns `400 Unknown or unsupported action` (`API GAP — REQUIRES INVESTIGATION`).
  - `backfillHindi` (`server.js:4477-4513`) has **NO authentication** (missing from `adminProtectedActions` and no inline `resolveAdminSession`).
  - `getPackageCatalog` (`server.js:5648`) and `/api/indic/*` (`server.js:2394, 2434`) are unauthenticated.
- **Validation:** Client requires name, 10-digit phone (`Index.html:2089-2348`), location address (`app.js:12735`), package quantity `min="1"` (`Index.html:3963, 4034`). Server enforces `isValidIndianMobile` (`400`), `FOR UPDATE` package row locking, expiry, and capability validation.
- **Error / Loading / Empty / Refresh:** Edit modal preserves auto-draft (`initEditCustomerAutoDraft`, `app.js:12592`). **Bug:** `handleBackfillHindi` (`app.js:1728-1753`) disables `#btnAdminBackfillHindi` and omits `onFailure`, permanently locking the button if `apiCall` fails. Refreshes via SSE `CUSTOMERS_CHANGED` and 15s pulse.

---

### 2.10 `M-SERVICE-ASSIGN` — Service & Asset Assignment Console

#### Data Paths
- **Load & Filter Table:** Reads `state.adminRecords` (from `getAllCustomers`) → `renderServiceAssignTable()` (`app.js:23699-23788`) & `filterServiceAssign()` (`app.js:23790-23810`) filtering by category (`all`, `Daily Car Cleaning`, `Car Washing`, `Solar Panel Cleaning`, `none`) + search.
- **Assign / Update Service (`assignCustomerService`)**
  - Header button `Index.html:1060` (`onclick="openAssignServiceModal(0)"` — **Frontend Bug:** hardcoded index `0` always opens `state.adminRecords[0]` instead of selecting a customer!), row button `openAssignServiceModal(origIndex)` (`app.js:23783`), or Edit modal `openAssignServiceFromEditModal()` (`app.js:13672`) → `#assignServiceForm` (`Index.html:2596`) → `handleAssignServiceSubmit()` (`app.js:13789-13868`) → `apiCall('assignCustomerService', { serviceData })` → `POST /api` (`server.js:3072, 5577-5606`) → `adminService.assignCustomerService` (`adminService.js:3240-3461`) → updates `customers`, `subscriptions`, `vehicles`, `staff_assignments`, `audit_logs` → `invalidateLiveCustomersCache()` (`CUSTOMERS_CHANGED`).
- **Stop Service (`stopCustomerService`)**
  - `#btnStopServiceAction` → `handleStopServiceClickFromModal()` (`app.js:13870-13897`) → `prompt()` for `reason` → `apiCall('stopCustomerService', { customerId, reason })` → `POST /api` (`server.js:3073, 5607-5636`) → `adminService.stopCustomerService` (`adminService.js:3466-3517`) → stops active subscription/service while keeping customer active + `audit_logs` → `CUSTOMERS_CHANGED`.
- **Auth / Validation / Errors:** Both actions in `adminProtectedActions` (`server.js:3072-3073`). Client requires `assignServiceCategory`, `assignServicePkgType`, `assignServiceLocationSelect`, and `assignVehicleNumbers` (or `assignSolarPanelsCount` for Solar `app.js:13690-13695`), plus `assignServicePkgTypeCustom` when `'OTHER'`. Errors re-enable buttons, keep modal open, and show `showToast`.

---

### 2.11 `M-LEADS` — Leads Pipeline (Table & Kanban Views)

#### Data Paths
1. **Load Leads (`getLeads`)**
   - `switchAdminTab('leads')` / `refreshLeadsBadgeCount()` → `loadAdminLeads(forceRefresh)` (`app.js:11310-11339`) → `apiCall('getLeads', { forceRefresh })` → `POST /api` (`server.js:3040, 3230-3234`) → `adminService.getLeads` (`adminService.js:2013-2015`, `isLead: true, limit: 500`) → raw JSON array `[...]` (`200`) → `renderAdminLeadsTable()` (`app.js:11409-11556`) or `renderAdminLeadsKanban()` (`app.js:11558-11691`). *(REST `GET /api/leads` at `server.js:2220` exists with `NODE_ENV==='test'` auth bypass.)*
2. **Capture / Edit Lead (`saveLead` / `updateLead`)**
   - `#addLeadForm` (`Index.html:3251`) / `openEditLeadModal()` (`app.js:10754-10844`) → `handleLeadSubmit()` (`app.js:10942-11104`) → `apiCall('saveLead', { customerData: leadData })` (`server.js:3043, 4185-4333` → `adminService.saveCustomer` with `isLead=true, tag='lead'`) or `apiCall('updateLead', { leadId, leadData })` (`server.js:3046, 3363-3474` → `adminService.updateLead` `adminService.js:2020-2144`).
3. **Move Stage (`updateLeadStage`)**
   - Table dropdown / Kanban drag-drop → `updateLeadStage(leadId, newStage)` (`app.js:11274-11308`) → **optimistic UI update** → `apiCall('updateLeadStage', { leadId, stage: newStage, adminToken })` → `POST /api` (`server.js:3045, 3323-3362`) → updates `customers.lead_status`. On failure, reverts `lead.leadStatus = oldStage` and re-renders.
4. **Add Note (`addLeadNote`), Convert (`convertLead`), Delete (`deleteLead`)**
   - `#leadNoteForm` (`Index.html:3493`) → `handleSaveLeadNoteSubmit()` (`app.js:11911-11941`) → `apiCall('addLeadNote', { leadId, note })` (`server.js:3042, 3285-3322`).
   - `#convertLeadForm` (`Index.html:3409`) → `handleConvertLeadSubmit()` (`app.js:11812-11877`) → `apiCall('convertLead', { leadId, convertData })` (`server.js:3041, 3237-3284` → `adminService.convertLeadToCustomer` `adminService.js:2149-2283`) → promotes `is_lead=FALSE, tag='customer'`, creates subscription/vehicle/job + `audit_logs` → reloads leads & records, switches to `'records'` after 600ms.
   - `deleteLead()` (`app.js:11943-11960`) → `confirm(...)` → `apiCall('deleteLead', { leadId, reason })` (`server.js:3044, 4516-4550`).

#### Pagination, Auth, Validation & Real-Time Gap
- **Pagination / Filtering / Sorting / Search:** Server hardcodes **`limit = 500, offset = 0`** (`adminService.js:2013`), **no `totalCount`**, ignores client filter/sort params (`API GAP — REQUIRES INVESTIGATION`). Category, stage (`open`/`follow_up`/`quoted`/`ready`), and bilingual search run client-side (`applyLeadsFilters`, `app.js:11170-11193`).
- **Auth/RBAC & Validation:** All 7 lead actions in `adminProtectedActions` (`server.js:3040-3046`). Client validates `leadName` (`alert()` + focus) & `isValidIndianMobile` (`app.js:10948-10966`); phone optional on `saveLead` unless provided.
- **SSE Real-Time Gap:** `app.js:3347-3353` listens for `LEAD_CHANGED`, which `server.js` **never emits** (`API GAP — REQUIRES INVESTIGATION`); `updateLeadStage` & `addLeadNote` also omit `invalidateLiveCustomersCache()`.

---

### 2.12 `M-STAFF` — Staff Management, Capabilities, Designations & Org Hierarchy

#### Data Paths
1. **Load Staff Roster (`getStaffList`)**
   - `loadStaffListForAdmin()` → `apiCall('getStaffList', {})` → `POST /api` (`server.js:3013-3033`) → `adminService.getStaffList({ isAdmin })` (`adminService.js:1195-1291`) → `public.staff` LEFT JOIN `staff_auth`, `staff_designations`, `auth_sessions` → `sanitizeStaffForAdmin(s)` array (`200`) → renders `#adminStaffList`.
2. **Add / Edit Staff (`saveStaffMember`)**
   - `#addStaffForm` / `#editStaffForm` (`Index.html:2728, 3088`) → `handleAddStaffSubmit` / `handleEditStaffSubmit` (`app.js:8733+`) → `apiCall('saveStaffMember', { staffData })` → `POST /api` (`server.js:3051, 3655-4058`) → uploads KYC docs (`aadharFrontObj`, `aadharBackObj`, `bankPassbookObj`, `panCardObj`, `drivingLicenseObj`), validates `staffCapabilityService.checkCapabilityChangeConflicts` (`staffCapabilityService.js:237-280`), `staffDesignationService.validateReportingRelationship` (`staffDesignationService.js:276-394`), `adminService.saveStaffMember` (`adminService.js:1296-1521`) → upserts `staff`, `staff_auth`, `staff_service_capabilities`, `audit_logs`, revokes sessions if phone/PIN/active changed → `{ success: true, staff }` (`200`).
3. **Toggle Active, Unlock, Reveal PIN, Delete**
   - `toggleStaffActive` (`server.js:3053, 4059`), `unlockStaff` (`server.js:3055, 3531` → resets `staff_auth` lockout + revokes sessions + `clearAllRateLimitsForIdentifier` across all IPs), `revealStaffPin` (`server.js:3061, 3598` → returns `staff_auth.display_pin`), `deleteStaffMember` (`server.js:3052, 4100` → soft-deletes staff & unassigns routes/customers).
4. **Designations & Hierarchy Sub-Modals**
   - `getDesignationsList` (`server.js:3105, 6255`), `saveDesignation` (`server.js:3106, 6267` → `staffDesignationService.saveDesignation`), `deleteDesignation` (`server.js:3107, 6280` → blocks `is_system_protected` or assigned staff), `getStaffHierarchy` (`server.js:3108, 6293`).

#### Validation, Auth & Frontend Defect
- **Auth/RBAC:** All mutating/sensitive staff & designation actions in `adminProtectedActions` (`server.js:3051-3056, 3061, 3105-3108`). `getStaffList` (`server.js:3013`) is mixed Public/Admin (`sanitizeStaffForPublic` vs `sanitizeStaffForAdmin`). **Unwired:** `resetStaffPin` (`server.js:3054, 3475`).
- **Validation:** Client enforces `required` name, phone (`maxlength="14"`), 6-digit PIN `pattern="[0-9]{6}"` (`Index.html:2788-2809, 3088-3096`), designation ID `pattern="[a-z0-9_]{3,32}"` (`Index.html:3838`). Server validates unique 10-digit Indian mobile, mandatory 6-digit PIN for new staff, active route/job conflicts on capability removal, and BFS cycle detection (`depth <= 25`) + `mgrLevel >= subLevel` on reporting lines.
- **Button-Lock UI Defect (`app.js:8732-8749`):** `handleEditStaffSubmit` sets `btn.disabled = true` and `btn.innerHTML = '<span>⏳</span> Saving...'` at lines `8733-8734` **before** checking `if (editCaps.length === 0)` at line `8746`; on zero capabilities it triggers `alert(...)` and `return`s at line `8748` without re-enabling the button, permanently locking the modal submit button (`API GAP — REQUIRES INVESTIGATION` / UX integrity defect).
- **Pagination / Refresh:** No server pagination (`ORDER BY staff_code ASC`); reloads explicitly after mutations.

---

### 2.13 `M-UNWIRED-BACKEND` — Implemented Backend APIs Without Active Admin V1 UI

All endpoints below are genuinely implemented in `server.js` + `services/` + `db/repositories/` (and protected by `resolveAdminSession`), but have **zero active callers** in `public/js/app.js` or `Index.html`. Every item is flagged **`API GAP — REQUIRES INVESTIGATION`** for V2 UI wiring decisions:

| Endpoint / Action | `server.js` Line | Service / Repo | Purpose & Status |
|---|---|---|---|
| `POST /api { action: 'getAuditLogs' }` | `3074, 4571-4588` | `repos.auditLogs.queryLogs` (`limit=100, offset=0`) | Immutable `audit_logs` query (`entityType`, `entityId`); no `totalCount`. |
| `POST /api { action: 'getDailyRouteReconciliation' }` | `3104, 6243-6252` | `routeService.getDailyRouteReconciliation` | Reconciles planned `route_stops` vs `service_logs` for `operationalDate`. |
| `POST /api { action: 'getCustomerDccDetails' }` / `'getCustomerDccSubscriptions'` | `3084-3085, 5839-5854` | `dccService.getCustomerDccDetails` | Dedicated DCC subscription & `subscription_vehicles` detail view. |
| `POST /api { action: 'renewCustomerDccSubscription' }` / `'stopCustomerDccSubscription'` / `'cancelCustomerDccSubscription'` | `3086-3088, 5857-5923` | `dccService.renewSubscription` / `stopSubscription` / `cancelSubscription` | Granular DCC subscription lifecycle (V1 UI only calls legacy `stopCustomerService`). |
| `POST /api { action: 'resetStaffPin' }` | `3054, 3475-3528` | `authService.resetStaffPin` | Dedicated PIN reset + session revocation + `audit_logs` (V1 UI edits PIN via `saveStaffMember`). |
| `POST /api { action: 'moveStopInRoute' }` | `3102, 6133-6150` | `routeService.moveStopInRoute` | Single-stop `up`/`down`/`top`/`bottom` move (V1 UI uses client reorder + `reorderRouteStops`). |
| `PUT/POST /api/admin/homepage-config` | `2254-2283` | `homepageConfigService.updateHomepageConfig` | Admin CMS update for `public.homepage_settings` (rates, offers, coupons, GST, contact). |
| `GET /api/admin/job-applications` | `2381-2391` | `careerService.getJobApplications` (`limit=100`) | Lists `public.job_applications` (has `NODE_ENV==='test'` auth bypass; `jobApplicationsRepo.updateJobApplicationStatus` has no route). |
| `POST /api { action: 'getStaffRouteView' }` / `'getStaffRouteWorklist'` | `6165-6242` | `routeService.getStaffRouteView` / `Worklist` | Dual Admin/Staff route worklist; Admin V1 UI never calls it. |
| `POST /api { action: 'getServiceCatalog' }` | `5637-5647` | `serviceCatalog.js` | Public catalog (`categories`, `seaterTypes`, `solarConfig`); Admin V1 UI hardcodes options. |
| `POST /api { action: 'cleanAndSyncStaff' }` | `3056, 5075-5083` | `server.js` inline | Legacy no-op returning sanitized `staffList`. |

---

### 2.14 `M-LEGACY-ORPHANS` — Dead / Orphaned Frontend Controllers & Legacy Subviews

1. **Orphaned Unified Job Assignment & Staff Performance Controllers (`public/js/app.js:4746-5606`):**
   - Functions `handleUniServiceFilterClick`, `handleUniAssignmentsFilterChange`, `handleUniAssignmentsSearch`, `renderUnifiedAssignmentsLedger` (`app.js:4779`), `openUnifiedJobAssignModal` (`app.js:5188`), `closeUnifiedJobAssignModal` (`app.js:5231`), and `toggleStaffPerformanceSection` (`app.js:5589`) query DOM IDs **`unifiedAssignmentsTableBody`**, **`unifiedJobAssignModal`**, **`uniAssignmentsTotalChip`**, and **`staffPerformanceSection`** — **none of which exist in `Index.html`**.
   - Note: `renderJobAssignmentsLedger()` (`app.js:4742`) still invokes `renderUnifiedAssignmentsLedger()`, which exits silently on missing `#unifiedAssignmentsTableBody`. There is no dedicated unified assignments backend endpoint (`API GAP — REQUIRES INVESTIGATION` — exclude dead code from V2).
2. **Legacy Staff Sequence View (`#rmLegacySeqView`, `Index.html:810-861`, `app.js:17768-18397`):**
   - Active subtab `'legacy'` inside `M-ROUTE-PLAN` calling `getStaffSequence`, `saveStaffSequence`, `resetStaffSequence` (`server.js:3124-3219`) against `staff_route_sequences` alongside the V2 multi-route `routes`/`route_stops` engine.

---

### 2.15 `M-HIDDEN-SUPPRESSED` — Hidden, Suppressed & Alias UI Elements (Data & Security Cross-Reference)

All hidden/suppressed DOM controls and tab aliases inventoried in M1 §3.13 share data paths with their parent modules (`M-CUSTOMERS`, `M-CLEAN-REPORTS`, `M-JOB-ASSIGN`, `M-SHELL`, `M-SPECIAL-JOBS`):
1. **`#btnAdminBackfillHindi` (`Index.html:943`, `style="display: none;"`):** Calls `handleBackfillHindi()` (`app.js:1728-1753`) → unauthenticated `POST /api { action: 'backfillHindi' }` (`server.js:4477-4513`, see §2.9 #5; omits `onFailure` callback and lacks auth check).
2. **Suppressed Shell, Report & Legacy Controls:** `#sideNavDashboard` (`Index.html:598`), `#adminTabAddCust` (`Index.html:644`), `#accountDropdownWrap`/`#adminLogoutBtn` (`Index.html:126-148`), `.sidebar-nav-list .admin-tab-badge` / `.hub-live-badge` (`style.css:15774-15778`), `.reports-kpi-grid` (`Index.html:1256-1264`, still populated by `renderDailyCleanReports()` for `M-DASH`), `#dccUnassignedBanner` (`Index.html:1456-1464`, force-hidden at `app.js:4246-4249`), `#filterAdminCategory`/`#filterAdminStaff`/`.cwp-seg-nav` (`Index.html:958-995`), and `#btnLightboxSendWhatsApp` (`Index.html:1757`, staff-only).
3. **Tab Aliases (`app.js:2645, 2945-2956`):** `washSolar` redirects to `specialJobs` (`M-SPECIAL-JOBS`); `addCust` opens `#addCustomerModal` and redirects to `records` (`M-CUSTOMERS`).

---

## 3. Complete Endpoint, Action & Database Reference Appendix

### 3.1 REST, Health & SSE Endpoints (`server.js:1767-2604`)

| # | Method & Path | `server.js` Line | Auth Tier | Query / Body | Response Shape | Target Module(s) |
|---|---|---|---|---|---|---|
| 1 | `GET /health`, `/healthz`, `/ping` | `1767-1790` | Public | None | `{ status: 'ok', service, domain, database, provider, databaseHealthy, adminConfigured, cloudinary, dataSource, time }` | Infra / Health |
| 2 | `GET /api/cloudinary-status` | `1793-1799` | Public | None | `{ configured, cloudName }` | Infra / Media |
| 3 | `GET /api/admin-realtime-stream` | `2089-2123` | Admin (`?token=` or Bearer) | `?token=` | SSE (`CONNECTED`, `PING` 20s, `CUSTOMERS_CHANGED`, `DAILY_CLEAN_CHANGED`, `SPECIAL_JOB_CHANGED`, `CUSTOMER_ASSIGNMENT_CHANGED`) | `M-SHELL`, `M-DASH`, `M-CLEAN-REPORTS`, `M-SPECIAL-JOBS`, `M-CUSTOMERS`, `M-LEADS` |
| 4 | `GET /api/staff-ping-stream` | `2126-2168` | Staff (self) or Admin (`?token=` or Bearer) | `?staffId=&token=` | SSE (`LOCATION_PING` polled every 3s from `staff_location_pings`) | Staff PWA (`M-STAFF-TRACKING` peer) |
| 5 | `GET /api/staff` | `2171-2192` | Mixed Public / Optional Admin | None | `Array<StaffSanitized>` (`sanitizeStaffForPublic` vs `sanitizeStaffForAdmin`) | Public / `M-STAFF` |
| 6 | `GET /api/customers` | `2195-2217` | Admin or Staff *(skipped if `NODE_ENV==='test'`)* | None | `{ success: true, records: [...] }` (`limit=500`, unused by `app.js`) | `M-CUSTOMERS` (unused REST mirror) |
| 7 | `GET /api/leads` | `2220-2241` | Admin *(skipped if `NODE_ENV==='test'`)* | None | `{ success: true, leads: [...] }` (`limit=500`, unused by `app.js`) | `M-LEADS` (unused REST mirror) |
| 8 | `GET /api/public/homepage-config` | `2244-2251` | Public | None | Homepage config JSON (`contact`, `gst`, `rates`, `offers`, `coupons`, `stats`) | Public Website |
| 9 | `PUT/POST /api/admin/homepage-config` | `2254-2283` | Admin (Bearer) | JSON updates (1MB max) | `{ success: true, config }` | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 10 | `POST /api/leads`, `POST /api/public/book` | `2286-2352` | Public | `{ name, phone, address, vehicle, interestedService, notes }` (1MB max) | `{ success: true, lead }` | Public Website -> `M-LEADS` |
| 11 | `POST /api/careers/apply` | `2355-2378` | Public | `{ name, mobile, age, gender, city, email, remark, fileData }` (15MB max) | `{ success: true, application }` | Public Careers |
| 12 | `GET /api/admin/job-applications` | `2381-2391` | Admin *(skipped if `NODE_ENV==='test'`)* | None | `{ success: true, applications }` (`limit=100`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 13 | `POST /api/indic/transliterate` | `2394-2431` | Public *(No auth)* | `{ text, type: 'name'\|'address'\|'general' }` (10MB max) | `{ success: true, text, transliterated }` | `M-CUSTOMERS`, `M-LEADS` |
| 14 | `POST /api/indic/transliterate-customer` | `2434-2462` | Public *(No auth)* | `{ name, address, secondaryAddress }` (10MB max) | `{ success: true, nameHi, addressHi, secondaryAddressHi }` | `M-CUSTOMERS` |
| 15 | `GET /api/staff-sequence` | `2465-2499` | Admin (Bearer) | `?staffId=STF01` | `{ success: true, staffId, staffName, customers, totalCount, hasCustomSequence }` | `M-ROUTE-PLAN` (unused REST mirror) |
| 16 | `GET /api/staff-data` | `2502-2604` | Staff (own) or Admin | `?staffId=&version=` / `If-None-Match` | Staff payload (`dailyCarCleaning`, `carWashing`, `solarCleaning`, `version`, `ETag`) or `{ unchanged: true }` | Staff PWA |

*(Note: Static HTML portals `/admin`, `/admin/*`, `/admin-v2`, `/admin/v2`, `/staff`, `/careers`, `/`, `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/sw.js`, `/uploads/*` are served via `GET` at `server.js:1807-2086, 6657-6750`. Any unmatched `/api/*` returns `404` at `server.js:6652-6655`.)*

---

### 3.2 Complete `POST /api` (and `POST /`) Action Catalog (All 100 Implemented Actions + 1 Stub)

| # | Action (`payload.action`) | `server.js` Line | Auth Tier | Module / Wiring Status |
|---|---|---|---|---|
| 1 | `verifyAdminPassword` | `2635-2719` | Public + Rate-Limit (`5`/5m) | `M-AUTH` (Wired) |
| 2 | `logoutAdmin` | `2722-2734` | Public (revokes token) | `M-AUTH` (Wired) |
| 3 | `verifyStaffPin` | `2736-2899` | Public + Rate-Limit (`5`/5m) | Staff PWA (Staff-only) |
| 4 | `logoutStaff` | `2900-2911` | Staff (`staffToken`) | Staff PWA (Staff-only) |
| 5 | `updateAdminPassword` | `3057, 4143-4182` | Admin (`adminProtectedActions`) | `M-AUTH` (Wired; **bypasses `authService.updateAdminPassword`**) |
| 6 | `resetStaffPin` | `3054, 3475-3528` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`M-STAFF` unwired; `API GAP — REQUIRES INVESTIGATION`) |
| 7 | `unlockStaff` | `3055, 3531-3595` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 8 | `revealStaffPin` | `3061, 3598-3653` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 9 | `getAllCustomers` | `3039, 3222-3227` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` / `M-SERVICE-ASSIGN` (Wired; hardcoded `limit=500`) |
| 10 | `saveCustomer` | `3047, 4185-4333` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 11 | `updateCustomer` | `3048, 4336-4474` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 12 | `deleteCustomer` | `3049, 4516-4550` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 13 | `backfillHindi` | `4477-4513` | **Public (SECURITY GAP!)** | `M-CUSTOMERS` (Hidden UI `#btnAdminBackfillHindi`; missing auth) |
| 14 | `getLeads` | `3040, 3230-3234` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired; hardcoded `limit=500`) |
| 15 | `saveLead` | `3043, 4185-4333` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired) |
| 16 | `updateLead` | `3046, 3363-3474` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired) |
| 17 | `updateLeadStage` | `3045, 3323-3362` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired; no SSE broadcast) |
| 18 | `addLeadNote` | `3042, 3285-3322` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired; no SSE broadcast) |
| 19 | `convertLead` | `3041, 3237-3284` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired) |
| 20 | `deleteLead` | `3044, 4516-4550` | Admin (`adminProtectedActions`) | `M-LEADS` (Wired) |
| — | `toggleCustomerActive` *(STUB)* | `3050` *(no handler)* | Admin (`adminProtectedActions`) | **BROKEN STUB (`400 Unknown action`)** (`API GAP — REQUIRES INVESTIGATION`) |
| 21 | `getStaffList` | `3013-3033` | Mixed Public / Admin | `M-STAFF` / `M-AUTH` (Wired; `v2-auth.js` misuse bug) |
| 22 | `saveStaffMember` | `3051, 3655-4058` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 23 | `toggleStaffActive` | `3053, 4059-4098` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 24 | `deleteStaffMember` | `3052, 4100-4141` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 25 | `cleanAndSyncStaff` | `3056, 5075-5088` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (Legacy no-op) |
| 26 | `getDesignationsList` | `3105, 6255-6265` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 27 | `saveDesignation` | `3106, 6267-6278` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 28 | `deleteDesignation` | `3107, 6280-6291` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 29 | `getStaffHierarchy` | `3108, 6293-6303` | Admin (`adminProtectedActions`) | `M-STAFF` (Wired) |
| 30 | `getDailyCleanReports` | `3062, 4842-4955` | Admin (`adminProtectedActions`) | `M-CLEAN-REPORTS` / `M-DASH` (Wired; `limit=200`) |
| 31 | `updateDailyCleanReportStatus` | `3063, 4957-5021` | Admin (`adminProtectedActions`) | `M-CLEAN-REPORTS` (Wired) |
| 32 | `deleteDailyCleanReport` | `3064, 5022-5074` | Admin (`adminProtectedActions`) | `M-CLEAN-REPORTS` (Wired) |
| 33 | `assignDailyCleanCustomer` | `3069, 5482-5514` | Admin (`adminProtectedActions`) | `M-JOB-ASSIGN` / `M-SPECIAL-JOBS` (Wired) |
| 34 | `unassignDailyCleanCustomer` | `3070, 5515-5547` | Admin (`adminProtectedActions`) | `M-JOB-ASSIGN` (Wired) |
| 35 | `getDailyCleanAssignments` | `3071, 5548-5576` | Admin (`adminProtectedActions`) | `M-JOB-ASSIGN` (Wired) |
| 36 | `assignCustomerService` | `3072, 5577-5606` | Admin (`adminProtectedActions`) | `M-SERVICE-ASSIGN` (Wired) |
| 37 | `stopCustomerService` | `3073, 5607-5636` | Admin (`adminProtectedActions`) | `M-SERVICE-ASSIGN` (Wired) |
| 38 | `getCustomerDccDetails` | `3084, 5839-5854` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 39 | `getCustomerDccSubscriptions` | `3085, 5839-5854` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (Alias of #38) |
| 40 | `renewCustomerDccSubscription` | `3086, 5857-5879` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 41 | `stopCustomerDccSubscription` | `3087, 5882-5901` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 42 | `cancelCustomerDccSubscription` | `3088, 5904-5923` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 43 | `getStaffSequence` | `3058, 3124-3155` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` Legacy Subtab (Wired) |
| 44 | `saveStaffSequence` | `3059, 3158-3191` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` Legacy Subtab (Wired) |
| 45 | `resetStaffSequence` | `3060, 3194-3219` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` Legacy Subtab (Wired) |
| 46 | `getAllRoutes` | `3089, 5930-5940` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` / `M-CLEAN-REPORTS` (Wired) |
| 47 | `getRoutes` | `3090, 5930-5940` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Alias of `getAllRoutes`) |
| 48 | `getRouteDetails` | `3091, 5942-5953` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 49 | `createRoute` | `3092, 5955-5970` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 50 | `updateRoute` | `3093, 5972-5985` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 51 | `setRouteStatus` | `3094, 5987-6000` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 52 | `deleteRoute` | `3095, 6002-6015` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 53 | `assignStaffToRoute` | `3096, 6017-6034` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 54 | `unassignStaffFromRoute` | `3097, 6036-6053` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 55 | `addStopToRoute` | `3098, 6055-6071` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired; also used in batch loop) |
| 56 | `removeStopFromRoute` | `3099, 6073-6091` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 57 | `moveStopBetweenRoutes` | `3101, 6093-6112` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 58 | `reorderRouteStops` | `3100, 6114-6131` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 59 | `moveStopInRoute` | `3102, 6133-6150` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 60 | `getUnassignedDccVehicles` | `3103, 6153-6163` | Admin (`adminProtectedActions`) | `M-ROUTE-PLAN` (Wired) |
| 61 | `getDailyRouteReconciliation` | `3104, 6243-6252` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`API GAP — REQUIRES INVESTIGATION`) |
| 62 | `getStaffRouteView` | `6165-6200` | Dual Admin / Staff | `M-UNWIRED-BACKEND` / Staff PWA |
| 63 | `getStaffRouteWorklist` | `6202-6241` | Dual Admin / Staff | `M-UNWIRED-BACKEND` / Staff PWA |
| 64 | `getServiceCatalog` | `5637-5647` | Public | `M-UNWIRED-BACKEND` |
| 65 | `getPackageCatalog` | `5648-5659` | Public | `M-CUSTOMERS` (Sell Package modal) |
| 66 | `getCustomerPackages` | `3078, 5661-5677` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Edit modal Packages tab) |
| 67 | `sellCustomerPackage` | `3075, 5679-5693` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 68 | `redeemPackageEntitlement` | `3076, 5695-5714` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 69 | `cancelCustomerPackage` | `3077, 5716-5735` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 70 | `getPackageRedemptionHistory` | `3079, 5737-5753` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Wired) |
| 71 | `createServiceBooking` | `3080, 5755-5771` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Bookings tab) |
| 72 | `getEligiblePackagesForBooking` | `3081, 5773-5791` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Bookings tab) |
| 73 | `getCustomerServiceJobs` | `3082, 5793-5809` | Admin (`adminProtectedActions`) | `M-CUSTOMERS` (Bookings tab) |
| 74 | `assignSpecialJob` | `3066, 5356-5397` | Admin (`adminProtectedActions`) | `M-SPECIAL-JOBS` / `M-JOB-ASSIGN` (Wired) |
| 75 | `getSpecialJobs` | `3065, 5398-5436` | Admin (`adminProtectedActions`) | `M-SPECIAL-JOBS` / `M-DASH` (Wired; `limit=200`, `INNER JOIN` bug) |
| 76 | `reassignSpecialJob` | `3067, 5437-5481` | Admin (`adminProtectedActions`) | `M-SPECIAL-JOBS` (Wired) |
| 77 | `startSpecialJob` | `6305-6388` | Dual Admin / Staff | Staff PWA (`M-SPECIAL-JOBS` lifecycle) |
| 78 | `completeSpecialJob` | `6390-6497` | Dual Admin / Staff | Staff PWA (`M-SPECIAL-JOBS` lifecycle) |
| 79 | `completeServiceBooking` | `6390-6497` | Dual Admin / Staff | Alias of `completeSpecialJob` |
| 80 | `failServiceJob` | `3083, 5811-5838` | Admin (`adminProtectedActions`) + Staff inline | `M-CUSTOMERS` / Staff PWA |
| 81 | `failServiceBooking` | `5811-5838` | Dual Admin / Staff (inline) | Alias of `failServiceJob` |
| 82 | `cancelSpecialJob` | `6543-6637` | Dual Admin / Staff | Staff PWA / Lifecycle (**Audit log key mismatch bug**) |
| 83 | `cancelBooking` | `6543-6637` | Dual Admin / Staff | Alias of `cancelSpecialJob` |
| 84 | `deleteSpecialJob` | `3068, 6498-6541` | Admin (`adminProtectedActions`) | `M-SPECIAL-JOBS` (Wired) |
| 85 | `getStaffData` | `2914-3011` | Staff (`staffToken`) | Staff PWA |
| 86 | `syncCompletions` | `4553-4570` | Staff (`resolveStaffSession`) | Staff PWA offline sync |
| 87 | `recordDailyCleanWithPhoto` | `4591-4841` | Dual Admin / Staff | Staff PWA |
| 88 | `recordStaffHeartbeat` | `5090-5155` | Dual Admin / Staff | Staff PWA GPS tracking |
| 89 | `recordStaffLocationHeartbeat` | `5090-5155` | Dual Admin / Staff | Alias of `recordStaffHeartbeat` |
| 90 | `getStaffTrackingSummary` | `5156-5182` | Inline Admin-Only | `M-STAFF-TRACKING` (Wired) |
| 91 | `getStaffTrackingData` | `5156-5182` | Inline Admin-Only | Alias of `getStaffTrackingSummary` |
| 92 | `getStaffMovementHistory` | `5185-5223` | Dual Admin / Staff | `M-STAFF-TRACKING` (Wired) |
| 93 | `pingStaffLocation` | `5226-5255` | Inline Admin-Only | `M-STAFF-TRACKING` (Wired) |
| 94 | `requestStaffLocationPing` | `5226-5255` | Inline Admin-Only | Alias of `pingStaffLocation` |
| 95 | `respondToLocationPing` | `5258-5300` | Dual Admin / Staff | Staff PWA |
| 96 | `respondStaffLocationPing` | `5258-5300` | Dual Admin / Staff | Alias of `respondToLocationPing` |
| 97 | `getPendingStaffPings` | `5302-5342` | Dual Admin / Staff | Staff PWA |
| 98 | `checkStaffLocationPing` | `5302-5342` | Dual Admin / Staff | Alias of `getPendingStaffPings` |
| 99 | `getMapsConfig` | `5343-5349` | Public *(No auth)* | `M-STAFF-TRACKING` (Wired) |
| 100 | `getAuditLogs` | `3074, 4571-4588` | Admin (`adminProtectedActions`) | `M-UNWIRED-BACKEND` (`limit=100`; `API GAP — REQUIRES INVESTIGATION`) |

---

### 3.3 PostgreSQL Database Schema Map (27 Public Tables + `meta.schema_migrations` = 28 Tables)

> **Migration Prefix Risk (`migrations/migrate.js:85-95`):** `migrate.js` parses the numeric prefix `^(\d+)_` as the primary key `version` in `meta.schema_migrations`. Because **two** migration files share prefix `019_` (`019_add_device_id_to_auth_sessions.sql` and `019_enhance_dcc_core_operations.sql`), running `migrate.js` sequentially records `version = '019'` on the first file and **skips** `019_enhance_dcc_core_operations.sql` on a fresh database unless applied manually. Note also that `21` files exist in `db/repositories/` (`index.js` + `20` repo modules), whereas `migrations/*.sql` provisions `27` `public.*` tables (`homepage_settings` is queried directly in `homepageConfigService.js`, and several repos manage multiple related tables).

| # | Table | Origin Migration(s) | Repository (`db/repositories/*.js`) | Key Role / Admin Consumers |
|---|---|---|---|---|
| 0 | `meta.schema_migrations` | `migrate.js`, `001` | `migrations/migrate.js` | Migration version, SHA-256 checksum & timestamp |
| 1 | `public.service_categories` | `001`, `007` | `serviceCategoriesRepo.js` *(unused at runtime)* | Canonical category reference (`daily_car_cleaning`, `car_washing`, `solar_cleaning`, `interior_detailing`, `exterior_detailing`) |
| 2 | `public.customers` | `001`–`004`, `006`, `007` | `customersRepo.js` | Master customers & leads (`is_lead`, `lead_status`, `name_hi`, `deleted_at`) |
| 3 | `public.service_locations` | `001`, `002`, `014` | `serviceLocationsRepo.js` | Multi-location addresses (`is_primary`, `address_text_hi`, `lat/lng`, `parking_details`) |
| 4 | `public.vehicles` | `001`, `006`, `007` | `vehiclesRepo.js` | Customer vehicles (`registration_no`, `car_make`, `car_color`, `seater_type`, `default_location_id`) |
| 5 | `public.staff` | `001`, `010`, `021`, `022` | `staffRepo.js` | Staff roster, KYC URLs, salary, `weekly_off`, `work_type`, `designation_id`, `reports_to_id` |
| 6 | `public.staff_auth` | `001` | `staffAuthRepo.js` | Scrypt `pin_hash`, `salt`, `display_pin`, `failed_attempts`, `locked_until` |
| 7 | `public.staff_service_capabilities` | `021` | `staffRepo.js` / `staffCapabilityService.js` | Normalized staff <-> `service_categories` capability mapping |
| 8 | `public.staff_designations` | `022` | `designationsRepo.js` | Hierarchy levels (`1..10`), `is_supervisory`, `authorities` JSONB, `is_system_protected` |
| 9 | `public.subscriptions` | `001`, `013`, `019` | `subscriptionsRepo.js` | DCC subscriptions (`status`, `start_date`, `end_date`, `package_name`, `rotation_type`, `stop_reason`) |
| 10 | `public.subscription_vehicles` | `001`, `014`, `019` | `subscriptionVehiclesRepo.js` | Enrolled vehicles & locations (`sequence_order`, `schedule_tag`) |
| 11 | `public.routes` | `020` | `routesRepo.js` | Named operational routes (`route_code`, `route_name`, `status`, `assigned_staff_id`) |
| 12 | `public.route_stops` | `020` | `routesRepo.js` | Ordered route stops (`route_id`, `sequence_order`, `subscription_id`, `vehicle_id`, `location_id`) |
| 13 | `public.staff_assignments` | `001` | `staffAssignmentsRepo.js` | Trigger-protected immutable assignment history (`subscription_id` or `job_id`) |
| 14 | `public.staff_route_sequences` | `001` | `staffRouteSequencesRepo.js` | Legacy/synced per-staff sequence (`staff_id`, `sequence_order`) |
| 15 | `public.service_jobs` | `001`, `005`, `007`, `009`, `014`, `015`, `018` | `serviceJobsRepo.js` | On-demand/special jobs (`status`, `scheduled_date/time`, `before_photos`, `after_photos`, `package_id`) |
| 16 | `public.service_logs` | `001`, `009`, `011`, `016`, `019` | `serviceLogsRepo.js` | Daily clean & job completion logs (`client_mutation_id`, `service_date` IST, `photo_url`, `admin_notes`) |
| 17 | `public.customer_packages` | `017` | `packagesRepo.js` | Sold service packages (`total_quantity`, `used_quantity`, `remaining_quantity`, `valid_until`, `status`) |
| 18 | `public.package_redemption_logs` | `017` | `packagesRepo.js` | Package redemption ledger (`package_id`, `service_job_id`) |
| 19 | `public.staff_locations` | `011` | `staffTrackingRepo.js` | GPS breadcrumb history |
| 20 | `public.staff_tracking_current` | `011` | `staffTrackingRepo.js` | Latest GPS snapshot & daily distance per staff |
| 21 | `public.staff_stoppages` | `011` | `staffTrackingRepo.js` | Dwell/stoppage events & nearest customer geofence |
| 22 | `public.staff_location_pings` | `011` | `staffTrackingRepo.js` | On-demand admin->staff GPS ping requests (`5m` TTL) |
| 23 | `public.admin_users` | `001` | `adminUsersRepo.js` | Admin accounts (`username`, `password_hash`, `role`, `is_active`) |
| 24 | `public.auth_sessions` | `001`, `019` | `authSessionsRepo.js` | Hashed session tokens (`adm_`/`stf_`, `device_id`, `revoked_at`, `expires_at`) |
| 25 | `public.audit_logs` | `001` | `auditLogsRepo.js` | Immutable change log (`entity_type`, `entity_id`, `action`, `before_state`, `after_state`) |
| 26 | `public.homepage_settings` | `012` | `homepageConfigService.js` *(direct `db.query`)* | Single-row (`id='primary_config'`) JSONB public rates/offers/coupons |
| 27 | `public.job_applications` | `012` | `jobApplicationsRepo.js` | Public career applicants & resume links |

#### Domain Services Inventory (16 Files in `services/`)
`adminService.js`, `authService.js`, `bilingualSearchService.js`, `bookingService.js`, `careerService.js`, `dccService.js`, `homepageConfigService.js`, `indicTransliterateService.js`, `offlineSyncService.js`, `packageService.js`, `routeService.js`, `seoConfig.js`, `serviceCatalog.js`, `staffCapabilityService.js`, `staffDesignationService.js`, `staffPortalService.js`.

---

## 4. API Gaps & Backend Defects Register

Every unavailable, unimplemented, unwired, broken, or missing API endpoint/capability discovered during repository inspection is registered below with the required marker **`API GAP — REQUIRES INVESTIGATION`**.

| # | Gap / Defect | Tag | Exact Verified Evidence (`file:line`) | Impact & Recommended V2 Action |
|---|---|---|---|---|
| 1 | **`toggleCustomerActive` Unimplemented Handler** | `API GAP — REQUIRES INVESTIGATION` | Listed in `adminProtectedActions` (`server.js:3050`), repo helper exists (`db/repositories/customersRepo.js:300-310`), **no** `payload.action === 'toggleCustomerActive'` handler in `server.js` (returns `400 Unknown or unsupported action` at `server.js:6639-6640`), zero UI callers. | Wire `server.js` -> `adminService`/`customersRepo.toggleActive` (plus `invalidateLiveCustomersCache()` & `audit_logs`) or omit toggle until implemented. |
| 2 | **`jobApplicationsRepo.updateJobApplicationStatus` Missing Route & `GET /api/admin/job-applications` Unwired** | `API GAP — REQUIRES INVESTIGATION` | `db/repositories/jobApplicationsRepo.js:81-93` defines `updateJobApplicationStatus`, **no** route or service calls it; `GET /api/admin/job-applications` (`server.js:2381-2391`) has zero UI callers and skips auth when `NODE_ENV === 'test'`. | Add `PATCH`/`POST` status-update route if Careers Admin is in scope for V2, and remove `NODE_ENV==='test'` auth bypass or gate strictly. |
| 3 | **`PUT/POST /api/admin/homepage-config` Unwired** | `API GAP — REQUIRES INVESTIGATION` | `server.js:2254-2283` -> `homepageConfigService.updateHomepageConfig` (`services/homepageConfigService.js:235-292`); zero callers in `app.js` / `Index.html`. | Add Admin V2 Homepage CMS editor if in scope, else mark out-of-scope. |
| 4 | **`getAuditLogs` Unwired + `limit=100` Cap** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3074, 4571-4588` -> `repos.auditLogs.queryLogs` (`db/repositories/auditLogsRepo.js:35-70`, default `limit=100, offset=0`, no `totalCount`); zero callers in `app.js` / `Index.html`. | Wire Admin V2 Audit Log viewer with `entityType`, `entityId`, date/actor filters, and server pagination. |
| 5 | **`getDailyRouteReconciliation` Unwired** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3104, 6243-6252` -> `routeService.getDailyRouteReconciliation` (`services/routeService.js:941-1114`); zero callers in `app.js` / `Index.html`. | Wire Route Reconciliation / Daily Coverage view in V2 `M-ROUTE-PLAN` or `M-CLEAN-REPORTS`. |
| 6 | **DCC Subscription Lifecycle Endpoints Unwired (`getCustomerDccDetails`, `renewCustomerDccSubscription`, `stopCustomerDccSubscription`, `cancelCustomerDccSubscription`)** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3084-3088, 5839-5923` -> `dccService` (`services/dccService.js:288, 371, 414, 810`); V1 UI only calls legacy `stopCustomerService` (`app.js:13882`). | Wire dedicated DCC subscription panel & lifecycle actions inside V2 `M-CUSTOMERS`. |
| 7 | **`resetStaffPin` Unwired in UI** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3054, 3475-3528` -> `authService.resetStaffPin` (`services/authService.js:434-469`); zero callers in `app.js` / `Index.html` (V1 edits PIN via `saveStaffMember`). | Wire dedicated PIN Reset modal in V2 `M-STAFF` to ensure `staff_auth` audit trail and session revocation. |
| 8 | **`moveStopInRoute` Unwired in UI** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3102, 6133-6150` -> `routeService.moveStopInRoute` (`services/routeService.js:675-698`); zero callers in `app.js`. | Optional quick-move helper; keep `reorderRouteStops` for explicit Save Sequence UX. |
| 9 | **Server-Side Pagination, `totalCount`, and Server-Side Sorting Missing Across List Endpoints** | `API GAP — REQUIRES INVESTIGATION` | `server.js:3222-3234` ignores `limit`/`offset`/`sort` on `getAllCustomers` & `getLeads` (`adminService.js:98, 2013` hardcode `limit=500`); `getDailyCleanReports` (`serviceLogsRepo.js:173+`) & `getSpecialJobs` (`adminService.js:2800`) hardcode `limit=200`; `getAuditLogs` (`auditLogsRepo.js:38`) & `jobApplications` (`jobApplicationsRepo.js:55`) hardcode `limit=100`; **none** return `totalCount`. | Add `{ page, pageSize, sortBy, sortDir, search, filters }` + `{ records, totalCount }` in V2 API contracts so Aura Task 07 grids do not silently truncate records or miscalculate `M-DASH` KPIs. |
| 10 | **Global Cross-Module Search Endpoint Missing** | `API GAP — REQUIRES INVESTIGATION` | `Index.html` Admin shell has no global search bar and `server.js` exposes no unified cross-entity search endpoint across customers, leads, staff, routes, and jobs. | Add `/api` global search endpoint (or keep per-module search) before wiring a shell search bar in V2 `M-SHELL`. |
| 11 | **Notifications Feed & Bulk Customer/Staff/Route-Stop Endpoints Missing** | `API GAP — REQUIRES INVESTIGATION` | No notifications feed endpoint exists (`M-SHELL`). No bulk customer/staff edit/delete/toggle endpoints exist (`M-CUSTOMERS`, `M-STAFF`). Route batch assignment (`executeBatchAssignToRoute` in `M-ROUTE-PLAN`) loops client-side calling single `addStopToRoute` (`server.js:6055`) per item. | Add transactional bulk endpoints (or explicit partial-failure batch wrapper) in V2 to guarantee accurate bulk reporting. |
| 12 | **`M-DASH` Server-Side KPI Aggregation Endpoint Missing** | `API GAP — REQUIRES INVESTIGATION` | `M-DASH` (`app.js:3133-3255`) aggregates client-side caches capped at `200`/`500` rows; no dedicated server KPI/analytics endpoint exists. | Add dedicated server-side KPI summary query to prevent silent undercounting when DB exceeds 200/500 rows. |
| 13 | **`unifiedJobAssignModal` / `unifiedAssignmentsTableBody` / `staffPerformanceSection` Orphaned Legacy Code** | `API GAP — REQUIRES INVESTIGATION` | Controllers in `app.js:4746-5606` target DOM IDs (`unifiedJobAssignModal`, `unifiedAssignmentsTableBody`, `staffPerformanceSection`) absent from `Index.html`; no dedicated unified assignment backend endpoint exists. | Do not port dead legacy controllers into Admin V2. |
| 14 | **`LEAD_CHANGED` Dead SSE Listener & Unbroadcast Lead Mutations** | `API GAP — REQUIRES INVESTIGATION` | `app.js:3347-3353` listens for `LEAD_CHANGED`, which `server.js` never emits (`broadcastAdminRealtimeEvent` calls at `1457, 4749, 4981, 5045, 5372, 5453, 5498, 5762, 5828, 5871, 5893, 5915, 6373, 6480, 6519, 6620`). `updateLeadStage` (`3323`) & `addLeadNote` (`3285`) emit no SSE event at all. | Emit `LEAD_CHANGED` (or `CUSTOMERS_CHANGED`) on `saveLead`, `updateLead`, `updateLeadStage`, `addLeadNote`, `convertLead`, `deleteLead`. |
| 15 | **`backfillHindi` Unauthenticated Mutation Gap + `handleBackfillHindi` Button-Lock Bug** | `API GAP — REQUIRES INVESTIGATION` | `server.js:4477-4513` omits `backfillHindi` from `adminProtectedActions` (`server.js:3038-3109`) and has no `resolveAdminSession` check. In `app.js:1728-1753`, `handleBackfillHindi()` disables `#btnAdminBackfillHindi` (`Index.html:943`, `display: none;`) and omits `onFailure`, locking the button permanently on error. | Add `backfillHindi` to `adminProtectedActions` and add `onFailure` button reset if exposed in V2. |
| 16 | **`updateAdminPassword` `authService` Bypass** | `API GAP — REQUIRES INVESTIGATION` | `server.js:4143-4182` updates `repos.adminUsers` directly (`min 4 chars`, no `currentPassword`, no session revocation), bypassing `authService.updateAdminPassword` (`services/authService.js:403-429`, `min 6 chars`, requires `currentPassword`, revokes active `auth_sessions`). | Route `server.js:4143` through `authService.updateAdminPassword` (and require current password in V2 security settings). |
| 17 | **`cancelSpecialJob` `auditLogs.logChange` Key Mismatch** | `API GAP — REQUIRES INVESTIGATION` | `server.js:6593-6600` passes `{ tableName, recordId, oldData, newData }` to `repos.auditLogs.logChange` instead of `{ entityType, entityId, beforeState, afterState }` (`db/repositories/auditLogsRepo.js:7-33`), causing a `NOT NULL` constraint failure on `entity_type` silently caught at `server.js:6601`. | Fix property names in `server.js:6593-6600` so job cancellations are recorded in `public.audit_logs`. |
| 18 | **`serviceJobsRepo.findAll` & `adminService.getSpecialJobsAdmin` `INNER JOIN` Data Visibility Bug** | `API GAP — REQUIRES INVESTIGATION` | `db/repositories/serviceJobsRepo.js:54` & `services/adminService.js:2847` use `JOIN public.service_locations loc ON j.location_id = loc.id` (unlike `findById` at `serviceJobsRepo.js:77` which uses `LEFT JOIN`), silently dropping jobs where `location_id IS NULL`. | Change to `LEFT JOIN public.service_locations` so jobs without a location ID remain visible. |
| 19 | **`openAssignServiceModal(0)` Hardcoded Index Bug** | `API GAP — REQUIRES INVESTIGATION` | `Index.html:1060` `+ Assign Service` header button passes hardcoded `0` (`openAssignServiceModal(0)`), always opening `state.adminRecords[0]` instead of selecting a customer (`app.js:13484-13488`). | In V2 `M-SERVICE-ASSIGN`, replace with a customer-picker selector when launched from the header CTA. |
| 20 | **`handleEditStaffSubmit` Button-Lock Bug** | `API GAP — REQUIRES INVESTIGATION` | `app.js:8732-8749` sets `btn.disabled = true` at line `8733` before checking `if (editCaps.length === 0)` at line `8746`, returning after `alert(...)` without re-enabling `#btnSaveEditStaff`. | Run all client validation checks **before** disabling submit buttons in V2 `M-STAFF`. |
| 21 | **`public/admin-v2/js/v2-auth.js` `checkSession()` Privilege Check Gap** | `API GAP — REQUIRES INVESTIGATION` | `v2-auth.js:42-68` calls `POST /api { action: 'getStaffList', token }` and returns `{ valid: res.ok }` (`48-63`). Because `getStaffList` (`server.js:3013-3033`) returns `200` to unauthenticated/staff callers, any non-empty `localStorage.cwp_admin_token` passes `checkSession()` without proving admin role. | Validate V2 admin sessions against an `adminProtectedActions` endpoint (or dedicated `verifyAdminSession` endpoint) rather than `getStaffList`. |
| 22 | **Unauthenticated Public Endpoints & `NODE_ENV==='test'` Bypasses + Duplicate `019_` Migration Prefix** | `API GAP — REQUIRES INVESTIGATION` | `getMapsConfig` (`server.js:5343`), `getPackageCatalog` (`5648`), and `/api/indic/*` (`2394, 2434`) require no session token; `GET /api/customers` (`2199`), `GET /api/leads` (`2223`), and `GET /api/admin/job-applications` (`2384`) bypass auth when `NODE_ENV==='test'`; `migrations/019_add_device_id_to_auth_sessions.sql` & `019_enhance_dcc_core_operations.sql` collide on PK `version='019'` in `migrations/migrate.js:85-95`. | Gate `getMapsConfig` / `/api/indic/*` for authenticated sessions in hardened builds, eliminate `NODE_ENV==='test'` route bypasses, and reconcile duplicate `019_` migration versioning. |
