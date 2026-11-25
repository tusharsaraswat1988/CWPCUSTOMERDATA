/**
 * =========================================================================
 * CWP Detailers & Motors - Route Management & Staff Route Sequence Service
 * Module: Task 01.5 — Route Management & Staff Route Sequence
 *
 * Core Invariants:
 * 1. Clean separation between Route, Route Assignment, Route Stop, and Sequence.
 * 2. DCC subscription eligibility remains governed by dccService (Task 01.4).
 *    Route assignment does NOT activate, extend, modify, or consume DCC subscriptions.
 * 3. Route stop changes do NOT create daily cleaning logs or service jobs.
 * 4. Staff reassignment preserves historical attribution: past service logs
 *    remain credited to the staff cleaner who actually performed the work.
 * 5. Sequence values within a route are unique, consistent, and contiguous (1..N).
 * 6. Staff cleaners can only access authorized routes assigned to them.
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');
const dccService = require('./dccService');
const staffCapabilityService = require('./staffCapabilityService');

function isNeonActive() {
  const isNeonConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isNeonConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_ROUTES_TEST);
}

// ---------------------------------------------------------------------------
// 1. ROUTE CRUD OPERATIONS
// ---------------------------------------------------------------------------

/**
 * Create a new operational Route
 */
async function createRoute({
  routeCode,
  routeName,
  description = null,
  operationalArea = null,
  assignedStaffId = null,
  status = 'active',
  adminUser = 'admin'
} = {}) {
  if (!routeCode || !routeName) {
    throw new Error('Route code and route name are required to create a route.');
  }

  const cleanCode = String(routeCode).trim().toUpperCase();
  const cleanName = String(routeName).trim();

  // Check code uniqueness
  const existing = await repos.routes.findByCode(cleanCode);
  if (existing) {
    throw new Error(`Route code '${cleanCode}' already exists.`);
  }

  // Validate staff if assigned
  let staffObj = null;
  if (assignedStaffId) {
    staffObj = await resolveStaff(assignedStaffId);
    if (!staffObj) {
      throw new Error(`Staff member '${assignedStaffId}' not found.`);
    }
    if (!staffObj.is_active) {
      throw new Error(`Cannot assign deactivated staff member '${staffObj.name}' to a route.`);
    }
  }

  const route = await repos.routes.createRoute({
    routeCode: cleanCode,
    routeName: cleanName,
    description,
    operationalArea,
    status,
    assignedStaffId: staffObj ? staffObj.id : null,
    createdBy: adminUser
  });

  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'routes',
      entityId: route.id,
      action: 'create_route',
      changedBy: adminUser,
      afterState: { routeCode: cleanCode, routeName: cleanName, assignedStaffId: staffObj?.id }
    });
  }

  return {
    ...route,
    success: true,
    message: `Route '${cleanCode} - ${cleanName}' created successfully.`
  };
}

/**
 * Get Route by ID with stops and assigned staff
 */
async function getRouteDetails(routeId) {
  if (!routeId) throw new Error('Route ID is required.');

  const route = await repos.routes.findById(routeId);
  if (!route) {
    throw new Error(`Route '${routeId}' not found.`);
  }

  const stops = await repos.routes.getStopsByRouteId(routeId);

  let staffObj = null;
  if (route.assigned_staff_id) {
    staffObj = await resolveStaff(route.assigned_staff_id);
  }

  return {
    ...route,
    assignedStaff: staffObj ? { id: staffObj.id, name: staffObj.name, staffCode: staffObj.staff_code, phone: staffObj.phone } : null,
    stopCount: stops.length,
    stops
  };
}

/**
 * List all Routes
 */
async function getAllRoutes(filters = {}) {
  const routes = await repos.routes.findAll(filters);
  return {
    success: true,
    count: routes.length,
    routes
  };
}

/**
 * Update Route metadata
 */
async function updateRoute(routeId, updates = {}, adminUser = 'admin') {
  if (!routeId) throw new Error('Route ID is required.');

  const route = await repos.routes.findById(routeId);
  if (!route) {
    throw new Error(`Route '${routeId}' not found.`);
  }

  const updated = await repos.routes.updateRoute(routeId, updates);

  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'routes',
      entityId: routeId,
      action: 'update_route',
      changedBy: adminUser,
      afterState: updates
    });
  }

  return {
    ...updated,
    success: true,
    message: `Route '${route.route_code}' updated successfully.`
  };
}

/**
 * Activate or Deactivate a Route
 */
async function setRouteStatus(routeId, status, adminUser = 'admin') {
  if (!routeId) throw new Error('Route ID is required.');
  const normStatus = String(status).toLowerCase().trim();
  if (!['active', 'inactive', 'archived'].includes(normStatus)) {
    throw new Error(`Invalid route status '${status}'. Must be active, inactive, or archived.`);
  }

  return updateRoute(routeId, { status: normStatus }, adminUser);
}

