/**
 * Verification Script: Admin V2 Isolation & UI Playground Smoke Test
 * Refined under Task 01.1
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const TEST_PORT = 5998;
const serverModule = require('../server.js');
const server = serverModule.server || serverModule;

let serverInstance = null;

function request(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runVerification() {
  console.log('===============================================================');
  console.log('🚀 RUNNING ADMIN V2 ISOLATION & TASK 01.1 REFINEMENT VERIFICATION');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Start test server
  await new Promise((resolve, reject) => {
    serverInstance = server.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[Test Setup] Server listening on http://127.0.0.1:${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // 1. Verify Canonical Admin Route & UI Lab Route
    const resV2 = await request('/admin');
    assert(resV2.status === 200, 'GET /admin returns HTTP 200');
    assert(resV2.body.includes('cwp-v2-root'), 'GET /admin serves V2 HTML with cwp-v2-root');
    assert(resV2.body.includes('UI Playground'), 'GET /admin includes UI Playground navigation');

    const resUiLab = await request('/admin/ui-lab');
    assert(resUiLab.status === 200, 'GET /admin/ui-lab returns HTTP 200');
    assert(resUiLab.body.includes('v2View_ui-lab'), 'GET /admin/ui-lab serves UI Lab section');
    assert(resUiLab.body.includes('v2ToggleHitAreaBtn'), 'UI Lab includes Hit Area inspector button');
    assert(resUiLab.body.includes('cwp-v2-btn-md-legacy'), 'UI Lab includes 34px vs 36px size comparison');
    assert(resUiLab.body.includes('v2-sec-inputs'), 'UI Lab includes Task 02 Section 10 Input Components');
    assert(resUiLab.body.includes('v2DemoSearchClearBtn'), 'UI Lab includes Search clear button demo');
    assert(resUiLab.body.includes('v2DemoPasswordToggleBtn'), 'UI Lab includes Password reveal button demo');
    assert(resUiLab.body.includes('v2DemoTextareaCounter'), 'UI Lab includes Textarea character counter demo');
    assert(resUiLab.body.includes('v2DemoValidateTriggerBtn'), 'UI Lab includes Live validation trigger demo');
    // Task 03 Table System UI Lab checks
    assert(resUiLab.body.includes('v2-sec-tables'), 'UI Lab includes Task 03 Section 11 Table & Data Grid');
    assert(resUiLab.body.includes('v2DemoTable'), 'UI Lab includes Data Grid Table');
    assert(resUiLab.body.includes('v2DemoTableSelectAll'), 'UI Lab includes Table Select-All Checkbox');
    assert(resUiLab.body.includes('v2DemoTableBulkBar'), 'UI Lab includes Bulk Actions Toolbar');
    assert(resUiLab.body.includes('v2DemoTableSearchInput'), 'UI Lab includes Table Search Input');
    assert(resUiLab.body.includes('v2DemoTablePaginationInfo'), 'UI Lab includes Pagination Range Display');
    assert(resUiLab.body.includes('v2DemoTablePageSizeSelect'), 'UI Lab includes Page Size Selector');
    assert(resUiLab.body.includes('v2-density-btn'), 'UI Lab includes Table Density Switcher buttons');
    assert(resUiLab.body.includes('v2-table-state-btn'), 'UI Lab includes Table State Preview buttons');
    // Task 04 Overlay & Drawer UI Lab checks
    assert(resUiLab.body.includes('v2-sec-overlays'), 'UI Lab includes Task 04 Section 12 Modals & Drawers');
    assert(resUiLab.body.includes('v2ModalStandard'), 'UI Lab includes Standard Form Modal');
    assert(resUiLab.body.includes('v2ModalLarge'), 'UI Lab includes Large Multi-Section Modal');
    assert(resUiLab.body.includes('v2ModalConfirm'), 'UI Lab includes Confirmation Dialog');
    assert(resUiLab.body.includes('v2ModalDestructive'), 'UI Lab includes Destructive Confirmation Dialog');
    assert(resUiLab.body.includes('v2DrawerDetail'), 'UI Lab includes Record Detail Drawer');
    assert(resUiLab.body.includes('v2DrawerOperational'), 'UI Lab includes Full-Height Operational Drawer');
    assert(resUiLab.body.includes('v2ModalNestedConfirm'), 'UI Lab includes Nested Confirmation Dialog');
    assert(resUiLab.body.includes('/admin-v2/js/v2-overlay.js'), 'UI Lab includes v2-overlay.js script tag');
    // Task 05 Form & Input UI Lab checks
    assert(resUiLab.body.includes('v2-sec-forms'), 'UI Lab includes Task 05 Section 13 Form & Input System');
    assert(resUiLab.body.includes('v2DemoValidationForm'), 'UI Lab includes Interactive Validation Form Demo');
    assert(resUiLab.body.includes('v2DemoFormAlert'), 'UI Lab includes Form Validation Alert Banner');
    assert(resUiLab.body.includes('demoStepperInput'), 'UI Lab includes Numeric Stepper component');
    assert(resUiLab.body.includes('demoFileDropzone'), 'UI Lab includes File Upload Dropzone');
    assert(resUiLab.body.includes('v2View_dashboard'), 'UI Lab / V2 includes encapsulated Dashboard Scaffold View');

    // 2. Verify Foundation Tokens & CSS Scoping
    const resTokens = await request('/admin-v2/css/v2-tokens.css');
    assert(resTokens.status === 200, 'GET /admin-v2/css/v2-tokens.css returns HTTP 200');
    assert(resTokens.body.includes('--cwp-v2-sys-primary'), 'v2-tokens.css contains primary color token');
    assert(resTokens.body.includes('--cwp-v2-btn-h-md: 36px'), 'v2-tokens.css specifies refined 36px default height');
    assert(resTokens.body.includes('--cwp-v2-btn-h-md-legacy: 34px'), 'v2-tokens.css retains 34px comparison token');
    assert(resTokens.body.includes('--cwp-v2-type-display-size'), 'v2-tokens.css contains typography scale tokens');
    assert(resTokens.body.includes('--cwp-v2-input-h-sm: 28px'), 'v2-tokens.css contains compact input height (28px)');
    assert(resTokens.body.includes('--cwp-v2-input-h-md: 36px'), 'v2-tokens.css contains standard input height (36px)');
    assert(resTokens.body.includes('--cwp-v2-input-h-lg: 42px'), 'v2-tokens.css contains comfortable input height (42px)');
    // Task 03 Table Tokens
    assert(resTokens.body.includes('--cwp-v2-table-row-height: 36px'), 'v2-tokens.css contains standard table row height (36px)');
    assert(resTokens.body.includes('--cwp-v2-table-row-h-compact: 30px'), 'v2-tokens.css contains compact table row height (30px)');
    assert(resTokens.body.includes('--cwp-v2-table-row-h-lg: 46px'), 'v2-tokens.css contains comfortable table row height (46px)');
    assert(resTokens.body.includes('--cwp-v2-table-header-h: 38px'), 'v2-tokens.css contains table header height (38px)');
    assert(resTokens.body.includes('--cwp-v2-table-row-selected-bg: #f0f7ff'), 'v2-tokens.css contains restrained selected row background tint');
    // Task 04 Overlay Tokens
    assert(resTokens.body.includes('--cwp-v2-modal-w-sm: 420px'), 'v2-tokens.css contains confirmation modal width (420px)');
    assert(resTokens.body.includes('--cwp-v2-modal-w-md: 540px'), 'v2-tokens.css contains standard modal width (540px)');
    assert(resTokens.body.includes('--cwp-v2-modal-w-lg: 820px'), 'v2-tokens.css contains large modal width (820px)');
    assert(resTokens.body.includes('--cwp-v2-drawer-w-md: 420px'), 'v2-tokens.css contains detail drawer width (420px)');
    assert(resTokens.body.includes('--cwp-v2-drawer-w-lg: 680px'), 'v2-tokens.css contains operational drawer width (680px)');
    assert(resTokens.body.includes('--cwp-v2-z-backdrop: 1000'), 'v2-tokens.css contains backdrop z-index token');
    assert(resTokens.body.includes('--cwp-v2-z-drawer: 1050'), 'v2-tokens.css contains drawer z-index token');
    assert(resTokens.body.includes('--cwp-v2-z-modal: 1100'), 'v2-tokens.css contains modal z-index token');
    assert(resTokens.body.includes('--cwp-v2-z-nested-backdrop: 1200'), 'v2-tokens.css contains nested backdrop z-index token');
    assert(resTokens.body.includes('--cwp-v2-z-nested-modal: 1250'), 'v2-tokens.css contains nested modal z-index token');
    // Task 05 Form & Selection Tokens
    assert(resTokens.body.includes('--cwp-v2-switch-w: 38px'), 'v2-tokens.css contains standard switch width (38px)');
    assert(resTokens.body.includes('--cwp-v2-switch-h: 22px'), 'v2-tokens.css contains standard switch height (22px)');
    assert(resTokens.body.includes('--cwp-v2-switch-thumb: 16px'), 'v2-tokens.css contains standard switch thumb (16px)');
    assert(resTokens.body.includes('--cwp-v2-switch-w-sm: 30px'), 'v2-tokens.css contains compact switch width (30px)');
    assert(resTokens.body.includes('--cwp-v2-radio-size: 16px'), 'v2-tokens.css contains radio size token (16px)');
    assert(resTokens.body.includes('--cwp-v2-select-arrow-size: 18px'), 'v2-tokens.css contains select arrow size token');

    const resComponents = await request('/admin-v2/css/v2-components.css');
    assert(resComponents.status === 200, 'GET /admin-v2/css/v2-components.css returns HTTP 200');
    assert(resComponents.body.includes('.cwp-v2-btn-primary'), 'v2-components.css contains .cwp-v2-btn-primary');
    assert(resComponents.body.includes('.cwp-v2-btn-secondary'), 'v2-components.css contains .cwp-v2-btn-secondary');
    assert(resComponents.body.includes('.cwp-v2-btn-tertiary'), 'v2-components.css contains .cwp-v2-btn-tertiary');
    assert(resComponents.body.includes('.cwp-v2-btn-tonal'), 'v2-components.css contains .cwp-v2-btn-tonal');
    assert(resComponents.body.includes('.cwp-v2-btn-danger'), 'v2-components.css contains .cwp-v2-btn-danger');
    assert(resComponents.body.includes('.cwp-v2-btn-danger-solid'), 'v2-components.css contains .cwp-v2-btn-danger-solid');
    assert(resComponents.body.includes('.cwp-v2-btn-icon'), 'v2-components.css contains .cwp-v2-btn-icon');
    assert(resComponents.body.includes('.cwp-v2-btn-sm'), 'v2-components.css contains .cwp-v2-btn-sm');
    assert(resComponents.body.includes('.cwp-v2-btn-md-legacy'), 'v2-components.css contains .cwp-v2-btn-md-legacy');
    assert(resComponents.body.includes('.cwp-v2-btn-lg'), 'v2-components.css contains .cwp-v2-btn-lg');
    assert(resComponents.body.includes('.is-loading'), 'v2-components.css contains .is-loading');
    assert(resComponents.body.includes('.cwp-v2-radius-box'), 'v2-components.css contains .cwp-v2-radius-box');
    assert(!resComponents.body.includes('border: 2px solid var(--cwp-v2-ref-blue-600)'), 'v2-components.css eliminated bright blue radius borders');
    // Input System Classes
    assert(resComponents.body.includes('.cwp-v2-field'), 'v2-components.css contains .cwp-v2-field');
    assert(resComponents.body.includes('.cwp-v2-field-label'), 'v2-components.css contains .cwp-v2-field-label');
    assert(resComponents.body.includes('.cwp-v2-req-star'), 'v2-components.css contains .cwp-v2-req-star');
    assert(resComponents.body.includes('.cwp-v2-input-box'), 'v2-components.css contains .cwp-v2-input-box');
    assert(resComponents.body.includes('.cwp-v2-input'), 'v2-components.css contains .cwp-v2-input');
    assert(resComponents.body.includes('.cwp-v2-input-sm'), 'v2-components.css contains .cwp-v2-input-sm');
    assert(resComponents.body.includes('.cwp-v2-input-md'), 'v2-components.css contains .cwp-v2-input-md');
    assert(resComponents.body.includes('.cwp-v2-input-lg'), 'v2-components.css contains .cwp-v2-input-lg');
    assert(resComponents.body.includes('.cwp-v2-input-leading-icon'), 'v2-components.css contains .cwp-v2-input-leading-icon');
    assert(resComponents.body.includes('.cwp-v2-input-action-btn'), 'v2-components.css contains .cwp-v2-input-action-btn');
    assert(resComponents.body.includes('.cwp-v2-input-prefix'), 'v2-components.css contains .cwp-v2-input-prefix');
    assert(resComponents.body.includes('.cwp-v2-input-suffix'), 'v2-components.css contains .cwp-v2-input-suffix');
    assert(resComponents.body.includes('.cwp-v2-textarea'), 'v2-components.css contains .cwp-v2-textarea');
    assert(resComponents.body.includes('.has-error'), 'v2-components.css contains .has-error');
    assert(resComponents.body.includes('.has-success'), 'v2-components.css contains .has-success');
    assert(resComponents.body.includes('.cwp-v2-field-counter'), 'v2-components.css contains .cwp-v2-field-counter');
    // Task 03 Table Classes
    assert(resComponents.body.includes('.cwp-v2-data-grid'), 'v2-components.css contains .cwp-v2-data-grid');
    assert(resComponents.body.includes('.cwp-v2-table-toolbar'), 'v2-components.css contains .cwp-v2-table-toolbar');
    assert(resComponents.body.includes('.cwp-v2-bulk-bar'), 'v2-components.css contains .cwp-v2-bulk-bar');
    assert(resComponents.body.includes('.cwp-v2-table-container'), 'v2-components.css contains .cwp-v2-table-container');
    assert(resComponents.body.includes('.cwp-v2-table'), 'v2-components.css contains .cwp-v2-table');
    assert(resComponents.body.includes('.is-sortable'), 'v2-components.css contains .is-sortable');
    assert(resComponents.body.includes('.is-numeric'), 'v2-components.css contains .is-numeric');
    assert(resComponents.body.includes('.is-selected'), 'v2-components.css contains .is-selected');
    assert(resComponents.body.includes('.is-compact'), 'v2-components.css contains .is-compact');
    assert(resComponents.body.includes('.is-comfortable'), 'v2-components.css contains .is-comfortable');
    assert(resComponents.body.includes('.cwp-v2-checkbox'), 'v2-components.css contains .cwp-v2-checkbox');
    assert(resComponents.body.includes('.cwp-v2-table-pagination'), 'v2-components.css contains .cwp-v2-table-pagination');
    assert(resComponents.body.includes('.cwp-v2-skeleton-cell'), 'v2-components.css contains .cwp-v2-skeleton-cell');
    assert(resComponents.body.includes('.cwp-v2-table-state-box'), 'v2-components.css contains .cwp-v2-table-state-box');
    // Task 04 Overlay Classes
    assert(resComponents.body.includes('body.cwp-v2-modal-open'), 'v2-components.css contains body scroll lock rule');
    assert(resComponents.body.includes('.cwp-v2-overlay-backdrop'), 'v2-components.css contains .cwp-v2-overlay-backdrop');
    assert(resComponents.body.includes('.cwp-v2-modal'), 'v2-components.css contains .cwp-v2-modal');
    assert(resComponents.body.includes('.cwp-v2-modal-sm'), 'v2-components.css contains .cwp-v2-modal-sm');
    assert(resComponents.body.includes('.cwp-v2-modal-md'), 'v2-components.css contains .cwp-v2-modal-md');
    assert(resComponents.body.includes('.cwp-v2-modal-lg'), 'v2-components.css contains .cwp-v2-modal-lg');
    assert(resComponents.body.includes('.cwp-v2-modal-header'), 'v2-components.css contains .cwp-v2-modal-header');
    assert(resComponents.body.includes('.cwp-v2-modal-title'), 'v2-components.css contains .cwp-v2-modal-title');
    assert(resComponents.body.includes('.cwp-v2-modal-body'), 'v2-components.css contains .cwp-v2-modal-body');
    assert(resComponents.body.includes('.cwp-v2-modal-footer'), 'v2-components.css contains .cwp-v2-modal-footer');
    assert(resComponents.body.includes('.cwp-v2-drawer-backdrop'), 'v2-components.css contains .cwp-v2-drawer-backdrop');
    assert(resComponents.body.includes('.cwp-v2-drawer'), 'v2-components.css contains .cwp-v2-drawer');
    assert(resComponents.body.includes('.cwp-v2-drawer-md'), 'v2-components.css contains .cwp-v2-drawer-md');
    assert(resComponents.body.includes('.cwp-v2-drawer-lg'), 'v2-components.css contains .cwp-v2-drawer-lg');
    assert(resComponents.body.includes('.cwp-v2-drawer-header'), 'v2-components.css contains .cwp-v2-drawer-header');
    assert(resComponents.body.includes('.cwp-v2-drawer-body'), 'v2-components.css contains .cwp-v2-drawer-body');
    assert(resComponents.body.includes('.cwp-v2-drawer-footer'), 'v2-components.css contains .cwp-v2-drawer-footer');
    assert(resComponents.body.includes('.cwp-v2-dialog-icon-danger'), 'v2-components.css contains .cwp-v2-dialog-icon-danger');
    assert(resComponents.body.includes('.cwp-v2-consequence-box'), 'v2-components.css contains .cwp-v2-consequence-box');
    // Task 05 Form & Selection Component Classes
    assert(resComponents.body.includes('.cwp-v2-select'), 'v2-components.css contains .cwp-v2-select');
    assert(resComponents.body.includes('.cwp-v2-select-sm'), 'v2-components.css contains compact 28px select');
    assert(resComponents.body.includes('.cwp-v2-select-lg'), 'v2-components.css contains comfortable 42px select');
    assert(resComponents.body.includes('.cwp-v2-select-box'), 'v2-components.css contains .cwp-v2-select-box');
    assert(resComponents.body.includes('.cwp-v2-radio'), 'v2-components.css contains .cwp-v2-radio');
    assert(resComponents.body.includes('.cwp-v2-choice-group'), 'v2-components.css contains .cwp-v2-choice-group');
    assert(resComponents.body.includes('.cwp-v2-choice-group-inline'), 'v2-components.css contains .cwp-v2-choice-group-inline');
    assert(resComponents.body.includes('.cwp-v2-switch'), 'v2-components.css contains .cwp-v2-switch');
    assert(resComponents.body.includes('.cwp-v2-switch-sm'), 'v2-components.css contains .cwp-v2-switch-sm');
    assert(resComponents.body.includes('.cwp-v2-stepper'), 'v2-components.css contains .cwp-v2-stepper');
    assert(resComponents.body.includes('.cwp-v2-file-dropzone'), 'v2-components.css contains .cwp-v2-file-dropzone');
    assert(resComponents.body.includes('.cwp-v2-file-preview-pill'), 'v2-components.css contains .cwp-v2-file-preview-pill');
    assert(resComponents.body.includes('.cwp-v2-form-grid'), 'v2-components.css contains .cwp-v2-form-grid');
    assert(resComponents.body.includes('.cwp-v2-form-section'), 'v2-components.css contains .cwp-v2-form-section');
    assert(resComponents.body.includes('.cwp-v2-form-alert'), 'v2-components.css contains .cwp-v2-form-alert');

    // 3. Verify Playground JS & Overlay JS
    const resOverlayJs = await request('/admin-v2/js/v2-overlay.js');
    assert(resOverlayJs.status === 200, 'GET /admin-v2/js/v2-overlay.js returns HTTP 200');
    assert(resOverlayJs.body.includes('window.CWP_ADMIN_V2.overlay'), 'v2-overlay.js exports under namespace');
    assert(resOverlayJs.body.includes('open'), 'v2-overlay.js supports open method');
    assert(resOverlayJs.body.includes('close'), 'v2-overlay.js supports close method');
    assert(resOverlayJs.body.includes('trapTabFocus'), 'v2-overlay.js supports accessible focus trap');
    assert(resOverlayJs.body.includes('handleGlobalKeydown'), 'v2-overlay.js supports ESC key dismissal');

    const resPlaygroundJs = await request('/admin-v2/js/v2-playground.js');
    assert(resPlaygroundJs.status === 200, 'GET /admin-v2/js/v2-playground.js returns HTTP 200');
    assert(resPlaygroundJs.body.includes('window.CWP_ADMIN_V2.playground'), 'v2-playground.js exports under namespace');
    assert(resPlaygroundJs.body.includes('bindHitAreaToggle'), 'v2-playground.js supports hit area inspection');
    assert(resPlaygroundJs.body.includes('bindSearchClear'), 'v2-playground.js supports search clear binding');
    assert(resPlaygroundJs.body.includes('bindPasswordToggle'), 'v2-playground.js supports password visibility toggling');
    assert(resPlaygroundJs.body.includes('bindCharacterCounter'), 'v2-playground.js supports textarea character count');
    assert(resPlaygroundJs.body.includes('bindValidationDemo'), 'v2-playground.js supports interactive email validation');
    assert(resPlaygroundJs.body.includes('bindTablePlayground'), 'v2-playground.js supports interactive Table & Data Grid controller');
    assert(resPlaygroundJs.body.includes('MOCK_OPERATIONS'), 'v2-playground.js contains mock operational dataset');
    assert(resPlaygroundJs.body.includes('bindOverlayPlayground'), 'v2-playground.js supports overlay event feedback');
    assert(resPlaygroundJs.body.includes('bindFormPlayground'), 'v2-playground.js supports Task 05 Form interactive handlers');
    assert(resPlaygroundJs.body.includes('handleFileSelected'), 'v2-playground.js supports file upload dropzone handling');

    // 4. Verify Canonical Admin Routing (/admin serves V2 directly, /admin-v2 and ?admin=1 redirect to /admin)
    const resAdmin = await request('/admin');
    assert(resAdmin.status === 200, 'GET /admin returns HTTP 200 directly');
    assert(resAdmin.body.includes('cwp-v2-root'), 'GET /admin serves Admin V2 directly');

    const resAdminSlash = await request('/admin/');
    assert(resAdminSlash.status === 200, 'GET /admin/ returns HTTP 200 without duplication');
    assert(resAdminSlash.body.includes('cwp-v2-root'), 'GET /admin/ serves Admin V2');

    const resLegacyV2 = await request('/admin-v2');
    assert(resLegacyV2.status === 302, 'GET /admin-v2 returns HTTP 302 redirect');
    assert(resLegacyV2.headers.location === '/admin', 'GET /admin-v2 redirects Location to /admin');

    const resLegacyV2Slash = await request('/admin-v2/');
    assert(resLegacyV2Slash.status === 302, 'GET /admin-v2/ returns HTTP 302 redirect');
    assert(resLegacyV2Slash.headers.location === '/admin', 'GET /admin-v2/ redirects Location to /admin');

    const resAdminParam = await request('/?admin=1');
    assert(resAdminParam.status === 302, 'GET /?admin=1 returns HTTP 302 redirect');
    assert(resAdminParam.headers.location === '/admin', 'GET /?admin=1 redirects Location to /admin');

    // 5. Verify Staff Portal remains untouched
    const resStaff = await request('/staff');
    assert(resStaff.status === 200, 'GET /staff returns HTTP 200');
    assert(resStaff.body.includes('staff-mode-active'), 'GET /staff serves Index.html with staff-mode-active');

    // 6. Verify CSS Scoping
    const v2CssFiles = ['v2-tokens.css', 'v2-base.css', 'v2-layout.css', 'v2-components.css'];
    for (const f of v2CssFiles) {
      const content = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-v2', 'css', f), 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('* ') || trimmed.startsWith('/*')) continue;
        if (trimmed === 'body {' || trimmed === 'html {') {
          assert(false, `Found unscoped body/html selector in ${f}`);
        }
      }
    }
    assert(true, 'All V2 CSS files strictly scoped');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }

  console.log('===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification();
