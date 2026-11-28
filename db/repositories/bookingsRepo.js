/**
 * Repository for Central Booking Engine (BRD v1.0)
 * Tables: public.bookings, public.booking_addons
 */

'use strict';

const db = require('../index');

async function hydrateBookings(rows, runner) {
  if (!rows || rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const addonsRes = await runner.query(
    `SELECT ba.*, a.name AS addon_name
     FROM public.booking_addons ba
     JOIN public.addons a ON ba.addon_id = a.id
     WHERE ba.booking_id = ANY($1::uuid[])
     ORDER BY a.name ASC`,
    [ids]
  );
  const addonsByBooking = new Map();
  for (const ba of addonsRes.rows) {
    if (!addonsByBooking.has(ba.booking_id)) addonsByBooking.set(ba.booking_id, []);
    addonsByBooking.get(ba.booking_id).push(ba);
  }
  return rows.map(r => ({
    ...r,
    addons: addonsByBooking.get(r.id) || []
  }));
}

const BOOKING_SELECT_BASE = `
  SELECT b.*,
         c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
         p.name AS package_name, p.validity_days AS package_validity_days,
         svc.name AS service_name, svc.category AS service_category,
         v.registration_no, v.seater_type, v.car_model, v.car_color,
         si.panel_count, si.kw_load,
         loc.label AS location_label, loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.latitude, loc.longitude,
         st.name AS assigned_dcc_staff_name, st.staff_code AS assigned_dcc_staff_code
  FROM public.bookings b
  JOIN public.customers c ON b.customer_id = c.id
  LEFT JOIN public.packages p ON b.package_id = p.id
  LEFT JOIN public.services svc ON b.service_id = svc.id
  LEFT JOIN public.vehicles v ON b.vehicle_id = v.id
  LEFT JOIN public.solar_installations si ON b.solar_id = si.id
  JOIN public.service_locations loc ON b.location_id = loc.id
  LEFT JOIN public.staff st ON b.assigned_dcc_staff_id = st.id
`;

async function findAll({
  customerId = null,
  status = null,
  assetType = null,
  paymentStatus = null,
  search = null,
  limit = 200,
  offset = 0,
  client = null
} = {}) {
  const runner = client || db;
  const conditions = [];
  const params = [];

  if (customerId) {
    params.push(customerId);
    conditions.push(`b.customer_id = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`b.status = $${params.length}`);
  }
  if (assetType && assetType !== 'all') {
    params.push(assetType);
    conditions.push(`b.asset_type = $${params.length}`);
  }
  if (paymentStatus && paymentStatus !== 'all') {
    params.push(paymentStatus);
    conditions.push(`b.payment_status = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(c.name) LIKE $${idx} OR
      COALESCE(c.phone, '') LIKE $${idx} OR
      LOWER(COALESCE(v.registration_no, '')) LIKE $${idx} OR
      LOWER(COALESCE(p.name, svc.name, '')) LIKE $${idx}
    )`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const res = await runner.query(
    `${BOOKING_SELECT_BASE}
     ${where}
     ORDER BY b.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return hydrateBookings(res.rows, runner);
}

async function findById(id, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `${BOOKING_SELECT_BASE} WHERE b.id = $1 LIMIT 1`,
    [id]
  );
  if (!res.rows[0]) return null;
  const hydrated = await hydrateBookings(res.rows, runner);
  return hydrated[0];
}

async function findByIdForUpdate(id, client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('client with active transaction is required for findByIdForUpdate');
  }
  const res = await client.query('SELECT * FROM public.bookings WHERE id = $1 FOR UPDATE', [id]);
  return res.rows[0] || null;
}

async function findByCustomerId(customerId, client = null) {
  return findAll({ customerId, client });
}

async function findActiveDccBookingsForDate(istDate, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `${BOOKING_SELECT_BASE}
     WHERE b.status = 'active'
       AND b.assigned_dcc_staff_id IS NOT NULL
       AND b.start_date <= $1::date
       AND (b.end_date IS NULL OR b.end_date >= $1::date)
     ORDER BY b.created_at ASC`,
    [istDate]
  );
  return res.rows;
}