/**
 * Delete / Archive Route
 */
async function deleteRoute(routeId, adminUser = 'admin') {
  if (!routeId) throw new Error('Route ID is required.');

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);

  // If route has assigned staff, unassign first
  if (route.assigned_staff_id) {
    await unassignStaffFromRoute({ routeId, adminUser, reason: 'Route deleted/archived' });
  }

  await repos.routes.deleteRoute(routeId);

  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'routes',
      entityId: routeId,
      action: 'delete_route',
      changedBy: adminUser,
      afterState: { routeCode: route.route_code, deleted: true }
    });
  }

  return {
    success: true,
    message: `Route '${route.route_code}' deleted successfully.`
  };
}

// ---------------------------------------------------------------------------
// 2. STAFF ASSIGNMENT TO ROUTE
// ---------------------------------------------------------------------------

/**
 * Assign a Staff cleaner to an operational Route
 */
async function assignStaffToRoute({ routeId, staffId, adminUser = 'admin' }) {
  if (!routeId || !staffId) {
    throw new Error('Route ID and Staff ID are required.');
  }

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);
  if (route.status !== 'active') {
    throw new Error(`Cannot assign staff to inactive route '${route.route_code}'.`);
  }

  const staff = await resolveStaff(staffId);
  if (!staff) throw new Error(`Staff member '${staffId}' not found.`);
  if (!staff.is_active) {
    throw new Error(`Cannot assign deactivated staff member '${staff.name}' to route.`);
  }
  if (!staffCapabilityService.isDccEligible(staff)) {
    const eff = staffCapabilityService.getStaffEffectiveCapabilities(staff);
    throw new Error(`Cannot assign staff member '${staff.name}' to route: Staff is classified as '${eff.workType}' and is not authorized for Daily Car Cleaning.`);
  }

  // Prevent redundant assignment
  if (route.assigned_staff_id === staff.id) {
    return {
      success: true,
      idempotent: true,
      message: `Staff '${staff.name}' is already assigned to route '${route.route_code}'.`
    };
  }

  // Check if staff is already assigned to another active route (conflict check)
  const currentAssignedRoute = await repos.routes.findRouteByAssignedStaffId(staff.id);
  if (currentAssignedRoute && currentAssignedRoute.id !== route.id) {
    // Unassign from old route first to prevent duplicate active route assignments
    await unassignStaffFromRoute({
      routeId: currentAssignedRoute.id,
      adminUser,
      reason: `Reassigned to route '${route.route_code}'`
    });
  }

  // If route previously had another staff member, unassign them first
  if (route.assigned_staff_id && route.assigned_staff_id !== staff.id) {
    await unassignStaffFromRoute({
      routeId: route.id,
      adminUser,
      reason: `Replaced by ${staff.name}`
    });
  }

  // 1. Update Route assignee
  await repos.routes.updateRoute(routeId, { assignedStaffId: staff.id });

  // 2. Synchronize stops with staff_assignments and staff_route_sequences
  const stops = await repos.routes.getStopsByRouteId(routeId);
  for (const stop of stops) {
    if (stop.subscription_id && repos.staffAssignments && repos.staffAssignments.assignStaffToSubscription) {
      try {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: staff.id,
          subscriptionId: stop.subscription_id,
          assignedBy: adminUser
        });
      } catch (e) {
        // Non-fatal if local mock
      }
    }
  }

  // Mirror stop sequence to staff_route_sequences for backward compatibility
  await syncRouteStopsToStaffSequence(routeId, staff.id, adminUser);

  // 3. Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'routes',
      entityId: routeId,
      action: 'assign_staff_to_route',
      changedBy: adminUser,
      afterState: { staffId: staff.id, staffName: staff.name, routeCode: route.route_code }
    });
  }

  return {
    success: true,
    routeId,
    routeCode: route.route_code,
    staffId: staff.id,
    staffName: staff.name,
    stopCount: stops.length,
    message: `Staff member '${staff.name}' assigned to route '${route.route_code}' (${stops.length} stops).`
  };
}

/**
 * Unassign Staff from Route
 */
