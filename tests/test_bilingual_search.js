/**
 * Test Suite: Bilingual Phonetic Cross-Search (English <-> Hindi)
 * Verifies bidirectional search:
 * - English search matching Hindi records (e.g. "ritika" -> "रितिका जैन")
 * - Hindi search matching English records (e.g. "अंकित" -> "Ankit Jain", "जैन" -> "Ankit Jain")
 * - Indian phonetic variations (ee/i, oo/u, w/v, sh/s, double consonants, schwa syncope)
 * - Phone numbers (raw, +91, formatted) and vehicle plates
 */

const assert = require('assert');
const {
  devanagariToLatin,
  normalizePhoneticKey,
  recordMatchesQuery,
  filterRecordsBilingual
} = require('../services/bilingualSearchService');

console.log('--- Starting Bilingual Phonetic Cross-Search Tests ---');

// 1. Devanagari Romanization Tests
console.log('\n[1/5] Testing devanagariToLatin romanization...');
const romanTests = [
  { hi: 'रितिका जैन', expected: 'ritika jain' },
  { hi: 'श्रेयांश जैन', expected: 'shreyansh jain' },
  { hi: 'अपूर्व मित्तल', expected: 'apurv mittal' },
  { hi: 'सिगरा, वाराणसी', expected: 'sigara, varanasi' },
  { hi: 'अयूब खान', expected: 'ayub khan' },
  { hi: 'सार्थक साध', expected: 'sarthak sadh' },
  { hi: 'हर्षित जैन', expected: 'harshit jain' },
  { hi: 'विवेक', expected: 'vivek' },
  { hi: 'कविता जैन', expected: 'kavita jain' }
];

for (const t of romanTests) {
  const actual = devanagariToLatin(t.hi);
  assert.strictEqual(actual, t.expected, `Romanization failed for "${t.hi}": got "${actual}", expected "${t.expected}"`);
  console.log(`  ✔ "${t.hi}" -> "${actual}"`);
}

// 2. Phonetic Normalization Tests
console.log('\n[2/5] Testing normalizePhoneticKey variations...');
const phoneticEquivalences = [
  ['reetika', 'ritika'],
  ['sreyansh', 'shreyansh'],
  ['apoorv', 'apurv'],
  ['ayoob', 'ayub'],
  ['mittal', 'mital'],
  ['wiwek', 'vivek']
];

for (const [a, b] of phoneticEquivalences) {
  const normA = normalizePhoneticKey(a);
  const normB = normalizePhoneticKey(b);
  assert.strictEqual(normA, normB, `Phonetic keys do not match: "${a}" (${normA}) vs "${b}" (${normB})`);
  console.log(`  ✔ "${a}" <=> "${b}" (normalized: "${normA}")`);
}

// 3. Bidirectional Cross-Search Tests
console.log('\n[3/5] Testing bidirectional English <-> Hindi matching...');

const sampleRecords = [
  {
    id: 1,
    customerName: 'रितिका जैन',
    nameHi: 'रितिका जैन',
    customerNumber: '9838054321',
    address: 'सिगरा, वाराणसी',
    addressHi: 'सिगरा, वाराणसी',
    vehicle: 'UP65AB1234 (White Swift)'
  },
  {
    id: 2,
    customerName: 'श्रेयांश जैन',
    nameHi: 'श्रेयांश जैन',
    customerNumber: '9839123456',
    address: 'महमूरगंज, वाराणसी',
    addressHi: 'महमूरगंज, वाराणसी',
    vehicle: 'UP65CD5678 (Creta)'
  },
  {
    id: 3,
    customerName: 'अपूर्व मित्तल',
    nameHi: 'अपूर्व मित्तल',
    customerNumber: '9415201122',
    address: 'भेलूपुर, वाराणसी',
    addressHi: 'भेलूपुर, वाराणसी',
    vehicle: 'UP65EF9012 (Honda City)'
  },
  {
    id: 4,
    customerName: 'Ankit Jain',
    nameHi: 'अंकित जैन',
    customerNumber: '9839998877',
    address: 'Rathyatra, Varanasi',
    addressHi: 'रथयात्रा, वाराणसी',
    vehicle: 'UP65XY3344 (Baleno)'
  },
  {
    id: 5,
    customerName: 'Ramesh Sharma',
    nameHi: 'रमेश शर्मा',
    customerNumber: '9838112233',
    address: 'Lanka, Varanasi',
    addressHi: 'लंका, वाराणसी',
    vehicle: 'UP65ZZ9988 (Innova)'
  }
];

