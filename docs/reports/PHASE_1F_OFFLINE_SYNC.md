# PHASE 1F — OFFLINE SYNCHRONIZATION & CONFLICT HANDLING REPORT
**Target Database:** Neon PostgreSQL (`cwp_customer_db`)  
**Architecture Specification:** `docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md`  
**Execution Status:** COMPLETED & VERIFIED (43/43 PASS)

---

## 1. Executive Summary

Phase 5 implements a resilient, idempotent offline synchronization engine for field staff operations. The engine enables staff to tick off customer car cleanings and dispatched service jobs even while operating in basement parking basements or areas with intermittent mobile network coverage. Once network connectivity is restored, the queue is synchronized to Neon PostgreSQL without duplicate entries, data loss, or silent overwrites.

---

## 2. Technical Synchronization Architecture

### 2.1 Idempotency Protection (`client_mutation_id`)
- Every client checkoff event generates a unique client mutation UUID (`client_mutation_id`).
- When the client retries a sync request due to a network timeout, the server-side insert uses PostgreSQL's native conflict guard:
  ```sql
  INSERT INTO public.service_logs (
    client_mutation_id, staff_id, subscription_id, vehicle_id, job_id,
    service_date, status, completed_at_device, synced_at_server,
    notes, photo_url, source, device_metadata
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12)
  ON CONFLICT (client_mutation_id) DO NOTHING
  RETURNING *;
  ```
- If the mutation was already received, the database cleanly ignores the insertion and the engine returns `{ status: 'synced', idempotent: true }`, ensuring zero duplicate records or client-side retry failures.

### 2.2 Explicit Conflict Detection & Non-Destructive Resolution
- If an existing completion record already exists for `(subscription_id, vehicle_id, service_date)` (for daily cleaning) or `job_id` (for on-demand jobs):
  - **Matching Status:** If the existing status matches incoming status (e.g., `'completed'`), the mutation is acknowledged as successful.
  - **Status Mismatch (Conflict):** If an administrative override previously occurred (e.g., admin marked `'customer_unavailable'`, but staff subsequently checked in with `'completed'` and photo proof):
    - The server does not reject the sync or silently overwrite provenance notes.
    - Updates the existing log record with `status = 'completed'`, appends the staff explanation to `notes`, and marks `conflict_resolved = TRUE`.
    - Automatically creates a provenance record in `public.audit_logs` with `action = 'conflict_resolution'`, capturing the `before_state` and `after_state`.

### 2.3 Timezone-Aware Timestamps & Asia/Kolkata Interpretation
- The database enforces `CONSTRAINT chk_service_date_ist_match CHECK (service_date = (completed_at_device AT TIME ZONE 'Asia/Kolkata')::date)`.
- Eliminates UTC boundary drift issues that occur during early morning cleaning rounds (6:00 AM – 10:00 AM IST, which correspond to 00:30 – 04:30 UTC).

---

## 3. Test Verification Evidence

From `tests/test_phase1f_workflows_and_sync.js`:
- `Offline completion synced successfully`: First submission inserted cleanly into `service_logs`.
- `Duplicate mutation acknowledged idempotently without error`: Second submission with same `client_mutation_id` was acknowledged idempotently with 0 duplicate rows.
- `Conflict resolution handled cleanly`: Admin note preserved and updated to `'completed'` with `conflict_resolved = true`.
- `Conflict resolution recorded in immutable audit_logs`: Proved that conflict event was written to `audit_logs`.
- `Staff portal reflects same-day completion state`: Verified that staff data endpoint returns `completedToday = true` for the checked-off vehicle.

---

## 4. Verification Conclusion
The offline synchronization pipeline is verified, idempotent, conflict-safe, and fully compliant with the approved v2.1.1 database architecture.
