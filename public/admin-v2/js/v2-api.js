/**
 * CWP Admin V2 Live API Client Helper
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.api
 * Mock-free live /api transport with Bearer token injection, 401/403 lockout callback,
 * normalized error extraction, and loading-button lifecycle management.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  let unauthorizedHandler = null;
  let unauthorizedTriggered = false;

  function setUnauthorizedHandler(fn) {
    unauthorizedHandler = typeof fn === 'function' ? fn : null;
  }

  function resetUnauthorizedLock() {
    unauthorizedTriggered = false;
  }

  function resolveCsrfToken() {
    if (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getCsrfToken === 'function') {
      return window.CWP_ADMIN_V2.auth.getCsrfToken();
    }
    try {
      const m = document.cookie.match(/(?:^|;\s*)cwp_csrf=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
      return '';
    }
  }

  function notifyUnauthorized(reason) {
    if (unauthorizedTriggered) return;
    unauthorizedTriggered = true;
    if (typeof unauthorizedHandler === 'function') {
      try {
        unauthorizedHandler(reason || 'Session expired or unauthorized.');
      } catch (e) {
        console.warn('[V2-API] Unauthorized handler error:', e);
      }
    }
  }

  async function request(action, payload = {}, opts = {}) {
    const skipAuth = !!opts.skipAuth;
    const bodyObj = Object.assign({}, payload || {}, { action });

    const headers = { 'Content-Type': 'application/json' };
    if (!skipAuth) {
      const csrf = resolveCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (opts.token && opts.token !== 'cookie-session') {
        headers['Authorization'] = `Bearer ${opts.token}`;
      }
    }

    let controller = null;
    let timeoutId = null;
    if (typeof AbortController !== 'undefined' && opts.timeoutMs > 0) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
    }

    try {
      const fetchOpts = {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(bodyObj)
      };
      if (controller) fetchOpts.signal = controller.signal;

      const res = await fetch('/api', fetchOpts);
      const rawText = await res.text();
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        data = { success: false, error: rawText || `Unexpected HTTP ${res.status}` };
      }

      if (res.status === 401 || res.status === 403 || (data && data.unauthorized === true)) {
        if (!opts.skipUnauthorizedHandler) {
          notifyUnauthorized((data && data.error) || 'Admin session expired. Please sign in again.');
        }
        const authErr = new Error((data && data.error) || `Unauthorized (${res.status})`);
        authErr.status = res.status;
        authErr.unauthorized = true;
        authErr.data = data;
        throw authErr;
      }

      if (!res.ok) {
        const httpErr = new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
        httpErr.status = res.status;
        httpErr.data = data;
        throw httpErr;
      }

      if (data && typeof data === 'object' && !Array.isArray(data) && data.success === false) {
        const apiErr = new Error(data.error || data.message || `Operation ${action} failed`);
        apiErr.status = res.status;
        apiErr.data = data;
        throw apiErr;
      }

      return data;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function withLoadingButton(btn, asyncFn) {
    if (typeof asyncFn !== 'function') return undefined;
    if (!btn) return asyncFn();

    const wasDisabled = !!btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    try {
      return await asyncFn();
    } finally {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.disabled = wasDisabled;
    }
  }

  window.CWP_ADMIN_V2.api = {
    request,
    withLoadingButton,
    setUnauthorizedHandler,
    resetUnauthorizedLock
  };
})(window);
