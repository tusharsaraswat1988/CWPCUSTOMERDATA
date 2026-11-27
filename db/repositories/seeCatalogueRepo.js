/**
 * Repository for SEE Catalogue, Frequencies, Packages, Add-ons, Marketing Tags, and Media
 */
const db = require('../index');

// -------------------------------------------------------------------------
// Services & Versions
// -------------------------------------------------------------------------
async function findAllServices({ status = null, categoryId = null, serviceModel = null, includeRetired = false, limit = 100, offset = 0 } = {}, client = null) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  } else if (!includeRetired) {
    conditions.push(`s.status != 'retired'`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`s.service_category_id = $${params.length}`);
  }
  if (serviceModel) {
    params.push(serviceModel);
    conditions.push(`s.service_model = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const res = await runner.query(
    `SELECT s.*, sc.display_name AS category_name
     FROM public.services s
     JOIN public.service_categories sc ON s.service_category_id = sc.id
     ${where}
     ORDER BY s.created_at ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

async function findServiceById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT s.*, sc.display_name AS category_name
     FROM public.services s
     JOIN public.service_categories sc ON s.service_category_id = sc.id
     WHERE s.id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findServiceByCode(code, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT s.*, sc.display_name AS category_name
     FROM public.services s
     JOIN public.service_categories sc ON s.service_category_id = sc.id
     WHERE UPPER(s.service_code) = UPPER($1) LIMIT 1`,
    [code]
  );
  return res.rows[0] || null;
}

async function createService(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.services (
       service_code, name, name_hi, service_category_id, service_model,
       description, tagline, details, execution_config, expected_duration_minutes,
       checklist_requirements, photo_requirements, required_staff_capability,
       city_zone_applicability, status, version, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16)
     RETURNING *`,
    [
      data.serviceCode,
      data.name,
      data.nameHi || null,
      data.serviceCategoryId,
      data.serviceModel || 'one_time',
      data.description || null,
      data.tagline || null,
      data.details || null,
      JSON.stringify(data.executionConfig || {}),
      data.expectedDurationMinutes || 30,
      JSON.stringify(data.checklistRequirements || []),
      JSON.stringify(data.photoRequirements || { before_min: 0, after_min: 0, required: false }),
      data.requiredStaffCapability || data.serviceCategoryId,
      JSON.stringify(data.cityZoneApplicability || { all_cities: true, cities: [], zones: [] }),
      data.status || 'draft',
      data.createdBy || 'admin'
    ]
  );
  const created = res.rows[0];
  await runner.query(
    `INSERT INTO public.service_versions (service_id, version, snapshot, changed_by, change_reason)
     VALUES ($1, 1, $2, $3, 'Initial creation')`,
    [created.id, JSON.stringify(created), data.createdBy || 'admin']
  );
  return created;
}

async function updateService(id, patch, actor = 'admin', reason = 'Updated service', client = null) {
  const runner = client || db;
  const existing = await findServiceById(id, runner);
  if (!existing) return null;

  const nextVersion = (existing.version || 1) + 1;
  const res = await runner.query(
    `UPDATE public.services SET
       name = COALESCE($2, name),
       name_hi = COALESCE($3, name_hi),
       service_category_id = COALESCE($4, service_category_id),
       service_model = COALESCE($5, service_model),
       description = COALESCE($6, description),
       tagline = COALESCE($7, tagline),
       details = COALESCE($8, details),
       execution_config = COALESCE($9, execution_config),
       expected_duration_minutes = COALESCE($10, expected_duration_minutes),
       checklist_requirements = COALESCE($11, checklist_requirements),
       photo_requirements = COALESCE($12, photo_requirements),
       required_staff_capability = COALESCE($13, required_staff_capability),
       city_zone_applicability = COALESCE($14, city_zone_applicability),
       status = COALESCE($15, status),
       version = $16,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.nameHi ?? null,
      patch.serviceCategoryId ?? null,
      patch.serviceModel ?? null,
      patch.description ?? null,
      patch.tagline ?? null,
      patch.details ?? null,
      patch.executionConfig ? JSON.stringify(patch.executionConfig) : null,
      patch.expectedDurationMinutes ?? null,
      patch.checklistRequirements ? JSON.stringify(patch.checklistRequirements) : null,
      patch.photoRequirements ? JSON.stringify(patch.photoRequirements) : null,
      patch.requiredStaffCapability ?? null,
      patch.cityZoneApplicability ? JSON.stringify(patch.cityZoneApplicability) : null,
      patch.status ?? null,
      nextVersion
    ]
  );
  const updated = res.rows[0];
  await runner.query(
    `INSERT INTO public.service_versions (service_id, version, snapshot, changed_by, change_reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, nextVersion, JSON.stringify(updated), actor, reason]
  );
  return updated;
}

// -------------------------------------------------------------------------
// Frequencies & Blackouts
// -------------------------------------------------------------------------
async function findAllFrequencies(client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.service_frequencies WHERE is_active = TRUE ORDER BY created_at ASC');
  return res.rows;
}

async function findFrequencyById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.service_frequencies WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function findFrequencyByCode(code, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.service_frequencies WHERE UPPER(code) = UPPER($1) LIMIT 1', [code]);
  return res.rows[0] || null;
}

async function createFrequency(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_frequencies (
       code, name, frequency_type, interval_value, interval_unit,
       recurrence_config, start_date, end_date, timezone,
       missed_visit_policy, carry_forward_policy, blackout_config
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.code,
      data.name,
      data.frequencyType,
      data.intervalValue || 1,
      data.intervalUnit || 'day',
      JSON.stringify(data.recurrenceConfig || {}),
      data.startDate || null,
      data.endDate || null,
      data.timezone || 'Asia/Kolkata',
      data.missedVisitPolicy || 'skip',
      data.carryForwardPolicy || 'none',
      JSON.stringify(data.blackoutConfig || { skip_holidays: false, weekly_off_days: [] })
    ]
  );
  return res.rows[0];
}

