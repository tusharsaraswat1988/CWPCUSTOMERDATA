/**
 * =========================================================================
 * CWP ADMIN V2 — TRACK STAFF PHASE 1 & PHASE 4 INTELLIGENCE QA SUITE
 * =========================================================================
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Load .env
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {}

const db = require('../db/index');
const trackingRepo = require('../db/repositories/staffTrackingRepo');

async function runUnitAndDbTests() {
  console.log('--- PART 1: Phase 1 & Phase 4 Unit + Live Neon DB Tests ---');

  // 1. Coordinate & accuracy & freshness classifiers
  assert.strictEqual(trackingRepo.isValidCoordinate(25.3176, 82.9739), true);
  assert.strictEqual(trackingRepo.isValidCoordinate(0, 0), false);
  assert.strictEqual(trackingRepo.isValidCoordinate(95, 82), false);
  assert.strictEqual(trackingRepo.isValidCoordinate(null, 82), false);

  assert.strictEqual(trackingRepo.classifyAccuracy(12), 'good');
  assert.strictEqual(trackingRepo.classifyAccuracy(35), 'moderate');
  assert.strictEqual(trackingRepo.classifyAccuracy(120), 'poor');
  assert.strictEqual(trackingRepo.classifyAccuracy(null), 'unknown');

  assert.strictEqual(trackingRepo.classifyFreshness(new Date().toISOString()), 'live');
  assert.strictEqual(trackingRepo.classifyFreshness(new Date(Date.now() - 5 * 60000).toISOString()), 'recent');
  assert.strictEqual(trackingRepo.classifyFreshness(new Date(Date.now() - 20 * 60000).toISOString()), 'stale');
  assert.strictEqual(trackingRepo.classifyFreshness(new Date(Date.now() - 60 * 60000).toISOString()), 'very_stale');
  assert.strictEqual(trackingRepo.classifyFreshness(null), 'unavailable');
  console.log('[PASS] Coordinate, accuracy, and freshness classifiers');

  // 2. DB transactional test with rollback (zero production data mutation)
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const suffix = Date.now().toString().slice(-6);
    const staffCode = 'QA_TRK_' + suffix;
    const staffRes = await client.query(
      `INSERT INTO public.staff (staff_code, name, phone, is_active)
       VALUES ($1, 'QA Track Staff', $2, TRUE) RETURNING id`,
      [staffCode, '9999' + suffix]
    );
    const staffId = staffRes.rows[0].id;

    // Invalid coordinate rejected
    await assert.rejects(
      () => trackingRepo.recordLocation(staffId, { latitude: 0, longitude: 0 }, client),
      /Invalid GPS coordinates/
    );

    const tNow = new Date();
    const tEarlier = new Date(tNow.getTime() - 10 * 60000);
    const evId = 'qa_ev_' + suffix;

    // Record live fix with device-1
    const r1 = await trackingRepo.recordLocation(staffId, {
      latitude: 25.3176,
      longitude: 82.9739,
      accuracy: 15,
      batteryLevel: 85,
      isCharging: false,
      clientEventId: evId,
      deviceId: 'dev_alpha',
      appVersion: '3.2.1-pwa',
      networkType: '4g',
      connectivityStatus: 'online',
      capturedAt: tNow.toISOString()
    }, client);
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.accuracyTier, 'good');

    // Duplicate clientEventId is idempotent
    const rDup = await trackingRepo.recordLocation(staffId, {
      latitude: 25.3176,
      longitude: 82.9739,
      clientEventId: evId,
      capturedAt: tNow.toISOString()
    }, client);
    assert.strictEqual(rDup.duplicate, true);

    // Out-of-order historical fix does NOT overwrite current position
    const rHist = await trackingRepo.recordLocation(staffId, {
      latitude: 25.3000,
      longitude: 82.9500,
      accuracy: 18,
      clientEventId: 'qa_hist_' + suffix,
      capturedAt: tEarlier.toISOString()
    }, client);
    assert.strictEqual(rHist.historical, true);

    const curAfterHist = await client.query(
      `SELECT last_latitude, last_longitude FROM public.staff_tracking_current WHERE staff_id = $1`,
      [staffId]
    );
    assert.ok(Math.abs(parseFloat(curAfterHist.rows[0].last_latitude) - 25.3176) < 0.0001, 'Historical fix must not overwrite newer live state');

    // Device change detection
    await trackingRepo.recordLocation(staffId, {
      latitude: 25.3180,
      longitude: 82.9742,
      accuracy: 15,
      deviceId: 'dev_beta',
      capturedAt: new Date(tNow.getTime() + 60000).toISOString()
    }, client);
    const devEv = await client.query(
      `SELECT * FROM public.staff_tracking_events WHERE staff_id = $1 AND event_type = 'device_changed'`,
      [staffId]
    );
    assert.strictEqual(devEv.rows.length, 1, 'Device change must record device_changed event');

    // Summary & alert acknowledgement
    const summary = await trackingRepo.getCurrentTrackingSummary(null, client);
    const qaStaff = summary.staff.find(s => s.staffId === staffId);
    assert.ok(qaStaff, 'QA staff must appear in summary');
    assert.strictEqual(qaStaff.deviceId, 'dev_beta');
    assert.strictEqual(qaStaff.previousDeviceId, 'dev_alpha');
    assert.strictEqual(qaStaff.accuracyTier, 'good');

    const ackRes = await trackingRepo.acknowledgeTrackingAlert(devEv.rows[0].id, 'qa_admin', client);
    assert.strictEqual(ackRes.success, true);
    assert.ok(ackRes.alert.acknowledged_at);

    await client.query('ROLLBACK');
    console.log('[PASS] Idempotency, out-of-order protection, device change & alert acknowledgement (rolled back cleanly)');
  } finally {
    client.release();
  }
}

async function runBrowserTests() {
  console.log('--- PART 2: Live Browser UI & Viewport Verification ---');
  const port = process.env.PORT || 3005;
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_intel_qa_'));
  const proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9358', '--user-data-dir=' + dir, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

  let wsUrl;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9358/json/list');
      const list = await r.json();
      const t = list.find(x => x.type === 'page');
      if (t) { wsUrl = t.webSocketDebuggerUrl; break; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.text || 'exception');
  });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: '(async()=>{' + expr + '})()', awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text || 'Eval error');
    return r.result?.result?.value;
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/admin-v2` });
    await new Promise(r => setTimeout(r, 1000));
    await evalJs(`document.getElementById('v2AdminPasswordInput').value = ${JSON.stringify(process.env.ADMIN_PASSWORD)}; document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));`);
    await new Promise(r => setTimeout(r, 1500));
    await evalJs(`window.CWP_ADMIN_V2.shell.navigateTo('staffTracking');`);
    await new Promise(r => setTimeout(r, 2200));

    // Verify 4 detail card tabs & Operational Alert Center
    await evalJs(`document.querySelector('#v2TrkRosterList .cwp-v2-trk-staff-card').click();`);
    await new Promise(r => setTimeout(r, 250));
    const tabs = ['location', 'device', 'operations', 'health'];
    for (const t of tabs) {
      await evalJs(`document.querySelector('[data-trk-detail-tab="${t}"]').click();`);
      const txt = await evalJs(`return document.getElementById('v2TrkMapDetailCard').textContent;`);
      assert.ok(txt.length > 20, `Detail tab ${t} must render content`);
    }
    await evalJs(`document.getElementById('v2TrkAlertsBtn').click();`);
    const alertOpen = await evalJs(`return !document.getElementById('v2TrkAlertPanel').hidden;`);
    assert.ok(alertOpen, 'Operational Alert Center must open');
    await evalJs(`document.getElementById('v2TrkAlertCloseBtn').click();`);
    console.log('[PASS] Detail panel 4 tabs (Location, Device, Operations, Health) & Alert Center verified');

    for (const vp of [{ n: 'Desktop', w: 1440, h: 900, m: false }, { n: 'Tablet', w: 768, h: 1024, m: false }, { n: 'Mobile', w: 390, h: 844, m: true }]) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
      await new Promise(r => setTimeout(r, 250));
      const r = await evalJs(`return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, h: document.getElementById('v2TrkMapCanvas').getBoundingClientRect().height };`);
      assert.ok(!r.overflow && r.h >= 300, `${vp.n} viewport failed`);
      console.log(`[PASS] ${vp.n} (${vp.w}x${vp.h}): overflow=false, mapHeight=${Math.round(r.h)}`);
    }
    assert.strictEqual(errors.length, 0, 'Console errors: ' + errors.join('; '));
    console.log('[PASS] Zero console errors');
  } finally {
    ws.close();
    proc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  try {
    await runUnitAndDbTests();
    await runBrowserTests();
    console.log('ALL PHASE 1 & PHASE 4 INTELLIGENCE QA CHECKS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('INTELLIGENCE QA FAILED:', err);
    process.exit(1);
  }
})();
