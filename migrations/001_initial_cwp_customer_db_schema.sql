-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 001_initial_cwp_customer_db_schema.sql
-- Architecture Specification: docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md
-- Target Database: cwp_customer_db (PostgreSQL 18.7)
-- Total Public Tables: 15
-- =========================================================================

BEGIN;

-- Enable standard pgcrypto extension if required (Postgres 13+ has gen_random_uuid() natively)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- 1. Reference Master: service_categories
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_categories (
    id VARCHAR(30) PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed initial static domain categories
INSERT INTO public.service_categories (id, display_name, description, is_active)
VALUES 
    ('daily_car_cleaning', 'Daily Car Cleaning', 'Recurring daily doorstep car cleaning subscription', TRUE),
    ('car_washing', 'Car Washing', 'On-demand deep foam and exterior car wash service', TRUE),
    ('solar_cleaning', 'Solar Panel Cleaning', 'Rooftop solar panel cleaning and maintenance service', TRUE)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. Customer Master: customers (Option B - Row-Preserving)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    alt_phone VARCHAR(15) NULL,
    email VARCHAR(150) NULL,
    notes TEXT NULL,
    source_sheet_name VARCHAR(50) NOT NULL,
    source_row_index INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    deleted_by VARCHAR(100) NULL,
    deletion_reason TEXT NULL,
    CONSTRAINT chk_customer_active_deleted CHECK (deleted_at IS NULL OR is_active = FALSE)
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_provenance ON public.customers (source_sheet_name, source_row_index);

-- -------------------------------------------------------------------------
-- 3. Service Locations: service_locations
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    address_type VARCHAR(20) NOT NULL DEFAULT 'primary',
    address_text TEXT NOT NULL,
    google_maps_url TEXT NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    parking_details VARCHAR(255) NULL,
    photo_url TEXT NULL,
    photo_storage_key VARCHAR(255) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_locations_id_customer UNIQUE (id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_customer ON public.service_locations (customer_id);

-- -------------------------------------------------------------------------
-- 4. Vehicle Master: vehicles
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    default_location_id UUID NULL,
    registration_no VARCHAR(20) NOT NULL,
    brand_or_model VARCHAR(100) NULL,
    vehicle_type VARCHAR(30) NOT NULL DEFAULT 'Car',
    photo_url TEXT NULL,
    photo_storage_key VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_vehicles_id_customer UNIQUE (id, customer_id),
    CONSTRAINT fk_veh_location_same_customer FOREIGN KEY (default_location_id, customer_id) 
        REFERENCES public.service_locations(id, customer_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON public.vehicles (customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON public.vehicles (registration_no);

-- -------------------------------------------------------------------------
-- 5. Field Staff Master: staff
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_phone ON public.staff (phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff (is_active) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- 6. Staff Authentication: staff_auth
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_auth (
    staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
    pin_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    display_pin VARCHAR(32) NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 7. Recurring Subscriptions: subscriptions
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    service_category_id VARCHAR(30) NOT NULL DEFAULT 'daily_car_cleaning' REFERENCES public.service_categories(id),
    package_name VARCHAR(100) NOT NULL DEFAULT 'Daily Clean',
    packages_purchased INTEGER NOT NULL DEFAULT 1,
    rotation_type VARCHAR(30) NOT NULL DEFAULT 'none',
    rotation_notes TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_subscriptions_id_customer UNIQUE (id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_customer ON public.subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON public.subscriptions (status) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- 8. Subscription Vehicles: subscription_vehicles
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    location_id UUID NULL,
    schedule_tag VARCHAR(20) NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sub_veh_sub_cust FOREIGN KEY (subscription_id, customer_id) 
        REFERENCES public.subscriptions(id, customer_id) ON DELETE CASCADE,
    CONSTRAINT fk_sub_veh_veh_cust FOREIGN KEY (vehicle_id, customer_id) 
        REFERENCES public.vehicles(id, customer_id) ON DELETE RESTRICT,
    CONSTRAINT fk_sub_veh_loc_cust FOREIGN KEY (location_id, customer_id) 
        REFERENCES public.service_locations(id, customer_id) ON DELETE SET NULL,
    CONSTRAINT uq_sub_vehicle UNIQUE (subscription_id, vehicle_id)
);

-- -------------------------------------------------------------------------
-- 9. On-Demand Jobs: service_jobs
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    location_id UUID NOT NULL REFERENCES public.service_locations(id) ON DELETE RESTRICT,
    service_category_id VARCHAR(30) NOT NULL REFERENCES public.service_categories(id),
    service_type VARCHAR(100) NOT NULL,
    package_details TEXT NULL,
    site_details JSONB NULL,
    scheduled_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'assigned',
    special_instructions TEXT NULL,
    photo_url TEXT NULL,
    photo_storage_key VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_job_target CHECK (
        (service_category_id = 'car_washing' AND vehicle_id IS NOT NULL) OR 
        (service_category_id = 'solar_cleaning' AND site_details IS NOT NULL) OR 
        (service_category_id NOT IN ('car_washing', 'solar_cleaning'))
    )
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.service_jobs (status) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- 10. Staff Assignment Ledger: staff_assignments
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
    job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE RESTRICT,
    assigned_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMPTZ NULL,
    unassigned_by VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reassignment_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_assign_target CHECK (
        (subscription_id IS NOT NULL AND job_id IS NULL) OR 
        (subscription_id IS NULL AND job_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_sub_assignment 
    ON public.staff_assignments (subscription_id) 
    WHERE is_active = TRUE AND subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_job_assignment 
    ON public.staff_assignments (job_id) 
    WHERE is_active = TRUE AND job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assign_staff_active ON public.staff_assignments (staff_id, is_active);

-- Trigger function protecting staff assignments from deletion, provenance updates, or reactivation
CREATE OR REPLACE FUNCTION public.trg_protect_staff_assignments() 
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Security Violation: staff_assignments history is immutable and cannot be deleted.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id OR
           NEW.staff_id <> OLD.staff_id OR 
           NEW.subscription_id IS DISTINCT FROM OLD.subscription_id OR 
           NEW.job_id IS DISTINCT FROM OLD.job_id OR 
           NEW.assigned_at <> OLD.assigned_at OR 
           NEW.assigned_by <> OLD.assigned_by OR
           NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Security Violation: Assignment identity and provenance fields are strictly immutable.';
        END IF;

        IF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
            RAISE EXCEPTION 'Security Violation: Reactivating a deactivated assignment is prohibited. Create a new assignment.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_assignments_immutability ON public.staff_assignments;
CREATE TRIGGER trg_staff_assignments_immutability
BEFORE UPDATE OR DELETE ON public.staff_assignments
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_staff_assignments();

-- -------------------------------------------------------------------------
-- 11. Staff Route Stop Ordering: staff_route_sequences
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_route_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    subscription_vehicle_id UUID NULL REFERENCES public.subscription_vehicles(id) ON DELETE CASCADE,
    job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    updated_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_route_stop_target CHECK (
        (subscription_id IS NOT NULL AND job_id IS NULL) OR 
        (subscription_id IS NULL AND job_id IS NOT NULL)
    ),
    CONSTRAINT uq_staff_route_order UNIQUE (staff_id, sequence_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_sub_veh_stop 
    ON public.staff_route_sequences (staff_id, subscription_id, COALESCE(subscription_vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid)) 
    WHERE subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_job_stop 
    ON public.staff_route_sequences (staff_id, job_id) 
    WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_route_order ON public.staff_route_sequences (staff_id, sequence_order);

-- -------------------------------------------------------------------------
-- 12. Execution History & Daily Logs: service_logs
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_mutation_id UUID NOT NULL UNIQUE,
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    subscription_id UUID NULL REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE SET NULL,
    service_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    completed_at_device TIMESTAMPTZ NOT NULL,
    synced_at_server TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    conflict_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NULL,
    photo_url TEXT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'staff_portal',
    device_metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_service_date_ist_match CHECK (
        service_date = (completed_at_device AT TIME ZONE 'Asia/Kolkata')::date
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_logs_daily_vehicle 
    ON public.service_logs (subscription_id, vehicle_id, service_date) 
    WHERE subscription_id IS NOT NULL AND vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_logs_job_once 
    ON public.service_logs (job_id) 
    WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logs_date ON public.service_logs (service_date);
CREATE INDEX IF NOT EXISTS idx_logs_staff_date ON public.service_logs (staff_id, service_date);

-- -------------------------------------------------------------------------
-- 13. Admin Accounts: admin_users
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(10) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'superadmin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 14. Server-Issued Sessions: auth_sessions
-- -------------------------------------------------------------------------
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_valid ON public.auth_sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_expiry ON public.auth_sessions (expires_at);

-- -------------------------------------------------------------------------
-- 15. Operational Audit History: audit_logs
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    before_state JSONB NULL,
    after_state JSONB NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at);

-- Trigger function protecting audit_logs from any updates or deletions
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

-- -------------------------------------------------------------------------
-- 16. Migration Metadata Tracking (Schema: meta)
-- Keeps public schema strictly at exactly 15 application tables
-- -------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS meta;

CREATE TABLE IF NOT EXISTS meta.schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_by VARCHAR(100) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