async function unassignStaffFromRoute({ routeId, adminUser = 'admin', reason = 'Admin unassignment' }) {
  if (!routeId) throw new Error('Route ID is required.');

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);

  const oldStaffId = route.assigned_staff_id;
  if (!oldStaffId) {
    return { success: true, message: 'Route had no assigned staff.' };
  }

  // 1. Remove assignee from route
  await repos.routes.updateRoute(routeId, { assignedStaffId: null });

  // 2. Unassign from staff_assignments for the route's subscriptions
  const stops = await repos.routes.getStopsByRouteId(routeId);
  for (const stop of stops) {
    if (stop.subscription_id && repos.staffAssignments && repos.staffAssignments.unassignSubscription) {
      try {
        await repos.staffAssignments.unassignSubscription({
          subscriptionId: stop.subscription_id,
          unassignedBy: adminUser,
          reason
        });
      } catch (e) {}
    }
  }

  // 3. Reset staff_route_sequences for old staff member
  if (repos.staffRouteSequences && repos.staffRouteSequences.resetStaffRoute) {
    try {
      await repos.staffRouteSequences.resetStaffRoute(oldStaffId);
    } catch (e) {}
  }

  // 4. Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'routes',
      entityId: routeId,
      action: 'unassign_staff_from_route',
      changedBy: adminUser,
      afterState: { oldStaffId, routeCode: route.route_code, reason }
    });
  }

  return {
    success: true,
    message: `Staff unassigned from route '${route.route_code}'.`
  };
}

// ---------------------------------------------------------------------------
// 3. ROUTE STOP MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Add an eligible DCC stop to a Route
 */
async function addStopToRoute(params = {}) {
  const {
    routeId,
    customerId,
    subscriptionId,
    vehicleId = null,
    subscriptionVehicleId = null,
    locationId = null,
    sequenceOrder = null,
    notes = null,
    adminUser = 'admin'
  } = params;
  if (!routeId || !subscriptionId || !customerId) {
    throw new Error('Route ID, Subscription ID, and Customer ID are required.');
  }

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);
  if (route.status !== 'active') {
    throw new Error(`Cannot add stops to inactive route '${route.route_code}'.`);
  }

  // 1. Enforce DCC Service Eligibility via Task 01.4 validator
  const eligCheck = await dccService.validateDccEligibility({
    subscriptionId,
    vehicleId,
    customerId
  });

  if (!eligCheck.eligible) {
    throw new Error(`Cannot add stop: ${eligCheck.reason}`);
  }

  // 2. Duplicate Check: Ensure stop is not already in an active route
  const existingActiveStop = await repos.routes.findActiveStopBySubscriptionAndVehicle(subscriptionId, vehicleId);
  if (existingActiveStop) {
    if (existingActiveStop.route_id === routeId) {
      return {
        success: true,
        idempotent: true,
        stop: existingActiveStop,
        message: `Stop is already enrolled on route '${route.route_code}'.`
      };
    }
    throw new Error(`Vehicle is already assigned to active route '${existingActiveStop.route_code}'. Move stop instead of adding duplicate.`);
  }

  // 3. Add Stop
  const stop = await repos.routes.addStopToRoute({
    ...params,
    routeId,
    subscriptionId,
    subscriptionVehicleId,
    vehicleId,
    customerId,
    locationId,
    sequenceOrder,
    notes
  });

  // 4. If Route has an assigned staff cleaner, link in staff_assignments
  if (route.assigned_staff_id && repos.staffAssignments && repos.staffAssignments.assignStaffToSubscription) {
    try {
      await repos.staffAssignments.assignStaffToSubscription({
        staffId: route.assigned_staff_id,
        subscriptionId,
        assignedBy: adminUser
      });
    } catch (e) {}

    // Mirror to staff sequence
    await syncRouteStopsToStaffSequence(routeId, route.assigned_staff_id, adminUser);
  }

  // 5. Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'route_stops',
      entityId: stop.id,
      action: 'add_route_stop',
      changedBy: adminUser,
      afterState: { routeId, subscriptionId, vehicleId, sequenceOrder: stop.sequence_order }
    });
  }

  return {
    ...stop,
    success: true,
    message: `Stop added to route '${route.route_code}' at sequence position #${stop.sequence_order}.`
  };
}

/**
 * Remove Stop from Route and compact remaining sequence
 */
async function removeStopFromRoute({ routeId, stopId, adminUser = 'admin', reason = 'Stop removed by admin' }) {
  if (!routeId || !stopId) {
    throw new Error('Route ID and Stop ID are required.');
  }

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);

  const stops = await repos.routes.getStopsByRouteId(routeId);
  const targetStop = stops.find(s => s.id === stopId);
  if (!targetStop) {
    throw new Error(`Stop '${stopId}' not found on route '${route.route_code}'.`);
  }

  // 1. Remove the stop
  await repos.routes.removeStopFromRoute(stopId);

  // 2. Compact remaining stops (1..N contiguous order)
  const remaining = stops.filter(s => s.id !== stopId);
  const remainingIds = remaining.map(s => s.id);
  await repos.routes.reorderStops(routeId, remainingIds);

  // 3. If route has assigned cleaner, update staff_assignments & staff_route_sequences
  if (route.assigned_staff_id) {
    // Check if subscription has any other stops on this route
    const hasOtherStops = remaining.some(s => s.subscription_id === targetStop.subscription_id);
    if (!hasOtherStops && repos.staffAssignments && repos.staffAssignments.unassignSubscription) {
      try {
        await repos.staffAssignments.unassignSubscription({
          subscriptionId: targetStop.subscription_id,
          unassignedBy: adminUser,
          reason: `Removed from route '${route.route_code}'`
        });
      } catch (e) {}
    }
    await syncRouteStopsToStaffSequence(routeId, route.assigned_staff_id, adminUser);
  }

  // 4. Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'route_stops',
      entityId: stopId,
      action: 'remove_route_stop',
      changedBy: adminUser,
      afterState: { routeId, removedStopId: stopId, reason }
    });
  }

  return {
    success: true,
    message: `Stop removed from route '${route.route_code}'. Remaining ${remaining.length} stops re-sequenced.`
  };
}

