/**
 * Focused unit tests for Startup Environment Transparency & Migration Safety.
 * Uses strictly mocked DB config and mocked pg.Client (zero real DB connections).
 */
'use strict';

const assert = require('assert');
const path = require('path');
const pg = require('pg');
const startupSafety = require('../lib/startupSafety');
const { resolveDatabaseConfig } = require('../db/connectionResolver');

function run() {
  // 1. Environment classification
  {
    const devEnv = { NODE_ENV: 'development' };
    assert.strictEqual(startupSafety.classifyRuntimeEnvironment(devEnv), 'LOCAL DEVELOPMENT');
    assert.strictEqual(startupSafety.classifyHostingEnvironment(devEnv), 'LOCAL MACHINE');

    const prodRailwayEnv = { NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production', RAILWAY_PUBLIC_DOMAIN: 'cwpdata.up.railway.app' };
    assert.strictEqual(startupSafety.classifyRuntimeEnvironment(prodRailwayEnv), 'PRODUCTION');
    assert.strictEqual(startupSafety.classifyHostingEnvironment(prodRailwayEnv), 'RAILWAY');

    const prodNoRailwayEnv = { NODE_ENV: 'production' };
    assert.strictEqual(startupSafety.classifyRuntimeEnvironment(prodNoRailwayEnv), 'PRODUCTION');
    assert.strictEqual(startupSafety.classifyHostingEnvironment(prodNoRailwayEnv), 'UNKNOWN');

    const missingEnv = {};
    assert.strictEqual(startupSafety.classifyRuntimeEnvironment(missingEnv), 'UNKNOWN');
    assert.strictEqual(startupSafety.classifyHostingEnvironment(missingEnv), 'LOCAL MACHINE');

    const testEnv = { NODE_ENV: 'test' };
    assert.strictEqual(startupSafety.classifyRuntimeEnvironment(testEnv), 'TEST');
    console.log('PASS: Environment & hosting classification');
  }

  // 2. Startup banner summary & host sanitization (no secret leaks)
  {
    const devDbCfg = resolveDatabaseConfig('postgresql://user:supersecret@ep-wild-example-123.c-4.ap-southeast-1.aws.neon.tech/cwp_customer_db?sslmode=require');
    const summary = startupSafety.getStartupSummary({
      port: 3000,
      domain: 'cwpdetailers.in',
      env: { NODE_ENV: 'development' },
      dbConfig: devDbCfg
    });

    assert.strictEqual(summary.runtimeEnv, 'LOCAL DEVELOPMENT');
    assert.strictEqual(summary.hostingEnv, 'LOCAL MACHINE');
    assert.strictEqual(summary.domainLabel, 'Configured Fallback Domain');
    assert.strictEqual(summary.domainUrl, 'https://cwpdetailers.in');
    assert.strictEqual(summary.dbTarget.databaseName, 'cwp_customer_db');
    assert.strictEqual(summary.dbTarget.classification, 'DEVELOPMENT');
    assert.strictEqual(summary.dbTarget.sanitizedHost, 'ep-wil***.c-4.ap-southeast-1.aws.neon.tech');
    assert.strictEqual(summary.migrationStatusLabel, 'DISABLED BY DEFAULT');
    assert.ok(!JSON.stringify(summary).includes('supersecret'), 'Must never leak DB credentials');

    const prodDbCfg = resolveDatabaseConfig('postgresql://user:prodsecret@ep-gentle-prod-999-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');
    const prodSummary = startupSafety.getStartupSummary({
      port: 8080,
      domain: 'cwpdata.up.railway.app',
      env: { NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production', RAILWAY_PUBLIC_DOMAIN: 'cwpdata.up.railway.app' },
      dbConfig: prodDbCfg
    });
    assert.strictEqual(prodSummary.runtimeEnv, 'PRODUCTION');
    assert.strictEqual(prodSummary.hostingEnv, 'RAILWAY');
    assert.strictEqual(prodSummary.domainLabel, 'Railway Public Domain');
    assert.strictEqual(prodSummary.dbTarget.classification, 'PRODUCTION');
    assert.strictEqual(prodSummary.dbTarget.isProductionDb, true);
    assert.ok(!JSON.stringify(prodSummary).includes('prodsecret'), 'Must never leak production credentials');
    console.log('PASS: Startup summary & host sanitization');
  }

  // 3. Migration safety policy matrix
  {
    const devDbCfg = resolveDatabaseConfig('postgresql://u:p@ep-wild-1.c-4.ap-southeast-1.aws.neon.tech/cwp_customer_db');
    const prodDbCfg = resolveDatabaseConfig('postgresql://u:p@ep-gentle-1.c-2.ap-southeast-1.aws.neon.tech/neondb');

    const pUnset = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development' }, dbConfig: devDbCfg, source: 'server_startup' });
    assert.strictEqual(pUnset.allowed, false);
    assert.strictEqual(pUnset.mode, 'DISABLED_BY_DEFAULT');

    const pFalse = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development', AUTO_MIGRATE: 'false' }, dbConfig: devDbCfg, source: 'server_startup' });
    assert.strictEqual(pFalse.allowed, false);
    assert.strictEqual(pFalse.mode, 'DISABLED_BY_ENV');

    const pTrue = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development', AUTO_MIGRATE: 'true' }, dbConfig: devDbCfg, source: 'server_startup' });
    assert.strictEqual(pTrue.allowed, true);
    assert.strictEqual(pTrue.mode, 'EXPLICIT_LOCAL_OPT_IN');
    assert.ok(pTrue.warn && pTrue.warn.includes('AUTO_MIGRATE=true'));

    // Hard block against production DB from local even with AUTO_MIGRATE=true
    const pBlocked = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development', AUTO_MIGRATE: 'true' }, dbConfig: prodDbCfg, source: 'server_startup' });
    assert.strictEqual(pBlocked.allowed, false);
    assert.strictEqual(pBlocked.mode, 'BLOCKED_PRODUCTION_TARGET');

    const pBlockedCli = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development' }, dbConfig: prodDbCfg, source: 'cli_migrate' });
    assert.strictEqual(pBlockedCli.allowed, false);
    assert.strictEqual(pBlockedCli.mode, 'BLOCKED_PRODUCTION_TARGET');

    // Railway production workflow preserved
    const prodEnv = { NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production' };
    const pProdCli = startupSafety.evaluateMigrationPolicy({ env: prodEnv, dbConfig: prodDbCfg, source: 'cli_migrate' });
    assert.strictEqual(pProdCli.allowed, true);
    assert.strictEqual(pProdCli.mode, 'PRODUCTION_CLI');

    const pProdStartup = startupSafety.evaluateMigrationPolicy({ env: prodEnv, dbConfig: prodDbCfg, source: 'server_startup' });
    assert.strictEqual(pProdStartup.allowed, true);
    assert.strictEqual(pProdStartup.mode, 'PRODUCTION_STARTUP');

    // UNKNOWN DB target must be hard-blocked locally (both server_startup and cli_migrate)
    const unknownDbCfg = resolveDatabaseConfig('postgresql://u:p@ep-cool-rain-123.c-4.ap-southeast-1.aws.neon.tech/appdb');
    const pUnknownUnset = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development' }, dbConfig: unknownDbCfg, source: 'server_startup' });
    assert.strictEqual(pUnknownUnset.allowed, false);
    assert.strictEqual(pUnknownUnset.mode, 'BLOCKED_UNKNOWN_DATABASE_TARGET');

    const pUnknownTrue = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development', AUTO_MIGRATE: 'true' }, dbConfig: unknownDbCfg, source: 'server_startup' });
    assert.strictEqual(pUnknownTrue.allowed, false);
    assert.strictEqual(pUnknownTrue.mode, 'BLOCKED_UNKNOWN_DATABASE_TARGET');

    const pUnknownCli = startupSafety.evaluateMigrationPolicy({ env: { NODE_ENV: 'development' }, dbConfig: unknownDbCfg, source: 'cli_migrate' });
    assert.strictEqual(pUnknownCli.allowed, false);
    assert.strictEqual(pUnknownCli.mode, 'BLOCKED_UNKNOWN_DATABASE_TARGET');

    // Production detection takes precedence over DB_ENVIRONMENT=development/local
    const neondbOverrideTarget = startupSafety.classifyDatabaseTarget(prodDbCfg, { DB_ENVIRONMENT: 'development' });
    assert.strictEqual(neondbOverrideTarget.classification, 'PRODUCTION');
    assert.strictEqual(neondbOverrideTarget.isProductionDb, true);

    const prodHostDbCfg = resolveDatabaseConfig('postgresql://u:p@db-prod-01.internal.net/custom_name');
    const prodHostOverrideTarget = startupSafety.classifyDatabaseTarget(prodHostDbCfg, { DB_ENVIRONMENT: 'development' });
    assert.strictEqual(prodHostOverrideTarget.classification, 'PRODUCTION');
    assert.strictEqual(prodHostOverrideTarget.isProductionDb, true);

    const pProdOverrideLocal = startupSafety.evaluateMigrationPolicy({
      env: { NODE_ENV: 'development', AUTO_MIGRATE: 'true', DB_ENVIRONMENT: 'local' },
      dbConfig: prodDbCfg,
      source: 'server_startup'
    });
    assert.strictEqual(pProdOverrideLocal.allowed, false);
    assert.strictEqual(pProdOverrideLocal.mode, 'BLOCKED_PRODUCTION_TARGET');

    // Valid DB_ENVIRONMENT=development override works for genuinely non-production DB target
    const validOverrideTarget = startupSafety.classifyDatabaseTarget(unknownDbCfg, { DB_ENVIRONMENT: 'development' });
    assert.strictEqual(validOverrideTarget.classification, 'DEVELOPMENT');
    assert.strictEqual(validOverrideTarget.isProductionDb, false);
    const pValidOverride = startupSafety.evaluateMigrationPolicy({
      env: { NODE_ENV: 'development', AUTO_MIGRATE: 'true', DB_ENVIRONMENT: 'development' },
      dbConfig: unknownDbCfg,
      source: 'server_startup'
    });
    assert.strictEqual(pValidOverride.allowed, true);
    assert.strictEqual(pValidOverride.mode, 'EXPLICIT_LOCAL_OPT_IN');

    console.log('PASS: Migration safety policy matrix (including UNKNOWN & override precedence)');
  }

  // 4. Mocked migrations/migrate.js execution & syncSequences gating
  return (async () => {
    const origEnv = { ...process.env };
    const origClient = pg.Client;
    let clientCreated = 0;
    let executedSql = [];

    pg.Client = function MockClient() {
      clientCreated++;
      return {
        connect: async () => {},
        end: async () => {},
        query: async (sql) => {
          executedSql.push(sql);
          if (/SELECT current_database/.test(sql)) {
            return { rows: [{ current_database: 'neondb', current_user: 'mock', version: 'PostgreSQL 18' }] };
          }
          if (/SELECT \* FROM meta\.schema_migrations/.test(sql)) {
            return { rows: [{ version: 'existing' }] }; // simulate all already applied
          }
          return { rows: [] };
        }
      };
    };

    try {
      const migratePath = path.resolve(__dirname, '../migrations/migrate.js');
      delete require.cache[migratePath];
      const migrate = require('../migrations/migrate');

      // 4a. Local startup with AUTO_MIGRATE unset -> skipped before connecting
      process.env.NODE_ENV = 'development';
      delete process.env.AUTO_MIGRATE;
      process.env.DATABASE_URL = 'postgresql://u:p@ep-wild-1.c-4.ap-southeast-1.aws.neon.tech/cwp_customer_db';
      delete process.env.RAILWAY_ENVIRONMENT;
      const r1 = await migrate.runMigration({ source: 'server_startup' });
      assert.strictEqual(r1.skipped, true);
      assert.strictEqual(clientCreated, 0, 'Mock pg.Client must not be created when skipped');

      // 4b. Local CLI against production DB -> hard blocked before connecting
      process.env.DATABASE_URL = 'postgresql://u:p@ep-gentle-1.c-2.ap-southeast-1.aws.neon.tech/neondb';
      const r2 = await migrate.runMigration({ source: 'cli_migrate' });
      assert.strictEqual(r2.skipped, true);
      assert.strictEqual(r2.mode, 'BLOCKED_PRODUCTION_TARGET');
      assert.strictEqual(clientCreated, 0, 'Mock pg.Client must not be created when blocked');

      // 4b-2. Local CLI and AUTO_MIGRATE=true against UNKNOWN DB -> hard blocked before connecting
      process.env.DATABASE_URL = 'postgresql://u:p@ep-cool-rain-123.c-4.ap-southeast-1.aws.neon.tech/appdb';
      process.env.AUTO_MIGRATE = 'true';
      const rUnknownStartup = await migrate.runMigration({ source: 'server_startup' });
      assert.strictEqual(rUnknownStartup.skipped, true);
      assert.strictEqual(rUnknownStartup.mode, 'BLOCKED_UNKNOWN_DATABASE_TARGET');
      const rUnknownCli = await migrate.runMigration({ source: 'cli_migrate' });
      assert.strictEqual(rUnknownCli.skipped, true);
      assert.strictEqual(rUnknownCli.mode, 'BLOCKED_UNKNOWN_DATABASE_TARGET');
      assert.strictEqual(clientCreated, 0, 'Mock pg.Client must not be created for UNKNOWN DB target');
      delete process.env.AUTO_MIGRATE;

      // 4c. Production CLI with 0 new migrations -> connects, skips setval()
      process.env.NODE_ENV = 'production';
      process.env.RAILWAY_ENVIRONMENT = 'production';
      const r3 = await migrate.runMigration({ source: 'cli_migrate' });
      assert.strictEqual(r3.executed, true);
      assert.strictEqual(r3.appliedCount, 0);
      assert.strictEqual(r3.sequencesSynced, false);
      assert.ok(!executedSql.some(s => /setval/i.test(s)), 'setval() must NOT run when 0 migrations applied');
      console.log('PASS: migrate.js gating & syncSequences skipped when 0 new migrations applied');
    } finally {
      pg.Client = origClient;
      process.env = origEnv;
    }
  })();
}

Promise.resolve(run()).catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
