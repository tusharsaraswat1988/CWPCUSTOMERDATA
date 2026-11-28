'use strict';
const assert = require('node:assert/strict');
const db = require('../db');
const repos = require('../db/repositories');
const admin = require('../services/adminService');

const customer = {
  id: 'customer-profile-test', name: 'Legacy Customer', phone: '9876543210',
  is_active: true, interested_service: 'Daily Car Cleaning', notes: '',
  name_hi: null, panel_count: null, lead_status: 'active'
};
const calls = { subscriptionUpdate: 0, subscriptionCreate: 0, subscriptionCancel: 0, jobCreate: 0, packageCreate: 0 };
const originals = {
  withTransaction: db.withTransaction,
  customersFind: repos.customers.findById,
  customersUpdate: repos.customers.updateCustomer,
  locationsByCustomer: repos.serviceLocations.findByCustomerId,
  locationPrimary: repos.serviceLocations.findPrimaryByCustomerId,
  vehiclesByCustomer: repos.vehicles.findByCustomerId,
  subscriptionsByCustomer: repos.subscriptions.findByCustomerId,
  activeSubscription: repos.subscriptions.findActiveByCustomerId,
  subscriptionVehicles: repos.subscriptionVehicles.findBySubscriptionId,
  activeStaffAssignment: repos.staffAssignments.findActiveBySubscriptionId,
  updateSubscription: repos.subscriptions.updateSubscription,
  createSubscription: repos.subscriptions.createSubscription,
  cancelSubscription: repos.subscriptions.cancelSubscription,
  jobsFindAll: repos.serviceJobs.findAll,
  jobsByCustomer: repos.serviceJobs.findByCustomerId,
  jobsCreate: repos.serviceJobs.createJob,
  audit: repos.auditLogs.logChange
};

function installMocks({ subscription = null, hybridIdentities = [] } = {}) {
  Object.keys(calls).forEach(key => { calls[key] = 0; });
  repos.customers.findById = async () => customer;
  repos.customers.updateCustomer = async () => customer;
  repos.serviceLocations.findByCustomerId = async () => [];
  repos.serviceLocations.findPrimaryByCustomerId = async () => null;
  repos.vehicles.findByCustomerId = async () => [];
  repos.subscriptions.findByCustomerId = async () => subscription ? [subscription] : [];
  repos.subscriptions.findActiveByCustomerId = async () => subscription;
  repos.subscriptionVehicles.findBySubscriptionId = async () => [];
  repos.staffAssignments.findActiveBySubscriptionId = async () => null;
  repos.subscriptions.updateSubscription = async () => { calls.subscriptionUpdate++; };
  repos.subscriptions.createSubscription = async () => { calls.subscriptionCreate++; return { id: 'new-subscription' }; };
  repos.subscriptions.cancelSubscription = async () => { calls.subscriptionCancel++; };
  repos.serviceJobs.findAll = async () => [];
  repos.serviceJobs.findByCustomerId = async () => [];
  repos.serviceJobs.createJob = async () => { calls.jobCreate++; return { id: 'new-job' }; };
  repos.auditLogs.logChange = async () => {};
  const client = { query: async (sql, values = []) => {
    if (sql.includes('to_regclass')) return { rows: [{ table_name: 'hybrid_packages' }] };
    if (sql.includes('FROM public.hybrid_packages')) {
      return { rows: hybridIdentities.some(identity => identity.toLowerCase() === String(values[0]).toLowerCase()) ? [{ id: 'hybrid-id' }] : [] };
    }
    throw new Error(`Unexpected test query: ${sql}`);
  } };
  db.withTransaction = fn => fn(client);
}

async function main() {
  installMocks();
  const profileResult = await admin.updateCustomer({
    id: customer.id, customerName: 'Updated Name', staffNotes: 'profile edit',
    serviceCategory: 'Daily Car Cleaning', packageType: 'Legacy Unmapped Plan', profileOnly: true
  });
  assert.equal(profileResult.success, true);
  assert.equal(calls.subscriptionCreate + calls.subscriptionUpdate + calls.subscriptionCancel + calls.jobCreate + calls.packageCreate, 0,
    'profile-only save with no existing subscription cannot provision or alter engine records');

  const existingSub = { id: 'standalone-dcc-sub', status: 'active', package_name: 'Old DCC Plan' };
  installMocks({ subscription: existingSub });
  await admin.updateCustomer({
    id: customer.id, customerName: 'Updated Name', serviceCategory: 'Daily Car Cleaning',
    packageType: 'Legacy Unmapped Plan', profileOnly: true
  });
  assert.equal(calls.subscriptionUpdate + calls.subscriptionCreate + calls.subscriptionCancel, 0,
    'profile-only save preserves an existing subscription and its legacy package label');

  installMocks({ subscription: existingSub });
  await admin.updateCustomer({
    id: customer.id, customerName: 'Updated Name', serviceCategory: 'Daily Car Cleaning',
    packageType: 'DCC ONLY'
  });
  assert.equal(calls.subscriptionUpdate, 1, 'explicit non-profile DCC update retains its legacy subscription path');

  for (const hybridIdentity of ['hybrid-membership-pkg-id', 'HYB-GOLD', 'Hybrid Gold']) {
    installMocks({ hybridIdentities: [hybridIdentity] });
    await assert.rejects(
      admin.updateCustomer({ id: customer.id, customerName: 'Updated Name', packageType: hybridIdentity }),
      error => error.code === 'HYBRID_PACKAGE_REQUIRES_ORCHESTRATION'
    );
    assert.equal(calls.subscriptionCreate + calls.subscriptionUpdate + calls.subscriptionCancel + calls.jobCreate, 0,
      `Hybrid package ${hybridIdentity} is rejected before legacy provisioning side effects`);
  }
  console.log('PASS profile-only edits, standalone DCC path, and Hybrid legacy-route rejection');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  db.withTransaction = originals.withTransaction;
  repos.customers.findById = originals.customersFind;
  repos.customers.updateCustomer = originals.customersUpdate;
  repos.serviceLocations.findByCustomerId = originals.locationsByCustomer;
  repos.serviceLocations.findPrimaryByCustomerId = originals.locationPrimary;
  repos.vehicles.findByCustomerId = originals.vehiclesByCustomer;
  repos.subscriptions.findByCustomerId = originals.subscriptionsByCustomer;
  repos.subscriptions.findActiveByCustomerId = originals.activeSubscription;
  repos.subscriptionVehicles.findBySubscriptionId = originals.subscriptionVehicles;
  repos.staffAssignments.findActiveBySubscriptionId = originals.activeStaffAssignment;
  repos.subscriptions.updateSubscription = originals.updateSubscription;
  repos.subscriptions.createSubscription = originals.createSubscription;
  repos.subscriptions.cancelSubscription = originals.cancelSubscription;
  repos.serviceJobs.findAll = originals.jobsFindAll;
  repos.serviceJobs.findByCustomerId = originals.jobsByCustomer;
  repos.serviceJobs.createJob = originals.jobsCreate;
  repos.auditLogs.logChange = originals.audit;
});
