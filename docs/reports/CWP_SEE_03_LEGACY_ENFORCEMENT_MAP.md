# CWP SEE-03 — Legacy Endpoint Enforcement Map

| Endpoint / Path | Previous Behavior | New SEE-03 Enforcement | Compatibility Status | Remaining Risk |
|---|---|---|---|---|
| `GET /api/see/jobs/:jobId/staff-contract` | Allowed unassigned jobs (`job.staff_id === null`) for any staff | `authorizeJobAccess` requires active `staff_assignments` row matching `staffSess.staffId` (403 otherwise) | Canonical SEE | Closed |
| `POST /api/see/jobs/:jobId/{start,complete,terminate,solar-verify}` | No `staff_id` ownership check; trusted `body.staffId` | `authorizeJobAccess` enforces active assignment; uses trusted `staffSess.staffId` | Canonical SEE | Closed |
| `POST /api/see/jobs/:jobId/addons/:jobAddonId/complete` | No job ownership or `jobAddonId` belonging check | Enforces `authorizeJobAccess` + verifies `jobAddon.job_id === jobId` | Canonical SEE | Closed |
| `POST /api` (`completeSpecialJob` / `completeServiceBooking`) | Allowed staff to complete unassigned jobs (`assignedStaffId && ...`) | Enforces `repos.staffAssignments.findActiveByJobId(jobId)` matching `staffSess.staffId` | Legacy Compatibility Adapter | Low (retire after frontend migration) |
| `POST /api` (`failServiceJob` / `failServiceBooking`) | No staff assignment ownership check | Enforces `repos.staffAssignments.findActiveByJobId(jobId)` matching `staffSess.staffId` | Legacy Compatibility Adapter | Low (retire after frontend migration) |
| `repos.serviceJobs.createJob` | Left `service_jobs.service_id` as `NULL` | Auto-resolves canonical `service_id` from `public.services` | Legacy Compatibility Adapter | Closed |
| `getServiceCatalog` / `getPackageCatalog` | Static in-memory fallback | Queries DB-driven `seeCatalogueService` when Neon is active; static fallback only when offline/test | Legacy Compatibility Adapter | Low (remove static fallback post-frontend) |
