-- =========================================================================
-- MIGRATION 023: Track Staff Phase 1 (Device & Location Reliability)
--                + Phase 4 (Operational Intelligence & Alerts)
-- Additive, backwards-compatible schema extension.
-- =========================================================================

-- 1. Extend public.staff_locations with reliability & idempotency metadata
ALTER TABLE public.staff_locations
    ADD COLUMN IF NOT EXISTS client_event_id VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS app_version VARCHAR(40) NULL,
    ADD COLUMN IF NOT EXISTS network_type VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS connectivity_status VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS permission_status VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS is_valid_fix BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS accuracy_tier VARCHAR(20) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_loc_client_event
    ON public.staff_locations (staff_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

-- 2. Extend public.staff_tracking_current with device health & freshness metadata
ALTER TABLE public.staff_tracking_current
    ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS previous_device_id VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS device_changed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS app_version VARCHAR(40) NULL,
    ADD COLUMN IF NOT EXISTS network_type VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS connectivity_status VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS permission_status VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS accuracy_tier VARCHAR(20) NULL;

-- 3. Operational intelligence events & persisted alerts
CREATE TABLE IF NOT EXISTS public.staff_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(160) NOT NULL,
    details TEXT NULL,
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    distance_meters NUMERIC(10, 2) NULL,
    accuracy_meters NUMERIC(8, 2) NULL,
    duration_minutes NUMERIC(8, 2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    acknowledged_at TIMESTAMPTZ NULL,
    acknowledged_by VARCHAR(100) NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ NULL,
    metadata JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_trk_events_date
    ON public.staff_tracking_events (event_date DESC, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_trk_events_active
    ON public.staff_tracking_events (staff_id, event_type, is_active)
    WHERE is_active = TRUE;
