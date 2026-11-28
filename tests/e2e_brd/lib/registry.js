'use strict';

const { FEATURE_IDS } = require('./config');

const THRESHOLDS = {
  perFeatureTier1Min: 5,
  perFeatureTier2Min: 5,
  tier1Min: 55,
  tier2Min: 55,
  tier3Min: 11,
  tier4Min: 6,
  totalMin: 127
};

class TestRegistry {
  constructor() {
    this.tests = [];
    this.seenIds = new Set();
  }

  register({ id, tier, feature, title, fn }) {
    if (!id || typeof id !== 'string') {
      throw new Error('Test id must be a non-empty string');
    }
    if (this.seenIds.has(id)) {
      throw new Error(`Duplicate test id detected: ${id}`);
    }
    if (![1, 2, 3, 4].includes(tier)) {
      throw new Error(`Invalid tier ${tier} for test ${id}`);
    }
    if (typeof fn !== 'function') {
      throw new Error(`Test ${id} is missing test function`);
    }
    if (!title || typeof title !== 'string') {
      throw new Error(`Test ${id} is missing title`);
    }
    const featureList = Array.isArray(feature) ? feature : [feature];
    for (const f of featureList) {
      if (!FEATURE_IDS.includes(f)) {
        throw new Error(`Invalid feature id "${f}" on test ${id}`);
      }
    }

    this.seenIds.add(id);
    this.tests.push({
      id,
      tier,
      feature: featureList[0],
      features: featureList,
      title,
      fn
    });
  }

  validateThresholds() {
    const errors = [];
    const byTier = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const tier1ByFeature = Object.fromEntries(FEATURE_IDS.map((f) => [f, 0]));
    const tier2ByFeature = Object.fromEntries(FEATURE_IDS.map((f) => [f, 0]));
    const coveredTier3Features = new Set();
    const coveredTier4Features = new Set();

    for (const t of this.tests) {
      byTier[t.tier] += 1;
      if (t.tier === 1) {
        tier1ByFeature[t.feature] += 1;
      } else if (t.tier === 2) {
        tier2ByFeature[t.feature] += 1;
      } else if (t.tier === 3) {
        for (const f of t.features) coveredTier3Features.add(f);
      } else if (t.tier === 4) {
        for (const f of t.features) coveredTier4Features.add(f);
      }
    }

    if (byTier[1] < THRESHOLDS.tier1Min) {
      errors.push(`Tier 1 count ${byTier[1]} < minimum ${THRESHOLDS.tier1Min}`);
    }
    if (byTier[2] < THRESHOLDS.tier2Min) {
      errors.push(`Tier 2 count ${byTier[2]} < minimum ${THRESHOLDS.tier2Min}`);
    }
    if (byTier[3] < THRESHOLDS.tier3Min) {
      errors.push(`Tier 3 count ${byTier[3]} < minimum ${THRESHOLDS.tier3Min}`);
    }
    if (byTier[4] < THRESHOLDS.tier4Min) {
      errors.push(`Tier 4 count ${byTier[4]} < minimum ${THRESHOLDS.tier4Min}`);
    }
    if (this.tests.length < THRESHOLDS.totalMin) {
      errors.push(`Total test count ${this.tests.length} < minimum ${THRESHOLDS.totalMin}`);
    }

    for (const f of FEATURE_IDS) {
      if (tier1ByFeature[f] < THRESHOLDS.perFeatureTier1Min) {
        errors.push(`${f} Tier 1 count ${tier1ByFeature[f]} < ${THRESHOLDS.perFeatureTier1Min}`);
      }
      if (tier2ByFeature[f] < THRESHOLDS.perFeatureTier2Min) {
        errors.push(`${f} Tier 2 count ${tier2ByFeature[f]} < ${THRESHOLDS.perFeatureTier2Min}`);
      }
      if (!coveredTier3Features.has(f)) {
        errors.push(`${f} is not exercised by any Tier 3 pairwise test`);
      }
      if (!coveredTier4Features.has(f)) {
        errors.push(`${f} is not exercised by any Tier 4 scenario`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      summary: {
        total: this.tests.length,
        byTier,
        tier1ByFeature,
        tier2ByFeature
      }
    };
  }

  getFiltered(tierArg) {
    if (!tierArg || tierArg === 'all') return this.tests.slice();
    const numericTier = Number(tierArg);
    return this.tests.filter((t) => t.tier === numericTier);
  }
}

async function runRegisteredTests(registry, { tier = 'all', context, verbose = false }) {
  const selected = registry.getFiltered(tier);
  let passed = 0;
  let failed = 0;
  const failures = [];
  const tierStats = {
    1: { passed: 0, failed: 0 },
    2: { passed: 0, failed: 0 },
    3: { passed: 0, failed: 0 },
    4: { passed: 0, failed: 0 }
  };

  for (const tc of selected) {
    const start = Date.now();
    try {
      await tc.fn(context);
      const elapsed = Date.now() - start;
      passed += 1;
      tierStats[tc.tier].passed += 1;
      console.log(`[T${tc.tier}][${tc.id}] ${tc.title} ... PASS (${elapsed}ms)`);
    } catch (err) {
      const elapsed = Date.now() - start;
      failed += 1;
      tierStats[tc.tier].failed += 1;
      failures.push({ id: tc.id, tier: tc.tier, title: tc.title, error: err });
      console.log(`[T${tc.tier}][${tc.id}] ${tc.title} ... FAIL (${elapsed}ms)`);
      console.error(`    -> ${err && err.message ? err.message : String(err)}`);
      if (verbose && err && err.stack) {
        console.error(err.stack.split('\n').slice(1, 5).map((l) => `       ${l}`).join('\n'));
      }
    }
  }

  console.log('\n=== Tier Summary ===');
  for (const t of [1, 2, 3, 4]) {
    const s = tierStats[t];
    if (s.passed + s.failed > 0) {
      console.log(`Tier ${t}: Passed=${s.passed}, Failed=${s.failed}`);
    }
  }
  console.log(`Passed: ${passed}, Failed: ${failed}`);

  return { passed, failed, failures, tierStats };
}

module.exports = {
  THRESHOLDS,
  TestRegistry,
  runRegisteredTests
};
