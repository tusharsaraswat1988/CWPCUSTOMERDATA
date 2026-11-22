/**
 * =========================================================================
 * QA TEST SUITE: DATABASE CONNECTION RESOLVER & DYNAMIC DB NAME SUPPORT
 * =========================================================================
 */

const assert = require('assert');
const { resolveDatabaseConfig } = require('../db/connectionResolver');
const db = require('../db/index');

console.log('===============================================================');
console.log('🚀 RUNNING CONNECTION RESOLVER & DYNAMIC DB TESTS');
console.log('===============================================================\n');

// 1. Neon Pooled URL (Automatic Direct URL Derivation)
console.log('--- Test 1: Neon Pooled URL Auto-Derivation ---');
const neonPooled = 'postgresql://user:pass@ep-cool-cloud-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
const res1 = resolveDatabaseConfig(neonPooled);

assert.strictEqual(res1.isConfigured, true, 'Should be configured');
assert.strictEqual(res1.isNeon, true, 'Should detect Neon');
assert.strictEqual(res1.isPooled, true, 'Should detect pooled host');
assert.strictEqual(res1.databaseName, 'neondb', 'Should extract databaseName neondb');
assert.strictEqual(res1.pooledUrl, neonPooled, 'Pooled URL matches input');
assert.strictEqual(
  res1.directUrl,
  'postgresql://user:pass@ep-cool-cloud-123456.us-east-2.aws.neon.tech/neondb?sslmode=require',
  'Should derive direct URL by removing -pooler'
);
console.log('✅ PASS 1: Neon Pooled URL auto-derives Direct URL with -pooler removed.');

// 2. Neon Direct URL (Automatic Pooled URL Derivation)
console.log('\n--- Test 2: Neon Direct URL Auto-Derivation ---');
const neonDirect = 'postgresql://user:pass@ep-cool-cloud-123456.us-east-2.aws.neon.tech/production_db?sslmode=require';
const res2 = resolveDatabaseConfig(neonDirect);

assert.strictEqual(res2.isConfigured, true, 'Should be configured');
assert.strictEqual(res2.isNeon, true, 'Should detect Neon');
assert.strictEqual(res2.isPooled, false, 'Should detect direct host');
assert.strictEqual(res2.databaseName, 'production_db', 'Should extract databaseName production_db');
assert.strictEqual(res2.directUrl, neonDirect, 'Direct URL matches input');
assert.strictEqual(
  res2.pooledUrl,
  'postgresql://user:pass@ep-cool-cloud-123456-pooler.us-east-2.aws.neon.tech/production_db?sslmode=require',
  'Should derive pooled URL by inserting -pooler'
);
console.log('✅ PASS 2: Neon Direct URL auto-derives Pooled URL with -pooler inserted.');

// 3. Dynamic Database Names (Portability test)
console.log('\n--- Test 3: Dynamic Database Name Support (Zero Hardcoding) ---');
const customNames = ['cwp_customer_db', 'neondb', 'prod_v2', 'test_branch', 'postgres'];
for (const name of customNames) {
  const url = `postgresql://owner:secret@ep-demo-pooler.eu-central-1.aws.neon.tech/${name}?sslmode=require`;
  const res = resolveDatabaseConfig(url);
  assert.strictEqual(res.databaseName, name, `Expected databaseName ${name}`);
}
console.log('✅ PASS 3: Arbitrary database names supported dynamically without artificial guard blocks.');

// 4. Non-Neon Database (AWS RDS / Supabase / Localhost)
console.log('\n--- Test 4: Provider-Agnostic Non-Neon URLs ---');
const rdsUrl = 'postgresql://dbadmin:password@mydb.c39xyz.us-east-1.rds.amazonaws.com:5432/production';
const res4 = resolveDatabaseConfig(rdsUrl);

assert.strictEqual(res4.isConfigured, true, 'Should be configured');
assert.strictEqual(res4.isNeon, false, 'Should detect non-Neon');
assert.strictEqual(res4.databaseName, 'production', 'Should extract production');
assert.strictEqual(res4.pooledUrl, rdsUrl, 'Pooled URL matches input');
assert.strictEqual(res4.directUrl, rdsUrl, 'Direct URL matches input without modification');
console.log('✅ PASS 4: Non-Neon PostgreSQL URLs work out of the box with zero errors.');

// 5. Optional Explicit Unpooled Override
console.log('\n--- Test 5: Explicit Unpooled Override ---');
const customDirect = 'postgresql://override:pass@ep-override.us-east-2.aws.neon.tech/custom_db?sslmode=require';
const res5 = resolveDatabaseConfig(neonPooled, customDirect);

assert.strictEqual(res5.pooledUrl, neonPooled, 'Pooled URL remains as given');
assert.strictEqual(res5.directUrl, customDirect, 'Direct URL uses explicit override');
console.log('✅ PASS 5: Explicit unpooled override takes precedence if supplied.');

// 6. Error & Safety Handling
console.log('\n--- Test 6: Safety & Error Handling ---');
const emptyRes = resolveDatabaseConfig('');
assert.strictEqual(emptyRes.isConfigured, false, 'Empty URL is not configured');

const badProto = resolveDatabaseConfig('http://localhost:5432/mydb');
assert.strictEqual(badProto.isConfigured, false, 'Non-postgres URL is rejected');
console.log('✅ PASS 6: Empty strings and invalid protocols handled safely.');

// 7. db/index.js Exports & Live Resolution
console.log('\n--- Test 7: db/index.js Integration ---');
assert.strictEqual(typeof db.resolveDatabaseConfig, 'function', 'resolveDatabaseConfig exported');
assert.strictEqual(typeof db.isConfigured, 'function', 'isConfigured exported');
console.log('✅ PASS 7: db module correctly integrates connectionResolver.');

console.log('\n===============================================================');
console.log('🎉 ALL 7 CONNECTION RESOLVER TESTS PASSED CLEANLY (100%)!');
console.log('===============================================================\n');
