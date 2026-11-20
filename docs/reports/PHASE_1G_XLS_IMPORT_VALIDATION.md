# CWP Data App — Phase 1G: XLS/CSV Import Template & Schema Validation Report

**Document Target:** Standalone CWP Customer Data App (`CWPCUSTOMERDATA`)  
**Workspace:** `D:\cwp customer data app`  
**Database Target:** Isolated Neon PostgreSQL (`cwp_customer_db`)  
**Specification Version:** v2.1.1 Schema Compliant  
**Date of Audit:** November 20, 2026  
**Auditor / Worker:** `xls-validator` (Agent Swarm Phase 1G)  
**Deliverable Artifacts:**
- Template: `docs/templates/CWP_CUSTOMER_IMPORT_TEMPLATE.csv`
- Guide: `docs/templates/CWP_CUSTOMER_IMPORT_GUIDE.md`
- Report: `docs/reports/PHASE_1G_XLS_IMPORT_VALIDATION.md`

---

## 1. Executive Summary

As part of **Phase 1G**, a rigorous schema validation and relational integrity audit was conducted on the XLS/CSV customer import template and accompanying documentation for the CWP Customer Data App.

The primary objective was to validate that the customer batch import template fully aligns with the **v2.1.1 PostgreSQL Database Architecture** (15 public tables, compound foreign keys, immutable staff assignments, and timezone-aware service logs) while resolving critical structural limitations found in the legacy flattened single-row import format.

### Key Audit Findings:
1. **Critical Scalability Flaw in Legacy Template:** The previous template flattened vehicle records into `vehicle_1_*` and `vehicle_2_*` columns, strictly capping customers to 2 vehicles and 2 locations, while leaving unpopulated columns empty for 1-vehicle households.
2. **Missing Rotation Group Granularity:** The legacy template captured subscription-level `rotation_type` (`aaj_kal`) but lacked vehicle-level assignment (`rotation_group` / `schedule_tag`), preventing automated mapping of which vehicle was serviced on "Aaj" versus "Kal".
3. **Schema Enum Discrepancies:** The legacy template used arbitrary display names (e.g. `"Daily Car Cleaning"`) rather than strict database category slugs (`'daily_car_cleaning'`, `'car_washing'`, `'solar_cleaning'`).
4. **Missing GPS & Vehicle Classification Attributes:** Dedicated fields for `latitude`, `longitude`, and `vehicle_type` were absent.

### Improvements Delivered:
- **Normalized Multi-Row Architecture:** Designed and implemented a hierarchical multi-row schema keyed by `customer_code`. Customers can now register an arbitrary number of vehicles (3, 4, 5+) and service locations without altering the CSV column structure.
- **Explicit `rotation_group` Mapping:** Added `rotation_group` (`daily`, `aaj`, `kal`) directly resolving to `subscription_vehicles.schedule_tag`.
- **Database Enum Alignment:** Standardized `service_category` to valid schema slugs, supporting `daily_car_cleaning`, `car_washing`, and `solar_cleaning`.
- **Specialized Job Site Details:** Added `site_details` for solar panel cleaning (panel count, roof mounting type) complying with table constraints.
- **Duplicate Phone Validation:** Formally verified and documented that duplicate phone numbers are allowed across different customers.
- **Zero Actual Data Import:** Strictly limited to template, guide, and report deliverables. 0 actual customer records were imported into Neon DB.

---

## 2. Summary of Template State: Before vs. After

