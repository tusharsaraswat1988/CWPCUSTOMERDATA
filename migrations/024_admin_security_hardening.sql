-- Migration 024: Admin Basic Security Hardening (Sessions, Trusted Devices, Security Events)

-- 1. Enhance auth_sessions with idle activity tracking & device metadata
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS device_label VARCHAR(120) NULL;
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS browser VARCHAR(80) NULL;
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS os VARCHAR(80) NULL;
ALTER TABLE public.auth_sessions ADD COLUMN IF NOT EXISTS trusted_device_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_session_admin_active ON public.auth_sessions (admin_id) WHERE revoked_at IS NULL AND user_type = 'admin';

-- 2. Admin Trusted Devices (cookie-based, hashed token only)
CREATE TABLE IF NOT EXISTS public.admin_trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    device_label VARCHAR(120) NOT NULL,
    browser VARCHAR(80) NOT NULL,
    os VARCHAR(80) NOT NULL,
    first_registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trust_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_hash ON public.admin_trusted_devices (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trusted_devices_admin ON public.admin_trusted_devices (admin_id) WHERE revoked_at IS NULL;

-- 3. Admin Security Activity Events (sanitized, human-readable)
CREATE TABLE IF NOT EXISTS public.admin_security_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor VARCHAR(100) NOT NULL DEFAULT 'admin',
    ip_address VARCHAR(45) NULL,
    browser VARCHAR(80) NULL,
    os VARCHAR(80) NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_sec_events_created ON public.admin_security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sec_events_type ON public.admin_security_events (event_type);
