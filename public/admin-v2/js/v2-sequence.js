/**
 * CWP Admin V2 — DCC Route Plan (Sequence & Route Management)
 * Strictly scoped to window.CWP_ADMIN_V2.sequence
 * Consumes live backend APIs: getAllRoutes, getRouteDetails, createRoute, updateRoute,
 * deleteRoute, assignStaffToRoute, unassignStaffFromRoute, addStopToRoute, removeStopFromRoute,
 * reorderRouteStops, moveStopBetweenRoutes, getUnassignedDccVehicles, getStaffList.
 *
 * IDENTITY RULE: Zero database IDs are ever displayed in the UI.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = {
    initialized: false,
    loaded: false,
    loading: false,
    subtab: 'routes', // 'routes' | 'unassigned' | 'detail'
    routes: [],
    unassigned: [],
    staffList: [],
    activeRouteId: null,
    activeRoute: null,
    stops: [],
    sequenceDirty: false,
    selectedUnassignedKeys: new Set(),
    filters: {
      search: '',
      status: 'all',
      staff: 'all',
      area: 'all',
      sort: 'code_asc',
      unassignedSearch: '',
      unassignedArea: 'all'
    },
    pendingModalAction: null
  };

  function apiRequest(action, payload) {
    if (window.CWP_ADMIN_V2.api && typeof window.CWP_ADMIN_V2.api.request === 'function') {
      return window.CWP_ADMIN_V2.api.request(action, payload || {});
    }
    return Promise.reject(new Error('API client unavailable'));
  }

  function showToast(msg, type) {
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.show === 'function') {
      window.CWP_ADMIN_V2.toast.show(msg, type || 'info', 3000);
    }
  }

  function esc(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val == null ? '' : String(val));
    }
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isDccEligibleStaff(s) {
    if (!s || s.is_active === false || s.isActive === false || s.active === false || s.isLocked) return false;
    const act = String(s.active ?? '').trim().toLowerCase();
    if (act === 'no' || act === 'false' || act === 'inactive') return false;
    const status = String(s.status || '').toLowerCase();
    if (status === 'inactive' || status === 'resigned' || status === 'terminated') return false;
    const workType = String(s.workType || s.work_type || 'dcc_only').toLowerCase().trim();
    if (workType === 'services_only') return false;
    const caps = Array.isArray(s.serviceCapabilities)
      ? s.serviceCapabilities
      : (Array.isArray(s.service_capabilities)
        ? s.service_capabilities
        : (Array.isArray(s.serviceCategories)
          ? s.serviceCategories
          : (Array.isArray(s.service_categories) ? s.service_categories : null)));
    if (caps && caps.length > 0) {
      return caps.includes('daily_car_cleaning');
    }
    const role = String(s.designationName || s.designation || s.role || '').toLowerCase();
    if (role.includes('solar') && !role.includes('car') && !role.includes('clean')) return false;
    if (role.includes('services_only') || role.includes('services only')) return false;
    return true;
  }

  async function loadAllData(force) {
    if (state.loading) return;
    if (state.loaded && !force) {
      render();
      return;
    }
    state.loading = true;
    try {
      const [routesRes, unassignedRes, staffRes] = await Promise.all([
        apiRequest('getAllRoutes', {}),
        apiRequest('getUnassignedDccVehicles', {}),
        apiRequest('getStaffList', {})
      ]);

      state.routes = Array.isArray(routesRes?.routes) ? routesRes.routes : [];
      state.unassigned = Array.isArray(unassignedRes?.unassigned) ? unassignedRes.unassigned : [];
      state.staffList = Array.isArray(staffRes?.staff) ? staffRes.staff : (Array.isArray(staffRes) ? staffRes : []);
      state.loaded = true;

      if (window.CWP_ADMIN_V2.notifications && typeof window.CWP_ADMIN_V2.notifications.refreshBadges === 'function') {
        window.CWP_ADMIN_V2.notifications.refreshBadges();
      }
      render();
    } catch (err) {
      showToast(err.message || 'Failed to load route plan data.', 'error');
    } finally {
      state.loading = false;
    }
  }

  async function openRouteDetail(routeId) {
    if (!routeId) return;
    try {
      const res = await apiRequest('getRouteDetails', { routeId });
      if (!res || res.success === false) {
        throw new Error(res?.error || 'Could not load route details.');
      }
      state.activeRouteId = routeId;
      state.activeRoute = res;
      state.stops = Array.isArray(res.stops) ? res.stops.slice() : [];
      state.sequenceDirty = false;
      state.subtab = 'detail';
      render();
    } catch (err) {
      showToast(err.message || 'Failed to load route details.', 'error');
    }
  }

  function updateKpis() {
    const routes = state.routes;
    const total = routes.length;
    const active = routes.filter(r => String(r.status || 'active').toLowerCase() === 'active').length;
    const inactive = total - active;
    const assignedStaffIds = new Set(routes.filter(r => r.assigned_staff_id).map(r => r.assigned_staff_id));
    const totalStops = routes.reduce((acc, r) => acc + (Number(r.stop_count) || 0), 0);
    const unassignedCount = state.unassigned.length;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setVal('v2SeqKpiTotalRoutes', total);
    setVal('v2SeqKpiActiveRoutes', active);
    setVal('v2SeqKpiInactiveRoutes', inactive);
    setVal('v2SeqKpiAssignedStaff', assignedStaffIds.size);
    setVal('v2SeqKpiTotalStops', totalStops);
    setVal('v2SeqKpiUnassigned', unassignedCount);
    setVal('v2SeqRoutesBadge', total);
    setVal('v2SeqUnassignedBadge', unassignedCount);
  }

  function populateAreaFilter() {
    const areaSel = document.getElementById('v2SeqAreaFilter');
    const unAreaSel = document.getElementById('v2SeqUnassignedAreaFilter');
    const areas = Array.from(new Set(state.routes.map(r => (r.operational_area || '').trim()).filter(Boolean))).sort();
    if (areaSel) {
      const cur = state.filters.area;
      areaSel.innerHTML = '<option value="all">All Operational Areas</option>' +
        areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
      areaSel.value = areas.includes(cur) ? cur : 'all';
    }
    if (unAreaSel) {
      const uAreas = Array.from(new Set(state.unassigned.map(u => {
        const addr = (u.address_text || '').trim();
        return addr ? addr.split(',').pop().trim() : '';
      }).filter(Boolean))).sort();
      const curU = state.filters.unassignedArea;
      unAreaSel.innerHTML = '<option value="all">All Areas</option>' +
        uAreas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
      unAreaSel.value = uAreas.includes(curU) ? curU : 'all';
    }
  }

  function getFilteredRoutes() {
    const q = state.filters.search.trim().toLowerCase();
    let list = state.routes.filter(r => {
      if (state.filters.status !== 'all' && String(r.status || 'active').toLowerCase() !== state.filters.status) {
        return false;
      }
      if (state.filters.staff === 'assigned' && !r.assigned_staff_id) return false;
      if (state.filters.staff === 'unassigned' && r.assigned_staff_id) return false;
      if (state.filters.area !== 'all' && (r.operational_area || '').trim() !== state.filters.area) return false;
      if (q) {
        const hay = `${r.route_code || ''} ${r.route_name || ''} ${r.operational_area || ''} ${r.staff_name || ''} ${r.staff_code || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sort = state.filters.sort;
    list.sort((a, b) => {
      if (sort === 'name_asc') return String(a.route_name || '').localeCompare(String(b.route_name || ''));
      if (sort === 'stops_desc') return (Number(b.stop_count) || 0) - (Number(a.stop_count) || 0);
      if (sort === 'stops_asc') return (Number(a.stop_count) || 0) - (Number(b.stop_count) || 0);
      return String(a.route_code || '').localeCompare(String(b.route_code || ''));
    });
    return list;
  }

  function renderRoutesHub() {
    const grid = document.getElementById('v2SeqRoutesGrid');
    if (!grid) return;
    const routes = getFilteredRoutes();
    if (!routes.length) {
      grid.innerHTML = `
        <div class="cwp-v2-seq-empty cwp-v2-seq-empty-span">
          <span class="material-symbols-outlined">alt_route</span>
          <div class="cwp-v2-seq-empty-title">No routes match your filters</div>
          <div class="cwp-v2-seq-empty-desc">Create a new operational route or reset your active filters.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = routes.map(r => {
      const status = String(r.status || 'active').toLowerCase();
      const statusClass = status === 'active' ? 'is-active' : (status === 'archived' ? 'is-archived' : 'is-inactive');
      const staffLabel = r.staff_name
        ? `${esc(r.staff_name)}${r.staff_code ? ` (${esc(r.staff_code)})` : ''}`
        : 'Unassigned';
      const areaLabel = r.operational_area ? esc(r.operational_area) : 'Area not set';
      const stopCount = Number(r.stop_count) || 0;

      return `
        <article class="cwp-v2-seq-route-card" data-route-card="${esc(r.id)}">
          <div class="cwp-v2-seq-route-top">
            <span class="cwp-v2-seq-code-pill">${esc(r.route_code)}</span>
            <span class="cwp-v2-seq-status-pill ${statusClass}">${esc(status)}</span>
          </div>
          <h3 class="cwp-v2-seq-route-name">${esc(r.route_name)}</h3>
          <div class="cwp-v2-seq-route-meta">
            <span class="material-symbols-outlined cwp-v2-seq-icon-16">location_on</span>
            <span>${areaLabel}</span>
          </div>
          <div class="cwp-v2-seq-route-meta">
            <span class="material-symbols-outlined cwp-v2-seq-icon-16">badge</span>
            <span>${staffLabel}</span>
          </div>
          <div class="cwp-v2-seq-route-footer">
            <span class="cwp-v2-seq-stop-count">${stopCount} ${stopCount === 1 ? 'Stop' : 'Stops'}</span>
            <div class="cwp-v2-seq-card-actions">
              <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="assign-staff" data-route-id="${esc(r.id)}" title="Assign Staff">
                <span class="material-symbols-outlined cwp-v2-seq-icon-15">person_add</span>
                <span>Staff</span>
              </button>
              <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="edit-route" data-route-id="${esc(r.id)}" title="Edit Route">
                <span class="material-symbols-outlined cwp-v2-seq-icon-15">edit</span>
              </button>
              <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-seq-action="open-detail" data-route-id="${esc(r.id)}">
                <span>Sequence</span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function getUnassignedKey(u) {
    return `${u.subscription_id}::${u.vehicle_id}`;
  }

  function renderUnassignedWorkbench() {
    const tbody = document.getElementById('v2SeqUnassignedBody');
    const batchBar = document.getElementById('v2SeqBatchBar');
    const batchCount = document.getElementById('v2SeqBatchCount');
    const batchRouteSel = document.getElementById('v2SeqBatchRouteSelect');
    if (!tbody) return;

    const q = state.filters.unassignedSearch.trim().toLowerCase();
    const area = state.filters.unassignedArea;

    const filtered = state.unassigned.filter(u => {
      if (area !== 'all') {
        const addr = (u.address_text || '').toLowerCase();
        if (!addr.includes(area.toLowerCase())) return false;
      }
      if (q) {
        const hay = `${u.customer_name || ''} ${u.customer_phone || ''} ${u.registration_no || ''} ${u.brand_or_model || ''} ${u.address_text || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (batchRouteSel) {
      const activeRoutes = state.routes.filter(r => String(r.status || 'active').toLowerCase() === 'active');
      batchRouteSel.innerHTML = '<option value="">Select target route...</option>' +
        activeRoutes.map(r => `<option value="${esc(r.id)}">${esc(r.route_code)} — ${esc(r.route_name)}</option>`).join('');
    }

    if (batchBar && batchCount) {
      const selCount = state.selectedUnassignedKeys.size;
      batchBar.hidden = selCount === 0;
      batchCount.textContent = String(selCount);
    }

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="cwp-v2-seq-table-empty">All active DCC vehicles are currently assigned to operational routes.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const key = getUnassignedKey(u);
      const checked = state.selectedUnassignedKeys.has(key) ? 'checked' : '';
      return `
        <tr>
          <td class="cwp-v2-seq-col-center">
            <input type="checkbox" class="cwp-v2-seq-unassigned-cb" data-unassigned-key="${esc(key)}" ${checked}>
          </td>
          <td>
            <div class="cwp-v2-seq-cell-title">${esc(u.customer_name || 'Customer')}</div>
            <div class="cwp-v2-seq-cell-sub">${esc(u.customer_phone || '—')}</div>
          </td>
          <td>
            <div class="cwp-v2-seq-cell-plate">${esc(u.registration_no || 'No Plate')}</div>
            <div class="cwp-v2-seq-cell-sub">${esc(u.brand_or_model || u.car_make || 'Vehicle')}</div>
          </td>
          <td><span class="cwp-v2-seq-cell-pkg">${esc(u.package_name || 'Daily Car Cleaning')}</span></td>
          <td><span class="cwp-v2-seq-cell-addr">${esc(u.address_text || 'Address pending')}</span></td>
          <td class="cwp-v2-seq-col-right">
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="quick-assign-unassigned" data-unassigned-key="${esc(key)}">
              <span class="material-symbols-outlined cwp-v2-seq-icon-15">add_road</span>
              <span>Assign</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderRouteDetail() {
    const r = state.activeRoute;
    if (!r) return;

    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setTxt('v2SeqDetailCode', r.route_code || 'ROUTE');
    setTxt('v2SeqDetailName', r.route_name || 'Route');
    setTxt('v2SeqDetailArea', r.operational_area || 'Area not configured');
    setTxt('v2SeqDetailDesc', r.description || 'No description provided.');
    setTxt('v2SeqDetailStopCount', String(state.stops.length));

    const status = String(r.status || 'active').toLowerCase();
    const statusBadge = document.getElementById('v2SeqDetailStatus');
    if (statusBadge) {
      statusBadge.textContent = status;
      statusBadge.className = `cwp-v2-seq-status-pill ${status === 'active' ? 'is-active' : (status === 'archived' ? 'is-archived' : 'is-inactive')}`;
    }

    const staff = r.assignedStaff || (r.staff_name ? { name: r.staff_name, staffCode: r.staff_code, phone: r.staff_phone } : null);
    setTxt('v2SeqDetailStaffName', staff ? staff.name : 'No staff assigned');
    setTxt('v2SeqDetailStaffMeta', staff ? `${staff.staffCode || ''}${staff.phone ? ' • ' + staff.phone : ''}` : 'Assign a cleaner to enable mobile execution');

    const unassignBtn = document.getElementById('v2SeqDetailUnassignStaffBtn');
    if (unassignBtn) unassignBtn.disabled = !staff;

    const unsavedPill = document.getElementById('v2SeqUnsavedPill');
    const saveSeqBtn = document.getElementById('v2SeqSaveSequenceBtn');
    if (unsavedPill) unsavedPill.hidden = !state.sequenceDirty;
    if (saveSeqBtn) saveSeqBtn.disabled = !state.sequenceDirty;

    const stopsEl = document.getElementById('v2SeqStopsList');
    if (!stopsEl) return;

    if (!state.stops.length) {
      stopsEl.innerHTML = `
        <div class="cwp-v2-seq-empty">
          <span class="material-symbols-outlined">directions_car</span>
          <div class="cwp-v2-seq-empty-title">No stops on this route</div>
          <div class="cwp-v2-seq-empty-desc">Use "Add Stop" to add an eligible daily cleaning customer to this route.</div>
        </div>
      `;
      return;
    }

    stopsEl.innerHTML = state.stops.map((st, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === state.stops.length - 1;
      const addr = st.address_text || 'Address missing';
      return `
        <div class="cwp-v2-seq-stop-card" data-stop-id="${esc(st.id)}">
          <div class="cwp-v2-seq-stop-left">
            <span class="cwp-v2-seq-stop-num">${idx + 1}</span>
            <div class="cwp-v2-seq-stop-body">
              <div class="cwp-v2-seq-stop-head">
                <strong class="cwp-v2-seq-stop-name">${esc(st.customer_name || 'Customer')}</strong>
                <span class="cwp-v2-seq-code-pill">${esc(st.registration_no || 'No Plate')}</span>
                <span class="cwp-v2-seq-stop-model">${esc(st.brand_or_model || st.car_make || '')}</span>
              </div>
              <div class="cwp-v2-seq-stop-meta">
                ${esc(st.customer_phone || 'No phone')} • ${esc(addr)}
              </div>
            </div>
          </div>
          <div class="cwp-v2-seq-stop-actions">
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="move-stop" data-stop-index="${idx}" data-dir="top" ${isFirst ? 'disabled' : ''} title="Move to Top">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">vertical_align_top</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="move-stop" data-stop-index="${idx}" data-dir="up" ${isFirst ? 'disabled' : ''} title="Move Up">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">arrow_upward</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="move-stop" data-stop-index="${idx}" data-dir="down" ${isLast ? 'disabled' : ''} title="Move Down">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">arrow_downward</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="move-stop" data-stop-index="${idx}" data-dir="bottom" ${isLast ? 'disabled' : ''} title="Move to Bottom">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">vertical_align_bottom</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-seq-action="transfer-stop" data-stop-id="${esc(st.id)}" title="Transfer to another route">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">swap_horiz</span>
            </button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-danger cwp-v2-btn-sm" data-seq-action="remove-stop" data-stop-id="${esc(st.id)}" title="Remove Stop">
              <span class="material-symbols-outlined cwp-v2-seq-icon-16">delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function render() {
    updateKpis();
    populateAreaFilter();

    const routesPane = document.getElementById('v2SeqRoutesPane');
    const unassignedPane = document.getElementById('v2SeqUnassignedPane');
    const detailPane = document.getElementById('v2SeqDetailPane');
    const btnRoutes = document.getElementById('v2SeqSubtabRoutes');
    const btnUnassigned = document.getElementById('v2SeqSubtabUnassigned');

    if (routesPane) routesPane.hidden = state.subtab !== 'routes';
    if (unassignedPane) unassignedPane.hidden = state.subtab !== 'unassigned';
    if (detailPane) detailPane.hidden = state.subtab !== 'detail';
    if (btnRoutes) btnRoutes.classList.toggle('is-active', state.subtab === 'routes' || state.subtab === 'detail');
    if (btnUnassigned) btnUnassigned.classList.toggle('is-active', state.subtab === 'unassigned');

    if (state.subtab === 'routes') renderRoutesHub();
    else if (state.subtab === 'unassigned') renderUnassignedWorkbench();
    else if (state.subtab === 'detail') renderRouteDetail();
  }

  function moveStopLocally(index, dir) {
    const arr = state.stops;
    if (index < 0 || index >= arr.length) return;
    let target = index;
    if (dir === 'up' && index > 0) target = index - 1;
    else if (dir === 'down' && index < arr.length - 1) target = index + 1;
    else if (dir === 'top') target = 0;
    else if (dir === 'bottom') target = arr.length - 1;
    if (target === index) return;
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
    state.sequenceDirty = true;
    renderRouteDetail();
  }

  async function saveSequence() {
    if (!state.activeRouteId || !state.sequenceDirty) return;
    try {
      const orderedStopIds = state.stops.map(s => s.id);
      const res = await apiRequest('reorderRouteStops', {
        routeId: state.activeRouteId,
        orderedStopIds
      });
      if (!res || res.success === false) {
        throw new Error(res?.error || 'Failed to save route sequence.');
      }
      state.sequenceDirty = false;
      showToast('Route sequence saved.', 'success');
      await openRouteDetail(state.activeRouteId);
      await loadAllData(true);
      state.subtab = 'detail';
      render();
    } catch (err) {
      showToast(err.message || 'Failed to save sequence.', 'error');
    }
  }

  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.open === 'function') {
      window.CWP_ADMIN_V2.overlay.open(modalId);
    } else {
      el.hidden = false;
      el.classList.add('is-open');
    }
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (window.CWP_ADMIN_V2.overlay && typeof window.CWP_ADMIN_V2.overlay.close === 'function') {
      window.CWP_ADMIN_V2.overlay.close(modalId);
    } else {
      el.hidden = true;
      el.classList.remove('is-open');
    }
  }

  function openCreateOrEditRouteModal(routeId) {
    const route = routeId ? state.routes.find(r => r.id === routeId) : null;
    const titleEl = document.getElementById('v2SeqRouteModalTitle');
    const codeInp = document.getElementById('v2SeqRouteCodeInput');
    const nameInp = document.getElementById('v2SeqRouteNameInput');
    const areaInp = document.getElementById('v2SeqRouteAreaInput');
    const statusSel = document.getElementById('v2SeqRouteStatusInput');
    const descInp = document.getElementById('v2SeqRouteDescInput');
    const form = document.getElementById('v2SeqRouteForm');

    if (form) form.dataset.editRouteId = route ? route.id : '';
    if (titleEl) titleEl.textContent = route ? `Edit Route — ${route.route_code}` : 'Create Operational Route';
    if (codeInp) {
      codeInp.value = route ? (route.route_code || '') : '';
      codeInp.disabled = !!route;
    }
    if (nameInp) nameInp.value = route ? (route.route_name || '') : '';
    if (areaInp) areaInp.value = route ? (route.operational_area || '') : '';
    if (statusSel) statusSel.value = route ? (route.status || 'active') : 'active';
    if (descInp) descInp.value = route ? (route.description || '') : '';

    openModal('v2SeqRouteModal');
  }

  function isUuidStr(val) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(String(val || '').trim());
  }

  function openAssignStaffModal(routeId) {
    const route = state.routes.find(r => r.id === routeId) || state.activeRoute;
    if (!route) return;
    const form = document.getElementById('v2SeqAssignStaffForm');
    const sel = document.getElementById('v2SeqAssignStaffSelect');
    const titleEl = document.getElementById('v2SeqAssignStaffTitle');
    if (form) form.dataset.routeId = routeId;
    if (titleEl) titleEl.textContent = `Assign Staff — ${route.route_code}`;

    const eligible = state.staffList.filter(isDccEligibleStaff);
    if (sel) {
      sel.innerHTML = '<option value="">Select DCC eligible staff...</option>' +
        eligible.map(s => {
          const code = s.staffCode || s.staff_code || (!isUuidStr(s.id) ? s.id : '') || '';
          const desig = s.designationName || s.designation || s.role || '';
          const val = s.dbId || s.id;
          const label = `${s.name || 'Staff'}${code ? ` (${code})` : ''}${desig ? ` — ${desig}` : ''}`;
          return `<option value="${esc(val)}">${esc(label)}</option>`;
        }).join('');

      if (route.assigned_staff_id) {
        sel.value = route.assigned_staff_id;
        if (!sel.value) {
          const match = eligible.find(s =>
            (s.dbId && String(s.dbId).toLowerCase() === String(route.assigned_staff_id).toLowerCase()) ||
            (s.id && String(s.id).toLowerCase() === String(route.assigned_staff_id).toLowerCase()) ||
            (s.staffCode && String(s.staffCode).toUpperCase() === String(route.assigned_staff_id).toUpperCase()) ||
            (s.staff_code && String(s.staff_code).toUpperCase() === String(route.assigned_staff_id).toUpperCase())
          );
          if (match) sel.value = match.dbId || match.id;
        }
      }
    }
    openModal('v2SeqAssignStaffModal');
  }

  function openDeleteRouteConfirmModal(routeId) {
    const route = state.routes.find(r => r.id === routeId) || (state.activeRoute && state.activeRoute.id === routeId ? state.activeRoute : null);
    const form = document.getElementById('v2SeqDeleteConfirmForm');
    const msgEl = document.getElementById('v2SeqDeleteConfirmMessage');
    if (form) form.dataset.routeId = routeId;
    if (msgEl) {
      const label = route ? `${route.route_code || ''} — ${route.route_name || ''}`.trim() : 'this route';
      msgEl.textContent = `Delete ${label} and remove its stop assignments? This action cannot be undone.`;
    }
    openModal('v2SeqDeleteConfirmModal');
  }

  function openAddStopModal(routeId) {
    const form = document.getElementById('v2SeqAddStopForm');
    const sel = document.getElementById('v2SeqAddStopSelect');
    if (form) form.dataset.routeId = routeId;
    if (sel) {
      sel.innerHTML = '<option value="">Select unassigned DCC customer/vehicle...</option>' +
        state.unassigned.map(u => {
          const key = getUnassignedKey(u);
          const label = `${u.customer_name || 'Customer'} • ${u.registration_no || 'No Plate'} (${u.package_name || 'DCC'})`;
          return `<option value="${esc(key)}">${esc(label)}</option>`;
        }).join('');
    }
    openModal('v2SeqAddStopModal');
  }

  function openTransferStopModal(stopId) {
    const form = document.getElementById('v2SeqTransferStopForm');
    const sel = document.getElementById('v2SeqTransferTargetRouteSelect');
    if (form) {
      form.dataset.sourceRouteId = state.activeRouteId || '';
      form.dataset.stopId = stopId;
    }
    if (sel) {
      const others = state.routes.filter(r => r.id !== state.activeRouteId && String(r.status || 'active').toLowerCase() === 'active');
      sel.innerHTML = '<option value="">Select destination route...</option>' +
        others.map(r => `<option value="${esc(r.id)}">${esc(r.route_code)} — ${esc(r.route_name)}</option>`).join('');
    }
    openModal('v2SeqTransferStopModal');
  }

  async function executeBatchAssign(targetRouteId, keys) {
    if (!targetRouteId || !keys.length) return;
    let ok = 0;
    let fail = 0;
    for (const key of keys) {
      const u = state.unassigned.find(item => getUnassignedKey(item) === key);
      if (!u) continue;
      try {
        await apiRequest('addStopToRoute', {
          routeId: targetRouteId,
          subscriptionId: u.subscription_id,
          vehicleId: u.vehicle_id,
          customerId: u.customer_id,
          locationId: u.location_id || null
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }
    state.selectedUnassignedKeys.clear();
    showToast(`Assigned ${ok} vehicle(s) to route${fail ? ` (${fail} failed)` : ''}.`, fail ? 'warning' : 'success');
    await loadAllData(true);
  }

  function bindEvents() {
    const view = document.getElementById('v2View_sequence');
    if (!view || view.dataset.seqBound === '1') return;
    view.dataset.seqBound = '1';

    view.addEventListener('click', async (e) => {
      const subtabBtn = e.target.closest('[data-seq-subtab]');
      if (subtabBtn) {
        state.subtab = subtabBtn.dataset.seqSubtab;
        render();
        return;
      }

      const actionBtn = e.target.closest('[data-seq-action]');
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.seqAction;
        const routeId = actionBtn.dataset.routeId || state.activeRouteId;
        if (act === 'refresh') {
          await loadAllData(true);
          if (state.subtab === 'detail' && state.activeRouteId) await openRouteDetail(state.activeRouteId);
        } else if (act === 'create-route') {
          openCreateOrEditRouteModal(null);
        } else if (act === 'edit-route') {
          openCreateOrEditRouteModal(routeId);
        } else if (act === 'assign-staff') {
          openAssignStaffModal(routeId);
        } else if (act === 'unassign-staff') {
          if (!state.activeRouteId) return;
          try {
            await apiRequest('unassignStaffFromRoute', { routeId: state.activeRouteId });
            showToast('Staff unassigned from route.', 'success');
            await openRouteDetail(state.activeRouteId);
            await loadAllData(true);
            state.subtab = 'detail';
            render();
          } catch (err) {
            showToast(err.message || 'Failed to unassign staff.', 'error');
          }
        } else if (act === 'delete-route') {
          if (!routeId) return;
          openDeleteRouteConfirmModal(routeId);
        } else if (act === 'open-detail') {
          await openRouteDetail(routeId);
        } else if (act === 'back-to-routes') {
          state.subtab = 'routes';
          state.sequenceDirty = false;
          render();
        } else if (act === 'add-stop') {
          openAddStopModal(state.activeRouteId);
        } else if (act === 'save-sequence') {
          await saveSequence();
        } else if (act === 'move-stop') {
          moveStopLocally(Number(actionBtn.dataset.stopIndex), actionBtn.dataset.dir);
        } else if (act === 'transfer-stop') {
          openTransferStopModal(actionBtn.dataset.stopId);
        } else if (act === 'remove-stop') {
          const stopId = actionBtn.dataset.stopId;
          if (!stopId || !state.activeRouteId) return;
          try {
            await apiRequest('removeStopFromRoute', { routeId: state.activeRouteId, stopId });
            showToast('Stop removed from route.', 'success');
            await openRouteDetail(state.activeRouteId);
            await loadAllData(true);
            state.subtab = 'detail';
            render();
          } catch (err) {
            showToast(err.message || 'Failed to remove stop.', 'error');
          }
        } else if (act === 'reset-filters') {
          state.filters.search = '';
          state.filters.status = 'all';
          state.filters.staff = 'all';
          state.filters.area = 'all';
          state.filters.sort = 'code_asc';
          const sInp = document.getElementById('v2SeqSearchInput');
          if (sInp) sInp.value = '';
          const statusSel = document.getElementById('v2SeqStatusFilter');
          if (statusSel) statusSel.value = 'all';
          const staffSel = document.getElementById('v2SeqStaffFilter');
          if (staffSel) staffSel.value = 'all';
          const areaSel = document.getElementById('v2SeqAreaFilter');
          if (areaSel) areaSel.value = 'all';
          const sortSel = document.getElementById('v2SeqSortSelect');
          if (sortSel) sortSel.value = 'code_asc';
          render();
        } else if (act === 'batch-assign') {
          const targetRouteId = document.getElementById('v2SeqBatchRouteSelect')?.value;
          if (!targetRouteId) {
            showToast('Please select a target route.', 'warning');
            return;
          }
          await executeBatchAssign(targetRouteId, Array.from(state.selectedUnassignedKeys));
        } else if (act === 'quick-assign-unassigned') {
          const key = actionBtn.dataset.unassignedKey;
          if (!key) return;
          state.selectedUnassignedKeys.clear();
          state.selectedUnassignedKeys.add(key);
          renderUnassignedWorkbench();
          showToast('Select a target route in the batch bar above to assign.', 'info');
        }
        return;
      }

      const routeCard = e.target.closest('[data-route-card]');
      if (routeCard) {
        await openRouteDetail(routeCard.dataset.routeCard);
      }
    });

    view.addEventListener('input', (e) => {
      if (e.target.id === 'v2SeqSearchInput') {
        state.filters.search = e.target.value;
        renderRoutesHub();
      } else if (e.target.id === 'v2SeqUnassignedSearch') {
        state.filters.unassignedSearch = e.target.value;
        renderUnassignedWorkbench();
      }
    });

    view.addEventListener('change', (e) => {
      const id = e.target.id;
      if (id === 'v2SeqStatusFilter') { state.filters.status = e.target.value; renderRoutesHub(); }
      else if (id === 'v2SeqStaffFilter') { state.filters.staff = e.target.value; renderRoutesHub(); }
      else if (id === 'v2SeqAreaFilter') { state.filters.area = e.target.value; renderRoutesHub(); }
      else if (id === 'v2SeqSortSelect') { state.filters.sort = e.target.value; renderRoutesHub(); }
      else if (id === 'v2SeqUnassignedAreaFilter') { state.filters.unassignedArea = e.target.value; renderUnassignedWorkbench(); }
      else if (id === 'v2SeqSelectAllUnassigned') {
        const checked = e.target.checked;
        state.selectedUnassignedKeys.clear();
        if (checked) {
          state.unassigned.forEach(u => state.selectedUnassignedKeys.add(getUnassignedKey(u)));
        }
        renderUnassignedWorkbench();
      } else if (e.target.classList.contains('cwp-v2-seq-unassigned-cb')) {
        const key = e.target.dataset.unassignedKey;
        if (e.target.checked) state.selectedUnassignedKeys.add(key);
        else state.selectedUnassignedKeys.delete(key);
        renderUnassignedWorkbench();
      }
    });

    // Modal forms
    const routeForm = document.getElementById('v2SeqRouteForm');
    if (routeForm && routeForm.dataset.bound !== '1') {
      routeForm.dataset.bound = '1';
      routeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = routeForm.dataset.editRouteId || '';
        const routeCode = document.getElementById('v2SeqRouteCodeInput')?.value.trim();
        const routeName = document.getElementById('v2SeqRouteNameInput')?.value.trim();
        const operationalArea = document.getElementById('v2SeqRouteAreaInput')?.value.trim();
        const status = document.getElementById('v2SeqRouteStatusInput')?.value || 'active';
        const description = document.getElementById('v2SeqRouteDescInput')?.value.trim();
        try {
          if (editId) {
            await apiRequest('updateRoute', { routeId: editId, routeName, operationalArea, status, description });
            showToast('Route updated.', 'success');
          } else {
            await apiRequest('createRoute', { routeCode, routeName, operationalArea, status, description });
            showToast('Route created.', 'success');
          }
          closeModal('v2SeqRouteModal');
          await loadAllData(true);
          if (state.subtab === 'detail' && state.activeRouteId) await openRouteDetail(state.activeRouteId);
        } catch (err) {
          showToast(err.message || 'Failed to save route.', 'error');
        }
      });
    }

    const assignStaffForm = document.getElementById('v2SeqAssignStaffForm');
    if (assignStaffForm && assignStaffForm.dataset.bound !== '1') {
      assignStaffForm.dataset.bound = '1';
      assignStaffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const routeId = assignStaffForm.dataset.routeId;
        const staffId = document.getElementById('v2SeqAssignStaffSelect')?.value;
        if (!routeId || !staffId) {
          showToast('Please select a staff member.', 'warning');
          return;
        }
        try {
          await apiRequest('assignStaffToRoute', { routeId, staffId });
          showToast('Staff assigned to route.', 'success');
          closeModal('v2SeqAssignStaffModal');
          await loadAllData(true);
          if (state.subtab === 'detail' && state.activeRouteId) await openRouteDetail(state.activeRouteId);
        } catch (err) {
          showToast(err.message || 'Failed to assign staff.', 'error');
        }
      });
    }

    const addStopForm = document.getElementById('v2SeqAddStopForm');
    if (addStopForm && addStopForm.dataset.bound !== '1') {
      addStopForm.dataset.bound = '1';
      addStopForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const routeId = addStopForm.dataset.routeId;
        const key = document.getElementById('v2SeqAddStopSelect')?.value;
        const u = state.unassigned.find(item => getUnassignedKey(item) === key);
        if (!routeId || !u) {
          showToast('Please select an unassigned vehicle.', 'warning');
          return;
        }
        try {
          await apiRequest('addStopToRoute', {
            routeId,
            subscriptionId: u.subscription_id,
            vehicleId: u.vehicle_id,
            customerId: u.customer_id,
            locationId: u.location_id || null
          });
          showToast('Stop added to route.', 'success');
          closeModal('v2SeqAddStopModal');
          await openRouteDetail(routeId);
          await loadAllData(true);
          state.subtab = 'detail';
          render();
        } catch (err) {
          showToast(err.message || 'Failed to add stop.', 'error');
        }
      });
    }

    const transferForm = document.getElementById('v2SeqTransferStopForm');
    if (transferForm && transferForm.dataset.bound !== '1') {
      transferForm.dataset.bound = '1';
      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sourceRouteId = transferForm.dataset.sourceRouteId;
        const stopId = transferForm.dataset.stopId;
        const targetRouteId = document.getElementById('v2SeqTransferTargetRouteSelect')?.value;
        if (!sourceRouteId || !stopId || !targetRouteId) {
          showToast('Please select a destination route.', 'warning');
          return;
        }
        try {
          await apiRequest('moveStopBetweenRoutes', { sourceRouteId, targetRouteId, stopId });
          showToast('Stop transferred.', 'success');
          closeModal('v2SeqTransferStopModal');
          await openRouteDetail(sourceRouteId);
          await loadAllData(true);
          state.subtab = 'detail';
          render();
        } catch (err) {
          showToast(err.message || 'Failed to transfer stop.', 'error');
        }
      });
    }

    const deleteConfirmForm = document.getElementById('v2SeqDeleteConfirmForm');
    if (deleteConfirmForm && deleteConfirmForm.dataset.bound !== '1') {
      deleteConfirmForm.dataset.bound = '1';
      deleteConfirmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const routeId = deleteConfirmForm.dataset.routeId;
        if (!routeId) return;
        try {
          await apiRequest('deleteRoute', { routeId });
          showToast('Route deleted.', 'success');
          closeModal('v2SeqDeleteConfirmModal');
          state.subtab = 'routes';
          state.activeRouteId = null;
          state.activeRoute = null;
          await loadAllData(true);
        } catch (err) {
          showToast(err.message || 'Failed to delete route.', 'error');
        }
      });
    }
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    bindEvents();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'sequence') {
        loadAllData(false);
      }
    });

    const active = window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.getActiveView === 'function'
      ? window.CWP_ADMIN_V2.shell.getActiveView()
      : '';
    if (active === 'sequence') {
      loadAllData(false);
    }
  }

  window.CWP_ADMIN_V2.sequence = {
    init,
    loadData: loadAllData,
    openRouteDetail
  };
})(window);