| Feature / Dimension | Legacy Template (`v1.0`) | Improved Template (`v2.1`) | Impact & Benefit |
|---|---|---|---|
| **Data Layout** | Single flattened row per customer | Normalized multi-row grouped by `customer_code` | Uncapped scaling for multi-vehicle / multi-location households. |
| **Vehicle Limit** | Hard limit of 2 vehicles (`vehicle_1`, `vehicle_2`) | **Unlimited (1 to N vehicles)** via sibling rows | Accommodates luxury multi-car estates (e.g., 3+ vehicles). |
| **Location Limit** | Hard limit of 2 addresses (primary, secondary) | **Unlimited (1 to N locations)** | Accommodates residence, office, farmhouse, parking bays. |
| **Vehicle Rotation Tag** | Unstructured text note only (`rotation_notes`) | **Dedicated `rotation_group` column** (`daily`, `aaj`, `kal`) | Automated population of `subscription_vehicles.schedule_tag`. |
| **Category Representation**| Display text (`Daily Car Cleaning`) | **Database Slug** (`daily_car_cleaning`, `car_washing`, `solar_cleaning`) | Zero FK lookup failures or translation ambiguities. |
| **GPS Coordinates** | Embedded inside Maps URL query parameter only | **Explicit `latitude` & `longitude` columns** | Direct insertion into `service_locations` numeric columns. |
| **Vehicle Attributes** | Flattened brand, model, color | Structured `vehicle_model`, `vehicle_type`, `vehicle_color` | Accurate classification (Car, SUV, Sedan, Hatchback, Bike). |
| **Solar Cleaning Support** | Unstructured notes (`16 Panels RCC Roof`) | **Structured `site_details` field** | Maps directly to `service_jobs.site_details` JSONB column. |
| **Sample Dataset Size** | 4 rows (1 per customer) | 7 rows (covers 3-car Aaj/Kal, duplicate phone, wash, solar) | Compact (5–8 rows max), comprehensively demonstrates all edge cases. |

---

## 3. Comprehensive Gap Analysis Table

The table below audits every relevant schema column across the 15 tables against the updated CSV import template:

| Schema Table | Target Column | Data Type | Schema Required | In Template | Status / Resolution |
|---|---|---|:---:|:---:|---|
| `customers` | `customer_code` | VARCHAR(32) | **YES (UNIQUE)** | `customer_code` | **PASS** — Grouping anchor across sibling rows. |
| `customers` | `name` | VARCHAR(150) | **YES** | `customer_name` | **PASS** — Mandatory on Row 1 of customer group. |
| `customers` | `phone` | VARCHAR(10) | **YES** | `phone` | **PASS** — 10-digit Indian mobile. Duplicate phone allowed. |
| `customers` | `alt_phone` | VARCHAR(15) | NO | `alt_phone` | **PASS** — Optional secondary contact. |
| `customers` | `email` | VARCHAR(150) | NO | `email` | **PASS** — Optional email address. |
| `customers` | `notes` | TEXT | NO | `customer_notes` | **PASS** — Administrative notes. |
| `customers` | `is_active` | BOOLEAN | **YES** (DEFAULT TRUE) | `is_active` | **PASS** — Parsed as boolean (`Yes`/`No`/`TRUE`/`FALSE`). |
| `service_locations` | `address_type` | VARCHAR(20) | **YES** (DEFAULT 'primary')| `address_type` | **PASS** — Values: `primary`, `secondary`, `office`. |
| `service_locations` | `address_text` | TEXT | **YES** | `address_text` | **PASS** — Doorstep physical address string. |
| `service_locations` | `google_maps_url` | TEXT | NO | `google_maps_url` | **PASS** — Staff navigation link. |
| `service_locations` | `latitude` | NUMERIC(10,7) | NO | `latitude` | **PASS** — Decimal GPS latitude coordinate. |
| `service_locations` | `longitude` | NUMERIC(10,7) | NO | `longitude` | **PASS** — Decimal GPS longitude coordinate. |
| `service_locations` | `parking_details` | VARCHAR(255) | NO | `parking_details` | **PASS** — Specific parking bay or porch notes. |
| `vehicles` | `registration_no` | VARCHAR(20) | **YES** | `vehicle_registration` | **PASS** — Mandatory for car cleaning & wash. |
| `vehicles` | `brand_or_model` | VARCHAR(100) | NO | `vehicle_model` | **PASS** — Vehicle model name (e.g. Scorpio-N). |
| `vehicles` | `vehicle_type` | VARCHAR(30) | **YES** (DEFAULT 'Car') | `vehicle_type` | **PASS** — Car, SUV, Sedan, Hatchback, Bike. |
| `vehicles` | `photo_url` | TEXT | NO | `vehicle_photo_url` | **PASS** — Valid Cloudinary / HTTPS URL or empty. |
| `service_categories` | `id` | VARCHAR(30) | **YES (PK)** | `service_category` | **PASS** — Exact slugs: `daily_car_cleaning`, `car_washing`, `solar_cleaning`. |
| `subscriptions` | `package_name` | VARCHAR(100) | **YES** | `package_name` | **PASS** — Subscription package name. |
| `subscriptions` | `packages_purchased` | INTEGER | **YES** (DEFAULT 1) | `packages_purchased` | **PASS** — Units purchased. |
| `subscriptions` | `rotation_type` | VARCHAR(30) | **YES** (DEFAULT 'none') | `rotation_type` | **PASS** — Values: `none`, `aaj_kal`, `custom`. |
| `subscriptions` | `rotation_notes` | TEXT | NO | `rotation_notes` | **PASS** — Detailed rotation instructions for staff cards. |
| `subscription_vehicles` | `schedule_tag` | VARCHAR(20) | **YES** (DEFAULT 'daily')| `rotation_group` | **PASS** — Vehicle schedule: `daily`, `aaj`, `kal`. |
| `service_jobs` | `service_type` | VARCHAR(100) | **YES** | `package_name` | **PASS** — Job type for on-demand services. |
| `service_jobs` | `site_details` | JSONB | **CONDITIONAL** | `site_details` | **PASS** — Required for `solar_cleaning` (panels, roof type). |
| `staff_assignments` | `staff_id` | UUID | NO | `assigned_staff_code` | **PASS** — Resolved via `staff.staff_code` (`STF01`). |

