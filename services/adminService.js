/**
 * =========================================================================
 * CWP DATA APP - ADMIN SERVICE
 * Phase 3: Comprehensive Admin Panel Management Workflows
 * =========================================================================
 */

const db = require('../db/index');
const repos = require('../db/repositories/index');
const authService = require('./authService');
const staffPortalService = require('./staffPortalService');
const indicService = require('./indicTransliterateService');
const bilingualSearchService = require('./bilingualSearchService');
const serviceCatalog = require('./serviceCatalog');
const { resolveCanonicalCategory } = serviceCatalog;
const staffCapabilityService = require('./staffCapabilityService');
const staffDesignationService = require('./staffDesignationService');

function normalizeIndianMobile(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim().replace(/^'+/, '').trim();
  if (!str || /[a-zA-Z]/.test(str)) return '';
  if (str.includes('+') && !/^\s*\+\s*91/.test(str)) return '';
  if (/[^\d+\s\-()]/.test(str)) return '';
  let cleaned = str.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) cleaned = cleaned.substring(3);
  else if (cleaned.startsWith('+')) return '';
  let digits = cleaned.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.substring(1);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.substring(2);
  return digits;
}

function isValidIndianMobile(value) {
  const digits = normalizeIndianMobile(value);
  return /^[6-9]\d{9}$/.test(digits);
}

/**
 * Parses composite vehicle text e.g. "UP85BY2928 (White Swift)" or "UP85BY2928"
 */
function parseVehicleString(str) {
  if (!str) return { reg: '', model: '' };
  const s = String(str).trim();

  // 1. Format: "UP32 AB 1234 (Model)"
  let match = s.match(/^([A-Z0-9\s]+?)(?:\s*\((.*?)\))?$/i);
  if (match && match[2] !== undefined) {
    const reg = (match[1] || '').trim().toUpperCase().slice(0, 20);
    let model = (match[2] || '').trim();
    if (/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(model)) model = '';
    return { reg, model };
  }

  // 2. Format: "UP32 AB 1234 - Model"
  match = s.match(/^([A-Z0-9\s]+?)(?:\s*[-–—]\s*(.*))$/i);
  if (match && match[2]) {
    const reg = (match[1] || '').trim().toUpperCase().slice(0, 20);
    let model = (match[2] || '').trim();
    if (/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(model)) model = '';
    return { reg, model };
  }

  return { reg: s.toUpperCase().slice(0, 20), model: '' };
}

/**
 * Extract GPS Latitude & Longitude from Google Maps URLs, Plus Codes, or raw coordinate strings
 */
function extractCoordinates(input) {
  if (!input) return { latitude: null, longitude: null };
  const s = String(input).trim();

  // Pattern 1: @26.852345,80.946210 or @26.852345,80.946210,17z
  let m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) {
    return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  }

  // Pattern 2: ?q=26.852345,80.946210 or &ll=26.852345,80.946210
  m = s.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) {
    return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  }

  // Pattern 3: Raw "26.852345, 80.946210" or "26.852345,80.946210"
  m = s.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (m) {
    return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  }

  return { latitude: null, longitude: null };
}

/**
 * Retrieve aggregated customers list for Admin Panel
 */
async function getAllCustomers({ search = '', category = null, staffId = null, limit = 500, offset = 0, isLead = false } = {}) {
  // Query customers with their active subscriptions, vehicles, and locations
  // When a search term is provided, load candidates and apply bilingual phonetic search across all joined fields
  const dbSearch = (search && search.trim()) ? '' : '';
  const customers = await repos.customers.findAll({ search: dbSearch, includeDeleted: false, isLead, limit: (search ? 1000 : limit), offset: (search ? 0 : offset) });

  if (customers.length === 0) {
    return [];
  }

  // Fetch related entities for all fetched customers
  const custIds = customers.map(c => c.id);

  // Locations query
  const locsRes = await db.query(
    'SELECT * FROM public.service_locations WHERE customer_id = ANY($1) AND deleted_at IS NULL ORDER BY is_primary DESC',
    [custIds]
  );
  const locsByCust = new Map();
  locsRes.rows.forEach(l => {
    if (!locsByCust.has(l.customer_id)) locsByCust.set(l.customer_id, []);
    locsByCust.get(l.customer_id).push(l);
  });

  // Vehicles query
  const vehsRes = await db.query(
    'SELECT * FROM public.vehicles WHERE customer_id = ANY($1) AND deleted_at IS NULL ORDER BY created_at ASC',
    [custIds]
  );
  const vehsByCust = new Map();
  vehsRes.rows.forEach(v => {
    if (!vehsByCust.has(v.customer_id)) vehsByCust.set(v.customer_id, []);
    vehsByCust.get(v.customer_id).push(v);
  });

  // Subscriptions query
  const subsRes = await db.query(
    `SELECT sub.*, 
            sa.staff_id, st.name AS staff_name, st.staff_code
     FROM public.subscriptions sub
     LEFT JOIN public.staff_assignments sa ON sub.id = sa.subscription_id AND sa.is_active = TRUE
     LEFT JOIN public.staff st ON sa.staff_id = st.id
     WHERE sub.customer_id = ANY($1) AND sub.deleted_at IS NULL`,
    [custIds]
  );
  const subsByCust = new Map();
  subsRes.rows.forEach(s => {
    if (!subsByCust.has(s.customer_id)) subsByCust.set(s.customer_id, []);
    subsByCust.get(s.customer_id).push(s);
  });

  // On-demand jobs query
  const jobsRes = await db.query(
    `SELECT j.*, 
            sa.staff_id, st.name AS staff_name, st.staff_code
     FROM public.service_jobs j
     LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
     LEFT JOIN public.staff st ON sa.staff_id = st.id
     WHERE j.customer_id = ANY($1) AND j.deleted_at IS NULL`,
    [custIds]
  );
  const jobsByCust = new Map();
  jobsRes.rows.forEach(j => {
    if (!jobsByCust.has(j.customer_id)) jobsByCust.set(j.customer_id, []);
    jobsByCust.get(j.customer_id).push(j);
  });

  // Format into rich view model compatible with frontend expectations
  const results = [];
  for (const c of customers) {
    const locs = locsByCust.get(c.id) || [];
    const vehs = vehsByCust.get(c.id) || [];
    const subs = subsByCust.get(c.id) || [];
    const jobs = jobsByCust.get(c.id) || [];

    const primaryLoc = locs.find(l => l.is_primary) || locs[0] || null;
    const secondaryLoc = locs.find(l => !l.is_primary) || (locs.length > 1 ? locs[1] : null);

    // Active / stopped subscription (daily clean)
    const activeSub = subs.find(s => s.status === 'active') || null;
    const stoppedSub = subs.find(s => s.status === 'stopped') || null;

    // Service category & lifecycle classification
    let serviceCategory = 'Daily Car Cleaning';
    let serviceStatus = 'active';
    let isStopped = false;
    let stoppedReason = '';
    let sheetName = 'Daily Clean';
    let staffName = '';
    let assignedStaffId = '';

    const rawCustCat = (c.interested_service || '').toString().trim();
    if (activeSub) {
      serviceCategory = 'Daily Car Cleaning';
      serviceStatus = 'active';
      staffName = activeSub.staff_name || '';
      assignedStaffId = activeSub.staff_code || (activeSub.staff_id ? 'STF01' : '');
    } else if (stoppedSub) {
      serviceCategory = 'Daily Car Cleaning';
      serviceStatus = 'stopped';
      isStopped = true;
      stoppedReason = stoppedSub.stopped_reason || 'Service Stopped';
      staffName = stoppedSub.staff_name || '';
      assignedStaffId = stoppedSub.staff_code || (stoppedSub.staff_id ? 'STF01' : '');
    } else if (jobs.length > 0) {
      const activeJob = jobs.find(j => j.status === 'assigned' || j.status === 'pending' || j.status === 'in_progress') || jobs[0];
      if (activeJob.service_category_id === 'solar_cleaning') {
        serviceCategory = 'Solar Panel Cleaning';
      } else if (activeJob.service_category_id === 'interior_detailing') {
        serviceCategory = 'Interior Detailing';
      } else if (activeJob.service_category_id === 'exterior_detailing') {
        serviceCategory = 'Exterior Detailing';
      } else {
        serviceCategory = 'Car Washing';
      }
      serviceStatus = activeJob.status || 'assigned';
      if (activeJob.status === 'cancelled') {
        isStopped = true;
        stoppedReason = activeJob.cancellation_reason || 'Cancelled';
      }
      staffName = activeJob.staff_name || '';
      assignedStaffId = activeJob.staff_code || '';
    } else if (rawCustCat && rawCustCat.toLowerCase() !== 'none' && rawCustCat.toLowerCase() !== 'no service') {
      if (/solar/i.test(rawCustCat)) serviceCategory = 'Solar Panel Cleaning';
      else if (/interior/i.test(rawCustCat)) serviceCategory = 'Interior Detailing';
      else if (/exterior/i.test(rawCustCat)) serviceCategory = 'Exterior Detailing';
      else if (/wash/i.test(rawCustCat)) serviceCategory = 'Car Washing';
      else if (/daily/i.test(rawCustCat) || /dcc/i.test(rawCustCat)) serviceCategory = 'Daily Car Cleaning';
      serviceStatus = 'none';
    } else {
      serviceCategory = 'None';
      serviceStatus = 'none';
    }

    const hasService = (serviceCategory !== 'None' && serviceStatus !== 'none');
    sheetName = (serviceCategory === 'Daily Car Cleaning') ? 'Daily Clean' : 'All Other Work';

    // Apply category / staff filter if requested
    if (category && serviceCategory.toLowerCase() !== category.toLowerCase()) {
      continue;
    }
    if (staffId && assignedStaffId.toUpperCase() !== staffId.toUpperCase()) {
      continue;
    }

    // Vehicles summary string e.g. "UP85BY2928 (White Swift)"
    const vehicleStrings = vehs.map(v => {
      const reg = (v.registration_no && !/^\[object\s+object\]$/i.test(v.registration_no)) ? v.registration_no : '';
      const model = (v.brand_or_model && !/^\[object\s+object\]$/i.test(v.brand_or_model)) ? v.brand_or_model : '';
      return (reg && model) ? `${reg} (${model})` : (reg || model || '');
    }).filter(Boolean);
    const mainVehicle = vehicleStrings[0] || '';
    const mainPhoto = vehs[0]?.photo_url || '';
    const resolvedCarMake = c.car_make || vehs[0]?.car_make || '';
    const resolvedCarColor = c.car_color || vehs[0]?.car_color || '';

    results.push({
      id: c.id,
      customerCode: c.customer_code,
      customerName: c.name,
      nameHi: c.name_hi || '',
      customerNumber: c.phone,
      phone: c.phone,
      altPhone: c.alt_phone || '',
      email: c.email || '',
      notes: c.notes || '',
      leadNotes: c.lead_notes || '',
      isLead: Boolean(c.is_lead),
      leadStatus: c.lead_status || 'open',
      interestedService: c.interested_service || (serviceCategory || 'Daily Car Cleaning'),
      address: primaryLoc?.address_text || '',
      addressHi: primaryLoc?.address_text_hi || c.address_hi || '',
      googleMapsUrl: primaryLoc?.google_maps_url || '',
      latitude: primaryLoc?.latitude != null ? parseFloat(primaryLoc.latitude) : null,
      longitude: primaryLoc?.longitude != null ? parseFloat(primaryLoc.longitude) : null,
      parkingDetails: primaryLoc?.parking_details || '',
      secondaryAddress: secondaryLoc?.address_text || '',
      secondaryAddressHi: secondaryLoc?.address_text_hi || c.secondary_address_hi || '',
      secondaryMapsUrl: secondaryLoc?.google_maps_url || '',
      secondaryLatitude: secondaryLoc?.latitude != null ? parseFloat(secondaryLoc.latitude) : null,
      secondaryLongitude: secondaryLoc?.longitude != null ? parseFloat(secondaryLoc.longitude) : null,
      secondaryParkingDetails: secondaryLoc?.parking_details || '',
      vehicle: mainVehicle,
      vehicles: vehs,
      carMake: resolvedCarMake,
      car_make: resolvedCarMake,
      carColor: resolvedCarColor,
      car_color: resolvedCarColor,
      locations: locs.map(l => ({
        id: l.id,
        customerId: l.customer_id,
        locationName: l.location_name || (l.address_type ? l.address_type.charAt(0).toUpperCase() + l.address_type.slice(1) : 'Home'),
        addressType: l.address_type || 'primary',
        addressText: l.address_text || '',
        addressTextHi: l.address_text_hi || '',
        googleMapsUrl: l.google_maps_url || '',
        latitude: l.latitude != null ? parseFloat(l.latitude) : null,
        longitude: l.longitude != null ? parseFloat(l.longitude) : null,
        parkingDetails: l.parking_details || '',
        isPrimary: Boolean(l.is_primary)
      })),
      photoUrl: mainPhoto,
      serviceCategory: serviceCategory,
      serviceStatus: serviceStatus,
      isStopped: isStopped,
      stoppedReason: stoppedReason,
      hasService: hasService,
      sheetName: sheetName,
      packageName: activeSub?.package_name || jobs[0]?.package_details || jobs[0]?.service_type || (serviceCategory === 'Daily Car Cleaning' ? 'Daily Clean' : serviceCategory),
      packageType: activeSub?.package_name || jobs[0]?.package_details || jobs[0]?.service_type || (serviceCategory === 'Daily Car Cleaning' ? 'DCC ONLY' : 'Standard'),
      packagesPurchased: String(activeSub?.packages_purchased || 1),
      rotationType: activeSub?.rotation_type || 'none',
      rotationNotes: activeSub?.rotation_notes || '',
      staffName: staffName,
      staffId: assignedStaffId,
      panelCount: c.panel_count || jobs[0]?.panel_count || null,
      panel_count: c.panel_count || jobs[0]?.panel_count || null,
      seaterType: vehs[0]?.seater_type || c.preferred_seater_type || jobs[0]?.seater_type || '5_seater',
      seater_type: vehs[0]?.seater_type || c.preferred_seater_type || jobs[0]?.seater_type || '5_seater',
      active: c.is_active ? 'Yes' : 'No',
      isActive: c.is_active,
      createdAt: c.created_at,
      rowIndex: c.source_row_index || 0
    });
  }

  let finalResults = results;
  if (search && String(search).trim()) {
    finalResults = bilingualSearchService.filterRecordsBilingual(results, search.trim());
    if (limit && offset !== undefined && !isLead) {
      finalResults = finalResults.slice(offset, offset + limit);
    }
  }

  return finalResults;
}

/**
 * Get detailed customer record by ID
 */
async function getCustomerById(id) {
  const customer = await repos.customers.findById(id);
  if (!customer) return null;

  const locations = await repos.serviceLocations.findByCustomerId(customer.id);
  const vehicles = await repos.vehicles.findByCustomerId(customer.id);
  const subscriptions = await repos.subscriptions.findByCustomerId(customer.id);

  let subscriptionVehicles = [];
  let assignedStaff = null;

  if (subscriptions.length > 0) {
    const activeSub = subscriptions.find(s => s.status === 'active') || subscriptions[0];
    subscriptionVehicles = await repos.subscriptionVehicles.findBySubscriptionId(activeSub.id);
    assignedStaff = await repos.staffAssignments.findActiveBySubscriptionId(activeSub.id);
  }

  const jobs = await repos.serviceJobs.findAll({ customerId: customer.id });

  return {
    customer,
    locations,
    vehicles,
    subscriptions,
    subscriptionVehicles,
    assignedStaff,
    jobs
  };
}

/**
 * Save Customer Workflow (Transactions + Foreign Key Safeguards + Audit Logging)
 */
