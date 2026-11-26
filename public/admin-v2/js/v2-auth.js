/**
 * CWP Admin V2 Authentication Bridge
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.auth
 * Compatible with existing server-side verifyAdminPassword API.
 * Does not mutate V1 behavior or global objects.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const STORAGE_KEY_TOKEN = 'cwp_admin_token'; // Standard existing token key
  const BACKUP_KEY_TOKEN  = 'adminToken';

  function getToken() {
    try {
      return (
        localStorage.getItem(STORAGE_KEY_TOKEN) ||
        localStorage.getItem(BACKUP_KEY_TOKEN) ||
        sessionStorage.getItem(STORAGE_KEY_TOKEN) ||
        ''
      ).trim();
    } catch (e) {
      console.warn('[V2-Auth] Storage read error:', e);
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    } catch (e) {
      console.warn('[V2-Auth] Storage write error:', e);
    }
  }

  async function checkSession() {
    const token = getToken();
    if (!token) return { valid: false };

    try {
      // Re-use safe read-only call to check token validity
      const res = await fetch('/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'getStaffList',
          token: token
        })
      });

      if (res.status === 401) {
        return { valid: false, expired: true };
      }
      return { valid: res.ok, token };
    } catch (err) {
      console.warn('[V2-Auth] Network check error, assuming offline token valid:', err);
      return { valid: !!token, token, offline: true };
    }
  }

  async function login(password) {
    if (!password || !password.trim()) {
      return { success: false, error: 'Please enter admin password.' };
    }

    try {
      const res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verifyAdminPassword',
          password: password.trim()
        })
      });

      const data = await res.json();
      if (data && data.success && data.token) {
        setToken(data.token);
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || 'Authentication failed.' };
    } catch (err) {
      return { success: false, error: 'Network error during login: ' + err.message };
    }
  }

  function logout() {
    setToken('');
    window.location.reload();
  }

  window.CWP_ADMIN_V2.auth = {
    getToken,
    setToken,
    checkSession,
    login,
    logout
  };
})(window);
