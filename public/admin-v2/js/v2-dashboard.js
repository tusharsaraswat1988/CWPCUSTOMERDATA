/**
 * =========================================================================
 * CWP ADMIN V2 — EXECUTIVE OPERATIONS DASHBOARD CONTROLLER
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.dashboard.
 * Real-data-driven command center: Asia/Kolkata timezone, zero mock data,
 * zero visible DB IDs, partial-failure resilience, Material Symbols only.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const IST_TZ = 'Asia/Kolkata';

  const state = {
    initialized: false,
    isActiveTab: false,
    isLoading: false,
    hasLoadedOnce: false,
    lastUpdatedAt: null,
    sources: {
      customers: { ok: false, data: null, error: null },
      leads: { ok: false, data: null, error: null },
      staff: { ok: false, data: null, error: null },
      cleanReports: { ok: false, data: null, error: null },
      specialJobs: { ok: false, data: null, error: null },
      assignments: { ok: false, data: null, error: null },
      tracking: { ok: false, data: null, error: null },
      unassignedDcc: { ok: false, data: null, error: null }
    }
  };

  function escapeHtml(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getTodayIst() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function toIstDateKey(dateInput) {
    if (!dateInput) return '';
    const str = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function formatHeaderDateIst() {
    try {
      return new Date().toLocaleDateString('en-IN', {
        timeZone: IST_TZ,
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      return getTodayIst();
    }
  }

  function formatTimeIst(dateVal) {
    if (!dateVal) return '—';
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleTimeString('en-IN', {
        timeZone: IST_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '—';
    }
  }

  function isActiveFlag(val) {
    return val !== false && val !== 'No' && val !== 'no' && val !== 'Inactive' && val !== 'inactive' && val !== 0;
  }

  function isStaffLocked(s) {
    if (!s) return false;
    if (s.isLocked === true || s.is_locked === true) return true;
    if (s.lockedUntil || s.locked_until) {
      const t = new Date(s.lockedUntil || s.locked_until).getTime();
      if (!isNaN(t) && t > Date.now()) return true;
    }
    return false;
  }

  function normalizeJobStatus(j) {
    return String((j && (j.status || j.jobStatus)) || 'pending').toLowerCase().trim();
  }

  function normalizeCategory(j) {
    const raw = String((j && (j.service_category || j.serviceCategory || j.category || j.serviceType)) || '').toLowerCase();
    if (raw.includes('solar')) return 'solar_cleaning';
    if (raw.includes('interior')) return 'interior_detailing';
    if (raw.includes('exterior') || raw.includes('detail')) return 'exterior_detailing';
    return 'car_washing';
  }

  function formatCategoryLabel(cat) {
    if (cat === 'solar_cleaning') return 'Solar Panel Cleaning';
    if (cat === 'interior_detailing') return 'Interior Detailing';
    if (cat === 'exterior_detailing') return 'Exterior Detailing';
    return 'Car Washing';
  }

  function hasStaffAssignedToJob(j) {
    return Boolean(
      (j && j.staffId) ||
      (j && j.staff_id) ||
      (j && j.staffName && String(j.staffName).trim() && String(j.staffName).toLowerCase() !== 'unassigned') ||
      (j && j.staff_name && String(j.staff_name).trim() && String(j.staff_name).toLowerCase() !== 'unassigned')
    );
  }

  function navigateToModule(tabName, options = {}) {
    if (window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.navigateTo === 'function') {
      window.CWP_ADMIN_V2.shell.navigateTo(tabName);
    }
    if (typeof options.afterNavigate === 'function') {
      setTimeout(options.afterNavigate, 60);
    }
  }

  async function loadData(opts = {}) {
    if (state.isLoading) return;
    const api = window.CWP_ADMIN_V2.api;
    const auth = window.CWP_ADMIN_V2.auth;
    if (!api || !auth || !auth.getToken()) return;

    state.isLoading = true;
    const refreshBtn = document.getElementById('v2DashRefreshBtn');
    const todayIst = getTodayIst();

    const runFetch = async () => {
      if (!state.hasLoadedOnce) {
        renderLoadingState();
      }

      const specs = [
        { key: 'customers', action: 'getAllCustomers', payload: {} },
        { key: 'leads', action: 'getLeads', payload: {} },
        { key: 'staff', action: 'getStaffList', payload: {} },
        { key: 'cleanReports', action: 'getDailyCleanReports', payload: { startDate: todayIst, endDate: todayIst } },
        { key: 'specialJobs', action: 'getSpecialJobs', payload: {} },
        { key: 'assignments', action: 'getDailyCleanAssignments', payload: {} },
        { key: 'tracking', action: 'getStaffTrackingSummary', payload: {} },
        { key: 'unassignedDcc', action: 'getUnassignedDccVehicles', payload: {} }
      ];

      const settled = await Promise.allSettled(
        specs.map(s => api.request(s.action, s.payload))
      );

      settled.forEach((res, idx) => {
        const key = specs[idx].key;
        if (res.status === 'fulfilled') {
          state.sources[key] = { ok: true, data: res.value, error: null };
        } else {
          state.sources[key] = {
            ok: false,
            data: null,
            error: (res.reason && res.reason.message) || 'Request failed'
          };
        }
      });

      state.hasLoadedOnce = true;
      state.lastUpdatedAt = new Date();
      renderAll();

      if (opts.manual && window.CWP_ADMIN_V2.toast) {
        const failedCount = Object.values(state.sources).filter(s => !s.ok).length;
        if (failedCount === 0) {
          window.CWP_ADMIN_V2.toast.show('Dashboard refreshed with live operational data.', 'success', 2200);
        } else {
          window.CWP_ADMIN_V2.toast.show(`Dashboard refreshed with ${failedCount} partial source error(s).`, 'warning', 3200);
        }
      }
    };

    try {
      if (refreshBtn && typeof api.withLoadingButton === 'function') {
        await api.withLoadingButton(refreshBtn, runFetch);
      } else {
        await runFetch();
      }
    } finally {
      state.isLoading = false;
    }
  }

  function renderLoadingState() {
    const kpiGrid = document.getElementById('v2DashKpiGrid');
    if (kpiGrid) {
      kpiGrid.innerHTML = Array.from({ length: 6 }).map(() => `
        <div class="cwp-v2-dash-kpi-card" aria-busy="true">
          <div class="cwp-v2-dash-kpi-top"><span class="cwp-v2-dash-kpi-label">Loading...</span></div>
          <div class="cwp-v2-dash-kpi-value">—</div>
          <div class="cwp-v2-dash-kpi-sub">Fetching live data</div>
        </div>
      `).join('');
    }
  }

  function getCustomersArray() {
    const s = state.sources.customers;
    if (!s.ok) return null;
    if (Array.isArray(s.data)) return s.data;
    if (s.data && Array.isArray(s.data.customers)) return s.data.customers;
    return [];
  }

  function getLeadsArray() {
    const s = state.sources.leads;
    if (!s.ok) return null;
    if (Array.isArray(s.data)) return s.data;
    if (s.data && Array.isArray(s.data.leads)) return s.data.leads;
    return [];
  }

  function getStaffArray() {
    const s = state.sources.staff;
    if (!s.ok) return null;
    if (Array.isArray(s.data)) return s.data;
    if (s.data && Array.isArray(s.data.staff)) return s.data.staff;
    return [];
  }

  function getJobsArray() {
    const s = state.sources.specialJobs;
    if (!s.ok) return null;
    if (Array.isArray(s.data)) return s.data;
    if (s.data && Array.isArray(s.data.jobs)) return s.data.jobs;
    return [];
  }

  function getAssignmentsArray() {
    const s = state.sources.assignments;
    if (!s.ok) return null;
    if (s.data && Array.isArray(s.data.assignments)) return s.data.assignments;
    if (s.data && Array.isArray(s.data.data)) return s.data.data;
    return [];
  }

  function getUnassignedVehiclesArray() {
    const s = state.sources.unassignedDcc;
    if (!s.ok) return null;
    if (s.data && Array.isArray(s.data.unassigned)) return s.data.unassigned;
    if (s.data && Array.isArray(s.data.vehicles)) return s.data.vehicles;
    if (Array.isArray(s.data)) return s.data;
    return [];
  }

  function renderHeader() {
    const dateEl = document.getElementById('v2DashOpDate');
    const updatedEl = document.getElementById('v2DashLastUpdated');
    const bannerEl = document.getElementById('v2DashPartialBanner');
    const bannerTextEl = document.getElementById('v2DashPartialText');

    if (dateEl) dateEl.textContent = `${formatHeaderDateIst()} (IST)`;
    if (updatedEl) {
      updatedEl.textContent = state.lastUpdatedAt
        ? `Last updated: ${formatTimeIst(state.lastUpdatedAt)} IST`
        : 'Not synced yet';
    }

    const failedSources = Object.entries(state.sources)
      .filter(([, v]) => state.hasLoadedOnce && !v.ok)
      .map(([k]) => k);

    if (bannerEl && bannerTextEl) {
      if (failedSources.length > 0) {
        bannerTextEl.textContent = `Some operational sources failed to load (${failedSources.join(', ')}). Affected metrics show "—" rather than zero.`;
        bannerEl.hidden = false;
      } else {
        bannerEl.hidden = true;
      }
    }
  }

  function renderKpis() {
    const container = document.getElementById('v2DashKpiGrid');
    if (!container) return;

    const todayIst = getTodayIst();
    const customers = getCustomersArray();
    const leads = getLeadsArray();
    const staff = getStaffArray();
    const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
    const jobs = getJobsArray();
    const trackingRes = state.sources.tracking.ok ? state.sources.tracking.data : null;

    // 1. Active Customers
    const activeCusts = customers ? customers.filter(c => isActiveFlag(c.active) && isActiveFlag(c.is_active)).length : null;
    const custSub = customers ? `Total directory: ${customers.length}` : 'Failed to load';

    // 2. Daily Cleaning Today
    const cleanSum = (cleanRes && cleanRes.summary) || null;
    const cleanDone = cleanSum ? (cleanSum.totalCleaned ?? (Array.isArray(cleanRes.records) ? cleanRes.records.length : 0)) : null;
    const cleanSched = cleanSum && typeof cleanSum.totalScheduled === 'number' ? cleanSum.totalScheduled : null;
    const cleanPending = cleanSum && typeof cleanSum.totalPending === 'number' ? cleanSum.totalPending : null;
    const photoRate = cleanSum && typeof cleanSum.photoRate === 'number' ? cleanSum.photoRate : null;
    let cleanVal = '—';
    let cleanSub = 'Failed to load';
    if (cleanDone !== null) {
      cleanVal = cleanSched !== null && cleanSched > 0 ? `${cleanDone}/${cleanSched}` : String(cleanDone);
      cleanSub = cleanPending !== null && cleanPending > 0
        ? `${cleanPending} pending • ${photoRate ?? 0}% photo`
        : `Photo verified: ${photoRate ?? 0}%`;
    }

    // 3. Pending / Open Service Jobs
    let pendingJobsCount = null;
    let unassignedJobsCount = 0;
    let inProgJobsCount = 0;
    if (jobs !== null) {
      const openJobs = jobs.filter(j => {
        const st = normalizeJobStatus(j);
        return st === 'pending' || st === 'unassigned' || st === 'assigned' || st === 'in_progress';
      });
      pendingJobsCount = openJobs.length;
      unassignedJobsCount = openJobs.filter(j => !hasStaffAssignedToJob(j) || normalizeJobStatus(j) === 'unassigned').length;
      inProgJobsCount = openJobs.filter(j => normalizeJobStatus(j) === 'in_progress').length;
    }
    const pendingJobsSub = jobs !== null
      ? `Unassigned: ${unassignedJobsCount} • In progress: ${inProgJobsCount}`
      : 'Failed to load';

    // 4. Completed Jobs Today
    let completedTodayCount = null;
    let completedTotalCount = 0;
    if (jobs !== null) {
      const completedAll = jobs.filter(j => normalizeJobStatus(j) === 'completed');
      completedTotalCount = completedAll.length;
      completedTodayCount = completedAll.filter(j => {
        const dKey = toIstDateKey(j.completed_at || j.completedAt || j.scheduled_date || j.scheduledDate);
        return dKey === todayIst;
      }).length;
    }
    const completedSub = jobs !== null
      ? `All recorded completed: ${completedTotalCount}`
      : 'Failed to load';

    // 5. Active Staff Accounts
    const activeStaffCount = staff ? staff.filter(s => isActiveFlag(s.active) && isActiveFlag(s.isActive)).length : null;
    const trackedCount = trackingRes && trackingRes.kpis && typeof trackingRes.kpis.activeStaffCount === 'number'
      ? trackingRes.kpis.activeStaffCount
      : null;
    const staffSub = staff !== null
      ? (trackedCount !== null ? `GPS tracked today: ${trackedCount} • Total: ${staff.length}` : `Total staff roster: ${staff.length}`)
      : 'Failed to load';

    // 6. Open Leads
    let openLeadsCount = null;
    if (leads !== null) {
      openLeadsCount = leads.filter(l => {
        const st = String(l.stage || l.status || 'new').toLowerCase().trim();
        return st !== 'converted' && st !== 'lost' && st !== 'closed';
      }).length;
    }
    const leadsSub = leads !== null ? `Total inquiries: ${leads.length}` : 'Failed to load';

    const cards = [
      {
        id: 'v2DashKpiCustomers',
        label: 'Active Customers',
        value: activeCusts !== null ? String(activeCusts) : '—',
        sub: custSub,
        icon: 'folder_shared',
        tab: 'records',
        error: activeCusts === null
      },
      {
        id: 'v2DashKpiDailyClean',
        label: 'Daily Cleaning Today',
        value: cleanVal,
        sub: cleanSub,
        icon: 'directions_car',
        tab: 'cleanReports',
        error: cleanDone === null
      },
      {
        id: 'v2DashKpiPendingJobs',
        label: 'Open Service Jobs',
        value: pendingJobsCount !== null ? String(pendingJobsCount) : '—',
        sub: pendingJobsSub,
        icon: 'pending_actions',
        tab: 'specialJobs',
        warning: unassignedJobsCount > 0,
        error: pendingJobsCount === null
      },
      {
        id: 'v2DashKpiCompletedJobs',
        label: 'Completed Today',
        value: completedTodayCount !== null ? String(completedTodayCount) : '—',
        sub: completedSub,
        icon: 'task_alt',
        tab: 'specialJobs',
        error: completedTodayCount === null
      },
      {
        id: 'v2DashKpiStaff',
        label: 'Active Staff Accounts',
        value: activeStaffCount !== null ? String(activeStaffCount) : '—',
        sub: staffSub,
        icon: 'badge',
        tab: 'staff',
        error: activeStaffCount === null
      },
      {
        id: 'v2DashKpiLeads',
        label: 'Open Leads',
        value: openLeadsCount !== null ? String(openLeadsCount) : '—',
        sub: leadsSub,
        icon: 'contact_mail',
        tab: 'leads',
        error: openLeadsCount === null
      }
    ];

    container.innerHTML = cards.map(c => `
      <button
        type="button"
        id="${c.id}"
        class="cwp-v2-dash-kpi-card${c.warning ? ' is-warning' : ''}${c.error ? ' is-error' : ''}"
        data-nav-tab="${c.tab}"
        title="Open ${escapeHtml(c.label)}"
      >
        <div class="cwp-v2-dash-kpi-top">
          <span class="cwp-v2-dash-kpi-label">${escapeHtml(c.label)}</span>
          <span class="material-symbols-outlined cwp-v2-dash-kpi-icon" aria-hidden="true">${c.icon}</span>
        </div>
        <div class="cwp-v2-dash-kpi-value">${escapeHtml(c.value)}</div>
        <div class="cwp-v2-dash-kpi-sub">${escapeHtml(c.sub)}</div>
      </button>
    `).join('');

    container.querySelectorAll('.cwp-v2-dash-kpi-card[data-nav-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateToModule(btn.getAttribute('data-nav-tab'));
      });
    });
  }

  function renderOperationalOverview() {
    const container = document.getElementById('v2DashOpsOverview');
    if (!container) return;

    const todayIst = getTodayIst();
    const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
    const assignRes = state.sources.assignments.ok ? state.sources.assignments.data : null;
    const jobs = getJobsArray();

    // 1. Daily Car Cleaning
    const cleanRecords = cleanRes && Array.isArray(cleanRes.records) ? cleanRes.records : null;
    const cleanSum = (cleanRes && cleanRes.summary) || {};
    const dccAssignList = getAssignmentsArray();
    const dccAssigned = dccAssignList ? dccAssignList.filter(a => a.isAssigned).length : null;
    const dccUnassigned = dccAssignList ? dccAssignList.filter(a => !a.isAssigned).length : null;
    const dccCleanedToday = cleanRecords ? cleanRecords.filter(r => String(r.status || 'completed').toLowerCase() === 'completed').length : null;
    const dccPendingToday = typeof cleanSum.totalPending === 'number' ? cleanSum.totalPending : null;
    const dccExcToday = cleanRecords ? cleanRecords.filter(r => {
      const st = String(r.status || '').toLowerCase();
      return r.car_not_present === true || st === 'car_not_present' || st === 'customer_absent' || st === 'vehicle_not_available' || st === 'skipped' || st === 'unable_to_complete';
    }).length : null;

    // 2. Car Washing & Detailing (Today IST)
    const washJobs = jobs ? jobs.filter(j => normalizeCategory(j) !== 'solar_cleaning') : null;
    const washToday = washJobs ? washJobs.filter(j => toIstDateKey(j.scheduled_date || j.scheduledDate) === todayIst) : null;
    const washPending = washToday ? washToday.filter(j => ['pending', 'unassigned'].includes(normalizeJobStatus(j))).length : null;
    const washAssigned = washToday ? washToday.filter(j => ['assigned', 'in_progress'].includes(normalizeJobStatus(j))).length : null;
    const washCompleted = washToday ? washToday.filter(j => normalizeJobStatus(j) === 'completed').length : null;
    const washFailed = washToday ? washToday.filter(j => ['failed', 'cancelled'].includes(normalizeJobStatus(j))).length : null;

    // 3. Solar Panel Cleaning (Today IST)
    const solarJobs = jobs ? jobs.filter(j => normalizeCategory(j) === 'solar_cleaning') : null;
    const solarToday = solarJobs ? solarJobs.filter(j => toIstDateKey(j.scheduled_date || j.scheduledDate) === todayIst) : null;
    const solarPending = solarToday ? solarToday.filter(j => ['pending', 'unassigned'].includes(normalizeJobStatus(j))).length : null;
    const solarAssigned = solarToday ? solarToday.filter(j => ['assigned', 'in_progress'].includes(normalizeJobStatus(j))).length : null;
    const solarCompleted = solarToday ? solarToday.filter(j => normalizeJobStatus(j) === 'completed').length : null;
    const solarFailed = solarToday ? solarToday.filter(j => ['failed', 'cancelled'].includes(normalizeJobStatus(j))).length : null;

    const fmt = v => (v === null || v === undefined ? '—' : String(v));

    container.innerHTML = `
      <div class="cwp-v2-dash-ops-card">
        <div class="cwp-v2-dash-ops-head">
          <div class="cwp-v2-dash-ops-title">
            <span class="material-symbols-outlined" aria-hidden="true">directions_car</span>
            <span>Daily Car Cleaning</span>
          </div>
          <span class="cwp-v2-dash-pill">Today (IST)</span>
        </div>
        <div class="cwp-v2-dash-stat-list">
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(dccCleanedToday)}</div>
            <div class="cwp-v2-dash-stat-lbl">Cleaned Today</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(dccPendingToday)}</div>
            <div class="cwp-v2-dash-stat-lbl">Pending Today</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(dccAssigned)} / ${fmt(dccUnassigned)}</div>
            <div class="cwp-v2-dash-stat-lbl">Assigned / Unassigned</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(dccExcToday)}</div>
            <div class="cwp-v2-dash-stat-lbl">Reported Exceptions</div>
          </div>
        </div>
        <div class="cwp-v2-dash-ops-foot">
          <span class="cwp-v2-dash-meta-text">${assignRes ? `Active DCC roster: ${dccAssignList.length}` : 'Roster unavailable'}</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-dash-nav="cleanReports">
            <span>View Status</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </div>

      <div class="cwp-v2-dash-ops-card">
        <div class="cwp-v2-dash-ops-head">
          <div class="cwp-v2-dash-ops-title">
            <span class="material-symbols-outlined" aria-hidden="true">local_car_wash</span>
            <span>Car Washing &amp; Detailing</span>
          </div>
          <span class="cwp-v2-dash-pill">${washToday ? `${washToday.length} Today` : '—'}</span>
        </div>
        <div class="cwp-v2-dash-stat-list">
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(washPending)}</div>
            <div class="cwp-v2-dash-stat-lbl">Pending / Unassigned</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(washAssigned)}</div>
            <div class="cwp-v2-dash-stat-lbl">Assigned / Active</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(washCompleted)}</div>
            <div class="cwp-v2-dash-stat-lbl">Completed Today</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(washFailed)}</div>
            <div class="cwp-v2-dash-stat-lbl">Failed / Cancelled</div>
          </div>
        </div>
        <div class="cwp-v2-dash-ops-foot">
          <span class="cwp-v2-dash-meta-text">${washJobs ? `Total tracked wash/detailing: ${washJobs.length}` : 'Jobs unavailable'}</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-dash-nav="specialJobs">
            <span>View Jobs</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </div>

      <div class="cwp-v2-dash-ops-card">
        <div class="cwp-v2-dash-ops-head">
          <div class="cwp-v2-dash-ops-title">
            <span class="material-symbols-outlined" aria-hidden="true">solar_power</span>
            <span>Solar Panel Cleaning</span>
          </div>
          <span class="cwp-v2-dash-pill">${solarToday ? `${solarToday.length} Today` : '—'}</span>
        </div>
        <div class="cwp-v2-dash-stat-list">
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(solarPending)}</div>
            <div class="cwp-v2-dash-stat-lbl">Pending / Unassigned</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(solarAssigned)}</div>
            <div class="cwp-v2-dash-stat-lbl">Assigned / Active</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(solarCompleted)}</div>
            <div class="cwp-v2-dash-stat-lbl">Completed Today</div>
          </div>
          <div class="cwp-v2-dash-stat-item">
            <div class="cwp-v2-dash-stat-num">${fmt(solarFailed)}</div>
            <div class="cwp-v2-dash-stat-lbl">Failed / Cancelled</div>
          </div>
        </div>
        <div class="cwp-v2-dash-ops-foot">
          <span class="cwp-v2-dash-meta-text">${solarJobs ? `Total tracked solar jobs: ${solarJobs.length}` : 'Jobs unavailable'}</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-dash-nav="specialJobs">
            <span>View Solar</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-dash-nav]').forEach(btn => {
      btn.addEventListener('click', () => navigateToModule(btn.getAttribute('data-dash-nav')));
    });
  }

  function renderExceptions() {
    const container = document.getElementById('v2DashExceptionsList');
    const badgeEl = document.getElementById('v2DashExceptionsBadge');
    if (!container) return;

    const exceptions = [];
    const jobs = getJobsArray();
    const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
    const assignList = getAssignmentsArray();
    const staffList = getStaffArray();
    const customers = getCustomersArray();
    const unassignedVehicles = getUnassignedVehiclesArray();

    // 1. Unassigned Service Bookings
    if (jobs !== null) {
      const unassignedBookings = jobs.filter(j => {
        const st = normalizeJobStatus(j);
        return st !== 'completed' && st !== 'cancelled' && st !== 'failed' && (!hasStaffAssignedToJob(j) || st === 'unassigned');
      });
      if (unassignedBookings.length > 0) {
        exceptions.push({
          priority: 'high',
          icon: 'assignment_late',
          title: 'Unassigned Service Bookings',
          desc: 'On-demand or package service jobs waiting for staff assignment.',
          count: unassignedBookings.length,
          tab: 'specialJobs',
          actionLabel: 'Assign'
        });
      }

      const failedJobs = jobs.filter(j => normalizeJobStatus(j) === 'failed');
      if (failedJobs.length > 0) {
        exceptions.push({
          priority: 'high',
          icon: 'error',
          title: 'Failed Service Jobs',
          desc: 'Jobs marked failed that require admin follow-up or rescheduling.',
          count: failedJobs.length,
          tab: 'specialJobs',
          actionLabel: 'Review'
        });
      }
    }

    // 2. Unassigned Daily Cleaning Customers
    if (assignList !== null) {
      const unassignedDcc = assignList.filter(a => !a.isAssigned);
      if (unassignedDcc.length > 0) {
        exceptions.push({
          priority: 'high',
          icon: 'person_off',
          title: 'Unassigned Daily Cleaning Customers',
          desc: 'Active DCC subscribers without an assigned cleaner.',
          count: unassignedDcc.length,
          tab: 'jobAssignment',
          actionLabel: 'Assign'
        });
      }
    }

    // 3. Daily Cleaning Exceptions Today
    if (cleanRes && Array.isArray(cleanRes.records)) {
      const cleanExceptions = cleanRes.records.filter(r => {
        const st = String(r.status || '').toLowerCase();
        return r.car_not_present === true || st === 'car_not_present' || st === 'customer_absent' || st === 'vehicle_not_available' || st === 'unable_to_complete' || st === 'skipped';
      });
      if (cleanExceptions.length > 0) {
        exceptions.push({
          priority: 'medium',
          icon: 'event_busy',
          title: 'Daily Cleaning Exceptions Today',
          desc: 'Vehicles reported car-not-present, skipped, or unable to complete.',
          count: cleanExceptions.length,
          tab: 'cleanReports',
          actionLabel: 'Inspect'
        });
      }
    }

    // 4. Inactive or Locked Staff with Active Assignments
    if (staffList !== null) {
      const inactiveOrLockedStaffIds = new Set();
      staffList.forEach(s => {
        if (!isActiveFlag(s.active) || !isActiveFlag(s.isActive) || isStaffLocked(s)) {
          if (s.id) inactiveOrLockedStaffIds.add(String(s.id));
          if (s.staffCode) inactiveOrLockedStaffIds.add(String(s.staffCode));
        }
      });

      if (inactiveOrLockedStaffIds.size > 0) {
        let impactedCount = 0;
        if (assignList) {
          impactedCount += assignList.filter(a => a.isAssigned && (inactiveOrLockedStaffIds.has(String(a.staffId)) || inactiveOrLockedStaffIds.has(String(a.staffCode)))).length;
        }
        if (jobs) {
          impactedCount += jobs.filter(j => {
            const st = normalizeJobStatus(j);
            if (st === 'completed' || st === 'cancelled' || st === 'failed') return false;
            return inactiveOrLockedStaffIds.has(String(j.staff_id || j.staffId || ''));
          }).length;
        }
        if (impactedCount > 0) {
          exceptions.push({
            priority: 'high',
            icon: 'lock_person',
            title: 'Inactive or Locked Staff with Active Work',
            desc: 'Assignments held by inactive or locked staff accounts.',
            count: impactedCount,
            tab: 'staff',
            actionLabel: 'Resolve'
          });
        }
      }
    }

    // 5. DCC Vehicles Missing Route Stop Order
    if (unassignedVehicles !== null && unassignedVehicles.length > 0) {
      exceptions.push({
        priority: 'medium',
        icon: 'route',
        title: 'DCC Vehicles Missing Route Sequence',
        desc: 'Active daily cleaning vehicles not yet placed in a route stop order.',
        count: unassignedVehicles.length,
        tab: 'sequence',
        actionLabel: 'Plan Route'
      });
    }

    // 6. Active Customers Missing Address
    if (customers !== null) {
      const missingAddr = customers.filter(c => {
        if (!isActiveFlag(c.active) || !isActiveFlag(c.is_active)) return false;
        const addr = String(c.address || c.address_text || c.location || '').trim();
        return !addr;
      });
      if (missingAddr.length > 0) {
        exceptions.push({
          priority: 'medium',
          icon: 'location_off',
          title: 'Active Customers Missing Address',
          desc: 'Active customer profiles without a service address.',
          count: missingAddr.length,
          tab: 'records',
          actionLabel: 'Review'
        });
      }
    }

    if (badgeEl) {
      badgeEl.textContent = String(exceptions.reduce((acc, item) => acc + item.count, 0));
    }

    if (exceptions.length === 0) {
      const anyFailed = Object.values(state.sources).some(s => !s.ok);
      if (anyFailed) {
        container.innerHTML = `
          <div class="cwp-v2-dash-empty-box">
            Unable to complete all exception checks because one or more data sources failed to load.
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="cwp-v2-dash-zero-state">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            <span>All clear — no operational exceptions detected across live data.</span>
          </div>
        `;
      }
      return;
    }

    container.innerHTML = exceptions.map(exc => `
      <div class="cwp-v2-dash-exc-item${exc.priority === 'high' ? ' is-high' : ''}">
        <div class="cwp-v2-dash-exc-left">
          <span class="material-symbols-outlined cwp-v2-dash-exc-icon" aria-hidden="true">${exc.icon}</span>
          <div>
            <div class="cwp-v2-dash-exc-title">${escapeHtml(exc.title)}</div>
            <div class="cwp-v2-dash-exc-desc">${escapeHtml(exc.desc)}</div>
          </div>
        </div>
        <div class="cwp-v2-dash-exc-right">
          <span class="cwp-v2-dash-exc-count">${exc.count}</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-exc-nav="${exc.tab}">
            <span>${escapeHtml(exc.actionLabel)}</span>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-exc-nav]').forEach(btn => {
      btn.addEventListener('click', () => navigateToModule(btn.getAttribute('data-exc-nav')));
    });
  }

  function renderStaffOverview() {
    const pillsEl = document.getElementById('v2DashStaffPills');
    const tbodyEl = document.getElementById('v2DashStaffTableBody');
    if (!pillsEl || !tbodyEl) return;

    const staffList = getStaffArray();
    const trackingRes = state.sources.tracking.ok ? state.sources.tracking.data : null;
    const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
    const assignList = getAssignmentsArray();
    const jobs = getJobsArray();

    if (staffList === null) {
      pillsEl.innerHTML = '<span class="cwp-v2-dash-pill">Staff roster unavailable</span>';
      tbodyEl.innerHTML = '<tr><td colspan="5" class="cwp-v2-dash-table-msg is-error">Failed to load staff roster.</td></tr>';
      return;
    }

    const activeAccounts = staffList.filter(s => isActiveFlag(s.active) && isActiveFlag(s.isActive)).length;
    const trackedCount = trackingRes && trackingRes.kpis && typeof trackingRes.kpis.activeStaffCount === 'number'
      ? trackingRes.kpis.activeStaffCount
      : null;

    // Build per-staff metrics keyed by internal id/code, displayed ONLY by staffName
    const staffMetrics = new Map();
    staffList.forEach(s => {
      const key = String(s.id || s.staffCode || s.name || '');
      if (!key) return;
      const locked = isStaffLocked(s);
      const active = isActiveFlag(s.active) && isActiveFlag(s.isActive);
      staffMetrics.set(key, {
        name: s.name || 'Unnamed Staff',
        statusLabel: locked ? 'Locked' : (active ? 'Active' : 'Inactive'),
        statusClass: locked ? 'is-danger' : (active ? 'is-completed' : 'is-pending'),
        dccAssigned: 0,
        cleanedToday: 0,
        activeJobs: 0,
        aliases: [s.id, s.staffCode, s.name].filter(Boolean).map(v => String(v).toLowerCase())
      });
    });

    function findMetricEntry(idVal, codeVal, nameVal) {
      const candidates = [idVal, codeVal, nameVal].filter(Boolean).map(v => String(v).toLowerCase());
      for (const entry of staffMetrics.values()) {
        if (candidates.some(c => entry.aliases.includes(c))) return entry;
      }
      return null;
    }

    if (assignList) {
      assignList.forEach(a => {
        if (!a.isAssigned) return;
        const entry = findMetricEntry(a.staffId, a.staffCode, a.staffName);
        if (entry) entry.dccAssigned++;
      });
    }

    if (cleanRes && cleanRes.summary && Array.isArray(cleanRes.summary.staffMatrix)) {
      cleanRes.summary.staffMatrix.forEach(m => {
        const entry = findMetricEntry(m.staffId || m.staff_id, m.staffCode || m.staff_code, m.staffName || m.staff_name);
        if (entry) {
          entry.cleanedToday += Number(m.cleanedCount || 0);
          if (!assignList && typeof m.totalAssigned === 'number') {
            entry.dccAssigned = Math.max(entry.dccAssigned, m.totalAssigned);
          }
        }
      });
    } else if (cleanRes && Array.isArray(cleanRes.records)) {
      cleanRes.records.forEach(r => {
        if (String(r.status || 'completed').toLowerCase() !== 'completed') return;
        const entry = findMetricEntry(r.staff_id, r.staff_code, r.staff_name);
        if (entry) entry.cleanedToday++;
      });
    }

    if (jobs) {
      jobs.forEach(j => {
        const st = normalizeJobStatus(j);
        if (st === 'completed' || st === 'cancelled' || st === 'failed') return;
        const entry = findMetricEntry(j.staff_id || j.staffId, j.staff_code || j.staffCode, j.staff_name || j.staffName);
        if (entry) entry.activeJobs++;
      });
    }

    const rows = Array.from(staffMetrics.values());
    const staffWithDcc = rows.filter(r => r.dccAssigned > 0).length;

    pillsEl.innerHTML = `
      <span class="cwp-v2-dash-pill">Active Accounts: ${activeAccounts}</span>
      <span class="cwp-v2-dash-pill">GPS Tracked Today: ${trackedCount !== null ? trackedCount : '—'}</span>
      <span class="cwp-v2-dash-pill">With DCC Route: ${staffWithDcc}</span>
    `;

    if (rows.length === 0) {
      tbodyEl.innerHTML = '<tr><td colspan="5" class="cwp-v2-dash-table-msg">No staff records found.</td></tr>';
      return;
    }

    rows.sort((a, b) => (b.dccAssigned + b.activeJobs + b.cleanedToday) - (a.dccAssigned + a.activeJobs + a.cleanedToday));

    tbodyEl.innerHTML = rows.slice(0, 10).map(r => `
      <tr>
        <td class="cwp-v2-dash-staff-cell">${escapeHtml(r.name)}</td>
        <td><span class="cwp-v2-badge ${r.statusClass === 'is-completed' ? 'cwp-v2-badge-success' : (r.statusClass === 'is-danger' ? 'cwp-v2-badge-danger' : 'cwp-v2-badge-neutral')}">${escapeHtml(r.statusLabel)}</span></td>
        <td>${r.dccAssigned}</td>
        <td>${r.cleanedToday}</td>
        <td>${r.activeJobs}</td>
      </tr>
    `).join('');
  }

  function renderBreakdowns() {
    const cleanChartEl = document.getElementById('v2DashCleanBreakdown');
    const jobsChartEl = document.getElementById('v2DashJobsBreakdown');

    if (cleanChartEl) {
      const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
      if (!cleanRes) {
        cleanChartEl.innerHTML = '<div class="cwp-v2-dash-empty-box">Daily cleaning data failed to load.</div>';
      } else {
        const sum = cleanRes.summary || {};
        const withPhoto = Number(sum.withPhotoCount || 0);
        const withoutPhoto = Number(sum.withoutPhotoCount || 0);
        const pending = Number(sum.totalPending || 0);
        const cnp = Number(sum.carNotPresentCount || 0);
        const total = withPhoto + withoutPhoto + pending + cnp;

        if (total === 0) {
          cleanChartEl.innerHTML = '<div class="cwp-v2-dash-empty-box">No daily cleaning records or scheduled stops for today yet.</div>';
        } else {
          const bars = [
            { label: 'Cleaned with Photo', count: withPhoto, cls: 'is-emerald' },
            { label: 'Cleaned without Photo', count: withoutPhoto, cls: 'is-sky' },
            { label: 'Pending Today', count: pending, cls: 'is-amber' },
            { label: 'Car Not Present', count: cnp, cls: 'is-rose' }
          ];
          cleanChartEl.innerHTML = `<div class="cwp-v2-dash-bar-list">${bars.map(b => {
            const pct = Math.round((b.count / total) * 100);
            return `
              <div class="cwp-v2-dash-bar-row">
                <div class="cwp-v2-dash-bar-meta">
                  <span>${escapeHtml(b.label)}</span>
                  <strong>${b.count} (${pct}%)</strong>
                </div>
                <div class="cwp-v2-dash-bar-track">
                  <div class="cwp-v2-dash-bar-fill ${b.cls}" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}</div>`;
        }
      }
    }

    if (jobsChartEl) {
      const jobs = getJobsArray();
      if (jobs === null) {
        jobsChartEl.innerHTML = '<div class="cwp-v2-dash-empty-box">Service jobs data failed to load.</div>';
      } else if (jobs.length === 0) {
        jobsChartEl.innerHTML = '<div class="cwp-v2-dash-empty-box">No service jobs recorded.</div>';
      } else {
        const counts = {
          car_washing: 0,
          solar_cleaning: 0,
          interior_detailing: 0,
          exterior_detailing: 0
        };
        jobs.forEach(j => {
          const cat = normalizeCategory(j);
          counts[cat] = (counts[cat] || 0) + 1;
        });
        const total = jobs.length;
        const bars = [
          { label: 'Car Washing', count: counts.car_washing, cls: 'is-sky' },
          { label: 'Solar Panel Cleaning', count: counts.solar_cleaning, cls: 'is-amber' },
          { label: 'Interior Detailing', count: counts.interior_detailing, cls: '' },
          { label: 'Exterior Detailing', count: counts.exterior_detailing, cls: 'is-emerald' }
        ];
        jobsChartEl.innerHTML = `<div class="cwp-v2-dash-bar-list">${bars.map(b => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return `
            <div class="cwp-v2-dash-bar-row">
              <div class="cwp-v2-dash-bar-meta">
                <span>${escapeHtml(b.label)}</span>
                <strong>${b.count} (${pct}%)</strong>
              </div>
              <div class="cwp-v2-dash-bar-track">
                <div class="cwp-v2-dash-bar-fill ${b.cls}" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        }).join('')}</div>`;
      }
    }
  }

  function renderRecentActivity() {
    const container = document.getElementById('v2DashActivityList');
    if (!container) return;

    const events = [];
    const cleanRes = state.sources.cleanReports.ok ? state.sources.cleanReports.data : null;
    const jobs = getJobsArray();

    if (cleanRes && Array.isArray(cleanRes.records)) {
      cleanRes.records.forEach(r => {
        const ts = r.completed_at_device || r.created_at;
        if (!ts) return;
        const cust = r.customer_name || 'Customer';
        const veh = r.registration_no ? ` (${r.registration_no})` : '';
        const staff = r.staff_name || 'Staff';
        const st = String(r.status || 'completed').toLowerCase();
        const verb = st === 'car_not_present' ? 'Car not present reported' : (st === 'completed' ? 'Daily clean completed' : `Daily clean ${st.replace(/_/g, ' ')}`);
        events.push({
          ts: new Date(ts).getTime() || 0,
          iso: ts,
          icon: st === 'completed' ? 'directions_car' : 'event_busy',
          title: `${verb} — ${cust}${veh}`,
          sub: `Handled by ${staff}`
        });
      });
    }

    if (jobs) {
      jobs.forEach(j => {
        const ts = j.completed_at || j.completedAt || j.started_at || j.startedAt || j.assigned_at || j.assignedAt || j.created_at || j.createdAt;
        if (!ts) return;
        const cust = j.customer_name || j.customerName || 'Customer';
        const cat = formatCategoryLabel(normalizeCategory(j));
        const st = normalizeJobStatus(j).replace(/_/g, ' ');
        const staff = j.staff_name || j.staffName || 'Unassigned';
        events.push({
          ts: new Date(ts).getTime() || 0,
          iso: ts,
          icon: normalizeCategory(j) === 'solar_cleaning' ? 'solar_power' : 'build',
          title: `${cat} (${st}) — ${cust}`,
          sub: staff !== 'Unassigned' ? `Assigned to ${staff}` : 'Awaiting staff assignment'
        });
      });
    }

    events.sort((a, b) => b.ts - a.ts);
    const topEvents = events.slice(0, 8);

    if (topEvents.length === 0) {
      const anyOk = state.sources.cleanReports.ok || state.sources.specialJobs.ok;
      container.innerHTML = `<div class="cwp-v2-dash-empty-box">${anyOk ? 'No recent service activity recorded yet.' : 'Activity sources unavailable.'}</div>`;
      return;
    }

    container.innerHTML = topEvents.map(ev => `
      <div class="cwp-v2-dash-activity-item">
        <div class="cwp-v2-dash-activity-left">
          <span class="material-symbols-outlined cwp-v2-dash-activity-icon" aria-hidden="true">${ev.icon}</span>
          <div>
            <div class="cwp-v2-dash-activity-title">${escapeHtml(ev.title)}</div>
            <div class="cwp-v2-dash-activity-sub">${escapeHtml(ev.sub)}</div>
          </div>
        </div>
        <span class="cwp-v2-dash-activity-time">${escapeHtml(formatTimeIst(ev.iso))}</span>
      </div>
    `).join('');
  }

  function renderAll() {
    renderHeader();
    renderKpis();
    renderOperationalOverview();
    renderExceptions();
    renderStaffOverview();
    renderBreakdowns();
    renderRecentActivity();
  }

  function bindQuickActions() {
    const viewEl = document.getElementById('v2View_dashboard');
    if (!viewEl) return;

    const refreshBtn = document.getElementById('v2DashRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => loadData({ manual: true }));
    }

    const retryBannerBtn = document.getElementById('v2DashPartialRetryBtn');
    if (retryBannerBtn) {
      retryBannerBtn.addEventListener('click', () => loadData({ manual: true }));
    }

    const staffLinkBtn = document.getElementById('v2DashViewStaffBtn');
    if (staffLinkBtn) {
      staffLinkBtn.addEventListener('click', () => navigateToModule('staff'));
    }

    const trackLinkBtn = document.getElementById('v2DashTrackStaffBtn');
    if (trackLinkBtn) {
      trackLinkBtn.addEventListener('click', () => navigateToModule('staffTracking'));
    }

    viewEl.querySelectorAll('[data-dash-quick-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-dash-quick-action');
        if (action === 'createBooking') {
          navigateToModule('serviceAssign', {
            afterNavigate: () => {
              if (window.CWP_ADMIN_V2.bookings && typeof window.CWP_ADMIN_V2.bookings.openCreateModal === 'function') {
                window.CWP_ADMIN_V2.bookings.openCreateModal();
              }
            }
          });
        } else if (action === 'addCustomer') {
          navigateToModule('records', {
            afterNavigate: () => {
              if (window.CWP_ADMIN_V2.customers && typeof window.CWP_ADMIN_V2.customers.openAddCustomerModal === 'function') {
                window.CWP_ADMIN_V2.customers.openAddCustomerModal();
              }
            }
          });
        } else if (action === 'assignJobs') {
          navigateToModule('jobAssignment');
        } else if (action === 'viewLeads') {
          navigateToModule('leads');
        } else if (action === 'addStaff') {
          navigateToModule('staff', {
            afterNavigate: () => {
              if (window.CWP_ADMIN_V2.staff && typeof window.CWP_ADMIN_V2.staff.openAddStaffModal === 'function') {
                window.CWP_ADMIN_V2.staff.openAddStaffModal();
              }
            }
          });
        } else if (action === 'trackStaff') {
          navigateToModule('staffTracking');
        }
      });
    });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindQuickActions();
    renderHeader();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      const tab = e && e.detail && e.detail.tab;
      state.isActiveTab = tab === 'dashboard';
      if (state.isActiveTab) {
        loadData({ manual: false });
      }
    });

    if (window.CWP_ADMIN_V2.shell && window.CWP_ADMIN_V2.shell.getActiveTab() === 'dashboard') {
      state.isActiveTab = true;
      loadData({ manual: false });
    }
  }

  window.CWP_ADMIN_V2.dashboard = {
    init,
    loadData,
    getState: () => state
  };
})(window);
