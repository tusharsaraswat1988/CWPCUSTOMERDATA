/**
 * Repository for tables: customer_packages and package_redemption_logs
 * Packages & Entitlements Decoupled Subsystem
 */
const db = require('../index');

/**
 * Create a new customer package purchase record
 */
async function createPackage({
  packageCode,
  packageName,
  customerId,
  vehicleId = null,
  locationId = null,
  serviceCategoryId = 'car_washing',
  totalQuantity = 1,
  unitPrice = 0.00,
  totalPrice = 0.00,
  validityMonths = 1,
  purchaseDate = null,
  activationDate = null,
  expiryDate = null,
  status = 'active',
  paymentStatus = 'paid',
  notes = null,
  createdBy = 'admin'
}, client = null) {
  const runner = client || db;

  const totalQty = parseInt(totalQuantity, 10) || 1;
  const pDate = purchaseDate || new Date().toISOString().split('T')[0];
  
  let expDate = expiryDate;
  if (!expDate) {
    const d = new Date(pDate);
    d.setMonth(d.getMonth() + (parseInt(validityMonths, 10) || 1));
    expDate = d.toISOString().split('T')[0];
  }

  const actDate = activationDate || pDate;
  const uPrice = parseFloat(unitPrice) || 0.00;
  const tPrice = totalPrice !== undefined && totalPrice !== null ? parseFloat(totalPrice) : (uPrice * totalQty);

  const res = await runner.query(
    `INSERT INTO public.customer_packages (
       package_code, package_name, customer_id, vehicle_id, location_id,
       service_category_id, total_quantity, redeemed_quantity, remaining_quantity,
       unit_price, total_price, validity_months, purchase_date, activation_date,
       expiry_date, status, payment_status, notes, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, 0, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
     ) RETURNING *`,
    [
      packageCode.trim(),
      packageName.trim(),
      customerId,
      vehicleId || null,
      locationId || null,
      serviceCategoryId.trim(),
      totalQty,
      uPrice,
      tPrice,
      parseInt(validityMonths, 10) || 1,
      pDate,
      actDate,
      expDate,
      status || 'active',
      paymentStatus || 'paid',
      notes ? String(notes).trim() : null,
      createdBy || 'admin'
    ]
  );

  return res.rows[0];
}

/**
 * Retrieve all packages for a customer with optional filtering
 */
