/**
 * Repository for BRD v1.0 Master Catalog:
 * - services (4 canonical categories: dcc, car_wash, solar, detailing)
 * - packages + package_items (flexible service combinations, incl. DCC & 5/5+ pricing)
 * - solar_pricing_tiers (panel ranges + min billing one-time & AMC)
 * - addons (global add-ons: name, price >= 0, default_quantity >= 1)
 */

'use strict';

const db = require('../index');

const ALLOWED_CATEGORIES = ['dcc', 'car_wash', 'solar', 'detailing'];

// =========================================================================
// SERVICES
// =========================================================================

async function findAllServices({ category = null, activeOnly = false, client = null } = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (category) {
    const cleanCat = String(category).trim().toLowerCase();
    if (!ALLOWED_CATEGORIES.includes(cleanCat)) {
      throw new Error(`Invalid service category '${category}'.`);
    }
    params.push(cleanCat);
    conditions.push(`category = $${params.length}`);
  }
  if (activeOnly) {
    conditions.push('is_active = TRUE');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await runner.query(
    `SELECT * FROM public.services ${where} ORDER BY sort_order ASC, name ASC`,
    params
  );
  return res.rows;
}

async function findServiceById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.services WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function saveService({
  id = null,
  category,
  name,
  description = null,
  price5Seater = null,
  price5PlusSeater = null,
  isActive = true,
  sortOrder = 0
}, client = null) {
  const runner = client || db;
  const cleanCat = String(category || '').trim().toLowerCase();
  if (!ALLOWED_CATEGORIES.includes(cleanCat)) {
    throw new Error(`Invalid service category '${category}'. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`);
  }
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Service name is required.');

  const p5 = price5Seater !== undefined && price5Seater !== null && price5Seater !== '' ? Number(price5Seater) : null;
  const p5p = price5PlusSeater !== undefined && price5PlusSeater !== null && price5PlusSeater !== '' ? Number(price5PlusSeater) : null;

  if (id) {
    const res = await runner.query(
      `UPDATE public.services
       SET category = $2,
           name = $3,
           description = $4,
           price_5_seater = $5,
           price_5_plus_seater = $6,
           is_active = $7,
           sort_order = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, cleanCat, cleanName, description || null, p5, p5p, Boolean(isActive), Number(sortOrder) || 0]
    );
    return res.rows[0] || null;
  }

  const res = await runner.query(
    `INSERT INTO public.services (
       category, name, description, price_5_seater, price_5_plus_seater, is_active, sort_order
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [cleanCat, cleanName, description || null, p5, p5p, Boolean(isActive), Number(sortOrder) || 0]
  );
  return res.rows[0];
}

async function deleteService(id, client = null) {
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.services WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

// =========================================================================
// PACKAGES & PACKAGE ITEMS
// =========================================================================

async function hydratePackages(pkgRows, runner) {
  if (!pkgRows || pkgRows.length === 0) return [];
  const ids = pkgRows.map(p => p.id);
  const itemsRes = await runner.query(
    `SELECT pi.*, s.name AS service_name, s.category AS service_category
     FROM public.package_items pi
     JOIN public.services s ON pi.service_id = s.id
     WHERE pi.package_id = ANY($1::uuid[])
     ORDER BY s.sort_order ASC, s.name ASC`,
    [ids]
  );
  const itemsByPkg = new Map();
  for (const item of itemsRes.rows) {
    if (!itemsByPkg.has(item.package_id)) itemsByPkg.set(item.package_id, []);
    itemsByPkg.get(item.package_id).push(item);
  }
  return pkgRows.map(p => {
    const items = itemsByPkg.get(p.id) || [];
    const categories = new Set(items.map(i => i.service_category));
    return {
      ...p,
      items,
      includes_dcc: categories.has('dcc'),
      includes_solar: categories.has('solar'),
      includes_car: categories.has('dcc') || categories.has('car_wash') || categories.has('detailing')
    };
  });
}

async function findAllPackages({ activeOnly = false, client = null } = {}) {
  const runner = client || db;
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const res = await runner.query(
    `SELECT * FROM public.packages ${where} ORDER BY created_at ASC, name ASC`
  );
  return hydratePackages(res.rows, runner);
}

async function findPackageById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.packages WHERE id = $1 LIMIT 1', [id]);
  if (!res.rows[0]) return null;
  const hydrated = await hydratePackages(res.rows, runner);
  return hydrated[0];
}

async function savePackage({
  id = null,
  name,
  description = null,
  validityDays,
  price5Seater = null,
  price5PlusSeater = null,
  isActive = true,
  items = []
}, client = null) {
  const execute = async (runner) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Package name is required.');
    const vDays = parseInt(validityDays, 10);
    if (!Number.isInteger(vDays) || vDays <= 0) {
      throw new Error('validityDays must be a positive integer (> 0).');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('At least one included service item is required for a package.');
    }

    // Verify included service categories to enforce mandatory 5/5+ car pricing per BRD §12.3
    const serviceIds = items.map(i => i.serviceId || i.service_id).filter(Boolean);
    if (serviceIds.length !== items.length) {
      throw new Error('Each package item must reference a valid serviceId.');
    }
    const svcRes = await runner.query(
      'SELECT id, category FROM public.services WHERE id = ANY($1::uuid[])',
      [serviceIds]
    );
    const svcMap = new Map(svcRes.rows.map(s => [s.id, s]));
    const hasCarService = items.some(i => {
      const svc = svcMap.get(i.serviceId || i.service_id);
      return svc && ['dcc', 'car_wash', 'detailing'].includes(svc.category);
    });

    const p5 = price5Seater !== undefined && price5Seater !== null && price5Seater !== '' ? Number(price5Seater) : null;
    const p5p = price5PlusSeater !== undefined && price5PlusSeater !== null && price5PlusSeater !== '' ? Number(price5PlusSeater) : null;

    if (hasCarService && (p5 === null || p5p === null || !Number.isFinite(p5) || !Number.isFinite(p5p) || p5 < 0 || p5p < 0)) {
      throw new Error('Both 5-seater and 5+ seater prices are mandatory for packages containing car services.');
    }

    let pkgRow;
    if (id) {
      const uRes = await runner.query(
        `UPDATE public.packages
         SET name = $2,
             description = $3,
             validity_days = $4,
             price_5_seater = $5,
             price_5_plus_seater = $6,
             is_active = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, cleanName, description || null, vDays, p5, p5p, Boolean(isActive)]
      );
      pkgRow = uRes.rows[0];
      if (!pkgRow) return null;
      await runner.query('DELETE FROM public.package_items WHERE package_id = $1', [pkgRow.id]);
    } else {
      const iRes = await runner.query(
        `INSERT INTO public.packages (
           name, description, validity_days, price_5_seater, price_5_plus_seater, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [cleanName, description || null, vDays, p5, p5p, Boolean(isActive)]
      );
      pkgRow = iRes.rows[0];
    }

    for (const item of items) {
      const sId = item.serviceId || item.service_id;
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      const freq = item.frequency || null;
      const dur = item.durationMonths || item.duration_months || null;
      await runner.query(
        `INSERT INTO public.package_items (package_id, service_id, quantity, frequency, duration_months)
         VALUES ($1, $2, $3, $4, $5)`,
        [pkgRow.id, sId, qty, freq, dur ? parseInt(dur, 10) : null]
      );
    }

    return findPackageById(pkgRow.id, runner);
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function deletePackage(id, client = null) {
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.packages WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

// =========================================================================
// SOLAR PRICING TIERS
// =========================================================================

async function findAllSolarTiers({ activeOnly = false, client = null } = {}) {
  const runner = client || db;
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const res = await runner.query(
    `SELECT * FROM public.solar_pricing_tiers ${where} ORDER BY min_panels ASC`
  );
  return res.rows;
}

async function findSolarTierById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.solar_pricing_tiers WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function findSolarTierForPanels(panelCount, client = null) {
  const runner = client || db;
  const panels = parseInt(panelCount, 10);
  if (!Number.isInteger(panels) || panels <= 0) return null;
  const res = await runner.query(
    `SELECT * FROM public.solar_pricing_tiers
     WHERE is_active = TRUE
       AND min_panels <= $1
       AND (max_panels IS NULL OR max_panels >= $1)
     ORDER BY min_panels ASC
     LIMIT 1`,
    [panels]
  );
  return res.rows[0] || null;
}

async function calculateSolarQuote({ panelCount, isAmc = false, visitCount = 1 } = {}, client = null) {
  const tier = await findSolarTierForPanels(panelCount, client);
  if (!tier) return null;
  const panels = parseInt(panelCount, 10);
  const perPanelTotal = panels * Number(tier.per_panel_rate);
  const floor = isAmc ? Number(tier.min_billing_amc) : Number(tier.min_billing_onetime);
  const perVisitPrice = Math.max(floor, perPanelTotal);
  const totalAmount = perVisitPrice * Math.max(1, parseInt(visitCount, 10));
  return {
    tier,
    panelCount: panels,
    perPanelRate: Number(tier.per_panel_rate),
    minBilling: floor,
    perVisitPrice,
    visitCount: Math.max(1, parseInt(visitCount, 10)),
    totalAmount
  };
}

async function saveSolarTier({
  id = null,
  tierName,
  minPanels,
  maxPanels = null,
  perPanelRate,
  minBillingOnetime,
  minBillingAmc,
  isActive = true
}, client = null) {
  const runner = client || db;
  const cleanName = String(tierName || '').trim();
  if (!cleanName) throw new Error('tierName is required.');

  const minP = parseInt(minPanels, 10);
  const maxP = maxPanels !== undefined && maxPanels !== null && maxPanels !== '' ? parseInt(maxPanels, 10) : null;

  if (id) {
    const res = await runner.query(
      `UPDATE public.solar_pricing_tiers
       SET tier_name = $2,
           min_panels = $3,
           max_panels = $4,
           per_panel_rate = $5,
           min_billing_onetime = $6,
           min_billing_amc = $7,
           is_active = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, cleanName, minP, maxP, Number(perPanelRate), Number(minBillingOnetime), Number(minBillingAmc), Boolean(isActive)]
    );
    return res.rows[0] || null;
  }

  const res = await runner.query(
    `INSERT INTO public.solar_pricing_tiers (
       tier_name, min_panels, max_panels, per_panel_rate, min_billing_onetime, min_billing_amc, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [cleanName, minP, maxP, Number(perPanelRate), Number(minBillingOnetime), Number(minBillingAmc), Boolean(isActive)]
  );
  return res.rows[0];
}

async function deleteSolarTier(id, client = null) {
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.solar_pricing_tiers WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

// =========================================================================
// GLOBAL ADD-ONS
// =========================================================================

async function findAllAddons({ activeOnly = false, client = null } = {}) {
  const runner = client || db;
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const res = await runner.query(
    `SELECT * FROM public.addons ${where} ORDER BY name ASC`
  );
  return res.rows;
}

async function findAddonById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.addons WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function saveAddon({
  id = null,
  name,
  price = 0,
  defaultQuantity = 1,
  isActive = true
}, client = null) {
  const runner = client || db;
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Addon name is required.');
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0) {
    throw new Error('Addon price must be >= 0.');
  }
  const qty = parseInt(defaultQuantity, 10);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error('Addon defaultQuantity must be >= 1.');
  }

  if (id) {
    const res = await runner.query(
      `UPDATE public.addons
       SET name = $2,
           price = $3,
           default_quantity = $4,
           is_active = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, cleanName, numPrice, qty, Boolean(isActive)]
    );
    return res.rows[0] || null;
  }

  const res = await runner.query(
    `INSERT INTO public.addons (name, price, default_quantity, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [cleanName, numPrice, qty, Boolean(isActive)]
  );
  return res.rows[0];
}

async function deleteAddon(id, client = null) {
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.addons WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

module.exports = {
  ALLOWED_CATEGORIES,
  findAllServices,
  findServiceById,
  saveService,
  deleteService,
  findAllPackages,
  findPackageById,
  savePackage,
  deletePackage,
  findAllSolarTiers,
  findSolarTierById,
  findSolarTierForPanels,
  calculateSolarQuote,
  saveSolarTier,
  deleteSolarTier,
  findAllAddons,
  findAddonById,
  saveAddon,
  deleteAddon
};
