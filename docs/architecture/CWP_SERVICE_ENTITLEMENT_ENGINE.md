# CWP Service & Entitlement Engine (SEE-01) — Architecture

## 1. Overview
The CWP Service & Entitlement Engine (SEE) replaces legacy hardcoded service definitions (`services/serviceCatalog.js`, `services/packageService.js`) with a configurable, database-driven architecture backed by Neon PostgreSQL.

## 2. Core Modules
- **Service Catalogue (`services/seeCatalogueService.js`)**: Canonical services (`services`, `service_versions`), configurable statuses (`draft`, `active`, `retired`), service models (`recurring`, `one_time`, `visit_credit`, `site_quantity`, `flexible_custom`), and execution/checklist/photo requirements.
- **Frequency & Recurrence Engine (`services/seeFrequencyService.js`)**: Timezone-aware (`Asia/Kolkata` and arbitrary IANA timezones) schedule generator supporting `one_time`, `daily`, `alternate_days`, `weekly`, `every_n_days`, `every_15_days`, `twice_per_month`, `monthly`, `every_n_months`, `specific_weekdays`, `specific_dates`, and `custom`, with blackout/holiday handling and missed-visit/carry-forward policies.
- **Package Engine (`services/seeCatalogueService.js`)**: Configurable packages with multi-benefit composition (`package_benefits`), included/optional add-ons (`package_addons`), vehicle segments (`vehicle_segments`), and rule-based pricing (`package_pricing_rules`: `fixed`, `vehicle_segment`, `per_unit`, `per_panel`, `pricing_bands`, `minimum_charge`, `custom`).
- **Add-on Engine (`services/seeCatalogueService.js`)**: Reusable independent add-ons with 5 execution modes (`per_main_service`, `during_main_service`, `separate_job`, `customer_redemption`, `scheduled_independently`).
- **Marketing & Media (`services/seeCatalogueService.js`)**: Configurable `marketing_tags` and `media_assets` metadata supporting `square_1_1` (1:1) and `rectangle_4_3` (4:3) slots.
- **Staff Type & Capability Engine (`services/seeStaffCapabilityService.js`)**: `staff_types` templates, server-side eligibility checks (active status, service/add-on capability, city/zone, equipment, workload `max_daily_jobs`), and audited `staff_capability_overrides`.
- **Purchase Snapshot & Entitlement Ledger (`services/seeEntitlementService.js`)**: Immutable `purchase_snapshots` (protected by DB trigger) and append-only `entitlement_ledger` + `entitlement_accounts` with `FOR UPDATE` locking and `idempotency_key` protection.
- **Job Execution & Solar Verification (`services/seeExecutionService.js`)**: Canonical `service_jobs` execution, backend proof/checklist/add-on enforcement, staff-safe contract stripping financial/admin data, and `solar_verifications` discrepancy approval workflow.

## 3. Key Business Rules & Invariants
1. **DCC Isolation**: DCC daily cleaning remains distinct from wash credits and periodic add-on entitlements.
2. **No Auto-Consumption on Assignment**: Job creation/assignment may reserve entitlement (`reserve`), never consume (`consume`). Consumption occurs idempotently on valid completion; cancellation/failure/no-show releases reservation.
3. **Immutable Sales**: Catalogue edits create new versions and affect future sales only; `purchase_snapshots` are immutable.
4. **Solar Estimate vs Verified**: Customer/capacity estimates (`is_estimate = true`) are never presented as verified panel counts; discrepancies trigger admin approval without allowing staff to alter sale pricing.
