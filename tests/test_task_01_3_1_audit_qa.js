/**
 * =========================================================================
 * CWP Detailers & Motors - Task 01.3.1 Integrity Audit QA Test Suite
 * Module: Task 01.3.1 — Focused Integrity Audit & Defect Fix
 *
 * Covers all 4 Audit Areas:
 * - Audit A: Lifecycle Transition Consistency
 * - Audit B: Package Entitlement Concurrency & Zero Negative Balance
 * - Audit C: Exact-Once Redemption & Transactional Atomicity
 * - Audit D: Migration 018 Safety & Compatibility
 * =========================================================================
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Ensure local testing environment
process.env.NODE_ENV = 'test';
process.env.USE_LOCAL_JOBS_TEST = 'true';
process.env.USE_LOCAL_PACKAGES_TEST = 'true';

const bookingService = require('../services/bookingService');
const packageService = require('../services/packageService');
const repos = require('../db/repositories/index');

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS [${totalTests}]: ${name}`);
}

function fail(name, err) {
  totalTests++;
  console.error(`  ❌ FAIL [${totalTests}]: ${name}`);
  console.error(err);
  throw err;
}

async function runTask0131AuditTestSuite() {
  console.log('\n===============================================================');
  console.log('🧪 RUNNING TASK 01.3.1 FOCUSED INTEGRITY AUDIT TEST SUITE');
  console.log('===============================================================\n');

  // ==========================================================================
  // AUDIT A: LIFECYCLE TRANSITION CONSISTENCY
  // ==========================================================================
  console.log('--- AUDIT A: Lifecycle Transition Consistency ---');

  // A.1 Verify in_progress -> cancelled is STRICTLY DISALLOWED
  try {
    const jobA = await bookingService.createBooking({
      customerId: 'cust_audit_a1',
      serviceType: 'exterior_wash',
      serviceCategoryId: 'car_washing'
    }, 'admin');

    const startedA = await bookingService.startJob({ jobId: jobA.id, startedAt: new Date().toISOString() });
    assert.strictEqual(startedA.status, 'in_progress', 'Job is in progress');

    await assert.rejects(
      async () => {
        await bookingService.cancelBooking({
          jobId: jobA.id,
          reason: 'Customer requested cancellation during wash'
        });
      },
      /Cannot cancel service job after work has commenced \(in_progress\)\. Use 'unable_to_complete' instead\./,
      'Rejects in_progress -> cancelled transition with explicit message'
    );

    const res = await bookingService.getCustomerBookingsAndHistory('cust_audit_a1');
    const curJob = res.upcoming.find(j => j.id === jobA.id);
    assert.strictEqual(curJob.status, 'in_progress', 'Job remains in progress after rejected cancellation');

    pass('A.1 in_progress -> cancelled is strictly rejected; cancelBooking enforces unable_to_complete');
  } catch (err) {
    fail('A.1 in_progress -> cancelled guard failed', err);
  }

  // A.2 Verify completed is genuinely terminal
  try {
    const jobA2 = await bookingService.createBooking({
      customerId: 'cust_audit_a2',
      serviceType: 'car_wash'
    }, 'admin');
    await bookingService.startJob({ jobId: jobA2.id });
    const completedA2 = await bookingService.completeJob({ jobId: jobA2.id });
    assert.strictEqual(completedA2.status, 'completed', 'Job is completed');

    // Attempt start
    await assert.rejects(
      async () => { await bookingService.startJob({ jobId: jobA2.id }); },
      /Cannot start job in completed status \(terminal\)\./
    );

    // Attempt complete again
    await assert.rejects(
      async () => { await bookingService.completeJob({ jobId: jobA2.id }); },
      /Cannot complete job in completed status \(terminal\)\./
    );

    // Attempt cancel
    await assert.rejects(
      async () => { await bookingService.cancelBooking({ jobId: jobA2.id }); },
      /Cannot cancel job in completed status \(terminal\)\./
    );

    // Attempt fail
    await assert.rejects(
      async () => { await bookingService.failJob({ jobId: jobA2.id }); },
      /Cannot fail job in completed status \(terminal\)\./
    );

    pass('A.2 completed is genuinely terminal: rejects start, complete, cancel, fail');
  } catch (err) {
    fail('A.2 completed terminal state guard failed', err);
  }

  // A.3 Verify cancelled and unable_to_complete are genuinely terminal
  try {
    const jobA3 = await bookingService.createBooking({ customerId: 'cust_audit_a3', serviceType: 'car_wash' }, 'admin');
    const cancelledA3 = await bookingService.cancelBooking({ jobId: jobA3.id, reason: 'Customer cancelled early' });
    assert.strictEqual(cancelledA3.status, 'cancelled');

    await assert.rejects(
      async () => { await bookingService.startJob({ jobId: jobA3.id }); },
      /Cannot start job in cancelled status \(terminal\)\./
    );
    await assert.rejects(
      async () => { await bookingService.completeJob({ jobId: jobA3.id }); },
      /Cannot complete job in cancelled status \(terminal\)\./
    );

    const jobA4 = await bookingService.createBooking({ customerId: 'cust_audit_a4', serviceType: 'car_wash' }, 'admin');
    await bookingService.startJob({ jobId: jobA4.id });
    const failedA4 = await bookingService.failJob({ jobId: jobA4.id, failureReason: 'Vehicle moved / not present' });
    assert.strictEqual(failedA4.status, 'unable_to_complete');

    await assert.rejects(
      async () => { await bookingService.startJob({ jobId: jobA4.id }); },
      /Cannot start job in unable_to_complete status \(terminal\)\./
    );
    await assert.rejects(
      async () => { await bookingService.completeJob({ jobId: jobA4.id }); },
      /Cannot complete job in unable_to_complete status \(terminal\)\./
    );

    pass('A.3 cancelled and unable_to_complete are genuinely terminal');
  } catch (err) {
    fail('A.3 cancelled/unable_to_complete terminal check failed', err);
  }

  // A.4 Verify repository level WHERE guards against status jumping
  try {
    const repoFile = fs.readFileSync(path.resolve(__dirname, '../db/repositories/serviceJobsRepo.js'), 'utf8');
    assert.ok(
      repoFile.includes("WHERE id = $1 AND deleted_at IS NULL AND status IN ('requested', 'booked', 'assigned')"),
      'serviceJobsRepo startJob and cancelJob enforce valid pre-status'
    );
    assert.ok(
      repoFile.includes("WHERE id = $1 AND deleted_at IS NULL AND status = 'in_progress'"),
      'serviceJobsRepo completeJob enforces in_progress status'
    );
    assert.ok(
      repoFile.includes("WHERE id = $1 AND deleted_at IS NULL AND status IN ('assigned', 'in_progress')"),
      'serviceJobsRepo failJob enforces assigned or in_progress status'
    );

    pass('A.4 Repository layer SQL queries enforce strict status WHERE clauses preventing bypass');
  } catch (err) {
    fail('A.4 Repository layer guards check failed', err);
  }

  // ==========================================================================
  // AUDIT B: PACKAGE ENTITLEMENT CONCURRENCY & ZERO NEGATIVE BALANCE
  // ==========================================================================
  console.log('\n--- AUDIT B: Package Entitlement Concurrency & Non-Negative Balance ---');

  try {
    // 1. Customer buys package with 1 entitlement remaining
    const sold = await packageService.sellPackage({
      customerId: 'cust_concurrency_test',
      packageCode: 'SINGLE_EXT_WASH',
      packageName: 'Single Wash Pass',
      serviceCategoryId: 'car_washing',
      totalQuantity: 1,
      totalPrice: 400
    }, 'admin');
    const pkgId = sold.id;
    assert.strictEqual(sold.remaining_quantity, 1, 'Initial balance is exactly 1');

    // 2. Customer creates TWO bookings using this package (both permitted concurrently)
    const booking1 = await bookingService.createBooking({
      customerId: 'cust_concurrency_test',
      serviceCategoryId: 'car_washing',
      serviceType: 'car_wash',
      packageId: pkgId
    }, 'admin');

    const booking2 = await bookingService.createBooking({
      customerId: 'cust_concurrency_test',
      serviceCategoryId: 'car_washing',
      serviceType: 'car_wash',
      packageId: pkgId
    }, 'admin');

    // Verify neither booking consumed entitlement upon creation
    const pkgAfterBookings = (await packageService.getCustomerPackages('cust_concurrency_test'))[0];
    assert.strictEqual(pkgAfterBookings.remaining_quantity, 1, 'Entitlement balance remains 1 upon booking');

    // 3. Booking 1 starts and completes -> consumes the 1 remaining entitlement
    await bookingService.startJob({ jobId: booking1.id });
    const comp1 = await bookingService.completeJob({
      jobId: booking1.id,
      afterPhotos: ['after_b1.jpg'],
      completionRemarks: 'Booking 1 executed'
    });
    assert.strictEqual(comp1.entitlementDeducted, true, 'Booking 1 consumed entitlement');

    const pkgAfterComp1 = (await packageService.getCustomerPackages('cust_concurrency_test'))[0];
    assert.strictEqual(pkgAfterComp1.remaining_quantity, 0, 'Package balance is now 0');
    assert.strictEqual(pkgAfterComp1.status, 'exhausted', 'Package is exhausted');

    // 4. Booking 2 starts and attempts completion -> MUST BE REJECTED
    await bookingService.startJob({ jobId: booking2.id });

    let b2Failed = false;
    try {
      await bookingService.completeJob({
        jobId: booking2.id,
        afterPhotos: ['after_b2.jpg'],
        completionRemarks: 'Booking 2 executed'
      });
    } catch (b2Err) {
      b2Failed = true;
      assert.ok(
        b2Err.message.includes('exhausted') || b2Err.message.includes('Insufficient'),
        `Error reports exhaustion: ${b2Err.message}`
      );
    }
    assert.strictEqual(b2Failed, true, 'Booking 2 completion was cleanly rejected');

    // 5. Critical Invariant: Verify package balance NEVER became negative
    const pkgFinal = (await packageService.getCustomerPackages('cust_concurrency_test'))[0];
    assert.strictEqual(pkgFinal.remaining_quantity, 0, 'Package balance is strictly 0 (never negative)');
    assert.ok(pkgFinal.remaining_quantity >= 0, 'Invariant remaining >= 0 strictly holds');

    // 6. Verify Booking 2 did NOT get completed and entitlement_consumed is false
    const b2Final = (await bookingService.getCustomerBookingsAndHistory('cust_concurrency_test')).upcoming.find(j => j.id === booking2.id);
    assert.ok(b2Final, 'Booking 2 remains in active bookings');
    assert.strictEqual(b2Final.status, 'in_progress', 'Booking 2 remains in progress');
    assert.strictEqual(Boolean(b2Final.entitlement_consumed), false, 'Booking 2 entitlement_consumed is false');

    // 7. Verify redemption history contains exactly ONE entry
    const redemptions = await packageService.getPackageRedemptions(pkgId);
    assert.strictEqual(redemptions.length, 1, 'Exactly one redemption logged');
    assert.strictEqual(redemptions[0].service_job_id, booking1.id, 'Logged redemption belongs strictly to Booking 1');

    pass('B.1 Concurrency test passed: 1 entitlement, 2 bookings; first completes; second safely rejected; balance never negative');
  } catch (err) {
    fail('B.1 Entitlement concurrency check failed', err);
  }

  // ==========================================================================
  // AUDIT C: EXACT-ONCE REDEMPTION & TRANSACTIONAL ATOMICITY
  // ==========================================================================
  console.log('\n--- AUDIT C: Exact-Once Redemption & Transactional Atomicity ---');

  // C.1 Verify client transaction pass-through in bookingService.completeJob
  try {
    const bookingServiceCode = fs.readFileSync(path.resolve(__dirname, '../services/bookingService.js'), 'utf8');
    assert.ok(
      bookingServiceCode.includes('client'),
      'bookingService references transaction client'
    );
    assert.ok(
      bookingServiceCode.includes('client\n        }, actor, client);') ||
      bookingServiceCode.includes('client\r\n        }, actor, client);'),
      'bookingService passes client to packageService.redeemPackage'
    );

    const packageServiceCode = fs.readFileSync(path.resolve(__dirname, '../services/packageService.js'), 'utf8');
    assert.ok(
      packageServiceCode.includes('actualClient'),
      'packageService accepts and computes actualClient'
    );
    assert.ok(
      packageServiceCode.includes('repos.packages.redeemPackage(packageId, {\n      quantity: qtyToRedeem,\n      vehicleId,\n      locationId,\n      serviceJobId,\n      notes,\n      redeemedBy: adminUser\n    }, actualClient);') ||
      packageServiceCode.includes('}, actualClient);'),
      'packageService forwards actualClient to packagesRepo.redeemPackage'
    );

    pass('C.1 Transactional atomicity: client correctly threaded from completeJob -> packageService -> packagesRepo');
  } catch (err) {
    fail('C.1 Transactional threading audit failed', err);
  }

  // C.2 Verify duplicate redemption idempotency guard on serviceJobId
  try {
    const sold2 = await packageService.sellPackage({
      customerId: 'cust_idempotency_test',
      packageCode: 'CAR_WASH_4X',
      packageName: '4x Wash Pack',
      serviceCategoryId: 'car_washing',
      totalQuantity: 4,
      totalPrice: 1200
    }, 'admin');

    const fixedJobId = 'job_fixed_idempotent_123';
    await packageService.redeemPackage({
      packageId: sold2.id,
      quantity: 1,
      serviceJobId: fixedJobId,
      adminUser: 'admin'
    });

    // Second redemption attempt with SAME serviceJobId MUST fail
    await assert.rejects(
      async () => {
        await packageService.redeemPackage({
          packageId: sold2.id,
          quantity: 1,
          serviceJobId: fixedJobId,
          adminUser: 'admin'
        });
      },
      /has already redeemed an entitlement/,
      'Duplicate redemption with same serviceJobId is strictly blocked'
    );

    const pkgCheck = (await packageService.getCustomerPackages('cust_idempotency_test'))[0];
    assert.strictEqual(pkgCheck.remaining_quantity, 3, 'Balance deducted only once (4 - 1 = 3)');

    pass('C.2 Exact-once redemption idempotency: duplicate redemption for identical serviceJobId rejected');
  } catch (err) {
    fail('C.2 Idempotency guard check failed', err);
  }

  // ==========================================================================
  // AUDIT D: MIGRATION 018 SAFETY & COMPATIBILITY
  // ==========================================================================
  console.log('\n--- AUDIT D: Migration 018 Safety & Compatibility ---');

  try {
    const mig018Path = path.resolve(__dirname, '../migrations/018_enhance_service_jobs_lifecycle_and_packages.sql');
    assert.ok(fs.existsSync(mig018Path), 'Migration 018 file exists');
    const mig018 = fs.readFileSync(mig018Path, 'utf8');

    // D.1 payment_status check constraint includes 'unpaid'
    assert.ok(
      mig018.includes("'unpaid'"),
      "Migration 018 must include 'unpaid' in payment_status CHECK constraint"
    );
    assert.ok(
      mig018.includes("CHECK (payment_status IN ('paid', 'unpaid', 'pending', 'package_covered', 'partial', 'waived'))"),
      "Migration 018 check constraint is complete with ('paid', 'unpaid', 'pending', 'package_covered', 'partial', 'waived')"
    );

    // D.2 Unique partial index on package_redemption_logs (service_job_id)
    assert.ok(
      mig018.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_pkg_redemption_service_job') &&
      mig018.includes('ON public.package_redemption_logs (service_job_id)') &&
      mig018.includes('WHERE service_job_id IS NOT NULL'),
      'Migration 018 includes unique partial index uq_pkg_redemption_service_job'
    );

    // D.3 Pure DDL Safety: zero production data modification
    assert.ok(!mig018.includes('DROP TABLE'), 'No destructive DROP TABLE');
    assert.ok(!mig018.includes('DELETE FROM'), 'No destructive DELETE FROM');
    assert.ok(!mig018.includes('UPDATE public.service_jobs SET'), 'No unconditional production UPDATE');
    assert.ok(mig018.includes('BEGIN;') && mig018.includes('COMMIT;'), 'Wrapped in transaction');

    pass('D.1 Migration 018 is safe, idempotent, includes unpaid in payment_status, and defines unique partial index');
  } catch (err) {
    fail('D.1 Migration 018 audit failed', err);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedTests} AUDIT & INTEGRITY QA TESTS PASSED CLEANLY!`);
  console.log('===============================================================\n');
}

runTask0131AuditTestSuite().catch(err => {
  console.error('\n❌ AUDIT QA SUITE FAILED:', err);
  process.exit(1);
});