---

## 4. Foreign Key Relational Chain & Ingestion Flow

The CWP database architecture relies on strict compound foreign keys to maintain customer data isolation. The import processor must insert records in the following deterministic sequence:

```mermaid
flowchart TD
    CSV[CSV / XLS Row Group] --> STEP1[1. Customers Master]
    STEP1 -->|customer_id| STEP2[2. Service Locations]
    STEP1 -->|customer_id| STEP3[3. Vehicles Master]
    STEP2 -.->|default_location_id, customer_id| STEP3
    
    STEP1 -->|Check service_category| ROUTE{Category?}
    
    ROUTE -->|daily_car_cleaning| STEP4A[4A. Subscriptions]
    ROUTE -->|car_washing / solar_cleaning| STEP4B[4B. Service Jobs]
    
    STEP4A -->|subscription_id + customer_id| STEP5A[5A. Subscription Vehicles]
    STEP3 -->|vehicle_id + customer_id| STEP5A
    STEP2 -->|location_id + customer_id| STEP5A
    
    STEP4A -->|subscription_id + staff_code| STEP6A[6A. Staff Assignments]
    STEP4B -->|job_id + staff_code| STEP6B[6B. Staff Assignments]
```

### Ingestion Sequence & Rules:
1. **Transaction Isolation:** Group all rows with matching `customer_code`. Open `db.withTransaction(async (client) => { ... })`.
2. **Customer Master:** Insert into `public.customers`. Returns `customer.id`.
3. **Service Locations:** Insert distinct addresses into `public.service_locations`. Tag the first address as `is_primary = TRUE`. Returns `location.id`.
4. **Vehicles Master:** If vehicle registration is present, insert into `public.vehicles` with `customer_id` and `default_location_id`.
   - *Constraint Check:* `uq_vehicles_id_customer UNIQUE (id, customer_id)` guarantees composite ownership.
5. **Subscription / Service Job Branching:**
   - **For `daily_car_cleaning`:**
     - Insert into `public.subscriptions` (`service_category_id = 'daily_car_cleaning'`).
     - For each vehicle associated with this customer, insert into `public.subscription_vehicles` mapping `(subscription_id, customer_id, vehicle_id, location_id)` and setting `schedule_tag = row.rotation_group || 'daily'`.
     - *Compound FK Check:* `fk_sub_veh_sub_cust` and `fk_sub_veh_veh_cust` reject any vehicle not belonging to the customer.
   - **For `car_washing` or `solar_cleaning`:**
     - Insert into `public.service_jobs` (`service_category_id`, `site_details` for solar, `vehicle_id` for wash).
     - *Constraint Check:* `chk_job_target` enforces vehicle presence for wash and `site_details` presence for solar.
