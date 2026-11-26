/**
 * =========================================================================
 * CWP ADMIN V2 — OTHER CLEANING STATUS (SERVICE OPERATIONS TRACKER)
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.specialJobs.
 * English-only Admin UI, Material Symbols only, zero mocks, zero emojis,
 * zero SSE indicators. Preserves all backend contracts & validation rules.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = {
    allJobs: [],
    periodJobs: [],
    filteredJobs: [],
    customers: [],
    customerMap: {},
    staffList: [],
    routes: [],
    customerHistoryCache: {},
    selectedJobId: null,
    period: 'today', // today | yesterday | 7days | month | all | custom
    kpiFilter: 'all', // all | unassigned | assigned | in_progress | completed | exceptions
    categoryFilter: 'all', // all | solar_cleaning | car_washing | interior_detailing | exterior_detailing
    searchQuery: '',
    filters: {
      status: 'all',
      staff: 'all',
      route: 'all',
      dateFrom: '',
      dateTo: '',
      assignState: 'all',
      photoFilter: 'all'
    },
    sort: {
      column: 'scheduledDate',
      direction: 'desc'
    },
    pagination: {
      currentPage: 1,
      pageSize: 25,
      totalRecords: 0
    },
    reassignModal: {
      jobId: null
    },
    statusModal: {
      jobId: null,
      mode: null // 'start' | 'complete' | 'cancel' | 'fail'
    },
    isLoading: false,
    isSubmitting: false,
    initialized: false,
    hasLoadedOnce: false
  };

  let searchDebounceTimer = null;

  function escapeHtml(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hasAuthToken() {
    const gate = document.getElementById('v2LoginGate');
    if (gate && !gate.hidden && gate.style.display !== 'none') return false;
    const token = (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getToken === 'function')
      ? window.CWP_ADMIN_V2.auth.getToken()
      : (sessionStorage.getItem('cwp_admin_token') || localStorage.getItem('cwp_admin_token') || '');
    return Boolean(token && token.trim());
  }

  function showToast(msg, type = 'info') {
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.show === 'function') {
      window.CWP_ADMIN_V2.toast.show(msg, type, 3200);
    }
  }

  function getIstDateKey(dateInput) {
    try {
      const d = dateInput ? new Date(dateInput) : new Date();
      if (isNaN(d.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      return y && m && day ? `${y}-${m}-${day}` : d.toISOString().slice(0, 10);
    } catch (e) {
      return '';
    }
  }

  function getJobEffectiveDateKey(j) {
    if (!j) return '';
    const sDate = j.scheduledDate || j.scheduled_date;
    if (sDate) {
      if (typeof sDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sDate.trim())) {
        return sDate.trim();
      }
      const key = getIstDateKey(sDate);
      if (key) return key;
    }
    const fallback = j.assignedAt || j.assigned_at || j.createdAt || j.created_at;
    return fallback ? getIstDateKey(fallback) : '';
  }

  function computePeriodBounds(period) {
    const now = new Date();
    const todayKey = getIstDateKey(now);
    if (period === 'today') return { start: todayKey, end: todayKey };
    if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yKey = getIstDateKey(y);
      return { start: yKey, end: yKey };
    }
    if (period === '7days') {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      return { start: getIstDateKey(d7), end: todayKey };
    }
    if (period === 'month') {
      const dM = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: getIstDateKey(dM), end: todayKey };
    }
    if (period === 'custom') {
      return { start: state.filters.dateFrom || '', end: state.filters.dateTo || '' };
    }
    return { start: '', end: '' };
  }

  function hasAssignedStaff(j) {
    const sName = String(j.staffName || '').trim().toLowerCase();
    return Boolean((j.staffId || j.assignedStaffId) && sName !== 'unassigned');
  }

  function normalizeStatus(j) {
    const s = String(j.status || '').toLowerCase().trim();
    if (s === 'in_progress') return 'in_progress';
    if (s === 'completed') return 'completed';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'unable_to_complete') return 'unable_to_complete';
    if (s === 'requested' || s === 'booked' || s === 'pending') return s;
    if (s === 'assigned') return hasAssignedStaff(j) ? 'assigned' : 'booked';
    return hasAssignedStaff(j) ? 'assigned' : 'booked';
  }

  function isUnassignedJob(j) {
    const st = normalizeStatus(j);
    if (st === 'completed' || st === 'cancelled' || st === 'unable_to_complete' || st === 'in_progress') return false;
    return !hasAssignedStaff(j);
  }

  function isExceptionJob(j) {
    const st = normalizeStatus(j);
    return st === 'unable_to_complete' || st === 'cancelled';
  }

  function isTerminalJob(j) {
    const st = normalizeStatus(j);
    return st === 'completed' || st === 'cancelled' || st === 'unable_to_complete';
  }

  function getStatusMeta(j) {
    const st = normalizeStatus(j);
    switch (st) {
      case 'requested':
        return { label: 'Requested', cls: 'is-neutral', icon: 'schedule' };
      case 'booked':
      case 'pending':
        return { label: 'Booked', cls: 'is-neutral', icon: 'event_available' };
      case 'assigned':
        return { label: 'Assigned', cls: 'is-assigned', icon: 'person_check' };
      case 'in_progress':
        return { label: 'In Progress', cls: 'is-in-progress', icon: 'autorenew' };
      case 'completed':
        return { label: 'Completed', cls: 'is-completed', icon: 'check_circle' };
      case 'unable_to_complete':
        return { label: 'Unable to Complete', cls: 'is-attention', icon: 'warning' };
      case 'cancelled':
        return { label: 'Cancelled', cls: 'is-exception', icon: 'cancel' };
      default:
        return { label: 'Booked', cls: 'is-neutral', icon: 'event_available' };
    }
  }

  function getCategoryMeta(catId) {
    const norm = String(catId || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (norm === 'solar_cleaning' || norm === 'solar_panel_cleaning') {
      return { id: 'solar_cleaning', label: 'Solar Panel Cleaning', cls: 'cat-solar', icon: 'solar_power' };
    }
    if (norm === 'car_washing' || norm === 'car_wash') {
      return { id: 'car_washing', label: 'Car Wash', cls: 'cat-wash', icon: 'local_car_wash' };
    }
    if (norm === 'interior_detailing') {
      return { id: 'interior_detailing', label: 'Interior Detailing', cls: 'cat-interior', icon: 'auto_awesome' };
    }
    if (norm === 'exterior_detailing') {
      return { id: 'exterior_detailing', label: 'Exterior Detailing', cls: 'cat-exterior', icon: 'shield' };
    }
    if (norm === 'daily_car_cleaning') {
      return { id: 'daily_car_cleaning', label: 'Daily Car Cleaning', cls: 'cat-daily', icon: 'directions_car' };
    }
    return { id: norm || 'other', label: catId || 'Service', cls: 'cat-daily', icon: 'build' };
  }

  function isStaffActive(s) {
    return s && s.active !== false && s.isActive !== false && s.is_active !== false && s.active !== 'No' && s.active !== 'Inactive';
  }

  function getStaffCapabilities(s) {
    if (!s) return [];
    if (Array.isArray(s.serviceCapabilities)) return s.serviceCapabilities.map(c => String(c).toLowerCase());
    if (Array.isArray(s.service_capabilities)) return s.service_capabilities.map(c => String(c).toLowerCase());
    const wt = String(s.workType || s.work_type || '').toLowerCase();
    if (wt === 'dcc_only') return ['daily_car_cleaning'];
    return ['daily_car_cleaning', 'car_washing', 'interior_detailing', 'exterior_detailing', 'solar_cleaning'];
  }

  function staffHasCapability(s, categoryId) {
    const norm = getCategoryMeta(categoryId).id;
    const caps = getStaffCapabilities(s);
    if (caps.length === 0) return true;
    return caps.includes(norm);
  }

  function formatDateDisplay(val) {
    if (!val) return '—';
    const key = getIstDateKey(val);
    if (!key) return String(val);
    const todayKey = getIstDateKey(new Date());
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    if (key === todayKey) return 'Today';
    if (key === getIstDateKey(yest)) return 'Yesterday';
    if (key === getIstDateKey(tom)) return 'Tomorrow';
    const [y, m, d] = key.split('-');
    return `${d}/${m}/${y}`;
  }

  function formatDateTimeDisplay(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION & LIVE DATA LOADING
  // -------------------------------------------------------------------------
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindToolbarEvents();
    bindTableEvents();
    bindDetailEvents();
    bindAssignModalEvents();
    bindReassignModalEvents();
    bindStatusModalEvents();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'specialJobs') {
        loadData();
      }
    });

    const viewEl = document.getElementById('v2View_specialJobs');
    if (viewEl && viewEl.classList.contains('is-active')) {
      loadData();
    }
  }

  async function loadData() {
    if (!hasAuthToken() || state.isLoading) return;
    const api = window.CWP_ADMIN_V2.api;
    if (!api) return;

    state.isLoading = true;
    const tbody = document.getElementById('v2SjTableBody');
    if (tbody && !state.hasLoadedOnce) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:28px; color:#64748b;">Loading service operations...</td></tr>';
    }

    try {
      const [jobsRes, custRes, staffRes, routesRes] = await Promise.allSettled([
        api.request('getSpecialJobs', {}),
        api.request('getAllCustomers', {}),
        api.request('getStaffList', {}),
        api.request('getAllRoutes', {})
      ]);

      if (custRes.status === 'fulfilled' && Array.isArray(custRes.value)) {
        state.customers = custRes.value;
        state.customerMap = {};
        state.customers.forEach(c => {
          if (c.id) state.customerMap[c.id] = c;
          if (c.customerId) state.customerMap[c.customerId] = c;
          if (c.customerCode) state.customerMap[c.customerCode] = c;
        });
      }

      if (staffRes.status === 'fulfilled' && Array.isArray(staffRes.value)) {
        state.staffList = staffRes.value;
      }

      if (routesRes.status === 'fulfilled') {
        const rVal = routesRes.value;
        state.routes = Array.isArray(rVal) ? rVal : (Array.isArray(rVal && rVal.routes) ? rVal.routes : []);
      }

      if (jobsRes.status === 'fulfilled' && jobsRes.value) {
        const rawJobs = Array.isArray(jobsRes.value.jobs)
          ? jobsRes.value.jobs
          : (Array.isArray(jobsRes.value) ? jobsRes.value : []);
        state.allJobs = rawJobs.map(enrichJob);
        state.hasLoadedOnce = true;
      }

      populateFilterDropdowns();
      applyFiltersAndRender();
      if (state.selectedJobId) {
        renderDetailPanel();
      }
    } catch (err) {
      showToast(err.message || 'Failed to load service jobs.', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  function enrichJob(j) {
    const cust = state.customerMap[j.customerId] || state.customerMap[j.customerCode] || null;
    const routeName = j.routeName || (cust && (cust.routeName || cust.route || cust.zone)) || '';
    const areaText = j.area || (cust && (cust.area || cust.sector)) || '';
    return Object.assign({}, j, {
      id: j.id || j.jobId,
      jobId: j.jobId || j.id,
      routeName,
      areaText
    });
  }

  function populateFilterDropdowns() {
    const staffSel = document.getElementById('v2SjFilterStaff');
    if (staffSel) {
      const prev = staffSel.value || 'all';
      let opts = '<option value="all">Staff: All</option><option value="unassigned">Unassigned Only</option>';
      state.staffList.forEach(s => {
        const id = s.staffCode || s.id || s.name;
        const suffix = isStaffActive(s) ? '' : ' (Inactive)';
        opts += `<option value="${escapeHtml(id)}">${escapeHtml(s.name || id)}${suffix}</option>`;
      });
      staffSel.innerHTML = opts;
      staffSel.value = prev;
    }

    const routeSel = document.getElementById('v2SjFilterRoute');
    if (routeSel) {
      const prev = routeSel.value || 'all';
      const seen = new Set();
      let opts = '<option value="all">Area / Route: All</option>';
      state.routes.forEach(r => {
        const rName = r.routeName || r.name || r.routeCode || '';
        if (rName && !seen.has(rName)) {
          seen.add(rName);
          opts += `<option value="${escapeHtml(rName)}">${escapeHtml(rName)}</option>`;
        }
      });
      state.allJobs.forEach(j => {
        if (j.routeName && !seen.has(j.routeName)) {
          seen.add(j.routeName);
          opts += `<option value="${escapeHtml(j.routeName)}">${escapeHtml(j.routeName)}</option>`;
        }
      });
      routeSel.innerHTML = opts;
      routeSel.value = prev;
    }
  }

  // -------------------------------------------------------------------------
  // FILTERING, KPI & CATEGORY COUNTS, SORTING & PAGINATION
  // -------------------------------------------------------------------------
  function computePeriodJobs() {
    const bounds = computePeriodBounds(state.period);
    if (!bounds.start && !bounds.end) return state.allJobs.slice();
    return state.allJobs.filter(j => {
      const key = getJobEffectiveDateKey(j);
      if (!key) return false;
      if (bounds.start && key < bounds.start) return false;
      if (bounds.end && key > bounds.end) return false;
      return true;
    });
  }

  function updateKpisAndCategoryCounts() {
    const jobs = state.periodJobs;
    const total = jobs.length;
    const unassigned = jobs.filter(isUnassignedJob).length;
    const assigned = jobs.filter(j => normalizeStatus(j) === 'assigned' && hasAssignedStaff(j)).length;
    const inProgress = jobs.filter(j => normalizeStatus(j) === 'in_progress').length;
    const completed = jobs.filter(j => normalizeStatus(j) === 'completed').length;
    const exceptions = jobs.filter(isExceptionJob).length;

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v);
    };

    setVal('v2SjKpiTotal', total);
    setVal('v2SjKpiUnassigned', unassigned);
    setVal('v2SjKpiAssigned', assigned);
    setVal('v2SjKpiInProgress', inProgress);
    setVal('v2SjKpiCompleted', completed);
    setVal('v2SjKpiExceptions', exceptions);

    setVal('v2SjCatAll', total);
    setVal('v2SjCatSolar', jobs.filter(j => getCategoryMeta(j.serviceCategoryId).id === 'solar_cleaning').length);
    setVal('v2SjCatCarWash', jobs.filter(j => getCategoryMeta(j.serviceCategoryId).id === 'car_washing').length);
    setVal('v2SjCatInterior', jobs.filter(j => getCategoryMeta(j.serviceCategoryId).id === 'interior_detailing').length);
    setVal('v2SjCatExterior', jobs.filter(j => getCategoryMeta(j.serviceCategoryId).id === 'exterior_detailing').length);

    const headerCount = document.getElementById('v2SjHeaderCount');
    if (headerCount) {
      headerCount.textContent = `${state.filteredJobs.length} / ${total} jobs`;
    }

    const navBadge = document.getElementById('v2BadgeSpecialJobs');
    if (navBadge) {
      navBadge.textContent = String(state.allJobs.length);
    }
  }

  function applyFiltersAndRender() {
    state.periodJobs = computePeriodJobs();
    const q = state.searchQuery.trim().toLowerCase();

    const filtered = state.periodJobs.filter(j => {
      const st = normalizeStatus(j);

      if (state.kpiFilter === 'unassigned' && !isUnassignedJob(j)) return false;
      if (state.kpiFilter === 'assigned' && !(st === 'assigned' && hasAssignedStaff(j))) return false;
      if (state.kpiFilter === 'in_progress' && st !== 'in_progress') return false;
      if (state.kpiFilter === 'completed' && st !== 'completed') return false;
      if (state.kpiFilter === 'exceptions' && !isExceptionJob(j)) return false;

      if (state.categoryFilter !== 'all' && getCategoryMeta(j.serviceCategoryId).id !== state.categoryFilter) {
        return false;
      }

      if (state.filters.status !== 'all') {
        if (state.filters.status === 'unassigned') {
          if (!isUnassignedJob(j)) return false;
        } else if (st !== state.filters.status) {
          return false;
        }
      }

      if (state.filters.staff !== 'all') {
        if (state.filters.staff === 'unassigned') {
          if (hasAssignedStaff(j)) return false;
        } else {
          const target = state.filters.staff.toLowerCase();
          const sId = String(j.staffId || '').toLowerCase();
          const sName = String(j.staffName || '').toLowerCase();
          if (sId !== target && sName !== target) return false;
        }
      }

      if (state.filters.route !== 'all' && j.routeName !== state.filters.route) return false;

      if (state.filters.assignState === 'assigned_only' && !hasAssignedStaff(j)) return false;
      if (state.filters.assignState === 'unassigned_only' && hasAssignedStaff(j)) return false;

      if (state.filters.photoFilter !== 'all') {
        const photoCount = (Array.isArray(j.beforePhotos) ? j.beforePhotos.length : 0)
          + (Array.isArray(j.afterPhotos) ? j.afterPhotos.length : 0);
        if (state.filters.photoFilter === 'with_photos' && photoCount === 0) return false;
        if (state.filters.photoFilter === 'no_photos' && photoCount > 0) return false;
      }

      if (q) {
        const hay = [
          j.id, j.jobId, j.customerName, j.customerPhone, j.customerCode,
          j.vehicle, j.registrationNo, j.brandOrModel, j.serviceType,
          j.serviceCategory, j.packageDetails, j.staffName, j.staffId,
          j.address, j.areaText, j.routeName, j.specialInstructions, j.completionNotes
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      const dir = state.sort.direction === 'asc' ? 1 : -1;
      const col = state.sort.column;
      let va = '';
      let vb = '';
      if (col === 'id') {
        va = String(a.id || '');
        vb = String(b.id || '');
      } else if (col === 'customer') {
        va = String(a.customerName || '').toLowerCase();
        vb = String(b.customerName || '').toLowerCase();
      } else if (col === 'service') {
        va = `${getCategoryMeta(a.serviceCategoryId).label} ${a.serviceType || ''}`.toLowerCase();
        vb = `${getCategoryMeta(b.serviceCategoryId).label} ${b.serviceType || ''}`.toLowerCase();
      } else if (col === 'staff') {
        va = String(a.staffName || 'zzz').toLowerCase();
        vb = String(b.staffName || 'zzz').toLowerCase();
      } else if (col === 'status') {
        va = normalizeStatus(a);
        vb = normalizeStatus(b);
      } else {
        va = getJobEffectiveDateKey(a) || String(a.createdAt || '');
        vb = getJobEffectiveDateKey(b) || String(b.createdAt || '');
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.filteredJobs = filtered;
    state.pagination.totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pagination.pageSize));
    if (state.pagination.currentPage > totalPages) state.pagination.currentPage = totalPages;
    if (state.pagination.currentPage < 1) state.pagination.currentPage = 1;

    updateKpisAndCategoryCounts();
    renderTable();
    renderPagination();
  }

  function renderAssetCell(j) {
    const cat = getCategoryMeta(j.serviceCategoryId).id;
    if (cat === 'solar_cleaning') {
      const panels = j.panelCount ? `${escapeHtml(String(j.panelCount))} Panels` : 'Solar Array';
      let roof = '';
      if (j.siteDetails && typeof j.siteDetails === 'object' && j.siteDetails.roofScope) {
        roof = j.siteDetails.roofScope;
      } else if (j.packageDetails) {
        roof = j.packageDetails;
      }
      return `<div class="cwp-v2-sj-cell-primary"><span class="cwp-v2-sj-asset-pill">${panels}</span></div>`
        + (roof ? `<div class="cwp-v2-sj-cell-sub" title="${escapeHtml(roof)}">${escapeHtml(roof)}</div>` : '');
    }

    const vehText = j.vehicle || (j.registrationNo ? `${j.registrationNo}${j.brandOrModel ? ` (${j.brandOrModel})` : ''}` : '');
    const seaterLabel = j.seaterType === '5_plus_seater' ? '5+ Seater' : (j.seaterType === '5_seater' ? '5 Seater' : '');
    return `<div class="cwp-v2-sj-cell-primary" title="${escapeHtml(vehText || 'Vehicle')}">${escapeHtml(vehText || 'Vehicle')}</div>`
      + (seaterLabel ? `<div class="cwp-v2-sj-cell-sub">${escapeHtml(seaterLabel)}</div>` : '');
  }

  function renderTimingSubtext(j) {
    const st = normalizeStatus(j);
    const slot = j.scheduledTime || j.tentativeTime || '';
    const seq = (j.sequenceOrder != null && j.sequenceOrder !== '') ? `Stop #${j.sequenceOrder}` : '';
    let timing = '';
    if (st === 'completed' && j.durationMinutes) {
      timing = `Done in ${j.durationMinutes}m`;
    } else if (st === 'in_progress' && j.elapsedMinutes) {
      timing = `Active ${j.elapsedMinutes}m`;
    } else if (st === 'assigned' && j.assignedAt) {
      const waitMin = Math.max(0, Math.round((Date.now() - new Date(j.assignedAt).getTime()) / 60000));
      if (!isNaN(waitMin)) timing = `Waiting ${waitMin}m`;
    }
    return [slot, seq, timing].filter(Boolean).join(' • ') || 'Standard slot';
  }

  function renderTable() {
    const tbody = document.getElementById('v2SjTableBody');
    if (!tbody) return;

    const total = state.filteredJobs.length;
    if (total === 0) {
      const showAllTimeHint = state.period === 'today' && state.allJobs.length > 0;
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:36px 16px; color:#64748b;">
        <div style="font-weight:600; color:#334155; margin-bottom:4px;">No service jobs match your current filters</div>
        <div style="font-size:12px; margin-bottom:10px;">Try adjusting the date period, category, or search query.</div>
        ${showAllTimeHint ? '<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" id="v2SjEmptyAllTimeBtn">Show All Time Jobs</button>' : ''}
      </td></tr>`;
      return;
    }

    const startIdx = (state.pagination.currentPage - 1) * state.pagination.pageSize;
    const pageRows = state.filteredJobs.slice(startIdx, startIdx + state.pagination.pageSize);

    let html = '';
    pageRows.forEach(j => {
      const id = String(j.id);
      const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
      const isSelected = state.selectedJobId === id;
      const cat = getCategoryMeta(j.serviceCategoryId);
      const stMeta = getStatusMeta(j);
      const st = normalizeStatus(j);
      const assigned = hasAssignedStaff(j);

      const bCount = Array.isArray(j.beforePhotos) ? j.beforePhotos.length : 0;
      const aCount = Array.isArray(j.afterPhotos) ? j.afterPhotos.length : 0;
      let photoHtml = '';
      if (bCount > 0) {
        photoHtml += `<button type="button" class="cwp-v2-sj-photo-chip" data-sj-photo-job="${escapeHtml(id)}" data-sj-photo-kind="before" title="View before photo">Before (${bCount})</button>`;
      }
      if (aCount > 0) {
        photoHtml += `<button type="button" class="cwp-v2-sj-photo-chip" data-sj-photo-job="${escapeHtml(id)}" data-sj-photo-kind="after" title="View after photo">After (${aCount})</button>`;
      }

      let primaryActionHtml = '';
      if (!isTerminalJob(j)) {
        if (!assigned) {
          primaryActionHtml = `<button type="button" class="cwp-v2-sj-act-btn is-primary" data-sj-action="reassign" data-sj-id="${escapeHtml(id)}">Assign</button>`;
        } else if (st === 'in_progress') {
          primaryActionHtml = `<button type="button" class="cwp-v2-sj-act-btn is-primary" data-sj-action="complete" data-sj-id="${escapeHtml(id)}">Complete</button>`;
        } else {
          primaryActionHtml = `<button type="button" class="cwp-v2-sj-act-btn" data-sj-action="reassign" data-sj-id="${escapeHtml(id)}">Reassign</button>`;
        }
      } else {
        primaryActionHtml = `<button type="button" class="cwp-v2-sj-act-btn" data-sj-action="view" data-sj-id="${escapeHtml(id)}">Details</button>`;
      }

      html += `<tr data-sj-row="${escapeHtml(id)}" class="${isSelected ? 'is-selected-row' : ''}">
        <td>
          <div class="cwp-v2-sj-cell-primary" style="font-family:monospace; font-size:11.5px;" title="${escapeHtml(id)}">${escapeHtml(shortId)}</div>
          ${j.customerCode ? `<div class="cwp-v2-sj-cell-sub">${escapeHtml(j.customerCode)}</div>` : ''}
        </td>
        <td>
          <div class="cwp-v2-sj-cell-primary" title="${escapeHtml(j.customerName || 'Customer')}">${escapeHtml(j.customerName || 'Customer')}</div>
          <div class="cwp-v2-sj-cell-sub">${escapeHtml(j.customerPhone || '—')}</div>
        </td>
        <td>
          <span class="cwp-v2-sj-cat-pill ${cat.cls}">
            <span class="material-symbols-outlined" style="font-size:13px;" aria-hidden="true">${cat.icon}</span>
            <span>${escapeHtml(cat.label)}</span>
          </span>
          <div class="cwp-v2-sj-cell-sub" style="margin-top:2px;" title="${escapeHtml(j.serviceType || '')}">${escapeHtml(j.serviceType || cat.label)}</div>
        </td>
        <td>${renderAssetCell(j)}</td>
        <td>
          <div class="cwp-v2-sj-cell-primary">${escapeHtml(formatDateDisplay(getJobEffectiveDateKey(j)))}</div>
          <div class="cwp-v2-sj-cell-sub" title="${escapeHtml(renderTimingSubtext(j))}">${escapeHtml(renderTimingSubtext(j))}</div>
        </td>
        <td>
          <div class="cwp-v2-sj-cell-primary" title="${escapeHtml(j.address || '')}">${escapeHtml(j.address || '—')}</div>
          <div class="cwp-v2-sj-cell-sub">${escapeHtml(j.routeName || j.areaText || '—')}</div>
        </td>
        <td>
          ${assigned
            ? `<div class="cwp-v2-sj-cell-primary">${escapeHtml(j.staffName)}</div><div class="cwp-v2-sj-cell-sub">${escapeHtml(j.staffId || '')}</div>`
            : '<span class="cwp-v2-sj-status-pill is-attention">Unassigned</span>'}
        </td>
        <td>
          <span class="cwp-v2-sj-status-pill ${stMeta.cls}">
            <span class="material-symbols-outlined" style="font-size:13px;" aria-hidden="true">${stMeta.icon}</span>
            <span>${escapeHtml(stMeta.label)}</span>
          </span>
        </td>
        <td style="text-align:right;">
          <div class="cwp-v2-sj-row-actions">
            ${photoHtml ? `<div class="cwp-v2-sj-photo-cluster">${photoHtml}</div>` : ''}
            ${primaryActionHtml}
          </div>
        </td>
      </tr>`;
    });

    tbody.innerHTML = html;
  }

  function renderPagination() {
    const total = state.pagination.totalRecords;
    const pageSize = state.pagination.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = state.pagination.currentPage;

    const info = document.getElementById('v2SjPageInfo');
    if (info) {
      if (total === 0) {
        info.textContent = 'Showing 0–0 of 0 jobs';
      } else {
        const start = (current - 1) * pageSize + 1;
        const end = Math.min(total, current * pageSize);
        info.textContent = `Showing ${start}–${end} of ${total} jobs`;
      }
    }

    const prevBtn = document.getElementById('v2SjPagePrev');
    const nextBtn = document.getElementById('v2SjPageNext');
    if (prevBtn) prevBtn.disabled = current <= 1;
    if (nextBtn) nextBtn.disabled = current >= totalPages;

    const numWrap = document.getElementById('v2SjPageNumbers');
    if (numWrap) {
      let numsHtml = '';
      const maxBtns = 5;
      let startPage = Math.max(1, current - 2);
      const endPage = Math.min(totalPages, startPage + maxBtns - 1);
      if (endPage - startPage + 1 < maxBtns) {
        startPage = Math.max(1, endPage - maxBtns + 1);
      }
      for (let p = startPage; p <= endPage; p++) {
        numsHtml += `<button type="button" class="cwp-v2-sj-page-btn ${p === current ? 'is-active' : ''}" data-sj-page="${p}">${p}</button>`;
      }
      numWrap.innerHTML = numsHtml;
    }
  }

  // -------------------------------------------------------------------------
  // DISMISSIBLE DETAIL PANEL
  // -------------------------------------------------------------------------
  function openDetail(jobId) {
    state.selectedJobId = jobId;
    const split = document.getElementById('v2SjSplitView');
    if (split) split.classList.remove('is-detail-closed');
    renderTable();
    renderDetailPanel();
    const job = state.allJobs.find(x => String(x.id) === String(jobId));
    if (job && job.customerId) {
      loadCustomerHistory(job.customerId);
    }
  }

  function closeDetail() {
    state.selectedJobId = null;
    const split = document.getElementById('v2SjSplitView');
    if (split) split.classList.add('is-detail-closed');
    renderTable();
  }

  async function loadCustomerHistory(customerId) {
    if (!customerId || state.customerHistoryCache[customerId]) return;
    const api = window.CWP_ADMIN_V2.api;
    if (!api) return;
    try {
      const res = await api.request('getCustomerServiceJobs', { customerId });
      const list = Array.isArray(res && res.jobs) ? res.jobs : (Array.isArray(res && res.bookings) ? res.bookings : []);
      state.customerHistoryCache[customerId] = list;
      if (state.selectedJobId) {
        const current = state.allJobs.find(x => String(x.id) === String(state.selectedJobId));
        if (current && current.customerId === customerId) {
          renderDetailPanel();
        }
      }
    } catch (e) {
      state.customerHistoryCache[customerId] = [];
    }
  }

  function renderDetailPanel() {
    const header = document.getElementById('v2SjDetailHeader');
    const scroll = document.getElementById('v2SjDetailScroll');
    const actions = document.getElementById('v2SjDetailActions');
    if (!header || !scroll || !actions) return;

    const j = state.allJobs.find(x => String(x.id) === String(state.selectedJobId));
    if (!j) {
      closeDetail();
      return;
    }

    const st = normalizeStatus(j);
    const stMeta = getStatusMeta(j);
    const cat = getCategoryMeta(j.serviceCategoryId);
    const assigned = hasAssignedStaff(j);
    const terminal = isTerminalJob(j);

    header.innerHTML = `
      <div style="min-width:0;">
        <div style="font-size:14px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(j.customerName || 'Customer')}</div>
        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Job ${escapeHtml(j.id)} • ${escapeHtml(cat.label)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="cwp-v2-sj-status-pill ${stMeta.cls}">${escapeHtml(stMeta.label)}</span>
        <button type="button" id="v2SjDetailCloseBtn" class="cwp-v2-modal-close-btn" aria-label="Close detail panel">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    `;

    const cleanPhone = String(j.customerPhone || '').replace(/\D/g, '').slice(-10);
    const waUrl = cleanPhone.length === 10 ? `https://wa.me/91${cleanPhone}` : '';
    const mapsUrl = j.googleMapsUrl || (j.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}` : '');

    const bPhotos = Array.isArray(j.beforePhotos) ? j.beforePhotos : [];
    const aPhotos = Array.isArray(j.afterPhotos) ? j.afterPhotos : [];
    const historyList = (j.customerId && state.customerHistoryCache[j.customerId]) ? state.customerHistoryCache[j.customerId] : null;

    let assetRows = '';
    if (cat.id === 'solar_cleaning') {
      assetRows = `
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Panel Count</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.panelCount ? `${j.panelCount} Panels` : '—')}</span></div>
        ${j.packageDetails ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Package / Scope</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.packageDetails)}</span></div>` : ''}
      `;
    } else {
      const veh = j.vehicle || j.registrationNo || '—';
      const seater = j.seaterType === '5_plus_seater' ? '5+ Seater' : (j.seaterType === '5_seater' ? '5 Seater' : '—');
      assetRows = `
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Vehicle</span><span class="cwp-v2-sj-detail-v">${escapeHtml(veh)}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Seater Type</span><span class="cwp-v2-sj-detail-v">${escapeHtml(seater)}</span></div>
        ${j.packageDetails ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Package</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.packageDetails)}</span></div>` : ''}
      `;
    }

    scroll.innerHTML = `
      <div class="cwp-v2-sj-detail-section">
        <div class="cwp-v2-sj-detail-section-title">Customer &amp; Location</div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Phone</span><span class="cwp-v2-sj-detail-v">${j.customerPhone ? `<a href="tel:${escapeHtml(j.customerPhone)}">${escapeHtml(j.customerPhone)}</a>` : '—'}${waUrl ? ` • <a href="${waUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Address</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.address || '—')}</span></div>
        ${j.routeName ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Route / Area</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.routeName)}</span></div>` : ''}
        ${mapsUrl ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Navigation</span><span class="cwp-v2-sj-detail-v"><a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open Google Maps</a></span></div>` : ''}
      </div>

      <div class="cwp-v2-sj-detail-section">
        <div class="cwp-v2-sj-detail-section-title">Service &amp; Asset</div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Category</span><span class="cwp-v2-sj-detail-v">${escapeHtml(cat.label)}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Service Type</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.serviceType || cat.label)}</span></div>
        ${assetRows}
      </div>

      <div class="cwp-v2-sj-detail-section">
        <div class="cwp-v2-sj-detail-section-title">Schedule &amp; Operational Timeline</div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Scheduled</span><span class="cwp-v2-sj-detail-v">${escapeHtml(formatDateDisplay(getJobEffectiveDateKey(j)))}${j.scheduledTime ? ` • ${escapeHtml(j.scheduledTime)}` : ''}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Assigned Staff</span><span class="cwp-v2-sj-detail-v">${assigned ? `${escapeHtml(j.staffName)} (${escapeHtml(j.staffId || '')})` : 'Unassigned'}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Assigned At</span><span class="cwp-v2-sj-detail-v">${escapeHtml(formatDateTimeDisplay(j.assignedAt || j.createdAt))}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Started At</span><span class="cwp-v2-sj-detail-v">${escapeHtml(formatDateTimeDisplay(j.startedAt))}</span></div>
        <div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Completed At</span><span class="cwp-v2-sj-detail-v">${escapeHtml(formatDateTimeDisplay(j.completedAt))}</span></div>
        ${j.durationMinutes ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Duration</span><span class="cwp-v2-sj-detail-v">${escapeHtml(String(j.durationMinutes))} mins</span></div>` : ''}
      </div>

      <div class="cwp-v2-sj-detail-section">
        <div class="cwp-v2-sj-detail-section-title">Photo Proof (${bPhotos.length} Before • ${aPhotos.length} After)</div>
        ${(bPhotos.length + aPhotos.length > 0) ? `
          <div class="cwp-v2-sj-photo-grid">
            ${bPhotos.map((u, i) => `<button type="button" class="cwp-v2-sj-photo-thumb" data-sj-lightbox-url="${escapeHtml(u)}" data-sj-lightbox-label="Before Photo ${i + 1}"><img src="${escapeHtml(u)}" alt="Before photo"><span class="cwp-v2-sj-photo-tag">Before</span></button>`).join('')}
            ${aPhotos.map((u, i) => `<button type="button" class="cwp-v2-sj-photo-thumb" data-sj-lightbox-url="${escapeHtml(u)}" data-sj-lightbox-label="After Photo ${i + 1}"><img src="${escapeHtml(u)}" alt="After photo"><span class="cwp-v2-sj-photo-tag">After</span></button>`).join('')}
          </div>
        ` : '<div style="font-size:12px; color:#64748b;">No before or after photos uploaded yet.</div>'}
      </div>

      ${(j.specialInstructions || j.completionNotes || j.cancellationReason || j.cancellation_reason || j.failureReason || j.failure_reason) ? `
        <div class="cwp-v2-sj-detail-section">
          <div class="cwp-v2-sj-detail-section-title">Notes &amp; Exception Details</div>
          ${j.specialInstructions ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Instructions</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.specialInstructions)}</span></div>` : ''}
          ${j.completionNotes ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Completion</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.completionNotes)}</span></div>` : ''}
          ${(j.cancellationReason || j.cancellation_reason) ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Cancel Reason</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.cancellationReason || j.cancellation_reason)}</span></div>` : ''}
          ${(j.failureReason || j.failure_reason) ? `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">Failure Reason</span><span class="cwp-v2-sj-detail-v">${escapeHtml(j.failureReason || j.failure_reason)}</span></div>` : ''}
        </div>
      ` : ''}

      <div class="cwp-v2-sj-detail-section">
        <div class="cwp-v2-sj-detail-section-title">Customer Service History</div>
        ${historyList === null
          ? '<div style="font-size:12px; color:#64748b;">Loading history...</div>'
          : (historyList.length === 0
            ? '<div style="font-size:12px; color:#64748b;">No additional jobs recorded.</div>'
            : historyList.slice(0, 4).map(h => {
                const hCat = getCategoryMeta(h.serviceCategoryId || h.service_category_id);
                const hDate = formatDateDisplay(h.scheduledDate || h.scheduled_date || h.createdAt || h.created_at);
                const hSt = h.status || 'booked';
                return `<div class="cwp-v2-sj-detail-kv"><span class="cwp-v2-sj-detail-k">${escapeHtml(hCat.label)} (${escapeHtml(hDate)})</span><span class="cwp-v2-sj-detail-v">${escapeHtml(hSt)}</span></div>`;
              }).join(''))}
      </div>
    `;

    // Action buttons strictly adhering to backend PERMITTED_TRANSITIONS
    let actHtml = '';
    if (!terminal) {
      actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-sj-detail-act="reassign">${assigned ? 'Reassign Staff' : 'Assign Staff'}</button>`;
      if (st === 'requested' || st === 'booked' || st === 'pending' || st === 'assigned') {
        actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-sj-detail-act="start">Start Job</button>`;
        actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-sj-detail-act="cancel" style="color:#b91c1c;">Cancel</button>`;
      }
      if (st === 'in_progress') {
        actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-sj-detail-act="complete">Complete Job</button>`;
      }
      if (st === 'assigned' || st === 'in_progress') {
        actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-sj-detail-act="fail" style="color:#92400e;">Unable to Complete</button>`;
      }
      if (st !== 'in_progress') {
        actHtml += `<button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" data-sj-detail-act="delete" style="color:#b91c1c;">Delete</button>`;
      }
    } else {
      actHtml = `<span style="font-size:12px; color:#64748b;">Terminal state (${escapeHtml(stMeta.label)}) — read-only record</span>`;
    }
    actions.innerHTML = actHtml;
  }

  // -------------------------------------------------------------------------
  // PHOTO LIGHTBOX
  // -------------------------------------------------------------------------
  function openPhotoLightbox(url, label) {
    const modal = document.getElementById('v2ModalSjPhotoLightbox');
    const img = document.getElementById('v2SjPhotoImg');
    const sub = document.getElementById('v2SjPhotoSub');
    if (!modal || !img) return;
    img.src = url;
    if (sub) sub.textContent = label || '';
    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.open === 'function') {
      window.CWP_ADMIN_V2.overlay.open('v2ModalSjPhotoLightbox');
    } else {
      modal.style.display = 'flex';
    }
  }

  // -------------------------------------------------------------------------
  // ASSIGN NEW SPECIAL JOB MODAL
  // -------------------------------------------------------------------------
  function openAssignModal() {
    const modal = document.getElementById('v2ModalSjAssign');
    if (!modal) return;
    const form = document.getElementById('v2SjAssignForm');
    if (form) form.reset();

    const err = document.getElementById('v2SjAssignError');
    if (err) { err.hidden = true; err.textContent = ''; }

    const dateInp = document.getElementById('v2SjAssignDate');
    if (dateInp) dateInp.value = getIstDateKey(new Date());

    const custSel = document.getElementById('v2SjAssignCustomerSelect');
    if (custSel) {
      let opts = '<option value="">-- Choose Existing Customer --</option>';
      state.customers.forEach(c => {
        const cid = c.id || c.customerId;
        const name = c.customerName || c.name || 'Customer';
        const phone = c.customerNumber || c.phone || '';
        opts += `<option value="${escapeHtml(cid)}">${escapeHtml(name)}${phone ? ` (${escapeHtml(phone)})` : ''}</option>`;
      });
      custSel.innerHTML = opts;
    }

    toggleAssignCustomerMode('existing');
    updateAssignCategoryFields('solar_cleaning');

    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.open === 'function') {
      window.CWP_ADMIN_V2.overlay.open('v2ModalSjAssign');
    } else {
      modal.style.display = 'flex';
    }
  }

  function toggleAssignCustomerMode(mode) {
    const wrap = document.getElementById('v2SjAssignExistingWrap');
    if (wrap) wrap.style.display = mode === 'existing' ? 'flex' : 'none';
  }

  function updateAssignCategoryFields(catId) {
    const solarWrap = document.getElementById('v2SjAssignSolarFields');
    const vehWrap = document.getElementById('v2SjAssignVehicleFields');
    const isSolar = catId === 'solar_cleaning';
    if (solarWrap) solarWrap.style.display = isSolar ? 'grid' : 'none';
    if (vehWrap) vehWrap.style.display = isSolar ? 'none' : 'grid';

    const staffSel = document.getElementById('v2SjAssignStaff');
    if (staffSel) {
      let opts = '<option value="">-- Select Capable Staff --</option>';
      state.staffList.filter(s => isStaffActive(s) && staffHasCapability(s, catId)).forEach(s => {
        const code = s.staffCode || s.id;
        opts += `<option value="${escapeHtml(code)}">${escapeHtml(s.name)} (${escapeHtml(code)})</option>`;
      });
      staffSel.innerHTML = opts;
    }
  }

  function bindAssignModalEvents() {
    document.querySelectorAll('input[name="v2SjCustMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => toggleAssignCustomerMode(e.target.value));
    });

    const custSel = document.getElementById('v2SjAssignCustomerSelect');
    if (custSel) {
      custSel.addEventListener('change', () => {
        const cust = state.customerMap[custSel.value];
        if (!cust) return;
        const nameInp = document.getElementById('v2SjAssignCustName');
        const phoneInp = document.getElementById('v2SjAssignCustPhone');
        const addrInp = document.getElementById('v2SjAssignCustAddress');
        const vehInp = document.getElementById('v2SjAssignVehicleReg');
        if (nameInp) nameInp.value = cust.customerName || cust.name || '';
        if (phoneInp) phoneInp.value = String(cust.customerNumber || cust.phone || '').replace(/\D/g, '').slice(-10);
        if (addrInp) addrInp.value = cust.address || cust.addressText || '';
        if (vehInp) vehInp.value = cust.vehicle || '';
      });
    }

    const catSel = document.getElementById('v2SjAssignCategory');
    if (catSel) {
      catSel.addEventListener('change', () => updateAssignCategoryFields(catSel.value));
    }

    const form = document.getElementById('v2SjAssignForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.isSubmitting) return;
        const api = window.CWP_ADMIN_V2.api;
        if (!api) return;

        const errEl = document.getElementById('v2SjAssignError');
        const showErr = (msg) => {
          if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        };
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

        const mode = document.querySelector('input[name="v2SjCustMode"]:checked')?.value || 'existing';
        const customerId = mode === 'existing' ? (document.getElementById('v2SjAssignCustomerSelect')?.value || null) : null;
        const customerName = document.getElementById('v2SjAssignCustName')?.value.trim();
        const customerPhone = document.getElementById('v2SjAssignCustPhone')?.value.trim();
        const address = document.getElementById('v2SjAssignCustAddress')?.value.trim();
        const serviceCategoryId = document.getElementById('v2SjAssignCategory')?.value;
        const serviceType = document.getElementById('v2SjAssignServiceType')?.value.trim() || getCategoryMeta(serviceCategoryId).label;
        const panelCount = document.getElementById('v2SjAssignPanelCount')?.value;
        const roofScope = document.getElementById('v2SjAssignRoofScope')?.value.trim();
        const seaterType = document.getElementById('v2SjAssignSeater')?.value;
        const vehicleDetails = document.getElementById('v2SjAssignVehicleReg')?.value.trim();
        const scheduledDate = document.getElementById('v2SjAssignDate')?.value;
        const scheduledTime = document.getElementById('v2SjAssignTime')?.value.trim();
        const staffId = document.getElementById('v2SjAssignStaff')?.value;
        const sequenceOrder = document.getElementById('v2SjAssignSeq')?.value;
        const specialInstructions = document.getElementById('v2SjAssignNotes')?.value.trim();

        if (!customerName || !customerPhone || !address || !staffId || !scheduledDate || !scheduledTime) {
          showErr('Please fill all required customer, schedule, and staff fields.');
          return;
        }

        const btn = document.getElementById('v2SjAssignSubmitBtn');
        state.isSubmitting = true;
        try {
          await api.withLoadingButton(btn, () => api.request('assignSpecialJob', {
            customerId,
            customerName,
            customerPhone,
            address,
            serviceCategoryId,
            serviceType,
            panelCount: serviceCategoryId === 'solar_cleaning' ? Number(panelCount || 10) : null,
            packageDetails: serviceCategoryId === 'solar_cleaning' ? (roofScope || null) : null,
            seaterType: serviceCategoryId !== 'solar_cleaning' ? seaterType : null,
            vehicleDetails: serviceCategoryId !== 'solar_cleaning' ? vehicleDetails : null,
            scheduledDate,
            scheduledTime,
            staffId,
            sequenceOrder: sequenceOrder ? Number(sequenceOrder) : null,
            specialInstructions: specialInstructions || null
          }));
          if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalSjAssign');
          showToast('Service job assigned and dispatched.', 'success');
          await loadData();
        } catch (err) {
          showErr(err.message || 'Failed to assign service job.');
        } finally {
          state.isSubmitting = false;
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // REASSIGN / UNASSIGN MODAL
  // -------------------------------------------------------------------------
  function openReassignModal(jobId) {
    const j = state.allJobs.find(x => String(x.id) === String(jobId));
    if (!j) return;
    if (normalizeStatus(j) === 'completed') {
      showToast('Completed jobs cannot be reassigned.', 'warning');
      return;
    }

    state.reassignModal.jobId = j.id;
    const summary = document.getElementById('v2SjReassignSummary');
    if (summary) {
      summary.innerHTML = `<strong>${escapeHtml(j.customerName || 'Customer')}</strong> • ${escapeHtml(getCategoryMeta(j.serviceCategoryId).label)}<br>Current Staff: <strong>${escapeHtml(j.staffName || 'Unassigned')}</strong>`;
    }

    const err = document.getElementById('v2SjReassignError');
    if (err) { err.hidden = true; err.textContent = ''; }

    const timeInp = document.getElementById('v2SjReassignTime');
    const seqInp = document.getElementById('v2SjReassignSeq');
    const reasonInp = document.getElementById('v2SjReassignReason');
    if (timeInp) timeInp.value = j.scheduledTime || j.tentativeTime || '';
    if (seqInp) seqInp.value = j.sequenceOrder != null ? String(j.sequenceOrder) : '';
    if (reasonInp) reasonInp.value = '';

    const sel = document.getElementById('v2SjReassignStaff');
    if (sel) {
      let opts = '<option value="">-- Select Staff --</option><option value="unassigned">Unassign (Return to Pool)</option>';
      state.staffList.filter(s => isStaffActive(s) && staffHasCapability(s, j.serviceCategoryId)).forEach(s => {
        const code = s.staffCode || s.id;
        opts += `<option value="${escapeHtml(code)}">${escapeHtml(s.name)} (${escapeHtml(code)})</option>`;
      });
      sel.innerHTML = opts;
    }

    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.open === 'function') {
      window.CWP_ADMIN_V2.overlay.open('v2ModalSjReassign');
    } else {
      document.getElementById('v2ModalSjReassign').style.display = 'flex';
    }
  }

  function bindReassignModalEvents() {
    const form = document.getElementById('v2SjReassignForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isSubmitting) return;
      const api = window.CWP_ADMIN_V2.api;
      if (!api) return;

      const errEl = document.getElementById('v2SjReassignError');
      const showErr = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      };
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

      const newStaffId = document.getElementById('v2SjReassignStaff')?.value;
      const scheduledTime = document.getElementById('v2SjReassignTime')?.value.trim() || null;
      const sequenceOrder = document.getElementById('v2SjReassignSeq')?.value.trim();
      const reason = document.getElementById('v2SjReassignReason')?.value.trim() || null;

      if (!newStaffId) {
        showErr('Please select a staff member or unassign option.');
        return;
      }

      const btn = document.getElementById('v2SjReassignSubmitBtn');
      state.isSubmitting = true;
      try {
        await api.withLoadingButton(btn, () => api.request('reassignSpecialJob', {
          jobId: state.reassignModal.jobId,
          newStaffId,
          unassign: newStaffId === 'unassigned',
          scheduledTime,
          tentativeTime: scheduledTime,
          sequenceOrder: sequenceOrder ? Number(sequenceOrder) : null,
          reason
        }));
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalSjReassign');
        showToast(newStaffId === 'unassigned' ? 'Job unassigned successfully.' : 'Job reassigned successfully.', 'success');
        await loadData();
      } catch (err) {
        showErr(err.message || 'Failed to update assignment.');
      } finally {
        state.isSubmitting = false;
      }
    });
  }

  // -------------------------------------------------------------------------
  // STATUS TRANSITION MODAL (START / COMPLETE / CANCEL / UNABLE TO COMPLETE)
  // -------------------------------------------------------------------------
  function openStatusModal(jobId, mode) {
    const j = state.allJobs.find(x => String(x.id) === String(jobId));
    if (!j) return;

    state.statusModal.jobId = j.id;
    state.statusModal.mode = mode;

    const title = document.getElementById('v2SjStatusModalTitle');
    const summary = document.getElementById('v2SjStatusSummary');
    const err = document.getElementById('v2SjStatusError');
    const reasonWrap = document.getElementById('v2SjStatusReasonWrap');
    const reasonLabel = document.getElementById('v2SjStatusReasonLabel');
    const reasonInp = document.getElementById('v2SjStatusReason');
    const notesLabel = document.getElementById('v2SjStatusNotesLabel');
    const notesInp = document.getElementById('v2SjStatusNotes');
    const submitBtn = document.getElementById('v2SjStatusSubmitBtn');

    if (err) { err.hidden = true; err.textContent = ''; }
    if (reasonInp) reasonInp.value = '';
    if (notesInp) notesInp.value = '';
    if (summary) summary.textContent = `${j.customerName || 'Customer'} • ${getCategoryMeta(j.serviceCategoryId).label} (${j.id})`;

    if (mode === 'start') {
      if (title) title.textContent = 'Start Service Job';
      if (reasonWrap) reasonWrap.hidden = true;
      if (notesLabel) notesLabel.textContent = 'Start Notes (Optional)';
      if (submitBtn) { submitBtn.textContent = 'Start Job'; submitBtn.className = 'cwp-v2-btn cwp-v2-btn-primary'; }
    } else if (mode === 'complete') {
      if (title) title.textContent = 'Mark Job Completed';
      if (reasonWrap) reasonWrap.hidden = true;
      if (notesLabel) notesLabel.textContent = 'Completion Notes (Optional)';
      if (submitBtn) { submitBtn.textContent = 'Mark Completed'; submitBtn.className = 'cwp-v2-btn cwp-v2-btn-primary'; }
    } else if (mode === 'cancel') {
      if (title) title.textContent = 'Cancel Service Job';
      if (reasonWrap) reasonWrap.hidden = false;
      if (reasonLabel) reasonLabel.innerHTML = 'Cancellation Reason <span class="cwp-v2-req-star">*</span>';
      if (notesLabel) notesLabel.textContent = 'Remarks (Optional)';
      if (submitBtn) { submitBtn.textContent = 'Confirm Cancel'; submitBtn.className = 'cwp-v2-btn cwp-v2-btn-danger-solid'; }
    } else if (mode === 'fail') {
      if (title) title.textContent = 'Mark Unable to Complete';
      if (reasonWrap) reasonWrap.hidden = false;
      if (reasonLabel) reasonLabel.innerHTML = 'Failure Reason <span class="cwp-v2-req-star">*</span>';
      if (notesLabel) notesLabel.textContent = 'Remarks (Optional)';
      if (submitBtn) { submitBtn.textContent = 'Mark Unable to Complete'; submitBtn.className = 'cwp-v2-btn cwp-v2-btn-danger-solid'; }
    }

    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.open === 'function') {
      window.CWP_ADMIN_V2.overlay.open('v2ModalSjStatusAction');
    } else {
      document.getElementById('v2ModalSjStatusAction').style.display = 'flex';
    }
  }

  function bindStatusModalEvents() {
    const form = document.getElementById('v2SjStatusForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isSubmitting) return;
      const api = window.CWP_ADMIN_V2.api;
      if (!api) return;

      const mode = state.statusModal.mode;
      const jobId = state.statusModal.jobId;
      const reason = document.getElementById('v2SjStatusReason')?.value.trim() || '';
      const notes = document.getElementById('v2SjStatusNotes')?.value.trim() || '';
      const errEl = document.getElementById('v2SjStatusError');
      const showErr = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      };
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

      if ((mode === 'cancel' || mode === 'fail') && !reason) {
        showErr('A reason is required for this status change.');
        return;
      }

      const btn = document.getElementById('v2SjStatusSubmitBtn');
      state.isSubmitting = true;
      try {
        if (mode === 'start') {
          await api.withLoadingButton(btn, () => api.request('startSpecialJob', { jobId, notes }));
          showToast('Job marked as In Progress.', 'success');
        } else if (mode === 'complete') {
          await api.withLoadingButton(btn, () => api.request('completeSpecialJob', { jobId, completionNotes: notes, notes }));
          showToast('Job marked as Completed.', 'success');
        } else if (mode === 'cancel') {
          await api.withLoadingButton(btn, () => api.request('cancelSpecialJob', { jobId, reason, cancellationReason: reason, remarks: notes }));
          showToast('Job cancelled.', 'success');
        } else if (mode === 'fail') {
          await api.withLoadingButton(btn, () => api.request('failServiceJob', { jobId, failureReason: reason, reason, failureRemarks: notes, remarks: notes }));
          showToast('Job marked as Unable to Complete.', 'success');
        }
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalSjStatusAction');
        await loadData();
      } catch (err) {
        showErr(err.message || 'Status update failed.');
      } finally {
        state.isSubmitting = false;
      }
    });
  }

  async function deleteJob(jobId) {
    const api = window.CWP_ADMIN_V2.api;
    if (!api || state.isSubmitting) return;
    if (!window.confirm('Delete / cancel this service job? This action cannot be undone.')) return;
    state.isSubmitting = true;
    try {
      await api.request('deleteSpecialJob', { jobId });
      showToast('Service job deleted.', 'success');
      if (state.selectedJobId === jobId) closeDetail();
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to delete job.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // EVENT BINDINGS
  // -------------------------------------------------------------------------
  function bindToolbarEvents() {
    const periodSel = document.getElementById('v2SjPeriodSelect');
    if (periodSel) {
      periodSel.addEventListener('change', () => {
        state.period = periodSel.value || 'today';
        if (state.period === 'custom') {
          const adv = document.getElementById('v2SjAdvancedBar');
          const advBtn = document.getElementById('v2SjBtnAdvFilters');
          if (adv) adv.hidden = false;
          if (advBtn) advBtn.setAttribute('aria-expanded', 'true');
        }
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const refreshBtn = document.getElementById('v2SjBtnRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadData());

    const assignBtn = document.getElementById('v2SjBtnAssignJob');
    if (assignBtn) assignBtn.addEventListener('click', () => openAssignModal());

    const kpiStrip = document.getElementById('v2SjKpiStrip');
    if (kpiStrip) {
      kpiStrip.addEventListener('click', (e) => {
        const card = e.target.closest('.cwp-v2-sj-kpi-card');
        if (!card) return;
        const kpi = card.getAttribute('data-kpi') || 'all';
        state.kpiFilter = (state.kpiFilter === kpi && kpi !== 'all') ? 'all' : kpi;
        kpiStrip.querySelectorAll('.cwp-v2-sj-kpi-card').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-kpi') === state.kpiFilter);
        });
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const catBar = document.getElementById('v2SjCategoryBar');
    if (catBar) {
      catBar.addEventListener('click', (e) => {
        const chip = e.target.closest('.cwp-v2-sj-cat-chip');
        if (!chip) return;
        state.categoryFilter = chip.getAttribute('data-cat') || 'all';
        catBar.querySelectorAll('.cwp-v2-sj-cat-chip').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-cat') === state.categoryFilter);
        });
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const searchInput = document.getElementById('v2SjSearchInput');
    const searchClear = document.getElementById('v2SjSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value || '';
        if (searchClear) searchClear.classList.toggle('is-visible', Boolean(val.trim()));
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          state.pagination.currentPage = 1;
          applyFiltersAndRender();
        }, 180);
      });
    }
    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.remove('is-visible');
        state.searchQuery = '';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const bindSelect = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        state.filters[key] = el.value;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    };
    bindSelect('v2SjFilterStatus', 'status');
    bindSelect('v2SjFilterStaff', 'staff');
    bindSelect('v2SjFilterRoute', 'route');
    bindSelect('v2SjFilterAssignState', 'assignState');
    bindSelect('v2SjFilterPhotos', 'photoFilter');

    const dateFrom = document.getElementById('v2SjDateFrom');
    const dateTo = document.getElementById('v2SjDateTo');
    const onCustomDateChange = () => {
      state.filters.dateFrom = dateFrom ? dateFrom.value : '';
      state.filters.dateTo = dateTo ? dateTo.value : '';
      state.period = 'custom';
      if (periodSel) periodSel.value = 'custom';
      state.pagination.currentPage = 1;
      applyFiltersAndRender();
    };
    if (dateFrom) dateFrom.addEventListener('change', onCustomDateChange);
    if (dateTo) dateTo.addEventListener('change', onCustomDateChange);

    const advBtn = document.getElementById('v2SjBtnAdvFilters');
    const advBar = document.getElementById('v2SjAdvancedBar');
    if (advBtn && advBar) {
      advBtn.addEventListener('click', () => {
        const open = advBar.hidden;
        advBar.hidden = !open;
        advBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    const resetBtn = document.getElementById('v2SjResetFilters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.period = 'today';
        state.kpiFilter = 'all';
        state.categoryFilter = 'all';
        state.searchQuery = '';
        state.filters = { status: 'all', staff: 'all', route: 'all', dateFrom: '', dateTo: '', assignState: 'all', photoFilter: 'all' };
        state.pagination.currentPage = 1;

        if (periodSel) periodSel.value = 'today';
        if (searchInput) searchInput.value = '';
        if (searchClear) searchClear.classList.remove('is-visible');
        ['v2SjFilterStatus', 'v2SjFilterStaff', 'v2SjFilterRoute', 'v2SjFilterAssignState', 'v2SjFilterPhotos'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = 'all';
        });
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';
        if (kpiStrip) {
          kpiStrip.querySelectorAll('.cwp-v2-sj-kpi-card').forEach(c => c.classList.toggle('is-active', c.getAttribute('data-kpi') === 'all'));
        }
        if (catBar) {
          catBar.querySelectorAll('.cwp-v2-sj-cat-chip').forEach(c => c.classList.toggle('is-active', c.getAttribute('data-cat') === 'all'));
        }
        applyFiltersAndRender();
      });
    }
  }

  function bindTableEvents() {
    const table = document.getElementById('v2SjTable');
    if (table) {
      table.addEventListener('click', (e) => {
        const emptyBtn = e.target.closest('#v2SjEmptyAllTimeBtn');
        if (emptyBtn) {
          state.period = 'all';
          const periodSel = document.getElementById('v2SjPeriodSelect');
          if (periodSel) periodSel.value = 'all';
          state.pagination.currentPage = 1;
          applyFiltersAndRender();
          return;
        }

        const th = e.target.closest('th.is-sortable');
        if (th) {
          const col = th.getAttribute('data-sort-col');
          if (state.sort.column === col) {
            state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            state.sort.column = col;
            state.sort.direction = 'asc';
          }
          table.querySelectorAll('thead th.is-sortable').forEach(h => {
            const active = h.getAttribute('data-sort-col') === state.sort.column;
            h.classList.toggle('is-sorted', active);
            const icon = h.querySelector('.cwp-v2-sj-sort-icon');
            if (icon) {
              icon.textContent = active ? (state.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
            }
          });
          applyFiltersAndRender();
          return;
        }

        const photoBtn = e.target.closest('[data-sj-photo-job]');
        if (photoBtn) {
          e.stopPropagation();
          const jid = photoBtn.getAttribute('data-sj-photo-job');
          const kind = photoBtn.getAttribute('data-sj-photo-kind');
          const job = state.allJobs.find(x => String(x.id) === String(jid));
          if (job) {
            const list = kind === 'after' ? job.afterPhotos : job.beforePhotos;
            if (Array.isArray(list) && list.length > 0) {
              openPhotoLightbox(list[0], `${job.customerName || 'Customer'} — ${kind === 'after' ? 'After Photo' : 'Before Photo'}`);
            }
          }
          return;
        }

        const actBtn = e.target.closest('[data-sj-action]');
        if (actBtn) {
          e.stopPropagation();
          const act = actBtn.getAttribute('data-sj-action');
          const jid = actBtn.getAttribute('data-sj-id');
          if (act === 'reassign') openReassignModal(jid);
          else if (act === 'complete') openStatusModal(jid, 'complete');
          else openDetail(jid);
          return;
        }

        const row = e.target.closest('tr[data-sj-row]');
        if (row) {
          openDetail(row.getAttribute('data-sj-row'));
        }
      });
    }

    const pageSizeSel = document.getElementById('v2SjPageSize');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', () => {
        state.pagination.pageSize = Number(pageSizeSel.value) || 25;
        state.pagination.currentPage = 1;
        renderTable();
        renderPagination();
      });
    }

    const prevBtn = document.getElementById('v2SjPagePrev');
    const nextBtn = document.getElementById('v2SjPageNext');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.pagination.currentPage > 1) {
          state.pagination.currentPage--;
          renderTable();
          renderPagination();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(state.pagination.totalRecords / state.pagination.pageSize));
        if (state.pagination.currentPage < totalPages) {
          state.pagination.currentPage++;
          renderTable();
          renderPagination();
        }
      });
    }

    const pageNums = document.getElementById('v2SjPageNumbers');
    if (pageNums) {
      pageNums.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sj-page]');
        if (!btn) return;
        state.pagination.currentPage = Number(btn.getAttribute('data-sj-page')) || 1;
        renderTable();
        renderPagination();
      });
    }
  }

  function bindDetailEvents() {
    const panel = document.getElementById('v2SjDetailPanel');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
      if (e.target.closest('#v2SjDetailCloseBtn')) {
        closeDetail();
        return;
      }
      const lb = e.target.closest('[data-sj-lightbox-url]');
      if (lb) {
        openPhotoLightbox(lb.getAttribute('data-sj-lightbox-url'), lb.getAttribute('data-sj-lightbox-label'));
        return;
      }
      const actBtn = e.target.closest('[data-sj-detail-act]');
      if (actBtn && state.selectedJobId) {
        const act = actBtn.getAttribute('data-sj-detail-act');
        if (act === 'reassign') openReassignModal(state.selectedJobId);
        else if (act === 'delete') deleteJob(state.selectedJobId);
        else openStatusModal(state.selectedJobId, act);
      }
    });
  }

  window.CWP_ADMIN_V2.specialJobs = {
    init,
    loadData,
    openDetail,
    closeDetail,
    getState: () => state
  };
})(window);
