/**
 * =========================================================================
 * Repository: routesRepo.js
 * Module: Task 01.5 — Route Management & Staff Route Sequence
 * Tables: public.routes, public.route_stops
 * =========================================================================
 */

'use strict';

const crypto = require('crypto');
const db = require('../index');

// In-memory mock stores for isolated test / offline execution
let localRoutesStore = [];
let localRouteStopsStore = [];

function isNeonActive() {
  const isNeonConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isNeonConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_ROUTES_TEST);
}

function __resetLocalStores() {
  localRoutesStore = [];
  localRouteStopsStore = [];
}

/**
 * 1. Create a new Route
 */
async function createRoute({
  routeCode,
  routeName,
  description = null,
  operationalArea = null,
  status = 'active',
  assignedStaffId = null,
  createdBy = 'admin'
} = {}, client = null) {
  if (!routeCode || !routeName) {
    throw new Error('Route code and route name are required.');
  }

  const cleanCode = String(routeCode).trim().toUpperCase();
  const cleanName = String(routeName).trim();

  if (isNeonActive()) {
    const runner = client || db;
    const res = await runner.query(
      `INSERT INTO public.routes (
         route_code, route_name, description, operational_area, status, assigned_staff_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [cleanCode, cleanName, description, operationalArea, status, assignedStaffId, createdBy]
    );
    return res.rows[0];
  }

  // Local fallback
  const existing = localRoutesStore.find(r => r.route_code.toUpperCase() === cleanCode);
  if (existing) {
    throw new Error(`Route code '${cleanCode}' already exists.`);
  }

  const newRoute = {
    id: 'route_' + Date.now() + '_' + crypto.randomUUID().slice(0, 6),
    route_code: cleanCode,
    route_name: cleanName,
    description: description || '',
    operational_area: operationalArea || '',
    status: status || 'active',
    assigned_staff_id: assignedStaffId || null,
    created_by: createdBy || 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localRoutesStore.push(newRoute);
  return { ...newRoute };
}

/**
 * 2. Find Route by ID
 */
async function findById(id, client = null) {
  if (!id) return null;
  const target = String(id).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

  if (isNeonActive()) {
    if (!isUuid) {
      return findByCode(target, client);
    }
    const runner = client || db;
    const res = await runner.query(
      `SELECT r.*, s.name AS staff_name, s.staff_code, s.phone AS staff_phone
       FROM public.routes r
       LEFT JOIN public.staff s ON r.assigned_staff_id = s.id
       WHERE r.id = $1 LIMIT 1`,
      [target]
    );
    return res.rows[0] || null;
  }

  const route = localRoutesStore.find(r => r.id === target || (r.route_code && r.route_code.toUpperCase() === target.toUpperCase()));
  return route ? { ...route } : null;
}

/**
 * 3. Find Route by Route Code
 */
async function findByCode(routeCode, client = null) {
  if (!routeCode) return null;
  const clean = String(routeCode).trim().toUpperCase();

  if (isNeonActive()) {
    const runner = client || db;
    const res = await runner.query(
      `SELECT r.*, s.name AS staff_name, s.staff_code
       FROM public.routes r
       LEFT JOIN public.staff s ON r.assigned_staff_id = s.id
       WHERE UPPER(r.route_code) = $1 LIMIT 1`,
      [clean]
    );
    return res.rows[0] || null;
  }

  const route = localRoutesStore.find(r => r.route_code.toUpperCase() === clean);
  return route ? { ...route } : null;
}

/**
 * 4. Find all Routes with optional filtering
 */
async function findAll({ status = null, staffId = null, search = null } = {}, client = null) {
  if (isNeonActive()) {
    const runner = client || db;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    if (staffId && staffId !== 'all') {
      params.push(staffId);
      conditions.push(`r.assigned_staff_id = $${params.length}`);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term);
      const idx = params.length;
      conditions.push(`(
        LOWER(r.route_code) LIKE $${idx} OR
        LOWER(r.route_name) LIKE $${idx} OR
        LOWER(COALESCE(r.operational_area, '')) LIKE $${idx} OR
        LOWER(COALESCE(s.name, '')) LIKE $${idx}
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT r.*, 
             s.name AS staff_name, s.staff_code, s.phone AS staff_phone,
             COUNT(rs.id)::int AS stop_count
      FROM public.routes r
      LEFT JOIN public.staff s ON r.assigned_staff_id = s.id
      LEFT JOIN public.route_stops rs ON rs.route_id = r.id
      ${where}
      GROUP BY r.id, s.id
      ORDER BY r.route_code ASC
    `;
    const res = await runner.query(sql, params);
    return res.rows;
  }

  // Local fallback
  let list = [...localRoutesStore];

  if (status && status !== 'all') {
    list = list.filter(r => r.status === status);
  }

  if (staffId && staffId !== 'all') {
    list = list.filter(r => r.assigned_staff_id === staffId);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(r =>
      (r.route_code && r.route_code.toLowerCase().includes(q)) ||
      (r.route_name && r.route_name.toLowerCase().includes(q)) ||
      (r.operational_area && r.operational_area.toLowerCase().includes(q))
    );
  }

  return list.map(r => {
    const stopCount = localRouteStopsStore.filter(rs => rs.route_id === r.id).length;
    return {
      ...r,
      stop_count: stopCount
    };
  });
}

/**
 * 5. Update Route Details
 */
async function updateRoute(id, updates = {}, client = null) {
  if (!id) throw new Error('Route ID is required.');

  if (isNeonActive()) {
    const runner = client || db;
    const fields = [];
    const params = [id];

    if (updates.routeName !== undefined) {
      params.push(updates.routeName.trim());
      fields.push(`route_name = $${params.length}`);
    }
    if (updates.description !== undefined) {
      params.push(updates.description);
      fields.push(`description = $${params.length}`);
    }
    if (updates.operationalArea !== undefined) {
      params.push(updates.operationalArea);
      fields.push(`operational_area = $${params.length}`);
    }
    if (updates.status !== undefined) {
      params.push(updates.status);
      fields.push(`status = $${params.length}`);
    }
    if (updates.assignedStaffId !== undefined) {
      params.push(updates.assignedStaffId);
      fields.push(`assigned_staff_id = $${params.length}`);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const sql = `
      UPDATE public.routes
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const res = await runner.query(sql, params);
    return res.rows[0] || null;
  }

  // Local fallback
  const route = localRoutesStore.find(r => r.id === id);
  if (!route) return null;

  if (updates.routeName !== undefined) route.route_name = updates.routeName;
  if (updates.description !== undefined) route.description = updates.description;
  if (updates.operationalArea !== undefined) route.operational_area = updates.operationalArea;
  if (updates.status !== undefined) route.status = updates.status;
  if (updates.assignedStaffId !== undefined) route.assigned_staff_id = updates.assignedStaffId;
  route.updated_at = new Date().toISOString();

  return { ...route };
}

/**
 * 6. Delete Route
 */
async function deleteRoute(id, client = null) {
  if (!id) return false;

  if (isNeonActive()) {
    const runner = client || db;
    const res = await runner.query('DELETE FROM public.routes WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  const idx = localRoutesStore.findIndex(r => r.id === id);
  if (idx >= 0) {
    localRoutesStore.splice(idx, 1);
    localRouteStopsStore = localRouteStopsStore.filter(rs => rs.route_id !== id);
    return true;
  }
  return false;
}

/**
 * 7. Get Stops for a Route (strictly ordered by sequence_order ASC)
 */
async function getStopsByRouteId(routeId, client = null) {
  if (!routeId) return [];

  if (isNeonActive()) {
    const runner = client || db;
    const sql = `
      SELECT rs.*,
             c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
             v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
             loc.location_name, loc.address_text, loc.address_text_hi, loc.google_maps_url,
             loc.latitude, loc.longitude, loc.parking_details,
             sub.package_name, sub.status AS subscription_status, sub.start_date, sub.end_date
      FROM public.route_stops rs
      JOIN public.customers c ON rs.customer_id = c.id
      LEFT JOIN public.subscriptions sub ON rs.subscription_id = sub.id
      LEFT JOIN public.vehicles v ON rs.vehicle_id = v.id
      LEFT JOIN public.service_locations loc ON rs.location_id = loc.id
      WHERE rs.route_id = $1
      ORDER BY rs.sequence_order ASC
    `;
    const res = await runner.query(sql, [routeId]);
    return res.rows;
  }

  // Local fallback
  return localRouteStopsStore
    .filter(rs => rs.route_id === routeId)
    .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
    .map(rs => ({ ...rs }));
}

/**
 * 8. Add a Stop to a Route
 */
async function addStopToRoute(params = {}, client = null) {
  const {
    routeId,
    subscriptionId,
    subscriptionVehicleId = null,
    vehicleId = null,
    customerId,
    locationId = null,
    sequenceOrder = null,
    notes = null
  } = params;

  if (!routeId || !subscriptionId || !customerId) {
    throw new Error('Route ID, Subscription ID, and Customer ID are required.');
  }

  // Calculate target sequence order
  let seq = sequenceOrder;
  if (seq == null || isNaN(seq) || seq <= 0) {
    if (isNeonActive()) {
      const runner = client || db;
      const maxRes = await runner.query(
        'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.route_stops WHERE route_id = $1',
        [routeId]
      );
      seq = (parseInt(maxRes.rows[0]?.max_seq, 10) || 0) + 1;
    } else {
      const existing = localRouteStopsStore.filter(rs => rs.route_id === routeId);
      const maxSeq = existing.reduce((max, s) => Math.max(max, s.sequence_order || 0), 0);
      seq = maxSeq + 1;
    }
  }

  if (isNeonActive()) {
    const runner = client || db;
    const res = await runner.query(
      `INSERT INTO public.route_stops (
         route_id, subscription_id, subscription_vehicle_id, vehicle_id, customer_id, location_id, sequence_order, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [routeId, subscriptionId, subscriptionVehicleId, vehicleId, customerId, locationId, seq, notes]
    );
    return res.rows[0];
  }

  // Local fallback
  const newStop = {
    id: 'stop_' + Date.now() + '_' + crypto.randomUUID().slice(0, 6),
    route_id: routeId,
    subscription_id: subscriptionId,
    subscription_vehicle_id: subscriptionVehicleId,
    vehicle_id: vehicleId,
    customer_id: customerId,
    location_id: locationId,
    sequence_order: seq,
    notes: notes || '',
    customer_name: params.customerName || params.customer_name || 'Customer',
    customer_phone: params.customerPhone || params.customer_phone || '',
    registration_no: params.registrationNo || params.registration_no || 'Car',
    brand_or_model: params.brandOrModel || params.brand_or_model || '',
    car_color: params.carColor || params.car_color || '',
    car_make: params.carMake || params.car_make || '',
    location_name: params.locationName || params.location_name || 'Home',
    address_text: params.addressText || params.address_text || '',
    google_maps_url: params.googleMapsUrl || params.google_maps_url || '',
    parking_details: params.parkingDetails || params.parking_details || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localRouteStopsStore.push(newStop);
  return { ...newStop };
}

/**
 * 9. Remove Stop from Route
 */
async function removeStopFromRoute(stopId, client = null) {
  if (!stopId) return false;

  if (isNeonActive()) {
    const runner = client || db;
    const res = await runner.query('DELETE FROM public.route_stops WHERE id = $1 RETURNING *', [stopId]);
    return res.rows[0] || null;
  }

  const idx = localRouteStopsStore.findIndex(s => s.id === stopId);
  if (idx >= 0) {
    const removed = localRouteStopsStore.splice(idx, 1)[0];
    return removed;
  }
  return null;
}

/**
 * 10. Reorder Stops for a Route (Atomic transaction preserving 1..N order)
 */
async function reorderStops(routeId, orderedStopIds = [], client = null) {
  if (!routeId) throw new Error('Route ID is required.');
  if (!Array.isArray(orderedStopIds) || orderedStopIds.length === 0) return [];

  if (isNeonActive()) {
    const execute = async (c) => {
      // Step A: Set sequence orders to negative offset to avoid unique constraint collision
      for (let i = 0; i < orderedStopIds.length; i++) {
        await c.query(
          'UPDATE public.route_stops SET sequence_order = $1 WHERE id = $2 AND route_id = $3',
          [-(i + 1), orderedStopIds[i], routeId]
        );
      }
      // Step B: Set final positive sequence orders (1..N)
      const updated = [];
      for (let i = 0; i < orderedStopIds.length; i++) {
        const res = await c.query(
          'UPDATE public.route_stops SET sequence_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND route_id = $3 RETURNING *',
          [i + 1, orderedStopIds[i], routeId]
        );
        if (res.rows[0]) updated.push(res.rows[0]);
      }
      return updated;
    };

    if (client) {
      return execute(client);
    } else {
      return db.withTransaction(execute);
    }
  }

  // Local fallback
  const updated = [];
  orderedStopIds.forEach((sId, idx) => {
    const stop = localRouteStopsStore.find(s => s.id === sId && s.route_id === routeId);
    if (stop) {
      stop.sequence_order = idx + 1;
      stop.updated_at = new Date().toISOString();
      updated.push({ ...stop });
    }
  });

  return updated;
}

/**
 * 11. Find Route assigned to Staff
 */
async function findRouteByAssignedStaffId(staffId, client = null) {
  if (!staffId) return null;
  const target = String(staffId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

  if (isNeonActive()) {
    if (!isUuid) return null;
    const runner = client || db;
    const res = await runner.query(
      `SELECT * FROM public.routes 
       WHERE assigned_staff_id = $1 AND status = 'active'
       LIMIT 1`,
      [target]
    );
    return res.rows[0] || null;
  }

  const route = localRoutesStore.find(r => r.assigned_staff_id === target && r.status === 'active');
  return route ? { ...route } : null;
}

/**
 * 12. Find active stop by Subscription and Vehicle
 */
async function findActiveStopBySubscriptionAndVehicle(subscriptionId, vehicleId = null, client = null) {
  if (!subscriptionId) return null;

  if (isNeonActive()) {
    const runner = client || db;
    let sql = `
      SELECT rs.*, r.route_code, r.route_name, r.status AS route_status, r.assigned_staff_id
      FROM public.route_stops rs
      JOIN public.routes r ON rs.route_id = r.id
      WHERE rs.subscription_id = $1 AND r.status = 'active'
    `;
    const params = [subscriptionId];
    if (vehicleId) {
      params.push(vehicleId);
      sql += ` AND rs.vehicle_id = $${params.length}`;
    }
    sql += ' LIMIT 1';
    const res = await runner.query(sql, params);
    return res.rows[0] || null;
  }

  const foundStop = localRouteStopsStore.find(rs => {
    if (rs.subscription_id !== subscriptionId) return false;
    if (vehicleId && rs.vehicle_id !== vehicleId) return false;
    const r = localRoutesStore.find(rt => rt.id === rs.route_id);
    return r && r.status === 'active';
  });
  if (!foundStop) return null;
  const parentRoute = localRoutesStore.find(rt => rt.id === foundStop.route_id);
  return {
    ...foundStop,
    route_code: parentRoute?.route_code || null,
    route_name: parentRoute?.route_name || null,
    route_status: parentRoute?.status || null,
    assigned_staff_id: parentRoute?.assigned_staff_id || null
  };
}

module.exports = {
  createRoute,
  findById,
  findByCode,
  findAll,
  updateRoute,
  deleteRoute,
  getStopsByRouteId,
  addStopToRoute,
  addStop: addStopToRoute,
  removeStopFromRoute,
  removeStop: removeStopFromRoute,
  reorderStops,
  findRouteByAssignedStaffId,
  findActiveStopBySubscriptionAndVehicle,
  __resetLocalStores
};
