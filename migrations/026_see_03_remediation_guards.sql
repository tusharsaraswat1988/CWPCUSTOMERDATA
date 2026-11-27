-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 026_see_03_remediation_guards.sql
-- Module: SEE-03 Security & Integrity Remediation
-- Target Database: cwp_customer_db (Development Neon PostgreSQL)
-- =========================================================================

BEGIN;

-- 1. P2: Protect purchase_snapshots against DELETE as well as UPDATE
CREATE OR REPLACE FUNCTION public.prevent_purchase_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'purchase_snapshots cannot be deleted; commercial history is immutable';
    END IF;
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
    BEFORE UPDATE OR DELETE ON public.purchase_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_snapshot_mutation();

-- 2. P1: Compound ownership FKs on purchase_snapshots (vehicle & location must belong to customer)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ps_vehicle_customer') THEN
        ALTER TABLE public.purchase_snapshots
            ADD CONSTRAINT fk_ps_vehicle_customer
            FOREIGN KEY (vehicle_id, customer_id)
            REFERENCES public.vehicles(id, customer_id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ps_location_customer') THEN
        ALTER TABLE public.purchase_snapshots
            ADD CONSTRAINT fk_ps_location_customer
            FOREIGN KEY (location_id, customer_id)
            REFERENCES public.service_locations(id, customer_id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;
