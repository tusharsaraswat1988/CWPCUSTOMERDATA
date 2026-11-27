# CWP SEE-06 — Owner Decision Summary

**Overall Verdict:** `REJECT / REMEDIATION REQUIRED`  
**Audited State:** `main` @ `9a6dc00` + uncommitted SEE-03/SEE-05 backend changes (`cwp_customer_db` dev)

## Verified Fixes
- **Workspace Hygiene**: All 22 accidentally modified/deleted files from SEE-04 are restored; `public/` and `Index.html` have zero changes.
- **P0 Security & Atomicity**: Staff IDOR (`authorizeJobAccess`), single-transaction job+entitlement atomicity, and `FOR UPDATE` staff row locking on canonical SEE assignments are verified.
- **Scheduling, Equipment & P2s**: Authoritative `required_equipment`, `scheduledTime`, `durationMinutes`, `weekly_off`, purchase ownership/dates, snapshot `DELETE` trigger, and month-end anchor preservation are verified.
- **Tests**: All 6 non-destructive suites pass (`32/32` assertions across `test_see_05`, `test_see_03`, `test_see_engine`, `test_connection_resolver`, `test_packages_sql_ambiguity`, and `test_special_jobs_ledger`).

## Remaining Defects Blocking Approval
1. **P1 Legacy Bypass (`server.js:7155`)**: `completeSpecialJob` / `completeServiceBooking` still calls `bookingService.completeJob` directly for SEE-managed jobs instead of `seeExecutionService.completeExecution`, bypassing SEE proof, checklist, add-on, and ledger consumption rules.
2. **P1 Unlocked Legacy Assignment (`server.js:5987, 6090`)**: `assignSpecialJob` and `reassignSpecialJob` run `evaluateStaffEligibility` as an unlocked preflight read outside the assignment transaction.
3. **P2 Cross-Date Midnight Spillover (`seeStaffCapabilityService.js:281`)**: Conflict query filters `j.scheduled_date = $2` only, missing `D-1` jobs that spill past midnight into `D`.

## Recommendation
**Do not approve backend yet.** Fix the `completeSpecialJob` SEE delegation and `assignSpecialJob` lock (plus `D-1` midnight query) in a quick targeted pass before final `APPROVE BACKEND`. Frontend remains blocked.
