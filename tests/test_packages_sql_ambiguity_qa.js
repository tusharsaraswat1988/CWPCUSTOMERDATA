/**
 * Regression Test: Packages SQL Ambiguity Prevention (Task 01.10 P0-2)
 *
 * Verifies that findByCustomerId in packagesRepo qualifies all column references
 * with the table alias `cp.` to prevent PostgreSQL error:
 * "column reference 'customer_id' is ambiguous" (and deleted_at / status)
 * when joined with public.vehicles, public.service_locations, etc.
 */

const assert = require('assert');
const packagesRepo = require('../db/repositories/packagesRepo');

async function runAmbiguityTests() {
  console.log('--- Running Packages SQL Ambiguity Regression Tests ---');

  let executedQueries = [];

  // Mock runner that captures the generated SQL and parameters,
  // and asserts strict table qualification for customer_id, deleted_at, status
  const mockClient = {
    query: async (sql, params) => {
      executedQueries.push({ sql, params });

      // Simulate PostgreSQL Ambiguity Detector:
      // If customer_id, deleted_at, or status appears in WHERE without table alias, throw 500 error!
      const whereMatch = sql.match(/WHERE\s+([\s\S]+?)\s+ORDER BY/i);
      if (whereMatch) {
        const whereClause = whereMatch[1];
        
        // Check for ambiguous unqualified references
        const unqualifiedCustomerId = /(?<![a-zA-Z0-9_\.])customer_id\s*=/i.test(whereClause);
        const unqualifiedDeletedAt = /(?<![a-zA-Z0-9_\.])deleted_at\s+IS\s+NULL/i.test(whereClause);
        const unqualifiedStatus = /(?<![a-zA-Z0-9_\.])status\s*(=|!=)/i.test(whereClause);

        if (unqualifiedCustomerId) {
          throw new Error('error: column reference "customer_id" is ambiguous');
        }
        if (unqualifiedDeletedAt) {
          throw new Error('error: column reference "deleted_at" is ambiguous');
        }
        if (unqualifiedStatus) {
          throw new Error('error: column reference "status" is ambiguous');
        }
      }

      return {
        rows: [
          {
            id: 'pkg-1',
            package_name: 'Test Package',
            customer_id: params[0],
            registration_no: 'UP65 AB 1234',
            category_display_name: 'Car Washing'
          }
        ]
      };
    }
  };

  // Test 1: Default findByCustomerId
  executedQueries = [];
  const rows1 = await packagesRepo.findByCustomerId('cust-uuid-123', { client: mockClient });
  assert.strictEqual(rows1.length, 1);
  assert.strictEqual(rows1[0].customer_id, 'cust-uuid-123');
  assert.ok(executedQueries[0].sql.includes('cp.customer_id = $1'), 'Qualifies cp.customer_id');
  assert.ok(executedQueries[0].sql.includes('cp.deleted_at IS NULL'), 'Qualifies cp.deleted_at');
  console.log('✅ PASS: Default package query qualifies cp.customer_id and cp.deleted_at');

  // Test 2: Specific status filter
  executedQueries = [];
  await packagesRepo.findByCustomerId('cust-uuid-123', { status: 'active', client: mockClient });
  assert.ok(executedQueries[0].sql.includes('cp.status = $2'), 'Qualifies cp.status with alias');
  console.log('✅ PASS: Status filter qualifies cp.status');

  // Test 3: includeExhausted = false and includeCancelled = false
  executedQueries = [];
  await packagesRepo.findByCustomerId('cust-uuid-123', {
    includeExhausted: false,
    includeCancelled: false,
    client: mockClient
  });
  assert.ok(executedQueries[0].sql.includes("cp.status != 'exhausted'"), 'Qualifies cp.status != exhausted');
  assert.ok(executedQueries[0].sql.includes("cp.status != 'cancelled'"), 'Qualifies cp.status != cancelled');
  console.log('✅ PASS: Status inequality guards qualify cp.status != exhausted and cancelled');

  // Test 4: Regression proof — prove that the OLD unqualified query WOULD have thrown
  const oldSql = `
    SELECT cp.*, v.registration_no
    FROM public.customer_packages cp
    LEFT JOIN public.vehicles v ON cp.vehicle_id = v.id
    WHERE customer_id = $1 AND deleted_at IS NULL
    ORDER BY cp.created_at DESC
  `;
  let caughtOldError = false;
  try {
    await mockClient.query(oldSql, ['cust-uuid-123']);
  } catch (err) {
    caughtOldError = true;
    assert.ok(err.message.includes('ambiguous'), 'Old query correctly caught by ambiguity detector');
  }
  assert.ok(caughtOldError, 'Unqualified query is proven to fail with ambiguity error');
  console.log('✅ PASS: Regression proof verified — previous ambiguous query fails as expected');

  console.log('\n🎉 ALL P0-2 AMBIGUITY REGRESSION TESTS PASSED!');
}

runAmbiguityTests().catch(err => {
  console.error('❌ Ambiguity test failed:', err);
  process.exit(1);
});
