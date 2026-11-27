-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 025_create_see_engine_schema.sql
-- Module: Service & Entitlement Engine (SEE-01) — Complete Backend Foundation
-- Target Database: cwp_customer_db (Neon PostgreSQL)
-- Safety: Idempotent DDL + Canonical Seed + Non-Destructive Legacy Backfill
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. Geo / City / Zone & Vehicle Segment Master Tables
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    state VARCHAR(120) NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id UUID NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_zone_city_code UNIQUE (city_id, code)
);

CREATE TABLE IF NOT EXISTS public.vehicle_segments (
    code VARCHAR(40) PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    label_hi VARCHAR(120) NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.vehicle_segments (code, label, label_hi, description, sort_order, is_active)
VALUES
    ('5_seater', '5 Seater', '5 सीटर', 'Hatchback / Sedan / Compact SUV (up to 5 seats)', 1, TRUE),
    ('5_plus_seater', '5+ Seater', '5+ सीटर', '7 Seater / Large SUV / MPV / Van', 2, TRUE)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    label_hi = EXCLUDED.label_hi,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.cities (code, name, state, timezone, is_active)
VALUES ('DEFAULT', 'Default Service City', 'India', 'Asia/Kolkata', TRUE)
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------------
-- 1. Phase 1: Service Catalogue Foundation
-- -------------------------------------------------------------------------
-- Ensure service_categories supports detailing and future categories cleanly
INSERT INTO public.service_categories (id, display_name, description, is_active)
VALUES
    ('daily_car_cleaning', 'Daily Car Cleaning', 'Monthly recurring doorstep vehicle cleaning route.', TRUE),
    ('car_washing', 'Car Wash', 'On-demand and subscription high-pressure foam car wash.', TRUE),
    ('solar_cleaning', 'Solar Panel Cleaning', 'Rooftop solar panel glass-safe cleaning.', TRUE),
    ('interior_detailing', 'Interior Detailing', 'Deep cabin, upholstery, and headliner detailing.', TRUE),
    ('exterior_detailing', 'Exterior Detailing', 'Ceramic, graphene, waxing, and glass treatment.', TRUE),
    ('detailing', 'Detailing', 'Comprehensive interior and exterior automotive detailing.', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    name_hi VARCHAR(150) NULL,
    service_category_id VARCHAR(40) NOT NULL REFERENCES public.service_categories(id),
    service_model VARCHAR(30) NOT NULL DEFAULT 'one_time'
        CHECK (service_model IN ('recurring', 'one_time', 'visit_credit', 'site_quantity', 'flexible_custom')),
    description TEXT NULL,
    tagline VARCHAR(255) NULL,
    details TEXT NULL,
    execution_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    expected_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (expected_duration_minutes > 0),
    checklist_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    photo_requirements JSONB NOT NULL DEFAULT '{"before_min":0,"after_min":0,"required":false}'::jsonb,
    required_staff_capability VARCHAR(64) NULL,
    city_zone_applicability JSONB NOT NULL DEFAULT '{"all_cities":true,"cities":[],"zones":[]}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'retired')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_category_status ON public.services (service_category_id, status);
CREATE INDEX IF NOT EXISTS idx_services_model ON public.services (service_model);

CREATE TABLE IF NOT EXISTS public.service_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    changed_by VARCHAR(100) NOT NULL DEFAULT 'system',
    change_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_service_version UNIQUE (service_id, version)
);

-- -------------------------------------------------------------------------
-- 2. Phase 2: Service Frequency / Recurrence Engine
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_frequencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    frequency_type VARCHAR(30) NOT NULL
        CHECK (frequency_type IN (
            'one_time', 'daily', 'alternate_days', 'weekly',
            'every_n_days', 'every_15_days', 'twice_per_month',
            'monthly', 'every_n_months', 'specific_weekdays',
            'specific_dates', 'custom'
        )),
    interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value >= 1),
    interval_unit VARCHAR(20) NOT NULL DEFAULT 'day'
        CHECK (interval_unit IN ('once', 'day', 'week', 'month', 'year', 'custom')),
    recurrence_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    start_date DATE NULL,
    end_date DATE NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    missed_visit_policy VARCHAR(30) NOT NULL DEFAULT 'skip'
        CHECK (missed_visit_policy IN ('skip', 'carry_forward', 'reschedule_next', 'expire', 'credit_back')),
    carry_forward_policy VARCHAR(30) NOT NULL DEFAULT 'none'
        CHECK (carry_forward_policy IN ('none', 'max_1', 'within_cycle', 'unlimited')),
    blackout_config JSONB NOT NULL DEFAULT '{"skip_holidays":false,"weekly_off_days":[]}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.holiday_blackouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city VARCHAR(100) NULL,
    zone VARCHAR(100) NULL,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE CASCADE,
    blackout_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    policy_override VARCHAR(30) NULL
        CHECK (policy_override IS NULL OR policy_override IN ('skip', 'carry_forward', 'reschedule_next')),
    created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holiday_blackouts_date ON public.holiday_blackouts (blackout_date, city, zone);

