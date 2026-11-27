/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Service Catalogue, Package Engine, Add-on Engine, Marketing & Media Service
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');

const VALID_SERVICE_MODELS = ['recurring', 'one_time', 'visit_credit', 'site_quantity', 'flexible_custom'];
const VALID_STATUSES = ['draft', 'active', 'retired'];
const VALID_PRICING_MODELS = ['fixed', 'vehicle_segment', 'per_unit', 'per_panel', 'pricing_bands', 'minimum_charge', 'custom'];
const VALID_EXECUTION_MODES = ['per_main_service', 'during_main_service', 'separate_job', 'customer_redemption', 'scheduled_independently'];

function isDccService(service) {
  if (!service) return false;
  const category = String(service.serviceCategoryId ?? service.service_category_id ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const code = String(service.serviceCode ?? service.service_code ?? '').trim().toUpperCase();
  const name = String(service.name ?? service.service_name ?? '').trim().toLowerCase().replace(/\s*\(dcc\)$/, '');
  let config = service.executionConfig ?? service.execution_config ?? {};
  if (typeof config === 'string') {
    try { config = JSON.parse(config); } catch (e) { config = {}; }
  }
  return ['daily_car_cleaning', 'daily_clean', 'dcc'].includes(category) ||
    code === 'DCC_DAILY' || code.startsWith('SVC-DCC') || name === 'daily car cleaning' ||
    (config && typeof config === 'object' && config.dcc_isolated === true);
}

function assertGenericSeeService(data, existing = null) {
  if (isDccService(existing) || isDccService({ ...(existing || {}), ...(data || {}) })) {
    throw new Error('Daily Car Cleaning is managed through the dedicated DCC workflows and cannot be configured as a generic SEE service.');
  }
}

async function assertGenericSeeAddon(addon) {
  const serviceIds = Array.isArray(addon?.applicable_service_ids) ? addon.applicable_service_ids : [];
  for (const serviceId of serviceIds) {
    const service = await repos.seeCatalogue.findServiceById(serviceId);
    if (!service || isDccService(service)) {
      throw new Error('Generic SEE add-ons cannot reference Daily Car Cleaning services.');
    }
  }
}

const STATUS_TRANSITIONS = {
  draft: ['draft', 'active', 'retired'],
  active: ['active', 'retired'],
  retired: ['retired', 'active']
};

function slugifyChecklistKey(label, index = 0) {
  const raw = String(label || '').trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || `item_${index + 1}`;
}

function normalizeChecklistRequirements(rawChecklist) {
  if (rawChecklist === undefined || rawChecklist === null) {
    return [];
  }

  let list = rawChecklist;
  if (typeof list === 'string') {
    const trimmed = list.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch (e) {
        throw new Error('checklistRequirements must be an array.');
      }
    } else {
      throw new Error('checklistRequirements must be an array.');
    }
  }

  if (!Array.isArray(list)) {
    throw new Error('checklistRequirements must be an array.');
  }

  const usedIds = new Set();
  const usedKeys = new Set();
  const normalized = [];

  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (!label) continue;
      const base = slugifyChecklistKey(label, i);
      let id = base;
      let suffix = 2;
      while (usedIds.has(id) || usedKeys.has(id)) {
        id = `${base}_${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      usedKeys.add(id);
      normalized.push({ id, key: id, label, required: true });
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const label = String(entry.label ?? entry.name ?? entry.title ?? entry.item ?? '').trim();
      if (!label) {
        throw new Error(`Checklist item at index ${i} requires a non-empty label.`);
      }
      const explicitId = entry.id ?? entry.key ?? entry.itemId ?? entry.code ?? null;
      let id;
      if (explicitId !== null && explicitId !== undefined && String(explicitId).trim() !== '') {
        id = String(explicitId).trim();
        if (usedIds.has(id) || usedKeys.has(id)) {
          throw new Error(`Duplicate checklist item id '${id}'.`);
        }
      } else {
        const base = slugifyChecklistKey(label, i);
        id = base;
        let suffix = 2;
        while (usedIds.has(id) || usedKeys.has(id)) {
          id = `${base}_${suffix}`;
          suffix += 1;
        }
      }
      const key = (entry.key !== null && entry.key !== undefined && String(entry.key).trim() !== '')
        ? String(entry.key).trim()
        : id;
      if (key !== id && (usedIds.has(key) || usedKeys.has(key))) {
        throw new Error(`Duplicate checklist item key '${key}'.`);
      }
      usedIds.add(id);
      usedKeys.add(key);
      normalized.push({
        id,
        key,
        label,
        required: entry.required !== false
      });
    } else {
      throw new Error(`Invalid checklist item at index ${i}.`);
    }
  }

  return normalized;
}

// -------------------------------------------------------------------------
// Phase 1: Service Catalogue
// -------------------------------------------------------------------------
async function listServices(filters = {}) {
  return repos.seeCatalogue.findAllServices(filters);
}

async function getServiceDetail(idOrCode) {
  let svc = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idOrCode)) {
    svc = await repos.seeCatalogue.findServiceById(idOrCode);
  }
  if (!svc) {
    svc = await repos.seeCatalogue.findServiceByCode(idOrCode);
  }
  if (!svc) return null;

  const [tags, media, addons] = await Promise.all([
    repos.seeCatalogue.findEntityMarketingTags('service', svc.id),
    repos.seeCatalogue.findMediaAssets('service', svc.id),
    repos.seeCatalogue.findAllAddons({ serviceId: svc.id })
  ]);

  return { ...svc, marketingTags: tags, media, applicableAddons: addons };
}

async function createService(data, actor = 'admin') {
  assertGenericSeeService(data);
  if (!data.serviceCode || !String(data.serviceCode).trim()) {
    throw new Error('serviceCode is required.');
  }
  if (!data.name || !String(data.name).trim()) {
    throw new Error('Service name is required.');
  }
  if (!data.serviceCategoryId) {
    throw new Error('serviceCategoryId is required.');
  }
  const model = data.serviceModel || 'one_time';
  if (!VALID_SERVICE_MODELS.includes(model)) {
    throw new Error(`Invalid serviceModel '${model}'. Allowed: ${VALID_SERVICE_MODELS.join(', ')}`);
  }
  const status = data.status || 'draft';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status '${status}'. Allowed: ${VALID_STATUSES.join(', ')}`);
  }

  const existing = await repos.seeCatalogue.findServiceByCode(data.serviceCode.trim());
  if (existing) {
    throw new Error(`Duplicate serviceCode '${data.serviceCode}'.`);
  }

  const normalizedChecklist = data.checklistRequirements !== undefined
    ? normalizeChecklistRequirements(data.checklistRequirements)
    : [];

  return db.withTransaction(async (client) => {
    const svc = await repos.seeCatalogue.createService({
      ...data,
      serviceCode: data.serviceCode.trim().toUpperCase(),
      name: data.name.trim(),
      serviceModel: model,
      status,
      checklistRequirements: normalizedChecklist,
      createdBy: actor
    }, client);

    await repos.auditLogs.logChange({
      entityType: 'see_service',
      entityId: svc.id,
      action: 'create',
      changedBy: actor,
      afterState: svc
    }, client);

    return svc;
  });
}

