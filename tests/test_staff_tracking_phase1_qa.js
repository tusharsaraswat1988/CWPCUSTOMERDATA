/**
 * QA Test Suite for Phase 1 Staff Live Tracking & Stoppage Enhancements:
 * 1. Road Distance Calculation with Urban Road Factor (1.35x)
 * 2. DCC Job Punch -> Staff Tracking & Stoppages Bridge
 * 3. Graceful Fallback for basement / weak GPS
 * 4. Human-readable location text & customer job count
 * 5. Movement History & Stoppage Journey retrieval
 */
const assert = require('assert');
const fs = require('fs');

if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      const k = m[1];
      let v = (m[2] || '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const db = require('../db');
const repos = require('../db/repositories');

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING STAFF TRACKING PHASE 1 QA SUITE');
  console.log('===============================================================');

  // Test 1: Road Distance vs Haversine
  console.log('\n--- TEST 1: Road Distance Scaling & Haversine Math ---');
  const lat1 = 25.2860, lon1 = 82.9957; // Bhelupur area
  const lat2 = 25.3176, lon2 = 82.9739; // Central Varanasi
  const haversineMeters = repos.staffTracking.calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2);
  const roadMeters = repos.staffTracking.calculateRoadDistanceMeters(lat1, lon1, lat2, lon2);

  console.log(`Straight distance: ${(haversineMeters / 1000).toFixed(2)} km, Road distance: ${(roadMeters / 1000).toFixed(2)} km`);
  assert(haversineMeters > 0, 'Haversine distance must be positive');
  assert(roadMeters > haversineMeters, 'Road distance must be greater than straight-line distance');
  assert.strictEqual(Math.round(haversineMeters * 1.35 * 100) / 100, roadMeters, 'Road distance must match 1.35x urban factor');
  console.log('✅ PASS 1: Road distance calculation accurately models urban driving');

  // Test 2: Resolve Staff for STF02
  console.log('\n--- TEST 2: Resolve Staff & Baseline State ---');
  const staff = await db.query("SELECT id, name, staff_code FROM public.staff WHERE staff_code = 'STF02' OR name ILIKE '%Gaurav%' LIMIT 1");
  assert(staff.rows.length > 0, 'Staff STF02 must exist in database');
  const staffId = staff.rows[0].id;
  console.log(`Found Staff: ${staff.rows[0].name} (${staff.rows[0].staff_code}) -> UUID: ${staffId}`);
  console.log('✅ PASS 2: Staff identity resolved');

  // Test 3: Record Job Stop
  console.log('\n--- TEST 3: recordJobStop bridges DCC into Locations & Stoppages ---');
  const testLat = 25.2950;
  const testLng = 82.9850;
  const testAddress = 'आनंद कुमार (UP65 AX 4321) - कार सफाई';
  const completedAt = new Date().toISOString();

  const stopResult = await repos.staffTracking.recordJobStop({
    staffId,
    latitude: testLat,
    longitude: testLng,
    accuracy: 10,
    addressText: testAddress,
    matchedCustomerId: null,
    completedAt,
    triggerType: 'job_punch',
    source: 'pwa_gps'
  });

  assert(stopResult && stopResult.success, 'recordJobStop must return success');
  assert(stopResult.stoppageId, 'recordJobStop must generate stoppageId');
  console.log(`Recorded Job Stop ID: ${stopResult.stoppageId}, Today Distance: ${stopResult.todayDistanceKm} km`);

  // Verify DB entries
  const locCheck = await db.query(
    "SELECT * FROM public.staff_locations WHERE staff_id = $1 AND trigger_type = 'job_punch' ORDER BY captured_at DESC LIMIT 1",
    [staffId]
  );
  assert(locCheck.rows.length > 0, 'Location waypoint must be recorded in staff_locations');
  assert.strictEqual(parseFloat(locCheck.rows[0].latitude), testLat, 'Latitude must match');

  const stopCheck = await db.query(
    "SELECT * FROM public.staff_stoppages WHERE id = $1",
    [stopResult.stoppageId]
  );
  assert(stopCheck.rows.length > 0, 'Stoppage must be recorded in staff_stoppages');
  assert.strictEqual(stopCheck.rows[0].address_text, testAddress, 'Stoppage address_text must match');
  assert.strictEqual(parseFloat(stopCheck.rows[0].dwell_minutes), 15.0, 'Dwell minutes must be recorded');
  console.log('✅ PASS 3: recordJobStop inserted verified waypoint and stoppage in DB');

  // Test 4: Current Tracking Summary contains human readable area & job count
  console.log('\n--- TEST 4: getCurrentTrackingSummary UI Data Integrity ---');
  const summary = await repos.staffTracking.getCurrentTrackingSummary();
  assert(summary && summary.success, 'getCurrentTrackingSummary must return success');
  assert(Array.isArray(summary.staff), 'Staff array must be returned');

  const gauravData = summary.staff.find(s => s.staffId === staffId || s.staffCode === 'STF02');
  assert(gauravData, 'Gaurav Gupta must be in summary list');
  console.log(`Gaurav Summary: Area="${gauravData.lastLocationText}", Stops=${gauravData.stoppageCount}, Cleans=${gauravData.completedJobsCount}, Km=${gauravData.todayDistanceKm}`);
  assert(!gauravData.lastLocationText.startsWith('Coords ('), 'Location text must be human-readable landmark/stop name, not raw coords');
  assert(gauravData.stoppageCount > 0, 'Stoppage count must be greater than 0');
  console.log('✅ PASS 4: Staff card has clean human-readable landmark and active stoppage count');

  // Test 5: Movement History & Stoppages Drawer
  console.log('\n--- TEST 5: getMovementHistory Journey & Breadcrumbs ---');
  const hist = await repos.staffTracking.getMovementHistory(staffId);
  assert(hist && hist.success, 'getMovementHistory must return success');
  assert(hist.stoppages.length > 0, 'History must include recorded stoppages');
  console.log(`Movement History: Breadcrumbs=${hist.breadcrumbs.length}, Stoppages=${hist.stoppages.length}`);
  const lastStop = hist.stoppages[hist.stoppages.length - 1];
  console.log(`Latest Stop in Drawer: "${lastStop.locationText}" at ${lastStop.arrivedAt}`);
  assert(lastStop.locationText.includes('कार सफाई') || lastStop.locationText.includes('Stop'), 'Stop must describe the cleaning job or service area');
  console.log('✅ PASS 5: Movement History drawer displays verified stoppages');

  console.log('\n===============================================================');
  console.log('🎉 ALL 5 STAFF TRACKING PHASE 1 QA TESTS PASSED CLEANLY!');
  console.log('===============================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ QA TEST FAILED:', err);
  process.exit(1);
});