-- -------------------------------------------------------------------------
-- 3. Phase 4 (defined before Phase 3 FKs): Add-On Engine
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    addon_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255) NULL,
    details TEXT NULL,
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'fixed'
        CHECK (pricing_model IN ('fixed', 'vehicle_segment', 'per_unit', 'per_panel', 'pricing_bands', 'minimum_charge', 'custom')),
    default_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (default_price >= 0),
    pricing_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_quantity INTEGER NOT NULL DEFAULT 1 CHECK (default_quantity >= 1),
    frequency_id UUID NULL REFERENCES public.service_frequencies(id) ON DELETE SET NULL,
    validity_days INTEGER NULL CHECK (validity_days IS NULL OR validity_days > 0),
    is_optional BOOLEAN NOT NULL DEFAULT TRUE,
    execution_mode VARCHAR(30) NOT NULL DEFAULT 'during_main_service'
        CHECK (execution_mode IN (
            'per_main_service',
            'during_main_service',
            'separate_job',
            'customer_redemption',
            'scheduled_independently'
        )),
    required_staff_capability VARCHAR(64) NULL,
    checklist_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    proof_requirements JSONB NOT NULL DEFAULT '{"before_min":0,"after_min":0,"required":false}'::jsonb,
    expected_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (expected_duration_minutes > 0),
    city_zone_applicability JSONB NOT NULL DEFAULT '{"all_cities":true,"cities":[],"zones":[]}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'retired')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.addon_service_applicability (
    addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (addon_id, service_id)
);

-- -------------------------------------------------------------------------
-- 4. Phase 3: Package Engine
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255) NULL,
    details TEXT NULL,
    main_service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    validity_value INTEGER NOT NULL DEFAULT 30 CHECK (validity_value > 0),
    validity_unit VARCHAR(20) NOT NULL DEFAULT 'days'
        CHECK (validity_unit IN ('days', 'months', 'years')),
    vehicle_segment VARCHAR(40) NULL REFERENCES public.vehicle_segments(code) ON DELETE SET NULL,
    city_zone_eligibility JSONB NOT NULL DEFAULT '{"all_cities":true,"cities":[],"zones":[]}'::jsonb,
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'fixed'
        CHECK (pricing_model IN ('fixed', 'vehicle_segment', 'per_unit', 'per_panel', 'pricing_bands', 'minimum_charge', 'custom')),
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_price >= 0),
    pricing_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_from DATE NULL,
    effective_to DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'retired')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pkg_effective_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_packages_main_service_status ON public.packages (main_service_id, status);

CREATE TABLE IF NOT EXISTS public.package_benefits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    benefit_type VARCHAR(30) NOT NULL DEFAULT 'primary'
        CHECK (benefit_type IN ('primary', 'included_service', 'wash_credit', 'visit_credit', 'custom')),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    frequency_id UUID NULL REFERENCES public.service_frequencies(id) ON DELETE SET NULL,
    validity_override_days INTEGER NULL CHECK (validity_override_days IS NULL OR validity_override_days > 0),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.package_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    frequency_id UUID NULL REFERENCES public.service_frequencies(id) ON DELETE SET NULL,
    is_included BOOLEAN NOT NULL DEFAULT TRUE,
    override_price NUMERIC(10, 2) NULL CHECK (override_price IS NULL OR override_price >= 0),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_package_addon UNIQUE (package_id, addon_id)
);

