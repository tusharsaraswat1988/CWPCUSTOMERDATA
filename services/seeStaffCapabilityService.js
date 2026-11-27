/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Phase 6: Staff Type & Capability Engine
 *
 * - Staff Types act as capability templates.
 * - Creating staff with a Staff Type auto-wires default capabilities.
 * - Individual overrides require authorization & create audit records.
 * - Assignment eligibility checks: active status, service capability,
 *   add-on capability, city, zone, workload, equipment, overrides.
 * - Changing Staff Type does NOT silently remove already-assigned jobs.
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');

async function listStaffTypes(activeOnly = true) {
  return repos.seeOperations.findAllStaffTypes({ activeOnly });
}

async function createStaffType(data, actor = 'admin') {
  if (!data.code || !data.name) {
    throw new Error('Staff type code and name are required.');
  }
  const existing = await repos.seeOperations.findStaffTypeByCode(data.code.trim());
  if (existing) {
    throw new Error(`Duplicate staff type code '${data.code}'.`);
  }

  return db.withTransaction(async (client) => {
    const st = await repos.seeOperations.createStaffType({
      ...data,
      code: data.code.trim().toUpperCase()
    }, client);

    await repos.auditLogs.logChange({
      entityType: 'staff_type',
      entityId: st.id,
      action: 'create',
      changedBy: actor,
      afterState: st
    }, client);
    return st;
  });
}

/**
 * Resolves default capabilities from a Staff Type (by ID or code)
 */
async function resolveDefaultCapabilitiesForStaffType(staffTypeIdOrCode) {
  if (!staffTypeIdOrCode) return null;
  let st = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffTypeIdOrCode)) {
    st = await repos.seeOperations.findStaffTypeById(staffTypeIdOrCode);
  }
  if (!st) {
    st = await repos.seeOperations.findStaffTypeByCode(staffTypeIdOrCode);
  }
  if (!st) throw new Error(`Staff type '${staffTypeIdOrCode}' not found.`);

  return {
    staffTypeId: st.id,
    staffTypeCode: st.code,
    defaultServiceCapabilities: st.default_service_capabilities || [],
    defaultAddonCapabilities: st.default_addon_capabilities || [],
    equipmentRequirements: st.equipment_requirements || [],
    operationalRestrictions: st.operational_restrictions || {}
  };
}

/**
 * Assign or change a staff member's Staff Type.
 * Preserves all already-assigned jobs (does not silently unassign).
 */
async function assignStaffType(staffId, staffTypeIdOrCode, actor = 'admin') {
  const staff = await repos.staff.findById(staffId);
  if (!staff) throw new Error(`Staff '${staffId}' not found.`);

  const defaults = await resolveDefaultCapabilitiesForStaffType(staffTypeIdOrCode);

  return db.withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.staff SET staff_type_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [staffId, defaults.staffTypeId]
    );
    await repos.auditLogs.logChange({
      entityType: 'staff',
      entityId: staffId,
      action: 'assign_staff_type',
      changedBy: actor,
      beforeState: { staff_type_id: staff.staff_type_id },
      afterState: { staff_type_id: defaults.staffTypeId, staff_type_code: defaults.staffTypeCode }
    }, client);
    return {
      staff: res.rows[0],
      appliedDefaults: defaults
    };
  });
}

/**
 * Grant or revoke an individual capability override (requires authorization + audit record)
 */
async function grantCapabilityOverride({
  staffId,
  capabilityType,
  targetId,
  isAllowed,
  reason,
  authorizedBy,
  expiresAt = null
}) {
  if (!staffId || !capabilityType || !targetId) {
    throw new Error('staffId, capabilityType, and targetId are required.');
  }
  if (!['service', 'addon'].includes(capabilityType)) {
    throw new Error(`Invalid capabilityType '${capabilityType}'.`);
  }
  if (!reason || !String(reason).trim()) {
    throw new Error('Authorization reason is required for capability override.');
  }
  if (!authorizedBy || !String(authorizedBy).trim()) {
    throw new Error('authorizedBy is required for capability override.');
  }

  return db.withTransaction(async (client) => {
    const override = await repos.seeOperations.createCapabilityOverride({
      staffId,
      capabilityType,
      targetId,
      isAllowed: Boolean(isAllowed),
      reason: String(reason).trim(),
      authorizedBy: String(authorizedBy).trim(),
      expiresAt
    }, client);

    await repos.auditLogs.logChange({
      entityType: 'staff_capability_override',
      entityId: override.id,
      action: isAllowed ? 'grant_override' : 'revoke_override',
      changedBy: authorizedBy,
      afterState: override
    }, client);
    return override;
  });
}

/**
 * Evaluate full server-side assignment eligibility for a staff member against a job/service/add-ons
 */
