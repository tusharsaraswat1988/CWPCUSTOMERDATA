# CWP Detailers & Motors - Service Catalog Taxonomy, Sizing & Dispatch Workflow

## Overview
This document defines the canonical service taxonomy, job planning models, staff mobile navigation, and task reassignment workflows for CWP Detailers & Motors.

---

## 1. Five Core Service Categories

| Category Code | Display Name (English / Hindi) | Model / Nature | Target Entity |
| :--- | :--- | :--- | :--- |
| `daily_car_cleaning` | Daily Car Cleaning / दैनिक कार सफाई | Monthly Subscription (Recurring Route) | Vehicle (`5_seater` / `5_plus_seater`) |
| `car_washing` | Car Wash / कार वॉश | On-Demand Single or Subscription | Vehicle (`5_seater` / `5_plus_seater`) |
| `solar_cleaning` | Solar Panel Cleaning / सोलर पैनल सफाई | On-Demand Single or Subscription | Rooftop Solar Array (`panel_count`) |
| `interior_detailing` | Interior Detailing / इंटीरियर डिटेलिंग | Instance / Detailing Job | Vehicle (`5_seater` / `5_plus_seater`) |
| `exterior_detailing` | Exterior Detailing / एक्सटीरियर डिटेलिंग | Instance / Detailing Job | Vehicle (`5_seater` / `5_plus_seater`) |

---

## 2. Packages by Service Category

### 1. Daily Car Cleaning (`daily_car_cleaning`)
- **`DCC_EXT_30D`**: Exterior Chemical Cleaning (30 days including a weekly off and certain holidays).
- **`DCC_EXT_1WASH`**: Exterior Chemical Cleaning (30 days including weekly off & holidays) + **1 Carwash** in a month.
- **`DCC_EXT_2WASH`**: Exterior Chemical Cleaning (30 days including weekly off & holidays) + **2 Carwashes** in a month.

### 2. Car Wash (`car_washing`)
- **`WASH_SINGLE`**: Single Wash (One Time Wash) — high-pressure foam wash on-demand.
- **`WASH_SUB_4`**: Wash Subscription (includes 4 washes with a validity of 6 months).

### 3. Solar Panel Cleaning (`solar_cleaning`)
- **`SOLAR_SINGLE`**: One Time Solar Cleaning — single rooftop demineralized panel wash.
- **`SOLAR_SUB_6`**: 6 Month Subscription (1 cleaning each month — 6 frequencies).
- **`SOLAR_SUB_12`**: 12 Month Subscription (1 cleaning each month — 12 frequencies).
- **Solar Sizing Metric**: **`No. of Panels` (`panel_count`)**, calculated on a **Rs. per panel** basis. Staff knows the exact roof scope before heading to site.

### 4. Interior Detailing (`interior_detailing`)
- **`INT_DEEP_CLEAN`**: Interior Deep Cleaning (complete seat upholstery extraction, dashboard rejuvenation, steam sanitation).
- **`INT_ROOF_CLEAN`**: Roof Cleaning (headliner fabric dry extraction & stain removal).

### 5. Exterior Detailing (`exterior_detailing`)
- **`EXT_CERAMIC`**: Ceramic Coating (9H multi-year protective shield).
- **`EXT_GRAPHENE`**: Graphene Coating (advanced thermal and hydrophobic crystal matrix).
- **`EXT_WAXING`**: Car Waxing (deep gloss carnuba hand polish).
- **`EXT_GLASS_TRT`**: Hydrophobic Glass Treatment (rain repellent on all windshields & windows).

---

## 3. Vehicle Sizing Classification
Cars across Daily Cleaning, Car Wash, and Detailing are classified into:
1. **`5_seater` (5 Seater)**: Hatchback, Sedan, Compact SUV.
2. **`5_plus_seater` (5+ Seater)**: 7 Seater, Large SUV, MPV, Van.

---

## 4. Staff Mobile Navigation (Strictly 3 Tabs)

The mobile cleaner interface is streamlined into 3 bottom tabs:
1. **दैनिक सफाई (`Daily Car Clean`)**:
   - Monthly recurring doorstep vehicle route.
   - S.No route sequencing, alternate day rotation tags, and one-tap camera mark-done workflow.
2. **अन्य काम (`Other Jobs`)**:
   - Accommodates all instance-based jobs (Car Wash, Solar Panel Cleaning, Interior Detailing, Exterior Detailing).
   - Dedicated `No. of Panels` badge (`☀️ 24 Panels`) for solar jobs.
   - Vehicle sizing badge (`🚗 5 Seater` / `🚙 5+ Seater`) for vehicle tasks.
   - 3-step completion journey (Start Job with Before Photos → Complete Job with After Photos → WhatsApp Proof Share).
3. **सेटिंग्स (`Settings`)**:
   - Staff profile, language toggle (English / Hindi), auto-sync switch, audio chimes, and logout.

---

## 5. Job Reassignment Engine

When an assigned staff member is on leave or a route needs rebalancing, Admin can reassign any job:
1. In Admin **Special Jobs** table, click **`🔁 Reassign`**.
2. Select the new staff member from the active staff list (current staff is excluded).
3. Optionally enter a reason/note (e.g. `Cleaner on sick leave`).
4. On confirmation:
   - The database transaction deactivates the previous staff assignment (`is_active = FALSE`, `unassigned_at = CURRENT_TIMESTAMP`).
   - An active assignment record is inserted for the new staff.
   - Real-time audit log is committed with admin user and reason.
   - The staff version hash updates dynamically, triggering an **instant audio chime and toast notification** on the new cleaner's mobile device.
