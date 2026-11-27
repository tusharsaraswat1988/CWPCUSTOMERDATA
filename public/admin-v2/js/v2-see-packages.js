/* Production SEE Packages controller. Uses the canonical package APIs only. */
(function (window) {
  'use strict';
  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const state = { initialized: false, packages: [], services: [], addons: [], frequencies: [], pricingConfig: {}, loading: false, editing: null, readOnly: false, lastMainServiceId: '' };
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
    const category = String(service.service_category_id || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const name = String(service.name || '').trim().toLowerCase().replace(/\s*\(dcc\)$/, '');
    const config = service.execution_config && typeof service.execution_config === 'object' ? service.execution_config : {};
    return service.status === 'active' && !['daily_car_cleaning', 'daily_clean', 'dcc'].includes(category) &&
      code !== 'DCC_DAILY' && !code.startsWith('SVC-DCC') && name !== 'daily car cleaning' && config.dcc_isolated !== true;
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
      const [packageResponse, serviceResponse, addonResponse, frequencyResponse] = await Promise.all([
        request('/api/see/packages?limit=200&offset=0'),
        request('/api/see/services?includeRetired=false&limit=200&offset=0'),
        request('/api/see/addons?status=active'),
        request('/api/see/frequencies')
      ]);
      state.packages = packageResponse.packages || [];
      const allServices = serviceResponse.services || [];
      state.services = allServices.filter(visibleService);
      const dccServiceIds = new Set(allServices.filter(service => !visibleService(service)).map(service => String(service.id)));
      state.addons = (addonResponse.addons || []).filter(addon =>
        !(Array.isArray(addon.applicable_service_ids) ? addon.applicable_service_ids : []).some(id => dccServiceIds.has(String(id)))
      );
      state.frequencies = frequencyResponse.frequencies || [];
      render();
    } catch (error) {
      state.packages = [];
      state.loading = false;
      render();
      $('v2SeePackagesState').textContent = `Could not load package catalogue: ${error.message}`;
      notify(`Could not load packages: ${error.message}`, 'error');
    } finally { state.loading = false; render(); }
  }

  function populateServices(selectedId = '', selectedService = null) {
    const select = $('v2SeePackageMainService');
    if (!select) return;
    const existingService = selectedId && !state.services.some(service => String(service.id) === String(selectedId)) && selectedService && visibleService({ ...selectedService, status: 'active' })
      ? `<option value="${esc(selectedId)}">${esc(selectedService.name)} (${esc(selectedService.service_code)})</option>` : '';
    select.innerHTML = `<option value="">Select active service…</option>${existingService}` + state.services.map(service => `<option value="${esc(service.id)}">${esc(service.name)} (${esc(service.service_code)})</option>`).join('');
    if (selectedId) select.value = selectedId;
  }

  function selectOptions(items, selected, label, emptyLabel) {
    const existing = state.editing?.benefits?.find(item => String(item.service_id) === String(selected));
    const existingAddon = state.editing?.addons?.find(item => String(item.addon_id) === String(selected));
    const existingFrequency = [...(state.editing?.benefits || []), ...(state.editing?.addons || [])].find(item => String(item.frequency_id) === String(selected));
    const fallback = existing ? { id: selected, name: existing.service_name, service_code: existing.service_code, service_category_id: existing.service_category_id }
      : existingAddon ? { id: selected, name: existingAddon.addon_name, addon_code: existingAddon.addon_code }
        : existingFrequency ? { id: selected, name: existingFrequency.frequency_code, code: existingFrequency.frequency_code, frequency_type: existingFrequency.frequency_type } : null;
    const options = selected && !items.some(item => String(item.id) === String(selected)) && fallback && (!fallback.service_code || visibleService({ ...fallback, status: 'active' })) ? [fallback, ...items] : items;
    return `<option value="">${esc(emptyLabel)}</option>` + options.map(item => `<option value="${esc(item.id)}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${esc(label(item))}</option>`).join('');
  }

  function renderBenefits(items = []) {
    const list = $('v2SeePackageBenefitsList');
    if (!list) return;
    const rows = items.length ? items : [{ serviceId: '', benefitType: 'primary', quantity: 1 }];
    list.innerHTML = rows.map((item, index) => {
      const serviceId = item.serviceId || item.service_id || '';
      const frequencyId = item.frequencyId || item.frequency_id || '';
      const row = `<div class="cwp-v2-see-package-item" data-benefit-row>
        <div class="cwp-v2-see-package-item-header"><h4 class="cwp-v2-see-package-item-title">Service benefit ${index + 1}</h4><button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-remove-benefit aria-label="Remove service benefit ${index + 1}" ${rows.length === 1 ? 'disabled' : ''}>Remove</button></div>
        <div class="cwp-v2-see-package-item-fields">
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Service</label><select class="cwp-v2-select" data-field="serviceId" aria-label="Service benefit ${index + 1} service" required>${selectOptions(state.services, serviceId, service => `${service.name} (${service.service_code})`, 'Select a service…')}</select></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Benefit type</label><select class="cwp-v2-select" data-field="benefitType" aria-label="Service benefit ${index + 1} type"><option value="primary" ${String(item.benefitType || item.benefit_type) === 'primary' ? 'selected' : ''}>Primary</option><option value="included_service" ${String(item.benefitType || item.benefit_type) === 'included_service' ? 'selected' : ''}>Included service</option><option value="wash_credit" ${String(item.benefitType || item.benefit_type) === 'wash_credit' ? 'selected' : ''}>Wash credit</option><option value="visit_credit" ${String(item.benefitType || item.benefit_type) === 'visit_credit' ? 'selected' : ''}>Visit credit</option><option value="custom" ${String(item.benefitType || item.benefit_type) === 'custom' ? 'selected' : ''}>Custom</option></select></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Quantity</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="1" step="1" data-field="quantity" aria-label="Service benefit ${index + 1} quantity" value="${esc(item.quantity ?? 1)}" required></div></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Frequency</label><select class="cwp-v2-select" data-field="frequencyId" aria-label="Service benefit ${index + 1} frequency">${selectOptions(state.frequencies, frequencyId, frequency => `${frequency.name || frequency.code} (${frequency.frequency_type})`, 'No frequency')}</select></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Validity override (days)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="1" step="1" data-field="validityOverrideDays" aria-label="Service benefit ${index + 1} validity override in days" value="${esc(item.validityOverrideDays ?? item.validity_override_days ?? '')}" placeholder="Use package validity"></div></div>
        </div>
      </div>`;
      return row;
    }).join('');
    list.querySelectorAll('[data-benefit-row]').forEach((row, index) => { row._config = rows[index]?.config || {}; });
  }

  function renderAddons(items = []) {
    const list = $('v2SeePackageAddonsList');
    if (!list) return;
    list.innerHTML = items.map((item, index) => {
      const addonId = item.addonId || item.addon_id || '';
      const frequencyId = item.frequencyId || item.frequency_id || '';
      return `<div class="cwp-v2-see-package-item" data-addon-row>
        <div class="cwp-v2-see-package-item-header"><h4 class="cwp-v2-see-package-item-title">Add-on ${index + 1}</h4><button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-remove-addon aria-label="Remove add-on ${index + 1}">Remove</button></div>
        <div class="cwp-v2-see-package-item-fields">
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Add-on</label><select class="cwp-v2-select" data-field="addonId" required>${selectOptions(state.addons, addonId, addon => `${addon.name} (${addon.addon_code})`, 'Select an add-on…')}</select></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Quantity</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="1" step="1" data-field="quantity" value="${esc(item.quantity ?? 1)}" required></div></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Frequency</label><select class="cwp-v2-select" data-field="frequencyId">${selectOptions(state.frequencies, frequencyId, frequency => `${frequency.name || frequency.code} (${frequency.frequency_type})`, 'Use add-on default')}</select></div>
          <div class="cwp-v2-field"><label class="cwp-v2-field-label">Package price override (INR)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="0" step="0.01" data-field="overridePrice" value="${esc(item.overridePrice ?? item.override_price ?? '')}" placeholder="Use add-on price"></div></div>
          <label class="cwp-v2-see-package-check"><input type="checkbox" data-field="isIncluded" ${item.isIncluded !== false && item.is_included !== false ? 'checked' : ''}><span>Included in package price</span></label>
        </div>
      </div>`;
    }).join('') || '<div class="cwp-v2-field-helper">No add-ons attached.</div>';
    list.querySelectorAll('[data-addon-row]').forEach((row, index) => { row._config = items[index]?.config || {}; });
  }

  function renderPriceBands(list, bands = [], prefix = 'base') {
    if (!list) return;
    list.innerHTML = bands.map((band, index) => {
      const mode = band.flat_price != null ? 'flat' : 'unit';
      const price = mode === 'flat' ? band.flat_price : (band.unit_price ?? '');
      return `<div class="cwp-v2-see-package-band" data-price-band data-prefix="${prefix}">
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Minimum quantity</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="1" step="1" data-band-min value="${esc(band.min ?? 1)}"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Maximum quantity</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="1" step="1" data-band-max value="${esc(band.max ?? '')}" placeholder="No limit"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Price type</label><select class="cwp-v2-select" data-band-mode><option value="flat" ${mode === 'flat' ? 'selected' : ''}>Flat package price</option><option value="unit" ${mode === 'unit' ? 'selected' : ''}>Price per unit</option></select></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">${mode === 'flat' ? 'Flat price (INR)' : 'Price per unit (INR)'}</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="0" step="0.01" data-band-price value="${esc(price)}" required></div></div>
        <button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-remove-band aria-label="Remove quantity band ${index + 1}">Remove</button>
      </div>`;
    }).join('');
  }

  function readPriceBands(list) {
    return Array.from(list?.querySelectorAll('[data-price-band]') || []).map(row => {
      const mode = row.querySelector('[data-band-mode]').value;
      const max = row.querySelector('[data-band-max]').value;
      const price = Number(row.querySelector('[data-band-price]').value || 0);
      return { min: Number(row.querySelector('[data-band-min]').value || 1), max: max ? Number(max) : null, ...(mode === 'flat' ? { flat_price: price } : { unit_price: price }) };
    });
  }

  function renderPricingRules(items = []) {
    const list = $('v2SeePackagePricingRulesList');
    if (!list) return;
    list.innerHTML = items.map((rule, index) => `<div class="cwp-v2-see-package-item" data-pricing-rule>
      <div class="cwp-v2-see-package-item-header"><h4 class="cwp-v2-see-package-item-title">Price override ${index + 1}</h4><button type="button" class="cwp-v2-btn cwp-v2-btn-tertiary cwp-v2-btn-sm" data-remove-pricing-rule aria-label="Remove price override ${index + 1}">Remove</button></div>
      <div class="cwp-v2-see-package-item-fields">
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">City (optional)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" data-field="city" value="${esc(rule.city || '')}" placeholder="Any city"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Zone (optional)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" data-field="zone" value="${esc(rule.zone || '')}" placeholder="Any zone"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Vehicle segment (optional)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" data-field="vehicleSegment" value="${esc(rule.vehicleSegment || rule.vehicle_segment || '')}" placeholder="Any segment"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Pricing model</label><select class="cwp-v2-select" data-field="pricingModel"><option value="fixed">Fixed</option><option value="vehicle_segment">Vehicle segment</option><option value="per_unit">Per unit</option><option value="per_panel">Per panel</option><option value="pricing_bands">Pricing bands</option><option value="minimum_charge">Minimum charge</option><option value="custom">Custom</option></select></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Unit price (INR)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="0" step="0.01" data-field="unitPrice" value="${esc(rule.unitPrice ?? rule.unit_price ?? 0)}"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Minimum charge (INR)</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="number" min="0" step="0.01" data-field="minCharge" value="${esc(rule.minCharge ?? rule.min_charge ?? 0)}"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Effective from</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="date" data-field="effectiveFrom" value="${esc(String(rule.effectiveFrom || rule.effective_from || '').slice(0, 10))}"></div></div>
        <div class="cwp-v2-field"><label class="cwp-v2-field-label">Effective to</label><div class="cwp-v2-input-box"><input class="cwp-v2-input" type="date" data-field="effectiveTo" value="${esc(String(rule.effectiveTo || rule.effective_to || '').slice(0, 10))}"></div></div>
        <label class="cwp-v2-see-package-check"><input type="checkbox" data-field="isActive" ${rule.isActive !== false && rule.is_active !== false ? 'checked' : ''}><span>Active</span></label>
        <div class="cwp-v2-see-package-bands" data-rule-bands style="display:${rule.pricingModel === 'pricing_bands' || rule.pricing_model === 'pricing_bands' ? 'flex' : 'none'};"><strong>Quantity bands</strong><div class="cwp-v2-see-package-list" data-rule-band-list></div><button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" data-add-rule-band>Add quantity band</button></div>
      </div>
    </div>`).join('') || '<div class="cwp-v2-field-helper">No location or vehicle price overrides.</div>';
    list.querySelectorAll('[data-pricing-rule]').forEach((row, index) => {
      row.querySelector('[data-field="pricingModel"]').value = items[index].pricingModel || items[index].pricing_model || 'fixed';
      renderPriceBands(row.querySelector('[data-rule-band-list]'), items[index].pricingBands || items[index].pricing_bands || [], 'rule');
    });
  }

  function readBenefits() {
    return Array.from($('v2SeePackageBenefitsList')?.querySelectorAll('[data-benefit-row]') || []).map(row => ({
      serviceId: row.querySelector('[data-field="serviceId"]').value,
      benefitType: row.querySelector('[data-field="benefitType"]').value,
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      frequencyId: row.querySelector('[data-field="frequencyId"]').value || null,
      validityOverrideDays: row.querySelector('[data-field="validityOverrideDays"]').value ? Number(row.querySelector('[data-field="validityOverrideDays"]').value) : null,
      config: row._config || {}
    }));
  }

  function readAddons() {
    return Array.from($('v2SeePackageAddonsList')?.querySelectorAll('[data-addon-row]') || []).map(row => ({
      addonId: row.querySelector('[data-field="addonId"]').value,
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      frequencyId: row.querySelector('[data-field="frequencyId"]').value || null,
      isIncluded: row.querySelector('[data-field="isIncluded"]').checked,
      overridePrice: row.querySelector('[data-field="overridePrice"]').value ? Number(row.querySelector('[data-field="overridePrice"]').value) : null,
      config: row._config || {}
    }));
  }

  function readPricingRules() {
    return Array.from($('v2SeePackagePricingRulesList')?.querySelectorAll('[data-pricing-rule]') || []).map(row => ({
      city: row.querySelector('[data-field="city"]').value.trim() || null,
      zone: row.querySelector('[data-field="zone"]').value.trim() || null,
      vehicleSegment: row.querySelector('[data-field="vehicleSegment"]').value.trim() || null,
      pricingModel: row.querySelector('[data-field="pricingModel"]').value,
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value || 0),
      minCharge: Number(row.querySelector('[data-field="minCharge"]').value || 0),
      pricingBands: readPriceBands(row.querySelector('[data-rule-band-list]')),
      effectiveFrom: row.querySelector('[data-field="effectiveFrom"]').value || null,
      effectiveTo: row.querySelector('[data-field="effectiveTo"]').value || null,
      isActive: row.querySelector('[data-field="isActive"]').checked
    }));
  }

  function validatePriceBands(bands, label) {
    const sorted = [...bands].sort((a, b) => a.min - b.min);
    sorted.forEach((band, index) => {
      const price = band.flat_price ?? band.unit_price;
      if (!Number.isInteger(band.min) || band.min < 1 || (band.max != null && (!Number.isInteger(band.max) || band.max < band.min)) || !Number.isFinite(price) || price < 0) {
        throw new Error(`${label} quantity band ${index + 1} has invalid quantities or price.`);
      }
      if (index && (sorted[index - 1].max == null || band.min <= sorted[index - 1].max)) throw new Error(`${label} quantity bands cannot overlap.`);
    });
  }

  function clearFormError() { const el = $('v2SeePackageFormError'); if (el) { el.hidden = true; el.textContent = ''; } }
  function showFormError(message) { const el = $('v2SeePackageFormError'); if (el) { el.hidden = false; el.textContent = message; } }

  function setReadOnly(readOnly) {
    state.readOnly = readOnly;
    $('v2SeePackageForm')?.querySelectorAll('input,select,textarea').forEach(el => { el.disabled = readOnly || (el.id === 'v2SeePackageCode' && Boolean(state.editing)); });
    $('v2SeePackageForm')?.querySelectorAll('button:not([data-overlay-close])').forEach(button => { button.disabled = readOnly; });
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
    const benefits = (pkg?.benefits || []).map(item => ({ serviceId: item.service_id, service_name: item.service_name, service_code: item.service_code, benefitType: item.benefit_type, quantity: Number(item.quantity), frequencyId: item.frequency_id, validityOverrideDays: item.validity_override_days, config: item.config || {} }));
    const addons = (pkg?.addons || []).map(item => ({ addonId: item.addon_id, quantity: Number(item.quantity), frequencyId: item.frequency_id, isIncluded: item.is_included !== false, overridePrice: item.override_price, config: item.config || {} }));
    const eligibility = pkg?.city_zone_eligibility || { all_cities: true, cities: [], zones: [] };
    state.pricingConfig = pkg?.pricing_config && typeof pkg.pricing_config === 'object' && !Array.isArray(pkg.pricing_config) ? pkg.pricing_config : {};
    state.cityZoneEligibility = eligibility;
    populateServices(pkg?.main_service_id || '', pkg ? { name: pkg.main_service_name, service_code: pkg.main_service_code } : null);
    state.lastMainServiceId = $('v2SeePackageMainService').value;
    renderBenefits(benefits.length ? benefits : [{ serviceId: pkg?.main_service_id || '', benefitType: 'primary', quantity: 1 }]);
    renderAddons(addons);
    renderPricingRules((pkg?.pricingRules || []).map(item => ({ city: item.city, zone: item.zone, vehicleSegment: item.vehicle_segment, pricingModel: item.pricing_model, unitPrice: Number(item.unit_price), minCharge: Number(item.min_charge || 0), pricingBands: item.pricing_bands || [], effectiveFrom: item.effective_from, effectiveTo: item.effective_to, isActive: item.is_active !== false })));
    $('v2SeePackageMinimumCharge').value = state.pricingConfig.min_charge ?? 0;
    renderPriceBands($('v2SeePackageBaseBandsList'), state.pricingConfig.pricing_bands || []);
    $('v2SeePackageAllCities').checked = eligibility.all_cities !== false;
    $('v2SeePackageCities').value = Array.isArray(eligibility.cities) ? eligibility.cities.join(', ') : '';
    $('v2SeePackageZones').value = Array.isArray(eligibility.zones) ? eligibility.zones.join(', ') : '';
    $('v2SeePackageLocationLimits').style.display = eligibility.all_cities === false ? 'grid' : 'none';
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

  async function save(event) {
    event.preventDefault(); clearFormError();
    if (state.readOnly) return;
    const id = $('v2SeePackageId').value;
    try {
      const benefits = readBenefits();
      const addons = readAddons();
      const pricingRules = readPricingRules();
      const baseBands = readPriceBands($('v2SeePackageBaseBandsList'));
      if (!benefits.length) throw new Error('Add at least one service benefit.');
      benefits.forEach((item, index) => { if (!item.serviceId || !Number.isInteger(item.quantity) || item.quantity < 1) throw new Error(`Service benefit ${index + 1} needs a service and a quantity of at least 1.`); });
      benefits.forEach((item, index) => { if (item.validityOverrideDays != null && (!Number.isInteger(item.validityOverrideDays) || item.validityOverrideDays < 1)) throw new Error(`Service benefit ${index + 1} validity override must be a positive whole number of days.`); });
      const addonIds = addons.map(item => item.addonId).filter(Boolean);
      if (addons.some(item => !item.addonId || !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error('Choose an add-on and a quantity of at least 1 for each add-on row.');
      if (new Set(addonIds).size !== addonIds.length) throw new Error('Each add-on can only be added once.');
      addons.forEach((item, index) => { if (item.overridePrice != null && (!Number.isFinite(item.overridePrice) || item.overridePrice < 0)) throw new Error(`Add-on ${index + 1} price override must be zero or greater.`); });
      if ($('v2SeePackagePricingModel').value === 'pricing_bands' && !baseBands.length) throw new Error('Add at least one quantity band for pricing bands.');
      validatePriceBands(baseBands, 'Base price');
      pricingRules.forEach((rule, index) => {
        if (!Number.isFinite(rule.unitPrice) || rule.unitPrice < 0 || !Number.isFinite(rule.minCharge) || rule.minCharge < 0) throw new Error(`Price override ${index + 1} needs valid non-negative prices.`);
        if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) throw new Error(`Price override ${index + 1} ends before it starts.`);
        if (rule.pricingModel === 'pricing_bands' && !rule.pricingBands.length) throw new Error(`Add at least one quantity band to price override ${index + 1}.`);
        validatePriceBands(rule.pricingBands, `Price override ${index + 1}`);
      });
      if (!Number.isFinite(Number($('v2SeePackageMinimumCharge').value)) || Number($('v2SeePackageMinimumCharge').value) < 0) throw new Error('Minimum charge must be zero or greater.');
      const allCities = $('v2SeePackageAllCities').checked;
      const parseNames = id => $(id).value.split(',').map(value => value.trim()).filter(Boolean);
      const cities = allCities ? [] : parseNames('v2SeePackageCities');
      const zones = parseNames('v2SeePackageZones');
      if (!allCities && !cities.length) throw new Error('Add at least one allowed city or enable availability in all cities.');
      const eligibility = { ...(state.cityZoneEligibility || {}), all_cities: allCities, cities, zones };
      const pricingConfig = { ...state.pricingConfig, min_charge: Number($('v2SeePackageMinimumCharge').value || 0), pricing_bands: baseBands };
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
      if (data.effectiveFrom && data.effectiveTo && data.effectiveTo < data.effectiveFrom) throw new Error('Package end date cannot be earlier than its start date.');
      benefits.forEach((item, index) => { if (item.frequencyId && !state.frequencies.some(frequency => String(frequency.id) === String(item.frequencyId))) throw new Error(`Service benefit ${index + 1} has an unavailable frequency.`); });
      addons.forEach((item, index) => { if (item.frequencyId && !state.frequencies.some(frequency => String(frequency.id) === String(item.frequencyId))) throw new Error(`Add-on ${index + 1} has an unavailable frequency.`); });
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
    $('v2SeePackageBenefitAdd')?.addEventListener('click', () => renderBenefits([...readBenefits(), { serviceId: '', benefitType: 'included_service', quantity: 1 }]));
    $('v2SeePackageAddonAdd')?.addEventListener('click', () => renderAddons([...readAddons(), { addonId: '', quantity: 1, isIncluded: true }]));
    $('v2SeePackagePricingRuleAdd')?.addEventListener('click', () => renderPricingRules([...readPricingRules(), { pricingModel: $('v2SeePackagePricingModel').value, unitPrice: $('v2SeePackageBasePrice').value || 0, minCharge: 0, pricingBands: [], isActive: true }]));
    $('v2SeePackageBaseBandAdd')?.addEventListener('click', () => renderPriceBands($('v2SeePackageBaseBandsList'), [...readPriceBands($('v2SeePackageBaseBandsList')), { min: 1, max: null, flat_price: 0 }]));
    $('v2SeePackageAllCities')?.addEventListener('change', event => { $('v2SeePackageLocationLimits').style.display = event.target.checked ? 'none' : 'grid'; });
    $('v2SeePackageMainService')?.addEventListener('change', event => {
      const first = $('v2SeePackageBenefitsList')?.querySelector('[data-benefit-row]');
      const firstService = first?.querySelector('[data-field="serviceId"]');
      if (firstService && firstService.value === state.lastMainServiceId) firstService.value = event.target.value;
      state.lastMainServiceId = event.target.value;
    });
    $('v2SeePackageBenefitsList')?.addEventListener('click', event => { if (event.target.closest('[data-remove-benefit]')) { const rows = readBenefits(); if (rows.length > 1) renderBenefits(rows.filter((_, index) => index !== Array.from($('v2SeePackageBenefitsList').querySelectorAll('[data-benefit-row]')).indexOf(event.target.closest('[data-benefit-row]')))); } });
    $('v2SeePackageAddonsList')?.addEventListener('click', event => { if (event.target.closest('[data-remove-addon]')) renderAddons(readAddons().filter((_, index) => index !== Array.from($('v2SeePackageAddonsList').querySelectorAll('[data-addon-row]')).indexOf(event.target.closest('[data-addon-row]')))); });
    $('v2SeePackagePricingRulesList')?.addEventListener('click', event => {
      const row = event.target.closest('[data-pricing-rule]');
      if (event.target.closest('[data-remove-pricing-rule]')) renderPricingRules(readPricingRules().filter((_, index) => index !== Array.from($('v2SeePackagePricingRulesList').querySelectorAll('[data-pricing-rule]')).indexOf(row)));
      else if (event.target.closest('[data-add-rule-band]')) { const bands = readPriceBands(row.querySelector('[data-rule-band-list]')); renderPriceBands(row.querySelector('[data-rule-band-list]'), [...bands, { min: 1, max: null, flat_price: 0 }], 'rule'); }
      else if (event.target.closest('[data-remove-band]')) { const bandList = event.target.closest('[data-rule-band-list]'); if (bandList) renderPriceBands(bandList, readPriceBands(bandList).filter((_, index) => index !== Array.from(bandList.querySelectorAll('[data-price-band]')).indexOf(event.target.closest('[data-price-band]'))), 'rule'); }
    });
    $('v2SeePackageBaseBandsList')?.addEventListener('click', event => { if (event.target.closest('[data-remove-band]')) { const row = event.target.closest('[data-price-band]'); renderPriceBands($('v2SeePackageBaseBandsList'), readPriceBands($('v2SeePackageBaseBandsList')).filter((_, index) => index !== Array.from($('v2SeePackageBaseBandsList').querySelectorAll('[data-price-band]')).indexOf(row))); } });
    $('v2SeePackagePricingRulesList')?.addEventListener('change', event => {
      if (event.target.matches('[data-field="pricingModel"]')) {
        const row = event.target.closest('[data-pricing-rule]');
        const bands = row.querySelector('[data-rule-bands]');
        bands.style.display = event.target.value === 'pricing_bands' ? 'flex' : 'none';
      }
      if (event.target.matches('[data-band-mode]')) {
        const label = event.target.closest('[data-price-band]').querySelector('[data-band-price]').closest('.cwp-v2-field').querySelector('.cwp-v2-field-label');
        label.textContent = event.target.value === 'flat' ? 'Flat price (INR)' : 'Price per unit (INR)';
      }
    });
    $('v2SeePackageBaseBandsList')?.addEventListener('change', event => {
      if (event.target.matches('[data-band-mode]')) {
        const label = event.target.closest('[data-price-band]').querySelector('[data-band-price]').closest('.cwp-v2-field').querySelector('.cwp-v2-field-label');
        label.textContent = event.target.value === 'flat' ? 'Flat price (INR)' : 'Price per unit (INR)';
      }
    });
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
