-- =========================================================================
-- CWP DATA APP - MIGRATION 003
-- Add Leads capture, status tracking, and lead notes support
-- =========================================================================

-- 1. Customers table leads columns
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lead_status VARCHAR(30) NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS lead_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS interested_service VARCHAR(50) NULL DEFAULT 'Daily Car Cleaning';

-- 2. Indexes for fast retrieval of leads vs active customers
CREATE INDEX IF NOT EXISTS idx_customers_is_lead ON public.customers (is_lead) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_lead_status ON public.customers (lead_status) WHERE is_lead = TRUE AND deleted_at IS NULL;
