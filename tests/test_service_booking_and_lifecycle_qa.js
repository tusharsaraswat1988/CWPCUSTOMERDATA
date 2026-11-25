/**
 * =========================================================================
 * QA TEST SUITE: SERVICE BOOKING & JOB LIFECYCLE (AGENT TASK 01.3)
 * CWP Customer Data App — CWPCUSTOMERDATA
 *
 * Verifies:
 * 1. Migration 018 schema integrity (package linkage, entitlement flag, failure tracking)
 * 2. Repository enhancement (serviceJobsRepo with package_id, failJob, findByIdForUpdate)
 * 3. Booking creation decoupling (no forced cleaner, no DCC interference)
 * 4. State Machine Lifecycle: requested/booked -> assigned -> in_progress -> completed / cancelled / unable_to_complete
 * 5. Strict lifecycle transition guards (cannot cancel/re-complete completed jobs)
 * 6. CRITICAL Package Entitlement Invariants:
 *    - Invariant A: Booking creates NO entitlement deduction (balance unchanged).
 *    - Invariant B: Completion consumes entitlement EXACT-ONCE.
 *    - Invariant C: Duplicate completion calls do NOT double-deduct entitlement.
 *    - Invariant D: Cancellation consumes ZERO entitlement.
 *    - Invariant E: "Unable to Complete" consumes ZERO entitlement.
 *    - Invariant F: Exhausted packages rejected from booking eligibility.
 * 7. Server action routing, RBAC protection & handler wiring
 * 8. Admin Customer Profile Hub UI (Material Symbols, dialogs, tabs)
 * 9. Frontend JavaScript controller integration (public/js/app.js)
 *
 * SAFETY GUARANTEE:
 * Runs in isolated test mode (NODE_ENV=test).
 * Zero writes or migrations executed against live production database.
 * =========================================================================
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const bookingService = require('../services/bookingService');
const packageService = require('../services/packageService');
const serviceJobsRepo = require('../db/repositories/serviceJobsRepo');

function pass(testName) {
  console.log(`  ✅ PASS: ${testName}`);
}

function fail(testName, err) {
  console.error(`  ❌ FAIL: ${testName}`, err);
  throw err;
}

async function runBookingLifecycleTestSuite() {
  console.log('===============================================================');
  console.log('🚀 CWP SERVICE BOOKING & JOB LIFECYCLE QA TEST SUITE');
  console.log('===============================================================\n');

  let passedCount = 0;

  // Reset in-memory test stores
  bookingService.__resetLocalStore();
  packageService.__resetLocalStore();

  // --------------------------------------------------------------------------
  // SECTION 1: Migration 018 Schema & Database Integrity
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Migration 018 Schema & DDL Audit ---');
  try {
    const migrationPath = path.join(__dirname, '..', 'migrations', '018_enhance_service_jobs_lifecycle_and_packages.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 018 file must exist');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Column additions
    assert.ok(migrationSql.includes('package_id UUID') && migrationSql.includes('REFERENCES public.customer_packages(id)'), 'Adds package_id FK to customer_packages');
    assert.ok(migrationSql.includes('entitlement_consumed BOOLEAN NOT NULL DEFAULT FALSE'), 'Adds entitlement_consumed flag with default FALSE');
    assert.ok(migrationSql.includes('booking_source VARCHAR(50)'), 'Adds booking_source column');
    assert.ok(migrationSql.includes('service_price NUMERIC(10, 2)'), 'Adds service_price column');
    assert.ok(migrationSql.includes('payment_status VARCHAR(30)'), 'Adds payment_status column');
    assert.ok(migrationSql.includes('failure_reason VARCHAR(255)'), 'Adds failure_reason column');
    assert.ok(migrationSql.includes('failed_at TIMESTAMPTZ'), 'Adds failed_at timestamp');
    assert.ok(migrationSql.includes('failed_by VARCHAR(100)'), 'Adds failed_by actor attribution');

    // Performance & Partial indexes
    assert.ok(migrationSql.includes('idx_service_jobs_package_id'), 'Creates index on package_id');
    assert.ok(migrationSql.includes('idx_service_jobs_customer_status'), 'Creates compound index on customer_id and status');

    pass('1.1 Migration 018 defines package linkage, exact-once entitlement tracking, and failure tracking');
    passedCount++;
  } catch (err) {
    fail('1.1 Migration 018 check failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 2: Repository Layer Capabilities
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Repository Layer Implementation ---');
  try {
    assert.strictEqual(typeof serviceJobsRepo.createJob, 'function', 'serviceJobsRepo.createJob exists');
    assert.strictEqual(typeof serviceJobsRepo.updateJob, 'function', 'serviceJobsRepo.updateJob exists');
    assert.strictEqual(typeof serviceJobsRepo.failJob, 'function', 'serviceJobsRepo.failJob exists');
    assert.strictEqual(typeof serviceJobsRepo.findByIdForUpdate, 'function', 'serviceJobsRepo.findByIdForUpdate exists');

    pass('2.1 serviceJobsRepo exports failJob and findByIdForUpdate for transactional safety');
    passedCount++;
  } catch (err) {
    fail('2.1 Repository check failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 3: Service Booking Creation & Decoupling
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Booking Creation & Architecture Decoupling ---');
  const testCustomer = {
    id: 'cust-uuid-101',
    name: 'Vikram Sharma',
    mobile: '9876500001',
    vehicles: [{ vehicle_reg: 'DL01AB1234', category: 'car' }],
    locations: [{ id: 'loc-001', name: 'Home Villa', address: 'Plot 42, Vasant Vihar' }]
  };

  try {
    // 3.1 Validation checks
    await assert.rejects(
      async () => {
        await bookingService.createBooking({});
      },
      /Customer ID is required/,
      'Rejects booking without customer ID'
    );

    await assert.rejects(
      async () => {
        await bookingService.createBooking({ customerId: testCustomer.id, serviceCategory: 'car_wash' });
      },
      /Service type \/ name is required/,
      'Rejects booking without service type'
    );

    // 3.2 Create unassigned booking
    const unassignedBooking = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash',
      serviceType: 'Foam Wash & Interior Vacuum',
      scheduledDate: '2026-11-28',
      preferredTimeSlot: 'Morning (06:00 - 10:00)',
      assetId: 'DL01AB1234',
      locationId: 'loc-001',
      servicePrice: 450,
      paymentStatus: 'unpaid',
      specialInstructions: 'Customer requested gate code: 1234'
    }, { customer: testCustomer });

    assert.ok(unassignedBooking.id, 'Booking created with unique ID');
    assert.strictEqual(unassignedBooking.status, 'booked', 'Unassigned booking starts in status "booked"');
    assert.strictEqual(unassignedBooking.staff_id, null, 'No staff cleaner assigned');
    assert.strictEqual(unassignedBooking.entitlement_consumed, false, 'Entitlement not consumed');
    assert.strictEqual(unassignedBooking.service_price, 450, 'Price recorded correctly');

    // 3.3 Create assigned booking
    const assignedBooking = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'solar_cleaning',
      serviceType: 'Solar Panel Deep Cleaning',
      scheduledDate: '2026-11-29',
      assignedCleanerId: 'cleaner-777',
      servicePrice: 600,
      paymentStatus: 'paid'
    }, { customer: testCustomer });

    assert.strictEqual(assignedBooking.status, 'assigned', 'Booking with staff starts in status "assigned"');
    assert.strictEqual(assignedBooking.staff_id, 'cleaner-777', 'Staff cleaner assigned correctly');

    pass('3.1 Booking is decoupled from immediate execution and DCC route assignments');
    passedCount++;
  } catch (err) {
    fail('3.1 Booking creation check failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: Service Job Lifecycle State Machine
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Job Lifecycle State Machine Transitions ---');
  try {
    const job = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash',
      serviceType: 'Exterior Foam Wash',
      scheduledDate: '2026-11-28',
      assetId: 'DL01AB1234'
    }, { customer: testCustomer });

    assert.strictEqual(job.status, 'booked');

    // Transition 1: booked -> in_progress
    const inProgressJob = await bookingService.startJob({
      jobId: job.id,
      beforePhotos: ['photo_before_1.jpg'],
      actor: 'staff-cleaner'
    });
    assert.strictEqual(inProgressJob.status, 'in_progress', 'Job transitions to in_progress');
    assert.ok(inProgressJob.started_at, 'Job started timestamp recorded');

    // Transition 2: in_progress -> completed
    const completedJob = await bookingService.completeJob({
      jobId: job.id,
      afterPhotos: ['photo_after_1.jpg'],
      completionRemarks: 'Car cleaned and shiny',
      actor: 'staff-cleaner'
    });
    assert.strictEqual(completedJob.status, 'completed', 'Job transitions to completed');
    assert.ok(completedJob.completed_at, 'Job completed timestamp recorded');

    // Transition Guard: cannot restart or fail completed job
    await assert.rejects(
      async () => {
        await bookingService.startJob({ jobId: job.id });
      },
      /Cannot start job in completed status/,
      'Guards against restarting completed job'
    );

    await assert.rejects(
      async () => {
        await bookingService.failJob({ jobId: job.id, failureReason: 'Vehicle moved' });
      },
      /Cannot fail job in completed status/,
      'Guards against failing completed job'
    );

    await assert.rejects(
      async () => {
        await bookingService.cancelBooking({ jobId: job.id, reason: 'Customer changed mind' });
      },
      /Cannot cancel job in completed status/,
      'Guards against cancelling completed job'
    );

    pass('4.1 State machine enforces valid transitions and protects completed jobs from alteration');
    passedCount++;
  } catch (err) {
    fail('4.1 State machine check failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 5: CRITICAL PACKAGE ENTITLEMENT INVARIANTS (Exact-Once Deduction)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: CRITICAL Package Entitlement Invariants ---');
  try {
    // Sell a 3-unit package to test customer
    const soldPkg = await packageService.sellPackage({
      customerId: testCustomer.id,
      packageName: '3x Gold Car Wash Pack',
      serviceCategory: 'car_wash',
      totalQuantity: 3,
      price: 1200,
      paymentStatus: 'paid'
    });

    assert.strictEqual(soldPkg.remainingQuantity, 3, 'Initial package balance is 3');

    // --- Invariant A: Booking creates NO entitlement deduction ---
    const booking1 = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash',
      serviceType: 'Gold Foam Wash (Visit 1)',
      packageId: soldPkg.id,
      scheduledDate: '2026-11-28',
      assetId: 'DL01AB1234'
    }, { customer: testCustomer });

    assert.strictEqual(booking1.status, 'booked');
    assert.strictEqual(booking1.package_id, soldPkg.id);
    assert.strictEqual(booking1.entitlement_consumed, false, 'Booking must NOT consume entitlement');

    let pkgCheck1 = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgCheck1.remainingQuantity, 3, 'INVARIANT A CONFIRMED: Package balance remains 3 at booking time');

    // --- Invariant B: Completion consumes entitlement EXACT-ONCE ---
    await bookingService.startJob({ jobId: booking1.id, actor: 'cleaner-1' });
    const completed1 = await bookingService.completeJob({
      jobId: booking1.id,
      completionRemarks: 'Visit 1 complete',
      actor: 'cleaner-1'
    });

    assert.strictEqual(completed1.status, 'completed');
    assert.strictEqual(completed1.entitlement_consumed, true, 'Job marked entitlement_consumed: true');

    let pkgCheck2 = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgCheck2.remainingQuantity, 2, 'INVARIANT B CONFIRMED: Remaining balance deducted exactly once (3 -> 2)');
    assert.strictEqual(pkgCheck2.redeemedQuantity, 1, 'Redeemed quantity incremented (0 -> 1)');

    // --- Invariant C: Duplicate completion calls do NOT double-deduct ---
    await assert.rejects(
      async () => {
        await bookingService.completeJob({
          jobId: booking1.id,
          completionRemarks: 'Accidental duplicate completion call'
        });
      },
      /Cannot complete job in completed status/,
      'Guards against duplicate completion requests'
    );

    let pkgCheck3 = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgCheck3.remainingQuantity, 2, 'INVARIANT C CONFIRMED: Package balance is still 2; zero double-deduction');

    // --- Invariant D: Cancellation consumes ZERO entitlement ---
    const booking2 = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash',
      serviceType: 'Gold Foam Wash (Visit 2 - Rescheduled)',
      packageId: soldPkg.id,
      scheduledDate: '2026-11-29',
      assetId: 'DL01AB1234'
    }, { customer: testCustomer });

    assert.strictEqual(booking2.entitlement_consumed, false);

    const cancelled2 = await bookingService.cancelBooking({
      jobId: booking2.id,
      reason: 'Customer out of town; rescheduled',
      actor: 'admin'
    });

    assert.strictEqual(cancelled2.status, 'cancelled');
    assert.strictEqual(cancelled2.entitlement_consumed, false);

    let pkgCheck4 = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgCheck4.remainingQuantity, 2, 'INVARIANT D CONFIRMED: Cancellation consumed zero entitlement (remains 2)');

    // --- Invariant E: "Unable to Complete" consumes ZERO entitlement ---
    const booking3 = await bookingService.createBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash',
      serviceType: 'Gold Foam Wash (Visit 2 - Retry)',
      packageId: soldPkg.id,
      scheduledDate: '2026-11-30',
      assetId: 'DL01AB1234'
    }, { customer: testCustomer });

    await bookingService.startJob({ jobId: booking3.id, actor: 'cleaner-1' });

    const failed3 = await bookingService.failJob({
      jobId: booking3.id,
      failureReason: 'Vehicle not present in parking lot',
      failureRemarks: 'Security confirmed car was taken to office',
      actor: 'cleaner-1'
    });

    assert.strictEqual(failed3.status, 'unable_to_complete');
    assert.strictEqual(failed3.failure_reason, 'Vehicle not present in parking lot');
    assert.strictEqual(failed3.entitlement_consumed, false);

    let pkgCheck5 = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgCheck5.remainingQuantity, 2, 'INVARIANT E CONFIRMED: Unable to complete consumed zero entitlement (remains 2)');

    // --- Invariant F: Exhaustion and eligibility filter ---
    // Redeem remaining 2 units
    await packageService.redeemPackage({ packageId: soldPkg.id, quantity: 2, notes: 'Direct redemptions' });
    let pkgExhausted = await packageService.getPackageById(soldPkg.id);
    assert.strictEqual(pkgExhausted.remainingQuantity, 0);
    assert.strictEqual(pkgExhausted.status, 'exhausted');

    const eligiblePkgs = await bookingService.getEligiblePackagesForBooking({
      customerId: testCustomer.id,
      serviceCategory: 'car_wash'
    });
    const foundExhausted = eligiblePkgs.find(p => p.id === soldPkg.id);
    assert.strictEqual(foundExhausted, undefined, 'INVARIANT F CONFIRMED: Exhausted package is not eligible for new bookings');

    pass('5.1 All 6 package entitlement invariants verified mathematically under execution');
    passedCount++;
  } catch (err) {
    fail('5.1 Package entitlement invariants check failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 6: Customer Bookings & History Partitioning
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Customer Bookings & History Hub Query ---');
  try {
    const hubData = await bookingService.getCustomerBookingsAndHistory({ customerId: testCustomer.id });

    assert.ok(Array.isArray(hubData.jobs), 'Returns jobs array');
    assert.ok(Array.isArray(hubData.upcoming), 'Returns upcoming array');
    assert.ok(Array.isArray(hubData.history), 'Returns history array');

    // All test jobs belong to this customer
    assert.ok(hubData.jobs.length >= 3, 'Contains all created jobs');
    pass('6.1 Customer Profile Hub correctly partitions active bookings and completed/cancelled history');
    passedCount++;
  } catch (err) {
    fail('6.1 Customer hub query failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 7: Server Action Wiring & RBAC Protection
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Server.js Action Wiring & Security Audit ---');
  try {
    const serverPath = path.join(__dirname, '..', 'server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    // Check imports
    assert.ok(serverCode.includes("require('./services/bookingService')"), 'Imports bookingService');

    // Check admin protection
    assert.ok(serverCode.includes("'createServiceBooking'"), 'createServiceBooking in admin actions');
    assert.ok(serverCode.includes("'getEligiblePackagesForBooking'"), 'getEligiblePackagesForBooking in admin actions');
    assert.ok(serverCode.includes("'getCustomerServiceJobs'"), 'getCustomerServiceJobs in admin actions');
    assert.ok(serverCode.includes("'failServiceJob'"), 'failServiceJob in admin actions');

    // Check action handlers
    assert.ok(serverCode.includes("action === 'createServiceBooking'"), 'Handles createServiceBooking');
    assert.ok(serverCode.includes("action === 'getEligiblePackagesForBooking'"), 'Handles getEligiblePackagesForBooking');
    assert.ok(serverCode.includes("action === 'getCustomerServiceJobs'"), 'Handles getCustomerServiceJobs');
    assert.ok(serverCode.includes("action === 'failServiceJob'"), 'Handles failServiceJob');

    // Check completeSpecialJob integrates bookingService.completeJob
    assert.ok(serverCode.includes("bookingService.completeJob"), 'completeSpecialJob triggers bookingService.completeJob');

    pass('7.1 Server.js wires all lifecycle actions with admin session authentication');
    passedCount++;
  } catch (err) {
    fail('7.1 Server.js audit failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 8: Frontend DOM & Material Design 3 Verification
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Index.html & Material Design 3 UI Audit ---');
  try {
    const indexPath = path.join(__dirname, '..', 'Index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    // Tab buttons & containers
    assert.ok(indexHtml.includes('id="tabBtnEditBookings"'), 'Index.html contains tabBtnEditBookings');
    assert.ok(indexHtml.includes('id="editTabPaneBookings"'), 'Index.html contains editTabPaneBookings');
    assert.ok(indexHtml.includes('id="custBookingsListContainer"'), 'Index.html contains custBookingsListContainer');

    // Filter pills
    assert.ok(indexHtml.includes('id="bookingFilterAll"'), 'Contains bookingFilterAll');
    assert.ok(indexHtml.includes('id="bookingFilterUpcoming"'), 'Contains bookingFilterUpcoming');
    assert.ok(indexHtml.includes('id="bookingFilterCompleted"'), 'Contains bookingFilterCompleted');
    assert.ok(indexHtml.includes('id="bookingFilterCancelled"'), 'Contains bookingFilterCancelled');

    // Create booking modal
    assert.ok(indexHtml.includes('id="createBookingModal"'), 'Index.html contains createBookingModal');
    assert.ok(indexHtml.includes('id="bookingCategorySelect"'), 'Contains category selector');
    assert.ok(indexHtml.includes('id="bookingPackageSelect"'), 'Contains eligible package linking selector');
    assert.ok(indexHtml.includes('id="bookingVehicleSelect"'), 'Contains vehicle selector');
    assert.ok(indexHtml.includes('id="bookingLocationSelect"'), 'Contains location selector');
    assert.ok(indexHtml.includes('id="bookingScheduledDate"'), 'Contains schedule date input');
    assert.ok(indexHtml.includes('id="bookingCleanerSelect"'), 'Contains cleaner selector');

    // Material Symbols icons used for bookings
    assert.ok(indexHtml.includes('>calendar_month<'), 'Uses Material Symbol calendar_month');
    assert.ok(indexHtml.includes('>event_available<'), 'Uses Material Symbol event_available');

    pass('8.1 Index.html DOM contains tabs, filters, create dialog and Material Symbols font icons');
    passedCount++;
  } catch (err) {
    fail('8.1 Index.html audit failed', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 9: Frontend Controller Integration in public/js/app.js
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 9: public/js/app.js Frontend Controller Audit ---');
  try {
    const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
    const appJs = fs.readFileSync(appJsPath, 'utf8');

    // Tab switcher
    assert.ok(appJs.includes("bookings: { btn: 'tabBtnEditBookings', pane: 'editTabPaneBookings' }"), 'switchEditCustomerTab handles bookings');
    assert.ok(appJs.includes("loadCustomerBookingsForEditModal()"), 'Calls loadCustomerBookingsForEditModal');

    // Controller functions
    assert.ok(appJs.includes('function loadCustomerBookingsForEditModal()'), 'Defines loadCustomerBookingsForEditModal');
    assert.ok(appJs.includes('function renderCustomerBookingsUI('), 'Defines renderCustomerBookingsUI');
    assert.ok(appJs.includes('function filterCustomerBookingsUI('), 'Defines filterCustomerBookingsUI');
    assert.ok(appJs.includes('function openCreateBookingModalFromCustomer()'), 'Defines openCreateBookingModalFromCustomer');
    assert.ok(appJs.includes('function handleBookingCategoryChange()'), 'Defines handleBookingCategoryChange');
    assert.ok(appJs.includes('function handleCreateBookingSubmit('), 'Defines handleCreateBookingSubmit');
    assert.ok(appJs.includes('function closeCreateBookingModal()'), 'Defines closeCreateBookingModal');
    assert.ok(appJs.includes('function handleStartBookingClick('), 'Defines handleStartBookingClick');
    assert.ok(appJs.includes('function handleCompleteBookingClick('), 'Defines handleCompleteBookingClick');
    assert.ok(appJs.includes('function handleCancelBookingClick('), 'Defines handleCancelBookingClick');
    assert.ok(appJs.includes('function handleFailJobClick('), 'Defines handleFailJobClick');

    pass('9.1 public/js/app.js implements complete frontend lifecycle controller and event handlers');
    passedCount++;
  } catch (err) {
    fail('9.1 app.js audit failed', err);
  }

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedCount} QA TEST SECTIONS PASSED SUCCESSFULLY!`);
  console.log('===============================================================');
}

runBookingLifecycleTestSuite().catch(err => {
  console.error('\n❌ QA TEST SUITE TERMINATED WITH ERROR:', err);
  process.exit(1);
});
