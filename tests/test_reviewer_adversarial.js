const http = require('http');
const serverModule = require('../server');
const db = require('../db');
const repos = require('../db/repositories');
const crypto = require('crypto');
const assert = require('assert');

async function runAdversarialAudit() {
  console.log('🛰️ STARTING ADVERSARIAL AUDIT FOR 5 REMEDIATIONS...\n');

  // =========================================================================
  // 1. ADVERSARIAL AUTH AUDIT
  // =========================================================================
  const port = 3986;
  const s = serverModule.server.listen(port);

  try {
    const staffRes = await db.query('SELECT id, staff_code FROM public.staff WHERE deleted_at IS NULL LIMIT 2');
    const staff1 = staffRes.rows[0];
    const staff2 = staffRes.rows[1];

    const staffToken = 'test-sec-staff-token-' + Date.now();
    const staffTokenHash = crypto.createHash('sha256').update(staffToken).digest('hex');
    await repos.authSessions.createSession({
      tokenHash: staffTokenHash,
      userType: 'staff',
      staffId: staff1.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });

    function req(path, method, body, token) {
      return new Promise(resolve => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = http.request({ hostname: 'localhost', port, path, method, headers }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        if (body) r.write(JSON.stringify(body));
        r.end();
      });
    }

    // 1.1 Unauthenticated heartbeat (with staffId in body) -> 401
    const t1 = await req('/api', 'POST', { action: 'recordStaffHeartbeat', staffId: staff1.id, latitude: 25.3, longitude: 82.9 }, null);
    assert.strictEqual(t1.status, 401, 'Unauthenticated heartbeat must return 401');
    console.log('✅ PASS 1.1: Unauthenticated heartbeat rejected with 401 (bypass eliminated)');

    // 1.2 Cross-staff heartbeat spoofing -> 403
    const t2 = await req('/api', 'POST', { action: 'recordStaffHeartbeat', staffId: staff2.id, latitude: 25.3, longitude: 82.9 }, staffToken);
    assert.strictEqual(t2.status, 403, 'Cross-staff spoofing must return 403');
    console.log('✅ PASS 1.2: Cross-staff heartbeat spoofing rejected with 403');

    // 1.3 Unauthenticated SSE stream -> 401
    const t3 = await req('/api/staff-ping-stream?staffId=' + staff1.id, 'GET', null, null);
    assert.strictEqual(t3.status, 401, 'Unauthenticated SSE stream must return 401');
    console.log('✅ PASS 1.3: Unauthenticated SSE stream rejected with 401');

    // 1.4 Cross-staff SSE stream eavesdropping -> 403
    const t4 = await req('/api/staff-ping-stream?staffId=' + staff2.id, 'GET', null, staffToken);
    assert.strictEqual(t4.status, 403, 'Cross-staff SSE stream eavesdropping must return 403');
    console.log('✅ PASS 1.4: Cross-staff SSE stream eavesdropping rejected with 403');

    // 1.5 Admin summary accessed by staff -> 401
    const t5 = await req('/api', 'POST', { action: 'getStaffTrackingSummary' }, staffToken);
    assert.strictEqual(t5.status, 401, 'Staff session cannot access admin tracking summary');
    console.log('✅ PASS 1.5: Non-admin staff rejected from admin tracking summary');

    // 1.6 Admin ping triggered by staff -> 401
    const t6 = await req('/api', 'POST', { action: 'pingStaffLocation', staffId: staff2.id }, staffToken);
    assert.strictEqual(t6.status, 401, 'Staff session cannot trigger admin ping');
    console.log('✅ PASS 1.6: Non-admin staff rejected from triggering on-demand ping');

    // =========================================================================
    // 2. STOPPAGE DWELL 5-MINUTE ENFORCEMENT AUDIT
    // =========================================================================
    console.log('\n--- AUDITING 5-MINUTE STOPPAGE DWELL ENFORCEMENT ---');

    // Create an isolated test staff record
    const auditStaffRes = await db.query(
      `INSERT INTO public.staff (name, phone, staff_code, is_active)
       VALUES ('Audit Stoppage Staff', '9999900001', 'AUDIT_STF_01', TRUE)
       RETURNING id`
    );
    const auditStaffId = auditStaffRes.rows[0].id;

    try {
      // Scenario A: Brief pause (2 minutes dwell, e.g. traffic signal) then departure
      const t0 = new Date('2026-11-22T08:00:00Z');
      const tStop1 = new Date('2026-11-22T08:02:00Z');
      const tStop2 = new Date('2026-11-22T08:03:00Z'); // 1 minute later
      const tDepart = new Date('2026-11-22T08:04:30Z'); // Departed at 2.5 min elapsed

      // Initial fix
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.3100, longitude: 82.9700, capturedAt: t0.toISOString()
      });

      // Stationary fix at 08:02 (<15m jitter) -> starts stoppage
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.31001, longitude: 82.97001, capturedAt: tStop1.toISOString()
      });

      // Stationary fix at 08:03 (dwell = 1.0 min)
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.31002, longitude: 82.97001, capturedAt: tStop2.toISOString()
      });

      // Check that stoppage was active
      const activeStopCheck = await db.query(
        'SELECT * FROM public.staff_stoppages WHERE staff_id = $1 AND is_active = TRUE',
        [auditStaffId]
      );
      assert.strictEqual(activeStopCheck.rows.length, 1, 'Should have 1 active stoppage while dwelling');

      // Now staff departs: moves 500 meters away at 08:04:30 (dwell was 2.5 minutes < 5 min)
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.3150, longitude: 82.9750, capturedAt: tDepart.toISOString()
      });

      // Since dwell was 2.5 minutes (< 5 minutes threshold), the stoppage record should be purged
      const briefStopCheck = await db.query(
        'SELECT * FROM public.staff_stoppages WHERE staff_id = $1',
        [auditStaffId]
      );
      assert.strictEqual(briefStopCheck.rows.length, 0, 'Brief stoppage (< 5 min dwell) must be deleted from database upon departure');
      console.log('✅ PASS 2.1: Brief stop (< 5 min) cleanly deleted upon departure (zero DB pollution)');

      // Scenario B: Genuine stoppage (12 minutes dwell) then departure
      const tG0 = new Date('2026-11-22T08:20:00Z');
      const tGArrive = new Date('2026-11-22T08:25:00Z');
      const tGDwell = new Date('2026-11-22T08:35:00Z'); // 10 minutes later
      const tGDepart = new Date('2026-11-22T08:37:00Z'); // 12 minutes total

      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.3200, longitude: 82.9800, capturedAt: tG0.toISOString()
      });
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.32001, longitude: 82.98001, capturedAt: tGArrive.toISOString()
      });
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.32002, longitude: 82.98001, capturedAt: tGDwell.toISOString()
      });
      // Depart
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.3300, longitude: 82.9900, capturedAt: tGDepart.toISOString()
      });

      // Verify that genuine stoppage (12 min) is retained
      const genuineStopCheck = await db.query(
        'SELECT * FROM public.staff_stoppages WHERE staff_id = $1',
        [auditStaffId]
      );
      assert.strictEqual(genuineStopCheck.rows.length, 1, 'Genuine stoppage (>= 5 min) must be preserved');
      assert.strictEqual(genuineStopCheck.rows[0].is_active, false, 'Stoppage should be marked departed (is_active=false)');
      assert(genuineStopCheck.rows[0].dwell_minutes >= 11, `Dwell minutes should be ~12 (got ${genuineStopCheck.rows[0].dwell_minutes})`);
      console.log(`✅ PASS 2.2: Genuine stoppage (>= 5 min) preserved with dwell_minutes = ${genuineStopCheck.rows[0].dwell_minutes}`);

      // =========================================================================
      // 3. SPATIAL BOUNDING BOX CUSTOMER GEOCODING AUDIT
      // =========================================================================
      console.log('\n--- AUDITING SPATIAL BOUNDING BOX CUSTOMER GEOCODING ---');

      // Create a test customer with service location at (25.3500, 82.9500)
      const custRes = await db.query(
        `INSERT INTO public.customers (name, phone, customer_code, source_sheet_name, source_row_index) VALUES ('Audit Spatial Geocode Customer', '9999900002', 'CUST_AUDIT_99', 'TEST_SHEET', 99999) RETURNING id`
      );
      const auditCustId = custRes.rows[0].id;
      await db.query(
        `INSERT INTO public.service_locations (customer_id, address_text, latitude, longitude)
         VALUES ($1, 'Audit Society Tower B, Varanasi', 25.3500, 82.9500)`,
        [auditCustId]
      );

      // Staff dwells at 25.3502, 82.9501 (approx 25 meters from service location)
      const tGeo0 = new Date('2026-11-22T09:00:00Z');
      const tGeo1 = new Date('2026-11-22T09:02:00Z');
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.3502, longitude: 82.9501, capturedAt: tGeo0.toISOString()
      });
      await repos.staffTracking.recordLocation(auditStaffId, {
        latitude: 25.35021, longitude: 82.95011, capturedAt: tGeo1.toISOString()
      });

      // Verify that active stoppage correctly matched auditCustId and formatted addressText
      const geoStopRes = await db.query(
        `SELECT * FROM public.staff_stoppages WHERE staff_id = $1 AND is_active = TRUE`,
        [auditStaffId]
      );
      assert.strictEqual(geoStopRes.rows.length, 1, 'Must have active stoppage');
      assert.strictEqual(geoStopRes.rows[0].matched_customer_id, auditCustId, 'Must accurately match customer within 120m');
      assert(geoStopRes.rows[0].address_text.includes('Audit Spatial Geocode Customer'), `Address text must include customer name: ${geoStopRes.rows[0].address_text}`);
      console.log(`✅ PASS 3.1: Spatial bounding box correctly matched customer: "${geoStopRes.rows[0].address_text}"`);

      // Clean up test customer and locations
      await db.query('DELETE FROM public.service_locations WHERE customer_id = $1', [auditCustId]);
      await db.query('DELETE FROM public.customers WHERE id = $1', [auditCustId]);

    } finally {
      // Clean up audit staff
      await db.query('DELETE FROM public.staff_locations WHERE staff_id = $1', [auditStaffId]);
      await db.query('DELETE FROM public.staff_stoppages WHERE staff_id = $1', [auditStaffId]);
      await db.query('DELETE FROM public.staff_tracking_current WHERE staff_id = $1', [auditStaffId]);
      await db.query('DELETE FROM public.staff WHERE id = $1', [auditStaffId]);
      await db.query('DELETE FROM public.auth_sessions WHERE token_hash = $1', [staffTokenHash]);
    }

    s.close();
    console.log('\n===============================================================');
    console.log('🎉 ALL REVIEWER ADVERSARIAL AUDIT CHECKS PASSED WITH FLYING COLORS!');
    console.log('===============================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('Audit failed:', err);
    s.close();
    process.exit(1);
  }
}

runAdversarialAudit();
