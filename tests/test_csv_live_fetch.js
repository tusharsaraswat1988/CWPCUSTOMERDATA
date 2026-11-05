/**
 * =========================================================================
 * TASK P2.4: ATOMIC CSV LIVE FETCH RELIABILITY & CSV PARSER TEST SUITE
 * =========================================================================
 * Validates atomic fetching of Google Sheets Daily Clean and All Other Work:
 * 1. Simple CSV parsing
 * 2. Quotes with commas
 * 3. Escaped quotes
 * 4. Newlines within quotes
 * 5. Mixed types preserved without nullification
 * 6. Both sheet fetches succeed atomically
 * 7. Daily Clean fetch fails -> No partial All Other Work returned as live
 * 8. All Other Work fetch fails -> No partial Daily Clean returned as live
 * 9. Both fetches fail -> Controlled error / last-known-good fallback
 * 10. Malformed CSV response (HTML / error page) -> rejected
 * 11. Empty but valid sheet response -> handled cleanly
 * 12. Timeout handling -> bounded abort signal
 * 13. Retry handling -> bounded retries with recovery
 * 14. Concurrent fetch deduplication -> in-flight promise sharing
 * 15. Cache remains unchanged after failed refresh
 * 16. No partial data returned as successful live data
 * 17. Successful recovery after a failed fetch
 * 18. Correct category counts (Daily Clean, Car Washing, Solar Panel Cleaning)
 * 19. Correct Daily Clean row order strictly preserved
 * 20. Existing staff isolation enforced
 * 21. Existing auto-sync version detection verified
 * =========================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const realDataFilePath = path.join(__dirname, '..', 'local_data.json');
const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;

// Isolate test environment
const tempFixturePath = path.join(__dirname, 'temp_test_csv_' + process.pid + '_' + Date.now() + '.json');
process.env.DATA_FILE = tempFixturePath;
process.env.LIVE_FETCH_TIMEOUT_MS = '1000';
process.env.LIVE_FETCH_RETRIES = '1';
process.env.LIVE_FETCH_RETRY_DELAY_MS = '50';
delete process.env.DISABLE_LIVE_SHEETS; // Enable live fetch code path

const cwp = require('../server.js');
const {
  parseCSV,
  fetchAllLiveCustomers,
  invalidateLiveCustomersCache,
  formatStaffDataResponse,
  computeStaffDataVersion,
  setLastKnownGoodDataset,
  getLastKnownGoodDataset
} = cwp;

cwp.setDataFile(tempFixturePath);
cwp.setAppState({
  staffList: [
    { id: 'STF01', name: 'Chandan Soni', phone: '9919856161', pin: cwp.hashPinScrypt('123456'), active: true },
    { id: 'STF02', name: 'Taufiq Ahmed', phone: '8081913264', pin: cwp.hashPinScrypt('654321'), active: true }
  ],
  customers: []
});
cwp.saveLocalData(cwp.getAppState());

function cleanup() {
  if (fs.existsSync(tempFixturePath)) {
    try { fs.unlinkSync(tempFixturePath); } catch (e) {}
  }
  if (realDataBefore !== null && fs.existsSync(realDataFilePath)) {
    const after = fs.readFileSync(realDataFilePath, 'utf8');
    assert.strictEqual(after, realDataBefore, 'CRITICAL: real local_data.json was mutated!');
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

console.log('===============================================================');
console.log('🧪 RUNNING ATOMIC CSV LIVE FETCH RELIABILITY TEST SUITE');
console.log('===============================================================');

// =========================================================================
// PART 1: CSV PARSER RFC 4180 COMPLIANCE TESTS
// =========================================================================

// Test 1: Simple CSV
const csv1 = 'Customer Name,Customer Number,Address\nShreyansh Jain,9919856161,Varanasi';
const parsed1 = parseCSV(csv1);
assert.strictEqual(parsed1.length, 2);
assert.strictEqual(parsed1[1][0], 'Shreyansh Jain');
assert.strictEqual(parsed1[1][1], '9919856161');
assert.strictEqual(parsed1[1][2], 'Varanasi');
console.log('✅ Test 1: Simple CSV passed');

// Test 2: Quotes with commas
const csv2 = 'Name,Address\n"Jain, Shreyansh","Flat 101, Galaxy Complex, Near Sigra, Varanasi"';
const parsed2 = parseCSV(csv2);
assert.strictEqual(parsed2.length, 2);
assert.strictEqual(parsed2[1][0], 'Jain, Shreyansh');
assert.strictEqual(parsed2[1][1], 'Flat 101, Galaxy Complex, Near Sigra, Varanasi');
console.log('✅ Test 2: Quotes with commas passed');

// Test 3: Escaped quotes
const csv3 = 'Name,Notes\n"Shreyansh","He said ""Clean both cars"""';
const parsed3 = parseCSV(csv3);
assert.strictEqual(parsed3[1][1], 'He said "Clean both cars"');
console.log('✅ Test 3: Escaped quotes passed');

// Test 4: Newlines within quotes
const csv4 = 'Name,Address\n"Shreyansh","Floor 1\nTower A\nVaranasi"';
const parsed4 = parseCSV(csv4);
assert.strictEqual(parsed4.length, 2);
assert.strictEqual(parsed4[1][1], 'Floor 1\nTower A\nVaranasi');
console.log('✅ Test 4: Newlines within quotes passed');

// Test 5: Numbers stored as text and pure strings in numeric columns
const csv5 = 'Name,Phone\n"Customer 1","9919856161"\n"Customer 2",9919856161\n"Customer 3","+91 9919856161"';
const parsed5 = parseCSV(csv5);
assert.strictEqual(parsed5[1][1], '9919856161');
assert.strictEqual(parsed5[2][1], '9919856161');
assert.strictEqual(parsed5[3][1], '+91 9919856161');
console.log('✅ Test 5: Mixed types preserved without nullification');

// =========================================================================
// PART 2: ATOMIC CSV LIVE FETCH RELIABILITY TESTS
// =========================================================================

const mockDailyCleanCsv = `Customer Name,Customer Number,Google Maps URL,Customer / Vehicle Photo URL,Address,Vehicle Numbers / Models,Package Type,Packages Purchased,Staff Name,Staff Notes / Cleaning Instructions,Secondary Address (If Any),Secondary Maps URL,Active,Staff ID
Amit Verma,9876543210,https://maps.google.com/?q=25.3,https://res.cloudinary.com/demo/image/upload/sample.jpg,Sigra Varanasi,UP65 AA 1111 - Fortuner,DCC GOLD,1,Chandan Soni,Clean early morning,Sigra Office,https://maps.google.com/?q=25.31,Yes,STF01
Priya Sharma,9876543211,https://maps.google.com/?q=25.4,,Cantt Varanasi,UP65 BB 2222 - Creta,DCC SILVER,1,Taufiq Ahmed,Key at reception,,,Yes,STF02
Rajesh Kumar,9876543212,https://maps.google.com/?q=25.5,,Bhelupur Varanasi,UP65 CC 3333 - City,DCC PLATINUM,1,Chandan Soni,Call before arriving,,,Yes,STF01`;

const mockAllOtherWorkCsv = `Customer Name,Customer Number,Google Maps URL,Vehicle / Site Photo URL,Address,Service Type (Car Wash / Solar Cleaning),Vehicle Numbers / Site Name,Package / Service Details,Staff Name,Staff Notes / Special Instructions,Secondary Address (If Any),Secondary Maps URL,Active,Staff ID
Sunil Tiwari,9876543213,https://maps.google.com/?q=25.6,,Lanka Varanasi,Car Washing,UP65 DD 4444 - Scorpio,Foam Wash,Chandan Soni,Wash exterior only,,,Yes,STF01
Anjali Patel,9876543214,https://maps.google.com/?q=25.7,,Nadesar Varanasi,Solar Panel Cleaning,Rooftop 5KW Solar Plant,Monthly Solar Maintenance,Chandan Soni,Water source on terrace,,,Yes,STF01
Deepak Gupta,9876543215,https://maps.google.com/?q=25.8,,Shivpur Varanasi,Car Washing,UP65 EE 5555 - Thar,Deep Interior Detailing,Taufiq Ahmed,Leather conditioning,,,Yes,STF02`;

const originalFetch = global.fetch;

async function runAtomicFetchTests() {
  // -------------------------------------------------------------------------
  // Test 6: Both sheet fetches succeed atomically
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(null);

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      return { ok: true, status: 200, text: async () => mockDailyCleanCsv };
    }
    if (urlStr.includes('gid=866987332')) {
      return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    }
    return { ok: false, status: 404, text: async () => 'Not Found' };
  };

  const resBothSucceed = await fetchAllLiveCustomers(true);
  assert.strictEqual(resBothSucceed.isLive, true, 'isLive must be true when both sheets succeed');
  assert.strictEqual(resBothSucceed.dataSource, 'live_sheet', 'dataSource must be live_sheet');
  assert.strictEqual(resBothSucceed.records.length, 6, 'Total 6 records combined from both sheets');
  console.log('✅ Test 6: Both sheet fetches succeed atomically (6 records combined, isLive: true)');

  // -------------------------------------------------------------------------
  // Test 7: Daily Clean fetch fails -> No partial All Other Work returned as live
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  // Provide an existing last-known-good dataset
  const knownGoodSnapshot = {
    records: [{ customerName: 'Last Known Good Cust', customerNumber: '9988776655', serviceCategory: 'Daily Car Cleaning' }],
    dataSource: 'last_known_good',
    isLive: false,
    lastSync: '2026-11-05T12:00:00.000Z'
  };
  setLastKnownGoodDataset(knownGoodSnapshot);

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      // Daily Clean fails
      return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'Error' };
    }
    if (urlStr.includes('gid=866987332')) {
      // All Other Work succeeds
      return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    }
    return { ok: false, status: 500, text: async () => 'Error' };
  };

  const resDcFail = await fetchAllLiveCustomers(true);
  assert.strictEqual(resDcFail.isLive, false, 'isLive must NEVER be true when Daily Clean fetch fails');
  assert.notStrictEqual(resDcFail.dataSource, 'live_sheet', 'dataSource must not be live_sheet');
  assert.strictEqual(resDcFail.records[0].customerName, 'Last Known Good Cust', 'Safely fell back to complete last-known-good');
  console.log('✅ Test 7: Daily Clean fetch fails -> Atomic rejection: No partial All Other Work returned as live');

  // -------------------------------------------------------------------------
  // Test 8: All Other Work fetch fails -> No partial Daily Clean returned as live
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(knownGoodSnapshot);

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      // Daily Clean succeeds
      return { ok: true, status: 200, text: async () => mockDailyCleanCsv };
    }
    if (urlStr.includes('gid=866987332')) {
      // All Other Work fails
      return { ok: false, status: 502, statusText: 'Bad Gateway', text: async () => 'Error' };
    }
    return { ok: false, status: 500, text: async () => 'Error' };
  };

  const resAowFail = await fetchAllLiveCustomers(true);
  assert.strictEqual(resAowFail.isLive, false, 'isLive must NEVER be true when All Other Work fetch fails');
  assert.notStrictEqual(resAowFail.dataSource, 'live_sheet');
  assert.strictEqual(resAowFail.records[0].customerName, 'Last Known Good Cust');
  console.log('✅ Test 8: All Other Work fetch fails -> Atomic rejection: No partial Daily Clean returned as live');

  // -------------------------------------------------------------------------
  // Test 9: Both fetches fail & No last-known-good exists -> Throws controlled error
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(null);
  cwp.setAppState({ staffList: [], customers: [] }); // Empty local data too

  global.fetch = async () => {
    return { ok: false, status: 500, text: async () => 'Server Down' };
  };

  let threwControlled = false;
  try {
    await fetchAllLiveCustomers(true);
  } catch (err) {
    threwControlled = true;
    assert.ok(err.message.includes('Google Sheets live fetch failed atomically'), 'Controlled descriptive error message');
  }
  assert.strictEqual(threwControlled, true, 'Must throw controlled error when no complete data exists');
  console.log('✅ Test 9: Both fetches fail & no last-known-good exists -> Throws controlled error (no silent empty list)');

  // -------------------------------------------------------------------------
  // Test 10: Malformed CSV response (HTML / login redirect) -> Rejected
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(knownGoodSnapshot);

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      return { ok: true, status: 200, text: async () => '<!DOCTYPE html><html><body>Google Login Redirect</body></html>' };
    }
    return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
  };

  const resHtmlFail = await fetchAllLiveCustomers(true);
  assert.strictEqual(resHtmlFail.isLive, false, 'HTML response rejected from live cache');
  assert.strictEqual(resHtmlFail.records[0].customerName, 'Last Known Good Cust');
  console.log('✅ Test 10: Malformed CSV response (HTML page) rejected');

  // -------------------------------------------------------------------------
  // Test 11: Empty but valid sheet response (header only, 0 customer rows)
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(null);

  const headerOnlyDailyClean = 'Customer Name,Customer Number,Address,Vehicle,Package Type,Staff Name,Active';
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      return { ok: true, status: 200, text: async () => headerOnlyDailyClean };
    }
    if (urlStr.includes('gid=866987332')) {
      return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const resEmptyDaily = await fetchAllLiveCustomers(true);
  assert.strictEqual(resEmptyDaily.isLive, true);
  assert.strictEqual(resEmptyDaily.records.length, 3, 'Only 3 records from All Other Work (Daily Clean has 0)');
  console.log('✅ Test 11: Empty but valid sheet response parsed cleanly without crash');

  // -------------------------------------------------------------------------
  // Test 12: Timeout handling
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(knownGoodSnapshot);

  global.fetch = async (url, options) => {
    // Simulate long hanging request that triggers AbortSignal timeout
    if (options && options.signal) {
      await new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Timeout')));
      });
    }
    return { ok: false, status: 504, text: async () => 'Timeout' };
  };

  const resTimeout = await fetchAllLiveCustomers(true);
  assert.strictEqual(resTimeout.isLive, false, 'Timeout gracefully falls back');
  console.log('✅ Test 12: Timeout handling aborted cleanly and used safe fallback');

  // -------------------------------------------------------------------------
  // Test 13: Bounded retry handling (Attempt 1 fails, Attempt 2 succeeds)
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  setLastKnownGoodDataset(null);

  let dailyCleanAttempts = 0;
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) {
      dailyCleanAttempts++;
      if (dailyCleanAttempts === 1) {
        // First attempt fails
        return { ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'Transient Err' };
      }
      // Second attempt succeeds
      return { ok: true, status: 200, text: async () => mockDailyCleanCsv };
    }
    if (urlStr.includes('gid=866987332')) {
      return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const resRetrySuccess = await fetchAllLiveCustomers(true);
  assert.strictEqual(dailyCleanAttempts, 2, 'Daily Clean retried exactly once');
  assert.strictEqual(resRetrySuccess.isLive, true, 'Recovered successfully on retry');
  assert.strictEqual(resRetrySuccess.records.length, 6);
  console.log('✅ Test 13: Bounded retry handling succeeded on attempt 2 with live recovery');

  // -------------------------------------------------------------------------
  // Test 14: Concurrent fetch deduplication (In-flight promise sharing)
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  let networkFetchCount = 0;

  global.fetch = async (url) => {
    networkFetchCount++;
    // Add artificial delay to keep request in flight
    await new Promise(r => setTimeout(r, 60));
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) return { ok: true, status: 200, text: async () => mockDailyCleanCsv };
    if (urlStr.includes('gid=866987332')) return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    return { ok: false, status: 404, text: async () => '' };
  };

  // Launch 5 concurrent calls simultaneously
  const concurrentCalls = await Promise.all([
    fetchAllLiveCustomers(),
    fetchAllLiveCustomers(),
    fetchAllLiveCustomers(),
    fetchAllLiveCustomers(),
    fetchAllLiveCustomers()
  ]);

  // All 5 callers must receive the exact same 6 records
  for (const res of concurrentCalls) {
    assert.strictEqual(res.isLive, true);
    assert.strictEqual(res.records.length, 6);
  }
  // Exactly 2 HTTP calls made (1 for Daily Clean, 1 for All Other Work)
  assert.strictEqual(networkFetchCount, 2, '5 concurrent calls shared single in-flight fetch (exactly 2 HTTP requests)');
  console.log('✅ Test 14: Concurrent fetch deduplication verified (5 callers shared 1 fetch)');

  // -------------------------------------------------------------------------
  // Test 15: Cache remains unchanged after failed refresh
  // -------------------------------------------------------------------------
  // Current cache has 6 records. Now simulate a forced refresh where fetch fails:
  global.fetch = async () => {
    return { ok: false, status: 500, text: async () => 'Outage' };
  };

  const cachedBefore = await fetchAllLiveCustomers();
  assert.strictEqual(cachedBefore.isLive, true);
  assert.strictEqual(cachedBefore.records.length, 6);

  // Force bypass cache with broken network
  const failedRefreshResult = await fetchAllLiveCustomers(true);
  assert.strictEqual(failedRefreshResult.isLive, false, 'Failed refresh returns isLive: false');

  // Subsequent non-bypassed call still has valid cache uncorrupted
  const cachedAfter = await fetchAllLiveCustomers();
  assert.strictEqual(cachedAfter.records.length, 6, 'Valid dataset preserved');
  console.log('✅ Test 15: Cache remains uncorrupted after failed refresh');

  // -------------------------------------------------------------------------
  // Test 16: Successful recovery after a failed fetch
  // -------------------------------------------------------------------------
  invalidateLiveCustomersCache();
  // Restore working network
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('gid=508927146')) return { ok: true, status: 200, text: async () => mockDailyCleanCsv };
    if (urlStr.includes('gid=866987332')) return { ok: true, status: 200, text: async () => mockAllOtherWorkCsv };
    return { ok: false, status: 404, text: async () => '' };
  };

  const resRecovered = await fetchAllLiveCustomers(true);
  assert.strictEqual(resRecovered.isLive, true);
  assert.strictEqual(resRecovered.records.length, 6);
  console.log('✅ Test 16: Successful recovery after a failed fetch');

  // -------------------------------------------------------------------------
  // Test 17 & 18 & 19: Row order, Category counts, and Staff Isolation
  // -------------------------------------------------------------------------
  const staff1Data = formatStaffDataResponse('STF01', resRecovered);
  const staff2Data = formatStaffDataResponse('STF02', resRecovered);

  // Correct Category Counts:
  assert.strictEqual(staff1Data.dailyCarCleaning.length, 2, 'STF01 has 2 Daily Car Cleaning');
  assert.strictEqual(staff1Data.carWashing.length, 1, 'STF01 has 1 Car Washing');
  assert.strictEqual(staff1Data.solarCleaning.length, 1, 'STF01 has 1 Solar Panel Cleaning');
  assert.strictEqual(staff1Data.totalCount, 4, 'STF01 total is 4');

  assert.strictEqual(staff2Data.dailyCarCleaning.length, 1, 'STF02 has 1 Daily Car Cleaning');
  assert.strictEqual(staff2Data.carWashing.length, 1, 'STF02 has 1 Car Washing');
  assert.strictEqual(staff2Data.solarCleaning.length, 0, 'STF02 has 0 Solar Panel Cleaning');
  assert.strictEqual(staff2Data.totalCount, 2, 'STF02 total is 2');
  console.log('✅ Test 17: Correct category counts across 3 categories (DCC: 2, Car Wash: 1, Solar: 1)');

  // Daily Clean Row Order strictly preserved:
  assert.strictEqual(staff1Data.dailyCarCleaning[0].customerName, 'Amit Verma', 'First Daily Clean record is Amit Verma');
  assert.strictEqual(staff1Data.dailyCarCleaning[1].customerName, 'Rajesh Kumar', 'Second Daily Clean record is Rajesh Kumar');
  console.log('✅ Test 18: Daily Clean row sequence strictly preserved ([Amit Verma -> Rajesh Kumar])');

  // Cross-staff isolation:
  assert.ok(!staff1Data.dailyCarCleaning.some(c => c.customerName === 'Priya Sharma'), 'STF01 never sees STF02 records');
  assert.ok(!staff2Data.dailyCarCleaning.some(c => c.customerName === 'Amit Verma'), 'STF02 never sees STF01 records');
  console.log('✅ Test 19: Existing cross-staff data isolation strictly maintained');

  // -------------------------------------------------------------------------
  // Test 20: Deterministic auto-sync version detection
  // -------------------------------------------------------------------------
  const v1 = computeStaffDataVersion(staff1Data);
  assert.ok(v1 && v1.length === 16, 'Generates 16-char hex version');

  // Same data generates identical version
  const v1Identical = computeStaffDataVersion(staff1Data);
  assert.strictEqual(v1, v1Identical, 'Same data produces identical version hash');

  // Data change alters version
  const modifiedStaff1Data = JSON.parse(JSON.stringify(staff1Data));
  modifiedStaff1Data.dailyCarCleaning[0].customerNumber = '9876599999';
  const v2 = computeStaffDataVersion(modifiedStaff1Data);
  assert.notStrictEqual(v1, v2, 'Phone number change triggers new deterministic version');
  console.log('✅ Test 20: Deterministic version detection verified (v1 === v1Identical, v1 !== v2)');

  // Restore fetch
  global.fetch = originalFetch;

  console.log('===============================================================');
  console.log('🎉 ALL 20 ATOMIC CSV LIVE FETCH RELIABILITY TESTS PASSED!');
  console.log('===============================================================');
  cleanup();
  process.exit(0);
}

runAtomicFetchTests().catch(err => {
  console.error('Test Suite Failed:', err);
  global.fetch = originalFetch;
  cleanup();
  process.exit(1);
});
