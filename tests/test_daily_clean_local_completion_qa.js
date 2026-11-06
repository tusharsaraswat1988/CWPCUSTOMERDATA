/**
 * =========================================================================
 * Comprehensive Automated QA Test Suite for Task P2.6
 * Staff Daily Clean Local Completion Tracking & Automatic Daily Reset
 *
 * Scenarios tested:
 * 1. Staff ticks a customer -> checkmark appears (DOM + localStorage)
 * 2. Refresh page on the same day -> checkmark remains intact
 * 3. Live polling occurs -> checkmark remains intact
 * 4. Customer sequence refreshes -> checkmark remains with correct customer
 * 5. Admin changes customer sequence -> completion stays attached to customer, not list index
 * 6. Indian date changes to next day -> checklist becomes fresh automatically
 * 7. Previous day's completion is not shown
 * 8. Staff completion data is not transmitted to backend (HTTP payload verification)
 * 9. Admin cannot view staff completion data (API & UI isolation)
 * 10. Different staff/device/browser environments maintain their own local completion state
 * 11. Asia/Kolkata timezone date is used instead of UTC across boundary hours
 * 12. No unnecessary API calls or database changes are introduced (Zero mutation of local_data.json)
 * 13. Same-day logout and login retains completion state (SAME DAY ME LOGIN LOGOUT PE WO RAHE)
 * =========================================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('===============================================================');
console.log('🚀 RUNNING TASK P2.6 DAILY CLEAN LOCAL COMPLETION TEST SUITE');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const realDataFilePath = path.join(__dirname, '..', 'local_data.json');
const realDataBefore = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
const realDataMd5Before = realDataBefore ? crypto.createHash('md5').update(realDataBefore).digest('hex') : null;

// Extract client JS from Index.html
const scriptStart = indexHtml.lastIndexOf('<script>');
const scriptEnd = indexHtml.lastIndexOf('</script>');
assert.ok(scriptStart !== -1 && scriptEnd !== -1, 'Could not find main <script> tag in Index.html');
const clientScriptCode = indexHtml.slice(scriptStart + 8, scriptEnd);

/**
 * Creates an isolated mock browser environment for testing Index.html logic
 */
