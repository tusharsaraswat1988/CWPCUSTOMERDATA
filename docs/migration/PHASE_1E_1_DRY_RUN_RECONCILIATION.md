# PHASE 1E.1 — DRY-RUN RECONCILIATION & SIMULATION REPORT
**Application Target:** Standalone CWP Customer Data App (`CWPCUSTOMERDATA`)  
**Target Database:** Isolated Neon PostgreSQL (`cwp_customer_db`)  
**Execution Date:** November 20, 2026  
**Simulation Manifest:** 51 Source Rows Analyzed  

---

## 1. Projected Database Table Counts Post-Migration

The following table provides the exact mathematical reconciliation between the Google Sheets source and the 15 PostgreSQL tables:

| # | PostgreSQL Target Table | Projected Row Count | Reconciliation Source & Justification |
|:---:|---|:---:|---|
| 1 | `service_categories` | **3** | Static reference slugs (`daily_car_cleaning`, `car_washing`, `solar_cleaning`) |
| 2 | `customers` | **51** | Exact 1:1 mapping of 51 Google Sheet rows (Option B — Row-Preserving) |
| 3 | `service_locations` | **53** | 51 primary locations + 2 secondary locations (Row 7 and Row 19) |
| 4 | `vehicles` | **55** | 47 rows with 1 vehicle + 4 rows with 2 vehicles (`47 + 8 = 55`) |
| 5 | `staff` | **2** | Sourced from `local_data.json`: `STF01` (Chandan Soni) & `STF02` (Gaurav Kr Gupta) |
| 6 | `staff_auth` | **2** | Preserves existing salted `scrypt` hashes for `STF01` & `STF02` |
| 7 | `subscriptions` | **49** | Exact 1:1 mapping of 49 `Daily Clean` rows |
| 8 | `subscription_vehicles` | **53** | 45 single-car subscriptions + 4 dual-car rotation subscriptions (`45 + 8 = 53`) |
| 9 | `service_jobs` | **2** | Exact 1:1 mapping of 2 `All Other Work` rows (`Car Washing`) |
| 10 | `staff_assignments` | **44** | 28 assigned to Chandan Soni + 16 assigned to Gaurav Kr Gupta (7 unassigned) |
| 11 | `staff_route_sequences`| **44** | Stop sequence numbers matching existing `staffSequences` |
| 12 | `service_logs` | **0** | Clean baseline; zero client `localStorage` checkoffs imported |
| 13 | `admin_users` | **1** | Superadmin account (`admin`) with salted `scrypt` hash of `ADMIN_PASSWORD` |
| 14 | `auth_sessions` | **0** | Clean baseline; sessions are created dynamically on user login |
| 15 | `audit_logs` | **1** | Baseline migration audit record documenting Phase 1E execution |

---

## 2. Integrity & Constraint Verification Simulation

1. **Foreign Key Integrity:**
   - Zero orphaned customer references: All 55 vehicles and 53 locations reference valid `customers(id)`.
   - Zero compound ownership violations: All `(default_location_id, customer_id)` match the exact same customer.
2. **Uniqueness Constraints:**
   - 51 unique `customer_code` values generated (zero collisions).
   - All 44 active staff assignments satisfy partial unique constraint `uq_active_sub_assignment`.
   - All 44 route sequences satisfy `uq_staff_route_order` per staff member.
3. **CHECK Constraints:**
   - All 51 customer rows satisfy `chk_customer_active_deleted`.
   - Both `service_jobs` rows satisfy `chk_job_target` (both have `service_category_id = 'car_washing'` with valid `vehicle_id`).

---

## 3. Pre-Migration Checklist

| Verification Gate | Result |
|---|:---:|
| Target Database confirmed as `cwp_customer_db` | **CONFIRMED** |
| Target Database contains 0 business records | **CONFIRMED** |
| Target Database contains exactly 15 public tables | **CONFIRMED** |
| Preserved staging database `neondb` (132 tables) untouched | **CONFIRMED** |
| Active runtime `http://localhost:3000` running on Google Sheets | **CONFIRMED** |
| Monorepo `D:\cwpdetailersapp` completely untouched | **CONFIRMED** |
| Technical gaps A1, A2, A3 fully verified (17/17 tests passed) | **CONFIRMED** |
| All 51 source rows parsed with deterministic customer codes | **CONFIRMED** |

---

## 4. Final Recommendation

### **RECOMMENDATION: GO FOR PHASE 1E DATA MIGRATION**

The v2.1.1 schema in `cwp_customer_db` is fully verified, mathematically sound, and 100% compatible with all 51 rows of the live Google Sheets master. 

All technical gaps are closed, row-preserving customer codes are validated, and the migration can proceed with complete confidence under single-transaction safety.