async function updateService(id, patch, actor = 'admin', reason = 'Updated service') {
  const existing = await repos.seeCatalogue.findServiceById(id);
  if (!existing) throw new Error(`Service '${id}' not found.`);
  assertGenericSeeService(patch, existing);

  if (patch.serviceModel && !VALID_SERVICE_MODELS.includes(patch.serviceModel)) {
    throw new Error(`Invalid serviceModel '${patch.serviceModel}'.`);
  }
  if (patch.status) {
    if (!VALID_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid status '${patch.status}'.`);
    }
    const allowed = STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(patch.status)) {
      throw new Error(`Cannot transition service from '${existing.status}' to '${patch.status}'.`);
    }
  }

  const nextPatch = { ...patch };
  if (patch.checklistRequirements !== undefined) {
    nextPatch.checklistRequirements = normalizeChecklistRequirements(patch.checklistRequirements);
  }

  return db.withTransaction(async (client) => {
    const updated = await repos.seeCatalogue.updateService(id, nextPatch, actor, reason, client);
    await repos.auditLogs.logChange({
      entityType: 'see_service',
      entityId: id,
      action: 'update',
      changedBy: actor,
      beforeState: existing,
      afterState: updated
    }, client);
    return updated;
  });
}

async function changeServiceStatus(id, status, actor = 'admin', reason = 'Status update') {
  return updateService(id, { status }, actor, reason);
}

// -------------------------------------------------------------------------
// Phase 3: Package Engine & Dynamic Pricing Resolver
// -------------------------------------------------------------------------
async function listPackages(filters = {}) {
  return repos.seeCatalogue.findAllPackages(filters);
}

async function getPackageDetail(idOrCode) {
  let pkg = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idOrCode)) {
    pkg = await repos.seeCatalogue.findPackageById(idOrCode);
  } else {
    pkg = await repos.seeCatalogue.findPackageByCode(idOrCode);
  }
  if (!pkg) return null;

  const [tags, media] = await Promise.all([
    repos.seeCatalogue.findEntityMarketingTags('package', pkg.id),
    repos.seeCatalogue.findMediaAssets('package', pkg.id)
  ]);
  return { ...pkg, marketingTags: tags, media };
}

async function createPackage(data, actor = 'admin') {
  if (!data.packageCode || !String(data.packageCode).trim()) {
    throw new Error('packageCode is required.');
  }
  if (!data.name || !String(data.name).trim()) {
    throw new Error('Package name is required.');
  }
  if (!data.mainServiceId) {
    throw new Error('mainServiceId is required.');
  }
  const pricingModel = data.pricingModel || 'fixed';
  if (!VALID_PRICING_MODELS.includes(pricingModel)) {
    throw new Error(`Invalid pricingModel '${pricingModel}'.`);
  }

  const existing = await repos.seeCatalogue.findPackageByCode(data.packageCode.trim());
  if (existing) {
    throw new Error(`Duplicate packageCode '${data.packageCode}'.`);
  }

  const mainService = await repos.seeCatalogue.findServiceById(data.mainServiceId);
  if (!mainService || mainService.status !== 'active') throw new Error('Primary service must be an active canonical service.');
  if (isDccService(mainService)) {
    throw new Error('Daily Car Cleaning is isolated from generic SEE packages.');
  }
  const benefits = Array.isArray(data.benefits) ? data.benefits : [{ serviceId: data.mainServiceId, benefitType: 'primary', quantity: data.defaultQuantity || 1, frequencyId: data.frequencyId || null }];
  if (!benefits.length) throw new Error('At least one package service benefit is required.');
  for (const [index, benefit] of benefits.entries()) {
    if (!benefit || !benefit.serviceId || !Number.isInteger(Number(benefit.quantity)) || Number(benefit.quantity) < 1) throw new Error(`Package benefit ${index + 1} requires a canonical serviceId and positive integer quantity.`);
    const service = await repos.seeCatalogue.findServiceById(benefit.serviceId);
    if (!service || service.status !== 'active') throw new Error(`Package benefit service '${benefit.serviceId}' is not active.`);
    if (isDccService(service)) throw new Error('Daily Car Cleaning cannot be included in a generic SEE package.');
  }
  for (const [index, item] of (Array.isArray(data.addons) ? data.addons : []).entries()) {
    if (!item || !item.addonId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw new Error(`Package add-on ${index + 1} requires a canonical addonId and positive integer quantity.`);
    const addon = await repos.seeCatalogue.findAddonById(item.addonId);
    if (!addon || addon.status !== 'active') throw new Error(`Package add-on '${item.addonId}' is not active.`);
    await assertGenericSeeAddon(addon);
    const compatible = Array.isArray(addon.applicable_service_ids) ? addon.applicable_service_ids.map(String) : [];
    if (compatible.length && !benefits.some(benefit => compatible.includes(String(benefit.serviceId)))) throw new Error(`Package add-on '${addon.name}' is not compatible with any included service.`);
  }

  return db.withTransaction(async (client) => {
    const pkg = await repos.seeCatalogue.createPackage({
      ...data,
      packageCode: data.packageCode.trim().toUpperCase(),
      name: data.name.trim(),
      pricingModel,
      createdBy: actor
    }, client);

    if (Array.isArray(data.benefits)) {
      for (const b of data.benefits) {
        await repos.seeCatalogue.addPackageBenefit(pkg.id, b, client);
      }
    } else {
      // Default primary benefit from mainServiceId
      await repos.seeCatalogue.addPackageBenefit(pkg.id, {
        serviceId: data.mainServiceId,
        benefitType: 'primary',
        quantity: data.defaultQuantity || 1,
        frequencyId: data.frequencyId || null
      }, client);
    }

    if (Array.isArray(data.addons)) {
      for (const a of data.addons) {
        await repos.seeCatalogue.addPackageAddon(pkg.id, a, client);
      }
    }

    if (Array.isArray(data.pricingRules)) {
      for (const r of data.pricingRules) {
        await repos.seeCatalogue.addPackagePricingRule(pkg.id, r, client);
      }
    }

    await repos.auditLogs.logChange({
      entityType: 'see_package',
      entityId: pkg.id,
      action: 'create',
      changedBy: actor,
      afterState: pkg
    }, client);

    return repos.seeCatalogue.findPackageById(pkg.id, client);
  });
}

async function updatePackage(id, patch, actor = 'admin') {
  const existing = await repos.seeCatalogue.findPackageById(id);
  if (!existing) throw new Error(`Package '${id}' not found.`);
  if (patch.status && !VALID_STATUSES.includes(patch.status)) throw new Error(`Invalid package status '${patch.status}'.`);
  if (patch.status && !(STATUS_TRANSITIONS[existing.status] || []).includes(patch.status)) throw new Error(`Cannot transition package from '${existing.status}' to '${patch.status}'.`);
  if (patch.pricingModel && !VALID_PRICING_MODELS.includes(patch.pricingModel)) throw new Error(`Invalid pricingModel '${patch.pricingModel}'.`);
  const mainServiceId = patch.mainServiceId || existing.main_service_id;
  const mainService = await repos.seeCatalogue.findServiceById(mainServiceId);
  if (!mainService || mainService.status !== 'active') throw new Error('Primary service must be an active canonical service.');
  if (isDccService(mainService)) throw new Error('Daily Car Cleaning is isolated from generic SEE packages.');
  const nextBenefits = Array.isArray(patch.benefits) ? patch.benefits : existing.benefits;
  const nextAddons = Array.isArray(patch.addons) ? patch.addons : existing.addons;
  for (const [index, benefit] of (nextBenefits || []).entries()) {
    if (!benefit || !(benefit.serviceId || benefit.service_id) || !Number.isInteger(Number(benefit.quantity)) || Number(benefit.quantity) < 1) throw new Error(`Package benefit ${index + 1} requires a canonical serviceId and positive integer quantity.`);
    const service = await repos.seeCatalogue.findServiceById(benefit.serviceId || benefit.service_id);
    if (!service || service.status !== 'active') throw new Error(`Package benefit service '${benefit.serviceId || benefit.service_id}' is not active.`);
    if (isDccService(service)) throw new Error('Daily Car Cleaning cannot be included in a generic SEE package.');
  }
  for (const [index, item] of (Array.isArray(patch.addons) ? nextAddons : []).entries()) {
    if (!item || !(item.addonId || item.addon_id) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw new Error(`Package add-on ${index + 1} requires a canonical addonId and positive integer quantity.`);
    const addon = await repos.seeCatalogue.findAddonById(item.addonId || item.addon_id);
    if (!addon || addon.status !== 'active') throw new Error(`Package add-on '${item.addonId || item.addon_id}' is not active.`);
    await assertGenericSeeAddon(addon);
    const compatible = Array.isArray(addon.applicable_service_ids) ? addon.applicable_service_ids.map(String) : [];
    if (compatible.length && !(nextBenefits || []).some(benefit => compatible.includes(String(benefit.serviceId || benefit.service_id)))) throw new Error(`Package add-on '${addon.name}' is not compatible with any included service.`);
  }

  return db.withTransaction(async (client) => {
    const updated = await repos.seeCatalogue.updatePackage(id, patch, client);
    // Composition is part of a package definition version. Replace only the
    // child collections explicitly included in the patch, in this transaction;
    // existing purchase snapshots remain immutable and keep their old content.
    if (Array.isArray(patch.benefits)) {
      await client.query('DELETE FROM public.package_benefits WHERE package_id = $1', [id]);
      for (const benefit of patch.benefits) {
        if (!benefit || !benefit.serviceId || !Number.isFinite(Number(benefit.quantity)) || Number(benefit.quantity) < 1) {
          throw new Error('Each package benefit requires a serviceId and quantity greater than zero.');
        }
        await repos.seeCatalogue.addPackageBenefit(id, benefit, client);
      }
    }
    if (Array.isArray(patch.addons)) {
      await client.query('DELETE FROM public.package_addons WHERE package_id = $1', [id]);
      for (const addon of patch.addons) {
        if (!addon || !addon.addonId || !Number.isFinite(Number(addon.quantity)) || Number(addon.quantity) < 1) {
          throw new Error('Each package add-on requires an addonId and quantity greater than zero.');
        }
        await repos.seeCatalogue.addPackageAddon(id, addon, client);
      }
    }
    if (Array.isArray(patch.pricingRules)) {
      await client.query('DELETE FROM public.package_pricing_rules WHERE package_id = $1', [id]);
      for (const rule of patch.pricingRules) {
        if (!rule || !rule.pricingModel || !Number.isFinite(Number(rule.unitPrice))) {
          throw new Error('Each pricing rule requires a pricingModel and numeric unitPrice.');
        }
        await repos.seeCatalogue.addPackagePricingRule(id, rule, client);
      }
    }
    await repos.auditLogs.logChange({
      entityType: 'see_package',
      entityId: id,
      action: 'update',
      changedBy: actor,
      beforeState: existing,
      afterState: updated
    }, client);
    return repos.seeCatalogue.findPackageById(id, client);
  });
}

/**
 * Resolve effective price for a package given city, zone, vehicleSegment, units/panels, and date
 * Supports: fixed, vehicle_segment, per_unit, per_panel, pricing_bands, minimum_charge, custom
 */
function calculatePackagePrice(pkg, { city = null, zone = null, vehicleSegment = null, quantity = 1, effectiveDate = null } = {}) {
  const targetDate = effectiveDate || new Date().toISOString().split('T')[0];
  const rules = Array.isArray(pkg.pricingRules) ? pkg.pricingRules : [];

  // Score matching rules by specificity: zone (+4) + city (+2) + vehicleSegment (+1)
  const matching = rules
    .filter(r => r.is_active !== false)
    .filter(r => !r.effective_from || String(r.effective_from).slice(0, 10) <= targetDate)
    .filter(r => !r.effective_to || String(r.effective_to).slice(0, 10) >= targetDate)
    .filter(r => !r.city || (city && r.city.toLowerCase() === city.toLowerCase()))
    .filter(r => !r.zone || (zone && r.zone.toLowerCase() === zone.toLowerCase()))
    .filter(r => !r.vehicle_segment || (vehicleSegment && r.vehicle_segment === vehicleSegment))
    .map(r => ({
      rule: r,
      score: (r.zone ? 4 : 0) + (r.city ? 2 : 0) + (r.vehicle_segment ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  const chosen = matching.length > 0 ? matching[0].rule : null;
  const model = chosen ? chosen.pricing_model : (pkg.pricing_model || 'fixed');
  const unitPrice = chosen ? parseFloat(chosen.unit_price) : parseFloat(pkg.base_price || 0);
  const minCharge = chosen ? parseFloat(chosen.min_charge || 0) : parseFloat((pkg.pricing_config && pkg.pricing_config.min_charge) || 0);
  const bands = chosen ? (chosen.pricing_bands || []) : ((pkg.pricing_config && pkg.pricing_config.pricing_bands) || []);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  let computed = unitPrice;
  if (model === 'per_unit' || model === 'per_panel') {
    computed = unitPrice * qty;
  } else if (model === 'pricing_bands' && Array.isArray(bands) && bands.length > 0) {
    const band = bands.find(b => qty >= (b.min || 0) && (b.max == null || qty <= b.max));
    if (band) {
      computed = band.flat_price != null ? parseFloat(band.flat_price) : parseFloat(band.unit_price || unitPrice) * qty;
    } else {
      computed = unitPrice * qty;
    }
  } else if (model === 'minimum_charge') {
    computed = Math.max(minCharge, unitPrice * qty);
  }

  if (minCharge > 0) {
    computed = Math.max(minCharge, computed);
  }

  return {
    pricingModel: model,
    unitPrice,
    minCharge,
    quantity: qty,
    basePrice: Math.round(computed * 100) / 100,
    matchedRuleId: chosen ? chosen.id : null
  };
}

// -------------------------------------------------------------------------
// Phase 4: Add-on Engine
// -------------------------------------------------------------------------
async function listAddons(filters = {}) {
  return repos.seeCatalogue.findAllAddons(filters);
}

async function getAddonDetail(idOrCode) {
  let addon = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idOrCode)) {
    addon = await repos.seeCatalogue.findAddonById(idOrCode);
  }
  if (!addon) {
    addon = await repos.seeCatalogue.findAddonByCode(idOrCode);
  }
  if (!addon) return null;

  const [tags, media] = await Promise.all([
    repos.seeCatalogue.findEntityMarketingTags('addon', addon.id),
    repos.seeCatalogue.findMediaAssets('addon', addon.id)
  ]);

  return { ...addon, marketingTags: tags, media };
}

async function createAddon(data, actor = 'admin') {
  if (!data.addonCode || !String(data.addonCode).trim()) {
    throw new Error('addonCode is required.');
  }
  if (!data.name || !String(data.name).trim()) {
    throw new Error('Add-on name is required.');
  }
  for (const serviceId of (Array.isArray(data.applicableServiceIds) ? data.applicableServiceIds : [])) {
    const service = await repos.seeCatalogue.findServiceById(serviceId);
    if (!service || isDccService(service)) {
      throw new Error('Generic SEE add-ons cannot reference Daily Car Cleaning services.');
    }
  }
  const executionMode = data.executionMode || 'during_main_service';
  if (!VALID_EXECUTION_MODES.includes(executionMode)) {
    throw new Error(`Invalid executionMode '${executionMode}'.`);
  }
  const existing = await repos.seeCatalogue.findAddonByCode(data.addonCode.trim());
  if (existing) {
    throw new Error(`Duplicate addonCode '${data.addonCode}'.`);
  }

  return db.withTransaction(async (client) => {
    const addon = await repos.seeCatalogue.createAddon({
      ...data,
      addonCode: data.addonCode.trim().toUpperCase(),
      name: data.name.trim(),
      executionMode,
      createdBy: actor
    }, client);

    await repos.auditLogs.logChange({
      entityType: 'see_addon',
      entityId: addon.id,
      action: 'create',
      changedBy: actor,
      afterState: addon
    }, client);
    return addon;
  });
}

async function updateAddon(id, patch, actor = 'admin') {
  const existing = await repos.seeCatalogue.findAddonById(id);
  if (!existing) throw new Error(`Add-on '${id}' not found.`);
  if (patch.executionMode && !VALID_EXECUTION_MODES.includes(patch.executionMode)) {
    throw new Error(`Invalid executionMode '${patch.executionMode}'.`);
  }
  const effectiveServiceIds = Array.isArray(patch.applicableServiceIds)
    ? patch.applicableServiceIds
    : (Array.isArray(existing.applicable_service_ids) ? existing.applicable_service_ids : []);
  if (effectiveServiceIds.length) {
    for (const serviceId of effectiveServiceIds) {
      const service = await repos.seeCatalogue.findServiceById(serviceId);
      if (!service || isDccService(service)) {
        throw new Error('Generic SEE add-ons cannot reference Daily Car Cleaning services.');
      }
    }
  }
  return repos.seeCatalogue.updateAddon(id, patch);
}

// -------------------------------------------------------------------------
// Phase 5: Marketing Tags & Media Metadata
// -------------------------------------------------------------------------
async function listMarketingTags(activeOnly = false) {
  return repos.seeCatalogue.findAllMarketingTags({ activeOnly });
}

async function createMarketingTag(data, actor = 'admin') {
  if (!data.code || !data.label) {
    throw new Error('Marketing tag code and label are required.');
  }
  const tag = await repos.seeCatalogue.createMarketingTag({
    ...data,
    code: String(data.code).trim().toUpperCase()
  });
  await repos.auditLogs.logChange({
    entityType: 'marketing_tag',
    entityId: tag.id,
    action: 'create',
    changedBy: actor,
    afterState: tag
  });
  return tag;
}

async function attachMarketingTag(entityType, entityId, tagId, sortOrder = 1) {
  if (!['service', 'package', 'addon'].includes(entityType)) {
    throw new Error(`Invalid entityType '${entityType}'.`);
  }
  return repos.seeCatalogue.attachMarketingTag(entityType, entityId, tagId, sortOrder);
}

/**
 * Validates and registers media metadata (Square 1:1 or Rectangle 4:3)
 */
async function registerMediaAsset(data, actor = 'admin') {
  if (!data.entityType || !data.entityId || !data.mediaSlot || !data.storageUrl) {
    throw new Error('entityType, entityId, mediaSlot, and storageUrl are required.');
  }

  // Validate aspect ratio when dimensions are provided
  if (data.width && data.height) {
    const ratio = data.width / data.height;
    if (data.mediaSlot === 'square_1_1' && Math.abs(ratio - 1.0) > 0.05) {
      throw new Error(`square_1_1 media slot requires 1:1 aspect ratio (got ${data.width}x${data.height}).`);
    }
    if (data.mediaSlot === 'rectangle_4_3') {
      const targetRatio = data.expectedRatio || (4 / 3);
      const tolerance = data.ratioTolerance || 0.1;
      if (Math.abs(ratio - targetRatio) > tolerance) {
        throw new Error(`rectangle_4_3 media slot requires ~4:3 aspect ratio (got ${data.width}x${data.height}).`);
      }
    }
  }

  return repos.seeCatalogue.upsertMediaAsset({
    ...data,
    uploadedBy: actor
  });
}

async function deleteMediaAsset(id) {
  return repos.seeCatalogue.deleteMediaAsset(id);
}

module.exports = {
  VALID_SERVICE_MODELS,
  VALID_STATUSES,
  VALID_PRICING_MODELS,
  VALID_EXECUTION_MODES,
  isDccService,
  slugifyChecklistKey,
  normalizeChecklistRequirements,
  listServices,
  getServiceDetail,
  createService,
  updateService,
  changeServiceStatus,
  listPackages,
  getPackageDetail,
  createPackage,
  updatePackage,
  calculatePackagePrice,
  listAddons,
  getAddonDetail,
  createAddon,
  updateAddon,
  listMarketingTags,
  createMarketingTag,
  attachMarketingTag,
  registerMediaAsset,
  deleteMediaAsset
};
