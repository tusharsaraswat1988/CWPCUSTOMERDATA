const neon = require('../neon-db.js');

async function test() {
  console.log('=== Neon PostgreSQL Phase 1A Verification ===');
  
  // 1. Check Pooled Connection
  console.log('[1/3] Testing Pooled Connection (DATABASE_URL)...');
  const pooled = await neon.checkPooledHealth();
  console.log('Pooled Status:', pooled.ok ? 'SUCCESS' : 'FAILED');
  if (pooled.ok) {
    console.log('  Database:', pooled.database);
    console.log('  User:', pooled.user);
    console.log('  PostgreSQL Version:', pooled.version);
    console.log('  Latency:', pooled.latencyMs, 'ms');
  } else {
    console.error('  Error:', pooled.error);
  }

  // 2. Check Direct Unpooled Connection
  console.log('\n[2/3] Testing Direct Connection (DATABASE_URL_UNPOOLED)...');
  const direct = await neon.checkDirectHealth();
  console.log('Direct Status:', direct.ok ? 'SUCCESS' : 'FAILED');
  if (direct.ok) {
    console.log('  Database:', direct.database);
    console.log('  User:', direct.user);
    console.log('  PostgreSQL Version:', direct.version);
    console.log('  Latency:', direct.latencyMs, 'ms');
  } else {
    console.error('  Error:', direct.error);
  }

  // 3. Check Table Count
  console.log('\n[3/3] Inspecting Public Schema Table Count...');
  const tableCount = await neon.verifyTableCount();
  console.log('Total Tables in Public Schema:', tableCount);

  await neon.close();
  console.log('\n=== Verification Complete ===');
}

test().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
