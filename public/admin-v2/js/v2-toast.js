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
      root.appendChild(containerEl);
    }
    return containerEl;
  }

  function show(message, type = 'info', opts = {}) {
    if (!message) return null;
    const variant = ICON_BY_TYPE[type] ? type : 'info';
    const duration = typeof opts === 'number' ? opts : (opts.duration !== undefined ? opts.duration : 3800);
    const host = ensureContainer();

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
    msgEl.textContent = String(message);

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

  function clear() {
    if (containerEl) {
      containerEl.innerHTML = '';
    }
  }

  window.CWP_ADMIN_V2.toast = {
    show,
    clear
  };
})(window);
