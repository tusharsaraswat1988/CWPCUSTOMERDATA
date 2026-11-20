/**
 * CWP CUSTOMER DATA APP - NEON POSTGRESQL CONNECTIVITY MODULE
 * Phase 1A: Isolated Foundation & Health Verification Only
 * 
 * Strict Constraints:
 * - Read-only infrastructure verification only.
 * - No schema creation, table creation, or DDL operations.
 * - No data migration, customer imports, or business synchronization.
 * - Zero hardcoded credentials (all sourced from validated environment variables).
 */

const { Pool, Client } = require('pg');

let pool = null;

/**
 * Validates required Neon configuration variables from process.env
 */
function getValidatedConfig() {
  const pooledUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const provider = process.env.DB_PROVIDER?.trim() || 'neon';

  return {
    isConfigured: Boolean(pooledUrl),
    pooledUrl,
    directUrl,
    provider
  };
}

/**
 * Initializes and returns the singleton connection pool for Neon PostgreSQL
 */
function getPool() {
  const config = getValidatedConfig();
  if (!config.isConfigured) {
    throw new Error('[NeonDB] Cannot initialize pool: DATABASE_URL is not set in environment.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.pooledUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    });

    pool.on('error', (err) => {
      console.error('[NeonDB] Unexpected pool error on idle client:', err.message);
    });
  }

  return pool;
}

/**
 * Performs a read-only health and connectivity check on the POOLED connection.
 * Query: SELECT 1
 */
async function checkPooledHealth() {
  const config = getValidatedConfig();
  if (!config.isConfigured) {
    return { ok: false, error: 'DATABASE_URL is not configured.' };
  }

  const start = Date.now();
  const activePool = getPool();

  try {
    const res = await activePool.query(`
      SELECT 
        1 AS alive, 
        current_database() AS database_name, 
        version() AS pg_version,
        current_user AS current_user,
        inet_server_addr() AS server_addr;
    `);

    const latencyMs = Date.now() - start;
    const row = res.rows[0];

    return {
      ok: true,
      connectionType: 'pooled',
      database: row.database_name,
      user: row.current_user,
      version: row.pg_version.split(' on ')[0],
      latencyMs
    };
  } catch (err) {
    return {
      ok: false,
      connectionType: 'pooled',
      error: err.message
    };
  }
}

/**
 * Performs a read-only connectivity check on the DIRECT / UNPOOLED connection.
 * Query: SELECT 1
 */
async function checkDirectHealth() {
  const config = getValidatedConfig();
  if (!config.directUrl) {
    return { ok: false, error: 'DATABASE_URL_UNPOOLED is not configured.' };
  }

  const start = Date.now();
  const client = new Client({
    connectionString: config.directUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT 
        1 AS alive, 
        current_database() AS database_name, 
        version() AS pg_version,
        current_user AS current_user;
    `);
    const latencyMs = Date.now() - start;
    const row = res.rows[0];
    await client.end();

    return {
      ok: true,
      connectionType: 'direct_unpooled',
      database: row.database_name,
      user: row.current_user,
      version: row.pg_version.split(' on ')[0],
      latencyMs
    };
  } catch (err) {
    try { await client.end(); } catch (_) {}
    return {
      ok: false,
      connectionType: 'direct_unpooled',
      error: err.message
    };
  }
}

/**
 * Verifies that the public schema contains zero application tables.
 * Strict Phase 1A Requirement: Database must remain clean/empty.
 */
async function verifyTableCount() {
  const activePool = getPool();
  const res = await activePool.query(`
    SELECT count(*)::int AS count 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  return res.rows[0].count;
}

/**
 * Closes the connection pool gracefully
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getValidatedConfig,
  getPool,
  checkPooledHealth,
  checkDirectHealth,
  verifyTableCount,
  close
};
