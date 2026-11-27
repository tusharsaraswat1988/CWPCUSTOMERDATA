/**
 * Phase 7 Verification: V1 Residual Cleanup & Canonical /admin Routing
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_PORT = 5996;
const ROOT = path.join(__dirname, '..');
const serverModule = require('../server.js');
const server = serverModule.server || serverModule;

function request(urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: opts.method || 'GET',
      headers: opts.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function run() {
  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('===============================================================');
  console.log('🧹 V1 CLEANUP & CANONICAL /ADMIN ROUTING VERIFICATION');
  console.log('===============================================================');

  // 1. Static V1 Residual Checks
  const indexHtml = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  const staffM3Css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'staff-m3.css'), 'utf8');
  const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const deadIndexIds = [
    'adminHeader', 'adminView', 'adminAuthGate', 'adminUnlockedContent',
    'adminSidebar', 'adminLogoutBtn', 'adminPasswordInput', 'adminAuthForm',
    'cwp-neural-login', 'cwp-neural-core',
    'editCleanReportModal', 'deleteCleanReportModal', 'lightboxAdminActionsWrap',
    'addCustomerModal', 'editCustomerModal', 'assignServiceModal',
    'staffEditModal', 'addStaffModal', 'cwpPhotoCropperModal',
    'addLeadModal', 'convertLeadModal', 'leadNoteModal',
    'assignSpecialJobModal', 'reassignJobModal', 'designationManagementModal',
    'sellPackageModal', 'redeemPackageModal', 'packageHistoryModal',
    'createBookingModal', 'staffHierarchyModal', 'rmCreateRouteModal',
    'cropper.min.js', 'cropper.min.css'
  ];
  for (const id of deadIndexIds) {
    assert(!indexHtml.includes(id), `Index.html free of V1 residual: ${id}`);
  }
  assert(!indexHtml.includes("initialMode : 'admin'"), 'Index.html initialMode fallback is not admin');
  assert(indexHtml.includes('id="staffHeader"') && indexHtml.includes('id="staffView"'), 'Index.html preserves Staff Portal');

  // 1b. Active Staff CSS free of V1 Admin selectors & mode-switching
  const deadCssSelectors = [
    '#adminHeader', '#adminView', '#adminAuthGate', '#adminTab',
    '.admin-mode-active', '#adminLogoutBtn', '.admin-sidebar',
    '.admin-layout-wrapper', '.admin-main-workspace', '.cropper-',
    'cwp-neural-login'
  ];
  for (const sel of deadCssSelectors) {
    assert(!styleCss.includes(sel), `public/css/style.css free of V1 selector: ${sel}`);
    assert(!staffM3Css.includes(sel), `public/css/staff-m3.css free of V1 selector: ${sel}`);
  }

  // 1c. Active Staff JS free of V1 Admin handlers & initialization
  const deadAppSymbols = [
    'function isUserAdminAuthenticated', 'function initAdminAutoLogin', 'function handleAdminAuth',
    'function checkAdminAuthStatus', 'function getAdminToken', 'function clearAdminTokens',
    'function initAdminRealtimeStream', 'function openCropperModal',
    'function openEditReportStatusModal', 'function openDeleteReportModal',
    'function switchAdminTab', 'function toggleAdminSidebar', 'function loadAdminRecords',
    'function initAdminRouteManagement', 'function initAdminSequenceManager',
    'function loadStaffTrackingTab', 'function pingStaffFromAdmin',
    'function renderAdminSpecialJobsTable', 'function loadDailyCleanReports',
    'TrackingMapAdapter', 'cwp-neural-login', 'cwp-neural-core'
  ];
  for (const sym of deadAppSymbols) {
    assert(!appJs.includes(sym), `public/js/app.js free of V1 residual: ${sym}`);
  }
  assert(!appJs.includes("var initialMode = 'admin'"), 'public/js/app.js initialMode is not admin');
  assert(!fs.existsSync(path.join(ROOT, 'public', 'js', 'cropper.min.js')), 'public/js/cropper.min.js deleted');
  assert(!fs.existsSync(path.join(ROOT, 'public', 'css', 'cwp-neural-login.css')), 'public/css/cwp-neural-login.css absent');
  assert(!fs.existsSync(path.join(ROOT, 'public', 'js', 'cwp-neural-core.js')), 'public/js/cwp-neural-core.js absent');

  // 1d. Service Worker & Package.json integrity
  assert(swJs.includes("'/admin'") && swJs.includes("'/admin-v2'"), 'sw.js bypasses /admin and /admin-v2');
  assert(!swJs.includes('cropper') && !swJs.includes('cwp-neural'), 'sw.js free of deleted V1 assets');

  const allTestScripts = `${pkgJson.scripts?.test || ''} && ${pkgJson.scripts?.['test:neon'] || ''}`;
  assert(!allTestScripts.includes('test_cwp_admin_neural_login_qa.js'), 'package.json free of obsolete neural login test');
  const referencedTests = allTestScripts.match(/tests\/[a-zA-Z0-9_.-]+\.js/g) || [];
  for (const relTest of referencedTests) {
    assert(fs.existsSync(path.join(ROOT, relTest)), `package.json referenced test exists: ${relTest}`);
  }

  // 2. Canonical Routing & Security Checks
  await new Promise((resolve, reject) => {
    server.listen(TEST_PORT, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  try {
    const rAdmin = await request('/admin');
    assert(rAdmin.status === 200 && rAdmin.body.includes('cwp-v2-root'), 'GET /admin -> 200 serves Admin V2 directly');

    const rAdminSlash = await request('/admin/');
    assert(rAdminSlash.status === 200 && rAdminSlash.body.includes('cwp-v2-root'), 'GET /admin/ -> 200 serves Admin V2');

    for (const tab of ['customers', 'leads', 'sequence']) {
      const rTab = await request(`/admin?tab=${tab}`);
      assert(rTab.status === 200 && rTab.body.includes('cwp-v2-root'), `GET /admin?tab=${tab} -> 200 serves Admin V2`);
    }

    const rV2 = await request('/admin-v2');
    assert(rV2.status === 302 && rV2.headers.location === '/admin', 'GET /admin-v2 -> 302 Location: /admin');

    const rV2Slash = await request('/admin-v2/');
    assert(rV2Slash.status === 302 && rV2Slash.headers.location === '/admin', 'GET /admin-v2/ -> 302 Location: /admin');

    const rV2UiLab = await request('/admin-v2/ui-lab');
    assert(rV2UiLab.status === 302 && rV2UiLab.headers.location === '/admin/ui-lab', 'GET /admin-v2/ui-lab -> 302 Location: /admin/ui-lab');

    const rV2Tab = await request('/admin-v2?tab=leads');
    assert(rV2Tab.status === 302 && rV2Tab.headers.location === '/admin?tab=leads', 'GET /admin-v2?tab=leads -> 302 Location: /admin?tab=leads');

    const rQuery1 = await request('/?admin=1');
    assert(rQuery1.status === 302 && rQuery1.headers.location === '/admin', 'GET /?admin=1 -> 302 Location: /admin');

    const rQueryAny = await request('/?admin=anything');
    assert(rQueryAny.status === 302 && rQueryAny.headers.location === '/admin', 'GET /?admin=anything -> 302 Location: /admin');

    const rCss = await request('/admin-v2/css/v2-tokens.css');
    assert(rCss.status === 200, 'GET /admin-v2/css/v2-tokens.css -> 200');

    const rAppJs = await request('/admin-v2/js/v2-app.js');
    assert(rAppJs.status === 200 && rAppJs.body.includes("const basePath = '/admin'"), 'v2-app.js uses /admin basePath');

    const rShellJs = await request('/admin-v2/js/v2-shell.js');
    assert(rShellJs.status === 200 && rShellJs.body.includes("const basePath = '/admin'"), 'v2-shell.js uses /admin basePath');

    const rStaff = await request('/staff');
    assert(rStaff.status === 200 && rStaff.body.includes('staff-mode-active') && rStaff.body.includes('id="staffHeader"'), 'GET /staff -> 200 Staff Portal intact');

    const rHome = await request('/');
    assert(rHome.status === 200, 'GET / -> 200 Public Homepage intact');

    const rCareers = await request('/careers');
    assert(rCareers.status === 200, 'GET /careers -> 200 Careers intact');

    const rApi = await request('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAllCustomers' })
    });
    assert(rApi.status === 401, 'Unauthenticated POST /api getAllCustomers -> 401');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
