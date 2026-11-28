# CWP Admin V2 — Booking Workflow Ownership Audit

**Status:** Audit only; no application code, UI, tests, or data were changed.
**Scope:** Active Admin V2 booking and operational assignment entry points.

## Executive summary

Admin V2 has a clear intended booking control surface at **Assign Booking** (`serviceAssign`), with a New Service Booking form, a booking queue, booking detail actions, and staff assignment/reassignment. However, booking/job control is duplicated in **Other Cleaning Status** (`specialJobs`): its “Assign Job” form can create a service job and assign staff in one operation, while its row/detail actions can assign or reassign existing jobs. Dashboard's Create Booking shortcut already navigates to Assign Booking and opens its modal.

Customers and Staff each expose “Assign Job” controls, but these do **not** create or assign an on-demand service booking. Both call `assignDailyCleanCustomer`, a separate recurring Daily Car Cleaning customer-to-staff schedule assignment. The standalone **Assign Jobs** page manages that same daily-clean assignment workflow. These controls still violate the requested single ownership model for staff assignment decisions if that model includes recurring DCC customer assignments; product scope should explicitly decide whether DCC route/customer scheduling is part of booking ownership or a distinct recurring-subscription operation.

Package catalogue pages manage products and hybrid membership lifecycle/provisioning. Their purchase, renewal, expiry, cancellation, and reconciliation operations are not service-booking creation/assignment. The canonical Assign Booking creation flow supports canonical SEE service booking with customer, vehicle (except solar), location, service, paid or eligible entitlement-covered booking, compatible add-ons, date/time, optional immediate staff, and server-side creation. UI inspection alone does not establish that duplicate prevention, all availability checks, or editing are supported. Existing booking edit is not exposed as a general edit flow; the queue supports assignment, unassignment, cancellation, and unable-to-complete actions.

## Active runtime confirmation

| Item | Evidence |
|---|---|
| Entry point | `server.js` serves the Admin V2 page for `/admin` routes; repository instructions confirm `/admin` and `/admin/*` resolve to `public/admin-v2/index.html`. |
| Active page | `public/admin-v2/index.html`; screenshot URLs show `/admin?tab=serviceAssign`, `/admin?tab=specialJobs`, `/admin?tab=staff`, `/admin?tab=hybridPackages`, and `/admin?tab=dashboard`. |
| UI generation | Admin V2. `index.html` loads V2 modules including `v2-bookings.js`, `v2-special-jobs.js`, `v2-customers.js`, `v2-staff.js`, and `v2-hybrid-packages.js`. Legacy `public/js/app.js` is not the owner of these routes. |
| Canonical booking DOM | `v2View_serviceAssign`, `v2BkBtnNewBooking`, `v2ModalCreateBooking`, `v2ModalAssignBooking`, booking queue/detail panel. |
| Other operational DOM | `v2View_specialJobs`, `v2ModalSjAssign`, and `v2ModalSjReassign` are owned by `v2-special-jobs.js`. |
| Customer/staff duplicate DOM | Customer table `data-action="assignJob"` opens `v2ModalAssignJob`; staff table action opens `v2ModalStaffAssignJob`. Both modules bind and submit those forms. |
| APIs | Admin action API is `POST /api` via `CWP_ADMIN_V2.api.request(...)`; canonical SEE endpoints use `/api/see/...`. Backend action dispatch is in `server.js`. |

## Booking ownership map

