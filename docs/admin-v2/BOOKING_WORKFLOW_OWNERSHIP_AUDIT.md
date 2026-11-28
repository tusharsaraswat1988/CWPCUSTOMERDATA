# CWP Admin V2 — Booking Workflow Ownership Audit

**Status:** Final focused verification and UX cleanup completed 2026-11-28. No database, booking, staff assignment, migration, or production state was changed.

## Ownership architecture

`/admin` is served by `server.js` from `public/admin-v2/index.html` (the route handler is the canonical Admin Portal Route block near line 8230). That page loads the Admin V2 shell and the `v2-bookings.js`, `v2-customers.js`, `v2-staff.js`, `v2-special-jobs.js`, `v2-dashboard.js`, `v2-search.js`, `v2-notifications.js`, and package modules. It does not load Legacy `public/js/app.js`. `/admin-v2` and `/admin/v2` redirect to `/admin`.

The only on-demand booking create, assign, reassign, and unassign workflow is **Assign Booking** (`serviceAssign`). Its page DOM is `v2View_serviceAssign`; its create entry is `v2BkBtnNewBooking`; its create, assignment, cancellation, and failure forms are `v2ModalCreateBooking`, `v2ModalAssignBooking`, `v2ModalCancelBooking`, and `v2ModalFailBooking`. `v2-bookings.js` owns these handlers and their `createServiceBooking`, `/api/see/jobs/:id/assign`, and legacy `reassignSpecialJob` calls.

**Other Cleaning Status** (`specialJobs`) is the execution center. It retains start, completion, photo proof, failure/exception, and monitoring workflows. Record actions labelled **View Booking** hand off the selected job ID to `bookings.navigateToBooking(id)`. It has no booking creation or assignment handler.

Customers and Staff retain recurring DCC customer-to-staff schedule management, with the exact label **Assign DCC Schedule** and `assignDailyCleanCustomer` / `unassignDailyCleanCustomer` handlers. That is recurring subscription scheduling and is not an on-demand service booking. Customer and staff job histories are read-only and now offer record-specific **View Booking** navigation. Package pages configure packages and entitlements; Hybrid Packages manage product and membership lifecycle/provisioning/recovery. Neither owns on-demand booking actions.

## Entry-point inventory

| Entry point | Page | Handler / API | Classification | Result |
|---|---|---|---|---|
| Sidebar Assign Booking | Shell | `shell.navigateTo('serviceAssign')` | Navigation | Keep; canonical workspace. |
| New Booking | Assign Booking | `openCreateModal` → `createServiceBooking` / SEE canonical job creation | Creation | Keep; only on-demand creation form. |
| Queue row/detail Assign or Reassign | Assign Booking | `openAssignModal` → `/api/see/jobs/:id/assign` or `reassignSpecialJob` | Assignment | Keep; selected booking only. |
| Bulk Assign | Assign Booking | Same assignment handler, selected queue IDs | Assignment | Keep; same canonical workspace. |
| Unassign | Assign Booking | `reassignSpecialJob` with `unassign` | Assignment | Keep; canonical detail action. |
| Cancel / Unable to Complete | Assign Booking | `cancelBooking` / `failServiceJob` | Booking lifecycle / exception | Keep; existing booking update, not a second creation flow. |
| Dashboard Booking Queue shortcut | Dashboard | `navigateToModule('serviceAssign')` | Navigation | Keep as **Booking Queue**; no longer auto-opens New Booking. |
| Dashboard unassigned-booking alerts | Dashboard | Queue navigation | Navigation | Keep; no mutation. |
| Other Cleaning Status row and detail View Booking | Other Cleaning Status | `navigateToBooking(jobId)` | Navigation | Keep; preserves ID and opens selected queue record, including terminal rows. |
| Other Cleaning Status Start / Complete / Unable to Complete | Other Cleaning Status | `startSpecialJob`, `completeSpecialJob`, `failServiceJob` | Execution | Keep; execution lifecycle only. |
| Other Cleaning Status proof/photo and exception details | Other Cleaning Status | Existing proof/detail handlers | Execution / monitoring | Keep. |
| Customer list Assign DCC Schedule | Customers | `assignDailyCleanCustomer` | Recurring schedule | Keep; not on-demand booking assignment. |
| Customer read-only service history View Booking | Customer detail | `navigateToBooking(job.id || job.jobId || job.job_id)` | Navigation | Keep; record-specific ID. Removed the generic unfiltered Manage bookings button. |
| Staff list/detail Assign DCC Schedule | Staff | `assignDailyCleanCustomer` | Recurring schedule | Keep; label is explicit. |
| Staff route membership / change route | Staff | `assignStaffToRoute`, `unassignStaffFromRoute` | Route management | Keep; no booking mutation. |
| Staff read-only SEE job history View Booking | Staff detail, Assignments tab | `navigateToBooking(job.id || job.jobId || job.job_id)` | Navigation | Keep; record-specific ID. Staff-wide filter shortcut remains read-only. |
| Assign Jobs daily cleaner actions | Assign Jobs | `assignDailyCleanCustomer`, `unassignDailyCleanCustomer` | Recurring schedule | Keep; separate DCC schedule management. |
| Global booking search result | Global search | `cwp-v2:search-select` → `navigateToBooking(item.id)` | Navigation | Keep; booking ID preserved. |
| Unassigned-booking notification | Notifications | Notification carries `bookingId` → `navigateToBooking(bookingId)` | Navigation | Keep; each alert opens the matching queue record. |
| Package create/edit/status | Packages | `/api/see/packages` | Package configuration | Keep; no job creation, scheduling, or staff assignment. |
| Hybrid package / membership lifecycle | Hybrid Packages | `/api/see/hybrid/...` | Membership lifecycle / provisioning | Keep; no direct job creation, schedule, assignment, or dispatch. |
| UI Lab sample “Add Demo Row” | Lazy-loaded UI Lab | Local in-memory sample dataset only | Demo | Keep as an explicitly labelled demo action; it cannot create a real booking. Cache version bumped. |

