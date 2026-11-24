-- Migration 016: Add Admin Reason and Action Columns to service_logs
-- Enables admin status override (e.g. fixing mistaken "Car Not Present") and administrative audit tracking

ALTER TABLE public.service_logs
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS admin_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS admin_updated_by VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_service_logs_admin_updated_at
  ON public.service_logs (admin_updated_at)
  WHERE admin_updated_at IS NOT NULL;
