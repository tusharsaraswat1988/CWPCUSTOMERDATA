# CWP SEE-03 — Remediation Report

**Baseline Commit:** `9a6dc001b7d2717cdd59817ed6ba113d218ee78c` (`main`)  
**Final Commit:** Uncommitted (per SEE-03 instruction: *Do not commit unless separately authorized*)  
**Target Environment:** Development (`cwp_customer_db`)  

## 1. Files Changed / Added
- `services/seeApiRouter.js` — Centralized `authorizeJobAccess` IDOR guard across all 6 staff/admin job endpoints + job-addon ownership check.
- `services/seeExecutionService.js` — Single-transaction boundaries for `createCanonicalJob` (+ `reserve`), `completeExecution` (+ `findByIdForUpdate` + `consume`), and `terminateJobWithoutCompletion` (+ `release`).
- `services/seeEntitlementService.js` — `mutateEntitlement(..., externalClient)` transaction propagation; customer/vehicle/location ownership, effective dates, and city/zone checks in `createPurchase`.
- `services/seeStaffCapabilityService.js` — Default-fail equipment validation when `equipment_available` is empty, `weekly_off` check, and `scheduledTime` overlap check.
- `services/seeFrequencyService.js` — Month-end anchor-day preservation in `addMonthsYmd`.
- `db/repositories/serviceJobsRepo.js` — Auto-resolution of `service_id` from `public.services` when omitted by legacy callers.
- `server.js` — Added active `staff_assignments` ownership checks to legacy `failServiceJob` and `completeSpecialJob` handlers.
- `migrations/026_see_03_remediation_guards.sql` — `BEFORE UPDATE OR DELETE` trigger on `purchase_snapshots` + compound ownership FKs `(vehicle_id, customer_id)` and `(location_id, customer_id)`.
- `tests/test_see_03_remediation_qa.js` — Security, transaction atomicity, ownership, equipment, schedule, and P2 regression suite.

## 2. SEE-02 Findings Disposition
| ID | Severity | Finding | Root Cause | Fix Implemented |
|---|---|---|---|---|
| 1 | P0 | Staff IDOR on `/api/see/jobs/*` | Missing `staff_assignments` check & `job.staff_id` falsy bypass | Centralized `authorizeJobAccess` requiring active assignment `staff_id === staffSess.staffId` |
| 2 | P0 | Split job/entitlement transactions | `mutateEntitlement` opened separate transaction | Added `externalClient` parameter; `reserve`/`consume`/`release` execute inside `seeExecutionService` transactions |
| 3 | P1 | Missing `createPurchase` ownership checks | `vehicleId`/`locationId` not validated against `customerId` | Added service-layer ownership + service compatibility checks + DB compound FKs in Mig 026 |
| 4 | P1 | Equipment check bypass on `[]` | `staffEquip.length > 0` skipped check when empty | Fails by default if `requiredEquipment.length > 0` and `staffEquip.length === 0` |
| 5 | P1 | No `weekly_off` / time-slot overlap check | `evaluateStaffEligibility` only counted `max_daily_jobs` | Added `weekly_off` weekday check and `scheduledTime` interval overlap detection |
| 6 | P1 | Legacy endpoint IDOR/bypass | `completeSpecialJob` allowed unassigned jobs; `failServiceJob` lacked staff check | Enforced `repos.staffAssignments.findActiveByJobId` matching `staffSess.staffId` |
| 7 | P2 | `purchase_snapshots` allows `DELETE` | Trigger only covered `BEFORE UPDATE` | Updated `trg_immutable_purchase_snapshot` to `BEFORE UPDATE OR DELETE` |
| 8 | P2 | `repos.serviceJobs.createJob` `service_id = NULL` | `service_id` not populated by legacy repo | Auto-resolves active `service_id` by `serviceCategoryId` |
| 9 | P2 | `createPurchase` ignores `effective_from`/`effective_to` | Only `pkg.status` checked | Validates `effective_from`/`effective_to` against `Asia/Kolkata` current date |
| 10 | P2 | `addMonthsYmd` anchor drift | Clamped Feb 28 carried forward to Mar 28 | Preserves original `anchorDay` across `monthly` and `every_n_months` |
| 11 | P2 | Test DB residue | `entitlement_ledger` append-only | Documented; new tests isolate per-run entities without deleting real data |