async function findBlackouts({ city = null, zone = null, serviceId = null, fromDate = null, toDate = null } = {}, client = null) {
  const runner = client || db;
  const conditions = [];
  const params = [];
  if (fromDate) { params.push(fromDate); conditions.push(`blackout_date >= $${params.length}`); }
  if (toDate) { params.push(toDate); conditions.push(`blackout_date <= $${params.length}`); }
  if (city) { params.push(city); conditions.push(`(city IS NULL OR city = $${params.length})`); }
  if (zone) { params.push(zone); conditions.push(`(zone IS NULL OR zone = $${params.length})`); }
  if (serviceId) { params.push(serviceId); conditions.push(`(service_id IS NULL OR service_id = $${params.length})`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await runner.query(`SELECT * FROM public.holiday_blackouts ${where} ORDER BY blackout_date ASC`, params);
  return res.rows;
}

async function createBlackout(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.holiday_blackouts (city, zone, service_id, blackout_date, reason, policy_override, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.city || null, data.zone || null, data.serviceId || null, data.blackoutDate, data.reason, data.policyOverride || null, data.createdBy || 'admin']
  );
  return res.rows[0];
}

// -------------------------------------------------------------------------
// Packages, Benefits, Package Add-ons, Pricing Rules
// -------------------------------------------------------------------------
async function findAllPackages({ status = null, mainServiceId = null, vehicleSegment = null, limit = 100, offset = 0 } = {}, client = null) {
  const runner = client || db;
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
  if (mainServiceId) { params.push(mainServiceId); conditions.push(`p.main_service_id = $${params.length}`); }
  if (vehicleSegment) { params.push(vehicleSegment); conditions.push(`(p.vehicle_segment IS NULL OR p.vehicle_segment = $${params.length})`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  const res = await runner.query(
    `SELECT p.*, s.service_code AS main_service_code, s.name AS main_service_name, s.service_category_id
     FROM public.packages p
     JOIN public.services s ON p.main_service_id = s.id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

async function findPackageById(id, client = null) {
  const runner = client || db;
  const pkgRes = await runner.query(
    `SELECT p.*, s.service_code AS main_service_code, s.name AS main_service_name, s.service_category_id
     FROM public.packages p
     JOIN public.services s ON p.main_service_id = s.id
     WHERE p.id = $1 LIMIT 1`,
    [id]
  );
  const pkg = pkgRes.rows[0];
  if (!pkg) return null;

  const [benefits, addons, pricingRules] = await Promise.all([
    runner.query(
      `SELECT pb.*, s.service_code, s.name AS service_name, s.service_model, sf.code AS frequency_code, sf.frequency_type
       FROM public.package_benefits pb
       JOIN public.services s ON pb.service_id = s.id
       LEFT JOIN public.service_frequencies sf ON pb.frequency_id = sf.id
       WHERE pb.package_id = $1 ORDER BY pb.created_at ASC`,
      [id]
    ),
    runner.query(
      `SELECT pa.*, a.addon_code, a.name AS addon_name, a.execution_mode, a.default_price, sf.code AS frequency_code
       FROM public.package_addons pa
       JOIN public.addons a ON pa.addon_id = a.id
       LEFT JOIN public.service_frequencies sf ON pa.frequency_id = sf.id
       WHERE pa.package_id = $1 ORDER BY pa.created_at ASC`,
      [id]
    ),
    runner.query(
      `SELECT * FROM public.package_pricing_rules WHERE package_id = $1 AND is_active = TRUE ORDER BY created_at ASC`,
      [id]
    )
  ]);

  return {
    ...pkg,
    benefits: benefits.rows,
    addons: addons.rows,
    pricingRules: pricingRules.rows
  };
}

async function findPackageByCode(code, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT id FROM public.packages WHERE UPPER(package_code) = UPPER($1) LIMIT 1', [code]);
  if (!res.rows[0]) return null;
  return findPackageById(res.rows[0].id, runner);
}

async function createPackage(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.packages (
       package_code, name, tagline, details, main_service_id,
       validity_value, validity_unit, vehicle_segment, city_zone_eligibility,
       pricing_model, base_price, pricing_config, effective_from, effective_to,
       status, version, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16)
     RETURNING *`,
    [
      data.packageCode,
      data.name,
      data.tagline || null,
      data.details || null,
      data.mainServiceId,
      data.validityValue || 30,
      data.validityUnit || 'days',
      data.vehicleSegment || null,
      JSON.stringify(data.cityZoneEligibility || { all_cities: true, cities: [], zones: [] }),
      data.pricingModel || 'fixed',
      data.basePrice ?? 0,
      JSON.stringify(data.pricingConfig || {}),
      data.effectiveFrom || null,
      data.effectiveTo || null,
      data.status || 'draft',
      data.createdBy || 'admin'
    ]
  );
  return res.rows[0];
}

async function updatePackage(id, patch, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.packages SET
       name = COALESCE($2, name),
       tagline = COALESCE($3, tagline),
       details = COALESCE($4, details),
       validity_value = COALESCE($5, validity_value),
       validity_unit = COALESCE($6, validity_unit),
       vehicle_segment = COALESCE($7, vehicle_segment),
       city_zone_eligibility = COALESCE($8, city_zone_eligibility),
       pricing_model = COALESCE($9, pricing_model),
       base_price = COALESCE($10, base_price),
       pricing_config = COALESCE($11, pricing_config),
       effective_from = COALESCE($12, effective_from),
       effective_to = COALESCE($13, effective_to),
       status = COALESCE($14, status),
       version = version + 1,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.tagline ?? null,
      patch.details ?? null,
      patch.validityValue ?? null,
      patch.validityUnit ?? null,
      patch.vehicleSegment ?? null,
      patch.cityZoneEligibility ? JSON.stringify(patch.cityZoneEligibility) : null,
      patch.pricingModel ?? null,
      patch.basePrice ?? null,
      patch.pricingConfig ? JSON.stringify(patch.pricingConfig) : null,
      patch.effectiveFrom ?? null,
      patch.effectiveTo ?? null,
      patch.status ?? null
    ]
  );
  return res.rows[0] || null;
}

async function addPackageBenefit(packageId, b, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.package_benefits (package_id, service_id, benefit_type, quantity, frequency_id, validity_override_days, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [packageId, b.serviceId, b.benefitType || 'primary', b.quantity || 1, b.frequencyId || null, b.validityOverrideDays || null, JSON.stringify(b.config || {})]
  );
  return res.rows[0];
}

async function addPackageAddon(packageId, a, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.package_addons (package_id, addon_id, quantity, frequency_id, is_included, override_price, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (package_id, addon_id) DO UPDATE SET
       quantity = EXCLUDED.quantity,
       frequency_id = EXCLUDED.frequency_id,
       is_included = EXCLUDED.is_included,
       override_price = EXCLUDED.override_price,
       config = EXCLUDED.config
     RETURNING *`,
    [packageId, a.addonId, a.quantity || 1, a.frequencyId || null, a.isIncluded !== false, a.overridePrice ?? null, JSON.stringify(a.config || {})]
  );
  return res.rows[0];
}

async function addPackagePricingRule(packageId, r, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.package_pricing_rules (
       package_id, city, zone, vehicle_segment, pricing_model, unit_price, min_charge, pricing_bands, effective_from, effective_to, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      packageId,
      r.city || null,
      r.zone || null,
      r.vehicleSegment || null,
      r.pricingModel || 'fixed',
      r.unitPrice ?? 0,
      r.minCharge ?? 0,
      JSON.stringify(r.pricingBands || []),
      r.effectiveFrom || null,
      r.effectiveTo || null,
      r.isActive !== false
    ]
  );
  return res.rows[0];
}

// -------------------------------------------------------------------------
// Add-ons
// -------------------------------------------------------------------------
async function findAllAddons({ status = null, serviceId = null } = {}, client = null) {
  const runner = client || db;
  if (serviceId) {
    const res = await runner.query(
      `SELECT a.*,
              COALESCE(ARRAY_AGG(asa_all.service_id) FILTER (WHERE asa_all.service_id IS NOT NULL), '{}') AS applicable_service_ids
       FROM public.addons a
       JOIN public.addon_service_applicability asa ON a.id = asa.addon_id
       LEFT JOIN public.addon_service_applicability asa_all ON a.id = asa_all.addon_id
       WHERE asa.service_id = $1 ${status ? 'AND a.status = $2' : ''}
       GROUP BY a.id
       ORDER BY a.created_at ASC`,
      status ? [serviceId, status] : [serviceId]
    );
    return res.rows;
  }
  const res = await runner.query(
    `SELECT a.*,
            COALESCE(ARRAY_AGG(asa.service_id) FILTER (WHERE asa.service_id IS NOT NULL), '{}') AS applicable_service_ids
     FROM public.addons a
     LEFT JOIN public.addon_service_applicability asa ON a.id = asa.addon_id
     ${status ? 'WHERE a.status = $1' : ''}
     GROUP BY a.id
     ORDER BY a.created_at ASC`,
    status ? [status] : []
  );
  return res.rows;
}

async function findAddonById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT a.*,
            COALESCE(ARRAY_AGG(asa.service_id) FILTER (WHERE asa.service_id IS NOT NULL), '{}') AS applicable_service_ids
     FROM public.addons a
     LEFT JOIN public.addon_service_applicability asa ON a.id = asa.addon_id
     WHERE a.id = $1
     GROUP BY a.id
     LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findAddonByCode(code, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT a.*,
            COALESCE(ARRAY_AGG(asa.service_id) FILTER (WHERE asa.service_id IS NOT NULL), '{}') AS applicable_service_ids
     FROM public.addons a
     LEFT JOIN public.addon_service_applicability asa ON a.id = asa.addon_id
     WHERE UPPER(a.addon_code) = UPPER($1)
     GROUP BY a.id
     LIMIT 1`,
    [code]
  );
  return res.rows[0] || null;
}

async function createAddon(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.addons (
       addon_code, name, tagline, details, pricing_model, default_price, pricing_config,
       default_quantity, frequency_id, validity_days, is_optional, execution_mode,
       required_staff_capability, checklist_requirements, proof_requirements,
       expected_duration_minutes, city_zone_applicability, status, version, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1,$19)
     RETURNING *`,
    [
      data.addonCode,
      data.name,
      data.tagline || null,
      data.details || null,
      data.pricingModel || 'fixed',
      data.defaultPrice ?? 0,
      JSON.stringify(data.pricingConfig || {}),
      data.defaultQuantity || 1,
      data.frequencyId || null,
      data.validityDays || null,
      data.isOptional !== false,
      data.executionMode || 'during_main_service',
      data.requiredStaffCapability || null,
      JSON.stringify(data.checklistRequirements || []),
      JSON.stringify(data.proofRequirements || { before_min: 0, after_min: 0, required: false }),
      data.expectedDurationMinutes || 15,
      JSON.stringify(data.cityZoneApplicability || { all_cities: true, cities: [], zones: [] }),
      data.status || 'draft',
      data.createdBy || 'admin'
    ]
  );
  const addon = res.rows[0];
  if (Array.isArray(data.applicableServiceIds)) {
    for (const sId of data.applicableServiceIds) {
      await runner.query(
        `INSERT INTO public.addon_service_applicability (addon_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [addon.id, sId]
      );
    }
  }
  return addon;
}

