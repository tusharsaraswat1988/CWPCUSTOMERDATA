/**
 * =========================================================================
 * CWP Detailers & Motors - Staff Service Capability & Work-Type Service
 * Module: Task 01.8 — Staff Service Capability & Work-Type Classification
 *
 * Core Work Types:
 * 1. 'dcc_only': Daily Cleaning Only
 *    - Authorized strictly for Daily Car Cleaning (DCC) and routes.
 *    - Rejects all non-DCC service jobs.
 * 2. 'dcc_and_services': Daily Cleaning + Other Jobs
 *    - Authorized for DCC and routes.
 *    - Authorized only for specifically enabled service capabilities.
 * 3. 'services_only': Other Jobs Only
 *    - Strictly excluded from DCC and routes.
 *    - Authorized only for explicitly enabled service capabilities (at least one).
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');
const serviceCatalog = require('./serviceCatalog');

const WORK_TYPES = {
  DCC_ONLY: 'dcc_only',
  DCC_AND_SERVICES: 'dcc_and_services',
  SERVICES_ONLY: 'services_only'
};

const VALID_WORK_TYPES = Object.values(WORK_TYPES);

const DCC_CAPABILITY = 'daily_car_cleaning';

/**
 * Returns all canonical service capability IDs registered in the system
 */
function getCanonicalCapabilityIds() {
  const cats = serviceCatalog.getAllCategories ? serviceCatalog.getAllCategories() : Object.values(serviceCatalog.SERVICE_CATEGORIES || {});
  return cats.map(c => c.id);
}

/**
 * Check whether a service category ID is valid and supported
 */
function isValidCapabilityId(catId) {
  if (!catId) return false;
  const canonicalIds = getCanonicalCapabilityIds();
  return canonicalIds.includes(String(catId).toLowerCase().trim());
}

/**
 * Validates and normalizes Work Type and Capability Combination
 * Rejects invalid, contradictory, or unknown capability combinations
 */
function validateCapabilityCombination(workType, capabilities = []) {
  if (!workType) {
    throw new Error(`Work type is required. Must be one of: ${VALID_WORK_TYPES.join(', ')}`);
  }

  const normWorkType = String(workType).toLowerCase().trim();
  if (!VALID_WORK_TYPES.includes(normWorkType)) {
    throw new Error(`Invalid work type '${workType}'. Must be one of: ${VALID_WORK_TYPES.join(', ')}`);
  }

  const rawCaps = Array.isArray(capabilities) ? capabilities : (capabilities ? [capabilities] : []);
  const canonicalIds = getCanonicalCapabilityIds();
  const normalizedCaps = [];

  for (const raw of rawCaps) {
    if (!raw) continue;
    const catStr = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    let resolved = null;
    if (canonicalIds.includes(catStr)) {
      resolved = catStr;
    } else {
      const candidate = serviceCatalog.resolveCanonicalCategory(catStr);
      // Guard against resolveCanonicalCategory fallback defaulting everything to daily_car_cleaning
      if (candidate === 'daily_car_cleaning') {
        if (catStr === 'daily_car_cleaning' || catStr.includes('daily') || catStr.includes('dcc')) {
          resolved = 'daily_car_cleaning';
        }
      } else if (canonicalIds.includes(candidate)) {
        resolved = candidate;
      }
    }

    if (!resolved || !canonicalIds.includes(resolved)) {
      throw new Error(`Unknown or unsupported service capability: '${raw}'`);
    }
    if (!normalizedCaps.includes(resolved)) {
      normalizedCaps.push(resolved);
    }
  }

  // Work-type specific rules
  if (normWorkType === WORK_TYPES.DCC_ONLY) {
    // 1. DCC must be enabled
    if (!normalizedCaps.includes(DCC_CAPABILITY)) {
      normalizedCaps.push(DCC_CAPABILITY);
    }
    // 2. Other services must be disabled
    const nonDccCaps = normalizedCaps.filter(c => c !== DCC_CAPABILITY);
    if (nonDccCaps.length > 0) {
      throw new Error(`Staff classified as 'dcc_only' cannot have non-DCC service capabilities enabled (${nonDccCaps.join(', ')}).`);
    }
    return {
      isValid: true,
      workType: WORK_TYPES.DCC_ONLY,
      serviceCapabilities: [DCC_CAPABILITY]
    };
  }

  if (normWorkType === WORK_TYPES.DCC_AND_SERVICES) {
    // 1. DCC must be enabled
    if (!normalizedCaps.includes(DCC_CAPABILITY)) {
      normalizedCaps.push(DCC_CAPABILITY);
    }
    // 2. At least one other service capability must be enabled
    const nonDccCaps = normalizedCaps.filter(c => c !== DCC_CAPABILITY);
    if (nonDccCaps.length === 0) {
      throw new Error(`Staff classified as 'dcc_and_services' must have at least one additional service capability enabled (e.g. car_washing, solar_cleaning, interior_detailing, exterior_detailing).`);
    }
    return {
      isValid: true,
      workType: WORK_TYPES.DCC_AND_SERVICES,
      serviceCapabilities: normalizedCaps
    };
  }

  if (normWorkType === WORK_TYPES.SERVICES_ONLY) {
    // 1. DCC must be disabled
    if (normalizedCaps.includes(DCC_CAPABILITY)) {
      throw new Error(`Staff classified as 'services_only' cannot have Daily Car Cleaning capability.`);
    }
    // 2. At least one non-DCC service capability must be enabled
    if (normalizedCaps.length === 0) {
      throw new Error(`Staff classified as 'services_only' must have at least one service capability enabled.`);
    }
    return {
      isValid: true,
      workType: WORK_TYPES.SERVICES_ONLY,
      serviceCapabilities: normalizedCaps
    };
  }

  throw new Error(`Unsupported work type: '${workType}'`);
}

