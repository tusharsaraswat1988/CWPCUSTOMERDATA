# CWP Customer Data App — Customer Import Guide & Field Specification (v2.1)

This comprehensive guide accompanies `CWP_CUSTOMER_IMPORT_TEMPLATE.csv` for importing customer, location, vehicle, subscription, and job records into the Neon PostgreSQL database (`cwp_customer_db`) for the **CWP Customer Data App**.

---

## 1. File Specification

- **File Name:** `CWP_CUSTOMER_IMPORT_TEMPLATE.csv`
- **Compatibility:** Opens natively in Microsoft Excel, Google Sheets, LibreOffice Calc, or any RFC 4180 compliant CSV parser.
- **Character Encoding:** UTF-8 (Strict)
- **Field Separator:** Comma (`,`)
- **Text Enclosure:** Double quotes (`"..."`) required for fields containing commas, line breaks, or special characters.
- **Header Row:** Line 1 must contain exact column names as defined in Section 3.

---

## 2. Multi-Row Data Representation Architecture

In previous versions, flattened templates with fixed columns (`vehicle_1_*`, `vehicle_2_*`, `primary_address`, `secondary_address`) were limited to 2 vehicles and 2 addresses, failing for customers with 3 or more vehicles or addresses.

The updated template adopts a **multi-row hierarchical grouping strategy** keyed by `customer_code`:

### How Multi-Row Imports Work:
1. **Row 1 (Primary Customer Record):**
   - Populates all customer master fields (`customer_code`, `customer_name`, `phone`, `alt_phone`, `email`, `is_active`, `customer_notes`).
   - Declares the customer's primary location (`address_type = 'primary'`).
   - Declares the customer's first vehicle (`vehicle_registration`, `vehicle_model`, etc.).
   - Declares the subscription (`daily_car_cleaning`) or job (`car_washing` / `solar_cleaning`) details.
   - Sets the rotation details and initial staff assignment (`assigned_staff_code`).
2. **Rows 2, 3, ... N (Sibling Rows for Additional Vehicles / Locations):**
   - Carries the **exact same `customer_code`** to link back to the primary customer record.
   - Leaves customer master fields (`customer_name`, `phone`, `alt_phone`, `email`, `is_active`, `customer_notes`) **blank** (or identical).
   - Specifies the additional vehicle (`vehicle_registration`, `vehicle_model`, `rotation_group`, etc.).
   - Optionally specifies an additional or alternate location (e.g., `address_type = 'secondary'`, office address).
   - If `address_type` and `address_text` are blank on a sibling row, the vehicle is automatically tied to the customer's primary location.

### Transactional Processing Requirement
The import engine MUST process each `customer_code` grouping inside an isolated database transaction (`db.withTransaction`). If any constraint fails for a customer or their attached vehicles/locations, the entire customer group is rolled back with an explicit validation error.

---

## 3. Relational Foreign Key (FK) Chain

The Neon PostgreSQL schema (`cwp_customer_db`) enforces strict compound foreign keys and data provenance:

```
[customers] (customer_code UK)
   │
   ├── [service_locations] (customer_id FK, uq_locations_id_customer)
   │      │
   │      └── linked as default_location_id in [vehicles]
   │
   ├── [vehicles] (customer_id FK, uq_vehicles_id_customer)
   │      │
   │      └── linked via compound FK (vehicle_id, customer_id) in [subscription_vehicles]
   │
   ├── [subscriptions] (customer_id FK, service_category_id FK, uq_subscriptions_id_customer)
   │      │
   │      ├── [subscription_vehicles] (compound FKs to subscriptions, vehicles, service_locations)
   │      │      └── schedule_tag: 'daily' | 'aaj' | 'kal'
   │      │
   │      └── [staff_assignments] (subscription_id FK, staff_id FK, immutable audit trail)
   │
   └── [service_jobs] (customer_id FK, location_id FK, vehicle_id FK NULL for solar)
          │
          └── [staff_assignments] (job_id FK, staff_id FK, immutable audit trail)
```