| UI location | Button / action | Modal / page | JS function | API action / route | Backend function | Actual effect | Classification |
|---|---|---|---|---|---|---|---|
| Dashboard quick actions | Create Booking | Navigates to Assign Booking and opens canonical modal | `v2-dashboard.js` handler -> `bookings.openCreateModal()` | No write until submit | None until submit | Navigation into canonical creation flow | NAVIGATION |
| Assign Booking | New Booking / Create Booking | `v2ModalCreateBooking` | `openCreateModal`, `submitCreateModal` in `v2-bookings.js` | `POST /api` `action:createServiceBooking` | `server.js` dispatch -> `seeExecutionService.createCanonicalJob` for canonical intent, with eligible synchronous assignment as applicable | Creates canonical service job; customer/service/location required; vehicle required unless solar; sends entitlement/purchase snapshot, add-ons, date/time, optional staff | CREATE_BOOKING |
| Assign Booking | Row / detail Assign Staff; bulk Assign | `v2ModalAssignBooking` | `openAssignModal`, submit handler in `v2-bookings.js` | SEE-managed: `POST /api/see/jobs/:id/assign`; legacy-managed: `POST /api` `action:reassignSpecialJob` | SEE execution assignment endpoint; legacy `adminService.reassignSpecialJob` | Assigns selected existing jobs; can include time/reason; different backend paths by job generation | ASSIGN_EXISTING |
| Assign Booking | Unassign | Detail action | `handleUnassignJob` in `v2-bookings.js` | `POST /api` `action:reassignSpecialJob`, `unassign:true` | `adminService.reassignSpecialJob` | Removes active staff assignment and resets nonterminal status (`booked` for SEE, `pending` for legacy) | ASSIGN_EXISTING |
| Assign Booking | Cancel Booking | `v2ModalCancelBooking` | cancel submit handler in `v2-bookings.js` | `action:cancelBooking` / canonical SEE cancel path | `bookingService.cancelBooking` or SEE execution service | Changes existing job to cancelled; not a creation/assignment action | UPDATE_BOOKING |
| Assign Booking | Unable to complete | `v2ModalFailBooking` | fail submit handler in `v2-bookings.js` | `action:failServiceJob` | Backend service-job failure handler | Marks an existing job unable to complete/failed | UPDATE_BOOKING |
| Other Cleaning Status | Assign Job / Assign & Dispatch | `v2ModalSjAssign` | form submit handler in `v2-special-jobs.js` | `POST /api` `action:assignSpecialJob` | `server.js` -> `adminService.assignSpecialJob` (and canonical bridge behavior where selected) | Form accepts existing or manually-entered customer, address, category, schedule, and required staff; creates a service job and assigns/dispatches it. This is a separate create+assign workflow from canonical form. | CREATE_BOOKING |
| Other Cleaning Status | row Assign/Reassign; detail Assign Staff/Reassign Staff | `v2ModalSjReassign` | `openReassignModal`, submit in `v2-special-jobs.js` | `POST /api` `action:reassignSpecialJob` | `adminService.reassignSpecialJob` | Assigns/reassigns/unassigns an existing legacy/special job; may change time/sequence; terminal jobs blocked | REASSIGN |
| Other Cleaning Status | status/proof/exception actions | detail/action panel | `v2-special-jobs.js` | `startSpecialJob`, `completeSpecialJob`, `cancelSpecialJob`, `failServiceJob` | Service job status/execution handlers | Operational execution/status changes, not booking creation. Completion/proof should remain operational capabilities if this page retains status-monitoring ownership. | UPDATE_BOOKING |
| Customers table | Assign Job | `v2ModalAssignJob` | `openAssignJobModal`, `submitAssignJob` in `v2-customers.js` | `action:assignDailyCleanCustomer` | `adminService.assignDailyCleanCustomer` | Assigns a customer to a DCC staff schedule; does not create an on-demand service booking | ASSIGN_EXISTING |
| Staff table | Assign Job | `v2ModalStaffAssignJob` | `openAssignJobModal`, `submitStaffAssignJob` in `v2-staff.js` | `action:assignDailyCleanCustomer` | Same `adminService.assignDailyCleanCustomer` | Same recurring DCC schedule assignment as Customers quick action | ASSIGN_EXISTING |
| Assign Jobs | Assign/Reassign Daily Cleaner; unassign | `v2AjAssignForm` etc. | `v2-assign-jobs.js` | `assignDailyCleanCustomer`, `unassignDailyCleanCustomer` | `adminService.assignDailyCleanCustomer`, `unassignDailyCleanCustomer` | Manages customer-to-staff DCC subscription/route assignment; not an on-demand booking queue | ASSIGN_EXISTING |
| Staff | Assign Staff to Route / Change Route | route modal | `v2-staff.js` route handlers | `assignStaffToRoute` / `unassignStaffFromRoute` | `routeService` | Changes route membership, not a booking assignment | UPDATE_BOOKING* |
| Packages | catalogue create/edit/status | package modal | `v2-see-packages.js` | `/api/see/packages` POST/PATCH and status route | SEE package handlers | Catalogue definition/lifecycle; no service job scheduled | VIEW_ONLY* |
| Hybrid Packages | package create/edit/status | hybrid package form | `v2-hybrid-packages.js` | `/api/see/hybrid/packages` POST/PATCH/status | SEE hybrid package handlers | Defines/updates catalogue product | VIEW_ONLY* |
| Hybrid Packages | renewal/cancel/expiry/reconcile/retry | membership/recovery rows | `v2-hybrid-packages.js` | `/api/see/hybrid/memberships/...`, `/api/see/hybrid/expiry/run`, reconciliation endpoints | Hybrid lifecycle/recovery services | Membership entitlement lifecycle or provisioning recovery; renewal can create a new service period/entitlements but does not schedule a service booking | REDEEM_ENTITLEMENT* |
| Service catalogue / Add-ons | create/edit/retire product | catalogue controls | `v2-see-services.js`, `v2-see-addons.js` | `/api/see/services`, `/api/see/addons` | SEE catalogue handlers | Product definition, no booking job | VIEW_ONLY* |
| Customer profile/history | service & booking history | customer detail panel | `v2-customers.js` | `getCustomerServiceJobs`/history reads | Read APIs | Displays booking history, no booking mutation. No selected-booking shortcut into Assign Booking was found in inspected active controls. | VIEW_ONLY |

