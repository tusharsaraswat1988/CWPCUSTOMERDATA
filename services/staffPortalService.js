/**
 * =========================================================================
 * CWP DATA APP - STAFF PORTAL SERVICE
 * Phase 4: Field-Usable Staff Portal with Strict Data Isolation
 * =========================================================================
 */

const crypto = require('crypto');
const db = require('../db/index');
const repos = require('../db/repositories/index');

/**
 * Computes deterministic ETag / version hash from staff payload
 */
function computeStaffDataVersion(data) {
  const str = JSON.stringify({
    staffId: data.staffId,
    dc: (data.dailyCarCleaning || []).map(c => [c.customerName, c.vehicle, c.active, c.completedToday]),
    cw: (data.carWashing || []).map(j => [j.customerName, j.serviceType, j.status]),
    sc: (data.solarCleaning || []).map(j => [j.customerName, j.serviceType, j.status])
  });
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

/**
 * Get current date in Asia/Kolkata timezone (YYYY-MM-DD)
 */
function getIstCurrentDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Builds isolated staff customer and job dataset
 */
async function getStaffData(staffCodeOrId, { clientVersion = null, todayDate = null } = {}) {
  // 1. Resolve Staff Member
  let staff = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffCodeOrId)) {
    staff = await repos.staff.findById(staffCodeOrId);
  } else {
    staff = await repos.staff.findByStaffCode(staffCodeOrId);
  }

  if (!staff) {
    throw new Error(`Staff member '${staffCodeOrId}' not found.`);
  }

  if (!staff.is_active) {
    throw new Error('Staff account is deactivated.');
  }

  const currentDate = todayDate || getIstCurrentDate();

  // 2. Fetch Active Daily Clean Subscriptions assigned to this staff
  const dailySubsRes = await db.query(
    `SELECT sub.*, 
            c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
            c.alt_phone AS customer_alt_phone, c.notes AS customer_notes,
            srs.sequence_order
     FROM public.staff_assignments sa
     JOIN public.subscriptions sub ON sa.subscription_id = sub.id
     JOIN public.customers c ON sub.customer_id = c.id
     LEFT JOIN public.staff_route_sequences srs ON srs.staff_id = $1 AND srs.subscription_id = sub.id
     WHERE sa.staff_id = $1 
       AND sa.is_active = TRUE 
       AND sub.status = 'active'
       AND sub.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.is_active = TRUE
     ORDER BY srs.sequence_order ASC NULLS LAST, sub.created_at ASC`,
    [staff.id]
  );

  const subIds = dailySubsRes.rows.map(r => r.id);
  const custIds = dailySubsRes.rows.map(r => r.customer_id);

  // 3. Fetch Vehicles & Subscription Mapping
  let subVehicles = [];
  if (subIds.length > 0) {
    const svRes = await db.query(
      `SELECT sv.*, 
              v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
              loc.address_text, loc.google_maps_url, loc.parking_details
       FROM public.subscription_vehicles sv
       JOIN public.vehicles v ON sv.vehicle_id = v.id
       LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
       WHERE sv.subscription_id = ANY($1)
       ORDER BY sv.created_at ASC`,
      [subIds]
    );
    subVehicles = svRes.rows;
  }

  // 4. Fetch Locations for Customers
  let locations = [];
  if (custIds.length > 0) {
    const locRes = await db.query(
      `SELECT * FROM public.service_locations 
       WHERE customer_id = ANY($1) AND deleted_at IS NULL 
       ORDER BY is_primary DESC, created_at ASC`,
      [custIds]
    );
    locations = locRes.rows;
  }

  // 5. Fetch Today's Completions for this Staff
  const todayLogs = await repos.serviceLogs.findByStaffAndDate(staff.id, currentDate);
  const completedSubVehKeys = new Set(
    todayLogs
      .filter(l => l.status === 'completed' && l.subscription_id)
      .map(l => `${l.subscription_id}_${l.vehicle_id}`)
  );
  const completedJobIds = new Set(
    todayLogs
      .filter(l => l.status === 'completed' && l.job_id)
      .map(l => l.job_id)
  );

  // 6. Build Daily Cleaning Customer Cards
  const subVehsBySub = new Map();
  subVehicles.forEach(sv => {
    if (!subVehsBySub.has(sv.subscription_id)) subVehsBySub.set(sv.subscription_id, []);
    subVehsBySub.get(sv.subscription_id).push(sv);
  });

  const locsByCust = new Map();
  locations.forEach(loc => {
    if (!locsByCust.has(loc.customer_id)) locsByCust.set(loc.customer_id, []);
    locsByCust.get(loc.customer_id).push(loc);
  });

  const dailyCarCleaning = [];
  dailySubsRes.rows.forEach((subRow, index) => {
    const svList = subVehsBySub.get(subRow.id) || [];
    const custLocs = locsByCust.get(subRow.customer_id) || [];

    const primaryLoc = custLocs.find(l => l.is_primary) || custLocs[0] || null;
    const secondaryLoc = custLocs.find(l => !l.is_primary) || (custLocs.length > 1 ? custLocs[1] : null);

    // Multi-vehicle details
    const vehicleSummary = svList.map(sv => sv.brand_or_model ? `${sv.registration_no} (${sv.brand_or_model})` : sv.registration_no).join(', ');
    const mainPhoto = svList[0]?.vehicle_photo_url || '';

    // Check completion today
    const allVehiclesCompleted = svList.length > 0 && svList.every(sv => completedSubVehKeys.has(`${subRow.id}_${sv.vehicle_id}`));

    dailyCarCleaning.push({
      subscriptionId: subRow.id,
      customerId: subRow.customer_id,
      customerCode: subRow.customer_code,
      customerName: subRow.customer_name,
      customerNumber: subRow.customer_phone,
      phone: subRow.customer_phone,
      altPhone: subRow.customer_alt_phone || '',
      address: primaryLoc?.address_text || '',
      googleMapsUrl: primaryLoc?.google_maps_url || '',
      parkingDetails: primaryLoc?.parking_details || '',
      secondaryAddress: secondaryLoc?.address_text || '',
      secondaryMapsUrl: secondaryLoc?.google_maps_url || '',
      secondaryParkingDetails: secondaryLoc?.parking_details || '',
      vehicle: vehicleSummary,
      vehicles: svList.map(sv => ({
        id: sv.vehicle_id,
        vehicleId: sv.vehicle_id,
        subVehId: sv.id,
        subscriptionVehicleId: sv.id,
        registrationNo: sv.registration_no,
        brandOrModel: sv.brand_or_model,
        photoUrl: sv.vehicle_photo_url,
        scheduleTag: sv.schedule_tag,
        completedToday: completedSubVehKeys.has(`${subRow.id}_${sv.vehicle_id}`)
      })),
      photoUrl: mainPhoto,
      serviceCategory: 'Daily Car Cleaning',
      sheetName: 'Daily Clean',
      packageType: subRow.package_name,
      packagesPurchased: String(subRow.packages_purchased),
      rotationType: subRow.rotation_type,
      rotationNotes: subRow.rotation_notes || '',
      notes: subRow.customer_notes || subRow.rotation_notes || '',
      staffName: staff.name,
      staffId: staff.staff_code,
      sequenceOrder: subRow.sequence_order !== null ? subRow.sequence_order : index + 1,
      completedToday: allVehiclesCompleted,
      active: 'Yes'
    });
  });

  // 7. Fetch Dispatched On-Demand Jobs (Car Wash & Solar)
  const dispatchedJobs = await repos.serviceJobs.findDispatchedForStaff(staff.id);
  const carWashing = [];
  const solarCleaning = [];

  dispatchedJobs.forEach(j => {
    const isCompleted = j.status === 'completed' || completedJobIds.has(j.id);
    const jobItem = {
      jobId: j.id,
      customerId: j.customer_id,
      customerCode: j.customer_code,
      customerName: j.customer_name,
      customerNumber: j.customer_phone,
      phone: j.customer_phone,
      address: j.address_text,
      googleMapsUrl: j.google_maps_url,
      parkingDetails: j.parking_details,
      vehicle: j.registration_no ? (j.brand_or_model ? `${j.registration_no} (${j.brand_or_model})` : j.registration_no) : '',
      vehiclePhotoUrl: j.vehicle_photo_url,
      siteDetails: j.site_details,
      serviceType: j.service_type,
      packageDetails: j.package_details,
      specialInstructions: j.special_instructions,
      scheduledDate: j.scheduled_date,
      status: j.status,
      completedToday: isCompleted,
      staffId: staff.staff_code,
      staffName: staff.name
    };

    if (j.service_category_id === 'solar_cleaning') {
      solarCleaning.push(jobItem);
    } else {
      carWashing.push(jobItem);
    }
  });

  const responsePayload = {
    staffId: staff.staff_code,
    staffName: staff.name,
    staffPhone: staff.phone,
    dailyCarCleaning,
    carWashing,
    solarCleaning,
    totalCount: dailyCarCleaning.length + carWashing.length + solarCleaning.length,
    serviceDate: currentDate,
    dataSource: 'neon_postgresql',
    isLive: true,
    lastSync: new Date().toISOString()
  };

  const currentVersion = computeStaffDataVersion(responsePayload);
  responsePayload.version = currentVersion;

  if (clientVersion && clientVersion === currentVersion) {
    return {
      unchanged: true,
      version: currentVersion,
      staffId: staff.staff_code,
      staffName: staff.name,
      totalCount: responsePayload.totalCount,
      dataSource: 'neon_postgresql',
      isLive: true,
      lastSync: responsePayload.lastSync
    };
  }

  responsePayload.unchanged = false;
  return responsePayload;
}

module.exports = {
  computeStaffDataVersion,
  getIstCurrentDate,
  getStaffData
};
