/**
 * Repository for table: customers (BRD v1.0)
 */

'use strict';

const db = require('../index');

function normalizeLeadNotesInput(leadNotes, existingNotes = null) {
  if (leadNotes === undefined) return undefined;
  if (leadNotes === null || leadNotes === '') return null;
  if (Array.isArray(leadNotes)) return leadNotes;
  if (typeof leadNotes === 'object') return [leadNotes];
  const text = String(leadNotes).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  const base = Array.isArray(existingNotes) ? [...existingNotes] : [];
  base.push({ text, created_at: new Date().toISOString() });
  return base;
}

async function findAll({
  search = '',
  isActive = null,
  includeDeleted = false,
  isLead = null,
  limit = 200,
  offset = 0,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (isActive !== null && isActive !== undefined) {
    params.push(Boolean(isActive));
    conditions.push(`is_active = $${params.length}`);
  }

  if (isLead !== null && isLead !== undefined) {
    params.push(Boolean(isLead));
    conditions.push(`is_lead = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const pIdx = params.length;
    conditions.push(`(
      LOWER(name) LIKE $${pIdx} OR
      COALESCE(phone, '') LIKE $${pIdx} OR
      LOWER(customer_code) LIKE $${pIdx} OR
      LOWER(COALESCE(name_hi, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(email, '')) LIKE $${pIdx}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT * FROM public.customers
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await runner.query(sql, params);
  return res.rows;
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.customers WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findByCode(customerCode, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.customers WHERE UPPER(customer_code) = UPPER($1) AND deleted_at IS NULL LIMIT 1',
    [String(customerCode || '').trim()]
  );
  return res.rows[0] || null;
}

async function findByPhone(phone, client = null) {
  const runner = client || db;
  if (!phone || !String(phone).trim()) return [];
  const res = await runner.query(
    'SELECT * FROM public.customers WHERE phone = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
    [String(phone).trim()]
  );
  return res.rows;
}

async function findOneByPhone(phone, client = null) {
  const rows = await findByPhone(phone, client);
  return rows[0] || null;
}

async function createCustomer({
  customerCode,
  name,
  nameHi = null,
  phone = null,
  email = null,
  notes = null,
  isActive = true,
  isLead = false,
  leadStage = null,
  leadStatus = null,
  leadSource = null,
  leadNotes = null,
  interestedService = null
}, client = null) {
  const runner = client || db;
  const code = (customerCode || (`${isLead ? 'LEAD' : 'CUST'}_${Date.now()}_${Math.floor(Math.random() * 1000)}`)).trim();
  const effectiveLeadStage = leadStage !== undefined ? leadStage : (leadStatus !== undefined ? leadStatus : (isLead ? 'open' : null));
  const normalizedLeadNotes = normalizeLeadNotesInput(leadNotes);

  const res = await runner.query(
    `INSERT INTO public.customers (
       customer_code, name, name_hi, phone, email, is_active,
       is_lead, lead_stage, lead_source, interested_service, notes, lead_notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING *`,
    [
      code,
      String(name || '').trim(),
      nameHi ? String(nameHi).trim() : null,
      phone ? String(phone).trim() : null,
      email ? String(email).trim() : null,
      Boolean(isActive),
      Boolean(isLead),
      effectiveLeadStage ? String(effectiveLeadStage).trim() : null,
      leadSource ? String(leadSource).trim() : null,
      interestedService ? String(interestedService).trim() : null,
      notes ? String(notes).trim() : null,
      normalizedLeadNotes ? JSON.stringify(normalizedLeadNotes) : null
    ]
  );
  return res.rows[0];
}

async function updateCustomer(id, {
  name,
  nameHi,
  phone,
  email,
  notes,
  isActive,
  isLead,
  leadStage,
  leadStatus,
  leadSource,
  leadNotes,
  interestedService
} = {}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (name !== undefined) {
    params.push(name ? String(name).trim() : '');
    updates.push(`name = $${params.length}`);
  }
  if (nameHi !== undefined) {
    params.push(nameHi ? String(nameHi).trim() : null);
    updates.push(`name_hi = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone ? String(phone).trim() : null);
    updates.push(`phone = $${params.length}`);
  }
  if (email !== undefined) {
    params.push(email ? String(email).trim() : null);
    updates.push(`email = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes ? String(notes).trim() : null);
    updates.push(`notes = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  if (isLead !== undefined) {
    params.push(Boolean(isLead));
    updates.push(`is_lead = $${params.length}`);
  }
  const effStage = leadStage !== undefined ? leadStage : leadStatus;
  if (effStage !== undefined) {
    params.push(effStage ? String(effStage).trim() : null);
    updates.push(`lead_stage = $${params.length}`);
  }
  if (leadSource !== undefined) {
    params.push(leadSource ? String(leadSource).trim() : null);
    updates.push(`lead_source = $${params.length}`);
  }
  if (leadNotes !== undefined) {
    const norm = normalizeLeadNotesInput(leadNotes);
    params.push(norm ? JSON.stringify(norm) : null);
    updates.push(`lead_notes = $${params.length}::jsonb`);
  }
  if (interestedService !== undefined) {
    params.push(interestedService ? String(interestedService).trim() : null);
    updates.push(`interested_service = $${params.length}`);
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.customers
     SET ${updates.join(', ')}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function convertLeadToCustomer(id, { phone = null } = {}, client = null) {
  const runner = client || db;
  const params = [id];
  let phoneClause = '';
  if (phone) {
    params.push(String(phone).trim());
    phoneClause = `, phone = $${params.length}`;
  }
  const res = await runner.query(
    `UPDATE public.customers
     SET is_lead = FALSE,
         lead_stage = 'converted'
         ${phoneClause},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function appendLeadNote(id, noteText, client = null) {
  const runner = client || db;
  const custRes = await runner.query(
    'SELECT notes, lead_notes FROM public.customers WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  if (!custRes.rows[0]) return null;

  const cleanText = String(noteText || '').trim();
  const existingLeadNotes = Array.isArray(custRes.rows[0].lead_notes) ? custRes.rows[0].lead_notes : [];
  const nextLeadNotes = [...existingLeadNotes, { text: cleanText, created_at: new Date().toISOString() }];
  const existingNotes = custRes.rows[0].notes || '';
  const nextNotes = existingNotes ? `${existingNotes}\n${cleanText}` : cleanText;

  const res = await runner.query(
    `UPDATE public.customers
     SET lead_notes = $2::jsonb,
         notes = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, JSON.stringify(nextLeadNotes), nextNotes]
  );
  return res.rows[0] || null;
}

async function toggleActive(id, isActive, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.customers
     SET is_active = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, Boolean(isActive)]
  );
  return res.rows[0] || null;
}

async function softDelete(id, { deletedBy = 'admin', deletionReason = 'Administrative removal' } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.customers
     SET deleted_at = CURRENT_TIMESTAMP,
         deleted_by = $2,
         deletion_reason = $3,
         is_active = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, deletedBy, deletionReason]
  );
  return res.rows[0] || null;
}

async function countCustomers({ includeLeads = false, client = null } = {}) {
  const runner = client || db;
  const leadFilter = includeLeads ? '' : 'AND is_lead = FALSE';
  const res = await runner.query(
    `SELECT count(*)::int AS count FROM public.customers WHERE deleted_at IS NULL ${leadFilter}`
  );
  return res.rows[0].count;
}

module.exports = {
  findAll,
  findById,
  findByCode,
  findByPhone,
  findOneByPhone,
  createCustomer,
  updateCustomer,
  convertLeadToCustomer,
  appendLeadNote,
  toggleActive,
  softDelete,
  countCustomers
};