`*` The classification vocabulary is booking-focused, so route/catalogue/membership lifecycle rows are nearest-fit labels; their actual effects are stated to avoid conflating them with booking actions.

## Flow tracing and similar-looking controls

### Canonical Assign Booking creation

`v2BkBtnNewBooking` opens `v2ModalCreateBooking`. `v2-bookings.js` loads active canonical services, customer vehicle/location context, matching active entitlement accounts, and service-compatible add-ons. Submit calls `createServiceBooking` with `bookingData`. `server.js` validates canonical booking intent and routes it to `seeExecutionService.createCanonicalJob`; legacy-compatible requests can route to `bookingService.createBooking`. The displayed form is canonical SEE-oriented, so it does not prove the legacy compatibility branch is normally reachable.

The form supports:

- Customer, vehicle when required, service location, canonical service.
- Pay-per-service or matching active package entitlement (`entitlementAccountId` and purchase snapshot).
- Compatible optional/required add-ons.
- Scheduled date and freeform time slot.
- Optional staff at creation.
- Special instructions.

The server is the source of operational eligibility validation. The UI includes no explicit availability search/slot validation step. Duplicate prevention/idempotency was not demonstrated in the reviewed frontend path. The Assign Booking queue does not expose general edit/reschedule fields; assignment may optionally update scheduled time, and cancellation/failure/status changes are separately available.

### Separate Other Cleaning Status creation

`v2SjAssignForm` allows an existing or manually-entered customer, phone/address, service category/type, vehicle or solar details, date/time, and **required** staff; submit calls `assignSpecialJob`. `server.js` dispatches to `adminService.assignSpecialJob`, which creates/assigns a service job. This is a genuinely distinct path: it bypasses the canonical customer vehicle/location/service/entitlement/add-on form and combines job creation with mandatory staff dispatch. Its adjacent reassign modal uses `reassignSpecialJob` and overlaps the canonical queue's existing-job assignment responsibility.

### Similar labels that mean different operations

- Customer “Assign Job” and Staff “Assign Job” both call `assignDailyCleanCustomer`; they assign a DCC customer schedule. They do not assign an existing `service_jobs` booking.
- Other Cleaning Status “Assign Job” creates and dispatches an on-demand/special service job through `assignSpecialJob`.
- Assign Booking “Assign Staff” operates on an existing booking, using SEE assignment for SEE-managed rows and `reassignSpecialJob` for legacy rows.
- Assign Jobs is specifically DCC customer/staff schedule management; it is not the Assign Booking queue despite its name.
- Hybrid package renew/redeem lifecycle concerns entitlements and service periods, while booking creation from an entitlement occurs through the canonical booking form.

## Other audited areas

- **Dashboard:** Create Booking is a shortcut to the canonical page/modal. “Assign Jobs” navigates to the distinct DCC assignment module. Dashboard cards and recent operations are read-only.
- **Customers and Add/Edit Customer:** Customer details and booking history are read-only; add/edit forms manage customer/profile/vehicle data. The table's Assign Job action is the DCC schedule assignment described above. No add/edit customer booking creation control was found.
- **Staff/detail:** Staff profile, work history, workload, route, status, and credentials are staff management. Table/detail Assign Job opens DCC schedule assignment. Route changes are route membership changes. Existing job/history displays are read-only.
- **Daily Cleaning Status:** `cleanReports` and its update/delete/proof actions concern DCC cleaning reports/records; the inspected route does not expose the canonical service booking create form. Keep status/proof workflows distinct from booking dispatch. Assign Jobs is its own DCC schedule control screen.
- **Packages:** Package/catalogue editing is not booking creation. Entitlement booking is supported by Assign Booking's customer balance context. Do not remove package purchase/entitlement backend logic just because booking workflows are consolidated.
- **Hybrid Packages:** Definition, membership lifecycle, provisioning health, renewal, expiry, cancellation, and reconciliation are not job scheduling or staff assignment. Preserve these operations; provide a canonical Assign Booking navigation handoff only if a membership redemption needs a scheduled job and context can be safely carried.
- **Services/Add-ons:** Catalogue CRUD and compatibility configuration, not job creation. No active booking submission controls found in the inspected catalogue modules.
- **Global search:** Search module is navigation/lookup; no booking creation mutation surfaced in search handlers inspected.
- **Playground/prototype markup:** `v2-playground.js` contains simulated/demo booking interactions and index markup contains prototype/demo content. Confirm these are not reachable production controls before removal; they should not be mistaken for operational booking paths solely from text matches.

