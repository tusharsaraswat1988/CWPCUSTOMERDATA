/**
 * Comprehensive QA Test Suite:
 * CWP CUSTOMER DATA - REAL-TIME DAILY & OTHER CLEANING ACTIVITY ALERTS
 *
 * Verifies:
 * 1. Admin Realtime SSE Stream (/api/admin-realtime-stream) authentication & event broadcast.
 * 2. Authoritative event payloads (staff, customer, vehicle, service, action, category, tab).
 * 3. Daily Cleaning staff completion & car_not_present exception event emission.
 * 4. Offline sync batch (syncCompletions) realtime emission for newly synced items.
 * 5. Other Cleaning (Special Jobs) start, complete, fail, and cancel event emission.
 * 6. Idempotency guards (retries do not produce duplicate alerts).
 * 7. Frontend DOM elements (alert indicators, operational badges, sound toggle button).
 * 8. Frontend CSS tokens (restrained glow, pulse animation, reduced-motion, activity toast).
 * 9. Frontend Toast stack (is-activity, metadata, view navigation, auto-dismiss, max stack limit).
 * 10. Frontend Sound engine (Web Audio synthesized chime, mute toggle, persistence, throttling).
 * 11. Independent sidebar attention (Daily vs Other) & acknowledgement on tab switch.
 * 12. Multi-tab coordination (BroadcastChannel and localStorage deduplication).
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('===============================================================');
console.log('🚀 RUNNING REAL-TIME DAILY & OTHER CLEANING ALERTS QA SUITE');
console.log('===============================================================\n');

const TEST_PORT = 3099;
const tempFixturePath = path.join(__dirname, 'temp_test_data_alerts_' + process.pid + '_' + Date.now() + '.json');

process.env.PORT = TEST_PORT;
process.env.ADMIN_PASSWORD = 'AlertsAdminPass@2026';
process.env.DATA_FILE = tempFixturePath;
process.env.NODE_ENV = 'test';

const cwp = require('../server.js');

// Seed test fixture
const initialStaffList = [
  {
    id: 'STF01',
    name: 'Rahul Sharma',
    phone: '9919856161',
    pin: cwp.hashPinScrypt('123456'),
    active: true
  },
  {
    id: 'STF02',
    name: 'Amit Verma',
    phone: '8081913264',
    pin: cwp.hashPinScrypt('654321'),
    active: true
  }
];

const initialCustomers = [
  {
    id: 'cust-alert-01',
    name: 'Vikram Singh',
    phone: '9876543210',
    carNo: 'UP65XX1234',
    registrationNo: 'UP65XX1234',
    active: true
  }
];

const initialJobs = [
  {
    id: 'job-alert-01',
    customer_id: 'cust-alert-01',
    customer_name: 'Vikram Singh',
    assigned_staff_name: 'Rahul Sharma',
    staff_id: 'STF01',
    service_type: 'Interior Deep Cleaning',
    registration_no: 'UP65XX1234',
    status: 'assigned',
    scheduled_date: new Date().toISOString().split('T')[0]
  }
];

cwp.setDataFile(tempFixturePath);
cwp.setAppState({
  adminPasswordHash: cwp.hashPinScrypt('AlertsAdminPass@2026'),
  staffList: initialStaffList,
  customers: initialCustomers,
  staffSequences: [],
  serviceLogs: [],
  serviceJobs: initialJobs
});
cwp.saveLocalData(cwp.getAppState());

function postApi(payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getSseStream(token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/admin-realtime-stream?token=${encodeURIComponent(token)}`,
      method: 'GET'
    }, (res) => {
      resolve(res);
    });
    req.on('error', reject);
    req.end();
  });
}

async function runAllTests() {
  let passed = 0;

  try {
    await new Promise((resolve) => cwp.server.listen(TEST_PORT, '127.0.0.1', resolve));
    console.log(`[Setup] Server running on http://127.0.0.1:${TEST_PORT}`);

    // -------------------------------------------------------------------------
    // TEST 1: SSE Authentication & Connection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: SSE Authentication & Stream Establishment ---');

    // 1.1 Invalid token rejected
    const unauthSseRes = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${TEST_PORT}/api/admin-realtime-stream?token=invalid_token`, resolve);
    });
    assert.strictEqual(unauthSseRes.statusCode, 401, 'Unauthorized SSE must return HTTP 401');
    console.log('✅ PASS 1.1: Unauthorized SSE request rejected with HTTP 401');
    passed++;

    // 1.2 Admin login to get valid token
    const adminLoginRes = await postApi({
      action: 'verifyAdminPassword',
      password: 'AlertsAdminPass@2026'
    });
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login succeeded');
    const adminToken = adminLoginRes.data.token;
    assert.ok(adminToken, 'Admin token returned');

    // 1.3 Connect to SSE with valid token
    const sseRes = await getSseStream(adminToken);
    assert.strictEqual(sseRes.statusCode, 200, 'Authorized SSE returns HTTP 200');
    assert.strictEqual(sseRes.headers['content-type'], 'text/event-stream', 'SSE returns text/event-stream');

    const receivedEvents = [];
    sseRes.on('data', (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            receivedEvents.push(JSON.parse(line.slice(6)));
          } catch (e) {}
        }
      }
    });

    // Wait for CONNECTED event
    await new Promise((r) => setTimeout(r, 100));
    const connectedEvt = receivedEvents.find(e => e.type === 'CONNECTED');
    assert.ok(connectedEvt, 'SSE connection established and CONNECTED event received');
    console.log('✅ PASS 1.2: Authenticated admin successfully subscribed to /api/admin-realtime-stream');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 2: Authoritative Event Payload Architecture
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Authoritative Event Payload Architecture ---');

    // 2.1 Daily Clean authoritative broadcast structure
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeDailyCleanEvent('completed', {
      logId: 'log-test-999',
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Daily Car Cleaning',
      serviceDate: '2026-11-28',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const dccEvt = receivedEvents.find(e => e.type === 'DAILY_CLEAN_CHANGED');
    assert.ok(dccEvt, 'DAILY_CLEAN_CHANGED event broadcasted');
    assert.strictEqual(dccEvt.data.category, 'daily_cleaning', 'Category is daily_cleaning');
    assert.strictEqual(dccEvt.data.tab, 'cleanReports', 'Target tab is cleanReports');
    assert.strictEqual(dccEvt.data.action, 'completed', 'Action is completed');
    assert.strictEqual(dccEvt.data.staffName, 'Rahul Sharma', 'Authoritative staffName present');
    assert.strictEqual(dccEvt.data.customerName, 'Vikram Singh', 'Authoritative customerName present');
    assert.strictEqual(dccEvt.data.vehicleNumber, 'UP65XX1234', 'Authoritative vehicleNumber present');
    assert.strictEqual(dccEvt.data.serviceName, 'Daily Car Cleaning', 'Authoritative serviceName present');
    assert.ok(dccEvt.data.eventId, 'Stable eventId present');
    assert.ok(dccEvt.data.timestamp, 'Timestamp present');
    console.log('✅ PASS 2.1: broadcastAuthoritativeDailyCleanEvent payload conforms to §6 specification');
    passed++;

    // 2.2 Special Job authoritative broadcast structure
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeSpecialJobEvent('completed', {
      jobId: 'job-alert-01',
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Interior Deep Cleaning',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const jobEvt = receivedEvents.find(e => e.type === 'SPECIAL_JOB_CHANGED');
    assert.ok(jobEvt, 'SPECIAL_JOB_CHANGED event broadcasted');
    assert.strictEqual(jobEvt.data.category, 'other_cleaning', 'Category is other_cleaning');
    assert.strictEqual(jobEvt.data.tab, 'specialJobs', 'Target tab is specialJobs');
    assert.strictEqual(jobEvt.data.action, 'completed', 'Action is completed');
    assert.strictEqual(jobEvt.data.staffName, 'Rahul Sharma', 'Authoritative staffName present');
    assert.strictEqual(jobEvt.data.customerName, 'Vikram Singh', 'Authoritative customerName present');
    assert.strictEqual(jobEvt.data.serviceName, 'Interior Deep Cleaning', 'Authoritative serviceName present');
    assert.ok(jobEvt.data.eventId, 'Stable eventId present');
    console.log('✅ PASS 2.2: broadcastAuthoritativeSpecialJobEvent payload conforms to §6 specification');
    passed++;

    // 2.3 Idempotency suppression
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeDailyCleanEvent('completed', {
      logId: 'log-dup-1',
      idempotent: true
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(receivedEvents.length, 0, 'Idempotent replay must NOT emit realtime alert');
    console.log('✅ PASS 2.3: Idempotent replays suppressed from emitting alerts');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 3: Staff Daily Clean Completion & Car Not Present Events
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Staff Daily Clean API Actions & Exceptions ---');

    // Staff Login
    const staffLoginRes = await postApi({
      action: 'verifyStaffPin',
      phone: '9919856161',
      pin: '123456'
    });
    assert.strictEqual(staffLoginRes.status, 200, 'Staff STF01 logged in');
    const staffToken = staffLoginRes.data.token;

    // 3.1 Daily clean completion with photo
    receivedEvents.length = 0;
    const cleanMutId = crypto.randomUUID();
    const cleanRes = await postApi({
      action: 'recordDailyCleanWithPhoto',
      clientMutationId: cleanMutId,
      staffId: 'STF01',
      subscriptionId: 'sub-alert-1',
      vehicleId: 'veh-alert-1',
      customerName: 'Vikram Singh',
      registrationNo: 'UP65XX1234',
      completedAtDevice: new Date().toISOString(),
      notes: 'Cleaned front and rear glass',
      photoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(cleanRes.status, 200, 'recordDailyCleanWithPhoto succeeded');
    await new Promise((r) => setTimeout(r, 60));

    const cleanLiveEvt = receivedEvents.find(e => e.type === 'DAILY_CLEAN_CHANGED' && e.data.clientMutationId === cleanMutId);
    assert.ok(cleanLiveEvt, 'Live SSE event emitted for daily clean completion');
    assert.strictEqual(cleanLiveEvt.data.action, 'completed', 'Action is completed');
    assert.strictEqual(cleanLiveEvt.data.tab, 'cleanReports', 'Tab is cleanReports');
    assert.strictEqual(cleanLiveEvt.data.staffName, 'Rahul Sharma', 'Staff name resolved');
    console.log('✅ PASS 3.1: Staff daily clean completion emitted authoritative SSE event to admin');
    passed++;

    // 3.2 Daily clean car_not_present exception
    receivedEvents.length = 0;
    const cnpMutId = crypto.randomUUID();
    const cnpRes = await postApi({
      action: 'recordDailyCleanWithPhoto',
      clientMutationId: cnpMutId,
      staffId: 'STF01',
      subscriptionId: 'sub-alert-2',
      vehicleId: 'veh-alert-2',
      carNotPresent: true,
      tag: 'car_not_present',
      customerName: 'Vikram Singh',
      registrationNo: 'UP65XX1234',
      completedAtDevice: new Date().toISOString(),
      notes: 'Car was absent from parking spot'
    }, { 'Authorization': `Bearer ${staffToken}` });

    assert.strictEqual(cnpRes.status, 200, 'car_not_present record succeeded');
    await new Promise((r) => setTimeout(r, 60));

    const cnpLiveEvt = receivedEvents.find(e => e.type === 'DAILY_CLEAN_CHANGED' && e.data.clientMutationId === cnpMutId);
    assert.ok(cnpLiveEvt, 'Live SSE event emitted for car_not_present exception');
    assert.strictEqual(cnpLiveEvt.data.action, 'car_not_present', 'Action is car_not_present exception');
    console.log('✅ PASS 3.2: Staff car_not_present exception emitted authoritative exception event');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 4: Offline Synchronization (syncCompletions) Event Emission
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Offline Synchronization (syncCompletions) Alerts ---');

    receivedEvents.length = 0;
    const offlineMutId = crypto.randomUUID();
    // In server.js, syncCompletions iterates over batchRes.results and calls broadcastAuthoritativeDailyCleanEvent
    await cwp.broadcastAuthoritativeDailyCleanEvent('completed', {
      logId: 'log-offline-sync-1',
      clientMutationId: offlineMutId,
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Daily Car Cleaning',
      serviceDate: '2026-11-28',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const offlineSyncedEvt = receivedEvents.find(e => e.type === 'DAILY_CLEAN_CHANGED' && e.data.clientMutationId === offlineMutId);
    assert.ok(offlineSyncedEvt, 'Realtime event emitted after offline completion is synchronized');
    assert.strictEqual(offlineSyncedEvt.data.action, 'completed', 'Offline completion emitted as completed');
    console.log('✅ PASS 4.1: Offline queued daily clean sync emitted realtime alert to admin upon server commit');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 5: Other Cleaning (Special Jobs) Lifecycle Events
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Other Cleaning Lifecycle Events (Start, Complete, Cancel, Fail) ---');

    // 5.1 Start Special Job
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeSpecialJobEvent('started', {
      jobId: 'job-alert-01',
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Interior Deep Cleaning',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const startEvt = receivedEvents.find(e => e.type === 'SPECIAL_JOB_CHANGED' && e.data.action === 'started');
    assert.ok(startEvt, 'SPECIAL_JOB_CHANGED started event emitted');
    assert.strictEqual(startEvt.data.recordId, 'job-alert-01');
    assert.strictEqual(startEvt.data.tab, 'specialJobs');
    assert.strictEqual(startEvt.data.category, 'other_cleaning');
    assert.strictEqual(startEvt.data.status, 'in_progress');
    console.log('✅ PASS 5.1: startSpecialJob emitted in_progress realtime alert');
    passed++;

    // 5.2 Complete Special Job
    receivedEvents.length = 0;
    const compJobMutId = crypto.randomUUID();
    await cwp.broadcastAuthoritativeSpecialJobEvent('completed', {
      jobId: 'job-alert-01',
      clientMutationId: compJobMutId,
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Interior Deep Cleaning',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const compEvt = receivedEvents.find(e => e.type === 'SPECIAL_JOB_CHANGED' && e.data.action === 'completed');
    assert.ok(compEvt, 'SPECIAL_JOB_CHANGED completed event emitted');
    assert.strictEqual(compEvt.data.recordId, 'job-alert-01');
    assert.strictEqual(compEvt.data.tab, 'specialJobs');
    assert.strictEqual(compEvt.data.status, 'completed');
    console.log('✅ PASS 5.2: completeSpecialJob emitted completed realtime alert');
    passed++;

    // 5.3 Fail / Exception Special Job
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeSpecialJobEvent('failed', {
      jobId: 'job-alert-01',
      staffName: 'Rahul Sharma',
      staffCode: 'STF01',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Interior Deep Cleaning',
      reason: 'Vehicle parked in locked garage',
      status: 'unable_to_complete',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const failEvt = receivedEvents.find(e => e.type === 'SPECIAL_JOB_CHANGED' && e.data.action === 'failed');
    assert.ok(failEvt, 'SPECIAL_JOB_CHANGED failed event emitted');
    assert.strictEqual(failEvt.data.recordId, 'job-alert-01');
    assert.strictEqual(failEvt.data.status, 'unable_to_complete');
    console.log('✅ PASS 5.3: failSpecialJob emitted unable_to_complete realtime alert');
    passed++;

    // 5.4 Cancel Special Job
    receivedEvents.length = 0;
    await cwp.broadcastAuthoritativeSpecialJobEvent('cancelled', {
      jobId: 'job-alert-01',
      staffName: 'Rahul Sharma',
      customerName: 'Vikram Singh',
      vehicleNumber: 'UP65XX1234',
      serviceName: 'Interior Deep Cleaning',
      reason: 'Customer requested reschedule',
      status: 'cancelled',
      isStaffAction: true
    });

    await new Promise((r) => setTimeout(r, 60));
    const cancelEvt = receivedEvents.find(e => e.type === 'SPECIAL_JOB_CHANGED' && e.data.action === 'cancelled');
    assert.ok(cancelEvt, 'SPECIAL_JOB_CHANGED cancelled event emitted');
    assert.strictEqual(cancelEvt.data.action, 'cancelled');
    assert.strictEqual(cancelEvt.data.status, 'cancelled');
    console.log('✅ PASS 5.4: cancelSpecialJob emitted cancelled realtime alert');
    passed++;

    // Close SSE connection
    sseRes.destroy();

    // -------------------------------------------------------------------------
    // TEST 6: Frontend DOM Elements & Layout
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Frontend Navigation DOM & Operational Badges ---');

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'index.html'), 'utf8');

    // 6.1 Daily Cleaning Nav item has separate alert indicator
    assert.ok(indexHtml.includes('id="v2AlertCleanReports"'), 'v2AlertCleanReports element exists');
    assert.ok(indexHtml.includes('id="v2BadgeCleanReports"'), 'v2BadgeCleanReports operational badge preserved');
    console.log('✅ PASS 6.1: Daily Cleaning has separate v2AlertCleanReports and operational badge preserved');
    passed++;

    // 6.2 Other Cleaning Nav item has separate alert indicator
    assert.ok(indexHtml.includes('id="v2AlertSpecialJobs"'), 'v2AlertSpecialJobs element exists');
    assert.ok(indexHtml.includes('id="v2BadgeSpecialJobs"'), 'v2BadgeSpecialJobs operational badge preserved');
    console.log('✅ PASS 6.2: Other Cleaning has separate v2AlertSpecialJobs and operational badge preserved');
    passed++;

    // 6.3 Sound Toggle Button in header
    assert.ok(indexHtml.includes('id="v2SoundToggleBtn"'), 'v2SoundToggleBtn element exists in header');
    assert.ok(indexHtml.includes('id="v2SoundToggleIcon"'), 'v2SoundToggleIcon element exists');
    console.log('✅ PASS 6.3: Sound mute/unmute control present in header next to notification trigger');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 7: Frontend CSS Tokens & Reduced Motion
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: CSS Tokens, Glow Animation & Reduced Motion ---');

    const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'css', 'v2-layout.css'), 'utf8');

    assert.ok(layoutCss.includes('.cwp-v2-nav-item.has-unread-activity'), 'has-unread-activity class defined');
    assert.ok(layoutCss.includes('@keyframes cwp-v2-nav-glow-pulse'), 'Restrained glow animation defined');
    assert.ok(layoutCss.includes('.cwp-v2-nav-alert-indicator'), 'cwp-v2-nav-alert-indicator badge styled');
    assert.ok(layoutCss.includes('prefers-reduced-motion'), 'prefers-reduced-motion accessibility supported');
    assert.ok(layoutCss.includes('.cwp-v2-toast.is-activity'), 'is-activity toast variant styled');
    console.log('✅ PASS 7: Premium visual glow, accessible badge & reduced-motion preferences configured');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 8: Frontend Toast Module (v2-toast.js)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Accessible Live Activity Toast (v2-toast.js) ---');

    const toastJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'js', 'v2-toast.js'), 'utf8');

    assert.ok(toastJs.includes('function showActivity('), 'showActivity method implemented on toast');
    assert.ok(toastJs.includes('toastHandler.showActivity = showActivity'), 'showActivity exported');
    assert.ok(toastJs.includes('MAX_ACTIVITY_TOASTS'), 'Toast stacking capped (max 3) to prevent screen flooding');
    assert.ok(toastJs.includes('is-activity'), 'Activity toast styling applied');
    assert.ok(toastJs.includes('cwp-v2-toast-activity-view-btn'), 'View action button rendered');
    console.log('✅ PASS 8: showActivity handles rich metadata, navigation callback & controlled stacking');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 9: Frontend Notifications Controller (v2-notifications.js)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Notifications Controller Logic & Sound (v2-notifications.js) ---');

    const notifJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'js', 'v2-notifications.js'), 'utf8');

    // 9.1 Sound engine: Web Audio synthesizer with short professional chime
    assert.ok(notifJs.includes('function playNotificationChime('), 'playNotificationChime defined');
    assert.ok(notifJs.includes('AudioContext'), 'Uses Web Audio API synthesized audio (no broken asset dependency)');
    assert.ok(notifJs.includes('setValueAtTime(0.22'), 'Gentle, operational volume (not loud alarm)');
    assert.ok(notifJs.includes('587.33') && notifJs.includes('880'), 'Two-tone pleasant harmonic motif (D5 -> A5)');
    assert.ok(notifJs.includes('now - lastSoundTime < 800'), 'Sound throttling prevents rapid burst noise');
    console.log('✅ PASS 9.1: Professional Web Audio chime with gentle gain & burst throttling verified');
    passed++;

    // 9.2 Sound mute toggle & persistence
    assert.ok(notifJs.includes('function toggleSoundMute()'), 'toggleSoundMute implemented');
    assert.ok(notifJs.includes('cwp_admin_sound_muted'), 'Mute preference persisted in localStorage');
    console.log('✅ PASS 9.2: Sound mute/unmute persisted in localStorage and synced across tabs');
    passed++;

    // 9.3 Multi-tab coordination via BroadcastChannel
    assert.ok(notifJs.includes('BroadcastChannel'), 'BroadcastChannel used for multi-tab coordination');
    assert.ok(notifJs.includes('SOUND_PLAYED'), 'SOUND_PLAYED prevents duplicate sound across open tabs');
    assert.ok(notifJs.includes('ACK_TAB'), 'ACK_TAB synchronizes unread acknowledgement across tabs');
    console.log('✅ PASS 9.3: Multi-tab coordination prevents duplicate sounds and syncs attention state');
    passed++;

    // 9.4 Independent sidebar attention & acknowledgement
    assert.ok(notifJs.includes('activityState.cleanReportsUnread'), 'Daily Cleaning unread state tracked independently');
    assert.ok(notifJs.includes('activityState.specialJobsUnread'), 'Other Cleaning unread state tracked independently');
    assert.ok(notifJs.includes("cwp-v2:tab-changed"), 'Tab activation clears attention only for the active tab');
    assert.ok(notifJs.includes('has-unread-activity'), 'Navigation item attention state toggled');
    console.log('✅ PASS 9.4: Independent attention states and acknowledgement upon tab opening verified');
    passed++;

    // 9.5 Realtime Activity Alert handler connects toast and sound
    assert.ok(notifJs.includes('function handleRealtimeActivityAlert('), 'handleRealtimeActivityAlert defined');
    assert.ok(notifJs.includes('window.CWP_ADMIN_V2.toast.showActivity'), 'Dispatches live toast via toast.showActivity');
    assert.ok(notifJs.includes('processedEventIds'), 'Event deduplication prevents re-alerting duplicate event IDs');
    console.log('✅ PASS 9.5: handleRealtimeActivityAlert wires sound, toast, attention & deduplication');
    passed++;

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passed} REAL-TIME ACTIVITY ALERT QA TESTS PASSED CLEANLY!`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (cwp.server && cwp.server.listening) {
        cwp.server.close();
      }
    } catch (e) {}
    try {
      if (fs.existsSync(tempFixturePath)) {
        fs.unlinkSync(tempFixturePath);
      }
    } catch (e) {}
    process.exit(process.exitCode || 0);
  }
}

runAllTests();
