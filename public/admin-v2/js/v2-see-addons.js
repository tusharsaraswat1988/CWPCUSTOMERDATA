/**
 * CWP Admin V2 — SEE Add-ons Module (Production)
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.seeAddons
 * Connected to canonical /api/see/addons & /api/see/media/upload endpoints. Zero mock data.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  let initialized = false;
  let addons = [];
  let services = [];
  let loading = false;
  let loadError = null;
  let editingAddon = null;
  let inspectingAddon = null;
  let pendingRetireAddon = null;

  let hideTestAddons = false;
  let hideTestCompatServices = false;

  let checklistItems = [];
  let selectedServiceIds = new Set();
  let mediaSlots = {
    square_1_1: { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' },
    rectangle_4_3: { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' }
  };

  const MODE_DESCRIPTIONS = {
    per_main_service: 'Automatically included on every scheduled occurrence of the main service.',
    during_main_service: 'Executed by the main job technician; blocks main job completion until done.',
    separate_job: 'Creates a standalone job with its own staff assignment and proof.',
    customer_redemption: 'Customer redeems on-demand from their entitlement balance.',
    scheduled_independently: 'Scheduled on its own recurrence calendar independent of the main service.'
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
    try { data = rawText ? JSON.parse(rawText) : {}; } catch (e) { data = { success: false, error: rawText || `HTTP ${res.status}` }; }
    if (res.status === 401 || res.status === 403 || data.unauthorized === true) {
      const err = new Error(data.error || 'Admin session expired.');
      err.unauthorized = true;
      throw err;
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data;
  }

  function isDccService(svc) {
    if (!svc) return false;
    const category = String(svc.service_category_id || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const code = String(svc.service_code || '').trim().toUpperCase();
    const name = String(svc.name || '').trim().toLowerCase().replace(/\s*\(dcc\)$/, '');
    const config = svc.execution_config && typeof svc.execution_config === 'object' ? svc.execution_config : {};
    return ['daily_car_cleaning', 'daily_clean', 'dcc'].includes(category) || code === 'DCC_DAILY' || code.startsWith('SVC-DCC') || name === 'daily car cleaning' || config.dcc_isolated === true;
  }

  function isTestRecord(rec) {
    const code = String(rec?.addon_code || rec?.service_code || '').toUpperCase();
    const name = String(rec?.name || '').toUpperCase();
    return code.startsWith('TEST_') || code.startsWith('S03_') || code.startsWith('S07_') ||
      code.startsWith('SEE03') || code.startsWith('SEE07') ||
      name.includes('SEE03') || name.includes('SEE07') || name.includes('TEST ENGINE') || name.includes('TEST CERAMIC');
  }

  function statusBadge(status) {
    const map = { active: 'cwp-v2-badge-success', draft: 'cwp-v2-badge-info', retired: 'cwp-v2-badge-neutral' };
    return `<span class="cwp-v2-badge ${map[status] || 'cwp-v2-badge-neutral'}">${escapeHtml(status || 'draft')}</span>`;
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
    const el = document.getElementById('v2BadgeSeeAddons');
    if (el) el.textContent = addons.length ? String(addons.filter(a => a.status === 'active' && !isTestRecord(a)).length) : '—';
  }

  function render() {
    const loadingEl = document.getElementById('v2SeeProdAddonsLoading');
    const emptyEl = document.getElementById('v2SeeProdAddonsEmpty');
    const errorEl = document.getElementById('v2SeeProdAddonsError');
    const errorMsgEl = document.getElementById('v2SeeProdAddonsErrorMsg');
    const wrapEl = document.getElementById('v2SeeProdAddonsTableWrap');
    const tbody = document.getElementById('v2SeeProdAddonsTableBody');
    if (!tbody) return;

    if (loading) {
      if (loadingEl) loadingEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (wrapEl) wrapEl.style.display = 'none';
      return;
    }
    if (loadError) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsgEl) errorMsgEl.textContent = loadError;
      if (wrapEl) wrapEl.style.display = 'none';
      return;
    }

    const q = (document.getElementById('v2SeeProdAddonSearch')?.value || '').trim().toLowerCase();
    const modeF = document.getElementById('v2SeeProdAddonModeFilter')?.value || 'ALL';
    const statusF = document.getElementById('v2SeeProdAddonStatusFilter')?.value || 'ALL';

    const filtered = addons.filter(a => {
      if (hideTestAddons && isTestRecord(a)) return false;
      if (q && !`${a.addon_code || ''} ${a.name || ''}`.toLowerCase().includes(q)) return false;
      if (modeF !== 'ALL' && a.execution_mode !== modeF) return false;
      if (statusF !== 'ALL' && a.status !== statusF) return false;
      return true;
    });

    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (wrapEl) wrapEl.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (wrapEl) wrapEl.style.display = 'block';

    const svcMap = new Map(services.map(s => [String(s.id), s.name || s.service_code]));

    tbody.innerHTML = filtered.map(a => {
      const retired = a.status === 'retired';
      const compatNames = (Array.isArray(a.applicable_service_ids) ? a.applicable_service_ids : [])
        .map(id => services.find(s => String(s.id) === String(id) && !isDccService(s)))
        .filter(Boolean).map(s => svcMap.get(String(s.id))).filter(Boolean);
      return `
        <tr class="${retired ? 'is-disabled' : ''}">
          <td><span class="cwp-v2-cell-mono">${escapeHtml(a.addon_code)}</span></td>
          <td><strong>${escapeHtml(a.name)}</strong>${a.tagline ? `<div style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted);">${escapeHtml(a.tagline)}</div>` : ''}</td>
          <td><span class="cwp-v2-badge cwp-v2-badge-info">${escapeHtml(a.execution_mode)}</span></td>
          <td class="is-numeric">&#8377;${escapeHtml(Number(a.default_price || 0).toFixed(0))} <span style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted);">(${escapeHtml(a.pricing_model || 'fixed')})</span></td>
          <td>${escapeHtml(a.expected_duration_minutes || 15)}m</td>
          <td>${compatNames.length ? escapeHtml(compatNames.join(', ')) : '<span style="color:var(--cwp-v2-sys-on-surface-muted);">None</span>'}</td>
          <td>v${escapeHtml(a.version || 1)}</td>
          <td>${statusBadge(a.status)}</td>
          <td class="is-sticky-action">
            <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-addon-details="${escapeHtml(a.id)}">Details</button>
            <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-addon-edit="${escapeHtml(a.id)}" ${retired ? 'disabled' : ''}>Edit</button>
            ${!retired ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-danger cwp-v2-btn-sm" data-addon-retire="${escapeHtml(a.id)}">Retire</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadAddons() {
    loading = true;
    loadError = null;
    render();
    try {
      const [addRes, svcRes] = await Promise.all([
        seeFetch('/api/see/addons'),
        seeFetch('/api/see/services?includeRetired=false&limit=200&offset=0').catch(() => ({ services: [] }))
      ]);
      addons = Array.isArray(addRes.addons) ? addRes.addons : [];
      services = Array.isArray(svcRes.services) ? svcRes.services : [];
      updateSidebarBadge();
    } catch (err) {
      loadError = err.message || 'Failed to load add-ons.';
    } finally {
      loading = false;
      render();
    }
  }

  function renderCompatChips() {
    const el = document.getElementById('v2SeeProdAddonCompatChips');
    if (!el) return;
    const list = services.filter(s => {
      if (isDccService(s)) return false;
      const id = String(s.id);
      if (selectedServiceIds.has(id)) return true;
      if (hideTestCompatServices && isTestRecord(s)) return false;
      return true;
    });
    if (!list.length) {
      el.innerHTML = `<span style="font-size:12px; color:var(--cwp-v2-sys-on-surface-muted);">No services available.</span>`;
      return;
    }
    el.innerHTML = list.map(s => {
      const isTest = isTestRecord(s);
      const id = String(s.id);
      const active = selectedServiceIds.has(id);
      const label = isTest ? `${s.name} (${s.service_code})` : s.name;
      return `<button type="button" class="cwp-v2-filter-chip ${active ? 'is-active' : ''}" data-addon-compat-svc="${escapeHtml(id)}" title="${escapeHtml(s.service_code)}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  function renderChecklist() {
    const listEl = document.getElementById('v2SeeProdAddonChkList');
    if (!listEl) return;
    if (!checklistItems.length) {
      listEl.innerHTML = `<div style="font-size:11.5px; color:var(--cwp-v2-sys-on-surface-muted); padding:4px 0;">No checklist items.</div>`;
      return;
    }
    listEl.innerHTML = checklistItems.map((item, idx) => `
      <div style="display:flex; align-items:center; gap:6px; padding:4px 6px; border:1px solid var(--cwp-v2-sys-border-subtle); border-radius:var(--cwp-v2-radius-sm); background:var(--cwp-v2-sys-surface);">
        <span style="font-size:11px; color:var(--cwp-v2-sys-on-surface-muted); min-width:16px;">${idx + 1}.</span>
        <input type="text" class="cwp-v2-input v2-see-addon-chk-edit" data-addon-chk-idx="${idx}" value="${escapeHtml(item)}" style="font-size:12px; height:24px;">
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-subtle cwp-v2-btn-sm" data-addon-chk-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up"><span class="material-symbols-outlined" style="font-size:14px;">arrow_upward</span></button>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-subtle cwp-v2-btn-sm" data-addon-chk-down="${idx}" ${idx === checklistItems.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down"><span class="material-symbols-outlined" style="font-size:14px;">arrow_downward</span></button>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-icon cwp-v2-btn-icon-danger cwp-v2-btn-sm" data-addon-chk-del="${idx}" title="Remove" aria-label="Remove"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
      </div>
    `).join('');
  }

  function renderModeDetails() {
    const mode = document.getElementById('v2SeeProdAddonMode')?.value || 'during_main_service';
    const descEl = document.getElementById('v2SeeProdAddonModeDesc');
    const valWrap = document.getElementById('v2SeeProdAddonValidityWrap');
    if (descEl) descEl.textContent = MODE_DESCRIPTIONS[mode] || '';
    if (valWrap) valWrap.style.display = (mode === 'customer_redemption' || mode === 'scheduled_independently') ? 'flex' : 'none';
  }

  function readImageFile(file, slot) {
    return new Promise((resolve, reject) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Unsupported format. Use JPG, PNG, or WebP.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('File size exceeds 5 MB.'));
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const r = img.naturalWidth / Math.max(1, img.naturalHeight);
          if (slot === 'square_1_1' && Math.abs(r - 1.0) > 0.08) return reject(new Error(`Square slot requires ~1:1 ratio (${img.naturalWidth}×${img.naturalHeight}).`));
          if (slot === 'rectangle_4_3' && Math.abs(r - (4 / 3)) > 0.15) return reject(new Error(`Rectangle slot requires ~4:3 ratio (${img.naturalWidth}×${img.naturalHeight}).`));
          resolve({ dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight, filename: file.name });
        };
        img.onerror = () => reject(new Error('Invalid image file.'));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderMediaSlot(slot) {
    const isSq = slot === 'square_1_1';
    const state = mediaSlots[slot];
    const errEl = document.getElementById(isSq ? 'v2SeeProdAddonMediaSqError' : 'v2SeeProdAddonMediaRectError');
    const prevEl = document.getElementById(isSq ? 'v2SeeProdAddonMediaSqPreview' : 'v2SeeProdAddonMediaRectPreview');
    if (errEl) { errEl.textContent = state.error || ''; errEl.style.display = state.error ? 'block' : 'none'; }
    if (!prevEl) return;
    if (state.uploading) { prevEl.innerHTML = `<span class="cwp-v2-btn-spinner" style="border-color:var(--cwp-v2-sys-primary); border-top-color:transparent;"></span><span style="font-size:12px;">Uploading...</span>`; return; }
    const src = state.pendingFile ? state.pendingFile.dataUrl : state.url;
    if (!src) { prevEl.innerHTML = `<span style="font-size:11.5px; color:var(--cwp-v2-sys-on-surface-muted);">No image uploaded.</span>`; return; }
    const boxStyle = isSq ? 'width:56px; height:56px; object-fit:cover; border-radius:4px; cursor:pointer;' : 'width:76px; height:57px; object-fit:cover; border-radius:4px; cursor:pointer;';
    const infoText = state.filename || (state.width && state.height ? `${state.width}×${state.height}` : 'Uploaded asset');
    prevEl.innerHTML = `
      <img src="${escapeHtml(src)}" alt="Preview" data-addon-media-enlarge="${slot}" title="Click to enlarge" style="${boxStyle} border:1px solid var(--cwp-v2-sys-border);">
      <div style="flex:1; min-width:0; font-size:11.5px;">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(infoText)}</div>
        <div style="color:var(--cwp-v2-sys-on-surface-muted);">${state.pendingFile ? 'Ready to upload on save' : 'Saved on server'}</div>
      </div>
      <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-addon-media-rep="${slot}">Replace</button>
      <button type="button" class="cwp-v2-btn cwp-v2-btn-danger cwp-v2-btn-sm" data-addon-media-rem="${slot}">Remove</button>
    `;
  }

  async function handleAddonMediaFile(file, slot) {
    if (!file) return;
    const state = mediaSlots[slot];
    state.error = '';
    try {
      const parsed = await readImageFile(file, slot);
      state.width = parsed.width; state.height = parsed.height; state.filename = parsed.filename;
      if (editingAddon && editingAddon.id) {
        state.uploading = true; renderMediaSlot(slot);
        const res = await seeFetch('/api/see/media/upload', {
          method: 'POST',
          body: JSON.stringify({
            entityType: 'addon', entityId: editingAddon.id, mediaSlot: slot,
            base64: parsed.dataUrl, mimeType: file.type, altText: editingAddon.name,
            width: parsed.width, height: parsed.height
          })
        });
        state.assetId = res.media?.id || null;
        state.url = res.media?.storage_url || '';
        state.pendingFile = null;
        notifyToast('Add-on image uploaded.', 'success');
      } else {
        state.pendingFile = { dataUrl: parsed.dataUrl, mimeType: file.type, width: parsed.width, height: parsed.height, filename: parsed.filename };
      }
    } catch (err) {
      state.error = err.message || 'Upload failed.';
    } finally {
      state.uploading = false; renderMediaSlot(slot);
    }
  }

  async function openAddonModal(addon) {
    editingAddon = addon || null;
    document.getElementById('v2SeeProdAddonFormError').style.display = 'none';
    document.getElementById('v2SeeProdAddonChkError').style.display = 'none';
    let detail = addon;
    if (addon && addon.id) {
      try { const r = await seeFetch(`/api/see/addons/${encodeURIComponent(addon.id)}`); if (r.addon) detail = r.addon; } catch (e) {}
    }

    document.getElementById('v2SeeProdAddonModalTitle').textContent = detail ? `Edit Add-on • ${detail.addon_code}` : 'Create Add-on';
    const codeInp = document.getElementById('v2SeeProdAddonCode');
    codeInp.value = detail ? detail.addon_code : '';
    codeInp.disabled = !!detail;
    document.getElementById('v2SeeProdAddonName').value = detail ? detail.name : '';
    document.getElementById('v2SeeProdAddonTagline').value = detail ? (detail.tagline || '') : '';
    document.getElementById('v2SeeProdAddonDetails').value = detail ? (detail.details || '') : '';
    document.getElementById('v2SeeProdAddonStatus').value = detail ? detail.status : 'draft';
    document.getElementById('v2SeeProdAddonPricingModel').value = detail ? (detail.pricing_model || 'fixed') : 'fixed';
    document.getElementById('v2SeeProdAddonPrice').value = detail ? Number(detail.default_price || 0) : 149;
    document.getElementById('v2SeeProdAddonDuration').value = detail ? (detail.expected_duration_minutes || 15) : 15;
    document.getElementById('v2SeeProdAddonQty').value = detail ? (detail.default_quantity || 1) : 1;
    document.getElementById('v2SeeProdAddonMode').value = detail ? (detail.execution_mode || 'during_main_service') : 'during_main_service';
    document.getElementById('v2SeeProdAddonValidity').value = detail && detail.validity_days ? detail.validity_days : 30;
    document.getElementById('v2SeeProdAddonOptional').checked = detail ? detail.is_optional !== false : true;
    document.getElementById('v2SeeProdAddonChkInput').value = '';

    const pr = detail?.proof_requirements || {};
    document.getElementById('v2SeeProdAddonPhotoReq').checked = !!pr.required;
    document.getElementById('v2SeeProdAddonPhotoCounts').style.display = pr.required ? 'grid' : 'none';
    document.getElementById('v2SeeProdAddonBeforeMin').value = pr.required ? Number(pr.before_min || 1) : 1;
    document.getElementById('v2SeeProdAddonAfterMin').value = pr.required ? Number(pr.after_min || 1) : 1;

    checklistItems = Array.isArray(detail?.checklist_requirements) ? detail.checklist_requirements.map(x => typeof x === 'string' ? x : x?.label || '').filter(Boolean) : [];
    const availableServiceIds = new Set(services.filter(s => !isDccService(s)).map(s => String(s.id)));
    selectedServiceIds = new Set((Array.isArray(detail?.applicable_service_ids) ? detail.applicable_service_ids : []).map(String).filter(id => availableServiceIds.has(id)));

    const mList = Array.isArray(detail?.media) ? detail.media : [];
    const sq = mList.find(m => m.media_slot === 'square_1_1');
    const rc = mList.find(m => m.media_slot === 'rectangle_4_3');
    mediaSlots = {
      square_1_1: { assetId: sq?.id || null, url: sq?.storage_url || '', filename: sq ? 'Square (1:1)' : '', width: sq?.width || null, height: sq?.height || null, pendingFile: null, uploading: false, error: '' },
      rectangle_4_3: { assetId: rc?.id || null, url: rc?.storage_url || '', filename: rc ? 'Rectangle (4:3)' : '', width: rc?.width || null, height: rc?.height || null, pendingFile: null, uploading: false, error: '' }
    };

    renderModeDetails();
    renderCompatChips();
    renderChecklist();
    renderMediaSlot('square_1_1');
    renderMediaSlot('rectangle_4_3');
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdAddonModal');
  }

  async function saveAddon() {
    const btn = document.getElementById('v2SeeProdAddonSaveBtn');
    const errEl = document.getElementById('v2SeeProdAddonFormError');
    const showErr = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };

    const addonCode = (document.getElementById('v2SeeProdAddonCode').value || '').trim().toUpperCase();
    const name = (document.getElementById('v2SeeProdAddonName').value || '').trim();
    const defaultPrice = Number(document.getElementById('v2SeeProdAddonPrice').value);
    const expectedDurationMinutes = parseInt(document.getElementById('v2SeeProdAddonDuration').value, 10);
    if (!addonCode || !name) return showErr('Add-on Code and Name are required.');
    if (isNaN(defaultPrice) || defaultPrice < 0) return showErr('Default Price must be 0 or greater.');
    if (!expectedDurationMinutes || expectedDurationMinutes < 1) return showErr('Duration must be at least 1 minute.');

    const executionMode = document.getElementById('v2SeeProdAddonMode').value;
    const photoReq = document.getElementById('v2SeeProdAddonPhotoReq').checked;
    const beforeMin = parseInt(document.getElementById('v2SeeProdAddonBeforeMin').value || '0', 10);
    const afterMin = parseInt(document.getElementById('v2SeeProdAddonAfterMin').value || '0', 10);
    if (photoReq && (isNaN(beforeMin) || beforeMin < 0 || isNaN(afterMin) || afterMin < 0 || (beforeMin + afterMin) < 1)) {
      return showErr('When Photo Proof is required, Before Min + After Min must be at least 1.');
    }

    const payload = {
      name,
      tagline: document.getElementById('v2SeeProdAddonTagline').value.trim() || null,
      details: document.getElementById('v2SeeProdAddonDetails').value.trim() || null,
      pricingModel: document.getElementById('v2SeeProdAddonPricingModel').value,
      defaultPrice,
      expectedDurationMinutes,
      defaultQuantity: parseInt(document.getElementById('v2SeeProdAddonQty').value || '1', 10) || 1,
      executionMode,
      validityDays: (executionMode === 'customer_redemption' || executionMode === 'scheduled_independently')
        ? (parseInt(document.getElementById('v2SeeProdAddonValidity').value || '30', 10) || 30)
        : null,
      isOptional: document.getElementById('v2SeeProdAddonOptional').checked,
      status: document.getElementById('v2SeeProdAddonStatus').value,
      checklistRequirements: checklistItems,
      proofRequirements: {
        required: photoReq,
        before_min: photoReq ? beforeMin : 0,
        after_min: photoReq ? afterMin : 0
      },
      applicableServiceIds: Array.from(selectedServiceIds).filter(id => services.some(s => String(s.id) === id && !isDccService(s)))
    };

    const runner = async () => {
      errEl.style.display = 'none';
      let saved = null;
      if (editingAddon) {
        const res = await seeFetch(`/api/see/addons/${encodeURIComponent(editingAddon.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        saved = res.addon;
      } else {
        payload.addonCode = addonCode;
        const res = await seeFetch('/api/see/addons', { method: 'POST', body: JSON.stringify(payload) });
        saved = res.addon;
      }
      if (saved && saved.id) {
        for (const slot of ['square_1_1', 'rectangle_4_3']) {
          const st = mediaSlots[slot];
          if (st.pendingFile) {
            await seeFetch('/api/see/media/upload', {
              method: 'POST',
              body: JSON.stringify({
                entityType: 'addon', entityId: saved.id, mediaSlot: slot,
                base64: st.pendingFile.dataUrl, mimeType: st.pendingFile.mimeType,
                altText: name, width: st.pendingFile.width, height: st.pendingFile.height
              })
            });
          }
        }
      }
      notifyToast(editingAddon ? `Add-on ${editingAddon.addon_code} updated.` : `Add-on ${addonCode} created.`, 'success');
      if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.close('v2SeeProdAddonModal');
      await loadAddons();
    };

    try {
      if (window.CWP_ADMIN_V2.api?.withLoadingButton) await window.CWP_ADMIN_V2.api.withLoadingButton(btn, runner);
      else await runner();
    } catch (err) {
      showErr(err.message || 'Failed to save add-on.');
    }
  }

  async function openAddonDetails(addonId) {
    const bodyEl = document.getElementById('v2SeeProdAddonDrawerBody');
    const titleEl = document.getElementById('v2SeeProdAddonDrawerTitle');
    const subEl = document.getElementById('v2SeeProdAddonDrawerSub');
    const retireBtn = document.getElementById('v2SeeProdAddonDrawerRetireBtn');
    if (bodyEl) bodyEl.innerHTML = `<div class="cwp-v2-skeleton-bar" style="height:80px; width:100%;"></div>`;
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdAddonDrawer');

    try {
      const res = await seeFetch(`/api/see/addons/${encodeURIComponent(addonId)}`);
      const a = res.addon;
      inspectingAddon = a;
      if (titleEl) titleEl.textContent = `${a.name} (${a.addon_code})`;
      if (subEl) subEl.textContent = `Version ${a.version || 1} • ${a.status}`;
      const svcMap = new Map(services.map(s => [String(s.id), s.name || s.service_code]));
      const compat = (a.applicable_service_ids || []).map(id => svcMap.get(String(id))).filter(Boolean);
      const sq = (a.media || []).find(m => m.media_slot === 'square_1_1');
      const rc = (a.media || []).find(m => m.media_slot === 'rectangle_4_3');

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Configuration</span>
            <div style="font-size:12.5px; line-height:1.6;">
              Execution Mode: <code>${escapeHtml(a.execution_mode)}</code><br>
              Pricing: <strong>&#8377;${escapeHtml(Number(a.default_price || 0).toFixed(0))}</strong> (${escapeHtml(a.pricing_model || 'fixed')}) &bull; Duration: <strong>${escapeHtml(a.expected_duration_minutes || 15)} mins</strong><br>
              ${a.tagline ? `Tagline: <strong>${escapeHtml(a.tagline)}</strong><br>` : ''}
              ${a.details ? `<div style="margin-top:4px; color:var(--cwp-v2-sys-on-surface-variant);">${escapeHtml(a.details)}</div>` : ''}
            </div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Compatible Services</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">${compat.map(n => `<span class="cwp-v2-badge cwp-v2-badge-info">${escapeHtml(n)}</span>`).join('') || 'None'}</div>
          </div>
          <div class="cwp-v2-expanded-card">
            <span class="cwp-v2-expanded-card-title">Add-on Media</span>
            <div style="display:flex; gap:14px; align-items:center;">
              ${sq ? `<img src="${escapeHtml(sq.storage_url)}" alt="1:1" data-addon-drawer-enlarge="${escapeHtml(sq.storage_url)}" data-addon-drawer-title="${escapeHtml(a.name)} (1:1)" style="width:56px; height:56px; object-fit:cover; border-radius:4px; border:1px solid var(--cwp-v2-sys-border); cursor:pointer;">` : '<span style="font-size:12px;">No 1:1</span>'}
              ${rc ? `<img src="${escapeHtml(rc.storage_url)}" alt="4:3" data-addon-drawer-enlarge="${escapeHtml(rc.storage_url)}" data-addon-drawer-title="${escapeHtml(a.name)} (4:3)" style="width:76px; height:57px; object-fit:cover; border-radius:4px; border:1px solid var(--cwp-v2-sys-border); cursor:pointer;">` : '<span style="font-size:12px;">No 4:3</span>'}
            </div>
          </div>
        `;
      }
      if (retireBtn) retireBtn.disabled = a.status === 'retired';
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = `<div class="cwp-v2-empty-state-panel">${escapeHtml(err.message)}</div>`;
    }
  }

  function promptRetireAddon(a) {
    if (!a || a.status === 'retired') return;
    pendingRetireAddon = a;
    document.getElementById('v2SeeProdAddonRetireError').style.display = 'none';
    document.getElementById('v2SeeProdAddonRetireMsg').textContent = `Retire add-on "${a.name}" (${a.addon_code})?`;
    if (window.CWP_ADMIN_V2.overlay) window.CWP_ADMIN_V2.overlay.open('v2SeeProdAddonConfirm');
  }

  async function executeRetireAddon() {
    if (!pendingRetireAddon) return;
    const errEl = document.getElementById('v2SeeProdAddonRetireError');
    try {
      await seeFetch(`/api/see/addons/${encodeURIComponent(pendingRetireAddon.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'retired' })
      });
      notifyToast(`Add-on ${pendingRetireAddon.addon_code} retired.`, 'warning');
      pendingRetireAddon = null;
      if (window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close('v2SeeProdAddonConfirm');
        window.CWP_ADMIN_V2.overlay.close('v2SeeProdAddonDrawer');
      }
      await loadAddons();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    }
  }

  function addChecklistItem() {
    const inp = document.getElementById('v2SeeProdAddonChkInput');
    const errEl = document.getElementById('v2SeeProdAddonChkError');
    const val = (inp?.value || '').trim();
    if (!val) {
      if (errEl) { errEl.textContent = 'Checklist item cannot be empty.'; errEl.style.display = 'block'; }
      return;
    }
    if (checklistItems.some(i => i.toLowerCase() === val.toLowerCase())) {
      if (errEl) { errEl.textContent = 'Duplicate checklist item.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    checklistItems.push(val);
    if (inp) inp.value = '';
    renderChecklist();
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
      if (e.dataTransfer?.files?.[0]) handleAddonMediaFile(e.dataTransfer.files[0], slot);
    });
    inp.addEventListener('change', () => {
      if (inp.files?.[0]) handleAddonMediaFile(inp.files[0], slot);
      inp.value = '';
    });
  }

  function bindEvents() {
    document.getElementById('v2SeeProdAddonSearch')?.addEventListener('input', render);
    document.getElementById('v2SeeProdAddonModeFilter')?.addEventListener('change', render);
    document.getElementById('v2SeeProdAddonStatusFilter')?.addEventListener('change', render);
    document.getElementById('v2SeeProdAddonHideTestBtn')?.addEventListener('click', function () {
      hideTestAddons = !hideTestAddons;
      this.classList.toggle('is-active', hideTestAddons);
      render();
    });
    document.getElementById('v2SeeProdAddonCompatHideTestBtn')?.addEventListener('click', function () {
      hideTestCompatServices = !hideTestCompatServices;
      this.classList.toggle('is-active', hideTestCompatServices);
      renderCompatChips();
    });

    document.getElementById('v2SeeProdRefreshAddonsBtn')?.addEventListener('click', loadAddons);
    document.getElementById('v2SeeProdRetryAddonsBtn')?.addEventListener('click', loadAddons);
    document.getElementById('v2SeeProdAddonResetFiltersBtn')?.addEventListener('click', () => {
      document.getElementById('v2SeeProdAddonSearch').value = '';
      document.getElementById('v2SeeProdAddonModeFilter').value = 'ALL';
      document.getElementById('v2SeeProdAddonStatusFilter').value = 'ALL';
      render();
    });
    document.getElementById('v2SeeProdNewAddonBtn')?.addEventListener('click', () => openAddonModal(null));
    document.getElementById('v2SeeProdAddonSaveBtn')?.addEventListener('click', saveAddon);
    document.getElementById('v2SeeProdAddonMode')?.addEventListener('change', renderModeDetails);
    document.getElementById('v2SeeProdAddonPhotoReq')?.addEventListener('change', function () {
      document.getElementById('v2SeeProdAddonPhotoCounts').style.display = this.checked ? 'grid' : 'none';
    });
    document.getElementById('v2SeeProdAddonCompatChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-addon-compat-svc]');
      if (!chip || chip.hasAttribute('disabled')) return;
      const id = chip.getAttribute('data-addon-compat-svc');
      if (selectedServiceIds.has(id)) selectedServiceIds.delete(id);
      else selectedServiceIds.add(id);
      chip.classList.toggle('is-active', selectedServiceIds.has(id));
    });

    document.getElementById('v2SeeProdAddonChkAddBtn')?.addEventListener('click', addChecklistItem);
    document.getElementById('v2SeeProdAddonChkInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
    });
    document.getElementById('v2SeeProdAddonChkList')?.addEventListener('click', (e) => {
      const up = e.target.closest('[data-addon-chk-up]');
      if (up) {
        const i = Number(up.getAttribute('data-addon-chk-up'));
        if (i > 0) { [checklistItems[i - 1], checklistItems[i]] = [checklistItems[i], checklistItems[i - 1]]; renderChecklist(); }
        return;
      }
      const down = e.target.closest('[data-addon-chk-down]');
      if (down) {
        const i = Number(down.getAttribute('data-addon-chk-down'));
        if (i < checklistItems.length - 1) { [checklistItems[i + 1], checklistItems[i]] = [checklistItems[i], checklistItems[i + 1]]; renderChecklist(); }
        return;
      }
      const del = e.target.closest('[data-addon-chk-del]');
      if (del) { checklistItems.splice(Number(del.getAttribute('data-addon-chk-del')), 1); renderChecklist(); }
    });
    document.getElementById('v2SeeProdAddonChkList')?.addEventListener('change', (e) => {
      const inp = e.target.closest('.v2-see-addon-chk-edit');
      if (!inp) return;
      const idx = Number(inp.getAttribute('data-addon-chk-idx'));
      const val = inp.value.trim();
      if (!val) { inp.value = checklistItems[idx] || ''; return; }
      checklistItems[idx] = val;
    });

    bindDropzone('v2SeeProdAddonMediaSqDropzone', 'v2SeeProdAddonMediaSqInput', 'square_1_1');
    bindDropzone('v2SeeProdAddonMediaRectDropzone', 'v2SeeProdAddonMediaRectInput', 'rectangle_4_3');

    document.getElementById('v2SeeProdAddonModal')?.addEventListener('click', async (e) => {
      const rep = e.target.closest('[data-addon-media-rep]');
      if (rep) {
        const slot = rep.getAttribute('data-addon-media-rep');
        document.getElementById(slot === 'square_1_1' ? 'v2SeeProdAddonMediaSqInput' : 'v2SeeProdAddonMediaRectInput')?.click();
        return;
      }
      const rem = e.target.closest('[data-addon-media-rem]');
      if (rem) {
        const slot = rem.getAttribute('data-addon-media-rem');
        const st = mediaSlots[slot];
        if (st.assetId) {
          try { await seeFetch(`/api/see/media/${encodeURIComponent(st.assetId)}`, { method: 'DELETE' }); } catch (err) {}
        }
        mediaSlots[slot] = { assetId: null, url: '', filename: '', width: null, height: null, pendingFile: null, uploading: false, error: '' };
        renderMediaSlot(slot);
        return;
      }
      const enl = e.target.closest('[data-addon-media-enlarge]');
      if (enl) {
        const slot = enl.getAttribute('data-addon-media-enlarge');
        const st = mediaSlots[slot];
        const src = st.pendingFile ? st.pendingFile.dataUrl : st.url;
        if (src) openLightbox(src, slot === 'square_1_1' ? 'Square Media (1:1)' : 'Rectangular Media (4:3)', st.filename);
      }
    });

    document.getElementById('v2SeeProdAddonDrawerBody')?.addEventListener('click', (e) => {
      const img = e.target.closest('[data-addon-drawer-enlarge]');
      if (img) openLightbox(img.getAttribute('data-addon-drawer-enlarge'), img.getAttribute('data-addon-drawer-title'), '');
    });

    document.getElementById('v2SeeProdAddonDrawerRetireBtn')?.addEventListener('click', () => {
      if (inspectingAddon) promptRetireAddon(inspectingAddon);
    });
    document.getElementById('v2SeeProdAddonRetireConfirmBtn')?.addEventListener('click', executeRetireAddon);

    document.getElementById('v2SeeProdAddonsTableBody')?.addEventListener('click', (e) => {
      const det = e.target.closest('[data-addon-details]');
      if (det) return openAddonDetails(det.getAttribute('data-addon-details'));
      const edit = e.target.closest('[data-addon-edit]');
      if (edit) {
        const a = addons.find(x => String(x.id) === edit.getAttribute('data-addon-edit'));
        if (a) openAddonModal(a);
        return;
      }
      const ret = e.target.closest('[data-addon-retire]');
      if (ret) {
        const a = addons.find(x => String(x.id) === ret.getAttribute('data-addon-retire'));
        if (a) promptRetireAddon(a);
      }
    });

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      if (e?.detail?.tab === 'seeAddons') loadAddons();
    });
  }

  function init() {
    if (!initialized) { initialized = true; bindEvents(); }
    if (window.CWP_ADMIN_V2.shell?.getActiveTab?.() === 'seeAddons') loadAddons();
  }

  window.CWP_ADMIN_V2.seeAddons = { init, loadAddons };
})(window);
