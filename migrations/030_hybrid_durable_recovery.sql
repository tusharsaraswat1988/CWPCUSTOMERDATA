-- Durable provisioning attempts, bounded leases, and an append-only audit trail.
ALTER TABLE public.hybrid_membership_components
  ADD COLUMN IF NOT EXISTS failure_stage VARCHAR(40),
  ADD COLUMN IF NOT EXISTS error_category VARCHAR(40),
  ADD COLUMN IF NOT EXISTS safe_error_message TEXT,
  ADD COLUMN IF NOT EXISTS first_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

ALTER TABLE public.hybrid_membership_components
  DROP CONSTRAINT IF EXISTS hybrid_membership_components_status_check;
ALTER TABLE public.hybrid_membership_components
  ADD CONSTRAINT hybrid_membership_components_status_check
  CHECK (status IN ('pending','provisioning','active','provisioned','failed','retrying','reconciliation_required','cancelled'));
UPDATE public.hybrid_membership_components SET status='active' WHERE status='provisioned';

ALTER TABLE public.hybrid_memberships
  DROP CONSTRAINT IF EXISTS hybrid_memberships_status_check;
ALTER TABLE public.hybrid_memberships
  ADD CONSTRAINT hybrid_memberships_status_check
  CHECK (status IN ('pending_provisioning','provisioning','active','provisioning_failed','reconciliation_required','cancellation_pending','cancelled','expired'));

CREATE TABLE IF NOT EXISTS public.hybrid_membership_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES public.hybrid_memberships(id) ON DELETE RESTRICT,
  component_id UUID NULL REFERENCES public.hybrid_membership_components(id) ON DELETE RESTRICT,
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  error_category VARCHAR(40),
  safe_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor VARCHAR(120) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hybrid_events_membership ON public.hybrid_membership_events(membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hybrid_components_recovery ON public.hybrid_membership_components(status, next_retry_at, last_attempt_at);
