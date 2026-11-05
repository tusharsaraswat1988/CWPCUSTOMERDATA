const fs = require('fs');
const vm = require('vm');
const path = require('path');

console.log('===============================================================');
console.log('🧪 RUNNING PHOTO CROP & DEGREE-WISE ROTATION TEST SUITE');
console.log('===============================================================');

const indexPath = path.join(__dirname, '..', 'Index.html');
const html = fs.readFileSync(indexPath, 'utf8');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

// 1. Verify CSS styles for cropper & modal
assert(html.includes('.cropper-container'), 'Cropper container CSS exists in Index.html');
assert(html.includes('.cropper-modal-card'), 'Custom modal card CSS exists in Index.html');
assert(html.includes('.cropper-degree-badge'), 'Degree badge CSS exists in Index.html');
assert(html.includes('.cropper-range-slider'), 'Rotation range slider CSS exists in Index.html');
assert(html.includes('.btn-nudge-angle'), 'Degree nudge button CSS exists in Index.html');

// 2. Verify Cropper Modal HTML Elements
assert(html.includes('id="cwpPhotoCropperModal"'), 'Cropper modal overlay with id="cwpPhotoCropperModal" exists');
assert(html.includes('id="cwpCropperSourceImg"'), 'Source image element with id="cwpCropperSourceImg" exists');
assert(html.includes('id="cropperAngleSlider"'), 'Angle slider with id="cropperAngleSlider" exists');
assert(html.includes('min="-180" max="180"'), 'Angle slider has -180 to +180 degree range');
assert(html.includes('cropperNudgeAngle(-1)'), 'Fine -1° nudge button exists');
assert(html.includes('cropperNudgeAngle(1)'), 'Fine +1° nudge button exists');
assert(html.includes('cropperNudgeAngle(-5)'), 'Fine -5° nudge button exists');
assert(html.includes('cropperNudgeAngle(5)'), 'Fine +5° nudge button exists');
assert(html.includes('cropperResetAngle()'), 'Straighten (0°) reset angle button exists');
assert(html.includes('cropperStepRotate(-90)'), 'Quick 90° CCW rotate button exists');
assert(html.includes('cropperStepRotate(90)'), 'Quick 90° CW rotate button exists');
assert(html.includes('cropperStepRotate(180)'), '180° flip rotate button exists');
assert(html.includes('cropperFlipH()'), 'Flip Horizontal button exists');
assert(html.includes('cropperFlipV()'), 'Flip Vertical button exists');
assert(html.includes('btnAspectFree'), 'Free aspect ratio button exists');
assert(html.includes('btnAspect1_1'), '1:1 Square aspect ratio button exists');
assert(html.includes('btnAspect4_3'), '4:3 aspect ratio button exists');
assert(html.includes('btnAspect16_9'), '16:9 aspect ratio button exists');
assert(html.includes('btnAspect3_4'), '3:4 Portrait aspect ratio button exists');
assert(html.includes('applyCroppedPhoto()'), 'Apply and set cropped photo button exists');
assert(html.includes('closeCropperModal()'), 'Cancel/close cropper modal button exists');

// 3. Verify Add Customer and Edit Customer UI integration
assert(html.includes('custPhotoActionsWrap'), 'Add Customer has actions wrap (crop/rotate/remove)');
assert(html.includes('openExistingCustPhotoCropper()'), 'Add Customer preview allows re-cropping photo');
assert(html.includes('editPhotoActionsWrap'), 'Edit Customer has actions wrap (crop/rotate/remove)');
assert(html.includes('openExistingEditPhotoCropper()'), 'Edit Customer preview allows re-cropping photo');

// 4. Verify all script blocks parse with valid JavaScript syntax
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scriptIndex = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  scriptIndex++;
  const scriptContent = match[1];

  // Syntax check JS
  const cleanForVm = scriptContent.replace(/<\?=[^?]*\?>/g, "''");
  try {
    new vm.Script(cleanForVm);
    assert(true, `JavaScript syntax valid in script block ${scriptIndex}`);
  } catch (err) {
    assert(false, `JavaScript syntax error in script block ${scriptIndex}: ${err.message}`);
  }
}
assert(scriptIndex >= 2, `Found and validated all ${scriptIndex} script blocks`);

console.log('===============================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('===============================================================');
console.log('🎉 ALL PHOTO CROP & ROTATION TESTS PASSED!');