/**
 * Move a Stop from one Route to another
 */
async function moveStopBetweenRoutes({
  sourceRouteId,
  targetRouteId,
  stopId,
  targetSequenceOrder = null,
  adminUser = 'admin'
}) {
  if (!sourceRouteId || !targetRouteId || !stopId) {
    throw new Error('Source Route ID, Target Route ID, and Stop ID are required.');
  }

  if (sourceRouteId === targetRouteId) {
    throw new Error('Source route and target route cannot be identical.');
  }

  const sourceRoute = await repos.routes.findById(sourceRouteId);
  const targetRoute = await repos.routes.findById(targetRouteId);
  if (!sourceRoute || !targetRoute) {
    throw new Error('Both source and target routes must exist.');
  }
  if (targetRoute.status !== 'active') {
    throw new Error(`Cannot move stop to inactive target route '${targetRoute.route_code}'.`);
  }

  const sourceStops = await repos.routes.getStopsByRouteId(sourceRouteId);
  const targetStop = sourceStops.find(s => s.id === stopId);
  if (!targetStop) {
    throw new Error(`Stop '${stopId}' not found on source route '${sourceRoute.route_code}'.`);
  }

  // 1. Remove from source and compact source sequence
  await removeStopFromRoute({
    routeId: sourceRouteId,
    stopId,
    adminUser,
    reason: `Moved to route '${targetRoute.route_code}'`
  });

  let added;
  try {
    // 2. Add to target route
    added = await addStopToRoute({
      routeId: targetRouteId,
      customerId: targetStop.customer_id,
      subscriptionId: targetStop.subscription_id,
      vehicleId: targetStop.vehicle_id,
      subscriptionVehicleId: targetStop.subscription_vehicle_id,
      locationId: targetStop.location_id,
      sequenceOrder: targetSequenceOrder,
      notes: targetStop.notes,
      adminUser
    });
  } catch (err) {
    // Rollback: Re-insert stop back into source route with original sequence order to prevent orphan stop
    try {
      await repos.routes.addStopToRoute({
        routeId: sourceRouteId,
        subscriptionId: targetStop.subscription_id,
        subscriptionVehicleId: targetStop.subscription_vehicle_id,
        vehicleId: targetStop.vehicle_id,
        customerId: targetStop.customer_id,
        locationId: targetStop.location_id,
        sequenceOrder: targetStop.sequence_order,
        notes: targetStop.notes
      });
    } catch (rbErr) {
      console.error('[routeService] Rollback of stop transfer failed:', rbErr.message);
    }
    throw new Error(`Failed to transfer stop to target route '${targetRoute.route_code}'. Operation rolled back: ${err.message}`);
  }

  // 3. Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'route_stops',
      entityId: stopId,
      action: 'move_route_stop',
      changedBy: adminUser,
      afterState: { sourceRouteId, targetRouteId, stopId, newStopId: added.id }
    });
  }

  return {
    success: true,
    sourceRouteCode: sourceRoute.route_code,
    targetRouteCode: targetRoute.route_code,
    stopId: added.id,
    message: `Stop successfully transferred from '${sourceRoute.route_code}' to '${targetRoute.route_code}'.`
  };
}

// ---------------------------------------------------------------------------
// 4. ROUTE SEQUENCE MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * Reorder Stops within a Route (Atomic transaction, 1..N order)
 */
async function reorderRouteStops({ routeId, orderedStopIds = [], adminUser = 'admin' }) {
  if (!routeId) throw new Error('Route ID is required.');
  if (!Array.isArray(orderedStopIds) || orderedStopIds.length === 0) {
    throw new Error('Ordered stop IDs array is required.');
  }

  const route = await repos.routes.findById(routeId);
  if (!route) throw new Error(`Route '${routeId}' not found.`);

  const currentStops = await repos.routes.getStopsByRouteId(routeId);
  const currentIdSet = new Set(currentStops.map(s => s.id));

  // Validate all provided IDs belong to this route
  for (const sId of orderedStopIds) {
    if (!currentIdSet.has(sId)) {
      throw new Error(`Stop '${sId}' does not belong to route '${route.route_code}'.`);
    }
  }

  // Atomically update sequence order
  const updated = await repos.routes.reorderStops(routeId, orderedStopIds);

  // If route has assigned cleaner, mirror to staff_route_sequences
  if (route.assigned_staff_id) {
    await syncRouteStopsToStaffSequence(routeId, route.assigned_staff_id, adminUser);
  }

  // Audit Log
  if (isNeonActive() && repos.auditLogs && repos.auditLogs.logChange) {
    await repos.auditLogs.logChange({
      entityType: 'route_stops',
      entityId: routeId,
      action: 'reorder_route_sequence',
      changedBy: adminUser,
      afterState: { stopCount: updated.length }
    });
  }

  return {
    success: true,
    routeId,
    routeCode: route.route_code,
    updatedCount: updated.length,
    message: `Route '${route.route_code}' re-sequenced successfully (${updated.length} stops).`
  };
}

