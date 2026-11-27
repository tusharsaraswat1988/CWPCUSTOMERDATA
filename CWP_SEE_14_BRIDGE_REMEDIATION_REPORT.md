# SEE-14 Admin-to-Operations Bridge Remediation

**Verdict: REJECT — REMEDIATION INCOMPLETE**

Targeted bridge fixes and a live development workflow now reach the authenticated Staff Portal and start the exact canonical SEE job. The completion dialog now exposes and validates the service checklist, but this transaction has no before-work evidence and still needs genuine before/after vehicle photos. Completion, entitlement consumption, and post-completion reconciliation remain unverified. The end-to-end acceptance criteria therefore remain unmet.

## Baseline map

| Stage | Existing component / source path | Result observed |
|---|---|---|
| Catalogue | Admin V2 Services, Packages and Add-ons; `/api/see/*`; `seeCatalogueService` | Canonical catalogue CRUD was already present. Package editor used JSON textareas for composition/configuration. |
| Customer | Admin V2 Customers and Customer Inspector | Customer, vehicle and location creation were available; legacy customer plan text was not a canonical purchase. |
| Purchase | Customer Inspector → `/api/see/purchases` → `seeEntitlementService` | Created immutable package snapshot, service/add-on accounts and purchase ledger rows. |
| Booking | Admin Booking → `POST /api/see/jobs` → `seeExecutionService.createCanonicalJob` | Exact service, customer, vehicle, location, purchase and selected add-on IDs persisted. The canonical job was absent from the queue until the SEE list bridge was added. |
| Queue / assignment | Admin V2 Assign Booking → `/api/see/jobs` and `/assign` | Queue now merges canonical SEE jobs with legacy rows; canonical assignment uses the server eligibility engine. |
| Staff execution | Staff Portal → `staffPortalService` and canonical job contract/actions | Authenticated test Staff Portal showed the exact job and started it; the live completion dialog now presents required checklist items and requires proof photos. |
| Entitlements / history | SEE account and append-only ledger; Customer Inspector | UI ledger showed one reserve on the same canonical job; refreshed Customer Inspector showed Reserved 1 / Available 1 and the in-progress SEE job in history. No execution completion/consume yet. |
| Staff Inspector | Admin V2 Staff detail → assignments, performance, activity | Updated live UI links SEE work by database staff ID/code and shows 1 assigned SEE job with status, execution ID and proof counts. |

## Root causes confirmed

1. Canonical SEE jobs were persisted in `service_jobs`, but the Admin booking queue only loaded legacy special jobs. As a result the booking confirmation was genuine, but the job was invisible in its operational queue.
2. Admin V2 package composition was editable as manually authored JSON, even though package composition needs structured, approved controls. This is an operational UI gap; it remains unresolved in this remediation.
3. Add-on rows were attached to canonical jobs without linking/reserving an included add-on entitlement account, and completion/termination only handled the main service entitlement. This was corrected in source for new canonical jobs.
4. Canonical assignment used server-side eligibility, but the Admin roster displayed “Available” based on a legacy client-side service capability heuristic. A selected SEE add-on capability could still be rejected by the canonical engine. The UI now labels canonical eligibility as checked on submit and leaves the server authoritative.
5. A date-only booking was stored as a timestamp representing midnight Asia/Kolkata (`2026-11-27T18:30:00Z`). The UI sliced the UTC date and displayed the prior day. The formatter now applies Asia/Kolkata to timestamp values; a later live reload confirmed the row displays `28/11/2026`.
6. Staff Inspector metrics originally read only DCC reports, DCC assignments and legacy special jobs. Canonical SEE jobs were absent. The Staff module now loads `/api/see/jobs` and links jobs by canonical database staff ID with staff-code fallback, presenting canonical work separately to avoid double counting.

## Changes in source

- `services/seeApiRouter.js`: added admin-only `GET /api/see/jobs` using canonical rows filtered by `_seeManaged`.
- `db/repositories/serviceJobsRepo.js`: added the `seeManagedOnly` query option.
- `public/admin-v2/js/v2-bookings.js`: merges canonical and legacy queue rows, maps canonical fields, sends canonical assign/terminate actions to SEE APIs, avoids legacy unassignment for canonical jobs, describes server-side eligibility accurately, and formats timestamp dates in Asia/Kolkata.
- `public/admin-v2/js/v2-staff.js`: adds canonical SEE assignment, performance and activity information to Staff Inspector; the script cache version in `public/admin-v2/index.html` was bumped for live reload.
- `public/js/app.js` and `Index.html`: show SEE before-photo requirements before starting and prevent starting without the configured minimum; render required service checklist checkboxes in the completion dialog, validate them before submit, and send checklist results through the existing completion action. Legacy jobs retain their optional-photo behavior.
- `services/seeExecutionService.js`: resolves add-on entitlement accounts from the authoritative purchase snapshot after the service account is validated; links and reserves the selected add-on credit; consumes completed add-on credits and releases uncompleted or terminated add-on reservations.
- `tests/test_see_03_remediation_qa.js`, `tests/test_see_07_remediation_qa.js`: added stable sale references to purchase fixtures to match current purchase idempotency requirements.
- The broader dirty working tree also contains earlier SEE remediation changes in Admin V2, catalogue, entitlement, customer inspector, staff portal and server integration. No unrelated DCC route or Daily Car Cleaning code was intentionally changed in this turn.

