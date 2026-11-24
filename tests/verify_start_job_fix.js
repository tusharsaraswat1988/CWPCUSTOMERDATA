const assert = require('assert');
const fs = require('fs');

const appJs = fs.readFileSync('public/js/app.js', 'utf8');
const staffM3 = fs.readFileSync('public/css/staff-m3.css', 'utf8');
const styleCss = fs.readFileSync('public/css/style.css', 'utf8');
const serverJs = fs.readFileSync('server.js', 'utf8');
const indexHtml = fs.readFileSync('Index.html', 'utf8');

console.log('Testing CSS button layout...');
assert.ok(staffM3.includes('.job-action-buttons-row'), 'staff-m3.css must have .job-action-buttons-row');
assert.ok(staffM3.includes('white-space: nowrap !important'), 'staff-m3.css must have white-space nowrap');
assert.ok(styleCss.includes('.job-action-buttons-row'), 'style.css must have .job-action-buttons-row');

console.log('Testing app.js rendering and date formatting...');
assert.ok(appJs.includes('formatJobDisplayDate'), 'app.js must include formatJobDisplayDate');
assert.ok(appJs.includes('formatJobDisplayDate(item.scheduledDate)'), 'app.js must format scheduledDate with formatJobDisplayDate');
assert.ok(appJs.includes('job-action-buttons-row'), 'app.js must render job-action-buttons-row container');

console.log('Testing submitStartSpecialJob non-blocking behavior...');
assert.ok(!appJs.includes('कृपया काम शुरू करने से पहले की कम से कम 1 फोटो लें।'), 'Must not block with photo required message');
assert.ok(appJs.includes('String(c.jobId || c.id) === String(jobId)'), 'Must safely compare jobIds as strings');

console.log('Testing server.js photo and auth handling...');
assert.ok(serverJs.includes('photoObj.base64.replace(/^data:[^;]+;base64,/'), 'Must strip data URI prefix in saveLocalUpload');
assert.ok(serverJs.includes('assignedStaffId = existingJob.staff_id || existingJob.assigned_to_staff_id'), 'Must check staff_id in server.js');

console.log('Testing Index.html optional photo label...');
assert.ok(indexHtml.includes('वैकल्पिक / Optional'), 'Index.html must display Optional label');

console.log('🎉 ALL TARGETED VERIFICATIONS PASSED SUCCESSFULLY!');
