-- =========================================================================
-- CWP DATA APP - MIGRATION 022
-- Module: Task 01.9 — Staff Designation, Hierarchy & Operational Authority
--
-- Description:
-- Establishes a system-wide organizational structure, designation taxonomy,
-- operational authority matrix, and reporting hierarchy for field staff.
-- Completely decoupled from Staff Service Capability (Task 01.8).
--
-- Rollback Strategy:
--   ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS chk_staff_not_self_manager;
--   ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS fk_staff_reports_to;
--   ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS fk_staff_designation;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS operational_scope;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS team_name;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS reports_to_id;
--   ALTER TABLE public.staff DROP COLUMN IF EXISTS designation_id;
--   DROP TABLE IF EXISTS public.staff_designations;
-- =========================================================================

-- 1. Create table public.staff_designations
CREATE TABLE IF NOT EXISTS public.staff_designations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_hi VARCHAR(100) NULL,
    description TEXT NULL,
    hierarchy_level INTEGER NOT NULL DEFAULT 1,
    is_supervisory BOOLEAN NOT NULL DEFAULT FALSE,
    authorities JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system_protected BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_designations_level ON public.staff_designations (hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_designations_active ON public.staff_designations (is_active);

-- 2. Seed Canonical Predefined Core Designations
INSERT INTO public.staff_designations (id, name, name_hi, description, hierarchy_level, is_supervisory, authorities, is_system_protected, is_active)
VALUES
    ('cleaner', 'Cleaner', 'सफाईकर्मी', 'Frontline cleaning operative responsible for doorstep vehicle cleaning and daily route execution.', 1, FALSE, '{"canViewTeam": false, "canAssignRoutes": false, "canReorderSequences": false, "canSuperviseJobs": false, "canManageStaff": false, "canApproveExceptions": false}'::jsonb, TRUE, TRUE),
    ('service_specialist', 'Service Specialist', 'सेवा विशेषज्ञ', 'Technical field specialist executing on-demand pressure washes, solar panel cleanings, and automotive detailing jobs.', 1, FALSE, '{"canViewTeam": false, "canAssignRoutes": false, "canReorderSequences": false, "canSuperviseJobs": false, "canManageStaff": false, "canApproveExceptions": false}'::jsonb, TRUE, TRUE),
    ('senior_cleaner', 'Senior Cleaner', 'वरिष्ठ सफाईकर्मी', 'Experienced operative handling primary route clusters and mentoring junior operatives.', 2, FALSE, '{"canViewTeam": false, "canAssignRoutes": false, "canReorderSequences": false, "canSuperviseJobs": false, "canManageStaff": false, "canApproveExceptions": false}'::jsonb, TRUE, TRUE),
    ('team_leader', 'Team Leader', 'टीम लीडर', 'Lead operative coordinating a squad of cleaners or specialists, monitoring daily progress and team adherence.', 3, TRUE, '{"canViewTeam": true, "canAssignRoutes": false, "canReorderSequences": false, "canSuperviseJobs": true, "canManageStaff": false, "canApproveExceptions": false}'::jsonb, TRUE, TRUE),
    ('supervisor', 'Field Supervisor', 'फील्ड सुपरवाइजर', 'Field supervisor with operational authority to manage teams, reorder route stop sequences, inspect work quality, and verify non-completion exceptions.', 4, TRUE, '{"canViewTeam": true, "canAssignRoutes": true, "canReorderSequences": true, "canSuperviseJobs": true, "canManageStaff": false, "canApproveExceptions": true}'::jsonb, TRUE, TRUE),
    ('zone_manager', 'Zone Manager', 'ज़ोन प्रबंधक', 'Operational manager with authority over a geographic zone, managing routes, team allocations, staff performance, and route creation.', 5, TRUE, '{"canViewTeam": true, "canAssignRoutes": true, "canReorderSequences": true, "canSuperviseJobs": true, "canManageStaff": true, "canApproveExceptions": true}'::jsonb, TRUE, TRUE),
    ('operations_manager', 'Operations Manager', 'परिचालन प्रबंधक', 'Senior operational leader overseeing all field zones, cross-zone routing, designation oversight, and broad operational policies.', 6, TRUE, '{"canViewTeam": true, "canAssignRoutes": true, "canReorderSequences": true, "canSuperviseJobs": true, "canManageStaff": true, "canApproveExceptions": true}'::jsonb, TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_hi = EXCLUDED.name_hi,
    description = EXCLUDED.description,
    hierarchy_level = EXCLUDED.hierarchy_level,
    is_supervisory = EXCLUDED.is_supervisory,
    authorities = EXCLUDED.authorities,
    is_system_protected = EXCLUDED.is_system_protected,
    updated_at = CURRENT_TIMESTAMP;

-- 3. Add designation_id, reports_to_id, team_name, and operational_scope to public.staff
ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS designation_id VARCHAR(64) NOT NULL DEFAULT 'cleaner',
    ADD COLUMN IF NOT EXISTS reports_to_id UUID NULL,
    ADD COLUMN IF NOT EXISTS team_name VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS operational_scope VARCHAR(150) NULL;

-- 4. Add Constraints and Indexes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_designation'
    ) THEN
        ALTER TABLE public.staff
            ADD CONSTRAINT fk_staff_designation
            FOREIGN KEY (designation_id) REFERENCES public.staff_designations(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_reports_to'
    ) THEN
        ALTER TABLE public.staff
            ADD CONSTRAINT fk_staff_reports_to
            FOREIGN KEY (reports_to_id) REFERENCES public.staff(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_staff_not_self_manager'
    ) THEN
        ALTER TABLE public.staff
            ADD CONSTRAINT chk_staff_not_self_manager
            CHECK (reports_to_id IS NULL OR reports_to_id != id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_designation ON public.staff (designation_id);
CREATE INDEX IF NOT EXISTS idx_staff_reports_to ON public.staff (reports_to_id);
CREATE INDEX IF NOT EXISTS idx_staff_team_name ON public.staff (team_name);

-- 5. Deterministic Backfill Strategy:
-- Existing staff default to 'cleaner' unless their work_type is 'services_only' (which defaults to 'service_specialist')
UPDATE public.staff
SET designation_id = 'service_specialist'
WHERE work_type = 'services_only' AND (designation_id IS NULL OR designation_id = 'cleaner');
