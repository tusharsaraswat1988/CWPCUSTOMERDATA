/**
 * =========================================================================
 * CWP DATA APP - ADMIN SERVICE
 * Phase 3: Comprehensive Admin Panel Management Workflows
 * =========================================================================
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');
const authService = require('./authService');
const staffPortalService = require('./staffPortalService');

function normalizeIndianMobile(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim().replace(/^'+/, '').trim();
  if (!str || /[a-zA-Z]/.test(str)) return '';
  if (str.includes('+') && !/^\s*\+\s*91/.test(str)) return '';
  if (/[^\d+\s\-()]/.test(str)) return '';
  let cleaned = str.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) cleaned = cleaned.substring(3);
  else if (cleaned.startsWith('+')) return '';
  let digits = cleaned.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.substring(1);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.substring(2);
  return digits;
}

function isValidIndianMobile(value) {
  const digits = normalizeIndianMobile(value);
  return /^[6-9]\d{9}$/.test(digits);
}

/**
 * Parses composite vehicle text e.g. "UP85BY2928 (White Swift)" or "UP85BY2928"
 */
function parseVehicleString(str) {
  if (!str) return { reg: '', model: '' };
  const s = String(str).trim();
  const match = s.match(/^([A-Z0-9\s\-]+?)(?:\s*\((.*?)\))?$/i);
  if (match) {
    const reg = (match[1] || '').trim().toUpperCase();
    const model = (match[2] || '').trim();
    return { reg, model };
  }
  return { reg: s.toUpperCase(), model: '' };
}

/**
 * Retrieve aggregated customers list for Admin Panel
 */
