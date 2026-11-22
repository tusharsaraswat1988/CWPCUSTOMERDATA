/* Application Launch Parameters */
    var initialStaffId = '';
    var initialMode = 'admin';
    var webAppBaseUrl = '';

    /* Global Application State */
    /* ==========================================================================
   SHARED INDIAN MOBILE NUMBER UTILITIES & COLLAPSE HELPERS (Task P2.3)
   ========================================================================== */
function normalizeIndianMobile(value) {
  if (value == null) return '';
  var str = String(value).trim();
  if (!str) return '';
  var cleaned = str.replace(/[^\d+]/g, '');
  if (cleaned.indexOf('+91') === 0) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.indexOf('+') === 0) {
    cleaned = cleaned.substring(1);
  }
  var digits = cleaned.replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '0') {
    digits = digits.substring(1);
  } else if (digits.length === 12 && digits.indexOf('91') === 0) {
    digits = digits.substring(2);
  }
  return digits;
}

function isValidIndianMobile(value) {
  var digits = normalizeIndianMobile(value);
  return /^[6-9]\d{9}$/.test(digits);
}

function parseVehicleString(s) {
  if (!s) return { model: '', reg: '', display: '' };
  var raw = String(s).trim();
  var regMatch = raw.match(/([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})/i);
  if (regMatch) {
    var reg = regMatch[1].toUpperCase().replace(/\s+/g, ' ');
    var model = raw.replace(regMatch[0], '').replace(/^[\s\-–—:,|]+|[\s\-–—:,|]+$/g, '').trim();
    return { reg: reg, model: model, display: raw };
  }
  return { reg: raw, model: '', display: raw };
}
if (typeof window !== 'undefined') {
  window.parseVehicleString = parseVehicleString;
}

function formatIndianMobile(value, includePrefix) {
  if (includePrefix === undefined) includePrefix = true;
  var digits = normalizeIndianMobile(value);
  if (!digits) return '';
  var formattedDigits = digits.length <= 5 ? digits : (digits.slice(0, 5) + ' ' + digits.slice(5, 10));
  return includePrefix ? ('+91 ' + formattedDigits) : formattedDigits;
}

function getIndianPhoneLink(value) {
  var digits = normalizeIndianMobile(value);
  return digits ? ('tel:+91' + digits) : 'tel:';
}

function getIndianWhatsAppLink(value, message) {
  var digits = normalizeIndianMobile(value);
  var base = digits ? ('https://wa.me/91' + digits) : 'https://wa.me/';
  return message ? (base + '?text=' + encodeURIComponent(message)) : base;
}

function attachIndianMobileFormatter(inputEl) {
  if (!inputEl || inputEl._hasPhoneFormatter) return;
  inputEl._hasPhoneFormatter = true;

  function onInput() {
    var rawVal = inputEl.value;
    var cursorPos = inputEl.selectionStart || 0;

    var digitsBeforeCursor = rawVal.slice(0, cursorPos).replace(/\D/g, '').length;

    var cleaned = rawVal.replace(/[^\d+]/g, '');
    var hadCountryCode = false;
    var hadLeadingZero = false;

    if (cleaned.indexOf('+91') === 0) {
      cleaned = cleaned.substring(3);
      hadCountryCode = true;
    } else if (cleaned.indexOf('+') === 0) {
      cleaned = cleaned.substring(1);
    }

    var digits = cleaned.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '0') {
      digits = digits.substring(1);
      hadLeadingZero = true;
    } else if (digits.length === 12 && digits.indexOf('91') === 0) {
      digits = digits.substring(2);
      hadCountryCode = true;
    }

    var maxDigits = digits.slice(0, 10);

    if (hadCountryCode) {
      digitsBeforeCursor = Math.max(0, digitsBeforeCursor - 2);
    } else if (hadLeadingZero) {
      digitsBeforeCursor = Math.max(0, digitsBeforeCursor - 1);
    }
    digitsBeforeCursor = Math.min(digitsBeforeCursor, maxDigits.length);

    var formatted = maxDigits.length <= 5 ? maxDigits : (maxDigits.slice(0, 5) + ' ' + maxDigits.slice(5));
    inputEl.value = formatted;

    var newCursor = 0;
    var count = 0;
    for (var i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted.charAt(i))) {
        count++;
      }
      if (count === digitsBeforeCursor) {
        newCursor = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) newCursor = 0;

    try {
      inputEl.setSelectionRange(newCursor, newCursor);
    } catch (err) {}

    if (maxDigits.length === 10) {
      if (/^[6-9]/.test(maxDigits)) {
        inputEl.setCustomValidity('');
        inputEl.classList.remove('is-invalid');
      } else {
        inputEl.setCustomValidity('Indian mobile number must start with 6, 7, 8, or 9');
        inputEl.classList.add('is-invalid');
      }
    } else if (maxDigits.length > 0 && maxDigits.length < 10) {
      inputEl.setCustomValidity('Please enter a valid 10-digit mobile number');
    } else {
      inputEl.setCustomValidity('');
      inputEl.classList.remove('is-invalid');
    }
  }

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('paste', function() {
    setTimeout(onInput, 0);
  });

  if (inputEl.value) {
    onInput();
  }
}

function setPhoneInputValue(inputEl, val) {
  if (!inputEl) return;
  var norm = normalizeIndianMobile(val);
  inputEl.value = norm.length <= 5 ? norm : (norm.slice(0, 5) + ' ' + norm.slice(5));
  if (typeof attachIndianMobileFormatter === 'function') {
    attachIndianMobileFormatter(inputEl);
  }
}

function initAllPhoneFormatters() {
  ['custPhone', 'editCustPhone', 'newStaffPhone', 'editStaffPhone', 'staffPhoneInput'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) attachIndianMobileFormatter(el);
  });
}

/* ==========================================================================
   BILINGUAL PHONETIC SEARCH ENGINE (English <-> Hindi) (Task P2.4)
   Enables seamless cross-lingual search across customer records:
   - "ritika" / "reetika" / "jain" -> finds "रितिका जैन"
   - "sigra" / "varanasi" -> finds "सिगरा, वाराणसी"
   - "रमेश" / "जैन" -> finds "Ramesh Sharma" / "Ankit Jain"
   - Handles Indian phonetic variations, schwa deletion, and formatted phones
   ========================================================================== */
var DEVA_VOWEL_MAP = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'अं': 'an', 'अः': 'ah', 'ऑ': 'o', 'ऍ': 'e'
};

var DEVA_MATRA_MAP = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', 'ॅ': 'e', 'ॉ': 'o'
};

var DEVA_CONSONANT_MAP = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क्ष': 'ksh', 'त्र': 'tra', 'ज्ञ': 'gya',
  'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'ज़': 'z', 'क़': 'q', 'ख़': 'kh', 'ग़': 'gh'
};

function devanagariToLatin(str) {
  if (!str) return '';
  var s = String(str);
  var out = '';
  var len = s.length;

  for (var i = 0; i < len; i++) {
    var ch = s.charAt(i);
    var next = i + 1 < len ? s.charAt(i + 1) : '';

    if (DEVA_CONSONANT_MAP[ch]) {
      var c = DEVA_CONSONANT_MAP[ch];
      if (next === '्') {
        out += c;
        i++; // skip halant
      } else if (DEVA_MATRA_MAP[next]) {
        out += c + DEVA_MATRA_MAP[next];
        i++; // skip matra
      } else {
        var isWordEnd = (i + 1 === len) || (/[\s,.-]/.test(next));
        if (isWordEnd) {
          out += c;
        } else {
          out += c + 'a';
        }
      }
    } else if (DEVA_VOWEL_MAP[ch]) {
      out += DEVA_VOWEL_MAP[ch];
    } else if (DEVA_MATRA_MAP[ch]) {
      out += DEVA_MATRA_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out.toLowerCase();
}

function normalizePhoneticKey(str) {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/sh/g, 's')
    .replace(/aa/g, 'a')
    .replace(/dh/g, 'd')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/jh/g, 'j')
    .replace(/ch/g, 'c')
    .replace(/(\w)\1+/g, '$1')
    .trim();
}

function recordMatchesBilingualSearch(record, query) {
  if (!record || !query) return true;
  var q = String(query).trim().toLowerCase();
  if (!q) return true;

  var rawPhoneQuery = q.replace(/\D/g, '');
  var tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  var corpusParts = [];

  function addField(val) {
    if (val != null) {
      var s = String(val).trim();
      if (s) {
        corpusParts.push(s.toLowerCase());
        if (/[\u0900-\u097F]/.test(s)) {
          var roman = devanagariToLatin(s);
          if (roman) {
            corpusParts.push(roman);
            var syncope = roman.replace(/([bcdfghjklmnpqrstvwxyz])a([bcdfghjklmnpqrstvwxyz])/g, '$1$2');
            if (syncope !== roman) corpusParts.push(syncope);
            var norm = normalizePhoneticKey(roman);
            if (norm && norm !== roman) corpusParts.push(norm);
            var normSync = normalizePhoneticKey(syncope);
            if (normSync && normSync !== syncope && normSync !== norm) corpusParts.push(normSync);
          }
        } else {
          var normLat = normalizePhoneticKey(s);
          if (normLat && normLat !== s.toLowerCase()) corpusParts.push(normLat);
        }
      }
    }
  }

  // Name fields (English & Hindi)
  addField(record.customerName || record.name);
  addField(record.nameHi || record.name_hi);

  // Phone numbers (raw digits, normalized, formatted with & without +91)
  var phone = record.customerNumber || record.phone;
  var recPhoneDigits = '';
  if (phone != null) {
    addField(phone);
    if (typeof normalizeIndianMobile === 'function') {
      recPhoneDigits = normalizeIndianMobile(phone);
    } else {
      recPhoneDigits = String(phone).replace(/\D/g, '');
    }
    if (recPhoneDigits) {
      addField(recPhoneDigits);
      addField('+91' + recPhoneDigits);
      addField('+91 ' + recPhoneDigits);
      if (typeof formatIndianMobile === 'function') {
        var fmt = formatIndianMobile(recPhoneDigits, false);
        if (fmt) {
          addField(fmt);
          addField('+91 ' + fmt);
        }
      }
    }
  }

  // Vehicle / site information
  addField(record.vehicle || record.vehicleNumbers || record.vehicleOrSite);
  addField(record.carMake || record.car_make);
  addField(record.carColor || record.car_color);
  if (Array.isArray(record.vehicles)) {
    record.vehicles.forEach(function(v) {
      if (v) {
        addField(v.registrationNo || v.registration_no);
        addField(v.brandOrModel || v.brand_or_model);
        addField(v.carMake || v.car_make);
        addField(v.carColor || v.car_color);
      }
    });
  }

  // Address fields (English & Hindi)
  addField(record.address);
  addField(record.addressHi || record.address_hi);
  addField(record.secondaryAddress);
  addField(record.secondaryAddressHi || record.secondary_address_hi);

  // Metadata
  addField(record.staffName);
  addField(record.notes || record.staffNotes || record.leadNotes);
  addField(record.packageType || record.serviceType || record.packageName);
  addField(record.customerCode);

  var corpus = corpusParts.join(' ');

  // Direct phone match shortcut
  if (rawPhoneQuery.length >= 4 && recPhoneDigits && recPhoneDigits.indexOf(rawPhoneQuery) !== -1) {
    return true;
  }

  return tokens.every(function(tok) {
    if (corpus.indexOf(tok) !== -1) return true;

    var tokDigits = tok.replace(/\D/g, '');
    if (tokDigits.length >= 4 && recPhoneDigits && recPhoneDigits.indexOf(tokDigits) !== -1) {
      return true;
    }

    if (/[\u0900-\u097F]/.test(tok)) {
      var tokRom = devanagariToLatin(tok);
      if (tokRom && corpus.indexOf(tokRom) !== -1) return true;
      var tokRomNorm = normalizePhoneticKey(tokRom);
      if (tokRomNorm && corpus.indexOf(tokRomNorm) !== -1) return true;
    }

    var tokNorm = normalizePhoneticKey(tok);
    if (tokNorm && corpus.indexOf(tokNorm) !== -1) return true;

    return false;
  });
}

if (typeof window !== 'undefined') {
  window.devanagariToLatin = devanagariToLatin;
  window.normalizePhoneticKey = normalizePhoneticKey;
  window.recordMatchesBilingualSearch = recordMatchesBilingualSearch;
}

/* Optional Field Collapsible Controls (Task P2.3) */
function toggleCustMap(forceState) {
  var panel = document.getElementById('custMapCollapse');
  if (panel) {
    var willOpen = forceState !== undefined ? forceState : (panel.style.display === 'none' || panel.style.display === '');
    panel.style.display = willOpen ? 'block' : 'none';
  }
  var btn = document.getElementById('btnToggleCustMap');
  if (btn) {
    if (forceState) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  var input = document.getElementById('custMapsUrl');
  if (input && forceState) {
    try { input.focus(); } catch (e) {}
  }
}
function expandCustMapField() {
  toggleCustMap(true);
}

function toggleEditMap(forceState) {
  var panel = document.getElementById('editMapCollapse');
  if (panel) {
    var willOpen = forceState !== undefined ? forceState : (panel.style.display === 'none' || panel.style.display === '');
    panel.style.display = willOpen ? 'block' : 'none';
  }
  var btn = document.getElementById('btnToggleEditMap');
  if (btn) {
    if (forceState) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  var input = document.getElementById('editCustMapsUrl');
  if (input && forceState) {
    try { input.focus(); } catch (e) {}
  }
}
function expandEditMap() {
  toggleEditMap(true);
}

function toggleCustSecLocation(forceState) {
  var panel = document.getElementById('custSecCollapse');
  var btn = document.getElementById('btnToggleCustSec');
  var btnText = document.getElementById('custSecBtnText');
  if (!panel) return;
  var willOpen = forceState !== undefined ? forceState : (panel.style.display === 'none' || panel.style.display === '');
  panel.style.display = willOpen ? 'block' : 'none';
  if (btn) {
    if (willOpen) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  if (btnText) {
    btnText.textContent = willOpen ? 'Secondary Location (Active)' : '+ Add Secondary Location (Office / Alternate)';
  }
  if (willOpen) {
    var input = document.getElementById('custSecAddress');
    if (input) input.focus();
  }
}
function expandCustSecLocationField() {
  toggleCustSecLocation(true);
}

function toggleEditSecLocation(forceState) {
  var panel = document.getElementById('editSecCollapse');
  var btn = document.getElementById('btnToggleEditSec');
  var btnText = document.getElementById('editSecBtnText');
  if (!panel) return;
  var willOpen = forceState !== undefined ? forceState : (panel.style.display === 'none' || panel.style.display === '');
  panel.style.display = willOpen ? 'block' : 'none';
  if (btn) {
    if (willOpen) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  if (btnText) {
    btnText.textContent = willOpen ? 'Secondary Location (Active)' : '+ Add Secondary Location (Office / Alternate)';
  }
  if (willOpen) {
    var input = document.getElementById('editCustSecAddress');
    if (input) input.focus();
  }
}
function expandEditSecLocation() {
  toggleEditSecLocation(true);
}

var CWP_SERVICE_CATALOG = {
  daily_car_cleaning: {
    id: 'daily_car_cleaning',
    name: 'Daily Car Cleaning',
    nameHi: 'दैनिक कार सफाई',
    iconEmoji: '🚗',
    packages: [
      { code: 'DCC_EXT_30D', name: 'Exterior Chemical Cleaning (30 Days)', nameHi: 'एक्सटीरियर केमिकल सफाई (30 दिन)' },
      { code: 'DCC_EXT_1WASH', name: 'Exterior Chemical Cleaning + 1 Carwash/mo', nameHi: 'एक्सटीरियर केमिकल सफाई + 1 कार वॉश/माह' },
      { code: 'DCC_EXT_2WASH', name: 'Exterior Chemical Cleaning + 2 Carwash/mo', nameHi: 'एक्सटीरियर केमिकल सफाई + 2 कार वॉश/माह' }
    ]
  },
  car_washing: {
    id: 'car_washing',
    name: 'Car Wash',
    nameHi: 'कार वॉश',
    iconEmoji: '🧼',
    packages: [
      { code: 'WASH_SINGLE', name: 'Single Wash (One Time Wash)', nameHi: 'सिंगल वॉश (एक बार)' },
      { code: 'WASH_SUB_4', name: 'Wash Subscription (4 Washes / 6 Months)', nameHi: 'वॉश सब्सक्रिप्शन (4 वॉश / 6 माह)' }
    ]
  },
  solar_cleaning: {
    id: 'solar_cleaning',
    name: 'Solar Panel Cleaning',
    nameHi: 'सोलर पैनल सफाई',
    iconEmoji: '☀️',
    packages: [
      { code: 'SOLAR_SINGLE', name: 'One Time Solar Cleaning', nameHi: 'एक बार सोलर सफाई' },
      { code: 'SOLAR_SUB_6', name: '6 Month Subscription (1 cleaning/mo - 6 frequencies)', nameHi: '6 महीने सब्सक्रिप्शन (6 बार)' },
      { code: 'SOLAR_SUB_12', name: '12 Month Subscription (1 cleaning/mo - 12 frequencies)', nameHi: '12 महीने सब्सक्रिप्शन (12 बार)' }
    ]
  },
  interior_detailing: {
    id: 'interior_detailing',
    name: 'Interior Detailing',
    nameHi: 'इंटीरियर डिटेलिंग',
    iconEmoji: '✨',
    packages: [
      { code: 'INT_DEEP_CLEAN', name: 'Interior Deep Cleaning', nameHi: 'इंटीरियर डीप क्लीनिंग' },
      { code: 'INT_ROOF_CLEAN', name: 'Roof Cleaning', nameHi: 'रूफ क्लीनिंग (छत की सफाई)' }
    ]
  },
  exterior_detailing: {
    id: 'exterior_detailing',
    name: 'Exterior Detailing',
    nameHi: 'एक्सटीरियर डिटेलिंग',
    iconEmoji: '🛡️',
    packages: [
      { code: 'EXT_CERAMIC', name: 'Ceramic Coating', nameHi: 'सिरेमिक कोटिंग' },
      { code: 'EXT_GRAPHENE', name: 'Graphene Coating', nameHi: 'ग्राफीन कोटिंग' },
      { code: 'EXT_WAXING', name: 'Car Waxing', nameHi: 'कार वैक्सिंग (पॉलिश)' },
      { code: 'EXT_GLASS', name: 'Glass Treatment', nameHi: 'ग्लास ट्रीटमेंट' }
    ]
  }
};

var state = {
      currentView: 'staff',
      activeStaffId: '',
      staffList: [],
      customers: [],
      filteredCustomers: [],
      searchQuery: '',
      activeFilter: 'daily_car_cleaning',
      selectedPhotoBase64: '',
      leads: [],
      lastFilteredLeads: [],
      leadsSearchQuery: '',
      leadsViewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('cwp_leads_view_mode')) || 'table',
      leadsCategoryFilter: 'all',
      leadsStageFilter: 'all',
      selectedLeadPhotoBase64: '',
      selectedLeadPhotoType: '',
      selectedLeadPhotoName: '',
      rawSelectedLeadPhotoDataUrl: '',
      selectedPhotoType: '',
      selectedPhotoName: '',
      rawSelectedPhotoDataUrl: '',
      editPhotoBase64: '',
      editPhotoType: '',
      editPhotoName: '',
      rawEditPhotoDataUrl: '',
      lang: 'hi',
      theme: 'light'
    };

    /* =========================================================================
       2026 GLOBAL UI/UX MODERNIZATION: I18N (HINDI / ENGLISH) & THEME ENGINE
       ========================================================================= */
    var CWP_I18N = {
      hi: {
        admin_title: "Admin Portal",
        staff_title: "पोर्टल",
        staff_login_title: "पोर्टल लॉगिन",
        staff_login_desc: "पंजीकृत मोबाइल नंबर और 6-अंकों का पिन दर्ज करें",
        staff_pin_placeholder: "6-अंकों का पिन दर्ज करें",
        remember_device: "इस फोन पर लॉगिन याद रखें",
        login_btn: "लॉगिन करें (Log In)",
        trust_strip: "सुरक्षित स्टाफ पोर्टल • CWP Detailers Official",
        live_sync: "लाइव",
        sync_title: "ऑटो-सिंक सक्रिय (30s) • लाइव डेटा सिंक चालू",
        logout: "लॉगआउट",
        verified_portal: "CWP Verified Staff Portal",
        cars_count_suffix: "गाड़ियां",
        search_placeholder: "ग्राहक का नाम, गाड़ी नंबर या पता खोजें...",
        tab_daily: "Daily Car Cleaning",
        tab_wash: "Car Washing",
        tab_solar: "Solar Panel Cleaning",
        today_route: "Today's Cleaning Route",
        route_staff_label: "स्टाफ",
        route_total_label: "कुल असाइन गाड़ियां",
        route_progress_label: "प्रोग्रेस:",
        route_complete_label: "पूर्ण",
        call: "कॉल",
        no_call: "कॉल नहीं",
        loc_single: "लोकेशन",
        loc_multi: "2 लोकेशन",
        loc_none: "लोकेशन नहीं",
        photo: "फोटो",
        notes_label: "निर्देश:",
        mark_done: "✓ साफ हो गई (Done)",
        mark_clean: "○ आज साफ करें (Mark Cleaned)",
        no_records: "No records found",
        clear_search: "✕ Clear search",
        back_to_daily: "🚗 मुख्य दैनिक सफाई पर जाएं",
        open_maps: "Google Maps पर खोलें",
        close: "बंद करें",
        inactive_msg: "🚫 आपका स्टाफ अकाउंट Inactive कर दिया गया है।<br>कृपया अपने एडमिन से संपर्क करें।",
        invalid_login: "❌ गलत विवरण! कृपया सही मोबाइल नंबर व पिन दर्ज करें।",
        pin_error_roast: "अरे भाई! 6 अंकों का सही पिन दर्ज करें।",
        phone_error_roast: "कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें।",
        sync_success_roast: "डेटा सफलतापूर्वक सिंक हो गया है!",
        offline_toast: "ऑफलाइन मोड सक्रिय: परिवर्तन फोन में सुरक्षित हैं।",
        cleaned_toast: "बधाई! गाड़ी साफ चिह्नित कर दी गई है।"
      },
      en: {
        admin_title: "Admin Portal",
        staff_title: "Portal",
        staff_login_title: "Portal Login",
        staff_login_desc: "Enter registered mobile number and 6-digit PIN",
        staff_pin_placeholder: "Enter 6-digit PIN",
        remember_device: "Remember login on this device",
        login_btn: "Log In",
        trust_strip: "Secure Staff Portal • CWP Detailers Official",
        live_sync: "Live",
        sync_title: "Auto-Sync Active (30s) • Click to check now",
        logout: "Logout",
        verified_portal: "CWP Verified Staff Portal",
        cars_count_suffix: "Vehicles",
        search_placeholder: "Search customer name, vehicle or address...",
        tab_daily: "Daily Car Cleaning",
        tab_wash: "Car Washing",
        tab_solar: "Solar Panel Cleaning",
        today_route: "Today's Cleaning Route",
        route_staff_label: "Staff",
        route_total_label: "Total Assigned Vehicles",
        route_progress_label: "Progress:",
        route_complete_label: "Complete",
        call: "Call",
        no_call: "No Phone",
        loc_single: "Location",
        loc_multi: "2 Locations",
        loc_none: "No Location",
        photo: "Photo",
        notes_label: "Notes:",
        mark_done: "✓ Cleaned (Done)",
        mark_clean: "○ Mark Cleaned",
        no_records: "No records found",
        clear_search: "✕ Clear search",
        back_to_daily: "🚗 Go to Daily Car Cleaning",
        open_maps: "Open in Google Maps",
        close: "Close",
        inactive_msg: "🚫 Your staff account is deactivated.<br>Please contact your administrator.",
        invalid_login: "❌ Invalid credentials! Please check your mobile and PIN.",
        pin_error_roast: "Hey there! Please enter your complete 6-digit PIN.",
        phone_error_roast: "Please enter a valid 10-digit mobile number.",
        sync_success_roast: "Data synchronized successfully!",
        offline_toast: "Offline mode active: changes saved to device.",
        cleaned_toast: "Great job! Stop marked as cleaned."
      }
    };

    function t(key, fallback) {
      var lang = (state && state.lang) || localStorage.getItem('cwp_lang') || 'hi';
      var dict = CWP_I18N[lang] || CWP_I18N['hi'];
      if (dict && dict[key] !== undefined) return dict[key];
      return fallback !== undefined ? fallback : key;
    }

    function initTheme() {
      var savedTheme = localStorage.getItem('cwp_theme');
      var systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
      setTheme(theme);
    }

    function setTheme(theme) {
      state.theme = theme;
      localStorage.setItem('cwp_theme', theme);
      var isDark = (theme === 'dark');
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('theme-dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('theme-dark');
      }
      var icon1 = document.getElementById('themeToggleIcon');
      var icon2 = document.getElementById('gateThemeIcon');
      var icon3 = document.getElementById('adminGateThemeIcon');
      var iconChar = isDark ? '☀️' : '🌙';
      if (icon1) icon1.textContent = iconChar;
      if (icon2) icon2.textContent = iconChar;
      if (icon3) icon3.textContent = iconChar;
      var btn = document.getElementById('btnThemeToggle');
      if (btn) btn.title = isDark ? 'लाइट मोड में बदलें / Switch to Light Mode' : 'डार्क मोड में बदलें / Switch to Dark Mode';
      if (typeof updateSettingsPrefButtons === 'function') updateSettingsPrefButtons();
    }

    function toggleTheme() {
      var current = state.theme || (document.body.classList.contains('theme-dark') ? 'dark' : 'light');
      setTheme(current === 'dark' ? 'light' : 'dark');
    }

    function updateSettingsPrefButtons() {
      var currentLang = state.lang || 'hi';
      var currentTheme = state.theme || (document.body.classList.contains('theme-dark') ? 'dark' : 'light');

      var btnLangHi = document.getElementById('btnPrefLangHi');
      var btnLangEn = document.getElementById('btnPrefLangEn');
      if (btnLangHi) btnLangHi.classList.toggle('active', currentLang === 'hi');
      if (btnLangEn) btnLangEn.classList.toggle('active', currentLang === 'en');

      var btnThemeLight = document.getElementById('btnPrefThemeLight');
      var btnThemeDark = document.getElementById('btnPrefThemeDark');
      if (btnThemeLight) btnThemeLight.classList.toggle('active', currentTheme === 'light');
      if (btnThemeDark) btnThemeDark.classList.toggle('active', currentTheme === 'dark');
    }

    function setAppThemeMode(theme) {
      setTheme(theme);
      updateSettingsPrefButtons();
    }

    function initLanguage() {
      var savedLang = localStorage.getItem('cwp_lang') || 'hi';
      setLanguage(savedLang);
    }

    function setLanguage(lang) {
      state.lang = lang;
      localStorage.setItem('cwp_lang', lang);
      applyStaffLanguage(lang);
    }

    function toggleLanguage() {
      var current = state.lang || localStorage.getItem('cwp_lang') || 'hi';
      setLanguage(current === 'hi' ? 'en' : 'hi');
    }

    function applyStaffLanguage(lang) {
      state.lang = lang;
      var isHi = (lang === 'hi');

      // Update Header Toggles & Menus
      var langText = document.getElementById('langToggleText');
      if (langText) langText.textContent = isHi ? 'HI' : 'EN';
      var checkEn = document.getElementById('checkLangEn');
      var checkHi = document.getElementById('checkLangHi');
      var optEn = document.getElementById('langOptEn');
      var optHi = document.getElementById('langOptHi');
      if (optEn) optEn.classList.toggle('is-selected', !isHi);
      if (optHi) optHi.classList.toggle('is-selected', isHi);
      if (checkEn) checkEn.style.display = isHi ? 'none' : 'inline';
      if (checkHi) checkHi.style.display = isHi ? 'inline' : 'none';

      var gateLang = document.getElementById('gateLangText');
      if (gateLang) gateLang.textContent = isHi ? 'English' : 'हिन्दी';
      var adminGateLang = document.getElementById('adminGateLangText');
      if (adminGateLang) adminGateLang.textContent = isHi ? 'English' : 'हिन्दी';
      var btnLang = document.getElementById('btnLangToggle');
      if (btnLang) btnLang.title = isHi ? 'भाषा: हिन्दी (बदलने के लिए क्लिक करें)' : 'Language: English (Click to change)';

      // Header Title & Context Chip
      var titleEl = document.getElementById('pageMainTitle');
      var adminTitleEl = document.getElementById('adminHeaderTitle');
      var chipEl = document.getElementById('headerContextChip');
      if (state.currentView === 'staff') {
        if (titleEl) titleEl.textContent = isHi ? 'स्टाफ पोर्टल' : 'Staff Portal';
        if (chipEl) {
          chipEl.style.setProperty('display', 'none', 'important');
          chipEl.textContent = '';
        }
      } else {
        if (chipEl) {
          chipEl.style.setProperty('display', 'inline-flex', 'important');
          chipEl.textContent = 'ADMIN';
        }
        if (adminTitleEl) adminTitleEl.textContent = 'Admin Portal';
        if (titleEl) titleEl.textContent = 'Admin Portal';
      }

      // Live Sync Header Indicator (Hidden - user requested: live hata do. not needed at all.)
      var syncText = document.getElementById('staffSyncText');
      if (syncText) syncText.textContent = isHi ? 'लाइव' : 'Live';
      var syncBadge = document.getElementById('staffLiveBadge');
      if (syncBadge) syncBadge.style.display = 'none';
      
      var popHeading = document.getElementById('popoverStatusHeading');
      if (popHeading) popHeading.textContent = isHi ? 'रीयल-टाइम कनेक्शन' : 'Realtime Connection';
      var popSyncMode = document.getElementById('popoverSyncModeLabel');
      if (popSyncMode) popSyncMode.textContent = isHi ? 'सिंक फ्रीक्वेंसी:' : 'Sync Frequency:';
      var popLastSync = document.getElementById('popoverLastSyncLabel');
      if (popLastSync) popLastSync.textContent = isHi ? 'अंतिम सिंक:' : 'Last Synchronized:';
      var popNet = document.getElementById('popoverNetworkLabel');
      if (popNet) popNet.textContent = isHi ? 'नेटवर्क स्थिति:' : 'Network State:';
      var popBtn = document.getElementById('popoverSyncBtnText');
      if (popBtn) popBtn.textContent = isHi ? 'अभी सिंक करें' : 'Sync Now';

      var pwaBtnText = document.querySelector('#staffPwaInstallBtn .pwa-btn-text');
      if (pwaBtnText) pwaBtnText.textContent = isHi ? 'ऐप इंस्टॉल' : 'Install App';

      var staffLogoutBtn = document.getElementById('staffLogoutBtn');
      if (staffLogoutBtn) {
        var txt = staffLogoutBtn.querySelector('.logout-text');
        if (txt) txt.textContent = isHi ? 'लॉगआउट (Shift Sign Out)' : 'Logout (Shift Sign Out)';
      }

      // Staff Auth Gate
      var authTitle = document.getElementById('staffAuthTitle');
      if (authTitle) authTitle.textContent = isHi ? 'स्टाफ लॉगिन' : 'Staff Login';
      var authDesc = document.getElementById('staffAuthDesc');
      if (authDesc) authDesc.textContent = isHi ? 'ऑटोमोटिव सर्विस पोर्टल' : 'Automotive Service Portal';
      var phoneInput = document.getElementById('staffPhoneInput');
      if (phoneInput) phoneInput.placeholder = isHi ? 'मोबाइल नंबर दर्ज करें' : 'Enter mobile number';
      var pinInput = document.getElementById('staffPinInput');
      if (pinInput) pinInput.placeholder = isHi ? '6-अंकों का पिन दर्ज करें' : 'Enter 6-digit PIN';
      var remLabel = document.querySelector('.admin-remember-row .remember-label span');
      if (remLabel) remLabel.textContent = isHi ? 'इस फोन पर लॉगिन याद रखें' : 'Remember login on this device';
      var loginBtnLabel = document.querySelector('#btnStaffLogin .btn-label');
      if (loginBtnLabel) loginBtnLabel.textContent = isHi ? 'लॉगिन करें (Log In)' : 'Log In';
      var trustStrip = document.querySelector('.auth-trust-strip');
      if (trustStrip) {
        trustStrip.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px; color: var(--md-sys-color-tertiary, #059669); margin-right: 4px;" aria-hidden="true">verified_user</span><span>' + (isHi ? 'सुरक्षित स्टाफ पोर्टल' : 'Secure Staff Portal') + '</span>';
      }
      var inactiveMsg = document.getElementById('staffInactiveMsgBox');
      if (inactiveMsg) {
        inactiveMsg.innerHTML = isHi ? '🚫 आपका स्टाफ अकाउंट Inactive कर दिया गया है।<br>कृपया अपने एडमिन से संपर्क करें।' : '🚫 Your staff account is deactivated.<br>Please contact your administrator.';
      }

      // Search input placeholder
      var searchInp = document.getElementById('staffSearchInput');
      if (searchInp) {
        searchInp.placeholder = isHi ? 'ग्राहक का नाम, गाड़ी नंबर या पता खोजें...' : 'Search customer name, vehicle or address...';
      }

      // Category filter pills (Icon-free, clean bilingual labels)
      var pillDaily = document.getElementById('pillDailyClean');
      if (pillDaily) {
        var tDaily = pillDaily.querySelector('.pill-text');
        if (tDaily) tDaily.textContent = isHi ? 'दैनिक सफाई' : 'Daily Clean';
      }
      var pillWash = document.getElementById('pillCarWash');
      if (pillWash) {
        var tWash = pillWash.querySelector('.pill-text');
        if (tWash) tWash.textContent = isHi ? 'कार वॉश' : 'Car Wash';
      }
      var pillSolar = document.getElementById('pillSolarClean');
      if (pillSolar) {
        var tSolar = pillSolar.querySelector('.pill-text');
        if (tSolar) tSolar.textContent = isHi ? 'सोलर सफाई' : 'Solar Clean';
      }
      var pillSet = document.getElementById('pillStaffSettings');
      if (pillSet) {
        var tSet = pillSet.querySelector('.pill-text');
        if (tSet) tSet.textContent = isHi ? 'सेटिंग्स' : 'Settings';
      }

      // Route sequence header
      var rHeaderTitle = document.getElementById('routeHeaderTitle');
      if (rHeaderTitle) {
        rHeaderTitle.textContent = isHi ? "आज का सफाई रूट (Today's Route)" : "Today's Cleaning Route";
      }

      // Re-render customer cards if already loaded
      if (state.currentStaffFilteredList && state.currentStaffFilteredList.length > 0) {
        renderCustomerCards(state.currentStaffFilteredList);
      }
      if (typeof updateSettingsPrefButtons === 'function') updateSettingsPrefButtons();
    }

    /* =========================================================================
       GLOBAL UNIFIED HEADER CONTROLLERS & DROPDOWNS
       ========================================================================= */

    function toggleLangDropdown(e) {
      if (e) e.stopPropagation();
      var wrap = document.getElementById('langDropdownWrap');
      var panel = document.getElementById('langMenuPanel');
      if (!panel || !wrap) return;
      
      var isOpen = wrap.classList.contains('is-open') && panel.style.display !== 'none';
      closeAllHeaderPopovers();
      
      if (!isOpen) {
        var currentLang = state.lang || localStorage.getItem('cwp_lang') || 'en';
        var isHi = (currentLang === 'hi');
        var optEn = document.getElementById('langOptEn');
        var optHi = document.getElementById('langOptHi');
        if (optEn) optEn.classList.toggle('is-selected', !isHi);
        if (optHi) optHi.classList.toggle('is-selected', isHi);
        var checkEn = document.getElementById('checkLangEn');
        var checkHi = document.getElementById('checkLangHi');
        if (checkEn) checkEn.style.display = isHi ? 'none' : 'inline';
        if (checkHi) checkHi.style.display = isHi ? 'inline' : 'none';
        var langText = document.getElementById('langToggleText');
        if (langText) langText.textContent = isHi ? 'HI' : 'EN';

        panel.style.display = 'flex';
        wrap.classList.add('is-open');
        var trigger = document.getElementById('btnLangToggle');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
    }

    function closeLangDropdown() {
      var wrap = document.getElementById('langDropdownWrap');
      var panel = document.getElementById('langMenuPanel');
      if (panel) panel.style.display = 'none';
      if (wrap) wrap.classList.remove('is-open');
      var trigger = document.getElementById('btnLangToggle');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function selectAppLanguage(lang, e) {
      if (e) e.stopPropagation();
      closeLangDropdown();
      setLanguage(lang);
    }

    if (typeof window !== 'undefined') {
      window.toggleLangDropdown = toggleLangDropdown;
      window.closeLangDropdown = closeLangDropdown;
      window.selectAppLanguage = selectAppLanguage;
    }

    function toggleSyncDetailsPopover(e) {
      if (e) e.stopPropagation();
      var popover = document.getElementById('syncDetailsPopover');
      if (!popover) return;
      var isOpen = popover.style.display !== 'none';
      closeAllHeaderPopovers();
      
      if (!isOpen) {
        refreshSyncDetailsPopover();
        popover.style.display = 'block';
        var badge = document.getElementById('staffLiveBadge');
        if (badge) badge.setAttribute('aria-expanded', 'true');
      }
    }

    function closeSyncDetailsPopover(e) {
      if (e) e.stopPropagation();
      var popover = document.getElementById('syncDetailsPopover');
      if (popover) popover.style.display = 'none';
      var badge = document.getElementById('staffLiveBadge');
      if (badge) badge.setAttribute('aria-expanded', 'false');
    }

    function refreshSyncDetailsPopover() {
      var popTime = document.getElementById('popoverLastSyncVal');
      var popDot = document.getElementById('popoverStatusDot');
      var popHeading = document.getElementById('popoverStatusHeading');
      var popNet = document.getElementById('popoverNetworkVal');
      var isHi = (typeof state !== 'undefined' && state.lang !== 'en');
      var isOnline = (typeof navigator !== 'undefined' && navigator.onLine !== false);

      if (popTime) {
        popTime.textContent = formatSyncTime(lastStaffSyncTimestamp);
      }
      if (popNet) {
        popNet.textContent = isOnline 
          ? (isHi ? 'कनेक्टेड (सक्रिय)' : 'Online (Connected)')
          : (isHi ? 'ऑफ़लाइन (कैश्ड डेटा)' : 'Offline (Cached data)');
      }
      if (popDot) {
        if (!isOnline) {
          popDot.className = 'popover-dot dot-offline';
          if (popHeading) popHeading.textContent = isHi ? 'ऑफ़लाइन स्थिति' : 'Offline Status';
        } else if (isStaffSyncInProgress) {
          popDot.className = 'popover-dot status-sync-spinner';
          if (popHeading) popHeading.textContent = isHi ? 'डेटा सिंक हो रहा है...' : 'Syncing Data...';
        } else {
          popDot.className = 'popover-dot dot-live';
          if (popHeading) popHeading.textContent = isHi ? 'रीयल-टाइम कनेक्शन सक्रिय' : 'Realtime Connection Active';
        }
      }
    }

    function handleManualSyncClick(e) {
      if (e) e.stopPropagation();
      closeSyncDetailsPopover();
      if (typeof state !== 'undefined' && state.currentView === 'staff') {
        triggerManualStaffSync();
      } else if (typeof loadAdminRecords === 'function') {
        loadAdminRecords(true);
      }
    }

    function toggleAccountMenu(e) {
      if (e) e.stopPropagation();
      var wrap = document.getElementById('accountDropdownWrap');
      var panel = document.getElementById('accountMenuPanel');
      if (!panel || !wrap) return;
      var isOpen = wrap.classList.contains('is-open') && panel.style.display !== 'none';
      closeAllHeaderPopovers();
      
      if (!isOpen) {
        updateHeaderAccountStatus();
        panel.style.display = 'flex';
        wrap.classList.add('is-open');
        var trigger = document.getElementById('headerAccountTrigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
    }

    function closeAccountMenu() {
      var wrap = document.getElementById('accountDropdownWrap');
      var panel = document.getElementById('accountMenuPanel');
      if (panel) panel.style.display = 'none';
      if (wrap) wrap.classList.remove('is-open');
      var trigger = document.getElementById('headerAccountTrigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function closeAllHeaderPopovers() {
      closeLangDropdown();
      closeSyncDetailsPopover();
      closeAccountMenu();
    }

    function handleBrandLogoClick() {
      if (typeof state !== 'undefined' && state.currentView === 'admin') {
        if (typeof switchAdminTab === 'function') {
          switchAdminTab('records', true);
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function updateHeaderAccountStatus() {
      var staffHeader = document.getElementById('staffHeader');
      var adminHeader = document.getElementById('adminHeader');
      var accountTrigger = document.getElementById('headerAccountTrigger');
      var accountWrap = document.getElementById('accountDropdownWrap');
      var avatarInitial = document.getElementById('headerAccountInitial');
      var accountName = document.getElementById('headerAccountName');
      var accountRole = document.getElementById('headerAccountRole');
      var panelAvatar = document.getElementById('menuPanelAvatar');
      var panelName = document.getElementById('menuPanelName');
      var panelSub = document.getElementById('menuPanelSub');
      var staffLogout = document.getElementById('staffLogoutBtn') || document.getElementById('btnStaffSettingsLogout');
      var adminLogout = document.getElementById('adminLogoutBtn');
      var contextChip = document.getElementById('headerContextChip');
      var mainTitle = document.getElementById('pageMainTitle');
      var adminTitle = document.getElementById('adminHeaderTitle');
      var liveBadge = document.getElementById('staffLiveBadge');

      var isHi = (typeof state !== 'undefined' && state.lang !== 'en');
      var mode = (typeof state !== 'undefined' && state.currentView) || 'staff';

      if (mode === 'staff') {
        // Enforce Staff Header Active, Admin Header strictly Hidden
        if (staffHeader) staffHeader.style.setProperty('display', 'block', 'important');
        if (adminHeader) adminHeader.style.setProperty('display', 'none', 'important');
        if (contextChip) {
          contextChip.style.setProperty('display', 'none', 'important');
          contextChip.textContent = '';
        }
        if (mainTitle) mainTitle.textContent = isHi ? 'स्टाफ पोर्टल' : 'Staff Portal';
        if (liveBadge) liveBadge.style.setProperty('display', 'none', 'important');

        // Strictly hide Admin Account Trigger / Menu in Staff Mode
        if (accountWrap) {
          accountWrap.style.setProperty('display', 'none', 'important');
          accountWrap.classList.add('is-hidden');
        }
        if (accountTrigger) {
          accountTrigger.style.setProperty('display', 'none', 'important');
          accountTrigger.classList.add('is-hidden');
        }
        if (adminLogout) {
          adminLogout.style.setProperty('display', 'none', 'important');
          adminLogout.classList.add('is-hidden');
        }

        var isAuth = isUserStaffAuthenticated(state.activeStaffId);
        if (isAuth) {
          if (staffLogout) {
            staffLogout.style.setProperty('display', 'flex', 'important');
            staffLogout.classList.remove('is-hidden');
          }
        } else {
          if (staffLogout) {
            staffLogout.style.setProperty('display', 'none', 'important');
            staffLogout.classList.add('is-hidden');
          }
        }
      } else {
        // Admin Mode: Enforce Admin Header Active, Staff Header strictly Hidden
        if (adminHeader) adminHeader.style.setProperty('display', 'block', 'important');
        if (staffHeader) staffHeader.style.setProperty('display', 'none', 'important');
        if (contextChip) {
          contextChip.style.setProperty('display', 'inline-flex', 'important');
          contextChip.textContent = 'ADMIN';
        }
        if (adminTitle) adminTitle.textContent = 'Admin Portal';
        if (liveBadge) liveBadge.style.setProperty('display', 'inline-flex', 'important');

        var isAuth = isUserAdminAuthenticated();
        if (isAuth) {
          // Admin is authenticated: show Admin Profile & Logout options
          if (accountWrap) {
            accountWrap.style.removeProperty('display');
            accountWrap.style.setProperty('display', 'inline-flex', 'important');
            accountWrap.classList.remove('is-hidden');
          }
          if (accountTrigger) {
            accountTrigger.style.removeProperty('display');
            accountTrigger.style.setProperty('display', 'inline-flex', 'important');
            accountTrigger.classList.remove('is-hidden');
          }
          if (adminLogout) {
            // Top header logout suppressed; logout is exclusively in the sidebar footer
            adminLogout.style.setProperty('display', 'none', 'important');
            adminLogout.classList.add('is-hidden');
          }

          if (avatarInitial) avatarInitial.textContent = 'A';
          if (accountName) accountName.textContent = 'Admin';
          if (accountRole) accountRole.textContent = 'SUPER ADMIN';

          if (panelAvatar) panelAvatar.textContent = '🛡️';
          if (panelName) panelName.textContent = 'Super Administrator';
          if (panelSub) panelSub.textContent = 'Full Access • Enterprise Management';
        } else {
          // Admin Gate / Sign in page: STRICTLY HIDE account menu!
          if (accountWrap) {
            accountWrap.style.setProperty('display', 'none', 'important');
            accountWrap.classList.add('is-hidden');
          }
          if (accountTrigger) {
            accountTrigger.style.setProperty('display', 'none', 'important');
            accountTrigger.classList.add('is-hidden');
          }
          if (adminLogout) {
            adminLogout.style.setProperty('display', 'none', 'important');
            adminLogout.classList.add('is-hidden');
          }
        }
      }
    }

    // Global document listeners for popover dismissal
    if (typeof document !== 'undefined') {
      document.addEventListener('click', function(e) {
        var langWrap = document.getElementById('langDropdownWrap');
        var langPanel = document.getElementById('langMenuPanel');
        if (langWrap && langPanel && !langWrap.contains(e.target)) {
          closeLangDropdown();
        }

        var accountWrap = document.getElementById('accountDropdownWrap');
        var accountPanel = document.getElementById('accountMenuPanel');
        if (accountWrap && accountPanel && !accountWrap.contains(e.target)) {
          closeAccountMenu();
        }

        var statusWrap = document.querySelector('.header-status-wrapper');
        var syncPopover = document.getElementById('syncDetailsPopover');
        if (statusWrap && syncPopover && !statusWrap.contains(e.target)) {
          closeSyncDetailsPopover();
        }
      });

      /* Centralized CWP Aura Modal Ergonomics & ARIA Focus Trapping */
      var modalTriggerStack = [];

      function recordModalTrigger(triggerEl) {
        var elToRecord = null;
        if (triggerEl && typeof triggerEl.focus === 'function') {
          elToRecord = triggerEl;
        } else if (typeof document !== 'undefined' && document.activeElement) {
          elToRecord = document.activeElement;
        }
        if (elToRecord) {
          modalTriggerStack.push(elToRecord);
        }
      }

      function restoreModalTriggerFocus() {
        while (modalTriggerStack.length > 0) {
          var targetEl = modalTriggerStack.pop();
          if (targetEl && typeof targetEl.focus === 'function') {
            try {
              if (document && document.body && document.body.contains(targetEl)) {
                targetEl.focus();
                break;
              }
            } catch (err) {
              // Graceful fallback
            }
          }
        }
      }

      function getFocusableElements(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return [];
        var selector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';
        var rawElements = Array.prototype.slice.call(container.querySelectorAll(selector));
        return rawElements.filter(function(el) {
          return el.offsetWidth > 0 || el.offsetHeight > 0 || (typeof document !== 'undefined' && el === document.activeElement);
        });
      }

      function trapFocus(modalEl, e) {
        if (!modalEl) return;
        var focusable = getFocusableElements(modalEl);
        if (focusable.length === 0) {
          if (e) e.preventDefault();
          if (modalEl && typeof modalEl.focus === 'function') modalEl.focus();
          return;
        }
        var firstEl = focusable[0];
        var lastEl = focusable[focusable.length - 1];

        if (!e) {
          // Direct initialization
          if (typeof document !== 'undefined' && (!document.activeElement || !modalEl.contains(document.activeElement))) {
            firstEl.focus();
          }
          return;
        }

        if (e.key === 'Tab' || e.keyCode === 9) {
          if (e.shiftKey) {
            if (typeof document !== 'undefined' && (document.activeElement === firstEl || !modalEl.contains(document.activeElement))) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            if (typeof document !== 'undefined' && (document.activeElement === lastEl || !modalEl.contains(document.activeElement))) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      }

      function getTopmostOpenModal() {
        if (typeof document === 'undefined') return null;
        var modalDefinitions = [
          { id: 'seqResetModal', closer: function() { if (typeof closeSeqResetModal === 'function') closeSeqResetModal(); }, zIndex: 3000 },
          { id: 'pwaIosModal', closer: function() { if (typeof closePwaIosModal === 'function') closePwaIosModal(); }, zIndex: 10000 },
          { id: 'logoutConfirmModal', closer: function() { if (typeof closeLogoutModal === 'function') closeLogoutModal(); }, zIndex: 2200 },
          { id: 'cwpPhotoCropperModal', closer: function() { if (typeof closeCropperModal === 'function') closeCropperModal(); }, zIndex: 1200 },
          { id: 'cleaningCameraModal', closer: function() { if (typeof closeCleaningCameraModal === 'function') closeCleaningCameraModal(); }, zIndex: 1100 },
          { id: 'reportPhotoLightboxModal', closer: function() { if (typeof closeReportPhotoLightbox === 'function') closeReportPhotoLightbox(); }, zIndex: 1100 },
          { id: 'staffWhatsAppGroupModal', closer: function() { if (typeof closeStaffWhatsAppGroupModal === 'function') closeStaffWhatsAppGroupModal(); }, zIndex: 1100 },
          { id: 'whatsAppImageShareModal', closer: function() { if (typeof closeWhatsAppImageModal === 'function') closeWhatsAppImageModal(); }, zIndex: 1100 },
          { id: 'imageModal', closer: function() { if (typeof closeImageModal === 'function') closeImageModal(); }, zIndex: 1100 },
          { id: 'addressViewModal', closer: function() { if (typeof closeAddressModal === 'function') closeAddressModal(); }, zIndex: 1050 },
          { id: 'addCustomerModal', closer: function() { if (typeof closeAddCustomerModal === 'function') closeAddCustomerModal(); }, zIndex: 1000 },
          { id: 'editCustomerModal', closer: function() { if (typeof closeEditCustomerModal === 'function') closeEditCustomerModal(); }, zIndex: 1000 },
          { id: 'staffEditModal', closer: function() { if (typeof closeEditStaffModal === 'function') closeEditStaffModal(); }, zIndex: 1000 },
          { id: 'addLeadModal', closer: function() { if (typeof closeAddLeadModal === 'function') closeAddLeadModal(); }, zIndex: 1000 },
          { id: 'convertLeadModal', closer: function() { if (typeof closeConvertLeadModal === 'function') closeConvertLeadModal(); }, zIndex: 1000 },
          { id: 'leadNoteModal', closer: function() { if (typeof closeLeadNoteModal === 'function') closeLeadNoteModal(); }, zIndex: 1000 },
          { id: 'assignSpecialJobModal', closer: function() { if (typeof closeAssignSpecialJobModal === 'function') closeAssignSpecialJobModal(); }, zIndex: 1000 },
          { id: 'startSpecialJobModal', closer: function() { if (typeof closeStartSpecialJobModal === 'function') closeStartSpecialJobModal(); }, zIndex: 1000 },
          { id: 'completeSpecialJobModal', closer: function() { if (typeof closeCompleteSpecialJobModal === 'function') closeCompleteSpecialJobModal(); }, zIndex: 1000 }
        ];

        var openModals = [];
        modalDefinitions.forEach(function(item) {
          var el = document.getElementById(item.id);
          if (el && el.style.display !== 'none' && (!window.getComputedStyle || window.getComputedStyle(el).display !== 'none')) {
            var z = (window.getComputedStyle ? parseInt(window.getComputedStyle(el).zIndex, 10) : item.zIndex) || item.zIndex || 1000;
            openModals.push({ el: el, item: item, z: z });
          }
        });

        if (openModals.length === 0) {
          var dialogs = document.querySelectorAll('[role="dialog"]');
          Array.prototype.forEach.call(dialogs, function(dialogEl) {
            if (dialogEl.style.display !== 'none' && (!window.getComputedStyle || window.getComputedStyle(dialogEl).display !== 'none')) {
              var z = (window.getComputedStyle ? parseInt(window.getComputedStyle(dialogEl).zIndex, 10) : 1000) || 1000;
              openModals.push({ el: dialogEl, item: { id: dialogEl.id, closer: function() { dialogEl.style.display = 'none'; } }, z: z });
            }
          });
        }

        if (openModals.length === 0) return null;
        openModals.sort(function(a, b) { return b.z - a.z; });
        return openModals[0];
      }

      function closeTopmostModal() {
        var topmost = getTopmostOpenModal();
        if (topmost) {
          if (topmost.item && typeof topmost.item.closer === 'function') {
            topmost.item.closer();
          }
          if (topmost.el && topmost.el.style && topmost.el.style.display !== 'none') {
            topmost.el.style.display = 'none';
          }
          if (getTopmostOpenModal() === null && typeof document !== 'undefined' && document.body) {
            document.body.style.overflow = '';
          }
          restoreModalTriggerFocus();
          return true;
        }
        return false;
      }

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var closedModal = closeTopmostModal();
          if (!closedModal) {
            closeAllHeaderPopovers();
          }
        } else if (e.key === 'Tab' || e.keyCode === 9) {
          var activeModal = getTopmostOpenModal();
          if (activeModal && activeModal.el) {
            trapFocus(activeModal.el, e);
          }
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', function() {
        updateStaffSyncIndicator('active', 'Online');
        refreshSyncDetailsPopover();
      });

      window.addEventListener('offline', function() {
        updateStaffSyncIndicator('offline', 'Network Offline');
        refreshSyncDetailsPopover();
      });

      window.toggleLangDropdown = toggleLangDropdown;
      window.closeLangDropdown = closeLangDropdown;
      window.selectAppLanguage = selectAppLanguage;
      window.toggleSyncDetailsPopover = toggleSyncDetailsPopover;
      window.closeSyncDetailsPopover = closeSyncDetailsPopover;
      window.refreshSyncDetailsPopover = refreshSyncDetailsPopover;
      window.handleManualSyncClick = handleManualSyncClick;
      window.toggleAccountMenu = toggleAccountMenu;
      window.closeAccountMenu = closeAccountMenu;
      window.closeAllHeaderPopovers = closeAllHeaderPopovers;
      window.handleBrandLogoClick = handleBrandLogoClick;
      window.updateHeaderAccountStatus = updateHeaderAccountStatus;

      /* Export CWP Aura Modal Ergonomics & ARIA APIs */
      window.trapFocus = trapFocus;
      window.closeTopmostModal = closeTopmostModal;
      window.recordModalTrigger = recordModalTrigger;
      window.restoreModalTriggerFocus = restoreModalTriggerFocus;
      window.getFocusableElements = getFocusableElements;
      window.getTopmostOpenModal = getTopmostOpenModal;
    }




    /* Sync CWP Brand Logo across all Auth and Modal views */
    function syncBrandLogos() {
      var headerLogo = document.querySelector('.brand-logo-img');
      if (headerLogo && headerLogo.src) {
        var logos = document.querySelectorAll('.auth-brand-logo, .auth-card-logo');
        for (var i = 0; i < logos.length; i++) {
          if (logos[i].src !== headerLogo.src) {
            logos[i].src = headerLogo.src;
          }
        }
      }
    }

    /* =========================================================================
       GOOGLE INDIC TRANSLITERATION & DUAL LANGUAGE HELPERS
       ========================================================================= */
    function transliterateTextViaApi(text, type) {
      if (!text || !text.trim()) return Promise.resolve({ success: true, text: '', transliterated: '' });
      return fetch('/api/indic/transliterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, type: type || 'general' })
      }).then(function(res) {
        if (!res.ok) throw new Error('Transliterate HTTP error: ' + res.status);
        return res.json();
      });
    }

    function setupIndicInputListeners() {
      function bindDebouncedTransliterate(sourceId, targetId, type) {
        var src = document.getElementById(sourceId);
        var tgt = document.getElementById(targetId);
        if (!src || !tgt) return;
        if (typeof src.addEventListener !== 'function') return;
        if (src._indicBound) return;
        src._indicBound = true;
        var timer = null;
        function doTransliterate() {
          clearTimeout(timer);
          var val = src.value.trim();
          if (!val) { tgt.value = ''; return; }
          timer = setTimeout(function() {
            transliterateTextViaApi(val, type).then(function(res) {
              if (res && res.transliterated) {
                tgt.value = res.transliterated;
              }
            }).catch(function(e) {
              console.warn('[IndicTransliterate] failed:', e.message);
            });
          }, 300);
        }
        src.addEventListener('input', doTransliterate);
        src.addEventListener('change', doTransliterate);
      }

      bindDebouncedTransliterate('custName', 'custNameHi', 'name');
      bindDebouncedTransliterate('custAddress', 'custAddressHi', 'address');
      bindDebouncedTransliterate('custSecAddress', 'custSecAddressHi', 'address');
      bindDebouncedTransliterate('editCustName', 'editCustNameHi', 'name');
      bindDebouncedTransliterate('editCustAddress', 'editCustAddressHi', 'address');
      bindDebouncedTransliterate('editCustSecAddress', 'editCustSecAddressHi', 'address');
    }

    function speakHindiCustomerDetails(name, address, event) {
      if (event) event.stopPropagation();
      if (!('speechSynthesis' in window)) {
        showToast('स्पीच सिंथेसाइज़र समर्थित नहीं है', '⚠️');
        return;
      }
      try {
        window.speechSynthesis.cancel();
        var text = (name || '').trim();
        if (address) text += ', पता: ' + address;
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.88;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech error:', e);
      }
    }

    function handleBackfillHindi() {
      var isHi = (state.lang !== 'en');
      var msg = isHi
        ? 'क्या आप Google Indic के माध्यम से सभी मौजूदा ग्राहकों के नाम और पते हिंदी में स्वतः बनाना चाहते हैं?'
        : 'Do you want to auto-generate Hindi Name & Address for all existing customers using Google Indic?';
      if (!confirm(msg)) return;

      var btn = document.getElementById('btnAdminBackfillHindi');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="cwp-spinner"></span> ' + (isHi ? 'प्रोसेसिंग...' : 'Translating...');
      }

      apiCall('backfillHindi', {}, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="btn-admin-icon-text">🌐 Auto Indic</span>';
        }
        if (res && res.success) {
          showToast(isHi ? (res.updated + ' ग्राहकों का हिंदी डेटा अपडेट हो गया!') : (res.updated + ' customers updated with Hindi data!'), '🌐');
          loadAdminRecords(true);
        } else {
          showToast(res && res.error ? res.error : 'Failed to backfill Hindi data', '⚠️');
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.transliterateTextViaApi = transliterateTextViaApi;
      window.setupIndicInputListeners = setupIndicInputListeners;
      window.refreshLeadsBadgeCount = refreshLeadsBadgeCount;
      window.handleCustIsLeadToggle = handleCustIsLeadToggle;
      window.openAddLeadModal = openAddLeadModal;
      window.closeAddLeadModal = closeAddLeadModal;
      window.openEditLeadModal = openEditLeadModal;
      window.closeEditLeadModal = closeEditLeadModal;
      window.triggerLeadPhotoSelect = triggerLeadPhotoSelect;
      window.handleLeadPhotoSelect = handleLeadPhotoSelect;
      window.removeLeadPhoto = removeLeadPhoto;
      window.openExistingLeadPhotoCropper = openExistingLeadPhotoCropper;
      window.detectLeadGpsLocation = detectLeadGpsLocation;
      window.setLeadQuickNote = setLeadQuickNote;
      window.setLeadModalNote = setLeadModalNote;
      window.handleLeadSubmit = handleLeadSubmit;
      window.loadAdminLeads = loadAdminLeads;
      window.renderAdminLeadsList = renderAdminLeadsList;
      window.switchLeadsViewMode = switchLeadsViewMode;
      window.setLeadCategoryFilter = setLeadCategoryFilter;
      window.setLeadStageFilter = setLeadStageFilter;
      window.updateLeadStage = updateLeadStage;
      window.shiftLeadStage = shiftLeadStage;
      window.handleLeadDragStart = handleLeadDragStart;
      window.handleLeadDragEnd = handleLeadDragEnd;
      window.handleLeadDragOver = handleLeadDragOver;
      window.handleLeadDragEnter = handleLeadDragEnter;
      window.handleLeadDragLeave = handleLeadDragLeave;
      window.handleLeadDrop = handleLeadDrop;
      window.renderAdminLeadsTable = renderAdminLeadsTable;
      window.renderAdminLeadsKanban = renderAdminLeadsKanban;
      window.openConvertLeadModal = openConvertLeadModal;
      window.closeConvertLeadModal = closeConvertLeadModal;
      window.handleConvertCategoryChange = handleConvertCategoryChange;
      window.handleConvertLeadSubmit = handleConvertLeadSubmit;
      window.openLeadNoteModal = openLeadNoteModal;
      window.closeLeadNoteModal = closeLeadNoteModal;
      window.handleSaveLeadNoteSubmit = handleSaveLeadNoteSubmit;
      window.deleteLead = deleteLead;
      window.handleLeadsSearch = handleLeadsSearch;
      window.clearLeadsSearch = clearLeadsSearch;

      window.speakHindiCustomerDetails = speakHindiCustomerDetails;
      window.handleBackfillHindi = handleBackfillHindi;
      window.initStaffBottomNavKeyboardHandling = initStaffBottomNavKeyboardHandling;
    }

    function initStaffBottomNavKeyboardHandling() {
      var nav = document.getElementById('staffBottomNav');
      if (!nav) return;

      var hideTimer = null;
      function hideNav() {
        if (hideTimer) clearTimeout(hideTimer);
        nav.classList.add('is-keyboard-hidden');
        document.body.classList.add('keyboard-open');
      }

      function showNav() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(function() {
          nav.classList.remove('is-keyboard-hidden');
          document.body.classList.remove('keyboard-open');
        }, 120);
      }

      document.addEventListener('focusin', function(e) {
        var target = e.target;
        if (!target) return;
        var tag = (target.tagName || '').toLowerCase();
        var type = (target.type || '').toLowerCase();
        if (tag === 'textarea' || (tag === 'input' && (type === 'text' || type === 'tel' || type === 'search' || type === 'number' || type === 'password'))) {
          hideNav();
        }
      });

      document.addEventListener('focusout', function(e) {
        var target = e.target;
        if (!target) return;
        var tag = (target.tagName || '').toLowerCase();
        if (tag === 'textarea' || tag === 'input') {
          showNav();
        }
      });

      if (window.visualViewport) {
        var baseHeight = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', function() {
          if (window.visualViewport.height < baseHeight * 0.78) {
            hideNav();
          } else {
            showNav();
            baseHeight = window.visualViewport.height;
          }
        });
      }
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupIndicInputListeners);
      } else {
        setupIndicInputListeners();
      }
    }

    /* Initialize Application */
    document.addEventListener('DOMContentLoaded', function() {
      initTheme();
      initLanguage();
      initAllPhoneFormatters();
      initStaffPinDots();
      syncBrandLogos();
      setupIndicInputListeners();
      initStaffBottomNavKeyboardHandling();
      if (typeof initDesktopSidebarState === 'function') initDesktopSidebarState();
      var editPhotoInp = document.getElementById('editStaffPhotoFile');
      if (editPhotoInp) {
        editPhotoInp.addEventListener('change', function(e) { handleStaffPhotoSelect(e, 'edit'); });
      }
      var newPhotoInp = document.getElementById('newStaffPhotoFile');
      if (newPhotoInp) {
        newPhotoInp.addEventListener('change', function(e) { handleStaffPhotoSelect(e, 'new'); });
      }
      var urlParams = new URLSearchParams(window.location.search);
      var paramStaff = urlParams.get('staff') || urlParams.get('id') || '';
      var paramAdmin = urlParams.get('admin');
      var path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
      var isStaffPath = path === '/staff' || path.startsWith('/staff/');
      var isAdminPath = path === '/admin' || path.startsWith('/admin/');

      var savedRole = '';
      try {
        savedRole = sessionStorage.getItem('cwp_user_role') || '';
      } catch (e) {}

      /* Decide view mode: Decoupled strict logic with role persistence */
      if (isAdminPath || (paramAdmin !== null && paramAdmin !== undefined)) {
        state.currentView = 'admin';
      } else if (isStaffPath || (paramStaff && paramStaff.trim() !== '')) {
        state.currentView = 'staff';
        if (paramStaff) state.activeStaffId = paramStaff.trim();
      } else if (savedRole === 'admin') {
        state.currentView = 'admin';
      } else if (savedRole === 'staff') {
        state.currentView = 'staff';
      } else if (initialMode === 'admin') {
        state.currentView = 'admin';
      } else if (initialMode === 'staff') {
        state.currentView = 'staff';
        if (initialStaffId) state.activeStaffId = initialStaffId;
      } else if (isUserAdminAuthenticated()) {
        state.currentView = 'admin';
      } else {
        /* Default fallback */
        state.currentView = 'staff';
      }

      applyViewMode(state.currentView, true);
    });

    /* Apply View Mode: Completely separates Staff and Admin UI */
    function applyViewMode(mode, isInitial) {
      state.currentView = mode;
      var staffEl = document.getElementById('staffView');
      var adminEl = document.getElementById('adminView');
      var staffControls = document.getElementById('staffHeaderControls');
      var liveBadge = document.getElementById('staffLiveBadge');
      var staffLogout = document.getElementById('staffLogoutBtn');
      var adminControls = document.getElementById('adminHeaderControls');
      var titleEl = document.getElementById('pageMainTitle');
      var mainContainer = document.querySelector('.main-container');
      var headerInner = document.querySelector('.header-inner');

      try {
        sessionStorage.setItem('cwp_user_role', mode);
      } catch (e) {}

      // Sync clean browser URL (/staff or /admin) without page reload
      if (window.history && (window.history.replaceState || window.history.pushState)) {
        var currentPath = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
        var targetPath = mode === 'staff' ? '/staff' : '/admin';
        var isGas = (window.location.pathname || '').indexOf('/exec') !== -1;
        if (!isGas && currentPath !== targetPath) {
          var targetSearch = window.location.search || '';
          if (isInitial && window.history.replaceState) {
            window.history.replaceState({ mode: mode }, '', targetPath + targetSearch);
          } else if (window.history.pushState) {
            window.history.pushState({ mode: mode }, '', targetPath + targetSearch);
          }
        }
      }

      var staffHeader = document.getElementById('staffHeader');
      var adminHeader = document.getElementById('adminHeader');

      if (mode === 'staff') {
        document.documentElement.classList.remove('admin-login-lock');
        document.body.classList.remove('admin-login-lock');
        document.body.classList.remove('admin-mode-active');
        document.body.classList.add('staff-mode-active');
        if (mainContainer) mainContainer.classList.remove('admin-mode-active');
        if (headerInner) headerInner.classList.remove('admin-mode-active');
        if (staffHeader) staffHeader.style.setProperty('display', 'block', 'important');
        if (adminHeader) adminHeader.style.setProperty('display', 'none', 'important');
        if (staffEl) staffEl.style.display = 'block';
        if (adminEl) adminEl.style.display = 'none';
        if (staffControls) staffControls.style.display = 'flex';
        if (liveBadge) liveBadge.style.display = 'none';
        if (adminControls) adminControls.style.display = 'none';
        var langWrap = document.getElementById('langDropdownWrap');
        if (langWrap) langWrap.style.setProperty('display', 'none', 'important');
        var themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) themeBtn.style.setProperty('display', 'none', 'important');
        var accWrap = document.getElementById('accountDropdownWrap');
        if (accWrap) accWrap.style.setProperty('display', 'none', 'important');
        var chipEl = document.getElementById('headerContextChip');
        if (chipEl) {
          chipEl.style.setProperty('display', 'none', 'important');
          chipEl.textContent = '';
        }
        if (titleEl) titleEl.textContent = state.lang === 'en' ? 'Staff Portal' : 'स्टाफ पोर्टल';
        checkStaffAuthStatus(state.activeStaffId);
        syncBrandLogos();
        if (typeof updatePwaInstallState === 'function') updatePwaInstallState();
        if (typeof updateSettingsPrefButtons === 'function') updateSettingsPrefButtons();
      } else {
        document.body.classList.add('admin-mode-active');
        document.body.classList.remove('staff-mode-active');
        if (mainContainer) mainContainer.classList.add('admin-mode-active');
        if (headerInner) headerInner.classList.add('admin-mode-active');
        if (adminHeader) {
          if (isUserAdminAuthenticated()) {
            adminHeader.style.setProperty('display', 'block', 'important');
          } else {
            adminHeader.style.setProperty('display', 'none', 'important');
          }
        }
        if (staffHeader) staffHeader.style.setProperty('display', 'none', 'important');
        if (staffEl) staffEl.style.display = 'none';
        if (adminEl) adminEl.style.display = 'block';
        if (staffControls) staffControls.style.display = 'none';
        if (adminControls) adminControls.style.display = 'flex';
        var langWrap = document.getElementById('langDropdownWrap');
        if (langWrap) langWrap.style.removeProperty('display');
        var themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) themeBtn.style.removeProperty('display');
        var accWrap = document.getElementById('accountDropdownWrap');
        if (accWrap) accWrap.style.removeProperty('display');
        var chipEl = document.getElementById('headerContextChip');
        if (chipEl) {
          chipEl.style.setProperty('display', 'inline-flex', 'important');
          chipEl.textContent = 'ADMIN';
        }
        if (titleEl) titleEl.textContent = 'Admin Portal';
        checkAdminAuthStatus();
        syncBrandLogos();
        if (typeof hidePwaUi === 'function') hidePwaUi();
      }
      if (typeof updateHeaderAccountStatus === 'function') updateHeaderAccountStatus();
    }

    /* Staff Authentication & Security Logic */
    function getStaffAuthKey(staffId) {
      var id = staffId || (typeof getActiveStaffId === 'function' ? getActiveStaffId() : state.activeStaffId) || 'DEFAULT';
      return 'cwp_staff_auth_' + id.toUpperCase();
    }

    function getStaffToken(staffId) {
      var key = getStaffAuthKey(staffId) + '_token';
      return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
    }

    function clearStaffTokens(staffId) {
      stopStaffAutoSync();
      var id = staffId || (typeof getActiveStaffId === 'function' ? getActiveStaffId() : state.activeStaffId) || 'DEFAULT';
      var key = getStaffAuthKey(id);
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      sessionStorage.removeItem(key + '_token');
      localStorage.removeItem(key + '_token');
    }

    function getActiveStaffId() {
      if (state.activeStaffId) return state.activeStaffId;
      var saved = sessionStorage.getItem('cwp_last_staff_id') || localStorage.getItem('cwp_last_staff_id') || '';
      if (saved) {
        state.activeStaffId = saved;
        return saved;
      }
      return '';
    }

    function isUserStaffAuthenticated(staffId) {
      var id = staffId || getActiveStaffId();
      return !!getStaffToken(id);
    }

    function updateStaffPinDots() {
      var pinInp = document.getElementById('staffPinInput');
      var dots = document.querySelectorAll('#staffPinDotsRow .cwp-pin-dot');
      if (!pinInp || !dots || !dots.length) return;
      var len = (pinInp.value || '').length;
      for (var i = 0; i < dots.length; i++) {
        if (i < len) {
          dots[i].classList.add('filled');
          if (len === 6) dots[i].classList.add('complete');
          else dots[i].classList.remove('complete');
        } else {
          dots[i].classList.remove('filled', 'complete');
        }
      }
    }

    function initStaffPinDots() {
      var pinInp = document.getElementById('staffPinInput');
      if (pinInp) {
        pinInp.addEventListener('input', updateStaffPinDots);
        pinInp.addEventListener('change', updateStaffPinDots);
        pinInp.addEventListener('keyup', updateStaffPinDots);
        updateStaffPinDots();
      }
    }

    function checkStaffAuthStatus(staffId) {
      var activeId = staffId || getActiveStaffId();
      if (activeId) state.activeStaffId = activeId;

      var authGate = document.getElementById('staffAuthGate');
      var content = document.getElementById('staffContent');
      var logoutBtn = document.getElementById('staffLogoutBtn');
      var liveBadge = document.getElementById('staffLiveBadge');
      var inactiveBox = document.getElementById('staffInactiveMsgBox');
      var errBox = document.getElementById('staffAuthError');
      var phoneInput = document.getElementById('staffPhoneInput');
      var pinInput = document.getElementById('staffPinInput');
      var loaderBanner = document.getElementById('staffLoginLoaderBanner');

      if (inactiveBox) inactiveBox.style.display = 'none';
      if (errBox) errBox.style.display = 'none';
      if (loaderBanner) loaderBanner.style.display = 'none';

      if (activeId && isUserStaffAuthenticated(activeId)) {
        if (authGate) {
          authGate.classList.add('is-hidden');
          authGate.setAttribute('hidden', 'true');
          authGate.style.setProperty('display', 'none', 'important');
        }
        if (content) {
          content.classList.remove('is-hidden');
          content.removeAttribute('hidden');
          content.style.setProperty('display', 'block', 'important');
        }
        var bottomNav = document.getElementById('staffBottomNav');
        if (bottomNav) {
          bottomNav.style.removeProperty('display');
          bottomNav.style.display = 'grid';
          bottomNav.classList.remove('is-keyboard-hidden');
        }
        document.body.classList.remove('keyboard-open');
        if (logoutBtn) {
          logoutBtn.style.setProperty('display', 'none', 'important');
          logoutBtn.classList.add('is-hidden');
        }
        if (typeof initDesktopSidebarState === 'function') initDesktopSidebarState();
        if (liveBadge) liveBadge.style.display = 'none';
        loadStaffCustomerData(activeId);
        if (typeof updateHeaderAccountStatus === 'function') updateHeaderAccountStatus();
      } else {
        if (authGate) {
          authGate.classList.remove('is-hidden');
          authGate.removeAttribute('hidden');
          authGate.style.removeProperty('display');
          authGate.style.display = 'flex';
          authGate.classList.add('cwp-gate-enter');
        }
        if (content) {
          content.classList.add('is-hidden');
          content.setAttribute('hidden', 'true');
          content.style.setProperty('display', 'none', 'important');
        }
        var bottomNav = document.getElementById('staffBottomNav');
        if (bottomNav) {
          bottomNav.style.display = 'none';
        }
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (liveBadge) liveBadge.style.display = 'none';
        if (typeof updateHeaderAccountStatus === 'function') updateHeaderAccountStatus();

        // Auto-fill phone if previously entered or saved
        var savedPhone = sessionStorage.getItem('cwp_last_staff_phone') || localStorage.getItem('cwp_last_staff_phone') || '';
        if (phoneInput && savedPhone) {
          phoneInput.value = savedPhone;
        }

        if (pinInput) {
          pinInput.value = '';
          updateStaffPinDots();
          setTimeout(function() {
            if (phoneInput && !phoneInput.value) {
              phoneInput.focus();
            } else if (pinInput) {
              pinInput.focus();
            }
          }, 150);
        }
      }
    }

    function handleStaffAuthSubmit(e) {
      e.preventDefault();
      var phoneInput = document.getElementById('staffPhoneInput');
      var pinInput = document.getElementById('staffPinInput');
      var rawPhone = phoneInput ? phoneInput.value : '';
      var phone = normalizeIndianMobile(rawPhone);
      var pin = (pinInput ? pinInput.value : '').trim();
      var errBox = document.getElementById('staffAuthError');
      var inactiveBox = document.getElementById('staffInactiveMsgBox');
      var btn = document.getElementById('btnStaffLogin');
      var isHi = (state.lang !== 'en');
      var loaderBanner = document.getElementById('staffLoginLoaderBanner');
      var loaderMsg = document.getElementById('staffLoginLoaderMsg');
      var card = document.querySelector('#staffAuthGate .admin-auth-card');

      if (!phone || !isValidIndianMobile(phone)) {
        if (errBox) {
          errBox.textContent = isHi ? '❌ कृपया 10-अंकों का वैध भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू)।' : '❌ Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).';
          errBox.style.display = 'block';
        }
        showToast(isHi ? 'अरे भाई! मोबाइल नंबर तो पूरा 10 डिजिट लिखो!' : 'Hold up! Enter all 10 digits of your phone number!', 'warning');
        if (phoneInput) {
          triggerInputShake(phoneInput);
          phoneInput.focus();
        }
        if (card) triggerInputShake(card);
        return;
      }

      if (!pin || pin.length !== 6) {
        if (errBox) {
          errBox.textContent = isHi ? '❌ कृपया पूरा 6-अंकों का पासवर्ड (पिन) दर्ज करें।' : '❌ Please enter your full 6-digit security PIN.';
          errBox.style.display = 'block';
        }
        showToast(isHi ? '6 डिजिट का पिन चाहिए, अधूरा क्यों छोड़ रहे हो?' : 'PIN must be 6 digits, don’t leave it short!', 'warning');
        if (pinInput) {
          triggerInputShake(pinInput);
          pinInput.focus();
        }
        if (card) triggerInputShake(card);
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.classList.add('cwp-btn-loading');
        btn.innerHTML = '<span class="cwp-btn-spinner"></span> <span class="btn-label">' + (isHi ? 'सत्यापित हो रहा है...' : 'Verifying Credentials...') + '</span>';
      }
      if (loaderBanner) {
        loaderBanner.style.display = 'flex';
        if (loaderMsg) loaderMsg.textContent = isHi ? 'CWP सुरक्षित सर्वर से प्रमाणीकरण हो रहा है...' : 'Authenticating with CWP Cloud...';
      }
      if (errBox) errBox.style.display = 'none';
      if (inactiveBox) inactiveBox.style.display = 'none';

      apiCall('verifyStaffPin', { phone: phone, pin: pin }, function(res) {
        if (res && res.inactive) {
          if (btn) {
            btn.disabled = false;
            btn.classList.remove('cwp-btn-loading');
            btn.innerHTML = '<span class="btn-label">' + (isHi ? 'लॉगिन करें (Log In)' : 'Log In') + '</span> <span class="btn-icon">→</span>';
          }
          if (loaderBanner) loaderBanner.style.display = 'none';
          if (inactiveBox) inactiveBox.style.display = 'block';
          if (errBox) errBox.style.display = 'none';
          if (card) triggerInputShake(card);
          showToast(isHi ? '🚫 आपका अकाउंट निष्क्रिय है! एडमिन से बात करें।' : '🚫 Your account is deactivated! Contact your admin.', 'warning');
          return;
        }

        if (res && res.success) {
          state.activeStaffId = res.staffId;
          var remember = document.getElementById('rememberStaffDevice') ? document.getElementById('rememberStaffDevice').checked : true;
          var key = getStaffAuthKey(res.staffId);
          var token = res.token || 'authenticated';
          
          sessionStorage.setItem('cwp_last_staff_id', res.staffId);
          sessionStorage.setItem('cwp_last_staff_phone', phone);
          sessionStorage.setItem(key, 'authenticated');
          sessionStorage.setItem(key + '_token', token);
          sessionStorage.setItem('cwp_user_role', 'staff');
          if (remember) {
            localStorage.setItem('cwp_last_staff_id', res.staffId);
            localStorage.setItem('cwp_last_staff_phone', phone);
            localStorage.setItem(key, 'authenticated');
            localStorage.setItem(key + '_token', token);
          }
          if (pinInput) pinInput.value = '';
          updateStaffPinDots();

          // Smooth success animation before transition
          if (btn) {
            btn.classList.remove('cwp-btn-loading');
            btn.classList.add('cwp-btn-success');
            btn.innerHTML = '<span class="btn-icon">✓</span> <span class="btn-label">' + (isHi ? 'सत्यापित! स्वागत है...' : 'Verified! Welcome...') + '</span>';
          }
          if (loaderBanner && loaderMsg) {
            loaderMsg.textContent = isHi ? '✓ प्रमाणीकरण सफल! पोर्टल लोड हो रहा है...' : '✓ Verification Successful! Opening Portal...';
          }

          setTimeout(function() {
            var authGate = document.getElementById('staffAuthGate');
            var content = document.getElementById('staffContent');
            if (authGate) {
              authGate.classList.add('cwp-gate-fadeout');
              setTimeout(function() {
                authGate.classList.add('is-hidden');
                authGate.setAttribute('hidden', 'true');
                authGate.style.setProperty('display', 'none', 'important');
                authGate.classList.remove('cwp-gate-fadeout');
                if (btn) {
                  btn.disabled = false;
                  btn.classList.remove('cwp-btn-success');
                  btn.innerHTML = '<span class="btn-label">' + (isHi ? 'लॉगिन करें (Log In)' : 'Log In') + '</span> <span class="btn-icon">→</span>';
                }
                if (loaderBanner) loaderBanner.style.display = 'none';
              }, 250);
            }
            if (content) {
              content.classList.remove('is-hidden');
              content.removeAttribute('hidden');
              content.style.setProperty('display', 'block', 'important');
              content.classList.add('cwp-content-fadein');
            }

            // Keep clean URL: /staff without parameter leakage
            if (window.history && window.history.replaceState) {
              window.history.replaceState({ mode: 'staff' }, '', '/staff');
            }

            showToast(isHi ? ('नमस्ते ' + (res.staffName || 'स्टाफ') + '! लॉगिन सफल हुआ।') : ('Welcome ' + (res.staffName || 'Staff') + '! Login successful.'), 'success');
            checkStaffAuthStatus(res.staffId);
          }, 350);

        } else {
          if (btn) {
            btn.disabled = false;
            btn.classList.remove('cwp-btn-loading');
            btn.innerHTML = '<span class="btn-label">' + (isHi ? 'लॉगिन करें (Log In)' : 'Log In') + '</span> <span class="btn-icon">→</span>';
          }
          if (loaderBanner) loaderBanner.style.display = 'none';
          if (errBox) {
            errBox.textContent = '❌ ' + (res && res.error ? res.error : (isHi ? 'गलत मोबाइल नंबर या 6-डिजिट पासवर्ड!' : 'Incorrect phone number or 6-digit PIN!'));
            errBox.style.display = 'block';
          }
          showToast(isHi ? 'गलत पिन! ध्यान से देखकर दोबारा डालो।' : 'Wrong PIN! Double check and try again.', 'error');
          if (pinInput) {
            triggerInputShake(pinInput);
            pinInput.focus();
          }
          if (card) triggerInputShake(card);
        }
      }, function(err) {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('cwp-btn-loading');
          btn.innerHTML = '<span class="btn-label">' + (isHi ? 'लॉगिन करें (Log In)' : 'Log In') + '</span> <span class="btn-icon">→</span>';
        }
        if (loaderBanner) loaderBanner.style.display = 'none';
        if (errBox) {
          errBox.textContent = '❌ ' + (err.message || (isHi ? 'वेरिफिकेशन फेल हुआ' : 'Verification failed'));
          errBox.style.display = 'block';
        }
        showToast(isHi ? 'नेटवर्क समस्या! कनेक्शन चेक करें।' : 'Network issue! Check your connection.', 'error');
        if (card) triggerInputShake(card);
      });
    }

    function openLogoutModal(type) {
      var triggerEl = arguments[1];
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      state.pendingLogoutType = type || 'staff';
      syncBrandLogos();

      // Reset modal view back to prompt view
      var promptView = document.getElementById('logoutPromptView');
      var progressView = document.getElementById('logoutProgressBox');
      var cancelBtn = document.getElementById('btnLogoutCancel');
      var proceedBtn = document.getElementById('btnLogoutProceed');
      if (promptView) promptView.style.display = 'block';
      if (progressView) progressView.style.display = 'none';
      if (cancelBtn) cancelBtn.disabled = false;
      if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.classList.remove('btn-loading');
      }

      var heading = document.querySelector('#logoutConfirmModal .logout-confirm-heading');
      var desc = document.querySelector('#logoutConfirmModal .logout-confirm-desc');
      var userChip = document.getElementById('logoutStaffUserBadge');
      var nameText = document.getElementById('logoutStaffNameText');
      var idText = document.getElementById('logoutStaffIdText');
      var proceedText = proceedBtn ? proceedBtn.querySelector('.btn-text') : null;
      var cancelText = cancelBtn ? cancelBtn.querySelector('.btn-text') : null;
      var isHi = (state.lang !== 'en');

      if (type === 'admin') {
        if (heading) heading.textContent = 'Admin Portal Logout';
        if (desc) desc.textContent = 'Are you sure you want to securely log out from the CWP Admin Portal?';
        if (userChip) {
          userChip.style.display = 'inline-flex';
          if (nameText) nameText.textContent = 'Administrator';
          if (idText) idText.textContent = 'SUPER ADMIN';
        }
        if (proceedText) proceedText.textContent = 'Log Out Securely';
        if (cancelText) cancelText.textContent = 'Cancel';
      } else {
        if (heading) heading.textContent = isHi ? 'स्टाफ लॉगआउट (Shift Sign Out)' : 'Staff Shift Sign Out';
        if (desc) desc.textContent = isHi 
          ? 'क्या आप वाकई अपना आज का कार्य सत्र (Shift) सुरक्षित रूप से समाप्त करके लॉगआउट करना चाहते हैं?'
          : 'Are you sure you want to securely end your daily shift and log out?';
        
        var staffId = state.activeStaffId || sessionStorage.getItem('cwp_last_staff_id') || localStorage.getItem('cwp_last_staff_id') || '';
        var staffName = '';
        var nameHeader = document.getElementById('staffNameHeader');
        if (nameHeader && nameHeader.textContent && nameHeader.textContent !== 'लोड हो रहा है...') {
          staffName = nameHeader.textContent;
        } else if (appState && appState.staffList) {
          var found = appState.staffList.find(function(s) { return (s.id || '').toUpperCase() === staffId.toUpperCase(); });
          if (found && found.name) staffName = found.name;
        }
        
        if (userChip) {
          if (staffName || staffId) {
            userChip.style.display = 'inline-flex';
            if (nameText) nameText.textContent = staffName || (isHi ? 'स्टाफ सदस्य' : 'Staff Member');
            if (idText) idText.textContent = staffId ? '(' + staffId + ')' : '';
          } else {
            userChip.style.display = 'none';
          }
        }
        if (proceedText) proceedText.textContent = isHi ? 'हाँ, लॉगआउट करें' : 'Yes, Sign Out';
        if (cancelText) cancelText.textContent = isHi ? 'वापस जाएं (Cancel)' : 'Cancel';
      }

      var modal = document.getElementById('logoutConfirmModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function showLogoutModal(type, triggerEl) {
      return openLogoutModal(type, triggerEl);
    }

    function closeLogoutModal() {
      var modal = document.getElementById('logoutConfirmModal');
      if (modal) {
        modal.style.display = 'none';
        if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
          document.body.style.overflow = '';
        }
      }
      var promptView = document.getElementById('logoutPromptView');
      var progressView = document.getElementById('logoutProgressBox');
      if (promptView) promptView.style.display = 'block';
      if (progressView) progressView.style.display = 'none';
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function proceedLogout() {
      var isHi = (state.lang !== 'en');
      var promptView = document.getElementById('logoutPromptView');
      var progressView = document.getElementById('logoutProgressBox');
      var progressTitle = document.getElementById('logoutProgressTitle');
      var progressDesc = document.getElementById('logoutProgressDesc');
      var spinnerIcon = document.getElementById('logoutSpinnerIcon');

      // Switch to branded progress view inside modal
      if (promptView) promptView.style.display = 'none';
      if (progressView) progressView.style.display = 'block';

      if (state.pendingLogoutType === 'admin') {
        if (progressTitle) progressTitle.textContent = 'Admin Session Closing...';
        if (progressDesc) progressDesc.textContent = 'Clearing admin access tokens and locking portal...';
        if (spinnerIcon) spinnerIcon.textContent = '🔒';

        var aToken = getAdminToken();
        var doneAdmin = false;
        function finishAdminLogout() {
          if (doneAdmin) return;
          doneAdmin = true;
          clearAdminTokens();
          try {
            sessionStorage.setItem('cwp_user_role', 'admin');
          } catch (e) {}
          if (window.history && window.history.replaceState) {
            var isGas = (window.location.pathname || '').indexOf('/exec') !== -1;
            window.history.replaceState({ mode: 'admin' }, '', isGas ? '?admin=1' : '/admin');
          }
          if (progressTitle) progressTitle.textContent = '✓ Admin Logged Out Successfully!';
          if (spinnerIcon) spinnerIcon.textContent = '✓';
          setTimeout(function() {
            closeLogoutModal();
            showToast('Admin portal locked securely.', '🔒');
            checkAdminAuthStatus();
          }, 350);
        }
        if (aToken) {
          apiCall('logoutAdmin', { adminToken: aToken }, finishAdminLogout, finishAdminLogout);
          setTimeout(finishAdminLogout, 1200);
        } else {
          finishAdminLogout();
        }
      } else {
        if (progressTitle) progressTitle.textContent = isHi ? 'सत्र सुरक्षित रूप से समाप्त हो रहा है...' : 'Ending Shift Session...';
        if (progressDesc) progressDesc.textContent = isHi ? 'CWP क्लाउड से टोकन व कैशे सुरक्षित रूप से हटाए जा रहे हैं...' : 'Clearing session credentials and sync workers...';
        if (spinnerIcon) spinnerIcon.textContent = '🚪';

        var sId = state.activeStaffId || sessionStorage.getItem('cwp_last_staff_id') || localStorage.getItem('cwp_last_staff_id') || '';
        var sToken = getStaffToken(sId);
        var doneStaff = false;
        function finishStaffLogout() {
          if (doneStaff) return;
          doneStaff = true;
          stopStaffAutoSync();
          clearStaffTokens(sId);
          sessionStorage.removeItem('cwp_last_staff_id');
          localStorage.removeItem('cwp_last_staff_id');
          sessionStorage.removeItem('cwp_last_staff_phone');
          localStorage.removeItem('cwp_last_staff_phone');
          state.activeStaffId = '';
          try {
            sessionStorage.setItem('cwp_user_role', 'staff');
          } catch (e) {}
          var phoneInput = document.getElementById('staffPhoneInput');
          var pinInput = document.getElementById('staffPinInput');
          if (phoneInput) phoneInput.value = '';
          if (pinInput) pinInput.value = '';
          updateStaffPinDots();
          if (window.history && window.history.replaceState) {
            var isGas = (window.location.pathname || '').indexOf('/exec') !== -1;
            window.history.replaceState({ mode: 'staff' }, '', isGas ? '?staff=' : '/staff');
          }
          if (progressTitle) progressTitle.textContent = isHi ? '✓ सफलतापूर्वक लॉगआउट हुआ!' : '✓ Logged Out Successfully!';
          if (spinnerIcon) spinnerIcon.textContent = '✓';
          setTimeout(function() {
            closeLogoutModal();
            showToast(isHi ? '🔒 आप CWP स्टाफ पोर्टल से सुरक्षित लॉगआउट हो चुके हैं।' : '🔒 You have been securely logged out from CWP Staff Portal.', 'success');
            checkStaffAuthStatus('');
          }, 350);
        }
        if (sToken) {
          apiCall('logoutStaff', { staffToken: sToken, staffId: sId }, finishStaffLogout, finishStaffLogout);
          setTimeout(finishStaffLogout, 1200);
        } else {
          finishStaffLogout();
        }
      }
    }

    function handleStaffLogout() {
      openLogoutModal('staff');
    }

    /* Admin Authentication & Security Logic */
    function getAdminToken() {
      return sessionStorage.getItem('cwp_admin_token') || localStorage.getItem('cwp_admin_token') || '';
    }

    /* Standard Valid Admin Tabs Constant (M3 Redesign: Dedicated Dashboard & Job Assignment) */
    var ADMIN_VALID_TABS = ['dashboard', 'records', 'leads', 'washSolar', 'specialJobs', 'sequence', 'staff', 'cleanReports', 'jobAssignment', 'addCust'];

    function clearAdminTokens() {
      sessionStorage.removeItem('cwp_admin_token');
      localStorage.removeItem('cwp_admin_token');
      sessionStorage.removeItem('cwp_admin_auth');
      localStorage.removeItem('cwp_admin_auth');
      try {
        localStorage.removeItem('cwp_admin_active_tab');
      } catch (e) {}
      if (typeof stopDailyCleanReportsAutoSync === 'function') {
        stopDailyCleanReportsAutoSync();
      }
    }

    function isUserAdminAuthenticated() {
      return !!getAdminToken();
    }

    /* Get Saved Admin Tab (Persisted across browser refresh, defaults to Active Members list) */
    function getSavedAdminTab() {
      try {
        var urlParams = new URLSearchParams(window.location.search);
        var urlTab = urlParams.get('tab');
        var hash = window.location.hash || '';
        if (!urlTab && hash.indexOf('#admin/') === 0) {
          urlTab = hash.replace(/^#admin\/?/, '');
        }
        if (urlTab === 'dashboard') return 'dashboard';
        if (urlTab === 'washSolar') urlTab = 'specialJobs';
        if (urlTab && ADMIN_VALID_TABS.indexOf(urlTab) !== -1) {
          return urlTab;
        }
        var localTab = localStorage.getItem('cwp_admin_active_tab');
        if (localTab === 'dashboard') return 'dashboard';
        if (localTab === 'washSolar') localTab = 'specialJobs';
        if (localTab && ADMIN_VALID_TABS.indexOf(localTab) !== -1) {
          return localTab;
        }
      } catch (e) {
        console.warn('Error reading admin tab:', e);
      }
      return 'records'; // User requirement: Active members list first!
    }

    function checkAdminAuthStatus() {
      var authGate = document.getElementById('adminAuthGate');
      var unlocked = document.getElementById('adminUnlockedContent');
      var logoutBtn = document.getElementById('adminLogoutBtn');
      var adminHeader = document.getElementById('adminHeader');

      if (isUserAdminAuthenticated()) {
        document.documentElement.classList.remove('admin-login-lock');
        document.body.classList.remove('admin-login-lock');
        if (adminHeader) adminHeader.style.setProperty('display', 'block', 'important');
        if (authGate) {
          authGate.classList.add('is-hidden');
          authGate.setAttribute('hidden', 'true');
          authGate.style.setProperty('display', 'none', 'important');
        }
        if (unlocked) {
          unlocked.classList.remove('is-hidden');
          unlocked.removeAttribute('hidden');
          unlocked.style.setProperty('display', 'block', 'important');
        }
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        
        loadStaffListForAdmin();
        loadAdminRecords();
        initCustomerAutoDraft();

        // Restore current active tab (keeps same panel on refresh, or records on login)
        var currentTab = getSavedAdminTab();
        switchAdminTab(currentTab, true);
        if (typeof updateHeaderAccountStatus === 'function') updateHeaderAccountStatus();
        if (window.CwpNeuralCore && typeof window.CwpNeuralCore.reset === 'function') {
          window.CwpNeuralCore.reset();
        }
      } else {
        document.documentElement.classList.add('admin-login-lock');
        document.body.classList.add('admin-login-lock');
        // User explicitly requested: no header on admin login screen
        if (adminHeader) adminHeader.style.setProperty('display', 'none', 'important');
        if (authGate) {
          authGate.classList.remove('is-hidden');
          authGate.removeAttribute('hidden');
          authGate.style.removeProperty('display');
          authGate.style.display = 'flex';
        }
        if (unlocked) {
          unlocked.classList.add('is-hidden');
          unlocked.setAttribute('hidden', 'true');
          unlocked.style.setProperty('display', 'none', 'important');
        }
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (typeof updateHeaderAccountStatus === 'function') updateHeaderAccountStatus();
        if (window.CwpNeuralCore && typeof window.CwpNeuralCore.setStage === 'function') {
          window.CwpNeuralCore.setStage('intro');
        }
        setTimeout(function() {
          var input = document.getElementById('adminPasswordInput');
          if (input && window.CwpNeuralCore && window.CwpNeuralCore.getStage() === 'passwordPrompt') {
            input.focus();
          }
        }, 150);
      }
    }

    function handleAdminAuth(e) {
      e.preventDefault();
      var input = document.getElementById('adminPasswordInput');
      var password = (input.value || '').trim();
      var errBox = document.getElementById('adminAuthError');
      var errText = document.getElementById('adminAuthErrorText');
      var btn = document.getElementById('btnAdminLogin');

      if (!password) return;

      if (window.CwpNeuralCore && typeof window.CwpNeuralCore.setStage === 'function') {
        window.CwpNeuralCore.setStage('authenticating');
      }

      btn.disabled = true;
      if (errBox) errBox.style.display = 'none';

      apiCall('verifyAdminPassword', { password: password }, function(res) {
        btn.disabled = false;
        if (res && res.success) {
          var rememberEl = document.getElementById('rememberAdminDevice');
          var remember = rememberEl ? rememberEl.checked : true;
          var token = res.token || 'authenticated';
          sessionStorage.setItem('cwp_admin_token', token);
          sessionStorage.setItem('cwp_admin_auth', token);
          if (remember) {
            localStorage.setItem('cwp_admin_token', token);
            localStorage.setItem('cwp_admin_auth', token);
          }
          var authGate = document.getElementById('adminAuthGate');
          var unlocked = document.getElementById('adminUnlockedContent');
          if (authGate) {
            authGate.classList.add('is-hidden');
            authGate.setAttribute('hidden', 'true');
            authGate.style.setProperty('display', 'none', 'important');
          }
          if (unlocked) {
            unlocked.classList.remove('is-hidden');
            unlocked.removeAttribute('hidden');
            unlocked.style.setProperty('display', 'block', 'important');
          }
          if (window.CwpNeuralCore && typeof window.CwpNeuralCore.reset === 'function') {
            window.CwpNeuralCore.reset();
          }
          // On fresh login: Active members list opens first as requested!
          var urlParams = new URLSearchParams(window.location.search);
          if (!urlParams.get('tab')) {
            try {
              localStorage.setItem('cwp_admin_active_tab', 'records');
            } catch (e) {}
          }
          input.value = '';
          showToast('Login successful!', '✓');
          checkAdminAuthStatus();
        } else {
          if (window.CwpNeuralCore && typeof window.CwpNeuralCore.setStage === 'function') {
            window.CwpNeuralCore.setStage('passwordPrompt');
          }
          var errMsg = (res && res.error) ? res.error : 'Incorrect password! Please enter the correct password.';
          if (errText) {
            errText.textContent = errMsg;
          } else if (errBox) {
            errBox.textContent = '❌ ' + errMsg;
          }
          if (errBox) errBox.style.display = 'flex';
          triggerInputShake(input);
          input.focus();
        }
      }, function(err) {
        btn.disabled = false;
        if (window.CwpNeuralCore && typeof window.CwpNeuralCore.setStage === 'function') {
          window.CwpNeuralCore.setStage('passwordPrompt');
        }
        var errMsg = (err && err.message) ? err.message : 'Verification failed';
        if (errText) {
          errText.textContent = errMsg;
        } else if (errBox) {
          errBox.textContent = '❌ ' + errMsg;
        }
        if (errBox) errBox.style.display = 'flex';
        triggerInputShake(input);
      });
    }

    function handleAdminLogout() {
      openLogoutModal('admin');
    }

    function togglePasswordVisibility(inputId, btnEl) {
      var el = document.getElementById(inputId);
      if (el) {
        var isNowText = el.type === 'password';
        el.type = isNowText ? 'text' : 'password';
        var btn = btnEl || (el.parentElement ? el.parentElement.querySelector('.btn-toggle-eye') : null);
        if (btn) {
          btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">' + (isNowText ? 'visibility_off' : 'visibility') + '</span>';
          btn.title = isNowText ? 'पिन छिपाएं (Hide PIN)' : 'पिन देखें (Show PIN)';
        }
      }
    }

    function handleUpdateAdminPassword(e) {
      e.preventDefault();
      var input = document.getElementById('newAdminPasswordInput');
      var newPass = (input.value || '').trim();
      if (!newPass) return;

      apiCall('updateAdminPassword', { newPassword: newPass }, function(res) {
        if (res && res.success) {
          showToast(res.message || 'Password updated successfully!', '✓');
          input.value = '';
        } else {
          showToast('Error: ' + (res ? res.error : 'Could not change password'), '❌');
        }
      }, function(err) {
        showToast('Error: ' + err.message, '❌');
      });
    }

    /* Switch Admin Sub Tabs with URL & LocalStorage State Persistence */
    function switchAdminTab(tabName, updateUrl) {
      if (tabName === 'washSolar') {
        tabName = 'specialJobs';
      }

      if (ADMIN_VALID_TABS.indexOf(tabName) === -1) {
        tabName = 'records';
      }

      if (tabName === 'addCust') {
        openAddCustomerModal();
        tabName = 'records';
      }

      ADMIN_VALID_TABS.forEach(function(t) {
        var pane = document.getElementById('adminTab' + t.charAt(0).toUpperCase() + t.slice(1));
        var btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
        if (pane) pane.style.display = (t === tabName) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tabName);
      });

      // Synchronize Unified Operations Hub & Segmented Switchers
      var isOpsTab = (tabName === 'cleanReports' || tabName === 'specialJobs' || tabName === 'dashboard');
      var opsHub = document.getElementById('adminOpsDashboardHub');
      if (opsHub) {
        opsHub.style.display = isOpsTab ? 'block' : 'none';
      }
      var sideNavDash = document.getElementById('sideNavDashboard');
      if (sideNavDash) {
        sideNavDash.classList.toggle('active', isOpsTab);
      }

      var subCleanBtns = document.querySelectorAll('#dashBtnSubCleanReports, #dashBtnSubCleanReports2, .dashBtnSubCleanReports');
      subCleanBtns.forEach(function(btn) { btn.classList.toggle('active', tabName === 'cleanReports'); });

      var subSpecBtns = document.querySelectorAll('#dashBtnSubSpecialJobs, #dashBtnSubSpecialJobs2, .dashBtnSubSpecialJobs');
      subSpecBtns.forEach(function(btn) { btn.classList.toggle('active', tabName === 'specialJobs'); });

      // Update mobile topbar pane title
      var mobileActivePane = document.getElementById('adminMobileActivePane');
      if (mobileActivePane) {
        var titles = {
          dashboard: 'Operations Dashboard',
          records: 'Customer Records',
          leads: 'Leads Pipeline',
          sequence: 'Route Sequence',
          staff: 'Staff Management',
          cleanReports: 'Operations: Daily Cleans',
          specialJobs: 'Operations: Wash & Solar',
          jobAssignment: 'Job Assignment & Dispatch'
        };
        mobileActivePane.textContent = titles[tabName] || 'Admin Portal';
      }

      // Close mobile drawer on tab selection
      if (typeof closeAdminSidebar === 'function') {
        closeAdminSidebar();
      }

      if (tabName === 'dashboard') {
        var dashPane = document.getElementById('adminTabDashboard');
        if (dashPane) dashPane.style.display = 'block';
        var dashBtn = document.getElementById('tabBtnDashboard');
        if (dashBtn) dashBtn.classList.add('active');
        if (typeof renderDashboardCharts === 'function') {
          renderDashboardCharts();
        }
        if (typeof refreshOperationsDashboard === 'function') {
          refreshOperationsDashboard();
        }
      }

      if (tabName === 'jobAssignment') {
        var jobPane = document.getElementById('adminTabJobAssignment');
        if (jobPane) jobPane.style.display = 'block';
        var jobBtn = document.getElementById('tabBtnJobAssignment');
        if (jobBtn) jobBtn.classList.add('active');
        if (typeof loadJobAssignmentView === 'function') {
          loadJobAssignmentView();
        }
      }

      if (tabName === 'leads') {
        loadAdminLeads();
      }

      if (tabName === 'specialJobs') {
        loadAdminSpecialJobs();
      }

      if (tabName === 'cleanReports') {
        loadDailyCleanReports();
        if (typeof startDailyCleanReportsAutoSync === 'function') {
          startDailyCleanReportsAutoSync();
        }
      } else {
        if (typeof stopDailyCleanReportsAutoSync === 'function') {
          stopDailyCleanReportsAutoSync();
        }
      }

      // Update aggregated dashboard KPIs
      if (typeof updateOperationsDashboardKPIs === 'function') {
        setTimeout(updateOperationsDashboardKPIs, 100);
      }

      // Persist active tab across refreshes
      try {
        localStorage.setItem('cwp_admin_active_tab', tabName);
      } catch (e) {}

      // Keep browser URL & location hash in sync without full reload
      if (updateUrl !== false) {
        try {
          var targetHash = '#admin/' + tabName;
          if (window.history && window.history.replaceState) {
            var currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('tab', tabName);
            currentUrl.hash = targetHash;
            window.history.replaceState({ tab: tabName }, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
          }
          if (window.location && window.location.hash !== targetHash) {
            window.location.hash = targetHash;
          }
        } catch (e) {}
      }

      if (tabName === 'staff') loadStaffListForAdmin();
      if (tabName === 'records') loadAdminRecords(true);
      if (tabName === 'leads' && typeof loadAdminLeads === 'function') loadAdminLeads(true);
      if (tabName === 'sequence') {
        initAdminSequenceManager();
        if (typeof loadStaffSequenceData === 'function' && state.seqManagement && state.seqManagement.currentStaffId) {
          loadStaffSequenceData(true);
        }
      }
    }

    /* Mobile Sidebar Drawer Controllers */
    function toggleAdminSidebar(forceState) {
      var sidebar = document.getElementById('adminSidebar');
      var backdrop = document.getElementById('adminSidebarBackdrop');
      if (!sidebar) return;
      var isOpen = sidebar.classList.contains('sidebar-open');
      var nextState = (typeof forceState === 'boolean') ? forceState : !isOpen;
      if (nextState) {
        if (window.innerWidth <= 1024) {
          sidebar.classList.remove('collapsed', 'rail-mode');
        }
        sidebar.classList.add('sidebar-open');
        if (backdrop) backdrop.classList.add('active');
        if (window.innerWidth <= 1024) document.body.style.overflow = 'hidden';
      } else {
        sidebar.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
      }
    }
    window.toggleAdminSidebar = toggleAdminSidebar;

    function closeAdminSidebar() {
      toggleAdminSidebar(false);
    }
    window.closeAdminSidebar = closeAdminSidebar;

    /* Unified Operations Dashboard Aggregated KPIs */
    function updateOperationsDashboardKPIs() {
      // 1. Daily Clean metrics
      var cleanTotalEl = document.getElementById('kpiTotalCleaned');
      var cleanRateEl = document.getElementById('kpiPhotoRate');
      var cleanStaffEl = document.getElementById('kpiActiveStaff');
      var cleanPunchEl = document.getElementById('kpiLatestPunch');
      var cleanBadgeEl = document.getElementById('tabCleanReportsCount');

      var dailyCount = cleanTotalEl ? cleanTotalEl.textContent.trim() : (cleanBadgeEl ? cleanBadgeEl.textContent.trim() : '0');
      var dailyRate = cleanRateEl ? cleanRateEl.textContent.trim() : '0%';
      var activeStaff = cleanStaffEl ? cleanStaffEl.textContent.replace(/[^\d]/g, '').trim() : '0';
      var latestPunch = cleanPunchEl ? cleanPunchEl.textContent.trim() : '--:--';

      // 2. Special Jobs metrics
      var specTotalEl = document.getElementById('kpiSpecialTotal');
      var specAssignedEl = document.getElementById('kpiSpecialAssigned');
      var specInProgEl = document.getElementById('kpiSpecialInProgress');
      var specDoneEl = document.getElementById('kpiSpecialCompleted');
      var specBadgeEl = document.getElementById('tabSpecialJobsCount');

      var specTotal = specTotalEl ? specTotalEl.textContent.trim() : (specBadgeEl ? specBadgeEl.textContent.trim() : '0');
      var specAssigned = specAssignedEl ? (parseInt(specAssignedEl.textContent.trim(), 10) || 0) : 0;
      var specInProg = specInProgEl ? (parseInt(specInProgEl.textContent.trim(), 10) || 0) : 0;
      var specDone = specDoneEl ? specDoneEl.textContent.trim() : '0';
      var specActive = specAssigned + specInProg;

      // Update aggregated KPIs across all Operations Hub headers
      var dCleans = document.querySelectorAll('#dashTotalDailyCleans, .dashTotalDailyCleans');
      dCleans.forEach(function(el) { el.textContent = dailyCount || '0'; });

      var dRates = document.querySelectorAll('#dashDailyPhotoRate, .dashDailyPhotoRate');
      dRates.forEach(function(el) { el.textContent = dailyRate || '0%'; });

      var dSpec = document.querySelectorAll('#dashTotalSpecialJobs, .dashTotalSpecialJobs');
      dSpec.forEach(function(el) { el.textContent = specTotal || '0'; });

      var dSpecDone = document.querySelectorAll('#dashSpecialCompleted, .dashSpecialCompleted');
      dSpecDone.forEach(function(el) { el.textContent = specDone || '0'; });

      var dSpecPend = document.querySelectorAll('#dashSpecialPending, .dashSpecialPending');
      dSpecPend.forEach(function(el) { el.textContent = specActive; });

      var dCrew = document.querySelectorAll('#dashActiveCrew, .dashActiveCrew');
      dCrew.forEach(function(el) { el.textContent = activeStaff || '0'; });

      var dPunch = document.querySelectorAll('#dashLatestActivity, .dashLatestActivity');
      dPunch.forEach(function(el) { el.textContent = latestPunch || '--:--'; });

      // Update sub-switch count badges
      var subClean = document.querySelectorAll('#dashSubCleanCount, .dashSubCleanCount');
      subClean.forEach(function(el) { el.textContent = dailyCount || '0'; });

      var subSpec = document.querySelectorAll('#dashSubSpecialCount, .dashSubSpecialCount');
      subSpec.forEach(function(el) { el.textContent = specTotal || '0'; });

      // Intelligent Operations Intelligence Deck (Combined & Separate Metrics)
      var numCleans = parseInt(dailyCount, 10) || 0;
      var numSpecTotal = parseInt(specTotal, 10) || 0;
      var numSpecDone = parseInt(specDone, 10) || 0;
      var numSpecActive = specActive || 0;

      var combTotal = numCleans + numSpecTotal;
      var combDone = numCleans + numSpecDone;
      var combRate = combTotal > 0 ? Math.round((combDone / combTotal) * 100) : 0;

      var elCombDone = document.getElementById('dashCombinedDone');
      if (elCombDone) elCombDone.textContent = combDone;

      var elCombTotal = document.getElementById('dashCombinedTotal');
      if (elCombTotal) elCombTotal.textContent = combTotal;

      var elCombBadge = document.getElementById('dashCombinedRateBadge');
      if (elCombBadge) elCombBadge.textContent = combRate + '% Fulfilled';

      var elCombCleans = document.getElementById('dashCombCleansDone');
      if (elCombCleans) elCombCleans.textContent = numCleans;

      var elCombSpec = document.getElementById('dashCombSpecDone');
      if (elCombSpec) elCombSpec.textContent = numSpecDone + ' of ' + numSpecTotal;

      var elCombPend = document.getElementById('dashCombPending');
      if (elCombPend) elCombPend.textContent = numSpecActive;

      var barCleans = document.getElementById('dashBarCleans');
      var barSpec = document.getElementById('dashBarSpecial');
      if (combTotal > 0) {
        if (barCleans) barCleans.style.width = Math.min(100, Math.round((numCleans / combTotal) * 100)) + '%';
        if (barSpec) barSpec.style.width = Math.min(100, Math.round((numSpecDone / combTotal) * 100)) + '%';
      }

      // Card 2: Quality & Proof-of-Work Audit
      var elAuditRate = document.getElementById('dashAuditRate');
      if (elAuditRate) elAuditRate.textContent = dailyRate || '100%';

      var elAuditPhotos = document.getElementById('dashAuditPhotoCount');
      if (elAuditPhotos) elAuditPhotos.textContent = numCleans;

      var elAuditBar = document.getElementById('dashAuditProgressBar');
      if (elAuditBar) elAuditBar.style.width = dailyRate || '100%';

      // Card 3: Route Velocity & Active Crew
      var elCrewActive = document.getElementById('dashCrewActiveCount');
      if (elCrewActive) elCrewActive.textContent = activeStaff || '1';

      var elLastPunch = document.getElementById('dashLastPunchTime');
      if (elLastPunch) elLastPunch.textContent = latestPunch || '--:--';
    }
    window.updateOperationsDashboardKPIs = updateOperationsDashboardKPIs;

    /* Refresh All Operations in the Unified Dashboard */
    function refreshOperationsDashboard() {
      if (typeof loadDailyCleanReports === 'function') {
        loadDailyCleanReports(false);
      }
      if (typeof loadAdminSpecialJobs === 'function') {
        loadAdminSpecialJobs(false);
      }
      setTimeout(updateOperationsDashboardKPIs, 300);
      if (typeof renderDashboardCharts === 'function') {
        setTimeout(renderDashboardCharts, 350);
      }
    }
    window.refreshOperationsDashboard = refreshOperationsDashboard;

    /* =========================================================================
       SIDEBAR RAIL COLLAPSE CONTROLLER (R1 / Material Design 3)
       ========================================================================= */
    function toggleDesktopSidebarCollapse() {
      var sidebar = document.getElementById('adminSidebar');
      if (!sidebar) return;
      var isCollapsed = sidebar.classList.toggle('rail-mode');
      sidebar.classList.toggle('collapsed', isCollapsed);
      try {
        localStorage.setItem('cwp_admin_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      } catch (e) {}
      var collapseIcon = document.getElementById('sidebarCollapseIcon');
      if (collapseIcon) {
        collapseIcon.textContent = isCollapsed ? 'chevron_right' : 'menu_open';
      }
      var collapseBtn = document.getElementById('adminSidebarCollapseBtn');
      if (collapseBtn) {
        collapseBtn.setAttribute('title', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
        collapseBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      }
    }
    window.toggleDesktopSidebarCollapse = toggleDesktopSidebarCollapse;

    function initDesktopSidebarState() {
      try {
        var isCollapsed = localStorage.getItem('cwp_admin_sidebar_collapsed') === 'true';
        var sidebar = document.getElementById('adminSidebar');
        if (sidebar && isCollapsed && window.innerWidth > 1024) {
          sidebar.classList.add('rail-mode', 'collapsed');
          var collapseIcon = document.getElementById('sidebarCollapseIcon');
          if (collapseIcon) {
            collapseIcon.textContent = 'chevron_right';
          }
          var collapseBtn = document.getElementById('adminSidebarCollapseBtn');
          if (collapseBtn) {
            collapseBtn.setAttribute('title', 'Expand Sidebar');
            collapseBtn.setAttribute('aria-expanded', 'false');
          }
        }
      } catch (e) {}
    }
    window.initDesktopSidebarState = initDesktopSidebarState;

    function toggleSidebarUnified() {
      if (window.innerWidth <= 1024) {
        toggleAdminSidebar();
      } else {
        toggleDesktopSidebarCollapse();
      }
    }
    window.toggleSidebarUnified = toggleSidebarUnified;

    // Responsive window resize and escape listener for adaptive sidebar
    window.addEventListener('resize', function() {
      var sidebar = document.getElementById('adminSidebar');
      var backdrop = document.getElementById('adminSidebarBackdrop');
      if (!sidebar) return;
      if (window.innerWidth <= 1024) {
        sidebar.classList.remove('collapsed', 'rail-mode');
      } else {
        sidebar.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
        if (typeof initDesktopSidebarState === 'function') {
          initDesktopSidebarState();
        }
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var sidebar = document.getElementById('adminSidebar');
        if (sidebar && sidebar.classList.contains('sidebar-open')) {
          closeAdminSidebar();
        }
      }
    });

    /* =========================================================================
       UNIFIED DASHBOARD SVG CHARTS & VISUAL ANALYTICS CONTROLLER (R2)
       ========================================================================= */
    function renderDashboardCharts() {
      renderCleanProgressChart();
      renderStaffWorkloadChart();
      renderWashSolarTrendChart();
      renderCrewPulseStrip();
    }
    window.renderDashboardCharts = renderDashboardCharts;

    function renderCleanProgressChart() {
      var records = (adminCleanReportsState && adminCleanReportsState.records) || [];
      var completedCount = records.length;
      var totalTarget = Math.max(completedCount, (state.customers ? state.customers.filter(function(c) { return c.status !== 'inactive'; }).length : 0) || 10);
      var pendingCount = Math.max(0, totalTarget - completedCount);
      var rate = totalTarget > 0 ? Math.round((completedCount / totalTarget) * 100) : 0;

      var circle = document.getElementById('dashDonutProgressCircle');
      var pctText = document.getElementById('dashDonutPercentText');
      var ratioText = document.getElementById('dashDonutRatioText');
      var badge = document.getElementById('dashProgressRateBadge');

      if (circle) {
        var circumfrence = 471.24;
        var offset = circumfrence * (1 - (rate / 100));
        circle.style.strokeDashoffset = offset;
      }
      if (pctText) pctText.textContent = rate + '%';
      if (ratioText) ratioText.textContent = completedCount + ' / ' + totalTarget + ' Cars';
      if (badge) badge.textContent = rate + '% Done';
    }
    window.renderCleanProgressChart = renderCleanProgressChart;

    function renderStaffWorkloadChart() {
      var staffGroup = document.getElementById('dashStaffBarsGroup');
      if (!staffGroup) return;

      var records = (adminCleanReportsState && adminCleanReportsState.records) || [];
      var staffList = state.staffList || [];
      if (staffList.length === 0) {
        var staffIds = Array.from(new Set(records.map(function(r) { return r.staff_name || r.staff_code || 'Staff'; })));
        staffList = staffIds.map(function(id) { return { id: id, name: id }; });
      }

      var counts = {};
      staffList.forEach(function(s) {
        var key = s.name || s.id;
        counts[key] = { cleaned: 0, pending: 0 };
      });

      records.forEach(function(r) {
        var sName = r.staff_name || r.staff_code || 'Staff';
        if (!counts[sName]) counts[sName] = { cleaned: 0, pending: 0 };
        counts[sName].cleaned++;
      });

      var staffKeys = Object.keys(counts).slice(0, 6);

      var maxVal = 1;
      staffKeys.forEach(function(k) {
        var staffRec = counts[k];
        var cleaned = (staffRec && staffRec.cleaned != null) ? staffRec.cleaned : 0;
        var pending = (staffRec && staffRec.pending != null) ? staffRec.pending : 0;
        var tot = cleaned + pending;
        if (tot > maxVal) maxVal = tot;
      });

      if (staffKeys.length === 0) {
        staffGroup.innerHTML = '<text x="150" y="80" text-anchor="middle" font-size="12" fill="#94a3b8">No staff activity data</text>';
        return;
      }

      var svgWidth = 300;
      var barWidth = Math.min(36, Math.floor((svgWidth - 40) / (staffKeys.length * 2 || 1)));
      var gap = Math.floor((svgWidth - (barWidth * 2 * staffKeys.length)) / (staffKeys.length + 1));

      var svgContent = '';
      staffKeys.forEach(function(k, idx) {
        var cData = counts[k] || { cleaned: 0, pending: 0 };
        var cleaned = (cData && cData.cleaned != null) ? cData.cleaned : 0;
        var pending = (cData && cData.pending != null) ? cData.pending : 0;
        var xCleaned = gap + idx * (barWidth * 2 + gap);
        var xPending = xCleaned + barWidth + 2;

        var hCleaned = Math.round((cleaned / maxVal) * 120);
        var yCleaned = 145 - hCleaned;

        var hPending = Math.round((pending / maxVal) * 120);
        var yPending = 145 - hPending;

        svgContent += '<rect x="' + xCleaned + '" y="' + yCleaned + '" width="' + barWidth + '" height="' + Math.max(4, hCleaned) + '" rx="4" fill="#10b981"/>';
        svgContent += '<text x="' + (xCleaned + barWidth / 2) + '" y="' + (yCleaned - 4) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">' + cleaned + '</text>';
        svgContent += '<text x="' + (xCleaned + barWidth) + '" y="165" text-anchor="middle" font-size="10" font-weight="600" fill="#64748b">' + escapeHtml(k.split(' ')[0]) + '</text>';
      });

      staffGroup.innerHTML = svgContent;
    }
    window.renderStaffWorkloadChart = renderStaffWorkloadChart;

    function renderWashSolarTrendChart() {
      var trendGroup = document.getElementById('dashWashSolarBarsGroup');
      if (!trendGroup) return;

      var specialState = (typeof adminSpecialJobsState !== 'undefined' && adminSpecialJobsState)
        ? adminSpecialJobsState
        : ((typeof adminSpecialState !== 'undefined' && adminSpecialState) ? adminSpecialState : (window.adminSpecialState || null));
      var jobs = (specialState && Array.isArray(specialState.allJobs))
        ? specialState.allJobs
        : ((typeof adminSpecialJobsCache !== 'undefined' && Array.isArray(adminSpecialJobsCache))
            ? adminSpecialJobsCache
            : ((typeof window !== 'undefined' && Array.isArray(window.adminSpecialJobsCache)) ? window.adminSpecialJobsCache : []));
      var cats = {
        'car_washing': { label: 'Car Wash', count: 0, color: '#0284c7' },
        'solar_cleaning': { label: 'Solar Clean', count: 0, color: '#f59e0b' },
        'detailing': { label: 'Detailing', count: 0, color: '#8b5cf6' }
      };

      jobs.forEach(function(j) {
        var cat = j.service_category || 'car_washing';
        if (cat.indexOf('solar') !== -1) cats.solar_cleaning.count++;
        else if (cat.indexOf('detail') !== -1) cats.detailing.count++;
        else cats.car_washing.count++;
      });

      var catKeys = Object.keys(cats);
      var maxCount = Math.max(1, Math.max.apply(null, catKeys.map(function(k) { return cats[k].count; })));

      var svgContent = '';
      catKeys.forEach(function(k, idx) {
        var item = cats[k];
        var barW = 44;
        var x = 35 + idx * 90;
        var h = Math.round((item.count / maxCount) * 110);
        var y = 145 - h;

        svgContent += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(6, h) + '" rx="5" fill="' + item.color + '"/>';
        svgContent += '<text x="' + (x + barW / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">' + item.count + '</text>';
        svgContent += '<text x="' + (x + barW / 2) + '" y="165" text-anchor="middle" font-size="10.5" font-weight="600" fill="#64748b">' + item.label + '</text>';
      });

      trendGroup.innerHTML = svgContent;
    }
    window.renderWashSolarTrendChart = renderWashSolarTrendChart;

    function renderCrewPulseStrip() {
      var strip = document.getElementById('dashboardCrewPulseStrip');
      if (!strip) return;

      var cleanReportsState = (typeof adminCleanReportsState !== 'undefined' && adminCleanReportsState)
        ? adminCleanReportsState
        : ((typeof window !== 'undefined' && window.adminCleanReportsState) ? window.adminCleanReportsState : null);
      var records = (cleanReportsState && cleanReportsState.records) || [];
      var staffMap = {};

      records.forEach(function(r) {
        var sId = r.staff_code || r.staff_id || r.staff_name || 'Staff';
        var sName = r.staff_name || sId;
        if (!staffMap[sId]) {
          staffMap[sId] = {
            id: sId,
            name: sName,
            cleansCount: 0,
            latestRecord: r
          };
        }
        staffMap[sId].cleansCount++;
      });

      var staffKeys = Object.keys(staffMap);
      if (staffKeys.length === 0) {
        strip.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center; width: 100%;">No active field activity yet today. Staff punches will appear in real time.</div>';
        return;
      }

      var html = '';
      staffKeys.forEach(function(k) {
        var item = staffMap[k];
        var latest = item.latestRecord;
        var timeStr = latest.completed_at_device ? new Date(latest.completed_at_device).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--';
        var vehNum = latest.registration_no || 'Car';

        html += '<div class="crew-pulse-tile">';
        html += '  <div class="pulse-tile-top">';
        html += '    <div class="pulse-tile-avatar">' + escapeHtml(item.name.charAt(0).toUpperCase()) + '</div>';
        html += '    <div class="pulse-tile-info">';
        html += '      <div class="pulse-tile-name">' + escapeHtml(item.name) + '</div>';
        html += '      <div class="pulse-tile-role">' + item.cleansCount + ' Cleans Completed Today</div>';
        html += '    </div>';
        html += '    <span class="pulse-tile-status status-active">🟢 Active</span>';
        html += '  </div>';
        html += '  <div class="pulse-tile-meta">';
        html += '    <span class="meta-item">📍 Last: <strong>' + escapeHtml(vehNum) + '</strong></span>';
        html += '    <span class="meta-item">⏱️ At: <strong>' + timeStr + '</strong></span>';
        html += '  </div>';
        html += '</div>';
      });

      strip.innerHTML = html;
    }
    window.renderCrewPulseStrip = renderCrewPulseStrip;

    /* =========================================================================
       DEDICATED JOB ASSIGNMENT CONTROLLER (R6)
       ========================================================================= */
    function loadJobAssignmentView() {
      var custSelect = document.getElementById('jobAssignCustomerSelect');
      if (custSelect) {
        custSelect.innerHTML = '<option value="">-- Select Customer --</option>';
        var customers = (state && state.customers) || [];
        customers.forEach(function(c) {
          if (c.status !== 'inactive') {
            var opt = document.createElement('option');
            opt.value = c.id || c.customerId || c.customerCode || '';
            opt.textContent = (c.name || 'Customer') + ' (' + (c.vehicleNum || c.vehicle_num || c.registration_no || 'No Plate') + ')';
            custSelect.appendChild(opt);
          }
        });
      }

      var staffSelect = document.getElementById('jobAssignStaff');
      if (staffSelect) {
        staffSelect.innerHTML = '<option value="">-- Select Staff Cleaner --</option>';
        var staffList = (state && state.staffList) || [];
        staffList.forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = (s.name || s.id) + ' (' + (s.role || 'Staff') + ')';
          staffSelect.appendChild(opt);
        });
      }

      var dateInput = document.getElementById('jobAssignDate');
      if (dateInput && !dateInput.value) {
        var today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
      }

      renderJobAssignmentsLedger();
    }
    window.loadJobAssignmentView = loadJobAssignmentView;

    function handleJobAssignCustomerChange() {}
    window.handleJobAssignCustomerChange = handleJobAssignCustomerChange;

    function handleJobAssignWorkTypeChange() {}
    window.handleJobAssignWorkTypeChange = handleJobAssignWorkTypeChange;

    function handleJobAssignmentSubmit(e) {
      if (e && e.preventDefault) e.preventDefault();

      var custId = (document.getElementById('jobAssignCustomerSelect') || {}).value;
      var workType = (document.getElementById('jobAssignWorkType') || {}).value;
      var schedDate = (document.getElementById('jobAssignDate') || {}).value;
      var staffId = (document.getElementById('jobAssignStaff') || {}).value;
      var notes = (document.getElementById('jobAssignNotes') || {}).value || '';

      if (!custId || !workType || !schedDate || !staffId) {
        if (typeof showToast === 'function') {
          showToast('Please fill all required fields (Customer, Work Type, Scheduled Date, and Staff Cleaner).', 'warning');
        } else {
          alert('Please fill all required fields (Customer, Work Type, Scheduled Date, and Staff Cleaner).');
        }
        return;
      }

      var customer = (state.customers || []).find(function(c) {
        return (c.id === custId || c.customerId === custId || c.customerCode === custId);
      });

      var staff = (state.staffList || []).find(function(s) {
        return s.id === staffId;
      });

      var payload = {
        action: 'assignSpecialJob',
        customerId: custId,
        customerName: customer ? customer.name : 'Customer',
        customerPhone: customer ? customer.phone : '',
        customerAddress: customer ? (customer.address || customer.locality) : '',
        vehicleNum: customer ? (customer.vehicleNum || customer.registration_no || '') : '',
        serviceCategory: workType,
        scheduledDate: schedDate,
        staffId: staffId,
        staffName: staff ? staff.name : staffId,
        instructions: notes,
        status: 'assigned'
      };

      apiCall('assignSpecialJob', payload, function(res) {
        if (typeof showToast === 'function') {
          showToast('Job assigned successfully to ' + (staff ? staff.name : staffId) + '!', 'success');
        } else {
          alert('Job assigned successfully to ' + (staff ? staff.name : staffId) + '!');
        }
        if (typeof loadAdminSpecialJobs === 'function') loadAdminSpecialJobs(true);
        if (typeof renderJobAssignmentsLedger === 'function') renderJobAssignmentsLedger();
        var form = document.getElementById('jobAssignForm');
        if (form && form.reset) form.reset();
      }, function(err) {
        if (typeof showToast === 'function') {
          showToast('Error assigning job: ' + ((err && err.message) || 'Unknown server error'), 'error');
        } else {
          alert('Error assigning job: ' + ((err && err.message) || 'Unknown server error'));
        }
      });
    }
    window.handleJobAssignmentSubmit = handleJobAssignmentSubmit;

    function renderJobAssignmentsLedger() {
      var tbody = document.getElementById('jobAssignmentsTableBody');
      var countEl = document.getElementById('jobAssignmentActiveCount');
      if (!tbody) return;

      var specialState = (typeof adminSpecialJobsState !== 'undefined' && adminSpecialJobsState)
        ? adminSpecialJobsState
        : ((typeof adminSpecialState !== 'undefined' && adminSpecialState) ? adminSpecialState : (window.adminSpecialState || null));
      var jobs = (specialState && Array.isArray(specialState.allJobs))
        ? specialState.allJobs
        : ((typeof adminSpecialJobsCache !== 'undefined' && Array.isArray(adminSpecialJobsCache))
            ? adminSpecialJobsCache
            : ((typeof window !== 'undefined' && Array.isArray(window.adminSpecialJobsCache)) ? window.adminSpecialJobsCache : []));
      var activeJobs = jobs.filter(function(j) { return j.status !== 'completed' && j.status !== 'cancelled'; });

      if (countEl) countEl.textContent = activeJobs.length;

      if (activeJobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);"><div class="empty-radar-wrap" style="width: 48px; height: 48px; margin: 0 auto 10px auto;"><div class="empty-radar-icon" style="font-size: 22px;">📋</div></div>No active assignments in queue. Use the dispatch form above to assign work.</td></tr>';
        return;
      }

      var html = '';
      activeJobs.forEach(function(j, idx) {
        var dateStr = j.scheduled_date || j.assigned_at ? new Date(j.scheduled_date || j.assigned_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Today';
        var catLabel = (j.service_category || 'Job').replace(/_/g, ' ');

        html += '<tr>';
        html += '  <td style="text-align: center;">' + (idx + 1) + '</td>';
        html += '  <td><strong>' + dateStr + '</strong></td>';
        html += '  <td><div style="font-weight: 600;">' + escapeHtml(j.customer_name || 'Customer') + '</div><div style="font-size: 11px; color: var(--text-muted);">' + escapeHtml(j.vehicle_details || j.vehicle_num || '') + '</div></td>';
        html += '  <td><span class="m3-chip" style="font-size: 11px;">' + escapeHtml(catLabel) + '</span></td>';
        html += '  <td><div class="staff-cell-pill"><span class="staff-avatar-dot">' + escapeHtml((j.staff_name || 'S').charAt(0).toUpperCase()) + '</span><span class="staff-cell-name">' + escapeHtml(j.staff_name || 'Staff') + '</span></div></td>';
        html += '  <td style="text-align: center;"><span class="badge-status-pill badge-active">' + escapeHtml(j.status || 'assigned') + '</span></td>';
        html += '  <td style="text-align: center;"><button type="button" class="btn-cell-action" onclick="openReassignJobModal(\'' + escapeHtml(j.id) + '\')" title="Reassign"><span class="material-symbols-outlined" style="font-size: 16px;">sync_alt</span></button></td>';
        html += '</tr>';
      });

      tbody.innerHTML = html;
    }
    window.renderJobAssignmentsLedger = renderJobAssignmentsLedger;

    /* Time tracking contract functions */
    function calculateConsecutiveTimes(logs) {
      if (!Array.isArray(logs) || logs.length === 0) return [];
      function parseSafeTime(d) {
        if (!d) return 0;
        var t = new Date(d).getTime();
        return isNaN(t) ? 0 : t;
      }
      var sorted = logs.slice().sort(function(a, b) {
        return parseSafeTime(a.completed_at_device || a.created_at) - parseSafeTime(b.completed_at_device || b.created_at);
      });
      var staffMap = {};
      sorted.forEach(function(l) {
        var sId = l.staff_id || l.staff_code || 'all';
        if (!staffMap[sId]) staffMap[sId] = [];
        staffMap[sId].push(l);
      });

      var output = [];
      Object.keys(staffMap).forEach(function(sId) {
        var list = staffMap[sId];
        list.forEach(function(curr, idx) {
          var cleanDuration = (curr.device_metadata && curr.device_metadata.durationMinutes)
            ? curr.device_metadata.durationMinutes
            : (curr.cleaningDurationMinutes || 12);
          if (isNaN(cleanDuration) || cleanDuration <= 0) cleanDuration = 12;

          var transit = 0;
          var prevVeh = null;
          var prevLoc = null;

          if (idx === 0) {
            transit = 0;
            prevVeh = null;
            prevLoc = null;
          } else {
            var prev = list[idx - 1];
            var prevTime = parseSafeTime(prev.completed_at_device || prev.created_at);
            var currTime = parseSafeTime(curr.completed_at_device || curr.created_at);
            if (prevTime > 0 && currTime >= prevTime) {
              var diffMs = currTime - prevTime;
              var totalMinutes = Math.max(0, Math.round(diffMs / 60000));
              transit = Math.max(1, totalMinutes - cleanDuration);
            } else {
              transit = 0;
            }
            prevVeh = prev.vehicle_num || prev.registration_no || null;
            prevLoc = prev.address_text || prev.parking_details || null;
          }

          var enriched = Object.assign({}, curr, {
            transitDurationMinutes: isNaN(transit) ? 0 : transit,
            cleaningDurationMinutes: cleanDuration,
            previousVehicleNum: prevVeh,
            prevLocation: prevLoc
          });
          output.push(enriched);
        });
      });
      return output;
    }
    window.calculateConsecutiveTimes = calculateConsecutiveTimes;

    function computeWashSolarElapsed(job, nowTime) {
      if (!job) return 0;
      function parseSafeTime(d, fallback) {
        if (!d) return fallback;
        var t = (typeof d === 'number') ? d : new Date(d).getTime();
        return isNaN(t) ? fallback : t;
      }
      var now = parseSafeTime(nowTime, Date.now());
      var status = job.status || 'assigned';
      if (status === 'assigned') {
        var assignedAt = parseSafeTime(job.assigned_at, now);
        return Math.max(0, Math.round((now - assignedAt) / 60000));
      } else if (status === 'in_progress') {
        var startedAt = parseSafeTime(job.started_at, (job.assigned_at ? parseSafeTime(job.assigned_at, now) : now));
        return Math.max(0, Math.round((now - startedAt) / 60000));
      } else if (status === 'completed') {
        var start = parseSafeTime(job.started_at, (job.assigned_at ? parseSafeTime(job.assigned_at, now) : now));
        var end = parseSafeTime(job.completed_at, now);
        return Math.max(0, Math.round((end - start) / 60000));
      }
      return 0;
    }
    window.computeWashSolarElapsed = computeWashSolarElapsed;

    // Listen to browser back/forward buttons to switch admin tab seamlessly
    window.addEventListener('popstate', function(e) {
      if (state.currentView === 'admin' && isUserAdminAuthenticated()) {
        var urlParams = new URLSearchParams(window.location.search);
        var t = urlParams.get('tab') || 'records';
        switchAdminTab(t, false);
      }
    });

    // Deep Linking: Listen to URL hash change to switch admin tab
    window.addEventListener('hashchange', function() {
      if (window.location.hash && window.location.hash.indexOf('#admin/') === 0) {
        var tabFromHash = window.location.hash.substring('#admin/'.length);
        if (tabFromHash && typeof switchAdminTab === 'function') {
          switchAdminTab(tabFromHash, false);
        }
      }
    });

    /* =========================================================================
       API CLIENT (Neon PostgreSQL Backend via /api)
       ========================================================================= */
    function apiCall(action, payload, onSuccess, onFailure) {
      var isStaffOp = (state.currentView === 'staff' ||
                       action === 'getStaffData' ||
                       action === 'logoutStaff' ||
                       action === 'verifyStaffPin');
      var isAdminOp = (state.currentView === 'admin' ||
                       action === 'verifyAdminPassword' ||
                       action === 'logoutAdmin' ||
                       action === 'updateAdminPassword');

      var adminToken = getAdminToken();
      var targetStaffId = (payload && payload.staffId) || state.activeStaffId || (typeof getActiveStaffId === 'function' ? getActiveStaffId() : '');
      var staffToken = (payload && payload.staffToken) || getStaffToken(targetStaffId);
      var effectiveToken = isStaffOp ? staffToken : (adminToken || staffToken);

      var reqPayload = Object.assign({}, payload || {});
      reqPayload.action = action;
      if (!isStaffOp && adminToken && !reqPayload.adminToken) reqPayload.adminToken = adminToken;
      if (staffToken && !reqPayload.staffToken) reqPayload.staffToken = staffToken;
      if (effectiveToken && !reqPayload.token) reqPayload.token = effectiveToken;

      if (action === 'verifyStaffPin') {
        // Staff PIN verification sends phone + pin; no previous tokens
        delete reqPayload.token;
        delete reqPayload.adminToken;
        delete reqPayload.staffToken;
      } else if (action === 'verifyAdminPassword') {
        // Admin verification sends password; no previous tokens
        delete reqPayload.token;
        delete reqPayload.adminToken;
      }

      /* Neon PostgreSQL API Client */
      var headers = { 'Content-Type': 'application/json' };
      if (effectiveToken && action !== 'verifyStaffPin' && action !== 'verifyAdminPassword') {
        headers['Authorization'] = 'Bearer ' + effectiveToken;
      }

      fetch('/api', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(reqPayload)
      })
      .then(function(res) {
        if (res.status === 401 || res.status === 403) {
          return res.json().then(function(errData) {
            if (action !== 'verifyStaffPin' && action !== 'verifyAdminPassword') {
              handleUnauthorizedResponse(errData || { unauthorized: true });
            }
            throw new Error((errData && errData.error) ? errData.error : ('HTTP ' + res.status + ' Unauthorized'));
          }).catch(function(jsonErr) {
            if (jsonErr && jsonErr.message && !jsonErr.message.startsWith('Unexpected') && !jsonErr.message.startsWith('JSON')) {
              throw jsonErr;
            }
            if (action !== 'verifyStaffPin' && action !== 'verifyAdminPassword') {
              handleUnauthorizedResponse({ unauthorized: true });
            }
            throw new Error('HTTP ' + res.status);
          });
        }
        if (!res.ok) {
          return res.json().then(function(errData) {
            throw new Error((errData && (errData.error || errData.message)) ? (errData.error || errData.message) : ('HTTP ' + res.status));
          }).catch(function(jsonErr) {
            if (jsonErr && jsonErr.message && !jsonErr.message.startsWith('Unexpected') && !jsonErr.message.startsWith('JSON')) {
              throw jsonErr;
            }
            throw new Error('HTTP ' + res.status);
          });
        }
        return res.json();
      })
      .then(function(resData) {
        if (resData && (resData.unauthorized || resData.forbidden)) {
          handleUnauthorizedResponse(resData);
          if (onFailure) onFailure(new Error(resData.error || 'Unauthorized'));
          return;
        }
        if (resData && resData.error) {
          if (onFailure) onFailure(new Error(resData.error));
          else showToast('Error: ' + resData.error, '❌');
        } else {
          if (onSuccess) onSuccess(resData);
        }
      })
      .catch(function(err) {
        if (onFailure) onFailure(err);
        else showToast('Could not connect to server: ' + err.message, '❌');
      });
    }

    function handleUnauthorizedResponse(resData) {
      if (state.currentView === 'admin') {
        clearAdminTokens();
        try {
          sessionStorage.setItem('cwp_user_role', 'admin');
        } catch (e) {}
        if (window.history && window.history.replaceState) {
          var isGas = (window.location.pathname || '').indexOf('/exec') !== -1;
          window.history.replaceState({ mode: 'admin' }, '', isGas ? '?admin=1' : '/admin');
        }
        checkAdminAuthStatus();
        showToast('🔒 Admin session expired or invalid. Please log in again.', '⚠️');
      } else {
        var prevId = state.activeStaffId || (typeof getActiveStaffId === 'function' ? getActiveStaffId() : '');
        clearStaffTokens(prevId);
        sessionStorage.removeItem('cwp_last_staff_id');
        state.activeStaffId = '';
        try {
          sessionStorage.setItem('cwp_user_role', 'staff');
        } catch (e) {}
        var pinInput = document.getElementById('staffPinInput');
        if (pinInput) pinInput.value = '';
        if (window.history && window.history.replaceState) {
          var isGas = (window.location.pathname || '').indexOf('/exec') !== -1;
          window.history.replaceState({ mode: 'staff' }, '', isGas ? '?staff=' : '/staff');
        }
        checkStaffAuthStatus('');
        showToast('🔒 स्टाफ सत्र समाप्त या अमान्य है। कृपया पुनः 6-डिजिट पिन डालकर लॉगिन करें।', '⚠️');
      }
    }

    /* =========================================================================
       STAFF DATA LOADING & RENDERING
       ========================================================================= */
    /* =========================================================================
       TASK P2.2: STAFF LIVE DATA AUTO-SYNCHRONIZATION (30s Background Polling)
       ========================================================================= */
    var staffSyncTimer = null;
    var isStaffSyncInProgress = false;
    var staffDataVersion = '';
    var lastStaffSyncTimestamp = 0;
    var STAFF_SYNC_INTERVAL_MS = 30000; // 30 seconds
    var knownStaffJobIds = new Set();
    var hasStaffInitialLoadDone = false;

    /* Native Web Audio Chimes (100% offline-ready, zero external audio asset dependency) */
    var sharedAudioContext = null;
    function getOrCreateAudioContext() {
      try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
          sharedAudioContext = new AudioContextClass();
        }
        if (sharedAudioContext.state === 'suspended') {
          sharedAudioContext.resume().catch(function() {});
        }
        return sharedAudioContext;
      } catch (e) {
        return null;
      }
    }

    // Pre-warm / unlock Web Audio on first user interaction so mobile browsers never block alarms
    if (typeof document !== 'undefined') {
      var unlockAudio = function() {
        try {
          var ctx = getOrCreateAudioContext();
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(function() {});
          }
        } catch (e) {}
        document.removeEventListener('click', unlockAudio, true);
        document.removeEventListener('touchstart', unlockAudio, true);
      };
      document.addEventListener('click', unlockAudio, true);
      document.addEventListener('touchstart', unlockAudio, true);
    }

    /* High-Impact Alarming Dispatch Alert Chime (100% Full Volume, Piercing Multi-Burst) */
    function playNewTaskChime() {
      try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        var ctx = getOrCreateAudioContext() || new AudioContextClass();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(function() {});
        }
        var now = ctx.currentTime;

        // Master Gain at Full Scale (1.0 = 100% Volume, zero attenuation)
        var masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        masterGain.gain.setValueAtTime(1.0, now);

        // High-penetration triangle oscillator (rich piercing harmonics that cut through noisy outdoor field environments)
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(masterGain);

        // Urgent 3-Pulse Dispatch Motif: High C6 (1046.5Hz) -> High G6 (1567.98Hz) -> High C7 (2093Hz)
        // Burst 1 (Staccato alert)
        gain.gain.setValueAtTime(1.0, now);
        osc.frequency.setValueAtTime(1046.50, now);
        osc.frequency.setValueAtTime(1567.98, now + 0.12);
        gain.gain.setValueAtTime(0.001, now + 0.28);

        // Burst 2 (Repeating urgency)
        gain.gain.setValueAtTime(1.0, now + 0.36);
        osc.frequency.setValueAtTime(1046.50, now + 0.36);
        osc.frequency.setValueAtTime(1567.98, now + 0.48);
        gain.gain.setValueAtTime(0.001, now + 0.64);

        // Burst 3 (Piercing Crescendo Finale at High C7)
        gain.gain.setValueAtTime(1.0, now + 0.74);
        osc.frequency.setValueAtTime(2093.00, now + 0.74);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

        osc.start(now);
        osc.stop(now + 1.25);

        // High-intensity haptic vibration sequence (3 distinct pulses synced to audio)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([300, 100, 300, 100, 500]); } catch (ve) {}
        }
      } catch (e) {
        console.warn('Audio chime playback blocked or unavailable:', e);
      }
    }

    function playTaskCompletedChime() {
      try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        var ctx = new AudioContextClass();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        var now = ctx.currentTime;
        // Triad chord chime: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.12);
        osc.frequency.setValueAtTime(783.99, now + 0.24);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } catch (e) {
        console.warn('Completion chime error:', e);
      }
    }

    function showStaffNewTaskBanner(job, totalCount) {
      var banner = document.getElementById('staffNewTaskAlertBanner');
      if (!banner) return;
      var cName = job.name || job.customerName || 'ग्राहक';
      var sName = job.serviceType || (job.category === 'solar_cleaning' ? 'सोलर सफाई' : 'कार वॉश');
      var countText = totalCount > 1 ? ' (' + totalCount + ' नए काम)' : '';
      banner.className = 'staff-new-task-banner';
      banner.innerHTML = 
        '<div class="banner-text-wrap">' +
          '<span class="banner-icon">🔔</span>' +
          '<div>' +
            '<div class="banner-title">नया काम असाइन हुआ!' + countText + '</div>' +
            '<div class="banner-desc">' + escapeHtml(cName) + ' • ' + escapeHtml(sName) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-banner-action" onclick="jumpToSpecialJob(\'' + escapeHtml(job.category || 'solar_cleaning') + '\', \'' + escapeHtml(job.jobId || job.id) + '\')">देखें ➔</button>';
      banner.style.display = 'flex';
    }

    function jumpToSpecialJob(category, jobId) {
      setStaffFilter('other_jobs');
      if (category && category !== 'daily_car_cleaning') {
        setOtherJobsSubFilter(category);
      }
      var banner = document.getElementById('staffNewTaskAlertBanner');
      if (banner) banner.style.display = 'none';
      var badgeOther = document.getElementById('countOtherJobs');
      if (badgeOther) badgeOther.classList.remove('pulse-badge');
      var legacyBadge = (category === 'solar_cleaning') ? document.getElementById('countSolarClean') : document.getElementById('countCarWash');
      if (legacyBadge) legacyBadge.classList.remove('pulse-badge');
    }

    function formatSyncTime(ts) {
      try {
        var d = ts ? new Date(ts) : new Date();
        if (isNaN(d.getTime())) return 'अभी-अभी';
        var hrs = d.getHours();
        var mins = d.getMinutes();
        var secs = d.getSeconds();
        var ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12;
        hrs = hrs ? hrs : 12;
        var strMins = mins < 10 ? '0' + mins : mins;
        var strSecs = secs < 10 ? '0' + secs : secs;
        return hrs + ':' + strMins + ':' + strSecs + ' ' + ampm;
      } catch (e) {
        return 'अभी-अभी';
      }
    }

    function updateStaffSyncIndicator(status, message, timestamp) {
      var badge = document.getElementById('staffLiveBadge');
      if (badge) badge.style.display = 'none';
      var dot = document.getElementById('staffSyncDot');
      var text = document.getElementById('staffSyncText');
      if (!badge || !text) return;

      var isHi = (typeof state !== 'undefined' && state.lang !== 'en');
      var timeStr = formatSyncTime(timestamp || lastStaffSyncTimestamp);

      if (status === 'checking') {
        badge.className = 'header-status-pill staff-live-badge status-syncing sync-checking';
        badge.title = isHi ? 'नवीनतम डेटा की जाँच हो रही है... (Checking updates)' : 'Checking latest data updates...';
        if (dot) dot.innerHTML = '<span class="status-sync-spinner"></span>';
        text.textContent = isHi ? 'सिंक...' : 'Syncing...';
      } else if (status === 'offline') {
        badge.className = 'header-status-pill staff-live-badge status-offline sync-offline';
        badge.title = isHi ? 'इंटरनेट कनेक्शन में रुकावट — पिछला उपलब्ध डेटा प्रदर्शित है।' : 'Network connection offline — displaying cached data.';
        if (dot) dot.innerHTML = '<span class="dot-offline">●</span>';
        text.textContent = isHi ? 'ऑफ़लाइन' : 'Offline';
      } else if (status === 'error') {
        badge.className = 'header-status-pill staff-live-badge status-error';
        badge.title = isHi ? 'डेटा सिंक में समस्या' : 'Sync error occurred';
        if (dot) dot.innerHTML = '<span class="dot-error">●</span>';
        text.textContent = isHi ? 'त्रुटि' : 'Error';
      } else {
        badge.className = 'header-status-pill staff-live-badge status-live';
        badge.title = isHi 
          ? '● ऑटो-सिंक सक्रिय (30s) • ' + (message || 'लाइव') + ' • अंतिम जांच: ' + timeStr + ' (क्लिक करके विवरण देखें)'
          : '● Auto-Sync Active (30s) • ' + (message || 'Live') + ' • Last sync: ' + timeStr + ' (Click for details)';
        if (dot) dot.innerHTML = '<span class="dot-live">●</span>';
        text.textContent = isHi ? 'लाइव' : 'Live';
      }

      var popTime = document.getElementById('popoverLastSyncVal');
      if (popTime) popTime.textContent = timeStr;
      var popDot = document.getElementById('popoverStatusDot');
      if (popDot) {
        popDot.className = 'popover-dot ' + (status === 'checking' ? 'status-sync-spinner' : (status === 'offline' ? 'dot-offline' : (status === 'error' ? 'dot-error' : 'dot-live')));
      }
    }

    function startStaffAutoSync(staffId) {
      stopStaffAutoSync();
      if (!staffId || !getStaffToken(staffId)) return;

      updateStaffSyncIndicator('active', 'Auto Sync Active');

      staffSyncTimer = setInterval(function() {
        if (document.visibilityState === 'visible' && state.currentView === 'staff' && isUserStaffAuthenticated(staffId)) {
          pollStaffData(staffId, false);
        }
      }, STAFF_SYNC_INTERVAL_MS);
    }

    function stopStaffAutoSync() {
      if (staffSyncTimer) {
        clearInterval(staffSyncTimer);
        staffSyncTimer = null;
      }
      isStaffSyncInProgress = false;
    }

    function triggerManualStaffSync() {
      if (state.activeStaffId && isUserStaffAuthenticated(state.activeStaffId)) {
        pollStaffData(state.activeStaffId, true);
      }
    }

    function pollStaffData(staffId, isManual) {
      if (isStaffSyncInProgress) return; // Prevent duplicate in-flight requests

      // Check for midnight/date rollover on every poll (Asia/Kolkata)
      checkAndHandleDateChange();

      var sToken = getStaffToken(staffId);
      if (!sToken) {
        stopStaffAutoSync();
        return;
      }

      isStaffSyncInProgress = true;
      lastStaffSyncTimestamp = Date.now();
      if (isManual) {
        updateStaffSyncIndicator('checking', 'Verifying...');
      }

      apiCall('getStaffData', {
        staffId: staffId,
        staffToken: sToken,
        version: staffDataVersion
      }, function(res) {
        isStaffSyncInProgress = false;

        // Inactive staff check
        if (res && res.inactive) {
          stopStaffAutoSync();
          handleStaffDataLoaded(res);
          return;
        }

        // Session expired or cross-staff unauthorized
        if (res && (res.unauthorized || res.forbidden)) {
          stopStaffAutoSync();
          clearStaffTokens(staffId);
          checkStaffAuthStatus(staffId);
          showToast('⚠️ आपका सेशन समाप्त हो गया है। कृपया दोबारा पिन दर्ज करें।', '🔒');
          return;
        }

        // Data Unchanged: ZERO DOM churn!
        if (res && res.unchanged) {
          updateStaffSyncIndicator('active', 'डेटा में कोई बदलाव नहीं', res.lastSync || new Date());
          return;
        }

        // Data changed!
        if (res && res.version) {
          staffDataVersion = res.version;
        }

        // Preserve scroll position
        var prevScroll = window.scrollY || document.documentElement.scrollTop;

        // Preserve active modals (photo modal or address modal should never be abruptly closed)
        var imgModal = document.getElementById('imageModal');
        var wasImgModalOpen = imgModal && imgModal.style.display !== 'none';
        var addrModal = document.getElementById('addressViewModal');
        var wasAddrModalOpen = addrModal && addrModal.style.display !== 'none';

        handleStaffDataLoaded(res);

        // Restore scroll position
        window.scrollTo(0, prevScroll);

        // Keep modal open if it was open
        if (wasImgModalOpen && imgModal) imgModal.style.display = 'flex';
        if (wasAddrModalOpen && addrModal) addrModal.style.display = 'flex';

        updateStaffSyncIndicator('active', 'लाइव अपडेट हुआ', res.lastSync || new Date());
      }, function(err) {
        isStaffSyncInProgress = false;
        // Non-intrusive network resilience: do NOT spam toasts every 30s
        updateStaffSyncIndicator('offline', 'नेटवर्क में रुकावट — पिछला डेटा सुरक्षित');
      });
    }

    // Visibility change handler: pause polling when tab hidden, immediate fresh check when tab re-opened
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        checkAndHandleDateChange();
      }
      if (document.visibilityState === 'visible' && state.currentView === 'staff' && isUserStaffAuthenticated(state.activeStaffId)) {
        if (Date.now() - lastStaffSyncTimestamp > 25000) {
          pollStaffData(state.activeStaffId, false);
        }
      }
      if (document.visibilityState === 'visible' && state.currentView === 'admin' && isUserAdminAuthenticated()) {
        if (typeof getSavedAdminTab === 'function' && getSavedAdminTab() === 'cleanReports') {
          if (typeof loadDailyCleanReports === 'function' && (Date.now() - lastCleanReportsSyncTimestamp > 10000)) {
            loadDailyCleanReports(true);
          }
        }
      }
    });

    // Network online / offline recovery
    window.addEventListener('online', function() {
      checkAndHandleDateChange();
      if (state.currentView === 'staff' && isUserStaffAuthenticated(state.activeStaffId)) {
        updateStaffSyncIndicator('checking', 'पुनः कनेक्ट हो रहा है...');
        pollStaffData(state.activeStaffId, false);
      }
      if (state.currentView === 'admin' && isUserAdminAuthenticated()) {
        if (typeof getSavedAdminTab === 'function' && getSavedAdminTab() === 'cleanReports') {
          if (typeof loadDailyCleanReports === 'function') {
            loadDailyCleanReports(true);
          }
        }
      }
    });

    window.addEventListener('offline', function() {
      if (state.currentView === 'staff') {
        updateStaffSyncIndicator('offline', 'इंटरनेट अनुपलब्ध — पिछला डेटा सुरक्षित');
      }
      if (state.currentView === 'admin') {
        var syncTimeEl = document.getElementById('reportsLastSyncTime');
        if (syncTimeEl) syncTimeEl.textContent = 'इंटरनेट अनुपलब्ध (Offline)';
      }
    });

function loadStaffCustomerData(staffId) {
      checkAndHandleDateChange();
      scheduleMidnightCheck();
      var feed = document.getElementById('customerFeed');
      if (feed && (!state.customers || state.customers.length === 0)) {
        feed.innerHTML = renderSkeletonCards(3);
      }

      var sToken = getStaffToken(staffId);
      apiCall('getStaffData', { staffId: staffId, staffToken: sToken, version: '' }, function(response) {
        if (response && response.version) {
          staffDataVersion = response.version;
        }
        handleStaffDataLoaded(response);
        startStaffAutoSync(staffId);
        updateStaffSyncIndicator('active', 'लाइव', response.lastSync || new Date());
      }, function(err) {
        showToast('डेटा लोड करने में Error: ' + (err.message || err), '❌');
        if (feed) feed.innerHTML = '<div class="empty-state-card"><div class="empty-icon-wrap">⚠️</div><h4 class="empty-title">डेटा लोड नहीं हो सका</h4><p class="empty-desc">' + escapeHtml(err.message || 'कृपया इंटरनेट कनेक्शन जांचें या दोबारा रीफ्रेश करें।') + '</p><div style="margin-top: 14px;"><button type="button" class="btn-primary-smart" style="padding: 8px 16px;" onclick="loadStaffCustomerData(state.activeStaffId)">🔄 Try Again</button></div></div>';
      });
    }

    function handleStaffDataLoaded(data) {
      if (data && data.inactive) {
        var key = getStaffAuthKey(state.activeStaffId);
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        var authGate = document.getElementById('staffAuthGate');
        var content = document.getElementById('staffContent');
        var inactiveBox = document.getElementById('staffInactiveMsgBox');
        var logoutBtn = document.getElementById('staffLogoutBtn');
        if (content) {
          content.classList.add('is-hidden');
          content.setAttribute('hidden', 'true');
          content.style.setProperty('display', 'none', 'important');
        }
        if (authGate) {
          authGate.classList.remove('is-hidden');
          authGate.removeAttribute('hidden');
          authGate.style.removeProperty('display');
          authGate.style.display = 'flex';
        }
        if (inactiveBox) inactiveBox.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        showToast('🚫 आपका स्टाफ अकाउंट निष्क्रिय कर दिया गया है।', '⚠️');
        return;
      }

      if (!data || data.error) {
        var feed = document.getElementById('customerFeed');
        if (feed) feed.innerHTML = '<div class="empty-state-card"><div class="empty-icon-wrap">⚠️</div><h4 class="empty-title">डेटा लोड विफल</h4><p class="empty-desc">' + escapeHtml(data ? data.error : 'अज्ञात त्रुटि') + '</p><div style="margin-top: 14px;"><button type="button" class="btn-primary-smart" style="padding: 8px 16px;" onclick="loadStaffCustomerData(state.activeStaffId)">🔄 Try Again</button></div></div>';
        return;
      }

      /* Update Staff Header */
      var sName = data.staffName || 'स्टाफ मेंबर';
      var sId = data.staffId || state.activeStaffId || 'STF';
      state.staffData = data;
      state.activeStaffName = sName;
      if (sId) state.activeStaffId = sId;

      /* On-Demand / Special Jobs Real-Time Alerting (Audio, Vibration & PWA Notification) */
      var allJobs = (data.otherJobs && Array.isArray(data.otherJobs)) ? data.otherJobs : (data.carWashing || []).concat(data.solarCleaning || []);
      var newlyAssignedJobs = [];

      allJobs.forEach(function(j) {
        var jId = j.jobId || j.id;
        if (jId) {
          if (!knownStaffJobIds.has(jId)) {
            if (hasStaffInitialLoadDone && (j.status === 'assigned' || !j.status)) {
              newlyAssignedJobs.push(j);
            }
            knownStaffJobIds.add(jId);
          }
        }
      });

      if (!hasStaffInitialLoadDone) {
        hasStaffInitialLoadDone = true;
      } else if (newlyAssignedJobs.length > 0) {
        playNewTaskChime();
        if (navigator.vibrate) {
          try { navigator.vibrate([300, 100, 300, 100, 500]); } catch (ve) {}
        }
        var firstNew = newlyAssignedJobs[0];
        showStaffNewTaskBanner(firstNew, newlyAssignedJobs.length);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('🔔 CWP: नया काम असाइन हुआ!', {
              body: (firstNew.name || firstNew.customerName) + ' - ' + (firstNew.serviceType || 'विशेष कार्य') + ' (' + (firstNew.address || '') + ')',
              icon: '/cwp_logo.jpg'
            });
          } catch (ne) {}
        }
        var badgeOther = document.getElementById('countOtherJobs');
        if (badgeOther) badgeOther.classList.add('pulse-badge');
        var badgeToPulse = (firstNew.serviceCategoryId === 'solar_cleaning' || firstNew.category === 'solar_cleaning') ? document.getElementById('countSolarClean') : document.getElementById('countCarWash');
        if (badgeToPulse) {
          badgeToPulse.classList.add('pulse-badge');
        }
      }
      document.getElementById('staffNameHeader').textContent = sName;
      document.getElementById('staffIdHeader').textContent = 'ID: ' + sId;
      var staffPhoto = (data.staffPhotoUrl || data.photoUrl || '').trim();
      var avatarImg = document.getElementById('staffAvatarImg');
      var avatarInit = document.getElementById('staffAvatarInitial');
      if (staffPhoto && avatarImg) {
        avatarImg.src = staffPhoto;
        avatarImg.style.display = 'block';
        if (avatarInit) avatarInit.style.display = 'none';
        avatarImg.onerror = function() {
          this.style.display = 'none';
          if (avatarInit) {
            avatarInit.textContent = sName.charAt(0).toUpperCase();
            avatarInit.style.display = 'block';
          }
        };
      } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarInit) {
          avatarInit.textContent = sName.charAt(0).toUpperCase();
          avatarInit.style.display = 'block';
        }
      }

      // Populate Staff Portal Profile Details Card
      var pCard = document.getElementById('staffPortalProfileDetailsCard');
      if (pCard) {
        pCard.style.display = 'block';
        var phoneEl = document.getElementById('staffPortalPhoneDisplay');
        if (phoneEl) {
          var pVal = data.staffPhone || data.phone || '';
          phoneEl.textContent = pVal ? (typeof formatIndianMobile === 'function' ? formatIndianMobile(pVal) : pVal) : '-';
        }
        var dojEl = document.getElementById('staffPortalDojDisplay');
        var dojWrap = document.getElementById('staffPortalDojWrap');
        if (data.dateOfJoining) {
          if (dojEl) dojEl.textContent = String(data.dateOfJoining).split('T')[0];
          if (dojWrap) dojWrap.style.display = 'flex';
        } else if (dojWrap) {
          dojWrap.style.display = 'none';
        }
        var wOffEl = document.getElementById('staffPortalWeeklyOffDisplay');
        var wOffWrap = document.getElementById('staffPortalWeeklyOffWrap');
        if (data.weeklyOff) {
          if (wOffEl) wOffEl.textContent = data.weeklyOff;
          if (wOffWrap) wOffWrap.style.display = 'flex';
        } else if (wOffWrap) {
          wOffWrap.style.display = 'none';
        }
        var emailEl = document.getElementById('staffPortalEmailDisplay');
        var emailWrap = document.getElementById('staffPortalEmailWrap');
        if (data.email) {
          if (emailEl) emailEl.textContent = data.email;
          if (emailWrap) emailWrap.style.display = 'flex';
        } else if (emailWrap) {
          emailWrap.style.display = 'none';
        }
        var salEl = document.getElementById('staffPortalSalaryDisplay');
        var salWrap = document.getElementById('staffPortalSalaryWrap');
        if (data.salary !== undefined && data.salary !== null && data.salary !== '') {
          if (salEl) salEl.textContent = '₹' + Number(data.salary).toLocaleString('en-IN');
          if (salWrap) salWrap.style.display = 'flex';
        } else if (salWrap) {
          salWrap.style.display = 'none';
        }
      }

      /* Data Source Reliability Feedback (Live badge removed - user requested: live hata do. not needed at all.) */
      var liveBadge = document.getElementById('staffLiveBadge');
      if (liveBadge) liveBadge.style.display = 'none';
      var isLive = data.isLive !== false && data.dataSource !== 'local_fallback';

      if (liveBadge) {
        liveBadge.style.display = 'none';
        if (isLive) {
          liveBadge.innerHTML = '<span class="dot-live">●</span> लाइव';
          liveBadge.style.background = 'rgba(16, 185, 129, 0.16)';
          liveBadge.style.color = '#34d399';
          liveBadge.title = 'लाइव Neon डेटाबेस से कनेक्टेड';
        } else {
          liveBadge.innerHTML = '<span style="color: #f59e0b;">⚠️</span> ऑफ़लाइन मोड';
          liveBadge.style.background = 'rgba(245, 158, 11, 0.16)';
          liveBadge.style.color = '#fbbf24';
          liveBadge.title = 'ऑफ़लाइन स्थानीय डेटा';
        }
      }

      var bannerContainer = document.getElementById('staffOfflineBannerContainer');
      if (bannerContainer) {
        if (!isLive) {
          bannerContainer.innerHTML = 
            '<div class="offline-warning-banner" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 500;">' +
              '<span>⚠️ सर्वर से सीधा संपर्क नहीं हो सका। ऑफ़लाइन स्थानीय डेटा प्रदर्शित है।</span>' +
              '<button type="button" onclick="loadStaffCustomerData(state.activeStaffId)" style="background: #f59e0b; color: #ffffff; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">🔄 पुनः प्रयास</button>' +
            '</div>';
          bannerContainer.style.display = 'block';
        } else {
          bannerContainer.style.display = 'none';
        }
      }

      /* Populate customer list classified into 3 service categories */
      var list = [];
      var hasModern = Boolean(data.dailyCarCleaning || data.otherJobs || data.carWashing || data.solarCleaning);

      if (hasModern) {
        if (data.dailyCarCleaning && Array.isArray(data.dailyCarCleaning)) {
          data.dailyCarCleaning.forEach(function(item, idx) {
            item.category = 'daily_car_cleaning';
            item.serviceCategory = 'Daily Car Cleaning';
            item._seq = idx + 1;
            list.push(item);
          });
        }
        if (data.otherJobs && Array.isArray(data.otherJobs)) {
          data.otherJobs.forEach(function(item, idx) {
            item.category = item.serviceCategoryId || item.category || 'other_jobs';
            item.serviceCategory = item.categoryName || item.serviceType || 'Other Job';
            item._seq = idx + 1;
            list.push(item);
          });
        } else {
          if (data.carWashing && Array.isArray(data.carWashing)) {
            data.carWashing.forEach(function(item, idx) {
              item.category = 'car_washing';
              item.serviceCategory = 'Car Washing';
              item._seq = idx + 1;
              list.push(item);
            });
          }
          if (data.solarCleaning && Array.isArray(data.solarCleaning)) {
            data.solarCleaning.forEach(function(item, idx) {
              item.category = 'solar_cleaning';
              item.serviceCategory = 'Solar Panel Cleaning';
              item._seq = idx + 1;
              list.push(item);
            });
          }
        }
      } else {
        /* Fallback if backend returned legacy format dailyClean / allOtherWork */
        if (data.dailyClean && Array.isArray(data.dailyClean)) {
          data.dailyClean.forEach(function(item, idx) {
            item.category = 'daily_car_cleaning';
            item.serviceCategory = 'Daily Car Cleaning';
            item._seq = idx + 1;
            list.push(item);
          });
        }
        if (data.allOtherWork && Array.isArray(data.allOtherWork)) {
          var cwIdx = 0, spcIdx = 0;
          data.allOtherWork.forEach(function(item) {
            var s = ((item.serviceType || '') + ' ' + (item.packageType || '') + ' ' + (item.packageDetails || '')).toLowerCase();
            var isSolar = s.indexOf('solar') >= 0 || s.indexOf('pv panel') >= 0 || s.indexOf('rooftop solar') >= 0 || ((item.vehicleOrSite || '').toLowerCase().indexOf('solar') >= 0);
            if (isSolar) {
              item.category = 'solar_cleaning';
              item.serviceCategory = 'Solar Panel Cleaning';
              item._seq = ++spcIdx;
            } else {
              item.category = 'car_washing';
              item.serviceCategory = 'Car Washing';
              item._seq = ++cwIdx;
            }
            list.push(item);
          });
        }
      }

      state.customers = list;
      updateFilterCounts();
      applyCustomerFilterAndSearch();
      updateRouteProgressBar();
    }

    function updateFilterCounts() {
      // Pending/Incomplete task counts for footer tab badges
      var dccCount = state.customers.filter(function(c) {
        if (c.category !== 'daily_car_cleaning') return false;
        var custId = c.customerId || c.id || getCustomerStableId(c);
        return !isCustomerDoneToday(custId);
      }).length;

      var otherCount = state.customers.filter(function(c) {
        if (c.category === 'daily_car_cleaning') return false;
        var status = c.status || (c.completedToday ? 'completed' : 'assigned');
        return status !== 'completed' && status !== 'cancelled' && !c.completedToday;
      }).length;

      var cwCount = state.customers.filter(function(c) {
        if (c.category !== 'car_washing') return false;
        var status = c.status || (c.completedToday ? 'completed' : 'assigned');
        return status !== 'completed' && status !== 'cancelled' && !c.completedToday;
      }).length;
      var spcCount = state.customers.filter(function(c) {
        if (c.category !== 'solar_cleaning') return false;
        var status = c.status || (c.completedToday ? 'completed' : 'assigned');
        return status !== 'completed' && status !== 'cancelled' && !c.completedToday;
      }).length;

      var elDcc = document.getElementById('countDailyClean');
      var elOther = document.getElementById('countOtherJobs');
      var elCw = document.getElementById('countCarWash');
      var elSpc = document.getElementById('countSolarClean');

      function updateTabBadge(badgeEl, count) {
        if (!badgeEl) return;
        var num = parseInt(count, 10) || 0;
        if (num > 0) {
          badgeEl.textContent = num > 99 ? '99+' : String(num);
          badgeEl.style.display = 'inline-flex';
        } else {
          badgeEl.textContent = '0';
          badgeEl.style.display = 'none';
        }
      }

      updateTabBadge(elDcc, dccCount);
      updateTabBadge(elOther, otherCount);
      updateTabBadge(elCw, cwCount);
      updateTabBadge(elSpc, spcCount);

      var totalDcc = state.customers.filter(function(c) { return c.category === 'daily_car_cleaning'; }).length;
      var totalOther = state.customers.filter(function(c) { return c.category !== 'daily_car_cleaning'; }).length;
      var totalCw = state.customers.filter(function(c) { return c.category === 'car_washing'; }).length;
      var totalSpc = state.customers.filter(function(c) { return c.category === 'solar_cleaning'; }).length;

      var currentTabTotal = totalDcc;
      if (state.activeFilter === 'other_jobs') {
        currentTabTotal = totalOther;
      } else if (state.activeFilter === 'car_washing') {
        currentTabTotal = totalCw;
      } else if (state.activeFilter === 'solar_cleaning') {
        currentTabTotal = totalSpc;
      }

      var badge = document.getElementById('staffCarCount');
      if (badge) {
        if (state.activeFilter === 'other_jobs') {
          badge.textContent = '⚡ ' + currentTabTotal + ' काम';
        } else if (state.activeFilter === 'solar_cleaning') {
          badge.textContent = '☀️ ' + currentTabTotal + ' साइट्स';
        } else if (state.activeFilter === 'car_washing') {
          badge.textContent = '🧼 ' + currentTabTotal + ' गाड़ियां';
        } else {
          badge.textContent = '🚗 ' + currentTabTotal + ' गाड़ियां';
        }
      }
    }

    function setStaffFilter(filter) {
      state.activeFilter = filter;
      var pillDcc = document.getElementById('pillDailyClean');
      var pillOther = document.getElementById('pillOtherJobs');
      var pillCw = document.getElementById('pillCarWash');
      var pillSpc = document.getElementById('pillSolarClean');
      var pillSet = document.getElementById('pillStaffSettings');
      var jobsPanel = document.getElementById('staffJobsPanel');
      var settingsPanel = document.getElementById('staffSettingsPanel');
      var inlineChip = document.getElementById('staffInlineProgressChip');

      var isDcc = (filter === 'daily_car_cleaning');
      var isOther = (filter === 'other_jobs' || filter === 'car_washing' || filter === 'solar_cleaning' || filter === 'interior_detailing' || filter === 'exterior_detailing');
      var isCw = (filter === 'car_washing');
      var isSpc = (filter === 'solar_cleaning');
      var isSet = (filter === 'settings');

      if (pillDcc) {
        pillDcc.classList.toggle('active', isDcc);
        pillDcc.setAttribute('aria-selected', isDcc ? 'true' : 'false');
      }
      if (pillOther) {
        pillOther.classList.toggle('active', isOther);
        pillOther.setAttribute('aria-selected', isOther ? 'true' : 'false');
      }
      if (pillCw) {
        pillCw.classList.toggle('active', isCw);
        pillCw.setAttribute('aria-selected', isCw ? 'true' : 'false');
      }
      if (pillSpc) {
        pillSpc.classList.toggle('active', isSpc);
        pillSpc.setAttribute('aria-selected', isSpc ? 'true' : 'false');
      }
      if (pillSet) {
        pillSet.classList.toggle('active', isSet);
        pillSet.setAttribute('aria-selected', isSet ? 'true' : 'false');
      }

      if (filter === 'settings') {
        if (jobsPanel) jobsPanel.style.display = 'none';
        if (settingsPanel) settingsPanel.style.display = 'block';
        var otherJobsFilterBar = document.getElementById('otherJobsFilterBar');
        if (otherJobsFilterBar) otherJobsFilterBar.style.display = 'none';
        updateRouteProgressBar();
        if (typeof updateSettingsPrefButtons === 'function') updateSettingsPrefButtons();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (jobsPanel) jobsPanel.style.display = 'block';
        if (settingsPanel) settingsPanel.style.display = 'none';
        var otherJobsFilterBar = document.getElementById('otherJobsFilterBar');
        if (otherJobsFilterBar) {
          otherJobsFilterBar.style.display = (filter === 'other_jobs') ? 'flex' : 'none';
        }
        if (inlineChip) {
          inlineChip.style.display = (filter === 'daily_car_cleaning' || !filter) ? 'flex' : 'none';
        }
        updateFilterCounts();
        applyCustomerFilterAndSearch();
        updateRouteProgressBar();
      }
    }

    function setOtherJobsSubFilter(sub) {
      state.otherJobsSubFilter = sub || 'all';
      var chips = ['chipOtherAll', 'chipOtherWash', 'chipOtherSolar', 'chipOtherInterior', 'chipOtherExterior'];
      var map = {
        all: 'chipOtherAll',
        car_washing: 'chipOtherWash',
        solar_cleaning: 'chipOtherSolar',
        interior_detailing: 'chipOtherInterior',
        exterior_detailing: 'chipOtherExterior'
      };
      chips.forEach(function(cId) {
        var el = document.getElementById(cId);
        if (el) {
          el.classList.remove('active');
          el.setAttribute('aria-selected', 'false');
        }
      });
      var activeEl = document.getElementById(map[state.otherJobsSubFilter] || 'chipOtherAll');
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.setAttribute('aria-selected', 'true');
      }
      applyCustomerFilterAndSearch();
    }

    function handleStaffSearch(query) {
      state.searchQuery = (query || '').toLowerCase().trim();
      var clr = document.getElementById('btnStaffSearchClear');
      if (clr) clr.style.display = state.searchQuery ? 'inline-flex' : 'none';
      applyCustomerFilterAndSearch();
    }

    function clearStaffSearch() {
      var inp = document.getElementById('staffSearchInput');
      var clr = document.getElementById('btnStaffSearchClear');
      if (inp) inp.value = '';
      if (clr) clr.style.display = 'none';
      state.searchQuery = '';
      applyCustomerFilterAndSearch();
    }

    function applyCustomerFilterAndSearch() {
      var tabTotal = state.customers.filter(function(c) {
        if (!state.activeFilter) return true;
        if (state.activeFilter === 'other_jobs') {
          if (c.category === 'daily_car_cleaning') return false;
          if (state.otherJobsSubFilter && state.otherJobsSubFilter !== 'all') {
            return (c.category === state.otherJobsSubFilter || c.serviceCategoryId === state.otherJobsSubFilter);
          }
          return true;
        }
        return c.category === state.activeFilter;
      }).length;

      var filtered = state.customers.filter(function(c) {
        /* Category filter - strictly match selected tab */
        if (state.activeFilter) {
          if (state.activeFilter === 'other_jobs') {
            if (c.category === 'daily_car_cleaning') return false;
            if (state.otherJobsSubFilter && state.otherJobsSubFilter !== 'all') {
              if (c.category !== state.otherJobsSubFilter && c.serviceCategoryId !== state.otherJobsSubFilter) return false;
            }
          } else if (c.category !== state.activeFilter) {
            return false;
          }
        }

        /* Search query - Bilingual Phonetic Cross-Search */
        if (state.searchQuery) {
          return recordMatchesBilingualSearch(c, state.searchQuery);
        }
        return true;
      });

      /* Dynamic matching counter */
      var badge = document.getElementById('staffCarCount');
      if (badge) {
        var icon = '🚗 ';
        var label = ' गाड़ियां';
        if (state.activeFilter === 'other_jobs') {
          icon = '⚡ ';
          label = ' काम';
        } else if (state.activeFilter === 'solar_cleaning') {
          icon = '☀️ ';
          label = ' साइट्स';
        } else if (state.activeFilter === 'car_washing') {
          icon = '🧼 ';
          label = ' गाड़ियां';
        }
        if (state.searchQuery) {
          badge.textContent = icon + filtered.length + ' / ' + tabTotal + label;
        } else {
          badge.textContent = icon + tabTotal + label;
        }
      }

      renderCustomerCards(filtered);
      updateRouteProgressBar();
    }

    function renderSkeletonCards(count) {
      var n = count || 3;
      var html = '<div class="skeleton-feed">';
      for (var i = 0; i < n; i++) {
        html += '<div class="smart-card skeleton-card">' +
          '<div class="card-header-row">' +
            '<div class="card-title-group" style="gap:8px;">' +
              '<div class="skeleton-shimmer skeleton-badge"></div>' +
              '<div class="skeleton-shimmer skeleton-title"></div>' +
            '</div>' +
            '<div class="card-action-buttons">' +
              '<div class="skeleton-shimmer skeleton-btn"></div>' +
              '<div class="skeleton-shimmer skeleton-btn"></div>' +
            '</div>' +
          '</div>' +
          '<div class="card-vehicle-row" style="margin-top:6px;">' +
            '<div class="skeleton-shimmer skeleton-plate"></div>' +
            '<div class="skeleton-shimmer skeleton-thumb"></div>' +
          '</div>' +
          '<div class="skeleton-shimmer skeleton-addr" style="margin-top:6px;"></div>' +
        '</div>';
      }
      html += '</div>' +
        '<div style="text-align: center; padding: 10px; font-size: 12px; color: var(--text-muted); font-weight: 600;">' +
          '⏳ गाड़ियों की लिस्ट लोड हो रही है...' +
        '</div>';
      return html;
    }

    function formatTimeOnly(isoString) {
      if (!isoString) return '';
      try {
        var d = new Date(isoString);
        return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (e) {
        return '';
      }
    }

    /* =========================================================================
       SMART COMPACT CARD RENDERER (Mobile-First, Professional Layout)
       - Customer name & sequence hierarchy
       - High-visibility Call & Google Maps navigation touch targets
       - Prominent vehicle/site plate & package pill
       - Direct car photo thumbnail preview (click to enlarge)
       - Direct readable address snippet (click for full modal)
       - Staff cleaning notes callout banner
       - Route sequence order strictly preserved
       ========================================================================= */
    function renderCustomerCards(items) {
      if (!state.currentDateKey) state.currentDateKey = getTodayDateKey();
      state.currentStaffFilteredList = items || [];
      var container = document.getElementById('customerFeed');
      if (!container) return;

      if (!items || items.length === 0) {
        var isSearchActive = Boolean(state.searchQuery);
        var isHi = (state.lang !== 'en');
        var emptyMsg = isSearchActive 
          ? (isHi ? 'सर्च के अनुसार कोई रिकॉर्ड नहीं मिला। ("' + escapeHtml(state.searchQuery) + '")' : 'No records found matching search ("' + escapeHtml(state.searchQuery) + '")')
          : (state.activeFilter === 'other_jobs' ? (isHi ? 'इस केटेगरी में कोई अन्य काम (वॉश/सोलर/डिटेलिंग) असाइन नहीं है।' : 'No other jobs assigned in this category.') : (state.activeFilter === 'solar_cleaning' ? (isHi ? 'इस केटेगरी में कोई सोलर साइट असाइन नहीं है।' : 'No solar cleaning sites assigned in this category.') : (state.activeFilter === 'car_washing' ? (isHi ? 'इस केटेगरी में कोई कार वॉशिंग असाइन नहीं है।' : 'No car wash jobs assigned in this category.') : (isHi ? 'इस केटेगरी में कोई दैनिक कार सफाई असाइन नहीं है।' : 'No daily car cleaning assignments in this category.'))));
        var emptyIcon = isSearchActive ? '🔍' : (state.activeFilter === 'other_jobs' ? '⚡' : (state.activeFilter === 'solar_cleaning' ? '☀️' : (state.activeFilter === 'car_washing' ? '🧼' : '🚗')));
        var actionBtnHtml = isSearchActive 
          ? '<div style="margin-top:12px;"><button type="button" class="btn-clear-search-empty" onclick="clearStaffSearch()">✕ ' + (isHi ? 'सर्च हटाएं (Clear search)' : 'Clear search') + '</button></div>'
          : '<div style="margin-top:12px;"><button type="button" class="btn-clear-search-empty" onclick="setStaffFilter(\'daily_car_cleaning\')">' + (isHi ? '🚗 मुख्य दैनिक सफाई पर जाएं' : '🚗 Go to Daily Cleaning') + '</button></div>';
        container.innerHTML = '<div class="empty-state-card">' +
          '<div class="empty-icon-wrap">' + emptyIcon + '</div>' +
          '<h4 class="empty-title">' + (isHi ? 'कोई रिकॉर्ड नहीं मिला' : 'No records found') + '</h4>' +
          '<p class="empty-desc">' + emptyMsg + '</p>' +
          actionBtnHtml +
        '</div>';
        updateRouteProgressBar();
        return;
      }

      var html = '';
      items.forEach(function(item, index) {
        var isHi = (state.lang !== 'en');
        var isSolar = item.category === 'solar_cleaning';
        var isCarWash = item.category === 'car_washing';
        var isInterior = item.category === 'interior_detailing';
        var isExterior = item.category === 'exterior_detailing';
        var isDaily = item.category === 'daily_car_cleaning' || (!isSolar && !isCarWash && !isInterior && !isExterior);

        // Smart Dual-Language Display (English + Google Indic Hindi)
        var rawName = item.customerName || 'Customer';
        var hiName = (item.nameHi || item.name_hi || '').trim();
        var displayName = (isHi && hiName) ? hiName : rawName;
        var customerName = escapeHtml(displayName);
        var subNameEn = (isHi && hiName && hiName !== rawName) ? escapeHtml(rawName) : '';

        var cleanPhone = normalizeIndianMobile(item.customerNumber);
        var formattedPhone = cleanPhone ? formatIndianMobile(cleanPhone) : '';

        var rawVeh = item.vehicleNumbers || item.vehicleOrSite || item.vehicle;
        var vehicles = (rawVeh != null ? String(rawVeh) : '').trim() || (isSolar ? (isHi ? 'साइट विवरण उपलब्ध नहीं' : 'Site Details Not Provided') : (isHi ? 'गाड़ी नंबर उपलब्ध नहीं' : 'Vehicle Not Provided'));
        var notes = (item.staffNotes || item.notes != null ? String(item.staffNotes || item.notes) : '').trim();

        var rawAddr = (item.address != null ? String(item.address) : '').trim();
        var hiAddr = (item.addressHi || item.address_hi != null ? String(item.addressHi || item.address_hi) : '').trim();
        var address = (isHi && hiAddr) ? hiAddr : rawAddr;

        var rawSecAddr = (item.secondaryAddress != null ? String(item.secondaryAddress) : '').trim();
        var hiSecAddr = (item.secondaryAddressHi || item.secondary_address_hi != null ? String(item.secondaryAddressHi || item.secondary_address_hi) : '').trim();
        var secAddress = (isHi && hiSecAddr) ? hiSecAddr : rawSecAddr;

        var mapsUrl = formatGoogleMapsUrl(item.googleMapsUrl, address);
        var secMapsUrl = formatGoogleMapsUrl(item.secondaryMapsUrl, secAddress);
        var hasPrimaryLoc = !!(mapsUrl || address);
        var hasSecLoc = !!(secMapsUrl || secAddress);
        var locationCount = (hasPrimaryLoc ? 1 : 0) + (hasSecLoc ? 1 : 0);
        var photoUrl = (item.photoUrl != null ? String(item.photoUrl) : '').trim();
        var pkgLabel = (item.packageType || item.serviceType || (isSolar ? 'Solar Panel Cleaning' : (isCarWash ? 'Car Washing' : (isInterior ? 'Interior Detailing' : (isExterior ? 'Exterior Detailing' : 'Daily Car Cleaning'))))).toString().trim();
        var vIcon = isSolar ? '☀️' : (isCarWash ? '🧼' : (isInterior ? '✨' : (isExterior ? '🛡️' : '🚘')));

        /* Route Sequence Number */
        var seqNumber = item._seq !== undefined ? item._seq : (index + 1);

        /* Lightweight thumbnail for Cloudinary CDN */
        var thumbUrl = photoUrl;
        if (photoUrl && photoUrl.indexOf('res.cloudinary.com') !== -1 && photoUrl.indexOf('/upload/') !== -1 && photoUrl.indexOf('/upload/w_') === -1) {
          thumbUrl = photoUrl.replace('/upload/', '/upload/w_120,h_120,c_fill,q_auto,f_auto/');
        }

        var seqDisplay = item._seq || (index < 9 ? '0' + (index + 1) : String(index + 1));
        var custId = item.customerId || item.id || getCustomerStableId(item);
        var isDone = isDaily && isCustomerDoneToday(custId);

        html += '<div class="smart-card' + (isDone ? ' card-cleaned-done' : '') + '" id="staffCard-' + index + '" data-customer-id="' + escapeHtml(custId) + '">';

        /* Row 1: S.No + Customer Name (Left) & Call + Directions + Location Buttons (Right) */
        html += '  <div class="card-header-row">';
        html += '    <div class="card-title-group">';
        if (isDaily) {
          html += '      <span class="cust-route-seq-badge" title="रूट क्रम: ' + seqDisplay + '">' + seqDisplay + '</span>';
        } else {
          html += '      <span class="cust-index-badge">#' + seqNumber + '</span>';
        }
        html += '      <div class="cust-name-with-audio" style="display: flex; flex-direction: column; min-width: 0;">';
        html += '        <h3 class="cust-full-name" title="' + customerName + '">' + customerName + '</h3>';
        if (subNameEn) {
          html += '        <span class="cust-bilingual-sub" title="' + subNameEn + '">(' + subNameEn + ')</span>';
        }
        html += '      </div>';
        html += '      <button type="button" class="btn-card-audio" onclick="speakHindiCustomerDetails(\'' + escapeHtml(displayName).replace(/'/g, "\\'") + '\', \'' + escapeHtml(address).replace(/'/g, "\\'") + '\', event)" title="' + (isHi ? 'नाम और पता सुनें' : 'Listen name & address') + '">';
        html += '        <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">volume_up</span>';
        html += '      </button>';
        html += '    </div>';
        
        html += '    <div class="card-action-buttons">';
        if (cleanPhone) {
          html += '      <a href="' + getIndianPhoneLink(cleanPhone) + '" class="btn-card-action btn-call" title="' + (isHi ? 'कॉल करें: ' : 'Call: ') + escapeHtml(formattedPhone) + '">';
          html += '        <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">call</span><span>' + (isHi ? 'कॉल' : 'Call') + '</span>';
          html += '      </a>';
        } else {
          html += '      <button type="button" class="btn-card-action btn-action-disabled" onclick="handleUnavailableItem(\'phone\')" title="' + (isHi ? 'मोबाइल नंबर उपलब्ध नहीं है' : 'Phone number not available') + '">';
          html += '        <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">phone_disabled</span><span>' + (isHi ? 'कॉल नहीं' : 'No Phone') + '</span>';
          html += '      </button>';
        }

        if (locationCount >= 2) {
          html += '      <button type="button" class="btn-card-action btn-location btn-location-multi" onclick="openStaffAddressModal(' + index + ')" title="' + (isHi ? '2 लोकेशन उपलब्ध हैं: मुख्य और सेकेंडरी' : '2 Locations available: Primary and Secondary') + '">';
          html += '        <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">pin_drop</span><span>' + (isHi ? '2 लोकेशन' : '2 Locations') + '</span>';
          html += '      </button>';
        } else if (locationCount === 1) {
          html += '      <button type="button" class="btn-card-action btn-location" onclick="openStaffAddressModal(' + index + ')" title="' + (isHi ? 'ग्राहक की लोकेशन देखें' : 'View customer location') + '">';
          html += '        <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">location_on</span><span>' + (isHi ? 'लोकेशन' : 'Location') + '</span>';
          html += '      </button>';
        } else {
          html += '      <button type="button" class="btn-card-action btn-action-disabled" onclick="handleUnavailableItem(\'location\')" title="' + (isHi ? 'लोकेशन / पता उपलब्ध नहीं है' : 'Location / address not available') + '">';
          html += '        <span class="material-symbols-outlined" style="font-size: 16px;" aria-hidden="true">location_off</span><span>' + (isHi ? 'लोकेशन नहीं' : 'No Location') + '</span>';
          html += '      </button>';
        }
        html += '    </div>';
        html += '  </div>';

        /* Row 2: Vehicle / Site Plate + Package Badge + Photo Thumbnail */
        html += '  <div class="card-vehicle-row">';
        html += '    <div class="vehicle-details-wrap">';
        if (isSolar) {
          var panelText = (item.panelCount || (item.siteDetails && item.siteDetails.panelCount)) ? (item.panelCount || item.siteDetails.panelCount) + ' Panels' : '';
          html += '      <div class="solar-site-badge" title="' + escapeHtml(vehicles) + '">';
          html += '        <span class="vehicle-plate-icon">☀️</span>';
          html += '        <span class="vehicle-plate-text">' + escapeHtml(vehicles) + '</span>';
          html += '      </div>';
          if (panelText) {
            html += '      <span class="badge-solar-panels" title="Total Solar Panels">☀️ ' + escapeHtml(panelText) + '</span>';
          }
        } else if (isDaily) {
          var vehInfo = parseVehicleDetails(vehicles);
          if (vehInfo.isMulti && vehInfo.vehicles && vehInfo.vehicles.length > 1) {
            html += '      <div class="multi-vehicle-rotation-cluster">';
            html += '        <div class="rotation-type-pill" title="' + (isHi ? '1 दिन छोड़कर 1 गाड़ी की सफाई' : 'Alternate day vehicle rotation') + '">';
            html += '          <span class="material-symbols-outlined" style="font-size: 13px;" aria-hidden="true">sync_alt</span>';
            html += '          <span>' + (isHi ? '1 दिन 1 गाड़ी (अल्टरनेट प्लान)' : 'Alternate Day Rotation (2 Cars)') + '</span>';
            html += '        </div>';
            html += '        <div class="multi-plates-row">';
            vehInfo.vehicles.forEach(function(vSub) {
              html += '          <div class="vehicle-plate-badge sub-plate-badge" title="' + escapeHtml(vSub.display || vSub.reg) + '">';
              html += '            <span class="vehicle-plate-icon">🚘</span>';
              if (vSub.reg) {
                html += '            <span class="vehicle-plate-reg"><strong>' + escapeHtml(vSub.reg) + '</strong></span>';
              }
              if (vSub.model) {
                html += '            <span class="vehicle-plate-model">' + (vSub.reg ? ' • ' : '') + escapeHtml(vSub.model) + '</span>';
              }
              html += '          </div>';
            });
            html += '        </div>';
            html += '      </div>';
          } else {
            html += '      <div class="vehicle-plate-badge" title="' + escapeHtml(vehicles) + '">';
            html += '        <span class="vehicle-plate-icon">🚘</span>';
            if (vehInfo.reg) {
              html += '        <span class="vehicle-plate-reg"><strong>' + escapeHtml(vehInfo.reg) + '</strong></span>';
            }
            if (vehInfo.model) {
              html += '        <span class="vehicle-plate-model">' + (vehInfo.reg ? ' • ' : '') + escapeHtml(vehInfo.model) + '</span>';
            }
            if (!vehInfo.reg && !vehInfo.model) {
              var rawVehDisplay = vehInfo.display || vehicles;
              if (rawVehDisplay && !/^(गाड़ी|गाड़ी|vehicle|car)$/i.test(rawVehDisplay.trim())) {
                html += '        <span class="vehicle-plate-model">' + escapeHtml(rawVehDisplay) + '</span>';
              } else {
                html += '        <span class="vehicle-plate-model">' + (isHi ? 'गाड़ी विवरण उपलब्ध नहीं' : 'Vehicle Not Provided') + '</span>';
              }
            }
            html += '      </div>';
          }
        } else {
          html += '      <div class="vehicle-plate-badge" title="' + escapeHtml(vehicles) + '">';
          html += '        <span class="vehicle-plate-icon">' + vIcon + '</span>';
          html += '        <span class="vehicle-plate-text">' + escapeHtml(vehicles) + '</span>';
          html += '      </div>';
        }
        if (pkgLabel) {
          html += '      <span class="package-pill-badge">' + escapeHtml(pkgLabel) + '</span>';
        }
        if (isSolar) {
          var pCount = item.panelCount || (item.siteDetails && (item.siteDetails.panelCount || item.siteDetails.panel_count));
          if (pCount) {
            html += '      <span class="solar-panels-badge" title="No. of Panels: ' + escapeHtml(pCount) + '">☀️ ' + escapeHtml(pCount) + (isHi ? ' सोलर पैनल्स' : ' Panels') + '</span>';
          }
        }
        if (!isSolar && item.seaterType) {
          var seaterLabel = (item.seaterType === '5_plus_seater') ? '🚙 5+ Seater' : '🚗 5 Seater';
          html += '      <span class="seater-badge" title="Vehicle Sizing">' + escapeHtml(seaterLabel) + '</span>';
        }
        if (!isDaily) {
          var cBadge = '';
          if (isInterior) cBadge = '<span class="badge-cat-interior">✨ इंटीरियर डिटेलिंग</span>';
          else if (isExterior) cBadge = '<span class="badge-cat-exterior">🛡️ एक्सटीरियर डिटेलिंग</span>';
          else if (isCarWash) cBadge = '<span class="badge-cat-carwash">🧼 कार वॉश</span>';
          else if (isSolar) cBadge = '<span class="badge-cat-solar">☀️ सोलर सफाई</span>';
          if (cBadge) html += '      ' + cBadge;
        }
        var cardMake = (item.carMake || item.car_make || '').trim();
        var cardColor = (item.carColor || item.car_color || '').trim();
        if (!isSolar && (cardMake || cardColor)) {
          var makeColorText = [cardMake, cardColor].filter(Boolean).join(' • ');
          html += '      <span class="vehicle-make-color-pill" title="Car Make & Color: ' + escapeHtml(makeColorText) + '">🚘 ' + escapeHtml(makeColorText) + '</span>';
        }
        html += '    </div>';

        if (photoUrl) {
          html += '    <div class="card-photo-wrap">';
          html += '      <button type="button" class="btn-photo-thumb" onclick="openStaffPhotoModal(' + index + ')" title="' + (isHi ? 'गाड़ी का फोटो देखें' : 'View vehicle photo') + '">';
          html += '        <img src="' + escapeHtml(thumbUrl) + '" class="card-mini-thumb" alt="Photo" onerror="this.style.display=\'none\'">';
          html += '        <span class="photo-thumb-label"><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: -2px;" aria-hidden="true">photo_camera</span> ' + (isHi ? 'फोटो' : 'Photo') + '</span>';
          html += '      </button>';
          html += '    </div>';
        }
        html += '  </div>';

        /* Row 3: Address & Location Rows (Direct clickable snippet for single location; multi-location cards use top 2-location button) */
        if (locationCount < 2 && address) {
          html += '  <div class="card-address-row">';
          html += '    <div class="card-address-content" onclick="openStaffAddressModal(' + index + ')" title="' + (isHi ? 'पूरा पता देखने के लिए क्लिक करें' : 'Click to view full address') + '">';
          html += '      <span class="addr-icon">📍</span>';
          html += '      <div class="addr-text-wrap">';
          html += '        <span class="addr-primary">' + escapeHtml(address || (isHi ? 'गूगल मैप लोकेशन' : 'Location on Map')) + '</span>';
          html += '      </div>';
          html += '    </div>';
          if (mapsUrl) {
            html += '    <a href="' + escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-card-map-direct" title="' + (isHi ? 'गूगल मैप्स खोलें' : 'Open Google Maps') + '" onclick="event.stopPropagation();">';
            html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>';
            html += '      <span>' + (isHi ? 'मैप ↗' : 'Map ↗') + '</span>';
            html += '    </a>';
          }
          html += '  </div>';
        }

        if (secAddress || secMapsUrl) {
          html += '  <div class="card-address-row card-sec-address-row">';
          html += '    <div class="card-address-content" onclick="openStaffAddressModal(' + index + ')" title="' + (isHi ? 'सेकेंडरी पता देखने के लिए क्लिक करें' : 'Click to view secondary address') + '">';
          html += '      <span class="addr-icon" style="color:#7c3aed;">🏢</span>';
          html += '      <div class="addr-text-wrap">';
          html += '        <span class="addr-primary" style="color:#475569;"><strong style="color:#7c3aed;">2nd:</strong> ' + escapeHtml(secAddress || (isHi ? 'सेकेंडरी मैप लोकेशन' : 'Secondary location on Map')) + '</span>';
          html += '      </div>';
          html += '    </div>';
          if (secMapsUrl) {
            html += '    <a href="' + escapeHtml(secMapsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-card-map-direct btn-card-map-sec" title="' + (isHi ? 'सेकेंडरी मैप खोलें' : 'Open Secondary Map') + '" onclick="event.stopPropagation();">';
            html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>';
            html += '      <span>' + (isHi ? '2nd मैप ↗' : '2nd Map ↗') + '</span>';
            html += '    </a>';
          }
          html += '  </div>';
        }

        /* Row 4: Staff Notes / Cleaning Instructions */
        if (notes) {
          html += '  <div class="card-notes-row">';
          html += '    <span class="notes-icon">📝</span>';
          html += '    <div class="notes-content">';
          html += '      <span class="notes-label">' + (isHi ? 'निर्देश:' : 'Notes:') + '</span>';
          html += '      <span class="notes-body">' + escapeHtml(notes) + '</span>';
          html += '    </div>';
          html += '  </div>';
        }

        /* Row 5: Daily Clean Status Action & Persistent WhatsApp Share */
        if (isDaily) {
          html += '  <div class="card-status-actions-bar-split">';
          if (isDone) {
            var compData = getCustomerCompletionData(custId);
            var isCarNotPresent = compData && (compData.carNotPresent === true || compData.tag === 'car_not_present' || compData.status === 'car_not_present');
            if (isCarNotPresent) {
              html += '    <button type="button" class="btn-clean-done done-active card-status-not-present" onclick="handleDailyCleanClick(\'' + escapeHtml(custId) + '\', ' + index + ')" title="' + (isHi ? 'कार मौजूद नहीं थी (फोटो देखने या रीटेक करने के लिए क्लिक करें)' : 'Car not present (Click to view or retake photo)') + '">';
              html += '      <span class="material-symbols-outlined status-completed-icon" style="font-size: 18px;" aria-hidden="true">cancel</span>';
              html += '      <span>' + (isHi ? 'कार नहीं थी (Not Present)' : 'Car Not Present') + '</span>';
              html += '    </button>';
            } else {
              html += '    <button type="button" class="btn-clean-done done-active card-status-completed" onclick="handleDailyCleanClick(\'' + escapeHtml(custId) + '\', ' + index + ')" title="' + (isHi ? 'सफाई पूर्ण हो चुकी है (फोटो देखने या रीटेक करने के लिए क्लिक करें)' : 'Cleaning completed (Click to view or retake photo)') + '">';
              html += '      <span class="material-symbols-outlined status-completed-icon" style="font-size: 18px;" aria-hidden="true">check_circle</span>';
              html += '      <span>' + (isHi ? 'साफ हो गई (Done)' : 'Cleaned (Done)') + '</span>';
              html += '    </button>';
            }
          } else {
            html += '    <button type="button" class="btn-clean-done" onclick="handleDailyCleanClick(\'' + escapeHtml(custId) + '\', ' + index + ')">';
            html += '      <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">photo_camera</span>';
            html += '      <span>' + (isHi ? 'आज साफ करें (Mark Cleaned)' : 'Mark Cleaned') + '</span>';
            html += '    </button>';
          }
          html += '    <button type="button" class="btn-clean-wa ' + (isDone ? 'wa-ready' : 'wa-idle') + '" onclick="handleCustomerWhatsAppShare(\'' + escapeHtml(custId) + '\', ' + index + ')" title="' + (isHi ? 'व्हाट्सएप पर शेयर करें' : 'Share to WhatsApp') + '">';
          html += '      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 6.46 17.5 2 12.04 2M12.05 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.05 20.15Z"/></svg>';
          html += '      <span>' + (isHi ? 'व्हाट्सएप' : 'WhatsApp') + '</span>';
          html += '    </button>';
          html += '  </div>';
        } else {
          /* On-Demand / Special Job: 3-Step Completion Journey */
          var jId = item.jobId || item.id;
          var jStatus = item.status || (item.completedToday ? 'completed' : 'assigned');
          var beforeList = Array.isArray(item.beforePhotos) ? item.beforePhotos : [];
          var afterList = Array.isArray(item.afterPhotos) ? item.afterPhotos : [];

          html += '  <div class="card-special-job-journey" style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-color);">';

          if (jStatus === 'assigned') {
            html += '    <div class="job-card-journey-bar job-status-assigned">';
            html += '      <span><span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle; margin-right: 4px;" aria-hidden="true">assignment</span>नया काम (Awaiting Start)</span>';
            html += '      <span class="job-time-chip">' + (item.scheduledDate ? 'तारीख: ' + escapeHtml(item.scheduledDate) : 'आज का काम') + '</span>';
            html += '    </div>';
            html += '    <div style="display: flex; gap: 8px; margin-top: 6px;">';
            html += '      <button type="button" class="btn-job-action btn-job-start" style="flex: 1;" onclick="openStartSpecialJobModal(\'' + escapeHtml(jId) + '\')">';
            html += '        <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">play_arrow</span><span>काम शुरू करें (1-2 फ़ोटो लें)</span>';
            html += '      </button>';
            html += '      <button type="button" class="btn-job-action btn-job-cancel" onclick="openCancelSpecialJobModal(\'' + escapeHtml(jId) + '\')" title="बुकिंग रद्द करें (Cancel Booking)">';
            html += '        <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">cancel</span><span>रद्द करें</span>';
            html += '      </button>';
            html += '    </div>';
          } else if (jStatus === 'in_progress') {
            var stTime = item.startedAt ? formatTimeOnly(item.startedAt) : '';
            html += '    <div class="job-card-journey-bar job-status-in-progress">';
            html += '      <span><span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle; margin-right: 4px;" aria-hidden="true">pending</span>काम चालू है (In Progress)</span>';
            html += '      <span class="job-time-chip">' + (stTime ? 'शुरू: ' + stTime : 'प्रगति पर') + '</span>';
            html += '    </div>';

            if (beforeList.length > 0) {
              html += '    <div style="font-size: 11px; font-weight: 600; color: var(--md-sys-color-outline, #64748b); margin-bottom: 4px;"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle; margin-right: 3px;" aria-hidden="true">photo_camera</span>शुरू करने से पहले की फ़ोटो:</div>';
              html += '    <div class="job-photos-grid">';
              beforeList.forEach(function(pUrl, pIdx) {
                html += '    <div class="job-photo-item" onclick="openImageModal(\'' + escapeHtml(pUrl) + '\', \'' + escapeHtml(customerName) + '\', \'Before Photo ' + (pIdx + 1) + '\')">';
                html += '      <img src="' + escapeHtml(pUrl) + '" alt="Before Photo" onerror="this.onerror=null; this.classList.add(\'img-broken\'); this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'120\\\' height=\\\'90\\\' viewBox=\\\'0 0 120 90\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23f1f5f9\\\'/><circle cx=\\\'60\\\' cy=\\\'36\\\' r=\\\'14\\\' fill=\\\'%23cbd5e1\\\'/><path d=\\\'M52 36l5-5 4 4 5-6 6 7H48z\\\' fill=\\\'%2394a3b8\\\'/><text x=\\\'60\\\' y=\\\'64\\\' font-size=\\\'10\\\' font-family=\\\'sans-serif\\\' fill=\\\'%2364748b\\\' text-anchor=\\\'middle\\\' font-weight=\\\'600\\\'>फोटो लोड विफल</text></svg>\';">';
                html += '      <span class="job-photo-label">Before ' + (pIdx + 1) + '</span>';
                html += '    </div>';
              });
              html += '    </div>';
            }

            html += '    <div style="display: flex; gap: 8px; margin-top: 6px;">';
            html += '      <button type="button" class="btn-job-action btn-job-complete" style="flex: 1;" onclick="openCompleteSpecialJobModal(\'' + escapeHtml(jId) + '\')">';
            html += '        <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">task_alt</span><span>काम पूरा करें (1-2 फ़ोटो अपलोड करें)</span>';
            html += '      </button>';
            html += '      <button type="button" class="btn-job-action btn-job-cancel" onclick="openCancelSpecialJobModal(\'' + escapeHtml(jId) + '\')" title="बुकिंग रद्द करें (Cancel Booking)">';
            html += '        <span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">cancel</span><span>रद्द करें</span>';
            html += '      </button>';
            html += '    </div>';
          } else if (jStatus === 'completed') {
            var compTime = item.completedAt ? formatTimeOnly(item.completedAt) : '';
            html += '    <div class="job-card-journey-bar job-status-completed">';
            html += '      <span><span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle; margin-right: 4px;" aria-hidden="true">check_circle</span>काम पूरा हुआ (Completed)</span>';
            html += '      <span class="job-time-chip">' + (compTime ? 'पूर्ण: ' + compTime : 'सफल') + '</span>';
            html += '    </div>';

            if (beforeList.length > 0 || afterList.length > 0) {
              html += '    <div style="font-size: 11px; font-weight: 600; color: var(--md-sys-color-outline, #64748b); margin-bottom: 4px;"><span class="material-symbols-outlined" style="font-size: 13px; vertical-align: middle; margin-right: 3px;" aria-hidden="true">photo_camera</span>सफाई का प्रमाण (Before & After):</div>';
              html += '    <div class="job-photos-grid">';
              beforeList.forEach(function(pUrl, pIdx) {
                html += '    <div class="job-photo-item" onclick="openImageModal(\'' + escapeHtml(pUrl) + '\', \'' + escapeHtml(customerName) + '\', \'Before Photo\')">';
                html += '      <img src="' + escapeHtml(pUrl) + '" alt="Before" onerror="this.onerror=null; this.classList.add(\'img-broken\'); this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'120\\\' height=\\\'90\\\' viewBox=\\\'0 0 120 90\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23f1f5f9\\\'/><circle cx=\\\'60\\\' cy=\\\'36\\\' r=\\\'14\\\' fill=\\\'%23cbd5e1\\\'/><path d=\\\'M52 36l5-5 4 4 5-6 6 7H48z\\\' fill=\\\'%2394a3b8\\\'/><text x=\\\'60\\\' y=\\\'64\\\' font-size=\\\'10\\\' font-family=\\\'sans-serif\\\' fill=\\\'%2364748b\\\' text-anchor=\\\'middle\\\' font-weight=\\\'600\\\'>फोटो लोड विफल</text></svg>\';">';
                html += '      <span class="job-photo-label">Before</span>';
                html += '    </div>';
              });
              afterList.forEach(function(pUrl, pIdx) {
                html += '    <div class="job-photo-item" onclick="openImageModal(\'' + escapeHtml(pUrl) + '\', \'' + escapeHtml(customerName) + '\', \'After Photo\')">';
                html += '      <img src="' + escapeHtml(pUrl) + '" alt="After" onerror="this.onerror=null; this.classList.add(\'img-broken\'); this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'120\\\' height=\\\'90\\\' viewBox=\\\'0 0 120 90\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23f1f5f9\\\'/><circle cx=\\\'60\\\' cy=\\\'36\\\' r=\\\'14\\\' fill=\\\'%23cbd5e1\\\'/><path d=\\\'M52 36l5-5 4 4 5-6 6 7H48z\\\' fill=\\\'%2394a3b8\\\'/><text x=\\\'60\\\' y=\\\'64\\\' font-size=\\\'10\\\' font-family=\\\'sans-serif\\\' fill=\\\'%2364748b\\\' text-anchor=\\\'middle\\\' font-weight=\\\'600\\\'>फोटो लोड विफल</text></svg>\';">';
                html += '      <span class="job-photo-label">After ✓</span>';
                html += '    </div>';
              });
              html += '    </div>';
            }

            if (item.completionNotes) {
              html += '    <div style="font-size: 12px; background: var(--md-sys-color-surface-container-low, #f8fafc); padding: 6px 10px; border-radius: 6px; margin: 6px 0; color: var(--md-sys-color-on-surface-variant, #475569); border: 1px solid var(--md-sys-color-outline-variant, #e2e8f0);">';
              html += '      <strong>टिप्पणी:</strong> ' + escapeHtml(item.completionNotes);
              html += '    </div>';
            }

            html += '    <button type="button" class="btn-job-action btn-job-wa-share" onclick="shareSpecialJobWhatsApp(\'' + escapeHtml(jId) + '\')">';
            html += '      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 6.46 17.5 2 12.04 2M12.05 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.15 12.05 20.15Z"/></svg>';
            html += '      <span>ग्राहक को व्हाट्सएप भेजें (Share Proof)</span>';
            html += '    </button>';
          } else if (jStatus === 'cancelled') {
            var cTime = item.cancelledAt ? formatTimeOnly(item.cancelledAt) : '';
            var reason = item.cancellationReason || 'रद्द (Cancelled)';
            var remarks = item.cancellationRemarks || '';
            html += '    <div class="job-card-journey-bar job-status-cancelled">';
            html += '      <span><span class="material-symbols-outlined" style="font-size: 15px; vertical-align: middle; margin-right: 4px;" aria-hidden="true">block</span>रद्द (Cancelled)</span>';
            html += '      <span class="job-time-chip">' + (cTime ? 'रद्द: ' + cTime : 'रद्द') + '</span>';
            html += '    </div>';
            html += '    <div class="job-cancelled-details-box">';
            html += '      <div><strong>कारण:</strong> ' + escapeHtml(reason) + '</div>';
            if (remarks) {
              html += '      <div style="margin-top: 4px; color: var(--md-sys-color-outline, #64748b);"><strong>टिप्पणी:</strong> ' + escapeHtml(remarks) + '</div>';
            }
            html += '    </div>';
          }

          html += '  </div>';
        }

        html += '</div>';
      });

      container.innerHTML = html;
      updateRouteProgressBar();
    }

    function openStaffPhotoModal(index) {
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;
      var photoUrl = (item.photoUrl || '').trim();
      var custName = item.customerName || 'Customer';
      var vNum = item.vehicleNumbers || item.vehicleOrSite || '';
      openImageModal(photoUrl, custName, vNum);
    }

    function openStaffAddressModal(index) {
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;
      openAddressModal(item);
    }

    function handleUnavailableItem(type) {
      if (type === 'photo') {
        showToast('फोटो उपलब्ध नहीं है', '📷');
      } else if (type === 'address') {
        showToast('पता उपलब्ध नहीं है', '📍');
      } else if (type === 'phone') {
        showToast('मोबाइल नंबर उपलब्ध नहीं है', '📞');
      } else if (type === 'map' || type === 'location') {
        showToast('लोकेशन / पता उपलब्ध नहीं है', '📍');
      } else {
        showToast('उपलब्ध नहीं है', 'ℹ️');
      }
    }

    /* Google Maps Smart Formatter */
    function formatGoogleMapsUrl(rawLocation, fallbackAddress) {
      var loc = (rawLocation || '').toString().trim();
      var addr = (fallbackAddress || '').toString().trim();
      
      if (!loc && !addr) return '';
      
      /* If no specific location link provided, search by customer address */
      if (!loc) {
        return 'https:\x2F\x2Fwww.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
      }
      
      /* If already a full http/https link */
      var lowerLoc = loc.toLowerCase();
      if (lowerLoc.indexOf('http:') === 0 || lowerLoc.indexOf('https:') === 0) {
        return loc;
      }
      
      /* If starts with double slash */
      if (loc.indexOf('\x2F\x2F') === 0) {
        return 'https:' + loc;
      }

      /* If shortened link without protocol (e.g. maps.app.goo.gl or goo.gl/maps) */
      if (lowerLoc.indexOf('maps.app.goo.gl') === 0 || lowerLoc.indexOf('goo.gl/maps') === 0 || lowerLoc.indexOf('google.com/maps') === 0) {
        return 'https://' + loc;
      }

      /* Coordinates, Plus Code (7XQV+H8F Varanasi), or text address */
      return 'https:\x2F\x2Fwww.google.com/maps/search/?api=1&query=' + encodeURIComponent(loc);
    }

    /* =========================================================================
       ADMIN FUNCTIONS (Staff Management, Customer Entry, Active Records)
       ========================================================================= */
    function loadStaffListForAdmin() {
      apiCall('getStaffList', {}, function(list) {
        populateAdminStaffList(list);
      }, function(err) {
        showToast('Error loading staff: ' + (err.message || err), '❌');
      });
    }

    
    function compressStaffPhoto(dataUrl, callback) {
      var img = new Image();
      img.onload = function() {
        var maxDim = 500;
        var w = img.width;
        var h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var compressed = canvas.toDataURL('image/jpeg', 0.85);
        callback(compressed);
      };
      img.onerror = function() {
        callback(dataUrl);
      };
      img.src = dataUrl;
    }

    function handleStaffPhotoSelect(e, mode) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;

      var isImg = (file.type && file.type.toLowerCase().startsWith('image/')) ||
                  /\.(jpe?g|png|webp|gif|bmp|jfif|heic|svg)$/i.test(file.name || '');
      if (!isImg) {
        alert('Please choose a valid image file (JPG, PNG, WebP).');
        return;
      }

      var reader = new FileReader();
      reader.onerror = function(err) {
        console.error('File read error:', err);
        alert('Could not read image file. Please try another image.');
      };

      reader.onload = function(evt) {
        var rawDataUrl = evt.target.result;
        if (!rawDataUrl) return;

        var commaIdx = rawDataUrl.indexOf(',');
        var rawB64 = commaIdx !== -1 ? rawDataUrl.slice(commaIdx + 1) : rawDataUrl;

        // Immediate 0ms preview & fallback state
        if (mode === 'edit') {
          state.editStaffPhotoObj = { base64: rawB64, mimeType: file.type || 'image/jpeg' };
          state.editStaffPhotoRemove = false;

          var preview = document.getElementById('editStaffPhotoPreview');
          var init = document.getElementById('editStaffPhotoInitial');
          var btnRem = document.getElementById('btnRemoveStaffPhoto');
          var btnTxt = document.getElementById('editStaffPhotoBtnText');
          var statusMsg = document.getElementById('editStaffPhotoStatusMsg');

          if (preview) {
            preview.src = rawDataUrl;
            preview.style.display = 'block';
          }
          if (init) init.style.display = 'none';
          if (btnRem) btnRem.style.display = 'inline-flex';
          if (btnTxt) btnTxt.textContent = 'Change Photo';
          if (statusMsg) {
            statusMsg.textContent = '✓ Selected';
            statusMsg.style.display = 'inline-block';
          }
        } else {
          state.newStaffPhotoObj = { base64: rawB64, mimeType: file.type || 'image/jpeg' };
          var pImg = document.getElementById('newStaffPhotoPreviewImg');
          var pWrap = document.getElementById('newStaffPhotoPreview');
          var pIcon = document.getElementById('newStaffPhotoIcon');
          var pTxt = document.getElementById('newStaffPhotoText');
          var btnClr = document.getElementById('btnClearNewStaffPhoto');

          if (pImg) pImg.src = rawDataUrl;
          if (pWrap) pWrap.style.display = 'inline-block';
          if (pIcon) pIcon.style.display = 'none';
          if (pTxt) pTxt.textContent = 'Change';
          if (btnClr) btnClr.style.display = 'flex';
        }

        // Background compression for optimal network payload
        compressStaffPhoto(rawDataUrl, function(compressedUrl) {
          if (!compressedUrl) return;
          var cIdx = compressedUrl.indexOf(',');
          var compB64 = cIdx !== -1 ? compressedUrl.slice(cIdx + 1) : compressedUrl;
          if (mode === 'edit') {
            state.editStaffPhotoObj = { base64: compB64, mimeType: 'image/jpeg' };
            var preview = document.getElementById('editStaffPhotoPreview');
            if (preview) preview.src = compressedUrl;
          } else {
            state.newStaffPhotoObj = { base64: compB64, mimeType: 'image/jpeg' };
            var pImg = document.getElementById('newStaffPhotoPreviewImg');
            if (pImg) pImg.src = compressedUrl;
          }
        });
      };

      reader.readAsDataURL(file);
    }

    function clearNewStaffPhoto(e) {
      if (e) e.stopPropagation();
      state.newStaffPhotoObj = null;
      var f = document.getElementById('newStaffPhotoFile');
      if (f) f.value = '';
      var pImg = document.getElementById('newStaffPhotoPreviewImg');
      var pWrap = document.getElementById('newStaffPhotoPreview');
      var pIcon = document.getElementById('newStaffPhotoIcon');
      var pTxt = document.getElementById('newStaffPhotoText');
      var btnClr = document.getElementById('btnClearNewStaffPhoto');
      if (pImg) pImg.src = '';
      if (pWrap) pWrap.style.display = 'none';
      if (pIcon) pIcon.style.display = 'inline';
      if (pTxt) pTxt.textContent = 'Photo';
      if (btnClr) btnClr.style.display = 'none';
    }

    function removeEditStaffPhoto() {
      state.editStaffPhotoObj = null;
      state.editStaffPhotoRemove = true;
      var fileInput = document.getElementById('editStaffPhotoFile');
      var urlInput = document.getElementById('editStaffPhotoUrl');
      var preview = document.getElementById('editStaffPhotoPreview');
      var init = document.getElementById('editStaffPhotoInitial');
      var btnRem = document.getElementById('btnRemoveStaffPhoto');
      var btnTxt = document.getElementById('editStaffPhotoBtnText');
      var statusMsg = document.getElementById('editStaffPhotoStatusMsg');
      if (fileInput) fileInput.value = '';
      if (urlInput) urlInput.value = '';
      if (preview) { preview.src = ''; preview.style.display = 'none'; }
      if (init) {
        var name = (document.getElementById('editStaffName') ? document.getElementById('editStaffName').value : 'S') || 'S';
        init.textContent = name.charAt(0).toUpperCase();
        init.style.display = 'block';
      }
      if (btnRem) btnRem.style.display = 'none';
      if (btnTxt) btnTxt.textContent = 'Upload Photo';
      if (statusMsg) {
        statusMsg.textContent = '🗑️ Removed';
        statusMsg.style.display = 'inline-block';
      }
      showToast('Photo marked for removal', '🗑️');
    }

    state.staffDocUploads = {};
    state.staffDocRemoves = {};

    var staffDocMeta = {
      aadharFront: { fileId: 'fileAadharFront', urlId: 'urlAadharFront', previewId: 'previewAadharFront', viewId: 'btnViewAadharFront', remId: 'btnRemAadharFront', title: 'Aadhar Card (Front)' },
      aadharBack: { fileId: 'fileAadharBack', urlId: 'urlAadharBack', previewId: 'previewAadharBack', viewId: 'btnViewAadharBack', remId: 'btnRemAadharBack', title: 'Aadhar Card (Back)' },
      bankPassbook: { fileId: 'fileBankPassbook', urlId: 'urlBankPassbook', previewId: 'previewBankPassbook', viewId: 'btnViewBankPassbook', remId: 'btnRemBankPassbook', title: 'Bank Passbook Photo' },
      panCard: { fileId: 'filePanCard', urlId: 'urlPanCard', previewId: 'previewPanCard', viewId: 'btnViewPanCard', remId: 'btnRemPanCard', title: 'PAN Card Photo' },
      drivingLicense: { fileId: 'fileDrivingLicense', urlId: 'urlDrivingLicense', previewId: 'previewDrivingLicense', viewId: 'btnViewDrivingLicense', remId: 'btnRemDrivingLicense', title: 'Driving Licence Photo' }
    };

    function handleStaffDocSelect(e, docType) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;

      var isImg = (file.type && file.type.toLowerCase().startsWith('image/')) ||
                  /\.(jpe?g|png|webp|gif|bmp|jfif|heic|svg)$/i.test(file.name || '');
      if (!isImg) {
        alert('Please choose a valid image file (JPG, PNG, WebP).');
        return;
      }

      var meta = staffDocMeta[docType];
      if (!meta) return;

      var reader = new FileReader();
      reader.onerror = function(err) {
        console.error('File read error:', err);
        alert('Could not read image file. Please try another image.');
      };

      reader.onload = function(evt) {
        var rawDataUrl = evt.target.result;
        if (!rawDataUrl) return;

        var commaIdx = rawDataUrl.indexOf(',');
        var rawB64 = commaIdx !== -1 ? rawDataUrl.slice(commaIdx + 1) : rawDataUrl;

        if (!state.staffDocUploads) state.staffDocUploads = {};
        if (!state.staffDocRemoves) state.staffDocRemoves = {};
        state.staffDocUploads[docType] = { base64: rawB64, mimeType: file.type || 'image/jpeg', dataUrl: rawDataUrl };
        state.staffDocRemoves[docType] = false;

        var prevEl = document.getElementById(meta.previewId);
        var viewEl = document.getElementById(meta.viewId);
        var remEl = document.getElementById(meta.remId);

        if (prevEl) { prevEl.src = rawDataUrl; prevEl.style.display = 'block'; }
        if (viewEl) viewEl.style.display = 'inline-flex';
        if (remEl) remEl.style.display = 'inline-flex';

        compressStaffPhoto(rawDataUrl, function(compressedUrl) {
          if (!compressedUrl) return;
          var cIdx = compressedUrl.indexOf(',');
          var compB64 = cIdx !== -1 ? compressedUrl.slice(cIdx + 1) : compressedUrl;
          if (state.staffDocUploads && state.staffDocUploads[docType]) {
            state.staffDocUploads[docType].base64 = compB64;
            state.staffDocUploads[docType].mimeType = 'image/jpeg';
            state.staffDocUploads[docType].dataUrl = compressedUrl;
          }
          if (prevEl) prevEl.src = compressedUrl;
        });
      };
      reader.readAsDataURL(file);
    }

    function removeStaffDoc(docType) {
      var meta = staffDocMeta[docType];
      if (!meta) return;

      if (!state.staffDocUploads) state.staffDocUploads = {};
      if (!state.staffDocRemoves) state.staffDocRemoves = {};
      state.staffDocUploads[docType] = null;
      state.staffDocRemoves[docType] = true;

      var fileEl = document.getElementById(meta.fileId);
      var urlEl = document.getElementById(meta.urlId);
      var prevEl = document.getElementById(meta.previewId);
      var viewEl = document.getElementById(meta.viewId);
      var remEl = document.getElementById(meta.remId);

      if (fileEl) fileEl.value = '';
      if (urlEl) urlEl.value = '';
      if (prevEl) { prevEl.src = ''; prevEl.style.display = 'none'; }
      if (viewEl) viewEl.style.display = 'none';
      if (remEl) remEl.style.display = 'none';

      showToast(meta.title + ' marked for removal', '🗑️');
    }

    function viewStaffDoc(docType) {
      var meta = staffDocMeta[docType];
      if (!meta) return;

      var uploadObj = state.staffDocUploads && state.staffDocUploads[docType];
      var rawUrl = uploadObj ? (uploadObj.dataUrl || ('data:' + (uploadObj.mimeType || 'image/jpeg') + ';base64,' + uploadObj.base64)) : null;
      if (!rawUrl) {
        var urlEl = document.getElementById(meta.urlId);
        rawUrl = urlEl ? urlEl.value.trim() : '';
      }

      if (!rawUrl) {
        showToast('No ' + meta.title + ' uploaded yet', 'ℹ️');
        return;
      }

      var sName = (document.getElementById('editStaffName') ? document.getElementById('editStaffName').value : '') || 'Staff';
      if (typeof openImageModal === 'function') {
        openImageModal(rawUrl, meta.title, sName);
      } else {
        window.open(rawUrl, '_blank');
      }
    }

    if (typeof window !== 'undefined') {
      window.compressStaffPhoto = compressStaffPhoto;
      window.handleStaffPhotoSelect = handleStaffPhotoSelect;
      window.clearNewStaffPhoto = clearNewStaffPhoto;
      window.removeEditStaffPhoto = removeEditStaffPhoto;
      window.handleStaffDocSelect = handleStaffDocSelect;
      window.removeStaffDoc = removeStaffDoc;
      window.viewStaffDoc = viewStaffDoc;
    }

    function populateAdminStaffList(list) {
      state.staffList = list || [];
      var staffBadge = document.getElementById('tabStaffCount');
      if (staffBadge) staffBadge.textContent = state.staffList.length;
      var select = document.getElementById('custStaffSelect');
      var listContainer = document.getElementById('adminStaffList');

      /* Update Form Dropdown - Show active staff cleanly with Unassigned option */
      var optionsHtml = '<option value="">Unassigned</option>';
      state.staffList.forEach(function(s) {
        var isAct = s.active !== undefined ? (s.active === true || s.active === 'Yes' || s.active === 'yes' || s.active === 'Active') : true;
        var label = s.name + (isAct ? '' : ' (Inactive)');
        optionsHtml += '<option value="' + escapeHtml(s.name) + '">' + escapeHtml(label) + '</option>';
      });
      if (select) select.innerHTML = optionsHtml;

      /* Update Staff Management List */
      if (!state.staffList || state.staffList.length === 0) {
        listContainer.innerHTML = '<div class="empty-state-box">No staff members found.</div>';
        return;
      }

      /* Deduplicate for visual rendering */
      var seen = {};
      var uniqueStaff = state.staffList.filter(function(s) {
        var key = (s.name || '').trim().toLowerCase();
        if (!key || seen[key]) return false;
        seen[key] = true;
        return true;
      });

      var cardsHtml = '';
      uniqueStaff.forEach(function(s) {
        var staffUrl = getUniqueStaffUrl(s.id);
        var normPhone = normalizeIndianMobile(s.phone);
        var formattedPhone = normPhone ? formatIndianMobile(normPhone) : '';
        var isActive = s.active !== undefined ? (s.active === true || s.active === 'Yes' || s.active === 'yes' || s.active === 'Active') : true;
        var sPin = (s.pin || s.displayPin || '').toString().trim();
        if (sPin.includes('*') || sPin.startsWith('scrypt:') || sPin.startsWith('sha256:') || sPin === '[PROTECTED]') {
          sPin = '';
        }
        if (!sPin && (s.id || '').toUpperCase() === 'STF01') sPin = '123456';
        if (!sPin && (s.id || '').toUpperCase() === 'STF02') sPin = '654321';
        var waMessage = 'Hello ' + s.name + ',\nHere is your CWP Detailers & Motors staff portal link:\n' + staffUrl + '\n\nPlease log in using your registered mobile number (' + (formattedPhone || s.phone) + ')' + (sPin ? (' and 6-digit security PIN: ' + sPin) : ' and 6-digit security PIN') + '.';
        var waHref = normPhone ? getIndianWhatsAppLink(normPhone, waMessage) : ('https:\x2F\x2Fwa.me/?text=' + encodeURIComponent(waMessage));

        var sPhoto = (s.photoUrl || s.photo_url || s.photo || '').trim();
        cardsHtml += '<div class="staff-admin-card" style="display: flex; align-items: center; gap: 14px; padding: 12px 14px;">';
        cardsHtml += '  <div class="staff-card-avatar">';
        if (sPhoto) {
          cardsHtml += '    <img src="' + escapeHtml(sPhoto) + '" alt="' + escapeHtml(s.name) + '" onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'flex\';">';
          cardsHtml += '    <div style="display:none; width:100%; height:100%; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; font-size:18px; font-weight:700; align-items:center; justify-content:center;">' + escapeHtml(s.name.charAt(0).toUpperCase()) + '</div>';
        } else {
          cardsHtml += '    <div style="width:100%; height:100%; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; font-size:18px; font-weight:700; display:flex; align-items:center; justify-content:center;">' + escapeHtml(s.name.charAt(0).toUpperCase()) + '</div>';
        }
        cardsHtml += '  </div>';
        cardsHtml += '  <div class="staff-admin-info" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">';        cardsHtml += '    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">';
        cardsHtml += '      <span class="staff-admin-name">' + escapeHtml(s.name) + '</span>';
        cardsHtml += '      <button type="button" class="badge-status-pill ' + (isActive ? 'badge-active' : 'badge-inactive') + '" onclick="toggleStaffActiveStatus(\'' + escapeHtml(s.id) + '\', ' + (!isActive) + ')" title="Click to toggle status">';
        cardsHtml += '        ' + (isActive ? '● Active' : '○ Inactive');
        cardsHtml += '      </button>';
        cardsHtml += '    </div>';
        cardsHtml += '    <div class="staff-admin-id" style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--text-muted); align-items: center;">';
        cardsHtml += '      <span>ID: <b style="color: var(--text-primary);">' + escapeHtml(s.id) + '</b></span>';
        cardsHtml += '      <span>📱 <b>' + (formattedPhone ? escapeHtml(formattedPhone) : '<span style="color:var(--text-muted); font-weight:normal;">Not provided</span>') + '</b></span>';
        cardsHtml += '      <span style="display: inline-flex; align-items: center; gap: 6px;">';
        cardsHtml += '        <span>🔑 PIN:</span>';
        if (s.hasPin === false && !sPin) {
          cardsHtml += '        <b style="color: var(--text-muted);">Not Set</b>';
        } else {
          cardsHtml += '        <b id="staffPinVal_' + escapeHtml(s.id) + '" class="staff-pin-val masked" data-pin="' + escapeHtml(sPin) + '" data-masked="true">●●●●●●</b>';
          cardsHtml += '        <button type="button" class="btn-toggle-pin" id="btnTogglePin_' + escapeHtml(s.id) + '" onclick="toggleStaffPinDisplay(\'' + escapeHtml(s.id) + '\')" title="Show / Hide PIN">👁️ Show</button>';
        }
        cardsHtml += '      </span>';
        cardsHtml += '    </div>';

        var extraDetails = [];
        var wOff = s.weeklyOff || s.weekly_off;
        if (wOff) extraDetails.push('<span>🗓️ Off: <b style="color:var(--brand-blue);">' + escapeHtml(wOff) + '</b></span>');
        var doj = s.dateOfJoining || s.date_of_joining;
        if (doj) extraDetails.push('<span>📅 Joined: <b>' + escapeHtml(String(doj).split('T')[0]) + '</b></span>');
        var sal = s.salary;
        if (sal !== undefined && sal !== null && sal !== '') extraDetails.push('<span>💰 <b>₹' + escapeHtml(Number(sal).toLocaleString('en-IN')) + '</b></span>');

        var docChips = [];
        if (s.aadharNumber || s.aadharFrontUrl || s.aadhar_front_url || s.aadharBackUrl || s.aadhar_back_url) docChips.push('Aadhar');
        if (s.panNumber || s.pan_number || s.panCardUrl || s.pan_card_url) docChips.push('PAN');
        if (s.drivingLicenseNumber || s.driving_license_number || s.drivingLicenseUrl || s.driving_license_url) docChips.push('DL');
        if (s.bankPassbookUrl || s.bank_passbook_url) docChips.push('Bank');
        if (docChips.length > 0) {
          extraDetails.push('<span style="color:#059669; font-weight:600;">🪪 KYC: ' + escapeHtml(docChips.join(', ')) + '</span>');
        }

        if (extraDetails.length > 0) {
          cardsHtml += '    <div style="display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); align-items: center; margin-top: 3px;">';
          cardsHtml += '      ' + extraDetails.join(' • ');
          cardsHtml += '    </div>';
        }
        cardsHtml += '  </div>';
        cardsHtml += '  <div class="staff-admin-actions">';
        cardsHtml += '    <button type="button" class="btn-admin-action" onclick="openEditStaffModal(\'' + escapeHtml(s.id) + '\')">✏️ Edit</button>';
        cardsHtml += '    <button type="button" class="btn-admin-action" onclick="copyStaffLink(\'' + escapeHtml(staffUrl) + '\')">📋 Copy Link</button>';
        cardsHtml += '    <a href="' + waHref + '" target="_blank" class="btn-admin-action">💬 WhatsApp</a>';
        cardsHtml += '    <a href="' + escapeHtml(staffUrl) + '" target="_blank" class="btn-admin-action">👁️ Open</a>';
        cardsHtml += '    <button type="button" class="btn-admin-action btn-admin-danger" onclick="handleDeleteStaff(\'' + escapeHtml(s.id) + '\')" title="Delete staff member">🗑️ Delete</button>';
        cardsHtml += '  </div>';
        cardsHtml += '</div>';
      });

      listContainer.innerHTML = cardsHtml;
    }

    function toggleStaffPinDisplay(staffId) {
      var valEl = document.getElementById('staffPinVal_' + staffId);
      var btnEl = document.getElementById('btnTogglePin_' + staffId);
      if (!valEl || !btnEl) return;

      var isMasked = valEl.getAttribute('data-masked') !== 'false';

      if (!isMasked) {
        valEl.textContent = '●●●●●●';
        valEl.setAttribute('data-masked', 'true');
        valEl.className = 'staff-pin-val masked';
        btnEl.innerHTML = '👁️ Show';
        btnEl.classList.remove('active');
        btnEl.title = 'Show PIN';
        return;
      }

      var pin = (valEl.getAttribute('data-pin') || '').trim();
      if (pin.includes('*') || pin.startsWith('scrypt:') || pin.startsWith('sha256:') || pin === '[PROTECTED]') {
        pin = '';
      }
      if (!pin) {
        var staffObj = (state.staffList || []).find(function(s) {
          return (s.id || '').toUpperCase() === (staffId || '').toUpperCase();
        });
        if (staffObj) {
          var candidate = (staffObj.pin || staffObj.displayPin || '').toString().trim();
          if (candidate && !candidate.includes('*') && !candidate.startsWith('scrypt:') && !candidate.startsWith('sha256:') && candidate !== '[PROTECTED]') {
            pin = candidate;
          }
        }
      }
      if (!pin && (staffId || '').toUpperCase() === 'STF01') pin = '123456';
      if (!pin && (staffId || '').toUpperCase() === 'STF02') pin = '654321';

      if (pin) {
        valEl.textContent = pin;
        valEl.setAttribute('data-masked', 'false');
        valEl.setAttribute('data-pin', pin);
        valEl.className = 'staff-pin-val revealed';
        btnEl.innerHTML = '🔒 Hide';
        btnEl.classList.add('active');
        btnEl.title = 'Hide PIN';
        return;
      }

      btnEl.disabled = true;
      btnEl.innerHTML = '⏳';
      apiCall('revealStaffPin', { staffId: staffId }, function(res) {
        btnEl.disabled = false;
        var fetchedPin = (res && res.pin) ? res.pin.toString().trim() : '';
        if (fetchedPin && !fetchedPin.includes('*') && fetchedPin !== '[PROTECTED]') {
          valEl.textContent = fetchedPin;
          valEl.setAttribute('data-masked', 'false');
          valEl.setAttribute('data-pin', fetchedPin);
          valEl.className = 'staff-pin-val revealed';
          btnEl.innerHTML = '🔒 Hide';
          btnEl.classList.add('active');
          btnEl.title = 'Hide PIN';
          var sObj = (state.staffList || []).find(function(s) {
            return (s.id || '').toUpperCase() === (staffId || '').toUpperCase();
          });
          if (sObj) {
            sObj.pin = fetchedPin;
            sObj.displayPin = fetchedPin;
          }
        } else {
          btnEl.innerHTML = '👁️ Show';
          showToast('PIN is not set or unavailable for this staff', 'ℹ️');
        }
      }, function(err) {
        btnEl.disabled = false;
        btnEl.innerHTML = '👁️ Show';
        showToast('Failed to load PIN: ' + (err.message || err), '❌');
      });
    }

    function toggleModalCurrentPin() {
      var valEl = document.getElementById('editStaffCurrentPinDisplay');
      var btnEl = document.getElementById('btnToggleModalPin');
      if (!valEl || !btnEl) return;

      var isMasked = valEl.getAttribute('data-masked') !== 'false';
      if (!isMasked) {
        valEl.textContent = '●●●●●●';
        valEl.setAttribute('data-masked', 'true');
        valEl.className = 'staff-pin-val masked';
        btnEl.innerHTML = '👁️ Show';
        btnEl.classList.remove('active');
        btnEl.title = 'Show Current PIN';
        return;
      }

      var staffId = valEl.getAttribute('data-staff-id');
      var pin = (valEl.getAttribute('data-pin') || '').trim();
      if (pin.includes('*') || pin.startsWith('scrypt:') || pin.startsWith('sha256:') || pin === '[PROTECTED]') {
        pin = '';
      }
      if (!pin && staffId) {
        var staffObj = (state.staffList || []).find(function(s) {
          return (s.id || '').toUpperCase() === (staffId || '').toUpperCase();
        });
        if (staffObj) {
          var candidate = (staffObj.pin || staffObj.displayPin || '').toString().trim();
          if (candidate && !candidate.includes('*') && !candidate.startsWith('scrypt:') && !candidate.startsWith('sha256:') && candidate !== '[PROTECTED]') {
            pin = candidate;
          }
        }
      }
      if (!pin && (staffId || '').toUpperCase() === 'STF01') pin = '123456';
      if (!pin && (staffId || '').toUpperCase() === 'STF02') pin = '654321';

      if (pin) {
        valEl.textContent = pin;
        valEl.setAttribute('data-masked', 'false');
        valEl.setAttribute('data-pin', pin);
        valEl.className = 'staff-pin-val revealed';
        btnEl.innerHTML = '🔒 Hide';
        btnEl.classList.add('active');
        btnEl.title = 'Hide Current PIN';
        return;
      }

      if (!staffId) return;
      btnEl.disabled = true;
      btnEl.innerHTML = '⏳';
      apiCall('revealStaffPin', { staffId: staffId }, function(res) {
        btnEl.disabled = false;
        var fetchedPin = (res && res.pin) ? res.pin.toString().trim() : '';
        if (fetchedPin && !fetchedPin.includes('*') && fetchedPin !== '[PROTECTED]') {
          valEl.textContent = fetchedPin;
          valEl.setAttribute('data-masked', 'false');
          valEl.setAttribute('data-pin', fetchedPin);
          valEl.className = 'staff-pin-val revealed';
          btnEl.innerHTML = '🔒 Hide';
          btnEl.classList.add('active');
          btnEl.title = 'Hide Current PIN';
          var sObj = (state.staffList || []).find(function(s) {
            return (s.id || '').toUpperCase() === (staffId || '').toUpperCase();
          });
          if (sObj) {
            sObj.pin = fetchedPin;
            sObj.displayPin = fetchedPin;
          }
        } else {
          btnEl.innerHTML = '👁️ Show';
          showToast('Current PIN is not set or unavailable', 'ℹ️');
        }
      }, function(err) {
        btnEl.disabled = false;
        btnEl.innerHTML = '👁️ Show';
        showToast('Failed to load current PIN: ' + (err.message || err), '❌');
      });
    }

    function toggleStaffActiveStatus(staffId, newStatus) {
      var actWord = newStatus ? 'Active' : 'Inactive';
      showToast('Updating status...', '⏳');
      apiCall('toggleStaffActive', { staffId: staffId, active: newStatus }, function(res) {
        showToast('Staff marked as ' + actWord + '!', '✓');
        if (res && res.staffList) {
          populateAdminStaffList(res.staffList);
        } else {
          loadStaffListForAdmin();
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function openEditStaffModal(staffId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var staff = (state.staffList || []).find(function(s) {
        return (s.id || '').toUpperCase() === (staffId || '').toUpperCase();
      });
      if (!staff) {
        showToast('Staff information not found', '❌');
        return;
      }
      document.getElementById('editStaffId').value = staff.id;
      document.getElementById('editStaffIdDisplay').textContent = staff.id;
      document.getElementById('editStaffName').value = staff.name || '';
      setPhoneInputValue(document.getElementById('editStaffPhone'), staff.phone || '');
      document.getElementById('editStaffPin').value = '';

      state.editStaffPhotoObj = null;
      state.editStaffPhotoRemove = false;
      var pFile = document.getElementById('editStaffPhotoFile');
      if (pFile) {
        pFile.value = '';
        pFile.onchange = function(e) { handleStaffPhotoSelect(e, 'edit'); };
      }
      var pStatus = document.getElementById('editStaffPhotoStatusMsg');
      if (pStatus) {
        pStatus.textContent = '';
        pStatus.style.display = 'none';
      }
      var pUrl = (staff.photoUrl || staff.photo_url || staff.photo || '').trim();
      var pUrlEl = document.getElementById('editStaffPhotoUrl');
      if (pUrlEl) pUrlEl.value = pUrl;
      var pPreview = document.getElementById('editStaffPhotoPreview');
      var pInit = document.getElementById('editStaffPhotoInitial');
      var pBtnRem = document.getElementById('btnRemoveStaffPhoto');
      var pBtnTxt = document.getElementById('editStaffPhotoBtnText');
      if (pUrl && pPreview) {
        pPreview.src = pUrl;
        pPreview.style.display = 'block';
        if (pInit) pInit.style.display = 'none';
        if (pBtnRem) pBtnRem.style.display = 'inline-flex';
        if (pBtnTxt) pBtnTxt.textContent = 'Change Photo';
      } else {
        if (pPreview) { pPreview.src = ''; pPreview.style.display = 'none'; }
        if (pInit) {
          pInit.textContent = (staff.name || 'S').charAt(0).toUpperCase();
          pInit.style.display = 'block';
        }
        if (pBtnRem) pBtnRem.style.display = 'none';
        if (pBtnTxt) pBtnTxt.textContent = 'Upload Photo';
      }

      var curPinEl = document.getElementById('editStaffCurrentPinDisplay');
      var curPinBtn = document.getElementById('btnToggleModalPin');
      var curPinVal = (staff.pin || staff.displayPin || '').toString().trim();
      if (curPinEl) {
        curPinEl.textContent = '●●●●●●';
        curPinEl.setAttribute('data-masked', 'true');
        curPinEl.setAttribute('data-pin', curPinVal);
        curPinEl.setAttribute('data-staff-id', staff.id);
        curPinEl.className = 'staff-pin-val masked';
      }
      if (curPinBtn) {
        curPinBtn.innerHTML = '👁️ Show';
        curPinBtn.classList.remove('active');
        curPinBtn.title = 'Show Current PIN';
      }

      var isAct = staff.active !== undefined ? (staff.active === true || staff.active === 'Yes' || staff.active === 'yes' || staff.active === 'Active') : true;
      document.getElementById('editStaffActive').value = isAct ? 'true' : 'false';

      // Extended non-mandatory profile fields
      if (document.getElementById('editStaffJoiningDate')) {
        var rawDoj = staff.dateOfJoining || staff.date_of_joining || '';
        document.getElementById('editStaffJoiningDate').value = rawDoj ? (rawDoj.split ? rawDoj.split('T')[0] : rawDoj) : '';
      }
      if (document.getElementById('editStaffSalary')) {
        document.getElementById('editStaffSalary').value = (staff.salary !== undefined && staff.salary !== null && staff.salary !== '') ? staff.salary : '';
      }
      if (document.getElementById('editStaffWeeklyOff')) {
        document.getElementById('editStaffWeeklyOff').value = staff.weeklyOff || staff.weekly_off || '';
      }
      if (document.getElementById('editStaffEmail')) {
        document.getElementById('editStaffEmail').value = staff.email || '';
      }
      if (document.getElementById('editStaffAadharNumber')) {
        document.getElementById('editStaffAadharNumber').value = staff.aadharNumber || staff.aadhar_number || '';
      }
      if (document.getElementById('editStaffPanNumber')) {
        document.getElementById('editStaffPanNumber').value = staff.panNumber || staff.pan_number || '';
      }
      if (document.getElementById('editStaffDlNumber')) {
        document.getElementById('editStaffDlNumber').value = staff.drivingLicenseNumber || staff.driving_license_number || '';
      }

      // Reset document upload state
      state.staffDocUploads = {};
      state.staffDocRemoves = {};

      var docsToInit = [
        { type: 'aadharFront', url: staff.aadharFrontUrl || staff.aadhar_front_url || '' },
        { type: 'aadharBack', url: staff.aadharBackUrl || staff.aadhar_back_url || '' },
        { type: 'bankPassbook', url: staff.bankPassbookUrl || staff.bank_passbook_url || '' },
        { type: 'panCard', url: staff.panCardUrl || staff.pan_card_url || '' },
        { type: 'drivingLicense', url: staff.drivingLicenseUrl || staff.driving_license_url || '' }
      ];

      docsToInit.forEach(function(item) {
        var meta = staffDocMeta[item.type];
        if (!meta) return;
        var fileEl = document.getElementById(meta.fileId);
        var urlEl = document.getElementById(meta.urlId);
        var prevEl = document.getElementById(meta.previewId);
        var viewEl = document.getElementById(meta.viewId);
        var remEl = document.getElementById(meta.remId);

        if (fileEl) fileEl.value = '';
        if (urlEl) urlEl.value = item.url;
        if (item.url) {
          if (prevEl) { prevEl.src = item.url; prevEl.style.display = 'block'; }
          if (viewEl) viewEl.style.display = 'inline-flex';
          if (remEl) remEl.style.display = 'inline-flex';
        } else {
          if (prevEl) { prevEl.src = ''; prevEl.style.display = 'none'; }
          if (viewEl) viewEl.style.display = 'none';
          if (remEl) remEl.style.display = 'none';
        }
      });

      var modal = document.getElementById('staffEditModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closeEditStaffModal() {
      var modal = document.getElementById('staffEditModal');
      if (modal) {
        modal.style.display = 'none';
        if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
          document.body.style.overflow = '';
        }
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleEditStaffSubmit(e) {
      e.preventDefault();
      var id = document.getElementById('editStaffId').value.trim();
      var name = document.getElementById('editStaffName').value.trim();
      var rawPhone = document.getElementById('editStaffPhone').value.trim();
      var phone = normalizeIndianMobile(rawPhone);
      var pin = document.getElementById('editStaffPin').value.trim();

      if (rawPhone && !isValidIndianMobile(phone)) {
        alert('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        document.getElementById('editStaffPhone').focus();
        return;
      }

      // Check mobile number uniqueness among other staff (proof of identity)
      if (phone) {
        var duplicateStaff = (state.staffList || []).find(function(s) {
          return (s.id || '').toUpperCase() !== id.toUpperCase() &&
                 s.phone && normalizeIndianMobile(s.phone) === phone;
        });
        if (duplicateStaff) {
          alert('Mobile number ' + formatIndianMobile(phone) + ' is already registered to another staff member "' + duplicateStaff.name + '" (ID: ' + duplicateStaff.id + ').\n\nStaff mobile number serves as proof of identity and must be unique.');
          document.getElementById('editStaffPhone').focus();
          return;
        }
      }

      var active = document.getElementById('editStaffActive').value === 'true';
      var btn = document.getElementById('btnSaveEditStaff');

      if (!name) {
        alert('Staff name is required.');
        return;
      }
      if (pin && !/^\d{6}$/.test(pin)) {
        alert('PIN must be exactly 6 digits.');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Saving...';
      }

      var email = (document.getElementById('editStaffEmail') ? document.getElementById('editStaffEmail').value : '').trim();
      var dateOfJoining = (document.getElementById('editStaffJoiningDate') ? document.getElementById('editStaffJoiningDate').value : '').trim();
      var salary = (document.getElementById('editStaffSalary') ? document.getElementById('editStaffSalary').value : '').trim();
      var weeklyOff = (document.getElementById('editStaffWeeklyOff') ? document.getElementById('editStaffWeeklyOff').value : '').trim();
      var aadharNumber = (document.getElementById('editStaffAadharNumber') ? document.getElementById('editStaffAadharNumber').value : '').trim();
      var panNumber = (document.getElementById('editStaffPanNumber') ? document.getElementById('editStaffPanNumber').value : '').trim().toUpperCase();
      var drivingLicenseNumber = (document.getElementById('editStaffDlNumber') ? document.getElementById('editStaffDlNumber').value : '').trim();

      var staffPayload = {
        id: id,
        name: name,
        phone: phone,
        active: active,
        email: email,
        dateOfJoining: dateOfJoining,
        salary: salary,
        weeklyOff: weeklyOff,
        aadharNumber: aadharNumber,
        panNumber: panNumber,
        drivingLicenseNumber: drivingLicenseNumber
      };
      if (pin) {
        staffPayload.pin = pin;
      }
      if (state.editStaffPhotoObj) {
        staffPayload.photoObj = state.editStaffPhotoObj;
      } else if (state.editStaffPhotoRemove) {
        staffPayload.removePhoto = true;
        staffPayload.photoUrl = '';
      } else {
        var curPUrl = document.getElementById('editStaffPhotoUrl');
        if (curPUrl && curPUrl.value) staffPayload.photoUrl = curPUrl.value;
      }

      if (!state.staffDocUploads) state.staffDocUploads = {};
      if (!state.staffDocRemoves) state.staffDocRemoves = {};

      if (state.staffDocUploads.aadharFront) staffPayload.aadharFrontObj = state.staffDocUploads.aadharFront;
      else if (state.staffDocRemoves.aadharFront) staffPayload.removeAadharFront = true;
      else if (document.getElementById('urlAadharFront')) staffPayload.aadharFrontUrl = document.getElementById('urlAadharFront').value;

      if (state.staffDocUploads.aadharBack) staffPayload.aadharBackObj = state.staffDocUploads.aadharBack;
      else if (state.staffDocRemoves.aadharBack) staffPayload.removeAadharBack = true;
      else if (document.getElementById('urlAadharBack')) staffPayload.aadharBackUrl = document.getElementById('urlAadharBack').value;

      if (state.staffDocUploads.bankPassbook) staffPayload.bankPassbookObj = state.staffDocUploads.bankPassbook;
      else if (state.staffDocRemoves.bankPassbook) staffPayload.removeBankPassbook = true;
      else if (document.getElementById('urlBankPassbook')) staffPayload.bankPassbookUrl = document.getElementById('urlBankPassbook').value;

      if (state.staffDocUploads.panCard) staffPayload.panCardObj = state.staffDocUploads.panCard;
      else if (state.staffDocRemoves.panCard) staffPayload.removePanCard = true;
      else if (document.getElementById('urlPanCard')) staffPayload.panCardUrl = document.getElementById('urlPanCard').value;

      if (state.staffDocUploads.drivingLicense) staffPayload.drivingLicenseObj = state.staffDocUploads.drivingLicense;
      else if (state.staffDocRemoves.drivingLicense) staffPayload.removeDrivingLicense = true;
      else if (document.getElementById('urlDrivingLicense')) staffPayload.drivingLicenseUrl = document.getElementById('urlDrivingLicense').value;

      apiCall('saveStaffMember', { staffData: staffPayload }, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Staff';
        }
        closeEditStaffModal();

        var updatedList = res && res.staffList ? res.staffList : null;
        if (updatedList) {
          state.staffList = updatedList;
          state.adminStaffList = updatedList;
          populateAdminStaffList(updatedList);
          populateSeqStaffDropdown(updatedList);
          populateStaffFilterDropdown();
        } else {
          loadStaffListForAdmin();
        }

        // Auto-refresh Customer Records table across the panel with forceRefresh
        loadAdminRecords(true);

        // Auto-refresh Route Sequence for this staff member
        if (state.seqManagement) {
          state.seqManagement.currentStaffId = id;
          state.seqManagement.currentStaffName = name;
          loadStaffSequenceData(true);
        }

        var msg = res && res.cascaded 
          ? ('Staff profile updated & ' + (res.reallocatedCount || '') + ' customer records auto-updated!')
          : 'Staff profile updated successfully!';
        showToast(msg, '✓');
      }, function(err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Staff';
        }
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function getUniqueStaffUrl(staffId) {
      var base = webAppBaseUrl;
      if (!base || base.indexOf('http') !== 0) {
        return window.location.origin + '/staff';
      }
      return base + (base.indexOf('?') === -1 ? '?mode=staff' : '&mode=staff');
    }

    function copyStaffLink(link) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function() {
          showToast('Staff link copied to clipboard!', '✓');
        });
      } else {
        var input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Staff link copied to clipboard!', '✓');
      }
    }

    function handleAddStaff(e) {
      e.preventDefault();
      var nameInput = document.getElementById('newStaffName');
      var phoneInput = document.getElementById('newStaffPhone');
      var pinInput = document.getElementById('newStaffPin');
      var name = (nameInput ? nameInput.value : '').trim();
      var rawPhone = (phoneInput ? phoneInput.value : '').trim();
      var phone = normalizeIndianMobile(rawPhone);
      var pin = (pinInput ? pinInput.value : '').trim();

      if (!rawPhone || !isValidIndianMobile(phone)) {
        alert('Please enter a valid 10-digit Indian mobile number for staff starting with 6, 7, 8, or 9.');
        if (phoneInput) phoneInput.focus();
        return;
      }

      // Check mobile number uniqueness among staff (proof of identity)
      var duplicateStaff = (state.staffList || []).find(function(s) {
        return s.phone && normalizeIndianMobile(s.phone) === phone;
      });
      if (duplicateStaff) {
        alert('Mobile number ' + formatIndianMobile(phone) + ' is already registered to staff member "' + duplicateStaff.name + '" (ID: ' + duplicateStaff.id + ').\n\nStaff mobile number serves as proof of identity and must be unique.');
        if (phoneInput) phoneInput.focus();
        return;
      }
      var idEl = document.getElementById('newStaffId');
      var id = idEl ? idEl.value.trim() : '';

      if (!name) return;
      if (!pin || !/^\d{6}$/.test(pin)) {
        alert('Please enter a 6-digit login PIN for new staff.');
        if (pinInput) pinInput.focus();
        return;
      }

      var staffPayload = {
        name: name,
        id: id,
        phone: phone,
        pin: pin,
        active: true
      };
      if (state.newStaffPhotoObj) {
        staffPayload.photoObj = state.newStaffPhotoObj;
      }

      apiCall('saveStaffMember', { staffData: staffPayload }, function(res) {
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (pinInput) pinInput.value = '';
        if (idEl) idEl.value = '';
        clearNewStaffPhoto();
        showToast('Staff member "' + name + '" added successfully!', '✓');
        if (res && res.staffList) {
          populateAdminStaffList(res.staffList);
        } else {
          loadStaffListForAdmin();
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function handleDeleteStaff(id) {
      var staff = (state.staffList || []).find(function(s) {
        return (s.id || '').toUpperCase() === (id || '').toUpperCase();
      });
      var staffName = staff ? staff.name : ('Staff ' + id);

      if (!confirm('Are you sure you want to delete staff member "' + staffName + '"?\n\nThis will deactivate their account, revoke all active login sessions, and unassign their customer route sequences.')) return;

      closeEditStaffModal();

      apiCall('deleteStaffMember', { id: id }, function(res) {
        showToast('Staff member "' + staffName + '" deleted successfully', '✓');
        var updatedList = res && res.staffList ? res.staffList : null;
        if (updatedList) {
          state.staffList = updatedList;
          state.adminStaffList = updatedList;
          populateAdminStaffList(updatedList);
          populateSeqStaffDropdown(updatedList);
          populateStaffFilterDropdown();
        } else {
          loadStaffListForAdmin();
        }
        loadAdminRecords(true);
        if (state.seqManagement) {
          initAdminSequenceManager();
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function handleDeleteStaffFromModal() {
      var staffId = (document.getElementById('editStaffId') && document.getElementById('editStaffId').value) || '';
      if (!staffId) {
        showToast('Staff identifier not found to delete', '❌');
        return;
      }
      handleDeleteStaff(staffId);
    }

    /* Customer Form Handling */
    function toggleCategoryFields(cat) {
      var isDaily = (cat === 'Daily Car Cleaning' || cat === 'daily_car_cleaning');
      var isCarWash = (cat === 'Car Washing' || cat === 'car_washing');
      var isSolar = (cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning');
      var isInterior = (cat === 'Interior Detailing' || cat === 'interior_detailing');
      var isExterior = (cat === 'Exterior Detailing' || cat === 'exterior_detailing');

      var vLabel = document.getElementById('custVehicleLabel');
      var vInput = document.getElementById('custVehicles');
      var secGroup = document.getElementById('secondaryAddressGroup');
      var pkgSelect = document.getElementById('custPkgType');

      if (isSolar) {
        if (vLabel) vLabel.textContent = 'Site Name / Location *';
        if (vInput) vInput.placeholder = 'e.g. Rooftop 5KW Site / Flat 402';
        if (secGroup) secGroup.style.display = 'none';
        if (pkgSelect) {
          pkgSelect.innerHTML = 
            '<option value="One Time Solar Cleaning">One Time Solar Cleaning</option>' +
            '<option value="6 Month Subscription (6 frequencies)">6 Month Subscription (6 frequencies)</option>' +
            '<option value="12 Month Subscription (12 frequencies)">12 Month Subscription (12 frequencies)</option>' +
            '<option value="SOLAR SUBSCRIPTION">SOLAR SUBSCRIPTION</option>' +
            '<option value="SOLAR SINGLE">SOLAR SINGLE</option>' +
            '<option value="OTHER">OTHER</option>';
        }
      } else if (isCarWash) {
        if (vLabel) vLabel.textContent = 'Vehicle Number & Model *';
        if (vInput) vInput.placeholder = 'e.g. UP65 AB 1234 - Creta';
        if (secGroup) secGroup.style.display = 'none';
        if (pkgSelect) {
          pkgSelect.innerHTML = 
            '<option value="Single Wash (One Time Wash)">Single Wash (One Time Wash)</option>' +
            '<option value="Wash Subscription (4 Washes / 6 Months)">Wash Subscription (4 Washes / 6 Months)</option>' +
            '<option value="CAR WASH SUBSCRIPTION">CAR WASH SUBSCRIPTION</option>' +
            '<option value="CAR WASH SINGLE">CAR WASH SINGLE</option>' +
            '<option value="OTHER">OTHER</option>';
        }
      } else if (isInterior) {
        if (vLabel) vLabel.textContent = 'Vehicle Number & Model *';
        if (vInput) vInput.placeholder = 'e.g. UP65 AB 1234 - Creta';
        if (secGroup) secGroup.style.display = 'none';
        if (pkgSelect) {
          pkgSelect.innerHTML = 
            '<option value="Interior Deep Cleaning">Interior Deep Cleaning</option>' +
            '<option value="Roof Cleaning">Roof Cleaning</option>' +
            '<option value="OTHER">OTHER</option>';
        }
      } else if (isExterior) {
        if (vLabel) vLabel.textContent = 'Vehicle Number & Model *';
        if (vInput) vInput.placeholder = 'e.g. UP65 AB 1234 - Creta';
        if (secGroup) secGroup.style.display = 'none';
        if (pkgSelect) {
          pkgSelect.innerHTML = 
            '<option value="Ceramic Coating">Ceramic Coating</option>' +
            '<option value="Graphene Coating">Graphene Coating</option>' +
            '<option value="Car Waxing">Car Waxing</option>' +
            '<option value="Glass Treatment">Glass Treatment</option>' +
            '<option value="OTHER">OTHER</option>';
        }
      } else {
        /* Daily Car Cleaning */
        if (vLabel) vLabel.textContent = 'Vehicle Number & Model *';
        if (vInput) vInput.placeholder = 'e.g. UP65 AB 1234 - Creta';
        if (secGroup) secGroup.style.display = 'block';
        if (pkgSelect) {
          pkgSelect.innerHTML = 
            '<option value="DCC ONLY">DCC ONLY (Exterior Daily)</option>' +
            '<option value="Exterior Chemical Cleaning (30 Days)">Exterior Chemical Cleaning (30 Days)</option>' +
            '<option value="Exterior Chemical Cleaning + 1 Carwash/mo">Exterior Chemical Cleaning + 1 Carwash/mo</option>' +
            '<option value="Exterior Chemical Cleaning + 2 Carwash/mo">Exterior Chemical Cleaning + 2 Carwash/mo</option>' +
            '<option value="DCC SILVER">DCC SILVER</option>' +
            '<option value="DCC GOLD">DCC GOLD</option>' +
            '<option value="OTHER">OTHER</option>';
        }
      }
      var carMakeColorRow = document.getElementById('custCarMakeColorRow');
      if (carMakeColorRow) carMakeColorRow.style.display = isSolar ? 'none' : 'grid';
      var custSolarPanelsRow = document.getElementById('custSolarPanelsRow');
      var custSeaterRow = document.getElementById('custSeaterRow');
      if (custSolarPanelsRow) custSolarPanelsRow.style.display = isSolar ? 'block' : 'none';
      if (custSeaterRow) custSeaterRow.style.display = isSolar ? 'none' : 'block';
      handlePackageTypeChange(pkgSelect ? pkgSelect.value : '');
    }

    function handleEditCategoryChange(cat) {
      var isSolar = (cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning');
      var isInterior = (cat === 'Interior Detailing' || cat === 'interior_detailing');
      var isExterior = (cat === 'Exterior Detailing' || cat === 'exterior_detailing');
      var isCarWash = (cat === 'Car Washing' || cat === 'car_washing');

      var vLabel = document.getElementById('editCustVehiclesLabel');
      if (vLabel) {
        vLabel.textContent = isSolar ? 'Site Name / Location' : 'Vehicle Number & Model';
      }
      var vInput = document.getElementById('editCustVehicles');
      if (vInput) {
        vInput.placeholder = isSolar ? 'e.g. Rooftop 5KW Site' : 'e.g. UP65 AB 1234 - Creta';
      }

      var secGroup = document.getElementById('editSecondaryAddressGroup');
      if (secGroup) {
        secGroup.style.display = (cat === 'Daily Car Cleaning' || cat === 'daily_car_cleaning') ? 'block' : 'none';
      }
      var editCarMakeColorRow = document.getElementById('editCustCarMakeColorRow');
      if (editCarMakeColorRow) editCarMakeColorRow.style.display = isSolar ? 'none' : 'grid';
      var editCustSolarPanelsRow = document.getElementById('editCustSolarPanelsRow');
      var editCustSeaterRow = document.getElementById('editCustSeaterRow');
      if (editCustSolarPanelsRow) editCustSolarPanelsRow.style.display = isSolar ? 'block' : 'none';
      if (editCustSeaterRow) editCustSeaterRow.style.display = isSolar ? 'none' : 'block';

      var pkgSelect = document.getElementById('editCustPkgType');
      if (!pkgSelect) return;
      var curVal = pkgSelect.value;

      if (isSolar) {
        pkgSelect.innerHTML = 
          '<option value="One Time Solar Cleaning">One Time Solar Cleaning</option>' +
          '<option value="6 Month Subscription (6 frequencies)">6 Month Subscription (6 frequencies)</option>' +
          '<option value="12 Month Subscription (12 frequencies)">12 Month Subscription (12 frequencies)</option>' +
          '<option value="SOLAR SUBSCRIPTION">SOLAR SUBSCRIPTION</option>' +
          '<option value="SOLAR SINGLE">SOLAR SINGLE</option>' +
          '<option value="OTHER">OTHER</option>';
      } else if (isCarWash) {
        pkgSelect.innerHTML = 
          '<option value="Single Wash (One Time Wash)">Single Wash (One Time Wash)</option>' +
          '<option value="Wash Subscription (4 Washes / 6 Months)">Wash Subscription (4 Washes / 6 Months)</option>' +
          '<option value="CAR WASH SUBSCRIPTION">CAR WASH SUBSCRIPTION</option>' +
          '<option value="CAR WASH SINGLE">CAR WASH SINGLE</option>' +
          '<option value="OTHER">OTHER</option>';
      } else if (isInterior) {
        pkgSelect.innerHTML = 
          '<option value="Interior Deep Cleaning">Interior Deep Cleaning</option>' +
          '<option value="Roof Cleaning">Roof Cleaning</option>' +
          '<option value="OTHER">OTHER</option>';
      } else if (isExterior) {
        pkgSelect.innerHTML = 
          '<option value="Ceramic Coating">Ceramic Coating</option>' +
          '<option value="Graphene Coating">Graphene Coating</option>' +
          '<option value="Car Waxing">Car Waxing</option>' +
          '<option value="Glass Treatment">Glass Treatment</option>' +
          '<option value="OTHER">OTHER</option>';
      } else {
        pkgSelect.innerHTML = 
          '<option value="DCC ONLY">DCC ONLY (Exterior Daily)</option>' +
          '<option value="Exterior Chemical Cleaning (30 Days)">Exterior Chemical Cleaning (30 Days)</option>' +
          '<option value="Exterior Chemical Cleaning + 1 Carwash/mo">Exterior Chemical Cleaning + 1 Carwash/mo</option>' +
          '<option value="Exterior Chemical Cleaning + 2 Carwash/mo">Exterior Chemical Cleaning + 2 Carwash/mo</option>' +
          '<option value="DCC SILVER">DCC SILVER</option>' +
          '<option value="DCC GOLD">DCC GOLD</option>' +
          '<option value="OTHER">OTHER</option>';
      }
      if (curVal) {
        var matched = false;
        for (var i = 0; i < pkgSelect.options.length; i++) {
          if (pkgSelect.options[i].value.toLowerCase() === curVal.toLowerCase()) {
            pkgSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched && pkgSelect.options.length > 0) {
          pkgSelect.value = pkgSelect.options[0].value;
        }
      } else if (pkgSelect.options.length > 0) {
        pkgSelect.value = pkgSelect.options[0].value;
      }
      handleEditPackageTypeChange(pkgSelect.value);
    }

    function handleEditPackageTypeChange(val) {
      var customInput = document.getElementById('editCustPkgTypeCustom');
      if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
    }

    function handlePackageTypeChange(val) {
      var customInput = document.getElementById('custPkgTypeCustom');
      if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
    }

    function handleOtherPackageTypeChange(val) {
      var customInput = document.getElementById('custOtherCustom');
      if (customInput) customInput.style.display = (val === 'OTHER') ? 'block' : 'none';
    }


    function setQuickNote(str) {
      var el = document.getElementById('custNotes');
      el.value = str;
      el.focus();
    }

    function detectGpsLocation() {
      if (!navigator.geolocation) {
        alert('GPS geolocation is not supported in your browser.');
        return;
      }
      showToast('Detecting GPS location...', '📍');
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude.toFixed(6);
        var lng = pos.coords.longitude.toFixed(6);
        document.getElementById('custMapsUrl').value = 'https:\x2F\x2Fwww.google.com/maps?q=' + lat + ',' + lng;
        showToast('GPS coordinates captured!', '✓');
      }, function(err) {
        showToast('Failed to get GPS location: ' + err.message, '❌');
      }, { timeout: 10000 });
    }

    /* =========================================================================
       AUTO-DRAFT & LOCAL PERSISTENCE SYSTEM (P0 Form Resilience)
       ========================================================================= */
    var CWP_DRAFT_KEY = 'cwp_add_customer_draft_v1';
    var CWP_EDIT_DRAFT_PREFIX = 'cwp_edit_draft_';
    var draftSaveTimer = null;
    var editDraftSaveTimer = null;

    function formatRelativeDraftTime(timestamp) {
      if (!timestamp) return 'Just now';
      var diffSec = Math.floor((Date.now() - timestamp) / 1000);
      if (diffSec < 60) return 'Just now';
      var diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return diffMin + ' min ago';
      var diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return diffHours + ' hrs ago';
      return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function initCustomerAutoDraft() {
      var form = document.getElementById('addCustomerForm');
      if (!form || form._hasDraftListener) return;
      form._hasDraftListener = true;

      /* Check for existing draft on init */
      checkAndShowDraftBanner();

      /* Attach input & change listener for debounced auto-drafting */
      var inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(function(el) {
        if (el.type === 'file') return;
        el.addEventListener('input', triggerCustomerAutoDraft);
        el.addEventListener('change', triggerCustomerAutoDraft);
      });
    }

    function triggerCustomerAutoDraft() {
      var badge = document.getElementById('custDraftBadge');
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'cwp-draft-badge saving';
        badge.innerHTML = '<span class="draft-dot pulse"></span> Saving draft...';
      }

      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(function() {
        saveCustomerDraft();
      }, 350);
    }

    function saveCustomerDraft() {
      var nameEl = document.getElementById('custName');
      var phoneEl = document.getElementById('custPhone');
      var mapsEl = document.getElementById('custMapsUrl');
      var addrEl = document.getElementById('custAddress');
      var catEl = document.getElementById('custCategory');
      var vehEl = document.getElementById('custVehicles');
      var pkgEl = document.getElementById('custPkgType');
      var pkgCustomEl = document.getElementById('custPkgTypeCustom');
      var staffEl = document.getElementById('custStaffSelect');
      var notesEl = document.getElementById('custNotes');
      var secAddrEl = document.getElementById('custSecAddress');
      var secMapsEl = document.getElementById('custSecMaps');
      var carMakeEl = document.getElementById('custCarMake');
      var carColorEl = document.getElementById('custCarColor');

      var name = (nameEl ? nameEl.value : '').trim();
      var phone = (phoneEl ? phoneEl.value : '').trim();
      var maps = (mapsEl ? mapsEl.value : '').trim();
      var addr = (addrEl ? addrEl.value : '').trim();
      var cat = catEl ? catEl.value : 'Daily Car Cleaning';
      var veh = (vehEl ? vehEl.value : '').trim();
      var pkg = pkgEl ? pkgEl.value : 'DCC ONLY';
      var pkgCustom = (pkgCustomEl ? pkgCustomEl.value : '').trim();
      var staff = staffEl ? staffEl.value : '';
      var notes = (notesEl ? notesEl.value : '').trim();
      var secAddr = (secAddrEl ? secAddrEl.value : '').trim();
      var secMaps = (secMapsEl ? secMapsEl.value : '').trim();
      var carMake = (carMakeEl ? carMakeEl.value : '').trim();
      var carColor = (carColorEl ? carColorEl.value : '').trim();

      /* Check if there is meaningful input worth preserving */
      var hasContent = name || phone || maps || addr || veh || notes || secAddr || secMaps || carMake || carColor || (pkg === 'OTHER' && pkgCustom) || state.selectedPhotoBase64;
      var badge = document.getElementById('custDraftBadge');

      if (!hasContent) {
        localStorage.removeItem(CWP_DRAFT_KEY);
        if (badge) badge.style.display = 'none';
        return;
      }

      var draftData = {
        name: name,
        phone: phone,
        maps: maps,
        addr: addr,
        cat: cat,
        veh: veh,
        carMake: carMake,
        carColor: carColor,
        pkg: pkg,
        pkgCustom: pkgCustom,
        staff: staff,
        notes: notes,
        secAddr: secAddr,
        secMaps: secMaps,
        timestamp: Date.now()
      };

      try {
        localStorage.setItem(CWP_DRAFT_KEY, JSON.stringify(draftData));
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.className = 'cwp-draft-badge saved';
          var timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          badge.innerHTML = '<span class="draft-dot ready"></span> ✓ Draft saved (' + timeStr + ')';
        }
      } catch (e) {
        console.warn('Draft save error:', e);
      }
    }

    function checkAndShowDraftBanner() {
      var raw = localStorage.getItem(CWP_DRAFT_KEY);
      var banner = document.getElementById('custDraftRestoreBanner');
      var timeEl = document.getElementById('custDraftTimeInfo');
      if (!raw) {
        if (banner) banner.style.display = 'none';
        return;
      }

      try {
        var draft = JSON.parse(raw);
        if (!draft || (!draft.name && !draft.phone && !draft.addr && !draft.veh)) {
          localStorage.removeItem(CWP_DRAFT_KEY);
          if (banner) banner.style.display = 'none';
          return;
        }

        if (timeEl) {
          var snippet = draft.name ? ('(' + draft.name + (draft.phone ? ' • ' + draft.phone : '') + ')') : '';
          timeEl.textContent = formatRelativeDraftTime(draft.timestamp) + ' ' + snippet;
        }
        if (banner) banner.style.display = 'flex';
      } catch (e) {
        localStorage.removeItem(CWP_DRAFT_KEY);
        if (banner) banner.style.display = 'none';
      }
    }

    function restoreCustomerDraft() {
      var raw = localStorage.getItem(CWP_DRAFT_KEY);
      if (!raw) return;

      try {
        var d = JSON.parse(raw);
        if (d.name !== undefined && document.getElementById('custName')) document.getElementById('custName').value = d.name;
        if (d.phone !== undefined && document.getElementById('custPhone')) setPhoneInputValue(document.getElementById('custPhone'), d.phone);
        if (d.maps !== undefined && document.getElementById('custMapsUrl')) {
          document.getElementById('custMapsUrl').value = d.maps;
          if (d.maps.trim()) toggleCustMap(true);
        }
        if (d.addr !== undefined && document.getElementById('custAddress')) document.getElementById('custAddress').value = d.addr;
        if (d.cat !== undefined && document.getElementById('custCategory')) {
          document.getElementById('custCategory').value = d.cat;
          toggleCategoryFields(d.cat);
        }
        if (d.veh !== undefined && document.getElementById('custVehicles')) document.getElementById('custVehicles').value = d.veh;
        if (d.carMake !== undefined && document.getElementById('custCarMake')) document.getElementById('custCarMake').value = d.carMake;
        if (d.carColor !== undefined && document.getElementById('custCarColor')) document.getElementById('custCarColor').value = d.carColor;
        if (d.pkg !== undefined && document.getElementById('custPkgType')) {
          document.getElementById('custPkgType').value = d.pkg;
          handlePackageTypeChange(d.pkg);
        }
        if (d.pkgCustom !== undefined && document.getElementById('custPkgTypeCustom')) {
          document.getElementById('custPkgTypeCustom').value = d.pkgCustom;
        }
        if (d.staff !== undefined && document.getElementById('custStaffSelect')) {
          document.getElementById('custStaffSelect').value = d.staff;
        }
        if (d.notes !== undefined && document.getElementById('custNotes')) document.getElementById('custNotes').value = d.notes;
        if (d.secAddr !== undefined && document.getElementById('custSecAddress')) {
          document.getElementById('custSecAddress').value = d.secAddr;
        }
        if (d.secMaps !== undefined && document.getElementById('custSecMaps')) {
          document.getElementById('custSecMaps').value = d.secMaps;
        }
        if ((d.secAddr && d.secAddr.trim()) || (d.secMaps && d.secMaps.trim())) {
          toggleCustSecLocation(true);
        }

        var banner = document.getElementById('custDraftRestoreBanner');
        if (banner) banner.style.display = 'none';

        var badge = document.getElementById('custDraftBadge');
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.className = 'cwp-draft-badge saved';
          badge.innerHTML = '<span class="draft-dot ready"></span> ✓ Draft restored';
        }

        showToast('Draft restored successfully into form!', '✓');
      } catch (e) {
        console.error('Error restoring draft:', e);
        showToast('Failed to restore draft: ' + e.message, '⚠️');
      }
    }

    function discardCustomerDraft(silent) {
      localStorage.removeItem(CWP_DRAFT_KEY);
      var banner = document.getElementById('custDraftRestoreBanner');
      if (banner) banner.style.display = 'none';
      var badge = document.getElementById('custDraftBadge');
      if (badge) badge.style.display = 'none';
      if (!silent) {
        showToast('Draft discarded', '🗑️');
      }
    }

    /* Edit Modal Auto-Draft System */
    function getEditDraftKey() {
      var rowEl = document.getElementById('editRowIndex');
      var sheetEl = document.getElementById('editSheetName');
      var row = rowEl ? rowEl.value : 'unknown';
      var sheet = sheetEl ? sheetEl.value : 'unknown';
      return CWP_EDIT_DRAFT_PREFIX + sheet + '_' + row;
    }

    function initEditCustomerAutoDraft() {
      var form = document.getElementById('editCustomerForm');
      if (!form || form._hasEditDraftListener) return;
      form._hasEditDraftListener = true;

      var inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(function(el) {
        if (el.type === 'file' || el.type === 'hidden') return;
        el.addEventListener('input', triggerEditAutoDraft);
        el.addEventListener('change', triggerEditAutoDraft);
      });
    }

    function triggerEditAutoDraft() {
      var badge = document.getElementById('editDraftBadge');
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'cwp-draft-badge saving';
        badge.innerHTML = '<span class="draft-dot pulse"></span> Saving draft...';
      }
      clearTimeout(editDraftSaveTimer);
      editDraftSaveTimer = setTimeout(function() {
        saveEditDraft();
      }, 400);
    }

    function saveEditDraft() {
      var key = getEditDraftKey();
      if (!key || key.indexOf('unknown') !== -1) return;

      var nameEl = document.getElementById('editCustName');
      var phoneEl = document.getElementById('editCustPhone');
      var staffEl = document.getElementById('editCustStaff');
      var activeEl = document.getElementById('editCustActive');
      var catEl = document.getElementById('editCustCategory');
      var pkgEl = document.getElementById('editCustPkgType');
      var pkgCustomEl = document.getElementById('editCustPkgTypeCustom');
      var vehEl = document.getElementById('editCustVehicles');
      var mapsEl = document.getElementById('editCustMapsUrl');
      var addrEl = document.getElementById('editCustAddress');
      var secAddrEl = document.getElementById('editCustSecAddress');
      var secMapsEl = document.getElementById('editCustSecMaps');
      var notesEl = document.getElementById('editCustNotes');
      var carMakeEl = document.getElementById('editCustCarMake');
      var carColorEl = document.getElementById('editCustCarColor');

      var draftData = {
        name: (nameEl ? nameEl.value : '').trim(),
        phone: (phoneEl ? phoneEl.value : '').trim(),
        staff: staffEl ? staffEl.value : '',
        active: activeEl ? activeEl.value : 'Yes',
        category: catEl ? catEl.value : 'Daily Car Cleaning',
        pkg: pkgEl ? pkgEl.value : 'DCC ONLY',
        pkgCustom: (pkgCustomEl ? pkgCustomEl.value : '').trim(),
        vehicles: (vehEl ? vehEl.value : '').trim(),
        carMake: (carMakeEl ? carMakeEl.value : '').trim(),
        carColor: (carColorEl ? carColorEl.value : '').trim(),
        maps: (mapsEl ? mapsEl.value : '').trim(),
        address: (addrEl ? addrEl.value : '').trim(),
        secAddress: (secAddrEl ? secAddrEl.value : '').trim(),
        secMaps: (secMapsEl ? secMapsEl.value : '').trim(),
        notes: (notesEl ? notesEl.value : '').trim(),
        timestamp: Date.now()
      };

      try {
        localStorage.setItem(key, JSON.stringify(draftData));
        var badge = document.getElementById('editDraftBadge');
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.className = 'cwp-draft-badge saved';
          badge.innerHTML = '<span class="draft-dot ready"></span> ✓ Draft saved';
        }
      } catch (e) {
        console.warn('Edit draft save error:', e);
      }
    }

    function checkAndShowEditDraftBanner() {
      var key = getEditDraftKey();
      var raw = localStorage.getItem(key);
      var banner = document.getElementById('editDraftRestoreBanner');
      var timeEl = document.getElementById('editDraftTimeInfo');
      if (!raw || !banner) {
        if (banner) banner.style.display = 'none';
        return;
      }
      try {
        var d = JSON.parse(raw);
        if (timeEl) timeEl.textContent = formatRelativeDraftTime(d.timestamp);
        banner.style.display = 'flex';
      } catch (e) {
        localStorage.removeItem(key);
        banner.style.display = 'none';
      }
    }

    function restoreEditDraft() {
      var key = getEditDraftKey();
      var raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        var d = JSON.parse(raw);
        if (d.name !== undefined && document.getElementById('editCustName')) document.getElementById('editCustName').value = d.name;
        if (d.phone !== undefined && document.getElementById('editCustPhone')) setPhoneInputValue(document.getElementById('editCustPhone'), d.phone);
        if (d.maps !== undefined && d.maps.trim()) toggleEditMap(true);
        if ((d.secAddress && d.secAddress.trim()) || (d.secMaps && d.secMaps.trim())) toggleEditSecLocation(true);
        if (d.staff !== undefined && document.getElementById('editCustStaff')) document.getElementById('editCustStaff').value = d.staff;
        if (d.active !== undefined && document.getElementById('editCustActive')) document.getElementById('editCustActive').value = d.active;
        if (d.category !== undefined && document.getElementById('editCustCategory')) {
          document.getElementById('editCustCategory').value = d.category;
          handleEditCategoryChange(d.category);
        }
        if (d.pkg !== undefined && document.getElementById('editCustPkgType')) {
          document.getElementById('editCustPkgType').value = d.pkg;
          handleEditPackageTypeChange(d.pkg);
        }
        if (d.pkgCustom !== undefined && document.getElementById('editCustPkgTypeCustom')) {
          document.getElementById('editCustPkgTypeCustom').value = d.pkgCustom;
        }
        if (d.vehicles !== undefined && document.getElementById('editCustVehicles')) document.getElementById('editCustVehicles').value = d.vehicles;
        if (d.carMake !== undefined && document.getElementById('editCustCarMake')) document.getElementById('editCustCarMake').value = d.carMake;
        if (d.carColor !== undefined && document.getElementById('editCustCarColor')) document.getElementById('editCustCarColor').value = d.carColor;
        if (d.maps !== undefined && document.getElementById('editCustMapsUrl')) document.getElementById('editCustMapsUrl').value = d.maps;
        if (d.address !== undefined && document.getElementById('editCustAddress')) document.getElementById('editCustAddress').value = d.address;
        if (d.secAddress !== undefined && document.getElementById('editCustSecAddress')) {
          document.getElementById('editCustSecAddress').value = d.secAddress;
        }
        if (d.secMaps !== undefined && document.getElementById('editCustSecMaps')) {
          document.getElementById('editCustSecMaps').value = d.secMaps;
        }
        if (d.notes !== undefined && document.getElementById('editCustNotes')) document.getElementById('editCustNotes').value = d.notes;

        var banner = document.getElementById('editDraftRestoreBanner');
        if (banner) banner.style.display = 'none';
        showToast('Edit draft restored', '✓');
      } catch (e) {
        console.warn('Error restoring edit draft:', e);
      }
    }

    function discardEditDraft(silent) {
      var key = getEditDraftKey();
      localStorage.removeItem(key);
      var banner = document.getElementById('editDraftRestoreBanner');
      if (banner) banner.style.display = 'none';
      var badge = document.getElementById('editDraftBadge');
      if (badge) badge.style.display = 'none';
      if (!silent) showToast('Edit draft discarded', '🗑️');
    }


    /* =========================================================================
       PHOTO CROPPER & ROTATION (DEGREE-WISE) SYSTEM
       ========================================================================= */
    var cropperInstance = null;
    var cropperTargetContext = 'add'; /* 'add' or 'edit' */
    var cropperCurrentDegree = 0;
    var cropperScaleX = 1;
    var cropperScaleY = 1;

    function triggerCustPhotoSelect() {
      if (!state.selectedPhotoBase64) {
        var fileInput = document.getElementById('custPhotoFile');
        if (fileInput) fileInput.click();
      }
    }

    function openCropperModal(imageSrc, context, triggerEl) {
      if (!imageSrc) return;
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      cropperTargetContext = context || 'add';

      var modal = document.getElementById('cwpPhotoCropperModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }

      /* Destroy existing instance if any */
      if (cropperInstance) {
        try { cropperInstance.destroy(); } catch (e) {}
        cropperInstance = null;
      }

      cropperCurrentDegree = 0;
      cropperScaleX = 1;
      cropperScaleY = 1;

      var slider = document.getElementById('cropperAngleSlider');
      if (slider) slider.value = 0;
      var badge = document.getElementById('cropperAngleBadge');
      if (badge) badge.innerText = '0.0°';

      var img = document.getElementById('cwpCropperSourceImg');
      if (!img) return;

      img.crossOrigin = 'anonymous';
      img.onload = function() {
        if (typeof Cropper === 'undefined') {
          showToast('Cropper library failed to load', '❌');
          return;
        }

        if (cropperInstance) {
          try { cropperInstance.destroy(); } catch (e) {}
          cropperInstance = null;
        }

        cropperInstance = new Cropper(img, {
          viewMode: 0,
          dragMode: 'crop',
          aspectRatio: NaN,
          autoCropArea: 0.95,
          responsive: true,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          rotatable: true,
          scalable: true,
          zoomable: true,
          checkOrientation: true,
          ready: function() {
            cropperSetActiveAspectBtn('free');
            cropperSetDragMode('crop');
          }
        });
      };
      img.src = imageSrc;
    }

    function closeCropperModal() {
      var modal = document.getElementById('cwpPhotoCropperModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();

      if (cropperInstance) {
        try { cropperInstance.destroy(); } catch (e) {}
        cropperInstance = null;
      }

      /* If user cancelled without applying and had no prior photo, reset inputs */
      if (cropperTargetContext === 'add' && !state.selectedPhotoBase64) {
        var fileInput = document.getElementById('custPhotoFile');
        if (fileInput) fileInput.value = '';
        var prev = document.getElementById('custPhotoPreview');
        if (prev) prev.style.display = 'none';
        var ph = document.getElementById('custPhotoPlaceholder');
        if (ph) ph.style.display = 'block';
      } else if (cropperTargetContext === 'edit' && !state.editPhotoBase64) {
        var editFileInput = document.getElementById('editCustPhotoFile');
        if (editFileInput) editFileInput.value = '';
      }
    }

    function cropperHandleOverlayClick(event) {
      if (event.target && event.target.id === 'cwpPhotoCropperModal') {
        closeCropperModal();
      }
    }

    function cropperOnSliderInput(val) {
      var deg = parseFloat(val) || 0;
      cropperCurrentDegree = deg;
      var badge = document.getElementById('cropperAngleBadge');
      if (badge) {
        badge.innerText = (deg > 0 ? '+' : '') + deg.toFixed(1) + '°';
      }
      if (cropperInstance) {
        cropperInstance.rotateTo(deg);
      }
    }

    function cropperNudgeAngle(delta) {
      var newDeg = cropperCurrentDegree + delta;
      if (newDeg > 180) newDeg -= 360;
      if (newDeg < -180) newDeg += 360;
      newDeg = Math.round(newDeg * 10) / 10;
      var slider = document.getElementById('cropperAngleSlider');
      if (slider) slider.value = newDeg;
      cropperOnSliderInput(newDeg);
    }

    function cropperStepRotate(delta) {
      cropperNudgeAngle(delta);
    }

    function cropperResetAngle() {
      cropperCurrentDegree = 0;
      var slider = document.getElementById('cropperAngleSlider');
      if (slider) slider.value = 0;
      cropperOnSliderInput(0);
    }

    function cropperFlipH() {
      if (!cropperInstance) return;
      cropperScaleX = -cropperScaleX;
      cropperInstance.scaleX(cropperScaleX);
    }

    function cropperFlipV() {
      if (!cropperInstance) return;
      cropperScaleY = -cropperScaleY;
      cropperInstance.scaleY(cropperScaleY);
    }

    function cropperSetAspectRatio(ratio, btnKey) {
      if (!cropperInstance) return;
      cropperInstance.setAspectRatio(ratio);
      cropperSetActiveAspectBtn(btnKey);
    }

    function cropperSetActiveAspectBtn(key) {
      var btnIds = ['btnAspectFree', 'btnAspect1_1', 'btnAspect4_3', 'btnAspect16_9', 'btnAspect3_4'];
      for (var i = 0; i < btnIds.length; i++) {
        var el = document.getElementById(btnIds[i]);
        if (el) el.classList.remove('active');
      }
      var targetId = 'btnAspectFree';
      if (key === '1_1') targetId = 'btnAspect1_1';
      else if (key === '4_3') targetId = 'btnAspect4_3';
      else if (key === '16_9') targetId = 'btnAspect16_9';
      else if (key === '3_4') targetId = 'btnAspect3_4';
      var activeEl = document.getElementById(targetId);
      if (activeEl) activeEl.classList.add('active');
    }

    function cropperSetDragMode(mode) {
      if (!cropperInstance) return;
      cropperInstance.setDragMode(mode);
      var moveBtn = document.getElementById('cropperBtnModeMove');
      var cropBtn = document.getElementById('cropperBtnModeCrop');
      if (moveBtn && cropBtn) {
        if (mode === 'move') {
          moveBtn.classList.add('active');
          cropBtn.classList.remove('active');
        } else {
          cropBtn.classList.add('active');
          moveBtn.classList.remove('active');
        }
      }
    }

    function cropperZoom(ratio) {
      if (!cropperInstance) return;
      cropperInstance.zoom(ratio);
    }

    function cropperResetAll() {
      if (!cropperInstance) return;
      cropperInstance.reset();
      cropperCurrentDegree = 0;
      cropperScaleX = 1;
      cropperScaleY = 1;
      var slider = document.getElementById('cropperAngleSlider');
      if (slider) slider.value = 0;
      var badge = document.getElementById('cropperAngleBadge');
      if (badge) badge.innerText = '0.0°';
      cropperSetAspectRatio(NaN, 'free');
      cropperSetDragMode('crop');
    }

    function applyCroppedPhoto() {
      if (!cropperInstance) return;

      var canvas = cropperInstance.getCroppedCanvas({
        maxWidth: 1600,
        maxHeight: 1600,
        fillColor: '#ffffff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });

      if (!canvas) {
        showToast('Error cropping photo!', '❌');
        return;
      }

      var croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      var commaIdx = croppedDataUrl.indexOf(',');
      var base64 = commaIdx !== -1 ? croppedDataUrl.slice(commaIdx + 1) : croppedDataUrl;

      if (cropperTargetContext === 'add') {
        state.selectedPhotoBase64 = base64;
        state.selectedPhotoType = 'image/jpeg';
        if (!state.selectedPhotoName) {
          state.selectedPhotoName = 'customer_photo.jpg';
        } else {
          state.selectedPhotoName = state.selectedPhotoName.replace(/\.[^/.]+$/, "") + ".jpg";
        }

        var preview = document.getElementById('custPhotoPreview');
        if (preview) {
          preview.src = croppedDataUrl;
          preview.style.display = 'block';
        }

        var ph = document.getElementById('custPhotoPlaceholder');
        if (ph) ph.style.display = 'none';

        var actionsWrap = document.getElementById('custPhotoActionsWrap');
        if (actionsWrap) actionsWrap.style.display = 'flex';

        triggerCustomerAutoDraft();
        showToast('Photo straightened and cropped! ✓', '✂️');
      } else if (cropperTargetContext === 'edit') {
        state.editPhotoBase64 = base64;
        state.editPhotoType = 'image/jpeg';
        if (!state.editPhotoName) {
          state.editPhotoName = 'customer_edit_photo.jpg';
        } else {
          state.editPhotoName = state.editPhotoName.replace(/\.[^/.]+$/, "") + ".jpg";
        }

        var thumb = document.getElementById('editPhotoThumb');
        if (thumb) {
          thumb.src = croppedDataUrl;
          thumb.style.display = 'block';
        }

        var btnUpload = document.getElementById('btnEditUploadPhoto');
        if (btnUpload) btnUpload.style.display = 'none';

        var editActionsWrap = document.getElementById('editPhotoActionsWrap');
        if (editActionsWrap) editActionsWrap.style.display = 'flex';

        triggerEditAutoDraft();
        showToast('Photo straightened and cropped! ✓', '✂️');
      }

      closeCropperModal();
    }

    function openExistingCustPhotoCropper() {
      var src = state.rawSelectedPhotoDataUrl;
      if (!src) {
        var prev = document.getElementById('custPhotoPreview');
        if (prev && prev.src) src = prev.src;
      }
      if (src) {
        openCropperModal(src, 'add');
      } else {
        var fileInput = document.getElementById('custPhotoFile');
        if (fileInput) fileInput.click();
      }
    }

    function openExistingEditPhotoCropper() {
      var src = state.rawEditPhotoDataUrl;
      if (!src) {
        var thumb = document.getElementById('editPhotoThumb');
        if (thumb && thumb.src) src = thumb.src;
      }
      if (!src) {
        var origUrl = document.getElementById('editPhotoUrl') ? document.getElementById('editPhotoUrl').value : '';
        if (origUrl) src = origUrl;
      }
      if (src) {
        openCropperModal(src, 'edit');
      } else {
        var fileInput = document.getElementById('editCustPhotoFile');
        if (fileInput) fileInput.click();
      }
    }

    function removeCustPhoto(e) {
      if (e) e.stopPropagation();
      state.selectedPhotoBase64 = '';
      state.selectedPhotoName = '';
      state.selectedPhotoType = '';
      state.rawSelectedPhotoDataUrl = '';
      var preview = document.getElementById('custPhotoPreview');
      if (preview) {
        preview.src = '';
        preview.style.display = 'none';
      }
      var ph = document.getElementById('custPhotoPlaceholder');
      if (ph) ph.style.display = 'inline-flex';
      var fileInput = document.getElementById('custPhotoFile');
      if (fileInput) fileInput.value = '';
      var actionsWrap = document.getElementById('custPhotoActionsWrap');
      if (actionsWrap) actionsWrap.style.display = 'none';
      triggerCustomerAutoDraft();
      showToast('Photo removed', '🗑️');
    }

    function removeEditCustPhoto(e) {
      if (e) e.stopPropagation();
      state.editPhotoBase64 = '';
      state.editPhotoName = '';
      state.editPhotoType = '';
      state.rawEditPhotoDataUrl = '';
      var fileInput = document.getElementById('editCustPhotoFile');
      if (fileInput) fileInput.value = '';
      var thumb = document.getElementById('editPhotoThumb');
      var origUrl = document.getElementById('editPhotoUrl') ? document.getElementById('editPhotoUrl').value : '';
      if (origUrl) {
        if (thumb) thumb.src = origUrl;
      } else {
        if (thumb) {
          thumb.src = '';
          thumb.style.display = 'none';
        }
        var btnUpload = document.getElementById('btnEditUploadPhoto');
        if (btnUpload) btnUpload.style.display = 'flex';
        var editActionsWrap = document.getElementById('editPhotoActionsWrap');
        if (editActionsWrap) editActionsWrap.style.display = 'none';
      }
      triggerEditAutoDraft();
      showToast('Photo removed', '🗑️');
    }

    function handlePhotoSelect(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;

      var pWrap = document.getElementById('custPhotoProgressWrap');
      var pFill = document.getElementById('custPhotoProgressFill');
      if (pWrap && pFill) {
        pWrap.style.display = 'block';
        pFill.style.width = '30%';
      }

      state.selectedPhotoName = file.name;
      state.selectedPhotoType = file.type || 'image/jpeg';

      var reader = new FileReader();
      reader.onprogress = function(pe) {
        if (pe.lengthComputable && pFill) {
          var pct = Math.round((pe.loaded / pe.total) * 90);
          pFill.style.width = pct + '%';
        }
      };
      reader.onload = function(evt) {
        if (pFill) pFill.style.width = '100%';
        setTimeout(function() {
          if (pWrap) pWrap.style.display = 'none';
          if (pFill) pFill.style.width = '0%';
        }, 300);

        var dataUrl = evt.target.result;
        state.rawSelectedPhotoDataUrl = dataUrl;

        /* Open Crop & Rotation modal immediately */
        openCropperModal(dataUrl, 'add');
      };
      reader.readAsDataURL(file);
    }

    function handleCustomerSubmit(e) {
      e.preventDefault();
      var btn = document.getElementById('btnSaveCust');
      btn.disabled = true;
      var hasPhoto = !!state.selectedPhotoBase64;
      btn.innerHTML = '<span class="cwp-spinner"></span> ' + (hasPhoto ? 'Uploading photo & saving...' : 'Saving customer...');

      var phoneEl = document.getElementById('custPhone');
      var normCustPhone = normalizeIndianMobile(phoneEl ? phoneEl.value : '');
      if (!isValidIndianMobile(normCustPhone)) {
        alert('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        if (phoneEl) phoneEl.focus();
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Customer';
        return;
      }

      var staffSelect = document.getElementById('custStaffSelect');
      var rawStaffVal = staffSelect ? staffSelect.value.trim() : '';
      var staffName = '';
      var staffId = '';
      if (rawStaffVal && rawStaffVal.toLowerCase() !== 'unassigned' && rawStaffVal.toLowerCase() !== 'none') {
        var foundStaff = (state.staffList || []).find(function(s) {
          return (s.name && s.name.trim().toLowerCase() === rawStaffVal.toLowerCase()) ||
                 (s.id && s.id.trim().toLowerCase() === rawStaffVal.toLowerCase());
        });
        if (foundStaff) {
          staffName = foundStaff.name;
          staffId = foundStaff.id || '';
        } else {
          staffName = rawStaffVal;
        }
      }

      var category = document.getElementById('custCategory').value;
      var isDaily = (category === 'Daily Car Cleaning');
      var isSolar = (category === 'Solar Panel Cleaning');
      var isCarWash = (category === 'Car Washing');

      var photoPayload = state.selectedPhotoBase64 ? {
        base64: state.selectedPhotoBase64,
        mimeType: state.selectedPhotoType,
        fileName: state.selectedPhotoName
      } : null;

      var pkgVal = document.getElementById('custPkgType').value;
      if (pkgVal === 'OTHER') {
        var custOther = (document.getElementById('custPkgTypeCustom').value || '').trim();
        if (custOther) pkgVal = 'OTHER (' + custOther + ')';
      }

      var vehText = document.getElementById('custVehicles').value.trim();
      var carMakeVal = (document.getElementById('custCarMake') ? document.getElementById('custCarMake').value : '').trim();
      var carColorVal = (document.getElementById('custCarColor') ? document.getElementById('custCarColor').value : '').trim();

      var isLeadCheck = document.getElementById('custIsLeadCheck');
      var isLeadMarked = isLeadCheck && isLeadCheck.checked;

      var panelInput = document.getElementById('custSolarPanelsCount') || document.getElementById('custPanelCount');
      var panelCountVal = isSolar ? (parseInt(panelInput ? panelInput.value : '', 10) || null) : null;
      var seaterTypeVal = isSolar ? null : (document.getElementById('custSeaterTypeHidden') ? document.getElementById('custSeaterTypeHidden').value : '5_seater');
      var resolvedServiceType = isSolar ? 'Solar Panel Cleaning' : (isCarWash ? 'Car Washing' : (category === 'Interior Detailing' ? 'Interior Detailing' : (category === 'Exterior Detailing' ? 'Exterior Detailing' : 'Daily Car Cleaning')));

      var customerData = {
        isLead: Boolean(isLeadMarked),
        tag: isLeadMarked ? 'lead' : 'customer',
        leadStatus: isLeadMarked ? 'open' : 'converted',
        sheetName: isLeadMarked ? 'Leads' : (isDaily ? 'Daily Clean' : 'All Other Work'),
        serviceCategory: category,
        serviceType: resolvedServiceType,
        panelCount: panelCountVal,
        panel_count: panelCountVal,
        seaterType: seaterTypeVal,
        seater_type: seaterTypeVal,
        staffId: staffId,
        staffName: staffName,
        customerName: document.getElementById('custName').value.trim(),
        nameHi: document.getElementById('custNameHi') ? document.getElementById('custNameHi').value.trim() : '',
        customerNumber: normalizeIndianMobile(document.getElementById('custPhone').value),
        address: document.getElementById('custAddress').value.trim(),
        addressHi: document.getElementById('custAddressHi') ? document.getElementById('custAddressHi').value.trim() : '',
        googleMapsUrl: document.getElementById('custMapsUrl').value.trim(),
        staffNotes: document.getElementById('custNotes').value.trim(),
        active: 'Yes',
        packageType: pkgVal,
        packageDetails: pkgVal,
        packagesPurchased: '1',
        vehicleNumbers: vehText,
        vehicleOrSite: vehText,
        vehicle: vehText,
        carMake: carMakeVal,
        car_make: carMakeVal,
        carColor: carColorVal,
        car_color: carColorVal,
        secondaryAddress: isDaily && document.getElementById('custSecAddress') ? document.getElementById('custSecAddress').value.trim() : '',
        secondaryAddressHi: isDaily && document.getElementById('custSecAddressHi') ? document.getElementById('custSecAddressHi').value.trim() : '',
        secondaryMapsUrl: isDaily && document.getElementById('custSecMaps') ? document.getElementById('custSecMaps').value.trim() : '',
        photoFile: photoPayload,
        photoData: photoPayload
      };

      apiCall('saveCustomer', { customerData: customerData }, function(res) {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Customer';
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          if (isLeadMarked) {
            showToast('Lead saved successfully and stored in Leads section!', '🎯');
          } else {
            showToast('Customer saved successfully and added to Active Records!', '✓');
          }
          document.getElementById('addCustomerForm').reset();
          var leadChk = document.getElementById('custIsLeadCheck');
          if (leadChk) leadChk.checked = false;
          handleCustIsLeadToggle(false);
          toggleCustMap(false);
          toggleCustSecLocation(false);
          var prev = document.getElementById('custPhotoPreview');
          if (prev) { prev.src = ''; prev.style.display = 'none'; }
          var ph = document.getElementById('custPhotoPlaceholder');
          if (ph) ph.style.display = 'inline-flex';
          var act = document.getElementById('custPhotoActionsWrap');
          if (act) act.style.display = 'none';
          state.selectedPhotoBase64 = '';
          state.selectedPhotoName = '';
          state.selectedPhotoType = '';
          state.rawSelectedPhotoDataUrl = '';
          discardCustomerDraft(true);
          toggleCategoryFields(document.getElementById('custCategory').value);
          closeAddCustomerModal();

          if (isLeadMarked) {
            switchAdminTab('leads');
            loadAdminLeads(true);
          } else {
            switchAdminTab('records');
            loadAdminRecords();
          }

          setTimeout(function() {
            var recCard = document.getElementById('adminTabRecords');
            if (recCard) {
              recCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 150);
        }
      }, function(err) {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Customer';
        showToast('Error saving customer: ' + (err.message || err), '❌');
      });
    }

    /* Admin Active Records Filter & Search System */
    var adminFilterState = {
      onlyPhoto: false,
      onlyMap: false
    };

    function renderAdminTableSkeletons(rowCount) {
      var count = rowCount || 6;
      var html = '';
      for (var i = 0; i < count; i++) {
        html += '<tr class="skeleton-tr">' +
          '<td style="text-align:center;"><div class="skeleton-shimmer" style="width:22px; height:18px; margin:0 auto; border-radius:4px;"></div></td>' +
          '<td>' +
            '<div class="skeleton-shimmer" style="width:80%; height:15px; margin-bottom:4px; border-radius:4px;"></div>' +
          '</td>' +
          '<td>' +
            '<div class="skeleton-shimmer" style="width:85px; height:14px; border-radius:4px;"></div>' +
          '</td>' +
          '<td>' +
            '<div class="skeleton-shimmer" style="width:78px; height:18px; border-radius:10px;"></div>' +
          '</td>' +
          '<td>' +
            '<div class="skeleton-shimmer" style="width:90px; height:20px; border-radius:4px;"></div>' +
          '</td>' +
          '<td>' +
            '<div class="skeleton-shimmer" style="width:90%; height:14px; border-radius:4px;"></div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<div class="skeleton-shimmer" style="width:50px; height:20px; margin:0 auto; border-radius:4px;"></div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<div class="skeleton-shimmer" style="width:44px; height:20px; margin:0 auto; border-radius:12px;"></div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<div class="skeleton-shimmer" style="width:75px; height:20px; margin:0 auto; border-radius:12px;"></div>' +
          '</td>' +
          '<td style="text-align:center;">' +
            '<div class="skeleton-shimmer" style="width:54px; height:24px; margin:0 auto; border-radius:6px;"></div>' +
          '</td>' +
        '</tr>';
      }
      return html;
    }

    /* =========================================================================
       MODERN INTELLIGENT CUSTOMER UI/UX FORMATTERS & KPI LOGIC
       ========================================================================= */
    function renderCustomerAvatar(name) {
      var initials = '';
      if (name && name.trim()) {
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
          initials = (parts[0][0] || '') + (parts[1][0] || '');
        } else {
          initials = name.trim().slice(0, 2);
        }
      }
      if (!initials) initials = 'CU';
      initials = initials.toUpperCase();

      var gradients = [
        'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'linear-gradient(135deg, #ec4899 0%, #db2777 100%)'
      ];
      var hash = 0;
      for (var i = 0; i < (name || '').length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
      }
      var bg = gradients[Math.abs(hash) % gradients.length];
      return '<div class="cust-avatar-circle" style="background:' + bg + ';" title="' + escapeHtml(name || '') + '">' +
        escapeHtml(initials) +
      '</div>';
    }

    function renderModernNumberPlate(plateText) {
      if (!plateText || !plateText.trim()) return '<span class="cell-empty-dash">—</span>';
      var clean = plateText.trim();
      return '<div class="hsrp-plate-wrap">' +
        '<div class="hsrp-plate" title="' + escapeHtml(clean) + '">' +
          '<div class="hsrp-ind-strip"><span class="hsrp-ind-code">IND</span></div>' +
          '<span class="hsrp-number">' + escapeHtml(clean) + '</span>' +
        '</div>' +
      '</div>';
    }

    function renderModernPackageBadge(pkg) {
      if (!pkg || !pkg.trim()) return '';
      var p = pkg.trim();
      var pUpper = p.toUpperCase();
      var badgeClass = 'pkg-badge-default';
      if (pUpper.indexOf('GOLD') !== -1) badgeClass = 'pkg-badge-gold';
      else if (pUpper.indexOf('PLATINUM') !== -1) badgeClass = 'pkg-badge-platinum';
      else if (pUpper.indexOf('SILVER') !== -1) badgeClass = 'pkg-badge-silver';
      return '<span class="package-pill-badge ' + badgeClass + '">' + escapeHtml(p) + '</span>';
    }

    function isLocationLinkOnly(text) {
      if (!text) return false;
      var t = text.trim().toLowerCase();
      return t === 'location via google maps link' ||
             t.indexOf('maps.google') !== -1 ||
             t.indexOf('goo.gl') !== -1 ||
             t.indexOf('http://') === 0 ||
             t.indexOf('https://') === 0;
    }

    function updateAdminKpiMetrics() {
      var records = state.adminRecords || [];
      var total = records.length;
      var daily = 0;
      var wash = 0;
      var solar = 0;
      var unassigned = 0;

      records.forEach(function(r) {
        var cat = r.serviceCategory || (r.sheetName === 'Daily Clean' ? 'Daily Car Cleaning' : 'Car Washing');
        if (cat === 'Daily Car Cleaning') daily++;
        else if (cat === 'Car Washing') wash++;
        else if (cat === 'Solar Panel Cleaning') solar++;

        var stf = (r.staffName || '').trim().toLowerCase();
        if (!stf || stf === 'none' || stf === 'unassigned') unassigned++;
      });

      var elTotal = document.getElementById('kpiCountTotal');
      var elDaily = document.getElementById('kpiCountDaily');
      var elWash = document.getElementById('kpiCountWash');
      var elSolar = document.getElementById('kpiCountSolar');
      var elUnassigned = document.getElementById('kpiCountUnassigned');

      if (elTotal) elTotal.textContent = total;
      if (elDaily) elDaily.textContent = daily;
      if (elWash) elWash.textContent = wash;
      if (elSolar) elSolar.textContent = solar;
      if (elUnassigned) elUnassigned.textContent = unassigned;
    }

    function setKpiCategoryFilter(cat) {
      var catEl = document.getElementById('filterAdminCategory');
      var staffEl = document.getElementById('filterAdminStaff');
      if (catEl) catEl.value = cat;
      if (staffEl) staffEl.value = 'all';
      filterAdminRecords();
    }
    window.setKpiCategoryFilter = setKpiCategoryFilter;

    function setKpiStaffFilter(val) {
      var catEl = document.getElementById('filterAdminCategory');
      var staffEl = document.getElementById('filterAdminStaff');
      if (catEl) catEl.value = 'all';
      if (staffEl) staffEl.value = val;
      filterAdminRecords();
    }
    window.setKpiStaffFilter = setKpiStaffFilter;

    // Keyboard shortcut / for search focus
    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName)) {
        var searchEl = document.getElementById('adminRecordSearch');
        var tab = document.getElementById('adminTabRecords');
        if (searchEl && tab && tab.style.display !== 'none' && !tab.hasAttribute('hidden')) {
          e.preventDefault();
          searchEl.focus();
          searchEl.select();
        }
      }
    });

    function loadAdminRecords(forceRefresh) {
      var tbody = document.getElementById('adminRecordsTableBody');
      if (tbody) tbody.innerHTML = renderAdminTableSkeletons(6);

      apiCall('getAllCustomers', { forceRefresh: !!forceRefresh }, function(res) {
        var records = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        var isLive = res && res.isLive !== undefined ? res.isLive : true;

        state.adminRecords = records || [];
        updateAdminKpiMetrics();

        /* Update badge counter in tab */
        var recCountBadge = document.getElementById('tabRecordsCount');
        if (recCountBadge) recCountBadge.textContent = state.adminRecords.length;

        /* Auto-refresh leads count badge in tab */
        if (typeof refreshLeadsBadgeCount === 'function') {
          refreshLeadsBadgeCount();
        }

        /* Update Data Source Indicator */
        var srcBadge = document.getElementById('adminRecordsSourceBadge');
        if (srcBadge) {
          if (isLive) {
            srcBadge.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; background:rgba(16,185,129,0.12); color:#059669;"><span style="color:#10b981;">●</span> Neon PostgreSQL</span>';
          } else {
            srcBadge.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; background:rgba(245,158,11,0.14); color:#d97706;"><span>⚠️</span> Local Cache</span>';
          }
        }

        /* Populate staff dropdown in filters */
        populateStaffFilterDropdown();

        /* Run filter & render */
        filterAdminRecords();
      }, function(err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 28px; color:var(--danger-red);">Load failed: ' + escapeHtml(err.message || err) + '<br><button type="button" class="btn-primary-smart" style="margin-top:12px; padding:6px 14px; font-size:12px;" onclick="loadAdminRecords()">🔄 Try Again</button></td></tr>';
      });
    }

    function populateStaffFilterDropdown() {
      var sel = document.getElementById('filterAdminStaff');
      if (!sel) return;
      var currentVal = sel.value;
      var html = '<option value="all">All Staff</option>';
      html += '<option value="none">⚠️ Unassigned (None)</option>';

      var uniqueStaff = {};
      (state.staffList || []).forEach(function(s) {
        if (s.name && s.name.trim()) uniqueStaff[s.name.trim()] = true;
      });
      (state.adminRecords || []).forEach(function(r) {
        if (r.staffName && r.staffName.trim() && r.staffName.trim().toLowerCase() !== 'none' && r.staffName.trim().toLowerCase() !== 'unassigned') {
          uniqueStaff[r.staffName.trim()] = true;
        }
      });

      Object.keys(uniqueStaff).sort().forEach(function(name) {
        html += '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
      });

      sel.innerHTML = html;
      sel.value = currentVal;
      if (!sel.value) sel.value = 'all';
    }

    var adminSearchDebounceTimer = null;
    function handleAdminSearchInput() {
      clearTimeout(adminSearchDebounceTimer);
      adminSearchDebounceTimer = setTimeout(function() {
        var searchInput = document.getElementById('adminRecordSearch');
        var clearBtn = document.getElementById('btnAdminSearchClear');
        var val = searchInput ? searchInput.value : '';
        if (clearBtn) clearBtn.style.display = val.trim() ? 'inline-flex' : 'none';
        filterAdminRecords();
      }, 120);
    }

    function clearAdminSearch() {
      var searchInput = document.getElementById('adminRecordSearch');
      var clearBtn = document.getElementById('btnAdminSearchClear');
      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      filterAdminRecords();
    }

    function toggleQuickFilter(type) {
      if (type === 'photo') {
        adminFilterState.onlyPhoto = !adminFilterState.onlyPhoto;
        var btn = document.getElementById('toggleFilterPhoto');
        if (btn) btn.classList.toggle('active', adminFilterState.onlyPhoto);
      } else if (type === 'map') {
        adminFilterState.onlyMap = !adminFilterState.onlyMap;
        var btnMap = document.getElementById('toggleFilterMap');
        if (btnMap) btnMap.classList.toggle('active', adminFilterState.onlyMap);
      }
      filterAdminRecords();
    }

    function resetAllAdminFilters() {
      var searchInput = document.getElementById('adminRecordSearch');
      var clearBtn = document.getElementById('btnAdminSearchClear');
      var catSel = document.getElementById('filterAdminCategory') || document.getElementById('filterAdminSheet');
      var staffSel = document.getElementById('filterAdminStaff');
      var statusSel = document.getElementById('filterAdminStatus');
      var btnPhoto = document.getElementById('toggleFilterPhoto');
      var btnMap = document.getElementById('toggleFilterMap');

      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (catSel) catSel.value = 'all';
      if (staffSel) staffSel.value = 'all';
      if (statusSel) statusSel.value = 'all';

      adminFilterState.onlyPhoto = false;
      adminFilterState.onlyMap = false;
      if (btnPhoto) btnPhoto.classList.remove('active');
      if (btnMap) btnMap.classList.remove('active');

      filterAdminRecords();
    }

    function filterAdminRecords() {
      if (!state.adminRecords) return;
      if (typeof adminPagination !== 'undefined') adminPagination.page = 1;

      var searchEl = document.getElementById('adminRecordSearch');
      var catEl = document.getElementById('filterAdminCategory') || document.getElementById('filterAdminSheet');
      var staffEl = document.getElementById('filterAdminStaff');
      var statusEl = document.getElementById('filterAdminStatus');

      var q = (searchEl ? searchEl.value : '').trim().toLowerCase();
      var category = catEl ? catEl.value : 'all';
      var staff = staffEl ? staffEl.value : 'all';
      var status = statusEl ? statusEl.value : 'all';
      var onlyPhoto = adminFilterState.onlyPhoto;
      var onlyMap = adminFilterState.onlyMap;

      var isFiltered = (q !== '' || category !== 'all' || staff !== 'all' || status !== 'all' || onlyPhoto || onlyMap);
      var notice = document.getElementById('filterActiveNotice');
      if (notice) notice.style.display = isFiltered ? 'block' : 'none';

      var filtered = state.adminRecords.map(function(r, idx) {
        r._origIndex = idx;
        return r;
      }).filter(function(r) {
        /* Category filter */
        if (category !== 'all') {
          var rCat = r.serviceCategory || (r.sheetName === 'Daily Clean' ? 'Daily Car Cleaning' : 'Car Washing');
          if (rCat !== category) return false;
        }

        /* Staff assignment filter */
        if (staff === 'none') {
          if (r.staffName && r.staffName.trim() && r.staffName.trim().toLowerCase() !== 'none' && r.staffName.trim().toLowerCase() !== 'unassigned') {
            return false;
          }
        } else if (staff !== 'all') {
          if (!r.staffName || r.staffName.trim().toLowerCase() !== staff.trim().toLowerCase()) return false;
        }

        /* Active status filter */
        if (status !== 'all') {
          var act = (r.active || 'Yes').toLowerCase() === 'yes' ? 'yes' : 'no';
          if (act !== status) return false;
        }

        /* Photo toggle */
        if (onlyPhoto && (!r.photoUrl || !r.photoUrl.trim())) return false;

        /* Map toggle */
        if (onlyMap && (!r.googleMapsUrl || !r.googleMapsUrl.trim())) return false;

        /* Search text matching - Bilingual Phonetic Cross-Search */
        if (q) {
          if (!recordMatchesBilingualSearch(r, q)) return false;
        }

        return true;
      });

      var filteredCountEl = document.getElementById('filteredRecordsCount');
      var totalCountEl = document.getElementById('totalRecordsCount');
      if (filteredCountEl) filteredCountEl.textContent = filtered.length;
      if (totalCountEl) totalCountEl.textContent = state.adminRecords.length;

      var tileAll = document.getElementById('kpiTileAll');
      var tileDaily = document.getElementById('kpiTileDaily');
      var tileWash = document.getElementById('kpiTileWash');
      var tileSolar = document.getElementById('kpiTileSolar');
      var tileUnassigned = document.getElementById('kpiTileUnassigned');

      if (tileAll) tileAll.classList.toggle('active', category === 'all' && staff === 'all');
      if (tileDaily) tileDaily.classList.toggle('active', category === 'Daily Car Cleaning' && staff === 'all');
      if (tileWash) tileWash.classList.toggle('active', category === 'Car Washing' && staff === 'all');
      if (tileSolar) tileSolar.classList.toggle('active', category === 'Solar Panel Cleaning' && staff === 'all');
      if (tileUnassigned) tileUnassigned.classList.toggle('active', staff === 'none');

      state.lastFilteredRecords = filtered;
      renderAdminRecordsTable(filtered);
    }


    /* =========================================================================
       LEADS MANAGEMENT CONTROLLER (CWP CRM & PROSPECTS ENGINE)
       ========================================================================= */

    function refreshLeadsBadgeCount() {
      apiCall('getLeads', {}, function(res) {
        var leads = Array.isArray(res) ? res : (res && res.leads ? res.leads : []);
        var badge = document.getElementById('tabLeadsCount');
        if (badge) badge.textContent = leads.length;
      }, function() {});
    }

    function handleCustIsLeadToggle(checked) {
      var btn = document.getElementById('btnSaveCust');
      if (!btn) return;
      if (checked) {
        btn.innerHTML = '<span>🎯</span> Save as Lead';
        btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      } else {
        btn.innerHTML = '<span>💾</span> Save Customer';
        btn.style.background = '';
      }
    }

    function openAddLeadModal(triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl);
      var form = document.getElementById('addLeadForm');
      if (form) form.reset();
      var idEl = document.getElementById('leadEditId');
      if (idEl) idEl.value = '';
      var titleEl = document.getElementById('addLeadModalTitle');
      if (titleEl) titleEl.textContent = 'Add New Lead';
      var subEl = document.getElementById('addLeadModalSubtitle');
      if (subEl) subEl.textContent = 'Capture prospect inquiry, vehicle info & initial remarks';
      var btn = document.getElementById('btnSaveLead');
      if (btn) btn.innerHTML = '<span>💾</span> Save Lead';
      var stageEl = document.getElementById('leadStage');
      if (stageEl) stageEl.value = 'open';
      removeLeadPhoto();
      var modal = document.getElementById('addLeadModal');
      if (modal) modal.style.display = 'flex';
      setTimeout(function() {
        var nameEl = document.getElementById('leadName');
        if (nameEl) nameEl.focus();
        else if (typeof trapFocus === 'function') trapFocus(modal);
      }, 100);
    }

    function openEditLeadModal(leadId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      if (!lead) {
        showToast('Lead record not found.', '⚠️');
        return;
      }

      var form = document.getElementById('addLeadForm');
      if (form) form.reset();

      var idEl = document.getElementById('leadEditId');
      if (idEl) idEl.value = lead.id || lead.customerCode || '';

      var titleEl = document.getElementById('addLeadModalTitle');
      if (titleEl) titleEl.textContent = 'Edit Lead Details';
      var subEl = document.getElementById('addLeadModalSubtitle');
      if (subEl) subEl.textContent = 'Update prospect contact, vehicle info & inquiry details';
      var btn = document.getElementById('btnSaveLead');
      if (btn) btn.innerHTML = '<span>💾</span> Update Lead';

      var nameEl = document.getElementById('leadName');
      if (nameEl) nameEl.value = lead.customerName || lead.name || '';
      var nameHiEl = document.getElementById('leadNameHi');
      if (nameHiEl) nameHiEl.value = lead.nameHi || lead.name_hi || '';

      var rawPhone = lead.customerNumber || lead.phone || '';
      var phoneInput = document.getElementById('leadPhone');
      if (phoneInput) {
        if (typeof setPhoneInputValue === 'function') {
          setPhoneInputValue(phoneInput, rawPhone);
        } else {
          phoneInput.value = rawPhone;
        }
      }

      var addrEl = document.getElementById('leadAddress');
      if (addrEl) addrEl.value = lead.address || '';
      var addrHiEl = document.getElementById('leadAddressHi');
      if (addrHiEl) addrHiEl.value = lead.addressHi || lead.address_hi || '';
      var mapsEl = document.getElementById('leadMapsUrl');
      if (mapsEl) mapsEl.value = lead.googleMapsUrl || lead.mapsUrl || '';

      var catSelect = document.getElementById('leadCategory');
      if (catSelect) {
        var cat = lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning';
        if (['Daily Car Cleaning', 'Car Washing', 'Solar Panel Cleaning', 'Interior Detailing', 'Exterior Detailing', 'Other'].indexOf(cat) !== -1) {
          catSelect.value = cat;
        } else {
          catSelect.value = 'Daily Car Cleaning';
        }
      }

      var vehEl = document.getElementById('leadVehicle');
      if (vehEl) vehEl.value = lead.vehicle || lead.vehicleDetails || '';
      var makeEl = document.getElementById('leadCarMake');
      if (makeEl) makeEl.value = lead.carMake || lead.car_make || '';
      var colorEl = document.getElementById('leadCarColor');
      if (colorEl) colorEl.value = lead.carColor || lead.car_color || '';

      var stageEl = document.getElementById('leadStage');
      if (stageEl) stageEl.value = (lead.leadStatus || 'open').toLowerCase();

      var notesEl = document.getElementById('leadNotes');
      if (notesEl) notesEl.value = lead.leadNotes || lead.notes || '';

      var photoUrl = lead.photoUrl || '';
      if (photoUrl) {
        state.selectedLeadPhotoBase64 = photoUrl;
        var prev = document.getElementById('leadPhotoPreview');
        if (prev) {
          prev.src = photoUrl;
          prev.style.display = 'block';
        }
        var ph = document.getElementById('leadPhotoPlaceholder');
        if (ph) ph.style.display = 'none';
        var act = document.getElementById('leadPhotoActionsWrap');
        if (act) act.style.display = 'inline-flex';
      } else {
        removeLeadPhoto();
      }

      var modal = document.getElementById('addLeadModal');
      if (modal) modal.style.display = 'flex';
      setTimeout(function() {
        if (nameEl) nameEl.focus();
        else if (typeof trapFocus === 'function') trapFocus(modal);
      }, 100);
    }

    function closeAddLeadModal() {
      var modal = document.getElementById('addLeadModal');
      if (modal) modal.style.display = 'none';
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function closeEditLeadModal() {
      closeAddLeadModal();
    }

    function triggerLeadPhotoSelect() {
      var f = document.getElementById('leadPhotoFile');
      if (f) { f.value = ''; f.click(); }
    }

    function handleLeadPhotoSelect(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;

      state.selectedLeadPhotoName = file.name;
      state.selectedLeadPhotoType = file.type || 'image/jpeg';

      var reader = new FileReader();
      reader.onload = function(evt) {
        var dataUrl = evt.target.result;
        state.rawSelectedLeadPhotoDataUrl = dataUrl;
        state.selectedLeadPhotoBase64 = dataUrl;
        var prev = document.getElementById('leadPhotoPreview');
        if (prev) {
          prev.src = dataUrl;
          prev.style.display = 'block';
        }
        var ph = document.getElementById('leadPhotoPlaceholder');
        if (ph) ph.style.display = 'none';
        var act = document.getElementById('leadPhotoActionsWrap');
        if (act) act.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    }

    function removeLeadPhoto(e) {
      if (e) e.stopPropagation();
      state.selectedLeadPhotoBase64 = '';
      state.selectedLeadPhotoName = '';
      state.selectedLeadPhotoType = '';
      state.rawSelectedLeadPhotoDataUrl = '';
      var f = document.getElementById('leadPhotoFile');
      if (f) f.value = '';
      var prev = document.getElementById('leadPhotoPreview');
      if (prev) { prev.src = ''; prev.style.display = 'none'; }
      var ph = document.getElementById('leadPhotoPlaceholder');
      if (ph) ph.style.display = 'inline-flex';
      var act = document.getElementById('leadPhotoActionsWrap');
      if (act) act.style.display = 'none';
    }

    function openExistingLeadPhotoCropper() {
      if (state.selectedLeadPhotoBase64) {
        openPhotoLightbox(state.selectedLeadPhotoBase64);
      }
    }

    function detectLeadGpsLocation() {
      if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', '⚠️');
        return;
      }
      showToast('Detecting current GPS location...', '📍');
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude.toFixed(6);
        var lng = pos.coords.longitude.toFixed(6);
        var mapsUrl = 'https://maps.google.com/?q=' + lat + ',' + lng;
        var input = document.getElementById('leadMapsUrl');
        if (input) {
          input.value = mapsUrl;
          showToast('GPS location captured: ' + lat + ', ' + lng, '✓');
        }
      }, function(err) {
        showToast('GPS error: ' + (err.message || 'Permission denied'), '❌');
      }, { enableHighAccuracy: true, timeout: 10000 });
    }

    function setLeadQuickNote(txt) {
      var el = document.getElementById('leadNotes');
      if (!el) return;
      var cur = el.value.trim();
      el.value = cur ? cur + '\n' + txt : txt;
    }

    function setLeadModalNote(txt) {
      var el = document.getElementById('newLeadNoteText');
      if (!el) return;
      var cur = el.value.trim();
      el.value = cur ? cur + ' ' + txt : txt;
    }

    function handleLeadSubmit(e) {
      e.preventDefault();
      var btn = document.getElementById('btnSaveLead');
      var editIdEl = document.getElementById('leadEditId');
      var leadEditId = editIdEl ? editIdEl.value.trim() : '';

      var nameVal = (document.getElementById('leadName').value || '').trim();
      if (!nameVal) {
        alert('Please enter the customer / prospect name.');
        var nameEl = document.getElementById('leadName');
        if (nameEl) nameEl.focus();
        return;
      }

      var phoneEl = document.getElementById('leadPhone');
      var rawPhone = phoneEl ? phoneEl.value.trim() : '';
      var normPhone = '';
      if (rawPhone) {
        normPhone = normalizeIndianMobile(rawPhone);
        if (!isValidIndianMobile(normPhone)) {
          alert('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (or leave blank if unknown).');
          if (phoneEl) phoneEl.focus();
          return;
        }
      }

      if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="cwp-spinner"></span> ' + (leadEditId ? 'Updating lead...' : 'Saving lead...');
      }

      var nameHiVal = document.getElementById('leadNameHi') ? document.getElementById('leadNameHi').value.trim() : '';
      var addrVal = (document.getElementById('leadAddress').value || '').trim();
      var addrHiVal = document.getElementById('leadAddressHi') ? document.getElementById('leadAddressHi').value.trim() : '';
      var mapsVal = (document.getElementById('leadMapsUrl').value || '').trim();
      var vehVal = (document.getElementById('leadVehicle').value || '').trim();
      var leadCarMakeVal = (document.getElementById('leadCarMake') ? document.getElementById('leadCarMake').value : '').trim();
      var leadCarColorVal = (document.getElementById('leadCarColor') ? document.getElementById('leadCarColor').value : '').trim();
      var catVal = (document.getElementById('leadCategory').value || 'Daily Car Cleaning').trim();
      var notesVal = (document.getElementById('leadNotes').value || '').trim();
      var stageEl = document.getElementById('leadStage');
      var stageVal = stageEl ? stageEl.value : 'open';

      var photoPayload = state.selectedLeadPhotoBase64 ? {
        base64: state.selectedLeadPhotoBase64,
        mimeType: state.selectedLeadPhotoType || 'image/jpeg',
        fileName: state.selectedLeadPhotoName || 'lead_car.jpg'
      } : null;

      var leadData = {
        id: leadEditId || undefined,
        customerName: nameVal,
        name: nameVal,
        nameHi: nameHiVal,
        name_hi: nameHiVal,
        customerNumber: normPhone,
        phone: normPhone,
        address: addrVal,
        addressHi: addrHiVal,
        address_hi: addrHiVal,
        googleMapsUrl: mapsVal,
        mapsUrl: mapsVal,
        vehicle: vehVal,
        vehicleDetails: vehVal,
        carMake: leadCarMakeVal,
        car_make: leadCarMakeVal,
        carColor: leadCarColorVal,
        car_color: leadCarColorVal,
        serviceCategory: catVal,
        serviceType: catVal,
        interestedService: catVal,
        isLead: true,
        tag: 'lead',
        leadStatus: stageVal,
        stage: stageVal,
        notes: notesVal,
        leadNotes: notesVal,
        photoFile: photoPayload,
        photoData: photoPayload
      };

      if (leadEditId) {
        apiCall('updateLead', { leadId: leadEditId, leadData: leadData }, function(res) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>💾</span> Update Lead';
          }
          if (res && res.error) {
            showToast('Error: ' + res.error, '❌');
          } else {
            showToast('Lead updated successfully!', '✅');
            var existingLead = (state.leads || []).find(function(l) {
              return (l.id && l.id === leadEditId) || (l.customerCode && l.customerCode === leadEditId);
            });
            if (existingLead) {
              existingLead.customerName = nameVal;
              existingLead.name = nameVal;
              existingLead.nameHi = nameHiVal;
              existingLead.name_hi = nameHiVal;
              existingLead.customerNumber = normPhone;
              existingLead.phone = normPhone;
              existingLead.address = addrVal;
              existingLead.addressHi = addrHiVal;
              existingLead.address_hi = addrHiVal;
              existingLead.googleMapsUrl = mapsVal;
              existingLead.mapsUrl = mapsVal;
              existingLead.vehicle = vehVal;
              existingLead.vehicleDetails = vehVal;
              existingLead.carMake = leadCarMakeVal;
              existingLead.car_make = leadCarMakeVal;
              existingLead.carColor = leadCarColorVal;
              existingLead.car_color = leadCarColorVal;
              existingLead.serviceCategory = catVal;
              existingLead.interestedService = catVal;
              existingLead.leadStatus = stageVal;
              existingLead.notes = notesVal;
              existingLead.leadNotes = notesVal;
              if (res && res.photoUrl) existingLead.photoUrl = res.photoUrl;
            }
            document.getElementById('addLeadForm').reset();
            if (editIdEl) editIdEl.value = '';
            removeLeadPhoto();
            closeAddLeadModal();

            updateLeadsKpi();
            var filtered = applyLeadsFilters();
            renderAdminLeadsList(filtered);
          }
        }, function(err) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>💾</span> Update Lead';
          }
          showToast('Error: ' + (err.message || err), '❌');
        });
        return;
      }

      apiCall('saveLead', { customerData: leadData }, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Lead';
        }
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          showToast('Lead captured successfully and added to Leads section!', '🎯');
          document.getElementById('addLeadForm').reset();
          removeLeadPhoto();
          closeAddLeadModal();

          switchAdminTab('leads');
          loadAdminLeads(true);
        }
      }, function(err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Lead';
        }
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function switchLeadsViewMode(mode) {
      if (mode !== 'table' && mode !== 'kanban') mode = 'table';
      state.leadsViewMode = mode;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cwp_leads_view_mode', mode);
        }
      } catch (e) {}

      var btnTable = document.getElementById('btnLeadsViewTable');
      var btnKanban = document.getElementById('btnLeadsViewKanban');
      if (btnTable) {
        if (mode === 'table') btnTable.classList.add('active');
        else btnTable.classList.remove('active');
      }
      if (btnKanban) {
        if (mode === 'kanban') btnKanban.classList.add('active');
        else btnKanban.classList.remove('active');
      }

      var filtered = applyLeadsFilters();
      renderAdminLeadsList(filtered);
    }

    function setLeadCategoryFilter(cat) {
      state.leadsCategoryFilter = cat || 'all';
      var chips = [
        { id: 'chipLeadCatAll', val: 'all' },
        { id: 'chipLeadCatDC', val: 'Daily Car Cleaning' },
        { id: 'chipLeadCatSolar', val: 'Solar Panel Cleaning' },
        { id: 'chipLeadCatWash', val: 'Car Washing' }
      ];
      chips.forEach(function(c) {
        var el = document.getElementById(c.id);
        if (el) {
          if (c.val === state.leadsCategoryFilter) el.classList.add('active');
          else el.classList.remove('active');
        }
      });
      var filtered = applyLeadsFilters();
      updateLeadsKpi();
      renderAdminLeadsList(filtered);
    }

    function setLeadStageFilter(stage) {
      state.leadsStageFilter = stage || 'all';
      var cards = [
        { id: 'cardFunnelAll', val: 'all' },
        { id: 'cardFunnelNew', val: 'open' },
        { id: 'cardFunnelFollowUp', val: 'follow_up' },
        { id: 'cardFunnelReady', val: 'ready' }
      ];
      cards.forEach(function(c) {
        var el = document.getElementById(c.id);
        if (el) {
          if (c.val === state.leadsStageFilter) el.classList.add('active');
          else el.classList.remove('active');
        }
      });
      var filtered = applyLeadsFilters();
      updateLeadsKpi();
      renderAdminLeadsList(filtered);
    }

    function applyLeadsFilters() {
      var all = state.leads || [];
      var q = (state.leadsSearchQuery || '').trim().toLowerCase();
      var cat = state.leadsCategoryFilter || 'all';
      var stage = state.leadsStageFilter || 'all';

      var filtered = all.filter(function(l) {
        if (q && !recordMatchesBilingualSearch(l, q)) {
          return false;
        }
        if (cat !== 'all') {
          var lCat = l.interestedService || l.serviceCategory || '';
          if (lCat !== cat) return false;
        }
        if (stage !== 'all') {
          var lStage = (l.leadStatus || 'open').toLowerCase();
          if (lStage !== stage) return false;
        }
        return true;
      });

      state.lastFilteredLeads = filtered;
      return filtered;
    }

    function shiftLeadStage(leadId, direction) {
      var stages = ['open', 'follow_up', 'quoted', 'ready'];
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      if (!lead) return;
      var curStage = (lead.leadStatus || 'open').toLowerCase();
      var idx = stages.indexOf(curStage);
      if (idx === -1) idx = 0;

      var nextIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (nextIdx >= 0 && nextIdx < stages.length) {
        updateLeadStage(leadId, stages[nextIdx]);
      }
    }

    function handleLeadDragStart(e, leadId) {
      if (!e) return;
      state.draggedLeadId = leadId;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', leadId);
        e.dataTransfer.effectAllowed = 'move';
      }
      var card = document.getElementById('leadCard_' + leadId);
      if (card) {
        setTimeout(function() {
          card.classList.add('dragging');
        }, 10);
      }
    }

    function handleLeadDragEnd(e) {
      state.draggedLeadId = null;
      var cards = document.querySelectorAll('.compact-lead-card.dragging');
      cards.forEach(function(c) { c.classList.remove('dragging'); });
      var cols = document.querySelectorAll('.leads-kanban-col.kanban-col-dragover');
      cols.forEach(function(col) { col.classList.remove('kanban-col-dragover'); });
    }

    function handleLeadDragOver(e) {
      if (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }
    }

    function handleLeadDragEnter(e, targetStage) {
      if (e) e.preventDefault();
      var col = document.querySelector('.leads-kanban-col[data-stage="' + targetStage + '"]');
      if (col) col.classList.add('kanban-col-dragover');
    }

    function handleLeadDragLeave(e) {
      if (!e) return;
      var col = e.currentTarget;
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove('kanban-col-dragover');
      }
    }

    function handleLeadDrop(e, targetStage) {
      if (e) e.preventDefault();
      var cols = document.querySelectorAll('.leads-kanban-col.kanban-col-dragover');
      cols.forEach(function(col) { col.classList.remove('kanban-col-dragover'); });

      var leadId = (e && e.dataTransfer && e.dataTransfer.getData('text/plain')) || state.draggedLeadId;
      if (!leadId || !targetStage) return;

      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      if (!lead) return;

      var curStage = (lead.leadStatus || 'open').toLowerCase();
      if (curStage !== targetStage) {
        updateLeadStage(leadId, targetStage);
      }
    }

    function updateLeadStage(leadId, newStage) {
      if (!leadId || !newStage) return;
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      var oldStage = lead ? (lead.leadStatus || 'open') : 'open';
      if (lead) lead.leadStatus = newStage;

      updateLeadsKpi();
      var filtered = applyLeadsFilters();
      renderAdminLeadsList(filtered);

      var adminToken = (typeof getAdminToken === 'function') ? getAdminToken() : '';
      apiCall('updateLeadStage', { leadId: leadId, stage: newStage, adminToken: adminToken }, function(res) {
        if (res && res.error) {
          showToast('Failed to update stage: ' + res.error, '❌');
          if (lead) lead.leadStatus = oldStage;
          updateLeadsKpi();
          renderAdminLeadsList(applyLeadsFilters());
        } else {
          var stageLabels = {
            open: 'New Inquiries',
            follow_up: 'In Follow-Up',
            quoted: 'Discussion / Quoted',
            ready: 'Ready to Convert'
          };
          showToast('Lead moved to ' + (stageLabels[newStage] || newStage), '✓');
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
        if (lead) lead.leadStatus = oldStage;
        updateLeadsKpi();
        renderAdminLeadsList(applyLeadsFilters());
      });
    }

    function loadAdminLeads(forceRefresh) {
      var container = document.getElementById('leadsListContainer');
      if (container) {
        container.innerHTML = '<div class="skeleton-feed" style="padding: 24px; text-align: center; color: var(--text-muted);"><span class="cwp-spinner"></span> Loading leads...</div>';
      }

      var currentMode = state.leadsViewMode || 'table';
      var btnTable = document.getElementById('btnLeadsViewTable');
      var btnKanban = document.getElementById('btnLeadsViewKanban');
      if (btnTable) {
        if (currentMode === 'table') btnTable.classList.add('active');
        else btnTable.classList.remove('active');
      }
      if (btnKanban) {
        if (currentMode === 'kanban') btnKanban.classList.add('active');
        else btnKanban.classList.remove('active');
      }

      apiCall('getLeads', { forceRefresh: !!forceRefresh }, function(res) {
        var leads = Array.isArray(res) ? res : (res && res.leads ? res.leads : []);
        state.leads = leads || [];
        var filtered = applyLeadsFilters();
        updateLeadsKpi();
        renderAdminLeadsList(filtered);
      }, function(err) {
        if (container) {
          container.innerHTML = '<div style="padding: 24px; text-align: center; color: #ef4444;">Failed to load leads: ' + escapeHtml(err.message || err) + '</div>';
        }
      });
    }

    function updateLeadsKpi() {
      var all = state.leads || [];
      var total = all.length;
      var newCount = 0;
      var followUpCount = 0;
      var readyCount = 0;

      all.forEach(function(l) {
        var st = (l.leadStatus || 'open').toLowerCase();
        if (st === 'open') newCount++;
        else if (st === 'follow_up') followUpCount++;
        else if (st === 'ready') readyCount++;
      });

      var filtered = state.lastFilteredLeads ? state.lastFilteredLeads.length : total;

      var tabBadge = document.getElementById('tabLeadsCount');
      if (tabBadge) tabBadge.textContent = total;
      var totBadge = document.getElementById('leadsTotalCount');
      if (totBadge) totBadge.textContent = total;
      var filtBadge = document.getElementById('leadsFilteredCount');
      if (filtBadge) filtBadge.textContent = filtered;
      var pendBadge = document.getElementById('leadsPendingBadge');
      if (pendBadge) pendBadge.textContent = total;

      var kpiTotal = document.getElementById('leadsKpiTotal');
      if (kpiTotal) kpiTotal.textContent = total;
      var kpiNew = document.getElementById('leadsKpiNew');
      if (kpiNew) kpiNew.textContent = newCount;
      var kpiFollowUp = document.getElementById('leadsKpiFollowUp');
      if (kpiFollowUp) kpiFollowUp.textContent = followUpCount;
      var kpiReady = document.getElementById('leadsKpiReady');
      if (kpiReady) kpiReady.textContent = readyCount;
    }

    function renderAdminLeadsList(leads) {
      var container = document.getElementById('leadsListContainer');
      if (!container) return;

      if (!leads || leads.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; width: 100%; padding: 48px 16px; text-align: center; color: var(--text-muted); background: var(--color-surface-card, #ffffff); border-radius: 16px; border: 1px dashed var(--color-border-subtle, #e2e8f0);">' +
          '<div style="font-size: 40px; margin-bottom: 10px;">🎯</div>' +
          '<h3 style="font-size: 16px; font-weight: 700; color: var(--color-text-primary, #0f172a); margin-bottom: 6px;">No active leads match criteria</h3>' +
          '<p style="font-size: 13.5px; color: var(--color-text-secondary, #64748b); margin-bottom: 16px;">Try clearing filters or search keywords, or capture a new lead.</p>' +
          '<button type="button" class="btn-admin-primary" onclick="openAddLeadModal()" style="background: linear-gradient(135deg, #f59e0b, #d97706); border-color: #d97706; margin: 0 auto; display: inline-flex;"><span>✨ Capture New Lead</span></button>' +
          '</div>';
        return;
      }

      if (state.leadsViewMode === 'kanban') {
        renderAdminLeadsKanban(leads);
      } else {
        renderAdminLeadsTable(leads);
      }
    }

    function parseVehicleString(s) {
      if (!s) return { model: '', reg: '' };
      var raw = String(s).trim();
      var regMatch = raw.match(/([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4})/i);
      if (regMatch) {
        var reg = regMatch[1].toUpperCase().replace(/\s+/g, ' ');
        var model = raw.replace(regMatch[0], '').replace(/^[\s\-–—:,|]+|[\s\-–—:,|]+$/g, '').trim();
        return { reg: reg, model: model, display: raw };
      }
      return { reg: raw, model: '', display: raw };
    }

    function renderAdminLeadsTable(leads) {
      var container = document.getElementById('leadsListContainer');
      if (!container) return;

      var html = '<div class="table-responsive leads-table-scroll" style="width: 100%; overflow-x: auto; background: var(--color-surface-card, #ffffff); border-radius: 16px; border: 1px solid var(--color-border-subtle, #e2e8f0); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">';
      html += '<table class="m3-table leads-m3-table" style="width: 100%; border-collapse: separate; border-spacing: 0; min-width: 960px;">';
      html += '<thead><tr style="background: var(--bg-surface-secondary, #f8fafc); border-bottom: 1px solid var(--color-border-subtle, #e2e8f0); text-align: left;">';
      html += '  <th style="padding: 14px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); width: 44px; text-align: center;">#</th>';
      html += '  <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 180px;">Lead & Contact</th>';
      html += '  <th style="padding: 14px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 150px;">Vehicle & Model</th>';
      html += '  <th style="padding: 14px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 140px;">Interested Service</th>';
      html += '  <th style="padding: 14px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 160px;">Location</th>';
      html += '  <th style="padding: 14px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 130px;">Stage</th>';
      html += '  <th style="padding: 14px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 170px;">Remarks / Notes</th>';
      html += '  <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); min-width: 150px; text-align: center;">Actions</th>';
      html += '</tr></thead>';
      html += '<tbody>';

      leads.forEach(function(l, idx) {
        var id = l.id || l.customerCode;
        var name = l.customerName || 'Prospect Lead';
        var nameHi = l.nameHi ? ' (' + l.nameHi + ')' : '';
        var phone = l.customerNumber || l.phone || '';
        var rawVeh = l.vehicle || '';
        var rawAddr = l.address || '';
        var addrHi = l.addressHi ? ' • ' + l.addressHi : '';
        var maps = l.googleMapsUrl || '';
        var photo = l.photoUrl || '';
        var notes = l.leadNotes || l.notes || '';
        var sCategory = l.interestedService || l.serviceCategory || 'Daily Car Cleaning';
        var stage = (l.leadStatus || 'open').toLowerCase();

        var parsedVeh = rawVeh ? (typeof parseVehicleDetails === 'function' ? parseVehicleDetails(rawVeh) : parseVehicleString(rawVeh)) : null;
        var regBadge = (parsedVeh && parsedVeh.reg) ? parsedVeh.reg : (rawVeh || 'No vehicle');
        var modelText = (parsedVeh && parsedVeh.model) ? parsedVeh.model : '';

        var catIcon = '🚗';
        var catBg = 'rgba(37, 99, 235, 0.1)';
        var catColor = '#2563eb';
        if (sCategory.indexOf('Solar') !== -1) {
          catIcon = '☀️';
          catBg = 'rgba(217, 119, 6, 0.12)';
          catColor = '#d97706';
        } else if (sCategory.indexOf('Wash') !== -1) {
          catIcon = '🧼';
          catBg = 'rgba(13, 148, 136, 0.12)';
          catColor = '#0d9488';
        } else if (sCategory.indexOf('Detailing') !== -1) {
          catIcon = '✨';
          catBg = 'rgba(124, 58, 237, 0.12)';
          catColor = '#7c3aed';
        }

        html += '<tr class="leads-table-row" id="leadRow_' + escapeHtml(id) + '" style="border-bottom: 1px solid var(--color-border-subtle, #f1f5f9); transition: background-color 0.15s ease;">';
        
        // Row index
        html += '  <td style="padding: 12px; text-align: center; font-weight: 600; color: var(--color-text-secondary, #64748b); font-size: 13px;">' + (idx + 1) + '</td>';

        // Lead & Contact
        html += '  <td style="padding: 12px 16px;">';
        html += '    <div style="font-weight: 700; color: var(--color-text-primary, #0f172a); font-size: 14px; line-height: 1.3;">' + escapeHtml(name) + '</div>';
        if (nameHi) {
          html += '    <div style="font-size: 12px; color: var(--color-text-secondary, #64748b); margin-top: 1px;">' + escapeHtml(nameHi) + '</div>';
        }
        if (phone) {
          html += '    <div style="margin-top: 5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">';
          html += '      <span style="font-size: 12.5px; font-weight: 600; color: var(--color-text-primary, #1e293b); font-family: monospace;">+91 ' + escapeHtml(phone) + '</span>';
          html += '      <a href="tel:+91' + escapeHtml(phone) + '" class="leads-pill-action pill-call" title="Call Lead">📞 Call</a>';
          html += '      <a href="https://wa.me/91' + escapeHtml(phone) + '?text=Namaste%20' + encodeURIComponent(name) + '%2C%20CWP%20Detailers%20ki%20taraf%20se%20sampark%20kar%20rahe%20hain." target="_blank" rel="noopener" class="leads-pill-action pill-wa" title="WhatsApp Message">💬 WA</a>';
          html += '    </div>';
        } else {
          html += '    <div style="margin-top: 4px; font-size: 12px; color: var(--color-text-muted, #94a3b8); font-style: italic;">No phone added</div>';
        }
        html += '  </td>';

        // Vehicle & Model
        html += '  <td style="padding: 12px 14px;">';
        if (rawVeh) {
          html += '    <div style="display: flex; align-items: center; gap: 8px;">';
          html += '      <span class="cwp-lead-plate-badge">' + escapeHtml(regBadge) + '</span>';
          if (photo) {
            html += '      <img src="' + escapeHtml(photo) + '" class="cwp-lead-photo-thumb" alt="Vehicle photo" onclick="openPhotoLightbox(\'' + escapeHtml(photo) + '\')" title="Click to view photo" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover; cursor: pointer; border: 1px solid var(--color-border-subtle, #e2e8f0);">';
          }
          html += '    </div>';
          if (modelText) {
            html += '    <div style="font-size: 12.5px; font-weight: 500; color: var(--color-text-secondary, #475569); margin-top: 3px;">' + escapeHtml(modelText) + '</div>';
          }
        } else {
          html += '    <span style="font-size: 12px; color: var(--color-text-muted, #94a3b8); font-style: italic;">No vehicle info</span>';
        }
        html += '  </td>';

        // Interested Service
        html += '  <td style="padding: 12px 14px;">';
        html += '    <span class="leads-service-pill" style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: ' + catBg + '; color: ' + catColor + ';">';
        html += '      <span>' + catIcon + '</span><span>' + escapeHtml(sCategory) + '</span>';
        html += '    </span>';
        html += '  </td>';

        // Location
        html += '  <td style="padding: 12px 14px;">';
        if (rawAddr) {
          html += '    <div style="font-size: 12.5px; color: var(--color-text-primary, #1e293b); max-width: 200px; line-height: 1.35;" title="' + escapeHtml(rawAddr + addrHi) + '">' + escapeHtml(rawAddr) + '</div>';
        } else {
          html += '    <div style="font-size: 12px; color: var(--color-text-muted, #94a3b8); font-style: italic;">No address added</div>';
        }
        if (maps) {
          html += '    <div style="margin-top: 3px;"><a href="' + escapeHtml(maps) + '" target="_blank" rel="noopener" style="font-size: 11.5px; font-weight: 600; color: var(--brand-blue, #2563eb); text-decoration: none; display: inline-flex; align-items: center; gap: 3px;">🗺️ Maps ↗</a></div>';
        }
        html += '  </td>';

        // Stage Dropdown
        html += '  <td style="padding: 12px 14px;">';
        html += '    <select class="leads-stage-select" onchange="updateLeadStage(\'' + escapeHtml(id) + '\', this.value)" style="padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--color-border-subtle, #cbd5e1); background: var(--bg-surface, #ffffff); color: var(--color-text-primary, #0f172a); cursor: pointer;">';
        html += '      <option value="open"' + (stage === 'open' ? ' selected' : '') + '>📥 New</option>';
        html += '      <option value="follow_up"' + (stage === 'follow_up' ? ' selected' : '') + '>📞 Follow-Up</option>';
        html += '      <option value="quoted"' + (stage === 'quoted' ? ' selected' : '') + '>💬 Quoted</option>';
        html += '      <option value="ready"' + (stage === 'ready' ? ' selected' : '') + '>🌟 Ready</option>';
        html += '    </select>';
        html += '  </td>';

        // Remarks / Notes
        html += '  <td style="padding: 12px 14px;">';
        html += '    <div class="cwp-lead-notes-box" style="margin: 0; padding: 6px 10px; font-size: 12px; line-height: 1.35; max-width: 220px; max-height: 60px; overflow-y: auto;">';
        html += '      <div style="color: var(--color-text-secondary, #475569);">' + (notes ? escapeHtml(notes) : '<em style="color: var(--color-text-muted, #94a3b8);">No notes yet.</em>') + '</div>';
        html += '    </div>';
        html += '  </td>';

        // Actions
        html += '  <td style="padding: 12px 16px; text-align: center;">';
        html += '    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">';
        html += '      <button type="button" class="btn-convert-hero btn-table-convert" onclick="openConvertLeadModal(\'' + escapeHtml(id) + '\')" title="Confirm customer & assign package/staff" style="padding: 6px 12px; font-size: 12px; border-radius: 8px;">';
        html += '        <span>🌟</span> Convert';
        html += '      </button>';
        html += '      <button type="button" class="btn-cell-action btn-edit-lead" onclick="openEditLeadModal(\'' + escapeHtml(id) + '\')" title="Edit lead details" style="padding: 6px 10px; font-size: 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">';
        html += '        <span>✏️</span> Edit';
        html += '      </button>';
        html += '      <button type="button" class="btn-lead-note-action" onclick="openLeadNoteModal(\'' + escapeHtml(id) + '\')" title="Add note" style="padding: 6px 9px; font-size: 12px; border-radius: 8px;">📝</button>';
        html += '      <button type="button" class="btn-lead-icon-danger" onclick="deleteLead(\'' + escapeHtml(id) + '\')" title="Delete or drop lead" style="padding: 6px 8px; font-size: 12px; border-radius: 8px;">🗑️</button>';
        html += '    </div>';
        html += '  </td>';

        html += '</tr>';
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    }

    function renderAdminLeadsKanban(leads) {
      var container = document.getElementById('leadsListContainer');
      if (!container) return;

      var stages = [
        { key: 'open', title: 'New Inquiries', icon: '📥', color: '#3b82f6' },
        { key: 'follow_up', title: 'In Follow-Up', icon: '📞', color: '#f59e0b' },
        { key: 'quoted', title: 'Discussion / Quoted', icon: '💬', color: '#8b5cf6' },
        { key: 'ready', title: 'Ready to Convert', icon: '🌟', color: '#10b981' }
      ];

      var grouped = { open: [], follow_up: [], quoted: [], ready: [] };
      leads.forEach(function(l) {
        var st = (l.leadStatus || 'open').toLowerCase();
        if (!grouped[st]) grouped.open.push(l);
        else grouped[st].push(l);
      });

      var html = '<div class="leads-kanban-board">';
      stages.forEach(function(s, colIdx) {
        var stageLeads = grouped[s.key] || [];
        var hasPrev = colIdx > 0;
        var hasNext = colIdx < stages.length - 1;

        html += '<div class="leads-kanban-col" data-stage="' + s.key + '" ' +
                'ondragover="handleLeadDragOver(event)" ' +
                'ondragenter="handleLeadDragEnter(event, \'' + s.key + '\')" ' +
                'ondragleave="handleLeadDragLeave(event)" ' +
                'ondrop="handleLeadDrop(event, \'' + s.key + '\')">';
        html += '  <div class="leads-kanban-header">';
        html += '    <div class="leads-kanban-title"><span style="font-size: 15px;">' + s.icon + '</span><span>' + s.title + '</span></div>';
        html += '    <span class="leads-kanban-count" style="background: ' + s.color + '20; color: ' + s.color + ';">' + stageLeads.length + '</span>';
        html += '  </div>';
        html += '  <div class="leads-kanban-cards">';

        if (stageLeads.length === 0) {
          html += '    <div class="leads-kanban-empty">Drop leads here or click + New Lead</div>';
        } else {
          stageLeads.forEach(function(l) {
            var id = l.id || l.customerCode;
            var name = l.customerName || 'Prospect Lead';
            var nameHi = l.nameHi ? ' (' + l.nameHi + ')' : '';
            var phone = l.customerNumber || l.phone || '';
            var rawVeh = l.vehicle || '';
            var notes = l.leadNotes || l.notes || '';
            var sCategory = l.interestedService || l.serviceCategory || 'Daily Car Cleaning';

            var parsedVeh = rawVeh ? (typeof parseVehicleDetails === 'function' ? parseVehicleDetails(rawVeh) : parseVehicleString(rawVeh)) : null;
            var regBadge = (parsedVeh && parsedVeh.reg) ? parsedVeh.reg : (rawVeh || '');

            // Short category badge & styling
            var shortCat = 'Daily Clean';
            var catClass = 'cat-daily';
            var catIcon = '🚗';
            if (sCategory.indexOf('Solar') !== -1) {
              shortCat = 'Solar Clean';
              catClass = 'cat-solar';
              catIcon = '☀️';
            } else if (sCategory.indexOf('Wash') !== -1) {
              shortCat = 'Car Wash';
              catClass = 'cat-wash';
              catIcon = '🧼';
            } else if (sCategory.indexOf('Detailing') !== -1) {
              shortCat = 'Detailing';
              catClass = 'cat-detail';
              catIcon = '✨';
            }

            // High-Density Compact M3 Kanban Lead Card
            html += '<div class="cwp-lead-card leads-kanban-card compact-lead-card" id="leadCard_' + escapeHtml(id) + '" ' +
                    'draggable="true" ' +
                    'ondragstart="handleLeadDragStart(event, \'' + escapeHtml(id) + '\')" ' +
                    'ondragend="handleLeadDragEnd(event)" ' +
                    'data-lead-id="' + escapeHtml(id) + '">';

            // 1. Header Row: Name + Category Pill (Full name visible, no truncation)
            html += '  <div class="compact-lead-header">';
            html += '    <div class="compact-lead-name-wrap">';
            html += '      <div style="display: flex; align-items: center; gap: 5px;">';
            html += '        <span class="compact-lead-drag-handle" title="Drag across pipeline stages">⋮⋮</span>';
            html += '        <strong class="compact-lead-name">' + escapeHtml(name) + '</strong>';
            html += '      </div>';
            if (nameHi) html += '      <div class="compact-lead-name-hi">' + escapeHtml(nameHi) + '</div>';
            html += '    </div>';
            html += '    <span class="compact-lead-cat-pill ' + catClass + '" title="Interested: ' + escapeHtml(sCategory) + '">' + catIcon + ' ' + shortCat + '</span>';
            html += '  </div>';

            // 2. Contact Row: Phone + 1-Tap Call/WA Actions + Vehicle Badge (if present)
            html += '  <div class="compact-lead-phone-row">';
            if (phone) {
              html += '    <div class="compact-lead-phone-left">';
              html += '      <span class="compact-lead-phone-num">📞 +91 ' + escapeHtml(phone) + '</span>';
              html += '      <a href="tel:+91' + escapeHtml(phone) + '" class="compact-phone-btn pill-call" title="Call ' + escapeHtml(name) + '">📞</a>';
              html += '      <a href="https://wa.me/91' + escapeHtml(phone) + '?text=Namaste%20' + encodeURIComponent(name) + '%2C%20CWP%20Detailers%20ki%20taraf%20se%20sampark%20kar%20rahe%20hain." target="_blank" rel="noopener" class="compact-phone-btn pill-wa" title="WhatsApp ' + escapeHtml(name) + '">💬</a>';
              html += '    </div>';
            } else {
              html += '    <span class="compact-lead-no-phone">📞 No phone</span>';
            }
            if (regBadge) {
              html += '    <span class="compact-lead-veh-plate" title="Vehicle: ' + escapeHtml(rawVeh) + '">' + escapeHtml(regBadge) + '</span>';
            }
            html += '  </div>';

            // 3. Compact Bottom Bar: Direct Stage Shifters (← / Next →) & Quick Convert/Note
            html += '  <div class="compact-lead-footer">';
            html += '    <div class="compact-lead-nav-btns">';
            if (hasPrev) {
              html += '      <button type="button" class="btn-stage-shift btn-stage-prev" onclick="shiftLeadStage(\'' + escapeHtml(id) + '\', \'prev\')" title="Move to previous stage">←</button>';
            }
            if (hasNext) {
              html += '      <button type="button" class="btn-stage-shift btn-stage-next" onclick="shiftLeadStage(\'' + escapeHtml(id) + '\', \'next\')" title="Move to next stage">Next →</button>';
            }
            html += '    </div>';
            html += '    <div class="compact-lead-actions-right">';
            html += '      <button type="button" class="btn-convert-hero btn-compact-convert" onclick="openConvertLeadModal(\'' + escapeHtml(id) + '\')" title="Confirm & Convert Lead">';
            html += '        <span>🌟</span> Convert';
            html += '      </button>';
            html += '      <button type="button" class="btn-lead-edit-action btn-compact-edit" onclick="openEditLeadModal(\'' + escapeHtml(id) + '\')" title="Edit Lead Details">✏️</button>';
            html += '      <button type="button" class="btn-lead-note-action btn-compact-note" onclick="openLeadNoteModal(\'' + escapeHtml(id) + '\')" title="' + (notes ? escapeHtml(notes) : 'Add Note') + '">📝</button>';
            html += '      <button type="button" class="btn-lead-icon-danger btn-compact-del" onclick="deleteLead(\'' + escapeHtml(id) + '\')" title="Delete Lead">🗑️</button>';
            html += '    </div>';
            html += '  </div>';

            html += '</div>';
          });
        }

        html += '  </div>';
        html += '</div>';
      });
      html += '</div>';

      container.innerHTML = html;
    }

    function handleConvertCategoryChange(cat) {
      var pkgGroup = document.getElementById('convertPackageGroup');
      var pkgSelect = document.getElementById('convertPackageType');
      var isSolar = (cat === 'Solar Panel Cleaning' || cat === 'solar_cleaning');
      var isCarWash = (cat === 'Car Washing' || cat === 'car_washing');
      var isInterior = (cat === 'Interior Detailing' || cat === 'interior_detailing');
      var isExterior = (cat === 'Exterior Detailing' || cat === 'exterior_detailing');

      var solarGroup = document.getElementById('convertSolarPanelsGroup');
      var seaterGroup = document.getElementById('convertSeaterGroup');
      if (solarGroup) solarGroup.style.display = isSolar ? 'block' : 'none';
      if (seaterGroup) seaterGroup.style.display = isSolar ? 'none' : 'block';

      if (!pkgSelect) return;
      if (pkgGroup) pkgGroup.style.display = 'block';

      if (cat === 'Daily Car Cleaning' || cat === 'daily_car_cleaning') {
        pkgSelect.innerHTML = '<option value="DCC ONLY" selected>DCC ONLY (Exterior Daily)</option>' +
          '<option value="Exterior Chemical Cleaning (30 Days)">Exterior Chemical Cleaning (30 Days)</option>' +
          '<option value="Exterior Chemical Cleaning + 1 Carwash/mo">Exterior Chemical Cleaning + 1 Carwash/mo</option>' +
          '<option value="Exterior Chemical Cleaning + 2 Carwash/mo">Exterior Chemical Cleaning + 2 Carwash/mo</option>' +
          '<option value="DCC SILVER">DCC SILVER (Exterior Daily + Weekly Vacuum)</option>' +
          '<option value="DCC GOLD">DCC GOLD (Full Executive Detailing)</option>' +
          '<option value="OTHER">OTHER (Custom Subscription)</option>';
      } else if (isCarWash) {
        pkgSelect.innerHTML = '<option value="Single Wash (One Time Wash)" selected>Single Wash (One Time Wash)</option>' +
          '<option value="Wash Subscription (4 Washes / 6 Months)">Wash Subscription (4 Washes / 6 Months)</option>' +
          '<option value="CAR WASH SUBSCRIPTION">CAR WASH SUBSCRIPTION</option>' +
          '<option value="CAR WASH SINGLE">CAR WASH SINGLE</option>' +
          '<option value="Foam Wash">Foam Wash</option>' +
          '<option value="Deep Interior & Exterior Wash">Deep Interior & Exterior Wash</option>' +
          '<option value="Other Wash">Other Wash</option>';
      } else if (isSolar) {
        pkgSelect.innerHTML = '<option value="One Time Solar Cleaning" selected>One Time Solar Cleaning</option>' +
          '<option value="6 Month Subscription (6 frequencies)">6 Month Subscription (6 frequencies)</option>' +
          '<option value="12 Month Subscription (12 frequencies)">12 Month Subscription (12 frequencies)</option>' +
          '<option value="Solar Cleaning Standard">Solar Cleaning Standard (Up to 10 Panels)</option>' +
          '<option value="Solar Cleaning Commercial">Solar Cleaning Commercial (10+ Panels)</option>' +
          '<option value="OTHER">OTHER</option>';
      } else if (isInterior) {
        pkgSelect.innerHTML = '<option value="Interior Deep Cleaning" selected>Interior Deep Cleaning</option>' +
          '<option value="Roof Cleaning">Roof Cleaning</option>' +
          '<option value="OTHER">OTHER</option>';
      } else if (isExterior) {
        pkgSelect.innerHTML = '<option value="Ceramic Coating" selected>Ceramic Coating</option>' +
          '<option value="Graphene Coating">Graphene Coating</option>' +
          '<option value="Car Waxing">Car Waxing</option>' +
          '<option value="Glass Treatment">Glass Treatment</option>' +
          '<option value="OTHER">OTHER</option>';
      }
    }

    function openConvertLeadModal(leadId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      if (!lead) {
        showToast('Lead record not found.', '⚠️');
        return;
      }

      document.getElementById('convertLeadId').value = lead.id || lead.customerCode;
      document.getElementById('convertLeadNameDisplay').textContent = lead.customerName || '—';
      document.getElementById('convertLeadPhoneDisplay').textContent = (lead.customerNumber || lead.phone) ? ('+91 ' + (lead.customerNumber || lead.phone)) : '— (No phone)';
      document.getElementById('convertLeadVehicleDisplay').textContent = lead.vehicle || '—';
      var leadMake = (lead.carMake || lead.car_make || '').trim();
      var leadColor = (lead.carColor || lead.car_color || '').trim();
      var makeColorWrap = document.getElementById('convertLeadMakeColorWrap');
      var makeColorDisplay = document.getElementById('convertLeadMakeColorDisplay');
      if (makeColorWrap && makeColorDisplay) {
        if (leadMake || leadColor) {
          makeColorDisplay.textContent = [leadMake, leadColor].filter(Boolean).join(' • ');
          makeColorWrap.style.display = 'flex';
        } else {
          makeColorWrap.style.display = 'none';
        }
      }
      document.getElementById('convertLeadAddressDisplay').textContent = lead.address || '—';
      document.getElementById('convertNotes').value = '';

      var catSelect = document.getElementById('convertServiceCategory');
      if (catSelect) {
        var cat = lead.interestedService || lead.serviceCategory || 'Daily Car Cleaning';
        if (['Daily Car Cleaning', 'Car Washing', 'Solar Panel Cleaning', 'Interior Detailing', 'Exterior Detailing'].indexOf(cat) !== -1) {
          catSelect.value = cat;
        } else {
          catSelect.value = 'Daily Car Cleaning';
        }
        handleConvertCategoryChange(catSelect.value);
      }

      var convPanelsInput = document.getElementById('convertSolarPanelsCount') || document.getElementById('convertPanelCount');
      if (convPanelsInput) convPanelsInput.value = lead.panelCount || lead.panel_count || '';
      var convSeaterVal = lead.seaterType || lead.seater_type || '5_seater';
      if (typeof handleConvertSeaterChange === 'function') {
        handleConvertSeaterChange(convSeaterVal);
      }

      var staffSelect = document.getElementById('convertStaffSelect');
      if (staffSelect) {
        staffSelect.innerHTML = '<option value="">Unassigned (Assign later)</option>';
        (state.staffList || []).filter(function(s) { return s.active !== false; }).forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name + ' (' + s.id + ')';
          staffSelect.appendChild(opt);
        });
      }

      var modal = document.getElementById('convertLeadModal');
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeConvertLeadModal() {
      var modal = document.getElementById('convertLeadModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleConvertLeadSubmit(e) {
      e.preventDefault();
      var btn = document.getElementById('btnConfirmConvert');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="cwp-spinner"></span> Converting lead...';
      }

      var leadId = document.getElementById('convertLeadId').value;
      var sCategory = document.getElementById('convertServiceCategory').value;
      var pkgType = document.getElementById('convertPackageType').value;
      var staffSelect = document.getElementById('convertStaffSelect');
      var staffId = staffSelect ? staffSelect.value : '';
      var staffName = '';
      if (staffId && staffSelect.selectedIndex >= 0) {
        var opt = staffSelect.options[staffSelect.selectedIndex];
        staffName = opt ? opt.textContent.replace(/\s*\(.*\)$/, '').trim() : '';
      }
      var notes = (document.getElementById('convertNotes').value || '').trim();

      var isSolarConv = (sCategory === 'Solar Panel Cleaning' || sCategory === 'solar_cleaning');
      var convPanelsInput = document.getElementById('convertSolarPanelsCount') || document.getElementById('convertPanelCount');
      var convPanels = isSolarConv ? (parseInt(convPanelsInput ? convPanelsInput.value : '', 10) || null) : null;
      var convSeater = isSolarConv ? null : (document.getElementById('convertSeaterTypeHidden') ? document.getElementById('convertSeaterTypeHidden').value : '5_seater');

      var payload = {
        leadId: leadId,
        convertData: {
          serviceCategory: sCategory,
          packageType: pkgType,
          panelCount: convPanels,
          panel_count: convPanels,
          seaterType: convSeater,
          seater_type: convSeater,
          staffId: staffId,
          staffName: staffName,
          notes: notes
        }
      };

      apiCall('convertLead', payload, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🚀</span> Confirm & Assign Customer';
        }
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          showToast('Lead confirmed & converted to active customer successfully!', '🎉');
          closeConvertLeadModal();

          loadAdminLeads(true);
          loadAdminRecords(true);

          setTimeout(function() {
            switchAdminTab('records');
          }, 600);
        }
      }, function(err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🚀</span> Confirm & Assign Customer';
        }
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function openLeadNoteModal(leadId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      if (!lead) return;

      document.getElementById('leadNoteTargetId').value = lead.id || lead.customerCode;
      document.getElementById('leadNoteCustomerName').textContent = (lead.customerName || 'Prospect') + ' • ' + (lead.vehicle || '');
      var hist = document.getElementById('leadNotesHistoryList');
      if (hist) {
        hist.textContent = lead.leadNotes || lead.notes || 'No prior notes logged.';
      }
      document.getElementById('newLeadNoteText').value = '';

      var modal = document.getElementById('leadNoteModal');
      if (modal) modal.style.display = 'flex';
      setTimeout(function() {
        var txt = document.getElementById('newLeadNoteText');
        if (txt) txt.focus();
      }, 100);
    }

    function closeLeadNoteModal() {
      var modal = document.getElementById('leadNoteModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleSaveLeadNoteSubmit(e) {
      e.preventDefault();
      var btn = document.getElementById('btnSaveLeadNote');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="cwp-spinner"></span> Saving...';
      }

      var leadId = document.getElementById('leadNoteTargetId').value;
      var noteText = (document.getElementById('newLeadNoteText').value || '').trim();

      apiCall('addLeadNote', { leadId: leadId, note: noteText }, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Note';
        }
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          showToast('Lead note saved!', '✓');
          closeLeadNoteModal();
          loadAdminLeads(true);
        }
      }, function(err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>💾</span> Save Note';
        }
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function deleteLead(leadId) {
      var lead = (state.leads || []).find(function(l) {
        return (l.id && l.id === leadId) || (l.customerCode && l.customerCode === leadId);
      });
      var name = lead ? lead.customerName : 'this lead';
      if (!confirm('Are you sure you want to remove lead "' + name + '"?')) return;

      apiCall('deleteLead', { leadId: leadId, reason: 'Dismissed by admin' }, function(res) {
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          showToast('Lead removed.', '✓');
          loadAdminLeads(true);
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function handleLeadsSearch(val) {
      state.leadsSearchQuery = val || '';
      var btn = document.getElementById('btnLeadsSearchClear');
      if (btn) btn.style.display = val ? 'inline-flex' : 'none';

      var filtered = applyLeadsFilters();
      updateLeadsKpi();
      renderAdminLeadsList(filtered);
    }

    function clearLeadsSearch() {
      var input = document.getElementById('leadsSearchInput');
      if (input) input.value = '';
      handleLeadsSearch('');
    }

        function exportAdminRecordsCSV() {
      var records = state.lastFilteredRecords || state.adminRecords;
      if (!records || records.length === 0) {
        showToast('No records available to export.', '⚠️');
        return;
      }
      var headers = ['S.No.', 'Customer Name', 'Mobile Number', 'Service Category', 'Vehicle / Site Info', 'Primary Address', 'Primary Map Link', 'Secondary Address', 'Secondary Map Link', 'Assigned Staff', 'Package', 'Photo Link', 'Active Status'];
      var rows = [headers];
      records.forEach(function(r, idx) {
        var cat = r.serviceCategory || (r.sheetName === 'Daily Clean' ? 'Daily Car Cleaning' : 'Car Washing');
        rows.push([
          idx + 1,
          r.customerName || '',
          r.customerNumber || '',
          cat,
          r.vehicle || r.vehicleNumbers || '',
          r.address || '',
          r.googleMapsUrl || '',
          r.secondaryAddress || '',
          r.secondaryMapsUrl || '',
          r.staffName || '',
          r.packageType || '',
          r.photoUrl || '',
          r.active || 'Yes'
        ]);
      });
      var csvContent = '\uFEFF' + rows.map(function(row) {
        return row.map(function(val) {
          var str = (val !== null && val !== undefined ? val : '').toString().replace(/"/g, '""');
          return '"' + str + '"';
        }).join(',');
      }).join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'CWP_Customers_' + new Date().toISOString().slice(0, 10) + '.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('CSV file downloaded (' + records.length + ' records)', '📥');
    }

    /* =========================================================================
       ADMIN CUSTOMER RECORDS PAGINATION & SCALABILITY CONTROLS
       ========================================================================= */
    var adminPagination = {
      page: 1,
      pageSize: 25 // Default 25 per page (Options: 25, 50, 100, 0 = All)
    };

    function changeAdminPage(newPage) {
      adminPagination.page = newPage;
      var records = state.lastFilteredRecords || state.adminRecords || [];
      renderAdminRecordsTable(records);
      var table = document.getElementById('adminRecordsTable');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function changeAdminPageSize(newSize) {
      adminPagination.pageSize = parseInt(newSize, 10) || 0;
      adminPagination.page = 1;
      var records = state.lastFilteredRecords || state.adminRecords || [];
      renderAdminRecordsTable(records);
    }
    window.changeAdminPage = changeAdminPage;
    window.changeAdminPageSize = changeAdminPageSize;

    function renderAdminPaginationControls(totalCount, startIndex, endIndex, currentPage, totalPages, pageSize) {
      var container = document.getElementById('adminTablePagination');
      if (!container) return;

      if (!totalCount || totalCount <= 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      container.style.display = 'flex';

      var infoHtml = '<div class="pagination-info-wrap">' +
        '<span>Showing <strong style="color:var(--text-primary);">' + (startIndex + 1) + ' - ' + endIndex + '</strong> of <strong style="color:var(--text-primary);">' + totalCount + '</strong> records</span>' +
        '<select class="pagination-page-size-select" onchange="changeAdminPageSize(this.value)" title="Rows per page">' +
          '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25 / page</option>' +
          '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50 / page</option>' +
          '<option value="100"' + (pageSize === 100 ? ' selected' : '') + '>100 / page</option>' +
          '<option value="0"' + (pageSize === 0 ? ' selected' : '') + '>Show All</option>' +
        '</select>' +
      '</div>';

      if (pageSize === 0 || totalPages <= 1) {
        container.innerHTML = infoHtml + '<div class="pagination-controls-wrap"><span style="font-size:12px; color:var(--text-muted);">All records displayed</span></div>';
        return;
      }

      var prevDisabled = currentPage <= 1 ? ' disabled' : '';
      var nextDisabled = currentPage >= totalPages ? ' disabled' : '';

      var navHtml = '<div class="pagination-controls-wrap">';
      navHtml += '<button type="button" class="btn-page-nav" onclick="changeAdminPage(' + (currentPage - 1) + ')"' + prevDisabled + ' title="Previous Page">‹ Prev</button>';

      var maxPills = 5;
      var startPill = Math.max(1, currentPage - 2);
      var endPill = Math.min(totalPages, startPill + maxPills - 1);
      if (endPill - startPill + 1 < maxPills) {
        startPill = Math.max(1, endPill - maxPills + 1);
      }

      if (startPill > 1) {
        navHtml += '<button type="button" class="btn-page-num" onclick="changeAdminPage(1)">1</button>';
        if (startPill > 2) navHtml += '<span style="padding:0 3px; color:var(--text-muted);">…</span>';
      }

      for (var p = startPill; p <= endPill; p++) {
        var activeClass = p === currentPage ? ' active' : '';
        navHtml += '<button type="button" class="btn-page-num' + activeClass + '" onclick="changeAdminPage(' + p + ')">' + p + '</button>';
      }

      if (endPill < totalPages) {
        if (endPill < totalPages - 1) navHtml += '<span style="padding:0 3px; color:var(--text-muted);">…</span>';
        navHtml += '<button type="button" class="btn-page-num" onclick="changeAdminPage(' + totalPages + ')">' + totalPages + '</button>';
      }

      navHtml += '<button type="button" class="btn-page-nav" onclick="changeAdminPage(' + (currentPage + 1) + ')"' + nextDisabled + ' title="Next Page">Next ›</button>';
      navHtml += '</div>';

      container.innerHTML = infoHtml + navHtml;
    }

    function renderAdminRecordsTable(records) {
      var tbody = document.getElementById('adminRecordsTableBody');
      if (!tbody) return;

      var paginationContainer = document.getElementById('adminTablePagination');

      if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 48px 16px; color: var(--text-muted);">' +
          '<div style="font-size: 32px; margin-bottom: 10px;">🔍</div>' +
          '<div style="font-weight: 700; font-size: 15px; color: var(--text-primary); margin-bottom: 4px;">No customer records match your filter</div>' +
          '<div style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 12px;">Try adjusting your search criteria, staff assignment or category filters</div>' +
          '<button type="button" class="btn-admin-secondary" onclick="resetAllAdminFilters()" style="margin: 0 auto; display: inline-flex;">Reset all filters</button>' +
          '</td></tr>';
        if (paginationContainer) {
          paginationContainer.innerHTML = '';
          paginationContainer.style.display = 'none';
        }
        return;
      }

      var totalCount = records ? records.length : 0;
      var pageSize = adminPagination ? adminPagination.pageSize : 25;
      var currentPage = adminPagination ? adminPagination.page : 1;
      var totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 1;
      if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
      if (adminPagination) adminPagination.page = currentPage;

      var startIndex = pageSize > 0 ? (currentPage - 1) * pageSize : 0;
      var endIndex = pageSize > 0 ? Math.min(startIndex + pageSize, totalCount) : totalCount;
      var pageRecords = pageSize > 0 ? records.slice(startIndex, endIndex) : records;

      var html = '';
      pageRecords.forEach(function(r, index) {
        var sNo = startIndex + index + 1;
        var origIndex = r._origIndex !== undefined ? r._origIndex : (startIndex + index);
        var isActive = (r.active || 'Yes').toLowerCase() === 'yes';

        /* 1. Serial Number Cell */
        var sNoHtml = '<span class="sno-badge">' + sNo + '</span>';

        /* 2. Customer Name Cell (Dedicated column: name only, natural display & tooltip) */
        var avatarHtml = renderCustomerAvatar(r.customerName || 'Customer');
        var hiName = (r.nameHi || r.name_hi || '').trim();
        var nameDisplayHtml = escapeHtml(r.customerName || 'Unknown Customer');
        if (hiName && hiName !== r.customerName) {
          nameDisplayHtml += ' <span class="table-hi-sub" title="हिन्दी: ' + escapeHtml(hiName) + '">(' + escapeHtml(hiName) + ')</span>';
        }
        var custNameHtml = '<div class="cust-name-cell-modern">' +
          avatarHtml +
          '<div class="cust-name-wrap">' +
            '<span class="cust-name-text" title="' + escapeHtml(r.customerName || '') + '">' + nameDisplayHtml + '</span>' +
          '</div>' +
        '</div>';

        /* 2b. Mobile Number Cell (Dedicated column: phone link + WhatsApp action) */
        var phoneHtml = '';
        if (r.customerNumber) {
          var nPhone = normalizeIndianMobile(r.customerNumber);
          var formattedPhone = formatIndianMobile(nPhone);
          phoneHtml = '<div class="table-phone-cell">' +
            '<a href="' + getIndianPhoneLink(nPhone) + '" class="cust-phone-link" title="Call: ' + escapeHtml(formattedPhone) + '">' +
              '<svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z"/></svg> ' +
              '<span class="phone-digits-text">' + escapeHtml(formattedPhone) + '</span>' +
            '</a>' +
            '<a href="https://wa.me/91' + escapeHtml(nPhone) + '" target="_blank" rel="noopener noreferrer" class="cust-wa-pill" title="WhatsApp ' + escapeHtml(r.customerName || '') + '" onclick="event.stopPropagation();">' +
              '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/></svg>' +
            '</a>' +
          '</div>';
        } else {
          phoneHtml = '<span class="cell-empty-dash" title="No phone number">—</span>';
        }

        /* 2c. Service Category & Plan Cell (Dedicated column) */
        var catName = r.serviceCategory || (r.sheetName === 'Daily Clean' ? 'Daily Car Cleaning' : 'Car Washing');
        var tagClass = 'tag-daily';
        if (catName === 'Car Washing') tagClass = 'tag-wash';
        else if (catName === 'Solar Panel Cleaning') tagClass = 'tag-solar';
        else if (catName === 'Interior Detailing') tagClass = 'tag-interior';
        else if (catName === 'Exterior Detailing') tagClass = 'tag-exterior';
        var pkgLabel = (r.packageType || r.serviceType || '').trim();

        var serviceHtml = '<div class="table-service-cell">' +
          '<span class="cust-sheet-tag ' + tagClass + '"><span class="tag-status-dot"></span>' + escapeHtml(catName) + '</span>';
        if (pkgLabel) {
          serviceHtml += '<div class="table-pkg-badge-wrap">' + renderModernPackageBadge(pkgLabel) + '</div>';
        }
        serviceHtml += '</div>';

        /* 2d. Vehicle / Site Cell + Photo Micro-Thumb (Dedicated column) */
        var carText = (r.vehicle || r.vehicleNumbers || '').trim();
        var carHtml = '<div class="vehicle-cell-wrap-modern">';
        if (carText) {
          if (catName === 'Solar Panel Cleaning') {
            carHtml += '<span class="solar-site-badge" style="font-size:11.5px;" title="' + escapeHtml(carText) + '">☀️ ' + escapeHtml(carText) + '</span>';
          } else {
            carHtml += renderModernNumberPlate(carText);
          }
        } else {
          carHtml += '<span class="cell-empty-dash">—</span>';
        }
        var rowMake = (r.carMake || r.car_make || '').trim();
        var rowColor = (r.carColor || r.car_color || '').trim();
        if (catName !== 'Solar Panel Cleaning' && (rowMake || rowColor)) {
          var makeColorDisplay = [rowMake, rowColor].filter(Boolean).join(' • ');
          carHtml += '<div class="table-vehicle-make-color" title="Car Make & Color: ' + escapeHtml(makeColorDisplay) + '">' +
            '<span>🚘 ' + escapeHtml(makeColorDisplay) + '</span>' +
          '</div>';
        }
        if (r.photoUrl && r.photoUrl.trim()) {
          var aThumb = r.photoUrl.indexOf('res.cloudinary.com') !== -1 && r.photoUrl.indexOf('/upload/') !== -1 ? r.photoUrl.replace('/upload/', '/upload/w_80,h_80,c_fill,q_auto,f_auto/') : r.photoUrl;
          carHtml += '<div style="margin-top: 3px;">' +
            '<button type="button" class="vehicle-photo-thumb-btn-modern" onclick="openAdminPhotoModal(' + origIndex + ')" title="View vehicle photo">' +
              '<img src="' + escapeHtml(aThumb) + '" class="vehicle-micro-thumb" alt="Photo">' +
              '<span>📷 Photo</span>' +
            '</button>' +
          '</div>';
        }
        carHtml += '</div>';

        /* 3. Primary Address Cell */
        var addrText = (r.address != null ? String(r.address) : '').trim();
        var primaryAddrHtml = '<div class="table-addr-col-wrap">';
        if (isLocationLinkOnly(addrText)) {
          primaryAddrHtml += '<div class="geo-verified-pill" onclick="openAddressModal(' + origIndex + ')" title="GPS Pin Coordinates Linked • Click to view">' +
            '<span class="geo-pulse-dot"></span>' +
            '<span>GPS Linked Pin</span>' +
          '</div>';
        } else if (addrText) {
          primaryAddrHtml += '<div class="table-addr-text" onclick="openAddressModal(' + origIndex + ')" title="Click to view full address & details">' +
            '<svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" class="addr-pin-icon"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg> ' +
            escapeHtml(addrText) +
          '</div>';
        } else {
          primaryAddrHtml += '<span class="cell-empty-dash" title="Primary address not provided">—</span>';
        }
        primaryAddrHtml += '</div>';

        /* 4. Primary Map Location Cell */
        var primaryMapsUrl = formatGoogleMapsUrl(r.googleMapsUrl, addrText);
        var primaryMapHtml = '<div style="text-align: center;">';
        if (primaryMapsUrl) {
          primaryMapHtml += '<a href="' + escapeHtml(primaryMapsUrl) + '" target="_blank" rel="noopener noreferrer" class="table-inline-map-btn smart-map-btn" onclick="event.stopPropagation();" title="Open primary location in Google Maps">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>' +
            '<span>Map ↗</span>' +
          '</a>';
        } else {
          primaryMapHtml += '<span class="cell-empty-dash" title="No primary map link">—</span>';
        }
        primaryMapHtml += '</div>';

        /* 5. Secondary Address Cell */
        /* 6. Secondary Map Location Cell */
        var secAddrText = (r.secondaryAddress != null ? String(r.secondaryAddress) : '').trim();
        var secMapsUrl = formatGoogleMapsUrl(r.secondaryMapsUrl, secAddrText);
        var secLocHtml = '<div style="text-align: center;">';
        if (secAddrText || secMapsUrl) {
          secLocHtml += '<button type="button" class="btn-sec-loc-circle" onclick="openAddressModal(' + origIndex + ')" title="2nd Location: ' + escapeHtml(secAddrText || 'Map Available') + ' • Click to view full details">' +
            '<span class="sec-loc-circle-dot">✓</span> ' +
            '<span class="sec-loc-circle-text">Yes</span>' +
          '</button>';
        } else {
          secLocHtml += '<span class="cell-empty-dash" title="No secondary location">—</span>';
        }
        secLocHtml += '</div>';

        /* 7. Staff Assigned Name or Unassigned Badge */
        var staffName = (r.staffName || '').trim();
        var staffHtml = '<div style="text-align: center;">';
        if (staffName && staffName.toLowerCase() !== 'none' && staffName.toLowerCase() !== 'unassigned') {
          var matchedStaff = (state.staffList || []).find(function(s) {
            return (s.name && s.name.toLowerCase() === staffName.toLowerCase()) ||
                   (s.id && r.staffId && s.id.toUpperCase() === r.staffId.toUpperCase());
          });
          var matchedPhoto = matchedStaff ? (matchedStaff.photoUrl || matchedStaff.photo_url || '') : '';
          staffHtml += '<span class="staff-assigned-chip" title="Assigned: ' + escapeHtml(staffName) + '">';
          if (matchedPhoto) {
            staffHtml += '<img src="' + escapeHtml(matchedPhoto) + '" class="staff-avatar-mini" alt="' + escapeHtml(staffName) + '">';
          } else {
            staffHtml += '<span class="staff-avatar-mini-initials">' + escapeHtml(staffName.slice(0, 2).toUpperCase()) + '</span>';
          }
          staffHtml += '<span class="staff-chip-name">' + escapeHtml(staffName) + '</span></span>';
        } else {
          staffHtml += '<span class="staff-none-badge" title="No staff assigned">Unassigned</span>';
        }
        staffHtml += '</div>';

        /* 8. Actions: Edit and Delete Buttons (CRM pure view - Assign button decoupled to Job Assignment tab) */
        var actionsHtml = '<div class="records-actions-cluster">' +
          '<button type="button" class="btn-cell-action btn-edit-record" onclick="openEditCustomerModal(' + origIndex + ')" title="Edit customer details">' +
            '<svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>' +
            '<span>Edit</span>' +
          '</button>' +
          '<button type="button" class="btn-cell-action btn-delete-record" onclick="handleDeleteCustomer(' + origIndex + ')" title="Delete customer record">' +
            '<svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
          '</button>' +
        '</div>';

        html += '<tr>';
        html += '  <td style="text-align: center;">' + sNoHtml + '</td>';
        html += '  <td>' + custNameHtml + '</td>';
        html += '  <td>' + phoneHtml + '</td>';
        html += '  <td>' + serviceHtml + '</td>';
        html += '  <td>' + carHtml + '</td>';
        html += '  <td>' + primaryAddrHtml + '</td>';
        html += '  <td style="text-align: center;">' + primaryMapHtml + '</td>';
        html += '  <td style="text-align: center;">' + secLocHtml + '</td>';
        html += '  <td style="text-align: center;">' + staffHtml + '</td>';
        html += '  <td style="text-align: center;">' + actionsHtml + '</td>';
        html += '</tr>';
      });

      tbody.innerHTML = html;
      if (typeof updateOperationsDashboardKPIs === 'function') {
        updateOperationsDashboardKPIs();
      }
      renderAdminPaginationControls(totalCount, startIndex, endIndex, currentPage, totalPages, pageSize);
    }

    /* Edit Customer Modal Handlers */
    function openEditCustomerModal(index, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var r = state.adminRecords && state.adminRecords[index];
      if (!r) return;

      state.currentEditCustomerIndex = index;
      var idEl = document.getElementById('editCustomerId');
      if (idEl) idEl.value = r.id || r.customerId || r.customerCode || '';
      document.getElementById('editSheetName').value = r.sheetName || 'Daily Clean';
      document.getElementById('editRowIndex').value = r.rowIndex || '';
      document.getElementById('editPhotoUrl').value = r.photoUrl || '';
      document.getElementById('editCustName').value = r.customerName || '';
      var editNameHi = document.getElementById('editCustNameHi');
      if (editNameHi) editNameHi.value = r.nameHi || r.name_hi || '';
      setPhoneInputValue(document.getElementById('editCustPhone'), r.customerNumber || '');
      document.getElementById('editCustVehicles').value = r.vehicle || r.vehicleNumbers || '';
      var editMakeInput = document.getElementById('editCustCarMake');
      if (editMakeInput) editMakeInput.value = r.carMake || r.car_make || '';
      var editColorInput = document.getElementById('editCustCarColor');
      if (editColorInput) editColorInput.value = r.carColor || r.car_color || '';
      document.getElementById('editCustAddress').value = r.address || '';
      var editAddrHi = document.getElementById('editCustAddressHi');
      if (editAddrHi) editAddrHi.value = r.addressHi || r.address_hi || '';
      document.getElementById('editCustMapsUrl').value = r.googleMapsUrl || '';
      document.getElementById('editCustNotes').value = r.notes || r.staffNotes || '';
      document.getElementById('editCustActive').value = (r.active || 'Yes').toLowerCase() === 'no' ? 'No' : 'Yes';

      /* Auto-expand or collapse map panel based on existing data */
      toggleEditMap(!!(r.googleMapsUrl && r.googleMapsUrl.trim()));

      /* Secondary address fields & auto-expand */
      var secAddrInput = document.getElementById('editCustSecAddress');
      var secMapsInput = document.getElementById('editCustSecMaps');
      if (secAddrInput) secAddrInput.value = r.secondaryAddress || '';
      var secAddrHiInput = document.getElementById('editCustSecAddressHi');
      if (secAddrHiInput) secAddrHiInput.value = r.secondaryAddressHi || r.secondary_address_hi || '';
      if (secMapsInput) secMapsInput.value = r.secondaryMapsUrl || '';
      toggleEditSecLocation(!!((r.secondaryAddress && r.secondaryAddress.trim()) || (r.secondaryMapsUrl && r.secondaryMapsUrl.trim())));

      /* Set Category and dynamic package types */
      var catSelect = document.getElementById('editCustCategory');
      var rawCat = (r.serviceCategory || r.category || r.interestedService || '').toString().trim();
      var catVal = 'Daily Car Cleaning';
      if (/solar/i.test(rawCat)) {
        catVal = 'Solar Panel Cleaning';
      } else if (/interior/i.test(rawCat)) {
        catVal = 'Interior Detailing';
      } else if (/exterior/i.test(rawCat)) {
        catVal = 'Exterior Detailing';
      } else if (/wash/i.test(rawCat)) {
        catVal = 'Car Washing';
      } else if (/daily/i.test(rawCat) || /dcc/i.test(rawCat)) {
        catVal = 'Daily Car Cleaning';
      } else if (r.sheetName === 'All Other Work') {
        catVal = 'Car Washing';
      } else {
        catVal = 'Daily Car Cleaning';
      }

      if (catSelect) {
        catSelect.innerHTML = 
          '<option value="Daily Car Cleaning">🚗 Daily Car Cleaning (दैनिक कार सफाई)</option>' +
          '<option value="Car Washing">🧼 Car Washing (कार वॉश)</option>' +
          '<option value="Solar Panel Cleaning">☀️ Solar Panel Cleaning (सोलर पैनल सफाई)</option>' +
          '<option value="Interior Detailing">✨ Interior Detailing (इंटीरियर डिटेलिंग)</option>' +
          '<option value="Exterior Detailing">🛡️ Exterior Detailing (एक्सटीरियर डिटेलिंग)</option>';
        catSelect.value = catVal;
        handleEditCategoryChange(catVal);
      }

      /* Set solar panel count & vehicle seater size */
      var editPanelInput = document.getElementById('editCustSolarPanelsCount') || document.getElementById('editCustPanelCount');
      if (editPanelInput) editPanelInput.value = r.panelCount || r.panel_count || '';
      var editSeaterVal = r.seaterType || r.seater_type || '5_seater';
      if (typeof handleEditCustSeaterChange === 'function') {
        handleEditCustSeaterChange(editSeaterVal);
      } else {
        var hiddenSeater = document.getElementById('editCustSeaterTypeHidden');
        if (hiddenSeater) hiddenSeater.value = editSeaterVal;
      }

      /* Set package type with case-insensitive fallback matching */
      var pkgSelect = document.getElementById('editCustPkgType');
      var customPkgInput = document.getElementById('editCustPkgTypeCustom');
      var pType = (r.packageType || (catVal === 'Daily Car Cleaning' ? 'DCC ONLY' : (catVal === 'Car Washing' ? 'CAR WASH SUBSCRIPTION' : 'SOLAR SUBSCRIPTION'))).trim();
      if (pkgSelect && pType) {
        var matched = false;
        for (var i = 0; i < pkgSelect.options.length; i++) {
          if (pkgSelect.options[i].value.toLowerCase() === pType.toLowerCase()) {
            pkgSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched && pType) {
          /* Preserve custom/legacy package type without overwriting */
          var opt = document.createElement('option');
          opt.value = pType;
          opt.textContent = pType;
          opt.selected = true;
          pkgSelect.appendChild(opt);
          matched = true;
        }
        if (customPkgInput) {
          customPkgInput.style.display = (pkgSelect.value === 'OTHER') ? 'block' : 'none';
          customPkgInput.value = '';
        }
      }

      /* Populate Staff Dropdown with Unassigned option and preserve assigned staff */
      var staffSelect = document.getElementById('editCustStaff');
      var staffFound = false;
      var options = '<option value="">Unassigned</option>';
      (state.staffList || []).forEach(function(s) {
        var isSel = (s.name && r.staffName && s.name.trim().toLowerCase() === r.staffName.trim().toLowerCase());
        if (isSel) staffFound = true;
        options += '<option value="' + escapeHtml(s.name) + '" ' + (isSel ? 'selected' : '') + '>' + escapeHtml(s.name) + '</option>';
      });
      if (r.staffName && !staffFound && r.staffName.toLowerCase() !== 'none' && r.staffName.toLowerCase() !== 'unassigned') {
        options += '<option value="' + escapeHtml(r.staffName) + '" selected>' + escapeHtml(r.staffName) + '</option>';
      }
      staffSelect.innerHTML = options;

      /* Photo thumbnail preview */
      var thumb = document.getElementById('editPhotoThumb');
      var btnUpload = document.getElementById('btnEditUploadPhoto');
      var editActionsWrap = document.getElementById('editPhotoActionsWrap');
      if (r.photoUrl) {
        if (thumb) {
          thumb.src = r.photoUrl;
          thumb.style.display = 'block';
        }
        if (btnUpload) btnUpload.style.display = 'none';
        if (editActionsWrap) editActionsWrap.style.display = 'flex';
      } else {
        if (thumb) {
          thumb.src = '';
          thumb.style.display = 'none';
        }
        if (btnUpload) btnUpload.style.display = 'flex';
        if (editActionsWrap) editActionsWrap.style.display = 'none';
      }
      document.getElementById('editCustPhotoFile').value = '';
      state.editPhotoBase64 = '';
      state.editPhotoName = '';
      state.editPhotoType = '';

      var modal = document.getElementById('editCustomerModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }

      /* Initialize Edit Auto-Draft & Check for previous changes */
      initEditCustomerAutoDraft();
      checkAndShowEditDraftBanner();
    }

    /* Add Customer Modal Handlers */
    function openAddCustomerModal(triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl);
      var modal = document.getElementById('addCustomerModal');
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setupIndicInputListeners();
        var nameInput = document.getElementById('custName');
        if (nameInput) setTimeout(function() { nameInput.focus(); }, 120);
        else if (typeof trapFocus === 'function') trapFocus(modal);
      }
    }

    function closeAddCustomerModal() {
      var modal = document.getElementById('addCustomerModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    /* Static Backdrop Tactile Shake Handler (Prevents Accidental Dismissal on Outside Click) */
    function handleStaticBackdropClick(modalId) {
      var modal = document.getElementById(modalId);
      if (!modal) return;
      var card = modal.querySelector('.modal-card-box, .admin-card-section, .cropper-modal-card');
      if (card) {
        card.classList.remove('modal-static-shake');
        void card.offsetWidth; // force DOM reflow
        card.classList.add('modal-static-shake');
      }
    }

    function closeEditCustomerModal() {
      var modal = document.getElementById('editCustomerModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      state.editPhotoBase64 = '';
      state.editPhotoName = '';
      state.editPhotoType = '';
      state.rawEditPhotoDataUrl = '';
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
      var photoInput = document.getElementById('editCustPhotoFile');
      if (photoInput) photoInput.value = '';
      var editAct = document.getElementById('editPhotoActionsWrap');
      if (editAct) editAct.style.display = 'none';
      var badge = document.getElementById('editDraftBadge');
      if (badge) badge.style.display = 'none';
      var banner = document.getElementById('editDraftRestoreBanner');
      if (banner) banner.style.display = 'none';
    }

    function handleDeleteCustomer(index) {
      var r = state.adminRecords && state.adminRecords[index];
      if (!r) {
        showToast('Customer record not found', '❌');
        return;
      }

      var custName = r.customerName || r.name || 'this customer';
      var custId = r.id || r.customerId || r.customerCode || '';
      if (!custId) {
        showToast('Customer identifier missing', '❌');
        return;
      }

      if (!confirm('Are you sure you want to delete customer "' + custName + '"?\n\nThis will soft-delete the customer record, cancel any active subscriptions, and remove their cleaning assignments.')) {
        return;
      }

      closeEditCustomerModal();

      apiCall('deleteCustomer', { id: custId, reason: 'Administrative deletion via Admin Panel' }, function(res) {
        if (res && res.success === false) {
          showToast('Error: ' + (res.error || 'Failed to delete customer'), '❌');
          return;
        }
        showToast('Customer "' + custName + '" deleted successfully', '✓');
        if (typeof discardEditDraft === 'function') {
          discardEditDraft(true);
        }
        loadAdminRecords(true);
        if (typeof loadStaffSequenceData === 'function' && state.seqManagement && state.seqManagement.currentStaffId) {
          loadStaffSequenceData(true);
        }
        if (state.seqManagement && typeof initAdminSequenceManager === 'function') {
          initAdminSequenceManager();
        }
      }, function(err) {
        showToast('Error: ' + (err.message || err), '❌');
      });
    }

    function handleDeleteCustomerFromModal() {
      var index = state.currentEditCustomerIndex;
      if (index === undefined || index === null || !state.adminRecords || !state.adminRecords[index]) {
        var custId = (document.getElementById('editCustomerId') && document.getElementById('editCustomerId').value) || '';
        if (custId && state.adminRecords) {
          index = state.adminRecords.findIndex(function(rec) {
            return (rec.id === custId || rec.customerCode === custId);
          });
        }
      }
      if (index !== undefined && index >= 0) {
        handleDeleteCustomer(index);
      } else {
        showToast('Unable to determine customer to delete', '❌');
      }
    }

    function handleEditPhotoSelect(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;

      var pWrap = document.getElementById('editPhotoProgressWrap');
      var pFill = document.getElementById('editPhotoProgressFill');
      if (pWrap && pFill) {
        pWrap.style.display = 'block';
        pFill.style.width = '30%';
      }

      state.editPhotoName = file.name;
      state.editPhotoType = file.type || 'image/jpeg';

      var reader = new FileReader();
      reader.onprogress = function(pe) {
        if (pe.lengthComputable && pFill) {
          var pct = Math.round((pe.loaded / pe.total) * 90);
          pFill.style.width = pct + '%';
        }
      };
      reader.onload = function(evt) {
        if (pFill) pFill.style.width = '100%';
        setTimeout(function() {
          if (pWrap) pWrap.style.display = 'none';
          if (pFill) pFill.style.width = '0%';
        }, 300);

        var dataUrl = evt.target.result;
        state.rawEditPhotoDataUrl = dataUrl;

        /* Open Crop & Rotation modal immediately */
        openCropperModal(dataUrl, 'edit');
      };
      reader.readAsDataURL(file);
    }

    function detectEditGpsLocation() {
      if (!navigator.geolocation) {
        alert('GPS geolocation is not supported.');
        return;
      }
      showToast('Detecting GPS location...', '📍');
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude.toFixed(6);
        var lng = pos.coords.longitude.toFixed(6);
        document.getElementById('editCustMapsUrl').value = 'https:\x2F\x2Fwww.google.com/maps?q=' + lat + ',' + lng;
        showToast('GPS coordinates captured!', '✓');
      }, function(err) {
        showToast('Failed to get GPS location: ' + err.message, '❌');
      });
    }

    function handleEditCustomerSubmit(e) {
      e.preventDefault();
      var btn = document.getElementById('btnSaveEditCust');
      btn.disabled = true;
      var hasPhoto = !!state.editPhotoBase64;
      btn.innerHTML = '<span class="cwp-spinner"></span> ' + (hasPhoto ? 'Uploading photo & saving...' : 'Saving changes...');

      var editPhoneEl = document.getElementById('editCustPhone');
      var normEditPhone = normalizeIndianMobile(editPhoneEl ? editPhoneEl.value : '');
      if (!isValidIndianMobile(normEditPhone)) {
        alert('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        if (editPhoneEl) editPhoneEl.focus();
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Changes';
        return;
      }

      var sheetName = document.getElementById('editSheetName').value;
      var rowIndex = document.getElementById('editRowIndex').value;
      var photoUrl = document.getElementById('editPhotoUrl').value;
      var catSelect = document.getElementById('editCustCategory');
      var serviceCategory = catSelect ? catSelect.value : 'Daily Car Cleaning';
      var isSolarEdit = (serviceCategory === 'Solar Panel Cleaning' || serviceCategory === 'solar_cleaning');
      var isCarWashEdit = (serviceCategory === 'Car Washing' || serviceCategory === 'car_washing');
      var resolvedSheetName = (serviceCategory === 'Daily Car Cleaning' || serviceCategory === 'daily_car_cleaning') ? 'Daily Clean' : 'All Other Work';
      var resolvedServiceType = isSolarEdit ? 'Solar Cleaning' : (isCarWashEdit ? 'Car Wash' : (serviceCategory === 'Interior Detailing' ? 'Interior Detailing' : (serviceCategory === 'Exterior Detailing' ? 'Exterior Detailing' : 'Daily Clean')));
      var editPanelInput = document.getElementById('editCustSolarPanelsCount') || document.getElementById('editCustPanelCount');
      var panelCountVal = isSolarEdit ? (parseInt(editPanelInput ? editPanelInput.value : '', 10) || null) : null;
      var seaterTypeVal = isSolarEdit ? null : (document.getElementById('editCustSeaterTypeHidden') ? document.getElementById('editCustSeaterTypeHidden').value : '5_seater');

      var pkgVal = document.getElementById('editCustPkgType').value;
      if (pkgVal === 'OTHER') {
        var customPkg = (document.getElementById('editCustPkgTypeCustom') ? document.getElementById('editCustPkgTypeCustom').value : '').trim();
        if (customPkg) pkgVal = 'OTHER (' + customPkg + ')';
      }

      var secAddressVal = '';
      var secMapsVal = '';
      if (serviceCategory === 'Daily Car Cleaning') {
        var secAddrInput = document.getElementById('editCustSecAddress');
        var secMapsInput = document.getElementById('editCustSecMaps');
        secAddressVal = secAddrInput ? secAddrInput.value.trim() : '';
        secMapsVal = secMapsInput ? secMapsInput.value.trim() : '';
      }

      var vehText = document.getElementById('editCustVehicles').value.trim();
      var editCarMakeVal = (document.getElementById('editCustCarMake') ? document.getElementById('editCustCarMake').value : '').trim();
      var editCarColorVal = (document.getElementById('editCustCarColor') ? document.getElementById('editCustCarColor').value : '').trim();

      var rawEditStaffVal = (document.getElementById('editCustStaff') ? document.getElementById('editCustStaff').value : '').trim();
      var editStaffName = '';
      var editStaffId = '';
      if (rawEditStaffVal && rawEditStaffVal.toLowerCase() !== 'unassigned' && rawEditStaffVal.toLowerCase() !== 'none') {
        var foundEditStaff = (state.staffList || []).find(function(s) {
          return (s.name && s.name.trim().toLowerCase() === rawEditStaffVal.toLowerCase()) ||
                 (s.id && s.id.trim().toLowerCase() === rawEditStaffVal.toLowerCase());
        });
        if (foundEditStaff) {
          editStaffName = foundEditStaff.name;
          editStaffId = foundEditStaff.id || '';
        } else {
          editStaffName = rawEditStaffVal;
        }
      }

      var editCustId = document.getElementById('editCustomerId') ? document.getElementById('editCustomerId').value.trim() : '';

      var updatedData = {
        id: editCustId,
        sheetName: resolvedSheetName,
        rowIndex: rowIndex,
        customerName: document.getElementById('editCustName').value.trim(),
        nameHi: document.getElementById('editCustNameHi') ? document.getElementById('editCustNameHi').value.trim() : '',
        customerNumber: normalizeIndianMobile(document.getElementById('editCustPhone').value),
        staffName: editStaffName,
        staffId: editStaffId,
        serviceCategory: serviceCategory,
        serviceType: resolvedServiceType,
        panelCount: panelCountVal,
        panel_count: panelCountVal,
        seaterType: seaterTypeVal,
        seater_type: seaterTypeVal,
        packageType: pkgVal,
        packageDetails: pkgVal,
        packagesPurchased: '1',
        vehicleNumbers: vehText,
        vehicleOrSite: vehText,
        vehicle: vehText,
        carMake: editCarMakeVal,
        car_make: editCarMakeVal,
        carColor: editCarColorVal,
        car_color: editCarColorVal,
        address: document.getElementById('editCustAddress').value.trim(),
        addressHi: document.getElementById('editCustAddressHi') ? document.getElementById('editCustAddressHi').value.trim() : '',
        secondaryAddress: secAddressVal,
        secondaryAddressHi: document.getElementById('editCustSecAddressHi') ? document.getElementById('editCustSecAddressHi').value.trim() : '',
        secondaryMapsUrl: secMapsVal,
        googleMapsUrl: document.getElementById('editCustMapsUrl').value.trim(),
        staffNotes: document.getElementById('editCustNotes').value.trim(),
        active: document.getElementById('editCustActive').value,
        photoUrl: photoUrl
      };

      if (state.editPhotoBase64) {
        updatedData.photoFile = {
          base64: state.editPhotoBase64,
          mimeType: state.editPhotoType,
          fileName: state.editPhotoName
        };
      }

      apiCall('updateCustomer', { customerData: updatedData }, function(res) {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Changes';
        if (res && res.error) {
          showToast('Error: ' + res.error, '❌');
        } else {
          showToast('Customer record updated successfully!', '✓');
          discardEditDraft(true);
          closeEditCustomerModal();
          loadAdminRecords(true);
          if (typeof loadStaffSequenceData === 'function' && state.seqManagement && state.seqManagement.currentStaffId) {
            loadStaffSequenceData(true);
          }
        }
      }, function(err) {
        btn.disabled = false;
        btn.innerHTML = '<span>💾</span> Save Changes';
        showToast('Update error: ' + (err.message || err), '❌');
      });
    }

    /* Modal & Utilities */
    function openImageModal(url, custName, vehicleNum) {
      var modal = document.getElementById('imageModal');
      var img = document.getElementById('imageModalImg');
      var newTab = document.getElementById('imageModalOpenNewTab');
      var titleEl = document.getElementById('imageModalTitleText');
      var noPhotoBox = document.getElementById('imageModalNoPhoto');

      if (titleEl) {
        if (custName || vehicleNum) {
          titleEl.textContent = '🚗 ' + (custName || '') + (vehicleNum ? ' (' + vehicleNum + ')' : '');
        } else {
          titleEl.textContent = '🚗 Vehicle / Customer Photo';
        }
      }

      if (url) {
        if (img) {
          img.onerror = function() {
            this.style.display = 'none';
            if (noPhotoBox) {
              noPhotoBox.style.display = 'block';
              var titleBox = noPhotoBox.querySelector('div:nth-child(2)');
              if (titleBox) titleBox.textContent = 'फोटो लोड नहीं हो सकी (Photo Unavailable)';
            }
          };
          img.src = url;
          img.style.display = 'block';
        }
        if (newTab) {
          newTab.href = url;
          newTab.style.display = 'inline-flex';
        }
        if (noPhotoBox) noPhotoBox.style.display = 'none';
      } else {
        if (img) {
          img.onerror = null;
          img.src = '';
          img.style.display = 'none';
        }
        if (newTab) newTab.style.display = 'none';
        if (noPhotoBox) noPhotoBox.style.display = 'block';
      }

      if (modal) {
        modal.classList.add('open');
        modal.style.display = 'flex';
      }
      document.body.style.overflow = 'hidden';
    }

    function closeImageModal() {
      var modal = document.getElementById('imageModal');
      var img = document.getElementById('imageModalImg');
      if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
      }
      if (img) {
        img.onerror = null;
        img.src = '';
      }
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
    }

    function openAdminPhotoModal(origIndex) {
      var r = state.adminRecords && state.adminRecords[origIndex];
      if (!r) return;
      openImageModal(r.photoUrl || '', r.customerName || '', r.vehicle || r.vehicleNumbers || '');
    }

    /* Customer Address / Locations Modal Logic (Dual Location Support) */
    var _activeModalRecord = null;

    function openAddressModal(itemOrIndex) {
      var r;
      if (typeof itemOrIndex === 'object' && itemOrIndex !== null) {
        r = itemOrIndex;
      } else {
        r = state.adminRecords && state.adminRecords[itemOrIndex];
      }
      if (!r) return;
      _activeModalRecord = r;

      var isHi = (state.lang !== 'en');
      var hiName = (r.nameHi || r.name_hi || '').trim();
      var custName = (isHi && hiName) ? hiName : (r.customerName || 'Unknown Customer');
      var custPhone = (r.customerNumber != null ? String(r.customerNumber) : '').trim();
      var rawVehicle = (r.vehicle || r.vehicleNumbers || r.vehicleOrSite != null ? String(r.vehicle || r.vehicleNumbers || r.vehicleOrSite) : '').trim();
      var hiAddr = (r.addressHi || r.address_hi || '').trim();
      var primaryAddr = (isHi && hiAddr) ? hiAddr : (r.address != null ? String(r.address) : '').trim();
      var hiSecAddr = (r.secondaryAddressHi || r.secondary_address_hi || '').trim();
      var secAddr = (isHi && hiSecAddr) ? hiSecAddr : (r.secondaryAddress != null ? String(r.secondaryAddress) : '').trim();
      var primaryMapUrl = formatGoogleMapsUrl(r.googleMapsUrl, primaryAddr);
      var secMapUrl = formatGoogleMapsUrl(r.secondaryMapsUrl, secAddr);

      var hasPrimary = !!(primaryMapUrl || primaryAddr);
      var hasSecondary = !!(secMapUrl || secAddr);

      var nameEl = document.getElementById('addrModalCustName');
      var phoneLink = document.getElementById('addrModalPhoneLink');
      var phoneWrapper = document.getElementById('addrModalPhoneWrapper');
      var multiNotice = document.getElementById('addrModalMultiNotice');
      var primaryCard = document.getElementById('addrModalPrimaryCard');
      var primaryEl = document.getElementById('addrModalPrimary');
      var primaryMapLink = document.getElementById('addrModalPrimaryMapLink');
      var secCard = document.getElementById('addrModalSecondaryCard');
      var secEl = document.getElementById('addrModalSecondary');
      var secMapLink = document.getElementById('addrModalSecondaryMapLink');
      var modal = document.getElementById('addressViewModal');

      if (nameEl) {
        var modalVehicleDesc = rawVehicle;
        var rMake = (r.carMake || r.car_make || '').trim();
        var rColor = (r.carColor || r.car_color || '').trim();
        if (rMake || rColor) {
          var mc = [rMake, rColor].filter(Boolean).join(' • ');
          modalVehicleDesc = modalVehicleDesc ? (modalVehicleDesc + ' • ' + mc) : mc;
        }
        nameEl.textContent = custName + (modalVehicleDesc ? ' (' + modalVehicleDesc + ')' : '');
      }
      if (phoneLink && phoneWrapper) {
        var normCustPhone = normalizeIndianMobile(custPhone);
        if (normCustPhone) {
          phoneWrapper.style.display = 'block';
          phoneLink.textContent = '📞 ' + formatIndianMobile(normCustPhone);
          phoneLink.href = getIndianPhoneLink(normCustPhone);
        } else {
          phoneWrapper.style.display = 'none';
        }
      }

      // Multi-location warning banner
      if (multiNotice) {
        multiNotice.style.display = (hasPrimary && hasSecondary) ? 'flex' : 'none';
      }

      // Location 1: Primary Location
      if (primaryEl) {
        if (primaryAddr) {
          primaryEl.textContent = primaryAddr;
        } else if (primaryMapUrl) {
          primaryEl.innerHTML = '<span style="color:#2563eb; font-weight:500;">📍 Google Maps pin / location link available</span>';
        } else {
          primaryEl.textContent = 'No primary address recorded.';
        }
      }
      if (primaryMapLink) {
        if (primaryMapUrl) {
          primaryMapLink.style.display = 'inline-flex';
          primaryMapLink.href = primaryMapUrl;
        } else {
          primaryMapLink.style.display = 'none';
        }
      }

      // Location 2: Secondary Location
      if (secCard) {
        if (hasSecondary) {
          secCard.style.display = 'block';
          if (secEl) {
            if (secAddr) {
              secEl.textContent = secAddr;
            } else if (secMapUrl) {
              secEl.innerHTML = '<span style="color:#7e22ce; font-weight:500;">📍 Google Maps pin / secondary link available</span>';
            } else {
              secEl.textContent = 'No alternate address recorded.';
            }
          }
          if (secMapLink) {
            if (secMapUrl) {
              secMapLink.style.display = 'inline-flex';
              secMapLink.href = secMapUrl;
            } else {
              secMapLink.style.display = 'none';
            }
          }
        } else {
          secCard.style.display = 'none';
        }
      }

      // Legacy fallback element support
      var legacyMapLink = document.getElementById('addrModalMapLink');
      if (legacyMapLink) {
        if (primaryMapUrl) {
          legacyMapLink.style.display = 'inline-flex';
          legacyMapLink.href = primaryMapUrl;
        } else {
          legacyMapLink.style.display = 'none';
        }
      }

      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closeAddressModal() {
      var modal = document.getElementById('addressViewModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      _activeModalRecord = null;
    }

    function copyLocationAddress(which) {
      if (!_activeModalRecord) return;
      var textToCopy = '';
      if (which === 'primary') {
        textToCopy = (_activeModalRecord.address || '').trim() || (_activeModalRecord.googleMapsUrl || '').trim();
      } else if (which === 'secondary') {
        textToCopy = (_activeModalRecord.secondaryAddress || '').trim() || (_activeModalRecord.secondaryMapsUrl || '').trim();
      } else {
        var p = (_activeModalRecord.address || '').trim();
        var s = (_activeModalRecord.secondaryAddress || '').trim();
        textToCopy = p && s ? (p + '\n' + s) : (p || s);
      }

      if (!textToCopy) {
        showToast('No address available to copy', 'ℹ️');
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(function() {
          showToast('Address copied to clipboard!', '✓');
        }).catch(function() {
          fallbackCopyToClipboard(textToCopy);
        });
      } else {
        fallbackCopyToClipboard(textToCopy);
      }
    }

    function copyAddressText() {
      copyLocationAddress('both');
    }

    function fallbackCopyToClipboard(text) {
      try {
        var textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        var successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          showToast('Address copied to clipboard!', '✓');
        } else {
          showToast('Failed to copy', '❌');
        }
      } catch (err) {
        showToast('Clipboard copy not supported', 'ℹ️');
      }
    }

    /* Global Keyboard Listener: ESC key closes any open modal */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        var logoutModal = document.getElementById('logoutConfirmModal');
        if (logoutModal && logoutModal.style.display === 'flex') {
          closeLogoutModal();
          return;
        }
        var addrModal = document.getElementById('addressViewModal');
        if (addrModal && addrModal.style.display === 'flex') {
          closeAddressModal();
          return;
        }
        var imgModal = document.getElementById('imageModal');
        if (imgModal && (imgModal.classList.contains('open') || imgModal.style.display === 'flex')) {
          closeImageModal();
          return;
        }
        var cropperModal = document.getElementById('cwpPhotoCropperModal');
        if (cropperModal && cropperModal.style.display === 'flex') {
          closeCropperModal();
          return;
        }
        var editCust = document.getElementById('editCustomerModal');
        if (editCust && editCust.style.display === 'flex') {
          closeEditCustomerModal();
          return;
        }
        var addCust = document.getElementById('addCustomerModal');
        if (addCust && addCust.style.display === 'flex') {
          closeAddCustomerModal();
          return;
        }
        var editStaff = document.getElementById('staffEditModal');
        if (editStaff && editStaff.style.display === 'flex') {
          closeEditStaffModal();
          return;
        }
      }
    });

    function triggerInputShake(el) {
      if (!el) return;
      el.classList.remove('input-shake');
      void el.offsetWidth;
      el.classList.add('input-shake');
      setTimeout(function() { el.classList.remove('input-shake'); }, 500);
    }

    var toastTimer = null;
    function showToast(msg, iconOrType, type) {
      var t = document.getElementById('toastNotification');
      if (!t) return;
      var msgEl = document.getElementById('toastMessage');
      var iconEl = document.getElementById('toastIcon');

      var icon = '✓';
      var toastType = 'success';

      if (typeof iconOrType === 'string') {
        var lower = iconOrType.toLowerCase();
        if (['success', 'error', 'warning', 'info'].indexOf(lower) !== -1) {
          toastType = lower;
          icon = toastType === 'error' ? '✕' : (toastType === 'warning' ? '⚠️' : (toastType === 'info' ? 'ℹ️' : '✓'));
        } else {
          icon = iconOrType;
          if (icon === '❌' || icon === '✕') toastType = 'error';
          else if (icon === '⚠️') toastType = 'warning';
          else if (icon === 'ℹ️') toastType = 'info';
          if (type) toastType = type;
        }
      }

      t.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');
      t.classList.add('toast-' + toastType);

      if (msgEl) msgEl.textContent = msg;
      if (iconEl) iconEl.textContent = icon;
      t.classList.add('show');

      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function() {
        t.classList.remove('show');
      }, 3500);
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  
    /* =========================================================================
       TASK P2.5: DAILY CAR CLEANING SEQUENCE MANAGEMENT CLIENT JAVASCRIPT
       ========================================================================= */
    function getCustomerStableId(c) {
      if (!c) return '';
      if (c.id && typeof c.id === 'string' && c.id.trim()) return c.id.trim();
      if (c.customerId && typeof c.customerId === 'string' && c.customerId.trim()) return c.customerId.trim();

      var cleanPhone = (c.customerNumber || c.phone || '').toString().replace(/\D/g, '').slice(-10);
      var cleanVeh = (c.vehicle || c.vehicleNumbers || c.vehicleOrSite || '').toString().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      var cleanName = (c.customerName || c.custName || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');

      if (cleanPhone && cleanVeh) return 'CUST_' + cleanPhone + '_' + cleanVeh;
      if (cleanPhone && cleanName) return 'CUST_' + cleanPhone + '_' + cleanName;
      if (cleanPhone) return 'CUST_' + cleanPhone;
      if (cleanName && cleanVeh) return 'CUST_' + cleanName + '_' + cleanVeh;
      return 'CUST_' + (cleanName || 'REC') + '_' + (c.rowIndex || 'R0');
    }

    function parseSingleVehicleDetails(rawItem) {
      if (!rawItem) return { model: '', reg: '', display: '' };
      var raw = String(rawItem).trim();
      if (!raw) return { model: '', reg: '', display: '' };

      var regRegex = /\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{4})\b/i;
      var match = raw.match(regRegex);

      var reg = '';
      var model = '';

      if (match) {
        reg = match[1].toUpperCase().replace(/\s+/g, ' ');
        var remaining = raw.replace(match[0], '').replace(/^[-–—:,/|\s()]+|[-–—:,/|\s()]+$/g, '').trim();
        model = (remaining.toLowerCase() === 'vehicle' || remaining.toLowerCase() === 'car') ? '' : remaining;
      } else if (raw.indexOf('-') !== -1) {
        var parts = raw.split('-');
        if (/\d/.test(parts[0]) && !/\d/.test(parts[1])) {
          reg = parts[0].trim();
          model = parts[1].trim();
        } else {
          model = parts[0].trim();
          reg = parts.slice(1).join('-').trim();
        }
      } else {
        model = raw;
        reg = '';
      }

      if (model) {
        model = model.replace(/^[-–—:,/|\s()]+|[-–—:,/|\s()]+$/g, '').trim();
        if (/^(vehicle|car|गाड़ी|गाड़ी)$/i.test(model)) {
          model = '';
        }
      }
      if (reg) {
        reg = reg.replace(/\s*[-–—]\s*(vehicle|car|गाड़ी|गाड़ी)$/i, '').trim();
      }

      return {
        model: model,
        reg: reg,
        display: raw
      };
    }

    function parseVehicleDetails(vehicleStr) {
      if (!vehicleStr) return { model: '', reg: '', display: '', isMulti: false, vehicles: [] };
      var raw = String(vehicleStr).trim();
      if (!raw) return { model: '', reg: '', display: '', isMulti: false, vehicles: [] };

      // Multi-vehicle detection (supporting /, |, or comma between multiple vehicles)
      if (raw.indexOf('/') !== -1 || raw.indexOf('|') !== -1 || (raw.indexOf(',') !== -1 && /[A-Z]{2}\s*\d+/i.test(raw))) {
        var segments = raw.split(/[/|]|\s*,\s*(?=[A-Z0-9])/).map(function(s) { return s.trim(); }).filter(Boolean);
        if (segments.length > 1) {
          var parsedList = segments.map(function(seg) {
            return parseSingleVehicleDetails(seg);
          });
          var hasAtLeastOneReg = parsedList.some(function(p) { return Boolean(p.reg); });
          if (hasAtLeastOneReg) {
            var first = parsedList[0];
            return {
              model: first.model,
              reg: first.reg,
              display: raw,
              isMulti: true,
              rotationType: 'alternate_days',
              vehicles: parsedList
            };
          }
        }
      }

      var single = parseSingleVehicleDetails(raw);
      single.isMulti = false;
      single.vehicles = [single];
      return single;
    }

    state.seqManagement = {
      currentStaffId: '',
      currentStaffName: '',
      customers: [],
      originalOrder: [],
      hasUnsavedChanges: false,
      searchQuery: '',
      draggedIndex: null
    };

    function initAdminSequenceManager() {
      var staffSelect = document.getElementById('seqStaffSelect');
      if (!staffSelect) return;

      var staffList = (state.adminStaffList && state.adminStaffList.length > 0)
        ? state.adminStaffList
        : (state.staffList || []);

      if (!staffList || staffList.length === 0) {
        apiCall('getStaffList', {}, function(res) {
          state.adminStaffList = res || [];
          populateSeqStaffDropdown(state.adminStaffList);
          loadStaffSequenceData();
        }, function(err) {
          showSeqAlert('Failed to load staff list: ' + (err.error || err), 'error');
        });
      } else {
        populateSeqStaffDropdown(staffList);
        loadStaffSequenceData();
      }
    }

    function populateSeqStaffDropdown(staffList) {
      var staffSelect = document.getElementById('seqStaffSelect');
      if (!staffSelect) return;
      var currentVal = staffSelect.value || state.seqManagement.currentStaffId;

      var html = '';
      (staffList || []).forEach(function(s) {
        if (!s || !s.name) return;
        var sId = s.id || '';
        var sName = s.name || '';
        html += '<option value="' + escapeHtml(sId) + '">' + escapeHtml(sName) + ' (' + escapeHtml(sId) + ')</option>';
      });

      staffSelect.innerHTML = html;
      if (currentVal && (staffList || []).some(function(s) { return s.id === currentVal; })) {
        staffSelect.value = currentVal;
      } else if (staffList && staffList.length > 0) {
        staffSelect.value = staffList[0].id;
      }
      state.seqManagement.currentStaffId = staffSelect.value;
      var selectedStaff = (staffList || []).find(function(s) { return s.id === staffSelect.value; });
      state.seqManagement.currentStaffName = selectedStaff ? selectedStaff.name : staffSelect.value;
    }

    function handleSeqStaffChange() {
      var staffSelect = document.getElementById('seqStaffSelect');
      if (!staffSelect) return;

      if (state.seqManagement.hasUnsavedChanges) {
        var conf = confirm('You have unsaved changes! Do you want to discard them before selecting a new staff member?');
        if (!conf) {
          staffSelect.value = state.seqManagement.currentStaffId;
          return;
        }
      }

      state.seqManagement.currentStaffId = staffSelect.value;
      var staffList = state.adminStaffList || state.staffList || [];
      var selectedStaff = staffList.find(function(s) { return s.id === staffSelect.value; });
      state.seqManagement.currentStaffName = selectedStaff ? selectedStaff.name : staffSelect.value;
      loadStaffSequenceData();
    }

    function loadStaffSequenceData(forceRefresh) {
      var container = document.getElementById('seqCustomerList');
      if (!container) return;
      var sId = state.seqManagement.currentStaffId;
      if (!sId) return;

      container.innerHTML = '<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:13px; font-weight:600;">⏳ Loading route sequence for ' + escapeHtml(state.seqManagement.currentStaffName) + '...</div>';
      hideSeqAlert();

      apiCall('getStaffSequence', { staffId: sId, forceRefresh: !!forceRefresh }, function(res) {
        state.seqManagement.customers = (res && Array.isArray(res.customers)) ? res.customers : [];
        state.seqManagement.originalOrder = state.seqManagement.customers.map(function(c) {
          return c.customerId || getCustomerStableId(c);
        });
        state.seqManagement.hasUnsavedChanges = false;
        updateSeqUnsavedBadge(false);

        var staffNameDisplay = res.staffName || state.seqManagement.currentStaffName;
        document.getElementById('seqCurrentStaffName').textContent = staffNameDisplay;
        var selStaff = (state.staffList || state.adminStaffList || []).find(function(s) {
          return (s.id || '').toUpperCase() === (sId || '').toUpperCase();
        });
        var seqAvatarImg = document.getElementById('seqStaffAvatarImg');
        var seqAvatarDot = document.getElementById('seqStaffAvatarDot');
        var selPhoto = selStaff ? (selStaff.photoUrl || selStaff.photo_url || '') : '';
        if (selPhoto && seqAvatarImg) {
          seqAvatarImg.src = selPhoto;
          seqAvatarImg.style.display = 'inline-block';
          if (seqAvatarDot) seqAvatarDot.style.display = 'none';
        } else if (seqAvatarDot) {
          seqAvatarDot.textContent = (staffNameDisplay || 'S').charAt(0).toUpperCase();
          seqAvatarDot.style.display = 'inline-flex';
          if (seqAvatarImg) seqAvatarImg.style.display = 'none';
        }
        document.getElementById('seqTotalCustCount').textContent = state.seqManagement.customers.length;

        var statusBadge = document.getElementById('seqCustomStatusBadge');
        if (statusBadge) {
          if (res.hasCustomSequence) {
            statusBadge.className = 'seq-status-badge custom';
            statusBadge.textContent = '✓ Custom Route Active';
          } else {
            statusBadge.className = 'seq-status-badge default';
            statusBadge.textContent = 'Default Route Order';
          }
        }

        renderAdminSequenceList();
      }, function(err) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--danger-red); font-size:13px; font-weight:600;">❌ Failed to load sequence: ' + escapeHtml(err.error || err) + '</div>';
        showSeqAlert('Failed to load sequence: ' + (err.error || err), 'error');
      });
    }

    function switchSeqViewMode(mode) {
      if (!state.seqManagement) state.seqManagement = {};
      state.seqManagement.viewMode = mode || 'card';
      var btnCard = document.getElementById('btnSeqViewCard');
      var btnCompact = document.getElementById('btnSeqViewCompact');
      if (btnCard) btnCard.classList.toggle('active', state.seqManagement.viewMode === 'card');
      if (btnCompact) btnCompact.classList.toggle('active', state.seqManagement.viewMode === 'compact');
      renderAdminSequenceList();
    }

    function renderAdminSequenceList() {
      var container = document.getElementById('seqCustomerList');
      if (!container) return;

      var allCustomers = state.seqManagement.customers || [];
      if (allCustomers.length === 0) {
        container.innerHTML = '<div class="empty-state-card">' +
          '<div class="empty-icon-wrap">🚗</div>' +
          '<h4 class="empty-title">No Daily Clean Customers Assigned</h4>' +
          '<p class="empty-desc">Staff <strong>' + escapeHtml(state.seqManagement.currentStaffName) + '</strong> currently has no Daily Car Cleaning customers assigned.</p>' +
          '<div style="margin-top:12px;"><button type="button" class="btn-clear-search-empty" onclick="switchAdminTab(\'records\')">📋 Assign in Customer Records</button></div>' +
        '</div>';
        return;
      }

      var q = (state.seqManagement.searchQuery || '').trim().toLowerCase();
      var displayItems = allCustomers;
      if (q) {
        displayItems = allCustomers.filter(function(c) {
          return recordMatchesBilingualSearch(c, q);
        });
      }

      if (displayItems.length === 0) {
        container.innerHTML = '<div class="empty-state-card">' +
          '<div class="empty-icon-wrap">🔍</div>' +
          '<h4 class="empty-title">No Vehicles Found Matching Search</h4>' +
          '<p class="empty-desc">No customers found matching \"' + escapeHtml(state.seqManagement.searchQuery) + '\".</p>' +
          '<div style="margin-top:12px;"><button type="button" class="btn-clear-search-empty" onclick="clearSeqSearch()">✕ Clear Search</button></div>' +
        '</div>';
        return;
      }

      var total = allCustomers.length;
      var isCompact = (state.seqManagement.viewMode === 'compact');

      if (isCompact) {
        // Modern Compact Table View for fast navigation across 50+ customers
        var tblHtml = '<div class="records-table-wrapper" style="margin-top: 6px;">';
        tblHtml += '<table class="seq-compact-table">';
        tblHtml += '<thead><tr>';
        tblHtml += '<th style="width: 80px; text-align: center;">Position</th>';
        tblHtml += '<th style="width: 140px;">Vehicle</th>';
        tblHtml += '<th>Customer</th>';
        tblHtml += '<th>Address</th>';
        tblHtml += '<th style="text-align: right; width: 220px;">Quick Reorder</th>';
        tblHtml += '</tr></thead><tbody>';

        displayItems.forEach(function(cust) {
          var masterIndex = allCustomers.indexOf(cust);
          var seqNum = masterIndex + 1;
          var custName = escapeHtml(cust.customerName || 'Customer');
          var cleanPhone = normalizeIndianMobile(cust.customerNumber);
          var formattedPhone = cleanPhone ? formatIndianMobile(cleanPhone) : '';
          var rawVeh = cust.vehicle || cust.vehicleNumbers || '';
          var vehInfo = parseVehicleDetails(rawVeh);
          var address = escapeHtml(cust.address || '—');
          var custId = cust.customerId || getCustomerStableId(cust);

          tblHtml += '<tr data-id="' + escapeHtml(custId) + '" class="' + (state.seqManagement.lastMovedCustId === custId ? 'seq-row-highlight' : '') + '">';
          tblHtml += '  <td style="text-align: center;">';
          tblHtml += '    <div class="seq-num-badge-wrap">';
          tblHtml += '      <span class="seq-num-prefix">#</span>';
          tblHtml += '      <input type="number" class="seq-num-input" value="' + seqNum + '" min="1" max="' + total + '" onchange="handleSeqNumberInput(\'' + escapeHtml(custId) + '\', this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}" title="Type rank number (1-' + total + ') and press Enter">';
          tblHtml += '    </div>';
          tblHtml += '  </td>';
          tblHtml += '  <td><span class="vehicle-plate-badge" style="font-size: 11.5px; padding: 2px 6px;"><strong>' + escapeHtml(vehInfo.reg || 'Vehicle') + '</strong></span></td>';
          tblHtml += '  <td><strong style="color: var(--text-primary);">' + custName + '</strong>' + (formattedPhone ? '<br><span style="font-size: 11px; color: var(--text-muted);">📞 ' + escapeHtml(formattedPhone) + '</span>' : '') + '</td>';
          tblHtml += '  <td style="font-size: 11.5px; color: var(--text-secondary); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + address + '</td>';
          tblHtml += '  <td style="text-align: right;">';
          tblHtml += '    <div style="display: inline-flex; gap: 4px; justify-content: flex-end; align-items: center;">';
          tblHtml += '      <button type="button" class="btn-seq-move btn-seq-top" onclick="moveSeqItemExtreme(\'' + escapeHtml(custId) + '\', \'top\')" title="Move to Top (Rank #1)" ' + (masterIndex === 0 ? 'disabled' : '') + '><svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg><span>Top</span></button>';
          tblHtml += '      <button type="button" class="btn-seq-move btn-seq-up" onclick="moveSeqItemUp(' + masterIndex + ')" title="Move Up 1" ' + (masterIndex === 0 ? 'disabled' : '') + '><svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg></button>';
          tblHtml += '      <button type="button" class="btn-seq-move btn-seq-down" onclick="moveSeqItemDown(' + masterIndex + ')" title="Move Down 1" ' + (masterIndex === total - 1 ? 'disabled' : '') + '><svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>';
          tblHtml += '      <button type="button" class="btn-seq-move btn-seq-bottom" onclick="moveSeqItemExtreme(\'' + escapeHtml(custId) + '\', \'bottom\')" title="Move to Bottom (Rank #' + total + ')" ' + (masterIndex === total - 1 ? 'disabled' : '') + '><svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>End</span></button>';
          tblHtml += '    </div>';
          tblHtml += '  </td>';
          tblHtml += '</tr>';
        });

        tblHtml += '</tbody></table></div>';
        container.innerHTML = tblHtml;
        return;
      }

      // Detailed Card View with Drag-Drop and Direct Rank Input
      var html = '';
      displayItems.forEach(function(cust) {
        var masterIndex = allCustomers.indexOf(cust);
        var seqNum = masterIndex + 1;
        var custName = escapeHtml(cust.customerName || 'Customer');
        var cleanPhone = normalizeIndianMobile(cust.customerNumber);
        var formattedPhone = cleanPhone ? formatIndianMobile(cleanPhone) : '';
        var rawVeh = cust.vehicle || cust.vehicleNumbers || '';
        var vehInfo = parseVehicleDetails(rawVeh);
        var address = escapeHtml(cust.address || '');
        var staffName = escapeHtml(cust.staffName || state.seqManagement.currentStaffName || '');
        var custId = cust.customerId || getCustomerStableId(cust);
        var isHighlighted = (state.seqManagement.lastMovedCustId === custId);

        html += '<div class="seq-card-row ' + (isHighlighted ? 'seq-row-highlight' : '') + '" draggable="true" data-id="' + escapeHtml(custId) + '" data-index="' + masterIndex + '" ondragstart="handleSeqDragStart(event)" ondragover="handleSeqDragOver(event)" ondragleave="handleSeqDragLeave(event)" ondrop="handleSeqDrop(event)" ondragend="handleSeqDragEnd(event)">';
        
        // Col 1: Drag Handle & Rank Badge
        html += '  <div class="seq-handle-col">';
        html += '    <div class="seq-drag-handle" title="Drag to reorder">⋮⋮</div>';
        html += '    <div class="seq-num-badge-wrap" title="Type rank number & hit Enter">';
        html += '      <span class="seq-num-prefix">#</span>';
        html += '      <input type="number" class="seq-num-input" value="' + seqNum + '" min="1" max="' + total + '" onchange="handleSeqNumberInput(\'' + escapeHtml(custId) + '\', this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}">';
        html += '    </div>';
        html += '  </div>';

        // Col 2: Customer Name & Phone
        html += '  <div class="seq-cust-col">';
        html += '    <strong class="seq-cust-name" title="' + custName + '">' + custName + '</strong>';
        if (cleanPhone) {
          html += '    <span class="seq-cust-phone">📞 ' + escapeHtml(formattedPhone) + '</span>';
        }
        html += '  </div>';

        // Col 3: Vehicle Plate & Model
        html += '  <div class="seq-veh-col">';
        html += '    <span class="seq-veh-badge">🚘 <strong>' + escapeHtml(vehInfo.reg || 'Vehicle') + '</strong>' + (vehInfo.model ? ' • ' + escapeHtml(vehInfo.model) : '') + '</span>';
        html += '  </div>';

        // Col 4: Primary & Secondary Addresses & Maps (Stretches across middle desktop area)
        var primaryMapsUrl = formatGoogleMapsUrl(cust.googleMapsUrl, address);
        var secAddr = escapeHtml(cust.secondaryAddress || '');
        var secMapsUrl = formatGoogleMapsUrl(cust.secondaryMapsUrl, secAddr);

        html += '  <div class="seq-addr-col">';
        html += '    <div class="seq-addr-item" title="Primary: ' + (address || 'None') + '">';
        html += '      <span class="seq-addr-pin">📍</span>';
        html += '      <span class="seq-addr-text' + (address ? '' : ' seq-addr-empty') + '">' + (address || 'No address provided') + '</span>';
        if (primaryMapsUrl) {
          html += '    <a href="' + escapeHtml(primaryMapsUrl) + '" target="_blank" rel="noopener noreferrer" class="seq-mini-map-btn" title="Open Google Maps" onclick="event.stopPropagation();">Map ↗</a>';
        }
        html += '    </div>';
        if (secAddr || secMapsUrl) {
          html += '    <div class="seq-addr-item seq-addr-sec" title="Secondary: ' + (secAddr || 'None') + '">';
          html += '      <span class="seq-addr-pin">🏢</span>';
          html += '      <span class="seq-addr-text seq-addr-sec-text"><strong>2nd:</strong> ' + (secAddr || 'Location on map') + '</span>';
          if (secMapsUrl) {
            html += '    <a href="' + escapeHtml(secMapsUrl) + '" target="_blank" rel="noopener noreferrer" class="seq-mini-map-btn seq-mini-map-sec" title="Open Secondary Google Maps" onclick="event.stopPropagation();">2nd Map ↗</a>';
          }
          html += '    </div>';
        }
        html += '  </div>';

        // Col 5: Staff Badge
        html += '  <div class="seq-staff-col">';
        html += '    <span class="seq-staff-badge">👤 ' + staffName + '</span>';
        html += '  </div>';

        // Col 6: Horizontal Actions Toolbar (Clean SVG icons & labels)
        html += '  <div class="seq-actions-col">';
        html += '    <button type="button" class="btn-seq-move btn-seq-top" onclick="moveSeqItemExtreme(\'' + escapeHtml(custId) + '\', \'top\')" title="Move to Top (Rank #1)" ' + (masterIndex === 0 ? 'disabled' : '') + '>';
        html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
        html += '      <span>Top</span>';
        html += '    </button>';
        html += '    <button type="button" class="btn-seq-move btn-seq-up" onclick="moveSeqItemUp(' + masterIndex + ')" title="Move Up 1" ' + (masterIndex === 0 ? 'disabled' : '') + '>';
        html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>';
        html += '    </button>';
        html += '    <button type="button" class="btn-seq-move btn-seq-down" onclick="moveSeqItemDown(' + masterIndex + ')" title="Move Down 1" ' + (masterIndex === total - 1 ? 'disabled' : '') + '>';
        html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
        html += '    </button>';
        html += '    <button type="button" class="btn-seq-move btn-seq-bottom" onclick="moveSeqItemExtreme(\'' + escapeHtml(custId) + '\', \'bottom\')" title="Move to Bottom (Rank #' + total + ')" ' + (masterIndex === total - 1 ? 'disabled' : '') + '>';
        html += '      <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
        html += '      <span>End</span>';
        html += '    </button>';
        html += '  </div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    function handleSeqNumberInput(custId, newPositionStr) {
      var newPos = parseInt(newPositionStr, 10);
      var arr = state.seqManagement.customers;
      if (!arr || arr.length === 0) return;
      if (isNaN(newPos)) {
        renderAdminSequenceList();
        return;
      }
      if (newPos < 1) newPos = 1;
      if (newPos > arr.length) newPos = arr.length;

      var currentIdx = arr.findIndex(function(c) {
        return (c.customerId || getCustomerStableId(c)) === custId;
      });
      if (currentIdx === -1) return;

      var targetIdx = newPos - 1;
      if (currentIdx === targetIdx) {
        renderAdminSequenceList();
        return;
      }

      var moved = arr.splice(currentIdx, 1)[0];
      arr.splice(targetIdx, 0, moved);

      state.seqManagement.lastMovedCustId = custId;
      markSeqChanged();
      renderAdminSequenceList();

      setTimeout(function() {
        var el = document.querySelector('[data-id="' + custId + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 40);
    }

    function moveSeqItemExtreme(custId, direction) {
      var arr = state.seqManagement.customers;
      if (!arr || arr.length === 0) return;
      var currentIdx = arr.findIndex(function(c) {
        return (c.customerId || getCustomerStableId(c)) === custId;
      });
      if (currentIdx === -1) return;

      var targetIdx = direction === 'top' ? 0 : (arr.length - 1);
      if (currentIdx === targetIdx) return;

      var moved = arr.splice(currentIdx, 1)[0];
      arr.splice(targetIdx, 0, moved);

      state.seqManagement.lastMovedCustId = custId;
      markSeqChanged();
      renderAdminSequenceList();

      setTimeout(function() {
        var el = document.querySelector('[data-id="' + custId + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 40);
    }

    function promptSeqMove(custId) {
      var arr = state.seqManagement.customers;
      if (!arr || arr.length === 0) return;
      var total = arr.length;
      var currentIdx = arr.findIndex(function(c) {
        return (c.customerId || getCustomerStableId(c)) === custId;
      });
      if (currentIdx === -1) return;
      var cust = arr[currentIdx];
      var ans = prompt('Enter new position number for ' + (cust.customerName || 'customer') + ' (1 to ' + total + '):', String(currentIdx + 1));
      if (ans !== null && ans.trim() !== '') {
        handleSeqNumberInput(custId, ans.trim());
      }
    }

    function moveSeqItemUp(index) {
      if (index <= 0 || index >= state.seqManagement.customers.length) return;
      var arr = state.seqManagement.customers;
      var temp = arr[index];
      arr[index] = arr[index - 1];
      arr[index - 1] = temp;
      state.seqManagement.lastMovedCustId = (temp.customerId || getCustomerStableId(temp));
      markSeqChanged();
      renderAdminSequenceList();
    }

    function moveSeqItemDown(index) {
      if (index < 0 || index >= state.seqManagement.customers.length - 1) return;
      var arr = state.seqManagement.customers;
      var temp = arr[index];
      arr[index] = arr[index + 1];
      arr[index + 1] = temp;
      state.seqManagement.lastMovedCustId = (temp.customerId || getCustomerStableId(temp));
      markSeqChanged();
      renderAdminSequenceList();
    }

    function handleSeqDragStart(e) {
      var row = e.target.closest('.seq-card-row');
      if (!row) return;
      state.seqManagement.draggedIndex = parseInt(row.dataset.index, 10);
      row.classList.add('seq-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.index);
      }
    }

    function handleSeqDragOver(e) {
      e.preventDefault();
      var row = e.target.closest('.seq-card-row');
      if (row) {
        row.classList.add('seq-drag-over');
      }
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    }

    function handleSeqDragLeave(e) {
      var row = e.target.closest('.seq-card-row');
      if (row) {
        row.classList.remove('seq-drag-over');
      }
    }

    function handleSeqDrop(e) {
      e.preventDefault();
      var row = e.target.closest('.seq-card-row');
      if (!row) return;
      row.classList.remove('seq-drag-over');

      var fromIdx = state.seqManagement.draggedIndex;
      var toIdx = parseInt(row.dataset.index, 10);

      if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;

      var arr = state.seqManagement.customers;
      var movedItem = arr.splice(fromIdx, 1)[0];
      arr.splice(toIdx, 0, movedItem);

      state.seqManagement.lastMovedCustId = (movedItem.customerId || getCustomerStableId(movedItem));
      markSeqChanged();
      renderAdminSequenceList();
    }

    function handleSeqDragEnd(e) {
      state.seqManagement.draggedIndex = null;
      document.querySelectorAll('.seq-card-row').forEach(function(el) {
        el.classList.remove('seq-dragging');
        el.classList.remove('seq-drag-over');
      });
    }

    function markSeqChanged() {
      state.seqManagement.hasUnsavedChanges = true;
      updateSeqUnsavedBadge(true);
    }

    function updateSeqUnsavedBadge(show) {
      var badge = document.getElementById('seqUnsavedBadge');
      if (badge) {
        badge.style.display = show ? 'inline-flex' : 'none';
      }
      var saveBtn = document.getElementById('btnSaveSequence');
      if (saveBtn) {
        if (show) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '💾 Save Order';
          saveBtn.classList.remove('btn-seq-saved');
          saveBtn.classList.add('btn-seq-has-changes');
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
          saveBtn.removeAttribute('title');
        } else {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '✓ Order Saved';
          saveBtn.classList.remove('btn-seq-has-changes');
          saveBtn.classList.add('btn-seq-saved');
          saveBtn.style.opacity = '0.75';
          saveBtn.style.cursor = 'default';
          saveBtn.title = 'No unsaved sequence changes';
        }
      }
    }

    function handleSeqSearch(query) {
      state.seqManagement.searchQuery = query || '';
      var clearBtn = document.getElementById('btnSeqSearchClear');
      if (clearBtn) {
        clearBtn.style.display = state.seqManagement.searchQuery ? 'inline-block' : 'none';
      }
      renderAdminSequenceList();
    }

    function clearSeqSearch() {
      state.seqManagement.searchQuery = '';
      var input = document.getElementById('seqSearchInput');
      if (input) input.value = '';
      var clearBtn = document.getElementById('btnSeqSearchClear');
      if (clearBtn) clearBtn.style.display = 'none';
      renderAdminSequenceList();
    }

    function showSeqAlert(msg, type) {
      var banner = document.getElementById('seqAlertBanner');
      if (!banner) return;
      banner.className = 'seq-alert-banner seq-alert-' + (type === 'error' ? 'error' : 'success');
      var icon = type === 'error' ? '❌' : '✅';
      banner.innerHTML = '<span>' + icon + '</span> <span>' + escapeHtml(msg) + '</span>';
      banner.style.display = 'flex';
    }

    function hideSeqAlert() {
      var banner = document.getElementById('seqAlertBanner');
      if (banner) banner.style.display = 'none';
    }

    function saveCurrentStaffSequence() {
      var sId = state.seqManagement.currentStaffId;
      if (!sId) {
        showSeqAlert('Please select a staff member first.', 'error');
        return;
      }

      var saveBtn = document.getElementById('btnSaveSequence');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '⏳ Saving...';
      }

      var sequencePayload = state.seqManagement.customers.map(function(c, idx) {
        return {
          customerId: c.customerId || getCustomerStableId(c),
          sequenceOrder: idx + 1
        };
      });

      apiCall('saveStaffSequence', { staffId: sId, sequence: sequencePayload }, function(res) {
        state.seqManagement.hasUnsavedChanges = false;
        updateSeqUnsavedBadge(false);
        showSeqAlert(res.message || 'Route sequence for ' + state.seqManagement.currentStaffName + ' saved successfully!', 'success');
        
        var statusBadge = document.getElementById('seqCustomStatusBadge');
        if (statusBadge) {
          statusBadge.className = 'seq-status-badge custom';
          statusBadge.textContent = '✓ Custom Route Active';
        }
      }, function(err) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '💾 Save Order';
        }
        showSeqAlert('Failed to save sequence: ' + (err.error || err), 'error');
      });
    }

    function confirmResetSequence(triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var modal = document.getElementById('seqResetModal');
      var nameEl = document.getElementById('seqResetStaffName');
      if (nameEl) nameEl.textContent = state.seqManagement.currentStaffName + ' (' + state.seqManagement.currentStaffId + ')';
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function openSeqResetModal(triggerEl) {
      return confirmResetSequence(triggerEl);
    }

    function closeSeqResetModal() {
      var modal = document.getElementById('seqResetModal');
      if (modal) {
        modal.style.display = 'none';
        if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
          document.body.style.overflow = '';
        }
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function executeResetSequence() {
      closeSeqResetModal();
      var sId = state.seqManagement.currentStaffId;
      if (!sId) return;

      var resetBtn = document.getElementById('btnResetSequence');
      if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.innerHTML = '⏳ Resetting...';
      }

      apiCall('resetStaffSequence', { staffId: sId }, function(res) {
        if (resetBtn) {
          resetBtn.disabled = false;
          resetBtn.innerHTML = '⚠️ Reset to Default';
        }
        state.seqManagement.hasUnsavedChanges = false;
        updateSeqUnsavedBadge(false);
        showSeqAlert('Route sequence reset to default route order.', 'success');
        loadStaffSequenceData();
      }, function(err) {
        if (resetBtn) {
          resetBtn.disabled = false;
          resetBtn.innerHTML = '⚠️ Reset to Default';
        }
        showSeqAlert('Failed to reset: ' + (err.error || err), 'error');
      });
    }

    /* =========================================================================
       TASK P2.6: STAFF DAILY CLEAN LOCAL COMPLETION TRACKING & AUTO DAILY RESET
       - Entirely client-side browser localStorage tracking. Never synced to backend.
       - Asia/Kolkata timezone calendar date key (YYYY-MM-DD).
       - Structured localStorage layout:
           dailyCleanCompletion:
             staffId:
               date:
                 customerId: true
       - Preserved across live polling, sequence reorders, same-day page refresh,
         and same-day staff logout & login.
       - Automatic midnight fresh reset without manual reload or timer churn.
       ========================================================================= */
    var DAILY_CLEAN_STORAGE_KEY = 'cwp_daily_clean_completion';

    function getAsiaKolkataDateKey(dateObj) {
      var d = dateObj || new Date();
      try {
        var formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        var parts = formatter.formatToParts(d);
        var y = '', m = '', day = '';
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === 'year') y = parts[i].value;
          if (parts[i].type === 'month') m = parts[i].value;
          if (parts[i].type === 'day') day = parts[i].value;
        }
        if (y && m && day) return y + '-' + m + '-' + day;
      } catch (e) {}

      // Reliable UTC offset fallback for Asia/Kolkata (UTC +05:30)
      var utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      var kolkataTime = new Date(utc + (5.5 * 3600000));
      var yr = kolkataTime.getFullYear();
      var mo = String(kolkataTime.getMonth() + 1).padStart(2, '0');
      var dy = String(kolkataTime.getDate()).padStart(2, '0');
      return yr + '-' + mo + '-' + dy;
    }

    function getTodayDateKey() {
      return getAsiaKolkataDateKey();
    }

    function getMsUntilMidnightAsiaKolkata(dateObj) {
      var d = dateObj || new Date();
      var istOffsetMs = 5.5 * 60 * 60 * 1000;
      var istTime = d.getTime() + istOffsetMs;
      var istDate = new Date(istTime);
      var nextMidnightIst = new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate() + 1, 0, 0, 1, 0));
      var diff = nextMidnightIst.getTime() - istDate.getTime();
      return Math.max(1000, diff);
    }

    function getCleanStaffId(optStaffId) {
      var raw = optStaffId || state.activeStaffId || getActiveStaffId() || '';
      return String(raw).trim().toUpperCase() || 'STF';
    }

    function getDailyCleanStore() {
      try {
        var raw = localStorage.getItem(DAILY_CLEAN_STORAGE_KEY);
        var parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function saveDailyCleanStore(store) {
      try {
        localStorage.setItem(DAILY_CLEAN_STORAGE_KEY, JSON.stringify(store));
      } catch (e) {
        console.error('Failed to save dailyCleanCompletion to localStorage:', e);
      }
    }

    function cleanupOldDatesInStore(store, activeStaffId, todayKey) {
      if (!store || typeof store !== 'object') return;
      try {
        var todayMs = new Date(todayKey + 'T00:00:00+05:30').getTime();
        var maxAgeMs = 7 * 24 * 60 * 60 * 1000;
        Object.keys(store).forEach(function(sId) {
          if (store[sId] && typeof store[sId] === 'object') {
            Object.keys(store[sId]).forEach(function(dKey) {
              var dMs = new Date(dKey + 'T00:00:00+05:30').getTime();
              if (!isNaN(dMs) && (todayMs - dMs > maxAgeMs)) {
                delete store[sId][dKey];
              }
            });
          }
        });
      } catch (e) {}
    }

    function getCompletedCustomersSet(optStaffId, optDateKey) {
      var staffId = getCleanStaffId(optStaffId);
      var dateKey = optDateKey || getTodayDateKey();
      var set = new Set();

      // Read from structured store: dailyCleanCompletion -> staffId -> date -> customerId
      var store = getDailyCleanStore();
      var staffMap = store[staffId] || store[staffId.toLowerCase()] || store[staffId.toUpperCase()];
      if (staffMap && staffMap[dateKey]) {
        var dayMap = staffMap[dateKey];
        Object.keys(dayMap).forEach(function(cId) {
          var val = dayMap[cId];
          if (val === true || (val && (val.done === true || val.completed === true))) {
            set.add(cId);
          }
        });
      }

      // Backward compatibility with legacy key (e.g. cwp_clean_done_2026-11-06_STF01)
      var legacyKeys = [
        'cwp_clean_done_' + dateKey + '_' + staffId,
        'cwp_clean_done_' + dateKey + '_' + staffId.toLowerCase()
      ];
      legacyKeys.forEach(function(legKey) {
        try {
          var rawLegacy = localStorage.getItem(legKey);
          if (rawLegacy) {
            var arr = JSON.parse(rawLegacy);
            if (Array.isArray(arr)) {
              arr.forEach(function(id) { set.add(id); });
            }
          }
        } catch (e) {}
      });

      return set;
    }

    function isCustomerDoneToday(custId, optStaffId) {
      if (!custId) return false;
      return getCompletedCustomersSet(optStaffId).has(custId);
    }

    function toggleCustomerDoneToday(custId, optStaffId) {
      if (!custId) return;
      if (!state.currentDateKey) state.currentDateKey = getTodayDateKey();
      var staffId = getCleanStaffId(optStaffId);
      var dateKey = getTodayDateKey();

      var store = getDailyCleanStore();
      if (!store[staffId]) store[staffId] = {};
      if (!store[staffId][dateKey]) store[staffId][dateKey] = {};

      var currentSet = getCompletedCustomersSet(staffId, dateKey);
      var willBeDone = !currentSet.has(custId);

      if (willBeDone) {
        store[staffId][dateKey][custId] = true;
      } else {
        delete store[staffId][dateKey][custId];
      }

      cleanupOldDatesInStore(store, staffId, dateKey);
      saveDailyCleanStore(store);

      // Keep legacy mirror in sync
      try {
        var legacyKey = 'cwp_clean_done_' + dateKey + '_' + staffId;
        var completedList = Object.keys(store[staffId][dateKey] || {}).filter(function(k) {
          var v = store[staffId][dateKey][k];
          return v === true || (v && (v.done === true || v.completed === true));
        });
        localStorage.setItem(legacyKey, JSON.stringify(completedList));
      } catch (e) {}

      updateRouteProgressBar();
      if (state.currentStaffFilteredList) {
        renderCustomerCards(state.currentStaffFilteredList);
      }
    }

    function getCustomerCompletionData(custId, optStaffId, optDateKey) {
      var staffId = getCleanStaffId(optStaffId);
      var dateKey = optDateKey || getTodayDateKey();
      var store = getDailyCleanStore();
      var staffMap = store[staffId] || store[staffId.toLowerCase()] || store[staffId.toUpperCase()];
      if (staffMap && staffMap[dateKey] && staffMap[dateKey][custId]) {
        var val = staffMap[dateKey][custId];
        if (typeof val === 'object') return val;
        if (val === true) return { done: true };
      }
      return null;
    }

    /* =========================================================================
       STAFF DAILY CAR CLEANING: PHOTO CAPTURE & VISUAL CHECK WORKFLOW
       ========================================================================= */
    var cleaningCameraStream = null;
    var currentCameraFacingMode = 'environment';
    var activeCameraTarget = null;
    var currentSnappedPhotoBase64 = '';

    function handleDailyCleanClick(custId, index) {
      var isHi = (state.lang !== 'en');
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;

      var isDone = isCustomerDoneToday(custId);
      if (isDone) {
        // Customer is already completed today: give options
        var completionData = getCustomerCompletionData(custId);
        var hasPhoto = completionData && completionData.photoUrl;
        var confirmMsg = isHi
          ? 'यह गाड़ी आज साफ हो चुकी है!\n' + (hasPhoto ? '✓ फोटो सुरक्षित है।\n' : '') + '\nक्या आप दोबारा फोटो लेना चाहते हैं (OK), या सफाई स्थिति रीसेट करना चाहते हैं (Cancel)?'
          : 'This vehicle is already marked cleaned today!\n' + (hasPhoto ? '✓ Photo saved.\n' : '') + '\nClick OK to retake photo, or Cancel to mark as undone.';
        
        if (hasPhoto) {
          openImageModal(completionData.photoUrl, item.customerName, item.vehicle || item.vehicleNumbers);
        } else {
          if (confirm(confirmMsg)) {
            openCleaningCameraModal(custId, index);
          } else {
            toggleCustomerDoneToday(custId);
          }
        }
        return;
      }

      // Not done: Open Camera Modal for live photo capture
      openCleaningCameraModal(custId, index);
    }

    function openCleaningCameraModal(custId, index) {
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;

      activeCameraTarget = { custId: custId, index: index, item: item };
      currentSnappedPhotoBase64 = '';

      var modal = document.getElementById('cleaningCameraModal');
      var custEl = document.getElementById('cameraModalCustName');
      var vehEl = document.getElementById('cameraModalVehInfo');

      if (custEl) custEl.textContent = item.customerName || item.name || 'Customer';
      if (vehEl) vehEl.textContent = item.vehicle || item.vehicleNumbers || 'Vehicle';

      // Reset checkbox & button for Car Not Present tag
      var notPresentCheck = document.getElementById('cameraCarNotPresentCheck');
      if (notPresentCheck) notPresentCheck.checked = false;
      var btnConfirm = document.getElementById('btnConfirmCleanPhoto');
      if (btnConfirm) {
        btnConfirm.classList.remove('btn-confirm-not-present');
        btnConfirm.innerHTML = '<span>✓</span> ' + (state && state.lang === 'hi' ? 'पुष्टि करें (Confirm & Save)' : 'Confirm & Save');
      }

      // Reset view visibility
      var capView = document.getElementById('cameraCaptureView');
      var revView = document.getElementById('cameraReviewView');
      var upView = document.getElementById('cameraUploadingView');
      if (capView) capView.style.display = 'block';
      if (revView) revView.style.display = 'none';
      if (upView) upView.style.display = 'none';

      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }

      startCleaningCameraFeed(currentCameraFacingMode);
    }

    function closeCleaningCameraModal() {
      stopCleaningCameraFeed();
      var modal = document.getElementById('cleaningCameraModal');
      if (modal) {
        modal.style.display = 'none';
        if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
          document.body.style.overflow = '';
        }
      }
      activeCameraTarget = null;
      currentSnappedPhotoBase64 = '';
    }

    function startCleaningCameraFeed(facing) {
      stopCleaningCameraFeed();
      currentCameraFacingMode = facing || 'environment';

      var video = document.getElementById('cleaningCameraFeed');
      if (!video) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported in this browser, relying on native camera button.');
        return;
      }

      var constraints = {
        video: {
          facingMode: { ideal: currentCameraFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
          cleaningCameraStream = stream;
          video.srcObject = stream;
          video.play().catch(function(e) { console.log('Video play error:', e); });
        })
        .catch(function(err) {
          console.warn('Camera access denied or unavailable:', err.message);
          showToast('लाइव कैमरा उपलब्ध नहीं है — नीचे "फ़ोन कैमरा" बटन का उपयोग करें', '📷');
        });
    }

    function stopCleaningCameraFeed() {
      if (cleaningCameraStream) {
        try {
          cleaningCameraStream.getTracks().forEach(function(t) { t.stop(); });
        } catch (e) {}
        cleaningCameraStream = null;
      }
      var video = document.getElementById('cleaningCameraFeed');
      if (video) video.srcObject = null;
    }

    function flipCleaningCamera() {
      currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
      startCleaningCameraFeed(currentCameraFacingMode);
    }

    function snapCleaningPhoto() {
      var video = document.getElementById('cleaningCameraFeed');
      if (!video || !cleaningCameraStream) {
        // Fallback: Trigger native camera file picker
        var fileIn = document.getElementById('cameraNativeFileInput');
        if (fileIn) fileIn.click();
        return;
      }

      var vw = video.videoWidth || 640;
      var vh = video.videoHeight || 480;

      var canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, vw, vh);

      stopCleaningCameraFeed();

      var rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      showVisualCheckReview(rawDataUrl);
    }

    function handleNativeCameraFile(e) {
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function(evt) {
        stopCleaningCameraFeed();
        showVisualCheckReview(evt.target.result);
      };
      reader.readAsDataURL(file);
    }

    function handleCarNotPresentToggle(el) {
      var isChecked = el && el.checked;
      var row = document.getElementById('cameraCarNotPresentTagRow');
      var badge = document.getElementById('cameraCarNotPresentBadge');
      var btn = document.getElementById('btnConfirmCleanPhoto');
      var carTag = document.getElementById('reviewCarTag');
      var item = activeCameraTarget ? activeCameraTarget.item : {};
      var vName = (item.vehicle || item.vehicleNumbers || 'Vehicle');
      if (row) {
        if (isChecked) row.classList.add('is-checked');
        else row.classList.remove('is-checked');
      }
      if (badge) {
        badge.style.display = isChecked ? 'inline-block' : 'none';
      }
      if (isChecked) {
        if (btn) {
          btn.classList.add('btn-confirm-not-present');
          btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;" aria-hidden="true">no_crash</span> <span>' + (state && state.lang === 'hi' ? 'दर्ज करें: कार मौजूद नहीं' : 'Save: Car Not Present') + '</span>';
        }
        if (carTag) carTag.textContent = '🚗❌ ' + vName + ' [कार नहीं थी]';
      } else {
        if (btn) {
          btn.classList.remove('btn-confirm-not-present');
          btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 19px;" aria-hidden="true">check_circle</span> <span>' + (state && state.lang === 'hi' ? 'पुष्टि करें (Confirm & Save)' : 'Confirm & Save') + '</span>';
        }
        if (carTag) carTag.textContent = '🚗 ' + vName;
      }
    }
    window.handleCarNotPresentToggle = handleCarNotPresentToggle;

    function showVisualCheckReview(imageDataUrl) {
      currentSnappedPhotoBase64 = imageDataUrl;

      // Reset car not present toggle for each new capture
      var cnpCheck = document.getElementById('cameraCarNotPresentCheck');
      if (cnpCheck) {
        cnpCheck.checked = false;
        handleCarNotPresentToggle(cnpCheck);
      }

      var capView = document.getElementById('cameraCaptureView');
      var revView = document.getElementById('cameraReviewView');
      var prevImg = document.getElementById('cameraPreviewImg');

      if (capView) capView.style.display = 'none';
      if (revView) revView.style.display = 'block';
      if (prevImg) prevImg.src = imageDataUrl;

      // Update metadata tags on preview
      var item = activeCameraTarget ? activeCameraTarget.item : {};
      var carTag = document.getElementById('reviewCarTag');
      var timeTag = document.getElementById('reviewTimeTag');
      var custTag = document.getElementById('reviewCustTag');
      var staffTag = document.getElementById('reviewStaffTag');

      var now = new Date();
      var timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      var dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      if (carTag) carTag.textContent = '🚗 ' + (item.vehicle || item.vehicleNumbers || 'Vehicle');
      if (timeTag) timeTag.textContent = '⏰ ' + dateStr + ', ' + timeStr;
      if (custTag) custTag.textContent = '👤 ' + (item.customerName || item.name || 'Customer');
      var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';
      if (staffTag) staffTag.textContent = '👨‍🔧 ' + sName;
    }

    function retakeCleaningPhoto() {
      currentSnappedPhotoBase64 = '';
      var capView = document.getElementById('cameraCaptureView');
      var revView = document.getElementById('cameraReviewView');
      if (capView) capView.style.display = 'block';
      if (revView) revView.style.display = 'none';

      // Reset file input and car not present toggle
      var fileIn = document.getElementById('cameraNativeFileInput');
      if (fileIn) fileIn.value = '';
      var cnpCheck = document.getElementById('cameraCarNotPresentCheck');
      if (cnpCheck) {
        cnpCheck.checked = false;
        handleCarNotPresentToggle(cnpCheck);
      }

      startCleaningCameraFeed(currentCameraFacingMode);
    }

    function confirmAndSaveCleaningPhoto() {
      if (!activeCameraTarget || !currentSnappedPhotoBase64) return;

      var target = activeCameraTarget;
      var item = target.item;
      var custId = target.custId;

      var notPresentCheck = document.getElementById('cameraCarNotPresentCheck');
      var isCarNotPresent = Boolean(notPresentCheck && notPresentCheck.checked);

      var revView = document.getElementById('cameraReviewView');
      var upView = document.getElementById('cameraUploadingView');
      if (revView) revView.style.display = 'none';
      if (upView) upView.style.display = 'block';

      // 1. Client-Side Compression & Metadata Watermarking
      compressAndStampCleaningPhoto(currentSnappedPhotoBase64, item, function(compressedBase64) {
        var completedAtDevice = new Date().toISOString();
        var staffCode = state.activeStaffId || (state.staffData && state.staffData.staffId) || 'STF01';

        var cleanPayload = {
          subscriptionId: item.subscriptionId || null,
          vehicleId: (item.vehicles && item.vehicles[0] && item.vehicles[0].id) || item.vehicleId || null,
          customerId: item.customerId || custId,
          customerName: item.customerName || item.name,
          registrationNo: item.vehicle || item.vehicleNumbers,
          photoBase64: compressedBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
          mimeType: 'image/jpeg',
          completedAtDevice: completedAtDevice,
          notes: isCarNotPresent ? 'Car not present (गाड़ी पार्किंग में मौजूद नहीं थी - खाली स्पॉट फोटो)' : 'Daily car cleaning completed with photo proof',
          staffId: staffCode,
          carNotPresent: isCarNotPresent,
          tag: isCarNotPresent ? 'car_not_present' : null,
          status: isCarNotPresent ? 'car_not_present' : 'completed'
        };

        // 2. Upload to Server
        apiCall('recordDailyCleanWithPhoto', cleanPayload, function(res) {
          var uploadedUrl = res.photoUrl || '';
          
          // 3. Update Local Storage & Completion Store
          var dateKey = getTodayDateKey();
          var store = getDailyCleanStore();
          if (!store[staffCode]) store[staffCode] = {};
          if (!store[staffCode][dateKey]) store[staffCode][dateKey] = {};

          store[staffCode][dateKey][custId] = {
            done: true,
            carNotPresent: isCarNotPresent,
            tag: isCarNotPresent ? 'car_not_present' : null,
            status: isCarNotPresent ? 'car_not_present' : 'completed',
            photoUrl: uploadedUrl,
            completedAt: completedAtDevice,
            vehicle: item.vehicle || item.vehicleNumbers,
            customerName: item.customerName || item.name
          };

          saveDailyCleanStore(store);

          // Update legacy list mirror
          try {
            var legacyKey = 'cwp_clean_done_' + dateKey + '_' + staffCode;
            var list = Object.keys(store[staffCode][dateKey]).filter(function(k) {
              var v = store[staffCode][dateKey][k];
              return v === true || (v && v.done === true);
            });
            localStorage.setItem(legacyKey, JSON.stringify(list));
          } catch (e) {}

          // 4. Update UI
          closeCleaningCameraModal();
          updateRouteProgressBar();
          if (state.currentStaffFilteredList) {
            renderCustomerCards(state.currentStaffFilteredList);
          }

          var successMsg = isCarNotPresent ? 'गाड़ी मौजूद नहीं थी - रिकॉर्ड दर्ज हो गया! 🚫' : 'कार की सफाई सफलतापूर्वक दर्ज हो गई! ✓';
          showToast(successMsg, 'success');

          // 5. Trigger Instant WhatsApp Dispatch
          setTimeout(function() {
            triggerCleaningWhatsAppShare(item, uploadedUrl, completedAtDevice);
          }, 400);

        }, function(err) {
          console.error('Failed to save cleaning photo:', err);
          // Offline Fallback: Still mark completed locally and store photo locally
          var dateKey = getTodayDateKey();
          var store = getDailyCleanStore();
          if (!store[staffCode]) store[staffCode] = {};
          if (!store[staffCode][dateKey]) store[staffCode][dateKey] = {};

          store[staffCode][dateKey][custId] = {
            done: true,
            carNotPresent: isCarNotPresent,
            tag: isCarNotPresent ? 'car_not_present' : null,
            status: isCarNotPresent ? 'car_not_present' : 'completed',
            photoUrl: compressedBase64, // local data url
            completedAt: completedAtDevice,
            vehicle: item.vehicle || item.vehicleNumbers,
            customerName: item.customerName || item.name,
            pendingSync: true
          };
          saveDailyCleanStore(store);

          closeCleaningCameraModal();
          updateRouteProgressBar();
          if (state.currentStaffFilteredList) {
            renderCustomerCards(state.currentStaffFilteredList);
          }
          showToast('ऑफलाइन सुरक्षित: नेटवर्क आते ही सर्वर पर सिंक होगा!', 'warning');

          setTimeout(function() {
            triggerCleaningWhatsAppShare(item, '', completedAtDevice);
          }, 400);
        });
      });
    }

    function compressAndStampCleaningPhoto(dataUrl, item, callback) {
      var img = new Image();
      img.onload = function() {
        var maxDim = 1600;
        var w = img.width;
        var h = img.height;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');

        // Draw photo
        ctx.drawImage(img, 0, 0, w, h);

        // Draw professional watermarking banner on bottom
        var bannerHeight = Math.max(48, Math.round(h * 0.08));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(0, h - bannerHeight, w, bannerHeight);

        var notPresentCheck = document.getElementById('cameraCarNotPresentCheck');
        var isNotPresent = Boolean(notPresentCheck && notPresentCheck.checked);

        ctx.fillStyle = isNotPresent ? '#f59e0b' : '#38bdf8';
        var fontSize = Math.max(14, Math.round(bannerHeight * 0.32));
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        var vText = (isNotPresent ? '🚫 [NOT PRESENT] ' : '🚗 ') + (item.vehicle || item.vehicleNumbers || 'CWP Clean');
        var cText = ' • 👤 ' + (item.customerName || item.name || 'Customer');
        ctx.fillText(vText + cText, 16, h - (bannerHeight * 0.65));

        ctx.fillStyle = '#f1f5f9';
        var subFontSize = Math.max(11, Math.round(bannerHeight * 0.25));
        ctx.font = subFontSize + 'px sans-serif';

        var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';
        var dateFormatted = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        var metaLine = '👨‍🔧 ' + sName + ' • ⏰ ' + dateFormatted + ' IST • CWP Detailers';
        ctx.fillText(metaLine, 16, h - (bannerHeight * 0.25));

        var compressed = canvas.toDataURL('image/jpeg', 0.80);
        callback(compressed);
      };
      img.onerror = function() {
        callback(dataUrl);
      };
      img.src = dataUrl;
    }

    /* =========================================================================
       WHATSAPP DISPATCH & SHARING SYSTEM
       ========================================================================= */
    /* =========================================================================
       WHATSAPP DIRECT IMAGE DISPATCH & SHARING SYSTEM (Photo-First)
       ========================================================================= */
    var currentWaModalBlob = null;
    var currentWaModalFile = null;
    var currentWaModalItem = null;
    var currentWaModalSrc = '';

    function getCleaningPhotoFile(photoUrlOrBase64, vehicleNumber, callback) {
      var filename = 'CWP_' + (vehicleNumber ? String(vehicleNumber).replace(/[^a-zA-Z0-9]/g, '_') : 'Car') + '_' + Date.now() + '.jpg';

      if (!photoUrlOrBase64) {
        if (callback) callback(null, null);
        return;
      }

      // 1. Data URL (Base64)
      if (typeof photoUrlOrBase64 === 'string' && photoUrlOrBase64.startsWith('data:')) {
        try {
          var arr = photoUrlOrBase64.split(',');
          var mimeMatch = arr[0].match(/:(.*?);/);
          var mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
          var bstr = atob(arr[1]);
          var n = bstr.length;
          var u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          var blob = new Blob([u8arr], { type: mime });
          var file = (typeof File !== 'undefined') ? new File([blob], filename, { type: mime }) : blob;
          if (callback) callback(file, blob);
          return;
        } catch (e) {
          console.warn('Failed to parse base64 photo for WhatsApp:', e);
        }
      }

      // 2. Relative or Remote URL
      var fetchUrl = photoUrlOrBase64;
      if (typeof fetchUrl === 'string' && fetchUrl.startsWith('/')) {
        fetchUrl = (typeof window !== 'undefined' && window.location ? window.location.origin : '') + fetchUrl;
      }

      if (typeof fetch === 'function') {
        fetch(fetchUrl)
          .then(function(res) { return res.blob(); })
          .then(function(blob) {
            var mime = blob.type || 'image/jpeg';
            var file = (typeof File !== 'undefined') ? new File([blob], filename, { type: mime }) : blob;
            if (callback) callback(file, blob);
          })
          .catch(function(err) {
            console.warn('Failed to fetch photo blob for WhatsApp:', err);
            if (callback) callback(null, null);
          });
      } else {
        if (callback) callback(null, null);
      }
    }

    function copyImageBlobToClipboard(blob, callback) {
      if (typeof navigator === 'undefined' || !navigator || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
        if (callback) callback(false);
        return;
      }

      // If already image/png, write directly
      if (blob.type === 'image/png') {
        var item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item])
          .then(function() { if (callback) callback(true); })
          .catch(function(e) { if (callback) callback(false); });
        return;
      }

      // Convert to image/png via offscreen canvas
      if (typeof document !== 'undefined' && document.createElement) {
        var img = new Image();
        var url = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : '';
        img.onload = function() {
          if (url && URL.revokeObjectURL) URL.revokeObjectURL(url);
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(function(pngBlob) {
            if (pngBlob) {
              var clipItem = new ClipboardItem({ 'image/png': pngBlob });
              navigator.clipboard.write([clipItem])
                .then(function() { if (callback) callback(true); })
                .catch(function(err) { if (callback) callback(false); });
            } else {
              if (callback) callback(false);
            }
          }, 'image/png');
        };
        img.onerror = function() {
          if (url && URL.revokeObjectURL) URL.revokeObjectURL(url);
          if (callback) callback(false);
        };
        img.src = url;
      } else {
        if (callback) callback(false);
      }
    }

    function handleCustomerWhatsAppShare(custId, index) {
      var item = state.currentStaffFilteredList && state.currentStaffFilteredList[index];
      if (!item) return;

      var compData = getCustomerCompletionData(custId);
      var photoUrl = (compData && compData.photoUrl) || '';
      var completedAt = (compData && compData.completedAt) || new Date().toISOString();

      triggerCleaningWhatsAppShare(item, photoUrl, completedAt);
    }

    function triggerCleaningWhatsAppShare(item, photoUrl, completedAtTime, fallbackDataUrl) {
      var vName = (item && (item.vehicle || item.vehicleNumbers)) || 'Car';
      var cName = (item && (item.customerName || item.name)) || 'Customer';
      var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';

      var effectivePhoto = photoUrl || fallbackDataUrl || (typeof currentSnappedPhotoBase64 !== 'undefined' ? currentSnappedPhotoBase64 : '');

      if (!effectivePhoto && item) {
        var custId = item.id || item.customerId || (typeof getCustomerStableId === 'function' ? getCustomerStableId(item) : '');
        if (custId) {
          var compData = getCustomerCompletionData(custId);
          if (compData && compData.photoUrl) {
            effectivePhoto = compData.photoUrl;
          }
        }
      }

      if (!effectivePhoto) {
        showToast('सफाई फोटो नहीं मिली। कृपया पहले फोटो लें।', '⚠️');
        return;
      }

      getCleaningPhotoFile(effectivePhoto, vName, function(file, blob) {
        // 1. Mobile First: Native Web Share API with actual IMAGE file
        if (file && typeof navigator !== 'undefined' && navigator && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: 'CWP Cleaning Proof - ' + vName
          }).catch(function(err) {
            // If user did not simply cancel the dialog, open desktop helper
            if (err && err.name !== 'AbortError') {
              openDesktopWhatsAppImageHelper(blob, file, item, effectivePhoto);
            }
          });
          return;
        }

        // 2. Desktop / WhatsApp Web / Fallback: Copy Image & Open Helper
        openDesktopWhatsAppImageHelper(blob, file, item, effectivePhoto);
      });
    }

    function openDesktopWhatsAppImageHelper(blob, file, item, photoSrc, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      currentWaModalBlob = blob;
      currentWaModalFile = file;
      currentWaModalItem = item;
      currentWaModalSrc = photoSrc;

      var vName = (item && (item.vehicle || item.vehicleNumbers)) || 'Car';
      var sName = (state.staffData && state.staffData.staffName) || state.activeStaffName || 'Staff';

      var previewImg = document.getElementById('waShareModalPreviewImg');
      var vehTag = document.getElementById('waShareModalVehTag');
      var staffTag = document.getElementById('waShareModalStaffTag');
      var modal = document.getElementById('whatsAppImageShareModal');

      if (previewImg) previewImg.src = photoSrc;
      if (vehTag) vehTag.textContent = '🚗 ' + vName;
      if (staffTag) staffTag.textContent = '👨‍🔧 ' + sName;

      // Copy image to clipboard immediately
      if (blob) {
        copyImageBlobToClipboard(blob, function(success) {
          if (success) {
            showToast('📸 फोटो कॉपी हो चुकी है! WhatsApp में Ctrl+V (Paste) करें।', 'success');
          }
        });
      }

      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeWhatsAppImageModal() {
      var modal = document.getElementById('whatsAppImageShareModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function closeWhatsAppImageShareModal() {
      closeWhatsAppImageModal();
    }

    function proceedToWhatsAppChat() {
      var targetGroup = getStaffWhatsAppGroup();
      var targetUrl = 'https://web.whatsapp.com/';

      if (targetGroup) {
        var cleanTarget = targetGroup.trim();
        if (cleanTarget.startsWith('http://') || cleanTarget.startsWith('https://')) {
          targetUrl = cleanTarget;
        } else if (/^\d{10}$/.test(cleanTarget)) {
          targetUrl = 'https://web.whatsapp.com/send?phone=91' + cleanTarget;
        }
      }

      window.open(targetUrl, '_blank');
      showToast('चैट खुलते ही Ctrl+V (Paste) दबाकर फोटो भेजें', 'info');
      closeWhatsAppImageModal();
    }

    function copyWaModalImageAgain() {
      if (currentWaModalBlob) {
        copyImageBlobToClipboard(currentWaModalBlob, function(success) {
          if (success) {
            showToast('✓ फोटो क्लिपबोर्ड में कॉपी हो गई!', 'success');
          } else {
            showToast('क्लिपबोर्ड कॉपी असफल। नीचे डाउनलोड बटन का उपयोग करें।', 'warning');
          }
        });
      }
    }

    function downloadWaModalImage() {
      if (!currentWaModalSrc) return;
      var a = document.createElement('a');
      a.href = currentWaModalSrc;
      a.download = 'CWP_Car_Clean_' + Date.now() + '.jpg';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('फोटो डाउनलोड हो गई!', 'success');
    }

    function getStaffWhatsAppGroup() {
      var staffId = state.activeStaffId || 'STF01';
      return localStorage.getItem('cwp_staff_wa_group_' + staffId) || localStorage.getItem('cwp_staff_wa_group') || '';
    }

    function openStaffWhatsAppGroupModal() {
      var modal = document.getElementById('staffWhatsAppGroupModal');
      var input = document.getElementById('staffWaGroupInput');
      if (input) input.value = getStaffWhatsAppGroup();
      if (modal) modal.style.display = 'flex';
    }

    function closeStaffWhatsAppGroupModal() {
      var modal = document.getElementById('staffWhatsAppGroupModal');
      if (modal) modal.style.display = 'none';
    }

    function saveStaffWhatsAppGroupSetting() {
      var input = document.getElementById('staffWaGroupInput');
      var val = (input ? input.value : '').trim();
      var staffId = state.activeStaffId || 'STF01';
      localStorage.setItem('cwp_staff_wa_group_' + staffId, val);
      localStorage.setItem('cwp_staff_wa_group', val);
      closeStaffWhatsAppGroupModal();
      showToast('व्हाट्सएप ग्रुप लिंक सुरक्षित हो गया! ✓', 'success');
    }

    /* =========================================================================
       ADMIN DAILY CLEAN REPORTS: FETCH, FILTER, RENDER, AUTO-SYNC & EXPORT
       ========================================================================= */
    var adminCleanReportsState = {
      period: 'today',
      startDate: '',
      endDate: '',
      staffId: 'all',
      hasPhoto: 'all',
      search: '',
      records: [],
      summary: {}
    };

    var cleanReportsSyncTimer = null;
    var isCleanReportsSyncInProgress = false;
    var CLEAN_REPORTS_POLL_INTERVAL_MS = 15000; // 15 seconds real-time auto sync
    var lastCleanReportsSignature = '';
    var lastCleanReportsSyncTimestamp = 0;
    var isCleanReportsAutoSyncEnabled = true;

    function computeReportsSignature(records, summary) {
      if (!records || !records.length) {
        return 'empty:' + (summary ? (summary.totalCleaned || 0) : 0);
      }
      var first = records[0] || {};
      var firstKey = first.id || first.log_id || first.completed_at_device || '';
      return [
        records.length,
        firstKey,
        first.registration_no || '',
        summary ? (summary.latestPunchTime || '') : '',
        summary ? (summary.totalCleaned || 0) : 0,
        summary ? (summary.withPhotoCount || 0) : 0
      ].join('|');
    }

    function toggleCleanReportsAutoSync() {
      isCleanReportsAutoSyncEnabled = !isCleanReportsAutoSyncEnabled;
      var pill = document.getElementById('reportsLiveSyncPill');
      var dot = document.getElementById('reportsLiveDot');
      var text = document.getElementById('reportsLiveSyncText');
      var timeEl = document.getElementById('reportsLastSyncTime');

      if (isCleanReportsAutoSyncEnabled) {
        if (pill) {
          pill.classList.remove('is-paused');
          pill.title = 'Live Auto-Sync Active (Click to pause)';
        }
        if (dot) dot.style.display = 'inline-block';
        if (text) text.textContent = 'LIVE AUDIT';
        if (timeEl) timeEl.textContent = 'Live sync active (15s)';
        startDailyCleanReportsAutoSync();
        loadDailyCleanReports(true);
        showToast('🟢 Live auto-sync resumed (15s updates)', 'info');
      } else {
        stopDailyCleanReportsAutoSync();
        if (pill) {
          pill.classList.add('is-paused');
          pill.title = 'Auto-Sync Paused (Click to resume)';
        }
        if (dot) dot.style.display = 'none';
        if (text) text.textContent = 'PAUSED';
        if (timeEl) timeEl.textContent = 'Auto-sync paused';
        showToast('⏸️ Live auto-sync paused', 'info');
      }
    }

    function startDailyCleanReportsAutoSync() {
      stopDailyCleanReportsAutoSync();
      if (!isCleanReportsAutoSyncEnabled) return;
      if (state.currentView !== 'admin' || !isUserAdminAuthenticated()) return;

      cleanReportsSyncTimer = setInterval(function() {
        var activeTab = getSavedAdminTab();
        if (activeTab === 'cleanReports' &&
            document.visibilityState === 'visible' &&
            state.currentView === 'admin' &&
            isUserAdminAuthenticated() &&
            navigator.onLine !== false) {
          // If admin is actively typing in search, skip this background cycle
          var searchInp = document.getElementById('reportSearchFilter');
          if (searchInp && document.activeElement === searchInp) {
            return;
          }
          loadDailyCleanReports(true); // Silent background fetch
        }
      }, CLEAN_REPORTS_POLL_INTERVAL_MS);
    }

    function stopDailyCleanReportsAutoSync() {
      if (cleanReportsSyncTimer) {
        clearInterval(cleanReportsSyncTimer);
        cleanReportsSyncTimer = null;
      }
      isCleanReportsSyncInProgress = false;
    }

    function loadDailyCleanReports(isSilent) {
      if (isCleanReportsSyncInProgress) return;

      var tbody = document.getElementById('adminCleanReportsTableBody');
      var refreshBtn = document.querySelector('.btn-report-refresh');
      var syncText = document.getElementById('reportsLiveSyncText');
      var syncDot = document.getElementById('reportsLiveDot');
      var syncTimeEl = document.getElementById('reportsLastSyncTime');

      if (!isSilent) {
        if (tbody && (!adminCleanReportsState.records || adminCleanReportsState.records.length === 0)) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);"><div class="spinner-circle" style="width: 24px; height: 24px; border-width: 2px; margin: 0 auto 8px auto;"></div>रिपोर्ट लोड हो रही है...</td></tr>';
        }
        if (refreshBtn) {
          refreshBtn.classList.add('is-refreshing');
          var svg = refreshBtn.querySelector('svg');
          if (svg) svg.classList.add('spin-icon');
        }
      }

      if (isCleanReportsAutoSyncEnabled) {
        if (syncText) syncText.textContent = isSilent ? 'SYNCING...' : 'UPDATING...';
        if (syncDot) syncDot.classList.add('live-dot-fast');
      }

      populateReportStaffDropdown();
      computeReportDatesFromPeriod();

      var photoFilterVal = document.getElementById('reportPhotoFilter') ? document.getElementById('reportPhotoFilter').value : (adminCleanReportsState.hasPhoto || 'all');
      adminCleanReportsState.hasPhoto = photoFilterVal;

      var payload = {
        startDate: adminCleanReportsState.startDate,
        endDate: adminCleanReportsState.endDate,
        staffId: adminCleanReportsState.staffId,
        hasPhoto: photoFilterVal === 'not_present' ? 'all' : photoFilterVal,
        carNotPresent: photoFilterVal === 'not_present' ? 'yes' : undefined,
        search: adminCleanReportsState.search
      };

      isCleanReportsSyncInProgress = true;
      lastCleanReportsSyncTimestamp = Date.now();

      apiCall('getDailyCleanReports', payload, function(res) {
        isCleanReportsSyncInProgress = false;

        if (refreshBtn) {
          refreshBtn.classList.remove('is-refreshing');
          var svg = refreshBtn.querySelector('svg');
          if (svg) svg.classList.remove('spin-icon');
        }
        if (syncDot) syncDot.classList.remove('live-dot-fast');
        if (syncText && isCleanReportsAutoSyncEnabled) syncText.textContent = 'LIVE AUDIT';

        var now = new Date();
        var timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        if (syncTimeEl && isCleanReportsAutoSyncEnabled) {
          syncTimeEl.textContent = 'Auto-synced: ' + timeStr;
          syncTimeEl.title = 'Last live sync: ' + timeStr + ' (Every 15s)';
        }

        var newRecords = res.records || [];
        var newSummary = res.summary || {};
        var newSig = computeReportsSignature(newRecords, newSummary);

        var oldRecords = adminCleanReportsState.records || [];
        var isInitial = !lastCleanReportsSignature;
        var hasChanged = (newSig !== lastCleanReportsSignature);

        if (hasChanged || isInitial || !isSilent) {
          // Identify new records for subtle visual highlight & alert
          var oldIdSet = new Set(oldRecords.map(function(r) {
            return String(r.id || (r.registration_no + '_' + r.completed_at_device));
          }));
          var newIds = new Set();
          if (!isInitial && isSilent && oldRecords.length > 0) {
            newRecords.forEach(function(r) {
              var key = String(r.id || (r.registration_no + '_' + r.completed_at_device));
              if (!oldIdSet.has(key)) {
                newIds.add(key);
              }
            });
          }

          adminCleanReportsState.records = newRecords;
          adminCleanReportsState.summary = newSummary;
          lastCleanReportsSignature = newSig;

          renderDailyCleanReports(newRecords, newSummary, newIds);

          if (newIds.size > 0) {
            var firstNew = newRecords[0] || {};
            var plate = firstNew.registration_no || 'Car';
            var sName = firstNew.staff_name || 'Staff';
            showToast('🚗 ' + newIds.size + ' new clean report received! (' + plate + ' by ' + sName + ')', '✓');
          }
        }
      }, function(err) {
        isCleanReportsSyncInProgress = false;
        if (refreshBtn) {
          refreshBtn.classList.remove('is-refreshing');
          var svg = refreshBtn.querySelector('svg');
          if (svg) svg.classList.remove('spin-icon');
        }
        if (syncDot) syncDot.classList.remove('live-dot-fast');
        if (syncText && isCleanReportsAutoSyncEnabled) syncText.textContent = 'LIVE AUDIT';
        if (syncTimeEl) syncTimeEl.textContent = 'Sync paused (retry in 15s)';

        if (!isSilent && tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #ef4444;">Error loading reports: ' + escapeHtml(err.error || err.message || err) + '</td></tr>';
        }
      });
    }

    function populateReportStaffDropdown() {
      var select = document.getElementById('reportStaffFilter');
      if (!select || select.options.length > 1) return;

      if (state.staffList && Array.isArray(state.staffList)) {
        state.staffList.forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.name + ' (' + s.id + ')';
          select.appendChild(opt);
        });
      }
    }

    function computeReportDatesFromPeriod() {
      var period = adminCleanReportsState.period;
      var today = getTodayDateKey();

      var startInput = document.getElementById('reportStartDate');
      var endInput = document.getElementById('reportEndDate');
      var customBox = document.getElementById('customDateRangeBox');

      if (period === 'today') {
        adminCleanReportsState.startDate = today;
        adminCleanReportsState.endDate = today;
        if (customBox) customBox.style.display = 'none';
      } else if (period === 'yesterday') {
        var yDate = new Date();
        yDate.setDate(yDate.getDate() - 1);
        var yKey = yDate.toISOString().split('T')[0];
        adminCleanReportsState.startDate = yKey;
        adminCleanReportsState.endDate = yKey;
        if (customBox) customBox.style.display = 'none';
      } else if (period === '7days') {
        var d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        adminCleanReportsState.startDate = d7.toISOString().split('T')[0];
        adminCleanReportsState.endDate = today;
        if (customBox) customBox.style.display = 'none';
      } else if (period === 'month') {
        var mDate = new Date();
        var y = mDate.getFullYear();
        var m = String(mDate.getMonth() + 1).padStart(2, '0');
        adminCleanReportsState.startDate = y + '-' + m + '-01';
        adminCleanReportsState.endDate = today;
        if (customBox) customBox.style.display = 'none';
      } else if (period === 'custom') {
        if (customBox) customBox.style.display = 'inline-flex';
        adminCleanReportsState.startDate = (startInput && startInput.value) || today;
        adminCleanReportsState.endDate = (endInput && endInput.value) || today;
      }

      if (startInput) startInput.value = adminCleanReportsState.startDate;
      if (endInput) endInput.value = adminCleanReportsState.endDate;
    }

    function setReportPeriodChip(period) {
      adminCleanReportsState.period = period;
      ['today', 'yesterday', '7days', 'month', 'custom'].forEach(function(p) {
        var cap = p.charAt(0).toUpperCase() + p.slice(1);
        var chip = document.getElementById('chipPeriod' + cap);
        if (chip) chip.classList.toggle('active', p === period);
      });
      computeReportDatesFromPeriod();
      loadDailyCleanReports();
    }

    function handleReportDateChange() {
      var startInput = document.getElementById('reportStartDate');
      var endInput = document.getElementById('reportEndDate');
      if (startInput) adminCleanReportsState.startDate = startInput.value;
      if (endInput) adminCleanReportsState.endDate = endInput.value;
      adminCleanReportsState.period = 'custom';
      ['today', 'yesterday', '7days', 'month'].forEach(function(p) {
        var cap = p.charAt(0).toUpperCase() + p.slice(1);
        var chip = document.getElementById('chipPeriod' + cap);
        if (chip) chip.classList.remove('active');
      });
      var custChip = document.getElementById('chipPeriodCustom');
      if (custChip) custChip.classList.add('active');
      loadDailyCleanReports();
    }

    var reportSearchTimer = null;
    function debounceReportSearch() {
      if (reportSearchTimer) clearTimeout(reportSearchTimer);
      reportSearchTimer = setTimeout(function() {
        var input = document.getElementById('reportSearchFilter');
        adminCleanReportsState.search = (input ? input.value : '').trim();
        loadDailyCleanReports();
      }, 350);
    }

    function resetReportFilters() {
      adminCleanReportsState.period = 'today';
      adminCleanReportsState.search = '';
      adminCleanReportsState.staffId = 'all';
      adminCleanReportsState.hasPhoto = 'all';

      var searchIn = document.getElementById('reportSearchFilter');
      if (searchIn) searchIn.value = '';
      var staffSel = document.getElementById('reportStaffFilter');
      if (staffSel) staffSel.value = 'all';
      var photoSel = document.getElementById('reportPhotoFilter');
      if (photoSel) photoSel.value = 'all';

      setReportPeriodChip('today');
    }

    function shareDailyCleanReportDirectly(regNo, custName, custPhone, photoUrl, timeStr, staffName) {
      var msg = '🚗 *CWP Detailers & Motors - Daily Cleaning Update*\n\n' +
        'Namaste ' + (custName || 'Valued Customer') + ' ji,\n' +
        'Your vehicle *' + (regNo || '') + '* has been cleaned and checked by technician *' + (staffName || 'CWP Staff') + '* at *' + (timeStr || 'today') + '*.\n\n';
      if (photoUrl) {
        msg += '📸 *Photo Proof:* ' + photoUrl + '\n\n';
      }
      msg += 'Thank you for choosing CWP Detailers & Motors!';
      var cleanPhone = custPhone ? String(custPhone).replace(/[^0-9]/g, '') : '';
      if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
      var waUrl = cleanPhone
        ? ('https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg))
        : ('https://wa.me/?text=' + encodeURIComponent(msg));
      window.open(waUrl, '_blank');
    }
    window.shareDailyCleanReportDirectly = shareDailyCleanReportDirectly;

    function renderDailyCleanReports(records, summary, newIds) {
      // 1. Update KPI Tiles
      var kpiTotal = document.getElementById('kpiTotalCleaned');
      var kpiRate = document.getElementById('kpiPhotoRate');
      var kpiPhoto = document.getElementById('kpiPhotoCount');
      var kpiStaff = document.getElementById('kpiActiveStaff');
      var kpiPunch = document.getElementById('kpiLatestPunch');
      var kpiPunchDate = document.getElementById('kpiLatestPunchDate');
      var tabBadge = document.getElementById('tabCleanReportsCount');
      var progressBar = document.getElementById('kpiPhotoProgressBar');

      var total = summary.totalCleaned !== undefined ? summary.totalCleaned : (records.length || 0);
      var withPhoto = summary.withPhotoCount !== undefined ? summary.withPhotoCount : (records.filter(function(r) { return !!r.photo_url; }).length || 0);
      var rate = summary.photoRate !== undefined ? summary.photoRate : (total > 0 ? Math.round((withPhoto / total) * 100) : 0);
      var staffCount = summary.activeStaffCount !== undefined ? summary.activeStaffCount : new Set(records.map(function(r) { return r.staff_code || r.staff_id; })).size;

      if (kpiTotal) kpiTotal.textContent = total;
      if (kpiRate) kpiRate.textContent = rate + '%';
      if (kpiPhoto) kpiPhoto.textContent = withPhoto + ' with photo (' + (total - withPhoto) + ' without)';
      if (kpiStaff) kpiStaff.textContent = staffCount + ' Staff';
      if (tabBadge) tabBadge.textContent = total;

      if (progressBar) {
        progressBar.style.width = rate + '%';
        if (rate >= 90) {
          progressBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
        } else if (rate >= 70) {
          progressBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
        } else {
          progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        }
      }

      if (summary.latestPunchTime) {
        var lpDate = new Date(summary.latestPunchTime);
        var tStr = lpDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        var dStr = lpDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (kpiPunch) kpiPunch.textContent = tStr;
        if (kpiPunchDate) kpiPunchDate.textContent = dStr + ' IST';
      } else {
        if (kpiPunch) kpiPunch.textContent = '--:--';
        if (kpiPunchDate) kpiPunchDate.textContent = 'None today';
      }

      // 2. Operational Intelligence Banner
      var intelMsg = document.getElementById('intelBannerMessage');
      var intelBadge = document.getElementById('intelComplianceBadge');
      if (intelMsg && intelBadge) {
        if (records && records.length > 0) {
          // Find top staff contributor
          var staffCounts = {};
          records.forEach(function(r) {
            var s = r.staff_name || r.staff_code || 'Staff';
            staffCounts[s] = (staffCounts[s] || 0) + 1;
          });
          var topStaff = '';
          var topCount = 0;
          Object.keys(staffCounts).forEach(function(s) {
            if (staffCounts[s] > topCount) {
              topCount = staffCounts[s];
              topStaff = s;
            }
          });

          intelMsg.innerHTML = '<strong>' + total + ' vehicles</strong> cleaned across <strong>' + staffCount + ' field crew</strong>. Top performer: <strong>' + escapeHtml(topStaff) + '</strong> (' + topCount + ' vehicles). Compliance: <strong>' + rate + '% photo proof</strong>.';

          intelBadge.className = 'compliance-badge ' + (rate >= 90 ? 'badge-green' : (rate >= 70 ? 'badge-amber' : 'badge-red'));
          intelBadge.textContent = rate >= 90 ? '🟢 Optimal (' + rate + '%)' : (rate >= 70 ? '🟡 Fair (' + rate + '%)' : '🔴 Action Needed (' + rate + '%)');
        } else {
          intelMsg.textContent = 'Operational Status: No vehicle cleaning punches recorded for this period. Staff rounds typically start at 06:00 AM IST.';
          intelBadge.className = 'compliance-badge badge-neutral';
          intelBadge.textContent = 'Awaiting Activity';
        }
      }

      // 3. Render Table Rows
      var tbody = document.getElementById('adminCleanReportsTableBody');
      if (!tbody) return;

      if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">' +
          '<div class="reports-empty-state">' +
          '  <div class="empty-radar-wrap"><div class="empty-radar-pulse"></div><div class="empty-radar-icon">📋</div></div>' +
          '  <h3 class="empty-state-title">इस अवधि में कोई सफाई रिकॉर्ड नहीं मिला (No Records Found)</h3>' +
          '  <p class="empty-state-subtitle">चुनी गई तारीख या फ़िल्टर में कोई गाड़ी सफाई लॉग नहीं मिली। ऊपर से तारीख बदलें या रीसेट करें।</p>' +
          '  <div class="empty-state-actions">' +
          '    <button type="button" class="btn-report-action" onclick="setReportPeriodChip(\'today\')">Today (आज)</button>' +
          '    <button type="button" class="btn-filter-reset" onclick="resetReportFilters()">✕ Reset Filters</button>' +
          '  </div>' +
          '</div>' +
          '</td></tr>';
        return;
      }

      var html = '';
      records.forEach(function(r, idx) {
        var completedDate = r.completed_at_device ? new Date(r.completed_at_device) : new Date();
        var dateFormatted = completedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeFormatted = completedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        var sName = r.staff_name || r.staff_code || 'Staff';
        var cName = r.customer_name || 'Customer';
        var cPhone = r.customer_phone || '';
        var vReg = r.registration_no || 'Car';
        var vModel = r.brand_or_model ? r.brand_or_model : '';
        var locText = r.address_text || r.parking_details || '—';
        var photoUrl = r.photo_url || '';

        var rowKey = String(r.id || (r.registration_no + '_' + r.completed_at_device));
        var isNewRow = newIds && newIds.has(rowKey);

        html += '<tr class="' + (isNewRow ? 'row-new-highlight' : '') + '">';
        html += '  <td style="text-align: center;"><span class="report-row-index">' + (idx + 1) + '</span></td>';
        html += '  <td><div class="time-cell-main">' + timeFormatted + '</div><div class="time-cell-sub">' + dateFormatted + '</div></td>';
        var stfObj = (state.staffList || []).find(function(s) {
          return (s.id && r.staff_code && s.id.toUpperCase() === r.staff_code.toUpperCase()) ||
                 (s.name && s.name.toLowerCase() === sName.toLowerCase());
        });
        var stfPhoto = stfObj ? (stfObj.photoUrl || stfObj.photo_url || '') : '';
        html += '  <td><div class="staff-cell-pill">';
        if (stfPhoto) {
          html += '<img src="' + escapeHtml(stfPhoto) + '" class="staff-avatar-dot-img" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(0,0,0,0.1);" onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'inline-flex\';">';
          html += '<span class="staff-avatar-dot" style="display: none;">' + escapeHtml(sName.charAt(0).toUpperCase()) + '</span>';
        } else {
          html += '<span class="staff-avatar-dot">' + escapeHtml(sName.charAt(0).toUpperCase()) + '</span>';
        }
        html += '<span class="staff-cell-name">' + escapeHtml(sName) + '</span></div></td>';
        html += '  <td><div class="cust-cell-name">' + escapeHtml(cName) + '</div>';
        if (cPhone) {
          html += '    <div class="cust-phone-actions"><a href="tel:' + escapeHtml(cPhone) + '" class="table-phone-link">📞 ' + escapeHtml(cPhone) + '</a></div>';
        }
        html += '  </td>';
        html += '  <td><div class="hsrp-plate-wrap"><div class="hsrp-plate"><span class="hsrp-ind">IND</span><span class="hsrp-no">' + escapeHtml(vReg) + '</span></div>';
        if (vModel) {
          html += '    <span class="hsrp-model">' + escapeHtml(vModel) + '</span>';
        }
        html += '  </div></td>';
        html += '  <td><div class="table-loc-cell"><span class="loc-pin">📍</span><span class="loc-text" title="' + escapeHtml(locText) + '">' + escapeHtml(locText) + '</span></div></td>';
        
        // Photo Proof Thumbnail Column
        html += '  <td style="text-align: center;">';
        if (photoUrl) {
          html += '    <div class="photo-proof-cell">' +
                  '      <img src="' + escapeHtml(photoUrl) + '" class="report-thumb-img" onclick="openReportPhotoLightbox(\'' + escapeHtml(photoUrl) + '\', \'' + escapeHtml(vReg + ' - ' + cName) + '\', \'Staff: ' + escapeHtml(sName) + ' • Time: ' + timeFormatted + '\', \'' + escapeHtml(cPhone) + '\')" title="Click to view full photo proof">' +
                  '      <span class="photo-zoom-badge">🔍 Zoom</span>' +
                  '    </div>';
        } else {
          html += '    <span class="report-no-photo-badge"><span class="warn-dot">⚠️</span> No Photo</span>';
        }
        html += '  </td>';

        var transitStr = '';
        if (r.transitDurationMinutes !== undefined || r.transitMinutes !== undefined) {
          var tMin = r.transitDurationMinutes !== undefined ? r.transitDurationMinutes : r.transitMinutes;
          transitStr = '<span class="cell-time-transit" style="font-size: 10.5px; color: #64748b; display: block; margin-top: 2px;">⏱️ ' + tMin + 'm transit</span>';
        }

        var isCarNotPresent = r.car_not_present === true || r.tag === 'car_not_present' || r.status === 'car_not_present';
        var statusBadge = isCarNotPresent
          ? '<span class="badge-status-pill badge-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 11px; padding: 3px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span>🚫</span> Car Not Present</span>'
          : '<span class="badge-status-pill badge-active" style="font-size:11px; padding:3px 8px;">✓ Cleaned</span>';

        html += '  <td style="text-align: center;">' +
                '    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">' +
                statusBadge +
                transitStr +
                '      <!-- Admin share disabled -->' +
                '    </div>' +
                '  </td>';
        html += '</tr>';
      });

      tbody.innerHTML = html;
      if (typeof updateOperationsDashboardKPIs === 'function') {
        updateOperationsDashboardKPIs();
      }
    }

    function renderAdminCleanReportsTable(records, summary, newIds) {
      /* Admin share disabled */
      return renderDailyCleanReports(records, summary, newIds);
    }
    window.renderAdminCleanReportsTable = renderAdminCleanReportsTable;

    /* Lightbox Modal Functions */
    var currentLightboxPhotoUrl = '';
    var currentLightboxPhone = '';
    function openReportPhotoLightbox(url, title, metaDetails, customerPhone, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      currentLightboxPhotoUrl = url;
      currentLightboxPhone = customerPhone || '';

      var modal = document.getElementById('reportPhotoLightboxModal');
      var img = document.getElementById('lightboxModalImg');
      var titleEl = document.getElementById('lightboxModalTitle');
      var metaEl = document.getElementById('lightboxMetaDetails');
      var openNew = document.getElementById('lightboxOpenNewTab');

      if (img) img.src = url;
      if (titleEl) titleEl.innerHTML = '<span>🚗</span> ' + escapeHtml(title);
      if (metaEl) metaEl.textContent = metaDetails;
      if (openNew) openNew.href = url;

      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    }

    function closeReportPhotoLightbox() {
      var modal = document.getElementById('reportPhotoLightboxModal');
      if (modal) {
        modal.style.display = 'none';
        if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
          document.body.style.overflow = '';
        }
      }
      currentLightboxPhotoUrl = '';
      currentLightboxPhone = '';
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function closeReportPhotoLightboxModal() {
      closeReportPhotoLightbox();
    }

    function downloadCurrentReportPhoto() {
      if (!currentLightboxPhotoUrl) return;
      var a = document.createElement('a');
      a.href = currentLightboxPhotoUrl;
      a.download = 'CWP_Car_Clean_' + Date.now() + '.jpg';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function forwardPhotoFromLightbox() {
      if (!currentLightboxPhotoUrl) return;
      var message = 'Hello,\nHere is the photo proof of your vehicle cleaning by CWP Detailers & Motors:\n' + currentLightboxPhotoUrl + '\n\nThank you for choosing CWP Detailers!';
      var waUrl = currentLightboxPhone
        ? ('https://wa.me/91' + normalizeIndianMobile(currentLightboxPhone) + '?text=' + encodeURIComponent(message))
        : ('https://wa.me/?text=' + encodeURIComponent(message));
      window.open(waUrl, '_blank');
    }

    /* CSV Export */
    function exportDailyCleanReportsCSV() {
      var records = adminCleanReportsState.records;
      if (!records || records.length === 0) {
        showToast('डाउनलोड करने के लिए कोई रिकॉर्ड उपलब्ध नहीं है', 'warning');
        return;
      }

      var headers = ['S.No', 'Date (IST)', 'Time (IST)', 'Staff Name', 'Staff ID', 'Customer Name', 'Customer Phone', 'Vehicle Reg', 'Brand/Model', 'Address', 'Status', 'Photo URL'];
      var csvRows = [headers.join(',')];

      records.forEach(function(r, idx) {
        var d = r.completed_at_device ? new Date(r.completed_at_device) : new Date();
        var dStr = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        var tStr = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

        var isCarNotPresent = r.car_not_present === true || r.tag === 'car_not_present' || r.status === 'car_not_present';
        var statusText = isCarNotPresent ? 'Car Not Present' : 'Completed';

        var row = [
          idx + 1,
          JSON.stringify(dStr),
          JSON.stringify(tStr),
          JSON.stringify(r.staff_name || ''),
          JSON.stringify(r.staff_code || ''),
          JSON.stringify(r.customer_name || ''),
          JSON.stringify(r.customer_phone || ''),
          JSON.stringify(r.registration_no || ''),
          JSON.stringify(r.brand_or_model || ''),
          JSON.stringify(r.address_text || r.parking_details || ''),
          JSON.stringify(statusText),
          JSON.stringify(r.photo_url || '')
        ];
        csvRows.push(row.join(','));
      });

      var blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'CWP_Daily_Clean_Reports_' + adminCleanReportsState.startDate + '_to_' + adminCleanReportsState.endDate + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function printDailyCleanReports() {
      window.print();
    }

    function updateRouteProgressBar() {
      var header = document.getElementById('staffDailyRouteHeader');
      var allDaily = (state.customers || []).filter(function(c) {
        return c.category === 'daily_car_cleaning' || c.serviceCategory === 'Daily Car Cleaning' || c.sheetName === 'Daily Clean';
      });
      if (allDaily.length === 0 && state.staffData && Array.isArray(state.staffData.dailyCarCleaning)) {
        allDaily = state.staffData.dailyCarCleaning;
      }
      var total = allDaily.length;

      var completedSet = getCompletedCustomersSet();
      var doneCount = 0;
      allDaily.forEach(function(c) {
        var cId = c.customerId || c.id || getCustomerStableId(c);
        if (completedSet.has(cId) || c.completedToday) {
          doneCount++;
        }
      });

      var staffName = (state.staffData && state.staffData.staffName) ? state.staffData.staffName : (state.activeStaffName || 'Staff');
      var nameEl = document.getElementById('routeStaffName');
      if (nameEl) nameEl.textContent = staffName;

      var totalEl = document.getElementById('routeTotalCount');
      if (totalEl) totalEl.textContent = total;

      var progressEl = document.getElementById('routeProgressCount');
      if (progressEl) progressEl.textContent = doneCount + ' / ' + total;

      var percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      var percentEl = document.getElementById('routeProgressPercent');
      if (percentEl) percentEl.textContent = percent + '%';

      var barFill = document.getElementById('routeProgressBarFill');
      if (barFill) barFill.style.width = percent + '%';

      // Update compact inline progress chip beside search bar
      var inlineCount = document.getElementById('inlineRouteProgressCount');
      if (inlineCount) inlineCount.textContent = doneCount + '/' + total;

      var inlinePct = document.getElementById('inlineRouteProgressPercent');
      if (inlinePct) inlinePct.textContent = '(' + percent + '%)';

      var inlineBar = document.getElementById('inlineRouteProgressBarFill');
      if (inlineBar) {
        inlineBar.style.width = percent + '%';
        if (percent === 100) {
          inlineBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
        } else {
          inlineBar.style.background = 'linear-gradient(90deg, #2563eb, #38bdf8)';
        }
      }

      var inlineChip = document.getElementById('staffInlineProgressChip');
      if (inlineChip) {
        var isDaily = (state.activeFilter === 'daily_car_cleaning' || !state.activeFilter);
        inlineChip.style.display = isDaily ? 'flex' : 'none';
      }
      if (typeof updateFilterCounts === 'function') updateFilterCounts();
    }

    var midnightTimer = null;
    function scheduleMidnightCheck() {
      if (midnightTimer) clearTimeout(midnightTimer);
      var ms = getMsUntilMidnightAsiaKolkata();
      midnightTimer = setTimeout(function() {
        checkAndHandleDateChange();
        scheduleMidnightCheck();
      }, ms);
    }

    function checkAndHandleDateChange() {
      var todayKey = getTodayDateKey();
      if (!state.currentDateKey) {
        state.currentDateKey = todayKey;
        return;
      }
      if (state.currentDateKey !== todayKey) {
        console.log('[DailyClean] Date changed from ' + state.currentDateKey + ' to ' + todayKey + ' (Asia/Kolkata). Auto-resetting daily checklist.');
        state.currentDateKey = todayKey;
        if (state.currentView === 'staff' && state.currentStaffFilteredList) {
          renderCustomerCards(state.currentStaffFilteredList);
          updateRouteProgressBar();
        }
      }
    }

    /* =========================================================================
       PROGRESSIVE WEB APP (PWA) CLIENT ENGINE - CWP STAFF PORTAL
       ========================================================================= */
    var deferredPwaPrompt = null;
    var pwaUpdateRegistration = null;

    function isPwaStandaloneMode() {
      try {
        if (typeof window === 'undefined') return false;
        var hasMatchMedia = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
        var isNavStandalone = typeof navigator !== 'undefined' && navigator.standalone === true;
        var isAndroidApp = typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://');
        return Boolean(hasMatchMedia || isNavStandalone || isAndroidApp);
      } catch (e) {
        return false;
      }
    }

    function isIosDevice() {
      try {
        if (typeof navigator === 'undefined') return false;
        var ua = navigator.userAgent || '';
        return /iPhone|iPad|iPod/i.test(ua);
      } catch (e) {
        return false;
      }
    }

    function updatePwaInstallState() {
      if (typeof document === 'undefined') return;
      var banner = document.getElementById('staffPwaInstallBanner');
      var headerBtn = document.getElementById('staffPwaInstallBtn');

      if (typeof state === 'undefined' || state.currentView !== 'staff') {
        if (banner) banner.style.display = 'none';
        if (headerBtn) headerBtn.style.display = 'none';
        return;
      }

      var isStandalone = isPwaStandaloneMode();
      var isInstalled = isStandalone || (typeof localStorage !== 'undefined' && localStorage.getItem('cwp_app_installed') === 'true');
      if (isInstalled) {
        if (document.body) document.body.classList.add('pwa-standalone');
        if (banner) banner.style.display = 'none';
        if (headerBtn) {
          headerBtn.style.display = 'none';
          headerBtn.setAttribute('hidden', 'true');
        }
        return;
      }

      // Check banner dismissal (re-show after 7 days)
      var dismissedTs = 0;
      try {
        if (typeof localStorage !== 'undefined') {
          dismissedTs = parseInt(localStorage.getItem('cwp_pwa_dismissed') || '0', 10);
        }
      } catch (e) {}

      var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      var shouldShowBanner = (Date.now() - dismissedTs) > sevenDaysMs;

      if (banner) {
        banner.style.display = shouldShowBanner ? 'flex' : 'none';
      }

      // Header install button is only available if not installed and prompt is ready
      if (headerBtn) {
        headerBtn.style.display = (!isInstalled && (deferredPwaPrompt || isIosDevice() || shouldShowBanner)) ? 'inline-flex' : 'none';
      }
    }

    function hidePwaUi() {
      if (typeof document === 'undefined') return;
      var banner = document.getElementById('staffPwaInstallBanner');
      var headerBtn = document.getElementById('staffPwaInstallBtn');
      if (banner) banner.style.display = 'none';
      if (headerBtn) headerBtn.style.display = 'none';
    }

    function triggerPwaInstallPrompt() {
      if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        deferredPwaPrompt.userChoice.then(function(choiceResult) {
          if (choiceResult && choiceResult.outcome === 'accepted') {
            console.log('[PWA] User accepted installation prompt');
            try { if (typeof localStorage !== 'undefined') localStorage.setItem('cwp_app_installed', 'true'); } catch (e) {}
            if (typeof showToast === 'function') {
              showToast('🎉 CWP Staff ऐप इंस्टॉल हो रहा है!', 'success');
            }
            hidePwaUi();
          } else {
            console.log('[PWA] User dismissed installation prompt');
          }
          deferredPwaPrompt = null;
        }).catch(function(err) {
          console.warn('[PWA] Install prompt error:', err);
        });
      } else if (isIosDevice()) {
        openPwaIosModal();
      } else if (isPwaStandaloneMode()) {
        if (typeof showToast === 'function') {
          showToast('✓ CWP Staff ऐप पहले से ही इंस्टॉल है।', 'success');
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('ब्राउज़र मेनू (⋮) से "Install app" या "Add to Home Screen" चुनें।', 'warning');
        }
      }
    }

    function dismissPwaBanner() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cwp_pwa_dismissed', String(Date.now()));
        }
      } catch (e) {}
      if (typeof document !== 'undefined') {
        var banner = document.getElementById('staffPwaInstallBanner');
        if (banner) banner.style.display = 'none';
      }
    }

    function openPwaIosModal() {
      if (typeof document === 'undefined') return;
      var modal = document.getElementById('pwaIosModal');
      if (modal) modal.style.display = 'flex';
    }

    function closePwaIosModal() {
      if (typeof document === 'undefined') return;
      var modal = document.getElementById('pwaIosModal');
      if (modal) modal.style.display = 'none';
    }

    function showPwaUpdateToast(registration) {
      if (typeof document === 'undefined') return;
      pwaUpdateRegistration = registration;
      var bar = document.getElementById('pwaUpdateBar');
      if (bar) bar.style.display = 'flex';
    }

    function applyPwaUpdate() {
      if (pwaUpdateRegistration && pwaUpdateRegistration.waiting) {
        pwaUpdateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      if (typeof document !== 'undefined') {
        var bar = document.getElementById('pwaUpdateBar');
        if (bar) bar.style.display = 'none';
      }
      setTimeout(function() {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 300);
    }

    function initPwa() {
      if (typeof window === 'undefined') return;

      if (isPwaStandaloneMode() && typeof document !== 'undefined' && document.body) {
        document.body.classList.add('pwa-standalone');
      }

      // 1. Register Service Worker
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function(reg) {
              console.log('[PWA] Service Worker registered:', reg.scope);

              // Check if waiting worker already exists
              if (reg.waiting && navigator.serviceWorker.controller) {
                showPwaUpdateToast(reg);
              }

              // Check for SW updates
              reg.addEventListener('updatefound', function() {
                var installingWorker = reg.installing;
                if (!installingWorker) return;
                installingWorker.addEventListener('statechange', function() {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showPwaUpdateToast(reg);
                  }
                });
              });
            })
            .catch(function(err) {
              console.warn('[PWA] Service Worker registration failed:', err && err.message ? err.message : err);
            });

          var refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (!refreshing) {
              refreshing = true;
              window.location.reload();
            }
          });
        });
      }

      // 2. Capture beforeinstallprompt
      window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPwaPrompt = e;
        console.log('[PWA] Captured beforeinstallprompt event');
        if (typeof state !== 'undefined' && state.currentView === 'staff') {
          updatePwaInstallState();
        }
      });

      // 3. Capture appinstalled
      window.addEventListener('appinstalled', function() {
        console.log('[PWA] CWP Staff App installed successfully');
        try { if (typeof localStorage !== 'undefined') localStorage.setItem('cwp_app_installed', 'true'); } catch (e) {}
        deferredPwaPrompt = null;
        hidePwaUi();
        if (typeof showToast === 'function') {
          showToast('🎉 CWP Staff ऐप सफलतापूर्वक इंस्टॉल हो गया!', 'success');
        }
      });

      // 3b. Check if app was already installed on device
      if (typeof navigator !== 'undefined' && typeof navigator.getInstalledRelatedApps === 'function') {
        navigator.getInstalledRelatedApps().then(function(apps) {
          if (Array.isArray(apps) && apps.length > 0) {
            try { localStorage.setItem('cwp_app_installed', 'true'); } catch (e) {}
            hidePwaUi();
          }
        }).catch(function() {});
      }

      // 4. Online/Offline network toast notifications
      window.addEventListener('online', function() {
        if (typeof showToast === 'function') {
          showToast('🟢 इंटरनेट कनेक्शन वापस आ गया — डेटा लाइव सिंक हो रहा है।', 'success');
        }
        updatePwaInstallState();
      });

      window.addEventListener('offline', function() {
        if (typeof showToast === 'function') {
          showToast('📶 आप ऑफ़लाइन हैं — पिछला डेटा सुरक्षित है और ऐप काम करता रहेगा।', 'warning');
        }
      });
    }

    /* =========================================================================
       ON-DEMAND & SPECIAL JOBS CONTROLLER (Solar Cleaning & Car Washing)
       ========================================================================= */

    /* Staff: Starting Special Job (Before Photos) */
    var currentStartJobId = null;
    var startJobPhotos = [];

    function openStartSpecialJobModal(jobId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      currentStartJobId = jobId;
      startJobPhotos = [];
      var job = (state.customers || []).find(function(c) { return (c.jobId || c.id) === jobId; });
      if (!job) {
        showToast('काम की जानकारी नहीं मिली।', '⚠️');
        return;
      }
      var summaryEl = document.getElementById('startJobCustomerSummary');
      if (summaryEl) {
        var isSolar = (job.category === 'solar_cleaning' || job.serviceCategoryId === 'solar_cleaning');
        summaryEl.innerHTML = 
          '<div style="font-weight: 700; font-size: 15px; color: var(--md-sys-color-on-surface, #1e293b); margin-bottom: 3px;">' + escapeHtml(job.customerName || job.name) + '</div>' +
          '<div style="font-size: 13px; color: var(--md-sys-color-primary, #2563eb); font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 16px;">' + (isSolar ? 'solar_power' : 'local_car_wash') + '</span><span>' + escapeHtml(job.serviceType || job.serviceCategory) + '</span></div>' +
          '<div style="font-size: 12.5px; color: var(--md-sys-color-on-surface-variant, #64748b); display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 15px;">location_on</span><span>' + escapeHtml(job.address || 'Location on map') + '</span></div>' +
          (job.specialInstructions ? '<div style="font-size: 12px; color: var(--md-sys-color-on-tertiary-container, #b45309); background: var(--md-sys-color-tertiary-container, #fffbeb); padding: 4px 8px; border-radius: 4px; margin-top: 6px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">info</span><span>' + escapeHtml(job.specialInstructions) + '</span></div>' : '');
      }
      renderStartJobPhotosPreview();
      var err = document.getElementById('startJobErrorMsg');
      if (err) err.style.display = 'none';
      var modal = document.getElementById('startSpecialJobModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeStartSpecialJobModal() {
      var modal = document.getElementById('startSpecialJobModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      currentStartJobId = null;
      startJobPhotos = [];
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleStartJobPhotoSelect(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      if (startJobPhotos.length >= 2) {
        showToast('अधिकतम 2 फोटो अपलोड कर सकते हैं', '⚠️');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(evt) {
        var dataUrl = evt.target.result;
        compressImageToJpeg(dataUrl, function(compressedUrl) {
          startJobPhotos.push({ base64: compressedUrl, mimeType: 'image/jpeg' });
          renderStartJobPhotosPreview();
        });
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    }

    function compressImageToJpeg(dataUrl, callback) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var maxDim = 1200;
        var w = img.width;
        var h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var comp = canvas.toDataURL('image/jpeg', 0.82);
        callback(comp);
      };
      img.onerror = function() {
        callback(dataUrl);
      };
      img.src = dataUrl;
    }

    function renderStartJobPhotosPreview() {
      var preview = document.getElementById('startJobPhotosPreview');
      var countHint = document.getElementById('startJobPhotoCountHint');
      if (countHint) countHint.textContent = startJobPhotos.length + ' / 2 फोटो चुनी गई';
      if (!preview) return;
      preview.innerHTML = startJobPhotos.map(function(p, idx) {
        return '<div style="position: relative; width: 100px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #2563eb;">' +
          '<img src="' + p.base64 + '" style="width: 100%; height: 100%; object-fit: cover;">' +
          '<button type="button" onclick="removeStartJobPhoto(' + idx + ')" style="position: absolute; top: 3px; right: 3px; background: rgba(239, 68, 68, 0.9); color: #fff; border: none; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>' +
        '</div>';
      }).join('');
      var addBtn = document.getElementById('btnStartJobAddPhoto');
      if (addBtn) addBtn.style.display = startJobPhotos.length >= 2 ? 'none' : 'inline-flex';
    }

    function removeStartJobPhoto(idx) {
      startJobPhotos.splice(idx, 1);
      renderStartJobPhotosPreview();
    }

    function submitStartSpecialJob() {
      if (!currentStartJobId) return;
      if (startJobPhotos.length === 0) {
        var err = document.getElementById('startJobErrorMsg');
        if (err) {
          err.textContent = 'कृपया काम शुरू करने से पहले की कम से कम 1 फोटो लें।';
          err.style.display = 'block';
        }
        return;
      }
      var submitBtn = document.getElementById('btnSubmitStartJob');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ फोटो अपलोड हो रही है...</span>';
      }

      var payload = {
        jobId: currentStartJobId,
        staffId: state.activeStaffId,
        staffToken: getStaffToken(state.activeStaffId),
        photos: startJobPhotos,
        startedAtDevice: new Date().toISOString()
      };

      apiCall('startSpecialJob', payload, function(res) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 काम शुरू करें</span>';
        }
        if (res && res.success) {
          showToast('▶️ काम शुरू हो गया! स्टेटस लाइव अपडेट हो गया।', '✅');
          closeStartSpecialJobModal();
          loadStaffCustomerData(state.activeStaffId);
        } else {
          showToast((res && res.error) || 'काम शुरू करने में त्रुटि', '❌');
        }
      }, function(err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 काम शुरू करें</span>';
        }
        showToast('Error: ' + err.message, '❌');
      });
    }

    /* Staff: Completing Special Job (After Photos & Notes) */
    var currentCompleteJobId = null;
    var completeJobPhotos = [];

    function openCompleteSpecialJobModal(jobId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      currentCompleteJobId = jobId;
      completeJobPhotos = [];
      var job = (state.customers || []).find(function(c) { return (c.jobId || c.id) === jobId; });
      if (!job) {
        showToast('काम की जानकारी नहीं मिली।', '⚠️');
        return;
      }
      var summaryEl = document.getElementById('completeJobCustomerSummary');
      if (summaryEl) {
        var isSolar = (job.category === 'solar_cleaning' || job.serviceCategoryId === 'solar_cleaning');
        var stTime = job.startedAt ? formatTimeOnly(job.startedAt) : '';
        summaryEl.innerHTML = 
          '<div style="font-weight: 700; font-size: 15px; color: var(--md-sys-color-on-surface, #1e293b); margin-bottom: 3px;">' + escapeHtml(job.customerName || job.name) + '</div>' +
          '<div style="font-size: 13px; color: var(--md-sys-color-tertiary, #059669); font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 16px;">' + (isSolar ? 'solar_power' : 'local_car_wash') + '</span><span>' + escapeHtml(job.serviceType || job.serviceCategory) + '</span></div>' +
          (stTime ? '<div style="font-size: 12px; color: var(--md-sys-color-tertiary, #059669); display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 15px;">schedule</span><span>काम शुरू हुआ था: ' + stTime + '</span></div>' : '');
      }
      renderCompleteJobPhotosPreview();
      var notesEl = document.getElementById('completeJobNotes');
      if (notesEl) notesEl.value = '';
      var err = document.getElementById('completeJobErrorMsg');
      if (err) err.style.display = 'none';
      var modal = document.getElementById('completeSpecialJobModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeCompleteSpecialJobModal() {
      var modal = document.getElementById('completeSpecialJobModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      currentCompleteJobId = null;
      completeJobPhotos = [];
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleCompleteJobPhotoSelect(event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      if (completeJobPhotos.length >= 2) {
        showToast('अधिकतम 2 फोटो अपलोड कर सकते हैं', '⚠️');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(evt) {
        var dataUrl = evt.target.result;
        compressImageToJpeg(dataUrl, function(compressedUrl) {
          completeJobPhotos.push({ base64: compressedUrl, mimeType: 'image/jpeg' });
          renderCompleteJobPhotosPreview();
        });
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    }

    function renderCompleteJobPhotosPreview() {
      var preview = document.getElementById('completeJobPhotosPreview');
      var countHint = document.getElementById('completeJobPhotoCountHint');
      if (countHint) countHint.textContent = completeJobPhotos.length + ' / 2 फोटो चुनी गई';
      if (!preview) return;
      preview.innerHTML = completeJobPhotos.map(function(p, idx) {
        return '<div style="position: relative; width: 100px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #059669;">' +
          '<img src="' + p.base64 + '" style="width: 100%; height: 100%; object-fit: cover;">' +
          '<button type="button" onclick="removeCompleteJobPhoto(' + idx + ')" style="position: absolute; top: 3px; right: 3px; background: rgba(239, 68, 68, 0.9); color: #fff; border: none; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>' +
        '</div>';
      }).join('');
      var addBtn = document.getElementById('btnCompleteJobAddPhoto');
      if (addBtn) addBtn.style.display = completeJobPhotos.length >= 2 ? 'none' : 'inline-flex';
    }

    function removeCompleteJobPhoto(idx) {
      completeJobPhotos.splice(idx, 1);
      renderCompleteJobPhotosPreview();
    }

    function submitCompleteSpecialJob() {
      if (!currentCompleteJobId) return;
      if (completeJobPhotos.length === 0) {
        var err = document.getElementById('completeJobErrorMsg');
        if (err) {
          err.textContent = 'कृपया काम पूरा होने के बाद की कम से कम 1 फोटो अपलोड करें।';
          err.style.display = 'block';
        }
        return;
      }
      var submitBtn = document.getElementById('btnSubmitCompleteJob');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ काम सबमिट हो रहा है...</span>';
      }

      var notes = (document.getElementById('completeJobNotes') ? document.getElementById('completeJobNotes').value : '').trim();

      var payload = {
        jobId: currentCompleteJobId,
        staffId: state.activeStaffId,
        staffToken: getStaffToken(state.activeStaffId),
        photos: completeJobPhotos,
        notes: notes,
        completedAtDevice: new Date().toISOString()
      };

      apiCall('completeSpecialJob', payload, function(res) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>✅ काम पूर्ण और सबमिट करें</span>';
        }
        if (res && res.success) {
          playTaskCompletedChime();
          showToast('🎉 बहुत बढ़िया! काम सफलतापूर्वक पूरा हो गया और रिकॉर्ड सेव हो गया।', '✅');
          closeCompleteSpecialJobModal();
          loadStaffCustomerData(state.activeStaffId);
        } else {
          showToast((res && res.error) || 'काम सबमिट करने में समस्या', '❌');
        }
      }, function(err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>✅ काम पूर्ण और सबमिट करें</span>';
        }
        showToast('Error: ' + err.message, '❌');
      });
    }

    /* Staff: Cancelling Special Job (Reason & Remarks) */
    var currentCancelJobId = null;

    function openCancelSpecialJobModal(jobId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      currentCancelJobId = jobId;
      var job = (state.customers || []).find(function(c) { return (c.jobId || c.id) === jobId; });
      if (!job) {
        showToast('काम की जानकारी नहीं मिली।', '⚠️');
        return;
      }
      var summaryEl = document.getElementById('cancelJobCustomerSummary');
      if (summaryEl) {
        var isSolar = (job.category === 'solar_cleaning' || job.serviceCategoryId === 'solar_cleaning');
        summaryEl.innerHTML = 
          '<div style="font-weight: 700; font-size: 15px; color: var(--md-sys-color-on-surface, #1e293b); margin-bottom: 3px;">' + escapeHtml(job.customerName || job.name) + '</div>' +
          '<div style="font-size: 13px; color: var(--md-sys-color-primary, #2563eb); font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 16px;">' + (isSolar ? 'solar_power' : 'local_car_wash') + '</span><span>' + escapeHtml(job.serviceType || job.serviceCategory) + '</span></div>' +
          '<div style="font-size: 12.5px; color: var(--md-sys-color-on-surface-variant, #64748b); display: flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 15px;">location_on</span><span>' + escapeHtml(job.address || 'Location on map') + '</span></div>';
      }
      var reasonSelect = document.getElementById('cancelJobReasonSelect');
      if (reasonSelect) reasonSelect.value = '';
      var remarksInput = document.getElementById('cancelJobRemarksInput');
      if (remarksInput) remarksInput.value = '';
      var err = document.getElementById('cancelJobErrorMsg');
      if (err) err.style.display = 'none';

      var modal = document.getElementById('cancelSpecialJobModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeCancelSpecialJobModal() {
      var modal = document.getElementById('cancelSpecialJobModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      currentCancelJobId = null;
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function submitCancelSpecialJob() {
      if (!currentCancelJobId) return;
      var reasonSelect = document.getElementById('cancelJobReasonSelect');
      var reason = reasonSelect ? reasonSelect.value.trim() : '';
      if (!reason) {
        var err = document.getElementById('cancelJobErrorMsg');
        if (err) {
          err.textContent = 'कृपया रद्द करने का कारण चुनें (Please select a cancellation reason)';
          err.style.display = 'block';
        }
        return;
      }

      var remarksInput = document.getElementById('cancelJobRemarksInput');
      var remarks = remarksInput ? remarksInput.value.trim() : '';

      var submitBtn = document.getElementById('btnSubmitCancelJob');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ रद्द दर्ज हो रहा है...</span>';
      }

      var payload = {
        action: 'cancelSpecialJob',
        jobId: currentCancelJobId,
        reason: reason,
        remarks: remarks,
        staffId: state.activeStaffId,
        staffToken: getStaffToken(state.activeStaffId),
        cancelledAt: new Date().toISOString()
      };

      apiCall('cancelSpecialJob', payload, function(res) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">block</span><span>रद्द दर्ज करें (Confirm Cancellation)</span>';
        }
        if (res && res.success) {
          showToast('🚫 बुकिंग सफलतापूर्वक रद्द दर्ज कर दी गई।', 'info');
          // Update in-memory state
          var found = (state.customers || []).find(function(c) { return (c.jobId || c.id) === currentCancelJobId; });
          if (found) {
            found.status = 'cancelled';
            found.cancellationReason = reason;
            found.cancellationRemarks = remarks;
            found.cancelledAt = payload.cancelledAt;
          }
          closeCancelSpecialJobModal();
          updateFilterCounts();
          if (state.currentStaffFilteredList) {
            renderCustomerCards(state.currentStaffFilteredList);
          }
          loadStaffCustomerData(state.activeStaffId);
        } else {
          showToast((res && res.error) || 'रद्द करने में त्रुटि', '❌');
        }
      }, function(err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;" aria-hidden="true">block</span><span>रद्द दर्ज करें (Confirm Cancellation)</span>';
        }
        showToast('Error: ' + err.message, '❌');
      });
    }

    /* WhatsApp Proof Dispatch for Special Jobs */
    function shareSpecialJobWhatsApp(jobId) {
      var job = (state.customers || []).find(function(c) { return (c.jobId || c.id) === jobId; });
      if (!job) return;

      var custName = job.customerName || job.name || 'ग्राहक';
      var cleanPhone = normalizeIndianMobile(job.customerNumber || job.phone);
      var isSolar = (job.category === 'solar_cleaning' || job.serviceCategoryId === 'solar_cleaning');
      var serviceName = isSolar ? 'सोलर पैनल सफाई (Solar Cleaning)' : 'कार वॉशिंग (Car Wash)';

      var msg = 'नमस्ते ' + custName + ' जी! 🙏\n\n' +
        'CWP Detailers & Motors द्वारा आपकी ' + serviceName + ' सफलतापूर्वक पूरी कर दी गई है। ✨\n\n' +
        (job.afterPhotos && job.afterPhotos.length > 0 ? 'सफाई की तस्वीरें:\n' + job.afterPhotos.join('\n') + '\n\n' : '') +
        'हमेशा बेहतरीन सेवा के लिए तत्पर — CWP Detailers 🚗⚡';

      var waUrl = cleanPhone 
        ? 'https://wa.me/91' + cleanPhone + '?text=' + encodeURIComponent(msg)
        : 'https://wa.me/?text=' + encodeURIComponent(msg);

      window.open(waUrl, '_blank');
    }

    /* Admin: Assign Special Job Workflow */
    var preselectedSpecialCustId = null;

    function openAssignSpecialJobModal(preselectedCustomerId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      preselectedSpecialCustId = preselectedCustomerId || null;
      var modal = document.getElementById('assignSpecialJobModal');
      if (!modal) return;

      // Populate Staff Dropdown
      var staffSelect = document.getElementById('specialStaffSelect');
      if (staffSelect) {
        staffSelect.innerHTML = '<option value="">-- Choose Active Staff --</option>';
        var staffList = state.staffList || [];
        staffList.filter(function(s) { return s.active !== false && s.isActive !== false; }).forEach(function(s) {
          staffSelect.innerHTML += '<option value="' + escapeHtml(s.id || s.staffCode || s.staff_code) + '">' + escapeHtml(s.name) + ' (' + escapeHtml(s.id || s.staff_code || '') + ')</option>';
        });
      }

      // Populate Existing Customer Dropdown
      var custSelect = document.getElementById('specialExistingCustSelect');
      if (custSelect) {
        custSelect.innerHTML = '<option value="">-- Choose Existing Customer --</option>';
        var records = state.adminRecords || [];
        records.forEach(function(r) {
          var cid = r.id || r.customerId || r.customerCode;
          var cName = r.customerName || 'Customer';
          var cPhone = r.customerNumber ? ' - ' + r.customerNumber : '';
          var cCar = r.vehicle ? ' (' + r.vehicle + ')' : '';
          var isSel = (preselectedSpecialCustId && cid === preselectedSpecialCustId) ? ' selected' : '';
          custSelect.innerHTML += '<option value="' + escapeHtml(cid) + '"' + isSel + '>' + escapeHtml(cName + cPhone + cCar) + '</option>';
        });
      }

      // Set default scheduled date to today
      var dateInput = document.getElementById('specialScheduledDate');
      if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
      }

      // Initialize category and seater sizing
      var catSelect = document.getElementById('specialServiceCategory');
      var initialCat = (catSelect && catSelect.value) ? catSelect.value : 'solar_cleaning';
      handleSpecialCategoryChange(initialCat);
      handleSpecialSeaterChange('5_seater');

      if (preselectedSpecialCustId) {
        toggleSpecialCustMode('existing');
        handleSpecialCustSelected(preselectedSpecialCustId);
      } else {
        toggleSpecialCustMode('existing');
      }

      var err = document.getElementById('assignSpecialJobError');
      if (err) err.style.display = 'none';

      modal.style.display = 'flex';
    }

    function closeAssignSpecialJobModal() {
      var modal = document.getElementById('assignSpecialJobModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      preselectedSpecialCustId = null;
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function toggleSpecialCustMode(mode) {
      var existBlock = document.getElementById('specialExistingCustBlock');
      var nameInput = document.getElementById('specialCustName');
      var phoneInput = document.getElementById('specialCustPhone');
      var addrInput = document.getElementById('specialCustAddress');

      if (mode === 'new') {
        if (existBlock) existBlock.style.display = 'none';
        if (nameInput) { nameInput.value = ''; nameInput.readOnly = false; }
        if (phoneInput) { phoneInput.value = ''; phoneInput.readOnly = false; }
        if (addrInput) { addrInput.value = ''; addrInput.readOnly = false; }
      } else {
        if (existBlock) existBlock.style.display = 'block';
        var select = document.getElementById('specialExistingCustSelect');
        if (select && select.value) {
          handleSpecialCustSelected(select.value);
        }
      }
    }

    function handleSpecialCustSelected(custId) {
      if (!custId) return;
      var records = state.adminRecords || [];
      var found = records.find(function(r) {
        return (r.id === custId || r.customerId === custId || r.customerCode === custId);
      });
      if (found) {
        var nameInput = document.getElementById('specialCustName');
        var phoneInput = document.getElementById('specialCustPhone');
        var addrInput = document.getElementById('specialCustAddress');
        var carInput = document.getElementById('specialCarVehicle');

        if (nameInput) { nameInput.value = found.customerName || ''; nameInput.readOnly = true; }
        if (phoneInput) { phoneInput.value = found.customerNumber || ''; phoneInput.readOnly = true; }
        if (addrInput) { addrInput.value = found.address || ''; }
        if (carInput && found.vehicle) { carInput.value = found.vehicle; }

        if (found.seaterType || found.preferredSeaterType) {
          handleSpecialSeaterChange(found.seaterType || found.preferredSeaterType);
        }
      }
    }

    function handleSpecialCategoryChange(cat) {
      cat = cat || (document.getElementById('specialServiceCategory')?.value) || 'solar_cleaning';
      var solarBlock = document.getElementById('specialSolarDetailsBlock');
      var carBlock = document.getElementById('specialCarWashDetailsBlock');
      var pkgSelect = document.getElementById('specialPackageType');

      if (cat === 'solar_cleaning') {
        if (solarBlock) solarBlock.style.display = 'block';
        if (carBlock) carBlock.style.display = 'none';
        var panelsInput = document.getElementById('specialSolarPanelsCount');
        if (panelsInput && !panelsInput.value) panelsInput.value = '10';
      } else {
        if (solarBlock) solarBlock.style.display = 'none';
        if (carBlock) carBlock.style.display = 'block';
      }

      // Populate packages from CWP_SERVICE_CATALOG dynamically
      if (pkgSelect && typeof CWP_SERVICE_CATALOG !== 'undefined') {
        var catDef = CWP_SERVICE_CATALOG[cat];
        if (catDef && Array.isArray(catDef.packages) && catDef.packages.length > 0) {
          pkgSelect.innerHTML = catDef.packages.map(function(p) {
            return '<option value="' + escapeHtml(p.code) + '">' + escapeHtml(p.name + (p.nameHi ? ' (' + p.nameHi + ')' : '')) + '</option>';
          }).join('');
        } else {
          pkgSelect.innerHTML = '<option value="standard">Standard Service</option>';
        }
      }
    }

    function handleSpecialSeaterChange(val) {
      val = val || '5_seater';
      var label5 = document.getElementById('labelSeater5');
      var label5Plus = document.getElementById('labelSeater5Plus');
      var radio5 = document.querySelector('input[name="specialSeaterType"][value="5_seater"]');
      var radio5Plus = document.querySelector('input[name="specialSeaterType"][value="5_plus_seater"]');

      if (val === '5_plus_seater') {
        if (label5) label5.classList.remove('active');
        if (label5Plus) label5Plus.classList.add('active');
        if (radio5Plus) radio5Plus.checked = true;
      } else {
        if (label5) label5.classList.add('active');
        if (label5Plus) label5Plus.classList.remove('active');
        if (radio5) radio5.checked = true;
      }
    }

    function handleCustSeaterChange(val) {
      val = val || '5_seater';
      var label5 = document.getElementById('labelCustSeater5');
      var label5Plus = document.getElementById('labelCustSeater5Plus');
      var radio5 = document.querySelector('input[name="custSeaterType"][value="5_seater"]');
      var radio5Plus = document.querySelector('input[name="custSeaterType"][value="5_plus_seater"]');
      var hidden = document.getElementById('custSeaterTypeHidden');
      if (hidden) hidden.value = val;

      if (val === '5_plus_seater') {
        if (label5) label5.classList.remove('active');
        if (label5Plus) label5Plus.classList.add('active');
        if (radio5Plus) radio5Plus.checked = true;
      } else {
        if (label5) label5.classList.add('active');
        if (label5Plus) label5Plus.classList.remove('active');
        if (radio5) radio5.checked = true;
      }
    }

    function handleEditCustSeaterChange(val) {
      val = val || '5_seater';
      var label5 = document.getElementById('labelEditCustSeater5');
      var label5Plus = document.getElementById('labelEditCustSeater5Plus');
      var radio5 = document.querySelector('input[name="editCustSeaterType"][value="5_seater"]');
      var radio5Plus = document.querySelector('input[name="editCustSeaterType"][value="5_plus_seater"]');
      var hidden = document.getElementById('editCustSeaterTypeHidden');
      if (hidden) hidden.value = val;

      if (val === '5_plus_seater') {
        if (label5) label5.classList.remove('active');
        if (label5Plus) label5Plus.classList.add('active');
        if (radio5Plus) radio5Plus.checked = true;
      } else {
        if (label5) label5.classList.add('active');
        if (label5Plus) label5Plus.classList.remove('active');
        if (radio5) radio5.checked = true;
      }
    }

    function handleConvertSeaterChange(val) {
      val = val || '5_seater';
      var label5 = document.getElementById('labelConvertSeater5');
      var label5Plus = document.getElementById('labelConvertSeater5Plus');
      var radio5 = document.querySelector('input[name="convertSeaterType"][value="5_seater"]');
      var radio5Plus = document.querySelector('input[name="convertSeaterType"][value="5_plus_seater"]');
      var hidden = document.getElementById('convertSeaterTypeHidden');
      if (hidden) hidden.value = val;

      if (val === '5_plus_seater') {
        if (label5) label5.classList.remove('active');
        if (label5Plus) label5Plus.classList.add('active');
        if (radio5Plus) radio5Plus.checked = true;
      } else {
        if (label5) label5.classList.add('active');
        if (label5Plus) label5Plus.classList.remove('active');
        if (radio5) radio5.checked = true;
      }
    }

    function handleAssignSpecialJobSubmit(event) {
      event.preventDefault();
      var err = document.getElementById('assignSpecialJobError');
      if (err) err.style.display = 'none';

      var mode = document.querySelector('input[name="specialCustMode"]:checked')?.value || 'existing';
      var custId = (mode === 'existing') ? (document.getElementById('specialExistingCustSelect')?.value || '') : null;
      var custName = document.getElementById('specialCustName')?.value.trim() || '';
      var custPhone = document.getElementById('specialCustPhone')?.value.trim() || '';
      var custAddress = document.getElementById('specialCustAddress')?.value.trim() || '';
      var serviceCat = document.getElementById('specialServiceCategory')?.value || 'solar_cleaning';
      var scheduledDate = document.getElementById('specialScheduledDate')?.value || '';
      var staffId = document.getElementById('specialStaffSelect')?.value || '';
      var instructions = document.getElementById('specialInstructions')?.value.trim() || '';

      var pkgSelect = document.getElementById('specialPackageType');
      var packageCode = pkgSelect ? pkgSelect.value : '';
      var packageOptionText = pkgSelect && pkgSelect.selectedIndex >= 0 ? pkgSelect.options[pkgSelect.selectedIndex].text : '';

      var isSolar = (serviceCat === 'solar_cleaning');
      var solarPanels = document.getElementById('specialSolarPanels')?.value.trim() || '';
      var solarPanelsCount = parseInt(document.getElementById('specialSolarPanelsCount')?.value, 10) || 10;
      var carVeh = document.getElementById('specialCarVehicle')?.value.trim() || '';
      var seaterType = document.querySelector('input[name="specialSeaterType"]:checked')?.value || '5_seater';

      if (!staffId) {
        if (err) { err.textContent = 'कृपया काम करने के लिए स्टाफ चुनें।'; err.style.display = 'block'; }
        return;
      }
      if (!custName || !custPhone) {
        if (err) { err.textContent = 'कृपया ग्राहक का नाम और मोबाइल नंबर भरें।'; err.style.display = 'block'; }
        return;
      }

      var submitBtn = document.getElementById('btnSubmitAssignSpecial');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ असाइन हो रहा है...</span>';
      }

      var serviceName = 'Special Job';
      if (typeof CWP_SERVICE_CATALOG !== 'undefined' && CWP_SERVICE_CATALOG[serviceCat]) {
        serviceName = CWP_SERVICE_CATALOG[serviceCat].name;
      }

      var packageDetails = packageOptionText || (isSolar ? ('Solar Cleaning (' + solarPanelsCount + ' panels)') : (carVeh || 'Car Service'));

      var payload = {
        customerId: custId,
        customerName: custName,
        phone: custPhone,
        address: custAddress,
        serviceCategoryId: serviceCat,
        serviceType: serviceName,
        packageCode: packageCode,
        packageDetails: packageDetails,
        seaterType: isSolar ? null : seaterType,
        panelCount: isSolar ? solarPanelsCount : null,
        siteDetails: isSolar ? { panelCount: solarPanelsCount, panelScope: solarPanels } : null,
        vehicleDetails: isSolar ? null : (carVeh ? { vehicle: carVeh, seaterType: seaterType } : { seaterType: seaterType }),
        scheduledDate: scheduledDate,
        staffId: staffId,
        specialInstructions: instructions
      };

      apiCall('assignSpecialJob', { jobData: payload }, function(res) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 Assign & Dispatch Task</span>';
        }
        if (res && res.success) {
          showToast('⚡ काम स्टाफ को सफलतापूर्वक असाइन हो गया!', '✅');
          closeAssignSpecialJobModal();
          if (getSavedAdminTab() === 'specialJobs') {
            loadAdminSpecialJobs();
          }
        } else {
          if (err) { err.textContent = (res && res.error) || 'असाइनमेंट में त्रुटि'; err.style.display = 'block'; }
        }
      }, function(netErr) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 Assign & Dispatch Task</span>';
        }
        if (err) { err.textContent = 'Error: ' + netErr.message; err.style.display = 'block'; }
      });
    }

    /* Admin: Reassign Special Job to Another Staff */
    function openReassignJobModal(jobId, triggerEl) {
      if (typeof recordModalTrigger === 'function') recordModalTrigger(triggerEl || (typeof document !== 'undefined' && document.activeElement));
      var modal = document.getElementById('reassignJobModal');
      if (!modal) return;

      var job = (adminSpecialJobsCache || []).find(function(j) {
        return (j.id === jobId || j.jobId === jobId);
      });

      var targetInput = document.getElementById('reassignJobTargetId');
      var nameEl = document.getElementById('reassignCustName');
      var metaEl = document.getElementById('reassignServiceMeta');
      var staffEl = document.getElementById('reassignCurrentStaff');
      var select = document.getElementById('reassignStaffSelect') || document.getElementById('reassignNewStaffSelect');
      var reasonInput = document.getElementById('reassignReason');
      var err = document.getElementById('reassignJobError');

      if (err) err.style.display = 'none';
      if (reasonInput) reasonInput.value = '';

      if (targetInput) targetInput.value = jobId;
      if (nameEl) nameEl.textContent = job ? (job.customerName || 'Customer') : 'Job #' + jobId;

      var meta = '';
      if (job) {
        var catName = job.serviceType || job.serviceCategoryId;
        var scope = '';
        if (job.panelCount) {
          scope = ' • ☀️ ' + job.panelCount + ' Panels';
        } else if (job.seaterType) {
          scope = ' • ' + (job.seaterType === '5_plus_seater' ? '🚙 5+ Seater' : '🚗 5 Seater');
        }
        var pkg = job.packageDetails ? ' • ' + job.packageDetails : '';
        meta = catName + scope + pkg;
      }
      if (metaEl) metaEl.textContent = meta || 'On-Demand Service Task';

      var currentStaffCode = job ? (job.staffId || job.staffCode || '') : '';
      if (staffEl) staffEl.textContent = job ? (job.staffName ? (job.staffName + (job.staffId ? ' (' + job.staffId + ')' : '')) : 'Unassigned') : '—';

      var submitBtn = document.getElementById('btnSubmitReassignJob');
      if (job && job.status === 'completed') {
        if (err) {
          err.textContent = 'यह काम पूरा हो चुका है (Completed), इसे री-असाइन नहीं किया जा सकता।';
          err.style.display = 'block';
        }
        if (submitBtn) submitBtn.disabled = true;
      } else {
        if (submitBtn) submitBtn.disabled = false;
      }

      function populateReassignStaffOptions(staffList) {
        if (!select) return;
        select.innerHTML = '<option value="">-- Choose New Staff --</option>';
        var currentCode = (job ? (job.staffId || job.staffCode || '') : '').toLowerCase();
        var currentName = (job ? (job.staffName || '') : '').toLowerCase();
        (staffList || []).filter(function(s) {
          var code = (s.id || s.staffCode || s.staff_code || '').toLowerCase();
          var name = (s.name || '').toLowerCase();
          var isCurrent = (currentCode && code === currentCode) || (currentName && name === currentName);
          return s.active !== false && s.isActive !== false && !isCurrent;
        }).forEach(function(s) {
          var code = s.id || s.staffCode || s.staff_code;
          select.innerHTML += '<option value="' + escapeHtml(code) + '">' + escapeHtml(s.name) + ' (' + escapeHtml(code) + ')</option>';
        });
      }

      if (!state.staffList || state.staffList.length === 0) {
        apiCall('getStaffList', {}, function(list) {
          state.staffList = list || [];
          populateReassignStaffOptions(state.staffList);
        });
      } else {
        populateReassignStaffOptions(state.staffList);
      }

      modal.style.display = 'flex';
    }

    function closeReassignJobModal() {
      var modal = document.getElementById('reassignJobModal');
      if (modal) modal.style.display = 'none';
      if (typeof getTopmostOpenModal === 'function' ? getTopmostOpenModal() === null : true) {
        document.body.style.overflow = '';
      }
      if (typeof restoreModalTriggerFocus === 'function') restoreModalTriggerFocus();
    }

    function handleReassignJobSubmit(event) {
      event.preventDefault();
      var err = document.getElementById('reassignJobError');
      if (err) err.style.display = 'none';

      var jobId = document.getElementById('reassignJobTargetId')?.value;
      var newStaffId = (document.getElementById('reassignStaffSelect') || document.getElementById('reassignNewStaffSelect'))?.value;
      var reason = document.getElementById('reassignReason')?.value.trim();

      if (!jobId || !newStaffId) {
        if (err) { err.textContent = 'कृपया नया स्टाफ चुनें।'; err.style.display = 'block'; }
        return;
      }

      var btn = document.getElementById('btnSubmitReassignJob');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Reassigning...</span>';
      }

      apiCall('reassignSpecialJob', { jobId: jobId, newStaffId: newStaffId, reason: reason }, function(res) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🔁</span> Confirm Reassign';
        }
        if (res && res.success) {
          showToast('⚡ काम सफलतापूर्वक नए स्टाफ (' + escapeHtml(res.newStaffName || newStaffId) + ') को सौंप दिया गया!', '✅');
          closeReassignJobModal();
          loadAdminSpecialJobs();
        } else {
          if (err) { err.textContent = (res && res.error) || 'पुनर्निर्धारण में त्रुटि'; err.style.display = 'block'; }
        }
      }, function(netErr) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🔁</span> Confirm Reassign';
        }
        if (err) { err.textContent = 'Error: ' + netErr.message; err.style.display = 'block'; }
      });
    }

    /* Admin: Special Jobs Management & Table View */
    var adminSpecialJobsCache = [];

    function formatJobScheduledDate(dateVal) {
      if (!dateVal) return '<span class="schedule-pill pill-today"><span class="material-symbols-outlined">event</span> Today</span>';
      if (typeof dateVal === 'string' && (dateVal.toLowerCase() === 'today' || dateVal.toLowerCase() === 'कल' || dateVal.toLowerCase() === 'आज')) {
        return '<span class="schedule-pill pill-today"><span class="material-symbols-outlined">event</span> Today</span>';
      }
      try {
        var d = new Date(dateVal);
        if (isNaN(d.getTime())) {
          return '<span class="schedule-pill pill-date"><span class="material-symbols-outlined">event</span> ' + escapeHtml(String(dateVal)) + '</span>';
        }
        
        var now = new Date();
        var isToday = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate());
        
        var yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        var isYesterday = (d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate());
        
        var tom = new Date(now);
        tom.setDate(now.getDate() + 1);
        var isTomorrow = (d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate());
        
        var dateFormatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        var hours = d.getHours();
        var minutes = d.getMinutes();
        var timeFormatted = '';
        if (typeof dateVal === 'string' && dateVal.includes('T') && (hours !== 0 || minutes !== 0) && !(hours === 5 && minutes === 30)) {
          var ampm = hours >= 12 ? 'PM' : 'AM';
          var h12 = hours % 12 || 12;
          var minStr = minutes < 10 ? '0' + minutes : minutes;
          timeFormatted = ' • ' + h12 + ':' + minStr + ' ' + ampm;
        }

        if (isToday) {
          return '<span class="schedule-pill pill-today" title="' + dateFormatted + '"><span class="material-symbols-outlined">event</span> Today' + timeFormatted + '</span>';
        } else if (isTomorrow) {
          return '<span class="schedule-pill pill-tomorrow" title="' + dateFormatted + '"><span class="material-symbols-outlined">event_upcoming</span> Tomorrow' + timeFormatted + '</span>';
        } else if (isYesterday) {
          return '<span class="schedule-pill pill-yesterday" title="' + dateFormatted + '"><span class="material-symbols-outlined">history</span> Yesterday' + timeFormatted + '</span>';
        } else {
          return '<span class="schedule-pill pill-date"><span class="material-symbols-outlined">calendar_today</span> ' + dateFormatted + timeFormatted + '</span>';
        }
      } catch (e) {
        return '<span class="schedule-pill pill-date"><span class="material-symbols-outlined">event</span> ' + escapeHtml(String(dateVal)) + '</span>';
      }
    }

    function selectAdminSpecialCategoryChip(cat) {
      var sel = document.getElementById('adminSpecialCategoryFilter');
      if (sel) sel.value = cat;
      syncAdminSpecialCategoryChips(cat);
      filterAdminSpecialJobs();
    }

    function handleAdminSpecialCategorySelect(cat) {
      syncAdminSpecialCategoryChips(cat);
      filterAdminSpecialJobs();
    }

    function syncAdminSpecialCategoryChips(cat) {
      var chips = document.querySelectorAll('.special-category-chips-bar .category-chip');
      chips.forEach(function(btn) {
        var c = btn.getAttribute('data-cat');
        btn.classList.toggle('active', c === cat);
      });
    }

    function filterAdminSpecialByStatus(status) {
      var sel = document.getElementById('adminSpecialStatusFilter');
      if (sel) sel.value = status;
      syncAdminSpecialKpiCards(status);
      filterAdminSpecialJobs();
    }

    function handleAdminSpecialStatusSelect(status) {
      syncAdminSpecialKpiCards(status);
      filterAdminSpecialJobs();
    }

    function syncAdminSpecialKpiCards(status) {
      var totalCard = document.querySelector('.special-kpi-card.kpi-card-total');
      var assignedCard = document.querySelector('.special-kpi-card.kpi-card-assigned');
      var progCard = document.querySelector('.special-kpi-card.kpi-card-progress');
      var compCard = document.querySelector('.special-kpi-card.kpi-card-completed');

      if (totalCard) totalCard.classList.toggle('active', status === 'all' || !status);
      if (assignedCard) assignedCard.classList.toggle('active', status === 'assigned');
      if (progCard) progCard.classList.toggle('active', status === 'in_progress');
      if (compCard) compCard.classList.toggle('active', status === 'completed');
    }

    function clearAdminSpecialSearch() {
      var s = document.getElementById('adminSpecialSearch');
      if (s) s.value = '';
      var clr = document.getElementById('btnAdminSpecialSearchClear');
      if (clr) clr.style.display = 'none';
      filterAdminSpecialJobs();
    }

    function copyJobAddress(text, btnEl) {
      if (!text) return;
      var feedback = function() {
        if (btnEl) {
          var oldHtml = btnEl.innerHTML;
          btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size: 13px; color: #059669;">check</span> <span style="color: #059669;">Copied</span>';
          setTimeout(function() { btnEl.innerHTML = oldHtml; }, 2000);
        }
        if (typeof showToast === 'function') showToast('Location address copied to clipboard', 'info');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(feedback).catch(function() {
          fallbackCopyText(text, btnEl);
        });
      } else {
        fallbackCopyText(text, btnEl);
      }
    }

    function fallbackCopyText(text, btnEl) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        if (btnEl) {
          var oldHtml = btnEl.innerHTML;
          btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size: 13px; color: #059669;">check</span> <span style="color: #059669;">Copied</span>';
          setTimeout(function() { btnEl.innerHTML = oldHtml; }, 2000);
        }
        if (typeof showToast === 'function') showToast('Location address copied to clipboard', 'info');
      } catch (err) {}
      document.body.removeChild(ta);
    }

    function loadAdminSpecialJobs() {
      var tbody = document.getElementById('adminSpecialJobsTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-loading-cell"><span class="status-sync-spinner" style="display:inline-block; margin-right:8px;"></span> Loading Wash & Solar jobs...</td></tr>';
      }

      // Populate Staff Filter
      var staffFilter = document.getElementById('adminSpecialStaffFilter');
      if (staffFilter && staffFilter.options.length <= 1) {
        var staffList = state.staffList || [];
        staffList.forEach(function(s) {
          staffFilter.innerHTML += '<option value="' + escapeHtml(s.id || s.staffCode || s.staff_code) + '">' + escapeHtml(s.name) + '</option>';
        });
      }

      apiCall('getSpecialJobs', {}, function(res) {
        if (res && res.success) {
          adminSpecialJobsCache = res.jobs || [];
          if (typeof adminSpecialState !== 'undefined' && adminSpecialState) adminSpecialState.allJobs = adminSpecialJobsCache;
          if (typeof window !== 'undefined' && window.adminSpecialState) window.adminSpecialState.allJobs = adminSpecialJobsCache;
          updateSpecialJobsKPIs(adminSpecialJobsCache);
          filterAdminSpecialJobs();
        } else {
          if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 36px; color: #b91c1c;">Failed to load jobs: ' + escapeHtml((res && res.error) || 'Unknown error') + '</td></tr>';
        }
      }, function(err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 36px; color: #b91c1c;">Connection error: ' + escapeHtml(err.message) + '</td></tr>';
      });
    }

    function updateSpecialJobsKPIs(jobs) {
      var total = jobs.length;
      var assigned = jobs.filter(function(j) { return j.status === 'assigned' || !j.status; }).length;
      var inProgress = jobs.filter(function(j) { return j.status === 'in_progress'; }).length;
      var completed = jobs.filter(function(j) { return j.status === 'completed'; }).length;

      var kTotal = document.getElementById('kpiSpecialTotal');
      var kAssigned = document.getElementById('kpiSpecialAssigned');
      var kProg = document.getElementById('kpiSpecialInProgress');
      var kComp = document.getElementById('kpiSpecialCompleted');
      var badgeTab = document.getElementById('tabSpecialJobsCount');

      if (kTotal) kTotal.textContent = total;
      if (kAssigned) kAssigned.textContent = assigned;
      if (kProg) kProg.textContent = inProgress;
      if (kComp) kComp.textContent = completed;
      if (badgeTab) badgeTab.textContent = total;

      // Update category chip counts
      var chipAll = document.getElementById('chipCatCountAll');
      var chipSolar = document.getElementById('chipCatCountSolar');
      var chipInterior = document.getElementById('chipCatCountInterior');
      var chipExterior = document.getElementById('chipCatCountExterior');
      var chipCarWash = document.getElementById('chipCatCountCarWash');
      var chipDaily = document.getElementById('chipCatCountDaily');

      if (chipAll) chipAll.textContent = total;
      if (chipSolar) chipSolar.textContent = jobs.filter(function(j) { return j.serviceCategoryId === 'solar_cleaning'; }).length;
      if (chipInterior) chipInterior.textContent = jobs.filter(function(j) { return j.serviceCategoryId === 'interior_detailing'; }).length;
      if (chipExterior) chipExterior.textContent = jobs.filter(function(j) { return j.serviceCategoryId === 'exterior_detailing'; }).length;
      if (chipCarWash) chipCarWash.textContent = jobs.filter(function(j) { return j.serviceCategoryId === 'car_washing'; }).length;
      if (chipDaily) chipDaily.textContent = jobs.filter(function(j) { return j.serviceCategoryId === 'daily_car_cleaning'; }).length;

      if (typeof updateOperationsDashboardKPIs === 'function') {
        updateOperationsDashboardKPIs();
      }
    }

    function filterAdminSpecialJobs() {
      var catFilter = document.getElementById('adminSpecialCategoryFilter')?.value || 'all';
      var statusFilter = document.getElementById('adminSpecialStatusFilter')?.value || 'all';
      var staffFilter = document.getElementById('adminSpecialStaffFilter')?.value || 'all';
      var searchInput = document.getElementById('adminSpecialSearch');
      var searchVal = (searchInput?.value || '').trim().toLowerCase();

      var clrBtn = document.getElementById('btnAdminSpecialSearchClear');
      if (clrBtn) {
        clrBtn.style.display = searchVal ? 'flex' : 'none';
      }

      var filtered = adminSpecialJobsCache.filter(function(j) {
        if (catFilter !== 'all' && j.serviceCategoryId !== catFilter) return false;
        if (statusFilter !== 'all') {
          var s = j.status || 'assigned';
          if (s !== statusFilter) return false;
        }
        if (staffFilter !== 'all') {
          var matchStaff = (j.staffId && j.staffId.toLowerCase() === staffFilter.toLowerCase()) ||
                           (j.staffName && j.staffName.toLowerCase() === staffFilter.toLowerCase());
          if (!matchStaff) return false;
        }
        if (searchVal) {
          var match = (j.customerName && j.customerName.toLowerCase().includes(searchVal)) ||
                      (j.customerPhone && j.customerPhone.includes(searchVal)) ||
                      (j.address && j.address.toLowerCase().includes(searchVal)) ||
                      (j.serviceType && j.serviceType.toLowerCase().includes(searchVal)) ||
                      (j.serviceCategoryId && j.serviceCategoryId.toLowerCase().includes(searchVal)) ||
                      (j.panelCount && String(j.panelCount).includes(searchVal)) ||
                      (j.seaterType && j.seaterType.toLowerCase().includes(searchVal));
          if (!match) return false;
        }
        return true;
      });

      var countEl = document.getElementById('adminSpecialJobsFilteredCount');
      var totalEl = document.getElementById('adminSpecialJobsTotalCount');
      if (countEl) countEl.textContent = filtered.length;
      if (totalEl) totalEl.textContent = adminSpecialJobsCache.length;

      renderAdminSpecialJobsTable(filtered);
    }

    function resetAdminSpecialFilters() {
      var s = document.getElementById('adminSpecialSearch');
      var c = document.getElementById('adminSpecialCategoryFilter');
      var st = document.getElementById('adminSpecialStatusFilter');
      var sf = document.getElementById('adminSpecialStaffFilter');
      var clr = document.getElementById('btnAdminSpecialSearchClear');

      if (s) s.value = '';
      if (clr) clr.style.display = 'none';
      if (c) c.value = 'all';
      if (st) st.value = 'all';
      if (sf) sf.value = 'all';

      syncAdminSpecialCategoryChips('all');
      syncAdminSpecialKpiCards('all');
      filterAdminSpecialJobs();
    }

    function handleAdminSpecialSearch(val) {
      filterAdminSpecialJobs();
    }

    function formatJobTimeStr(isoStr) {
      if (!isoStr) return '';
      try {
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        var hours = d.getHours();
        var minutes = d.getMinutes();
        var ampm = hours >= 12 ? 'PM' : 'AM';
        var h12 = hours % 12 || 12;
        var minStr = minutes < 10 ? '0' + minutes : minutes;
        return h12 + ':' + minStr + ' ' + ampm;
      } catch (e) {
        return '';
      }
    }

    function formatJobDateShort(isoStr) {
      if (!isoStr) return '';
      try {
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      } catch (e) {
        return '';
      }
    }

    function renderAdminSpecialJobsTable(jobs) {
      var tbody = document.getElementById('adminSpecialJobsTableBody');
      if (!tbody) return;

      if (!jobs || jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 48px; color: var(--text-muted);">' +
          '<div style="font-size: 32px; margin-bottom: 10px;">☀️</div>' +
          '<div style="font-weight: 700; font-size: 15px; color: var(--text-primary);">No on-demand jobs found matching filters</div>' +
          '<div style="font-size: 12.5px; margin-top: 6px; color: var(--text-secondary);">Assign a new job using "+ Assign Wash & Solar" button above.</div>' +
        '</td></tr>';
        return;
      }

      var html = '';
      jobs.forEach(function(j, idx) {
        var catBadge = '';
        var catIcon = '';
        if (j.serviceCategoryId === 'solar_cleaning') {
          catIcon = '<span class="material-symbols-outlined cat-m3-icon" aria-hidden="true">solar_power</span>';
          catBadge = '<span class="m3-service-chip chip-solar badge-cat-solar">' + catIcon + '<span>☀️ Solar Clean</span></span>';
        } else if (j.serviceCategoryId === 'car_washing') {
          catIcon = '<span class="material-symbols-outlined cat-m3-icon" aria-hidden="true">local_car_wash</span>';
          catBadge = '<span class="m3-service-chip chip-carwash badge-cat-carwash">' + catIcon + '<span>🧼 Car Wash</span></span>';
        } else if (j.serviceCategoryId === 'interior_detailing') {
          catIcon = '<span class="material-symbols-outlined cat-m3-icon" aria-hidden="true">auto_awesome</span>';
          catBadge = '<span class="m3-service-chip chip-interior badge-cat-interior">' + catIcon + '<span>✨ Interior Detail</span></span>';
        } else if (j.serviceCategoryId === 'exterior_detailing') {
          catIcon = '<span class="material-symbols-outlined cat-m3-icon" aria-hidden="true">shield</span>';
          catBadge = '<span class="m3-service-chip chip-exterior badge-cat-exterior">' + catIcon + '<span>🛡️ Exterior Detail</span></span>';
        } else {
          catIcon = '<span class="material-symbols-outlined cat-m3-icon" aria-hidden="true">directions_car</span>';
          catBadge = '<span class="m3-service-chip chip-daily badge-cat-daily">' + catIcon + '<span>🚗 Daily Clean</span></span>';
        }

        var workTypeColHtml = '<div class="service-cell-block">' + catBadge + '</div>';

        var scopePills = '';
        if (j.panelCount) {
          scopePills += '<span class="scope-pill scope-solar"><span class="material-symbols-outlined">solar_power</span> ☀️ ' + escapeHtml(String(j.panelCount)) + ' Panels</span>';
        }
        if (j.seaterType) {
          var is5Plus = (j.seaterType === '5_plus_seater');
          scopePills += '<span class="scope-pill scope-vehicle"><span class="material-symbols-outlined">' + (is5Plus ? 'airport_shuttle' : 'directions_car') + '</span> ' + (is5Plus ? '🚙 5+ Seater' : '🚗 5 Seater') + '</span>';
        }
        if (j.registrationNo) {
          scopePills += '<span class="scope-pill" style="font-family:monospace; font-weight:700;">' + escapeHtml(j.registrationNo) + '</span>';
        }

        var scheduleHtml = formatJobScheduledDate(j.scheduledDate);

        var scopeColHtml = '<div class="scope-cell-block">' +
          (scopePills ? '<div style="display:flex; gap:4px; flex-wrap:wrap;">' + scopePills + '</div>' : '<span style="color:var(--text-muted); font-size:12px;">Standard</span>') +
          '<div class="scope-sched-sub"><span class="material-symbols-outlined sched-icon">event</span> ' + scheduleHtml + '</div>' +
        '</div>';

        var cleanPhone = (j.customerPhone || '').replace(/\D/g, '');
        if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
        var waUrl = cleanPhone.length === 10 ? 'https://wa.me/91' + cleanPhone : '';

        var custColHtml = '<div class="table-cust-block">' +
          '<div class="table-cust-name">' + escapeHtml(j.customerName || 'Customer') + '</div>' +
          (j.customerPhone ?
            '<div class="table-cust-phone-row">' +
              '<a href="tel:' + escapeHtml(j.customerPhone) + '" class="table-cust-call-link" title="Call ' + escapeHtml(j.customerName || '') + '">' +
                '<span class="material-symbols-outlined phone-icon">call</span>' +
                '<span>' + escapeHtml(j.customerPhone) + '</span>' +
              '</a>' +
              (waUrl ? '<a href="' + waUrl + '" target="_blank" rel="noopener noreferrer" class="table-cust-wa-btn" title="Chat on WhatsApp with ' + escapeHtml(j.customerName || '') + '"><span class="material-symbols-outlined wa-icon">chat</span></a>' : '') +
            '</div>' : '') +
        '</div>';

        var rawAddress = (j.address || '').trim();
        var hasAddress = rawAddress.length > 0;
        var mapsUrl = j.googleMapsUrl || (hasAddress ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(rawAddress) : '');

        var locColHtml = '<div class="table-loc-block">' +
          (hasAddress ?
            '<div class="table-loc-text" title="' + escapeHtml(rawAddress) + '">' +
              '<span class="material-symbols-outlined loc-pin-icon">location_on</span>' +
              '<span>' + escapeHtml(rawAddress) + '</span>' +
            '</div>' : '<span class="loc-unspecified">Location provided</span>') +
          (mapsUrl ? '<a href="' + escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer" class="loc-maps-link" title="Open Google Maps"><span class="material-symbols-outlined">explore</span> <span>Map ↗</span></a>' : '') +
        '</div>';

        var staffName = (j.staffName || '').trim();
        var hasStaff = staffName.length > 0 && staffName.toLowerCase() !== 'unassigned';
        var staffFirstName = hasStaff ? staffName.split(' ')[0] : 'Unassigned';
        var staffInitial = hasStaff ? staffFirstName.charAt(0).toUpperCase() : '?';

        var staffColHtml = '';
        if (hasStaff) {
          staffColHtml = '<div class="m3-staff-card staff-chip-pill" title="Assigned cleaner: ' + escapeHtml(staffName) + '">' +
            '<div class="m3-staff-avatar staff-chip-avatar">' + staffInitial + '</div>' +
            '<div class="m3-staff-name staff-chip-name">' + escapeHtml(staffFirstName) + '</div>' +
          '</div>';
        } else {
          staffColHtml = '<button type="button" class="m3-unassigned-chip staff-chip-pill" onclick="openReassignJobModal(\'' + escapeHtml(j.id || j.jobId) + '\', this)" title="Assign cleaner now">' +
            '<span class="material-symbols-outlined warn-icon">person_add</span>' +
            '<span class="staff-chip-name">Unassigned</span>' +
          '</button>';
        }

        // Timeline & Timing calculation
        var assignIso = j.assignedAt || j.createdAt;
        var assignTime = formatJobTimeStr(assignIso);
        var assignDate = formatJobDateShort(assignIso);
        var assignText = assignTime ? assignTime : '—';

        var startIso = j.startedAt;
        var startTime = formatJobTimeStr(startIso);
        var startText = '—';
        var acceptLagHtml = '';
        var startedStepClass = 'step-pending';

        if (startIso && startTime) {
          startText = startTime;
          startedStepClass = 'step-done';
          if (assignIso) {
            var lagMin = Math.round((new Date(startIso).getTime() - new Date(assignIso).getTime()) / 60000);
            if (lagMin >= 1) {
              acceptLagHtml = '<span class="step-lag" title="Accepted ' + lagMin + ' mins after assignment">+' + lagMin + 'm</span>';
            }
          }
        } else if (j.status === 'assigned') {
          if (assignIso) {
            var waitMin = Math.max(0, Math.round((Date.now() - new Date(assignIso).getTime()) / 60000));
            startText = '<span class="step-wait">⏳ Waiting (' + waitMin + 'm)</span>';
          } else {
            startText = '<span class="step-wait">⏳ Pending</span>';
          }
        }

        var completedIso = j.completedAt;
        var completedTime = formatJobTimeStr(completedIso);
        var endText = '—';
        var durHtml = '';
        var endStepClass = 'step-pending';

        if (j.status === 'completed') {
          endStepClass = 'step-done';
          endText = completedTime || 'Done';
          var durMins = j.durationMinutes;
          if (!durMins && startIso && completedIso) {
            durMins = Math.max(1, Math.round((new Date(completedIso).getTime() - new Date(startIso).getTime()) / 60000));
          }
          if (durMins) {
            durHtml = '<span class="step-dur" title="Cleaning duration: ' + durMins + ' minutes"><span class="material-symbols-outlined" style="font-size:11px;">timer</span>' + durMins + 'm</span>';
          }
        } else if (j.status === 'in_progress') {
          endStepClass = 'step-active';
          var elapsedMins = j.elapsedMinutes;
          if (!elapsedMins && startIso) {
            elapsedMins = Math.max(1, Math.round((Date.now() - new Date(startIso).getTime()) / 60000));
          }
          endText = '<span class="step-running" title="Currently running"><span class="material-symbols-outlined" style="font-size:11px;">bolt</span>' + (elapsedMins ? elapsedMins + 'm' : 'Running') + '</span>';
        }

        var timelineColHtml = '<div class="job-timeline-card">' +
          '<div class="timeline-step step-assigned" title="Assigned at ' + escapeHtml(assignText) + (assignDate ? ' (' + assignDate + ')' : '') + '">' +
            '<span class="step-dot"></span>' +
            '<span class="step-lbl">Assign:</span>' +
            '<span class="step-time">' + escapeHtml(assignText) + '</span>' +
          '</div>' +
          '<div class="timeline-step ' + startedStepClass + '" title="Cleaner accepted / started">' +
            '<span class="step-dot"></span>' +
            '<span class="step-lbl">Start:</span>' +
            '<span class="step-time">' + startText + '</span>' +
            acceptLagHtml +
          '</div>' +
          '<div class="timeline-step ' + endStepClass + '" title="Completion timing">' +
            '<span class="step-dot"></span>' +
            '<span class="step-lbl">' + (j.status === 'completed' ? 'Done:' : (j.status === 'in_progress' ? 'Active:' : 'End:')) + '</span>' +
            '<span class="step-time">' + endText + '</span>' +
            durHtml +
          '</div>' +
        '</div>';

        var statusColHtml = '';
        if (j.status === 'in_progress') {
          statusColHtml = '<span class="m3-status-chip status-badge status-in-progress" title="Cleaner is actively working"><span class="status-pulse-dot"></span><span>⏳ Active</span></span>';
        } else if (j.status === 'completed') {
          statusColHtml = '<span class="m3-status-chip status-badge status-completed" title="Job verified completed"><span class="material-symbols-outlined status-icon">check_circle</span><span>✅ Done</span></span>';
        } else {
          statusColHtml = '<span class="m3-status-chip status-badge status-assigned" title="Dispatched and assigned to staff"><span class="material-symbols-outlined status-icon">schedule</span><span>📋 Assigned</span></span>';
        }

        var bList = Array.isArray(j.beforePhotos) ? j.beforePhotos : [];
        var aList = Array.isArray(j.afterPhotos) ? j.afterPhotos : [];
        var photosCount = bList.length + aList.length;

        var photosColHtml = '';
        if (photosCount > 0) {
          photosColHtml = '<div class="m3-photos-cluster" style="display: flex; gap: 6px; justify-content: center; align-items: center;">';
          if (bList.length > 0) {
            photosColHtml += '<button type="button" class="m3-thumb-btn thumb-before" onclick="openImageModal(\'' + escapeHtml(bList[0]) + '\', \'' + escapeHtml(j.customerName) + '\', \'Before Photo\')" title="View Before Photo">' +
              '<img src="' + escapeHtml(bList[0]) + '" alt="Before Photo" loading="lazy">' +
              '<span class="thumb-tag">Before</span>' +
            '</button>';
          }
          if (aList.length > 0) {
            photosColHtml += '<button type="button" class="m3-thumb-btn thumb-after" onclick="openImageModal(\'' + escapeHtml(aList[0]) + '\', \'' + escapeHtml(j.customerName) + '\', \'After Photo\')" title="View After Photo">' +
              '<img src="' + escapeHtml(aList[0]) + '" alt="After Photo" loading="lazy">' +
              '<span class="thumb-tag">After</span>' +
            '</button>';
          }
          photosColHtml += '</div>';
        } else {
          photosColHtml = '<div class="m3-photos-empty" title="Staff has not uploaded before/after photos yet">' +
            '<span class="material-symbols-outlined empty-cam-icon">no_photography</span>' +
            '<span>No photos yet</span>' +
          '</div>';
        }

        var isCompleted = (j.status === 'completed');
        var reassignBtn = isCompleted
          ? '<span class="badge-reassign-locked m3-action-locked" title="Completed tasks cannot be reassigned"><span class="material-symbols-outlined">lock</span> <span>Done</span></span>'
          : '<button type="button" class="btn-cell-action btn-reassign-record m3-row-action-btn action-reassign" onclick="openReassignJobModal(\'' + escapeHtml(j.id || j.jobId) + '\', this)" title="काम दूसरे स्टाफ को सौंपें (Reassign)"><span class="material-symbols-outlined">sync_alt</span> <span>Reassign</span></button>';

        var deleteBtn = '<button type="button" class="btn-cell-action btn-delete-record m3-row-action-btn action-delete" onclick="deleteAdminSpecialJob(\'' + escapeHtml(j.id || j.jobId) + '\')" title="Cancel job">' +
          '<svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>' +
        '</button>';

        var actionsColHtml = '<div class="table-actions-cluster">' + reassignBtn + deleteBtn + '</div>';

        html += '<tr>' +
          '<td class="col-sno"><span class="sno-badge">' + (idx + 1) + '</span></td>' +
          '<td class="col-worktype">' + workTypeColHtml + '</td>' +
          '<td class="col-scope">' + scopeColHtml + '</td>' +
          '<td class="col-customer">' + custColHtml + '</td>' +
          '<td class="col-location">' + locColHtml + '</td>' +
          '<td class="col-staff">' + staffColHtml + '</td>' +
          '<td class="col-timeline">' + timelineColHtml + '</td>' +
          '<td class="col-status">' + statusColHtml + '</td>' +
          '<td class="col-photos">' + photosColHtml + '</td>' +
          '<td class="col-actions">' + actionsColHtml + '</td>' +
        '</tr>';
      });

      tbody.innerHTML = html;
      if (typeof updateOperationsDashboardKPIs === 'function') {
        updateOperationsDashboardKPIs();
      }
    }

    function deleteAdminSpecialJob(jobId) {
      if (!confirm('क्या आप इस काम को रद्द (Cancel) करना चाहते हैं?')) return;
      apiCall('deleteSpecialJob', { jobId: jobId }, function(res) {
        if (res && res.success) {
          showToast('काम रद्द कर दिया गया।', 'info');
          loadAdminSpecialJobs();
        } else {
          showToast((res && res.error) || 'रद्द करने में त्रुटि', '❌');
        }
      }, function(err) {
        showToast('Error: ' + err.message, '❌');
      });
    }

    // Initialize PWA engine
    initPwa();

    if (typeof window !== 'undefined') {
      window.DAILY_CLEAN_STORAGE_KEY = DAILY_CLEAN_STORAGE_KEY;
      window.getAsiaKolkataDateKey = getAsiaKolkataDateKey;
      window.getTodayDateKey = getTodayDateKey;
      window.getMsUntilMidnightAsiaKolkata = getMsUntilMidnightAsiaKolkata;
      window.getCompletedCustomersSet = getCompletedCustomersSet;
      window.isCustomerDoneToday = isCustomerDoneToday;
      window.toggleCustomerDoneToday = toggleCustomerDoneToday;
      window.handleDailyCleanClick = handleDailyCleanClick;
      window.openCleaningCameraModal = openCleaningCameraModal;
      window.closeCleaningCameraModal = closeCleaningCameraModal;
      window.snapCleaningPhoto = snapCleaningPhoto;
      window.retakeCleaningPhoto = retakeCleaningPhoto;
      window.confirmAndSaveCleaningPhoto = confirmAndSaveCleaningPhoto;
      window.handleCustomerWhatsAppShare = handleCustomerWhatsAppShare;
      window.triggerCleaningWhatsAppShare = triggerCleaningWhatsAppShare;
      window.openDesktopWhatsAppImageHelper = openDesktopWhatsAppImageHelper;
      window.closeWhatsAppImageModal = closeWhatsAppImageModal;
      window.proceedToWhatsAppChat = proceedToWhatsAppChat;
      window.copyWaModalImageAgain = copyWaModalImageAgain;
      window.downloadWaModalImage = downloadWaModalImage;
      window.loadDailyCleanReports = loadDailyCleanReports;
      window.toggleCleanReportsAutoSync = toggleCleanReportsAutoSync;
      window.startDailyCleanReportsAutoSync = startDailyCleanReportsAutoSync;
      window.stopDailyCleanReportsAutoSync = stopDailyCleanReportsAutoSync;
      window.handleStaffPhotoSelect = handleStaffPhotoSelect;
      window.clearNewStaffPhoto = clearNewStaffPhoto;
      window.removeEditStaffPhoto = removeEditStaffPhoto;
      window.setReportPeriodChip = setReportPeriodChip;
      window.openReportPhotoLightbox = openReportPhotoLightbox;
      window.closeReportPhotoLightbox = closeReportPhotoLightbox;
      window.exportDailyCleanReportsCSV = exportDailyCleanReportsCSV;
      window.getCustomerCompletionData = getCustomerCompletionData;
      window.openStaffWhatsAppGroupModal = openStaffWhatsAppGroupModal;
      window.closeStaffWhatsAppGroupModal = closeStaffWhatsAppGroupModal;
      window.saveStaffWhatsAppGroupSetting = saveStaffWhatsAppGroupSetting;
      window.updateRouteProgressBar = updateRouteProgressBar;
      window.checkAndHandleDateChange = checkAndHandleDateChange;
      window.scheduleMidnightCheck = scheduleMidnightCheck;
      window.getDailyCleanStore = getDailyCleanStore;
      window.saveDailyCleanStore = saveDailyCleanStore;
      window.getCleanStaffId = getCleanStaffId;
      window.getCustomerStableId = getCustomerStableId;
      window.isPwaStandaloneMode = isPwaStandaloneMode;
      window.updatePwaInstallState = updatePwaInstallState;
      window.hidePwaUi = hidePwaUi;
      window.triggerPwaInstallPrompt = triggerPwaInstallPrompt;
      window.dismissPwaBanner = dismissPwaBanner;
      window.openPwaIosModal = openPwaIosModal;
      window.closePwaIosModal = closePwaIosModal;
      window.applyPwaUpdate = applyPwaUpdate;
      window.changeAdminPage = changeAdminPage;
      window.changeAdminPageSize = changeAdminPageSize;
      window.speakHindiCustomerDetails = speakHindiCustomerDetails;
      window.handleBackfillHindi = handleBackfillHindi;
      window.transliterateTextViaApi = transliterateTextViaApi;
      window.setupIndicInputListeners = setupIndicInputListeners;

      // Special on-demand jobs (Car Wash & Solar Panel Cleaning)
      window.openStartSpecialJobModal = openStartSpecialJobModal;
      window.closeStartSpecialJobModal = closeStartSpecialJobModal;
      window.handleStartJobPhotoSelect = handleStartJobPhotoSelect;
      window.removeStartJobPhoto = removeStartJobPhoto;
      window.submitStartSpecialJob = submitStartSpecialJob;
      window.openCompleteSpecialJobModal = openCompleteSpecialJobModal;
      window.closeCompleteSpecialJobModal = closeCompleteSpecialJobModal;
      window.handleCompleteJobPhotoSelect = handleCompleteJobPhotoSelect;
      window.removeCompleteJobPhoto = removeCompleteJobPhoto;
      window.submitCompleteSpecialJob = submitCompleteSpecialJob;
      window.openCancelSpecialJobModal = openCancelSpecialJobModal;
      window.closeCancelSpecialJobModal = closeCancelSpecialJobModal;
      window.submitCancelSpecialJob = submitCancelSpecialJob;
      window.shareSpecialJobWhatsApp = shareSpecialJobWhatsApp;
      window.openAssignSpecialJobModal = openAssignSpecialJobModal;
      window.closeAssignSpecialJobModal = closeAssignSpecialJobModal;
      window.toggleSpecialCustMode = toggleSpecialCustMode;
      window.handleSpecialCustSelected = handleSpecialCustSelected;
      window.handleSpecialCategoryChange = handleSpecialCategoryChange;
      window.handleSpecialSeaterChange = handleSpecialSeaterChange;
      window.handleCustSeaterChange = handleCustSeaterChange;
      window.handleEditCustSeaterChange = handleEditCustSeaterChange;
      window.handleConvertSeaterChange = handleConvertSeaterChange;
      window.setOtherJobsSubFilter = setOtherJobsSubFilter;
      window.handleAssignSpecialJobSubmit = handleAssignSpecialJobSubmit;
      window.openReassignJobModal = openReassignJobModal;
      window.closeReassignJobModal = closeReassignJobModal;
      window.handleReassignJobSubmit = handleReassignJobSubmit;
      window.loadAdminSpecialJobs = loadAdminSpecialJobs;
      window.filterAdminSpecialJobs = filterAdminSpecialJobs;
      window.resetAdminSpecialFilters = resetAdminSpecialFilters;
      window.handleAdminSpecialSearch = handleAdminSpecialSearch;
      window.renderAdminSpecialJobsTable = renderAdminSpecialJobsTable;
      window.deleteAdminSpecialJob = deleteAdminSpecialJob;
      window.selectAdminSpecialCategoryChip = selectAdminSpecialCategoryChip;
      window.handleAdminSpecialCategorySelect = handleAdminSpecialCategorySelect;
      window.filterAdminSpecialByStatus = filterAdminSpecialByStatus;
      window.handleAdminSpecialStatusSelect = handleAdminSpecialStatusSelect;
      window.clearAdminSpecialSearch = clearAdminSpecialSearch;
      window.copyJobAddress = copyJobAddress;
      window.formatJobScheduledDate = formatJobScheduledDate;
      window.playNewTaskChime = playNewTaskChime;
      window.playTaskCompletedChime = playTaskCompletedChime;
      window.showLogoutModal = showLogoutModal;
      window.openSeqResetModal = openSeqResetModal;
      window.closeReportPhotoLightboxModal = closeReportPhotoLightboxModal;
      window.closeWhatsAppImageShareModal = closeWhatsAppImageShareModal;
      window.showStaffNewTaskBanner = showStaffNewTaskBanner;
      window.jumpToSpecialJob = jumpToSpecialJob;
      window.setAppThemeMode = setAppThemeMode;
      window.updateSettingsPrefButtons = updateSettingsPrefButtons;
      window.renderCustomerCards = renderCustomerCards;
      window.setStaffFilter = setStaffFilter;
    }

