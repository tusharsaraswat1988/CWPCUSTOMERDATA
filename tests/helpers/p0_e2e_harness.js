/**
 * =========================================================================
 * P0 Operational Integrity E2E Test Harness
 *
 * Provides a completely isolated, Neon-free transactional PostgreSQL engine
 * and in-process HTTP dispatcher (`POST /api` & `/api/see/*`) for E2E QA
 * across Tiers 1-4 without modifying production code or touching `.env`.
 *
 * Guarantees:
 * - Blocks `pg.Pool` / `pg.Client` and `db.getPool()` loudly.
 * - Directs `DATA_FILE` to an isolated temporary file cleaned up on teardown.
 * - Models PostgreSQL READ COMMITTED + `SELECT ... FOR UPDATE` +
 *   `pg_advisory_xact_lock` FIFO mutexes + copy-on-write TX rollback.
 * - Enforces CWP unique constraints (`23505`), check constraints (`23514`),
 *   and immutability triggers (`entitlement_ledger`, `purchase_snapshots`,
 *   `staff_assignments`).
 * - Supports mid-tx fault injection, post-commit simulated network drops,
 *   and timing delays for deterministic concurrency & recovery testing.
 * - Throws `[P0Harness] Unsupported SQL:` on any unrecognized query.
 * =========================================================================
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const JSONB_COLUMNS = new Set([
  'checklist_requirements',
  'proof_requirements',
  'service_payload',
  'before_photos',
  'after_photos',
  'checklist_results',
  'proof_photos',
  'proof_urls',
  'measurements',
  'customer_confirmation',
  'execution_config',
  'city_zone_eligibility',
  'pricing_config',
  'pricing_bands',
  'city_zone_applicability',
  'recurrence_config',
  'blackout_config',
  'default_service_capabilities',
  'default_addon_capabilities',
  'equipment_requirements',
  'operational_restrictions',
  'service_capabilities',
  'allowed_cities',
  'allowed_zones',
  'equipment_available',
  'service_definitions',
  'addon_definitions',
  'quantities',
  'frequencies',
  'validity',
  'terms',
  'before_state',
  'after_state',
  'device_metadata',
  'punch_metadata',
  'site_details',
  'snapshot',
  'entity_applicability',
  'config'
]);

const TERMINAL_EXECUTION_OUTCOMES = new Set([
  'completed',
  'partial_exception',
  'failed',
  'no_show',
  'unable_to_complete'
]);

const ALL_TABLES = [
  'service_categories',
  'customers',
  'vehicles',
  'service_locations',
  'staff',
  'staff_types',
  'staff_capability_overrides',
  'staff_assignments',
  'services',
  'service_versions',
  'service_frequencies',
  'holiday_blackouts',
  'addons',
  'addon_service_applicability',
  'packages',
  'package_benefits',
  'package_addons',
  'package_pricing_rules',
  'marketing_tags',
  'entity_marketing_tags',
  'media_assets',
  'purchase_snapshots',
  'entitlement_accounts',
  'entitlement_ledger',
  'customer_packages',
  'package_redemption_logs',
  'subscriptions',
  'subscription_vehicles',
  'routes',
  'route_stops',
  'service_jobs',
  'service_job_addons',
  'service_executions',
  'service_logs',
  'solar_verifications',
  'audit_logs'
];

const TOMBSTONE = Symbol('TOMBSTONE');

function deepClone(val) {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(deepClone);
  const out = {};
  for (const k of Object.keys(val)) {
    out[k] = deepClone(val[k]);
  }
  return out;
}

function makePgError(message, code, constraint = null) {
  const err = new Error(message);
  err.code = code;
  if (constraint) err.constraint = constraint;
  return err;
}

function toYmd(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function computeIstDate(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function maybeParseJsonb(col, val) {
  if (val === null || val === undefined) return val;
  if (!JSONB_COLUMNS.has(col)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.parse(t);
      } catch (_) {
        return val;
      }
    }
  }
  return val;
}

/**
 * Split string on delimiter at top-level (depth 0, outside single quotes)
 */
function splitTopLevel(str, delimiter = ',') {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      if (inQuote && str[i + 1] === "'") {
        i++;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && str.slice(i, i + delimiter.length) === delimiter) {
      parts.push(str.slice(start, i).trim());
      start = i + delimiter.length;
      i += delimiter.length - 1;
    }
  }
  const tail = str.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

/**
 * Split by top-level keyword (case-insensitive, word boundary)
 */
function splitTopLevelKeyword(str, keyword) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  const kwUpper = keyword.toUpperCase();
  const len = kwUpper.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'") {
      if (inQuote && str[i + 1] === "'") {
        i++;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const prev = i === 0 ? ' ' : str[i - 1];
      const next = i + len >= str.length ? ' ' : str[i + len];
      if (/\s/.test(prev) && /\s/.test(next) && str.slice(i, i + len).toUpperCase() === kwUpper) {
        parts.push(str.slice(start, i).trim());
        start = i + len;
        i += len - 1;
      }
    }
  }
  parts.push(str.slice(start).trim());
  return parts.filter(Boolean);
}

function stripOuterParens(expr) {
  let s = expr.trim();
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let inQuote = false;
    let wrapsAll = true;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "'") {
        if (inQuote && s[i + 1] === "'") {
          i++;
          continue;
        }
        inQuote = !inQuote;
        continue;
      }
      if (inQuote) continue;
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0 && i < s.length - 1) {
        wrapsAll = false;
        break;
      }
    }
    if (!wrapsAll) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

function stripCast(expr) {
  let s = expr.trim();
  // Strip trailing ::type (e.g. $2::jsonb, $1::varchar, CURRENT_DATE::date) outside quotes
  const m = s.match(/^(.+?)::[a-zA-Z_][a-zA-Z0-9_\s\[\]]*$/);
  if (m) {
    // Make sure :: isn't inside single quotes
    const prefix = m[1];
    let inQuote = false;
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] === "'") {
        if (inQuote && prefix[i + 1] === "'") { i++; continue; }
        inQuote = !inQuote;
      }
    }
    if (!inQuote) return prefix.trim();
  }
  return s;
}

