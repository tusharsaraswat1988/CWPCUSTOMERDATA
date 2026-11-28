-- =========================================================================
-- CWP DETAILERS & MOTORS — CLEAN BRD v1.0 POSTGRESQL SCHEMA
-- Migration: 001_brd_schema.sql
-- Single Source of Truth: cwp-business-requirements.md v1.0 & PROJECT.md
-- =========================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. CUSTOMERS & LEADS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    name_hi VARCHAR(150) NULL,
    phone VARCHAR(15) NULL,
    email VARCHAR(150) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_lead BOOLEAN NOT NULL DEFAULT FALSE,
    lead_stage VARCHAR(40) NULL,
    lead_source VARCHAR(60) NULL,
    interested_service VARCHAR(100) NULL,
    notes TEXT NULL,
    lead_notes JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    deleted_by VARCHAR(100) NULL,
    deletion_reason TEXT NULL,
    CONSTRAINT chk_customers_nonlead_phone CHECK (
        is_lead = TRUE OR (phone IS NOT NULL AND TRIM(phone) <> '')
    ),
    CONSTRAINT chk_customers_active_deleted CHECK (
        deleted_at IS NULL OR is_active = FALSE
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone
    ON public.customers (phone)
    WHERE deleted_at IS NULL AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_active
    ON public.customers (is_active, is_lead)
    WHERE deleted_at IS NULL;

-- =========================================================================
-- 2. SERVICE LOCATIONS (Multi-Address per Customer)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.service_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    label VARCHAR(60) NOT NULL DEFAULT 'Home',
    address_text TEXT NOT NULL,
    address_text_hi TEXT NULL,
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    google_maps_url TEXT NULL,
    parking_details VARCHAR(255) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_locations_address_nonempty CHECK (TRIM(address_text) <> ''),
    CONSTRAINT uq_locations_id_customer UNIQUE (id, customer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_one_primary
    ON public.service_locations (customer_id)
    WHERE is_primary = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_locations_customer
    ON public.service_locations (customer_id)
    WHERE deleted_at IS NULL;

-- =========================================================================
-- 3. VEHICLES (Mandatory Linked Address + 5_seater / 5_plus_seater)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL,
    registration_no VARCHAR(25) NOT NULL,
    seater_type VARCHAR(20) NOT NULL CHECK (seater_type IN ('5_seater', '5_plus_seater')),
    car_model VARCHAR(100) NULL,
    car_color VARCHAR(50) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_vehicles_location_customer FOREIGN KEY (location_id, customer_id)
        REFERENCES public.service_locations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT uq_vehicles_id_customer UNIQUE (id, customer_id),
    CONSTRAINT chk_vehicles_reg_nonempty CHECK (TRIM(registration_no) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_cust_reg
    ON public.vehicles (customer_id, UPPER(TRIM(registration_no)))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_customer
    ON public.vehicles (customer_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_location
    ON public.vehicles (location_id)
    WHERE deleted_at IS NULL;

-- =========================================================================
-- 4. SOLAR INSTALLATIONS (Mandatory Linked Address + Panel Count > 0)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.solar_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL,
    panel_count INTEGER NOT NULL CHECK (panel_count > 0),
    kw_load NUMERIC(8, 2) NULL CHECK (kw_load IS NULL OR kw_load > 0),
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_solar_location_customer FOREIGN KEY (location_id, customer_id)
        REFERENCES public.service_locations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT uq_solar_id_customer UNIQUE (id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_solar_customer
    ON public.solar_installations (customer_id)
    WHERE deleted_at IS NULL;

-- =========================================================================
-- 5. STAFF & 4-CAPABILITY BOOLEANS + STAFF AUTH (4-6 DIGIT PIN)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    can_dcc BOOLEAN NOT NULL DEFAULT FALSE,
    can_car_wash BOOLEAN NOT NULL DEFAULT FALSE,
    can_solar BOOLEAN NOT NULL DEFAULT FALSE,
    can_detailing BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    photo_url TEXT NULL,
    weekly_off VARCHAR(30) NULL,
    salary_amount NUMERIC(10, 2) NULL,
    joining_date DATE NULL,
    address TEXT NULL,
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_staff_phone_nonempty CHECK (TRIM(phone) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_phone
    ON public.staff (phone)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_status
    ON public.staff (status)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.staff_auth (
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    pin_hash VARCHAR(255) NOT NULL,
    pin_length SMALLINT NOT NULL DEFAULT 6 CHECK (pin_length BETWEEN 4 AND 6),
    salt VARCHAR(64) NULL,
    display_pin VARCHAR(32) NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 6. MASTER CATALOG: SERVICES, PACKAGES, PACKAGE ITEMS, SOLAR TIERS, ADDONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(20) NOT NULL CHECK (category IN ('dcc', 'car_wash', 'solar', 'detailing')),
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    price_5_seater NUMERIC(10, 2) NULL CHECK (price_5_seater IS NULL OR price_5_seater >= 0),
    price_5_plus_seater NUMERIC(10, 2) NULL CHECK (price_5_plus_seater IS NULL OR price_5_plus_seater >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_services_category_name UNIQUE (category, name)
);

CREATE TABLE IF NOT EXISTS public.packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NULL,
    validity_days INTEGER NOT NULL CHECK (validity_days > 0),
    price_5_seater NUMERIC(10, 2) NULL CHECK (price_5_seater IS NULL OR price_5_seater >= 0),
    price_5_plus_seater NUMERIC(10, 2) NULL CHECK (price_5_plus_seater IS NULL OR price_5_plus_seater >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    frequency VARCHAR(20) NULL CHECK (
        frequency IS NULL OR frequency IN ('daily', 'alternate', 'weekly', 'biweekly', 'monthly', 'one_time')
    ),
    duration_months INTEGER NULL CHECK (duration_months IS NULL OR duration_months > 0),
    CONSTRAINT uq_package_items_pkg_svc UNIQUE (package_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.solar_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name VARCHAR(100) NOT NULL UNIQUE,
    min_panels INTEGER NOT NULL CHECK (min_panels > 0),
    max_panels INTEGER NULL CHECK (max_panels IS NULL OR max_panels >= min_panels),
    per_panel_rate NUMERIC(10, 2) NOT NULL CHECK (per_panel_rate >= 0),
    min_billing_onetime NUMERIC(10, 2) NOT NULL CHECK (min_billing_onetime >= 0),
    min_billing_amc NUMERIC(10, 2) NOT NULL CHECK (min_billing_amc >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL UNIQUE,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    default_quantity INTEGER NOT NULL DEFAULT 1 CHECK (default_quantity >= 1),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 7. CENTRAL BOOKING ENGINE (bookings & booking_addons)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    package_id UUID NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('vehicle', 'solar')),
    vehicle_id UUID NULL,
    solar_id UUID NULL,
    location_id UUID NOT NULL,
    assigned_dcc_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    frequency VARCHAR(20) NULL CHECK (
        frequency IS NULL OR frequency IN ('daily', 'alternate', 'weekly', 'biweekly', 'monthly', 'one_time')
    ),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NULL,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
    total_count INTEGER NOT NULL DEFAULT 1 CHECK (total_count >= 0),
    remaining_count INTEGER NOT NULL DEFAULT 1 CHECK (remaining_count >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_location_customer FOREIGN KEY (location_id, customer_id)
        REFERENCES public.service_locations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_vehicle_customer FOREIGN KEY (vehicle_id, customer_id)
        REFERENCES public.vehicles(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_solar_customer FOREIGN KEY (solar_id, customer_id)
        REFERENCES public.solar_installations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_package_or_service CHECK (package_id IS NOT NULL OR service_id IS NOT NULL),
    CONSTRAINT chk_bookings_asset_match CHECK (
        (asset_type = 'vehicle' AND vehicle_id IS NOT NULL AND solar_id IS NULL) OR
        (asset_type = 'solar' AND solar_id IS NOT NULL AND vehicle_id IS NULL)
    ),
    CONSTRAINT chk_bookings_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON public.bookings (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_solar ON public.bookings (solar_id) WHERE solar_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_booking_addons_booking ON public.booking_addons (booking_id);

-- =========================================================================
-- 8. DCC ROUTE PLANNING (routes, route_stops, route_temp_assignments)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    area VARCHAR(120) NULL,
    staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_routes_staff ON public.routes (staff_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
    sequence_order INTEGER NOT NULL CHECK (sequence_order > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Global vehicle exclusivity: one car can ONLY be assigned to ONE active route stop at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_stops_active_vehicle
    ON public.route_stops (vehicle_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_stops_active_seq
    ON public.route_stops (route_id, sequence_order)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_route_stops_route_seq
    ON public.route_stops (route_id, sequence_order)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.route_temp_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    original_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    cover_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_route_temp_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_route_temp_active_dates
    ON public.route_temp_assignments (route_id, start_date, end_date)
    WHERE is_active = TRUE;

-- =========================================================================
-- 9. JOBS: DCC DAILY JOBS & NON-DCC SERVICE JOBS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dcc_daily_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_date DATE NOT NULL,
    booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
    route_id UUID NULL REFERENCES public.routes(id) ON DELETE SET NULL,
    route_stop_id UUID NULL REFERENCES public.route_stops(id) ON DELETE SET NULL,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.service_locations(id) ON DELETE RESTRICT,
    assigned_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    actual_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    frequency VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'alternate')),
    status VARCHAR(30) NOT NULL DEFAULT 'auto_generated' CHECK (
        status IN ('auto_generated', 'completed', 'car_not_available', 'missed')
    ),
    photo_url TEXT NULL,
    gps_lat NUMERIC(10, 7) NULL,
    gps_lng NUMERIC(10, 7) NULL,
    gps_accuracy NUMERIC(8, 2) NULL,
    gps_distance_meters NUMERIC(10, 2) NULL,
    gps_verified BOOLEAN NULL,
    client_mutation_id UUID NULL UNIQUE,
    notes TEXT NULL,
    admin_notes TEXT NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dcc_daily_jobs_date_vehicle UNIQUE (job_date, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_dcc_jobs_date_staff
    ON public.dcc_daily_jobs (job_date, assigned_staff_id);

CREATE INDEX IF NOT EXISTS idx_dcc_jobs_date_status
    ON public.dcc_daily_jobs (job_date, status);

CREATE TABLE IF NOT EXISTS public.service_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    service_category VARCHAR(20) NOT NULL CHECK (service_category IN ('car_wash', 'solar', 'detailing')),
    service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
    asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('vehicle', 'solar')),
    vehicle_id UUID NULL,
    solar_id UUID NULL,
    location_id UUID NOT NULL,
    assigned_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (
        status IN ('scheduled', 'assigned', 'enrolled', 'in_progress', 'completed', 'verified', 'cancelled')
    ),
    scheduled_date DATE NULL,
    enrolled_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    before_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    after_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    checklist_results JSONB NULL,
    completed_at TIMESTAMPTZ NULL,
    verified_at TIMESTAMPTZ NULL,
    verified_by VARCHAR(100) NULL,
    auto_verify_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_service_jobs_location_customer FOREIGN KEY (location_id, customer_id)
        REFERENCES public.service_locations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_service_jobs_vehicle_customer FOREIGN KEY (vehicle_id, customer_id)
        REFERENCES public.vehicles(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_service_jobs_solar_customer FOREIGN KEY (solar_id, customer_id)
        REFERENCES public.solar_installations(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT chk_service_jobs_asset_match CHECK (
        (asset_type = 'vehicle' AND vehicle_id IS NOT NULL AND solar_id IS NULL) OR
        (asset_type = 'solar' AND solar_id IS NOT NULL AND vehicle_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_service_jobs_status
    ON public.service_jobs (status);

CREATE INDEX IF NOT EXISTS idx_service_jobs_staff_status
    ON public.service_jobs (assigned_staff_id, status)
    WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_auto_verify
    ON public.service_jobs (auto_verify_at)
    WHERE status = 'completed' AND auto_verify_at IS NOT NULL;

-- =========================================================================
-- 10. ADMIN AUTH, SESSIONS, SECURITY, AUDIT, CAREERS & SETTINGS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(15) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'superadmin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_type VARCHAR(20) NOT NULL,
    staff_id UUID NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    admin_id UUID NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    device_id VARCHAR(100) NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    device_label VARCHAR(120) NULL,
    browser VARCHAR(80) NULL,
    os VARCHAR(80) NULL,
    trusted_device_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_valid ON public.auth_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_expiry ON public.auth_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_session_staff_active ON public.auth_sessions (staff_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_admin_active ON public.auth_sessions (admin_id) WHERE revoked_at IS NULL AND user_type = 'admin';

CREATE TABLE IF NOT EXISTS public.admin_trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    device_label VARCHAR(120) NOT NULL,
    browser VARCHAR(80) NOT NULL,
    os VARCHAR(80) NOT NULL,
    first_registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trust_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_hash ON public.admin_trusted_devices (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trusted_devices_admin ON public.admin_trusted_devices (admin_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_security_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(100) NOT NULL DEFAULT 'admin',
    ip_address VARCHAR(45) NULL,
    browser VARCHAR(80) NULL,
    os VARCHAR(80) NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sec_events_created ON public.admin_security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sec_events_type ON public.admin_security_events (event_type);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    before_state JSONB NULL,
    after_state JSONB NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.trg_protect_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Violation: audit_logs entries are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_logs_mutation ON public.audit_logs;
CREATE TRIGGER prevent_audit_logs_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_audit_logs();

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
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    admin_notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications (status);
CREATE INDEX IF NOT EXISTS idx_job_applications_mobile ON public.job_applications (mobile);
CREATE INDEX IF NOT EXISTS idx_job_applications_created_at ON public.job_applications (created_at DESC);

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by VARCHAR(100) NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 11. STAFF LIVE GPS TRACKING & OPERATIONAL INTELLIGENCE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.staff_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy NUMERIC(8, 2) NULL,
    altitude NUMERIC(8, 2) NULL,
    speed NUMERIC(8, 2) NULL,
    heading NUMERIC(6, 2) NULL,
    battery_level NUMERIC(5, 2) NULL,
    is_charging BOOLEAN NULL,
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'heartbeat',
    captured_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_event_id VARCHAR(100) NULL,
    device_id VARCHAR(100) NULL,
    app_version VARCHAR(40) NULL,
    network_type VARCHAR(30) NULL,
    connectivity_status VARCHAR(20) NULL,
    permission_status VARCHAR(30) NULL,
    is_valid_fix BOOLEAN NOT NULL DEFAULT TRUE,
    accuracy_tier VARCHAR(20) NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_loc_staff_captured ON public.staff_locations (staff_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_loc_captured ON public.staff_locations (captured_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_loc_client_event
    ON public.staff_locations (staff_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff_tracking_current (
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    last_latitude NUMERIC(10, 7) NOT NULL,
    last_longitude NUMERIC(10, 7) NOT NULL,
    last_accuracy NUMERIC(8, 2) NULL,
    last_speed NUMERIC(8, 2) NULL,
    last_heading NUMERIC(6, 2) NULL,
    battery_level NUMERIC(5, 2) NULL,
    is_charging BOOLEAN NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    current_status VARCHAR(30) NOT NULL DEFAULT 'moving',
    today_distance_meters NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,
    current_stoppage_id UUID NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_received_at TIMESTAMPTZ NULL,
    last_heartbeat_at TIMESTAMPTZ NULL,
    device_id VARCHAR(100) NULL,
    previous_device_id VARCHAR(100) NULL,
    device_changed_at TIMESTAMPTZ NULL,
    app_version VARCHAR(40) NULL,
    network_type VARCHAR(30) NULL,
    connectivity_status VARCHAR(20) NULL,
    permission_status VARCHAR(30) NULL,
    accuracy_tier VARCHAR(20) NULL
);

CREATE TABLE IF NOT EXISTS public.staff_stoppages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    address_text TEXT NULL,
    matched_customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
    arrived_at TIMESTAMPTZ NOT NULL,
    departed_at TIMESTAMPTZ NULL,
    dwell_minutes NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    stoppage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_stop_staff_date ON public.staff_stoppages (staff_id, stoppage_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_stop_active ON public.staff_stoppages (staff_id, is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.staff_location_pings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    requested_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    accuracy NUMERIC(8, 2) NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_pings_staff_status ON public.staff_location_pings (staff_id, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.staff_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(160) NOT NULL,
    details TEXT NULL,
    latitude NUMERIC(10, 7) NULL,
    longitude NUMERIC(10, 7) NULL,
    distance_meters NUMERIC(10, 2) NULL,
    accuracy_meters NUMERIC(8, 2) NULL,
    duration_minutes NUMERIC(8, 2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    acknowledged_at TIMESTAMPTZ NULL,
    acknowledged_by VARCHAR(100) NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ NULL,
    metadata JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_trk_events_date ON public.staff_tracking_events (event_date DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_trk_events_active ON public.staff_tracking_events (staff_id, event_type, is_active) WHERE is_active = TRUE;

-- =========================================================================
-- 12. MIGRATION METADATA SCHEMA
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS meta;

CREATE TABLE IF NOT EXISTS meta.schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_by VARCHAR(100) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
