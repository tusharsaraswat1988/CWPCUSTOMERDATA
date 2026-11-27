# CWP SEE-01 Legacy Service Mapping & Removal Plan

## 1. Legacy Hardcoded Inventory
| Legacy Location | Hardcoded Artifact | Canonical SEE Replacement |
| :--- | :--- | :--- |
| `services/serviceCatalog.js` | `SERVICE_CATEGORIES`, `SEATER_TYPES`, `SOLAR_UNIT_CONFIG` | `public.services`, `public.vehicle_segments` |
| `services/packageService.js` | Hardcoded package codes (`DCC_EXT_*`, `WASH_SINGLE_*`, `SOLAR_SUB_*`, `INT_*`, `EXT_*`) & pricing | `public.packages`, `public.package_benefits`, `public.package_pricing_rules` |
| `migrations/007_expand_services_other_jobs_and_reassignment.sql` | `chk_job_target` (`service_category_id IN (...)`) | Dropped in `025_create_see_engine_schema.sql`; replaced by FK to `public.service_categories(id)` |
| `server.js` (`getServiceCatalog`, `getPackageCatalog`) | Static in-memory catalog returns | Switched to DB-driven `seeCatalogueService` when Neon is active (with local test fallback) |

## 2. Canonical Service ID Mapping (`public.legacy_service_mapping`)
| Legacy Category ID | Canonical `service_code` | Service Model |
| :--- | :--- | :--- |
| `daily_car_cleaning` | `DCC_DAILY` | `recurring` |
| `car_washing` | `CAR_WASH` | `visit_credit` |
| `solar_cleaning` | `SOLAR_CLEAN` | `site_quantity` |
| `interior_detailing` | `INT_DETAILING` | `one_time` |
| `exterior_detailing` | `EXT_DETAILING` | `one_time` |

## 3. Data Preservation & Migration Rules
1. All existing `customers`, `subscriptions` (92 rows), `service_jobs` (321 rows), `staff_assignments`, `service_logs`, and financial records are preserved intact.
2. `service_jobs.service_id` and `service_jobs.service_name_snapshot` are backfilled from `public.services` matching `service_category_id`.
3. `services/serviceCatalog.js` and `services/packageService.js` local fallbacks remain strictly as temporary compatibility adapters for offline/test environments (`NODE_ENV === 'test'`). Removal condition: remove once all legacy unit tests migrate to `seeCatalogueService` and `/api/see/*`.
4. **Frontend references** (out of scope for SEE-01): `public/admin-v2/*` and `Index.html` still reference legacy action names (`getServiceCatalog`, `getPackageCatalog`). They will be migrated to `/api/see/*` in the approved Frontend phase.
