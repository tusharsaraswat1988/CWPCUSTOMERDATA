-- Renewal intent is durable before either engine is changed. Cancellation is
-- recorded as an end-of-current-term request until product policy is defined.
ALTER TABLE public.hybrid_packages
  ADD COLUMN IF NOT EXISTS renewal_policy JSONB NOT NULL
  DEFAULT '{"enabled":true,"renewal_window_days":30,"grace_period_days":0,"price_mode":"original_purchase_price"}'::jsonb;

ALTER TABLE public.hybrid_memberships
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE public.hybrid_memberships DROP CONSTRAINT IF EXISTS hybrid_memberships_status_check;
ALTER TABLE public.hybrid_memberships ADD CONSTRAINT hybrid_memberships_status_check
  CHECK (status IN ('pending_provisioning','provisioning','active','renewal_pending','provisioning_failed','reconciliation_required','cancellation_pending','cancelled','expired'));

CREATE TABLE IF NOT EXISTS public.hybrid_membership_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES public.hybrid_memberships(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  payment_reference VARCHAR(120),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end > period_start),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL,
  package_snapshot JSONB NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('pending','provisioning','active','failed','reconciliation_required')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_category VARCHAR(40),
  safe_error_message TEXT,
  initiated_by VARCHAR(120) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (membership_id, period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hybrid_renewal_payment_reference
  ON public.hybrid_membership_renewals(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hybrid_renewals_membership ON public.hybrid_membership_renewals(membership_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hybrid_membership_renewal_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.hybrid_membership_renewals(id) ON DELETE RESTRICT,
  component_key VARCHAR(80) NOT NULL,
  engine VARCHAR(8) NOT NULL CHECK (engine IN ('DCC','SEE')),
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','provisioning','active','failed','reconciliation_required')),
  engine_record_id UUID,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_category VARCHAR(40),
  safe_error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (renewal_id, component_key)
);
CREATE INDEX IF NOT EXISTS idx_hybrid_renewal_components_status ON public.hybrid_membership_renewal_components(status, updated_at);
