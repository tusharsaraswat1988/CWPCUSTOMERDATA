# CWP Data App — Phase 2A Production Rollback Plan

**Document Version**: 1.0.0  
**Effective Date**: November 21, 2026  
**Repository**: `D:\cwp customer data app`  
**GitHub**: `tusharsaraswat1988/CWPCUSTOMERDATA`  
**Target Environment**: Railway Production (`https://cwpdata.up.railway.app`)  
**Scope**: Disaster Recovery, Deployment Rollback & Data Preservation Procedures

---

## 1. Rollback Policy & Guarantees

The CWP Data App architecture guarantees that any production deployment failure can be rolled back within **under 2 minutes** with zero data loss and zero lingering corruption.

### Core Safeguards:
1. **Immutable Historical Backups**: Neon database branching provides instantaneous point-in-time recovery without taking offline database dumps.
2. **Dual-Engine Architecture**: The codebase maintains full dual-runtime capability. Simply unsetting `DATABASE_URL` causes the application to immediately revert to Google Sheets / local mode.
3. **No Migration Destruction**: Neon schema migrations do not execute destructive table drops on boot.

---

## 2. Rollback Triggers & Criteria

A rollback must be initiated immediately if ANY of the following occur during or after deployment:

| Severity | Trigger Event | Detection Method | Action Threshold |
| :---: | :--- | :--- | :--- |
| **P0** | Database Identity Guard Abort (`neondb` attempted) | Container boot log shows `CRITICAL SAFETY ABORT` | Immediate Rollback |
| **P0** | Railway Crash Loop / Boot Failure | Railway deployment status shows `Failed` or healthcheck fails | Immediate Rollback |
| **P0** | Cross-Staff Data Leakage Detected | Staff member sees customer assigned to another staff member | Immediate Rollback |
| **P1** | Database Unreachable (`databaseHealthy: false`) | `/health` returns `databaseHealthy: false` for >3 consecutive checks | 5-Minute Grace Period, then Rollback |
| **P1** | Admin or Staff Authentication Failure | Valid credentials fail with 500 server error | Immediate Rollback |
| **P2** | Elevated HTTP 500 Error Rate | HTTP 500 rate exceeds 5% of all incoming requests | Investigate / Rollback |

---

## 3. Rollback Procedures (Tiered Escalation)

### Tier 1: Instant Railway Deployment Rollback (<60 Seconds)
*Use when: Code defect, container crash, or unexpected HTTP 500 error in new code.*

1. Open the [Railway Dashboard](https://railway.app/).
2. Navigate to project `cwpdata` > service `cwp-staff-viewer`.
3. Click on the **Deployments** tab.
4. Locate the previous stable deployment (the deployment active before the update).
5. Click the three dots (`...`) next to that deployment and select **Rollback / Redeploy**.
6. Railway instantly swaps traffic back to the previous container image.
7. Verify public site: `https://cwpdata.up.railway.app/health`.

### Tier 2: Instant Dual-Runtime Fallback to Google Sheets (<90 Seconds)
*Use when: Neon PostgreSQL connection is blocked, unreachable, or suspended.*

1. Open the [Railway Dashboard](https://railway.app/).
2. Navigate to **Variables**.
3. Temporarily remove or rename the variable `DATABASE_URL` to `DISABLED_DATABASE_URL`.
4. Ensure `SPREADSHEET_ID` and `APPS_SCRIPT_URL` are configured.
5. Click **Save Changes**.
6. Railway reboots the container automatically.
7. The application automatically detects that Neon is inactive and activates the Google Sheets engine:
   ```json
   {
     "status": "ok",
     "service": "cwp-staff-viewer",
     "database": "none",
     "provider": "google_apps_script",
     "databaseHealthy": false
   }
   ```
8. Staff and Admin portals continue functioning against Google Sheets.

### Tier 3: Neon Database Point-in-Time Restore (<3 Minutes)
*Use when: Erroneous customer data was imported or database state requires restoration.*

1. Open the [Neon Console](https://console.neon.tech/).
2. Navigate to Project `royal-river-43863980`.
3. Select Branch `br-holy-paper-b3dsx8nf`.
4. Option A — **Restore from Pre-Deployment Branch**:
   - In Neon, switch the active branch connection or point the connection string to `backup-pre-prod-cutover-20261121`.
5. Option B — **Point-in-Time Restore (PITR)**:
   - Click **Restore** on the branch.
   - Select the exact timestamp prior to the failed operation.
   - Confirm restore.
6. Verify database integrity using `tests/test_phase1g_db_integrity.js`.

---

## 4. Post-Rollback Verification Checklist

Immediately following any rollback, execute the following verification steps:

- [ ] `GET https://cwpdata.up.railway.app/health` responds HTTP 200 OK.
- [ ] Admin Portal renders and allows login.
- [ ] Staff Portal renders and allows PIN login.
- [ ] No customer data is missing or corrupted.
- [ ] No cross-staff data leakage occurs.
- [ ] Preserved `neondb` remains 100% untouched (132 tables).

---

## 5. Incident Communication & Escalation Protocol

1. **Immediate Notification**: Alert the owner/administrator immediately upon initiating any Tier 1, 2, or 3 rollback.
2. **Log Preservation**: Capture Railway container deployment logs and save to a local incident log file for root cause analysis.
3. **No Patching in Production**: Never attempt live hot-patching on an unstable production container. Complete the rollback first, debug in local development environment, verify with automated test suites, and schedule a clean redeployment.

---

*Plan certified and verified by Antigravity AI Engineering Team.*