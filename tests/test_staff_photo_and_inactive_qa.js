/**
 * =========================================================================
 * QA TEST SUITE: STAFF PHOTO UPLOAD, DISPLAY & INACTIVE BEHAVIOR
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

console.log('===============================================================');
console.log('🧪 RUNNING STAFF PHOTO & INACTIVE STATUS QA TEST SUITE');
console.log('===============================================================');

console.log('\n--- Test 1: DOM Elements in Index.html & CSS ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '../Index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');

// Check Add Staff Photo inputs
assert(indexHtml.includes('newStaffPhotoFile'), 'Index.html must have newStaffPhotoFile');
assert(indexHtml.includes('btnAddNewStaffPhoto'), 'Index.html must have btnAddNewStaffPhoto');
assert(indexHtml.includes('btnClearNewStaffPhoto'), 'Index.html must have btnClearNewStaffPhoto');
console.log('✅ PASS: Add New Staff Form photo input & buttons present');

// Check Edit Staff Modal Photo elements
assert(indexHtml.includes('editStaffPhotoPreview'), 'Index.html must have editStaffPhotoPreview');
assert(indexHtml.includes('editStaffPhotoFile'), 'Index.html must have editStaffPhotoFile');
assert(indexHtml.includes('btnRemoveStaffPhoto'), 'Index.html must have btnRemoveStaffPhoto');
assert(indexHtml.includes('editStaffPhotoUrl'), 'Index.html must have editStaffPhotoUrl hidden field');
console.log('✅ PASS: Edit Staff Modal photo preview & upload elements present');

// Check Staff Portal Header
assert(indexHtml.includes('staffAvatarCircle'), 'Index.html must have staffAvatarCircle');
assert(indexHtml.includes('staffAvatarImg'), 'Index.html must have staffAvatarImg');
assert(indexHtml.includes('staffAvatarInitial'), 'Index.html must have staffAvatarInitial');
console.log('✅ PASS: Staff Portal Header avatar image and initial fallback present');

// Check Route Sequence Header
assert(indexHtml.includes('seqStaffAvatarImg'), 'Index.html must have seqStaffAvatarImg');
assert(indexHtml.includes('seqStaffAvatarDot'), 'Index.html must have seqStaffAvatarDot');
console.log('✅ PASS: Route Sequence staff avatar elements present');

// Check CSS rules
assert(styleCss.includes('.staff-avatar-circle'), 'style.css must define .staff-avatar-circle');
assert(styleCss.includes('.staff-card-avatar'), 'style.css must define .staff-card-avatar');
assert(styleCss.includes('.staff-avatar-dot-img'), 'style.css must define .staff-avatar-dot-img');
console.log('✅ PASS: CSS styles for staff avatar & card icons verified');

// Check JavaScript handlers
assert(appJs.includes('handleStaffPhotoSelect'), 'app.js must define handleStaffPhotoSelect');
assert(appJs.includes('clearNewStaffPhoto'), 'app.js must define clearNewStaffPhoto');
assert(appJs.includes('removeEditStaffPhoto'), 'app.js must define removeEditStaffPhoto');
assert(appJs.includes('compressStaffPhoto'), 'app.js must define compressStaffPhoto');
console.log('✅ PASS: JavaScript photo handlers and compression logic verified');

console.log('\n--- Test 2: Server API - Photo Upload & Inactive Lifecycle ---');

// Set up test environment with isolated test port and data file
const TEST_PORT = 5988;
const TEST_DATA_FILE = path.join(__dirname, 'test_staff_photo_data.json');

// Initialize clean test fixture
const initialFixture = {
  adminPasswordHash: 'scrypt:cwp_admin_salt_123:3fa0c968f3db47f9f743c3a4f61f7e0ef73fa123',
  staffList: [
    {
      id: 'STF01',
      name: 'Ramesh Patel',
      phone: '9876543210',
      pin: '123456',
      displayPin: '123456',
      active: true,
      photoUrl: ''
    },
    {
      id: 'STF02',
      name: 'Suresh Kumar',
      phone: '9876543211',
      pin: '654321',
      displayPin: '654321',
      active: true,
      photoUrl: ''
    }
  ],
  customers: [
    {
      customerId: 'CUST-001',
      customerName: 'Aarav Mehta',
      vehicle: 'DL01AB1234',
      serviceCategory: 'Daily Car Cleaning',
      staffName: 'Ramesh Patel',
      staffId: 'STF01',
      active: 'Yes'
    }
  ]
};

fs.writeFileSync(TEST_DATA_FILE, JSON.stringify(initialFixture, null, 2), 'utf8');

process.env.PORT = String(TEST_PORT);
process.env.DATA_FILE = TEST_DATA_FILE;
process.env.ADMIN_PASSWORD = 'testadminpassword';
process.env.NODE_ENV = 'test';

const cwp = require('../server.js');

function postJson(urlPath, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: 'GET',
      headers: headers
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runApiTests() {
  await new Promise((res) => {
    cwp.server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test server running on port ${TEST_PORT}`);
      res();
    });
  });

  // 1. Admin login to get admin token
  const adminLogin = await postJson('/api', { action: 'verifyAdminPassword', password: 'testadminpassword' });
  assert.strictEqual(adminLogin.status, 200, 'Admin login should succeed');
  const adminToken = adminLogin.body.token || adminLogin.body.adminToken;
  assert(adminToken, 'Admin token acquired');
  console.log('✅ PASS: Admin logged in with token');

  // 2. Add New Staff with Base64 Photo
  const samplePhotoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const addStaffRes = await postJson('/api', {
    action: 'saveStaffMember',
    staffData: {
      name: 'Vikas Sharma',
      phone: '9811122233',
      pin: '778899',
      active: true,
      photoData: {
        base64: samplePhotoBase64,
        mimeType: 'image/png'
      }
    }
  }, { 'Authorization': `Bearer ${adminToken}` });

  assert.strictEqual(addStaffRes.status, 200, 'saveStaffMember should succeed');
  assert(addStaffRes.body.success, 'saveStaffMember must return success: true');
  const addedStaff = (addStaffRes.body.staffList || []).find(s => s.name === 'Vikas Sharma');
  assert(addedStaff, 'Added staff must be in staffList');
  assert(addedStaff.photoUrl, 'Added staff must have photoUrl populated');
  console.log('✅ PASS: Staff created with photo upload, photoUrl:', addedStaff.photoUrl);

  // 3. GET /api/staff public vs admin check
  const publicStaff = await getJson('/api/staff');
  assert.strictEqual(publicStaff.status, 200);
  const vikasPublic = publicStaff.body.find(s => s.name === 'Vikas Sharma');
  assert(vikasPublic, 'Vikas Sharma must be in public staff list');
  assert(vikasPublic.photoUrl, 'Public staff list must expose photoUrl for staff avatar display');
  assert.strictEqual(vikasPublic.pin, undefined, 'Public staff list must NOT expose PIN');
  assert.strictEqual(vikasPublic.phone, undefined, 'Public staff list must NOT expose Phone');
  console.log('✅ PASS: Public GET /api/staff exposes photoUrl without compromising PIN or Phone');

  // 4. Edit Staff: Change Photo and verify update
  const editStaffRes = await postJson('/api', {
    action: 'saveStaffMember',
    staffData: {
      id: addedStaff.id,
      name: 'Vikas Sharma',
      phone: '9811122233',
      pin: '778899',
      active: true,
      photoUrl: 'https://cwpdata.up.railway.app/uploads/custom_vikas_photo.jpg'
    }
  }, { 'Authorization': `Bearer ${adminToken}` });

  assert.strictEqual(editStaffRes.status, 200);
  const vikasEdited = (editStaffRes.body.staffList || []).find(s => s.id === addedStaff.id);
  assert.strictEqual(vikasEdited.photoUrl, 'https://cwpdata.up.railway.app/uploads/custom_vikas_photo.jpg');
  console.log('✅ PASS: Edit staff photo updated successfully');

  // 5. Staff Portal: Staff logs in and fetches staff data with staffPhotoUrl
  const staffLoginRes = await postJson('/api', {
    action: 'verifyStaffPin',
    phone: '9811122233',
    pin: '778899',
    staffId: addedStaff.id
  });

  assert.strictEqual(staffLoginRes.status, 200);
  assert(staffLoginRes.body.success, 'Staff login should succeed');
  const staffToken = staffLoginRes.body.token || staffLoginRes.body.staffToken;
  assert(staffToken, 'Staff session token acquired');
  console.log('✅ PASS: Staff login succeeded');

  // Fetch staff data
  const staffDataRes = await getJson('/api/staff-data', {
    'Authorization': `Bearer ${staffToken}`
  });
  assert.strictEqual(staffDataRes.status, 200);
  assert.strictEqual(staffDataRes.body.staffPhotoUrl, 'https://cwpdata.up.railway.app/uploads/custom_vikas_photo.jpg', 'Staff data response must include staffPhotoUrl');
  console.log('✅ PASS: Staff portal receives staffPhotoUrl:', staffDataRes.body.staffPhotoUrl);

  // 6. INACTIVE BUTTON CHECK: What happens when admin toggles staff to INACTIVE?
  console.log('\n--- Test 3: INACTIVE Status Behavior & Security Enforcement ---');
  
  // Admin sets Vikas Sharma to Inactive
  const toggleInactiveRes = await postJson('/api', {
    action: 'toggleStaffActive',
    staffId: addedStaff.id,
    active: false
  }, { 'Authorization': `Bearer ${adminToken}` });

  assert.strictEqual(toggleInactiveRes.status, 200);
  const vikasInactive = toggleInactiveRes.body.staffList.find(s => s.id === addedStaff.id);
  assert.strictEqual(vikasInactive.active, false, 'Staff active status must be false');
  console.log('✅ PASS 1 (Inactive): Admin toggled staff to Inactive in staffList');

  // Check A: Does current logged in session get rejected immediately?
  const staffDataAfterInactive = await getJson('/api/staff-data', {
    'Authorization': `Bearer ${staffToken}`
  });
  assert.strictEqual(staffDataAfterInactive.status, 401, 'Inactive staff active session must be rejected with HTTP 401');
  console.log('✅ PASS 2 (Inactive): Existing active staff session was revoked immediately!');

  // Check B: Can inactive staff log in with their phone and PIN?
  const inactiveLoginAttempt = await postJson('/api', {
    action: 'verifyStaffPin',
    phone: '9811122233',
    pin: '778899',
    staffId: addedStaff.id
  });
  assert(inactiveLoginAttempt.body.inactive === true, 'Login attempt must indicate inactive: true');
  assert(inactiveLoginAttempt.body.error.includes('Inactive') || inactiveLoginAttempt.body.error.includes('निष्क्रिय'), 'Must return clear Hindi inactive error message');
  console.log('✅ PASS 3 (Inactive): Inactive staff login blocked with warning: "' + inactiveLoginAttempt.body.error + '"');

  // Check C: When admin reactivates staff (active = true), can they log in again?
  const toggleActiveRes = await postJson('/api', {
    action: 'toggleStaffActive',
    staffId: addedStaff.id,
    active: true
  }, { 'Authorization': `Bearer ${adminToken}` });
  assert.strictEqual(toggleActiveRes.status, 200);

  const reLoginAttempt = await postJson('/api', {
    action: 'verifyStaffPin',
    phone: '9811122233',
    pin: '778899',
    staffId: addedStaff.id
  });
  assert.strictEqual(reLoginAttempt.status, 200);
  assert(reLoginAttempt.body.success, 'Re-activated staff can log in again');
  console.log('✅ PASS 4 (Inactive): Re-activated staff logs in successfully!');

  // 7. Remove photo test
  const removePhotoRes = await postJson('/api', {
    action: 'saveStaffMember',
    staffData: {
      id: addedStaff.id,
      name: 'Vikas Sharma',
      phone: '9811122233',
      pin: '778899',
      removePhoto: true,
      active: true
    }
  }, { 'Authorization': `Bearer ${adminToken}` });
  assert.strictEqual(removePhotoRes.status, 200);
  const vikasNoPhoto = (removePhotoRes.body.staffList || []).find(s => s.id === addedStaff.id);
  assert.strictEqual(vikasNoPhoto.photoUrl, '', 'Photo must be removed when removePhoto: true');
  console.log('✅ PASS: Staff photo removal verified');

  console.log('\n===============================================================');
  console.log('🎉 ALL STAFF PHOTO & INACTIVE LIFECYCLE TESTS PASSED 100%!');
  console.log('===============================================================');

  cwp.server.close();
  try { fs.unlinkSync(TEST_DATA_FILE); } catch (e) {}
  process.exit(0);
}

runApiTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  try { fs.unlinkSync(TEST_DATA_FILE); } catch (e) {}
  process.exit(1);
});
