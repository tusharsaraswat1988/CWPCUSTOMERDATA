/**
 * Repository for Staff Location Tracking, In-House Spatial Calculations,
 * GPS Jitter/Glitch Filtering, Stoppage/Dwell Clustering, and Location Pings.
 * 
 * ZERO external API calls (pure in-house Haversine math).
 */
const db = require('../index');

// Constants for In-House Spatial Processing
const EARTH_RADIUS_METERS = 6371000;
const URBAN_ROAD_FACTOR = 1.35;    // Accounts for Varanasi street grid, winding alleys, detours & U-turns
const JITTER_DISTANCE_METERS = 15; // Ignore movement < 15m to eliminate stationary GPS drift
const MAX_URBAN_SPEED_KMH = 150;   // Discard impossible teleports / GPS glitches (> 150 km/h)
const STOPPAGE_CLUSTER_METERS = 35; // Maximum radius for stoppage cluster
const STOPPAGE_EXIT_METERS = 50;    // Departure radius to break out of stoppage
const MIN_STOPPAGE_DWELL_MINUTES = 2; // Minimum dwell time (minutes) to count as a stoppage

/**
 * Pure In-House Haversine Great-Circle Distance
 * Calculates distance between two coordinates in meters.
 * 
 * @param {number} lat1 Latitude of point 1 (degrees)
 * @param {number} lon1 Longitude of point 1 (degrees)
 * @param {number} lat2 Latitude of point 2 (degrees)
 * @param {number} lon2 Longitude of point 2 (degrees)
 * @returns {number} Distance in meters (rounded to 2 decimal places)
 */
function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (!Number.isFinite(nLat1) || !Number.isFinite(nLon1) ||
      !Number.isFinite(nLat2) || !Number.isFinite(nLon2)) {
    return 0;
  }

  if (nLat1 === nLat2 && nLon1 === nLon2) {
    return 0;
  }

  const toRad = Math.PI / 180;
  const dLat = (nLat2 - nLat1) * toRad;
  const dLon = (nLon2 - nLon1) * toRad;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(nLat1 * toRad) * Math.cos(nLat2 * toRad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.round(EARTH_RADIUS_METERS * c * 100) / 100;
}

/**
 * Real-world Road Distance Calculator
 * Bridges straight-line (Euclidean) air distance to realistic on-ground street network driving.
 * 
 * @param {number} lat1 Latitude of point 1 (degrees)
 * @param {number} lon1 Longitude of point 1 (degrees)
 * @param {number} lat2 Latitude of point 2 (degrees)
 * @param {number} lon2 Longitude of point 2 (degrees)
 * @returns {number} Road distance in meters
 */
function calculateRoadDistanceMeters(lat1, lon1, lat2, lon2) {
  const straight = calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2);
  return Math.round(straight * URBAN_ROAD_FACTOR * 100) / 100;
}

/**
 * Formats current date as YYYY-MM-DD in Asia/Kolkata timezone
 */
function getTodayIstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/**
 * Filters GPS jitter and glitch spikes.
 * 
 * @param {Object} prevPoint Previous GPS point { latitude, longitude, capturedAt }
 * @param {Object} newPoint New GPS point { latitude, longitude, capturedAt }
 * @returns {Object} { distanceIncrementMeters, isValid, isStationary, isGlitch, speedKmh, distMeters }
 */
function filterJitterAndGlitch(prevPoint, newPoint) {
  if (!prevPoint || !Number.isFinite(Number(prevPoint.latitude)) || !Number.isFinite(Number(prevPoint.longitude))) {
    return {
      distanceIncrementMeters: 0,
      isValid: true,
      isStationary: false,
      isGlitch: false,
      speedKmh: 0,
      distMeters: 0
    };
  }

  const distMeters = calculateHaversineDistanceMeters(
    prevPoint.latitude, prevPoint.longitude,
    newPoint.latitude, newPoint.longitude
  );

  const prevTime = new Date(prevPoint.capturedAt || prevPoint.lastSeenAt || Date.now()).getTime();
  const newTime = new Date(newPoint.capturedAt || Date.now()).getTime();
  const timeDeltaSec = Math.max(1, (newTime - prevTime) / 1000);
  const speedKmh = (distMeters / timeDeltaSec) * 3.6;

  // 1. Detect unrealistic GPS teleports/glitches (> 150 km/h in urban field operations)
  if (speedKmh > MAX_URBAN_SPEED_KMH && distMeters > 50) {
    return {
      distanceIncrementMeters: 0,
      isValid: false,
      isStationary: false,
      isGlitch: true,
      speedKmh: Math.round(speedKmh * 10) / 10,
      distMeters
    };
  }

  // 2. Detect stationary GPS jitter (< 15 meters)
  if (distMeters < JITTER_DISTANCE_METERS) {
    return {
      distanceIncrementMeters: 0,
      isValid: true,
      isStationary: true,
      isGlitch: false,
      speedKmh: Math.round(speedKmh * 10) / 10,
      distMeters
    };
  }

  // 3. Genuine movement
  const roadDistMeters = calculateRoadDistanceMeters(
    prevPoint.latitude, prevPoint.longitude,
    newPoint.latitude, newPoint.longitude
  );

  return {
    distanceIncrementMeters: roadDistMeters,
    isValid: true,
    isStationary: false,
    isGlitch: false,
    speedKmh: Math.round(speedKmh * 10) / 10,
    distMeters
  };
}

