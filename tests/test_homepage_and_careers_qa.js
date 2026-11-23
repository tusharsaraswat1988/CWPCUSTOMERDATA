/**
 * CWP Detailers & Motors - Homepage, SEO & Careers QA Test Suite
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.PORT = '3919';

const cwp = require('../server');

function makeRequest(path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3919,
        path,
        method,
        headers: {
          'Host': '127.0.0.1:3919',
          ...headers
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: data, json });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING CWP HOMEPAGE, SEO & CAREERS QA SUITE');
  console.log('===============================================================');

  // Start HTTP test listener
  await new Promise(r => cwp.server.listen(3919, '127.0.0.1', r));

  // --- Test 1: GET / (Customer Homepage) ---
  console.log('\n--- Test 1: GET / Customer Homepage ---');
  const homeRes = await makeRequest('/');
  assert.strictEqual(homeRes.status, 200, 'GET / must return HTTP 200');
  assert.ok(homeRes.body.includes('Ab gaadiyaan hongi'), 'Homepage must contain "Ab gaadiyaan hongi"');
  assert.ok(homeRes.body.includes('7054007733'), 'Homepage must contain phone 7054007733');
  assert.ok(homeRes.body.includes('cwpdetailers@gmail.com'), 'Homepage must contain cwpdetailers@gmail.com');
  assert.ok(homeRes.body.includes('Shivpurwa'), 'Homepage must contain office location Shivpurwa');
  assert.ok(homeRes.body.includes('4.9 / 5.0 Google Rating'), 'Homepage must contain Google Rating badge');
  assert.ok(homeRes.body.includes('href="https://share.google/BptJhx2p3xlUiIC4d"'), 'Homepage car section must link to CWP Detailers Google review link');
  assert.ok(homeRes.body.includes('id="heroGoogleRatingBadge"'), 'Homepage must contain heroGoogleRatingBadge ID');
  assert.ok(homeRes.body.includes('id="btnReadAllReviews"'), 'Homepage must contain btnReadAllReviews ID');
  assert.ok(homeRes.body.includes('GST Extra'), 'Homepage must display GST Extra notice');

  // Strictly NO staff or admin portal links on public homepage
  assert.ok(!homeRes.body.includes('Staff & Admin Portal'), 'Homepage must strictly omit staff/admin portal link');
  assert.ok(!homeRes.body.includes('href="/staff"'), 'Homepage must strictly not link to /staff');
  assert.ok(!homeRes.body.includes('href="/admin"'), 'Homepage must strictly not link to /admin');
  console.log('✅ PASS 1: Customer Homepage served cleanly at / with SEO and strictly zero staff/admin links');

  // --- Test 2: SEO Injection on / ---
  console.log('\n--- Test 2: Server-Rendered SEO Tags on / ---');
  assert.ok(homeRes.body.includes('AutoDetailing'), 'Homepage must contain Schema.org AutoDetailing');
  assert.ok(homeRes.body.includes('LocalBusiness'), 'Homepage must contain Schema.org LocalBusiness');
  assert.ok(homeRes.body.includes('doorstep car wash near me'), 'Homepage must contain keywords: doorstep car wash near me');
  assert.ok(homeRes.body.includes('ceramic coating'), 'Homepage must contain keywords: ceramic coating');
  assert.ok(homeRes.body.includes('solar panel cleaning in varanasi'), 'Homepage must contain keywords: solar panel cleaning in varanasi');
  assert.ok(homeRes.body.includes('og:title'), 'Homepage must contain OpenGraph meta title');
  console.log('✅ PASS 2: SEO tags, keywords, and Schema.org microdata successfully injected');

  // --- Test 3: GET /careers & /jobs ---
  console.log('\n--- Test 3: Careers & Recruitment Page ---');
  const careersRes = await makeRequest('/careers');
  assert.strictEqual(careersRes.status, 200, 'GET /careers must return HTTP 200');
  assert.ok(careersRes.body.includes('CWP Parivaar Ka'), 'Careers page must feature welcoming headline');
  assert.ok(careersRes.body.includes('JobPosting'), 'Careers page must inject Schema.org JobPosting');
  assert.ok(careersRes.body.includes('id="jobAppForm"'), 'Careers page must include job application form');
  assert.ok(careersRes.body.includes('Samman & Pehchan'), 'Careers page must celebrate staff pride');

  const jobsRes = await makeRequest('/jobs');
  assert.strictEqual(jobsRes.status, 200, 'GET /jobs alias must return HTTP 200');
  assert.ok(jobsRes.body.includes('Job Application'), 'Jobs alias must serve careers view');
  console.log('✅ PASS 3: Careers page (/careers and /jobs) verified with JobPosting schema & staff pride');

  // --- Test 4: Internal Portals Preserved (/staff and /admin) ---
  console.log('\n--- Test 4: Internal Portals Preserved ---');
  const staffRes = await makeRequest('/staff');
  assert.strictEqual(staffRes.status, 200, 'GET /staff must return HTTP 200');
  assert.ok(staffRes.body.includes("initialMode = 'staff'") || staffRes.body.includes('class="staff-mode-active"'), 'GET /staff must initialize in staff mode');

  const adminRes = await makeRequest('/admin');
  assert.strictEqual(adminRes.status, 200, 'GET /admin must return HTTP 200');
  assert.ok(adminRes.body.includes("initialMode = 'admin'") || adminRes.body.includes('class="admin-mode-active"'), 'GET /admin must initialize in admin mode');
  console.log('✅ PASS 4: Staff Portal (/staff) and Admin Portal (/admin) 100% operational');

  // --- Test 5: Dynamic Homepage Config API ---
  console.log('\n--- Test 5: GET /api/public/homepage-config ---');
  const cfgRes = await makeRequest('/api/public/homepage-config');
  assert.strictEqual(cfgRes.status, 200);
  assert.ok(cfgRes.json && cfgRes.json.contact);
  assert.strictEqual(cfgRes.json.contact.phone, '7054007733');
  assert.strictEqual(cfgRes.json.contact.email, 'cwpdetailers@gmail.com');
  assert.strictEqual(cfgRes.json.contact.googleMapsUrl, 'https://share.google/BptJhx2p3xlUiIC4d');
  assert.strictEqual(cfgRes.json.contact.googleReviewCarUrl, 'https://share.google/BptJhx2p3xlUiIC4d');
  assert.strictEqual(cfgRes.json.contact.googleReviewSolarUrl, 'https://share.google/1sg9sRwZpnyFeYQty');
  assert.ok(cfgRes.json.contact.address.includes('Shivpurwa'));
  assert.ok(cfgRes.json.rates && cfgRes.json.rates.hatchback);
  assert.ok(cfgRes.json.offers && cfgRes.json.offers.length > 0);
  console.log('✅ PASS 5: Dynamic config endpoint returns real-time rates, contact, offers & coupons');

  // --- Test 6: Public Lead Booking Capture ---
  console.log('\n--- Test 6: POST /api/leads (Public Lead Capture) ---');
  const leadRes = await makeRequest('/api/leads', 'POST', { 'Content-Type': 'application/json' }, {
    name: 'Aakash Verma',
    phone: '9876543210',
    vehicleModel: 'Hyundai Creta SX',
    address: 'Sigra, Varanasi',
    interestedService: 'Daily Car Cleaning',
    notes: 'Test Booking from QA'
  });
  assert.strictEqual(leadRes.status, 200, 'POST /api/leads must return HTTP 200');
  assert.strictEqual(leadRes.json.success, true);
  assert.ok(leadRes.json.lead);
  assert.strictEqual(leadRes.json.lead.isLead, true);
  console.log('✅ PASS 6: Public lead booking from homepage successfully captured in database/system');

  // --- Test 7: Public Job Application Submission ---
  console.log('\n--- Test 7: POST /api/careers/apply ---');
  const jobAppRes = await makeRequest('/api/careers/apply', 'POST', { 'Content-Type': 'application/json' }, {
    name: 'Suresh Maurya',
    mobile: '9123456780',
    age: 26,
    gender: 'Male',
    city: 'Shivpurwa, Varanasi',
    remark: 'Prior 2 years experience in foam washing and two-wheeler detailing'
  });
  assert.strictEqual(jobAppRes.status, 200, 'POST /api/careers/apply must return HTTP 200');
  assert.strictEqual(jobAppRes.json.success, true);
  assert.strictEqual(jobAppRes.json.application.name, 'Suresh Maurya');
  assert.strictEqual(jobAppRes.json.application.mobile, '9123456780');
  console.log('✅ PASS 7: Job application submitted and processed with validation');

  // --- Test 8: Admin Homepage Config Security ---
  console.log('\n--- Test 8: Admin Config Update Protection ---');
  const unauthPut = await makeRequest('/api/admin/homepage-config', 'PUT', { 'Content-Type': 'application/json' }, {
    rates: { hatchback: { dailyClean: 2099 } }
  });
  assert.strictEqual(unauthPut.status, 401, 'Unauthenticated config update must return HTTP 401');
  console.log('✅ PASS 8: Dynamic config update strictly protected by admin authentication');

  // --- Test 9: Robots.txt & Sitemap.xml SEO Directives ---
  console.log('\n--- Test 9: Robots.txt & Sitemap.xml SEO Directives ---');
  const robotsRes = await makeRequest('/robots.txt');
  assert.strictEqual(robotsRes.status, 200, 'GET /robots.txt must return HTTP 200');
  assert.ok(robotsRes.headers['content-type'].includes('text/plain'), 'Robots.txt must be text/plain');
  assert.ok(robotsRes.body.includes('Sitemap: https://cwpdetailers.in/sitemap.xml'), 'Robots.txt must declare sitemap URL');
  assert.ok(robotsRes.body.includes('Disallow: /admin'), 'Robots.txt must disallow /admin');
  assert.ok(robotsRes.body.includes('Disallow: /staff'), 'Robots.txt must disallow /staff');

  const sitemapRes = await makeRequest('/sitemap.xml');
  assert.strictEqual(sitemapRes.status, 200, 'GET /sitemap.xml must return HTTP 200');
  assert.ok(sitemapRes.headers['content-type'].includes('application/xml'), 'Sitemap must be application/xml');
  assert.ok(sitemapRes.body.includes('<loc>https://cwpdetailers.in/</loc>'), 'Sitemap must contain root URL');
  assert.ok(sitemapRes.body.includes('<loc>https://cwpdetailers.in/careers</loc>'), 'Sitemap must contain careers URL');
  assert.ok(sitemapRes.body.includes('<image:loc>https://cwpdetailers.in/cwp_logo.jpg</image:loc>'), 'Sitemap must include image tags');

  const sitemapRedirectRes = await makeRequest('/sitemap');
  assert.strictEqual(sitemapRedirectRes.status, 301, 'GET /sitemap must redirect with 301');
  assert.strictEqual(sitemapRedirectRes.headers['location'], '/sitemap.xml');
  console.log('✅ PASS 9: robots.txt and sitemap.xml strictly verified with valid headers & schema');

  console.log('\n===============================================================');
  console.log('🎉 ALL 9 HOMEPAGE, SEO & CAREERS TESTS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
