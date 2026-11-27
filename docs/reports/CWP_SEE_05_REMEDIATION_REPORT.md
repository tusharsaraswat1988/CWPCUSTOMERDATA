# CWP SEE-05 — Controlled Remediation Report

**Baseline Commit:** `main` @ `9a6dc001b7d2717cdd59817ed6ba113d218ee78c`  
**Target Environment:** Development (`cwp_customer_db`)  
**Commit Status:** Uncommitted (per SEE-05 rules: *No git commits*)  
**Approval Status:** Ready for independent **SEE-06** verification audit (not self-approved; frontend remains blocked).

---

## 1. Findings Addressed
1. **Workspace Contamination (Phase 0)**: Investigated and restored 22 unrelated/accidental working-tree modifications/deletions (`public/js/app.js`, `public/css/staff-m3.css`, `public/css/style.css`, `sw.js`, `package.json`, `tests/test_homepage_and_careers_qa.js`, and 16 deleted test/screenshot files).
2. **Legacy Operational Bypasses (Phase 1)**: Closed bypasses in `server.js` across `assignSpecialJob`, `reassignSpecialJob`, `sellCustomerPackage`, `redeemPackageEntitlement`, `createServiceBooking`, `failServiceJob`, and `cancelSpecialJob`.
3. **Scheduling & Equipment Wiring (Phase 2)**: Wired `scheduledDate`, `scheduledTime`, `durationMinutes`, `allowConcurrent`, and authoritative `services.execution_config.required_equipment` into `seeExecutionService.createCanonicalJob` and `seeExecutionService.assignJob`, and stripped client-supplied `requiredEquipment` in `POST /api/see/staff/eligibility`.
4. **Concurrency-Safe Assignment (Phase 3)**: Added `externalClient` support + `SELECT ... FROM public.staff ... FOR UPDATE` row lock inside `seeStaffCapabilityService.evaluateStaffEligibility`, executed inside the same `db.withTransaction` as `createCanonicalJob` and `assignJob`. Added midnight-crossing interval overlap detection (`intervalsOverlap`).
5. **Regression Repair (Phase 4)**: Restoring `public/js/app.js` resolved `test_special_jobs_ledger_qa.js` (`renderJobAssignmentsLedger exists` now passes 4/4).

## 2. Files Changed (Backend & Docs Only)
- `services/seeStaffCapabilityService.js`
- `services/seeExecutionService.js`
- `services/seeApiRouter.js`
- `services/seeEntitlementService.js`
- `services/seeFrequencyService.js`
- `db/repositories/serviceJobsRepo.js`
- `server.js`
- `migrations/026_see_03_remediation_guards.sql`
- `tests/test_see_03_remediation_qa.js`
- `tests/test_see_05_remediation_qa.js`
- `tests/test_see_engine_qa.js`

## 3. DB / Migration Changes
- No new migration beyond `026_see_03_remediation_guards.sql` (already applied on dev `cwp_customer_db`; production untouched).

## 4. Scope Compliance
- Zero frontend files modified in final working tree.
- Zero production DB or deployment changes.
- Zero git commits created.