/**
 * Move a single stop position (up, down, top, bottom)
 */
async function moveStopInRoute({ routeId, stopId, direction = 'up', adminUser = 'admin' }) {
  if (!routeId || !stopId) throw new Error('Route ID and Stop ID are required.');

  const stops = await repos.routes.getStopsByRouteId(routeId);
  const idx = stops.findIndex(s => s.id === stopId);
  if (idx < 0) throw new Error(`Stop '${stopId}' not found on route.`);

  const stopIds = stops.map(s => s.id);
  const [removed] = stopIds.splice(idx, 1);

  if (direction === 'top') {
    stopIds.unshift(removed);
  } else if (direction === 'bottom') {
    stopIds.push(removed);
  } else if (direction === 'up') {
    const newIdx = Math.max(0, idx - 1);
    stopIds.splice(newIdx, 0, removed);
  } else if (direction === 'down') {
    const newIdx = Math.min(stopIds.length, idx + 1);
    stopIds.splice(newIdx, 0, removed);
  }

  return reorderRouteStops({ routeId, orderedStopIds: stopIds, adminUser });
}

// ---------------------------------------------------------------------------
// 5. UNASSIGNED WORK DETECTION
// ---------------------------------------------------------------------------

/**
 * Detect eligible active DCC customers/vehicles not assigned to any active route
 */
async function getUnassignedDccVehicles() {
  if (isNeonActive()) {
    const sql = `
      SELECT c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
             v.id AS vehicle_id, v.registration_no, v.brand_or_model, v.car_make, v.car_color,
             sub.id AS subscription_id, sub.package_name, sub.start_date, sub.end_date,
             loc.id AS location_id, loc.address_text, loc.google_maps_url, loc.parking_details
      FROM public.customers c
      JOIN public.subscriptions sub ON sub.customer_id = c.id
      JOIN public.subscription_vehicles sv ON sv.subscription_id = sub.id
      JOIN public.vehicles v ON sv.vehicle_id = v.id
      LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
      LEFT JOIN public.route_stops rs ON (rs.subscription_id = sub.id AND rs.vehicle_id = v.id)
      LEFT JOIN public.routes r ON rs.route_id = r.id AND r.status = 'active'
      WHERE sub.service_category_id = 'daily_car_cleaning'
        AND sub.status = 'active'
        AND sub.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND c.is_active = TRUE
        AND v.deleted_at IS NULL
        AND r.id IS NULL
      ORDER BY sub.created_at ASC
    `;
    const res = await db.query(sql);
    return {
      success: true,
      count: res.rows.length,
      unassigned: res.rows
    };
  }

  // Local fallback
  return {
    success: true,
    count: 0,
    unassigned: []
  };
}

// ---------------------------------------------------------------------------
// 6. STAFF ROUTE VIEW & DAILY WORKLIST (STAFF PORTAL INTEGRATION)
// ---------------------------------------------------------------------------

/**
 * Get authorized daily route worklist for a staff cleaner
 * Dynamically derived for an operational date in Asia/Kolkata
 */
