/**
 * Repository for table: customers
 */
const db = require('../index');

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
      phone LIKE $${pIdx} OR 
      LOWER(customer_code) LIKE $${pIdx} OR
      LOWER(COALESCE(name_hi, '')) LIKE $${pIdx} OR
      LOWER(COALESCE(address_hi, '')) LIKE $${pIdx}
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
    'SELECT * FROM public.customers WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function findByCode(customerCode, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.customers WHERE UPPER(customer_code) = UPPER($1) LIMIT 1',
    [customerCode.trim()]
  );
  return res.rows[0] || null;
}

async function findByPhone(phone, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'SELECT * FROM public.customers WHERE phone = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
    [phone.trim()]
  );
  return res.rows;
}

async function createCustomer({
  customerCode,
  name,
  phone,
  altPhone = null,
  email = null,
  notes = null,
  sourceSheetName = 'Daily Clean',
  sourceRowIndex = 0,
  isActive = true,
  nameHi = null,
  addressHi = null,
  secondaryAddressHi = null,
  isLead = false,
  leadStatus = 'open',
  leadNotes = null,
  interestedService = 'Daily Car Cleaning'
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.customers (
       customer_code, name, phone, alt_phone, email, notes, 
       source_sheet_name, source_row_index, is_active,
       name_hi, address_hi, secondary_address_hi,
       is_lead, lead_status, lead_notes, interested_service
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      customerCode.trim(),
      name.trim(),
      phone ? phone.trim() : null,
      altPhone ? altPhone.trim() : null,
      email ? email.trim() : null,
      notes ? notes.trim() : null,
      sourceSheetName,
      parseInt(sourceRowIndex, 10) || 0,
      Boolean(isActive),
      nameHi ? nameHi.trim() : null,
      addressHi ? addressHi.trim() : null,
      secondaryAddressHi ? secondaryAddressHi.trim() : null,
      Boolean(isLead),
      leadStatus ? leadStatus.trim() : 'open',
      leadNotes ? leadNotes.trim() : null,
      interestedService ? interestedService.trim() : 'Daily Car Cleaning'
    ]
  );
  return res.rows[0];
}

async function updateCustomer(id, {
  name,
  phone,
  altPhone,
  email,
  notes,
  isActive,
  nameHi,
  addressHi,
  secondaryAddressHi,
  isLead,
  leadStatus,
  leadNotes,
  interestedService
}, client = null) {
  const runner = client || db;
  const updates = [];
  const params = [id];

  if (name !== undefined) {
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone.trim());
    updates.push(`phone = $${params.length}`);
  }
  if (altPhone !== undefined) {
    params.push(altPhone ? altPhone.trim() : null);
    updates.push(`alt_phone = $${params.length}`);
  }
  if (email !== undefined) {
    params.push(email ? email.trim() : null);
    updates.push(`email = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes ? notes.trim() : null);
    updates.push(`notes = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(Boolean(isActive));
    updates.push(`is_active = $${params.length}`);
  }
  if (nameHi !== undefined) {
    params.push(nameHi ? nameHi.trim() : null);
    updates.push(`name_hi = $${params.length}`);
  }
  if (addressHi !== undefined) {
    params.push(addressHi ? addressHi.trim() : null);
    updates.push(`address_hi = $${params.length}`);
  }
  if (secondaryAddressHi !== undefined) {
    params.push(secondaryAddressHi ? secondaryAddressHi.trim() : null);
    updates.push(`secondary_address_hi = $${params.length}`);
  }
  if (isLead !== undefined) {
    params.push(Boolean(isLead));
    updates.push(`is_lead = $${params.length}`);
  }
  if (leadStatus !== undefined) {
    params.push(leadStatus ? leadStatus.trim() : 'open');
    updates.push(`lead_status = $${params.length}`);
  }
  if (leadNotes !== undefined) {
    params.push(leadNotes ? leadNotes.trim() : null);
    updates.push(`lead_notes = $${params.length}`);
  }
  if (interestedService !== undefined) {
    params.push(interestedService ? interestedService.trim() : null);
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

async function convertLeadToCustomer(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.customers
     SET is_lead = FALSE,
         lead_status = 'converted',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return res.rows[0] || null;
}

async function appendLeadNote(id, noteText, client = null) {
  const runner = client || db;
  // Fetch existing notes
  const custRes = await runner.query(
    'SELECT notes, lead_notes FROM public.customers WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  if (!custRes.rows[0]) return null;

  const existingLeadNotes = custRes.rows[0].lead_notes || '';
  const existingNotes = custRes.rows[0].notes || '';
  const newLeadNotes = existingLeadNotes ? `${existingLeadNotes}\n${noteText.trim()}` : noteText.trim();
  const newNotes = existingNotes ? `${existingNotes}\n${noteText.trim()}` : noteText.trim();

  const res = await runner.query(
    `UPDATE public.customers
     SET lead_notes = $2,
         notes = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, newLeadNotes, newNotes]
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

async function countCustomers(client = null) {
  const runner = client || db;
  const res = await runner.query('SELECT count(*)::int AS count FROM public.customers WHERE deleted_at IS NULL');
  return res.rows[0].count;
}

module.exports = {
  findAll,
  findById,
  findByCode,
  findByPhone,
  createCustomer,
  updateCustomer,
  toggleActive,
  softDelete,
  countCustomers,
  convertLeadToCustomer,
  appendLeadNote
};