async function evaluateStaffEligibility(staffId, {
  serviceId = null,
  serviceCode = null,
  serviceCategoryId = null,
  addonIds = [],
  city = null,
  zone = null,
  scheduledDate = null,
  requiredEquipment = []
} = {}) {
  const staff = await repos.staff.findById(staffId);
  if (!staff) {
    return { eligible: false, reasons: [`Staff '${staffId}' not found.`] };
  }

  const reasons = [];

  // 1. Active status
  if (!staff.is_active) {
    reasons.push(`Staff '${staff.name}' is inactive.`);
  }

  // 2. City & Zone restrictions
  const allowedCities = Array.isArray(staff.allowed_cities) ? staff.allowed_cities : [];
  if (city && allowedCities.length > 0 && !allowedCities.map(c => c.toLowerCase()).includes(city.toLowerCase())) {
    reasons.push(`Staff '${staff.name}' is not authorized for city '${city}'.`);
  }
  const allowedZones = Array.isArray(staff.allowed_zones) ? staff.allowed_zones : [];
  if (zone && allowedZones.length > 0 && !allowedZones.map(z => z.toLowerCase()).includes(zone.toLowerCase())) {
    reasons.push(`Staff '${staff.name}' is not authorized for zone '${zone}'.`);
  }

  // 3. Equipment requirements
  const staffEquip = Array.isArray(staff.equipment_available) ? staff.equipment_available.map(e => String(e).toLowerCase()) : [];
  if (Array.isArray(requiredEquipment) && requiredEquipment.length > 0 && staffEquip.length > 0) {
    for (const eq of requiredEquipment) {
      if (!staffEquip.includes(String(eq).toLowerCase())) {
        reasons.push(`Staff '${staff.name}' is missing required equipment '${eq}'.`);
      }
    }
  }

  // 4. Resolve Staff Type defaults & active overrides
  let typeSvcCaps = [];
  let typeAddonCaps = [];
  if (staff.staff_type_id) {
    const st = await repos.seeOperations.findStaffTypeById(staff.staff_type_id);
    if (st) {
      typeSvcCaps = Array.isArray(st.default_service_capabilities) ? st.default_service_capabilities : [];
      typeAddonCaps = Array.isArray(st.default_addon_capabilities) ? st.default_addon_capabilities : [];
    }
  }

  const overrides = await repos.seeOperations.findActiveOverridesForStaff(staff.id);
  const legacyCaps = Array.isArray(staff.service_capabilities) ? staff.service_capabilities : [];

  // 5. Service capability check
  if (serviceId || serviceCode || serviceCategoryId) {
    const svcOverride = serviceId ? overrides.find(o => o.capability_type === 'service' && o.target_id === serviceId) : null;
    if (svcOverride) {
      if (!svcOverride.is_allowed) {
        reasons.push(`Service capability explicitly revoked by override.`);
      }
    } else {
      const hasViaType = (serviceCode && typeSvcCaps.includes(serviceCode)) || (serviceCategoryId && typeSvcCaps.includes(serviceCategoryId));
      const hasViaLegacy = serviceCategoryId && legacyCaps.includes(serviceCategoryId);
      if (!hasViaType && !hasViaLegacy) {
        reasons.push(`Staff '${staff.name}' lacks capability for service '${serviceCode || serviceCategoryId || serviceId}'.`);
      }
    }
  }

  // 6. Add-on capability check
  for (const addonId of addonIds) {
    const addon = await repos.seeCatalogue.findAddonById(addonId);
    if (!addon) continue;
    const ov = overrides.find(o => o.capability_type === 'addon' && o.target_id === addonId);
    if (ov) {
      if (!ov.is_allowed) {
        reasons.push(`Add-on '${addon.name}' explicitly revoked by override.`);
      }
    } else if (typeAddonCaps.length > 0 && !typeAddonCaps.includes(addon.addon_code)) {
      reasons.push(`Staff '${staff.name}' lacks capability for add-on '${addon.name}'.`);
    }
  }

  // 7. Workload / max_daily_jobs check
  if (staff.max_daily_jobs && scheduledDate) {
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM public.staff_assignments sa
       JOIN public.service_jobs j ON sa.job_id = j.id
       WHERE sa.staff_id = $1 AND sa.is_active = TRUE
         AND j.scheduled_date = $2 AND j.deleted_at IS NULL
         AND j.status IN ('assigned', 'in_progress')`,
      [staff.id, scheduledDate]
    );
    const currentCount = countRes.rows[0]?.cnt || 0;
    if (currentCount >= staff.max_daily_jobs) {
      reasons.push(`Staff '${staff.name}' has reached max daily job limit (${staff.max_daily_jobs}) on ${scheduledDate}.`);
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    staffId: staff.id,
    staffName: staff.name
  };
}

module.exports = {
  listStaffTypes,
  createStaffType,
  resolveDefaultCapabilitiesForStaffType,
  assignStaffType,
  grantCapabilityOverride,
  evaluateStaffEligibility
};
