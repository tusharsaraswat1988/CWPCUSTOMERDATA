# PHASE 1E.1 — SOURCE-TO-TARGET SCHEMA MIGRATION MAPPING
**Application Target:** Standalone CWP Customer Data App (`CWPCUSTOMERDATA`)  
**Target Database:** Isolated Neon PostgreSQL (`cwp_customer_db`)  
**Target Schema Specification:** v2.1.1  
**Source Master:** Google Spreadsheet `1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY` + `local_data.json`

---

## 1. Global Transformation Rules & Principles

1. **Row-Preserving Identity (Option B):** Every row in `Daily Clean` (49 rows) and `All Other Work` (2 rows) migrates to a separate `customers` record with a unique `customer_code`.
2. **Indian Mobile Normalization:** All phone numbers are stripped of non-digits, country codes (`+91`), and leading `0`. Validated against `^[6-9]\d{9}$`.
3. **Compound Foreign Key Integrity:** All vehicles and service locations linked to a subscription or customer must have matching `customer_id`.
4. **Credential Security:** Plaintext PINs and passwords are never migrated or stored. Credentials migrate directly from `local_data.json` salted `scrypt` hashes.
5. **No LocalStorage Checkoff Import:** Client-side `localStorage` checkoffs are omitted from `service_logs` due to missing verifiable server timestamps.

---

## 2. Table-by-Table Mapping Specifications

### 2.1. `service_categories`
- **Source:** Static domain configuration.
- **Records Seeded (3):**
  - `'daily_car_cleaning'` &rarr; `Daily Car Cleaning`
  - `'car_washing'` &rarr; `Car Washing`
  - `'solar_cleaning'` &rarr; `Solar Panel Cleaning`

---

### 2.2. `customers`
- **Source:** `Daily Clean` (Cols A, B, M) and `All Other Work` (Cols A, B, K).
- **Column Mapping:**
  | Target Column | Source Column / Expression | Transformation Rule |
  |---|---|---|
  | `id` | `gen_random_uuid()` | Automatically generated UUID v4 |
  | `customer_code` | Derived | `CUST_<DC|AOW>_R<ROW_INDEX>_<NORMALIZED_PHONE>` |
  | `name` | Col A (`Customer Name`) | Trim whitespace; retain Hindi/English script |
  | `phone` | Col B (`Customer Number`) | Normalized 10 digits; non-unique |
  | `alt_phone` | `NULL` | Stored as `NULL` during initial import |
  | `email` | `NULL` | Stored as `NULL` |
  | `notes` | `Daily Clean` Col J / `AOW` Col J | Retain customer operational notes |
  | `source_sheet_name`| Sheet Tab Name | `'Daily Clean'` or `'All Other Work'` |
  | `source_row_index`| Sheet Row Index | Integer row index (e.g. `4`, `5`, `21`) |
  | `is_active` | Col M (`Daily Clean`) / Col K (`AOW`) | `'Yes'` &rarr; `TRUE`, `'No'` &rarr; `FALSE` |
  | `created_at` | `CURRENT_TIMESTAMP` | Initial import timestamp |
  | `updated_at` | `CURRENT_TIMESTAMP` | Initial import timestamp |
  | `deleted_at` | `NULL` | All migrated rows are non-deleted |

---

### 2.3. `service_locations`
- **Source:** `Daily Clean` (Cols C, E, K, L) and `All Other Work` (Cols C, E).
- **Logic:** Each row generates 1 primary location. If Col K (`Secondary Address`) is non-empty, a second location row is created.
- **Column Mapping:**
  | Target Column | Primary Location Source | Secondary Location Source | Transformation Rule |
  |---|---|---|---|
  | `customer_id` | `customers.id` | `customers.id` | References parent customer |
  | `address_type` | `'primary'` | `'secondary'` | Discriminator |
  | `address_text` | Col E (`Address`) | Col K (`Secondary Address`) | Trim text |
  | `google_maps_url`| Col C (`Google Maps URL`)| Col L (`Secondary Maps URL`)| Direct HTTPS link |
  | `latitude` | Regex parsed from Col C | Regex parsed from Col L | Regex `!3d<lat>` or `@<lat>` |
  | `longitude` | Regex parsed from Col C | Regex parsed from Col L | Regex `!4d<lng>` or `,<lng>` |
  | `parking_details` | Extracted from Col F / J | Extracted from Col K / J | e.g. `B2`, `B1`, `Pillar 14` |
  | `is_primary` | `TRUE` | `FALSE` | Primary flag |
  | `is_active` | `TRUE` | `TRUE` | Active flag |

---

