/**
 * CWP Detailers & Motors - Package & Entitlement Business Service
 * Module: Packages & Entitlements Decoupled Subsystem
 *
 * Core Principles:
 * 1. Independent of Staff Assignment, Routes, and Immediate Job Booking.
 * 2. Immutable purchased entitlements with mathematical non-negative balance checks.
 * 3. Atomic redemption with row-level concurrency locking.
 * 4. Dual backend support: Neon PostgreSQL and local isolated fallback.
 */

const repos = require('../db/repositories/index');
const db = require('../db/index');
const serviceCatalog = require('./serviceCatalog');
const homepageConfigService = require('./homepageConfigService');

// Local in-memory fallback store for offline / test environments
let localPackagesStore = [];
let localRedemptionsStore = [];

function isNeonActive() {
  const isNeonConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isNeonConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_PACKAGES_TEST);
}

/**
 * Returns canonical catalog enriched with default pricing and entitlements
 * By default returns a flat array of packages. Pass options.grouped = true for category grouping.
 */
function getPackageCatalog(serviceCategoryId = null, options = {}) {
  const hpConfig = homepageConfigService.DEFAULT_CONFIG || {};
  const rates = hpConfig && hpConfig.rates ? hpConfig.rates : {};
  const carRates = rates.carCare || {};
  const washRates = carRates.wash || {};
  const dccRates = carRates.dcc || {};

  const allCategories = serviceCatalog.getAllCategories();
  const flatCatalog = [];
  const groupedCatalog = [];

  for (const cat of allCategories) {
    if (serviceCategoryId && cat.id !== serviceCategoryId && cat.id !== serviceCatalog.resolveCanonicalCategory(serviceCategoryId)) {
      continue;
    }

    const packages = (cat.packages || []).map(p => {
      let defaultPrice = 0;
      let validityMonths = p.validityMonths || 1;
      let totalQuantity = p.frequencies || (p.includesCarwash ? 30 : 1);

      // Resolve standard pricing from CWP rates
      if (p.code === 'WASH_SINGLE_5' || p.code === 'WASH_SINGLE') {
        defaultPrice = (washRates.fiveSeater && washRates.fiveSeater.oneTime) || 600;
        totalQuantity = 1;
        validityMonths = 1;
      } else if (p.code === 'WASH_SINGLE_5PLUS') {
        defaultPrice = (washRates.fivePlusSeater && washRates.fivePlusSeater.oneTime) || 700;
        totalQuantity = 1;
        validityMonths = 1;
      } else if (p.code === 'WASH_SUB_4_5' || p.code === 'WASH_SUB_4') {
        defaultPrice = (washRates.fiveSeater && washRates.fiveSeater.subscription4) || 1800;
        totalQuantity = 4;
        validityMonths = 6;
      } else if (p.code === 'WASH_SUB_4_5PLUS') {
        defaultPrice = (washRates.fivePlusSeater && washRates.fivePlusSeater.subscription4) || 2100;
        totalQuantity = 4;
        validityMonths = 6;
      } else if (p.code === 'DCC_EXT_30D') {
        defaultPrice = (dccRates.fiveSeater && dccRates.fiveSeater.basic) || 1100;
        totalQuantity = 30;
        validityMonths = 1;
      } else if (p.code === 'DCC_EXT_1WASH') {
        defaultPrice = (dccRates.fiveSeater && dccRates.fiveSeater.silver) || 1500;
        totalQuantity = 30;
        validityMonths = 1;
      } else if (p.code === 'DCC_EXT_2WASH') {
        defaultPrice = (dccRates.fiveSeater && dccRates.fiveSeater.gold) || 2000;
        totalQuantity = 30;
        validityMonths = 1;
      } else if (p.code === 'SOLAR_SINGLE') {
        defaultPrice = 800;
        totalQuantity = 1;
        validityMonths = 1;
      } else if (p.code === 'SOLAR_SUB_6') {
        defaultPrice = 4500;
        totalQuantity = 6;
        validityMonths = 6;
      } else if (p.code === 'SOLAR_SUB_12') {
        defaultPrice = 8000;
        totalQuantity = 12;
        validityMonths = 12;
      } else if (p.code === 'INT_DEEP_CLEAN') {
        defaultPrice = (carRates.detailing && carRates.detailing.interiorDetailingStarts) || 1499;
        totalQuantity = 1;
        validityMonths = 3;
      } else if (p.code === 'INT_ROOF_CLEAN') {
        defaultPrice = 799;
        totalQuantity = 1;
        validityMonths = 3;
      } else if (p.code === 'EXT_CERAMIC') {
        defaultPrice = (carRates.detailing && carRates.detailing.ceramicCoatingStarts) || 11999;
        totalQuantity = 1;
        validityMonths = 12;
      } else if (p.code === 'EXT_GRAPHENE') {
        defaultPrice = 14999;
        totalQuantity = 1;
        validityMonths = 12;
      } else if (p.code === 'EXT_WAXING') {
        defaultPrice = 999;
        totalQuantity = 1;
        validityMonths = 2;
      } else if (p.code === 'EXT_GLASS') {
        defaultPrice = 1499;
        totalQuantity = 1;
        validityMonths = 6;
      }

      const item = {
        packageCode: p.code,
        code: p.code,
        name: p.name,
        nameHi: p.nameHi,
        serviceCategoryId: cat.id,
        serviceCategory: cat.name,
        category: cat.name,
        description: p.description,
        descriptionHi: p.descriptionHi,
        quantity: totalQuantity,
        totalQuantity: totalQuantity,
        price: defaultPrice,
        defaultPrice: defaultPrice,
        validityMonths: validityMonths,
        seaterType: p.seaterType || null,
        targetType: cat.targetType || 'vehicle'
      };

      flatCatalog.push(item);
      return item;
    });

    groupedCatalog.push({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryNameHi: cat.nameHi,
      icon: cat.icon,
      packages: packages
    });
  }

  if (options && options.grouped) {
    return groupedCatalog;
  }
  return flatCatalog;
}

