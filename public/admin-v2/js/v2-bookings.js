/**
 * =========================================================================
 * CWP ADMIN V2 — ASSIGN BOOKING WORKSTATION MODULE
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.bookings.
 * English-only Admin UI, Material Symbols only, zero mocks, zero emojis,
 * zero SSE indicators. Preserves all backend contracts & validation rules.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = {
    allBookings: [],
    filteredBookings: [],
    customers: [],
    customerMap: {},
    staffList: [],
    routes: [],
    serviceCatalog: null,
    selectedBookingId: null,
    checkedIds: new Set(),
    kpiFilter: null, // null | 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'exceptions'
    searchQuery: '',
    filters: {
      status: 'all',
      service: 'all',
      date: '',
      staff: 'all',
      route: 'all'
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
    assignModal: {
      jobIds: [],
      selectedStaffId: ''
    },
    cancelModal: {
      jobId: null
    },
    failModal: {
      jobId: null
    },
    isLoading: false,
    isSubmitting: false,
    initialized: false,
    hasLoadedOnce: false
  };

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

  function getTodayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function hasAssignedStaff(staffId, staffName) {
    return Boolean(staffId && String(staffName || '').trim().toLowerCase() !== 'unassigned');
  }

  function normalizeStatus(rawStatus, staffId, staffName) {
    const s = String(rawStatus || '').toLowerCase().trim();
    if (s === 'in_progress') return 'in_progress';
    if (s === 'completed') return 'completed';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'unable_to_complete') return 'unable_to_complete';
    if (s === 'assigned') return 'assigned';
    if (hasAssignedStaff(staffId, staffName)) return 'assigned';
    if (s === 'requested' || s === 'booked' || s === 'pending') return s;
    return 'booked';
  }

  function isUnassignedBooking(b) {
    const st = normalizeStatus(b.status, b.staffId, b.staffName);
    if (st === 'completed' || st === 'cancelled' || st === 'unable_to_complete' || st === 'in_progress') return false;
    return !hasAssignedStaff(b.staffId, b.staffName);
  }

  function isExceptionBooking(b) {
    const st = normalizeStatus(b.status, b.staffId, b.staffName);
    return st === 'unable_to_complete' || st === 'cancelled';
  }

  function isTerminalBooking(b) {
    const st = normalizeStatus(b.status, b.staffId, b.staffName);
    return st === 'completed' || st === 'cancelled' || st === 'unable_to_complete';
  }

  function getStatusMeta(b) {
    const st = normalizeStatus(b.status, b.staffId, b.staffName);
    switch (st) {
      case 'assigned':
        return { label: 'Assigned', cls: 'is-assigned', icon: 'person_check' };
      case 'in_progress':
        return { label: 'In Progress', cls: 'is-in-progress', icon: 'autorenew' };
      case 'completed':
        return { label: 'Completed', cls: 'is-completed', icon: 'check_circle' };
      case 'cancelled':
        return { label: 'Cancelled', cls: 'is-exception', icon: 'cancel' };
      case 'unable_to_complete':
        return { label: 'Unable to Complete', cls: 'is-exception', icon: 'error' };
      case 'requested':
        return { label: 'Requested', cls: 'is-unassigned', icon: 'schedule' };
      default:
        return { label: 'Unassigned', cls: 'is-unassigned', icon: 'pending_actions' };
    }
  }

  function formatDateDisplay(val) {
    if (!val) return '—';
    const str = String(val).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    }
    return str;
  }

  function formatDateTimeDisplay(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

  function staffHasCapability(s, categoryIdOrName) {
    const norm = String(categoryIdOrName || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    const canonical = norm === 'solar_panel_cleaning' ? 'solar_cleaning' : norm;
    const caps = getStaffCapabilities(s);
    if (caps.length === 0) return true;
    return caps.includes(canonical);
  }

  function getStaffActiveWorkloadMap() {
    const counts = {};
    state.allBookings.forEach(b => {
      const st = normalizeStatus(b.status, b.staffId, b.staffName);
      if ((st === 'assigned' || st === 'in_progress') && b.staffId) {
        const key = String(b.staffId).toUpperCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION & DATA LOADING
  // -------------------------------------------------------------------------
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindToolbarEvents();
    bindTableEvents();
    bindDetailEvents();
    bindAssignModalEvents();
    bindCreateModalEvents();
    bindCancelFailModalEvents();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'serviceAssign') {
        loadData();
      }
    });

    const viewEl = document.getElementById('v2View_serviceAssign');
    if (viewEl && viewEl.classList.contains('is-active')) {
      loadData();
    }
  }

  async function loadData() {
    if (!hasAuthToken() || state.isLoading) return;
    const api = window.CWP_ADMIN_V2.api;
    if (!api) return;

    state.isLoading = true;
    const tbody = document.getElementById('v2BkTableBody');
    if (tbody && !state.hasLoadedOnce) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:28px; color:#64748b;">Loading bookings...</td></tr>';
    }

    try {
      const [jobsRes, custRes, staffRes, routesRes, catalogRes] = await Promise.allSettled([
        api.request('getSpecialJobs', {}),
        api.request('getAllCustomers', {}),
        api.request('getStaffList', {}),
        api.request('getAllRoutes', {}),
        api.request('getServiceCatalog', {})
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

      if (catalogRes.status === 'fulfilled' && catalogRes.value) {
        state.serviceCatalog = catalogRes.value;
      }

      if (jobsRes.status === 'fulfilled' && jobsRes.value) {
        const rawJobs = Array.isArray(jobsRes.value.jobs)
          ? jobsRes.value.jobs
          : (Array.isArray(jobsRes.value) ? jobsRes.value : []);
        state.allBookings = rawJobs.map(j => enrichBooking(j));
        state.hasLoadedOnce = true;
      }

      populateFilterDropdowns();
      updateKpis();
      applyFiltersAndRender();
      if (state.selectedBookingId) {
        renderDetailPanel();
      }
    } catch (err) {
      showToast(err.message || 'Failed to load bookings.', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  function enrichBooking(j) {
    const cust = state.customerMap[j.customerId] || state.customerMap[j.customerCode] || null;
    const routeName = j.routeName || (cust && (cust.routeName || cust.route || cust.zone)) || '';
    const areaText = j.area || (cust && (cust.area || cust.sector)) || '';
    return Object.assign({}, j, {
      routeName,
      areaText
    });
  }

  function populateFilterDropdowns() {
    const staffSel = document.getElementById('v2BkFilterStaff');
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

    const routeSel = document.getElementById('v2BkFilterRoute');
    if (routeSel) {
      const prev = routeSel.value || 'all';
      const seen = new Set();
      let opts = '<option value="all">Route: All</option>';
      state.routes.forEach(r => {
        const rName = r.routeName || r.name || r.routeCode || '';
        if (rName && !seen.has(rName)) {
          seen.add(rName);
          opts += `<option value="${escapeHtml(rName)}">${escapeHtml(rName)}</option>`;
        }
      });
      state.allBookings.forEach(b => {
        if (b.routeName && !seen.has(b.routeName)) {
          seen.add(b.routeName);
          opts += `<option value="${escapeHtml(b.routeName)}">${escapeHtml(b.routeName)}</option>`;
        }
      });
      routeSel.innerHTML = opts;
      routeSel.value = prev;
    }
  }

  // -------------------------------------------------------------------------
  // KPI SUMMARY & FILTERING
  // -------------------------------------------------------------------------
  function updateKpis() {
    const list = state.allBookings;
    const total = list.length;
    const unassigned = list.filter(isUnassignedBooking).length;
    const assigned = list.filter(b => normalizeStatus(b.status, b.staffId, b.staffName) === 'assigned').length;
    const inProgress = list.filter(b => normalizeStatus(b.status, b.staffId, b.staffName) === 'in_progress').length;
    const completed = list.filter(b => normalizeStatus(b.status, b.staffId, b.staffName) === 'completed').length;
    const exceptions = list.filter(isExceptionBooking).length;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setVal('v2BkKpiTotal', total);
    setVal('v2BkKpiUnassigned', unassigned);
    setVal('v2BkKpiAssigned', assigned);
    setVal('v2BkKpiInProgress', inProgress);
    setVal('v2BkKpiCompleted', completed);
    setVal('v2BkKpiExceptions', exceptions);

    document.querySelectorAll('#v2BkKpiStrip .cwp-v2-bk-kpi-card').forEach(card => {
      const kpi = card.getAttribute('data-kpi');
      const active = (state.kpiFilter === null && kpi === 'total') || state.kpiFilter === kpi;
      card.classList.toggle('is-active', active);
    });
  }

  function applyFiltersAndRender() {
    const q = state.searchQuery.trim().toLowerCase();
    const { status, service, date, staff, route } = state.filters;

    let filtered = state.allBookings.filter(b => {
      const normSt = normalizeStatus(b.status, b.staffId, b.staffName);

      if (state.kpiFilter === 'unassigned' && !isUnassignedBooking(b)) return false;
      if (state.kpiFilter === 'assigned' && normSt !== 'assigned') return false;
      if (state.kpiFilter === 'in_progress' && normSt !== 'in_progress') return false;
      if (state.kpiFilter === 'completed' && normSt !== 'completed') return false;
      if (state.kpiFilter === 'exceptions' && !isExceptionBooking(b)) return false;

      if (status !== 'all') {
        if (status === 'unassigned') {
          if (!isUnassignedBooking(b)) return false;
        } else if (normSt !== status) {
          return false;
        }
      }

      if (service !== 'all') {
        const catId = String(b.serviceCategoryId || '').toLowerCase();
        const catName = String(b.serviceCategory || '').toLowerCase();
        if (catId !== service && !catName.includes(service.replace(/_/g, ' '))) {
          return false;
        }
      }

      if (date) {
        const bDate = String(b.scheduledDate || '').slice(0, 10);
        if (bDate !== date) return false;
      }

      if (staff !== 'all') {
        if (staff === 'unassigned') {
          if (!isUnassignedBooking(b)) return false;
        } else {
          const bStaff = String(b.staffId || '').toLowerCase();
          const bStaffName = String(b.staffName || '').toLowerCase();
          if (bStaff !== staff.toLowerCase() && bStaffName !== staff.toLowerCase()) return false;
        }
      }

      if (route !== 'all') {
        if (String(b.routeName || '').toLowerCase() !== route.toLowerCase()) return false;
      }

      if (q) {
        const hay = [
          b.customerName,
          b.customerPhone,
          b.customerCode,
          b.vehicle,
          b.serviceCategory,
          b.serviceType,
          b.address,
          b.routeName,
          b.staffName,
          b.packageCode
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    // Sort
    const col = state.sort.column;
    const dir = state.sort.direction === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let va = '';
      let vb = '';
      if (col === 'customer') {
        va = (a.customerName || '').toLowerCase();
        vb = (b.customerName || '').toLowerCase();
      } else if (col === 'service') {
        va = (a.serviceCategory || a.serviceType || '').toLowerCase();
        vb = (b.serviceCategory || b.serviceType || '').toLowerCase();
      } else if (col === 'staff') {
        va = (a.staffName || 'zzz').toLowerCase();
        vb = (b.staffName || 'zzz').toLowerCase();
      } else if (col === 'status') {
        va = normalizeStatus(a.status, a.staffId, a.staffName);
        vb = normalizeStatus(b.status, b.staffId, b.staffName);
      } else {
        va = String(a.scheduledDate || a.createdAt || '');
        vb = String(b.scheduledDate || b.createdAt || '');
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.filteredBookings = filtered;
    state.pagination.totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pagination.pageSize));
    if (state.pagination.currentPage > totalPages) {
      state.pagination.currentPage = totalPages;
    }

    renderTable();
    renderPagination();
    updateBulkBar();
  }

  function renderTable() {
    const tbody = document.getElementById('v2BkTableBody');
    if (!tbody) return;

    const wrap = tbody.closest('.cwp-v2-bk-table-wrap');
    const prevScroll = wrap ? wrap.scrollTop : 0;

    const { currentPage, pageSize } = state.pagination;
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = state.filteredBookings.slice(startIdx, startIdx + pageSize);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:32px; color:#64748b;">
            <span class="material-symbols-outlined" style="font-size:28px; display:block; margin-bottom:6px; opacity:0.6;">event_busy</span>
            <div style="font-weight:600; color:#334155;">No bookings match the current filters</div>
            <div style="font-size:11.5px; margin-top:2px;">Try clearing filters or create a new booking</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageItems.map(b => {
      const id = b.id || b.jobId;
      const isSelected = state.selectedBookingId === id;
      const isChecked = state.checkedIds.has(id);
      const stMeta = getStatusMeta(b);
      const unassigned = isUnassignedBooking(b);
      const terminal = isTerminalBooking(b);

      const staffHtml = unassigned
        ? '<span class="cwp-v2-bk-status is-unassigned">Unassigned</span>'
        : `<span class="cwp-v2-bk-cell-primary">${escapeHtml(b.staffName || b.staffId)}</span>`;

      const assetHtml = b.panelCount
        ? `${escapeHtml(b.panelCount)} Solar Panels`
        : (b.vehicle ? escapeHtml(b.vehicle) : '—');

      const addrText = b.address || '—';
      const routeSub = b.routeName ? `Route: ${escapeHtml(b.routeName)}` : '';

      const actionLabel = unassigned ? 'Assign' : (terminal ? 'View' : 'Reassign');
      const actionBtn = terminal
        ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" data-bk-action="view" data-job-id="${escapeHtml(id)}">View</button>`
        : `<button type="button" class="cwp-v2-btn ${unassigned ? 'cwp-v2-btn-primary' : 'cwp-v2-btn-secondary'} cwp-v2-btn-sm" data-bk-action="assign" data-job-id="${escapeHtml(id)}">${actionLabel}</button>`;

      return `
        <tr data-job-id="${escapeHtml(id)}" class="${isSelected ? 'is-selected-row' : ''} ${isChecked ? 'is-checked-row' : ''}">
          <td style="width:34px; text-align:center;" onclick="event.stopPropagation()">
            <input type="checkbox" class="v2-bk-row-check" data-job-id="${escapeHtml(id)}" ${isChecked ? 'checked' : ''} aria-label="Select booking for ${escapeHtml(b.customerName || 'customer')}">
          </td>
          <td>
            <div class="cwp-v2-bk-cell-primary">${escapeHtml(b.customerName || 'Customer')}</div>
            <div class="cwp-v2-bk-cell-sub">${escapeHtml(b.customerPhone || '—')}</div>
          </td>
          <td>
            <div class="cwp-v2-bk-cell-primary cwp-v2-bk-cell-truncate" title="${escapeHtml(assetHtml)}">${assetHtml}</div>
          </td>
          <td>
            <div class="cwp-v2-bk-cell-primary">${escapeHtml(b.serviceType || b.serviceCategory || 'Service')}</div>
            <div class="cwp-v2-bk-cell-sub">${escapeHtml(b.serviceCategory || '')}${b.packageCode ? ' • Pkg' : ''}</div>
          </td>
          <td style="white-space:nowrap;">
            <div class="cwp-v2-bk-cell-primary">${escapeHtml(formatDateDisplay(b.scheduledDate))}</div>
            <div class="cwp-v2-bk-cell-sub">${escapeHtml(b.scheduledTime || 'Any slot')}</div>
          </td>
          <td>
            <div class="cwp-v2-bk-cell-truncate" title="${escapeHtml(addrText)}">${escapeHtml(addrText)}</div>
            ${routeSub ? `<div class="cwp-v2-bk-cell-sub">${routeSub}</div>` : ''}
          </td>
          <td>${staffHtml}</td>
          <td>
            <span class="cwp-v2-bk-status ${stMeta.cls}">
              <span class="material-symbols-outlined" style="font-size:13px;" aria-hidden="true">${stMeta.icon}</span>
              <span>${escapeHtml(stMeta.label)}</span>
            </span>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            ${actionBtn}
          </td>
        </tr>
      `;
    }).join('');

    const selectAllCb = document.getElementById('v2BkSelectAll');
    if (selectAllCb) {
      const pageIds = pageItems.map(b => b.id || b.jobId);
      selectAllCb.checked = pageIds.length > 0 && pageIds.every(id => state.checkedIds.has(id));
    }

    if (wrap) wrap.scrollTop = prevScroll;
  }

  function renderPagination() {
    const infoEl = document.getElementById('v2BkPageInfo');
    const numsEl = document.getElementById('v2BkPageNumbers');
    const prevBtn = document.getElementById('v2BkPagePrev');
    const nextBtn = document.getElementById('v2BkPageNext');

    const total = state.pagination.totalRecords;
    const { currentPage, pageSize } = state.pagination;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(total, currentPage * pageSize);

    if (infoEl) infoEl.textContent = `Showing ${start}–${end} of ${total} bookings`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    if (numsEl) {
      let btns = '';
      const maxButtons = 5;
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }
      for (let p = startPage; p <= endPage; p++) {
        btns += `<button type="button" class="cwp-v2-bk-page-btn ${p === currentPage ? 'is-active' : ''}" data-bk-page="${p}">${p}</button>`;
      }
      numsEl.innerHTML = btns;
    }
  }

  function updateBulkBar() {
    const bar = document.getElementById('v2BkBulkBar');
    const countEl = document.getElementById('v2BkBulkCount');
    const count = state.checkedIds.size;
    if (bar) bar.hidden = count === 0;
    if (countEl) countEl.textContent = `${count} booking${count === 1 ? '' : 's'} selected`;
  }

  // -------------------------------------------------------------------------
  // DISMISSIBLE DETAIL PANEL
  // -------------------------------------------------------------------------
  function openDetail(jobId) {
    state.selectedBookingId = jobId;
    const split = document.getElementById('v2BkSplitView');
    if (split) split.classList.remove('is-detail-closed');
    renderDetailPanel();
    renderTable();
  }

  function closeDetail() {
    state.selectedBookingId = null;
    const split = document.getElementById('v2BkSplitView');
    if (split) split.classList.add('is-detail-closed');
    renderTable();
  }

  function renderDetailPanel() {
    const headerEl = document.getElementById('v2BkDetailHeader');
    const scrollEl = document.getElementById('v2BkDetailScroll');
    const actionsEl = document.getElementById('v2BkDetailActions');
    if (!headerEl || !scrollEl || !actionsEl) return;

    const b = state.allBookings.find(item => (item.id || item.jobId) === state.selectedBookingId);
    if (!b) {
      closeDetail();
      return;
    }

    const stMeta = getStatusMeta(b);
    const normSt = normalizeStatus(b.status, b.staffId, b.staffName);
    const terminal = isTerminalBooking(b);
    const unassigned = isUnassignedBooking(b);

    headerEl.innerHTML = `
      <div style="min-width:0;">
        <div style="font-size:14.5px; font-weight:700; color:#0f172a;">${escapeHtml(b.customerName || 'Customer')}</div>
        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
          ${escapeHtml(b.customerCode || b.id || '')} &bull;
          <span class="cwp-v2-bk-status ${stMeta.cls}">${escapeHtml(stMeta.label)}</span>
        </div>
      </div>
      <button type="button" id="v2BkDetailCloseBtn" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" aria-label="Close booking details" title="Close detail panel">
        <span class="material-symbols-outlined" style="font-size:18px;">close</span>
      </button>
    `;

    const closeBtn = document.getElementById('v2BkDetailCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDetail);

    const mapsHtml = b.googleMapsUrl
      ? `<a href="${escapeHtml(b.googleMapsUrl)}" target="_blank" rel="noopener" style="color:#1e40af; font-weight:600; text-decoration:none;">Open Map</a>`
      : '—';

    scrollEl.innerHTML = `
      <div class="cwp-v2-bk-detail-section">
        <div class="cwp-v2-bk-detail-section-title">Customer &amp; Asset</div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Phone</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.customerPhone || '—')}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Asset</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.panelCount ? `${b.panelCount} Solar Panels` : (b.vehicle || '—'))}</span></div>
        ${b.seaterType ? `<div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Seater</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.seaterType === '5_plus_seater' ? '5+ Seater' : '5 Seater')}</span></div>` : ''}
      </div>

      <div class="cwp-v2-bk-detail-section">
        <div class="cwp-v2-bk-detail-section-title">Service &amp; Schedule</div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Category</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.serviceCategory || '—')}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Service</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.serviceType || '—')}</span></div>
        ${b.packageCode ? `<div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Package</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.packageCode)}</span></div>` : ''}
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Date</span><span class="cwp-v2-bk-detail-v">${escapeHtml(formatDateDisplay(b.scheduledDate))}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Time Slot</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.scheduledTime || 'Not specified')}</span></div>
      </div>

      <div class="cwp-v2-bk-detail-section">
        <div class="cwp-v2-bk-detail-section-title">Location &amp; Route</div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Address</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.address || '—')}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Route</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.routeName || '—')}</span></div>
        ${b.parkingDetails ? `<div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Parking</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.parkingDetails)}</span></div>` : ''}
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Map</span><span class="cwp-v2-bk-detail-v">${mapsHtml}</span></div>
      </div>

      <div class="cwp-v2-bk-detail-section">
        <div class="cwp-v2-bk-detail-section-title">Assignment &amp; Timeline</div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Staff</span><span class="cwp-v2-bk-detail-v">${escapeHtml(unassigned ? 'Unassigned' : (b.staffName || b.staffId))}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Assigned At</span><span class="cwp-v2-bk-detail-v">${escapeHtml(formatDateTimeDisplay(b.assignedAt))}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Started At</span><span class="cwp-v2-bk-detail-v">${escapeHtml(formatDateTimeDisplay(b.startedAt))}</span></div>
        <div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Completed At</span><span class="cwp-v2-bk-detail-v">${escapeHtml(formatDateTimeDisplay(b.completedAt))}</span></div>
        ${b.specialInstructions ? `<div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Instructions</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.specialInstructions)}</span></div>` : ''}
        ${b.completionNotes ? `<div class="cwp-v2-bk-detail-kv"><span class="cwp-v2-bk-detail-k">Notes</span><span class="cwp-v2-bk-detail-v">${escapeHtml(b.completionNotes)}</span></div>` : ''}
      </div>
    `;

    const id = b.id || b.jobId;
    let btns = '';
    if (!terminal) {
      btns += `
        <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-detail-act="assign" data-job-id="${escapeHtml(id)}">
          <span class="material-symbols-outlined" style="font-size:15px;">assignment_ind</span>
          <span>${unassigned ? 'Assign Staff' : 'Reassign'}</span>
        </button>
      `;
      if (!unassigned && normSt === 'assigned') {
        btns += `
          <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-detail-act="unassign" data-job-id="${escapeHtml(id)}">
            <span>Unassign</span>
          </button>
        `;
      }
      if (normSt === 'assigned' || normSt === 'in_progress') {
        btns += `
          <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-detail-act="fail" data-job-id="${escapeHtml(id)}">
            <span>Unable to Complete</span>
          </button>
        `;
      }
      if (normSt !== 'in_progress') {
        btns += `
          <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="color:#dc2626;" data-detail-act="cancel" data-job-id="${escapeHtml(id)}">
            <span>Cancel Booking</span>
          </button>
        `;
      }
    }
    actionsEl.innerHTML = btns || '<span style="font-size:12px; color:#64748b;">Terminal state — no further actions</span>';
  }

  // -------------------------------------------------------------------------
  // ASSIGN / REASSIGN MODAL (INDIVIDUAL & BULK)
  // -------------------------------------------------------------------------
  function openAssignModal(jobIds) {
    const validIds = (Array.isArray(jobIds) ? jobIds : [jobIds]).filter(id => {
      const b = state.allBookings.find(item => (item.id || item.jobId) === id);
      return b && !isTerminalBooking(b);
    });

    if (validIds.length === 0) {
      showToast('No assignable (non-completed/non-cancelled) bookings selected.', 'warning');
      return;
    }

    state.assignModal.jobIds = validIds;
    const firstJob = state.allBookings.find(item => (item.id || item.jobId) === validIds[0]);
    state.assignModal.selectedStaffId = validIds.length === 1 && firstJob && firstJob.staffId ? firstJob.staffId : '';

    const titleEl = document.getElementById('v2BkAssignModalTitle');
    const summaryEl = document.getElementById('v2BkAssignSummary');
    const timeInput = document.getElementById('v2BkAssignTime');
    const reasonInput = document.getElementById('v2BkAssignReason');

    if (titleEl) {
      titleEl.textContent = validIds.length > 1
        ? `Bulk Assign ${validIds.length} Bookings`
        : 'Assign Staff to Booking';
    }
    if (summaryEl) {
      if (validIds.length === 1 && firstJob) {
        summaryEl.innerHTML = `<strong>${escapeHtml(firstJob.customerName)}</strong> &bull; ${escapeHtml(firstJob.serviceType || firstJob.serviceCategory)} &bull; ${escapeHtml(formatDateDisplay(firstJob.scheduledDate))}`;
      } else {
        summaryEl.innerHTML = `<strong>${validIds.length} bookings</strong> selected for staff allocation`;
      }
    }
    if (timeInput) timeInput.value = validIds.length === 1 && firstJob ? (firstJob.scheduledTime || '') : '';
    if (reasonInput) reasonInput.value = '';
    const errEl = document.getElementById('v2BkAssignError');
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }

    renderAssignStaffRoster();
    updateAssignWarningBanner();

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAssignBooking');
    }
  }

  function renderAssignStaffRoster() {
    const tbody = document.getElementById('v2BkAssignStaffBody');
    if (!tbody) return;

    const workloadMap = getStaffActiveWorkloadMap();
    const targetJobs = state.assignModal.jobIds
      .map(id => state.allBookings.find(b => (b.id || b.jobId) === id))
      .filter(Boolean);

    const searchQ = (document.getElementById('v2BkAssignStaffSearch')?.value || '').trim().toLowerCase();

    const filteredStaff = state.staffList.filter(s => {
      if (!searchQ) return true;
      return `${s.name || ''} ${s.designationName || ''} ${s.route || ''}`.toLowerCase().includes(searchQ);
    });

    if (filteredStaff.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:#64748b;">No staff members match search.</td></tr>';
      return;
    }

    tbody.innerHTML = filteredStaff.map(s => {
      const sid = s.id || s.staffCode || s.name;
      const code = String(s.staffCode || s.id || '').toUpperCase();
      const active = isStaffActive(s);
      const workload = workloadMap[code] || workloadMap[String(s.id || '').toUpperCase()] || 0;
      const isSelected = state.assignModal.selectedStaffId === sid || state.assignModal.selectedStaffId === s.staffCode;
      const capableAll = targetJobs.every(j => staffHasCapability(s, j.serviceCategoryId || j.serviceCategory));

      const statusBadge = !active
        ? '<span class="cwp-v2-bk-status is-exception">Inactive</span>'
        : (!capableAll
          ? '<span class="cwp-v2-bk-status is-unassigned">No Capability</span>'
          : '<span class="cwp-v2-bk-status is-completed">Available</span>');

      return `
        <tr data-staff-id="${escapeHtml(sid)}" class="${isSelected ? 'is-selected' : ''} ${(!active || !capableAll) ? 'is-unavailable' : ''}">
          <td style="width:28px; text-align:center;">
            <input type="radio" name="v2BkAssignStaffRadio" value="${escapeHtml(sid)}" ${isSelected ? 'checked' : ''}>
          </td>
          <td>
            <div style="font-weight:600; color:#0f172a;">${escapeHtml(s.name || sid)}</div>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(s.designationName || 'Staff')}</div>
          </td>
          <td>${escapeHtml(s.route || s.assignedRoute || '—')}</td>
          <td style="font-weight:600;">${workload} active</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  function updateAssignWarningBanner() {
    const banner = document.getElementById('v2BkAssignWarning');
    const textEl = document.getElementById('v2BkAssignWarningText');
    if (!banner || !textEl) return;

    const sid = state.assignModal.selectedStaffId;
    if (!sid) {
      banner.hidden = true;
      return;
    }

    const staff = state.staffList.find(s => s.id === sid || s.staffCode === sid || s.name === sid);
    if (!staff) {
      banner.hidden = true;
      return;
    }

    const warnings = [];
    if (!isStaffActive(staff)) {
      warnings.push(`${staff.name} is currently inactive. Backend validation will reject assignment to inactive staff.`);
    }

    const targetJobs = state.assignModal.jobIds
      .map(id => state.allBookings.find(b => (b.id || b.jobId) === id))
      .filter(Boolean);

    const incompatible = targetJobs.filter(j => !staffHasCapability(staff, j.serviceCategoryId || j.serviceCategory));
    if (incompatible.length > 0) {
      warnings.push(`${staff.name} lacks service capability for ${incompatible.length} selected booking(s).`);
    }

    const workloadMap = getStaffActiveWorkloadMap();
    const code = String(staff.staffCode || staff.id || '').toUpperCase();
    const load = workloadMap[code] || workloadMap[String(staff.id || '').toUpperCase()] || 0;
    if (load >= 4) {
      warnings.push(`${staff.name} already has ${load} active bookings assigned.`);
    }

    if (warnings.length > 0) {
      textEl.textContent = warnings.join(' ');
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  async function submitAssignModal(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const sid = state.assignModal.selectedStaffId;
    const errEl = document.getElementById('v2BkAssignError');
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
    if (!sid) {
      if (errEl) {
        errEl.textContent = 'Please select a staff member to assign.';
        errEl.hidden = false;
      }
      showToast('Please select a staff member to assign.', 'warning');
      return;
    }

    const api = window.CWP_ADMIN_V2.api;
    const submitBtn = document.getElementById('v2BkAssignSubmitBtn');
    const scheduledTime = (document.getElementById('v2BkAssignTime')?.value || '').trim();
    const reason = (document.getElementById('v2BkAssignReason')?.value || '').trim();

    state.isSubmitting = true;
    try {
      await api.withLoadingButton(submitBtn, async () => {
        let succeeded = 0;
        const errors = [];

        for (const jobId of state.assignModal.jobIds) {
          try {
            const payload = { jobId, newStaffId: sid };
            if (scheduledTime) payload.scheduledTime = scheduledTime;
            if (reason) payload.reason = reason;
            await api.request('reassignSpecialJob', payload);
            succeeded += 1;
          } catch (err) {
            console.error('[V2-Bookings] reassignSpecialJob failed:', err);
            errors.push(err.message || `Failed for ${jobId}`);
          }
        }

        if (succeeded > 0) {
          showToast(
            errors.length === 0
              ? `${succeeded} booking${succeeded === 1 ? '' : 's'} assigned successfully.`
              : `${succeeded} assigned, ${errors.length} failed: ${errors[0]}`,
            errors.length === 0 ? 'success' : 'warning'
          );
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2ModalAssignBooking');
          }
          state.checkedIds.clear();
          await loadData();
        } else {
          const msg = errors[0] || 'Assignment failed.';
          if (errEl) {
            errEl.textContent = msg;
            errEl.hidden = false;
          }
          showToast(msg, 'error');
        }
      });
    } finally {
      state.isSubmitting = false;
    }
  }

  async function handleUnassignJob(jobId) {
    if (state.isSubmitting) return;
    const api = window.CWP_ADMIN_V2.api;
    state.isSubmitting = true;
    try {
      await api.request('reassignSpecialJob', { jobId, unassign: true, reason: 'Unassigned by admin' });
      showToast('Booking unassigned.', 'success');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to unassign booking.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // CREATE BOOKING MODAL
  // -------------------------------------------------------------------------
  function openCreateModal() {
    const custSel = document.getElementById('v2BkCreateCustomer');
    if (custSel) {
      let opts = '<option value="">-- Select Customer --</option>';
      state.customers.forEach(c => {
        const cid = c.id || c.customerId;
        opts += `<option value="${escapeHtml(cid)}">${escapeHtml(c.customerName || 'Customer')} (${escapeHtml(c.customerNumber || c.phone || 'No Phone')})</option>`;
      });
      custSel.innerHTML = opts;
    }

    const staffSel = document.getElementById('v2BkCreateStaff');
    if (staffSel) {
      let opts = '<option value="">-- Leave Unassigned --</option>';
      state.staffList.filter(isStaffActive).forEach(s => {
        const sid = s.id || s.staffCode;
        opts += `<option value="${escapeHtml(sid)}">${escapeHtml(s.name)} (${escapeHtml(s.designationName || 'Staff')})</option>`;
      });
      staffSel.innerHTML = opts;
    }

    const dateInput = document.getElementById('v2BkCreateDate');
    if (dateInput && !dateInput.value) dateInput.value = getTodayIso();

    const pkgSel = document.getElementById('v2BkCreatePackage');
    if (pkgSel) pkgSel.innerHTML = '<option value="">No package (Pay per service)</option>';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalCreateBooking');
    }
  }

  async function refreshEligiblePackages() {
    const custId = document.getElementById('v2BkCreateCustomer')?.value;
    const catId = document.getElementById('v2BkCreateCategory')?.value;
    const pkgSel = document.getElementById('v2BkCreatePackage');
    if (!pkgSel) return;

    pkgSel.innerHTML = '<option value="">No package (Pay per service)</option>';
    if (!custId || !catId) return;

    try {
      const res = await window.CWP_ADMIN_V2.api.request('getEligiblePackagesForBooking', {
        customerId: custId,
        serviceCategoryId: catId
      });
      const pkgs = (res && res.eligiblePackages) || [];
      pkgs.forEach(p => {
        const rem = p.remaining_quantity != null ? p.remaining_quantity : p.remainingQuantity;
        pkgSel.innerHTML += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.package_name || p.packageName || p.package_code)} (${rem} left)</option>`;
      });
    } catch (e) {
      // Non-blocking if customer has no packages
    }
  }

  async function submitCreateModal(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const customerId = document.getElementById('v2BkCreateCustomer')?.value;
    const serviceCategoryId = document.getElementById('v2BkCreateCategory')?.value;
    const serviceType = (document.getElementById('v2BkCreateServiceType')?.value || '').trim();
    const scheduledDate = document.getElementById('v2BkCreateDate')?.value || '';
    const scheduledTime = (document.getElementById('v2BkCreateTime')?.value || '').trim();
    const staffId = document.getElementById('v2BkCreateStaff')?.value || '';
    const packageId = document.getElementById('v2BkCreatePackage')?.value || '';
    const specialInstructions = (document.getElementById('v2BkCreateNotes')?.value || '').trim();

    if (!customerId || !serviceType) {
      showToast('Customer and Service Type are required.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('v2BkCreateSubmitBtn');
    state.isSubmitting = true;
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        await window.CWP_ADMIN_V2.api.request('createServiceBooking', {
          bookingData: {
            customerId,
            serviceCategoryId,
            serviceType,
            scheduledDate: scheduledDate || null,
            scheduledTime: scheduledTime || null,
            staffId: staffId || null,
            packageId: packageId || null,
            specialInstructions: specialInstructions || null,
            bookingSource: 'admin'
          }
        });
        showToast('Booking created successfully.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalCreateBooking');
        }
        document.getElementById('v2BkCreateForm')?.reset();
        await loadData();
      });
    } catch (err) {
      showToast(err.message || 'Failed to create booking.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // CANCEL & UNABLE TO COMPLETE MODALS
  // -------------------------------------------------------------------------
  function openCancelModal(jobId) {
    state.cancelModal.jobId = jobId;
    const form = document.getElementById('v2BkCancelForm');
    if (form) form.reset();
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalCancelBooking');
    }
  }

  async function submitCancelModal(e) {
    e.preventDefault();
    if (state.isSubmitting || !state.cancelModal.jobId) return;

    const reason = (document.getElementById('v2BkCancelReason')?.value || '').trim();
    const remarks = (document.getElementById('v2BkCancelRemarks')?.value || '').trim();
    if (!reason) {
      showToast('Cancellation reason is required.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('v2BkCancelSubmitBtn');
    state.isSubmitting = true;
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        await window.CWP_ADMIN_V2.api.request('cancelBooking', {
          jobId: state.cancelModal.jobId,
          reason,
          remarks
        });
        showToast('Booking cancelled.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalCancelBooking');
        }
        await loadData();
      });
    } catch (err) {
      showToast(err.message || 'Failed to cancel booking.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  function openFailModal(jobId) {
    state.failModal.jobId = jobId;
    const form = document.getElementById('v2BkFailForm');
    if (form) form.reset();
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalFailBooking');
    }
  }

  async function submitFailModal(e) {
    e.preventDefault();
    if (state.isSubmitting || !state.failModal.jobId) return;

    const failureReason = (document.getElementById('v2BkFailReason')?.value || '').trim();
    const failureRemarks = (document.getElementById('v2BkFailRemarks')?.value || '').trim();
    if (!failureReason) {
      showToast('Reason is required.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('v2BkFailSubmitBtn');
    state.isSubmitting = true;
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        await window.CWP_ADMIN_V2.api.request('failServiceBooking', {
          jobId: state.failModal.jobId,
          failureReason,
          failureRemarks
        });
        showToast('Booking marked unable to complete.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalFailBooking');
        }
        await loadData();
      });
    } catch (err) {
      showToast(err.message || 'Failed to update booking.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // EVENT BINDINGS
  // -------------------------------------------------------------------------
  function bindToolbarEvents() {
    document.getElementById('v2BkBtnRefresh')?.addEventListener('click', () => loadData());
    document.getElementById('v2BkBtnNewBooking')?.addEventListener('click', () => openCreateModal());

    document.querySelectorAll('#v2BkKpiStrip .cwp-v2-bk-kpi-card').forEach(card => {
      card.addEventListener('click', () => {
        const kpi = card.getAttribute('data-kpi');
        if (kpi === 'total' || state.kpiFilter === kpi) {
          state.kpiFilter = null;
        } else {
          state.kpiFilter = kpi;
        }
        state.pagination.currentPage = 1;
        updateKpis();
        applyFiltersAndRender();
      });
    });

    const searchInput = document.getElementById('v2BkSearchInput');
    const searchClear = document.getElementById('v2BkSearchClear');
    let searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (searchClear) searchClear.classList.toggle('is-visible', Boolean(searchInput.value));
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = searchInput.value;
          state.pagination.currentPage = 1;
          applyFiltersAndRender();
        }, 160);
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

    const bindFilter = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        state.filters[key] = el.value;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    };
    bindFilter('v2BkFilterStatus', 'status');
    bindFilter('v2BkFilterService', 'service');
    bindFilter('v2BkFilterDate', 'date');
    bindFilter('v2BkFilterStaff', 'staff');
    bindFilter('v2BkFilterRoute', 'route');

    document.getElementById('v2BkResetFilters')?.addEventListener('click', () => {
      state.kpiFilter = null;
      state.searchQuery = '';
      state.filters = { status: 'all', service: 'all', date: '', staff: 'all', route: 'all' };
      if (searchInput) searchInput.value = '';
      if (searchClear) searchClear.classList.remove('is-visible');
      ['v2BkFilterStatus', 'v2BkFilterService', 'v2BkFilterStaff', 'v2BkFilterRoute'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
      });
      const dateEl = document.getElementById('v2BkFilterDate');
      if (dateEl) dateEl.value = '';
      state.pagination.currentPage = 1;
      updateKpis();
      applyFiltersAndRender();
    });

    document.getElementById('v2BkBulkAssignBtn')?.addEventListener('click', () => {
      openAssignModal(Array.from(state.checkedIds));
    });
    document.getElementById('v2BkBulkClearBtn')?.addEventListener('click', () => {
      state.checkedIds.clear();
      renderTable();
      updateBulkBar();
    });
  }

  function bindTableEvents() {
    document.querySelectorAll('#v2BkTable thead th.is-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort-col');
        if (state.sort.column === col) {
          state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.column = col;
          state.sort.direction = 'asc';
        }
        document.querySelectorAll('#v2BkTable thead th.is-sortable').forEach(h => {
          h.classList.toggle('is-sorted', h === th);
          const ic = h.querySelector('.cwp-v2-bk-sort-icon');
          if (ic) {
            ic.textContent = h === th ? (state.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
          }
        });
        applyFiltersAndRender();
      });
    });

    document.getElementById('v2BkSelectAll')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const { currentPage, pageSize } = state.pagination;
      const pageItems = state.filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      pageItems.forEach(b => {
        const id = b.id || b.jobId;
        if (checked) state.checkedIds.add(id);
        else state.checkedIds.delete(id);
      });
      renderTable();
      updateBulkBar();
    });

    const tbody = document.getElementById('v2BkTableBody');
    if (tbody) {
      tbody.addEventListener('change', (e) => {
        const cb = e.target.closest('.v2-bk-row-check');
        if (!cb) return;
        const jobId = cb.getAttribute('data-job-id');
        if (cb.checked) state.checkedIds.add(jobId);
        else state.checkedIds.delete(jobId);
        renderTable();
        updateBulkBar();
      });

      tbody.addEventListener('click', (e) => {
        const actBtn = e.target.closest('[data-bk-action]');
        if (actBtn) {
          const act = actBtn.getAttribute('data-bk-action');
          const jobId = actBtn.getAttribute('data-job-id');
          if (act === 'assign') openAssignModal([jobId]);
          else if (act === 'view') openDetail(jobId);
          return;
        }
        const row = e.target.closest('tr[data-job-id]');
        if (row) {
          openDetail(row.getAttribute('data-job-id'));
        }
      });
    }

    document.getElementById('v2BkPageSize')?.addEventListener('change', (e) => {
      state.pagination.pageSize = parseInt(e.target.value, 10) || 25;
      state.pagination.currentPage = 1;
      applyFiltersAndRender();
    });
    document.getElementById('v2BkPagePrev')?.addEventListener('click', () => {
      if (state.pagination.currentPage > 1) {
        state.pagination.currentPage -= 1;
        applyFiltersAndRender();
      }
    });
    document.getElementById('v2BkPageNext')?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.pagination.totalRecords / state.pagination.pageSize));
      if (state.pagination.currentPage < totalPages) {
        state.pagination.currentPage += 1;
        applyFiltersAndRender();
      }
    });
    document.getElementById('v2BkPageNumbers')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bk-page]');
      if (!btn) return;
      state.pagination.currentPage = parseInt(btn.getAttribute('data-bk-page'), 10) || 1;
      applyFiltersAndRender();
    });
  }

  function bindDetailEvents() {
    document.getElementById('v2BkDetailActions')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-detail-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-detail-act');
      const jobId = btn.getAttribute('data-job-id');
      if (act === 'assign') openAssignModal([jobId]);
      else if (act === 'unassign') handleUnassignJob(jobId);
      else if (act === 'cancel') openCancelModal(jobId);
      else if (act === 'fail') openFailModal(jobId);
    });
  }

  function bindAssignModalEvents() {
    document.getElementById('v2BkAssignStaffSearch')?.addEventListener('input', () => {
      renderAssignStaffRoster();
    });

    document.getElementById('v2BkAssignStaffBody')?.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-staff-id]');
      if (!row) return;
      state.assignModal.selectedStaffId = row.getAttribute('data-staff-id');
      const errEl = document.getElementById('v2BkAssignError');
      if (errEl) {
        errEl.textContent = '';
        errEl.hidden = true;
      }
      renderAssignStaffRoster();
      updateAssignWarningBanner();
    });

    document.getElementById('v2BkAssignStaffBody')?.addEventListener('change', (e) => {
      const radio = e.target.closest('input[name="v2BkAssignStaffRadio"]');
      if (!radio) return;
      state.assignModal.selectedStaffId = radio.value;
      const errEl = document.getElementById('v2BkAssignError');
      if (errEl) {
        errEl.textContent = '';
        errEl.hidden = true;
      }
      renderAssignStaffRoster();
      updateAssignWarningBanner();
    });

    document.getElementById('v2BkAssignForm')?.addEventListener('submit', submitAssignModal);
  }

  function bindCreateModalEvents() {
    document.getElementById('v2BkCreateCustomer')?.addEventListener('change', refreshEligiblePackages);
    document.getElementById('v2BkCreateCategory')?.addEventListener('change', refreshEligiblePackages);
    document.getElementById('v2BkCreateForm')?.addEventListener('submit', submitCreateModal);
  }

  function bindCancelFailModalEvents() {
    document.getElementById('v2BkCancelForm')?.addEventListener('submit', submitCancelModal);
    document.getElementById('v2BkFailForm')?.addEventListener('submit', submitFailModal);
  }

  window.CWP_ADMIN_V2.bookings = {
    init,
    loadData,
    openDetail,
    closeDetail,
    openAssignModal,
    openCreateModal,
    getState: () => state
  };
})(window);
