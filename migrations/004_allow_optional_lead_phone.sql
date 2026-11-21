-- =========================================================================
-- CWP DATA APP - MIGRATION 004
-- Allow optional phone numbers for leads and prospective inquiries
-- =========================================================================

ALTER TABLE public.customers
    ALTER COLUMN phone DROP NOT NULL;
