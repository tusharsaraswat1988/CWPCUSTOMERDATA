'use strict';

const crypto = require('node:crypto');

let phoneSeq = 100000;
let regSeq = 1000;
let codeSeq = 100;

const VARANASI_AREAS = [
  { label: 'Home', addressText: 'B-24/12, Sigra, Varanasi, UP 221010', latitude: 25.3119, longitude: 82.9873 },
  { label: 'Office', addressText: 'Plot 14, Lanka Crossing, Varanasi, UP 221005', latitude: 25.2797, longitude: 82.9996 },
  { label: 'Factory', addressText: 'Industrial Estate, Ramnagar, Varanasi, UP 221008', latitude: 25.2724, longitude: 83.0258 },
  { label: 'Villa', addressText: 'Sector 2, Sarnath Road, Varanasi, UP 221007', latitude: 25.3762, longitude: 83.0227 },
  { label: 'Showroom', addressText: 'Mahmoorganj Main Road, Varanasi, UP 221010', latitude: 25.3025, longitude: 82.9834 }
];

// Minimal valid 1x1 transparent PNG base64
const TINY_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function uniqueSuffix(prefix = 'e2e') {
  codeSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${codeSeq}-${crypto.randomBytes(2).toString('hex')}`;
}

function uniquePhone() {
  phoneSeq += 1;
  const tail = String(phoneSeq).slice(-6).padStart(6, '0');
  const rand2 = String(crypto.randomInt(10, 99));
  return `98${rand2}${tail}`; // 10 digits starting with 9
}

function uniqueRegNo(prefix = 'UP65') {
  regSeq += 1;
  const num = String(regSeq).slice(-4).padStart(4, '0');
  const letters = String.fromCharCode(65 + (regSeq % 26)) + String.fromCharCode(65 + ((regSeq * 7) % 26));
  return `${prefix}${letters}${num}`;
}

function makeCustomerPayload(overrides = {}) {
  const tag = uniqueSuffix('cust');
  return {
    name: `Varanasi Customer ${tag}`,
    phone: uniquePhone(),
    email: `${tag}@example.test`,
    notes: 'Synthetic E2E customer',
    ...overrides
  };
}

function makeLocationPayload(customerId, index = 0, overrides = {}) {
  const preset = VARANASI_AREAS[index % VARANASI_AREAS.length];
  return {
    customerId,
    label: preset.label,
    addressText: `${preset.addressText} #${uniqueSuffix('loc')}`,
    latitude: preset.latitude,
    longitude: preset.longitude,
    googleMapsUrl: `https://maps.google.com/?q=${preset.latitude},${preset.longitude}`,
    parkingDetails: 'Covered driveway',
    isPrimary: index === 0,
    ...overrides
  };
}

function makeVehiclePayload(customerId, locationId, overrides = {}) {
  return {
    customerId,
    locationId,
    registrationNo: uniqueRegNo(),
    seaterType: '5_seater',
    carModel: 'Maruti Swift',
    carColor: 'Pearl White',
    ...overrides
  };
}

function makeSolarPayload(customerId, locationId, overrides = {}) {
  return {
    customerId,
    locationId,
    panelCount: 12,
    kwLoad: 5.5,
    notes: 'Rooftop mono-PERC array',
    ...overrides
  };
}

function makeStaffPayload(overrides = {}) {
  const tag = uniqueSuffix('stf');
  return {
    name: `Staff ${tag}`,
    phone: uniquePhone(),
    pin: '4829',
    can_dcc: true,
    can_car_wash: false,
    can_solar: false,
    can_detailing: false,
    status: 'Active',
    weekly_off: 'Sunday',
    salary_amount: 14000,
    address: 'Bhelupur, Varanasi',
    ...overrides
  };
}

function makeLeadPayload(overrides = {}) {
  const tag = uniqueSuffix('lead');
  return {
    name: `Lead ${tag}`,
    phone: uniquePhone(),
    address: 'Lanka, Varanasi',
    interestedService: 'detailing',
    vehicleModel: 'Hyundai Creta',
    notes: 'Enquired from homepage',
    ...overrides
  };
}

module.exports = {
  VARANASI_AREAS,
  TINY_PNG_BASE64,
  uniqueSuffix,
  uniquePhone,
  uniqueRegNo,
  makeCustomerPayload,
  makeLocationPayload,
  makeVehiclePayload,
  makeSolarPayload,
  makeStaffPayload,
  makeLeadPayload
};
