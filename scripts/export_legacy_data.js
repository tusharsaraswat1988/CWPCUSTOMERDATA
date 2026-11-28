/**
 * =========================================================================
 * CWP DATA APP — F1 Pre-Wipe Legacy Database Export Script
 * Exports full raw snapshot + clean normalized BRD v1.0 dataset from
 * cwp_customer_db BEFORE any schema wipe/rebuild.
 * =========================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Auto-load .env if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (_) {}

const { resolveDatabaseConfig } = require('../db/connectionResolver');
const startupSafety = require('../lib/startupSafety');

const DATA_DIR = path.resolve(__dirname, '../data');
const REAL_STAFF_CODES = ['STF01', 'STF02', 'STF03'];

function normalizePhone10(value) {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function formatIstDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(val);
  }
  return formatIstDate(String(val));
}

function parseFromBackupArg(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from-backup' && argv[i + 1]) {
      return argv[i + 1];
    }
    if (arg.startsWith('--from-backup=')) {
      return arg.slice('--from-backup='.length);
    }
  }
  return null;
}

function inferSeaterType(vehicle) {
  const raw = (vehicle.seater_type || '').trim().toLowerCase();
  if (raw === '5_plus_seater' || raw === '7_seater') return '5_plus_seater';
  if (raw === '5_seater') return '5_seater';
  const text = `${vehicle.registration_no || ''} ${vehicle.brand_or_model || ''} ${vehicle.car_make || ''}`;
  if (/(xuv|fortuner|safari|innova|scorpio|ertiga|xl6|hector\s*plus|alcazar|carens|triber|carnival|bolero|thar)/i.test(text)) {
    return '5_plus_seater';
  }
  return '5_seater';
}

function parseCapabilities(rawCaps) {
  let arr = [];
  if (Array.isArray(rawCaps)) {
    arr = rawCaps;
  } else if (typeof rawCaps === 'string') {
    try {
      const parsed = JSON.parse(rawCaps);
      if (Array.isArray(parsed)) arr = parsed;
    } catch (_) {
      arr = [];
    }
  }
  const set = new Set(arr.map(x => String(x).trim().toLowerCase()));
  return {
    can_dcc: set.has('daily_car_cleaning') || set.has('dcc'),
    can_car_wash: set.has('car_washing') || set.has('car_wash'),
    can_solar: set.has('solar_cleaning') || set.has('solar'),
    can_detailing: set.has('interior_detailing') || set.has('exterior_detailing') || set.has('detailing')
  };
}

function mapNonDccCategory(catId) {
  const c = String(catId || '').trim().toLowerCase();
  if (c === 'car_washing' || c === 'car_wash') return 'car_wash';
  if (c === 'solar_cleaning' || c === 'solar') return 'solar';
  if (c === 'interior_detailing' || c === 'exterior_detailing' || c === 'detailing') return 'detailing';
  return 'car_wash';
}

function mapNonDccStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'pending' || s === 'requested' || s === 'booked' || s === 'scheduled') return 'scheduled';
  if (s === 'assigned') return 'assigned';
  if (s === 'enrolled') return 'enrolled';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'completed') return 'completed';
  if (s === 'verified') return 'verified';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function mapPackageNameToBrd(pkgName) {
  const raw = String(pkgName || '').trim().toUpperCase();
  if (raw === 'DCC GOLD') return 'DCC Gold';
  if (raw === 'DCC SILVER') return 'DCC Silver';
  if (raw === 'DCC ONLY' || raw === 'DCC BASIC' || raw === 'DAILY CLEAN') return 'DCC Basic';
  return pkgName ? String(pkgName).trim() : 'DCC Basic';
}

async function safeSelectAll(client, tableName) {
  const exists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  if (exists.rows.length === 0) return [];
  const res = await client.query(`SELECT * FROM public.${tableName}`);
  return res.rows;
}

async function runExport(options = {}) {
  const fromBackupArg = options.fromBackup || parseFromBackupArg();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let client = null;
  let sourceDatabase = null;
  let rawBackupPath = null;
  let rawTables = {};
  let rawCounts = {};

  if (fromBackupArg) {
    const resolvedBackupPath = path.isAbsolute(fromBackupArg)
      ? fromBackupArg
      : path.resolve(process.cwd(), fromBackupArg);
    if (!fs.existsSync(resolvedBackupPath)) {
      throw new Error(`[Export] Backup file not found: ${resolvedBackupPath}`);
    }
    const backupJson = JSON.parse(fs.readFileSync(resolvedBackupPath, 'utf8'));
    if (!backupJson || typeof backupJson !== 'object' || !backupJson.tables) {
      throw new Error(`[Export] Invalid raw backup structure in: ${resolvedBackupPath}`);
    }
    rawTables = backupJson.tables;
    rawCounts = backupJson.tableCounts || Object.fromEntries(
      Object.entries(rawTables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    );
    rawBackupPath = resolvedBackupPath;
    sourceDatabase = backupJson.database || 'backup_file';
    console.log(`[Export] Reading raw legacy snapshot from backup: ${resolvedBackupPath}`);
  } else {
    const dbConfig = resolveDatabaseConfig(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
    if (!dbConfig.isConfigured) {
      throw new Error(`[Export] Configuration Error: ${dbConfig.error}`);
    }

    const dbTarget = startupSafety.classifyDatabaseTarget(dbConfig, process.env);
    console.log(`[Export] Target DB: ${dbTarget.databaseName} (${dbTarget.sanitizedHost}) [${dbTarget.classification}]`);
    if (dbTarget.isProductionDb) {
      throw new Error(`[Export] ABORTED: Refusing pre-wipe export workflow against PRODUCTION DB '${dbTarget.databaseName}'.`);
    }

    client = new Client({
      connectionString: dbConfig.directUrl,
      ssl: { rejectUnauthorized: process.env.ALLOW_INSECURE_DB_SSL === 'true' ? false : true },
      connectionTimeoutMillis: 15000
    });

    await client.connect();
    sourceDatabase = dbTarget.databaseName;

    // -----------------------------------------------------------------------
    // 1. Capture Full Raw Backup of Legacy Tables
    // -----------------------------------------------------------------------
    const rawTableNames = [
      'customers',
      'service_locations',
      'vehicles',
      'staff',
      'staff_auth',
      'staff_assignments',
      'staff_route_sequences',
      'subscriptions',
      'subscription_vehicles',
      'service_jobs',
      'service_logs',
      'admin_users',
      'admin_trusted_devices',
      'homepage_settings',
      'job_applications',
      'audit_logs',
      'staff_locations',
      'staff_tracking_current',
      'staff_stoppages',
      'staff_location_pings'
    ];

    for (const tbl of rawTableNames) {
      const rows = await safeSelectAll(client, tbl);
      rawTables[tbl] = rows;
      rawCounts[tbl] = rows.length;
    }

    rawBackupPath = path.join(DATA_DIR, `legacy_raw_backup_${timestamp}.json`);
    fs.writeFileSync(
      rawBackupPath,
      JSON.stringify(
        {
          exportedAt: now.toISOString(),
          database: dbTarget.databaseName,
          sanitizedHost: dbTarget.sanitizedHost,
          tableCounts: rawCounts,
          tables: rawTables
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`[Export] Raw backup written: ${rawBackupPath}`);
  }

  try {

    // -----------------------------------------------------------------------
    // 2. Build Clean Normalized BRD v1.0 Export
    // -----------------------------------------------------------------------

    // 2A. Real Customers (deleted_at IS NULL AND is_lead = FALSE AND source_row_index > 0)
    const rawRealCustomers = (rawTables.customers || [])
      .filter(c => !c.deleted_at && c.is_lead === false && Number(c.source_row_index) > 0)
      .sort((a, b) => {
        const diff = Number(a.source_row_index) - Number(b.source_row_index);
        if (diff !== 0) return diff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const customerByPhone = new Map();
    const customerIdMap = new Map(); // oldCustomerId -> survivingCustomerId
    const dedupCustomers = [];
    const mergedPhoneGroups = [];

    for (const cust of rawRealCustomers) {
      const phone10 = normalizePhone10(cust.phone);
      if (!phone10) {
        throw new Error(`[Export] Real customer ${cust.id} (${cust.customer_code}) has empty phone`);
      }
      if (!customerByPhone.has(phone10)) {
        const cleanCust = {
          id: cust.id,
          customer_code: cust.customer_code,
          name: (cust.name || '').trim(),
          name_hi: cust.name_hi ? String(cust.name_hi).trim() : null,
          phone: phone10,
          email: cust.email ? String(cust.email).trim() : null,
          is_active: cust.is_active !== false,
          is_lead: false,
          lead_stage: null,
          lead_source: null,
          interested_service: null,
          notes: cust.notes ? String(cust.notes).trim() : null,
          lead_notes: cust.lead_notes ? String(cust.lead_notes).trim() : null,
          created_at: cust.created_at,
          updated_at: cust.updated_at,
          _legacy_panel_count: Number(cust.panel_count) > 0 ? Number(cust.panel_count) : 0,
          _merged_from_ids: [cust.id]
        };
        customerByPhone.set(phone10, cleanCust);
        customerIdMap.set(cust.id, cleanCust.id);
        dedupCustomers.push(cleanCust);
      } else {
        const survivor = customerByPhone.get(phone10);
        customerIdMap.set(cust.id, survivor.id);
        survivor._merged_from_ids.push(cust.id);
        if (!survivor.name_hi && cust.name_hi) survivor.name_hi = String(cust.name_hi).trim();
        if (!survivor.email && cust.email) survivor.email = String(cust.email).trim();
        if (!survivor.notes && cust.notes) survivor.notes = String(cust.notes).trim();
        else if (cust.notes && survivor.notes && !survivor.notes.includes(cust.notes.trim())) {
          survivor.notes = `${survivor.notes}; ${cust.notes.trim()}`;
        }
        if (Number(cust.panel_count) > survivor._legacy_panel_count) {
          survivor._legacy_panel_count = Number(cust.panel_count);
        }
        mergedPhoneGroups.push({
          phone: phone10,
          survivingId: survivor.id,
          survivingCode: survivor.customer_code,
          mergedId: cust.id,
          mergedCode: cust.customer_code
        });
      }
    }

    // 2B. Locations (deduplicate identical per surviving customer, keep distinct, normalize empty address_text)
    const rawRealLocations = (rawTables.service_locations || [])
      .filter(loc => !loc.deleted_at && customerIdMap.has(loc.customer_id))
      .sort((a, b) => {
        if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return b.is_primary ? 1 : -1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    const locationIdMap = new Map(); // oldLocId -> survivingLocId
    const locationDedupMap = new Map(); // dedupKey -> survivingLocObj
    const cleanLocations = [];
    const primaryLocByCustomer = new Map();

    for (const loc of rawRealLocations) {
      const targetCustomerId = customerIdMap.get(loc.customer_id);
      let addrText = (loc.address_text || '').trim();
      if (!addrText) {
        addrText = loc.google_maps_url ? 'Location via Google Maps Link' : 'Primary Address';
      }
      const mapsUrl = loc.google_maps_url ? String(loc.google_maps_url).trim() : null;
      const dedupKey = `${targetCustomerId}::${addrText.toLowerCase()}::${(mapsUrl || '').toLowerCase()}`;

      if (!locationDedupMap.has(dedupKey)) {
        const cleanLoc = {
          id: loc.id,
          customer_id: targetCustomerId,
          label: (loc.location_name || (loc.address_type ? loc.address_type.charAt(0).toUpperCase() + loc.address_type.slice(1) : 'Home')).trim() || 'Home',
          address_text: addrText,
          address_text_hi: loc.address_text_hi ? String(loc.address_text_hi).trim() : null,
          latitude: loc.latitude !== null && loc.latitude !== undefined ? Number(loc.latitude) : null,
          longitude: loc.longitude !== null && loc.longitude !== undefined ? Number(loc.longitude) : null,
          google_maps_url: mapsUrl,
          parking_details: loc.parking_details ? String(loc.parking_details).trim() : null,
          is_primary: Boolean(loc.is_primary),
          is_active: loc.is_active !== false,
          created_at: loc.created_at,
          updated_at: loc.updated_at
        };
        locationDedupMap.set(dedupKey, cleanLoc);
        locationIdMap.set(loc.id, cleanLoc.id);
        cleanLocations.push(cleanLoc);
      } else {
        const survivor = locationDedupMap.get(dedupKey);
        locationIdMap.set(loc.id, survivor.id);
        if (survivor.latitude === null && loc.latitude !== null && loc.latitude !== undefined) {
          survivor.latitude = Number(loc.latitude);
          survivor.longitude = Number(loc.longitude);
        }
        if (!survivor.parking_details && loc.parking_details) {
          survivor.parking_details = String(loc.parking_details).trim();
        }
        if (!survivor.address_text_hi && loc.address_text_hi) {
          survivor.address_text_hi = String(loc.address_text_hi).trim();
        }
      }
    }

    // Guarantee each customer has at least 1 location and exactly 1 is_primary = TRUE
    const locsByCust = new Map();
    for (const loc of cleanLocations) {
      if (!locsByCust.has(loc.customer_id)) locsByCust.set(loc.customer_id, []);
      locsByCust.get(loc.customer_id).push(loc);
    }
    for (const cust of dedupCustomers) {
      let list = locsByCust.get(cust.id) || [];
      if (list.length === 0) {
        const defaultLoc = {
          id: crypto.randomUUID(),
          customer_id: cust.id,
          label: 'Home',
          address_text: 'Address Pending Update',
          address_text_hi: null,
          latitude: null,
          longitude: null,
          google_maps_url: null,
          parking_details: null,
          is_primary: true,
          is_active: true,
          created_at: cust.created_at,
          updated_at: cust.updated_at
        };
        cleanLocations.push(defaultLoc);
        list = [defaultLoc];
        locsByCust.set(cust.id, list);
      }
      let primaryIdx = list.findIndex(l => l.is_primary);
      if (primaryIdx === -1) primaryIdx = 0;
      list.forEach((l, idx) => {
        l.is_primary = idx === primaryIdx;
      });
      primaryLocByCustomer.set(cust.id, list[primaryIdx].id);
    }

    // 2C. Vehicles (remap customer_id & location_id, normalize seater_type)
    const rawRealVehicles = (rawTables.vehicles || [])
      .filter(v => !v.deleted_at && customerIdMap.has(v.customer_id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const vehicleIdMap = new Map();
    const vehicleDedupSet = new Map(); // `${custId}::${regUpper}` -> cleanVehicle
    const cleanVehicles = [];

    for (const v of rawRealVehicles) {
      const targetCustId = customerIdMap.get(v.customer_id);
      const targetLocId = (v.default_location_id && locationIdMap.get(v.default_location_id)) || primaryLocByCustomer.get(targetCustId);
      const regNo = String(v.registration_no || '').trim().toUpperCase();
      if (!regNo) throw new Error(`[Export] Vehicle ${v.id} missing registration_no`);
      const dedupKey = `${targetCustId}::${regNo}`;

      if (!vehicleDedupSet.has(dedupKey)) {
        const cleanVeh = {
          id: v.id,
          customer_id: targetCustId,
          location_id: targetLocId,
          registration_no: regNo,
          seater_type: inferSeaterType(v),
          car_model: (v.brand_or_model || v.car_make || null) ? String(v.brand_or_model || v.car_make).trim() : null,
          car_color: v.car_color ? String(v.car_color).trim() : null,
          is_active: v.is_active !== false,
          created_at: v.created_at,
          updated_at: v.updated_at
        };
        vehicleDedupSet.set(dedupKey, cleanVeh);
        vehicleIdMap.set(v.id, cleanVeh.id);
        cleanVehicles.push(cleanVeh);
      } else {
        vehicleIdMap.set(v.id, vehicleDedupSet.get(dedupKey).id);
      }
    }

    // 2D. Solar Installations (generic fallback if any real customer had panel_count > 0)
    const cleanSolarInstallations = [];
    for (const cust of dedupCustomers) {
      if (cust._legacy_panel_count > 0) {
        cleanSolarInstallations.push({
          id: crypto.randomUUID(),
          customer_id: cust.id,
          location_id: primaryLocByCustomer.get(cust.id),
          panel_count: cust._legacy_panel_count,
          kw_load: null,
          notes: 'Migrated from legacy customer panel_count',
          is_active: true,
          created_at: cust.created_at,
          updated_at: cust.updated_at
        });
      }
      delete cust._legacy_panel_count;
      delete cust._merged_from_ids;
    }

    // 2E. Real Staff + Auth (STF01, STF02, STF03)
    const rawRealStaff = (rawTables.staff || [])
      .filter(s => !s.deleted_at && REAL_STAFF_CODES.includes(String(s.staff_code || '').toUpperCase()))
      .sort((a, b) => String(a.staff_code).localeCompare(String(b.staff_code)));

    const realStaffIds = new Set(rawRealStaff.map(s => s.id));
    const cleanStaff = rawRealStaff.map(s => {
      const caps = parseCapabilities(s.service_capabilities);
      const docs = {};
      if (s.aadhar_number) docs.aadhar_number = s.aadhar_number;
      if (s.aadhar_front_url) docs.aadhar_front_url = s.aadhar_front_url;
      if (s.aadhar_back_url) docs.aadhar_back_url = s.aadhar_back_url;
      if (s.bank_passbook_url) docs.bank_passbook_url = s.bank_passbook_url;
      if (s.pan_number) docs.pan_number = s.pan_number;
      if (s.pan_card_url) docs.pan_card_url = s.pan_card_url;
      if (s.driving_license_number) docs.driving_license_number = s.driving_license_number;
      if (s.driving_license_url) docs.driving_license_url = s.driving_license_url;
      if (s.email) docs.email = s.email;

      return {
        id: s.id,
        staff_code: String(s.staff_code).trim().toUpperCase(),
        name: String(s.name).trim(),
        phone: normalizePhone10(s.phone),
        can_dcc: caps.can_dcc,
        can_car_wash: caps.can_car_wash,
        can_solar: caps.can_solar,
        can_detailing: caps.can_detailing,
        status: s.is_active === false ? 'Inactive' : 'Active',
        photo_url: s.photo_url || null,
        weekly_off: s.weekly_off || null,
        salary_amount: s.salary !== null && s.salary !== undefined ? Number(s.salary) : null,
        joining_date: formatIstDate(s.date_of_joining),
        address: null,
        documents: docs,
        created_at: s.created_at,
        updated_at: s.updated_at
      };
    });

    const cleanStaffAuth = (rawTables.staff_auth || [])
      .filter(sa => realStaffIds.has(sa.staff_id))
      .map(sa => {
        const rawPin = sa.display_pin ? String(sa.display_pin).trim() : '';
        const pinLen = rawPin.length >= 4 && rawPin.length <= 6 ? rawPin.length : 6;
        return {
          staff_id: sa.staff_id,
          pin_hash: sa.pin_hash,
          salt: sa.salt || null,
          pin_length: pinLen,
          display_pin: rawPin || null,
          failed_attempts: sa.failed_attempts || 0,
          locked_until: sa.locked_until || null,
          last_login_at: sa.last_login_at || null,
          updated_at: sa.updated_at
        };
      });

    // 2F. Active DCC Subscriptions -> Canonical Routes, Route Stops, and DCC Bookings
    const subsById = new Map((rawTables.subscriptions || []).map(sub => [sub.id, sub]));
    const activeAssignBySubId = new Map();
    for (const sa of rawTables.staff_assignments || []) {
      if (sa.is_active && sa.subscription_id && realStaffIds.has(sa.staff_id)) {
        activeAssignBySubId.set(sa.subscription_id, sa);
      }
    }
    const seqBySubVehKey = new Map();
    const seqBySubOnlyKey = new Map();
    for (const srs of rawTables.staff_route_sequences || []) {
      if (srs.subscription_id && srs.subscription_vehicle_id) {
        seqBySubVehKey.set(`${srs.subscription_id}::${srs.subscription_vehicle_id}`, Number(srs.sequence_order));
      } else if (srs.subscription_id) {
        seqBySubOnlyKey.set(srs.subscription_id, Number(srs.sequence_order));
      }
    }

    const vehicleById = new Map(cleanVehicles.map(v => [v.id, v]));
    const staffById = new Map(cleanStaff.map(s => [s.id, s]));

    const rawActiveDccItems = [];
    const seenRouteVehicleIds = new Set();

    for (const sv of rawTables.subscription_vehicles || []) {
      const sub = subsById.get(sv.subscription_id);
      if (!sub || sub.deleted_at || sub.status !== 'active') continue;
      const mappedVehId = vehicleIdMap.get(sv.vehicle_id);
      if (!mappedVehId) continue; // QA vehicle
      const assign = activeAssignBySubId.get(sub.id);
      if (!assign) continue;

      if (seenRouteVehicleIds.has(mappedVehId)) {
        throw new Error(`[Export] Duplicate active DCC vehicle ${mappedVehId} detected across subscriptions!`);
      }
      seenRouteVehicleIds.add(mappedVehId);

      const veh = vehicleById.get(mappedVehId);
      const seqOrder = seqBySubVehKey.get(`${sub.id}::${sv.id}`) ?? seqBySubOnlyKey.get(sub.id) ?? null;

      rawActiveDccItems.push({
        legacy_subscription_id: sub.id,
        booking_id: sub.id, // preserve UUID so dcc_daily_jobs references remain clean
        customer_id: veh.customer_id,
        vehicle_id: veh.id,
        location_id: (sv.location_id && locationIdMap.get(sv.location_id)) || veh.location_id,
        staff_id: assign.staff_id,
        package_name: mapPackageNameToBrd(sub.package_name),
        frequency: sub.rotation_type === 'aaj_kal' ? 'alternate' : 'daily',
        start_date: formatIstDate(sub.start_date),
        end_date: formatIstDate(sub.end_date),
        notes: sub.rotation_notes || null,
        raw_sequence: seqOrder,
        created_at: sub.created_at,
        updated_at: sub.updated_at
      });
    }

    // Group stops per staff into canonical routes (one route per DCC staff)
    const routesMap = new Map();
    for (const stf of cleanStaff) {
      const items = rawActiveDccItems.filter(it => it.staff_id === stf.id);
      if (items.length === 0) continue;

      items.sort((a, b) => {
        const sa = a.raw_sequence === null ? 999999 : a.raw_sequence;
        const sb = b.raw_sequence === null ? 999999 : b.raw_sequence;
        if (sa !== sb) return sa - sb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const routeId = crypto.randomUUID();
      routesMap.set(stf.id, {
        id: routeId,
        name: `${stf.name} (${stf.staff_code}) Route`,
        area: 'Varanasi',
        staff_id: stf.id,
        is_active: true
      });

      items.forEach((it, idx) => {
        it.route_id = routeId;
        it.route_stop_id = crypto.randomUUID();
        it.sequence_order = idx + 1;
      });
    }

    const cleanRoutes = Array.from(routesMap.values());
    const cleanRouteStops = rawActiveDccItems.map(it => ({
      id: it.route_stop_id,
      route_id: it.route_id,
      vehicle_id: it.vehicle_id,
      booking_id: it.booking_id,
      sequence_order: it.sequence_order,
      is_active: true
    }));

    const cleanBookings = rawActiveDccItems.map(it => ({
      id: it.booking_id,
      customer_id: it.customer_id,
      package_name: it.package_name,
      asset_type: 'vehicle',
      vehicle_id: it.vehicle_id,
      solar_id: null,
      location_id: it.location_id,
      assigned_dcc_staff_id: it.staff_id,
      frequency: it.frequency,
      start_date: it.start_date,
      end_date: it.end_date,
      payment_status: 'paid',
      status: 'active',
      notes: it.notes,
      created_at: it.created_at,
      updated_at: it.updated_at
    }));

    // 2G. Non-DCC service_jobs (real customers only)
    const activeJobAssignByJobId = new Map();
    for (const sa of rawTables.staff_assignments || []) {
      if (sa.is_active && sa.job_id && realStaffIds.has(sa.staff_id)) {
        activeJobAssignByJobId.set(sa.job_id, sa.staff_id);
      }
    }

    const cleanServiceJobs = (rawTables.service_jobs || [])
      .filter(j => !j.deleted_at && customerIdMap.has(j.customer_id))
      .map(j => {
        const custId = customerIdMap.get(j.customer_id);
        const vehId = j.vehicle_id ? (vehicleIdMap.get(j.vehicle_id) || null) : null;
        const locId = (j.location_id && locationIdMap.get(j.location_id)) || (vehId && vehicleById.get(vehId)?.location_id) || primaryLocByCustomer.get(custId);
        const cat = mapNonDccCategory(j.service_category_id);
        return {
          id: j.id,
          booking_id: null,
          customer_id: custId,
          service_category: cat,
          service_name: j.service_type || (cat === 'car_wash' ? 'Car Wash' : cat === 'solar' ? 'Solar Panel Cleaning' : 'Interior Detailing'),
          asset_type: cat === 'solar' ? 'solar' : 'vehicle',
          vehicle_id: vehId,
          solar_id: null,
          location_id: locId,
          assigned_staff_id: activeJobAssignByJobId.get(j.id) || null,
          status: mapNonDccStatus(j.status),
          scheduled_date: formatIstDate(j.scheduled_date),
          enrolled_at: null,
          started_at: j.started_at || null,
          before_photos: Array.isArray(j.before_photos) ? j.before_photos : [],
          after_photos: Array.isArray(j.after_photos) ? j.after_photos : [],
          checklist_results: null,
          completed_at: j.completed_at || null,
          verified_at: null,
          verified_by: null,
          auto_verify_at: null,
          notes: j.completion_notes || j.special_instructions || null,
          created_at: j.created_at,
          updated_at: j.updated_at
        };
      });

    // 2H. Historical DCC service_logs -> dcc_daily_jobs
    const stopByVehicleId = new Map(rawActiveDccItems.map(it => [it.vehicle_id, it]));
    const cleanDccDailyJobs = [];
    const seenJobDateVehicle = new Set();

    for (const log of rawTables.service_logs || []) {
      if (!log.subscription_id || !log.vehicle_id || log.job_id) continue;
      const mappedVehId = vehicleIdMap.get(log.vehicle_id);
      if (!mappedVehId) continue;
      if (!realStaffIds.has(log.staff_id)) continue;

      const veh = vehicleById.get(mappedVehId);
      const stop = stopByVehicleId.get(mappedVehId);
      const dateStr = formatIstDate(log.service_date) || formatIstDate(log.completed_at_device || log.created_at);
      const uniqKey = `${dateStr}::${mappedVehId}`;
      if (seenJobDateVehicle.has(uniqKey)) continue;
      seenJobDateVehicle.add(uniqKey);

      const isCna = Boolean(log.car_not_present) || log.status === 'car_not_present' || log.tag === 'car_not_present';
      cleanDccDailyJobs.push({
        id: log.id,
        job_date: dateStr,
        booking_id: stop ? stop.booking_id : null,
        route_id: stop ? stop.route_id : null,
        route_stop_id: stop ? stop.route_stop_id : null,
        vehicle_id: mappedVehId,
        customer_id: veh.customer_id,
        location_id: veh.location_id,
        assigned_staff_id: stop ? stop.staff_id : log.staff_id,
        actual_staff_id: log.staff_id,
        frequency: stop ? stop.frequency : 'daily',
        status: isCna ? 'car_not_available' : 'completed',
        photo_url: log.photo_url || null,
        gps_lat: log.punch_latitude !== null && log.punch_latitude !== undefined ? Number(log.punch_latitude) : null,
        gps_lng: log.punch_longitude !== null && log.punch_longitude !== undefined ? Number(log.punch_longitude) : null,
        gps_accuracy: log.punch_accuracy_meters !== null && log.punch_accuracy_meters !== undefined ? Number(log.punch_accuracy_meters) : null,
        gps_distance_meters: log.punch_distance_meters !== null && log.punch_distance_meters !== undefined ? Number(log.punch_distance_meters) : null,
        gps_verified: log.punch_verified !== null && log.punch_verified !== undefined ? Boolean(log.punch_verified) : null,
        client_mutation_id: log.client_mutation_id || null,
        notes: log.notes || null,
        admin_notes: log.admin_notes || null,
        completed_at: log.completed_at_device || log.created_at,
        created_at: log.created_at,
        updated_at: log.admin_updated_at || log.created_at
      });
    }

    // 2I. Auth, Security, Careers, Tracking, Homepage Settings
    const cleanAdminUsers = rawTables.admin_users || [];
    const cleanTrustedDevices = (rawTables.admin_trusted_devices || []).filter(
      d => !d.revoked_at && new Date(d.trust_expires_at).getTime() > now.getTime()
    );
    let cleanJobApplications = rawTables.job_applications || [];
    if (cleanJobApplications.length === 0) {
      const fallbackJobsPath = path.join(DATA_DIR, 'job_applications.json');
      if (fs.existsSync(fallbackJobsPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(fallbackJobsPath, 'utf8'));
          if (Array.isArray(parsed)) cleanJobApplications = parsed;
        } catch (_) {}
      }
    }

    const cleanStaffTrackingCurrent = (rawTables.staff_tracking_current || [])
      .filter(r => realStaffIds.has(r.staff_id))
      .map(r => ({
        ...r,
        tracking_date: formatIstDate(r.tracking_date)
      }));
    const cleanStaffLocations = (rawTables.staff_locations || []).filter(r => realStaffIds.has(r.staff_id));
    const cleanStaffStoppages = (rawTables.staff_stoppages || [])
      .filter(r => realStaffIds.has(r.staff_id))
      .map(r => ({
        ...r,
        stoppage_date: formatIstDate(r.stoppage_date),
        matched_customer_id: r.matched_customer_id ? (customerIdMap.get(r.matched_customer_id) || null) : null
      }));

    let homepageSettings = (rawTables.homepage_settings || []).find(h => h.id === 'primary_config') || null;
    if (!homepageSettings) {
      const hpPath = path.join(DATA_DIR, 'homepage_config.json');
      if (fs.existsSync(hpPath)) {
        const hpJson = JSON.parse(fs.readFileSync(hpPath, 'utf8'));
        homepageSettings = {
          id: 'primary_config',
          rates_json: hpJson.rates || {},
          offers_json: hpJson.offers || [],
          coupons_json: hpJson.coupons || [],
          contact_phone: hpJson.contact?.phone || '7054007733',
          contact_email: hpJson.contact?.email || 'cwpdetailers@gmail.com',
          office_address: hpJson.contact?.address || '',
          google_maps_url: hpJson.contact?.googleMapsUrl || '',
          gst_percent: Number(hpJson.gst?.percent || 18)
        };
      }
    }

    const exportedEntityIds = new Set([
      ...dedupCustomers.map(x => String(x.id)),
      ...cleanLocations.map(x => String(x.id)),
      ...cleanVehicles.map(x => String(x.id)),
      ...cleanStaff.map(x => String(x.id)),
      ...cleanServiceJobs.map(x => String(x.id)),
      ...cleanAdminUsers.map(x => String(x.id))
    ]);

    const cleanAuditLogs = (rawTables.audit_logs || []).filter(
      a => exportedEntityIds.has(String(a.entity_id)) || ['admin_user', 'homepage_settings', 'staff_auth'].includes(a.entity_type)
    );

    const brdExport = {
      exportedAt: now.toISOString(),
      sourceDatabase,
      rawBackupFile: path.basename(rawBackupPath),
      summary: {
        rawRealCustomersBeforeDedup: rawRealCustomers.length,
        customers: dedupCustomers.length,
        mergedDuplicatePhoneCount: mergedPhoneGroups.length,
        mergedPhoneGroups,
        service_locations: cleanLocations.length,
        vehicles: cleanVehicles.length,
        vehicles_5_plus_seater: cleanVehicles.filter(v => v.seater_type === '5_plus_seater').length,
        solar_installations: cleanSolarInstallations.length,
        staff: cleanStaff.length,
        staff_auth: cleanStaffAuth.length,
        routes: cleanRoutes.length,
        route_stops: cleanRouteStops.length,
        bookings: cleanBookings.length,
        service_jobs: cleanServiceJobs.length,
        dcc_daily_jobs: cleanDccDailyJobs.length,
        admin_users: cleanAdminUsers.length,
        admin_trusted_devices: cleanTrustedDevices.length,
        job_applications: cleanJobApplications.length,
        staff_tracking_current: cleanStaffTrackingCurrent.length,
        staff_locations: cleanStaffLocations.length,
        staff_stoppages: cleanStaffStoppages.length,
        audit_logs: cleanAuditLogs.length
      },
      data: {
        customers: dedupCustomers,
        service_locations: cleanLocations,
        vehicles: cleanVehicles,
        solar_installations: cleanSolarInstallations,
        staff: cleanStaff,
        staff_auth: cleanStaffAuth,
        routes: cleanRoutes,
        route_stops: cleanRouteStops,
        bookings: cleanBookings,
        service_jobs: cleanServiceJobs,
        dcc_daily_jobs: cleanDccDailyJobs,
        admin_users: cleanAdminUsers,
        admin_trusted_devices: cleanTrustedDevices,
        job_applications: cleanJobApplications,
        homepage_settings: homepageSettings,
        staff_tracking_current: cleanStaffTrackingCurrent,
        staff_locations: cleanStaffLocations,
        staff_stoppages: cleanStaffStoppages,
        audit_logs: cleanAuditLogs
      }
    };

    const brdTimestampPath = path.join(DATA_DIR, `brd_export_${timestamp}.json`);
    const brdLatestPath = path.join(DATA_DIR, 'brd_export_latest.json');
    const brdJsonStr = JSON.stringify(brdExport, null, 2);
    fs.writeFileSync(brdTimestampPath, brdJsonStr, 'utf8');
    fs.writeFileSync(brdLatestPath, brdJsonStr, 'utf8');

    console.log(`[Export] Clean BRD export written: ${brdTimestampPath}`);
    console.log(`[Export] Latest BRD export written: ${brdLatestPath}`);
    console.log('[Export] Summary:', JSON.stringify(brdExport.summary, null, 2));

    return {
      rawBackupPath,
      brdTimestampPath,
      brdLatestPath,
      summary: brdExport.summary
    };
  } finally {
    if (client) {
      await client.end();
    }
  }
}

module.exports = { runExport };

if (require.main === module) {
  runExport()
    .then(() => {
      console.log('[Export] Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Export] FAILED:', err);
      process.exit(1);
    });
}
