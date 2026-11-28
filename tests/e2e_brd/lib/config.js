'use strict';

const FEATURES = [
  { id: 'E2E-F1', name: 'Health, Admin Auth, CSRF Transport, Security Center & Settings' },
  { id: 'E2E-F2', name: 'Customers, Multi-Address, Multi-Car, Multi-Solar & VIEW-ONLY Profile' },
  { id: 'E2E-F3', name: 'Staff Management, 4 Boolean Capabilities & 4-6 Digit PIN Auth' },
  { id: 'E2E-F4', name: 'Master Catalog (4 Canonical Services, Flexible Packages, Solar Tiers, Global Add-Ons)' },
  { id: 'E2E-F5', name: 'Central Bookings Engine (Mandatory DCC Staff vs Deferred Non-DCC)' },
  { id: 'E2E-F6', name: 'Non-DCC Job Assignment & Server-Side 4-Capability Filtering' },
  { id: 'E2E-F7', name: 'DCC Route Planning, Global Vehicle Exclusivity, Drag-and-Drop & Temporary Cover' },
  { id: 'E2E-F8', name: 'DCC Daily Jobs, IST Schedulers (Daily/Alternate/EOD Missed) & Live Status' },
  { id: 'E2E-F9', name: 'Non-DCC 6-Step Lifecycle, Auto-Verify & Admin SSE' },
  { id: 'E2E-F10', name: 'Staff Portal Mobile PWA (/staff) & Live Tracking' },
  { id: 'E2E-F11', name: 'Leads, Public Homepage, Careers, ?v= Cache-Busting & Legacy Elimination' }
];

const FEATURE_IDS = FEATURES.map((f) => f.id);

const CANONICAL_SERVICES = ['dcc', 'car_wash', 'solar', 'detailing'];
const VALID_SEATER_TYPES = ['5_seater', '5_plus_seater'];
const NON_DCC_STATUSES = ['scheduled', 'assigned', 'enrolled', 'in_progress', 'completed', 'verified', 'cancelled'];
const DCC_JOB_STATUSES = ['auto_generated', 'completed', 'car_not_available', 'missed'];

function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    tier: 'all',
    selfTest: false,
    dryRun: false,
    baseUrl: '',
    browser: 'auto',
    verbose: false
  };

  for (const arg of argv) {
    if (arg === '--self-test') {
      opts.selfTest = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length).trim().toLowerCase();
    } else if (arg.startsWith('--base-url=')) {
      opts.baseUrl = arg.slice('--base-url='.length).trim();
    } else if (arg.startsWith('--browser=')) {
      opts.browser = arg.slice('--browser='.length).trim().toLowerCase();
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  if (!['all', '1', '2', '3', '4'].includes(opts.tier)) {
    throw new Error(`Invalid --tier value "${opts.tier}". Expected 1|2|3|4|all.`);
  }
  if (!['auto', 'cdp', 'http', 'none'].includes(opts.browser)) {
    throw new Error(`Invalid --browser value "${opts.browser}". Expected auto|cdp|http|none.`);
  }

  return opts;
}

function resolveBaseUrl(cliBaseUrl) {
  if (cliBaseUrl) return cliBaseUrl.replace(/\/+$/, '');
  if (process.env.TEST_BASE_URL) return process.env.TEST_BASE_URL.trim().replace(/\/+$/, '');
  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}`;
}

function getCredentials() {
  return {
    adminUsername: process.env.E2E_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
  };
}

function getIstDateParts(date = new Date()) {
  const istMs = date.getTime() + (5.5 * 60 * 60 * 1000);
  const d = new Date(istMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds()
  };
}

function getIstDateString(offsetDays = 0, baseDate = new Date()) {
  const adjusted = new Date(baseDate.getTime() + offsetDays * 86400000);
  const { year, month, day } = getIstDateParts(adjusted);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getIstDayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function isAlternateCleanDay(jobDateStr, anchorDateStr) {
  const jobIdx = getIstDayIndex(jobDateStr);
  const anchorIdx = anchorDateStr ? getIstDayIndex(anchorDateStr) : 0;
  return Math.abs(jobIdx - anchorIdx) % 2 === 0;
}

module.exports = {
  FEATURES,
  FEATURE_IDS,
  CANONICAL_SERVICES,
  VALID_SEATER_TYPES,
  NON_DCC_STATUSES,
  DCC_JOB_STATUSES,
  parseCliArgs,
  resolveBaseUrl,
  getCredentials,
  getIstDateParts,
  getIstDateString,
  getIstDayIndex,
  isAlternateCleanDay
};
