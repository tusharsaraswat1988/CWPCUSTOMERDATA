# CWP Data App — Phase 2A Railway Deployment Runbook

**Document Version**: 1.0.0  
**Effective Date**: November 21, 2026  
**Repository**: `D:\cwp customer data app`  
**GitHub**: `tusharsaraswat1988/CWPCUSTOMERDATA`  
**Target Environment**: Railway Production (`https://cwpdata.up.railway.app`)  
**Target Database**: Neon PostgreSQL — `cwp_customer_db`  
**Deployment Type**: Zero-Downtime Rolling Update (Nixpacks / Node.js)

---

## 1. Overview & Deployment Strategy

This runbook provides the exact, step-by-step operational procedure for cutting over the CWP Data App to production on Railway.

### Key Deployment Characteristics:
- **Zero-Downtime Deployment**: Railway launches the new container, runs health checks against `/health` or `/healthz`, and switches traffic only after the health check returns HTTP 200.
- **Strict Database Guard**: The application will abort on boot if `DATABASE_URL` does not point to `cwp_customer_db`, ensuring `neondb` can never be accidentally accessed.
- **Dual Runtime Fallback**: If `DATABASE_URL` is unset or cleared, the application seamlessly reverts to Google Sheets fallback without code alterations.

---

## 2. Pre-Deployment Checklist

Before initiating deployment on Railway, verify every item:

- [ ] **Git Status Clean**: All local changes committed and pushed to `origin/main` on GitHub (`tusharsaraswat1988/CWPCUSTOMERDATA`).
- [ ] **Automated Test Suite Verified**: All 244 tests pass locally (`npm test` and `npm run test:neon`).
- [ ] **Database Identity Confirmed**: Target Neon database is `cwp_customer_db` (Project `royal-river-43863980`, Branch `br-holy-paper-b3dsx8nf`).
- [ ] **Neon Compute Active**: Neon database compute is online and responding.
- [ ] **Zero Residual Test Records**: Database verified clean (0 business records).
- [ ] **Main neondb Verified**: Confirmed 132 tables intact.
- [ ] **Credentials Staged**: Owner has production `ADMIN_PASSWORD` and Cloudinary credentials ready to paste into Railway.

---

## 3. Railway Environment Variables Configuration

Configure the following variables in the **Railway Dashboard** under `cwp-staff-viewer` > **Variables**:

### Mandatory Production Variables:
| Variable Name | Recommended Value | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production security headers and CORS restriction |
| `DATABASE_URL` | `postgresql://.../cwp_customer_db?sslmode=require` | Pooled connection string to Neon `cwp_customer_db` |
| `ADMIN_PASSWORD` | `<secure_owner_password>` | Master password for Admin Portal login |
| `DB_PROVIDER` | `neon_postgresql` | Identifies primary database provider in health telemetry |

### Optional / Feature Variables:
| Variable Name | Recommended Value | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL_UNPOOLED` | `postgresql://.../cwp_customer_db?sslmode=require` | Direct connection for migrations/admin tasks |
| `CLOUDINARY_URL` | `cloudinary://<api_key>:<api_secret>@<cloud_name>` | Vehicle photo CDN storage |
| `DISABLE_LIVE_SHEETS` | `true` | Disables Google Sheets background live polling |

*Security Warning: Never copy or paste database credentials or admin passwords into git commit messages, chat channels, or public documentation.*

---

## 4. Step-by-Step Production Deployment Procedure