/**
 * Resolves staff identifier (UUID, staff_code, or phone) to canonical UUID.
 */
async function resolveStaffId(identifier, runner) {
  if (!identifier) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(identifier).trim());
  if (isUuid) return String(identifier).trim();

  const res = await runner.query(
    `SELECT id FROM public.staff 
     WHERE (UPPER(staff_code) = UPPER($1) OR phone = $1) AND deleted_at IS NULL 
     LIMIT 1`,
    [String(identifier).trim()]
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Evaluates stoppage / dwell clustering state.
 */
async function processStoppageState({ staffId, latitude, longitude, capturedAt, isStationary, runner }) {
  const fixTime = new Date(capturedAt).getTime();
  const todayDate = getTodayIstDate();

  // Find active stoppage for this staff member
  const activeRes = await runner.query(
    `SELECT * FROM public.staff_stoppages 
     WHERE staff_id = $1 AND is_active = TRUE 
     ORDER BY arrived_at DESC LIMIT 1`,
    [staffId]
  );
  const activeStoppage = activeRes.rows[0] || null;

  if (activeStoppage) {
    const distFromCentroid = calculateHaversineDistanceMeters(
      activeStoppage.latitude, activeStoppage.longitude,
      latitude, longitude
    );

    if (distFromCentroid <= STOPPAGE_EXIT_METERS) {
      // Continue dwelling at this stoppage
      const arrivedTime = new Date(activeStoppage.arrived_at).getTime();
      const dwellMinutes = Math.max(0, Math.round(((fixTime - arrivedTime) / 60000) * 10) / 10);

      await runner.query(
        `UPDATE public.staff_stoppages 
         SET dwell_minutes = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [dwellMinutes, activeStoppage.id]
      );

      return {
        stoppageId: activeStoppage.id,
        currentStatus: 'stopped',
        dwellMinutes
      };
    } else {
      // Departed the stoppage
      const arrivedTime = new Date(activeStoppage.arrived_at).getTime();
      const dwellMinutes = Math.max(0, Math.round(((fixTime - arrivedTime) / 60000) * 10) / 10);

      if (dwellMinutes < MIN_STOPPAGE_DWELL_MINUTES) {
        // Departed before reaching minimum dwell duration (e.g. traffic light / brief stop)
        // Clean up this non-formal stoppage so it does not distort stoppage count or dwell metrics
        await runner.query(
          `DELETE FROM public.staff_stoppages WHERE id = $1`,
          [activeStoppage.id]
        );
      } else {
        await runner.query(
          `UPDATE public.staff_stoppages 
           SET is_active = FALSE, departed_at = $1, dwell_minutes = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [new Date(capturedAt), dwellMinutes, activeStoppage.id]
        );
      }

      return {
        stoppageId: null,
        currentStatus: 'moving',
        dwellMinutes
      };
    }
  }

  // If no active stoppage, check if the fix is stationary
  if (isStationary) {
    // Try to find a nearby customer service location (within 120m) for descriptive stoppage name
    let matchedCustomerId = null;
    let addressText = `Location (${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)})`;

    try {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const nearCust = await runner.query(
        `SELECT sl.customer_id, sl.address_text, sl.latitude, sl.longitude, c.name AS customer_name
         FROM public.service_locations sl
         JOIN public.customers c ON sl.customer_id = c.id
         WHERE sl.deleted_at IS NULL
           AND sl.latitude IS NOT NULL AND sl.longitude IS NOT NULL
           AND sl.latitude BETWEEN $1 - 0.002 AND $1 + 0.002
           AND sl.longitude BETWEEN $2 - 0.002 AND $2 + 0.002
         ORDER BY (POWER(sl.latitude - $1, 2) + POWER(sl.longitude - $2, 2)) ASC
         LIMIT 5`,
        [lat, lng]
      );

      for (const loc of nearCust.rows) {
        const d = calculateHaversineDistanceMeters(lat, lng, loc.latitude, loc.longitude);
        if (d <= 120) {
          matchedCustomerId = loc.customer_id;
          addressText = `${loc.customer_name} - ${loc.address_text || 'Varanasi'}`;
          break;
        }
      }
    } catch (e) {
      // Non-critical, ignore error
    }

    const newStop = await runner.query(
      `INSERT INTO public.staff_stoppages (
         staff_id, latitude, longitude, address_text, matched_customer_id,
         arrived_at, dwell_minutes, is_active, stoppage_date
       ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, TRUE, $7)
       RETURNING id`,
      [staffId, latitude, longitude, addressText, matchedCustomerId, new Date(capturedAt), todayDate]
    );

    return {
      stoppageId: newStop.rows[0].id,
      currentStatus: 'stopped',
      dwellMinutes: 0
    };
  }

  return {
    stoppageId: null,
    currentStatus: 'moving',
    dwellMinutes: 0
  };
}

