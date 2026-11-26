/**
 * CWP Admin V2 Live Global Search Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.search
 * Queries live /api endpoints (getAllCustomers, getLeads, getStaffList, getSpecialJobs, getAllRoutes)
 * with 300ms debounce, in-flight deduplication, short TTL cache, keyboard navigation, and zero mock data.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const CACHE_TTL_MS = 30000;
  let cache = null;
  let cacheTimestamp = 0;
  let inFlightPromise = null;
  let debounceTimer = null;
  let activeIndex = -1;
  let currentMatches = [];
  let initialized = false;

  function invalidateCache() {
    cache = null;
    cacheTimestamp = 0;
  }

  function clear() {
    invalidateCache();
    inFlightPromise = null;
    currentMatches = [];
    activeIndex = -1;
    const input = document.getElementById('v2GlobalSearchInput');
    const clearBtn = document.getElementById('v2GlobalSearchClear');
    const popover = document.getElementById('v2GlobalSearchResults');
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.remove('is-visible');
    if (popover) {
      popover.hidden = true;
      popover.innerHTML = '';
    }
  }

  async function fetchLiveDataset(force = false) {
    if (!force && cache && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
      return cache;
    }
    if (inFlightPromise) return inFlightPromise;

    const api = window.CWP_ADMIN_V2.api;
    if (!api) return { customers: [], leads: [], staff: [], jobs: [], routes: [], hasError: true };

    inFlightPromise = (async () => {
      const results = await Promise.allSettled([
        api.request('getAllCustomers', {}),
        api.request('getLeads', {}),
        api.request('getStaffList', {}),
        api.request('getSpecialJobs', {}),
        api.request('getAllRoutes', {})
      ]);

      const anySuccess = results.some(r => r.status === 'fulfilled');
      if (!anySuccess) {
        const firstErr = results[0] && results[0].reason;
        throw firstErr || new Error('Failed to query live operational records.');
      }

      const customers = results[0].status === 'fulfilled' && Array.isArray(results[0].value)
        ? results[0].value
        : [];
      const leads = results[1].status === 'fulfilled' && Array.isArray(results[1].value)
        ? results[1].value
        : [];
      const staff = results[2].status === 'fulfilled' && Array.isArray(results[2].value)
        ? results[2].value
        : [];
      const jobsRaw = results[3].status === 'fulfilled' ? results[3].value : null;
      const jobs = jobsRaw && Array.isArray(jobsRaw.jobs) ? jobsRaw.jobs : (Array.isArray(jobsRaw) ? jobsRaw : []);
      const routesRaw = results[4].status === 'fulfilled' ? results[4].value : null;
      const routes = Array.isArray(routesRaw)
        ? routesRaw
        : (routesRaw && Array.isArray(routesRaw.routes) ? routesRaw.routes : []);

      cache = { customers, leads, staff, jobs, routes };
      cacheTimestamp = Date.now();
      return cache;
    })();

    try {
      return await inFlightPromise;
    } finally {
      inFlightPromise = null;
    }
  }

  function normalizeText(val) {
    return String(val === null || val === undefined ? '' : val).toLowerCase().trim();
  }

  function buildMatches(dataset, query) {
    const q = normalizeText(query);
    if (!q) return [];
    const matches = [];

    // Customers -> records
    dataset.customers.forEach(c => {
      const hay = [
        c.customerName, c.name, c.nameHi,
        c.customerNumber, c.phone, c.altPhone,
        c.vehicle, c.carNo, c.car_no, c.carModel, c.car_model,
        c.address, c.secondaryAddress, c.locality, c.colony,
        c.serviceCategory, c.customerCode, c.id
      ].map(normalizeText).join(' ');
      if (hay.includes(q)) {
        matches.push({
          group: 'Customers',
          tab: 'records',
          icon: 'directions_car',
          id: c.id || c.customer_id || c.customerCode || '',
          title: c.customerName || c.name || c.vehicle || c.carNo || c.customerNumber || c.phone || 'Customer',
          subtitle: [
            c.vehicle || c.carNo || c.car_no,
            c.customerNumber || c.phone,
            c.address || c.locality || c.colony
          ].filter(Boolean).join(' • ') || 'Customer record',
          tag: c.serviceCategory || c.category || 'Customer'
        });
      }
    });

    // Leads -> leads
    dataset.leads.forEach(l => {
      const hay = [
        l.customerName, l.name, l.nameHi,
        l.customerNumber, l.phone,
        l.vehicle, l.carNo, l.carModel,
        l.address, l.locality,
        l.leadStatus, l.stage, l.status,
        l.interestedService, l.serviceType,
        l.customerCode, l.id
      ].map(normalizeText).join(' ');
      if (hay.includes(q)) {
        matches.push({
          group: 'Leads',
          tab: 'leads',
          icon: 'contact_mail',
          id: l.id || l.customerCode || '',
          title: l.customerName || l.name || l.customerNumber || l.phone || 'Lead',
          subtitle: [
            l.customerNumber || l.phone,
            l.vehicle || l.carModel || l.carNo,
            l.interestedService || l.serviceType || l.leadStatus || l.stage || l.status
          ].filter(Boolean).join(' • ') || 'Sales lead',
          tag: l.leadStatus || l.stage || l.status || 'Lead'
        });
      }
    });

    // Staff -> staff
    dataset.staff.forEach(s => {
      const hay = [
        s.name, s.nameHi, s.phone, s.mobile,
        s.role, s.designationName, s.designation,
        s.area, s.zone, s.teamName, s.operationalScope,
        s.staffCode, s.id
      ].map(normalizeText).join(' ');
      if (hay.includes(q)) {
        matches.push({
          group: 'Staff',
          tab: 'staff',
          icon: 'badge',
          id: s.id || s.staffCode || '',
          title: s.name || s.id || 'Staff Member',
          subtitle: [
            s.id || s.staffCode,
            s.phone || s.mobile,
            s.designationName || s.designation || s.role,
            s.area || s.zone || s.teamName
          ].filter(Boolean).join(' • ') || 'Staff roster',
          tag: s.active === false || s.active === 'No' ? 'Inactive' : 'Active'
        });
      }
    });

    // Special Jobs -> specialJobs
    dataset.jobs.forEach(j => {
      const hay = [
        j.id, j.jobId,
        j.customerName, j.customer_name,
        j.customerPhone, j.phone,
        j.vehicle, j.carNo, j.car_no,
        j.address, j.serviceCategory, j.serviceType, j.service_type,
        j.staffName, j.status
      ].map(normalizeText).join(' ');
      if (hay.includes(q)) {
        matches.push({
          group: 'Special Jobs',
          tab: 'specialJobs',
          icon: 'solar_power',
          id: j.id || j.jobId || '',
          title: j.customerName || j.customer_name || j.serviceCategory || j.serviceType || j.id || 'Special Job',
          subtitle: [
            j.serviceCategory || j.serviceType || j.service_type,
            j.vehicle || j.carNo || j.car_no,
            j.customerPhone || j.phone,
            j.staffName
          ].filter(Boolean).join(' • ') || 'Job entry',
          tag: j.status || 'Job'
        });
      }
    });

    // Routes -> sequence
    dataset.routes.forEach(r => {
      const hay = [
        r.route_name, r.routeName, r.name,
        r.route_code, r.routeCode, r.code,
        r.operational_area, r.operationalArea, r.zone,
        r.assigned_staff_name, r.assignedStaffName, r.staff_name,
        r.id
      ].map(normalizeText).join(' ');
      if (hay.includes(q)) {
        matches.push({
          group: 'DCC Routes',
          tab: 'sequence',
          icon: 'route',
          id: r.id || r.route_code || r.routeCode || '',
          title: r.route_name || r.routeName || r.name || r.route_code || r.routeCode || r.code || 'Route',
          subtitle: [
            r.route_code || r.routeCode || r.code,
            r.operational_area || r.operationalArea || r.zone,
            r.assigned_staff_name || r.assignedStaffName || r.staff_name,
            r.status
          ].filter(Boolean).join(' • ') || 'Route plan',
          tag: 'Route'
        });
      }
    });

    return matches.slice(0, 18);
  }

  function renderResults(popover, matches, query) {
    const ui = window.CWP_ADMIN_V2.ui;
    const esc = ui ? ui.escapeHtml : (v => String(v || ''));
    currentMatches = matches;
    activeIndex = matches.length > 0 ? 0 : -1;

    if (matches.length === 0) {
      if (ui) {
        ui.renderEmptyState(popover, {
          icon: 'search_off',
          title: 'No matching live records',
          description: `No customers, leads, staff, jobs, or routes matched "${query}".`
        });
      } else {
        popover.textContent = 'No matching live records.';
      }
      popover.hidden = false;
      return;
    }

    let html = '';
    let lastGroup = '';
    matches.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        html += `<div class="cwp-v2-search-group-label">${esc(item.group)}</div>`;
      }
      html += `
        <button type="button" class="cwp-v2-search-result-item${idx === 0 ? ' is-active' : ''}" role="option" aria-selected="${idx === 0 ? 'true' : 'false'}" data-search-index="${idx}">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px; color:var(--cwp-v2-sys-primary);">${esc(item.icon)}</span>
          <div class="cwp-v2-search-result-main">
            <div class="cwp-v2-search-result-title">${esc(item.title)}</div>
            <div class="cwp-v2-search-result-sub">${esc(item.subtitle)}</div>
          </div>
          <span class="cwp-v2-search-result-tag">${esc(item.tag)}</span>
        </button>
      `;
    });

    popover.innerHTML = html;
    popover.hidden = false;
  }

  function selectMatch(idx) {
    const item = currentMatches[idx];
    if (!item) return;

    const popover = document.getElementById('v2GlobalSearchResults');
    if (popover) popover.hidden = true;

    window.CWP_ADMIN_V2.searchContext = {
      tab: item.tab,
      id: item.id,
      title: item.title,
      group: item.group,
      timestamp: Date.now()
    };

    if (window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.navigateTo === 'function') {
      window.CWP_ADMIN_V2.shell.navigateTo(item.tab, { searchContext: item });
    }
    window.dispatchEvent(new CustomEvent('cwp-v2:search-select', { detail: item }));
  }

  async function executeSearch(query, force = false) {
    const popover = document.getElementById('v2GlobalSearchResults');
    if (!popover) return;

    const trimmed = String(query || '').trim();
    if (trimmed.length < 2) {
      currentMatches = [];
      activeIndex = -1;
      popover.hidden = true;
      popover.innerHTML = '';
      return;
    }

    const ui = window.CWP_ADMIN_V2.ui;
    if (ui) {
      ui.renderSkeletonRows(popover, 3, 1);
      popover.hidden = false;
    }

    try {
      const dataset = await fetchLiveDataset(force);
      const matches = buildMatches(dataset, trimmed);
      renderResults(popover, matches, trimmed);
    } catch (err) {
      if (ui) {
        ui.renderErrorState(popover, {
          title: 'Search unavailable',
          message: err.message || 'Could not fetch live search records.',
          onRetry: () => executeSearch(trimmed, true)
        });
        popover.hidden = false;
      }
    }
  }

  function updateActiveOption(popover) {
    if (!popover) return;
    const items = popover.querySelectorAll('.cwp-v2-search-result-item');
    items.forEach((btn, idx) => {
      const isAct = idx === activeIndex;
      btn.classList.toggle('is-active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
      if (isAct && typeof btn.scrollIntoView === 'function') {
        btn.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const input = document.getElementById('v2GlobalSearchInput');
    const clearBtn = document.getElementById('v2GlobalSearchClear');
    const popover = document.getElementById('v2GlobalSearchResults');
    if (!input || !popover) return;

    input.addEventListener('input', () => {
      const val = input.value;
      if (clearBtn) clearBtn.classList.toggle('is-visible', val.trim().length > 0);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => executeSearch(val, false), 300);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2 && currentMatches.length > 0) {
        popover.hidden = false;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        popover.hidden = true;
        input.blur();
        return;
      }
      if (popover.hidden || currentMatches.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentMatches.length;
        updateActiveOption(popover);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
        updateActiveOption(popover);
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        selectMatch(activeIndex);
      }
    });

    popover.addEventListener('click', (e) => {
      const btn = e.target.closest('.cwp-v2-search-result-item');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-search-index'), 10);
      if (!Number.isNaN(idx)) selectMatch(idx);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clear();
        input.focus();
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#v2GlobalSearchWrap')) {
        popover.hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (window.CWP_ADMIN_V2.overlay && window.CWP_ADMIN_V2.overlay.getStackDepth() > 0) return;
      const appContainer = document.getElementById('v2AppContainer');
      if (appContainer && appContainer.hidden) return;
      e.preventDefault();
      input.focus();
    });
  }

  window.CWP_ADMIN_V2.search = {
    init,
    clear,
    invalidateCache,
    executeSearch
  };
})(window);
