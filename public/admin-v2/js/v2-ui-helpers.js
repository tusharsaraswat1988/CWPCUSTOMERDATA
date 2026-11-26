/**
 * CWP Admin V2 Mock-Free UI Rendering Helpers
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.ui
 * Provides HTML escaping, loading skeletons, empty states, and retryable error states.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSkeletonRows(container, rows = 4, cols = 4) {
    if (!container) return '';
    const isTableBody = container.tagName === 'TBODY';
    let html = '';

    for (let r = 0; r < rows; r++) {
      if (isTableBody) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
          const pct = 55 + ((r * 17 + c * 23) % 35);
          html += `<td><span class="cwp-v2-skeleton-bar" style="width:${pct}%;"></span></td>`;
        }
        html += '</tr>';
      } else {
        const pct = 50 + ((r * 19) % 40);
        html += `<div style="padding:8px 0;"><span class="cwp-v2-skeleton-bar" style="width:${pct}%; height:14px;"></span></div>`;
      }
    }

    container.innerHTML = html;
    return html;
  }

  function renderSkeletonCards(container, count = 4) {
    if (!container) return '';
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="cwp-v2-skeleton-card" aria-hidden="true">
          <span class="cwp-v2-skeleton-bar" style="width:45%; height:11px;"></span>
          <span class="cwp-v2-skeleton-bar" style="width:65%; height:22px;"></span>
          <span class="cwp-v2-skeleton-bar" style="width:80%; height:11px;"></span>
        </div>
      `;
    }
    container.innerHTML = html;
    return html;
  }

  function renderEmptyState(container, opts = {}) {
    if (!container) return;
    const icon = escapeHtml(opts.icon || 'inbox');
    const title = escapeHtml(opts.title || 'No records found');
    const description = escapeHtml(opts.description || 'Live data returned no matching items.');
    const actionLabel = opts.actionLabel ? escapeHtml(opts.actionLabel) : '';

    container.innerHTML = `
      <div class="cwp-v2-empty-state-panel">
        <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">${icon}</span>
        <div class="cwp-v2-empty-state-title">${title}</div>
        <div class="cwp-v2-empty-state-desc">${description}</div>
        ${actionLabel ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-ui-empty-action>${actionLabel}</button>` : ''}
      </div>
    `;

    if (actionLabel && typeof opts.onAction === 'function') {
      const btn = container.querySelector('[data-ui-empty-action]');
      if (btn) btn.addEventListener('click', opts.onAction);
    }
  }

  function renderErrorState(container, opts = {}) {
    if (!container) return;
    const title = escapeHtml(opts.title || 'Unable to load live data');
    const message = escapeHtml(opts.message || 'Please verify your connection and try again.');
    const retryLabel = escapeHtml(opts.retryLabel || 'Retry');

    container.innerHTML = `
      <div class="cwp-v2-empty-state-panel" role="alert">
        <span class="material-symbols-outlined cwp-v2-empty-state-icon" style="color:var(--cwp-v2-status-danger);" aria-hidden="true">error_outline</span>
        <div class="cwp-v2-empty-state-title">${title}</div>
        <div class="cwp-v2-empty-state-desc">${message}</div>
        ${typeof opts.onRetry === 'function' ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-ui-error-retry><span class="material-symbols-outlined" aria-hidden="true" style="font-size:16px;">refresh</span><span>${retryLabel}</span></button>` : ''}
      </div>
    `;

    if (typeof opts.onRetry === 'function') {
      const btn = container.querySelector('[data-ui-error-retry]');
      if (btn) btn.addEventListener('click', opts.onRetry);
    }
  }

  window.CWP_ADMIN_V2.ui = {
    escapeHtml,
    renderSkeletonRows,
    renderSkeletonCards,
    renderEmptyState,
    renderErrorState
  };
})(window);
