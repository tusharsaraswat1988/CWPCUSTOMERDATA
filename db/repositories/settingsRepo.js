/**
 * Repository for Settings:
 * - public.homepage_settings (primary_config for homepageConfigService)
 * - public.app_settings (key/value JSONB settings, e.g. auto_verify_hours)
 */

'use strict';

const db = require('../index');

async function getHomepageSettings(client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.homepage_settings WHERE id = $1 LIMIT 1',
    ['primary_config']
  );
  return res.rows[0] || null;
}

async function upsertHomepageSettings({
  ratesJson = {},
  offersJson = [],
  couponsJson = [],
  contactPhone = '7054007733',
  contactEmail = 'cwpdetailers@gmail.com',
  officeAddress = '',
  googleMapsUrl = '',
  gstPercent = 18
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.homepage_settings (
       id, rates_json, offers_json, coupons_json,
       contact_phone, contact_email, office_address, google_maps_url,
       gst_percent, updated_at
     ) VALUES (
       'primary_config', $1::jsonb, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
     )
     ON CONFLICT (id) DO UPDATE SET
       rates_json = EXCLUDED.rates_json,
       offers_json = EXCLUDED.offers_json,
       coupons_json = EXCLUDED.coupons_json,
       contact_phone = EXCLUDED.contact_phone,
       contact_email = EXCLUDED.contact_email,
       office_address = EXCLUDED.office_address,
       google_maps_url = EXCLUDED.google_maps_url,
       gst_percent = EXCLUDED.gst_percent,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      JSON.stringify(ratesJson || {}),
      JSON.stringify(offersJson || []),
      JSON.stringify(couponsJson || []),
      contactPhone,
      contactEmail,
      officeAddress,
      googleMapsUrl,
      Number(gstPercent) || 18
    ]
  );
  return res.rows[0];
}

async function getAppSetting(key, defaultValue = null, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.app_settings WHERE key = $1 LIMIT 1',
    [String(key).trim()]
  );
  if (!res.rows[0]) return defaultValue;
  return res.rows[0].value;
}

async function setAppSetting(key, value, updatedBy = 'admin', client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [String(key).trim(), JSON.stringify(value), updatedBy || 'admin']
  );
  return res.rows[0];
}

async function getAllAppSettings(client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT key, value, updated_by, updated_at FROM public.app_settings ORDER BY key ASC');
  const map = {};
  for (const row of res.rows) {
    map[row.key] = row.value;
  }
  return map;
}

module.exports = {
  getHomepageSettings,
  upsertHomepageSettings,
  getAppSetting,
  setAppSetting,
  getAllAppSettings
};
