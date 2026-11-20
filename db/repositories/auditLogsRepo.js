/**
 * Repository for table: audit_logs
 * Note: Immutable log protected by prevent_audit_logs_mutation trigger
 */
const db = require('../index');

async function logChange({
  entityType,
  entityId,
  action,
  changedBy,
  beforeState = null,
  afterState = null,
  ipAddress = null
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.audit_logs (
       entity_type, entity_id, action, changed_by, before_state, after_state, ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      entityType,
      String(entityId),
      action,
      changedBy,
      beforeState ? (typeof beforeState === 'string' ? beforeState : JSON.stringify(beforeState)) : null,
      afterState ? (typeof afterState === 'string' ? afterState : JSON.stringify(afterState)) : null,
      ipAddress
    ]
  );
  return res.rows[0];
}

async function queryLogs({
  entityType = null,
  entityId = null,
  limit = 100,
  offset = 0,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }
  if (entityId) {
    params.push(String(entityId));
    conditions.push(`entity_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT * FROM public.audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await runner.query(sql, params);
  return res.rows;
}

module.exports = {
  logChange,
  queryLogs
};
