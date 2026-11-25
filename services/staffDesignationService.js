/**
 * =========================================================================
 * CWP Detailers & Motors - Staff Designation, Hierarchy & Authority Service
 * Module: Task 01.9 — Staff Designation, Hierarchy & Operational Authority
 *
 * Single Source of Truth for:
 * 1. Organizational Designations & Hierarchy Levels
 * 2. Operational Authorities & Permissions Matrix
 * 3. Reporting Hierarchy, Manager Chains & Cycle Detection
 * 4. Independent Dimension B (Decoupled from Service Capability)
 * =========================================================================
 */

'use strict';

const repos = require('../db/repositories/index');

const CORE_DESIGNATIONS = {
  CLEANER: 'cleaner',
  SERVICE_SPECIALIST: 'service_specialist',
  SENIOR_CLEANER: 'senior_cleaner',
  TEAM_LEADER: 'team_leader',
  SUPERVISOR: 'supervisor',
  ZONE_MANAGER: 'zone_manager',
  OPERATIONS_MANAGER: 'operations_manager'
};

const AUTHORITY_KEYS = {
  CAN_VIEW_TEAM: 'canViewTeam',
  CAN_ASSIGN_ROUTES: 'canAssignRoutes',
  CAN_REORDER_SEQUENCES: 'canReorderSequences',
  CAN_SUPERVISE_JOBS: 'canSuperviseJobs',
  CAN_MANAGE_STAFF: 'canManageStaff',
  CAN_APPROVE_EXCEPTIONS: 'canApproveExceptions'
};

/**
 * Normalizes authorities object ensuring boolean integrity
 */
function normalizeAuthorities(authObj = {}) {
  const result = {
    [AUTHORITY_KEYS.CAN_VIEW_TEAM]: false,
    [AUTHORITY_KEYS.CAN_ASSIGN_ROUTES]: false,
    [AUTHORITY_KEYS.CAN_REORDER_SEQUENCES]: false,
    [AUTHORITY_KEYS.CAN_SUPERVISE_JOBS]: false,
    [AUTHORITY_KEYS.CAN_MANAGE_STAFF]: false,
    [AUTHORITY_KEYS.CAN_APPROVE_EXCEPTIONS]: false
  };

  if (!authObj || typeof authObj !== 'object') return result;

  for (const [k, v] of Object.entries(authObj)) {
    if (Object.values(AUTHORITY_KEYS).includes(k)) {
      result[k] = Boolean(v);
    }
  }
  return result;
}

/**
 * Returns all designations with assigned staff counts
 */
async function getAllDesignations({ includeInactive = false } = {}) {
  const designations = await repos.designations.findAll({ includeInactive });
  const allStaff = await repos.staff.findAll({ includeInactive: true });

  const countMap = {};
  for (const s of allStaff) {
    const dId = s.designation_id || s.designationId || 'cleaner';
    countMap[dId] = (countMap[dId] || 0) + 1;
  }

  return designations.map(d => ({
    ...d,
    assignedStaffCount: countMap[d.id] || 0
  }));
}

/**
 * Resolves a designation by ID (falls back to cleaner if missing or invalid)
 */
async function getDesignationById(designationId) {
  if (!designationId) return null;
  const cleanId = String(designationId).trim().toLowerCase();
  const d = await repos.designations.findById(cleanId);
  return d || null;
}

/**
 * Validates and saves (creates or updates) a designation
 */
