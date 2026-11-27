# SEE-14 End-to-End Verification

**Status: INCOMPLETE — canonical job is live in Staff Portal and in progress; required after-work proof is pending.**

Environment: local Admin V2 browser at `localhost:3005`, authenticated as Admin, connected to Neon project `CWP Customer Data`, branch `development`. Production was not used.

## Cross-module identifier reconciliation

| Record | ID / value | Verified |
|---|---|---|
| Test customer | `e8d0a872-0df2-4481-b7d3-8f211db12ee0` | Created via UI; same customer on purchase and canonical job |
| Test vehicle | `60d4acec-a528-42d1-a2ea-226022f608fa`, plate `UP32SEE1401` | Customer-owned; same vehicle on job and purchase |
| Test location | `ac617dd9-056e-4e06-a0c0-cb425db944ad` | Customer-owned; same location on job and purchase |
| Test service | `841608bc-1a64-4963-8d9d-66c9b0a5e122` | Exact selected service on canonical job; retired in cleanup |
| Test add-on | `3d1d955a-5f48-4c87-993a-193ff6db893f` | Selected and present as job add-on; retired in cleanup |
| Package | `a844ee77-1d96-40ed-b88f-57ff66813e3f` | v1 purchased; editor persisted v2 and retired v3 |
| Purchase snapshot | `8463f146-9e50-4623-9e9b-370cde87301c` | Immutable package v1 / ₹1499 snapshot on canonical job |
| Service account | `61151b94-a592-46b3-9004-3c17a80f6d5c` | Same account on job; reserve and release ledger entries point to job |
| Add-on account | `aba136bf-688b-4d0d-abe1-66dc6c666ca2` | Same snapshot; balances returned to 2 remaining after test cleanup |
| Canonical job | `5f08b429-5855-4f28-bf00-e6ba6f0baa6a` | Exact IDs and `_seeManaged` path reconciled; assigned then cancelled |
| Staff assignment | `SEE07 Staff OK` test fixture | Canonical eligibility accepted; assignment shown in Admin; no Staff Portal session verified |
| Execution | none | Not created; job was cancelled before work started |

## Follow-up live Staff Portal transaction

The first job above remains a separate cancellation/release verification. A second temporary development package and job were created to continue the browser path.

| Record | ID / value | Verified |
|---|---|---|
| Follow-up package | `SEE-14 Remaining Flow Wash & Tyre` | Created in Admin V2, active, with Car Wash benefit. Add-on composition was configured, but booking form showed no compatible add-on for Car Wash. |
| Purchase snapshot | `89c3d6af-e6af-44de-90ac-43cab77fa35b` | Confirmed in Customer Inspector. |
| Service account | `e92620a1-a1d9-45e6-aee7-62d0f3c79fbd` | Purchased 2; one unit reserved, none consumed. |
| Add-on account | `eac3ffcc-3036-4494-bab3-7a9ae595c459` | Purchased 2; not selected for this job. |
| Canonical job | `a5ddb235-8f60-4875-a1e8-f91ee88fecda` | Same customer, vehicle, location, Car Wash service, purchase snapshot and service account; status `in_progress`. |
| Staff assignment | `S03A0728`, DB ID `cb325551-df03-4d0b-8da8-7234a0c7ea66` | Assignment succeeded in Admin; this test staff account is authenticated in Staff Portal. |
| Execution | `702205d7-fdcc-4632-8bd5-40f8b0517a2b` | Staff Portal Start Job succeeded. Completion awaits required after-work photo. |

## Workflow results