async function saveCustomer(custData, adminUser = 'admin') {
  const isLeadRecord = Boolean(custData.isLead || custData.is_lead || custData.tag === 'lead');
  const rawPhone = (custData.customerNumber || custData.phone || custData.custPhone || custData.mobile || '').toString().trim();
  let normPhone = null;

  if (rawPhone) {
    if (!isValidIndianMobile(rawPhone)) {
      return {
        success: false,
        error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
      };
    }
    normPhone = normalizeIndianMobile(rawPhone);
  } else if (!isLeadRecord) {
    return {
      success: false,
      error: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9). (Invalid Indian mobile number)'
    };
  }

  const custName = (custData.customerName || custData.name || '').trim();
  if (!custName) {
    return { success: false, error: 'Customer name is required.' };
  }

  return db.withTransaction(async (client) => {
    // Generate unique customer_code
    const uniqueSuffix = Date.now().toString().slice(-4);
    let customerCode = '';
    if (isLeadRecord) {
      const phoneSnippet = normPhone ? normPhone.slice(-6) : `NOP_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      customerCode = `LEAD_${phoneSnippet}_${uniqueSuffix}`.slice(0, 32);
    } else {
      const codePrefix = (custData.sheetName === 'All Other Work') ? 'CUST_AOW_' : 'CUST_DC_';
      customerCode = `${codePrefix}${normPhone}_${uniqueSuffix}`.slice(0, 32);
    }

    // Auto-transliterate to Hindi if not explicitly provided
    let nameHi = (custData.nameHi || custData.name_hi || '').trim() || null;
    let addressHi = (custData.addressHi || custData.address_hi || '').trim() || null;
    let secAddressHi = (custData.secondaryAddressHi || custData.secondary_address_hi || '').trim() || null;

    if (!nameHi && custName) {
      try { nameHi = await indicService.transliterateName(custName); } catch (e) { nameHi = custName; }
    }
    const addr = (custData.address || custData.location || '').trim();
    if (!addressHi && addr) {
      try { addressHi = await indicService.transliterateAddress(addr); } catch (e) { addressHi = addr; }
    }
    const secAddr = (custData.secondaryAddress || custData.secondAddress || '').trim();
    if (!secAddressHi && secAddr) {
      try { secAddressHi = await indicService.transliterateAddress(secAddr); } catch (e) { secAddressHi = secAddr; }
    }

    const leadNotes = custData.leadNotes || custData.lead_notes || custData.notes || null;
    const rawCat = (custData.serviceCategory || custData.serviceType || custData.interestedService || '').trim();
    const hasService = Boolean(rawCat && rawCat.toLowerCase() !== 'none' && !custData.noService && rawCat !== 'No Service');
    const interestedService = hasService ? rawCat : 'None';
    const isSolarCustomer = hasService && (interestedService === 'Solar Panel Cleaning' || interestedService === 'solar_cleaning');
    const customerPanelCount = isSolarCustomer ? (parseInt(custData.panelCount || custData.panel_count, 10) || null) : null;
    const customerSeaterType = isSolarCustomer ? null : (custData.seaterType || custData.seater_type || '5_seater');
    const carMake = (custData.carMake || custData.car_make || '').trim() || null;
    const carColor = (custData.carColor || custData.car_color || '').trim() || null;

    // 1. Create Customer Master
    const customer = await repos.customers.createCustomer({
      customerCode,
      name: custName,
      phone: normPhone,
      altPhone: custData.altPhone || null,
      email: custData.email || null,
      notes: custData.notes || null,
      sourceSheetName: isLeadRecord ? 'Leads' : (custData.sheetName || 'Daily Clean'),
      sourceRowIndex: 0,
      isActive: true,
      nameHi,
      addressHi,
      secondaryAddressHi: secAddressHi,
      isLead: isLeadRecord,
      leadStatus: custData.leadStatus || 'open',
      leadNotes: leadNotes,
      interestedService: interestedService,
      carMake,
      carColor,
      panelCount: customerPanelCount
    }, client);

    // 2. Create Service Locations (Multi-Location System)
    let primaryLocation = null;
    const incomingLocations = Array.isArray(custData.locations) ? custData.locations.filter(l => l && (l.addressText || l.address)) : [];

    if (incomingLocations.length > 0) {
      const hasExplicitPrimary = incomingLocations.some(l => l.isPrimary || l.is_primary);
      for (let idx = 0; idx < incomingLocations.length; idx++) {
        const item = incomingLocations[idx];
        const isPrim = hasExplicitPrimary ? Boolean(item.isPrimary || item.is_primary) : (idx === 0);
        const lName = (item.locationName || item.name || item.addressType || (isPrim ? 'Home' : `Location ${idx + 1}`)).trim();
        const aType = (item.addressType || (isPrim ? 'primary' : 'other')).trim().toLowerCase();
        const aText = (item.addressText || item.address || '').trim();
        let aHi = (item.addressTextHi || item.addressHi || '').trim() || null;
        if (!aHi && aText) {
          try { aHi = await indicService.transliterateAddress(aText); } catch (e) { aHi = aText; }
        }
        const mUrl = (item.googleMapsUrl || item.mapsUrl || item.mapLink || '').trim() || null;
        let lat = item.latitude != null ? parseFloat(item.latitude) : null;
        let lng = item.longitude != null ? parseFloat(item.longitude) : null;
        if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && mUrl) {
          const coords = extractCoordinates(mUrl);
          if (coords.latitude != null) {
            lat = coords.latitude;
            lng = coords.longitude;
          }
        }
        const pDetails = (item.parkingDetails || item.parking || '').trim() || null;

        const createdLoc = await repos.serviceLocations.createLocation({
          customerId: customer.id,
          locationName: lName,
          addressType: aType,
          addressText: aText,
          addressTextHi: aHi,
          googleMapsUrl: mUrl,
          latitude: lat,
          longitude: lng,
          parkingDetails: pDetails,
          isPrimary: isPrim,
          isActive: true
        }, client);

        if (isPrim && !primaryLocation) {
          primaryLocation = createdLoc;
        }
      }
      if (!primaryLocation && incomingLocations.length > 0) {
        const allLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
        primaryLocation = allLocs[0] || null;
      }
    } else {
      // Legacy single / secondary location fallback
      if (addr) {
        let lat = custData.latitude != null ? parseFloat(custData.latitude) : null;
        let lng = custData.longitude != null ? parseFloat(custData.longitude) : null;
        if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && custData.googleMapsUrl) {
          const coords = extractCoordinates(custData.googleMapsUrl);
          if (coords.latitude != null) { lat = coords.latitude; lng = coords.longitude; }
        }
        primaryLocation = await repos.serviceLocations.createLocation({
          customerId: customer.id,
          locationName: custData.locationName || 'Home',
          addressType: 'primary',
          addressText: addr,
          addressTextHi: addressHi,
          googleMapsUrl: custData.googleMapsUrl || null,
          latitude: lat,
          longitude: lng,
          parkingDetails: custData.parkingDetails || null,
          isPrimary: true,
          isActive: true
        }, client);
      }

      // Secondary Location if provided
      if (secAddr) {
        let secLat = custData.secondaryLatitude != null ? parseFloat(custData.secondaryLatitude) : null;
        let secLng = custData.secondaryLongitude != null ? parseFloat(custData.secondaryLongitude) : null;
        const secUrl = custData.secondaryMapsUrl || custData.secondGoogleMapsUrl || null;
        if ((secLat == null || secLng == null || isNaN(secLat) || isNaN(secLng)) && secUrl) {
          const coords = extractCoordinates(secUrl);
          if (coords.latitude != null) { secLat = coords.latitude; secLng = coords.longitude; }
        }
        await repos.serviceLocations.createLocation({
          customerId: customer.id,
          locationName: custData.secondaryLocationName || 'Office / Alternate',
          addressType: 'secondary',
          addressText: secAddr,
          addressTextHi: secAddressHi,
          googleMapsUrl: secUrl,
          latitude: secLat,
          longitude: secLng,
          parkingDetails: custData.secondaryParkingDetails || custData.secondParkingDetails || null,
          isPrimary: false,
          isActive: true
        }, client);
      }
    }

    // 3. Create Vehicles
    const rawVehicles = [];
    if (custData.vehicle || custData.vehicleDetails) {
      rawVehicles.push({
        raw: custData.vehicle || custData.vehicleDetails,
        photo: custData.photoUrl || custData.photo || ''
      });
    }
    if (custData.secondVehicleDetails || custData.vehicle2) {
      rawVehicles.push({
        raw: custData.secondVehicleDetails || custData.vehicle2,
        photo: custData.secondVehiclePhoto || custData.photo2 || ''
      });
    }
    if (custData.thirdVehicleDetails || custData.vehicle3) {
      rawVehicles.push({
        raw: custData.thirdVehicleDetails || custData.vehicle3,
        photo: custData.thirdVehiclePhoto || custData.photo3 || ''
      });
    }

    const createdVehicles = [];
    for (let i = 0; i < rawVehicles.length; i++) {
      const vItem = rawVehicles[i];
      const parsed = parseVehicleString(vItem.raw);
      if (parsed.reg) {
        const veh = await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLocation?.id || null,
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || null,
          vehicleType: 'Car',
          photoUrl: vItem.photo || null,
          isActive: true,
          carMake,
          carColor,
          seaterType: customerSeaterType
        }, client);
        createdVehicles.push(veh);
      }
    }

    // If saving as a lead, finish early without creating subscriptions or staff jobs
    if (isLeadRecord) {
      await repos.auditLogs.logChange({
        entityType: 'customer',
        entityId: customer.id,
        action: 'create_lead',
        changedBy: adminUser,
        afterState: { customerCode, name: custName, phone: normPhone, isLead: true }
      }, client);

      return {
        success: true,
        customerId: customer.id,
        customerCode: customer.customer_code,
        isLead: true,
        message: 'Lead captured successfully'
      };
    }

    // 4. Resolve Staff Member Assignment
    let assignedStaff = null;
    const sName = (custData.staffName || '').trim();
    const sId = (custData.staffId || '').trim();

    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      assignedStaff = await repos.staff.findByStaffCode(sId, client);
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      assignedStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase()) || null;
    }

    // 5. Create Daily Cleaning Subscription or On-Demand Service Job (if requested)
    if (hasService) {
      const isDaily = rawCat === 'Daily Car Cleaning' || rawCat === 'Daily Clean' || rawCat === 'daily_car_cleaning';

      if (isDaily) {
        const sub = await repos.subscriptions.createSubscription({
          customerId: customer.id,
          serviceCategoryId: 'daily_car_cleaning',
          packageName: custData.packageType || custData.packageName || 'Daily Clean',
          packagesPurchased: parseInt(custData.packagesPurchased, 10) || 1,
          rotationType: custData.rotationType || (custData.aajKal ? 'aaj_kal' : 'none'),
          rotationNotes: custData.rotationNotes || custData.notes || null,
          status: 'active'
        }, client);

        // Attach vehicles to subscription
        for (const cv of createdVehicles) {
          await repos.subscriptionVehicles.addVehicleToSubscription({
            subscriptionId: sub.id,
            customerId: customer.id,
            vehicleId: cv.id,
            locationId: primaryLocation?.id || null,
            scheduleTag: custData.scheduleTag || 'daily'
          }, client);
        }

        // Assign staff to subscription
        if (assignedStaff) {
          await repos.staffAssignments.assignStaffToSubscription({
            staffId: assignedStaff.id,
            subscriptionId: sub.id,
            assignedBy: adminUser
          }, client);
        }
      } else {
        // On-Demand Service Job (Car Wash, Solar, Interior, Exterior)
        const isSolar = rawCat === 'Solar Panel Cleaning' || rawCat === 'solar_cleaning';
        const serviceCatId = resolveCanonicalCategory(rawCat);
        const parsedPanelCount = isSolar ? (parseInt(custData.panelCount || custData.panel_count, 10) || 10) : null;
        const parsedSeaterType = isSolar ? null : (custData.seaterType || custData.seater_type || '5_seater');

        const job = await repos.serviceJobs.createJob({
          customerId: customer.id,
          vehicleId: createdVehicles[0]?.id || null,
          locationId: primaryLocation?.id || (await repos.serviceLocations.findByCustomerId(customer.id, { client }))[0]?.id,
          serviceCategoryId: serviceCatId,
          serviceType: custData.serviceType || custData.packageType || (isSolar ? 'Solar Cleaning' : 'Car Wash'),
          packageDetails: custData.packageDetails || null,
          seaterType: parsedSeaterType,
          panelCount: parsedPanelCount,
          siteDetails: isSolar ? { panelCount: parsedPanelCount, roofType: 'RCC' } : null,
          scheduledDate: custData.scheduledDate || null,
          status: 'assigned',
          specialInstructions: custData.notes || null,
          photoUrl: custData.photoUrl || null
        }, client);

        if (assignedStaff) {
          await repos.staffAssignments.assignStaffToJob({
            staffId: assignedStaff.id,
            jobId: job.id,
            assignedBy: adminUser
          }, client);
        }
      }
    }

    // 6. Audit Trail
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'create',
      changedBy: adminUser,
      afterState: { customerCode, name: custName, phone: normPhone }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      customerCode: customer.customer_code,
      hasService: Boolean(hasService),
      message: hasService ? 'Customer saved successfully' : 'Customer profile saved successfully (No Service Assigned)'
    };
  });
}

/**
 * Update Customer Workflow
 */
async function updateCustomer(custData, adminUser = 'admin') {
  const custId = custData.id;
  let customer = null;

  if (custId) {
    customer = await repos.customers.findById(custId);
  }
  if (!customer && custData.customerNumber && custData.customerName) {
    const normPhone = normalizeIndianMobile(custData.customerNumber);
    const existing = await repos.customers.findByPhone(normPhone);
    customer = existing.find(c => c.name.toLowerCase() === custData.customerName.toLowerCase()) || null;
  }
  if (!customer && custData.rowIndex) {
    const rowIdx = parseInt(custData.rowIndex, 10);
    if (!isNaN(rowIdx) && rowIdx > 0) {
      const byRow = await db.query('SELECT * FROM public.customers WHERE source_row_index = $1 AND deleted_at IS NULL LIMIT 1', [rowIdx]);
      customer = byRow.rows[0] || null;
    }
  }

  if (!customer) {
    // If updating a record not yet in Neon, create it
    return saveCustomer(custData, adminUser);
  }

  return db.withTransaction(async (client) => {
    const rawBefore = await getCustomerById(customer.id);

    // 1. Update Customer Core
    const normPhone = custData.customerNumber ? normalizeIndianMobile(custData.customerNumber) : customer.phone;
    const finalNotes = custData.staffNotes !== undefined ? custData.staffNotes : (custData.notes !== undefined ? custData.notes : customer.notes);
    const finalName = custData.customerName || customer.name;

    let nameHi = custData.nameHi !== undefined ? custData.nameHi : custData.name_hi;
    let addressHi = custData.addressHi !== undefined ? custData.addressHi : custData.address_hi;
    let secAddressHi = custData.secondaryAddressHi !== undefined ? custData.secondaryAddressHi : custData.secondary_address_hi;

    if (nameHi === undefined && finalName) {
      if (customer.name_hi && finalName === customer.name) {
        nameHi = customer.name_hi;
      } else {
        try { nameHi = await indicService.transliterateName(finalName); } catch (e) { nameHi = finalName; }
      }
    }

    const addr = (custData.address || custData.location || '').trim();
    if (addressHi === undefined && addr) {
      try { addressHi = await indicService.transliterateAddress(addr); } catch (e) { addressHi = addr; }
    }

    const secAddr = (custData.secondaryAddress || '').trim();
    if (secAddressHi === undefined && secAddr) {
      try { secAddressHi = await indicService.transliterateAddress(secAddr); } catch (e) { secAddressHi = secAddr; }
    }

    const carMakeUpdate = custData.carMake !== undefined ? custData.carMake : custData.car_make;
    const carColorUpdate = custData.carColor !== undefined ? custData.carColor : custData.car_color;

    const reqCat = (custData.serviceCategory || custData.serviceType || custData.interestedService || '').toString().trim();
    let normCategory = customer.interested_service || 'Daily Car Cleaning';
    if (/solar/i.test(reqCat)) normCategory = 'Solar Panel Cleaning';
    else if (/interior/i.test(reqCat)) normCategory = 'Interior Detailing';
    else if (/exterior/i.test(reqCat)) normCategory = 'Exterior Detailing';
    else if (/wash/i.test(reqCat)) normCategory = 'Car Washing';
    else if (/daily/i.test(reqCat) || /dcc/i.test(reqCat)) normCategory = 'Daily Car Cleaning';

    await repos.customers.updateCustomer(customer.id, {
      name: finalName,
      phone: normPhone,
      altPhone: custData.altPhone,
      email: custData.email,
      notes: finalNotes,
      isActive: custData.active !== undefined ? (custData.active === 'Yes' || custData.active === true) : customer.is_active,
      nameHi,
      addressHi,
      secondaryAddressHi: secAddressHi,
      carMake: carMakeUpdate,
      carColor: carColorUpdate,
      panelCount: custData.panelCount !== undefined ? custData.panelCount : custData.panel_count,
      leadStatus: custData.leadStatus !== undefined ? custData.leadStatus : (custData.lead_status !== undefined ? custData.lead_status : customer.lead_status),
      interestedService: normCategory
    }, client);

    // 2. Synchronize Service Locations (Multi-Location System)
    let primaryLoc = null;
    if (Array.isArray(custData.locations)) {
      const incomingLocations = custData.locations.filter(l => l && (l.addressText || l.address));
      const existingLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
      const incomingIds = new Set(incomingLocations.map(l => l.id).filter(Boolean));

      // Soft delete locations not present in incoming list
      for (const exLoc of existingLocs) {
        if (!incomingIds.has(exLoc.id)) {
          await repos.serviceLocations.softDelete(exLoc.id, client);
        }
      }

      let hasExplicitPrimary = incomingLocations.some(l => l.isPrimary || l.is_primary);
      for (let idx = 0; idx < incomingLocations.length; idx++) {
        const item = incomingLocations[idx];
        const isPrim = hasExplicitPrimary ? Boolean(item.isPrimary || item.is_primary) : (idx === 0);
        const lName = (item.locationName || item.name || item.addressType || (isPrim ? 'Home' : `Location ${idx + 1}`)).trim();
        const aType = (item.addressType || (isPrim ? 'primary' : 'other')).trim().toLowerCase();
        const aText = (item.addressText || item.address || '').trim();
        let aHi = (item.addressTextHi || item.addressHi || '').trim() || null;
        if (!aHi && aText) {
          try { aHi = await indicService.transliterateAddress(aText); } catch (e) { aHi = aText; }
        }
        const mUrl = (item.googleMapsUrl || item.mapsUrl || item.mapLink || '').trim() || null;
        let lat = item.latitude != null ? parseFloat(item.latitude) : null;
        let lng = item.longitude != null ? parseFloat(item.longitude) : null;
        if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && mUrl) {
          const coords = extractCoordinates(mUrl);
          if (coords.latitude != null) {
            lat = coords.latitude;
            lng = coords.longitude;
          }
        }
        const pDetails = (item.parkingDetails || item.parking || '').trim() || null;

        if (item.id && existingLocs.some(e => e.id === item.id)) {
          const updated = await repos.serviceLocations.updateLocation(item.id, {
            locationName: lName,
            addressType: aType,
            addressText: aText,
            addressTextHi: aHi,
            googleMapsUrl: mUrl,
            latitude: lat,
            longitude: lng,
            parkingDetails: pDetails,
            isPrimary: isPrim,
            isActive: true
          }, client);
          if (isPrim && !primaryLoc) primaryLoc = updated;
        } else {
          const created = await repos.serviceLocations.createLocation({
            customerId: customer.id,
            locationName: lName,
            addressType: aType,
            addressText: aText,
            addressTextHi: aHi,
            googleMapsUrl: mUrl,
            latitude: lat,
            longitude: lng,
            parkingDetails: pDetails,
            isPrimary: isPrim,
            isActive: true
          }, client);
          if (isPrim && !primaryLoc) primaryLoc = created;
        }
      }
      if (!primaryLoc) {
        primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);
      }
    } else {
      // Fallback: Update / Upsert Primary Location
      primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);
      if (addr) {
        let lat = custData.latitude != null ? parseFloat(custData.latitude) : null;
        let lng = custData.longitude != null ? parseFloat(custData.longitude) : null;
        if ((lat == null || lng == null || isNaN(lat) || isNaN(lng)) && custData.googleMapsUrl) {
          const coords = extractCoordinates(custData.googleMapsUrl);
          if (coords.latitude != null) { lat = coords.latitude; lng = coords.longitude; }
        }
        if (primaryLoc) {
          await repos.serviceLocations.updateLocation(primaryLoc.id, {
            locationName: custData.locationName || primaryLoc.location_name || 'Home',
            addressText: addr,
            addressTextHi: addressHi,
            googleMapsUrl: custData.googleMapsUrl,
            latitude: lat,
            longitude: lng,
            parkingDetails: custData.parkingDetails
          }, client);
        } else {
          primaryLoc = await repos.serviceLocations.createLocation({
            customerId: customer.id,
            locationName: custData.locationName || 'Home',
            addressType: 'primary',
            addressText: addr,
            addressTextHi: addressHi,
            googleMapsUrl: custData.googleMapsUrl,
            latitude: lat,
            longitude: lng,
            parkingDetails: custData.parkingDetails,
            isPrimary: true
          }, client);
        }
      }

      // 2b. Update / Upsert Secondary Location
      const custLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
      let secondaryLoc = custLocs.find(l => !l.is_primary) || null;
      if (secAddr) {
        let secLat = custData.secondaryLatitude != null ? parseFloat(custData.secondaryLatitude) : null;
        let secLng = custData.secondaryLongitude != null ? parseFloat(custData.secondaryLongitude) : null;
        const secUrl = custData.secondaryMapsUrl || custData.secondGoogleMapsUrl || '';
        if ((secLat == null || secLng == null || isNaN(secLat) || isNaN(secLng)) && secUrl) {
          const coords = extractCoordinates(secUrl);
          if (coords.latitude != null) { secLat = coords.latitude; secLng = coords.longitude; }
        }
        if (secondaryLoc) {
          await repos.serviceLocations.updateLocation(secondaryLoc.id, {
            locationName: custData.secondaryLocationName || secondaryLoc.location_name || 'Office / Alternate',
            addressText: secAddr,
            addressTextHi: secAddressHi,
            googleMapsUrl: secUrl,
            latitude: secLat,
            longitude: secLng,
            parkingDetails: custData.secondaryParkingDetails || ''
          }, client);
        } else {
          await repos.serviceLocations.createLocation({
            customerId: customer.id,
            locationName: custData.secondaryLocationName || 'Office / Alternate',
            addressType: 'secondary',
            addressText: secAddr,
            addressTextHi: secAddressHi,
            googleMapsUrl: secUrl,
            latitude: secLat,
            longitude: secLng,
            parkingDetails: custData.secondaryParkingDetails || '',
            isPrimary: false
          }, client);
        }
      }
    }

    // 3. Update / Upsert Vehicle
    const rawVeh = (custData.vehicle || custData.vehicleDetails || '').trim();
    if (rawVeh) {
      const parsed = parseVehicleString(rawVeh);
      const existingVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
      if (existingVehs.length > 0) {
        await repos.vehicles.updateVehicle(existingVehs[0].id, {
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || existingVehs[0].brand_or_model,
          photoUrl: custData.photoUrl || existingVehs[0].photo_url,
          carMake: carMakeUpdate !== undefined ? carMakeUpdate : existingVehs[0].car_make,
          carColor: carColorUpdate !== undefined ? carColorUpdate : existingVehs[0].car_color,
          seaterType: custData.seaterType || custData.seater_type || existingVehs[0].seater_type
        }, client);
      } else if (parsed.reg) {
        await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLoc?.id || null,
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || null,
          photoUrl: custData.photoUrl || null,
          carMake: carMakeUpdate || null,
          carColor: carColorUpdate || null,
          seaterType: custData.seaterType || custData.seater_type || '5_seater'
        }, client);
      }
    } else if (carMakeUpdate !== undefined || carColorUpdate !== undefined || custData.seaterType !== undefined || custData.seater_type !== undefined) {
      const existingVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
      if (existingVehs.length > 0) {
        await repos.vehicles.updateVehicle(existingVehs[0].id, {
          carMake: carMakeUpdate,
          carColor: carColorUpdate,
          seaterType: custData.seaterType || custData.seater_type || existingVehs[0].seater_type
        }, client);
      }
    }

    // 4. Update Staff Assignment
    const hasExplicitStaffField = (custData.staffId !== undefined || custData.staffName !== undefined);
    const sName = (custData.staffName || '').trim();
    const sId = (custData.staffId || '').trim();

    let targetStaff = null;
    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      targetStaff = await repos.staff.findByStaffCode(sId, client);
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      targetStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase()) || null;
    }

    // Check existing subscription
    const sub = await repos.subscriptions.findActiveByCustomerId(customer.id, client);
    if (normCategory === 'Daily Car Cleaning') {
      if (sub) {
        if (custData.packageType || custData.packageName) {
          await repos.subscriptions.updateSubscription(sub.id, {
            packageName: custData.packageType || custData.packageName
          }, client);
        }
        if (targetStaff) {
          await repos.staffAssignments.assignStaffToSubscription({
            staffId: targetStaff.id,
            subscriptionId: sub.id,
            assignedBy: adminUser
          }, client);
        } else if (hasExplicitStaffField && (sName.toLowerCase() === 'unassigned' || sId.toLowerCase() === 'unassigned')) {
          await repos.staffAssignments.unassignSubscription({
            subscriptionId: sub.id,
            unassignedBy: adminUser,
            reason: 'Customer unassigned by admin'
          }, client);
        }
      } else {
        const newSub = await repos.subscriptions.createSubscription({
          customerId: customer.id,
          serviceCategoryId: 'daily_car_cleaning',
          packageName: custData.packageType || custData.packageName || 'Daily Clean',
          status: 'active'
        }, client);
        if (targetStaff) {
          await repos.staffAssignments.assignStaffToSubscription({
            staffId: targetStaff.id,
            subscriptionId: newSub.id,
            assignedBy: adminUser
          }, client);
        }
      }
    } else {
      // On-demand service category (Solar, Car Wash, Detailing)
      if (sub) {
        await repos.subscriptions.cancelSubscription(sub.id, client);
        await repos.staffAssignments.unassignSubscription({
          subscriptionId: sub.id,
          unassignedBy: adminUser,
          reason: `Changed service category to ${normCategory}`
        }, client);
      }
      const existingJobs = await repos.serviceJobs.findByCustomerId(customer.id, { client });
      const isSolar = normCategory === 'Solar Panel Cleaning';
      const sCatId = resolveCanonicalCategory(normCategory);
      const parsedPanelCount = isSolar ? (parseInt(custData.panelCount || custData.panel_count, 10) || customer.panel_count || 10) : null;
      const parsedSeaterType = isSolar ? null : (custData.seaterType || custData.seater_type || '5_seater');

      let targetJobId = null;
      if (existingJobs.length > 0) {
        targetJobId = existingJobs[0].id;
        await repos.serviceJobs.updateJob(targetJobId, {
          serviceCategoryId: sCatId,
          serviceType: custData.serviceType || custData.packageType || normCategory,
          packageDetails: custData.packageType || null,
          seaterType: parsedSeaterType,
          panelCount: parsedPanelCount,
          siteDetails: isSolar ? { panelCount: parsedPanelCount, roofType: 'RCC' } : null,
          status: targetStaff ? 'assigned' : (existingJobs[0].status === 'assigned' && !targetStaff ? 'pending' : existingJobs[0].status),
          specialInstructions: finalNotes || null
        }, client);
      } else {
        const custVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
        const custLocs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
        const createdJob = await repos.serviceJobs.createJob({
          customerId: customer.id,
          vehicleId: custVehs[0]?.id || null,
          locationId: primaryLoc?.id || custLocs[0]?.id || null,
          serviceCategoryId: sCatId,
          serviceType: custData.serviceType || custData.packageType || normCategory,
          packageDetails: custData.packageType || null,
          seaterType: parsedSeaterType,
          panelCount: parsedPanelCount,
          siteDetails: isSolar ? { panelCount: parsedPanelCount, roofType: 'RCC' } : null,
          status: targetStaff ? 'assigned' : 'pending',
          specialInstructions: finalNotes || null
        }, client);
        targetJobId = createdJob.id;
      }

      // Synchronize Staff Assignment for On-Demand Job
      if (targetStaff && targetJobId) {
        await repos.staffAssignments.assignStaffToJob({
          staffId: targetStaff.id,
          jobId: targetJobId,
          assignedBy: adminUser
        }, client);
      } else if (targetJobId && hasExplicitStaffField && (sName.toLowerCase() === 'unassigned' || sId.toLowerCase() === 'unassigned')) {
        await repos.staffAssignments.unassignJob({
          jobId: targetJobId,
          unassignedBy: adminUser,
          reason: 'Customer unassigned by admin'
        }, client);
      }
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'update',
      changedBy: adminUser,
      beforeState: { name: rawBefore.customer.name, phone: rawBefore.customer.phone },
      afterState: { name: custData.customerName || customer.name, phone: normPhone }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      message: 'Customer updated successfully'
    };
  });
}

/**
 * Soft Delete Customer with Mandatory Reason
 */
async function deleteCustomer(id, { reason = 'Administrative deletion', adminUser = 'admin' } = {}) {
  const target = (id || '').toString().trim();
  if (!target) {
    return { success: false, error: 'Customer ID is required.' };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target);
  let customer = null;
  if (isUuid) {
    customer = await repos.customers.findById(target);
  }
  if (!customer) {
    customer = await repos.customers.findByCode(target);
  }
  if (!customer) {
    return { success: false, error: 'Customer not found.' };
  }

  return db.withTransaction(async (client) => {
    // 1. Soft delete customer
    await repos.customers.softDelete(customer.id, {
      deletedBy: adminUser,
      deletionReason: reason
    }, client);

    // 2. Deactivate any active staff assignments for customer subscriptions and cancel subscriptions
    const subs = await repos.subscriptions.findByCustomerId(customer.id, { client });
    for (const sub of subs) {
      if (repos.subscriptions.cancelSubscription) {
        await repos.subscriptions.cancelSubscription(sub.id, client);
      }
      await repos.staffAssignments.unassignSubscription({
        subscriptionId: sub.id,
        unassignedBy: adminUser,
        reason: `Customer deleted: ${reason}`
      }, client);
    }

    // 3. Deactivate any active jobs
    const jobs = await repos.serviceJobs.findAll({ customerId: customer.id, client });
    for (const j of jobs) {
      await repos.serviceJobs.softDelete(j.id, client);
      await repos.staffAssignments.unassignJob({
        jobId: j.id,
        unassignedBy: adminUser,
        reason: `Customer deleted: ${reason}`
      }, client);
    }

    // 4. Soft delete locations and vehicles
    const locs = await repos.serviceLocations.findByCustomerId(customer.id, { client });
    for (const loc of locs) {
      await repos.serviceLocations.softDelete(loc.id, client);
    }
    const vehs = await repos.vehicles.findByCustomerId(customer.id, { client });
    for (const veh of vehs) {
      await repos.vehicles.softDelete(veh.id, client);
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'delete',
      changedBy: adminUser,
      beforeState: { name: customer.name, customerCode: customer.customer_code },
      afterState: { deleted: true, reason }
    }, client);

    return { success: true, message: `Customer ${customer.name} deleted successfully.` };
  });
}

/**
 * Staff List with Role Sanitization (Public hides PIN & Phone; Admin exposes display PIN)
 */
async function getStaffList({ isAdmin = true } = {}) {
  const staffMembers = await repos.staff.findAll({ includeInactive: true });
  const allDesigs = await staffDesignationService.getAllDesignations({ includeInactive: true }).catch(() => []);
  const desigMap = new Map();
  for (const d of allDesigs) {
    if (d.id) desigMap.set(String(d.id).toLowerCase(), d);
    if (d.code) desigMap.set(String(d.code).toLowerCase(), d);
  }
  const staffMap = new Map();
  for (const s of staffMembers) {
    if (s.id) staffMap.set(String(s.id), s);
    if (s.staff_code) staffMap.set(String(s.staff_code), s);
  }

  const results = [];

  for (const s of staffMembers) {
    const desigKey = (s.designation_id || s.designationId || 'cleaner').toString().toLowerCase();
    const desig = desigMap.get(desigKey) || desigMap.get('cleaner');
    const mgr = s.reports_to_id ? staffMap.get(String(s.reports_to_id)) : null;

    if (!isAdmin) {
      results.push({
        id: s.staff_code,
        name: s.name,
        photoUrl: s.photo_url || '',
        active: s.is_active ? 'Yes' : 'No',
        designationId: desig ? desig.id : (s.designation_id || 'cleaner'),
        designationName: desig ? desig.name : 'Cleaner'
      });
    } else {
      const auth = await repos.staffAuth.findByStaffId(s.id);
      let displayPin = '';
      if (auth && auth.display_pin) {
        displayPin = auth.display_pin;
      } else if (auth && auth.pin_hash && /^\d{6}$/.test(auth.pin_hash)) {
        displayPin = auth.pin_hash;
      } else if (s.staff_code === 'STF01') {
        displayPin = '123456';
      } else if (s.staff_code === 'STF02') {
        displayPin = '654321';
      }
      const isLocked = Boolean(auth && auth.locked_until && new Date() < new Date(auth.locked_until));
      const activeSess = await repos.authSessions.findActiveForStaff(s.id);
      results.push({
        id: s.staff_code,
        dbId: s.id,
        name: s.name,
        phone: s.phone,
        photoUrl: s.photo_url || '',
        active: s.is_active ? 'Yes' : 'No',
        isActive: s.is_active,
        isLocked: isLocked,
        hasActiveSession: Boolean(activeSess),
        activeDeviceId: activeSess ? activeSess.device_id : null,
        failedAttempts: auth ? (auth.failed_attempts || 0) : 0,
        lockedUntil: auth && auth.locked_until ? auth.locked_until : null,
        pin: displayPin,
        displayPin: displayPin,
        hasPin: Boolean(auth && auth.pin_hash),
        email: s.email || '',
        dateOfJoining: s.date_of_joining ? (s.date_of_joining.toISOString ? s.date_of_joining.toISOString().split('T')[0] : String(s.date_of_joining).split('T')[0]) : '',
        aadharNumber: s.aadhar_number || '',
        aadharFrontUrl: s.aadhar_front_url || '',
        aadharBackUrl: s.aadhar_back_url || '',
        bankPassbookUrl: s.bank_passbook_url || '',
        panNumber: s.pan_number || '',
        panCardUrl: s.pan_card_url || '',
        drivingLicenseNumber: s.driving_license_number || '',
        drivingLicenseUrl: s.driving_license_url || '',
        salary: s.salary !== null && s.salary !== undefined ? Number(s.salary) : '',
        weeklyOff: s.weekly_off || '',
        workType: s.work_type || 'dcc_only',
        work_type: s.work_type || 'dcc_only',
        serviceCapabilities: s.service_capabilities || ['daily_car_cleaning'],
        service_capabilities: s.service_capabilities || ['daily_car_cleaning'],
        designationId: desig ? desig.id : (s.designation_id || 'cleaner'),
        designation_id: desig ? desig.id : (s.designation_id || 'cleaner'),
        designationName: desig ? desig.name : 'Cleaner',
        designationLevel: desig ? desig.hierarchyLevel : 1,
        isSupervisory: desig ? Boolean(desig.isSupervisory) : false,
        authorities: desig ? (desig.authorities || {}) : {},
        reportsToId: s.reports_to_id || null,
        reports_to_id: s.reports_to_id || null,
        reportsToName: mgr ? mgr.name : '',
        reportsToCode: mgr ? mgr.staff_code : '',
        teamName: s.team_name || '',
        team_name: s.team_name || '',
        operationalScope: s.operational_scope || '',
        operational_scope: s.operational_scope || '',
        createdAt: s.created_at
      });
    }
  }

  return results;
}

/**
 * Save / Create Staff Member
 */
async function saveStaffMember({
  staffId,
  staffCode,
  name,
  phone,
  pin,
  photoUrl,
  active = true,
  email,
  dateOfJoining,
  aadharNumber,
  aadharFrontUrl,
  aadharBackUrl,
  bankPassbookUrl,
  panNumber,
  panCardUrl,
  drivingLicenseNumber,
  drivingLicenseUrl,
  salary,
  weeklyOff,
  workType,
  work_type,
  serviceCapabilities,
  service_capabilities,
  designationId,
  designation_id,
  reportsToId,
  reports_to_id,
  teamName,
  team_name,
  operationalScope,
  operational_scope
}, adminUser = 'admin') {
  if (!name || !name.trim()) {
    return { success: false, error: 'Staff name is required.' };
  }

  const codeInput = (staffCode || staffId || '').toString().trim();

  return db.withTransaction(async (client) => {
    let staff = null;
    let isNew = false;

    if (codeInput) {
      staff = await repos.staff.findByStaffCode(codeInput, client);
      if (!staff && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(codeInput)) {
        staff = await repos.staff.findById(codeInput, client);
      }
    }

    const cleanPhone = phone ? normalizeIndianMobile(phone) : (staff ? staff.phone : '');
    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      return { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }

    // Phone uniqueness check among all staff members
    const existingPhoneStaff = await repos.staff.findByPhone(cleanPhone, client);
    if (existingPhoneStaff && (!staff || existingPhoneStaff.id !== staff.id)) {
      return {
        success: false,
        error: `Mobile number ${cleanPhone} is already registered to another staff member (${existingPhoneStaff.name}). Staff mobile number must be unique.`
      };
    }

    const isNowActive = active === true || active === 'Yes' || active === 'yes' || active === 'true';

    // Work-Type & Service Capabilities Validation
    const inputWorkType = (work_type || workType || (staff ? (staff.work_type || staff.workType) : 'dcc_only') || 'dcc_only').toLowerCase().trim();
    const inputCaps = service_capabilities !== undefined ? service_capabilities : (serviceCapabilities !== undefined ? serviceCapabilities : (staff ? (staff.service_capabilities || staff.serviceCapabilities) : ['daily_car_cleaning']));

    const validatedCap = staffCapabilityService.validateCapabilityCombination(inputWorkType, inputCaps);

    // If updating existing staff, check for operational conflicts (active routes or active service jobs)
    if (staff && staff.id) {
      await staffCapabilityService.checkCapabilityChangeConflicts(staff.id, validatedCap.workType, validatedCap.serviceCapabilities, client);
    }

    // Designation resolution & validation
    const rawDesigId = designation_id !== undefined ? designation_id : designationId;
    let resolvedDesignationId = rawDesigId !== undefined ? (rawDesigId ? String(rawDesigId).trim().toLowerCase() : null) : (staff ? (staff.designation_id || staff.designationId) : null);

    if (!resolvedDesignationId && !staff) {
      resolvedDesignationId = 'cleaner';
    }

    if (resolvedDesignationId) {
      const desig = await staffDesignationService.getDesignationById(resolvedDesignationId);
      if (!desig) {
        return { success: false, error: `Invalid designation specified: '${resolvedDesignationId}'.` };
      }
      resolvedDesignationId = desig.id;
    }

    // Reports-to / Manager resolution & validation
    const rawReportsTo = reports_to_id !== undefined ? reports_to_id : reportsToId;
    let resolvedReportsToId = rawReportsTo !== undefined ? (rawReportsTo ? String(rawReportsTo).trim() : null) : (staff ? (staff.reports_to_id || staff.reportsToId) : null);

    if (resolvedReportsToId === '' || resolvedReportsToId === 'null' || resolvedReportsToId === 'none' || resolvedReportsToId === 'undefined') {
      resolvedReportsToId = null;
    }

    if (resolvedReportsToId) {
      try {
        await staffDesignationService.validateReportingRelationship(
          staff ? staff.id : null,
          resolvedReportsToId,
          client,
          resolvedDesignationId
        );
      } catch (hierErr) {
        return { success: false, error: hierErr.message };
      }
    }

    const rawTeamName = team_name !== undefined ? team_name : teamName;
    const resolvedTeamName = rawTeamName !== undefined ? (rawTeamName ? String(rawTeamName).trim() : null) : (staff ? staff.team_name : null);

    const rawOpScope = operational_scope !== undefined ? operational_scope : operationalScope;
    const resolvedOperationalScope = rawOpScope !== undefined ? (rawOpScope ? String(rawOpScope).trim() : null) : (staff ? staff.operational_scope : null);

    if (!staff) {
      isNew = true;
      if (!pin || !/^\d{6}$/.test(pin.trim())) {
        return { success: false, error: 'A 6-digit PIN is required to create a new staff member. (PIN is required for new staff)' };
      }

      // Generate staff code e.g. STF03 if none provided
      let code = codeInput ? codeInput.toUpperCase() : '';
      if (!code) {
        const count = await repos.staff.countStaff(client);
        code = `STF${String(count + 1).padStart(2, '0')}`;
      }

      staff = await repos.staff.createStaff({
        staffCode: code,
        name: name.trim(),
        phone: cleanPhone,
        photoUrl: photoUrl !== undefined ? photoUrl : null,
        isActive: isNowActive,
        email: email !== undefined ? email : null,
        dateOfJoining: dateOfJoining !== undefined ? dateOfJoining : null,
        aadharNumber: aadharNumber !== undefined ? aadharNumber : null,
        aadharFrontUrl: aadharFrontUrl !== undefined ? aadharFrontUrl : null,
        aadharBackUrl: aadharBackUrl !== undefined ? aadharBackUrl : null,
        bankPassbookUrl: bankPassbookUrl !== undefined ? bankPassbookUrl : null,
        panNumber: panNumber !== undefined ? panNumber : null,
        panCardUrl: panCardUrl !== undefined ? panCardUrl : null,
        drivingLicenseNumber: drivingLicenseNumber !== undefined ? drivingLicenseNumber : null,
        drivingLicenseUrl: drivingLicenseUrl !== undefined ? drivingLicenseUrl : null,
        salary: salary !== undefined ? salary : null,
        weeklyOff: weeklyOff !== undefined ? weeklyOff : null,
        workType: validatedCap.workType,
        serviceCapabilities: validatedCap.serviceCapabilities,
        designationId: resolvedDesignationId,
        reportsToId: resolvedReportsToId,
        teamName: resolvedTeamName,
        operationalScope: resolvedOperationalScope
      }, client);
    } else {
      // Update existing
      const updateData = {
        name: name.trim(),
        phone: cleanPhone,
        isActive: isNowActive,
        workType: validatedCap.workType,
        serviceCapabilities: validatedCap.serviceCapabilities
      };
      if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
      if (email !== undefined) updateData.email = email;
      if (dateOfJoining !== undefined) updateData.dateOfJoining = dateOfJoining;
      if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber;
      if (aadharFrontUrl !== undefined) updateData.aadharFrontUrl = aadharFrontUrl;
      if (aadharBackUrl !== undefined) updateData.aadharBackUrl = aadharBackUrl;
      if (bankPassbookUrl !== undefined) updateData.bankPassbookUrl = bankPassbookUrl;
      if (panNumber !== undefined) updateData.panNumber = panNumber;
      if (panCardUrl !== undefined) updateData.panCardUrl = panCardUrl;
      if (drivingLicenseNumber !== undefined) updateData.drivingLicenseNumber = drivingLicenseNumber;
      if (drivingLicenseUrl !== undefined) updateData.drivingLicenseUrl = drivingLicenseUrl;
      if (salary !== undefined) updateData.salary = salary;
      if (weeklyOff !== undefined) updateData.weeklyOff = weeklyOff;
      if (resolvedDesignationId !== undefined) updateData.designationId = resolvedDesignationId;
      if (rawReportsTo !== undefined) updateData.reportsToId = resolvedReportsToId;
      if (rawTeamName !== undefined) updateData.teamName = resolvedTeamName;
      if (rawOpScope !== undefined) updateData.operationalScope = resolvedOperationalScope;

      staff = await repos.staff.updateStaff(staff.id, updateData, client);
    }

    // Update PIN if provided and valid
    if (pin && /^\d{6}$/.test(pin.trim())) {
      const pinHash = authService.hashPinScrypt(pin.trim());
      const salt = pinHash.split(':')[1];
      await repos.staffAuth.setPin(staff.id, pinHash, salt, client, pin.trim());
    }

    // Revoke sessions immediately if staff deactivated
    if (!isNowActive && staff && staff.id) {
      await authService.revokeAllStaffSessions(staff.id, `deactivated_by_${adminUser}`);
    }

    // Audit Log
    await repos.auditLogs.logChange({
      entityType: 'staff',
      entityId: staff.id,
      action: isNew ? 'create' : 'update',
      changedBy: adminUser,
      afterState: {
        staffCode: staff.staff_code,
        name: staff.name,
        phone: staff.phone,
        workType: validatedCap.workType,
        serviceCapabilities: validatedCap.serviceCapabilities,
        designationId: resolvedDesignationId,
        reportsToId: resolvedReportsToId,
        teamName: resolvedTeamName,
        operationalScope: resolvedOperationalScope
      }
    }, client);

    return {
      success: true,
      staffId: staff.staff_code,
      message: `Staff member ${staff.name} saved successfully.`
    };
  });
}

/**
 * Delete Staff Member (Soft Delete with Session Revocation & Audit Logging)
 */
async function deleteStaffMember(staffCodeOrId, adminUser = 'admin') {
  const target = (staffCodeOrId || '').toString().trim();
  if (!target) {
    return { success: false, error: 'Staff ID or Code is required.' };
  }

  let staff = await repos.staff.findByStaffCode(target);
  if (!staff) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target);
    if (isUuid) {
      staff = await repos.staff.findById(target);
    }
  }
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  return db.withTransaction(async (client) => {
    // 1. Soft delete staff record
    await repos.staff.softDelete(staff.id, client);

    // 2. Revoke all active sessions for this staff member
    await authService.revokeAllStaffSessions(staff.id, `deleted_by_${adminUser}`);

    // 3. Unassign from all active subscriptions and jobs
    if (repos.staffAssignments && repos.staffAssignments.unassignAllForStaff) {
      await repos.staffAssignments.unassignAllForStaff(staff.id, adminUser, `Staff deleted by ${adminUser}`, client);
    }

    // 4. Reset route sequence
    if (repos.staffRouteSequences && repos.staffRouteSequences.resetStaffRoute) {
      await repos.staffRouteSequences.resetStaffRoute(staff.id, client);
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'staff',
      entityId: staff.id,
      action: 'delete',
      changedBy: adminUser,
      beforeState: { staffCode: staff.staff_code, name: staff.name, phone: staff.phone },
      afterState: { deleted: true }
    }, client);

    return {
      success: true,
      staffId: staff.staff_code,
      message: `Staff member ${staff.name} deleted successfully.`
    };
  });
}

/**
 * Toggle Staff Active / Inactive
 */
async function toggleStaffActive(staffCode, isActive, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  const updated = await repos.staff.toggleActive(staff.id, isActive);
  if (!isActive) {
    // Revoke all active sessions immediately
    await authService.revokeAllStaffSessions(staff.id, `deactivated_by_${adminUser}`);
  }

  await repos.auditLogs.logChange({
    entityType: 'staff',
    entityId: staff.id,
    action: 'toggle_active',
    changedBy: adminUser,
    afterState: { staffCode: staff.staff_code, is_active: isActive }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    active: isActive ? 'Yes' : 'No',
    message: `Staff ${staff.name} is now ${isActive ? 'Active' : 'Inactive'}.`
  };
}

/**
 * Route Sequence Management
 */
async function getStaffSequence(staffCode) {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  const staffData = await staffPortalService.getStaffData(staff.id);
  const customers = staffData.dailyCarCleaning || [];
  const stops = await repos.staffRouteSequences.getStaffRoute(staff.id);

  return {
    success: true,
    staffId: staff.staff_code,
    staffName: staff.name,
    customers: customers,
    sequences: stops,
    hasCustomSequence: stops.length > 0,
    totalCount: customers.length
  };
}

async function saveStaffSequence(staffCode, sequenceStops, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  // Fetch active subscriptions for this staff member to resolve any customerId -> subscriptionId mappings
  const staffSubs = await db.query(
    `SELECT sub.id AS subscription_id, sub.customer_id, sv.id AS subscription_vehicle_id
     FROM public.staff_assignments sa
     JOIN public.subscriptions sub ON sa.subscription_id = sub.id
     LEFT JOIN public.subscription_vehicles sv ON sv.subscription_id = sub.id
     WHERE sa.staff_id = $1 AND sa.is_active = TRUE AND sub.status = 'active'`,
    [staff.id]
  );

  const custSubMap = new Map();
  for (const row of staffSubs.rows) {
    if (!custSubMap.has(row.customer_id)) {
      custSubMap.set(row.customer_id, row);
    }
  }

  const mappedStops = sequenceStops.map(s => {
    if (typeof s === 'string') {
      const sub = custSubMap.get(s);
      return { subscriptionId: sub?.subscription_id, subscriptionVehicleId: sub?.subscription_vehicle_id };
    }
    if (s.subscriptionId) return s;
    if (s.customerId && custSubMap.has(s.customerId)) {
      const sub = custSubMap.get(s.customerId);
      return {
        ...s,
        subscriptionId: sub.subscription_id,
        subscriptionVehicleId: s.subscriptionVehicleId || sub.subscription_vehicle_id
      };
    }
    return s;
  });

  const saved = await repos.staffRouteSequences.setStaffRoute(staff.id, mappedStops, adminUser);

  await repos.auditLogs.logChange({
    entityType: 'staff_route_sequences',
    entityId: staff.id,
    action: 'save_sequence',
    changedBy: adminUser,
    afterState: { stopCount: saved.length }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    message: `Route sequence saved with ${saved.length} stops.`
  };
}

async function resetStaffSequence(staffCode, adminUser = 'admin') {
  const staff = await repos.staff.findByStaffCode(staffCode);
  if (!staff) {
    return { success: false, error: 'Staff member not found.' };
  }

  await repos.staffRouteSequences.resetStaffRoute(staff.id);

  await repos.auditLogs.logChange({
    entityType: 'staff_route_sequences',
    entityId: staff.id,
    action: 'reset_sequence',
    changedBy: adminUser,
    afterState: { reset: true }
  });

  return {
    success: true,
    staffId: staff.staff_code,
    message: `Route sequence reset to default order.`
  };
}

function computeConsecutiveTimes(records) {
  if (!Array.isArray(records) || records.length === 0) return records;
  const staffMap = {};
  records.forEach(r => {
    const sKey = r.staff_id || r.staff_code || 'unknown';
    if (!staffMap[sKey]) staffMap[sKey] = [];
    staffMap[sKey].push(r);
  });

  Object.values(staffMap).forEach(list => {
    list.sort((a, b) => new Date(a.completed_at_device || 0) - new Date(b.completed_at_device || 0));
    list.forEach((curr, idx) => {
      const cleanDuration = (curr.device_metadata && curr.device_metadata.durationMinutes) ? curr.device_metadata.durationMinutes : 10;
      curr.cleaningDurationMinutes = cleanDuration;
      if (idx === 0) {
        curr.transitDurationMinutes = null;
        curr.prevLocation = null;
      } else {
        const prev = list[idx - 1];
        const diffMs = new Date(curr.completed_at_device || 0).getTime() - new Date(prev.completed_at_device || 0).getTime();
        const totalCycle = Math.max(1, Math.round(diffMs / 60000));
        curr.transitDurationMinutes = Math.max(1, totalCycle - cleanDuration);
        curr.prevLocation = prev.address_text || prev.parking_details || null;
      }
    });
  });

  return records;
}

async function getDailyCleanReports(filters = {}, adminUser = 'admin') {
  const result = await repos.serviceLogs.queryDailyCleanReports(filters);
  const records = computeConsecutiveTimes(result.records || []);

  let pendingRecords = [];
  const staffMatrixMap = {};

  try {
    const todayIst = filters.startDate || repos.serviceLogs.computeIstServiceDate(new Date().toISOString());
    const allStaff = await repos.staff.findAll({ includeInactive: false });
    
    allStaff.forEach(s => {
      staffMatrixMap[s.id] = {
        staffId: s.id,
        staffCode: s.staff_code,
        staffName: s.name,
        photoUrl: s.photo_url || null,
        phone: s.phone,
        cleanedCount: 0,
        pendingCount: 0,
        totalAssigned: 0,
        lastPunchTime: null,
        lastLocation: null,
        status: 'Shift Starting ⏳'
      };
    });

    records.forEach(r => {
      const sId = r.staff_id;
      if (staffMatrixMap[sId]) {
        staffMatrixMap[sId].cleanedCount++;
        if (!staffMatrixMap[sId].lastPunchTime || new Date(r.completed_at_device) > new Date(staffMatrixMap[sId].lastPunchTime)) {
          staffMatrixMap[sId].lastPunchTime = r.completed_at_device;
          staffMatrixMap[sId].lastLocation = r.address_text || r.parking_details || 'Field';
        }
      }
    });

    const pendingSql = `
      SELECT 
        sv.subscription_id, sv.vehicle_id, sv.sequence_order,
        s.id AS staff_id, s.name AS staff_name, s.staff_code,
        c.id AS customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
        v.registration_no, v.brand_or_model, v.car_make, v.car_color,
        loc.address_text, loc.parking_details, loc.google_maps_url
      FROM public.subscription_vehicles sv
      JOIN public.subscriptions sub ON sv.subscription_id = sub.id AND sub.is_active = TRUE
      JOIN public.customers c ON sub.customer_id = c.id AND c.is_active = TRUE
      JOIN public.vehicles v ON sv.vehicle_id = v.id
      LEFT JOIN public.service_locations loc ON sv.location_id = loc.id
      LEFT JOIN public.staff_assignments sa ON sa.subscription_id = sub.id AND sa.is_active = TRUE
      LEFT JOIN public.staff s ON sa.staff_id = s.id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_logs sl
        WHERE sl.subscription_id = sv.subscription_id
          AND sl.vehicle_id = sv.vehicle_id
          AND sl.service_date = $1
      )
      ORDER BY sv.sequence_order ASC NULLS LAST, sv.created_at ASC
    `;

    const pendingRes = await db.query(pendingSql, [todayIst]);
    if (pendingRes && pendingRes.rows) {
      pendingRecords = pendingRes.rows.map((row, idx) => {
        if (row.staff_id && staffMatrixMap[row.staff_id]) {
          staffMatrixMap[row.staff_id].pendingCount++;
        }
        return {
          id: 'pending_' + (row.subscription_id || '') + '_' + (row.vehicle_id || '') + '_' + idx,
          isPending: true,
          status: 'pending',
          service_date: todayIst,
          sequence_order: row.sequence_order || (idx + 1),
          staff_id: row.staff_id,
          staff_name: row.staff_name || 'Unassigned',
          staff_code: row.staff_code || '',
          customer_id: row.customer_id,
          customer_code: row.customer_code,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          registration_no: row.registration_no,
          brand_or_model: row.brand_or_model,
          car_make: row.car_make,
          car_color: row.car_color,
          address_text: row.address_text,
          parking_details: row.parking_details,
          google_maps_url: row.google_maps_url,
          photo_url: null,
          cleaningDurationMinutes: null,
          transitDurationMinutes: null
        };
      });
    }

    const now = Date.now();
    Object.values(staffMatrixMap).forEach(s => {
      s.totalAssigned = s.cleanedCount + s.pendingCount;
      if (s.cleanedCount > 0 && s.pendingCount === 0) {
        s.status = 'Route Finished 🏁';
      } else if (s.lastPunchTime) {
        const minsSince = Math.round((now - new Date(s.lastPunchTime).getTime()) / 60000);
        if (minsSince <= 20) s.status = 'Active on Route 🟢';
        else if (minsSince <= 45) s.status = 'In Transit 🟡';
        else s.status = 'Idle / Break 🟠';
      }
    });
  } catch (err) {}

  const staffMatrix = Object.values(staffMatrixMap);
  const totalPending = pendingRecords.length;
  const totalCleaned = result.summary ? result.summary.totalCleaned : records.length;
  const totalScheduled = totalCleaned + totalPending;

  return {
    success: true,
    records,
    pendingRecords,
    summary: {
      ...(result.summary || {}),
      totalCleaned,
      totalPending,
      totalScheduled,
      staffMatrix
    },
    filterApplied: result.filterApplied,
    fetchedAt: new Date().toISOString()
  };
}

async function updateDailyCleanReportStatus({ reportId, status, reason = '', adminUser = 'admin' }) {
  if (!reportId) throw new Error('reportId is required');
  const validStatuses = ['completed', 'car_not_present', 'customer_absent', 'vehicle_not_available', 'skipped', 'unable_to_complete'];
  if (!status || !validStatuses.includes(status)) {
    throw new Error(`Valid status (${validStatuses.join(', ')}) is required`);
  }

  const existing = await repos.serviceLogs.findById(reportId);
  if (!existing) {
    throw new Error(`Service report with id '${reportId}' not found`);
  }

  const updated = await repos.serviceLogs.updateStatusAndReason(reportId, {
    status,
    adminNotes: reason,
    adminUser
  });

  try {
    await repos.auditLogs.logChange({
      entityType: 'service_log',
      entityId: reportId,
      action: 'update_clean_report_status',
      changedBy: adminUser,
      beforeState: { status: existing.status, car_not_present: existing.car_not_present, tag: existing.tag },
      afterState: { status: updated.status, car_not_present: updated.car_not_present, admin_notes: reason }
    });
  } catch (aErr) {
    console.warn('[AuditLog] Failed to log clean report status update:', aErr.message);
  }

  return {
    success: true,
    report: updated,
    message: `Report status updated to '${status}' successfully`
  };
}

async function deleteDailyCleanReport({ reportId, reason = '', adminUser = 'admin' }) {
  if (!reportId) throw new Error('reportId is required');

  const existing = await repos.serviceLogs.findById(reportId);
  if (!existing) {
    throw new Error(`Service report with id '${reportId}' not found`);
  }

  const deleted = await repos.serviceLogs.deleteReport(reportId);

  try {
    await repos.auditLogs.logChange({
      entityType: 'service_log',
      entityId: reportId,
      action: 'delete_clean_report',
      changedBy: adminUser,
      beforeState: existing,
      afterState: { deleted: true, reason }
    });
  } catch (aErr) {
    console.warn('[AuditLog] Failed to log clean report deletion:', aErr.message);
  }

  return {
    success: true,
    deleted: true,
    message: 'Report deleted successfully'
  };
}

async function backfillHindiCustomerData(adminUser = 'admin') {
  const allCusts = await repos.customers.findAll({ includeDeleted: false, limit: 1000 });
  let updatedCount = 0;

  for (const c of allCusts) {
    let needsUpdate = false;
    let nameHi = c.name_hi;
    let addrHi = c.address_hi;
    let secAddrHi = c.secondary_address_hi;

    if (!nameHi && c.name) {
      try {
        nameHi = await indicService.transliterateName(c.name);
        needsUpdate = true;
      } catch (e) {
        nameHi = c.name;
      }
    }

    const locs = await repos.serviceLocations.findByCustomerId(c.id);
    const primaryLoc = locs.find(l => l.is_primary) || locs[0] || null;
    const secLoc = locs.find(l => !l.is_primary) || (locs.length > 1 ? locs[1] : null);

    if (primaryLoc && (!primaryLoc.address_text_hi || !addrHi)) {
      try {
        const trans = await indicService.transliterateAddress(primaryLoc.address_text);
        addrHi = trans;
        await repos.serviceLocations.updateLocation(primaryLoc.id, { addressTextHi: trans });
        needsUpdate = true;
      } catch (e) {
        addrHi = primaryLoc.address_text;
      }
    }

    if (secLoc && (!secLoc.address_text_hi || !secAddrHi)) {
      try {
        const transSec = await indicService.transliterateAddress(secLoc.address_text);
        secAddrHi = transSec;
        await repos.serviceLocations.updateLocation(secLoc.id, { addressTextHi: transSec });
        needsUpdate = true;
      } catch (e) {
        secAddrHi = secLoc.address_text;
      }
    }

    if (needsUpdate) {
      await repos.customers.updateCustomer(c.id, {
        nameHi,
        addressHi: addrHi,
        secondaryAddressHi: secAddrHi
      });
      updatedCount++;
    }
  }

  try {
    await repos.auditLogs.logChange({
      entityType: 'customers',
      entityId: 'ALL_CUSTOMERS',
      action: 'backfill_hindi',
      changedBy: adminUser,
      afterState: { total: allCusts.length, updated: updatedCount }
    });
  } catch (auditErr) {
    console.warn('[Audit] backfill log skipped:', auditErr.message);
  }

  return { success: true, total: allCusts.length, updated: updatedCount };
}

/**
 * Retrieve all Leads
 */
async function getLeads({ search = '', limit = 500, offset = 0 } = {}) {
  return getAllCustomers({ search, limit, offset, isLead: true });
}

/**
 * Update Lead Details Workflow
 */
async function updateLead(leadData, adminUser = 'admin') {
  const leadId = leadData.id || leadData.customerId || leadData.leadId;
  if (!leadId) {
    return { success: false, error: 'Lead ID is required for update.' };
  }

  let customer = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(leadId)) {
    customer = await repos.customers.findById(leadId);
  } else {
    customer = await repos.customers.findByCode(leadId);
  }

  if (!customer) {
    return { success: false, error: 'Lead not found.' };
  }

  return db.withTransaction(async (client) => {
    const rawName = (leadData.customerName || leadData.name || customer.name).toString().trim();
    const rawPhone = (leadData.customerNumber || leadData.phone || '').toString().trim();
    let normPhone = customer.phone;
    if (rawPhone) {
      normPhone = normalizeIndianMobile(rawPhone);
    } else if (leadData.customerNumber === '' || leadData.phone === '') {
      normPhone = null;
    }

    let nameHi = leadData.nameHi !== undefined ? leadData.nameHi : leadData.name_hi;
    if (nameHi === undefined && rawName) {
      if (customer.name_hi && rawName === customer.name) {
        nameHi = customer.name_hi;
      } else {
        try { nameHi = await indicService.transliterateName(rawName); } catch (e) { nameHi = rawName; }
      }
    }

    let addressHi = leadData.addressHi !== undefined ? leadData.addressHi : leadData.address_hi;
    const addr = (leadData.address || leadData.location || '').toString().trim();
    if (addressHi === undefined && addr) {
      try { addressHi = await indicService.transliterateAddress(addr); } catch (e) { addressHi = addr; }
    }

    const finalNotes = leadData.leadNotes !== undefined ? leadData.leadNotes : (leadData.notes !== undefined ? leadData.notes : customer.lead_notes || customer.notes);
    const carMakeVal = leadData.carMake !== undefined ? leadData.carMake : leadData.car_make;
    const carColorVal = leadData.carColor !== undefined ? leadData.carColor : leadData.car_color;
    const interestedService = leadData.serviceCategory || leadData.interestedService || leadData.serviceType || customer.interested_service || 'Daily Car Cleaning';
    const leadStage = (leadData.leadStatus || leadData.stage || customer.lead_status || 'open').toString().trim().toLowerCase();

    // 1. Update customer record
    await repos.customers.updateCustomer(customer.id, {
      name: rawName,
      nameHi,
      phone: normPhone,
      addressHi,
      notes: finalNotes,
      leadNotes: finalNotes,
      interestedService,
      leadStatus: leadStage,
      carMake: carMakeVal,
      carColor: carColorVal
    }, client);

    // 2. Update / Upsert Primary Location
    const rawMapsUrl = (leadData.googleMapsUrl || leadData.mapsUrl || '').toString().trim();
    let primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);
    if (addr || rawMapsUrl) {
      if (primaryLoc) {
        await repos.serviceLocations.updateLocation(primaryLoc.id, {
          addressText: addr || primaryLoc.address_text,
          addressTextHi: addressHi || primaryLoc.address_text_hi,
          googleMapsUrl: rawMapsUrl || primaryLoc.google_maps_url
        }, client);
      } else {
        primaryLoc = await repos.serviceLocations.createLocation({
          customerId: customer.id,
          addressType: 'primary',
          addressText: addr,
          addressTextHi: addressHi || null,
          googleMapsUrl: rawMapsUrl || null,
          isPrimary: true
        }, client);
      }
    }

    // 3. Update / Upsert Vehicle
    const rawVeh = (leadData.vehicle || leadData.vehicleDetails || '').toString().trim();
    if (rawVeh || carMakeVal || carColorVal) {
      const parsed = parseVehicleString(rawVeh);
      const existingVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
      if (existingVehs.length > 0) {
        await repos.vehicles.updateVehicle(existingVehs[0].id, {
          registrationNo: parsed.reg || existingVehs[0].registration_no || rawVeh,
          brandOrModel: parsed.model || existingVehs[0].brand_or_model,
          carMake: carMakeVal || existingVehs[0].car_make,
          carColor: carColorVal || existingVehs[0].car_color
        }, client);
      } else if (rawVeh || carMakeVal || carColorVal) {
        await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: primaryLoc ? primaryLoc.id : null,
          registrationNo: parsed.reg || rawVeh || 'LEAD_VEH',
          brandOrModel: parsed.model || null,
          carMake: carMakeVal || null,
          carColor: carColorVal || null
        }, client);
      }
    }

    // 4. Audit Log
    try {
      await repos.auditLogs.logChange({
        entityType: 'customers',
        entityId: customer.id,
        action: 'update_lead',
        changedBy: adminUser,
        beforeState: { name: customer.name, phone: customer.phone, lead_status: customer.lead_status },
        afterState: { name: rawName, phone: normPhone, lead_status: leadStage }
      }, client);
    } catch (auditErr) {
      console.warn('[Audit] lead update log skipped:', auditErr.message);
    }

    return { success: true, customerId: customer.id, message: 'Lead updated successfully' };
  });
}

/**
 * Convert a Lead into an active customer (DCC or other service)
 */
async function convertLeadToCustomer(leadId, convertData = {}, adminUser = 'admin') {
  return db.withTransaction(async (client) => {
    let customer = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(leadId)) {
      customer = await repos.customers.findById(leadId, client);
    } else {
      customer = await repos.customers.findByCode(leadId, client);
    }

    if (!customer) {
      return { success: false, error: 'Lead not found.' };
    }

    // 1. Mark as converted & remove lead flag
    await repos.customers.convertLeadToCustomer(customer.id, client);

    const sCategory = convertData.serviceCategory || customer.interested_service || 'Daily Car Cleaning';
    const isDaily = sCategory === 'Daily Car Cleaning' || sCategory === 'Daily Clean' || sCategory === 'daily_car_cleaning';
    const pkgType = convertData.packageType || convertData.packageName || (isDaily ? 'DCC ONLY' : sCategory);
    const isSolar = sCategory === 'Solar Panel Cleaning' || sCategory === 'solar_cleaning';
    const serviceCatId = resolveCanonicalCategory(sCategory);
    const parsedPanelCount = isSolar ? (parseInt(convertData.panelCount || convertData.panel_count, 10) || 10) : null;
    const parsedSeaterType = isSolar ? null : (convertData.seaterType || convertData.seater_type || '5_seater');

    // Notes & attributes
    let updatedNotes = customer.notes || '';
    if (convertData.notes && convertData.notes.trim()) {
      const ts = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      updatedNotes = updatedNotes ? `${updatedNotes}\n[Converted ${ts}] ${convertData.notes.trim()}` : `[Converted ${ts}] ${convertData.notes.trim()}`;
      await repos.customers.updateCustomer(customer.id, {
        notes: updatedNotes,
        sourceSheetName: isDaily ? 'Daily Clean' : 'All Other Work',
        panelCount: parsedPanelCount
      }, client);
    } else {
      await repos.customers.updateCustomer(customer.id, {
        sourceSheetName: isDaily ? 'Daily Clean' : 'All Other Work',
        panelCount: parsedPanelCount
      }, client);
    }

    // 2. Resolve locations & vehicles
    const locations = await repos.serviceLocations.findByCustomerId(customer.id, { client });
    const primaryLocation = locations.find(l => l.is_primary) || locations[0] || null;
    const vehicles = await repos.vehicles.findByCustomerId(customer.id, { client });
    if (!isSolar && parsedSeaterType && vehicles.length > 0) {
      await repos.vehicles.updateVehicle(vehicles[0].id, { seaterType: parsedSeaterType }, client);
    }

    // 3. Resolve Staff Member Assignment
    let assignedStaff = null;
    const sName = (convertData.staffName || '').trim();
    const sId = (convertData.staffId || '').trim();

    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      assignedStaff = await repos.staff.findByStaffCode(sId, client);
      if (!assignedStaff && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(sId)) {
        assignedStaff = await repos.staff.findById(sId, client);
      }
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      assignedStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase()) || null;
    }

    // 4. Create Subscription or Job
    if (isDaily) {
      const sub = await repos.subscriptions.createSubscription({
        customerId: customer.id,
        serviceCategoryId: 'daily_car_cleaning',
        packageName: pkgType,
        packagesPurchased: parseInt(convertData.packagesPurchased, 10) || 1,
        rotationType: convertData.rotationType || 'none',
        rotationNotes: convertData.rotationNotes || null,
        status: 'active'
      }, client);

      for (const cv of vehicles) {
        await repos.subscriptionVehicles.addVehicleToSubscription({
          subscriptionId: sub.id,
          customerId: customer.id,
          vehicleId: cv.id,
          locationId: primaryLocation?.id || null,
          scheduleTag: convertData.scheduleTag || 'daily'
        }, client);
      }

      if (assignedStaff) {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: assignedStaff.id,
          subscriptionId: sub.id,
          assignedBy: adminUser
        }, client);
      }
    } else {
      const job = await repos.serviceJobs.createJob({
        customerId: customer.id,
        vehicleId: vehicles[0]?.id || null,
        locationId: primaryLocation?.id || (locations.length > 0 ? locations[0].id : null),
        serviceCategoryId: serviceCatId,
        serviceType: convertData.serviceType || pkgType,
        packageDetails: convertData.packageDetails || pkgType,
        seaterType: parsedSeaterType,
        panelCount: parsedPanelCount,
        siteDetails: isSolar ? { panelCount: parsedPanelCount, roofType: 'RCC' } : null,
        scheduledDate: convertData.scheduledDate || null,
        status: assignedStaff ? 'assigned' : 'pending',
        specialInstructions: convertData.notes || null
      }, client);

      if (assignedStaff) {
        await repos.staffAssignments.assignStaffToJob({
          staffId: assignedStaff.id,
          jobId: job.id,
          assignedBy: adminUser
        }, client);
      }
    }

    // 5. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'customer',
      entityId: customer.id,
      action: 'convert_lead',
      changedBy: adminUser,
      afterState: { customerCode: customer.customer_code, name: customer.name, serviceCategory: sCategory, packageType: pkgType }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      customerCode: customer.customer_code,
      message: 'Lead converted to active customer successfully'
    };
  });
}

/**
 * Append a timestamped note to a Lead
 */
async function addLeadNote(leadId, noteText, adminUser = 'admin') {
  if (!noteText || !noteText.trim()) {
    return { success: false, error: 'Note text cannot be empty.' };
  }
  let targetId = leadId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(leadId)) {
    const found = await repos.customers.findByCode(leadId);
    if (!found) return { success: false, error: 'Customer not found.' };
    targetId = found.id;
  }

  const ts = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
  const formatted = `[${ts}] ${noteText.trim()}`;

  const updated = await repos.customers.appendLeadNote(targetId, formatted);
  if (!updated) {
    return { success: false, error: 'Customer not found or failed to update note.' };
  }

  await repos.auditLogs.logChange({
    entityType: 'customer',
    entityId: targetId,
    action: 'add_lead_note',
    changedBy: adminUser,
    afterState: { leadNotes: updated.lead_notes }
  });

  return {
    success: true,
    customerId: targetId,
    leadNotes: updated.lead_notes,
    notes: updated.notes
  };
}

/**
 * Assign Special / On-Demand Service Job (Solar Cleaning, Car Washing, Detailing)
 * Supports assigning to an existing customer or creating a new customer on the fly
 */
async function assignSpecialJob(params, adminUser = 'admin') {
  const {
    customerId = null,
    customerName = null,
    customerPhone = null,
    phone = null,
    address = null,
    googleMapsUrl = null,
    parkingDetails = null,
    serviceCategoryId,
    serviceType = null,
    packageCode = null,
    packageDetails = null,
    seaterType = null,
    panelCount = null,
    siteDetails = null,
    scheduledDate = null,
    scheduledTime = null,
    tentativeTime = null,
    sequenceOrder = null,
    staffId,
    specialInstructions = null,
    vehicleId = null,
    vehicleDetails = null,
    locationId = null
  } = params;

  const rawCat = serviceCategoryId || params.serviceCategory || params.category || params.workType;
  if (!rawCat) {
    return { success: false, error: 'Service category is required.' };
  }

  // Canonical category resolution
  const normCat = String(rawCat).toLowerCase().trim().replace(/[\s-]+/g, '_');
  let catId = 'car_washing';
  if (normCat === 'solar_panel_cleaning' || normCat === 'solar_cleaning' || normCat === 'solar') {
    catId = 'solar_cleaning';
  } else if (normCat === 'interior_detailing' || normCat === 'interior') {
    catId = 'interior_detailing';
  } else if (normCat === 'exterior_detailing' || normCat === 'exterior') {
    catId = 'exterior_detailing';
  } else if (normCat === 'daily_car_cleaning' || normCat === 'daily_clean' || normCat === 'daily') {
    catId = 'daily_car_cleaning';
  } else {
    catId = 'car_washing';
  }

  const categoryMeta = serviceCatalog.getCategory(catId);
  const isSolar = catId === 'solar_cleaning';
  const isVehicleBased = !isSolar;

  return db.withTransaction(async (client) => {
    // 1. Resolve Customer
    let targetCustomer = null;
    if (customerId) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(customerId)) {
        targetCustomer = await repos.customers.findById(customerId, client);
      }
      if (!targetCustomer) {
        targetCustomer = await repos.customers.findByCode(customerId, client);
      }
    }

    if (!targetCustomer) {
      const rawName = (customerName || '').trim();
      if (!rawName) {
        return { success: false, error: 'Customer name is required for new customer assignment.' };
      }
      const rawPhone = (customerPhone || phone || '').trim();
      if (!rawPhone || !isValidIndianMobile(rawPhone)) {
        return { success: false, error: 'Valid 10-digit Indian mobile number is required.' };
      }
      const normPhone = normalizeIndianMobile(rawPhone);

      let nameHi = null;
      let addressHi = null;
      try { nameHi = await indicService.transliterateName(rawName); } catch (e) { nameHi = rawName; }
      if (address) {
        try { addressHi = await indicService.transliterateAddress(address); } catch (e) { addressHi = address; }
      }

      const uniqueSuffix = Date.now().toString().slice(-4);
      const customerCode = `CUST_${normPhone.slice(-6)}_${uniqueSuffix}`;

      targetCustomer = await repos.customers.createCustomer({
        customerCode,
        name: rawName,
        phone: normPhone,
        notes: specialInstructions || null,
        sourceSheetName: 'All Other Work',
        sourceRowIndex: 0,
        isActive: true,
        nameHi,
        addressHi
      }, client);
    }

    // 2. Resolve Service Location
    let targetLocationId = locationId;
    if (!targetLocationId) {
      const existingLocs = await repos.serviceLocations.findByCustomerId(targetCustomer.id, { client });
      if (existingLocs && existingLocs.length > 0) {
        const primary = existingLocs.find(l => l.is_primary) || existingLocs[0];
        targetLocationId = primary.id;
      } else {
        const locAddr = address || targetCustomer.address || 'Location provided verbally';
        let locAddrHi = null;
        try { locAddrHi = await indicService.transliterateAddress(locAddr); } catch (e) { locAddrHi = locAddr; }
        const newLoc = await repos.serviceLocations.createLocation({
          customerId: targetCustomer.id,
          addressType: 'primary',
          addressText: locAddr,
          addressTextHi: locAddrHi,
          googleMapsUrl: googleMapsUrl || null,
          parkingDetails: parkingDetails || null,
          isPrimary: true,
          isActive: true
        }, client);
        targetLocationId = newLoc.id;
      }
    }

    // 3. Resolve Vehicle if vehicle-based job
    let targetVehicleId = vehicleId;
    const normSeater = seaterType ? serviceCatalog.normalizeSeaterType(seaterType) : null;

    if (!targetVehicleId && isVehicleBased) {
      const custVehs = await repos.vehicles.findByCustomerId(targetCustomer.id, { client });
      const rawVehStr = typeof vehicleDetails === 'string'
        ? vehicleDetails
        : (vehicleDetails && (vehicleDetails.vehicle || vehicleDetails.registrationNo || vehicleDetails.reg))
          || params.vehicle
          || params.vehicleNum
          || params.vehicleNumber
          || '';
      const parsed = parseVehicleString(rawVehStr);

      if (parsed.reg && custVehs && custVehs.length > 0) {
        const match = custVehs.find(v => v.registration_no && v.registration_no.replace(/\s+/g, '').toUpperCase() === parsed.reg.replace(/\s+/g, '').toUpperCase());
        if (match) {
          targetVehicleId = match.id;
        }
      }

      if (!targetVehicleId && custVehs && custVehs.length > 0 && !parsed.reg) {
        targetVehicleId = custVehs[0].id;
      }

      if (targetVehicleId) {
        if (normSeater) {
          await repos.vehicles.updateVehicle(targetVehicleId, { seaterType: normSeater }, client);
        }
      } else if (rawVehStr || parsed.reg) {
        const newVeh = await repos.vehicles.createVehicle({
          customerId: targetCustomer.id,
          defaultLocationId: targetLocationId,
          registrationNo: parsed.reg || (typeof rawVehStr === 'string' ? rawVehStr.trim() : '') || 'CAR',
          brandOrModel: parsed.model || null,
          vehicleType: 'Car',
          seaterType: normSeater,
          isActive: true
        }, client);
        targetVehicleId = newVeh.id;
      }
    }

    // 4. Resolve Staff
    if (!staffId) {
      return { success: false, error: 'Staff assignment is required.' };
    }
    let targetStaff = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffId)) {
      targetStaff = await repos.staff.findById(staffId, client);
    }
    if (!targetStaff) {
      targetStaff = await repos.staff.findByStaffCode(staffId, client);
    }
    if (!targetStaff) {
      const allStaff = await repos.staff.findAll({ client });
      targetStaff = (allStaff || []).find(s => (s.id && s.id === staffId) || (s.name && s.name.toLowerCase() === staffId.toLowerCase()) || (s.staff_code && s.staff_code.toLowerCase() === staffId.toLowerCase())) || null;
    }
    if (!targetStaff) {
      return { success: false, error: `Staff member '${staffId}' not found.` };
    }
    if (!targetStaff.is_active) {
      return { success: false, error: `Cannot assign service job to deactivated staff member '${targetStaff.name}'.` };
    }
    if (!staffCapabilityService.hasServiceCapability(targetStaff, catId)) {
      const eff = staffCapabilityService.getStaffEffectiveCapabilities(targetStaff);
      const catName = categoryMeta ? categoryMeta.name : catId;
      return {
        success: false,
        error: `Staff member '${targetStaff.name}' is classified as '${eff.workType}' and does not have the capability for '${catName}'.`
      };
    }

    // 5. Determine IST Scheduled Date
    const istDate = scheduledDate || repos.serviceLogs.computeIstServiceDate(new Date().toISOString());

    // 6. Compute Final Service Name and Details
    const defaultTypeName = categoryMeta ? categoryMeta.name : (isSolar ? 'Solar Panel Cleaning' : 'Car Washing');
    const finalServiceType = serviceType || defaultTypeName;

    let finalPanelCount = null;
    let finalSiteDetails = siteDetails || null;

    if (isSolar) {
      finalPanelCount = panelCount ? parseInt(panelCount, 10) : (siteDetails && siteDetails.panelCount ? parseInt(siteDetails.panelCount, 10) : 10);
      if (isNaN(finalPanelCount) || finalPanelCount <= 0) finalPanelCount = 10;
      finalSiteDetails = Object.assign({}, siteDetails || {}, { panelCount: finalPanelCount, roofScope: packageDetails || 'Solar Cleaning' });
    }

    const finalScheduledTime = (scheduledTime || tentativeTime || params.time || params.scheduled_time || params.tentative_time || '').trim() || null;
    const finalSequenceOrder = (sequenceOrder != null && sequenceOrder !== '' && !isNaN(parseInt(sequenceOrder, 10)))
      ? parseInt(sequenceOrder, 10)
      : (params.sequence_order != null && !isNaN(parseInt(params.sequence_order, 10)) ? parseInt(params.sequence_order, 10) : null);

    const finalInstructions = (specialInstructions || params.instructions || params.notes || '').trim() || null;

    // 7. Create Service Job
    const job = await repos.serviceJobs.createJob({
      customerId: targetCustomer.id,
      vehicleId: targetVehicleId,
      locationId: targetLocationId,
      serviceCategoryId: catId,
      serviceType: finalServiceType,
      packageCode: packageCode || null,
      packageDetails: packageDetails || null,
      seaterType: normSeater,
      panelCount: finalPanelCount,
      siteDetails: finalSiteDetails,
      scheduledDate: istDate,
      scheduledTime: finalScheduledTime,
      sequenceOrder: finalSequenceOrder,
      status: 'assigned',
      specialInstructions: finalInstructions
    }, client);

    // 8. Assign Staff to Job in staff_assignments ledger
    const assignment = await repos.staffAssignments.assignStaffToJob({
      staffId: targetStaff.id,
      jobId: job.id,
      assignedBy: adminUser
    }, client);

    // 9. Operational Audit Log
    await repos.auditLogs.logChange({
      entityType: 'service_job',
      entityId: job.id,
      action: 'assign_special_job',
      changedBy: adminUser,
      afterState: {
        jobId: job.id,
        customerId: targetCustomer.id,
        customerName: targetCustomer.name,
        serviceCategoryId: catId,
        packageCode: packageCode || null,
        seaterType: normSeater,
        panelCount: finalPanelCount,
        staffId: targetStaff.staff_code,
        staffName: targetStaff.name,
        scheduledDate: istDate,
        scheduledTime: finalScheduledTime,
        sequenceOrder: finalSequenceOrder
      }
    }, client);

    return {
      success: true,
      job: {
        id: job.id,
        jobId: job.id,
        customerId: targetCustomer.id,
        customerName: targetCustomer.name,
        customerPhone: targetCustomer.phone,
        serviceCategoryId: catId,
        serviceType: job.service_type,
        packageCode: job.package_code,
        packageDetails: job.package_details,
        vehicleId: job.vehicle_id,
        vehicle_id: job.vehicle_id,
        seaterType: job.seater_type,
        seater_type: job.seater_type,
        panelCount: job.panel_count,
        panel_count: job.panel_count,
        scheduledDate: istDate,
        scheduledTime: finalScheduledTime,
        tentativeTime: finalScheduledTime,
        sequenceOrder: finalSequenceOrder,
        status: job.status,
        assignedStaffId: targetStaff.staff_code,
        assignedStaffName: targetStaff.name
      },
      assignmentId: assignment.id,
      message: `Job assigned to ${targetStaff.name} successfully.`
    };
  });
}

/**
 * Reassign an existing special / on-demand job to another staff member
 */
async function reassignSpecialJob(params = {}, maybeAdminUser = null) {
  const jobId = params.jobId;
  const staffTarget = params.newStaffId || params.toStaffId || params.targetStaffId;
  const reason = params.reason || null;
  const adminUser = maybeAdminUser || params.adminUser || 'admin';
  const isUnassignRequest = (staffTarget === 'unassigned' || params.unassign === true);

  if (!jobId) {
    return { success: false, error: 'Job ID is required for reassignment.' };
  }
  if (!staffTarget && !isUnassignRequest) {
    return { success: false, error: 'Target staff member is required for reassignment.' };
  }

  return db.withTransaction(async (client) => {
    // 1. Find job
    const job = await repos.serviceJobs.findById(jobId, client);
    if (!job) {
      return { success: false, error: `Job '${jobId}' not found.` };
    }
    if (job.status === 'completed') {
      return { success: false, error: 'Cannot reassign a job that is already completed.' };
    }

    // 1b. Handle Unassignment if requested
    if (isUnassignRequest) {
      if (repos.staffAssignments && repos.staffAssignments.unassignJob) {
        await repos.staffAssignments.unassignJob({
          jobId: job.id,
          unassignedBy: adminUser,
          reason: reason || 'Unassigned by admin'
        }, client);
      }
      await client.query(`UPDATE public.service_jobs SET status = 'pending' WHERE id = $1`, [job.id]);
      await repos.auditLogs.logChange({
        action: 'JOB_UNASSIGNED',
        entityType: 'service_job',
        entityId: job.id,
        changedBy: adminUser,
        details: { jobId: job.id, reason: reason || 'Unassigned by admin' }
      }, client);
      return {
        success: true,
        message: 'Job unassigned successfully.',
        unassigned: true,
        jobId: job.id
      };
    }

    // 2. Resolve new staff
    let targetStaff = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffTarget)) {
      targetStaff = await repos.staff.findById(staffTarget, client);
    }
    if (!targetStaff) {
      targetStaff = await repos.staff.findByStaffCode(staffTarget, client);
    }
    if (!targetStaff) {
      const allStaff = await repos.staff.findAll({ client });
      targetStaff = (allStaff || []).find(s => (s.id && s.id === staffTarget) || (s.name && s.name.toLowerCase() === staffTarget.toLowerCase()) || (s.staff_code && s.staff_code.toLowerCase() === staffTarget.toLowerCase())) || null;
    }
    if (!targetStaff) {
      return { success: false, error: `Staff member '${staffTarget}' not found.` };
    }
    if (!targetStaff.is_active) {
      return { success: false, error: `Cannot reassign service job to deactivated staff member '${targetStaff.name}'.` };
    }
    if (!staffCapabilityService.hasServiceCapability(targetStaff, job.service_category_id)) {
      const eff = staffCapabilityService.getStaffEffectiveCapabilities(targetStaff);
      const catMeta = serviceCatalog.getCategory(job.service_category_id);
      const catName = catMeta ? catMeta.name : job.service_category_id;
      return {
        success: false,
        error: `Staff member '${targetStaff.name}' is classified as '${eff.workType}' and does not have the capability for '${catName}'.`
      };
    }

    // 3. Find current active assignment
    const currentAssignment = await repos.staffAssignments.findActiveByJobId(jobId, client);
    const oldStaffId = currentAssignment ? currentAssignment.staff_id : null;

    if (oldStaffId && oldStaffId === targetStaff.id) {
      return { success: false, error: `${targetStaff.name} is already assigned to this job.` };
    }

    // 4. Update scheduled time or sequence order if provided
    const jobUpdates = {};
    if (params.scheduledTime !== undefined || params.tentativeTime !== undefined) {
      jobUpdates.scheduledTime = (params.scheduledTime || params.tentativeTime || '').trim() || null;
    }
    if (params.sequenceOrder !== undefined) {
      jobUpdates.sequenceOrder = (params.sequenceOrder != null && params.sequenceOrder !== '' && !isNaN(parseInt(params.sequenceOrder, 10)))
        ? parseInt(params.sequenceOrder, 10)
        : null;
    }
    if (Object.keys(jobUpdates).length > 0) {
      await repos.serviceJobs.updateJob(job.id, jobUpdates, client);
    }

    // 4. Assign new staff (this automatically deactivates prior assignment with reason)
    const assignment = await repos.staffAssignments.assignStaffToJob({
      staffId: targetStaff.id,
      jobId: job.id,
      assignedBy: adminUser
    }, client);

    // 5. Update assignment reason if provided
    if (reason && reason.trim()) {
      if (oldStaffId) {
        await client.query(
          `UPDATE public.staff_assignments 
           SET reassignment_reason = $1 
           WHERE job_id = $2 AND staff_id = $3 AND is_active = FALSE AND unassigned_at IS NOT NULL`,
          [reason.trim(), job.id, oldStaffId]
        );
      } else {
        await client.query(
          `UPDATE public.staff_assignments 
           SET reassignment_reason = $1 
           WHERE job_id = $2 AND is_active = FALSE AND unassigned_at IS NOT NULL`,
          [reason.trim(), job.id]
        );
      }
    }

    // 6. Log audit change
    await repos.auditLogs.logChange({
      entityType: 'service_job',
      entityId: job.id,
      action: 'reassign_special_job',
      changedBy: adminUser,
      beforeState: { staffId: oldStaffId },
      afterState: {
        jobId: job.id,
        customerId: job.customer_id,
        newStaffId: targetStaff.staff_code,
        newStaffName: targetStaff.name,
        reason: reason || null
      }
    }, client);

    return {
      success: true,
      jobId: job.id,
      job: {
        id: job.id,
        jobId: job.id,
        customerId: job.customer_id,
        customerName: job.customer_name,
        serviceCategoryId: job.service_category_id,
        serviceType: job.service_type,
        status: job.status,
        assignedStaffId: targetStaff.staff_code,
        assignedStaffName: targetStaff.name
      },
      assignedStaff: {
        id: targetStaff.id,
        staffCode: targetStaff.staff_code,
        name: targetStaff.name
      },
      assignmentId: assignment.id,
      message: `Job successfully reassigned to ${targetStaff.name}.`
    };
  });
}

/**
 * Query Special / On-Demand Service Jobs for Admin Dashboard
 */
async function getSpecialJobsAdmin({ status = null, serviceCategoryId = null, staffId = null, scheduledDate = null, limit = 200, offset = 0 } = {}) {
  const conditions = ['j.deleted_at IS NULL'];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`j.status = $${params.length}`);
  }

  if (serviceCategoryId && serviceCategoryId !== 'all') {
    const norm = String(serviceCategoryId).toLowerCase().trim().replace(/[\s-]+/g, '_');
    let cat = norm;
    if (norm === 'solar_panel_cleaning') cat = 'solar_cleaning';
    params.push(cat);
    conditions.push(`j.service_category_id = $${params.length}`);
  }

  if (scheduledDate) {
    params.push(scheduledDate);
    conditions.push(`j.scheduled_date = $${params.length}`);
  }

  if (staffId && staffId !== 'all') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(staffId)) {
      params.push(staffId);
      conditions.push(`sa.staff_id = $${params.length}`);
    } else {
      params.push(staffId.toUpperCase());
      conditions.push(`UPPER(s.staff_code) = $${params.length}`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT j.*,
           c.name AS customer_name, c.name_hi AS customer_name_hi, c.phone AS customer_phone, c.customer_code,
           v.registration_no, v.brand_or_model, v.photo_url AS vehicle_photo_url,
           loc.address_text, loc.address_text_hi, loc.google_maps_url, loc.parking_details,
           sa.staff_id, sa.assigned_at, s.name AS assigned_staff_name, s.staff_code AS assigned_staff_code
    FROM public.service_jobs j
    JOIN public.customers c ON j.customer_id = c.id
    LEFT JOIN public.vehicles v ON j.vehicle_id = v.id
    JOIN public.service_locations loc ON j.location_id = loc.id
    LEFT JOIN public.staff_assignments sa ON j.id = sa.job_id AND sa.is_active = TRUE
    LEFT JOIN public.staff s ON sa.staff_id = s.id
    ${whereClause}
    ORDER BY j.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await db.query(sql, params);

  const jobs = res.rows.map(row => {
    let beforePhotos = [];
    if (Array.isArray(row.before_photos)) beforePhotos = row.before_photos;
    else if (typeof row.before_photos === 'string' && row.before_photos) {
      try { beforePhotos = JSON.parse(row.before_photos); } catch (e) { beforePhotos = []; }
    }

    let afterPhotos = [];
    if (Array.isArray(row.after_photos)) afterPhotos = row.after_photos;
    else if (typeof row.after_photos === 'string' && row.after_photos) {
      try { afterPhotos = JSON.parse(row.after_photos); } catch (e) { afterPhotos = []; }
    }

    let durationMinutes = null;
    let elapsedMinutes = null;
    if (row.started_at && row.completed_at) {
      const diffMs = new Date(row.completed_at).getTime() - new Date(row.started_at).getTime();
      durationMinutes = Math.max(1, Math.round(diffMs / 60000));
      elapsedMinutes = durationMinutes;
    } else if (row.started_at) {
      const diffMs = Date.now() - new Date(row.started_at).getTime();
      elapsedMinutes = Math.max(1, Math.round(diffMs / 60000));
    } else if (row.assigned_at) {
      const diffMs = Date.now() - new Date(row.assigned_at).getTime();
      elapsedMinutes = Math.max(0, Math.round(diffMs / 60000));
    }

    const catMeta = serviceCatalog.getCategory(row.service_category_id);
    const categoryName = catMeta ? catMeta.name : (row.service_category_id === 'solar_cleaning' ? 'Solar Panel Cleaning' : 'Car Washing');

    return {
      id: row.id,
      jobId: row.id,
      customerId: row.customer_id,
      customerCode: row.customer_code,
      customerName: row.customer_name,
      customerNameHi: row.customer_name_hi,
      customerPhone: row.customer_phone,
      address: row.address_text,
      addressHi: row.address_text_hi,
      googleMapsUrl: row.google_maps_url,
      parkingDetails: row.parking_details,
      vehicle: row.registration_no ? (row.brand_or_model ? `${row.registration_no} (${row.brand_or_model})` : row.registration_no) : '',
      serviceCategoryId: row.service_category_id,
      serviceCategory: categoryName,
      serviceType: row.service_type,
      packageCode: row.package_code,
      packageDetails: row.package_details,
      seaterType: row.seater_type,
      panelCount: row.panel_count,
      siteDetails: row.site_details,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time || '',
      tentativeTime: row.scheduled_time || '',
      sequenceOrder: row.sequence_order !== null && row.sequence_order !== undefined ? row.sequence_order : null,
      status: row.status,
      specialInstructions: row.special_instructions,
      beforePhotos,
      afterPhotos,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      completionNotes: row.completion_notes,
      durationMinutes,
      elapsedMinutes,
      staffId: row.assigned_staff_code || (row.assigned_staff_name ? row.assigned_staff_name : ''),
      staffName: row.assigned_staff_name || 'Unassigned',
      createdAt: row.created_at
    };
  });

  return { success: true, jobs };
}

function calculateConsecutiveTimes(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  const parseSafeTime = (d) => {
    if (!d) return 0;
    const t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  };
  const sorted = [...logs].sort((a, b) => parseSafeTime(a.completed_at_device || a.created_at) - parseSafeTime(b.completed_at_device || b.created_at));
  const staffMap = {};
  sorted.forEach(l => {
    const sId = l.staff_id || l.staff_code || 'all';
    if (!staffMap[sId]) staffMap[sId] = [];
    staffMap[sId].push(l);
  });

  const output = [];
  Object.values(staffMap).forEach(list => {
    list.forEach((curr, idx) => {
      const cleanDuration = (curr.device_metadata && curr.device_metadata.durationMinutes) ? curr.device_metadata.durationMinutes : (curr.cleaningDurationMinutes || 15);
      curr.cleaningDurationMinutes = cleanDuration;
      if (idx === 0) {
        curr.transitDurationMinutes = 0;
        curr.prevLocation = null;
        curr.previousVehicleNum = null;
      } else {
        const prev = list[idx - 1];
        const prevTime = parseSafeTime(prev.completed_at_device || prev.created_at);
        const currTime = parseSafeTime(curr.completed_at_device || curr.created_at);
        if (prevTime > 0 && currTime >= prevTime) {
          const diffMs = currTime - prevTime;
          const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
          curr.transitDurationMinutes = Math.max(1, totalMinutes - cleanDuration);
        } else {
          curr.transitDurationMinutes = 0;
        }
        curr.prevLocation = prev.address_text || prev.parking_details || null;
        curr.previousVehicleNum = prev.vehicle_num || prev.registration_no || null;
      }
      output.push(curr);
    });
  });
  return output;
}

function computeWashSolarElapsed(job, nowTime) {
  if (!job) return 0;
  const parseSafeTime = (d, fallback) => {
    if (!d) return fallback;
    const t = (typeof d === 'number') ? d : new Date(d).getTime();
    return isNaN(t) ? fallback : t;
  };
  const now = parseSafeTime(nowTime, Date.now());
  const status = job.status || 'assigned';
  if (status === 'in_progress') {
    const start = parseSafeTime(job.started_at, (job.assigned_at ? parseSafeTime(job.assigned_at, now) : now));
    return Math.max(1, Math.round((now - start) / 60000));
  } else if (status === 'completed') {
    const start = parseSafeTime(job.started_at, (job.assigned_at ? parseSafeTime(job.assigned_at, now) : now));
    const end = parseSafeTime(job.completed_at, now);
    return Math.max(1, Math.round((end - start) / 60000));
  } else if (status === 'assigned') {
    const assigned = parseSafeTime(job.assigned_at, now);
    return Math.max(0, Math.round((now - assigned) / 60000));
  }
  return 0;
}

async function getDailyOperationsSummary(date = null) {
  return await getDailyCleanReports({ startDate: date, endDate: date });
}

/**
 * Assign Daily Car Cleaning customer to a staff cleaner (Route Allocation)
 */
async function assignDailyCleanCustomer({ customerId, staffId, adminUser = 'admin' }) {
  if (!customerId) return { success: false, error: 'Customer ID is required.' };
  if (!staffId) return { success: false, error: 'Staff ID is required.' };

  return db.withTransaction(async (client) => {
    // 1. Resolve Customer
    const target = String(customerId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(target);
    let customer = isUuid ? await repos.customers.findById(target, client) : null;
    if (!customer) customer = await repos.customers.findByCode(target, client);
    if (!customer) {
      const all = await repos.customers.findAll({ client });
      customer = all.find(c => c.id === target || c.customer_code === target || c.phone === target || c.name === target) || null;
    }
    if (!customer) return { success: false, error: `Customer '${target}' not found.` };

    // 2. Resolve Staff
    const sTarget = String(staffId).trim();
    const isStaffUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(sTarget);
    let staff = isStaffUuid ? await repos.staff.findById(sTarget, client) : null;
    if (!staff) staff = await repos.staff.findByStaffCode(sTarget, client);
    if (!staff) {
      const allStaff = await repos.staff.findAll({ client });
      staff = allStaff.find(s => s.id === sTarget || s.staff_code?.toLowerCase() === sTarget.toLowerCase() || s.name?.toLowerCase() === sTarget.toLowerCase()) || null;
    }
    if (!staff) return { success: false, error: `Staff member '${sTarget}' not found.` };

    // 3. Resolve or Create Active Subscription for Daily Car Cleaning
    let sub = await repos.subscriptions.findActiveByCustomerId(customer.id, client);
    if (!sub) {
      const allSubs = await repos.subscriptions.findByCustomerId(customer.id, { client });
      sub = allSubs.find(s => s.status === 'active' && s.service_category_id === 'daily_car_cleaning') || allSubs.find(s => s.status === 'active') || null;
    }
    if (!sub) {
      sub = await repos.subscriptions.createSubscription({
        customerId: customer.id,
        serviceCategoryId: 'daily_car_cleaning',
        packageName: customer.interested_service || 'DCC ONLY',
        status: 'active'
      }, client);
    }

    // 4. Update Customer's interestedService / status
    await repos.customers.updateCustomer(customer.id, {
      interestedService: 'Daily Car Cleaning',
      isActive: true
    }, client);

    // 5. Assign in staff_assignments ledger
    const assignment = await repos.staffAssignments.assignStaffToSubscription({
      staffId: staff.id,
      subscriptionId: sub.id,
      assignedBy: adminUser
    }, client);

    // 6. Append to staff route sequences if not already present & clean old assignments
    try {
      await client.query(
        'DELETE FROM public.staff_route_sequences WHERE subscription_id = $1 AND staff_id != $2',
        [sub.id, staff.id]
      );
      const existingSeqs = await client.query(
        'SELECT * FROM public.staff_route_sequences WHERE staff_id = $1 AND subscription_id = $2',
        [staff.id, sub.id]
      );
      if (existingSeqs.rows.length === 0) {
        const maxSeqRes = await client.query(
          'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.staff_route_sequences WHERE staff_id = $1',
          [staff.id]
        );
        const nextSeq = (parseInt(maxSeqRes.rows[0]?.max_seq, 10) || 0) + 1;
        await client.query(
          `INSERT INTO public.staff_route_sequences (staff_id, subscription_id, sequence_order, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [staff.id, sub.id, nextSeq, adminUser || 'admin']
        );
      }
    } catch (seqErr) {
      console.warn('Route sequence auto-append non-fatal error:', seqErr.message);
    }

    // 7. Audit Log
    await repos.auditLogs.logChange({
      entityType: 'subscription',
      entityId: sub.id,
      action: 'assign_daily_clean_route',
      changedBy: adminUser,
      afterState: {
        customerId: customer.id,
        customerName: customer.name,
        subscriptionId: sub.id,
        staffId: staff.staff_code,
        staffName: staff.name
      }
    }, client);

    return {
      success: true,
      message: `${customer.name} allocated to ${staff.name}'s daily route.`,
      customerId: customer.id,
      staffId: staff.staff_code,
      staffName: staff.name,
      subscriptionId: sub.id,
      assignmentId: assignment.id
    };
  });
}