async function saveDesignation(data = {}, actor = 'admin') {
  const {
    id,
    name,
    nameHi = null,
    name_hi = null,
    description = '',
    hierarchyLevel = 1,
    hierarchy_level = null,
    isSupervisory = false,
    is_supervisory = null,
    authorities = {},
    isActive = true,
    is_active = null
  } = data;

  if (!name || !String(name).trim()) {
    throw new Error('Designation name is required.');
  }

  const cleanName = String(name).trim();
  const cleanNameHi = nameHi || name_hi || null;
  const cleanDesc = description ? String(description).trim() : '';
  const level = parseInt(hierarchy_level != null ? hierarchy_level : hierarchyLevel, 10) || 1;
  if (level < 1 || level > 10) {
    throw new Error('Hierarchy level must be an integer between 1 and 10.');
  }

  const supervisory = Boolean(is_supervisory != null ? is_supervisory : isSupervisory);
  const active = Boolean(is_active != null ? is_active : isActive);
  const normalizedAuths = normalizeAuthorities(authorities);

  // If level is >= 3, default isSupervisory to true if not explicitly set
  const effectiveSupervisory = supervisory || (level >= 3);

  let cleanId = id ? String(id).trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  if (!cleanId) {
    cleanId = cleanName.toLowerCase().replace(/[\s-]+/g, '_');
  }

  const existing = await repos.designations.findById(cleanId);

  if (existing) {
    // Update existing designation
    const updated = await repos.designations.updateDesignation(cleanId, {
      name: cleanName,
      nameHi: cleanNameHi,
      description: cleanDesc,
      hierarchyLevel: level,
      isSupervisory: effectiveSupervisory,
      authorities: normalizedAuths,
      isActive: active
    });

    if (repos.auditLogs && typeof repos.auditLogs.logChange === 'function') {
      try {
        await repos.auditLogs.logChange({
          entityType: 'staff_designation',
          entityId: cleanId,
          action: 'update_designation',
          changedBy: actor,
          beforeState: existing,
          afterState: updated
        });
      } catch (_) {}
    }

    return {
      success: true,
      designation: updated,
      message: `Designation '${cleanName}' updated successfully.`
    };
  }

  // Create new custom designation
  const created = await repos.designations.createDesignation({
    id: cleanId,
    name: cleanName,
    nameHi: cleanNameHi,
    description: cleanDesc,
    hierarchyLevel: level,
    isSupervisory: effectiveSupervisory,
    authorities: normalizedAuths,
    isSystemProtected: false,
    isActive: active
  });

  if (repos.auditLogs && typeof repos.auditLogs.logChange === 'function') {
    try {
      await repos.auditLogs.logChange({
        entityType: 'staff_designation',
        entityId: cleanId,
        action: 'create_designation',
        changedBy: actor,
        afterState: created
      });
    } catch (_) {}
  }

  return {
    success: true,
    designation: created,
    message: `Designation '${cleanName}' created successfully.`
  };
}

/**
 * Deletes a custom designation with system protection guards
 */
async function deleteDesignation(designationId, actor = 'admin') {
  if (!designationId) {
    throw new Error('Designation ID is required to delete.');
  }
  const cleanId = String(designationId).trim().toLowerCase();
  const existing = await repos.designations.findById(cleanId);
  if (!existing) {
    throw new Error(`Designation '${cleanId}' not found.`);
  }

  if (existing.isSystemProtected) {
    throw new Error(`Cannot delete system-protected designation '${existing.name}' (${cleanId}).`);
  }

  const res = await repos.designations.deleteDesignation(cleanId);

  if (repos.auditLogs && typeof repos.auditLogs.logChange === 'function') {
    try {
      await repos.auditLogs.logChange({
        entityType: 'staff_designation',
        entityId: cleanId,
        action: 'delete_designation',
        changedBy: actor,
        beforeState: existing
      });
    } catch (_) {}
  }

  return {
    success: true,
    deletedId: cleanId,
    message: `Designation '${existing.name}' deleted successfully.`
  };
}

/**
 * Checks whether a staff member holds a specific operational authority flag
 */
async function hasAuthority(staffOrDesignationId, authorityKey) {
  if (!staffOrDesignationId || !authorityKey) return false;

  let designationId = null;
  if (typeof staffOrDesignationId === 'object' && staffOrDesignationId !== null) {
    designationId = staffOrDesignationId.designation_id || staffOrDesignationId.designationId || staffOrDesignationId.designation;
  } else if (typeof staffOrDesignationId === 'string') {
    designationId = staffOrDesignationId;
  }

  if (!designationId) return false;

  const desig = await getDesignationById(designationId);
  if (!desig || !desig.isActive) return false;

  const auths = desig.authorities || {};
  return Boolean(auths[authorityKey]);
}

