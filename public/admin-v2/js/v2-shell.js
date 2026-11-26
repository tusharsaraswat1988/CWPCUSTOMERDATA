/**
 * CWP Admin V2 Shell Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.shell
 * Manages modern dark sidebar, contextual header, and view switching.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const VIEW_TITLES = {
    'ui-lab':  { title: 'CWP Aura UI Components & Overlays', subtitle: 'Tokens, Buttons, Inputs, Tables & Reusable Modal/Drawer System' },
    dashboard: { title: 'Admin Operations Dashboard', subtitle: 'Real-time daily operations overview' },
    customers: { title: 'Customer Directory', subtitle: 'Manage customer accounts, vehicles & schedules' },
    staff:     { title: 'Staff Management', subtitle: 'Staff roster, attendance & daily targets' },
    dispatch:  { title: 'Dispatch Control Center', subtitle: 'Workload management & service assignments' },
    settings:  { title: 'System & Configuration', subtitle: 'Platform settings & audit logs' }
  };

  let activeView = 'ui-lab';

  function init() {
    bindNavEvents();
    initClock();
    handleRouteOrHash();
    window.addEventListener('hashchange', handleRouteOrHash);
  }

  function bindNavEvents() {
    const navItems = document.querySelectorAll('.cwp-v2-nav-item[data-view]');
    navItems.forEach(item => {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        const targetView = this.getAttribute('data-view');
        if (targetView) {
          window.location.hash = targetView;
        }
      });
    });
  }

  function handleRouteOrHash() {
    let rawHash = (window.location.hash || '').replace(/^#+/, '').trim();
    let rawSearch = (window.location.search || '').replace(/^\?+/, '').trim();

    // Clean up malformed combinations like ?#v2-sec-inputs or ?v2-sec-forms
    if (rawHash.startsWith('?')) rawHash = rawHash.replace(/^\?+/, '').trim();
    if (rawSearch.startsWith('#')) rawSearch = rawSearch.replace(/^#+/, '').trim();

    let target = rawHash || rawSearch;
    let anchorToScroll = null;

    // Check if hash or search points to an in-page section anchor (e.g. #v2-sec-forms, #v2-sec-inputs, etc.)
    if (target && target.includes('v2-sec-')) {
      const match = target.match(/(v2-sec-[a-zA-Z0-9_-]+)/);
      if (match) {
        anchorToScroll = match[1];
      }
      target = 'ui-lab';
    }

    // Check direct pathname /admin-v2/ui-lab if no hash is specified
    if (!target) {
      target = 'ui-lab';
    }

    if (!VIEW_TITLES[target]) {
      // Check if hash target is an element ID inside ui-lab view
      const el = document.getElementById(target);
      if (el && el.closest('#v2View_ui-lab')) {
        anchorToScroll = target;
        target = 'ui-lab';
      } else {
        target = 'ui-lab';
      }
    }

    switchView(target);

    if (anchorToScroll) {
      setTimeout(() => {
        const el = document.getElementById(anchorToScroll);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }
  }

  function switchView(viewName) {
    activeView = viewName;

    // Update active nav item
    const navItems = document.querySelectorAll('.cwp-v2-nav-item[data-view]');
    navItems.forEach(item => {
      const match = item.getAttribute('data-view') === viewName;
      item.classList.toggle('is-active', match);
      if (match) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });

    // Update header contextual title and subtitle
    const info = VIEW_TITLES[viewName] || { title: 'Admin Portal', subtitle: '' };
    const titleEl = document.getElementById('v2HeaderTitle');
    const subtitleEl = document.getElementById('v2HeaderSubtitle');

    if (titleEl) titleEl.textContent = info.title;
    if (subtitleEl) subtitleEl.textContent = info.subtitle;

    // Toggle view containers
    const views = document.querySelectorAll('.cwp-v2-view');
    views.forEach(v => {
      const match = v.id === `v2View_${viewName}`;
      v.classList.toggle('is-active', match);
    });
  }

  function initClock() {
    const clockEl = document.getElementById('v2HeaderClock');
    if (!clockEl) return;

    function update() {
      const now = new Date();
      const options = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      clockEl.textContent = now.toLocaleDateString('en-IN', options);
    }
    update();
    setInterval(update, 30000);
  }

  window.CWP_ADMIN_V2.shell = {
    init,
    switchView,
    getActiveView: () => activeView
  };
})(window);
