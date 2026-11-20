# PHASE 1E.1 — GOOGLE SHEETS FORENSIC DATA AUDIT
**Spreadsheet Title:** CWP Staff Information Viewer Sheet Template  
**Spreadsheet ID:** `1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY`  
**Audit Mode:** Strictly Read-Only Live CSV Export  
**Audit Date:** November 20, 2026  
**Audit Artifact Cache:** `fixtures/audit_report_cache.json`

---

## 1. Source Sheets & Column Layout Inventory

The CWP operations spreadsheet consists of two authoritative master tabs:

### Tab 1: `Daily Clean` (Recurring Daily Doorstep Cleaning)
- **Sheet GID:** `508927146`
- **Total Data Rows:** **49 rows** (Rows 2 to 50)
- **Column Count:** 13 Columns
- **Header Specification:**
  | Col | Header Name | Expected Content | Normalization Alias |
  |:---:|---|---|---|
  | **A** | `Customer Name` | Primary contact name | `customername`, `custname` |
  | **B** | `Customer Number` | 10-digit mobile number | `customernumber`, `phone` |
  | **C** | `Google Maps URL` | Navigation link or Plus Code | `googlemapsurl`, `maps` |
  | **D** | `Customer / Vehicle Photo URL` | Drive / Cloudinary image link | `customervehiclephotourl` |
  | **E** | `Address` | Primary society, flat, landmark | `address` |
  | **F** | `Vehicle Number(s) / Model(s)` | Single or dual vehicle registrations | `vehiclenumbersmodels` |
  | **G** | `Package Type` | Package tier (`Daily Clean`, `DCC ONLY`) | `packagetype` |
  | **H** | `Packages Purchased` | Number of packages purchased (Default: `1`)| `packagespurchased` |
  | **I** | `Staff Name` | Assigned operator name | `staffname` |
  | **J** | `Staff Notes / Cleaning Instructions` | Alternate day rotation, key instructions | `staffnotescleaninginstructions` |
  | **K** | `Secondary Address (if any)` | Basement level, pillar number, office | `secondaryaddressifany` |
  | **L** | `Secondary Maps URL` | Alternate navigation link | `secondarymapsurl` |
  | **M** | `Active` | Status (`Yes` / `No`) | `active`, `status` |

### Tab 2: `All Other Work` (On-Demand Car Washing & Solar Cleaning)
- **Sheet GID:** `866987332`
- **Total Data Rows:** **2 rows** (Rows 2 and 3)
- **Column Count:** 11 Columns
- **Header Specification:**
  | Col | Header Name | Expected Content | Normalization Alias |
  |:---:|---|---|---|
  | **A** | `Customer Name` | Customer name | `customername` |
  | **B** | `Customer Number` | 10-digit mobile number | `customernumber` |
  | **C** | `Google Maps URL` | Navigation link | `googlemapsurl` |
  | **D** | `Vehicle / Site Photo URL` | Image link | `vehiclesitephotourl` |
  | **E** | `Address` | Service address | `address` |
  | **F** | `Service Type (Car Wash / Solar Cleaning)` | Service classification | `servicetypecarwashsolarcleaning` |
  | **G** | `Vehicle Number / Site Name` | Vehicle plate or solar site name | `vehiclenumbersitename` |
  | **H** | `Package / Service Details` | Work scope | `packageservicedetails` |
  | **I** | `Staff Name` | Assigned operator | `staffname` |
  | **J** | `Staff Notes / Special Instructions` | Safety and operational notes | `staffnotesspecialinstructions` |
  | **K** | `Active` | Status (`Yes` / `No`) | `active` |

---

## 2. High-Level Data Summary Statistics

| Forensic Metric | Daily Clean | All Other Work | Combined Total |
|---|:---:|:---:|:---:|
| **Total Source Rows** | 49 | 2 | **51** |
| **Valid Customer Records** | 49 | 2 | **51 (100%)** |
| **Blank Rows** | 0 | 0 | **0** |
| **Malformed Phone Rows** | 0 | 0 | **0** |
| **Active Records (`Yes`)** | 49 | 2 | **51 (100%)** |
| **Inactive Records (`No`)** | 0 | 0 | **0** |
| **Unique Mobile Numbers** | 39 | 2 | **41** |
| **Duplicate Mobile Groups** | 6 | 0 | **6** |
| **Multi-Vehicle Rows in Single Cell** | 4 | 0 | **4** |
| **Multi-Location Rows (Secondary Address)** | 2 | 0 | **2** |
| **Alternate-Day Hindi Rotation Rows** | 5 | 0 | **5** |
| **Records with Reference Photos** | 17 | 0 | **17 (33.3%)** |
| **Records Missing Photos** | 32 | 2 | **34 (66.7%)** |