async function getAllCustomers({ search = '', category = null, staffId = null, limit = 500, offset = 0 } = {}) {
  // Query customers with their active subscriptions, vehicles, and locations
  const customers = await repos.customers.findAll({ search, includeDeleted: false, limit, offset });

  if (customers.length === 0) {
    return [];
  }

  // Fetch related entities for all fetched customers
  const custIds = customers.map(c => c.id);

  // Locations query
  const locsRes = await db.query(
    'SELECT * FROM public.service_locations WHERE customer_id = ANY($1) AND deleted_at IS NULL ORDER BY is_primary DESC',
    [custIds]
  );
  const locsByCust = new Map();
  locsRes.rows.forEach(l => {
    if (!locsByCust.has(l.customer_id)) locsByCust.set(l.customer_id, []);
    locsByCust.get(l.customer_id).push(l);
  });

  // Vehicles query
  const vehsRes = await db.query(
    'SELECT * FROM public.vehicles WHERE customer_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC',
    [custIds]
  );
  const vehsByCust = new Map();
  vehsRes.rows.forEach(v => {
    if (!vehsByCust.has(v.customer_id)) vehsByCust.set(v.customer_id, []);
    vehsByCust.get(v.customer_id).push(v);
  });

  // Subscriptions query
  const subsRes = await db.query(
    `SELECT sub.*, 
            sa.staff_id, st.name AS staff_name, st.staff_code
     FROM public.subscriptions sub
     LEFT JOIN public.staff_assignments sa ON sub.id = sa.subscription_id AND sa.is_active = TRUE
     LEFT JOIN public.staff st ON sa.staff_id = st.id
     WHERE sub.customer_id = ANY($1) AND sub.deleted_at IS NULL`,
    [custIds]
  );
  const subsByCust = new Map();
  subsRes.rows.forEach(s => {
    if (!subsByCust.has(s.customer_id)) subsByCust.set(s.customer_id, []);
    subsByCust.get(s.customer_id).push(s);
  });

  // On-demand jobs query
  const jobsRes = await db.query(
    `SELECT j.*, 
            sa.staff_id, st.name AS staff_name, st.staff_code
     FROM public.service_jobs j
     LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     LEFT JOIN public.staff st ON sa.staff_id = st.id
     WHERE j.customer_id = ANY($1) AND j.deleted_at IS NULL`,
    [custIds]
  );
  const jobsByCust = new Map();
  jobsRes.rows.forEach(j => {
    if (!jobsByCust.has(j.customer_id)) jobsByCust.set(j.customer_id, []);
    jobsByCust.get(j.customer_id).push(j);
  });

  // Format into rich view model compatible with frontend expectations
  const results = [];
  for (const c of customers) {
    const locs = locsByCust.get(c.id) || [];
    const vehs = vehsByCust.get(c.id) || [];
    const subs = subsByCust.get(c.id) || [];
    const jobs = jobsByCust.get(c.id) || [];

    const primaryLoc = locs.find(l => l.is_primary) || locs[0] || null;
    const secondaryLoc = locs.find(l => !l.is_primary) || (locs.length > 1 ? locs[1] : null);

    // Active subscription (daily clean)
    const activeSub = subs.find(s => s.status === 'active') || subs[0] || null;

    // Service category classification
    let serviceCategory = 'Daily Car Cleaning';
    let sheetName = 'Daily Clean';
    let staffName = '';
    let assignedStaffId = '';

    if (activeSub) {
      serviceCategory = 'Daily Car Cleaning';
      sheetName = 'Daily Clean';
      staffName = activeSub.staff_name || '';
      assignedStaffId = activeSub.staff_code || (activeSub.staff_id ? 'STF01' : '');
    } else if (jobs.length > 0) {
      const latestJob = jobs[0];
      sheetName = 'All Other Work';
      if (latestJob.service_category_id === 'solar_cleaning') {
        serviceCategory = 'Solar Panel Cleaning';
      } else {
        serviceCategory = 'Car Washing';
      }
      staffName = latestJob.staff_name || '';
      assignedStaffId = latestJob.staff_code || '';
    }

    // Apply category / staff filter if requested
    if (category && serviceCategory.toLowerCase() !== category.toLowerCase()) {
      continue;
    }
    if (staffId && assignedStaffId.toUpperCase() !== staffId.toUpperCase()) {
      continue;
    }

    // Vehicles summary string e.g. "UP85BY2928 (White Swift)"
    const vehicleStrings = vehs.map(v => v.brand_or_model ? `${v.registration_no} (${v.brand_or_model})` : v.registration_no);
    const mainVehicle = vehicleStrings[0] || '';
    const mainPhoto = vehs[0]?.photo_url || '';

    results.push({
      id: c.id,
      customerCode: c.customer_code,
      customerName: c.name,
      customerNumber: c.phone,
      phone: c.phone,
      altPhone: c.alt_phone || '',
      email: c.email || '',
      notes: c.notes || '',
      address: primaryLoc?.address_text || '',
      googleMapsUrl: primaryLoc?.google_maps_url || '',
      parkingDetails: primaryLoc?.parking_details || '',
      secondaryAddress: secondaryLoc?.address_text || '',
      secondaryMapsUrl: secondaryLoc?.google_maps_url || '',
      secondaryParkingDetails: secondaryLoc?.parking_details || '',
      vehicle: mainVehicle,
      vehicles: vehs,
      locations: locs,
      photoUrl: mainPhoto,
      serviceCategory: serviceCategory,
      sheetName: sheetName,
      packageName: activeSub?.package_name || (serviceCategory === 'Daily Car Cleaning' ? 'Daily Clean' : serviceCategory),
      packageType: activeSub?.package_name || 'Daily Clean',
      packagesPurchased: String(activeSub?.packages_purchased || 1),
      rotationType: activeSub?.rotation_type || 'none',
      rotationNotes: activeSub?.rotation_notes || '',
      staffName: staffName,
      staffId: assignedStaffId,
      active: c.is_active ? 'Yes' : 'No',
      isActive: c.is_active,
      createdAt: c.created_at,
      rowIndex: c.source_row_index || 0
    });
  }

  return results;
}

/**
 * Get detailed customer record by ID
 */
