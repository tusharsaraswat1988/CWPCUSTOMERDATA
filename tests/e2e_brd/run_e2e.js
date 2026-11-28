#!/usr/bin/env node
'use strict';

const { parseCliArgs, resolveBaseUrl, getCredentials, FEATURES } = require('./lib/config');
const { TestRegistry, runRegisteredTests } = require('./lib/registry');
const { OpaqueHttpClient } = require('./lib/http_client');
const { BrowserDriver } = require('./lib/browser_driver');
const { createMockBrdServer } = require('./lib/mock_brd_server');
const { registerTier1Tests } = require('./tiers/tier1_features');
const { registerTier2Tests } = require('./tiers/tier2_boundaries');
const { registerTier3Tests } = require('./tiers/tier3_pairwise');
const { registerTier4Tests } = require('./tiers/tier4_scenarios');

function buildRegistry() {
  const registry = new TestRegistry();
  registerTier1Tests(registry);
  registerTier2Tests(registry);
  registerTier3Tests(registry);
  registerTier4Tests(registry);
  return registry;
}

function printDryRunReport(registry, validation, tierFilter) {
  console.log('=== CWP BRD E2E Test Suite — Dry Run Inventory ===');
  const filtered = registry.getFiltered(tierFilter);
  for (const tc of filtered) {
    console.log(`[T${tc.tier}][${tc.id}] (${tc.features.join(',')}) ${tc.title}`);
  }
  console.log('\n=== Coverage Threshold Validation ===');
  console.log(
    `Totals: Tier1=${validation.summary.byTier[1]}, Tier2=${validation.summary.byTier[2]}, Tier3=${validation.summary.byTier[3]}, Tier4=${validation.summary.byTier[4]}, Total=${validation.summary.total}`
  );
  for (const f of FEATURES) {
    const t1 = validation.summary.tier1ByFeature[f.id] || 0;
    const t2 = validation.summary.tier2ByFeature[f.id] || 0;
    console.log(`  ${f.id}: Tier1=${t1}, Tier2=${t2} — ${f.name}`);
  }
  if (!validation.valid) {
    console.error('\nThreshold validation FAILED:');
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    return false;
  }
  console.log('\nDry-run validation PASSED.');
  return true;
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs();
  } catch (err) {
    console.error(`CLI Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    console.log('Usage: node tests/e2e_brd/run_e2e.js [--tier=1|2|3|4|all] [--self-test] [--dry-run] [--base-url=<url>] [--browser=auto|cdp|http|none] [--verbose]');
    return;
  }

  const registry = buildRegistry();
  const validation = registry.validateThresholds();

  if (opts.dryRun) {
    const ok = printDryRunReport(registry, validation, opts.tier);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (!validation.valid) {
    console.error('Coverage threshold validation failed before execution:');
    for (const err of validation.errors) console.error(`  - ${err}`);
    process.exitCode = 1;
    return;
  }

  const creds = getCredentials();
  let mockServer = null;
  let browserDriver = null;

  try {
    let baseUrl;
    if (opts.selfTest) {
      mockServer = createMockBrdServer({
        adminUsername: creds.adminUsername,
        adminPassword: creds.adminPassword
      });
      const started = await mockServer.start();
      baseUrl = started.baseUrl;
    } else {
      baseUrl = resolveBaseUrl(opts.baseUrl);
      const probe = new OpaqueHttpClient(baseUrl);
      let health;
      try {
        health = await probe.get('/health');
      } catch (err) {
        throw new Error(`Live server preflight failed at ${baseUrl}/health: ${err.message}`);
      }
      if (health.status !== 200 || !health.json || health.json.status !== 'ok') {
        throw new Error(`Unexpected /health response from ${baseUrl}: status=${health.status}`);
      }
    }

    const rootHttpClient = new OpaqueHttpClient(baseUrl);
    browserDriver = new BrowserDriver({
      browserMode: opts.browser,
      httpClient: rootHttpClient
    });
    const activeBrowserMode = await browserDriver.init();

    console.log(`=== CWP BRD E2E Test Runner ===`);
    console.log(`Mode: ${opts.selfTest ? 'self-test (mock BRD server)' : 'live'} | BaseURL: ${baseUrl} | Tier: ${opts.tier} | BrowserMode: ${activeBrowserMode}`);

    let sharedAdminClient = null;
    const context = {
      baseUrl,
      creds,
      browser: browserDriver,
      newClient() {
        return new OpaqueHttpClient(baseUrl);
      },
      async getAdminClient() {
        if (sharedAdminClient) {
          return sharedAdminClient;
        }
        const client = new OpaqueHttpClient(baseUrl);
        const res = await client.adminLogin({
          username: creds.adminUsername,
          password: creds.adminPassword,
          useCookies: true
        });
        if (res.status !== 200 || !res.json || !res.json.success) {
          throw new Error(`Shared admin login failed (${res.status}): ${res.text}`);
        }
        sharedAdminClient = client;
        return sharedAdminClient;
      }
    };

    // Pre-authenticate shared admin client before running rate-limit tests in Tier 2
    await context.getAdminClient();

    const result = await runRegisteredTests(registry, {
      tier: opts.tier,
      context,
      verbose: opts.verbose
    });

    process.exitCode = result.failed > 0 ? 1 : 0;
  } catch (err) {
    console.error(`Runner Fatal Error: ${err && err.message ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    if (browserDriver) {
      await browserDriver.close().catch(() => {});
    }
    if (mockServer) {
      await mockServer.stop().catch(() => {});
    }
  }
}

main();