/**
 * Unassign Daily Car Cleaning customer from active staff route
 */
async function unassignDailyCleanCustomer({ customerId, reason = 'Unassigned by admin', adminUser = 'admin' }) {
  if (!customerId) return { success: false, error: 'Customer ID is required.' };

  return db.withTransaction(async (client) => {
    const target = String(customerId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(target);
    let customer = isUuid ? await repos.customers.findById(target, client) : null;
    if (!customer) customer = await repos.customers.findByCode(target, client);
    if (!customer) return { success: false, error: `Customer '${target}' not found.` };

    const sub = await repos.subscriptions.findActiveByCustomerId(customer.id, client);
    if (sub) {
      await repos.staffAssignments.unassignSubscription({
        subscriptionId: sub.id,
        unassignedBy: adminUser,
        reason: reason || 'Customer unassigned from daily clean route'
      }, client);

      try {
        await client.query('DELETE FROM public.staff_route_sequences WHERE subscription_id = $1', [sub.id]);
      } catch (e) {}

      await repos.auditLogs.logChange({
        entityType: 'subscription',
        entityId: sub.id,
        action: 'unassign_daily_clean_route',
        changedBy: adminUser,
        afterState: { customerId: customer.id, customerName: customer.name, unassigned: true, reason }
      }, client);
    }

    return {
      success: true,
      message: `${customer.name} unassigned from daily clean route.`,
      customerId: customer.id
    };
  });
}

/**
 * Fetch all Daily Car Cleaning assignments and unassigned subscribers
 */
async function getDailyCleanAssignments({ staffId = null, unassignedOnly = false } = {}) {
  const sql = `
    SELECT c.id AS customer_id, c.customer_code, c.name AS customer_name, c.name_hi AS customer_name_hi,
           c.phone AS customer_phone, c.is_active,
           v.id AS vehicle_id, v.registration_no, v.brand_or_model, v.car_make, v.car_color,
           COALESCE(sv_loc.id, loc.id) AS location_id,
           COALESCE(sv_loc.location_name, loc.location_name, 'Home') AS location_name,
           COALESCE(sv_loc.address_text, loc.address_text) AS address_text,
           COALESCE(sv_loc.google_maps_url, loc.google_maps_url) AS google_maps_url,
           COALESCE(sv_loc.latitude, loc.latitude) AS latitude,
           COALESCE(sv_loc.longitude, loc.longitude) AS longitude,
           COALESCE(sv_loc.parking_details, loc.parking_details) AS parking_details,
           sub.id AS subscription_id, sub.package_name, sub.status AS subscription_status,
           sa.staff_id, st.name AS staff_name, st.staff_code,
           srs.sequence_order
    FROM public.customers c
    JOIN public.subscriptions sub ON sub.customer_id = c.id AND sub.status = 'active' AND sub.deleted_at IS NULL
    LEFT JOIN public.staff_assignments sa ON sa.subscription_id = sub.id AND sa.is_active = TRUE
    LEFT JOIN public.staff st ON sa.staff_id = st.id
    LEFT JOIN public.staff_route_sequences srs ON srs.staff_id = st.id AND srs.subscription_id = sub.id
    LEFT JOIN public.subscription_vehicles sv ON sv.subscription_id = sub.id
    LEFT JOIN public.service_locations sv_loc ON sv_loc.id = sv.location_id AND sv_loc.deleted_at IS NULL
    LEFT JOIN public.service_locations loc ON loc.customer_id = c.id AND loc.is_primary = TRUE AND loc.deleted_at IS NULL
    LEFT JOIN public.vehicles v ON (v.id = sv.vehicle_id OR (sv.vehicle_id IS NULL AND v.customer_id = c.id)) AND v.deleted_at IS NULL
    WHERE c.deleted_at IS NULL AND c.is_active = TRUE
    ORDER BY (st.name IS NULL) DESC, st.name ASC, srs.sequence_order ASC NULLS LAST, c.name ASC
  `;
  const res = await db.query(sql);
  let rows = res.rows.map(r => ({
    customerId: r.customer_id,
    customerCode: r.customer_code,
    customerName: r.customer_name,
    customerNameHi: r.customer_name_hi,
    phone: r.customer_phone,
    vehicleId: r.vehicle_id,
    vehicleNumber: r.registration_no || (r.brand_or_model ? `${r.brand_or_model}` : 'Unregistered'),
    brandOrModel: r.brand_or_model,
    carMake: r.car_make,
    carColor: r.car_color,
    locationId: r.location_id,
    locationName: r.location_name || 'Home',
    address: r.address_text || '',
    locality: r.address_text || '',
    googleMapsUrl: r.google_maps_url,
    latitude: r.latitude != null ? parseFloat(r.latitude) : null,
    longitude: r.longitude != null ? parseFloat(r.longitude) : null,
    parkingDetails: r.parking_details,
    subscriptionId: r.subscription_id,
    packageType: r.package_name || 'DCC ONLY',
    packageName: r.package_name || 'DCC ONLY',
    staffId: r.staff_id,
    staffName: r.staff_name,
    staffCode: r.staff_code,
    isAssigned: Boolean(r.staff_id),
    sequenceOrder: r.sequence_order
  }));

  if (unassignedOnly) {
    rows = rows.filter(r => !r.isAssigned);
  } else if (staffId) {
    const norm = String(staffId).toLowerCase().trim();
    rows = rows.filter(r => (r.staffId && r.staffId.toLowerCase() === norm) || (r.staffCode && r.staffCode.toLowerCase() === norm));
  }

  const unassignedCount = rows.filter(r => !r.isAssigned).length;
  const assignedCount = rows.filter(r => r.isAssigned).length;

  return {
    success: true,
    data: rows,
    assignments: rows,
    summary: {
      total: rows.length,
      assigned: assignedCount,
      unassigned: unassignedCount
    }
  };
}

/**
 * Assign or update service and staff assignment for a customer
 */
async function assignCustomerService(serviceData, adminUser = 'admin') {
  const custId = serviceData.customerId || serviceData.id;
  if (!custId) return { success: false, error: 'Customer ID is required.' };

  const target = String(custId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(target);
  let customer = isUuid ? await repos.customers.findById(target) : null;
  if (!customer) customer = await repos.customers.findByCode(target);
  if (!customer) {
    const all = await repos.customers.findAll();
    customer = all.find(c => c.id === target || c.customer_code === target || c.phone === target) || null;
  }
  if (!customer) return { success: false, error: `Customer '${target}' not found.` };

  return db.withTransaction(async (client) => {
    const cat = (serviceData.serviceCategory || serviceData.serviceType || 'Daily Car Cleaning').trim();
    const isDaily = cat === 'Daily Car Cleaning' || cat === 'Daily Clean' || cat === 'daily_car_cleaning';
    const isSolar = cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning';

    const carMake = (serviceData.carMake || serviceData.car_make || '').trim() || null;
    const carColor = (serviceData.carColor || serviceData.car_color || '').trim() || null;
    const seaterType = isSolar ? null : (serviceData.seaterType || serviceData.seater_type || '5_seater');
    const panelCount = isSolar ? (parseInt(serviceData.panelCount || serviceData.panel_count, 10) || 10) : null;
    const pkgType = serviceData.packageType || serviceData.packageName || (isDaily ? 'DCC ONLY' : 'Standard');
    const photoUrl = serviceData.photoUrl || null;

    // Resolve Target Service Location
    let targetLoc = null;
    if (serviceData.locationId) {
      targetLoc = await repos.serviceLocations.findById(serviceData.locationId, client);
    }
    if (!targetLoc) {
      targetLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);
    }

    // 1. Upsert Customer Vehicle if provided
    const rawVeh = (serviceData.vehicle || serviceData.vehicleNumbers || '').trim();
    let targetVehicle = null;
    if (rawVeh && !isSolar) {
      const parsed = parseVehicleString(rawVeh);
      const existingVehs = await repos.vehicles.findByCustomerId(customer.id, { client });
      if (existingVehs.length > 0) {
        await repos.vehicles.updateVehicle(existingVehs[0].id, {
          registrationNo: parsed.reg || existingVehs[0].registration_no,
          brandOrModel: parsed.model || existingVehs[0].brand_or_model,
          photoUrl: photoUrl || existingVehs[0].photo_url,
          carMake: carMake || existingVehs[0].car_make,
          carColor: carColor || existingVehs[0].car_color,
          seaterType: seaterType || existingVehs[0].seater_type,
          defaultLocationId: targetLoc?.id || existingVehs[0].default_location_id
        }, client);
        targetVehicle = existingVehs[0];
      } else if (parsed.reg) {
        targetVehicle = await repos.vehicles.createVehicle({
          customerId: customer.id,
          defaultLocationId: targetLoc?.id || null,
          registrationNo: parsed.reg,
          brandOrModel: parsed.model || null,
          photoUrl: photoUrl,
          carMake: carMake,
          carColor: carColor,
          seaterType: seaterType
        }, client);
      }
    }

    // 2. Resolve Staff Member Assignment
    let targetStaff = null;
    const sName = (serviceData.staffName || '').trim();
    const sId = (serviceData.staffId || '').trim();
    if (sId && sId.toLowerCase() !== 'unassigned' && sId.toLowerCase() !== 'none') {
      targetStaff = await repos.staff.findByStaffCode(sId, client);
      if (!targetStaff) targetStaff = await repos.staff.findById(sId, client);
    } else if (sName && sName.toLowerCase() !== 'unassigned' && sName.toLowerCase() !== 'none') {
      const allStaff = await repos.staff.findAll({ client });
      targetStaff = allStaff.find(s => s.name.toLowerCase() === sName.toLowerCase() || s.staff_code?.toLowerCase() === sName.toLowerCase()) || null;
    }

    // 3. Update Customer interestedService
    await repos.customers.updateCustomer(customer.id, {
      interestedService: isDaily ? 'Daily Car Cleaning' : cat,
      isActive: true,
      carMake: carMake || customer.car_make,
      carColor: carColor || customer.car_color,
      panelCount: panelCount || customer.panel_count
    }, client);

    // 4. Handle Daily Car Cleaning vs On-Demand Job
    let subId = null;
    let jobId = null;

    if (isDaily) {
      let sub = await repos.subscriptions.findActiveByCustomerId(customer.id, client);
      if (!sub) {
        const allSubs = await repos.subscriptions.findByCustomerId(customer.id, { client });
        sub = allSubs.find(s => s.service_category_id === 'daily_car_cleaning') || null;
      }

      if (sub) {
        await client.query(
          `UPDATE public.subscriptions 
           SET status = 'active', package_name = $1, stopped_at = NULL, stopped_reason = NULL, stopped_by = NULL, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [pkgType, sub.id]
        );
      } else {
        sub = await repos.subscriptions.createSubscription({
          customerId: customer.id,
          serviceCategoryId: 'daily_car_cleaning',
          packageName: pkgType,
          status: 'active'
        }, client);
      }
      subId = sub.id;

      // Link vehicle to subscription with chosen location
      if (targetVehicle) {
        await repos.subscriptionVehicles.addVehicleToSubscription({
          subscriptionId: sub.id,
          customerId: customer.id,
          vehicleId: targetVehicle.id,
          locationId: targetLoc?.id || null,
          scheduleTag: 'daily'
        }, client);
      }

      // Handle staff assignment
      if (targetStaff) {
        await repos.staffAssignments.assignStaffToSubscription({
          staffId: targetStaff.id,
          subscriptionId: sub.id,
          assignedBy: adminUser
        }, client);

        // Append to route sequence
        try {
          const existingSeqs = await client.query(
            'SELECT * FROM public.staff_route_sequences WHERE staff_id = $1 AND subscription_id = $2',
            [targetStaff.id, sub.id]
          );
          if (existingSeqs.rows.length === 0) {
            const maxSeqRes = await client.query(
              'SELECT COALESCE(MAX(sequence_order), 0) AS max_seq FROM public.staff_route_sequences WHERE staff_id = $1',
              [targetStaff.id]
            );
            const nextSeq = (parseInt(maxSeqRes.rows[0]?.max_seq, 10) || 0) + 1;
            await client.query(
              `INSERT INTO public.staff_route_sequences (staff_id, subscription_id, sequence_order, updated_by, updated_at)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
              [targetStaff.id, sub.id, nextSeq, adminUser || 'admin']
            );
          }
        } catch (e) {}
      } else if (sName.toLowerCase() === 'unassigned' || sId.toLowerCase() === 'unassigned') {
        await repos.staffAssignments.unassignSubscription({
          subscriptionId: sub.id,
          unassignedBy: adminUser,
          reason: 'Customer unassigned by admin'
        }, client);
      }
    } else {
      // On-Demand Job (Decoupled: does not alter active recurring subscriptions)
      const sCatId = resolveCanonicalCategory(cat);
      const existingJobs = await repos.serviceJobs.findByCustomerId(customer.id, { client });
      const primaryLoc = await repos.serviceLocations.findPrimaryByCustomerId(customer.id, client);

      let jobId = null;
      if (existingJobs.length > 0) {
        jobId = existingJobs[0].id;
        await repos.serviceJobs.updateJob(jobId, {
          serviceCategoryId: sCatId,
          serviceType: cat,
          packageDetails: pkgType,
          seaterType: seaterType,
          panelCount: panelCount,
          siteDetails: isSolar ? { panelCount: panelCount, roofType: 'RCC' } : null,
          locationId: targetLoc?.id || null,
          status: targetStaff ? 'assigned' : 'pending'
        }, client);
      } else {
        const newJob = await repos.serviceJobs.createJob({
          customerId: customer.id,
          vehicleId: targetVehicle?.id || null,
          locationId: targetLoc?.id || null,
          serviceCategoryId: sCatId,
          serviceType: cat,
          packageDetails: pkgType,
          seaterType: seaterType,
          panelCount: panelCount,
          siteDetails: isSolar ? { panelCount: panelCount, roofType: 'RCC' } : null,
          status: targetStaff ? 'assigned' : 'pending'
        }, client);
        jobId = newJob.id;
      }

      if (targetStaff && jobId) {
        await repos.staffAssignments.assignStaffToJob({
          staffId: targetStaff.id,
          jobId: jobId,
          assignedBy: adminUser
        }, client);
      }
    }

    await repos.auditLogs.logChange({
      entityType: 'customer_service',
      entityId: customer.id,
      action: 'assign_service',
      changedBy: adminUser,
      afterState: { customerId: customer.id, serviceCategory: cat, packageType: pkgType, staffId: targetStaff?.id }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      customerCode: customer.customer_code,
      subscriptionId: subId,
      jobId: jobId,
      message: `Service '${cat}' assigned successfully to ${customer.name}`
    };
  });
}