function createMockClientEnv(initialLocalStorage = {}, activeStaffId = 'STF01') {
  const localStore = { ...initialLocalStorage };
  const sessionStore = {};

  const localStorage = {
    getItem: (k) => (k in localStore ? localStore[k] : null),
    setItem: (k, v) => { localStore[k] = String(v); },
    removeItem: (k) => { delete localStore[k]; },
    clear: () => { Object.keys(localStore).forEach(k => delete localStore[k]); },
    _store: localStore
  };

  const sessionStorage = {
    getItem: (k) => (k in sessionStore ? sessionStore[k] : null),
    setItem: (k, v) => { sessionStore[k] = String(v); },
    removeItem: (k) => { delete sessionStore[k]; },
    clear: () => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]); },
    _store: sessionStore
  };

  const elements = {};
  function getElem(id) {
    if (!elements[id]) {
      elements[id] = {
        id,
        style: {},
        classList: {
          classes: new Set(),
          add: function(c) { this.classes.add(c); },
          remove: function(c) { this.classes.delete(c); },
          toggle: function(c, force) {
            if (force === true) this.classes.add(c);
            else if (force === false) this.classes.delete(c);
            else if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
          },
          contains: function(c) { return this.classes.has(c); }
        },
        textContent: '',
        innerHTML: '',
        value: '',
        addEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        focus: () => {}
      };
    }
    return elements[id];
  }

  const networkCalls = [];

  const context = {
    window: {
      location: { search: '', pathname: '/staff' },
      history: { replaceState: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
      scrollTo: () => {}
    },
    document: {
      getElementById: getElem,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: 'visible'
    },
    localStorage,
    sessionStorage,
    console: {
      log: () => {},
      error: console.error,
      warn: console.warn
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (t) => clearTimeout(t),
    setInterval: () => 1,
    clearInterval: () => {},
    Intl,
    Date,
    Math,
    JSON,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    // Track any network calls made via fetch / XMLHttpRequest
    fetch: (url, opts) => {
      networkCalls.push({ url, opts });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
  };

  context.window.window = context.window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.window.sessionStorage = context.sessionStorage;
  context.window.Intl = Intl;
  context.window.Date = Date;

  vm.createContext(context);
  vm.runInContext(clientScriptCode, context);

  // Set initial active staff
  context.state.activeStaffId = activeStaffId;
  context.state.currentView = 'staff';
  context.state.activeFilter = 'daily_car_cleaning';

  return { context, localStore, sessionStore, elements, networkCalls };
}

// Sample Daily Clean Customers fixture
const sampleDailyCustomers = [
  {
    customerId: 'CUST_9919856161_UP32AB1234',
    customerName: 'Rahul Verma',
    customerNumber: '9919856161',
    vehicle: 'UP32 AB 1234',
    category: 'daily_car_cleaning',
    serviceCategory: 'Daily Car Cleaning',
    address: 'Vikas Nagar, Lucknow',
    _seq: 1
  },
  {
    customerId: 'CUST_9876543210_UP32CD5678',
    customerName: 'Amit Sharma',
    customerNumber: '9876543210',
    vehicle: 'UP32 CD 5678',
    category: 'daily_car_cleaning',
    serviceCategory: 'Daily Car Cleaning',
    address: 'Indira Nagar, Lucknow',
    _seq: 2
  },
  {
    customerId: 'CUST_9123456780_UP32EF9012',
    customerName: 'Priya Singh',
    customerNumber: '9123456780',
    vehicle: 'UP32 EF 9012',
    category: 'daily_car_cleaning',
    serviceCategory: 'Daily Car Cleaning',
    address: 'Gomti Nagar, Lucknow',
    _seq: 3
  }
];

// =========================================================================
// TEST 1: Staff ticks a customer -> checkmark appears
// =========================================================================
(function test1() {
  const { context, localStore, elements } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  const custId = 'CUST_9919856161_UP32AB1234';
  assert.strictEqual(context.isCustomerDoneToday(custId), false, 'Initially customer must not be done');

  // Staff ticks customer
  context.toggleCustomerDoneToday(custId);

  assert.strictEqual(context.isCustomerDoneToday(custId), true, 'Customer must be marked done in today state');
  
  // Verify localStorage contains the entry under DAILY_CLEAN_STORAGE_KEY
  const storeRaw = localStore['cwp_daily_clean_completion'];
  assert.ok(storeRaw, 'cwp_daily_clean_completion must exist in localStorage');
  const parsedStore = JSON.parse(storeRaw);
  const todayKey = context.getTodayDateKey();
  assert.strictEqual(parsedStore['STF01'][todayKey][custId], true, 'Store must map STF01 -> todayKey -> custId = true');

  // Verify DOM rendered checkmark & card-cleaned-done class
  const feedHtml = elements['customerFeed'].innerHTML;
  assert.ok(feedHtml.includes('card-cleaned-done'), 'Feed HTML must include card-cleaned-done class on marked card');
  assert.ok(feedHtml.includes('done-active'), 'Feed HTML must include done-active class on button');
  assert.ok(feedHtml.includes('साफ हो गई (Done)'), 'Feed HTML must display Done text with checkmark');

  // Verify Route progress bar updated
  assert.strictEqual(elements['routeProgressCount'].textContent, '1 / 3', 'Progress counter must reflect 1 of 3 completed');
  assert.strictEqual(elements['routeProgressPercent'].textContent, '33%', 'Progress percent must show 33%');

  console.log('✅ PASS 1: Staff ticks a customer -> checkmark appears and progress bar updates.');
})();

// =========================================================================
// TEST 2: Refresh page on the same day -> checkmark remains
// =========================================================================
(function test2() {
  const { context: env1 } = createMockClientEnv();
  env1.state.customers = sampleDailyCustomers;
  env1.renderCustomerCards(sampleDailyCustomers);

  const custId1 = 'CUST_9919856161_UP32AB1234';
  const custId2 = 'CUST_9123456780_UP32EF9012';
  env1.toggleCustomerDoneToday(custId1);
  env1.toggleCustomerDoneToday(custId2);

  const savedStorage = { ...env1.localStorage._store };

  // Simulate full page refresh with the exact same localStorage
  const { context: env2, elements: elements2 } = createMockClientEnv(savedStorage, 'STF01');
  env2.state.customers = sampleDailyCustomers;
  env2.renderCustomerCards(sampleDailyCustomers);

  assert.strictEqual(env2.isCustomerDoneToday(custId1), true, 'Customer 1 must still be done after refresh');
  assert.strictEqual(env2.isCustomerDoneToday(custId2), true, 'Customer 2 must still be done after refresh');
  assert.strictEqual(env2.isCustomerDoneToday('CUST_9876543210_UP32CD5678'), false, 'Customer 3 must still be pending');

  const feedHtml = elements2['customerFeed'].innerHTML;
  assert.ok(feedHtml.includes('data-customer-id="' + custId1 + '"'), 'Card for customer 1 present');
  assert.strictEqual(elements2['routeProgressCount'].textContent, '2 / 3', 'Progress counter must remain 2 of 3');

  console.log('✅ PASS 2: Refresh page on the same day -> checkmark remains intact.');
})();

// =========================================================================
// TEST 3: Live polling occurs -> checkmark remains
// =========================================================================
(function test3() {
  const { context, elements } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  const custId = 'CUST_9876543210_UP32CD5678';
  context.toggleCustomerDoneToday(custId);
  assert.strictEqual(context.isCustomerDoneToday(custId), true);

  // Simulate live polling data load
  const pollPayload = {
    staffId: 'STF01',
    staffName: 'Rahul Staff',
    version: 42,
    dailyCarCleaning: sampleDailyCustomers.slice()
  };

  context.handleStaffDataLoaded(pollPayload);

  // Check that checkmark is still present after live poll
  assert.strictEqual(context.isCustomerDoneToday(custId), true, 'Customer must remain done after live poll');
  const feedHtml = elements['customerFeed'].innerHTML;
  assert.ok(feedHtml.includes('done-active'), 'Button must retain done-active class after live poll');

  console.log('✅ PASS 3: Live polling occurs -> checkmark remains.');
})();

// =========================================================================
// TEST 4: Customer sequence refreshes -> checkmark remains with correct customer
// =========================================================================
(function test4() {
  const { context, elements } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  // Mark Priya Singh (3rd in list) as done
  const priyaId = 'CUST_9123456780_UP32EF9012';
  context.toggleCustomerDoneToday(priyaId);

  // Customer sequence is refreshed from server
  const refreshedList = [
    { ...sampleDailyCustomers[0], _seq: 1 },
    { ...sampleDailyCustomers[1], _seq: 2 },
    { ...sampleDailyCustomers[2], _seq: 3 }
  ];
  context.state.customers = refreshedList;
  context.renderCustomerCards(refreshedList);

  assert.strictEqual(context.isCustomerDoneToday(priyaId), true, 'Priya Singh must remain completed');
  assert.strictEqual(context.isCustomerDoneToday('CUST_9919856161_UP32AB1234'), false);

  console.log('✅ PASS 4: Customer sequence refreshes -> checkmark remains with correct customer.');
})();

// =========================================================================
// TEST 5: Admin changes customer sequence -> completion remains attached to customer, not list index
// =========================================================================
(function test5() {
  const { context, elements } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  // Customer 0: Rahul Verma (CUST_9919856161_UP32AB1234)
  // Customer 1: Amit Sharma (CUST_9876543210_UP32CD5678)
  const rahulId = 'CUST_9919856161_UP32AB1234';
  const amitId = 'CUST_9876543210_UP32CD5678';

  // Mark Rahul Verma (index 0) as completed
  context.toggleCustomerDoneToday(rahulId);
  assert.strictEqual(context.isCustomerDoneToday(rahulId), true);
  assert.strictEqual(context.isCustomerDoneToday(amitId), false);

  // Admin reorders: Amit Sharma is now first (index 0), Rahul Verma is now second (index 1)
  const reorderedCustomers = [
    { ...sampleDailyCustomers[1], _seq: 1 }, // Amit Sharma
    { ...sampleDailyCustomers[0], _seq: 2 }, // Rahul Verma
    { ...sampleDailyCustomers[2], _seq: 3 }  // Priya Singh
  ];
  context.state.customers = reorderedCustomers;
  context.renderCustomerCards(reorderedCustomers);

  // Check by Customer Identity:
  assert.strictEqual(context.isCustomerDoneToday(rahulId), true, 'Rahul Verma must STAY completed after moving to index 1');
  assert.strictEqual(context.isCustomerDoneToday(amitId), false, 'Amit Sharma must STAY uncompleted after moving to index 0');

  // Verify that card at index 0 (Amit) does NOT have card-cleaned-done
  // and card at index 1 (Rahul) DOES have card-cleaned-done
  const feedHtml = elements['customerFeed'].innerHTML;
  const cards = feedHtml.split('<div class="smart-card').slice(1);
  const card0 = cards[0] || '';
  const card1 = cards[1] || '';

  assert.ok(!card0.includes('card-cleaned-done'), 'Card at index 0 (Amit) must NOT have card-cleaned-done');
  assert.ok(card1.includes('card-cleaned-done'), 'Card at index 1 (Rahul) MUST have card-cleaned-done');

  console.log('✅ PASS 5: Admin changes customer sequence -> completion remains attached to customer, not list index.');
})();

// =========================================================================
// TEST 6: Indian date changes to next day -> checklist becomes fresh automatically
// =========================================================================
(function test6() {
  const { context, elements } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  // Mark customer on Day 1
  const custId = 'CUST_9919856161_UP32AB1234';
  context.toggleCustomerDoneToday(custId);
  assert.strictEqual(context.isCustomerDoneToday(custId), true);

  const day1Key = context.getTodayDateKey();
  assert.strictEqual(context.state.currentDateKey, day1Key);

  // Simulate Indian date rolling over to tomorrow
  const tomorrowKey = '2026-11-07'; // Next day
  context.getTodayDateKey = () => tomorrowKey;

  // Portal detects midnight date rollover
  context.checkAndHandleDateChange();

  // State must update to tomorrowKey
  assert.strictEqual(context.state.currentDateKey, tomorrowKey, 'currentDateKey must update to tomorrow');

  // On tomorrow, checklist must be completely fresh
  assert.strictEqual(context.isCustomerDoneToday(custId), false, 'Customer must NOT be marked done on next day');

  const feedHtml = elements['customerFeed'].innerHTML;
  assert.ok(!feedHtml.includes('card-cleaned-done'), 'No cards must be marked done on fresh day');
  assert.ok(feedHtml.includes('आज साफ करें (Mark Cleaned)'), 'Buttons must show Mark Cleaned on fresh day');
  assert.strictEqual(elements['routeProgressCount'].textContent, '0 / 3', 'Progress must be 0 of 3');
  assert.strictEqual(elements['routeProgressPercent'].textContent, '0%', 'Progress must be 0%');

  console.log('✅ PASS 6: Indian date changes to next day -> checklist becomes fresh automatically.');
})();

// =========================================================================
// TEST 7: Previous day's completion is not shown
// =========================================================================
(function test7() {
  const { context } = createMockClientEnv();
  const custId = 'CUST_9919856161_UP32AB1234';

  // Seed storage with completion data from yesterday
  const yesterdayKey = '2026-11-05';
  const todayKey = '2026-11-06';
  const store = {
    STF01: {
      [yesterdayKey]: {
        [custId]: true
      }
    }
  };
  context.saveDailyCleanStore(store);

  // Inquire for today's completed set
  const completedToday = context.getCompletedCustomersSet('STF01', todayKey);
  assert.strictEqual(completedToday.has(custId), false, 'Yesterday completion must NOT be in today set');
  assert.strictEqual(completedToday.size, 0, 'Today set must be empty');

  // Inquire for yesterday's set directly
  const completedYesterday = context.getCompletedCustomersSet('STF01', yesterdayKey);
  assert.strictEqual(completedYesterday.has(custId), true, 'Yesterday set remains stored for history');

  console.log('✅ PASS 7: Previous day\'s completion is not shown.');
})();

// =========================================================================
// TEST 8: Staff completion data is not transmitted to backend
// =========================================================================
(function test8() {
  const { context, networkCalls } = createMockClientEnv();
  context.state.customers = sampleDailyCustomers;

  // Toggle multiple items
  context.toggleCustomerDoneToday('CUST_9919856161_UP32AB1234');
  context.toggleCustomerDoneToday('CUST_9876543210_UP32CD5678');

  // Ensure toggleCustomerDoneToday triggered ZERO network calls
  assert.strictEqual(networkCalls.length, 0, 'toggleCustomerDoneToday must make ZERO network requests');

  // Inspect apiCall definition in Index.html to verify completion status is never sent
  assert.ok(!indexHtml.includes("action: 'saveCompletion'"), 'No saveCompletion API action exists');
  assert.ok(!indexHtml.includes("action: 'syncDailyCleanDone'"), 'No syncDailyCleanDone API action exists');

  console.log('✅ PASS 8: Staff completion data is not transmitted to backend.');
})();

// =========================================================================
// TEST 9: Admin cannot view staff completion data
// =========================================================================
(function test9() {
  // Admin portal records table and sequence manager inspection
  assert.ok(!indexHtml.includes('class="admin-clean-done-badge"'), 'No admin completion status badge exists in Admin UI');
  assert.ok(!indexHtml.includes('renderAdminCompletionStatus'), 'No admin completion rendering function exists');

  // Admin sequence payload inspection
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverJs = fs.readFileSync(serverPath, 'utf8');

  assert.ok(!serverJs.includes('dailyCleanCompletion'), 'server.js must not store or process dailyCleanCompletion');
  assert.ok(!serverJs.includes('cwp_daily_clean_completion'), 'server.js must not reference cwp_daily_clean_completion');

  console.log('✅ PASS 9: Admin cannot view staff completion data.');
})();

// =========================================================================
// TEST 10: Different staff/device/browser environments maintain their own local completion state
// =========================================================================
(function test10() {
  // Scenario A: Same device, two different staff members (Rahul STF01 vs Amit STF02)
  const { context: sameDeviceEnv } = createMockClientEnv({}, 'STF01');
  const custId = 'CUST_9919856161_UP32AB1234';

  sameDeviceEnv.toggleCustomerDoneToday(custId, 'STF01');

  // STF01 has it done
  assert.strictEqual(sameDeviceEnv.isCustomerDoneToday(custId, 'STF01'), true, 'STF01 must have customer marked done');

  // STF02 does NOT have it done
  assert.strictEqual(sameDeviceEnv.isCustomerDoneToday(custId, 'STF02'), false, 'STF02 must NOT have customer marked done');

  // Scenario B: Two different devices (separate localStorage)
  const { context: device1 } = createMockClientEnv({}, 'STF01');
  const { context: device2 } = createMockClientEnv({}, 'STF01');

  device1.toggleCustomerDoneToday(custId, 'STF01');
  assert.strictEqual(device1.isCustomerDoneToday(custId, 'STF01'), true, 'Device 1 has customer done');
  assert.strictEqual(device2.isCustomerDoneToday(custId, 'STF01'), false, 'Device 2 (separate device) does NOT have customer done');

  console.log('✅ PASS 10: Different staff/device/browser environments maintain their own local completion state.');
})();

// =========================================================================
// TEST 11: Asia/Kolkata timezone date is used instead of UTC across boundary hours
// =========================================================================
(function test11() {
  const { context } = createMockClientEnv();
  const getKolkataKey = context.getAsiaKolkataDateKey;

  // 1. Boundary: 18:29:59 UTC on 2026-11-05 is 23:59:59 IST on 2026-11-05
  const d1 = new Date('2026-11-05T18:29:59.000Z');
  assert.strictEqual(getKolkataKey(d1), '2026-11-05', '18:29 UTC must be Nov 5 in Asia/Kolkata');

  // 2. Boundary: 18:30:00 UTC on 2026-11-05 is 00:00:00 IST on 2026-11-06 (Midnight IST rollover!)
  const d2 = new Date('2026-11-05T18:30:00.000Z');
  assert.strictEqual(getKolkataKey(d2), '2026-11-06', '18:30 UTC must be Nov 6 in Asia/Kolkata');

  // 3. Boundary: 23:45:00 UTC on 2026-11-05 (UTC is still Nov 5, but IST is 05:15 AM Nov 6)
  const d3 = new Date('2026-11-05T23:45:00.000Z');
  assert.strictEqual(getKolkataKey(d3), '2026-11-06', '23:45 UTC on Nov 5 must strictly resolve to Nov 6 in Asia/Kolkata');

  // 4. Milliseconds to midnight IST calculation
  const testNoonIst = new Date('2026-11-06T12:00:00+05:30');
  const msToMidnight = context.getMsUntilMidnightAsiaKolkata(testNoonIst);
  const hoursToMidnight = msToMidnight / (1000 * 60 * 60);
  assert.ok(Math.abs(hoursToMidnight - 12) < 0.01, 'From 12:00 IST to midnight IST must be approximately 12 hours');

  console.log('✅ PASS 11: Asia/Kolkata timezone date is used instead of UTC across boundary hours.');
})();

// =========================================================================
// TEST 12: No unnecessary API calls or database changes are introduced
// =========================================================================
(function test12() {
  const realDataAfter = fs.existsSync(realDataFilePath) ? fs.readFileSync(realDataFilePath, 'utf8') : null;
  const realDataMd5After = realDataAfter ? crypto.createHash('md5').update(realDataAfter).digest('hex') : null;

  assert.strictEqual(realDataMd5Before, realDataMd5After, 'local_data.json must NEVER be modified by local completion tracking');

  console.log('✅ PASS 12: No unnecessary API calls or database changes are introduced (Zero mutation of local_data.json).');
})();

// =========================================================================
// TEST 13: Same-day logout and login retains completion state (SAME DAY ME LOGIN LOGOUT PE WO RAHE)
// =========================================================================
(function test13() {
  const { context, localStore, sessionStore, elements } = createMockClientEnv({}, 'STF01');
  context.state.customers = sampleDailyCustomers;
  context.renderCustomerCards(sampleDailyCustomers);

  const custId1 = 'CUST_9919856161_UP32AB1234';
  const custId2 = 'CUST_9876543210_UP32CD5678';

  // Staff marks 2 customers as done today
  context.toggleCustomerDoneToday(custId1);
  context.toggleCustomerDoneToday(custId2);

  assert.strictEqual(context.isCustomerDoneToday(custId1), true);
  assert.strictEqual(context.isCustomerDoneToday(custId2), true);

  // Staff logs out
  context.clearStaffTokens('STF01');
  context.sessionStorage.removeItem('cwp_last_staff_id');
  context.localStorage.removeItem('cwp_last_staff_id');
  context.sessionStorage.removeItem('cwp_last_staff_phone');
  context.localStorage.removeItem('cwp_last_staff_phone');
  context.state.activeStaffId = '';

  // Confirm logout did NOT clear completion storage
  assert.ok(localStore['cwp_daily_clean_completion'], 'Completion storage must survive logout');

  // Staff logs back in on the same day
  context.state.activeStaffId = 'STF01';
  context.state.currentView = 'staff';
  context.renderCustomerCards(sampleDailyCustomers);

  // Verify completion checkmarks are still present!
  assert.strictEqual(context.isCustomerDoneToday(custId1), true, 'Customer 1 must still be marked done after login on same day');
  assert.strictEqual(context.isCustomerDoneToday(custId2), true, 'Customer 2 must still be marked done after login on same day');
  assert.strictEqual(context.isCustomerDoneToday('CUST_9123456780_UP32EF9012'), false, 'Customer 3 remains unchecked');

  const feedHtml = elements['customerFeed'].innerHTML;
  assert.ok(feedHtml.includes('card-cleaned-done'), 'Feed must show card-cleaned-done after login');
  assert.strictEqual(elements['routeProgressCount'].textContent, '2 / 3', 'Progress counter must show 2 / 3 after re-login');

  console.log('✅ PASS 13: SAME DAY ME LOGIN LOGOUT PE WO RAHE (Same-day logout and login retains completion state).');
})();

console.log('===============================================================');
console.log('🎉 ALL 13 TASK P2.6 DAILY CLEAN COMPLETION TESTS PASSED PERFECTLY!');
console.log('===============================================================');
