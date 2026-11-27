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

  async function withLoadingButton(btn, asyncFn, options = {}) {
    if (typeof asyncFn !== 'function') return undefined;
    if (!btn) return asyncFn();

    const wasDisabled = !!btn.disabled;
    const originalHtml = btn.innerHTML;
    const originalMinWidth = btn.style.minWidth;
    const originalWidth = btn.style.width;

    // Zero Layout Jump: Lock exact rendered width during loading
    try {
      const rect = btn.getBoundingClientRect();
      if (rect && rect.width > 0) {
        btn.style.minWidth = `${Math.ceil(rect.width)}px`;
      }
    } catch (e) {}

    // Contextual Loading Text
    let loadingText = 'Saving...';
    const textLower = (btn.textContent || '').trim().toLowerCase();
    if (textLower.includes('delete') || textLower.includes('remove')) {
      loadingText = 'Deleting...';
    } else if (textLower.includes('cancel')) {
      loadingText = 'Cancelling...';
    } else if (textLower.includes('unassign')) {
      loadingText = 'Unassigning...';
    } else if (textLower.includes('assign')) {
      loadingText = 'Assigning...';
    } else if (textLower.includes('convert')) {
      loadingText = 'Converting...';
    } else if (textLower.includes('login') || textLower.includes('sign in')) {
      loadingText = 'Signing in...';
    } else if (textLower.includes('logout')) {
      loadingText = 'Logging out...';
    } else if (textLower.includes('refresh') || textLower.includes('sync')) {
      loadingText = 'Syncing...';
    }

    if (typeof options === 'string' && options.trim()) {
      loadingText = options.trim();
    } else if (options && typeof options === 'object' && options.text) {
      loadingText = options.text;
    } else if (typeof btn.getAttribute === 'function' && btn.getAttribute('data-loading-text')) {
      loadingText = btn.getAttribute('data-loading-text');
    }

    btn.disabled = true;
    if (btn.classList && typeof btn.classList.add === 'function') {
      btn.classList.add('is-loading');
    }
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-busy', 'true');
    }
    btn.innerHTML = `<span class="cwp-v2-btn-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;

    try {
      return await asyncFn();
    } finally {
      btn.innerHTML = originalHtml;
      if (btn.classList && typeof btn.classList.remove === 'function') {
        btn.classList.remove('is-loading');
      }
      if (typeof btn.removeAttribute === 'function') {
        btn.removeAttribute('aria-busy');
      }
      btn.style.minWidth = originalMinWidth;
      btn.style.width = originalWidth;
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
