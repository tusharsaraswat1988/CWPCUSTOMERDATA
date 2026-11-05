const assert = require('assert');
const { parseCSV } = require('../server.js');

console.log('🧪 Testing CSV parser...');

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

console.log('🎉 ALL CSV PARSER TESTS PASSED!');
process.exit(0);