/**
 * Records a staff GPS heartbeat or ping response breadcrumb.
 * 
 * @param {string} staffIdentifier UUID, staff_code, or phone
 * @param {Object} data Location telemetry payload
 * @param {Object} [client] Optional DB client/transaction runner
 */
async function recordLocation(staffIdentifier, data, client = null) {
  const runner = client || db;

  const staffId = await resolveStaffId(staffIdentifier, runner);
  if (!staffId) {
    throw new Error(`Staff not found for identifier: ${staffIdentifier}`);
  }

  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const accuracy = data.accuracy !== undefined && data.accuracy !== null ? parseFloat(data.accuracy) : null;
  const altitude = data.altitude !== undefined && data.altitude !== null ? parseFloat(data.altitude) : null;
  const speed = data.speed !== undefined && data.speed !== null ? parseFloat(data.speed) : null;
  const heading = data.heading !== undefined && data.heading !== null ? parseFloat(data.heading) : null;
  const batteryLevel = data.batteryLevel !== undefined && data.batteryLevel !== null ? parseFloat(data.batteryLevel) : null;
  const isCharging = data.isCharging !== undefined && data.isCharging !== null ? Boolean(data.isCharging) : null;
  const triggerType = data.triggerType || data.trigger || 'heartbeat';
  const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();
  const todayDate = getTodayIstDate();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid GPS coordinates: latitude and longitude are required');
  }

  // 1. Insert granular breadcrumb
  await runner.query(
    `INSERT INTO public.staff_locations (
       staff_id, latitude, longitude, accuracy, altitude, speed, heading,
       battery_level, is_charging, trigger_type, captured_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      staffId, latitude, longitude, accuracy, altitude, speed, heading,
      batteryLevel, isCharging, triggerType, capturedAt
    ]
  );

  // 2. Fetch previous tracking state
  const prevRes = await runner.query(
    `SELECT *, tracking_date::text AS tracking_date_text FROM public.staff_tracking_current WHERE staff_id = $1 LIMIT 1`,
    [staffId]
  );
  const prevRow = prevRes.rows[0] || null;

  // 3. Jitter & Glitch Filter
  const prevPoint = prevRow ? {
    latitude: prevRow.last_latitude,
    longitude: prevRow.last_longitude,
    capturedAt: prevRow.last_seen_at
  } : null;

  const filterResult = filterJitterAndGlitch(prevPoint, { latitude, longitude, capturedAt });

  // 4. Stoppage & Dwell clustering
  const stoppageResult = await processStoppageState({
    staffId,
    latitude,
    longitude,
    capturedAt,
    isStationary: filterResult.isStationary,
    runner
  });

  // 5. Accumulate today's distance
  let newDistanceMeters = 0;
  if (prevRow) {
    const prevDateStr = prevRow.tracking_date_text || (prevRow.tracking_date instanceof Date ? 
      `${prevRow.tracking_date.getFullYear()}-${String(prevRow.tracking_date.getMonth() + 1).padStart(2, '0')}-${String(prevRow.tracking_date.getDate()).padStart(2, '0')}` : 
      String(prevRow.tracking_date || '').slice(0, 10));

    const isSameDay = prevDateStr === todayDate;

    if (isSameDay) {
      newDistanceMeters = parseFloat(prevRow.today_distance_meters || 0) + filterResult.distanceIncrementMeters;
    } else {
      newDistanceMeters = filterResult.distanceIncrementMeters;
    }
  } else {
    newDistanceMeters = filterResult.distanceIncrementMeters;
  }

  const effectiveStatus = stoppageResult.currentStatus || (speed && speed > 1 ? 'moving' : 'idle');

  // 6. Update or Insert Current State (O(1) lookup table)
  const upsertRes = await runner.query(
    `INSERT INTO public.staff_tracking_current (
       staff_id, last_latitude, last_longitude, last_accuracy, last_speed, last_heading,
       battery_level, is_charging, last_seen_at, current_status, today_distance_meters,
       tracking_date, current_stoppage_id, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
     )
     ON CONFLICT (staff_id) DO UPDATE SET
       last_latitude = EXCLUDED.last_latitude,
       last_longitude = EXCLUDED.last_longitude,
       last_accuracy = EXCLUDED.last_accuracy,
       last_speed = EXCLUDED.last_speed,
       last_heading = EXCLUDED.last_heading,
       battery_level = EXCLUDED.battery_level,
       is_charging = EXCLUDED.is_charging,
       last_seen_at = EXCLUDED.last_seen_at,
       current_status = EXCLUDED.current_status,
       today_distance_meters = EXCLUDED.today_distance_meters,
       tracking_date = EXCLUDED.tracking_date,
       current_stoppage_id = EXCLUDED.current_stoppage_id,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      staffId, latitude, longitude, accuracy, speed, heading,
      batteryLevel, isCharging, capturedAt, effectiveStatus, newDistanceMeters,
      todayDate, stoppageResult.stoppageId
    ]
  );

  // 7. Check if any pending ping exists for this staff
  const pendingPingRes = await runner.query(
    `SELECT id FROM public.staff_location_pings 
     WHERE staff_id = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP 
     ORDER BY requested_at DESC LIMIT 1`,
    [staffId]
  );
  const pendingPing = pendingPingRes.rows[0] || null;

  const todayDistanceKm = Math.round((newDistanceMeters / 1000) * 100) / 100;

  return {
    success: true,
    staffId,
    todayDistanceKm,
    status: effectiveStatus,
    hasPendingPing: Boolean(pendingPing),
    pendingPingId: pendingPing ? pendingPing.id : null,
    currentState: upsertRes.rows[0]
  };
}

