# CWP SEE-07 — Legacy Completion & Assignment Map

| Legacy Route / Action | Condition | Canonical SEE Delegation | Legacy Fallback? |
|---|---|---|---|
| `completeSpecialJob` / `completeServiceBooking` (`server.js`) | `existingJob.service_id` or `existingJob.entitlement_account_id` present | `seeExecutionService.completeExecution` (enforces ownership, proof, checklist, add-ons, atomic `consume`) | **NO** — SEE errors propagate as `400`; never falls back to `bookingService.completeJob` |
| `completeSpecialJob` / `completeServiceBooking` (`server.js`) | Purely non-SEE legacy job (`service_id` and `entitlement_account_id` both `NULL`) | `bookingService.completeJob` | Legacy-only |
| `assignSpecialJob` (`server.js`) | `customerId` + `locationId` + active SEE service | `seeExecutionService.createCanonicalJob` (single tx + `FOR UPDATE` staff lock + atomic `reserve`) | **NO** — errors propagate cleanly |
| `assignSpecialJob` (`server.js`) | Legacy composite payload without `locationId` | Preflight `evaluateStaffEligibility` + `adminService.assignSpecialJob` | Legacy composite payload only |
| `reassignSpecialJob` (`server.js`) | `job.service_id` or `job.entitlement_account_id` present (`toStaffId` != `'unassigned'`) | `seeExecutionService.assignJob` (single tx + `FOR UPDATE` job & staff locks + capability/equipment/schedule check) | **NO** — errors propagate cleanly |
