/**
 * SEE-13.1 Functional Verification Suite (Real DB + API Router)
 * Tests Services, Add-ons, Media Upload/Replace/Remove, Validation, and Cleanup.
 */
'use strict';

const assert = require('assert');
const { Readable } = require('stream');
const db = require('../db');
const seeApiRouter = require('../services/seeApiRouter');

function makeReq(method, urlPath, bodyObj = null, token = 'test-admin-token') {
  const payload = bodyObj ? JSON.stringify(bodyObj) : '';
  const stream = Readable.from(payload ? [Buffer.from(payload)] : []);
  stream.method = method;
  stream.url = urlPath;
  stream.headers = {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
  return stream;
}

function makeRes() {
  let statusCode = 200;
  let body = '';
  return {
    writeHead(code) { statusCode = code; },
    end(chunk) { body += chunk || ''; },
    getStatus() { return statusCode; },
    getJson() { return JSON.parse(body || '{}'); }
  };
}

async function callSee(method, urlPath, bodyObj = null, token = 'test-admin-token') {
  const req = makeReq(method, urlPath, bodyObj, token);
  const res = makeRes();
  const parsedUrl = new URL(urlPath, 'http://localhost');
  const handled = await seeApiRouter.handleSeeRequest(req, res, parsedUrl, {
    extractAuthToken: (r) => (r.headers.authorization || '').replace(/^Bearer\s+/i, '') || null,
    resolveAdminSession: async (t) => (t === 'test-admin-token' ? { username: 'qa_admin', role: 'superadmin' } : null),
    resolveStaffSession: async () => null,
    uploadImage: async ({ mimeType }) => `/uploads/qa_${Date.now()}.${mimeType.split('/')[1]}`
  });
  assert.notStrictEqual(handled, false, `Route ${method} ${urlPath} must be handled`);
  return { status: res.getStatus(), data: res.getJson() };
}

async function run() {
  const ts = Date.now();
  const svcCode = `QA_13_1_SVC_${ts}`;
  const addonCode = `QA_13_1_ADD_${ts}`;
  let createdSvcId = null;
  let createdAddonId = null;
  const dummyB64 = Buffer.from('fake-image-bytes').toString('base64');

  try {
    console.log('1. Testing Service Create, Media Upload/Replace/Remove, Tag Attach, Edit, Retire...');
    const createSvcRes = await callSee('POST', '/api/see/services', {
      serviceCode: svcCode,
      name: 'QA Ceramic Foam Wash',
      nameHi: 'क्यूए फोम वॉश',
      serviceCategoryId: 'car_washing',
      serviceModel: 'visit_credit',
      status: 'draft',
      expectedDurationMinutes: 45,
      tagline: 'Showroom shine',
      description: 'Short desc',
      details: 'Detailed scope',
      executionConfig: { allow_addons: true },
      checklistRequirements: ['Pre-rinse', 'Foam wash'],
      photoRequirements: { required: true, before_min: 1, after_min: 1 },
      cityZoneApplicability: { all_cities: false, cities: [], zones: ['South-4'] }
    });
    assert.strictEqual(createSvcRes.status, 201);
    createdSvcId = createSvcRes.data.service.id;

    // Tag attach
    const tagsRes = await callSee('GET', '/api/see/marketing-tags?activeOnly=true');
    assert.strictEqual(tagsRes.status, 200);
    assert(tagsRes.data.tags.length > 0, 'Expected seeded marketing tags');
    const tagAttachRes = await callSee('POST', '/api/see/marketing-tags/attach', {
      entityType: 'service',
      entityId: createdSvcId,
      tagId: tagsRes.data.tags[0].id,
      sortOrder: 1
    });
    assert.strictEqual(tagAttachRes.status, 201);

    // Media upload: Square 1:1 (PNG) + Rectangle 4:3 (JPEG)
    const sqUp = await callSee('POST', '/api/see/media/upload', {
      entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1',
      base64: `data:image/png;base64,${dummyB64}`, mimeType: 'image/png', width: 400, height: 400
    });
    assert.strictEqual(sqUp.status, 201);

    const rectUp = await callSee('POST', '/api/see/media/upload', {
      entityType: 'service', entityId: createdSvcId, mediaSlot: 'rectangle_4_3',
      base64: `data:image/jpeg;base64,${dummyB64}`, mimeType: 'image/jpeg', width: 800, height: 600
    });
    assert.strictEqual(rectUp.status, 201);

    // Replace Square 1:1 with WebP
    const sqRep = await callSee('POST', '/api/see/media/upload', {
      entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1',
      base64: `data:image/webp;base64,${dummyB64}`, mimeType: 'image/webp', width: 500, height: 500
    });
    assert.strictEqual(sqRep.status, 201);

    // Verify GET detail parity
    const svcDet = await callSee('GET', `/api/see/services/${createdSvcId}`);
    assert.strictEqual(svcDet.status, 200);
    assert.strictEqual(svcDet.data.service.name_hi, 'क्यूए फोम वॉश');
    assert.strictEqual(svcDet.data.service.tagline, 'Showroom shine');
    assert.strictEqual(svcDet.data.service.details, 'Detailed scope');
    assert.strictEqual(svcDet.data.service.marketingTags.length, 1);
    assert.strictEqual(svcDet.data.service.media.length, 2);
    assert.strictEqual(svcDet.data.service.media.find(m => m.media_slot === 'square_1_1').mime_type, 'image/webp');

    // Delete Rectangle 4:3
    const delMedia = await callSee('DELETE', `/api/see/media/${rectUp.data.media.id}`);
    assert.strictEqual(delMedia.status, 200);
    const svcDetAfterDel = await callSee('GET', `/api/see/services/${createdSvcId}`);
    assert.strictEqual(svcDetAfterDel.data.service.media.length, 1);
    assert.strictEqual(svcDetAfterDel.data.service.media[0].media_slot, 'square_1_1');

    // Edit service & Retire
    const patchSvc = await callSee('PATCH', `/api/see/services/${createdSvcId}`, { name: 'QA Ceramic Foam Wash v2' });
    assert.strictEqual(patchSvc.status, 200);
    assert.strictEqual(patchSvc.data.service.version, 2);

    const retireSvc = await callSee('POST', `/api/see/services/${createdSvcId}/status`, { status: 'retired', reason: 'QA cleanup' });
    assert.strictEqual(retireSvc.status, 200);
    assert.strictEqual(retireSvc.data.service.status, 'retired');
    console.log('✅ PASS: Services complete CRUD, content, media upload/replace/remove, tags, versioning, and retire');

    console.log('2. Testing Image Validation & Auth Rejection...');
    const unauth = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1', base64: dummyB64, mimeType: 'image/png' }, null);
    assert.strictEqual(unauth.status, 401);

    const badMime = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1', base64: dummyB64, mimeType: 'image/gif' });
    assert.strictEqual(badMime.status, 400);

    const tooLarge = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1', base64: 'A'.repeat(7 * 1024 * 1024), mimeType: 'image/png' });
    assert.strictEqual(tooLarge.status, 400);

    const emptyB64 = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1', base64: '', mimeType: 'image/png' });
    assert.strictEqual(emptyB64.status, 400);

    const badSqRatio = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'square_1_1', base64: dummyB64, mimeType: 'image/png', width: 200, height: 100 });
    assert.strictEqual(badSqRatio.status, 400);

    const badRectRatio = await callSee('POST', '/api/see/media/upload', { entityType: 'service', entityId: createdSvcId, mediaSlot: 'rectangle_4_3', base64: dummyB64, mimeType: 'image/jpeg', width: 100, height: 200 });
    assert.strictEqual(badRectRatio.status, 400);
    console.log('✅ PASS: Image auth, MIME, size (>5MB), empty file, and 1:1 / 4:3 aspect-ratio validation');

    console.log('3. Testing Add-on Create, Compatibility, Media Upload, Detail, Edit, Retire...');
    const createAddonRes = await callSee('POST', '/api/see/addons', {
      addonCode,
      name: 'QA Tyre Dressing',
      tagline: 'Deep black finish',
      details: 'Silicone-free tyre shine',
      pricingModel: 'fixed',
      defaultPrice: 129,
      expectedDurationMinutes: 15,
      defaultQuantity: 1,
      executionMode: 'during_main_service',
      isOptional: true,
      status: 'active',
      checklistRequirements: ['Clean sidewall', 'Apply dressing'],
      proofRequirements: { required: true, before_min: 1, after_min: 1 },
      applicableServiceIds: [createdSvcId]
    });
    assert.strictEqual(createAddonRes.status, 201);
    createdAddonId = createAddonRes.data.addon.id;

    const addMedia = await callSee('POST', '/api/see/media/upload', {
      entityType: 'addon', entityId: createdAddonId, mediaSlot: 'square_1_1',
      base64: dummyB64, mimeType: 'image/png', width: 300, height: 300
    });
    assert.strictEqual(addMedia.status, 201);

    const addDet = await callSee('GET', `/api/see/addons/${createdAddonId}`);
    assert.strictEqual(addDet.status, 200);
    assert(addDet.data.addon.applicable_service_ids.includes(createdSvcId), 'Expected service compatibility persisted');
    assert.strictEqual(addDet.data.addon.media.length, 1);

    const addPatch = await callSee('PATCH', `/api/see/addons/${createdAddonId}`, {
      status: 'retired',
      applicableServiceIds: []
    });
    assert.strictEqual(addPatch.status, 200);
    assert.strictEqual(addPatch.data.addon.status, 'retired');
    assert.strictEqual(addPatch.data.addon.applicable_service_ids.length, 0);
    console.log('✅ PASS: Add-ons complete CRUD, compatibility sync, media upload, detail, and retire');
  } finally {
    // Clean up ONLY temporary QA records created by this test
    if (createdAddonId) {
      await db.query(`DELETE FROM public.media_assets WHERE entity_type = 'addon' AND entity_id = $1`, [createdAddonId]).catch(() => {});
      await db.query(`DELETE FROM public.addons WHERE id = $1`, [createdAddonId]).catch(() => {});
    }
    if (createdSvcId) {
      await db.query(`DELETE FROM public.media_assets WHERE entity_type = 'service' AND entity_id = $1`, [createdSvcId]).catch(() => {});
      await db.query(`DELETE FROM public.entity_marketing_tags WHERE entity_type = 'service' AND entity_id = $1`, [createdSvcId]).catch(() => {});
      await db.query(`DELETE FROM public.services WHERE id = $1`, [createdSvcId]).catch(() => {});
    }
  }
}

run()
  .then(() => {
    console.log('\nSEE-13.1 FUNCTIONAL VERIFICATION: ALL PASSED');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nSEE-13.1 FUNCTIONAL VERIFICATION FAILED:', err);
    process.exit(1);
  });