async function updateAddon(id, patch, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.addons SET
       name = COALESCE($2, name),
       tagline = COALESCE($3, tagline),
       details = COALESCE($4, details),
       pricing_model = COALESCE($5, pricing_model),
       default_price = COALESCE($6, default_price),
       pricing_config = COALESCE($7, pricing_config),
       default_quantity = COALESCE($8, default_quantity),
       validity_days = COALESCE($9, validity_days),
       is_optional = COALESCE($10, is_optional),
       execution_mode = COALESCE($11, execution_mode),
       required_staff_capability = COALESCE($12, required_staff_capability),
       checklist_requirements = COALESCE($13, checklist_requirements),
       proof_requirements = COALESCE($14, proof_requirements),
       expected_duration_minutes = COALESCE($15, expected_duration_minutes),
       city_zone_applicability = COALESCE($16, city_zone_applicability),
       status = COALESCE($17, status),
       version = version + 1,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.tagline ?? null,
      patch.details ?? null,
      patch.pricingModel ?? null,
      patch.defaultPrice ?? null,
      patch.pricingConfig ? JSON.stringify(patch.pricingConfig) : null,
      patch.defaultQuantity ?? null,
      patch.validityDays !== undefined ? patch.validityDays : null,
      patch.isOptional !== undefined ? patch.isOptional : null,
      patch.executionMode ?? null,
      patch.requiredStaffCapability ?? null,
      patch.checklistRequirements ? JSON.stringify(patch.checklistRequirements) : null,
      patch.proofRequirements ? JSON.stringify(patch.proofRequirements) : null,
      patch.expectedDurationMinutes ?? null,
      patch.cityZoneApplicability ? JSON.stringify(patch.cityZoneApplicability) : null,
      patch.status ?? null
    ]
  );
  const updated = res.rows[0] || null;
  if (updated && Array.isArray(patch.applicableServiceIds)) {
    await runner.query(`DELETE FROM public.addon_service_applicability WHERE addon_id = $1`, [id]);
    for (const sId of patch.applicableServiceIds) {
      await runner.query(
        `INSERT INTO public.addon_service_applicability (addon_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, sId]
      );
    }
  }
  return updated ? findAddonById(id, runner) : null;
}

// -------------------------------------------------------------------------
// Marketing Tags & Media Assets
// -------------------------------------------------------------------------
async function findAllMarketingTags({ activeOnly = false } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.marketing_tags ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY display_priority ASC, created_at ASC`
  );
  return res.rows;
}

async function createMarketingTag(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.marketing_tags (code, label, display_color, icon_identifier, display_priority, is_active, valid_from, valid_to, entity_applicability)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.code,
      data.label,
      data.displayColor || '#1976D2',
      data.iconIdentifier || null,
      data.displayPriority ?? 100,
      data.isActive !== false,
      data.validFrom || null,
      data.validTo || null,
      JSON.stringify(data.entityApplicability || ['service', 'package', 'addon'])
    ]
  );
  return res.rows[0];
}

