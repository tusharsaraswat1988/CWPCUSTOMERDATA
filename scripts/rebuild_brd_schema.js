/**
 * =========================================================================
 * CWP DATA APP — F2 Clean-Slate BRD v1.0 Schema Rebuild & Re-Import Script
 *
 * 1. Verifies target DB is NOT production via lib/startupSafety.js
 * 2. Ensures pre-wipe export JSON exists (runs export_legacy_data.js if needed)
 * 3. Drops all legacy/Hybrid/SEE tables, triggers & custom functions in public
 * 4. Runs migrations/migrate.js (001_brd_schema.sql)
 * 5. Seeds canonical BRD v1.0 services, packages, solar tiers, addons & settings
 * 6. Re-imports exported real operational data inside a single transaction
 * 7. Syncs sequences and prints final table row counts
 * =========================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
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
const { runMigration, syncSequences } = require('../migrations/migrate');
const { runExport } = require('./export_legacy_data');

const DATA_DIR = path.resolve(__dirname, '../data');
const BRD_EXPORT_LATEST = path.join(DATA_DIR, 'brd_export_latest.json');

function normalizeIstDate(val) {
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
  return normalizeIstDate(String(val));
}

async function dropLegacyPublicObjects(client) {
  console.log('[Rebuild] Inspecting existing public schema objects...');

  const tablesRes = await client.query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  for (const row of tablesRes.rows) {
    if (row.table_type === 'VIEW') {
      await client.query(`DROP VIEW IF EXISTS public."${row.table_name}" CASCADE;`);
    } else {
      await client.query(`DROP TABLE IF EXISTS public."${row.table_name}" CASCADE;`);
    }
  }
  console.log(`[Rebuild] Dropped ${tablesRes.rows.length} legacy tables/views in public schema.`);

  // Drop custom user-defined functions in public (excluding extension-owned functions like pgcrypto)
  const funcsRes = await client.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL
  `);

  for (const fn of funcsRes.rows) {
    await client.query(`DROP FUNCTION IF EXISTS public."${fn.proname}"(${fn.args}) CASCADE;`);
  }
  console.log(`[Rebuild] Dropped ${funcsRes.rows.length} custom functions in public schema.`);

  await client.query(`CREATE SCHEMA IF NOT EXISTS meta;`);
  const migTable = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'meta' AND table_name = 'schema_migrations'
  `);
  if (migTable.rows.length > 0) {
    await client.query(`TRUNCATE TABLE meta.schema_migrations;`);
    console.log('[Rebuild] Cleared meta.schema_migrations.');
  }
}

async function seedMasterCatalogAndSettings(client, brdExportData) {
  // 1. Canonical Services (4 BRD categories; Detailing has named sub-services under category='detailing')
  const serviceSeed = [
    { category: 'dcc', name: 'Daily Car Cleaning', description: 'Daily or alternate-day doorstep exterior & glass car cleaning', p5: 1100, p5p: 1200, sort: 1 },
    { category: 'car_wash', name: 'Car Wash', description: 'Full foam exterior wash, wheel arches & interior vacuuming', p5: 600, p5p: 700, sort: 2 },
    { category: 'solar', name: 'Solar Panel Cleaning', description: 'Soft-water rooftop solar panel cleaning & efficiency maintenance', p5: null, p5p: null, sort: 3 },
    { category: 'detailing', name: 'Interior Detailing', description: 'Deep interior upholstery, dashboard & cabin sanitization detailing', p5: 1499, p5p: 1799, sort: 4 },
    { category: 'detailing', name: 'Exterior Detailing', description: 'Multi-stage exterior rubbing, polishing & paint gloss restoration', p5: 1499, p5p: 1799, sort: 5 },
    { category: 'detailing', name: 'Ceramic Coating', description: 'Long-lasting hydrophobic ceramic paint protection', p5: 11999, p5p: 13999, sort: 6 }
  ];

  const serviceByName = new Map();
  for (const s of serviceSeed) {
    const res = await client.query(
      `INSERT INTO public.services (category, name, description, price_5_seater, price_5_plus_seater, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       RETURNING *`,
      [s.category, s.name, s.description, s.p5, s.p5p, s.sort]
    );
    serviceByName.set(s.name, res.rows[0]);
  }

  // 2. Canonical Packages + Package Items
  const pkgSeed = [
    {
      name: 'DCC Basic',
      description: 'Daily Car Cleaning subscription (1 month, daily schedule)',
      validity_days: 30,
      p5: 1100,
      p5p: 1200,
      items: [{ serviceName: 'Daily Car Cleaning', quantity: 1, frequency: 'daily', duration_months: 1 }]
    },
    {
      name: 'DCC Alternate',
      description: 'Daily Car Cleaning subscription (1 month, alternate-day schedule)',
      validity_days: 30,
      p5: 750,
      p5p: 850,
      items: [{ serviceName: 'Daily Car Cleaning', quantity: 1, frequency: 'alternate', duration_months: 1 }]
    },
    {
      name: 'DCC Silver',
      description: 'Daily Car Cleaning + 1 Car Wash per month',
      validity_days: 30,
      p5: 1500,
      p5p: 1600,
      items: [
        { serviceName: 'Daily Car Cleaning', quantity: 1, frequency: 'daily', duration_months: 1 },
        { serviceName: 'Car Wash', quantity: 1, frequency: 'one_time', duration_months: 1 }
      ]
    },
    {
      name: 'DCC Gold',
      description: 'Daily Car Cleaning + 2 Car Washes per month',
      validity_days: 30,
      p5: 2000,
      p5p: 2200,
      items: [
        { serviceName: 'Daily Car Cleaning', quantity: 1, frequency: 'daily', duration_months: 1 },
        { serviceName: 'Car Wash', quantity: 2, frequency: 'one_time', duration_months: 1 }
      ]
    },
    {
      name: 'Car Wash Single',
      description: 'One-time full foam Car Wash',
      validity_days: 30,
      p5: 600,
      p5p: 700,
      items: [{ serviceName: 'Car Wash', quantity: 1, frequency: 'one_time', duration_months: null }]
    },
    {
      name: 'Car Wash Pack-4',
      description: '4 Car Washes valid for 6 months',
      validity_days: 180,
      p5: 1800,
      p5p: 2100,
      items: [{ serviceName: 'Car Wash', quantity: 4, frequency: 'one_time', duration_months: 6 }]
    },
    {
      name: 'Solar Monthly AMC',
      description: '12-month monthly solar panel cleaning AMC',
      validity_days: 365,
      p5: null,
      p5p: null,
      items: [{ serviceName: 'Solar Panel Cleaning', quantity: 12, frequency: 'monthly', duration_months: 12 }]
    },
    {
      name: 'Solar Weekly AMC',
      description: '6-month weekly solar panel cleaning AMC',
      validity_days: 180,
      p5: null,
      p5p: null,
      items: [{ serviceName: 'Solar Panel Cleaning', quantity: 26, frequency: 'weekly', duration_months: 6 }]
    },
    {
      name: 'Detailing Basic',
      description: '1x Interior Detailing session',
      validity_days: 30,
      p5: 1499,
      p5p: 1799,
      items: [{ serviceName: 'Interior Detailing', quantity: 1, frequency: 'one_time', duration_months: null }]
    }
  ];

  const packageByName = new Map();
  for (const p of pkgSeed) {
    const pRes = await client.query(
      `INSERT INTO public.packages (name, description, validity_days, price_5_seater, price_5_plus_seater, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [p.name, p.description, p.validity_days, p.p5, p.p5p]
    );
    const pkgRow = pRes.rows[0];
    packageByName.set(p.name, pkgRow);

    for (const item of p.items) {
      const svc = serviceByName.get(item.serviceName);
      if (!svc) throw new Error(`Missing seeded service '${item.serviceName}'`);
      await client.query(
        `INSERT INTO public.package_items (package_id, service_id, quantity, frequency, duration_months)
         VALUES ($1, $2, $3, $4, $5)`,
        [pkgRow.id, svc.id, item.quantity, item.frequency, item.duration_months]
      );
    }
  }

  // 3. Solar Pricing Tiers
  const tierSeed = [
    { tier_name: 'Small (1-30 Panels)', min: 1, max: 30, rate: 60, minOne: 800, minAmc: 650 },
    { tier_name: 'Medium (31-100 Panels)', min: 31, max: 100, rate: 50, minOne: 800, minAmc: 650 },
    { tier_name: 'Large (101+ Panels)', min: 101, max: null, rate: 45, minOne: 800, minAmc: 650 }
  ];
  for (const t of tierSeed) {
    await client.query(
      `INSERT INTO public.solar_pricing_tiers (tier_name, min_panels, max_panels, per_panel_rate, min_billing_onetime, min_billing_amc, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [t.tier_name, t.min, t.max, t.rate, t.minOne, t.minAmc]
    );
  }

  // 4. Global Add-Ons
  const addonSeed = [
    { name: 'Interior Vacuum', price: 150, qty: 1 },
    { name: 'Tyre Polish', price: 100, qty: 1 },
    { name: 'Windshield Washer Fluid Top-up', price: 80, qty: 1 },
    { name: 'Tyre Pressure Check', price: 0, qty: 1 },
    { name: 'Exterior Trim Polishing', price: 250, qty: 1 },
    { name: 'Inverter Cleaning', price: 200, qty: 1 },
    { name: 'Roof Cleaning', price: 300, qty: 1 }
  ];
  for (const a of addonSeed) {
    await client.query(
      `INSERT INTO public.addons (name, price, default_quantity, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [a.name, a.price, a.qty]
    );
  }

  // 5. Homepage Settings & App Settings
  let hp = brdExportData.homepage_settings;
  if (!hp) {
    const hpFile = path.join(DATA_DIR, 'homepage_config.json');
    if (fs.existsSync(hpFile)) {
      const cfg = JSON.parse(fs.readFileSync(hpFile, 'utf8'));
      hp = {
        id: 'primary_config',
        rates_json: cfg.rates || {},
        offers_json: cfg.offers || [],
        coupons_json: cfg.coupons || [],
        contact_phone: cfg.contact?.phone || '7054007733',
        contact_email: cfg.contact?.email || 'cwpdetailers@gmail.com',
        office_address: cfg.contact?.address || '',
        google_maps_url: cfg.contact?.googleMapsUrl || '',
        gst_percent: Number(cfg.gst?.percent || 18)
      };
    }
  }
  if (hp) {
    await client.query(
      `INSERT INTO public.homepage_settings (
         id, rates_json, offers_json, coupons_json,
         contact_phone, contact_email, office_address, google_maps_url, gst_percent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         rates_json = EXCLUDED.rates_json,
         offers_json = EXCLUDED.offers_json,
         coupons_json = EXCLUDED.coupons_json,
         contact_phone = EXCLUDED.contact_phone,
         contact_email = EXCLUDED.contact_email,
         office_address = EXCLUDED.office_address,
         google_maps_url = EXCLUDED.google_maps_url,
         gst_percent = EXCLUDED.gst_percent,
         updated_at = CURRENT_TIMESTAMP`,
      [
        hp.id || 'primary_config',
        JSON.stringify(hp.rates_json || {}),
        JSON.stringify(hp.offers_json || []),
        JSON.stringify(hp.coupons_json || []),
        hp.contact_phone || '7054007733',
        hp.contact_email || 'cwpdetailers@gmail.com',
        hp.office_address || '',
        hp.google_maps_url || '',
        Number(hp.gst_percent || 18)
      ]
    );
  }

  await client.query(
    `INSERT INTO public.app_settings (key, value, updated_by)
     VALUES ('auto_verify_hours', $1::jsonb, 'system_seed')
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ hours: 24 })]
  );

  return { serviceByName, packageByName };
}

async function reimportExportedData(client, data, { serviceByName, packageByName }) {
  // 1. Admin Users
  for (const adm of data.admin_users || []) {
    await client.query(
      `INSERT INTO public.admin_users (id, username, phone, password_hash, role, is_active, last_login_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adm.id,
        adm.username,
        adm.phone || null,
        adm.password_hash,
        adm.role || 'superadmin',
        adm.is_active !== false,
        adm.last_login_at || null,
        adm.created_at || new Date(),
        adm.updated_at || new Date()
      ]
    );
  }

  // 2. Admin Trusted Devices
  for (const td of data.admin_trusted_devices || []) {
    await client.query(
      `INSERT INTO public.admin_trusted_devices (
         id, admin_id, token_hash, device_label, browser, os,
         first_registered_at, last_used_at, trust_expires_at, revoked_at, revoked_by, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10)`,
      [
        td.id,
        td.admin_id || null,
        td.token_hash,
        td.device_label || 'Trusted Device',
        td.browser || 'Unknown',
        td.os || 'Unknown',
        td.first_registered_at || new Date(),
        td.last_used_at || new Date(),
        td.trust_expires_at,
        td.ip_address || null
      ]
    );
  }

  // 3. Staff & Staff Auth
  for (const s of data.staff || []) {
    await client.query(
      `INSERT INTO public.staff (
         id, staff_code, name, phone, can_dcc, can_car_wash, can_solar, can_detailing,
         status, photo_url, weekly_off, salary_amount, joining_date, address, documents,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17)`,
      [
        s.id,
        s.staff_code,
        s.name,
        s.phone,
        Boolean(s.can_dcc),
        Boolean(s.can_car_wash),
        Boolean(s.can_solar),
        Boolean(s.can_detailing),
        s.status || 'Active',
        s.photo_url || null,
        s.weekly_off || null,
        s.salary_amount !== undefined ? s.salary_amount : null,
        normalizeIstDate(s.joining_date),
        s.address || null,
        JSON.stringify(s.documents || {}),
        s.created_at || new Date(),
        s.updated_at || new Date()
      ]
    );
  }

  for (const sa of data.staff_auth || []) {
    await client.query(
      `INSERT INTO public.staff_auth (
         staff_id, pin_hash, pin_length, salt, display_pin, failed_attempts, locked_until, last_login_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sa.staff_id,
        sa.pin_hash,
        sa.pin_length || 6,
        sa.salt || null,
        sa.display_pin || null,
        sa.failed_attempts || 0,
        sa.locked_until || null,
        sa.last_login_at || null,
        sa.updated_at || new Date()
      ]
    );
  }

  // 4. Customers
  for (const c of data.customers || []) {
    let leadNotesJson = null;
    if (c.lead_notes) {
      leadNotesJson = typeof c.lead_notes === 'string'
        ? JSON.stringify([{ text: c.lead_notes, created_at: c.updated_at || new Date().toISOString() }])
        : JSON.stringify(c.lead_notes);
    }
    await client.query(
      `INSERT INTO public.customers (
         id, customer_code, name, name_hi, phone, email, is_active, is_lead,
         lead_stage, lead_source, interested_service, notes, lead_notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)`,
      [
        c.id,
        c.customer_code,
        c.name,
        c.name_hi || null,
        c.phone,
        c.email || null,
        c.is_active !== false,
        Boolean(c.is_lead),
        c.lead_stage || null,
        c.lead_source || null,
        c.interested_service || null,
        c.notes || null,
        leadNotesJson,
        c.created_at || new Date(),
        c.updated_at || new Date()
      ]
    );
  }

  // 5. Service Locations
  for (const loc of data.service_locations || []) {
    await client.query(
      `INSERT INTO public.service_locations (
         id, customer_id, label, address_text, address_text_hi, latitude, longitude,
         google_maps_url, parking_details, is_primary, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        loc.id,
        loc.customer_id,
        loc.label || 'Home',
        loc.address_text,
        loc.address_text_hi || null,
        loc.latitude !== undefined ? loc.latitude : null,
        loc.longitude !== undefined ? loc.longitude : null,
        loc.google_maps_url || null,
        loc.parking_details || null,
        Boolean(loc.is_primary),
        loc.is_active !== false,
        loc.created_at || new Date(),
        loc.updated_at || new Date()
      ]
    );
  }

  // 6. Vehicles
  const vehicleMap = new Map();
  for (const v of data.vehicles || []) {
    vehicleMap.set(v.id, v);
    await client.query(
      `INSERT INTO public.vehicles (
         id, customer_id, location_id, registration_no, seater_type, car_model, car_color,
         is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        v.id,
        v.customer_id,
        v.location_id,
        v.registration_no,
        v.seater_type,
        v.car_model || null,
        v.car_color || null,
        v.is_active !== false,
        v.created_at || new Date(),
        v.updated_at || new Date()
      ]
    );
  }

  // 7. Solar Installations (if any)
  for (const si of data.solar_installations || []) {
    await client.query(
      `INSERT INTO public.solar_installations (
         id, customer_id, location_id, panel_count, kw_load, notes, is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        si.id,
        si.customer_id,
        si.location_id,
        si.panel_count,
        si.kw_load || null,
        si.notes || null,
        si.is_active !== false,
        si.created_at || new Date(),
        si.updated_at || new Date()
      ]
    );
  }

  // 8. Bookings (DCC active subscriptions)
  const dccSvc = serviceByName.get('Daily Car Cleaning');
  for (const b of data.bookings || []) {
    const pkg = packageByName.get(b.package_name) || packageByName.get('DCC Basic');
    const veh = vehicleMap.get(b.vehicle_id);
    const isPlus = veh && veh.seater_type === '5_plus_seater';
    const amount = pkg ? Number(isPlus ? pkg.price_5_plus_seater : pkg.price_5_seater) : 1100;
    const freqCount = b.frequency === 'alternate' ? 15 : 30;
    await client.query(
      `INSERT INTO public.bookings (
         id, customer_id, package_id, service_id, asset_type, vehicle_id, solar_id, location_id,
         assigned_dcc_staff_id, frequency, start_date, end_date, total_amount, payment_status,
         total_count, remaining_count, status, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'vehicle', $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        b.id,
        b.customer_id,
        pkg ? pkg.id : null,
        dccSvc ? dccSvc.id : null,
        b.vehicle_id,
        b.location_id,
        b.assigned_dcc_staff_id,
        b.frequency || 'daily',
        normalizeIstDate(b.start_date) || normalizeIstDate(new Date()),
        normalizeIstDate(b.end_date),
        amount,
        b.payment_status || 'paid',
        freqCount,
        freqCount,
        b.status || 'active',
        b.notes || null,
        b.created_at || new Date(),
        b.updated_at || new Date()
      ]
    );
  }

  // 9. Canonical Routes & Route Stops
  for (const r of data.routes || []) {
    await client.query(
      `INSERT INTO public.routes (id, name, area, staff_id, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.id, r.name, r.area || 'Varanasi', r.staff_id, r.is_active !== false]
    );
  }

  for (const rs of data.route_stops || []) {
    await client.query(
      `INSERT INTO public.route_stops (id, route_id, vehicle_id, booking_id, sequence_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [rs.id, rs.route_id, rs.vehicle_id, rs.booking_id || null, rs.sequence_order, rs.is_active !== false]
    );
  }

  // 10. Non-DCC Service Jobs
  const svcByCatDefault = {
    car_wash: serviceByName.get('Car Wash'),
    solar: serviceByName.get('Solar Panel Cleaning'),
    detailing: serviceByName.get('Interior Detailing')
  };
  for (const j of data.service_jobs || []) {
    const svc = serviceByName.get(j.service_name) || svcByCatDefault[j.service_category] || null;
    await client.query(
      `INSERT INTO public.service_jobs (
         id, booking_id, customer_id, service_category, service_id, asset_type, vehicle_id, solar_id,
         location_id, assigned_staff_id, status, scheduled_date, enrolled_at, started_at,
         before_photos, after_photos, checklist_results, completed_at, verified_at, verified_by,
         auto_verify_at, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        j.id,
        j.booking_id || null,
        j.customer_id,
        j.service_category,
        svc ? svc.id : null,
        j.asset_type || 'vehicle',
        j.vehicle_id || null,
        j.solar_id || null,
        j.location_id,
        j.assigned_staff_id || null,
        j.status,
        normalizeIstDate(j.scheduled_date),
        j.enrolled_at || null,
        j.started_at || null,
        JSON.stringify(j.before_photos || []),
        JSON.stringify(j.after_photos || []),
        j.checklist_results ? JSON.stringify(j.checklist_results) : null,
        j.completed_at || null,
        j.verified_at || null,
        j.verified_by || null,
        j.auto_verify_at || null,
        j.notes || null,
        j.created_at || new Date(),
        j.updated_at || new Date()
      ]
    );
  }

  // 11. DCC Daily Jobs (historical logs)
  for (const dj of data.dcc_daily_jobs || []) {
    await client.query(
      `INSERT INTO public.dcc_daily_jobs (
         id, job_date, booking_id, route_id, route_stop_id, vehicle_id, customer_id, location_id,
         assigned_staff_id, actual_staff_id, frequency, status, photo_url, gps_lat, gps_lng,
         gps_accuracy, gps_distance_meters, gps_verified, client_mutation_id, notes, admin_notes,
         completed_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        dj.id,
        normalizeIstDate(dj.job_date),
        dj.booking_id || null,
        dj.route_id || null,
        dj.route_stop_id || null,
        dj.vehicle_id,
        dj.customer_id,
        dj.location_id,
        dj.assigned_staff_id,
        dj.actual_staff_id || dj.assigned_staff_id,
        dj.frequency || 'daily',
        dj.status,
        dj.photo_url || null,
        dj.gps_lat !== undefined ? dj.gps_lat : null,
        dj.gps_lng !== undefined ? dj.gps_lng : null,
        dj.gps_accuracy !== undefined ? dj.gps_accuracy : null,
        dj.gps_distance_meters !== undefined ? dj.gps_distance_meters : null,
        dj.gps_verified !== undefined ? dj.gps_verified : null,
        dj.client_mutation_id || null,
        dj.notes || null,
        dj.admin_notes || null,
        dj.completed_at || null,
        dj.created_at || new Date(),
        dj.updated_at || new Date()
      ]
    );
  }

  // 12. Job Applications
  for (const ja of data.job_applications || []) {
    await client.query(
      `INSERT INTO public.job_applications (
         name, mobile, age, gender, city, email, resume_url, resume_filename,
         remark, status, admin_notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        ja.name,
        ja.mobile,
        ja.age || null,
        ja.gender || null,
        ja.city || null,
        ja.email || null,
        ja.resume_url || null,
        ja.resume_filename || null,
        ja.remark || null,
        ja.status || 'new',
        ja.admin_notes || null,
        ja.created_at || new Date(),
        ja.updated_at || new Date()
      ]
    );
  }

  // 13. Staff Tracking Telemetry
  for (const stc of data.staff_tracking_current || []) {
    await client.query(
      `INSERT INTO public.staff_tracking_current (
         staff_id, last_latitude, last_longitude, last_accuracy, last_speed, last_heading,
         battery_level, is_charging, last_seen_at, current_status, today_distance_meters,
         tracking_date, current_stoppage_id, updated_at, last_received_at, last_heartbeat_at,
         device_id, previous_device_id, device_changed_at, app_version, network_type,
         connectivity_status, permission_status, accuracy_tier
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        stc.staff_id,
        stc.last_latitude,
        stc.last_longitude,
        stc.last_accuracy,
        stc.last_speed,
        stc.last_heading,
        stc.battery_level,
        stc.is_charging,
        stc.last_seen_at,
        stc.current_status || 'idle',
        stc.today_distance_meters || 0,
        normalizeIstDate(stc.tracking_date) || normalizeIstDate(new Date()),
        stc.current_stoppage_id || null,
        stc.updated_at || new Date(),
        stc.last_received_at || null,
        stc.last_heartbeat_at || null,
        stc.device_id || null,
        stc.previous_device_id || null,
        stc.device_changed_at || null,
        stc.app_version || null,
        stc.network_type || null,
        stc.connectivity_status || null,
        stc.permission_status || null,
        stc.accuracy_tier || null
      ]
    );
  }

  for (const sl of data.staff_locations || []) {
    await client.query(
      `INSERT INTO public.staff_locations (
         id, staff_id, latitude, longitude, accuracy, altitude, speed, heading,
         battery_level, is_charging, trigger_type, captured_at, recorded_at,
         client_event_id, device_id, app_version, network_type, connectivity_status,
         permission_status, is_valid_fix, accuracy_tier
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        sl.id,
        sl.staff_id,
        sl.latitude,
        sl.longitude,
        sl.accuracy,
        sl.altitude,
        sl.speed,
        sl.heading,
        sl.battery_level,
        sl.is_charging,
        sl.trigger_type || 'heartbeat',
        sl.captured_at,
        sl.recorded_at || new Date(),
        sl.client_event_id || null,
        sl.device_id || null,
        sl.app_version || null,
        sl.network_type || null,
        sl.connectivity_status || null,
        sl.permission_status || null,
        sl.is_valid_fix !== false,
        sl.accuracy_tier || null
      ]
    );
  }

  for (const ss of data.staff_stoppages || []) {
    await client.query(
      `INSERT INTO public.staff_stoppages (
         id, staff_id, latitude, longitude, address_text, matched_customer_id,
         arrived_at, departed_at, dwell_minutes, is_active, stoppage_date, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        ss.id,
        ss.staff_id,
        ss.latitude,
        ss.longitude,
        ss.address_text || null,
        ss.matched_customer_id || null,
        ss.arrived_at,
        ss.departed_at || null,
        ss.dwell_minutes || 0,
        Boolean(ss.is_active),
        normalizeIstDate(ss.stoppage_date),
        ss.created_at || new Date(),
        ss.updated_at || new Date()
      ]
    );
  }

  // 14. Audit Logs (append directly preserving historical real-entity trail)
  for (const al of data.audit_logs || []) {
    await client.query(
      `INSERT INTO public.audit_logs (
         entity_type, entity_id, action, changed_by, before_state, after_state, ip_address, created_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        al.entity_type,
        al.entity_id,
        String(al.action || 'legacy').slice(0, 50),
        al.changed_by || 'system',
        al.before_state ? JSON.stringify(al.before_state) : null,
        al.after_state ? JSON.stringify(al.after_state) : null,
        al.ip_address || null,
        al.created_at || new Date()
      ]
    );
  }
}

async function runRebuild() {
  const dbConfig = resolveDatabaseConfig(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  if (!dbConfig.isConfigured) {
    throw new Error(`[Rebuild] Configuration Error: ${dbConfig.error}`);
  }
  const dbTarget = startupSafety.classifyDatabaseTarget(dbConfig, process.env);
  console.log(`[Rebuild] Target DB: ${dbTarget.databaseName} (${dbTarget.sanitizedHost}) [${dbTarget.classification}]`);
  if (dbTarget.isProductionDb) {
    throw new Error(`[Rebuild] ABORTED: Refusing destructive rebuild against PRODUCTION DB '${dbTarget.databaseName}'.`);
  }
  if (dbTarget.classification === 'UNKNOWN') {
    throw new Error(`[Rebuild] ABORTED: Refusing destructive rebuild against UNKNOWN DB target '${dbTarget.databaseName}'.`);
  }

  // Step 1: Load or generate pre-wipe export
  if (!fs.existsSync(BRD_EXPORT_LATEST) || process.argv.includes('--fresh-export')) {
    console.log('[Rebuild] Running pre-wipe export first...');
    await runExport();
  } else {
    console.log(`[Rebuild] Using existing verified pre-wipe export: ${BRD_EXPORT_LATEST}`);
  }

  const brdExport = JSON.parse(fs.readFileSync(BRD_EXPORT_LATEST, 'utf8'));
  const rawBackupCheck = path.join(DATA_DIR, brdExport.rawBackupFile || '');
  if (!brdExport.rawBackupFile || !fs.existsSync(rawBackupCheck)) {
    throw new Error(`[Rebuild] Safety abort: raw backup file missing (${rawBackupCheck}).`);
  }

  // Step 2: Drop legacy public objects & reset meta.schema_migrations
  const client = new Client({
    connectionString: dbConfig.directUrl,
    ssl: { rejectUnauthorized: process.env.ALLOW_INSECURE_DB_SSL === 'true' ? false : true },
    connectionTimeoutMillis: 15000
  });
  await client.connect();
  try {
    await dropLegacyPublicObjects(client);
  } finally {
    await client.end();
  }

  // Step 3: Run clean BRD migration (001_brd_schema.sql)
  const migRes = await runMigration({ source: 'cli_rebuild' });
  if (!migRes.executed || migRes.appliedCount < 1) {
    throw new Error('[Rebuild] Clean migration 001_brd_schema.sql did not apply as expected.');
  }

  // Step 4: Seed catalog & re-import real operational data in single transaction
  const importClient = new Client({
    connectionString: dbConfig.directUrl,
    ssl: { rejectUnauthorized: process.env.ALLOW_INSECURE_DB_SSL === 'true' ? false : true },
    connectionTimeoutMillis: 15000
  });
  await importClient.connect();
  try {
    await importClient.query('BEGIN');
    const seeded = await seedMasterCatalogAndSettings(importClient, brdExport.data);
    await reimportExportedData(importClient, brdExport.data, seeded);
    await syncSequences(importClient);
    await importClient.query('COMMIT');
    console.log('[Rebuild] Seed + real data re-import committed successfully.');

    // Step 5: Report final table list & row counts
    const tblRes = await importClient.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const counts = {};
    for (const r of tblRes.rows) {
      const cRes = await importClient.query(`SELECT count(*)::int AS cnt FROM public."${r.table_name}"`);
      counts[r.table_name] = cRes.rows[0].cnt;
    }
    console.log(`[Rebuild] Final public table count: ${tblRes.rows.length}`);
    console.log('[Rebuild] Final row counts:', JSON.stringify(counts, null, 2));
    return counts;
  } catch (err) {
    await importClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await importClient.end();
  }
}

module.exports = { runRebuild };

if (require.main === module) {
  runRebuild()
    .then(() => {
      console.log('[Rebuild] Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Rebuild] FAILED:', err);
      process.exit(1);
    });
}
