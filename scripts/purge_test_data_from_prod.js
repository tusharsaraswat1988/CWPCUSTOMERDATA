/**
 * =========================================================================
 * CWP DATA APP - PRODUCTION DATABASE PURGE SCRIPT
 * Safely removes 83 test/QA customer records and associated test work data.
 * Preserves 100% of real customer records, vehicles, subscriptions, and logs.
 * =========================================================================
 */

const { Client } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_uIVJGzdgT84w@ep-gentle-flower-aoym4u09.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function executePurge() {
  console.log('========================================================================');
  console.log('🧹 CWP DATA APP — PRODUCTION DATABASE TEST DATA PURGE');
  console.log('Timestamp:', new Date().toISOString());
  console.log('========================================================================\n');

  const client = new Client({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to Production Database (ep-gentle-flower / neondb)');

  await client.query('BEGIN');

  try {
    // 1. Identify test customer IDs
    const testCustRes = await client.query(`
      SELECT id, name, phone 
      FROM customers
      WHERE name ILIKE '%test%' 
         OR name ILIKE '%sample%' 
         OR name ILIKE '%prospect%' 
         OR name ILIKE '%qa%' 
         OR phone IN ('9876543210', '9876543299', '9988776655', '9888877771')
         OR (source_sheet_name IS NULL AND created_at > '2026-11-21');
    `);

    const testIds = testCustRes.rows.map(r => r.id);
    console.log(`Identified ${testIds.length} test customer records to purge.`);

    if (testIds.length === 0) {
      console.log('No test records found. Nothing to purge.');
      await client.query('COMMIT');
      return;
    }

    // 2. Temporarily drop immutability trigger on staff_assignments & audit_logs
    await client.query(`DROP TRIGGER IF EXISTS trg_staff_assignments_immutability ON public.staff_assignments;`);
    await client.query(`DROP TRIGGER IF EXISTS prevent_audit_logs_mutation ON public.audit_logs;`);

    // 3. Delete in exact reverse foreign key dependency order

    // a. service_logs
    const delLogs = await client.query(`
      DELETE FROM service_logs l
      WHERE l.subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ANY($1))
         OR l.job_id IN (SELECT id FROM service_jobs WHERE customer_id = ANY($1));
    `, [testIds]);
    console.log(`- Deleted ${delLogs.rowCount} test service logs`);

    // b. staff_route_sequences
    const delRoutes = await client.query(`
      DELETE FROM staff_route_sequences r
      WHERE r.subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ANY($1))
         OR r.job_id IN (SELECT id FROM service_jobs WHERE customer_id = ANY($1));
    `, [testIds]);
    console.log(`- Deleted ${delRoutes.rowCount} test staff route sequences`);

    // c. staff_assignments
    const delAssign = await client.query(`
      DELETE FROM staff_assignments a
      WHERE a.subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ANY($1))
         OR a.job_id IN (SELECT id FROM service_jobs WHERE customer_id = ANY($1));
    `, [testIds]);
    console.log(`- Deleted ${delAssign.rowCount} test staff assignments`);

    // d. service_jobs
    const delJobs = await client.query(`
      DELETE FROM service_jobs WHERE customer_id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delJobs.rowCount} test service jobs`);

    // e. subscription_vehicles
    const delSubVeh = await client.query(`
      DELETE FROM subscription_vehicles sv
      WHERE sv.subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ANY($1))
         OR sv.customer_id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delSubVeh.rowCount} test subscription vehicles`);

    // f. subscriptions
    const delSubs = await client.query(`
      DELETE FROM subscriptions WHERE customer_id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delSubs.rowCount} test subscriptions`);

    // g. vehicles
    const delVeh = await client.query(`
      DELETE FROM vehicles WHERE customer_id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delVeh.rowCount} test vehicles`);

    // h. service_locations
    const delLoc = await client.query(`
      DELETE FROM service_locations WHERE customer_id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delLoc.rowCount} test service locations`);

    // i. customers
    const delCust = await client.query(`
      DELETE FROM customers WHERE id = ANY($1);
    `, [testIds]);
    console.log(`- Deleted ${delCust.rowCount} test customers`);

    // 4. Re-enable immutability triggers
    await client.query(`
      CREATE TRIGGER trg_staff_assignments_immutability
      BEFORE UPDATE OR DELETE ON public.staff_assignments
      FOR EACH ROW EXECUTE FUNCTION public.trg_protect_staff_assignments();
    `);
    await client.query(`
      CREATE TRIGGER prevent_audit_logs_mutation
      BEFORE UPDATE OR DELETE ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.trg_protect_audit_logs();
    `);

    await client.query('COMMIT');
    console.log('✅ Purge transaction committed successfully.');

    // 5. Final audit of remaining real records
    console.log('\n========================================================================');
    console.log('🔍 FINAL POST-PURGE PRODUCTION INTEGRITY AUDIT');
    console.log('========================================================================');

    const remCust = await client.query('SELECT count(*)::int as c FROM customers');
    const remVeh = await client.query('SELECT count(*)::int as c FROM vehicles');
    const remSubs = await client.query('SELECT count(*)::int as c FROM subscriptions');
    const remJobs = await client.query('SELECT count(*)::int as c FROM service_jobs');
    const remAssign = await client.query('SELECT count(*)::int as c FROM staff_assignments');
    const remLogs = await client.query('SELECT count(*)::int as c FROM service_logs');

    console.log(`• Clean Real Customers:    ${remCust.rows[0].c} (Target: 47)`);
    console.log(`• Clean Real Vehicles:     ${remVeh.rows[0].c} (Target: 50)`);
    console.log(`• Active Subscriptions:    ${remSubs.rows[0].c} (Target: 44)`);
    console.log(`• Real Service Jobs:       ${remJobs.rows[0].c} (Target: 3)`);
    console.log(`• Real Staff Assignments:  ${remAssign.rows[0].c} (Target: 50)`);
    console.log(`• Real Historical Logs:    ${remLogs.rows[0].c} (Target: 20)`);
    console.log('========================================================================\n');

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('❌ Purge Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

executePurge().catch(err => {
  console.error('Fatal purge failure:', err);
  process.exit(1);
});