/**
 * Records a verified customer job punch (e.g. Daily Car Clean or Service Job)
 * as an authoritative waypoint in staff movement, creating/updating stoppage and road distance.
 */
async function recordJobStop({
  staffId,
  latitude,
  longitude,
  accuracy = 15,
  addressText = 'Customer Service Stop',
  matchedCustomerId = null,
  completedAt = null,
  triggerType = 'job_punch',
  source = 'pwa_gps',
  client = null
}) {
  const runner = client || db;
  const resolvedId = await resolveStaffId(staffId, runner);
  if (!resolvedId) return null;

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const fixTime = completedAt ? new Date(completedAt) : new Date();
  const todayDate = getTodayIstDate();

  // 1. Insert into public.staff_locations as a verified waypoint
  await runner.query(
    `INSERT INTO public.staff_locations (
       staff_id, latitude, longitude, accuracy, speed, heading,
       trigger_type, captured_at
     ) VALUES ($1, $2, $3, $4, 0, NULL, $5, $6)`,
    [resolvedId, lat, lng, accuracy, triggerType, fixTime]
  );

  // 2. Calculate realistic road distance from previous point
  const prevRes = await runner.query(
    `SELECT *, tracking_date::text AS tracking_date_text FROM public.staff_tracking_current WHERE staff_id = $1 LIMIT 1`,
    [resolvedId]
  );
  const prevRow = prevRes.rows[0] || null;

  let distIncrement = 0;
  if (prevRow && Number.isFinite(Number(prevRow.last_latitude)) && Number.isFinite(Number(prevRow.last_longitude))) {
    const rawDist = calculateHaversineDistanceMeters(
      prevRow.last_latitude, prevRow.last_longitude,
      lat, lng
    );
    const prevTime = new Date(prevRow.last_seen_at || Date.now()).getTime();
    const timeDeltaSec = Math.max(1, (fixTime.getTime() - prevTime) / 1000);
    const speedKmh = (rawDist / timeDeltaSec) * 3.6;

    if (rawDist >= JITTER_DISTANCE_METERS && speedKmh <= MAX_URBAN_SPEED_KMH) {
      distIncrement = calculateRoadDistanceMeters(
        prevRow.last_latitude, prevRow.last_longitude,
        lat, lng
      );
    }
  }

  let newDistanceMeters = 0;
  if (prevRow) {
    const prevDateStr = prevRow.tracking_date_text || (prevRow.tracking_date instanceof Date ?
      `${prevRow.tracking_date.getFullYear()}-${String(prevRow.tracking_date.getMonth() + 1).padStart(2, '0')}-${String(prevRow.tracking_date.getDate()).padStart(2, '0')}` :
      String(prevRow.tracking_date || '').slice(0, 10));
    const isSameDay = prevDateStr === todayDate;
    newDistanceMeters = isSameDay ? (parseFloat(prevRow.today_distance_meters || 0) + distIncrement) : distIncrement;
  } else {
    newDistanceMeters = distIncrement;
  }

  // 3. Close any active stoppage and insert an authoritative stoppage for this car cleaning
  await runner.query(
    `UPDATE public.staff_stoppages 
     SET is_active = FALSE, departed_at = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE staff_id = $2 AND is_active = TRUE`,
    [fixTime, resolvedId]
  );

  const arrivedTime = new Date(fixTime.getTime() - (15 * 60 * 1000)); // Standard 15-min dwell for car clean
  const stoppageRes = await runner.query(
    `INSERT INTO public.staff_stoppages (
       staff_id, latitude, longitude, address_text, matched_customer_id,
       arrived_at, departed_at, dwell_minutes, is_active, stoppage_date
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 15.00, FALSE, $8)
     RETURNING id`,
    [resolvedId, lat, lng, addressText, matchedCustomerId, arrivedTime, fixTime, todayDate]
  );
  const stoppageId = stoppageRes.rows[0].id;

  // 4. Update staff_tracking_current
  await runner.query(
    `INSERT INTO public.staff_tracking_current (
       staff_id, last_latitude, last_longitude, last_accuracy, last_speed,
       last_seen_at, current_status, today_distance_meters,
       tracking_date, current_stoppage_id, updated_at
     ) VALUES (
       $1, $2, $3, $4, 0,
       $5, 'stopped', $6,
       $7, $8, CURRENT_TIMESTAMP
     )
     ON CONFLICT (staff_id) DO UPDATE SET
       last_latitude = EXCLUDED.last_latitude,
       last_longitude = EXCLUDED.last_longitude,
       last_accuracy = EXCLUDED.last_accuracy,
       last_speed = 0,
       last_seen_at = EXCLUDED.last_seen_at,
       current_status = 'stopped',
       today_distance_meters = EXCLUDED.today_distance_meters,
       tracking_date = EXCLUDED.tracking_date,
       current_stoppage_id = EXCLUDED.current_stoppage_id,
       updated_at = CURRENT_TIMESTAMP`,
    [resolvedId, lat, lng, accuracy, fixTime, newDistanceMeters, todayDate, stoppageId]
  );

  return {
    success: true,
    staffId: resolvedId,
    stoppageId,
    todayDistanceKm: Math.round((newDistanceMeters / 1000) * 100) / 100
  };
}

