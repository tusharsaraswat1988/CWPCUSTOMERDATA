-- =========================================================================
-- CWP Detailers & Motors - Database Migration 020
-- Module: Task 01.5 — Route Management & Staff Route Sequence
-- Description: Introduces first-class Routes and Route Stops for DCC operations
-- PURE ARTIFACT — DO NOT EXECUTE ON LIVE PRODUCTION DATABASE
-- =========================================================================

-- 1. Routes Master Table
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_code VARCHAR(50) NOT NULL,
    route_name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    operational_area VARCHAR(150) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    assigned_staff_id UUID NULL REFERENCES public.staff(id) ON DELETE SET NULL,
    created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_route_status CHECK (status IN ('active', 'inactive', 'archived'))
);

-- Case-insensitive unique route_code
CREATE UNIQUE INDEX IF NOT EXISTS uq_routes_code_ci 
    ON public.routes (UPPER(TRIM(route_code)));

-- 2. Route Stops Table (Ordered Stops per Route)
CREATE TABLE IF NOT EXISTS public.route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    subscription_vehicle_id UUID NULL REFERENCES public.subscription_vehicles(id) ON DELETE SET NULL,
    vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    location_id UUID NULL REFERENCES public.service_locations(id) ON DELETE SET NULL,
    sequence_order INTEGER NOT NULL CHECK (sequence_order > 0),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_route_stop_sequence UNIQUE (route_id, sequence_order)
);

-- Compound unique index preventing duplicate stops of the same subscription & vehicle within a route
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_sub_veh_stop_entry
    ON public.route_stops (route_id, subscription_id, COALESCE(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_routes_status_staff ON public.routes (status, assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_seq ON public.route_stops (route_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_route_stops_sub ON public.route_stops (subscription_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_customer ON public.route_stops (customer_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_vehicle ON public.route_stops (vehicle_id);
