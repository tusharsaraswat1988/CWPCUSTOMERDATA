/**
 * =========================================================================
 * Unified P0 E2E QA Test Runner (Tiers 1-4)
 * Runs all 4 isolated P0 E2E suites sequentially in child Node processes
 * with NODE_ENV=test and DATABASE_URL stripped.
 * =========================================================================
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = [
  'test_p0_e2e_completion_integrity_qa.js',
  'test_p0_e2e_offline_sync_qa.js',
  'test_p0_e2e_checklist_identity_qa.js',
  'test_p0_e2e_cross_engine_qa.js'
];

const cleanEnv = { ...process.env, NODE_ENV: 'test' };
delete cleanEnv.DATABASE_URL;
delete cleanEnv.DATABASE_URL_UNPOOLED;
delete cleanEnv.FORCE_NEON_IN_TEST;

let totalPassed = 0;
let totalFailed = 0;
const suiteResults = [];

for (const file of SUITES) {
  const fullPath = path.join(__dirname, file);
  console.log(`\n=================================================================`);
  console.log(`Running ${file}`);
  console.log(`=================================================================`);

  const res = spawnSync(process.execPath, [fullPath], {
    env: cleanEnv,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
  const m = combined.match(/Passed:\s*(\d+),\s*Failed:\s*(\d+)/);
  const p = m ? parseInt(m[1], 10) : 0;
  const f = m ? parseInt(m[2], 10) : (res.status === 0 ? 0 : 1);
  totalPassed += p;
  totalFailed += f;

  suiteResults.push({
    file,
    exitCode: res.status,
    passed: p,
    failed: f
  });
}

console.log(`\n=================================================================`);
console.log(`P0 E2E QA OVERALL SUMMARY`);
console.log(`=================================================================`);
for (const r of suiteResults) {
  console.log(`${r.exitCode === 0 ? 'PASS' : 'FAIL'} ${r.file} -> passed=${r.passed}, failed=${r.failed}, exit=${r.exitCode}`);
}
console.log(`TOTAL: Passed=${totalPassed}, Failed=${totalFailed}`);

process.exit(totalFailed > 0 || suiteResults.some(r => r.exitCode !== 0) ? 1 : 0);