### Duplicate workflows found and removed or redirected

- Other Cleaning Status previously had duplicate create/assign/reassign paths. The implementation already removed those mutation forms/handlers; the execution page now offers record-specific View Booking links only.
- The dashboard previously had a Create Booking shortcut that navigated to Assign Booking and immediately opened its create modal. It now opens the Booking Queue only.
- Customer history and Other Cleaning Status had generic Manage bookings buttons that opened an unfiltered queue. Customer history now places a View Booking link on each record; Other Cleaning Status links each row/detail to its record. The generic execution toolbar handoff was removed.
- The lazy UI Lab contains a local in-memory mock dataset and previously called its demo-row insertion New Booking. The labels/result text now say Add Demo Row / simulated sample record, and no API is called.

## DCC schedule actions retained

Customer and Staff row/detail actions call `assignDailyCleanCustomer`, and the Assign Jobs module also calls `unassignDailyCleanCustomer`. These assign recurring DCC customers to recurring staff schedules; they do not create or dispatch on-demand bookings. UI labels use **Assign DCC Schedule**. The separate route membership actions (`assignStaffToRoute` / `unassignStaffFromRoute`) remain route-management controls.

## Navigation and handoff verification

- Customer history View Booking calls `navigateToBooking` with that history row's ID.
- Staff SEE job history View Booking calls `navigateToBooking` with that job's ID; staff-wide View on-demand bookings remains a filter/navigation shortcut and does not mutate.
- Other Cleaning Status list and detail View Booking actions call `navigateToBooking` with the selected row ID, including terminal rows.
- Global search dispatches the selected booking result ID through `cwp-v2:search-select`; `v2-bookings.js` stores it as `pendingNavigationBookingId`, navigates to `serviceAssign`, resolves the queue row, and calls `openDetail` for that exact ID.
- Unassigned-booking notifications are emitted per record and carry the booking ID. Clicking one calls `navigateToBooking(id)` and opens that exact queue record; the previous aggregate alert could not preserve a specific ID.

These handoffs were verified by code-path inspection and the ownership QA assertions. A browser click-through with a populated local test fixture was not available during this pass; see verification results below.

## Final verification follow-up (2026-11-28)

Ownership remains frozen as defined above. This pass corrected test setup and assertions only; it did not change the booking API or move any booking actions.

### Fixture and test corrections

- `tests/test_bookings_migration_qa.js`: replaced the incomplete legacy create payload with a canonical contract fixture containing `customerId`, `vehicleId`, `locationId`, and `serviceIdOrCode`. The test mocks `seeExecutionService.createCanonicalJob` and the follow-up repository lookup at the API boundary, asserts the payload and returned booking ID, and asserts that no database is configured. This checks request routing without connecting to Neon or weakening the API's validation.
- `tests/test_other_cleaning_status_migration_qa.js`: corrected the test data variable from ignored `LOCAL_DATA_FILE` to the server's `DATA_FILE`. Added an assertion that the old incomplete payload remains rejected, then set `legacyCompatibility: true` for the legacy job fixture because this suite exercises legacy start/completion/proof behavior. The existing start, completion, photo, and exception assertions remain.
- `tests/test_daily_clean_assignment_hub_qa.js`: replaced assertions for the retired Legacy Admin selectors with active Admin V2 `v2View_jobAssignment`, roster/staff tabs, assignment and unassignment forms/handlers, exact DCC labels, server actions, and SEE/DCC separation. DCC assignment, unassignment, and route membership coverage remains.

