/**
 * Repository for Staff Location Tracking, In-House Spatial Calculations,
 * GPS Jitter/Glitch Filtering, Stoppage/Dwell Clustering, and Location Pings.
 * 
 * ZERO external API calls (pure in-house Haversine math).
 */
const db = require('../index');

// Constants for In-House Spatial Processing & Operational Intelligence
const EARTH_RADIUS_METERS = 6371000;
const JITTER_DISTANCE_METERS = 15; // Ignore movement < 15m to eliminate stationary GPS drift
const MAX_URBAN_SPEED_KMH = 150;   // Discard impossible teleports / GPS glitches (> 150 km/h)
const STOPPAGE_CLUSTER_METERS = 35; // Maximum radius for stoppage cluster
const STOPPAGE_EXIT_METERS = 50;    // Departure radius to break out of stoppage
const MIN_STOPPAGE_DWELL_MINUTES = 5; // Minimum dwell time (minutes) to count as a stoppage

// Phase 1 & Phase 4 Configurable Thresholds
const ACCURACY_GOOD_METERS = 20;
const ACCURACY_MODERATE_METERS = 50;
const GEOFENCE_ARRIVAL_METERS = 120;
const GEOFENCE_DEPARTURE_METERS = 200; // Hysteresis to prevent GPS bounce
const GEOFENCE_MAX_ACCURACY_METERS = 80;
const ROUTE_DEVIATION_METERS = 1500;
const ROUTE_REARM_METERS = 800;
const LOCATION_GAP_MINUTES = 45;
const WORK_HOUR_START_IST = 6;
const WORK_HOUR_END_IST = 21;

function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') {
    return false;
  }
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat === 0 && nLng === 0) return false;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
  return true;
}

function classifyAccuracy(accuracyMeters) {
  if (accuracyMeters === null || accuracyMeters === undefined || accuracyMeters === '') return 'unknown';
  const acc = Number(accuracyMeters);
  if (!Number.isFinite(acc) || acc < 0) return 'unknown';
  if (acc <= ACCURACY_GOOD_METERS) return 'good';
  if (acc <= ACCURACY_MODERATE_METERS) return 'moderate';
  return 'poor';
}

function classifyFreshness(lastSeenAt) {
  if (!lastSeenAt) return 'unavailable';
  const ts = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts)) return 'unavailable';
  const diffMin = Math.max(0, (Date.now() - ts) / 60000);
  if (diffMin <= 2) return 'live';
  if (diffMin <= 10) return 'recent';
  if (diffMin <= 30) return 'stale';
  return 'very_stale';
}

