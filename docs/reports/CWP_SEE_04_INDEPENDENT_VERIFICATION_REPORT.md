# CWP SEE-04 — Independent Verification Report

**Verification Date:** 2026-11-27  
**Baseline Commit:** `main` @ `9a6dc001b7d2717cdd59817ed6ba113d218ee78c`  
**Target Database:** `cwp_customer_db` (Development Neon PostgreSQL, read-only verification)  
**Mode:** Verification-only (zero code, schema, or data modifications)

---

## 1. Executive Verdict

**VERDICT: `REJECT / REMEDIATION REQUIRED`**

The two **P0** fixes from SEE-03 (**Staff IDOR `authorizeJobAccess`** and **single-transaction job+entitlement atomicity**) are **genuinely verified** at both source and DB-transaction levels. However, independent verification identified **unreported working-tree contamination** (including `public/js/app.js` and 16 deleted test/screenshot files) and **remaining P1 gaps**: legacy operational endpoints in `server.js` still bypass SEE, `createCanonicalJob`/`assignJob` do not pass `scheduledTime`, `durationMinutes`, or `requiredEquipment` into `evaluateStaffEligibility`, and `evaluateStaffEligibility` lacks concurrency locking for simultaneous assignments.

---

## 2. Audit Scope
- Read-only inspection of `git status`, `git diff`, `services/see*.js`, `db/repositories/serviceJobsRepo.js`, `server.js`, `migrations/026_see_03_remediation_guards.sql`, and `tests/test_see_03_remediation_qa.js`.
- Read-only SQL checks on `cwp_customer_db` (`meta.schema_migrations`, `information_schema.triggers`, `pg_constraint`).
- Execution of confirmed non-destructive test suites and in-memory frequency edge-case checks.

---

## 3. Git Baseline and Changes
- **HEAD**: `9a6dc00` on `main`.
- **Expected SEE-03 Backend Files**: `db/repositories/serviceJobsRepo.js`, `server.js`, `services/seeApiRouter.js`, `services/seeEntitlementService.js`, `services/seeExecutionService.js`, `services/seeFrequencyService.js`, `services/seeStaffCapabilityService.js`, `migrations/026_see_03_remediation_guards.sql`, `tests/test_see_03_remediation_qa.js`, `tests/test_see_engine_qa.js`, and `docs/reports/CWP_SEE_03_*.md`.
- **Unreported / Out-of-Scope Working-Tree Changes Observed**:
  - `M public/js/app.js` (22,291 lines changed — **frontend file**)
  - `M sw.js`, `M package.json`, `M tests/test_homepage_and_careers_qa.js`
  - `D` 16 test files and `tests/screenshots/staff_tracking_admin_live.png`
  These must be cleanly reverted/resolved before any commit or approval.

---

## 4. P0 Staff Ownership Verification (`services/seeApiRouter.js`)
Centralized `authorizeJobAccess(jobId)` (lines 82–102) queries `repos.serviceJobs.findById(jobId)` and `repos.staffAssignments.findActiveByJobId(jobId)`, returning uniform `403` if `!job || !activeAssignment || activeAssignment.staff_id !== staffSess.staffId`.

| Route | Line | Status | Evidence |
|---|---|---|---|
| `GET /api/see/jobs/:jobId/staff-contract` | 399 | **VERIFIED SECURE** | Invokes `authorizeJobAccess`; rejects unassigned & other staff (`403`) |
| `POST /api/see/jobs/:jobId/start` | 413 | **VERIFIED SECURE** | Invokes `authorizeJobAccess`; uses `staffSess.staffId` for staff |
| `POST /api/see/jobs/:jobId/complete` | 426 | **VERIFIED SECURE** | Invokes `authorizeJobAccess`; strips `authorizedException` for staff |
| `POST /api/see/jobs/:jobId/terminate` | 447 | **VERIFIED SECURE** | Invokes `authorizeJobAccess` |
| `POST /api/see/jobs/:jobId/addons/:jobAddonId/complete` | 460 | **VERIFIED SECURE** | Invokes `authorizeJobAccess` + verifies `jobAddon.job_id === jobId` |
| `POST /api/see/jobs/:jobId/solar-verify` | 484 | **VERIFIED SECURE** | Invokes `authorizeJobAccess`; uses `staffSess.staffId` for staff |

---

## 5. P0 Transaction Atomicity Verification (`seeExecutionService.js` & `seeEntitlementService.js`)

| Operation | Job SQL | Entitlement SQL | Ledger SQL | Shared `client`? | Atomic? |
|---|---|---|---|---|---|
| Create + reserve (`createCanonicalJob`) | `client.query(INSERT service_jobs)` | `findAccountByIdForUpdate(..., client)` + `updateAccountBalances(..., client)` | `findLedgerByIdempotencyKey(..., client)` + `insertLedgerEntry(..., client)` | **Yes** | **VERIFIED ATOMIC** |
| Complete + consume (`completeExecution`) | `findByIdForUpdate(..., client)` + `client.query(UPDATE service_jobs)` | Same | Same | **Yes** | **VERIFIED ATOMIC** |
| Terminate + release (`terminateJobWithoutCompletion`) | `findByIdForUpdate(..., client)` + `client.query(UPDATE service_jobs)` | Same | Same | **Yes** | **VERIFIED ATOMIC** |

`mutateEntitlement` executes directly on `externalClient` when provided without opening a nested transaction, and exceptions propagate to `db.withTransaction` (`ROLLBACK`).

---

## 6. P1 Ownership Checks (`seeEntitlementService.createPurchase`)
- **VERIFIED**: Customer existence & `is_active`, vehicle ownership (`vehicle.customer_id === customer.id`), location ownership (`location.customer_id === customer.id`), solar/vehicle incompatibility, city/zone eligibility, and `effective_from`/`effective_to` dates (`toYmd`).
- **DB Verified**: `fk_ps_vehicle_customer` and `fk_ps_location_customer` present and `convalidated = true` in `pg_constraint`.