const crossSearchTests = [
  // English search for Hindi records
  { query: 'ritika', recordId: 1, desc: 'English "ritika" finds "रितिका जैन"' },
  { query: 'reetika', recordId: 1, desc: 'Phonetic variant "reetika" finds "रितिका जैन"' },
  { query: 'sigra', recordId: 1, desc: 'English "sigra" (syncope) finds "सिगरा, वाराणसी"' },
  { query: 'shreyansh', recordId: 2, desc: 'English "shreyansh" finds "श्रेयांश जैन"' },
  { query: 'sreyansh', recordId: 2, desc: 'Phonetic "sreyansh" finds "श्रेयांश जैन"' },
  { query: 'apurv', recordId: 3, desc: 'English "apurv" finds "अपूर्व मित्तल"' },
  { query: 'apoorv', recordId: 3, desc: 'Phonetic "apoorv" finds "अपूर्व मित्तल"' },
  { query: 'mital', recordId: 3, desc: 'Single consonant "mital" finds "अपूर्व मित्तल"' },

  // Hindi search for English records
  { query: 'अंकित', recordId: 4, desc: 'Hindi "अंकित" finds "Ankit Jain"' },
  { query: 'रमेश', recordId: 5, desc: 'Hindi "रमेश" finds "Ramesh Sharma"' },
  { query: 'शर्मा', recordId: 5, desc: 'Hindi "शर्मा" finds "Ramesh Sharma"' },

  // Shared surname search
  { query: 'jain', expectedIds: [1, 2, 4], desc: 'English "jain" finds all 3 Jain records' },
  { query: 'जैन', expectedIds: [1, 2, 4], desc: 'Hindi "जैन" finds both Hindi and English Jain records' }
];

for (const t of crossSearchTests) {
  if (t.recordId !== undefined) {
    const rec = sampleRecords.find(r => r.id === t.recordId);
    const matched = recordMatchesQuery(rec, t.query);
    assert.strictEqual(matched, true, `Failed: ${t.desc} (query: "${t.query}")`);
    console.log(`  ✔ ${t.desc}`);
  } else if (t.expectedIds) {
    const matched = sampleRecords.filter(r => recordMatchesQuery(r, t.query)).map(r => r.id);
    assert.deepStrictEqual(matched.sort(), t.expectedIds.sort(), `Failed: ${t.desc}`);
    console.log(`  ✔ ${t.desc} (matched IDs: ${matched.join(', ')})`);
  }
}

// 4. Phone, Vehicle & Multi-Token Searches
console.log('\n[4/5] Testing phone numbers, vehicles, and multi-token queries...');
const queryTests = [
  { rec: sampleRecords[0], q: '98380', desc: 'Partial phone 98380' },
  { rec: sampleRecords[0], q: '9838054321', desc: 'Full 10-digit phone 9838054321' },
  { rec: sampleRecords[0], q: '+91 98380 54321', desc: 'Formatted phone +91 98380 54321' },
  { rec: sampleRecords[0], q: '98380 54321', desc: 'Spaced phone 98380 54321' },
  { rec: sampleRecords[0], q: 'UP65', desc: 'Vehicle plate prefix UP65' },
  { rec: sampleRecords[0], q: 'swift', desc: 'Vehicle model swift' },
  { rec: sampleRecords[0], q: 'ritika varanasi', desc: 'Multi-token: "ritika varanasi"' },
  { rec: sampleRecords[0], q: 'ritika swift', desc: 'Multi-token: "ritika swift"' },
  { rec: sampleRecords[1], q: 'shreyansh creta', desc: 'Multi-token: "shreyansh creta"' }
];

for (const qt of queryTests) {
  const ok = recordMatchesQuery(qt.rec, qt.q);
  assert.strictEqual(ok, true, `Failed query test "${qt.q}" for ${qt.desc}`);
  console.log(`  ✔ ${qt.desc}`);
}

// 5. filterRecordsBilingual Array Filtering
console.log('\n[5/5] Testing filterRecordsBilingual function...');
const ritikaResults = filterRecordsBilingual(sampleRecords, 'ritika');
assert.strictEqual(ritikaResults.length, 1);
assert.strictEqual(ritikaResults[0].customerName, 'रितिका जैन');
console.log('  ✔ filterRecordsBilingual("ritika") returned 1 record: "रितिका जैन"');

const jainResults = filterRecordsBilingual(sampleRecords, 'jain');
assert.strictEqual(jainResults.length, 3);
console.log('  ✔ filterRecordsBilingual("jain") returned 3 records (both English and Hindi)');

console.log('\n✅ All Bilingual Phonetic Cross-Search Tests Passed Successfully!');