async function getCustomerById(id) {
  const customer = await repos.customers.findById(id);
  if (!customer) return null;

  const locations = await repos.serviceLocations.findByCustomerId(customer.id);
  const vehicles = await repos.vehicles.findByCustomerId(customer.id);
  const subscriptions = await repos.subscriptions.findByCustomerId(customer.id);

  let subscriptionVehicles = [];
  let assignedStaff = null;

  if (subscriptions.length > 0) {
    const activeSub = subscriptions.find(s => s.status === 'active') || subscriptions[0];
    subscriptionVehicles = await repos.subscriptionVehicles.findBySubscriptionId(activeSub.id);
    assignedStaff = await repos.staffAssignments.findActiveBySubscriptionId(activeSub.id);
  }

  const jobs = await repos.serviceJobs.findAll({ customerId: customer.id });

  return {
    customer,
    locations,
    vehicles,
    subscriptions,
    subscriptionVehicles,
    assignedStaff,
    jobs
  };
}

/**
 * Save Customer Workflow (Transactions + Foreign Key Safeguards + Audit Logging)
 */
async function saveCustomer(custData, adminUser = 'admin') {
  const rawPhone = custData.customerNumber || custData.phone || custData.custPhone || custData.mobile || '';
  if (!isValidIndianMobile(rawPhone)) {
    return {
      success: false,
      error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
    };
  }

  const normPhone = normalizeIndianMobile(rawPhone);
  const custName = (custData.customerName || custData.name || '').trim();
  if (!custName) {
    return { success: false, error: 'Customer name is required.' };
  }

  return db.withTransaction(async (client) => {
    // Generate unique customer_code
    const codePrefix = (custData.sheetName === 'All Other Work') ? 'CUST_AOW_' : 'CUST_DC_';
    const uniqueSuffix = Date.now().toString().slice(-4);
    const customerCode = `${codePrefix}${normPhone}_${uniqueSuffix}`;

    // 1. Create Customer Master
    const customer = await repos.customers.createCustomer({
      customerCode,
      name: custName,
      phone: normPhone,
      altPhone: custData.altPhone || null,
      email: custData.email || null,
      notes: custData.notes || null,
      sourceSheetName: custData.sheetName || 'Daily Clean',
      sourceRowIndex: 0,
      isActive: true
    }, client);

    // 2. Create Service Locations
    let primaryLocation = null;
    const addr = (custData.address || custData.location || '').trim();
    if (addr) {
      primaryLocation = await repos.serviceLocations.createLocation({
        customerId: customer.id,
        addressType: 'primary',
        addressText: addr,
        googleMapsUrl: custData.googleMapsUrl || null,
        parkingDetails: custData.parkingDetails || null,
        isPrimary: true,
        isActive: true
      }, client);
    }

    // Secondary Location if provided
    let secondaryLocation = null;
    const secAddr = (custData.secondaryAddress || custData.secondAddress || '').trim();
    if (secAddr) {
      secondaryLocation = await repos.serviceLocations.createLocation({
        customerId: customer.id,
        addressType: 'secondary',
        addressText: secAddr,
        googleMapsUrl: custData.secondaryMapsUrl || custData.secondGoogleMapsUrl || null,
        parkingDetails: custData.secondaryParkingDetails || custData.secondParkingDetails || null,
        isPrimary: false,
        isActive: true
      }, client);
    }

    // 3. Create Vehicles
    const rawVehicles = [];
    if (custData.vehicle || custData.vehicleDetails) {
      rawVehicles.push({
        raw: custData.vehicle || custData.vehicleDetails,
        photo: custData.photoUrl || custData.photo || ''
      });
    }
    if (custData.secondVehicleDetails || custData.vehicle2) {
      rawVehicles.push({
        raw: custData.secondVehicleDetails || custData.vehicle2,
        photo: custData.secondVehiclePhoto || custData.photo2 || ''
      });
    }
    if (custData.thirdVehicleDetails || custData.vehicle3) {
      rawVehicles.push({
        raw: custData.thirdVehicleDetails || custData.vehicle3,
        photo: custData.thirdVehiclePhoto || custData.photo3 || ''
      });
    }

    const createdVehicles = [];
    for (let i = 0; i < rawVehicles.length; i++) {
      const vItem = rawVehicles[i];
      const parsed = parseVehicleString(vItem.raw);
      if (parsed.reg) {
        const veh = await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLocation?.id || null,
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || null,
          vehicleType: 'Car',
          photoUrl: vItem.photo || null,
          isActive: true
        }, client);
        createdVehicles.push(veh);
      }
    }

    // 4. Resolve Staff Member Assignment
    let assignedStaff = null;
    const sName = (custData.staffName || '').trim();
    const sId = (custData.staffId || '').trim();

    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      assignedStaff = await repos.staff.findByStaffCode(sId, client);
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      assignedStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase()) || null;
    }

    // 5. Create Daily Cleaning Subscription or On-Demand Service Job
    const cat = (custData.serviceCategory || custData.category || custData.sheetName || '').trim();
    const isDaily = cat === 'Daily Car Cleaning' || cat === 'Daily Clean' || cat === 'daily_car_cleaning';

    if (isDaily) {
      const sub = await repos.subscriptions.createSubscription({
        customerId: customer.id,
        serviceCategoryId: 'daily_car_cleaning',
        packageName: custData.packageType || custData.packageName || 'Daily Clean',
        packagesPurchased: parseInt(custData.packagesPurchased, 10) || 1,
        rotationType: custData.rotationType || (custData.aajKal ? 'aaj_kal' : 'none'),
        rotationNotes: custData.rotationNotes || custData.notes || null,
        status: 'active'
      }, client);

      // Attach vehicles to subscription
      for (const cv of createdVehicles) {
        await repos.subscriptionVehicles.addVehicleToSubscription({
          subscriptionId: sub.id,
          customerId: customer.id,
          vehicleId: cv.id,
          locationId: primaryLocation?.id || null,
          scheduleTag: custData.scheduleTag || 'daily'
        }, client);
      }

      // Assign staff to subscription
      if (assignedStaff) {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: assignedStaff.id,
          subscriptionId: sub.id,
          assignedBy: adminUser
        }, client);
      }
    } else {
      // On-Demand Car Wash or Solar Cleaning Job
      const isSolar = cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning';
      const serviceCatId = isSolar ? 'solar_cleaning' : 'car_washing';

      const job = await repos.serviceJobs.createJob({
        customerId: customer.id,
        vehicleId: createdVehicles[0]?.id || null,
        locationId: primaryLocation?.id || (await repos.serviceLocations.findByCustomerId(customer.id, { client }))[0]?.id,
        serviceCategoryId: serviceCatId,
        serviceType: custData.serviceType || custData.packageType || (isSolar ? 'Solar Cleaning' : 'Car Wash'),
        packageDetails: custData.packageDetails || null,
        siteDetails: isSolar ? { panelCount: custData.panelCount || 10, roofType: 'RCC' } : null,
        scheduledDate: custData.scheduledDate || null,
        status: 'assigned',
        specialInstructions: custData.notes || null,
        photoUrl: custData.photoUrl || null
      }, client);

      if (assignedStaff) {
        await repos.staffAssignments.assignStaffToJob({
          staffId: assignedStaff.id,
          jobId: job.id,
          assignedBy: adminUser
        }, client);
      }
    }

    // 6. Audit Trail
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'create',
      changedBy: adminUser,
      afterState: { customerCode, name: custName, phone: normPhone }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      customerCode: customer.customer_code,
      message: 'Customer saved successfully to Neon PostgreSQL'
    };
  });
}

