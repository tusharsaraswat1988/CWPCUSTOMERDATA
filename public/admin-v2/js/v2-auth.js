/**
 * CWP Admin V2 Real Authentication & Session Bridge
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.auth
 * Uses HttpOnly server-issued session cookies (cwp_adm_sess) + CSRF double-submit header (X-CSRF-Token).
 * Never stores admin session tokens in localStorage or sessionStorage.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const LEGACY_KEYS = ['cwp_admin_token', 'cwp_admin_auth', 'adminToken', 'cwp_admin_user_meta'];
  const CROSS_TAB_LOGOUT_KEY = 'cwp_v2_logout_sync';

  let currentUser = null;
  let authenticated = false;
  let memoryCsrfToken = '';

  function purgeLegacyStorage() {
    try {
      [localStorage, sessionStorage].forEach(store => {
        LEGACY_KEYS.forEach(k => store.removeItem(k));
      });
    } catch (e) {}
  }

  function getCsrfToken() {
    if (memoryCsrfToken) return memoryCsrfToken;
    try {
      const m = document.cookie.match(/(?:^|;\s*)cwp_csrf=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
      return '';
    }
  }

  function isAuthenticated() {
    return authenticated;
  }

  function getToken() {
    // Returns a non-secret sentinel when authenticated via HttpOnly cookie
    // so existing V2 modules checking truthy auth state continue to work without exposing tokens.
    return authenticated ? 'cookie-session' : '';
  }

  function clearToken(clearActiveTab = false) {
    authenticated = false;
    currentUser = null;
    memoryCsrfToken = '';
    purgeLegacyStorage();
    if (clearActiveTab) {
      try {
        localStorage.removeItem('cwp_admin_active_tab');
        sessionStorage.removeItem('cwp_admin_active_tab');
      } catch (e) {}
    }
  }

  function getUser() {
    return currentUser;
  }

  async function checkSession() {
    purgeLegacyStorage();
    try {
      const res = await fetch('/api', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verifyAdminSession' })
      });

      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (res.status === 401 || res.status === 403 || (data && data.unauthorized === true)) {
        clearToken(false);
        return { valid: false, expired: true };
      }

      if (!res.ok || !data || !data.success || !data.valid) {
        return { valid: false, offline: res.status >= 500 };
      }

      authenticated = true;
      if (data.csrfToken) memoryCsrfToken = data.csrfToken;
      const user = Object.assign(
        { username: 'admin', role: 'superadmin', userType: 'admin' },
        data.user || {}
      );
      currentUser = user;
      return { valid: true, user };
    } catch (err) {
      console.warn('[V2-Auth] Session verification failed:', err);
      return { valid: false, offline: true };
    }
  }

  async function fetchCaptcha(username = 'admin') {
    const res = await fetch('/api', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAdminCaptcha', username })
    });
    const data = await res.json().catch(() => ({}));
    return data;
  }

  async function login(password, opts = {}) {
    const cleanPass = (password || '').trim();
    if (!cleanPass) {
      return { success: false, error: 'Please enter admin password.' };
    }

    const username = opts.username || 'admin';
    const payload = {
      action: 'verifyAdminPassword',
      password: cleanPass,
      username
    };
    if (opts.captchaId && opts.captchaAnswer !== undefined) {
      payload.captchaId = opts.captchaId;
      payload.captchaAnswer = String(opts.captchaAnswer).trim();
    }

    try {
      const res = await fetch('/api', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }

      if (res.ok && data && data.success) {
        authenticated = true;
        if (data.csrfToken) memoryCsrfToken = data.csrfToken;
        purgeLegacyStorage();
        const user = Object.assign(
          { username: 'admin', role: 'superadmin', userType: 'admin' },
          data.user || {}
        );
        currentUser = user;
        if (window.CWP_ADMIN_V2.api && typeof window.CWP_ADMIN_V2.api.resetUnauthorizedLock === 'function') {
          window.CWP_ADMIN_V2.api.resetUnauthorizedLock();
        }
        return { success: true, user, deviceRecognized: !!data.deviceRecognized };
      }

      return {
        success: false,
        status: res.status,
        rateLimited: !!data.rateLimited,
        captchaRequired: !!data.captchaRequired,
        captcha: data.captcha || null,
        error: data.error || (res.status === 429 ? 'Too many login attempts. Please wait and retry.' : 'Authentication failed.')
      };
    } catch (err) {
      return { success: false, error: 'Network error during login: ' + err.message };
    }
  }

  async function logout() {
    const csrf = getCsrfToken();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      await fetch('/api', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ action: 'logoutAdmin' }),
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      // Failsafe: clear client state even if server request times out
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    clearToken(true);
    try {
      localStorage.setItem(CROSS_TAB_LOGOUT_KEY, String(Date.now()));
    } catch (e) {}
    return { success: true };
  }

  // Cross-tab logout synchronization
  window.addEventListener('storage', (e) => {
    if (e && e.key === CROSS_TAB_LOGOUT_KEY && authenticated) {
      clearToken(false);
      if (window.CWP_ADMIN_V2.app && typeof window.CWP_ADMIN_V2.app.lockToLogin === 'function') {
        window.CWP_ADMIN_V2.app.lockToLogin('Signed out from another browser tab.');
      }
    }
  });

  window.CWP_ADMIN_V2.auth = {
    isAuthenticated,
    getToken,
    getCsrfToken,
    clearToken,
    getUser,
    checkSession,
    fetchCaptcha,
    login,
    logout
  };
})(window);
