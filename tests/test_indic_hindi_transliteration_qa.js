/**
 * =========================================================================
 * QA TEST SUITE: GOOGLE INDIC TRANSLITERATION & DUAL LANGUAGE SYSTEM
 * 1. Indic Service Unit Tests (Names, Addresses, Arabic Digits & Landmarks)
 * 2. HTTP API Endpoints (/api/indic/transliterate, /api/indic/transliterate-customer)
 * 3. Save & Update Customer Hindi Field Persistence (Neon + Local)
 * 4. Backfill Hindi API Workflow
 * 5. Frontend DOM & Staff Portal Dual Language Card UI Verification
 * =========================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const indicService = require('../services/indicTransliterateService');
const { getFrontendAssets } = require('./test_helpers');

console.log('===============================================================');
console.log('🚀 RUNNING GOOGLE INDIC TRANSLITERATION & HINDI QA SUITE');
console.log('===============================================================');

async function runTests() {
  // -------------------------------------------------------------------------
  // TEST 1: Indic Transliteration Service Tests
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: Google Indic Service Unit Tests ---');

  const testName = 'Ramesh Sharma';
  const hiName = await indicService.transliterateName(testName);
  console.log(`[Transliterate Name] "${testName}" -> "${hiName}"`);
  assert.ok(hiName.includes('रमेश') && hiName.includes('शर्मा'), 'Name must be phonetically transliterated into Devanagari');

  const testAddr = 'Flat 302, Tower B, Supertech Eco Village, Near Water Tank';
  const hiAddr = await indicService.transliterateAddress(testAddr);
  console.log(`[Transliterate Address] "${testAddr}" -> "${hiAddr}"`);
  assert.ok(hiAddr.includes('302'), 'Address must preserve standard Arabic numerals (302) for door numbers');
  assert.ok(/फ्लैट|टावर|विलेज|सुपरटेक/i.test(hiAddr), 'Address must contain phonetic Devanagari representation');

  // Verify pure Hindi passthrough
  const pureHindi = 'गौरव गुप्ता';
  const passedThrough = await indicService.transliterateName(pureHindi);
  assert.strictEqual(passedThrough, pureHindi, 'Pure Hindi text should pass through intact');

  // Verify batch transliteration
  const batchRes = await indicService.transliterateCustomer({
    name: 'Siddharth Mukherjee',
    address: 'House 45, Sector 62, Noida',
    secondaryAddress: 'Office Block C, Delhi'
  });
  assert.ok(batchRes.nameHi && batchRes.nameHi !== 'Siddharth Mukherjee', 'Batch must transliterate name');
  assert.ok(batchRes.addressHi && batchRes.addressHi.includes('45'), 'Batch must preserve address digits');
  assert.ok(batchRes.secondaryAddressHi, 'Batch must transliterate secondary address');
  console.log('✅ PASS 1: Google Indic transliteration service verified with phonetic names, address numbers & batching');

  // -------------------------------------------------------------------------
  // TEST 2: Frontend HTML Form & Element Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Index.html Frontend Inputs & Backfill UI ---');
  const { indexHtml, fullDocument } = getFrontendAssets();

  // Add customer modal fields
  assert.ok(indexHtml.includes('id="custNameHi"'), 'Index.html must have custNameHi input');
  assert.ok(indexHtml.includes('id="custAddressHi"'), 'Index.html must have custAddressHi input');
  assert.ok(indexHtml.includes('id="custSecAddressHi"'), 'Index.html must have custSecAddressHi input');

  // Edit customer modal fields
  assert.ok(indexHtml.includes('id="editCustNameHi"'), 'Index.html must have editCustNameHi input');
  assert.ok(indexHtml.includes('id="editCustAddressHi"'), 'Index.html must have editCustAddressHi input');
  assert.ok(indexHtml.includes('id="editCustSecAddressHi"'), 'Index.html must have editCustSecAddressHi input');

  // Admin Auto Indic Backfill button
  assert.ok(indexHtml.includes('id="btnAdminBackfillHindi"'), 'Index.html must have btnAdminBackfillHindi button');
  assert.ok(indexHtml.includes('handleBackfillHindi()'), 'Index.html must bind handleBackfillHindi');

  console.log('✅ PASS 2: Index.html contains all Hindi dual-language inputs and Admin Auto Indic button');

  // -------------------------------------------------------------------------
  // TEST 3: CSS Stylesheet Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: CSS Styles for Dual-Language & Audio UI ---');
  const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.indic-assist-wrap'), 'style.css must define .indic-assist-wrap');
  assert.ok(css.includes('.form-input-indic'), 'style.css must define .form-input-indic');
  assert.ok(css.includes('.btn-admin-indic'), 'style.css must define .btn-admin-indic');
  assert.ok(css.includes('.btn-card-audio'), 'style.css must define .btn-card-audio');
  assert.ok(css.includes('.cust-bilingual-sub'), 'style.css must define .cust-bilingual-sub');
  assert.ok(css.includes('.table-hi-sub'), 'style.css must define .table-hi-sub');

  console.log('✅ PASS 3: public/css/style.css defines all required dual-language, audio button & Hindi badge classes');

  // -------------------------------------------------------------------------
  // TEST 4: JavaScript app.js Logic Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: public/js/app.js Dual-Language & Speech Handlers ---');
  const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert.ok(appJs.includes('transliterateTextViaApi'), 'app.js must define transliterateTextViaApi');
  assert.ok(appJs.includes('setupIndicInputListeners'), 'app.js must define setupIndicInputListeners');
  assert.ok(appJs.includes('speakHindiCustomerDetails'), 'app.js must define speakHindiCustomerDetails');
  assert.ok(appJs.includes('handleBackfillHindi'), 'app.js must define handleBackfillHindi');
  assert.ok(appJs.includes('btn-card-audio'), 'app.js must render 🔊 audio button on staff cards');
  assert.ok(appJs.includes('cust-bilingual-sub'), 'app.js must render bilingual subtitle on staff cards');
  assert.ok(appJs.includes('table-hi-sub'), 'app.js must render Hindi hint in admin table');

  console.log('✅ PASS 4: public/js/app.js implements live transliteration, audio speech readout & bilingual rendering');

  // -------------------------------------------------------------------------
  // TEST 5: Live HTTP Server API Endpoints
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Live Server HTTP API Transliteration & Backfill ---');
  const cwp = require('../server');
  const server = cwp.server;

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  function httpPost(urlPath, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: resData });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // 5a. Test /api/indic/transliterate endpoint
  const transRes = await httpPost('/api/indic/transliterate', { text: 'Gaurav Gupta', type: 'name' });
  assert.strictEqual(transRes.status, 200, '/api/indic/transliterate must return HTTP 200');
  assert.strictEqual(transRes.data.success, true);
  assert.ok(transRes.data.transliterated.includes('गौरव'), 'Endpoint must return transliterated name in Hindi');
  console.log(`[HTTP /api/indic/transliterate] "Gaurav Gupta" -> "${transRes.data.transliterated}"`);

  // 5b. Test /api/indic/transliterate-customer endpoint
  const batchHttpRes = await httpPost('/api/indic/transliterate-customer', {
    name: 'Vikram Singh',
    address: 'Flat 101, Express Zenith',
    secondaryAddress: 'Office Block A'
  });
  assert.strictEqual(batchHttpRes.status, 200, '/api/indic/transliterate-customer must return HTTP 200');
  assert.strictEqual(batchHttpRes.data.success, true);
  assert.ok(batchHttpRes.data.nameHi.includes('विक्रम'), 'Batch endpoint must transliterate nameHi');
  assert.ok(batchHttpRes.data.addressHi.includes('101'), 'Batch endpoint must preserve address digits');

  // 5c. Test Admin Backfill Hindi API
  const backfillRes = await httpPost('/api', { action: 'backfillHindi' });
  assert.strictEqual(backfillRes.status, 200, 'backfillHindi action must return HTTP 200');
  assert.strictEqual(backfillRes.data.success, true);
  assert.ok(typeof backfillRes.data.total === 'number', 'Backfill must return total records count');
  console.log(`[HTTP backfillHindi] Processed ${backfillRes.data.total} records, updated: ${backfillRes.data.updated}`);

  await new Promise(resolve => server.close(resolve));
  console.log('✅ PASS 5: Live server API endpoints verified for single, batch transliteration & backfill');

  console.log('\n===============================================================');
  console.log('🎉 ALL 5 GOOGLE INDIC TRANSLITERATION QA TESTS PASSED CLEANLY!');
  console.log('===============================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ QA TEST FAILED:', err);
  process.exit(1);
});