function getIstHour(dateObj = new Date()) {
  const hrStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false
  }).format(dateObj);
  return parseInt(hrStr, 10);
}

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
  return {
    distanceIncrementMeters: distMeters,
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

  const clientEventId = data.clientEventId ? String(data.clientEventId).slice(0, 100) : null;
  const deviceId = data.deviceId ? String(data.deviceId).slice(0, 100) : null;
  const appVersion = data.appVersion ? String(data.appVersion).slice(0, 40) : null;
  const networkType = data.networkType ? String(data.networkType).slice(0, 30) : null;
  const connectivityStatus = data.connectivityStatus ? String(data.connectivityStatus).slice(0, 20) : 'online';
  const permissionStatus = data.permissionStatus ? String(data.permissionStatus).slice(0, 30) : null;
  const accuracyTier = classifyAccuracy(accuracy);

  if (!isValidCoordinate(latitude, longitude) || isNaN(capturedAt.getTime())) {
    throw new Error('Invalid GPS coordinates: valid latitude, longitude, and capturedAt are required');
  }

  // 0. Idempotency check for offline queue retries
  if (clientEventId) {
    const dupRes = await runner.query(
      `SELECT id FROM public.staff_locations WHERE staff_id = $1 AND client_event_id = $2 LIMIT 1`,
      [staffId, clientEventId]
    );
    if (dupRes.rows.length > 0) {
      const curRes = await runner.query(
        `SELECT today_distance_meters, current_status FROM public.staff_tracking_current WHERE staff_id = $1 LIMIT 1`,
        [staffId]
      );
      const cur = curRes.rows[0] || {};
      return {
        success: true,
        duplicate: true,
        staffId,
        todayDistanceKm: Math.round(((parseFloat(cur.today_distance_meters || 0)) / 1000) * 100) / 100,
        status: cur.current_status || 'idle',
        hasPendingPing: false,
        pendingPingId: null
      };
    }
  }

  // 1. Fetch previous tracking state
  const prevRes = await runner.query(
    `SELECT *, tracking_date::text AS tracking_date_text FROM public.staff_tracking_current WHERE staff_id = $1 LIMIT 1`,
    [staffId]
  );
  const prevRow = prevRes.rows[0] || null;
  const prevSeenMs = prevRow && prevRow.last_seen_at ? new Date(prevRow.last_seen_at).getTime() : 0;
  const isHistorical = Boolean(prevRow && prevSeenMs && capturedAt.getTime() < prevSeenMs);

  // 2. Jitter & Glitch Filter (against previous point if chronological)
  const prevPoint = prevRow ? {
    latitude: prevRow.last_latitude,
    longitude: prevRow.last_longitude,
    capturedAt: prevRow.last_seen_at
  } : null;

  const filterResult = isHistorical
    ? { distanceIncrementMeters: 0, isValid: true, isStationary: false, isGlitch: false, speedKmh: 0, distMeters: 0 }
    : filterJitterAndGlitch(prevPoint, { latitude, longitude, capturedAt });

  const isValidFix = !filterResult.isGlitch;

  // 3. Insert granular breadcrumb (preserving capturedAt and server recorded_at)
  await runner.query(
    `INSERT INTO public.staff_locations (
       staff_id, latitude, longitude, accuracy, altitude, speed, heading,
       battery_level, is_charging, trigger_type, captured_at,
       client_event_id, device_id, app_version, network_type, connectivity_status,
       permission_status, is_valid_fix, accuracy_tier
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      staffId, latitude, longitude, accuracy, altitude, speed, heading,
      batteryLevel, isCharging, triggerType, capturedAt,
      clientEventId, deviceId, appVersion, networkType, connectivityStatus,
      permissionStatus, isValidFix, accuracyTier
    ]
  );

  // If glitch or historical offline replay, do NOT overwrite current live state
  if (isHistorical || filterResult.isGlitch) {
    const curDist = prevRow ? parseFloat(prevRow.today_distance_meters || 0) : 0;
    return {
      success: true,
      historical: isHistorical,
      glitchRejected: filterResult.isGlitch,
      staffId,
      todayDistanceKm: Math.round((curDist / 1000) * 100) / 100,
      status: prevRow ? prevRow.current_status : 'idle',
      hasPendingPing: false,
      pendingPingId: null
    };
  }

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

  // Device ID change detection
  const prevDeviceId = prevRow && prevRow.device_id ? prevRow.device_id : null;
  const deviceChanged = Boolean(deviceId && prevDeviceId && prevDeviceId !== deviceId);

  // 6. Update or Insert Current State (O(1) lookup table)
  const upsertRes = await runner.query(
    `INSERT INTO public.staff_tracking_current (
       staff_id, last_latitude, last_longitude, last_accuracy, last_speed, last_heading,
       battery_level, is_charging, last_seen_at, current_status, today_distance_meters,
       tracking_date, current_stoppage_id, updated_at,
       last_received_at, last_heartbeat_at, device_id, previous_device_id, device_changed_at,
       app_version, network_type, connectivity_status, permission_status, accuracy_tier
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $14, $15, $16,
       $17, $18, $19, $20, $21
     )
     ON CONFLICT (staff_id) DO UPDATE SET
       last_latitude = EXCLUDED.last_latitude,
       last_longitude = EXCLUDED.last_longitude,
       last_accuracy = EXCLUDED.last_accuracy,
       last_speed = EXCLUDED.last_speed,
       last_heading = EXCLUDED.last_heading,
       battery_level = COALESCE(EXCLUDED.battery_level, public.staff_tracking_current.battery_level),
       is_charging = COALESCE(EXCLUDED.is_charging, public.staff_tracking_current.is_charging),
       last_seen_at = EXCLUDED.last_seen_at,
       current_status = EXCLUDED.current_status,
       today_distance_meters = EXCLUDED.today_distance_meters,
       tracking_date = EXCLUDED.tracking_date,
       current_stoppage_id = EXCLUDED.current_stoppage_id,
       updated_at = CURRENT_TIMESTAMP,
       last_received_at = CURRENT_TIMESTAMP,
       last_heartbeat_at = CURRENT_TIMESTAMP,
       previous_device_id = CASE WHEN EXCLUDED.device_id IS NOT NULL AND public.staff_tracking_current.device_id IS NOT NULL AND EXCLUDED.device_id <> public.staff_tracking_current.device_id THEN public.staff_tracking_current.device_id ELSE public.staff_tracking_current.previous_device_id END,
       device_changed_at = CASE WHEN EXCLUDED.device_id IS NOT NULL AND public.staff_tracking_current.device_id IS NOT NULL AND EXCLUDED.device_id <> public.staff_tracking_current.device_id THEN CURRENT_TIMESTAMP ELSE public.staff_tracking_current.device_changed_at END,
       device_id = COALESCE(EXCLUDED.device_id, public.staff_tracking_current.device_id),
       app_version = COALESCE(EXCLUDED.app_version, public.staff_tracking_current.app_version),
       network_type = COALESCE(EXCLUDED.network_type, public.staff_tracking_current.network_type),
       connectivity_status = COALESCE(EXCLUDED.connectivity_status, public.staff_tracking_current.connectivity_status),
       permission_status = COALESCE(EXCLUDED.permission_status, public.staff_tracking_current.permission_status),
       accuracy_tier = EXCLUDED.accuracy_tier
     RETURNING *`,
    [
      staffId, latitude, longitude, accuracy, speed, heading,
      batteryLevel, isCharging, capturedAt, effectiveStatus, newDistanceMeters,
      todayDate, stoppageResult.stoppageId,
      deviceId, deviceChanged ? prevDeviceId : null, deviceChanged ? new Date() : null,
      appVersion, networkType, connectivityStatus, permissionStatus, accuracyTier
    ]
  );

  // 7. Phase 4 Operational Intelligence evaluation (non-blocking if any query fails)
  try {
    await evaluateOperationalIntelligence({
      staffId,
      latitude,
      longitude,
      accuracy,
      accuracyTier,
      capturedAt,
      prevRow,
      deviceChanged,
      prevDeviceId,
      deviceId,
      todayDate,
      runner
    });
  } catch (intelErr) {
    // Non-fatal: keep location recording reliable
  }

  // 8. Check if any pending ping exists for this staff
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
    accuracyTier,
    hasPendingPing: Boolean(pendingPing),
    pendingPingId: pendingPing ? pendingPing.id : null,
    currentState: upsertRes.rows[0]
  };
}

/**
 * Evaluates Phase 4 operational intelligence on incoming valid, chronological telemetry:
 * - Device change event
 * - Location gap recovery
 * - Job geofence arrival & departure (with hysteresis, never marks job completed)
 * - Route deviation & re-arm
 */
async function evaluateOperationalIntelligence({
  staffId, latitude, longitude, accuracy, accuracyTier,
  capturedAt, prevRow, deviceChanged, prevDeviceId, deviceId, todayDate, runner
}) {
  // 1. Device change alert
  if (deviceChanged) {
    await runner.query(
      `INSERT INTO public.staff_tracking_events (
         staff_id, event_type, severity, title, details, latitude, longitude, event_date, occurred_at, metadata
       ) VALUES ($1, 'device_changed', 'warning', 'Registered device changed', $2, $3, $4, $5, $6, $7)`,
      [
        staffId,
        `Device identifier changed from ${prevDeviceId} to ${deviceId}.`,
        latitude, longitude, todayDate, capturedAt,
        JSON.stringify({ previousDeviceId: prevDeviceId, newDeviceId: deviceId })
      ]
    );
  }

  // 2. Location gap detection / recovery during work hours (06:00 - 21:00 IST)
  if (prevRow && prevRow.last_seen_at) {
    const prevMs = new Date(prevRow.last_seen_at).getTime();
    const gapMin = (capturedAt.getTime() - prevMs) / 60000;
    const istHour = getIstHour(capturedAt);
    if (gapMin >= LOCATION_GAP_MINUTES && istHour >= WORK_HOUR_START_IST && istHour <= WORK_HOUR_END_IST) {
      await runner.query(
        `UPDATE public.staff_tracking_events
         SET is_active = FALSE, resolved_at = $1
         WHERE staff_id = $2 AND event_type = 'location_gap' AND is_active = TRUE`,
        [capturedAt, staffId]
      );
      await runner.query(
        `INSERT INTO public.staff_tracking_events (
           staff_id, event_type, severity, title, details, latitude, longitude, duration_minutes,
           is_active, event_date, occurred_at, resolved_at
         ) VALUES ($1, 'gap_recovery', 'info', 'Telemetry resumed after gap', $2, $3, $4, $5, FALSE, $6, $7, $7)`,
        [
          staffId,
          `Location updates resumed after ${Math.round(gapMin)} min gap (possible offline/permission/app inactivity).`,
          latitude, longitude, Math.round(gapMin), todayDate, capturedAt
        ]
      );
    }
  }

  // Only evaluate geofence & route deviation when GPS accuracy is acceptable
  const accSuitable = accuracy === null || accuracy <= GEOFENCE_MAX_ACCURACY_METERS;
  if (!accSuitable) return;

  // 3. Assigned jobs for today with valid service_locations
  const jobsRes = await runner.query(
    `SELECT j.id AS job_id, j.status, loc.latitude AS job_lat, loc.longitude AS job_lng,
            COALESCE(loc.address_text, c.name, 'Assigned Job') AS job_label
     FROM public.service_jobs j
     JOIN public.staff_assignments sa ON sa.job_id = j.id AND sa.staff_id = $1
     JOIN public.service_locations loc ON j.location_id = loc.id
     LEFT JOIN public.customers c ON j.customer_id = c.id
     WHERE j.deleted_at IS NULL
       AND j.scheduled_date = $2::date
       AND j.status NOT IN ('cancelled')
       AND loc.latitude IS NOT NULL AND loc.longitude IS NOT NULL`,
    [staffId, todayDate]
  );

  const referencePoints = [];
  for (const job of jobsRes.rows) {
    if (!isValidCoordinate(job.job_lat, job.job_lng)) continue;
    referencePoints.push({ lat: Number(job.job_lat), lng: Number(job.job_lng) });

    const dist = calculateHaversineDistanceMeters(latitude, longitude, job.job_lat, job.job_lng);
    const activeArrRes = await runner.query(
      `SELECT id FROM public.staff_tracking_events
       WHERE staff_id = $1 AND job_id = $2 AND event_type = 'geofence_arrival' AND is_active = TRUE AND event_date = $3
       LIMIT 1`,
      [staffId, job.job_id, todayDate]
    );

    if (dist <= GEOFENCE_ARRIVAL_METERS && activeArrRes.rows.length === 0) {
      await runner.query(
        `INSERT INTO public.staff_tracking_events (
           staff_id, job_id, event_type, severity, title, details, latitude, longitude,
           distance_meters, accuracy_meters, is_active, event_date, occurred_at
         ) VALUES ($1, $2, 'geofence_arrival', 'info', 'Arrived at job geofence', $3, $4, $5, $6, $7, TRUE, $8, $9)`,
        [
          staffId, job.job_id,
          `Detected within ${Math.round(dist)}m of ${job.job_label}.`,
          latitude, longitude, Math.round(dist), accuracy, todayDate, capturedAt
        ]
      );
    } else if (dist > GEOFENCE_DEPARTURE_METERS && activeArrRes.rows.length > 0) {
      await runner.query(
        `UPDATE public.staff_tracking_events SET is_active = FALSE, resolved_at = $1 WHERE id = $2`,
        [capturedAt, activeArrRes.rows[0].id]
      );
      await runner.query(
        `INSERT INTO public.staff_tracking_events (
           staff_id, job_id, event_type, severity, title, details, latitude, longitude,
           distance_meters, accuracy_meters, is_active, event_date, occurred_at
         ) VALUES ($1, $2, 'geofence_departure', 'info', 'Departed job geofence', $3, $4, $5, $6, $7, FALSE, $8, $9)`,
        [
          staffId, job.job_id,
          `Moved ${Math.round(dist)}m away from ${job.job_label}.`,
          latitude, longitude, Math.round(dist), accuracy, todayDate, capturedAt
        ]
      );
    }
  }

  // 4. Route stops for active assigned route
  const routeStopsRes = await runner.query(
    `SELECT loc.latitude AS stop_lat, loc.longitude AS stop_lng
     FROM public.routes r
     JOIN public.route_stops rs ON rs.route_id = r.id
     JOIN public.service_locations loc ON rs.location_id = loc.id
     WHERE r.assigned_staff_id = $1 AND r.status = 'active'
       AND loc.latitude IS NOT NULL AND loc.longitude IS NOT NULL`,
    [staffId]
  );
  for (const st of routeStopsRes.rows) {
    if (isValidCoordinate(st.stop_lat, st.stop_lng)) {
      referencePoints.push({ lat: Number(st.stop_lat), lng: Number(st.stop_lng) });
    }
  }

  // 5. Route deviation check (only if reference points exist and accuracy <= 50m)
  if (referencePoints.length > 0 && (accuracy === null || accuracy <= ACCURACY_MODERATE_METERS)) {
    let minDist = Infinity;
    for (const pt of referencePoints) {
      const d = calculateHaversineDistanceMeters(latitude, longitude, pt.lat, pt.lng);
      if (d < minDist) minDist = d;
    }

    const activeDevRes = await runner.query(
      `SELECT id FROM public.staff_tracking_events
       WHERE staff_id = $1 AND event_type = 'route_deviation' AND is_active = TRUE AND event_date = $2
       LIMIT 1`,
      [staffId, todayDate]
    );

    if (minDist > ROUTE_DEVIATION_METERS && activeDevRes.rows.length === 0) {
      await runner.query(
        `INSERT INTO public.staff_tracking_events (
           staff_id, event_type, severity, title, details, latitude, longitude,
           distance_meters, accuracy_meters, is_active, event_date, occurred_at
         ) VALUES ($1, 'route_deviation', 'warning', 'Outside assigned work area', $2, $3, $4, $5, $6, TRUE, $7, $8)`,
        [
          staffId,
          `Staff is ${Math.round(minDist)}m from nearest assigned route stop or job.`,
          latitude, longitude, Math.round(minDist), accuracy, todayDate, capturedAt
        ]
      );
    } else if (minDist <= ROUTE_REARM_METERS && activeDevRes.rows.length > 0) {
      await runner.query(
        `UPDATE public.staff_tracking_events SET is_active = FALSE, resolved_at = $1 WHERE id = $2`,
        [capturedAt, activeDevRes.rows[0].id]
      );
    }
  }
}

function computeJobVerification(staffLoc, job) {
  if (!job || !isValidCoordinate(job.jobLat, job.jobLng)) {
    return { verificationState: 'Not Verified', distanceMeters: null };
  }
  if (!isValidCoordinate(staffLoc.latitude, staffLoc.longitude)) {
    return { verificationState: 'Location Unavailable', distanceMeters: null };
  }
  const freshness = classifyFreshness(staffLoc.lastSeenAt);
  const dist = Math.round(calculateHaversineDistanceMeters(
    staffLoc.latitude, staffLoc.longitude, job.jobLat, job.jobLng
  ));
  if (freshness === 'stale' || freshness === 'very_stale' || freshness === 'unavailable') {
    return { verificationState: 'Location Stale', distanceMeters: dist };
  }
  if (staffLoc.accuracyTier === 'poor') {
    return { verificationState: 'Not Verified', distanceMeters: dist };
  }
  if (dist <= GEOFENCE_ARRIVAL_METERS) {
    return { verificationState: 'Verified Near Job', distanceMeters: dist };
  }
  if (dist <= 500) {
    return { verificationState: 'Approaching', distanceMeters: dist };
  }
  return { verificationState: 'Away From Job', distanceMeters: dist };
}

async function acknowledgeTrackingAlert(eventId, adminUser = 'admin', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.staff_tracking_events
     SET acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $1, is_active = FALSE
     WHERE id = $2
     RETURNING id, staff_id, event_type, acknowledged_at, acknowledged_by`,
    [adminUser, eventId]
  );
  if (res.rows.length === 0) {
    throw new Error('Tracking alert not found');
  }
  return { success: true, alert: res.rows[0] };
}

