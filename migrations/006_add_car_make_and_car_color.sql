-- =========================================================================
-- CWP DATA APP - MIGRATION 006
-- Add Car Make and Car Color non-mandatory fields to customers and vehicles
-- =========================================================================

-- 1. Add non-mandatory car_make and car_color to customers table
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS car_make VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS car_color VARCHAR(50) NULL;

-- 2. Add non-mandatory car_make and car_color to vehicles table
ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS car_make VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS car_color VARCHAR(50) NULL;

-- 3. Indexes for fast search and lookup by make and color
CREATE INDEX IF NOT EXISTS idx_customers_car_make ON public.customers (car_make) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_car_color ON public.customers (car_color) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_car_make ON public.vehicles (car_make) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_car_color ON public.vehicles (car_color) WHERE deleted_at IS NULL;
