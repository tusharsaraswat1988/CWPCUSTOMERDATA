/**
 * CWP Admin V2 Overlay Controller (Modals, Confirmation Dialogs & Drawers)
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.overlay
 * Implements accessible focus management, stack tracking, backdrop dismiss, ESC handling,
 * and nested dialog support.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const overlayStack = [];
  let isGlobalKeybound = false;

  function init() {
    bindTriggerAttributes();
    if (!isGlobalKeybound) {
      window.addEventListener('keydown', handleGlobalKeydown);
      isGlobalKeybound = true;
    }
  }

  function open(overlayId, options = {}) {
    const overlayEl = document.getElementById(overlayId);
    if (!overlayEl) {
      console.warn(`[CWP Admin V2 Overlay] Element with id "${overlayId}" not found.`);
      return null;
    }

    const triggerEl = document.activeElement;
    const isNested = overlayStack.length > 0;

    // Configuration
    const config = {
      backdropClose: options.backdropClose !== false,
      escapeClose: options.escapeClose !== false,
      initialFocus: options.initialFocus || null,
      onClose: options.onClose || null,
      triggerEl: triggerEl
    };

    // Store in stack
    overlayStack.push({ id: overlayId, el: overlayEl, config, isNested });

    // Show backdrop
    overlayEl.style.display = 'flex';
    overlayEl.setAttribute('aria-hidden', 'false');

    if (isNested) {
      overlayEl.classList.add('is-nested');
      const innerCard = overlayEl.querySelector('.cwp-v2-modal, .cwp-v2-drawer');
      if (innerCard) innerCard.classList.add('is-nested');
    }

    // Lock body scroll
    document.body.classList.add('cwp-v2-modal-open');

    // Manage Focus
    setTimeout(() => {
      let focusTarget = null;
      if (config.initialFocus) {
        focusTarget = typeof config.initialFocus === 'string'
          ? overlayEl.querySelector(config.initialFocus)
          : config.initialFocus;
      }

      if (!focusTarget) {
        // Find first focusable input or button
        focusTarget = overlayEl.querySelector('input:not([disabled]), button:not([disabled]):not(.cwp-v2-modal-close-btn), textarea:not([disabled]), select:not([disabled])')
          || overlayEl.querySelector('.cwp-v2-modal-close-btn');
      }

      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus();
      }
    }, 40);

    // Bind click handlers if not already bound
    bindBackdropClick(overlayEl, config);

    return overlayEl;
  }

  function close(overlayId) {
    if (overlayStack.length === 0) return;

    let itemIndex = -1;
    if (overlayId) {
      itemIndex = overlayStack.findIndex(item => item.id === overlayId);
    } else {
      // Default: close topmost overlay
      itemIndex = overlayStack.length - 1;
    }

    if (itemIndex === -1) return;

    const [item] = overlayStack.splice(itemIndex, 1);
    const { el: overlayEl, config } = item;

    overlayEl.style.display = 'none';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.classList.remove('is-nested');
    const innerCard = overlayEl.querySelector('.cwp-v2-modal, .cwp-v2-drawer');
    if (innerCard) innerCard.classList.remove('is-nested');

    // Unlock body scroll if no more overlays are open
    if (overlayStack.length === 0) {
      document.body.classList.remove('cwp-v2-modal-open');
    }

    // Return focus to triggering element
    if (config.triggerEl && typeof config.triggerEl.focus === 'function') {
      try {
        config.triggerEl.focus();
      } catch (err) {
        // Trigger might have been removed
      }
    }

    // Call callback if provided
    if (typeof config.onClose === 'function') {
      config.onClose();
    }
  }

  function closeAll() {
    while (overlayStack.length > 0) {
      close();
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

    // Tab trap inside topmost modal
    if (e.key === 'Tab' && overlayStack.length > 0) {
      const topItem = overlayStack[overlayStack.length - 1];
      trapTabFocus(e, topItem.el);
    }
  }

  function trapTabFocus(e, containerEl) {
    const focusables = containerEl.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function bindBackdropClick(overlayEl, config) {
    if (overlayEl._cwpBackdropBound) return;
    overlayEl._cwpBackdropBound = true;

    overlayEl.addEventListener('click', function (e) {
      // Backdrop click only if target is the backdrop itself
      if (e.target === overlayEl) {
        if (config.backdropClose) {
          close(overlayEl.id);
        }
      }
    });

    // Close buttons inside
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
        initialFocus
      });
    });
  }

  window.CWP_ADMIN_V2.overlay = {
    init,
    open,
    close,
    closeAll,
    getTopmost: () => (overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null),
    getStackDepth: () => overlayStack.length
  };

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