/**
 * Normalizes staff capabilities from an arbitrary staff record
 * Defaults to 'dcc_only' with ['daily_car_cleaning'] if missing or invalid
 */
function getStaffEffectiveCapabilities(staff) {
  if (!staff) {
    return {
      workType: WORK_TYPES.DCC_ONLY,
      serviceCapabilities: [DCC_CAPABILITY]
    };
  }

  let workType = staff.work_type || staff.workType || WORK_TYPES.DCC_ONLY;
  let caps = staff.service_capabilities || staff.serviceCapabilities || null;

  if (typeof caps === 'string') {
    try {
      caps = JSON.parse(caps);
    } catch (e) {
      caps = null;
    }
  }

  if (!Array.isArray(caps) || caps.length === 0) {
    caps = workType === WORK_TYPES.SERVICES_ONLY ? [] : [DCC_CAPABILITY];
  }

  try {
    const validated = validateCapabilityCombination(workType, caps);
    return {
      workType: validated.workType,
      serviceCapabilities: validated.serviceCapabilities
    };
  } catch (err) {
    // Fallback safe normalization
    if (workType === WORK_TYPES.SERVICES_ONLY) {
      const nonDcc = caps.filter(c => c !== DCC_CAPABILITY);
      return {
        workType: WORK_TYPES.SERVICES_ONLY,
        serviceCapabilities: nonDcc.length > 0 ? nonDcc : ['car_washing']
      };
    }
    return {
      workType: WORK_TYPES.DCC_ONLY,
      serviceCapabilities: [DCC_CAPABILITY]
    };
  }
}

/**
 * Checks whether staff is authorized for Daily Car Cleaning (DCC)
 */
function isDccEligible(staff) {
  if (!staff) return false;
  const isAct = staff.is_active !== undefined ? Boolean(staff.is_active) : (staff.active !== undefined ? Boolean(staff.active) : true);
  if (!isAct) return false;

  const eff = getStaffEffectiveCapabilities(staff);
  return eff.workType !== WORK_TYPES.SERVICES_ONLY && eff.serviceCapabilities.includes(DCC_CAPABILITY);
}

/**
 * Checks whether staff has capability for a specific canonical service category
 */
function hasServiceCapability(staff, serviceCategoryId) {
  if (!staff || !serviceCategoryId) return false;
  const isAct = staff.is_active !== undefined ? Boolean(staff.is_active) : (staff.active !== undefined ? Boolean(staff.active) : true);
  if (!isAct) return false;

  const resolved = serviceCatalog.resolveCanonicalCategory(serviceCategoryId);
  const eff = getStaffEffectiveCapabilities(staff);

  if (resolved === DCC_CAPABILITY) {
    return isDccEligible(staff);
  }

  if (eff.workType === WORK_TYPES.DCC_ONLY) {
    return false;
  }

  return eff.serviceCapabilities.includes(resolved);
}

/**
 * Checks for operational conflicts when Admin attempts to modify a staff member's capabilities
 * Prevents orphaning active routes or active service jobs
 */
async function checkCapabilityChangeConflicts(staffId, newWorkType, newCapabilities = [], client = null) {
  if (!staffId) return { hasConflict: false };

  const norm = validateCapabilityCombination(newWorkType, newCapabilities);
  const newHasDcc = norm.serviceCapabilities.includes(DCC_CAPABILITY);

  // 1. Conflict Check: Removing DCC capability when staff has an active route
  if (!newHasDcc) {
    if (repos.routes && typeof repos.routes.findRouteByAssignedStaffId === 'function') {
      const activeRoute = await repos.routes.findRouteByAssignedStaffId(staffId, client);
      if (activeRoute && activeRoute.status === 'active') {
        throw new Error(
          `Cannot change staff work-type to '${newWorkType}': Staff member is currently assigned to active Route '${activeRoute.route_code}'. Please reassign or unassign the route before removing Daily Car Cleaning capability.`
        );
      }
    }
  }

  // 2. Conflict Check: Removing service capability when staff has active/in_progress service jobs
  if (repos.serviceJobs && typeof repos.serviceJobs.findDispatchedForStaff === 'function') {
    try {
      const activeJobs = await repos.serviceJobs.findDispatchedForStaff(staffId, client);
      const pendingJobs = (activeJobs || []).filter(j => j.status === 'assigned' || j.status === 'in_progress');
      for (const job of pendingJobs) {
        const jobCat = serviceCatalog.resolveCanonicalCategory(job.service_category_id);
        if (!norm.serviceCapabilities.includes(jobCat)) {
          const catMeta = serviceCatalog.getCategory(jobCat);
          const catLabel = catMeta ? catMeta.name : jobCat;
          throw new Error(
            `Cannot remove capability '${catLabel}': Staff member currently has active ${job.status} job(s) in this category. Please reassign or complete those jobs before removing this capability.`
          );
        }
      }
    } catch (err) {
      if (!err.message.includes('Cannot remove capability')) {
        // Non-fatal if table not present in test mode
      } else {
        throw err;
      }
    }
  }

  return { hasConflict: false, validated: norm };
}

module.exports = {
  WORK_TYPES,
  VALID_WORK_TYPES,
  DCC_CAPABILITY,
  getCanonicalCapabilityIds,
  isValidCapabilityId,
  validateCapabilityCombination,
  getStaffEffectiveCapabilities,
  isDccEligible,
  hasServiceCapability,
  checkCapabilityChangeConflicts
};
