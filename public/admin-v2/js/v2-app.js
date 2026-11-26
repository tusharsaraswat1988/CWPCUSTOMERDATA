/**
 * CWP Admin V2 Main Application Orchestrator
 * STRICTLY SCOPED to window.CWP_ADMIN_V2
 * Coordinates real auth/session verification, accessible login gate, shell routing,
 * live SSE/notifications, global search, and mid-session 401/403 lockout.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};
  window.CWP_ADMIN_V2.version = '2.1.0-shell';
  window.CWP_ADMIN_V2.mode = 'parallel_isolated';

  let loginBound = false;

  function setShellInert(locked) {
    const appContainer = document.getElementById('v2AppContainer');
    const loginGate = document.getElementById('v2LoginGate');

    if (appContainer) {
      appContainer.hidden = !!locked;
      appContainer.setAttribute('aria-hidden', locked ? 'true' : 'false');
      if ('inert' in appContainer) {
        appContainer.inert = !!locked;
      }
    }

    if (loginGate) {
      loginGate.hidden = !locked;
      loginGate.style.display = locked ? 'flex' : 'none';
      loginGate.setAttribute('aria-hidden', locked ? 'false' : 'true');
    }
  }

  function showLoginAlert(message) {
    const errEl = document.getElementById('v2LoginError');
    if (!errEl) return;
    if (message) {
      errEl.textContent = message;
      errEl.hidden = false;
    } else {
      errEl.textContent = '';
      errEl.hidden = true;
    }
  }

  function focusPasswordInput() {
    const input = document.getElementById('v2AdminPasswordInput');
    if (input) {
      setTimeout(() => {
        try { input.focus(); } catch (e) {}
      }, 20);
    }
  }

  function lockToLogin(reasonMessage) {
    if (window.CWP_ADMIN_V2.notifications) {
      window.CWP_ADMIN_V2.notifications.stop();
    }
    if (window.CWP_ADMIN_V2.trackStaff && typeof window.CWP_ADMIN_V2.trackStaff.stopPolling === 'function') {
      window.CWP_ADMIN_V2.trackStaff.stopPolling();
    }
    if (window.CWP_ADMIN_V2.search) {
      window.CWP_ADMIN_V2.search.clear();
    }
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.closeAll({ fromPopstate: true });
    }
    setShellInert(true);
    bindLoginGate();
    showLoginAlert(reasonMessage || '');
    focusPasswordInput();
  }

  function unlockShell(user) {
    showLoginAlert('');
    setShellInert(false);

    if (window.CWP_ADMIN_V2.shell) {
      window.CWP_ADMIN_V2.shell.init();
      window.CWP_ADMIN_V2.shell.updateProfileMenu(user);
    }
    if (window.CWP_ADMIN_V2.search) {
      window.CWP_ADMIN_V2.search.init();
    }
    if (window.CWP_ADMIN_V2.notifications) {
      window.CWP_ADMIN_V2.notifications.init();
      window.CWP_ADMIN_V2.notifications.start();
    }
    if (window.CWP_ADMIN_V2.customers) {
      window.CWP_ADMIN_V2.customers.init();
      window.CWP_ADMIN_V2.customers.loadData();
    }
    if (window.CWP_ADMIN_V2.staff) {
      window.CWP_ADMIN_V2.staff.init();
    }
    if (window.CWP_ADMIN_V2.bookings) {
      window.CWP_ADMIN_V2.bookings.init();
    }
    if (window.CWP_ADMIN_V2.leads) {
      window.CWP_ADMIN_V2.leads.init();
    }
    if (window.CWP_ADMIN_V2.trackStaff) {
      window.CWP_ADMIN_V2.trackStaff.init();
    }
    if (window.CWP_ADMIN_V2.cleanReports) {
      window.CWP_ADMIN_V2.cleanReports.init();
    }
    if (window.CWP_ADMIN_V2.specialJobs) {
      window.CWP_ADMIN_V2.specialJobs.init();
    }
    if (window.CWP_ADMIN_V2.assignJobs) {
      window.CWP_ADMIN_V2.assignJobs.init();
    }
  }

  async function performLogout() {
    if (window.CWP_ADMIN_V2.notifications) {
      window.CWP_ADMIN_V2.notifications.stop();
    }
    if (window.CWP_ADMIN_V2.trackStaff && typeof window.CWP_ADMIN_V2.trackStaff.stopPolling === 'function') {
      window.CWP_ADMIN_V2.trackStaff.stopPolling();
    }
    if (window.CWP_ADMIN_V2.search) {
      window.CWP_ADMIN_V2.search.clear();
    }
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.closeAll({ fromPopstate: true });
    }
    if (window.CWP_ADMIN_V2.auth) {
      await window.CWP_ADMIN_V2.auth.logout();
    }

    try {
      const basePath = window.location.pathname.startsWith('/admin/v2') ? '/admin/v2' : '/admin-v2';
      window.history.replaceState({}, '', basePath);
    } catch (e) {}

    const input = document.getElementById('v2AdminPasswordInput');
    if (input) input.value = '';
    lockToLogin('');
  }

  function bindLoginGate() {
    if (loginBound) return;
    loginBound = true;

    const form = document.getElementById('v2LoginForm');
    const input = document.getElementById('v2AdminPasswordInput');
    const toggleBtn = document.getElementById('v2LoginPasswordToggle');
    const rememberBox = document.getElementById('v2RememberDevice');
    const submitBtn = document.getElementById('v2LoginSubmitBtn');

    if (toggleBtn && input) {
      toggleBtn.addEventListener('click', () => {
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        const icon = toggleBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = isPass ? 'visibility_off' : 'visibility';
        toggleBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
        toggleBtn.setAttribute('aria-pressed', isPass ? 'true' : 'false');
        input.focus();
      });
    }

    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showLoginAlert('');

      const pass = (input && input.value) || '';
      const remember = rememberBox ? !!rememberBox.checked : true;

      const runLogin = async () => {
        const res = await window.CWP_ADMIN_V2.auth.login(pass, { remember });
        if (res.success) {
          if (input) input.value = '';
          unlockShell(res.user);
          if (window.CWP_ADMIN_V2.toast) {
            window.CWP_ADMIN_V2.toast.show('Signed in to CWP Admin V2.', 'success', 2600);
          }
        } else {
          showLoginAlert(res.error || 'Authentication failed.');
          focusPasswordInput();
        }
      };

      if (window.CWP_ADMIN_V2.api) {
        await window.CWP_ADMIN_V2.api.withLoadingButton(submitBtn, runLogin);
      } else {
        await runLogin();
      }
    });
  }

  async function start() {
    if (window.CWP_ADMIN_V2.api) {
      window.CWP_ADMIN_V2.api.setUnauthorizedHandler((reason) => {
        if (window.CWP_ADMIN_V2.auth) {
          window.CWP_ADMIN_V2.auth.clearToken(false);
        }
        lockToLogin(reason || 'Session expired. Please sign in again.');
      });
    }

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.init();
    }

    bindLoginGate();

    if (window.CWP_ADMIN_V2.auth) {
      const session = await window.CWP_ADMIN_V2.auth.checkSession();
      if (session.valid) {
        unlockShell(session.user);
      } else {
        const msg = session.expired
          ? 'Your admin session has expired or is invalid. Please sign in.'
          : (session.offline ? 'Unable to verify session with server. Please sign in when online.' : '');
        lockToLogin(msg);
      }
    } else {
      lockToLogin('Authentication module unavailable.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.CWP_ADMIN_V2.app = {
    init: start,
    lockToLogin,
    unlockShell,
    performLogout
  };
  window.CWP_ADMIN_V2.start = start;
})(window);