async function getStaffRouteWorklist(staffCodeOrId, operationalDate = null) {
  if (!staffCodeOrId) throw new Error('Staff identifier is required.');

  const targetId = (typeof staffCodeOrId === 'object' && staffCodeOrId !== null)
    ? (staffCodeOrId.staffId || staffCodeOrId.staffCode || staffCodeOrId.id)
    : staffCodeOrId;
  const targetDate = ((typeof staffCodeOrId === 'object' && staffCodeOrId !== null && staffCodeOrId.date)
    ? staffCodeOrId.date
    : operationalDate) || dccService.getIstDate();

  if (!targetId) throw new Error('Staff identifier is required.');

  const staff = await resolveStaff(targetId);
  if (!staff) throw new Error(`Staff '${targetId}' not found.`);
  if (!staff.is_active) throw new Error('Staff account is deactivated.');

  if (!staffCapabilityService.isDccEligible(staff)) {
    const eff = staffCapabilityService.getStaffEffectiveCapabilities(staff);
    return {
      success: false,
      unauthorized: true,
      hasRoute: false,
      staffId: staff.id,
      staffName: staff.name,
      staffCode: staff.staff_code,
      workType: eff.workType,
      operationalDate: targetDate,
      error: `Staff member '${staff.name}' is classified as '${eff.workType}' and is not authorized for Daily Car Cleaning routes.`,
      totalStops: 0,
      stops: []
    };
  }

  // Find active route assigned to this staff member
  const route = await repos.routes.findRouteByAssignedStaffId(staff.id);
  if (!route) {
    return {
      success: true,
      hasRoute: false,
      staffId: staff.id,
      staffName: staff.name,
      staffCode: staff.staff_code,
      operationalDate: targetDate,
      message: 'No active route currently assigned.',
      totalStops: 0,
      completedCount: 0,
      nonCompletedCount: 0,
      pendingCount: 0,
      progressPercent: 0,
      stops: []
    };
  }

  // Fetch stops in sequence order
  const rawStops = await repos.routes.getStopsByRouteId(route.id);

  // Fetch today's service logs for this operational date across all cleaners
  // (Mid-route handover invariant: if another cleaner completed stops 1-5 prior to handover,
  // the incoming cleaner must see them as completed, not pending!)
  const todayLogs = await dccService.getDailyLogsForDate(targetDate, null);
  const logsByKey = new Map();
  for (const log of todayLogs) {
    const key = `${log.subscription_id}_${log.vehicle_id}`;
    logsByKey.set(key, log);
  }

  const enrichedStops = [];
  let completedCount = 0;
  let nonCompletedCount = 0;
  let pendingCount = 0;

  for (let idx = 0; idx < rawStops.length; idx++) {
    const stop = rawStops[idx];

    // Check DCC eligibility for operational date
    const eligCheck = await dccService.validateDccEligibility({
      subscriptionId: stop.subscription_id,
      vehicleId: stop.vehicle_id,
      customerId: stop.customer_id,
      operationalDate: targetDate
    });

    const isEligible = eligCheck.eligible;
    const logKey = `${stop.subscription_id}_${stop.vehicle_id}`;
    let log = logsByKey.get(logKey);
    if (!log) {
      log = await dccService.findDailyLog({
        subscriptionId: stop.subscription_id,
        vehicleId: stop.vehicle_id,
        operationalDate: targetDate
      });
    }

    const todayStatus = log ? log.status : 'pending';
    const isCompleted = (todayStatus === 'completed');
    const isNonCompletion = Boolean(log && todayStatus !== 'completed');
    const isPending = !log;

    if (isCompleted) {
      completedCount++;
    } else if (isNonCompletion) {
      nonCompletedCount++;
    } else {
      pendingCount++;
    }

    enrichedStops.push({
      stopId: stop.id,
      sequenceOrder: stop.sequence_order || (idx + 1),
      customerId: stop.customer_id,
      customerName: stop.customer_name,
      customerPhone: stop.customer_phone,
      subscriptionId: stop.subscription_id,
      vehicleId: stop.vehicle_id,
      registrationNo: stop.registration_no || 'Car',
      brandOrModel: stop.brand_or_model || '',
      carColor: stop.car_color || '',
      carMake: stop.car_make || '',
      locationName: stop.location_name || 'Home',
      locationAddress: stop.address_text || '',
      addressText: stop.address_text || '',
      googleMapsUrl: stop.google_maps_url || '',
      latitude: stop.latitude,
      longitude: stop.longitude,
      parkingDetails: stop.parking_details || '',
      instructions: stop.notes || '',
      notes: stop.notes || '',
      isEligible,
      ineligibleReason: isEligible ? null : eligCheck.reason,
      todayStatus,
      isCompleted,
      isNonCompletion,
      isPending,
      completedToday: isCompleted,
      completedAt: log?.completed_at_device || null,
      photoUrl: log?.photo_url || null,
      outcomeNotes: log?.notes || null
    });
  }

  const totalStops = enrichedStops.length;
  const cleaningCompletionPercent = totalStops > 0 ? Math.round((completedCount / totalStops) * 100) : 0;
  const visitCoveragePercent = totalStops > 0 ? Math.round(((completedCount + nonCompletedCount) / totalStops) * 100) : 0;
  const progressPercent = visitCoveragePercent; // backward compatibility
  const nextPendingIdx = enrichedStops.findIndex(s => s.isPending);

  return {
    success: true,
    hasRoute: true,
    routeId: route.id,
    routeCode: route.route_code,
    routeName: route.route_name,
    description: route.description,
    operationalArea: route.operational_area,
    staffId: staff.id,
    staffName: staff.name,
    staffCode: staff.staff_code,
    operationalDate: targetDate,
    totalStops,
    completedCount,
    nonCompletedCount,
    pendingCount,
    completedStops: completedCount,
    pendingStops: pendingCount,
    cleaningCompletionPercent,
    visitCoveragePercent,
    progressPercent,
    currentStopIndex: nextPendingIdx >= 0 ? nextPendingIdx : (totalStops > 0 ? totalStops - 1 : 0),
    currentStop: nextPendingIdx >= 0 ? enrichedStops[nextPendingIdx] : null,
    stops: enrichedStops
  };
}

