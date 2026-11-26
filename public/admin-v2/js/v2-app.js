/**
 * CWP Admin V2 Main Application Orchestrator
 * STRICTLY SCOPED to window.CWP_ADMIN_V2
 * Baseline Spec: CWP MINOR App Admin Design System Spec v1.1
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};
  window.CWP_ADMIN_V2.version = '2.0.0-scaffold';
  window.CWP_ADMIN_V2.mode = 'parallel_isolated';

  async function start() {
    console.log(`[CWP Admin V2] Initializing isolated scaffold v${window.CWP_ADMIN_V2.version}...`);

    // 1. Initialize shell layout controller
    if (window.CWP_ADMIN_V2.shell) {
      window.CWP_ADMIN_V2.shell.init();
    }

    // 2. Non-blocking auth check
    if (window.CWP_ADMIN_V2.auth) {
      const session = await window.CWP_ADMIN_V2.auth.checkSession();
      const loginGate = document.getElementById('v2LoginGate');
      const appContainer = document.getElementById('v2AppContainer');

      if (!session.valid && !session.offline) {
        // If unauthenticated, show clean V2 login gate
        if (loginGate) loginGate.style.display = 'flex';
        if (appContainer) appContainer.style.filter = 'blur(4px)';
        bindLoginGate();
      } else {
        if (loginGate) loginGate.style.display = 'none';
        if (appContainer) appContainer.style.filter = 'none';
      }
    }

    console.log('[CWP Admin V2] Scaffold initialized successfully in parallel mode.');
  }

  function bindLoginGate() {
    const form = document.getElementById('v2LoginForm');
    const input = document.getElementById('v2AdminPasswordInput');
    const errEl = document.getElementById('v2LoginError');

    if (!form) return;

    form.onsubmit = async function (e) {
      e.preventDefault();
      if (errEl) errEl.textContent = '';
      const pass = (input && input.value) || '';

      const res = await window.CWP_ADMIN_V2.auth.login(pass);
      if (res.success) {
        const loginGate = document.getElementById('v2LoginGate');
        const appContainer = document.getElementById('v2AppContainer');
        if (loginGate) loginGate.style.display = 'none';
        if (appContainer) appContainer.style.filter = 'none';
      } else {
        if (errEl) errEl.textContent = res.error || 'Login failed.';
      }
    };
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.CWP_ADMIN_V2.start = start;
})(window);
