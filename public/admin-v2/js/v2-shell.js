/**
 * CWP Admin V2 Shell Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.shell
 * Manages dark navy sidebar (#0b1a2b), 10 production tabs + aliases, collapsible groups & rail,
 * responsive drawer (<1024px), contextual header (breadcrumbs, title, EN/HI switcher, profile menu),
 * and URL/history routing (?tab=, #admin/<tab>, pushState, popstate, hashchange).
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const STORAGE_KEY_TAB = 'cwp_admin_active_tab';
  const STORAGE_KEY_COLLAPSED = 'cwp_admin_sidebar_collapsed';
  const STORAGE_KEY_LANG = 'cwp_lang';

  const TAB_META = {
    dashboard: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'Dashboard',
      titleHi: 'डैशबोर्ड',
      subtitle: 'Real-time daily cleans, special jobs & crew overview',
      subtitleHi: 'दैनिक सफाई, विशेष सेवाएं और स्टाफ सारांश'
    },
    cleanReports: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'Daily Cleaning Status',
      titleHi: 'दैनिक सफाई स्थिति',
      subtitle: 'Live daily car wash proof, photo rate & staff matrix',
      subtitleHi: 'दैनिक सफाई रिपोर्ट, फोटो प्रमाण और स्टाफ स्थिति'
    },
    specialJobs: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'Other Cleaning Status',
      titleHi: 'अन्य सफाई स्थिति',
      subtitle: 'Car wash, solar panel, interior & exterior detailing ledger',
      subtitleHi: 'कार वॉश, सोलर पैनल और डिटेलिंग कार्य सूची'
    },
    jobAssignment: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'Assign Jobs',
      titleHi: 'कार्य आवंटन',
      subtitle: 'Daily clean assignments & service dispatch allocation',
      subtitleHi: 'दैनिक सफाई और सेवा कार्य आवंटन'
    },
    staffTracking: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'Track Staff',
      titleHi: 'स्टाफ ट्रैकिंग',
      subtitle: 'Live field telemetry, active crew & stoppage monitoring',
      subtitleHi: 'लाइव फील्ड लोकेशन और सक्रिय स्टाफ निगरानी'
    },
    sequence: {
      group: 'OPERATIONS',
      groupEn: 'Operations',
      groupHi: 'संचालन',
      title: 'DCC Route Plan',
      titleHi: 'DCC रूट प्लान',
      subtitle: 'Route sequences, stop ordering & unassigned vehicles',
      subtitleHi: 'रूट अनुक्रम और वाहन स्टॉप प्रबंधन'
    },
    records: {
      group: 'MANAGEMENT',
      groupEn: 'Management',
      groupHi: 'प्रबंधन',
      title: 'Customers',
      titleHi: 'ग्राहक रिकॉर्ड',
      subtitle: 'Manage customer accounts, vehicles, packages & subscriptions',
      subtitleHi: 'ग्राहक खाते, वाहन और पैकेज प्रबंधन'
    },
    serviceAssign: {
      group: 'MANAGEMENT',
      groupEn: 'Management',
      groupHi: 'प्रबंधन',
      title: 'Assign Booking',
      titleHi: 'बुकिंग आवंटन',
      subtitle: 'Schedule on-demand bookings & package redemptions',
      subtitleHi: 'ऑन-डिमांड सेवा बुकिंग और पैकेज रिडेम्पशन'
    },
    leads: {
      group: 'MANAGEMENT',
      groupEn: 'Management',
      groupHi: 'प्रबंधन',
      title: 'Leads',
      titleHi: 'लीड्स',
      subtitle: 'Incoming inquiries, follow-ups & customer conversion pipeline',
      subtitleHi: 'नए ग्राहक पूछताछ और रूपांतरण पाइपलाइन'
    },
    staff: {
      group: 'MANAGEMENT',
      groupEn: 'Management',
      groupHi: 'प्रबंधन',
      title: 'Staff',
      titleHi: 'स्टाफ',
      subtitle: 'Staff roster, designations, hierarchy & PIN management',
      subtitleHi: 'स्टाफ सूची, पद और पिन प्रबंधन'
    },
    'ui-lab': {
      group: 'DESIGN LAB',
      groupEn: 'Design Lab',
      groupHi: 'डिज़ाइन लैब',
      title: 'UI Playground',
      titleHi: 'UI प्लेग्राउंड',
      subtitle: 'CWP Aura Tokens, Buttons, Inputs, Overlays & Data Grid Showcase',
      subtitleHi: 'CWP Aura घटक और डिज़ाइन सिस्टम प्रदर्शनी'
    },
    security: {
      group: 'ACCOUNT',
      groupEn: 'Account',
      groupHi: 'खाता',
      title: 'Security & Devices',
      titleHi: 'सुरक्षा और डिवाइस',
      subtitle: 'Trusted devices, active sessions & security activity',
      subtitleHi: 'विश्वसनीय डिवाइस, सक्रिय सत्र और सुरक्षा गतिविधि'
    }
  };

  const TAB_ALIASES = {
    washSolar: 'specialJobs',
    addCust: 'records',
    customers: 'records'
  };

  let activeTab = 'records';
  let currentLang = 'en';
  let pendingIntent = null;
  let initialized = false;

  function normalizeTab(rawTab) {
    if (!rawTab) return null;
    const clean = String(rawTab).trim().replace(/^#+/, '').replace(/^admin\//i, '');
    if (!clean) return null;
    if (clean.includes('v2-sec-')) return 'ui-lab';
    if (TAB_ALIASES[clean]) {
      if (clean === 'addCust') pendingIntent = 'addCust';
      return TAB_ALIASES[clean];
    }
    if (TAB_META[clean]) return clean;
    return null;
  }

  function resolveInitialTab() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const queryTab = normalizeTab(params.get('tab'));
      if (queryTab) return queryTab;
    } catch (e) {}

    const rawHash = (window.location.hash || '').replace(/^#+/, '').trim();
    if (rawHash) {
      const hashTab = normalizeTab(rawHash);
      if (hashTab) return hashTab;
    }

    const path = (window.location.pathname || '').toLowerCase();
    if (path.endsWith('/ui-lab') || path.includes('/ui-lab/')) {
      return 'ui-lab';
    }

    try {
      const saved = normalizeTab(localStorage.getItem(STORAGE_KEY_TAB));
      if (saved && saved !== 'ui-lab') return saved;
    } catch (e) {}

    return 'records';
  }

  function getRouteUrlForTab(tabName) {
    const basePath = '/admin';
    if (tabName === 'ui-lab') {
      return `${basePath}/ui-lab#ui-lab`;
    }
    return `${basePath}?tab=${encodeURIComponent(tabName)}#admin/${encodeURIComponent(tabName)}`;
  }

  function updateHeaderContext(tabName) {
    const meta = TAB_META[tabName] || TAB_META.records;

    const titleEl = document.getElementById('v2HeaderTitle');
    const subtitleEl = document.getElementById('v2HeaderSubtitle');
    const crumbGroupEl = document.getElementById('v2BreadcrumbGroup');
    const crumbTabEl = document.getElementById('v2BreadcrumbTab');

    const titleText = meta.title;
    const subtitleText = meta.subtitle;
    const groupText = meta.groupEn;

    if (titleEl) titleEl.textContent = titleText;
    if (subtitleEl) subtitleEl.textContent = subtitleText;
    if (crumbGroupEl) crumbGroupEl.textContent = groupText;
    if (crumbTabEl) crumbTabEl.textContent = titleText;
  }

  function renderLiveTabShellSummary(tabName) {
    if (tabName === 'ui-lab') return;
    const viewEl = document.getElementById(`v2View_${tabName}`);
    if (!viewEl) return;

    const notifState = window.CWP_ADMIN_V2.notifications && window.CWP_ADMIN_V2.notifications.getState();
    const snaps = (notifState && notifState.snapshots) || {};
    const ui = window.CWP_ADMIN_V2.ui;
    const esc = ui ? ui.escapeHtml : (v => String(v || ''));

    const statusBox = viewEl.querySelector('[data-v2-live-summary]');
    if (!statusBox) return;

    let cards = [];
    if (tabName === 'records') {
      const custs = Array.isArray(snaps.customers) ? snaps.customers : null;
      const activeCount = custs ? custs.filter(c => c.active !== false && c.active !== 'No').length : '—';
      cards = [
        { label: 'Total Customers', value: custs ? custs.length : '—', meta: 'Live /api getAllCustomers' },
        { label: 'Active Accounts', value: activeCount, meta: 'Currently active subscriptions' },
        { label: 'Search Context', value: window.CWP_ADMIN_V2.searchContext && window.CWP_ADMIN_V2.searchContext.tab === 'records' ? window.CWP_ADMIN_V2.searchContext.title : 'Ready', meta: pendingIntent === 'addCust' ? 'Add Customer route alias active' : 'Module host container ready' }
      ];
    } else if (tabName === 'cleanReports') {
      const sum = (snaps.cleanReports && snaps.cleanReports.summary) || {};
      cards = [
        { label: 'Cleaned Today', value: sum.totalCleaned ?? '—', meta: `Active staff: ${sum.activeStaffCount ?? '—'}` },
        { label: 'With Photo Proof', value: sum.withPhotoCount ?? '—', meta: `Photo rate: ${sum.photoRate ?? 0}%` },
        { label: 'Car Not Present', value: sum.carNotPresentCount ?? '—', meta: 'Reported exceptions' }
      ];
    } else if (tabName === 'specialJobs') {
      const jobs = Array.isArray(snaps.specialJobs) ? snaps.specialJobs : null;
      const pending = jobs ? jobs.filter(j => String(j.status || '').toLowerCase() === 'pending').length : '—';
      const completed = jobs ? jobs.filter(j => String(j.status || '').toLowerCase() === 'completed').length : '—';
      cards = [
        { label: 'Total Special Jobs', value: jobs ? jobs.length : '—', meta: 'Live /api getSpecialJobs' },
        { label: 'Pending / Open', value: pending, meta: 'Awaiting completion' },
        { label: 'Completed', value: completed, meta: 'Verified jobs' }
      ];
    } else if (tabName === 'jobAssignment') {
      const list = snaps.assignments && Array.isArray(snaps.assignments.assignments) ? snaps.assignments.assignments : null;
      cards = [
        { label: 'Daily Assignments', value: list ? list.length : '—', meta: 'Live /api getDailyCleanAssignments' }
      ];
    } else if (tabName === 'staffTracking') {
      const kpis = (snaps.tracking && snaps.tracking.kpis) || {};
      cards = [
        { label: 'Active Staff', value: kpis.activeStaffCount ?? '—', meta: `Total crew: ${kpis.totalStaffCount ?? '—'}` },
        { label: 'Fleet Distance (km)', value: kpis.fleetDistanceKm ?? '—', meta: `Stoppages: ${kpis.totalStoppages ?? '—'}` }
      ];
    } else if (tabName === 'sequence') {
      const routes = Array.isArray(snaps.routes) ? snaps.routes : null;
      const unassigned = Array.isArray(snaps.unassignedVehicles) ? snaps.unassignedVehicles : null;
      cards = [
        { label: 'Configured Routes', value: routes ? routes.length : '—', meta: 'Live /api getAllRoutes' },
        { label: 'Unassigned Vehicles', value: unassigned ? unassigned.length : '—', meta: 'Live /api getUnassignedDccVehicles' }
      ];
    } else if (tabName === 'serviceAssign') {
      const custs = Array.isArray(snaps.customers) ? snaps.customers : null;
      cards = [
        { label: 'Eligible Customers', value: custs ? custs.length : '—', meta: 'Ready for service booking assignment' }
      ];
    } else if (tabName === 'leads') {
      const leads = Array.isArray(snaps.leads) ? snaps.leads : null;
      cards = [
        { label: 'Total Leads', value: leads ? leads.length : '—', meta: 'Live /api getLeads' }
      ];
    } else if (tabName === 'staff') {
      const staff = Array.isArray(snaps.staff) ? snaps.staff : null;
      const activeStaff = staff ? staff.filter(s => s.active !== false && s.active !== 'No').length : '—';
      cards = [
        { label: 'Total Staff', value: staff ? staff.length : '—', meta: 'Live /api getStaffList' },
        { label: 'Active Staff', value: activeStaff, meta: 'Enabled for field login' }
      ];
    }

    if (cards.length === 0) return;
    statusBox.innerHTML = cards.map(c => `
      <div class="cwp-v2-kpi-card">
        <div class="cwp-v2-kpi-label">${esc(c.label)}</div>
        <div class="cwp-v2-kpi-value">${esc(c.value)}</div>
        <div class="cwp-v2-kpi-meta">${esc(c.meta)}</div>
      </div>
    `).join('');
  }

  function navigateTo(rawTab, opts = {}) {
    const resolved = normalizeTab(rawTab) || 'records';
    const previousTab = activeTab;
    activeTab = resolved;

    const navItems = document.querySelectorAll('.cwp-v2-nav-item[data-tab]');
    navItems.forEach(item => {
      const isMatch = item.getAttribute('data-tab') === resolved;
      item.classList.toggle('is-active', isMatch);
      if (isMatch) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });

    const views = document.querySelectorAll('.cwp-v2-view');
    views.forEach(view => {
      view.classList.toggle('is-active', view.id === `v2View_${resolved}`);
    });

    updateHeaderContext(resolved);
    renderLiveTabShellSummary(resolved);

    if (resolved !== 'ui-lab') {
      try {
        localStorage.setItem(STORAGE_KEY_TAB, resolved);
      } catch (e) {}
    }

    if (!opts.skipHistory && window.history) {
      const targetUrl = getRouteUrlForTab(resolved);
      const stateObj = { tab: resolved, cwpV2Overlay: null };
      try {
        if (opts.replace) {
          window.history.replaceState(stateObj, '', targetUrl);
        } else if (previousTab !== resolved || opts.forcePush) {
          window.history.pushState(stateObj, '', targetUrl);
        }
      } catch (e) {}
    }

    if (window.innerWidth < 1024) {
      closeMobileDrawer();
    }

    window.dispatchEvent(new CustomEvent('cwp-v2:tab-changed', {
      detail: { tab: resolved, previousTab, intent: pendingIntent }
    }));

    if (resolved === 'records' && pendingIntent === 'addCust') {
      pendingIntent = null;
    }
  }

  function resolveTabFromHash() {
    const rawHash = (window.location.hash || '').replace(/^#+/, '').trim();
    if (!rawHash) return null;
    return normalizeTab(rawHash);
  }

  function handleUrlChange() {
    const tab = resolveInitialTab();
    navigateTo(tab, { skipHistory: true });
  }

  function handleHashChange() {
    const hashTab = resolveTabFromHash();
    const tab = hashTab || resolveInitialTab();
    navigateTo(tab, { replace: true });
  }

  function handlePopstate(e) {
    const overlay = window.CWP_ADMIN_V2.overlay;
    if (overlay && overlay.getStackDepth() > 0) {
      overlay.close(undefined, { fromPopstate: true });
      return;
    }
    if (e && e.state === null) {
      const hashTab = resolveTabFromHash();
      if (hashTab) {
        navigateTo(hashTab, { replace: true });
        return;
      }
    }
    handleUrlChange();
  }

  function toggleSidebarCollapse() {
    const sidebar = document.getElementById('v2Sidebar');
    const btn = document.getElementById('v2SidebarCollapseBtn');
    if (!sidebar) return;
    const next = !sidebar.classList.contains('is-collapsed');
    sidebar.classList.toggle('is-collapsed', next);
    if (btn) btn.setAttribute('aria-expanded', next ? 'false' : 'true');
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, next ? '1' : '0');
    } catch (e) {}
  }

  function openMobileDrawer() {
    const sidebar = document.getElementById('v2Sidebar');
    const backdrop = document.getElementById('v2SidebarBackdrop');
    const menuBtn = document.getElementById('v2MobileMenuBtn');
    if (sidebar) sidebar.classList.add('is-drawer-open');
    if (backdrop) backdrop.classList.add('is-visible');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeMobileDrawer() {
    const sidebar = document.getElementById('v2Sidebar');
    const backdrop = document.getElementById('v2SidebarBackdrop');
    const menuBtn = document.getElementById('v2MobileMenuBtn');
    if (sidebar) sidebar.classList.remove('is-drawer-open');
    if (backdrop) backdrop.classList.remove('is-visible');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }

  function applyLanguage() {
    currentLang = 'en';
    try {
      localStorage.setItem(STORAGE_KEY_LANG, 'en');
    } catch (e) {}

    document.documentElement.setAttribute('lang', 'en');

    document.querySelectorAll('.cwp-v2-nav-item[data-tab]').forEach(btn => {
      const tabKey = btn.getAttribute('data-tab');
      const labelEl = btn.querySelector('.cwp-v2-nav-label');
      const meta = TAB_META[tabKey];
      if (labelEl && meta) {
        labelEl.textContent = meta.title;
      }
    });

    updateHeaderContext(activeTab);
  }

  function updateProfileMenu(user) {
    const u = user || (window.CWP_ADMIN_V2.auth && window.CWP_ADMIN_V2.auth.getUser()) || {};
    const username = u.username || 'admin';
    const role = u.role || 'superadmin';
    const initial = String(username).charAt(0).toUpperCase() || 'A';

    const avatarEl = document.getElementById('v2ProfileAvatar');
    const nameEl = document.getElementById('v2ProfileName');
    const roleEl = document.getElementById('v2ProfileRole');
    const popNameEl = document.getElementById('v2PopoverProfileName');
    const popRoleEl = document.getElementById('v2PopoverProfileRole');

    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = username;
    if (roleEl) roleEl.textContent = role;
    if (popNameEl) popNameEl.textContent = username;
    if (popRoleEl) popRoleEl.textContent = `${role} • Active Session`;
  }

  function bindPopovers() {
    const langBtn = document.getElementById('v2LangBtn');
    const langMenu = document.getElementById('v2LangMenu');
    const profileBtn = document.getElementById('v2ProfileBtn');
    const profileMenu = document.getElementById('v2ProfileMenu');

    if (langBtn && langMenu) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (profileMenu) {
          profileMenu.hidden = true;
          if (profileBtn) profileBtn.setAttribute('aria-expanded', 'false');
        }
        const nextOpen = langMenu.hidden;
        langMenu.hidden = !nextOpen;
        langBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      });

      langMenu.addEventListener('click', (e) => {
        const choiceBtn = e.target.closest('[data-lang-choice]');
        if (!choiceBtn) return;
        applyLanguage(choiceBtn.getAttribute('data-lang-choice'));
        langMenu.hidden = true;
        langBtn.setAttribute('aria-expanded', 'false');
      });
    }

    if (profileBtn && profileMenu) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (langMenu) {
          langMenu.hidden = true;
          if (langBtn) langBtn.setAttribute('aria-expanded', 'false');
        }
        const nextOpen = profileMenu.hidden;
        profileMenu.hidden = !nextOpen;
        profileBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      });
    }

    document.addEventListener('click', (e) => {
      if (langMenu && !e.target.closest('#v2LangPopoverWrap')) {
        langMenu.hidden = true;
        if (langBtn) langBtn.setAttribute('aria-expanded', 'false');
      }
      if (profileMenu && !e.target.closest('#v2ProfilePopoverWrap')) {
        profileMenu.hidden = true;
        if (profileBtn) profileBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function bindAccountModals() {
    const openSecBtn = document.getElementById('v2OpenSecurityCenterBtn');
    const openLogoutBtns = [
      document.getElementById('v2OpenLogoutBtn'),
      document.getElementById('v2SidebarLogoutBtn')
    ].filter(Boolean);
    const profileMenu = document.getElementById('v2ProfileMenu');

    if (openSecBtn) {
      openSecBtn.addEventListener('click', () => {
        if (profileMenu) profileMenu.hidden = true;
        navigateTo('security');
      });
    }

    openLogoutBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (profileMenu) profileMenu.hidden = true;
        if (window.CWP_ADMIN_V2.overlay) {
          window.CWP_ADMIN_V2.overlay.open('v2LogoutConfirmModal', { triggerEl: btn });
        }
      });
    });

    const confirmLogoutBtn = document.getElementById('v2ConfirmLogoutBtn');
    if (confirmLogoutBtn) {
      confirmLogoutBtn.addEventListener('click', async () => {
        const api = window.CWP_ADMIN_V2.api;
        const doLogout = async () => {
          if (window.CWP_ADMIN_V2.app && typeof window.CWP_ADMIN_V2.app.performLogout === 'function') {
            await window.CWP_ADMIN_V2.app.performLogout();
          }
        };
        if (api) await api.withLoadingButton(confirmLogoutBtn, doLogout);
        else await doLogout();
      });
    }
  }

  function bindSidebarControls() {
    document.querySelectorAll('.cwp-v2-nav-item[data-tab]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab) navigateTo(tab);
      });
    });

    document.querySelectorAll('.cwp-v2-nav-group-toggle').forEach(toggleBtn => {
      toggleBtn.addEventListener('click', () => {
        const targetId = toggleBtn.getAttribute('aria-controls');
        const listEl = targetId ? document.getElementById(targetId) : null;
        const expanded = toggleBtn.getAttribute('aria-expanded') !== 'false';
        const nextExpanded = !expanded;
        toggleBtn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
        if (listEl) listEl.classList.toggle('is-collapsed', !nextExpanded);
      });
    });

    const collapseBtn = document.getElementById('v2SidebarCollapseBtn');
    if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebarCollapse);

    const mobileBtn = document.getElementById('v2MobileMenuBtn');
    const closeBtn = document.getElementById('v2SidebarCloseBtn');
    const backdrop = document.getElementById('v2SidebarBackdrop');
    if (mobileBtn) mobileBtn.addEventListener('click', openMobileDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeMobileDrawer);
    if (backdrop) backdrop.addEventListener('click', closeMobileDrawer);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const sidebar = document.getElementById('v2Sidebar');
        if (sidebar && sidebar.classList.contains('is-drawer-open')) {
          closeMobileDrawer();
        }
      }
    });

    try {
      if (localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1' && window.innerWidth >= 1024) {
        const sidebar = document.getElementById('v2Sidebar');
        if (sidebar) sidebar.classList.add('is-collapsed');
        if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'false');
      }
    } catch (e) {}
  }

  function init() {
    if (!initialized) {
      initialized = true;
      bindSidebarControls();
      bindPopovers();
      bindAccountModals();
      window.addEventListener('popstate', handlePopstate);
      window.addEventListener('hashchange', handleHashChange);
      window.addEventListener('cwp-v2:live-data-updated', () => renderLiveTabShellSummary(activeTab));
    }

    try {
      const savedLang = localStorage.getItem(STORAGE_KEY_LANG);
      applyLanguage(savedLang === 'hi' ? 'hi' : 'en');
    } catch (e) {
      applyLanguage('en');
    }

    const initialTab = resolveInitialTab();
    navigateTo(initialTab, { replace: true });
  }

  window.CWP_ADMIN_V2.shell = {
    init,
    navigateTo,
    switchView: navigateTo,
    getActiveTab: () => activeTab,
    getActiveView: () => activeTab,
    toggleSidebarCollapse,
    openMobileDrawer,
    closeMobileDrawer,
    updateProfileMenu,
    applyLanguage,
    resolveInitialTab
  };
})(window);