### Compound Foreign Key Rules:
1. **Cross-Customer Isolation:** A subscription cannot cover a vehicle belonging to another customer (`fk_sub_veh_veh_cust` links `(vehicle_id, customer_id)`).
2. **Location Ownership:** A vehicle's default location or a subscription vehicle's service location must belong to that same customer (`fk_veh_location_same_customer` links `(default_location_id, customer_id)`).
3. **Active Assignment Singularity:** A subscription or on-demand job can have at most one active assigned staff member (`uq_active_sub_assignment`, `uq_active_job_assignment`).

---

## 4. Complete Field Definitions & Schema Mapping

| # | Column Header | Database Target Column | Data Type | Required | Allowed Values / Examples | Validation Rules & Notes |
|---|---------------|------------------------|-----------|----------|---------------------------|--------------------------|
| 1 | `customer_code` | `customers.customer_code` | VARCHAR(32) | **Yes** | `CUST001`, `CUST002` | Grouping key. Unique across customers; repeated on sibling rows for multi-vehicle customers. |
| 2 | `customer_name` | `customers.name` | VARCHAR(150) | **Yes (Row 1)** | `Vikram Malhotra` | Required on first row of customer group. Max 150 chars. |
| 3 | `phone` | `customers.phone` | VARCHAR(10) | **Yes (Row 1)** | `9876543210` | 10-digit Indian mobile starting with 6, 7, 8, or 9. **Duplicate phones are allowed** across different customer codes. |
| 4 | `alt_phone` | `customers.alt_phone` | VARCHAR(15) | No | `9812345678` | Optional secondary telephone/mobile. |
| 5 | `email` | `customers.email` | VARCHAR(150) | No | `vikram@example.com` | Optional email address. Must be valid format if present. |
| 6 | `is_active` | `customers.is_active` | BOOLEAN | **Yes (Row 1)** | `Yes`, `No`, `TRUE`, `FALSE` | Inactive customers will not appear in daily staff service routes. |
| 7 | `customer_notes` | `customers.notes` | TEXT | No | `Call 10 minutes prior` | General administrative instructions or customer preferences. |
| 8 | `address_type` | `service_locations.address_type` | VARCHAR(20) | **Yes (Row 1)** | `primary`, `secondary`, `office`, `other` | Location classification. Row 1 should be `primary`. |
| 9 | `address_text` | `service_locations.address_text` | TEXT | **Yes (Row 1)** | `"Villa 14, Royal Palm, Agra"` | Full doorstep address for field staff navigation. |
| 10 | `google_maps_url` | `service_locations.google_maps_url` | TEXT | No | `https://maps.google.com/?q=27.18,78.02` | Direct Google Maps pin link for staff portal navigation. |
| 11 | `latitude` | `service_locations.latitude` | NUMERIC(10,7) | No | `27.1800000` | Optional GPS latitude. Must be between -90 and 90. |
| 12 | `longitude` | `service_locations.longitude` | NUMERIC(10,7) | No | `78.0200000` | Optional GPS longitude. Must be between -180 and 180. |
| 13 | `parking_details` | `service_locations.parking_details` | VARCHAR(255) | No | `Front Covered Porch`, `Bay B12` | Specific spot instructions for staff finding the vehicle. |
| 14 | `vehicle_registration` | `vehicles.registration_no` | VARCHAR(20) | **Conditional** | `UP85AZ9999` | Required for `daily_car_cleaning` and `car_washing`. Leave blank for `solar_cleaning`. |
| 15 | `vehicle_model` | `vehicles.brand_or_model` | VARCHAR(100) | No | `Scorpio-N`, `Tiago`, `Creta` | Vehicle make and model brand name. |
| 16 | `vehicle_type` | `vehicles.vehicle_type` | VARCHAR(30) | No | `Car`, `SUV`, `Sedan`, `Hatchback`, `Bike` | Default is `Car` if left blank. |
| 17 | `vehicle_color` | *(Composite / Reference)* | VARCHAR(50) | No | `Black`, `White`, `Silver` | Visual vehicle color to assist staff identification. |
| 18 | `vehicle_photo_url` | `vehicles.photo_url` | TEXT | No | `https://res.cloudinary.com/...` | Valid HTTPS Cloudinary or CDN image URL. Leave blank if no photo. |
| 19 | `service_category` | `service_categories.id` | VARCHAR(30) | **Yes (Row 1)** | `daily_car_cleaning`, `car_washing`, `solar_cleaning` | Must match one of the 3 database category slugs. |
| 20 | `package_name` | `subscriptions.package_name` / `service_jobs.service_type` | VARCHAR(100) | **Yes (Row 1)** | `Daily Clean`, `Deep Wash & Polish`, `Quarterly Solar Clean` | Customer-facing package title. |
| 21 | `packages_purchased` | `subscriptions.packages_purchased` | INTEGER | No | `1`, `2`, `3` | Number of package units purchased. Default: `1`. |
| 22 | `rotation_type` | `subscriptions.rotation_type` | VARCHAR(30) | No | `none`, `aaj_kal`, `custom` | Subscription rotation type. Default is `none` (or `aaj_kal` if alternating). |
| 23 | `rotation_group` | `subscription_vehicles.schedule_tag` | VARCHAR(20) | **Conditional** | `daily`, `aaj`, `kal` | Required when `rotation_type = 'aaj_kal'`. Tags which rotation group this vehicle belongs to. |
| 24 | `rotation_notes` | `subscriptions.rotation_notes` | TEXT | No | `Scorpio on Aaj / Tiago on Kal` | Human-readable rotation explanation shown on staff portal cards. |
| 25 | `assigned_staff_code` | `staff_assignments.staff_id` via `staff.staff_code` | VARCHAR(20) | No | `STF01`, `STF02` | Pre-existing staff code. If empty, subscription/job remains unassigned. |
| 26 | `site_details` | `service_jobs.site_details` | TEXT / JSON | **Conditional** | `panel_count: 16, roof_type: RCC` | Required for `solar_cleaning` (e.g. panel count, roof mounting type). |