/**
 * Throws Forbidden error if staff lacks authority
 */
async function assertAuthority(staffOrDesignationId, authorityKey, operationDescription = 'this operation') {
  const authorized = await hasAuthority(staffOrDesignationId, authorityKey);
  if (!authorized) {
    throw new Error(`Authority denied: Staff designation does not have operational authority '${authorityKey}' required for ${operationDescription}.`);
  }
  return true;
}

/**
 * Validates a prospective reporting relationship:
 * 1. Self-reporting prohibited (A cannot report to A)
 * 2. Deactivated manager prohibited
 * 3. Junior cannot supervise senior (manager hierarchyLevel >= employee hierarchyLevel)
 * 4. Cycle detection (A -> B -> A prohibited)
 */
async function validateReportingRelationship(staffId, reportsToId, client = null, proposedSubordinateDesigId = null) {
  // Clearing manager is always valid
  if (!reportsToId) {
    return { isValid: true };
  }

  const cleanStaffId = staffId ? String(staffId).trim() : null;
  const cleanManagerId = String(reportsToId).trim();

  // Self-reporting check (by ID or Code string equality)
  if (cleanStaffId && (cleanStaffId.toLowerCase() === cleanManagerId.toLowerCase())) {
    throw new Error('A staff member cannot report to themselves or supervise their own work.');
  }

  // 1. Fetch prospective manager
  let manager = await repos.staff.findById(cleanManagerId, client);
  if (!manager) {
    manager = await repos.staff.findByStaffCode(cleanManagerId, client);
  }
  if (!manager) {
    const allStaff = await repos.staff.findAll({ client });
    manager = (allStaff || []).find(s => s.id === cleanManagerId || (s.staff_code && s.staff_code.toUpperCase() === cleanManagerId.toUpperCase())) || null;
  }

  if (!manager) {
    throw new Error(`Reporting manager '${cleanManagerId}' not found.`);
  }

  // Self-reporting check against resolved manager entity
  if (cleanStaffId && (cleanStaffId === manager.id || cleanStaffId.toUpperCase() === (manager.staff_code || '').toUpperCase())) {
    throw new Error('A staff member cannot report to themselves or supervise their own work.');
  }

  if (!manager.is_active) {
    throw new Error(`Cannot assign deactivated staff member '${manager.name}' as a reporting manager/supervisor.`);
  }

  // 2. Manager designation and hierarchy check
  const managerDesigId = manager.designation_id || manager.designationId || 'cleaner';
  const managerDesig = await getDesignationById(managerDesigId);

  // If subordinate exists or proposed designation provided, check hierarchy level ordering
  let subordinate = null;
  if (cleanStaffId) {
    subordinate = await repos.staff.findById(cleanStaffId, client);
    if (!subordinate) {
      subordinate = await repos.staff.findByStaffCode(cleanStaffId, client);
    }
  }

  const subDesigId = proposedSubordinateDesigId || (subordinate ? (subordinate.designation_id || subordinate.designationId) : null) || 'cleaner';
  const subDesig = await getDesignationById(subDesigId);

  const subLevel = subDesig ? subDesig.hierarchyLevel : 1;
  const mgrLevel = managerDesig ? managerDesig.hierarchyLevel : 1;

  if (mgrLevel < subLevel) {
    const subName = subordinate ? subordinate.name : 'Subordinate';
    throw new Error(
      `Hierarchy conflict: Staff member '${manager.name}' (${managerDesig ? managerDesig.name : 'Level ' + mgrLevel}) has a lower hierarchy level than subordinate '${subName}' (${subDesig ? subDesig.name : 'Level ' + subLevel}). A manager must be at an equal or higher organizational level.`
    );
  }

  // 3. Cycle Detection (Traverse up the reporting chain from manager)
  if (cleanStaffId || subordinate) {
    const visited = new Set();
    if (cleanStaffId) visited.add(cleanStaffId.toLowerCase());
    if (subordinate) {
      if (subordinate.id) visited.add(String(subordinate.id).toLowerCase());
      if (subordinate.staff_code) visited.add(String(subordinate.staff_code).toLowerCase());
    }

    let current = manager;
    let depth = 0;
    const maxDepth = 25; // prevent infinite loops

    while (current && depth < maxDepth) {
      depth++;
      if (current.id && visited.has(String(current.id).toLowerCase())) {
        throw new Error(
          `Circular reporting hierarchy detected: Assigning '${manager.name}' as manager creates a closed supervisory loop with staff member '${subordinate ? subordinate.name : cleanStaffId}'.`
        );
      }
      if (current.staff_code && visited.has(String(current.staff_code).toLowerCase())) {
        throw new Error(
          `Circular reporting hierarchy detected: Assigning '${manager.name}' as manager creates a closed supervisory loop with staff member '${subordinate ? subordinate.name : cleanStaffId}'.`
        );
      }

      const currentMgrId = current.reports_to_id || current.reportsToId;
      if (!currentMgrId) break;

      if (visited.has(String(currentMgrId).toLowerCase())) {
        throw new Error(
          `Circular reporting hierarchy detected: Assigning '${manager.name}' as manager creates a closed supervisory loop with staff member '${subordinate ? subordinate.name : cleanStaffId}'.`
        );
      }
      visited.add(String(current.id || '').toLowerCase());
      if (current.staff_code) visited.add(String(current.staff_code).toLowerCase());

      let nextMgr = await repos.staff.findById(currentMgrId, client);
      if (!nextMgr) {
        nextMgr = await repos.staff.findByStaffCode(currentMgrId, client);
      }
      current = nextMgr;
    }
  }

  return {
    isValid: true,
    manager: {
      id: manager.id,
      staffCode: manager.staff_code,
      name: manager.name,
      designationId: managerDesigId,
      designationName: managerDesig ? managerDesig.name : managerDesigId
    }
  };
}

