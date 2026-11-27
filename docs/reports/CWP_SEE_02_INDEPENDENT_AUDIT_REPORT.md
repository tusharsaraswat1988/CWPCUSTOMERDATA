# CWP SEE-02 — Independent Backend Verification & Architecture Audit Report

**Audit Date:** 2026-11-27  
**Target Branch / Commit:** `main` @ `9a6dc001b7d2717cdd59817ed6ba113d218ee78c`  
**Target Database:** `cwp_customer_db` (Development Neon PostgreSQL)  
**Audit Mode:** Read-only forensic audit (zero code, schema, or data modifications)

---

## 1. Executive Verdict

**VERDICT: `REJECT / REMEDIATION REQUIRED`**

While the SEE-01 implementation establishes a solid database-driven schema (`migrations/025_create_see_engine_schema.sql`), immutable ledger/snapshot triggers, and clean modular services, independent forensic verification uncovered **2 P0 security/integrity defects** (staff IDOR on `/api/see/jobs/*` execution endpoints and non-atomic job/entitlement transaction boundaries) and **4 P1 high-severity gaps** (missing customer ownership checks on `createPurchase`, equipment check bypass on empty `equipment_available`, missing schedule/weekly-off conflict checks, and active parallel legacy endpoints bypassing SEE rules). These must be remediated before frontend integration or production migration.

---

## 2. Audit Scope & Restrictions
- Strictly read-only inspection of repository source (`services/`, `db/`, `migrations/`, `tests/`, `server.js`), git history, and `cwp_customer_db` metadata/counts.
- Zero DDL/DML executed, zero code edited, zero production resources touched, zero PII exposed.

---

## 3. Repository Commit & Working Tree State
- `git status`: Clean working tree on `main`, up to date with `origin/main` at `9a6dc00`.
- Commit `9a6dc00` added 18 files (+4,659 / -5 lines); no frontend files (`Index.html`, `public/**`) were modified.

---

## 4. Actual Implementation Inventory
- **Migration**: `migrations/025_create_see_engine_schema.sql` (applied `2026-11-27T03:58:51.899Z`, version `025` in `meta.schema_migrations`).
- **Repositories**: `db/repositories/seeCatalogueRepo.js`, `seeEntitlementRepo.js`, `seeOperationsRepo.js`, exported in `db/repositories/index.js`.
- **Services**: `seeCatalogueService.js`, `seeFrequencyService.js`, `seeStaffCapabilityService.js`, `seeEntitlementService.js`, `seeExecutionService.js`, `seeApiRouter.js`.
- **Server Wiring**: `server.js` mounts `seeApiRouter.handleSeeRequest` at `/api/see/*` (lines 7297–7305) and switches `getServiceCatalog` / `getPackageCatalog` to DB-driven `seeCatalogueService` when Neon is active (lines 6253–6293).

---

## 5. Feature Verification Matrix

| Feature | Claimed | Verified | Evidence | Risk |
|---|---|---|---|---|
| Service Catalogue & Versioning | Yes | **VERIFIED** | `services` + `service_versions` tables; `seeCatalogueService.js` CRUD/status; `test_see_engine_qa.js` Test 1 | Low |
| Frequency / Recurrence Engine | Yes | **PARTIAL** | `seeFrequencyService.js` handles 12 types + `Asia/Kolkata` + blackouts; `addMonthsYmd` drifts from day-31 anchor (`Jan 31 -> Feb 28 -> Mar 28`) | P2 |
| Package Engine & Pricing | Yes | **VERIFIED (with gap)** | Multi-benefit/add-on composition + city/zone/segment rules verified; `createPurchase` does not enforce `effective_from`/`effective_to` | P2 |
| Add-on Engine | Yes | **VERIFIED** | 5 execution modes + `addon_service_applicability` + `service_job_addons` | Low |
| Marketing Tags & Media | Yes | **VERIFIED** | `marketing_tags` + `media_assets` 1:1 / 4:3 ratio checks in `registerMediaAsset` | Low |
| Staff Types & Capabilities | Yes | **PARTIAL** | `staff_types`, `staff_capability_overrides` audited; **equipment check skipped when `staff.equipment_available` is `[]`**; no schedule/weekly-off overlap check | P1 |
| Purchase Snapshot | Yes | **PARTIAL** | `trg_immutable_purchase_snapshot` blocks `UPDATE`; **does not block `DELETE`**, and `createPurchase` lacks `vehicleId`/`locationId` customer ownership check | P1/P2 |
| Entitlement Ledger | Yes | **PARTIAL** | `FOR UPDATE` + `idempotency_key` + `chk_entitlement_ledger_balance` + `trg_immutable_entitlement_ledger` verified; **job creation/completion/termination call `mutateEntitlement` outside the job transaction** | P0 |
| Job Execution & Proof | Yes | **PARTIAL** | Backend proof/checklist/add-on checks work; **P0 IDOR on `/api/see/jobs/*` staff endpoints**; legacy `bookingService.js` bypasses SEE checks | P0/P1 |
| Solar Verification | Yes | **VERIFIED** | `solar_verifications` tracks `is_estimate`, `actual_panel_count`, discrepancy, and admin-only `solar-approve` | Low |

