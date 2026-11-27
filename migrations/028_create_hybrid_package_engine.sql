-- Hybrid packages are a separate catalogue and purchase domain. They reference
-- engine records without making DCC part of the generic SEE catalogue.
CREATE TABLE IF NOT EXISTS public.hybrid_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  city_zone_eligibility JSONB NOT NULL DEFAULT '{"all_cities":true,"cities":[],"zones":[]}'::jsonb,
  vehicle_segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  validity_value INTEGER NOT NULL DEFAULT 1 CHECK (validity_value > 0),
  validity_unit VARCHAR(12) NOT NULL DEFAULT 'months' CHECK (validity_unit IN ('days','months','years')),
  billing_cycle VARCHAR(12) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','quarterly','annual')),
  dcc_config JSONB NOT NULL,
  see_config JSONB NOT NULL,
  credit_policy JSONB NOT NULL DEFAULT '{"expiry":"cycle_end","rollover":false}'::jsonb,
  activation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancellation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE,
  effective_to DATE,
  created_by VARCHAR(120) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_code, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hybrid_active_package_code ON public.hybrid_packages(package_code) WHERE status='active';

CREATE TABLE IF NOT EXISTS public.hybrid_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  package_id UUID NOT NULL REFERENCES public.hybrid_packages(id),
  package_version INTEGER NOT NULL,
  package_snapshot JSONB NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  location_id UUID REFERENCES public.service_locations(id),
  city VARCHAR(120), zone VARCHAR(120), vehicle_segment VARCHAR(80),
  price NUMERIC(12,2) NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(32) NOT NULL CHECK (status IN ('pending_provisioning','provisioning','active','provisioning_failed','cancellation_pending','cancelled','expired')),
  starts_at DATE NOT NULL, renews_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS public.hybrid_membership_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES public.hybrid_memberships(id),
  component_key VARCHAR(80) NOT NULL,
  engine VARCHAR(8) NOT NULL CHECK(engine IN ('DCC','SEE')),
  component_config JSONB NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','provisioning','provisioned','failed','cancelled')),
  engine_record_id UUID,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, component_key)
);
CREATE INDEX IF NOT EXISTS idx_hybrid_memberships_customer ON public.hybrid_memberships(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hybrid_components_health ON public.hybrid_membership_components(status, updated_at);