/**
 * Update Customer Workflow
 */
async function updateCustomer(custData, adminUser = 'admin') {
  const custId = custData.id;
  let customer = null;

  if (custId) {
    customer = await repos.customers.findById(custId);
  }
  if (!customer && custData.customerNumber && custData.customerName) {
    const normPhone = normalizeIndianMobile(custData.customerNumber);
    const existing = await repos.customers.findByPhone(normPhone);
    customer = existing.find(c => c.name.toLowerCase() === custData.customerName.toLowerCase()) || null;
  }
  if (!customer && custData.rowIndex) {
    const rowIdx = parseInt(custData.rowIndex, 10);
    if (!isNaN(rowIdx) && rowIdx > 0) {
      const byRow = await db.query('SELECT * FROM public.customers WHERE source_row_index = $1 AND deleted_at IS NULL LIMIT 1', [rowIdx]);
      customer = byRow.rows[0] || null;
    }
  }

  if (!customer) {
    // If updating a record not yet in Neon, create it
    return saveCustomer(custData, adminUser);
  }

  return db.withTransaction(async (client) => {
    const rawBefore = await getCustomerById(customer.id);

    // 1. Update Customer Core
    const normPhone = custData.customerNumber ? normalizeIndianMobile(custData.customerNumber) : customer.phone;
    const finalNotes = custData.staffNotes !== undefined ? custData.staffNotes : (custData.notes !== undefined ? custData.notes : customer.notes);
    await repos.customers.updateCustomer(customer.id, {
      name: custData.customerName || customer.name,
      phone: normPhone,
      altPhone: custData.altPhone,
      email: custData.email,
      notes: finalNotes,
      isActive: custData.active !== undefined ? (custData.active === 'Yes' || custData.active === true) : customer.is_active
    }, client);

    // 2. Update / Upsert Primary Location
    let primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);
    const addr = (custData.address || custData.location || '').trim();
    if (addr) {
      if (primaryLoc) {
        await repos.serviceLocations.updateLocation(primaryLoc.id, {
          addressText: addr,
          googleMapsUrl: custData.googleMapsUrl,
          parkingDetails: custData.parkingDetails
        }, client);
      } else {
        primaryLoc = await repos.serviceLocations.createLocation({
          customerId: customer.id,
          addressType: 'primary',
          addressText: addr,
          googleMapsUrl: custData.googleMapsUrl,
          parkingDetails: custData.parkingDetails,
          isPrimary: true
        }, client);
      }
    }

    // 2b. Update / Upsert Secondary Location
    const secAddr = (custData.secondaryAddress || '').trim();
    const custLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
    let secondaryLoc = custLocs.find(l => !l.is_primary) || null;
    if (secAddr) {
      if (secondaryLoc) {
        await repos.serviceLocations.updateLocation(secondaryLoc.id, {
          addressText: secAddr,
          googleMapsUrl: custData.secondaryMapsUrl || '',
          parkingDetails: custData.secondaryParkingDetails || ''
        }, client);
      } else {
        await repos.serviceLocations.createLocation({
          customerId: customer.id,
          addressType: 'secondary',
          addressText: secAddr,
          googleMapsUrl: custData.secondaryMapsUrl || '',
          parkingDetails: custData.secondaryParkingDetails || '',
          isPrimary: false
        }, client);
      }
    }

    // 3. Update / Upsert Vehicle
    const rawVeh = (custData.vehicle || custData.vehicleDetails || '').trim();
    if (rawVeh) {
      const parsed = parseVehicleString(rawVeh);
      const existingVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
      if (existingVehs.length > 0) {
        await repos.vehicles.updateVehicle(existingVehs[0].id, {
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || existingVehs[0].brand_or_model,
          photoUrl: custData.photoUrl || existingVehs[0].photo_url
        }, client);
      } else if (parsed.reg) {
        await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLoc?.id || null,
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || null,
          photoUrl: custData.photoUrl || null
        }, client);
      }
    }

    // 4. Update Staff Assignment
    const sName = (custData.staffName || '').trim();
    const sId = (custData.staffId || '').trim();

    let targetStaff = null;
    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      targetStaff = await repos.staff.findByStaffCode(sId, client);
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      targetStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase()) || null;
    }

    // Check existing subscription
    const sub = await repos.subscriptions.findActiveByCustomerId(customer.id, client);
    if (sub) {
      if (targetStaff) {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: targetStaff.id,
          subscriptionId: sub.id,
          assignedBy: adminUser
        }, client);
      } else if (sName.toLowerCase() === 'unassigned' || sId.toLowerCase() === 'unassigned' || (!sName && !sId)) {
        await repos.staffAssignments.unassignSubscription({
          subscriptionId: sub.id,
          unassignedBy: adminUser,
          reason: 'Customer unassigned by admin'
        }, client);
      }
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'update',
      changedBy: adminUser,
      beforeState: { name: rawBefore.customer.name, phone: rawBefore.customer.phone },
      afterState: { name: custData.customerName || customer.name, phone: normPhone }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      message: 'Customer updated successfully'
    };
  });
}

