const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('public/admin-v2/index.html');
const bookings = read('public/admin-v2/js/v2-bookings.js');
const specialJobs = read('public/admin-v2/js/v2-special-jobs.js');
const customers = read('public/admin-v2/js/v2-customers.js');
const staff = read('public/admin-v2/js/v2-staff.js');
const dcc = read('public/admin-v2/js/v2-assign-jobs.js');
const shell = read('public/admin-v2/js/v2-shell.js');
const search = read('public/admin-v2/js/v2-search.js');
const notifications = read('public/admin-v2/js/v2-notifications.js');
const dashboard = read('public/admin-v2/js/v2-dashboard.js');
const hybrid = read('public/admin-v2/js/v2-hybrid-packages.js');
const seePackages = read('public/admin-v2/js/v2-see-packages.js');
const playground = read('public/admin-v2/js/v2-playground.js');

assert.match(html, /id="v2View_serviceAssign"[^>]*aria-label="Assign Booking"/);
assert.match(html, /id="v2BkBtnNewBooking"/);
assert.match(bookings, /request\('createServiceBooking'/);
assert.match(bookings, /request\('reassignSpecialJob'/);
assert.match(bookings, /\/api\/see\/jobs\/.*\/assign/);
assert.match(bookings, /cwp-v2:search-select/);
assert.match(dashboard, /navigateToModule\('serviceAssign'/);
assert.match(html, /data-dash-quick-action="openBookingQueue"[\s\S]*?Booking Queue/);
assert.doesNotMatch(html, /data-dash-quick-action="createBooking"|<span>Create Booking<\/span>/);
assert.doesNotMatch(dashboard, /openCreateModal\(\)/);
assert.match(html, /title="Add sample record"[\s\S]*?Add Demo Row/);
assert.match(html, /v2-playground\.js\?v=2\.1\.3/);
assert.match(playground, /Simulated sample record added/);
assert.doesNotMatch(playground, /Simulated new operational booking created/);

assert.doesNotMatch(html, /id="v2ModalSjAssign"|id="v2ModalSjReassign"|id="v2SjBtnAssignJob"/);
assert.doesNotMatch(specialJobs, /request\('assignSpecialJob'|request\('reassignSpecialJob'|request\('cancelSpecialJob'|request\('deleteSpecialJob'/);
assert.match(specialJobs, /data-sj-action="manageBooking"/);
assert.match(specialJobs, /navigateToBooking\(jid\)/);
assert.match(specialJobs, /data-sj-action="manageBooking"[^>]*>View Booking/);
assert.doesNotMatch(html, /id="v2SjBtnManageBookings"/);
assert.match(specialJobs, /actHtml \+= `<span[^`]*Terminal state/);
assert.doesNotMatch(html, /id="v2SjBtnManageBookings"|Manage bookings/);
assert.match(specialJobs, /request\('startSpecialJob'/);
assert.match(specialJobs, /request\('completeSpecialJob'/);
assert.match(specialJobs, /request\('failServiceJob'/);
assert.doesNotMatch(specialJobs, /data-sj-detail-act="cancel"|data-sj-detail-act="delete"/);
assert.match(bookings, /function navigateToBooking\(jobId\)/);
assert.match(bookings, /function consumePendingNavigation\(\)/);

assert.match(customers, /request\('assignDailyCleanCustomer'/);
assert.match(customers, /title="Assign DCC Schedule"/);
assert.doesNotMatch(customers, /v2CustManageBookings|Manage bookings/);
assert.match(customers, /data-customer-booking-id=/);
assert.match(customers, /navigateToBooking\(bookingButton\.getAttribute\('data-customer-booking-id'\)\)/);
assert.doesNotMatch(html, /id="v2CustQaLogService"|id="v2ModalLogService"/);
assert.doesNotMatch(customers, /openLogServiceModal|submitLogService|createServiceBooking|reassignSpecialJob/);
assert.match(staff, /request\('assignDailyCleanCustomer'/);
assert.match(staff, /title="Assign DCC Schedule"/);
assert.match(html, /id="v2StaffQaViewBookings"/);
assert.match(staff, /navigateToStaffBookings\(s\.staffCode \|\| s\.id\)/);
assert.match(staff, /data-staff-booking-id=/);
assert.match(staff, /navigateToBooking\(bookingButton\.getAttribute\('data-staff-booking-id'\)\)/);
assert.doesNotMatch(staff, /createServiceBooking|assignSpecialJob|reassignSpecialJob/);
assert.match(shell, /title: 'DCC Schedule Assignments'/);
assert.match(dcc, /request\('assignDailyCleanCustomer'/);
assert.match(dcc, /request\('unassignDailyCleanCustomer'/);

assert.doesNotMatch(hybrid, /createServiceBooking|assignSpecialJob|reassignSpecialJob/);
assert.doesNotMatch(seePackages, /createServiceBooking|assignSpecialJob|reassignSpecialJob/);
assert.match(search, /group: 'Bookings',[\s\S]*?tab: 'serviceAssign'/);
assert.match(notifications, /bookingId,[\s\S]*?subtitle: 'View this booking and review its assignment\.',[\s\S]*?tab: 'serviceAssign'/);
assert.match(notifications, /data-notif-booking-id=/);
assert.match(notifications, /bookings\.navigateToBooking\(bookingId\)/);
assert.match(bookings, /function navigateToBooking\(jobId\)/);
assert.match(bookings, /state\.pendingNavigationBookingId = requestedId/);
assert.match(bookings, /if \(booking\) openDetail\(String\(booking\.id \|\| booking\.jobId\)\)/);

// Mutation ownership: only the canonical booking module may expose on-demand mutations.
for (const [name, source] of Object.entries({ customers, staff, specialJobs, hybrid, seePackages })) {
  assert.doesNotMatch(source, /createServiceBooking|assignSpecialJob|reassignSpecialJob/, `${name} must not own on-demand booking mutations`);
}
assert.match(bookings, /request\('createServiceBooking'/);
assert.match(bookings, /request\('reassignSpecialJob'/);
assert.match(html, /id="v2BkBtnNewBooking"/);
assert.match(html, /id="v2BkCreateForm"/);
assert.match(html, /id="v2BkCreateSubmitBtn"/);

for (const [src, key] of [
  [html, 'v2-customers.js?v=2.1.5'],
  [html, 'v2-staff.js?v=2.1.7'],
  [html, 'v2-bookings.js?v=2.1.3'],
  [html, 'v2-special-jobs.js?v=2.1.4'],
  [html, 'v2-dashboard.js?v=2.1.3'],
  [html, 'v2-shell.js?v=2.1.3'],
  [html, 'v2-search.js?v=2.1.3'],
  [html, 'v2-notifications.js?v=2.1.4'],
  [html, 'v2-playground.js?v=2.1.3']
]) assert.ok(src.includes(key), `cache-busting reference ${key} must be present`);

console.log('Admin V2 booking ownership QA passed.');
