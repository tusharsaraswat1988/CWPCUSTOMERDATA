# CWP SEE-01 API Contract (`services/seeApiRouter.js`)

All endpoints are mounted under `/api/see/*` in `server.js` using Bearer token authentication (`resolveAdminSession` / `resolveStaffSession`).

## 1. Service Catalogue
- `GET /api/see/services?status=&categoryId=&serviceModel=&includeRetired=&limit=50&offset=0` — Public/Authenticated list.
- `GET /api/see/services/:idOrCode` — Service detail with marketing tags, media, and applicable add-ons.
- `POST /api/see/services` — **[Admin]** Create service (`serviceCode`, `name`, `serviceCategoryId`, `serviceModel`, `status`, etc.).
- `PATCH /api/see/services/:id` — **[Admin]** Update service (creates new `service_versions` snapshot).
- `POST /api/see/services/:id/status` — **[Admin]** Transition status (`draft` | `active` | `retired`).

## 2. Frequencies & Blackouts
- `GET /api/see/frequencies` — List active normalized frequencies.
- `POST /api/see/frequencies` — **[Admin]** Create frequency.
- `POST /api/see/frequencies/preview` — **[Admin/Staff]** Preview generated occurrence dates.
- `POST /api/see/blackouts` — **[Admin]** Add holiday/closure blackout date.

## 3. Packages & Pricing
- `GET /api/see/packages?status=&mainServiceId=&vehicleSegment=&limit=50&offset=0` — List packages.
- `GET /api/see/packages/:idOrCode` — Package detail with benefits, add-ons, pricing rules, tags, and media.
- `POST /api/see/packages` — **[Admin]** Create package with benefits, add-ons, and pricing rules.
- `PATCH /api/see/packages/:id` — **[Admin]** Update package (increments version; does not mutate past `purchase_snapshots`).
- `POST /api/see/packages/:idOrCode/price` — Calculate dynamic price for `{ city, zone, vehicleSegment, quantity, effectiveDate }`.

## 4. Add-ons, Marketing Tags & Media
- `GET /api/see/addons` / `POST /api/see/addons` **[Admin]** / `PATCH /api/see/addons/:id` **[Admin]**
- `GET /api/see/marketing-tags` / `POST /api/see/marketing-tags` **[Admin]** / `POST /api/see/marketing-tags/attach` **[Admin]**
- `POST /api/see/media` — **[Admin]** Register media metadata (`square_1_1` 1:1 or `rectangle_4_3` 4:3 validated).

## 5. Staff Types & Capability Overrides
- `GET /api/see/staff-types` **[Admin]** / `POST /api/see/staff-types` **[Admin]**
- `POST /api/see/staff/:staffId/staff-type` — **[Admin]** Assign staff type (preserves existing assigned jobs).
- `POST /api/see/staff/:staffId/capability-override` — **[Admin]** Grant/revoke audited override (`reason` required).
- `POST /api/see/staff/eligibility` — **[Admin]** Evaluate staff assignment eligibility.

## 6. Purchases & Entitlement Ledger
- `POST /api/see/purchases` — **[Admin]** Create immutable `purchase_snapshot` + initialize `entitlement_accounts` & `entitlement_ledger`.
- `GET /api/see/customers/:customerId/balance` — **[Admin]** Get customer entitlement accounts and snapshots.
- `GET /api/see/entitlements/:accountId/ledger` — **[Admin]** Paginated immutable ledger entries.
- `POST /api/see/entitlements/:accountId/(adjust|refund|expire)` — **[Admin Only]** Mutate entitlement with `idempotencyKey` and `reason`. Staff requests return `401`.

## 7. Jobs, Executions & Solar Verification
- `POST /api/see/jobs` — **[Admin]** Create canonical job (reserves entitlement if linked, never consumes).
- `POST /api/see/jobs/:jobId/assign` — **[Admin]** Assign/reassign with server-side eligibility check.
- `GET /api/see/jobs/:jobId/staff-contract` — **[Staff/Admin]** Staff-safe job contract (no financial/admin fields).
- `POST /api/see/jobs/:jobId/start` — **[Staff/Admin]** Start execution.
- `POST /api/see/jobs/:jobId/complete` — **[Staff/Admin]** Complete execution; enforces checklist, proof, and add-on completion; consumes entitlement idempotently.
- `POST /api/see/jobs/:jobId/terminate` — **[Staff/Admin]** Mark `cancelled`, `failed`, or `no_show` and release reservation.
- `POST /api/see/jobs/:jobId/addons/:jobAddonId/complete` — **[Staff/Admin]** Complete job add-on.
- `POST /api/see/jobs/:jobId/solar-verify` — **[Staff/Admin]** Record `actualPanelCount` and compute discrepancy.
- `POST /api/see/jobs/:jobId/solar-approve` — **[Admin Only]** Approve/reject solar discrepancy and set `finalServicedQuantity`.

## 8. Admin Reports
- `GET /api/see/reports/entitlements` — **[Admin]** Aggregated entitlement balances by kind and status.
- `GET /api/see/reports/solar-discrepancies` — **[Admin]** Solar jobs with panel count discrepancies.