/**
 * Returns tracking summary for all staff, including KPIs and stoppages.
 * 
 * @param {string} [date] YYYY-MM-DD date string (defaults to today in IST)
 * @param {Object} [client] DB client
 */
async function getCurrentTrackingSummary(date = null, client = null) {
  const runner = client || db;
  const targetDate = date || getTodayIstDate();

  // 1. Fetch active staff with their current tracking snapshot
  const staffQuery = `
    SELECT 
      s.id AS staff_id,
      s.staff_code,
      s.name,
      s.phone,
      s.photo_url,
      stc.last_latitude AS latitude,
      stc.last_longitude AS longitude,
      stc.last_accuracy AS accuracy,
      stc.last_speed AS speed,
      stc.last_heading AS heading,
      stc.battery_level,
      stc.is_charging,
      stc.last_seen_at,
      stc.current_status,
      stc.today_distance_meters,
      stc.current_stoppage_id,
      stc.tracking_date
    FROM public.staff s
    LEFT JOIN public.staff_tracking_current stc ON s.id = stc.staff_id
    WHERE s.deleted_at IS NULL AND s.is_active = TRUE
    ORDER BY s.staff_code ASC
  `;
  const staffRes = await runner.query(staffQuery);

  // 1b. Fetch completed daily cleans count today by staff
  const cleansByStaff = {};
  try {
    const cleansRes = await runner.query(
      `SELECT staff_id, COUNT(id) AS total_cleans 
       FROM public.service_logs 
       WHERE service_date::date = $1::date AND status = 'completed'
       GROUP BY staff_id`,
      [targetDate]
    );
    for (const r of cleansRes.rows) {
      cleansByStaff[r.staff_id] = parseInt(r.total_cleans, 10) || 0;
    }
  } catch (e) {}

  // 2. Fetch stoppages for the target date
  const stoppagesQuery = `
    SELECT 
      st.id,
      st.staff_id,
      s.staff_code,
      s.name AS staff_name,
      st.latitude,
      st.longitude,
      st.address_text,
      st.matched_customer_id,
      st.arrived_at,
      st.departed_at,
      st.dwell_minutes,
      st.is_active,
      c.name AS customer_name
    FROM public.staff_stoppages st
    JOIN public.staff s ON st.staff_id = s.id
    LEFT JOIN public.customers c ON st.matched_customer_id = c.id
    WHERE st.stoppage_date = $1
      AND (st.dwell_minutes >= $2 OR st.is_active = TRUE)
    ORDER BY st.arrived_at DESC
  `;
  const stoppagesRes = await runner.query(stoppagesQuery, [targetDate, MIN_STOPPAGE_DWELL_MINUTES]);

  // Map stoppages by staff_id for quick count lookup
  const stoppagesByStaff = {};
  for (const stop of stoppagesRes.rows) {
    if (!stoppagesByStaff[stop.staff_id]) {
      stoppagesByStaff[stop.staff_id] = [];
    }
    stoppagesByStaff[stop.staff_id].push(stop);
  }

  // Calculate KPIs
  let totalDistanceMeters = 0;
  let activeCount = 0;
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

  const formattedStaff = staffRes.rows.map(row => {
    const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    const isRecentlyActive = lastSeenMs > twoHoursAgo;
    if (isRecentlyActive) activeCount++;

    const distMeters = row.today_distance_meters ? parseFloat(row.today_distance_meters) : 0;
    totalDistanceMeters += distMeters;

    const staffStops = stoppagesByStaff[row.staff_id] || [];
    const completedJobsCount = cleansByStaff[row.staff_id] || 0;
    const stopCount = Math.max(staffStops.length, completedJobsCount);

    // Derive status
    let status = row.current_status || 'idle';
    if (!lastSeenMs || (Date.now() - lastSeenMs) > 60 * 60 * 1000) {
      status = 'idle';
    }

    let lastLocText = 'वाराणसी (Varanasi)';
    if (staffStops.length > 0 && staffStops[0].address_text) {
      lastLocText = staffStops[0].address_text;
    } else if (row.latitude && row.longitude) {
      lastLocText = `फील्ड लोकेशन (${parseFloat(row.latitude).toFixed(3)}, ${parseFloat(row.longitude).toFixed(3)})`;
    } else {
      lastLocText = 'लोकेशन प्रतीक्षारत (No GPS)';
    }

    return {
      staffId: row.staff_id,
      staffCode: row.staff_code,
      name: row.name,
      phone: row.phone,
      photoUrl: row.photo_url,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      accuracy: row.accuracy ? parseFloat(row.accuracy) : null,
      speed: row.speed ? parseFloat(row.speed) : null,
      heading: row.heading ? parseFloat(row.heading) : null,
      batteryLevel: row.battery_level !== null ? parseFloat(row.battery_level) : null,
      isCharging: row.is_charging,
      status,
      lastSeenAt: row.last_seen_at,
      todayDistanceKm: Math.round((distMeters / 1000) * 100) / 100,
      stoppageCount: stopCount,
      completedJobsCount,
      lastLocationText: lastLocText
    };
  });

  const totalStoppages = Math.max(
    stoppagesRes.rows.length,
    Object.values(cleansByStaff).reduce((acc, v) => acc + v, 0)
  );
  let sumDwellMinutes = 0;
  for (const s of stoppagesRes.rows) {
    sumDwellMinutes += parseFloat(s.dwell_minutes || 0);
  }
  const avgDwellMinutes = totalStoppages > 0 ? Math.round((sumDwellMinutes / Math.max(1, stoppagesRes.rows.length)) * 10) / 10 : 0;

  const formattedStoppages = stoppagesRes.rows.map(s => ({
    id: s.id,
    staffId: s.staff_id,
    staffCode: s.staff_code,
    staffName: s.staff_name,
    latitude: parseFloat(s.latitude),
    longitude: parseFloat(s.longitude),
    addressText: s.address_text || (s.customer_name ? `${s.customer_name} Society` : 'Varanasi Service Stop'),
    customerName: s.customer_name || null,
    arrivedAt: s.arrived_at,
    departedAt: s.departed_at,
    dwellMinutes: parseFloat(s.dwell_minutes),
    isActive: Boolean(s.is_active)
  }));

  return {
    success: true,
    date: targetDate,
    kpis: {
      activeStaffCount: activeCount,
      totalStaffCount: staffRes.rows.length,
      fleetDistanceKm: Math.round((totalDistanceMeters / 1000) * 100) / 100,
      totalStoppages,
      avgDwellMinutes
    },
    staff: formattedStaff,
    stoppages: formattedStoppages
  };
}