CREATE TABLE IF NOT EXISTS public.package_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    city VARCHAR(100) NULL,
    zone VARCHAR(100) NULL,
    vehicle_segment VARCHAR(40) NULL REFERENCES public.vehicle_segments(code) ON DELETE SET NULL,
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'fixed'
        CHECK (pricing_model IN ('fixed', 'vehicle_segment', 'per_unit', 'per_panel', 'pricing_bands', 'minimum_charge', 'custom')),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    min_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (min_charge >= 0),
    pricing_bands JSONB NOT NULL DEFAULT '[]'::jsonb,
    effective_from DATE NULL,
    effective_to DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pkg_pricing_lookup ON public.package_pricing_rules (package_id, is_active, city, zone, vehicle_segment);

-- -------------------------------------------------------------------------
-- 5. Phase 5: Marketing Metadata & Media Assets
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(80) NOT NULL,
    display_color VARCHAR(40) NOT NULL DEFAULT '#1976D2',
    icon_identifier VARCHAR(80) NULL,
    display_priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ NULL,
    valid_to TIMESTAMPTZ NULL,
    entity_applicability JSONB NOT NULL DEFAULT '["service","package","addon"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.entity_marketing_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('service', 'package', 'addon')),
    entity_id UUID NOT NULL,
    tag_id UUID NOT NULL REFERENCES public.marketing_tags(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_entity_marketing_tag UNIQUE (entity_type, entity_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_lookup ON public.entity_marketing_tags (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('service', 'package', 'addon', 'execution_proof')),
    entity_id UUID NOT NULL,
    media_slot VARCHAR(30) NOT NULL CHECK (media_slot IN ('square_1_1', 'rectangle_4_3', 'gallery', 'before_proof', 'after_proof')),
    storage_url TEXT NOT NULL,
    storage_key TEXT NULL,
    alt_text VARCHAR(255) NULL,
    width INTEGER NULL CHECK (width IS NULL OR width > 0),
    height INTEGER NULL CHECK (height IS NULL OR height > 0),
    mime_type VARCHAR(100) NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'customer_only')),
    sort_order INTEGER NOT NULL DEFAULT 1,
    uploaded_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_entity ON public.media_assets (entity_type, entity_id, media_slot);

