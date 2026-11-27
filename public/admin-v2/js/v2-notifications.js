/**
 * CWP Admin V2 Live SSE, Badges & Notification Drawer Controller
 * STRICTLY SCOPED to window.CWP_ADMIN_V2.notifications
 * Connects to GET /api/admin-realtime-stream and queries live /api endpoints
 * for sidebar badges, SSE status pill, and operational notification drawer. Zero mock data.
 */

(function (window) {
  'use strict';

  window.CWP_ADMIN_V2 = window.CWP_ADMIN_V2 || {};

  let sseSource = null;
  let reconnectTimer = null;
  let pulseTimer = null;
  let badgeDebounceTimer = null;
  let initialized = false;
  let active = false;
  let auditLogsUnsupported = false;

  const STORAGE_KEY_SOUND_MUTED = 'cwp_admin_sound_muted';
  const STORAGE_KEY_LAST_SOUND = 'cwp_admin_last_sound_evt';
  const CHANNEL_NAME = 'cwp_admin_realtime_alerts';

  let soundMuted = false;
  try {
    soundMuted = localStorage.getItem(STORAGE_KEY_SOUND_MUTED) === 'true';
  } catch (e) {}

  let audioCtx = null;
  let audioUnlocked = false;
  let lastSoundTime = 0;
  const processedEventIds = new Set();
  let alertBroadcastChannel = null;

  const activityState = {
    cleanReportsUnread: 0,
    specialJobsUnread: 0
  };

  const state = {
    sseStatus: 'offline', // 'live' | 'reconnecting' | 'offline'
    lastSyncAt: null,
    sseEvents: [],
    liveFeedItems: [],
    readIds: new Set(),
    unreadCount: 0,
    feedError: null,
    snapshots: {
      customers: null,
      leads: null,
      staff: null,
      cleanReports: null,
      specialJobs: null,
      assignments: null,
      tracking: null,
      routes: null,
      unassignedVehicles: null,
      auditLogs: null
    }
  };

  function formatIstTime(dateVal) {
    try {
      const d = dateVal instanceof Date ? dateVal : new Date(dateVal || Date.now());
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '--:--';
    }
  }

  function updateSsePillUI() {
    const pill = document.getElementById('v2SseStatusPill');
    const label = document.getElementById('v2SseStatusLabel');
    const popStatus = document.getElementById('v2SyncPopoverStatus');
    const popTime = document.getElementById('v2LastSyncTime');

    if (pill) {
      pill.classList.remove('is-reconnecting', 'is-offline');
      if (state.sseStatus === 'reconnecting') pill.classList.add('is-reconnecting');
      if (state.sseStatus === 'offline') pill.classList.add('is-offline');
    }

    const labelText = state.sseStatus === 'live'
      ? 'Live SSE'
      : (state.sseStatus === 'reconnecting' ? 'Reconnecting' : 'Offline');

    if (label) label.textContent = labelText;
    if (popStatus) popStatus.textContent = labelText;
    if (popTime) {
      popTime.textContent = state.lastSyncAt ? formatIstTime(state.lastSyncAt) : 'Not synced yet';
    }
  }

  function setNavBadge(badgeId, value) {
    const el = document.getElementById(badgeId);
    if (!el) return;
    if (value === null || value === undefined || value === '') {
      el.textContent = '—';
      return;
    }
    el.textContent = String(value);
  }

  function formatCapCount(count, cap) {
    if (typeof count !== 'number' || Number.isNaN(count)) return '—';
    if (cap && count >= cap) return `${cap}+`;
    return String(count);
  }

  async function refreshBadges() {
    const api = window.CWP_ADMIN_V2.api;
    const auth = window.CWP_ADMIN_V2.auth;
    if (!api || !auth || !auth.getToken()) return;

    const results = await Promise.allSettled([
      api.request('getAllCustomers', {}),
      api.request('getLeads', {}),
      api.request('getStaffList', {}),
      api.request('getDailyCleanReports', {}),
      api.request('getSpecialJobs', {}),
      api.request('getDailyCleanAssignments', {}),
      api.request('getStaffTrackingSummary', {}),
      api.request('getUnassignedDccVehicles', {}),
      api.request('getAllRoutes', {})
    ]);

    if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
      const custs = results[0].value;
      state.snapshots.customers = custs;
      setNavBadge('v2BadgeRecords', formatCapCount(custs.length, 500));
      const serviceCount = custs.filter(c => {
        const activeFlag = c.active !== false && c.active !== 'No' && c.active !== 'Inactive';
        const hasCategory = c.serviceCategory && String(c.serviceCategory).toLowerCase() !== 'none';
        return activeFlag && (hasCategory || c.category || c.serviceType || c.vehicle || c.carNo);
      }).length;
      setNavBadge('v2BadgeServiceAssign', String(serviceCount));
    }

    if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
      const leads = results[1].value;
      state.snapshots.leads = leads;
      setNavBadge('v2BadgeLeads', formatCapCount(leads.length, 500));
    }

    if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
      const staff = results[2].value;
      state.snapshots.staff = staff;
      const activeStaff = staff.filter(s => s.active !== false && s.active !== 'No' && s.active !== 'Inactive').length;
      setNavBadge('v2BadgeStaff', String(activeStaff));
    }

    if (results[3].status === 'fulfilled' && results[3].value) {
      const cleanData = results[3].value;
      state.snapshots.cleanReports = cleanData;
      const totalCleaned = cleanData.summary && typeof cleanData.summary.totalCleaned === 'number'
        ? cleanData.summary.totalCleaned
        : (Array.isArray(cleanData.records) ? cleanData.records.length : 0);
      setNavBadge('v2BadgeCleanReports', String(totalCleaned));
      const crBadgeEl = document.getElementById('v2BadgeCleanReports');
      if (crBadgeEl) crBadgeEl.title = `${totalCleaned} daily cleans completed today`;
    }

    if (results[4].status === 'fulfilled' && results[4].value) {
      const jobsData = results[4].value;
      const jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : (Array.isArray(jobsData) ? jobsData : []);
      state.snapshots.specialJobs = jobs;
      const getIstKey = (dt) => {
        try {
          if (!dt) return '';
          const d = new Date(dt);
          if (isNaN(d.getTime())) return '';
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).formatToParts(d);
          const y = parts.find(p => p.type === 'year')?.value;
          const m = parts.find(p => p.type === 'month')?.value;
          const day = parts.find(p => p.type === 'day')?.value;
          return y && m && day ? `${y}-${m}-${day}` : '';
        } catch (e) {
          return '';
        }
      };
      const todayKey = getIstKey(new Date());
      const todayJobs = jobs.filter(j => {
        const sDate = j.scheduledDate || j.scheduled_date;
        let key = '';
        if (sDate) {
          key = (typeof sDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sDate.trim()))
            ? sDate.trim()
            : getIstKey(sDate);
        }
        if (!key) {
          key = getIstKey(j.assignedAt || j.assigned_at || j.createdAt || j.created_at);
        }
        return key === todayKey;
      }).length;
      setNavBadge('v2BadgeSpecialJobs', String(todayJobs));
      const sjBadgeEl = document.getElementById('v2BadgeSpecialJobs');
      if (sjBadgeEl) sjBadgeEl.title = `${todayJobs} service jobs for Today`;
    }

    if (results[5].status === 'fulfilled' && results[5].value) {
      const assignData = results[5].value;
      state.snapshots.assignments = assignData;
      const list = Array.isArray(assignData.assignments) ? assignData.assignments : [];
      setNavBadge('v2BadgeJobAssignment', String(list.length));
    }

    if (results[6].status === 'fulfilled' && results[6].value) {
      const trackData = results[6].value;
      state.snapshots.tracking = trackData;
      const activeCount = trackData.kpis && typeof trackData.kpis.activeStaffCount === 'number'
        ? trackData.kpis.activeStaffCount
        : (Array.isArray(trackData.staff) ? trackData.staff.length : 0);
      setNavBadge('v2BadgeStaffTracking', String(activeCount));
    }

    const routesRes = results[8].status === 'fulfilled' ? results[8].value : null;
    if (routesRes) {
      const routes = Array.isArray(routesRes) ? routesRes : (Array.isArray(routesRes.routes) ? routesRes.routes : []);
      state.snapshots.routes = routes;
      const unassignedRes = results[7].status === 'fulfilled' ? results[7].value : null;
      const unassignedList = unassignedRes && Array.isArray(unassignedRes.unassigned)
        ? unassignedRes.unassigned
        : (unassignedRes && Array.isArray(unassignedRes.vehicles) ? unassignedRes.vehicles : []);
      state.snapshots.unassignedVehicles = unassignedList;
      setNavBadge('v2BadgeSequence', String(routes.length));
    }

    state.lastSyncAt = new Date();
    updateSsePillUI();
    window.dispatchEvent(new CustomEvent('cwp-v2:live-data-updated', { detail: { snapshots: state.snapshots } }));
  }

  function scheduleBadgeRefresh() {
    if (badgeDebounceTimer) clearTimeout(badgeDebounceTimer);
    badgeDebounceTimer = setTimeout(() => {
      refreshBadges().catch(() => {});
    }, 350);
  }

  function pushSseEventItem(evtType, payload = {}) {
    const id = payload.eventId || `sse_${evtType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let title = evtType;
    let subtitle = 'Live server operational update';
    let tab = 'dashboard';
    let icon = 'bolt';

    if (evtType === 'CUSTOMERS_CHANGED') {
      title = 'Customer records updated';
      subtitle = 'Customer directory synchronized via live SSE';
      tab = 'records';
      icon = 'folder_shared';
    } else if (evtType === 'DAILY_CLEAN_CHANGED') {
      const staff = payload.staffName || payload.staffCode || payload.staffId || 'Staff';
      const cust = payload.customerName || '';
      const veh = payload.vehicleNumber || '';
      const isCnp = payload.action === 'car_not_present' || payload.isCarNotPresent;
      const act = isCnp ? 'Exception: Car not present' : (payload.action === 'completed' ? 'Cleaned' : (payload.action || 'Updated'));
      title = `Daily clean: ${act}`;
      subtitle = [staff, cust, veh].filter(Boolean).join(' • ') || 'Daily cleaning status changed';
      tab = 'cleanReports';
      icon = 'directions_car';
    } else if (evtType === 'SPECIAL_JOB_CHANGED') {
      const staff = payload.staffName || payload.staffCode || payload.staffId || 'Staff';
      const svc = payload.serviceName || 'Special job';
      const cust = payload.customerName || '';
      const act = payload.action ? payload.action.toUpperCase() : 'UPDATED';
      title = `${svc} (${act})`;
      subtitle = [staff, cust, payload.vehicleNumber].filter(Boolean).join(' • ') || 'Special service job updated';
      tab = 'specialJobs';
      icon = 'solar_power';
    } else if (evtType === 'CUSTOMER_ASSIGNMENT_CHANGED') {
      title = 'Assignment updated';
      subtitle = [payload && payload.action, payload && payload.staffId].filter(Boolean).join(' • ') || 'Route/customer assignment updated';
      tab = 'jobAssignment';
      icon = 'assignment_add';
    }

    state.sseEvents.unshift({
      id,
      source: 'SSE',
      title,
      subtitle,
      tab,
      icon,
      timestamp: payload.timestamp || new Date().toISOString()
    });
    if (state.sseEvents.length > 30) state.sseEvents.length = 30;
    recomputeUnreadCount();
    renderDrawerContent();
  }

  function initBroadcastChannel() {
    if (typeof window.BroadcastChannel === 'function') {
      try {
        alertBroadcastChannel = new window.BroadcastChannel(CHANNEL_NAME);
        alertBroadcastChannel.onmessage = (e) => {
          if (!e || !e.data) return;
          const msg = e.data;
          if (msg.type === 'SOUND_PLAYED' && msg.eventId) {
            processedEventIds.add(msg.eventId);
            lastSoundTime = Date.now();
          } else if (msg.type === 'ACK_TAB' && msg.tab) {
            clearTabAttention(msg.tab, { fromBroadcast: true });
          } else if (msg.type === 'MUTE_TOGGLED') {
            soundMuted = Boolean(msg.muted);
            updateSoundToggleUI();
          }
        };
      } catch (err) {
        alertBroadcastChannel = null;
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_SOUND_MUTED) {
        soundMuted = e.newValue === 'true';
        updateSoundToggleUI();
      } else if (e.key === 'cwp_admin_ack_tab' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed.tab) {
            clearTabAttention(parsed.tab, { fromBroadcast: true });
          }
        } catch (err) {}
      }
    });
  }

  function unlockAudio() {
    if (audioUnlocked && audioCtx && audioCtx.state === 'running') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) {
        audioCtx = new AudioCtx();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      audioUnlocked = true;
    } catch (e) {}
  }

  function setupAudioUnlockListeners() {
    const unlockHandler = () => {
      unlockAudio();
      ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(evt => {
        window.removeEventListener(evt, unlockHandler, { capture: true });
      });
    };
    ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, unlockHandler, { capture: true, once: true });
    });
  }

  function playNotificationChime(eventId) {
    if (soundMuted) return;

    const now = Date.now();
    if (now - lastSoundTime < 800) return;

    try {
      const lastSoundStr = localStorage.getItem(STORAGE_KEY_LAST_SOUND);
      if (lastSoundStr) {
        const lastSound = JSON.parse(lastSoundStr);
        if (lastSound && lastSound.eventId === eventId && (now - lastSound.time < 5000)) {
          return;
        }
      }
    } catch (e) {}

    unlockAudio();
    if (!audioCtx) return;

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const startTime = audioCtx.currentTime;
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      const gain2 = audioCtx.createGain();
      const masterGain = audioCtx.createGain();

      masterGain.gain.setValueAtTime(0.22, startTime);
      masterGain.connect(audioCtx.destination);

      // Tone 1: D5 (587.33Hz), smooth sine
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, startTime);
      gain1.gain.setValueAtTime(0.001, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.7, startTime + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(startTime);
      osc1.stop(startTime + 0.18);

      // Tone 2: A5 (880.00Hz), smooth crescendo
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, startTime + 0.10);
      gain2.gain.setValueAtTime(0.001, startTime + 0.10);
      gain2.gain.exponentialRampToValueAtTime(0.9, startTime + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(startTime + 0.10);
      osc2.stop(startTime + 0.40);

      lastSoundTime = now;

      if (alertBroadcastChannel) {
        alertBroadcastChannel.postMessage({ type: 'SOUND_PLAYED', eventId, time: now });
      }
      try {
        localStorage.setItem(STORAGE_KEY_LAST_SOUND, JSON.stringify({ eventId, time: now }));
      } catch (e) {}
    } catch (err) {
      console.warn('[Realtime Alert] Sound playback error:', err.message);
    }
  }

  function updateSoundToggleUI() {
    const btn = document.getElementById('v2SoundToggleBtn');
    const icon = document.getElementById('v2SoundToggleIcon');
    if (!btn || !icon) return;

    if (soundMuted) {
      icon.textContent = 'volume_off';
      btn.setAttribute('aria-label', 'Unmute notification sounds');
      btn.title = 'Notification sounds: Muted (Click to unmute)';
      btn.classList.add('is-muted');
    } else {
      icon.textContent = 'volume_up';
      btn.setAttribute('aria-label', 'Mute notification sounds');
      btn.title = 'Notification sounds: On (Click to mute)';
      btn.classList.remove('is-muted');
    }
  }

  function toggleSoundMute() {
    soundMuted = !soundMuted;
    try {
      localStorage.setItem(STORAGE_KEY_SOUND_MUTED, String(soundMuted));
    } catch (e) {}
    updateSoundToggleUI();
    if (!soundMuted) {
      unlockAudio();
    }
    if (alertBroadcastChannel) {
      alertBroadcastChannel.postMessage({ type: 'MUTE_TOGGLED', muted: soundMuted });
    }
    if (window.CWP_ADMIN_V2.toast) {
      window.CWP_ADMIN_V2.toast.show(
        soundMuted ? 'Notification sounds muted.' : 'Notification sounds enabled.',
        'info',
        2000
      );
    }
  }

  function updateSidebarAlertUI(tab) {
    if (tab === 'cleanReports') {
      const btn = document.getElementById('v2NavBtnCleanReports');
      const badge = document.getElementById('v2AlertCleanReports');
      const count = activityState.cleanReportsUnread;
      if (btn) {
        btn.classList.toggle('has-unread-activity', count > 0);
      }
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.hidden = false;
        } else {
          badge.textContent = '0';
          badge.hidden = true;
        }
      }
    } else if (tab === 'specialJobs') {
      const btn = document.getElementById('v2NavBtnSpecialJobs');
      const badge = document.getElementById('v2AlertSpecialJobs');
      const count = activityState.specialJobsUnread;
      if (btn) {
        btn.classList.toggle('has-unread-activity', count > 0);
      }
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.hidden = false;
        } else {
          badge.textContent = '0';
          badge.hidden = true;
        }
      }
    }
  }

  function incrementTabAttention(tab) {
    if (tab === 'cleanReports') {
      activityState.cleanReportsUnread++;
      updateSidebarAlertUI('cleanReports');
    } else if (tab === 'specialJobs') {
      activityState.specialJobsUnread++;
      updateSidebarAlertUI('specialJobs');
    }
  }

  function clearTabAttention(tab, opts = {}) {
    if (tab === 'cleanReports') {
      if (activityState.cleanReportsUnread > 0) {
        activityState.cleanReportsUnread = 0;
        updateSidebarAlertUI('cleanReports');
        if (!opts.fromBroadcast) {
          if (alertBroadcastChannel) {
            alertBroadcastChannel.postMessage({ type: 'ACK_TAB', tab: 'cleanReports' });
          }
          try {
            localStorage.setItem('cwp_admin_ack_tab', JSON.stringify({ tab: 'cleanReports', time: Date.now() }));
          } catch (e) {}
        }
      }
    } else if (tab === 'specialJobs') {
      if (activityState.specialJobsUnread > 0) {
        activityState.specialJobsUnread = 0;
        updateSidebarAlertUI('specialJobs');
        if (!opts.fromBroadcast) {
          if (alertBroadcastChannel) {
            alertBroadcastChannel.postMessage({ type: 'ACK_TAB', tab: 'specialJobs' });
          }
          try {
            localStorage.setItem('cwp_admin_ack_tab', JSON.stringify({ tab: 'specialJobs', time: Date.now() }));
          } catch (e) {}
        }
      }
    }
  }

  function handleRealtimeActivityAlert(evtType, data = {}) {
    if (!data) return;
    if (data.idempotent === true || data.isReplay === true) return;

    const eventId = data.eventId || `evt_${data.recordId || data.reportId || data.jobId || Date.now()}_${data.action || ''}`;
    if (processedEventIds.has(eventId)) {
      return;
    }
    processedEventIds.add(eventId);
    if (processedEventIds.size > 200) {
      const first = processedEventIds.values().next().value;
      processedEventIds.delete(first);
    }

    const action = String(data.action || '').toLowerCase();
    const staffName = data.staffName || 'Staff Member';
    const customerName = data.customerName || '';
    const vehicleNumber = data.vehicleNumber || '';
    const timeText = data.timestamp ? formatIstTime(data.timestamp) : formatIstTime(new Date());

    let isQualifying = false;
    let toastTitle = '';
    let actionText = '';
    let actionLabel = '';
    let categoryLabel = '';
    let targetTab = '';
    let iconName = '';

    if (evtType === 'DAILY_CLEAN_CHANGED') {
      targetTab = 'cleanReports';
      categoryLabel = 'Daily Cleaning';
      iconName = 'directions_car';

      if (action === 'completed' || action === 'recorded') {
        isQualifying = true;
        toastTitle = 'Daily Cleaning Completed';
        actionText = `${staffName} completed cleaning.`;
        actionLabel = 'Completed';
      } else if (action === 'car_not_present' || action === 'customer_absent') {
        isQualifying = true;
        toastTitle = 'Daily Cleaning Exception';
        actionText = `${staffName} reported car not present.`;
        actionLabel = 'Car Not Present';
      } else if (action === 'updated') {
        isQualifying = true;
        toastTitle = 'Daily Clean Status Updated';
        actionText = `${staffName} updated cleaning record status.`;
        actionLabel = data.status || 'Updated';
      }
    } else if (evtType === 'SPECIAL_JOB_CHANGED') {
      targetTab = 'specialJobs';
      categoryLabel = 'Other Cleaning';
      iconName = 'solar_power';
      const svcName = data.serviceName || 'Special Job';

      if (action === 'started') {
        isQualifying = true;
        toastTitle = 'Other Cleaning Started';
        actionText = `${staffName} started ${svcName}.`;
        actionLabel = 'In Progress';
      } else if (action === 'completed') {
        isQualifying = true;
        toastTitle = 'Other Cleaning Completed';
        actionText = `${staffName} completed ${svcName}.`;
        actionLabel = 'Completed';
      } else if (action === 'failed' || action === 'unable_to_complete' || action === 'no_show') {
        isQualifying = true;
        toastTitle = 'Other Cleaning Issue';
        actionText = `${staffName} reported job unable to complete${data.reason ? ': ' + data.reason : '.'}`;
        actionLabel = 'Failed / Exception';
      } else if (action === 'cancelled') {
        isQualifying = true;
        toastTitle = 'Other Cleaning Cancelled';
        actionText = `Job was cancelled${data.reason ? ': ' + data.reason : '.'}`;
        actionLabel = 'Cancelled';
      }
    }

    if (!isQualifying) return;

    // 1. Short Notification Sound
    playNotificationChime(eventId);

    // 2. Persistent Sidebar Attention (Glow + Unread Count)
    const currentTab = window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.getActiveTab === 'function'
      ? window.CWP_ADMIN_V2.shell.getActiveTab()
      : null;

    if (targetTab !== currentTab) {
      incrementTabAttention(targetTab);
    }

    // 3. Live Toast Notification
    if (window.CWP_ADMIN_V2.toast && typeof window.CWP_ADMIN_V2.toast.showActivity === 'function') {
      window.CWP_ADMIN_V2.toast.showActivity({
        title: toastTitle,
        actionText: actionText,
        actionLabel: actionLabel,
        categoryLabel: categoryLabel,
        customerName: customerName,
        vehicleNumber: vehicleNumber,
        serviceName: data.serviceName || (evtType === 'DAILY_CLEAN_CHANGED' ? 'Daily Car Cleaning' : 'Other Cleaning'),
        timeText: timeText,
        icon: iconName,
        targetTab: targetTab,
        onNavigate: () => {
          if (window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.navigateTo === 'function') {
            window.CWP_ADMIN_V2.shell.navigateTo(targetTab);
          }
        }
      }, { duration: 7000 });
    }
  }

  async function refreshNotificationFeed() {
    const api = window.CWP_ADMIN_V2.api;
    const auth = window.CWP_ADMIN_V2.auth;
    if (!api || !auth || !auth.getToken()) return;

    state.feedError = null;
    try {
      let user = typeof auth.getUser === 'function' ? auth.getUser() : null;
      if ((!user || !user.storageMode) && typeof auth.checkSession === 'function' && !auditLogsUnsupported) {
        const sessCheck = await auth.checkSession();
        if (sessCheck && sessCheck.expired) return;
        user = typeof auth.getUser === 'function' ? auth.getUser() : user;
      }
      const canQueryAuditLogs = !auditLogsUnsupported && !(user && user.storageMode === 'local');

      const items = [];
      const [auditRes, cleanRes, jobsRes, leadsRes] = await Promise.allSettled([
        canQueryAuditLogs ? api.request('getAuditLogs', { limit: 15 }) : Promise.resolve(null),
        state.snapshots.cleanReports ? Promise.resolve(state.snapshots.cleanReports) : api.request('getDailyCleanReports', {}),
        state.snapshots.specialJobs ? Promise.resolve({ jobs: state.snapshots.specialJobs }) : api.request('getSpecialJobs', {}),
        state.snapshots.leads ? Promise.resolve(state.snapshots.leads) : api.request('getLeads', {})
      ]);

      if (auditRes.status === 'rejected') {
        const errObj = auditRes.reason || {};
        const msg = String(errObj.message || '');
        if (errObj.status === 400 || msg.includes('DATABASE_URL')) {
          auditLogsUnsupported = true;
        }
      }

      if (auditRes.status === 'fulfilled' && auditRes.value && Array.isArray(auditRes.value.logs)) {
        state.snapshots.auditLogs = auditRes.value.logs;
        auditRes.value.logs.slice(0, 8).forEach(log => {
          const entity = String(log.entity_type || log.entityType || '').toLowerCase();
          let tab = 'dashboard';
          if (entity.includes('customer')) tab = 'records';
          else if (entity.includes('lead')) tab = 'leads';
          else if (entity.includes('staff')) tab = 'staff';
          else if (entity.includes('job')) tab = 'specialJobs';
          else if (entity.includes('route')) tab = 'sequence';

          items.push({
            id: `audit_${log.id || log.created_at || Math.random()}`,
            source: 'Audit',
            title: log.action || log.summary || 'Admin audit event',
            subtitle: [log.changed_by || log.actor_name || log.actor || 'admin', log.entity_type || log.entityType].filter(Boolean).join(' • '),
            tab,
            icon: 'history',
            timestamp: log.created_at || log.timestamp || ''
          });
        });
      }

      if (cleanRes.status === 'fulfilled' && cleanRes.value && cleanRes.value.summary) {
        const sum = cleanRes.value.summary;
        if (sum.withoutPhotoCount > 0) {
          items.push({
            id: `clean_nophoto_${sum.withoutPhotoCount}`,
            source: 'Daily Clean',
            title: `${sum.withoutPhotoCount} clean report(s) without proof photo`,
            subtitle: `${sum.totalCleaned || 0} cleaned today • ${sum.photoRate || 0}% photo rate`,
            tab: 'cleanReports',
            icon: 'photo_camera',
            timestamp: sum.latestPunchTime || ''
          });
        }
      }

      if (jobsRes.status === 'fulfilled' && jobsRes.value) {
        const jobs = Array.isArray(jobsRes.value.jobs) ? jobsRes.value.jobs : [];
        const unassigned = jobs.filter(j => !j.staffId && !j.staff_id && String(j.status || '').toLowerCase() === 'pending');
        if (unassigned.length > 0) {
          items.push({
            id: `jobs_unassigned_${unassigned.length}`,
            source: 'Special Jobs',
            title: `${unassigned.length} pending special job(s) awaiting staff`,
            subtitle: 'Assign staff in Other Cleaning Status',
            tab: 'specialJobs',
            icon: 'solar_power',
            timestamp: ''
          });
        }
      }

      if (leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) && leadsRes.value.length > 0) {
        items.push({
          id: `leads_total_${leadsRes.value.length}`,
          source: 'Leads',
          title: `${leadsRes.value.length} active lead(s) in pipeline`,
          subtitle: 'Review and convert leads in Leads tab',
          tab: 'leads',
          icon: 'contact_mail',
          timestamp: ''
        });
      }

      state.liveFeedItems = items;
      recomputeUnreadCount();
      renderDrawerContent();
    } catch (err) {
      state.feedError = err.message || 'Unable to load notifications.';
      renderDrawerContent();
    }
  }

  function getCombinedNotifications() {
    return state.sseEvents.concat(state.liveFeedItems);
  }

  function recomputeUnreadCount() {
    const combined = getCombinedNotifications();
    state.unreadCount = combined.filter(item => !state.readIds.has(item.id)).length;
    const badgeEl = document.getElementById('v2NotifUnreadBadge');
    if (badgeEl) {
      if (state.unreadCount > 0) {
        badgeEl.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
        badgeEl.hidden = false;
      } else {
        badgeEl.textContent = '0';
        badgeEl.hidden = true;
      }
    }
  }

  function markAllRead() {
    getCombinedNotifications().forEach(item => state.readIds.add(item.id));
    recomputeUnreadCount();
    renderDrawerContent();
  }

  function renderDrawerContent() {
    const listEl = document.getElementById('v2NotificationsList');
    if (!listEl) return;
    const ui = window.CWP_ADMIN_V2.ui;
    const esc = ui ? ui.escapeHtml : (v => String(v || ''));

    if (state.feedError) {
      if (ui) {
        ui.renderErrorState(listEl, {
          title: 'Notification sync error',
          message: state.feedError,
          onRetry: () => syncNow()
        });
      }
      return;
    }

    const items = getCombinedNotifications();
    if (items.length === 0) {
      if (ui) {
        ui.renderEmptyState(listEl, {
          icon: 'notifications_none',
          title: 'All caught up',
          description: 'Live SSE operational events and audit alerts will appear here.'
        });
      }
      return;
    }

    listEl.innerHTML = items.map(item => {
      const unread = !state.readIds.has(item.id);
      const timeLabel = item.timestamp ? formatIstTime(item.timestamp) : item.source;
      return `
        <button type="button" class="cwp-v2-notif-item${unread ? ' is-unread' : ''}" data-notif-id="${esc(item.id)}" data-notif-tab="${esc(item.tab)}">
          <span class="material-symbols-outlined" aria-hidden="true" style="color:var(--cwp-v2-sys-primary); font-size:20px; margin-top:2px;">${esc(item.icon || 'notifications')}</span>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:baseline;">
              <strong style="font-size:13px; color:var(--cwp-v2-sys-on-surface);">${esc(item.title)}</strong>
              <span style="font-size:10.5px; color:var(--cwp-v2-sys-on-surface-muted); flex-shrink:0;">${esc(timeLabel)}</span>
            </div>
            <div style="font-size:12px; color:var(--cwp-v2-sys-on-surface-variant); margin-top:2px;">${esc(item.subtitle)}</div>
          </div>
        </button>
      `;
    }).join('');
  }

  function connectSse() {
    if (!active) return;
    const auth = window.CWP_ADMIN_V2.auth;
    const token = auth ? auth.getToken() : '';
    if (!token) {
      state.sseStatus = 'offline';
      updateSsePillUI();
      return;
    }

    if (typeof window.EventSource !== 'function') {
      state.sseStatus = 'offline';
      updateSsePillUI();
      return;
    }

    if (sseSource) {
      try { sseSource.close(); } catch (e) {}
      sseSource = null;
    }

    try {
      const url = '/api/admin-realtime-stream';
      sseSource = new window.EventSource(url, { withCredentials: true });

      sseSource.onopen = () => {
        state.sseStatus = 'live';
        state.lastSyncAt = new Date();
        updateSsePillUI();
      };

      sseSource.onmessage = (event) => {
        if (!event || !event.data) return;
        let msg = null;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (!msg || !msg.type) return;

        state.lastSyncAt = new Date();
        if (msg.type === 'CONNECTED') {
          state.sseStatus = 'live';
          updateSsePillUI();
          return;
        }
        if (msg.type === 'PING') {
          state.sseStatus = 'live';
          updateSsePillUI();
          return;
        }

        if (
          msg.type === 'CUSTOMERS_CHANGED' ||
          msg.type === 'DAILY_CLEAN_CHANGED' ||
          msg.type === 'SPECIAL_JOB_CHANGED' ||
          msg.type === 'CUSTOMER_ASSIGNMENT_CHANGED'
        ) {
          if (window.CWP_ADMIN_V2.search && (msg.type === 'CUSTOMERS_CHANGED' || msg.type === 'SPECIAL_JOB_CHANGED')) {
            window.CWP_ADMIN_V2.search.invalidateCache();
          }
          pushSseEventItem(msg.type, msg.data || {});
          scheduleBadgeRefresh();
          updateSsePillUI();
          handleRealtimeActivityAlert(msg.type, msg.data || {});
        }
      };

      sseSource.onerror = () => {
        if (sseSource) {
          try { sseSource.close(); } catch (e) {}
          sseSource = null;
        }
        if (!active || !auth.getToken()) {
          state.sseStatus = 'offline';
          updateSsePillUI();
          return;
        }
        state.sseStatus = 'reconnecting';
        updateSsePillUI();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (active) connectSse();
        }, 5000);
      };
    } catch (err) {
      state.sseStatus = 'offline';
      updateSsePillUI();
    }
  }

  async function syncNow() {
    await Promise.allSettled([refreshBadges(), refreshNotificationFeed()]);
  }

  function start() {
    active = true;
    connectSse();
    syncNow().catch(() => {});

    if (pulseTimer) clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      if (!active) return;
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      refreshBadges().catch(() => {});
    }, 15000);
  }

  function stop() {
    active = false;
    auditLogsUnsupported = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pulseTimer) {
      clearInterval(pulseTimer);
      pulseTimer = null;
    }
    if (badgeDebounceTimer) {
      clearTimeout(badgeDebounceTimer);
      badgeDebounceTimer = null;
    }
    if (sseSource) {
      try { sseSource.close(); } catch (e) {}
      sseSource = null;
    }
    state.sseStatus = 'offline';
    state.sseEvents = [];
    state.liveFeedItems = [];
    state.readIds.clear();
    recomputeUnreadCount();
    updateSsePillUI();
  }

  function openDrawer(triggerEl) {
    renderDrawerContent();
    if (window.CWP_ADMIN_V2.overlay) {
      window.CWP_ADMIN_V2.overlay.open('v2NotificationsDrawer', {
        triggerEl: triggerEl || document.getElementById('v2NotificationsBtn')
      });
    }
    refreshNotificationFeed().catch(() => {});
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const notifBtn = document.getElementById('v2NotificationsBtn');
    const markAllBtn = document.getElementById('v2NotifMarkAllReadBtn');
    const drawerRefreshBtn = document.getElementById('v2NotifRefreshBtn');
    const listEl = document.getElementById('v2NotificationsList');
    const ssePill = document.getElementById('v2SseStatusPill');
    const syncPopover = document.getElementById('v2SyncPopover');
    const syncNowBtn = document.getElementById('v2SyncNowBtn');

    if (notifBtn) {
      notifBtn.addEventListener('click', () => openDrawer(notifBtn));
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', markAllRead);
    }

    if (drawerRefreshBtn) {
      drawerRefreshBtn.addEventListener('click', () => {
        const api = window.CWP_ADMIN_V2.api;
        if (api) api.withLoadingButton(drawerRefreshBtn, syncNow);
        else syncNow();
      });
    }

    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.cwp-v2-notif-item');
        if (!btn) return;
        const notifId = btn.getAttribute('data-notif-id');
        const targetTab = btn.getAttribute('data-notif-tab');
        if (notifId) {
          state.readIds.add(notifId);
          recomputeUnreadCount();
          renderDrawerContent();
        }
        const currentTab = window.CWP_ADMIN_V2.shell && typeof window.CWP_ADMIN_V2.shell.getActiveTab === 'function'
          ? window.CWP_ADMIN_V2.shell.getActiveTab()
          : null;
        if (targetTab && window.CWP_ADMIN_V2.shell && targetTab !== currentTab) {
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2NotificationsDrawer', { skipHistoryBack: true });
          }
          window.CWP_ADMIN_V2.shell.navigateTo(targetTab, { replace: true });
        } else {
          if (window.CWP_ADMIN_V2.overlay) {
            window.CWP_ADMIN_V2.overlay.close('v2NotificationsDrawer');
          }
        }
      });
    }

    if (ssePill && syncPopover) {
      ssePill.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextOpen = syncPopover.hidden;
        syncPopover.hidden = !nextOpen;
        ssePill.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#v2SyncPopoverWrap')) {
          syncPopover.hidden = true;
          ssePill.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', () => {
        const api = window.CWP_ADMIN_V2.api;
        if (api) {
          api.withLoadingButton(syncNowBtn, syncNow).then(() => {
            if (window.CWP_ADMIN_V2.toast) {
              window.CWP_ADMIN_V2.toast.show('Live operational metrics synchronized.', 'success', 2400);
            }
          }).catch(() => {});
        } else {
          syncNow();
        }
      });
    }

    window.addEventListener('cwp-v2:tab-changed', (e) => {
      const tab = e.detail && e.detail.tab;
      if (tab === 'cleanReports' || tab === 'specialJobs') {
        clearTabAttention(tab);
      }
    });

    const cleanReportsNavBtn = document.getElementById('v2NavBtnCleanReports');
    if (cleanReportsNavBtn) {
      cleanReportsNavBtn.addEventListener('click', () => clearTabAttention('cleanReports'));
    }

    const specialJobsNavBtn = document.getElementById('v2NavBtnSpecialJobs');
    if (specialJobsNavBtn) {
      specialJobsNavBtn.addEventListener('click', () => clearTabAttention('specialJobs'));
    }

    const soundBtn = document.getElementById('v2SoundToggleBtn');
    if (soundBtn) {
      soundBtn.addEventListener('click', toggleSoundMute);
    }

    initBroadcastChannel();
    setupAudioUnlockListeners();
    updateSoundToggleUI();
    updateSidebarAlertUI('cleanReports');
    updateSidebarAlertUI('specialJobs');
    updateSsePillUI();
  }

  window.CWP_ADMIN_V2.notifications = {
    init,
    start,
    stop,
    syncNow,
    refreshBadges,
    openDrawer,
    markAllRead,
    toggleSoundMute,
    isSoundMuted: () => soundMuted,
    playNotificationChime,
    handleRealtimeActivityAlert,
    clearTabAttention,
    getActivityState: () => ({ ...activityState }),
    getState: () => ({
      sseStatus: state.sseStatus,
      lastSyncAt: state.lastSyncAt,
      unreadCount: state.unreadCount,
      snapshots: state.snapshots,
      soundMuted,
      activityState: { ...activityState }
    })
  };
})(window);
