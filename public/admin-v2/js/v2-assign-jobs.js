/**
 * =========================================================================
 * CWP ADMIN V2 — ASSIGN JOBS (DAILY DISPATCH & ALLOCATION WORKSTATION)
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.assignJobs.
 * English-only Admin UI, Material Symbols only, zero mocks, zero emojis.
 * Preserves V1 business workflow & backend contracts:
 *   - getDailyCleanAssignments
 *   - assignDailyCleanCustomer
 *   - unassignDailyCleanCustomer
 *   - getStaffList
 *   - getSpecialJobs (for staff today on-demand workload count)
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = {
    assignments: [],
    summary: { total: 0, assigned: 0, unassigned: 0 },
    staffList: [],
    staffMap: {},
    todaySpecialCounts: {},
    filtered: [],
    activeView: 'roster', // 'roster' | 'staff'
    searchQuery: '',
    filters: {
      status: 'all', // 'all' | 'assigned' | 'unassigned' | 'exceptions' | 'inactive_staff' | 'missing_sequence' | 'missing_address'
      staff: 'all',
      location: 'all'
    },
    pagination: {
      currentPage: 1,
      pageSize: 25
    },
    modalCustomerId: null,
    unassignCustomerId: null,
    isLoading: false,
    isSubmitting: false,
    hasLoadedOnce: false,
    initialized: false
  };

  let searchTimer = null;

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

  function isViewActive() {
    const view = document.getElementById('v2View_jobAssignment');
    return Boolean(view && view.classList.contains('is-active'));
  }

  function isStaffActive(staff) {
    if (!staff) return false;
    if (staff.isActive === false) return false;
    const act = String(staff.active ?? '').trim().toLowerCase();
    if (act === 'no' || act === 'false' || act === 'inactive') return false;
    return true;
  }

  function isStaffAvailable(staff) {
    return isStaffActive(staff) && !staff.isLocked;
  }

  function getIstTodayKey() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date());
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function buildStaffMap(staffList) {
    const map = {};
    (staffList || []).forEach((s) => {
      if (s.dbId) map[String(s.dbId).toLowerCase()] = s;
      if (s.id) map[String(s.id).toLowerCase()] = s;
      if (s.staffCode) map[String(s.staffCode).toLowerCase()] = s;
      if (s.staff_code) map[String(s.staff_code).toLowerCase()] = s;
    });
    state.staffMap = map;
  }

  function resolveStaffForRow(row) {
    if (!row || !row.isAssigned) return null;
    const byId = row.staffId ? state.staffMap[String(row.staffId).toLowerCase()] : null;
    if (byId) return byId;
    const byCode = row.staffCode ? state.staffMap[String(row.staffCode).toLowerCase()] : null;
    return byCode || null;
  }

  function getRowExceptions(row) {
    const flags = [];
    if (!row.isAssigned) {
      flags.push('unassigned');
    } else {
      const staff = resolveStaffForRow(row);
      if (staff && !isStaffAvailable(staff)) {
        flags.push('inactive_staff');
      }
      if (row.sequenceOrder === null || row.sequenceOrder === undefined) {
        flags.push('missing_sequence');
      }
    }
    if (!String(row.address || '').trim() && !String(row.locality || '').trim()) {
      flags.push('missing_address');
    }
    return flags;
  }

  function computeTodaySpecialCounts(jobs) {
    const counts = {};
    const todayKey = getIstTodayKey();
    (jobs || []).forEach((j) => {
      const st = String(j.status || '').toLowerCase();
      if (st === 'cancelled') return;
      const rawDate = j.scheduledDate || j.scheduled_date || '';
      const jDate = /^\d{4}-\d{2}-\d{2}/.test(String(rawDate)) ? String(rawDate).slice(0, 10) : '';
      if (jDate !== todayKey && st !== 'in_progress') return;
      const sId = String(j.staffId || j.staff_id || '').toLowerCase();
      const sCode = String(j.staffCode || j.staff_code || '').toLowerCase();
      if (sId) counts[sId] = (counts[sId] || 0) + 1;
      if (sCode && sCode !== sId) counts[sCode] = (counts[sCode] || 0) + 1;
    });
    state.todaySpecialCounts = counts;
  }

  async function loadData(opts = {}) {
    if (!hasAuthToken()) return;
    if (state.isLoading && !opts.force) return;

    const api = window.CWP_ADMIN_V2.api;
    if (!api) return;

    state.isLoading = true;
    const tbody = document.getElementById('v2AjTableBody');
    if (tbody && !state.hasLoadedOnce && window.CWP_ADMIN_V2.ui) {
      window.CWP_ADMIN_V2.ui.renderSkeletonRows(tbody, 6, 7);
    }

    try {
      const [assignRes, staffRes, jobsRes] = await Promise.allSettled([
        api.request('getDailyCleanAssignments', {}),
        api.request('getStaffList', {}),
        api.request('getSpecialJobs', {})
      ]);

      if (assignRes.status !== 'fulfilled' || !assignRes.value || assignRes.value.success === false) {
        const errMsg = assignRes.status === 'fulfilled'
          ? (assignRes.value && assignRes.value.error) || 'Failed to fetch daily assignments'
          : (assignRes.reason && assignRes.reason.message) || 'Network error';
        throw new Error(errMsg);
      }

      const payload = assignRes.value;
      const rows = Array.isArray(payload.assignments)
        ? payload.assignments
        : (Array.isArray(payload.data) ? payload.data : []);
      state.assignments = rows;

      const assignedCount = rows.filter(r => r.isAssigned).length;
      const unassignedCount = rows.filter(r => !r.isAssigned).length;
      state.summary = {
        total: payload.summary && typeof payload.summary.total === 'number' ? payload.summary.total : rows.length,
        assigned: payload.summary && typeof payload.summary.assigned === 'number' ? payload.summary.assigned : assignedCount,
        unassigned: payload.summary && typeof payload.summary.unassigned === 'number' ? payload.summary.unassigned : unassignedCount
      };

      if (staffRes.status === 'fulfilled' && Array.isArray(staffRes.value)) {
        state.staffList = staffRes.value;
        buildStaffMap(state.staffList);
      }

      if (jobsRes.status === 'fulfilled' && jobsRes.value) {
        const jobs = Array.isArray(jobsRes.value.jobs)
          ? jobsRes.value.jobs
          : (Array.isArray(jobsRes.value) ? jobsRes.value : []);
        computeTodaySpecialCounts(jobs);
      }

      state.hasLoadedOnce = true;
      populateFilterDropdowns();
      applyFiltersAndRender();
    } catch (err) {
      if (tbody && window.CWP_ADMIN_V2.ui) {
        window.CWP_ADMIN_V2.ui.renderErrorState(tbody, {
          title: 'Failed to load daily assignments',
          message: err.message || 'Unable to fetch assignments from server.',
          onRetry: () => loadData({ force: true })
        });
      }
      showToast(err.message || 'Failed to load daily assignments', 'error');
    } finally {
      state.isLoading = false;
    }
  }

  function getStaffAssignedCount(staff) {
    const dbId = String(staff.dbId || '').toLowerCase();
    const code = String(staff.id || staff.staffCode || '').toLowerCase();
    return state.assignments.filter((r) => {
      if (!r.isAssigned) return false;
      const rId = String(r.staffId || '').toLowerCase();
      const rCode = String(r.staffCode || '').toLowerCase();
      return (dbId && rId === dbId) || (code && (rCode === code || rId === code));
    }).length;
  }

  function populateFilterDropdowns() {
    const staffSelect = document.getElementById('v2AjFilterStaff');
    if (staffSelect) {
      const currentVal = state.filters.staff;
      let html = '<option value="all">Staff: All</option><option value="unassigned">Unassigned Only</option>';
      const sortedStaff = [...state.staffList].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      sortedStaff.forEach((s) => {
        const count = getStaffAssignedCount(s);
        const key = s.dbId || s.id;
        const inactiveTag = isStaffAvailable(s) ? '' : ' [Inactive]';
        html += `<option value="${escapeHtml(key)}">${escapeHtml(s.name)} (${count})${inactiveTag}</option>`;
      });
      staffSelect.innerHTML = html;
      staffSelect.value = currentVal;
      if (staffSelect.value !== currentVal) {
        staffSelect.value = 'all';
        state.filters.staff = 'all';
      }
    }

    const locSelect = document.getElementById('v2AjFilterLocation');
    if (locSelect) {
      const currentLoc = state.filters.location;
      const locs = Array.from(new Set(
        state.assignments
          .map(r => String(r.locationName || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));
      let html = '<option value="all">Area / Location: All</option>';
      locs.forEach((loc) => {
        html += `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`;
      });
      locSelect.innerHTML = html;
      locSelect.value = currentLoc;
      if (locSelect.value !== currentLoc) {
        locSelect.value = 'all';
        state.filters.location = 'all';
      }
    }
  }

  function renderKpisAndExceptions() {
    const { total, assigned, unassigned } = state.summary;
    const availStaff = state.staffList.filter(isStaffAvailable).length;
    const coverage = total > 0 ? Math.round((assigned / total) * 100) : 0;

    const totalPill = document.getElementById('v2AjTotalPill');
    if (totalPill) totalPill.textContent = `${total} Subscribers`;

    const kpiTotal = document.getElementById('v2AjKpiTotal');
    const kpiAssigned = document.getElementById('v2AjKpiAssigned');
    const kpiUnassigned = document.getElementById('v2AjKpiUnassigned');
    const kpiStaff = document.getElementById('v2AjKpiStaff');
    const kpiCoverage = document.getElementById('v2AjKpiCoverage');
    const kpiCoverageMeta = document.getElementById('v2AjKpiCoverageMeta');
    const quickCount = document.getElementById('v2AjUnassignedQuickCount');
    const quickBtn = document.getElementById('v2AjBtnUnassignedQuick');
    const unassignedCard = document.getElementById('v2AjKpiCardUnassigned');

    if (kpiTotal) kpiTotal.textContent = String(total);
    if (kpiAssigned) kpiAssigned.textContent = String(assigned);
    if (kpiUnassigned) kpiUnassigned.textContent = String(unassigned);
    if (kpiStaff) kpiStaff.textContent = String(availStaff);
    if (kpiCoverage) kpiCoverage.textContent = `${coverage}%`;
    if (kpiCoverageMeta) kpiCoverageMeta.textContent = `${assigned} of ${total} covered`;
    if (quickCount) quickCount.textContent = String(unassigned);

    if (quickBtn) {
      quickBtn.classList.toggle('has-pending', unassigned > 0);
      quickBtn.classList.toggle('is-active', state.filters.status === 'unassigned');
    }
    if (unassignedCard) {
      unassignedCard.classList.toggle('is-warn', unassigned > 0);
    }

    // Active KPI highlight
    document.querySelectorAll('#v2AjKpiStrip .cwp-v2-aj-kpi-card').forEach((card) => {
      const mode = card.getAttribute('data-aj-kpi');
      let active = false;
      if (state.activeView === 'staff' && mode === 'staff_view') active = true;
      else if (state.activeView === 'roster') {
        if (mode === 'all' && state.filters.status === 'all') active = true;
        if (mode === 'assigned' && state.filters.status === 'assigned') active = true;
        if (mode === 'unassigned' && state.filters.status === 'unassigned') active = true;
      }
      card.classList.toggle('is-active', active);
    });

    // Real operational exceptions
    const excBar = document.getElementById('v2AjExceptionsBar');
    if (excBar) {
      let inactiveStaffCount = 0;
      let missingSeqCount = 0;
      let missingAddrCount = 0;

      state.assignments.forEach((row) => {
        const flags = getRowExceptions(row);
        if (flags.includes('inactive_staff')) inactiveStaffCount += 1;
        if (flags.includes('missing_sequence')) missingSeqCount += 1;
        if (flags.includes('missing_address')) missingAddrCount += 1;
      });

      const pills = [];
      if (unassigned > 0) {
        pills.push({ key: 'unassigned', label: `${unassigned} Unassigned` });
      }
      if (inactiveStaffCount > 0) {
        pills.push({ key: 'inactive_staff', label: `${inactiveStaffCount} Inactive/Locked Staff` });
      }
      if (missingSeqCount > 0) {
        pills.push({ key: 'missing_sequence', label: `${missingSeqCount} Missing Stop Order` });
      }
      if (missingAddrCount > 0) {
        pills.push({ key: 'missing_address', label: `${missingAddrCount} Missing Address` });
      }

      if (pills.length === 0) {
        excBar.hidden = true;
        excBar.innerHTML = '';
      } else {
        excBar.hidden = false;
        excBar.innerHTML = `
          <span class="cwp-v2-aj-exc-label">
            <span class="material-symbols-outlined" style="font-size:16px;" aria-hidden="true">error</span>
            <span>Attention Needed:</span>
          </span>
          ${pills.map(p => `
            <button type="button" class="cwp-v2-aj-exc-pill ${state.filters.status === p.key ? 'is-active' : ''}" data-aj-exc="${escapeHtml(p.key)}">
              ${escapeHtml(p.label)}
            </button>
          `).join('')}
        `;
      }
    }
  }

  function applyFiltersAndRender() {
    const q = state.searchQuery.toLowerCase().trim();
    const { status, staff, location } = state.filters;

    state.filtered = state.assignments.filter((row) => {
      const exc = getRowExceptions(row);
      if (status === 'assigned' && !row.isAssigned) return false;
      if (status === 'unassigned' && row.isAssigned) return false;
      if (status === 'exceptions' && exc.length === 0) return false;
      if (status === 'inactive_staff' && !exc.includes('inactive_staff')) return false;
      if (status === 'missing_sequence' && !exc.includes('missing_sequence')) return false;
      if (status === 'missing_address' && !exc.includes('missing_address')) return false;

      if (staff === 'unassigned') {
        if (row.isAssigned) return false;
      } else if (staff !== 'all') {
        const sNorm = String(staff).toLowerCase();
        const rId = String(row.staffId || '').toLowerCase();
        const rCode = String(row.staffCode || '').toLowerCase();
        const matchedStaff = state.staffMap[sNorm];
        const mDbId = matchedStaff ? String(matchedStaff.dbId || '').toLowerCase() : '';
        const mCode = matchedStaff ? String(matchedStaff.id || '').toLowerCase() : '';
        if (rId !== sNorm && rCode !== sNorm && (!mDbId || rId !== mDbId) && (!mCode || rCode !== mCode)) {
          return false;
        }
      }

      if (location !== 'all') {
        if (String(row.locationName || '').trim() !== location) return false;
      }

      if (q) {
        const hay = [
          row.customerName,
          row.customerNameHi,
          row.customerCode,
          row.phone,
          row.vehicleNumber,
          row.brandOrModel,
          row.packageType,
          row.locationName,
          row.address,
          row.locality,
          row.staffName,
          row.staffCode
        ].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pagination.pageSize));
    if (state.pagination.currentPage > totalPages) {
      state.pagination.currentPage = totalPages;
    }

    renderKpisAndExceptions();
    if (state.activeView === 'staff') {
      renderStaffWorkloadTable();
    } else {
      renderRosterTable();
    }
  }

  function renderRosterTable() {
    const tbody = document.getElementById('v2AjTableBody');
    if (!tbody) return;

    const total = state.filtered.length;
    const { currentPage, pageSize } = state.pagination;
    const startIdx = (currentPage - 1) * pageSize;
    const pageRows = state.filtered.slice(startIdx, startIdx + pageSize);

    if (total === 0) {
      if (window.CWP_ADMIN_V2.ui) {
        const isFiltered = Boolean(state.searchQuery || state.filters.status !== 'all' || state.filters.staff !== 'all' || state.filters.location !== 'all');
        tbody.innerHTML = `<tr><td colspan="7"><div class="cwp-v2-empty-state-panel">
          <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">assignment</span>
          <div class="cwp-v2-empty-state-title">${isFiltered ? 'No matching daily assignments' : 'No active daily cleaning subscribers'}</div>
          <div class="cwp-v2-empty-state-desc">${isFiltered ? 'Try adjusting or resetting your search and filter criteria.' : 'Active daily car cleaning subscribers will appear here.'}</div>
          ${isFiltered ? '<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" id="v2AjEmptyResetBtn">Reset Filters</button>' : ''}
        </div></td></tr>`;
        const resetBtn = document.getElementById('v2AjEmptyResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetFilters);
      } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px;">No matching assignments found.</td></tr>';
      }
      renderPagination(0, 0, 0);
      return;
    }

    const html = pageRows.map((row) => {
      const exc = getRowExceptions(row);
      const isInactiveStaff = exc.includes('inactive_staff');
      const seqHtml = row.sequenceOrder != null
        ? `<span class="cwp-v2-aj-seq-pill">#${escapeHtml(row.sequenceOrder)}</span>`
        : '<span class="cwp-v2-aj-seq-empty">--</span>';

      let staffHtml = '<span class="cwp-v2-aj-status-badge is-unassigned">Unassigned</span>';
      if (row.isAssigned) {
        const initial = String(row.staffName || 'S').trim().charAt(0).toUpperCase() || 'S';
        staffHtml = `
          <div class="cwp-v2-aj-staff-pill">
            <span class="cwp-v2-aj-staff-avatar ${isInactiveStaff ? 'is-warn' : ''}">${escapeHtml(initial)}</span>
            <div>
              <div class="cwp-v2-aj-staff-name">${escapeHtml(row.staffName || 'Staff')}</div>
              ${row.staffCode ? `<div class="cwp-v2-aj-staff-code">${escapeHtml(row.staffCode)}</div>` : ''}
            </div>
          </div>
        `;
      }

      let statusHtml = '<span class="cwp-v2-aj-status-badge is-assigned">Assigned</span>';
      if (!row.isAssigned) {
        statusHtml = '<span class="cwp-v2-aj-status-badge is-unassigned">Unassigned</span>';
      } else if (isInactiveStaff) {
        statusHtml = '<span class="cwp-v2-aj-status-badge is-exception">Staff Inactive</span>';
      }

      const addrText = row.locality || row.address || 'Address not set';
      const mapsLink = row.googleMapsUrl
        ? `<a href="${escapeHtml(row.googleMapsUrl)}" target="_blank" rel="noopener" class="cwp-v2-aj-maps-link" title="Open in Google Maps" aria-label="Open in Google Maps"><span class="material-symbols-outlined" style="font-size:15px;">location_on</span></a>`
        : '';

      const actionsHtml = row.isAssigned
        ? `
          <button type="button" class="cwp-v2-aj-btn-sm" data-aj-action="assign" data-customer-id="${escapeHtml(row.customerId)}" title="Reassign Staff">
            <span class="material-symbols-outlined" style="font-size:14px;" aria-hidden="true">sync_alt</span>
            <span>Reassign</span>
          </button>
          <button type="button" class="cwp-v2-aj-btn-sm is-danger" data-aj-action="unassign" data-customer-id="${escapeHtml(row.customerId)}" title="Unassign Cleaner">
            <span class="material-symbols-outlined" style="font-size:14px;" aria-hidden="true">person_remove</span>
          </button>
        `
        : `
          <button type="button" class="cwp-v2-aj-btn-sm is-primary" data-aj-action="assign" data-customer-id="${escapeHtml(row.customerId)}" title="Assign Cleaner">
            <span class="material-symbols-outlined" style="font-size:14px;" aria-hidden="true">person_add</span>
            <span>Assign</span>
          </button>
        `;

      return `
        <tr class="${row.isAssigned ? '' : 'is-unassigned'}" data-customer-id="${escapeHtml(row.customerId)}">
          <td>${seqHtml}</td>
          <td>
            <div class="cwp-v2-aj-cust-name">${escapeHtml(row.customerName || 'Subscriber')}</div>
            <div class="cwp-v2-aj-cust-sub">
              <span>${escapeHtml(row.phone || '--')}</span>
              ${row.customerCode ? `<span>• ${escapeHtml(row.customerCode)}</span>` : ''}
            </div>
          </td>
          <td>
            <div class="cwp-v2-aj-veh-plate">${escapeHtml(row.vehicleNumber || 'Unregistered')}</div>
            <div class="cwp-v2-aj-veh-pkg">${escapeHtml(row.packageType || 'Daily Clean')}</div>
          </td>
          <td>
            <div class="cwp-v2-aj-loc-row">
              ${row.locationName ? `<span class="cwp-v2-aj-loc-badge">${escapeHtml(row.locationName)}</span>` : ''}
              ${mapsLink}
            </div>
            <div class="cwp-v2-aj-loc-addr" title="${escapeHtml(addrText)}">${escapeHtml(addrText)}</div>
          </td>
          <td>${staffHtml}</td>
          <td>${statusHtml}</td>
          <td style="text-align:right;">
            <div class="cwp-v2-aj-row-actions">${actionsHtml}</div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
    renderPagination(total, startIdx + 1, Math.min(startIdx + pageRows.length, total));
  }

  function renderPagination(total, from, to) {
    const info = document.getElementById('v2AjPageInfo');
    const prevBtn = document.getElementById('v2AjPagePrev');
    const nextBtn = document.getElementById('v2AjPageNext');
    const numbersEl = document.getElementById('v2AjPageNumbers');
    const totalPages = Math.max(1, Math.ceil(total / state.pagination.pageSize));
    const curr = state.pagination.currentPage;

    if (info) {
      info.textContent = total === 0 ? 'Showing 0 of 0 assignments' : `Showing ${from}–${to} of ${total} assignments`;
    }
    if (prevBtn) prevBtn.disabled = curr <= 1;
    if (nextBtn) nextBtn.disabled = curr >= totalPages || total === 0;

    if (numbersEl) {
      let btns = '';
      const maxButtons = 5;
      let startPage = Math.max(1, curr - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }
      for (let p = startPage; p <= endPage; p += 1) {
        btns += `<button type="button" class="cwp-v2-aj-page-btn ${p === curr ? 'is-active' : ''}" data-aj-page="${p}">${p}</button>`;
      }
      numbersEl.innerHTML = btns;
    }
  }

  function renderStaffWorkloadTable() {
    const tbody = document.getElementById('v2AjStaffTableBody');
    if (!tbody) return;

    if (state.staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No staff records available.</td></tr>';
      return;
    }

    const sorted = [...state.staffList].sort((a, b) => {
      const aAvail = isStaffAvailable(a) ? 0 : 1;
      const bAvail = isStaffAvailable(b) ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;
      return getStaffAssignedCount(b) - getStaffAssignedCount(a);
    });

    tbody.innerHTML = sorted.map((s) => {
      const avail = isStaffAvailable(s);
      const active = isStaffActive(s);
      const routeCars = getStaffAssignedCount(s);
      const dbId = String(s.dbId || '').toLowerCase();
      const code = String(s.id || s.staffCode || '').toLowerCase();
      const specToday = state.todaySpecialCounts[code] || state.todaySpecialCounts[dbId] || 0;

      let availBadge = '<span class="cwp-v2-aj-status-badge is-assigned">Available</span>';
      if (!active) {
        availBadge = '<span class="cwp-v2-aj-status-badge is-exception">Inactive</span>';
      } else if (s.isLocked) {
        availBadge = '<span class="cwp-v2-aj-status-badge is-unassigned">Locked</span>';
      }

      const initial = String(s.name || 'S').trim().charAt(0).toUpperCase() || 'S';
      const staffFilterKey = s.dbId || s.id;

      return `
        <tr>
          <td>
            <div class="cwp-v2-aj-staff-pill">
              <span class="cwp-v2-aj-staff-avatar ${avail ? '' : 'is-warn'}">${escapeHtml(initial)}</span>
              <div>
                <div class="cwp-v2-aj-staff-name">${escapeHtml(s.name || s.id)}</div>
                <div class="cwp-v2-aj-staff-code">${escapeHtml(s.id || '')}${s.phone ? ` • ${escapeHtml(s.phone)}` : ''}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(s.designationName || s.role || 'Cleaner')}</td>
          <td>${availBadge}</td>
          <td><strong>${routeCars}</strong> ${routeCars === 1 ? 'car' : 'cars'}</td>
          <td><strong>${specToday}</strong> ${specToday === 1 ? 'job' : 'jobs'}</td>
          <td style="text-align:right;">
            <button type="button" class="cwp-v2-aj-btn-sm" data-aj-filter-staff="${escapeHtml(staffFilterKey)}">
              <span class="material-symbols-outlined" style="font-size:14px;" aria-hidden="true">filter_alt</span>
              <span>View Roster (${routeCars})</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function switchView(viewName) {
    state.activeView = viewName === 'staff' ? 'staff' : 'roster';
    const rosterCard = document.getElementById('v2AjRosterCard');
    const staffCard = document.getElementById('v2AjStaffCard');
    const toolbar = document.getElementById('v2AjToolbar');
    const tabRoster = document.getElementById('v2AjTabRoster');
    const tabStaff = document.getElementById('v2AjTabStaff');

    if (rosterCard) rosterCard.hidden = state.activeView !== 'roster';
    if (staffCard) staffCard.hidden = state.activeView !== 'staff';
    if (toolbar) toolbar.hidden = state.activeView !== 'roster';

    if (tabRoster) {
      tabRoster.classList.toggle('is-active', state.activeView === 'roster');
      tabRoster.setAttribute('aria-selected', state.activeView === 'roster' ? 'true' : 'false');
    }
    if (tabStaff) {
      tabStaff.classList.toggle('is-active', state.activeView === 'staff');
      tabStaff.setAttribute('aria-selected', state.activeView === 'staff' ? 'true' : 'false');
    }

    renderKpisAndExceptions();
    if (state.activeView === 'staff') {
      renderStaffWorkloadTable();
    } else {
      renderRosterTable();
    }
  }

  function resetFilters() {
    state.searchQuery = '';
    state.filters.status = 'all';
    state.filters.staff = 'all';
    state.filters.location = 'all';
    state.pagination.currentPage = 1;

    const searchInp = document.getElementById('v2AjSearchInput');
    const clearBtn = document.getElementById('v2AjSearchClear');
    const statusSel = document.getElementById('v2AjFilterStatus');
    const staffSel = document.getElementById('v2AjFilterStaff');
    const locSel = document.getElementById('v2AjFilterLocation');

    if (searchInp) searchInp.value = '';
    if (clearBtn) clearBtn.classList.remove('is-visible');
    if (statusSel) statusSel.value = 'all';
    if (staffSel) staffSel.value = 'all';
    if (locSel) locSel.value = 'all';

    applyFiltersAndRender();
  }

  function openAssignModal(customerId, triggerEl) {
    const row = state.assignments.find(r => r.customerId === customerId);
    if (!row) return;

    state.modalCustomerId = customerId;

    const titleEl = document.getElementById('v2AjModalTitle');
    const subEl = document.getElementById('v2AjModalSubtitle');
    const custInput = document.getElementById('v2AjModalCustomerId');
    const summaryEl = document.getElementById('v2AjModalSummary');
    const staffSelect = document.getElementById('v2AjModalStaffSelect');
    const errEl = document.getElementById('v2AjModalError');
    const unassignBtn = document.getElementById('v2AjModalBtnUnassign');
    const submitBtn = document.getElementById('v2AjModalBtnSubmit');

    if (titleEl) titleEl.textContent = row.isAssigned ? 'Reassign Daily Cleaner' : 'Assign Daily Cleaner';
    if (subEl) subEl.textContent = row.isAssigned ? 'Transfer customer to another cleaner route' : 'Allocate customer to a cleaner daily route';
    if (custInput) custInput.value = customerId;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (unassignBtn) unassignBtn.hidden = !row.isAssigned;
    if (submitBtn) submitBtn.disabled = false;

    if (summaryEl) {
      const currentStaffLabel = row.isAssigned
        ? `${row.staffName || 'Staff'}${row.staffCode ? ` (${row.staffCode})` : ''}${row.sequenceOrder != null ? ` • Stop #${row.sequenceOrder}` : ''}`
        : 'Unassigned';
      summaryEl.innerHTML = `
        <div class="cwp-v2-aj-modal-summary-row">
          <span class="cwp-v2-aj-modal-summary-label">Customer</span>
          <span class="cwp-v2-aj-modal-summary-val">${escapeHtml(row.customerName || 'Subscriber')} (${escapeHtml(row.phone || '--')})</span>
        </div>
        <div class="cwp-v2-aj-modal-summary-row">
          <span class="cwp-v2-aj-modal-summary-label">Vehicle &amp; Plan</span>
          <span class="cwp-v2-aj-modal-summary-val">${escapeHtml(row.vehicleNumber || 'Unregistered')} • ${escapeHtml(row.packageType || 'Daily Clean')}</span>
        </div>
        <div class="cwp-v2-aj-modal-summary-row">
          <span class="cwp-v2-aj-modal-summary-label">Location</span>
          <span class="cwp-v2-aj-modal-summary-val">${escapeHtml(row.locationName || 'Home')} — ${escapeHtml(row.locality || row.address || 'Address not set')}</span>
        </div>
        <div class="cwp-v2-aj-modal-summary-row">
          <span class="cwp-v2-aj-modal-summary-label">Current Assignment</span>
          <span class="cwp-v2-aj-modal-summary-val">${escapeHtml(currentStaffLabel)}</span>
        </div>
      `;
    }

    if (staffSelect) {
      const eligible = state.staffList.filter(isStaffAvailable).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      let optsHtml = '<option value="">-- Select Eligible Cleaner --</option>';
      eligible.forEach((s) => {
        const count = getStaffAssignedCount(s);
        const isCurrent = row.isAssigned && (
          (row.staffId && s.dbId && String(row.staffId).toLowerCase() === String(s.dbId).toLowerCase()) ||
          (row.staffCode && s.id && String(row.staffCode).toLowerCase() === String(s.id).toLowerCase())
        );
        const val = s.id || s.dbId;
        optsHtml += `<option value="${escapeHtml(val)}" ${isCurrent ? 'disabled' : ''}>${escapeHtml(s.name)} (${escapeHtml(s.id || '')}) — ${count} cars${isCurrent ? ' (Current)' : ''}</option>`;
      });
      staffSelect.innerHTML = optsHtml;
      staffSelect.value = '';
    }

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAjAssign', {
        triggerEl: triggerEl || document.activeElement,
        initialFocus: '#v2AjModalStaffSelect'
      });
    }
  }

  async function handleAssignSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (state.isSubmitting) return;

    const customerId = (document.getElementById('v2AjModalCustomerId') || {}).value || state.modalCustomerId;
    const staffId = (document.getElementById('v2AjModalStaffSelect') || {}).value || '';
    const errEl = document.getElementById('v2AjModalError');
    const submitBtn = document.getElementById('v2AjModalBtnSubmit');

    if (!customerId || !staffId) {
      if (errEl) {
        errEl.textContent = 'Please select an eligible staff cleaner.';
        errEl.hidden = false;
      }
      return;
    }

    state.isSubmitting = true;
    if (errEl) errEl.hidden = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await window.CWP_ADMIN_V2.api.request('assignDailyCleanCustomer', {
        customerId,
        staffId
      });

      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Failed to save assignment.');
      }

      if (window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close('v2ModalAjAssign');
      }
      showToast(res.message || 'Daily cleaner assigned successfully.', 'success');
      await loadData({ force: true });
      if (window.CWP_ADMIN_V2.notifications && typeof window.CWP_ADMIN_V2.notifications.refreshBadges === 'function') {
        window.CWP_ADMIN_V2.notifications.refreshBadges();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to assign cleaner. Please retry.';
        errEl.hidden = false;
      }
      showToast(err.message || 'Assignment failed', 'error');
    } finally {
      state.isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function openUnassignModal(customerId, triggerEl) {
    const row = state.assignments.find(r => r.customerId === customerId);
    if (!row) return;

    state.unassignCustomerId = customerId;
    const custInput = document.getElementById('v2AjUnassignCustId');
    const promptEl = document.getElementById('v2AjUnassignPrompt');
    const reasonEl = document.getElementById('v2AjUnassignReason');
    const errEl = document.getElementById('v2AjUnassignError');
    const confirmBtn = document.getElementById('v2AjUnassignBtnConfirm');

    if (custInput) custInput.value = customerId;
    if (promptEl) {
      promptEl.textContent = `Remove ${row.customerName || 'this customer'} from ${row.staffName || 'their assigned cleaner'}'s daily cleaning route?`;
    }
    if (reasonEl) reasonEl.value = '';
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (confirmBtn) confirmBtn.disabled = false;

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalAjUnassign', {
        triggerEl: triggerEl || document.activeElement,
        initialFocus: '#v2AjUnassignReason'
      });
    }
  }

  async function handleUnassignConfirm(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (state.isSubmitting) return;

    const customerId = (document.getElementById('v2AjUnassignCustId') || {}).value || state.unassignCustomerId;
    const reason = (document.getElementById('v2AjUnassignReason') || {}).value || 'Unassigned by admin';
    const errEl = document.getElementById('v2AjUnassignError');
    const confirmBtn = document.getElementById('v2AjUnassignBtnConfirm');

    if (!customerId) return;

    state.isSubmitting = true;
    if (errEl) errEl.hidden = true;
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const res = await window.CWP_ADMIN_V2.api.request('unassignDailyCleanCustomer', {
        customerId,
        reason: reason.trim() || 'Unassigned by admin'
      });

      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Failed to unassign customer.');
      }

      if (window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close('v2ModalAjUnassign');
      }
      showToast(res.message || 'Customer unassigned from daily route.', 'success');
      await loadData({ force: true });
      if (window.CWP_ADMIN_V2.notifications && typeof window.CWP_ADMIN_V2.notifications.refreshBadges === 'function') {
        window.CWP_ADMIN_V2.notifications.refreshBadges();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to unassign customer. Please retry.';
        errEl.hidden = false;
      }
      showToast(err.message || 'Unassign failed', 'error');
    } finally {
      state.isSubmitting = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function bindEvents() {
    const tabRoster = document.getElementById('v2AjTabRoster');
    const tabStaff = document.getElementById('v2AjTabStaff');
    if (tabRoster) tabRoster.addEventListener('click', () => switchView('roster'));
    if (tabStaff) tabStaff.addEventListener('click', () => switchView('staff'));

    const btnRefresh = document.getElementById('v2AjBtnRefresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadData({ force: true }));

    const quickUnassigned = document.getElementById('v2AjBtnUnassignedQuick');
    if (quickUnassigned) {
      quickUnassigned.addEventListener('click', () => {
        switchView('roster');
        state.filters.status = state.filters.status === 'unassigned' ? 'all' : 'unassigned';
        const statusSel = document.getElementById('v2AjFilterStatus');
        if (statusSel) statusSel.value = state.filters.status;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const kpiStrip = document.getElementById('v2AjKpiStrip');
    if (kpiStrip) {
      kpiStrip.addEventListener('click', (e) => {
        const card = e.target.closest('[data-aj-kpi]');
        if (!card) return;
        const mode = card.getAttribute('data-aj-kpi');
        if (mode === 'staff_view') {
          switchView('staff');
          return;
        }
        switchView('roster');
        state.filters.status = mode === 'assigned' ? 'assigned' : (mode === 'unassigned' ? 'unassigned' : 'all');
        const statusSel = document.getElementById('v2AjFilterStatus');
        if (statusSel) statusSel.value = state.filters.status;
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const excBar = document.getElementById('v2AjExceptionsBar');
    if (excBar) {
      excBar.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-aj-exc]');
        if (!pill) return;
        const key = pill.getAttribute('data-aj-exc');
        switchView('roster');
        state.filters.status = state.filters.status === key ? 'all' : key;
        const statusSel = document.getElementById('v2AjFilterStatus');
        if (statusSel) {
          statusSel.value = ['all', 'assigned', 'unassigned', 'exceptions'].includes(state.filters.status)
            ? state.filters.status
            : 'exceptions';
        }
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const searchInp = document.getElementById('v2AjSearchInput');
    const searchClear = document.getElementById('v2AjSearchClear');
    if (searchInp) {
      searchInp.addEventListener('input', () => {
        const val = searchInp.value || '';
        if (searchClear) searchClear.classList.toggle('is-visible', val.length > 0);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = val;
          state.pagination.currentPage = 1;
          applyFiltersAndRender();
        }, 120);
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInp) searchInp.value = '';
        searchClear.classList.remove('is-visible');
        state.searchQuery = '';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const statusSel = document.getElementById('v2AjFilterStatus');
    if (statusSel) {
      statusSel.addEventListener('change', () => {
        state.filters.status = statusSel.value || 'all';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const staffSel = document.getElementById('v2AjFilterStaff');
    if (staffSel) {
      staffSel.addEventListener('change', () => {
        state.filters.staff = staffSel.value || 'all';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const locSel = document.getElementById('v2AjFilterLocation');
    if (locSel) {
      locSel.addEventListener('change', () => {
        state.filters.location = locSel.value || 'all';
        state.pagination.currentPage = 1;
        applyFiltersAndRender();
      });
    }

    const resetBtn = document.getElementById('v2AjResetFilters');
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);

    const rosterBody = document.getElementById('v2AjTableBody');
    if (rosterBody) {
      rosterBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-aj-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-aj-action');
        const customerId = btn.getAttribute('data-customer-id');
        if (!customerId) return;
        if (action === 'assign') openAssignModal(customerId, btn);
        else if (action === 'unassign') openUnassignModal(customerId, btn);
      });
    }

    const staffBody = document.getElementById('v2AjStaffTableBody');
    if (staffBody) {
      staffBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-aj-filter-staff]');
        if (!btn) return;
        const staffKey = btn.getAttribute('data-aj-filter-staff');
        if (!staffKey) return;
        state.filters.staff = staffKey;
        const staffSelect = document.getElementById('v2AjFilterStaff');
        if (staffSelect) staffSelect.value = staffKey;
        state.pagination.currentPage = 1;
        switchView('roster');
        applyFiltersAndRender();
      });
    }

    const pageSizeSel = document.getElementById('v2AjPageSize');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', () => {
        state.pagination.pageSize = parseInt(pageSizeSel.value, 10) || 25;
        state.pagination.currentPage = 1;
        renderRosterTable();
      });
    }

    const prevBtn = document.getElementById('v2AjPagePrev');
    const nextBtn = document.getElementById('v2AjPageNext');
    const pageNums = document.getElementById('v2AjPageNumbers');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.pagination.currentPage > 1) {
          state.pagination.currentPage -= 1;
          renderRosterTable();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pagination.pageSize));
        if (state.pagination.currentPage < totalPages) {
          state.pagination.currentPage += 1;
          renderRosterTable();
        }
      });
    }
    if (pageNums) {
      pageNums.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-aj-page]');
        if (!btn) return;
        const page = parseInt(btn.getAttribute('data-aj-page'), 10);
        if (page > 0) {
          state.pagination.currentPage = page;
          renderRosterTable();
        }
      });
    }

    const assignForm = document.getElementById('v2AjAssignForm');
    if (assignForm) assignForm.addEventListener('submit', handleAssignSubmit);

    const modalUnassignBtn = document.getElementById('v2AjModalBtnUnassign');
    if (modalUnassignBtn) {
      modalUnassignBtn.addEventListener('click', () => {
        const custId = state.modalCustomerId;
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.close('v2ModalAjAssign');
        }
        if (custId) openUnassignModal(custId);
      });
    }

    const unassignForm = document.getElementById('v2AjUnassignForm');
    if (unassignForm) unassignForm.addEventListener('submit', handleUnassignConfirm);

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'jobAssignment') {
        loadData({ force: !state.hasLoadedOnce });
      }
    });

    window.addEventListener('cwp-v2:live-data-updated', () => {
      if (isViewActive() && !state.isSubmitting && !state.isLoading) {
        loadData();
      }
    });
  }

  function init() {
    if (state.initialized) {
      if (isViewActive()) loadData();
      return;
    }
    state.initialized = true;
    bindEvents();
    if (isViewActive()) {
      loadData({ force: true });
    }
  }

  window.CWP_ADMIN_V2.assignJobs = {
    init,
    loadData,
    switchView,
    resetFilters,
    openAssignModal,
    openUnassignModal,
    getState: () => state
  };
})(window);
