/* Production SEE Packages controller. Uses the canonical package APIs only. */
(function (window) {
  'use strict';
  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = { initialized: false, packages: [], services: [], loading: false, editing: null, readOnly: false };
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  function notify(message, type = 'info') {
    if (window.CWP_ADMIN_V2.toast?.show) window.CWP_ADMIN_V2.toast.show(message, type);
    else if (window.CWP_ADMIN_V2.toast?.[type]) window.CWP_ADMIN_V2.toast[type](message);
  }

  function headers(json = false) {
    const out = json ? { 'Content-Type': 'application/json' } : {};
    const csrf = window.CWP_ADMIN_V2.auth?.getCsrfToken?.();
    if (csrf) out['X-CSRF-Token'] = csrf;
    return out;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) throw new Error(body.error || body.message || `Request failed (${response.status})`);
    return body;
  }

  function visibleService(service) {
    const code = String(service.service_code || '').toUpperCase();
    return service.status === 'active' && service.service_category_id !== 'daily_car_cleaning' && code !== 'DCC_DAILY' && !code.startsWith('SVC-DCC');
  }

  function render() {
    const body = $('v2SeePackagesBody');
    const stateEl = $('v2SeePackagesState');
    const table = $('v2SeePackagesTableWrap');
    if (!body || !stateEl || !table) return;
    const query = ($('v2SeePackagesSearch')?.value || '').trim().toLowerCase();
    const status = $('v2SeePackagesStatus')?.value || 'ALL';
    const filtered = state.packages.filter(pkg => {
      if (status !== 'ALL' && pkg.status !== status) return false;
      return !query || `${pkg.package_code || ''} ${pkg.name || ''} ${pkg.main_service_name || ''}`.toLowerCase().includes(query);
    });
    if (state.loading) {
      table.style.display = 'none'; stateEl.style.display = 'block'; stateEl.textContent = 'Loading packages…'; return;
    }
    if (!filtered.length) {
      table.style.display = 'none'; stateEl.style.display = 'block';
      stateEl.textContent = state.packages.length ? 'No packages match these filters.' : 'No package definitions are available.'; return;
    }
    stateEl.style.display = 'none'; table.style.display = 'block';
    body.innerHTML = filtered.map(pkg => `
      <tr>
        <td><span class="cwp-v2-cell-mono">${esc(pkg.package_code)}</span></td>
        <td><strong>${esc(pkg.name)}</strong>${pkg.tagline ? `<div class="cwp-v2-cell-secondary">${esc(pkg.tagline)}</div>` : ''}</td>
        <td>${esc(pkg.main_service_name || pkg.main_service_code || '—')}</td>
        <td>${esc(pkg.benefit_count ?? '—')}</td>
        <td>${esc(pkg.validity_value)} ${esc(pkg.validity_unit)}</td>
        <td class="is-numeric">₹${Number(pkg.base_price || 0).toFixed(2)}</td>
        <td>v${esc(pkg.version || 1)}</td>
        <td><span class="cwp-v2-badge ${pkg.status === 'active' ? 'cwp-v2-badge-success' : pkg.status === 'draft' ? 'cwp-v2-badge-info' : 'cwp-v2-badge-neutral'}">${esc(pkg.status)}</span></td>
        <td class="is-sticky-action"><button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-package-details="${esc(pkg.id)}">Details</button><button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-package-edit="${esc(pkg.id)}" ${pkg.status === 'retired' ? 'disabled' : ''}>Edit</button></td>
      </tr>`).join('');
    const badge = $('v2BadgeSeePackages');
    if (badge) badge.textContent = String(state.packages.filter(pkg => pkg.status === 'active').length);
  }

  async function load() {
    state.loading = true; render();
    try {
      const [packageResponse, serviceResponse] = await Promise.all([
        request('/api/see/packages?limit=200&offset=0'),
        request('/api/see/services?includeRetired=false&limit=200&offset=0')
      ]);
      state.packages = packageResponse.packages || [];
      state.services = (serviceResponse.services || []).filter(visibleService);
      render();
    } catch (error) {
      state.packages = [];
      state.loading = false;
      render();
      $('v2SeePackagesState').textContent = `Could not load package catalogue: ${error.message}`;
      notify(`Could not load packages: ${error.message}`, 'error');
    } finally { state.loading = false; render(); }
  }

  function populateServices(selectedId = '') {
    const select = $('v2SeePackageMainService');
    if (!select) return;
    select.innerHTML = '<option value="">Select active service…</option>' + state.services.map(service => `<option value="${esc(service.id)}">${esc(service.name)} (${esc(service.service_code)})</option>`).join('');
    if (selectedId) select.value = selectedId;
  }

  function clearFormError() { const el = $('v2SeePackageFormError'); if (el) { el.hidden = true; el.textContent = ''; } }
  function showFormError(message) { const el = $('v2SeePackageFormError'); if (el) { el.hidden = false; el.textContent = message; } }

  function setReadOnly(readOnly) {
    state.readOnly = readOnly;
    $('v2SeePackageForm')?.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = readOnly || (el.id === 'v2SeePackageCode' && Boolean(state.editing)); });
    const save = $('v2SeePackageSave');
    if (save) save.hidden = readOnly;
  }

  function setEditorData(pkg = null, readOnly = false) {
    state.editing = pkg;
    clearFormError();
    $('v2SeePackageModalTitle').textContent = readOnly ? 'Package Details' : pkg ? 'Edit Package' : 'New Package';
    $('v2SeePackageId').value = pkg?.id || '';
    $('v2SeePackageCode').value = pkg?.package_code || '';
    $('v2SeePackageName').value = pkg?.name || '';
    $('v2SeePackageStatus').value = pkg?.status || 'draft';
    $('v2SeePackageValidity').value = pkg?.validity_value ?? 30;
    $('v2SeePackageValidityUnit').value = pkg?.validity_unit || 'days';
    $('v2SeePackagePricingModel').value = pkg?.pricing_model || 'fixed';
    $('v2SeePackageBasePrice').value = pkg?.base_price ?? 0;
    $('v2SeePackageVehicleSegment').value = pkg?.vehicle_segment || '';
    $('v2SeePackageEffectiveFrom').value = String(pkg?.effective_from || '').slice(0, 10);
    $('v2SeePackageEffectiveTo').value = String(pkg?.effective_to || '').slice(0, 10);
    $('v2SeePackageDetails').value = pkg?.details || '';
    const benefits = pkg?.benefits?.map(item => ({ serviceId: item.service_id, benefitType: item.benefit_type, quantity: Number(item.quantity), frequencyId: item.frequency_id, validityOverrideDays: item.validity_override_days, config: item.config || {} })) || [];
    const addons = pkg?.addons?.map(item => ({ addonId: item.addon_id, quantity: Number(item.quantity), frequencyId: item.frequency_id, isIncluded: item.is_included !== false, overridePrice: item.override_price, config: item.config || {} })) || [];
    $('v2SeePackageBenefits').value = JSON.stringify(benefits, null, 2);
    $('v2SeePackageAddons').value = JSON.stringify(addons, null, 2);
    $('v2SeePackagePricingRules').value = JSON.stringify((pkg?.pricingRules || []).map(item => ({ city: item.city, zone: item.zone, vehicleSegment: item.vehicle_segment, pricingModel: item.pricing_model, unitPrice: Number(item.unit_price), minCharge: Number(item.min_charge || 0), pricingBands: item.pricing_bands || [], effectiveFrom: item.effective_from, effectiveTo: item.effective_to, isActive: item.is_active !== false })), null, 2);
    $('v2SeePackageEligibility').value = JSON.stringify(pkg?.city_zone_eligibility || { all_cities: true, cities: [], zones: [] }, null, 2);
    $('v2SeePackagePricingConfig').value = JSON.stringify(pkg?.pricing_config || {}, null, 2);
    populateServices(pkg?.main_service_id || '');
    setReadOnly(readOnly);
    window.CWP_ADMIN_V2.overlay?.open('v2SeePackageModal');
  }

  async function openEditor(id = null, readOnly = false) {
    if (!id) { if (!state.services.length) await load(); setEditorData(null, false); return; }
    try {
      const response = await request(`/api/see/packages/${encodeURIComponent(id)}`);
      setEditorData(response.package, readOnly);
    } catch (error) { notify(`Could not open package: ${error.message}`, 'error'); }
  }

  function parseJsonField(id, fallback) {
    const raw = ($(id)?.value || '').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  }

  async function save(event) {
    event.preventDefault(); clearFormError();
    if (state.readOnly) return;
    const id = $('v2SeePackageId').value;
    try {
      const benefits = parseJsonField('v2SeePackageBenefits', []);
      const addons = parseJsonField('v2SeePackageAddons', []);
      const pricingRules = parseJsonField('v2SeePackagePricingRules', []);
      const eligibility = parseJsonField('v2SeePackageEligibility', { all_cities: true, cities: [], zones: [] });
      const pricingConfig = parseJsonField('v2SeePackagePricingConfig', {});
      if (!Array.isArray(benefits) || !benefits.length) throw new Error('Add at least one service benefit.');
      if (!Array.isArray(addons) || !Array.isArray(pricingRules) || !eligibility || Array.isArray(eligibility) || !pricingConfig || Array.isArray(pricingConfig)) throw new Error('Benefits, add-ons, pricing rules and configuration must be valid JSON objects or arrays.');
      benefits.forEach((item, index) => { if (!item.serviceId || Number(item.quantity) < 1) throw new Error(`Benefit ${index + 1} requires a canonical serviceId and quantity of at least 1.`); });
      addons.forEach((item, index) => { if (!item.addonId || Number(item.quantity) < 1) throw new Error(`Add-on ${index + 1} requires a canonical addonId and quantity of at least 1.`); });
      const data = {
        packageCode: $('v2SeePackageCode').value.trim(), name: $('v2SeePackageName').value.trim(),
        mainServiceId: $('v2SeePackageMainService').value,
        status: $('v2SeePackageStatus').value,
        validityValue: Number($('v2SeePackageValidity').value), validityUnit: $('v2SeePackageValidityUnit').value,
        pricingModel: $('v2SeePackagePricingModel').value, basePrice: Number($('v2SeePackageBasePrice').value),
        vehicleSegment: $('v2SeePackageVehicleSegment').value.trim() || null,
        effectiveFrom: $('v2SeePackageEffectiveFrom').value || null, effectiveTo: $('v2SeePackageEffectiveTo').value || null,
        details: $('v2SeePackageDetails').value.trim() || null, benefits, addons, pricingRules,
        cityZoneEligibility: eligibility, pricingConfig
      };
      if (!data.name || !data.mainServiceId || !Number.isFinite(data.basePrice) || data.basePrice < 0 || !Number.isInteger(data.validityValue) || data.validityValue < 1) throw new Error('Complete the required package fields with valid values.');
      const response = await request(id ? `/api/see/packages/${encodeURIComponent(id)}` : '/api/see/packages', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(id ? { ...data, packageCode: undefined } : data) });
      notify(id ? `Package saved as version ${response.package?.version || 'updated'}.` : 'Package created.', 'success');
      window.CWP_ADMIN_V2.overlay?.close('v2SeePackageModal');
      await load();
    } catch (error) { showFormError(error.message || 'Package could not be saved.'); }
  }

  function bind() {
    $('v2SeePackagesRefresh')?.addEventListener('click', load);
    $('v2SeePackagesCreate')?.addEventListener('click', () => openEditor());
    $('v2SeePackagesSearch')?.addEventListener('input', render);
    $('v2SeePackagesStatus')?.addEventListener('change', render);
    $('v2SeePackageForm')?.addEventListener('submit', save);
    $('v2SeePackagesBody')?.addEventListener('click', event => {
      const details = event.target.closest('[data-package-details]');
      const edit = event.target.closest('[data-package-edit]');
      if (details) openEditor(details.getAttribute('data-package-details'), true);
      else if (edit && !edit.disabled) openEditor(edit.getAttribute('data-package-edit'), false);
    });
    window.addEventListener('cwp-v2:tab-changed', event => { if (event.detail?.tab === 'seePackages') load(); });
  }

  function init() {
    if (!state.initialized) { bind(); state.initialized = true; }
    if (document.getElementById('v2View_seePackages')?.classList.contains('is-active')) load();
  }
  window.CWP_ADMIN_V2.seePackages = { init, load, openEditor };
})(window);
