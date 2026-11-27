# CWP SEE-05 — Legacy Route Closure Matrix

| Route / Action | Legacy Call | SEE Adapter / Enforcement | Authorization | Entitlement | Lifecycle & Proof |
|---|---|---|---|---|---|
| `assignSpecialJob` (`server.js`) | `adminService.assignSpecialJob` | Preflight `seeStaffCapabilityService.evaluateStaffEligibility` (service, schedule, equipment) | Admin session (`401` if missing) | N/A | Enforces SEE eligibility before assignment |
| `reassignSpecialJob` (`server.js`) | `adminService.reassignSpecialJob` | Enforces `seeStaffCapabilityService.evaluateStaffEligibility` for `job.service_id` | Admin session (`401` if missing) | N/A | Revalidates new staff capability, schedule & equipment |
| `sellCustomerPackage` (`server.js`) | `packageService.sellPackage` | Routes to `seeEntitlementService.createPurchase` when package exists in `public.packages` | Admin session (`401` if missing) | Creates immutable `purchase_snapshot` + `entitlement_accounts` | Canonical SEE |
| `redeemPackageEntitlement` (`server.js`) | `packageService.redeemPackage` | Routes to `seeEntitlementService.mutateEntitlement` when `accountId` / `entitlementAccountId` is provided | Admin session (`401` if missing) | Atomic `consume` ledger entry | Canonical SEE |
| `createServiceBooking` (`server.js`) | `bookingService.createBooking` | Routes to `seeExecutionService.createCanonicalJob` when `serviceIdOrCode` + `locationId` provided | Admin session (`401` if missing) | Atomic `reserve` inside job tx | Canonical SEE |
| `completeSpecialJob` (`server.js`) | `bookingService.completeJob` | Enforces `staff_assignments` ownership (`403` on unassigned/other staff) | Staff/Admin session | Enforces active assignment | Prevents IDOR |
| `failServiceJob` (`server.js`) | `bookingService.failJob` | Enforces `staff_assignments` ownership + delegates SEE jobs to `seeExecutionService.terminateJobWithoutCompletion` | Staff/Admin session | Atomic `release` inside tx | Canonical SEE |
| `cancelSpecialJob` (`server.js`) | `bookingService.cancelBooking` | Enforces `staff_assignments` ownership + delegates SEE jobs to `seeExecutionService.terminateJobWithoutCompletion` | Staff/Admin session | Atomic `release` inside tx | Canonical SEE |
