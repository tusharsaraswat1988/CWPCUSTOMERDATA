/**
 * =========================================================================
 * CWP ADMIN V2 — DAILY CLEANING STATUS OPERATIONS CONTROL CENTER
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.cleanReports.
 * English-only UI, Material Symbols only, Asia/Kolkata timezone handling,
 * zero fabricated metrics, single scroll container, preserved backend actions.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const IST_TZ = 'Asia/Kolkata';

  const NON_COMPLETED_STATUSES = new Set([
    'car_not_present',
    'customer_absent',
    'vehicle_not_available',
    'skipped',
    'unable_to_complete'
  ]);

  const STATUS_META = {
    completed: { label: 'Completed', pillClass: 'is-completed', icon: 'check_circle' },
    pending: { label: 'Pending', pillClass: 'is-pending', icon: 'schedule' },
    car_not_present: { label: 'Car Not Present', pillClass: 'is-warning', icon: 'event_busy' },
    customer_absent: { label: 'Customer Absent', pillClass: 'is-warning', icon: 'person_off' },
    vehicle_not_available: { label: 'Vehicle Not Avail', pillClass: 'is-warning', icon: 'no_crash' },
    skipped: { label: 'Skipped', pillClass: 'is-pending', icon: 'skip_next' },
    unable_to_complete: { label: 'Unable to Complete', pillClass: 'is-danger', icon: 'cancel' }
  };

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

  function shiftIsoDate(isoDate, deltaDays) {
    const parts = String(isoDate || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return getTodayIst();
    const utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2]) + (deltaDays * 86400000);
    return new Date(utcMs).toISOString().slice(0, 10);
  }

  function formatIstDisplayDate(isoDate) {
    const parts = String(isoDate || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return isoDate || '—';
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 6, 30, 0));
    return d.toLocaleDateString('en-IN', {
      timeZone: IST_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatIstTime(isoTimestamp) {
    if (!isoTimestamp) return '—';
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', {
      timeZone: IST_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatIstDateTime(isoTimestamp) {
    if (!isoTimestamp) return '—';
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      timeZone: IST_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const state = {
    initialized: false,
    isActiveTab: false,
    isLoading: false,
    hasLoadedOnce: false,
    lastError: null,
    selectedDate: getTodayIst(),
    rawRecords: [],
    rawPending: [],
    allRows: [],
    filteredRows: [],
    summary: null,
    staffMatrix: [],
    staffRosterOpen: false,
    kpiFilter: 'all', // 'all' | 'completed' | 'pending' | 'exceptions'
    searchQuery: '',
    statusFilter: 'all',
    staffFilter: 'all',
    areaFilter: 'all',
    exceptionFilter: 'all',
    sortKey: 'time',
    sortDir: 'desc',
    page: 1,
    pageSize: 25,
    selectedRowId: null,
    editingRowId: null,
    deletingRowId: null
  };

  let searchDebounceTimer = null;
  let activeLoadSeq = 0;

  function esc(val) {
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

  function normalizeRow(raw, isPending) {
    const isCnp = !isPending && (raw.car_not_present === true || raw.tag === 'car_not_present' || raw.status === 'car_not_present');
    let normStatus = 'pending';
    if (!isPending) {
      if (isCnp) normStatus = 'car_not_present';
      else if (raw.status && STATUS_META[raw.status]) normStatus = raw.status;
      else normStatus = 'completed';
    }

    const photoUrl = !isPending && raw.photo_url ? String(raw.photo_url).trim() : '';
    const hasPhoto = Boolean(photoUrl);
    const staffId = raw.staff_id || '';
    const staffCode = raw.staff_code || '';
    const staffName = raw.staff_name || (staffCode ? staffCode : 'Unassigned');
    const isUnassigned = !staffId && !staffCode;
    const regNo = raw.registration_no ? String(raw.registration_no).trim() : '';
    const areaText = (raw.address_text || raw.parking_details || '').trim();

    const exceptionReasons = [];
    if (NON_COMPLETED_STATUSES.has(normStatus)) {
      exceptionReasons.push(STATUS_META[normStatus].label);
    }
    if (normStatus === 'completed' && !hasPhoto) {
      exceptionReasons.push('Missing Photo Proof');
    }
    if (isUnassigned) {
      exceptionReasons.push('Unassigned Staff');
    }
    if (!regNo) {
      exceptionReasons.push('Missing Vehicle Reg');
    }

    return {
      id: String(raw.id || `${raw.subscription_id || ''}_${raw.vehicle_id || ''}_${normStatus}`),
      recordType: isPending ? 'pending' : 'logged',
      isPending: Boolean(isPending),
      serviceDate: raw.service_date || state.selectedDate,
      status: normStatus,
      customerId: raw.customer_id || '',
      customerCode: raw.customer_code || '',
      customerName: raw.customer_name || 'Customer',
      customerPhone: raw.customer_phone || '',
      customerAltPhone: raw.customer_alt_phone || '',
      vehicleId: raw.vehicle_id || '',
      registrationNo: regNo,
      brandOrModel: raw.brand_or_model || raw.car_make || '',
      carColor: raw.car_color || '',
      packageName: raw.package_name || '',
      staffId,
      staffCode,
      staffName,
      staffPhone: raw.staff_phone || '',
      isUnassigned,
      areaText,
      parkingDetails: raw.parking_details || '',
      googleMapsUrl: raw.google_maps_url || '',
      sequenceOrder: raw.sequence_order || null,
      completedAt: raw.completed_at_device || null,
      syncedAt: raw.synced_at_server || null,
      cleaningDurationMinutes: raw.cleaningDurationMinutes ?? null,
      transitDurationMinutes: raw.transitDurationMinutes ?? null,
      photoUrl,
      hasPhoto,
      notes: raw.notes || '',
      adminNotes: raw.admin_notes || '',
      adminUpdatedAt: raw.admin_updated_at || null,
      adminUpdatedBy: raw.admin_updated_by || null,
      source: raw.source || '',
      isException: exceptionReasons.length > 0,
      exceptionReasons,
      raw
    };
  }

  function buildCombinedDataset(res) {
    const loggedRaw = Array.isArray(res && res.records) ? res.records : [];
    const pendingRaw = Array.isArray(res && res.pendingRecords) ? res.pendingRecords : [];

    const seenKeys = new Set();
    const rows = [];

    loggedRaw.forEach(r => {
      const row = normalizeRow(r, false);
      const dedupKey = `logged:${row.id}`;
      if (!seenKeys.has(dedupKey)) {
        seenKeys.add(dedupKey);
        rows.push(row);
      }
    });

    pendingRaw.forEach(r => {
      const row = normalizeRow(r, true);
      const dedupKey = `pending:${row.id}`;
      if (!seenKeys.has(dedupKey)) {
        seenKeys.add(dedupKey);
        rows.push(row);
      }
    });

    state.rawRecords = loggedRaw;
    state.rawPending = pendingRaw;
    state.allRows = rows;
    state.summary = (res && res.summary) || {};
    state.staffMatrix = computeStaffMatrix(rows, state.summary.staffMatrix);
  }

  function computeStaffMatrix(rows, serverMatrix) {
    const map = new Map();

    if (Array.isArray(serverMatrix) && serverMatrix.length > 0) {
      serverMatrix.forEach(s => {
        const key = String(s.staffId || s.staffCode || s.staffName || '');
        if (!key) return;
        const totalAssigned = Number(s.totalAssigned || 0);
        const cleanedCount = Number(s.cleanedCount || 0);
        if (totalAssigned === 0 && cleanedCount === 0) return;
        map.set(key, {
          key,
          staffId: s.staffId || '',
          staffCode: s.staffCode || '',
          staffName: s.staffName || s.staffCode || 'Staff',
          completedCount: 0,
          nonCompletedCount: 0,
          pendingCount: 0,
          exceptionCount: 0,
          totalScheduled: 0,
          lastPunchTime: s.lastPunchTime || null
        });
      });
    }

    rows.forEach(r => {
      if (r.isUnassigned) return;
      const key = String(r.staffId || r.staffCode || r.staffName || '');
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          key,
          staffId: r.staffId,
          staffCode: r.staffCode,
          staffName: r.staffName,
          completedCount: 0,
          nonCompletedCount: 0,
          pendingCount: 0,
          exceptionCount: 0,
          totalScheduled: 0,
          lastPunchTime: null
        });
      }
      const entry = map.get(key);
      entry.totalScheduled += 1;
      if (r.status === 'completed') entry.completedCount += 1;
      else if (r.status === 'pending') entry.pendingCount += 1;
      else entry.nonCompletedCount += 1;
      if (r.isException) entry.exceptionCount += 1;
      if (r.completedAt && (!entry.lastPunchTime || new Date(r.completedAt) > new Date(entry.lastPunchTime))) {
        entry.lastPunchTime = r.completedAt;
      }
    });

    return Array.from(map.values())
      .filter(s => s.totalScheduled > 0)
      .sort((a, b) => (b.completedCount - a.completedCount) || a.staffName.localeCompare(b.staffName));
  }

  function applyFiltersAndSort() {
    const q = state.searchQuery.trim().toLowerCase();
    const st = state.statusFilter;
    const stf = state.staffFilter;
    const area = state.areaFilter;
    const exc = state.exceptionFilter;

    let list = state.allRows.filter(r => {
      if (st !== 'all' && r.status !== st) return false;
      if (stf !== 'all') {
        const matchStaff = (r.staffId && r.staffId === stf) || (r.staffCode && r.staffCode === stf);
        if (!matchStaff) return false;
      }
      if (area !== 'all' && r.areaText !== area) return false;

      if (exc === 'all_exceptions' && !r.isException) return false;
      if (exc === 'no_photo' && !(r.status === 'completed' && !r.hasPhoto)) return false;
      if (exc === 'non_completed' && !NON_COMPLETED_STATUSES.has(r.status)) return false;
      if (exc === 'unassigned' && !r.isUnassigned) return false;

      if (q) {
        const haystack = [
          r.customerName,
          r.customerPhone,
          r.registrationNo,
          r.brandOrModel,
          r.staffName,
          r.staffCode,
          r.areaText,
          r.parkingDetails
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const dir = state.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let va = '';
      let vb = '';
      if (state.sortKey === 'customer') {
        va = a.customerName.toLowerCase();
        vb = b.customerName.toLowerCase();
      } else if (state.sortKey === 'vehicle') {
        va = (a.registrationNo || a.brandOrModel).toLowerCase();
        vb = (b.registrationNo || b.brandOrModel).toLowerCase();
      } else if (state.sortKey === 'status') {
        va = a.status;
        vb = b.status;
      } else if (state.sortKey === 'staff') {
        va = a.staffName.toLowerCase();
        vb = b.staffName.toLowerCase();
      } else if (state.sortKey === 'area') {
        va = a.areaText.toLowerCase();
        vb = b.areaText.toLowerCase();
      } else {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        if (ta !== tb) return (ta - tb) * dir;
        return ((a.sequenceOrder || 9999) - (b.sequenceOrder || 9999)) * dir;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.filteredRows = list;
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
  }

  function populateFilterDropdowns() {
    const staffSel = document.getElementById('v2CrStaffFilter');
    if (staffSel) {
      const prev = state.staffFilter;
      const seen = new Map();
      state.allRows.forEach(r => {
        if (!r.isUnassigned) {
          const val = r.staffId || r.staffCode;
          if (val && !seen.has(val)) seen.set(val, r.staffName);
        }
      });
      const sorted = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
      staffSel.innerHTML = '<option value="all">All Staff</option>' +
        sorted.map(([val, name]) => `<option value="${esc(val)}">${esc(name)}</option>`).join('');
      staffSel.value = seen.has(prev) ? prev : 'all';
      if (staffSel.value !== prev) state.staffFilter = 'all';
    }

    const areaSel = document.getElementById('v2CrAreaFilter');
    if (areaSel) {
      const prev = state.areaFilter;
      const areas = Array.from(new Set(state.allRows.map(r => r.areaText).filter(Boolean))).sort();
      areaSel.innerHTML = '<option value="all">All Areas</option>' +
        areas.map(a => `<option value="${esc(a)}">${esc(a.length > 36 ? a.slice(0, 35) + '…' : a)}</option>`).join('');
      areaSel.value = areas.includes(prev) ? prev : 'all';
      if (areaSel.value !== prev) state.areaFilter = 'all';
    }
  }

  function renderDateControls() {
    const todayIst = getTodayIst();
    const dateInput = document.getElementById('v2CrDateInput');
    const nextBtn = document.getElementById('v2CrNextDayBtn');
    const todayBtn = document.getElementById('v2CrTodayBtn');
    const dateBadge = document.getElementById('v2CrDateBadge');

    if (dateInput) {
      dateInput.max = todayIst;
      dateInput.value = state.selectedDate;
    }
    const isToday = state.selectedDate >= todayIst;
    if (nextBtn) nextBtn.disabled = isToday;
    if (todayBtn) todayBtn.disabled = isToday;
    if (dateBadge) {
      dateBadge.textContent = isToday
        ? `Today • ${formatIstDisplayDate(state.selectedDate)} (IST)`
        : `${formatIstDisplayDate(state.selectedDate)} (IST)`;
    }
  }

  function renderKpis() {
    const rows = state.allRows;
    const totalScheduled = rows.length;
    const completedRows = rows.filter(r => r.status === 'completed');
    const pendingRows = rows.filter(r => r.status === 'pending');
    const exceptionRows = rows.filter(r => r.isException);
    const withPhotoCount = completedRows.filter(r => r.hasPhoto).length;
    const rate = totalScheduled > 0 ? Math.round((completedRows.length / totalScheduled) * 100) : null;
    const activeStaffCount = state.staffMatrix.length;

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setEl('v2CrKpiScheduled', state.hasLoadedOnce ? String(totalScheduled) : '—');
    setEl('v2CrKpiScheduledSub', state.hasLoadedOnce ? `${state.rawRecords.length} logged, ${pendingRows.length} pending` : 'All vehicles');
    setEl('v2CrKpiCompleted', state.hasLoadedOnce ? String(completedRows.length) : '—');
    setEl('v2CrKpiCompletedSub', state.hasLoadedOnce ? `${withPhotoCount} with photo proof` : 'Photo proof: —');
    setEl('v2CrKpiPending', state.hasLoadedOnce ? String(pendingRows.length) : '—');
    setEl('v2CrKpiPendingSub', state.selectedDate < getTodayIst() ? 'Unpunched on date' : 'Awaiting punch');
    setEl('v2CrKpiExceptions', state.hasLoadedOnce ? String(exceptionRows.length) : '—');
    setEl('v2CrKpiRate', rate !== null ? `${rate}%` : '—');
    setEl('v2CrKpiStaff', state.hasLoadedOnce ? String(activeStaffCount) : '—');

    const navBadge = document.getElementById('v2BadgeCleanReports');
    if (navBadge && state.selectedDate === getTodayIst()) {
      navBadge.textContent = String(completedRows.length);
    }

    document.querySelectorAll('#v2CrKpiStrip .cwp-v2-cr-kpi-card').forEach(btn => {
      const key = btn.getAttribute('data-kpi-filter');
      let active = false;
      if (key === 'staff_toggle') active = state.staffRosterOpen;
      else active = state.kpiFilter === key;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function renderStaffPanel() {
    const panel = document.getElementById('v2CrStaffPanel');
    const chipsEl = document.getElementById('v2CrStaffChips');
    const metaEl = document.getElementById('v2CrStaffSummaryMeta');
    const clearBtn = document.getElementById('v2CrStaffClearBtn');
    if (!panel || !chipsEl) return;

    panel.hidden = !state.staffRosterOpen;
    if (!state.staffRosterOpen) return;

    if (clearBtn) clearBtn.hidden = state.staffFilter === 'all';
    if (metaEl) metaEl.textContent = `${state.staffMatrix.length} active crew with scheduled vehicles`;

    if (state.staffMatrix.length === 0) {
      chipsEl.innerHTML = '<div class="cwp-v2-cr-staff-empty">No staff activity or assignments recorded for this date.</div>';
      return;
    }

    chipsEl.innerHTML = state.staffMatrix.map(s => {
      const pct = s.totalScheduled > 0 ? Math.round((s.completedCount / s.totalScheduled) * 100) : 0;
      const filterVal = s.staffId || s.staffCode;
      const isSelected = state.staffFilter !== 'all' && (state.staffFilter === s.staffId || state.staffFilter === s.staffCode);
      return `
        <button type="button" class="cwp-v2-cr-staff-chip ${isSelected ? 'is-active' : ''}" data-staff-filter="${esc(filterVal)}">
          <div class="cwp-v2-cr-staff-chip-top">
            <span class="cwp-v2-cr-staff-chip-name" title="${esc(s.staffName)}">${esc(s.staffName)}</span>
            <span class="cwp-v2-cr-staff-chip-pct">${pct}%</span>
          </div>
          <div class="cwp-v2-cr-staff-progress-track">
            <div class="cwp-v2-cr-staff-progress-fill" style="width:${pct}%;"></div>
          </div>
          <div class="cwp-v2-cr-staff-chip-meta">
            <span>${s.completedCount}/${s.totalScheduled} done</span>
            <span>${s.pendingCount} pend${s.exceptionCount > 0 ? ` • ${s.exceptionCount} exc` : ''}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderTable() {
    const tbody = document.getElementById('v2CrTableBody');
    const countEl = document.getElementById('v2CrResultCount');
    const pageInfoEl = document.getElementById('v2CrPageInfo');
    const pageNumEl = document.getElementById('v2CrPageNumLabel');
    const prevBtn = document.getElementById('v2CrPrevPageBtn');
    const nextBtn = document.getElementById('v2CrNextPageBtn');
    if (!tbody) return;

    const total = state.filteredRows.length;
    if (countEl) countEl.textContent = `${total} record${total === 1 ? '' : 's'}`;

    if (state.isLoading && !state.hasLoadedOnce) {
      if (window.CWP_ADMIN_V2.ui) {
        window.CWP_ADMIN_V2.ui.renderSkeletonRows(tbody, 6, 8);
      }
      return;
    }

    if (state.lastError) {
      tbody.innerHTML = `<tr><td colspan="8" class="cwp-v2-cr-table-state-cell">
        <div class="cwp-v2-cr-state-title is-error">Unable to load daily cleaning records</div>
        <div class="cwp-v2-cr-state-sub">${esc(state.lastError)}</div>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-cr-retry>Retry</button>
      </td></tr>`;
      if (pageInfoEl) pageInfoEl.textContent = 'Error loading data';
      return;
    }

    if (total === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="cwp-v2-cr-table-state-cell">
        <div class="cwp-v2-cr-state-title">No cleaning records match the current filters</div>
        <div class="cwp-v2-cr-state-sub">Try clearing filters or selecting another date.</div>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-cr-empty-reset>Reset Filters</button>
      </td></tr>`;
      if (pageInfoEl) pageInfoEl.textContent = 'Showing 0 of 0';
      if (pageNumEl) pageNumEl.textContent = '1 / 1';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const startIdx = (state.page - 1) * state.pageSize;
    const endIdx = Math.min(total, startIdx + state.pageSize);
    const slice = state.filteredRows.slice(startIdx, endIdx);

    tbody.innerHTML = slice.map(r => {
      const stMeta = STATUS_META[r.status] || STATUS_META.pending;
      const isSelected = state.selectedRowId === r.id;
      const timeMain = r.isPending
        ? (r.sequenceOrder ? `Seq #${r.sequenceOrder}` : 'Scheduled')
        : formatIstTime(r.completedAt);
      const timeSub = r.isPending
        ? 'Pending'
        : (r.cleaningDurationMinutes ? `${r.cleaningDurationMinutes}m clean` : 'IST');

      const proofHtml = r.hasPhoto
        ? `<button type="button" class="cwp-v2-cr-photo-btn" data-cr-photo="${esc(r.id)}" title="View proof photo">
             <span class="material-symbols-outlined cwp-v2-cr-icon-14" aria-hidden="true">photo_camera</span>
             <span>Photo</span>
           </button>`
        : (r.isPending
            ? '<span class="cwp-v2-cr-proof-pending">—</span>'
            : '<span class="cwp-v2-cr-proof-missing">No Photo</span>');

      const actionsHtml = r.isPending
        ? `<button type="button" class="cwp-v2-cr-icon-action" data-cr-view="${esc(r.id)}" title="View record details" aria-label="View record details">
             <span class="material-symbols-outlined cwp-v2-cr-icon-17" aria-hidden="true">visibility</span>
           </button>`
        : `<button type="button" class="cwp-v2-cr-icon-action" data-cr-view="${esc(r.id)}" title="View details" aria-label="View details">
             <span class="material-symbols-outlined cwp-v2-cr-icon-17" aria-hidden="true">visibility</span>
           </button>
           <button type="button" class="cwp-v2-cr-icon-action" data-cr-edit="${esc(r.id)}" title="Update cleaning status" aria-label="Update cleaning status">
             <span class="material-symbols-outlined cwp-v2-cr-icon-17" aria-hidden="true">edit</span>
           </button>
           <button type="button" class="cwp-v2-cr-icon-action is-danger" data-cr-delete="${esc(r.id)}" title="Delete cleaning record" aria-label="Delete cleaning record">
             <span class="material-symbols-outlined cwp-v2-cr-icon-17" aria-hidden="true">delete</span>
           </button>`;

      return `
        <tr data-cr-row="${esc(r.id)}" class="${isSelected ? 'is-selected-row' : ''}">
          <td>
            <div class="cwp-v2-cr-cell-primary" title="${esc(r.customerName)}">${esc(r.customerName)}</div>
            <div class="cwp-v2-cr-cell-sub">${esc(r.customerPhone || '—')}</div>
          </td>
          <td>
            <div><span class="cwp-v2-cr-plate-badge">${esc(r.registrationNo || 'Unregistered')}</span></div>
            ${r.brandOrModel ? `<div class="cwp-v2-cr-cell-sub" title="${esc(r.brandOrModel)}">${esc(r.brandOrModel)}</div>` : ''}
          </td>
          <td>
            <span class="cwp-v2-cr-status-pill ${stMeta.pillClass}">
              <span class="material-symbols-outlined cwp-v2-cr-icon-13" aria-hidden="true">${stMeta.icon}</span>
              <span>${esc(stMeta.label)}</span>
            </span>
            ${r.isException && r.status === 'completed' ? '<div class="cwp-v2-cr-exc-tag"><span class="material-symbols-outlined cwp-v2-cr-icon-12" aria-hidden="true">priority_high</span><span>No Photo</span></div>' : ''}
            ${r.isUnassigned ? '<div class="cwp-v2-cr-exc-tag"><span class="material-symbols-outlined cwp-v2-cr-icon-12" aria-hidden="true">person_off</span><span>Unassigned</span></div>' : ''}
          </td>
          <td>
            <div class="cwp-v2-cr-time-main">${esc(timeMain)}</div>
            <div class="cwp-v2-cr-cell-sub">${esc(timeSub)}</div>
          </td>
          <td>
            <div class="cwp-v2-cr-cell-primary" title="${esc(r.staffName)}">${esc(r.staffName)}</div>
            ${r.staffCode ? `<div class="cwp-v2-cr-cell-sub">${esc(r.staffCode)}</div>` : ''}
          </td>
          <td>
            <div class="cwp-v2-cr-cell-primary" title="${esc(r.areaText)}">${esc(r.areaText || '—')}</div>
            ${r.parkingDetails && r.parkingDetails !== r.areaText ? `<div class="cwp-v2-cr-cell-sub" title="${esc(r.parkingDetails)}">${esc(r.parkingDetails)}</div>` : ''}
          </td>
          <td>${proofHtml}</td>
          <td class="cwp-v2-cr-cell-right">
            <div class="cwp-v2-cr-row-actions">${actionsHtml}</div>
          </td>
        </tr>
      `;
    }).join('');

    if (pageInfoEl) pageInfoEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${total}`;
    if (pageNumEl) pageNumEl.textContent = `${state.page} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;

    document.querySelectorAll('#v2View_cleanReports th.is-sortable').forEach(th => {
      const key = th.getAttribute('data-sort');
      const isSorted = key === state.sortKey;
      th.classList.toggle('is-sorted', isSorted);
      const icon = th.querySelector('.cwp-v2-cr-sort-icon');
      if (icon) {
        icon.textContent = isSorted ? (state.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
      }
    });
  }

  function renderDetailPanel() {
    const splitEl = document.getElementById('v2CrSplitView');
    const titleEl = document.getElementById('v2CrDetailTitle');
    const subEl = document.getElementById('v2CrDetailSub');
    const bodyEl = document.getElementById('v2CrDetailBody');
    const actionsEl = document.getElementById('v2CrDetailActions');
    if (!splitEl || !bodyEl || !actionsEl) return;

    const row = state.selectedRowId ? state.allRows.find(r => r.id === state.selectedRowId) : null;
    if (!row) {
      splitEl.classList.add('is-detail-closed');
      return;
    }

    splitEl.classList.remove('is-detail-closed');
    const stMeta = STATUS_META[row.status] || STATUS_META.pending;

    if (titleEl) titleEl.textContent = `${row.registrationNo || 'Vehicle'} — ${row.customerName}`;
    if (subEl) subEl.textContent = `${formatIstDisplayDate(row.serviceDate)} • ${stMeta.label}`;

    bodyEl.innerHTML = `
      <div class="cwp-v2-cr-detail-section">
        <div class="cwp-v2-cr-detail-sec-title">Cleaning Status</div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Status</span><span class="cwp-v2-cr-detail-v">${esc(stMeta.label)}</span></div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Service Date</span><span class="cwp-v2-cr-detail-v">${esc(formatIstDisplayDate(row.serviceDate))}</span></div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Completed At (IST)</span><span class="cwp-v2-cr-detail-v">${esc(formatIstDateTime(row.completedAt))}</span></div>
        ${row.cleaningDurationMinutes !== null ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Cleaning Duration</span><span class="cwp-v2-cr-detail-v">${esc(row.cleaningDurationMinutes)} min</span></div>` : ''}
        ${row.transitDurationMinutes !== null ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Transit Time</span><span class="cwp-v2-cr-detail-v">${esc(row.transitDurationMinutes)} min</span></div>` : ''}
        ${row.exceptionReasons.length > 0 ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Attention</span><span class="cwp-v2-cr-detail-v is-warn">${esc(row.exceptionReasons.join(', '))}</span></div>` : ''}
      </div>

      <div class="cwp-v2-cr-detail-section">
        <div class="cwp-v2-cr-detail-sec-title">Customer &amp; Vehicle</div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Customer</span><span class="cwp-v2-cr-detail-v">${esc(row.customerName)}</span></div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Phone</span><span class="cwp-v2-cr-detail-v">${row.customerPhone ? `<a href="tel:${esc(row.customerPhone)}">${esc(row.customerPhone)}</a>` : '—'}</span></div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Registration</span><span class="cwp-v2-cr-detail-v">${esc(row.registrationNo || 'Unregistered')}</span></div>
        ${row.brandOrModel ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Make / Model</span><span class="cwp-v2-cr-detail-v">${esc(row.brandOrModel)}</span></div>` : ''}
        ${row.packageName ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Package</span><span class="cwp-v2-cr-detail-v">${esc(row.packageName)}</span></div>` : ''}
      </div>

      <div class="cwp-v2-cr-detail-section">
        <div class="cwp-v2-cr-detail-sec-title">Staff &amp; Location</div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Assigned Staff</span><span class="cwp-v2-cr-detail-v">${esc(row.staffName)}${row.staffCode ? ` (${esc(row.staffCode)})` : ''}</span></div>
        <div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Area / Address</span><span class="cwp-v2-cr-detail-v">${esc(row.areaText || '—')}</span></div>
        ${row.parkingDetails ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Parking</span><span class="cwp-v2-cr-detail-v">${esc(row.parkingDetails)}</span></div>` : ''}
        ${row.source ? `<div class="cwp-v2-cr-detail-kv"><span class="cwp-v2-cr-detail-k">Record Source</span><span class="cwp-v2-cr-detail-v">${esc(row.source)}</span></div>` : ''}
      </div>

      ${(row.notes || row.adminNotes) ? `
      <div class="cwp-v2-cr-detail-section">
        <div class="cwp-v2-cr-detail-sec-title">Notes</div>
        ${row.notes ? `<div class="cwp-v2-cr-detail-note">${esc(row.notes)}</div>` : ''}
        ${row.adminNotes ? `<div class="cwp-v2-cr-detail-note is-admin"><strong>Admin Note:</strong> ${esc(row.adminNotes)}</div>` : ''}
      </div>` : ''}

      ${row.hasPhoto ? `
      <div class="cwp-v2-cr-detail-section">
        <div class="cwp-v2-cr-detail-sec-title">Photo Proof</div>
        <img src="${esc(row.photoUrl)}" alt="Proof photo" class="cwp-v2-cr-detail-photo" data-cr-photo="${esc(row.id)}">
      </div>` : ''}
    `;

    if (row.isPending) {
      actionsEl.innerHTML = `
        <span class="cwp-v2-cr-detail-pending-hint">Pending vehicles are marked complete by field staff with photo proof.</span>
      `;
    } else {
      actionsEl.innerHTML = `
        <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" data-cr-edit="${esc(row.id)}">
          <span class="material-symbols-outlined cwp-v2-cr-icon-15" aria-hidden="true">edit</span>
          <span>Update Status</span>
        </button>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-danger-solid cwp-v2-btn-sm" data-cr-delete="${esc(row.id)}">
          <span class="material-symbols-outlined cwp-v2-cr-icon-15" aria-hidden="true">delete</span>
          <span>Delete</span>
        </button>
      `;
    }
  }

  function renderAll({ preserveScroll = true } = {}) {
    const wrap = document.getElementById('v2CrTableWrap');
    const prevTop = preserveScroll && wrap ? wrap.scrollTop : 0;

    renderDateControls();
    populateFilterDropdowns();
    applyFiltersAndSort();
    renderKpis();
    renderStaffPanel();
    renderTable();
    renderDetailPanel();

    if (preserveScroll && wrap) {
      wrap.scrollTop = prevTop;
    }
  }

  async function loadData({ silent = false } = {}) {
    if (!hasAuthToken()) return;

    const reqSeq = ++activeLoadSeq;
    const reqDate = state.selectedDate;
    state.isLoading = true;
    state.lastError = null;
    if (!silent && !state.hasLoadedOnce) {
      renderTable();
    }

    try {
      const res = await window.CWP_ADMIN_V2.api.request('getDailyCleanReports', {
        startDate: reqDate,
        endDate: reqDate,
        limit: 1000,
        offset: 0
      });
      if (reqSeq !== activeLoadSeq) return;
      state.hasLoadedOnce = true;
      buildCombinedDataset(res);
      renderAll({ preserveScroll: silent });
    } catch (err) {
      if (reqSeq !== activeLoadSeq) return;
      if (err && err.unauthorized) return;
      state.lastError = (err && err.message) ? err.message : 'Failed to load daily cleaning status';
      renderTable();
    } finally {
      if (reqSeq === activeLoadSeq) {
        state.isLoading = false;
      }
    }
  }

  function openPhotoModal(rowId) {
    const row = state.allRows.find(r => r.id === rowId);
    if (!row || !row.hasPhoto) return;
    const img = document.getElementById('v2CrPhotoImg');
    const meta = document.getElementById('v2CrPhotoMeta');
    const link = document.getElementById('v2CrPhotoOpenLink');
    if (img) img.src = row.photoUrl;
    if (link) link.href = row.photoUrl;
    if (meta) {
      meta.textContent = `${row.registrationNo || 'Vehicle'} • ${row.customerName} • Staff: ${row.staffName} • ${formatIstTime(row.completedAt)} IST`;
    }
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalCleanReportPhoto');
    }
  }

  function openEditModal(rowId) {
    const row = state.allRows.find(r => r.id === rowId);
    if (!row || row.isPending) return;
    state.editingRowId = rowId;
    const sumEl = document.getElementById('v2CrEditSummary');
    const selEl = document.getElementById('v2CrEditStatusSelect');
    const reasonEl = document.getElementById('v2CrEditReasonInput');
    if (sumEl) sumEl.textContent = `${row.registrationNo || 'Vehicle'} • ${row.customerName} (${row.staffName})`;
    if (selEl) selEl.value = row.status === 'completed' ? 'car_not_present' : 'completed';
    if (reasonEl) reasonEl.value = row.adminNotes || '';
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalCleanReportEdit', { initialFocus: '#v2CrEditReasonInput' });
    }
  }

  function openDeleteModal(rowId) {
    const row = state.allRows.find(r => r.id === rowId);
    if (!row || row.isPending) return;
    state.deletingRowId = rowId;
    const sumEl = document.getElementById('v2CrDeleteSummary');
    const reasonEl = document.getElementById('v2CrDeleteReasonInput');
    if (sumEl) sumEl.textContent = `Remove cleaning record for ${row.registrationNo || 'Vehicle'} (${row.customerName}) so staff can re-punch.`;
    if (reasonEl) reasonEl.value = '';
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalCleanReportDelete', { initialFocus: '#v2CrDeleteReasonInput' });
    }
  }

  async function submitEditForm(e) {
    e.preventDefault();
    if (!state.editingRowId) return;
    const status = (document.getElementById('v2CrEditStatusSelect') || {}).value;
    const reason = ((document.getElementById('v2CrEditReasonInput') || {}).value || '').trim();
    if (!reason) {
      showToast('Admin reason is required.', 'warning');
      return;
    }

    const btn = document.getElementById('v2CrEditSubmitBtn');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('updateDailyCleanReportStatus', {
          reportId: state.editingRowId,
          status,
          reason
        });
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalCleanReportEdit');
        showToast('Cleaning status updated.', 'success');
        await loadData({ silent: true });
      });
    } catch (err) {
      showToast((err && err.message) || 'Failed to update status', 'error');
    }
  }

  async function submitDeleteForm(e) {
    e.preventDefault();
    if (!state.deletingRowId) return;
    const reason = ((document.getElementById('v2CrDeleteReasonInput') || {}).value || '').trim();
    if (!reason) {
      showToast('Deletion reason is required.', 'warning');
      return;
    }

    const btn = document.getElementById('v2CrDeleteSubmitBtn');
    try {
      await window.CWP_ADMIN_V2.api.withLoadingButton(btn, async () => {
        await window.CWP_ADMIN_V2.api.request('deleteDailyCleanReport', {
          reportId: state.deletingRowId,
          reason
        });
        if (state.selectedRowId === state.deletingRowId) state.selectedRowId = null;
        if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2ModalCleanReportDelete');
        showToast('Cleaning record deleted.', 'success');
        await loadData({ silent: true });
      }, 'Deleting...');
    } catch (err) {
      showToast((err && err.message) || 'Failed to delete record', 'error');
    }
  }

  function exportCsv() {
    const rows = state.filteredRows;
    if (!rows || rows.length === 0) {
      showToast('No records available to export.', 'warning');
      return;
    }
    const headers = ['S.No', 'Date (IST)', 'Time (IST)', 'Status', 'Customer Name', 'Phone', 'Vehicle Reg', 'Make/Model', 'Staff', 'Area/Location', 'Photo URL', 'Notes'];
    const csvLines = [headers.join(',')];
    rows.forEach((r, idx) => {
      const stLabel = (STATUS_META[r.status] || STATUS_META.pending).label;
      csvLines.push([
        idx + 1,
        JSON.stringify(r.serviceDate || state.selectedDate),
        JSON.stringify(r.isPending ? 'Pending' : formatIstTime(r.completedAt)),
        JSON.stringify(stLabel),
        JSON.stringify(r.customerName),
        JSON.stringify(r.customerPhone),
        JSON.stringify(r.registrationNo),
        JSON.stringify(r.brandOrModel),
        JSON.stringify(r.staffName),
        JSON.stringify(r.areaText),
        JSON.stringify(r.photoUrl),
        JSON.stringify(r.adminNotes || r.notes)
      ].join(','));
    });

    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CWP_Daily_Cleaning_Status_${state.selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function resetAllFilters() {
    state.kpiFilter = 'all';
    state.searchQuery = '';
    state.statusFilter = 'all';
    state.staffFilter = 'all';
    state.areaFilter = 'all';
    state.exceptionFilter = 'all';
    state.page = 1;

    const searchIn = document.getElementById('v2CrSearchInput');
    if (searchIn) searchIn.value = '';
    const statusSel = document.getElementById('v2CrStatusFilter');
    if (statusSel) statusSel.value = 'all';
    const staffSel = document.getElementById('v2CrStaffFilter');
    if (staffSel) staffSel.value = 'all';
    const areaSel = document.getElementById('v2CrAreaFilter');
    if (areaSel) areaSel.value = 'all';
    const excSel = document.getElementById('v2CrExceptionFilter');
    if (excSel) excSel.value = 'all';

    renderAll({ preserveScroll: false });
  }

  function selectDate(newDate) {
    const todayIst = getTodayIst();
    if (!newDate) return;
    if (newDate > todayIst) {
      showToast('Future dates are not supported for daily cleaning logs.', 'warning');
      renderDateControls();
      return;
    }
    if (newDate === state.selectedDate) return;
    state.selectedDate = newDate;
    state.page = 1;
    state.selectedRowId = null;
    state.hasLoadedOnce = false;
    renderDateControls();
    loadData({ silent: false });
  }

  function bindEvents() {
    const viewEl = document.getElementById('v2View_cleanReports');
    if (!viewEl) return;

    document.getElementById('v2CrPrevDayBtn')?.addEventListener('click', () => selectDate(shiftIsoDate(state.selectedDate, -1)));
    document.getElementById('v2CrNextDayBtn')?.addEventListener('click', () => selectDate(shiftIsoDate(state.selectedDate, 1)));
    document.getElementById('v2CrTodayBtn')?.addEventListener('click', () => selectDate(getTodayIst()));
    document.getElementById('v2CrDateInput')?.addEventListener('change', (e) => selectDate(e.target.value));
    document.getElementById('v2CrRefreshBtn')?.addEventListener('click', () => loadData({ silent: false }));
    document.getElementById('v2CrExportBtn')?.addEventListener('click', exportCsv);
    document.getElementById('v2CrClearFiltersBtn')?.addEventListener('click', resetAllFilters);
    document.getElementById('v2CrStaffClearBtn')?.addEventListener('click', () => {
      state.staffFilter = 'all';
      state.page = 1;
      const sel = document.getElementById('v2CrStaffFilter');
      if (sel) sel.value = 'all';
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrSearchInput')?.addEventListener('input', (e) => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      const val = e.target.value;
      searchDebounceTimer = setTimeout(() => {
        state.searchQuery = val;
        state.page = 1;
        renderAll({ preserveScroll: false });
      }, 220);
    });

    document.getElementById('v2CrStatusFilter')?.addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      state.kpiFilter = (state.statusFilter === 'completed' || state.statusFilter === 'pending') ? state.statusFilter : 'all';
      state.page = 1;
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrStaffFilter')?.addEventListener('change', (e) => {
      state.staffFilter = e.target.value;
      state.page = 1;
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrAreaFilter')?.addEventListener('change', (e) => {
      state.areaFilter = e.target.value;
      state.page = 1;
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrExceptionFilter')?.addEventListener('change', (e) => {
      state.exceptionFilter = e.target.value;
      state.kpiFilter = state.exceptionFilter === 'all_exceptions' ? 'exceptions' : 'all';
      state.page = 1;
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrPageSizeSelect')?.addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10) || 25;
      state.page = 1;
      renderAll({ preserveScroll: false });
    });

    document.getElementById('v2CrPrevPageBtn')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        renderAll({ preserveScroll: false });
      }
    });

    document.getElementById('v2CrNextPageBtn')?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderAll({ preserveScroll: false });
      }
    });

    document.getElementById('v2CrDetailCloseBtn')?.addEventListener('click', () => {
      state.selectedRowId = null;
      renderAll({ preserveScroll: true });
    });

    // Event delegation within viewEl
    viewEl.addEventListener('click', (e) => {
      const kpiBtn = e.target.closest('.cwp-v2-cr-kpi-card');
      if (kpiBtn) {
        const key = kpiBtn.getAttribute('data-kpi-filter');
        if (key === 'staff_toggle') {
          state.staffRosterOpen = !state.staffRosterOpen;
          renderKpis();
          renderStaffPanel();
          return;
        }
        const nextKpi = (state.kpiFilter === key && key !== 'all') ? 'all' : key;
        state.kpiFilter = nextKpi;
        state.statusFilter = 'all';
        state.exceptionFilter = 'all';
        if (nextKpi === 'completed' || nextKpi === 'rate') {
          state.kpiFilter = 'completed';
          state.statusFilter = 'completed';
        } else if (nextKpi === 'pending') {
          state.statusFilter = 'pending';
        } else if (nextKpi === 'exceptions') {
          state.exceptionFilter = 'all_exceptions';
        }
        const stSel = document.getElementById('v2CrStatusFilter');
        if (stSel) stSel.value = state.statusFilter;
        const exSel = document.getElementById('v2CrExceptionFilter');
        if (exSel) exSel.value = state.exceptionFilter;
        state.page = 1;
        renderAll({ preserveScroll: false });
        return;
      }

      const staffChip = e.target.closest('[data-staff-filter]');
      if (staffChip) {
        const val = staffChip.getAttribute('data-staff-filter');
        state.staffFilter = state.staffFilter === val ? 'all' : val;
        const stfSel = document.getElementById('v2CrStaffFilter');
        if (stfSel) stfSel.value = state.staffFilter;
        state.page = 1;
        renderAll({ preserveScroll: false });
        return;
      }

      const thSort = e.target.closest('th.is-sortable');
      if (thSort) {
        const key = thSort.getAttribute('data-sort');
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = key === 'time' ? 'desc' : 'asc';
        }
        renderAll({ preserveScroll: false });
        return;
      }

      const photoBtn = e.target.closest('[data-cr-photo]');
      if (photoBtn) {
        e.stopPropagation();
        openPhotoModal(photoBtn.getAttribute('data-cr-photo'));
        return;
      }

      const editBtn = e.target.closest('[data-cr-edit]');
      if (editBtn) {
        e.stopPropagation();
        openEditModal(editBtn.getAttribute('data-cr-edit'));
        return;
      }

      const delBtn = e.target.closest('[data-cr-delete]');
      if (delBtn) {
        e.stopPropagation();
        openDeleteModal(delBtn.getAttribute('data-cr-delete'));
        return;
      }

      const viewBtn = e.target.closest('[data-cr-view]');
      if (viewBtn) {
        e.stopPropagation();
        state.selectedRowId = viewBtn.getAttribute('data-cr-view');
        renderAll({ preserveScroll: true });
        return;
      }

      if (e.target.closest('[data-cr-retry]')) {
        loadData({ silent: false });
        return;
      }

      if (e.target.closest('[data-cr-empty-reset]')) {
        resetAllFilters();
        return;
      }

      const rowTr = e.target.closest('tr[data-cr-row]');
      if (rowTr) {
        const rid = rowTr.getAttribute('data-cr-row');
        state.selectedRowId = state.selectedRowId === rid ? null : rid;
        renderAll({ preserveScroll: true });
      }
    });

    // Modal forms & quick reason chips
    document.getElementById('v2CrEditForm')?.addEventListener('submit', submitEditForm);
    document.getElementById('v2CrDeleteForm')?.addEventListener('submit', submitDeleteForm);

    document.querySelectorAll('[data-cr-edit-chip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById('v2CrEditReasonInput');
        if (inp) {
          inp.value = btn.getAttribute('data-cr-edit-chip') || '';
          inp.focus();
        }
      });
    });

    document.querySelectorAll('[data-cr-del-chip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById('v2CrDeleteReasonInput');
        if (inp) {
          inp.value = btn.getAttribute('data-cr-del-chip') || '';
          inp.focus();
        }
      });
    });

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      const tab = e && e.detail && e.detail.tab;
      state.isActiveTab = (tab === 'cleanReports');
      if (state.isActiveTab && hasAuthToken()) {
        loadData({ silent: state.hasLoadedOnce });
      }
    });

    window.addEventListener('cwp-v2:live-data-updated', () => {
      if (state.isActiveTab && state.selectedDate === getTodayIst() && hasAuthToken()) {
        loadData({ silent: true });
      }
    });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.selectedDate = getTodayIst();
    bindEvents();
    renderDateControls();

    const activeView = document.getElementById('v2View_cleanReports');
    if (activeView && activeView.classList.contains('is-active')) {
      state.isActiveTab = true;
      if (hasAuthToken()) loadData({ silent: false });
    }
  }

  window.CWP_ADMIN_V2.cleanReports = {
    init,
    loadData,
    resetAllFilters,
    selectDate,
    getState: () => ({
      selectedDate: state.selectedDate,
      totalRows: state.allRows.length,
      filteredRows: state.filteredRows.length,
      kpiFilter: state.kpiFilter,
      statusFilter: state.statusFilter,
      staffFilter: state.staffFilter,
      areaFilter: state.areaFilter,
      exceptionFilter: state.exceptionFilter,
      page: state.page,
      pageSize: state.pageSize,
      selectedRowId: state.selectedRowId
    })
  };
})(window);
