/**
 * CWP Admin V2 — SEE Services Catalogue Module (Production)
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.seeServices
 * Connected to canonical /api/see/services & /api/see/media/upload endpoints. Zero mock data.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  let initialized = false;
  let services = [];
  let categories = [];
  let routes = [];
  let marketingTags = [];
  let loading = false;
  let loadError = null;
  let editingService = null;
  let inspectingService = null;
  let pendingRetireService = null;

  let hideTestRecords = false;
  let currentPage = 1;
  const PAGE_SIZE = 25;

  // Modal form working state (discarded on Cancel/Close)
  let checklistItems = [];
  let selectedZones = new Set();
  let initialTagIds = new Set();
  let selectedTagIds = new Set();
  let mediaSlots = {
    square_1_1: { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' },
    rectangle_4_3: { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' }
  };
  let modelConfigState = {
    unit_label: 'panels',
    requires_quantity_verification: true,
    default_cadence: 'weekly',
    allow_addons: true
  };

  const MODEL_META = {
    visit_credit: {
      desc: 'Consumes package visit credits per valid job completion (e.g., Car Wash packs).',
      fields: ['allow_addons']
    },
    recurring: {
      desc: 'Scheduled recurring cadence with frequency rules (e.g., Daily/Weekly route service).',
      fields: ['default_cadence', 'allow_addons']
    },
    site_quantity: {
      desc: 'Measured & verified by site unit quantity (e.g., Solar Panel count verification).',
      fields: ['unit_label', 'requires_quantity_verification', 'allow_addons']
    },
    one_time: {
      desc: 'Single-execution standalone service without recurring entitlement credits.',
      fields: ['allow_addons']
    },
    flexible_custom: {
      desc: 'Custom execution & pricing rules configured per package or order.',
      fields: ['allow_addons']
    }
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function notifyToast(message, type = 'info') {
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.show === 'function') {
      window.CWP_ADMIN_V2.toast.show(message, type);
    }
  }

  function getHeaders(includeJson = false) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getCsrfToken === 'function') {
      const csrf = window.CWP_ADMIN_V2.auth.getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    return headers;
  }

  async function seeFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...getHeaders(!!options.body),
        ...(options.headers || {})
      }
    });

    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      data = { success: false, error: rawText || `Unexpected HTTP ${res.status}` };
    }

    if (res.status === 401 || res.status === 403 || data.unauthorized === true) {
      const err = new Error(data.error || 'Admin session expired. Please sign in again.');
      err.status = res.status;
      err.unauthorized = true;
      throw err;
    }

    if (!res.ok || data.success === false) {
      const err = new Error(data.error || data.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  function isDccService(svc) {
    if (!svc) return false;
    const catId = String(svc.service_category_id || '').toLowerCase();
    const code = String(svc.service_code || '').toUpperCase();
    const cfg = svc.execution_config && typeof svc.execution_config === 'object' ? svc.execution_config : {};
    return ['daily_car_cleaning', 'daily_clean', 'dcc'].includes(catId) || code === 'DCC_DAILY' || code.startsWith('SVC-DCC') || cfg.dcc_isolated === true;
  }

  function isGenericSeeService(svc) { return !!svc && !isDccService(svc); }

  function isTestRecord(svc) {
    const code = String(svc?.service_code || '').toUpperCase();
    const name = String(svc?.name || '').toUpperCase();
    return code.startsWith('TEST_') || code.startsWith('S03_') || code.startsWith('S07_') ||
      code.startsWith('SEE03') || code.startsWith('SEE07') ||
      name.includes('SEE03 TEST') || name.includes('SEE07') || name.includes('TEST CERAMIC');
  }

  function statusBadge(status) {
    const map = {
      active: 'cwp-v2-badge-success',
      draft: 'cwp-v2-badge-info',
      retired: 'cwp-v2-badge-neutral'
    };
    return `<span class="cwp-v2-badge ${map[status] || 'cwp-v2-badge-neutral'}">${escapeHtml(status || 'unknown')}</span>`;
  }

  function formatProofSummary(svc) {
    const checklist = Array.isArray(svc.checklist_requirements) ? svc.checklist_requirements : [];
    const photo = svc.photo_requirements && typeof svc.photo_requirements === 'object' ? svc.photo_requirements : {};
    const parts = [];
    parts.push(checklist.length ? `Checklist (${checklist.length})` : 'No Checklist');
    if (photo.required) {
      const pTypes = [];
      if (Number(photo.before_min) > 0) pTypes.push(`Before:${photo.before_min}`);
      if (Number(photo.after_min) > 0) pTypes.push(`After:${photo.after_min}`);
      parts.push(pTypes.length ? `Photo (${pTypes.join('/')})` : 'Photo Required');
    } else {
      parts.push('Photo Optional');
    }
    return parts.join(' • ');
  }

  function openLightbox(url, title, subtitle) {
    const img = document.getElementById('v2SeeMediaLightboxImg');
    const t = document.getElementById('v2SeeMediaLightboxTitle');
    const sub = document.getElementById('v2SeeMediaLightboxSub');
    if (img) img.src = url;
    if (t) t.textContent = title || 'Media Preview';
    if (sub) sub.textContent = subtitle || '';
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeMediaLightbox');
  }

  function updateSidebarBadge() {
    const badgeEl = document.getElementById('v2BadgeSeeServices');
    if (badgeEl) {
      const activeCount = services.filter(s => isGenericSeeService(s) && s.status === 'active' && !isTestRecord(s)).length;
      badgeEl.textContent = services.length ? String(activeCount) : '—';
    }
  }

  function populateCategorySelect() {
    const sel = document.getElementById('v2SeeProdSvcCategory');
    if (!sel) return;
    const catMap = new Map();
    categories.forEach(c => {
      if (c && c.id && !['daily_car_cleaning', 'daily_clean', 'dcc'].includes(String(c.id).toLowerCase())) catMap.set(c.id, c.name || c.display_name || c.id);
    });
    services.forEach(s => {
      if (s.service_category_id && !isDccService(s) && !catMap.has(s.service_category_id)) {
        catMap.set(s.service_category_id, s.category_name || s.service_category_id);
      }
    });
    if (catMap.size === 0) {
      catMap.set('car_washing', 'Car Wash');
      catMap.set('solar_cleaning', 'Solar Panel Cleaning');
      catMap.set('interior_detailing', 'Interior Detailing');
      catMap.set('exterior_detailing', 'Exterior Detailing');
    }
    const current = sel.value;
    sel.innerHTML = Array.from(catMap.entries())
      .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`)
      .join('');
    if (current && catMap.has(current)) {
      sel.value = current;
    } else {
      if (catMap.size) sel.value = catMap.keys().next().value;
    }
  }

  function render() {
    const loadingEl = document.getElementById('v2SeeProdServicesLoading');
    const emptyEl = document.getElementById('v2SeeProdServicesEmpty');
    const errorEl = document.getElementById('v2SeeProdServicesError');
    const errorMsgEl = document.getElementById('v2SeeProdServicesErrorMsg');
    const tableWrapEl = document.getElementById('v2SeeProdServicesTableWrap');
    const pagEl = document.getElementById('v2SeeProdServicesPagination');
    const pageInfoEl = document.getElementById('v2SeeProdServicesPageInfo');
    const prevBtn = document.getElementById('v2SeeProdSvcPagePrev');
    const nextBtn = document.getElementById('v2SeeProdSvcPageNext');
    const tbody = document.getElementById('v2SeeProdServicesTableBody');

    if (!tbody) return;

    if (loading) {
      if (loadingEl) loadingEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (tableWrapEl) tableWrapEl.style.display = 'none';
      if (pagEl) pagEl.style.display = 'none';
      return;
    }

    if (loadError) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsgEl) errorMsgEl.textContent = loadError;
      if (tableWrapEl) tableWrapEl.style.display = 'none';
      if (pagEl) pagEl.style.display = 'none';
      return;
    }

    const q = (document.getElementById('v2SeeProdServiceSearch')?.value || '').trim().toLowerCase();
    const modelF = document.getElementById('v2SeeProdServiceModelFilter')?.value || 'ALL';
    const statusF = document.getElementById('v2SeeProdServiceStatusFilter')?.value || 'ALL';

    const filtered = services.filter(s => {
      if (!isGenericSeeService(s)) return false;
      if (hideTestRecords && isTestRecord(s)) return false;
      if (q) {
        const hay = `${s.service_code || ''} ${s.name || ''} ${s.category_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (modelF !== 'ALL' && s.service_model !== modelF) return false;
      if (statusF !== 'ALL' && s.status !== statusF) return false;
      return true;
    });

    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (tableWrapEl) tableWrapEl.style.display = 'none';
      if (pagEl) pagEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableWrapEl) tableWrapEl.style.display = 'block';

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    if (pagEl) pagEl.style.display = filtered.length > PAGE_SIZE ? 'flex' : 'none';
    if (pageInfoEl) pageInfoEl.textContent = `Showing ${startIdx + 1}–${startIdx + pageRows.length} of ${filtered.length} services`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    tbody.innerHTML = pageRows.map(s => {
      const dcc = isDccService(s);
      const retired = s.status === 'retired';
      return `
        <tr class="${retired ? 'is-disabled' : ''}">
          <td><span class="cwp-v2-cell-mono">${escapeHtml(s.service_code)}</span></td>
          <td>
            <strong>${escapeHtml(s.name)}</strong>
            ${dcc
              ? `<span class="cwp-v2-badge cwp-v2-badge-warning" style="margin-left:6px; font-size:10px;" title="Daily Car Cleaning operates on its own isolated route workflow">DCC Route Isolated</span>`
              : `<span style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted);"> &bull; ${escapeHtml(s.category_name || s.service_category_id)}</span>`}
          </td>
          <td><code>${escapeHtml(s.service_model)}</code></td>
          <td>${escapeHtml(formatProofSummary(s))}</td>
          <td>v${escapeHtml(s.version || 1)}</td>
          <td>${statusBadge(s.status)}</td>
          <td class="is-sticky-action">
            <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-see-prod-details="${escapeHtml(s.id)}">Details</button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-see-prod-edit="${escapeHtml(s.id)}" ${retired ? 'disabled title="Retired services cannot be edited"' : ''}>Edit</button>
            ${!retired
              ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-danger cwp-v2-btn-sm" data-see-prod-retire="${escapeHtml(s.id)}">Retire</button>`
              : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadServices() {
    loading = true;
    loadError = null;
    render();

    try {
      const api = window.CWP_ADMIN_V2.api;
      const [svcRes, catRes, routesRes, tagsRes] = await Promise.all([
        seeFetch('/api/see/services?includeRetired=true&limit=200&offset=0'),
        api ? api.request('getServiceCatalog', {}, { skipUnauthorizedHandler: true }).catch(() => null) : Promise.resolve(null),
        api ? api.request('getAllRoutes', {}, { skipUnauthorizedHandler: true }).catch(() => []) : Promise.resolve([]),
        seeFetch('/api/see/marketing-tags?activeOnly=true').catch(() => ({ tags: [] }))
      ]);
      services = Array.isArray(svcRes.services) ? svcRes.services : [];
      if (catRes && catRes.categories) {
        categories = Array.isArray(catRes.categories)
          ? catRes.categories
          : Object.values(catRes.categories);
      }
      routes = Array.isArray(routesRes) ? routesRes : [];
      marketingTags = Array.isArray(tagsRes?.tags) ? tagsRes.tags : [];
      populateCategorySelect();
      updateSidebarBadge();
    } catch (err) {
      loadError = err.message || 'Failed to load SEE services.';
    } finally {
      loading = false;
      render();
    }
  }

  // -------------------------------------------------------------------------
  // Real Binary Media Upload & Preview (Square 1:1 & Rectangle 4:3)
  // -------------------------------------------------------------------------
  function readImageFile(file, slot) {
    return new Promise((resolve, reject) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        return reject(new Error('Unsupported format. Please select a JPG, PNG, or WebP image.'));
      }
      if (file.size > 5 * 1024 * 1024) {
        return reject(new Error('File size exceeds 5 MB limit.'));
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const ratio = w / Math.max(1, h);
          if (slot === 'square_1_1' && Math.abs(ratio - 1.0) > 0.08) {
            return reject(new Error(`Square slot requires ~1:1 aspect ratio (selected ${w}×${h}).`));
          }
          if (slot === 'rectangle_4_3' && Math.abs(ratio - (4 / 3)) > 0.15) {
            return reject(new Error(`Rectangle slot requires ~4:3 aspect ratio (selected ${w}×${h}).`));
          }
          resolve({ dataUrl, width: w, height: h, filename: file.name });
        };
        img.onerror = () => reject(new Error('Unable to read image dimensions.'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsDataURL(file);
    });
  }

  function renderMediaSlot(slot) {
    const isSq = slot === 'square_1_1';
    const state = mediaSlots[slot];
    const errEl = document.getElementById(isSq ? 'v2SeeProdSvcMediaSqError' : 'v2SeeProdSvcMediaRectError');
    const prevEl = document.getElementById(isSq ? 'v2SeeProdSvcMediaSqPreview' : 'v2SeeProdSvcMediaRectPreview');
    if (errEl) {
      errEl.textContent = state.error || '';
      errEl.style.display = state.error ? 'block' : 'none';
    }
    if (!prevEl) return;

    if (state.uploading) {
      prevEl.innerHTML = `<span class="cwp-v2-btn-spinner" style="border-color:var(--cwp-v2-sys-primary); border-top-color:transparent;"></span><span style="font-size:12px;">Uploading image...</span>`;
      return;
    }

    const previewSrc = state.pendingFile ? state.pendingFile.dataUrl : state.url;
    if (!previewSrc) {
      prevEl.innerHTML = `<span style="font-size:11.5px; color:var(--cwp-v2-sys-on-surface-muted);">No image uploaded yet.</span>`;
      return;
    }

    const boxStyle = isSq
      ? 'width:56px; height:56px; object-fit:cover; border-radius:var(--cwp-v2-radius-sm); border:1px solid var(--cwp-v2-sys-border); cursor:pointer;'
      : 'width:76px; height:57px; object-fit:cover; border-radius:var(--cwp-v2-radius-sm); border:1px solid var(--cwp-v2-sys-border); cursor:pointer;';
    const infoText = state.filename || (state.width && state.height ? `${state.width}×${state.height}` : 'Uploaded asset');

    prevEl.innerHTML = `
      <img src="${escapeHtml(previewSrc)}" alt="Preview" style="${boxStyle}" data-see-svc-enlarge="${slot}" title="Click to enlarge">
      <div style="flex:1; min-width:0; font-size:11.5px;">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(infoText)}</div>
        <div style="color:var(--cwp-v2-sys-on-surface-muted);">${state.pendingFile ? 'Ready to upload on save' : 'Saved on server'}</div>
      </div>
      <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-see-svc-replace="${slot}">Replace</button>
      <button type="button" class="cwp-v2-btn cwp-v2-btn-danger cwp-v2-btn-sm" data-see-svc-remove="${slot}">Remove</button>
    `;
  }

  async function handleMediaFileSelected(file, slot) {
    if (!file) return;
    const state = mediaSlots[slot];
    state.error = '';
    try {
      const parsed = await readImageFile(file, slot);
      state.width = parsed.width;
      state.height = parsed.height;
      state.filename = parsed.filename;
      if (editingService && editingService.id) {
        state.uploading = true;
        renderMediaSlot(slot);
        const res = await seeFetch('/api/see/media/upload', {
          method: 'POST',
          body: JSON.stringify({
            entityType: 'service',
            entityId: editingService.id,
            mediaSlot: slot,
            base64: parsed.dataUrl,
            mimeType: file.type,
            altText: (document.getElementById('v2SeeProdSvcName')?.value || editingService.name || 'Service image').trim(),
            width: parsed.width,
            height: parsed.height
          })
        });
        state.assetId = res.media?.id || null;
        state.url = res.media?.storage_url || '';
        state.pendingFile = null;
        notifyToast(`${slot === 'square_1_1' ? 'Square (1:1)' : 'Rectangle (4:3)'} image uploaded.`, 'success');
      } else {
        state.pendingFile = { dataUrl: parsed.dataUrl, mimeType: file.type, width: parsed.width, height: parsed.height, filename: parsed.filename };
      }
    } catch (err) {
      state.error = err.message || 'Image upload failed.';
    } finally {
      state.uploading = false;
      renderMediaSlot(slot);
    }
  }

  async function handleMediaRemove(slot) {
    const state = mediaSlots[slot];
    state.error = '';
    if (state.assetId) {
      state.uploading = true;
      renderMediaSlot(slot);
      try {
        await seeFetch(`/api/see/media/${encodeURIComponent(state.assetId)}`, { method: 'DELETE' });
        notifyToast('Media asset removed.', 'info');
      } catch (err) {
        state.error = err.message || 'Failed to remove media.';
        state.uploading = false;
        renderMediaSlot(slot);
        return;
      }
    }
    mediaSlots[slot] = { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' };
    renderMediaSlot(slot);
  }

  // -------------------------------------------------------------------------
  // Modal Sub-Renderers (Model Config, Photo Proof, City/Zone, Checklist, Tags)
  // -------------------------------------------------------------------------
  function renderModelConfig() {
    const model = document.getElementById('v2SeeProdSvcModel')?.value || 'visit_credit';
    const meta = MODEL_META[model] || MODEL_META.one_time;
    const badgeEl = document.getElementById('v2SeeProdSvcModelBadge');
    const descEl = document.getElementById('v2SeeProdSvcModelDesc');
    const fieldsEl = document.getElementById('v2SeeProdSvcModelFields');
    if (badgeEl) badgeEl.textContent = model;
    if (descEl) descEl.textContent = meta.desc;
    if (!fieldsEl) return;

    const html = [];
    if (meta.fields.includes('unit_label')) {
      html.push(`
        <div class="cwp-v2-field-group">
          <label class="cwp-v2-field-label" for="v2SeeProdModelUnitLabel">Unit Label</label>
          <div class="cwp-v2-input-box cwp-v2-input-sm">
            <input type="text" id="v2SeeProdModelUnitLabel" class="cwp-v2-input" value="${escapeHtml(modelConfigState.unit_label || 'panels')}" placeholder="e.g. panels, units">
          </div>
        </div>
      `);
    }
    if (meta.fields.includes('requires_quantity_verification')) {
      html.push(`
        <div class="cwp-v2-field-group" style="justify-content:center;">
          <label class="cwp-v2-switch cwp-v2-switch-sm" style="margin-top:14px;">
            <input type="checkbox" id="v2SeeProdModelQtyVerify" class="cwp-v2-switch-input" ${modelConfigState.requires_quantity_verification ? 'checked' : ''}>
            <span class="cwp-v2-switch-track"><span class="cwp-v2-switch-thumb"></span></span>
            <span class="cwp-v2-switch-text"><span class="cwp-v2-switch-title">Require Staff Quantity Verification</span></span>
          </label>
        </div>
      `);
    }
    if (meta.fields.includes('default_cadence')) {
      html.push(`
        <div class="cwp-v2-field-group">
          <label class="cwp-v2-field-label" for="v2SeeProdModelCadence">Default Recurrence Cadence</label>
          <select id="v2SeeProdModelCadence" class="cwp-v2-select-compact">
            <option value="daily" ${modelConfigState.default_cadence === 'daily' ? 'selected' : ''}>daily</option>
            <option value="alternate_days" ${modelConfigState.default_cadence === 'alternate_days' ? 'selected' : ''}>alternate_days</option>
            <option value="weekly" ${modelConfigState.default_cadence === 'weekly' ? 'selected' : ''}>weekly</option>
            <option value="monthly" ${modelConfigState.default_cadence === 'monthly' ? 'selected' : ''}>monthly</option>
          </select>
        </div>
      `);
    }
    if (meta.fields.includes('allow_addons')) {
      html.push(`
        <div class="cwp-v2-field-group" style="justify-content:center;">
          <label class="cwp-v2-switch cwp-v2-switch-sm" style="margin-top:14px;">
            <input type="checkbox" id="v2SeeProdModelAllowAddons" class="cwp-v2-switch-input" ${modelConfigState.allow_addons !== false ? 'checked' : ''}>
            <span class="cwp-v2-switch-track"><span class="cwp-v2-switch-thumb"></span></span>
            <span class="cwp-v2-switch-text">
              <span class="cwp-v2-switch-title">Service-Level Add-on Eligibility</span>
              <span class="cwp-v2-switch-desc">Permits add-ons on this service; per-add-on compatibility is configured in Add-ons.</span>
            </span>
          </label>
        </div>
      `);
    }
    fieldsEl.innerHTML = html.join('');

    document.getElementById('v2SeeProdModelUnitLabel')?.addEventListener('input', e => {
      modelConfigState.unit_label = e.target.value;
    });
    document.getElementById('v2SeeProdModelQtyVerify')?.addEventListener('change', e => {
      modelConfigState.requires_quantity_verification = e.target.checked;
    });
    document.getElementById('v2SeeProdModelCadence')?.addEventListener('change', e => {
      modelConfigState.default_cadence = e.target.value;
    });
    document.getElementById('v2SeeProdModelAllowAddons')?.addEventListener('change', e => {
      modelConfigState.allow_addons = e.target.checked;
    });
  }

  function renderPhotoProofVisibility() {
    const required = !!document.getElementById('v2SeeProdSvcPhotoRequired')?.checked;
    const wrap = document.getElementById('v2SeeProdSvcPhotoCountsWrap');
    if (wrap) wrap.style.display = required ? 'grid' : 'none';
  }

  function renderZoneChips() {
    const allCities = !!document.getElementById('v2SeeProdSvcAllCities')?.checked;
    const scopeWrap = document.getElementById('v2SeeProdSvcScopeWrap');
    const chipsEl = document.getElementById('v2SeeProdSvcZoneChips');
    if (scopeWrap) scopeWrap.style.display = allCities ? 'none' : 'block';
    if (!chipsEl) return;

    const zoneSet = new Set();
    routes.forEach(r => {
      const label = r.route_name || r.name || r.zone_name || r.code;
      if (label) zoneSet.add(String(label).trim());
    });
    selectedZones.forEach(z => zoneSet.add(z));

    if (zoneSet.size === 0) {
      chipsEl.innerHTML = `<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">No routes/zones loaded from server. Keep "All Cities &amp; Zones" enabled.</span>`;
      return;
    }

    chipsEl.innerHTML = Array.from(zoneSet).map(z => `
      <button type="button" class="cwp-v2-filter-chip ${selectedZones.has(z) ? 'is-active' : ''}" data-see-zone="${escapeHtml(z)}">${escapeHtml(z)}</button>
    `).join('');
  }

  function renderTagChips() {
    const chipsEl = document.getElementById('v2SeeProdSvcTagChips');
    if (!chipsEl) return;
    if (!marketingTags.length) {
      chipsEl.innerHTML = `<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">No active marketing tags available.</span>`;
      return;
    }
    chipsEl.innerHTML = marketingTags.map(t => {
      const id = String(t.id);
      const isAttached = initialTagIds.has(id);
      const isSelected = selectedTagIds.has(id);
      return `<button type="button" class="cwp-v2-filter-chip ${isSelected ? 'is-active' : ''}" data-see-tag-id="${escapeHtml(id)}" ${isAttached ? 'title="Already attached"' : ''}>${escapeHtml(t.label || t.code)}</button>`;
    }).join('');
  }

  function slugifyChecklistId(label, idx = 0) {
    const raw = String(label || '').trim().toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || `item_${idx + 1}`;
  }

  function normalizeLocalChecklistItems(rawList) {
    const usedIds = new Set();
    const out = [];
    (Array.isArray(rawList) ? rawList : []).forEach((item, idx) => {
      const label = typeof item === 'string'
        ? item.trim()
        : String(item?.label || item?.name || item?.title || item?.item || '').trim();
      if (!label) return;
      let id = (item && typeof item === 'object' && (item.id || item.key || item.itemId))
        ? String(item.id || item.key || item.itemId).trim()
        : slugifyChecklistId(label, idx);
      if (!id) id = slugifyChecklistId(label, idx);
      let uniqueId = id;
      let suffix = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${id}_${suffix}`;
        suffix += 1;
      }
      usedIds.add(uniqueId);
      const key = (item && typeof item === 'object' && item.key) ? String(item.key).trim() : uniqueId;
      out.push({
        id: uniqueId,
        key,
        label,
        required: (item && typeof item === 'object') ? (item.required !== false) : true
      });
    });
    return out;
  }

  function renderChecklistEditor() {
    const listEl = document.getElementById('v2SeeProdSvcChkList');
    if (!listEl) return;
    if (!checklistItems.length) {
      listEl.innerHTML = `<div style="font-size:11.5px; color:var(--cwp-v2-sys-on-surface-muted); padding:6px 0;">No checklist items added yet.</div>`;
      return;
    }
    listEl.innerHTML = checklistItems.map((item, idx) => {
      const norm = (item && typeof item === 'object') ? item : { id: slugifyChecklistId(item, idx), key: slugifyChecklistId(item, idx), label: String(item || ''), required: true };
      const isReq = norm.required !== false;
      return `
      <div data-chk-id="${escapeHtml(norm.id)}" style="display:flex; align-items:center; gap:6px; padding:4px 6px; border:1px solid var(--cwp-v2-sys-border-subtle); border-radius:var(--cwp-v2-radius-sm); background:var(--cwp-v2-sys-surface);">
        <span style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted); min-width:16px;">${idx + 1}.</span>
        <input type="text" class="cwp-v2-input v2-see-chk-edit" data-chk-idx="${idx}" value="${escapeHtml(norm.label)}" style="font-size:12px; height:24px;">
        <label style="display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--cwp-v2-sys-on-surface-muted); white-space:nowrap; cursor:pointer;" title="Required for completion"><input type="checkbox" data-chk-req="${idx}" ${isReq ? 'checked' : ''}>Req</label>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-subtle cwp-v2-btn-sm" data-chk-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up"><span class="material-symbols-outlined" style="font-size:14px;">arrow_upward</span></button>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-subtle cwp-v2-btn-sm" data-chk-down="${idx}" ${idx === checklistItems.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down"><span class="material-symbols-outlined" style="font-size:14px;">arrow_downward</span></button>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-danger cwp-v2-btn-sm" data-chk-del="${idx}" title="Remove" aria-label="Remove"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
      </div>
    `;
    }).join('');
  }

  function updateDccModalNotice() {
    const notice = document.getElementById('v2SeeProdSvcDccNotice');
    const catSel = document.getElementById('v2SeeProdSvcCategory');
    const codeInp = document.getElementById('v2SeeProdSvcCode');
    const modelSel = document.getElementById('v2SeeProdSvcModel');
    const saveBtn = document.getElementById('v2SeeProdSvcSaveBtn');

    if (notice) notice.style.display = 'none';
    if (modelSel) modelSel.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }

  async function openServiceModal(svc) {
    editingService = svc || null;
    populateCategorySelect();
    const errEl = document.getElementById('v2SeeProdSvcFormError');
    const chkErrEl = document.getElementById('v2SeeProdSvcChkError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (chkErrEl) { chkErrEl.style.display = 'none'; chkErrEl.textContent = ''; }

    let detailSvc = svc;
    if (svc && svc.id) {
      try {
        const res = await seeFetch(`/api/see/services/${encodeURIComponent(svc.id)}`);
        if (res && res.service) detailSvc = res.service;
      } catch (e) {}
    }

    const codeInp = document.getElementById('v2SeeProdSvcCode');
    const nameInp = document.getElementById('v2SeeProdSvcName');
    const nameHiInp = document.getElementById('v2SeeProdSvcNameHi');
    const catSel = document.getElementById('v2SeeProdSvcCategory');
    const modelSel = document.getElementById('v2SeeProdSvcModel');
    const statusSel = document.getElementById('v2SeeProdSvcStatus');
    const durInp = document.getElementById('v2SeeProdSvcDuration');
    const taglineInp = document.getElementById('v2SeeProdSvcTagline');
    const descInp = document.getElementById('v2SeeProdSvcDesc');
    const detailsInp = document.getElementById('v2SeeProdSvcDetails');
    const chkInput = document.getElementById('v2SeeProdSvcChkInput');
    const photoChk = document.getElementById('v2SeeProdSvcPhotoRequired');
    const beforeInp = document.getElementById('v2SeeProdSvcBeforeMin');
    const afterInp = document.getElementById('v2SeeProdSvcAfterMin');
    const allCitiesChk = document.getElementById('v2SeeProdSvcAllCities');
    const reasonWrap = document.getElementById('v2SeeProdSvcReasonWrap');
    const reasonInp = document.getElementById('v2SeeProdSvcReason');

    document.getElementById('v2SeeProdServiceModalTitle').textContent = detailSvc
      ? `Edit Service • ${detailSvc.service_code}`
      : 'Create SEE Service';
    document.getElementById('v2SeeProdServiceModalSub').textContent = detailSvc
      ? `Updates create version ${(detailSvc.version || 1) + 1} and apply to future sales only.`
      : 'Define canonical service configuration, model, checklist, and proof requirements.';

    if (codeInp) {
      codeInp.value = detailSvc ? (detailSvc.service_code || '') : '';
      codeInp.disabled = !!detailSvc;
    }
    if (nameInp) nameInp.value = detailSvc ? (detailSvc.name || '') : '';
    if (nameHiInp) nameHiInp.value = detailSvc ? (detailSvc.name_hi || '') : '';
    if (catSel) {
      if (detailSvc && detailSvc.service_category_id) {
        catSel.value = detailSvc.service_category_id;
      } else {
        const nonDcc = Array.from(catSel.options).find(o => o.value !== 'daily_car_cleaning');
        if (nonDcc) catSel.value = nonDcc.value;
      }
    }
    if (modelSel) modelSel.value = detailSvc ? (detailSvc.service_model || 'one_time') : 'visit_credit';
    if (statusSel) {
      statusSel.value = detailSvc ? (detailSvc.status || 'draft') : 'draft';
      statusSel.disabled = !!detailSvc;
    }
    if (durInp) durInp.value = detailSvc && detailSvc.expected_duration_minutes ? detailSvc.expected_duration_minutes : 30;
    if (taglineInp) taglineInp.value = detailSvc ? (detailSvc.tagline || '') : '';
    if (descInp) descInp.value = detailSvc ? (detailSvc.description || '') : '';
    if (detailsInp) detailsInp.value = detailSvc ? (detailSvc.details || '') : '';
    if (chkInput) chkInput.value = '';

    const mediaList = Array.isArray(detailSvc?.media) ? detailSvc.media : [];
    const sqAsset = mediaList.find(m => m.media_slot === 'square_1_1');
    const rectAsset = mediaList.find(m => m.media_slot === 'rectangle_4_3');
    mediaSlots = {
      square_1_1: {
        assetId: sqAsset?.id || null,
        url: sqAsset?.storage_url || '',
        filename: sqAsset ? 'Square (1:1) Image' : '',
        width: sqAsset?.width || null,
        height: sqAsset?.height || null,
        pendingFile: null,
        uploading: false,
        error: ''
      },
      rectangle_4_3: {
        assetId: rectAsset?.id || null,
        url: rectAsset?.storage_url || '',
        filename: rectAsset ? 'Rectangle (4:3) Image' : '',
        width: rectAsset?.width || null,
        height: rectAsset?.height || null,
        pendingFile: null,
        uploading: false,
        error: ''
      }
    };

    const attachedTags = Array.isArray(detailSvc?.marketingTags) ? detailSvc.marketingTags : [];
    initialTagIds = new Set(attachedTags.map(t => String(t.id)));
    selectedTagIds = new Set(initialTagIds);

    const rawList = Array.isArray(detailSvc?.checklist_requirements) ? detailSvc.checklist_requirements : [];
    checklistItems = normalizeLocalChecklistItems(rawList);

    const execCfg = detailSvc?.execution_config && typeof detailSvc.execution_config === 'object' ? detailSvc.execution_config : {};
    modelConfigState = {
      unit_label: execCfg.unit_label || 'panels',
      requires_quantity_verification: execCfg.requires_quantity_verification !== false,
      default_cadence: execCfg.default_cadence || 'weekly',
      allow_addons: execCfg.allow_addons !== false
    };

    const pr = detailSvc?.photo_requirements || {};
    if (photoChk) photoChk.checked = !!pr.required;
    if (beforeInp) beforeInp.value = pr.required ? Number(pr.before_min || 1) : 1;
    if (afterInp) afterInp.value = pr.required ? Number(pr.after_min || 1) : 1;

    const cza = detailSvc?.city_zone_applicability || { all_cities: true, cities: [], zones: [] };
    if (allCitiesChk) allCitiesChk.checked = cza.all_cities !== false;
    selectedZones = new Set([
      ...(Array.isArray(cza.zones) ? cza.zones : []),
      ...(Array.isArray(cza.cities) ? cza.cities : [])
    ].filter(Boolean));

    if (reasonWrap) reasonWrap.style.display = detailSvc ? 'block' : 'none';
    if (reasonInp) reasonInp.value = '';

    renderModelConfig();
    renderPhotoProofVisibility();
    renderZoneChips();
    renderChecklistEditor();
    renderTagChips();
    renderMediaSlot('square_1_1');
    renderMediaSlot('rectangle_4_3');
    updateDccModalNotice();
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdServiceModal');
  }

  async function saveService() {
    const saveBtn = document.getElementById('v2SeeProdSvcSaveBtn');
    const errEl = document.getElementById('v2SeeProdSvcFormError');
    const showErr = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    };

    const code = (document.getElementById('v2SeeProdSvcCode')?.value || '').trim().toUpperCase();
    const name = (document.getElementById('v2SeeProdSvcName')?.value || '').trim();
    const nameHi = (document.getElementById('v2SeeProdSvcNameHi')?.value || '').trim();
    const serviceCategoryId = document.getElementById('v2SeeProdSvcCategory')?.value || '';
    const serviceModel = document.getElementById('v2SeeProdSvcModel')?.value || 'one_time';
    const status = document.getElementById('v2SeeProdSvcStatus')?.value || 'draft';
    const durationRaw = Number(document.getElementById('v2SeeProdSvcDuration')?.value);
    const tagline = (document.getElementById('v2SeeProdSvcTagline')?.value || '').trim();
    const description = (document.getElementById('v2SeeProdSvcDesc')?.value || '').trim();
    const details = (document.getElementById('v2SeeProdSvcDetails')?.value || '').trim();
    const photoRequired = !!document.getElementById('v2SeeProdSvcPhotoRequired')?.checked;
    const beforeMin = parseInt(document.getElementById('v2SeeProdSvcBeforeMin')?.value || '0', 10);
    const afterMin = parseInt(document.getElementById('v2SeeProdSvcAfterMin')?.value || '0', 10);
    const allCities = !!document.getElementById('v2SeeProdSvcAllCities')?.checked;
    const reason = (document.getElementById('v2SeeProdSvcReason')?.value || '').trim();

    if (!code || !name || !serviceCategoryId) {
      return showErr('Service Code, Service Name, and Category are required.');
    }
    if (serviceCategoryId === 'daily_car_cleaning' || code === 'DCC_DAILY' || code.startsWith('SVC-DCC')) return showErr('Select a valid SEE service category and code.');
    if (!Number.isInteger(durationRaw) || durationRaw < 1 || durationRaw > 1440) {
      return showErr('Expected Duration must be a whole number between 1 and 1440 minutes.');
    }
    if (photoRequired) {
      if (isNaN(beforeMin) || beforeMin < 0 || isNaN(afterMin) || afterMin < 0 || (beforeMin + afterMin) < 1) {
        return showErr('When Photo Proof is required, Before Min + After Min must be at least 1.');
      }
    }
    if (!allCities && selectedZones.size === 0) {
      return showErr('Select at least one applicable zone/route, or enable "All Cities & Zones".');
    }

    const executionConfig = { allow_addons: modelConfigState.allow_addons !== false };
    if (serviceModel === 'site_quantity') {
      executionConfig.unit_label = (modelConfigState.unit_label || 'panels').trim() || 'panels';
      executionConfig.requires_quantity_verification = !!modelConfigState.requires_quantity_verification;
    } else if (serviceModel === 'recurring') {
      executionConfig.default_cadence = modelConfigState.default_cadence || 'weekly';
    }

    const runner = async () => {
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      const payload = {
        name,
        nameHi: nameHi || null,
        serviceCategoryId,
        serviceModel,
        tagline: tagline || null,
        description: description || null,
        details: details || null,
        executionConfig,
        expectedDurationMinutes: durationRaw,
        checklistRequirements: checklistItems
          .map((item, idx) => {
            if (typeof item === 'string') {
              const label = item.trim();
              if (!label) return null;
              const id = slugifyChecklistId(label, idx);
              return { id, key: id, label, required: true };
            }
            const label = String(item?.label || '').trim();
            if (!label) return null;
            const id = String(item.id || item.key || slugifyChecklistId(label, idx)).trim();
            const key = String(item.key || id).trim();
            return { id, key, label, required: item.required !== false };
          })
          .filter(Boolean),
        photoRequirements: {
          required: photoRequired,
          before_min: photoRequired ? beforeMin : 0,
          after_min: photoRequired ? afterMin : 0
        },
        cityZoneApplicability: {
          all_cities: allCities,
          cities: [],
          zones: allCities ? [] : Array.from(selectedZones)
        }
      };

      let savedSvc = null;
      if (editingService) {
        payload.reason = reason || 'Updated via Admin Services UI';
        const res = await seeFetch(`/api/see/services/${encodeURIComponent(editingService.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        savedSvc = res.service;
      } else {
        payload.serviceCode = code;
        payload.status = status;
        const res = await seeFetch('/api/see/services', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        savedSvc = res.service;
      }

      if (savedSvc && savedSvc.id) {
        const postOps = [];
        ['square_1_1', 'rectangle_4_3'].forEach(slot => {
          const st = mediaSlots[slot];
          if (st.pendingFile) {
            postOps.push(seeFetch('/api/see/media/upload', {
              method: 'POST',
              body: JSON.stringify({
                entityType: 'service',
                entityId: savedSvc.id,
                mediaSlot: slot,
                base64: st.pendingFile.dataUrl,
                mimeType: st.pendingFile.mimeType,
                altText: name,
                width: st.pendingFile.width,
                height: st.pendingFile.height
              })
            }));
          }
        });
        const newTagIds = Array.from(selectedTagIds).filter(id => !initialTagIds.has(id));
        newTagIds.forEach((tagId, idx) => {
          postOps.push(seeFetch('/api/see/marketing-tags/attach', {
            method: 'POST',
            body: JSON.stringify({
              entityType: 'service',
              entityId: savedSvc.id,
              tagId,
              sortOrder: idx + 1
            })
          }));
        });
        if (postOps.length) await Promise.all(postOps);
      }

      notifyToast(editingService ? `Service ${editingService.service_code} updated.` : `Service ${code} created.`, 'success');
      if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2SeeProdServiceModal');
      await loadServices();
    };

    try {
      if (window.CWP_ADMIN_V2.api && typeof window.CWP_ADMIN_V2.api.withLoadingButton === 'function') {
        await window.CWP_ADMIN_V2.api.withLoadingButton(saveBtn, runner);
      } else {
        await runner();
      }
    } catch (err) {
      showErr(err.message || 'Failed to save service.');
    }
  }

  async function openServiceDetails(serviceId) {
    const titleEl = document.getElementById('v2SeeProdServiceDrawerTitle');
    const subEl = document.getElementById('v2SeeProdServiceDrawerSub');
    const bodyEl = document.getElementById('v2SeeProdServiceDrawerBody');
    const retireBtn = document.getElementById('v2SeeProdDrawerRetireBtn');

    if (titleEl) titleEl.textContent = 'Loading Service Details...';
    if (subEl) subEl.textContent = '';
    if (bodyEl) bodyEl.innerHTML = `<div class="cwp-v2-skeleton-bar" style="height:80px; width:100%;"></div>`;
    if (retireBtn) retireBtn.disabled = true;

    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdServiceDrawer');

    try {
      const res = await seeFetch(`/api/see/services/${encodeURIComponent(serviceId)}`);
      const svc = res.service;
      inspectingService = svc;
      const dcc = isDccService(svc);

      if (titleEl) titleEl.textContent = `${svc.name} (${svc.service_code})`;
      if (subEl) subEl.textContent = `Version ${svc.version || 1} • ${svc.status}`;

      const checklist = Array.isArray(svc.checklist_requirements) ? svc.checklist_requirements : [];
      const pr = svc.photo_requirements || {};
      const cza = svc.city_zone_applicability || { all_cities: true, cities: [], zones: [] };
      const scopeList = [...(cza.zones || []), ...(cza.cities || [])].filter(Boolean);
      const tags = Array.isArray(svc.marketingTags) ? svc.marketingTags : [];
      const addons = Array.isArray(svc.applicableAddons) ? svc.applicableAddons : [];
      const mediaList = Array.isArray(svc.media) ? svc.media : [];
      const sqAsset = mediaList.find(m => m.media_slot === 'square_1_1');
      const rectAsset = mediaList.find(m => m.media_slot === 'rectangle_4_3');
      const execCfg = svc.execution_config || {};

      if (bodyEl) {
        bodyEl.innerHTML = `
          ${dcc ? `<div class="cwp-v2-expanded-card" style="border-left:3px solid var(--cwp-v2-status-warning);"><span class="cwp-v2-expanded-card-title">DCC Operational Isolation</span><div style="font-size:12.5px;">Daily Car Cleaning runs on its own dedicated route plan and daily cleaning status workflow.</div></div>` : ''}
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Configuration &amp; Content</span>
            <div style="font-size:12.5px; line-height:1.6;">
              Category: <strong>${escapeHtml(svc.category_name || svc.service_category_id)}</strong> &bull; Model: <code>${escapeHtml(svc.service_model)}</code><br>
              Expected Duration: <strong>${escapeHtml(svc.expected_duration_minutes || 30)} mins</strong> &bull; Add-on Eligibility: <strong>${execCfg.allow_addons !== false ? 'Enabled' : 'Disabled'}</strong><br>
              Status: ${statusBadge(svc.status)} &bull; Version: <strong>v${escapeHtml(svc.version || 1)}</strong>
              ${svc.name_hi ? `<div style="margin-top:4px;"><strong>Hindi Name:</strong> ${escapeHtml(svc.name_hi)}</div>` : ''}
              ${svc.tagline ? `<div style="margin-top:4px;"><strong>Tagline:</strong> ${escapeHtml(svc.tagline)}</div>` : ''}
              ${svc.description ? `<div style="margin-top:4px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(svc.description)}</div>` : ''}
              ${svc.details ? `<div style="margin-top:4px; font-size:12px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(svc.details)}</div>` : ''}
            </div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Service Media</span>
            <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-top:4px;">
              <div>
                <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted); margin-bottom:4px;">Square (1:1)</div>
                ${sqAsset ? `<img src="${escapeHtml(sqAsset.storage_url)}" alt="${escapeHtml(sqAsset.alt_text || svc.name)}" data-see-drawer-enlarge="${escapeHtml(sqAsset.storage_url)}" data-see-drawer-title="${escapeHtml(svc.name)} (1:1)" style="width:64px; height:64px; object-fit:cover; border-radius:var(--cwp-v2-radius-sm); border:1px solid var(--cwp-v2-sys-border); cursor:pointer;">` : '<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">None</span>'}
              </div>
              <div>
                <div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted); margin-bottom:4px;">Rectangular (4:3)</div>
                ${rectAsset ? `<img src="${escapeHtml(rectAsset.storage_url)}" alt="${escapeHtml(rectAsset.alt_text || svc.name)}" data-see-drawer-enlarge="${escapeHtml(rectAsset.storage_url)}" data-see-drawer-title="${escapeHtml(svc.name)} (4:3)" style="width:88px; height:66px; object-fit:cover; border-radius:var(--cwp-v2-radius-sm); border:1px solid var(--cwp-v2-sys-border); cursor:pointer;">` : '<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">None</span>'}
              </div>
            </div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Checklist &amp; Photo Proof</span>
            <div style="font-size:12.5px; line-height:1.6;">
              Photo Proof: <strong>${pr.required ? `Required (Before: ${Number(pr.before_min || 0)}, After: ${Number(pr.after_min || 0)})` : 'Optional'}</strong><br>
              Checklist Items (${checklist.length}): ${checklist.length ? `<ul style="margin:6px 0 0 18px; padding:0;">${checklist.map(c => `<li>${escapeHtml(typeof c === 'string' ? c : c.label || JSON.stringify(c))}</li>`).join('')}</ul>` : 'None'}
            </div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">City / Zone Applicability</span>
            <div style="font-size:12.5px;">${cza.all_cities !== false ? 'All Cities &amp; Zones' : escapeHtml(scopeList.join(', ') || 'None specified')}</div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Linked Add-ons &amp; Tags</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${addons.map(a => `<span class="cwp-v2-badge cwp-v2-badge-info">${escapeHtml(a.name || a.addon_code)}</span>`).join('') || '<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">No linked add-ons</span>'}
              ${tags.map(t => `<span class="cwp-v2-badge cwp-v2-badge-primary">${escapeHtml(t.label || t.tag_key)}</span>`).join('')}
            </div>
          </div>
        `;
      }

      if (retireBtn) {
        retireBtn.disabled = svc.status === 'retired';
        retireBtn.textContent = svc.status === 'retired' ? 'Already Retired' : 'Retire Service';
      }
    } catch (err) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="cwp-v2-empty-state-panel" style="border-color:var(--cwp-v2-status-danger);"><div class="cwp-v2-empty-state-title">Failed to Load Service Details</div><div class="cwp-v2-empty-state-desc">${escapeHtml(err.message)}</div></div>`;
      }
    }
  }

  function promptRetireService(svc) {
    if (!svc || svc.status === 'retired') return;
    pendingRetireService = svc;
    const msgEl = document.getElementById('v2SeeProdRetireMsg');
    const reasonEl = document.getElementById('v2SeeProdRetireReason');
    const errEl = document.getElementById('v2SeeProdRetireError');
    if (msgEl) msgEl.textContent = `Retire "${svc.name}" (${svc.service_code})? Retired services cannot be sold in new packages, while existing purchase snapshots and historical jobs remain intact.`;
    if (reasonEl) reasonEl.value = '';
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdServiceConfirm');
  }

  async function executeRetireService() {
    if (!pendingRetireService) return;
    const btn = document.getElementById('v2SeeProdRetireConfirmBtn');
    const errEl = document.getElementById('v2SeeProdRetireError');
    const reason = (document.getElementById('v2SeeProdRetireReason')?.value || '').trim() || 'Retired via Admin Services UI';

    const runner = async () => {
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      await seeFetch(`/api/see/services/${encodeURIComponent(pendingRetireService.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'retired', reason })
      });
      notifyToast(`Service ${pendingRetireService.service_code} retired.`, 'warning');
      pendingRetireService = null;
      if (window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close('v2SeeProdServiceConfirm');
        window.CWP_ADMIN_V2.overlay.close('v2SeeProdServiceDrawer');
      }
      await loadServices();
    };

    try {
      if (window.CWP_ADMIN_V2.api && typeof window.CWP_ADMIN_V2.api.withLoadingButton === 'function') {
        await window.CWP_ADMIN_V2.api.withLoadingButton(btn, runner);
      } else {
        await runner();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Failed to retire service.';
        errEl.style.display = 'block';
      }
    }
  }

  function addChecklistItem() {
    const inp = document.getElementById('v2SeeProdSvcChkInput');
    const errEl = document.getElementById('v2SeeProdSvcChkError');
    const val = (inp?.value || '').trim();
    if (!val) {
      if (errEl) { errEl.textContent = 'Checklist item cannot be empty.'; errEl.style.display = 'block'; }
      return;
    }
    if (checklistItems.some(i => String(typeof i === 'string' ? i : i?.label || '').toLowerCase() === val.toLowerCase())) {
      if (errEl) { errEl.textContent = 'Duplicate checklist item.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    const base = slugifyChecklistId(val, checklistItems.length);
    const usedIds = new Set(checklistItems.map(i => (typeof i === 'object' && i ? i.id : '')).filter(Boolean));
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}_${suffix}`;
      suffix += 1;
    }
    checklistItems.push({ id, key: id, label: val, required: true });
    if (inp) inp.value = '';
    renderChecklistEditor();
  }

  function bindDropzone(dropId, inputId, slot) {
    const dz = document.getElementById(dropId);
    const inp = document.getElementById(inputId);
    if (!dz || !inp) return;
    dz.addEventListener('click', () => inp.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.[0]) handleMediaFileSelected(e.dataTransfer.files[0], slot);
    });
    inp.addEventListener('change', () => {
      if (inp.files?.[0]) handleMediaFileSelected(inp.files[0], slot);
      inp.value = '';
    });
  }

  function bindEvents() {
    document.getElementById('v2SeeProdServiceSearch')?.addEventListener('input', () => { currentPage = 1; render(); });
    document.getElementById('v2SeeProdServiceModelFilter')?.addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('v2SeeProdServiceStatusFilter')?.addEventListener('change', () => { currentPage = 1; render(); });
    document.getElementById('v2SeeProdHideTestBtn')?.addEventListener('click', function () {
      hideTestRecords = !hideTestRecords;
      this.classList.toggle('is-active', hideTestRecords);
      currentPage = 1;
      render();
    });
    document.getElementById('v2SeeProdSvcPagePrev')?.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; render(); } });
    document.getElementById('v2SeeProdSvcPageNext')?.addEventListener('click', () => { currentPage += 1; render(); });

    document.getElementById('v2SeeProdRefreshServicesBtn')?.addEventListener('click', loadServices);
    document.getElementById('v2SeeProdRetryServicesBtn')?.addEventListener('click', loadServices);
    document.getElementById('v2SeeProdResetFiltersBtn')?.addEventListener('click', () => {
      const s = document.getElementById('v2SeeProdServiceSearch');
      const m = document.getElementById('v2SeeProdServiceModelFilter');
      const st = document.getElementById('v2SeeProdServiceStatusFilter');
      if (s) s.value = '';
      if (m) m.value = 'ALL';
      if (st) st.value = 'ALL';
      currentPage = 1;
      render();
    });

    document.getElementById('v2SeeProdNewServiceBtn')?.addEventListener('click', () => openServiceModal(null));
    document.getElementById('v2SeeProdSvcSaveBtn')?.addEventListener('click', saveService);
    document.getElementById('v2SeeProdSvcCategory')?.addEventListener('change', updateDccModalNotice);
    document.getElementById('v2SeeProdSvcCode')?.addEventListener('input', updateDccModalNotice);
    document.getElementById('v2SeeProdSvcModel')?.addEventListener('change', renderModelConfig);
    document.getElementById('v2SeeProdSvcPhotoRequired')?.addEventListener('change', renderPhotoProofVisibility);
    document.getElementById('v2SeeProdSvcAllCities')?.addEventListener('change', renderZoneChips);

    bindDropzone('v2SeeProdSvcMediaSqDropzone', 'v2SeeProdSvcMediaSqInput', 'square_1_1');
    bindDropzone('v2SeeProdSvcMediaRectDropzone', 'v2SeeProdSvcMediaRectInput', 'rectangle_4_3');

    document.getElementById('v2SeeProdServiceModal')?.addEventListener('click', (e) => {
      const repBtn = e.target.closest('[data-see-svc-replace]');
      if (repBtn) {
        const slot = repBtn.getAttribute('data-see-svc-replace');
        document.getElementById(slot === 'square_1_1' ? 'v2SeeProdSvcMediaSqInput' : 'v2SeeProdSvcMediaRectInput')?.click();
        return;
      }
      const remBtn = e.target.closest('[data-see-svc-remove]');
      if (remBtn) {
        handleMediaRemove(remBtn.getAttribute('data-see-svc-remove'));
        return;
      }
      const enlImg = e.target.closest('[data-see-svc-enlarge]');
      if (enlImg) {
        const slot = enlImg.getAttribute('data-see-svc-enlarge');
        const st = mediaSlots[slot];
        const src = st.pendingFile ? st.pendingFile.dataUrl : st.url;
        if (src) openLightbox(src, slot === 'square_1_1' ? 'Square Media (1:1)' : 'Rectangular Media (4:3)', st.filename);
      }
    });

    document.getElementById('v2SeeProdServiceDrawerBody')?.addEventListener('click', (e) => {
      const img = e.target.closest('[data-see-drawer-enlarge]');
      if (img) openLightbox(img.getAttribute('data-see-drawer-enlarge'), img.getAttribute('data-see-drawer-title'), '');
    });

    document.getElementById('v2SeeProdSvcZoneChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-see-zone]');
      if (!chip) return;
      const z = chip.getAttribute('data-see-zone');
      if (selectedZones.has(z)) selectedZones.delete(z);
      else selectedZones.add(z);
      chip.classList.toggle('is-active', selectedZones.has(z));
    });

    document.getElementById('v2SeeProdSvcTagChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-see-tag-id]');
      if (!chip) return;
      const id = chip.getAttribute('data-see-tag-id');
      if (initialTagIds.has(id)) return;
      if (selectedTagIds.has(id)) selectedTagIds.delete(id);
      else selectedTagIds.add(id);
      chip.classList.toggle('is-active', selectedTagIds.has(id));
    });

    document.getElementById('v2SeeProdSvcChkAddBtn')?.addEventListener('click', addChecklistItem);
    document.getElementById('v2SeeProdSvcChkInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
    });
    document.getElementById('v2SeeProdSvcChkList')?.addEventListener('click', (e) => {
      const upBtn = e.target.closest('[data-chk-up]');
      if (upBtn) {
        const idx = Number(upBtn.getAttribute('data-chk-up'));
        if (idx > 0) {
          [checklistItems[idx - 1], checklistItems[idx]] = [checklistItems[idx], checklistItems[idx - 1]];
          renderChecklistEditor();
        }
        return;
      }
      const downBtn = e.target.closest('[data-chk-down]');
      if (downBtn) {
        const idx = Number(downBtn.getAttribute('data-chk-down'));
        if (idx < checklistItems.length - 1) {
          [checklistItems[idx + 1], checklistItems[idx]] = [checklistItems[idx], checklistItems[idx + 1]];
          renderChecklistEditor();
        }
        return;
      }
      const delBtn = e.target.closest('[data-chk-del]');
      if (delBtn) {
        const idx = Number(delBtn.getAttribute('data-chk-del'));
        checklistItems.splice(idx, 1);
        renderChecklistEditor();
      }
    });
    document.getElementById('v2SeeProdSvcChkList')?.addEventListener('change', (e) => {
      const reqChk = e.target.closest('[data-chk-req]');
      if (reqChk) {
        const idx = Number(reqChk.getAttribute('data-chk-req'));
        if (checklistItems[idx] && typeof checklistItems[idx] === 'object') {
          checklistItems[idx] = { ...checklistItems[idx], required: !!reqChk.checked };
        }
        return;
      }
      const inp = e.target.closest('.v2-see-chk-edit');
      if (!inp) return;
      const idx = Number(inp.getAttribute('data-chk-idx'));
      const val = inp.value.trim();
      const existing = checklistItems[idx];
      if (!val) {
        inp.value = (existing && typeof existing === 'object' ? existing.label : existing) || '';
        return;
      }
      if (existing && typeof existing === 'object') {
        checklistItems[idx] = { ...existing, label: val };
      } else {
        const id = slugifyChecklistId(val, idx);
        checklistItems[idx] = { id, key: id, label: val, required: true };
      }
    });

    document.getElementById('v2SeeProdDrawerRetireBtn')?.addEventListener('click', () => {
      if (inspectingService) promptRetireService(inspectingService);
    });
    document.getElementById('v2SeeProdRetireConfirmBtn')?.addEventListener('click', executeRetireService);

    document.getElementById('v2SeeProdServicesTableBody')?.addEventListener('click', (e) => {
      const detBtn = e.target.closest('[data-see-prod-details]');
      if (detBtn) return openServiceDetails(detBtn.getAttribute('data-see-prod-details'));

      const editBtn = e.target.closest('[data-see-prod-edit]');
      if (editBtn) {
        const svc = services.find(s => String(s.id) === editBtn.getAttribute('data-see-prod-edit'));
        if (svc) openServiceModal(svc);
        return;
      }

      const retBtn = e.target.closest('[data-see-prod-retire]');
      if (retBtn) {
        const svc = services.find(s => String(s.id) === retBtn.getAttribute('data-see-prod-retire'));
        if (svc) promptRetireService(svc);
      }
    });

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e && e.detail && e.detail.tab === 'seeServices') {
        loadServices();
      }
    });
  }

  function init() {
    if (!initialized) {
      initialized = true;
      bindEvents();
    }
    const activeTab = window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.getActiveTab === 'function'
      ? window.CWP_ADMIN_V2.shell.getActiveTab()
      : '';
    if (activeTab === 'seeServices') {
      loadServices();
    }
  }

  window.CWP_ADMIN_V2.seeServices = {
    init,
    loadServices
  };
})(window);
