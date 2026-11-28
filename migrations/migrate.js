/**
-- =========================================================================
-- CWP DATA APP - MIGRATION RUNNER
-- Sequential Database Schema Provisioning
-- =========================================================================
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Auto-load .env for standalone script execution if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

const { resolveDatabaseConfig } = require('../db/connectionResolver');
const startupSafety = require('../lib/startupSafety');

async function runMigration(options = {}) {
  const source = options.source || (require.main === module ? 'cli_migrate' : 'server_startup');
  console.log('================================================================');
  console.log('CWP DATA APP - DATABASE SCHEMA PROVISIONING');
  console.log('================================================================');

  // Validate migration numbering before reading DB config or opening a
  // connection. The runner keys applied migrations by numeric prefix, so
  // duplicate prefixes would otherwise cause a file to be silently skipped.
  const migrationsDir = __dirname;
  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  const versions = new Map();
  for (const file of sqlFiles) {
    const match = file.match(/^(\d+)_/);
    if (!match) continue;
    const version = match[1];
    const previous = versions.get(version);
    if (previous) throw new Error(`[Migration] Duplicate version ${version}: ${previous} and ${file}`);
    versions.set(version, file);
  }

  const dbConfig = resolveDatabaseConfig(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  if (!dbConfig.isConfigured) {
    throw new Error(`[Migration] Configuration Error: ${dbConfig.error}`);
  }

  const policy = startupSafety.evaluateMigrationPolicy({
    env: process.env,
    dbConfig,
    source
  });

  if (!policy.allowed) {
    console.warn(`[Migration Safety]: ${policy.reason}`);
    return {
      executed: false,
      skipped: true,
      mode: policy.mode,
      reason: policy.reason,
      appliedCount: 0,
      sequencesSynced: false
    };
  }

  if (policy.warn) {
    console.warn(`[Migration Safety]: ${policy.warn}`);
  }

  // Migrations use the direct unpooled connection for DDL execution
  const connectionString = dbConfig.directUrl;
  const sanitizedHost = startupSafety.sanitizeHost(dbConfig.host);
  console.log(`[Connection Target]: ${sanitizedHost} (Database: ${dbConfig.databaseName}, Mode: ${dbConfig.isNeon ? 'Direct/Unpooled' : 'Standard'})`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: process.env.ALLOW_INSECURE_DB_SSL === 'true' ? false : true },
    connectionTimeoutMillis: 10000
  });

  await client.connect();

  try {
    // 1. Verify database identity
    const dbIdentity = await client.query('SELECT current_database(), current_user, version()');
    const activeDb = dbIdentity.rows[0].current_database;
    console.log(`[Connected Database]: ${activeDb}`);

    // 2. Setup meta schema
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

    // 3. Execute migrations in filename order after the preflight above.
    let appliedCount = 0;

    for (const file of sqlFiles) {
      const match = file.match(/^(\d+)_/);
      const version = match ? match[1] : file;
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

      const existing = await client.query('SELECT * FROM meta.schema_migrations WHERE version = $1', [version]);
      if (existing.rows.length > 0) {
        console.log(`[Status]: Migration ${file} (${version}) is already applied.`);
        continue;
      }

      console.log(`\n[Executing Migration]: ${file} (${version})...`);
      const startTime = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(`
          INSERT INTO meta.schema_migrations (version, name, checksum, applied_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (version) DO UPDATE 
          SET checksum = EXCLUDED.checksum, applied_at = CURRENT_TIMESTAMP;
        `, [version, file, checksum, 'Automated Provisioner']);
        await client.query('COMMIT');
        appliedCount += 1;
        const duration = Date.now() - startTime;
        console.log(`[DDL Execution]: ${file} SUCCESS in ${duration} ms`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }

    // 4. Synchronize sequences only when new migrations were applied or explicitly forced
    let sequencesSynced = false;
    if (appliedCount > 0 || process.env.FORCE_SYNC_SEQUENCES === 'true') {
      await syncSequences(client);
      sequencesSynced = true;
    } else {
      console.log('[Sequences]: Skipped sequence synchronization (no new migrations applied).');
    }

    console.log('\n================================================================');
    console.log('ALL MIGRATIONS COMPLETED SUCCESSFULLY');
    console.log('================================================================');
    return {
      executed: true,
      skipped: false,
      mode: policy.mode,
      appliedCount,
      sequencesSynced
    };

  } catch (err) {
    console.error('\n[MIGRATION FAILED]:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

async function syncSequences(client) {
  try {
    await client.query(`
      DO $$
      DECLARE
          rec RECORD;
          v_max BIGINT;
          v_sql TEXT;
      BEGIN
          FOR rec IN 
              SELECT 
                  t.relname AS table_name,
                  a.attname AS col_name,
                  s.relname AS seq_name
              FROM pg_class s
              JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass
              JOIN pg_class t ON t.oid = d.refobjid
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
              WHERE s.relkind = 'S' AND t.relnamespace = 'public'::regnamespace
          LOOP
              v_sql := format('SELECT COALESCE(MAX(%I), 1) FROM public.%I', rec.col_name, rec.table_name);
              EXECUTE v_sql INTO v_max;
              PERFORM setval(format('public.%I', rec.seq_name), GREATEST(v_max, 1), true);
          END LOOP;
      END $$;
    `);
    console.log('[Sequences]: All public database sequences synchronized successfully.');
  } catch (err) {
    console.warn('[Sequences]: Warning during sequence synchronization:', err.message);
  }
}

module.exports = {
  runMigration
};

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Fatal Migration Error:', err);
    process.exit(1);
  });
}