/**
 * Returns movement history (breadcrumbs polyline) and stoppages for a staff member on a date.
 * 
 * @param {string} staffIdentifier Staff UUID or Code
 * @param {string} [date] YYYY-MM-DD
 * @param {Object} [client] DB client
 */
async function getMovementHistory(staffIdentifier, date = null, client = null) {
  const runner = client || db;
  const staffId = await resolveStaffId(staffIdentifier, runner);
  if (!staffId) {
    throw new Error(`Staff not found for identifier: ${staffIdentifier}`);
  }

  const targetDate = date || getTodayIstDate();

  // 1. Fetch breadcrumb points
  const crumbsRes = await runner.query(
    `SELECT id, latitude, longitude, accuracy, speed, heading, battery_level, trigger_type, captured_at
     FROM public.staff_locations
     WHERE staff_id = $1 AND captured_at::date = $2::date
     ORDER BY captured_at ASC`,
    [staffId, targetDate]
  );

  let breadcrumbs = crumbsRes.rows.map(r => ({
    id: r.id,
    lat: parseFloat(r.latitude),
    lng: parseFloat(r.longitude),
    accuracy: r.accuracy ? parseFloat(r.accuracy) : null,
    speed: r.speed ? parseFloat(r.speed) : null,
    heading: r.heading ? parseFloat(r.heading) : null,
    batteryLevel: r.battery_level ? parseFloat(r.battery_level) : null,
    trigger: r.trigger_type,
    time: r.captured_at
  }));

  // 2. Fetch stoppages for this staff member
  const stopRes = await runner.query(
    `SELECT id, latitude, longitude, address_text, arrived_at, departed_at, dwell_minutes, is_active
     FROM public.staff_stoppages
     WHERE staff_id = $1 AND stoppage_date = $2
       AND (dwell_minutes >= $3 OR is_active = TRUE)
     ORDER BY arrived_at ASC`,
    [staffId, targetDate, MIN_STOPPAGE_DWELL_MINUTES]
  );

  let stoppages = stopRes.rows.map(s => ({
    id: s.id,
    lat: parseFloat(s.latitude),
    lng: parseFloat(s.longitude),
    arrivedAt: s.arrived_at,
    departedAt: s.departed_at,
    dwellMinutes: parseFloat(s.dwell_minutes),
    locationText: s.address_text || 'Field Stop',
    isActive: Boolean(s.is_active)
  }));

  // 3. Fallback: If no stoppages recorded via heartbeat, load verified cleanings from service_logs
  if (stoppages.length === 0) {
    try {
      const logsRes = await runner.query(
        `SELECT sl.id, sl.punch_latitude AS latitude, sl.punch_longitude AS longitude,
                sl.completed_at_device AS arrived_at, sl.completed_at_device AS departed_at,
                15.0 AS dwell_minutes,
                COALESCE(c.name || ' (' || COALESCE(v.registration_no, 'गाड़ी') || ') - कार सफाई', 'कार सफाई (Daily Clean)') AS location_text
         FROM public.service_logs sl
         LEFT JOIN public.subscriptions sub ON sl.subscription_id = sub.id
         LEFT JOIN public.customers c ON sub.customer_id = c.id
         LEFT JOIN public.vehicles v ON sl.vehicle_id = v.id
         WHERE sl.staff_id = $1 AND sl.service_date::date = $2::date
         ORDER BY sl.completed_at_device ASC`,
        [staffId, targetDate]
      );
      if (logsRes.rows.length > 0) {
        stoppages = logsRes.rows.map(l => ({
          id: l.id,
          lat: l.latitude ? parseFloat(l.latitude) : 25.3176,
          lng: l.longitude ? parseFloat(l.longitude) : 82.9739,
          arrivedAt: l.arrived_at,
          departedAt: l.departed_at,
          dwellMinutes: 15.0,
          locationText: l.location_text,
          isActive: false
        }));
      }
    } catch (e) {}
  }

  // 4. Fallback: If breadcrumbs are sparse, enrich with job punch locations
  if (breadcrumbs.length < 2) {
    try {
      const logCrumbs = await runner.query(
        `SELECT sl.id, sl.punch_latitude AS latitude, sl.punch_longitude AS longitude,
                sl.completed_at_device AS captured_at
         FROM public.service_logs sl
         WHERE sl.staff_id = $1 AND sl.service_date::date = $2::date
           AND sl.punch_latitude IS NOT NULL AND sl.punch_longitude IS NOT NULL
         ORDER BY sl.completed_at_device ASC`,
        [staffId, targetDate]
      );
      if (logCrumbs.rows.length > 0) {
        breadcrumbs = logCrumbs.rows.map(r => ({
          id: r.id,
          lat: parseFloat(r.latitude),
          lng: parseFloat(r.longitude),
          accuracy: 15,
          speed: null,
          heading: null,
          batteryLevel: null,
          trigger: 'job_punch',
          time: r.captured_at
        }));
      }
    } catch (e) {}
  }

  return {
    success: true,
    staffId,
    date: targetDate,
    breadcrumbCount: breadcrumbs.length,
    breadcrumbs,
    stoppages
  };
}