async function getStaffTrackingEvents(staffIdentifier = null, date = null, client = null) {
  const runner = client || db;
  const targetDate = date || getTodayIstDate();
  const params = [targetDate];
  let staffClause = '';
  if (staffIdentifier) {
    const sid = await resolveStaffId(staffIdentifier, runner);
    if (!sid) throw new Error(`Staff not found for identifier: ${staffIdentifier}`);
    params.push(sid);
    staffClause = ` AND e.staff_id = $2`;
  }
  const res = await runner.query(
    `SELECT e.*, s.staff_code, s.name AS staff_name
     FROM public.staff_tracking_events e
     JOIN public.staff s ON e.staff_id = s.id
     WHERE e.event_date = $1${staffClause}
     ORDER BY e.occurred_at DESC
     LIMIT 100`,
    params
  );
  return { success: true, date: targetDate, events: res.rows };
}

/**
 * Returns tracking summary for all staff, including KPIs, Phase 1 reliability,
 * and Phase 4 operational intelligence (job verification, analytics, alerts).
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
      stc.last_received_at,
      stc.last_heartbeat_at,
      stc.current_status,
      stc.today_distance_meters,
      stc.current_stoppage_id,
      stc.tracking_date,
      stc.device_id,
      stc.previous_device_id,
      stc.device_changed_at,
      stc.app_version,
      stc.network_type,
      stc.connectivity_status,
      stc.permission_status,
      stc.accuracy_tier
    FROM public.staff s
    LEFT JOIN public.staff_tracking_current stc ON s.id = stc.staff_id
    WHERE s.deleted_at IS NULL AND s.is_active = TRUE
    ORDER BY s.staff_code ASC
  `;
  const staffRes = await runner.query(staffQuery);

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

  const stoppagesByStaff = {};
  for (const stop of stoppagesRes.rows) {
    if (!stoppagesByStaff[stop.staff_id]) stoppagesByStaff[stop.staff_id] = [];
    stoppagesByStaff[stop.staff_id].push(stop);
  }

  // 3. Fetch today's assigned jobs & locations per staff
  const jobsRes = await runner.query(
    `SELECT sa.staff_id, j.id AS job_id, j.status, j.scheduled_time,
            c.name AS customer_name, loc.address_text, loc.latitude, loc.longitude
     FROM public.service_jobs j
     JOIN public.staff_assignments sa ON sa.job_id = j.id
     LEFT JOIN public.customers c ON j.customer_id = c.id
     LEFT JOIN public.service_locations loc ON j.location_id = loc.id
     WHERE j.deleted_at IS NULL AND j.scheduled_date = $1::date AND j.status NOT IN ('cancelled')
     ORDER BY j.sequence_order ASC NULLS LAST, j.created_at ASC`,
    [targetDate]
  );
  const jobsByStaff = {};
  for (const j of jobsRes.rows) {
    if (!jobsByStaff[j.staff_id]) jobsByStaff[j.staff_id] = [];
    jobsByStaff[j.staff_id].push({
      jobId: j.job_id,
      status: j.status,
      scheduledTime: j.scheduled_time || null,
      customerName: j.customer_name || 'Customer',
      addressText: j.address_text || null,
      jobLat: j.latitude ? parseFloat(j.latitude) : null,
      jobLng: j.longitude ? parseFloat(j.longitude) : null
    });
  }

  // 4. Fetch today's first/last valid location & breadcrumb count per staff
  const locStatsRes = await runner.query(
    `SELECT staff_id,
            MIN(captured_at) AS first_loc_at,
            MAX(captured_at) AS last_loc_at,
            COUNT(*) AS fix_count
     FROM public.staff_locations
     WHERE captured_at::date = $1::date AND is_valid_fix = TRUE
     GROUP BY staff_id`,
    [targetDate]
  );
  const locStatsByStaff = {};
  for (const r of locStatsRes.rows) {
    locStatsByStaff[r.staff_id] = r;
  }

  // 5. Fetch active & recent tracking events/alerts for targetDate
  const eventsRes = await runner.query(
    `SELECT e.*, s.staff_code, s.name AS staff_name
     FROM public.staff_tracking_events e
     JOIN public.staff s ON e.staff_id = s.id
     WHERE e.event_date = $1
     ORDER BY e.is_active DESC, e.occurred_at DESC
     LIMIT 100`,
    [targetDate]
  );

  const eventsByStaff = {};
  for (const ev of eventsRes.rows) {
    if (!eventsByStaff[ev.staff_id]) eventsByStaff[ev.staff_id] = [];
    eventsByStaff[ev.staff_id].push(ev);
  }

  // Calculate KPIs & enrich staff records
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
    const stopCount = staffStops.length;

    let status = row.current_status || 'idle';
    if (!lastSeenMs || (Date.now() - lastSeenMs) > 60 * 60 * 1000) {
      status = 'idle';
    }

    const lat = row.latitude ? parseFloat(row.latitude) : null;
    const lng = row.longitude ? parseFloat(row.longitude) : null;
    const accuracy = row.accuracy !== null && row.accuracy !== undefined ? parseFloat(row.accuracy) : null;
    const accuracyTier = row.accuracy_tier || classifyAccuracy(accuracy);
    const freshnessTier = isValidCoordinate(lat, lng) ? classifyFreshness(row.last_seen_at) : 'unavailable';

    const staffJobs = jobsByStaff[row.staff_id] || [];
    const activeJob = staffJobs.find(j => j.status !== 'completed') || staffJobs[0] || null;
    const jobVerification = activeJob
      ? Object.assign({}, activeJob, computeJobVerification({ latitude: lat, longitude: lng, lastSeenAt: row.last_seen_at, accuracyTier }, activeJob))
      : null;

    const locStat = locStatsByStaff[row.staff_id] || null;
    const staffEvents = eventsByStaff[row.staff_id] || [];
    const geofenceVisitedSet = new Set(
      staffEvents.filter(e => e.event_type === 'geofence_arrival' && e.job_id).map(e => String(e.job_id))
    );
    const gapEvents = staffEvents.filter(e => e.event_type === 'location_gap' || e.event_type === 'gap_recovery');
    const activeDeviation = staffEvents.find(e => e.event_type === 'route_deviation' && e.is_active) || null;
    const activeArrival = staffEvents.find(e => e.event_type === 'geofence_arrival' && e.is_active) || null;

    const firstLocAt = locStat ? locStat.first_loc_at : null;
    const lastLocAt = locStat ? locStat.last_loc_at : null;
    const trackingDurationMinutes = firstLocAt && lastLocAt
      ? Math.max(0, Math.round((new Date(lastLocAt).getTime() - new Date(firstLocAt).getTime()) / 60000))
      : 0;

    return {
      staffId: row.staff_id,
      staffCode: row.staff_code,
      name: row.name,
      phone: row.phone,
      photoUrl: row.photo_url,
      latitude: lat,
      longitude: lng,
      accuracy,
      accuracyTier,
      freshnessTier,
      speed: row.speed ? parseFloat(row.speed) : null,
      heading: row.heading ? parseFloat(row.heading) : null,
      batteryLevel: row.battery_level !== null ? parseFloat(row.battery_level) : null,
      isCharging: row.is_charging,
      status,
      lastSeenAt: row.last_seen_at,
      receivedAt: row.last_received_at || null,
      lastHeartbeatAt: row.last_heartbeat_at || row.last_seen_at || null,
      deviceId: row.device_id || null,
      previousDeviceId: row.previous_device_id || null,
      deviceChangedAt: row.device_changed_at || null,
      appVersion: row.app_version || null,
      networkType: row.network_type || null,
      connectivityStatus: row.connectivity_status || null,
      permissionStatus: row.permission_status || null,
      todayDistanceKm: Math.round((distMeters / 1000) * 100) / 100,
      stoppageCount: stopCount,
      lastLocationText: isValidCoordinate(lat, lng) ? `Coords (${lat.toFixed(4)}, ${lng.toFixed(4)})` : 'No GPS fix yet',
      jobVerification,
      routeDeviation: activeDeviation ? {
        isActive: true,
        distanceMeters: activeDeviation.distance_meters ? parseFloat(activeDeviation.distance_meters) : null,
        occurredAt: activeDeviation.occurred_at
      } : { isActive: false },
      activeArrival: activeArrival ? {
        jobId: activeArrival.job_id,
        arrivedAt: activeArrival.occurred_at,
        distanceMeters: activeArrival.distance_meters ? parseFloat(activeArrival.distance_meters) : null
      } : null,
      analytics: {
        firstValidLocationAt: firstLocAt,
        lastValidLocationAt: lastLocAt,
        trackingDurationMinutes,
        locationGapCount: gapEvents.length,
        fixCount: locStat ? parseInt(locStat.fix_count, 10) : 0,
        jobsAssignedCount: staffJobs.length,
        jobsVisitedCount: geofenceVisitedSet.size,
        jobsCompletedCount: staffJobs.filter(j => j.status === 'completed').length
      }
    };
  });

  const totalStoppages = stoppagesRes.rows.length;
  let sumDwellMinutes = 0;
  for (const s of stoppagesRes.rows) {
    sumDwellMinutes += parseFloat(s.dwell_minutes || 0);
  }
  const avgDwellMinutes = totalStoppages > 0 ? Math.round((sumDwellMinutes / totalStoppages) * 10) / 10 : 0;

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

  const alerts = eventsRes.rows.map(e => ({
    id: e.id,
    staffId: e.staff_id,
    staffCode: e.staff_code,
    staffName: e.staff_name,
    jobId: e.job_id || null,
    eventType: e.event_type,
    severity: e.severity,
    title: e.title,
    details: e.details,
    latitude: e.latitude ? parseFloat(e.latitude) : null,
    longitude: e.longitude ? parseFloat(e.longitude) : null,
    distanceMeters: e.distance_meters ? parseFloat(e.distance_meters) : null,
    accuracyMeters: e.accuracy_meters ? parseFloat(e.accuracy_meters) : null,
    durationMinutes: e.duration_minutes ? parseFloat(e.duration_minutes) : null,
    isActive: Boolean(e.is_active),
    acknowledgedAt: e.acknowledged_at || null,
    acknowledgedBy: e.acknowledged_by || null,
    occurredAt: e.occurred_at,
    resolvedAt: e.resolved_at || null
  }));

  return {
    success: true,
    date: targetDate,
    timezone: 'Asia/Kolkata',
    thresholds: {
      accuracyGoodMeters: ACCURACY_GOOD_METERS,
      accuracyModerateMeters: ACCURACY_MODERATE_METERS,
      geofenceArrivalMeters: GEOFENCE_ARRIVAL_METERS,
      geofenceDepartureMeters: GEOFENCE_DEPARTURE_METERS,
      routeDeviationMeters: ROUTE_DEVIATION_METERS,
      locationGapMinutes: LOCATION_GAP_MINUTES
    },
    kpis: {
      activeStaffCount: activeCount,
      totalStaffCount: staffRes.rows.length,
      fleetDistanceKm: Math.round((totalDistanceMeters / 1000) * 100) / 100,
      totalStoppages,
      avgDwellMinutes,
      activeAlertCount: alerts.filter(a => a.isActive && !a.acknowledgedAt).length
    },
    staff: formattedStaff,
    stoppages: formattedStoppages,
    alerts
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

  const breadcrumbs = crumbsRes.rows.map(r => ({
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

  const stoppages = stopRes.rows.map(s => ({
    id: s.id,
    lat: parseFloat(s.latitude),
    lng: parseFloat(s.longitude),
    arrivedAt: s.arrived_at,
    departedAt: s.departed_at,
    dwellMinutes: parseFloat(s.dwell_minutes),
    locationText: s.address_text || 'Field Stop',
    isActive: Boolean(s.is_active)
  }));

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
  filterJitterAndGlitch,
  isValidCoordinate,
  classifyAccuracy,
  classifyFreshness,
  recordLocation,
  getCurrentTrackingSummary,
  getMovementHistory,
  createLocationPing,
  fulfillLocationPing,
  getPendingPings,
  acknowledgeTrackingAlert,
  getStaffTrackingEvents,
  resolveStaffId,
  getTodayIstDate
};
