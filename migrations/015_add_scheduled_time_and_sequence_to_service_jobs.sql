-- =========================================================================
-- Migration 015: Add scheduled_time and sequence_order to service_jobs
-- Enables tentative arrival time / time slot and stop visit sequence for on-demand bookings
-- =========================================================================

ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS sequence_order INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_sequence_order 
    ON public.service_jobs (scheduled_date, sequence_order) 
    WHERE sequence_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_scheduled_time
    ON public.service_jobs (scheduled_date, scheduled_time)
    WHERE scheduled_time IS NOT NULL;