/**
 * Creates an on-demand location ping request.
 * 
 * @param {string} staffIdentifier UUID or code
 * @param {string} requestedBy Admin user or name
 * @param {Object} [client] DB client
 */
async function createLocationPing(staffIdentifier, requestedBy = 'admin', client = null) {
  const runner = client || db;
  const staffId = await resolveStaffId(staffIdentifier, runner);
  if (!staffId) {
    throw new Error(`Staff not found for identifier: ${staffIdentifier}`);
  }

  const res = await runner.query(
    `INSERT INTO public.staff_location_pings (
       staff_id, requested_by, status, requested_at, expires_at
     ) VALUES (
       $1, $2, 'pending', CURRENT_TIMESTAMP, (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
     )
     RETURNING *`,
    [staffId, requestedBy]
  );

  return {
    success: true,
    pingId: res.rows[0].id,
    staffId,
    status: 'pending',
    requestedAt: res.rows[0].requested_at
  };
}

/**
 * Fulfills an on-demand location ping with fresh GPS coordinates from Staff PWA.
 * 
 * @param {string} pingId UUID of ping request
 * @param {Object} data GPS telemetry
 * @param {Object} [client] DB client
 */
async function fulfillLocationPing(pingId, data, client = null) {
  const runner = client || db;

  const pingRes = await runner.query(
    `SELECT * FROM public.staff_location_pings WHERE id = $1 LIMIT 1`,
    [pingId]
  );
  if (pingRes.rows.length === 0) {
    return { success: false, message: 'Ping request not found' };
  }

  const ping = pingRes.rows[0];
  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const accuracy = data.accuracy ? parseFloat(data.accuracy) : null;

  await runner.query(
    `UPDATE public.staff_location_pings 
     SET status = 'completed', latitude = $1, longitude = $2, accuracy = $3, responded_at = CURRENT_TIMESTAMP 
     WHERE id = $4`,
    [latitude, longitude, accuracy, pingId]
  );

  // Also record this high-accuracy fix as a breadcrumb and update state
  const locRecord = await recordLocation(ping.staff_id, {
    latitude,
    longitude,
    accuracy,
    speed: data.speed,
    heading: data.heading,
    batteryLevel: data.batteryLevel,
    isCharging: data.isCharging,
    triggerType: 'ping_response',
    capturedAt: new Date()
  }, runner);

  return {
    success: true,
    message: 'Location ping fulfilled',
    pingId,
    staffId: ping.staff_id,
    todayDistanceKm: locRecord.todayDistanceKm,
    status: locRecord.status
  };
}

/**
 * Retrieves active pending pings for a staff member.
 * 
 * @param {string} staffIdentifier Staff UUID or Code
 * @param {Object} [client] DB client
 */
async function getPendingPings(staffIdentifier, client = null) {
  const runner = client || db;
  const staffId = await resolveStaffId(staffIdentifier, runner);
  if (!staffId) return [];

  const res = await runner.query(
    `SELECT id, staff_id, requested_by, requested_at, expires_at 
     FROM public.staff_location_pings 
     WHERE staff_id = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP 
     ORDER BY requested_at DESC LIMIT 5`,
    [staffId]
  );

  return res.rows;
}

module.exports = {
  calculateHaversineDistanceMeters,
  calculateRoadDistanceMeters,
  filterJitterAndGlitch,
  recordLocation,
  recordJobStop,
  getCurrentTrackingSummary,
  getMovementHistory,
  createLocationPing,
  fulfillLocationPing,
  getPendingPings,
  resolveStaffId,
  getTodayIstDate
};