/**
 * Soft Delete Customer with Mandatory Reason
 */
async function deleteCustomer(id, { reason = 'Administrative deletion', adminUser = 'admin' } = {}) {
  const target = (id || '').toString().trim();
  if (!target) {
    return { success: false, error: 'Customer ID is required.' };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target);
  let customer = null;
  if (isUuid) {
    customer = await repos.customers.findById(target);
  }
  if (!customer) {
    customer = await repos.customers.findByCode(target);
  }
  if (!customer) {
    return { success: false, error: 'Customer not found.' };
  }

  return db.withTransaction(async (client) => {
    // 1. Soft delete customer
    await repos.customers.softDelete(customer.id, {
      deletedBy: adminUser,
      deletionReason: reason
    }, client);

    // 2. Deactivate any active staff assignments for customer subscriptions and cancel subscriptions
    const subs = await repos.subscriptions.findByCustomerId(customer.id, { client });
    for (const sub of subs) {
      if (repos.subscriptions.cancelSubscription) {
        await repos.subscriptions.cancelSubscription(sub.id, client);
      }
      await repos.staffAssignments.unassignSubscription({
        subscriptionId: sub.id,
        unassignedBy: adminUser,
        reason: `Customer deleted: ${reason}`
      }, client);
    }

    // 3. Deactivate any active jobs
    const jobs = await repos.serviceJobs.findAll({ customerId: customer.id, client });
    for (const j of jobs) {
      await repos.serviceJobs.softDelete(j.id, client);
      await repos.staffAssignments.unassignJob({
        jobId: j.id,
        unassignedBy: adminUser,
        reason: `Customer deleted: ${reason}`
      }, client);
    }

    // 4. Soft delete locations and vehicles
    const locs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
    for (const loc of locs) {
      await repos.serviceLocations.softDelete(loc.id, client);
    }
    const vehs = await repos.vehicles.findByCustomerId(customer.id, { client });
    for (const veh of vehs) {
      await repos.vehicles.softDelete(veh.id, client);
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'delete',
      changedBy: adminUser,
      beforeState: { name: customer.name, customerCode: customer.customer_code },
      afterState: { deleted: true, reason }
    }, client);

    return { success: true, message: `Customer ${customer.name} deleted successfully.` };
  });
}

