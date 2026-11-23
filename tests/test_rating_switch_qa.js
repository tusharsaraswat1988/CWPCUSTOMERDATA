const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Read files
const homeHtml = fs.readFileSync(path.resolve(__dirname, '../public/home.html'), 'utf8');
const homeJs = fs.readFileSync(path.resolve(__dirname, '../public/js/home.js'), 'utf8');
const configJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/homepage_config.json'), 'utf8'));

console.log('Testing Rating Links & Decoupling...');

// 1. Check default HTML has car review URL
assert.ok(homeHtml.includes('id="heroGoogleRatingBadge"'), 'heroGoogleRatingBadge ID missing');
assert.ok(homeHtml.includes('href="https://share.google/BptJhx2p3xlUiIC4d"'), 'Default car review link missing in HTML');
assert.ok(homeHtml.includes('id="btnReadAllReviews"'), 'btnReadAllReviews ID missing');
assert.ok(homeHtml.includes('id="officeMapBtn"'), 'officeMapBtn ID missing');

// 2. Check config has both URLs
assert.strictEqual(configJson.contact.googleMapsUrl, 'https://share.google/BptJhx2p3xlUiIC4d');
assert.strictEqual(configJson.contact.googleReviewCarUrl, 'https://share.google/BptJhx2p3xlUiIC4d');
assert.strictEqual(configJson.contact.googleReviewSolarUrl, 'https://share.google/1sg9sRwZpnyFeYQty');

// 3. Check home.js logic
assert.ok(homeJs.includes('GOOGLE_REVIEW_URL_CAR = \'https://share.google/BptJhx2p3xlUiIC4d\''));
assert.ok(homeJs.includes('GOOGLE_REVIEW_URL_SOLAR = \'https://share.google/1sg9sRwZpnyFeYQty\''));
assert.ok(homeJs.includes('updateRatingAndReviewLinks'));

console.log('✅ All rating and review URL decoupling checks passed successfully!');
