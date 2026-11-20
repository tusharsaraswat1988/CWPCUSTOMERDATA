/**
 * Repository for table: staff_route_sequences
 */
const db = require('../index');

async function getStaffRoute(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT srs.*,
            c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
            v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.google_maps_url, loc.parking_details,
            sub.package_name, sub.rotation_type, sub.rotation_notes,
            job.service_type, job.status AS job_status
     FROM public.staff_route_sequences srs
     LEFT JOIN public.subscriptions sub ON srs.subscription_id = sub.id
     LEFT JOIN public.subscription_vehicles sv ON srs.subscription_vehicle_id = sv.id
     LEFT JOIN public.vehicles v ON sv.vehicle_id = v.id
     LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
     LEFT JOIN public.service_jobs job ON srs.job_id = job.id
     LEFT JOIN public.customers c ON COALESCE(sub.customer_id, job.customer_id) = c.id
     WHERE srs.staff_id = $1
     ORDER BY srs.sequence_order ASC`,
    [staffId]
  );
  return res.rows;
}

async function setStaffRoute(staffId, stops, updatedBy = 'admin', client = null) {
  // Execute atomically in transaction to avoid collision on uq_staff_route_order
  const execute = async (c) => {
    // 1. Clear existing route for this staff
    await c.query('DELETE FROM public.staff_route_sequences WHERE staff_id = $1', [staffId]);

    if (!stops || stops.length === 0) return [];

    const inserted = [];
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const seq = i + 1;
      const subId = stop.subscriptionId || null;
      const subVehId = stop.subscriptionVehicleId || null;
      const jobId = stop.jobId || null;

      // Validate chk_route_stop_target
      if ((subId && jobId) || (!subId && !jobId)) {
        continue;
      }

      const res = await c.query(
        `INSERT INTO public.staff_route_sequences (
           staff_id, subscription_id, subscription_vehicle_id, job_id, sequence_order, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [staffId, subId, subVehId, jobId, seq, updatedBy]
      );
      inserted.push(res.rows[0]);
    }
    return inserted;
  };

  if (client) {
    return execute(client);
  } else {
    return db.withTransaction(execute);
  }
}

async function resetStaffRoute(staffId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'DELETE FROM public.staff_route_sequences WHERE staff_id = $1',
    [staffId]
  );
  return res.rowCount || 0;
}

module.exports = {
  getStaffRoute,
  setStaffRoute,
  resetStaffRoute
};