/**
 * Staff List with Role Sanitization (Public hides PIN & Phone; Admin exposes display PIN)
 */
async function getStaffList({ isAdmin = true } = {}) {
  const staffMembers = await repos.staff.findAll({ includeInactive: true });
  const results = [];

  for (const s of staffMembers) {
    if (!isAdmin) {
      results.push({
        id: s.staff_code,
        name: s.name,
        active: s.is_active ? 'Yes' : 'No'
      });
    } else {
      const auth = await repos.staffAuth.findByStaffId(s.id);
      let displayPin = '******';
      // In local_data or if numeric pin was migrated
      if (auth && /^\d{6}$/.test(auth.pin_hash)) {
        displayPin = auth.pin_hash;
      }
      results.push({
        id: s.staff_code,
        dbId: s.id,
        name: s.name,
        phone: s.phone,
        active: s.is_active ? 'Yes' : 'No',
        isActive: s.is_active,
        displayPin: displayPin,
        hasPin: Boolean(auth && auth.pin_hash),
        createdAt: s.created_at
      });
    }
  }

  return results;
}

/**
 * Save / Create Staff Member
 */
async function saveStaffMember({ staffId, staffCode, name, phone, pin, active = true }, adminUser = 'admin') {
  if (!name || !name.trim()) {
    return { success: false, error: 'Staff name is required.' };
  }

  const codeInput = (staffCode || staffId || '').toString().trim();

  return db.withTransaction(async (client) => {
    let staff = null;
    let isNew = false;

    if (codeInput) {
      staff = await repos.staff.findByStaffCode(codeInput, client);
      if (!staff && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(codeInput)) {
        staff = await repos.staff.findById(codeInput, client);
      }
    }

    const cleanPhone = phone ? normalizeIndianMobile(phone) : (staff ? staff.phone : '');
    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      return { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }

    if (!staff) {
      isNew = true;
      if (!pin || !/^\d{6}$/.test(pin.trim())) {
        return { success: false, error: 'A 6-digit PIN is required to create a new staff member. (PIN is required for new staff)' };
      }

      // Generate staff code e.g. STF03 if none provided
      let code = codeInput ? codeInput.toUpperCase() : '';
      if (!code) {
        const count = await repos.staff.countStaff(client);
        code = `STF${String(count + 1).padStart(2, '0')}`;
      }

      staff = await repos.staff.createStaff({
        staffCode: code,
        name: name.trim(),
        phone: cleanPhone,
        isActive: active === true || active === 'Yes' || active === 'yes'
      }, client);
    } else {
      // Update existing
      staff = await repos.staff.updateStaff(staff.id, {
        name: name.trim(),
        phone: cleanPhone,
        isActive: active === true || active === 'Yes' || active === 'yes'
      }, client);
    }

    // Update PIN if provided and valid
    if (pin && /^\d{6}$/.test(pin.trim())) {
      const pinHash = authService.hashPinScrypt(pin.trim());
      const salt = pinHash.split(':')[1];
      await repos.staffAuth.setPin(staff.id, pinHash, salt, client);
    }

    // Audit Log
    await repos.auditLogs.logChange({
      entityType: 'staff',
      entityId: staff.id,
      action: isNew ? 'create' : 'update',
      changedBy: adminUser,
      afterState: { staffCode: staff.staff_code, name: staff.name, phone: staff.phone }
    }, client);

    return {
      success: true,
      staffId: staff.staff_code,
      message: `Staff member ${staff.name} saved successfully.`
    };
  });
}

