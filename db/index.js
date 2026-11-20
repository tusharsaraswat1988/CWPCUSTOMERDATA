/**
 * =========================================================================
 * CWP DATA APP - NEON POSTGRESQL DATABASE ACCESS LAYER
 * Target Database: cwp_customer_db (PostgreSQL 18.7)
 * Architecture Spec: docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md
 * =========================================================================
 */

const { Pool, Client } = require('pg');

let pool = null;

function getValidatedConfig() {
  const pooledUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();

  if (!pooledUrl) {
    throw new Error('[Database] CRITICAL: DATABASE_URL is not set in environment.');
  }

  // Strict Safety Guard: Never connect to neondb or wrong target database!
  try {
    const parsed = new URL(pooledUrl);
    const dbName = parsed.pathname.replace(/^\//, '');
    if (dbName !== 'cwp_customer_db') {
      throw new Error(`[Database] CRITICAL SAFETY ABORT: Attempting to connect to database '${dbName}' instead of 'cwp_customer_db'.`);
    }
  } catch (err) {
    if (err.message.includes('SAFETY ABORT')) throw err;
    throw new Error(`[Database] Invalid DATABASE_URL format: ${err.message}`);
  }

  return {
    pooledUrl,
    directUrl: directUrl || pooledUrl
  };
}

function getPool() {
  if (!pool) {
    const config = getValidatedConfig();
    pool = new Pool({
      connectionString: config.pooledUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    });

    pool.on('error', (err) => {
      console.error('[Database Pool Error]:', err.message);
    });
  }
  return pool;
}

/**
 * Execute a parameterized query against the connection pool
 */
async function query(text, params = []) {
  const p = getPool();
  return p.query(text, params);
}

/**
 * Acquire a dedicated client from the pool
 */
async function getClient() {
  const p = getPool();
  return p.connect();
}

/**
 * Execute a series of operations in a single database transaction
 */
async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('[Database] Rollback error:', rbErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Comprehensive health check for application runtime
 */
async function healthCheck() {
  try {
    const res = await query(`
      SELECT 
        1 AS alive,
        current_database() AS db_name,
        current_user AS db_user,
        version() AS pg_version,
        NOW() AT TIME ZONE 'Asia/Kolkata' AS ist_time;
    `);
    const row = res.rows[0];
    return {
      healthy: true,
      database: row.db_name,
      user: row.db_user,
      version: row.pg_version.split(' on ')[0],
      istTime: row.ist_time
    };
  } catch (err) {
    return {
      healthy: false,
      error: err.message
    };
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getValidatedConfig,
  getPool,
  query,
  getClient,
  withTransaction,
  healthCheck,
  close
};