async function findByCustomerId(customerId, {
  includeExhausted = true,
  includeCancelled = false,
  status = null,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = ['cp.customer_id = $1', 'cp.deleted_at IS NULL'];
  const params = [customerId];

  if (status) {
    params.push(status);
    conditions.push(`cp.status = $${params.length}`);
  } else {
    if (!includeExhausted) {
      conditions.push("cp.status != 'exhausted'");
    }
    if (!includeCancelled) {
      conditions.push("cp.status != 'cancelled'");
    }
  }

  const sql = `
    SELECT cp.*,
           v.registration_no,
           v.brand_or_model,
           v.car_make,
           v.car_color,
           sl.location_name,
           sl.address_text,
           sc.display_name AS category_display_name
    FROM public.customer_packages cp
    LEFT JOIN public.vehicles v ON cp.vehicle_id = v.id
    LEFT JOIN public.service_locations sl ON cp.location_id = sl.id
    LEFT JOIN public.service_categories sc ON cp.service_category_id = sc.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cp.created_at DESC
  `;

  const res = await runner.query(sql, params);
  return res.rows;
}

/**
 * Retrieve single package by ID
 */
async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT cp.*,
            v.registration_no,
            v.brand_or_model,
            v.car_make,
            v.car_color,
            sl.location_name,
            sl.address_text,
            sc.display_name AS category_display_name
     FROM public.customer_packages cp
     LEFT JOIN public.vehicles v ON cp.vehicle_id = v.id
     LEFT JOIN public.service_locations sl ON cp.location_id = sl.id
     LEFT JOIN public.service_categories sc ON cp.service_category_id = sc.id
     WHERE cp.id = $1 AND cp.deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Atomic redemption with concurrency protection (FOR UPDATE row lock)
 */
async function redeemPackage(packageId, {
  quantity = 1,
  vehicleId = null,
  locationId = null,
  serviceJobId = null,
  notes = null,
  redeemedBy = 'admin'
} = {}, client = null) {
  const qtyToRedeem = parseInt(quantity, 10);
  if (isNaN(qtyToRedeem) || qtyToRedeem <= 0) {
    throw new Error('Quantity to redeem must be at least 1.');
  }

  async function executeRedemption(runner) {
    // 1. Lock and fetch package row for atomic mutation
    const pkgRes = await runner.query(
      `SELECT * FROM public.customer_packages 
       WHERE id = $1 AND deleted_at IS NULL 
       FOR UPDATE`,
      [packageId]
    );

    const pkg = pkgRes.rows[0];
    if (!pkg) {
      throw new Error(`Package with ID '${packageId}' not found.`);
    }

    if (pkg.status === 'cancelled') {
      throw new Error('Cannot redeem from a cancelled package.');
    }
    if (pkg.status === 'exhausted' || pkg.remaining_quantity <= 0) {
      throw new Error('Package entitlement has been completely exhausted (0 remaining).');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const expDateStr = new Date(pkg.expiry_date).toISOString().split('T')[0];
    if (expDateStr < todayStr) {
      // Transition status to expired
      await runner.query(
        `UPDATE public.customer_packages SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [pkg.id]
      );
      throw new Error(`Package expired on ${expDateStr}. Cannot redeem expired entitlements.`);
    }

    if (pkg.remaining_quantity < qtyToRedeem) {
      throw new Error(`Insufficient entitlement balance. Requested: ${qtyToRedeem}, Available: ${pkg.remaining_quantity}.`);
    }

    // Idempotency check: prevent duplicate redemption for the same service job
    if (serviceJobId) {
      const existingJobRed = await runner.query(
        `SELECT id FROM public.package_redemption_logs WHERE service_job_id = $1`,
        [serviceJobId]
      );
      if (existingJobRed.rows && existingJobRed.rows.length > 0) {
        throw new Error(`Service job '${serviceJobId}' has already redeemed an entitlement from package '${packageId}'.`);
      }
    }

    const balanceBefore = pkg.remaining_quantity;
    const balanceAfter = balanceBefore - qtyToRedeem;
    const newRedeemed = pkg.redeemed_quantity + qtyToRedeem;
    const newStatus = balanceAfter === 0 ? 'exhausted' : pkg.status;

    // 2. Update customer package balance
    const updatedPkgRes = await runner.query(
      `UPDATE public.customer_packages
       SET redeemed_quantity = $1,
           remaining_quantity = $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newRedeemed, balanceAfter, newStatus, pkg.id]
    );

    // 3. Write immutable entry to package_redemption_logs
    const logRes = await runner.query(
      `INSERT INTO public.package_redemption_logs (
         package_id, customer_id, vehicle_id, location_id,
         quantity_redeemed, balance_before, balance_after,
         redeemed_by, service_job_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        pkg.id,
        pkg.customer_id,
        vehicleId || pkg.vehicle_id || null,
        locationId || pkg.location_id || null,
        qtyToRedeem,
        balanceBefore,
        balanceAfter,
        redeemedBy || 'admin',
        serviceJobId || null,
        notes ? String(notes).trim() : null
      ]
    );

    return {
      package: updatedPkgRes.rows[0],
      redemptionLog: logRes.rows[0]
    };
  }

  if (client) {
    return executeRedemption(client);
  } else {
    return db.withTransaction(executeRedemption);
  }
}

/**
 * Cancel a package
 */
async function cancelPackage(id, {
  reason = 'Administrative cancellation',
  adminUser = 'admin'
} = {}, client = null) {
  const runner = client || db;

  const pkg = await findById(id, runner);
  if (!pkg) {
    throw new Error(`Package '${id}' not found.`);
  }

  const noteAddition = `[Cancelled by ${adminUser} on ${new Date().toISOString().split('T')[0]}: ${reason}]`;
  const updatedNotes = pkg.notes ? `${pkg.notes}\n${noteAddition}` : noteAddition;

  const res = await runner.query(
    `UPDATE public.customer_packages
     SET status = 'cancelled',
         notes = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, updatedNotes]
  );

  return res.rows[0] || null;
}

/**
 * Retrieve redemption ledger for a specific package
 */
async function findRedemptionsByPackageId(packageId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT prl.*,
            v.registration_no,
            v.brand_or_model,
            sl.location_name
     FROM public.package_redemption_logs prl
     LEFT JOIN public.vehicles v ON prl.vehicle_id = v.id
     LEFT JOIN public.service_locations sl ON prl.location_id = sl.id
     WHERE prl.package_id = $1
     ORDER BY prl.redemption_date DESC`,
    [packageId]
  );
  return res.rows;
}

/**
 * Retrieve redemption history for a customer
 */
async function findRedemptionsByCustomerId(customerId, { limit = 100, offset = 0, client = null } = {}) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT prl.*,
            cp.package_name,
            cp.package_code,
            cp.service_category_id,
            v.registration_no,
            v.brand_or_model,
            sl.location_name
     FROM public.package_redemption_logs prl
     JOIN public.customer_packages cp ON prl.package_id = cp.id
     LEFT JOIN public.vehicles v ON prl.vehicle_id = v.id
     LEFT JOIN public.service_locations sl ON prl.location_id = sl.id
     WHERE prl.customer_id = $1
     ORDER BY prl.redemption_date DESC
     LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );
  return res.rows;
}

module.exports = {
  createPackage,
  findByCustomerId,
  findById,
  redeemPackage,
  cancelPackage,
  findRedemptionsByPackageId,
  findRedemptionsByCustomerId
};