## Exact controls to remove or convert

1. **Remove/convert Other Cleaning Status `Assign Job` entry point** (`v2SjAssign` button/modal/form and handler) to a shortcut into Assign Booking. Do not retain its alternate manual-customer, mandatory-staff creation path.
2. **Remove/convert Other Cleaning Status row/detail Assign/Reassign Staff controls** to navigation into Assign Booking with selected job context; keep execution status, completion, proof, and exception actions if operational monitoring remains here.
3. **Remove/convert Customers row/detail `Assign Job`** and the `v2ModalAssignJob` workflow if DCC customer-to-staff assignments are included in the ownership standard. Prefer a shortcut into the DCC assignment control surface only if recurring DCC route assignment is explicitly exempted from booking ownership; it must not be misrepresented as a service booking.
4. **Remove/convert Staff table/detail `Assign Job`** and `v2ModalStaffAssignJob` on the same DCC scope decision. Preserve staff roster/profile/workload and route management.
5. **Keep Dashboard Create Booking**, but preserve its existing navigation-to-Assign-Booking behavior. Keep dashboard Assign Jobs shortcut only if the separate DCC scheduling scope remains.
6. **Keep Assign Booking's New Booking, assignment, reassign/unassign, cancel and exception actions** as canonical booking management controls.
7. Do not remove package/hybrid membership/catalogue actions as duplicate booking workflows; they have separate domain effects.

## Read-only information and operational actions to preserve

- Customer booking history, status, schedule, execution notes/proof, and customer context.
- Staff assigned work, workload, job counts, profile, active status, designation, zone/route, and credentials.
- Daily/Other Cleaning execution status, proof, completion, and exception details.
- Package definitions, entitlements, membership term/history, provisioning state, renewal/expiry/cancellation and reconciliation functions.
- Assign Booking booking details and queue filtering, with assignment decisions owned there.

## Assign Booking gaps and architecture recommendation

Make the Assign Booking page the single Admin UI for on-demand service-job creation and assignment. Convert external booking references into route state/query context (e.g. selected customer, booking ID, staff filter, service or entitlement) and then open/select the canonical queue/modal; validate context against loaded records and clear it after consumption. Dashboard already demonstrates this handoff pattern.

Move the `assignSpecialJob` form's supported solar/car-wash/detailing inputs into the canonical form only after mapping them to canonical service IDs, location/vehicle requirements, payment/entitlement requirements, and any legacy-only fields. Do not simply delete the `assignSpecialJob` backend handler: inspect all API callers, staff app/system workflows, and data compatibility before deciding whether it remains necessary. Keep `reassignSpecialJob` for legacy jobs and for server-side legacy callers; canonical SEE jobs should continue through `/api/see/jobs/:id/assign`. Do not collapse the two backend paths unless data ownership and authorization behavior are proven equivalent.

Treat DCC recurring customer-to-staff schedule assignment as a separate domain decision. If the standard literally covers all staff assignment decisions, relocate the DCC assignment UI under the canonical Assign Booking control center or explicitly narrow the policy so DCC route/subscription scheduling remains under Assign Jobs. In either case, remove misleading Assign Job affordances from Customers/Staff or make them navigation only. Keep `assignDailyCleanCustomer` and `unassignDailyCleanCustomer` until all non-Admin/system callers and DCC route workflows are audited.

The canonical form currently has no demonstrated duplicate guard, availability picker, explicit booking edit flow, or contextual membership redemption shortcut. Audit backend validation/idempotency and define product behavior before implementing these capabilities. Existing staff assignment path does perform service capability/activity checks in the legacy service; SEE-managed assignment is validated by its own server path.

## Backend actions that should remain pending caller audit

