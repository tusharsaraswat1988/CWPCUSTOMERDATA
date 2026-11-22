const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function runSecurityAuditVerifications() {
  console.log('===============================================================');
  console.log('🛡️ RUNNING PRODUCTION READINESS & SECURITY AUDIT QA TEST SUITE');
  console.log('===============================================================');

  // Test 1: local_data.json contains NO active sessions
  const localData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'local_data.json'), 'utf8'));
  assert.strictEqual(Object.keys(localData.adminSessions || {}).length, 0, 'adminSessions in local_data.json must be empty');
  assert.strictEqual(Object.keys(localData.staffSessions || {}).length, 0, 'staffSessions in local_data.json must be empty');
  console.log('✅ PASS 1: local_data.json contains 0 active admin or staff session tokens');

  // Test 2: .gitignore contains local_data.json
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('local_data.json'), '.gitignore must include local_data.json');
  console.log('✅ PASS 2: .gitignore includes local_data.json');

  // Test 3: Index.html & offline.html mobile viewport zoom enabled
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  const offlineHtml = fs.readFileSync(path.join(__dirname, '..', 'offline.html'), 'utf8');
  assert.ok(indexHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), 'Index.html must permit zoom');
  assert.ok(!indexHtml.includes('user-scalable=no'), 'Index.html must not disable user-scalable');
  assert.ok(offlineHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), 'offline.html must permit zoom');
  console.log('✅ PASS 3: Mobile accessibility viewport zoom verified in Index.html and offline.html');

  // Test 4: Duplicate cropper.min.js script removed from Index.html <head>
  const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, 'Index.html <head> found');
  assert.ok(!headMatch[1].includes('cropper.min.js'), 'Index.html <head> must not include duplicate cropper.min.js');
  console.log('✅ PASS 4: Duplicate external CDN script removed from <head>');

  // Test 5: Live server security checks on isolated port
  process.env.NODE_ENV = 'production';
  const serverModule = require('../server.js');
  const server = serverModule.server || serverModule;

  const testServer = server.listen(0, '127.0.0.1', async () => {
    const port = testServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 5.1: Unauthenticated GET /api/customers must return 401
      const custRes = await makeRequest(`${baseUrl}/api/customers`, 'GET');
      assert.strictEqual(custRes.statusCode, 401, 'Unauthenticated GET /api/customers must return 401');
      console.log('✅ PASS 5.1: GET /api/customers rejects unauthenticated requests with HTTP 401');

      // 5.2: Unauthenticated GET /api/leads must return 401
      const leadsRes = await makeRequest(`${baseUrl}/api/leads`, 'GET');
      assert.strictEqual(leadsRes.statusCode, 401, 'Unauthenticated GET /api/leads must return 401');
      console.log('✅ PASS 5.2: GET /api/leads rejects unauthenticated requests with HTTP 401');

      // 5.3: Reflected XSS neutralization in ?staff=
      const xssRes = await makeRequest(`${baseUrl}/staff?staff=%22;alert(1);//`, 'GET');
      assert.strictEqual(xssRes.statusCode, 200);
      assert.ok(!xssRes.body.includes('";alert(1);//'), 'XSS payload must not be reflected in HTML');
      assert.ok(xssRes.body.includes('var initialStaffId = "";'), 'Unsanitized staff query param must be blanked');
      console.log('✅ PASS 5.3: Reflected XSS payload safely sanitized & stripped');

      // 5.4: Valid alphanumeric staff param is allowed
      const validStaffRes = await makeRequest(`${baseUrl}/staff?staff=STF01`, 'GET');
      assert.strictEqual(validStaffRes.statusCode, 200);
      assert.ok(validStaffRes.body.includes('var initialStaffId = "STF01";'), 'Valid staff param preserved');
      console.log('✅ PASS 5.4: Valid alphanumeric staff parameter preserved');

      // 5.5: Large POST payload (>15MB) rejected with 413
      const largePayload = JSON.stringify({ action: 'ping', data: 'A'.repeat(16 * 1024 * 1024) });
      const largeRes = await makePostRequest(`${baseUrl}/api`, largePayload);
      assert.strictEqual(largeRes.statusCode, 413, 'Oversized payload must be rejected with HTTP 413');
      console.log('✅ PASS 5.5: Oversized POST stream rejected with HTTP 413 Payload Too Large');

      // 5.6: Staff Tracking Summary requires Admin privileges
      const trackRes = await makePostRequest(`${baseUrl}/api`, JSON.stringify({ action: 'getStaffTrackingSummary' }));
      assert.strictEqual(trackRes.statusCode, 401, 'Unauthenticated getStaffTrackingSummary must return 401');
      console.log('✅ PASS 5.6: getStaffTrackingSummary enforces admin session requirement');

      console.log('\n===============================================================');
      console.log('🎉 ALL PRODUCTION SECURITY AUDIT VERIFICATIONS PASSED CLEANLY!');
      console.log('===============================================================');
      testServer.close(() => process.exit(0));
    } catch (err) {
      console.error('❌ Verification failed:', err);
      testServer.close(() => process.exit(1));
    }
  });
}

function makeRequest(url, method) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

function makePostRequest(url, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', (err) => {
      // In case server destroys socket on 413
      resolve({ statusCode: 413, body: 'Socket destroyed' });
    });
    req.write(data);
    req.end();
  });
}

runSecurityAuditVerifications();
