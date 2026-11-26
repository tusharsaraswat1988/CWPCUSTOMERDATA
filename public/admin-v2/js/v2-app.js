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
  let activeCaptchaId = null;

  function setCaptchaChallenge(captcha) {
    const box = document.getElementById('v2LoginCaptchaBox');
    const promptEl = document.getElementById('v2LoginCaptchaPrompt');
    const inputEl = document.getElementById('v2LoginCaptchaInput');
    if (!box || !promptEl || !inputEl) return;

    if (captcha && captcha.challengeId && captcha.prompt) {
      activeCaptchaId = captcha.challengeId;
      promptEl.textContent = captcha.prompt;
      inputEl.value = '';
      inputEl.required = true;
      box.hidden = false;
    } else {
      activeCaptchaId = null;
      promptEl.textContent = '';
      inputEl.value = '';
      inputEl.required = false;
      box.hidden = true;
    }
  }

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
    if (window.CWP_ADMIN_V2.sequence) {
      window.CWP_ADMIN_V2.sequence.init();
    }
    if (window.CWP_ADMIN_V2.dashboard) {
      window.CWP_ADMIN_V2.dashboard.init();
    }
    if (window.CWP_ADMIN_V2.security) {
      window.CWP_ADMIN_V2.security.init();
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
    const captchaInput = document.getElementById('v2LoginCaptchaInput');
    const captchaRefreshBtn = document.getElementById('v2LoginCaptchaRefreshBtn');
    const submitBtn = document.getElementById('v2LoginSubmitBtn');

    if (captchaRefreshBtn) {
      captchaRefreshBtn.addEventListener('click', async () => {
        if (!window.CWP_ADMIN_V2.auth || typeof window.CWP_ADMIN_V2.auth.fetchCaptcha !== 'function') return;
        const cap = await window.CWP_ADMIN_V2.auth.fetchCaptcha('admin');
        if (cap && cap.success) {
          setCaptchaChallenge(cap);
          if (captchaInput) captchaInput.focus();
        } else if (cap && cap.error) {
          showLoginAlert(cap.error);
        }
      });
    }

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
      const capAnswer = captchaInput ? captchaInput.value : '';

      const runLogin = async () => {
        const loginOpts = {};
        if (activeCaptchaId) {
          loginOpts.captchaId = activeCaptchaId;
          loginOpts.captchaAnswer = capAnswer;
        }
        const res = await window.CWP_ADMIN_V2.auth.login(pass, loginOpts);
        if (res.success) {
          if (input) input.value = '';
          setCaptchaChallenge(null);
          unlockShell(res.user);
          if (window.CWP_ADMIN_V2.toast) {
            window.CWP_ADMIN_V2.toast.show('Signed in to CWP Admin V2.', 'success', 2600);
          }
        } else {
          if (res.captchaRequired && res.captcha) {
            setCaptchaChallenge(res.captcha);
          } else if (!res.captchaRequired) {
            setCaptchaChallenge(null);
          }
          showLoginAlert(res.error || 'Authentication failed.');
          if (res.captchaRequired && captchaInput) {
            try { captchaInput.focus(); } catch (err) {}
          } else {
            focusPasswordInput();
          }
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
