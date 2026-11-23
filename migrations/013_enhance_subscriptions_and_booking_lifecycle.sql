-- =========================================================================
-- CWP DATA APP - MIGRATION 013
-- Add Stopped Service Tracking & Frequency Quota to Subscriptions
-- =========================================================================

-- 1. Add stopped_at, stopped_reason, stopped_by, and frequency_quota to subscriptions
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS stopped_reason VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS stopped_by VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS frequency_quota VARCHAR(100) NULL;

-- 2. Indexes for fast status and stopped query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_stopped 
    ON public.subscriptions (status, stopped_at) 
    WHERE status = 'stopped';
