-- Add the engine-side reference and payment-reference uniqueness for hybrid sales.
ALTER TABLE public.hybrid_memberships
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hybrid_membership_payment_reference
  ON public.hybrid_memberships(payment_reference)
  WHERE payment_reference IS NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS hybrid_membership_id UUID NULL
    REFERENCES public.hybrid_memberships(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_hybrid_membership
  ON public.subscriptions(hybrid_membership_id)
  WHERE hybrid_membership_id IS NOT NULL;