/**
 * Sell a package to a customer (Transactional & Decoupled)
 */
async function sellPackage(params = {}, adminUserParam = 'admin') {
  const customerId = params.customerId || params.id;
  const packageCode = params.packageCode || params.code;
  const packageName = params.packageName || params.name;
  const serviceCategoryId = params.serviceCategoryId || params.serviceCategory || params.category;
  const vehicleId = params.vehicleId || params.assetId || null;
  const locationId = params.locationId || null;
  const totalQuantity = params.totalQuantity || params.quantity || 1;
  const unitPrice = params.unitPrice !== undefined ? params.unitPrice : null;
  const totalPrice = params.totalPrice !== undefined ? params.totalPrice : (params.purchasePrice !== undefined ? params.purchasePrice : null);
  const validityMonths = params.validityMonths || 1;
  const purchaseDate = params.purchaseDate || null;
  const activationDate = params.activationDate || null;
  const expiryDate = params.expiryDate || null;
  const paymentStatus = params.paymentStatus || 'paid';
  const notes = params.notes || null;
  const adminUser = params.adminUser || adminUserParam || 'admin';

  if (!customerId) {
    throw new Error('Customer ID is required.');
  }
  const cleanPkgName = String(packageName || '').trim();
  if (!cleanPkgName) {
    throw new Error('Package name is required.');
  }
  const qty = parseInt(totalQuantity, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Package total quantity must be at least 1.');
  }

  const vMonths = parseInt(validityMonths, 10) || 1;
  const pDate = purchaseDate || new Date().toISOString().split('T')[0];

  let calculatedExpiry = expiryDate;
  if (!calculatedExpiry) {
    const d = new Date(pDate);
    d.setMonth(d.getMonth() + vMonths);
    calculatedExpiry = d.toISOString().split('T')[0];
  }

  const resolvedCategory = serviceCatalog.resolveCanonicalCategory(serviceCategoryId);
  const uPrice = unitPrice !== null && unitPrice !== undefined ? parseFloat(unitPrice) : 0.00;
  const tPrice = totalPrice !== null && totalPrice !== undefined ? parseFloat(totalPrice) : (uPrice * qty);

  if (isNeonActive()) {
    return db.withTransaction(async (client) => {
      // 1. Validate customer existence
      const customer = await repos.customers.findById(customerId, client);
      if (!customer) {
        throw new Error(`Customer with ID '${customerId}' not found.`);
      }

      // 2. Validate vehicle ownership if provided
      if (vehicleId) {
        const vehicle = await repos.vehicles.findById(vehicleId, client);
        if (!vehicle || vehicle.customer_id !== customer.id) {
          throw new Error('Specified vehicle does not belong to this customer.');
        }
      }

      // 3. Validate location ownership if provided
      if (locationId) {
        const location = await repos.serviceLocations.findById(locationId, client);
        if (!location || location.customer_id !== customer.id) {
          throw new Error('Specified location does not belong to this customer.');
        }
      }

      // 4. Create package record
      const createdPkg = await repos.packages.createPackage({
        packageCode: packageCode || ('PKG_' + Date.now()),
        packageName: cleanPkgName,
        customerId: customer.id,
        vehicleId: vehicleId || null,
        locationId: locationId || null,
        serviceCategoryId: resolvedCategory,
        totalQuantity: qty,
        unitPrice: uPrice,
        totalPrice: tPrice,
        validityMonths: vMonths,
        purchaseDate: pDate,
        activationDate: activationDate || pDate,
        expiryDate: calculatedExpiry,
        status: 'active',
        paymentStatus: paymentStatus || 'paid',
        notes: notes ? String(notes).trim() : null,
        createdBy: adminUser || 'admin'
      }, client);

      // 5. Audit log
      await repos.auditLogs.logChange({
        entityType: 'customer_package',
        entityId: createdPkg.id,
        action: 'sell_package',
        changedBy: adminUser,
        afterState: {
          customerId: customer.id,
          customerName: customer.name,
          packageCode: createdPkg.package_code,
          packageName: createdPkg.package_name,
          totalQuantity: createdPkg.total_quantity,
          expiryDate: createdPkg.expiry_date,
          totalPrice: createdPkg.total_price
        }
      }, client);

      return {
        ...createdPkg,
        success: true,
        package: createdPkg,
        message: `Package '${cleanPkgName}' (${qty} entitlements) sold successfully to ${customer.name}.`
      };
    });
  }

  // Local in-memory fallback
  const pkgId = 'pkg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const localPkg = {
    id: pkgId,
    package_code: packageCode || ('PKG_' + Date.now()),
    package_name: cleanPkgName,
    customer_id: customerId,
    vehicle_id: vehicleId || null,
    asset_id: vehicleId || null,
    location_id: locationId || null,
    service_category_id: resolvedCategory,
    total_quantity: qty,
    totalQuantity: qty,
    redeemed_quantity: 0,
    redeemedQuantity: 0,
    remaining_quantity: qty,
    remainingQuantity: qty,
    unit_price: uPrice,
    total_price: tPrice,
    purchase_price: tPrice,
    validity_months: vMonths,
    purchase_date: pDate,
    activation_date: activationDate || pDate,
    expiry_date: calculatedExpiry,
    status: 'active',
    payment_status: paymentStatus || 'paid',
    notes: notes ? String(notes).trim() : null,
    created_by: adminUser || 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localPackagesStore.unshift(localPkg);
  return {
    ...localPkg,
    success: true,
    package: localPkg,
    message: `Package '${cleanPkgName}' sold successfully.`
  };
}

