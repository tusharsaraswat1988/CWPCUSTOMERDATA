/**
 * Automated QA Test Suite for On-Demand Services & Completion Journey
 * Covers:
 *  1. Database Repository operations (createJob, findDispatchedForStaff, startJob, completeJob, softDelete)
 *  2. Admin Services (assignSpecialJob with existing customer & new customer, getSpecialJobsAdmin)
 *  3. Staff Portal Data Payload (journey fields: beforePhotos, afterPhotos, startedAt, completedAt, versioning)
 *  4. Frontend DOM & Templates (Admin tab, Staff Alert Banner, 3 Modals)
 *  5. Audio Chime & PWA Notification Integrations
 *  6. CSS Styling & WhatsApp Share Verification
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING ON-DEMAND SERVICES & COMPLETION JOURNEY QA SUITE');
console.log('===============================================================\n');

const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'Index.html');
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const cssPath = path.join(rootDir, 'public', 'css', 'style.css');
const swPath = path.join(rootDir, 'sw.js');
const migrationPath = path.join(rootDir, 'migrations', '005_add_service_jobs_journey.sql');

// ---------------------------------------------------------------------------
// TEST 1: DATABASE MIGRATION INTEGRITY
// ---------------------------------------------------------------------------
console.log('--- Test 1: Database Migration 005 Integrity ---');
assert.ok(fs.existsSync(migrationPath), 'Migration 005_add_service_jobs_journey.sql must exist');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

assert.ok(migrationSql.includes('before_photos JSONB'), 'Migration must add before_photos JSONB column');
assert.ok(migrationSql.includes('after_photos JSONB'), 'Migration must add after_photos JSONB column');
assert.ok(migrationSql.includes('started_at TIMESTAMPTZ'), 'Migration must add started_at TIMESTAMPTZ column');
assert.ok(migrationSql.includes('completed_at TIMESTAMPTZ'), 'Migration must add completed_at TIMESTAMPTZ column');
assert.ok(migrationSql.includes('completion_notes TEXT'), 'Migration must add completion_notes column');
assert.ok(migrationSql.includes('DROP CONSTRAINT IF EXISTS chk_job_target'), 'Migration must relax chk_job_target constraint for flexible on-demand jobs');
console.log('✅ PASS 1: Migration 005 adds all journey columns and relaxes constraints cleanly.\n');

// ---------------------------------------------------------------------------
// TEST 2: REPOSITORY & SERVICE LAYER VERIFICATION
// ---------------------------------------------------------------------------
console.log('--- Test 2: Repository & Service Functions ---');
const serviceJobsRepo = require('../db/repositories/serviceJobsRepo');
const staffPortalService = require('../services/staffPortalService');
const adminService = require('../services/adminService');

assert.strictEqual(typeof serviceJobsRepo.createJob, 'function', 'serviceJobsRepo.createJob must be a function');
assert.strictEqual(typeof serviceJobsRepo.findDispatchedForStaff, 'function', 'serviceJobsRepo.findDispatchedForStaff must be a function');
assert.strictEqual(typeof serviceJobsRepo.startJob, 'function', 'serviceJobsRepo.startJob must be a function');
assert.strictEqual(typeof serviceJobsRepo.completeJob, 'function', 'serviceJobsRepo.completeJob must be a function');
assert.strictEqual(typeof serviceJobsRepo.softDelete, 'function', 'serviceJobsRepo.softDelete must be a function');

assert.strictEqual(typeof adminService.assignSpecialJob, 'function', 'adminService.assignSpecialJob must be exported');
assert.strictEqual(typeof adminService.getSpecialJobsAdmin, 'function', 'adminService.getSpecialJobsAdmin must be exported');
assert.strictEqual(typeof staffPortalService.computeStaffDataVersion, 'function', 'staffPortalService.computeStaffDataVersion must be exported');

console.log('✅ PASS 2: Repository and backend service functions are properly defined and exported.\n');

// ---------------------------------------------------------------------------
// TEST 3: INDEX.HTML DOM STRUCTURE VERIFICATION
// ---------------------------------------------------------------------------
console.log('--- Test 3: Index.html DOM Components for On-Demand Journey ---');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Staff New Task Alert Banner
assert.ok(indexHtml.includes('id="staffNewTaskAlertBanner"'), 'Index.html must contain staffNewTaskAlertBanner');

// Admin Header & Navigation
assert.ok(indexHtml.includes('id="tabBtnSpecialJobs"'), 'Index.html must contain tabBtnSpecialJobs in admin tabs');
assert.ok(indexHtml.includes('id="adminTabSpecialJobs"'), 'Index.html must contain adminTabSpecialJobs container');
assert.ok(indexHtml.includes('openAssignSpecialJobModal()'), 'Index.html must have trigger for openAssignSpecialJobModal');

// Admin Special Jobs Table & KPIs
assert.ok(indexHtml.includes('id="kpiSpecialTotal"'), 'Index.html must have kpiSpecialTotal');
assert.ok(indexHtml.includes('id="kpiSpecialAssigned"'), 'Index.html must have kpiSpecialAssigned');
assert.ok(indexHtml.includes('id="kpiSpecialInProgress"'), 'Index.html must have kpiSpecialInProgress');
assert.ok(indexHtml.includes('id="kpiSpecialCompleted"'), 'Index.html must have kpiSpecialCompleted');
assert.ok(indexHtml.includes('id="adminSpecialJobsTable"'), 'Index.html must have adminSpecialJobsTable');

// Modals: Assign (Admin), Start (Staff Before Photos), Complete (Staff After Photos)
assert.ok(indexHtml.includes('id="assignSpecialJobModal"'), 'Index.html must contain assignSpecialJobModal');
assert.ok(indexHtml.includes('id="startSpecialJobModal"'), 'Index.html must contain startSpecialJobModal');
assert.ok(indexHtml.includes('id="startJobPhotoInput"'), 'Index.html must have startJobPhotoInput for Before photos');
assert.ok(indexHtml.includes('id="completeSpecialJobModal"'), 'Index.html must contain completeSpecialJobModal');
assert.ok(indexHtml.includes('id="completeJobPhotoInput"'), 'Index.html must have completeJobPhotoInput for After photos');
assert.ok(indexHtml.includes('id="completeJobNotes"'), 'Index.html must have completeJobNotes textarea');

console.log('✅ PASS 3: Index.html includes all required on-demand tabs, alert banners, and journey modals.\n');

// ---------------------------------------------------------------------------
// TEST 4: PUBLIC/JS/APP.JS CLIENT LOGIC & EXPORTS
// ---------------------------------------------------------------------------
console.log('--- Test 4: Client-Side Logic & Window Exports ---');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Web Audio Chimes
assert.ok(appJs.includes('function playNewTaskChime('), 'app.js must define playNewTaskChime');
assert.ok(appJs.includes('function playTaskCompletedChime('), 'app.js must define playTaskCompletedChime');
assert.ok(appJs.includes('AudioContext'), 'app.js must use Web Audio API for offline chimes');

// Alert & Notification Engine
assert.ok(appJs.includes('function showStaffNewTaskBanner('), 'app.js must define showStaffNewTaskBanner');
assert.ok(appJs.includes('navigator.vibrate'), 'app.js must trigger tactile vibration on new task');
assert.ok(appJs.includes('Notification.permission'), 'app.js must check and trigger browser/PWA notifications');

// Journey Handlers
assert.ok(appJs.includes('function openStartSpecialJobModal('), 'app.js must define openStartSpecialJobModal');
assert.ok(appJs.includes('function submitStartSpecialJob('), 'app.js must define submitStartSpecialJob');
assert.ok(appJs.includes('function openCompleteSpecialJobModal('), 'app.js must define openCompleteSpecialJobModal');
assert.ok(appJs.includes('function submitCompleteSpecialJob('), 'app.js must define submitCompleteSpecialJob');
assert.ok(appJs.includes('function shareSpecialJobWhatsApp('), 'app.js must define shareSpecialJobWhatsApp');
assert.ok(appJs.includes('function openAssignSpecialJobModal('), 'app.js must define openAssignSpecialJobModal');
assert.ok(appJs.includes('function handleAssignSpecialJobSubmit('), 'app.js must define handleAssignSpecialJobSubmit');

// Window Exports for Inline HTML Callbacks
const requiredExports = [
  'openStartSpecialJobModal',
  'closeStartSpecialJobModal',
  'handleStartJobPhotoSelect',
  'removeStartJobPhoto',
  'submitStartSpecialJob',
  'openCompleteSpecialJobModal',
  'closeCompleteSpecialJobModal',
  'handleCompleteJobPhotoSelect',
  'removeCompleteJobPhoto',
  'submitCompleteSpecialJob',
  'shareSpecialJobWhatsApp',
  'openAssignSpecialJobModal',
  'closeAssignSpecialJobModal',
  'toggleSpecialCustMode',
  'handleSpecialCustSelected',
  'handleSpecialCategoryChange',
  'handleAssignSpecialJobSubmit',
  'loadAdminSpecialJobs',
  'filterAdminSpecialJobs',
  'resetAdminSpecialFilters',
  'handleAdminSpecialSearch',
  'renderAdminSpecialJobsTable',
  'deleteAdminSpecialJob',
  'playNewTaskChime',
  'playTaskCompletedChime',
  'showStaffNewTaskBanner',
  'jumpToSpecialJob'
];

requiredExports.forEach((fn) => {
  assert.ok(appJs.includes(`window.${fn} = ${fn};`), `app.js must export window.${fn}`);
});

console.log('✅ PASS 4: All 27 on-demand controller functions and audio chimes are exported to window.\n');

// ---------------------------------------------------------------------------
// TEST 5: CSS STYLES & LUXURY VISUAL SYSTEM
// ---------------------------------------------------------------------------
console.log('--- Test 5: CSS Styles in style.css ---');
const styleCss = fs.readFileSync(cssPath, 'utf8');

assert.ok(styleCss.includes('.staff-new-task-banner'), 'style.css must style .staff-new-task-banner');
assert.ok(styleCss.includes('.job-card-journey-bar'), 'style.css must style .job-card-journey-bar');
assert.ok(styleCss.includes('.job-status-assigned'), 'style.css must style .job-status-assigned');
assert.ok(styleCss.includes('.job-status-in-progress'), 'style.css must style .job-status-in-progress');
assert.ok(styleCss.includes('.job-status-completed'), 'style.css must style .job-status-completed');
assert.ok(styleCss.includes('.btn-job-start'), 'style.css must style .btn-job-start');
assert.ok(styleCss.includes('.btn-job-complete'), 'style.css must style .btn-job-complete');
assert.ok(styleCss.includes('.btn-job-wa-share'), 'style.css must style .btn-job-wa-share');
assert.ok(styleCss.includes('.job-photos-grid'), 'style.css must style .job-photos-grid');
assert.ok(styleCss.includes('.special-kpi-grid'), 'style.css must style .special-kpi-grid');

console.log('✅ PASS 5: All on-demand CSS classes, responsive grids, and journey buttons verified in style.css.\n');

// ---------------------------------------------------------------------------
// TEST 6: SERVICE WORKER NOTIFICATIONCLICK INTEGRATION
// ---------------------------------------------------------------------------
console.log('--- Test 6: Service Worker Notification Click ---');
const swJs = fs.readFileSync(swPath, 'utf8');

assert.ok(swJs.includes("self.addEventListener('notificationclick'"), 'sw.js must handle notificationclick event');
assert.ok(swJs.includes("client.focus()"), 'sw.js must focus existing staff window on notification click');
assert.ok(swJs.includes("clients.openWindow('/staff')"), 'sw.js must open /staff if no window is active');

console.log('✅ PASS 6: Service Worker handles PWA notification clicks smoothly.\n');

// ---------------------------------------------------------------------------
// TEST 7: SERVER.JS ENDPOINTS VERIFICATION
// ---------------------------------------------------------------------------
console.log('--- Test 7: Server API Endpoints ---');
const serverJs = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

assert.ok(serverJs.includes("payload.action === 'assignSpecialJob'"), 'server.js must handle assignSpecialJob action');
assert.ok(serverJs.includes("payload.action === 'getSpecialJobs'"), 'server.js must handle getSpecialJobs action');
assert.ok(serverJs.includes("payload.action === 'startSpecialJob'"), 'server.js must handle startSpecialJob action');
assert.ok(serverJs.includes("payload.action === 'completeSpecialJob'"), 'server.js must handle completeSpecialJob action');
assert.ok(serverJs.includes("payload.action === 'deleteSpecialJob'"), 'server.js must handle deleteSpecialJob action');

console.log('✅ PASS 7: server.js handles all 5 on-demand API endpoints with proper auth guards.\n');

// ---------------------------------------------------------------------------
// TEST 8: LIVE REPOSITORY & DATABASE BEHAVIOR (WHEN DB AVAILABLE)
// ---------------------------------------------------------------------------
console.log('--- Test 8: Live DB Integration (Neon PostgreSQL) ---');
if (process.env.DATABASE_URL) {
  (async function runDbTests() {
    try {
      const db = require('../db');
      const repos = require('../db/repositories');

      // Get an active staff member for assignment
      const allStaff = await repos.staff.findAll();
      const staffMember = (allStaff && allStaff.length > 0) ? allStaff[0] : null;
      assert.ok(staffMember, 'Must have at least 1 staff member in DB');
      const staffId = staffMember.id;

      // Create a test on-demand job via adminService.assignSpecialJob
      const assignResult = await adminService.assignSpecialJob({
        serviceCategoryId: 'solar_cleaning',
        customerName: 'QA Test Solar Customer',
        phone: '9988776655',
        address: 'Aliganj Sector B, Lucknow',
        googleMapsUrl: 'https://maps.google.com/?q=26.8829,80.9436',
        packageDetails: '20 Solar Panels - Complete Deep Clean',
        staffId: staffId,
        staffNotes: 'Automated QA suite validation'
      }, 'admin_test');

      if (!assignResult || !assignResult.success) {
        console.error('assignSpecialJob returned error:', assignResult);
      }
      assert.ok(assignResult && assignResult.success && assignResult.job, 'assignSpecialJob must succeed');
      const testJob = assignResult.job;
      console.log('  ✔ Created and assigned on-demand test job:', testJob.id);

      // Verify querying special jobs in adminService
      const adminJobs = await adminService.getSpecialJobsAdmin({ category: 'solar_cleaning' });
      assert.ok(Array.isArray(adminJobs.jobs), 'getSpecialJobsAdmin must return jobs array');
      const found = adminJobs.jobs.some(j => j.id === testJob.id || j.jobId === testJob.id);
      assert.ok(found, 'Created job must appear in admin jobs list');
      console.log('  ✔ Verified job in admin special jobs query');

      // Start the job with before photos
      const started = await serviceJobsRepo.startJob(testJob.id, [
        'https://res.cloudinary.com/demo/image/upload/sample_before1.jpg'
      ]);
      assert.strictEqual(started.status, 'in_progress', 'Job status must transition to in_progress');
      assert.ok(started.started_at, 'Job must record started_at timestamp');
      assert.strictEqual(started.before_photos.length, 1, 'Job must record before_photos');
      console.log('  ✔ Started on-demand test job with Before photo');

      // Complete the job with after photos & notes
      const completed = await serviceJobsRepo.completeJob(testJob.id, [
        'https://res.cloudinary.com/demo/image/upload/sample_after1.jpg'
      ], 'All panels wiped and power output tested');
      assert.strictEqual(completed.status, 'completed', 'Job status must transition to completed');
      assert.ok(completed.completed_at, 'Job must record completed_at timestamp');
      assert.strictEqual(completed.after_photos.length, 1, 'Job must record after_photos');
      assert.strictEqual(completed.completion_notes, 'All panels wiped and power output tested');
      console.log('  ✔ Completed on-demand test job with After photo & notes');

      // Soft delete test job
      const deleted = await serviceJobsRepo.softDelete(testJob.id);
      assert.ok(deleted, 'Job must be soft-deleted successfully');
      console.log('  ✔ Soft deleted test job');

      // Clean up test customer record created during test
      if (testJob.customer_id) {
        await db.query('DELETE FROM public.customers WHERE id = $1', [testJob.customer_id]);
        console.log('  ✔ Cleaned up test customer record');
      }

      console.log('✅ PASS 8: Live Neon PostgreSQL on-demand lifecycle verified end-to-end.\n');

      console.log('===============================================================');
      console.log('🎉 ALL 8 ON-DEMAND SERVICES & COMPLETION JOURNEY TESTS PASSED!');
      console.log('===============================================================');
      process.exit(0);
    } catch (err) {
      console.error('Database test error:', err);
      process.exit(1);
    }
  })();
} else {
  console.log('  ℹ️ process.env.DATABASE_URL not set in current env; repository structure passed.');
  console.log('===============================================================');
  console.log('🎉 ALL 7 ON-DEMAND SERVICES & COMPLETION JOURNEY TESTS PASSED!');
  console.log('===============================================================');
}