---

## 6. Ledger Integrity Findings
1. **Account Lock & Balance Invariants**: `seeEntitlementService.mutateEntitlement` acquires `SELECT ... FOR UPDATE` (`seeEntitlementRepo.js:119`), checks `idempotency_key` (`entitlement_ledger.idempotency_key` UNIQUE), and DB constraint `chk_entitlement_ledger_balance` enforces `remaining_qty = purchased_qty + adjusted_qty - reserved_qty - consumed_qty - expired_qty - refunded_qty` with `>= 0` checks on all non-adjustment columns.
2. **Append-Only Ledger**: `trg_immutable_entitlement_ledger` (`BEFORE UPDATE OR DELETE`) blocks ledger mutation at PostgreSQL level (verified in `information_schema.triggers`).
3. **P0 Defect — Split Transaction Boundaries**: In `seeExecutionService.js`:
   - `createCanonicalJob` (lines 137–218) commits `service_jobs` in `db.withTransaction`, then calls `mutateEntitlement({ entryType: 'reserve' })` outside the transaction.
   - `completeExecution` (lines 336–375) commits `service_jobs.status = 'completed'` and `service_executions` in `db.withTransaction`, then calls `consume` outside the transaction.
   - `terminateJobWithoutCompletion` (lines 384–418) updates `service_jobs` in `db.withTransaction`, then calls `release` outside the transaction.
   A failure or crash between the two transactions leaves job state and entitlement ledger inconsistent.

---

## 7. Snapshot Integrity Findings
- `purchase_snapshots` has `trg_immutable_purchase_snapshot` (`BEFORE UPDATE`) blocking updates to commercial terms, pricing, and definitions.
- **Gap (P2)**: Trigger does not cover `BEFORE DELETE`.
- **Gap (P1)**: `seeEntitlementService.createPurchase` (`services/seeEntitlementService.js:86-105`) does not verify that `vehicleId` or `locationId` belongs to `customerId`, and `purchase_snapshots` lacks compound FKs `(vehicle_id, customer_id)` / `(location_id, customer_id)`.

---

## 8. Staff Capability & Authorization Findings
- **P1 — Equipment Check Bypass**: `services/seeStaffCapabilityService.js:183` checks `if (Array.isArray(requiredEquipment) && requiredEquipment.length > 0 && staffEquip.length > 0)`. Because `staff.equipment_available` defaults to `'[]'::jsonb`, any staff member with no equipment recorded bypasses all equipment checks.
- **P1 — No Schedule / Weekly-Off Check**: `evaluateStaffEligibility` checks `max_daily_jobs` count but ignores `staff.weekly_off` and overlapping `scheduled_time` slots.
- **Verified**: Inactive staff rejection, city/zone restrictions, `staff_capability_overrides` audit logging, and `assignStaffType` preserving existing assigned jobs.

---