-- -------------------------------------------------------------------------
-- 6. Phase 6: Staff Type & Capability Engine
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    default_service_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_addon_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    equipment_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    operational_restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.staff_type_service_capabilities (
    staff_type_id UUID NOT NULL REFERENCES public.staff_types(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (staff_type_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.staff_type_addon_capabilities (
    staff_type_id UUID NOT NULL REFERENCES public.staff_types(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (staff_type_id, addon_id)
);

CREATE TABLE IF NOT EXISTS public.staff_capability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    capability_type VARCHAR(20) NOT NULL CHECK (capability_type IN ('service', 'addon')),
    target_id UUID NOT NULL,
    is_allowed BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    authorized_by VARCHAR(100) NOT NULL,
    expires_at TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_cap_overrides_staff ON public.staff_capability_overrides (staff_id, is_active);

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS staff_type_id UUID NULL REFERENCES public.staff_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS allowed_cities JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allowed_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS equipment_available JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS max_daily_jobs INTEGER NULL CHECK (max_daily_jobs IS NULL OR max_daily_jobs > 0);

-- -------------------------------------------------------------------------
-- 7. Phase 7: Purchase Snapshot (Immutable)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_reference VARCHAR(100) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    location_id UUID NULL REFERENCES public.service_locations(id) ON DELETE SET NULL,
    package_id UUID NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
    package_version INTEGER NOT NULL DEFAULT 1,
    package_code VARCHAR(64) NOT NULL,
    package_name VARCHAR(150) NOT NULL,
    service_definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
    addon_definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
    quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
    frequencies JSONB NOT NULL DEFAULT '{}'::jsonb,
    validity JSONB NOT NULL DEFAULT '{}'::jsonb,
    vehicle_segment VARCHAR(40) NULL,
    city VARCHAR(100) NULL,
    zone VARCHAR(100) NULL,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_price >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    final_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (final_price >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    terms JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled', 'refunded')),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_snapshots_customer ON public.purchase_snapshots (customer_id, purchased_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_purchase_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.package_id IS DISTINCT FROM NEW.package_id
       OR OLD.package_version IS DISTINCT FROM NEW.package_version
       OR OLD.package_code IS DISTINCT FROM NEW.package_code
       OR OLD.package_name IS DISTINCT FROM NEW.package_name
       OR OLD.service_definitions IS DISTINCT FROM NEW.service_definitions
       OR OLD.addon_definitions IS DISTINCT FROM NEW.addon_definitions
       OR OLD.quantities IS DISTINCT FROM NEW.quantities
       OR OLD.frequencies IS DISTINCT FROM NEW.frequencies
       OR OLD.validity IS DISTINCT FROM NEW.validity
       OR OLD.base_price IS DISTINCT FROM NEW.base_price
       OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
       OR OLD.final_price IS DISTINCT FROM NEW.final_price
       OR OLD.terms IS DISTINCT FROM NEW.terms THEN
        RAISE EXCEPTION 'purchase_snapshots terms and pricing are immutable after purchase';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_purchase_snapshot ON public.purchase_snapshots;
CREATE TRIGGER trg_immutable_purchase_snapshot
    BEFORE UPDATE ON public.purchase_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_snapshot_mutation();

-- -------------------------------------------------------------------------
-- 8. Phase 8: Entitlement Ledger
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entitlement_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_snapshot_id UUID NOT NULL REFERENCES public.purchase_snapshots(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    location_id UUID NULL REFERENCES public.service_locations(id) ON DELETE SET NULL,
    service_id UUID NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    addon_id UUID NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
    entitlement_kind VARCHAR(30) NOT NULL
        CHECK (entitlement_kind IN ('dcc_daily', 'wash_credit', 'solar_visit', 'detailing_visit', 'addon_credit', 'custom')),
    purchased_qty INTEGER NOT NULL DEFAULT 0 CHECK (purchased_qty >= 0),
    reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    consumed_qty INTEGER NOT NULL DEFAULT 0 CHECK (consumed_qty >= 0),
    expired_qty INTEGER NOT NULL DEFAULT 0 CHECK (expired_qty >= 0),
    adjusted_qty INTEGER NOT NULL DEFAULT 0,
    refunded_qty INTEGER NOT NULL DEFAULT 0 CHECK (refunded_qty >= 0),
    remaining_qty INTEGER NOT NULL DEFAULT 0 CHECK (remaining_qty >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMPTZ NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'exhausted', 'expired', 'cancelled', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_entitlement_target CHECK (service_id IS NOT NULL OR addon_id IS NOT NULL),
    CONSTRAINT chk_entitlement_ledger_balance CHECK (
        remaining_qty = purchased_qty + adjusted_qty - reserved_qty - consumed_qty - expired_qty - refunded_qty
    )
);

CREATE INDEX IF NOT EXISTS idx_entitlement_accounts_customer ON public.entitlement_accounts (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_entitlement_accounts_snapshot ON public.entitlement_accounts (purchase_snapshot_id);

CREATE TABLE IF NOT EXISTS public.entitlement_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_account_id UUID NOT NULL REFERENCES public.entitlement_accounts(id) ON DELETE RESTRICT,
    entry_type VARCHAR(20) NOT NULL
        CHECK (entry_type IN ('purchase', 'reserve', 'release', 'consume', 'expire', 'adjust', 'refund', 'reverse')),
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reference_type VARCHAR(50) NULL,
    reference_id VARCHAR(100) NULL,
    sale_reference VARCHAR(100) NULL,
    execution_reference VARCHAR(100) NULL,
    idempotency_key VARCHAR(150) NULL UNIQUE,
    reason TEXT NOT NULL,
    actor VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entitlement_ledger_account ON public.entitlement_ledger (entitlement_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_entitlement_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'entitlement_ledger is append-only and immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_entitlement_ledger ON public.entitlement_ledger;
CREATE TRIGGER trg_immutable_entitlement_ledger
    BEFORE UPDATE OR DELETE ON public.entitlement_ledger
    FOR EACH ROW EXECUTE FUNCTION public.prevent_entitlement_ledger_mutation();

-- -------------------------------------------------------------------------
-- 9. Phase 9, 10, 11: Canonical Service Jobs, Executions, Add-Ons, Solar Verification
-- -------------------------------------------------------------------------
-- Drop legacy hardcoded category CHECK constraint and rely on FK to service_categories
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS chk_job_target;

ALTER TABLE public.service_jobs
    ADD COLUMN IF NOT EXISTS service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_name_snapshot VARCHAR(150) NULL,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS zone VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS entitlement_account_id UUID NULL REFERENCES public.entitlement_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS purchase_snapshot_id UUID NULL REFERENCES public.purchase_snapshots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS service_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS checklist_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS proof_requirements JSONB NOT NULL DEFAULT '{"before_min":0,"after_min":0,"required":false}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_service_jobs_service_id ON public.service_jobs (service_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_entitlement ON public.service_jobs (entitlement_account_id) WHERE entitlement_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.service_job_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
    addon_name_snapshot VARCHAR(150) NOT NULL,
    execution_mode VARCHAR(30) NOT NULL DEFAULT 'during_main_service',
    entitlement_account_id UUID NULL REFERENCES public.entitlement_accounts(id) ON DELETE SET NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped_exception', 'cancelled')),
    checklist_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    proof_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_by VARCHAR(100) NULL,
    completed_at TIMESTAMPTZ NULL,
    exception_reason TEXT NULL,
    approved_by VARCHAR(100) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_job_addons_job ON public.service_job_addons (job_id);

CREATE TABLE IF NOT EXISTS public.service_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
    staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ NULL,
    actual_quantity INTEGER NULL,
    measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
    checklist_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    proof_photos JSONB NOT NULL DEFAULT '{"before":[],"after":[]}'::jsonb,
    customer_confirmation JSONB NOT NULL DEFAULT '{}'::jsonb,
    outcome VARCHAR(30) NOT NULL DEFAULT 'completed'
        CHECK (outcome IN ('in_progress', 'completed', 'failed', 'no_show', 'unable_to_complete', 'partial_exception')),
    exception_reason TEXT NULL,
    approval_reference VARCHAR(120) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_executions_job ON public.service_executions (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.solar_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES public.service_jobs(id) ON DELETE CASCADE,
    estimated_panel_count INTEGER NULL CHECK (estimated_panel_count IS NULL OR estimated_panel_count > 0),
    system_capacity_kw NUMERIC(10, 2) NULL CHECK (system_capacity_kw IS NULL OR system_capacity_kw > 0),
    estimate_method VARCHAR(50) NOT NULL DEFAULT 'customer_declared'
        CHECK (estimate_method IN ('customer_declared', 'capacity_formula', 'site_survey', 'historical')),
    is_estimate BOOLEAN NOT NULL DEFAULT TRUE,
    actual_panel_count INTEGER NULL CHECK (actual_panel_count IS NULL OR actual_panel_count > 0),
    verified_by_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    discrepancy_reason TEXT NULL,
    approval_status VARCHAR(30) NOT NULL DEFAULT 'not_required'
        CHECK (approval_status IN ('not_required', 'pending_approval', 'approved', 'rejected')),
    approved_by VARCHAR(100) NULL,
    approved_at TIMESTAMPTZ NULL,
    final_serviced_quantity INTEGER NULL CHECK (final_serviced_quantity IS NULL OR final_serviced_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 10. Phase 13: Legacy Mapping & Canonical Seed Data
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legacy_service_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_type VARCHAR(40) NOT NULL,
    legacy_key VARCHAR(120) NOT NULL,
    canonical_service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
    canonical_package_id UUID NULL REFERENCES public.packages(id) ON DELETE SET NULL,
    notes TEXT NULL,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_legacy_mapping UNIQUE (legacy_type, legacy_key)
);

-- Seed canonical frequencies
INSERT INTO public.service_frequencies (code, name, frequency_type, interval_value, interval_unit, recurrence_config, timezone, missed_visit_policy, carry_forward_policy)
VALUES
    ('ONE_TIME', 'One-Time', 'one_time', 1, 'once', '{}'::jsonb, 'Asia/Kolkata', 'reschedule_next', 'none'),
    ('DAILY', 'Daily', 'daily', 1, 'day', '{}'::jsonb, 'Asia/Kolkata', 'skip', 'none'),
    ('ALTERNATE_DAYS', 'Alternate Days', 'alternate_days', 2, 'day', '{}'::jsonb, 'Asia/Kolkata', 'skip', 'none'),
    ('WEEKLY', 'Weekly', 'weekly', 1, 'week', '{}'::jsonb, 'Asia/Kolkata', 'reschedule_next', 'max_1'),
    ('EVERY_15_DAYS', 'Every 15 Days', 'every_15_days', 15, 'day', '{"mode":"rolling_15_days"}'::jsonb, 'Asia/Kolkata', 'carry_forward', 'within_cycle'),
    ('TWICE_PER_MONTH', 'Twice Per Calendar Month', 'twice_per_month', 2, 'month', '{"mode":"calendar_month_twice","days":[1,15]}'::jsonb, 'Asia/Kolkata', 'carry_forward', 'within_cycle'),
    ('MONTHLY', 'Monthly', 'monthly', 1, 'month', '{}'::jsonb, 'Asia/Kolkata', 'carry_forward', 'within_cycle')
ON CONFLICT (code) DO NOTHING;

-- Seed canonical services
INSERT INTO public.services (service_code, name, name_hi, service_category_id, service_model, description, tagline, expected_duration_minutes, checklist_requirements, photo_requirements, required_staff_capability, status)
VALUES
    ('DCC_DAILY', 'Daily Car Cleaning', 'दैनिक कार सफाई', 'daily_car_cleaning', 'recurring', 'Recurring doorstep vehicle cleaning route.', 'Morning doorstep shine', 15, '["Exterior wipe","Tyre dusting","Glass wipe"]'::jsonb, '{"before_min":0,"after_min":1,"required":false}'::jsonb, 'daily_car_cleaning', 'active'),
    ('CAR_WASH', 'Car Wash', 'कार वॉश', 'car_washing', 'visit_credit', 'Deep exterior and underbody high-pressure foam wash.', 'Showroom foam wash', 45, '["Pre-rinse","Foam wash","Underbody rinse","Dry & dress"]'::jsonb, '{"before_min":1,"after_min":1,"required":true}'::jsonb, 'car_washing', 'active'),
    ('SOLAR_CLEAN', 'Solar Panel Cleaning', 'सोलर पैनल सफाई', 'solar_cleaning', 'site_quantity', 'Rooftop solar panel glass-safe cleaning.', 'Peak solar output', 60, '["Safety harness check","De-mineralized rinse","Soft brush clean","Panel count verify"]'::jsonb, '{"before_min":1,"after_min":1,"required":true}'::jsonb, 'solar_cleaning', 'active'),
    ('INT_DETAILING', 'Interior Detailing', 'इंटीरियर डिटेलिंग', 'interior_detailing', 'one_time', 'Deep cabin, upholstery shampooing, and roof cleaning.', 'Cabin deep refresh', 90, '["Deep vacuum","Upholstery shampoo","Dashboard conditioning"]'::jsonb, '{"before_min":1,"after_min":1,"required":true}'::jsonb, 'interior_detailing', 'active'),
    ('EXT_DETAILING', 'Exterior Detailing', 'एक्सटीरियर डिटेलिंग', 'exterior_detailing', 'one_time', 'Paint correction, ceramic/graphene coating, and waxing.', 'Mirror paint shield', 120, '["Decontamination","Machine polish","Coating/Wax"]'::jsonb, '{"before_min":1,"after_min":1,"required":true}'::jsonb, 'exterior_detailing', 'active')
ON CONFLICT (service_code) DO NOTHING;

-- Seed canonical marketing tags
INSERT INTO public.marketing_tags (code, label, display_color, icon_identifier, display_priority, is_active)
VALUES
    ('RECOMMENDED', 'Recommended', '#1E88E5', 'verified', 10, TRUE),
    ('EXCLUSIVE', 'Exclusive', '#8E24AA', 'diamond', 20, TRUE),
    ('SALE', 'Sale', '#E53935', 'local_offer', 30, TRUE),
    ('MOST_AFFORDABLE', 'Most Affordable', '#43A047', 'savings', 40, TRUE),
    ('POPULAR', 'Popular', '#FB8C00', 'trending_up', 50, TRUE),
    ('NEW', 'New', '#00ACC1', 'fiber_new', 60, TRUE),
    ('PREMIUM', 'Premium', '#5E35B1', 'workspace_premium', 70, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Seed canonical add-ons
INSERT INTO public.addons (addon_code, name, tagline, pricing_model, default_price, execution_mode, checklist_requirements, expected_duration_minutes, status)
VALUES
    ('TYRE_PRESSURE', 'Tyre Pressure Check', 'Optimal PSI check & top-up', 'fixed', 99.00, 'per_main_service', '["Check all 4 tyres + spare","Adjust to OEM PSI"]'::jsonb, 10, 'active'),
    ('WASHER_FLUID', 'Windshield Washer Fluid Top-up', 'Crystal-clear vision', 'fixed', 149.00, 'during_main_service', '["Inspect reservoir","Top up washer concentrate"]'::jsonb, 5, 'active'),
    ('ROOF_CLEANING', 'Roof Cleaning', 'Headliner stain & fabric care', 'fixed', 799.00, 'separate_job', '["Spot test fabric","Dry foam extraction"]'::jsonb, 45, 'active'),
    ('EXTERIOR_TRIM_POLISH', 'Exterior Trim Polishing', 'UV black-trim restoration', 'fixed', 299.00, 'during_main_service', '["Clean plastic cladding","Apply UV trim restorer"]'::jsonb, 15, 'active')
ON CONFLICT (addon_code) DO NOTHING;

-- Seed canonical staff types
INSERT INTO public.staff_types (code, name, description, default_service_capabilities, default_addon_capabilities, equipment_requirements)
VALUES
    ('DCC_CLEANER', 'Daily Car Cleaner', 'Frontline daily route cleaning operative', '["DCC_DAILY"]'::jsonb, '["TYRE_PRESSURE","WASHER_FLUID"]'::jsonb, '["Microfiber cloths","Bucket","Duster"]'::jsonb),
    ('WASH_SPECIALIST', 'Car Wash Specialist', 'High-pressure foam wash & detailing specialist', '["CAR_WASH","INT_DETAILING","EXT_DETAILING"]'::jsonb, '["TYRE_PRESSURE","WASHER_FLUID","ROOF_CLEANING","EXTERIOR_TRIM_POLISH"]'::jsonb, '["Pressure washer","Foam cannon","Vacuum"]'::jsonb),
    ('SOLAR_TECHNICIAN', 'Solar Cleaning Technician', 'Rooftop solar cleaning & panel verification technician', '["SOLAR_CLEAN"]'::jsonb, '[]'::jsonb, '["Safety harness","Soft solar brush","TDS meter"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Populate legacy_service_mapping for existing service_categories & backfill service_jobs.service_id
INSERT INTO public.legacy_service_mapping (legacy_type, legacy_key, canonical_service_id, notes)
SELECT 'service_category', s.service_category_id, s.id, 'Canonical category to service mapping'
FROM public.services s
ON CONFLICT (legacy_type, legacy_key) DO NOTHING;

UPDATE public.service_jobs j
SET service_id = s.id,
    service_name_snapshot = COALESCE(j.service_name_snapshot, j.service_type, s.name)
FROM public.services s
WHERE j.service_category_id = s.service_category_id
  AND j.service_id IS NULL;

COMMIT;
