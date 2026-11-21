-- =========================================================================
-- CWP DATA APP - MIGRATION 002
-- Add Hindi transliteration columns for Customer Name and Address
-- =========================================================================

-- 1. Customers table Hindi name and addresses
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS name_hi VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS address_hi TEXT NULL,
    ADD COLUMN IF NOT EXISTS secondary_address_hi TEXT NULL;

-- 2. Service Locations table Hindi address text
ALTER TABLE public.service_locations
    ADD COLUMN IF NOT EXISTS address_text_hi TEXT NULL;

-- 3. Indexes for fast lookup if needed
CREATE INDEX IF NOT EXISTS idx_customers_name_hi ON public.customers (name_hi) WHERE deleted_at IS NULL;
