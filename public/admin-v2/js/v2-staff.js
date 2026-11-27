/**
 * =========================================================================
 * CWP ADMIN V2 — STAFF MANAGEMENT MODULE
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.staff.
 * English-only Admin UI, Material Symbols only, zero mocks, zero emojis.
 *
 * Capabilities:
 * - Live data from getStaffList, getDesignationsList, getAllRoutes,
 *   getAllCustomers, getDailyCleanReports, getSpecialJobs
 * - Split-view directory (36px compact rows) + dismissible Detail Panel
 * - 5 Detail Tabs: Overview, Assignments, Performance, Leave, Activity
 * - 5-Step Add Staff wizard & 4-Tab Edit Staff form with dirty-state guard
 * - Credential security: masked PIN, explicit revealStaffPin, resetStaffPin,
 *   unlockStaff, zero accidental PIN reset on edit
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = {
    allStaff: [],
    filteredStaff: [],
    selectedStaff: null,
    activeDetailTab: 'overview',
    designations: [],
    routes: [],
    customers: [],
    cleanReports: [],
    specialJobs: [],
    seeJobs: [],
    seeJobsLoadError: null,
    kpiFilter: null,
    searchQuery: '',
    filters: {
      status: 'all',
      designation: 'all',
      route: 'all'
    },
    sort: {
      column: 'id',
      direction: 'asc'
    },
    pagination: {
      currentPage: 1,
      pageSize: 25,
      totalRecords: 0
    },
    addWizard: {
      currentStep: 1
    },
    editForm: {
      currentTab: 'basic',
      staff: null,
      isDirty: false
    },
    isLoading: false,
    initialized: false
  };

  const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

  function isValidIndianPhone(phone) {
    if (!phone) return false;
    const clean = String(phone).replace(/\D/g, '');
    const num10 = clean.length > 10 ? clean.slice(-10) : clean;
    return INDIAN_PHONE_REGEX.test(num10);
  }

  function getCleanPhone10(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/\D/g, '');
    return clean.length > 10 ? clean.slice(-10) : clean;
  }

  function formatPhoneDisplay(phone) {
    if (!phone) return '—';
    const num10 = getCleanPhone10(phone);
    if (num10.length === 10) return `+91 ${num10.slice(0, 5)} ${num10.slice(5)}`;
    return phone;
  }

  function escapeHtml(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getInitials(name) {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function hasAuthToken() {
    const gate = document.getElementById('v2LoginGate');
    if (gate && !gate.hidden && gate.style.display !== 'none') return false;
    const token = (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getToken === 'function')
      ? window.CWP_ADMIN_V2.auth.getToken()
      : (sessionStorage.getItem('cwp_admin_token') || localStorage.getItem('cwp_admin_token') || '');
    return Boolean(token && token.trim());
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindToolbarEvents();
    bindTableEvents();
    bindWizardEvents();
    bindEditEvents();
    bindActionModalEvents();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail) {
        if (e.detail.tab === 'staff') {
          if (state.allStaff.length === 0 && hasAuthToken()) {
            loadData();
          }
        } else {
          if (window.CWP_ADMIN_V2.overlay) {
            ['v2ModalAddStaff', 'v2ModalEditStaff', 'v2ModalStaffAssignJob', 'v2ModalStaffChangeRoute', 'v2ModalStaffResetPin'].forEach(id => {
              window.CWP_ADMIN_V2.overlay.close(id, { pushHistory: false });
            });
          }
        }
      }
    });

    const viewEl = document.getElementById('v2View_staff');
    if (viewEl && viewEl.classList.contains('is-active') && hasAuthToken()) {
      loadData();
    }
  }

  // -------------------------------------------------------------------------
  // LIVE DATA LOADING & METRIC COMPUTATION
  // -------------------------------------------------------------------------
  async function loadData(forceRefresh = false) {
    if (state.isLoading || !hasAuthToken()) return;
    state.isLoading = true;

    const tbody = document.getElementById('v2StaffTableBody');
    if (tbody && state.allStaff.length === 0 && window.CWP_ADMIN_V2.ui) {
      window.CWP_ADMIN_V2.ui.renderSkeletonRows(tbody, 6, 8);
    }

    try {
      const api = window.CWP_ADMIN_V2.api;
      const todayIso = new Date().toISOString().split('T')[0];

      const [staffRes, desigRes, routesRes, custRes, reportsRes, jobsRes, seeJobsRes] = await Promise.allSettled([
        api.request('getStaffList'),
        api.request('getDesignationsList'),
        api.request('getAllRoutes'),
        api.request('getAllCustomers', { forceRefresh }),
        api.request('getDailyCleanReports', { date: todayIso }),
        api.request('getSpecialJobs'),
        fetch('/api/see/jobs?limit=200&offset=0', { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
          const body = await response.json();
          if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
          return body;
        })
      ]);

      if (staffRes.status === 'fulfilled' && Array.isArray(staffRes.value)) {
        state.allStaff = staffRes.value;
      } else {
        throw new Error((staffRes.reason && staffRes.reason.message) || 'Failed to load staff roster');
      }

      if (desigRes.status === 'fulfilled' && desigRes.value && Array.isArray(desigRes.value.designations || desigRes.value)) {
        state.designations = Array.isArray(desigRes.value) ? desigRes.value : desigRes.value.designations;
      }

      if (routesRes.status === 'fulfilled' && Array.isArray(routesRes.value)) {
        state.routes = routesRes.value;
      }

      if (custRes.status === 'fulfilled' && Array.isArray(custRes.value)) {
        state.customers = custRes.value.filter(c => !c.isLead && c.tag !== 'lead');
      }

      if (reportsRes.status === 'fulfilled' && reportsRes.value) {
        const rep = reportsRes.value;
        state.cleanReports = Array.isArray(rep) ? rep : (Array.isArray(rep.reports) ? rep.reports : []);
      }

      if (jobsRes.status === 'fulfilled' && jobsRes.value) {
        const jb = jobsRes.value;
        state.specialJobs = Array.isArray(jb) ? jb : (Array.isArray(jb.jobs) ? jb.jobs : []);
      }

      if (seeJobsRes.status === 'fulfilled' && seeJobsRes.value) {
        state.seeJobs = Array.isArray(seeJobsRes.value.jobs) ? seeJobsRes.value.jobs : [];
        state.seeJobsLoadError = null;
      } else {
        state.seeJobs = [];
        state.seeJobsLoadError = seeJobsRes.reason?.message || 'Canonical SEE assignments could not be loaded.';
      }

      enrichStaffMetrics();
      populateFilterDropdowns();
      populateFormDropdowns();
      updateKpis();
      applyFiltersAndSearch();

      if (state.selectedStaff) {
        const found = state.allStaff.find(s => s.id === state.selectedStaff.id);
        if (found) selectStaff(found.id);
        else closeDetailPanel();
      } else {
        closeDetailPanel();
      }
    } catch (err) {
      console.error('[StaffModule] Error loading staff data:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding: 36px 16px;">
              <div class="cwp-v2-empty-state-panel" role="alert">
                <span class="material-symbols-outlined cwp-v2-empty-state-icon" style="color:var(--cwp-v2-status-danger);">error_outline</span>
                <div class="cwp-v2-empty-state-title">Failed to load staff roster</div>
                <div class="cwp-v2-empty-state-desc">${escapeHtml(err.message || 'Please check your connection.')}</div>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" onclick="window.CWP_ADMIN_V2.staff.loadData(true)" style="margin-top:8px;">
                  <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                  <span>Retry</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }
      if (window.CWP_ADMIN_V2.toast) {
        window.CWP_ADMIN_V2.toast.error('Failed to load staff: ' + (err.message || 'Error'));
      }
    } finally {
      state.isLoading = false;
    }
  }

  function enrichStaffMetrics() {
    state.allStaff.forEach(s => {
      const codeUpper = String(s.id || '').toUpperCase();
      const dbId = s.dbId || s.id;

      // Assigned routes
      const myRoutes = state.routes.filter(r =>
        String(r.assigned_staff_id || r.staff_id || '') === String(dbId) ||
        String(r.assigned_staff_code || r.staff_code || '').toUpperCase() === codeUpper
      );
      s._assignedRoutes = myRoutes;
      s._routeDisplay = myRoutes.length > 0
        ? myRoutes.map(r => r.route_name || r.name).join(', ')
        : (s.operationalScope || s.teamName || 'Unassigned');

      // Assigned active DCC customers (Daily Target)
      const myCustomers = state.customers.filter(c =>
        String(c.staffId || '').toUpperCase() === codeUpper &&
        c.active !== 'No' && c.active !== false && !c.isStopped
      );
      s._assignedCustomers = myCustomers;
      s._dailyTarget = myCustomers.length;

      // Today's Clean Reports (Today's Progress)
      const myReports = state.cleanReports.filter(r =>
        String(r.staffId || r.staff_code || '').toUpperCase() === codeUpper ||
        String(r.staffDbId || r.staff_id || '') === String(dbId)
      );
      s._todayReports = myReports;
      s._completedToday = myReports.filter(r => {
        const st = String(r.status || '').toLowerCase();
        return st !== 'car_not_present' && st !== 'car not present' && st !== 'rejected';
      }).length;

      // Special jobs
      const myJobs = state.specialJobs.filter(j =>
        String(j.staffId || j.staff_code || '').toUpperCase() === codeUpper ||
        String(j.staff_id || '') === String(dbId)
      );
      s._specialJobs = myJobs;

      // Canonical SEE assignments/executions are a separate source from legacy
      // special jobs and DCC reports. Keep them separate to avoid double count.
      s._seeJobs = state.seeJobs.filter(j =>
        String(j.staff_id || '') === String(dbId) ||
        String(j.assigned_staff_code || j.staff_code || '').toUpperCase() === codeUpper
      );
    });
  }

  function updateKpis() {
    const list = state.allStaff;
    const total = list.length;
    const active = list.filter(s => s.isActive !== false && s.active !== 'No').length;
    const inactive = list.filter(s => s.isActive === false || s.active === 'No').length;
    const locked = list.filter(s => s.isLocked === true).length;

    const elTotal = document.getElementById('v2StaffKpiTotal');
    const elActive = document.getElementById('v2StaffKpiActive');
    const elInactive = document.getElementById('v2StaffKpiInactive');
    const elLocked = document.getElementById('v2StaffKpiLocked');

    if (elTotal) elTotal.textContent = total;
    if (elActive) elActive.textContent = active;
    if (elInactive) elInactive.textContent = inactive;
    if (elLocked) elLocked.textContent = locked;
  }

  function handleKpiClick(filterType) {
    document.querySelectorAll('.cwp-v2-staff-kpi-card').forEach(c => c.classList.remove('is-active'));
    if (state.kpiFilter === filterType) {
      state.kpiFilter = null;
    } else {
      state.kpiFilter = filterType;
      const card = document.querySelector(`.cwp-v2-staff-kpi-card[data-kpi="${filterType}"]`);
      if (card) card.classList.add('is-active');
    }
    applyFiltersAndSearch();
  }

  // -------------------------------------------------------------------------
  // SEARCH, FILTERING, SORTING & PAGINATION
  // -------------------------------------------------------------------------
  function applyFiltersAndSearch() {
    let result = [...state.allStaff];

    if (state.kpiFilter === 'active') {
      result = result.filter(s => s.isActive !== false && s.active !== 'No');
    } else if (state.kpiFilter === 'inactive') {
      result = result.filter(s => s.isActive === false || s.active === 'No');
    } else if (state.kpiFilter === 'locked') {
      result = result.filter(s => s.isLocked === true);
    }

    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      result = result.filter(s => {
        const name = (s.name || '').toLowerCase();
        const id = (s.id || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        const desig = (s.designationName || s.designationId || '').toLowerCase();
        const route = (s._routeDisplay || '').toLowerCase();
        return name.includes(q) || id.includes(q) || phone.includes(q) || desig.includes(q) || route.includes(q);
      });
    }

    if (state.filters.status === 'active') {
      result = result.filter(s => s.isActive !== false && s.active !== 'No');
    } else if (state.filters.status === 'inactive') {
      result = result.filter(s => s.isActive === false || s.active === 'No');
    } else if (state.filters.status === 'locked') {
      result = result.filter(s => s.isLocked === true);
    }

    if (state.filters.designation !== 'all') {
      result = result.filter(s => String(s.designationId || 'cleaner').toLowerCase() === state.filters.designation.toLowerCase());
    }

    if (state.filters.route !== 'all') {
      result = result.filter(s => (s._routeDisplay || '').toLowerCase().includes(state.filters.route.toLowerCase()));
    }

    const { column, direction } = state.sort;
    result.sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (column) {
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'id':
          valA = (a.id || '').toLowerCase();
          valB = (b.id || '').toLowerCase();
          break;
        case 'phone':
          valA = (a.phone || '').toLowerCase();
          valB = (b.phone || '').toLowerCase();
          break;
        case 'route':
          valA = (a._routeDisplay || '').toLowerCase();
          valB = (b._routeDisplay || '').toLowerCase();
          break;
        case 'target':
          valA = a._dailyTarget || 0;
          valB = b._dailyTarget || 0;
          break;
        case 'status':
          valA = a.isActive === false || a.active === 'No' ? 'inactive' : 'active';
          valB = b.isActive === false || b.active === 'No' ? 'inactive' : 'active';
          break;
        default:
          valA = (a.id || '').toLowerCase();
          valB = (b.id || '').toLowerCase();
      }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    state.filteredStaff = result;
    state.pagination.totalRecords = result.length;

    const maxPage = Math.max(1, Math.ceil(result.length / state.pagination.pageSize));
    if (state.pagination.currentPage > maxPage) state.pagination.currentPage = 1;

    renderTable();
    renderPagination();
  }

  function handleSort(colName) {
    if (state.sort.column === colName) {
      state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.column = colName;
      state.sort.direction = 'asc';
    }

    document.querySelectorAll('.cwp-v2-staff-table th.is-sortable').forEach(th => {
      const col = th.getAttribute('data-sort-col');
      const icon = th.querySelector('.cwp-v2-sort-icon');
      if (col === colName) {
        th.classList.add('is-sorted');
        th.setAttribute('aria-sort', state.sort.direction === 'asc' ? 'ascending' : 'descending');
        if (icon) icon.textContent = state.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
      } else {
        th.classList.remove('is-sorted');
        th.removeAttribute('aria-sort');
        if (icon) icon.textContent = 'unfold_more';
      }
    });

    applyFiltersAndSearch();
  }

  // -------------------------------------------------------------------------
  // DIRECTORY TABLE RENDERING
  // -------------------------------------------------------------------------
  function renderTable() {
    const tbody = document.getElementById('v2StaffTableBody');
    if (!tbody) return;

    const { currentPage, pageSize, totalRecords } = state.pagination;
    const startIndex = (currentPage - 1) * pageSize;
    const pageRecords = state.filteredStaff.slice(startIndex, startIndex + pageSize);

    if (totalRecords === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 36px 16px;">
            <div class="cwp-v2-empty-state-panel">
              <span class="material-symbols-outlined cwp-v2-empty-state-icon" style="font-size:32px;">badge</span>
              <div class="cwp-v2-empty-state-title" style="font-weight:600; margin-top:8px;">No matching staff members</div>
              <div class="cwp-v2-empty-state-desc" style="color:#64748b; font-size:12px;">Try adjusting your search or filter criteria.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    pageRecords.forEach(s => {
      const isSelected = state.selectedStaff && state.selectedStaff.id === s.id;
      const selectedClass = isSelected ? 'is-selected' : '';
      const name = escapeHtml(s.name || 'Unnamed');
      const desig = escapeHtml(s.designationName || 'Cleaner');
      const staffCode = escapeHtml(s.id || '—');
      const phoneDisplay = formatPhoneDisplay(s.phone);
      const cleanPhone = getCleanPhone10(s.phone);
      const routeDisplay = escapeHtml(s._routeDisplay || 'Unassigned');
      const target = s._dailyTarget || 0;
      const completed = s._completedToday || 0;
      const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;

      const isActive = s.isActive !== false && s.active !== 'No';
      let statusBadge = '';
      if (s.isLocked) {
        statusBadge = `<span class="cwp-v2-badge is-warning" style="font-size:10px;">Locked</span>`;
      } else if (isActive) {
        statusBadge = `<span class="cwp-v2-badge is-success" style="font-size:10px;">Active</span>`;
      } else {
        statusBadge = `<span class="cwp-v2-badge is-danger" style="font-size:10px;">Inactive</span>`;
      }

      html += `
        <tr class="${selectedClass}" data-staff-id="${staffCode}" tabindex="0">
          <td>
            <div class="cwp-v2-staff-cell-name">
              <span class="cwp-v2-staff-name-main">${name}</span>
              <span class="cwp-v2-staff-name-sub">• ${desig}</span>
            </div>
          </td>
          <td><span class="cwp-v2-staff-code-pill">${staffCode}</span></td>
          <td><span style="font-family:monospace; font-weight:500;">${phoneDisplay}</span></td>
          <td><span style="font-size:11.5px; color:#475569;">${routeDisplay}</span></td>
          <td><span style="font-weight:600;">${target} stops</span></td>
          <td>
            <div class="cwp-v2-staff-mini-progress">
              <span>${completed}/${target}</span>
              <div class="cwp-v2-staff-mini-bar">
                <div class="cwp-v2-staff-mini-fill" style="width:${pct}%;"></div>
              </div>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="cwp-v2-staff-row-actions">
              <button type="button" class="cwp-v2-staff-action-btn" data-action="view" data-id="${staffCode}" title="View Details">
                <span class="material-symbols-outlined">visibility</span>
              </button>
              <button type="button" class="cwp-v2-staff-action-btn" data-action="edit" data-id="${staffCode}" title="Edit Staff">
                <span class="material-symbols-outlined">edit</span>
              </button>
              ${cleanPhone ? `
                <a href="tel:${cleanPhone}" class="cwp-v2-staff-action-btn" title="Call ${phoneDisplay}">
                  <span class="material-symbols-outlined">call</span>
                </a>
                <a href="https://wa.me/91${cleanPhone}" target="_blank" rel="noopener" class="cwp-v2-staff-action-btn" title="WhatsApp">
                  <span class="material-symbols-outlined" style="color:#16a34a;">chat</span>
                </a>
              ` : ''}
              <button type="button" class="cwp-v2-staff-action-btn" data-action="assignJob" data-id="${staffCode}" title="Assign Job">
                <span class="material-symbols-outlined">assignment_ind</span>
              </button>
              <button type="button" class="cwp-v2-staff-action-btn" data-action="resetPin" data-id="${staffCode}" title="Reset PIN">
                <span class="material-symbols-outlined">pin</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function renderPagination() {
    const { currentPage, pageSize, totalRecords } = state.pagination;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(totalRecords, currentPage * pageSize);

    const infoEl = document.getElementById('v2StaffPageInfo');
    if (infoEl) infoEl.textContent = `Showing ${startRecord}–${endRecord} of ${totalRecords} staff members`;

    const prevBtn = document.getElementById('v2StaffPagePrev');
    const nextBtn = document.getElementById('v2StaffPageNext');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    const btnsContainer = document.getElementById('v2StaffPageNumbers');
    if (btnsContainer) {
      let btnsHtml = '';
      const startP = Math.max(1, currentPage - 2);
      const endP = Math.min(totalPages, currentPage + 2);
      for (let p = startP; p <= endP; p++) {
        btnsHtml += `<button type="button" class="cwp-v2-staff-page-btn ${p === currentPage ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
      }
      btnsContainer.innerHTML = btnsHtml;
    }
  }

  // -------------------------------------------------------------------------
  // DISMISSIBLE STAFF DETAIL PANEL & 5 DETAIL TABS
  // -------------------------------------------------------------------------
  function closeDetailPanel() {
    state.selectedStaff = null;
    const splitView = document.getElementById('v2StaffSplitView');
    if (splitView) splitView.classList.add('is-detail-closed');
    document.querySelectorAll('#v2StaffTableBody tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
  }

  function selectStaff(staffId) {
    const found = state.allStaff.find(s => String(s.id).toUpperCase() === String(staffId).toUpperCase());
    if (!found) return;

    state.selectedStaff = found;
    const splitView = document.getElementById('v2StaffSplitView');
    if (splitView) splitView.classList.remove('is-detail-closed');

    document.querySelectorAll('#v2StaffTableBody tr').forEach(tr => {
      if (String(tr.getAttribute('data-staff-id')).toUpperCase() === String(staffId).toUpperCase()) {
        tr.classList.add('is-selected');
        tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        tr.classList.remove('is-selected');
      }
    });

    renderDetailHeader(found);
    renderDetailTabContent(found, state.activeDetailTab);
  }

  function switchDetailTab(tabName) {
    state.activeDetailTab = tabName;
    document.querySelectorAll('.cwp-v2-staff-detail-tab-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-staff-detail-tab') === tabName);
    });
    if (state.selectedStaff) {
      renderDetailTabContent(state.selectedStaff, tabName);
    }
  }

  function renderDetailHeader(s) {
    const hdr = document.getElementById('v2StaffDetailHeader');
    if (!hdr) return;

    const name = escapeHtml(s.name || 'Unnamed');
    const desig = escapeHtml(s.designationName || 'Cleaner');
    const code = escapeHtml(s.id || '—');
    const cleanPhone = getCleanPhone10(s.phone);
    const isActive = s.isActive !== false && s.active !== 'No';
    const statusBadge = s.isLocked
      ? `<span class="cwp-v2-badge is-warning" style="font-size:10px;">Locked</span>`
      : (isActive
          ? `<span class="cwp-v2-badge is-success" style="font-size:10px;">Active</span>`
          : `<span class="cwp-v2-badge is-danger" style="font-size:10px;">Inactive</span>`);

    hdr.innerHTML = `
      <div class="cwp-v2-staff-detail-title-box">
        <div class="cwp-v2-staff-avatar">${getInitials(s.name)}</div>
        <div>
          <h2 class="cwp-v2-staff-detail-name">${name}</h2>
          <div class="cwp-v2-staff-detail-sub">
            <span class="cwp-v2-staff-code-pill">${code}</span>
            <span>${desig}</span>
            ${statusBadge}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:2px;">
        ${cleanPhone ? `
          <a href="tel:${cleanPhone}" class="cwp-v2-staff-action-btn" title="Call ${formatPhoneDisplay(s.phone)}">
            <span class="material-symbols-outlined">call</span>
          </a>
          <a href="https://wa.me/91${cleanPhone}" target="_blank" rel="noopener" class="cwp-v2-staff-action-btn" title="WhatsApp">
            <span class="material-symbols-outlined" style="color:#16a34a;">chat</span>
          </a>
        ` : ''}
        <button type="button" class="cwp-v2-staff-action-btn" id="v2StaffBtnEdit" title="Edit Staff">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <div style="position:relative; display:inline-block;">
          <button type="button" class="cwp-v2-staff-action-btn" id="v2StaffBtnOverflow" title="More Actions">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          <div id="v2StaffOverflowMenu" style="display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 4px 10px rgba(0,0,0,0.12); z-index:20; min-width:170px; padding:4px 0;">
            <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; justify-content:flex-start; border-radius:0;" id="v2StaffOfResetPin">
              <span class="material-symbols-outlined" style="font-size:16px;">pin</span>
              <span>Reset 6-Digit PIN</span>
            </button>
            ${s.isLocked ? `
              <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; justify-content:flex-start; border-radius:0; color:#d97706;" id="v2StaffOfUnlock">
                <span class="material-symbols-outlined" style="font-size:16px;">lock_open</span>
                <span>Unlock Account</span>
              </button>
            ` : ''}
            <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; justify-content:flex-start; border-radius:0;" id="v2StaffOfToggleActive">
              <span class="material-symbols-outlined" style="font-size:16px;">${isActive ? 'pause_circle' : 'play_circle'}</span>
              <span>${isActive ? 'Deactivate Staff' : 'Activate Staff'}</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; justify-content:flex-start; border-radius:0; color:#dc2626;" id="v2StaffOfDelete">
              <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
              <span>Delete Staff</span>
            </button>
          </div>
        </div>
        <button type="button" class="cwp-v2-staff-action-btn" id="v2StaffBtnCloseDetail" title="Close details" aria-label="Close staff details">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
    `;

    // Bind header events
    document.getElementById('v2StaffBtnCloseDetail')?.addEventListener('click', closeDetailPanel);
    document.getElementById('v2StaffBtnEdit')?.addEventListener('click', () => openEditStaffModal(s));

    const ofBtn = document.getElementById('v2StaffBtnOverflow');
    const ofMenu = document.getElementById('v2StaffOverflowMenu');
    if (ofBtn && ofMenu) {
      ofBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ofMenu.style.display = ofMenu.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', () => { ofMenu.style.display = 'none'; });
    }

    document.getElementById('v2StaffOfResetPin')?.addEventListener('click', () => openResetPinModal(s));
    document.getElementById('v2StaffOfUnlock')?.addEventListener('click', () => unlockStaffAccount(s));
    document.getElementById('v2StaffOfToggleActive')?.addEventListener('click', () => toggleStaffStatus(s));
    document.getElementById('v2StaffOfDelete')?.addEventListener('click', () => deleteStaffConfirm(s));

    // Bind 4 persistent footer quick actions
    const qaAssign = document.getElementById('v2StaffQaAssignJob');
    const qaRoute = document.getElementById('v2StaffQaChangeRoute');
    const qaLeave = document.getElementById('v2StaffQaMarkLeave');
    const qaMore = document.getElementById('v2StaffQaMore');

    if (qaAssign) qaAssign.onclick = () => openAssignJobModal(s);
    if (qaRoute) qaRoute.onclick = () => openChangeRouteModal(s);
    if (qaLeave) qaLeave.onclick = () => toggleStaffStatus(s);
    if (qaMore) qaMore.onclick = (e) => {
      e.stopPropagation();
      if (ofMenu) ofMenu.style.display = ofMenu.style.display === 'none' ? 'block' : 'none';
    };
  }

  function renderDetailTabContent(s, tab) {
    const body = document.getElementById('v2StaffDetailScroll');
    if (!body) return;

    const target = s._dailyTarget || 0;
    const completed = s._completedToday || 0;
    const remaining = Math.max(0, target - completed);
    const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;

    if (tab === 'overview') {
      const caps = Array.isArray(s.serviceCapabilities) ? s.serviceCapabilities.map(c => c.replace(/_/g, ' ')).join(', ') : 'Daily Car Cleaning';
      body.innerHTML = `
        <div class="cwp-v2-staff-summary-grid">
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Staff ID</span>
            <span class="cwp-v2-staff-summary-val" style="font-family:monospace;">${escapeHtml(s.id)}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Joining Date</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s.dateOfJoining || 'Not recorded')}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Designation (Level ${s.designationLevel || 1})</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s.designationName || 'Cleaner')}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Supervisor</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s.reportsToName || 'Direct / Operations')}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Zone / Route</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s._routeDisplay || 'Unassigned')}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Weekly Off</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s.weeklyOff || 'Not set')}</span>
          </div>
          <div class="cwp-v2-staff-summary-item" style="grid-column:1 / -1;">
            <span class="cwp-v2-staff-summary-label">Service Capabilities (${escapeHtml(s.workType || 'dcc_only')})</span>
            <span class="cwp-v2-staff-summary-val" style="text-transform:capitalize; font-weight:500;">${escapeHtml(caps)}</span>
          </div>
        </div>

        <div>
          <div class="cwp-v2-staff-section-title">
            <span>Today's Work Progress</span>
            <span>${pct}%</span>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
              <span>Completed: <strong>${completed}</strong> / ${target}</span>
              <span style="color:#64748b;">Remaining: ${remaining}</span>
            </div>
            <div class="cwp-v2-staff-mini-bar" style="width:100%; height:7px;">
              <div class="cwp-v2-staff-mini-fill" style="width:${pct}%;"></div>
            </div>
          </div>
        </div>

        <div>
          <div class="cwp-v2-staff-section-title">
            <span>Credentials &amp; Access Security</span>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Login PIN: <strong id="v2StaffMaskedPin" style="font-family:monospace;">••••••</strong></span>
              <div style="display:flex; gap:6px;">
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-xs" id="v2StaffBtnRevealPin">Reveal PIN</button>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-xs" id="v2StaffBtnQuickResetPin">Reset</button>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; color:#64748b; font-size:11px;">
              <span>Session: ${s.hasActiveSession ? 'Active on ' + escapeHtml(s.activeDeviceId || 'device') : 'No active session'}</span>
              <span>Failed attempts: ${s.failedAttempts || 0}</span>
            </div>
          </div>
        </div>
      `;

      document.getElementById('v2StaffBtnRevealPin')?.addEventListener('click', () => revealStaffPin(s));
      document.getElementById('v2StaffBtnQuickResetPin')?.addEventListener('click', () => openResetPinModal(s));

    } else if (tab === 'assignments') {
      const custList = s._assignedCustomers || [];
      const routeList = s._assignedRoutes || [];
      body.innerHTML = `
        <div class="cwp-v2-staff-section-title">
          <span>Assigned Routes (${routeList.length})</span>
        </div>
        ${routeList.length > 0 ? routeList.map(r => `
          <div style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; display:flex; justify-content:space-between;">
            <strong>${escapeHtml(r.route_name || r.name)}</strong>
            <span style="color:#64748b;">${escapeHtml(r.zone_name || r.area || '')}</span>
          </div>
        `).join('') : '<div style="font-size:12px; color:#64748b;">No dedicated route assigned.</div>'}

        <div class="cwp-v2-staff-section-title" style="margin-top:8px;">
          <span>Assigned Daily Clean Customers (${custList.length})</span>
        </div>
        ${custList.length > 0 ? custList.slice(0, 20).map(c => `
          <div style="padding:7px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
            <div style="font-weight:600;">${escapeHtml(c.customerName || c.name)}</div>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(c.vehicle || 'No vehicle')} • ${escapeHtml(c.address || '')}</div>
          </div>
        `).join('') : '<div style="font-size:12px; color:#64748b;">No active DCC customers assigned.</div>'}

        <div class="cwp-v2-staff-section-title" style="margin-top:8px;">
          <span>Canonical SEE Jobs (${(s._seeJobs || []).length})</span>
        </div>
        ${(s._seeJobs || []).length ? s._seeJobs.slice(0, 20).map(job => `
          <div style="padding:7px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; margin-bottom:5px;">
            <div style="font-weight:600;">${escapeHtml(job.service_name_snapshot || job.service_type || 'Service job')} · ${escapeHtml(job.status || 'unknown')}</div>
            <div style="font-size:11px; color:#64748b;">${escapeHtml(job.customer_name || 'Customer')} · ${escapeHtml(job.scheduled_date || 'Unscheduled')} · Job ${escapeHtml(job.id)}</div>
          </div>
        `).join('') : '<div style="font-size:12px; color:#64748b;">No canonical SEE jobs assigned.</div>'}
      `;

    } else if (tab === 'performance') {
      const reports = s._todayReports || [];
      const withPhoto = reports.filter(r => Boolean(r.photoUrl || r.photo_url)).length;
      const jobs = s._specialJobs || [];
      const jobsDone = jobs.filter(j => String(j.status || '').toLowerCase() === 'completed').length;
      const seeJobs = s._seeJobs || [];
      const seeDone = seeJobs.filter(j => String(j.status || '').toLowerCase() === 'completed').length;
      const seeWithProof = seeJobs.filter(j => {
        const proof = j.latest_proof_photos || {};
        return (Array.isArray(proof.before) && proof.before.length) || (Array.isArray(proof.after) && proof.after.length);
      }).length;

      body.innerHTML = `
        <div class="cwp-v2-staff-summary-grid">
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Today's Completion</span>
            <span class="cwp-v2-staff-summary-val">${pct}% (${completed}/${target})</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Photo Proof Submitted</span>
            <span class="cwp-v2-staff-summary-val">${withPhoto} of ${reports.length}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Special Jobs Assigned</span>
            <span class="cwp-v2-staff-summary-val">${jobs.length}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Special Jobs Completed</span>
            <span class="cwp-v2-staff-summary-val">${jobsDone}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Canonical SEE Jobs</span>
            <span class="cwp-v2-staff-summary-val">${seeDone} completed · ${seeJobs.length} assigned</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">SEE Jobs with Photo Proof</span>
            <span class="cwp-v2-staff-summary-val">${seeWithProof} of ${seeJobs.length}</span>
          </div>
        </div>
        <div style="font-size:11px; color:#64748b; padding:6px 2px;">
          DCC, legacy special-job, and canonical SEE records are shown from separate sources to avoid double counting.${state.seeJobsLoadError ? ` SEE data unavailable: ${escapeHtml(state.seeJobsLoadError)}` : ''}
        </div>
      `;

    } else if (tab === 'leave') {
      const isActive = s.isActive !== false && s.active !== 'No';
      body.innerHTML = `
        <div class="cwp-v2-staff-summary-grid">
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Availability Status</span>
            <span class="cwp-v2-staff-summary-val">${isActive ? 'Active / Available' : 'Inactive / On Leave'}</span>
          </div>
          <div class="cwp-v2-staff-summary-item">
            <span class="cwp-v2-staff-summary-label">Weekly Off</span>
            <span class="cwp-v2-staff-summary-val">${escapeHtml(s.weeklyOff || 'Not configured')}</span>
          </div>
        </div>
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px; font-size:12px; color:#92400e;">
          <strong>Backend Capability Notice:</strong> A dedicated historical leave/attendance ledger is not yet present in the backend schema. Use <strong>Mark Leave / Status</strong> below to toggle active availability via <code>toggleStaffActive</code>.
        </div>
      `;

    } else if (tab === 'activity') {
      const events = [];
      if (s.createdAt) {
        events.push({ icon: 'person_add', color: '#2563eb', title: 'Staff Profile Created', time: new Date(s.createdAt).toLocaleString('en-IN') });
      }
      if (s.hasActiveSession) {
        events.push({ icon: 'devices', color: '#16a34a', title: `Active Staff Portal Session (${escapeHtml(s.activeDeviceId || 'mobile')})`, time: 'Currently active' });
      }
      (s._todayReports || []).slice(0, 8).forEach(r => {
        events.push({
          icon: 'check_circle',
          color: '#16a34a',
          title: `Daily Clean: ${escapeHtml(r.customerName || r.vehicle || 'Customer')} (${escapeHtml(r.status || 'completed')})`,
          time: r.cleanedAt || r.createdAt || 'Today'
        });
      });
      (s._seeJobs || []).slice(0, 12).forEach(job => {
        const proof = job.latest_proof_photos || {};
        const beforeCount = Array.isArray(proof.before) ? proof.before.length : 0;
        const afterCount = Array.isArray(proof.after) ? proof.after.length : 0;
        events.push({
          icon: job.status === 'completed' ? 'check_circle' : 'event_note',
          color: job.status === 'completed' ? '#16a34a' : '#2563eb',
          title: `SEE: ${escapeHtml(job.service_name_snapshot || job.service_type || 'Service job')} · ${escapeHtml(job.status || 'unknown')}`,
          time: `${escapeHtml(job.scheduled_date || 'Unscheduled')} · ${beforeCount} before / ${afterCount} after proof${job.latest_execution_id ? ` · Execution ${escapeHtml(job.latest_execution_id)}` : ''}`
        });
      });

      body.innerHTML = events.length > 0 ? events.map(ev => `
        <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 0; border-bottom:1px dotted #e2e8f0; font-size:12px;">
          <span class="material-symbols-outlined" style="font-size:16px; color:${ev.color}; margin-top:1px;">${ev.icon}</span>
          <div>
            <div style="font-weight:500; color:#1e293b;">${ev.title}</div>
            <div style="font-size:11px; color:#94a3b8;">${escapeHtml(ev.time)}</div>
          </div>
        </div>
      `).join('') : '<div style="font-size:12px; color:#64748b;">No recent activity recorded for this staff member.</div>';
    }
  }

  // -------------------------------------------------------------------------
  // CREDENTIAL SECURITY ACTIONS
  // -------------------------------------------------------------------------
  async function revealStaffPin(s) {
    const el = document.getElementById('v2StaffMaskedPin');
    if (!el) return;
    if (el.dataset.revealed === '1') {
      el.textContent = '••••••';
      el.dataset.revealed = '0';
      return;
    }
    try {
      const res = await window.CWP_ADMIN_V2.api.request('revealStaffPin', { staffId: s.id });
      const pin = (res && (res.pin || res.displayPin)) || s.displayPin || 'Protected';
      el.textContent = pin;
      el.dataset.revealed = '1';
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Unable to reveal PIN');
    }
  }

  function openResetPinModal(s) {
    document.getElementById('v2StaffResetPinId').value = s.id;
    document.getElementById('v2StaffResetPinName').textContent = `${s.name} (${s.id})`;
    document.getElementById('v2StaffNewPinInput').value = '';
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2ModalStaffResetPin');
  }

  async function submitResetPin() {
    const staffId = document.getElementById('v2StaffResetPinId').value;
    const newPin = document.getElementById('v2StaffNewPinInput').value.trim();
    if (!/^\d{6}$/.test(newPin)) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('PIN must be exactly 6 numeric digits.');
      return;
    }
    const btn = document.getElementById('v2BtnSubmitStaffResetPin');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('resetStaffPin', { staffId, newPin });
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success(`6-digit PIN updated for ${staffId}.`);
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalStaffResetPin');
        await loadData(true);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'PIN reset failed');
    }
  }

  async function unlockStaffAccount(s) {
    if (!confirm(`Unlock login access and clear rate limits for ${s.name} (${s.id})?`)) return;
    try {
      await window.CWP_ADMIN_V2.api.request('unlockStaff', { staffId: s.id });
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success(`${s.name} unlocked.`);
      await loadData(true);
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Unlock failed');
    }
  }

  // -------------------------------------------------------------------------
  // OPERATIONAL ACTIONS (Assign Job, Change Route, Toggle Status, Delete)
  // -------------------------------------------------------------------------
  function openAssignJobModal(s) {
    document.getElementById('v2StaffAssignJobId').value = s.id;
    document.getElementById('v2StaffAssignJobName').textContent = `${s.name} (${s.id})`;
    const custSel = document.getElementById('v2StaffAssignCustomerSelect');
    if (custSel) {
      custSel.innerHTML = '<option value="">Select Customer</option>' + state.customers.map(c =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml(c.customerName || c.name)} (${escapeHtml(c.phone || '')})</option>`
      ).join('');
    }
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2ModalStaffAssignJob');
  }

  async function submitStaffAssignJob() {
    const staffId = document.getElementById('v2StaffAssignJobId').value;
    const customerId = document.getElementById('v2StaffAssignCustomerSelect').value;
    if (!customerId) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Please select a customer.');
      return;
    }
    const btn = document.getElementById('v2BtnSubmitStaffAssignJob');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('assignDailyCleanCustomer', { customerId, staffId });
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success('Customer assigned to staff schedule.');
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalStaffAssignJob');
        await loadData(true);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Assignment failed');
    }
  }

  function openChangeRouteModal(s) {
    document.getElementById('v2StaffChangeRouteStaffId').value = s.dbId || s.id;
    document.getElementById('v2StaffChangeRouteStaffName').textContent = `${s.name} (${s.id})`;
    const rSel = document.getElementById('v2StaffChangeRouteSelect');
    if (rSel) {
      rSel.innerHTML = '<option value="">Select Route</option>' + state.routes.map(r =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.route_name || r.name)}</option>`
      ).join('');
    }
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2ModalStaffChangeRoute');
  }

  async function submitChangeRoute() {
    const staffId = document.getElementById('v2StaffChangeRouteStaffId').value;
    const routeId = document.getElementById('v2StaffChangeRouteSelect').value;
    if (!routeId) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Please select a route.');
      return;
    }
    const btn = document.getElementById('v2BtnSubmitStaffChangeRoute');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('assignStaffToRoute', { routeId, staffId });
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success('Staff assigned to route.');
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalStaffChangeRoute');
        await loadData(true);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Route assignment failed');
    }
  }

  async function toggleStaffStatus(s) {
    const isActive = s.isActive !== false && s.active !== 'No';
    const nextActive = !isActive;
    if (!confirm(`Are you sure you want to ${nextActive ? 'activate' : 'mark inactive / on leave'} for ${s.name} (${s.id})?`)) return;
    try {
      await window.CWP_ADMIN_V2.api.request('toggleStaffActive', { staffId: s.id, active: nextActive });
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success(`${s.name} marked ${nextActive ? 'Active' : 'Inactive'}.`);
      await loadData(true);
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Status update failed');
    }
  }

  async function deleteStaffConfirm(s) {
    const check = window.prompt(`Type "DELETE" to confirm removing staff member ${s.name} (${s.id}):`);
    if (!check || check.trim().toUpperCase() !== 'DELETE') return;
    try {
      await window.CWP_ADMIN_V2.api.request('deleteStaffMember', { id: s.id });
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success(`Staff ${s.name} deleted.`);
      closeDetailPanel();
      await loadData(true);
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Delete failed');
    }
  }

  // -------------------------------------------------------------------------
  // ADD STAFF — 5-STEP GUIDED WIZARD
  // -------------------------------------------------------------------------
  function openAddStaffModal() {
    state.addWizard.currentStep = 1;
    const form = document.getElementById('v2AddStaffForm');
    if (form) form.reset();
    const wtSelect = document.getElementById('v2AddStaffWorkType');
    if (wtSelect) wtSelect.value = 'dcc_only';
    renderStaffCapabilities('add', 'dcc_only', ['daily_car_cleaning']);
    goToAddStaffStep(1);
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2ModalAddStaff');
  }

  function goToAddStaffStep(stepNum) {
    if (stepNum < 1 || stepNum > 5) return;
    if (stepNum > state.addWizard.currentStep && !validateAddStaffStep(state.addWizard.currentStep)) return;
    state.addWizard.currentStep = stepNum;

    document.querySelectorAll('#v2ModalAddStaff .cwp-v2-wizard-step').forEach(s => {
      const n = parseInt(s.getAttribute('data-step'), 10);
      s.classList.remove('is-active', 'is-completed');
      if (n === stepNum) s.classList.add('is-active');
      else if (n < stepNum) s.classList.add('is-completed');
    });

    document.querySelectorAll('#v2ModalAddStaff .cwp-v2-wizard-pane').forEach(p => {
      p.classList.toggle('is-active', parseInt(p.getAttribute('data-step-pane'), 10) === stepNum);
    });

    const prevBtn = document.getElementById('v2StaffWizPrev');
    const nextBtn = document.getElementById('v2StaffWizNext');
    const subBtn = document.getElementById('v2StaffWizSubmit');
    if (prevBtn) prevBtn.style.display = stepNum === 1 ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.style.display = stepNum === 5 ? 'none' : 'inline-flex';
    if (subBtn) subBtn.style.display = stepNum === 5 ? 'inline-flex' : 'none';

    if (stepNum === 5) populateStaffReview();
  }

  function validateAddStaffStep(step) {
    let ok = true;
    if (step === 1) {
      const name = document.getElementById('v2AddStaffName')?.value.trim();
      const phone = document.getElementById('v2AddStaffPhone')?.value.trim();
      if (!name) {
        setFieldErr('v2AddStaffNameField', 'Full name is required.');
        ok = false;
      } else setFieldErr('v2AddStaffNameField', '');

      if (!isValidIndianPhone(phone)) {
        setFieldErr('v2AddStaffPhoneField', 'Valid 10-digit Indian mobile required (6-9).');
        ok = false;
      } else setFieldErr('v2AddStaffPhoneField', '');
    } else if (step === 2) {
      const pin = document.getElementById('v2AddStaffPin')?.value.trim();
      if (!/^\d{6}$/.test(pin || '')) {
        setFieldErr('v2AddStaffPinField', '6-digit numeric PIN is mandatory for new staff.');
        ok = false;
      } else setFieldErr('v2AddStaffPinField', '');
    } else if (step === 4) {
      const wt = document.getElementById('v2AddStaffWorkType')?.value || 'dcc_only';
      const capVal = validateStaffModalCapabilities('add', wt);
      if (!capVal.ok) {
        ok = false;
      }
    }
    return ok;
  }

  function setFieldErr(fieldId, msg) {
    const f = document.getElementById(fieldId);
    if (!f) return;
    f.classList.toggle('has-error', Boolean(msg));
    const err = f.querySelector('.cwp-v2-field-error');
    if (err) err.textContent = msg || '';
  }

  // -------------------------------------------------------------------------
  // WORK TYPE & SERVICE CAPABILITIES CONFIGURATION
  // -------------------------------------------------------------------------
  const CAPABILITY_CATALOG = [
    { id: 'daily_car_cleaning', label: 'Daily Car Cleaning', icon: 'directions_car' },
    { id: 'car_washing', label: 'Car Washing', icon: 'local_car_wash' },
    { id: 'solar_cleaning', label: 'Solar Panel Cleaning', icon: 'solar_power' },
    { id: 'interior_detailing', label: 'Interior Detailing', icon: 'airline_seat_recline_extra' },
    { id: 'exterior_detailing', label: 'Exterior Detailing', icon: 'auto_awesome' }
  ];

  const WORK_TYPE_CONFIG = {
    dcc_only: {
      name: 'Daily Car Cleaning Only (DCC)',
      themeClass: 'is-dcc',
      desc: 'Staff is dedicated exclusively to daily subscription car cleaning routes. On-demand specialized service jobs are not permitted.',
      hint: 'Daily Car Cleaning is locked (mandatory)',
      allowedCaps: ['daily_car_cleaning'],
      mandatoryCaps: ['daily_car_cleaning']
    },
    services_only: {
      name: 'On-Demand Services Only',
      themeClass: 'is-services',
      desc: 'Staff is authorized exclusively for specialized on-demand service bookings. Excluded from Daily Car Cleaning subscription routes.',
      hint: 'Select at least 1 service capability',
      allowedCaps: ['car_washing', 'solar_cleaning', 'interior_detailing', 'exterior_detailing'],
      mandatoryCaps: []
    },
    dcc_and_services: {
      name: 'DCC + On-Demand Services',
      themeClass: 'is-combo',
      desc: 'Staff is authorized for daily car cleaning routes plus selected on-demand service jobs.',
      hint: 'DCC is mandatory. Select at least 1 additional service capability.',
      allowedCaps: ['daily_car_cleaning', 'car_washing', 'solar_cleaning', 'interior_detailing', 'exterior_detailing'],
      mandatoryCaps: ['daily_car_cleaning']
    }
  };

  function getStaffModalSelectedCaps(context, workType) {
    const wt = workType || (context === 'add' ? document.getElementById('v2AddStaffWorkType')?.value : document.getElementById('v2EditStaffWorkType')?.value) || 'dcc_only';
    const cfg = WORK_TYPE_CONFIG[wt] || WORK_TYPE_CONFIG.dcc_only;

    if (wt === 'dcc_only') {
      return ['daily_car_cleaning'];
    }

    const inputName = context === 'add' ? 'addStaffCap' : 'editStaffCap';
    const gridId = context === 'add' ? 'v2AddStaffCapGrid' : 'v2EditStaffCapGrid';
    const checked = Array.from(document.querySelectorAll(`#${gridId} input[name="${inputName}"]:checked`)).map(el => el.value);

    // If mandatory capability exists for this work type (e.g. daily_car_cleaning in dcc_and_services), guarantee its inclusion
    cfg.mandatoryCaps.forEach(c => {
      if (!checked.includes(c)) checked.unshift(c);
    });

    // Prune any capabilities not permitted by this work type
    return checked.filter(c => cfg.allowedCaps.includes(c));
  }

  function renderStaffCapabilities(context, workType, selectedCaps = null) {
    const wt = workType || 'dcc_only';
    const cfg = WORK_TYPE_CONFIG[wt] || WORK_TYPE_CONFIG.dcc_only;

    const descEl = document.getElementById(context === 'add' ? 'v2AddStaffWorkTypeDesc' : 'v2EditStaffWorkTypeDesc');
    const hintEl = document.getElementById(context === 'add' ? 'v2AddStaffCapHint' : 'v2EditStaffCapHint');
    const gridEl = document.getElementById(context === 'add' ? 'v2AddStaffCapGrid' : 'v2EditStaffCapGrid');
    const errEl = document.getElementById(context === 'add' ? 'v2AddStaffCapError' : 'v2EditStaffCapError');

    if (descEl) {
      descEl.className = `cwp-v2-staff-worktype-info ${cfg.themeClass}`;
      descEl.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <div><strong>${escapeHtml(cfg.name)}:</strong> ${escapeHtml(cfg.desc)}</div>
      `;
    }

    if (hintEl) {
      hintEl.textContent = cfg.hint;
    }

    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }

    if (!gridEl) return;

    // Determine currently checked set pruned to allowed
    let activeCaps = [];
    if (Array.isArray(selectedCaps)) {
      activeCaps = selectedCaps.filter(c => cfg.allowedCaps.includes(c));
    } else {
      activeCaps = getStaffModalSelectedCaps(context, wt);
    }

    cfg.mandatoryCaps.forEach(c => {
      if (!activeCaps.includes(c)) activeCaps.push(c);
    });

    const activeSet = new Set(activeCaps);
    gridEl.innerHTML = '';

    const inputName = context === 'add' ? 'addStaffCap' : 'editStaffCap';

    CAPABILITY_CATALOG.forEach(cap => {
      if (!cfg.allowedCaps.includes(cap.id)) {
        return; // Strictly omit non-permitted capabilities
      }

      const isMandatory = cfg.mandatoryCaps.includes(cap.id);
      const isChecked = isMandatory || activeSet.has(cap.id);

      const label = document.createElement('label');
      label.className = 'cwp-v2-staff-cap-check' + (isMandatory ? ' is-locked' : '');

      label.innerHTML = `
        <input type="checkbox" name="${inputName}" value="${escapeHtml(cap.id)}" ${isChecked ? 'checked' : ''} ${isMandatory ? 'disabled aria-disabled="true"' : ''} />
        <span class="material-symbols-outlined" style="font-size:16px; color:${isMandatory ? 'var(--cwp-v2-sys-primary, #2563eb)' : 'inherit'};" aria-hidden="true">${escapeHtml(cap.icon)}</span>
        <span>${escapeHtml(cap.label)}</span>
        ${isMandatory ? '<span class="cwp-v2-staff-cap-badge-mandatory"><span class="material-symbols-outlined" style="font-size:12px;">lock</span> Mandatory</span>' : ''}
      `;

      if (!isMandatory) {
        label.querySelector('input').addEventListener('change', () => {
          if (context === 'edit') state.editForm.isDirty = true;
          validateStaffModalCapabilities(context, wt, true);
        });
      }

      gridEl.appendChild(label);
    });
  }

  function handleWorkTypeChange(context, newWorkType) {
    const currentChecked = getStaffModalSelectedCaps(context, newWorkType);
    renderStaffCapabilities(context, newWorkType, currentChecked);
  }

  function validateStaffModalCapabilities(context, workType, silent = false) {
    const wt = workType || 'dcc_only';
    const caps = getStaffModalSelectedCaps(context, wt);
    const errEl = document.getElementById(context === 'add' ? 'v2AddStaffCapError' : 'v2EditStaffCapError');

    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }

    if (wt === 'dcc_only') {
      return { ok: true, caps: ['daily_car_cleaning'] };
    }

    if (wt === 'services_only') {
      const nonDcc = caps.filter(c => c !== 'daily_car_cleaning');
      if (nonDcc.length === 0) {
        const msg = 'Please select at least one service capability for On-Demand Services staff.';
        if (!silent && errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        return { ok: false, error: msg };
      }
      return { ok: true, caps: nonDcc };
    }

    if (wt === 'dcc_and_services') {
      const nonDcc = caps.filter(c => c !== 'daily_car_cleaning');
      if (nonDcc.length === 0) {
        const msg = 'Please select at least one additional service capability (e.g. Car Washing, Solar, Detailing).';
        if (!silent && errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        return { ok: false, error: msg };
      }
      return { ok: true, caps: ['daily_car_cleaning', ...nonDcc] };
    }

    return { ok: true, caps };
  }

  function populateStaffReview() {
    const rev = document.getElementById('v2StaffWizReview');
    if (!rev) return;
    const name = document.getElementById('v2AddStaffName')?.value.trim() || '—';
    const phone = document.getElementById('v2AddStaffPhone')?.value.trim() || '—';
    const desig = document.getElementById('v2AddStaffDesig')?.selectedOptions[0]?.text || 'Cleaner';
    const code = document.getElementById('v2AddStaffCode')?.value.trim() || 'Auto-Generated';
    const scope = document.getElementById('v2AddStaffScope')?.value.trim() || 'Standard';
    const workType = document.getElementById('v2AddStaffWorkType')?.value || 'dcc_only';
    const cfg = WORK_TYPE_CONFIG[workType] || WORK_TYPE_CONFIG.dcc_only;
    const caps = getStaffModalSelectedCaps('add', workType);
    const capLabels = caps.map(cId => {
      const found = CAPABILITY_CATALOG.find(c => c.id === cId);
      return found ? found.label : cId.replace(/_/g, ' ');
    }).join(', ');

    rev.innerHTML = `
      <div class="cwp-v2-staff-summary-grid">
        <div class="cwp-v2-staff-summary-item"><span class="cwp-v2-staff-summary-label">Full Name</span><span class="cwp-v2-staff-summary-val">${escapeHtml(name)}</span></div>
        <div class="cwp-v2-staff-summary-item"><span class="cwp-v2-staff-summary-label">Primary Phone</span><span class="cwp-v2-staff-summary-val">${formatPhoneDisplay(phone)}</span></div>
        <div class="cwp-v2-staff-summary-item"><span class="cwp-v2-staff-summary-label">Designation</span><span class="cwp-v2-staff-summary-val">${escapeHtml(desig)}</span></div>
        <div class="cwp-v2-staff-summary-item"><span class="cwp-v2-staff-summary-label">Zone / Scope</span><span class="cwp-v2-staff-summary-val">${escapeHtml(scope)}</span></div>
        <div class="cwp-v2-staff-summary-item"><span class="cwp-v2-staff-summary-label">Work Type</span><span class="cwp-v2-staff-summary-val">${escapeHtml(cfg.name)}</span></div>
        <div class="cwp-v2-staff-summary-item" style="grid-column: 1 / -1;"><span class="cwp-v2-staff-summary-label">Service Capabilities</span><span class="cwp-v2-staff-summary-val">${escapeHtml(capLabels || 'None')}</span></div>
      </div>
    `;
  }

  async function submitAddStaff() {
    const workType = document.getElementById('v2AddStaffWorkType')?.value || 'dcc_only';
    const capVal = validateStaffModalCapabilities('add', workType);
    if (!capVal.ok) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(capVal.error);
      goToAddStaffStep(4);
      return;
    }

    const staffData = {
      name: document.getElementById('v2AddStaffName')?.value.trim(),
      phone: getCleanPhone10(document.getElementById('v2AddStaffPhone')?.value.trim()),
      email: document.getElementById('v2AddStaffEmail')?.value.trim() || '',
      dateOfJoining: document.getElementById('v2AddStaffJoining')?.value || '',
      weeklyOff: document.getElementById('v2AddStaffWeeklyOff')?.value || '',
      designationId: document.getElementById('v2AddStaffDesig')?.value || 'cleaner',
      staffCode: document.getElementById('v2AddStaffCode')?.value.trim().toUpperCase() || undefined,
      active: document.getElementById('v2AddStaffStatus')?.value !== 'inactive',
      pin: document.getElementById('v2AddStaffPin')?.value.trim(),
      operationalScope: document.getElementById('v2AddStaffScope')?.value.trim() || '',
      teamName: document.getElementById('v2AddStaffTeam')?.value.trim() || '',
      reportsToId: document.getElementById('v2AddStaffReportsTo')?.value || null,
      workType: workType,
      serviceCapabilities: capVal.caps
    };

    const btn = document.getElementById('v2StaffWizSubmit');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('saveStaffMember', { staffData });
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success('Staff member created successfully.');
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalAddStaff');
        await loadData(true);
        if (res && (res.staffCode || res.id)) selectStaff(res.staffCode || res.id);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Failed to save staff member');
    }
  }

  // -------------------------------------------------------------------------
  // EDIT STAFF — 4-TAB DIRECT FORM WITH DIRTY STATE GUARD
  // -------------------------------------------------------------------------
  function openEditStaffModal(s) {
    state.editForm.staff = s;
    state.editForm.isDirty = false;

    document.getElementById('v2EditStaffCode').value = s.id;
    document.getElementById('v2EditStaffName').value = s.name || '';
    document.getElementById('v2EditStaffPhone').value = s.phone || '';
    document.getElementById('v2EditStaffEmail').value = s.email || '';
    document.getElementById('v2EditStaffJoining').value = s.dateOfJoining || '';
    document.getElementById('v2EditStaffWeeklyOff').value = s.weeklyOff || '';
    document.getElementById('v2EditStaffDesig').value = s.designationId || 'cleaner';
    document.getElementById('v2EditStaffStatus').value = (s.isActive !== false && s.active !== 'No') ? 'active' : 'inactive';
    document.getElementById('v2EditStaffScope').value = s.operationalScope || '';
    document.getElementById('v2EditStaffTeam').value = s.teamName || '';
    document.getElementById('v2EditStaffReportsTo').value = s.reportsToId || '';

    const normWorkType = (s.workType || s.work_type || 'dcc_only').toLowerCase().trim();
    let rawCaps = s.serviceCapabilities || s.service_capabilities || ['daily_car_cleaning'];
    if (typeof rawCaps === 'string') {
      try { rawCaps = JSON.parse(rawCaps); } catch (e) { rawCaps = ['daily_car_cleaning']; }
    }
    const wtSelect = document.getElementById('v2EditStaffWorkType');
    if (wtSelect) wtSelect.value = normWorkType;
    renderStaffCapabilities('edit', normWorkType, rawCaps);

    switchEditStaffTab('basic');
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalEditStaff', {
        onClose: () => { state.editForm.isDirty = false; }
      });
    }
  }

  function switchEditStaffTab(tabName) {
    state.editForm.currentTab = tabName;
    document.querySelectorAll('#v2ModalEditStaff .cwp-v2-edit-tab-btn').forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-edit-staff-tab') === tabName);
    });
    document.querySelectorAll('#v2ModalEditStaff .cwp-v2-edit-tab-pane').forEach(p => {
      p.classList.toggle('is-active', p.getAttribute('data-edit-staff-pane') === tabName);
    });
  }

  async function submitEditStaff() {
    const code = document.getElementById('v2EditStaffCode').value;
    const name = document.getElementById('v2EditStaffName').value.trim();
    const phone = document.getElementById('v2EditStaffPhone').value.trim();
    if (!name || !isValidIndianPhone(phone)) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error('Valid name and 10-digit Indian mobile required.');
      switchEditStaffTab('basic');
      return;
    }

    const workType = document.getElementById('v2EditStaffWorkType')?.value || 'dcc_only';
    const capVal = validateStaffModalCapabilities('edit', workType);
    if (!capVal.ok) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(capVal.error);
      switchEditStaffTab('work');
      return;
    }

    const staffData = {
      staffCode: code,
      id: code,
      name,
      phone: getCleanPhone10(phone),
      email: document.getElementById('v2EditStaffEmail').value.trim(),
      dateOfJoining: document.getElementById('v2EditStaffJoining').value,
      weeklyOff: document.getElementById('v2EditStaffWeeklyOff').value,
      designationId: document.getElementById('v2EditStaffDesig').value,
      active: document.getElementById('v2EditStaffStatus').value === 'active',
      operationalScope: document.getElementById('v2EditStaffScope').value.trim(),
      teamName: document.getElementById('v2EditStaffTeam').value.trim(),
      reportsToId: document.getElementById('v2EditStaffReportsTo').value || null,
      workType: workType,
      serviceCapabilities: capVal.caps
      // NOTE: PIN is intentionally omitted so existing credentials are NEVER accidentally reset
    };

    const btn = document.getElementById('v2EditStaffSubmit');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('saveStaffMember', { staffData });
        state.editForm.isDirty = false;
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success('Staff profile updated.');
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalEditStaff');
        await loadData(true);
        selectStaff(code);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Update failed');
    }
  }

  // -------------------------------------------------------------------------
  // DROPDOWN POPULATION & EVENT BINDINGS
  // -------------------------------------------------------------------------
  function populateFilterDropdowns() {
    const desigFilter = document.getElementById('v2StaffFilterDesignation');
    if (desigFilter) {
      desigFilter.innerHTML = '<option value="all">Designation: All</option>' + state.designations.map(d =>
        `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`
      ).join('');
    }
    const routeFilter = document.getElementById('v2StaffFilterRoute');
    if (routeFilter) {
      routeFilter.innerHTML = '<option value="all">Zone / Route: All</option>' + state.routes.map(r =>
        `<option value="${escapeHtml(r.route_name || r.name)}">${escapeHtml(r.route_name || r.name)}</option>`
      ).join('');
    }
  }

  function populateFormDropdowns() {
    const desigOpts = state.designations.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    ['v2AddStaffDesig', 'v2EditStaffDesig'].forEach(id => {
      const el = document.getElementById(id);
      if (el && desigOpts) el.innerHTML = desigOpts;
    });

    const mgrOpts = '<option value="">None (Direct)</option>' + state.allStaff.map(s =>
      `<option value="${escapeHtml(s.dbId || s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.id)})</option>`
    ).join('');
    ['v2AddStaffReportsTo', 'v2EditStaffReportsTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = mgrOpts;
    });
  }

  function bindToolbarEvents() {
    document.getElementById('v2BtnAddStaff')?.addEventListener('click', openAddStaffModal);
    document.getElementById('v2StaffBtnRefresh')?.addEventListener('click', () => loadData(true));

    document.querySelectorAll('.cwp-v2-staff-kpi-card').forEach(card => {
      card.addEventListener('click', () => handleKpiClick(card.getAttribute('data-kpi')));
    });

    const searchInput = document.getElementById('v2StaffSearchInput');
    const clearBtn = document.getElementById('v2StaffSearchClear');
    let timer = null;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const v = searchInput.value;
        if (clearBtn) clearBtn.classList.toggle('is-visible', v.length > 0);
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.searchQuery = v;
          applyFiltersAndSearch();
        }, 250);
      });
    }
    clearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearBtn.classList.remove('is-visible');
      state.searchQuery = '';
      applyFiltersAndSearch();
    });

    document.getElementById('v2StaffFilterStatus')?.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      applyFiltersAndSearch();
    });
    document.getElementById('v2StaffFilterDesignation')?.addEventListener('change', (e) => {
      state.filters.designation = e.target.value;
      applyFiltersAndSearch();
    });
    document.getElementById('v2StaffFilterRoute')?.addEventListener('change', (e) => {
      state.filters.route = e.target.value;
      applyFiltersAndSearch();
    });

    document.getElementById('v2StaffResetFilters')?.addEventListener('click', () => {
      state.searchQuery = '';
      state.kpiFilter = null;
      state.filters = { status: 'all', designation: 'all', route: 'all' };
      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.classList.remove('is-visible');
      document.getElementById('v2StaffFilterStatus').value = 'all';
      document.getElementById('v2StaffFilterDesignation').value = 'all';
      document.getElementById('v2StaffFilterRoute').value = 'all';
      document.querySelectorAll('.cwp-v2-staff-kpi-card').forEach(c => c.classList.remove('is-active'));
      applyFiltersAndSearch();
    });
  }

  function bindTableEvents() {
    document.querySelectorAll('.cwp-v2-staff-table th.is-sortable').forEach(th => {
      th.addEventListener('click', () => handleSort(th.getAttribute('data-sort-col')));
    });

    const tbody = document.getElementById('v2StaffTableBody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.stopPropagation();
          const act = actionBtn.getAttribute('data-action');
          const id = actionBtn.getAttribute('data-id');
          const s = state.allStaff.find(x => String(x.id).toUpperCase() === String(id).toUpperCase());
          if (!s) return;
          if (act === 'view') selectStaff(id);
          else if (act === 'edit') openEditStaffModal(s);
          else if (act === 'assignJob') openAssignJobModal(s);
          else if (act === 'resetPin') openResetPinModal(s);
          return;
        }
        const row = e.target.closest('tr[data-staff-id]');
        if (row) selectStaff(row.getAttribute('data-staff-id'));
      });
    }

    document.querySelectorAll('.cwp-v2-staff-detail-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchDetailTab(btn.getAttribute('data-staff-detail-tab')));
    });

    document.getElementById('v2StaffPagePrev')?.addEventListener('click', () => {
      if (state.pagination.currentPage > 1) {
        state.pagination.currentPage--;
        renderTable();
        renderPagination();
      }
    });
    document.getElementById('v2StaffPageNext')?.addEventListener('click', () => {
      const maxPage = Math.ceil(state.pagination.totalRecords / state.pagination.pageSize);
      if (state.pagination.currentPage < maxPage) {
        state.pagination.currentPage++;
        renderTable();
        renderPagination();
      }
    });
    document.getElementById('v2StaffPageSize')?.addEventListener('change', (e) => {
      state.pagination.pageSize = parseInt(e.target.value, 10);
      state.pagination.currentPage = 1;
      renderTable();
      renderPagination();
    });
    document.getElementById('v2StaffPageNumbers')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn) {
        state.pagination.currentPage = parseInt(btn.getAttribute('data-page'), 10);
        renderTable();
        renderPagination();
      }
    });
  }

  function bindWizardEvents() {
    document.querySelectorAll('#v2ModalAddStaff .cwp-v2-wizard-step').forEach(s => {
      s.addEventListener('click', () => goToAddStaffStep(parseInt(s.getAttribute('data-step'), 10)));
    });
    document.getElementById('v2StaffWizPrev')?.addEventListener('click', () => goToAddStaffStep(state.addWizard.currentStep - 1));
    document.getElementById('v2StaffWizNext')?.addEventListener('click', () => goToAddStaffStep(state.addWizard.currentStep + 1));
    document.getElementById('v2StaffWizSubmit')?.addEventListener('click', submitAddStaff);
    document.getElementById('v2AddStaffWorkType')?.addEventListener('change', (e) => {
      handleWorkTypeChange('add', e.target.value);
    });
  }

  function bindEditEvents() {
    document.querySelectorAll('#v2ModalEditStaff .cwp-v2-edit-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchEditStaffTab(btn.getAttribute('data-edit-staff-tab')));
    });
    const editForm = document.getElementById('v2EditStaffForm');
    if (editForm) {
      editForm.addEventListener('input', () => { state.editForm.isDirty = true; });
      editForm.addEventListener('change', () => { state.editForm.isDirty = true; });
    }
    document.getElementById('v2EditStaffWorkType')?.addEventListener('change', (e) => {
      handleWorkTypeChange('edit', e.target.value);
      state.editForm.isDirty = true;
    });
    document.getElementById('v2EditStaffCancel')?.addEventListener('click', () => {
      if (state.editForm.isDirty && !confirm('You have unsaved changes. Discard changes and close?')) return;
      state.editForm.isDirty = false;
      if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalEditStaff');
    });
    document.getElementById('v2EditStaffSubmit')?.addEventListener('click', submitEditStaff);
  }

  function bindActionModalEvents() {
    document.getElementById('v2BtnSubmitStaffAssignJob')?.addEventListener('click', submitStaffAssignJob);
    document.getElementById('v2BtnSubmitStaffChangeRoute')?.addEventListener('click', submitChangeRoute);
    document.getElementById('v2BtnSubmitStaffResetPin')?.addEventListener('click', submitResetPin);
  }

  window.CWP_ADMIN_V2.staff = {
    init,
    loadData,
    selectStaff,
    closeDetailPanel,
    switchDetailTab,
    openAddStaffModal,
    openEditStaffModal,
    renderStaffCapabilities,
    getStaffModalSelectedCaps,
    validateStaffModalCapabilities,
    getState: () => state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
