/**
 * CWP Admin V2 Security Center Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.security
 * Displays:
 *  - Account Security (Environment-configured password policy, session status)
 *  - Trusted Devices (Rename, Revoke, Revoke other devices)
 *  - Active Sessions (Logout session, Logout other sessions, Logout all sessions)
 *  - Security Activity (Human-readable event history, zero DB IDs or raw tokens)
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  let initialized = false;
  let loading = false;

  function esc(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '—';
    }
  }

  function formatEventLabel(eventType) {
    const map = {
      login_success: { label: 'Successful Login', cls: 'is-success' },
      login_failed: { label: 'Failed Login', cls: 'is-danger' },
      rate_limit_triggered: { label: 'Rate Limit Triggered', cls: 'is-warning' },
      captcha_triggered: { label: 'CAPTCHA Triggered', cls: 'is-info' },
      captcha_failed: { label: 'CAPTCHA Failed', cls: 'is-danger' },
      device_registered: { label: 'Device Registered', cls: 'is-success' },
      device_revoked: { label: 'Device Revoked', cls: 'is-warning' },
      logout: { label: 'Logout', cls: 'is-neutral' },
      session_revoked: { label: 'Session Revoked', cls: 'is-warning' },
      session_expired: { label: 'Session Expired', cls: 'is-warning' }
    };
    return map[eventType] || { label: String(eventType || 'Event'), cls: 'is-neutral' };
  }

  function renderAccountSecurity(info) {
    const container = document.getElementById('v2SecAccountBody');
    if (!container) return;
    const s = info || {};
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px;">
        <div class="cwp-v2-kpi-card">
          <div class="cwp-v2-kpi-label">Password Authentication</div>
          <div class="cwp-v2-kpi-value" style="font-size:15px;">${s.passwordAuthEnabled ? 'Enabled' : 'Not Configured'}</div>
          <div class="cwp-v2-kpi-meta">Credential source: ${esc(s.credentialSource || 'Server environment (.env)')}</div>
        </div>
        <div class="cwp-v2-kpi-card">
          <div class="cwp-v2-kpi-label">Password Management</div>
          <div class="cwp-v2-kpi-value" style="font-size:15px;">Environment Only</div>
          <div class="cwp-v2-kpi-meta">${esc(s.passwordManagement || 'Restricted to server configuration')}</div>
        </div>
        <div class="cwp-v2-kpi-card">
          <div class="cwp-v2-kpi-label">Current Session</div>
          <div class="cwp-v2-kpi-value" style="font-size:15px;">${esc(s.currentSessionStatus || 'Active')}</div>
          <div class="cwp-v2-kpi-meta">Idle timeout: ${esc(s.idleTimeoutMinutes || 30)}m &bull; Max: ${esc(s.maxSessionHours || 12)}h</div>
        </div>
        <div class="cwp-v2-kpi-card">
          <div class="cwp-v2-kpi-label">Current Browser Device</div>
          <div class="cwp-v2-kpi-value" style="font-size:15px;">${s.currentDeviceRecognized ? 'Recognized' : 'Standard Session'}</div>
          <div class="cwp-v2-kpi-meta">HttpOnly cookie-bound recognition</div>
        </div>
      </div>
    `;
  }

  function renderTrustedDevices(devices) {
    const tbody = document.getElementById('v2SecDevicesBody');
    if (!tbody) return;
    if (!Array.isArray(devices) || devices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">No trusted devices registered yet.</td></tr>';
      return;
    }

    tbody.innerHTML = devices.map(d => `
      <tr>
        <td>
          <strong>${esc(d.deviceLabel)}</strong>
          ${d.isCurrent ? '<span class="cwp-v2-badge cwp-v2-badge-success" style="margin-left:6px;">Current Device</span>' : ''}
        </td>
        <td>${esc(d.browser)}</td>
        <td>${esc(d.os)}</td>
        <td>${esc(formatDateTime(d.firstRegisteredAt))}</td>
        <td>${esc(formatDateTime(d.lastUsedAt))}</td>
        <td>${esc(formatDateTime(d.trustExpiresAt))}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-sec-rename-device="${esc(d.deviceRef)}" data-sec-current-label="${esc(d.deviceLabel)}">Rename</button>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-danger-outline cwp-v2-btn-sm" data-sec-revoke-device="${esc(d.deviceRef)}">Revoke</button>
        </td>
      </tr>
    `).join('');
  }

  function renderActiveSessions(sessions) {
    const tbody = document.getElementById('v2SecSessionsBody');
    if (!tbody) return;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">No active sessions found.</td></tr>';
      return;
    }

    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td>
          <strong>${esc(s.deviceLabel || `${s.browser} on ${s.os}`)}</strong>
          ${s.isCurrent ? '<span class="cwp-v2-badge cwp-v2-badge-success" style="margin-left:6px;">Current Session</span>' : ''}
        </td>
        <td>${esc(formatDateTime(s.createdAt))}</td>
        <td>${esc(formatDateTime(s.lastActivityAt))}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="cwp-v2-btn cwp-v2-btn-danger-outline cwp-v2-btn-sm" data-sec-logout-session="${esc(s.sessionRef)}">
            ${s.isCurrent ? 'Sign Out' : 'Logout Session'}
          </button>
        </td>
      </tr>
    `).join('');
  }

  function renderSecurityEvents(events) {
    const tbody = document.getElementById('v2SecEventsBody');
    if (!tbody) return;
    if (!Array.isArray(events) || events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">No security events recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = events.map(evt => {
      const meta = formatEventLabel(evt.eventType);
      return `
        <tr>
          <td><span class="cwp-v2-badge ${meta.cls}">${esc(meta.label)}</span></td>
          <td>${esc(evt.summary)}</td>
          <td>${esc(evt.browser)} / ${esc(evt.os)} (${esc(evt.ipMasked)})</td>
          <td>${esc(formatDateTime(evt.createdAt))}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadOverview() {
    if (loading) return;
    const api = window.CWP_ADMIN_V2.api;
    if (!api) return;
    loading = true;
    try {
      const data = await api.request('getAdminSecurityOverview', {});
      renderAccountSecurity(data.accountSecurity);
      renderTrustedDevices(data.trustedDevices);
      renderActiveSessions(data.activeSessions);
      renderSecurityEvents(data.securityEvents);
    } catch (err) {
      if (window.CWP_ADMIN_V2.toast && !err.unauthorized) {
        window.CWP_ADMIN_V2.toast.show(err.message || 'Failed to load security overview.', 'error');
      }
    } finally {
      loading = false;
    }
  }

  function bindEvents() {
    const view = document.getElementById('v2View_security');
    if (!view) return;

    view.addEventListener('click', async (e) => {
      const api = window.CWP_ADMIN_V2.api;
      const toast = window.CWP_ADMIN_V2.toast;
      if (!api) return;

      const refreshBtn = e.target.closest('#v2SecRefreshBtn');
      if (refreshBtn) {
        await api.withLoadingButton(refreshBtn, loadOverview);
        return;
      }

      const revokeOthersBtn = e.target.closest('#v2SecRevokeOtherDevicesBtn');
      if (revokeOthersBtn) {
        await api.withLoadingButton(revokeOthersBtn, async () => {
          const res = await api.request('revokeOtherAdminDevices', {});
          if (toast) toast.show(`Revoked ${res.revokedCount || 0} other trusted device(s).`, 'success');
          await loadOverview();
        });
        return;
      }

      const logoutOthersBtn = e.target.closest('#v2SecLogoutOtherSessionsBtn');
      if (logoutOthersBtn) {
        await api.withLoadingButton(logoutOthersBtn, async () => {
          const res = await api.request('logoutOtherAdminSessions', {});
          if (toast) toast.show(`Logged out ${res.revokedCount || 0} other session(s).`, 'success');
          await loadOverview();
        });
        return;
      }

      const logoutAllBtn = e.target.closest('#v2SecLogoutAllSessionsBtn');
      if (logoutAllBtn) {
        await api.withLoadingButton(logoutAllBtn, async () => {
          await api.request('logoutAllAdminSessions', {});
          if (window.CWP_ADMIN_V2.auth) window.CWP_ADMIN_V2.auth.clearToken(true);
          if (window.CWP_ADMIN_V2.app) window.CWP_ADMIN_V2.app.lockToLogin('All admin sessions have been signed out.');
        });
        return;
      }

      const renameBtn = e.target.closest('[data-sec-rename-device]');
      if (renameBtn) {
        const ref = renameBtn.getAttribute('data-sec-rename-device');
        const cur = renameBtn.getAttribute('data-sec-current-label') || '';
        const nextName = window.prompt('Enter a name for this trusted device:', cur);
        if (nextName && nextName.trim()) {
          await api.request('renameAdminDevice', { deviceRef: ref, deviceLabel: nextName.trim() });
          if (toast) toast.show('Device renamed.', 'success');
          await loadOverview();
        }
        return;
      }

      const revokeBtn = e.target.closest('[data-sec-revoke-device]');
      if (revokeBtn) {
        const ref = revokeBtn.getAttribute('data-sec-revoke-device');
        await api.withLoadingButton(revokeBtn, async () => {
          await api.request('revokeAdminDevice', { deviceRef: ref });
          if (toast) toast.show('Trusted device revoked.', 'success');
          await loadOverview();
        });
        return;
      }

      const logoutSessBtn = e.target.closest('[data-sec-logout-session]');
      if (logoutSessBtn) {
        const ref = logoutSessBtn.getAttribute('data-sec-logout-session');
        await api.withLoadingButton(logoutSessBtn, async () => {
          const res = await api.request('logoutAdminSession', { sessionRef: ref });
          if (res && res.revokedCurrent) {
            if (window.CWP_ADMIN_V2.auth) window.CWP_ADMIN_V2.auth.clearToken(true);
            if (window.CWP_ADMIN_V2.app) window.CWP_ADMIN_V2.app.lockToLogin('Current session signed out.');
            return;
          }
          if (toast) toast.show('Session logged out.', 'success');
          await loadOverview();
        });
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'security') {
        loadOverview();
      }
    });
  }

  window.CWP_ADMIN_V2.security = {
    init,
    loadOverview
  };
})(window);