async function attachMarketingTag(entityType, entityId, tagId, sortOrder = 1, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.entity_marketing_tags (entity_type, entity_id, tag_id, sort_order)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (entity_type, entity_id, tag_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
     RETURNING *`,
    [entityType, entityId, tagId, sortOrder]
  );
  return res.rows[0];
}

async function findEntityMarketingTags(entityType, entityId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT mt.*, emt.sort_order
     FROM public.entity_marketing_tags emt
     JOIN public.marketing_tags mt ON emt.tag_id = mt.id
     WHERE emt.entity_type = $1 AND emt.entity_id = $2
     ORDER BY emt.sort_order ASC, mt.display_priority ASC`,
    [entityType, entityId]
  );
  return res.rows;
}

async function upsertMediaAsset(data, client = null) {
  const runner = client || db;
  if (data.mediaSlot === 'square_1_1' || data.mediaSlot === 'rectangle_4_3') {
    await runner.query(
      `DELETE FROM public.media_assets WHERE entity_type = $1 AND entity_id = $2 AND media_slot = $3`,
      [data.entityType, data.entityId, data.mediaSlot]
    );
  }
  const res = await runner.query(
    `INSERT INTO public.media_assets (
       entity_type, entity_id, media_slot, storage_url, storage_key,
       alt_text, width, height, mime_type, visibility, sort_order, uploaded_by, version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      data.entityType,
      data.entityId,
      data.mediaSlot,
      data.storageUrl,
      data.storageKey || null,
      data.altText || null,
      data.width || null,
      data.height || null,
      data.mimeType || null,
      data.visibility || 'public',
      data.sortOrder || 1,
      data.uploadedBy || 'admin',
      data.version || 1
    ]
  );
  return res.rows[0];
}

async function deleteMediaAsset(id, client = null) {
  const runner = client || db;
  const res = await runner.query('DELETE FROM public.media_assets WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

async function findMediaAssets(entityType, entityId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.media_assets WHERE entity_type = $1 AND entity_id = $2 ORDER BY sort_order ASC, created_at DESC`,
    [entityType, entityId]
  );
  return res.rows;
}

module.exports = {
  findAllServices,
  findServiceById,
  findServiceByCode,
  createService,
  updateService,
  findAllFrequencies,
  findFrequencyById,
  findFrequencyByCode,
  createFrequency,
  findBlackouts,
  createBlackout,
  findAllPackages,
  findPackageById,
  findPackageByCode,
  createPackage,
  updatePackage,
  addPackageBenefit,
  addPackageAddon,
  addPackagePricingRule,
  findAllAddons,
  findAddonById,
  findAddonByCode,
  createAddon,
  updateAddon,
  findAllMarketingTags,
  createMarketingTag,
  attachMarketingTag,
  findEntityMarketingTags,
  upsertMediaAsset,
  deleteMediaAsset,
  findMediaAssets
};
