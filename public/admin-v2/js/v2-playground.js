/**
 * CWP Admin V2 UI Playground Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.playground
 * Demonstrates safe component interactions without triggering any real operations.
 * Enhanced for Task 02: Input Component System
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  function init() {
    bindInteractiveButtons();
    bindLoadingDemos();
    bindHitAreaToggle();
    bindSearchClear();
    bindPasswordToggle();
    bindCharacterCounter();
    bindValidationDemo();
    bindTablePlayground();
    bindOverlayPlayground();
    bindFormPlayground();
    bindSelectionPlayground();
    bindTableDataGridPlayground();
  }

  function bindInteractiveButtons() {
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    document.addEventListener('click', function (e) {
      const btn = e.target.closest('#v2View_ui-lab .cwp-v2-btn');
      if (!btn) return;

      // Ignore if disabled
      if (btn.hasAttribute('disabled') || btn.classList.contains('is-disabled')) {
        return;
      }

      const rect = btn.getBoundingClientRect();
      const h = Math.round(rect.height);
      const w = Math.round(rect.width);
      const btnText = btn.textContent.trim().replace(/\s+/g, ' ');

      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span>
          <span>Activated: <strong>${escapeHtml(btnText || 'Icon Button')}</strong> &bull; Size: <code>${h}px &times; ${w}px</code> &bull; Class: <code>${escapeHtml(btn.className.replace('cwp-v2-btn', '').trim() || 'standard')}</code></span>
        `;
      }
    });
  }

  function bindLoadingDemos() {
    const testLoadingBtn = document.getElementById('v2DemoBtnLoadingTest');
    if (!testLoadingBtn) return;

    testLoadingBtn.addEventListener('click', function () {
      if (this.classList.contains('is-loading')) return;

      const originalHtml = this.innerHTML;
      this.classList.add('is-loading');
      this.setAttribute('aria-busy', 'true');
      this.innerHTML = `<span class="cwp-v2-btn-spinner" aria-hidden="true"></span><span>Processing (2.5s)...</span>`;

      setTimeout(() => {
        this.classList.remove('is-loading');
        this.removeAttribute('aria-busy');
        this.innerHTML = originalHtml;
      }, 2500);
    });
  }

  function bindHitAreaToggle() {
    const toggleBtn = document.getElementById('v2ToggleHitAreaBtn');
    const cluster = document.getElementById('v2IconButtonCluster');
    if (!toggleBtn || !cluster) return;

    toggleBtn.addEventListener('click', function () {
      const isVisible = cluster.classList.toggle('cwp-v2-hit-area-visible');
      this.classList.toggle('cwp-v2-btn-primary', isVisible);
      this.classList.toggle('cwp-v2-btn-secondary', !isVisible);
      this.innerHTML = isVisible
        ? `<span class="material-symbols-outlined">visibility_off</span><span>Hide Hit Area Boundaries</span>`
        : `<span class="material-symbols-outlined">visibility</span><span>Show Hit Area Boundaries</span>`;
    });
  }

  /* =========================================================================
     Input Component Interactive Handlers (Task 02)
     ========================================================================= */

  function bindSearchClear() {
    const searchInput = document.getElementById('v2DemoSearchInput');
    const clearBtn = document.getElementById('v2DemoSearchClearBtn');
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    if (!searchInput || !clearBtn) return;

    function toggleClearVisibility() {
      clearBtn.style.display = searchInput.value.trim().length > 0 ? 'inline-flex' : 'none';
    }

    searchInput.addEventListener('input', toggleClearVisibility);
    toggleClearVisibility();

    clearBtn.addEventListener('click', function () {
      searchInput.value = '';
      toggleClearVisibility();
      searchInput.focus();

      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-info);">info</span>
          <span>Search input cleared &bull; Focused</span>
        `;
      }
    });
  }

  function bindPasswordToggle() {
    const passInput = document.getElementById('v2DemoPasswordInput');
    const toggleBtn = document.getElementById('v2DemoPasswordToggleBtn');
    const toggleIcon = document.getElementById('v2DemoPasswordToggleIcon');
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    if (!passInput || !toggleBtn || !toggleIcon) return;

    toggleBtn.addEventListener('click', function () {
      const isPassword = passInput.getAttribute('type') === 'password';
      passInput.setAttribute('type', isPassword ? 'text' : 'password');
      toggleIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
      toggleBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
      toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-info);">info</span>
          <span>Password visibility: <strong>${isPassword ? 'Visible (Text)' : 'Masked (Password)'}</strong></span>
        `;
      }
    });
  }

  function bindCharacterCounter() {
    const textarea = document.getElementById('v2DemoTextarea');
    const counter = document.getElementById('v2DemoTextareaCounter');
    if (!textarea || !counter) return;

    const max = parseInt(textarea.getAttribute('maxlength') || '150', 10);

    function update() {
      const len = textarea.value.length;
      counter.textContent = `${len} / ${max}`;
      counter.classList.toggle('is-limit', len >= max);
    }

    textarea.addEventListener('input', update);
    update();
  }

  function bindValidationDemo() {
    const input = document.getElementById('v2DemoValidationInput');
    const box = document.getElementById('v2DemoValidationBox');
    const errEl = document.getElementById('v2DemoValidationError');
    const succEl = document.getElementById('v2DemoValidationSuccess');
    const btn = document.getElementById('v2DemoValidateTriggerBtn');
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    if (!input || !box || !errEl || !succEl || !btn) return;

    function validate() {
      const val = input.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!val) {
        box.classList.add('has-error');
        box.classList.remove('has-success');
        errEl.style.display = 'flex';
        errEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">error</span><span>Email address is required.</span>`;
        succEl.style.display = 'none';
        if (feedbackEl) {
          feedbackEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-danger);">cancel</span><span>Validation Result: Required field error triggered</span>`;
        }
        return false;
      }

      if (!emailRegex.test(val)) {
        box.classList.add('has-error');
        box.classList.remove('has-success');
        errEl.style.display = 'flex';
        errEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">error</span><span>Please enter a valid email address (e.g., manager@cwpdetailers.in).</span>`;
        succEl.style.display = 'none';
        if (feedbackEl) {
          feedbackEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-danger);">cancel</span><span>Validation Result: Invalid email format</span>`;
        }
        return false;
      }

      box.classList.remove('has-error');
      box.classList.add('has-success');
      errEl.style.display = 'none';
      succEl.style.display = 'flex';
      succEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span><span>Email format verified successfully.</span>`;
      if (feedbackEl) {
        feedbackEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span><span>Validation Result: Valid email verified</span>`;
      }
      return true;
    }

    btn.addEventListener('click', validate);
    input.addEventListener('input', function () {
      if (box.classList.contains('has-error') || box.classList.contains('has-success')) {
        validate();
      }
    });
  }

  /* =========================================================================
     Table & Data Grid System Controller (Task 03)
     ========================================================================= */

  const MOCK_OPERATIONS = [
    { id: 'JOB-4091', customer: 'Rahul Sharma', society: 'Prestige Falcon City', vehicle: 'KA-05-MB-4120', model: 'Hyundai Creta (White)', service: 'Ceramic Foam Wash', slot: 'Today, 09:30 AM', detailer: 'Vikram S. (D-04)', amount: 899, status: 'Confirmed' },
    { id: 'JOB-4092', customer: 'Priya Sundaram', society: 'Sobha Forest View', vehicle: 'KA-04-ND-9912', model: 'Honda City (Grey)', service: 'Full Interior Detail', slot: 'Today, 10:15 AM', detailer: 'Arun K. (D-02)', amount: 1699, status: 'In Progress' },
    { id: 'JOB-4093', customer: 'Amitabh Varma', society: 'Brigade Gateway', vehicle: 'KA-51-P-8834', model: 'Toyota Fortuner (Black)', service: 'Exterior Ceramic Coat', slot: 'Today, 11:00 AM', detailer: 'Rajesh M. (D-07)', amount: 2499, status: 'Confirmed' },
    { id: 'JOB-4094', customer: 'Deepa Nair', society: 'Mantri Tranquil', vehicle: 'KA-01-MJ-2033', model: 'Kia Seltos (Red)', service: 'Express Exterior Wash', slot: 'Today, 11:45 AM', detailer: 'Unassigned', amount: 599, status: 'Pending' },
    { id: 'JOB-4095', customer: 'Karthik Rao', society: 'Prestige Falcon City', vehicle: 'KA-05-MM-1029', model: 'BMW 330i (Blue)', service: 'Engine Bay & Underbody', slot: 'Today, 12:30 PM', detailer: 'Vikram S. (D-04)', amount: 1299, status: 'Confirmed' },
    { id: 'JOB-4096', customer: 'Sunita Patel', society: 'Godrej Woodsman', vehicle: 'KA-03-HA-7741', model: 'Maruti Baleno (Silver)', service: 'Standard Deep Wash', slot: 'Today, 01:15 PM', detailer: 'Sanjay T. (D-09)', amount: 799, status: 'In Progress' },
    { id: 'JOB-4097', customer: 'Naveen Reddy', society: 'Purva Skywood', vehicle: 'KA-53-Z-5502', model: 'Mahindra XUV700', service: 'Full Interior & Steam', slot: 'Today, 02:00 PM', detailer: 'Arun K. (D-02)', amount: 1899, status: 'Confirmed' },
    { id: 'JOB-4098', customer: 'Meera Deshmukh', society: 'Adarsh Palm Retreat', vehicle: 'KA-04-MK-6611', model: 'Mercedes C200', service: 'Ceramic Coating Prep', slot: 'Today, 02:45 PM', detailer: 'Rajesh M. (D-07)', amount: 3199, status: 'Confirmed' },
    { id: 'JOB-4099', customer: 'Suresh Menon', society: 'Prestige Silver Crest', vehicle: 'KA-01-EE-3344', model: 'Skoda Slavia (White)', service: 'Express Exterior Wash', slot: 'Today, 03:30 PM', detailer: 'Unassigned', amount: 599, status: 'Cancelled' },
    { id: 'JOB-4100', customer: 'Ananya Roy', society: 'Total Environment', vehicle: 'KA-05-QR-1200', model: 'Audi Q5 (Silver)', service: 'Complete Detail Package', slot: 'Today, 04:15 PM', detailer: 'Vikram S. (D-04)', amount: 2899, status: 'Confirmed' },
    { id: 'JOB-4101', customer: 'Girish Kulkarni', society: 'Brigade Meadows', vehicle: 'KA-05-NX-4411', model: 'Tata Nexon EV (Teal)', service: 'Ceramic Foam Wash', slot: 'Today, 05:00 PM', detailer: 'Sanjay T. (D-09)', amount: 899, status: 'Pending' },
    { id: 'JOB-4102', customer: 'Harish Babu', society: 'Salarpuria Sattva', vehicle: 'KA-02-MB-9090', model: 'MG Hector (Black)', service: 'Interior Steam Sanitization', slot: 'Today, 05:45 PM', detailer: 'Arun K. (D-02)', amount: 1499, status: 'Confirmed' }
  ];

  function bindTablePlayground() {
    const tableEl = document.getElementById('v2DemoTable');
    if (!tableEl) return;

    const tbodyEl = document.getElementById('v2DemoTableBody');
    const selectAllCheckbox = document.getElementById('v2DemoTableSelectAll');
    const bulkBarEl = document.getElementById('v2DemoTableBulkBar');
    const bulkCountEl = document.getElementById('v2DemoTableBulkCount');
    const clearSelectionBtn = document.getElementById('v2DemoTableClearSelectionBtn');
    const searchInput = document.getElementById('v2DemoTableSearchInput');
    const searchClearBtn = document.getElementById('v2DemoTableSearchClearBtn');
    const statusSelect = document.getElementById('v2DemoTableStatusSelect');
    const pageSizeSelect = document.getElementById('v2DemoTablePageSizeSelect');
    const paginationInfoEl = document.getElementById('v2DemoTablePaginationInfo');
    const prevPageBtn = document.getElementById('v2DemoTablePrevPageBtn');
    const nextPageBtn = document.getElementById('v2DemoTableNextPageBtn');
    const pageIndicatorEl = document.getElementById('v2DemoTablePageIndicator');
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    let selectedIds = new Set();
    let currentSort = { col: 'id', dir: 'desc' };
    let searchQuery = '';
    let statusFilter = 'ALL';
    let currentPage = 1;
    let pageSize = 5;
    let currentDensity = 'is-standard';
    let currentDisplayState = 'data'; // 'data' | 'loading' | 'empty' | 'no-results' | 'error'

    function getFilteredAndSorted() {
      let list = MOCK_OPERATIONS.filter(item => {
        if (statusFilter !== 'ALL' && item.status.toUpperCase() !== statusFilter.toUpperCase()) {
          return false;
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchId = item.id.toLowerCase().includes(q);
          const matchCust = item.customer.toLowerCase().includes(q);
          const matchSoc = item.society.toLowerCase().includes(q);
          const matchVeh = item.vehicle.toLowerCase().includes(q);
          const matchMod = item.model.toLowerCase().includes(q);
          const matchDet = item.detailer.toLowerCase().includes(q);
          if (!matchId && !matchCust && !matchSoc && !matchVeh && !matchMod && !matchDet) {
            return false;
          }
        }
        return true;
      });

      // Sort
      list.sort((a, b) => {
        let valA = a[currentSort.col];
        let valB = b[currentSort.col];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
      });

      return list;
    }

    function renderTable() {
      // 1. Loading Skeleton State
      if (currentDisplayState === 'loading') {
        let skHtml = '';
        for (let i = 0; i < pageSize; i++) {
          skHtml += `
            <tr class="cwp-v2-skeleton-row">
              <td class="cwp-v2-col-select"><div class="cwp-v2-skeleton-cell" style="width:16px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:70px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:120px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:110px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:140px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:100px;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:85px;"></div></td>
              <td class="is-numeric"><div class="cwp-v2-skeleton-cell" style="width:50px; margin-left:auto;"></div></td>
              <td><div class="cwp-v2-skeleton-cell" style="width:65px;"></div></td>
              <td class="cwp-v2-col-actions"><div class="cwp-v2-skeleton-cell" style="width:40px; margin-left:auto;"></div></td>
            </tr>
          `;
        }
        tbodyEl.innerHTML = skHtml;
        updateSelectAllState(0, 0);
        bulkBarEl.classList.remove('is-active');
        paginationInfoEl.textContent = 'Loading records...';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageIndicatorEl.textContent = '—';
        return;
      }

      // 2. Empty Dataset State
      if (currentDisplayState === 'empty') {
        tbodyEl.innerHTML = `
          <tr>
            <td colspan="10" style="padding:0;">
              <div class="cwp-v2-table-state-box">
                <span class="material-symbols-outlined cwp-v2-state-icon">inbox</span>
                <div class="cwp-v2-state-title">No Operations Recorded</div>
                <div class="cwp-v2-state-desc">There are no operational jobs or customer bookings scheduled in the current period.</div>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm" style="margin-top:8px;" id="v2DemoTableEmptyCreateBtn">
                  <span class="material-symbols-outlined">add</span>
                  <span>Create First Job</span>
                </button>
              </div>
            </td>
          </tr>
        `;
        document.getElementById('v2DemoTableEmptyCreateBtn')?.addEventListener('click', () => {
          setTableState('data');
        });
        updateSelectAllState(0, 0);
        bulkBarEl.classList.remove('is-active');
        paginationInfoEl.textContent = '0 records';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageIndicatorEl.textContent = 'Page 0 of 0';
        return;
      }

      // 3. Error State
      if (currentDisplayState === 'error') {
        tbodyEl.innerHTML = `
          <tr>
            <td colspan="10" style="padding:0;">
              <div class="cwp-v2-table-state-box">
                <span class="material-symbols-outlined cwp-v2-state-icon" style="color:var(--cwp-v2-status-danger);">error_outline</span>
                <div class="cwp-v2-state-title">Failed to Load Operations Data</div>
                <div class="cwp-v2-state-desc">A temporary network disruption occurred while synchronizing table records.</div>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" style="margin-top:8px;" id="v2DemoTableErrorRetryBtn">
                  <span class="material-symbols-outlined">refresh</span>
                  <span>Retry Connection</span>
                </button>
              </div>
            </td>
          </tr>
        `;
        document.getElementById('v2DemoTableErrorRetryBtn')?.addEventListener('click', () => {
          setTableState('data');
        });
        updateSelectAllState(0, 0);
        bulkBarEl.classList.remove('is-active');
        paginationInfoEl.textContent = 'Error';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageIndicatorEl.textContent = '—';
        return;
      }

      // 4. Data / No Results
      const filtered = getFilteredAndSorted();
      const totalCount = filtered.length;

      if (totalCount === 0) {
        tbodyEl.innerHTML = `
          <tr>
            <td colspan="10" style="padding:0;">
              <div class="cwp-v2-table-state-box">
                <span class="material-symbols-outlined cwp-v2-state-icon">search_off</span>
                <div class="cwp-v2-state-title">No Matching Records Found</div>
                <div class="cwp-v2-state-desc">No bookings match the search keyword "<strong>${escapeHtml(searchQuery)}</strong>" or selected status filter.</div>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" style="margin-top:8px;" id="v2DemoTableResetFilterBtn">
                  <span class="material-symbols-outlined">restart_alt</span>
                  <span>Reset Search &amp; Filters</span>
                </button>
              </div>
            </td>
          </tr>
        `;
        document.getElementById('v2DemoTableResetFilterBtn')?.addEventListener('click', () => {
          searchQuery = '';
          searchInput.value = '';
          statusFilter = 'ALL';
          statusSelect.value = 'ALL';
          renderTable();
        });
        updateSelectAllState(0, 0);
        bulkBarEl.classList.remove('is-active');
        paginationInfoEl.textContent = '0 of 0 records';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageIndicatorEl.textContent = 'Page 0 of 0';
        return;
      }

      const totalPages = Math.ceil(totalCount / pageSize);
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalCount);
      const pageItems = filtered.slice(startIndex, endIndex);

      let visibleSelectedCount = 0;

      let html = '';
      pageItems.forEach(item => {
        const isSelected = selectedIds.has(item.id);
        if (isSelected) visibleSelectedCount++;

        let badgeClass = 'cwp-v2-badge-info';
        if (item.status === 'Confirmed') badgeClass = 'cwp-v2-badge-success';
        else if (item.status === 'Pending') badgeClass = 'cwp-v2-badge-warning';
        else if (item.status === 'Cancelled') badgeClass = 'cwp-v2-badge-danger';
        else if (item.status === 'In Progress') badgeClass = 'cwp-v2-badge-info';

        html += `
          <tr class="${isSelected ? 'is-selected' : ''}" data-id="${item.id}">
            <td class="cwp-v2-col-select">
              <input type="checkbox" class="cwp-v2-checkbox v2-row-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} aria-label="Select row ${item.id}">
            </td>
            <td>
              <span class="cwp-v2-cell-mono">${escapeHtml(item.id)}</span>
            </td>
            <td>
              <span class="cwp-v2-cell-primary">${escapeHtml(item.customer)}</span>
              <span class="cwp-v2-cell-secondary">${escapeHtml(item.society)}</span>
            </td>
            <td>
              <span class="cwp-v2-cell-mono">${escapeHtml(item.vehicle)}</span>
              <span class="cwp-v2-cell-secondary">${escapeHtml(item.model)}</span>
            </td>
            <td>
              <span class="cwp-v2-cell-primary">${escapeHtml(item.service)}</span>
            </td>
            <td>
              <span class="cwp-v2-cell-primary">${escapeHtml(item.slot)}</span>
            </td>
            <td>
              <div class="cwp-v2-cell-flex">
                <span class="cwp-v2-cell-avatar">${escapeHtml(item.detailer.substring(0, 1))}</span>
                <span>${escapeHtml(item.detailer)}</span>
              </div>
            </td>
            <td class="is-numeric">
              <span class="cwp-v2-cell-mono" style="font-weight:600;">&#8377;${item.amount}</span>
            </td>
            <td>
              <span class="cwp-v2-badge ${badgeClass}">${escapeHtml(item.status)}</span>
            </td>
            <td class="cwp-v2-col-actions">
              <div class="cwp-v2-row-actions">
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-icon cwp-v2-btn-sm v2-row-action-btn" data-action="view" data-id="${item.id}" title="View details" aria-label="View details ${item.id}">
                  <span class="material-symbols-outlined">visibility</span>
                </button>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-icon cwp-v2-btn-sm v2-row-action-btn" data-action="call" data-id="${item.id}" title="Quick call" aria-label="Quick call ${item.customer}">
                  <span class="material-symbols-outlined">call</span>
                </button>
                <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-icon cwp-v2-btn-sm v2-row-action-btn" data-action="menu" data-id="${item.id}" title="More actions" aria-label="More actions ${item.id}">
                  <span class="material-symbols-outlined">more_vert</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      tbodyEl.innerHTML = html;

      // Update Select All Checkbox (Checked / Indeterminate / Unchecked)
      updateSelectAllState(pageItems.length, visibleSelectedCount);

      // Update Bulk Bar
      if (selectedIds.size > 0) {
        bulkBarEl.classList.add('is-active');
        bulkCountEl.textContent = `${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''} selected`;
      } else {
        bulkBarEl.classList.remove('is-active');
      }

      // Update Pagination Info
      paginationInfoEl.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalCount} records`;
      pageIndicatorEl.textContent = `Page ${currentPage} of ${totalPages}`;
      prevPageBtn.disabled = currentPage <= 1;
      nextPageBtn.disabled = currentPage >= totalPages;

      // Bind row checkboxes
      tbodyEl.querySelectorAll('.v2-row-checkbox').forEach(cb => {
        cb.addEventListener('change', function () {
          const id = this.getAttribute('data-id');
          if (this.checked) {
            selectedIds.add(id);
          } else {
            selectedIds.delete(id);
          }
          renderTable();
          if (feedbackEl) {
            feedbackEl.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">check_box</span>
              <span>Row Selection: <strong>${id}</strong> ${this.checked ? 'selected' : 'deselected'} &bull; Total selected: <strong>${selectedIds.size}</strong></span>
            `;
          }
        });
      });

      // Bind row actions
      tbodyEl.querySelectorAll('.v2-row-action-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const action = this.getAttribute('data-action');
          const id = this.getAttribute('data-id');
          if (feedbackEl) {
            feedbackEl.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">touch_app</span>
              <span>Action triggered: <strong>${escapeHtml(action)}</strong> on row <code>${escapeHtml(id)}</code> (Safe Sandbox)</span>
            `;
          }
        });
      });
    }

    function updateSelectAllState(totalVisible, selectedVisible) {
      if (!selectAllCheckbox) return;
      if (totalVisible === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = true;
      } else if (selectedVisible === totalVisible) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = false;
      } else if (selectedVisible > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.disabled = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = false;
      }
    }

    function setTableState(state) {
      currentDisplayState = state;
      renderTable();
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">view_quilt</span>
          <span>Table View State switched to: <strong>${escapeHtml(state.toUpperCase())}</strong></span>
        `;
      }
    }

    // Header Sort Event Binding
    tableEl.querySelectorAll('th.is-sortable').forEach(th => {
      th.addEventListener('click', function () {
        const col = this.getAttribute('data-sort');
        if (!col) return;

        if (currentSort.col === col) {
          currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.col = col;
          currentSort.dir = 'asc';
        }

        // Update aria-sort and indicator icons
        tableEl.querySelectorAll('th.is-sortable').forEach(otherTh => {
          const icon = otherTh.querySelector('.cwp-v2-sort-icon');
          if (otherTh === th) {
            otherTh.classList.add('is-sorted');
            otherTh.setAttribute('aria-sort', currentSort.dir === 'asc' ? 'ascending' : 'descending');
            if (icon) icon.textContent = currentSort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
          } else {
            otherTh.classList.remove('is-sorted');
            otherTh.removeAttribute('aria-sort');
            if (icon) icon.textContent = 'unfold_more';
          }
        });

        renderTable();
        if (feedbackEl) {
          feedbackEl.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">swap_vert</span>
            <span>Sorted by <strong>${escapeHtml(col)}</strong> (${currentSort.dir.toUpperCase()})</span>
          `;
        }
      });
    });

    // Select All Checkbox Handler (with Indeterminate support)
    selectAllCheckbox?.addEventListener('click', function () {
      const filtered = getFilteredAndSorted();
      const startIndex = (currentPage - 1) * pageSize;
      const pageItems = filtered.slice(startIndex, startIndex + pageSize);

      if (this.checked) {
        pageItems.forEach(item => selectedIds.add(item.id));
      } else {
        pageItems.forEach(item => selectedIds.delete(item.id));
      }
      renderTable();
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">select_all</span>
          <span>Select All: <strong>${this.checked ? 'All page rows selected' : 'All deselected'}</strong> &bull; Total active: <strong>${selectedIds.size}</strong></span>
        `;
      }
    });

    // Clear Selection
    clearSelectionBtn?.addEventListener('click', function () {
      selectedIds.clear();
      renderTable();
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-info);">clear_all</span>
          <span>Selection cleared</span>
        `;
      }
    });

    // Search Input
    searchInput?.addEventListener('input', function () {
      searchQuery = this.value.trim();
      if (searchClearBtn) {
        searchClearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
      }
      currentPage = 1;
      renderTable();
    });

    searchClearBtn?.addEventListener('click', function () {
      searchInput.value = '';
      searchQuery = '';
      this.style.display = 'none';
      searchInput.focus();
      currentPage = 1;
      renderTable();
    });

    // Status Filter
    statusSelect?.addEventListener('change', function () {
      statusFilter = this.value;
      currentPage = 1;
      renderTable();
    });

    // Page Size
    pageSizeSelect?.addEventListener('change', function () {
      pageSize = parseInt(this.value, 10) || 5;
      currentPage = 1;
      renderTable();
    });

    // Pagination Buttons
    prevPageBtn?.addEventListener('click', function () {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });

    nextPageBtn?.addEventListener('click', function () {
      const filtered = getFilteredAndSorted();
      const totalPages = Math.ceil(filtered.length / pageSize);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    });

    // Density Buttons
    document.querySelectorAll('.v2-density-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const density = this.getAttribute('data-density');
        tableEl.classList.remove('is-compact', 'is-standard', 'is-comfortable');
        tableEl.classList.add(density);
        currentDensity = density;

        document.querySelectorAll('.v2-density-btn').forEach(b => {
          const match = b === this;
          b.classList.toggle('cwp-v2-btn-primary', match);
          b.classList.toggle('cwp-v2-btn-secondary', !match);
        });

        if (feedbackEl) {
          feedbackEl.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">density_medium</span>
            <span>Density switched to: <strong>${escapeHtml(density.replace('is-', '').toUpperCase())}</strong> (${density === 'is-compact' ? '30px' : density === 'is-standard' ? '36px' : '46px'} row height)</span>
          `;
        }
      });
    });

    // Table State Switcher Buttons (Loaded / Loading / Empty / No Results / Error)
    document.querySelectorAll('.v2-table-state-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const state = this.getAttribute('data-state');
        setTableState(state);

        document.querySelectorAll('.v2-table-state-btn').forEach(b => {
          const match = b === this;
          b.classList.toggle('cwp-v2-btn-primary', match);
          b.classList.toggle('cwp-v2-btn-secondary', !match);
        });
      });
    });

    // Bulk Action Triggers (Safe Feedback)
    document.querySelectorAll('.v2-bulk-action-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const action = this.getAttribute('data-action');
        if (feedbackEl) {
          feedbackEl.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">done_all</span>
            <span>Bulk Action Executed: <strong>${escapeHtml(action)}</strong> on ${selectedIds.size} records (Safe Sandbox)</span>
          `;
        }
      });
    });

    // Initial render
    renderTable();
  }

  /* =========================================================================
     Overlay Components Playground Controller (Task 04)
     ========================================================================= */

  function bindOverlayPlayground() {
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    // Handle overlay action confirmations
    document.addEventListener('click', function (e) {
      const actionBtn = e.target.closest('[data-overlay-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-overlay-action');
      const targetOverlay = actionBtn.closest('.cwp-v2-overlay-backdrop, .cwp-v2-drawer-backdrop');

      if (feedbackEl) {
        let icon = 'check_circle';
        let color = 'var(--cwp-v2-status-success)';
        if (action.includes('Delete') || action.includes('Discard')) {
          icon = 'delete';
          color = 'var(--cwp-v2-status-danger)';
        }

        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:${color};">${icon}</span>
          <span>Overlay Action: <strong>${escapeHtml(action)}</strong> executed successfully (Safe Sandbox &bull; Closed overlay)</span>
        `;
      }

      if (targetOverlay && window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close(targetOverlay.id);
      }
    });

    // Nested overlay triggers (Opening confirmation dialog from inside a modal or drawer)
    document.querySelectorAll('[data-nested-overlay-target]').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const nestedId = this.getAttribute('data-nested-overlay-target');
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.open(nestedId, {
            backdropClose: false,
            escapeClose: true
          });
        }
      });
    });
  }

  /* =========================================================================
     Task 05: Form & Input Field Component System Interactive Handlers
     ========================================================================= */

  function bindFormPlayground() {
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    // 1. Numeric Stepper Controls
    const stepperMinus = document.getElementById('demoStepperMinus');
    const stepperPlus = document.getElementById('demoStepperPlus');
    const stepperInput = document.getElementById('demoStepperInput');

    if (stepperMinus && stepperPlus && stepperInput) {
      const min = parseInt(stepperInput.getAttribute('min') || '1', 10);
      const max = parseInt(stepperInput.getAttribute('max') || '20', 10);

      function updateStepper(delta) {
        let current = parseInt(stepperInput.value, 10);
        if (isNaN(current)) current = min;
        let next = current + delta;
        if (next < min) next = min;
        if (next > max) next = max;
        stepperInput.value = next;
        stepperMinus.disabled = (next <= min);
        stepperPlus.disabled = (next >= max);

        if (feedbackEl) {
          feedbackEl.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">tune</span>
            <span>Numeric Stepper: <strong>${next} vehicles</strong> (range: ${min}–${max})</span>
          `;
        }
      }

      stepperMinus.addEventListener('click', () => updateStepper(-1));
      stepperPlus.addEventListener('click', () => updateStepper(1));

      stepperInput.addEventListener('change', () => {
        let val = parseInt(stepperInput.value, 10);
        if (isNaN(val) || val < min) val = min;
        if (val > max) val = max;
        stepperInput.value = val;
        stepperMinus.disabled = (val <= min);
        stepperPlus.disabled = (val >= max);
      });
    }

    // 2. File Upload Dropzone & Attachment Preview
    const dropzone = document.getElementById('demoFileDropzone');
    const fileInput = document.getElementById('demoFileInput');
    const previewPill = document.getElementById('demoFilePreviewPill');
    const previewName = document.getElementById('demoFileName');
    const previewSize = document.getElementById('demoFileSize');
    const removeBtn = document.getElementById('demoFileRemoveBtn');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#demoFileRemoveBtn')) return;
        fileInput.click();
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });

      ['dragleave', 'dragend'].forEach(ev => {
        dropzone.addEventListener(ev, () => {
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileSelected(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          handleFileSelected(fileInput.files[0]);
        }
      });

      function handleFileSelected(file) {
        if (!file) return;
        const sizeKb = (file.size / 1024).toFixed(1);
        if (previewName) previewName.textContent = file.name;
        if (previewSize) previewSize.textContent = `${sizeKb} KB`;
        if (previewPill) previewPill.style.display = 'inline-flex';

        if (feedbackEl) {
          feedbackEl.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">attach_file</span>
            <span>Attached: <strong>${escapeHtml(file.name)}</strong> (${sizeKb} KB)</span>
          `;
        }
      }

      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.value = '';
          if (previewPill) previewPill.style.display = 'none';
          if (feedbackEl) {
            feedbackEl.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-on-surface-variant);">delete</span>
              <span>Attachment removed.</span>
            `;
          }
        });
      }
    }

    // 3. Form Validation Live Interactive Showcase
    const validationForm = document.getElementById('v2DemoValidationForm');
    const formAlert = document.getElementById('v2DemoFormAlert');
    const resetBtn = document.getElementById('v2DemoFormResetBtn');

    if (validationForm) {
      validationForm.addEventListener('submit', function (e) {
        e.preventDefault();
        let errors = 0;

        // Field A: Customer Name
        const nameField = document.getElementById('v2DemoFormName');
        const nameGroup = document.getElementById('v2Group_demoFormName');
        const nameErr = document.getElementById('v2Err_demoFormName');
        if (nameField && nameGroup) {
          const val = nameField.value.trim();
          if (!val || val.length < 2) {
            errors++;
            nameGroup.classList.remove('has-success');
            nameGroup.classList.add('has-error');
            if (nameErr) nameErr.textContent = 'Customer name is required (minimum 2 characters).';
          } else {
            nameGroup.classList.remove('has-error');
            nameGroup.classList.add('has-success');
            if (nameErr) nameErr.textContent = '';
          }
        }

        // Field B: Email
        const emailField = document.getElementById('v2DemoFormEmail');
        const emailGroup = document.getElementById('v2Group_demoFormEmail');
        const emailErr = document.getElementById('v2Err_demoFormEmail');
        if (emailField && emailGroup) {
          const val = emailField.value.trim();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!val || !emailRegex.test(val)) {
            errors++;
            emailGroup.classList.remove('has-success');
            emailGroup.classList.add('has-error');
            if (emailErr) emailErr.textContent = 'Enter a valid operational email address.';
          } else {
            emailGroup.classList.remove('has-error');
            emailGroup.classList.add('has-success');
            if (emailErr) emailErr.textContent = '';
          }
        }

        // Field C: Phone
        const phoneField = document.getElementById('v2DemoFormPhone');
        const phoneGroup = document.getElementById('v2Group_demoFormPhone');
        const phoneErr = document.getElementById('v2Err_demoFormPhone');
        if (phoneField && phoneGroup) {
          const val = phoneField.value.trim().replace(/\D/g, '');
          if (val.length !== 10) {
            errors++;
            phoneGroup.classList.remove('has-success');
            phoneGroup.classList.add('has-error');
            if (phoneErr) phoneErr.textContent = 'Enter a valid 10-digit mobile number.';
          } else {
            phoneGroup.classList.remove('has-error');
            phoneGroup.classList.add('has-success');
            if (phoneErr) phoneErr.textContent = '';
          }
        }

        // Field D: Service Tier Select
        const serviceSelect = document.getElementById('v2DemoFormService');
        const serviceGroup = document.getElementById('v2Group_demoFormService');
        const serviceErr = document.getElementById('v2Err_demoFormService');
        if (serviceSelect && serviceGroup) {
          const val = serviceSelect.value;
          if (!val) {
            errors++;
            serviceGroup.classList.remove('has-success');
            serviceGroup.classList.add('has-error');
            if (serviceErr) serviceErr.textContent = 'Please select a service tier.';
          } else {
            serviceGroup.classList.remove('has-error');
            serviceGroup.classList.add('has-success');
            if (serviceErr) serviceErr.textContent = '';
          }
        }

        // Field E: Service Frequency Radio Group
        const freqRadios = document.querySelectorAll('input[name="v2DemoFormFreq"]');
        const freqGroup = document.getElementById('v2Group_demoFormFreq');
        const freqErr = document.getElementById('v2Err_demoFormFreq');
        let freqChecked = false;
        freqRadios.forEach(r => { if (r.checked) freqChecked = true; });
        if (freqGroup) {
          if (!freqChecked) {
            errors++;
            freqGroup.classList.remove('has-success');
            freqGroup.classList.add('has-error');
            if (freqErr) freqErr.textContent = 'Please choose a billing frequency.';
          } else {
            freqGroup.classList.remove('has-error');
            freqGroup.classList.add('has-success');
            if (freqErr) freqErr.textContent = '';
          }
        }

        // Field F: Agreement Checkbox
        const termsCheck = document.getElementById('v2DemoFormTerms');
        const termsGroup = document.getElementById('v2Group_demoFormTerms');
        const termsErr = document.getElementById('v2Err_demoFormTerms');
        if (termsCheck && termsGroup) {
          if (!termsCheck.checked) {
            errors++;
            termsGroup.classList.remove('has-success');
            termsGroup.classList.add('has-error');
            if (termsErr) termsErr.textContent = 'You must confirm operational compliance before proceeding.';
          } else {
            termsGroup.classList.remove('has-error');
            termsGroup.classList.add('has-success');
            if (termsErr) termsErr.textContent = '';
          }
        }

        // Alert Banner Display
        if (formAlert) {
          formAlert.style.display = 'flex';
          if (errors > 0) {
            formAlert.className = 'cwp-v2-form-alert cwp-v2-form-alert-danger';
            formAlert.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:20px;">error</span>
              <div>
                <strong>Validation Incomplete (${errors} error${errors > 1 ? 's' : ''}):</strong>
                <span> Please review the flagged required fields above.</span>
              </div>
            `;
          } else {
            formAlert.className = 'cwp-v2-form-alert cwp-v2-form-alert-success';
            formAlert.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:20px;">check_circle</span>
              <div>
                <strong>All validations passed!</strong>
                <span> Safe sandbox demo: all field constraints, selectors, and controls verified successfully.</span>
              </div>
            `;
          }
        }

        if (feedbackEl) {
          feedbackEl.innerHTML = errors > 0
            ? `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-danger);">error</span><span>Form submitted with <strong>${errors} validation error(s)</strong></span>`
            : `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span><span>Form validation successful &bull; Zero errors</span>`;
        }
      });

      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          validationForm.reset();
          const groups = validationForm.querySelectorAll('.cwp-v2-field-group, .cwp-v2-choice-group');
          groups.forEach(g => {
            g.classList.remove('has-error', 'has-success');
          });
          const errs = validationForm.querySelectorAll('.cwp-v2-field-error');
          errs.forEach(e => e.textContent = '');
          if (formAlert) formAlert.style.display = 'none';

          if (feedbackEl) {
            feedbackEl.innerHTML = `
              <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-info);">restart_alt</span>
              <span>Validation form reset to default clean state</span>
            `;
          }
        });
      }
    }
  }

  /* =========================================================================
     Selection Controls, Dropdown & Filter System Controller (Task 06)
     ========================================================================= */

  const SEARCHABLE_SERVICES = [
    { id: 'dcc', name: 'Daily Car Cleaning', rate: '₹1,200/mo', icon: 'local_car_wash', cat: 'Daily Routine' },
    { id: 'foam_wash', name: 'Deep Exterior Foam Wash', rate: '₹599', icon: 'water_drop', cat: 'Wash' },
    { id: 'ceramic_pro', name: 'Ceramic Pro 9H Coating', rate: '₹14,999', icon: 'shield', cat: 'Detailing' },
    { id: 'ppf', name: 'Paint Protection Film (PPF)', rate: '₹35,000', icon: 'layers', cat: 'Protection' },
    { id: 'steam_interior', name: 'Interior Steam Sanitization', rate: '₹1,499', icon: 'sanitizer', cat: 'Interior' },
    { id: 'solar_wash', name: 'Solar Panel 10-Plate Wash', rate: '₹899', icon: 'solar_power', cat: 'Solar' },
    { id: 'engine_bay', name: 'Engine Bay Degreasing', rate: '₹699', icon: 'build', cat: 'Engine' },
    { id: 'headlight_uv', name: 'Headlight UV Restoration', rate: '₹799', icon: 'highlight', cat: 'Exterior' },
    { id: 'leather_care', name: 'Leather Conditioning & Balm', rate: '₹1,199', icon: 'airline_seat_recline_extra', cat: 'Interior' },
    { id: 'windshield_repel', name: 'Windshield Rain Repellent', rate: '₹499', icon: 'water', cat: 'Glass' },
    { id: 'underbody_rust', name: 'Underbody Anti-Rust Coating', rate: '₹2,499', icon: 'security', cat: 'Chassis' },
    { id: 'ozone_odor', name: 'Ozone Antibacterial Treatment', rate: '₹899', icon: 'air', cat: 'Sanitization' },
    { id: 'express_foam', name: 'Express Foam Wash', rate: '₹399', icon: 'speed', cat: 'Wash' },
    { id: 'commercial_fleet', name: 'Commercial Fleet Cleaning', rate: '₹4,999', icon: 'local_shipping', cat: 'Fleet' },
    { id: 'heavy_tar', name: 'Heavy Tar & Bug Removal', rate: '₹649', icon: 'cleaning_services', cat: 'Exterior' },
    { id: 'bike_ceramic', name: 'Superbike Ceramic Coat', rate: '₹3,499', icon: 'two_wheeler', cat: 'Bike' },
    { id: 'alloy_iron', name: 'Alloy Wheel De-Ironizing', rate: '₹599', icon: 'tire_repair', cat: 'Wheels' },
    { id: 'roof_lining', name: 'Roof Lining Fabric Dry Clean', rate: '₹899', icon: 'dry_cleaning', cat: 'Interior' },
    { id: 'ac_evaporator', name: 'AC Evaporator Deep Clean', rate: '₹1,099', icon: 'ac_unit', cat: 'HVAC' },
    { id: 'scratch_swirl', name: 'Scratch & Swirl Paint Correction', rate: '₹4,200', icon: 'auto_fix_high', cat: 'Paint' }
  ];

  const TASK06_OPERATIONS = [
    { id: 'JOB-501', customer: 'Rahul Sharma', society: 'Prestige Falcon City', vehicle: 'KA-05-MB-4120 (Creta)', type: 'SUV', city: 'Bengaluru', zone: 'South Zone', route: 'Route 01', service: 'Daily Car Cleaning', staff: 'Vikram S.', status: 'Confirmed', date: '2026-11-26', amount: 1200, payment: 'Paid' },
    { id: 'JOB-502', customer: 'Priya Sundaram', society: 'Sobha Forest View', vehicle: 'KA-04-ND-9912 (City)', type: 'Sedan', city: 'Bengaluru', zone: 'South Zone', route: 'Route 04', service: 'Ceramic Foam Wash', staff: 'Arun K.', status: 'In Progress', date: '2026-11-26', amount: 599, payment: 'Paid' },
    { id: 'JOB-503', customer: 'Amitabh Varma', society: 'Brigade Gateway', vehicle: 'KA-51-P-8834 (Fortuner)', type: 'SUV', city: 'Bengaluru', zone: 'North Zone', route: 'Route 02', service: 'Ceramic Coating', staff: 'Rajesh M.', status: 'Confirmed', date: '2026-11-26', amount: 14999, payment: 'Paid' },
    { id: 'JOB-504', customer: 'Deepa Nair', society: 'Mantri Tranquil', vehicle: 'KA-01-MJ-2033 (Seltos)', type: 'SUV', city: 'Bengaluru', zone: 'South Zone', route: 'Route 04', service: 'Daily Car Cleaning', staff: 'Unassigned', status: 'Pending', date: '2026-11-26', amount: 1200, payment: 'Pending' },
    { id: 'JOB-505', customer: 'Karthik Rao', society: 'Prestige Tech Vista', vehicle: 'KA-53-MM-1029 (BMW 330i)', type: 'Sedan', city: 'Bengaluru', zone: 'East Zone', route: 'Route 03', service: 'Interior Detail', staff: 'Vikram S.', status: 'Confirmed', date: '2026-11-25', amount: 1499, payment: 'Paid' },
    { id: 'JOB-506', customer: 'Sunita Patel', society: 'Godrej Woodsman', vehicle: 'KA-03-HA-7741 (Baleno)', type: 'Hatchback', city: 'Bengaluru', zone: 'North Zone', route: 'Route 02', service: 'Daily Car Cleaning', staff: 'Sanjay T.', status: 'Completed', date: '2026-11-25', amount: 1200, payment: 'Paid' },
    { id: 'JOB-507', customer: 'Naveen Reddy', society: 'Purva Skywood', vehicle: 'KA-53-Z-5502 (XUV700)', type: 'SUV', city: 'Bengaluru', zone: 'South Zone', route: 'Route 04', service: 'Ceramic Foam Wash', staff: 'Arun K.', status: 'In Progress', date: '2026-11-26', amount: 599, payment: 'Pending' },
    { id: 'JOB-508', customer: 'Meera Deshmukh', society: 'Adarsh Palm Retreat', vehicle: 'KA-04-MK-6611 (C200)', type: 'Sedan', city: 'Bengaluru', zone: 'East Zone', route: 'Route 03', service: 'Ceramic Coating', staff: 'Rajesh M.', status: 'Confirmed', date: '2026-11-24', amount: 14999, payment: 'Paid' },
    { id: 'JOB-509', customer: 'Suresh Menon', society: 'Prestige Silver Crest', vehicle: 'KA-01-EE-3344 (Slavia)', type: 'Sedan', city: 'Bengaluru', zone: 'East Zone', route: 'Route 03', service: 'Daily Car Cleaning', staff: 'Unassigned', status: 'Cancelled', date: '2026-11-23', amount: 1200, payment: 'Overdue' },
    { id: 'JOB-510', customer: 'Ananya Roy', society: 'Total Environment', vehicle: 'KA-05-QR-1200 (Audi Q5)', type: 'SUV', city: 'Bengaluru', zone: 'South Zone', route: 'Route 01', service: 'Interior Detail', staff: 'Vikram S.', status: 'Confirmed', date: '2026-11-26', amount: 1499, payment: 'Paid' },
    { id: 'JOB-511', customer: 'Girish Kulkarni', society: 'Brigade Meadows', vehicle: 'KA-05-NX-4411 (Nexon EV)', type: 'EV', city: 'Bengaluru', zone: 'South Zone', route: 'Route 01', service: 'Solar Panel Clean', staff: 'Sanjay T.', status: 'Pending', date: '2026-11-26', amount: 899, payment: 'Pending' },
    { id: 'JOB-512', customer: 'Harish Babu', society: 'Salarpuria Sattva', vehicle: 'KA-02-MB-9090 (Hector)', type: 'SUV', city: 'Bengaluru', zone: 'West Zone', route: 'Route 05', service: 'Daily Car Cleaning', staff: 'Arun K.', status: 'Completed', date: '2026-11-22', amount: 1200, payment: 'Paid' },
    { id: 'JOB-513', customer: 'Chethan Gowda', society: 'Trendz Whispering Winds', vehicle: 'KA-09-MA-1011 (Innova)', type: 'SUV', city: 'Mysuru', zone: 'South Zone', route: 'Route 01', service: 'Ceramic Foam Wash', staff: 'Vikram S.', status: 'Confirmed', date: '2026-11-26', amount: 599, payment: 'Paid' },
    { id: 'JOB-514', customer: 'Roshan Pinto', society: 'Marian Park', vehicle: 'KA-19-MC-4455 (Fortuner)', type: 'SUV', city: 'Mangaluru', zone: 'West Zone', route: 'Route 02', service: 'Daily Car Cleaning', staff: 'Rajesh M.', status: 'Completed', date: '2026-11-20', amount: 1200, payment: 'Paid' }
  ];

  function bindSelectionPlayground() {
    const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');

    function setClickFeedback(icon, html) {
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">${icon}</span>
          <span>${html}</span>
        `;
      }
    }

    // Universal Dropdown Close Handler
    function closeAllDropdowns(exceptEl) {
      document.querySelectorAll('#v2-sec-selection .cwp-v2-dropdown.is-open').forEach(dd => {
        if (exceptEl && (dd === exceptEl || dd.contains(exceptEl))) return;
        dd.classList.remove('is-open');
        const trigger = dd.querySelector('.cwp-v2-dropdown-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#v2-sec-selection .cwp-v2-dropdown')) {
        closeAllDropdowns();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllDropdowns();
      }
    });

    /* ---------------------------------------------------------------------
       6.1 Standard Select Dropdowns
       --------------------------------------------------------------------- */
    // Standard 36px Select
    const stdDropdown = document.getElementById('v2DemoStandardSelectDropdown');
    const stdTrigger = document.getElementById('v2DemoStandardSelectTrigger');
    const stdDisplay = document.getElementById('v2DemoStandardSelectDisplay');
    if (stdDropdown && stdTrigger) {
      stdTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = stdDropdown.classList.contains('is-open');
        closeAllDropdowns(stdDropdown);
        stdDropdown.classList.toggle('is-open', !isOpen);
        stdTrigger.setAttribute('aria-expanded', !isOpen);
      });

      stdDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          stdDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(i => i.classList.remove('is-selected'));
          item.classList.add('is-selected');
          const text = item.querySelector('.cwp-v2-dropdown-item-content span:last-child').textContent.trim();
          const icon = item.querySelector('.cwp-v2-dropdown-item-icon').textContent.trim();
          if (stdDisplay) {
            stdDisplay.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">${icon}</span><span>${escapeHtml(text)}</span>`;
          }
          stdDropdown.classList.remove('is-open');
          stdTrigger.setAttribute('aria-expanded', 'false');
          setClickFeedback('check_circle', `Service selected: <strong>${escapeHtml(text)}</strong> (36px Standard Dropdown)`);
        });
      });
    }

    // Compact 28px Select
    const compDropdown = document.getElementById('v2DemoCompactSelectDropdown');
    const compTrigger = document.getElementById('v2DemoCompactSelectTrigger');
    const compDisplay = document.getElementById('v2DemoCompactSelectDisplay');
    if (compDropdown && compTrigger) {
      compTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = compDropdown.classList.contains('is-open');
        closeAllDropdowns(compDropdown);
        compDropdown.classList.toggle('is-open', !isOpen);
        compTrigger.setAttribute('aria-expanded', !isOpen);
      });

      compDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          compDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(i => i.classList.remove('is-selected'));
          item.classList.add('is-selected');
          const text = item.querySelector('.cwp-v2-dropdown-item-content span:last-child').textContent.trim();
          if (compDisplay) {
            compDisplay.innerHTML = `<span>${escapeHtml(text)}</span>`;
          }
          compDropdown.classList.remove('is-open');
          compTrigger.setAttribute('aria-expanded', 'false');
          setClickFeedback('check_circle', `Route assigned: <strong>${escapeHtml(text)}</strong> (28px Compact Dropdown)`);
        });
      });
    }

    // Error State Select
    const errDropdown = document.getElementById('v2DemoErrorSelectDropdown');
    const errTrigger = document.getElementById('v2DemoErrorSelectTrigger');
    const errDisplay = document.getElementById('v2DemoErrorSelectDisplay');
    const errMsg = document.getElementById('v2DemoErrorSelectMsg');
    if (errDropdown && errTrigger) {
      errTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = errDropdown.classList.contains('is-open');
        closeAllDropdowns(errDropdown);
        errDropdown.classList.toggle('is-open', !isOpen);
        errTrigger.setAttribute('aria-expanded', !isOpen);
      });

      errDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          errDropdown.classList.remove('has-error');
          errDropdown.querySelectorAll('.cwp-v2-dropdown-item').forEach(i => i.classList.remove('is-selected'));
          item.classList.add('is-selected');
          const text = item.querySelector('.cwp-v2-dropdown-item-content span:last-child').textContent.trim();
          if (errDisplay) {
            errDisplay.innerHTML = `<span>${escapeHtml(text)}</span>`;
          }
          if (errMsg && errMsg.parentElement) {
            errMsg.parentElement.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px; color:var(--cwp-v2-status-success);">check_circle</span><span style="color:var(--cwp-v2-status-success); font-size:11.5px;">Account entity verified. Error cleared.</span>`;
          }
          errDropdown.classList.remove('is-open');
          errTrigger.setAttribute('aria-expanded', 'false');
          setClickFeedback('check_circle', `Billing entity selected: <strong>${escapeHtml(text)}</strong> (Error state cleared)`);
        });
      });
    }

    /* ---------------------------------------------------------------------
       6.2 Searchable Dropdown & Keyboard Navigation
       --------------------------------------------------------------------- */
    const searchDropdown = document.getElementById('v2DemoSearchableDropdown');
    const searchTrigger = document.getElementById('v2DemoSearchableTrigger');
    const searchDisplay = document.getElementById('v2DemoSearchableDisplay');
    const searchClearBtn = document.getElementById('v2DemoSearchableClearBtn');
    const searchInput = document.getElementById('v2DemoSearchableInput');
    const searchInputClear = document.getElementById('v2DemoSearchableInputClear');
    const searchList = document.getElementById('v2DemoSearchableList');
    const searchNoMatch = document.getElementById('v2DemoSearchableNoMatch');
    const searchKeySpan = document.getElementById('v2SearchableSelectedKey');
    const searchNameSpan = document.getElementById('v2SearchableSelectedName');
    const searchRateSpan = document.getElementById('v2SearchableSelectedRate');
    const searchFocusSpan = document.getElementById('v2SearchableFocusIndex');

    let currentHighlightedIndex = -1;
    let selectedService = null;

    function renderSearchableList(query = '') {
      if (!searchList) return;
      const q = query.trim().toLowerCase();
      searchList.innerHTML = '';

      const filtered = SEARCHABLE_SERVICES.filter(s => {
        return !q || s.name.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        if (searchNoMatch) {
          searchNoMatch.style.display = 'block';
          const querySpan = searchNoMatch.querySelector('span:last-child');
          if (querySpan) querySpan.textContent = query;
        }
      } else {
        if (searchNoMatch) searchNoMatch.style.display = 'none';

        filtered.forEach((service, idx) => {
          const isSelected = selectedService && selectedService.id === service.id;
          const li = document.createElement('li');
          li.className = `cwp-v2-dropdown-item${isSelected ? ' is-selected' : ''}`;
          li.setAttribute('role', 'option');
          li.setAttribute('data-id', service.id);
          li.setAttribute('data-index', idx);
          li.innerHTML = `
            <span class="cwp-v2-dropdown-item-content">
              <span class="material-symbols-outlined cwp-v2-dropdown-item-icon">${service.icon}</span>
              <span>${escapeHtml(service.name)}</span>
              <span class="cwp-v2-dropdown-item-subtext">&bull; ${escapeHtml(service.cat)}</span>
            </span>
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:11px; font-weight:600; color:var(--cwp-v2-sys-primary);">${service.rate}</span>
              <span class="material-symbols-outlined cwp-v2-dropdown-item-check">check</span>
            </div>
          `;

          li.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSearchableItem(service);
          });

          li.addEventListener('mouseenter', () => {
            setSearchableHighlight(idx);
          });

          searchList.appendChild(li);
        });
      }

      currentHighlightedIndex = -1;
      updateSearchFocusIndexDisplay();
    }

    function selectSearchableItem(service) {
      selectedService = service;
      if (searchDisplay) {
        searchDisplay.innerHTML = `
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">${service.icon}</span>
          <span style="font-weight:600;">${escapeHtml(service.name)}</span>
          <span style="color:var(--cwp-v2-sys-on-surface-muted); font-size:11.5px;">(${service.rate})</span>
        `;
      }
      if (searchDropdown) {
        searchDropdown.classList.add('has-selection');
        searchDropdown.classList.remove('is-open');
      }
      if (searchTrigger) searchTrigger.setAttribute('aria-expanded', 'false');

      // Update telemetry
      if (searchKeySpan) searchKeySpan.textContent = service.id;
      if (searchNameSpan) searchNameSpan.textContent = service.name;
      if (searchRateSpan) searchRateSpan.textContent = service.rate;

      setClickFeedback('check_circle', `Searchable selection: <strong>${escapeHtml(service.name)}</strong> (${service.rate})`);
    }

    function clearSearchableSelection() {
      selectedService = null;
      if (searchDisplay) {
        searchDisplay.innerHTML = `<span class="cwp-v2-dropdown-placeholder">Search and select service...</span>`;
      }
      if (searchDropdown) {
        searchDropdown.classList.remove('has-selection');
      }
      if (searchKeySpan) searchKeySpan.textContent = 'none';
      if (searchNameSpan) searchNameSpan.textContent = 'No option selected';
      if (searchRateSpan) searchRateSpan.textContent = '--';
      if (searchFocusSpan) searchFocusSpan.textContent = 'Inactive';
      renderSearchableList('');
      setClickFeedback('info', 'Searchable selection cleared');
    }

    function setSearchableHighlight(index) {
      if (!searchList) return;
      const items = searchList.querySelectorAll('.cwp-v2-dropdown-item');
      items.forEach((item, idx) => {
        item.classList.toggle('is-highlighted', idx === index);
      });
      currentHighlightedIndex = index;
      updateSearchFocusIndexDisplay();

      if (index >= 0 && items[index]) {
        items[index].scrollIntoView({ block: 'nearest' });
      }
    }

    function updateSearchFocusIndexDisplay() {
      if (searchFocusSpan) {
        searchFocusSpan.textContent = currentHighlightedIndex >= 0
          ? `Index ${currentHighlightedIndex}`
          : 'None';
      }
    }

    if (searchDropdown && searchTrigger) {
      renderSearchableList();

      searchTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = searchDropdown.classList.contains('is-open');
        closeAllDropdowns(searchDropdown);
        searchDropdown.classList.toggle('is-open', !isOpen);
        searchTrigger.setAttribute('aria-expanded', !isOpen);

        if (!isOpen && searchInput) {
          setTimeout(() => {
            searchInput.focus();
            searchInput.select();
          }, 50);
        }
      });

      if (searchClearBtn) {
        searchClearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearSearchableSelection();
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value;
          if (searchInputClear) searchInputClear.style.display = q ? 'inline-flex' : 'none';
          renderSearchableList(q);
        });

        searchInput.addEventListener('keydown', (e) => {
          const items = searchList ? searchList.querySelectorAll('.cwp-v2-dropdown-item') : [];
          if (!items.length) return;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = currentHighlightedIndex < items.length - 1 ? currentHighlightedIndex + 1 : 0;
            setSearchableHighlight(nextIdx);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIdx = currentHighlightedIndex > 0 ? currentHighlightedIndex - 1 : items.length - 1;
            setSearchableHighlight(prevIdx);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentHighlightedIndex >= 0 && items[currentHighlightedIndex]) {
              const id = items[currentHighlightedIndex].getAttribute('data-id');
              const found = SEARCHABLE_SERVICES.find(s => s.id === id);
              if (found) {
                selectSearchableItem(found);
                searchTrigger.focus();
              }
            }
          } else if (e.key === 'Escape') {
            searchDropdown.classList.remove('is-open');
            searchTrigger.setAttribute('aria-expanded', 'false');
            searchTrigger.focus();
          }
        });
      }

      if (searchInputClear) {
        searchInputClear.addEventListener('click', () => {
          if (searchInput) {
            searchInput.value = '';
            searchInputClear.style.display = 'none';
            searchInput.focus();
            renderSearchableList('');
          }
        });
      }

      // Presets
      const presetBtn1 = document.getElementById('v2SearchablePresetBtn1');
      if (presetBtn1) {
        presetBtn1.addEventListener('click', () => {
          const found = SEARCHABLE_SERVICES.find(s => s.id === 'ceramic_pro');
          if (found) selectSearchableItem(found);
        });
      }

      const presetReset = document.getElementById('v2SearchablePresetReset');
      if (presetReset) {
        presetReset.addEventListener('click', () => {
          clearSearchableSelection();
        });
      }
    }

    /* ---------------------------------------------------------------------
       6.3 Multi-Select Dropdown with Compact Chips
       --------------------------------------------------------------------- */
    const multiDropdown = document.getElementById('v2DemoMultiSelectDropdown');
    const multiTrigger = document.getElementById('v2DemoMultiSelectTrigger');
    const multiDisplay = document.getElementById('v2DemoMultiSelectDisplay');
    const multiCountBadge = document.getElementById('v2DemoMultiCountBadge');
    const multiSearchInput = document.getElementById('v2DemoMultiSearchInput');
    const multiSearchClear = document.getElementById('v2DemoMultiSearchClear');
    const multiList = document.getElementById('v2DemoMultiList');
    const multiSelectAllBtn = document.getElementById('v2DemoMultiSelectAllBtn');
    const multiClearAllBtn = document.getElementById('v2DemoMultiClearAllBtn');
    const multiCountDisplay = document.getElementById('v2MultiSelectedCountDisplay');
    const multiActiveChipsList = document.getElementById('v2MultiActiveChipsList');

    let selectedZones = new Set(['south', 'east']);

    const ZONE_DEFINITIONS = [
      { id: 'south', name: 'South Zone (Koramangala)' },
      { id: 'east', name: 'East Zone (Indiranagar)' },
      { id: 'north', name: 'North Zone (Hebbal)' },
      { id: 'west', name: 'West Zone (Rajajinagar)' },
      { id: 'central', name: 'Central Zone (CBD)' },
      { id: 'ecity', name: 'Electronic City Hub' },
      { id: 'rural', name: 'Kanakapura Corridor', disabled: true }
    ];

    function updateMultiSelectDisplay() {
      if (!multiDisplay) return;

      const activeZones = ZONE_DEFINITIONS.filter(z => selectedZones.has(z.id));
      const count = activeZones.length;

      // Update Trigger Display
      if (count === 0) {
        multiDisplay.innerHTML = `<span class="cwp-v2-dropdown-placeholder">Select operational zones...</span>`;
        if (multiCountBadge) multiCountBadge.style.display = 'none';
      } else {
        let chipsHtml = '<div class="cwp-v2-multi-select-chips">';
        // Render up to 2 chips
        const visibleChips = activeZones.slice(0, 2);
        visibleChips.forEach(z => {
          chipsHtml += `
            <span class="cwp-v2-select-chip" title="${escapeHtml(z.name)}">
              <span>${escapeHtml(z.name.split(' ')[0] + ' ' + z.name.split(' ')[1])}</span>
              <button type="button" class="cwp-v2-select-chip-remove" data-remove-zone="${z.id}" title="Remove zone">&times;</button>
            </span>
          `;
        });

        // Overflow badge if more than 2
        if (count > 2) {
          chipsHtml += `<span class="cwp-v2-select-chip-overflow">+${count - 2} more</span>`;
        }
        chipsHtml += '</div>';
        multiDisplay.innerHTML = chipsHtml;

        if (multiCountBadge) {
          multiCountBadge.style.display = 'inline-flex';
          multiCountBadge.textContent = `${count} Selected`;
        }
      }

      // Update List Options Checkboxes
      if (multiList) {
        multiList.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
          const id = item.getAttribute('data-id');
          item.classList.toggle('is-selected', selectedZones.has(id));
        });
      }

      // Update Mirror Panel
      if (multiCountDisplay) {
        multiCountDisplay.textContent = `${count} Active`;
      }
      if (multiActiveChipsList) {
        if (count === 0) {
          multiActiveChipsList.innerHTML = `<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">No zones currently selected</span>`;
        } else {
          let mirrorHtml = '';
          activeZones.forEach(z => {
            mirrorHtml += `
              <span class="cwp-v2-filter-chip is-active cwp-v2-filter-chip-sm">
                <span>${escapeHtml(z.name)}</span>
                <button type="button" class="cwp-v2-chip-remove-btn" data-remove-zone="${z.id}" title="Remove">&times;</button>
              </span>
            `;
          });
          multiActiveChipsList.innerHTML = mirrorHtml;
        }
      }

      // Bind individual chip remove buttons
      document.querySelectorAll('[data-remove-zone]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const zoneId = btn.getAttribute('data-remove-zone');
          selectedZones.delete(zoneId);
          updateMultiSelectDisplay();
          setClickFeedback('info', `Zone removed from multi-select: <strong>${zoneId}</strong>`);
        };
      });
    }

    if (multiDropdown && multiTrigger) {
      updateMultiSelectDisplay();

      multiTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = multiDropdown.classList.contains('is-open');
        closeAllDropdowns(multiDropdown);
        multiDropdown.classList.toggle('is-open', !isOpen);
        multiTrigger.setAttribute('aria-expanded', !isOpen);

        if (!isOpen && multiSearchInput) {
          setTimeout(() => multiSearchInput.focus(), 50);
        }
      });

      if (multiList) {
        multiList.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.classList.contains('is-disabled')) return;
            const id = item.getAttribute('data-id');
            if (selectedZones.has(id)) {
              selectedZones.delete(id);
            } else {
              selectedZones.add(id);
            }
            updateMultiSelectDisplay();
            setClickFeedback('check_circle', `Zone toggle: <strong>${id}</strong> (${selectedZones.has(id) ? 'Selected' : 'Deselected'})`);
          });
        });
      }

      if (multiSelectAllBtn) {
        multiSelectAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ZONE_DEFINITIONS.filter(z => !z.disabled).forEach(z => selectedZones.add(z.id));
          updateMultiSelectDisplay();
          setClickFeedback('check_circle', 'All active zones selected');
        });
      }

      if (multiClearAllBtn) {
        multiClearAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedZones.clear();
          updateMultiSelectDisplay();
          setClickFeedback('info', 'All zones cleared from multi-select');
        });
      }

      if (multiSearchInput) {
        multiSearchInput.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          if (multiSearchClear) multiSearchClear.style.display = q ? 'inline-flex' : 'none';
          if (multiList) {
            multiList.querySelectorAll('.cwp-v2-dropdown-item').forEach(item => {
              const label = (item.getAttribute('data-label') || '').toLowerCase();
              item.style.display = !q || label.includes(q) ? 'flex' : 'none';
            });
          }
        });
      }

      if (multiSearchClear) {
        multiSearchClear.addEventListener('click', () => {
          if (multiSearchInput) {
            multiSearchInput.value = '';
            multiSearchClear.style.display = 'none';
            multiSearchInput.focus();
            if (multiList) {
              multiList.querySelectorAll('.cwp-v2-dropdown-item').forEach(i => i.style.display = 'flex');
            }
          }
        });
      }
    }

    /* ---------------------------------------------------------------------
       6.4 Filter Chips System
       --------------------------------------------------------------------- */
    const chipsCluster = document.getElementById('v2DemoChipsCluster');
    const chipsSummary = document.getElementById('v2DemoActiveChipsSummary');
    const resetChipsBtn = document.getElementById('v2DemoResetChipsBtn');
    const removableChip = document.getElementById('v2DemoRemovableChip');
    const removableChipClose = document.getElementById('v2DemoRemovableChipClose');

    function updateChipsSummary() {
      if (!chipsCluster || !chipsSummary) return;
      const activeChips = [];
      chipsCluster.querySelectorAll('.cwp-v2-filter-chip.is-active').forEach(chip => {
        const span = chip.querySelector('span:not(.material-symbols-outlined):not(.cwp-v2-chip-count)');
        const countSpan = chip.querySelector('.cwp-v2-chip-count');
        const text = span ? span.textContent.trim() : '';
        const count = countSpan ? ` (${countSpan.textContent.trim()})` : '';
        if (text) activeChips.push(text + count);
      });
      chipsSummary.textContent = activeChips.length > 0 ? activeChips.join(', ') : 'No filter chips currently active';
    }

    if (chipsCluster) {
      chipsCluster.querySelectorAll('.cwp-v2-filter-chip:not(.is-disabled)').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.closest('.cwp-v2-chip-remove-btn')) return;
          chip.classList.toggle('is-active');
          updateChipsSummary();
          const name = chip.querySelector('span:not(.material-symbols-outlined)')?.textContent || 'Chip';
          setClickFeedback('tune', `Filter chip toggled: <strong>${escapeHtml(name)}</strong> (${chip.classList.contains('is-active') ? 'Active' : 'Inactive'})`);
        });
      });

      if (removableChipClose && removableChip) {
        removableChipClose.addEventListener('click', (e) => {
          e.stopPropagation();
          removableChip.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
          removableChip.style.opacity = '0';
          removableChip.style.transform = 'scale(0.8)';
          setTimeout(() => {
            removableChip.remove();
            updateChipsSummary();
            setClickFeedback('info', 'Removable filter chip dismissed');
          }, 200);
        });
      }

      if (resetChipsBtn) {
        resetChipsBtn.addEventListener('click', () => {
          chipsCluster.querySelectorAll('.cwp-v2-filter-chip').forEach(chip => {
            const type = chip.getAttribute('data-chip');
            if (['today', 'all-routes', 'unassigned', 'active-staff'].includes(type)) {
              chip.classList.add('is-active');
            } else {
              chip.classList.remove('is-active');
            }
          });
          updateChipsSummary();
          setClickFeedback('restart_alt', 'Filter chips reset to default state');
        });
      }
    }

    /* ---------------------------------------------------------------------
       6.5 Operational Filter Bar & Data Table
       --------------------------------------------------------------------- */
    const opSearchInput = document.getElementById('v2OpSearchInput');
    const opSearchClear = document.getElementById('v2OpSearchClearBtn');
    const opCitySelect = document.getElementById('v2OpCitySelect');
    const opZoneSelect = document.getElementById('v2OpZoneSelect');
    const opRouteSelect = document.getElementById('v2OpRouteSelect');
    const opServiceSelect = document.getElementById('v2OpServiceSelect');
    const opStatusSelect = document.getElementById('v2OpStatusSelect');
    const opDateSelect = document.getElementById('v2OpDateSelect');
    const opStaffSelect = document.getElementById('v2OpStaffSelect');
    const opVehicleSelect = document.getElementById('v2OpVehicleSelect');
    const opPaymentSelect = document.getElementById('v2OpPaymentSelect');
    const opClearFiltersBtn = document.getElementById('v2OpClearFiltersBtn');
    const opMoreFiltersBtn = document.getElementById('v2OpMoreFiltersBtn');
    const opFilterDrawer = document.getElementById('v2OpFilterDrawer');
    const opExtraCount = document.getElementById('v2OpExtraFilterCount');
    const opTableBody = document.getElementById('v2OpTableBody');
    const opTableEmpty = document.getElementById('v2OpTableEmptyState');
    const opRecordCount = document.getElementById('v2OpTableRecordCount');
    const opStatusNote = document.getElementById('v2OpTableFilterStatusNote');
    const opSummaryBar = document.getElementById('v2OpSummaryBar');
    const opActiveCountLabel = document.getElementById('v2OpActiveCountLabel');
    const opTagsContainer = document.getElementById('v2OpFilterTagsContainer');
    const opResetAllSummaryBtn = document.getElementById('v2OpResetAllSummaryBtn');
    const opEmptyResetBtn = document.getElementById('v2OpEmptyResetBtn');

    let opFilters = {
      search: '',
      city: 'ALL',
      zone: 'ALL',
      route: 'ALL',
      service: 'ALL',
      status: 'ALL',
      date: 'ALL',
      staff: 'ALL',
      vehicle: 'ALL',
      payment: 'ALL'
    };

    function renderOpTable() {
      if (!opTableBody) return;

      const filtered = TASK06_OPERATIONS.filter(item => {
        // Search query
        if (opFilters.search) {
          const q = opFilters.search.toLowerCase();
          const matchCust = item.customer.toLowerCase().includes(q);
          const matchSoc = item.society.toLowerCase().includes(q);
          const matchVeh = item.vehicle.toLowerCase().includes(q);
          const matchId = item.id.toLowerCase().includes(q);
          const matchRoute = item.route.toLowerCase().includes(q);
          if (!matchCust && !matchSoc && !matchVeh && !matchId && !matchRoute) return false;
        }

        // City
        if (opFilters.city !== 'ALL' && item.city !== opFilters.city) return false;
        // Zone
        if (opFilters.zone !== 'ALL' && item.zone !== opFilters.zone) return false;
        // Route
        if (opFilters.route !== 'ALL' && item.route !== opFilters.route) return false;
        // Service
        if (opFilters.service !== 'ALL' && item.service !== opFilters.service) return false;
        // Status
        if (opFilters.status !== 'ALL' && item.status !== opFilters.status) return false;
        // Staff
        if (opFilters.staff !== 'ALL' && item.staff !== opFilters.staff) return false;
        // Vehicle
        if (opFilters.vehicle !== 'ALL' && item.type !== opFilters.vehicle) return false;
        // Payment
        if (opFilters.payment !== 'ALL' && item.payment !== opFilters.payment) return false;

        // Date Preset
        if (opFilters.date === 'today' && item.date !== '2026-11-26') return false;
        if (opFilters.date === 'yesterday' && item.date !== '2026-11-25') return false;
        if (opFilters.date === 'last7' && (item.date < '2026-11-19' || item.date > '2026-11-26')) return false;
        if (opFilters.date === 'thismonth' && (item.date < '2026-11-01' || item.date > '2026-11-30')) return false;

        return true;
      });

      // Update Counts
      const total = TASK06_OPERATIONS.length;
      const count = filtered.length;
      if (opRecordCount) {
        opRecordCount.textContent = `Showing ${count} of ${total} records`;
      }

      // Update Selection Summary Bar
      updateOpSummaryBar();

      // Check Empty State
      if (count === 0) {
        opTableBody.innerHTML = '';
        if (opTableEmpty) opTableEmpty.style.display = 'flex';
        return;
      }

      if (opTableEmpty) opTableEmpty.style.display = 'none';

      // Render Rows
      let html = '';
      filtered.forEach(row => {
        let badgeClass = 'cwp-v2-badge-info';
        if (row.status === 'Completed') badgeClass = 'cwp-v2-badge-success';
        else if (row.status === 'In Progress') badgeClass = 'cwp-v2-badge-warning';
        else if (row.status === 'Pending') badgeClass = 'cwp-v2-badge-warning';
        else if (row.status === 'Cancelled') badgeClass = 'cwp-v2-badge-danger';

        html += `
          <tr>
            <td><code style="font-size:11.5px; font-weight:600; color:var(--cwp-v2-sys-primary);">${row.id}</code></td>
            <td>
              <div style="font-weight:600; color:var(--cwp-v2-sys-on-surface); font-size:12.5px;">${escapeHtml(row.customer)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted);">${escapeHtml(row.society)}</div>
            </td>
            <td>
              <div style="font-family:var(--cwp-v2-font-mono); font-size:11.5px;">${escapeHtml(row.vehicle.split(' ')[0])}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(row.vehicle.replace(/^[^\s]+\s*/, ''))}</div>
            </td>
            <td>
              <div style="font-size:12px; font-weight:500;">${escapeHtml(row.city)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted);">${escapeHtml(row.zone)}</div>
            </td>
            <td><span class="cwp-v2-badge cwp-v2-badge-neutral" style="font-size:11px;">${escapeHtml(row.route)}</span></td>
            <td><span style="font-size:12px; font-weight:500;">${escapeHtml(row.service)}</span></td>
            <td>
              <span style="font-size:12px; color:${row.staff === 'Unassigned' ? 'var(--cwp-v2-status-danger)' : 'var(--cwp-v2-sys-on-surface)'}; font-weight:${row.staff === 'Unassigned' ? '600' : '400'};">
                ${escapeHtml(row.staff)}
              </span>
            </td>
            <td><span class="cwp-v2-badge ${badgeClass}" style="font-size:11px;">${escapeHtml(row.status)}</span></td>
            <td><span style="font-family:var(--cwp-v2-font-mono); font-size:11.5px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(row.date)}</span></td>
            <td style="text-align:right; font-weight:600; font-family:var(--cwp-v2-font-mono); font-size:12px;">₹${row.amount.toLocaleString('en-IN')}</td>
          </tr>
        `;
      });

      opTableBody.innerHTML = html;
    }

    function updateOpSummaryBar() {
      if (!opSummaryBar || !opTagsContainer) return;

      const activeTags = [];

      if (opFilters.search) {
        activeTags.push({ key: 'search', label: `Search: "${opFilters.search}"` });
      }
      if (opFilters.city !== 'ALL') {
        activeTags.push({ key: 'city', label: `City: ${opFilters.city}` });
      }
      if (opFilters.zone !== 'ALL') {
        activeTags.push({ key: 'zone', label: `Zone: ${opFilters.zone}` });
      }
      if (opFilters.route !== 'ALL') {
        activeTags.push({ key: 'route', label: `Route: ${opFilters.route}` });
      }
      if (opFilters.service !== 'ALL') {
        activeTags.push({ key: 'service', label: `Service: ${opFilters.service}` });
      }
      if (opFilters.status !== 'ALL') {
        activeTags.push({ key: 'status', label: `Status: ${opFilters.status}` });
      }
      if (opFilters.date !== 'ALL') {
        activeTags.push({ key: 'date', label: `Date: ${opFilters.date.toUpperCase()}` });
      }
      if (opFilters.staff !== 'ALL') {
        activeTags.push({ key: 'staff', label: `Staff: ${opFilters.staff}` });
      }
      if (opFilters.vehicle !== 'ALL') {
        activeTags.push({ key: 'vehicle', label: `Vehicle: ${opFilters.vehicle}` });
      }
      if (opFilters.payment !== 'ALL') {
        activeTags.push({ key: 'payment', label: `Payment: ${opFilters.payment}` });
      }

      // Check extra filters in drawer
      let extraCount = 0;
      if (opFilters.staff !== 'ALL') extraCount++;
      if (opFilters.vehicle !== 'ALL') extraCount++;
      if (opFilters.payment !== 'ALL') extraCount++;

      if (opExtraCount) {
        if (extraCount > 0) {
          opExtraCount.style.display = 'inline-flex';
          opExtraCount.textContent = extraCount;
        } else {
          opExtraCount.style.display = 'none';
        }
      }

      if (activeTags.length === 0) {
        opSummaryBar.style.display = 'none';
        if (opStatusNote) opStatusNote.textContent = '(Unfiltered)';
      } else {
        opSummaryBar.style.display = 'flex';
        if (opActiveCountLabel) {
          opActiveCountLabel.textContent = `${activeTags.length} Filter${activeTags.length > 1 ? 's' : ''} Applied:`;
        }
        if (opStatusNote) opStatusNote.textContent = `(${activeTags.length} active filters)`;

        let tagsHtml = '';
        activeTags.forEach(t => {
          tagsHtml += `
            <span class="cwp-v2-active-filter-tag">
              <span>${escapeHtml(t.label)}</span>
              <button type="button" class="cwp-v2-active-filter-tag-remove" data-clear-filter="${t.key}" title="Remove filter">&times;</button>
            </span>
          `;
        });
        opTagsContainer.innerHTML = tagsHtml;

        opTagsContainer.querySelectorAll('[data-clear-filter]').forEach(btn => {
          btn.onclick = () => {
            const key = btn.getAttribute('data-clear-filter');
            resetSingleOpFilter(key);
          };
        });
      }
    }

    function resetSingleOpFilter(key) {
      if (key === 'search') {
        opFilters.search = '';
        if (opSearchInput) opSearchInput.value = '';
        if (opSearchClear) opSearchClear.style.display = 'none';
      } else if (key === 'city') {
        opFilters.city = 'ALL';
        if (opCitySelect) opCitySelect.value = 'ALL';
      } else if (key === 'zone') {
        opFilters.zone = 'ALL';
        if (opZoneSelect) opZoneSelect.value = 'ALL';
      } else if (key === 'route') {
        opFilters.route = 'ALL';
        if (opRouteSelect) opRouteSelect.value = 'ALL';
      } else if (key === 'service') {
        opFilters.service = 'ALL';
        if (opServiceSelect) opServiceSelect.value = 'ALL';
      } else if (key === 'status') {
        opFilters.status = 'ALL';
        if (opStatusSelect) opStatusSelect.value = 'ALL';
      } else if (key === 'date') {
        opFilters.date = 'ALL';
        if (opDateSelect) opDateSelect.value = 'ALL';
      } else if (key === 'staff') {
        opFilters.staff = 'ALL';
        if (opStaffSelect) opStaffSelect.value = 'ALL';
      } else if (key === 'vehicle') {
        opFilters.vehicle = 'ALL';
        if (opVehicleSelect) opVehicleSelect.value = 'ALL';
      } else if (key === 'payment') {
        opFilters.payment = 'ALL';
        if (opPaymentSelect) opPaymentSelect.value = 'ALL';
      }

      renderOpTable();
      setClickFeedback('filter_alt_off', `Filter removed: <strong>${key}</strong>`);
    }

    function clearAllOpFilters() {
      opFilters = {
        search: '',
        city: 'ALL',
        zone: 'ALL',
        route: 'ALL',
        service: 'ALL',
        status: 'ALL',
        date: 'ALL',
        staff: 'ALL',
        vehicle: 'ALL',
        payment: 'ALL'
      };

      if (opSearchInput) opSearchInput.value = '';
      if (opSearchClear) opSearchClear.style.display = 'none';
      if (opCitySelect) opCitySelect.value = 'ALL';
      if (opZoneSelect) opZoneSelect.value = 'ALL';
      if (opRouteSelect) opRouteSelect.value = 'ALL';
      if (opServiceSelect) opServiceSelect.value = 'ALL';
      if (opStatusSelect) opStatusSelect.value = 'ALL';
      if (opDateSelect) opDateSelect.value = 'ALL';
      if (opStaffSelect) opStaffSelect.value = 'ALL';
      if (opVehicleSelect) opVehicleSelect.value = 'ALL';
      if (opPaymentSelect) opPaymentSelect.value = 'ALL';

      renderOpTable();
      setClickFeedback('restart_alt', 'All table filters reset to default');
    }

    // Attach Event Listeners to Filter Controls
    if (opSearchInput) {
      opSearchInput.addEventListener('input', (e) => {
        opFilters.search = e.target.value.trim();
        if (opSearchClear) opSearchClear.style.display = opFilters.search ? 'inline-flex' : 'none';
        renderOpTable();
      });
    }

    if (opSearchClear) {
      opSearchClear.addEventListener('click', () => {
        resetSingleOpFilter('search');
        if (opSearchInput) opSearchInput.focus();
      });
    }

    if (opCitySelect) {
      opCitySelect.addEventListener('change', (e) => {
        opFilters.city = e.target.value;
        renderOpTable();
      });
    }
    if (opZoneSelect) {
      opZoneSelect.addEventListener('change', (e) => {
        opFilters.zone = e.target.value;
        renderOpTable();
      });
    }
    if (opRouteSelect) {
      opRouteSelect.addEventListener('change', (e) => {
        opFilters.route = e.target.value;
        renderOpTable();
      });
    }
    if (opServiceSelect) {
      opServiceSelect.addEventListener('change', (e) => {
        opFilters.service = e.target.value;
        renderOpTable();
      });
    }
    if (opStatusSelect) {
      opStatusSelect.addEventListener('change', (e) => {
        opFilters.status = e.target.value;
        renderOpTable();
      });
    }
    if (opDateSelect) {
      opDateSelect.addEventListener('change', (e) => {
        opFilters.date = e.target.value;
        renderOpTable();
      });
    }
    if (opStaffSelect) {
      opStaffSelect.addEventListener('change', (e) => {
        opFilters.staff = e.target.value;
        renderOpTable();
      });
    }
    if (opVehicleSelect) {
      opVehicleSelect.addEventListener('change', (e) => {
        opFilters.vehicle = e.target.value;
        renderOpTable();
      });
    }
    if (opPaymentSelect) {
      opPaymentSelect.addEventListener('change', (e) => {
        opFilters.payment = e.target.value;
        renderOpTable();
      });
    }

    if (opClearFiltersBtn) {
      opClearFiltersBtn.addEventListener('click', clearAllOpFilters);
    }
    if (opResetAllSummaryBtn) {
      opResetAllSummaryBtn.addEventListener('click', clearAllOpFilters);
    }
    if (opEmptyResetBtn) {
      opEmptyResetBtn.addEventListener('click', clearAllOpFilters);
    }

    if (opMoreFiltersBtn && opFilterDrawer) {
      opMoreFiltersBtn.addEventListener('click', () => {
        const isOpen = opFilterDrawer.classList.toggle('is-open');
        opMoreFiltersBtn.classList.toggle('cwp-v2-btn-primary', isOpen);
        opMoreFiltersBtn.classList.toggle('cwp-v2-btn-secondary', !isOpen);
        setClickFeedback('tune', `Secondary filter drawer: <strong>${isOpen ? 'Expanded' : 'Collapsed'}</strong>`);
      });
    }

    // Initial render of operational table
    renderOpTable();

    /* ---------------------------------------------------------------------
       6.6 Date & Date-Range Selection
       --------------------------------------------------------------------- */
    const datePresetsCluster = document.getElementById('v2DemoDatePresetsCluster');
    const dateStart = document.getElementById('v2DemoDateStart');
    const dateEnd = document.getElementById('v2DemoDateEnd');
    const dateRangeHelper = document.getElementById('v2DemoDateRangeHelper');

    function applyDatePreset(preset) {
      if (!dateStart || !dateEnd) return;

      if (preset === 'today') {
        dateStart.value = '2026-11-26';
        dateEnd.value = '2026-11-26';
        if (dateRangeHelper) dateRangeHelper.innerHTML = `Preset applied: <strong>Today (2026-11-26)</strong>`;
      } else if (preset === 'yesterday') {
        dateStart.value = '2026-11-25';
        dateEnd.value = '2026-11-25';
        if (dateRangeHelper) dateRangeHelper.innerHTML = `Preset applied: <strong>Yesterday (2026-11-25)</strong>`;
      } else if (preset === 'last7') {
        dateStart.value = '2026-11-20';
        dateEnd.value = '2026-11-26';
        if (dateRangeHelper) dateRangeHelper.innerHTML = `Preset applied: <strong>Last 7 Days (2026-11-20 &rarr; 2026-11-26)</strong>`;
      } else if (preset === 'thismonth') {
        dateStart.value = '2026-11-01';
        dateEnd.value = '2026-11-30';
        if (dateRangeHelper) dateRangeHelper.innerHTML = `Preset applied: <strong>This Month (Nov 2026)</strong>`;
      } else if (preset === 'custom') {
        if (dateRangeHelper) dateRangeHelper.innerHTML = `Mode: <strong>Custom Range Entry</strong>`;
      }

      if (datePresetsCluster) {
        datePresetsCluster.querySelectorAll('.cwp-v2-date-preset-pill').forEach(btn => {
          btn.classList.toggle('is-active', btn.getAttribute('data-preset') === preset);
        });
      }

      setClickFeedback('calendar_today', `Date preset selected: <strong>${preset}</strong> (${dateStart.value} to ${dateEnd.value})`);
    }

    if (datePresetsCluster) {
      datePresetsCluster.querySelectorAll('.cwp-v2-date-preset-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = btn.getAttribute('data-preset');
          applyDatePreset(preset);
        });
      });
    }

    if (dateStart && dateEnd) {
      [dateStart, dateEnd].forEach(input => {
        input.addEventListener('change', () => {
          if (datePresetsCluster) {
            datePresetsCluster.querySelectorAll('.cwp-v2-date-preset-pill').forEach(b => {
              b.classList.toggle('is-active', b.getAttribute('data-preset') === 'custom');
            });
          }
          if (dateRangeHelper) {
            dateRangeHelper.innerHTML = `Custom range: <strong>${dateStart.value} &rarr; ${dateEnd.value}</strong>`;
          }
        });
      });
    }

    /* ---------------------------------------------------------------------
       6.8 Empty & No-Results Component States Showcase
       --------------------------------------------------------------------- */
    const emptyPreviewBox = document.getElementById('v2EmptyStatePreviewBox');
    const emptyStateBtns = document.querySelectorAll('.v2-empty-state-btn');

    const EMPTY_STATES = {
      'no-options': {
        icon: 'domain_disabled',
        title: 'No Services Available for Selected Society',
        desc: 'Society "Prestige Golfshire" has not yet activated standard wash and cleaning contracts for Tier-B towers.',
        actionIcon: 'add_business',
        actionText: 'Request Society Onboarding',
        feedback: 'Demonstrated: No options available state'
      },
      'search-empty': {
        icon: 'search_off',
        title: 'No Services Match Your Search Query',
        desc: 'Zero service catalog entries matched your search query. Check for typos or clear your search query to view all 20 services.',
        actionIcon: 'backspace',
        actionText: 'Clear Search Query',
        feedback: 'Demonstrated: Search returns no matches state'
      },
      'filter-empty': {
        icon: 'filter_alt_off',
        title: 'No Operations Records Match Current Filters',
        desc: '0 of 14 operational jobs matched the active filter criteria. Try adjusting City, Route, or Service Type.',
        actionIcon: 'restart_alt',
        actionText: 'Reset Table Filters',
        feedback: 'Demonstrated: No records match filter state'
      },
      'loading-state': {
        icon: '',
        isLoading: true,
        title: 'Fetching Remote Operations Dataset...',
        desc: 'Synchronizing real-time route execution logs and GPS tracking telemetry from central fleet servers. Please wait...',
        actionIcon: 'close',
        actionText: 'Cancel Sync',
        feedback: 'Demonstrated: Loading options state with non-blocking spinner'
      },
      'disabled-state': {
        icon: 'lock',
        title: 'Service Selection Locked by Route Dispatch',
        desc: 'Route 04 has been locked by the dispatch supervisor to prevent schedule drift during peak morning hours (08:00 AM - 11:30 AM).',
        actionIcon: 'lock_open',
        actionText: 'Request Supervisor Override',
        feedback: 'Demonstrated: Disabled selection state'
      }
    };

    function renderEmptyStatePreview(stateKey) {
      if (!emptyPreviewBox) return;
      const state = EMPTY_STATES[stateKey] || EMPTY_STATES['no-options'];

      let iconHtml = '';
      if (state.isLoading) {
        iconHtml = `<div class="cwp-v2-empty-state-spinner"></div>`;
      } else {
        iconHtml = `<span class="material-symbols-outlined cwp-v2-empty-state-icon">${state.icon}</span>`;
      }

      emptyPreviewBox.innerHTML = `
        ${iconHtml}
        <div class="cwp-v2-empty-state-title">${escapeHtml(state.title)}</div>
        <div class="cwp-v2-empty-state-desc">${escapeHtml(state.desc)}</div>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" id="v2EmptyStateActionBtn">
          <span class="material-symbols-outlined" style="font-size:15px;">${state.actionIcon}</span>
          <span>${escapeHtml(state.actionText)}</span>
        </button>
      `;

      const actionBtn = document.getElementById('v2EmptyStateActionBtn');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          setClickFeedback('check_circle', `Action triggered: <strong>${escapeHtml(state.actionText)}</strong>`);
        });
      }

      setClickFeedback('info', state.feedback);
    }

    emptyStateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        emptyStateBtns.forEach(b => {
          b.classList.remove('cwp-v2-btn-primary');
          b.classList.add('cwp-v2-btn-secondary');
        });
        btn.classList.remove('cwp-v2-btn-secondary');
        btn.classList.add('cwp-v2-btn-primary');
        const stateKey = btn.getAttribute('data-state');
        renderEmptyStatePreview(stateKey);
      });
    });

    // Initial render of default empty state
    renderEmptyStatePreview('no-options');
  }

  /* ==========================================================================
     Task 07 — CWP Aura Tables & Operational Data Grid System
     ========================================================================== */
  const TASK07_OPERATIONS_DATASET = [
    {
      id: "CWP-8841",
      customer: "Vikram Malhotra",
      phone: "+91 98450 12891",
      society: "Prestige Falcon City, Tower 3, #1204",
      bay: "Basement 2, Bay B-44",
      vehicle: "KA-01-MJ-4092",
      makeModel: "Toyota Fortuner (Black)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Kanakapura Road",
      service: "Daily Car Cleaning",
      staff: "Ramesh Kumar",
      slot: "06:30 AM",
      date: "2026-11-26",
      amount: 650,
      status: "In Progress",
      priority: "High",
      progress: 70,
      keyWithGuard: true,
      notes: "Guard at Tower 3 Gate has the physical key fob. Water outlet adjacent to pillar 44."
    },
    {
      id: "CWP-8840",
      customer: "Sneha Rao",
      phone: "+91 98861 24510",
      society: "Sobha Forest View, Pine #402",
      bay: "Basement 1, Bay A-12",
      vehicle: "KA-05-MK-1029",
      makeModel: "Honda City (Silver)",
      vehicleType: "Sedan",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Kanakapura Road",
      service: "Ceramic Foam Wash",
      staff: "Sunil Gowda",
      slot: "07:15 AM",
      date: "2026-11-26",
      amount: 1200,
      status: "Confirmed",
      priority: "Medium",
      progress: 0,
      keyWithGuard: false,
      notes: "Owner will be present with key. Use microfiber wash mitt only."
    },
    {
      id: "CWP-8839",
      customer: "Rajesh Nambiar",
      phone: "+91 99002 87634",
      society: "Brigade Gateway, Orion #1801",
      bay: "Basement 3, Bay C-88",
      vehicle: "KA-04-NA-5512",
      makeModel: "Hyundai Creta (White)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "North Bangalore",
      route: "Rajajinagar",
      service: "Daily Car Cleaning",
      staff: "Unassigned",
      slot: "08:00 AM",
      date: "2026-11-26",
      amount: 650,
      status: "Pending",
      priority: "High",
      progress: 0,
      keyWithGuard: true,
      notes: "Security guard at Entry Gate 2 holds keys. Urgent dispatch required."
    },
    {
      id: "CWP-8838",
      customer: "Ananya Deshmukh",
      phone: "+91 97412 33490",
      society: "Godrej Woodsman Estate, Oak #901",
      bay: "Ground Bay 05",
      vehicle: "KA-51-EF-3310",
      makeModel: "Kia Seltos (Gravity Grey)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "North Bangalore",
      route: "Bellary Road",
      service: "Ceramic Coating",
      staff: "Pradeep N",
      slot: "09:30 AM",
      date: "2026-11-26",
      amount: 8500,
      status: "In Progress",
      priority: "High",
      progress: 45,
      keyWithGuard: true,
      notes: "Full body paint correction and 9H ceramic shield application in progress."
    },
    {
      id: "CWP-8837",
      customer: "Karthik Swaminathan",
      phone: "+91 98440 98214",
      society: "Salarpuria Sattva Magnificence, #304",
      bay: "Basement 1, Bay A-27",
      vehicle: "KA-03-HA-8821",
      makeModel: "BMW 320d (Portimao Blue)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Bannerghatta Road",
      service: "Interior Steam Sanitization",
      staff: "Anand Swamy",
      slot: "10:15 AM",
      date: "2026-11-26",
      amount: 2800,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Premium leather treatment and ozone cabin deodorization finished."
    },
    {
      id: "CWP-8836",
      customer: "Meera Krishnan",
      phone: "+91 98801 11209",
      society: "Adarsh Palm Retreat, Villa #112",
      bay: "Private Covered Porch",
      vehicle: "KA-02-ML-6677",
      makeModel: "Mercedes GLC (Polar White)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Outer Ring Road",
      service: "Daily Car Cleaning",
      staff: "Sunil Gowda",
      slot: "06:45 AM",
      date: "2026-11-26",
      amount: 750,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Microfiber two-bucket clean completed at 07:15 AM."
    },
    {
      id: "CWP-8835",
      customer: "Rohan Sen",
      phone: "+91 99450 67123",
      society: "Purva Sunflower, Tower 1 #502",
      bay: "Basement 2, Bay B-19",
      vehicle: "KA-01-AB-1200",
      makeModel: "Tata Safari (Dark Edition)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "Central Bangalore",
      route: "Rajajinagar",
      service: "Solar Panel Cleaning",
      staff: "Unassigned",
      slot: "11:00 AM",
      date: "2026-11-26",
      amount: 1800,
      status: "Pending",
      priority: "High",
      progress: 0,
      keyWithGuard: true,
      notes: "16 rooftop solar panels, access via staircase core B. Harness mandatory."
    },
    {
      id: "CWP-8834",
      customer: "Divya Balaji",
      phone: "+91 97312 88451",
      society: "SNN Raj Greenbay, Block C #1105",
      bay: "Basement 1, Bay C-62",
      vehicle: "KA-53-Z-9004",
      makeModel: "Hyundai i20 (Fiery Red)",
      vehicleType: "Hatchback",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Electronic City",
      service: "Daily Car Cleaning",
      staff: "Kavitha R",
      slot: "07:00 AM",
      date: "2026-11-26",
      amount: 450,
      status: "In Progress",
      priority: "Normal",
      progress: 80,
      keyWithGuard: true,
      notes: "Key with tower supervisor. Wheels and windshield wiped."
    },
    {
      id: "CWP-8833",
      customer: "Arjun Hegde",
      phone: "+91 94480 34112",
      society: "Brigade Millennium, Mayflower #703",
      bay: "Basement 2, Bay B-08",
      vehicle: "KA-05-PP-7711",
      makeModel: "Mahindra Thar (Deep Forest)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "JP Nagar",
      service: "Engine Bay Degreasing",
      staff: "Vijay Hegde",
      slot: "11:30 AM",
      date: "2026-11-26",
      amount: 1400,
      status: "Confirmed",
      priority: "Medium",
      progress: 0,
      keyWithGuard: false,
      notes: "Owner requested steam detailing on engine bay and electrical shield check."
    },
    {
      id: "CWP-8832",
      customer: "Pooja Chandrasekhar",
      phone: "+91 96111 44520",
      society: "Mantri Alpyne, Tower E #201",
      bay: "Basement 1, Bay A-49",
      vehicle: "KA-04-MQ-2234",
      makeModel: "Maruti Grand Vitara (White)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "West Bangalore",
      route: "Uttarahalli",
      service: "Ceramic Foam Wash",
      staff: "Unassigned",
      slot: "02:00 PM",
      date: "2026-11-26",
      amount: 1200,
      status: "Pending",
      priority: "Medium",
      progress: 0,
      keyWithGuard: true,
      notes: "Call owner 15 mins before arrival. High pressure wash bay booked."
    },
    {
      id: "CWP-8831",
      customer: "Deepak Varma",
      phone: "+91 98455 77622",
      society: "Prestige Lakeside Habitat, Tower 8",
      bay: "Basement 2, Bay B-73",
      vehicle: "KA-03-NC-4190",
      makeModel: "Skoda Slavia (Carbon Steel)",
      vehicleType: "Sedan",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Varthur",
      service: "Daily Car Cleaning",
      staff: "Sunil Gowda",
      slot: "06:15 AM",
      date: "2026-11-26",
      amount: 550,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Morning subscription cycle complete with rim shine."
    },
    {
      id: "CWP-8830",
      customer: "Shreya Sundaram",
      phone: "+91 99009 12345",
      society: "Vaishnavi Terraces, Block B #802",
      bay: "Basement 1, Bay A-33",
      vehicle: "KA-05-MN-9988",
      makeModel: "Audi Q5 (Mythos Black)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "JP Nagar",
      service: "Ceramic Coating",
      staff: "Pradeep N",
      slot: "10:00 AM",
      date: "2026-11-26",
      amount: 12500,
      status: "In Progress",
      priority: "High",
      progress: 50,
      keyWithGuard: true,
      notes: "Stage 2 compound finish ongoing. Curing under infrared lamp."
    },
    {
      id: "CWP-8829",
      customer: "Manoj Tiwari",
      phone: "+91 98865 33210",
      society: "Brigade Panorama, Wing A #604",
      bay: "Basement 2, Bay B-14",
      vehicle: "KA-02-KJ-8812",
      makeModel: "Tata Nexon EV (Teal)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "West Bangalore",
      route: "Mysore Road",
      service: "Daily Car Cleaning",
      staff: "Ramesh Kumar",
      slot: "07:45 AM",
      date: "2026-11-26",
      amount: 600,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: true,
      notes: "EV charging plug nearby; do not spray water on charger connection."
    },
    {
      id: "CWP-8828",
      customer: "Harish Gowda",
      phone: "+91 94481 22900",
      society: "Sankalp Temple Trees, Block 2 #301",
      bay: "Ground Bay 02",
      vehicle: "KA-09-MA-4512",
      makeModel: "Toyota Innova Crysta (Silver)",
      vehicleType: "MPV",
      city: "Mysuru",
      zone: "Central Mysuru",
      route: "Jayalakshmipuram",
      service: "Daily Car Cleaning",
      staff: "Anand Swamy",
      slot: "07:00 AM",
      date: "2026-11-26",
      amount: 700,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: false,
      notes: "Daily Mysuru fleet customer; exterior wash and tire polish."
    },
    {
      id: "CWP-8827",
      customer: "Lavanya K",
      phone: "+91 97410 88712",
      society: "Brigade Symphony, Block C #405",
      bay: "Basement 1, Bay A-18",
      vehicle: "KA-09-P-3390",
      makeModel: "Honda Elevate (Phoenix Orange)",
      vehicleType: "SUV",
      city: "Mysuru",
      zone: "North Mysuru",
      route: "KRS Road",
      service: "Ceramic Foam Wash",
      staff: "Unassigned",
      slot: "09:00 AM",
      date: "2026-11-26",
      amount: 1100,
      status: "Pending",
      priority: "Medium",
      progress: 0,
      keyWithGuard: true,
      notes: "Unassigned Mysuru morning booking. Technician assignment pending."
    },
    {
      id: "CWP-8826",
      customer: "Ganesh Shenoy",
      phone: "+91 98452 66100",
      society: "Rohan Corporation Heights, Flat 501",
      bay: "Basement 1, Bay A-09",
      vehicle: "KA-19-MC-7721",
      makeModel: "Mahindra XUV700 (Black)",
      vehicleType: "SUV",
      city: "Mangaluru",
      zone: "Central Mangaluru",
      route: "Kadri",
      service: "Daily Car Cleaning",
      staff: "Vijay Hegde",
      slot: "06:30 AM",
      date: "2026-11-26",
      amount: 650,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Early morning completed run. Client confirmed via WhatsApp."
    },
    {
      id: "CWP-8825",
      customer: "Preeti Nayak",
      phone: "+91 99012 34567",
      society: "NorthernSky City, Tower 2 #1202",
      bay: "Basement 2, Bay B-41",
      vehicle: "KA-19-ME-9011",
      makeModel: "Volkswagen Taigun (Yellow)",
      vehicleType: "SUV",
      city: "Mangaluru",
      zone: "South Mangaluru",
      route: "Pumpwell",
      service: "Interior Steam Sanitization",
      staff: "Unassigned",
      slot: "03:30 PM",
      date: "2026-11-26",
      amount: 2600,
      status: "Pending",
      priority: "High",
      progress: 0,
      keyWithGuard: true,
      notes: "Emergency odor removal request. Requires heavy enzyme treatment."
    },
    {
      id: "CWP-8824",
      customer: "Sanjay Kulkarni",
      phone: "+91 98451 90872",
      society: "Total Environment Windmills, Villa 42",
      bay: "Private Courtyard Porch",
      vehicle: "KA-04-MM-1122",
      makeModel: "Volvo XC90 (Onyx Black)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Whitefield",
      service: "Ceramic Coating",
      staff: "Pradeep N",
      slot: "11:00 AM",
      date: "2026-11-25",
      amount: 12500,
      status: "Completed",
      priority: "High",
      progress: 100,
      keyWithGuard: true,
      notes: "Two-coat graphene-infused ceramic coating cured and handed over."
    },
    {
      id: "CWP-8823",
      customer: "Nidhi Sharma",
      phone: "+91 97390 11428",
      society: "Assetz Marq, Tower 5 #1601",
      bay: "Basement 2, Bay B-55",
      vehicle: "KA-53-MA-8844",
      makeModel: "Kia Carens (Imperial Blue)",
      vehicleType: "MPV",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Whitefield",
      service: "Daily Car Cleaning",
      staff: "Sunil Gowda",
      slot: "07:30 AM",
      date: "2026-11-25",
      amount: 600,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: true,
      notes: "Yesterday morning clean completed without issues."
    },
    {
      id: "CWP-8822",
      customer: "Suresh Babu",
      phone: "+91 94488 55210",
      society: "Sobha City Casa Serenita, Block 3",
      bay: "Basement 1, Bay A-10",
      vehicle: "KA-02-ND-6611",
      makeModel: "Maruti Ertiga (Magma Grey)",
      vehicleType: "MPV",
      city: "Bengaluru",
      zone: "North Bangalore",
      route: "Thanisandra",
      service: "Daily Car Cleaning",
      staff: "Kavitha R",
      slot: "08:15 AM",
      date: "2026-11-25",
      amount: 500,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Regular subscription wash completed."
    },
    {
      id: "CWP-8821",
      customer: "Radhika Joshi",
      phone: "+91 98809 77123",
      society: "Prestige Jindal City, Tower 7 #1102",
      bay: "Basement 3, Bay C-22",
      vehicle: "KA-04-NZ-3401",
      makeModel: "MG ZS EV (Candy White)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "West Bangalore",
      route: "Tumkur Road",
      service: "Solar Panel Cleaning",
      staff: "Ramesh Kumar",
      slot: "02:00 PM",
      date: "2026-11-25",
      amount: 1950,
      status: "Completed",
      priority: "Medium",
      progress: 100,
      keyWithGuard: true,
      notes: "20-panel residential array cleaned with demineralized water."
    },
    {
      id: "CWP-8820",
      customer: "Vinay Murthy",
      phone: "+91 99452 88190",
      society: "Shriram Greenfield, Block B #708",
      bay: "Basement 1, Bay A-40",
      vehicle: "KA-51-MD-9022",
      makeModel: "Hyundai Verna (Abyss Black)",
      vehicleType: "Sedan",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Budigere Cross",
      service: "Engine Bay Degreasing",
      staff: "Sunil Gowda",
      slot: "04:00 PM",
      date: "2026-11-25",
      amount: 1350,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Complete degreasing and dry engine bay dress applied."
    },
    {
      id: "CWP-8819",
      customer: "Alok Bannerjee",
      phone: "+91 98444 32190",
      society: "Embassy Boulevard, Villa #19",
      bay: "Private Garage",
      vehicle: "KA-04-ML-0007",
      makeModel: "Porsche Macan (Volcano Grey)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "North Bangalore",
      route: "Yelahanka",
      service: "Ceramic Coating",
      staff: "Pradeep N",
      slot: "10:00 AM",
      date: "2026-11-24",
      amount: 15000,
      status: "Completed",
      priority: "High",
      progress: 100,
      keyWithGuard: true,
      notes: "Full body PPF top ceramic coat completed with 3-year warranty card."
    },
    {
      id: "CWP-8818",
      customer: "Kavita Nair",
      phone: "+91 97411 65432",
      society: "Godrej Air, Tower 1 #1404",
      bay: "Basement 2, Bay B-17",
      vehicle: "KA-53-MB-2219",
      makeModel: "Skoda Kushaq (Honey Orange)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Hoodi",
      service: "Daily Car Cleaning",
      staff: "Ramesh Kumar",
      slot: "06:45 AM",
      date: "2026-11-24",
      amount: 600,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Cleaned and logged in logbook."
    },
    {
      id: "CWP-8817",
      customer: "Ashwin Prasad",
      phone: "+91 99001 22889",
      society: "Sobha Morzaria Grandeur, Block 2",
      bay: "Basement 1, Bay A-38",
      vehicle: "KA-01-MH-5566",
      makeModel: "BMW X5 (Phytonic Blue)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Bannerghatta Road",
      service: "Interior Steam Sanitization",
      staff: "Anand Swamy",
      slot: "02:30 PM",
      date: "2026-11-24",
      amount: 3200,
      status: "Completed",
      priority: "Medium",
      progress: 100,
      keyWithGuard: true,
      notes: "Antimicrobial cabin vaporization completed."
    },
    {
      id: "CWP-8816",
      customer: "Shilpa Hegde",
      phone: "+91 98450 77114",
      society: "Brigade Exotica, Azure #2203",
      bay: "Basement 3, Bay C-90",
      vehicle: "KA-53-Z-1010",
      makeModel: "Audi A4 (Ibis White)",
      vehicleType: "Sedan",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Old Madras Road",
      service: "Daily Car Cleaning",
      staff: "Sunil Gowda",
      slot: "07:00 AM",
      date: "2026-11-24",
      amount: 650,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: true,
      notes: "Early morning daily subscriber slot."
    },
    {
      id: "CWP-8815",
      customer: "Naveen Chandra",
      phone: "+91 98860 88231",
      society: "Ferns Residency, Villa #88",
      bay: "Private Driveway",
      vehicle: "KA-03-MM-7890",
      makeModel: "Toyota Hilux (Red)",
      vehicleType: "Truck",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Hennur",
      service: "Ceramic Foam Wash",
      staff: "Kavitha R",
      slot: "09:30 AM",
      date: "2026-11-24",
      amount: 1500,
      status: "Completed",
      priority: "Normal",
      progress: 100,
      keyWithGuard: false,
      notes: "Underbody mud rinse and wheel well deep wash included."
    },
    {
      id: "CWP-8814",
      customer: "Tanvi Sengupta",
      phone: "+91 97310 99881",
      society: "Prestige Kingfisher Towers, #1802",
      bay: "Basement 3, Bay C-01",
      vehicle: "KA-01-EE-0001",
      makeModel: "Mercedes S-Class (Black)",
      vehicleType: "Luxury",
      city: "Bengaluru",
      zone: "Central Bangalore",
      route: "Lavelle Road",
      service: "Ceramic Foam Wash",
      staff: "Sunil Gowda",
      slot: "08:00 AM",
      date: "2026-11-27",
      amount: 2500,
      status: "Confirmed",
      priority: "High",
      progress: 0,
      keyWithGuard: true,
      notes: "VIP owner booking for tomorrow morning. Use brand-new microfiber."
    },
    {
      id: "CWP-8813",
      customer: "Pradeep Pai",
      phone: "+91 94480 11992",
      society: "Bearys Horizon, Flat 302",
      bay: "Basement 1, Bay A-11",
      vehicle: "KA-19-MD-4433",
      makeModel: "Hyundai Creta (Black)",
      vehicleType: "SUV",
      city: "Mangaluru",
      zone: "Central Mangaluru",
      route: "Bendoorwell",
      service: "Daily Car Cleaning",
      staff: "Vijay Hegde",
      slot: "06:15 AM",
      date: "2026-11-27",
      amount: 600,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: false,
      notes: "Scheduled tomorrow morning routine wash."
    },
    {
      id: "CWP-8812",
      customer: "Madhuri Dixit",
      phone: "+91 98451 44778",
      society: "Sree Daksha Vriksha, Block A #102",
      bay: "Ground Bay 04",
      vehicle: "KA-09-MA-8819",
      makeModel: "Honda Amaze (White)",
      vehicleType: "Sedan",
      city: "Mysuru",
      zone: "South Mysuru",
      route: "Kuvempunagar",
      service: "Solar Panel Cleaning",
      staff: "Anand Swamy",
      slot: "10:30 AM",
      date: "2026-11-27",
      amount: 1600,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: true,
      notes: "12 panels rooftop setup. Access confirmed with security."
    },
    {
      id: "CWP-8811",
      customer: "Vivek Reddy",
      phone: "+91 99002 66334",
      society: "Bren Starlight, Tower 2 #404",
      bay: "Basement 2, Bay B-29",
      vehicle: "KA-51-ME-1199",
      makeModel: "Tata Harrier (Calypso Red)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Kudlu Gate",
      service: "Daily Car Cleaning",
      staff: "Unassigned",
      slot: "07:15 AM",
      date: "2026-11-27",
      amount: 600,
      status: "Confirmed",
      priority: "High",
      progress: 0,
      keyWithGuard: true,
      notes: "Unassigned tomorrow morning dispatch. Route optimization needed."
    },
    {
      id: "CWP-8810",
      customer: "Swati Mathur",
      phone: "+91 98802 33119",
      society: "Mahaveer Ranches, Block C #601",
      bay: "Basement 1, Bay A-50",
      vehicle: "KA-05-MK-9021",
      makeModel: "Maruti Swift (Fire Red)",
      vehicleType: "Hatchback",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Hosa Road",
      service: "Daily Car Cleaning",
      staff: "Kavitha R",
      slot: "06:45 AM",
      date: "2026-11-27",
      amount: 450,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: false,
      notes: "Daily clean booking confirmed for tomorrow."
    },
    {
      id: "CWP-8809",
      customer: "Balakrishna Bhat",
      phone: "+91 94482 77012",
      society: "Inland Windsors, Flat 904",
      bay: "Basement 2, Bay B-15",
      vehicle: "KA-19-MC-1100",
      makeModel: "Maruti Baleno (Blue)",
      vehicleType: "Hatchback",
      city: "Mangaluru",
      zone: "North Mangaluru",
      route: "Airport Road",
      service: "Ceramic Foam Wash",
      staff: "Vijay Hegde",
      slot: "09:00 AM",
      date: "2026-11-27",
      amount: 950,
      status: "Confirmed",
      priority: "Normal",
      progress: 0,
      keyWithGuard: true,
      notes: "Gate pass ready with security. Key under mat."
    },
    {
      id: "CWP-8808",
      customer: "Arvind Ramanathan",
      phone: "+91 98450 66321",
      society: "Hiranandani Queensgate, Tower 1",
      bay: "Basement 2, Bay B-80",
      vehicle: "KA-05-MM-3344",
      makeModel: "Skoda Octavia (Race Blue)",
      vehicleType: "Sedan",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Hulimavu",
      service: "Interior Steam Sanitization",
      staff: "Anand Swamy",
      slot: "02:00 PM",
      date: "2026-11-27",
      amount: 2800,
      status: "Confirmed",
      priority: "Medium",
      progress: 0,
      keyWithGuard: false,
      notes: "Complete interior steam sanitization scheduled tomorrow afternoon."
    },
    {
      id: "CWP-8807",
      customer: "Rohit Kaushik",
      phone: "+91 97412 88990",
      society: "Salarpuria Sattva Greenage, Aspen",
      bay: "Basement 2, Bay B-60",
      vehicle: "KA-01-MK-7788",
      makeModel: "Hyundai Tucson (Starry Night)",
      vehicleType: "SUV",
      city: "Bengaluru",
      zone: "South Bangalore",
      route: "Hosur Road",
      service: "Daily Car Cleaning",
      staff: "Ramesh Kumar",
      slot: "06:00 AM",
      date: "2026-11-26",
      amount: 650,
      status: "Cancelled",
      priority: "Normal",
      progress: 0,
      keyWithGuard: false,
      notes: "Customer requested slot cancellation due to outstation travel."
    },
    {
      id: "CWP-8806",
      customer: "Geetha Menon",
      phone: "+91 98801 44556",
      society: "Rohan Iksha, Block C #303",
      bay: "Basement 1, Bay A-16",
      vehicle: "KA-53-Z-5522",
      makeModel: "Volkswagen Polo (Flash Red)",
      vehicleType: "Hatchback",
      city: "Bengaluru",
      zone: "East Bangalore",
      route: "Marathahalli",
      service: "Daily Car Cleaning",
      staff: "Sunil Gowda",
      slot: "07:00 AM",
      date: "2026-11-26",
      amount: 450,
      status: "Cancelled",
      priority: "Normal",
      progress: 0,
      keyWithGuard: false,
      notes: "Vehicle in workshop for scheduled servicing."
    }
  ];

  function bindTableDataGridPlayground() {
    const tableEl = document.getElementById('v2Task07Table');
    const tableBodyEl = document.getElementById('v2Task07TableBody');
    if (!tableEl || !tableBodyEl) return;

    // Local clone of dataset for mutations (New Job, etc.)
    let currentData = [...TASK07_OPERATIONS_DATASET];

    // State object
    const state = {
      page: 1,
      pageSize: 10,
      sortCol: 'id',
      sortDir: 'desc',
      density: 'compact',
      previewState: 'data', // 'data', 'loading', 'empty', 'error'
      selectedIds: new Set(),
      expandedIds: new Set(),
      filters: {
        search: '',
        city: 'ALL',
        service: 'ALL',
        status: 'ALL',
        priority: 'ALL',
        chip: 'all'
      }
    };

    // DOM references
    const skeletonEl = document.getElementById('v2TableSkeletonShimmer');
    const emptyPanelEl = document.getElementById('v2TableEmptyPanel');
    const errorPanelEl = document.getElementById('v2TableErrorPanel');
    const bulkBarEl = document.getElementById('v2TableBulkBar');
    const bulkCountEl = document.getElementById('v2TableBulkCount');
    const selectAllPageCheckbox = document.getElementById('v2TableSelectAllPage');
    const selectAllDatasetBtn = document.getElementById('v2TableSelectAllDatasetBtn');
    const clearSelectionBtn = document.getElementById('v2TableClearSelectionBtn');
    const toggleAllExpandBtn = document.getElementById('v2TableToggleAllExpandBtn');
    const toggleAllExpandIcon = document.getElementById('v2TableToggleAllExpandIcon');
    const toggleAllExpandText = document.getElementById('v2TableToggleAllExpandText');

    // Filter elements
    const searchInput = document.getElementById('v2TableSearchInput');
    const searchClearBtn = document.getElementById('v2TableSearchClearBtn');
    const cityFilter = document.getElementById('v2TableCityFilter');
    const serviceFilter = document.getElementById('v2TableServiceFilter');
    const statusFilter = document.getElementById('v2TableStatusFilter');
    const priorityFilter = document.getElementById('v2TablePriorityFilter');
    const clearFiltersBtn = document.getElementById('v2TableClearFiltersBtn');
    const chipsCluster = document.getElementById('v2TableChipsCluster');
    const chipUnassignedCountEl = document.getElementById('v2TableChipUnassignedCount');

    // Summary bar
    const summaryBar = document.getElementById('v2TableSummaryBar');
    const activeFilterCountEl = document.getElementById('v2TableActiveFilterCount');
    const filterTagsContainer = document.getElementById('v2TableFilterTagsContainer');
    const summaryResetBtn = document.getElementById('v2TableSummaryResetBtn');

    // Pagination elements
    const pageSizeSelect = document.getElementById('v2TablePageSizeSelect');
    const firstPageBtn = document.getElementById('v2TableFirstPageBtn');
    const prevPageBtn = document.getElementById('v2TablePrevPageBtn');
    const nextPageBtn = document.getElementById('v2TableNextPageBtn');
    const lastPageBtn = document.getElementById('v2TableLastPageBtn');
    const pageIndicatorEl = document.getElementById('v2TablePageIndicator');
    const paginationRangeEl = document.getElementById('v2TablePaginationRange');
    const filteredNoteEl = document.getElementById('v2TableFilteredNote');

    // Action & Refresh buttons
    const refreshBtn = document.getElementById('v2TableRefreshBtn');
    const newJobBtn = document.getElementById('v2TableNewJobBtn');
    const emptyClearBtn = document.getElementById('v2TableEmptyClearBtn');
    const errorRetryBtn = document.getElementById('v2TableErrorRetryBtn');

    function showFeedback(htmlMessage) {
      const feedbackEl = document.getElementById('v2PlaygroundClickFeedback');
      if (feedbackEl) {
        feedbackEl.innerHTML = htmlMessage;
      }
    }

    // 1. Data Filtering
    function getFilteredData() {
      return currentData.filter(item => {
        // Search filter
        if (state.filters.search) {
          const q = state.filters.search.toLowerCase().trim();
          const match =
            item.id.toLowerCase().includes(q) ||
            item.customer.toLowerCase().includes(q) ||
            item.vehicle.toLowerCase().includes(q) ||
            item.makeModel.toLowerCase().includes(q) ||
            item.society.toLowerCase().includes(q) ||
            item.route.toLowerCase().includes(q) ||
            item.staff.toLowerCase().includes(q) ||
            item.service.toLowerCase().includes(q) ||
            (item.notes && item.notes.toLowerCase().includes(q));
          if (!match) return false;
        }

        // City
        if (state.filters.city !== 'ALL' && item.city !== state.filters.city) {
          return false;
        }

        // Service
        if (state.filters.service !== 'ALL' && item.service !== state.filters.service) {
          return false;
        }

        // Status
        if (state.filters.status !== 'ALL' && item.status !== state.filters.status) {
          return false;
        }

        // Priority
        if (state.filters.priority !== 'ALL' && item.priority !== state.filters.priority) {
          return false;
        }

        // Operational Chips
        if (state.filters.chip === 'today' && item.date !== '2026-11-26') {
          return false;
        }
        if (state.filters.chip === 'unassigned' && item.staff !== 'Unassigned') {
          return false;
        }
        if (state.filters.chip === 'high-priority' && item.priority !== 'High') {
          return false;
        }
        if (state.filters.chip === 'in-progress' && item.status !== 'In Progress') {
          return false;
        }
        if (state.filters.chip === 'completed' && item.status !== 'Completed') {
          return false;
        }

        return true;
      });
    }

    // 2. Data Sorting
    function getSortedData(data) {
      const col = state.sortCol;
      const dir = state.sortDir === 'asc' ? 1 : -1;

      return [...data].sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (col === 'amount') {
          return (Number(valA) - Number(valB)) * dir;
        }

        if (col === 'priority') {
          const priorityWeight = { 'High': 3, 'Medium': 2, 'Normal': 1 };
          return ((priorityWeight[valA] || 0) - (priorityWeight[valB] || 0)) * dir;
        }

        if (col === 'date') {
          const keyA = valA + ' ' + (a.slot || '');
          const keyB = valB + ' ' + (b.slot || '');
          return keyA.localeCompare(keyB) * dir;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * dir;
        }

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    // 3. Render Status Badge
    function renderStatusBadge(status) {
      switch (status) {
        case 'Confirmed':
          return '<span class="cwp-v2-badge cwp-v2-badge-info"><span class="cwp-v2-badge-dot"></span>Confirmed</span>';
        case 'In Progress':
          return '<span class="cwp-v2-badge cwp-v2-badge-warning"><span class="cwp-v2-badge-dot"></span>In Progress</span>';
        case 'Pending':
          return '<span class="cwp-v2-badge cwp-v2-badge-neutral"><span class="cwp-v2-badge-dot"></span>Pending</span>';
        case 'Completed':
          return '<span class="cwp-v2-badge cwp-v2-badge-success"><span class="cwp-v2-badge-dot"></span>Completed</span>';
        case 'Cancelled':
          return '<span class="cwp-v2-badge cwp-v2-badge-danger"><span class="cwp-v2-badge-dot"></span>Cancelled</span>';
        default:
          return '<span class="cwp-v2-badge cwp-v2-badge-neutral">' + escapeHtml(status) + '</span>';
      }
    }

    // 4. Render Priority Badge
    function renderPriorityBadge(priority) {
      if (priority === 'High') {
        return '<span class="cwp-v2-priority-badge cwp-v2-priority-high"><span class="material-symbols-outlined" style="font-size:12px;">priority_high</span>High</span>';
      }
      if (priority === 'Medium') {
        return '<span class="cwp-v2-priority-badge cwp-v2-priority-medium">Medium</span>';
      }
      return '<span class="cwp-v2-priority-badge cwp-v2-priority-normal">Normal</span>';
    }

    // 5. Main Render Function
    function render() {
      // Update unassigned count on chip
      if (chipUnassignedCountEl) {
        const unassignedCount = currentData.filter(d => d.staff === 'Unassigned').length;
        chipUnassignedCountEl.textContent = unassignedCount;
      }

      // Handle Preview States (Loading, Empty, Error)
      if (state.previewState === 'loading') {
        tableEl.style.display = 'none';
        if (skeletonEl) skeletonEl.style.display = 'block';
        if (emptyPanelEl) emptyPanelEl.style.display = 'none';
        if (errorPanelEl) errorPanelEl.style.display = 'none';
        return;
      }

      if (state.previewState === 'error') {
        tableEl.style.display = 'none';
        if (skeletonEl) skeletonEl.style.display = 'none';
        if (emptyPanelEl) emptyPanelEl.style.display = 'none';
        if (errorPanelEl) errorPanelEl.style.display = 'flex';
        return;
      }

      if (skeletonEl) skeletonEl.style.display = 'none';
      if (errorPanelEl) errorPanelEl.style.display = 'none';

      const filtered = getFilteredData();
      const sorted = getSortedData(filtered);

      // Empty dataset state
      if (state.previewState === 'empty' || sorted.length === 0) {
        tableEl.style.display = 'none';
        if (emptyPanelEl) emptyPanelEl.style.display = 'flex';
        updatePaginationUI(0, 0, 0, currentData.length);
        updateSummaryBar();
        return;
      }

      // Live data mode
      tableEl.style.display = '';
      if (emptyPanelEl) emptyPanelEl.style.display = 'none';

      // Pagination calculation
      const totalRecords = sorted.length;
      const totalPages = Math.max(1, Math.ceil(totalRecords / state.pageSize));
      if (state.page > totalPages) {
        state.page = totalPages;
      }
      const startIndex = (state.page - 1) * state.pageSize;
      const endIndex = Math.min(startIndex + state.pageSize, totalRecords);
      const pageRecords = sorted.slice(startIndex, endIndex);

      // Render table rows
      let rowsHtml = '';
      pageRecords.forEach(rec => {
        const isSelected = state.selectedIds.has(rec.id);
        const isExpanded = state.expandedIds.has(rec.id);

        rowsHtml += `
          <tr class="${isSelected ? 'is-selected' : ''}" data-id="${rec.id}">
            <!-- 1. Expand Toggle -->
            <td style="text-align:center; padding:0 4px;">
              <button type="button" class="cwp-v2-expand-btn v2-t7-expand-btn ${isExpanded ? 'is-expanded' : ''}" data-id="${rec.id}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} row for ${rec.id}" title="${isExpanded ? 'Collapse' : 'Expand'} details">
                <span class="material-symbols-outlined" style="font-size:16px;">chevron_right</span>
              </button>
            </td>

            <!-- 2. Row Selection Checkbox -->
            <td class="cwp-v2-col-select" style="text-align:center;">
              <input type="checkbox" class="cwp-v2-checkbox v2-t7-row-checkbox" data-id="${rec.id}" ${isSelected ? 'checked' : ''} aria-label="Select row ${rec.id}">
            </td>

            <!-- 3. Job ID -->
            <td>
              <span class="cwp-v2-mono-text" style="font-weight:600; color:var(--cwp-v2-sys-primary);">${rec.id}</span>
            </td>

            <!-- 4. Customer & Society -->
            <td>
              <div style="font-weight:600; color:var(--cwp-v2-sys-on-surface); line-height:1.2;">${escapeHtml(rec.customer)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;" title="${escapeHtml(rec.society)}">${escapeHtml(rec.society)}</div>
            </td>

            <!-- 5. Vehicle / Reg -->
            <td>
              <div class="cwp-v2-mono-text" style="font-weight:600; color:var(--cwp-v2-sys-on-surface);">${escapeHtml(rec.vehicle)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-variant); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${escapeHtml(rec.makeModel)}</div>
            </td>

            <!-- 6. Route & City -->
            <td>
              <div style="font-weight:500;">${escapeHtml(rec.route)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(rec.city)}</div>
            </td>

            <!-- 7. Service Package -->
            <td>
              <span style="font-size:11.5px; font-weight:500;">${escapeHtml(rec.service)}</span>
            </td>

            <!-- 8. Staff Member -->
            <td>
              ${rec.staff === 'Unassigned' 
                ? '<span style="color:var(--cwp-v2-status-warning); font-weight:600; display:inline-flex; align-items:center; gap:3px;"><span class="material-symbols-outlined" style="font-size:13px;">warning</span>Unassigned</span>'
                : `<span style="font-weight:500;">${escapeHtml(rec.staff)}</span>`}
            </td>

            <!-- 9. Slot & Date -->
            <td>
              <div style="font-weight:500; font-size:11.5px;">${escapeHtml(rec.slot)}</div>
              <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(rec.date)}</div>
            </td>

            <!-- 10. Priority -->
            <td>${renderPriorityBadge(rec.priority)}</td>

            <!-- 11. Progress -->
            <td>
              <div class="cwp-v2-progress-cell" title="Dispatch progress: ${rec.progress}%">
                <div class="cwp-v2-progress-track">
                  <div class="cwp-v2-progress-fill" style="width:${rec.progress}%;"></div>
                </div>
                <span class="cwp-v2-progress-pct">${rec.progress}%</span>
              </div>
            </td>

            <!-- 12. Key -->
            <td>
              ${rec.keyWithGuard
                ? '<span class="cwp-v2-bool-pill is-true" title="Physical key fob deposited with guard"><span class="material-symbols-outlined" style="font-size:11px;">key</span>Guard</span>'
                : '<span class="cwp-v2-bool-pill is-false" title="Key with customer directly"><span class="material-symbols-outlined" style="font-size:11px;">person</span>Owner</span>'}
            </td>

            <!-- 13. Price (Numeric) -->
            <td class="is-numeric" style="font-variant-numeric: tabular-nums; font-weight:600; text-align:right;">
              ₹${rec.amount.toLocaleString('en-IN')}
            </td>

            <!-- 14. Status -->
            <td>${renderStatusBadge(rec.status)}</td>

            <!-- 15. Sticky Right Actions -->
            <td class="cwp-v2-col-actions is-sticky-action" style="text-align:right;">
              <div style="display:inline-flex; align-items:center; gap:4px; justify-content:flex-end;">
                ${rec.staff === 'Unassigned'
                  ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-primary cwp-v2-btn-sm v2-t7-assign-row-btn" data-id="${rec.id}" style="height:24px; padding:0 6px; font-size:11px;" title="Assign technician">
                      <span class="material-symbols-outlined" style="font-size:13px;">person_add</span>
                      <span>Assign</span>
                    </button>`
                  : `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm v2-t7-view-row-btn" data-id="${rec.id}" style="height:24px; padding:0 6px; font-size:11px;" title="View dispatch sheet">
                      <span class="material-symbols-outlined" style="font-size:13px;">visibility</span>
                      <span>View</span>
                    </button>`}

                <!-- Overflow Menu -->
                <div class="cwp-v2-row-menu-wrap">
                  <button type="button" class="cwp-v2-row-action-btn v2-t7-overflow-trigger" data-id="${rec.id}" aria-label="More actions for ${rec.id}" title="More actions">
                    <span class="material-symbols-outlined" style="font-size:16px;">more_vert</span>
                  </button>
                  <div class="cwp-v2-table-overflow-menu" id="overflow-menu-${rec.id}">
                    <button type="button" class="cwp-v2-table-overflow-item" data-action="timeline" data-id="${rec.id}">
                      <span class="material-symbols-outlined">history</span><span>Audit Timeline</span>
                    </button>
                    <button type="button" class="cwp-v2-table-overflow-item" data-action="print" data-id="${rec.id}">
                      <span class="material-symbols-outlined">print</span><span>Print Work Order</span>
                    </button>
                    <button type="button" class="cwp-v2-table-overflow-item" data-action="reassign" data-id="${rec.id}">
                      <span class="material-symbols-outlined">swap_horiz</span><span>Reassign Slot</span>
                    </button>
                    <div style="border-top:1px solid var(--cwp-v2-sys-outline-variant); margin:3px 0;"></div>
                    <button type="button" class="cwp-v2-table-overflow-item" data-action="cancel" data-id="${rec.id}" style="color:var(--cwp-v2-status-danger);">
                      <span class="material-symbols-outlined">cancel</span><span>Cancel Job</span>
                    </button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `;

        // 15.7 Expandable Row Detail
        if (isExpanded) {
          rowsHtml += `
            <tr class="cwp-v2-expanded-row is-expanded" id="expanded-row-${rec.id}">
              <td colspan="15" style="padding:0;">
                <div class="cwp-v2-expanded-panel">
                  <div class="cwp-v2-expanded-grid">
                    
                    <!-- Col 1: Customer & Access Directives -->
                    <div class="cwp-v2-expanded-card">
                      <div class="cwp-v2-expanded-card-title">
                        <span class="material-symbols-outlined" style="font-size:14px; color:var(--cwp-v2-sys-primary);">contacts</span>
                        <span>Customer &amp; Access Details</span>
                      </div>
                      <div><strong>Contact:</strong> ${escapeHtml(rec.customer)} &bull; <a href="tel:${rec.phone}" style="color:var(--cwp-v2-sys-primary); text-decoration:none;">${escapeHtml(rec.phone)}</a></div>
                      <div><strong>Society:</strong> ${escapeHtml(rec.society)}</div>
                      <div><strong>Parking Bay:</strong> <code>${escapeHtml(rec.bay)}</code></div>
                      <div><strong>Key Deposit:</strong> ${rec.keyWithGuard ? '<span style="color:var(--cwp-v2-status-success); font-weight:600;">Key deposited with Security Gate (Pass verified)</span>' : '<span style="color:var(--cwp-v2-sys-on-surface-variant);">Owner will be present with physical key</span>'}</div>
                    </div>

                    <!-- Col 2: Vehicle & Package Specifications -->
                    <div class="cwp-v2-expanded-card">
                      <div class="cwp-v2-expanded-card-title">
                        <span class="material-symbols-outlined" style="font-size:14px; color:var(--cwp-v2-sys-primary);">directions_car</span>
                        <span>Vehicle &amp; Service Package</span>
                      </div>
                      <div><strong>Registration:</strong> <code>${escapeHtml(rec.vehicle)}</code> (${escapeHtml(rec.vehicleType)})</div>
                      <div><strong>Make &amp; Model:</strong> ${escapeHtml(rec.makeModel)}</div>
                      <div><strong>Service Package:</strong> <strong>${escapeHtml(rec.service)}</strong> (₹${rec.amount.toLocaleString('en-IN')})</div>
                      <div><strong>Scheduled Slot:</strong> ${escapeHtml(rec.date)} &bull; ${escapeHtml(rec.slot)}</div>
                    </div>

                    <!-- Col 3: Dispatch Directives & Operations Notes -->
                    <div class="cwp-v2-expanded-card">
                      <div class="cwp-v2-expanded-card-title">
                        <span class="material-symbols-outlined" style="font-size:14px; color:var(--cwp-v2-sys-primary);">engineering</span>
                        <span>Dispatch &amp; Operations Directives</span>
                      </div>
                      <div><strong>Assigned Tech:</strong> <strong>${escapeHtml(rec.staff)}</strong></div>
                      <div><strong>Priority Level:</strong> ${renderPriorityBadge(rec.priority)}</div>
                      <div><strong>Operational Notes:</strong> <span style="font-style:italic; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(rec.notes || 'No special instructions recorded.')}</span></div>
                      <div style="margin-top:6px; display:flex; gap:6px;">
                        <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm v2-t7-print-slip-btn" data-id="${rec.id}" style="height:22px; font-size:10.5px; padding:0 6px;">
                          <span class="material-symbols-outlined" style="font-size:12px;">receipt_long</span><span>Job Sheet</span>
                        </button>
                        <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm v2-t7-call-staff-btn" data-id="${rec.id}" style="height:22px; font-size:10.5px; padding:0 6px;">
                          <span class="material-symbols-outlined" style="font-size:12px;">call</span><span>Call Staff</span>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </td>
            </tr>
          `;
        }
      });

      tableBodyEl.innerHTML = rowsHtml;

      // Update Select-All Checkbox state
      updateSelectAllPageCheckbox(pageRecords);

      // Update Bulk Action Toolbar
      updateBulkBar(sorted);

      // Update Sorting Indicators on table headers
      updateSortHeadersUI();

      // Update Pagination UI
      updatePaginationUI(startIndex + 1, endIndex, totalRecords, currentData.length, totalPages);

      // Update Expand All button text/icon
      updateExpandAllUI(pageRecords);

      // Update Filter Summary Bar
      updateSummaryBar();
    }

    // 6. Update Expand All UI State
    function updateExpandAllUI(pageRecords) {
      if (!toggleAllExpandBtn || !toggleAllExpandIcon || !toggleAllExpandText) return;
      if (pageRecords.length === 0) return;

      const allVisibleExpanded = pageRecords.every(r => state.expandedIds.has(r.id));
      if (allVisibleExpanded) {
        toggleAllExpandIcon.textContent = 'unfold_less';
        toggleAllExpandText.textContent = 'Collapse All Rows';
      } else {
        toggleAllExpandIcon.textContent = 'unfold_more';
        toggleAllExpandText.textContent = 'Expand All Rows';
      }
    }

    // 7. Update Select All Page Checkbox
    function updateSelectAllPageCheckbox(pageRecords) {
      if (!selectAllPageCheckbox) return;
      if (pageRecords.length === 0) {
        selectAllPageCheckbox.checked = false;
        selectAllPageCheckbox.indeterminate = false;
        return;
      }

      const selectedOnPage = pageRecords.filter(r => state.selectedIds.has(r.id)).length;
      if (selectedOnPage === 0) {
        selectAllPageCheckbox.checked = false;
        selectAllPageCheckbox.indeterminate = false;
      } else if (selectedOnPage === pageRecords.length) {
        selectAllPageCheckbox.checked = true;
        selectAllPageCheckbox.indeterminate = false;
      } else {
        selectAllPageCheckbox.checked = false;
        selectAllPageCheckbox.indeterminate = true;
      }
    }

    // 8. Update Bulk Bar
    function updateBulkBar(sortedData) {
      if (!bulkBarEl || !bulkCountEl) return;
      const count = state.selectedIds.size;
      if (count > 0) {
        bulkBarEl.style.display = 'flex';
        bulkCountEl.textContent = `${count} selected`;
      } else {
        bulkBarEl.style.display = 'none';
      }
    }

    // 9. Update Sort Headers UI
    function updateSortHeadersUI() {
      const headers = tableEl.querySelectorAll('th.is-sortable');
      headers.forEach(th => {
        const col = th.getAttribute('data-sort');
        const icon = th.querySelector('.cwp-v2-sort-icon');
        if (col === state.sortCol) {
          th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
          if (icon) {
            icon.textContent = state.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
            icon.style.color = 'var(--cwp-v2-sys-primary)';
          }
        } else {
          th.setAttribute('aria-sort', 'none');
          if (icon) {
            icon.textContent = 'unfold_more';
            icon.style.color = '';
          }
        }
      });
    }

    // 10. Update Pagination UI
    function updatePaginationUI(start, end, totalFiltered, totalRaw, totalPages) {
      if (paginationRangeEl) {
        if (totalFiltered === 0) {
          paginationRangeEl.textContent = 'Showing 0 records';
        } else {
          paginationRangeEl.textContent = `Showing ${start}–${end} of ${totalFiltered} records`;
        }
      }

      if (filteredNoteEl) {
        if (totalFiltered < totalRaw) {
          filteredNoteEl.textContent = `(Filtered from ${totalRaw} total)`;
        } else {
          filteredNoteEl.textContent = '(Unfiltered)';
        }
      }

      if (pageIndicatorEl) {
        pageIndicatorEl.textContent = `Page ${state.page} of ${totalPages || 1}`;
      }

      if (firstPageBtn) firstPageBtn.disabled = state.page <= 1;
      if (prevPageBtn) prevPageBtn.disabled = state.page <= 1;
      if (nextPageBtn) nextPageBtn.disabled = state.page >= (totalPages || 1);
      if (lastPageBtn) lastPageBtn.disabled = state.page >= (totalPages || 1);
    }

    // 11. Update Summary Bar
    function updateSummaryBar() {
      if (!summaryBar || !activeFilterCountEl || !filterTagsContainer) return;

      const activeTags = [];
      if (state.filters.search) {
        activeTags.push({ key: 'search', label: `Search: "${state.filters.search}"` });
      }
      if (state.filters.city !== 'ALL') {
        activeTags.push({ key: 'city', label: `City: ${state.filters.city}` });
      }
      if (state.filters.service !== 'ALL') {
        activeTags.push({ key: 'service', label: `Service: ${state.filters.service}` });
      }
      if (state.filters.status !== 'ALL') {
        activeTags.push({ key: 'status', label: `Status: ${state.filters.status}` });
      }
      if (state.filters.priority !== 'ALL') {
        activeTags.push({ key: 'priority', label: `Priority: ${state.filters.priority}` });
      }
      if (state.filters.chip !== 'all') {
        const chipLabels = {
          'today': "Today's Jobs",
          'unassigned': 'Unassigned Only',
          'high-priority': 'High Priority',
          'in-progress': 'In Progress',
          'completed': 'Completed'
        };
        activeTags.push({ key: 'chip', label: `Filter: ${chipLabels[state.filters.chip] || state.filters.chip}` });
      }

      if (activeTags.length > 0) {
        summaryBar.style.display = 'flex';
        activeFilterCountEl.textContent = `${activeTags.length} Filter${activeTags.length > 1 ? 's' : ''} Active:`;
        filterTagsContainer.innerHTML = activeTags.map(tag => `
          <span class="cwp-v2-active-filter-tag">
            <span>${escapeHtml(tag.label)}</span>
            <button type="button" class="cwp-v2-filter-tag-remove v2-t7-remove-filter" data-key="${tag.key}" aria-label="Remove filter ${tag.key}">&times;</button>
          </span>
        `).join('');
      } else {
        summaryBar.style.display = 'none';
        filterTagsContainer.innerHTML = '';
      }
    }

    // 12. Clear All Filters Helper
    function clearAllFilters() {
      state.filters = {
        search: '',
        city: 'ALL',
        service: 'ALL',
        status: 'ALL',
        priority: 'ALL',
        chip: 'all'
      };
      if (searchInput) {
        searchInput.value = '';
        if (searchClearBtn) searchClearBtn.style.display = 'none';
      }
      if (cityFilter) cityFilter.value = 'ALL';
      if (serviceFilter) serviceFilter.value = 'ALL';
      if (statusFilter) statusFilter.value = 'ALL';
      if (priorityFilter) priorityFilter.value = 'ALL';

      // Reset chips
      if (chipsCluster) {
        chipsCluster.querySelectorAll('.cwp-v2-filter-chip').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-table-chip') === 'all');
        });
      }

      state.page = 1;
      state.previewState = 'data';

      // Reset state switcher buttons
      document.querySelectorAll('.v2-t7-state-btn').forEach(b => {
        const isData = b.getAttribute('data-state') === 'data';
        b.classList.toggle('cwp-v2-btn-primary', isData);
        b.classList.toggle('cwp-v2-btn-secondary', !isData);
      });

      render();
      showFeedback(`
        <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span>
        <span>All filters cleared &bull; Table restored to full dataset</span>
      `);
    }

    // =========================================================================
    // EVENT BINDINGS
    // =========================================================================

    // A. Density Buttons
    document.querySelectorAll('.v2-t7-density-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const density = this.getAttribute('data-density');
        state.density = density;

        document.querySelectorAll('.v2-t7-density-btn').forEach(b => {
          b.classList.remove('cwp-v2-btn-primary');
          b.classList.add('cwp-v2-btn-secondary');
        });
        this.classList.remove('cwp-v2-btn-secondary');
        this.classList.add('cwp-v2-btn-primary');

        if (density === 'compact') {
          tableEl.classList.remove('is-standard-mode');
          tableEl.classList.add('is-compact-mode');
          showFeedback(`
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">density_medium</span>
            <span>Switched to <strong>Compact Mode (34px)</strong> &bull; Locked Decision #9 operational density</span>
          `);
        } else {
          tableEl.classList.remove('is-compact-mode');
          tableEl.classList.add('is-standard-mode');
          showFeedback(`
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">density_medium</span>
            <span>Switched to <strong>Standard Mode (46px)</strong> &bull; Comfortable multi-line spacing</span>
          `);
        }
      });
    });

    // B. State Switcher Buttons
    document.querySelectorAll('.v2-t7-state-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const st = this.getAttribute('data-state');
        state.previewState = st;

        document.querySelectorAll('.v2-t7-state-btn').forEach(b => {
          b.classList.remove('cwp-v2-btn-primary');
          b.classList.add('cwp-v2-btn-secondary');
        });
        this.classList.remove('cwp-v2-btn-secondary');
        this.classList.add('cwp-v2-btn-primary');

        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">tune</span>
          <span>State Preview: <strong>${escapeHtml(st.toUpperCase())}</strong></span>
        `);
      });
    });

    // C. Search Input & Clear
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.filters.search = this.value;
        if (searchClearBtn) {
          searchClearBtn.style.display = this.value ? 'inline-flex' : 'none';
        }
        state.page = 1;
        render();
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', function () {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        this.style.display = 'none';
        state.filters.search = '';
        state.page = 1;
        render();
      });
    }

    // D. Dropdown Filters
    if (cityFilter) {
      cityFilter.addEventListener('change', function () {
        state.filters.city = this.value;
        state.page = 1;
        render();
      });
    }

    if (serviceFilter) {
      serviceFilter.addEventListener('change', function () {
        state.filters.service = this.value;
        state.page = 1;
        render();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', function () {
        state.filters.status = this.value;
        state.page = 1;
        render();
      });
    }

    if (priorityFilter) {
      priorityFilter.addEventListener('change', function () {
        state.filters.priority = this.value;
        state.page = 1;
        render();
      });
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', clearAllFilters);
    }

    // E. Chip Cluster
    if (chipsCluster) {
      chipsCluster.addEventListener('click', function (e) {
        const chip = e.target.closest('.cwp-v2-filter-chip');
        if (!chip) return;
        const chipVal = chip.getAttribute('data-table-chip');
        state.filters.chip = chipVal;

        chipsCluster.querySelectorAll('.cwp-v2-filter-chip').forEach(c => {
          c.classList.remove('is-active');
        });
        chip.classList.add('is-active');

        state.page = 1;
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">filter_alt</span>
          <span>Applied chip filter: <strong>${escapeHtml(chip.textContent.trim())}</strong></span>
        `);
      });
    }

    // F. Filter Tags Remove & Summary Reset
    if (filterTagsContainer) {
      filterTagsContainer.addEventListener('click', function (e) {
        const btn = e.target.closest('.v2-t7-remove-filter');
        if (!btn) return;
        const key = btn.getAttribute('data-key');
        if (key === 'search') {
          state.filters.search = '';
          if (searchInput) searchInput.value = '';
          if (searchClearBtn) searchClearBtn.style.display = 'none';
        } else if (key === 'city') {
          state.filters.city = 'ALL';
          if (cityFilter) cityFilter.value = 'ALL';
        } else if (key === 'service') {
          state.filters.service = 'ALL';
          if (serviceFilter) serviceFilter.value = 'ALL';
        } else if (key === 'status') {
          state.filters.status = 'ALL';
          if (statusFilter) statusFilter.value = 'ALL';
        } else if (key === 'priority') {
          state.filters.priority = 'ALL';
          if (priorityFilter) priorityFilter.value = 'ALL';
        } else if (key === 'chip') {
          state.filters.chip = 'all';
          if (chipsCluster) {
            chipsCluster.querySelectorAll('.cwp-v2-filter-chip').forEach(c => {
              c.classList.toggle('is-active', c.getAttribute('data-table-chip') === 'all');
            });
          }
        }
        state.page = 1;
        render();
      });
    }

    if (summaryResetBtn) {
      summaryResetBtn.addEventListener('click', clearAllFilters);
    }

    // G. Column Headers Sorting
    tableEl.querySelectorAll('th.is-sortable').forEach(th => {
      function triggerSort() {
        const col = th.getAttribute('data-sort');
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortCol = col;
          state.sortDir = (col === 'amount' || col === 'id') ? 'desc' : 'asc';
        }
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">sort</span>
          <span>Sorted column <strong>${col}</strong> (${state.sortDir.toUpperCase()})</span>
        `);
      }

      th.addEventListener('click', triggerSort);
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'button');
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerSort();
        }
      });
    });

    // H. Select All on Current Page Checkbox
    if (selectAllPageCheckbox) {
      selectAllPageCheckbox.addEventListener('change', function () {
        const filtered = getFilteredData();
        const sorted = getSortedData(filtered);
        const startIndex = (state.page - 1) * state.pageSize;
        const endIndex = Math.min(startIndex + state.pageSize, sorted.length);
        const pageRecords = sorted.slice(startIndex, endIndex);

        if (this.checked) {
          pageRecords.forEach(r => state.selectedIds.add(r.id));
        } else {
          pageRecords.forEach(r => state.selectedIds.delete(r.id));
        }
        render();
      });
    }

    // I. Select All Dataset & Clear Selection
    if (selectAllDatasetBtn) {
      selectAllDatasetBtn.addEventListener('click', function () {
        const filtered = getFilteredData();
        filtered.forEach(r => state.selectedIds.add(r.id));
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">select_all</span>
          <span>Selected all <strong>${filtered.length}</strong> filtered records</span>
        `);
      });
    }

    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', function () {
        state.selectedIds.clear();
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-on-surface-variant);">clear_all</span>
          <span>Cleared row selections</span>
        `);
      });
    }

    // J. Bulk Actions Toolbar Buttons
    document.querySelectorAll('.v2-t7-bulk-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const action = this.getAttribute('data-action');
        const count = state.selectedIds.size;
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span>
          <span>Bulk Action <strong>"${escapeHtml(action)}"</strong> executed on ${count} records</span>
        `);
      });
    });

    // K. Toggle All Expand Button
    if (toggleAllExpandBtn) {
      toggleAllExpandBtn.addEventListener('click', function () {
        const filtered = getFilteredData();
        const sorted = getSortedData(filtered);
        const startIndex = (state.page - 1) * state.pageSize;
        const endIndex = Math.min(startIndex + state.pageSize, sorted.length);
        const pageRecords = sorted.slice(startIndex, endIndex);

        const allVisibleExpanded = pageRecords.every(r => state.expandedIds.has(r.id));
        if (allVisibleExpanded) {
          pageRecords.forEach(r => state.expandedIds.delete(r.id));
        } else {
          pageRecords.forEach(r => state.expandedIds.add(r.id));
        }
        render();
      });
    }

    // L. Table Body Delegated Clicks (Row Checkbox, Expand Chevron, Row Actions, Overflow)
    tableBodyEl.addEventListener('click', function (e) {
      // 1. Row selection checkbox
      const chk = e.target.closest('.v2-t7-row-checkbox');
      if (chk) {
        const id = chk.getAttribute('data-id');
        if (chk.checked) {
          state.selectedIds.add(id);
        } else {
          state.selectedIds.delete(id);
        }
        render();
        return;
      }

      // 2. Expand toggle button
      const expandBtn = e.target.closest('.v2-t7-expand-btn');
      if (expandBtn) {
        const id = expandBtn.getAttribute('data-id');
        if (state.expandedIds.has(id)) {
          state.expandedIds.delete(id);
        } else {
          state.expandedIds.add(id);
        }
        render();
        return;
      }

      // 3. Assign button
      const assignBtn = e.target.closest('.v2-t7-assign-row-btn');
      if (assignBtn) {
        const id = assignBtn.getAttribute('data-id');
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">person_add</span>
          <span>Assign modal triggered for job <strong>${id}</strong></span>
        `);
        return;
      }

      // 4. View details button
      const viewBtn = e.target.closest('.v2-t7-view-row-btn');
      if (viewBtn) {
        const id = viewBtn.getAttribute('data-id');
        if (state.expandedIds.has(id)) {
          state.expandedIds.delete(id);
        } else {
          state.expandedIds.add(id);
        }
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">visibility</span>
          <span>Toggled inline details card for job <strong>${id}</strong></span>
        `);
        return;
      }

      // 5. Overflow menu trigger
      const menuTrigger = e.target.closest('.v2-t7-overflow-trigger');
      if (menuTrigger) {
        e.stopPropagation();
        const id = menuTrigger.getAttribute('data-id');
        const menu = document.getElementById('overflow-menu-' + id);
        if (menu) {
          const isOpen = menu.classList.contains('is-open');
          document.querySelectorAll('.cwp-v2-table-overflow-menu.is-open').forEach(m => m.classList.remove('is-open'));
          if (!isOpen) {
            menu.classList.add('is-open');
          }
        }
        return;
      }

      // 6. Overflow menu item click
      const menuItem = e.target.closest('.cwp-v2-table-overflow-item');
      if (menuItem) {
        const action = menuItem.getAttribute('data-action');
        const id = menuItem.getAttribute('data-id');
        document.querySelectorAll('.cwp-v2-table-overflow-menu.is-open').forEach(m => m.classList.remove('is-open'));
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">task_alt</span>
          <span>Action <strong>"${escapeHtml(action)}"</strong> executed for job <strong>${id}</strong></span>
        `);
        return;
      }

      // 7. Expanded card inner actions (Print slip, Call staff)
      const printBtn = e.target.closest('.v2-t7-print-slip-btn');
      if (printBtn) {
        const id = printBtn.getAttribute('data-id');
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">print</span>
          <span>Printing dispatch job sheet for <strong>${id}</strong></span>
        `);
        return;
      }

      const callBtn = e.target.closest('.v2-t7-call-staff-btn');
      if (callBtn) {
        const id = callBtn.getAttribute('data-id');
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-sys-primary);">call</span>
          <span>Contacting dispatch technician for <strong>${id}</strong></span>
        `);
        return;
      }
    });

    // Close overflow menus on outside click
    document.addEventListener('click', function () {
      document.querySelectorAll('.cwp-v2-table-overflow-menu.is-open').forEach(m => {
        m.classList.remove('is-open');
      });
    });

    // M. Pagination Controls
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', function () {
        state.pageSize = parseInt(this.value, 10) || 10;
        state.page = 1;
        render();
      });
    }

    if (firstPageBtn) {
      firstPageBtn.addEventListener('click', function () {
        state.page = 1;
        render();
      });
    }

    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', function () {
        if (state.page > 1) {
          state.page--;
          render();
        }
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', function () {
        const filtered = getFilteredData();
        const totalPages = Math.ceil(filtered.length / state.pageSize);
        if (state.page < totalPages) {
          state.page++;
          render();
        }
      });
    }

    if (lastPageBtn) {
      lastPageBtn.addEventListener('click', function () {
        const filtered = getFilteredData();
        const totalPages = Math.ceil(filtered.length / state.pageSize);
        state.page = totalPages;
        render();
      });
    }

    // N. Refresh & New Job Buttons
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        currentData = [...TASK07_OPERATIONS_DATASET];
        state.selectedIds.clear();
        state.expandedIds.clear();
        clearAllFilters();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">refresh</span>
          <span>Operations dataset refreshed to initial state (36 records)</span>
        `);
      });
    }

    if (newJobBtn) {
      newJobBtn.addEventListener('click', function () {
        const newId = 'CWP-' + (8842 + currentData.length - 36);
        const newRecord = {
          id: newId,
          customer: "Aditi Rao Hydari",
          phone: "+91 98450 99881",
          society: "Prestige Augusta Golf Village",
          bay: "Villa 108 Porch",
          vehicle: "KA-01-MJ-9999",
          makeModel: "Range Rover Velar (Santorini Black)",
          vehicleType: "Luxury",
          city: "Bengaluru",
          zone: "North Bangalore",
          route: "Hennur Road",
          service: "Ceramic Foam Wash",
          staff: "Unassigned",
          slot: "05:30 PM",
          date: "2026-11-26",
          amount: 2200,
          status: "Confirmed",
          priority: "High",
          progress: 0,
          keyWithGuard: true,
          notes: "Express evening dispatch booking created from playground."
        };
        currentData.unshift(newRecord);
        state.page = 1;
        render();
        showFeedback(`
          <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">add_task</span>
          <span>Simulated new operational booking created: <strong>${newId}</strong></span>
        `);
      });
    }

    if (emptyClearBtn) {
      emptyClearBtn.addEventListener('click', clearAllFilters);
    }

    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function () {
        state.previewState = 'loading';
        render();
        setTimeout(function () {
          state.previewState = 'data';
          render();
          showFeedback(`
            <span class="material-symbols-outlined" style="font-size:16px; color:var(--cwp-v2-status-success);">check_circle</span>
            <span>Connection re-established &bull; Live operational data loaded</span>
          `);
        }, 600);
      });
    }

    // Initial render
    render();
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.CWP_ADMIN_V2.playground = {
    init
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