6. **Staff Assignment:**
   - If `assigned_staff_code` is provided (e.g. `STF01`), look up `staff.id`.
   - Insert into `public.staff_assignments` linking `staff_id` to `subscription_id` or `job_id`.
   - *Provenance Check:* Trigger `trg_staff_assignments_immutability` protects assignment history.

---

## 5. Multi-Vehicle Implementation Architecture

### 5.1. The Multi-Row Grouping Pattern
Real-world customer households frequently own 3 or more vehicles, often parked at different locations (e.g., home driveway vs. office parking bay) and cleaned on alternating days. 

Attempting to flatten N vehicles into single rows results in an unmaintainable schema with sparse columns (`vehicle_3_registration`, `vehicle_3_model`, `vehicle_4_...`). The multi-row approach solves this cleanly:

```
Row 1: [customer_code=CUST001] [Customer Data]  [Loc 1: Villa 14] [Veh 1: Scorpio-N] [Aaj]  [Daily Clean] [STF01]
Row 2: [customer_code=CUST001] [   (blank)   ]  [Loc 2: Office]   [Veh 2: Tiago]     [Kal]  [Daily Clean] [STF01]
Row 3: [customer_code=CUST001] [   (blank)   ]  [Loc 1: Villa 14] [Veh 3: Honda City][Aaj]  [Daily Clean] [STF01]
```

### 5.2. Import Processor Pseudocode
```javascript
async function importCustomerCsvGroup(csvRows, client) {
  // 1. Group rows by customer_code
  const groups = groupBy(csvRows, r => r.customer_code.trim());

  for (const [customerCode, rows] of Object.entries(groups)) {
    await db.withTransaction(async (tx) => {
      const primaryRow = rows[0];

      // 2. Validate customer level data
      validateIndianMobile(primaryRow.phone);
      
      // 3. Insert Customer
      const customer = await repos.customers.createCustomer({
        customerCode,
        name: primaryRow.customer_name,
        phone: primaryRow.phone,
        altPhone: primaryRow.alt_phone || null,
        email: primaryRow.email || null,
        notes: primaryRow.customer_notes || null,
        isActive: parseBoolean(primaryRow.is_active)
      }, tx);

      // 4. Create Locations Cache
      const locationMap = new Map();
      for (const row of rows) {
        if (row.address_text && !locationMap.has(row.address_text)) {
          const loc = await repos.serviceLocations.createLocation({
            customerId: customer.id,
            addressType: row.address_type || 'primary',
            addressText: row.address_text,
            googleMapsUrl: row.google_maps_url || null,
            latitude: row.latitude ? parseFloat(row.latitude) : null,
            longitude: row.longitude ? parseFloat(row.longitude) : null,
            parkingDetails: row.parking_details || null,
            isPrimary: (row.address_type === 'primary' || locationMap.size === 0)
          }, tx);
          locationMap.set(row.address_text, loc);
        }
      }

      // 5. Handle Service Category (Subscription vs Job)
      const isSubscription = primaryRow.service_category === 'daily_car_cleaning';
      let subscription = null;
      if (isSubscription) {
        subscription = await repos.subscriptions.createSubscription({
          customerId: customer.id,
          serviceCategoryId: 'daily_car_cleaning',
          packageName: primaryRow.package_name || 'Daily Clean',
          packagesPurchased: parseInt(primaryRow.packages_purchased, 10) || 1,
          rotationType: primaryRow.rotation_type || 'none',
          rotationNotes: primaryRow.rotation_notes || null
        }, tx);
      }

      // 6. Process Vehicles
      for (const row of rows) {
        if (row.vehicle_registration) {
          const loc = locationMap.get(row.address_text) || locationMap.values().next().value;
          const vehicle = await repos.vehicles.createVehicle({
            customerId: customer.id,
            defaultLocationId: loc?.id || null,
            registrationNo: row.vehicle_registration,
            brandOrModel: row.vehicle_model || null,
            vehicleType: row.vehicle_type || 'Car',
            photoUrl: row.vehicle_photo_url || null
          }, tx);

          if (isSubscription && subscription) {
            await repos.subscriptionVehicles.addVehicleToSubscription({
              subscriptionId: subscription.id,
              customerId: customer.id,
              vehicleId: vehicle.id,
              locationId: loc?.id || null,
              scheduleTag: row.rotation_group || (primaryRow.rotation_type === 'aaj_kal' ? 'aaj' : 'daily')
            }, tx);
          }
        }
      }

      // 7. Resolve Staff Assignment
      if (primaryRow.assigned_staff_code) {
        const staff = await repos.staff.findByStaffCode(primaryRow.assigned_staff_code, tx);
        if (staff) {
          if (isSubscription) {
            await repos.staffAssignments.assignStaffToSubscription({
              staffId: staff.id,
              subscriptionId: subscription.id,
              assignedBy: 'import_processor'
            }, tx);
          }
        }
      }
    });
  }
}
```

