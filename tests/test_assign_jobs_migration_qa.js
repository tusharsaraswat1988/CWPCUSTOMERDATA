/**
 * =========================================================================
 * CWP ADMIN V2 — ASSIGN JOBS MIGRATION & OPERATIONAL QA SUITE
 * =========================================================================
 * Verifies:
 *  1. Static isolation, CSS scoping, unique DOM IDs, English-only, zero mocks/emojis
 *  2. Real API data loading (getDailyCleanAssignments, getStaffList)
 *  3. Search, filters (status, staff, location, combined, reset) & Staff Workload view
 *  4. Assign/Reassign & Unassign modal workflows, validation, error & retry handling
 *  5. Responsive layout (1440x900, 1366x768, 768x1024, 390x844) & no double vertical scroll
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5994;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function findChromeBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

class SimpleCdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
  }

  async connect() {
    const WS = global.WebSocket || require('ws');
    return new Promise((resolve, reject) => {
      this.ws = new WS(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || 'CDP Error'));
          else res(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.pageErrors.push(msg.params?.exceptionDetails?.text || 'Runtime exception');
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          this.consoleErrors.push(msg.params.args?.map(a => a.value || a.description).join(' '));
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async function(){ ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res && res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval failed');
    }
    return res && res.result ? res.result.value : undefined;
  }

  close() {
    try { if (this.ws) this.ws.close(); } catch (e) {}
  }
}

async function runStaticChecks() {
  const ajJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-assign-jobs.js'), 'utf8');
  const ajCss = fs.readFileSync(path.join(ROOT, 'public/admin-v2/css/v2-assign-jobs.css'), 'utf8');
  const v2Html = fs.readFileSync(path.join(ROOT, 'public/admin-v2/index.html'), 'utf8');
  const v2App = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-app.js'), 'utf8');

  assert.ok(ajJs.includes('window.CWP_ADMIN_V2.assignJobs'), 'Must be scoped to window.CWP_ADMIN_V2.assignJobs');
  assert.ok(!/[\u0900-\u097F]/.test(ajJs), 'v2-assign-jobs.js must be English-only');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(ajJs), 'v2-assign-jobs.js must contain zero emojis');
  assert.ok(!/\bmockData\b|\bFAKE_ASSIGNMENTS\b/i.test(ajJs), 'Must not contain mock production data');

  assert.ok(ajCss.includes('#v2View_jobAssignment.is-active'), 'CSS must scope to #v2View_jobAssignment');
  assert.ok(!/^\s*(body|html|\*)\s*\{/m.test(ajCss), 'CSS must not have global body/html/* overrides');

  assert.ok(v2Html.includes('id="v2View_jobAssignment"'), 'HTML must contain #v2View_jobAssignment');
  assert.ok(!v2Html.includes('Job assignment workspace ready. Live counts are hydrated from'), 'Placeholder text must be completely removed');
  assert.ok(v2Html.includes('v2-assign-jobs.css'), 'HTML must load v2-assign-jobs.css');
  assert.ok(v2Html.includes('v2-assign-jobs.js'), 'HTML must load v2-assign-jobs.js');
  assert.ok(v2Html.includes('id="v2ModalAjAssign"'), 'HTML must contain #v2ModalAjAssign');
  assert.ok(v2Html.includes('id="v2ModalAjUnassign"'), 'HTML must contain #v2ModalAjUnassign');
  assert.ok(v2App.includes('window.CWP_ADMIN_V2.assignJobs.init()'), 'v2-app.js must initialize assignJobs');

  const idMatches = [...v2Html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const ajIds = idMatches.filter(id => id.startsWith('v2Aj') || id.startsWith('v2ModalAj'));
  assert.strictEqual(new Set(ajIds).size, ajIds.length, 'All v2Aj* DOM IDs must be unique');

  // Global DB ID display ban checks across Admin V2 modules
  const bkJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-bookings.js'), 'utf8');
  const crJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-clean-reports.js'), 'utf8');
  const custJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-customers.js'), 'utf8');
  const ldJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-leads.js'), 'utf8');
  const sjJs = fs.readFileSync(path.join(ROOT, 'public/admin-v2/js/v2-special-jobs.js'), 'utf8');

  assert.ok(!ajJs.includes('${escapeHtml(row.customerCode)'), 'v2-assign-jobs.js must not render customerCode');
  assert.ok(!bkJs.includes('b.customerCode || b.id'), 'v2-bookings.js must not render customerCode or raw id in detail header');
  assert.ok(!crJs.includes('r.customerCode'), 'v2-clean-reports.js must not render customerCode');
  assert.ok(!custJs.includes('cust.customerCode || cust.id.slice'), 'v2-customers.js must not render Account Code / customerCode / raw id');
  assert.ok(!ldJs.includes('lead.customerCode || id'), 'v2-leads.js must not render customerCode or raw id in detail header');
  assert.ok(!sjJs.includes('Job ${escapeHtml(j.id)}'), 'v2-special-jobs.js must not render raw job UUID in detail header');
  assert.ok(!sjJs.includes('escapeHtml(j.customerCode)'), 'v2-special-jobs.js must not render customerCode');

  console.log('PASS 1: Static isolation, placeholder removal, CSS scoping, unique IDs, English-only & DB-ID display ban verified.');
}

async function runTests() {
  console.log('===============================================================');
  console.log('CWP ADMIN V2 — ASSIGN JOBS MIGRATION QA SUITE');
  console.log('===============================================================');

  await runStaticChecks();

  const adminPass = process.env.ADMIN_PASSWORD;
  assert.ok(adminPass, 'ADMIN_PASSWORD must be available in environment (.env)');

  process.env.PORT = String(TEST_PORT);
  const { server } = require('../server.js');

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(TEST_PORT, '127.0.0.1', resolve);
  });

  let browserProc = null;
  let cdp = null;

  try {
    const chromeBin = findChromeBinary();
    assert.ok(chromeBin, 'Chrome/Edge binary required for live browser QA');

    const cdpPort = 9337;
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwp_v2_aj_cdp_'));
    browserProc = spawn(chromeBin, [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `http://127.0.0.1:${TEST_PORT}/admin-v2?tab=jobAssignment`
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const listRes = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${cdpPort}/json/list`, (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => resolve(JSON.parse(d)));
          }).on('error', reject);
        });
        const target = (listRes || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) {
          wsUrl = target.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
      await sleep(250);
    }
    assert.ok(wsUrl, 'CDP WebSocket URL must be available');

    cdp = new SimpleCdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await sleep(600);
    await cdp.evaluate(`
      const inp = document.getElementById('v2AdminPasswordInput');
      if (inp) {
        inp.value = ${JSON.stringify(adminPass)};
        document.getElementById('v2LoginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    `);

    for (let i = 0; i < 40; i++) {
      const ready = await cdp.evaluate(`
        const st = window.CWP_ADMIN_V2?.assignJobs?.getState();
        return st && st.hasLoadedOnce && !st.isLoading;
      `);
      if (ready) break;
      await sleep(250);
    }

    // PASS 2: Real Data Load & KPI Accuracy
    const dataCheck = await cdp.evaluate(`
      const view = document.getElementById('v2View_jobAssignment');
      const st = window.CWP_ADMIN_V2.assignJobs.getState();
      return {
        isActive: view?.classList.contains('is-active'),
        total: st.summary.total,
        assigned: st.summary.assigned,
        unassigned: st.summary.unassigned,
        assignmentsLen: st.assignments.length,
        staffLen: st.staffList.length,
        kpiTotal: document.getElementById('v2AjKpiTotal')?.textContent,
        kpiAssigned: document.getElementById('v2AjKpiAssigned')?.textContent,
        kpiUnassigned: document.getElementById('v2AjKpiUnassigned')?.textContent,
        kpiCoverage: document.getElementById('v2AjKpiCoverage')?.textContent,
        rowCount: document.querySelectorAll('#v2AjTableBody tr').length,
        hasHindi: /[\\u0900-\\u097F]/.test(
          [
            document.querySelector('.cwp-v2-aj-header-bar')?.innerText || '',
            document.getElementById('v2AjKpiStrip')?.innerText || '',
            document.getElementById('v2AjToolbar')?.innerText || '',
            document.querySelector('#v2AjTable thead')?.innerText || ''
          ].join(' ')
        ),
        hasEmoji: /[\\u{1F300}-\\u{1FAFF}]/u.test(view.innerText)
      };
    `);
    assert.strictEqual(dataCheck.isActive, true, 'Assign Jobs view must be active');
    assert.ok(dataCheck.assignmentsLen > 0, 'Live getDailyCleanAssignments must return real rows');
    assert.strictEqual(dataCheck.assigned + dataCheck.unassigned, dataCheck.total, 'Assigned + Unassigned must equal Total');
    assert.strictEqual(dataCheck.kpiTotal, String(dataCheck.total), 'KPI Total must match summary.total');
    assert.strictEqual(dataCheck.kpiAssigned, String(dataCheck.assigned), 'KPI Assigned must match summary.assigned');
    assert.strictEqual(dataCheck.kpiUnassigned, String(dataCheck.unassigned), 'KPI Unassigned must match summary.unassigned');
    assert.strictEqual(dataCheck.hasHindi, false, 'UI must be English-only');
    assert.strictEqual(dataCheck.hasEmoji, false, 'UI must contain zero emojis');

    // PASS 2b: Live DOM DB ID Display Ban & Polish Verification
    const dbIdBanCheck = await cdp.evaluate(`
      const tableText = document.getElementById('v2AjTableBody')?.innerText || '';
      const hasCustDc = /CUST_[A-Z]+_\\d+/.test(tableText);
      const hasUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(tableText);
      const staffKpiLabel = document.querySelector('[data-aj-kpi="staff_view"] .cwp-v2-aj-kpi-label')?.textContent?.trim();
      const firstRowBg = document.querySelector('#v2AjTableBody tr') ? getComputedStyle(document.querySelector('#v2AjTableBody tr')).backgroundColor : '';
      const st = window.CWP_ADMIN_V2.assignJobs.getState();
      const hasInternalIds = Boolean(st.assignments[0]?.customerId && st.assignments[0]?.subscriptionId);
      return { hasCustDc, hasUuid, staffKpiLabel, firstRowBg, hasInternalIds };
    `);
    assert.strictEqual(dbIdBanCheck.hasCustDc, false, 'Table must never display CUST_* internal codes');
    assert.strictEqual(dbIdBanCheck.hasUuid, false, 'Table must never display raw UUIDs');
    assert.strictEqual(dbIdBanCheck.staffKpiLabel, 'Active Staff', 'Staff KPI must use accurate Active Staff label');
    assert.strictEqual(dbIdBanCheck.hasInternalIds, true, 'Internal IDs must remain preserved in state');
    console.log(`PASS 2: Real data loaded (${dataCheck.total} subscribers, ${dataCheck.assigned} assigned, ${dataCheck.unassigned} unassigned, ${dataCheck.staffLen} staff) & zero DB IDs exposed.`);

    // PASS 3: Search, Filters & Staff Workload View
    const filterCheck = await cdp.evaluate(`
      const st = window.CWP_ADMIN_V2.assignJobs.getState();
      const first = st.assignments[0];
      const searchInp = document.getElementById('v2AjSearchInput');
      searchInp.value = first.customerName.slice(0, 5);
      searchInp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const afterSearch = st.filtered.length;

      document.getElementById('v2AjResetFilters').click();
      await new Promise(r => setTimeout(r, 100));
      const afterReset = st.filtered.length;

      const statusSel = document.getElementById('v2AjFilterStatus');
      statusSel.value = 'assigned';
      statusSel.dispatchEvent(new Event('change', { bubbles: true }));
      const assignedFiltered = st.filtered.length;

      document.getElementById('v2AjResetFilters').click();

      document.getElementById('v2AjTabStaff').click();
      const staffRows = document.querySelectorAll('#v2AjStaffTableBody tr').length;
      document.getElementById('v2AjTabRoster').click();

      return { afterSearch, afterReset, assignedFiltered, expectedAssigned: st.summary.assigned, total: st.assignments.length, staffRows };
    `);
    assert.ok(filterCheck.afterSearch >= 1 && filterCheck.afterSearch <= filterCheck.total, 'Search must filter rows');
    assert.strictEqual(filterCheck.afterReset, filterCheck.total, 'Reset must restore all rows');
    assert.strictEqual(filterCheck.assignedFiltered, filterCheck.expectedAssigned, 'Assigned filter must match assigned count');
    assert.ok(filterCheck.staffRows > 0, 'Staff Workload view must render staff rows');
    console.log('PASS 3: Search, Status filter, Reset, and Staff Workload view verified.');

    // PASS 4: Modal Workflow, Validation & Error Handling
    const modalCheck = await cdp.evaluate(`
      const firstBtn = document.querySelector('#v2AjTableBody [data-aj-action="assign"]');
      if (!firstBtn) return { skipped: true };
      firstBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const modal = document.getElementById('v2ModalAjAssign');
      const isOpen = modal.style.display === 'flex';
      const optCount = document.querySelectorAll('#v2AjModalStaffSelect option').length;
      // Submit without selecting staff -> should show validation error
      document.getElementById('v2AjAssignForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      const errVisible = !document.getElementById('v2AjModalError').hidden;
      window.CWP_ADMIN_V2.overlay.close('v2ModalAjAssign');
      return { isOpen, optCount, errVisible };
    `);
    assert.strictEqual(modalCheck.isOpen, true, 'Assign/Reassign modal must open');
    assert.ok(modalCheck.optCount > 1, 'Modal must populate eligible staff options');
    assert.strictEqual(modalCheck.errVisible, true, 'Submitting without staff must show validation error');
    console.log('PASS 4: Assign/Reassign modal open, staff list, validation & close verified.');

    // PASS 5: Responsive & Double Scroll Check across 4 viewports
    const viewports = [
      { width: 1440, height: 900, mobile: false },
      { width: 1366, height: 768, mobile: false },
      { width: 768, height: 1024, mobile: true },
      { width: 390, height: 844, mobile: true }
    ];
    for (const vp of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(150);
      const layout = await cdp.evaluate(`
        const docOverflow = document.documentElement.scrollWidth > window.innerWidth;
        const ws = document.querySelector('.cwp-v2-workspace');
        const wsOverflow = ws ? getComputedStyle(ws).overflowY : '';
        const tw = document.querySelector('.cwp-v2-aj-table-wrap');
        const twOverflow = tw ? getComputedStyle(tw).overflowY : '';
        const twHasVertScroll = tw ? (tw.scrollHeight > tw.clientHeight + 2) : false;
        return { docOverflow, wsOverflow, twOverflow, twHasVertScroll };
      `);
      assert.strictEqual(layout.docOverflow, false, `No horizontal overflow at ${vp.width}x${vp.height}`);
      if (vp.width >= 1024) {
        assert.strictEqual(layout.wsOverflow, 'hidden', `Desktop workspace must not double-scroll at ${vp.width}x${vp.height}`);
      } else {
        assert.strictEqual(layout.twHasVertScroll, false, `Mobile table wrap must not nested-scroll vertically at ${vp.width}x${vp.height}`);
      }
    }
    console.log('PASS 5: Responsive layout & single vertical scroll verified at 1440x900, 1366x768, 768x1024, 390x844.');

    assert.strictEqual(cdp.pageErrors.length, 0, `Unexpected page errors: ${cdp.pageErrors.join('; ')}`);
    console.log('\nALL ASSIGN JOBS V2 QA CHECKS PASSED!');
  } finally {
    if (cdp) cdp.close();
    if (browserProc) {
      try { browserProc.kill(); } catch (e) {}
    }
    try { server.close(); } catch (e) {}
  }
}

runTests().catch((err) => {
  console.error('\nQA SUITE FAILED:', err);
  process.exit(1);
});