### Results

- Passed: `node --check` on all three corrected test files and `tests/test_admin_v2_booking_ownership_qa.js`.
- Passed: `node tests/test_bookings_migration_qa.js` API phase, including canonical request forwarding to the mocked service boundary, returned booking ID, legacy seed checks, and cancel-reason validation. The suite then failed its browser phase because no CDP page target became available on the local test port.
- Passed: `node tests/test_other_cleaning_status_migration_qa.js` API phase, including the invalid-payload rejection and isolated legacy start, completion, proof, and exception checks. The suite then failed its browser phase because no CDP WebSocket URL became available.
- Passed: `node tests/test_daily_clean_assignment_hub_qa.js` against the current Admin V2 DCC hub.
- Passed: `node tests/test_admin_v2_booking_ownership_qa.js` for ownership, mutation handlers, DCC separation, cache versions, and ID-bearing handoff contracts.
- Browser E2E and visual verification are **blocked**: both test harnesses could start their local test server in `NODE_ENV=test`, but neither obtained a usable headless Chrome/Edge CDP target. No browser interaction or E2E pass is claimed. The canonical create contract test mocked the database-backed service boundary, so creation against a populated SEE queue was not exercised.
- No production credentials, database, or real customer records were used. The local test server process is configured with `NODE_ENV=test`; `.env.prod.env` is not loaded, migrations are not run, and the canonical service boundary is mocked. The first test-generated `local_data.json` change was restored. A later final worktree check found new changes to `local_data.json`, `public/admin-v2/css/v2-components.css`, and login screenshots; those changes were left untouched as possible concurrent work.
- Not run: full project suite, deployment, migrations, or production access.

## Known remaining blockers

- Actual browser verification of booking creation through queue visibility, assignment/reassignment/unassignment, all ID-specific handoffs, and execution status consistency needs a working isolated browser/CDP environment. No real booking or staff dispatch should be used for that verification.
- The API-level canonical create test verifies the request contract and returned ID through a mocked service boundary; it does not validate fixture IDs against a live canonical service catalogue or database.
- `navigateToBooking` intentionally warns if the requested record is absent from the Assign Booking queue instead of opening an unrelated record.

## Known remaining issues

- Staff history currently exposes canonical SEE jobs; legacy/DCC execution records remain visible in their operational modules and are not given a fabricated on-demand booking link.

## Changed files

- `public/admin-v2/index.html` — clarified dashboard and demo actions, removed generic execution queue button, added cache-busting versions.
- `public/admin-v2/js/v2-dashboard.js` — dashboard shortcut only opens the canonical queue.
- `public/admin-v2/js/v2-customers.js` — per-record read-only booking handoff; removed generic queue shortcut.
- `public/admin-v2/js/v2-staff.js` — per-record read-only job handoff.
- `public/admin-v2/js/v2-special-jobs.js` — record-specific View Booking for active and terminal jobs; removed generic toolbar handoff.
- `public/admin-v2/js/v2-notifications.js` — each unassigned-booking alert now preserves and opens its booking ID.
- `public/admin-v2/js/v2-playground.js` — demo feedback no longer describes a simulated booking creation.
- `tests/test_admin_v2_booking_ownership_qa.js` — ownership and handoff regression assertions.
- `tests/test_bookings_migration_qa.js` — canonical request fixture and mocked service-boundary assertion.
- `tests/test_other_cleaning_status_migration_qa.js` — isolated data path, explicit legacy compatibility fixture, and validation assertion.
- `tests/test_daily_clean_assignment_hub_qa.js` — active Admin V2 DCC hub regression assertions.
- `docs/admin-v2/BOOKING_WORKFLOW_OWNERSHIP_AUDIT.md` — this final inventory and verification record.

## Git/worktree preservation

Final branch remains `main` tracking `origin/main`; no commit, push, reset, rebase, revert, or history operation was performed. The intended booking ownership changes and test corrections are listed above. Additional late worktree changes to `local_data.json`, `public/admin-v2/css/v2-components.css`, and `tests/screenshots/admin_login_*.png` were preserved without edits.