---

## 5. Enum Valid Values & Standards

### 5.1. `service_category`
The template requires exact category slugs matching `public.service_categories`:
- `daily_car_cleaning`: Recurring doorstep cleaning subscription. Creates records in `subscriptions` and `subscription_vehicles`.
- `car_washing`: On-demand single wash/polish job. Creates record in `service_jobs` with `vehicle_id`.
- `solar_cleaning`: On-demand rooftop solar panel cleaning job. Creates record in `service_jobs` with `site_details` JSON.

### 5.2. `rotation_type` and `rotation_group`
- **Subscription level (`rotation_type`):**
  - `none`: Standard daily service for all vehicles.
  - `aaj_kal`: Alternating day cleaning schedule.
  - `custom`: Specialized recurring pattern (e.g. 3 days/week).
- **Vehicle level (`rotation_group` / `subscription_vehicles.schedule_tag`):**
  - `daily`: Serviced every operating day.
  - `aaj`: Serviced on "Aaj" rotation days.
  - `kal`: Serviced on "Kal" rotation days.

### 5.3. Phone Number Validation & Duplicate Policy
- All Indian mobile numbers must be exactly 10 digits starting with `6`, `7`, `8`, or `9`.
- **Duplicate Phone Rule:** Multiple distinct customers CAN share the same mobile number (e.g., family members sharing a phone, corporate contacts, or landlord/tenant). The database enforces uniqueness on `customer_code`, NOT on `phone`.

### 5.4. Photo URL Rules
- Must be a secure HTTPS link (e.g., Cloudinary: `https://res.cloudinary.com/cwp/...`) or left completely blank.
- Local disk paths (`C:\...` or `file:///...`) are strictly prohibited and will be rejected.

---

## 6. Worked Example: 3-Vehicle Household on Aaj/Kal Rotation