---

## 7. P1 Equipment Checks (`seeStaffCapabilityService.js`)
- **VERIFIED**: Empty `equipment_available` (`[]`) fails by default when `requiredEquipment` is non-empty (`seeStaffCapabilityService.js:204-216`).
- **DEFECT (P1)**: `createCanonicalJob` and `assignJob` in `seeExecutionService.js` do **not** pass `requiredEquipment` from `svc.execution_config.required_equipment` to `evaluateStaffEligibility`, and `staff_capability_overrides` does not support `'equipment'` overrides.

---

## 8. P1 Scheduling Checks (`seeStaffCapabilityService.js`)
- **VERIFIED**: `weekly_off` check (`271-279`) and `scheduledTime` overlap check (`296-311`) work when `scheduledTime` and `durationMinutes` are supplied.
- **DEFECTS (P1)**:
  1. `createCanonicalJob` (`seeExecutionService.js:123-131`) and `assignJob` (`235-242`) only pass `scheduledDate` — they omit `scheduledTime` and `durationMinutes`, so overlap checks are not triggered during normal job creation/assignment.
  2. `evaluateStaffEligibility` runs outside a transaction lock, leaving a preflight race window for concurrent assignments.
  3. `parseTimeToMinutes` does not handle midnight-crossing intervals.

---

## 9. Legacy Bypass Audit (`server.js`, `bookingService.js`, `packageService.js`)
- **Verified Fixed**: `failServiceJob` (`server.js:6464`) and `completeSpecialJob` (`server.js:7057`) now enforce `repos.staffAssignments.findActiveByJobId(jobId)` matching `staffSess.staffId`.
- **REMAINING BYPASSES (P1)**: `assignSpecialJob` (`5973`), `reassignSpecialJob` (`6054`), `sellCustomerPackage` (`6324`), `redeemPackageEntitlement` (`6340`), `createServiceBooking` (`6400`), and `cancelSpecialJob` (`7185`) in `server.js` still invoke legacy `adminService` / `bookingService` / `packageService` directly without SEE proof, add-on, or `staff_types` enforcement.

---

## 10. P2 Verification
- **9.1 Snapshot DELETE Protection**: **VERIFIED** (`trg_immutable_purchase_snapshot` fires `BEFORE UPDATE OR DELETE`, verified in `information_schema.triggers` and `pg_get_functiondef`).
- **9.2 Canonical `service_id`**: **VERIFIED** (`serviceJobsRepo.createJob` resolves active `service_id` from `public.services` when omitted).
- **9.3 Test Safety**: `test_see_03_remediation_qa.js` isolates entities by `Date.now()` suffix and soft-deletes test jobs without touching real customer/staff rows.
- **9.4 Package Effective Dates**: **VERIFIED** (`toYmd` fixes JS `Date` stringification).
- **9.5 Month-End Anchor**: **VERIFIED** across `2026-01-31` (`Feb 28 -> Mar 31 -> Apr 30 -> May 31`), `2024-01-31` leap year (`Feb 29 -> Mar 31`), `2026-01-30`, `2024-01-29`, and `2025-11-30` (`every_n_months`).

---

## 11. Test Suite Audit & Actual Results
- `test_see_03_remediation_qa.js`: **6 PASSED, 0 FAILED** (covers P0 IDOR, P0 atomic tx, P1 ownership/dates, P1 equipment, P1 schedule, P2 snapshot delete & month-end anchor; does not test `seeExecutionService.createCanonicalJob` passing `scheduledTime`/`requiredEquipment`).
- `test_see_engine_qa.js`: **8 PASSED, 0 FAILED**.
- `test_connection_resolver.js`: **7/7 PASSED**.
- `test_packages_sql_ambiguity_qa.js`: **4/4 PASSED**.
- `test_special_jobs_ledger_qa.js`: **FAILED** (`AssertionError: renderJobAssignmentsLedger exists` — caused directly by the unreported 22,291-line modification in `public/js/app.js` in the working tree).

---

## 12. Migration & DB State (Read-Only Verified)
- `meta.schema_migrations` has `025` (`2026-11-27T03:58:51.899Z`) and `026` (`2026-11-27T04:11:21.260Z`).
- `purchase_snapshots` has validated compound FKs `fk_ps_location_customer` and `fk_ps_vehicle_customer`.
- Production untouched.

---

## 13. Remaining Defects & Prioritization
1. **P0 (Workspace Hygiene / Scope)**: Unreported modifications in `public/js/app.js`, `sw.js`, `package.json`, `tests/test_homepage_and_careers_qa.js`, and 16 deleted test/screenshot files in working tree.
2. **P1**: Legacy `server.js` routes (`assignSpecialJob`, `createServiceBooking`, `sellCustomerPackage`, `redeemPackageEntitlement`, `cancelSpecialJob`) still bypass SEE.
3. **P1**: `seeExecutionService.createCanonicalJob` and `assignJob` do not pass `scheduledTime`, `durationMinutes`, or `requiredEquipment` to `evaluateStaffEligibility`.
4. **P1**: `evaluateStaffEligibility` schedule overlap check is a preflight read without a transaction lock.

---

## 14. Recommendation
**`REJECT / REMEDIATION REQUIRED`** — Clean the unreported working-tree changes, wire `scheduledTime`/`durationMinutes`/`requiredEquipment` in `seeExecutionService`, add assignment locking for schedule overlap, and close or deprecate the remaining legacy `server.js` bypasses before final `APPROVE BACKEND`.
