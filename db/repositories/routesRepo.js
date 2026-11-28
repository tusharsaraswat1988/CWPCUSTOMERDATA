/**
 * Repository for DCC Route Planning (BRD v1.0)
 * Tables: public.routes, public.route_stops, public.route_temp_assignments
 */

'use strict';

const db = require('../index');

function getTodayIstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function createRoute({
  name,
  routeName,
  area = null,
  operationalArea = null,
  staffId = null,
  assignedStaffId = null,
  isActive = true
} = {}, client = null) {
  const runner = client || db;
  const effName = String(name || routeName || '').trim();
  if (!effName) {
    throw new Error('Route name is required.');
  }
  const effArea = (area !== undefined ? area : operationalArea) || null;
  const effStaffId = staffId !== undefined ? staffId : assignedStaffId;

  const res = await runner.query(
    `INSERT INTO public.routes (name, area, staff_id, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [effName, effArea ? String(effArea).trim() : null, effStaffId || null, Boolean(isActive)]
  );
  return res.rows[0];
}

async function getStopsByRouteId(routeId, { activeOnly = true, client = null } = {}) {
  if (!routeId) return [];
  const runner = client || db;
  const activeClause = activeOnly ? 'AND rs.is_active = TRUE' : '';
  const res = await runner.query(
    `SELECT rs.*,
            v.registration_no,
            v.seater_type,
            v.car_model,
            v.car_color,
            v.customer_id,
            v.location_id,
            c.name AS customer_name,
            c.name_hi AS customer_name_hi,
            c.phone AS customer_phone,
            c.customer_code,
            loc.label AS location_label,
            loc.address_text,
            loc.address_text_hi,
            loc.google_maps_url,
            loc.latitude,
            loc.longitude,
            loc.parking_details,
            b.frequency,
            b.start_date AS booking_start_date,
            b.end_date AS booking_end_date,
            b.status AS booking_status,
            b.package_id,
            p.name AS package_name
     FROM public.route_stops rs
     JOIN public.vehicles v ON rs.vehicle_id = v.id
     JOIN public.customers c ON v.customer_id = c.id
     JOIN public.service_locations loc ON v.location_id = loc.id
     LEFT JOIN public.bookings b ON rs.booking_id = b.id
     LEFT JOIN public.packages p ON b.package_id = p.id
     WHERE rs.route_id = $1 ${activeClause}
     ORDER BY rs.sequence_order ASC`,
    [routeId]
  );
  return res.rows;
}

async function findActiveTempAssignments({ routeId = null, istDate = null, client = null } = {}) {
  const runner = client || db;
  const targetDate = istDate || getTodayIstDate();
  const conditions = [
    'rta.is_active = TRUE',
    'rta.start_date <= $1::date',
    'rta.end_date >= $1::date'
  ];
  const params = [targetDate];
  if (routeId) {
    params.push(routeId);
    conditions.push(`rta.route_id = $${params.length}`);
  }

  const res = await runner.query(
    `SELECT rta.*,
            r.name AS route_name,
            orig.name AS original_staff_name,
            orig.staff_code AS original_staff_code,
            cov.name AS cover_staff_name,
            cov.staff_code AS cover_staff_code
     FROM public.route_temp_assignments rta
     JOIN public.routes r ON rta.route_id = r.id
     LEFT JOIN public.staff orig ON rta.original_staff_id = orig.id
     JOIN public.staff cov ON rta.cover_staff_id = cov.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY rta.created_at DESC`,
    params
  );
  return res.rows;
}

async function findById(id, { includeStops = true, istDate = null, client = null } = {}) {
  if (!id) return null;
  const runner = client || db;
  const res = await runner.query(
    `SELECT r.*,
            s.name AS staff_name,
            s.staff_code,
            s.phone AS staff_phone,
            s.can_dcc AS staff_can_dcc
     FROM public.routes r
     LEFT JOIN public.staff s ON r.staff_id = s.id
     WHERE r.id = $1
     LIMIT 1`,
    [id]
  );
  const route = res.rows[0] || null;
  if (!route) return null;

  const covers = await findActiveTempAssignments({ routeId: route.id, istDate, client: runner });
  route.active_cover = covers[0] || null;

  if (includeStops) {
    route.stops = await getStopsByRouteId(route.id, { activeOnly: true, client: runner });
    route.stop_count = route.stops.length;
  }
  return route;
}

async function findAll({
  staffId = null,
  activeOnly = true,
  search = null,
  includeStops = true,
  istDate = null,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (activeOnly) {
    conditions.push('r.is_active = TRUE');
  }
  if (staffId && staffId !== 'all') {
    params.push(staffId);
    conditions.push(`r.staff_id = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(r.name) LIKE $${idx} OR
      LOWER(COALESCE(r.area, '')) LIKE $${idx} OR
      LOWER(COALESCE(s.name, '')) LIKE $${idx}
    )`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await runner.query(
    `SELECT r.*,
            s.name AS staff_name,
            s.staff_code,
            s.phone AS staff_phone,
            COUNT(rs.id) FILTER (WHERE rs.is_active = TRUE)::int AS stop_count
     FROM public.routes r
     LEFT JOIN public.staff s ON r.staff_id = s.id
     LEFT JOIN public.route_stops rs ON rs.route_id = r.id
     ${where}
     GROUP BY r.id, s.id
     ORDER BY r.name ASC`,
    params
  );

  const routes = res.rows;
  const activeCovers = await findActiveTempAssignments({ istDate, client: runner });
  const coverByRouteId = new Map();
  for (const c of activeCovers) {
    if (!coverByRouteId.has(c.route_id)) {
      coverByRouteId.set(c.route_id, c);
    }
  }

  for (const r of routes) {
    r.active_cover = coverByRouteId.get(r.id) || null;
    if (includeStops) {
      r.stops = await getStopsByRouteId(r.id, { activeOnly: true, client: runner });
    }
  }
  return routes;
}

async function updateRoute(id, updates = {}, client = null) {
  if (!id) throw new Error('Route ID is required.');
  const runner = client || db;
  const fields = [];
  const params = [id];

  const effName = updates.name !== undefined ? updates.name : updates.routeName;
  if (effName !== undefined) {
    params.push(String(effName || '').trim());
    fields.push(`name = $${params.length}`);
  }
  const effArea = updates.area !== undefined ? updates.area : updates.operationalArea;
  if (effArea !== undefined) {
    params.push(effArea ? String(effArea).trim() : null);
    fields.push(`area = $${params.length}`);
  }
  const effStaffId = updates.staffId !== undefined ? updates.staffId : updates.assignedStaffId;
  if (effStaffId !== undefined) {
    params.push(effStaffId || null);
    fields.push(`staff_id = $${params.length}`);
  }
  if (updates.isActive !== undefined) {
    params.push(Boolean(updates.isActive));
    fields.push(`is_active = $${params.length}`);
  }
  fields.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.routes
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function assignStaff(routeId, staffId, client = null) {
  return updateRoute(routeId, { staffId }, client);
}

async function deleteRoute(id, client = null) {
  if (!id) return false;
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.routes WHERE id = $1', [id]);
  return res.rowCount > 0;
}

async function findActiveStopByVehicleId(vehicleId, client = null) {
  if (!vehicleId) return null;
  const runner = client || db;
  const res = await runner.query(
    `SELECT rs.*, r.name AS route_name, r.staff_id
     FROM public.route_stops rs
     JOIN public.routes r ON rs.route_id = r.id
     WHERE rs.vehicle_id = $1 AND rs.is_active = TRUE
     LIMIT 1`,
    [vehicleId]
  );
  return res.rows[0] || null;
}

async function recompactRouteStops(routeId, runner) {
  const stopsRes = await runner.query(
    `SELECT id FROM public.route_stops
     WHERE route_id = $1 AND is_active = TRUE
     ORDER BY sequence_order ASC, created_at ASC`,
    [routeId]
  );
  const ids = stopsRes.rows.map(r => r.id);
  for (let i = 0; i < ids.length; i++) {
    await runner.query(
      'UPDATE public.route_stops SET sequence_order = $1 WHERE id = $2',
      [1000000 + i + 1, ids[i]]
    );
  }
  for (let i = 0; i < ids.length; i++) {
    await runner.query(
      'UPDATE public.route_stops SET sequence_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [i + 1, ids[i]]
    );
  }
}

async function addStopToRoute({
  routeId,
  vehicleId,
  bookingId = null,
  sequenceOrder = null
} = {}, client = null) {
  if (!routeId || !vehicleId) {
    throw new Error('routeId and vehicleId are required.');
  }
  const runner = client || db;

  let seq = sequenceOrder;
  if (seq == null || isNaN(seq) || Number(seq) <= 0) {
    const maxRes = await runner.query(
      'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.route_stops WHERE route_id = $1 AND is_active = TRUE',
      [routeId]
    );
    seq = (parseInt(maxRes.rows[0]?.max_seq, 10) || 0) + 1;
  }

  const res = await runner.query(
    `INSERT INTO public.route_stops (route_id, vehicle_id, booking_id, sequence_order, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING *`,
    [routeId, vehicleId, bookingId || null, Number(seq)]
  );
  return res.rows[0];
}

async function removeStopFromRoute(stopId, client = null) {
  if (!stopId) return null;
  const execute = async (runner) => {
    const res = await runner.query(
      'DELETE FROM public.route_stops WHERE id = $1 RETURNING *',
      [stopId]
    );
    const removed = res.rows[0] || null;
    if (removed) {
      await recompactRouteStops(removed.route_id, runner);
    }
    return removed;
  };
  return client ? execute(client) : db.withTransaction(execute);
}

async function moveStopBetweenRoutes(stopId, targetRouteId, sequenceOrder = null, client = null) {
  if (!stopId || !targetRouteId) {
    throw new Error('stopId and targetRouteId are required.');
  }
  const execute = async (runner) => {
    const curRes = await runner.query('SELECT * FROM public.route_stops WHERE id = $1 LIMIT 1', [stopId]);
    const stop = curRes.rows[0];
    if (!stop) return null;
    const oldRouteId = stop.route_id;

    // Move stop to a guaranteed collision-free positive temporary sequence_order first
    // so uq_route_stops_active_seq never fires when moving to an occupied target position.
    const maxRes = await runner.query(
      'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.route_stops WHERE route_id = $1 AND is_active = TRUE',
      [targetRouteId]
    );
    const tempSeq = (parseInt(maxRes.rows[0]?.max_seq, 10) || 0) + 1000000;

    await runner.query(
      `UPDATE public.route_stops
       SET route_id = $2, sequence_order = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [stopId, targetRouteId, tempSeq]
    );

    if (oldRouteId !== targetRouteId) {
      await recompactRouteStops(oldRouteId, runner);
    }

    if (stop.is_active) {
      const targetStopsRes = await runner.query(
        `SELECT id FROM public.route_stops
         WHERE route_id = $1 AND is_active = TRUE AND id <> $2
         ORDER BY sequence_order ASC, created_at ASC`,
        [targetRouteId, stopId]
      );
      const orderedIds = targetStopsRes.rows.map(r => r.id);
      const requestedPos = sequenceOrder != null && !isNaN(sequenceOrder) && Number(sequenceOrder) > 0
        ? Number(sequenceOrder) - 1
        : orderedIds.length;
      const insertIdx = Math.min(Math.max(0, requestedPos), orderedIds.length);
      orderedIds.splice(insertIdx, 0, stopId);

      for (let i = 0; i < orderedIds.length; i++) {
        await runner.query(
          'UPDATE public.route_stops SET sequence_order = $1 WHERE id = $2',
          [1000000 + i + 1, orderedIds[i]]
        );
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await runner.query(
          'UPDATE public.route_stops SET sequence_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }
    } else {
      await recompactRouteStops(targetRouteId, runner);
    }

    const finalRes = await runner.query('SELECT * FROM public.route_stops WHERE id = $1 LIMIT 1', [stopId]);
    return finalRes.rows[0] || null;
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function reorderStops(routeId, orderedStopIds = [], client = null) {
  if (!routeId) throw new Error('Route ID is required.');
  if (!Array.isArray(orderedStopIds) || orderedStopIds.length === 0) return [];

  const execute = async (runner) => {
    // Use high positive offset because CHECK (sequence_order > 0) forbids negatives
    for (let i = 0; i < orderedStopIds.length; i++) {
      await runner.query(
        'UPDATE public.route_stops SET sequence_order = $1 WHERE id = $2 AND route_id = $3 AND is_active = TRUE',
        [1000000 + i + 1, orderedStopIds[i], routeId]
      );
    }
    const updated = [];
    for (let i = 0; i < orderedStopIds.length; i++) {
      const res = await runner.query(
        `UPDATE public.route_stops
         SET sequence_order = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND route_id = $3 AND is_active = TRUE
         RETURNING *`,
        [i + 1, orderedStopIds[i], routeId]
      );
      if (res.rows[0]) updated.push(res.rows[0]);
    }
    return updated;
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function findUnassignedDccVehicles(client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT v.*,
            c.name AS customer_name,
            c.phone AS customer_phone,
            loc.label AS location_label,
            loc.address_text,
            b.id AS booking_id,
            b.frequency,
            b.assigned_dcc_staff_id
     FROM public.vehicles v
     JOIN public.customers c ON v.customer_id = c.id
     JOIN public.service_locations loc ON v.location_id = loc.id
     LEFT JOIN public.bookings b ON b.vehicle_id = v.id AND b.status = 'active' AND b.assigned_dcc_staff_id IS NOT NULL
     WHERE v.deleted_at IS NULL
       AND v.is_active = TRUE
       AND c.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.route_stops rs
         WHERE rs.vehicle_id = v.id AND rs.is_active = TRUE
       )
     ORDER BY c.name ASC, v.registration_no ASC`
  );
  return res.rows;
}

async function createTempAssignment({
  routeId,
  originalStaffId = null,
  coverStaffId,
  startDate,
  endDate,
  reason = null
}, client = null) {
  if (!routeId || !coverStaffId || !startDate || !endDate) {
    throw new Error('routeId, coverStaffId, startDate, and endDate are required.');
  }
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.route_temp_assignments (
       route_id, original_staff_id, cover_staff_id, start_date, end_date, reason, is_active
     ) VALUES ($1, $2, $3, $4::date, $5::date, $6, TRUE)
     RETURNING *`,
    [routeId, originalStaffId || null, coverStaffId, startDate, endDate, reason ? String(reason).trim() : null]
  );
  return res.rows[0];
}

async function endTempAssignment(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.route_temp_assignments
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND is_active = TRUE
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function findRoutesForStaffOnDate(staffId, istDate = null, client = null) {
  const runner = client || db;
  const targetDate = istDate || getTodayIstDate();
  const res = await runner.query(
    `SELECT DISTINCT r.*,
            (rta.id IS NOT NULL AND rta.cover_staff_id = $1) AS is_temp_cover,
            rta.id AS temp_assignment_id,
            rta.original_staff_id,
            rta.start_date AS cover_start_date,
            rta.end_date AS cover_end_date
     FROM public.routes r
     LEFT JOIN public.route_temp_assignments rta
       ON rta.route_id = r.id
      AND rta.is_active = TRUE
      AND rta.start_date <= $2::date
      AND rta.end_date >= $2::date
     WHERE r.is_active = TRUE
       AND (
         rta.cover_staff_id = $1
         OR (r.staff_id = $1 AND rta.id IS NULL)
       )
     ORDER BY r.name ASC`,
    [staffId, targetDate]
  );
  return res.rows;
}

module.exports = {
  getTodayIstDate,
  createRoute,
  findById,
  findAll,
  updateRoute,
  assignStaff,
  deleteRoute,
  getStopsByRouteId,
  findActiveStopByVehicleId,
  addStopToRoute,
  addStop: addStopToRoute,
  removeStopFromRoute,
  removeStop: removeStopFromRoute,
  moveStopBetweenRoutes,
  reorderStops,
  findUnassignedDccVehicles,
  createTempAssignment,
  endTempAssignment,
  findActiveTempAssignments,
  findRoutesForStaffOnDate
};