/**
 * Backward compatible getStaffRouteView
 */
async function getStaffRouteView(staffCodeOrId, operationalDate = null) {
  return getStaffRouteWorklist(staffCodeOrId, operationalDate);
}

// ---------------------------------------------------------------------------
// 7. DAILY OPERATIONAL RECONCILIATION
// ---------------------------------------------------------------------------

/**
 * Compile Daily Operational Reconciliation across all active routes
 */
async function getDailyRouteReconciliation({ operationalDate = null, routeId = null, staffId = null, status = null } = {}) {
  const targetDate = operationalDate || dccService.getIstDate();

  // Fetch routes based on filters
  let routesList = await repos.routes.findAll({ status: 'all' });
  if (routeId && routeId !== 'all') {
    routesList = routesList.filter(r => r.id === routeId || r.route_code === routeId);
  }
  if (staffId && staffId !== 'all') {
    routesList = routesList.filter(r => r.assigned_staff_id === staffId);
  }

  const routeReconciliations = [];
  let totalStopsAll = 0;
  let totalCompletedAll = 0;
  let totalNonCompletedAll = 0;
  let totalPendingAll = 0;

  let assignedStopsAll = 0;
  let assignedCompletedAll = 0;
  let assignedNonCompletedAll = 0;
  let assignedPendingAll = 0;

  let fullyCompletedCount = 0;
  let partiallyCompletedCount = 0;
  let pendingRoutesCount = 0;
  let unassignedStaffRoutesCount = 0;
  let emptyRoutesCount = 0;

  for (const route of routesList) {
    const rawStops = await repos.routes.getStopsByRouteId(route.id);
    let staffObj = null;
    if (route.assigned_staff_id) {
      staffObj = await resolveStaff(route.assigned_staff_id);
    }

    let rCompleted = 0;
    let rNonCompleted = 0;
    let rPending = 0;
    const reconciledStops = [];

    for (let idx = 0; idx < rawStops.length; idx++) {
      const stop = rawStops[idx];
      const log = await dccService.findDailyLog({
        subscriptionId: stop.subscription_id,
        vehicleId: stop.vehicle_id,
        operationalDate: targetDate
      });

      const todayStatus = log ? log.status : 'pending';
      const isCompleted = (todayStatus === 'completed');
      const isNonCompletion = Boolean(log && todayStatus !== 'completed');
      const isPending = !log;

      if (isCompleted) rCompleted++;
      else if (isNonCompletion) rNonCompleted++;
      else rPending++;

      reconciledStops.push({
        stopId: stop.id,
        sequenceOrder: stop.sequence_order || (idx + 1),
        customerName: stop.customer_name,
        customerPhone: stop.customer_phone,
        registrationNo: stop.registration_no || 'Car',
        brandOrModel: stop.brand_or_model || '',
        locationAddress: stop.address_text || '',
        todayStatus,
        isCompleted,
        isNonCompletion,
        isPending,
        completedAt: log?.completed_at_device || null,
        photoUrl: log?.photo_url || null,
        notes: log?.notes || null
      });
    }

    const rTotal = rawStops.length;
    const rCleaningCompletion = rTotal > 0 ? Math.round((rCompleted / rTotal) * 100) : 0;
    const rVisitCoverage = rTotal > 0 ? Math.round(((rCompleted + rNonCompleted) / rTotal) * 100) : 0;
    const rProgress = rVisitCoverage;

    let recStatus = 'pending';
    if (!route.assigned_staff_id) {
      recStatus = 'unassigned_staff';
      unassignedStaffRoutesCount++;
      if (rTotal === 0) emptyRoutesCount++;
    } else if (rTotal === 0) {
      recStatus = 'empty_route';
      emptyRoutesCount++;
    } else if (rPending === 0 && (rCompleted + rNonCompleted > 0)) {
      recStatus = 'fully_completed';
      fullyCompletedCount++;
    } else if ((rCompleted + rNonCompleted > 0) && rPending > 0) {
      recStatus = 'partially_completed';
      partiallyCompletedCount++;
    } else {
      recStatus = 'pending';
      pendingRoutesCount++;
    }

    totalStopsAll += rTotal;
    totalCompletedAll += rCompleted;
    totalNonCompletedAll += rNonCompleted;
    totalPendingAll += rPending;

    if (route.assigned_staff_id) {
      assignedStopsAll += rTotal;
      assignedCompletedAll += rCompleted;
      assignedNonCompletedAll += rNonCompleted;
      assignedPendingAll += rPending;
    }

    const routeItem = {
      routeId: route.id,
      routeCode: route.route_code,
      routeName: route.route_name,
      operationalArea: route.operational_area,
      status: route.status,
      assignedStaff: staffObj ? { id: staffObj.id, name: staffObj.name, staffCode: staffObj.staff_code, phone: staffObj.phone } : null,
      totalStops: rTotal,
      completedCount: rCompleted,
      nonCompletedCount: rNonCompleted,
      pendingCount: rPending,
      cleaningCompletionPercent: rCleaningCompletion,
      visitCoveragePercent: rVisitCoverage,
      progressPercent: rProgress,
      reconciliationStatus: recStatus,
      stops: reconciledStops
    };

    // Filter by status if requested
    if (!status || status === 'all' || route.status === status || recStatus === status) {
      routeReconciliations.push(routeItem);
    }
  }

  // Get unassigned DCC vehicles
  const unassignedVehs = await getUnassignedDccVehicles();

  const overallCleaningCompletion = totalStopsAll > 0 ? Math.round((totalCompletedAll / totalStopsAll) * 100) : 0;
  const overallVisitCoverage = totalStopsAll > 0 ? Math.round(((totalCompletedAll + totalNonCompletedAll) / totalStopsAll) * 100) : 0;
  const staffCleaningCompletion = assignedStopsAll > 0 ? Math.round((assignedCompletedAll / assignedStopsAll) * 100) : 0;
  const staffVisitCoverage = assignedStopsAll > 0 ? Math.round(((assignedCompletedAll + assignedNonCompletedAll) / assignedStopsAll) * 100) : 0;

  return {
    success: true,
    operationalDate: targetDate,
    summary: {
      totalRoutes: routesList.length,
      fullyCompletedRoutes: fullyCompletedCount,
      partiallyCompletedRoutes: partiallyCompletedCount,
      pendingRoutes: pendingRoutesCount,
      unassignedStaffRoutes: unassignedStaffRoutesCount,
      emptyRoutes: emptyRoutesCount,
      emptyRoutesCount,
      totalStopsAllRoutes: totalStopsAll,
      totalCompletedAllRoutes: totalCompletedAll,
      totalNonCompletedAllRoutes: totalNonCompletedAll,
      totalPendingAllRoutes: totalPendingAll,
      cleaningCompletionPercent: overallCleaningCompletion,
      visitCoveragePercent: overallVisitCoverage,
      overallProgressPercent: overallVisitCoverage,
      assignedStopsTotal: assignedStopsAll,
      assignedCompletedTotal: assignedCompletedAll,
      assignedNonCompletedTotal: assignedNonCompletedAll,
      assignedPendingTotal: assignedPendingAll,
      staffCleaningCompletionPercent: staffCleaningCompletion,
      staffVisitCoveragePercent: staffVisitCoverage,
      unassignedDccVehiclesCount: unassignedVehs.count || 0
    },
    routes: routeReconciliations,
    unassignedDccVehicles: unassignedVehs.unassigned || []
  };
}

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

