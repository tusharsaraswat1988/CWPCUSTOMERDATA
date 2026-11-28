'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const v2CustJs = fs.readFileSync(path.join(root, 'public/admin-v2/js/v2-customers.js'), 'utf8');
const v2Html = fs.readFileSync(path.join(root, 'public/admin-v2/index.html'), 'utf8');
const adminService = require('../services/adminService');
const db = require('../db');
const repos = require('../db/repositories');

// 1. Static UI & asset-version checks
assert.ok(!v2CustJs.includes('Legacy: '), 'v2-customers.js must not prefix "Legacy: " onto customer plans');
assert.ok(!v2CustJs.includes('Legacy plan label'), 'v2-customers.js must not display "Legacy plan label"');
assert.ok(!v2CustJs.includes('(legacy record)'), 'v2-customers.js must not display "(legacy record)"');
assert.match(v2Html, /v2-customers\.js\?v=2\.1\.6/, 'index.html must bump v2-customers.js cache buster');
assert.doesNotMatch(
  v2Html.match(/id="v2EditCustPackageNote"[^>]*>([^<]+)</)?.[1] || '',
  /\blegacy\b/i,
  'v2EditCustPackageNote must not reference legacy labels'
);

// 2. Frontend table rendering check (no Legacy badge; shows active plan or No Active Plan)
function testFrontendTableRendering() {
  const tbody = { innerHTML: '', addEventListener: () => {} };
  const pageInfo = { textContent: '' };
  const elMap = new Map([
    ['v2CustTableBody', tbody],
    ['v2CustPageInfo', pageInfo],
    ['v2CustKpiTotal', { textContent: '' }],
    ['v2CustKpiActive', { textContent: '' }],
    ['v2CustKpiInactive', { textContent: '' }],
    ['v2CustKpiUpcoming', { textContent: '' }]
  ]);

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    sessionStorage: { getItem: () => 'tok' },
    localStorage: { getItem: () => 'tok' },
    document: {
      readyState: 'complete',
      getElementById: (id) => elMap.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    window: null
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.CWP_ADMIN_V2 = {
    api: {
      request: async (action) => {
        if (action === 'getAllCustomers') {
          return [
            {
              id: 'c1',
              customerName: 'Ankit Jain',
              phone: '9140808671',
              serviceCategory: 'Car Washing',
              serviceStatus: 'none',
              hasService: false,
              isStopped: false,
              packageName: '',
              packageType: '',
              active: 'Yes'
            },
            {
              id: 'c2',
              customerName: 'Abhishek Kesharwani',
              phone: '9387526316',
              serviceCategory: 'Daily Car Cleaning',
              serviceStatus: 'active',
              hasService: true,
              isStopped: false,
              packageName: 'Platinum Hybrid',
              activePackageName: 'Platinum Hybrid',
              planSource: 'hybrid',
              active: 'Yes'
            }
          ];
        }
        return [];
      }
    }
  };

  vm.runInNewContext(v2CustJs, sandbox);
  return sandbox.window.CWP_ADMIN_V2.customers.loadData(true).then(() => {
    assert.ok(!tbody.innerHTML.includes('Legacy:'), 'Rendered customer table must never contain "Legacy:"');
    assert.ok(tbody.innerHTML.includes('No Active Plan'), 'Customer with no active plan must render "No Active Plan"');
    assert.ok(tbody.innerHTML.includes('Platinum Hybrid'), 'Customer with canonical package must render package name');
    assert.ok(tbody.innerHTML.includes('No Schedule'), 'Customer with no active service must show "No Schedule"');
  });
}

// 3. Backend getAllCustomers projection check (with mocked DB/repos)
async function testBackendProjection() {
  const origFindAll = repos.customers.findAll;
  const origQuery = db.query;

  try {
    repos.customers.findAll = async () => [
      { id: 'c-none', customer_code: 'C1', name: 'No Plan User', phone: '9876543210', interested_service: 'Car Washing', is_active: true },
      { id: 'c-hyb', customer_code: 'C2', name: 'Hybrid User', phone: '9876543211', interested_service: 'Daily Car Cleaning', is_active: true },
      { id: 'c-see', customer_code: 'C3', name: 'SEE User', phone: '9876543212', interested_service: 'None', is_active: true }
    ];

    db.query = async (sql) => {
      if (sql.includes('FROM public.service_locations')) return { rows: [] };
      if (sql.includes('FROM public.vehicles')) return { rows: [] };
      if (sql.includes('FROM public.subscriptions')) return { rows: [] };
      if (sql.includes('FROM public.service_jobs')) return { rows: [] };
      if (sql.includes("to_regclass('public.hybrid_memberships')")) return { rows: [{ tbl: 'public.hybrid_memberships' }] };
      if (sql.includes('FROM public.hybrid_memberships hm')) {
        return { rows: [{ id: 'hm-1', customer_id: 'c-hyb', status: 'active', package_name: 'Gold Hybrid Care' }] };
      }
      if (sql.includes("to_regclass('public.entitlement_accounts')")) return { rows: [{ tbl: 'public.entitlement_accounts' }] };
      if (sql.includes('FROM public.entitlement_accounts ea')) {
        return { rows: [{ id: 'ea-1', customer_id: 'c-see', remaining_qty: 4, status: 'active', package_name: 'Foam Wash 4-Pack', service_category_id: 'car_washing' }] };
      }
      return { rows: [] };
    };

    const rows = await adminService.getAllCustomers();
    const byId = new Map(rows.map(r => [r.id, r]));

    assert.equal(byId.get('c-none').hasService, false);
    assert.equal(byId.get('c-none').packageName, '', 'Must not fabricate packageName from interested_service');
    assert.equal(byId.get('c-hyb').packageName, 'Gold Hybrid Care');
    assert.equal(byId.get('c-hyb').planSource, 'hybrid');
    assert.equal(byId.get('c-hyb').hasService, true);
    assert.equal(byId.get('c-see').packageName, 'Foam Wash 4-Pack');
    assert.equal(byId.get('c-see').planSource, 'see');
    assert.equal(byId.get('c-see').hasService, true);
  } finally {
    repos.customers.findAll = origFindAll;
    db.query = origQuery;
  }
}

(async () => {
  await testFrontendTableRendering();
  await testBackendProjection();
  console.log('PASS: No Legacy plan display and canonical package projection verified');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
