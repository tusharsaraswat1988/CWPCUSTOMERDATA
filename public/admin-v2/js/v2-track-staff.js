/**
 * =========================================================================
 * CWP ADMIN V2 — TRACK STAFF CONTROL CENTER MODULE
 * =========================================================================
 * Strictly scoped to window.CWP_ADMIN_V2.trackStaff.
 * English-only UI, Material Symbols only, zero fake GPS data,
 * diff-based identifiable staff markers keyed by unique staffId.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  const DEFAULT_CENTER = { lat: 25.3176, lng: 82.9739, zoom: 13 };
  const POLL_INTERVAL_MS = 15000;
  const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  const VALID_STATUSES = new Set(['moving', 'stopped', 'idle']);

  const state = {
    initialized: false,
    isActiveTab: false,
    isLoading: false,
    hasLoadedOnce: false,
    lastSyncAt: null,
    lastError: null,
    kpis: null,
    staffList: [],
    stoppages: [],
    alerts: [],
    detailTab: 'location',
    searchQuery: '',
    statusFilter: 'all',
    selectedStaffId: null,
    showBreadcrumbs: true,
    pendingPings: new Set(),
    pollTimer: null,
    pingPollTimers: new Map()
  };

  const mapState = {
    engine: 'none', // 'google' | 'osm' | 'svg' | 'none'
    initialized: false,
    initializing: false,
    googleApiKey: '',
    googleScriptLoaded: false,
    leafletMap: null,
    googleMap: null,
    markersById: new Map(), // staffId -> { marker, sig, lat, lng }
    jobMarker: null,
    jobCircle: null,
    breadcrumbsLayer: null,
    activeBreadcrumbs: [],
    hasAutoFittedOnce: false
  };

  let searchDebounceTimer = null;

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------
  function esc(val) {
    if (window.CWP_ADMIN_V2.ui && typeof window.CWP_ADMIN_V2.ui.escapeHtml === 'function') {
      return window.CWP_ADMIN_V2.ui.escapeHtml(val);
    }
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, type = 'info') {
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.show === 'function') {
      window.CWP_ADMIN_V2.toast.show(msg, type, 3200);
    }
  }

  function hasAuthToken() {
    const gate = document.getElementById('v2LoginGate');
    if (gate && !gate.hidden && gate.style.display !== 'none') return false;
    const token = (window.CWP_ADMIN_V2.auth && typeof window.CWP_ADMIN_V2.auth.getToken === 'function')
      ? window.CWP_ADMIN_V2.auth.getToken()
      : (sessionStorage.getItem('cwp_admin_token') || localStorage.getItem('cwp_admin_token') || '');
    return Boolean(token && token.trim());
  }

  function isValidCoord(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    if (lat === '' || lng === '') return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    if (nLat === 0 && nLng === 0) return false;
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
    return true;
  }

  function getStaffInitials(staff) {
    const raw = String(staff.name || staff.staffCode || 'S').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }

  function normalizeStatus(status) {
    const s = String(status || 'idle').toLowerCase();
    return VALID_STATUSES.has(s) ? s : 'idle';
  }

  function getStatusLabel(status) {
    const s = normalizeStatus(status);
    if (s === 'moving') return 'Moving';
    if (s === 'stopped') return 'Stopped';
    return 'Idle';
  }

  function isLocationStale(staff) {
    if (!staff || !staff.lastSeenAt) return true;
    const ts = new Date(staff.lastSeenAt).getTime();
    if (!Number.isFinite(ts)) return true;
    return (Date.now() - ts) > STALE_THRESHOLD_MS;
  }

  function formatFreshness(staff) {
    const hasCoords = isValidCoord(staff.latitude, staff.longitude);
    if (!hasCoords) {
      return { label: 'GPS unavailable', tier: 'unavailable', isStale: true, isUnavailable: true };
    }
    if (!staff.lastSeenAt) {
      return { label: 'Last known • Time unknown', tier: 'stale', isStale: true, isUnavailable: false };
    }
    const ts = new Date(staff.lastSeenAt).getTime();
    if (!Number.isFinite(ts)) {
      return { label: 'Last known • Time unknown', tier: 'stale', isStale: true, isUnavailable: false };
    }
    const diffMs = Math.max(0, Date.now() - ts);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2) {
      return { label: 'Live • Just now', tier: 'live', isStale: false, isUnavailable: false };
    }
    if (diffMin < 15) {
      return { label: `Recently updated (${diffMin}m ago)`, tier: 'recent', isStale: false, isUnavailable: false };
    }
    if (diffMin < 30) {
      return { label: `Delayed (${diffMin}m ago)`, tier: 'delayed', isStale: false, isUnavailable: false };
    }
    if (diffMin < 60) {
      return { label: `Last known • Stale (${diffMin}m ago)`, tier: 'stale', isStale: true, isUnavailable: false };
    }
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return { label: `Last known • Stale (${diffHr}h ago)`, tier: 'stale', isStale: true, isUnavailable: false };
    }
    const diffDay = Math.floor(diffHr / 24);
    return { label: `Last known • Stale (${diffDay}d ago)`, tier: 'stale', isStale: true, isUnavailable: false };
  }

  function formatLastUpdateTime(lastSeenAt) {
    if (!lastSeenAt) return 'Unavailable';
    const d = new Date(lastSeenAt);
    if (isNaN(d.getTime())) return 'Unavailable';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Computes non-overlapping display coordinates when multiple staff share
   * nearly identical GPS positions (within ~28m), keeping true GPS intact.
   */
  function computeDisplayPositions(staffList) {
    const valid = (staffList || []).filter(s => isValidCoord(s.latitude, s.longitude));
    const result = new Map();
    const groups = [];
    const THRESHOLD = 0.00025;

    valid.forEach(s => {
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      let matched = null;
      for (const g of groups) {
        if (Math.abs(g.lat - lat) < THRESHOLD && Math.abs(g.lng - lng) < THRESHOLD) {
          matched = g;
          break;
        }
      }
      if (matched) {
        matched.items.push(s);
      } else {
        groups.push({ lat, lng, items: [s] });
      }
    });

    groups.forEach(g => {
      if (g.items.length === 1) {
        const s = g.items[0];
        result.set(String(s.staffId), { lat: Number(s.latitude), lng: Number(s.longitude) });
        return;
      }
      const radius = 0.00022;
      g.items.forEach((s, idx) => {
        const angle = (2 * Math.PI * idx) / g.items.length;
        result.set(String(s.staffId), {
          lat: Number(s.latitude) + radius * Math.cos(angle),
          lng: Number(s.longitude) + radius * Math.sin(angle)
        });
      });
    });

    return result;
  }

  function formatCoords(lat, lng) {
    if (!isValidCoord(lat, lng)) return 'GPS unavailable';
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  function getStaffById(staffId) {
    if (!staffId) return null;
    return state.staffList.find(s => String(s.staffId) === String(staffId)) || null;
  }

  // -------------------------------------------------------------------------
  // CONNECTION STATUS & KPI RENDERING
  // -------------------------------------------------------------------------
  function updateConnectionPill(syncing = false) {
    const pill = document.getElementById('v2TrkConnPill');
    const text = document.getElementById('v2TrkConnText');
    const syncTimeEl = document.getElementById('v2TrkSyncTime');
    if (!pill || !text) return;

    pill.classList.remove('is-live', 'is-stale', 'is-syncing', 'is-disconnected');

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      pill.classList.add('is-disconnected');
      text.textContent = 'Offline';
      return;
    }

    if (syncing) {
      pill.classList.add('is-syncing');
      text.textContent = 'Syncing...';
      return;
    }

    if (state.lastError) {
      pill.classList.add('is-disconnected');
      text.textContent = 'Disconnected';
      return;
    }

    if (!state.hasLoadedOnce) {
      pill.classList.add('is-syncing');
      text.textContent = 'Connecting...';
      return;
    }

    if (syncTimeEl && state.lastSyncAt) {
      syncTimeEl.textContent = `Synced ${state.lastSyncAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    // Check if telemetry is stale when staff exist
    if (state.staffList.length > 0) {
      const hasAnyFresh = state.staffList.some(s => isValidCoord(s.latitude, s.longitude) && !isLocationStale(s));
      if (!hasAnyFresh) {
        pill.classList.add('is-stale');
        text.textContent = 'Stale Telemetry';
        return;
      }
    }

    pill.classList.add('is-live');
    text.textContent = 'Connected';
  }

  function renderKpis() {
    const activeEl = document.getElementById('v2TrkKpiActive');
    const activeMetaEl = document.getElementById('v2TrkKpiActiveMeta');
    const distEl = document.getElementById('v2TrkKpiDistance');
    const stopsEl = document.getElementById('v2TrkKpiStops');
    const dwellEl = document.getElementById('v2TrkKpiDwell');

    if (!state.kpis || state.lastError) {
      if (activeEl) activeEl.textContent = '—';
      if (activeMetaEl) activeMetaEl.textContent = state.lastError ? 'Telemetry unavailable' : 'Waiting for telemetry';
      if (distEl) distEl.textContent = '—';
      if (stopsEl) stopsEl.textContent = '—';
      if (dwellEl) dwellEl.textContent = '—';
      return;
    }

    const k = state.kpis;
    const hasActive = typeof k.activeStaffCount === 'number' && typeof k.totalStaffCount === 'number';
    if (activeEl) activeEl.textContent = hasActive ? `${k.activeStaffCount} / ${k.totalStaffCount}` : '—';
    if (activeMetaEl) {
      activeMetaEl.textContent = hasActive ? `${k.totalStaffCount} total active crew` : 'Unavailable';
    }
    if (distEl) distEl.textContent = typeof k.fleetDistanceKm === 'number' ? `${Math.round(k.fleetDistanceKm * 100) / 100} km` : '—';
    if (stopsEl) stopsEl.textContent = typeof k.totalStoppages === 'number' ? String(k.totalStoppages) : '—';
    if (dwellEl) dwellEl.textContent = typeof k.avgDwellMinutes === 'number' ? `${k.avgDwellMinutes} min` : '—';
  }

  // -------------------------------------------------------------------------
  // STAFF ROSTER (LEFT PANEL)
  // -------------------------------------------------------------------------
  function getFilteredStaff() {
    const q = state.searchQuery.toLowerCase().trim();
    return state.staffList.filter(s => {
      const status = normalizeStatus(s.status);
      if (state.statusFilter !== 'all' && status !== state.statusFilter) {
        return false;
      }
      if (q) {
        const name = String(s.name || '').toLowerCase();
        const code = String(s.staffCode || '').toLowerCase();
        const id = String(s.staffId || '').toLowerCase();
        const phone = String(s.phone || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !id.includes(q) && !phone.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  function renderRoster() {
    const container = document.getElementById('v2TrkRosterList');
    if (!container) return;

    const prevScrollTop = container.scrollTop;

    if (state.lastError && !state.hasLoadedOnce) {
      container.innerHTML = `
        <div class="cwp-v2-empty-state-panel cwp-v2-trk-empty-compact">
          <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">cloud_off</span>
          <div class="cwp-v2-empty-state-title">Tracking unavailable</div>
          <div class="cwp-v2-empty-state-desc">${esc(state.lastError)}</div>
          <button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm" id="v2TrkRetryBtn">Retry</button>
        </div>
      `;
      document.getElementById('v2TrkRetryBtn')?.addEventListener('click', () => loadData(true));
      return;
    }

    const filtered = getFilteredStaff();
    if (filtered.length === 0) {
      const msg = state.staffList.length === 0
        ? 'No active field staff telemetry available.'
        : 'No staff members match your current search or filter.';
      container.innerHTML = `
        <div class="cwp-v2-empty-state-panel cwp-v2-trk-empty-compact">
          <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">person_search</span>
          <div class="cwp-v2-empty-state-title">No matching staff</div>
          <div class="cwp-v2-empty-state-desc">${esc(msg)}</div>
        </div>
      `;
      return;
    }

    const html = filtered.map(s => {
      const sid = String(s.staffId);
      const status = normalizeStatus(s.status);
      const statusLabel = getStatusLabel(status);
      const initials = getStaffInitials(s);
      const freshness = formatFreshness(s);
      const coords = formatCoords(s.latitude, s.longitude);
      const isSelected = String(state.selectedStaffId) === sid;
      const isPinging = state.pendingPings.has(sid);
      const hasBattery = s.batteryLevel !== null && s.batteryLevel !== undefined && Number.isFinite(Number(s.batteryLevel));
      const phonePart = s.phone ? ` • ${esc(s.phone)}` : '';

      const avatarInner = s.photoUrl
        ? `<img src="${esc(s.photoUrl)}" alt="${esc(s.name || s.staffCode)}" onerror="this.remove();">`
        : esc(initials);

      return `
        <div class="cwp-v2-trk-staff-card ${isSelected ? 'is-selected' : ''}" data-staff-id="${esc(sid)}" role="listitem" tabindex="0">
          <div class="cwp-v2-trk-card-top">
            <div class="cwp-v2-trk-identity">
              <div class="cwp-v2-trk-avatar">
                ${avatarInner}
                <span class="cwp-v2-trk-avatar-dot is-${status}" aria-hidden="true"></span>
              </div>
              <div class="cwp-v2-trk-name-wrap">
                <div class="cwp-v2-trk-name">${esc(s.name || s.staffCode)}</div>
                <div class="cwp-v2-trk-sub">${esc(s.staffCode || sid)}${phonePart}</div>
              </div>
            </div>
            <span class="cwp-v2-trk-status-badge is-${status}">${esc(statusLabel)}</span>
          </div>
          <div class="cwp-v2-trk-loc-row ${freshness.isUnavailable ? 'is-unavailable' : (freshness.isStale ? 'is-stale' : '')}">
            <span class="material-symbols-outlined" aria-hidden="true">${freshness.isUnavailable ? 'location_off' : 'location_on'}</span>
            <span>${esc(coords)} • ${esc(freshness.label)}</span>
          </div>
          <div class="cwp-v2-trk-metrics-row">
            <span class="cwp-v2-trk-metric-item">
              <span class="material-symbols-outlined" aria-hidden="true">route</span>
              <strong>${esc(s.todayDistanceKm ?? 0)} km</strong> today
            </span>
            <span class="cwp-v2-trk-metric-item">
              <span class="material-symbols-outlined" aria-hidden="true">pause_circle</span>
              <strong>${esc(s.stoppageCount ?? 0)}</strong> stops
            </span>
            ${hasBattery ? `
              <span class="cwp-v2-trk-metric-item">
                <span class="material-symbols-outlined" aria-hidden="true">battery_std</span>
                <strong>${esc(Math.round(Number(s.batteryLevel)))}%</strong>
              </span>
            ` : ''}
          </div>
          <div class="cwp-v2-trk-card-actions">
            <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="center" data-staff-id="${esc(sid)}">
              <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
              <span>Center</span>
            </button>
            <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="ping" data-staff-id="${esc(sid)}" ${isPinging ? 'disabled' : ''}>
              <span class="material-symbols-outlined" aria-hidden="true">satellite_alt</span>
              <span>${isPinging ? 'Pinging...' : 'Ping'}</span>
            </button>
            <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="stops" data-staff-id="${esc(sid)}">
              <span class="material-symbols-outlined" aria-hidden="true">history</span>
              <span>Stops</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    container.scrollTop = prevScrollTop;
  }

  function highlightRosterCard(staffId, scrollIntoView = false) {
    const container = document.getElementById('v2TrkRosterList');
    if (!container) return;
    container.querySelectorAll('.cwp-v2-trk-staff-card').forEach(el => {
      const match = el.getAttribute('data-staff-id') === String(staffId);
      el.classList.toggle('is-selected', match);
      if (match && scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // -------------------------------------------------------------------------
  // SELECTED STAFF MAP DETAIL CARD
  // -------------------------------------------------------------------------
  function formatAccuracyLabel(staff) {
    if (staff.accuracy === null || staff.accuracy === undefined || !Number.isFinite(Number(staff.accuracy))) {
      return 'Unknown';
    }
    const m = Math.round(Number(staff.accuracy));
    const tier = staff.accuracyTier || (m <= 20 ? 'good' : (m <= 50 ? 'moderate' : 'poor'));
    const label = tier === 'good' ? 'Good' : (tier === 'moderate' ? 'Moderate' : (tier === 'poor' ? 'Poor' : 'Unknown'));
    return `±${m}m (${label})`;
  }

  function renderMapDetailCard(staff) {
    const card = document.getElementById('v2TrkMapDetailCard');
    if (!card) return;
    if (!staff) {
      card.hidden = true;
      card.innerHTML = '';
      clearJobGeofenceOverlay();
      return;
    }

    const sid = String(staff.staffId);
    const status = normalizeStatus(staff.status);
    const freshness = formatFreshness(staff);
    const hasCoords = isValidCoord(staff.latitude, staff.longitude);
    const coords = formatCoords(staff.latitude, staff.longitude);
    const isPinging = state.pendingPings.has(sid);
    const hasBattery = staff.batteryLevel !== null && staff.batteryLevel !== undefined && Number.isFinite(Number(staff.batteryLevel));
    const tab = state.detailTab || 'location';

    const jv = staff.jobVerification || null;
    const analytics = staff.analytics || {};
    const devChanged = Boolean(staff.deviceChangedAt);

    let tabBodyHtml = '';
    if (tab === 'location') {
      tabBodyHtml = `
        <div class="cwp-v2-trk-detail-grid">
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">${freshness.isStale && hasCoords ? 'Last Known GPS' : 'Coordinates'}</span>
            <span class="cwp-v2-trk-detail-v">${esc(coords)}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">GPS Accuracy</span>
            <span class="cwp-v2-trk-detail-v">${esc(formatAccuracyLabel(staff))}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Last GPS Update</span>
            <span class="cwp-v2-trk-detail-v">${esc(formatLastUpdateTime(staff.lastSeenAt))}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Server Received</span>
            <span class="cwp-v2-trk-detail-v">${esc(formatLastUpdateTime(staff.receivedAt || staff.lastSeenAt))}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Distance Today</span>
            <span class="cwp-v2-trk-detail-v">${esc(Math.round(Number(staff.todayDistanceKm ?? 0) * 100) / 100)} km</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Job Distance</span>
            <span class="cwp-v2-trk-detail-v">${jv && jv.distanceMeters !== null ? esc(`${jv.distanceMeters} m`) : 'Unavailable'}</span>
          </div>
        </div>
      `;
    } else if (tab === 'device') {
      const batText = hasBattery
        ? `${Math.round(Number(staff.batteryLevel))}%${staff.isCharging === true ? ' (Charging)' : (staff.isCharging === false ? ' (Discharging)' : '')}`
        : 'Unavailable';
      tabBodyHtml = `
        <div class="cwp-v2-trk-detail-grid">
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Device ID</span>
            <span class="cwp-v2-trk-detail-v">${esc(staff.deviceId || 'Unidentified (Browser)')}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">App Version</span>
            <span class="cwp-v2-trk-detail-v">${esc(staff.appVersion || 'Unavailable')}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Battery &amp; Power</span>
            <span class="cwp-v2-trk-detail-v">${esc(batText)}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Network</span>
            <span class="cwp-v2-trk-detail-v">${esc(staff.networkType || staff.connectivityStatus || 'Unavailable')}</span>
          </div>
        </div>
        ${devChanged ? `<div class="cwp-v2-trk-device-warn">Device changed at ${esc(formatLastUpdateTime(staff.deviceChangedAt))}</div>` : ''}
      `;
    } else if (tab === 'operations') {
      const devText = staff.routeDeviation && staff.routeDeviation.isActive
        ? `Deviated (${staff.routeDeviation.distanceMeters ?? '—'} m)`
        : 'Within work area';
      const arrText = staff.activeArrival ? `At job (${formatLastUpdateTime(staff.activeArrival.arrivedAt)})` : 'Not at job';
      tabBodyHtml = `
        <div class="cwp-v2-trk-detail-grid">
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Assigned Job</span>
            <span class="cwp-v2-trk-detail-v">${jv ? esc(jv.customerName || 'Assigned') : 'None today'}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Job Verification</span>
            <span class="cwp-v2-trk-detail-v">${jv ? esc(jv.verificationState) : 'Unavailable'}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Geofence / Route</span>
            <span class="cwp-v2-trk-detail-v">${esc(arrText)} • ${esc(devText)}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Session (GPS vs Done)</span>
            <span class="cwp-v2-trk-detail-v">${esc(analytics.jobsVisitedCount ?? 0)} visited / ${esc(analytics.jobsCompletedCount ?? 0)} done (${esc(analytics.jobsAssignedCount ?? 0)} total)</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">First / Last Fix</span>
            <span class="cwp-v2-trk-detail-v">${analytics.firstValidLocationAt ? esc(formatLastUpdateTime(analytics.firstValidLocationAt)) : '—'}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Tracking Duration</span>
            <span class="cwp-v2-trk-detail-v">${esc(analytics.trackingDurationMinutes ?? 0)} min (${esc(staff.stoppageCount ?? 0)} stops)</span>
          </div>
        </div>
      `;
    } else {
      tabBodyHtml = `
        <div class="cwp-v2-trk-detail-grid">
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Last Heartbeat</span>
            <span class="cwp-v2-trk-detail-v">${esc(formatLastUpdateTime(staff.lastHeartbeatAt || staff.lastSeenAt))}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Connectivity</span>
            <span class="cwp-v2-trk-detail-v">${esc(staff.connectivityStatus || (freshness.isStale ? 'Stale / Unknown' : 'Connected'))}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Location Permission</span>
            <span class="cwp-v2-trk-detail-v">${esc(staff.permissionStatus || 'Unavailable')}</span>
          </div>
          <div class="cwp-v2-trk-detail-kv">
            <span class="cwp-v2-trk-detail-k">Telemetry Gaps</span>
            <span class="cwp-v2-trk-detail-v">${esc(analytics.locationGapCount ?? 0)} today</span>
          </div>
        </div>
      `;
    }

    card.hidden = false;
    card.innerHTML = `
      <div class="cwp-v2-trk-detail-head">
        <div class="cwp-v2-trk-identity">
          <div class="cwp-v2-trk-avatar cwp-v2-trk-avatar-sm">
            ${esc(getStaffInitials(staff))}
            <span class="cwp-v2-trk-avatar-dot is-${status}" aria-hidden="true"></span>
          </div>
          <div class="cwp-v2-trk-name-wrap">
            <div class="cwp-v2-trk-name">${esc(staff.name || staff.staffCode)}</div>
            <div class="cwp-v2-trk-sub">${esc(staff.staffCode || sid)}${staff.phone ? ` • ${esc(staff.phone)}` : ''}</div>
          </div>
        </div>
        <button type="button" class="cwp-v2-trk-detail-close" id="v2TrkDetailCloseBtn" aria-label="Close staff detail card">
          <span class="material-symbols-outlined cwp-v2-trk-icon-sm" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="cwp-v2-trk-detail-status-row">
        <span class="cwp-v2-trk-status-badge is-${status}">${esc(getStatusLabel(status))}</span>
        <span class="cwp-v2-trk-detail-freshness">${esc(freshness.label)}</span>
      </div>
      <div class="cwp-v2-trk-detail-tabs" role="tablist">
        <button type="button" class="cwp-v2-trk-detail-tab ${tab === 'location' ? 'is-active' : ''}" data-trk-detail-tab="location">Location</button>
        <button type="button" class="cwp-v2-trk-detail-tab ${tab === 'device' ? 'is-active' : ''}" data-trk-detail-tab="device">Device</button>
        <button type="button" class="cwp-v2-trk-detail-tab ${tab === 'operations' ? 'is-active' : ''}" data-trk-detail-tab="operations">Operations</button>
        <button type="button" class="cwp-v2-trk-detail-tab ${tab === 'health' ? 'is-active' : ''}" data-trk-detail-tab="health">Health</button>
      </div>
      ${tabBodyHtml}
      <div class="cwp-v2-trk-card-actions cwp-v2-trk-detail-actions">
        <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="center" data-staff-id="${esc(sid)}">
          <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
          <span>Center</span>
        </button>
        <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="ping" data-staff-id="${esc(sid)}" ${isPinging ? 'disabled' : ''}>
          <span class="material-symbols-outlined" aria-hidden="true">satellite_alt</span>
          <span>${isPinging ? 'Pinging...' : 'Ping'}</span>
        </button>
        <button type="button" class="cwp-v2-trk-action-btn" data-trk-action="stops" data-staff-id="${esc(sid)}">
          <span class="material-symbols-outlined" aria-hidden="true">history</span>
          <span>Stops</span>
        </button>
      </div>
    `;

    card.querySelectorAll('[data-trk-detail-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.detailTab = btn.getAttribute('data-trk-detail-tab') || 'location';
        renderMapDetailCard(staff);
      });
    });

    document.getElementById('v2TrkDetailCloseBtn')?.addEventListener('click', () => {
      clearSelection();
    });

    syncJobGeofenceOverlay(staff);
  }

  function clearJobGeofenceOverlay() {
    if (mapState.jobMarker) {
      if (mapState.jobMarker.remove) mapState.jobMarker.remove();
      else if (mapState.jobMarker.setMap) mapState.jobMarker.setMap(null);
      mapState.jobMarker = null;
    }
    if (mapState.jobCircle) {
      if (mapState.jobCircle.remove) mapState.jobCircle.remove();
      else if (mapState.jobCircle.setMap) mapState.jobCircle.setMap(null);
      mapState.jobCircle = null;
    }
  }

  function syncJobGeofenceOverlay(staff) {
    clearJobGeofenceOverlay();
    const jv = staff && staff.jobVerification;
    if (!jv || !isValidCoord(jv.jobLat, jv.jobLng)) return;
    const lat = Number(jv.jobLat);
    const lng = Number(jv.jobLng);

    if (mapState.engine === 'osm' && mapState.leafletMap && window.L) {
      mapState.jobCircle = window.L.circle([lat, lng], {
        radius: 120,
        color: '#2563eb',
        weight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.12
      }).addTo(mapState.leafletMap);
      const icon = window.L.divIcon({
        className: 'cwp-v2-trk-leaflet-marker',
        html: `<div class="cwp-v2-trk-job-pin">Job: ${esc(jv.customerName || 'Site')}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      mapState.jobMarker = window.L.marker([lat, lng], { icon }).addTo(mapState.leafletMap);
    } else if (mapState.engine === 'google' && mapState.googleMap && window.google) {
      mapState.jobCircle = new window.google.maps.Circle({
        map: mapState.googleMap,
        center: { lat, lng },
        radius: 120,
        strokeColor: '#2563eb',
        strokeWeight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.12
      });
      mapState.jobMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapState.googleMap,
        title: `Assigned Job: ${jv.customerName || 'Site'}`,
        label: { text: 'JOB', color: '#ffffff', fontSize: '9px', fontWeight: '700' }
      });
    }
  }

  function renderAlertsPanel() {
    const badge = document.getElementById('v2TrkAlertsBadge');
    const listEl = document.getElementById('v2TrkAlertList');
    const backendAlerts = Array.isArray(state.alerts) ? state.alerts : [];
    const activeBackend = backendAlerts.filter(a => a.isActive && !a.acknowledgedAt);

    // Derive non-noisy exception alerts for GPS unavailable / poor accuracy
    const derivedAlerts = [];
    state.staffList.forEach(s => {
      if (!isValidCoord(s.latitude, s.longitude)) {
        derivedAlerts.push({
          id: `derived-nogps-${s.staffId}`,
          staffId: s.staffId,
          staffName: s.name || s.staffCode,
          severity: 'warning',
          title: 'GPS unavailable',
          details: 'No valid coordinates reported for this staff member.',
          occurredAt: s.lastSeenAt,
          isDerived: true,
          isActive: true
        });
      } else if (s.accuracyTier === 'poor') {
        derivedAlerts.push({
          id: `derived-acc-${s.staffId}`,
          staffId: s.staffId,
          staffName: s.name || s.staffCode,
          severity: 'warning',
          title: 'Poor GPS accuracy',
          details: `Current fix accuracy is ±${Math.round(Number(s.accuracy || 0))}m.`,
          occurredAt: s.lastSeenAt,
          isDerived: true,
          isActive: true
        });
      }
    });

    const combined = [...activeBackend, ...derivedAlerts, ...backendAlerts.filter(a => !a.isActive || a.acknowledgedAt)];
    const activeCount = activeBackend.length + derivedAlerts.length;

    if (badge) {
      badge.textContent = String(activeCount);
      badge.hidden = activeCount === 0;
    }

    if (!listEl) return;
    if (combined.length === 0) {
      listEl.innerHTML = `<div class="cwp-v2-trk-alert-empty">No operational alerts or exceptions today.</div>`;
      return;
    }

    listEl.innerHTML = combined.map(a => {
      const sev = a.severity === 'critical' ? 'is-critical' : (a.severity === 'warning' ? 'is-warning' : 'is-info');
      const statusTag = a.acknowledgedAt ? 'Acknowledged' : (a.isActive ? 'Active' : 'Resolved');
      const canAck = !a.isDerived && a.isActive && !a.acknowledgedAt;
      return `
        <div class="cwp-v2-trk-alert-item ${sev}" data-alert-staff-id="${esc(String(a.staffId))}">
          <div class="cwp-v2-trk-alert-row">
            <strong class="cwp-v2-trk-alert-title">${esc(a.title)}</strong>
            <span class="cwp-v2-trk-alert-tag">${esc(statusTag)}</span>
          </div>
          <div class="cwp-v2-trk-alert-desc">${esc(a.staffName || '')}${a.details ? ` — ${esc(a.details)}` : ''}</div>
          <div class="cwp-v2-trk-alert-foot">
            <span class="cwp-v2-trk-alert-time">${a.occurredAt ? esc(formatLastUpdateTime(a.occurredAt)) : 'Current'}</span>
            ${canAck ? `<button type="button" class="cwp-v2-btn cwp-v2-btn-secondary cwp-v2-btn-sm cwp-v2-trk-ack-btn" data-ack-alert-id="${esc(a.id)}">Acknowledge</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  async function acknowledgeAlert(eventId) {
    if (!eventId) return;
    try {
      await window.CWP_ADMIN_V2.api.request('acknowledgeTrackingAlert', { eventId });
      showToast('Alert acknowledged.', 'success');
      await loadData(false);
    } catch (err) {
      showToast(err.message || 'Failed to acknowledge alert.', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // MAP ENGINE & DIFF-BASED MARKER RENDERING
  // -------------------------------------------------------------------------
  function buildMarkerPinHtml(staff, isSelected) {
    const status = normalizeStatus(staff.status);
    const stale = isLocationStale(staff);
    const poorAcc = staff.accuracyTier === 'poor';
    const initials = getStaffInitials(staff);
    const label = staff.name || staff.staffCode || 'Staff';
    const circleInner = staff.photoUrl
      ? `<img src="${esc(staff.photoUrl)}" alt="${esc(label)}" onerror="this.remove();">`
      : esc(initials);

    return `
      <div class="cwp-v2-trk-marker-pin ${isSelected ? 'is-selected' : ''}" data-marker-staff-id="${esc(String(staff.staffId))}">
        <div class="cwp-v2-trk-marker-circle is-${status} ${stale ? 'is-stale' : ''} ${poorAcc ? 'is-poor-acc' : ''}">${circleInner}</div>
        <div class="cwp-v2-trk-marker-label">${esc(label)}</div>
      </div>
    `;
  }

  function getMarkerSignature(staff, isSelected) {
    return [
      normalizeStatus(staff.status),
      isLocationStale(staff) ? '1' : '0',
      isSelected ? '1' : '0',
      staff.name || '',
      staff.staffCode || '',
      staff.photoUrl || ''
    ].join('|');
  }

  async function initMapIfNeeded() {
    if (mapState.initialized || mapState.initializing) return;
    const canvas = document.getElementById('v2TrkMapCanvas');
    if (!canvas) return;

    mapState.initializing = true;
    try {
      let apiKey = '';
      try {
        const cfg = await window.CWP_ADMIN_V2.api.request('getMapsConfig', {}, { skipUnauthorizedHandler: true });
        apiKey = (cfg && cfg.googleMapsApiKey) ? String(cfg.googleMapsApiKey).trim() : '';
      } catch (e) {
        apiKey = '';
      }

      mapState.googleApiKey = apiKey;
      const layerBtn = document.getElementById('v2TrkMapToggleProvider');
      if (layerBtn) layerBtn.hidden = !apiKey;

      if (apiKey) {
        const gOk = await loadGoogleMaps(apiKey);
        if (gOk && window.google && window.google.maps) {
          initGoogleEngine(canvas);
          return;
        }
      }

      const lOk = await loadLeafletAssets();
      if (lOk && window.L) {
        initOsmEngine(canvas);
        return;
      }

      initSvgEngine(canvas);
    } finally {
      mapState.initializing = false;
      mapState.initialized = true;
      const loadingEl = document.getElementById('v2TrkMapLoading');
      if (loadingEl) loadingEl.style.display = 'none';
      syncMarkers();
      if (!mapState.hasAutoFittedOnce) {
        fitAllValidMarkers();
        mapState.hasAutoFittedOnce = true;
      }
    }
  }

  function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve(true);
    if (mapState.googleScriptLoaded) return Promise.resolve(false);
    mapState.googleScriptLoaded = true;
    return new Promise(resolve => {
      const cbName = '__cwpV2GoogleMapsReady';
      window[cbName] = function () {
        delete window[cbName];
        resolve(true);
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${cbName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function loadLeafletAssets() {
    if (window.L) return Promise.resolve(true);
    return new Promise(resolve => {
      if (!document.getElementById('leafletCssTag')) {
        const link = document.createElement('link');
        link.id = 'leafletCssTag';
        link.rel = 'stylesheet';
        link.href = '/vendor/leaflet/leaflet.css';
        document.head.appendChild(link);
      }
      const existingScript = document.getElementById('leafletJsTag');
      if (existingScript) {
        if (typeof window.L !== 'undefined') {
          resolve(true);
          return;
        }
        existingScript.addEventListener('load', () => resolve(typeof window.L !== 'undefined'), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = 'leafletJsTag';
      script.src = '/vendor/leaflet/leaflet.js';
      script.onload = () => resolve(typeof window.L !== 'undefined');
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function initGoogleEngine(canvas) {
    mapState.engine = 'google';
    mapState.markersById.clear();
    canvas.innerHTML = '';
    mapState.googleMap = new window.google.maps.Map(canvas, {
      center: { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng },
      zoom: DEFAULT_CENTER.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false
    });
  }

  function initOsmEngine(canvas) {
    mapState.engine = 'osm';
    mapState.markersById.clear();
    if (mapState.leafletMap) {
      try { mapState.leafletMap.remove(); } catch (e) {}
      mapState.leafletMap = null;
    }
    canvas.innerHTML = '';
    mapState.leafletMap = window.L.map(canvas, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: DEFAULT_CENTER.zoom,
      zoomControl: false
    });
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapState.leafletMap);
  }

  function initSvgEngine(canvas) {
    mapState.engine = 'svg';
    mapState.markersById.clear();
    canvas.innerHTML = `
      <div class="cwp-v2-trk-svg-fallback">
        <div class="cwp-v2-trk-svg-grid"></div>
        <svg id="v2TrkSvgCanvas" viewBox="0 0 800 500" class="cwp-v2-trk-svg-canvas"></svg>
      </div>
    `;
  }

  function syncMarkers() {
    if (!mapState.initialized) return;

    if (mapState.engine === 'svg') {
      renderSvgMarkers();
      return;
    }

    const validStaffMap = new Map();
    const displayPositions = computeDisplayPositions(state.staffList);
    state.staffList.forEach(s => {
      if (isValidCoord(s.latitude, s.longitude)) {
        validStaffMap.set(String(s.staffId), s);
      }
    });

    // 1. Remove markers for staff no longer present or with invalid coords
    for (const [sid, entry] of mapState.markersById.entries()) {
      if (!validStaffMap.has(sid)) {
        if (mapState.engine === 'osm' && entry.marker && mapState.leafletMap) {
          mapState.leafletMap.removeLayer(entry.marker);
        } else if (mapState.engine === 'google' && entry.marker) {
          entry.marker.setMap(null);
        }
        mapState.markersById.delete(sid);
      }
    }

    // 2. Add or diff-update markers
    for (const [sid, staff] of validStaffMap.entries()) {
      const disp = displayPositions.get(sid) || { lat: Number(staff.latitude), lng: Number(staff.longitude) };
      const lat = disp.lat;
      const lng = disp.lng;
      const isSelected = String(state.selectedStaffId) === sid;
      const isStale = isLocationStale(staff);
      const sig = getMarkerSignature(staff, isSelected);
      const existing = mapState.markersById.get(sid);

      if (mapState.engine === 'osm' && mapState.leafletMap && window.L) {
        if (!existing) {
          const icon = window.L.divIcon({
            className: 'cwp-v2-trk-leaflet-marker',
            html: buildMarkerPinHtml(staff, isSelected),
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });
          const marker = window.L.marker([lat, lng], {
            icon,
            zIndexOffset: isSelected ? 1000 : 100
          }).addTo(mapState.leafletMap);
          marker.on('click', () => selectStaff(sid, { source: 'map', centerMap: false }));
          mapState.markersById.set(sid, { marker, sig, lat, lng });
        } else {
          if (existing.lat !== lat || existing.lng !== lng) {
            existing.marker.setLatLng([lat, lng]);
            existing.lat = lat;
            existing.lng = lng;
          }
          if (existing.sig !== sig) {
            const icon = window.L.divIcon({
              className: 'cwp-v2-trk-leaflet-marker',
              html: buildMarkerPinHtml(staff, isSelected),
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            });
            existing.marker.setIcon(icon);
            existing.marker.setZIndexOffset(isSelected ? 1000 : 100);
            existing.sig = sig;
          }
        }
      } else if (mapState.engine === 'google' && mapState.googleMap && window.google) {
        const st = normalizeStatus(staff.status);
        const statusColor = isStale
          ? '#94a3b8'
          : (st === 'moving' ? '#10b981' : (st === 'stopped' ? '#f59e0b' : '#475569'));
        const fillColor = isStale
          ? (isSelected ? '#475569' : '#64748b')
          : (isSelected ? '#1d4ed8' : '#2563eb');
        const gIcon = {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 15 : 12,
          fillColor,
          fillOpacity: isStale ? 0.78 : 1,
          strokeWeight: isSelected ? 3.5 : 2.5,
          strokeColor: isSelected ? '#2563eb' : statusColor
        };

        if (!existing) {
          const marker = new window.google.maps.Marker({
            position: { lat, lng },
            map: mapState.googleMap,
            title: `${staff.name || staff.staffCode} (${staff.staffCode || sid})`,
            label: {
              text: getStaffInitials(staff),
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '700'
            },
            icon: gIcon,
            zIndex: isSelected ? 1000 : 100
          });
          marker.addListener('click', () => selectStaff(sid, { source: 'map', centerMap: false }));
          mapState.markersById.set(sid, { marker, sig, lat, lng });
        } else {
          if (existing.lat !== lat || existing.lng !== lng) {
            existing.marker.setPosition({ lat, lng });
            existing.lat = lat;
            existing.lng = lng;
          }
          if (existing.sig !== sig) {
            existing.marker.setIcon(gIcon);
            existing.marker.setZIndex(isSelected ? 1000 : 100);
            existing.sig = sig;
          }
        }
      }
    }
  }

  function renderSvgMarkers() {
    const svg = document.getElementById('v2TrkSvgCanvas');
    if (!svg) return;

    const valid = state.staffList.filter(s => isValidCoord(s.latitude, s.longitude));
    if (valid.length === 0) {
      svg.innerHTML = '<text x="400" y="250" text-anchor="middle" fill="#94a3b8" font-size="14" font-family="sans-serif">No valid staff GPS coordinates available</text>';
      return;
    }

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    valid.forEach(s => {
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    const padLat = (maxLat - minLat) * 0.25 || 0.01;
    const padLng = (maxLng - minLng) * 0.25 || 0.01;
    minLat -= padLat; maxLat += padLat;
    minLng -= padLng; maxLng += padLng;

    svg.innerHTML = valid.map(s => {
      const sid = String(s.staffId);
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      const x = ((lng - minLng) / (maxLng - minLng)) * 700 + 50;
      const y = 450 - (((lat - minLat) / (maxLat - minLat)) * 400 + 25);
      const isSelected = String(state.selectedStaffId) === sid;
      const status = normalizeStatus(s.status);
      const ringColor = status === 'moving' ? '#10b981' : (status === 'stopped' ? '#f59e0b' : '#64748b');

      return `
        <g data-svg-staff-id="${esc(sid)}" style="cursor:pointer;">
          <circle cx="${x}" cy="${y}" r="${isSelected ? 22 : 17}" fill="${isSelected ? '#1d4ed8' : '#2563eb'}" stroke="${ringColor}" stroke-width="${isSelected ? 3.5 : 2.5}" />
          <text x="${x}" y="${y + 4}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700" font-family="sans-serif">${esc(getStaffInitials(s))}</text>
          <text x="${x}" y="${y + 32}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="600" font-family="sans-serif">${esc(s.name || s.staffCode)}</text>
        </g>
      `;
    }).join('');

    svg.querySelectorAll('[data-svg-staff-id]').forEach(el => {
      el.addEventListener('click', () => {
        const sid = el.getAttribute('data-svg-staff-id');
        selectStaff(sid, { source: 'map', centerMap: false });
      });
    });
  }

  function centerMapOnStaff(staff) {
    if (!staff || !isValidCoord(staff.latitude, staff.longitude)) {
      showToast('GPS coordinates are unavailable for this staff member.', 'warning');
      return false;
    }
    const lat = Number(staff.latitude);
    const lng = Number(staff.longitude);

    if (mapState.engine === 'osm' && mapState.leafletMap) {
      mapState.leafletMap.setView([lat, lng], 16, { animate: true });
    } else if (mapState.engine === 'google' && mapState.googleMap) {
      mapState.googleMap.panTo({ lat, lng });
      mapState.googleMap.setZoom(16);
    }
    return true;
  }

  function fitAllValidMarkers() {
    const valid = state.staffList.filter(s => isValidCoord(s.latitude, s.longitude));

    if (valid.length === 0) {
      if (mapState.engine === 'osm' && mapState.leafletMap) {
        mapState.leafletMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_CENTER.zoom);
      } else if (mapState.engine === 'google' && mapState.googleMap) {
        mapState.googleMap.setCenter({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng });
        mapState.googleMap.setZoom(DEFAULT_CENTER.zoom);
      }
      return;
    }

    if (valid.length === 1) {
      const s = valid[0];
      const lat = Number(s.latitude);
      const lng = Number(s.longitude);
      if (mapState.engine === 'osm' && mapState.leafletMap) {
        mapState.leafletMap.setView([lat, lng], 15, { animate: true });
      } else if (mapState.engine === 'google' && mapState.googleMap) {
        mapState.googleMap.panTo({ lat, lng });
        mapState.googleMap.setZoom(15);
      }
      return;
    }

    if (mapState.engine === 'osm' && mapState.leafletMap && window.L) {
      const bounds = window.L.latLngBounds(valid.map(s => [Number(s.latitude), Number(s.longitude)]));
      mapState.leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else if (mapState.engine === 'google' && mapState.googleMap && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      valid.forEach(s => bounds.extend({ lat: Number(s.latitude), lng: Number(s.longitude) }));
      window.google.maps.event.addListenerOnce(mapState.googleMap, 'bounds_changed', () => {
        if ((mapState.googleMap.getZoom() || 0) > 16) {
          mapState.googleMap.setZoom(16);
        }
      });
      mapState.googleMap.fitBounds(bounds, 40);
    }
  }

  function drawBreadcrumbs(breadcrumbs) {
    clearBreadcrumbs();
    mapState.activeBreadcrumbs = Array.isArray(breadcrumbs) ? breadcrumbs : [];
    if (!state.showBreadcrumbs) return;
    const validPts = mapState.activeBreadcrumbs.filter(b => isValidCoord(b.lat, b.lng));
    if (validPts.length < 2) return;

    if (mapState.engine === 'osm' && mapState.leafletMap && window.L) {
      const latLngs = validPts.map(b => [Number(b.lat), Number(b.lng)]);
      mapState.breadcrumbsLayer = window.L.polyline(latLngs, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85
      }).addTo(mapState.leafletMap);
      mapState.leafletMap.fitBounds(mapState.breadcrumbsLayer.getBounds(), { padding: [40, 40] });
    } else if (mapState.engine === 'google' && mapState.googleMap && window.google) {
      const path = validPts.map(b => ({ lat: Number(b.lat), lng: Number(b.lng) }));
      mapState.breadcrumbsLayer = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map: mapState.googleMap
      });
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach(pt => bounds.extend(pt));
      mapState.googleMap.fitBounds(bounds, 40);
    }
  }

  function clearBreadcrumbs() {
    if (mapState.breadcrumbsLayer) {
      if (mapState.breadcrumbsLayer.remove) mapState.breadcrumbsLayer.remove();
      else if (mapState.breadcrumbsLayer.setMap) mapState.breadcrumbsLayer.setMap(null);
      mapState.breadcrumbsLayer = null;
    }
  }

  // -------------------------------------------------------------------------
  // SELECTION SYNCHRONIZATION (LIST <-> MAP)
  // -------------------------------------------------------------------------
  function selectStaff(staffId, opts = {}) {
    const staff = getStaffById(staffId);
    if (!staff) return;

    state.selectedStaffId = String(staff.staffId);
    highlightRosterCard(state.selectedStaffId, opts.source === 'map');
    syncMarkers();
    renderMapDetailCard(staff);

    if (opts.centerMap !== false) {
      centerMapOnStaff(staff);
    }
  }

  function clearSelection() {
    state.selectedStaffId = null;
    highlightRosterCard(null, false);
    syncMarkers();
    renderMapDetailCard(null);
  }

  // -------------------------------------------------------------------------
  // PING & STOPS ACTIONS
  // -------------------------------------------------------------------------
  async function pingStaff(staffId) {
    const sid = String(staffId || '');
    const staff = getStaffById(sid);
    if (!sid || !staff) return;
    if (state.pendingPings.has(sid)) return;

    const prevLastSeen = staff.lastSeenAt || null;
    const prevLat = staff.latitude;
    const prevLng = staff.longitude;

    state.pendingPings.add(sid);
    renderRoster();
    if (String(state.selectedStaffId) === sid) renderMapDetailCard(staff);

    try {
      const res = await window.CWP_ADMIN_V2.api.request('pingStaffLocation', { staffId: sid });
      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Ping request failed');
      }

      showToast(`Location ping sent to ${staff.name || staff.staffCode}. Waiting for device response...`, 'info');

      let attempts = 0;
      const maxAttempts = 6;
      const timer = setInterval(async () => {
        attempts += 1;
        await loadData(false);
        const updated = getStaffById(sid);
        const confirmedUpdate = updated && (
          updated.lastSeenAt !== prevLastSeen ||
          updated.latitude !== prevLat ||
          updated.longitude !== prevLng
        );

        if (confirmedUpdate || attempts >= maxAttempts) {
          clearInterval(timer);
          state.pingPollTimers.delete(sid);
          state.pendingPings.delete(sid);
          renderRoster();
          if (String(state.selectedStaffId) === sid) renderMapDetailCard(getStaffById(sid));
          if (confirmedUpdate) {
            showToast(`Updated GPS received from ${staff.name || staff.staffCode}.`, 'success');
          }
        }
      }, 2500);

      state.pingPollTimers.set(sid, timer);
    } catch (err) {
      state.pendingPings.delete(sid);
      renderRoster();
      if (String(state.selectedStaffId) === sid) renderMapDetailCard(staff);
      showToast(err.message || 'Failed to send location ping.', 'error');
    }
  }

  async function openStopsModal(staffId) {
    const staff = getStaffById(staffId);
    if (!staff) return;

    selectStaff(staffId, { source: 'action', centerMap: isValidCoord(staff.latitude, staff.longitude) });

    const titleEl = document.getElementById('v2TrkStopsModalTitle');
    const metaEl = document.getElementById('v2TrkStopsMeta');
    const contentEl = document.getElementById('v2TrkStopsContent');

    if (titleEl) titleEl.textContent = `${staff.name || staff.staffCode} — Stoppages & Route History`;
    if (metaEl) metaEl.textContent = `${staff.staffCode || staff.staffId} • Today's distance: ${staff.todayDistanceKm ?? 0} km`;
    if (contentEl) {
      contentEl.innerHTML = '<div class="cwp-v2-trk-stops-loading">Loading stoppage history...</div>';
    }

    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2ModalTrackStops');
    }

    try {
      const res = await window.CWP_ADMIN_V2.api.request('getStaffMovementHistory', { staffId: staff.staffId });
      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Failed to load movement history');
      }

      if (Array.isArray(res.breadcrumbs) && res.breadcrumbs.length > 1) {
        drawBreadcrumbs(res.breadcrumbs);
      } else {
        clearBreadcrumbs();
        mapState.activeBreadcrumbs = [];
      }

      const stops = Array.isArray(res.stoppages) ? res.stoppages : [];
      if (stops.length === 0) {
        if (contentEl) {
          contentEl.innerHTML = `
            <div class="cwp-v2-empty-state-panel cwp-v2-trk-empty-modal">
              <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">directions_run</span>
              <div class="cwp-v2-empty-state-title">No stoppages recorded today</div>
              <div class="cwp-v2-empty-state-desc">No stationary dwell periods met the stoppage threshold for ${esc(res.date || 'today')}.</div>
            </div>
          `;
        }
        return;
      }

      const rowsHtml = stops.map((s, idx) => {
        const arrived = s.arrivedAt
          ? new Date(s.arrivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : '—';
        const departed = s.departedAt
          ? new Date(s.departedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : (s.isActive ? 'Present Now' : '—');
        const pillClass = s.isActive ? 'is-active' : 'is-departed';
        const pillText = s.isActive ? 'Active Stop' : 'Departed';

        return `
          <tr>
            <td><strong>${idx + 1}</strong></td>
            <td>${esc(s.locationText || 'Field Stop')}</td>
            <td>${esc(arrived)}</td>
            <td>${esc(departed)}</td>
            <td><strong>${esc(s.dwellMinutes ?? 0)} min</strong></td>
            <td><span class="cwp-v2-trk-stop-pill ${pillClass}">${pillText}</span></td>
          </tr>
        `;
      }).join('');

      if (contentEl) {
        contentEl.innerHTML = `
          <div class="cwp-v2-trk-stops-table-wrap">
            <table class="cwp-v2-trk-stops-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Location</th>
                  <th>Arrived</th>
                  <th>Departed</th>
                  <th>Dwell</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;
      }
    } catch (err) {
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="cwp-v2-empty-state-panel cwp-v2-trk-empty-error">
            <span class="material-symbols-outlined cwp-v2-empty-state-icon" aria-hidden="true">error_outline</span>
            <div class="cwp-v2-empty-state-title">Unable to load stoppages</div>
            <div class="cwp-v2-empty-state-desc">${esc(err.message || 'API error')}</div>
          </div>
        `;
      }
    }
  }

  // -------------------------------------------------------------------------
  // DATA LOADING & POLLING
  // -------------------------------------------------------------------------
  async function loadData(isManual = false) {
    if (state.isLoading || !hasAuthToken()) return;
    state.isLoading = true;
    updateConnectionPill(true);

    try {
      const res = await window.CWP_ADMIN_V2.api.request('getStaffTrackingSummary', {});
      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Failed to load tracking summary');
      }

      state.lastError = null;
      state.hasLoadedOnce = true;
      state.lastSyncAt = new Date();
      state.kpis = res.kpis || null;
      state.staffList = Array.isArray(res.staff) ? res.staff : [];
      state.stoppages = Array.isArray(res.stoppages) ? res.stoppages : [];
      state.alerts = Array.isArray(res.alerts) ? res.alerts : [];

      if (state.selectedStaffId && !getStaffById(state.selectedStaffId)) {
        state.selectedStaffId = null;
        renderMapDetailCard(null);
      }

      renderKpis();
      renderRoster();
      renderAlertsPanel();
      updateConnectionPill(false);

      await initMapIfNeeded();
      syncMarkers();

      if (state.selectedStaffId) {
        const selected = getStaffById(state.selectedStaffId);
        if (selected) renderMapDetailCard(selected);
      }

      if (!mapState.hasAutoFittedOnce && state.staffList.some(s => isValidCoord(s.latitude, s.longitude))) {
        fitAllValidMarkers();
        mapState.hasAutoFittedOnce = true;
      }

      if (isManual) {
        showToast('Live staff telemetry refreshed.', 'success');
      }
    } catch (err) {
      state.lastError = err.message || 'Tracking service disconnected';
      updateConnectionPill(false);
      renderKpis();
      renderRoster();
      if (isManual) {
        showToast(state.lastError, 'error');
      }
    } finally {
      state.isLoading = false;
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (state.isActiveTab && document.visibilityState === 'visible' && hasAuthToken()) {
        loadData(false);
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    for (const timer of state.pingPollTimers.values()) {
      clearInterval(timer);
    }
    state.pingPollTimers.clear();
    state.pendingPings.clear();
  }

  // -------------------------------------------------------------------------
  // EVENT BINDINGS & INIT
  // -------------------------------------------------------------------------
  function bindEvents() {
    document.getElementById('v2TrkBtnRefresh')?.addEventListener('click', () => loadData(true));

    document.getElementById('v2TrkAlertsBtn')?.addEventListener('click', e => {
      const panel = document.getElementById('v2TrkAlertPanel');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.getElementById('v2TrkAlertCloseBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('v2TrkAlertPanel');
      if (panel) panel.hidden = true;
      document.getElementById('v2TrkAlertsBtn')?.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('v2TrkAlertList')?.addEventListener('click', e => {
      const ackBtn = e.target.closest('[data-ack-alert-id]');
      if (ackBtn) {
        e.stopPropagation();
        acknowledgeAlert(ackBtn.getAttribute('data-ack-alert-id'));
        return;
      }
      const item = e.target.closest('[data-alert-staff-id]');
      if (item) {
        const sid = item.getAttribute('data-alert-staff-id');
        selectStaff(sid, { source: 'action', centerMap: true });
      }
    });

    const searchInput = document.getElementById('v2TrkSearchInput');
    const searchClear = document.getElementById('v2TrkSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        if (searchClear) searchClear.classList.toggle('is-visible', val.length > 0);
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          renderRoster();
        }, 180);
      });
    }
    searchClear?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.classList.remove('is-visible');
      state.searchQuery = '';
      renderRoster();
    });

    document.querySelectorAll('#v2View_staffTracking [data-trk-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-trk-filter') || 'all';
        state.statusFilter = filter;
        document.querySelectorAll('#v2View_staffTracking [data-trk-filter]').forEach(p => {
          const active = p.getAttribute('data-trk-filter') === filter;
          p.classList.toggle('is-active', active);
          p.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderRoster();
      });
    });

    const rosterList = document.getElementById('v2TrkRosterList');
    if (rosterList) {
      rosterList.addEventListener('click', e => {
        const actionBtn = e.target.closest('[data-trk-action]');
        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.getAttribute('data-trk-action');
          const sid = actionBtn.getAttribute('data-staff-id');
          if (action === 'center') selectStaff(sid, { source: 'list', centerMap: true });
          else if (action === 'ping') pingStaff(sid);
          else if (action === 'stops') openStopsModal(sid);
          return;
        }
        const card = e.target.closest('.cwp-v2-trk-staff-card');
        if (card) {
          const sid = card.getAttribute('data-staff-id');
          selectStaff(sid, { source: 'list', centerMap: true });
        }
      });
    }

    const detailCard = document.getElementById('v2TrkMapDetailCard');
    if (detailCard) {
      detailCard.addEventListener('click', e => {
        const actionBtn = e.target.closest('[data-trk-action]');
        if (!actionBtn) return;
        const action = actionBtn.getAttribute('data-trk-action');
        const sid = actionBtn.getAttribute('data-staff-id');
        if (action === 'center') selectStaff(sid, { source: 'action', centerMap: true });
        else if (action === 'ping') pingStaff(sid);
        else if (action === 'stops') openStopsModal(sid);
      });
    }

    document.getElementById('v2TrkMapZoomIn')?.addEventListener('click', () => {
      if (mapState.engine === 'osm' && mapState.leafletMap) mapState.leafletMap.zoomIn();
      else if (mapState.engine === 'google' && mapState.googleMap) mapState.googleMap.setZoom((mapState.googleMap.getZoom() || 13) + 1);
    });

    document.getElementById('v2TrkMapZoomOut')?.addEventListener('click', () => {
      if (mapState.engine === 'osm' && mapState.leafletMap) mapState.leafletMap.zoomOut();
      else if (mapState.engine === 'google' && mapState.googleMap) mapState.googleMap.setZoom((mapState.googleMap.getZoom() || 13) - 1);
    });

    document.getElementById('v2TrkMapFitAll')?.addEventListener('click', () => fitAllValidMarkers());

    document.getElementById('v2TrkMapCenterSelected')?.addEventListener('click', () => {
      if (!state.selectedStaffId) {
        showToast('Select a staff member first.', 'info');
        return;
      }
      centerMapOnStaff(getStaffById(state.selectedStaffId));
    });

    document.getElementById('v2TrkMapToggleBreadcrumbs')?.addEventListener('click', e => {
      state.showBreadcrumbs = !state.showBreadcrumbs;
      e.currentTarget.classList.toggle('is-active', state.showBreadcrumbs);
      if (state.showBreadcrumbs && mapState.activeBreadcrumbs.length > 1) {
        drawBreadcrumbs(mapState.activeBreadcrumbs);
      } else {
        clearBreadcrumbs();
      }
    });

    document.getElementById('v2TrkMapToggleProvider')?.addEventListener('click', () => {
      if (!mapState.googleApiKey) return;
      const canvas = document.getElementById('v2TrkMapCanvas');
      if (!canvas) return;
      if (mapState.engine === 'google') {
        loadLeafletAssets().then(ok => {
          if (ok && window.L) {
            initOsmEngine(canvas);
            syncMarkers();
            fitAllValidMarkers();
          }
        });
      } else if (window.google && window.google.maps) {
        initGoogleEngine(canvas);
        syncMarkers();
        fitAllValidMarkers();
      }
    });

    document.getElementById('v2TrkMapFullscreen')?.addEventListener('click', e => {
      const view = document.getElementById('v2View_staffTracking');
      if (!view) return;
      const isFs = view.classList.toggle('is-fullscreen');
      const icon = e.currentTarget.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isFs ? 'fullscreen_exit' : 'fullscreen';
      if (mapState.engine === 'osm' && mapState.leafletMap) {
        setTimeout(() => mapState.leafletMap.invalidateSize(), 120);
      }
    });

    document.getElementById('v2TrkStopsClearRouteBtn')?.addEventListener('click', () => {
      clearBreadcrumbs();
      mapState.activeBreadcrumbs = [];
      showToast('Route path cleared from map.', 'info');
    });

    window.addEventListener('online', () => updateConnectionPill(false));
    window.addEventListener('offline', () => updateConnectionPill(false));

    const mapCanvas = document.getElementById('v2TrkMapCanvas');
    if (mapCanvas && typeof ResizeObserver !== 'undefined') {
      let resizeTimer = null;
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (mapState.engine === 'osm' && mapState.leafletMap) {
            try { mapState.leafletMap.invalidateSize(); } catch (e) {}
          } else if (mapState.engine === 'google' && mapState.googleMap && window.google) {
            try { window.google.maps.event.trigger(mapState.googleMap, 'resize'); } catch (e) {}
          }
        }, 100);
      });
      ro.observe(mapCanvas);
    }
  }

  function handleTabActivation(isActive) {
    state.isActiveTab = Boolean(isActive);
    if (state.isActiveTab) {
      if (hasAuthToken()) {
        loadData(false);
        startPolling();
      }
      if (mapState.engine === 'osm' && mapState.leafletMap) {
        setTimeout(() => {
          try { mapState.leafletMap.invalidateSize(); } catch (e) {}
        }, 120);
      }
    } else {
      stopPolling();
      if (window.CWP_ADMIN_V2.overlay) {
        window.CWP_ADMIN_V2.overlay.close('v2ModalTrackStops', { pushHistory: false });
      }
    }
  }

  function init() {
    if (state.initialized) {
      const viewEl = document.getElementById('v2View_staffTracking');
      if (viewEl && viewEl.classList.contains('is-active') && hasAuthToken()) {
        handleTabActivation(true);
      }
      return;
    }
    state.initialized = true;

    bindEvents();

    window.addEventListener('cwp-v2:tab-changed', e => {
      if (!e || !e.detail) return;
      handleTabActivation(e.detail.tab === 'staffTracking');
    });

    const viewEl = document.getElementById('v2View_staffTracking');
    if (viewEl && viewEl.classList.contains('is-active')) {
      handleTabActivation(true);
    }
  }

  window.CWP_ADMIN_V2.trackStaff = {
    init,
    loadData,
    selectStaff,
    clearSelection,
    pingStaff,
    openStopsModal,
    fitAllValidMarkers,
    stopPolling,
    getState: () => state,
    getMapState: () => mapState,
    isValidCoord
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