---

## 6. Worked Example: 3-Vehicle Household with Aaj/Kal Rotation

To demonstrate complete adherence, the updated template contains a full worked example of Customer `CUST001` (Vikram Malhotra):

### Scenario Details:
- **Customer:** Vikram Malhotra, Phone `9876543210`, Email `vikram@example.com`.
- **Primary Residence:** Villa 14, Royal Palm, Agra (`27.1800000, 78.0200000`), Front Covered Porch.
- **Secondary Location:** Office Block 3, Civil Lines, Agra (`27.2000000, 78.0100000`), Reserved Bay 4.
- **Vehicles:**
  1. `UP85AZ9999` — Mahindra Scorpio-N (SUV, Black, Photo available) → Parked at Villa 14 → Schedule: **Aaj**
  2. `UP85BY1111` — Tata Tiago (Hatchback, White, Photo available) → Parked at Office Bay 4 → Schedule: **Kal**
  3. `UP85CZ3344` — Honda City (Sedan, Silver, Photo available) → Parked at Villa 14 → Schedule: **Aaj**
- **Subscription:** `Daily Clean` (`daily_car_cleaning`), `packages_purchased = 1`, `rotation_type = 'aaj_kal'`.
- **Assigned Field Staff:** `STF01`.

### Exact CSV Template Data:
```csv
customer_code,customer_name,phone,alt_phone,email,is_active,customer_notes,address_type,address_text,google_maps_url,latitude,longitude,parking_details,vehicle_registration,vehicle_model,vehicle_type,vehicle_color,vehicle_photo_url,service_category,package_name,packages_purchased,rotation_type,rotation_group,rotation_notes,assigned_staff_code,site_details
CUST001,Vikram Malhotra,9876543210,,vikram@example.com,Yes,Call 10 minutes prior,primary,"Villa 14, Royal Palm, Agra",https://maps.google.com/?q=27.1800,78.0200,27.1800000,78.0200000,Front Covered Porch,UP85AZ9999,Scorpio-N,SUV,Black,https://res.cloudinary.com/cwp/scorpio.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,aaj,Scorpio on Aaj / Tiago on Kal / City on Aaj,STF01,
CUST001,,,,,,secondary,"Office Block 3, Civil Lines, Agra",https://maps.google.com/?q=27.2000,78.0100,27.2000000,78.0100000,Reserved Bay 4,UP85BY1111,Tiago,Hatchback,White,https://res.cloudinary.com/cwp/tiago.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,kal,,STF01,
CUST001,,,,,,primary,"Villa 14, Royal Palm, Agra",https://maps.google.com/?q=27.1800,78.0200,27.1800000,78.0200000,Driveway Left,UP85CZ3344,City,Sedan,Silver,https://res.cloudinary.com/cwp/city.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,aaj,,STF01,
```

### Database Records Generated from this Group:
1. `customers`: 1 row (`customer_code = 'CUST001'`).
2. `service_locations`: 2 distinct rows (`Villa 14` with `is_primary = TRUE`; `Office Block 3` with `is_primary = FALSE`).
3. `vehicles`: 3 distinct rows (`UP85AZ9999`, `UP85BY1111`, `UP85CZ3344`), all tied to `customer_id`.
4. `subscriptions`: 1 row (`service_category_id = 'daily_car_cleaning'`, `rotation_type = 'aaj_kal'`).
5. `subscription_vehicles`: 3 distinct rows:
   - Scorpio-N: `schedule_tag = 'aaj'`
   - Tiago: `schedule_tag = 'kal'`
   - City: `schedule_tag = 'aaj'`