/**
 * Stop customer service cleanly without deactivating customer profile
 */
async function stopCustomerService({ customerId, reason = 'Customer requested service stop', adminUser = 'admin' } = {}) {
  if (!customerId) return { success: false, error: 'Customer ID is required.' };

  const target = String(customerId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(target);
  let customer = isUuid ? await repos.customers.findById(target) : null;
  if (!customer) customer = await repos.customers.findByCode(target);
  if (!customer) {
    const all = await repos.customers.findAll();
    customer = all.find(c => c.id === target || c.customer_code === target || c.phone === target) || null;
  }
  if (!customer) return { success: false, error: `Customer '${target}' not found.` };

  return db.withTransaction(async (client) => {
    // 1. Mark active subscriptions stopped
    const subRes = await client.query(
      `UPDATE public.subscriptions 
       SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP, stopped_reason = $1, stopped_by = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE customer_id = $3 AND status = 'active'
       RETURNING id`,
      [reason, adminUser, customer.id]
    );

    // 2. Mark pending / assigned jobs cancelled
    await client.query(
      `UPDATE public.service_jobs 
       SET status = 'cancelled', cancellation_reason = $1, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE customer_id = $3 AND status IN ('pending', 'assigned')`,
      [reason, adminUser, customer.id]
    );

    // 3. Keep customer profile Active
    await repos.customers.updateCustomer(customer.id, {
      isActive: true
    }, client);

    await repos.auditLogs.logChange({
      entityType: 'subscription',
      entityId: customer.id,
      action: 'stop_service',
      changedBy: adminUser,
      afterState: { customerId: customer.id, customerName: customer.name, status: 'stopped', reason }
    }, client);

    return {
      success: true,
      customerId: customer.id,
      stoppedSubscriptions: subRes.rowCount,
      message: `Service stopped successfully for ${customer.name}. Customer profile remains active in CRM.`
    };
  });
}

/**
 * Designation & Hierarchy Management for Admin
 */
async function getDesignationsList() {
  const designations = await staffDesignationService.getAllDesignations({ includeInactive: true });
  const allStaff = await repos.staff.findAll({ includeInactive: true });
  const countsByDesig = {};
  for (const s of allStaff) {
    const dId = (s.designation_id || 'cleaner').toLowerCase();
    countsByDesig[dId] = (countsByDesig[dId] || 0) + 1;
  }
  return designations.map(d => ({
    ...d,
    staffCount: countsByDesig[d.id.toLowerCase()] || 0
  }));
}

async function saveDesignation(data, adminUser = 'admin') {
  return await staffDesignationService.saveDesignation(data, adminUser);
}

async function deleteDesignation(id, adminUser = 'admin') {
  return await staffDesignationService.deleteDesignation(id, adminUser);
}

async function getStaffHierarchy() {
  const staffList = await getStaffList({ isAdmin: true });
  const activeStaff = staffList.filter(s => s.isActive);
  
  const staffById = new Map();
  const subordinatesMap = new Map();

  for (const s of activeStaff) {
    staffById.set(s.dbId || s.id, s);
    subordinatesMap.set(s.dbId || s.id, []);
  }

  const roots = [];
  for (const s of activeStaff) {
    const managerId = s.reportsToId;
    if (managerId && staffById.has(managerId)) {
      subordinatesMap.get(managerId).push(s);
    } else {
      roots.push(s);
    }
  }

  function buildNode(staffMember) {
    const subs = subordinatesMap.get(staffMember.dbId || staffMember.id) || [];
    return {
      id: staffMember.id,
      dbId: staffMember.dbId,
      name: staffMember.name,
      phone: staffMember.phone,
      photoUrl: staffMember.photoUrl,
      designationId: staffMember.designationId,
      designationName: staffMember.designationName,
      designationLevel: staffMember.designationLevel,
      isSupervisory: staffMember.isSupervisory,
      authorities: staffMember.authorities,
      workType: staffMember.workType,
      serviceCapabilities: staffMember.serviceCapabilities,
      reportsToId: staffMember.reportsToId,
      reportsToName: staffMember.reportsToName,
      teamName: staffMember.teamName,
      operationalScope: staffMember.operationalScope,
      subordinateCount: subs.length,
      subordinates: subs.map(buildNode)
    };
  }

  const tree = roots.map(buildNode);

  return {
    success: true,
    totalStaff: activeStaff.length,
    rootCount: roots.length,
    hierarchyTree: tree,
    flatStaff: activeStaff.map(s => ({
      ...s,
      directSubordinateCount: (subordinatesMap.get(s.dbId || s.id) || []).length
    }))
  };
}

module.exports = {
  assignCustomerService,
  stopCustomerService,
  normalizeIndianMobile,
  isValidIndianMobile,
  parseVehicleString,
  getAllCustomers,
  getCustomerById,
  saveCustomer,
  updateCustomer,
  deleteCustomer,
  getStaffList,
  saveStaffMember,
  deleteStaffMember,
  toggleStaffActive,
  getStaffSequence,
  saveStaffSequence,
  resetStaffSequence,
  getDailyCleanReports,
  updateDailyCleanReportStatus,
  deleteDailyCleanReport,
  calculateConsecutiveTimes,
  computeWashSolarElapsed,
  getDailyOperationsSummary,
  backfillHindiCustomerData,
  getLeads,
  updateLead,
  convertLeadToCustomer,
  addLeadNote,
  assignSpecialJob,
  reassignSpecialJob,
  getSpecialJobsAdmin,
  assignDailyCleanCustomer,
  unassignDailyCleanCustomer,
  getDailyCleanAssignments,
  getDesignationsList,
  saveDesignation,
  deleteDesignation,
  getStaffHierarchy,
  getServiceCatalog: () => serviceCatalog
};
