-- =========================================================================
-- CWP DATA APP - MIGRATION 012
-- Dynamic Homepage Marketing Settings & Job Applications Table
-- =========================================================================

-- 1. Homepage Settings Table (Admin-managed rates, offers, coupons & contact details)
CREATE TABLE IF NOT EXISTS public.homepage_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary_config',
    rates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    offers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    coupons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    contact_phone VARCHAR(20) NOT NULL DEFAULT '7054007733',
    contact_email VARCHAR(100) NOT NULL DEFAULT 'cwpdetailers@gmail.com',
    office_address TEXT NOT NULL DEFAULT 'FIRST FLOOR, 32/14-4A, Annapurna Nagar Colony, Vidya Vihar Colony, Shivpurwa, Varanasi, Uttar Pradesh 221002',
    google_maps_url TEXT NOT NULL DEFAULT 'https://share.google/BptJhx2p3xlUiIC4d',
    gst_percent NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Job Applications Table (Careers / Recruitment applicants)
CREATE TABLE IF NOT EXISTS public.job_applications (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    age INT NULL,
    gender VARCHAR(20) NULL,
    city VARCHAR(100) NULL,
    email VARCHAR(150) NULL,
    resume_url TEXT NULL,
    resume_filename VARCHAR(255) NULL,
    remark TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new', -- 'new', 'reviewed', 'contacted', 'hired', 'rejected'
    admin_notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications (status);
CREATE INDEX IF NOT EXISTS idx_job_applications_mobile ON public.job_applications (mobile);
CREATE INDEX IF NOT EXISTS idx_job_applications_created_at ON public.job_applications (created_at DESC);
