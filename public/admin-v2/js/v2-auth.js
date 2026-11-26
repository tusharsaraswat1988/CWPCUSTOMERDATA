/**
 * CWP Admin V2 Real Authentication & Session Bridge
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.auth
 * Validates admin-only sessions via POST /api { action: 'verifyAdminSession' },
 * enforces rememberDevice storage parity, and revokes sessions via logoutAdmin.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const STORAGE_KEY_TOKEN = 'cwp_admin_token';
  const STORAGE_KEY_AUTH = 'cwp_admin_auth';
  const BACKUP_KEY_TOKEN = 'adminToken';
  const STORAGE_KEY_USER = 'cwp_admin_user_meta';
  const STORAGE_KEY_ACTIVE_TAB = 'cwp_admin_active_tab';

  let currentUser = null;

  function getToken() {
    try {
      return (
        sessionStorage.getItem(STORAGE_KEY_TOKEN) ||
        localStorage.getItem(STORAGE_KEY_TOKEN) ||
        sessionStorage.getItem(BACKUP_KEY_TOKEN) ||
        localStorage.getItem(BACKUP_KEY_TOKEN) ||
        ''
      ).trim();
    } catch (e) {
      return '';
    }
  }

  function setToken(token, remember = true, user = null) {
    try {
      if (token) {
        sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
        sessionStorage.setItem(STORAGE_KEY_AUTH, 'true');
        sessionStorage.setItem(BACKUP_KEY_TOKEN, token);

        if (remember) {
          localStorage.setItem(STORAGE_KEY_TOKEN, token);
          localStorage.setItem(STORAGE_KEY_AUTH, 'true');
          localStorage.setItem(BACKUP_KEY_TOKEN, token);
        } else {
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          localStorage.removeItem(STORAGE_KEY_AUTH);
          localStorage.removeItem(BACKUP_KEY_TOKEN);
        }

        if (user && typeof user === 'object') {
          currentUser = Object.assign({ username: 'admin', role: 'superadmin', userType: 'admin' }, user);
          sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        }
      } else {
        clearToken(false);
      }
    } catch (e) {
      console.warn('[V2-Auth] Storage write error:', e);
    }
  }

  function clearToken(clearActiveTab = false) {
    currentUser = null;
    try {
      [sessionStorage, localStorage].forEach(store => {
        store.removeItem(STORAGE_KEY_TOKEN);
        store.removeItem(STORAGE_KEY_AUTH);
        store.removeItem(BACKUP_KEY_TOKEN);
        store.removeItem(STORAGE_KEY_USER);
        if (clearActiveTab) {
          store.removeItem(STORAGE_KEY_ACTIVE_TAB);
        }
      });
    } catch (e) {
      console.warn('[V2-Auth] Storage clear error:', e);
    }
  }

  function getUser() {
    if (currentUser) return currentUser;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_USER);
      if (raw) {
        currentUser = JSON.parse(raw);
        return currentUser;
      }
    } catch (e) {}
    return null;
  }

  async function checkSession() {
    const token = getToken();
    if (!token) {
      return { valid: false };
    }

    try {
      const res = await fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'verifyAdminSession',
          token: token,
          adminToken: token
        })
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

      const user = Object.assign(
        { username: 'admin', role: 'superadmin', userType: 'admin' },
        data.user || {}
      );
      currentUser = user;
      try {
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      } catch (e) {}

      return { valid: true, token, user };
    } catch (err) {
      console.warn('[V2-Auth] Session verification failed:', err);
      return { valid: false, offline: true };
    }
  }

  async function login(password, opts = {}) {
    const cleanPass = (password || '').trim();
    if (!cleanPass) {
      return { success: false, error: 'Please enter admin password.' };
    }

    const remember = opts.remember !== undefined ? !!opts.remember : true;
    const username = opts.username || 'admin';

    try {
      const res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verifyAdminPassword',
          password: cleanPass,
          username
        })
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }

      if (res.ok && data && data.success && data.token) {
        const user = Object.assign(
          { username: 'admin', role: 'superadmin', userType: 'admin' },
          data.user || {}
        );
        setToken(data.token, remember, user);
        if (window.CWP_ADMIN_V2.api && typeof window.CWP_ADMIN_V2.api.resetUnauthorizedLock === 'function') {
          window.CWP_ADMIN_V2.api.resetUnauthorizedLock();
        }
        return { success: true, token: data.token, user };
      }

      return {
        success: false,
        status: res.status,
        error: data.error || (res.status === 429 ? 'Too many login attempts. Please wait and retry.' : 'Authentication failed.')
      };
    } catch (err) {
      return { success: false, error: 'Network error during login: ' + err.message };
    }
  }

  async function logout() {
    const token = getToken();
    if (token) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 1200) : null;
      try {
        await fetch('/api', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'logoutAdmin',
            adminToken: token,
            token: token
          }),
          signal: controller ? controller.signal : undefined
        });
      } catch (err) {
        // Failsafe: clear client session even if server request times out or fails
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    clearToken(true);
    return { success: true };
  }

  async function updatePassword(newPassword) {
    const cleanNew = (newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 4) {
      throw new Error('Admin password must be at least 4 characters.');
    }
    return window.CWP_ADMIN_V2.api.request('updateAdminPassword', { newPassword: cleanNew });
  }

  window.CWP_ADMIN_V2.auth = {
    getToken,
    setToken,
    clearToken,
    getUser,
    checkSession,
    login,
    logout,
    updatePassword
  };
})(window);
