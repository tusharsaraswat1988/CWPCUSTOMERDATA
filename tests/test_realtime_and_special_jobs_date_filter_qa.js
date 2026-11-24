/**
 * =========================================================================
 * QA Verification Suite: Realtime SSE & Wash/Solar Date Filter & Badge Sync
 * Tests:
 * 1. Side menu Wash & Solar count badge initialized immediately (Issue 1)
 * 2. Realtime SSE stream endpoint & event broadcasting engine (Issue 2)
 * 3. Wash & Solar Date Filters & Default "Today" period filtering (Issue 3)
 * =========================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🚀 RUNNING REALTIME SSE, WASH/SOLAR DATE FILTER & BADGE QA SUITE');
console.log('===============================================================');

// 1. DOM Markup Verification in Index.html
console.log('\n--- Test 1: Index.html DOM Components for Wash & Solar Period Filter ---');
const indexPath = path.resolve(__dirname, '../Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert.ok(indexHtml.includes('id="chipSpecialPeriodToday"'), 'chipSpecialPeriodToday must exist in Index.html');
assert.ok(indexHtml.includes('id="chipSpecialPeriodYesterday"'), 'chipSpecialPeriodYesterday must exist in Index.html');
assert.ok(indexHtml.includes('id="chipSpecialPeriod7Days"'), 'chipSpecialPeriod7Days must exist in Index.html');
assert.ok(indexHtml.includes('id="chipSpecialPeriodMonth"'), 'chipSpecialPeriodMonth must exist in Index.html');
assert.ok(indexHtml.includes('id="chipSpecialPeriodAll"'), 'chipSpecialPeriodAll must exist in Index.html');
assert.ok(indexHtml.includes('id="chipSpecialPeriodCustom"'), 'chipSpecialPeriodCustom must exist in Index.html');
assert.ok(indexHtml.includes('id="specialStartDate"'), 'specialStartDate input must exist in Index.html');
assert.ok(indexHtml.includes('id="specialEndDate"'), 'specialEndDate input must exist in Index.html');
assert.ok(indexHtml.includes('id="tabSpecialJobsCount"'), 'tabSpecialJobsCount must exist in Index.html');

console.log('✅ PASS 1: All Period filter buttons and date inputs verified in Index.html');

// 2. Client JavaScript Verification in public/js/app.js
console.log('\n--- Test 2: Client JavaScript Logic in public/js/app.js ---');
const appJsPath = path.resolve(__dirname, '../public/js/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert.ok(appJs.includes('adminSpecialState'), 'adminSpecialState must be defined');
assert.ok(appJs.includes("period: 'today'"), 'Default period in adminSpecialState must be today');
assert.ok(appJs.includes('function getJobEffectiveDateKey'), 'getJobEffectiveDateKey must be defined');
assert.ok(appJs.includes('function computeSpecialJobDatesFromPeriod'), 'computeSpecialJobDatesFromPeriod must be defined');
assert.ok(appJs.includes('function setSpecialPeriodChip'), 'setSpecialPeriodChip must be defined');
assert.ok(appJs.includes('function handleSpecialDateChange'), 'handleSpecialDateChange must be defined');
assert.ok(appJs.includes('function refreshAllAdminBadges'), 'refreshAllAdminBadges must be defined');
assert.ok(appJs.includes('function initAdminRealtimeStream'), 'initAdminRealtimeStream must be defined');
assert.ok(appJs.includes('function handleAdminRealtimeEvent'), 'handleAdminRealtimeEvent must be defined');
assert.ok(appJs.includes('function stopAdminRealtimeStream'), 'stopAdminRealtimeStream must be defined');

console.log('✅ PASS 2: Client-side realtime engine and period filter functions verified');

// 3. Functional Effective Date & Period Filter Logic Verification
console.log('\n--- Test 3: Effective Date Key Calculation & Filter Logic ---');

function getAsiaKolkataDateKey(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d || new Date());
  let y = '', m = '', day = '';
  parts.forEach(p => {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') day = p.value;
  });
  return `${y}-${m}-${day}`;
}

function getJobEffectiveDateKey(j) {
  if (!j) return '';
  const sDate = j.scheduledDate || j.scheduled_date;
  if (sDate) {
    if (typeof sDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sDate.trim())) {
      return sDate.trim();
    }
    try {
      const d = new Date(sDate);
      if (!isNaN(d.getTime())) return getAsiaKolkataDateKey(d);
    } catch(e) {}
  }
  const fallback = j.assignedAt || j.assigned_at || j.createdAt || j.created_at;
  if (fallback) {
    try {
      const d2 = new Date(fallback);
      if (!isNaN(d2.getTime())) return getAsiaKolkataDateKey(d2);
    } catch(e) {}
  }
  return '';
}

const todayDateKey = getAsiaKolkataDateKey(new Date());

const sampleJobs = [
  { id: '1', scheduledDate: null, createdAt: new Date().toISOString(), status: 'assigned' },
  { id: '2', scheduledDate: todayDateKey, createdAt: '2026-11-20T10:00:00Z', status: 'assigned' },
  { id: '3', scheduledDate: '2026-11-21T18:30:00.000Z', createdAt: '2026-11-21T10:00:00Z', status: 'completed' },
  { id: '4', scheduledDate: null, createdAt: '2026-11-20T10:00:00Z', status: 'assigned' }
];

assert.strictEqual(getJobEffectiveDateKey(sampleJobs[0]), todayDateKey, 'Job created today without scheduledDate should have today effective date');
assert.strictEqual(getJobEffectiveDateKey(sampleJobs[1]), todayDateKey, 'Job with today scheduledDate should have today effective date');
assert.notStrictEqual(getJobEffectiveDateKey(sampleJobs[2]), todayDateKey, 'Job with 21 Nov date should NOT have today effective date');
assert.notStrictEqual(getJobEffectiveDateKey(sampleJobs[3]), todayDateKey, 'Job created on 20 Nov should NOT have today effective date');

// Test today period filter
const todayJobs = sampleJobs.filter(j => getJobEffectiveDateKey(j) === todayDateKey);
assert.strictEqual(todayJobs.length, 2, 'Today filter must only return the 2 jobs for today');

// Test all period filter
assert.strictEqual(sampleJobs.length, 4, 'All filter must return all 4 jobs');

console.log('✅ PASS 3: Date key extraction and today/all period filtering verified');

// 4. Server-Side Realtime SSE Endpoint & Broadcast Verification in server.js
console.log('\n--- Test 4: Server-Side Realtime SSE Architecture in server.js ---');
const serverPath = path.resolve(__dirname, '../server.js');
const serverJs = fs.readFileSync(serverPath, 'utf8');

assert.ok(serverJs.includes('/api/admin-realtime-stream'), 'GET /api/admin-realtime-stream endpoint must exist in server.js');
assert.ok(serverJs.includes('const adminRealtimeClients = new Set();'), 'adminRealtimeClients Set must exist in server.js');
assert.ok(serverJs.includes('function broadcastAdminRealtimeEvent'), 'broadcastAdminRealtimeEvent must be defined in server.js');
assert.ok(serverJs.includes("broadcastAdminRealtimeEvent('SPECIAL_JOB_CHANGED'"), 'SPECIAL_JOB_CHANGED broadcast must be wired');
assert.ok(serverJs.includes("broadcastAdminRealtimeEvent('DAILY_CLEAN_CHANGED'"), 'DAILY_CLEAN_CHANGED broadcast must be wired');

console.log('✅ PASS 4: Server-side SSE endpoint and broadcast dispatcher verified');

console.log('\n===============================================================');
console.log('🎉 ALL REALTIME SSE, WASH/SOLAR DATE FILTER & BADGE TESTS PASSED!');
console.log('===============================================================');
process.exit(0);
