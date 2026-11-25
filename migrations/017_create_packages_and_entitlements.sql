-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 017_create_packages_and_entitlements.sql
-- Module: Packages & Entitlements Decoupled Subsystem
-- Target Database: cwp_customer_db (Neon PostgreSQL)
-- Target Entities: customer_packages, package_redemption_logs
-- Invariant: Remaining Entitlement = Total Purchased - Redeemed
-- Safety: Pure DDL definition. Independent from Daily Clean routes and staff dispatch.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Table: customer_packages
-- Tracks customer-purchased service packages and prepaid service entitlements
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_code VARCHAR(50) NOT NULL,
    package_name VARCHAR(150) NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    location_id UUID NULL REFERENCES public.service_locations(id) ON DELETE SET NULL,
    service_category_id VARCHAR(30) NOT NULL REFERENCES public.service_categories(id),
    total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
    redeemed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_quantity >= 0),
    remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    validity_months INTEGER NOT NULL DEFAULT 1 CHECK (validity_months > 0),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    activation_date DATE NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'pending_activation', 'exhausted', 'expired', 'cancelled')),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'paid' 
        CHECK (payment_status IN ('paid', 'pending', 'partial', 'waived')),
    notes TEXT NULL,
    created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,

    -- Compound constraint ensuring vehicle belongs to the same customer if vehicle_id is provided
    CONSTRAINT fk_cust_pkg_veh_cust FOREIGN KEY (vehicle_id, customer_id) 
        REFERENCES public.vehicles(id, customer_id) ON DELETE SET NULL,
        
    -- Compound constraint ensuring location belongs to the same customer if location_id is provided
    CONSTRAINT fk_cust_pkg_loc_cust FOREIGN KEY (location_id, customer_id) 
        REFERENCES public.service_locations(id, customer_id) ON DELETE SET NULL,

    -- Invariant: remaining_quantity must strictly equal total_quantity - redeemed_quantity
    CONSTRAINT chk_entitlement_balance CHECK (remaining_quantity = total_quantity - redeemed_quantity),
    
    -- Invariant: redeemed_quantity must not exceed total_quantity
    CONSTRAINT chk_redemption_limit CHECK (redeemed_quantity <= total_quantity),
    
    -- Invariant: expiry_date must be on or after purchase_date
    CONSTRAINT chk_package_dates CHECK (expiry_date >= purchase_date)
);

-- Indexes for fast retrieval by customer, category, status, and expiry
CREATE INDEX IF NOT EXISTS idx_cust_pkgs_customer ON public.customer_packages (customer_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cust_pkgs_category ON public.customer_packages (service_category_id);
CREATE INDEX IF NOT EXISTS idx_cust_pkgs_status_expiry ON public.customer_packages (status, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cust_pkgs_vehicle ON public.customer_packages (vehicle_id) WHERE vehicle_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. Table: package_redemption_logs
-- Immutable transaction ledger recording every redemption event against a package
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.package_redemption_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.customer_packages(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    location_id UUID NULL REFERENCES public.service_locations(id) ON DELETE SET NULL,
    quantity_redeemed INTEGER NOT NULL DEFAULT 1 CHECK (quantity_redeemed > 0),
    balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    redemption_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    redeemed_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    service_job_id UUID NULL REFERENCES public.service_jobs(id) ON DELETE SET NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Invariant: balance_after must equal balance_before - quantity_redeemed
    CONSTRAINT chk_redemption_balance CHECK (balance_after = balance_before - quantity_redeemed)
);

CREATE INDEX IF NOT EXISTS idx_pkg_redemptions_package ON public.package_redemption_logs (package_id, redemption_date DESC);
CREATE INDEX IF NOT EXISTS idx_pkg_redemptions_customer ON public.package_redemption_logs (customer_id, redemption_date DESC);

COMMIT;