/**
 * Get all packages for a customer with computed status and balance metrics
 */
async function getCustomerPackages(customerId, {
  includeExhausted = true,
  includeCancelled = false,
  status = null
} = {}) {
  if (!customerId) return [];

  let rawPackages = [];
  if (isNeonActive()) {
    rawPackages = await repos.packages.findByCustomerId(customerId, {
      includeExhausted,
      includeCancelled,
      status
    });
  } else {
    rawPackages = localPackagesStore.filter(p => {
      if (p.customer_id !== customerId && p.customerId !== customerId) return false;
      if (p.deleted_at) return false;
      if (status && p.status !== status) return false;
      if (!includeExhausted && p.status === 'exhausted') return false;
      if (!includeCancelled && p.status === 'cancelled') return false;
      return true;
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const nowMs = Date.now();

  return rawPackages.map(pkg => {
    const expStr = pkg.expiry_date ? new Date(pkg.expiry_date).toISOString().split('T')[0] : null;
    const isPastExpiry = Boolean(expStr && expStr < todayStr);
    
    let effectiveStatus = pkg.status || 'active';
    if (effectiveStatus === 'active') {
      if (isPastExpiry) {
        effectiveStatus = 'expired';
      } else if (pkg.remaining_quantity <= 0) {
        effectiveStatus = 'exhausted';
      }
    }

    const totalQty = parseInt(pkg.total_quantity, 10) || 1;
    const redeemedQty = parseInt(pkg.redeemed_quantity, 10) || 0;
    const remainingQty = parseInt(pkg.remaining_quantity, 10) || 0;
    const progressPercent = Math.min(100, Math.round((redeemedQty / totalQty) * 100));

    let daysRemaining = null;
    if (expStr) {
      const expMs = new Date(pkg.expiry_date).getTime();
      daysRemaining = Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24));
    }

    return {
      id: pkg.id,
      packageCode: pkg.package_code,
      package_code: pkg.package_code,
      packageName: pkg.package_name,
      package_name: pkg.package_name,
      customerId: pkg.customer_id,
      customer_id: pkg.customer_id,
      vehicleId: pkg.vehicle_id,
      vehicle_id: pkg.vehicle_id,
      assetId: pkg.vehicle_id || pkg.asset_id,
      asset_id: pkg.vehicle_id || pkg.asset_id,
      registrationNo: pkg.registration_no || null,
      registration_no: pkg.registration_no || null,
      vehicleDetails: pkg.registration_no ? `${pkg.registration_no} ${pkg.brand_or_model ? `(${pkg.brand_or_model})` : ''}`.trim() : null,
      locationId: pkg.location_id,
      location_id: pkg.location_id,
      locationName: pkg.location_name || null,
      location_name: pkg.location_name || null,
      serviceCategoryId: pkg.service_category_id,
      service_category_id: pkg.service_category_id,
      serviceCategory: pkg.category_display_name || serviceCatalog.getCategory(pkg.service_category_id)?.name || pkg.service_category_id,
      service_category: pkg.category_display_name || serviceCatalog.getCategory(pkg.service_category_id)?.name || pkg.service_category_id,
      categoryDisplayName: pkg.category_display_name || serviceCatalog.getCategory(pkg.service_category_id)?.name || pkg.service_category_id,
      totalQuantity: totalQty,
      total_quantity: totalQty,
      redeemedQuantity: redeemedQty,
      redeemed_quantity: redeemedQty,
      remainingQuantity: remainingQty,
      remaining_quantity: remainingQty,
      unitPrice: parseFloat(pkg.unit_price) || 0,
      unit_price: parseFloat(pkg.unit_price) || 0,
      totalPrice: parseFloat(pkg.total_price) || 0,
      total_price: parseFloat(pkg.total_price) || 0,
      purchasePrice: parseFloat(pkg.total_price) || 0,
      purchase_price: parseFloat(pkg.total_price) || 0,
      validityMonths: pkg.validity_months || 1,
      validity_months: pkg.validity_months || 1,
      purchaseDate: pkg.purchase_date,
      purchase_date: pkg.purchase_date,
      activationDate: pkg.activation_date,
      activation_date: pkg.activation_date,
      expiryDate: pkg.expiry_date,
      expiry_date: pkg.expiry_date,
      status: pkg.status,
      effectiveStatus: effectiveStatus,
      isExpired: isPastExpiry,
      daysRemaining: daysRemaining,
      progressPercent: progressPercent,
      paymentStatus: pkg.payment_status || 'paid',
      payment_status: pkg.payment_status || 'paid',
      notes: pkg.notes || '',
      createdBy: pkg.created_by,
      created_by: pkg.created_by,
      createdAt: pkg.created_at,
      created_at: pkg.created_at
    };
  });
}

/**
 * Redeem 1 or more service entitlements against a package
 */
async function redeemPackage(params = {}, adminUserParam = 'admin', client = null) {
  const packageId = params.packageId || params.id;
  const qtyToRedeem = parseInt(params.quantity || params.quantityRedeemed || 1, 10);
  const vehicleId = params.vehicleId || params.assetId || null;
  const locationId = params.locationId || null;
  const serviceJobId = params.serviceJobId || null;
  const notes = params.notes || null;
  const serviceDate = params.redemptionDate || params.serviceDate || null;
  const adminUser = params.adminUser || (typeof adminUserParam === 'string' ? adminUserParam : 'admin');
  const actualClient = client || (adminUserParam && typeof adminUserParam === 'object' && typeof adminUserParam.query === 'function' ? adminUserParam : null) || params.client || null;

  if (!packageId) {
    throw new Error('Package ID is required.');
  }
  if (isNaN(qtyToRedeem) || qtyToRedeem <= 0) {
    throw new Error('Redemption quantity must be at least 1.');
  }

  if (isNeonActive()) {
    const res = await repos.packages.redeemPackage(packageId, {
      quantity: qtyToRedeem,
      vehicleId,
      locationId,
      serviceJobId,
      notes,
      redeemedBy: adminUser
    }, actualClient);

    // Audit log
    await repos.auditLogs.logChange({
      entityType: 'package_redemption',
      entityId: res.redemptionLog.id,
      action: 'redeem_package',
      changedBy: adminUser,
      afterState: {
        packageId: packageId,
        packageName: res.package.package_name,
        quantityRedeemed: qtyToRedeem,
        remainingQuantity: res.package.remaining_quantity,
        status: res.package.status
      }
    });

    return {
      ...res.package,
      success: true,
      package: res.package,
      redemption: res.redemptionLog,
      redemptionLog: res.redemptionLog,
      message: `Successfully redeemed ${qtyToRedeem} entitlement(s). Remaining balance: ${res.package.remaining_quantity}.`
    };
  }

  // Local fallback
  const pkg = localPackagesStore.find(p => p.id === packageId);
  if (!pkg) {
    throw new Error(`Package '${packageId}' not found.`);
  }
  if (pkg.status === 'cancelled') {
    throw new Error('Cannot redeem from a cancelled package.');
  }
  if (pkg.remaining_quantity <= 0 || pkg.status === 'exhausted') {
    throw new Error('Package entitlement has been completely exhausted (0 remaining).');
  }

  // Idempotency check: prevent duplicate redemption for the same service job
  if (serviceJobId) {
    const duplicate = localRedemptionsStore.find(r => r.service_job_id === serviceJobId);
    if (duplicate) {
      throw new Error(`Service job '${serviceJobId}' has already redeemed an entitlement.`);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (pkg.expiry_date < todayStr) {
    pkg.status = 'expired';
    throw new Error(`Package expired on ${pkg.expiry_date}. Cannot redeem expired entitlements.`);
  }
  if (pkg.remaining_quantity < qtyToRedeem) {
    throw new Error(`Insufficient entitlement balance. Requested: ${qtyToRedeem}, Available: ${pkg.remaining_quantity}.`);
  }

  const balanceBefore = pkg.remaining_quantity;
  const balanceAfter = balanceBefore - qtyToRedeem;
  pkg.redeemed_quantity += qtyToRedeem;
  pkg.redeemedQuantity = pkg.redeemed_quantity;
  pkg.remaining_quantity = balanceAfter;
  pkg.remainingQuantity = balanceAfter;
  if (balanceAfter === 0) {
    pkg.status = 'exhausted';
  }
  pkg.updated_at = new Date().toISOString();

  const logEntry = {
    id: 'red_' + Date.now(),
    package_id: pkg.id,
    customer_id: pkg.customer_id,
    vehicle_id: vehicleId || pkg.vehicle_id,
    asset_id: vehicleId || pkg.asset_id,
    location_id: locationId || pkg.location_id,
    quantity_redeemed: qtyToRedeem,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    remaining_balance_after: balanceAfter,
    redeemed_by: adminUser || 'admin',
    service_job_id: serviceJobId || null,
    notes: notes ? String(notes).trim() : null,
    redemption_date: serviceDate || new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  localRedemptionsStore.unshift(logEntry);

  return {
    ...pkg,
    success: true,
    package: pkg,
    redemption: logEntry,
    redemptionLog: logEntry,
    message: `Successfully redeemed ${qtyToRedeem} entitlement(s). Remaining balance: ${balanceAfter}.`
  };
}

/**
 * Cancel a package
 */
async function cancelPackage(packageIdOrObj, reasonParam = 'Administrative cancellation', adminUserParam = 'admin') {
  let packageId, reason, adminUser;
  if (typeof packageIdOrObj === 'object' && packageIdOrObj !== null) {
    packageId = packageIdOrObj.packageId || packageIdOrObj.id;
    reason = packageIdOrObj.reason || reasonParam;
    adminUser = packageIdOrObj.adminUser || adminUserParam;
  } else {
    packageId = packageIdOrObj;
    reason = reasonParam;
    adminUser = adminUserParam;
  }

  if (!packageId) {
    throw new Error('Package ID is required.');
  }

  if (isNeonActive()) {
    const cancelled = await repos.packages.cancelPackage(packageId, { reason, adminUser });
    await repos.auditLogs.logChange({
      entityType: 'customer_package',
      entityId: packageId,
      action: 'cancel_package',
      changedBy: adminUser,
      afterState: { status: 'cancelled', reason }
    });
    return {
      ...cancelled,
      success: true,
      package: cancelled,
      message: 'Package cancelled successfully.'
    };
  }

  const pkg = localPackagesStore.find(p => p.id === packageId);
  if (!pkg) {
    throw new Error(`Package '${packageId}' not found.`);
  }
  pkg.status = 'cancelled';
  pkg.notes = pkg.notes ? `${pkg.notes}\n[Cancelled by ${adminUser}: ${reason}]` : `[Cancelled by ${adminUser}: ${reason}]`;
  pkg.updated_at = new Date().toISOString();

  return {
    ...pkg,
    success: true,
    package: pkg,
    message: 'Package cancelled successfully.'
  };
}

/**
 * Get redemption ledger history for a package
 */
async function getPackageRedemptions(packageId) {
  if (!packageId) return [];

  if (isNeonActive()) {
    return repos.packages.findRedemptionsByPackageId(packageId);
  }

  return localRedemptionsStore.filter(r => r.package_id === packageId);
}

/**
 * Get package details by ID
 */
async function getPackageById(packageId) {
  if (!packageId) return null;

  if (isNeonActive()) {
    return repos.packages.findById(packageId);
  }

  const raw = localPackagesStore.find(p => p.id === packageId) || null;
  if (!raw) return null;
  raw.remainingQuantity = raw.remaining_quantity;
  raw.redeemedQuantity = raw.redeemed_quantity;
  raw.totalQuantity = raw.total_quantity;
  return raw;
}

// Test / Reset Helper for isolated QA execution
function __resetLocalStore() {
  localPackagesStore = [];
  localRedemptionsStore = [];
}

module.exports = {
  getPackageCatalog,
  sellPackage,
  getCustomerPackages,
  redeemPackage,
  cancelPackage,
  getPackageRedemptions,
  getPackageById,
  __resetLocalStore,
  _clearMemPackages: __resetLocalStore
};
