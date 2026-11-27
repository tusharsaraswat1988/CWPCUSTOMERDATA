# CWP SEE-02 — Audit Findings Summary (Owner Brief)

**Overall Verdict:** `REJECT / REMEDIATION REQUIRED`  
**Audited Commit:** `main` @ `9a6dc00` | **Database:** `cwp_customer_db` (dev, read-only audit)

## Verified Strengths
- **Database Schema & Triggers**: Migration `025_create_see_engine_schema.sql` cleanly provisions canonical services, packages, add-ons, frequencies, staff types, purchase snapshots, entitlement ledger, and solar verifications. PostgreSQL triggers enforce append-only `entitlement_ledger` (`UPDATE`/`DELETE` blocked) and `UPDATE` immutability on `purchase_snapshots`, with `chk_entitlement_ledger_balance` preventing negative balances.
- **Solar & Frequency Engines**: Solar estimate vs. actual panel verification with admin-only discrepancy approval is cleanly implemented. Frequency engine accurately distinguishes `every_15_days` from `twice_per_month` and handles leap years, blackouts, and `Asia/Kolkata`.
- **Previous Test Failures Explained**: The 3 failures in `test_phase1f_repositories.js` and 1 failure in `test_service_catalog_and_reassignment_qa.js` are verified **Test Environment Mismatches** (populated dev DB vs. empty-DB test assumptions, and staff capability mismatch on `testStaffList[1]`), not SEE-01 regressions.

## Critical Defects (P0 — Must Fix)
1. **Staff IDOR on SEE Job Endpoints (`services/seeApiRouter.js:376-451`)**: Any authenticated staff user can view unassigned job contracts and start, complete, terminate, or submit solar counts on **any** job (including jobs assigned to other staff) because `job.staff_id === staffSess.staffId` is not enforced on those routes.
2. **Split Transaction Boundaries (`services/seeExecutionService.js:137-218, 336-375, 384-418`)**: Job creation, completion, and termination commit `service_jobs` in one transaction and call `seeEntitlementService.mutateEntitlement` (`reserve`/`consume`/`release`) in a separate transaction afterward. A failure in the second call leaves job state and entitlement balances out of sync.

## High-Priority Blockers (P1)
3. **Missing Customer Ownership Check in `createPurchase` (`services/seeEntitlementService.js`)**: `vehicleId` and `locationId` are not verified to belong to `customerId`.
4. **Equipment Check Bypass (`services/seeStaffCapabilityService.js:183`)**: Required equipment validation is skipped whenever a staff member's `equipment_available` array is empty (`[]`).
5. **Parallel Legacy Paths**: Legacy `bookingService.js` / `packageService.js` / `server.js` special-job endpoints remain active alongside `/api/see/*`, bypassing SEE proof, add-on, and staff-type rules.
6. **Schedule/Weekly-Off Not Checked**: `evaluateStaffEligibility` checks `max_daily_jobs` but not `weekly_off` or overlapping time slots.

## Recommendation
Do **not** begin frontend integration or production migration yet. Authorize a focused **SEE-02 Remediation** task to fix the 2 P0 and 4 P1 items, followed by a quick re-verification before final `APPROVE BACKEND`.
