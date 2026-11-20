/**
-- =========================================================================
-- CWP DATA APP - MIGRATION RUNNER
-- Phase 1D: Execute Neon Database Schema Provisioning
-- =========================================================================
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

async function runMigration() {
  console.log('================================================================');
  console.log('CWP DATA APP - PHASE 1D DATABASE SCHEMA PROVISIONING');
  console.log('================================================================');

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set in environment.');
  }

  const u = new URL(connectionString);
  console.log('[Connection Target]:', u.host + u.pathname);

  if (u.pathname !== '/cwp_customer_db') {
    throw new Error(`CRITICAL GUARD ABORT: Attempting to run migration against ${u.pathname} instead of /cwp_customer_db`);
  }

  const migrationFile = path.join(__dirname, '001_initial_cwp_customer_db_schema.sql');
  if (!fs.existsSync(migrationFile)) {
    throw new Error(`Migration file not found at ${migrationFile}`);
  }

  const sqlContent = fs.readFileSync(migrationFile, 'utf8');
  const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');
  const version = '001';
  const migrationName = '001_initial_cwp_customer_db_schema.sql';

  console.log(`[Migration File]: ${migrationName}`);
  console.log(`[SHA-256 Checksum]: ${checksum}`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  await client.connect();

  try {
    // 1. Double-check database identity
    const dbIdentity = await client.query('SELECT current_database(), current_user, version()');
    const activeDb = dbIdentity.rows[0].current_database;
    console.log(`[Connected Database]: ${activeDb}`);

    if (activeDb !== 'cwp_customer_db') {
      throw new Error(`CRITICAL GUARD ABORT: Server reports current_database is ${activeDb}, expected cwp_customer_db`);
    }

    // 2. Check if migration already recorded
    await client.query('CREATE SCHEMA IF NOT EXISTS meta;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS meta.schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_by VARCHAR(100) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const existing = await client.query('SELECT * FROM meta.schema_migrations WHERE version = $1', [version]);
    if (existing.rows.length > 0) {
      console.log(`[Status]: Migration ${version} is already applied (checksum: ${existing.rows[0].checksum}).`);
      return;
    }

    // 3. Execute SQL Migration within transaction
    console.log('\n[Executing Schema DDL in Transaction]...');
    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = Date.now() - startTime;
    console.log(`[DDL Execution]: SUCCESS in ${duration} ms`);

    // 4. Record migration record
    await client.query(`
      INSERT INTO meta.schema_migrations (version, name, checksum, applied_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (version) DO UPDATE 
      SET checksum = EXCLUDED.checksum, applied_at = CURRENT_TIMESTAMP;
    `, [version, migrationName, checksum, 'Phase 1D Automated Provisioner']);

    console.log(`[Audit Record]: Migration ${version} recorded into meta.schema_migrations`);
    console.log('\n================================================================');
    console.log('MIGRATION EXECUTION COMPLETED SUCCESSFULLY');
    console.log('================================================================');

  } catch (err) {
    console.error('\n[MIGRATION FAILED]:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