---

## 3. Deep-Dive Forensic Findings

### 3.1. Duplicate Mobile Phone Groups (6 Groups — 16 Total Rows)
Under **Option B (Row-Preserving)**, every row migrates as a distinct customer record with a unique `customer_code`.

1. **Ritika Jain (`8687333335`):**
   - Row 4: Vehicle `UP65BY9985` &rarr; `CUST_DC_R04_8687333335`
   - Row 5: Vehicle `UP65DD0909` &rarr; `CUST_DC_R05_8687333335`
2. **Aman Jaiswal (`8299029887`):**
   - Row 21: Vehicle `UP65FH7698` &rarr; `CUST_DC_R21_8299029887`
   - Row 22: Vehicle `UP65EW4004` &rarr; `CUST_DC_R22_8299029887`
3. **Vaibhav Srivastava (`9838204066`):**
   - Row 23: Vehicle `UP65FR9699` &rarr; `CUST_DC_R23_9838204066`
   - Row 24: Vehicle `UP65CW0878` &rarr; `CUST_DC_R24_9838204066`
4. **Vivek Khanna (`8400099996`):**
   - Row 26: Vehicle `Xuv - FD0220 ( Black ) B2` &rarr; `CUST_DC_R26_8400099996`
   - Row 27: Vehicle `Elevate - 7501 ( White ) B1` &rarr; `CUST_DC_R27_8400099996`
5. **Dr. Amber (`7607552265`):**
   - Row 36: Vehicle `UP65FJ3252` &rarr; `CUST_DC_R36_7607552265`
   - Row 37: Vehicle `UP65EQ0725` &rarr; `CUST_DC_R37_7607552265`
6. **Test Unassigned Customer (`9876543210`):**
   - Rows 2, 46, 47, 49, 50 (5 separate test entries in Google Sheet).

### 3.2. Multi-Vehicle Single-Cell Rotations (4 Rows &rarr; 8 Physical Vehicles)
In 4 customer rows, two distinct vehicles were entered in a single cell separated by `/`:
- **Row 6 (`अपूर्व मित्तल`):** `UP65FS2830 / UP65FB2304` &rarr; 2 vehicles (`UP65FS2830` and `UP65FB2304`).
- **Row 7 (`सिद्धार्थ सिंह बिसेन`):** `UP65ER7585 / UP65FJ7585` &rarr; 2 vehicles (`UP65ER7585` and `UP65FJ7585`).
- **Row 10 (`रजत भैया`):** `UP16BC7654/UP65AP5055` &rarr; 2 vehicles (`UP16BC7654` and `UP65AP5055`).
- **Row 14 (`अंकित अग्रवाल`):** `UP65BB7820 / UP65EM7570` &rarr; 2 vehicles (`UP65BB7820` and `UP65EM7570`).

Each of these rows represents 1 subscription with `packages_purchased = 1`, `rotation_type = 'alternate_day_aaj_kal'`, and schedule tags `aaj` and `kal` in `subscription_vehicles`.

### 3.3. Multi-Location Customers (2 Rows &rarr; 4 Service Locations)
- **Row 7 (`सिद्धार्थ सिंह बिसेन`):** Primary Location: Society address. Secondary Location: `'ऑफिस लोकेशन'` (Office).
- **Row 19 (`आदित्य त्रिपाठी`):** Primary Location: Society address. Secondary Location: `'Home'`.

### 3.4. Staff Allocation Breakdown
- **Chandan Soni (`STF01`):** **28 assigned customer rows** (all in `Daily Clean`).
- **Gaurav Kr Gupta (`STF02`):** **16 assigned customer rows** (14 in `Daily Clean`, 2 in `All Other Work`).
- **Unassigned Queue:** **7 customer rows** (all in `Daily Clean`, including test rows).

---

## 4. Customer Provenance & Code Convention

Every source row receives a deterministic, immutable `customer_code`:
```
Format: CUST_<SHEET_CODE>_R<ROW_INDEX>_<NORMALIZED_PHONE>
Example: CUST_DC_R04_8687333335 (Daily Clean, Row 4, Phone 8687333335)
Example: CUST_AOW_R02_9876543299 (All Other Work, Row 2, Phone 9876543299)
```

This guarantees:
- Exact 1:1 row identity matching against Google Sheets.
- 100% collision-free primary customer codes.
- Complete auditability for customer service personnel.
