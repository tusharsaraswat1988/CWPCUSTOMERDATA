# PHASE 1E.1 — DATA EXCEPTION & MANUAL REVIEW REPORT
**Application Target:** Standalone CWP Customer Data App (`CWPCUSTOMERDATA`)  
**Audit Scope:** Live Google Sheets Source Master (51 Data Rows)  
**Audit Date:** November 20, 2026  

---

## 1. Executive Summary

During the forensic audit of all 51 rows across Google Sheets, zero rows were found to be completely invalid or corrupted. Every single row possesses a valid 10-digit Indian mobile number and a customer name.

However, several operational patterns require explicit administrative awareness and documentation before executing Phase 1E data migration:

1. **Test Records in Production Sheet:** 5 rows in `Daily Clean` contain dummy test data (`Test Unassigned Cust`, phone `9876543210`).
2. **Missing Reference Photos:** 34 of 51 customer records (66.7%) do not currently have vehicle or site photos attached.
3. **Multi-Car Single-Cell Formatting:** 4 rows have two vehicle registration numbers concatenated in a single cell with `/` and Hindi rotation instructions.
4. **Duplicate Mobile Numbers:** 5 customer households occupy multiple rows.
5. **Secondary Location Ambiguity:** 2 rows have secondary address strings without explicit GPS coordinates or map links.

---

## 2. Detailed Exception Inventory

### 2.1. Test Records in Production Sheet (5 Rows)
The following 5 rows in `Daily Clean` represent test entries created during previous testing:

| Sheet Tab | Row Index | Customer Name | Phone Number | Vehicle | Assigned Staff | Recommendation |
|---|:---:|---|:---:|---|:---:|---|
| `Daily Clean` | Row 2 | Test Unassigned Cust | `9876543210` | `UP65 AB 9999` | Unassigned | Migrate with `customer_code = CUST_DC_R02_9876543210` |
| `Daily Clean` | Row 46 | Test Unassigned Cust | `9876543210` | `UP65 AB 9999` | Unassigned | Migrate with `customer_code = CUST_DC_R46_9876543210` |
| `Daily Clean` | Row 47 | Test Unassigned Cust | `9876543210` | `UP65 AB 9999` | Unassigned | Migrate with `customer_code = CUST_DC_R47_9876543210` |
| `Daily Clean` | Row 49 | Test Unassigned Cust | `9876543210` | `UP65 AB 9999` | Unassigned | Migrate with `customer_code = CUST_DC_R49_9876543210` |
| `Daily Clean` | Row 50 | Test Unassigned Cust | `9876543210` | `UP65 AB 9999` | Unassigned | Migrate with `customer_code = CUST_DC_R50_9876543210` |

*Administrative Impact:* Under Option B (Row-Preserving), these rows will be safely migrated as separate records to maintain exact row parity. Admins can easily soft-delete them in the Admin portal after cutover.

---

### 2.2. Concatenated Multi-Car Rows (4 Rows &rarr; 8 Physical Vehicles)
In these 4 rows, multiple vehicle plates were combined in a single cell:

| Row | Customer Name | Raw Vehicle Cell | Extracted Vehicle 1 | Extracted Vehicle 2 | Hindi Operational Instruction |
|:---:|---|---|---|---|---|
| **6** | `अपूर्व मित्तल` | `UP65FS2830 / UP65FB2304` | `UP65FS2830` | `UP65FB2304` | `एक दिन में एक ही गाड़ी की सफाई करनी है।` |
| **7** | `सिद्धार्थ सिंह बिसेन` | `UP65ER7585 / UP65FJ7585` | `UP65ER7585` | `UP65FJ7585` | `एक दिन में एक ही गाड़ी की सफाई करनी है।` |
| **10** | `रजत भैया` | `UP16BC7654/UP65AP5055` | `UP16BC7654` | `UP65AP5055` | `एक दिन में एक ही गाड़ी की सफाई करनी है।` |
| **14** | `अंकित अग्रवाल` | `UP65BB7820 / UP65EM7570` | `UP65BB7820` | `UP65EM7570` | `एक दिन में एक ही गाड़ी की सफाई करनी है।` |

*Automated Handling:* Parser cleanly splits them on `/`, creates 2 records in `vehicles`, 1 `subscriptions` record with `rotation_type = 'alternate_day_aaj_kal'`, and 2 junction rows in `subscription_vehicles` tagged `'aaj'` and `'kal'`.

---

### 2.3. Multi-Row Households with Shared Mobile Numbers (10 Rows)
The following 5 genuine customer households occupy 2 separate rows:

| Household Name | Normalized Mobile | Row A Details | Row B Details | Migration Action |
|---|:---:|---|---|---|
| **रितिका जैन** | `8687333335` | Row 4 (`UP65BY9985`) | Row 5 (`UP65DD0909`) | Migrates as 2 distinct customer codes (`...R04...`, `...R05...`) |
| **अमन जायसवाल** | `8299029887` | Row 21 (`UP65FH7698`) | Row 22 (`UP65EW4004`) | Migrates as 2 distinct customer codes (`...R21...`, `...R22...`) |
| **वैभव श्रीवास्तव**| `9838204066` | Row 23 (`UP65FR9699`) | Row 24 (`UP65CW0878`) | Migrates as 2 distinct customer codes (`...R23...`, `...R24...`) |
| **विवेक खन्ना** | `8400099996` | Row 26 (`XUV FD0220 B2`) | Row 27 (`Elevate 7501 B1`) | Migrates as 2 distinct customer codes (`...R26...`, `...R27...`) |
| **डॉ. अंबर** | `7607552265` | Row 36 (`UP65FJ3252`) | Row 37 (`UP65EQ0725`) | Migrates as 2 distinct customer codes (`...R36...`, `...R37...`) |

---

### 2.4. Secondary Locations Lacking GPS Links (2 Rows)
- **Row 7 (`सिद्धार्थ सिंह बिसेन`):** Secondary text is `'ऑफिस लोकेशन'`, but Col L (`Secondary Maps URL`) is blank.
  - *Action:* Primary GPS map link is used as fallback; secondary text stored in `service_locations.address_text`.
- **Row 19 (`आदित्य त्रिपाठी`):** Secondary text is `'Home'`, but Col L (`Secondary Maps URL`) is blank.
  - *Action:* Primary GPS map link is used as fallback.

---

### 2.5. Missing Photos (34 Records)
- 17 customer rows possess active reference photos on Google Drive or Cloudinary.
- 34 customer rows currently have empty photo URL cells.
- *Action:* Stored as `photo_url = NULL`. Does not block migration. Staff portal displays clean vehicle silhouette placeholder.

---

## 3. Administrative Review Verdict
Zero fatal blockers found. All exceptions are safely handled by the v2.1.1 schema and automated migration parser.
