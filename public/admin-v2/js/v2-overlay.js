/**
 * CWP Admin V2 Overlay Controller (Modals, Confirmation Dialogs & Drawers)
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.overlay
 * Implements accessible focus management, stack tracking, backdrop dismiss, ESC handling,
 * nested dialog support, role="dialog"/aria-modal="true" enforcement, and popstate bridge.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const overlayStack = [];
  let isGlobalKeybound = false;
  let isTriggerBound = false;
  let isPopstateBound = false;
  let suppressPopstateCount = 0;
  let suppressResetTimer = null;

  function suppressNextPopstate() {
    suppressPopstateCount += 1;
    if (suppressResetTimer) clearTimeout(suppressResetTimer);
    suppressResetTimer = setTimeout(() => {
      suppressPopstateCount = 0;
      suppressResetTimer = null;
    }, 500);
  }

  function init() {
    if (!isTriggerBound) {
      bindTriggerAttributes();
      isTriggerBound = true;
    }
    if (!isGlobalKeybound) {
      window.addEventListener('keydown', handleGlobalKeydown);
      isGlobalKeybound = true;
    }
    if (!isPopstateBound) {
      window.addEventListener('popstate', function (e) {
        if (suppressPopstateCount > 0) {
          suppressPopstateCount -= 1;
          if (suppressPopstateCount === 0 && suppressResetTimer) {
            clearTimeout(suppressResetTimer);
            suppressResetTimer = null;
          }
          e.stopImmediatePropagation();
        }
      }, true);
      isPopstateBound = true;
    }
  }

  function open(overlayId, options = {}) {
    const overlayEl = document.getElementById(overlayId);
    if (!overlayEl) {
      console.warn(`[CWP Admin V2 Overlay] Element with id "${overlayId}" not found.`);
      return null;
    }

    // Prevent duplicate stacking of same overlay
    const existingIdx = overlayStack.findIndex(item => item.id === overlayId);
    if (existingIdx !== -1) {
      return overlayEl;
    }

    const triggerEl = options.triggerEl || document.activeElement;
    const isNested = overlayStack.length > 0;

    const config = {
      backdropClose: options.backdropClose !== false,
      escapeClose: options.escapeClose !== false,
      pushHistory: options.pushHistory !== false,
      initialFocus: options.initialFocus || null,
      onClose: options.onClose || null,
      triggerEl: triggerEl
    };

    const item = { id: overlayId, el: overlayEl, config, isNested, historyPushed: false };
    overlayStack.push(item);

    // Enforce dialog ARIA semantics
    const innerCard = overlayEl.querySelector('.cwp-v2-modal, .cwp-v2-drawer');
    if (innerCard) {
      if (!innerCard.getAttribute('role')) innerCard.setAttribute('role', 'dialog');
      innerCard.setAttribute('aria-modal', 'true');
    } else {
      if (!overlayEl.getAttribute('role')) overlayEl.setAttribute('role', 'dialog');
      overlayEl.setAttribute('aria-modal', 'true');
    }

    // Show backdrop
    overlayEl.style.display = 'flex';
    overlayEl.setAttribute('aria-hidden', 'false');

    if (isNested) {
      overlayEl.classList.add('is-nested');
      if (innerCard) innerCard.classList.add('is-nested');
    }

    // Lock body scroll
    document.body.classList.add('cwp-v2-modal-open');

    // Push browser history state for Back button LIFO dismissal
    if (config.pushHistory && window.history && typeof window.history.pushState === 'function') {
      try {
        const curState = (window.history.state && typeof window.history.state === 'object') ? window.history.state : {};
        window.history.pushState(
          Object.assign({}, curState, { cwpV2Overlay: overlayId }),
          '',
          window.location.href
        );
        item.historyPushed = true;
      } catch (err) {
        // Ignore restricted history state
      }
    }

    // Manage Focus
    setTimeout(() => {
      let focusTarget = null;
      if (config.initialFocus) {
        focusTarget = typeof config.initialFocus === 'string'
          ? overlayEl.querySelector(config.initialFocus)
          : config.initialFocus;
      }

      if (!focusTarget) {
        focusTarget = overlayEl.querySelector('input:not([disabled]):not([type="hidden"]), button:not([disabled]):not(.cwp-v2-modal-close-btn), textarea:not([disabled]), select:not([disabled])')
          || overlayEl.querySelector('.cwp-v2-modal-close-btn, [data-overlay-close]');
      }

      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
    }, 40);

    bindBackdropClick(overlayEl, config);
    return overlayEl;
  }

  function close(overlayId, opts = {}) {
    if (overlayStack.length === 0) return false;

    let itemIndex = -1;
    if (overlayId) {
      itemIndex = overlayStack.findIndex(item => item.id === overlayId);
    } else {
      itemIndex = overlayStack.length - 1;
    }

    if (itemIndex === -1) return false;

    const [item] = overlayStack.splice(itemIndex, 1);
    const { el: overlayEl, config } = item;

    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.classList.remove('is-nested');
    const innerCard = overlayEl.querySelector('.cwp-v2-modal, .cwp-v2-drawer');
    if (innerCard) innerCard.classList.remove('is-nested');

    if (overlayStack.length === 0) {
      document.body.classList.remove('cwp-v2-modal-open');
    }

    // Pop the pushed overlay history entry on manual close (not via popstate)
    if (!opts.fromPopstate && !opts.skipHistoryBack && item.historyPushed && window.history && window.history.state && window.history.state.cwpV2Overlay === item.id) {
      try {
        suppressNextPopstate();
        window.history.back();
      } catch (err) {}
    }

    if (config.triggerEl && document.contains(config.triggerEl) && typeof config.triggerEl.focus === 'function') {
      try {
        config.triggerEl.focus();
      } catch (err) {}
    }

    if (typeof config.onClose === 'function') {
      config.onClose();
    }

    return true;
  }

  function closeAll(opts = {}) {
    if (opts.fromPopstate || opts.skipHistoryBack) {
      while (overlayStack.length > 0) {
        close(undefined, opts);
      }
      return;
    }

    let popCount = 0;
    for (let i = overlayStack.length - 1; i >= 0; i--) {
      if (overlayStack[i].historyPushed) popCount += 1;
      else break;
    }

    while (overlayStack.length > 0) {
      close(undefined, Object.assign({}, opts, { skipHistoryBack: true }));
    }

    if (popCount > 0 && window.history && window.history.state && window.history.state.cwpV2Overlay) {
      try {
        suppressNextPopstate();
        window.history.go(-popCount);
      } catch (err) {}
    }
  }

  function handleGlobalKeydown(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      if (overlayStack.length > 0) {
        const topItem = overlayStack[overlayStack.length - 1];
        if (topItem.config.escapeClose) {
          e.preventDefault();
          close(topItem.id);
        }
      }
    }

    if (e.key === 'Tab' && overlayStack.length > 0) {
      const topItem = overlayStack[overlayStack.length - 1];
      trapTabFocus(e, topItem.el);
    }
  }

  function trapTabFocus(e, containerEl) {
    const focusables = containerEl.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first || !containerEl.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || !containerEl.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function bindBackdropClick(overlayEl, config) {
    if (overlayEl._cwpBackdropBound) return;
    overlayEl._cwpBackdropBound = true;

    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) {
        const item = overlayStack.find(x => x.id === overlayEl.id);
        const allowBackdrop = item ? item.config.backdropClose : config.backdropClose;
        if (allowBackdrop) {
          close(overlayEl.id);
        }
      }
    });

    overlayEl.querySelectorAll('[data-overlay-close], .cwp-v2-modal-close-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        close(overlayEl.id);
      });
    });
  }

  function bindTriggerAttributes() {
    document.addEventListener('click', function (e) {
      const trigger = e.target.closest('[data-overlay-target]');
      if (!trigger) return;

      e.preventDefault();
      const targetId = trigger.getAttribute('data-overlay-target');
      const backdropClose = trigger.getAttribute('data-backdrop-close') !== 'false';
      const escapeClose = trigger.getAttribute('data-escape-close') !== 'false';
      const initialFocus = trigger.getAttribute('data-initial-focus');

      open(targetId, {
        backdropClose,
        escapeClose,
        initialFocus,
        triggerEl: trigger
      });
    });
  }

  window.CWP_ADMIN_V2.overlay = {
    init,
    open,
    close,
    closeAll,
    getTopmost: () => (overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null),
    getStackDepth: () => overlayStack.length,
    trapTabFocus,
    handleGlobalKeydown
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
