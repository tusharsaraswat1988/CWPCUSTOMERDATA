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
const staffCapabilityService = require('./staffCapabilityService');
const staffDesignationService = require('./staffDesignationService');

// Stub serviceLogs repo if not present (deleted in BRD cleanup)
const serviceLogsStub = { findByStaffAndDate: async () => [] };
const getServiceLogs = () => (repos.serviceLogs || serviceLogsStub);

/**
 * Computes deterministic ETag / version hash from staff payload
 */
function computeStaffDataVersion(data) {
  const str = JSON.stringify({
    staffId: data.staffId,
    dc: (data.dailyCarCleaning || []).map(c => [c.customerName, c.vehicle, c.active, c.isStopped, c.status, c.completedToday]),
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
    if (!staff) {
      staff = await repos.staff.findById(staffCodeOrId);
    }
  }

  if (!staff) {
    throw new Error(`Staff member '${staffCodeOrId}' not found.`);
  }

  if (!staff.is_active) {
    throw new Error('Staff account is deactivated.');
  }

  const currentDate = todayDate || getIstCurrentDate();
  const effCaps = staffCapabilityService.getStaffEffectiveCapabilities(staff);
  const isDccAllowed = staffCapabilityService.isDccEligible(staff);

  // 2. Fetch Today's DCC daily jobs for this staff (BRD: routes + route_stops + dcc_daily_jobs)
  let dccJobs = [];
  const completedJobIds = new Set();
  if (isDccAllowed) {
    dccJobs = await repos.dccDailyJobs.findByStaffAndDate(staff.id, currentDate).catch(() => []);
  }

  // 5. Track non-DCC job completions from service_jobs (serviceLogs repo removed in BRD)
  const todayLogs = await getServiceLogs().findByStaffAndDate(staff.id, currentDate).catch(() => []);
  todayLogs.filter(l => l.status === 'completed' && l.job_id).forEach(l => completedJobIds.add(l.job_id));

  // 6. Build Daily Cleaning Customer Cards from dcc_daily_jobs
  const dailyCarCleaning = dccJobs.map((dj, index) => {
    const isCompleted = dj.status === 'completed';
    const isCarNotAvailable = dj.status === 'car_not_available';
    const isMissed = dj.status === 'missed';
    return {
      dccJobId: dj.id,
      vehicleId: dj.vehicle_id,
      customerId: dj.customer_id,
      customerCode: dj.customer_code || '',
      customerName: dj.customer_name || '',
      name: dj.customer_name || '',
      nameHi: dj.customer_name_hi || '',
      customerNumber: dj.customer_phone || '',
      phone: dj.customer_phone || '',
      address: dj.address_text || '',
      addressHi: dj.address_text_hi || '',
      googleMapsUrl: dj.google_maps_url || '',
      parkingDetails: dj.parking_details || '',
      vehicle: dj.registration_no ? (dj.car_model ? dj.registration_no + ' (' + dj.car_model + ')' : dj.registration_no) : '',
      carMake: dj.car_model || '',
      carColor: dj.car_color || '',
      seaterType: dj.seater_type || '',
      vehicles: [{
        id: dj.vehicle_id, vehicleId: dj.vehicle_id,
        registrationNo: dj.registration_no || '',
        brandOrModel: dj.car_model || '',
        carMake: dj.car_model || '', carColor: dj.car_color || '',
        seaterType: dj.seater_type || '',
        completedToday: isCompleted || isCarNotAvailable,
        locationId: dj.location_id || null,
        locationName: dj.location_label || 'Home',
        addressText: dj.address_text || '', addressTextHi: dj.address_text_hi || '',
        googleMapsUrl: dj.google_maps_url || '',
        latitude: dj.latitude != null ? parseFloat(dj.latitude) : null,
        longitude: dj.longitude != null ? parseFloat(dj.longitude) : null,
        parkingDetails: dj.parking_details || ''
      }],
      photoUrl: dj.photo_url || '',
      serviceCategory: 'Daily Car Cleaning', sheetName: 'Daily Clean',
      packageType: dj.package_name || 'Daily', frequency: dj.frequency || 'daily',
      routeName: dj.route_name || '',
      staffName: staff.name, staffId: staff.staff_code,
      sequenceOrder: dj.sequence_order != null ? dj.sequence_order : index + 1,
      completedToday: isCompleted || isCarNotAvailable,
      isStopped: false, status: dj.status, serviceStatus: dj.status,
      carNotAvailable: isCarNotAvailable, isMissed: isMissed, active: 'Yes'
    };
  });

    // 7. Fetch Dispatched On-Demand & Instance Jobs (Car Wash, Solar, Interior & Exterior Detailing)
  let dispatchedJobs = [];
  if (effCaps.workType !== 'dcc_only') {
    const rawJobs = await repos.serviceJobs.findDispatchedForStaff(staff.id);
    dispatchedJobs = await Promise.all((rawJobs || [])
      .filter(j => staffCapabilityService.hasServiceCapability(staff, j.service_category_id))
      .map(async j => ({
        ...j,
        seeAddons: []
      })));
  }
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
    const categoryEmoji = catMeta ? catMeta.iconEmoji : 'âš¡';

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
      serviceId: j.service_id || null,
      vehicleId: j.vehicle_id || null,
      locationId: j.location_id || null,
      seeManaged: Boolean(j.service_payload && j.service_payload._seeManaged),
      checklistRequirements: Array.isArray(j.checklist_requirements) ? j.checklist_requirements : [],
      proofRequirements: j.proof_requirements || { before_min: 0, after_min: 0, required: false },
      selectedAddons: (j.seeAddons || []).map(addon => ({
        id: addon.id,
        addonId: addon.addon_id,
        name: addon.addon_name_snapshot,
        executionMode: addon.execution_mode,
        required: Boolean(addon.is_required),
        status: addon.status,
        checklistRequirements: addon.checklist_requirements || [],
        proofRequirements: addon.proof_requirements || {}
      })),
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
      scheduledTime: j.scheduled_time || '',
      tentativeTime: j.scheduled_time || '',
      sequenceOrder: j.sequence_order !== null && j.sequence_order !== undefined ? j.sequence_order : null,
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

  const desigId = (staff.designation_id || staff.designationId || 'cleaner').toString().toLowerCase();
  const designation = await staffDesignationService.getDesignationById(desigId).catch(() => null);

  let manager = null;
  if (staff.reports_to_id) {
    manager = await repos.staff.findById(staff.reports_to_id).catch(() => null);
    if (!manager) {
      manager = await repos.staff.findByStaffCode(staff.reports_to_id).catch(() => null);
    }
  }

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
    workType: effCaps.workType,
    serviceCapabilities: effCaps.serviceCapabilities,
    isDccEligible: isDccAllowed,
    designationId: designation ? designation.id : (staff.designation_id || 'cleaner'),
    designationName: designation ? designation.name : 'Cleaner',
    designationLevel: designation ? designation.hierarchyLevel : 1,
    isSupervisory: designation ? Boolean(designation.isSupervisory) : false,
    authorities: designation ? (designation.authorities || {}) : {},
    reportsToId: staff.reports_to_id || null,
    reportsToName: manager ? manager.name : '',
    reportsToCode: manager ? manager.staff_code : '',
    teamName: staff.team_name || '',
    operationalScope: staff.operational_scope || '',
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