## 9. Execution, Proof & Solar Findings
- Backend enforcement of `proof_requirements`, `checklist_requirements`, and required `service_job_addons` completion is implemented in `seeExecutionService.completeExecution` (lines 296–327), and `authorizedException` is stripped for non-admin callers in `seeApiRouter.js:401`.
- `buildStaffSafeJobContract` (`seeExecutionService.js:24-66`) strips financial/admin fields.
- **P1 Bypass**: Legacy `server.js` actions (`assignSpecialJob`, `completeSpecialJob`, `createServiceBooking`) and `bookingService.js` remain active and do not enforce SEE proof/checklist/add-on rules.

---

## 10. Frequency Engine Findings
- Verified in-memory across `every_15_days` vs `twice_per_month`, leap year (`2024-01-31 -> 2024-02-29`), `every_n_months`, `specific_weekdays`, `weekly_off_days` skip/reschedule, holiday blackouts, and idempotent generation.
- **P2**: `addMonthsYmd` (`seeFrequencyService.js:53-61`) clamps `Jan 31 -> Feb 28`, then steps from `Feb 28 -> Mar 28` instead of preserving day `31` (`Mar 31`).

---

## 11. Migration Safety & Data Integrity
- Migration `025` is recorded in `meta.schema_migrations` (`2026-11-27T03:58:51.899Z`) and did not alter production.
- `legacy_service_mapping` maps all 5 legacy categories (`daily_car_cleaning`, `car_washing`, `solar_cleaning`, `interior_detailing`, `exterior_detailing`) cleanly.
- **P2**: Out of 327 rows in `service_jobs`, 326 have `service_id` populated and **1 row** (`71e8b525-3e55-4da2-8d9c-6b85a6c5e761`, `solar_cleaning`, created at `04:04:20.114Z` after Migration 025 by `test_service_catalog_and_reassignment_qa.js` via `repos.serviceJobs.createJob`) has `service_id = NULL`.
- **P2**: `test_see_engine_qa.js` left 2 `purchase_snapshots`, 4 `entitlement_accounts`, and 13 `entitlement_ledger` test rows in dev `cwp_customer_db`.

---

## 12. API & Security Findings
- **P0 — Staff IDOR on `/api/see/jobs/*`** (`services/seeApiRouter.js`):
  - `GET /api/see/jobs/:jobId/staff-contract` (line 376): `if (staffSess && !adminSess && job.staff_id && job.staff_id !== staffSess.staffId)` permits any staff member to read **unassigned** jobs (`job.staff_id === null`).
  - `POST /api/see/jobs/:jobId/start` (line 388), `/complete` (line 399), `/terminate` (line 417), `/addons/:jobAddonId/complete` (line 429), and `/solar-verify` (line 443) do **not** verify `job.staff_id === staffSess.staffId` (nor that `:jobAddonId` belongs to `:jobId`). Any authenticated staff user can mutate any job.
- **Verified**: Admin-only enforcement on `/api/see/entitlements/:accountId/(adjust|refund|expire)`, `/solar-approve`, catalogue mutations, and capability overrides. Parameterized SQL (`$1, $2...`) used throughout all SEE repositories.

---

## 13. Legacy Hardcoded Inventory
| File | Lines | Hardcoded Artifact | Active? | Recommended Phase |
|---|---|---|---|---|
| `services/serviceCatalog.js` | 6–251, 302–325 | `SERVICE_CATEGORIES`, `SEATER_TYPES`, `SOLAR_UNIT_CONFIG`, `resolveCanonicalCategory` | Yes (fallback + legacy callers) | Backend Remediation / Post-Frontend |
| `services/packageService.js` | 52–116 | Hardcoded package codes & pricing (`WASH_SINGLE_*`, `DCC_EXT_*`, `SOLAR_*`, `INT_*`, `EXT_*`) | Yes (fallback + `sellPackage`) | Backend Remediation |
| `services/bookingService.js` | 90, 100, 145, 179 | `resolveCanonicalCategory`, legacy job lifecycle | Yes | Backend Remediation |
| `services/adminService.js` | 15, 667, 1046, 2169, 3402 | `resolveCanonicalCategory`, `assignSpecialJob` | Yes | Backend Remediation |
| `services/staffCapabilityService.js` | 39, 77, 219, 261 | `serviceCatalog` category/capability coupling | Yes | Backend Remediation |
| `server.js` | 6264, 6277 | `serviceCatalog.SERVICE_CATEGORIES` fallback | Fallback only | Post-Frontend |