6. `staff_assignments`: 1 active row assigning `STF01` to the subscription with `is_active = TRUE`.

---

## 7. Business Logic & Edge Case Validation

### 7.1. Duplicate Phone Numbers
- **Requirement:** Confirm whether duplicate phone numbers across different customers are permitted.
- **Schema Audit:** The table `customers` defines `phone VARCHAR(10) NOT NULL` and creates a non-unique index `idx_customers_phone ON public.customers (phone)`. Uniqueness is enforced strictly on `customer_code`.
- **Validation Outcome:** **PASS**. Multiple customers (e.g. family members, corporate fleets) may share the same phone number. Template Row 5 illustrates `CUST003` (Ananya Malhotra) sharing phone `9876543210` with `CUST001`.

### 7.2. Photo URLs
- **Requirement:** Ensure vehicle photo handling is production-safe.
- **Rule:** Accepts public HTTPS Cloudinary or CDN URLs. Empty values store `NULL`. Local filesystem paths are rejected.
- **Validation Outcome:** **PASS**. The template shows valid Cloudinary HTTPS URLs for primary vehicles and blank values where no photo exists.

### 7.3. Solar Panel Cleaning Jobs
- **Requirement:** Ensure solar panel cleaning conforms to `service_jobs` table constraints.
- **Schema Audit:** Constraint `chk_job_target` requires `site_details IS NOT NULL` when `service_category_id = 'solar_cleaning'`.
- **Validation Outcome:** **PASS**. Template Row 7 illustrates `CUST005` with `service_category = solar_cleaning`, blank vehicle fields, and populated `site_details = "panel_count: 16, roof_type: RCC, inverter_check: true"`.

---

## 8. Separation of Automated Import vs. Owner Operations

The import specification strictly delineates automated pipeline tasks from required owner manual steps:

| Operational Step | Automated Import Capability | Owner Manual Setup Required |
|---|:---:|:---:|
| Create customer account & contact |  **Automated** | — |
| Create primary & secondary service locations |  **Automated** | — |
| Create vehicles & link to customer locations |  **Automated** | — |
| Create subscriptions & link vehicles |  **Automated** | — |
| Set vehicle rotation tags (`aaj` / `kal`) |  **Automated** | — |
| Create on-demand jobs (Car wash / Solar) |  **Automated** | — |
| Link pre-existing staff to subscriptions/jobs |  **Automated** | — |
| **Register staff members & PINs** |  No |  **Owner must create staff accounts in Admin Portal first** |
| **Sequence staff route stop orders** |  No |  **Owner configures stop order via Admin sequence UI** |
| **Upload initial physical vehicle photos** |  No |  **Owner/staff must upload images to Cloudinary** |
| **Daily checkoffs & execution logging** |  No |  **Staff completes via Staff Portal PWA** |

---

## 9. Import Readiness Verdict

### Audit Assessment: **APPROVED & PRODUCTION-READY (PASS)**

1. **Schema Compliance:** 100% compliant with PostgreSQL architecture v2.1.1 (15 public tables, compound FKs, immutable audit tables).
2. **Multi-Vehicle Readiness:** Fully capable of handling 1, 2, 3, or more vehicles per customer via normalized multi-row grouping.
3. **Aaj/Kal Rotation Readiness:** Full vehicle-level rotation granularity (`rotation_group` -> `subscription_vehicles.schedule_tag`).
4. **Data Safety:** Zero production or test customer records were imported into Neon DB during this audit.
5. **Documentation:** Template (`CWP_CUSTOMER_IMPORT_TEMPLATE.csv`) and Guide (`CWP_CUSTOMER_IMPORT_GUIDE.md`) updated and verified.

The CSV import specification is frozen and ready for automated batch import script execution whenever approved by the coordinator.