async function createBooking({
  customerId,
  packageId = null,
  serviceId = null,
  assetType,
  vehicleId = null,
  solarId = null,
  locationId,
  assignedDccStaffId = null,
  frequency = null,
  startDate = null,
  endDate = null,
  totalAmount = 0,
  paymentStatus = 'unpaid',
  totalCount = 1,
  remainingCount = null,
  status = 'active',
  notes = null
}, addons = [], client = null) {
  const execute = async (runner) => {
    if (!customerId || !locationId || !assetType) {
      throw new Error('customerId, locationId, and assetType are required for createBooking.');
    }
    if (!packageId && !serviceId) {
      throw new Error('Either packageId or serviceId is required for createBooking.');
    }

    const effTotalCount = Math.max(0, parseInt(totalCount ?? 1, 10));
    const effRemaining = remainingCount !== null && remainingCount !== undefined
      ? Math.max(0, parseInt(remainingCount, 10))
      : effTotalCount;

    const bRes = await runner.query(
      `INSERT INTO public.bookings (
         customer_id, package_id, service_id, asset_type, vehicle_id, solar_id, location_id,
         assigned_dcc_staff_id, frequency, start_date, end_date, total_amount, payment_status,
         total_count, remaining_count, status, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, (NOW() AT TIME ZONE 'Asia/Kolkata')::date), $11::date, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        customerId,
        packageId || null,
        serviceId || null,
        assetType,
        assetType === 'vehicle' ? vehicleId : null,
        assetType === 'solar' ? solarId : null,
        locationId,
        assignedDccStaffId || null,
        frequency || null,
        startDate || null,
        endDate || null,
        Number(totalAmount) || 0,
        paymentStatus || 'unpaid',
        effTotalCount,
        effRemaining,
        status || 'active',
        notes ? String(notes).trim() : null
      ]
    );

    const booking = bRes.rows[0];
    if (Array.isArray(addons) && addons.length > 0) {
      for (const ad of addons) {
        const addonId = ad.addonId || ad.addon_id;
        if (!addonId) continue;
        const qty = Math.max(1, parseInt(ad.quantity || 1, 10));
        let unitPrice = ad.unitPrice !== undefined ? Number(ad.unitPrice) : (ad.unit_price !== undefined ? Number(ad.unit_price) : null);
        if (unitPrice === null || !Number.isFinite(unitPrice)) {
          const adRow = await runner.query('SELECT price FROM public.addons WHERE id = $1 LIMIT 1', [addonId]);
          unitPrice = adRow.rows[0] ? Number(adRow.rows[0].price) : 0;
        }
        await runner.query(
          `INSERT INTO public.booking_addons (booking_id, addon_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [booking.id, addonId, qty, unitPrice]
        );
      }
    }

    return findById(booking.id, runner);
  };

  return client ? execute(client) : db.withTransaction(execute);
}

async function updateBooking(id, updates = {}, client = null) {
  const runner = client || db;
  const fields = [];
  const params = [id];

  if (updates.assignedDccStaffId !== undefined) {
    params.push(updates.assignedDccStaffId || null);
    fields.push(`assigned_dcc_staff_id = $${params.length}`);
  }
  if (updates.paymentStatus !== undefined) {
    params.push(updates.paymentStatus);
    fields.push(`payment_status = $${params.length}`);
  }
  if (updates.totalAmount !== undefined) {
    params.push(Number(updates.totalAmount));
    fields.push(`total_amount = $${params.length}`);
  }
  if (updates.status !== undefined) {
    params.push(updates.status);
    fields.push(`status = $${params.length}`);
  }
  if (updates.endDate !== undefined) {
    params.push(updates.endDate || null);
    fields.push(`end_date = $${params.length}::date`);
  }
  if (updates.notes !== undefined) {
    params.push(updates.notes ? String(updates.notes).trim() : null);
    fields.push(`notes = $${params.length}`);
  }

  if (fields.length === 0) return findById(id, runner);
  fields.push('updated_at = CURRENT_TIMESTAMP');

  const res = await runner.query(
    `UPDATE public.bookings
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );
  return res.rows[0] ? findById(id, runner) : null;
}

async function cancelBooking(id, { notes = null } = {}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `UPDATE public.bookings
     SET status = 'cancelled',
         notes = COALESCE($2, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [id, notes ? String(notes).trim() : null]
  );
  return res.rows[0] || null;
}

async function decrementRemainingCount(id, amount = 1, client = null) {
  const runner = client || db;
  const dec = Math.max(1, parseInt(amount, 10));
  const res = await runner.query(
    `UPDATE public.bookings
     SET remaining_count = remaining_count - $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'active' AND remaining_count >= $2
     RETURNING *`,
    [id, dec]
  );
  return res.rows[0] || null;
}

async function restoreRemainingCount(id, amount = 1, client = null) {
  const runner = client || db;
  const inc = Math.max(1, parseInt(amount, 10));
  const res = await runner.query(
    `UPDATE public.bookings
     SET remaining_count = LEAST(total_count, remaining_count + $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, inc]
  );
  return res.rows[0] || null;
}

async function expireEndedBookings(istDate = null, client = null) {
  const runner = client || db;
  const targetDate = istDate || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const res = await runner.query(
    `UPDATE public.bookings
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active'
       AND end_date IS NOT NULL
       AND end_date < $1::date
     RETURNING *`,
    [targetDate]
  );
  return res.rows;
}

module.exports = {
  findAll,
  findById,
  findByIdForUpdate,
  findByCustomerId,
  findActiveDccBookingsForDate,
  createBooking,
  updateBooking,
  cancelBooking,
  decrementRemainingCount,
  restoreRemainingCount,
  expireEndedBookings
};
