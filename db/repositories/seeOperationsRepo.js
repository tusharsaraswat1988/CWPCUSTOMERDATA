/**
 * Repository for SEE Staff Types, Overrides, Job Add-ons, Executions, and Solar Verifications
 */
const db = require('../index');

// -------------------------------------------------------------------------
// Staff Types & Capability Overrides
// -------------------------------------------------------------------------
async function findAllStaffTypes({ activeOnly = true } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.staff_types ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY created_at ASC`
  );
  return res.rows;
}

async function findStaffTypeById(id, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.staff_types WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

async function findStaffTypeByCode(code, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.staff_types WHERE UPPER(code) = UPPER($1) LIMIT 1', [code]);
  return res.rows[0] || null;
}

async function createStaffType(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.staff_types (
       code, name, description, default_service_capabilities,
       default_addon_capabilities, equipment_requirements, operational_restrictions, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.code,
      data.name,
      data.description || null,
      JSON.stringify(data.defaultServiceCapabilities || []),
      JSON.stringify(data.defaultAddonCapabilities || []),
      JSON.stringify(data.equipmentRequirements || []),
      JSON.stringify(data.operationalRestrictions || {}),
      data.isActive !== false
    ]
  );
  return res.rows[0];
}

async function createCapabilityOverride(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.staff_capability_overrides (
       staff_id, capability_type, target_id, is_allowed, reason, authorized_by, expires_at, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`,
    [data.staffId, data.capabilityType, data.targetId, Boolean(data.isAllowed), data.reason, data.authorizedBy, data.expiresAt || null]
  );
  return res.rows[0];
}

async function findActiveOverridesForStaff(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.staff_capability_overrides
     WHERE staff_id = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC`,
    [staffId]
  );
  return res.rows;
}

// -------------------------------------------------------------------------
// Job Add-ons, Executions, Solar Verifications
// -------------------------------------------------------------------------
async function createJobAddon(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_job_addons (
       job_id, addon_id, addon_name_snapshot, execution_mode, entitlement_account_id, is_required, status
     ) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
    [data.jobId, data.addonId, data.addonNameSnapshot, data.executionMode || 'during_main_service', data.entitlementAccountId || null, data.isRequired !== false]
  );
  return res.rows[0];
}

async function findJobAddons(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sja.*, a.addon_code, a.checklist_requirements, a.proof_requirements
     FROM public.service_job_addons sja
     JOIN public.addons a ON sja.addon_id = a.id
     WHERE sja.job_id = $1
     ORDER BY sja.created_at ASC`,
    [jobId]
  );
  return res.rows;
}

async function updateJobAddonStatus(id, patch, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.service_job_addons SET
       status = $2::varchar,
       checklist_results = COALESCE($3, checklist_results),
       proof_urls = COALESCE($4, proof_urls),
       completed_by = COALESCE($5, completed_by),
       completed_at = CASE WHEN $2::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
       exception_reason = COALESCE($6, exception_reason),
       approved_by = COALESCE($7, approved_by),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [
      id,
      patch.status,
      patch.checklistResults ? JSON.stringify(patch.checklistResults) : null,
      patch.proofUrls ? JSON.stringify(patch.proofUrls) : null,
      patch.completedBy || null,
      patch.exceptionReason || null,
      patch.approvedBy || null
    ]
  );
  return res.rows[0] || null;
}

async function createExecution(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.service_executions (
       job_id, staff_id, client_mutation_id, started_at, ended_at, actual_quantity,
       measurements, checklist_results, proof_photos, customer_confirmation,
       outcome, exception_reason, approval_reference
     ) VALUES ($1,$2,$3,COALESCE($4, CURRENT_TIMESTAMP),$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      data.jobId,
      data.staffId || null,
      data.clientMutationId || null,
      data.startedAt || null,
      data.endedAt || null,
      data.actualQuantity ?? null,
      JSON.stringify(data.measurements || {}),
      JSON.stringify(data.checklistResults || []),
      JSON.stringify(data.proofPhotos || { before: [], after: [] }),
      JSON.stringify(data.customerConfirmation || {}),
      data.outcome || 'in_progress',
      data.exceptionReason || null,
      data.approvalReference || null
    ]
  );
  return res.rows[0];
}

async function findExecutionsByJob(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_executions WHERE job_id = $1 ORDER BY created_at DESC`,
    [jobId]
  );
  return res.rows;
}

async function findExecutionByClientMutationId(clientMutationId, client = null) {
  if (!clientMutationId) return null;
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_executions WHERE client_mutation_id = $1 LIMIT 1`,
    [clientMutationId]
  );
  return res.rows[0] || null;
}

async function findTerminalExecutionByJobId(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT * FROM public.service_executions
     WHERE job_id = $1
       AND outcome IN ('completed', 'partial_exception', 'failed', 'no_show', 'unable_to_complete')
     ORDER BY created_at DESC
     LIMIT 1`,
    [jobId]
  );
  return res.rows[0] || null;
}

async function upsertSolarVerification(data, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.solar_verifications (
       job_id, estimated_panel_count, system_capacity_kw, estimate_method, is_estimate,
       actual_panel_count, verified_by_staff_id, discrepancy_count, discrepancy_reason,
       approval_status, approved_by, approved_at, final_serviced_quantity
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (job_id) DO UPDATE SET
       actual_panel_count = COALESCE(EXCLUDED.actual_panel_count, public.solar_verifications.actual_panel_count),
       verified_by_staff_id = COALESCE(EXCLUDED.verified_by_staff_id, public.solar_verifications.verified_by_staff_id),
       discrepancy_count = EXCLUDED.discrepancy_count,
       discrepancy_reason = COALESCE(EXCLUDED.discrepancy_reason, public.solar_verifications.discrepancy_reason),
       approval_status = EXCLUDED.approval_status,
       approved_by = COALESCE(EXCLUDED.approved_by, public.solar_verifications.approved_by),
       approved_at = COALESCE(EXCLUDED.approved_at, public.solar_verifications.approved_at),
       final_serviced_quantity = COALESCE(EXCLUDED.final_serviced_quantity, public.solar_verifications.final_serviced_quantity),
       is_estimate = EXCLUDED.is_estimate,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      data.jobId,
      data.estimatedPanelCount ?? null,
      data.systemCapacityKw ?? null,
      data.estimateMethod || 'customer_declared',
      data.isEstimate !== false,
      data.actualPanelCount ?? null,
      data.verifiedByStaffId || null,
      data.discrepancyCount ?? 0,
      data.discrepancyReason || null,
      data.approvalStatus || 'not_required',
      data.approvedBy || null,
      data.approvedAt || null,
      data.finalServicedQuantity ?? null
    ]
  );
  return res.rows[0];
}

async function findSolarVerificationByJob(jobId, client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT * FROM public.solar_verifications WHERE job_id = $1 LIMIT 1', [jobId]);
  return res.rows[0] || null;
}

module.exports = {
  findAllStaffTypes,
  findStaffTypeById,
  findStaffTypeByCode,
  createStaffType,
  createCapabilityOverride,
  findActiveOverridesForStaff,
  createJobAddon,
  findJobAddons,
  updateJobAddonStatus,
  createExecution,
  findExecutionsByJob,
  findExecutionByClientMutationId,
  findTerminalExecutionByJobId,
  upsertSolarVerification,
  findSolarVerificationByJob
};
