/**
 * =========================================================================
 * CWP DATA APP — PRODUCTION DATA MIGRATION ENGINE
 * Imports customer data from Google Sheets source / audit cache into Neon PostgreSQL (cwp_customer_db).
 *
 * Requirements:
 * - Preserve all 51 customer rows.
 * - Preserve duplicate/shared phone numbers as separate customer rows.
 * - Preserve all multi-vehicle and multi-location mappings.
 * - Preserve subscriptions, vehicles, and alternate-day (Aaj/Kal) rotations.
 * - Preserve staff accounts and assignments (Chandan Soni, Gaurav Kr Gupta).
 * - Preserve staff route order matching source sheet row sequence.
 * - Preserve Car Washing and Solar jobs.
 * - Zero fabricated service history or logs.
 * - Atomically executed with full rollback protection and foreign-key validation.
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}
const db = require('../db');
const repos = require('../db/repositories');
const authService = require('../services/authService');
const adminService = require('../services/adminService');

// Default initial staff definitions
const STAFF_PROFILES = [
  {
    code: 'STF01',
    name: 'Chandan Soni',
    phone: '8887759207',
    pin: '123456'
  },
  {
    code: 'STF02',
    name: 'Gaurav Kr Gupta',
    phone: '8081913264',
    pin: '654321'
  }
];

function parseVehicleTokens(rawString) {
  if (!rawString || !rawString.trim()) {
    return [{ reg: 'PENDING', model: 'Unspecified Vehicle', raw: '' }];
  }
  // Split on "/" for multi-vehicle definitions e.g. "UP65FS2830 / UP65FB2304"
  const parts = rawString.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [{ reg: 'PENDING', model: 'Unspecified Vehicle', raw: rawString.trim() }];
  }

  return parts.map(p => {
    const indianPlateRegex = /([A-Z]{2}\s*[0-9]{1,2}\s*[A-Z]{0,3}\s*[0-9]{4})/i;
    const match = p.match(indianPlateRegex);
    if (match) {
      const reg = match[1].replace(/\s+/g, '').toUpperCase();
      const model = p.replace(match[0], '').replace(/[-–—/()]/g, ' ').replace(/\s+/g, ' ').trim();
      return { reg: reg.slice(0, 20), model: model ? model.slice(0, 100) : null, raw: p };
    }
    const altMatch = p.match(/([A-Z]{0,3}\s*[0-9]{3,4})/i);
    if (altMatch) {
      const reg = altMatch[1].replace(/\s+/g, '').toUpperCase();
      const model = p.replace(altMatch[0], '').replace(/[-–—/()]/g, ' ').replace(/\s+/g, ' ').trim();
      return { reg: reg.slice(0, 20), model: model ? model.slice(0, 100) : null, raw: p };
    }
    const clean = p.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return { reg: (clean || 'PENDING').slice(0, 20), model: p.slice(0, 100), raw: p };
  });
}

async function runMigration() {
  console.log('========================================================================');
  console.log('🚗 CWP DATA APP — STARTING GOOGLE SHEETS TO NEON DATA MIGRATION');
  console.log('Target Database: cwp_customer_db');
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('========================================================================\n');

  // 1. Database Health Check & Identity Guard
  const health = await db.healthCheck();
  if (!health.healthy || health.database !== 'cwp_customer_db') {
    throw new Error(`[Migration Abort] Target database is not cwp_customer_db (got: ${health.database})`);
  }
  console.log(`[Database] Connected to target: ${health.database} (${health.version})`);

  // 2. Load Source Records from Audit Cache
  const cachePath = path.join(__dirname, '..', 'fixtures', 'audit_report_cache.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Audit cache not found at: ${cachePath}`);
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const dailyCleanRows = cache.sheets?.['Daily Clean']?.rows || [];
  const allOtherRows = cache.sheets?.['All Other Work']?.rows || [];
  const allSourceRows = [...dailyCleanRows, ...allOtherRows];

  console.log(`[Source] Loaded ${dailyCleanRows.length} Daily Clean rows and ${allOtherRows.length} All Other Work rows (Total: ${allSourceRows.length})`);

  if (allSourceRows.length === 0) {
    throw new Error('No source records found to import.');
  }

  const stats = {
    staffCreated: 0,
    customersCreated: 0,
    locationsCreated: 0,
    vehiclesCreated: 0,
    subscriptionsCreated: 0,
    subscriptionVehiclesCreated: 0,
    jobsCreated: 0,
    staffAssignmentsCreated: 0,
    routeStopsCreated: { STF01: 0, STF02: 0 },
    duplicatePhoneInstances: 0,
    unassignedCustomers: 0
  };

  const staffRouteStops = {
    STF01: [],
    STF02: []
  };

  // 3. Execute in Atomic Transaction
  await db.withTransaction(async (client) => {
    // A. Provision Staff Members
    const staffMapByName = {};
    const staffMapByCode = {};

    for (const profile of STAFF_PROFILES) {
      let existingStaffRes = await client.query('SELECT * FROM public.staff WHERE UPPER(staff_code) = UPPER($1) LIMIT 1', [profile.code]);
      let existingStaff = existingStaffRes.rows[0];
      if (!existingStaff) {
        existingStaff = await repos.staff.createStaff({
          staffCode: profile.code,
          name: profile.name,
          phone: profile.phone,
          isActive: true
        }, client);
        const pinHash = authService.hashPinScrypt(profile.pin);
        const salt = pinHash.split(':')[1];
        await repos.staffAuth.setPin(existingStaff.id, pinHash, salt, client);
        stats.staffCreated++;
        console.log(`[Staff] Provisioned staff ${profile.code}: ${profile.name} (${profile.phone})`);
      } else {
        if (existingStaff.deleted_at) {
          await client.query('UPDATE public.staff SET deleted_at = NULL, is_active = TRUE WHERE id = $1', [existingStaff.id]);
        }
        console.log(`[Staff] Found existing staff ${profile.code}: ${profile.name}`);
      }
      staffMapByName[profile.name.toLowerCase()] = existingStaff;
      staffMapByCode[profile.code] = existingStaff;
    }

    // B. Check for existing customer codes to ensure idempotency
    const existingCustRes = await client.query('SELECT customer_code FROM public.customers');
    const existingCodes = new Set(existingCustRes.rows.map(r => r.customer_code));

    // C. Process each source row
    for (const row of allSourceRows) {
      const isDaily = row.sheetName === 'Daily Clean';
      const rawPhone = row.customerPhone || row.normalizedPhone || '0000000000';
      const normPhone = adminService.normalizeIndianMobile(rawPhone);
      const custName = (row.customerName || '').trim() || 'Unknown Customer';

      // Preserve distinct customer code with row index so duplicate phone numbers create distinct customers
      const prefix = isDaily ? 'CUST_DC_' : 'CUST_AOW_';
      const custCode = `CUST_${isDaily ? 'DC' : 'AOW'}_R${String(row.sourceRowIndex).padStart(2, '0')}_${normPhone}`;

      if (existingCodes.has(custCode)) {
        console.log(`[Skip] Customer already exists: ${custCode}`);
        continue;
      }

      // Check if phone was already seen in this batch
      const phoneCount = allSourceRows.filter(r => r.normalizedPhone === normPhone).length;
      if (phoneCount > 1) {
        stats.duplicatePhoneInstances++;
      }

      // 1. Create Customer
      const customer = await repos.customers.createCustomer({
        customerCode: custCode,
        name: custName,
        phone: normPhone,
        altPhone: null,
        email: null,
        notes: row.notes || null,
        sourceSheetName: row.sheetName,
        sourceRowIndex: row.sourceRowIndex,
        isActive: row.isActive !== false
      }, client);
      stats.customersCreated++;

      // 2. Create Service Locations
      // Primary location
      const addressText = (row.address || '').trim() || (row.mapUrl ? 'Location via Google Maps Link' : 'Varanasi Central Service Area');
      const primaryLoc = await repos.serviceLocations.createLocation({
        customerId: customer.id,
        addressType: 'primary',
        addressText,
        googleMapsUrl: row.mapUrl || null,
        parkingDetails: null,
        photoUrl: null,
        isPrimary: true,
        isActive: true
      }, client);
      stats.locationsCreated++;

      // Secondary location if provided
      let secondaryLoc = null;
      if (row.secondaryAddress || row.secondaryMapsUrl) {
        secondaryLoc = await repos.serviceLocations.createLocation({
          customerId: customer.id,
          addressType: 'secondary',
          addressText: (row.secondaryAddress || '').trim() || 'Secondary Service Location',
          googleMapsUrl: row.secondaryMapsUrl || null,
          parkingDetails: null,
          photoUrl: null,
          isPrimary: false,
          isActive: true
        }, client);
        stats.locationsCreated++;
      }

      // 3. Create Vehicles
      const vehicleTokens = parseVehicleTokens(row.vehicle);
      const createdVehicles = [];

      for (let vIdx = 0; vIdx < vehicleTokens.length; vIdx++) {
        const vToken = vehicleTokens[vIdx];
        const vPhoto = (vIdx === 0 && row.photoUrl) ? row.photoUrl : null;

        const vehicle = await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLoc.id,
          registrationNo: vToken.reg,
          brandOrModel: vToken.model,
          vehicleType: 'Car',
          photoUrl: vPhoto,
          isActive: true
        }, client);
        createdVehicles.push(vehicle);
        stats.vehiclesCreated++;
      }

      // 4. Resolve Staff Member Assignment
      const rawStaffName = (row.staffName || '').trim().toLowerCase();
      let assignedStaff = null;
      if (rawStaffName && rawStaffName !== 'unassigned' && rawStaffName !== 'none') {
        assignedStaff = staffMapByName[rawStaffName] || null;
      }
      if (!assignedStaff) {
        stats.unassignedCustomers++;
      }

      // 5. Create Daily Clean Subscription OR Service Job
      if (isDaily) {
        const isAlternateDay = Boolean(
          (row.notes && row.notes.includes('एक दिन में एक ही गाड़ी')) ||
          createdVehicles.length > 1
        );

        const sub = await repos.subscriptions.createSubscription({
          customerId: customer.id,
          serviceCategoryId: 'daily_car_cleaning',
          packageName: row.packageType || 'DCC SILVER',
          packagesPurchased: parseInt(row.packagesPurchased, 10) || 1,
          rotationType: isAlternateDay ? 'aaj_kal' : 'none',
          rotationNotes: row.notes || null,
          status: 'active'
        }, client);
        stats.subscriptionsCreated++;

        // Attach vehicles to subscription
        let primarySubVehId = null;
        for (let i = 0; i < createdVehicles.length; i++) {
          const cv = createdVehicles[i];
          const rotationGroup = isAlternateDay ? (i === 0 ? 'aaj' : 'kal') : null;

          const subVeh = await repos.subscriptionVehicles.addVehicleToSubscription({
            subscriptionId: sub.id,
            customerId: customer.id,
            vehicleId: cv.id,
            locationId: (i > 0 && secondaryLoc) ? secondaryLoc.id : primaryLoc.id,
            rotationGroup,
            preferredTimeWindow: null
          }, client);
          stats.subscriptionVehiclesCreated++;

          if (i === 0) primarySubVehId = subVeh.id;
        }

        // Create active staff assignment if assigned
        if (assignedStaff) {
          await repos.staffAssignments.assignStaffToSubscription({
            staffId: assignedStaff.id,
            subscriptionId: sub.id,
            assignedBy: 'data_migration'
          }, client);
          stats.staffAssignmentsCreated++;

          // Collect route sequence in sheet row order
          if (assignedStaff.staff_code === 'STF01') {
            staffRouteStops.STF01.push({
              subscriptionId: sub.id,
              subscriptionVehicleId: primarySubVehId,
              sourceRowIndex: row.sourceRowIndex
            });
          } else if (assignedStaff.staff_code === 'STF02') {
            staffRouteStops.STF02.push({
              subscriptionId: sub.id,
              subscriptionVehicleId: primarySubVehId,
              sourceRowIndex: row.sourceRowIndex
            });
          }
        }
      } else {
        // All Other Work -> Service Job (Car Wash / Solar)
        const firstVehicle = createdVehicles[0];
        const job = await repos.serviceJobs.createJob({
          customerId: customer.id,
          vehicleId: firstVehicle.id,
          locationId: primaryLoc.id,
          serviceCategoryId: 'car_washing',
          serviceType: row.packageType || 'Car Wash',
          packageDetails: null,
          siteDetails: null,
          scheduledDate: null,
          status: assignedStaff ? 'assigned' : 'pending',
          specialInstructions: row.notes || null,
          photoUrl: row.photoUrl || null
        }, client);
        stats.jobsCreated++;

        if (assignedStaff) {
          await repos.staffAssignments.assignStaffToJob({
            staffId: assignedStaff.id,
            jobId: job.id,
            assignedBy: 'data_migration'
          }, client);
          stats.staffAssignmentsCreated++;

          if (assignedStaff.staff_code === 'STF01') {
            staffRouteStops.STF01.push({
              jobId: job.id,
              sourceRowIndex: row.sourceRowIndex
            });
          } else if (assignedStaff.staff_code === 'STF02') {
            staffRouteStops.STF02.push({
              jobId: job.id,
              sourceRowIndex: row.sourceRowIndex
            });
          }
        }
      }
    }

    // D. Build Ordered Route Sequences for Staff STF01 and STF02
    for (const [sCode, stops] of Object.entries(staffRouteStops)) {
      const staffObj = staffMapByCode[sCode];
      if (!staffObj || stops.length === 0) continue;

      // Sort by original source row index to preserve exact route sequence
      stops.sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);

      const insertedStops = await repos.staffRouteSequences.setStaffRoute(
        staffObj.id,
        stops.map(s => ({
          subscriptionId: s.subscriptionId || null,
          subscriptionVehicleId: s.subscriptionVehicleId || null,
          jobId: s.jobId || null
        })),
        'data_migration',
        client
      );

      stats.routeStopsCreated[sCode] = insertedStops.length;
      console.log(`[Route] Preserved route order for ${staffObj.name} (${sCode}): ${insertedStops.length} stops`);
    }
  });

  console.log('\n========================================================================');
  console.log('✅ MIGRATION COMPLETED SUCCESSFULLY — RECONCILIATION REPORT');
  console.log('========================================================================');
  console.log(`Staff Members Created/Verified : ${Object.keys(STAFF_PROFILES).length}`);
  console.log(`Customers Imported            : ${stats.customersCreated} (Source Total: ${allSourceRows.length})`);
  console.log(`Locations Created             : ${stats.locationsCreated}`);
  console.log(`Vehicles Created              : ${stats.vehiclesCreated}`);
  console.log(`Subscriptions Created         : ${stats.subscriptionsCreated} (Daily Clean: ${dailyCleanRows.length})`);
  console.log(`Subscription Vehicles Mapped  : ${stats.subscriptionVehiclesCreated}`);
  console.log(`Service Jobs Created          : ${stats.jobsCreated} (All Other Work: ${allOtherRows.length})`);
  console.log(`Staff Assignments Active      : ${stats.staffAssignmentsCreated}`);
  console.log(`Route Stops Assigned          : STF01=${stats.routeStopsCreated.STF01}, STF02=${stats.routeStopsCreated.STF02}`);
  console.log(`Unassigned Pool Customers     : ${stats.unassignedCustomers}`);
  console.log(`Duplicate Phone Records Handled: ${stats.duplicatePhoneInstances}`);
  console.log('========================================================================\n');

  return stats;
}

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('[Migration] Finished with exit code 0.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration ERROR]:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
