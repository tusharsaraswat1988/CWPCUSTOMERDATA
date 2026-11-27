/**
 * =========================================================================
 * CWP ADMIN V2 — LEADS MANAGEMENT & CONVERSION WORKSTATION MODULE
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.leads.
 * English-only Admin UI, Material Symbols only, zero mocks, zero emojis,
 * zero SSE indicators. Preserves all backend contracts & validation rules.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

  const STAGE_META = {
    open: { label: 'New', cls: 'is-open', icon: 'fiber_new' },
    follow_up: { label: 'Follow-Up', cls: 'is-follow_up', icon: 'phone_callback' },
    quoted: { label: 'Quoted', cls: 'is-quoted', icon: 'request_quote' },
    ready: { label: 'Ready to Convert', cls: 'is-ready', icon: 'verified' },
    lost: { label: 'Closed / Lost', cls: 'is-lost', icon: 'cancel' }
  };

  const PACKAGE_OPTIONS = {
    'Daily Car Cleaning': [
      { value: 'DCC ONLY', label: 'DCC ONLY (Exterior Daily)' },
      { value: 'Exterior Chemical Cleaning (30 Days)', label: 'Exterior Chemical Cleaning (30 Days)' },
      { value: 'Exterior Chemical Cleaning + 1 Carwash/mo', label: 'Exterior Chemical Cleaning + 1 Carwash/mo' },
      { value: 'Exterior Chemical Cleaning + 2 Carwash/mo', label: 'Exterior Chemical Cleaning + 2 Carwash/mo' },
      { value: 'OTHER', label: 'OTHER (Custom Subscription)' }
    ],
    'Car Washing': [
      { value: 'Single Wash (5 Seater)', label: 'Single Wash (5 Seater)' },
      { value: 'Single Wash (5+ Seater)', label: 'Single Wash (5+ Seater)' },
      { value: 'Wash Subscription (4 Washes / 6 Months) - 5 Seater', label: 'Wash Subscription (4 Washes / 6 Months) - 5 Seater' },
      { value: 'Wash Subscription (4 Washes / 6 Months) - 5+ Seater', label: 'Wash Subscription (4 Washes / 6 Months) - 5+ Seater' },
      { value: 'OTHER', label: 'OTHER (Custom Wash Plan)' }
    ],
    'Solar Panel Cleaning': [
      { value: 'One Time Solar Cleaning', label: 'One Time Solar Cleaning' },
      { value: '6 Month Subscription (6 frequencies)', label: '6 Month Subscription (6 frequencies)' },
      { value: '12 Month Subscription (12 frequencies)', label: '12 Month Subscription (12 frequencies)' },
      { value: 'OTHER', label: 'OTHER (Custom Solar Plan)' }
    ],
    'Interior Detailing': [
      { value: 'Interior Deep Cleaning', label: 'Interior Deep Cleaning' },
      { value: 'Roof Cleaning', label: 'Roof Cleaning' },
      { value: 'OTHER', label: 'OTHER (Custom Detailing)' }
    ],
    'Exterior Detailing': [
      { value: 'Ceramic Coating', label: 'Ceramic Coating' },
      { value: 'Graphene Coating', label: 'Graphene Coating' },
      { value: 'Car Waxing', label: 'Car Waxing' },
      { value: 'Glass Treatment', label: 'Glass Treatment' },
      { value: 'OTHER', label: 'OTHER (Custom Detailing)' }
    ]
  };

  const state = {
    allLeads: [],
    filteredLeads: [],
    staffList: [],
    selectedLeadId: null,
    kpiFilter: null,
    searchQuery: '',
    filters: {
      stage: 'all',
      service: 'all'
    },
    sort: {
      column: 'createdAt',
      direction: 'desc'
    },
    pagination: {
      currentPage: 1,
      pageSize: 25,
      totalRecords: 0
    },
    deleteTargetId: null,
    overflowLeadId: null,
    overflowTriggerEl: null,
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

  function showToast(msg, type = 'info') {
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.show === 'function') {
      window.CWP_ADMIN_V2.toast.show(msg, type, 3200);
    }
  }

  function hasAuthToken() {
    const gate = document.getElementById('v2LoginGate');
    if (gate && !gate.hidden && gate.style.display !== 'none') return false;
    const token = (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getToken === 'function')
      ? window.CWP_ADMIN_V2.auth.getToken()
      : (sessionStorage.getItem('cwp_admin_token') || localStorage.getItem('cwp_admin_token') || '');
    return Boolean(token && token.trim());
  }

  function getCleanPhone10(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/\D/g, '');
    return clean.length > 10 ? clean.slice(-10) : clean;
  }

  function isValidIndianMobile(phone) {
    const num10 = getCleanPhone10(phone);
    return INDIAN_PHONE_REGEX.test(num10);
  }

  function formatPhoneDisplay(phone) {
    if (!phone) return '';
    const num10 = getCleanPhone10(phone);
    if (num10.length === 10) {
      return `+91 ${num10.slice(0, 5)} ${num10.slice(5)}`;
    }
    return String(phone);
  }

  function normalizeStage(raw) {
    const s = String(raw || 'open').trim().toLowerCase();
    return STAGE_META[s] ? s : 'open';
  }

  function getStageMeta(raw) {
    return STAGE_META[normalizeStage(raw)] || STAGE_META.open;
  }

  function getServicePillClass(service) {
    const s = String(service || '').toLowerCase();
    if (s.includes('solar')) return 'is-solar';
    if (s.includes('wash')) return 'is-wash';
    if (s.includes('detailing')) return 'is-detailing';
    if (s.includes('daily')) return 'is-dcc';
    return '';
  }

  function parseVehicleString(s) {
    if (!s) return { model: '', reg: '' };
    const raw = String(s).trim();
    const regMatch = raw.match(/([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})/i);
    if (regMatch) {
      const reg = regMatch[1].toUpperCase().replace(/\s+/g, ' ');
      const model = raw.replace(regMatch[0], '').replace(/^[\s\-–—:,|]+|[\s\-–—:,|]+$/g, '').trim();
      return { reg, model };
    }
    return { reg: raw, model: '' };
  }

  function formatDateDisplay(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getLeadById(leadId) {
    if (!leadId) return null;
    return state.allLeads.find(l => l.id === leadId || l.customerCode === leadId) || null;
  }

  function getLeadKey(lead) {
    return lead ? (lead.id || lead.customerCode || '') : '';
  }

  function getLatestNoteLine(lead) {
    const raw = (lead.leadNotes || lead.notes || '').trim();
    if (!raw) return '';
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return lines.length > 0 ? lines[lines.length - 1] : raw;
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    bindHeaderAndToolbarEvents();
    bindTableEvents();
    bindModalEvents();

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail) {
        if (e.detail.tab === 'leads') {
          if (!state.hasLoadedOnce && hasAuthToken()) {
            loadData();
          }
        } else {
          closeAllLeadModals();
        }
      }
    });

    const viewEl = document.getElementById('v2View_leads');
    if (viewEl && viewEl.classList.contains('is-active') && !state.hasLoadedOnce && hasAuthToken()) {
      loadData();
    }
  }

  function closeAllLeadModals() {
    closeOverflowMenu();
    if (!window.CWP_ADMIN_V2.overlay) return;
    ['v2ModalLeadForm', 'v2ModalConvertLead', 'v2ModalLeadNote', 'v2ModalDeleteLead'].forEach(id => {
      window.CWP_ADMIN_V2.overlay.close(id, { pushHistory: false });
    });
  }

  // -------------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------------
  async function loadData(opts = {}) {
    if (!hasAuthToken() || state.isLoading) return;
    state.isLoading = true;

    const tbody = document.getElementById('v2LeadsTableBody');
    if (tbody && !opts.silent && window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.renderSkeletonRows === 'function') {
      window.CWP_ADMIN_V2.ui.renderSkeletonRows(tbody, 6, 7);
    }

    try {
      const api = window.CWP_ADMIN_V2.api;
      const [leadsRes, staffRes] = await Promise.allSettled([
        api.request('getLeads', { forceRefresh: !!opts.forceRefresh }),
        api.request('getStaffList', {})
      ]);

      if (leadsRes.status === 'fulfilled') {
        const rawLeads = Array.isArray(leadsRes.value)
          ? leadsRes.value
          : (leadsRes.value && Array.isArray(leadsRes.value.leads) ? leadsRes.value.leads : []);
        state.allLeads = rawLeads;
      } else {
        throw leadsRes.reason || new Error('Failed to load leads');
      }

      if (staffRes.status === 'fulfilled') {
        const rawStaff = Array.isArray(staffRes.value)
          ? staffRes.value
          : (staffRes.value && Array.isArray(staffRes.value.staff) ? staffRes.value.staff : []);
        state.staffList = rawStaff;
      }

      state.hasLoadedOnce = true;
      updateBadgesAndKpis();
      applyFiltersAndRender();
      if (state.selectedLeadId) {
        renderDetailPanel();
      }
    } catch (err) {
      if (tbody && window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.renderErrorState === 'function') {
        const colWrap = document.createElement('div');
        window.CWP_ADMIN_V2.ui.renderErrorState(colWrap, {
          title: 'Unable to load leads',
          message: err && err.message ? err.message : 'Please check your connection and try again.',
          retryLabel: 'Retry',
          onRetry: () => loadData({ forceRefresh: true })
        });
        tbody.innerHTML = `<tr><td colspan="7">${colWrap.innerHTML}</td></tr>`;
        const retryBtn = tbody.querySelector('[data-ui-empty-action]');
        if (retryBtn) retryBtn.addEventListener('click', () => loadData({ forceRefresh: true }));
      }
    } finally {
      state.isLoading = false;
    }
  }

  // -------------------------------------------------------------------------
  // KPIs & BADGES
  // -------------------------------------------------------------------------
  function updateBadgesAndKpis() {
    const all = state.allLeads || [];
    const counts = { all: all.length, open: 0, follow_up: 0, quoted: 0, ready: 0, lost: 0 };

    all.forEach(l => {
      const st = normalizeStage(l.leadStatus || l.stage);
      if (counts[st] !== undefined) counts[st] += 1;
    });

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setEl('v2LeadsHeaderCount', `${counts.all} ${counts.all === 1 ? 'lead' : 'leads'}`);
    setEl('v2BadgeLeads', counts.all > 500 ? '500+' : counts.all);
    setEl('v2LeadsKpiTotal', counts.all);
    setEl('v2LeadsKpiNew', counts.open);
    setEl('v2LeadsKpiFollowUp', counts.follow_up);
    setEl('v2LeadsKpiQuoted', counts.quoted);
    setEl('v2LeadsKpiReady', counts.ready);
    setEl('v2LeadsKpiLost', counts.lost);

    document.querySelectorAll('#v2LeadsKpiStrip .cwp-v2-ld-kpi-card').forEach(card => {
      const key = card.getAttribute('data-kpi');
      const isActive = (key === 'all' && !state.kpiFilter) || (state.kpiFilter === key);
      card.classList.toggle('is-active', isActive);
    });
  }

  // -------------------------------------------------------------------------
  // FILTERING, SORTING & PAGINATION
  // -------------------------------------------------------------------------
  function applyFiltersAndRender() {
    const q = state.searchQuery.trim().toLowerCase();
    const stageFilter = state.kpiFilter || state.filters.stage;
    const serviceFilter = state.filters.service;

    const filtered = state.allLeads.filter(l => {
      if (stageFilter && stageFilter !== 'all') {
        if (normalizeStage(l.leadStatus || l.stage) !== stageFilter) return false;
      }
      if (serviceFilter && serviceFilter !== 'all') {
        const svc = (l.interestedService || l.serviceCategory || '').trim();
        if (svc !== serviceFilter) return false;
      }
      if (q) {
        const haystack = [
          l.customerName, l.name, l.customerNumber, l.phone,
          l.address, l.vehicle, l.carMake, l.carColor,
          l.interestedService, l.serviceCategory, l.leadNotes, l.notes, l.customerCode
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const col = state.sort.column;
    const dir = state.sort.direction === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      let va = '';
      let vb = '';
      if (col === 'name') {
        va = (a.customerName || a.name || '').toLowerCase();
        vb = (b.customerName || b.name || '').toLowerCase();
      } else if (col === 'service') {
        va = (a.interestedService || a.serviceCategory || '').toLowerCase();
        vb = (b.interestedService || b.serviceCategory || '').toLowerCase();
      } else if (col === 'stage') {
        va = normalizeStage(a.leadStatus || a.stage);
        vb = normalizeStage(b.leadStatus || b.stage);
      } else {
        va = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        vb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.filteredLeads = filtered;
    state.pagination.totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pagination.pageSize));
    if (state.pagination.currentPage > totalPages) {
      state.pagination.currentPage = totalPages;
    }

    renderTable();
    renderPagination();
    updateSortHeaders();
  }

  function updateSortHeaders() {
    document.querySelectorAll('#v2LeadsTable thead th.is-sortable').forEach(th => {
      const col = th.getAttribute('data-sort-col');
      const isSorted = col === state.sort.column;
      th.classList.toggle('is-sorted', isSorted);
      const icon = th.querySelector('.cwp-v2-ld-sort-icon');
      if (icon) {
        icon.textContent = isSorted
          ? (state.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward')
          : 'unfold_more';
      }
    });
  }

  // -------------------------------------------------------------------------
  // TABLE RENDERING
  // -------------------------------------------------------------------------
  function renderTable() {
    const tbody = document.getElementById('v2LeadsTableBody');
    if (!tbody) return;

    const total = state.filteredLeads.length;
    if (total === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:36px 16px; text-align:center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:#64748b;">
              <span class="material-symbols-outlined" style="font-size:32px; color:#94a3b8;" aria-hidden="true">person_search</span>
              <div style="font-size:14px; font-weight:600; color:#0f172a;">No leads match current filters</div>
              <div style="font-size:12px;">Adjust search or filter criteria, or add a new lead.</div>
              <div style="display:flex; gap:8px; margin-top:4px;">
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-ld-empty-reset>Reset Filters</button>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-ld-empty-add>Add Lead</button>
              </div>
            </div>
          </td>
        </tr>
      `;
      const resetBtn = tbody.querySelector('[data-ld-empty-reset]');
      const addBtn = tbody.querySelector('[data-ld-empty-add]');
      if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);
      if (addBtn) addBtn.addEventListener('click', () => openLeadFormModal(null, addBtn));
      return;
    }

    const startIdx = (state.pagination.currentPage - 1) * state.pagination.pageSize;
    const pageRows = state.filteredLeads.slice(startIdx, startIdx + state.pagination.pageSize);

    tbody.innerHTML = pageRows.map(lead => {
      const id = getLeadKey(lead);
      const name = lead.customerName || lead.name || 'Prospect Lead';
      const rawPhone = lead.customerNumber || lead.phone || '';
      const clean10 = getCleanPhone10(rawPhone);
      const phoneDisp = formatPhoneDisplay(rawPhone);
      const rawVeh = (lead.vehicle || lead.vehicleDetails || '').trim();
      const parsedVeh = rawVeh ? parseVehicleString(rawVeh) : null;
      const makeColor = [lead.carMake || lead.car_make, lead.carColor || lead.car_color].filter(Boolean).join(' • ');
      const address = (lead.address || '').trim();
      const service = (lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning').trim();
      const stage = normalizeStage(lead.leadStatus || lead.stage);
      const fullNotes = (lead.leadNotes || lead.notes || '').trim();
      const latestNote = getLatestNoteLine(lead);
      const isSelected = state.selectedLeadId === id;

      return `
        <tr data-lead-id="${escapeHtml(id)}" class="${isSelected ? 'is-selected-row' : ''}" tabindex="0">
          <td>
            <div class="cwp-v2-ld-cell-primary" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="cwp-v2-ld-cell-sub">${phoneDisp ? escapeHtml(phoneDisp) : 'No phone'}</div>
          </td>
          <td>
            ${rawVeh
              ? `<span class="cwp-v2-ld-plate-badge">${escapeHtml(parsedVeh.reg || rawVeh)}</span>`
              : '<span class="cwp-v2-ld-cell-sub">No vehicle</span>'}
            ${(parsedVeh && parsedVeh.model) || makeColor
              ? `<div class="cwp-v2-ld-cell-sub" title="${escapeHtml(parsedVeh?.model || makeColor)}">${escapeHtml(parsedVeh?.model || makeColor)}</div>`
              : ''}
          </td>
          <td>
            <div class="cwp-v2-ld-cell-truncate" title="${escapeHtml(address || 'No address')}">
              ${address ? escapeHtml(address) : '<span class="cwp-v2-ld-cell-sub">No address</span>'}
            </div>
          </td>
          <td>
            <span class="cwp-v2-ld-service-pill ${getServicePillClass(service)}">${escapeHtml(service)}</span>
          </td>
          <td data-no-row-select>
            <select class="cwp-v2-ld-stage-select is-${escapeHtml(stage)}" data-stage-select="${escapeHtml(id)}" aria-label="Change stage for ${escapeHtml(name)}">
              <option value="open"${stage === 'open' ? ' selected' : ''}>New</option>
              <option value="follow_up"${stage === 'follow_up' ? ' selected' : ''}>Follow-Up</option>
              <option value="quoted"${stage === 'quoted' ? ' selected' : ''}>Quoted</option>
              <option value="ready"${stage === 'ready' ? ' selected' : ''}>Ready</option>
              <option value="lost"${stage === 'lost' ? ' selected' : ''}>Lost</option>
            </select>
          </td>
          <td>
            ${latestNote
              ? `<div class="cwp-v2-ld-note-preview" data-note-open="${escapeHtml(id)}" role="button" tabindex="0" title="${escapeHtml(fullNotes)}" aria-label="View full notes for ${escapeHtml(name)}">
                   <span class="cwp-v2-ld-note-preview-text">${escapeHtml(latestNote)}</span>
                   <span class="material-symbols-outlined" style="font-size:13px; color:#64748b; flex-shrink:0;" aria-hidden="true">open_in_new</span>
                 </div>`
              : '<span class="cwp-v2-ld-cell-sub">No notes</span>'}
          </td>
          <td style="text-align:right;" data-no-row-select>
            <div class="cwp-v2-ld-row-actions">
              ${clean10
                ? `<a href="tel:+91${escapeHtml(clean10)}" class="cwp-v2-ld-icon-btn is-call" title="Call Lead" aria-label="Call ${escapeHtml(name)}"><span class="material-symbols-outlined" style="font-size:16px;">call</span></a>`
                : ''}
              <button type="button" class="cwp-v2-ld-icon-btn" data-action="edit" data-id="${escapeHtml(id)}" title="Edit Lead" aria-label="Edit ${escapeHtml(name)}">
                <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
              </button>
              <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-action="convert" data-id="${escapeHtml(id)}" title="Convert to Customer" style="height:28px; padding:0 10px; font-size:11.5px;">
                Convert
              </button>
              <button type="button" class="cwp-v2-ld-icon-btn" data-overflow-trigger="${escapeHtml(id)}" aria-haspopup="menu" aria-expanded="false" title="More actions" aria-label="More actions for ${escapeHtml(name)}">
                <span class="material-symbols-outlined" style="font-size:16px;">more_vert</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination() {
    const infoEl = document.getElementById('v2LeadsPageInfo');
    const numsEl = document.getElementById('v2LeadsPageNumbers');
    const prevBtn = document.getElementById('v2LeadsPagePrev');
    const nextBtn = document.getElementById('v2LeadsPageNext');

    const total = state.pagination.totalRecords;
    const size = state.pagination.pageSize;
    const page = state.pagination.currentPage;
    const totalPages = Math.max(1, Math.ceil(total / size));

    const start = total === 0 ? 0 : (page - 1) * size + 1;
    const end = Math.min(total, page * size);
    if (infoEl) infoEl.textContent = `Showing ${start}–${end} of ${total} leads`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (numsEl) {
      const maxButtons = 5;
      let startPage = Math.max(1, page - 2);
      const endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }
      let html = '';
      for (let p = startPage; p <= endPage; p++) {
        html += `<button type="button" class="cwp-v2-ld-page-btn ${p === page ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
      }
      numsEl.innerHTML = html;
    }
  }

  // -------------------------------------------------------------------------
  // DISMISSIBLE DETAIL PANEL
  // -------------------------------------------------------------------------
  function selectLead(leadId) {
    if (!leadId || state.selectedLeadId === leadId) {
      closeDetailPanel();
      return;
    }
    state.selectedLeadId = leadId;
    renderDetailPanel();
    // Highlight active row without re-rendering whole table (preserves scroll)
    document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]').forEach(tr => {
      tr.classList.toggle('is-selected-row', tr.getAttribute('data-lead-id') === leadId);
    });
  }

  function closeDetailPanel() {
    state.selectedLeadId = null;
    const split = document.getElementById('v2LeadsSplitView');
    if (split) split.classList.add('is-detail-closed');
    document.querySelectorAll('#v2LeadsTableBody tr.is-selected-row').forEach(tr => {
      tr.classList.remove('is-selected-row');
    });
  }

  function renderDetailPanel() {
    const split = document.getElementById('v2LeadsSplitView');
    const headerEl = document.getElementById('v2LeadsDetailHeader');
    const scrollEl = document.getElementById('v2LeadsDetailScroll');
    const actionsEl = document.getElementById('v2LeadsDetailActions');
    if (!split || !headerEl || !scrollEl || !actionsEl) return;

    const lead = getLeadById(state.selectedLeadId);
    if (!lead) {
      split.classList.add('is-detail-closed');
      return;
    }

    split.classList.remove('is-detail-closed');

    const id = getLeadKey(lead);
    const name = lead.customerName || lead.name || 'Prospect Lead';
    const rawPhone = lead.customerNumber || lead.phone || '';
    const clean10 = getCleanPhone10(rawPhone);
    const phoneDisp = formatPhoneDisplay(rawPhone) || 'Not provided';
    const stage = normalizeStage(lead.leadStatus || lead.stage);
    const stageMeta = getStageMeta(stage);
    const service = (lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning').trim();
    const vehicle = (lead.vehicle || lead.vehicleDetails || '').trim() || 'Not provided';
    const makeColor = [lead.carMake || lead.car_make, lead.carColor || lead.car_color].filter(Boolean).join(' • ') || '—';
    const address = (lead.address || '').trim() || 'Not provided';
    const mapsUrl = (lead.googleMapsUrl || lead.mapsUrl || '').trim();
    const notes = (lead.leadNotes || lead.notes || '').trim();
    const waText = encodeURIComponent(`Hello ${name}, reaching out from CWP Detailers regarding your ${service} inquiry.`);

    headerEl.innerHTML = `
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:15px; font-weight:700; color:#0f172a;">${escapeHtml(name)}</h3>
          <span class="cwp-v2-ld-stage-badge ${stageMeta.cls}">${escapeHtml(stageMeta.label)}</span>
        </div>
        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">
          ${lead.phone ? `${escapeHtml(lead.phone)} • ` : ''}Created ${escapeHtml(formatDateDisplay(lead.createdAt))}
        </div>
      </div>
      <button type="button" id="v2LeadsDetailCloseBtn" class="cwp-v2-modal-close-btn" aria-label="Close lead detail panel">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    `;

    scrollEl.innerHTML = `
      <div class="cwp-v2-ld-detail-section">
        <div class="cwp-v2-ld-detail-section-title">Contact &amp; Location</div>
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Phone</span>
          <span class="cwp-v2-ld-detail-v">${escapeHtml(phoneDisp)}</span>
        </div>
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Area / Address</span>
          <span class="cwp-v2-ld-detail-v">${escapeHtml(address)}</span>
        </div>
        ${mapsUrl ? `
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Map Pin</span>
          <span class="cwp-v2-ld-detail-v">
            <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" style="color:#1e40af; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:3px;">
              <span>Open in Maps</span>
              <span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span>
            </a>
          </span>
        </div>` : ''}
      </div>

      <div class="cwp-v2-ld-detail-section">
        <div class="cwp-v2-ld-detail-section-title">Inquiry &amp; Vehicle</div>
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Interested Service</span>
          <span class="cwp-v2-ld-detail-v">${escapeHtml(service)}</span>
        </div>
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Vehicle</span>
          <span class="cwp-v2-ld-detail-v">${escapeHtml(vehicle)}</span>
        </div>
        <div class="cwp-v2-ld-detail-kv">
          <span class="cwp-v2-ld-detail-k">Make &amp; Color</span>
          <span class="cwp-v2-ld-detail-v">${escapeHtml(makeColor)}</span>
        </div>
        <div class="cwp-v2-ld-detail-kv" style="align-items:center;">
          <span class="cwp-v2-ld-detail-k">Pipeline Stage</span>
          <select id="v2LeadsDetailStageSelect" class="cwp-v2-ld-stage-select" data-detail-stage="${escapeHtml(id)}">
            <option value="open"${stage === 'open' ? ' selected' : ''}>New</option>
            <option value="follow_up"${stage === 'follow_up' ? ' selected' : ''}>Follow-Up</option>
            <option value="quoted"${stage === 'quoted' ? ' selected' : ''}>Quoted</option>
            <option value="ready"${stage === 'ready' ? ' selected' : ''}>Ready to Convert</option>
            <option value="lost"${stage === 'lost' ? ' selected' : ''}>Closed / Lost</option>
          </select>
        </div>
      </div>

      <div class="cwp-v2-ld-detail-section">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="cwp-v2-ld-detail-section-title" style="margin:0;">Notes &amp; Follow-Up History</span>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" data-detail-action="note" data-id="${escapeHtml(id)}" style="height:24px; padding:0 6px; font-size:11px;">
            <span class="material-symbols-outlined" style="font-size:14px;">add</span>
            <span>Add Note</span>
          </button>
        </div>
        <div class="cwp-v2-ld-notes-log">${notes ? escapeHtml(notes) : 'No notes logged yet.'}</div>
      </div>
    `;

    actionsEl.innerHTML = `
      ${clean10 ? `
        <a href="tel:+91${escapeHtml(clean10)}" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm">
          <span class="material-symbols-outlined" style="font-size:15px;">call</span>
          <span>Call</span>
        </a>
        <a href="https://wa.me/91${escapeHtml(clean10)}?text=${waText}" target="_blank" rel="noopener" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm">
          <span class="material-symbols-outlined" style="font-size:15px;">chat</span>
          <span>WhatsApp</span>
        </a>
      ` : ''}
      <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-detail-action="edit" data-id="${escapeHtml(id)}">
        <span class="material-symbols-outlined" style="font-size:15px;">edit</span>
        <span>Edit</span>
      </button>
      <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-detail-action="convert" data-id="${escapeHtml(id)}">
        <span class="material-symbols-outlined" style="font-size:15px;">verified</span>
        <span>Convert to Customer</span>
      </button>
      ${stage !== 'lost' ? `
        <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" data-detail-action="mark-lost" data-id="${escapeHtml(id)}" style="color:#b91c1c;">
          <span class="material-symbols-outlined" style="font-size:15px;">cancel</span>
          <span>Mark Lost</span>
        </button>
      ` : ''}
      <button type="button" class="cwp-v2-btn cwp-v2-btn-ghost cwp-v2-btn-sm" data-detail-action="delete" data-id="${escapeHtml(id)}" style="color:#dc2626;">
        <span class="material-symbols-outlined" style="font-size:15px;">delete</span>
        <span>Delete</span>
      </button>
    `;

    const closeBtn = document.getElementById('v2LeadsDetailCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDetailPanel);

    const detailStageSel = document.getElementById('v2LeadsDetailStageSelect');
    if (detailStageSel) {
      detailStageSel.addEventListener('change', () => {
        handleStageChange(id, detailStageSel.value);
      });
    }

    scrollEl.querySelectorAll('[data-detail-action]').forEach(btn => {
      btn.addEventListener('click', () => handleActionTrigger(btn.getAttribute('data-detail-action'), id, btn));
    });
    actionsEl.querySelectorAll('[data-detail-action]').forEach(btn => {
      btn.addEventListener('click', () => handleActionTrigger(btn.getAttribute('data-detail-action'), id, btn));
    });
  }

  // -------------------------------------------------------------------------
  // NOTES DETAIL FOCUS & OVERFLOW ACTION MENU
  // -------------------------------------------------------------------------
  function openLeadNotesDetail(leadId) {
    if (!leadId) return;
    if (state.selectedLeadId !== leadId) {
      state.selectedLeadId = leadId;
      renderDetailPanel();
      document.querySelectorAll('#v2LeadsTableBody tr[data-lead-id]').forEach(tr => {
        tr.classList.toggle('is-selected-row', tr.getAttribute('data-lead-id') === leadId);
      });
    }
    const notesBox = document.querySelector('#v2LeadsDetailScroll .cwp-v2-ld-notes-log');
    if (notesBox) {
      notesBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      notesBox.classList.remove('is-highlighted');
      void notesBox.offsetWidth;
      notesBox.classList.add('is-highlighted');
    }
  }

  function closeOverflowMenu() {
    const menu = document.getElementById('v2LeadsOverflowMenu');
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
    }
    if (state.overflowTriggerEl) {
      state.overflowTriggerEl.setAttribute('aria-expanded', 'false');
    }
    state.overflowLeadId = null;
    state.overflowTriggerEl = null;
  }

  function openOverflowMenu(leadId, triggerEl) {
    const menu = document.getElementById('v2LeadsOverflowMenu');
    const lead = getLeadById(leadId);
    if (!menu || !lead || !triggerEl) return;

    if (state.overflowLeadId === leadId && !menu.hidden) {
      closeOverflowMenu();
      return;
    }

    closeOverflowMenu();

    const id = getLeadKey(lead);
    const name = lead.customerName || lead.name || 'Prospect Lead';
    const clean10 = getCleanPhone10(lead.customerNumber || lead.phone || '');
    const service = (lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning').trim();
    const stage = normalizeStage(lead.leadStatus || lead.stage);
    const waText = encodeURIComponent(`Hello ${name}, reaching out from CWP Detailers regarding your ${service} inquiry.`);

    menu.innerHTML = `
      ${clean10 ? `
        <a href="https://wa.me/91${escapeHtml(clean10)}?text=${waText}" target="_blank" rel="noopener" class="cwp-v2-ld-overflow-item" role="menuitem">
          <span class="material-symbols-outlined" style="font-size:16px; color:#15803d;" aria-hidden="true">chat</span>
          <span>WhatsApp</span>
        </a>
      ` : ''}
      <button type="button" class="cwp-v2-ld-overflow-item" role="menuitem" data-overflow-action="note" data-id="${escapeHtml(id)}">
        <span class="material-symbols-outlined" style="font-size:16px; color:#475569;" aria-hidden="true">note_add</span>
        <span>Add Note</span>
      </button>
      ${stage !== 'lost' ? `
        <button type="button" class="cwp-v2-ld-overflow-item" role="menuitem" data-overflow-action="mark-lost" data-id="${escapeHtml(id)}">
          <span class="material-symbols-outlined" style="font-size:16px; color:#b91c1c;" aria-hidden="true">cancel</span>
          <span>Mark Lost</span>
        </button>
      ` : ''}
      <div class="cwp-v2-ld-overflow-divider" role="separator"></div>
      <button type="button" class="cwp-v2-ld-overflow-item is-danger" role="menuitem" data-overflow-action="delete" data-id="${escapeHtml(id)}">
        <span class="material-symbols-outlined" style="font-size:16px;" aria-hidden="true">delete</span>
        <span>Delete Lead</span>
      </button>
    `;

    menu.hidden = false;
    state.overflowLeadId = id;
    state.overflowTriggerEl = triggerEl;
    triggerEl.setAttribute('aria-expanded', 'true');

    const rect = triggerEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right - menuRect.width;
    if (left < 8) left = 8;
    if (left + menuRect.width > vw - 8) left = vw - menuRect.width - 8;

    let top = rect.bottom + 4;
    if (top + menuRect.height > vh - 8) {
      top = Math.max(8, rect.top - menuRect.height - 4);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;

    const firstItem = menu.querySelector('[role="menuitem"]');
    if (firstItem) firstItem.focus();
  }

  // -------------------------------------------------------------------------
  // STAGE UPDATES
  // -------------------------------------------------------------------------
  async function handleStageChange(leadId, newStage, selectEl = null) {
    const lead = getLeadById(leadId);
    if (!lead) return;
    const oldStage = normalizeStage(lead.leadStatus || lead.stage);
    const targetStage = normalizeStage(newStage);
    if (oldStage === targetStage) return;

    if (selectEl) {
      selectEl.disabled = true;
      selectEl.classList.add('is-saving');
    }

    try {
      const res = await window.CWP_ADMIN_V2.api.request('updateLeadStage', { leadId, stage: targetStage });
      if (res && res.error) {
        throw new Error(res.error);
      }
      lead.leadStatus = targetStage;
      updateBadgesAndKpis();
      applyFiltersAndRender();
      if (state.selectedLeadId === getLeadKey(lead)) {
        renderDetailPanel();
      }
      showToast(`Lead stage updated to ${getStageMeta(targetStage).label}`, 'success');
    } catch (err) {
      if (selectEl) {
        selectEl.value = oldStage;
      }
      updateBadgesAndKpis();
      applyFiltersAndRender();
      if (state.selectedLeadId === getLeadKey(lead)) {
        renderDetailPanel();
      }
      showToast(err && err.message ? err.message : 'Failed to update lead stage', 'error');
    } finally {
      if (selectEl) {
        selectEl.disabled = false;
        selectEl.classList.remove('is-saving');
      }
    }
  }

  // -------------------------------------------------------------------------
  // ADD / EDIT LEAD MODAL
  // -------------------------------------------------------------------------
  function setFormAlert(alertId, message) {
    const el = document.getElementById(alertId);
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function openLeadFormModal(leadId, triggerEl) {
    const form = document.getElementById('v2LeadForm');
    if (form) form.reset();
    setFormAlert('v2LeadFormAlert', '');

    const editIdEl = document.getElementById('v2LeadEditId');
    const titleEl = document.getElementById('v2LeadFormModalTitle');
    const submitBtn = document.getElementById('v2LeadFormSubmitBtn');

    if (leadId) {
      const lead = getLeadById(leadId);
      if (!lead) {
        showToast('Lead record not found.', 'error');
        return;
      }
      if (editIdEl) editIdEl.value = getLeadKey(lead);
      if (titleEl) titleEl.textContent = 'Edit Lead Details';
      if (submitBtn) submitBtn.textContent = 'Update Lead';

      document.getElementById('v2LeadNameInput').value = lead.customerName || lead.name || '';
      document.getElementById('v2LeadPhoneInput').value = getCleanPhone10(lead.customerNumber || lead.phone || '');
      document.getElementById('v2LeadStageInput').value = normalizeStage(lead.leadStatus || lead.stage);
      const svcSelect = document.getElementById('v2LeadServiceInput');
      const svcVal = lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning';
      svcSelect.value = Array.from(svcSelect.options).some(o => o.value === svcVal) ? svcVal : 'Daily Car Cleaning';
      document.getElementById('v2LeadAddressInput').value = lead.address || '';
      document.getElementById('v2LeadMapsUrlInput').value = lead.googleMapsUrl || lead.mapsUrl || '';
      document.getElementById('v2LeadVehicleInput').value = lead.vehicle || lead.vehicleDetails || '';
      document.getElementById('v2LeadCarMakeInput').value = lead.carMake || lead.car_make || '';
      document.getElementById('v2LeadCarColorInput').value = lead.carColor || lead.car_color || '';
      document.getElementById('v2LeadNotesInput').value = lead.leadNotes || lead.notes || '';
    } else {
      if (editIdEl) editIdEl.value = '';
      if (titleEl) titleEl.textContent = 'Add New Lead';
      if (submitBtn) submitBtn.textContent = 'Save Lead';
      document.getElementById('v2LeadStageInput').value = 'open';
    }

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalLeadForm', {
        triggerEl,
        initialFocus: '#v2LeadNameInput'
      });
    }
  }

  async function handleLeadFormSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const editId = (document.getElementById('v2LeadEditId').value || '').trim();
    const nameVal = (document.getElementById('v2LeadNameInput').value || '').trim();
    const rawPhone = (document.getElementById('v2LeadPhoneInput').value || '').trim();
    const stageVal = document.getElementById('v2LeadStageInput').value || 'open';
    const serviceVal = document.getElementById('v2LeadServiceInput').value || 'Daily Car Cleaning';
    const addrVal = (document.getElementById('v2LeadAddressInput').value || '').trim();
    const mapsVal = (document.getElementById('v2LeadMapsUrlInput').value || '').trim();
    const vehVal = (document.getElementById('v2LeadVehicleInput').value || '').trim();
    const makeVal = (document.getElementById('v2LeadCarMakeInput').value || '').trim();
    const colorVal = (document.getElementById('v2LeadCarColorInput').value || '').trim();
    const notesVal = (document.getElementById('v2LeadNotesInput').value || '').trim();

    if (!nameVal) {
      setFormAlert('v2LeadFormAlert', 'Please enter the prospect or customer name.');
      document.getElementById('v2LeadNameInput').focus();
      return;
    }

    let normPhone = '';
    if (rawPhone) {
      if (!isValidIndianMobile(rawPhone)) {
        setFormAlert('v2LeadFormAlert', 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (or leave blank if unknown).');
        document.getElementById('v2LeadPhoneInput').focus();
        return;
      }
      normPhone = getCleanPhone10(rawPhone);
    }

    setFormAlert('v2LeadFormAlert', '');
    state.isSubmitting = true;
    const submitBtn = document.getElementById('v2LeadFormSubmitBtn');

    const leadData = {
      id: editId || undefined,
      customerName: nameVal,
      name: nameVal,
      customerNumber: normPhone,
      phone: normPhone,
      address: addrVal,
      googleMapsUrl: mapsVal,
      mapsUrl: mapsVal,
      vehicle: vehVal,
      vehicleDetails: vehVal,
      carMake: makeVal,
      car_make: makeVal,
      carColor: colorVal,
      car_color: colorVal,
      serviceCategory: serviceVal,
      serviceType: serviceVal,
      interestedService: serviceVal,
      isLead: true,
      tag: 'lead',
      leadStatus: stageVal,
      stage: stageVal,
      notes: notesVal,
      leadNotes: notesVal
    };

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, async () => {
        const res = editId
          ? await window.CWP_ADMIN_V2.api.request('updateLead', { leadId: editId, leadData })
          : await window.CWP_ADMIN_V2.api.request('saveLead', { customerData: leadData });

        if (res && res.error) {
          throw new Error(res.error);
        }

        showToast(editId ? 'Lead updated successfully.' : 'Lead added to pipeline.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalLeadForm');
        }
        await loadData({ forceRefresh: true, silent: true });
      }, editId ? 'Updating...' : 'Saving...');
    } catch (err) {
      setFormAlert('v2LeadFormAlert', err && err.message ? err.message : 'Unable to save lead.');
    } finally {
      state.isSubmitting = false;
    }
  }

  function detectGpsLocation() {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'warning');
      return;
    }
    showToast('Detecting current GPS coordinates...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const input = document.getElementById('v2LeadMapsUrlInput');
        if (input) input.value = `https://maps.google.com/?q=${lat},${lng}`;
        showToast('GPS location captured.', 'success');
      },
      (err) => {
        showToast(`GPS error: ${err.message || 'Permission denied'}`, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // -------------------------------------------------------------------------
  // CONVERT LEAD TO CUSTOMER MODAL
  // -------------------------------------------------------------------------
  function updateConvertCategoryFields(category) {
    const isSolar = category === 'Solar Panel Cleaning';
    const solarGroup = document.getElementById('v2ConvertSolarGroup');
    const seaterGroup = document.getElementById('v2ConvertSeaterGroup');
    const pkgSelect = document.getElementById('v2ConvertPackageInput');

    if (solarGroup) solarGroup.hidden = !isSolar;
    if (seaterGroup) seaterGroup.hidden = isSolar;

    if (pkgSelect) {
      const opts = PACKAGE_OPTIONS[category] || PACKAGE_OPTIONS['Daily Car Cleaning'];
      pkgSelect.innerHTML = opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
    }
  }

  function openConvertLeadModal(leadId, triggerEl) {
    const lead = getLeadById(leadId);
    if (!lead) {
      showToast('Lead record not found.', 'error');
      return;
    }
    setFormAlert('v2ConvertLeadAlert', '');

    document.getElementById('v2ConvertLeadId').value = getLeadKey(lead);
    document.getElementById('v2ConvertSummaryName').textContent = lead.customerName || lead.name || '—';
    document.getElementById('v2ConvertSummaryPhone').textContent = formatPhoneDisplay(lead.customerNumber || lead.phone) || 'Not provided';
    document.getElementById('v2ConvertSummaryVehicle').textContent = lead.vehicle || lead.vehicleDetails || 'Not provided';
    document.getElementById('v2ConvertSummaryAddress').textContent = lead.address || 'Not provided';

    const catSelect = document.getElementById('v2ConvertServiceInput');
    const svc = lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning';
    catSelect.value = Array.from(catSelect.options).some(o => o.value === svc) ? svc : 'Daily Car Cleaning';
    updateConvertCategoryFields(catSelect.value);

    document.getElementById('v2ConvertSeaterInput').value = lead.seaterType || lead.seater_type || '5_seater';
    document.getElementById('v2ConvertPanelsInput').value = lead.panelCount || lead.panel_count || '';
    document.getElementById('v2ConvertNotesInput').value = '';

    const staffSelect = document.getElementById('v2ConvertStaffInput');
    if (staffSelect) {
      const activeStaff = (state.staffList || []).filter(s => s.active !== false && s.isActive !== false);
      staffSelect.innerHTML = '<option value="">Unassigned (Assign later)</option>' +
        activeStaff.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.staffCode || s.id)})</option>`).join('');
    }

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalConvertLead', {
        triggerEl,
        initialFocus: '#v2ConvertServiceInput'
      });
    }
  }

  async function handleConvertLeadSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const leadId = document.getElementById('v2ConvertLeadId').value;
    const serviceCategory = document.getElementById('v2ConvertServiceInput').value;
    const packageType = document.getElementById('v2ConvertPackageInput').value;
    const isSolar = serviceCategory === 'Solar Panel Cleaning';
    const panelCount = isSolar ? (parseInt(document.getElementById('v2ConvertPanelsInput').value, 10) || null) : null;
    const seaterType = isSolar ? null : document.getElementById('v2ConvertSeaterInput').value;
    const staffSelect = document.getElementById('v2ConvertStaffInput');
    const staffId = staffSelect ? staffSelect.value : '';
    let staffName = '';
    if (staffId && staffSelect.selectedIndex >= 0) {
      staffName = staffSelect.options[staffSelect.selectedIndex].textContent.replace(/\s*\(.*\)$/, '').trim();
    }
    const notes = (document.getElementById('v2ConvertNotesInput').value || '').trim();

    setFormAlert('v2ConvertLeadAlert', '');
    state.isSubmitting = true;
    const btn = document.getElementById('v2ConvertLeadSubmitBtn');

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('convertLead', {
          leadId,
          convertData: {
            serviceCategory,
            packageType,
            panelCount,
            panel_count: panelCount,
            seaterType,
            seater_type: seaterType,
            staffId,
            staffName,
            notes
          }
        });

        if (res && res.error) {
          throw new Error(res.error);
        }

        showToast('Lead converted to active customer.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalConvertLead');
        }
        if (state.selectedLeadId === leadId) {
          closeDetailPanel();
        }
        await loadData({ forceRefresh: true, silent: true });
        if (window.CWP_ADMIN_V2.customers && typeof window.CWP_ADMIN_V2.customers.loadData === 'function') {
          window.CWP_ADMIN_V2.customers.loadData();
        }
      }, 'Converting...');
    } catch (err) {
      setFormAlert('v2ConvertLeadAlert', err && err.message ? err.message : 'Failed to convert lead.');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // ADD NOTE MODAL
  // -------------------------------------------------------------------------
  function openLeadNoteModal(leadId, triggerEl) {
    const lead = getLeadById(leadId);
    if (!lead) return;
    setFormAlert('v2LeadNoteAlert', '');

    document.getElementById('v2LeadNoteTargetId').value = getLeadKey(lead);
    document.getElementById('v2LeadNoteSubject').textContent = `${lead.customerName || lead.name || 'Prospect'}${lead.vehicle ? ' • ' + lead.vehicle : ''}`;
    document.getElementById('v2LeadNoteHistory').textContent = (lead.leadNotes || lead.notes || '').trim() || 'No prior notes logged.';
    document.getElementById('v2LeadNoteTextInput').value = '';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalLeadNote', {
        triggerEl,
        initialFocus: '#v2LeadNoteTextInput'
      });
    }
  }

  async function handleLeadNoteSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const leadId = document.getElementById('v2LeadNoteTargetId').value;
    const noteText = (document.getElementById('v2LeadNoteTextInput').value || '').trim();
    if (!noteText) {
      setFormAlert('v2LeadNoteAlert', 'Please enter a note or follow-up remark.');
      document.getElementById('v2LeadNoteTextInput').focus();
      return;
    }

    setFormAlert('v2LeadNoteAlert', '');
    state.isSubmitting = true;
    const btn = document.getElementById('v2LeadNoteSubmitBtn');

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('addLeadNote', { leadId, note: noteText });
        if (res && res.error) {
          throw new Error(res.error);
        }
        showToast('Follow-up note saved.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalLeadNote');
        }
        await loadData({ forceRefresh: true, silent: true });
      }, 'Saving note...');
    } catch (err) {
      setFormAlert('v2LeadNoteAlert', err && err.message ? err.message : 'Unable to save note.');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // DELETE LEAD MODAL
  // -------------------------------------------------------------------------
  function openDeleteLeadModal(leadId, triggerEl) {
    const lead = getLeadById(leadId);
    if (!lead) return;
    state.deleteTargetId = getLeadKey(lead);
    const nameEl = document.getElementById('v2DeleteLeadName');
    if (nameEl) nameEl.textContent = lead.customerName || lead.name || 'this lead';

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalDeleteLead', {
        triggerEl,
        initialFocus: '#v2DeleteLeadConfirmBtn'
      });
    }
  }

  async function confirmDeleteLead() {
    if (!state.deleteTargetId || state.isSubmitting) return;
    state.isSubmitting = true;
    const btn = document.getElementById('v2DeleteLeadConfirmBtn');
    const targetId = state.deleteTargetId;

    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        const res = await window.CWP_ADMIN_V2.api.request('deleteLead', {
          leadId: targetId,
          reason: 'Dismissed by admin'
        });
        if (res && res.error) {
          throw new Error(res.error);
        }
        showToast('Lead removed from pipeline.', 'success');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalDeleteLead');
        }
        if (state.selectedLeadId === targetId) {
          closeDetailPanel();
        }
        state.deleteTargetId = null;
        await loadData({ forceRefresh: true, silent: true });
      }, 'Deleting...');
    } catch (err) {
      showToast(err && err.message ? err.message : 'Failed to delete lead.', 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // -------------------------------------------------------------------------
  // EVENT WIRING
  // -------------------------------------------------------------------------
  function handleActionTrigger(action, leadId, triggerEl) {
    if (action === 'edit') openLeadFormModal(leadId, triggerEl);
    else if (action === 'note') openLeadNoteModal(leadId, triggerEl);
    else if (action === 'convert') openConvertLeadModal(leadId, triggerEl);
    else if (action === 'delete') openDeleteLeadModal(leadId, triggerEl);
    else if (action === 'mark-lost') handleStageChange(leadId, 'lost');
  }

  function resetAllFilters() {
    state.kpiFilter = null;
    state.searchQuery = '';
    state.filters.stage = 'all';
    state.filters.service = 'all';
    state.pagination.currentPage = 1;

    const searchInput = document.getElementById('v2LeadsSearchInput');
    const searchClear = document.getElementById('v2LeadsSearchClear');
    const stageSel = document.getElementById('v2LeadsFilterStage');
    const svcSel = document.getElementById('v2LeadsFilterService');
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.classList.remove('is-visible');
    if (stageSel) stageSel.value = 'all';
    if (svcSel) svcSel.value = 'all';

    updateBadgesAndKpis();
    applyFiltersAndRender();
  }

  function bindHeaderAndToolbarEvents() {
    const addBtn = document.getElementById('v2BtnAddLead');
    if (addBtn) addBtn.addEventListener('click', () => openLeadFormModal(null, addBtn));

    const refreshBtn = document.getElementById('v2LeadsBtnRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadData({ forceRefresh: true }));

    document.querySelectorAll('#v2LeadsKpiStrip .cwp-v2-ld-kpi-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.getAttribute('data-kpi');
        if (key === 'all') {
          state.kpiFilter = null;
        } else {
          state.kpiFilter = state.kpiFilter === key ? null : key;
        }
        const stageSel = document.getElementById('v2LeadsFilterStage');
        if (stageSel) stageSel.value = state.kpiFilter || 'all';
        state.filters.stage = state.kpiFilter || 'all';
        state.pagination.currentPage = 1;
        updateBadgesAndKpis();
        applyFiltersAndRender();
      });
    });

    const searchInput = document.getElementById('v2LeadsSearchInput');
    const searchClear = document.getElementById('v2LeadsSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        if (searchClear) searchClear.classList.toggle('is-visible', Boolean(val));
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          state.pagination.currentPage = 1;
          applyFiltersAndRender();
        }, 200);
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchClear.classList.remove('is-visible');
        state.searchQuery = '';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const stageSel = document.getElementById('v2LeadsFilterStage');
    if (stageSel) {
      stageSel.addEventListener('change', () => {
        state.filters.stage = stageSel.value;
        state.kpiFilter = stageSel.value === 'all' ? null : stageSel.value;
        state.pagination.currentPage = 1;
        updateBadgesAndKpis();
        applyFiltersAndRender();
      });
    }

    const svcSel = document.getElementById('v2LeadsFilterService');
    if (svcSel) {
      svcSel.addEventListener('change', () => {
        state.filters.service = svcSel.value;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const resetBtn = document.getElementById('v2LeadsResetFilters');
    if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);
  }

  function bindTableEvents() {
    const table = document.getElementById('v2LeadsTable');
    if (table) {
      table.addEventListener('click', (e) => {
        const th = e.target.closest('th.is-sortable');
        if (th) {
          const col = th.getAttribute('data-sort-col');
          if (state.sort.column === col) {
            state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            state.sort.column = col;
            state.sort.direction = col === 'createdAt' ? 'desc' : 'asc';
          }
          applyFiltersAndRender();
          return;
        }

        const overflowBtn = e.target.closest('[data-overflow-trigger]');
        if (overflowBtn) {
          e.stopPropagation();
          openOverflowMenu(overflowBtn.getAttribute('data-overflow-trigger'), overflowBtn);
          return;
        }

        const noteCell = e.target.closest('[data-note-open]');
        if (noteCell) {
          e.stopPropagation();
          openLeadNotesDetail(noteCell.getAttribute('data-note-open'));
          return;
        }

        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          e.stopPropagation();
          closeOverflowMenu();
          handleActionTrigger(actionBtn.getAttribute('data-action'), actionBtn.getAttribute('data-id'), actionBtn);
          return;
        }

        if (e.target.closest('[data-no-row-select]') || e.target.closest('a, select, button')) {
          return;
        }

        const tr = e.target.closest('tr[data-lead-id]');
        if (tr) {
          closeOverflowMenu();
          selectLead(tr.getAttribute('data-lead-id'));
        }
      });

      table.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-stage-select]');
        if (sel) {
          handleStageChange(sel.getAttribute('data-stage-select'), sel.value, sel);
        }
      });

      table.addEventListener('keydown', (e) => {
        const noteCell = e.target.closest('[data-note-open]');
        if (noteCell && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          openLeadNotesDetail(noteCell.getAttribute('data-note-open'));
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          const tr = e.target.closest('tr[data-lead-id]');
          if (tr && e.target === tr) {
            e.preventDefault();
            selectLead(tr.getAttribute('data-lead-id'));
          }
        }
      });
    }

    const overflowMenu = document.getElementById('v2LeadsOverflowMenu');
    if (overflowMenu) {
      overflowMenu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-overflow-action]');
        if (item) {
          const action = item.getAttribute('data-overflow-action');
          const id = item.getAttribute('data-id');
          const trigger = state.overflowTriggerEl;
          closeOverflowMenu();
          handleActionTrigger(action, id, trigger);
          return;
        }
        if (e.target.closest('a')) {
          closeOverflowMenu();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (!state.overflowLeadId) return;
      if (e.target.closest('#v2LeadsOverflowMenu') || e.target.closest('[data-overflow-trigger]')) return;
      closeOverflowMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.overflowLeadId) {
        const trigger = state.overflowTriggerEl;
        closeOverflowMenu();
        if (trigger && typeof trigger.focus === 'function') trigger.focus();
      }
    });

    const tableWrap = document.querySelector('#v2View_leads .cwp-v2-ld-table-wrap');
    if (tableWrap) {
      tableWrap.addEventListener('scroll', () => {
        if (state.overflowLeadId) closeOverflowMenu();
      }, { passive: true });
    }

    const pageSizeSel = document.getElementById('v2LeadsPageSize');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', () => {
        state.pagination.pageSize = parseInt(pageSizeSel.value, 10) || 25;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const prevBtn = document.getElementById('v2LeadsPagePrev');
    const nextBtn = document.getElementById('v2LeadsPageNext');
    const numsEl = document.getElementById('v2LeadsPageNumbers');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.pagination.currentPage > 1) {
          state.pagination.currentPage -= 1;
          applyFiltersAndRender();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(state.pagination.totalRecords / state.pagination.pageSize));
        if (state.pagination.currentPage < totalPages) {
          state.pagination.currentPage += 1;
          applyFiltersAndRender();
        }
      });
    }
    if (numsEl) {
      numsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (!btn) return;
        state.pagination.currentPage = parseInt(btn.getAttribute('data-page'), 10) || 1;
        applyFiltersAndRender();
      });
    }
  }

  function bindModalEvents() {
    const leadForm = document.getElementById('v2LeadForm');
    if (leadForm) leadForm.addEventListener('submit', handleLeadFormSubmit);

    const gpsBtn = document.getElementById('v2LeadDetectGpsBtn');
    if (gpsBtn) gpsBtn.addEventListener('click', detectGpsLocation);

    document.querySelectorAll('[data-lead-quick-note]').forEach(chip => {
      chip.addEventListener('click', () => {
        const targetId = chip.getAttribute('data-target') || 'v2LeadNotesInput';
        const input = document.getElementById(targetId);
        if (!input) return;
        const txt = chip.getAttribute('data-lead-quick-note');
        const cur = input.value.trim();
        input.value = cur ? `${cur}\n${txt}` : txt;
      });
    });

    const convertForm = document.getElementById('v2ConvertLeadForm');
    if (convertForm) convertForm.addEventListener('submit', handleConvertLeadSubmit);

    const convertSvc = document.getElementById('v2ConvertServiceInput');
    if (convertSvc) {
      convertSvc.addEventListener('change', () => updateConvertCategoryFields(convertSvc.value));
    }

    const noteForm = document.getElementById('v2LeadNoteForm');
    if (noteForm) noteForm.addEventListener('submit', handleLeadNoteSubmit);

    const delBtn = document.getElementById('v2DeleteLeadConfirmBtn');
    if (delBtn) delBtn.addEventListener('click', confirmDeleteLead);
  }

  window.CWP_ADMIN_V2.leads = {
    init,
    loadData,
    openLeadFormModal,
    openConvertLeadModal,
    openLeadNoteModal,
    closeDetailPanel
  };
})(window);
