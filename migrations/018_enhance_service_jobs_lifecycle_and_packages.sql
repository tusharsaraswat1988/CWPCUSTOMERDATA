-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 018_enhance_service_jobs_lifecycle_and_packages.sql
-- Module: Service Booking & Job Lifecycle Subsystem
-- Target Database: cwp_customer_db (Neon PostgreSQL)
-- Target Entity: public.service_jobs
-- Invariants:
--   1. Booking a job does NOT deduct package entitlement.
--   2. Completion of a package-linked job deducts entitlement exactly once.
--   3. Cancellation or failure does NOT consume entitlement.
--   4. Service booking status, execution status, and payment status are separated.
-- Safety: Pure DDL definition. Idempotent. Zero production data modifications.
-- =========================================================================

BEGIN;

-- 1. Extend service_jobs status column length to support full lifecycle states
-- Supported lifecycle states: 'requested', 'booked', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'unable_to_complete'
ALTER TABLE public.service_jobs 
    ALTER COLUMN status TYPE VARCHAR(30);

-- 2. Add Package & Entitlement Linkage Columns
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS package_id UUID NULL 
        REFERENCES public.customer_packages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS entitlement_consumed BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add Financial & Payment State Columns
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS service_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('paid', 'unpaid', 'pending', 'package_covered', 'partial', 'waived'));

-- 4. Add Inability-to-Complete / Failure Auditing Columns
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS failure_remarks TEXT NULL,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS failed_by VARCHAR(100) NULL;

-- 5. Add Booking Attribution Source
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS booking_source VARCHAR(50) NOT NULL DEFAULT 'admin'
        CHECK (booking_source IN ('admin', 'customer_request', 'verbal', 'call_center', 'app'));

-- 6. Performance & Audit Indexes
CREATE INDEX IF NOT EXISTS idx_service_jobs_package_id 
    ON public.service_jobs (package_id) 
    WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_customer_status 
    ON public.service_jobs (customer_id, status) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_payment_status 
    ON public.service_jobs (payment_status);

CREATE INDEX IF NOT EXISTS idx_service_jobs_scheduled_date_status
    ON public.service_jobs (scheduled_date, status)
    WHERE deleted_at IS NULL;

-- 7. Audit & Exact-Once Redemption Safety
CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_redemption_service_job 
    ON public.package_redemption_logs (service_job_id) 
    WHERE service_job_id IS NOT NULL;

COMMIT;
