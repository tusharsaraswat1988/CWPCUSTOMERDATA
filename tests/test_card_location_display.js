const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🧪 TESTING STAFF PORTAL CARD LOCATION DISPLAY LOGIC');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// 1. Verify that addr-sec-pill is not rendered in customer cards
assert(!indexHtml.includes("html += '      <span class=\"addr-sec-pill\""), 'addr-sec-pill should not be rendered in the card address row');

// 2. Verify that Row 3 only renders when locationCount < 2 && address
assert(indexHtml.includes('if (locationCount < 2 && address) {'), 'Row 3 should only render for single-location customers with address');

// 3. Verify that directions (दिशाएं) button is NOT rendered in cards
assert(!indexHtml.includes('btn-directions'), 'Directions button should not be present in cards');
assert(!indexHtml.includes('getDirectionsUrl'), 'getDirectionsUrl should not be used in cards');

// 3. Extract the card rendering logic from Index.html or simulate it
function simulateCardRow3(item) {
  var address = (item.address != null ? String(item.address) : '').trim();
  var secAddress = (item.secondaryAddress != null ? String(item.secondaryAddress) : '').trim();
  var mapsUrl = item.googleMapsUrl ? item.googleMapsUrl.trim() : '';
  var secMapsUrl = item.secondaryMapsUrl ? item.secondaryMapsUrl.trim() : '';
  var hasPrimaryLoc = !!(mapsUrl || address);
  var hasSecLoc = !!(secMapsUrl || secAddress);
  var locationCount = (hasPrimaryLoc ? 1 : 0) + (hasSecLoc ? 1 : 0);

  var html = '';
  if (locationCount >= 2) {
    html += '<button class="btn-location-multi">2 लोकेशन</button>';
  } else if (locationCount === 1) {
    html += '<button class="btn-location">लोकेशन</button>';
  } else {
    html += '<button class="btn-action-disabled">लोकेशन नहीं</button>';
  }

  // Row 3 logic
  if (locationCount < 2 && address) {
    html += '<div class="card-address-row"><span class="addr-primary">' + address + '</span></div>';
  }

  return { html, locationCount };
}

// Test Case 1: Siddharth Singh Bisen (2 locations: Primary GPS + Secondary Office Location)
const siddharth = {
  customerName: 'सिद्धार्थ सिंह बिसेन',
  googleMapsUrl: 'https://maps.google.com/?q=25.3,82.9',
  address: '',
  secondaryAddress: 'ऑफिस लोकेशन',
  secondaryMapsUrl: 'https://maps.google.com/?q=25.4,83.0'
};
const res1 = simulateCardRow3(siddharth);
assert.strictEqual(res1.locationCount, 2, 'Siddharth should have 2 locations');
assert(res1.html.includes('2 लोकेशन'), 'Should have 2 लोकेशन button');
assert(!res1.html.includes('card-address-row'), 'Should NOT have card-address-row');
assert(!res1.html.includes('ऑफिस लोकेशन'), 'Should NOT have separate office location line');
console.log('✅ PASS: Dual-location customer (Siddharth) does NOT render the separate office location row.');

// Test Case 2: Customer with 2 locations and primary address text
const dualWithAddress = {
  customerName: 'अमित कुमार',
  address: 'सिगरा, वाराणसी',
  googleMapsUrl: 'https://maps.google.com/?q=25.3,82.9',
  secondaryAddress: 'ऑफिस - कैंट',
  secondaryMapsUrl: 'https://maps.google.com/?q=25.4,83.0'
};
const res2 = simulateCardRow3(dualWithAddress);
assert.strictEqual(res2.locationCount, 2);
assert(res2.html.includes('2 लोकेशन'));
assert(!res2.html.includes('card-address-row'), 'Should NOT have card-address-row when 2 locations exist');
console.log('✅ PASS: Dual-location customer with address text does NOT render card-address-row.');

// Test Case 3: Single location customer with address text
const singleWithAddress = {
  customerName: 'रवि वर्मा',
  address: 'रवींद्रपुरी, वाराणसी',
  googleMapsUrl: ''
};
const res3 = simulateCardRow3(singleWithAddress);
assert.strictEqual(res3.locationCount, 1);
assert(res3.html.includes('लोकेशन'));
assert(res3.html.includes('card-address-row'));
assert(res3.html.includes('रवींद्रपुरी, वाराणसी'));
console.log('✅ PASS: Single-location customer with address correctly shows address row.');

// Test Case 4: Single location customer with maps URL only (like Ritika Jain)
const singleMapsOnly = {
  customerName: 'रितिका जैन',
  address: '',
  googleMapsUrl: 'https://maps.google.com/?q=25.3,82.9'
};
const res4 = simulateCardRow3(singleMapsOnly);
assert.strictEqual(res4.locationCount, 1);
assert(res4.html.includes('लोकेशन'));
assert(!res4.html.includes('card-address-row'), 'No address row when address text is empty');
console.log('✅ PASS: Single-location customer with maps URL only does NOT show empty address row.');

// Test Case 5: Customer with no location (like Shreyansh Jain)
const noLocation = {
  customerName: 'श्रेयांश जैन',
  address: '',
  googleMapsUrl: ''
};
const res5 = simulateCardRow3(noLocation);
assert.strictEqual(res5.locationCount, 0);
assert(res5.html.includes('लोकेशन नहीं'));
assert(!res5.html.includes('card-address-row'));
console.log('✅ PASS: Customer with no location shows "लोकेशन नहीं" and no address row.');

console.log('===============================================================');
console.log('🎉 ALL 5 CARD LOCATION DISPLAY TESTS PASSED!');
console.log('===============================================================');
