/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Phase 12: Canonical REST API Router (/api/see/*)
 * =========================================================================
 */

'use strict';

const db = require('../db/index');
const repos = require('../db/repositories/index');
const seeCatalogueService = require('./seeCatalogueService');
const seeFrequencyService = require('./seeFrequencyService');
const seeStaffCapabilityService = require('./seeStaffCapabilityService');
const seeEntitlementService = require('./seeEntitlementService');
const seeExecutionService = require('./seeExecutionService');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function parsePagination(searchParams) {
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}

/**
 * Handle /api/see/* routes. Returns true if handled, false otherwise.
 */
async function handleSeeRequest(req, res, parsedUrl, { extractAuthToken, resolveAdminSession, resolveStaffSession, uploadImage }) {
  const pathname = parsedUrl.pathname;
  if (!pathname.startsWith('/api/see/')) return false;

  const method = req.method.toUpperCase();
  const token = extractAuthToken(req, null);
  const adminSess = token ? await resolveAdminSession(token) : null;
  const staffSess = token ? await resolveStaffSession(token) : null;

  const requireAdmin = () => {
    if (!adminSess) {
      sendJson(res, 401, { success: false, error: 'Admin authentication required.' });
      return false;
    }
    return true;
  };

  const requireStaffOrAdmin = () => {
    if (!adminSess && !staffSess) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return false;
    }
    return true;
  };

  /**
   * Centralized authorization for staff/admin job endpoints (Phase 1 P0 IDOR fix).
   * - Admin: allowed via explicit admin session.
   * - Staff: MUST have an active staff_assignments row matching staffSess.staffId.
   *   Unassigned jobs and jobs assigned to other staff return uniform 403.
   */
  const authorizeJobAccess = async (jobId) => {
    const job = await repos.serviceJobs.findById(jobId);
    if (adminSess) {
      if (!job) {
        sendJson(res, 404, { success: false, error: 'Job not found.' });
        return null;
      }
      return { job, activeAssignment: await repos.staffAssignments.findActiveByJobId(jobId) };
    }
    if (!staffSess || !staffSess.staffId) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return null;
    }
    const activeAssignment = job ? await repos.staffAssignments.findActiveByJobId(jobId) : null;
    if (!job || !activeAssignment || activeAssignment.staff_id !== staffSess.staffId) {
      sendJson(res, 403, { success: false, error: 'Forbidden: you are not authorized to access this job.' });
      return null;
    }
    return { job, activeAssignment };
  };

  const actor = (adminSess && (adminSess.username || adminSess.user || 'admin'))
    || (staffSess && (staffSess.staffCode || staffSess.name || 'staff'))
    || 'anonymous';

  try {
    // ---------------------------------------------------------------------
    // 1. Service Catalogue
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/services') {
      const { limit, offset } = parsePagination(parsedUrl.searchParams);
      const services = await seeCatalogueService.listServices({
        status: parsedUrl.searchParams.get('status') || null,
        categoryId: parsedUrl.searchParams.get('categoryId') || null,
        serviceModel: parsedUrl.searchParams.get('serviceModel') || null,
        includeRetired: parsedUrl.searchParams.get('includeRetired') === 'true',
        limit,
        offset
      });
      return sendJson(res, 200, { success: true, services, pagination: { limit, offset } });
    }

    if (method === 'POST' && pathname === '/api/see/services') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const service = await seeCatalogueService.createService(body, actor);
      return sendJson(res, 201, { success: true, service });
    }

    let m = pathname.match(/^\/api\/see\/services\/([^/]+)$/);
    if (m) {
      const idOrCode = decodeURIComponent(m[1]);
      if (method === 'GET') {
        const service = await seeCatalogueService.getServiceDetail(idOrCode);
        if (!service) return sendJson(res, 404, { success: false, error: 'Service not found.' });
        return sendJson(res, 200, { success: true, service });
      }
      if (method === 'PATCH' || method === 'PUT') {
        if (!requireAdmin()) return true;
        const body = await readJsonBody(req);
        const service = await seeCatalogueService.updateService(idOrCode, body, actor, body.reason || 'Updated service');
        return sendJson(res, 200, { success: true, service });
      }
    }

    m = pathname.match(/^\/api\/see\/services\/([^/]+)\/status$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const service = await seeCatalogueService.changeServiceStatus(decodeURIComponent(m[1]), body.status, actor, body.reason);
      return sendJson(res, 200, { success: true, service });
    }

    // ---------------------------------------------------------------------
    // 2. Frequencies & Blackouts
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/frequencies') {
      const frequencies = await seeFrequencyService.listFrequencies();
      return sendJson(res, 200, { success: true, frequencies });
    }

    if (method === 'POST' && pathname === '/api/see/frequencies') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const frequency = await seeFrequencyService.createFrequency(body);
      return sendJson(res, 201, { success: true, frequency });
    }

    if (method === 'POST' && pathname === '/api/see/frequencies/preview') {
      if (!requireStaffOrAdmin()) return true;
      const body = await readJsonBody(req);
      const occurrences = seeFrequencyService.generateOccurrences(body.frequency, body.options || {});
      return sendJson(res, 200, { success: true, occurrences });
    }

    if (method === 'POST' && pathname === '/api/see/blackouts') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const blackout = await seeFrequencyService.addBlackout(body, actor);
      return sendJson(res, 201, { success: true, blackout });
    }

    // ---------------------------------------------------------------------
    // 3. Packages
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/packages') {
      const { limit, offset } = parsePagination(parsedUrl.searchParams);
      const packages = await seeCatalogueService.listPackages({
        status: parsedUrl.searchParams.get('status') || null,
        mainServiceId: parsedUrl.searchParams.get('mainServiceId') || null,
        vehicleSegment: parsedUrl.searchParams.get('vehicleSegment') || null,
        limit,
        offset
      });
      return sendJson(res, 200, { success: true, packages, pagination: { limit, offset } });
    }

    if (method === 'POST' && pathname === '/api/see/packages') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const pkg = await seeCatalogueService.createPackage(body, actor);
      return sendJson(res, 201, { success: true, package: pkg });
    }

    m = pathname.match(/^\/api\/see\/packages\/([^/]+)$/);
    if (m) {
      const idOrCode = decodeURIComponent(m[1]);
      if (method === 'GET') {
        const pkg = await seeCatalogueService.getPackageDetail(idOrCode);
        if (!pkg) return sendJson(res, 404, { success: false, error: 'Package not found.' });
        return sendJson(res, 200, { success: true, package: pkg });
      }
      if (method === 'PATCH' || method === 'PUT') {
        if (!requireAdmin()) return true;
        const body = await readJsonBody(req);
        const pkg = await seeCatalogueService.updatePackage(idOrCode, body, actor);
        return sendJson(res, 200, { success: true, package: pkg });
      }
    }

    m = pathname.match(/^\/api\/see\/packages\/([^/]+)\/price$/);
    if (m && method === 'POST') {
      const pkg = await seeCatalogueService.getPackageDetail(decodeURIComponent(m[1]));
      if (!pkg) return sendJson(res, 404, { success: false, error: 'Package not found.' });
      const body = await readJsonBody(req);
      const pricing = seeCatalogueService.calculatePackagePrice(pkg, body);
      return sendJson(res, 200, { success: true, pricing });
    }

    // ---------------------------------------------------------------------
    // 4. Add-ons
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/addons') {
      const addons = await seeCatalogueService.listAddons({
        status: parsedUrl.searchParams.get('status') || null,
        serviceId: parsedUrl.searchParams.get('serviceId') || null
      });
      return sendJson(res, 200, { success: true, addons });
    }

    if (method === 'POST' && pathname === '/api/see/addons') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const addon = await seeCatalogueService.createAddon(body, actor);
      return sendJson(res, 201, { success: true, addon });
    }

    m = pathname.match(/^\/api\/see\/addons\/([^/]+)$/);
    if (m) {
      const idOrCode = decodeURIComponent(m[1]);
      if (method === 'GET') {
        const addon = await seeCatalogueService.getAddonDetail(idOrCode);
        if (!addon) return sendJson(res, 404, { success: false, error: 'Add-on not found.' });
        return sendJson(res, 200, { success: true, addon });
      }
      if (method === 'PATCH' || method === 'PUT') {
        if (!requireAdmin()) return true;
        const body = await readJsonBody(req);
        const addon = await seeCatalogueService.updateAddon(idOrCode, body, actor);
        return sendJson(res, 200, { success: true, addon });
      }
    }

    // ---------------------------------------------------------------------
    // 5. Marketing Tags & Media
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/marketing-tags') {
      const tags = await seeCatalogueService.listMarketingTags(parsedUrl.searchParams.get('activeOnly') === 'true');
      return sendJson(res, 200, { success: true, tags });
    }

    if (method === 'POST' && pathname === '/api/see/marketing-tags') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const tag = await seeCatalogueService.createMarketingTag(body, actor);
      return sendJson(res, 201, { success: true, tag });
    }

    if (method === 'POST' && pathname === '/api/see/marketing-tags/attach') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const link = await seeCatalogueService.attachMarketingTag(body.entityType, body.entityId, body.tagId, body.sortOrder);
      return sendJson(res, 201, { success: true, link });
    }

    if (method === 'POST' && pathname === '/api/see/media') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const media = await seeCatalogueService.registerMediaAsset(body, actor);
      return sendJson(res, 201, { success: true, media });
    }

    if (method === 'POST' && pathname === '/api/see/media/upload') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req, 8 * 1024 * 1024);
      const { entityType, entityId, mediaSlot, base64, mimeType, altText, width, height } = body || {};
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!entityType || !entityId || !mediaSlot || !base64 || !mimeType) {
        return sendJson(res, 400, { success: false, error: 'entityType, entityId, mediaSlot, base64, and mimeType are required.' });
      }
      if (!allowedMimes.includes(String(mimeType).toLowerCase())) {
        return sendJson(res, 400, { success: false, error: 'Unsupported image MIME type. Allowed: JPEG, PNG, WebP.' });
      }
      const rawB64 = String(base64).replace(/^data:[^;]+;base64,/, '');
      const approxBytes = Math.floor((rawB64.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        return sendJson(res, 400, { success: false, error: 'Image size exceeds 5 MB limit.' });
      }
      if (typeof uploadImage !== 'function') {
        return sendJson(res, 503, { success: false, error: 'Image storage adapter is not configured.' });
      }
      const storageUrl = await uploadImage({ base64: rawB64, mimeType });
      if (!storageUrl) {
        return sendJson(res, 500, { success: false, error: 'Failed to store uploaded image.' });
      }
      const media = await seeCatalogueService.registerMediaAsset({
        entityType,
        entityId,
        mediaSlot,
        storageUrl,
        altText,
        width,
        height,
        mimeType
      }, actor);
      return sendJson(res, 201, { success: true, media });
    }

    m = pathname.match(/^\/api\/see\/media\/([^/]+)$/);
    if (m && method === 'DELETE') {
      if (!requireAdmin()) return true;
      const deleted = await seeCatalogueService.deleteMediaAsset(decodeURIComponent(m[1]));
      if (!deleted) return sendJson(res, 404, { success: false, error: 'Media asset not found.' });
      return sendJson(res, 200, { success: true, deleted });
    }

    // ---------------------------------------------------------------------
    // 6. Staff Types & Capabilities
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/staff-types') {
      if (!requireAdmin()) return true;
      const staffTypes = await seeStaffCapabilityService.listStaffTypes();
      return sendJson(res, 200, { success: true, staffTypes });
    }

    if (method === 'POST' && pathname === '/api/see/staff-types') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const staffType = await seeStaffCapabilityService.createStaffType(body, actor);
      return sendJson(res, 201, { success: true, staffType });
    }

    m = pathname.match(/^\/api\/see\/staff\/([^/]+)\/staff-type$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const result = await seeStaffCapabilityService.assignStaffType(decodeURIComponent(m[1]), body.staffTypeIdOrCode, actor);
      return sendJson(res, 200, { success: true, ...result });
    }

    m = pathname.match(/^\/api\/see\/staff\/([^/]+)\/capability-override$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const override = await seeStaffCapabilityService.grantCapabilityOverride({
        staffId: decodeURIComponent(m[1]),
        capabilityType: body.capabilityType,
        targetId: body.targetId,
        isAllowed: body.isAllowed,
        reason: body.reason,
        authorizedBy: actor,
        expiresAt: body.expiresAt || null
      });
      return sendJson(res, 201, { success: true, override });
    }

    if (method === 'POST' && pathname === '/api/see/staff/eligibility') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      // Resolve requiredEquipment and duration strictly from authoritative service configuration
      let resolvedSvc = null;
      if (body.serviceId) {
        resolvedSvc = await repos.seeCatalogue.findServiceById(body.serviceId);
      } else if (body.serviceCode) {
        resolvedSvc = await repos.seeCatalogue.findServiceByCode(body.serviceCode);
      }
      const requiredEquipment = Array.isArray(resolvedSvc && resolvedSvc.execution_config && resolvedSvc.execution_config.required_equipment)
        ? resolvedSvc.execution_config.required_equipment
        : [];
      const eligibility = await seeStaffCapabilityService.evaluateStaffEligibility(body.staffId, {
        ...body,
        serviceId: resolvedSvc ? resolvedSvc.id : body.serviceId,
        serviceCode: resolvedSvc ? resolvedSvc.service_code : body.serviceCode,
        durationMinutes: (resolvedSvc && resolvedSvc.expected_duration_minutes) || body.durationMinutes || 60,
        requiredEquipment
      });
      return sendJson(res, 200, { success: true, eligibility });
    }

    // ---------------------------------------------------------------------
    // 7. Purchases & Entitlements
    // ---------------------------------------------------------------------
    if (method === 'POST' && pathname === '/api/see/purchases') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const result = await seeEntitlementService.createPurchase({ ...body, actor });
      return sendJson(res, 201, { success: true, ...result });
    }

    m = pathname.match(/^\/api\/see\/customers\/([^/]+)\/context$/);
    if (m && method === 'GET') {
      if (!requireAdmin()) return true;
      const customerId = decodeURIComponent(m[1]);
      const customer = await repos.customers.findById(customerId);
      if (!customer || customer.deleted_at) return sendJson(res, 404, { success: false, error: 'Customer not found.' });
      const [vehicles, locations] = await Promise.all([
        repos.vehicles.findByCustomerId(customerId),
        repos.serviceLocations.findByCustomerId(customerId)
      ]);
      return sendJson(res, 200, {
        success: true,
        customer: { id: customer.id, name: customer.name, isActive: customer.is_active },
        vehicles,
        locations
      });
    }

    m = pathname.match(/^\/api\/see\/customers\/([^/]+)\/balance$/);
    if (m && method === 'GET') {
      if (!requireAdmin()) return true;
      const balance = await seeEntitlementService.getCustomerBalance(decodeURIComponent(m[1]));
      return sendJson(res, 200, { success: true, ...balance });
    }

    m = pathname.match(/^\/api\/see\/entitlements\/([^/]+)\/ledger$/);
    if (m && method === 'GET') {
      if (!requireAdmin()) return true;
      const { limit, offset } = parsePagination(parsedUrl.searchParams);
      const ledger = await seeEntitlementService.getEntitlementLedger(decodeURIComponent(m[1]), { limit, offset });
      return sendJson(res, 200, { success: true, ledger, pagination: { limit, offset } });
    }

    m = pathname.match(/^\/api\/see\/entitlements\/([^/]+)\/(adjust|refund|expire)$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true; // Strictly admin-only; staff cannot manipulate ledger
      const body = await readJsonBody(req);
      const result = await seeEntitlementService.mutateEntitlement({
        accountId: decodeURIComponent(m[1]),
        entryType: m[2],
        quantity: body.quantity,
        idempotencyKey: body.idempotencyKey || null,
        reason: body.reason,
        actor
      });
      return sendJson(res, 200, { success: true, ...result });
    }

    // ---------------------------------------------------------------------
    // 8. Canonical Jobs, Executions & Solar Verification
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/jobs') {
      if (!requireAdmin()) return true;
      const { limit, offset } = parsePagination(parsedUrl.searchParams);
      const jobs = await repos.serviceJobs.findAll({ seeManagedOnly: true, limit, offset });
      return sendJson(res, 200, { success: true, jobs, pagination: { limit, offset } });
    }

    if (method === 'POST' && pathname === '/api/see/jobs') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const job = await seeExecutionService.createCanonicalJob({ ...body, actor });
      return sendJson(res, 201, { success: true, job });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/assign$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true;
      const body = await readJsonBody(req);
      const job = await seeExecutionService.assignJob(decodeURIComponent(m[1]), body.staffId, actor);
      return sendJson(res, 200, { success: true, job });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/staff-contract$/);
    if (m && method === 'GET') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      if (!(await seeExecutionService.detectSeeManagedJob(authCtx.job))) {
        return sendJson(res, 400, {
          success: false,
          error: `Job '${jobId}' is not a canonical SEE-managed job and cannot be accessed via SEE.`
        });
      }
      const [addons, solarVerification] = await Promise.all([
        repos.seeOperations.findJobAddons(jobId),
        repos.seeOperations.findSolarVerificationByJob(jobId)
      ]);
      const contract = seeExecutionService.buildStaffSafeJobContract(authCtx.job, { addons, solarVerification });
      return sendJson(res, 200, { success: true, job: contract });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/start$/);
    if (m && method === 'POST') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      const body = await readJsonBody(req);
      const staffId = staffSess ? staffSess.staffId : body.staffId;
      const execution = await seeExecutionService.startExecution(jobId, staffId, {
        beforePhotos: Array.isArray(body.beforePhotos) ? body.beforePhotos : undefined,
        startedAt: body.startedAt || undefined
      });
      return sendJson(res, 200, { success: true, execution });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/complete$/);
    if (m && method === 'POST') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      const body = await readJsonBody(req);
      // Only admin can supply authorizedException
      const authorizedException = adminSess ? (body.authorizedException || null) : null;
      const execution = await seeExecutionService.completeExecution(jobId, {
        staffId: staffSess ? staffSess.staffId : body.staffId,
        checklistResults: body.checklistResults || [],
        proofPhotos: body.proofPhotos || { before: [], after: [] },
        actualQuantity: body.actualQuantity ?? null,
        measurements: body.measurements || {},
        customerConfirmation: body.customerConfirmation || {},
        authorizedException,
        completionNotes: body.completionNotes || body.notes || null,
        clientMutationId: body.clientMutationId || null,
        completedAtDevice: body.completedAtDevice || null,
        source: staffSess ? 'staff_portal' : 'admin_manual',
        actor
      });
      return sendJson(res, 200, { success: true, execution });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/terminate$/);
    if (m && method === 'POST') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      const body = await readJsonBody(req);
      const job = await seeExecutionService.terminateJobWithoutCompletion(jobId, body.outcome, {
        reason: body.reason,
        actor
      });
      return sendJson(res, 200, { success: true, job });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/addons\/([^/]+)\/complete$/);
    if (m && method === 'POST') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const jobAddonId = decodeURIComponent(m[2]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      if (!(await seeExecutionService.detectSeeManagedJob(authCtx.job))) {
        return sendJson(res, 400, {
          success: false,
          error: `Job '${jobId}' is not a canonical SEE-managed job and cannot process SEE add-ons.`
        });
      }
      const existingAddons = await repos.seeOperations.findJobAddons(jobId);
      if (!existingAddons.some(a => a.id === jobAddonId)) {
        return sendJson(res, 404, { success: false, error: 'Job add-on not found for this job.' });
      }
      const body = await readJsonBody(req);
      const jobAddon = await repos.seeOperations.updateJobAddonStatus(jobAddonId, {
        status: body.status || 'completed',
        checklistResults: body.checklistResults || null,
        proofUrls: body.proofUrls || null,
        completedBy: actor,
        exceptionReason: body.exceptionReason || null,
        approvedBy: adminSess ? actor : null
      });
      return sendJson(res, 200, { success: true, jobAddon });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/solar-verify$/);
    if (m && method === 'POST') {
      if (!requireStaffOrAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const authCtx = await authorizeJobAccess(jobId);
      if (!authCtx) return true;
      if (!(await seeExecutionService.detectSeeManagedJob(authCtx.job))) {
        return sendJson(res, 400, {
          success: false,
          error: `Job '${jobId}' is not a canonical SEE-managed job and cannot accept SEE solar verification.`
        });
      }
      const body = await readJsonBody(req);
      const verification = await seeExecutionService.submitSolarVerification(jobId, {
        staffId: staffSess ? staffSess.staffId : body.staffId,
        actualPanelCount: body.actualPanelCount,
        discrepancyReason: body.discrepancyReason || null
      });
      return sendJson(res, 200, { success: true, verification });
    }

    m = pathname.match(/^\/api\/see\/jobs\/([^/]+)\/solar-approve$/);
    if (m && method === 'POST') {
      if (!requireAdmin()) return true;
      const jobId = decodeURIComponent(m[1]);
      const job = await repos.serviceJobs.findById(jobId);
      if (!job) {
        return sendJson(res, 404, { success: false, error: 'Job not found.' });
      }
      if (!(await seeExecutionService.detectSeeManagedJob(job))) {
        return sendJson(res, 400, {
          success: false,
          error: `Job '${jobId}' is not a canonical SEE-managed job and cannot accept SEE solar discrepancy approval.`
        });
      }
      const body = await readJsonBody(req);
      const verification = await seeExecutionService.approveSolarDiscrepancy(jobId, {
        approved: body.approved !== false,
        finalServicedQuantity: body.finalServicedQuantity ?? null,
        approvedBy: actor
      });
      return sendJson(res, 200, { success: true, verification });
    }

    // ---------------------------------------------------------------------
    // 9. Admin Reporting Queries
    // ---------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/see/reports/entitlements') {
      if (!requireAdmin()) return true;
      const resDb = await db.query(
        `SELECT entitlement_kind, status, COUNT(*)::int AS account_count,
                COALESCE(SUM(purchased_qty),0)::int AS total_purchased,
                COALESCE(SUM(consumed_qty),0)::int AS total_consumed,
                COALESCE(SUM(remaining_qty),0)::int AS total_remaining
         FROM public.entitlement_accounts
         GROUP BY entitlement_kind, status
         ORDER BY entitlement_kind, status`
      );
      return sendJson(res, 200, { success: true, summary: resDb.rows });
    }

    if (method === 'GET' && pathname === '/api/see/reports/solar-discrepancies') {
      if (!requireAdmin()) return true;
      const resDb = await db.query(
        `SELECT sv.*, j.customer_id, j.scheduled_date, j.status AS job_status
         FROM public.solar_verifications sv
         JOIN public.service_jobs j ON sv.job_id = j.id
         WHERE sv.discrepancy_count != 0
         ORDER BY sv.updated_at DESC
         LIMIT 100`
      );
      return sendJson(res, 200, { success: true, discrepancies: resDb.rows });
    }

    return sendJson(res, 404, { success: false, error: 'SEE endpoint not found', pathname });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : (/unauthorized|forbidden/i.test(err.message) ? 403 : 400);
    return sendJson(res, status, { success: false, error: err.message });
  }
}

module.exports = {
  handleSeeRequest
};