### Step 1: Pre-Deployment Neon Snapshot (Backup)
Before making any production changes, create a point-in-time branch/snapshot of `cwp_customer_db`:
1. Open the [Neon Console](https://console.neon.tech/).
2. Select Project `royal-river-43863980`.
3. Select Branch `br-holy-paper-b3dsx8nf`.
4. Click **Create Branch from this branch** and name it `backup-pre-prod-cutover-20261121`.
5. Verify the backup branch exists.

### Step 2: Push Code to GitHub
Ensure the latest hardened code is pushed to GitHub:
```bash
git push origin main
```

### Step 3: Configure Environment Variables in Railway
1. Open the [Railway Dashboard](https://railway.app/).
2. Select the `cwpdata` project / `cwp-staff-viewer` service.
3. Navigate to the **Variables** tab.
4. Add or update:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = `<Neon cwp_customer_db pooled connection string>`
   - `ADMIN_PASSWORD` = `<Owner admin password>`
   - `DISABLE_LIVE_SHEETS` = `true`
5. Click **Save Changes**.

### Step 4: Configure Railway Health Check Path
1. In the Railway service settings, navigate to **Settings** > **Healthcheck**.
2. Set Healthcheck Path to: `/health` (or `/healthz`).
3. Set Healthcheck Timeout to: `15 seconds`.
4. Click **Save Changes**.

### Step 5: Trigger Deployment
1. Railway automatically initiates a new deployment upon saving variables or pushing to `main`.
2. Navigate to the **Deployments** tab.
3. Click on the active deployment to observe build and deploy logs.
4. Verify the build succeeds:
   ```
   ✔ Hardened Security & Functional Architecture Active
   ✔ Server Running on PORT: <port>
   ✔ Production Domain: https://cwpdata.up.railway.app
   ✔ Database: cwp_customer_db
   ```
5. Confirm Railway healthcheck passes and the deployment status changes to **Active**.

---

## 5. Post-Deployment Smoke Test Procedure

Execute the following smoke tests immediately upon successful deployment:

### Test 1: Public Health Check
Open in browser or terminal:
```bash
curl -i https://cwpdata.up.railway.app/health
```
**Expected Response**:
- HTTP 200 OK
- Headers contain: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`
- Body JSON:
  ```json
  {
    "status": "ok",
    "service": "cwp-staff-viewer",
    "database": "cwp_customer_db",
    "provider": "neon_postgresql",
    "databaseHealthy": true
  }
  ```

### Test 2: Admin Portal Gate
1. Navigate to `https://cwpdata.up.railway.app/`.
2. Verify Admin Login Modal is displayed.
3. Test invalid password → Verify HTTP 401 and descriptive error.
4. Enter correct `ADMIN_PASSWORD` → Verify Admin Dashboard renders with clean empty state.

### Test 3: Staff Portal Gate
1. Navigate to `https://cwpdata.up.railway.app/staff`.
2. Verify Staff Login Form is displayed (Phone + 6-digit PIN).
3. Test invalid PIN → Verify error message and lockout counter.

### Test 4: Database Safety Sanity Check
Confirm that `https://cwpdata.up.railway.app/health` strictly reports `database: "cwp_customer_db"`.

---

## 6. Initial Customer Data Import Procedure (Owner Manual Import)

Once the production deployment is verified healthy:

1. **Prepare CSV**:
   - Open [CWP_CUSTOMER_IMPORT_TEMPLATE.csv](file:///D:/cwp%20customer%20data%20app/docs/templates/CWP_CUSTOMER_IMPORT_TEMPLATE.csv).
   - Refer to [CWP_CUSTOMER_IMPORT_GUIDE.md](file:///D:/cwp%20customer%20data%20app/docs/templates/CWP_CUSTOMER_IMPORT_GUIDE.md) for field definitions.
   - Fill in the ~51 source customer records.
2. **Execute Data Import**:
   - The owner imports the customer records into `cwp_customer_db` via SQL/CSV import or through the Admin Portal customer creation interface.
3. **Verify Data in Portal**:
   - Admin logs into `https://cwpdata.up.railway.app/`.
   - Verify customer list displays all imported customers with accurate vehicle badges, locations, and Aaj/Kal rotation tags.
   - Staff member logs into `https://cwpdata.up.railway.app/staff`.
   - Verify assigned customer list, 1-tap calling, and navigation links.

---

## 7. Deployment Completion & Sign-Off

Upon successful execution of all smoke tests and customer data verification, the deployment is complete and operational.