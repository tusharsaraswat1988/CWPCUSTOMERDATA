/**
 * CWP Admin V2 Accessible Toast Notification Stack
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.toast
 * Uses aria-live="polite" region and Material Symbols (zero emojis).
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const ICON_BY_TYPE = {
    success: 'check_circle',
    warning: 'warning',
    error: 'error',
    info: 'info'
  };

  let containerEl = null;

  function ensureContainer() {
    if (containerEl && document.body.contains(containerEl)) return containerEl;
    const root = document.getElementById('cwpV2App') || document.querySelector('.cwp-v2-root') || document.body;
    containerEl = document.getElementById('v2ToastContainer');
    if (!containerEl) {
      containerEl = document.createElement('div');
      containerEl.id = 'v2ToastContainer';
      containerEl.className = 'cwp-v2-toast-container';
      containerEl.setAttribute('role', 'region');
      containerEl.setAttribute('aria-live', 'polite');
      containerEl.setAttribute('aria-label', 'Status notifications');
      if (root) {
        root.appendChild(containerEl);
      } else if (document.body) {
        document.body.appendChild(containerEl);
      }
    }
    return containerEl;
  }

  function show(message, type = 'info', opts = {}) {
    if (!message) return null;
    const variant = ICON_BY_TYPE[type] ? type : 'info';
    let duration = 3800;
    if (typeof opts === 'number') {
      duration = opts;
    } else if (opts && typeof opts === 'object' && opts.duration !== undefined) {
      duration = opts.duration;
    }
    const host = ensureContainer();
    if (!host) return null;

    const toastEl = document.createElement('div');
    toastEl.className = `cwp-v2-toast is-${variant}`;
    toastEl.setAttribute('role', variant === 'error' ? 'alert' : 'status');

    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.style.fontSize = '18px';
    iconEl.textContent = ICON_BY_TYPE[variant];

    const msgEl = document.createElement('div');
    msgEl.className = 'cwp-v2-toast-msg';
    msgEl.textContent = typeof message === 'object' && message !== null
      ? (message.message || JSON.stringify(message))
      : String(message);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cwp-v2-toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    const closeIcon = document.createElement('span');
    closeIcon.className = 'material-symbols-outlined';
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.style.fontSize = '16px';
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);

    toastEl.appendChild(iconEl);
    toastEl.appendChild(msgEl);
    toastEl.appendChild(closeBtn);
    host.appendChild(toastEl);

    let timer = null;
    function dismiss() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }

    closeBtn.addEventListener('click', dismiss);

    if (duration > 0) {
      timer = setTimeout(dismiss, duration);
    }

    return { element: toastEl, dismiss };
  }

  const MAX_ACTIVITY_TOASTS = 3;
  const activeActivityToasts = [];

  function escapeText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTimeNow() {
    try {
      return new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '';
    }
  }

  function showActivity(data, opts = {}) {
    if (!data) return null;
    const host = ensureContainer();
    if (!host) return null;

    while (activeActivityToasts.length >= MAX_ACTIVITY_TOASTS) {
      const oldest = activeActivityToasts.shift();
      if (oldest && typeof oldest.dismiss === 'function') {
        try { oldest.dismiss(); } catch (e) {}
      }
    }

    const duration = typeof opts.duration === 'number' ? opts.duration : 7000;
    const toastEl = document.createElement('div');
    toastEl.className = 'cwp-v2-toast is-activity';
    toastEl.setAttribute('role', 'status');

    const iconName = data.icon || (data.category === 'daily_cleaning' ? 'directions_car' : 'solar_power');
    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.style.fontSize = '22px';
    iconEl.style.color = '#38bdf8';
    iconEl.style.marginTop = '2px';
    iconEl.textContent = iconName;

    const wrapEl = document.createElement('div');
    wrapEl.className = 'cwp-v2-toast-activity-wrap';

    const headerEl = document.createElement('div');
    headerEl.className = 'cwp-v2-toast-activity-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'cwp-v2-toast-activity-title';
    titleEl.textContent = data.title || 'Live Activity';

    const tagEl = document.createElement('span');
    tagEl.className = 'cwp-v2-toast-activity-tag';
    tagEl.textContent = data.actionLabel || data.action || 'Updated';

    headerEl.appendChild(titleEl);
    headerEl.appendChild(tagEl);

    const summaryEl = document.createElement('div');
    summaryEl.className = 'cwp-v2-toast-activity-summary';
    summaryEl.textContent = data.actionText || data.message || '';

    const metaEl = document.createElement('div');
    metaEl.className = 'cwp-v2-toast-activity-meta';

    if (data.customerName) {
      const rowCust = document.createElement('div');
      rowCust.className = 'cwp-v2-toast-activity-meta-row';
      rowCust.innerHTML = `<span>Customer:</span> <strong style="color:#f1f5f9;">${escapeText(data.customerName)}</strong>`;
      metaEl.appendChild(rowCust);
    }

    if (data.vehicleNumber) {
      const rowVeh = document.createElement('div');
      rowVeh.className = 'cwp-v2-toast-activity-meta-row';
      rowVeh.innerHTML = `<span>Vehicle:</span> <strong style="color:#f1f5f9;">${escapeText(data.vehicleNumber)}</strong>`;
      metaEl.appendChild(rowVeh);
    }

    if (data.serviceName) {
      const rowSvc = document.createElement('div');
      rowSvc.className = 'cwp-v2-toast-activity-meta-row';
      rowSvc.innerHTML = `<span>Service:</span> <span>${escapeText(data.serviceName)}</span>`;
      metaEl.appendChild(rowSvc);
    }

    const footerEl = document.createElement('div');
    footerEl.className = 'cwp-v2-toast-activity-footer';

    const timeEl = document.createElement('span');
    timeEl.className = 'cwp-v2-toast-activity-time';
    timeEl.textContent = data.timeText || formatTimeNow();

    footerEl.appendChild(timeEl);

    if (data.targetTab && typeof data.onNavigate === 'function') {
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'cwp-v2-toast-activity-view-btn';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => {
        dismiss();
        data.onNavigate();
      });
      footerEl.appendChild(viewBtn);
    }

    wrapEl.appendChild(headerEl);
    wrapEl.appendChild(summaryEl);
    if (metaEl.childNodes.length > 0) wrapEl.appendChild(metaEl);
    wrapEl.appendChild(footerEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cwp-v2-toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    const closeIcon = document.createElement('span');
    closeIcon.className = 'material-symbols-outlined';
    closeIcon.setAttribute('aria-hidden', 'true');
    closeIcon.style.fontSize = '16px';
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);

    toastEl.appendChild(iconEl);
    toastEl.appendChild(wrapEl);
    toastEl.appendChild(closeBtn);
    host.appendChild(toastEl);

    let timer = null;
    function dismiss() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const idx = activeActivityToasts.indexOf(toastHandle);
      if (idx !== -1) activeActivityToasts.splice(idx, 1);
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }

    closeBtn.addEventListener('click', dismiss);

    if (duration > 0) {
      timer = setTimeout(dismiss, duration);
    }

    const toastHandle = { element: toastEl, dismiss };
    activeActivityToasts.push(toastHandle);
    return toastHandle;
  }

  function success(message, opts) {
    return show(message, 'success', opts);
  }

  function error(message, opts) {
    return show(message, 'error', opts);
  }

  function warning(message, opts) {
    return show(message, 'warning', opts);
  }

  function info(message, opts) {
    return show(message, 'info', opts);
  }

  function clear() {
    if (containerEl) {
      containerEl.innerHTML = '';
    }
  }

  const toastHandler = function (message, type, opts) {
    return show(message, type, opts);
  };

  toastHandler.show = show;
  toastHandler.showActivity = showActivity;
  toastHandler.success = success;
  toastHandler.error = error;
  toastHandler.warning = warning;
  toastHandler.info = info;
  toastHandler.clear = clear;

  window.CWP_ADMIN_V2.toast = toastHandler;
})(window);
