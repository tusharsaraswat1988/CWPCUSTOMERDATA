/**
 * =========================================================================
 * CWP DATA APP - PHASE 1G DATABASE INTEGRITY VERIFICATION SUITE
 * Database: Neon PostgreSQL cwp_customer_db
 * Safety: Read-only verification of cwp_customer_db and neondb
 * Architecture Spec: docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const db = require('../db/index');

const EXPECTED_PUBLIC_TABLES = [
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

const DOMAIN_SERVICE_CATEGORIES = [
  'daily_car_cleaning',
  'car_washing',
  'solar_cleaning'
];

async function runIntegrityChecks() {
  console.log('================================================================');
  console.log('PHASE 1G DATABASE INTEGRITY & ORPHAN AUDIT SUITE');
  console.log('Target Database: cwp_customer_db');
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  [PASS] ${message} ${details}`);
      passCount++;
      return true;
    } else {
      console.error(`  [FAIL] ${message} ${details}`);
      failCount++;
      return false;
    }
  }

  const results = {
    timestamp: new Date().toISOString(),
    tableCounts: {},
    serviceCategories: [],
    migrationRecords: 0,
    orphanedRecords: {
      totalOrphans: 0,
      orphanedVehicles: 0,
      orphanedServiceLocations: 0,
      orphanedSubscriptionVehicles: 0,
      orphanedStaffAssignments: 0,
      serviceLogsIstMismatch: 0,
      details: {
        vehicles: [],
        serviceLocations: [],
        subscriptionVehicles: [],
        staffAssignments: [],
        serviceLogsIstMismatch: []
      }
    },
    neondbTableCount: 0,
    overallStatus: 'PASS',
    schemaVerification: {},
    activeBusinessRecords: {},
    defectsAndNotes: []
  };

  try {
    // 1. Health & Target DB Verification
    console.log('--- 1. Health & Connection Check ---');
    const health = await db.healthCheck();
    assert(health.healthy, 'Database is healthy and reachable');
    assert(health.database === 'cwp_customer_db', `Connected to exact database 'cwp_customer_db' (got: ${health.database})`);

    // 2. Schema and Table Inventory
    console.log('\n--- 2. Public & Meta Schema Table Inventory ---');
    const pubTablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const actualPublicTables = pubTablesRes.rows.map(r => r.table_name).sort();
    assert(
      actualPublicTables.length === 15,
      `Exact 15 tables exist in public schema (Found: ${actualPublicTables.length})`
    );
    const pubMismatch = JSON.stringify(actualPublicTables) === JSON.stringify(EXPECTED_PUBLIC_TABLES);
    assert(pubMismatch, 'All 15 expected public table names match exactly');

    const metaTablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'meta' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const actualMetaTables = metaTablesRes.rows.map(r => r.table_name);
    assert(
      actualMetaTables.includes('schema_migrations'),
      "meta schema contains 'schema_migrations' table"
    );

    results.schemaVerification = {
      publicTableCount: actualPublicTables.length,
      publicTables: actualPublicTables,
      metaTables: actualMetaTables
    };

    // 3. Row Counts Across All Application Tables
    console.log('\n--- 3. Row Counts Across All Application Tables ---');
    const allTablesToCount = [
      'customers',
      'vehicles',
      'service_locations',
      'service_categories',
      'subscriptions',
      'subscription_vehicles',
      'staff',
      'staff_auth',
      'auth_sessions',
      'staff_assignments',
      'staff_route_sequences',
      'service_jobs',
      'service_logs',
      'admin_users',
      'audit_logs',
      'meta.schema_migrations'
    ];

    for (const t of allTablesToCount) {
      const q = t.includes('.') ? `SELECT count(*)::int as c FROM ${t}` : `SELECT count(*)::int as c FROM public."${t}"`;
      const res = await db.query(q);
      const count = res.rows[0].c;
      results.tableCounts[t] = count;
      console.log(`  Table: ${t.padEnd(26)} -> ${count} rows`);
    }

    // 4. Verify Service Categories Reference Data
    console.log('\n--- 4. Service Categories Reference Integrity ---');
    const catRes = await db.query(`SELECT id, display_name, is_active FROM service_categories ORDER BY id;`);
    const actualSlugs = catRes.rows.map(r => r.id);
    results.serviceCategories = DOMAIN_SERVICE_CATEGORIES;
    assert(
      catRes.rows.length === 3,
      `Exactly 3 rows exist in service_categories (Found: ${catRes.rows.length})`
    );
    const sortedActual = [...actualSlugs].sort();
    const sortedExpected = [...DOMAIN_SERVICE_CATEGORIES].sort();
    assert(
      JSON.stringify(sortedActual) === JSON.stringify(sortedExpected),
      `Slugs match domain reference: ${actualSlugs.join(', ')}`
    );

    // 5. Verify Migration Records
    console.log('\n--- 5. Meta Schema Migrations Verification ---');
    const migRes = await db.query(`SELECT version, name, checksum, applied_at FROM meta.schema_migrations;`);
    results.migrationRecords = migRes.rows.length;
    assert(
      migRes.rows.length === 1,
      `Exactly 1 migration record in meta.schema_migrations (Found: ${migRes.rows.length})`
    );
    if (migRes.rows.length > 0) {
      assert(migRes.rows[0].version === '001', `Applied migration version is '001' (got: ${migRes.rows[0].version})`);
    }

    // 6. Referential Integrity & Orphan Audit
    console.log('\n--- 6. Referential Integrity & Orphan Audit ---');

    // 6.1 Orphaned vehicles (customer_id not in customers)
    const orphanVehRes = await db.query(`
      SELECT v.id, v.customer_id, v.registration_no 
      FROM vehicles v 
      LEFT JOIN customers c ON v.customer_id = c.id 
      WHERE c.id IS NULL;
    `);
    results.orphanedRecords.orphanedVehicles = orphanVehRes.rows.length;
    results.orphanedRecords.details.vehicles = orphanVehRes.rows;
    assert(
      orphanVehRes.rows.length === 0,
      `Zero orphaned vehicles (Found: ${orphanVehRes.rows.length})`
    );

    // 6.2 Orphaned service_locations (customer_id not in customers)
    const orphanLocRes = await db.query(`
      SELECT l.id, l.customer_id, l.address_text 
      FROM service_locations l 
      LEFT JOIN customers c ON l.customer_id = c.id 
      WHERE c.id IS NULL;
    `);
    results.orphanedRecords.orphanedServiceLocations = orphanLocRes.rows.length;
    results.orphanedRecords.details.serviceLocations = orphanLocRes.rows;
    assert(
      orphanLocRes.rows.length === 0,
      `Zero orphaned service_locations (Found: ${orphanLocRes.rows.length})`
    );

    // 6.3 Orphaned subscription_vehicles (subscription_id not in subscriptions)
    const orphanSubVehRes = await db.query(`
      SELECT sv.id, sv.subscription_id, sv.vehicle_id 
      FROM subscription_vehicles sv 
      LEFT JOIN subscriptions s ON sv.subscription_id = s.id 
      WHERE s.id IS NULL;
    `);
    results.orphanedRecords.orphanedSubscriptionVehicles = orphanSubVehRes.rows.length;
    results.orphanedRecords.details.subscriptionVehicles = orphanSubVehRes.rows;
    assert(
      orphanSubVehRes.rows.length === 0,
      `Zero orphaned subscription_vehicles (Found: ${orphanSubVehRes.rows.length})`
    );

    // 6.4 Orphaned staff_assignments (subscription_id not in subscriptions or staff_id not in staff)
    const orphanAssignRes = await db.query(`
      SELECT sa.id, sa.subscription_id, sa.job_id, sa.staff_id 
      FROM staff_assignments sa 
      LEFT JOIN subscriptions s ON sa.subscription_id = s.id 
      LEFT JOIN service_jobs j ON sa.job_id = j.id 
      LEFT JOIN staff st ON sa.staff_id = st.id 
      WHERE (sa.subscription_id IS NOT NULL AND s.id IS NULL)
         OR (sa.job_id IS NOT NULL AND j.id IS NULL)
         OR (sa.staff_id IS NOT NULL AND st.id IS NULL);
    `);
    results.orphanedRecords.orphanedStaffAssignments = orphanAssignRes.rows.length;
    results.orphanedRecords.details.staffAssignments = orphanAssignRes.rows;
    assert(
      orphanAssignRes.rows.length === 0,
      `Zero orphaned staff_assignments (Found: ${orphanAssignRes.rows.length})`
    );

    // 6.5 Service logs with IST date mismatch
    const istMismatchRes = await db.query(`
      SELECT id, service_date, completed_at_device, 
             completed_at_device AT TIME ZONE 'Asia/Kolkata' AS ist_device,
             (completed_at_device AT TIME ZONE 'Asia/Kolkata')::date AS ist_date
      FROM service_logs 
      WHERE service_date != (completed_at_device AT TIME ZONE 'Asia/Kolkata')::date;
    `);
    results.orphanedRecords.serviceLogsIstMismatch = istMismatchRes.rows.length;
    results.orphanedRecords.details.serviceLogsIstMismatch = istMismatchRes.rows;
    assert(
      istMismatchRes.rows.length === 0,
      `Zero service_logs with IST date mismatch (Found: ${istMismatchRes.rows.length})`
    );

    results.orphanedRecords.totalOrphans = 
      orphanVehRes.rows.length +
      orphanLocRes.rows.length +
      orphanSubVehRes.rows.length +
      orphanAssignRes.rows.length +
      istMismatchRes.rows.length;

    // 7. Verify Zero Business Records & Active vs Soft-Deleted
    console.log('\n--- 7. Business Records Cleanliness Audit ---');
    const rawCounts = {
      customers: results.tableCounts['customers'] || 0,
      vehicles: results.tableCounts['vehicles'] || 0,
      staff: results.tableCounts['staff'] || 0,
      subscriptions: results.tableCounts['subscriptions'] || 0,
      service_jobs: results.tableCounts['service_jobs'] || 0,
      service_logs: results.tableCounts['service_logs'] || 0
    };

    const activeCountsRes = await db.query(`
      SELECT
        (SELECT count(*)::int FROM customers WHERE deleted_at IS NULL) as active_customers,
        (SELECT count(*)::int FROM vehicles WHERE deleted_at IS NULL) as active_vehicles,
        (SELECT count(*)::int FROM staff WHERE is_active = TRUE AND deleted_at IS NULL) as active_staff,
        (SELECT count(*)::int FROM subscriptions WHERE deleted_at IS NULL) as active_subscriptions,
        (SELECT count(*)::int FROM service_jobs WHERE deleted_at IS NULL) as active_service_jobs,
        (SELECT count(*)::int FROM service_logs) as service_logs
    `);
    const activeRow = activeCountsRes.rows[0];
    results.activeBusinessRecords = activeRow;

    console.log('  Active Business Records (Non-deleted/Active):');
    console.log(`    Active Customers:      ${activeRow.active_customers}`);
    console.log(`    Active Vehicles:       ${activeRow.active_vehicles}`);
    console.log(`    Active Staff:          ${activeRow.active_staff}`);
    console.log(`    Active Subscriptions:  ${activeRow.active_subscriptions}`);
    console.log(`    Active Service Jobs:   ${activeRow.active_service_jobs}`);
    console.log(`    Service Logs Total:    ${activeRow.service_logs}`);

    for (const [tbl, count] of Object.entries(rawCounts)) {
      const isZero = count === 0;
      assert(isZero, `Table '${tbl}' has exactly 0 records (count: ${count})`);
      if (!isZero) {
        results.defectsAndNotes.push({
          table: tbl,
          physicalRowCount: count,
          activeCount: activeRow[`active_${tbl}`] ?? count,
          note: `Synthetic test records remained after test execution. Admin API cleanup performed soft-deletes or deactivation.`
        });
      }
    }

    // 8. Preserved neondb Safety Check (Read-Only)
    console.log('\n--- 8. Preserved neondb Safety Verification (Read-Only) ---');
    const oldPooledUrl = process.env.DATABASE_URL.replace('/cwp_customer_db', '/neondb');
    const neondbPool = new Pool({
      connectionString: oldPooledUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    try {
      const neondbRes = await neondbPool.query(
        "SELECT count(*)::int as c FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const neondbCount = neondbRes.rows[0].c;
      results.neondbTableCount = neondbCount;
      assert(
        neondbCount === 132,
        `neondb remains 100% untouched and preserved with 132 tables (Found: ${neondbCount})`
      );
    } finally {
      await neondbPool.end();
    }

    // Overall status determination
    // If raw business records > 0, overallStatus is documented as FAIL per QA specification
    results.overallStatus = (failCount === 0) ? 'PASS' : 'FAIL';
    results.summary = {
      totalChecks: passCount + failCount,
      passed: passCount,
      failed: failCount
    };

    console.log('\n================================================================');
    console.log(`INTEGRITY VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`Overall Status: ${results.overallStatus}`);
    console.log('================================================================\n');

    // Write results to JSON file
    const outputPath = path.join(__dirname, 'phase1g_db_integrity_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Results written to: ${outputPath}`);

  } catch (err) {
    console.error('[CRITICAL INTEGRITY SCRIPT ERROR]:', err);
    results.overallStatus = 'FAIL';
    results.error = err.message;
    const outputPath = path.join(__dirname, 'phase1g_db_integrity_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

runIntegrityChecks();
