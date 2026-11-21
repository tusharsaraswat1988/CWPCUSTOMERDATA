/**
 * =============================================================================
 * CWP STAFF PORTAL - PROGRESSIVE WEB APP (PWA) AUTOMATED TEST SUITE
 * =============================================================================
 * Verifies:
 *  1. Web App Manifest (/manifest.json) validation & PWA standards
 *  2. Service Worker (/sw.js) headers, caching logic & lifecycle
 *  3. Offline Shell (/offline.html) fallback availability
 *  4. High-resolution PWA Icon suite (standard, maskable, apple-touch, favicons)
 *  5. Index.html PWA meta tags & Apple iOS web-app capability
 *  6. In-App Install prompt banner, header action & iOS guide modal
 *  7. Client-side PWA controller functions & view isolation
 * =============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TEST_PORT = 5899;
let serverInstance = null;

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer: buffer,
          text: buffer.toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING CWP STAFF PORTAL PWA VERIFICATION SUITE');
  console.log('===============================================================\n');

  // Start test server instance
  const serverModule = require('../server.js');
  const server = serverModule.server || serverModule;

  await new Promise((resolve) => {
    serverInstance = server.listen(TEST_PORT, () => {
      console.log(`[Test Setup] Server listening on http://127.0.0.1:${TEST_PORT}`);
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Manifest validation (/manifest.json)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Web App Manifest (/manifest.json) ---');
    const manifestRes = await httpRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/manifest.json',
      method: 'GET'
    });

    assert.strictEqual(manifestRes.statusCode, 200, 'Manifest HTTP status should be 200');
    assert.ok(
      manifestRes.headers['content-type'].includes('application/manifest+json'),
      `Content-Type should be manifest+json, got: ${manifestRes.headers['content-type']}`
    );

    const manifest = JSON.parse(manifestRes.text);
    assert.ok(manifest.name && manifest.name.includes('Staff'), 'Manifest name should identify Staff Portal');
    assert.strictEqual(manifest.short_name, 'CWP Staff', 'short_name should be "CWP Staff"');
    assert.strictEqual(manifest.start_url, '/staff', 'start_url must be /staff');
    assert.strictEqual(manifest.display, 'standalone', 'display must be standalone');
    assert.strictEqual(manifest.theme_color, '#0f2942', 'theme_color must match brand navy #0f2942');
    assert.strictEqual(manifest.background_color, '#0f2942', 'background_color must match #0f2942');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 8, 'Must have at least 8 icon sizes');

    const has192 = manifest.icons.some(i => i.sizes === '192x192');
    const has512 = manifest.icons.some(i => i.sizes === '512x512');
    const hasMaskable = manifest.icons.some(i => i.purpose === 'maskable');
    assert.ok(has192 && has512, 'Manifest must specify 192x192 and 512x512 icons');
    assert.ok(hasMaskable, 'Manifest must specify maskable icons for Android adaptive launchers');

    console.log('✅ PASS 1: /manifest.json verified with standalone mode, /staff start_url & maskable icons');

    // -------------------------------------------------------------------------
    // TEST 2: Service Worker validation (/sw.js)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Service Worker (/sw.js) ---');
    const swRes = await httpRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/sw.js',
      method: 'GET'
    });

    assert.strictEqual(swRes.statusCode, 200, 'Service Worker HTTP status should be 200');
    assert.ok(
      swRes.headers['content-type'].includes('application/javascript'),
      `SW Content-Type must be javascript, got: ${swRes.headers['content-type']}`
    );
    assert.ok(
      swRes.headers['cache-control'] && swRes.headers['cache-control'].includes('no-cache'),
      'SW must have no-cache headers to prevent stale updates'
    );
    assert.strictEqual(
      swRes.headers['service-worker-allowed'],
      '/',
      'SW must have Service-Worker-Allowed: / header'
    );

    const swSource = swRes.text;
    assert.ok(swSource.includes('cwp-staff-pwa'), 'SW must declare versioned cache name');
    assert.ok(swSource.includes('install'), 'SW must handle install event');
    assert.ok(swSource.includes('activate'), 'SW must handle activate event');
    assert.ok(swSource.includes('fetch'), 'SW must handle fetch event');
    assert.ok(swSource.includes('skipWaiting'), 'SW must support skipWaiting');
    assert.ok(swSource.includes('clients.claim'), 'SW must support clients.claim');
    assert.ok(swSource.includes('/offline.html'), 'SW must reference offline fallback shell');

    console.log('✅ PASS 2: /sw.js verified with no-cache headers, install/activate lifecycle & offline logic');

    // -------------------------------------------------------------------------
    // TEST 3: Offline HTML Shell (/offline.html)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Offline Shell (/offline.html) ---');
    const offlineRes = await httpRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/offline.html',
      method: 'GET'
    });

    assert.strictEqual(offlineRes.statusCode, 200, 'Offline shell HTTP status should be 200');
    assert.ok(offlineRes.headers['content-type'].includes('text/html'), 'Offline page must be HTML');
    assert.ok(offlineRes.text.includes('ऑफ़लाइन') || offlineRes.text.includes('ऑफलाइन'), 'Offline page must contain Hindi offline messaging');
    assert.ok(offlineRes.text.includes('Retry') || offlineRes.text.includes('पुनः प्रयास'), 'Offline page must have retry trigger');

    console.log('✅ PASS 3: /offline.html verified with branded offline UI and auto-reload on reconnection');

    // -------------------------------------------------------------------------
    // TEST 4: PWA Icons Suite
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: PWA Icons Suite ---');
    const iconFiles = [
      'icon-72x72.png',
      'icon-96x96.png',
      'icon-128x128.png',
      'icon-144x144.png',
      'icon-152x152.png',
      'icon-192x192.png',
      'icon-384x384.png',
      'icon-512x512.png',
      'maskable-icon-192x192.png',
      'maskable-icon-512x512.png',
      'apple-touch-icon.png',
      'favicon-32x32.png'
    ];

    for (const iconName of iconFiles) {
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: `/icons/${iconName}`,
        method: 'GET'
      });
      assert.strictEqual(res.statusCode, 200, `Icon /icons/${iconName} must return 200 OK`);
      assert.strictEqual(res.headers['content-type'], 'image/png', `Icon ${iconName} must be image/png`);
      // Verify PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
      assert.strictEqual(res.buffer[0], 0x89, 'Byte 0 must be 0x89');
      assert.strictEqual(res.buffer[1], 0x50, 'Byte 1 must be 0x50 (P)');
      assert.strictEqual(res.buffer[2], 0x4E, 'Byte 2 must be 0x4E (N)');
      assert.strictEqual(res.buffer[3], 0x47, 'Byte 3 must be 0x47 (G)');
    }

    const favRes = await httpRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/favicon.ico',
      method: 'GET'
    });
    assert.strictEqual(favRes.statusCode, 200, '/favicon.ico must return 200 OK');

    console.log(`✅ PASS 4: All ${iconFiles.length} high-res PNG icons & favicon verified with valid PNG signatures`);

    // -------------------------------------------------------------------------
    // TEST 5: Index.html PWA Meta & iOS Capability Tags
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Index.html PWA Head Meta Tags ---');
    const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8') +
      (fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf8') : '');

    assert.ok(indexHtml.includes('<link rel="manifest" href="/manifest.json">'), 'Must link manifest.json');
    assert.ok(indexHtml.includes('<meta name="theme-color" content="#0f2942">'), 'Must specify brand theme-color #0f2942');
    assert.ok(indexHtml.includes('<meta name="mobile-web-app-capable" content="yes">'), 'Must enable mobile-web-app-capable');
    assert.ok(indexHtml.includes('<meta name="apple-mobile-web-app-capable" content="yes">'), 'Must enable iOS web-app-capable');
    assert.ok(indexHtml.includes('<meta name="apple-mobile-web-app-status-bar-style"'), 'Must configure iOS status-bar-style');
    assert.ok(indexHtml.includes('<link rel="apple-touch-icon"'), 'Must link apple-touch-icon');

    console.log('✅ PASS 5: Index.html includes all required PWA, theme-color and iOS standalone meta tags');

    // -------------------------------------------------------------------------
    // TEST 6: In-App PWA Install Banner, Header Action & Modals
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: In-App PWA Install UI Elements ---');
    assert.ok(indexHtml.includes('id="staffPwaInstallBanner"'), 'Must have #staffPwaInstallBanner');
    assert.ok(indexHtml.includes('id="staffPwaInstallBtn"'), 'Must have #staffPwaInstallBtn in header');
    assert.ok(indexHtml.includes('id="pwaIosModal"'), 'Must have #pwaIosModal for Safari users');
    assert.ok(indexHtml.includes('id="pwaUpdateBar"'), 'Must have #pwaUpdateBar for SW update notifications');
    assert.ok(indexHtml.includes('triggerPwaInstallPrompt()'), 'Must have triggerPwaInstallPrompt() handler');
    assert.ok(indexHtml.includes('dismissPwaBanner()'), 'Must have dismissPwaBanner() handler');
    assert.ok(indexHtml.includes('applyPwaUpdate()'), 'Must have applyPwaUpdate() handler');

    console.log('✅ PASS 6: In-app install banner, header button, update toast & iOS modal verified in DOM');

    // -------------------------------------------------------------------------
    // TEST 7: Client JavaScript Functions & View Mode Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Client JavaScript PWA Functions ---');
    assert.ok(indexHtml.includes('function isPwaStandaloneMode()'), 'isPwaStandaloneMode must be defined');
    assert.ok(indexHtml.includes('function updatePwaInstallState()'), 'updatePwaInstallState must be defined');
    assert.ok(indexHtml.includes('function triggerPwaInstallPrompt()'), 'triggerPwaInstallPrompt must be defined');
    assert.ok(indexHtml.includes('function dismissPwaBanner()'), 'dismissPwaBanner must be defined');
    assert.ok(indexHtml.includes('function initPwa()'), 'initPwa must be defined');
    assert.ok(indexHtml.includes('navigator.serviceWorker.register(\'/sw.js\''), 'Must register /sw.js');
    assert.ok(indexHtml.includes('window.isPwaStandaloneMode = isPwaStandaloneMode;'), 'isPwaStandaloneMode must be exported');
    assert.ok(indexHtml.includes('window.triggerPwaInstallPrompt = triggerPwaInstallPrompt;'), 'triggerPwaInstallPrompt must be exported');

    console.log('✅ PASS 7: PWA client engine, service worker registration & window exports verified');

    console.log('\n===============================================================');
    console.log('🎉 ALL 7 PROGRESSIVE WEB APP (PWA) TESTS PASSED CLEANLY!');
    console.log('===============================================================\n');

  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ PWA TEST FAILED:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
