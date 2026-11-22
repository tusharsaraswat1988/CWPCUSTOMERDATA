/**
 * =========================================================================
 * CWP DATA APP - STAFF PORTAL SERVICE
 * Phase 4: Field-Usable Staff Portal with Strict Data Isolation
 * =========================================================================
 */

const crypto = require('crypto');
const db = require('../db/index');
const repos = require('../db/repositories/index');
const serviceCatalog = require('./serviceCatalog');

/**
 * Computes deterministic ETag / version hash from staff payload
 */
function computeStaffDataVersion(data) {
  const str = JSON.stringify({
    staffId: data.staffId,
    dc: (data.dailyCarCleaning || []).map(c => [c.customerName, c.vehicle, c.active, c.completedToday]),
    cw: (data.carWashing || []).map(j => [j.jobId || j.id, j.status, j.startedAt, j.completedAt, j.cancellationReason]),
    sc: (data.solarCleaning || []).map(j => [j.jobId || j.id, j.status, j.startedAt, j.completedAt, j.cancellationReason]),
    oj: (data.otherJobs || []).map(j => [j.jobId || j.id, j.status, j.startedAt, j.completedAt, j.serviceCategoryId, j.seaterType, j.panelCount, j.cancellationReason])
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
            c.id AS customer_id, c.customer_code, c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone,
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
              v.registration_no, v.brand_or_model, v.car_make, v.car_color, v.photo_url AS vehicle_photo_url,
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
      .filter(l => (l.status === 'completed' || l.status === 'car_not_present' || l.car_not_present === true) && l.subscription_id)
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
    const vehicleSummary = svList.map(sv => {
      const cleanModel = (sv.brand_or_model && !/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(sv.brand_or_model.trim())) ? sv.brand_or_model.trim() : '';
      return cleanModel ? `${sv.registration_no} (${cleanModel})` : sv.registration_no;
    }).join(', ');
    const mainPhoto = svList[0]?.vehicle_photo_url || '';

    // Check completion today
    const allVehiclesCompleted = svList.length > 0 && svList.every(sv => completedSubVehKeys.has(`${subRow.id}_${sv.vehicle_id}`));

    dailyCarCleaning.push({
      subscriptionId: subRow.id,
      customerId: subRow.customer_id,
      customerCode: subRow.customer_code,
      customerName: subRow.customer_name,
      name: subRow.customer_name,
      nameHi: subRow.customer_name_hi || '',
      customerNumber: subRow.customer_phone,
      phone: subRow.customer_phone,
      altPhone: subRow.customer_alt_phone || '',
      address: primaryLoc?.address_text || '',
      addressHi: primaryLoc?.address_text_hi || '',
      googleMapsUrl: primaryLoc?.google_maps_url || '',
      parkingDetails: primaryLoc?.parking_details || '',
      secondaryAddress: secondaryLoc?.address_text || '',
      secondaryAddressHi: secondaryLoc?.address_text_hi || '',
      secondaryMapsUrl: secondaryLoc?.google_maps_url || '',
      secondaryParkingDetails: secondaryLoc?.parking_details || '',
      vehicle: vehicleSummary,
      carMake: svList[0]?.car_make || subRow.car_make || '',
      carColor: svList[0]?.car_color || subRow.car_color || '',
      vehicles: svList.map(sv => ({
        id: sv.vehicle_id,
        vehicleId: sv.vehicle_id,
        subVehId: sv.id,
        subscriptionVehicleId: sv.id,
        registrationNo: sv.registration_no,
        brandOrModel: (sv.brand_or_model && !/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(sv.brand_or_model.trim())) ? sv.brand_or_model.trim() : '',
        carMake: sv.car_make || '',
        carColor: sv.car_color || '',
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

  // 7. Fetch Dispatched On-Demand & Instance Jobs (Car Wash, Solar, Interior & Exterior Detailing)
  const dispatchedJobs = await repos.serviceJobs.findDispatchedForStaff(staff.id);
  const otherJobs = [];
  const carWashing = [];
  const solarCleaning = [];

  dispatchedJobs.forEach(j => {
    const isCompleted = j.status === 'completed' || completedJobIds.has(j.id);
    let beforePhotos = [];
    if (Array.isArray(j.before_photos)) {
      beforePhotos = j.before_photos;
    } else if (typeof j.before_photos === 'string' && j.before_photos.trim()) {
      try { beforePhotos = JSON.parse(j.before_photos); } catch (e) { beforePhotos = []; }
    }
    let afterPhotos = [];
    if (Array.isArray(j.after_photos)) {
      afterPhotos = j.after_photos;
    } else if (typeof j.after_photos === 'string' && j.after_photos.trim()) {
      try { afterPhotos = JSON.parse(j.after_photos); } catch (e) { afterPhotos = []; }
    }

    const catMeta = serviceCatalog.getCategory(j.service_category_id);
    const categoryName = catMeta ? catMeta.name : (j.service_category_id === 'solar_cleaning' ? 'Solar Panel Cleaning' : 'Car Washing');
    const categoryNameHi = catMeta ? catMeta.nameHi : '';
    const categoryIcon = catMeta ? catMeta.icon : (j.service_category_id === 'solar_cleaning' ? 'solar_power' : 'local_car_wash');
    const categoryEmoji = catMeta ? catMeta.iconEmoji : '⚡';

    const jobItem = {
      jobId: j.id,
      id: j.id,
      customerId: j.customer_id,
      customerCode: j.customer_code,
      customerName: j.customer_name,
      name: j.customer_name,
      nameHi: j.customer_name_hi || '',
      customerNumber: j.customer_phone,
      phone: j.customer_phone,
      address: j.address_text,
      addressHi: j.address_text_hi || '',
      googleMapsUrl: j.google_maps_url,
      parkingDetails: j.parking_details,
      vehicle: j.registration_no ? (j.brand_or_model ? `${j.registration_no} (${j.brand_or_model})` : j.registration_no) : '',
      carMake: j.car_make || '',
      carColor: j.car_color || '',
      seaterType: j.seater_type || '',
      panelCount: j.panel_count || (j.site_details && j.site_details.panelCount ? j.site_details.panelCount : null),
      packageCode: j.package_code || '',
      vehiclePhotoUrl: j.vehicle_photo_url,
      siteDetails: j.site_details,
      serviceType: j.service_type,
      serviceCategoryId: j.service_category_id,
      serviceCategory: j.service_category_id,
      category: j.service_category_id,
      categoryName: categoryName,
      categoryNameHi: categoryNameHi,
      categoryIcon: categoryIcon,
      categoryEmoji: categoryEmoji,
      packageDetails: j.package_details,
      specialInstructions: j.special_instructions,
      scheduledDate: j.scheduled_date,
      status: j.status,
      completedToday: isCompleted,
      cancellationReason: j.cancellation_reason || null,
      cancellationRemarks: j.cancellation_remarks || null,
      cancelledAt: j.cancelled_at || null,
      cancelledBy: j.cancelled_by || null,
      beforePhotos: beforePhotos,
      afterPhotos: afterPhotos,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      completionNotes: j.completion_notes,
      staffId: staff.staff_code,
      staffName: staff.name
    };

    otherJobs.push(jobItem);

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
    staffPhotoUrl: staff.photo_url || '',
    photoUrl: staff.photo_url || '',
    email: staff.email || '',
    dateOfJoining: staff.date_of_joining ? (staff.date_of_joining.toISOString ? staff.date_of_joining.toISOString().split('T')[0] : String(staff.date_of_joining).split('T')[0]) : '',
    weeklyOff: staff.weekly_off || '',
    salary: (staff.salary !== null && staff.salary !== undefined) ? staff.salary : '',
    aadharNumber: staff.aadhar_number || '',
    panNumber: staff.pan_number || '',
    drivingLicenseNumber: staff.driving_license_number || '',
    dailyCarCleaning,
    otherJobs,
    carWashing,
    solarCleaning,
    carWashJobs: carWashing,
    solarCleaningJobs: solarCleaning,
    totalCount: dailyCarCleaning.length + otherJobs.length,
    serviceDate: currentDate,
    dataSource: 'neon_postgresql',
    isLive: true,
    lastSync: new Date().toISOString()
  };

  const currentVersion = computeStaffDataVersion(responsePayload);
  responsePayload.version = currentVersion;
  responsePayload.versionHash = currentVersion;

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
  getStaffData,
  getStaffPortalData: getStaffData
};
