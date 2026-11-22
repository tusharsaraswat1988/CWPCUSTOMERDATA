-- Migration 009: Add Car Not Present Tag to Service Logs and Booking Cancellation Support
-- R1: Daily Car Cleaning - "Car Not Present" Tag and Logging
-- R2: Other Service Bookings - Staff Cancellation with Reasons and Remarks

-- 1. Extend service_logs table with car_not_present and tag columns
ALTER TABLE public.service_logs 
    ADD COLUMN IF NOT EXISTS car_not_present BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tag VARCHAR(50) NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_service_logs_car_not_present 
    ON public.service_logs (car_not_present) WHERE car_not_present = TRUE;

CREATE INDEX IF NOT EXISTS idx_service_logs_tag 
    ON public.service_logs (tag) WHERE tag IS NOT NULL;

-- 2. Extend service_jobs table with staff cancellation columns
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS cancellation_remarks TEXT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_status_cancelled 
    ON public.service_jobs (status, cancelled_at) WHERE status = 'cancelled';
