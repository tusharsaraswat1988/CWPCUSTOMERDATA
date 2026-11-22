-- =========================================================================
-- MIGRATION 011: Realtime Staff Location Tracking, Stoppages, Pings & Phase 2 Punch Coordinates
-- =========================================================================

-- 1. Granular location history / breadcrumbs
CREATE TABLE IF NOT EXISTS public.staff_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2) NULL,
    altitude NUMERIC(8, 2) NULL,
    speed NUMERIC(8, 2) NULL,
    heading NUMERIC(6, 2) NULL,
    battery_level NUMERIC(5, 2) NULL,
    is_charging BOOLEAN NULL,
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'heartbeat', -- 'heartbeat', 'ping_response', 'punch_in', 'manual'
    captured_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_loc_staff_captured ON public.staff_locations (staff_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_loc_captured ON public.staff_locations (captured_at);

-- 2. Fast O(1) state lookup for active staff tracking
CREATE TABLE IF NOT EXISTS public.staff_tracking_current (
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    last_latitude NUMERIC(10, 7) NOT NULL,
    last_longitude NUMERIC(10, 7) NOT NULL,
    last_accuracy NUMERIC(8, 2) NULL,
    last_speed NUMERIC(8, 2) NULL,
    last_heading NUMERIC(6, 2) NULL,
    battery_level NUMERIC(5, 2) NULL,
    is_charging BOOLEAN NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    current_status VARCHAR(30) NOT NULL DEFAULT 'moving', -- 'moving', 'stopped', 'idle'
    today_distance_meters NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,
    current_stoppage_id UUID NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Stoppages and dwell time tracking
CREATE TABLE IF NOT EXISTS public.staff_stoppages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    address_text TEXT NULL,
    matched_customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    arrived_at TIMESTAMPTZ NOT NULL,
    departed_at TIMESTAMPTZ NULL,
    dwell_minutes NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    stoppage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_stop_staff_date ON public.staff_stoppages (staff_id, stoppage_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_stop_active ON public.staff_stoppages (staff_id, is_active) WHERE is_active = TRUE;

-- 4. On-demand location ping request queue
CREATE TABLE IF NOT EXISTS public.staff_location_pings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    requested_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'acknowledged', 'completed', 'expired'
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    accuracy NUMERIC(8, 2) NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_pings_staff_status ON public.staff_location_pings (staff_id, status) WHERE status = 'pending';

-- 5. Pre-align public.service_logs for Phase 2 Car Cleaning Punch Coordinates
ALTER TABLE public.service_logs 
    ADD COLUMN IF NOT EXISTS punch_latitude NUMERIC(10, 7) NULL,
    ADD COLUMN IF NOT EXISTS punch_longitude NUMERIC(10, 7) NULL,
    ADD COLUMN IF NOT EXISTS punch_accuracy_meters NUMERIC(8, 2) NULL,
    ADD COLUMN IF NOT EXISTS punch_distance_meters NUMERIC(10, 2) NULL,
    ADD COLUMN IF NOT EXISTS punch_verified BOOLEAN NULL,
    ADD COLUMN IF NOT EXISTS punch_verification_status VARCHAR(30) NULL DEFAULT 'pending', -- 'verified', 'out_of_range', 'no_customer_coords', 'unverified'
    ADD COLUMN IF NOT EXISTS punch_metadata JSONB NULL;