| Stage | Result | Evidence / limitation |
|---|---|---|
| Create services/add-on/package | **Browser verified** | Admin catalogue forms created synthetic records. |
| Package composition persists/reloads | **Browser verified** | Editor reopened with exact canonical service and add-on IDs and policies. |
| Package edit/version/retire | **Browser verified** | ₹1499 v1 → ₹1599 v2 → retired v3. Purchase snapshot remained v1. |
| Create customer/vehicle/location | **Browser verified** | Customer Inspector showed test vehicle and Home location. Customer creation also generated a separate legacy On-Demand job as existing behavior. |
| Package purchase | **Browser + DB verified** | UI confirmation; snapshot, sale reference, two entitlement accounts, validity and purchase ledger rows reconciled. |
| Exact service booking + add-on | **Browser + DB verified** | Canonical booking UI success; job stored selected service/add-on, customer, vehicle, location and snapshot IDs, with checklist/proof snapshot. |
| Entitlement reserve | **DB verified** | One wash credit reserved for the canonical job. The main account returned to 2 remaining after cancellation release. |
| Staff eligibility | **Browser verified** | One synthetic SEE fixture was rejected for missing add-on capability; a separate SEE test fixture passed and was assigned. |
| Staff portal visibility/contract | **Browser verified** | Test Staff Portal displayed the job with customer, vehicle, service, location/address and schedule. No credential was reset. |
| Job start | **Browser verified** | Start Job succeeded; portal showed `In Progress` and execution `702205d7-fdcc-4632-8bd5-40f8b0517a2b`. |
| Checklist and proof upload | **Incomplete** | Live completion dialog now displays four required service checklist controls and an after-work photo input. Visual verification passed. A genuine vehicle proof image was not available, and the active job also has no before-work photo, so completion remains blocked; no completion was submitted. |
| Completion / consume once | **Incomplete** | No completion was submitted. Service account has 1 reserved and 0 consumed. |
| Customer balance/history | **Browser verified for in-progress state** | Refreshed Inspector showed Reserved 1 / Consumed 0 / Available 1 and the same canonical job as in progress. Post-completion state is unverified. |
| Staff Inspector SEE metrics | **Browser verified for in-progress state** | Activity showed the canonical job, status, execution ID and 0 before / 0 after proof. Performance showed 1 assigned / 0 completed SEE jobs. |
| Cancellation/release | **Browser + DB verified** | Canonical Admin cancellation succeeded. Same service account recorded reserve then release for the same job; ending balances: reserved 0, consumed 0, remaining 2. |
| Duplicate completion and rollback | **Backend suite verified, not browser E2E** | SEE-03 concurrency/idempotency coverage passed. |
| Date/time display | **Browser verified** | Stored value represents Nov 28 midnight IST; after reload the live queue displayed `28/11/2026`. |
| Test catalogue cleanup | **Partial** | Earlier test services/add-on/package are retired. Follow-up package remains active while its linked job is in progress. |
| Test purchase/customer/job cleanup | **Partial / pending** | Earlier immutable purchase and cancelled job remain for audit. Follow-up purchase, one reserved unit, execution and job remain linked/in progress. No direct delete or ledger mutation was attempted. |

## Test commands / results

The DB-backed suites were run with `DATABASE_URL` loaded from the local `.env` without printing it:

- `tests/test_see_03_remediation_qa.js` — **6 passed, 0 failed**.
- `tests/test_see_05_remediation_qa.js` — **3 passed, 0 failed**.
- `tests/test_see_07_remediation_qa.js` — **3 passed, 0 failed**.
- `node --check` for `services/seeExecutionService.js`, `public/admin-v2/js/v2-bookings.js`, `public/admin-v2/js/v2-see-packages.js`, and edited test files — **passed**.
- `git diff --check` — **passed**, with a pre-existing LF/CRLF warning for `local_data.json`.
- `node --check public/admin-v2/js/v2-staff.js` — **passed** after adding canonical SEE Staff Inspector reporting.

First attempts of SEE-03 and SEE-07 surfaced stale tests that omitted the current required stable `saleReference`. Their fixtures were updated; the reruns passed. Backend tests do not substitute for the incomplete live execution.

## Remaining browser action

The local Staff Portal retains the in-progress transaction. Its completion dialog displays required checklist controls. A fresh booking with genuine before-work evidence and genuine after-work evidence is needed to finish the execution path. Until then, completion, consumption, post-completion history, duplicate completion and final cleanup remain unverified.
