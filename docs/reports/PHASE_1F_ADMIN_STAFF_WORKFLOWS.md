# PHASE 1F — ADMIN & STAFF WORKFLOWS REPORT
**Target Database:** Neon PostgreSQL (`cwp_customer_db`)  
**Architecture Specification:** `docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md`  
**Execution Status:** COMPLETED & VERIFIED (43/43 PASS)

---

## 1. Executive Summary

Phase 3 and Phase 4 implement the complete suite of administrative operations and field staff portal experiences directly on Neon PostgreSQL. Every workflow—multi-vehicle and multi-location customer management, staff assignment and reassignment, route sequence ordering, on-demand car wash and solar panel cleaning job dispatch, and strict staff boundary isolation—has been implemented and verified.

---

## 2. Admin Panel Workflows Architecture

### 2.1 Customer Master & Relationship Safeguards
- **Multi-Vehicle Support:** Customers can possess multiple vehicles (`vehicles` table) with individual registration numbers, vehicle types, models, and reference photo links.
- **Multi-Location Support:** Each customer can have a primary service location and secondary locations (e.g., office, home) in `service_locations`, complete with parking instructions and Google Maps navigation URLs.
- **Compound Foreign Key Enforcement:** The database constraint `(default_location_id, customer_id)` mathematically guarantees that a vehicle cannot be linked to another customer's service location.
- **Search Capabilities:** Fast parameterized search across customer name, phone number, and unique customer code.
- **Safe Soft Deletion:** `deleteCustomer` soft-deletes the customer (`deleted_at = CURRENT_TIMESTAMP`, `is_active = FALSE`), sets the mandatory `deletion_reason` and `deleted_by`, deactivates all active staff assignments and pending jobs, and logs the action to `audit_logs`.

### 2.2 Field Staff Management & Assignments
- **Staff Provisioning:** Creation with validated 10-digit Indian phone number and mandatory 6-digit PIN.
- **Assignment History Immutability:** Assignments in `staff_assignments` are strictly protected by `trg_staff_assignments_immutability`. When a customer or job is reassigned, the previous assignment is safely deactivated (`is_active = FALSE`, `unassigned_at = CURRENT_TIMESTAMP`, `reassignment_reason = ...`) and a new assignment row is inserted.
- **Route Sequence Ordering:** Admins can configure custom stop sequences in `staff_route_sequences`, ordering both daily cleaning stops and on-demand field jobs.

### 2.3 On-Demand Job Dispatch (Car Wash & Solar Cleaning)
- **Car Wash Jobs:** Dispatched with vehicle registration, location, package details, and special instructions.
- **Solar Cleaning Jobs:** Dispatched with structured site details (`site_details` JSONB containing panel count, roof access type, etc.), location, and special instructions.

---

## 3. Staff Portal Experience & Strict Data Isolation

### 3.1 Field-Usable Staff Portal
- **Zero Cross-Staff Leakage:** Staff members strictly see only the customers and jobs actively assigned to them in `staff_assignments`. Tests proved that when Staff 1 is assigned a customer, Staff 2 sees exactly 0 records.
- **Daily Cleaning Customers:** Includes customer name, contact details with one-tap calling (`tel:`), navigation link to Google Maps, vehicle registration, model, photo preview, and Aaj/Kal cleaning rotation instructions.
- **On-Demand Field Jobs:** Staff receives dispatched car wash and solar cleaning work cards with full site and job instructions.
- **Same-Day Cleaning Checkoffs:** Live integration with `service_logs` marks vehicles and jobs completed for the current date in Indian Standard Time (`Asia/Kolkata`).

---

## 4. Test Verification Evidence

Automated test runner: `tests/test_phase1f_workflows_and_sync.js`  
Execution command: `node --env-file-if-exists=.env tests/test_phase1f_workflows_and_sync.js`

```text
================================================================
TEST SUITE: Phase 1F Admin & Staff Workflows, Isolation, Sync
Target Database: cwp_customer_db
================================================================

--- 1. Empty Database Handling ---
  [PASS] Admin customer list handles empty database gracefully (returns []) 

--- 2. Staff Setup ---
  [PASS] Staff 1 (STF91) created 
  [PASS] Staff 2 (STF92) created 
  [PASS] Empty staff portal dailyCarCleaning returns [] 
  [PASS] Empty staff portal carWashing returns [] 
  [PASS] Empty staff portal solarCleaning returns [] 
  [PASS] Empty staff portal totalCount is 0 

--- 3. Customer Creation with Multi-Vehicle & Multi-Location ---
  [PASS] Customer Anil Sharma created with multi-vehicle & multi-location 

--- 4. Customer Search Workflows ---
  [PASS] Search by customer name matches 
  [PASS] Search by phone matches 
  [PASS] Search by customer code matches 
  [PASS] Customer has exactly 2 service locations 
  [PASS] Customer has exactly 2 vehicles associated 
  [PASS] Customer assigned to STF91 

--- 5. Staff Portal Data Isolation ---
  [PASS] Staff 1 sees assigned customer Anil Sharma 
  [PASS] Customer name verified 
  [PASS] Staff 1 sees both vehicles for customer 
  [PASS] Aaj/Kal rotation instructions visible 
  [PASS] Staff 2 CANNOT see Staff 1 assignments (0 records returned) 
  [PASS] Staff 2 total count is strictly 0 

--- 6. Route Sequence Management ---
  [PASS] Staff 1 route sequence saved 
  [PASS] Staff 1 route sequence retrieved 

--- 7. On-Demand Job Dispatch ---
  [PASS] Staff 2 still has 0 daily car cleaning assignments 
  [PASS] Staff 2 sees dispatched Car Wash job 
  [PASS] Staff 2 sees dispatched Solar Cleaning job 
  [PASS] Solar job site details accurately populated 
  [PASS] Staff 1 cannot see Staff 2 car wash jobs 
  [PASS] Staff 1 cannot see Staff 2 solar cleaning jobs 

--- 8. Offline Synchronization & Conflict Handling ---
  [PASS] Offline completion synced successfully 
  [PASS] Result status is synced 
  [PASS] Duplicate mutation acknowledged idempotently without error 
  [PASS] Conflict resolution handled cleanly 
  [PASS] Conflict resolution status reported 
  [PASS] Conflict resolution recorded in immutable audit_logs 
  [PASS] Staff portal reflects same-day completion state 

--- 9. Customer Reassignment & Soft Deletion ---
  [PASS] Customer updated & reassigned to STF92 
  [PASS] Customer successfully removed from old staff (STF91) 
  [PASS] Customer successfully visible to newly assigned staff (STF92) 
  [PASS] Customer soft-deleted with mandatory reason 
  [PASS] Soft-deleted customer hidden from staff portal 
  [PASS] Soft-deleted customer hidden from active admin list 

--- Cleaning up Test Fixtures ---
  [PASS] Zero test customers retained in database (count: 0)
  [PASS] Zero test staff retained in database (count: 0)

================================================================
SUMMARY: 43 PASSED, 0 FAILED
================================================================
```

---

## 5. Verification Conclusion
Both Admin Panel and Staff Portal business logic are fully verified against Neon PostgreSQL with zero cross-staff data leakage, complete relationship integrity, and zero test data retained in `cwp_customer_db`.
