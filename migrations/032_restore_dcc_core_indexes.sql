-- =========================================================================
-- CWP DATA APP - POSTGRESQL SCHEMA MIGRATION: 032_restore_dcc_core_indexes.sql
-- Module: Daily Car Cleaning (DCC) Core Operations Subsystem
-- Target Database: cwp_customer_db (Neon PostgreSQL)
-- Target Entities: public.subscriptions, public.subscription_vehicles, public.service_logs
-- Invariants:
--   1. DCC subscription represents customer eligibility; service_logs represents daily execution.
--   2. Exactly-once daily operational record per vehicle per operational date (Asia/Kolkata).
--   3. Subscriptions are decoupled from one-off service jobs and package redemptions.
--   4. Non-completion statuses (customer_absent, vehicle_not_available, skipped, unable_to_complete)
--      are permanently auditable and never conflated with completed cleans.
-- Safety: Pure DDL definition. Idempotent. Zero production data modifications.
-- =========================================================================

-- 1. Performance Indexes for DCC Subscriptions Lifecycle & Expiry Queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_status 
    ON public.subscriptions (customer_id, status) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_end_date 
    ON public.subscriptions (status, end_date) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_category_status 
    ON public.subscriptions (service_category_id, status) 
    WHERE deleted_at IS NULL;

-- 2. Performance Indexes for Subscription Vehicles
CREATE INDEX IF NOT EXISTS idx_sub_veh_vehicle 
    ON public.subscription_vehicles (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_sub_veh_sub_veh 
    ON public.subscription_vehicles (subscription_id, vehicle_id);

-- 3. Daily Execution Ledger Indexing & Concurrency Protection
-- uq_service_logs_daily_vehicle is already created by migration 001.
CREATE INDEX IF NOT EXISTS idx_service_logs_sub_date 
    ON public.service_logs (subscription_id, service_date) 
    WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_logs_status_date 
    ON public.service_logs (status, service_date);

CREATE INDEX IF NOT EXISTS idx_service_logs_staff_sub_date 
    ON public.service_logs (staff_id, service_date) 
    WHERE subscription_id IS NOT NULL;
