/**
 * =========================================================================
 * CWP DATA APP - NEON POSTGRESQL DATABASE ACCESS LAYER
 * Target Database: cwp_customer_db (PostgreSQL 18.7)
 * Architecture Spec: docs/architecture/CWP_DATA_APP_DATABASE_ARCHITECTURE_v2.1.1.md
 * =========================================================================
 */

const { Pool, Client } = require('pg');
const { resolveDatabaseConfig } = require('./connectionResolver');

let pool = null;

function getValidatedConfig() {
  const config = resolveDatabaseConfig(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
  if (!config.isConfigured) {
    throw new Error(`[Database] CRITICAL: ${config.error}`);
  }

  // If USE_UNPOOLED is explicitly requested, allow overriding pooled connection
  const effectivePooledUrl = (process.env.USE_UNPOOLED === 'true' && config.directUrl) ? config.directUrl : config.pooledUrl;

  return {
    pooledUrl: effectivePooledUrl,
    directUrl: config.directUrl,
    databaseName: config.databaseName,
    isNeon: config.isNeon,
    isPooled: config.isPooled,
    host: config.host
  };
}

function getPool() {
  if (!pool) {
    const config = getValidatedConfig();
    pool = new Pool({
      connectionString: config.pooledUrl,
      ssl: { rejectUnauthorized: process.env.ALLOW_INSECURE_DB_SSL === 'true' ? false : true },
      max: 10,
      connectionTimeoutMillis: 30000,
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
  resolveDatabaseConfig,
  isConfigured: () => resolveDatabaseConfig().isConfigured,
  getPool,
  query,
  getClient,
  withTransaction,
  healthCheck,
  close
};
