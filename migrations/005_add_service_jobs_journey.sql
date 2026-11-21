-- =========================================================================
-- CWP DATA APP - MIGRATION 005: Add Service Jobs Completion Journey
-- Adds before/after photos, started_at, completed_at, completion_notes
-- and relaxes chk_job_target for flexible on-demand tasks
-- =========================================================================

-- 1. Add journey tracking columns to service_jobs
ALTER TABLE public.service_jobs 
    ADD COLUMN IF NOT EXISTS before_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS after_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS completion_notes TEXT NULL;

-- 2. Relax chk_job_target so flexible on-demand car wash & solar jobs can be created
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS chk_job_target;
ALTER TABLE public.service_jobs ADD CONSTRAINT chk_job_target CHECK (
    service_category_id IN ('daily_car_cleaning', 'car_washing', 'solar_cleaning')
);

-- 3. Create indexes for quick staff and status lookups
CREATE INDEX IF NOT EXISTS idx_service_jobs_status_date ON public.service_jobs (status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_service_jobs_cust_active ON public.service_jobs (customer_id) WHERE deleted_at IS NULL;
