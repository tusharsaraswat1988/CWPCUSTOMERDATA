/**
 * QA TEST SUITE: COMPACT KANBAN CARDS, DRAG & DROP AND STAGE SHIFTING
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('===============================================================');
console.log('🎯 RUNNING KANBAN COMPACT CARDS & DRAG-AND-DROP QA TEST SUITE');
console.log('===============================================================');

// 1. Check style.css definitions
console.log('\n--- Test 1: Compact Card & Drag-Drop CSS Tokens ---');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
assert.ok(css.includes('.compact-lead-card'), 'style.css must define .compact-lead-card');
assert.ok(css.includes('.kanban-col-dragover'), 'style.css must define .kanban-col-dragover for drop visual feedback');
assert.ok(css.includes('.btn-stage-shift'), 'style.css must define .btn-stage-shift for 1-click stage advance');
assert.ok(css.includes('.compact-lead-header'), 'style.css must define .compact-lead-header');
assert.ok(css.includes('.compact-lead-phone-row'), 'style.css must define .compact-lead-phone-row');
assert.ok(css.includes('.compact-lead-footer'), 'style.css must define .compact-lead-footer');
console.log('✅ PASS 1: All compact card and drag-and-drop styles verified in style.css');

// 2. Check app.js logic & exports
console.log('\n--- Test 2: Drag & Drop and Stage Shift Functions in app.js ---');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
assert.ok(js.includes('function shiftLeadStage'), 'app.js must define shiftLeadStage');
assert.ok(js.includes('function handleLeadDragStart'), 'app.js must define handleLeadDragStart');
assert.ok(js.includes('function handleLeadDragEnd'), 'app.js must define handleLeadDragEnd');
assert.ok(js.includes('function handleLeadDragOver'), 'app.js must define handleLeadDragOver');
assert.ok(js.includes('function handleLeadDragEnter'), 'app.js must define handleLeadDragEnter');
assert.ok(js.includes('function handleLeadDragLeave'), 'app.js must define handleLeadDragLeave');
assert.ok(js.includes('function handleLeadDrop'), 'app.js must define handleLeadDrop');

assert.ok(js.includes('window.shiftLeadStage = shiftLeadStage'), 'app.js must export shiftLeadStage');
assert.ok(js.includes('window.handleLeadDragStart = handleLeadDragStart'), 'app.js must export handleLeadDragStart');
assert.ok(js.includes('window.handleLeadDrop = handleLeadDrop'), 'app.js must export handleLeadDrop');
console.log('✅ PASS 2: Drag & drop event handlers and stage shifter functions verified in app.js');

// 3. Verify server API endpoint /api with updateLeadStage
console.log('\n--- Test 3: Live Server updateLeadStage API Execution ---');
const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    // Unauthenticated request should be rejected with 401, NOT 400 (Unknown action)
    assert.strictEqual(res.statusCode, 401, 'Unauthenticated request should return 401');
    const parsed = JSON.parse(data);
    assert.strictEqual(parsed.unauthorized, true);
    assert.ok(!parsed.error.includes('Unknown or unsupported action'), 'Action updateLeadStage must be recognized');
    console.log('✅ PASS 3: updateLeadStage action recognized and protected by server');
    console.log('\n===============================================================');
    console.log('🎉 ALL COMPACT KANBAN & DRAG-AND-DROP QA TESTS PASSED CLEANLY!');
    console.log('===============================================================');
  });
});
req.on('error', (err) => {
  console.error('Server request error:', err.message);
  process.exit(1);
});
req.write(JSON.stringify({ action: 'updateLeadStage', leadId: 'test' }));
req.end();
