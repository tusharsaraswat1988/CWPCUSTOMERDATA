'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const db = require('../db');
const repos = require('../db/repositories');
const admin = require('../services/adminService');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const v2Html = fs.readFileSync(path.join(root, 'public/admin-v2/index.html'), 'utf8');
const v2CustJs = fs.readFileSync(path.join(root, 'public/admin-v2/js/v2-customers.js'), 'utf8');
const v2CustCss = fs.readFileSync(path.join(root, 'public/admin-v2/css/v2-customers.css'), 'utf8');

function assertRuntimeOwnership() {
  assert.match(serverSrc, /if \(isAdminRoute\)[\s\S]*?public', 'admin-v2', 'index\.html'/);
  assert.match(v2Html, /id="v2ModalEditCustomer"/);
  assert.match(v2Html, /v2-customers\.css\?v=2\.2\.1/);
  assert.match(v2Html, /v2-customers\.js\?v=2\.1\.\d+/);
  assert.match(v2CustCss, /#v2ModalEditCustomer \.cwp-v2-select:disabled/);
  assert.match(serverSrc, /err\.code === 'HYBRID_PACKAGE_REQUIRES_ORCHESTRATION' \? 400 : 500/);
}

function createFakeElement(id, initialTag = 'input') {
  const listeners = {};
  const attrs = {};
  const classes = new Set();
  const el = {
    id,
    tagName: initialTag.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: {},
    options: [],
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
      contains: (c) => classes.has(c)
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k] || null,
    addEventListener: (ev, fn) => { listeners[ev] = listeners[ev] || []; listeners[ev].push(fn); },
    querySelectorAll: (sel) => {
      if (sel === 'option[data-legacy-dynamic="true"]') {
        return el.options.filter(o => o.dataset && o.dataset.legacyDynamic === 'true');
      }
      return [];
    },
    add: (opt) => {
      opt.remove = () => {
        const idx = el.options.indexOf(opt);
        if (idx >= 0) el.options.splice(idx, 1);
      };
      el.options.push(opt);
    },
    _listeners: listeners
  };
  return el;
}

async function testV2FrontendBehavior() {
  const elements = new Map();
  const mk = (id, tag, opts = []) => {
    const el = createFakeElement(id, tag);
    opts.forEach(v => el.add({ value: v, textContent: v, dataset: {} }));
    elements.set(id, el);
    return el;
  };

  mk('v2EditCustId', 'input');
  mk('v2EditCustName', 'input');
  mk('v2EditCustPhone', 'input');
  mk('v2EditCustAltPhone', 'input');
  mk('v2EditCustEmail', 'input');
  mk('v2EditCustAddress', 'textarea');
  mk('v2EditCustCategory', 'select', ['Daily Car Cleaning', 'Car Washing', 'Solar Panel Cleaning']);
  mk('v2EditCustPackage', 'select', ['DCC ONLY', 'Daily Clean', 'DCC + Interior', 'On-Demand Wash']);
  mk('v2EditCustStaff', 'select', ['', 'STF01']);
  mk('v2EditCustStatus', 'select', ['active', 'inactive']);
  mk('v2EditCustNotes', 'textarea');
  mk('v2EditVehiclesContainer', 'div');
  const submitBtn = mk('v2EditBtnSubmit', 'button');

  const apiRequests = [];
  let loadingCalls = 0;
  const toasts = { success: [], error: [] };
  const overlayCalls = { open: [], close: [] };

  const fakeDocument = {
    readyState: 'complete',
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (sel) => {
      if (sel === '.cwp-v2-edit-tab-btn') return [];
      if (sel === '.cwp-v2-edit-tab-pane') return [];
      if (sel === '#v2EditVehiclesContainer .cwp-v2-cust-rich-vehicle-card') return [];
      return [];
    },
    addEventListener: () => {}
  };

  function FakeOption(text, value) {
    this.textContent = text;
    this.value = value;
    this.dataset = {};
  }

  const sandbox = {
    console,
    document: fakeDocument,
    Option: FakeOption,
    setTimeout,
    clearTimeout,
    sessionStorage: { getItem: () => 'tok' },
    localStorage: { getItem: () => 'tok' },
    confirm: () => true,
    window: null
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.CWP_ADMIN_V2 = {
    api: {
      request: async (action, payload) => {
        apiRequests.push({ action, payload });
        if (action === 'getAllCustomers') return { success: true, customers: [] };
        if (action === 'getStaffList') return { success: true, staff: [] };
        if (action === 'getAllRoutes') return { success: true, routes: [] };
        if (payload?.customerData?.customerName === 'Trigger Error') {
          throw new Error('Simulated API error');
        }
        return { success: true };
      },
      withLoadingButton: async (_btn, fn) => {
        loadingCalls++;
        return fn();
      }
    },
    toast: {
      success: (m) => toasts.success.push(m),
      error: (m) => toasts.error.push(m),
      warning: () => {}
    },
    overlay: {
      open: (id) => overlayCalls.open.push(id),
      close: (id) => overlayCalls.close.push(id)
    }
  };

  vm.runInNewContext(v2CustJs, sandbox);
  // Calling init twice must not bind duplicate submit listeners
  sandbox.window.CWP_ADMIN_V2.customers.init();
  sandbox.window.CWP_ADMIN_V2.customers.init();

  // Open customer with unmapped legacy package
  sandbox.window.CWP_ADMIN_V2.customers.openEditCustomerModal({
    id: 'cust-1',
    customerName: 'Aarav Sharma',
    phone: '9876543210',
    address: 'Gomti Nagar',
    serviceCategory: 'Daily Car Cleaning',
    packageName: 'Legacy Unmapped Gold',
    staffId: 'STF01',
    active: 'Yes',
    notes: 'Gate 2',
    vehicles: [{ registration_no: 'UP32AB1234', brand_or_model: 'Swift' }]
  });

  assert.equal(overlayCalls.open[0], 'v2ModalEditCustomer');
  assert.equal(elements.get('v2EditCustCategory').disabled, true);
  assert.equal(elements.get('v2EditCustPackage').disabled, true);
  assert.equal(elements.get('v2EditCustPackage').value, 'Legacy Unmapped Gold');

  // Opening a second customer with a different unmapped label cleans up previous dynamic option
  sandbox.window.CWP_ADMIN_V2.customers.openEditCustomerModal({
    id: 'cust-2',
    customerName: 'Neha Verma',
    phone: '9876543211',
    address: 'Indira Nagar',
    serviceCategory: 'Car Washing',
    packageName: 'Legacy Unmapped Silver',
    active: 'Yes',
    vehicles: [{ registration_no: 'UP32CD5678', brand_or_model: 'Creta' }]
  });
  const pkgOptions = elements.get('v2EditCustPackage').options.map(o => o.value);
  assert.ok(!pkgOptions.includes('Legacy Unmapped Gold'), 'stale dynamic option must be removed on reopen');
  assert.ok(pkgOptions.includes('Legacy Unmapped Silver'), 'current unmapped package must be preserved');

  // Trigger save via submit button click listener
  const clickHandlers = submitBtn._listeners.click || [];
  assert.equal(clickHandlers.length, 1, 'v2EditBtnSubmit must only have one click handler');
  await clickHandlers[0]();

  assert.equal(loadingCalls, 1, 'save must use withLoadingButton for duplicate-submit prevention');
  const updateCall = apiRequests.find(r => r.action === 'updateCustomer');
  assert.ok(updateCall, 'updateCustomer API request must be sent');
  assert.equal(updateCall.payload.customerData.profileOnly, true);
  assert.equal('packageType' in updateCall.payload.customerData, false, 'profile-only payload must not send packageType');
  assert.equal('packageName' in updateCall.payload.customerData, false, 'profile-only payload must not send packageName');
  assert.equal('serviceCategory' in updateCall.payload.customerData, false, 'profile-only payload must not send serviceCategory');
  assert.equal(overlayCalls.close[0], 'v2ModalEditCustomer');

  // Verify API error handling
  elements.get('v2EditCustName').value = 'Trigger Error';
  await clickHandlers[0]();
  assert.ok(toasts.error.includes('Simulated API error'), 'API error must surface via toast.error');
}

async function testBackendProfileOnlyGuards() {
  const originals = {
    withTransaction: db.withTransaction,
    findById: repos.customers.findById,
    updateCustomer: repos.customers.updateCustomer,
    findLocs: repos.serviceLocations.findByCustomerId,
    findPrimLoc: repos.serviceLocations.findPrimaryByCustomerId,
    findVehs: repos.vehicles.findByCustomerId,
    findSubs: repos.subscriptions.findByCustomerId,
    findSub: repos.subscriptions.findActiveByCustomerId,
    findSubVehs: repos.subscriptionVehicles.findBySubscriptionId,
    findStaffAssign: repos.staffAssignments.findActiveBySubscriptionId,
    updateSub: repos.subscriptions.updateSubscription,
    createSub: repos.subscriptions.createSubscription,
    cancelSub: repos.subscriptions.cancelSubscription,
    findJobsAll: repos.serviceJobs.findAll,
    findJobs: repos.serviceJobs.findByCustomerId,
    createJob: repos.serviceJobs.createJob,
    updateJob: repos.serviceJobs.updateJob,
    logChange: repos.auditLogs.logChange
  };

  let updatedCustomerFields = null;
  let mutatingCalls = 0;

  try {
    const baseCustomer = {
      id: 'cust-hybrid-1',
      name: 'Hybrid Member',
      phone: '9876543210',
      is_active: true,
      interested_service: 'Daily Car Cleaning',
      notes: '',
      name_hi: 'Hybrid Member',
      lead_status: 'active'
    };

    repos.customers.findById = async () => baseCustomer;
    repos.customers.updateCustomer = async (_id, data) => { updatedCustomerFields = data; return baseCustomer; };
    repos.serviceLocations.findByCustomerId = async () => [];
    repos.serviceLocations.findPrimaryByCustomerId = async () => null;
    repos.vehicles.findByCustomerId = async () => [];
    repos.subscriptions.findByCustomerId = async () => [{ id: 'sub-1', status: 'active', package_name: 'Hybrid Gold' }];
    repos.subscriptions.findActiveByCustomerId = async () => ({ id: 'sub-1', status: 'active', package_name: 'Hybrid Gold' });
    repos.subscriptionVehicles.findBySubscriptionId = async () => [];
    repos.staffAssignments.findActiveBySubscriptionId = async () => null;
    repos.subscriptions.updateSubscription = async () => { mutatingCalls++; };
    repos.subscriptions.createSubscription = async () => { mutatingCalls++; return { id: 's2' }; };
    repos.subscriptions.cancelSubscription = async () => { mutatingCalls++; };
    repos.serviceJobs.findAll = async () => [];
    repos.serviceJobs.findByCustomerId = async () => [];
    repos.serviceJobs.createJob = async () => { mutatingCalls++; return { id: 'j1' }; };
    repos.serviceJobs.updateJob = async () => { mutatingCalls++; };
    repos.auditLogs.logChange = async () => {};

    const client = {
      query: async (sql, vals = []) => {
        if (sql.includes('to_regclass')) return { rows: [{ table_name: 'hybrid_packages' }] };
        if (sql.includes('FROM public.hybrid_packages')) {
          return { rows: String(vals[0]).toLowerCase() === 'hybrid gold' ? [{ id: 'hyb-1' }] : [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    };
    db.withTransaction = fn => fn(client);

    // 1. profileOnly: true even with tampered serviceCategory & existing Hybrid packageName must succeed without mutating service/package
    const res = await admin.updateCustomer({
      id: 'cust-hybrid-1',
      customerName: 'Hybrid Member Updated',
      serviceCategory: 'Car Washing',
      packageType: 'Hybrid Gold',
      profileOnly: true
    });
    assert.equal(res.success, true);
    assert.equal(updatedCustomerFields.interestedService, 'Daily Car Cleaning', 'profileOnly must preserve interested_service');
    assert.equal(mutatingCalls, 0, 'profileOnly must not mutate DCC/SEE/Hybrid records');

    // 2. Non-profileOnly attempt to assign Hybrid package must still be rejected
    await assert.rejects(
      admin.updateCustomer({
        id: 'cust-hybrid-1',
        customerName: 'Hybrid Member Updated',
        packageType: 'Hybrid Gold'
      }),
      err => err.code === 'HYBRID_PACKAGE_REQUIRES_ORCHESTRATION'
    );
    assert.equal(mutatingCalls, 0);
  } finally {
    db.withTransaction = originals.withTransaction;
    repos.customers.findById = originals.findById;
    repos.customers.updateCustomer = originals.updateCustomer;
    repos.serviceLocations.findByCustomerId = originals.findLocs;
    repos.serviceLocations.findPrimaryByCustomerId = originals.findPrimLoc;
    repos.vehicles.findByCustomerId = originals.findVehs;
    repos.subscriptions.findByCustomerId = originals.findSubs;
    repos.subscriptions.findActiveByCustomerId = originals.findSub;
    repos.subscriptionVehicles.findBySubscriptionId = originals.findSubVehs;
    repos.staffAssignments.findActiveBySubscriptionId = originals.findStaffAssign;
    repos.subscriptions.updateSubscription = originals.updateSub;
    repos.subscriptions.createSubscription = originals.createSub;
    repos.subscriptions.cancelSubscription = originals.cancelSub;
    repos.serviceJobs.findAll = originals.findJobsAll;
    repos.serviceJobs.findByCustomerId = originals.findJobs;
    repos.serviceJobs.createJob = originals.createJob;
    repos.serviceJobs.updateJob = originals.updateJob;
    repos.auditLogs.logChange = originals.logChange;
  }
}

(async () => {
  assertRuntimeOwnership();
  await testV2FrontendBehavior();
  await testBackendProfileOnlyGuards();
  console.log('PASS Admin V2 customer edit ownership, profile-only payload, and backend guards');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
