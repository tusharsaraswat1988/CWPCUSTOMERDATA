-- =========================================================================
-- Migration 027: P0 Completion Integrity, Idempotency & Staff Attribution
-- Purely additive and idempotent. Safe on existing data.
-- =========================================================================
BEGIN;

-- 1. Idempotency & single terminal execution guards on public.service_executions
ALTER TABLE public.service_executions
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_executions_client_mutation
  ON public.service_executions (client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_executions_terminal_job
  ON public.service_executions (job_id)
  WHERE outcome IN ('completed', 'partial_exception', 'failed', 'no_show', 'unable_to_complete');

-- 2. Allow atomic service_logs entries for admin-completed unassigned service_jobs
--    while keeping staff_id mandatory for Daily Car Cleaning (job_id IS NULL) logs.
ALTER TABLE public.service_logs
  ALTER COLUMN staff_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_service_logs_staff_or_job'
  ) THEN
    ALTER TABLE public.service_logs
      ADD CONSTRAINT chk_service_logs_staff_or_job
      CHECK (staff_id IS NOT NULL OR job_id IS NOT NULL);
  END IF;
END $$;

COMMIT;
