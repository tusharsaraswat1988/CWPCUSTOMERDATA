/**
 * =========================================================================
 * CWP Service & Entitlement Engine (SEE-01)
 * Phase 2: Service Frequency / Recurrence Engine
 *
 * Normalized, timezone-aware schedule generator supporting:
 * - one_time, daily, alternate_days, weekly, every_n_days,
 *   every_15_days (rolling), twice_per_month (calendar), monthly,
 *   every_n_months, specific_weekdays, specific_dates, custom
 * =========================================================================
 */

'use strict';

const repos = require('../db/repositories/index');

const VALID_FREQUENCY_TYPES = [
  'one_time', 'daily', 'alternate_days', 'weekly',
  'every_n_days', 'every_15_days', 'twice_per_month',
  'monthly', 'every_n_months', 'specific_weekdays',
  'specific_dates', 'custom'
];

/**
 * Format a Date object into YYYY-MM-DD in the specified IANA timezone (default Asia/Kolkata)
 */
function formatDateInTimezone(dateObj, timezone = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj);
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function addDaysYmd(ymd, days) {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonthsYmd(ymd, months, anchorDay = null) {
  const dt = parseYmd(ymd);
  const desiredDay = anchorDay || dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const year = dt.getUTCFullYear();
  const monthIdx = dt.getUTCMonth();
  const daysInTargetMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(desiredDay, daysInTargetMonth));
  return dt.toISOString().slice(0, 10);
}

function getWeekdayInTimezone(ymd) {
  return parseYmd(ymd).getUTCDay(); // 0=Sun..6=Sat
}

/**
 * Generate scheduled occurrence dates for a normalized frequency record
 * without any hardcoded service-specific branches.
 */
function generateOccurrences(frequency, { fromDate, toDate, blackoutDates = [] } = {}) {
  if (!frequency || !frequency.frequency_type) {
    throw new Error('Normalized frequency object with frequency_type is required.');
  }

  const tz = frequency.timezone || 'Asia/Kolkata';
  const start = fromDate || frequency.start_date || formatDateInTimezone(new Date(), tz);
  const end = toDate || frequency.end_date || addDaysYmd(start, 30);
  if (end < start) return [];

  const fType = frequency.frequency_type;
  const interval = Math.max(1, parseInt(frequency.interval_value, 10) || 1);
  const cfg = frequency.recurrence_config || {};
  const blackoutCfg = frequency.blackout_config || {};
  const weeklyOffDays = Array.isArray(blackoutCfg.weekly_off_days) ? blackoutCfg.weekly_off_days : [];
  const blackoutSet = new Set(blackoutDates.map(b => String(b.blackout_date || b).slice(0, 10)));
  const missedPolicy = frequency.missed_visit_policy || 'skip';

  const rawDates = [];

  if (fType === 'one_time') {
    rawDates.push(start);
  } else if (fType === 'daily') {
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, 1)) {
      rawDates.push(cur);
    }
  } else if (fType === 'alternate_days') {
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, 2)) {
      rawDates.push(cur);
    }
  } else if (fType === 'every_n_days') {
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, interval)) {
      rawDates.push(cur);
    }
  } else if (fType === 'every_15_days') {
    // Rolling 15-day interval (distinct from twice_per_month!)
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, 15)) {
      rawDates.push(cur);
    }
  } else if (fType === 'twice_per_month') {
    // Calendar month twice: fixed days of each calendar month (default [1, 15])
    const days = Array.isArray(cfg.days) && cfg.days.length >= 2 ? cfg.days : [1, 15];
    let curMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);
    while (curMonth <= endMonth) {
      const [y, m] = curMonth.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (const d of days) {
        const clamped = Math.min(d, daysInMonth);
        const candidate = `${curMonth}-${String(clamped).padStart(2, '0')}`;
        if (candidate >= start && candidate <= end) {
          rawDates.push(candidate);
        }
      }
      const nextM = addMonthsYmd(`${curMonth}-01`, 1);
      curMonth = nextM.slice(0, 7);
    }
  } else if (fType === 'weekly') {
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, 7 * interval)) {
      rawDates.push(cur);
    }
  } else if (fType === 'monthly') {
    const anchorDay = parseYmd(start).getUTCDate();
    for (let step = 0; ; step++) {
      const cur = step === 0 ? start : addMonthsYmd(start, step, anchorDay);
      if (cur > end) break;
      rawDates.push(cur);
    }
  } else if (fType === 'every_n_months') {
    const anchorDay = parseYmd(start).getUTCDate();
    for (let step = 0; ; step += interval) {
      const cur = step === 0 ? start : addMonthsYmd(start, step, anchorDay);
      if (cur > end) break;
      rawDates.push(cur);
    }
  } else if (fType === 'specific_weekdays') {
    const weekdays = Array.isArray(cfg.weekdays) ? cfg.weekdays : [1, 3, 5]; // 0=Sun..6=Sat
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, 1)) {
      if (weekdays.includes(getWeekdayInTimezone(cur))) {
        rawDates.push(cur);
      }
    }
  } else if (fType === 'specific_dates') {
    const dates = Array.isArray(cfg.dates) ? cfg.dates : [];
    for (const d of dates) {
      const ymd = String(d).slice(0, 10);
      if (ymd >= start && ymd <= end) rawDates.push(ymd);
    }
  } else if (fType === 'custom') {
    const stepDays = Math.max(1, parseInt(cfg.interval_days || interval, 10));
    for (let cur = start; cur <= end; cur = addDaysYmd(cur, stepDays)) {
      rawDates.push(cur);
    }
  }

  // Apply weekly-off & holiday/blackout handling
  const resolved = [];
  for (const d of rawDates) {
    const isWeeklyOff = weeklyOffDays.includes(getWeekdayInTimezone(d));
    const isHoliday = blackoutSet.has(d);
    if (!isWeeklyOff && !isHoliday) {
      resolved.push({ date: d, status: 'scheduled', shiftedFrom: null });
    } else if (missedPolicy === 'reschedule_next' || missedPolicy === 'carry_forward') {
      let nextDay = addDaysYmd(d, 1);
      let guard = 0;
      while (guard < 7 && (weeklyOffDays.includes(getWeekdayInTimezone(nextDay)) || blackoutSet.has(nextDay))) {
        nextDay = addDaysYmd(nextDay, 1);
        guard++;
      }
      if (nextDay <= end && !resolved.some(r => r.date === nextDay)) {
        resolved.push({ date: nextDay, status: 'rescheduled', shiftedFrom: d });
      }
    }
  }

  return resolved;
}

async function listFrequencies() {
  return repos.seeCatalogue.findAllFrequencies();
}

async function createFrequency(data) {
  if (!data.code || !data.name || !data.frequencyType) {
    throw new Error('code, name, and frequencyType are required.');
  }
  if (!VALID_FREQUENCY_TYPES.includes(data.frequencyType)) {
    throw new Error(`Invalid frequencyType '${data.frequencyType}'.`);
  }
  return repos.seeCatalogue.createFrequency({
    ...data,
    code: String(data.code).trim().toUpperCase()
  });
}

async function addBlackout(data, actor = 'admin') {
  if (!data.blackoutDate || !data.reason) {
    throw new Error('blackoutDate and reason are required.');
  }
  return repos.seeCatalogue.createBlackout({ ...data, createdBy: actor });
}

module.exports = {
  VALID_FREQUENCY_TYPES,
  formatDateInTimezone,
  generateOccurrences,
  listFrequencies,
  createFrequency,
  addBlackout
};