/**
 * Delete Staff Member (Soft Delete with Session Revocation & Audit Logging)
 */
async function deleteStaffMember(staffCodeOrId, adminUser = 'admin') {
  const target = (staffCodeOrId || '').toString().trim();
  if (!target) {
    return { success: false, error: 'Staff ID or Code is required.' };
  }

  let staff = await repos.staff.findByStaffCode(target);
  if (!staff) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target);
    if (isUuid) {
      staff = await repos.staff.findById(target);
    }
  }
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  return db.withTransaction(async (client) => {
    // 1. Soft delete staff record
    await repos.staff.softDelete(staff.id, client);

    // 2. Revoke all active sessions for this staff member
    await authService.revokeAllStaffSessions(staff.id, `deleted_by_${adminUser}`);

    // 3. Unassign from all active subscriptions and jobs
    if (repos.staffAssignments && repos.staffAssignments.unassignAllForStaff) {
      await repos.staffAssignments.unassignAllForStaff(staff.id, adminUser, `Staff deleted by ${adminUser}`, client);
    }

    // 4. Reset route sequence
    if (repos.staffRouteSequences && repos.staffRouteSequences.resetStaffRoute) {
      await repos.staffRouteSequences.resetStaffRoute(staff.id, client);
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'staff',
      entityId: staff.id,
      action: 'delete',
      changedBy: adminUser,
      beforeState: { staffCode: staff.staff_code, name: staff.name, phone: staff.phone },
      afterState: { deleted: true }
    }, client);

    return {
      success: true,
      staffId: staff.staff_code,
      message: `Staff member ${staff.name} deleted successfully.`
    };
  });
}

