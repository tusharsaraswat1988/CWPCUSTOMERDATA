# CWP Authentication Compatibility, Apps Script Security & Production QA Guide (TASK P2.1)

## 1. Authentication Architecture

The CWP system operates across two distinct deployment models:
- **Environment A (Railway / Node.js)**: Hosts the single-page application (`Index.html`) and Node.js proxy server (`server.js`).
- **Environment B (Google Apps Script)**: Google Apps Script Web App (`Code.gs`) bound to the master Google Sheets spreadsheet.

### Session Architecture
- **Admin Sessions**: Tokens issued as `adm_<64-hex>` with a strict **12-hour TTL** (`SESSION_TTL_MS = 12 * 60 * 60 * 1000`).
- **Staff Sessions**: Tokens issued as `stf_<64-hex>` bound strictly to `staffId` with a **12-hour TTL**.
- **Transport Security**:
  - Tokens are strictly extracted from `Authorization: Bearer <token>` headers or secure JSON POST bodies.
  - Query parameter tokens (`?token=...`) are explicitly rejected on all endpoints to prevent token leakage in server logs, proxy histories, and browser histories.
- **Revocation**:
  - Explicit logout immediately revokes the active token on both Node.js (`revokeAdminSession`, `revokeStaffSession`) and Apps Script (`revokeAdminSessionGas_`, `revokeStaffSessionGas_`).
  - Modifying staff credentials (PIN reset), staff deactivation, or staff deletion immediately revokes all active sessions for that `staffId`.

---

## 2. Trusted Server-to-Server Authentication (Railway ↔ Apps Script)

To eliminate session mismatches between Node.js in-memory sessions and Apps Script script property sessions:
- Node.js performs user-level authorization checks before forwarding requests.
- When forwarding trusted requests (`forwardToGoogleAppsScript`), Node.js injects a shared service credential (`APPS_SCRIPT_SERVICE_KEY` / `CWP_SERVICE_KEY`) into the request body.
- Google Apps Script validates `serviceKey` against its Script Properties (`SERVICE_KEY`).
- If `serviceKey` is valid, Apps Script executes the operation on behalf of the authorized backend request.
- The service key is strictly server-to-server: **never transmitted to browsers, never rendered in HTML, and never logged**.
- If `serviceKey` is invalid or missing when required, Apps Script fails closed with HTTP 401 Unauthorized.

---

## 3. Google Apps Script Direct-Call Protection

In Google Apps Script, any global function not ending in `_` is callable from client-side via `google.script.run.<function>()`.

### Gateway Hardening
1. **Single Public Gateway**: Exposed `apiRequest(action, payload)` as the sole operational entry point.
2. **Private Operational Functions**: Moved all data reading/writing functions to private names ending in `_`:
   - `saveCustomer_`, `updateCustomer_`, `getAllCustomersForAdmin_`, `toggleCustomerActive_`
   - `saveStaffMember_`, `deleteStaffMember_`, `toggleStaffActive_`, `resetStaffPin_`
   - `getStaffCustomerData_`, `getStaffList_`, `cleanAndSyncStaff_`
3. **Empty-Token Bypass Elimination**: In `getStaffCustomerData_()`, session authentication is mandatory. Requests with missing, empty, or invalid tokens are immediately rejected.
4. **Identity Enforcement**: When authenticated via a staff session, client-supplied `staffId` parameters are discarded; the session-bound identity is strictly enforced to prevent cross-staff data access.

---

## 4. PIN Hashing & Migration Strategy

### Hashing Algorithms
- **Node.js (Railway)**: Upgraded to `crypto.scrypt` with random 16-byte cryptographic salts (`scrypt:<salt>:<hash>`) using recommended parameters (`N=16384, r=8, p=1, keylen=32`).
- **Google Apps Script**: Uses salted SHA-256 (`sha256:<salt>:<hash>`) compatible with native `Utilities.computeDigest`.
- **Constant-Time Verification**: Uses `crypto.timingSafeEqual` in Node.js to eliminate timing side-channel attacks.

### Migration Path
- Existing `sha256:` hashes and legacy plaintext PINs remain fully functional on login.
- Upon successful authentication in Node.js, credentials are automatically rehashed and upgraded to `scrypt:` format in storage.
- Storage format is self-describing via prefix (`scrypt:`, `sha256:`).

### Staff PIN Synchronization
- The Staff sheet tab displays `[PROTECTED]` in the PIN column to avoid spreadsheet leaks.
- Node.js `mergeStaffList()` and Apps Script `cleanAndSyncStaff_()` explicitly recognize `[PROTECTED]` and blank PINs, ensuring they **never overwrite existing valid hashes**.
- Default PIN assignment (`123456`) has been completely removed. New staff creation strictly requires an explicit 6-digit PIN.

### Rate Limiting
- Failed staff login attempts are rate-limited by `clientIp + staffId`.
- 5 consecutive failed attempts trigger a 5-minute cooldown returning HTTP 429.
- Permanent account lockouts are avoided to ensure field staff can resume operations after cooldown.