function parseSqlLiteralOrParam(expr, params, row = null, excluded = null) {
  let s = stripCast(expr.trim());
  if (!s) return undefined;
  const upper = s.toUpperCase();
  if (upper === 'NULL') return null;
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  if (upper === 'CURRENT_TIMESTAMP' || upper === 'NOW()') return new Date().toISOString();
  if (upper === 'CURRENT_DATE') return computeIstDate(new Date());

  const paramMatch = s.match(/^\$(\d+)$/);
  if (paramMatch) {
    const idx = parseInt(paramMatch[1], 10) - 1;
    return params[idx];
  }

  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }

  // COALESCE(a, b, ...)
  if (/^COALESCE\s*\(/i.test(s)) {
    const inner = s.slice(s.indexOf('(') + 1, -1);
    const args = splitTopLevel(inner, ',');
    for (const a of args) {
      const val = parseSqlLiteralOrParam(a, params, row, excluded);
      if (val !== null && val !== undefined) return val;
    }
    return null;
  }

  // CASE WHEN cond THEN expr [ELSE expr] END
  if (/^CASE\s+WHEN\s+/i.test(s) && /\s+END$/i.test(s)) {
    const body = s.replace(/^CASE\s+/i, '').replace(/\s+END$/i, '').trim();
    const elseParts = splitTopLevelKeyword(body, 'ELSE');
    const whenClause = elseParts[0].replace(/^WHEN\s+/i, '').trim();
    const thenParts = splitTopLevelKeyword(whenClause, 'THEN');
    const condStr = thenParts[0];
    const thenExpr = thenParts[1];
    const elseExpr = elseParts[1] || 'NULL';
    if (evalWhereCondition(condStr, row || {}, params)) {
      return parseSqlLiteralOrParam(thenExpr, params, row, excluded);
    }
    return parseSqlLiteralOrParam(elseExpr, params, row, excluded);
  }

  // Arithmetic like `version + 1` or `col + 1`
  const arithMatch = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([+-])\s*(\d+|\$\d+)$/);
  if (arithMatch && row) {
    const base = Number(row[arithMatch[1]] || 0);
    const delta = arithMatch[3].startsWith('$')
      ? Number(params[parseInt(arithMatch[3].slice(1), 10) - 1] || 0)
      : Number(arithMatch[3]);
    return arithMatch[2] === '+' ? base + delta : base - delta;
  }

  // EXCLUDED.col
  const exclMatch = s.match(/^EXCLUDED\.([a-zA-Z_][a-zA-Z0-9_]*)$/i);
  if (exclMatch && excluded) {
    return excluded[exclMatch[1]];
  }

  // table.col or col reference
  const colRefMatch = s.match(/^(?:(?:public\.)?[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (colRefMatch && row && Object.prototype.hasOwnProperty.call(row, colRefMatch[1])) {
    return row[colRefMatch[1]];
  }
  if (colRefMatch && row) {
    return row[colRefMatch[1]] !== undefined ? row[colRefMatch[1]] : null;
  }

  throw new Error(`[P0Harness] Unsupported SQL expression: ${expr}`);
}

function getColumnValue(colExpr, row, params) {
  let s = stripCast(colExpr.trim());
  // JSON extraction col->>'key'
  const jsonTextMatch = s.match(/^(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)->>'([^']+)'$/);
  if (jsonTextMatch) {
    let obj = row[jsonTextMatch[1]];
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch (_) { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    const v = obj[jsonTextMatch[2]];
    return v === undefined || v === null ? null : String(v);
  }
  // UPPER(x)
  const upperMatch = s.match(/^UPPER\((.+)\)$/i);
  if (upperMatch) {
    const v = getColumnValue(upperMatch[1], row, params);
    return v === null || v === undefined ? null : String(v).toUpperCase();
  }
  // LOWER(x)
  const lowerMatch = s.match(/^LOWER\((.+)\)$/i);
  if (lowerMatch) {
    const v = getColumnValue(lowerMatch[1], row, params);
    return v === null || v === undefined ? null : String(v).toLowerCase();
  }
  // TRIM(x)
  const trimMatch = s.match(/^TRIM\((.+)\)$/i);
  if (trimMatch) {
    const v = getColumnValue(trimMatch[1], row, params);
    return v === null || v === undefined ? null : String(v).trim();
  }
  // COALESCE(a, b)
  if (/^COALESCE\s*\(/i.test(s)) {
    const inner = s.slice(s.indexOf('(') + 1, -1);
    const args = splitTopLevel(inner, ',');
    for (const a of args) {
      const v = getColumnValue(a, row, params);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }
  // Literal or $N
  if (s.startsWith('$') || s.startsWith("'") || /^-?\d/.test(s) || ['NULL', 'TRUE', 'FALSE', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(s.toUpperCase())) {
    return parseSqlLiteralOrParam(s, params, row);
  }
  // alias.col or col
  const m = s.match(/^(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (m) {
    return row[m[1]];
  }
  return parseSqlLiteralOrParam(s, params, row);
}

function toSqlBool(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'y' || s === 'on') return true;
    if (s === 'false' || s === 'f' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === '') return false;
  }
  return Boolean(val);
}

function evalWhereCondition(condRaw, row, params) {
  if (!condRaw || !condRaw.trim()) return true;
  const cond = stripOuterParens(condRaw.trim());

  const orParts = splitTopLevelKeyword(cond, 'OR');
  if (orParts.length > 1) {
    return orParts.some(p => evalWhereCondition(p, row, params));
  }

  const andParts = splitTopLevelKeyword(cond, 'AND');
  if (andParts.length > 1) {
    return andParts.every(p => evalWhereCondition(p, row, params));
  }

  // Unary NOT <expr> (e.g. NOT $5, NOT ($5), NOT (a = b))
  const notMatch = cond.match(/^NOT\s+(.+)$/i);
  if (notMatch) {
    const innerRaw = notMatch[1].trim();
    const innerAtom = stripOuterParens(stripCast(innerRaw));
    const innerUpper = innerAtom.toUpperCase();
    if (innerUpper === 'NULL') return false;
    if (innerUpper === 'TRUE') return false;
    if (innerUpper === 'FALSE') return true;
    const pMatch = innerAtom.match(/^\$(\d+)$/);
    if (pMatch) {
      const val = params[parseInt(pMatch[1], 10) - 1];
      if (val === null || val === undefined) return false;
      return !toSqlBool(val);
    }
    const colMatch = innerAtom.match(/^(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (colMatch && row && Object.prototype.hasOwnProperty.call(row, colMatch[1])) {
      const val = row[colMatch[1]];
      if (val === null || val === undefined) return false;
      return !toSqlBool(val);
    }
    return !evalWhereCondition(innerRaw, row, params);
  }

  // IS NOT NULL / IS NULL
  let m = cond.match(/^(.+?)\s+IS\s+NOT\s+NULL$/i);
  if (m) {
    const v = getColumnValue(m[1], row, params);
    return v !== null && v !== undefined;
  }
  m = cond.match(/^(.+?)\s+IS\s+NULL$/i);
  if (m) {
    const v = getColumnValue(m[1], row, params);
    return v === null || v === undefined;
  }

  // NOT IN (...) / IN (...)
  m = cond.match(/^(.+?)\s+NOT\s+IN\s*\((.+)\)$/i);
  if (m) {
    const left = getColumnValue(m[1], row, params);
    const items = splitTopLevel(m[2], ',').map(x => parseSqlLiteralOrParam(x, params, row));
    return !items.some(it => String(it) === String(left));
  }
  m = cond.match(/^(.+?)\s+IN\s*\((.+)\)$/i);
  if (m) {
    const leftRaw = getColumnValue(m[1], row, params);
    const items = splitTopLevel(m[2], ',').map(x => parseSqlLiteralOrParam(x, params, row));
    if (m[1].includes('::date') || /_date\b/i.test(m[1])) {
      const ly = toYmd(leftRaw);
      return items.some(it => toYmd(it) === ly);
    }
    return items.some(it => String(it) === String(leftRaw));
  }

  // LIKE
  m = cond.match(/^(.+?)\s+LIKE\s+(.+)$/i);
  if (m) {
    const left = String(getColumnValue(m[1], row, params) ?? '');
    const pattern = String(parseSqlLiteralOrParam(m[2], params, row) ?? '');
    const regexStr = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$';
    return new RegExp(regexStr, 's').test(left);
  }

  // NOT LIKE
  m = cond.match(/^(.+?)\s+NOT\s+LIKE\s+(.+)$/i);
  if (m) {
    const left = String(getColumnValue(m[1], row, params) ?? '');
    const pattern = String(parseSqlLiteralOrParam(m[2], params, row) ?? '');
    const regexStr = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$';
    return !new RegExp(regexStr, 's').test(left);
  }

  // Binary comparison operators: >=, <=, !=, <>, =, >, <
  const ops = ['>=', '<=', '!=', '<>', '=', '>', '<'];
  for (const op of ops) {
    let depth = 0;
    let inQuote = false;
    let foundIdx = -1;
    for (let i = 0; i < cond.length; i++) {
      const ch = cond[i];
      if (ch === "'") {
        if (inQuote && cond[i + 1] === "'") { i++; continue; }
        inQuote = !inQuote;
        continue;
      }
      if (inQuote) continue;
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && cond.slice(i, i + op.length) === op) {
        // Ensure '=' doesn't match '!=' or '>=' or '<=' and '>' doesn't match '->>'
        if (op === '=' && (cond[i - 1] === '!' || cond[i - 1] === '<' || cond[i - 1] === '>')) continue;
        if ((op === '>' || op === '<') && (cond[i - 1] === '-' || cond[i + 1] === '>' || cond[i + 1] === '=')) continue;
        if (op === '>' && cond[i - 1] === '>') continue;
        foundIdx = i;
        break;
      }
    }
    if (foundIdx !== -1) {
      const leftRaw = cond.slice(0, foundIdx).trim();
      const rightRaw = cond.slice(foundIdx + op.length).trim();
      const lval = getColumnValue(leftRaw, row, params);
      const rval = getColumnValue(rightRaw, row, params);

      const isDateCompare = leftRaw.includes('::date') || rightRaw.includes('::date') || /_date\b/i.test(leftRaw);
      const lCmp = isDateCompare ? toYmd(lval) : lval;
      const rCmp = isDateCompare ? toYmd(rval) : rval;

      if (op === '=') {
        if (lCmp === null || lCmp === undefined || rCmp === null || rCmp === undefined) return false;
        if (typeof lCmp === 'boolean' || typeof rCmp === 'boolean') return Boolean(lCmp) === Boolean(rCmp);
        return String(lCmp) === String(rCmp);
      }
      if (op === '!=' || op === '<>') {
        if (lCmp === null || lCmp === undefined) return rCmp !== null && rCmp !== undefined;
        if (rCmp === null || rCmp === undefined) return true;
        if (typeof lCmp === 'boolean' || typeof rCmp === 'boolean') return Boolean(lCmp) !== Boolean(rCmp);
        return String(lCmp) !== String(rCmp);
      }
      if (lCmp === null || lCmp === undefined || rCmp === null || rCmp === undefined) return false;
      if (op === '>') return lCmp > rCmp;
      if (op === '<') return lCmp < rCmp;
      if (op === '>=') return lCmp >= rCmp;
      if (op === '<=') return lCmp <= rCmp;
    }
  }

  // Standalone boolean literal, parameter ($N), or boolean column reference
  const atom = stripOuterParens(stripCast(cond));
  const atomUpper = atom.toUpperCase();
  if (atomUpper === 'TRUE') return true;
  if (atomUpper === 'FALSE' || atomUpper === 'NULL') return false;

  const boolParamMatch = atom.match(/^\$(\d+)$/);
  if (boolParamMatch) {
    const idx = parseInt(boolParamMatch[1], 10) - 1;
    return toSqlBool(params[idx]);
  }

  const boolColMatch = atom.match(/^(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (boolColMatch && row && Object.prototype.hasOwnProperty.call(row, boolColMatch[1])) {
    return toSqlBool(row[boolColMatch[1]]);
  }

  throw new Error(`[P0Harness] Unsupported WHERE condition: ${condRaw}`);
}

class InMemoryPgEngine {
  constructor() {
    this.committed = new Map();
    this.activeLocks = new Map(); // lockKey -> { holderTxId, count, queue: Array<resolve> }
    this.txSeq = 0;
    this.lastTsMs = 0;
    this.faults = []; // { id, table, op, whereMatch, error, remaining }
    this.postCommitDrops = []; // Array<Error>
    this.opDelays = []; // { table, op, ms }
    this.queryLog = [];
    this.reset();
  }

  _nextMonotonicIso() {
    const now = Date.now();
    this.lastTsMs = now > this.lastTsMs ? now : this.lastTsMs + 1;
    return new Date(this.lastTsMs).toISOString();
  }

  reset() {
    this.committed.clear();
    for (const tbl of ALL_TABLES) {
      this.committed.set(tbl, new Map());
    }
    this.activeLocks.clear();
    this.faults = [];
    this.postCommitDrops = [];
    this.opDelays = [];
    this.queryLog = [];

    // Seed standard CWP service_categories
    const cats = [
      { id: 'daily_car_cleaning', display_name: 'Daily Car Cleaning', is_active: true },
      { id: 'car_washing', display_name: 'Car Washing', is_active: true },
      { id: 'solar_cleaning', display_name: 'Solar Panel Cleaning', is_active: true },
      { id: 'interior_detailing', display_name: 'Interior Detailing', is_active: true },
      { id: 'exterior_detailing', display_name: 'Exterior Detailing', is_active: true },
      { id: 'detailing', display_name: 'Car Detailing', is_active: true }
    ];
    const catMap = this.committed.get('service_categories');
    for (const c of cats) {
      catMap.set(c.id, { ...c, created_at: new Date().toISOString() });
    }
  }

  injectErrorOnce({ table = null, op = null, whereMatch = null, error = null } = {}) {
    this.faults.push({
      table: table ? table.toLowerCase() : null,
      op: op ? op.toUpperCase() : null,
      whereMatch: whereMatch || null,
      error: error || new Error(`[P0Harness] Injected ${op || 'OP'} failure on ${table || 'db'}`),
      remaining: 1
    });
  }

  simulatePostCommitNetworkDropOnce(err = null) {
    const dropErr = err || Object.assign(new Error('Simulated network drop after commit'), { code: 'ECONNRESET' });
    this.postCommitDrops.push(dropErr);
  }

  setOpDelay({ table = null, op = null, ms = 10 } = {}) {
    this.opDelays.push({
      table: table ? table.toLowerCase() : null,
      op: op ? op.toUpperCase() : null,
      ms
    });
  }

  clearFaults() {
    this.faults = [];
    this.postCommitDrops = [];
    this.opDelays = [];
  }

  async _maybeFaultAndDelay(table, op, contextRow = null) {
    const tbl = table ? table.toLowerCase() : null;
    const operation = op ? op.toUpperCase() : null;
    for (const d of this.opDelays) {
      if ((!d.table || d.table === tbl) && (!d.op || d.op === operation) && d.ms > 0) {
        await new Promise(r => setTimeout(r, d.ms));
      }
    }
    for (let i = 0; i < this.faults.length; i++) {
      const f = this.faults[i];
      if (f.remaining <= 0) continue;
      if (f.table && f.table !== tbl) continue;
      if (f.op && f.op !== operation) continue;
      if (f.whereMatch && typeof f.whereMatch === 'function' && !f.whereMatch(contextRow)) continue;
      f.remaining -= 1;
      throw f.error;
    }
  }

  async _acquireLock(lockKey, tx) {
    if (!tx) return;
    if (tx.locks.has(lockKey)) return;

    const current = this.activeLocks.get(lockKey);
    if (!current) {
      this.activeLocks.set(lockKey, { holderTxId: tx.id, queue: [] });
      tx.locks.add(lockKey);
      return;
    }
    if (current.holderTxId === tx.id) {
      tx.locks.add(lockKey);
      return;
    }
    await new Promise((resolve) => {
      current.queue.push({ txId: tx.id, resolve });
    });
    tx.locks.add(lockKey);
  }

  _releaseTxLocks(tx) {
    if (!tx) return;
    for (const lockKey of tx.locks) {
      const entry = this.activeLocks.get(lockKey);
      if (!entry || entry.holderTxId !== tx.id) continue;
      if (entry.queue.length > 0) {
        const next = entry.queue.shift();
        entry.holderTxId = next.txId;
        next.resolve();
      } else {
        this.activeLocks.delete(lockKey);
      }
    }
    tx.locks.clear();
  }

  _readTableRows(table, tx) {
    const comm = this.committed.get(table);
    if (!comm) {
      throw new Error(`[P0Harness] Unknown table '${table}'`);
    }
    const staged = tx ? tx.staged.get(table) : null;
    const rows = [];
    for (const [id, row] of comm.entries()) {
      if (staged && staged.has(id)) {
        const s = staged.get(id);
        if (s !== TOMBSTONE) rows.push(deepClone(s));
      } else {
        rows.push(deepClone(row));
      }
    }
    if (staged) {
      for (const [id, s] of staged.entries()) {
        if (!comm.has(id) && s !== TOMBSTONE) {
          rows.push(deepClone(s));
        }
      }
    }
    return rows;
  }

  _stageRow(table, row, tx) {
    const clone = deepClone(row);
    if (tx) {
      if (!tx.staged.has(table)) tx.staged.set(table, new Map());
      tx.staged.get(table).set(clone.id, clone);
    } else {
      this.committed.get(table).set(clone.id, clone);
    }
    return deepClone(clone);
  }

  _stageDelete(table, id, tx) {
    if (tx) {
      if (!tx.staged.has(table)) tx.staged.set(table, new Map());
      tx.staged.get(table).set(id, TOMBSTONE);
    } else {
      this.committed.get(table).delete(id);
    }
  }

  async _acquireInsertUniqueLocks(table, row, tx) {
    if (!tx) return;
    const keys = [];
    if (table === 'service_logs') {
      if (row.client_mutation_id) keys.push(`uniq:service_logs:mut:${row.client_mutation_id}`);
      if (row.subscription_id && row.vehicle_id) keys.push(`uniq:service_logs:daily:${row.subscription_id}:${row.vehicle_id}:${toYmd(row.service_date)}`);
      if (row.job_id) keys.push(`uniq:service_logs:job:${row.job_id}`);
    } else if (table === 'service_executions') {
      if (row.client_mutation_id) keys.push(`uniq:service_executions:mut:${row.client_mutation_id}`);
      if (TERMINAL_EXECUTION_OUTCOMES.has(row.outcome) && row.job_id) keys.push(`uniq:service_executions:term:${row.job_id}`);
    } else if (table === 'entitlement_ledger' && row.idempotency_key) {
      keys.push(`uniq:entitlement_ledger:idem:${row.idempotency_key}`);
    } else if (table === 'package_redemption_logs' && row.service_job_id) {
      keys.push(`uniq:pkg_redemption:job:${row.service_job_id}`);
    } else if (table === 'purchase_snapshots' && row.sale_reference) {
      keys.push(`uniq:purchase_snapshots:ref:${row.sale_reference}`);
    }
    keys.sort();
    for (const k of keys) {
      await this._acquireLock(k, tx);
    }
  }

  _validateRowAndUniques(table, candidate, tx, excludeId = null) {
    const rows = this._readTableRows(table, tx).filter(r => r.id !== excludeId);

    if (table === 'service_logs') {
      if ((candidate.staff_id === null || candidate.staff_id === undefined) &&
          (candidate.job_id === null || candidate.job_id === undefined)) {
        throw makePgError('chk_service_logs_staff_or_job violated', '23514', 'chk_service_logs_staff_or_job');
      }
      if (candidate.client_mutation_id) {
        if (rows.some(r => r.client_mutation_id === candidate.client_mutation_id)) {
          throw makePgError('duplicate key value violates unique constraint "service_logs_client_mutation_id_key"', '23505', 'service_logs_client_mutation_id_key');
        }
      }
      if (candidate.subscription_id && candidate.vehicle_id) {
        const d = toYmd(candidate.service_date);
        if (rows.some(r => r.subscription_id === candidate.subscription_id && r.vehicle_id === candidate.vehicle_id && toYmd(r.service_date) === d)) {
          throw makePgError('duplicate key value violates unique constraint "uq_service_logs_daily_vehicle"', '23505', 'uq_service_logs_daily_vehicle');
        }
      }
      if (candidate.job_id) {
        if (rows.some(r => r.job_id === candidate.job_id)) {
          throw makePgError('duplicate key value violates unique constraint "uq_service_logs_job_once"', '23505', 'uq_service_logs_job_once');
        }
      }
    }

    if (table === 'service_executions') {
      if (candidate.client_mutation_id) {
        if (rows.some(r => r.client_mutation_id === candidate.client_mutation_id)) {
          throw makePgError('duplicate key value violates unique constraint "uq_service_executions_client_mutation"', '23505', 'uq_service_executions_client_mutation');
        }
      }
      if (TERMINAL_EXECUTION_OUTCOMES.has(candidate.outcome)) {
        if (rows.some(r => r.job_id === candidate.job_id && TERMINAL_EXECUTION_OUTCOMES.has(r.outcome))) {
          throw makePgError('duplicate key value violates unique constraint "uq_service_executions_terminal_job"', '23505', 'uq_service_executions_terminal_job');
        }
      }
    }

    if (table === 'entitlement_ledger') {
      if (Number(candidate.balance_after) < 0) {
        throw makePgError('balance_after >= 0 check failed', '23514', 'entitlement_ledger_balance_after_check');
      }
      if (candidate.idempotency_key) {
        if (rows.some(r => r.idempotency_key === candidate.idempotency_key)) {
          throw makePgError('duplicate key value violates unique constraint "entitlement_ledger_idempotency_key_key"', '23505', 'entitlement_ledger_idempotency_key_key');
        }
      }
    }

    if (table === 'entitlement_accounts') {
      const p = Number(candidate.purchased_qty || 0);
      const r = Number(candidate.reserved_qty || 0);
      const c = Number(candidate.consumed_qty || 0);
      const e = Number(candidate.expired_qty || 0);
      const a = Number(candidate.adjusted_qty || 0);
      const rf = Number(candidate.refunded_qty || 0);
      const rem = Number(candidate.remaining_qty || 0);
      if (p < 0 || r < 0 || c < 0 || e < 0 || rf < 0 || rem < 0 || rem !== (p + a - r - c - e - rf)) {
        throw makePgError('chk_entitlement_ledger_balance violated', '23514', 'chk_entitlement_ledger_balance');
      }
    }

    if (table === 'customer_packages') {
      const tot = Number(candidate.total_quantity || 0);
      const red = Number(candidate.redeemed_quantity || 0);
      const rem = Number(candidate.remaining_quantity || 0);
      if (rem < 0 || red > tot || rem !== (tot - red)) {
        throw makePgError('chk_entitlement_balance violated', '23514', 'chk_entitlement_balance');
      }
    }

    if (table === 'package_redemption_logs' && candidate.service_job_id) {
      if (rows.some(r => r.service_job_id === candidate.service_job_id)) {
        throw makePgError('duplicate key value violates unique constraint "uq_pkg_redemption_service_job"', '23505', 'uq_pkg_redemption_service_job');
      }
    }

    if (table === 'staff_assignments' && candidate.is_active === true) {
      if (candidate.job_id && rows.some(r => r.is_active === true && r.job_id === candidate.job_id)) {
        throw makePgError('duplicate key value violates unique constraint "uq_active_job_assignment"', '23505', 'uq_active_job_assignment');
      }
      if (candidate.subscription_id && rows.some(r => r.is_active === true && r.subscription_id === candidate.subscription_id)) {
        throw makePgError('duplicate key value violates unique constraint "uq_active_sub_assignment"', '23505', 'uq_active_sub_assignment');
      }
    }

    if (table === 'purchase_snapshots' && candidate.sale_reference) {
      if (rows.some(r => r.sale_reference === candidate.sale_reference)) {
        throw makePgError('duplicate key value violates unique constraint "purchase_snapshots_sale_reference_key"', '23505', 'purchase_snapshots_sale_reference_key');
      }
    }

    if (table === 'solar_verifications' && candidate.job_id) {
      if (rows.some(r => r.job_id === candidate.job_id)) {
        throw makePgError('duplicate key value violates unique constraint "solar_verifications_job_id_key"', '23505', 'solar_verifications_job_id_key');
      }
    }

    if (table === 'services' && candidate.service_code) {
      if (rows.some(r => String(r.service_code).toUpperCase() === String(candidate.service_code).toUpperCase())) {
        throw makePgError('duplicate service_code', '23505', 'services_service_code_key');
      }
    }

    if (table === 'packages' && candidate.package_code) {
      if (rows.some(r => String(r.package_code).toUpperCase() === String(candidate.package_code).toUpperCase())) {
        throw makePgError('duplicate package_code', '23505', 'packages_package_code_key');
      }
    }

    if (table === 'addons' && candidate.addon_code) {
      if (rows.some(r => String(r.addon_code).toUpperCase() === String(candidate.addon_code).toUpperCase())) {
        throw makePgError('duplicate addon_code', '23505', 'addons_addon_code_key');
      }
    }

    if (table === 'staff' && candidate.staff_code) {
      if (rows.some(r => String(r.staff_code).toUpperCase() === String(candidate.staff_code).toUpperCase() && !r.deleted_at)) {
        throw makePgError('duplicate staff_code', '23505', 'staff_staff_code_key');
      }
    }

    if (table === 'staff_types' && candidate.code) {
      if (rows.some(r => String(r.code).toUpperCase() === String(candidate.code).toUpperCase())) {
        throw makePgError('duplicate staff_types code', '23505', 'staff_types_code_key');
      }
    }
  }

  _beginTx() {
    this.txSeq += 1;
    return {
      id: this.txSeq,
      staged: new Map(),
      locks: new Set()
    };
  }

  _commitTx(tx) {
    for (const [table, rowMap] of tx.staged.entries()) {
      const comm = this.committed.get(table);
      for (const [id, val] of rowMap.entries()) {
        if (val === TOMBSTONE) {
          comm.delete(id);
        } else {
          comm.set(id, deepClone(val));
        }
      }
    }
    tx.staged.clear();
  }

  _rollbackTx(tx) {
    tx.staged.clear();
  }

  async acquireClient() {
    const engine = this;
    let activeTx = null;
    let released = false;
    return {
      async query(sql, params = []) {
        if (released) throw new Error('[P0Harness] Query on released client');
        const compact = String(sql).replace(/\s+/g, ' ').trim().toUpperCase();
        if (compact === 'BEGIN') {
          activeTx = engine._beginTx();
          return { rows: [], rowCount: 0 };
        }
        if (compact === 'COMMIT') {
          if (activeTx) {
            try {
              engine._commitTx(activeTx);
            } finally {
              engine._releaseTxLocks(activeTx);
              activeTx = null;
            }
            if (engine.postCommitDrops.length > 0) {
              throw engine.postCommitDrops.shift();
            }
          }
          return { rows: [], rowCount: 0 };
        }
        if (compact === 'ROLLBACK') {
          if (activeTx) {
            try {
              engine._rollbackTx(activeTx);
            } finally {
              engine._releaseTxLocks(activeTx);
              activeTx = null;
            }
          }
          return { rows: [], rowCount: 0 };
        }
        return engine.query(sql, params, activeTx);
      },
      release() {
        released = true;
        if (activeTx) {
          engine._rollbackTx(activeTx);
          engine._releaseTxLocks(activeTx);
          activeTx = null;
        }
      }
    };
  }

  async withTransaction(callback) {
    const client = await this.acquireClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  async query(sqlRaw, params = [], tx = null) {
    const compact = String(sqlRaw).replace(/\s+/g, ' ').trim();
    this.queryLog.push({ sql: compact, params: deepClone(params) });

    // 1. Advisory lock
    if (/^SELECT\s+pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*\$1\s*\)\s*\)$/i.test(compact)) {
      await this._acquireLock(`advisory:${String(params[0])}`, tx);
      return { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 };
    }

    // 2. INSERT / 3. UPDATE / 4. DELETE (autocommit statements run in an implicit single-statement tx for row/unique locking)
    if (/^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+/i.test(compact)) {
      const runDml = async (activeTx) => {
        if (/^INSERT\s+INTO\s+/i.test(compact)) return this._execInsert(compact, params, activeTx);
        if (/^UPDATE\s+/i.test(compact)) return this._execUpdate(compact, params, activeTx);
        return this._execDelete(compact, params, activeTx);
      };
      if (tx) return runDml(tx);
      const implicitTx = this._beginTx();
      try {
        const res = await runDml(implicitTx);
        this._commitTx(implicitTx);
        return res;
      } catch (err) {
        this._rollbackTx(implicitTx);
        throw err;
      } finally {
        this._releaseTxLocks(implicitTx);
      }
    }

    // 5. SELECT
    if (/^SELECT\s+/i.test(compact)) {
      return this._execSelect(compact, params, tx);
    }

    throw new Error(`[P0Harness] Unsupported SQL: ${compact}`);
  }

  _projectReturning(rows, returningSpec) {
    if (!returningSpec) return [];
    const spec = returningSpec.trim();
    if (spec === '*') return rows;
    const cols = splitTopLevel(spec, ',').map(c => c.trim().replace(/^[a-zA-Z_]+\./, ''));
    return rows.map(r => {
      const out = {};
      for (const c of cols) {
        const asM = c.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
        if (asM) out[asM[2]] = r[asM[1]] !== undefined ? r[asM[1]] : null;
        else out[c] = r[c] !== undefined ? r[c] : null;
      }
      return out;
    });
  }

  async _execInsert(sql, params, tx) {
    let body = sql;
    let returningSpec = null;
    const retMatch = body.match(/\s+RETURNING\s+(.+)$/i);
    if (retMatch) {
      returningSpec = retMatch[1].trim();
      body = body.slice(0, retMatch.index).trim();
    }

    let onConflictClause = null;
    {
      let depth = 0;
      let inQuote = false;
      let splitAt = -1;
      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === "'") {
          if (inQuote && body[i + 1] === "'") { i++; continue; }
          inQuote = !inQuote;
          continue;
        }
        if (inQuote) continue;
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (depth === 0 && /^ON\s+CONFLICT\b/i.test(body.slice(i))) {
          splitAt = i;
          break;
        }
      }
      if (splitAt !== -1) {
        onConflictClause = body.slice(splitAt).trim();
        body = body.slice(0, splitAt).trim();
      }
    }

    const m = body.match(/^INSERT\s+INTO\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)$/i);
    if (!m) {
      throw new Error(`[P0Harness] Unsupported SQL: ${sql}`);
    }
    const table = m[1].toLowerCase();
    if (!this.committed.has(table)) {
      throw new Error(`[P0Harness] Unsupported SQL (unknown table ${table}): ${sql}`);
    }
    const cols = m[2].split(',').map(c => c.trim());
    const valuesRaw = m[3].trim();

    const valExprs = splitTopLevel(valuesRaw, ',');
    if (valExprs.length !== cols.length) {
      throw new Error(`[P0Harness] INSERT column/value count mismatch (${cols.length} vs ${valExprs.length}): ${sql}`);
    }

    const nowIso = this._nextMonotonicIso();
    const row = {
      id: crypto.randomUUID(),
      created_at: nowIso,
      updated_at: nowIso
    };
    if (['customers', 'vehicles', 'service_locations', 'staff', 'customer_packages', 'subscriptions', 'service_jobs'].includes(table)) {
      row.deleted_at = null;
    }
    if (['customers', 'vehicles', 'service_locations', 'staff', 'staff_types', 'staff_capability_overrides', 'service_frequencies'].includes(table)) {
      row.is_active = true;
    }
    if (table === 'service_jobs') {
      row.entitlement_consumed = false;
      row.before_photos = [];
      row.after_photos = [];
      row.service_payload = {};
      row.checklist_requirements = [];
      row.proof_requirements = { before_min: 0, after_min: 0, required: false };
    }
    if (table === 'customer_packages') {
      row.redeemed_quantity = 0;
    }
    if (table === 'entitlement_accounts') {
      row.reserved_qty = 0;
      row.consumed_qty = 0;
      row.expired_qty = 0;
      row.adjusted_qty = 0;
      row.refunded_qty = 0;
    }
    if (table === 'service_logs') {
      row.conflict_resolved = false;
      row.car_not_present = false;
      row.job_id = null;
      row.subscription_id = null;
      row.vehicle_id = null;
    }

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      let val = parseSqlLiteralOrParam(valExprs[i], params, row);
      if (val === undefined) val = null;
      val = maybeParseJsonb(col, val);
      row[col] = val;
    }

    await this._maybeFaultAndDelay(table, 'INSERT', row);
    await this._acquireInsertUniqueLocks(table, row, tx);

    // Handle ON CONFLICT before validation
    if (onConflictClause) {
      const doNothing = /^ON\s+CONFLICT(?:\s*\([^)]+\))?\s+DO\s+NOTHING$/i.test(onConflictClause);
      if (doNothing) {
        try {
          this._validateRowAndUniques(table, row, tx);
        } catch (err) {
          if (err.code === '23505') {
            return { rows: [], rowCount: 0 };
          }
          throw err;
        }
      } else {
        const doUpdateMatch = onConflictClause.match(/^ON\s+CONFLICT\s*\(([^)]+)\)\s+DO\s+UPDATE\s+SET\s+(.+)$/i);
        if (!doUpdateMatch) {
          throw new Error(`[P0Harness] Unsupported ON CONFLICT: ${onConflictClause}`);
        }
        const conflictCols = doUpdateMatch[1].split(',').map(c => c.trim());
        const existingRows = this._readTableRows(table, tx);
        const matchRow = existingRows.find(r => conflictCols.every(c => String(r[c]) === String(row[c])));
        if (matchRow) {
          const setParts = splitTopLevel(doUpdateMatch[2], ',');
          const updated = deepClone(matchRow);
          for (const sp of setParts) {
            const eqIdx = sp.indexOf('=');
            const targetCol = sp.slice(0, eqIdx).trim();
            const expr = sp.slice(eqIdx + 1).trim();
            let v = parseSqlLiteralOrParam(expr, params, updated, row);
            v = maybeParseJsonb(targetCol, v);
            updated[targetCol] = v;
          }
          this._validateRowAndUniques(table, updated, tx, updated.id);
          const saved = this._stageRow(table, updated, tx);
          return { rows: this._projectReturning([saved], returningSpec), rowCount: 1 };
        }
      }
    }

    this._validateRowAndUniques(table, row, tx);
    const saved = this._stageRow(table, row, tx);
    return { rows: this._projectReturning([saved], returningSpec), rowCount: 1 };
  }

  async _execUpdate(sql, params, tx) {
    let body = sql;
    let returningSpec = null;
    const retMatch = body.match(/\s+RETURNING\s+(.+)$/i);
    if (retMatch) {
      returningSpec = retMatch[1].trim();
      body = body.slice(0, retMatch.index).trim();
    }

    const m = body.match(/^UPDATE\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+SET\s+(.+)$/i);
    if (!m) {
      throw new Error(`[P0Harness] Unsupported SQL: ${sql}`);
    }
    const table = m[1].toLowerCase();
    if (!this.committed.has(table)) {
      throw new Error(`[P0Harness] Unsupported SQL (unknown table ${table}): ${sql}`);
    }

    // Immutability triggers
    if (table === 'entitlement_ledger') {
      throw new Error('entitlement_ledger is immutable: UPDATE not allowed');
    }

    const rest = m[2].trim();
    // Split SET and WHERE at top level
    let depth = 0;
    let inQuote = false;
    let whereIdx = -1;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === "'") {
        if (inQuote && rest[i + 1] === "'") { i++; continue; }
        inQuote = !inQuote;
        continue;
      }
      if (inQuote) continue;
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && i > 0 && /^\sWHERE\s/i.test(rest.slice(i - 1, i + 6))) {
        whereIdx = i;
        break;
      }
    }

    const setRaw = whereIdx === -1 ? rest : rest.slice(0, whereIdx).trim();
    const whereRaw = whereIdx === -1 ? '' : rest.slice(whereIdx + 5).trim();

    const setParts = splitTopLevel(setRaw, ',');
    await this._maybeFaultAndDelay(table, 'UPDATE', null);

    const rows = this._readTableRows(table, tx);
    const matchedIds = rows.filter(r => evalWhereCondition(whereRaw, r, params)).map(r => r.id);

    const updatedRows = [];
    for (const id of matchedIds) {
      await this._acquireLock(`row:${table}:${id}`, tx);
      // Re-read after lock acquisition
      const currentRow = this._readTableRows(table, tx).find(r => r.id === id);
      if (!currentRow || !evalWhereCondition(whereRaw, currentRow, params)) continue;

      const candidate = deepClone(currentRow);
      for (const sp of setParts) {
        const eqIdx = sp.indexOf('=');
        if (eqIdx === -1) throw new Error(`[P0Harness] Invalid SET assignment: ${sp}`);
        const col = sp.slice(0, eqIdx).trim();
        const expr = sp.slice(eqIdx + 1).trim();
        let val = parseSqlLiteralOrParam(expr, params, currentRow);
        val = maybeParseJsonb(col, val);
        candidate[col] = val;
      }

      if (table === 'staff_assignments') {
        if (currentRow.is_active === false && candidate.is_active === true) {
          throw new Error('trg_staff_assignments_immutability: cannot reactivate inactive assignment');
        }
      }

      this._validateRowAndUniques(table, candidate, tx, id);
      const saved = this._stageRow(table, candidate, tx);
      updatedRows.push(saved);
    }

    return { rows: this._projectReturning(updatedRows, returningSpec), rowCount: updatedRows.length };
  }

  async _execDelete(sql, params, tx) {
    let body = sql;
    let returningSpec = null;
    const retMatch = body.match(/\s+RETURNING\s+(.+)$/i);
    if (retMatch) {
      returningSpec = retMatch[1].trim();
      body = body.slice(0, retMatch.index).trim();
    }

    const m = body.match(/^DELETE\s+FROM\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error(`[P0Harness] Unsupported SQL: ${sql}`);
    const table = m[1].toLowerCase();
    const whereRaw = m[2] || '';

    if (['entitlement_ledger', 'purchase_snapshots', 'staff_assignments'].includes(table)) {
      throw new Error(`${table} is immutable: DELETE not allowed`);
    }

    await this._maybeFaultAndDelay(table, 'DELETE', null);

    const rows = this._readTableRows(table, tx);
    const matchedIds = rows.filter(r => evalWhereCondition(whereRaw, r, params)).map(r => r.id);

    const deletedRows = [];
    for (const id of matchedIds) {
      await this._acquireLock(`row:${table}:${id}`, tx);
      // Re-read after lock acquisition (READ COMMITTED)
      const currentRow = this._readTableRows(table, tx).find(r => r.id === id);
      if (!currentRow || !evalWhereCondition(whereRaw, currentRow, params)) continue;

      this._stageDelete(table, id, tx);
      deletedRows.push(currentRow);
    }
    return { rows: this._projectReturning(deletedRows, returningSpec), rowCount: deletedRows.length };
  }

  async _execSelect(sql, params, tx) {
    const forUpdate = /\bFOR\s+UPDATE\s*$/i.test(sql);
    const cleanSql = forUpdate ? sql.replace(/\s+FOR\s+UPDATE\s*$/i, '').trim() : sql;

    // -------------------------------------------------------------------
    // Multi-table JOIN queries
    // -------------------------------------------------------------------

    // A. service_jobs JOIN (findAll, findById, findByCustomerId, findDispatchedForStaff)
    if (/\bFROM\s+(?:public\.)?service_jobs\s+j\b/i.test(cleanSql)) {
      return this._selectServiceJobsJoin(cleanSql, params, tx);
    }

    // B. service_job_addons JOIN addons (findJobAddons)
    if (/\bFROM\s+(?:public\.)?service_job_addons\s+sja\b/i.test(cleanSql)) {
      const sjas = this._readTableRows('service_job_addons', tx).filter(r => String(r.job_id) === String(params[0]));
      const addons = new Map(this._readTableRows('addons', tx).map(a => [a.id, a]));
      const rows = sjas
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map(sja => {
          const a = addons.get(sja.addon_id) || {};
          return {
            ...sja,
            addon_code: a.addon_code || null,
            checklist_requirements: a.checklist_requirements || [],
            proof_requirements: a.proof_requirements || { before_min: 0, after_min: 0, required: false }
          };
        });
      return { rows, rowCount: rows.length };
    }

    // C. staff_assignments JOIN service_jobs (evaluateStaffEligibility overlap query)
    if (/\bFROM\s+(?:public\.)?staff_assignments\s+sa\s+JOIN\s+(?:public\.)?service_jobs\s+j\b/i.test(cleanSql)) {
      const staffId = params[0];
      const dates = new Set([toYmd(params[1]), toYmd(params[2]), toYmd(params[3])]);
      const assigns = this._readTableRows('staff_assignments', tx).filter(sa => sa.staff_id === staffId && sa.is_active === true);
      const jobs = new Map(this._readTableRows('service_jobs', tx).map(j => [j.id, j]));
      const svcs = new Map(this._readTableRows('services', tx).map(s => [s.id, s]));
      const rows = [];
      for (const sa of assigns) {
        const j = jobs.get(sa.job_id);
        if (!j || j.deleted_at) continue;
        if (!['assigned', 'in_progress'].includes(j.status)) continue;
        const sd = toYmd(j.scheduled_date);
        if (!sd || !dates.has(sd)) continue;
        const svc = j.service_id ? svcs.get(j.service_id) : null;
        rows.push({
          id: j.id,
          scheduled_date_str: sd,
          scheduled_time: j.scheduled_time,
          duration_minutes: (svc && svc.expected_duration_minutes) || 60
        });
      }
      return { rows, rowCount: rows.length };
    }

    // D. staff_assignments JOIN staff
    if (/\bFROM\s+(?:public\.)?staff_assignments\s+sa\s+JOIN\s+(?:public\.)?staff\s+s\b/i.test(cleanSql)) {
      const staffMap = new Map(this._readTableRows('staff', tx).map(s => [s.id, s]));
      let rows = this._readTableRows('staff_assignments', tx).filter(sa => sa.is_active === true);
      if (/sa\.staff_id\s*=\s*\$1/i.test(cleanSql)) {
        rows = rows.filter(sa => sa.staff_id === params[0]);
      } else if (/sa\.subscription_id\s*=\s*\$1/i.test(cleanSql)) {
        rows = rows.filter(sa => sa.subscription_id === params[0]).slice(0, 1);
      } else if (/sa\.job_id\s*=\s*\$1/i.test(cleanSql)) {
        rows = rows.filter(sa => sa.job_id === params[0]).slice(0, 1);
      } else {
        throw new Error(`[P0Harness] Unsupported SQL: ${sql}`);
      }
      const joined = rows.map(sa => {
        const s = staffMap.get(sa.staff_id) || {};
        return { ...sa, staff_code: s.staff_code || null, staff_name: s.name || null, staff_phone: s.phone || null };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // E. entitlement_accounts summary report (seeApiRouter /reports/entitlements)
    if (/\bFROM\s+(?:public\.)?entitlement_accounts\b/i.test(cleanSql) && /\bGROUP\s+BY\b/i.test(cleanSql)) {
      const accts = this._readTableRows('entitlement_accounts', tx);
      const groups = new Map();
      for (const a of accts) {
        const key = `${a.entitlement_kind}::${a.status}`;
        if (!groups.has(key)) {
          groups.set(key, {
            entitlement_kind: a.entitlement_kind,
            status: a.status,
            account_count: 0,
            total_purchased: 0,
            total_consumed: 0,
            total_remaining: 0
          });
        }
        const g = groups.get(key);
        g.account_count += 1;
        g.total_purchased += Number(a.purchased_qty || 0);
        g.total_consumed += Number(a.consumed_qty || 0);
        g.total_remaining += Number(a.remaining_qty || 0);
      }
      const rows = [...groups.values()];
      return { rows, rowCount: rows.length };
    }

    // F. entitlement_accounts JOIN services/addons/purchase_snapshots (findAccountsByCustomer)
    if (/\bFROM\s+(?:public\.)?entitlement_accounts\s+ea\b/i.test(cleanSql)) {
      const svcs = new Map(this._readTableRows('services', tx).map(s => [s.id, s]));
      const addons = new Map(this._readTableRows('addons', tx).map(a => [a.id, a]));
      const snaps = new Map(this._readTableRows('purchase_snapshots', tx).map(ps => [ps.id, ps]));
      let rows = this._readTableRows('entitlement_accounts', tx).filter(ea => evalWhereCondition(this._extractWhere(cleanSql), ea, params));
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const joined = rows.map(ea => {
        const s = ea.service_id ? svcs.get(ea.service_id) : null;
        const ad = ea.addon_id ? addons.get(ea.addon_id) : null;
        const ps = ea.purchase_snapshot_id ? snaps.get(ea.purchase_snapshot_id) : null;
        return {
          ...ea,
          service_code: s ? s.service_code : null,
          service_name: s ? s.name : null,
          service_category_id: s ? s.service_category_id : null,
          addon_code: ad ? ad.addon_code : null,
          addon_name: ad ? ad.name : null,
          package_code: ps ? ps.package_code : null,
          package_name: ps ? ps.package_name : null,
          vehicle_segment: ps ? ps.vehicle_segment : null
        };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // G. solar_verifications JOIN service_jobs (reports)
    if (/\bFROM\s+(?:public\.)?solar_verifications\s+sv\s+JOIN\b/i.test(cleanSql)) {
      const jobs = new Map(this._readTableRows('service_jobs', tx).map(j => [j.id, j]));
      const rows = this._readTableRows('solar_verifications', tx)
        .filter(sv => Number(sv.discrepancy_count || 0) !== 0)
        .map(sv => {
          const j = jobs.get(sv.job_id) || {};
          return { ...sv, customer_id: j.customer_id, scheduled_date: j.scheduled_date, job_status: j.status };
        });
      return { rows, rowCount: rows.length };
    }

    // H. services JOIN service_categories
    if (/\bFROM\s+(?:public\.)?services\s+s\s+JOIN\s+(?:public\.)?service_categories\s+sc\b/i.test(cleanSql)) {
      const cats = new Map(this._readTableRows('service_categories', tx).map(c => [c.id, c]));
      const whereClause = this._extractWhere(cleanSql);
      let rows = this._readTableRows('services', tx).filter(s => evalWhereCondition(whereClause, s, params));
      rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      rows = this._applyLimitOffset(cleanSql, rows, params);
      const joined = rows.map(s => ({ ...s, category_name: (cats.get(s.service_category_id) || {}).display_name || s.service_category_id }));
      return { rows: joined, rowCount: joined.length };
    }

    // I. packages JOIN services
    if (/\bFROM\s+(?:public\.)?packages\s+p\s+JOIN\s+(?:public\.)?services\s+s\b/i.test(cleanSql)) {
      const svcs = new Map(this._readTableRows('services', tx).map(s => [s.id, s]));
      const benefits = this._readTableRows('package_benefits', tx);
      const whereClause = this._extractWhere(cleanSql);
      let rows = this._readTableRows('packages', tx).filter(p => evalWhereCondition(whereClause, p, params));
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      rows = this._applyLimitOffset(cleanSql, rows, params);
      const joined = rows.map(p => {
        const s = svcs.get(p.main_service_id) || {};
        return {
          ...p,
          main_service_code: s.service_code || null,
          main_service_name: s.name || null,
          service_category_id: s.service_category_id || null,
          benefit_count: benefits.filter(b => b.package_id === p.id).length
        };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // J. package_benefits JOIN services
    if (/\bFROM\s+(?:public\.)?package_benefits\s+pb\b/i.test(cleanSql)) {
      const svcs = new Map(this._readTableRows('services', tx).map(s => [s.id, s]));
      const freqs = new Map(this._readTableRows('service_frequencies', tx).map(f => [f.id, f]));
      const rows = this._readTableRows('package_benefits', tx)
        .filter(pb => pb.package_id === params[0])
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map(pb => {
          const s = svcs.get(pb.service_id) || {};
          const f = pb.frequency_id ? freqs.get(pb.frequency_id) : null;
          return {
            ...pb,
            service_code: s.service_code || null,
            service_name: s.name || null,
            service_model: s.service_model || null,
            service_category_id: s.service_category_id || null,
            frequency_code: f ? f.code : null,
            frequency_type: f ? f.frequency_type : null
          };
        });
      return { rows, rowCount: rows.length };
    }

    // K. package_addons JOIN addons
    if (/\bFROM\s+(?:public\.)?package_addons\s+pa\b/i.test(cleanSql)) {
      const addons = new Map(this._readTableRows('addons', tx).map(a => [a.id, a]));
      const freqs = new Map(this._readTableRows('service_frequencies', tx).map(f => [f.id, f]));
      const rows = this._readTableRows('package_addons', tx)
        .filter(pa => pa.package_id === params[0])
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .map(pa => {
          const a = addons.get(pa.addon_id) || {};
          const f = pa.frequency_id ? freqs.get(pa.frequency_id) : null;
          return {
            ...pa,
            addon_code: a.addon_code || null,
            addon_name: a.name || null,
            execution_mode: a.execution_mode || null,
            default_price: a.default_price ?? 0,
            frequency_code: f ? f.code : null
          };
        });
      return { rows, rowCount: rows.length };
    }

    // L. addons with addon_service_applicability
    if (/\bFROM\s+(?:public\.)?addons\s+a\b/i.test(cleanSql)) {
      const links = this._readTableRows('addon_service_applicability', tx);
      let rows = this._readTableRows('addons', tx);
      if (/WHERE\s+asa\.service_id\s*=\s*\$1/i.test(cleanSql)) {
        const svcId = params[0];
        const statusFilter = params[1];
        const allowedAddonIds = new Set(links.filter(l => l.service_id === svcId).map(l => l.addon_id));
        rows = rows.filter(a => allowedAddonIds.has(a.id) && (!statusFilter || a.status === statusFilter));
      } else if (/WHERE\s+a\.id\s*=\s*\$1/i.test(cleanSql)) {
        rows = rows.filter(a => a.id === params[0]).slice(0, 1);
      } else if (/WHERE\s+UPPER\(a\.addon_code\)\s*=\s*UPPER\(\$1\)/i.test(cleanSql)) {
        rows = rows.filter(a => String(a.addon_code).toUpperCase() === String(params[0]).toUpperCase()).slice(0, 1);
      } else if (/WHERE\s+a\.status\s*=\s*\$1/i.test(cleanSql)) {
        rows = rows.filter(a => a.status === params[0]);
      }
      const joined = rows.map(a => ({
        ...a,
        applicable_service_ids: links.filter(l => l.addon_id === a.id).map(l => l.service_id)
      }));
      return { rows: joined, rowCount: joined.length };
    }

    // M. customer_packages JOINs (findByCustomerId, findById)
    if (/\bFROM\s+(?:public\.)?customer_packages\s+cp\b/i.test(cleanSql)) {
      const vehs = new Map(this._readTableRows('vehicles', tx).map(v => [v.id, v]));
      const locs = new Map(this._readTableRows('service_locations', tx).map(l => [l.id, l]));
      const cats = new Map(this._readTableRows('service_categories', tx).map(c => [c.id, c]));
      const whereClause = this._extractWhere(cleanSql);
      let rows = this._readTableRows('customer_packages', tx).filter(cp => evalWhereCondition(whereClause, cp, params));
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      if (/\bLIMIT\s+1\b/i.test(cleanSql)) rows = rows.slice(0, 1);
      const joined = rows.map(cp => {
        const v = cp.vehicle_id ? vehs.get(cp.vehicle_id) : null;
        const l = cp.location_id ? locs.get(cp.location_id) : null;
        const c = cp.service_category_id ? cats.get(cp.service_category_id) : null;
        return {
          ...cp,
          registration_no: v ? v.registration_no : null,
          brand_or_model: v ? v.brand_or_model : null,
          car_make: v ? v.car_make : null,
          car_color: v ? v.car_color : null,
          location_name: l ? l.location_name : null,
          address_text: l ? l.address_text : null,
          category_display_name: c ? c.display_name : cp.service_category_id
        };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // N. package_redemption_logs JOINs
    if (/\bFROM\s+(?:public\.)?package_redemption_logs\s+prl\b/i.test(cleanSql)) {
      const pkgs = new Map(this._readTableRows('customer_packages', tx).map(p => [p.id, p]));
      const vehs = new Map(this._readTableRows('vehicles', tx).map(v => [v.id, v]));
      const locs = new Map(this._readTableRows('service_locations', tx).map(l => [l.id, l]));
      const whereClause = this._extractWhere(cleanSql);
      let rows = this._readTableRows('package_redemption_logs', tx).filter(prl => evalWhereCondition(whereClause, prl, params));
      rows = this._applyLimitOffset(cleanSql, rows, params);
      const joined = rows.map(prl => {
        const p = pkgs.get(prl.package_id) || {};
        const v = prl.vehicle_id ? vehs.get(prl.vehicle_id) : null;
        const l = prl.location_id ? locs.get(prl.location_id) : null;
        return {
          ...prl,
          package_name: p.package_name || null,
          package_code: p.package_code || null,
          service_category_id: p.service_category_id || null,
          registration_no: v ? v.registration_no : null,
          brand_or_model: v ? v.brand_or_model : null,
          location_name: l ? l.location_name : null
        };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // O. subscription_vehicles JOIN vehicles
    if (/\bFROM\s+(?:public\.)?subscription_vehicles\s+sv\b/i.test(cleanSql)) {
      const vehs = new Map(this._readTableRows('vehicles', tx).map(v => [v.id, v]));
      const locs = new Map(this._readTableRows('service_locations', tx).map(l => [l.id, l]));
      const rows = this._readTableRows('subscription_vehicles', tx)
        .filter(sv => sv.subscription_id === params[0])
        .map(sv => {
          const v = vehs.get(sv.vehicle_id) || {};
          const l = sv.location_id ? locs.get(sv.location_id) : null;
          return {
            ...sv,
            registration_no: v.registration_no || null,
            brand_or_model: v.brand_or_model || null,
            car_make: v.car_make || null,
            car_color: v.car_color || null,
            vehicle_type: v.vehicle_type || null,
            vehicle_photo_url: v.photo_url || null,
            address_text: l ? l.address_text : null,
            google_maps_url: l ? l.google_maps_url : null,
            parking_details: l ? l.parking_details : null
          };
        });
      return { rows, rowCount: rows.length };
    }

    // P. route_stops JOIN routes (findActiveStopBySubscriptionAndVehicle)
    if (/\bFROM\s+(?:public\.)?route_stops\s+rs\s+JOIN\s+(?:public\.)?routes\s+r\b/i.test(cleanSql)) {
      const routes = new Map(this._readTableRows('routes', tx).map(r => [r.id, r]));
      const subId = params[0];
      const vehId = params.length > 1 ? params[1] : null;
      const rows = this._readTableRows('route_stops', tx)
        .filter(rs => {
          const r = routes.get(rs.route_id);
          if (!r || r.status !== 'active') return false;
          if (rs.subscription_id !== subId) return false;
          if (vehId && rs.vehicle_id !== vehId) return false;
          return true;
        })
        .slice(0, 1)
        .map(rs => {
          const r = routes.get(rs.route_id);
          return {
            ...rs,
            route_code: r.route_code,
            route_name: r.route_name,
            route_status: r.status,
            assigned_staff_id: r.assigned_staff_id
          };
        });
      return { rows, rowCount: rows.length };
    }

    // Q. routes LEFT JOIN staff
    if (/\bFROM\s+(?:public\.)?routes\s+r\b/i.test(cleanSql)) {
      const staffMap = new Map(this._readTableRows('staff', tx).map(s => [s.id, s]));
      const whereClause = this._extractWhere(cleanSql);
      let rows = this._readTableRows('routes', tx).filter(r => evalWhereCondition(whereClause, r, params));
      if (/\bLIMIT\s+1\b/i.test(cleanSql)) rows = rows.slice(0, 1);
      const joined = rows.map(r => {
        const s = r.assigned_staff_id ? staffMap.get(r.assigned_staff_id) : null;
        return { ...r, staff_name: s ? s.name : null, staff_code: s ? s.staff_code : null, staff_phone: s ? s.phone : null };
      });
      return { rows: joined, rowCount: joined.length };
    }

    // R. service_logs JOIN queries (findById & queryDailyCleanReports)
    if (/\bFROM\s+(?:public\.)?service_logs\s+sl\b/i.test(cleanSql)) {
      return this._selectServiceLogsJoin(cleanSql, params, tx);
    }

    // S. entity_marketing_tags JOIN marketing_tags
    if (/\bFROM\s+(?:public\.)?entity_marketing_tags\s+emt\b/i.test(cleanSql)) {
      const tags = new Map(this._readTableRows('marketing_tags', tx).map(t => [t.id, t]));
      const rows = this._readTableRows('entity_marketing_tags', tx)
        .filter(emt => emt.entity_type === params[0] && emt.entity_id === params[1])
        .map(emt => ({ ...(tags.get(emt.tag_id) || {}), sort_order: emt.sort_order }));
      return { rows, rowCount: rows.length };
    }

    // -------------------------------------------------------------------
    // General single-table SELECT
    // -------------------------------------------------------------------
    const singleMatch = cleanSql.match(/^SELECT\s+(.+?)\s+FROM\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(?:AS\s+)?(?!(?:WHERE|ORDER|GROUP|LIMIT|OFFSET|FOR|JOIN|LEFT|RIGHT|INNER)\b)([a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+(.*))?$/i);
    if (!singleMatch) {
      throw new Error(`[P0Harness] Unsupported SQL: ${sql}`);
    }

    const selectList = singleMatch[1].trim();
    const table = singleMatch[2].toLowerCase();
    const tail = (singleMatch[4] || '').trim();
    if (!this.committed.has(table)) {
      throw new Error(`[P0Harness] Unsupported SQL (unknown table ${table}): ${sql}`);
    }

    // Reject unhandled JOINs loudly
    if (/\bJOIN\b/i.test(tail)) {
      throw new Error(`[P0Harness] Unsupported SQL JOIN: ${sql}`);
    }

    await this._maybeFaultAndDelay(table, 'SELECT', null);

    const whereClause = this._extractWhereFromTail(tail);
    let rows = this._readTableRows(table, tx).filter(r => evalWhereCondition(whereClause, r, params));

    if (forUpdate && tx) {
      const locked = [];
      for (const r of rows) {
        await this._acquireLock(`row:${table}:${r.id}`, tx);
        // Re-read committed/staged state after acquiring lock (READ COMMITTED)
        const fresh = this._readTableRows(table, tx).find(x => x.id === r.id);
        if (fresh && evalWhereCondition(whereClause, fresh, params)) {
          locked.push(fresh);
        }
      }
      rows = locked;
    }

    // COUNT(*)::int AS count
    if (/^COUNT\(\*\)(?:::int)?\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i.test(selectList)) {
      const alias = selectList.match(/AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i)[1];
      return { rows: [{ [alias]: rows.length }], rowCount: 1 };
    }

    // ORDER BY
    const orderMatch = tail.match(/\bORDER\s+BY\s+(.+?)(?:\s+LIMIT\b|\s+OFFSET\b|$)/i);
    if (orderMatch) {
      const orderSpecs = splitTopLevel(orderMatch[1], ',');
      rows.sort((a, b) => {
        for (const spec of orderSpecs) {
          const parts = spec.trim().split(/\s+/);
          const col = parts[0].replace(/^[a-zA-Z_]+\./, '');
          const desc = parts.some(p => p.toUpperCase() === 'DESC');
          const av = a[col] ?? '';
          const bv = b[col] ?? '';
          const cmp = String(av).localeCompare(String(bv));
          if (cmp !== 0) return desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    rows = this._applyLimitOffset(cleanSql, rows, params);

    if (selectList === '*') {
      return { rows, rowCount: rows.length };
    }

    const cols = splitTopLevel(selectList, ',');
    const projected = rows.map(r => {
      const out = {};
      for (const c of cols) {
        const asMatch = c.match(/^(.+?)\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
        const expr = asMatch ? asMatch[1].trim() : c.trim();
        const alias = asMatch ? asMatch[2].trim() : expr.replace(/^[a-zA-Z_]+\./, '');
        if (expr === '*') {
          Object.assign(out, r);
        } else {
          const cleanCol = expr.replace(/^[a-zA-Z_]+\./, '');
          out[alias] = r[cleanCol] !== undefined ? r[cleanCol] : null;
        }
      }
      return out;
    });
    return { rows: projected, rowCount: projected.length };
  }

  _extractWhere(sql) {
    // Strip LATERAL (...) subqueries before finding outer WHERE
    let s = sql.replace(/LEFT\s+JOIN\s+LATERAL\s*\([\s\S]*?\)\s*[a-zA-Z_][a-zA-Z0-9_]*\s+ON\s+TRUE/i, '');
    const m = s.match(/\bWHERE\s+(.+?)(?:\s+GROUP\s+BY\b|\s+ORDER\s+BY\b|\s+LIMIT\b|\s+OFFSET\b|$)/i);
    return m ? m[1].trim() : '';
  }

  _extractWhereFromTail(tail) {
    if (!tail) return '';
    const m = tail.match(/\bWHERE\s+(.+?)(?:\s+GROUP\s+BY\b|\s+ORDER\s+BY\b|\s+LIMIT\b|\s+OFFSET\b|$)/i);
    return m ? m[1].trim() : '';
  }

  _applyLimitOffset(sql, rows, params) {
    let limit = null;
    let offset = 0;
    const limMatch = sql.match(/\bLIMIT\s+(\$\d+|\d+)/i);
    if (limMatch) {
      limit = limMatch[1].startsWith('$') ? Number(params[parseInt(limMatch[1].slice(1), 10) - 1]) : Number(limMatch[1]);
    }
    const offMatch = sql.match(/\bOFFSET\s+(\$\d+|\d+)/i);
    if (offMatch) {
      offset = offMatch[1].startsWith('$') ? Number(params[parseInt(offMatch[1].slice(1), 10) - 1]) : Number(offMatch[1]);
    }
    if (limit !== null) {
      return rows.slice(offset, offset + limit);
    }
    return offset > 0 ? rows.slice(offset) : rows;
  }

  _selectServiceJobsJoin(cleanSql, params, tx) {
    const custs = new Map(this._readTableRows('customers', tx).map(c => [c.id, c]));
    const vehs = new Map(this._readTableRows('vehicles', tx).map(v => [v.id, v]));
    const locs = new Map(this._readTableRows('service_locations', tx).map(l => [l.id, l]));
    const assigns = this._readTableRows('staff_assignments', tx).filter(sa => sa.is_active === true && sa.job_id);
    const assignByJob = new Map(assigns.map(sa => [sa.job_id, sa]));
    const staffMap = new Map(this._readTableRows('staff', tx).map(s => [s.id, s]));
    const execs = this._readTableRows('service_executions', tx);

    const whereClause = this._extractWhere(cleanSql);
    let jobs = this._readTableRows('service_jobs', tx).filter(j => {
      const sa = assignByJob.get(j.id) || {};
      const rowCtx = { ...j, staff_id: sa.staff_id || null };
      if (/JOIN\s+public\.staff_assignments\s+sa\b/i.test(cleanSql) && !/LEFT\s+JOIN\s+public\.staff_assignments\s+sa\b/i.test(cleanSql)) {
        if (!sa.staff_id) return false;
      }
      return evalWhereCondition(whereClause, rowCtx, params);
    });

    jobs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    jobs = this._applyLimitOffset(cleanSql, jobs, params);

    const hasLateralExec = /service_executions/i.test(cleanSql);

    const joined = jobs.map(j => {
      const c = custs.get(j.customer_id) || {};
      const v = j.vehicle_id ? (vehs.get(j.vehicle_id) || {}) : {};
      const loc = j.location_id ? (locs.get(j.location_id) || {}) : {};
      const sa = assignByJob.get(j.id) || {};
      const s = sa.staff_id ? (staffMap.get(sa.staff_id) || {}) : {};

      const base = {
        ...j,
        customer_name: c.name || null,
        customer_name_hi: c.name_hi || null,
        customer_phone: c.phone || null,
        customer_code: c.customer_code || null,
        registration_no: v.registration_no || null,
        brand_or_model: v.brand_or_model || null,
        car_make: v.car_make || null,
        car_color: v.car_color || null,
        vehicle_photo_url: v.photo_url || null,
        address_text: loc.address_text || null,
        address_text_hi: loc.address_text_hi || null,
        google_maps_url: loc.google_maps_url || null,
        parking_details: loc.parking_details || null,
        staff_id: sa.staff_id || null,
        assigned_staff_name: s.name || null,
        assigned_staff_code: s.staff_code || null
      };

      if (hasLateralExec) {
        const jobExecs = execs
          .filter(e => e.job_id === j.id)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const latest = jobExecs[0] || null;
        base.latest_execution_id = latest ? latest.id : null;
        base.latest_execution_outcome = latest ? latest.outcome : null;
        base.latest_execution_ended_at = latest ? latest.ended_at : null;
        base.latest_checklist_results = latest ? latest.checklist_results : null;
        base.latest_proof_photos = latest ? latest.proof_photos : null;
      }

      return base;
    });

    return { rows: joined, rowCount: joined.length };
  }

  _selectServiceLogsJoin(cleanSql, params, tx) {
    const staffMap = new Map(this._readTableRows('staff', tx).map(s => [s.id, s]));
    const subs = new Map(this._readTableRows('subscriptions', tx).map(s => [s.id, s]));
    const custs = new Map(this._readTableRows('customers', tx).map(c => [c.id, c]));
    const vehs = new Map(this._readTableRows('vehicles', tx).map(v => [v.id, v]));
    const jobs = new Map(this._readTableRows('service_jobs', tx).map(j => [j.id, j]));

    if (/\bWHERE\s+sl\.id\s*=\s*\$1\b/i.test(cleanSql)) {
      const sl = this._readTableRows('service_logs', tx).find(r => r.id === params[0]);
      if (!sl) return { rows: [], rowCount: 0 };
      const s = sl.staff_id ? staffMap.get(sl.staff_id) : null;
      const sub = sl.subscription_id ? subs.get(sl.subscription_id) : null;
      const c = sub ? custs.get(sub.customer_id) : null;
      const sj = sl.job_id ? jobs.get(sl.job_id) : null;
      const jc = sj ? custs.get(sj.customer_id) : null;
      const v = sl.vehicle_id ? vehs.get(sl.vehicle_id) : null;
      return {
        rows: [{
          ...sl,
          registration_no: v ? v.registration_no : null,
          customer_name: (c && c.name) || (jc && jc.name) || null,
          staff_name: s ? s.name : null,
          staff_code: s ? s.staff_code : null
        }],
        rowCount: 1
      };
    }

    // queryDailyCleanReports summary vs records
    let logs = this._readTableRows('service_logs', tx);
    // Filter by startDate ($1) and endDate ($2) if present
    if (params.length >= 2) {
      logs = logs.filter(l => {
        const d = toYmd(l.service_date);
        return (!params[0] || d >= toYmd(params[0])) && (!params[1] || d <= toYmd(params[1]));
      });
    }
    if (/\bCOUNT\(\*\)::int\s+AS\s+total_cleaned\b/i.test(cleanSql)) {
      const withPhoto = logs.filter(l => l.photo_url && String(l.photo_url).trim() !== '').length;
      const cnp = logs.filter(l => l.car_not_present || l.tag === 'car_not_present').length;
      return {
        rows: [{
          total_cleaned: logs.length,
          with_photo_count: withPhoto,
          without_photo_count: logs.length - withPhoto,
          car_not_present_count: cnp,
          active_staff_count: new Set(logs.map(l => l.staff_id).filter(Boolean)).size,
          latest_punch_time: logs[0] ? logs[0].completed_at_device : null
        }],
        rowCount: 1
      };
    }
    const records = logs.map(sl => {
      const s = sl.staff_id ? staffMap.get(sl.staff_id) : null;
      return { ...sl, staff_code: s ? s.staff_code : null, staff_name: s ? s.name : null };
    });
    return { rows: records, rowCount: records.length };
  }
}

/**
 * Create an isolated P0 E2E test harness.
 * Must be called before `server.js` / `repos` / `services` are required in a process,
 * or will safely reuse the singleton mocked `db` / `serverMod` across tests in the same file.
 */
function createP0E2EHarness() {
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    FORCE_NEON_IN_TEST: process.env.FORCE_NEON_IN_TEST,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    DATA_FILE: process.env.DATA_FILE
  };

  // 1. Force isolated test env BEFORE requiring anything
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  delete process.env.FORCE_NEON_IN_TEST;
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestP0Admin@2026';

  const baseTmpDir = process.env.TEAMWORK_TMP_DIR || path.join(os.tmpdir(), 'cwp_p0_e2e_tmp');
  fs.mkdirSync(baseTmpDir, { recursive: true });
  const tempDataFile = path.join(baseTmpDir, `local_data_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  fs.writeFileSync(tempDataFile, JSON.stringify({ customers: [], serviceLogs: [], serviceJobs: [] }));
  process.env.DATA_FILE = tempDataFile;

  // 2. Block real `pg` Pool / Client in require.cache
  const pgResolved = require.resolve('pg');
  const blockedPgExports = {
    Pool: class BlockedPgPool {
      constructor() {
        throw new Error('[P0Harness] Real pg.Pool blocked in isolated test mode');
      }
    },
    Client: class BlockedPgClient {
      constructor() {
        throw new Error('[P0Harness] Real pg.Client blocked in isolated test mode');
      }
    },
    types: { setTypeParser() {} }
  };
  require.cache[pgResolved] = {
    id: pgResolved,
    filename: pgResolved,
    loaded: true,
    exports: blockedPgExports
  };

  // 3. Install/reuse singleton engine on db/index.js
  const db = require('../../db/index');
  if (!db.__p0Engine) {
    const engine = new InMemoryPgEngine();
    db.__p0Engine = engine;
    db.isConfigured = () => true;
    db.resolveDatabaseConfig = () => ({
      isConfigured: true,
      pooledUrl: 'postgres://p0_harness_blocked:invalid@127.0.0.1:1/p0_mock',
      directUrl: 'postgres://p0_harness_blocked:invalid@127.0.0.1:1/p0_mock',
      databaseName: 'p0_in_memory_mock',
      isNeon: false,
      isPooled: false,
      host: '127.0.0.1'
    });
    db.getPool = () => {
      throw new Error('[P0Harness] Real pg.Pool blocked via db.getPool()');
    };
    db.query = (sql, params) => engine.query(sql, params, null);
    db.getClient = () => engine.acquireClient();
    db.withTransaction = (cb) => engine.withTransaction(cb);
    db.healthCheck = async () => ({ healthy: true, database: 'p0_in_memory_mock' });
    db.close = async () => {};
  }
  const engine = db.__p0Engine;

  // 4. Require repos, services, and server AFTER db stub is installed
  const repos = require('../../db/repositories/index');
  const services = {
    seeCatalogue: require('../../services/seeCatalogueService'),
    seeEntitlement: require('../../services/seeEntitlementService'),
    seeExecution: require('../../services/seeExecutionService'),
    seeStaffCapability: require('../../services/seeStaffCapabilityService'),
    booking: require('../../services/bookingService'),
    package: require('../../services/packageService'),
    offlineSync: require('../../services/offlineSyncService'),
    dcc: require('../../services/dccService'),
    admin: require('../../services/adminService')
  };
  const serverMod = require('../../server');
  if (typeof serverMod.setDataFile === 'function') {
    serverMod.setDataFile(tempDataFile);
  }

  async function withTransactionalDbMode(fn) {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test_pg_mock';
    try {
      return await fn();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }

  function dispatchHttp({ method = 'POST', url = '/api', body = null, token = null, headers = {} } = {}) {
    return withTransactionalDbMode(() => new Promise((resolve, reject) => {
      const bodyStr = body !== null && body !== undefined
        ? (typeof body === 'string' ? body : JSON.stringify(body))
        : '';
      const req = Readable.from(bodyStr ? [Buffer.from(bodyStr)] : []);
      req.method = method;
      req.url = url;
      req.headers = {
        host: '127.0.0.1',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers
      };
      req.socket = { remoteAddress: '127.0.0.1' };
      req.connection = req.socket;

      let statusCode = 200;
      const chunks = [];
      const resHeaders = {};
      const res = {
        headersSent: false,
        statusCode: 200,
        setHeader(k, v) { resHeaders[String(k).toLowerCase()] = v; },
        getHeader(k) { return resHeaders[String(k).toLowerCase()]; },
        removeHeader(k) { delete resHeaders[String(k).toLowerCase()]; },
        writeHead(code, hdrs) {
          statusCode = code;
          this.statusCode = code;
          this.headersSent = true;
          if (hdrs) {
            for (const [k, v] of Object.entries(hdrs)) {
              resHeaders[String(k).toLowerCase()] = v;
            }
          }
        },
        write(chunk) {
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          return true;
        },
        end(chunk) {
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode, headers: resHeaders, body: raw ? JSON.parse(raw) : null, raw });
          } catch (_) {
            resolve({ statusCode, headers: resHeaders, body: raw, raw });
          }
        }
      };

      try {
        serverMod.server.emit('request', req, res);
      } catch (err) {
        reject(err);
      }
    }));
  }

  function postApi(payload, token = null) {
    return dispatchHttp({ method: 'POST', url: '/api', body: payload, token });
  }

  function callSee(method, seePath, body = null, token = null) {
    const url = seePath.startsWith('/api/see/') ? seePath : `/api/see${seePath.startsWith('/') ? '' : '/'}${seePath}`;
    return dispatchHttp({ method, url, body, token });
  }

  function createAuthTokens({ staff = null, adminUsername = 'qa_admin' } = {}) {
    const adminToken = serverMod.createAdminSession();
    if (adminUsername && typeof serverMod.resolveAdminSession === 'function') {
      // createAdminSession stores username: 'admin'
    }
    let staffToken = null;
    if (staff) {
      const tok = 'stf_' + crypto.randomBytes(24).toString('hex');
      const now = Date.now();
      serverMod.recordStaffSession(tok, {
        staffId: staff.id,
        staffCode: staff.staff_code,
        staffName: staff.name,
        staffPhone: staff.phone,
        createdAt: now,
        expiresAt: now + 3600 * 1000
      });
      staffToken = tok;
    }
    return { adminToken, staffToken };
  }

  function reset() {
    engine.reset();
    if (typeof services.booking.__resetLocalStore === 'function') services.booking.__resetLocalStore();
    if (typeof services.package.__resetLocalStore === 'function') services.package.__resetLocalStore();
    if (typeof services.dcc.__resetLocalStores === 'function') services.dcc.__resetLocalStores();
    if (typeof repos.staff.__resetLocalStores === 'function') repos.staff.__resetLocalStores();
    if (typeof repos.routes.__resetLocalStores === 'function') repos.routes.__resetLocalStores();
    if (typeof serverMod.setAppState === 'function') {
      serverMod.setAppState({ customers: [], serviceLogs: [], serviceJobs: [] });
    }
  }

  function getTableRows(tableName) {
    const m = engine.committed.get(tableName);
    if (!m) throw new Error(`[P0Harness] Unknown table '${tableName}'`);
    return [...m.values()].map(deepClone);
  }

  let seqCounter = 0;
  function nextCode(prefix) {
    seqCounter += 1;
    return `${prefix}_${seqCounter}`;
  }

  async function seedCustomerAndAssets({
    name = 'QA Customer',
    phone = null,
    registrationNo = null,
    city = 'Gurugram',
    zone = 'Sector 56'
  } = {}) {
    return withTransactionalDbMode(async () => {
      const p = phone || `98${String(10000000 + seqCounter).slice(0, 8)}`;
      const customer = await repos.customers.createCustomer({
        customerCode: nextCode('CUST'),
        name,
        phone: p,
        isActive: true
      });
      const location = await repos.serviceLocations.createLocation({
        customerId: customer.id,
        addressType: 'primary',
        addressText: `${zone}, ${city}`,
        isPrimary: true,
        isActive: true
      });
      const vehicle = await repos.vehicles.createVehicle({
        customerId: customer.id,
        defaultLocationId: location.id,
        registrationNo: registrationNo || `HR26QA${String(1000 + seqCounter).slice(-4)}`,
        brandOrModel: 'Hyundai Creta',
        vehicleType: 'Car',
        seaterType: '5_seater',
        isActive: true
      });
      return { customer, location, vehicle };
    });
  }

  async function seedStaff({
    staffCode = null,
    name = 'QA Staff',
    phone = null,
    workType = 'dcc_and_services',
    serviceCapabilities = ['daily_car_cleaning', 'car_washing', 'solar_cleaning', 'interior_detailing', 'exterior_detailing'],
    equipmentAvailable = ['pressure_washer', 'vacuum', 'solar_brush'],
    isActive = true
  } = {}) {
    return withTransactionalDbMode(async () => {
      const code = staffCode || nextCode('STF');
      const created = await repos.staff.createStaff({
        staffCode: code,
        name,
        phone: phone || `97${String(10000000 + seqCounter).slice(0, 8)}`,
        workType,
        serviceCapabilities,
        isActive
      });
      // Set SEE capability fields directly on staff row (used by seeStaffCapabilityService)
      await engine.query(
        `UPDATE public.staff SET equipment_available = $2::jsonb, allowed_cities = $3::jsonb, allowed_zones = $4::jsonb WHERE id = $1`,
        [created.id, JSON.stringify(equipmentAvailable), JSON.stringify([]), JSON.stringify([])]
      );
      return repos.staff.findById(created.id);
    });
  }

  async function seedSeeServiceAndPackage({
    serviceCode = null,
    name = 'Canonical Car Wash',
    categoryId = 'car_washing',
    checklistRequirements = [
      { id: 'exterior_clean', key: 'exterior_clean', label: 'Exterior Clean', required: true },
      { id: 'glass_clean', key: 'glass_clean', label: 'Glass Clean', required: true },
      { id: 'wheel_clean', key: 'wheel_clean', label: 'Wheel Clean', required: true }
    ],
    photoRequirements = { before_min: 1, after_min: 1, required: true },
    packageQuantity = 3,
    includeAddon = false,
    addonOptional = false,
    addonQuantity = 1
  } = {}) {
    return withTransactionalDbMode(async () => {
      const svcCode = serviceCode || nextCode('SVC');
      const service = await services.seeCatalogue.createService({
        serviceCode: svcCode,
        name,
        serviceCategoryId: categoryId,
        serviceModel: 'visit_credit',
        checklistRequirements,
        photoRequirements,
        status: 'active'
      }, 'qa_admin');

      let addon = null;
      if (includeAddon) {
        addon = await services.seeCatalogue.createAddon({
          addonCode: nextCode('ADD'),
          name: 'Interior Vacuum Addon',
          defaultPrice: 200,
          isOptional: addonOptional,
          executionMode: 'during_main_service',
          applicableServiceIds: [service.id],
          status: 'active'
        }, 'qa_admin');
      }

      const pkgCode = nextCode('SEEPKG');
      const pkg = await services.seeCatalogue.createPackage({
        packageCode: pkgCode,
        name: `${name} Pack`,
        mainServiceId: service.id,
        validityValue: 90,
        validityUnit: 'days',
        basePrice: 1500,
        status: 'active',
        benefits: [{ serviceId: service.id, benefitType: 'visit_credit', quantity: packageQuantity }],
        addons: addon ? [{ addonId: addon.id, quantity: addonQuantity, isIncluded: true }] : []
      }, 'qa_admin');

      return { service, addon, pkg };
    });
  }

  function teardown() {
    engine.clearFaults();
    try {
      if (fs.existsSync(tempDataFile)) fs.unlinkSync(tempDataFile);
    } catch (_) {}
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  return {
    db,
    engine,
    repos,
    services,
    serverMod,
    reset,
    teardown,
    withTransactionalDbMode,
    dispatchHttp,
    postApi,
    callSee,
    createAuthTokens,
    getTableRows,
    seedCustomerAndAssets,
    seedStaff,
    seedSeeServiceAndPackage,
    injectErrorOnce: (opts) => engine.injectErrorOnce(opts),
    simulatePostCommitNetworkDropOnce: (err) => engine.simulatePostCommitNetworkDropOnce(err),
    setOpDelay: (opts) => engine.setOpDelay(opts),
    clearFaults: () => engine.clearFaults()
  };
}

module.exports = {
  createP0E2EHarness
};