Customer **Vikram Malhotra** (`CUST001`) has 3 vehicles across 2 locations:
- Vehicle 1: Mahindra Scorpio-N (`UP85AZ9999`) parked at Villa 14 (Primary location), cleaned on **Aaj** days.
- Vehicle 2: Tata Tiago (`UP85BY1111`) parked at Office Bay 4 (Secondary location), cleaned on **Kal** days.
- Vehicle 3: Honda City (`UP85CZ3344`) parked at Villa 14 (Primary location), cleaned on **Aaj** days.
- Assigned Staff: `STF01`.

### Multi-Row CSV Representation:
```csv
customer_code,customer_name,phone,alt_phone,email,is_active,customer_notes,address_type,address_text,google_maps_url,latitude,longitude,parking_details,vehicle_registration,vehicle_model,vehicle_type,vehicle_color,vehicle_photo_url,service_category,package_name,packages_purchased,rotation_type,rotation_group,rotation_notes,assigned_staff_code,site_details
CUST001,Vikram Malhotra,9876543210,,vikram@example.com,Yes,Call 10 minutes prior,primary,"Villa 14, Royal Palm, Agra",https://maps.google.com/?q=27.1800,78.0200,27.1800000,78.0200000,Front Covered Porch,UP85AZ9999,Scorpio-N,SUV,Black,https://res.cloudinary.com/cwp/scorpio.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,aaj,Scorpio on Aaj / Tiago on Kal / City on Aaj,STF01,
CUST001,,,,,,secondary,"Office Block 3, Civil Lines, Agra",https://maps.google.com/?q=27.2000,78.0100,27.2000000,78.0100000,Reserved Bay 4,UP85BY1111,Tiago,Hatchback,White,https://res.cloudinary.com/cwp/tiago.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,kal,,STF01,
CUST001,,,,,,primary,"Villa 14, Royal Palm, Agra",https://maps.google.com/?q=27.1800,78.0200,27.1800000,78.0200000,Driveway Left,UP85CZ3344,City,Sedan,Silver,https://res.cloudinary.com/cwp/city.jpg,daily_car_cleaning,Daily Clean,1,aaj_kal,aaj,,STF01,
```

---

## 7. Operational Roles: Automated Import vs. Owner Manual Setup

| Operational Step | Handled by CSV Import Processor | Must Be Done Manually by Owner |
|---|:---:|:---:|
| Create customer account (`customers`) |  Automatic | — |
| Create service locations (`service_locations`) |  Automatic | — |
| Create vehicle records (`vehicles`) |  Automatic | — |
| Create subscriptions & link vehicles (`subscriptions`, `subscription_vehicles`) |  Automatic | — |
| Set vehicle rotation groups (`aaj` / `kal`) |  Automatic | — |
| Create on-demand jobs (`service_jobs`) |  Automatic | — |
| Assign staff to subscription or job |  Automatic (if `assigned_staff_code` valid) | — |
| **Register field staff members (`staff` & `staff_auth`)** |  No |  **Owner must create staff and PINs first in Admin Portal** |
| **Set route stop order (`staff_route_sequences`)** |  No |  **Owner arranges sequence order via Admin drag-and-drop** |
| **Upload vehicle photos to Cloudinary** |  No |  **Owner must take and upload photos to get Cloudinary URLs** |
| **Field execution & checkoff logging** |  No |  **Staff marks completion in Staff Portal** |

---

## 8. Summary Checklist Before Running Import

1. [ ] Field staff records (e.g. `STF01`, `STF02`) are already registered in the system.
2. [ ] Every row has a valid `customer_code`.
3. [ ] All mobile numbers are valid 10-digit Indian numbers (`6xxx`, `7xxx`, `8xxx`, `9xxx`).
4. [ ] All `service_category` values use valid slugs: `daily_car_cleaning`, `car_washing`, or `solar_cleaning`.
5. [ ] Multi-vehicle rows correctly reuse the same `customer_code` with individual `rotation_group` tags.
6. [ ] Solar cleaning rows contain `site_details` and leave vehicle fields blank.
7. [ ] All photo URLs are valid HTTPS links or left blank.
