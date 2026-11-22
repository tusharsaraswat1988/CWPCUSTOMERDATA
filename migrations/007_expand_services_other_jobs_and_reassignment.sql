-- =========================================================================
-- CWP DATA APP - MIGRATION 007
-- Expand Service Categories to 5 Sections, Add Seater Sizing & Solar Panels,
-- and Enable Staff Reassignment
-- =========================================================================

-- 1. Insert Detailing Categories into service_categories Master
INSERT INTO public.service_categories (id, display_name, description, is_active)
VALUES 
    ('interior_detailing', 'Interior Detailing', 'Deep passenger cabin, upholstery shampoo, vacuum and roof cleaning', TRUE),
    ('exterior_detailing', 'Exterior Detailing', 'Ceramic coating, graphene, car waxing and glass treatment', TRUE)
ON CONFLICT (id) DO UPDATE 
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_active = TRUE;

-- 2. Update service_jobs category constraint to encompass all 5 core sections
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS chk_job_target;
ALTER TABLE public.service_jobs ADD CONSTRAINT chk_job_target CHECK (
    service_category_id IN (
        'daily_car_cleaning',
        'car_washing',
        'solar_cleaning',
        'interior_detailing',
        'exterior_detailing'
    )
);

-- 3. Add Seater Type, Panel Count, and Package Code to service_jobs
ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS seater_type VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS panel_count INTEGER NULL,
    ADD COLUMN IF NOT EXISTS package_code VARCHAR(100) NULL;

-- 4. Add Seater Type to vehicles
ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS seater_type VARCHAR(20) NULL;

-- 5. Add Preferred Seater Type and Panel Count to customers
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS preferred_seater_type VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS panel_count INTEGER NULL;

-- 6. Indexes for High-Performance Dispatch and Filtering
CREATE INDEX IF NOT EXISTS idx_jobs_category_status 
    ON public.service_jobs (service_category_id, status) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_panel_count 
    ON public.service_jobs (panel_count) 
    WHERE panel_count IS NOT NULL;
