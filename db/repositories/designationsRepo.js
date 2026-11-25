/**
 * Repository for table: staff_designations
 * Manages Staff Designations, Operational Authority flags, and Hierarchy levels
 */
const db = require('../index');

function isNeonConfigured() {
  const isConf = typeof db.isConfigured === 'function' ? db.isConfigured() : (process.env.DB_PROVIDER === 'neon_postgresql');
  return Boolean(isConf && process.env.NODE_ENV !== 'test' && !process.env.USE_LOCAL_STAFF_TEST);
}

// In-memory local fallback store seeded with canonical core designations
const INITIAL_CORE_DESIGNATIONS = [
  {
    id: 'cleaner',
    name: 'Cleaner',
    name_hi: 'सफाईकर्मी',
    description: 'Frontline cleaning operative responsible for doorstep vehicle cleaning and daily route execution.',
    hierarchy_level: 1,
    is_supervisory: false,
    authorities: {
      canViewTeam: false,
      canAssignRoutes: false,
      canReorderSequences: false,
      canSuperviseJobs: false,
      canManageStaff: false,
      canApproveExceptions: false
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'service_specialist',
    name: 'Service Specialist',
    name_hi: 'सेवा विशेषज्ञ',
    description: 'Technical field specialist executing on-demand pressure washes, solar panel cleanings, and automotive detailing jobs.',
    hierarchy_level: 1,
    is_supervisory: false,
    authorities: {
      canViewTeam: false,
      canAssignRoutes: false,
      canReorderSequences: false,
      canSuperviseJobs: false,
      canManageStaff: false,
      canApproveExceptions: false
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'senior_cleaner',
    name: 'Senior Cleaner',
    name_hi: 'वरिष्ठ सफाईकर्मी',
    description: 'Experienced operative handling primary route clusters and mentoring junior operatives.',
    hierarchy_level: 2,
    is_supervisory: false,
    authorities: {
      canViewTeam: false,
      canAssignRoutes: false,
      canReorderSequences: false,
      canSuperviseJobs: false,
      canManageStaff: false,
      canApproveExceptions: false
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'team_leader',
    name: 'Team Leader',
    name_hi: 'टीम लीडर',
    description: 'Lead operative coordinating a squad of cleaners or specialists, monitoring daily progress and team adherence.',
    hierarchy_level: 3,
    is_supervisory: true,
    authorities: {
      canViewTeam: true,
      canAssignRoutes: false,
      canReorderSequences: false,
      canSuperviseJobs: true,
      canManageStaff: false,
      canApproveExceptions: false
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'supervisor',
    name: 'Field Supervisor',
    name_hi: 'फील्ड सुपरवाइजर',
    description: 'Field supervisor with operational authority to manage teams, reorder route stop sequences, inspect work quality, and verify non-completion exceptions.',
    hierarchy_level: 4,
    is_supervisory: true,
    authorities: {
      canViewTeam: true,
      canAssignRoutes: true,
      canReorderSequences: true,
      canSuperviseJobs: true,
      canManageStaff: false,
      canApproveExceptions: true
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'zone_manager',
    name: 'Zone Manager',
    name_hi: 'ज़ोन प्रबंधक',
    description: 'Operational manager with authority over a geographic zone, managing routes, team allocations, staff performance, and route creation.',
    hierarchy_level: 5,
    is_supervisory: true,
    authorities: {
      canViewTeam: true,
      canAssignRoutes: true,
      canReorderSequences: true,
      canSuperviseJobs: true,
      canManageStaff: true,
      canApproveExceptions: true
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'operations_manager',
    name: 'Operations Manager',
    name_hi: 'परिचालन प्रबंधक',
    description: 'Senior operational leader overseeing all field zones, cross-zone routing, designation oversight, and broad operational policies.',
    hierarchy_level: 6,
    is_supervisory: true,
    authorities: {
      canViewTeam: true,
      canAssignRoutes: true,
      canReorderSequences: true,
      canSuperviseJobs: true,
      canManageStaff: true,
      canApproveExceptions: true
    },
    is_system_protected: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

let localDesignationsStore = JSON.parse(JSON.stringify(INITIAL_CORE_DESIGNATIONS));

function __resetLocalStores() {
  localDesignationsStore = JSON.parse(JSON.stringify(INITIAL_CORE_DESIGNATIONS));
}

function normalizeDesignationRow(row) {
  if (!row) return null;
  let auths = row.authorities;
  if (typeof auths === 'string') {
    try {
      auths = JSON.parse(auths);
    } catch (_) {
      auths = {};
    }
  }
  return {
    id: row.id,
    name: row.name,
    nameHi: row.name_hi || null,
    name_hi: row.name_hi || null,
    description: row.description || '',
    hierarchyLevel: parseInt(row.hierarchy_level, 10) || 1,
    hierarchy_level: parseInt(row.hierarchy_level, 10) || 1,
    isSupervisory: Boolean(row.is_supervisory),
    is_supervisory: Boolean(row.is_supervisory),
    authorities: auths || {},
    isSystemProtected: Boolean(row.is_system_protected),
    is_system_protected: Boolean(row.is_system_protected),
    isActive: Boolean(row.is_active),
    is_active: Boolean(row.is_active),
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

async function findAll({ includeInactive = false, client = null } = {}) {
  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `SELECT * FROM public.staff_designations 
       ${includeInactive ? '' : 'WHERE is_active = TRUE'} 
       ORDER BY hierarchy_level ASC, name ASC`
    );
    return res.rows.map(normalizeDesignationRow);
  }

  // Local fallback
  return localDesignationsStore
    .filter(d => includeInactive || d.is_active)
    .sort((a, b) => a.hierarchy_level - b.hierarchy_level || a.name.localeCompare(b.name))
    .map(normalizeDesignationRow);
}

async function findById(id, client = null) {
  if (!id) return null;
  const cleanId = String(id).trim().toLowerCase();

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      'SELECT * FROM public.staff_designations WHERE id = $1 LIMIT 1',
      [cleanId]
    );
    return res.rows[0] ? normalizeDesignationRow(res.rows[0]) : null;
  }

  // Local fallback
  const found = localDesignationsStore.find(d => d.id === cleanId);
  return found ? normalizeDesignationRow(found) : null;
}

async function createDesignation({
  id,
  name,
  nameHi = null,
  description = null,
  hierarchyLevel = 1,
  isSupervisory = false,
  authorities = {},
  isSystemProtected = false,
  isActive = true
}, client = null) {
  if (!id || !name) {
    throw new Error('Designation ID and Name are required.');
  }

  const cleanId = String(id).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const cleanName = String(name).trim();
  const level = Math.max(1, Math.min(10, parseInt(hierarchyLevel, 10) || 1));
  const authObj = (typeof authorities === 'object' && authorities !== null) ? authorities : {};

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `INSERT INTO public.staff_designations (
         id, name, name_hi, description, hierarchy_level, is_supervisory, authorities, is_system_protected, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [cleanId, cleanName, nameHi, description, level, Boolean(isSupervisory), JSON.stringify(authObj), Boolean(isSystemProtected), Boolean(isActive)]
    );
    return normalizeDesignationRow(res.rows[0]);
  }

  // Local fallback
  const existing = localDesignationsStore.find(d => d.id === cleanId);
  if (existing) {
    throw new Error(`Designation with ID '${cleanId}' already exists.`);
  }

  const newRow = {
    id: cleanId,
    name: cleanName,
    name_hi: nameHi || null,
    description: description || '',
    hierarchy_level: level,
    is_supervisory: Boolean(isSupervisory),
    authorities: authObj,
    is_system_protected: Boolean(isSystemProtected),
    is_active: Boolean(isActive),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localDesignationsStore.push(newRow);
  return normalizeDesignationRow(newRow);
}

async function updateDesignation(id, updateData = {}, client = null) {
  if (!id) throw new Error('Designation ID is required.');
  const cleanId = String(id).trim().toLowerCase();

  const existing = await findById(cleanId, client);
  if (!existing) {
    throw new Error(`Designation '${cleanId}' not found.`);
  }

  // System-protected designations cannot have their core system identifier altered
  const name = updateData.name !== undefined ? String(updateData.name).trim() : existing.name;
  const nameHi = updateData.nameHi !== undefined ? updateData.nameHi : (updateData.name_hi !== undefined ? updateData.name_hi : existing.nameHi);
  const description = updateData.description !== undefined ? updateData.description : existing.description;
  const level = updateData.hierarchyLevel !== undefined ? parseInt(updateData.hierarchyLevel, 10) : (updateData.hierarchy_level !== undefined ? parseInt(updateData.hierarchy_level, 10) : existing.hierarchyLevel);
  const isSupervisory = updateData.isSupervisory !== undefined ? Boolean(updateData.isSupervisory) : (updateData.is_supervisory !== undefined ? Boolean(updateData.is_supervisory) : existing.isSupervisory);
  const authorities = updateData.authorities !== undefined ? updateData.authorities : existing.authorities;
  const isActive = updateData.isActive !== undefined ? Boolean(updateData.isActive) : (updateData.is_active !== undefined ? Boolean(updateData.is_active) : existing.isActive);

  if (isNeonConfigured()) {
    const runner = client || db;
    const res = await runner.query(
      `UPDATE public.staff_designations
       SET name = $1,
           name_hi = $2,
           description = $3,
           hierarchy_level = $4,
           is_supervisory = $5,
           authorities = $6,
           is_active = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, nameHi, description, level, isSupervisory, JSON.stringify(authorities), isActive, cleanId]
    );
    return normalizeDesignationRow(res.rows[0]);
  }

  // Local fallback
  const localIdx = localDesignationsStore.findIndex(d => d.id === cleanId);
  if (localIdx >= 0) {
    localDesignationsStore[localIdx] = {
      ...localDesignationsStore[localIdx],
      name,
      name_hi: nameHi,
      description,
      hierarchy_level: level,
      is_supervisory: isSupervisory,
      authorities,
      is_active: isActive,
      updated_at: new Date().toISOString()
    };
    return normalizeDesignationRow(localDesignationsStore[localIdx]);
  }
  return null;
}

async function deleteDesignation(id, client = null) {
  if (!id) throw new Error('Designation ID is required.');
  const cleanId = String(id).trim().toLowerCase();

  const existing = await findById(cleanId, client);
  if (!existing) {
    throw new Error(`Designation '${cleanId}' not found.`);
  }

  if (existing.isSystemProtected) {
    throw new Error(`Cannot delete system-protected designation '${existing.name}' (${cleanId}).`);
  }

  if (isNeonConfigured()) {
    const runner = client || db;
    // Check if any active staff member is assigned
    const checkStaff = await runner.query(
      'SELECT COUNT(*) FROM public.staff WHERE designation_id = $1 AND deleted_at IS NULL',
      [cleanId]
    );
    const count = parseInt(checkStaff.rows[0].count, 10);
    if (count > 0) {
      throw new Error(`Cannot delete designation '${existing.name}': It is currently assigned to ${count} staff member(s). Please reassign staff first.`);
    }

    await runner.query('DELETE FROM public.staff_designations WHERE id = $1', [cleanId]);
    return { success: true, deletedId: cleanId };
  }

  // Local fallback: Check if any active staff member is assigned in local staff store
  try {
    const staffRepo = require('./staffRepo');
    if (staffRepo && typeof staffRepo.findAll === 'function') {
      const allStaff = await staffRepo.findAll({ client });
      const assignedStaff = (allStaff || []).filter(s => {
        const sDesig = (s.designation_id || s.designationId || '').toString().toLowerCase().trim();
        return sDesig === cleanId && s.is_active;
      });
      if (assignedStaff.length > 0) {
        throw new Error(`Cannot delete designation '${existing.name}': It is currently assigned to ${assignedStaff.length} active staff member(s). Please reassign staff first.`);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('assigned to')) throw err;
  }

  localDesignationsStore = localDesignationsStore.filter(d => d.id !== cleanId);
  return { success: true, deletedId: cleanId };
}

module.exports = {
  findAll,
  findById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  normalizeDesignationRow,
  __resetLocalStores
};
