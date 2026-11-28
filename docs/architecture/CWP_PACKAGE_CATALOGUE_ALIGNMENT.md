# CWP package catalogue architecture and customer edit alignment

## Scope and finding

The legacy Admin Customer edit flow and the Hybrid Package Engine are separate systems. The screenshots show the legacy `editCustCategory` / `editCustPkgType` controls in `public/js/app.js`. The category options and per-category package options are assembled as literal HTML in `openEditCustomerModal` and `handleEditCategoryChange`; they are not loaded from either the canonical service catalogue endpoint or the Hybrid catalogue.

For a customer already present in Neon, `updateCustomer` in `services/adminService.js` persists the normalized `interested_service` value and profile/vehicle/location fields. Before this alignment, the same generic update path could update or create a DCC subscription based on `packageType`, and update/create an on-demand job with a package label. It did not create a SEE purchase or Hybrid membership. The old dropdown therefore mixed profile editing with legacy provisioning behavior and could route a Hybrid label into DCC/job metadata. The existing-customer edit UI now marks service/package identity display-only and sends a profile-only update, so it cannot cause service or package records to be created, cancelled, or relabeled. Other explicit legacy workflows retain their behavior.

This alignment makes service and package identity display-only in the legacy editor. It preserves legacy labels and normalization for viewing while preventing a profile edit from causing assignment side effects. Server-side checks reject any Hybrid package id, code, or name routed through the legacy customer update path. Hybrid assignment remains unavailable from this legacy modal and must be performed through a future dedicated customer purchase action calling `POST /api/see/hybrid/purchases`.

## Catalogue and taxonomy inventory

| Domain | Catalogue/source | Assignment and lifecycle | Customer display |
| --- | --- | --- | --- |
| Standalone DCC | `services/serviceCatalog.js` contains legacy DCC package definitions; active DCC subscriptions live in `public.subscriptions`. | `services/dccService.js` and `subscriptionsRepo` create/manage DCC subscriptions. Daily cleaning jobs use DCC workflows. | `adminService` reads active subscription package name; customer/admin records may fall back to legacy labels such as `DCC ONLY`. |
| Standalone SEE / Car Wash | `services/seeCatalogueService.js` and SEE catalogue tables (`see_services`, package/add-on catalogue tables in migration 025); older package entitlements also use `public.customer_packages` from migration 017. | `seeEntitlementService` creates purchases/snapshots/ledger entries. Legacy `packageService` sells and tracks legacy package quantities. | Customer packages and SEE entitlement accounts/ledgers, according to the consuming screen/API. |
| Other standalone services | `serviceCatalog.SERVICE_CATEGORIES` includes solar, interior detailing, and exterior detailing and their legacy package definitions. They are service taxonomy entries; presence in this list alone does not prove a purchase or entitlement. | Booking/job and, where migrated, SEE service workflows. Solar/detailing legacy values can remain in customer profiles. | Customer profile interest and jobs/package records. |
| Hybrid | `public.hybrid_packages` from migration 028, versioned and separate from SEE/DCC catalogues. Admin V2 builder is `public/admin-v2/js/v2-hybrid-packages.js`. | `hybridPackageService.purchase` via `POST /api/see/hybrid/purchases`; persists `hybrid_memberships`, component rows/events and provisions DCC plus SEE through the orchestrator. Recovery/reconciliation use hybrid recovery services. | Hybrid membership snapshot/status and component linkage; not inferred from a legacy `package_name`. |

Taxonomy: **services** describe work that can be sold; **standalone packages** belong to DCC or SEE and provision only through that engine; **hybrid packages** are versioned hybrid catalogue entries and provision multiple components through orchestration. A hybrid package is never a generic DCC or SEE package.

## Source-of-truth map

1. Package creation: DCC legacy definitions in `serviceCatalog.js` / DCC admin workflows; SEE catalogue through `seeCatalogueService`; Hybrid through `hybridPackageService` and `hybrid_packages`.
2. Pricing: server-side catalogue/purchase services (SEE package records or Hybrid package `price`); legacy UI labels are not prices.
3. Assignment: DCC subscription APIs; SEE entitlement purchase APIs; Hybrid purchase orchestration only.
4. DCC subscription: `subscriptions` repository and `dccService`.
5. Car Wash credits: SEE entitlement accounts, purchase snapshots, and ledger; Hybrid provisioning creates SEE credits with a Hybrid membership reference.
6. Eligibility/validity: authoritative SEE/Hybrid services and catalogue records; Hybrid purchase validates customer, vehicle, location, date, city/zone, segment, active package, price and configuration.
7. Membership lifecycle: `hybrid_memberships`, membership components/events, and recovery/reconciliation. Standalone DCC/SEE lifecycles remain with their respective engines.
8. Admin package display: customer record projection, legacy `customer_packages`, subscriptions, SEE purchase/entitlement APIs, and Hybrid membership APIs. The legacy edit form was not displaying a hybrid membership.
9. Customer-facing display: the app's customer package/entitlement reads and record projection; verify each screen's backing API rather than treating `packageType` as proof of entitlement.
10. Staff dependencies: DCC route/job records and booking/service job category/package display fields. These are operational labels, not catalogue assignment authority.

The repository has legacy sheet/source metadata (`sourceSheetName`, `source_row_index`, and `sheetName` compatibility fields) and import/sync mapping. The existing-customer edit path inspected here updates Neon through `adminService`; it does not update a Google Sheet or use Sheets as the package catalogue source of truth.

## Safe behavior and remaining gaps

- Existing package labels, including unmapped legacy labels, continue to be loaded and preserved in the legacy edit form. The package field is now disabled and clearly described as display-only.
- The legacy customer editor still displays service interest and package label. Both are read-only in this form; profile-only saves preserve customer, vehicle, location, and existing staff-edit behavior without creating/cancelling/relabeling service/package records.
- Existing assignments and historical data are not migrated or rewritten.
- The Hybrid builder/catalogue and purchase orchestration exist, but the Customer Edit experience does not have a dedicated assignment workflow that selects a customer, vehicle, location and Hybrid package and submits the validated purchase request. Do not add Hybrid packages to the legacy dropdown.
- The customer edit projection does not currently include hybrid membership/component status, validity, and included components. Customer-management display needs a read-only Hybrid membership API/projection before that can be truthfully shown.
- Canonical service/SEE catalogues are available via `getServiceCatalog` / `getPackageCatalog`, but the legacy edit selector currently uses literal options. It is now display-only; catalogue-driven purchase selection should be implemented in each engine-specific purchase UI rather than restoring direct editing here.
- No production DB, migrations, deployment, push, or commit were used for this audit/change.
