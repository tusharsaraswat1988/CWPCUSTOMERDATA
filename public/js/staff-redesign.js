/* Staff-only layout and presentation adapter. Operational actions remain in app.js. */
(function () {
  'use strict';

  var body = document.body;
  if (!body || !body.classList.contains('staff-mode-active')) return;

  var pictographs;
  try { pictographs = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/gu; }
  catch (error) { pictographs = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu; }

  function cleanText(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var clean = node.nodeValue.replace(pictographs, '').replace(/[\u200D\uFE0E\uFE0F]/g, '');
      if (clean !== node.nodeValue) node.nodeValue = clean;
    });
    root.querySelectorAll('.material-symbols-outlined').forEach(function (icon) {
      if (!icon.textContent.trim()) icon.classList.add('staff-empty-icon');
    });
  }

  function replaceMapIcons(root) {
    (root || document).querySelectorAll('#customerFeed .btn-card-map-direct svg').forEach(function (svg) {
      var icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'near_me';
      svg.replaceWith(icon);
    });
    (root || document).querySelectorAll('#customerFeed .btn-clean-wa svg').forEach(function (svg) {
      var icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'chat';
      svg.replaceWith(icon);
    });
  }

  function observeStaffText() {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        var root = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
        if (!root || !root.closest || root.closest('script, style')) return;
        cleanText(root);
        replaceMapIcons(root);
        record.addedNodes && Array.from(record.addedNodes).forEach(function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            cleanText(node);
            replaceMapIcons(node);
          }
        });
      });
    });
    observer.observe(body, { childList: true, characterData: true, subtree: true });
  }

  function currentLanguage() {
    return (localStorage.getItem('cwp_lang') || 'hi').toLowerCase().indexOf('en') === 0 ? 'en' : 'hi';
  }

  function setIcon(button, name) {
    var icon = button && button.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = name;
  }

  function setupShell() {
    var jobsPanel = document.getElementById('staffJobsPanel');
    var routeHeader = document.getElementById('staffDailyRouteHeader');
    var searchRow = document.querySelector('#staffJobsPanel .staff-search-row');
    var feed = document.getElementById('customerFeed');
    var settings = document.getElementById('staffSettingsPanel');
    var nav = document.getElementById('staffBottomNav');

    if (jobsPanel && routeHeader && routeHeader.parentElement !== jobsPanel) jobsPanel.insertBefore(routeHeader, jobsPanel.firstChild);

    if (jobsPanel && !document.getElementById('staffJobsHeading')) {
      var jobsHeading = document.createElement('h2');
      jobsHeading.id = 'staffJobsHeading';
      jobsHeading.className = 'staff-destination-heading';
      jobsHeading.textContent = 'आज के असाइन किए गए काम';
      var searchRowForHeading = jobsPanel.querySelector('.staff-search-row');
      if (searchRowForHeading) searchRowForHeading.insertAdjacentElement('beforebegin', jobsHeading);
      else jobsPanel.insertBefore(jobsHeading, jobsPanel.firstChild);
    }

    if (jobsPanel && searchRow && !document.getElementById('staffSearchToggle')) {
      var searchToggle = document.createElement('button');
      searchToggle.type = 'button';
      searchToggle.id = 'staffSearchToggle';
      searchToggle.className = 'staff-search-toggle';
      searchToggle.setAttribute('aria-controls', 'staffSearchRow');
      searchToggle.setAttribute('aria-expanded', 'false');
      searchToggle.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">search</span><span data-search-label>खोजें</span>';
      searchRow.id = 'staffSearchRow';
      searchRow.classList.add('is-collapsed');
      searchRow.insertAdjacentElement('beforebegin', searchToggle);
      searchToggle.addEventListener('click', function () {
        var expanded = searchToggle.getAttribute('aria-expanded') === 'true';
        searchToggle.setAttribute('aria-expanded', String(!expanded));
        searchRow.classList.toggle('is-expanded', !expanded);
        searchRow.classList.toggle('is-collapsed', expanded);
        if (!expanded) {
          var input = document.getElementById('staffSearchInput');
          if (input) input.focus();
        } else if (window.handleStaffSearch) {
          window.handleStaffSearch('');
        }
        setIcon(searchToggle, expanded ? 'search' : 'close');
        updateLabels();
      });
    }

    if (feed) {
      var observer = new MutationObserver(function () {
        cleanText(feed);
        replaceMapIcons(feed);
        prioritizeRoute(feed);
        updateSyncStatus();
      });
      observer.observe(feed, { childList: true, subtree: true, characterData: true });
    }

    if (settings && routeHeader) {
      var groupButton = routeHeader.querySelector('button[onclick*="openStaffWhatsAppGroupModal"]');
      if (groupButton) {
        var utilityRow = document.createElement('div');
        utilityRow.className = 'staff-utility-row';
        utilityRow.innerHTML = '<span><span class="material-symbols-outlined" aria-hidden="true">groups</span><span data-utility-label>टीम WhatsApp ग्रुप</span></span>';
        utilityRow.appendChild(groupButton);
        var prefs = settings.querySelector('.staff-settings-prefs-card');
        if (prefs) prefs.appendChild(utilityRow);
      }
    }

    if (settings) {
      var installButton = document.getElementById('staffPwaInstallBtn');
      if (installButton) {
        var installSvg = installButton.querySelector('svg');
        if (installSvg) {
          var installIcon = document.createElement('span');
          installIcon.className = 'material-symbols-outlined';
          installIcon.setAttribute('aria-hidden', 'true');
          installIcon.textContent = 'install_mobile';
          installSvg.replaceWith(installIcon);
        }
        var installRow = document.createElement('div');
        installRow.className = 'staff-utility-row staff-install-row';
        installRow.innerHTML = '<span><span class="material-symbols-outlined" aria-hidden="true">install_mobile</span><span data-install-label>ऐप इंस्टॉल करें</span></span>';
        installRow.appendChild(installButton);
        var prefsCard = settings.querySelector('.staff-settings-prefs-card');
        if (prefsCard) {
          prefsCard.appendChild(installRow);
          var syncInstallRow = function () {
            var isHidden = installButton.hidden || installButton.getAttribute('hidden') === 'true' || /display:\s*none/i.test(installButton.getAttribute('style') || '');
            installRow.style.display = isHidden ? 'none' : 'flex';
          };
          syncInstallRow();
          new MutationObserver(syncInstallRow).observe(installButton, { attributes: true, attributeFilter: ['style', 'hidden'] });
        }
      }

      var diagnostic = Array.from(settings.querySelectorAll('.staff-settings-info-card')).find(function (card) {
        var title = card.querySelector('.settings-card-title');
        return title && /diagnostic|स्थिति/i.test(title.textContent);
      });
      if (diagnostic && diagnostic.querySelector('.settings-card-title')) {
        diagnostic.classList.add('staff-sync-card');
        var liveValue = diagnostic.querySelector('.settings-info-item .info-value');
        if (liveValue) liveValue.textContent = 'जांच हो रही है…';
      }
    }

    if (nav) {
      nav.setAttribute('aria-label', 'Primary staff navigation');
      nav.querySelectorAll('.staff-bottom-tab').forEach(function (button) {
        button.removeAttribute('role');
        button.removeAttribute('aria-selected');
      });
      var navObserver = new MutationObserver(updateActiveDestination);
      navObserver.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    }
    var contentRoot = document.getElementById('staffContent');
    if (contentRoot) {
      new MutationObserver(function () {
        updateActiveDestination();
        updateLabels();
        updateSyncStatus();
      }).observe(contentRoot, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    document.querySelectorAll('#staffAuthForm input').forEach(function (input) {
      var label = input.id === 'staffPhoneInput' ? 'Mobile number' : (input.id === 'staffPinInput' ? 'Six-digit PIN' : '');
      if (label && !input.getAttribute('aria-label')) input.setAttribute('aria-label', label);
    });
    var authError = document.getElementById('staffAuthError');
    if (authError) authError.setAttribute('role', 'alert');
    ['startJobErrorMsg', 'completeJobErrorMsg', 'cancelJobErrorMsg', 'cameraNonCompletionReasonBox'].forEach(function (id) {
      var feedback = document.getElementById(id);
      if (feedback) feedback.setAttribute('role', 'alert');
    });
    var uploadTitle = document.getElementById('cameraUploadingTitle');
    if (uploadTitle) uploadTitle.setAttribute('role', 'status');
    var loginLoader = document.getElementById('staffLoginLoaderBanner');
    if (loginLoader) loginLoader.setAttribute('role', 'status');

    updateLabels();
    updateSyncStatus();
    updateActiveDestination();
    cleanText(document.getElementById('staffView'));
    cleanText(document.getElementById('staffAuthGate'));
    cleanText(document.getElementById('startSpecialJobModal'));
    cleanText(document.getElementById('completeSpecialJobModal'));
    cleanText(document.getElementById('cancelSpecialJobModal'));
    cleanText(document.getElementById('cleaningCameraModal'));
    cleanText(document.getElementById('staffWhatsAppGroupModal'));
    replaceMapIcons();
  }

  function updateLabels() {
    var isEnglish = currentLanguage() === 'en';
    var labels = [
      ['pillDailyClean', isEnglish ? 'Today' : 'आज'],
      ['pillOtherJobs', isEnglish ? 'Jobs' : 'काम'],
      ['pillStaffSettings', isEnglish ? 'Profile' : 'प्रोफ़ाइल']
    ];
    labels.forEach(function (entry) {
      var label = document.querySelector('#' + entry[0] + ' .bottom-tab-label');
      if (label && label.textContent.trim() !== entry[1]) label.textContent = entry[1];
    });
    var searchLabel = document.querySelector('[data-search-label]');
    if (searchLabel) searchLabel.textContent = isEnglish ? 'Search route' : 'रूट खोजें';
    var searchToggle = document.getElementById('staffSearchToggle');
    if (searchToggle) {
      var expanded = searchToggle.getAttribute('aria-expanded') === 'true';
      var label = searchToggle.querySelector('[data-search-label]');
      if (label) label.textContent = expanded ? (isEnglish ? 'Close search' : 'खोज बंद करें') : (isEnglish ? 'Search route' : 'रूट खोजें');
    }
    var installLabel = document.querySelector('[data-install-label]');
    if (installLabel) installLabel.textContent = isEnglish ? 'Install staff app' : 'स्टाफ ऐप इंस्टॉल करें';
    var utilityLabel = document.querySelector('[data-utility-label]');
    if (utilityLabel) utilityLabel.textContent = isEnglish ? 'Team WhatsApp group' : 'टीम WhatsApp ग्रुप';
    var heading = document.getElementById('routeHeaderTitle');
    if (heading) heading.textContent = isEnglish ? "Today's route" : 'आज का रूट';
    var jobsHeading = document.getElementById('staffJobsHeading');
    if (jobsHeading) jobsHeading.textContent = isEnglish ? 'Assigned jobs' : 'आज के असाइन किए गए काम';
    var pageTitle = document.getElementById('pageMainTitle');
    var staffContent = document.getElementById('staffContent');
    if (pageTitle && staffContent && staffContent.style.display !== 'none') {
      if (document.getElementById('pillOtherJobs')?.classList.contains('active')) pageTitle.textContent = isEnglish ? 'Jobs' : 'काम';
      else if (document.getElementById('pillStaffSettings')?.classList.contains('active')) pageTitle.textContent = isEnglish ? 'Profile' : 'प्रोफ़ाइल';
      else pageTitle.textContent = isEnglish ? 'Today' : 'आज';
    }
  }

  function updateActiveDestination() {
    var nav = document.getElementById('staffBottomNav');
    if (!nav) return;
    body.classList.toggle('staff-active-today', !!document.getElementById('pillDailyClean')?.classList.contains('active'));
    body.classList.toggle('staff-active-jobs', !!document.getElementById('pillOtherJobs')?.classList.contains('active'));
    body.classList.toggle('staff-active-profile', !!document.getElementById('pillStaffSettings')?.classList.contains('active'));
  }

  function prioritizeRoute(feed) {
    var dailyTab = document.getElementById('pillDailyClean');
    if (!dailyTab || !dailyTab.classList.contains('active')) return;

    var cards = Array.from(feed.children).filter(function (child) { return child.classList && child.classList.contains('smart-card'); });
    var store = window.getDailyCleanStore ? window.getDailyCleanStore() : {};
    var staffId = (window.getCleanStaffId && window.getCleanStaffId()) || '';
    var today = window.getTodayDateKey ? window.getTodayDateKey() : '';
    var todaysRecords = store[String(staffId).toUpperCase()] && store[String(staffId).toUpperCase()][today] || {};
    var nextCard = cards.find(function (card) {
      return !card.classList.contains('skeleton-card') && !card.classList.contains('card-cleaned-done') && !card.classList.contains('card-service-stopped');
    });
    cards.forEach(function (card) {
      var customerId = card.getAttribute('data-customer-id');
      var record = customerId && todaysRecords[customerId];
      var pendingNote = card.querySelector('.staff-pending-sync');
      if (record && record.pendingSync === true) {
        if (!pendingNote) {
          pendingNote = document.createElement('div');
          pendingNote.className = 'staff-pending-sync';
          pendingNote.setAttribute('role', 'status');
          var cardHeader = card.querySelector('.card-header-row');
          if (cardHeader) cardHeader.insertAdjacentElement('afterend', pendingNote);
        }
        var syncLabel = currentLanguage() === 'en' ? 'Saved on this device · waiting to sync' : 'इस डिवाइस पर सुरक्षित · सिंक बाकी';
        if (pendingNote.textContent.trim() !== syncLabel) pendingNote.textContent = syncLabel;
      } else if (pendingNote) {
        pendingNote.remove();
      }
      if (card === nextCard) return;
      card.classList.remove('is-next-stop');
      var oldKicker = card.querySelector('.staff-next-stop-label');
      if (oldKicker) oldKicker.remove();
    });
    if (!nextCard) return;

    nextCard.classList.add('is-next-stop');
    var header = nextCard.querySelector('.card-header-row');
    var kicker = nextCard.querySelector('.staff-next-stop-label');
    if (header && !kicker) {
      kicker = document.createElement('div');
      kicker.className = 'staff-next-stop-label';
      header.insertAdjacentElement('beforebegin', kicker);
    }
    var nextLabel = currentLanguage() === 'en' ? 'Next stop' : 'अगला स्टॉप';
    var currentNextLabel = kicker && kicker.querySelector('span:last-child') && kicker.querySelector('span:last-child').textContent;
    if (kicker && currentNextLabel !== nextLabel) {
      kicker.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">near_me</span><span>' + nextLabel + '</span>';
    }

    var firstCard = cards[0];
    if (firstCard && firstCard !== nextCard && (firstCard.classList.contains('card-cleaned-done') || firstCard.classList.contains('card-service-stopped'))) {
      feed.insertBefore(nextCard, firstCard);
    }
  }

  function countPendingSync() {
    try {
      var store = window.getDailyCleanStore ? window.getDailyCleanStore() : JSON.parse(localStorage.getItem(window.DAILY_CLEAN_STORAGE_KEY || 'cwp_daily_clean_completion') || '{}');
      var active = (window.getCleanStaffId && window.getCleanStaffId()) || window.initialStaffId || '';
      var dates = active ? store[String(active).toUpperCase()] || store[active] || {} : {};
      return Object.keys(dates).reduce(function (count, day) {
        var records = dates[day] || {};
        return count + Object.keys(records).filter(function (key) { return records[key] && records[key].pendingSync === true; }).length;
      }, 0);
    } catch (error) { return 0; }
  }

  function updateSyncStatus() {
    var card = document.querySelector('#staffSettingsPanel .staff-sync-card');
    if (!card) return;
    var values = card.querySelectorAll('.settings-info-item .info-value');
    if (values.length < 2) return;
    var isEnglish = currentLanguage() === 'en';
    var online = navigator.onLine;
    var pending = countPendingSync();
    values[0].textContent = online
      ? (pending ? (isEnglish ? 'Online · ' + pending + ' awaiting sync' : 'ऑनलाइन · ' + pending + ' सिंक बाकी') : (isEnglish ? 'Online · no queued work' : 'ऑनलाइन · कोई काम कतार में नहीं'))
      : (isEnglish ? 'Offline · saved work stays on this device' : 'ऑफ़लाइन · काम इस डिवाइस पर सुरक्षित है');
    values[0].setAttribute('role', 'status');
    values[1].textContent = pending
      ? (isEnglish ? pending + ' item(s) saved locally' : pending + ' काम स्थानीय रूप से सुरक्षित')
      : (isEnglish ? 'No pending local work' : 'कोई स्थानीय काम बाकी नहीं');
    values[1].setAttribute('role', 'status');
    var netItem = values[0].closest('.settings-info-item');
    if (netItem) netItem.classList.toggle('is-offline', !online || pending > 0);
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('#staffBottomNav .staff-bottom-tab')) {
      window.setTimeout(function () { updateActiveDestination(); updateLabels(); }, 0);
    }
    if (event.target.closest('#btnPrefLangHi, #btnPrefLangEn')) window.setTimeout(updateLabels, 0);
    if (event.target.closest('#btnPrefThemeLight, #btnPrefThemeDark, #btnPrefLangHi, #btnPrefLangEn')) {
      window.setTimeout(function () { cleanText(document.getElementById('staffSettingsPanel')); }, 0);
    }
  });

  window.addEventListener('online', updateSyncStatus);
  window.addEventListener('offline', updateSyncStatus);
  window.addEventListener('storage', updateSyncStatus);

  observeStaffText();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupShell, { once: true });
  else setupShell();
})();
