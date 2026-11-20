/**
 * =========================================================================
 * CWP DATA APP - PHASE 1D COMPREHENSIVE AUTOMATED VERIFICATION SUITE
 * Tests all 15 tables, constraints, compound foreign keys, triggers, and rollback tests.
 * Zero test records are left in the database.
 * =========================================================================
 */

const { Pool, Client } = require('pg');
const http = require('http');

const EXPECTED_TABLES = [
  'admin_users',
  'audit_logs',
  'auth_sessions',
  'customers',
  'service_categories',
  'service_jobs',
  'service_locations',
  'service_logs',
  'staff',
  'staff_assignments',
  'staff_auth',
  'staff_route_sequences',
  'subscription_vehicles',
  'subscriptions',
  'vehicles'
].sort();

async function runVerification() {
  console.log('================================================================');
  console.log('PHASE 1D AUTOMATED SCHEMA VERIFICATION SUITE');
  console.log('Target Database: cwp_customer_db');
  console.log('================================================================\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const passedTests = [];
  const failedTests = [];

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  [PASS] ${testName} ${details}`);
      passedTests.push(testName);
    } else {
      console.error(`  [FAIL] ${testName} ${details}`);
      failedTests.push({ testName, details });
    }
  }

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Exact 15 Public Schema Tables
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Table Inventory & Count ---');
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const actualTables = tablesRes.rows.map(r => r.table_name).sort();
    assert(actualTables.length === 15, 'Exact 15 tables in public schema', `(Found: ${actualTables.length})`);
    assert(
      JSON.stringify(actualTables) === JSON.stringify(EXPECTED_TABLES),
      'All 15 expected table names match exactly',
      `\n    Actual: ${actualTables.join(', ')}`
    );

    // -----------------------------------------------------------------------
    // TEST 2: Primary Keys Verification
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 2: Primary Key Constraints ---');
    const pkRes = await pool.query(`
      SELECT tc.table_name, ccu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';
    `);
    const pkTables = new Set(pkRes.rows.map(r => r.table_name));
    assert(pkTables.size === 15, 'All 15 tables have primary keys defined', `(Found PKs on ${pkTables.size} tables)`);

    // -----------------------------------------------------------------------
    // TEST 3: Compound Foreign Keys & Composite Ownership
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 3: Compound Foreign Keys & Composite Ownership ---');
    const fkRes = await pool.query(`
      SELECT conname, conrelid::regclass::text as from_table, confrelid::regclass::text as to_table
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace;
    `);
    const fkNames = fkRes.rows.map(r => r.conname);

    assert(fkNames.includes('fk_veh_location_same_customer'), 'vehicles has fk_veh_location_same_customer compound FK');
    assert(fkNames.includes('fk_sub_veh_sub_cust'), 'subscription_vehicles has fk_sub_veh_sub_cust compound FK');
    assert(fkNames.includes('fk_sub_veh_veh_cust'), 'subscription_vehicles has fk_sub_veh_veh_cust compound FK');
    assert(fkNames.includes('fk_sub_veh_loc_cust'), 'subscription_vehicles has fk_sub_veh_loc_cust compound FK');

    // -----------------------------------------------------------------------
    // TEST 4: Unique & Partial Unique Constraints
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 4: Unique Constraints & Indexes ---');
    const idxRes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);
    const indexNames = idxRes.rows.map(r => r.indexname);

    assert(indexNames.includes('uq_staff_phone'), 'staff has partial unique index uq_staff_phone');
    assert(indexNames.includes('uq_active_sub_assignment'), 'staff_assignments has partial unique index uq_active_sub_assignment');
    assert(indexNames.includes('uq_active_job_assignment'), 'staff_assignments has partial unique index uq_active_job_assignment');
    assert(indexNames.includes('uq_route_sub_veh_stop'), 'staff_route_sequences has partial unique index uq_route_sub_veh_stop');
    assert(indexNames.includes('uq_route_job_stop'), 'staff_route_sequences has partial unique index uq_route_job_stop');
    assert(indexNames.includes('uq_service_logs_daily_vehicle'), 'service_logs has partial unique index uq_service_logs_daily_vehicle');
    assert(indexNames.includes('uq_service_logs_job_once'), 'service_logs has partial unique index uq_service_logs_job_once');

    // -----------------------------------------------------------------------
    // TEST 5: CHECK Constraints
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 5: CHECK Constraints ---');
    const chkRes = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE contype = 'c' AND connamespace = 'public'::regnamespace;
    `);
    const chkNames = chkRes.rows.map(r => r.conname);

    assert(chkNames.includes('chk_customer_active_deleted'), 'customers has chk_customer_active_deleted constraint');
    assert(chkNames.includes('chk_job_target'), 'service_jobs has chk_job_target constraint');
    assert(chkNames.includes('chk_assign_target'), 'staff_assignments has chk_assign_target constraint');
    assert(chkNames.includes('chk_route_stop_target'), 'staff_route_sequences has chk_route_stop_target constraint');
    assert(chkNames.includes('chk_service_date_ist_match'), 'service_logs has chk_service_date_ist_match constraint');

    // -----------------------------------------------------------------------
    // TEST 6: Triggers & Dynamic Behavioral Validation (Rollback Transaction)
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 6: Behavioral Trigger & Constraint Verification (Rollback Test) ---');
    const testClient = new Client({
      connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');

      // 6.1 Test Audit Log Immutability Trigger
      const auditRes = await testClient.query(`
        INSERT INTO public.audit_logs (entity_type, entity_id, action, changed_by, after_state)
        VALUES ('test_entity', 'test_1', 'create', 'test_runner', '{"k":"v"}'::jsonb)
        RETURNING id;
      `);
      const testAuditId = auditRes.rows[0].id;

      await testClient.query('SAVEPOINT sp1;');
      let auditUpdateBlocked = false;
      try {
        await testClient.query(`UPDATE public.audit_logs SET action = 'tampered' WHERE id = $1`, [testAuditId]);
      } catch (e) {
        auditUpdateBlocked = e.message.includes('Security Violation: audit_logs entries are immutable');
      } finally {
        await testClient.query('ROLLBACK TO sp1;');
      }
      assert(auditUpdateBlocked, 'audit_logs update is blocked by trigger');

      await testClient.query('SAVEPOINT sp2;');
      let auditDeleteBlocked = false;
      try {
        await testClient.query(`DELETE FROM public.audit_logs WHERE id = $1`, [testAuditId]);
      } catch (e) {
        auditDeleteBlocked = e.message.includes('Security Violation: audit_logs entries are immutable');
      } finally {
        await testClient.query('ROLLBACK TO sp2;');
      }
      assert(auditDeleteBlocked, 'audit_logs delete is blocked by trigger');

      // 6.2 Test Compound Location Ownership Violation
      const cust1 = (await testClient.query(`
        INSERT INTO public.customers (customer_code, name, phone, source_sheet_name, source_row_index)
        VALUES ('TEST_C1', 'Customer One', '9000000001', 'Daily Clean', 1001) RETURNING id;
      `)).rows[0].id;

      const cust2 = (await testClient.query(`
        INSERT INTO public.customers (customer_code, name, phone, source_sheet_name, source_row_index)
        VALUES ('TEST_C2', 'Customer Two', '9000000002', 'Daily Clean', 1002) RETURNING id;
      `)).rows[0].id;

      const loc2 = (await testClient.query(`
        INSERT INTO public.service_locations (customer_id, address_text)
        VALUES ($1, 'Location for Customer 2') RETURNING id;
      `, [cust2])).rows[0].id;

      await testClient.query('SAVEPOINT sp3;');
      let crossCustomerLocBlocked = false;
      try {
        // Try assigning Customer 2's location to Customer 1's vehicle
        await testClient.query(`
          INSERT INTO public.vehicles (customer_id, default_location_id, registration_no)
          VALUES ($1, $2, 'UP65TEST01');
        `, [cust1, loc2]);
      } catch (e) {
        crossCustomerLocBlocked = e.message.includes('violates foreign key constraint');
      } finally {
        await testClient.query('ROLLBACK TO sp3;');
      }
      assert(crossCustomerLocBlocked, 'Cross-customer vehicle location assignment is rejected by compound FK');

      // 6.3 Test Staff Assignment Immutability Trigger
      const staff1 = (await testClient.query(`
        INSERT INTO public.staff (staff_code, name, phone)
        VALUES ('STF_TEST', 'Test Staff', '9000000003') RETURNING id;
      `)).rows[0].id;

      const sub1 = (await testClient.query(`
        INSERT INTO public.subscriptions (customer_id, package_name)
        VALUES ($1, 'Daily Clean Test') RETURNING id;
      `, [cust1])).rows[0].id;

      const assign1 = (await testClient.query(`
        INSERT INTO public.staff_assignments (staff_id, subscription_id, assigned_by)
        VALUES ($1, $2, 'admin_test') RETURNING id;
      `, [staff1, sub1])).rows[0].id;

      await testClient.query('SAVEPOINT sp4;');
      let assignDeleteBlocked = false;
      try {
        await testClient.query(`DELETE FROM public.staff_assignments WHERE id = $1`, [assign1]);
      } catch (e) {
        assignDeleteBlocked = e.message.includes('Security Violation: staff_assignments history is immutable');
      } finally {
        await testClient.query('ROLLBACK TO sp4;');
      }
      assert(assignDeleteBlocked, 'staff_assignments deletion is blocked by trigger');

      await testClient.query('SAVEPOINT sp5;');
      let assignProvenanceBlocked = false;
      try {
        // Try changing staff_id on existing assignment
        const staff2 = (await testClient.query(`
          INSERT INTO public.staff (staff_code, name, phone)
          VALUES ('STF_TEST2', 'Test Staff 2', '9000000004') RETURNING id;
        `)).rows[0].id;
        await testClient.query(`UPDATE public.staff_assignments SET staff_id = $1 WHERE id = $2`, [staff2, assign1]);
      } catch (e) {
        assignProvenanceBlocked = e.message.includes('Security Violation: Assignment identity and provenance fields are strictly immutable');
      } finally {
        await testClient.query('ROLLBACK TO sp5;');
      }
      assert(assignProvenanceBlocked, 'staff_assignments provenance update is blocked by trigger');

      // Legitimate deactivation
      await testClient.query(`
        UPDATE public.staff_assignments 
        SET is_active = FALSE, unassigned_at = CURRENT_TIMESTAMP, unassigned_by = 'admin_test', reassignment_reason = 'Testing'
        WHERE id = $1;
      `, [assign1]);

      await testClient.query('SAVEPOINT sp6;');
      let reactivationBlocked = false;
      try {
        // Try reactivating deactivated assignment
        await testClient.query(`UPDATE public.staff_assignments SET is_active = TRUE WHERE id = $1`, [assign1]);
      } catch (e) {
        reactivationBlocked = e.message.includes('Reactivating a deactivated assignment is prohibited');
      } finally {
        await testClient.query('ROLLBACK TO sp6;');
      }
      assert(reactivationBlocked, 'Reactivating a deactivated staff assignment is blocked by trigger');

      // 6.4 Test IST Service Date Validation Check
      const veh1 = (await testClient.query(`
        INSERT INTO public.vehicles (customer_id, registration_no)
        VALUES ($1, 'UP65TEST02') RETURNING id;
      `, [cust1])).rows[0].id;

      await testClient.query('SAVEPOINT sp7;');
      let istDateMismatchBlocked = false;
      try {
        // Completed at device: 2026-11-21 07:00:00+05:30 (date is 2026-11-21)
        // Deliberately pass wrong service_date: 2026-11-20
        await testClient.query(`
          INSERT INTO public.service_logs (
            client_mutation_id, staff_id, subscription_id, vehicle_id, 
            service_date, completed_at_device
          ) VALUES (
            gen_random_uuid(), $1, $2, $3,
            '2026-11-20', '2026-11-21 07:00:00+05:30'
          );
        `, [staff1, sub1, veh1]);
      } catch (e) {
        istDateMismatchBlocked = e.message.includes('violates check constraint "chk_service_date_ist_match"');
      } finally {
        await testClient.query('ROLLBACK TO sp7;');
      }
      assert(istDateMismatchBlocked, 'service_logs rejects service_date that contradicts completed_at_device in Asia/Kolkata');

    } finally {
      // ROLLBACK test transaction completely
      await testClient.query('ROLLBACK;');
      await testClient.end();
      console.log('  [ROLLBACK]: Test transaction cleanly rolled back. Zero test records retained.');
    }

    // -----------------------------------------------------------------------
    // TEST 7: Business Data Count Verification
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 7: Business Data Cleanliness ---');
    const custCount = (await pool.query('SELECT count(*)::int as c FROM public.customers')).rows[0].c;
    const vehCount = (await pool.query('SELECT count(*)::int as c FROM public.vehicles')).rows[0].c;
    const staffCount = (await pool.query('SELECT count(*)::int as c FROM public.staff')).rows[0].c;
    const subCount = (await pool.query('SELECT count(*)::int as c FROM public.subscriptions')).rows[0].c;
    const jobCount = (await pool.query('SELECT count(*)::int as c FROM public.service_jobs')).rows[0].c;
    const logCount = (await pool.query('SELECT count(*)::int as c FROM public.service_logs')).rows[0].c;
    const catCount = (await pool.query('SELECT count(*)::int as c FROM public.service_categories')).rows[0].c;

    assert(custCount === 51, `customers table has 51 records (Found: ${custCount})`);
    assert(vehCount >= 51, `vehicles table has valid records (Found: ${vehCount})`);
    assert(staffCount >= 2, `staff table has active staff (Found: ${staffCount})`);
    assert(subCount + jobCount === 51, `subscriptions + jobs equal total customers (Found: ${subCount + jobCount})`);
    assert(catCount === 3, 'service_categories has exactly 3 domain reference slugs');

    // -----------------------------------------------------------------------
    // TEST 8: Migration Metadata Check
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 8: Migration Metadata Verification ---');
    const migRes = await pool.query('SELECT * FROM meta.schema_migrations');
    assert(migRes.rows.length === 1, 'meta.schema_migrations contains exactly 1 applied migration record');
    assert(migRes.rows[0].version === '001', 'Applied migration version is 001');

    // -----------------------------------------------------------------------
    // TEST 9: Preserved Database Safety Check
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 9: Preserved neondb Safety Check ---');
    const oldPooledUrl = process.env.DATABASE_URL.replace('/cwp_customer_db', '/neondb');
    const oldPool = new Pool({ connectionString: oldPooledUrl, ssl: { rejectUnauthorized: false } });
    const oldRes = await oldPool.query("SELECT count(*)::int as c FROM information_schema.tables WHERE table_schema = 'public'");
    assert(oldRes.rows[0].c === 132, 'neondb remains 100% preserved with 132 tables');
    await oldPool.end();

    // -----------------------------------------------------------------------
    // TEST 10: Local Application Running on Google Sheets
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 10: Local Web App (localhost:3000) Health ---');
    const healthOk = await new Promise((resolve) => {
      http.get('http://localhost:3000/health', (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            resolve(j.status === 'ok');
          } catch(e) { resolve(false); }
        });
      }).on('error', () => resolve(false));
    });
    assert(healthOk, 'localhost:3000 is running and responding 200 OK');

    console.log('\n================================================================');
    console.log(`VERIFICATION SUMMARY: ${passedTests.length} PASSED, ${failedTests.length} FAILED`);
    console.log('================================================================');

    if (failedTests.length > 0) {
      process.exit(1);
    }

  } catch (err) {
    console.error('Fatal Verification Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runVerification().catch(e => {
  console.error(e);
  process.exit(1);
});