## Development database operations

All interactive data work was performed against the confirmed `development` branch, not production. No schema migration or direct SQL write was performed.

- Created a synthetic customer, vehicle, location, two services, one compatible add-on, and a package through Admin UI.
- Purchased package v1: snapshot `8463f146-9e50-4623-9e9b-370cde87301c`.
- Service entitlement account: `61151b94-a592-46b3-9004-3c17a80f6d5c`; add-on account: `aba136bf-688b-4d0d-abe1-66dc6c666ca2`.
- Canonical booking: `5f08b429-5855-4f28-bf00-e6ba6f0baa6a`; assigned temporarily to a SEE test fixture, then cancelled through the UI.
- DB readback confirmed the same service, customer-owned vehicle/location, purchase snapshot and service entitlement IDs on the job. It also confirmed one `reserve` followed by one `release` against the same job ID, with service and add-on accounts at `reserved=0`, `consumed=0`, `remaining=2` after cleanup.
- Package lifecycle was exercised in the browser: create, reload, inspect, edit persisted as v2 (price changed to ₹1599), then retired as v3. The immutable purchase remains a v1 snapshot at ₹1499.
- Temporary services, add-on and package are retired. The synthetic customer, vehicle/location, immutable purchase snapshot, ledger and cancelled job remain because deleting them would break the append-only/audit trail; no reversal/void UI was available. The assigned test fixture has an assignment history row retained on the cancelled job.
- For remaining Staff Portal verification, created a second temporary package and purchase in development: package `SEE-14 Remaining Flow Wash & Tyre`, snapshot `89c3d6af-e6af-44de-90ac-43cab77fa35b`, service account `e92620a1-a1d9-45e6-aee7-62d0f3c79fbd`, and add-on account `eac3ffcc-3036-4494-bab3-7a9ae595c459`. The new active Car Wash service job is `a5ddb235-8f60-4875-a1e8-f91ee88fecda`, assigned to test staff `S03A0728` (database ID `cb325551-df03-4d0b-8da8-7234a0c7ea66`). It is in progress with execution `702205d7-fdcc-4632-8bd5-40f8b0517a2b`; service entitlement shows one reserve, zero consumed, one available. This package remains active and linked to the in-progress job pending valid proof and safe termination/retirement.
- The new package's add-on was not attached to this job because the live booking form reported no compatible add-ons for the active Car Wash service. The earlier test transaction exercised add-on reservation and release only.

## Verification

- `node --check`: passed for changed SEE service, booking JS, package controller, and edited QA fixtures.
- Additional `node --check public/admin-v2/js/v2-staff.js`: passed; `git diff --check` passed with only the existing `local_data.json` LF/CRLF warning.
- `git diff --check`: passed (Git emitted only the existing `local_data.json` LF/CRLF warning).
- SEE-03 regression: 6 passed, 0 failed after updating stale fixture sale references.
- SEE-05 regression: 3 passed, 0 failed.
- SEE-07 regression: 3 passed, 0 failed after updating stale fixture sale reference.
- Browser: canonical queue initially showed the job after the queue bridge change; server rejected an ineligible synthetic fixture for missing add-on capability; eligible `SEE07 Staff OK` fixture assignment succeeded. Admin UI cancellation succeeded. Package edit/reload/version and service/add-on/package retirement succeeded.
- Database: purchase, account, job, assignment and ledger identifiers and ending balances were queried read-only and reconciled. Catalogue statuses read back retired.
- After a later live reload, the canonical booking row displayed `28/11/2026`, verifying the timezone display correction.
- Browser: user-provided test staff credentials opened the local Staff Portal. The exact Car Wash job displayed customer, vehicle, address, service, and scheduled time; Start Job succeeded. Live visual verification confirmed all four required checklist items appear in the completion dialog. The active job has no before-work photos; a valid genuine before/after photo set was not available, so no completion was submitted.
- Browser: Customer Inspector refreshed to show the active service entitlement Reserved 1 / Consumed 0 / Available 1 and the exact in-progress canonical job. View ledger showed the reserve entry for job `a5ddb235-8f60-4875-a1e8-f91ee88fecda`.
- Browser: Staff Inspector Activity showed `Car Wash · in_progress`, the execution ID, and 0 before / 0 after proof. Performance showed 1 canonical SEE job assigned and 0 completed.
- The new live test transaction remains in progress. Completion, consumption, customer post-completion balance/history, staff completed-work metrics, duplicate completion, and final cleanup cannot be reported as verified until valid proof is supplied and the workflow is completed or safely cancelled.

## Change controls

No commit, push, deployment, production DB operation, migration, or destructive SQL was performed. See `CWP_SEE_14_END_TO_END_VERIFICATION.md` and `CWP_SEE_14_REMAINING_GAPS.md` for detailed stage status.
