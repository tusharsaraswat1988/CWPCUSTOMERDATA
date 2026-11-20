const { Pool, Client } = require('pg');

async function preflight() {
  console.log('=== PHASE 1D PRE-FLIGHT VERIFICATION ===');

  const pooledUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DATABASE_URL_UNPOOLED;

  if (!pooledUrl || !directUrl) {
    throw new Error('Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment');
  }

  const u = new URL(pooledUrl);
  console.log('Target Host:', u.host);
  console.log('Target Database Path:', u.pathname);

  if (u.pathname !== '/cwp_customer_db') {
    throw new Error(`CRITICAL ABORT: Expected /cwp_customer_db but found ${u.pathname}`);
  }

  // 1. Verify cwp_customer_db
  const pool = new Pool({ connectionString: pooledUrl, ssl: { rejectUnauthorized: false } });
  const res = await pool.query(`
    SELECT 
      current_database() AS db_name,
      current_user AS db_user,
      version() AS pg_version,
      inet_server_addr() AS server_addr;
  `);

  const row = res.rows[0];
  console.log('\n[cwp_customer_db Identity Check]');
  console.log('  Database Name:', row.db_name);
  console.log('  Database User:', row.db_user);
  console.log('  PostgreSQL Version:', row.pg_version.split(' on ')[0]);

  if (row.db_name !== 'cwp_customer_db') {
    throw new Error(`CRITICAL ABORT: Connected to ${row.db_name} instead of cwp_customer_db`);
  }

  const tablesRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.log('  Current Public Table Count:', tablesRes.rows.length);

  if (tablesRes.rows.length !== 0) {
    throw new Error(`CRITICAL ABORT: Expected 0 tables in public schema but found ${tablesRes.rows.length}`);
  }

  await pool.end();

  // 2. Verify preserved neondb is intact
  const oldPooledUrl = pooledUrl.replace('/cwp_customer_db', '/neondb');
  const oldPool = new Pool({ connectionString: oldPooledUrl, ssl: { rejectUnauthorized: false } });
  const oldRes = await oldPool.query(`
    SELECT count(*)::int AS count 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  console.log('\n[Preserved neondb Safety Check]');
  console.log('  neondb Public Table Count:', oldRes.rows[0].count);
  if (oldRes.rows[0].count !== 132) {
    throw new Error(`CRITICAL WARNING: neondb table count is ${oldRes.rows[0].count}, expected 132`);
  }
  await oldPool.end();

  console.log('\n=== PRE-FLIGHT VERIFICATION PASSED: TARGET IS CLEAN AND VERIFIED ===');
}

preflight().catch(err => {
  console.error('\nPRE-FLIGHT FAILED:', err.message);
  process.exit(1);
});