/**
 * Toggle Staff Active / Inactive
 */
async function toggleStaffActive(staffCode, isActive, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  const updated = await repos.staff.toggleActive(staff.id, isActive);
  if (!isActive) {
    // Revoke all active sessions immediately
    await authService.revokeAllStaffSessions(staff.id, `deactivated_by_${adminUser}`);
  }

  await repos.auditLogs.logChange({
    entityType: 'staff',
    entityId: staff.id,
    action: 'toggle_active',
    changedBy: adminUser,
    afterState: { staffCode: staff.staff_code, is_active: isActive }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    active: isActive ? 'Yes' : 'No',
    message: `Staff ${staff.name} is now ${isActive ? 'Active' : 'Inactive'}.`
  };
}

/**
 * Route Sequence Management
 */
async function getStaffSequence(staffCode) {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  const staffData = await staffPortalService.getStaffData(staff.id);
  const customers = staffData.dailyCarCleaning || [];
  const stops = await repos.staffRouteSequences.getStaffRoute(staff.id);

  return {
    success: true,
    staffId: staff.staff_code,
    staffName: staff.name,
    customers: customers,
    sequences: stops,
    hasCustomSequence: stops.length > 0,
    totalCount: customers.length
  };
}

async function saveStaffSequence(staffCode, sequenceStops, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  // Fetch active subscriptions for this staff member to resolve any customerId -> subscriptionId mappings
  const staffSubs = await db.query(
    `SELECT sub.id AS subscription_id, sub.customer_id, sv.id AS subscription_vehicle_id
     FROM public.staff_assignments sa
     JOIN public.subscriptions sub ON sa.subscription_id = sub.id
     LEFT JOIN public.subscription_vehicles sv ON sv.subscription_id = sub.id
     WHERE sa.staff_id = $1 AND sa.is_active = TRUE AND sub.status = 'active'`,
    [staff.id]
  );

  const custSubMap = new Map();
  for (const row of staffSubs.rows) {
    if (!custSubMap.has(row.customer_id)) {
      custSubMap.set(row.customer_id, row);
    }
  }

  const mappedStops = sequenceStops.map(s => {
    if (typeof s === 'string') {
      const sub = custSubMap.get(s);
      return { subscriptionId: sub?.subscription_id, subscriptionVehicleId: sub?.subscription_vehicle_id };
    }
    if (s.subscriptionId) return s;
    if (s.customerId && custSubMap.has(s.customerId)) {
      const sub = custSubMap.get(s.customerId);
      return {
        ...s,
        subscriptionId: sub.subscription_id,
        subscriptionVehicleId: s.subscriptionVehicleId || sub.subscription_vehicle_id
      };
    }
    return s;
  });

  const saved = await repos.staffRouteSequences.setStaffRoute(staff.id, mappedStops, adminUser);

  await repos.auditLogs.logChange({
    entityType: 'staff_route_sequences',
    entityId: staff.id,
    action: 'save_sequence',
    changedBy: adminUser,
    afterState: { stopCount: saved.length }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    message: `Route sequence saved with ${saved.length} stops.`
  };
}

async function resetStaffSequence(staffCode, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  await repos.staffRouteSequences.resetStaffRoute(staff.id);

  await repos.auditLogs.logChange({
    entityType: 'staff_route_sequences',
    entityId: staff.id,
    action: 'reset_sequence',
    changedBy: adminUser,
    afterState: { reset: true }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    message: `Route sequence reset to default order.`
  };
}

module.exports = {
  normalizeIndianMobile,
  isValidIndianMobile,
  parseVehicleString,
  getAllCustomers,
  getCustomerById,
  saveCustomer,
  updateCustomer,
  deleteCustomer,
  getStaffList,
  saveStaffMember,
  deleteStaffMember,
  toggleStaffActive,
  getStaffSequence,
  saveStaffSequence,
  resetStaffSequence
};
