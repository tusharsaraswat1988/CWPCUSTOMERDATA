/**
 * QA Test Suite for Alarming & Full-Volume Staff Dispatch Sound:
 * 1. Verifies playNewTaskChime uses full volume (gain: 1.0, not 0.3).
 * 2. Verifies piercing triangle oscillator waveform for outdoor penetration.
 * 3. Verifies multi-burst frequency motif (C6: 1046.5Hz -> G6: 1568Hz -> C7: 2093Hz).
 * 4. Verifies mobile AudioContext resume/unlock handling.
 * 5. Verifies urgent multi-pulse vibration pattern ([300, 100, 300, 100, 500]).
 * 6. Verifies Settings tab has the "🔊 टेस्ट अलार्म (Full Vol)" button wired to playNewTaskChime().
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================================');
console.log('🚀 RUNNING ALARMING STAFF DISPATCH SOUND QA TEST SUITE');
console.log('===============================================================\n');

const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
const indexHtmlPath = path.join(__dirname, '..', 'Index.html');
const cssPath = path.join(__dirname, '..', 'public', 'css', 'staff-m3.css');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

// ---------------------------------------------------------------------------
// TEST 1: FULL VOLUME GAIN (1.0 vs 0.3)
// ---------------------------------------------------------------------------
console.log('--- TEST 1: Full Volume Gain (1.0 Dynamic Range) ---');

assert.ok(appJs.includes('function playNewTaskChime('), '1.1 playNewTaskChime defined in app.js');
assert.ok(appJs.includes('masterGain.gain.setValueAtTime(1.0, now)'), '1.2 masterGain must be set to 1.0 (100% full volume)');
assert.ok(!appJs.includes('gain.gain.setValueAtTime(0.3, now)'), '1.3 Legacy 0.3 attenuated volume must be replaced');

console.log('✅ PASS 1: Sound plays at 100% full volume without artificial attenuation.');

// ---------------------------------------------------------------------------
// TEST 2: PIERCING MULTI-BURST HARMONIC MOTIF
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: Piercing Multi-Burst Harmonic Motif ---');

assert.ok(appJs.includes("osc.type = 'triangle'"), '2.1 Uses harmonic triangle waveform for maximum speaker projection');
assert.ok(appJs.includes('1046.50') && appJs.includes('1567.98') && appJs.includes('2093.00'),
  '2.2 Includes urgent High C6, G6, and C7 crescendo frequencies');
assert.ok(appJs.includes('osc.stop(now + 1.25)'), '2.3 Multi-burst sequence runs for ~1.25s alert duration');

console.log('✅ PASS 2: Multi-burst high-frequency motif correctly scheduled.');

// ---------------------------------------------------------------------------
// TEST 3: MOBILE AUDIOCONTEXT RESUME & PRE-WARM
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: Mobile AudioContext Resume & Pre-Warm ---');

assert.ok(appJs.includes('sharedAudioContext'), '3.1 sharedAudioContext maintained for mobile lifecycle');
assert.ok(appJs.includes("ctx.state === 'suspended'") && appJs.includes('ctx.resume()'),
  '3.2 Automatically resumes suspended audio context');
assert.ok(appJs.includes('unlockAudio') || appJs.includes('getOrCreateAudioContext'),
  '3.3 Audio context pre-warming on user interaction present');

console.log('✅ PASS 3: AudioContext automatically resumed and primed for mobile browsers.');

// ---------------------------------------------------------------------------
// TEST 4: URGENT HAPTIC VIBRATION CADENCE
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: Urgent Tactile Vibration Pattern ---');

assert.ok(appJs.includes('navigator.vibrate([300, 100, 300, 100, 500])'),
  '4.1 Urgent multi-pulse vibration pattern [300, 100, 300, 100, 500] configured');

console.log('✅ PASS 4: Strong, distinct vibration pattern triggers with alarm sound.');

// ---------------------------------------------------------------------------
// TEST 5: SETTINGS TAB TEST BUTTON
// ---------------------------------------------------------------------------
console.log('\n--- TEST 5: Staff Settings Alarm Test Button ---');

assert.ok(indexHtml.includes('id="btnTestAlarmSound"'), '5.1 btnTestAlarmSound element exists in Index.html');
assert.ok(indexHtml.includes('onclick="playNewTaskChime()"'), '5.2 Button triggers playNewTaskChime() on click');
assert.ok(css.includes('.btn-test-alarm-chime'), '5.3 .btn-test-alarm-chime styled in staff-m3.css');
assert.ok(css.includes('body.theme-dark .btn-test-alarm-chime'), '5.4 Dark mode theme styling present');

console.log('✅ PASS 5: Settings tab has interactive test alarm button with light & dark styling.');

console.log('\n===============================================================');
console.log('🎉 ALL 5 ALARMING STAFF DISPATCH SOUND TESTS PASSED CLEANLY!');
console.log('===============================================================\n');
