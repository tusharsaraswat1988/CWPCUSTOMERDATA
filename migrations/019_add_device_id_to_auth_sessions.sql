-- Migration 019: Add device_id to auth_sessions for Active Session Protection
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(100) NULL;
CREATE INDEX IF NOT EXISTS idx_session_staff_active ON public.auth_sessions (staff_id) WHERE revoked_at IS NULL;
