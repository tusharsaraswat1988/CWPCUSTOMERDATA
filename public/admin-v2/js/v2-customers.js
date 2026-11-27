/**
 * =========================================================================
 * CWP ADMIN V2 — CUSTOMER MANAGEMENT MODULE
 * =========================================================================
 * Production Migration, Functional Restoration & Split-View Workstation.
 * Strictly scoped to window.CWP_ADMIN_V2.customers.
 *
 * Capabilities:
 * - High-density split-view workstation (table directory + persistent detail panel)
 * - Real live data hydration from /api getAllCustomers, getStaffList, getAllRoutes
 * - Truthful live KPI strip with click-to-filter drilldowns
 * - Live debounced search across Name, Phone, Vehicle Plate, Model, Route, Area
 * - Primary & secondary collapsible filters with reset capability
 * - Multi-column sorting (ascending, descending) & truthful pagination
 * - Keyboard & click row selection with persistent detail panel sync
 * - Rich Vehicle Cards with multi-vehicle management & expand/collapse
 * - 5-Step guided Add Customer wizard with inline validation & duplicate prevention
 * - Tabbed flexible Edit Customer form (Info, Vehicles, Plan, Operations)
 * - Persistent Quick Actions: Assign Job, Log Service, Add Vehicle, Update Plan
 * - Overflow actions: WhatsApp, Call, Active/Suspension toggle, Administrative Delete
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  // Module state
  const state = {
    allCustomers: [],
    filteredCustomers: [],
    selectedCustomer: null,
    staffList: [],
    routesList: [],
    kpiFilter: null,
    searchQuery: '',
    filters: {
      status: 'all',
      category: 'all',
      route: 'all',
      staff: 'all',
      seater: 'all'
    },
    sort: {
      column: 'name',
      direction: 'asc'
    },
    pagination: {
      currentPage: 1,
      pageSize: 25,
      totalRecords: 0
    },
    addWizard: {
      currentStep: 1,
      vehicles: []
    },
    editForm: {
      currentTab: 'info',
      customer: null,
      vehicles: []
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

  function formatPhoneDisplay(phone) {
    if (!phone) return '—';
    const clean = String(phone).replace(/\D/g, '');
    const num10 = clean.length > 10 ? clean.slice(-10) : clean;
    if (num10.length === 10) {
      return `+91 ${num10.slice(0, 5)} ${num10.slice(5)}`;
    }
    return phone;
  }

  function getCleanPhone10(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/\D/g, '');
    return clean.length > 10 ? clean.slice(-10) : clean;
  }

  function escapeHtml(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getInitials(name) {
    if (!name) return 'CU';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
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

    // Listen to tab change events from shell
    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail) {
        if (e.detail.tab === 'records') {
          if (state.allCustomers.length === 0 && hasAuthToken()) {
            loadData();
          }
        } else {
          // If customer overlays are open when leaving records tab, close them cleanly
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2ModalAddCustomer', { pushHistory: false });
            window.CWP_ADMIN_V2.overlay.close('v2ModalEditCustomer', { pushHistory: false });
            window.CWP_ADMIN_V2.overlay.close('v2ModalAssignJob', { pushHistory: false });
            window.CWP_ADMIN_V2.overlay.close('v2ModalLogService', { pushHistory: false });
            window.CWP_ADMIN_V2.overlay.close('v2ModalAddVehicle', { pushHistory: false });
            window.CWP_ADMIN_V2.overlay.close('v2ModalUpdatePlan', { pushHistory: false });
          }
        }
      }
    });

    // Check if initial tab is records and authenticated
    const viewEl = document.getElementById('v2View_records');
    if (viewEl && viewEl.classList.contains('is-active') && hasAuthToken()) {
      loadData();
    }
  }

  // -------------------------------------------------------------------------
  // LIVE DATA LOADING
  // -------------------------------------------------------------------------
  async function loadData(forceRefresh = false) {
    if (state.isLoading) return;
    if (!hasAuthToken()) return;
    state.isLoading = true;

    const tbody = document.getElementById('v2CustTableBody');
    if (tbody && state.allCustomers.length === 0) {
      if (window.CWP_ADMIN_V2.ui) {
        window.CWP_ADMIN_V2.ui.renderSkeletonRows(tbody, 8, 8);
      }
    }

    try {
      const api = window.CWP_ADMIN_V2.api;
      if (!api || typeof api.request !== 'function') {
        throw new Error('API helper not available');
      }

      // Fetch customers, staff, and routes in parallel
      const [custRes, staffRes, routesRes] = await Promise.allSettled([
        api.request('getAllCustomers', { forceRefresh }),
        api.request('getStaffList'),
        api.request('getAllRoutes')
      ]);

      if (custRes.status === 'fulfilled' && Array.isArray(custRes.value)) {
        // Filter out leads if any are tagged
        state.allCustomers = custRes.value.filter(c => !c.isLead && c.tag !== 'lead');
      } else {
        throw new Error((custRes.reason && custRes.reason.message) || 'Failed to load customers');
      }

      if (staffRes.status === 'fulfilled' && Array.isArray(staffRes.value)) {
        state.staffList = staffRes.value;
        populateStaffDropdowns();
      }

      if (routesRes.status === 'fulfilled' && Array.isArray(routesRes.value)) {
        state.routesList = routesRes.value;
        populateRoutesDropdowns();
      }

      updateKpis();
      applyFiltersAndSearch();

      // Preserve selection ONLY if user already had a customer open and it still exists
      if (state.selectedCustomer) {
        const found = state.allCustomers.find(c => c.id === state.selectedCustomer.id);
        if (found) {
          selectCustomer(found.id);
        } else {
          closeDetailPanel();
        }
      } else {
        closeDetailPanel();
      }
    } catch (err) {
      console.error('[CustomerModule] Error loading customer data:', err);
      const tbody = document.getElementById('v2CustTableBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding: 40px 16px;">
              <div class="cwp-v2-empty-state-panel" role="alert">
                <span class="material-symbols-outlined cwp-v2-empty-state-icon" style="color:var(--cwp-v2-status-danger);">error_outline</span>
                <div class="cwp-v2-empty-state-title">Failed to load live customers</div>
                <div class="cwp-v2-empty-state-desc">${escapeHtml(err.message || 'Please check your connection.')}</div>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" onclick="window.CWP_ADMIN_V2.customers.loadData(true)" style="margin-top:8px;">
                  <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                  <span>Retry</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }
      if (window.CWP_ADMIN_V2.toast) {
        window.CWP_ADMIN_V2.toast.error('Failed to load live customers: ' + (err.message || 'Error'));
      }
    } finally {
      state.isLoading = false;
    }
  }

  // -------------------------------------------------------------------------
  // KPI STRIP CALCULATION & FILTER DRILLDOWN
  // -------------------------------------------------------------------------
  function updateKpis() {
    const custs = state.allCustomers;
    const totalCount = custs.length;
    const activeCount = custs.filter(c => c.active !== 'No' && c.active !== false && !c.isStopped).length;
    const inactiveCount = custs.filter(c => c.active === 'No' || c.active === false || c.isStopped === true).length;
    const upcomingCount = custs.filter(c => (c.serviceCategory === 'Daily Car Cleaning' || c.hasService) && !c.isStopped).length;

    const elTotal = document.getElementById('v2CustKpiTotal');
    const elActive = document.getElementById('v2CustKpiActive');
    const elInactive = document.getElementById('v2CustKpiInactive');
    const elUpcoming = document.getElementById('v2CustKpiUpcoming');

    if (elTotal) elTotal.textContent = totalCount;
    if (elActive) elActive.textContent = activeCount;
    if (elInactive) elInactive.textContent = inactiveCount;
    if (elUpcoming) elUpcoming.textContent = upcomingCount;
  }

  function handleKpiClick(filterType) {
    const cards = document.querySelectorAll('.cwp-v2-cust-kpi-card');
    cards.forEach(c => c.classList.remove('is-active'));

    if (state.kpiFilter === filterType) {
      // Toggle off
      state.kpiFilter = null;
    } else {
      state.kpiFilter = filterType;
      const card = document.querySelector(`.cwp-v2-cust-kpi-card[data-kpi="${filterType}"]`);
      if (card) card.classList.add('is-active');
    }

    applyFiltersAndSearch();
  }

  // -------------------------------------------------------------------------
  // FILTERING, SEARCH, SORTING & PAGINATION
  // -------------------------------------------------------------------------
  function applyFiltersAndSearch() {
    let result = [...state.allCustomers];

    // 1. KPI Drilldown Filter
    if (state.kpiFilter === 'active') {
      result = result.filter(c => c.active !== 'No' && c.active !== false && !c.isStopped);
    } else if (state.kpiFilter === 'inactive') {
      result = result.filter(c => c.active === 'No' || c.active === false || c.isStopped === true);
    } else if (state.kpiFilter === 'upcoming') {
      result = result.filter(c => (c.serviceCategory === 'Daily Car Cleaning' || c.hasService) && !c.isStopped);
    }

    // 2. Search Query (Truthful live search)
    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      result = result.filter(c => {
        const name = (c.customerName || c.name || '').toLowerCase();
        const nameHi = (c.nameHi || '').toLowerCase();
        const phone = (c.phone || c.customerNumber || '').toLowerCase();
        const altPhone = (c.altPhone || '').toLowerCase();
        const vehicle = (c.vehicle || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        const staff = (c.staffName || '').toLowerCase();
        const pkg = (c.packageName || c.packageType || '').toLowerCase();

        let vehicleMatch = false;
        if (Array.isArray(c.vehicles)) {
          vehicleMatch = c.vehicles.some(v =>
            (v.registration_no || v.plateNumber || '').toLowerCase().includes(q) ||
            (v.brand_or_model || v.car_make || '').toLowerCase().includes(q) ||
            (v.car_color || '').toLowerCase().includes(q)
          );
        }

        return name.includes(q) || nameHi.includes(q) || phone.includes(q) ||
               altPhone.includes(q) || vehicle.includes(q) || address.includes(q) ||
               staff.includes(q) || pkg.includes(q) || vehicleMatch;
      });
    }

    // 3. Status Filter
    if (state.filters.status === 'active') {
      result = result.filter(c => c.active !== 'No' && c.active !== false && !c.isStopped);
    } else if (state.filters.status === 'inactive') {
      result = result.filter(c => c.active === 'No' || c.active === false || c.isStopped === true);
    }

    // 4. Category/Plan Filter
    if (state.filters.category !== 'all') {
      result = result.filter(c => {
        const cat = (c.serviceCategory || c.interestedService || '').toLowerCase();
        return cat.includes(state.filters.category.toLowerCase());
      });
    }

    // 5. Route/Area Filter
    if (state.filters.route !== 'all') {
      result = result.filter(c => {
        const addr = (c.address || '').toLowerCase();
        const route = (c.route || '').toLowerCase();
        const filterVal = state.filters.route.toLowerCase();
        return addr.includes(filterVal) || route.includes(filterVal);
      });
    }

    // 6. Secondary Filters: Staff
    if (state.filters.staff === 'assigned') {
      result = result.filter(c => Boolean(c.staffName || c.staffId));
    } else if (state.filters.staff === 'unassigned') {
      result = result.filter(c => !c.staffName && !c.staffId);
    } else if (state.filters.staff !== 'all') {
      result = result.filter(c => (c.staffId === state.filters.staff || c.staffName === state.filters.staff));
    }

    // 7. Secondary Filters: Seater
    if (state.filters.seater !== 'all') {
      result = result.filter(c => (c.seaterType === state.filters.seater || c.seater_type === state.filters.seater));
    }

    // 8. Sorting
    const { column, direction } = state.sort;
    result.sort((a, b) => {
      let valA = '';
      let valB = '';

      switch (column) {
        case 'name':
          valA = (a.customerName || a.name || '').toLowerCase();
          valB = (b.customerName || b.name || '').toLowerCase();
          break;
        case 'phone':
          valA = (a.phone || a.customerNumber || '').toLowerCase();
          valB = (b.phone || b.customerNumber || '').toLowerCase();
          break;
        case 'vehicle':
          valA = (a.vehicle || '').toLowerCase();
          valB = (b.vehicle || '').toLowerCase();
          break;
        case 'plan':
          valA = (a.packageName || a.packageType || '').toLowerCase();
          valB = (b.packageName || b.packageType || '').toLowerCase();
          break;
        case 'route':
          valA = (a.route || a.address || '').toLowerCase();
          valB = (b.route || b.address || '').toLowerCase();
          break;
        case 'status':
          valA = a.active === 'No' || a.isStopped ? 'inactive' : 'active';
          valB = b.active === 'No' || b.isStopped ? 'inactive' : 'active';
          break;
        default:
          valA = (a.customerName || '').toLowerCase();
          valB = (b.customerName || '').toLowerCase();
      }

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    state.filteredCustomers = result;
    state.pagination.totalRecords = result.length;

    // Reset page to 1 if out of bounds
    const maxPage = Math.max(1, Math.ceil(result.length / state.pagination.pageSize));
    if (state.pagination.currentPage > maxPage) {
      state.pagination.currentPage = 1;
    }

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

    // Update header icons and aria-sort
    const headers = document.querySelectorAll('.cwp-v2-cust-table th.is-sortable');
    headers.forEach(th => {
      const col = th.getAttribute('data-sort-col');
      if (col === colName) {
        th.classList.add('is-sorted');
        th.setAttribute('aria-sort', state.sort.direction === 'asc' ? 'ascending' : 'descending');
        const icon = th.querySelector('.cwp-v2-sort-icon');
        if (icon) icon.textContent = state.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
      } else {
        th.classList.remove('is-sorted');
        th.removeAttribute('aria-sort');
        const icon = th.querySelector('.cwp-v2-sort-icon');
        if (icon) icon.textContent = 'unfold_more';
      }
    });

    applyFiltersAndSearch();
  }

  // -------------------------------------------------------------------------
  // DIRECTORY TABLE RENDERING
  // -------------------------------------------------------------------------
  function renderTable() {
    const tbody = document.getElementById('v2CustTableBody');
    if (!tbody) return;

    const { currentPage, pageSize, totalRecords } = state.pagination;
    const startIndex = (currentPage - 1) * pageSize;
    const pageRecords = state.filteredCustomers.slice(startIndex, startIndex + pageSize);

    if (totalRecords === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 40px 16px;">
            <div class="cwp-v2-empty-state-panel">
              <span class="material-symbols-outlined cwp-v2-empty-state-icon" style="font-size:32px;">person_search</span>
              <div class="cwp-v2-empty-state-title" style="font-weight:600; margin-top:8px;">No matching customers</div>
              <div class="cwp-v2-empty-state-desc" style="color:#64748b; font-size:12px;">Try adjusting your search terms or filters.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    pageRecords.forEach(c => {
      const isSelected = state.selectedCustomer && state.selectedCustomer.id === c.id;
      const selectedClass = isSelected ? 'is-selected' : '';

      // 1. Customer Name + Area (English-only, compact single-row)
      const name = escapeHtml(c.customerName || c.name || 'Unnamed');
      const area = c.address ? escapeHtml(extractAreaFromAddress(c.address)) : '';

      // 2. Phone
      const phoneDisplay = formatPhoneDisplay(c.phone || c.customerNumber);
      const cleanPhone = getCleanPhone10(c.phone || c.customerNumber);

      // 3. Vehicles
      let vehSummary = '';
      let vehCount = 0;
      if (Array.isArray(c.vehicles) && c.vehicles.length > 0) {
        vehCount = c.vehicles.length;
        const v1 = c.vehicles[0];
        const plate = v1.registration_no || v1.plateNumber || '';
        const model = v1.brand_or_model || v1.car_make || '';
        vehSummary = `${plate} ${model}`.trim();
      } else if (c.vehicle) {
        vehSummary = c.vehicle;
        vehCount = c.vehicle.includes('/') ? c.vehicle.split('/').length : 1;
      }
      const vehBadge = vehSummary ? `<span class="cwp-v2-cust-vehicle-badge" title="${escapeHtml(vehSummary)}">${escapeHtml(vehSummary)}</span>` : '<span style="color:#94a3b8;">None</span>';
      const countPill = vehCount > 1 ? `<span class="cwp-v2-cust-vehicle-count">+${vehCount - 1}</span>` : '';

      // 4. Plan / Package
      const planName = c.packageName || c.packageType || c.serviceCategory || 'Standard';
      const planBadge = `<span class="cwp-v2-badge is-primary" style="font-size:10.5px;">Legacy: ${escapeHtml(planName)}</span>`;

      // 5. Route
      const routeDisplay = escapeHtml(c.route || c.staffName ? `Route: ${c.staffName}` : area);

      // 6. Next Service
      const isDcc = c.serviceCategory === 'Daily Car Cleaning' || (c.sheetName === 'Daily Clean');
      const nextService = isDcc ? (c.isStopped ? 'Suspended' : 'Daily 06:30 AM') : 'On-Demand';
      const nextColor = c.isStopped ? '#dc2626' : '#16a34a';

      // 7. Status
      const isActive = c.active !== 'No' && c.active !== false && !c.isStopped;
      const statusBadge = isActive
        ? `<span class="cwp-v2-badge is-success" style="font-size:10px;">Active</span>`
        : `<span class="cwp-v2-badge is-danger" style="font-size:10px;">Suspended</span>`;

      rowsHtml += `
        <tr class="${selectedClass}" data-customer-id="${escapeHtml(c.id)}" tabindex="0">
          <td>
            <div class="cwp-v2-cust-cell-name">
              <span class="cwp-v2-cust-name-main">${name}</span>
              ${area ? `<span class="cwp-v2-cust-name-sub" title="${area}">• ${area}</span>` : ''}
            </div>
          </td>
          <td>
            <span class="cwp-v2-cust-cell-phone">${phoneDisplay}</span>
          </td>
          <td>
            <div class="cwp-v2-cust-cell-vehicle">
              ${vehBadge}
              ${countPill}
            </div>
          </td>
          <td>${planBadge}</td>
          <td><span style="font-size:11.5px; color:#475569;">${routeDisplay}</span></td>
          <td><span style="font-size:11px; font-weight:600; color:${nextColor};">${nextService}</span></td>
          <td>${statusBadge}</td>
          <td>
            <div class="cwp-v2-cust-row-actions">
              <button type="button" class="cwp-v2-cust-action-btn" data-action="view" data-id="${escapeHtml(c.id)}" title="View Details">
                <span class="material-symbols-outlined">visibility</span>
              </button>
              <button type="button" class="cwp-v2-cust-action-btn" data-action="edit" data-id="${escapeHtml(c.id)}" title="Edit Customer">
                <span class="material-symbols-outlined">edit</span>
              </button>
              ${cleanPhone ? `
                <a href="tel:${cleanPhone}" class="cwp-v2-cust-action-btn" title="Call ${phoneDisplay}">
                  <span class="material-symbols-outlined">call</span>
                </a>
                <a href="https://wa.me/91${cleanPhone}" target="_blank" rel="noopener" class="cwp-v2-cust-action-btn" title="WhatsApp Message">
                  <span class="material-symbols-outlined" style="color:#16a34a;">chat</span>
                </a>
              ` : ''}
              <button type="button" class="cwp-v2-cust-action-btn" data-action="assignJob" data-id="${escapeHtml(c.id)}" title="Assign Job">
                <span class="material-symbols-outlined">assignment_ind</span>
              </button>
              <button type="button" class="cwp-v2-cust-action-btn" data-action="logService" data-id="${escapeHtml(c.id)}" title="Log Service">
                <span class="material-symbols-outlined">fact_check</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  function extractAreaFromAddress(address) {
    if (!address) return '';
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return parts[0] || '';
  }

  // -------------------------------------------------------------------------
  // PAGINATION CONTROLS
  // -------------------------------------------------------------------------
  function renderPagination() {
    const { currentPage, pageSize, totalRecords } = state.pagination;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endRecord = Math.min(totalRecords, currentPage * pageSize);

    const infoEl = document.getElementById('v2CustPageInfo');
    if (infoEl) {
      infoEl.textContent = `Showing ${startRecord}–${endRecord} of ${totalRecords} customers`;
    }

    const prevBtn = document.getElementById('v2CustPagePrev');
    const nextBtn = document.getElementById('v2CustPageNext');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    const btnsContainer = document.getElementById('v2CustPageNumbers');
    if (btnsContainer) {
      let btnsHtml = '';
      const startP = Math.max(1, currentPage - 2);
      const endP = Math.min(totalPages, currentPage + 2);

      for (let p = startP; p <= endP; p++) {
        const activeClass = p === currentPage ? 'is-active' : '';
        btnsHtml += `
          <button type="button" class="cwp-v2-cust-page-btn ${activeClass}" data-page="${p}">
            ${p}
          </button>
        `;
      }
      btnsContainer.innerHTML = btnsHtml;
    }
  }

  // -------------------------------------------------------------------------
  // CUSTOMER DETAIL PANEL (DISMISSIBLE & OPTIONAL)
  // -------------------------------------------------------------------------
  function closeDetailPanel() {
    state.selectedCustomer = null;

    const splitView = document.getElementById('v2CustSplitView');
    if (splitView) splitView.classList.add('is-detail-closed');

    const rows = document.querySelectorAll('#v2CustTableBody tr.is-selected');
    rows.forEach(tr => tr.classList.remove('is-selected'));

    renderDetailPanel(null);
  }

  function selectCustomer(customerId) {
    const found = state.allCustomers.find(c => c.id === customerId);
    if (!found) return;

    state.selectedCustomer = found;

    const splitView = document.getElementById('v2CustSplitView');
    if (splitView) splitView.classList.remove('is-detail-closed');

    // Update row highlighting without re-rendering the entire table (preserves scroll!)
    const rows = document.querySelectorAll('#v2CustTableBody tr');
    rows.forEach(tr => {
      if (tr.getAttribute('data-customer-id') === customerId) {
        tr.classList.add('is-selected');
        // Scroll into view gently if needed
        tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        tr.classList.remove('is-selected');
      }
    });

    renderDetailPanel(found);
  }

  function renderDetailPanel(cust) {
    const panel = document.getElementById('v2CustDetailScroll');
    if (!panel) return;

    if (!cust) {
      panel.innerHTML = `
        <div class="cwp-v2-empty-state-panel" style="padding:40px 10px;">
          <span class="material-symbols-outlined cwp-v2-empty-state-icon">account_circle</span>
          <div class="cwp-v2-empty-state-title">No Customer Selected</div>
          <div class="cwp-v2-empty-state-desc">Select a customer from the directory table to inspect account details, vehicles, and active service schedules.</div>
        </div>
      `;
      return;
    }

    const name = escapeHtml(cust.customerName || cust.name || 'Unnamed');
    const initials = getInitials(cust.customerName || cust.name);
    const phoneDisplay = formatPhoneDisplay(cust.phone || cust.customerNumber);
    const cleanPhone = getCleanPhone10(cust.phone || cust.customerNumber);
    const isActive = cust.active !== 'No' && cust.active !== false && !cust.isStopped;
    const statusBadge = isActive
      ? `<span class="cwp-v2-badge is-success">Active</span>`
      : `<span class="cwp-v2-badge is-danger">Suspended</span>`;

    // Sourced Date
    let customerSince = 'Recent';
    if (cust.createdAt) {
      try {
        const d = new Date(cust.createdAt);
        customerSince = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      } catch (e) {}
    }

    // Vehicle cards html
    let vehiclesHtml = '';
    const vehList = (Array.isArray(cust.vehicles) && cust.vehicles.length > 0)
      ? cust.vehicles
      : (cust.vehicle ? parseVehicleStringToArray(cust.vehicle, cust) : []);

    if (vehList.length > 0) {
      vehiclesHtml = vehList.map((v, i) => {
        const plate = escapeHtml(v.registration_no || v.plateNumber || 'NO PLATE');
        const make = escapeHtml(v.car_make || v.brand_or_model || cust.carMake || 'Sedan / Hatchback');
        const color = escapeHtml(v.car_color || cust.carColor || 'Standard');
        const seater = escapeHtml(v.seater_type || v.seaterType || cust.seaterType || '5_seater').replace('_', ' ').toUpperCase();
        const isPrimary = i === 0;

        return `
          <div class="cwp-v2-cust-rich-vehicle-card" data-vehicle-idx="${i}">
            <div class="cwp-v2-cust-rvc-header">
              <span class="cwp-v2-cust-rvc-plate">${plate}</span>
              <div>
                ${isPrimary ? '<span class="cwp-v2-badge is-primary" style="font-size:9.5px;">Primary</span>' : ''}
                <span class="cwp-v2-badge is-neutral" style="font-size:9.5px;">${seater}</span>
              </div>
            </div>
            <div class="cwp-v2-cust-rvc-body">
              <span class="cwp-v2-cust-color-dot" style="background:${getColorHex(color)};" title="Colour: ${color}"></span>
              <span>${make} • ${color}</span>
            </div>
            <div class="cwp-v2-cust-rvc-extra" style="display:none;" id="rvcExtra_${i}">
              <div><strong>Default Location:</strong> ${escapeHtml(cust.address || 'Standard Location')}</div>
              ${cust.parkingDetails ? `<div><strong>Parking:</strong> ${escapeHtml(cust.parkingDetails)}</div>` : ''}
            </div>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-xs" style="align-self:flex-start; margin-top:2px; font-size:10.5px;" onclick="window.CWP_ADMIN_V2.customers.toggleVehicleExtra(${i})">
              <span>View Location &amp; Notes</span>
            </button>
          </div>
        `;
      }).join('');
    } else {
      vehiclesHtml = `<div style="font-size:12px; color:#64748b; font-style:italic;">No registered vehicles.</div>`;
    }

    // Schedule / Frequency
    const legacyPlanName = cust.packageName || cust.packageType || '';
    const staffName = cust.staffName || (cust.staffId ? `Staff ID ${cust.staffId}` : 'Unassigned');

    panel.innerHTML = `
      <!-- 8.1 Header -->
      <div class="cwp-v2-cust-detail-header">
        <div class="cwp-v2-cust-detail-title-box">
          <div class="cwp-v2-cust-avatar">${initials}</div>
          <div class="cwp-v2-cust-detail-name-wrap">
            <h2 class="cwp-v2-cust-detail-name">${name}</h2>
            <div class="cwp-v2-cust-detail-phone-row">
              <span>${phoneDisplay}</span>
              ${statusBadge}
            </div>
          </div>
        </div>
        <div class="cwp-v2-cust-detail-actions">
          ${cleanPhone ? `
            <a href="https://wa.me/91${cleanPhone}" target="_blank" rel="noopener" class="cwp-v2-cust-action-btn" title="Send WhatsApp">
              <span class="material-symbols-outlined" style="color:#16a34a;">chat</span>
            </a>
            <a href="tel:${cleanPhone}" class="cwp-v2-cust-action-btn" title="Call">
              <span class="material-symbols-outlined">call</span>
            </a>
          ` : ''}
          <button type="button" class="cwp-v2-cust-action-btn" id="v2BtnEditCustomer" title="Edit Customer">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <div style="position:relative; display:inline-block;">
            <button type="button" class="cwp-v2-cust-action-btn" id="v2BtnCustOverflow" title="More Actions">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
            <div id="v2CustOverflowMenu" style="display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10; min-width:160px; padding:4px 0;">
              <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; text-align:left; justify-content:flex-start; border-radius:0;" id="v2OverflowToggleActive">
                <span class="material-symbols-outlined" style="font-size:16px;">${isActive ? 'pause_circle' : 'play_circle'}</span>
                <span>${isActive ? 'Suspend Account' : 'Activate Account'}</span>
              </button>
              <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" style="width:100%; text-align:left; justify-content:flex-start; border-radius:0; color:#dc2626;" id="v2OverflowDelete">
                <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                <span>Delete Customer</span>
              </button>
            </div>
          </div>
          <button type="button" class="cwp-v2-cust-action-btn" id="v2BtnCloseDetailPanel" title="Close details" aria-label="Close customer details">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>

      <!-- 8.2 Customer Summary -->
      <div class="cwp-v2-cust-summary-grid">
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Phone</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(cust.phone || '—')}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Customer Since</span>
          <span class="cwp-v2-cust-summary-val">${customerSince}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Legacy plan label</span>
          <span class="cwp-v2-cust-summary-val">${legacyPlanName ? `${escapeHtml(legacyPlanName)} (legacy record)` : 'No legacy plan label'}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Assigned Staff</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(staffName)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item" style="grid-column: 1 / -1;">
          <span class="cwp-v2-cust-summary-label">Service Address</span>
          <span class="cwp-v2-cust-summary-val" style="font-weight:400; font-size:11.5px;">${escapeHtml(cust.address || 'No registered address')}</span>
        </div>
      </div>

      <!-- 8.3 Vehicle Cards -->
      <div>
        <div class="cwp-v2-cust-section-title">
          <span>Registered Vehicles (${vehList.length})</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-xs" id="v2BtnAddVehicleDirect">
            <span class="material-symbols-outlined" style="font-size:14px;">add</span>
            <span>Add Vehicle</span>
          </button>
        </div>
        <div class="cwp-v2-cust-vehicles-list">
          ${vehiclesHtml}
        </div>
      </div>

      <div>
        <div class="cwp-v2-cust-section-title"><span>SEE Entitlements</span><button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-xs" id="v2CustSeePurchaseOpen">Purchase Package</button></div>
        <div id="v2CustSeeBalance" aria-live="polite">Loading canonical entitlement balance…</div>
      </div>
      <div>
        <div class="cwp-v2-cust-section-title"><span>Service &amp; booking history</span></div>
        <div id="v2CustSeeHistory" aria-live="polite">Loading recorded service history…</div>
      </div>
    `;

    bindDetailPanelEvents(cust);
    loadCustomerSeeInspector(cust);
  }

  async function loadCustomerSeeInspector(cust) {
    const balanceEl = document.getElementById('v2CustSeeBalance');
    const historyEl = document.getElementById('v2CustSeeHistory');
    if (!balanceEl || !historyEl) return;
    const customerId = cust.id;
    try {
      const response = await fetch(`/api/see/customers/${encodeURIComponent(customerId)}/balance`, { credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
      if (document.getElementById('v2CustSeeBalance') !== balanceEl) return;
      const accounts = Array.isArray(body.accounts) ? body.accounts : [];
      balanceEl.innerHTML = accounts.length ? `<div class="cwp-v2-cust-activity-list">${accounts.map(account => {
        const remaining = Number(account.remaining_qty || 0);
        const available = Number(account.available_qty ?? remaining);
        return `<div class="cwp-v2-cust-activity-item"><span class="material-symbols-outlined cwp-v2-cust-activity-icon">account_balance_wallet</span><div class="cwp-v2-cust-activity-info"><span class="cwp-v2-cust-activity-title">${escapeHtml(account.package_name || account.service_name || account.addon_name || 'Entitlement')} · ${escapeHtml(account.status || 'unknown')}</span><span class="cwp-v2-cust-activity-time">Purchased ${Number(account.purchased_qty || 0)} · Reserved ${Number(account.reserved_qty || 0)} · Consumed ${Number(account.consumed_qty || 0)} · Available ${available} · Remaining balance ${remaining}${account.valid_to ? ` · Valid to ${escapeHtml(String(account.valid_to).slice(0, 10))}` : ''}</span><span class="cwp-v2-cust-activity-time">Purchase ${escapeHtml(account.purchase_snapshot_id || '—')} · Account ${escapeHtml(account.id)}</span><button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-xs" data-see-ledger="${escapeHtml(account.id)}">View ledger</button><div data-see-ledger-content="${escapeHtml(account.id)}"></div></div></div>`;
      }).join('')}</div>` : '<div class="cwp-v2-cust-activity-time">No canonical SEE entitlement accounts are recorded for this customer.</div>';
    } catch (error) {
      balanceEl.textContent = `Entitlement balance unavailable: ${error.message}`;
    }

    try {
      const history = await window.CWP_ADMIN_V2.api.request('getCustomerServiceJobs', { customerId });
      if (document.getElementById('v2CustSeeHistory') !== historyEl) return;
      const jobs = Array.isArray(history.all) ? history.all : [];
      historyEl.innerHTML = jobs.length ? `<div class="cwp-v2-cust-activity-list">${jobs.map(job => {
        const canonical = Boolean(job.service_payload && job.service_payload._seeManaged);
        const executionText = canonical ? (job.latest_execution_id ? `Execution ${job.latest_execution_id} · ${escapeHtml(job.latest_execution_outcome || 'recorded')}` : 'No canonical execution record') : 'Legacy record';
        const proof = job.latest_proof_photos || {};
        const proofText = job.latest_execution_id ? ` · Proof ${Array.isArray(proof.before) ? proof.before.length : 0} before / ${Array.isArray(proof.after) ? proof.after.length : 0} after` : '';
        return `<div class="cwp-v2-cust-activity-item"><span class="material-symbols-outlined cwp-v2-cust-activity-icon">${job.status === 'completed' ? 'check_circle' : 'event_note'}</span><div class="cwp-v2-cust-activity-info"><span class="cwp-v2-cust-activity-title">${escapeHtml(job.service_name_snapshot || job.service_type || 'Service booking')} · ${escapeHtml(job.status || 'unknown')}</span><span class="cwp-v2-cust-activity-time">${escapeHtml(job.scheduled_date || 'Unscheduled')} · ${canonical ? 'SEE canonical job' : 'Legacy job'} · Job ${escapeHtml(job.id)}</span><span class="cwp-v2-cust-activity-time">${executionText}${proofText}</span></div></div>`;
      }).join('')}</div>` : '<div class="cwp-v2-cust-activity-time">No recorded service jobs.</div>';
    } catch (error) {
      historyEl.textContent = `Service history unavailable: ${error.message}`;
    }
  }

  const seePurchaseDraft = { customerId: null, saleReference: null, packages: [], vehicles: [], locations: [], quote: null, quoting: false, quoteSequence: 0 };

  function createPurchaseReference() {
    if (window.crypto?.randomUUID) return `CWP-${window.crypto.randomUUID()}`;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `CWP-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  }

  async function openCustomerPurchase(cust) {
    if (!cust?.id) return;
    const errorEl = document.getElementById('v2CustPurchaseError');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    seePurchaseDraft.customerId = cust.id;
    seePurchaseDraft.saleReference = createPurchaseReference();
    seePurchaseDraft.quote = null;
    document.getElementById('v2CustPurchaseCustomerId').value = cust.id;
    document.getElementById('v2CustPurchaseQuantity').value = '1';
    document.getElementById('v2CustPurchaseCity').value = '';
    document.getElementById('v2CustPurchaseZone').value = '';
    document.getElementById('v2CustPurchaseTerms').value = '';
    document.getElementById('v2CustPurchasePrice').textContent = 'Select an active package to calculate its price.';
    document.getElementById('v2CustPurchaseReview').textContent = `Sale reference: ${seePurchaseDraft.saleReference}. This reference remains fixed for safe retries.`;
    try {
      const [packagesResponse, contextResponse] = await Promise.all([
        fetch('/api/see/packages?status=active&limit=200&offset=0', { credentials: 'same-origin' }).then(r => r.json().then(b => { if (!r.ok || b.success === false) throw new Error(b.error || `HTTP ${r.status}`); return b; })),
        fetch(`/api/see/customers/${encodeURIComponent(cust.id)}/context`, { credentials: 'same-origin' }).then(r => r.json().then(b => { if (!r.ok || b.success === false) throw new Error(b.error || `HTTP ${r.status}`); return b; }))
      ]);
      seePurchaseDraft.packages = (packagesResponse.packages || []).filter(pkg => pkg.status === 'active' && pkg.service_category_id !== 'daily_car_cleaning' && pkg.main_service_code !== 'DCC_DAILY');
      seePurchaseDraft.vehicles = contextResponse.vehicles || [];
      seePurchaseDraft.locations = contextResponse.locations || [];
      const packageSel = document.getElementById('v2CustPurchasePackage');
      const vehicleSel = document.getElementById('v2CustPurchaseVehicle');
      const locationSel = document.getElementById('v2CustPurchaseLocation');
      packageSel.innerHTML = '<option value="">Select package…</option>' + seePurchaseDraft.packages.map(pkg => `<option value="${escapeHtml(pkg.id)}">${escapeHtml(pkg.name)} · v${escapeHtml(pkg.version || 1)}</option>`).join('');
      vehicleSel.innerHTML = '<option value="">Select vehicle…</option>' + seePurchaseDraft.vehicles.filter(vehicle => vehicle.is_active !== false).map(vehicle => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.registration_no || vehicle.brand_or_model || 'Vehicle')}</option>`).join('');
      locationSel.innerHTML = '<option value="">Select service location…</option>' + seePurchaseDraft.locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.location_name || location.address_text || 'Service location')}</option>`).join('');
      if (!seePurchaseDraft.packages.length) throw new Error('No active SEE packages are available for purchase.');
      if (!seePurchaseDraft.vehicles.length) throw new Error('This customer has no registered vehicle for package purchase.');
      if (!seePurchaseDraft.locations.length) throw new Error('This customer has no service location for package purchase.');
      window.CWP_ADMIN_V2.overlay?.open('v2CustPurchaseModal');
      await updateCustomerPurchaseQuote();
    } catch (error) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = error.message; }
      window.CWP_ADMIN_V2.overlay?.open('v2CustPurchaseModal');
    }
  }

  async function updateCustomerPurchaseQuote() {
    const requestSequence = ++seePurchaseDraft.quoteSequence;
    const packageId = document.getElementById('v2CustPurchasePackage')?.value;
    const pkg = seePurchaseDraft.packages.find(item => item.id === packageId);
    const quantity = parseInt(document.getElementById('v2CustPurchaseQuantity')?.value || '1', 10);
    const output = document.getElementById('v2CustPurchasePrice');
    const review = document.getElementById('v2CustPurchaseReview');
    seePurchaseDraft.quote = null;
    if (!pkg || !Number.isInteger(quantity) || quantity < 1) {
      seePurchaseDraft.quote = null;
      if (output) output.textContent = 'Select an active package and a valid quantity to calculate price.';
      return;
    }
    seePurchaseDraft.quoting = true;
    if (output) output.textContent = 'Calculating package price…';
    try {
      const location = seePurchaseDraft.locations.find(item => item.id === document.getElementById('v2CustPurchaseLocation')?.value);
      const response = await fetch(`/api/see/packages/${encodeURIComponent(packageId)}/price`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: document.getElementById('v2CustPurchaseCity')?.value.trim() || location?.city || null, zone: document.getElementById('v2CustPurchaseZone')?.value.trim() || location?.zone || null, vehicleSegment: pkg.vehicle_segment || null, quantity, effectiveDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) })
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
      if (requestSequence !== seePurchaseDraft.quoteSequence || document.getElementById('v2CustPurchasePackage')?.value !== packageId) return;
      const eligibility = pkg.city_zone_eligibility || { all_cities: true, cities: [], zones: [] };
      const city = document.getElementById('v2CustPurchaseCity')?.value.trim() || location?.city || '';
      const zone = document.getElementById('v2CustPurchaseZone')?.value.trim() || location?.zone || '';
      if (eligibility.all_cities === false && (!city || !(eligibility.cities || []).some(value => String(value).toLowerCase() === city.toLowerCase()))) throw new Error(`Package is not available for city ${city || '(missing)'}.`);
      if ((eligibility.zones || []).length && (!zone || !eligibility.zones.some(value => String(value).toLowerCase() === zone.toLowerCase()))) throw new Error(`Package is not available for zone ${zone || '(missing)'}.`);
      seePurchaseDraft.quote = body.pricing;
      if (output) output.textContent = `Price: ₹${Number(body.pricing.basePrice).toFixed(2)} · ${body.pricing.pricingModel}${body.pricing.matchedRuleId ? ` · Pricing rule ${body.pricing.matchedRuleId}` : ''}`;
      const vehicle = seePurchaseDraft.vehicles.find(item => item.id === document.getElementById('v2CustPurchaseVehicle')?.value);
      if (review) review.textContent = `${pkg.name} · version ${pkg.version || 1} · ${quantity} unit(s) · ${vehicle?.registration_no || 'vehicle pending'} · ${location?.location_name || location?.address_text || 'location pending'} · ₹${Number(body.pricing.basePrice).toFixed(2)} · ${pkg.validity_value} ${pkg.validity_unit}`;
    } catch (error) {
      if (requestSequence !== seePurchaseDraft.quoteSequence) return;
      seePurchaseDraft.quote = null;
      if (output) output.textContent = `Price could not be calculated: ${error.message}`;
    } finally { if (requestSequence === seePurchaseDraft.quoteSequence) seePurchaseDraft.quoting = false; }
  }

  async function submitCustomerPurchase(event) {
    event.preventDefault();
    const packageId = document.getElementById('v2CustPurchasePackage')?.value;
    const vehicleId = document.getElementById('v2CustPurchaseVehicle')?.value;
    const locationId = document.getElementById('v2CustPurchaseLocation')?.value;
    const errorEl = document.getElementById('v2CustPurchaseError');
    if (!packageId || !vehicleId || !locationId || !seePurchaseDraft.quote || seePurchaseDraft.quoting) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = 'Select an active package, vehicle and location, then wait for the price quote before confirming.'; }
      return;
    }
    const button = document.getElementById('v2CustPurchaseConfirm');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(button, async () => {
        const csrf = window.CWP_ADMIN_V2.auth?.getCsrfToken?.();
        const response = await fetch('/api/see/purchases', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
          body: JSON.stringify({
            customerId: seePurchaseDraft.customerId,
            packageIdOrCode: packageId,
            vehicleId,
            locationId,
            city: document.getElementById('v2CustPurchaseCity').value.trim() || null,
            zone: document.getElementById('v2CustPurchaseZone').value.trim() || null,
            quantity: parseInt(document.getElementById('v2CustPurchaseQuantity').value, 10),
            saleReference: seePurchaseDraft.saleReference,
            terms: { adminNotes: document.getElementById('v2CustPurchaseTerms').value.trim() || null }
          })
        });
        const body = await response.json();
        if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
        window.CWP_ADMIN_V2.overlay?.close('v2CustPurchaseModal');
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.success(`${body.snapshot?.package_name || 'Package'} purchased. Snapshot ${body.snapshot?.id || 'created'}; ${body.accounts?.length || 0} entitlement account(s) created.`);
        const customer = state.allCustomers.find(item => String(item.id) === String(seePurchaseDraft.customerId)) || state.selectedCustomer;
        if (customer) await loadCustomerSeeInspector(customer);
      });
    } catch (error) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = error.message; }
    }
  }

  function toggleVehicleExtra(idx) {
    const el = document.getElementById(`rvcExtra_${idx}`);
    if (el) {
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  }

  function getColorHex(colorName) {
    const c = (colorName || '').toLowerCase().trim();
    if (c.includes('white')) return '#f8fafc';
    if (c.includes('black')) return '#0f172a';
    if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return '#94a3b8';
    if (c.includes('red')) return '#ef4444';
    if (c.includes('blue')) return '#3b82f6';
    if (c.includes('brown')) return '#854d0e';
    if (c.includes('green')) return '#22c55e';
    if (c.includes('gold') || c.includes('yellow')) return '#eab308';
    return '#cbd5e1';
  }

  function parseVehicleStringToArray(vehStr, cust) {
    if (!vehStr) return [];
    const parts = vehStr.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
    return parts.map((p, idx) => {
      const match = p.match(/^([A-Za-z0-9\s]{4,14})(.*)$/);
      let plate = p;
      let model = cust.carMake || '';
      if (match) {
        plate = match[1].trim();
        if (match[2] && match[2].trim()) {
          model = match[2].trim().replace(/^[\(\-–—\s]+|[\)\s]+$/g, '');
        }
      }
      return {
        registration_no: plate,
        brand_or_model: model,
        car_make: model,
        car_color: cust.carColor || '',
        seater_type: cust.seaterType || '5_seater',
        is_primary: idx === 0
      };
    });
  }

  // -------------------------------------------------------------------------
  // 11. ADD CUSTOMER GUIDED WIZARD (5 STEPS)
  // -------------------------------------------------------------------------
  function openAddCustomerModal() {
    state.addWizard.currentStep = 1;
    state.addWizard.vehicles = [
      { registrationNo: '', carMake: '', carColor: 'White', seaterType: '5_seater', isPrimary: true }
    ];

    // Reset wizard fields
    const form = document.getElementById('v2AddCustomerForm');
    if (form) form.reset();

    renderWizardVehicles();
    goToAddCustomerStep(1);

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAddCustomer');
    }
  }

  function goToAddCustomerStep(stepNum) {
    if (stepNum < 1 || stepNum > 5) return;

    // Validate current step before advancing
    if (stepNum > state.addWizard.currentStep) {
      const valid = validateAddCustomerStep(state.addWizard.currentStep);
      if (!valid) return;
    }

    state.addWizard.currentStep = stepNum;

    // Update stepper UI
    const steps = document.querySelectorAll('.cwp-v2-wizard-step');
    steps.forEach(s => {
      const num = parseInt(s.getAttribute('data-step'), 10);
      s.classList.remove('is-active');
      if (num === stepNum) {
        s.classList.add('is-active');
        s.setAttribute('aria-current', 'step');
      } else if (num < stepNum) {
        s.classList.add('is-completed');
        s.removeAttribute('aria-current');
      } else {
        s.classList.remove('is-completed');
        s.removeAttribute('aria-current');
      }
    });

    // Update panes UI
    const panes = document.querySelectorAll('.cwp-v2-wizard-pane');
    panes.forEach(p => {
      const num = parseInt(p.getAttribute('data-step-pane'), 10);
      p.classList.toggle('is-active', num === stepNum);
    });

    // Update buttons
    const prevBtn = document.getElementById('v2WizardBtnPrev');
    const nextBtn = document.getElementById('v2WizardBtnNext');
    const submitBtn = document.getElementById('v2WizardBtnSubmit');

    if (prevBtn) prevBtn.style.display = stepNum === 1 ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.style.display = stepNum === 5 ? 'none' : 'inline-flex';
    if (submitBtn) submitBtn.style.display = stepNum === 5 ? 'inline-flex' : 'none';

    if (stepNum === 5) {
      populateReviewStep();
    }
  }

  function validateAddCustomerStep(step) {
    let isValid = true;

    if (step === 1) {
      const nameInput = document.getElementById('v2AddCustName');
      const phoneInput = document.getElementById('v2AddCustPhone');
      const addrInput = document.getElementById('v2AddCustAddress');

      if (!nameInput || !nameInput.value.trim()) {
        showFieldError('v2AddCustNameField', 'Customer name is required.');
        isValid = false;
      } else {
        clearFieldError('v2AddCustNameField');
      }

      if (!phoneInput || !isValidIndianPhone(phoneInput.value.trim())) {
        showFieldError('v2AddCustPhoneField', 'Valid 10-digit Indian mobile number required (starting 6-9).');
        isValid = false;
      } else {
        clearFieldError('v2AddCustPhoneField');
      }

      if (!addrInput || !addrInput.value.trim()) {
        showFieldError('v2AddCustAddressField', 'Service address is required.');
        isValid = false;
      } else {
        clearFieldError('v2AddCustAddressField');
      }
    } else if (step === 2) {
      syncWizardVehiclesFromInputs();
      if (state.addWizard.vehicles.length === 0) {
        if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Please add at least one vehicle.');
        isValid = false;
      } else {
        const first = state.addWizard.vehicles[0];
        if (!first.registrationNo || !first.registrationNo.trim()) {
          if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Vehicle registration number is required.');
          isValid = false;
        }
      }
    }

    return isValid;
  }

  function showFieldError(fieldId, msg) {
    const f = document.getElementById(fieldId);
    if (f) {
      f.classList.add('has-error');
      const err = f.querySelector('.cwp-v2-field-error');
      if (err) err.textContent = msg;
    }
  }

  function clearFieldError(fieldId) {
    const f = document.getElementById(fieldId);
    if (f) {
      f.classList.remove('has-error');
      const err = f.querySelector('.cwp-v2-field-error');
      if (err) err.textContent = '';
    }
  }

  function renderWizardVehicles() {
    const container = document.getElementById('v2WizardVehiclesContainer');
    if (!container) return;

    let html = '';
    state.addWizard.vehicles.forEach((v, idx) => {
      html += `
        <div class="cwp-v2-cust-rich-vehicle-card" data-wiz-idx="${idx}" style="padding:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">Vehicle #${idx + 1}</strong>
            ${state.addWizard.vehicles.length > 1 ? `
              <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-xs" onclick="window.CWP_ADMIN_V2.customers.removeWizardVehicle(${idx})" style="color:#dc2626;">
                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                <span>Remove</span>
              </button>
            ` : ''}
          </div>
          <div class="cwp-v2-form-grid">
            <div class="cwp-v2-field">
              <label class="is-required">Registration Number</label>
              <input type="text" class="cwp-v2-input wiz-veh-reg" value="${escapeHtml(v.registrationNo)}" placeholder="UP32 AB 1234" required />
            </div>
            <div class="cwp-v2-field">
              <label>Make &amp; Model</label>
              <input type="text" class="cwp-v2-input wiz-veh-make" value="${escapeHtml(v.carMake)}" placeholder="Hyundai Creta" />
            </div>
            <div class="cwp-v2-field">
              <label>Vehicle Colour</label>
              <select class="cwp-v2-select wiz-veh-color">
                <option value="White" ${v.carColor === 'White' ? 'selected' : ''}>White</option>
                <option value="Black" ${v.carColor === 'Black' ? 'selected' : ''}>Black</option>
                <option value="Silver" ${v.carColor === 'Silver' ? 'selected' : ''}>Silver</option>
                <option value="Grey" ${v.carColor === 'Grey' ? 'selected' : ''}>Grey</option>
                <option value="Red" ${v.carColor === 'Red' ? 'selected' : ''}>Red</option>
                <option value="Blue" ${v.carColor === 'Blue' ? 'selected' : ''}>Blue</option>
                <option value="Brown" ${v.carColor === 'Brown' ? 'selected' : ''}>Brown</option>
              </select>
            </div>
            <div class="cwp-v2-field">
              <label>Seater Type</label>
              <select class="cwp-v2-select wiz-veh-seater">
                <option value="5_seater" ${v.seaterType === '5_seater' ? 'selected' : ''}>5 Seater</option>
                <option value="7_seater" ${v.seaterType === '7_seater' ? 'selected' : ''}>7 Seater</option>
              </select>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function addWizardVehicle() {
    syncWizardVehiclesFromInputs();
    state.addWizard.vehicles.push({
      registrationNo: '',
      carMake: '',
      carColor: 'White',
      seaterType: '5_seater',
      isPrimary: false
    });
    renderWizardVehicles();
  }

  function removeWizardVehicle(idx) {
    syncWizardVehiclesFromInputs();
    if (state.addWizard.vehicles.length <= 1) return;
    state.addWizard.vehicles.splice(idx, 1);
    renderWizardVehicles();
  }

  function syncWizardVehiclesFromInputs() {
    const cards = document.querySelectorAll('#v2WizardVehiclesContainer .cwp-v2-cust-rich-vehicle-card');
    cards.forEach((card, idx) => {
      const reg = card.querySelector('.wiz-veh-reg')?.value || '';
      const make = card.querySelector('.wiz-veh-make')?.value || '';
      const color = card.querySelector('.wiz-veh-color')?.value || 'White';
      const seater = card.querySelector('.wiz-veh-seater')?.value || '5_seater';

      if (state.addWizard.vehicles[idx]) {
        state.addWizard.vehicles[idx].registrationNo = reg.trim().toUpperCase();
        state.addWizard.vehicles[idx].carMake = make.trim();
        state.addWizard.vehicles[idx].carColor = color;
        state.addWizard.vehicles[idx].seaterType = seater;
      }
    });
  }

  function populateReviewStep() {
    syncWizardVehiclesFromInputs();

    const name = document.getElementById('v2AddCustName')?.value.trim() || '—';
    const phone = document.getElementById('v2AddCustPhone')?.value.trim() || '—';
    const altPhone = document.getElementById('v2AddCustAltPhone')?.value.trim() || 'None';
    const address = document.getElementById('v2AddCustAddress')?.value.trim() || '—';
    const category = document.getElementById('v2AddCustCategory')?.value || 'Daily Car Cleaning';
    const pkg = document.getElementById('v2AddCustPackage')?.value || 'DCC ONLY';
    const staff = document.getElementById('v2AddCustStaff')?.selectedOptions[0]?.text || 'Unassigned';
    const route = document.getElementById('v2AddCustRoute')?.value || 'Auto-Route';

    const revContainer = document.getElementById('v2WizardReviewContainer');
    if (!revContainer) return;

    let vehSummary = state.addWizard.vehicles.map((v, i) =>
      `• ${v.registrationNo || 'No Plate'} (${v.carMake || 'Car'}, ${v.carColor}, ${v.seaterType})`
    ).join('<br/>');

    revContainer.innerHTML = `
      <div class="cwp-v2-cust-summary-grid" style="padding:12px;">
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Customer Name</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(name)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Primary Mobile</span>
          <span class="cwp-v2-cust-summary-val">${formatPhoneDisplay(phone)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Alternate Contact</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(altPhone)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Selected Plan</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(pkg)} (${escapeHtml(category)})</span>
        </div>
        <div class="cwp-v2-cust-summary-item" style="grid-column:1 / -1;">
          <span class="cwp-v2-cust-summary-label">Service Address</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(address)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Route / Zone</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(route)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item">
          <span class="cwp-v2-cust-summary-label">Assigned Staff</span>
          <span class="cwp-v2-cust-summary-val">${escapeHtml(staff)}</span>
        </div>
        <div class="cwp-v2-cust-summary-item" style="grid-column:1 / -1;">
          <span class="cwp-v2-cust-summary-label">Vehicles (${state.addWizard.vehicles.length})</span>
          <span class="cwp-v2-cust-summary-val" style="font-weight:400; line-height:1.5;">${vehSummary}</span>
        </div>
      </div>
    `;
  }

  async function submitAddCustomer() {
    syncWizardVehiclesFromInputs();

    const name = document.getElementById('v2AddCustName')?.value.trim();
    const phone = document.getElementById('v2AddCustPhone')?.value.trim();
    const altPhone = document.getElementById('v2AddCustAltPhone')?.value.trim();
    const email = document.getElementById('v2AddCustEmail')?.value.trim();
    const address = document.getElementById('v2AddCustAddress')?.value.trim();
    const category = document.getElementById('v2AddCustCategory')?.value || 'Daily Car Cleaning';
    const pkg = document.getElementById('v2AddCustPackage')?.value || 'DCC ONLY';
    const staffId = document.getElementById('v2AddCustStaff')?.value || '';
    const route = document.getElementById('v2AddCustRoute')?.value || '';
    const notes = document.getElementById('v2AddCustNotes')?.value.trim();

    if (!name || !isValidIndianPhone(phone) || !address) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error('Please complete required fields.');
      goToAddCustomerStep(1);
      return;
    }

    const firstVeh = state.addWizard.vehicles[0] || {};
    const vehSummaryParts = state.addWizard.vehicles.map(v => `${v.registrationNo} ${v.carMake}`.trim()).filter(Boolean);
    const vehicleString = vehSummaryParts.join(' / ');

    const customerData = {
      customerName: name,
      customerNumber: getCleanPhone10(phone),
      altPhone: altPhone || '',
      email: email || '',
      address: address,
      serviceCategory: category,
      packageType: pkg,
      packageName: pkg,
      staffId: staffId || null,
      route: route || '',
      notes: notes || '',
      carMake: firstVeh.carMake || '',
      carColor: firstVeh.carColor || 'White',
      seaterType: firstVeh.seaterType || '5_seater',
      vehicle: vehicleString,
      vehicles: state.addWizard.vehicles.map(v => ({
        registration_no: v.registrationNo,
        brand_or_model: v.carMake,
        car_make: v.carMake,
        car_color: v.carColor,
        seater_type: v.seaterType
      }))
    };

    const submitBtn = document.getElementById('v2WizardBtnSubmit');

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('saveCustomer', { customerData });
        if (res && (res.success !== false)) {
          if (window.CWP_ADMIN_V2.toast) {
            window.CWP_ADMIN_V2.toast.success('Customer added successfully!');
          }
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2ModalAddCustomer');
          }
          await loadData(true);
          // If server returned created customer, select it
          const createdId = res.customer?.id || res.id;
          if (createdId) {
            selectCustomer(createdId);
          }
        } else {
          throw new Error((res && res.error) || 'Failed to create customer');
        }
      });
    } catch (err) {
      console.error('[AddCustomer] Submission failed:', err);
      if (window.CWP_ADMIN_V2.toast) {
        window.CWP_ADMIN_V2.toast.error(err.message || 'Submission failed');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 12. EDIT CUSTOMER DIRECT TABBED FORM (4 TABS)
  // -------------------------------------------------------------------------
  function openEditCustomerModal(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    state.editForm.customer = target;
    state.editForm.currentTab = 'info';

    // Pre-populate fields
    document.getElementById('v2EditCustId').value = target.id;
    document.getElementById('v2EditCustName').value = target.customerName || target.name || '';
    document.getElementById('v2EditCustPhone').value = target.phone || target.customerNumber || '';
    document.getElementById('v2EditCustAltPhone').value = target.altPhone || '';
    document.getElementById('v2EditCustEmail').value = target.email || '';
    document.getElementById('v2EditCustAddress').value = target.address || '';
    document.getElementById('v2EditCustCategory').value = target.serviceCategory || target.interestedService || 'Daily Car Cleaning';
    document.getElementById('v2EditCustPackage').value = target.packageName || target.packageType || 'DCC ONLY';
    document.getElementById('v2EditCustStaff').value = target.staffId || '';
    document.getElementById('v2EditCustStatus').value = (target.active === 'No' || target.isStopped) ? 'inactive' : 'active';
    document.getElementById('v2EditCustNotes').value = target.notes || '';

    // Vehicles
    state.editForm.vehicles = (Array.isArray(target.vehicles) && target.vehicles.length > 0)
      ? target.vehicles.map(v => ({
          registrationNo: v.registration_no || v.plateNumber || '',
          carMake: v.brand_or_model || v.car_make || '',
          carColor: v.car_color || target.carColor || 'White',
          seaterType: v.seater_type || target.seaterType || '5_seater'
        }))
      : parseVehicleStringToArray(target.vehicle, target).map(v => ({
          registrationNo: v.registration_no,
          carMake: v.car_make,
          carColor: v.car_color,
          seaterType: v.seater_type
        }));

    if (state.editForm.vehicles.length === 0) {
      state.editForm.vehicles = [{ registrationNo: '', carMake: '', carColor: 'White', seaterType: '5_seater' }];
    }

    renderEditVehicles();
    switchEditCustomerTab('info');

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalEditCustomer');
    }
  }

  function switchEditCustomerTab(tabName) {
    state.editForm.currentTab = tabName;

    const btns = document.querySelectorAll('.cwp-v2-edit-tab-btn');
    btns.forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-edit-tab') === tabName);
    });

    const panes = document.querySelectorAll('.cwp-v2-edit-tab-pane');
    panes.forEach(p => {
      p.classList.toggle('is-active', p.getAttribute('data-edit-pane') === tabName);
    });
  }

  function renderEditVehicles() {
    const container = document.getElementById('v2EditVehiclesContainer');
    if (!container) return;

    let html = '';
    state.editForm.vehicles.forEach((v, idx) => {
      html += `
        <div class="cwp-v2-cust-rich-vehicle-card" data-edit-veh-idx="${idx}" style="padding:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">Vehicle #${idx + 1}</strong>
            ${state.editForm.vehicles.length > 1 ? `
              <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-xs" onclick="window.CWP_ADMIN_V2.customers.removeEditVehicle(${idx})" style="color:#dc2626;">
                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                <span>Remove</span>
              </button>
            ` : ''}
          </div>
          <div class="cwp-v2-form-grid">
            <div class="cwp-v2-field">
              <label class="is-required">Registration Number</label>
              <input type="text" class="cwp-v2-input edit-veh-reg" value="${escapeHtml(v.registrationNo)}" required />
            </div>
            <div class="cwp-v2-field">
              <label>Make &amp; Model</label>
              <input type="text" class="cwp-v2-input edit-veh-make" value="${escapeHtml(v.carMake)}" />
            </div>
            <div class="cwp-v2-field">
              <label>Vehicle Colour</label>
              <select class="cwp-v2-select edit-veh-color">
                <option value="White" ${v.carColor === 'White' ? 'selected' : ''}>White</option>
                <option value="Black" ${v.carColor === 'Black' ? 'selected' : ''}>Black</option>
                <option value="Silver" ${v.carColor === 'Silver' ? 'selected' : ''}>Silver</option>
                <option value="Grey" ${v.carColor === 'Grey' ? 'selected' : ''}>Grey</option>
                <option value="Red" ${v.carColor === 'Red' ? 'selected' : ''}>Red</option>
                <option value="Blue" ${v.carColor === 'Blue' ? 'selected' : ''}>Blue</option>
                <option value="Brown" ${v.carColor === 'Brown' ? 'selected' : ''}>Brown</option>
              </select>
            </div>
            <div class="cwp-v2-field">
              <label>Seater Type</label>
              <select class="cwp-v2-select edit-veh-seater">
                <option value="5_seater" ${v.seaterType === '5_seater' ? 'selected' : ''}>5 Seater</option>
                <option value="7_seater" ${v.seaterType === '7_seater' ? 'selected' : ''}>7 Seater</option>
              </select>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function addEditVehicle() {
    syncEditVehiclesFromInputs();
    state.editForm.vehicles.push({
      registrationNo: '',
      carMake: '',
      carColor: 'White',
      seaterType: '5_seater'
    });
    renderEditVehicles();
  }

  function removeEditVehicle(idx) {
    syncEditVehiclesFromInputs();
    if (state.editForm.vehicles.length <= 1) return;
    state.editForm.vehicles.splice(idx, 1);
    renderEditVehicles();
  }

  function syncEditVehiclesFromInputs() {
    const cards = document.querySelectorAll('#v2EditVehiclesContainer .cwp-v2-cust-rich-vehicle-card');
    cards.forEach((card, idx) => {
      const reg = card.querySelector('.edit-veh-reg')?.value || '';
      const make = card.querySelector('.edit-veh-make')?.value || '';
      const color = card.querySelector('.edit-veh-color')?.value || 'White';
      const seater = card.querySelector('.edit-veh-seater')?.value || '5_seater';

      if (state.editForm.vehicles[idx]) {
        state.editForm.vehicles[idx].registrationNo = reg.trim().toUpperCase();
        state.editForm.vehicles[idx].carMake = make.trim();
        state.editForm.vehicles[idx].carColor = color;
        state.editForm.vehicles[idx].seaterType = seater;
      }
    });
  }

  async function submitEditCustomer() {
    syncEditVehiclesFromInputs();

    const id = document.getElementById('v2EditCustId')?.value;
    const name = document.getElementById('v2EditCustName')?.value.trim();
    const phone = document.getElementById('v2EditCustPhone')?.value.trim();
    const altPhone = document.getElementById('v2EditCustAltPhone')?.value.trim();
    const email = document.getElementById('v2EditCustEmail')?.value.trim();
    const address = document.getElementById('v2EditCustAddress')?.value.trim();
    const category = document.getElementById('v2EditCustCategory')?.value;
    const pkg = document.getElementById('v2EditCustPackage')?.value;
    const staffId = document.getElementById('v2EditCustStaff')?.value;
    const statusVal = document.getElementById('v2EditCustStatus')?.value;
    const notes = document.getElementById('v2EditCustNotes')?.value.trim();

    if (!name || !isValidIndianPhone(phone) || !address) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error('Please verify required fields.');
      switchEditCustomerTab('info');
      return;
    }

    const firstVeh = state.editForm.vehicles[0] || {};
    const vehSummaryParts = state.editForm.vehicles.map(v => `${v.registrationNo} ${v.carMake}`.trim()).filter(Boolean);
    const vehicleString = vehSummaryParts.join(' / ');

    const updatedData = {
      id: id,
      customerName: name,
      customerNumber: getCleanPhone10(phone),
      altPhone: altPhone || '',
      email: email || '',
      address: address,
      serviceCategory: category,
      packageType: pkg,
      packageName: pkg,
      staffId: staffId || null,
      active: statusVal === 'active' ? 'Yes' : 'No',
      notes: notes || '',
      carMake: firstVeh.carMake || '',
      carColor: firstVeh.carColor || 'White',
      seaterType: firstVeh.seaterType || '5_seater',
      vehicle: vehicleString,
      vehicles: state.editForm.vehicles.map(v => ({
        registration_no: v.registrationNo,
        brand_or_model: v.carMake,
        car_make: v.carMake,
        car_color: v.carColor,
        seater_type: v.seaterType
      }))
    };

    const submitBtn = document.getElementById('v2EditBtnSubmit');

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('updateCustomer', { customerData: updatedData });
        if (res && res.success !== false) {
          if (window.CWP_ADMIN_V2.toast) {
            window.CWP_ADMIN_V2.toast.success('Customer updated successfully!');
          }
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2ModalEditCustomer');
          }
          await loadData(true);
          selectCustomer(id);
        } else {
          throw new Error((res && res.error) || 'Failed to update customer');
        }
      });
    } catch (err) {
      console.error('[EditCustomer] Update failed:', err);
      if (window.CWP_ADMIN_V2.toast) {
        window.CWP_ADMIN_V2.toast.error(err.message || 'Update failed');
      }
    }
  }

  // -------------------------------------------------------------------------
  // OPERATIONAL ACTION MODALS & WORKFLOWS
  // -------------------------------------------------------------------------
  // 1. Assign Job
  function openAssignJobModal(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    document.getElementById('v2AssignJobCustName').textContent = target.customerName || target.name;
    document.getElementById('v2AssignJobCustId').value = target.id;
    document.getElementById('v2AssignJobStaffSelect').value = target.staffId || '';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAssignJob');
    }
  }

  async function submitAssignJob() {
    const custId = document.getElementById('v2AssignJobCustId')?.value;
    const staffId = document.getElementById('v2AssignJobStaffSelect')?.value;
    const staffNotes = document.getElementById('v2AssignJobNotes')?.value.trim();

    if (!custId || !staffId) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Please select a staff member.');
      return;
    }

    const btn = document.getElementById('v2BtnSubmitAssignJob');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('assignDailyCleanCustomer', {
          customerId: custId,
          staffId: staffId,
          staffNotes: staffNotes
        });

        if (window.CWP_ADMIN_V2.toast) {
          window.CWP_ADMIN_V2.toast.success(res.message || 'Cleaner assigned to customer successfully!');
        }
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalAssignJob');
        }
        await loadData(true);
        selectCustomer(custId);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Assignment failed');
    }
  }

  // 2. Log Service
  function openLogServiceModal(cust = null) {
    if (!(cust || state.selectedCustomer)) return;
    if (window.CWP_ADMIN_V2.toast) {
      window.CWP_ADMIN_V2.toast.warning('Service completion is recorded from an assigned booking. Create or open the canonical booking to record the work.');
    }
  }

  async function submitLogService() {
    if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('This legacy action does not persist a service record. Use the canonical booking and staff completion workflow.');
  }

  // 3. Add Vehicle Direct
  function openAddVehicleModal(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    document.getElementById('v2AddVehDirectCustName').textContent = target.customerName || target.name;
    document.getElementById('v2AddVehDirectCustId').value = target.id;
    document.getElementById('v2AddVehDirectReg').value = '';
    document.getElementById('v2AddVehDirectMake').value = '';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAddVehicle');
    }
  }

  async function submitAddVehicleDirect() {
    const custId = document.getElementById('v2AddVehDirectCustId')?.value;
    const reg = document.getElementById('v2AddVehDirectReg')?.value.trim().toUpperCase();
    const make = document.getElementById('v2AddVehDirectMake')?.value.trim();
    const color = document.getElementById('v2AddVehDirectColor')?.value || 'White';
    const seater = document.getElementById('v2AddVehDirectSeater')?.value || '5_seater';

    if (!reg) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.warning('Registration number is required.');
      return;
    }

    const cust = state.allCustomers.find(c => c.id === custId);
    if (!cust) return;

    // Existing vehicles + new one
    const existingVehs = Array.isArray(cust.vehicles) ? [...cust.vehicles] : parseVehicleStringToArray(cust.vehicle, cust);
    existingVehs.push({
      registration_no: reg,
      brand_or_model: make,
      car_make: make,
      car_color: color,
      seater_type: seater
    });

    const summaryStr = existingVehs.map(v => `${v.registration_no} ${v.brand_or_model || v.car_make}`.trim()).join(' / ');

    const btn = document.getElementById('v2BtnSubmitAddVehDirect');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('updateCustomer', {
          customerData: {
            id: custId,
            vehicle: summaryStr,
            vehicles: existingVehs
          }
        });

        if (window.CWP_ADMIN_V2.toast) {
          window.CWP_ADMIN_V2.toast.success('Vehicle added to customer profile!');
        }
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalAddVehicle');
        }
        await loadData(true);
        selectCustomer(custId);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Failed to add vehicle');
    }
  }

  // 4. Update Plan
  function openUpdatePlanModal(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    document.getElementById('v2UpdatePlanCustName').textContent = target.customerName || target.name;
    document.getElementById('v2UpdatePlanCustId').value = target.id;
    document.getElementById('v2UpdatePlanCategory').value = target.serviceCategory || 'Daily Car Cleaning';
    document.getElementById('v2UpdatePlanPackage').value = target.packageName || 'DCC ONLY';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalUpdatePlan');
    }
  }

  async function submitUpdatePlan() {
    const custId = document.getElementById('v2UpdatePlanCustId')?.value;
    const category = document.getElementById('v2UpdatePlanCategory')?.value;
    const pkg = document.getElementById('v2UpdatePlanPackage')?.value;

    const btn = document.getElementById('v2BtnSubmitUpdatePlan');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('updateCustomer', {
          customerData: {
            id: custId,
            serviceCategory: category,
            packageType: pkg,
            packageName: pkg
          }
        });

        if (window.CWP_ADMIN_V2.toast) {
          window.CWP_ADMIN_V2.toast.success('Customer plan updated successfully!');
        }
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalUpdatePlan');
        }
        await loadData(true);
        selectCustomer(custId);
      });
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Failed to update plan');
    }
  }

  // 5. Toggle Status (Active / Suspended)
  async function toggleCustomerStatus(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    const currentlyActive = target.active !== 'No' && target.active !== false && !target.isStopped;
    const nextActive = !currentlyActive;
    const actionLabel = nextActive ? 'activate' : 'suspend';

    if (!confirm(`Are you sure you want to ${actionLabel} service for ${target.customerName || target.name}?`)) {
      return;
    }

    try {
      if (!nextActive) {
        // Call stopCustomerService
        await window.CWP_ADMIN_V2.api.request('stopCustomerService', {
          customerId: target.id,
          reason: 'Suspended by admin'
        });
      } else {
        // Call updateCustomer with active = Yes
        await window.CWP_ADMIN_V2.api.request('updateCustomer', {
          customerData: {
            id: target.id,
            active: 'Yes',
            isStopped: false
          }
        });
      }

      if (window.CWP_ADMIN_V2.toast) {
        window.CWP_ADMIN_V2.toast.success(`Customer ${nextActive ? 'activated' : 'suspended'} successfully.`);
      }
      await loadData(true);
      selectCustomer(target.id);
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Status toggle failed');
    }
  }

  // 6. Delete Customer
  async function deleteCustomerConfirm(cust = null) {
    const target = cust || state.selectedCustomer;
    if (!target) return;

    const name = target.customerName || target.name;
    const promptMsg = `Type "DELETE" to confirm administrative deletion of ${name} and all related service records:`;
    const input = window.prompt(promptMsg);
    if (!input || input.trim().toUpperCase() !== 'DELETE') {
      return;
    }

    try {
      const res = await window.CWP_ADMIN_V2.api.request('deleteCustomer', {
        id: target.id,
        reason: 'Administrative deletion via Admin V2'
      });

      if (res && res.success !== false) {
        if (window.CWP_ADMIN_V2.toast) {
          window.CWP_ADMIN_V2.toast.success(`Customer ${name} deleted successfully.`);
        }
        state.selectedCustomer = null;
        closeDetailPanel();
        await loadData(true);
      } else {
        throw new Error((res && res.error) || 'Failed to delete customer');
      }
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast) window.CWP_ADMIN_V2.toast.error(err.message || 'Deletion failed');
    }
  }

  // -------------------------------------------------------------------------
  // EVENT BINDINGS
  // -------------------------------------------------------------------------
  function bindToolbarEvents() {
    // Add customer primary button
    const btnAdd = document.getElementById('v2BtnAddCustomer');
    if (btnAdd) btnAdd.addEventListener('click', openAddCustomerModal);

    // Refresh button
    const btnRefresh = document.getElementById('v2CustBtnRefresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadData(true));

    // KPI Cards
    const kpiCards = document.querySelectorAll('.cwp-v2-cust-kpi-card');
    kpiCards.forEach(card => {
      card.addEventListener('click', () => {
        const filterType = card.getAttribute('data-kpi');
        handleKpiClick(filterType);
      });
    });

    // Search input (debounced 250ms)
    const searchInput = document.getElementById('v2CustSearchInput');
    const clearBtn = document.getElementById('v2CustSearchClear');
    let searchTimer = null;

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        if (clearBtn) clearBtn.classList.toggle('is-visible', val.length > 0);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = val;
          applyFiltersAndSearch();
        }, 250);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearBtn.classList.remove('is-visible');
        state.searchQuery = '';
        applyFiltersAndSearch();
      });
    }

    // Primary filter selects
    const filterStatus = document.getElementById('v2CustFilterStatus');
    const filterCategory = document.getElementById('v2CustFilterCategory');
    const filterRoute = document.getElementById('v2CustFilterRoute');

    if (filterStatus) {
      filterStatus.addEventListener('change', () => {
        state.filters.status = filterStatus.value;
        applyFiltersAndSearch();
      });
    }

    if (filterCategory) {
      filterCategory.addEventListener('change', () => {
        state.filters.category = filterCategory.value;
        applyFiltersAndSearch();
      });
    }

    if (filterRoute) {
      filterRoute.addEventListener('change', () => {
        state.filters.route = filterRoute.value;
        applyFiltersAndSearch();
      });
    }

    // Secondary filters toggle & controls
    const toggleSecondary = document.getElementById('v2CustToggleSecondaryFilters');
    const secondaryBox = document.getElementById('v2CustSecondaryFilters');
    if (toggleSecondary && secondaryBox) {
      toggleSecondary.addEventListener('click', () => {
        secondaryBox.classList.toggle('is-open');
        toggleSecondary.classList.toggle('is-active');
      });
    }

    const filterStaff = document.getElementById('v2CustFilterStaff');
    const filterSeater = document.getElementById('v2CustFilterSeater');
    const resetFiltersBtn = document.getElementById('v2CustResetFilters');

    if (filterStaff) {
      filterStaff.addEventListener('change', () => {
        state.filters.staff = filterStaff.value;
        applyFiltersAndSearch();
      });
    }

    if (filterSeater) {
      filterSeater.addEventListener('change', () => {
        state.filters.seater = filterSeater.value;
        applyFiltersAndSearch();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        state.searchQuery = '';
        state.kpiFilter = null;
        state.filters = { status: 'all', category: 'all', route: 'all', staff: 'all', seater: 'all' };

        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.classList.remove('is-visible');
        if (filterStatus) filterStatus.value = 'all';
        if (filterCategory) filterCategory.value = 'all';
        if (filterRoute) filterRoute.value = 'all';
        if (filterStaff) filterStaff.value = 'all';
        if (filterSeater) filterSeater.value = 'all';

        const kpis = document.querySelectorAll('.cwp-v2-cust-kpi-card');
        kpis.forEach(c => c.classList.remove('is-active'));

        applyFiltersAndSearch();
      });
    }
  }

  function bindTableEvents() {
    // Sortable headers
    const headers = document.querySelectorAll('.cwp-v2-cust-table th.is-sortable');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort-col');
        if (col) handleSort(col);
      });
    });

    // Table body click delegation (selection + quick actions)
    const tbody = document.getElementById('v2CustTableBody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.getAttribute('data-action');
          const id = actionBtn.getAttribute('data-id');
          const cust = state.allCustomers.find(c => c.id === id);
          if (!cust) return;

          switch (action) {
            case 'view':
              selectCustomer(id);
              break;
            case 'edit':
              openEditCustomerModal(cust);
              break;
            case 'assignJob':
              openAssignJobModal(cust);
              break;
            case 'logService':
              openLogServiceModal(cust);
              break;
          }
          return;
        }

        const row = e.target.closest('tr[data-customer-id]');
        if (row) {
          const id = row.getAttribute('data-customer-id');
          selectCustomer(id);
        }
      });

      // Keyboard arrow navigation
      tbody.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentTr = document.querySelector('#v2CustTableBody tr.is-selected') || document.querySelector('#v2CustTableBody tr');
          if (!currentTr) return;

          const targetTr = e.key === 'ArrowDown' ? currentTr.nextElementSibling : currentTr.previousElementSibling;
          if (targetTr && targetTr.hasAttribute('data-customer-id')) {
            const id = targetTr.getAttribute('data-customer-id');
            selectCustomer(id);
            targetTr.focus();
          }
        }
      });
    }

    // Pagination buttons
    const prevBtn = document.getElementById('v2CustPagePrev');
    const nextBtn = document.getElementById('v2CustPageNext');
    const sizeSelect = document.getElementById('v2CustPageSize');

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
        const maxPage = Math.ceil(state.pagination.totalRecords / state.pagination.pageSize);
        if (state.pagination.currentPage < maxPage) {
          state.pagination.currentPage++;
          renderTable();
          renderPagination();
        }
      });
    }

    if (sizeSelect) {
      sizeSelect.addEventListener('change', () => {
        state.pagination.pageSize = parseInt(sizeSelect.value, 10);
        state.pagination.currentPage = 1;
        renderTable();
        renderPagination();
      });
    }

    const numbersContainer = document.getElementById('v2CustPageNumbers');
    if (numbersContainer) {
      numbersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (btn) {
          state.pagination.currentPage = parseInt(btn.getAttribute('data-page'), 10);
          renderTable();
          renderPagination();
        }
      });
    }
  }

  function bindDetailPanelEvents(cust) {
    const detailScroll = document.getElementById('v2CustDetailScroll');
    if (detailScroll) detailScroll.onclick = async (event) => {
      const ledgerButton = event.target.closest('[data-see-ledger]');
      if (!ledgerButton) return;
      const accountId = ledgerButton.getAttribute('data-see-ledger');
      const content = document.querySelector(`[data-see-ledger-content="${CSS.escape(accountId)}"]`);
      if (!content || ledgerButton.disabled) return;
      ledgerButton.disabled = true;
      content.textContent = 'Loading ledger…';
      try {
        const response = await fetch(`/api/see/entitlements/${encodeURIComponent(accountId)}/ledger?limit=25&offset=0`, { credentials: 'same-origin' });
        const body = await response.json();
        if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
        const rows = Array.isArray(body.ledger) ? body.ledger : [];
        content.innerHTML = rows.length ? rows.map(row => `<div class="cwp-v2-cust-activity-time">${escapeHtml(row.entry_type)} ${Number(row.quantity) > 0 ? '+' : ''}${Number(row.quantity)} · balance ${escapeHtml(row.balance_after)} · ${escapeHtml(row.reason || row.reference_id || '—')}</div>`).join('') : '<div class="cwp-v2-cust-activity-time">No ledger entries.</div>';
      } catch (error) {
        content.textContent = `Ledger unavailable: ${error.message}`;
        ledgerButton.disabled = false;
      }
    };

    // Close / dismiss detail panel
    const closeBtn = document.getElementById('v2BtnCloseDetailPanel');
    if (closeBtn) closeBtn.addEventListener('click', closeDetailPanel);

    // Edit customer button in header
    const editBtn = document.getElementById('v2BtnEditCustomer');
    if (editBtn) editBtn.addEventListener('click', () => openEditCustomerModal(cust));

    // Overflow menu toggle
    const ofBtn = document.getElementById('v2BtnCustOverflow');
    const ofMenu = document.getElementById('v2CustOverflowMenu');
    if (ofBtn && ofMenu) {
      ofBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ofMenu.style.display = ofMenu.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', () => {
        ofMenu.style.display = 'none';
      });
    }

    // Overflow item: Toggle Active
    const ofToggle = document.getElementById('v2OverflowToggleActive');
    if (ofToggle) ofToggle.addEventListener('click', () => toggleCustomerStatus(cust));

    // Overflow item: Delete
    const ofDelete = document.getElementById('v2OverflowDelete');
    if (ofDelete) ofDelete.addEventListener('click', () => deleteCustomerConfirm(cust));

    // Add Vehicle direct button
    const addVehBtn = document.getElementById('v2BtnAddVehicleDirect');
    if (addVehBtn) addVehBtn.addEventListener('click', () => openAddVehicleModal(cust));

    // 4 Persistent Quick Actions in Footer
    const qaAssign = document.getElementById('v2CustQaAssignJob');
    const qaLog = document.getElementById('v2CustQaLogService');
    const qaAddVeh = document.getElementById('v2CustQaAddVehicle');
    const qaUpdatePlan = document.getElementById('v2CustQaUpdatePlan');

    if (qaAssign) qaAssign.onclick = () => openAssignJobModal(cust);
    if (qaLog) qaLog.onclick = () => openLogServiceModal(cust);
    const purchaseBtn = document.getElementById('v2CustSeePurchaseOpen');
    if (purchaseBtn) purchaseBtn.addEventListener('click', () => openCustomerPurchase(cust));
    if (qaAddVeh) qaAddVeh.onclick = () => openAddVehicleModal(cust);
    if (qaUpdatePlan) qaUpdatePlan.onclick = () => openUpdatePlanModal(cust);
  }

  function bindWizardEvents() {
    const steps = document.querySelectorAll('.cwp-v2-wizard-step');
    steps.forEach(s => {
      s.addEventListener('click', () => {
        const num = parseInt(s.getAttribute('data-step'), 10);
        goToAddCustomerStep(num);
      });
    });

    const prevBtn = document.getElementById('v2WizardBtnPrev');
    const nextBtn = document.getElementById('v2WizardBtnNext');
    const submitBtn = document.getElementById('v2WizardBtnSubmit');
    const addVehBtn = document.getElementById('v2WizardBtnAddVeh');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        goToAddCustomerStep(state.addWizard.currentStep - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        goToAddCustomerStep(state.addWizard.currentStep + 1);
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', submitAddCustomer);
    }

    if (addVehBtn) {
      addVehBtn.addEventListener('click', addWizardVehicle);
    }
  }

  function bindEditEvents() {
    const tabBtns = document.querySelectorAll('.cwp-v2-edit-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-edit-tab');
        switchEditCustomerTab(tab);
      });
    });

    const addVehBtn = document.getElementById('v2EditBtnAddVeh');
    if (addVehBtn) addVehBtn.addEventListener('click', addEditVehicle);

    const submitBtn = document.getElementById('v2EditBtnSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submitEditCustomer);
  }

  function bindActionModalEvents() {
    // Assign Job
    const assignBtn = document.getElementById('v2BtnSubmitAssignJob');
    if (assignBtn) assignBtn.addEventListener('click', submitAssignJob);

    // Log Service
    const logBtn = document.getElementById('v2BtnSubmitLogService');
    if (logBtn) logBtn.addEventListener('click', submitLogService);

    // Add Vehicle Direct
    const addVehBtn = document.getElementById('v2BtnSubmitAddVehDirect');
    if (addVehBtn) addVehBtn.addEventListener('click', submitAddVehicleDirect);

    // Update Plan
    const updatePlanBtn = document.getElementById('v2BtnSubmitUpdatePlan');
    if (updatePlanBtn) updatePlanBtn.addEventListener('click', submitUpdatePlan);
    document.getElementById('v2CustPurchaseForm')?.addEventListener('submit', submitCustomerPurchase);
    ['v2CustPurchasePackage', 'v2CustPurchaseQuantity', 'v2CustPurchaseVehicle', 'v2CustPurchaseLocation', 'v2CustPurchaseCity', 'v2CustPurchaseZone'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', updateCustomerPurchaseQuote);
      document.getElementById(id)?.addEventListener('input', updateCustomerPurchaseQuote);
    });
  }

  function populateStaffDropdowns() {
    const selects = [
      document.getElementById('v2AddCustStaff'),
      document.getElementById('v2EditCustStaff'),
      document.getElementById('v2AssignJobStaffSelect'),
      document.getElementById('v2CustFilterStaff')
    ];

    selects.forEach(sel => {
      if (!sel) return;
      const isFilter = sel.id === 'v2CustFilterStaff';
      let html = isFilter ? '<option value="all">All Staff</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option>' : '<option value="">Select Staff Member</option>';

      state.staffList.forEach(s => {
        const name = escapeHtml(s.name || s.staffName);
        const code = escapeHtml(s.staff_code || s.staffCode || s.id);
        html += `<option value="${code}">${name} (${code})</option>`;
      });

      sel.innerHTML = html;
    });
  }

  function populateRoutesDropdowns() {
    const selects = [
      document.getElementById('v2AddCustRoute'),
      document.getElementById('v2CustFilterRoute')
    ];

    selects.forEach(sel => {
      if (!sel) return;
      const isFilter = sel.id === 'v2CustFilterRoute';
      let html = isFilter ? '<option value="all">All Routes / Areas</option>' : '<option value="">Auto Route</option>';

      if (state.routesList.length > 0) {
        state.routesList.forEach(r => {
          const name = escapeHtml(r.name || r.routeName || r);
          html += `<option value="${name}">${name}</option>`;
        });
      } else {
        const areas = ['Gomti Nagar', 'Indira Nagar', 'Aliganj', 'Hazratganj', 'Mahanagar', 'Vikas Nagar'];
        areas.forEach(a => {
          html += `<option value="${a}">${a}</option>`;
        });
      }

      sel.innerHTML = html;
    });
  }

  // Export module interface
  window.CWP_ADMIN_V2.customers = {
    init,
    loadData,
    selectCustomer,
    closeDetailPanel,
    openAddCustomerModal,
    openEditCustomerModal,
    toggleVehicleExtra,
    addWizardVehicle,
    removeWizardVehicle,
    addEditVehicle,
    removeEditVehicle,
    switchEditCustomerTab,
    getState: () => state
  };

  // Auto-init on load if DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