- `createServiceBooking` -> canonical SEE creation and compatibility `bookingService.createBooking` (`server.js`, `services/bookingService.js`, SEE execution service).
- `assignSpecialJob` and `reassignSpecialJob` in `adminService.js`: distinct legacy/special job creation and assignment compatibility flows until all callers are proven obsolete.
- SEE job assignment endpoint: canonical SEE assignment.
- `assignDailyCleanCustomer` / `unassignDailyCleanCustomer`: DCC customer schedule assignment, not duplicate on-demand booking APIs.
- `cancelBooking`/`cancelSpecialJob`, start/complete/failure actions: execution lifecycle, potentially used by staff and operations portals.
- `redeemPackageEntitlement` and hybrid lifecycle/recovery actions: entitlement accounting/provisioning, not booking scheduling.
- `assignStaffToRoute` / `unassignStaffFromRoute`: route membership management.

## Risks and regression scenarios

- Canonicalization may silently drop special-job-only solar/detailing/customer/address fields or dispatch requirements.
- Legacy and SEE-managed jobs have different IDs, assignment endpoints, status transitions, and validation.
- Existing data may have DCC service jobs and customer schedule assignments with superficially similar labels.
- Removing UI controls without preserving staff/mobile/system backend callers could break active execution workflows.
- Navigation context must not select a stale/wrong booking or trust arbitrary IDs from query parameters.
- Package redemption needs to consume exactly one eligible entitlement and avoid duplicate booking creation on retries.
- Customer/staff detail panels and dashboard shortcuts must still show useful booking context after controls are removed.

## QA matrix for a later implementation phase

| Scenario | Expected result |
|---|---|
| Dashboard Create Booking | Opens Assign Booking canonical modal; no separate dashboard form/API. |
| Assign Booking paid service | Creates one canonical job with customer, required vehicle/location, service, date/time. |
| Entitlement-covered service | Only eligible active account for selected service is offered and consumed once. |
| Solar service | Vehicle is optional only where canonical service rules permit; location remains required. |
| Add-ons | Only compatible add-ons submit; required add-ons cannot be deselected. |
| Optional staff at creation | No staff creates unassigned queue row; selected staff uses canonical validated assignment path. |
| Existing unassigned booking | Assign from Assign Booking; status/assignment and audit trail update. |
| Existing assigned booking | Reassign from Assign Booking; inactive/incompatible/terminal jobs are rejected. |
| SEE-managed versus legacy job | Each uses its designated backend endpoint and preserves expected status. |
| Other Cleaning Status | No create/assign/reassign modal; view shortcut selects correct booking; status/proof still works. |
| Customer page | Booking history remains read-only; no direct booking mutation; navigation context opens correct selected booking if provided. |
| Staff page | Workload remains read-only; no booking assignment action; View Jobs applies staff filter. |
| DCC schedule assignment | Explicitly verified against chosen scope; no accidental migration into on-demand service job semantics. |
| Daily/Other status | Completion, proof, exception and status updates remain available without assignment controls. |
| Package/hybrid management | Catalogue, renewal, expiry, cancellation, provisioning recovery and reconciliation remain functional. |
| Duplicate submission/retry | Server idempotency/duplicate policy verified for create and entitlement redemption. |
| Global search/context | Search remains lookup/navigation only; context is validated and consumed safely. |

## Files inspected

- `AGENTS.md`
- `server.js`
- `public/admin-v2/index.html`
- `public/admin-v2/js/v2-api.js`
- `public/admin-v2/js/v2-app.js`
- `public/admin-v2/js/v2-bookings.js`
- `public/admin-v2/js/v2-customers.js`
- `public/admin-v2/js/v2-dashboard.js`
- `public/admin-v2/js/v2-hybrid-packages.js`
- `public/admin-v2/js/v2-search.js`
- `public/admin-v2/js/v2-special-jobs.js`
- `public/admin-v2/js/v2-staff.js`
- `public/admin-v2/js/v2-assign-jobs.js`
- `public/admin-v2/js/v2-clean-reports.js`
- `public/admin-v2/js/v2-see-services.js`
- `public/admin-v2/js/v2-see-packages.js`
- `public/admin-v2/js/v2-see-addons.js`
- `services/adminService.js`
- `services/bookingService.js`
- `services/routeService.js`

## Remaining uncertainty

This is a static source audit; no database connection or runtime browser inspection was performed. The screenshots corroborate the active Assign Booking, Other Cleaning Status, Staff, Dashboard and Hybrid Packages screens, but not the behavior of every control. The key scope question is whether DCC customer-to-staff recurring schedule assignment belongs to the user's “all staff assignment decisions” rule. Also verify any non-Admin callers of the listed backend actions before removal. Availability and duplicate-prevention guarantees require backend-specific follow-up.