async function resolveStaff(staffCodeOrId) {
  if (!staffCodeOrId) return null;
  const target = String(staffCodeOrId).trim();

  let staff = null;
  if (repos.staff && repos.staff.findById) {
    staff = await repos.staff.findById(target);
  }
  if (!staff && repos.staff && repos.staff.findByStaffCode) {
    staff = await repos.staff.findByStaffCode(target);
  }
  return staff;
}

/**
 * Mirror Route Stops to table public.staff_route_sequences for backward compatibility
 */
async function syncRouteStopsToStaffSequence(routeId, staffId, updatedBy = 'admin') {
  if (!isNeonActive() || !repos.staffRouteSequences || !repos.staffRouteSequences.setStaffRoute) return;

  try {
    const stops = await repos.routes.getStopsByRouteId(routeId);
    const mapped = stops.map(s => ({
      subscriptionId: s.subscription_id,
      subscriptionVehicleId: s.subscription_vehicle_id,
      sequenceOrder: s.sequence_order
    }));
    await repos.staffRouteSequences.setStaffRoute(staffId, mapped, updatedBy);
  } catch (err) {
    console.warn(`[routeService] syncRouteStopsToStaffSequence non-fatal warning:`, err.message);
  }
}

module.exports = {
  createRoute,
  getRouteDetails,
  getAllRoutes,
  updateRoute,
  setRouteStatus,
  deleteRoute,
  assignStaffToRoute,
  unassignStaffFromRoute,
  addStopToRoute,
  addRouteStop: addStopToRoute,
  removeStopFromRoute,
  removeRouteStop: removeStopFromRoute,
  moveStopBetweenRoutes,
  reorderRouteStops,
  moveStopInRoute,
  getUnassignedDccVehicles,
  getStaffRouteView,
  getStaffRouteWorklist,
  getDailyRouteReconciliation
};