---

## 5. Admin Password Security

- Plaintext admin password persistence in `local_data.json` has been eliminated.
- Primary source of truth: `ADMIN_PASSWORD` environment variable.
- Persistent fallback: `adminPasswordHash` (scrypt hash) stored in `local_data.json`.
- When updating admin password:
  1. Authenticates admin session.
  2. Forwards update to Google Apps Script with `serviceKey`.
  3. Only when Google Apps Script update succeeds is the local `adminPasswordHash` updated with a fresh `scrypt` hash.
  4. If Google Apps Script fails, the request fails closed with HTTP 502 and no local modification occurs.

---

## 6. Required Environment Configuration

### Railway Environment Variables
| Variable | Description | Example / Note |
|---|---|---|
| `PORT` | Listening port for Node server | `3000` (auto-set by Railway) |
| `ADMIN_PASSWORD` | Master Admin password | Minimum 12+ characters, high entropy |
| `APPS_SCRIPT_URL` | Apps Script Web App deployment URL | `https://script.google.com/macros/s/.../exec` |
| `APPS_SCRIPT_SERVICE_KEY` | Shared secret for server-to-server auth | Minimum 32-character random string |
| `SPREADSHEET_ID` | Master Google Sheet ID | `1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY` |
| `RAILWAY_PUBLIC_DOMAIN` | Production custom domain | `cwpdata.up.railway.app` |
| `CLOUDINARY_URL` | Cloudinary CDN connection string | `cloudinary://api_key:api_secret@cloud_name` |

### Google Apps Script Script Properties
| Property | Description | Example / Note |
|---|---|---|
| `SERVICE_KEY` | Shared secret matching `APPS_SCRIPT_SERVICE_KEY` | Must match Railway `APPS_SCRIPT_SERVICE_KEY` |
| `CWP_ADMIN_PASSWORD` | Fallback admin password for direct GAS mode | Same as Railway `ADMIN_PASSWORD` |
| `STAFF_LIST` | JSON array containing staff credentials and active flags | Managed automatically by backend |
| `ADMIN_SESSIONS` | Active Admin session token map | Managed automatically by backend |
| `STAFF_SESSIONS` | Active Staff session token map | Managed automatically by backend |

---

## 7. Automated Test Execution Instructions

Automated tests are 100% isolated and never touch production sheets or `local_data.json`.

```bash
# Run the complete test suite
npm test
```

This command runs:
1. `tests/test_hardening_qa.js`: 20 security, data integrity, and architectural tests:
   - Unauthorized Admin API access rejected (HTTP 401)
   - Unauthorized Staff data access blocked & query string tokens rejected
   - Public staff list sanitization (zero PIN or phone leakage)
   - Admin password verification & 12-hour server session issuance
   - Staff PIN verification & legacy SHA-256 to scrypt auto-upgrade
   - Strict cross-staff data isolation
   - Category classification against production logic (all 3 categories & edge cases)
   - Multiple vehicles & Daily Clean source row order strict preservation
   - Cross-sheet row corruption guard
   - PIN sync protection ([PROTECTED] & blank PIN never corrupt hash)
   - Default PIN assignment removed (creation without PIN fails)
   - Plaintext admin password storage strictly eliminated
   - Trusted server-to-server authentication via service credential
   - Staff PIN reset revoking old sessions & granting new login
   - Inactive staff login rejected & active toggle revoking access
   - Explicit session revocation on logout
   - Failed login rate limiting (HTTP 429 cooldown)
   - Real `local_data.json` immutability verification
   - Google Apps Script direct function bypass closed (private `_` functions & `apiRequest` gateway)
   - Google Apps Script empty/missing token & invalid service key rejected
2. `tests/test_photo_crop_rotation.js`: 34 UI, cropper, and rotation functional tests.

---

## 8. Deployment Steps Requiring Human Approval

> [!IMPORTANT]
> The following steps MUST NOT be executed automatically and require explicit operator approval:

1. **Google Apps Script Web App Deployment**:
   - Open Apps Script Editor.
   - Deploy as Web App (`Execute as: Me`, `Who has access: Anyone`).
   - Copy new Web App Executable URL.
2. **Google Apps Script Script Properties Setup**:
   - In Project Settings -> Script Properties:
     - Add `SERVICE_KEY` with a strong 32+ character random secret (e.g. generated via `crypto.randomBytes(32).toString('hex')`).
     - Set `CWP_ADMIN_PASSWORD` matching your chosen production admin password.
3. **Railway Environment Variable Setup**:
   - In Railway dashboard:
     - Set `APPS_SCRIPT_SERVICE_KEY` to the exact value of `SERVICE_KEY`.
     - Update `APPS_SCRIPT_URL` if a new deployment URL was created.
     - Ensure `ADMIN_PASSWORD` is configured.
4. **Trigger Deployment**:
   - Merge approved PR into `main` to trigger Railway automated build and redeployment.
