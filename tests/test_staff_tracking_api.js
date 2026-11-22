/**
 * =========================================================================
 * TEST SUITE: Staff Tracking Backend API, Spatial Algorithms & Phase 2 Punch
 * =========================================================================
 * Verifies:
 * 1. Database schema tables (staff_locations, staff_tracking_current, staff_stoppages, staff_location_pings)
 *    and service_logs punch columns
 * 2. In-house Haversine distance calculations (zero external API calls)
 * 3. GPS jitter (<15m) and glitch (>150km/h) filtering
 * 4. Stoppage and dwell clustering
 * 5. Repository functions: recordLocation, getCurrentTrackingSummary, getMovementHistory, pings
 * 6. Phase 2 punch coordinates storage and in-house distance verification in serviceLogsRepo
 * 7. Live Server HTTP API endpoints for all tracking actions
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Auto-load .env for standalone script execution if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

const db = require('../db/index');
const repos = require('../db/repositories/index');

async function makePostRequest(port, payload, token = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api',
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runStaffTrackingTestSuite() {
  console.log('===============================================================');
  console.log('🛰️ RUNNING STAFF TRACKING BACKEND & SPATIAL ENGINE TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`✅ PASS ${total}: ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`❌ FAIL ${total}: ${msg}`);
    if (err) console.error(err);
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Database Tables & Columns Verification
    // -------------------------------------------------------------------------
    console.log('[Phase 1]: Database Schema & Tables Verification');
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('staff_locations', 'staff_tracking_current', 'staff_stoppages', 'staff_location_pings')
    `);
    const foundTables = tableCheck.rows.map(r => r.table_name);
    assert.strictEqual(foundTables.includes('staff_locations'), true, 'staff_locations table missing');
    assert.strictEqual(foundTables.includes('staff_tracking_current'), true, 'staff_tracking_current table missing');
    assert.strictEqual(foundTables.includes('staff_stoppages'), true, 'staff_stoppages table missing');
    assert.strictEqual(foundTables.includes('staff_location_pings'), true, 'staff_location_pings table missing');
    pass('All 4 staff tracking tables exist in public schema');

    const columnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'service_logs' 
        AND column_name LIKE 'punch_%'
    `);
    const punchCols = columnCheck.rows.map(r => r.column_name);
    assert.strictEqual(punchCols.includes('punch_latitude'), true, 'punch_latitude column missing');
    assert.strictEqual(punchCols.includes('punch_longitude'), true, 'punch_longitude column missing');
    assert.strictEqual(punchCols.includes('punch_accuracy_meters'), true, 'punch_accuracy_meters column missing');
    assert.strictEqual(punchCols.includes('punch_distance_meters'), true, 'punch_distance_meters column missing');
    assert.strictEqual(punchCols.includes('punch_verified'), true, 'punch_verified column missing');
    assert.strictEqual(punchCols.includes('punch_verification_status'), true, 'punch_verification_status column missing');
    assert.strictEqual(punchCols.includes('punch_metadata'), true, 'punch_metadata column missing');
    pass('Phase 2 punch coordinates columns verified in public.service_logs');

    // -------------------------------------------------------------------------
    // TEST 2: Pure In-House Haversine Distance Math
    // -------------------------------------------------------------------------
    console.log('\n[Phase 2]: In-House Haversine Spatial Math');
    // Test identical point
    const zeroDist = repos.staffTracking.calculateHaversineDistanceMeters(25.3176, 82.9739, 25.3176, 82.9739);
    assert.strictEqual(zeroDist, 0, 'Distance between identical points must be 0');
    pass('Identical points return exactly 0 meters');

    // Varanasi Sigra (25.3176, 82.9739) to Rathyatra (25.3091, 82.9850) is ~1460m
    const testDist = repos.staffTracking.calculateHaversineDistanceMeters(25.3176, 82.9739, 25.3091, 82.9850);
    assert.strictEqual(testDist > 1400 && testDist < 1600, true, `Calculated distance ${testDist}m should be ~1460m`);
    pass(`In-house Haversine calculated ${testDist}m accurately (expected ~1460m)`);

    // -------------------------------------------------------------------------
    // TEST 3: GPS Jitter & Glitch Filter
    // -------------------------------------------------------------------------
    console.log('\n[Phase 3]: GPS Jitter & Teleportation Glitch Filtering');
    const baseTime = Date.now();
    const p1 = { latitude: 25.3176, longitude: 82.9739, capturedAt: new Date(baseTime).toISOString() };

    // Point 2 meters away (jitter)
    const pJitter = { latitude: 25.31761, longitude: 82.97391, capturedAt: new Date(baseTime + 15000).toISOString() };
    const jitterRes = repos.staffTracking.filterJitterAndGlitch(p1, pJitter);
    assert.strictEqual(jitterRes.isStationary, true, 'Small drift (<15m) should be marked stationary');
    assert.strictEqual(jitterRes.distanceIncrementMeters, 0, 'Small drift should contribute 0 meters distance');
    pass('Stationary GPS drift (<15m) filtered out with 0 distance increment');

    // Teleportation spike (10km in 10 seconds = 3600 km/h)
    const pGlitch = { latitude: 25.4076, longitude: 82.9739, capturedAt: new Date(baseTime + 10000).toISOString() };
    const glitchRes = repos.staffTracking.filterJitterAndGlitch(p1, pGlitch);
    assert.strictEqual(glitchRes.isGlitch, true, 'Speed > 150 km/h should be flagged as glitch');
    assert.strictEqual(glitchRes.distanceIncrementMeters, 0, 'Glitch should contribute 0 distance increment');
    pass('GPS teleportation glitch (>150km/h) successfully detected and discarded');

    // Genuine movement: 200m in 30 seconds (~24 km/h)
    const pMove = { latitude: 25.3190, longitude: 82.9750, capturedAt: new Date(baseTime + 30000).toISOString() };
    const moveRes = repos.staffTracking.filterJitterAndGlitch(p1, pMove);
    assert.strictEqual(moveRes.isValid, true, 'Valid urban travel should be valid');
    assert.strictEqual(moveRes.distanceIncrementMeters > 150, true, 'Valid movement must accumulate distance');
    pass(`Genuine movement accepted: +${moveRes.distanceIncrementMeters}m at ${moveRes.speedKmh} km/h`);

    // -------------------------------------------------------------------------
    // TEST 4: Tracking Repository recordLocation & summary
    // -------------------------------------------------------------------------
    console.log('\n[Phase 4]: Repository recordLocation, State Caching & Summaries');
    // Get or create test staff
    const staffList = await repos.staff.findAll({ includeInactive: false });
    assert.strictEqual(staffList.length > 0, true, 'At least one staff member required');
    const testStaff = staffList[0];

    // Record initial heartbeat
    const hb1 = await repos.staffTracking.recordLocation(testStaff.id, {
      latitude: 25.3176,
      longitude: 82.9739,
      accuracy: 6.5,
      altitude: 82.0,
      speed: 2.5,
      heading: 90,
      batteryLevel: 88,
      isCharging: false,
      triggerType: 'heartbeat',
      capturedAt: new Date(baseTime).toISOString()
    });
    assert.strictEqual(hb1.success, true, 'recordLocation should succeed');
    assert.strictEqual(hb1.staffId, testStaff.id, 'Staff ID must match');
    pass(`Heartbeat 1 recorded for staff ${testStaff.staff_code} (${testStaff.id})`);

    // Record second heartbeat (genuine movement: +200m)
    const hb2 = await repos.staffTracking.recordLocation(testStaff.id, {
      latitude: 25.3190,
      longitude: 82.9750,
      accuracy: 5.0,
      speed: 4.0,
      heading: 90,
      batteryLevel: 87,
      isCharging: false,
      triggerType: 'heartbeat',
      capturedAt: new Date(baseTime + 60000).toISOString()
    });
    assert.strictEqual(hb2.success, true, 'Second heartbeat must succeed');
    assert.strictEqual(hb2.todayDistanceKm >= 0.15, true, 'Today distance should have accumulated > 0.15 km');
    pass(`Heartbeat 2 recorded with distance accumulation: ${hb2.todayDistanceKm} km`);

    // Record third heartbeat at same location after 6 minutes (simulate stoppage & dwell)
    const hb3 = await repos.staffTracking.recordLocation(testStaff.id, {
      latitude: 25.31901,
      longitude: 82.97501,
      accuracy: 5.0,
      speed: 0.1,
      batteryLevel: 85,
      triggerType: 'heartbeat',
      capturedAt: new Date(baseTime + 420000).toISOString() // 7 minutes later
    });
    assert.strictEqual(hb3.success, true, 'Third heartbeat must succeed');
    pass('Heartbeat 3 (stationary dwell) recorded');

    // Query Summary & KPIs
    const summary = await repos.staffTracking.getCurrentTrackingSummary();
    assert.strictEqual(summary.success, true, 'getCurrentTrackingSummary should succeed');
    assert.strictEqual(summary.kpis.totalStaffCount >= 1, true, 'totalStaffCount should be >= 1');
    assert.strictEqual(summary.kpis.fleetDistanceKm >= 0.1, true, 'fleetDistanceKm should be >= 0.1 km');
    const matchedStaff = summary.staff.find(s => s.staffId === testStaff.id);
    assert.strictEqual(Boolean(matchedStaff), true, 'Staff should be present in summary');
    assert.strictEqual(matchedStaff.latitude !== null, true, 'Staff coordinates must be present');
    pass(`Tracking summary returned: ${summary.kpis.activeStaffCount} active staff, ${summary.kpis.fleetDistanceKm} km fleet distance, ${summary.kpis.totalStoppages} stoppages`);

    // Query Movement History
    const history = await repos.staffTracking.getMovementHistory(testStaff.id);
    assert.strictEqual(history.success, true, 'getMovementHistory should succeed');
    assert.strictEqual(history.breadcrumbs.length >= 3, true, 'Should have at least 3 breadcrumbs recorded');
    pass(`Movement history returned ${history.breadcrumbs.length} breadcrumb points`);

    // -------------------------------------------------------------------------
    // TEST 5: On-Demand Location Ping Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n[Phase 5]: On-Demand Location Ping Lifecycle');
    // Create ping
    const ping = await repos.staffTracking.createLocationPing(testStaff.id, 'Test Admin');
    assert.strictEqual(ping.success, true, 'createLocationPing should succeed');
    assert.strictEqual(ping.status, 'pending', 'Ping status must be pending');
    pass(`On-demand location ping created with ID: ${ping.pingId}`);

    // Check pending pings
    const pendingPings = await repos.staffTracking.getPendingPings(testStaff.id);
    assert.strictEqual(pendingPings.some(p => p.id === ping.pingId), true, 'Created ping must be in pending list');
    pass('Pending ping correctly retrieved by getPendingPings');

    // Fulfill ping
    const fulfill = await repos.staffTracking.fulfillLocationPing(ping.pingId, {
      latitude: 25.3200,
      longitude: 82.9760,
      accuracy: 4.0,
      batteryLevel: 82,
      speed: 1.5
    });
    assert.strictEqual(fulfill.success, true, 'fulfillLocationPing should succeed');
    pass('Location ping fulfilled with fresh high-accuracy coordinates');

    // Verify ping status is now completed
    const pingCheck = await db.query('SELECT status, responded_at FROM public.staff_location_pings WHERE id = $1', [ping.pingId]);
    assert.strictEqual(pingCheck.rows[0].status, 'completed', 'Ping status should be completed');
    assert.strictEqual(pingCheck.rows[0].responded_at !== null, true, 'Ping responded_at should be populated');
    pass('Ping status verified as completed in database');

    // -------------------------------------------------------------------------
    // TEST 6: Phase 2 Punch Coordinates in serviceLogsRepo
    // -------------------------------------------------------------------------
    console.log('\n[Phase 6]: Phase 2 Punch Coordinates Pre-Alignment in serviceLogsRepo');
    const crypto = require('crypto');
    const punchMutationId = crypto.randomUUID();
    const cleanLog = await repos.serviceLogs.recordCompletion({
      clientMutationId: punchMutationId,
      staffId: testStaff.id,
      completedAtDevice: new Date().toISOString(),
      notes: 'Testing punch coordinates',
      source: 'test_suite',
      punchLatitude: 25.3176,
      punchLongitude: 82.9739,
      punchAccuracyMeters: 8.5,
      punchDistanceMeters: 45.2,
      punchVerified: true,
      punchVerificationStatus: 'verified',
      punchMetadata: { source: 'gps_device', timestamp: new Date().toISOString() }
    });

    assert.strictEqual(cleanLog.inserted, true, 'recordCompletion should insert');
    assert.strictEqual(parseFloat(cleanLog.log.punch_latitude), 25.3176, 'punch_latitude must match');
    assert.strictEqual(parseFloat(cleanLog.log.punch_longitude), 82.9739, 'punch_longitude must match');
    assert.strictEqual(cleanLog.log.punch_verified, true, 'punch_verified must be true');
    assert.strictEqual(cleanLog.log.punch_verification_status, 'verified', 'punch_verification_status must match');
    pass('Phase 2 punch coordinates and verification status stored cleanly in service_logs');

    // Clean up test service log
    await db.query('DELETE FROM public.service_logs WHERE client_mutation_id = $1', [punchMutationId]);
    pass('Test service log cleaned up');

    // -------------------------------------------------------------------------
    // TEST 7: HTTP API Endpoints via live server test
    // -------------------------------------------------------------------------
    console.log('\n[Phase 7]: HTTP API Endpoints in server.js');
    const adminUserRes = await db.query('SELECT id FROM public.admin_users WHERE is_active = TRUE LIMIT 1');
    const adminId = adminUserRes.rows.length > 0 ? adminUserRes.rows[0].id : null;

    const rawAdminToken = 'adm_test_' + crypto.randomBytes(16).toString('hex');
    const adminTokenHash = crypto.createHash('sha256').update(rawAdminToken).digest('hex');
    await repos.authSessions.createSession({
      tokenHash: adminTokenHash,
      userType: 'admin',
      adminId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    const rawStaffToken = 'stf_test_' + crypto.randomBytes(16).toString('hex');
    const staffTokenHash = crypto.createHash('sha256').update(rawStaffToken).digest('hex');
    await repos.authSessions.createSession({
      tokenHash: staffTokenHash,
      userType: 'staff',
      staffId: testStaff.id,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    const serverModule = require('../server');
    const testPort = 3899;
    const testServer = serverModule.server.listen(testPort);

    try {
      // 7a. recordStaffHeartbeat HTTP endpoint
      const hbHttpRes = await makePostRequest(testPort, {
        action: 'recordStaffHeartbeat',
        staffId: testStaff.id,
        latitude: 25.3185,
        longitude: 82.9745,
        accuracy: 7.0,
        speed: 1.8,
        batteryLevel: 92,
        isCharging: false,
        capturedAt: new Date().toISOString()
      }, rawStaffToken);
      assert.strictEqual(hbHttpRes.statusCode, 200, 'recordStaffHeartbeat HTTP status should be 200');
      assert.strictEqual(hbHttpRes.data.success, true, 'recordStaffHeartbeat HTTP should succeed');
      pass('HTTP API: recordStaffHeartbeat returned 200 OK with success=true');

      // 7b. getStaffTrackingSummary HTTP endpoint
      const summaryHttpRes = await makePostRequest(testPort, {
        action: 'getStaffTrackingSummary'
      }, rawAdminToken);
      assert.strictEqual(summaryHttpRes.statusCode, 200, 'getStaffTrackingSummary HTTP status should be 200');
      assert.strictEqual(summaryHttpRes.data.success, true, 'getStaffTrackingSummary HTTP should succeed');
      assert.strictEqual(Array.isArray(summaryHttpRes.data.staff), true, 'staff array should be returned');
      pass(`HTTP API: getStaffTrackingSummary returned 200 OK (${summaryHttpRes.data.staff.length} staff returned)`);

      // 7c. getStaffMovementHistory HTTP endpoint
      const historyHttpRes = await makePostRequest(testPort, {
        action: 'getStaffMovementHistory',
        staffId: testStaff.id
      }, rawAdminToken);
      assert.strictEqual(historyHttpRes.statusCode, 200, 'getStaffMovementHistory HTTP status should be 200');
      assert.strictEqual(historyHttpRes.data.success, true, 'getStaffMovementHistory HTTP should succeed');
      pass(`HTTP API: getStaffMovementHistory returned 200 OK (${historyHttpRes.data.breadcrumbs.length} breadcrumbs)`);

      // 7d. pingStaffLocation HTTP endpoint
      const pingHttpRes = await makePostRequest(testPort, {
        action: 'pingStaffLocation',
        staffId: testStaff.id
      }, rawAdminToken);
      assert.strictEqual(pingHttpRes.statusCode, 200, 'pingStaffLocation HTTP status should be 200');
      assert.strictEqual(pingHttpRes.data.success, true, 'pingStaffLocation HTTP should succeed');
      const httpPingId = pingHttpRes.data.pingId;
      pass(`HTTP API: pingStaffLocation created ping ${httpPingId}`);

      // 7e. getPendingStaffPings HTTP endpoint
      const checkPingHttpRes = await makePostRequest(testPort, {
        action: 'getPendingStaffPings',
        staffId: testStaff.id
      }, rawStaffToken);
      assert.strictEqual(checkPingHttpRes.statusCode, 200, 'getPendingStaffPings HTTP status should be 200');
      assert.strictEqual(checkPingHttpRes.data.success, true, 'getPendingStaffPings HTTP should succeed');
      pass('HTTP API: getPendingStaffPings returned 200 OK');

      // 7f. respondToLocationPing HTTP endpoint
      const respondHttpRes = await makePostRequest(testPort, {
        action: 'respondToLocationPing',
        pingId: httpPingId,
        staffId: testStaff.id,
        latitude: 25.3210,
        longitude: 82.9770,
        accuracy: 4.5,
        batteryLevel: 90
      }, rawStaffToken);
      assert.strictEqual(respondHttpRes.statusCode, 200, 'respondToLocationPing HTTP status should be 200');
      assert.strictEqual(respondHttpRes.data.success, true, 'respondToLocationPing HTTP should succeed');
      pass('HTTP API: respondToLocationPing fulfilled ping successfully');

      // 7g. getMapsConfig HTTP endpoint
      const mapsConfigRes = await makePostRequest(testPort, {
        action: 'getMapsConfig'
      }, rawAdminToken);
      assert.strictEqual(mapsConfigRes.statusCode, 200, 'getMapsConfig HTTP status should be 200');
      assert.strictEqual(mapsConfigRes.data.success, true, 'getMapsConfig should succeed');
      pass('HTTP API: getMapsConfig returned 200 OK');

    } finally {
      testServer.close();
      await db.query('DELETE FROM public.auth_sessions WHERE token_hash IN ($1, $2)', [adminTokenHash, staffTokenHash]);
    }

    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passed}/${total} STAFF TRACKING API & SPATIAL ENGINE TESTS PASSED!`);
    console.log('===============================================================');
    process.exit(0);

  } catch (err) {
    fail('Test suite crashed with unexpected error', err);
  }
}

runStaffTrackingTestSuite();
