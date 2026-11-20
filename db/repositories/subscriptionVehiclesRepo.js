/**
 * Repository for table: subscription_vehicles
 */
const db = require('../index');

async function findBySubscriptionId(subscriptionId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `SELECT sv.*, 
            v.registration_no, v.brand_or_model, v.vehicle_type, v.photo_url AS vehicle_photo_url,
            loc.address_text, loc.google_maps_url, loc.parking_details
     FROM public.subscription_vehicles sv
     JOIN public.vehicles v ON sv.vehicle_id = v.id
     LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
     WHERE sv.subscription_id = $1
     ORDER BY sv.created_at ASC`,
    [subscriptionId]
  );
  return res.rows;
}

async function addVehicleToSubscription({
  subscriptionId,
  customerId,
  vehicleId,
  locationId = null,
  scheduleTag = 'daily'
}, client = null) {
  const runner = client || db;
  const res = await runner.query(
    `INSERT INTO public.subscription_vehicles (
       subscription_id, customer_id, vehicle_id, location_id, schedule_tag
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subscription_id, vehicle_id) DO UPDATE
     SET location_id = EXCLUDED.location_id,
         schedule_tag = EXCLUDED.schedule_tag
     RETURNING *`,
    [subscriptionId, customerId, vehicleId, locationId, scheduleTag || 'daily']
  );
  return res.rows[0];
}

async function removeVehicleFromSubscription(subscriptionId, vehicleId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'DELETE FROM public.subscription_vehicles WHERE subscription_id = $1 AND vehicle_id = $2 RETURNING *',
    [subscriptionId, vehicleId]
  );
  return res.rows[0] || null;
}

async function removeAllForSubscription(subscriptionId, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'DELETE FROM public.subscription_vehicles WHERE subscription_id = $1',
    [subscriptionId]
  );
  return res.rowCount || 0;
}

async function updateScheduleTag(id, scheduleTag, client = null) {
  const runner = client || db;
  const res = await runner.query(
    'UPDATE public.subscription_vehicles SET schedule_tag = $2 WHERE id = $1 RETURNING *',
    [id, scheduleTag]
  );
  return res.rows[0] || null;
}

module.exports = {
  findBySubscriptionId,
  addVehicleToSubscription,
  removeVehicleFromSubscription,
  removeAllForSubscription,
  updateScheduleTag
};
