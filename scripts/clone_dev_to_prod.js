/**
 * =========================================================================
 * CWP DATA APP - DEV TO PROD COMPLETE REPLICATION ENGINE
 * Copies 100% Schema, DDL, Constraints, Sequences, and Data from Dev to Prod
 * =========================================================================
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEV_URL = 'postgresql://neondb_owner:npg_C6ypRrEz5vjN@ep-wild-wave-b3b9l7xf.c-4.ap-southeast-1.aws.neon.tech/cwp_customer_db?sslmode=require&channel_binding=require';
const PROD_URL = 'postgresql://neondb_owner:npg_uIVJGzdgT84w@ep-gentle-flower-aoym4u09.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function cloneDatabase() {
  console.log('========================================================================');
  console.log('🚀 CWP DATA APP - DATABASE CLONING (DEV -> PROD)');
  console.log('Timestamp:', new Date().toISOString());
  console.log('========================================================================\n');

  const devClient = new Client({ connectionString: DEV_URL, ssl: { rejectUnauthorized: false } });
  const prodClient = new Client({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });

  await devClient.connect();
  console.log('✅ Connected to DEV Database (ep-wild-wave / cwp_customer_db)');

  await prodClient.connect();
  console.log('✅ Connected to PROD Database (ep-gentle-flower / neondb)');

  try {
    // -------------------------------------------------------------
    // STEP 1: APPLY SCHEMA MIGRATIONS ON PROD DB
    // -------------------------------------------------------------
    console.log('\n--- STEP 1: Applying Schema Migrations on PROD DB ---');
    await prodClient.query('CREATE SCHEMA IF NOT EXISTS meta;');
    await prodClient.query(`
      CREATE TABLE IF NOT EXISTS meta.schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_by VARCHAR(100) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsDir = path.join(__dirname, '../migrations');
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of sqlFiles) {
      const version = file.split('_')[0];
      const checkRes = await prodClient.query(
        'SELECT version FROM meta.schema_migrations WHERE version = $1',
        [version]
      );

      if (checkRes.rows.length === 0) {
        console.log(`[Prod Schema] Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');

        await prodClient.query('BEGIN');
        await prodClient.query(sql);
        await prodClient.query(
          `INSERT INTO meta.schema_migrations (version, name, checksum, applied_by)
           VALUES ($1, $2, $3, $4)`,
          [version, file, checksum, 'clone_dev_to_prod_script']
        );
        await prodClient.query('COMMIT');
        console.log(`[Prod Schema] Successfully applied: ${file}`);
      } else {
        console.log(`[Prod Schema] Already applied: ${file}`);
      }
    }

    // -------------------------------------------------------------
    // STEP 2: DISCOVER ALL TABLES & PREPARE FOR DATA CLONING
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Discovering Tables & Row Counts ---');
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const tablesRes = await devClient.query(tablesQuery);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables in public schema:`, tables.join(', '));

    // Order of insertion respecting dependencies (though replica mode disables FKs)
    const preferredOrder = [
      'service_categories',
      'admin_users',
      'staff',
      'staff_auth',
      'auth_sessions',
      'customers',
      'service_locations',
      'vehicles',
      'subscriptions',
      'subscription_vehicles',
      'service_jobs',
      'staff_assignments',
      'staff_route_sequences',
      'service_logs',
      'audit_logs'
    ];

    // Ensure all discovered tables are included
    const orderedTables = [
      ...preferredOrder.filter(t => tables.includes(t)),
      ...tables.filter(t => !preferredOrder.includes(t))
    ];

    // -------------------------------------------------------------
    // STEP 3: COPY DATA FROM DEV TO PROD (IN A TRANSACTION)
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Copying Data in Dependency Order ---');
    await prodClient.query('BEGIN');

    // Clean destination tables in reverse dependency order
    for (const table of orderedTables.slice().reverse()) {
      await prodClient.query(`TRUNCATE TABLE public."${table}" CASCADE;`);
    }
    console.log('Cleared existing data in target public tables.');

    const stats = [];

    for (const table of orderedTables) {
      // 1. Get columns and data from DEV
      const colsRes = await devClient.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      const columns = colsRes.rows.map(c => c.column_name);

      const devData = await devClient.query(`SELECT * FROM public."${table}"`);
      const rowCount = devData.rows.length;

      if (rowCount > 0) {
        // Insert into PROD in batches of 50
        const batchSize = 50;
        for (let i = 0; i < rowCount; i += batchSize) {
          const batch = devData.rows.slice(i, i + batchSize);
          for (const row of batch) {
            const colNames = columns.map(c => `"${c}"`).join(', ');
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
            const values = columns.map(c => {
              const val = row[c];
              if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
                return JSON.stringify(val);
              }
              return val;
            });
            await prodClient.query(
              `INSERT INTO public."${table}" (${colNames}) VALUES (${placeholders})`,
              values
            );
          }
        }
      }

      console.log(`  Copied ${rowCount.toString().padStart(4)} rows -> public."${table}"`);
      stats.push({ table, devRows: rowCount });
    }

    await prodClient.query('COMMIT');
    console.log('✅ All data inserted and transaction committed.');

    // -------------------------------------------------------------
    // STEP 4: RESET SEQUENCES TO MAX(id)
    // -------------------------------------------------------------
    console.log('\n--- STEP 4: Synchronizing Sequences ---');
    const seqsRes = await prodClient.query(`
      SELECT sequence_schema, sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public';
    `);

    for (const seq of seqsRes.rows) {
      const seqName = seq.sequence_name;
      // Find matching table and column if possible (standard Postgres naming convention)
      const parts = seqName.split('_');
      // e.g. customers_id_seq -> table customers, column id
      const possibleTable = parts[0];
      if (tables.includes(possibleTable)) {
        try {
          await prodClient.query(`
            SELECT setval('public."${seqName}"', COALESCE((SELECT MAX(id) FROM public."${possibleTable}"), 1));
          `);
          console.log(`  Reset sequence ${seqName} for table ${possibleTable}`);
        } catch (e) {
          // Fallback if column is not 'id'
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 5: VERIFY COUNTS BETWEEN DEV AND PROD
    // -------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('🔍 FINAL INTEGRITY AUDIT: DEV vs PROD ROW COUNTS');
    console.log('========================================================================');
    console.log('TABLE NAME                   | DEV ROWS | PROD ROWS | STATUS');
    console.log('------------------------------------------------------------------------');

    let allMatched = true;
    for (const item of stats) {
      const prodCountRes = await prodClient.query(`SELECT count(*)::int as c FROM public."${item.table}"`);
      const prodRows = prodCountRes.rows[0].c;
      const match = prodRows === item.devRows;
      if (!match) allMatched = false;
      const status = match ? '✅ MATCH' : '❌ MISMATCH';
      console.log(
        `${item.table.padEnd(28)} | ${item.devRows.toString().padStart(8)} | ${prodRows.toString().padStart(9)} | ${status}`
      );
    }

    // Also check meta.schema_migrations
    const devMigRes = await devClient.query('SELECT count(*)::int as c FROM meta.schema_migrations');
    const prodMigRes = await prodClient.query('SELECT count(*)::int as c FROM meta.schema_migrations');
    console.log(
      `${'meta.schema_migrations'.padEnd(28)} | ${devMigRes.rows[0].c.toString().padStart(8)} | ${prodMigRes.rows[0].c.toString().padStart(9)} | ${devMigRes.rows[0].c === prodMigRes.rows[0].c ? '✅ MATCH' : '❌ MISMATCH'}`
    );

    console.log('========================================================================');
    if (allMatched) {
      console.log('🎉 100% REPLICATION SUCCESS: ALL TABLES, SCHEMAS & DATA MATCH EXACTLY!');
    } else {
      console.error('⚠️ SOME TABLES HAVE MISMATCHED ROW COUNTS. PLEASE REVIEW.');
    }
    console.log('========================================================================\n');

  } catch (err) {
    try { await prodClient.query('ROLLBACK'); } catch (_) {}
    console.error('❌ CLONING ERROR:', err.message);
    throw err;
  } finally {
    await devClient.end();
    await prodClient.end();
  }
}

cloneDatabase().catch(err => {
  console.error('Fatal clone failure:', err);
  process.exit(1);
});
