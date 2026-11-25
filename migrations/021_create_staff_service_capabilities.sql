-- =========================================================================
-- CWP DATA APP - MIGRATION 021
-- Module: Task 01.8 — Staff Service Capability & Work-Type Classification
--
-- Description:
-- Establishes a system-wide staff capability model distinguishing:
--   1. Primary Work Types: 'dcc_only', 'dcc_and_services', 'services_only'
--   2. Individual Canonical Service Capabilities (DCC, Car Wash, Solar, Interior & Exterior Detailing)
--
-- Rollback Strategy:
--   DROP TABLE IF EXISTS public.staff_service_capabilities;
--   ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS chk_staff_work_type;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS service_capabilities;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS work_type;
-- =========================================================================

-- 1. Add work_type and service_capabilities columns to public.staff
ALTER TABLE public.staff 
    ADD COLUMN IF NOT EXISTS work_type VARCHAR(30) NOT NULL DEFAULT 'dcc_only',
    ADD COLUMN IF NOT EXISTS service_capabilities JSONB NOT NULL DEFAULT '["daily_car_cleaning"]'::jsonb;

-- 2. Add CHECK constraint for valid work_type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_staff_work_type'
    ) THEN
        ALTER TABLE public.staff 
            ADD CONSTRAINT chk_staff_work_type 
            CHECK (work_type IN ('dcc_only', 'dcc_and_services', 'services_only'));
    END IF;
END $$;

-- 3. Create normalized relational table: staff_service_capabilities
CREATE TABLE IF NOT EXISTS public.staff_service_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    service_category_id VARCHAR(30) NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_staff_service_capability UNIQUE (staff_id, service_category_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_capabilities_staff ON public.staff_service_capabilities (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_capabilities_category ON public.staff_service_capabilities (service_category_id);
CREATE INDEX IF NOT EXISTS idx_staff_work_type ON public.staff (work_type);

-- 4. Safe Backfill Strategy:
-- Existing staff who have assigned non-DCC service jobs become dcc_and_services or services_only based on active assignments.
-- All other existing staff are safely backfilled as 'dcc_only' with ['daily_car_cleaning'].

DO $$
DECLARE
    r RECORD;
    v_cats TEXT[];
    v_has_dcc BOOLEAN;
    v_work_type VARCHAR(30);
BEGIN
    FOR r IN SELECT id FROM public.staff WHERE deleted_at IS NULL LOOP
        -- Check if staff has active non-DCC jobs
        SELECT array_agg(DISTINCT j.service_category_id) INTO v_cats
        FROM public.staff_assignments sa
        JOIN public.service_jobs j ON sa.job_id = j.id
        WHERE sa.staff_id = r.id AND sa.is_active = TRUE AND j.deleted_at IS NULL;

        -- Check if staff has active DCC assignments
        SELECT EXISTS(
            SELECT 1 FROM public.staff_assignments sa
            JOIN public.subscriptions s ON sa.subscription_id = s.id
            WHERE sa.staff_id = r.id AND sa.is_active = TRUE AND s.deleted_at IS NULL
        ) OR EXISTS (
            SELECT 1 FROM public.routes rt WHERE rt.assigned_staff_id = r.id AND rt.status = 'active'
        ) INTO v_has_dcc;

        IF v_cats IS NOT NULL AND array_length(v_cats, 1) > 0 THEN
            IF v_has_dcc THEN
                v_work_type := 'dcc_and_services';
                v_cats := array_append(v_cats, 'daily_car_cleaning');
            ELSE
                v_work_type := 'services_only';
            END IF;
            
            UPDATE public.staff 
            SET work_type = v_work_type,
                service_capabilities = to_jsonb(v_cats)
            WHERE id = r.id;

            -- Populate normalized table
            FOR i IN 1..array_length(v_cats, 1) LOOP
                INSERT INTO public.staff_service_capabilities (staff_id, service_category_id, is_enabled)
                VALUES (r.id, v_cats[i], TRUE)
                ON CONFLICT (staff_id, service_category_id) DO UPDATE SET is_enabled = TRUE;
            END LOOP;
        ELSE
            -- Default safe DCC-only backfill
            UPDATE public.staff
            SET work_type = 'dcc_only',
                service_capabilities = '["daily_car_cleaning"]'::jsonb
            WHERE id = r.id AND (work_type IS NULL OR work_type = 'dcc_only');

            INSERT INTO public.staff_service_capabilities (staff_id, service_category_id, is_enabled)
            VALUES (r.id, 'daily_car_cleaning', TRUE)
            ON CONFLICT (staff_id, service_category_id) DO UPDATE SET is_enabled = TRUE;
        END IF;
    END LOOP;
END $$;