### 2.4. `vehicles`
- **Source:** `Daily Clean` Col F, D and `All Other Work` Col G, D.
- **Logic:** If vehicle string contains `/` (e.g. `UP65FS2830 / UP65FB2304`), parser splits string into 2 distinct vehicle records.
- **Column Mapping:**
  | Target Column | Source Column / Expression | Transformation Rule |
  |---|---|---|
  | `customer_id` | `customers.id` | References parent customer |
  | `default_location_id`| `service_locations.id` | FK referencing primary location of same customer |
  | `registration_no`| Col F / G parsed | Regex `\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{4})\b` |
  | `brand_or_model` | Col F / G remainder | Make/Model (e.g. `Creta`, `Amaze`, `Elevate`) |
  | `vehicle_type` | Inferred | `'Car'`, `'SUV'`, `'Hatchback'` |
  | `photo_url` | Col D (`Photo URL`) | HTTPS link from Cloudinary / Google Drive |
  | `photo_storage_key`| Extracted | Cloudinary `public_id` if present |
  | `is_active` | `TRUE` | Active flag |

---

### 2.5. `staff`
- **Source:** `local_data.json` (`staffList`).
- **Records Migrated (2):**
  1. `STF01` &rarr; `Chandan Soni` (`7054007733`)
  2. `STF02` &rarr; `Gaurav Kr Gupta` (`8081913264`)

---

### 2.6. `staff_auth`
- **Source:** `local_data.json` (`staffList.pin`).
- **Logic:** Preserves existing salted `scrypt` hashes directly.
  - `STF01`: Salt `269b7f57b792507f83288f4136ccdffc`, Hash `deb9d7d0bf569904357928c59eff8606243583abb8da485c7743cce203d285ff`
  - `STF02`: Salt `ee64fd5847429f9247539351b83b82c7`, Hash `89bcab29dbdedc1f4764059f5e1611e37061c8453aee96da7a48f8c68f901d0a`

---

### 2.7. `subscriptions`
- **Source:** `Daily Clean` rows (49 rows).
- **Column Mapping:**
  | Target Column | Source Column / Expression | Transformation Rule |
  |---|---|---|
  | `customer_id` | `customers.id` | References parent customer |
  | `service_category_id`| `'daily_car_cleaning'` | Category slug |
  | `package_name` | Col G (`Package Type`) | e.g. `'Daily Clean'`, `'DCC ONLY'` |
  | `packages_purchased`| Col H (`Packages Purchased`)| Parsed integer (Default `1`) |
  | `rotation_type`| Col J (`Staff Notes`) | If Hindi note mentions `एक दिन`, `'alternate_day_aaj_kal'` |
  | `rotation_notes`| Col J (`Staff Notes`) | Preserves original Hindi rotation instructions |
  | `status` | Col M (`Active`) | `'Yes'` &rarr; `'active'`, `'No'` &rarr; `'paused'` |

---

### 2.8. `subscription_vehicles`
- **Source:** Junction linking `subscriptions` to `vehicles`.
- **Logic:**
  - If single vehicle &rarr; 1 junction row with `schedule_tag = 'daily'`.
  - If dual vehicle alternate rotation &rarr; 2 junction rows with `schedule_tag = 'aaj'` and `'kal'`.
  - Enforces compound foreign keys: `(subscription_id, customer_id)`, `(vehicle_id, customer_id)`.

---

### 2.9. `service_jobs`
- **Source:** `All Other Work` rows (2 rows).
- **Column Mapping:**
  - Row 2: Customer `CUST_AOW_R02_...`, Category `'car_washing'`, Vehicle linked, Location linked.
  - Row 3: Customer `CUST_AOW_R03_...`, Category `'car_washing'`, Vehicle linked, Location linked.

---

### 2.10. `staff_assignments`
- **Source:** Col I (`Staff Name`).
- **Logic:**
  - Sourced by matching staff name to `staff.name`.
  - If matched &rarr; Inserts `staff_assignments` with `is_active = TRUE`, `assigned_by = 'migration_import'`.
  - If `'Unassigned'` &rarr; No active assignment row created (placed in dispatch pool).

---

### 2.11. `staff_route_sequences`
- **Source:** `local_data.json` (`staffSequences`) with source row index fallback.
- **Logic:**
  - Sourced from existing sequence order in `staffSequences`.
  - Links to `subscription_id` and `sequence_order`.

---

### 2.12. `service_logs`
- **Source:** None.
- **Records Migrated:** **0 records.** LocalStorage checkoffs are excluded from migration.

---

### 2.13. `admin_users`
- **Source:** Initial administrative account.
- **Records Created (1):**
  - Username: `admin` (or `8707488250`)
  - Password Hash: `scrypt` hash of `ADMIN_PASSWORD` from `.env`
  - Role: `'superadmin'`

---

### 2.14. `auth_sessions`
- **Source:** None. Sessions are created dynamically upon user authentication.
- **Records Migrated:** **0 records.**

---

### 2.15. `audit_logs`
- **Source:** Migration baseline entry.
- **Records Created (1):** Baseline migration snapshot recording total migrated row counts and schema version `001`.
