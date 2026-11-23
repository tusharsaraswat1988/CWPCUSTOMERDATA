const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🧪 RUNNING STAFF STATUS BUTTON & REMOVED ACTIONS QA TEST SUITE');
console.log('===============================================================');

const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../Index.html'), 'utf8');

// 1. Verify Copy Link and WhatsApp removed from staff card rendering
assert(!appJs.includes('📋 Copy Link'), 'app.js staff cards must NOT contain Copy Link button');
assert(!appJs.includes('💬 WhatsApp</a>'), 'app.js staff cards must NOT contain WhatsApp button');
console.log('✅ PASS: Copy Link and WhatsApp buttons successfully removed from staff management list');

// 2. Verify btn-staff-status-toggle exists in app.js
assert(appJs.includes('btn-staff-status-toggle is-active'), 'app.js must render active status button');
assert(appJs.includes('btn-staff-status-toggle is-inactive'), 'app.js must render inactive status button');
assert(appJs.includes('staff-toggle-dot dot-active'), 'app.js must render active dot');
assert(appJs.includes('staff-toggle-dot dot-inactive'), 'app.js must render inactive dot');
assert(appJs.includes('toggleStaffActiveStatus('), 'app.js must bind click to toggleStaffActiveStatus');
console.log('✅ PASS: Direct Active/Inactive toggle button properly placed in staff cards');

// 3. Verify CSS rules in style.css
assert(styleCss.includes('.btn-staff-status-toggle'), 'style.css must define .btn-staff-status-toggle');
assert(styleCss.includes('.btn-staff-status-toggle.is-active'), 'style.css must style .is-active');
assert(styleCss.includes('.btn-staff-status-toggle.is-inactive'), 'style.css must style .is-inactive');
assert(styleCss.includes('.staff-toggle-dot'), 'style.css must style .staff-toggle-dot');
assert(styleCss.includes('body.theme-dark .btn-staff-status-toggle.is-active'), 'style.css must support dark mode');
console.log('✅ PASS: CSS styles for status toggle button & dark mode verified');

// 4. Verify Index.html versioning
assert(indexHtml.includes('style.css?v=3.3.3'), 'Index.html has cache-busted style.css');
assert(indexHtml.includes('app.js?v=3.3.3'), 'Index.html has cache-busted app.js');
console.log('✅ PASS: Index.html version bump verified');

console.log('===============================================================');
console.log('🎉 ALL STAFF STATUS BUTTON TESTS PASSED 100%!');
console.log('===============================================================');