/**
 * Returns direct subordinates reporting to a given staff member
 */
async function getDirectSubordinates(managerId, client = null) {
  if (!managerId) return [];
  const subs = await repos.staff.findSubordinates(managerId, client);
  return subs;
}

/**
 * Traverses upwards to return the reporting breadcrumbs
 */
async function getFullReportingChain(staffId, client = null) {
  if (!staffId) return [];
  const chain = [];
  const visited = new Set();

  let currentId = staffId;
  let depth = 0;

  while (currentId && depth < 20) {
    depth++;
    if (visited.has(currentId)) break;
    visited.add(currentId);

    let staff = await repos.staff.findById(currentId, client);
    if (!staff) {
      staff = await repos.staff.findByStaffCode(currentId, client);
    }
    if (!staff) break;

    const mgrId = staff.reports_to_id || staff.reportsToId;
    if (!mgrId) break;

    let mgr = await repos.staff.findById(mgrId, client);
    if (!mgr) {
      mgr = await repos.staff.findByStaffCode(mgrId, client);
    }
    if (!mgr) break;

    const desig = await getDesignationById(mgr.designation_id || mgr.designationId);
    chain.push({
      id: mgr.id,
      staffCode: mgr.staff_code,
      name: mgr.name,
      designationId: mgr.designation_id || mgr.designationId,
      designationName: desig ? desig.name : 'Cleaner',
      hierarchyLevel: desig ? desig.hierarchyLevel : 1
    });

    currentId = mgr.id;
  }

  return chain;
}

module.exports = {
  CORE_DESIGNATIONS,
  AUTHORITY_KEYS,
  normalizeAuthorities,
  getAllDesignations,
  getDesignationById,
  saveDesignation,
  deleteDesignation,
  hasAuthority,
  assertAuthority,
  validateReportingRelationship,
  getDirectSubordinates,
  getFullReportingChain
};