---

## 14. Test Failure Analysis
1. **`tests/test_phase1f_repositories.js` (31 passed, 3 failed)**:
   - *Assertions*: `service_categories` count `=== 3` (actual: `6`), `customers` count `=== 0` (actual: `124`), `staff` count `=== 0` (actual: `6`).
   - *Verdict*: **TEST ENVIRONMENT MISMATCH** — Test was written for an empty Phase 1F database; dev DB `cwp_customer_db` now contains 124 customers, 6 staff, and 6 categories (3 original + 2 from Mig 007 + 1 from Mig 025). All 14 repository CRUD/trigger tests passed.
2. **`tests/test_service_catalog_and_reassignment_qa.js` (1 failure at line 259)**:
   - *Assertion*: `assignSpecialJob succeeds with vehicleDetails object` for `interior_detailing` assigned to `testStaffList[1]`.
   - *Evidence*: Read-only query on `public.staff` shows `testStaffList[1]` has `work_type = 'services_only'` and `service_capabilities = ['car_washing', 'solar_cleaning']` (no `interior_detailing`).
   - *Verdict*: **VERIFIED PRE-EXISTING / TEST ENVIRONMENT MISMATCH** — `staffCapabilityService` legitimately rejected assigning `interior_detailing` to a staff member without that capability.

---

## 15. Prioritized Findings Summary
- **P0**:
  1. Staff IDOR on `/api/see/jobs/:jobId/{staff-contract,start,complete,terminate,addons/.../complete,solar-verify}` (`seeApiRouter.js:376-451`).
  2. Non-atomic job + entitlement transaction boundaries in `seeExecutionService.js` (`createCanonicalJob`, `completeExecution`, `terminateJobWithoutCompletion`).
- **P1**:
  3. Missing `vehicleId`/`locationId` customer ownership check in `seeEntitlementService.createPurchase`.
  4. Equipment requirement check skipped when `staff.equipment_available` is `[]` (`seeStaffCapabilityService.js:183`).
  5. Missing `weekly_off` / time-slot overlap validation in `evaluateStaffEligibility`.
  6. Active parallel legacy booking/package paths bypassing SEE enforcement.
- **P2**:
  7. `purchase_snapshots` trigger missing `BEFORE DELETE`.
  8. `repos.serviceJobs.createJob` leaves `service_id = NULL` on non-SEE job inserts.
  9. `test_see_engine_qa.js` leaves test rows in `purchase_snapshots`/`entitlement_accounts`/`entitlement_ledger`.
  10. `createPurchase` does not validate `effective_from`/`effective_to` package dates.
  11. `addMonthsYmd` anchor drift on month-end dates.
- **P3**:
  12. Pre-existing duplicate `019_` migration prefix.

---

## 16. Verification Evidence & Limitations
- **Executed**: Read-only SQL schema/trigger/constraint/backfill queries on `cwp_customer_db`; in-memory `seeFrequencyService` edge-case script; static analysis of `services/see*.js`, `db/repositories/see*.js`, `server.js`; review of prior non-destructive test outputs (`test_see_engine_qa.js` 8/8, `test_connection_resolver.js` 7/7, `test_packages_sql_ambiguity_qa.js` 4/4, `test_special_jobs_ledger_qa.js` 4/4, `test_phase1f_repositories.js` 31/34, `test_service_catalog_and_reassignment_qa.js`).
- **Not Executed (by restriction)**: Live HTTP concurrency load tests against `/api/see/*` (would mutate dev DB).

---

## 17. Recommendation for Next Phase
**`REJECT / REMEDIATION REQUIRED`** — Remediate the 2 P0 defects (staff ownership/IDOR guards in `seeApiRouter.js` and single-transaction job+entitlement atomicity in `seeExecutionService.js`) and P1 gaps (ownership check in `createPurchase`, equipment check when `equipment_available` is empty, and legacy bypass alignment) before approving backend for frontend integration.
