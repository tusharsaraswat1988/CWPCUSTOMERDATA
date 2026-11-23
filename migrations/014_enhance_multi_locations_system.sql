-- =========================================================================
-- Migration 014: Enhance Multi-Location System for Customers
-- Adds location_name, coordinates verification, and index support
-- =========================================================================

-- 1. Add location_name column if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'service_locations' 
          AND column_name = 'location_name'
    ) THEN
        ALTER TABLE public.service_locations 
        ADD COLUMN location_name VARCHAR(120);
    END IF;
END $$;

-- 2. Backfill existing location_name from address_type where null
UPDATE public.service_locations 
SET location_name = CASE 
    WHEN LOWER(address_type) = 'primary' THEN 'Home'
    WHEN LOWER(address_type) = 'secondary' THEN 'Office / 2nd Address'
    WHEN address_type IS NOT NULL AND TRIM(address_type) != '' THEN INITCAP(TRIM(address_type))
    ELSE 'Primary Location'
END
WHERE location_name IS NULL;

-- 3. Add index on customer_id and is_primary for multi-location performance
CREATE INDEX IF NOT EXISTS idx_service_locations_customer_multi 
ON public.service_locations (customer_id, is_primary, deleted_at);

-- 4. Verify subscription_vehicles and service_jobs have location_id index
CREATE INDEX IF NOT EXISTS idx_sub_veh_loc_id 
ON public.subscription_vehicles (location_id) 
WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_loc_id 
ON public.service_jobs (location_id) 
WHERE location_id IS NOT NULL;
