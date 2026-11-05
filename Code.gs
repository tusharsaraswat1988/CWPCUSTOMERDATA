/**
 * =========================================================================
 * CWP Staff Information Viewer - Google Apps Script Backend
 * CWP Detailers & Motors
 *
 * Hardened Security & Functional Architecture:
 * - Unified Secure API Gateway: apiRequest(action, payload)
 * - Strict Session Enforcement: No direct execution of sensitive functions
 * - All Internal Operations Moved to Private Functions Ending in '_'
 * - Mandatory Authentication on All Customer & Staff Data Endpoints
 * - Trusted Server-to-Server Authentication via SERVICE_KEY
 * - Protected Staff PIN Synchronization (No [PROTECTED] or default PIN corruption)
 * - 12-Hour Session TTL with Cryptographic Session Tokens
 * - Preserved Customer-First Schema, Dual Locations & 3 Service Categories
 *
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit
 * =========================================================================
 */

var SPREADSHEET_ID = "1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY";
var DRIVE_FOLDER_NAME = "CWP_Customer_Photos";
var SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (Documented Consistent TTL)
var ADMIN_PASSWORD_PROP_KEY = "CWP_ADMIN_PASSWORD";

/**
 * =========================================================================
 * GOOGLE SHEETS UI MENU HANDLERS
 * Executable only from the active spreadsheet UI by authenticated editors.
 * =========================================================================
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🚗 CWP Management')
      .addItem('1. 🔄 Reorder Columns (Customer-First)', 'menuReorderSheet')
      .addItem('2. 👔 Sync Staff Dropdown in Sheet', 'menuSyncStaffDropdown')
      .addItem('3. 👥 Sync Dedicated Staff Sheet Tab', 'menuSyncStaffSheet')
      .addItem('4. 🧹 Fix & Remove Address Dropdown', 'menuClearInvalidDropdowns')
      .addToUi();
  } catch (e) {
    // SpreadsheetApp.getUi() is not available when executed as a Web App
  }
}

function menuReorderSheet() {
  return reorderSheetToCustomerFirst_();
}

function menuSyncStaffDropdown() {
  syncStaffDropdownValidation_();
}

function menuSyncStaffSheet() {
  syncStaffSheet_();
}

function menuClearInvalidDropdowns() {
  return clearInvalidDropdowns_();
}

/**
 * Serves the Web Application
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile("Index");
  
  var staffId = (e && e.parameter && (e.parameter.staff || e.parameter.id)) ? (e.parameter.staff || e.parameter.id) : "";
  var mode = (e && e.parameter && e.parameter.admin) ? "admin" : (staffId ? "staff" : "admin");
  
  template.initialStaffId = staffId.toString().trim();
  template.initialMode = mode;
  
  var appUrl = "";
  try {
    appUrl = ScriptApp.getService().getUrl();
  } catch (err) {
    appUrl = "";
  }
  template.webAppUrl = appUrl;

  var pageTitle = mode === "staff" ? "CWP Detailers & Motors - स्टाफ पोर्टल" : "CWP Detailers & Motors - एडमिन मैनेजमेंट";

  return template.evaluate()
    .setTitle(pageTitle)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * =========================================================================
 * PUBLIC SECURE REQUEST GATEWAY (google.script.run & doPost)
 * All external requests route through handleApiRequest_().
 * No operational function remains publicly callable directly.
 * =========================================================================
 */

/**
 * Single public entry point for frontend google.script.run calls.
 * Enforces session token authorization before calling internal operations.
 */
function apiRequest(action, payload) {
  return handleApiRequest_(action, payload || {}, "client_gateway");
}

/**
 * Web App HTTP POST handler (for Railway server-to-server proxy and REST clients).
 */
function doPost(e) {
  try {
    var rawContent = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var requestData = JSON.parse(rawContent);
    var action = requestData.action || "";
    var result = handleApiRequest_(action, requestData, "http_post");
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Malformed request payload: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Core Request Dispatcher & Authorization Controller
 * Shared between apiRequest() and doPost().
 */
function handleApiRequest_(action, payload, callerType) {
  if (!action || typeof action !== "string") {
    return { success: false, error: "Action is required." };
  }

  payload = payload || {};
  var token = (payload.token || payload.adminToken || payload.staffToken || "").toString().trim();
  var serviceKey = (payload.serviceKey || "").toString().trim();

  var isServiceAuth = isValidServiceKeyGas_(serviceKey);
  var isAdminAuth = isValidAdminSessionGas_(token);
  var staffSession = getValidStaffSessionGas_(token);

  // -----------------------------------------------------------------------
  // 1. Unauthenticated Public Operations (Login, Logout & Public Staff List)
  // -----------------------------------------------------------------------
  if (action === "verifyAdminPassword") {
    return verifyAdminPassword_(payload.password);
  }

  if (action === "verifyStaffPin") {
    var identifier = payload.phone || payload.mobile || payload.staffPhone || payload.staffId;
    return verifyStaffPin_(identifier, payload.pin);
  }

  if (action === "logoutAdmin") {
    revokeAdminSessionGas_(token);
    return { success: true, message: "Admin session revoked." };
  }

  if (action === "logoutStaff") {
    revokeStaffSessionGas_(token);
    return { success: true, message: "Staff session revoked." };
  }

  if (action === "getStaffList") {
    // Returns sanitized public list (no PINs, no phone numbers for public)
    // Only verified Admin session or trusted service key gets admin-level view with hasPin
    var canViewAdminStaff = isAdminAuth || isServiceAuth;
    return getStaffListSanitized_(canViewAdminStaff);
  }

  // -----------------------------------------------------------------------
  // 2. Staff Customer Data Access (Strict Session & Boundary Enforcement)
  // -----------------------------------------------------------------------
  if (action === "getStaffData") {
    // Problem B Fix: Authentication is mandatory for every staff-data request.
    if (!token && !isServiceAuth) {
      return {
        success: false,
        error: "Unauthorized: Missing authentication token. Staff or Admin login required.",
        unauthorized: true
      };
    }

    var clientVersion = (payload.version || "").toString().trim();

    if (isServiceAuth) {
      // Trusted Node server request; target staff specified by server
      var targetStaffId = payload.staffId || "STF01";
      return getStaffCustomerData_(targetStaffId, token, true, clientVersion);
    }

    if (isAdminAuth) {
      // Admin previewing staff data
      var adminTargetStaffId = payload.staffId || "STF01";
      return getStaffCustomerData_(adminTargetStaffId, token, false, clientVersion);
    }

    if (staffSession) {
      // Staff accessing their own data.
      // Strict isolation: Never trust browser-supplied staffId over the session identity!
      var requestedStaff = (payload.staffId || "").toString().trim().toUpperCase();
      var boundStaff = (staffSession.staffId || "").toString().trim().toUpperCase();
      if (requestedStaff && requestedStaff !== boundStaff) {
        return {
          success: false,
          error: "Forbidden: Cross-staff data access denied. You may only view your own assigned records.",
          forbidden: true
        };
      }
      return getStaffCustomerData_(boundStaff, token, false, clientVersion);
    }

    // Token was supplied but is invalid, revoked, or expired
    return {
      success: false,
      error: "Unauthorized: Invalid or expired session token. Please log in again.",
      unauthorized: true
    };
  }

  // -----------------------------------------------------------------------
  // 3. Protected Admin Operations (Admin Session or Trusted Service Key)
  // -----------------------------------------------------------------------
  var adminActions = [
    "getAllCustomers",
    "saveCustomer",
    "updateCustomer",
    "toggleCustomerActive",
    "saveStaffMember",
    "deleteStaffMember",
    "toggleStaffActive",
    "resetStaffPin",
    "cleanAndSyncStaff",
    "syncStaffSheet",
    "syncStaffDropdown",
    "clearInvalidDropdowns",
    "updateAdminPassword",
    "reorderSheet"
  ];

  if (adminActions.indexOf(action) >= 0) {
    if (!isAdminAuth && !isServiceAuth) {
      return {
        success: false,
        error: "Unauthorized: Valid Admin session or trusted service credential required for action: " + action,
        unauthorized: true
      };
    }

    if (action === "getAllCustomers") {
      return getAllCustomersForAdmin_();
    } else if (action === "saveCustomer") {
      return saveCustomer_(payload.customerData);
    } else if (action === "updateCustomer") {
      return updateCustomer_(payload.customerData);
    } else if (action === "toggleCustomerActive") {
      return toggleCustomerActive_(payload.sheetName, payload.rowIndex, payload.currentStatus);
    } else if (action === "saveStaffMember") {
      return saveStaffMember_(payload.staffData || payload, payload.id);
    } else if (action === "deleteStaffMember") {
      return deleteStaffMember_(payload.id || payload.staffId);
    } else if (action === "toggleStaffActive") {
      return toggleStaffActive_(payload.staffId, payload.active);
    } else if (action === "resetStaffPin") {
      return resetStaffPin_(payload.staffId, payload.newPin);
    } else if (action === "cleanAndSyncStaff") {
      return cleanAndSyncStaff_();
    } else if (action === "syncStaffSheet") {
      syncStaffSheet_();
      return { success: true, staffList: getStaffListSanitized_(true) };
    } else if (action === "syncStaffDropdown") {
      syncStaffDropdownValidation_();
      return { success: true, staffList: getStaffListSanitized_(true) };
    } else if (action === "clearInvalidDropdowns") {
      return clearInvalidDropdowns_();
    } else if (action === "updateAdminPassword") {
      return updateAdminPassword_(payload.newPassword);
    } else if (action === "reorderSheet") {
      return reorderSheetToCustomerFirst_();
    }
  }

  return { success: false, error: "Unknown action: " + action };
}

/**
 * =========================================================================
 * TRUSTED SERVER-TO-SERVER AUTHENTICATION
 * =========================================================================
 */
function isValidServiceKeyGas_(providedKey) {
  if (!providedKey || typeof providedKey !== "string") return false;
  var props = PropertiesService.getScriptProperties();
  var configuredKey = props.getProperty("SERVICE_KEY") || 
                      props.getProperty("APPS_SCRIPT_SERVICE_KEY") || 
                      props.getProperty("CWP_SERVICE_KEY");
  if (!configuredKey || configuredKey.trim().length < 16) return false;
  return providedKey.trim() === configuredKey.trim();
}

/**
 * =========================================================================
 * SECURITY: PIN HASHING & PIN VERIFICATION (Salted SHA-256)
 * Format: sha256:16char_salt:64char_hex_hash
 * =========================================================================
 */
function hashPin_(pin, salt) {
  if (!salt) {
    salt = Utilities.getUuid().replace(/-/g, "").substring(0, 16);
  }
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + pin, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < rawBytes.length; i++) {
    var byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    hex += byteHex;
  }
  return "sha256:" + salt + ":" + hex;
}

function verifyPin_(inputPin, storedValue) {
  if (!storedValue || !inputPin) return false;
  var str = storedValue.toString().trim();
  var inputStr = inputPin.toString().trim();

  // Legacy plaintext numeric PIN (e.g. "123456")
  if (/^\d{4,8}$/.test(str)) {
    return inputStr === str;
  }

  // Salted SHA-256 hash
  if (str.indexOf("sha256:") === 0) {
    var parts = str.split(":");
    if (parts.length === 3) {
      var salt = parts[1];
      var expectedHash = parts[2];
      var computed = hashPin_(inputStr, salt);
      return computed === str;
    }
  }

  return false;
}

function isValidCredentialFormat_(val) {
  if (!val) return false;
  var s = val.toString().trim();
  if (s.toUpperCase() === "[PROTECTED]") return false;
  if (/^\d{6}$/.test(s)) return true;
  if (s.indexOf("sha256:") === 0 && s.split(":").length === 3) return true;
  if (s.indexOf("scrypt:") === 0 && s.split(":").length === 3) return true;
  return false;
}

/**
 * =========================================================================
 * SECURITY: SERVER-ISSUED SESSIONS (ADMIN & STAFF) - 12-Hour TTL
 * =========================================================================
 */
function createAdminSessionGas_() {
  var token = "adm_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").substring(0, 16);
  var props = PropertiesService.getScriptProperties();
  var sessions = {};
  try {
    var raw = props.getProperty("ADMIN_SESSIONS");
    if (raw) sessions = JSON.parse(raw);
  } catch (e) {}
  var now = Date.now();
  var clean = {};
  for (var k in sessions) {
    if (sessions[k] > now) clean[k] = sessions[k];
  }
  clean[token] = now + SESSION_TTL_MS;
  props.setProperty("ADMIN_SESSIONS", JSON.stringify(clean));
  return token;
}

function isValidAdminSessionGas_(token) {
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty("ADMIN_SESSIONS");
    if (!raw) return false;
    var sessions = JSON.parse(raw);
    if (sessions[token] && sessions[token] > Date.now()) {
      return true;
    }
  } catch (e) {}
  return false;
}

function revokeAdminSessionGas_(token) {
  if (!token) return;
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty("ADMIN_SESSIONS");
    if (!raw) return;
    var sessions = JSON.parse(raw);
    delete sessions[token];
    props.setProperty("ADMIN_SESSIONS", JSON.stringify(sessions));
  } catch (e) {}
}

function createStaffSessionGas_(staffId) {
  var token = "stf_" + Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").substring(0, 16);
  var props = PropertiesService.getScriptProperties();
  var sessions = {};
  try {
    var raw = props.getProperty("STAFF_SESSIONS");
    if (raw) sessions = JSON.parse(raw);
  } catch (e) {}
  var now = Date.now();
  var clean = {};
  for (var k in sessions) {
    if (sessions[k] && sessions[k].expiresAt > now) clean[k] = sessions[k];
  }
  clean[token] = { staffId: staffId, expiresAt: now + SESSION_TTL_MS };
  props.setProperty("STAFF_SESSIONS", JSON.stringify(clean));
  return token;
}

function getValidStaffSessionGas_(token) {
  if (!token) return null;
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty("STAFF_SESSIONS");
    if (!raw) return null;
    var sessions = JSON.parse(raw);
    if (sessions[token] && sessions[token].expiresAt > Date.now()) {
      return sessions[token];
    }
  } catch (e) {}
  return null;
}

function revokeStaffSessionGas_(token) {
  if (!token) return;
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty("STAFF_SESSIONS");
    if (!raw) return;
    var sessions = JSON.parse(raw);
    delete sessions[token];
    props.setProperty("STAFF_SESSIONS", JSON.stringify(sessions));
  } catch (e) {}
}

function revokeAllStaffSessionsForIdGas_(staffId) {
  var sId = (staffId || "").toUpperCase();
  var props = PropertiesService.getScriptProperties();
  try {
    var raw = props.getProperty("STAFF_SESSIONS");
    if (!raw) return;
    var sessions = JSON.parse(raw);
    for (var k in sessions) {
      if (sessions[k] && (sessions[k].staffId || "").toUpperCase() === sId) {
        delete sessions[k];
      }
    }
    props.setProperty("STAFF_SESSIONS", JSON.stringify(sessions));
  } catch (e) {}
}

/**
 * =========================================================================
 * HELPER: SPREADSHEET ACCESS & HEADER MAPS
 * =========================================================================
 */
function getSpreadsheet_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getHeaderIndexMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  
  for (var c = 0; c < headers.length; c++) {
    var raw = (headers[c] || "").toString().toLowerCase().trim();
    if (!raw) continue;
    var norm = raw.replace(/[^a-z0-9]/g, "");
    map[norm] = c;
    
    if (norm.indexOf("customername") >= 0 || (norm.indexOf("customer") >= 0 && norm.indexOf("number") === -1 && norm.indexOf("photo") === -1 && norm.indexOf("address") === -1)) {
      if (map["custname"] === undefined) map["custname"] = c;
    }
    if (norm.indexOf("customernumber") >= 0 || norm.indexOf("mob") >= 0 || norm.indexOf("phone") >= 0 || norm.indexOf("contact") >= 0) {
      if (map["custphone"] === undefined) map["custphone"] = c;
    }
    if (norm.indexOf("maps") >= 0 || norm.indexOf("location") >= 0) {
      if (norm.indexOf("secondary") === -1 && norm.indexOf("sec") === -1) {
        if (map["mapurl"] === undefined) map["mapurl"] = c;
      }
    }
    if (norm.indexOf("photo") >= 0) {
      if (map["photo"] === undefined) map["photo"] = c;
    }
    if (norm.indexOf("address") >= 0 && norm.indexOf("secondary") === -1 && norm.indexOf("sec") === -1) {
      if (map["address"] === undefined) map["address"] = c;
    }
    if (norm.indexOf("staffname") >= 0 || (norm.indexOf("staff") >= 0 && norm.indexOf("id") === -1 && norm.indexOf("note") === -1)) {
      if (map["staffname"] === undefined) map["staffname"] = c;
    }
    if (norm.indexOf("staffid") >= 0 || norm === "id") {
      if (map["staffid"] === undefined) map["staffid"] = c;
    }
    if ((norm.indexOf("vehicle") >= 0 || norm.indexOf("model") >= 0 || norm.indexOf("site") >= 0) && norm.indexOf("photo") === -1) {
      if (map["vehicle"] === undefined) map["vehicle"] = c;
    }
    if (norm.indexOf("packagetype") >= 0 || (norm.indexOf("package") >= 0 && norm.indexOf("purchased") === -1 && norm.indexOf("count") === -1)) {
      if (map["pkgtype"] === undefined) map["pkgtype"] = c;
    }
    if (norm.indexOf("purchased") >= 0 || norm.indexOf("pkgcount") >= 0 || norm.indexOf("packagespurchased") >= 0) {
      if (map["pkgcount"] === undefined) map["pkgcount"] = c;
    }
    if (norm.indexOf("note") >= 0 || norm.indexOf("instruction") >= 0) {
      if (map["notes"] === undefined) map["notes"] = c;
    }
    if (norm.indexOf("active") >= 0 || norm.indexOf("status") >= 0) {
      if (map["active"] === undefined) map["active"] = c;
    }
  }
  return map;
}

function getVal_(row, headerMap, aliases) {
  if (!row || !headerMap) return "";
  for (var i = 0; i < aliases.length; i++) {
    var key = aliases[i].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (headerMap[key] !== undefined) {
      var colIdx = headerMap[key];
      if (row[colIdx] !== undefined && row[colIdx] !== null) {
        return row[colIdx];
      }
    }
  }
  return "";
}

function isActiveStatus_(val) {
  if (val === undefined || val === null || val === "") return true;
  var s = val.toString().trim().toLowerCase();
  return s === "yes" || s === "active" || s === "true" || s === "y" || s === "1";
}

/**
 * =========================================================================
 * CATEGORY CLASSIFICATION (EXPLICIT SERVICE TYPE MAPPING - EXACTLY 3)
 * Categories:
 * 1. Daily Car Cleaning
 * 2. Car Washing
 * 3. Solar Panel Cleaning
 * =========================================================================
 */
function classifyServiceCategory_(sheetName, serviceType, packageType, packageDetails, vehicleOrSite) {
  var sName = (sheetName || "").toString().toLowerCase().trim();
  var sType = (serviceType || "").toString().toLowerCase().trim();
  var pType = (packageType || "").toString().toLowerCase().trim();
  var pDetails = (packageDetails || "").toString().toLowerCase().trim();
  var vSite = (vehicleOrSite || "").toString().toLowerCase().trim();

  // 1. Dedicated sheet tab checks
  if (sName === "daily clean" || sName === "daily car cleaning" || sName === "daily") {
    return "Daily Car Cleaning";
  }
  if (sName === "solar panel cleaning" || sName === "solar cleaning" || sName === "solar") {
    return "Solar Panel Cleaning";
  }
  if (sName === "car washing" || sName === "car wash") {
    return "Car Washing";
  }

  var serviceScope = (sType + " " + pType + " " + pDetails).trim();

  // 2. Explicit Solar Panel Cleaning indicators
  // NEVER classify solar solely based on generic words like "site"!
  var hasSolarKeyword = 
    serviceScope.indexOf("solar") >= 0 || 
    serviceScope.indexOf("pv panel") >= 0 || 
    serviceScope.indexOf("rooftop solar") >= 0 ||
    vSite.indexOf("solar") >= 0;

  if (hasSolarKeyword) {
    return "Solar Panel Cleaning";
  }

  // 3. Explicit Daily Car Cleaning indicators
  var hasDailyKeyword = 
    serviceScope.indexOf("daily clean") >= 0 || 
    serviceScope.indexOf("daily car cleaning") >= 0 || 
    serviceScope.indexOf("daily") >= 0 || 
    serviceScope.indexOf("dcc") >= 0;

  if (hasDailyKeyword) {
    return "Daily Car Cleaning";
  }

  // 4. Explicit Car Washing indicators
  var hasWashKeyword = 
    serviceScope.indexOf("wash") >= 0 || 
    serviceScope.indexOf("detailing") >= 0 || 
    serviceScope.indexOf("foam") >= 0 || 
    serviceScope.indexOf("rubbing") >= 0 || 
    serviceScope.indexOf("polish") >= 0 || 
    serviceScope.indexOf("ceramic") >= 0 || 
    serviceScope.indexOf("teflon") >= 0 || 
    serviceScope.indexOf("interior") >= 0;

  if (hasWashKeyword) {
    return "Car Washing";
  }

  // 5. Handling unknown / ambiguous values safely:
  // In All Other Work, default is Car Washing - NEVER Daily Car Cleaning!
  return "Car Washing";
}

/**
 * =========================================================================
 * STAFF MANAGEMENT (CENTRAL CREDENTIAL REPOSITORY IN SCRIPT PROPERTIES)
 * =========================================================================
 */
function getStaffList_() {
  var props = PropertiesService.getScriptProperties();
  var staffJson = props.getProperty("STAFF_LIST");
  var list = [];
  
  if (staffJson !== null && staffJson !== undefined) {
    try {
      list = JSON.parse(staffJson);
    } catch (e) {
      list = [];
    }
    return deduplicateStaffList_(list);
  }
  
  return cleanAndSyncStaff_();
}

function getStaffListSanitized_(isAdmin) {
  var list = getStaffList_();
  return list.map(function(s) {
    if (isAdmin) {
      return {
        id: s.id,
        name: s.name,
        phone: s.phone || "",
        active: s.active !== undefined ? s.active : true,
        hasPin: !!(s.pin && isValidCredentialFormat_(s.pin))
      };
    }
    // Public staff list: Absolutely NO PIN or phone number exposed!
    return {
      id: s.id,
      name: s.name,
      active: s.active !== undefined ? s.active : true
    };
  });
}

function deduplicateStaffList_(list) {
  if (!list || !Array.isArray(list)) return [];
  var seenIds = {};
  var clean = [];
  
  list.forEach(function(item) {
    if (!item || !item.name) return;
    var normId = (item.id || "").toString().trim().toUpperCase();
    if (seenIds[normId]) return;
    seenIds[normId] = true;

    var rawPin = item.pin ? item.pin.toString().trim() : "";
    if (rawPin && /^\d{6}$/.test(rawPin)) {
      rawPin = hashPin_(rawPin);
    } else if (rawPin.toUpperCase() === "[PROTECTED]") {
      rawPin = "";
    }

    clean.push({
      id: normId || ("STF0" + (clean.length + 1)),
      name: item.name.toString().trim(),
      phone: (item.phone || "").toString().trim(),
      pin: rawPin,
      active: item.active !== undefined ? (item.active === true || item.active === "Yes" || item.active === "yes" || item.active === "Active") : true
    });
  });
  
  return clean;
}

function cleanAndSyncStaff_() {
  var ss = getSpreadsheet_();
  var sheets = ["Daily Clean", "All Other Work"];
  
  var existingList = [];
  try {
    var props = PropertiesService.getScriptProperties();
    var staffJson = props.getProperty("STAFF_LIST");
    if (staffJson) existingList = JSON.parse(staffJson);
  } catch (e) {}

  var idToStaff = {};
  var nameToStaff = {};
  var staffList = [];
  var idCounter = 1;

  if (Array.isArray(existingList)) {
    existingList.forEach(function(s) {
      if (!s || !s.name) return;
      var strName = s.name.toString().trim();
      if (/^\d+$/.test(strName) || strName.length < 2 || strName.startsWith("http")) return;
      var normName = strName.toLowerCase();
      var sId = (s.id || "").toString().trim().toUpperCase();

      var rawPin = s.pin ? s.pin.toString().trim() : "";
      if (rawPin && /^\d{6}$/.test(rawPin)) {
        rawPin = hashPin_(rawPin);
      } else if (rawPin.toUpperCase() === "[PROTECTED]") {
        rawPin = "";
      }
      s.pin = rawPin;

      if (!idToStaff[sId]) {
        idToStaff[sId] = s;
        nameToStaff[normName] = s;
        staffList.push(s);
        var match = sId.match(/^STF0*(\d+)$/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num >= idCounter) idCounter = num + 1;
        }
      }
    });
  }

  // Scan customer sheets for assigned staff names
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    
    var hMap = getHeaderIndexMap_(sheet);
    for (var r = 1; r < data.length; r++) {
      var sName = getVal_(data[r], hMap, ["staffname", "staff"]).toString().trim();
      if (!sName || /^\d+$/.test(sName) || sName.length < 2 || sName.startsWith("http")) continue;
      
      var normName = sName.toLowerCase();
      if (!nameToStaff[normName]) {
        var cleanId = "STF" + (idCounter < 10 ? "0" + idCounter : idCounter);
        idCounter++;
        // Notice: Do NOT assign a default PIN (123456)! Leave PIN unconfigured until admin sets it.
        var newStaffObj = { id: cleanId, name: sName, phone: "", pin: "", active: true };
        nameToStaff[normName] = newStaffObj;
        idToStaff[cleanId] = newStaffObj;
        staffList.push(newStaffObj);
      }
    }
  });

  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(staffList));
  syncStaffDropdownValidation_();
  syncStaffSheet_(staffList);
  
  return getStaffListSanitized_(true);
}

function saveStaffMember_(staffData, legacyId) {
  var name = "", id = "", phone = "", pin = "", active = true;
  
  if (typeof staffData === "object" && staffData !== null) {
    name = (staffData.name || "").toString().trim();
    id = (staffData.id || "").toString().trim().toUpperCase();
    phone = (staffData.phone || "").toString().trim();
    pin = (staffData.pin || "").toString().trim();
    if (staffData.active !== undefined) {
      active = (staffData.active === true || staffData.active === "Yes" || staffData.active === "yes" || staffData.active === "Active");
    }
  } else {
    name = (staffData || "").toString().trim();
    id = (legacyId || "").toString().trim().toUpperCase();
  }
  
  if (!name) {
    throw new Error("Staff name is required.");
  }
  
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList_();
  
  var existingIndex = list.findIndex(function(item) {
    return (item.id && item.id.toUpperCase() === id) || 
           (item.name && item.name.toLowerCase() === name.toLowerCase());
  });

  // P1 Fix: Default PIN '123456' removed.
  // New staff creation strictly requires a 6-digit numeric PIN.
  // Blank PIN on edit preserves existing credential.
  var pinToStore = "";
  if (pin) {
    if (pin.toUpperCase() === "[PROTECTED]") {
      if (existingIndex >= 0) pinToStore = list[existingIndex].pin || "";
      else pinToStore = "";
    } else if (pin.indexOf("sha256:") === 0 || pin.indexOf("scrypt:") === 0) {
      pinToStore = pin;
    } else if (/^\d{6}$/.test(pin)) {
      pinToStore = hashPin_(pin);
    } else {
      throw new Error("Staff PIN must be exactly 6 numeric digits.");
    }
  } else if (existingIndex >= 0 && list[existingIndex].pin) {
    pinToStore = list[existingIndex].pin;
  } else {
    // New staff member with no PIN: Require explicit PIN
    throw new Error("A valid 6-digit PIN is required to create a new staff member.");
  }

  if (!id) {
    var maxNum = 0;
    list.forEach(function(item) {
      var match = (item.id || "").match(/^STF0*(\d+)$/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    var nextNum = maxNum + 1;
    id = "STF" + (nextNum < 10 ? "0" + nextNum : nextNum);
  }
  
  var updatedStaff = {
    id: id,
    name: name,
    phone: phone,
    pin: pinToStore,
    active: active
  };
  
  if (existingIndex >= 0) {
    if (!phone && list[existingIndex].phone) updatedStaff.phone = list[existingIndex].phone;
    list[existingIndex] = updatedStaff;
  } else {
    list.push(updatedStaff);
  }
  
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  syncStaffDropdownValidation_();
  syncStaffSheet_(list);
  
  return { 
    success: true, 
    staffList: getStaffListSanitized_(true), 
    staff: { id: updatedStaff.id, name: updatedStaff.name, phone: updatedStaff.phone, active: updatedStaff.active, hasPin: !!updatedStaff.pin } 
  };
}

function resetStaffPin_(staffId, newPin) {
  var sId = (staffId || "").toString().trim().toUpperCase();
  var pinStr = (newPin || "").toString().trim();
  if (!sId) throw new Error("Staff ID is required.");
  if (!/^\d{6}$/.test(pinStr)) throw new Error("Staff PIN must be exactly 6 numeric digits.");

  var list = getStaffList_();
  var staff = list.find(function(item) { return (item.id || "").toUpperCase() === sId; });
  if (!staff) throw new Error("Staff member not found: " + sId);

  staff.pin = hashPin_(pinStr);
  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
  revokeAllStaffSessionsForIdGas_(staff.id);
  syncStaffSheet_(list);

  return { success: true, message: "स्टाफ सदस्य का पिन सफलतापूर्वक रीसेट कर दिया गया।" };
}

function toggleStaffActive_(id, newStatus) {
  id = (id || "").toString().trim().toLowerCase();
  var list = getStaffList_();
  var found = false;
  
  list.forEach(function(item) {
    if ((item.id || "").toLowerCase() === id) {
      item.active = !!newStatus;
      found = true;
      if (!item.active) {
        revokeAllStaffSessionsForIdGas_(item.id);
      }
    }
  });
  
  if (found) {
    PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
    syncStaffDropdownValidation_();
    syncStaffSheet_(list);
  }
  
  return { success: found, staffList: getStaffListSanitized_(true) };
}

function verifyStaffPin_(identifier, pin) {
  var list = getStaffList_();
  var rawIdent = (identifier || "").toString().trim();
  var rawPhone = rawIdent.replace(/[^0-9]/g, "");
  var cleanPhone = rawPhone.length === 10 ? rawPhone : (rawPhone.length > 10 ? rawPhone.slice(-10) : "");
  var sId = rawIdent.toLowerCase();
  
  var staff = list.find(function(item) {
    if (cleanPhone) {
      var p = (item.phone || "").toString().replace(/[^0-9]/g, "").slice(-10);
      if (p === cleanPhone) return true;
    }
    return (item.id || "").toLowerCase() === sId || (item.name || "").toLowerCase() === sId;
  });
  
  if (!staff) {
    return { success: false, error: "यह मोबाइल नंबर या स्टाफ आईडी पंजीकृत नहीं मिला।" };
  }
  
  var isActive = staff.active !== undefined ? (staff.active === true || staff.active === "Yes" || staff.active === "yes" || staff.active === "Active") : true;
  if (!isActive) {
    return {
      success: false,
      inactive: true,
      error: "आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।"
    };
  }
  
  if (!staff.pin || !isValidCredentialFormat_(staff.pin)) {
    return {
      success: false,
      error: "इस स्टाफ अकाउंट के लिए पिन सेट नहीं है। कृपया एडमिन से नया पिन सेट कराएं।"
    };
  }

  var input = (pin || "").toString().trim();
  var isMatch = verifyPin_(input, staff.pin);
  
  if (isMatch) {
    // Migration: Upgrade legacy plaintext PIN to salted SHA-256 hash now
    if (/^\d{4,8}$/.test((staff.pin || "").toString().trim())) {
      staff.pin = hashPin_(input);
      PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
      syncStaffSheet_(list);
    }
    var token = createStaffSessionGas_(staff.id);
    return {
      success: true,
      token: token,
      staffId: staff.id,
      staffName: staff.name,
      phone: staff.phone || "",
      active: true
    };
  } else {
    return {
      success: false,
      error: "गलत 6-डिजिट पासवर्ड! कृपया सही पिन दर्ज करें।"
    };
  }
}

function deleteStaffMember_(id) {
  id = (id || "").toString().trim().toLowerCase();
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList_();
  
  revokeAllStaffSessionsForIdGas_(id);
  list = list.filter(function(item) {
    return item.id.toLowerCase() !== id;
  });
  
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  syncStaffDropdownValidation_();
  syncStaffSheet_(list);
  return { success: true, staffList: getStaffListSanitized_(true) };
}

/**
 * =========================================================================
 * GOOGLE SHEETS DATA VALIDATION & SHEET SYNC
 * =========================================================================
 */
var CWP_PACKAGE_TYPES = [
  "DCC ONLY",
  "DCC SILVER",
  "DCC GOLD",
  "CAR WASH SUBSCRIPTION",
  "CAR WASH SINGLE",
  "SOLAR SINGLE",
  "SOLAR SUBSCRIPTION",
  "OTHER"
];

function clearInvalidDropdowns_() {
  try {
    var ss = getSpreadsheet_();
    var sheets = ["Daily Clean", "All Other Work"];
    
    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var lastCol = sheet.getLastColumn();
      if (lastCol < 1) return;
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      
      for (var c = 0; c < headers.length; c++) {
        var hText = (headers[c] || "").toString().toLowerCase().trim().replace(/[^a-z0-9]/g, "");
        var isStaff = hText.indexOf("staffname") >= 0 || (hText.indexOf("staff") >= 0 && hText.indexOf("notes") === -1 && hText.indexOf("id") === -1);
        var isPkgType = hText.indexOf("packagetype") >= 0 || hText.indexOf("servicetype") >= 0;
        
        if (!isStaff && !isPkgType) {
          try {
            sheet.getRange(2, c + 1, maxRows - 1, 1).clearDataValidations();
          } catch (e) {}
        }
      }
    });
    
    syncStaffDropdownValidation_();
    return { success: true, message: "गैर-स्टाफ कॉलम्स से अवैध ड्रॉपडाउन हटा दिया गया है।" };
  } catch (err) {
    return { error: err.toString() };
  }
}

function syncStaffDropdownValidation_() {
  try {
    var ss = getSpreadsheet_();
    var staffList = getStaffList_();
    if (!staffList || staffList.length === 0) return;
    
    var sheets = ["Daily Clean", "All Other Work"];
    
    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var lastCol = sheet.getLastColumn();
      if (lastCol < 1) return;
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      
      for (var c = 0; c < headers.length; c++) {
        var hText = (headers[c] || "").toString().toLowerCase().trim().replace(/[^a-z0-9]/g, "");
        var isStaff = hText.indexOf("staffname") >= 0 || (hText.indexOf("staff") >= 0 && hText.indexOf("notes") === -1 && hText.indexOf("id") === -1);
        var isPkgType = hText.indexOf("packagetype") >= 0 || hText.indexOf("servicetype") >= 0;
        
        if (!isStaff && !isPkgType) {
          try {
            sheet.getRange(2, c + 1, maxRows - 1, 1).clearDataValidations();
          } catch (e) {}
        }
      }
    });

    var staffNames = staffList.map(function(s) { return s.name; });
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(staffNames, true)
      .setAllowInvalid(false)
      .setHelpText("कृपया बैकएंड में पंजीकृत स्टाफ में से ही नाम चुनें।")
      .build();
      
    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var hMap = getHeaderIndexMap_(sheet);
      var staffColIdx = hMap["staffname"] !== undefined ? hMap["staffname"] : (hMap["staff"] !== undefined ? hMap["staff"] : -1);
      if (staffColIdx >= 0) {
        var maxRows = Math.max(sheet.getMaxRows(), 100);
        var range = sheet.getRange(2, staffColIdx + 1, maxRows - 1, 1);
        range.setDataValidation(rule);
      }
    });

    var dailySheet = ss.getSheetByName("Daily Clean");
    if (dailySheet) {
      var dMap = getHeaderIndexMap_(dailySheet);
      var pkgColIdx = dMap["packagetype"] !== undefined ? dMap["packagetype"] : (dMap["pkgtype"] !== undefined ? dMap["pkgtype"] : -1);
      if (pkgColIdx >= 0) {
        var pkgRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(CWP_PACKAGE_TYPES, true)
          .setAllowInvalid(true)
          .setHelpText("पैकेज प्रकार चुनें")
          .build();
        var maxR = Math.max(dailySheet.getMaxRows(), 100);
        dailySheet.getRange(2, pkgColIdx + 1, maxR - 1, 1).setDataValidation(pkgRule);
      }
    }
  } catch (err) {
    Logger.log("Validation sync notice: " + err.toString());
  }
}

/**
 * Sync Dedicated Staff sheet tab (NEVER writes plaintext PIN or raw hash)
 */
function syncStaffSheet_(list) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName("Staff");
    if (!sheet) {
      sheet = ss.insertSheet("Staff");
    }
    if (!list || !Array.isArray(list)) list = getStaffList_();
    
    sheet.clear();
    var headers = ["Staff ID", "Staff Name", "Mobile Number", "PIN", "Status"];
    sheet.appendRow(headers);
    var hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setFontWeight("bold");
    hRange.setBackground("#002B49");
    hRange.setFontColor("#FFFFFF");
    
    list.forEach(function(s) {
      var status = (s.active === true || s.active === "Yes" || s.active === "Active" || s.active === undefined) ? "Active" : "Inactive";
      sheet.appendRow([
        s.id || "",
        s.name || "",
        s.phone ? "'" + s.phone : "",
        "[PROTECTED]", // Plaintext PINs are NEVER written to Google Sheets
        status
      ]);
    });
  } catch (err) {
    Logger.log("syncStaffSheet notice: " + err.toString());
  }
}

/**
 * =========================================================================
 * STAFF READ-ONLY CUSTOMER DATA VIEWER (MANDATORY AUTHENTICATION)
 * Strict Data Isolation:
 * - Requires verified Session Token or Trusted Service Credential
 * - Discards browser-supplied staff ID; uses session-bound identity
 * - Daily Clean source row order is strictly preserved
 * =========================================================================
 */
function getStaffCustomerData_(requestedStaffId, authToken, isServiceCall, clientVersion) {
  if (!requestedStaffId) {
    return { 
      error: "No Staff identifier provided.", 
      staffId: "", 
      staffName: "", 
      dailyCarCleaning: [], 
      carWashing: [], 
      solarCleaning: [], 
      dailyClean: [], 
      allOtherWork: [] 
    };
  }
  
  var targetQuery = requestedStaffId.toString().trim().toLowerCase();
  var ss = getSpreadsheet_();
  
  var staffList = getStaffList_();
  var foundStaff = staffList.find(function(s) {
    return s.id.toLowerCase() === targetQuery || s.name.toLowerCase() === targetQuery;
  });
  
  if (foundStaff) {
    var isActive = foundStaff.active !== undefined ? (foundStaff.active === true || foundStaff.active === "Yes" || foundStaff.active === "yes" || foundStaff.active === "Active") : true;
    if (!isActive) {
      return {
        error: "आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।",
        inactive: true,
        staffId: foundStaff.id,
        staffName: foundStaff.name,
        dailyCarCleaning: [],
        carWashing: [],
        solarCleaning: [],
        dailyClean: [],
        allOtherWork: []
      };
    }
  }
  
  var staffName = foundStaff ? foundStaff.name : requestedStaffId;
  var staffId = foundStaff ? foundStaff.id : requestedStaffId;
  
  var dailyCarCleaningList = [];
  var carWashingList = [];
  var solarCleaningList = [];
  
  // 1. Process "Daily Clean" tab (Source row sequence strictly preserved)
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dailyData = dailySheet.getDataRange().getValues();
    if (dailyData.length > 1) {
      var dMap = getHeaderIndexMap_(dailySheet);
      for (var i = 1; i < dailyData.length; i++) {
        var row = dailyData[i];
        var rowStaffName = getVal_(row, dMap, ["staffname", "staff"]).toString().trim().toLowerCase();
        var rowStaffId = getVal_(row, dMap, ["staffid", "id"]).toString().trim().toLowerCase();
        var rowActive = getVal_(row, dMap, ["active", "status"]);
        
        var isMatch = false;
        if (foundStaff) {
          isMatch = (rowStaffName === foundStaff.name.toLowerCase()) || (rowStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatch = (rowStaffName === targetQuery) || (rowStaffId === targetQuery);
        }
        
        if (isMatch && isActiveStatus_(rowActive)) {
          dailyCarCleaningList.push({
            staffId: staffId,
            staffName: getVal_(row, dMap, ["staffname", "staff"]) || staffName,
            customerName: getVal_(row, dMap, ["customername", "custname"]),
            customerNumber: (getVal_(row, dMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal_(row, dMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal_(row, dMap, ["customervehiclephotourl", "photourl", "photo"]),
            address: getVal_(row, dMap, ["address"]),
            vehicleNumbers: getVal_(row, dMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
            vehicle: getVal_(row, dMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
            packageType: getVal_(row, dMap, ["packagetype", "pkgtype"]),
            packagesPurchased: getVal_(row, dMap, ["packagespurchased", "pkgcount"]) || "1",
            serviceCategory: "Daily Car Cleaning",
            category: "daily_car_cleaning",
            staffNotes: getVal_(row, dMap, ["staffnotescleaninginstructions", "staffnotes", "notes"]),
            secondaryAddress: getVal_(row, dMap, ["secondaryaddressifany", "secondaryaddress"]),
            secondaryMapsUrl: getVal_(row, dMap, ["secondarymapsurl"]),
            active: getVal_(row, dMap, ["active", "status"]) || "Yes"
          });
        }
      }
    }
  }
  
  // 2. Process "All Other Work" tab
  var otherSheet = ss.getSheetByName("All Other Work");
  if (otherSheet) {
    var otherData = otherSheet.getDataRange().getValues();
    if (otherData.length > 1) {
      var oMap = getHeaderIndexMap_(otherSheet);
      for (var j = 1; j < otherData.length; j++) {
        var oRow = otherData[j];
        var oStaffName = getVal_(oRow, oMap, ["staffname", "staff"]).toString().trim().toLowerCase();
        var oStaffId = getVal_(oRow, oMap, ["staffid", "id"]).toString().trim().toLowerCase();
        var oActive = getVal_(oRow, oMap, ["active", "status"]);
        
        var isMatchOther = false;
        if (foundStaff) {
          isMatchOther = (oStaffName === foundStaff.name.toLowerCase()) || (oStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatchOther = (oStaffName === targetQuery) || (oStaffId === targetQuery);
        }
        
        if (isMatchOther && isActiveStatus_(oActive)) {
          var sType = getVal_(oRow, oMap, ["servicetypecarwashsolarcleaning", "servicetype"]);
          var pType = getVal_(oRow, oMap, ["packagetype", "pkgtype"]);
          var pDetails = getVal_(oRow, oMap, ["packageservicedetails", "packagedetails"]);
          var vSite = getVal_(oRow, oMap, ["vehiclenumbersitename", "vehicleorsite", "vehicle"]);
          var classifiedCat = classifyServiceCategory_("All Other Work", sType, pType, pDetails, vSite);

          var item = {
            staffId: staffId,
            staffName: getVal_(oRow, oMap, ["staffname", "staff"]) || staffName,
            customerName: getVal_(oRow, oMap, ["customername", "custname"]),
            customerNumber: (getVal_(oRow, oMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal_(oRow, oMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal_(oRow, oMap, ["vehiclesitephotourl", "photourl", "photo"]),
            address: getVal_(oRow, oMap, ["address"]),
            serviceType: sType || pType || classifiedCat,
            vehicleNumbers: vSite,
            vehicleOrSite: vSite,
            vehicle: vSite,
            packageDetails: pDetails || pType || classifiedCat,
            packageType: pType || pDetails || classifiedCat,
            packagesPurchased: "1",
            serviceCategory: classifiedCat,
            category: classifiedCat === "Solar Panel Cleaning" ? "solar_cleaning" : (classifiedCat === "Daily Car Cleaning" ? "daily_car_cleaning" : "car_washing"),
            staffNotes: getVal_(oRow, oMap, ["staffnotesspecialinstructions", "staffnotes", "notes"]),
            secondaryAddress: getVal_(oRow, oMap, ["secondaryaddressifany", "secondaryaddress"]),
            secondaryMapsUrl: getVal_(oRow, oMap, ["secondarymapsurl"]),
            active: getVal_(oRow, oMap, ["active", "status"]) || "Yes"
          };

          if (classifiedCat === "Solar Panel Cleaning") {
            solarCleaningList.push(item);
          } else if (classifiedCat === "Daily Car Cleaning") {
            dailyCarCleaningList.push(item);
          } else {
            carWashingList.push(item);
          }
        }
      }
    }
  }
  
  var result = {
    staffId: staffId,
    staffName: staffName,
    dailyCarCleaning: dailyCarCleaningList,
    carWashing: carWashingList,
    solarCleaning: solarCleaningList,
    dailyClean: dailyCarCleaningList,
    allOtherWork: carWashingList.concat(solarCleaningList),
    totalCount: dailyCarCleaningList.length + carWashingList.length + solarCleaningList.length,
    dataSource: "apps_script",
    isLive: true,
    lastSync: new Date().toISOString()
  };

  var currentVersion = computeStaffDataVersion_(result);
  result.version = currentVersion;

  if (clientVersion && clientVersion === currentVersion) {
    return {
      unchanged: true,
      version: currentVersion,
      staffId: staffId,
      staffName: staffName,
      totalCount: result.totalCount,
      dataSource: "apps_script",
      isLive: true,
      lastSync: result.lastSync
    };
  }

  result.unchanged = false;
  return result;
}

/**
 * Deterministic version / content hash for Google Apps Script staff records.
 */
function computeStaffDataVersion_(staffData) {
  if (!staffData) return "v0_empty";
  var str = (staffData.staffId || "").toString().trim().toUpperCase() + "|" + (staffData.staffName || "").toString().trim() + ";;";
  var allRecords = (staffData.dailyCarCleaning || []).concat(staffData.carWashing || []).concat(staffData.solarCleaning || []);
  str += "count:" + allRecords.length + ";;";

  for (var i = 0; i < allRecords.length; i++) {
    var r = allRecords[i];
    var sig = [
      i,
      r.customerName || "",
      r.customerNumber || "",
      r.vehicle || r.vehicleNumbers || r.vehicleOrSite || "",
      r.serviceCategory || r.category || "",
      r.packageType || "",
      r.serviceType || "",
      r.address || "",
      r.secondaryAddress || "",
      r.googleMapsUrl || "",
      r.secondaryMapsUrl || "",
      r.photoUrl || "",
      r.staffNotes || r.notes || "",
      r.active !== undefined ? String(r.active) : "Yes",
      r.staffName || "",
      r.staffId || ""
    ].join("::");
    str += sig + ";;";
  }

  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  var hex = "";
  for (var j = 0; j < rawHash.length; j++) {
    var b = rawHash[j];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length === 1) h = "0" + h;
    hex += h;
  }
  return hex.substring(0, 16);
}

/**
 * =========================================================================
 * ADMIN: SAVE CUSTOMER (CUSTOMER-FIRST COLUMN ORDER)
 * =========================================================================
 */
function saveCustomer_(customerData) {
  if (!customerData) {
    throw new Error("No customer data provided.");
  }
  
  var ss = getSpreadsheet_();
  var cat = (customerData.serviceCategory || customerData.category || customerData.sheetName || "").toString().trim();
  var isDCC = (cat === "Daily Car Cleaning" || cat === "Daily Clean" || cat === "daily" || cat === "daily_car_cleaning");
  var isCarWash = (cat === "Car Washing" || cat === "car_washing" || cat === "Car Wash");
  var isSolar = (cat === "Solar Panel Cleaning" || cat === "solar_cleaning" || cat === "Solar Cleaning");
  var sheetName = isDCC ? "Daily Clean" : "All Other Work";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error("Sheet '" + sheetName + "' was not found in the spreadsheet.");
  }
  
  var photoUrl = (customerData.photoUrl || "").trim();
  var headerMap = getHeaderIndexMap_(sheet);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) lastCol = (sheetName === "Daily Clean" ? 13 : 11);
  var newRow = new Array(lastCol).fill("");
  
  function setCol(aliases, val) {
    for (var i = 0; i < aliases.length; i++) {
      var key = aliases[i].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (headerMap[key] !== undefined) {
        newRow[headerMap[key]] = val;
        return;
      }
    }
  }
  
  var rawNum = (customerData.customerNumber || "").toString().trim();
  var custNum = rawNum.replace(/^'+/, "");
  
  if (sheetName === "Daily Clean") {
    setCol(["customername", "custname"], customerData.customerName || "");
    setCol(["customernumber", "custphone", "number", "phone", "mob"], custNum);
    setCol(["googlemapsurl", "mapurl", "maps", "location"], customerData.googleMapsUrl || "");
    setCol(["customervehiclephotourl", "photourl", "photo"], photoUrl);
    setCol(["address"], customerData.address || "");
    setCol(["vehiclenumbersmodels", "vehiclenumbers", "vehicle"], customerData.vehicleNumbers || customerData.vehicle || "");
    setCol(["packagetype", "pkgtype"], customerData.packageType || "DCC ONLY");
    setCol(["packagespurchased", "pkgcount"], customerData.packagesPurchased || "1");
    setCol(["staffname", "staff"], customerData.staffName || "");
    setCol(["staffnotescleaninginstructions", "staffnotes", "notes"], customerData.staffNotes || "");
    setCol(["secondaryaddressifany", "secondaryaddress"], customerData.secondaryAddress || "");
    setCol(["secondarymapsurl"], customerData.secondaryMapsUrl || "");
    setCol(["active", "status"], customerData.active || "Yes");
    setCol(["staffid", "id"], customerData.staffId || "");
  } else {
    var sType = isSolar ? "Solar Panel Cleaning" : (isCarWash ? "Car Washing" : (customerData.serviceType || "Car Washing"));
    setCol(["customername", "custname"], customerData.customerName || "");
    setCol(["customernumber", "custphone", "number", "phone", "mob"], custNum);
    setCol(["googlemapsurl", "mapurl", "maps", "location"], customerData.googleMapsUrl || "");
    setCol(["vehiclesitephotourl", "photourl", "photo"], photoUrl);
    setCol(["address"], customerData.address || "");
    setCol(["servicetypecarwashsolarcleaning", "servicetype"], sType);
    setCol(["vehiclenumbersitename", "vehicleorsite", "vehicle"], customerData.vehicleOrSite || customerData.vehicleNumbers || customerData.vehicle || "");
    setCol(["packageservicedetails", "packagedetails"], customerData.packageDetails || customerData.packageType || sType);
    setCol(["staffname", "staff"], customerData.staffName || "");
    setCol(["staffnotesspecialinstructions", "staffnotes", "notes"], customerData.staffNotes || "");
    setCol(["secondaryaddressifany", "secondaryaddress"], customerData.secondaryAddress || "");
    setCol(["secondarymapsurl"], customerData.secondaryMapsUrl || "");
    setCol(["active", "status"], customerData.active || "Yes");
    setCol(["staffid", "id"], customerData.staffId || "");
  }
  
  sheet.appendRow(newRow);
  
  return {
    success: true,
    message: "Customer saved successfully to " + sheetName + "!",
    photoUrl: photoUrl
  };
}

/**
 * =========================================================================
 * ADMIN: GET ALL CUSTOMERS & TOGGLE STATUS
 * =========================================================================
 */
function getAllCustomersForAdmin_() {
  var ss = getSpreadsheet_();
  var records = [];
  var sheets = ["Daily Clean", "All Other Work"];
  
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    
    var hMap = getHeaderIndexMap_(sheet);
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var sType = getVal_(row, hMap, ["servicetypecarwashsolarcleaning", "servicetype"]);
      var pType = getVal_(row, hMap, ["packagetype", "pkgtype", "servicetypecarwashsolarcleaning", "servicetype"]) || "DCC ONLY";
      var pDetails = getVal_(row, hMap, ["packageservicedetails", "packagedetails"]);
      var veh = getVal_(row, hMap, ["vehiclenumbersmodels", "vehiclenumbersitename", "vehiclenumbers", "vehicle", "models", "site"]);
      var serviceCategory = classifyServiceCategory_(sheetName, sType, pType, pDetails, veh);

      records.push({
        sheetName: sheetName,
        serviceCategory: serviceCategory,
        rowIndex: i + 1,
        staffId: getVal_(row, hMap, ["staffid", "id"]) || "",
        staffName: getVal_(row, hMap, ["staffname", "staff"]),
        customerName: getVal_(row, hMap, ["customername", "custname"]),
        customerNumber: (getVal_(row, hMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
        googleMapsUrl: getVal_(row, hMap, ["googlemapsurl", "mapurl", "maps", "location"]),
        photoUrl: getVal_(row, hMap, ["customervehiclephotourl", "vehiclesitephotourl", "photourl", "photo"]),
        address: getVal_(row, hMap, ["address"]),
        vehicle: veh,
        vehicleNumbers: veh,
        packageType: pType,
        serviceType: sType,
        packageDetails: pDetails,
        packagesPurchased: (getVal_(row, hMap, ["packagespurchased", "pkgcount"]) || "1").toString(),
        secondaryAddress: getVal_(row, hMap, ["secondaryaddressifany", "secondaryaddress"]) || "",
        secondaryMapsUrl: getVal_(row, hMap, ["secondarymapsurl"]) || "",
        notes: getVal_(row, hMap, ["staffnotes", "notes"]),
        active: (getVal_(row, hMap, ["active", "status"]) || "Yes").toString()
      });
    }
  });
  
  return records;
}

function toggleCustomerActive_(sheetName, rowIndex, currentStatus) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found");
  
  var hMap = getHeaderIndexMap_(sheet);
  var activeColIdx = hMap["active"] !== undefined ? hMap["active"] : (hMap["status"] !== undefined ? hMap["status"] : -1);
  var col1Based = activeColIdx >= 0 ? activeColIdx + 1 : (sheetName === "Daily Clean" ? 13 : 11);
  var newStatus = (currentStatus || "").toString().toLowerCase() === "yes" ? "No" : "Yes";
  sheet.getRange(rowIndex, col1Based).setValue(newStatus);
  return { success: true, newStatus: newStatus };
}

/**
 * Updates an existing customer row in Google Sheets.
 * Guards against duplicate/orphaned rows and cross-sheet corruption.
 */
function updateCustomer_(customerData) {
  if (!customerData || !customerData.sheetName || !customerData.rowIndex) {
    throw new Error("Missing sheetName or rowIndex for update.");
  }
  
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(customerData.sheetName);
  if (!sheet) throw new Error("Sheet '" + customerData.sheetName + "' not found.");
  
  var r = parseInt(customerData.rowIndex, 10);
  if (isNaN(r) || r < 2 || r > sheet.getLastRow()) {
    throw new Error("Invalid row index: " + customerData.rowIndex);
  }

  // Cross-sheet move protection
  if (customerData.sheetName === "Daily Clean") {
    var cat = (customerData.serviceCategory || "").toString().trim();
    if (cat && cat !== "Daily Car Cleaning") {
      throw new Error("Cannot move record from Daily Clean to All Other Work during edit. Cross-sheet moves require explicit migration.");
    }
  } else if (customerData.sheetName === "All Other Work") {
    var catOther = (customerData.serviceCategory || "").toString().trim();
    if (catOther === "Daily Car Cleaning") {
      throw new Error("Cannot move record from All Other Work to Daily Clean during edit. Cross-sheet moves require explicit migration.");
    }
  }
  
  var hMap = getHeaderIndexMap_(sheet);
  
  function updateCell(aliases, val) {
    if (val === undefined || val === null) return;
    for (var i = 0; i < aliases.length; i++) {
      var key = aliases[i].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (hMap[key] !== undefined) {
        sheet.getRange(r, hMap[key] + 1).setValue(val);
        return;
      }
    }
  }
  
  var rawNum = (customerData.customerNumber || "").toString().trim();
  var custNum = rawNum.replace(/^'+/, "");
  
  updateCell(["customername", "custname"], customerData.customerName);
  updateCell(["customernumber", "custphone", "number", "phone", "mob"], custNum);
  updateCell(["googlemapsurl", "mapurl", "maps", "location"], customerData.googleMapsUrl);
  if (customerData.photoUrl) {
    updateCell(["customervehiclephotourl", "vehiclesitephotourl", "photourl", "photo"], customerData.photoUrl);
  }
  updateCell(["address"], customerData.address);
  updateCell(["staffname", "staff"], customerData.staffName);
  updateCell(["staffnotescleaninginstructions", "staffnotesspecialinstructions", "staffnotes", "notes"], customerData.staffNotes);
  updateCell(["active", "status"], customerData.active || "Yes");
  
  if (customerData.sheetName === "Daily Clean") {
    updateCell(["vehiclenumbersmodels", "vehiclenumbers", "vehicle"], customerData.vehicleNumbers || customerData.vehicle);
    updateCell(["packagetype", "pkgtype"], customerData.packageType || "DCC ONLY");
    updateCell(["packagespurchased", "pkgcount"], customerData.packagesPurchased || "1");
    updateCell(["secondaryaddressifany", "secondaryaddress"], customerData.secondaryAddress || "");
    updateCell(["secondarymapsurl"], customerData.secondaryMapsUrl || "");
  } else {
    var sCat = customerData.serviceCategory;
    var sTypeVal = (sCat === "Solar Panel Cleaning") ? "Solar Panel Cleaning" : ((sCat === "Car Washing") ? "Car Washing" : (customerData.serviceType || customerData.packageType || ""));
    updateCell(["vehiclenumbersitename", "vehicleorsite", "vehicle"], customerData.vehicleOrSite || customerData.vehicleNumbers || customerData.vehicle);
    updateCell(["servicetypecarwashsolarcleaning", "servicetype"], sTypeVal);
    updateCell(["packageservicedetails", "packagedetails"], customerData.packageDetails || customerData.packageType || sTypeVal);
    updateCell(["secondaryaddressifany", "secondaryaddress"], customerData.secondaryAddress || "");
    updateCell(["secondarymapsurl"], customerData.secondaryMapsUrl || "");
  }
  
  return { success: true, message: "ग्राहक का विवरण सफलतापूर्वक अपडेट हुआ!" };
}

/**
 * Reorder sheet columns to Customer-First structure
 */
function reorderSheetToCustomerFirst_() {
  var ss = getSpreadsheet_();
  
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dData = dailySheet.getDataRange().getValues();
    if (dData.length > 0) {
      var headerMap = getHeaderIndexMap_(dailySheet);
      var newHeaders = [
        "Customer Name",
        "Customer Number",
        "Google Maps URL",
        "Customer / Vehicle Photo URL",
        "Address",
        "Vehicle Number(s) / Model(s)",
        "Package Type",
        "Packages Purchased",
        "Staff Name",
        "Staff Notes / Cleaning Instructions",
        "Secondary Address (if any)",
        "Secondary Maps URL",
        "Active"
      ];
      
      var newRows = [newHeaders];
      for (var r = 1; r < dData.length; r++) {
        var row = dData[r];
        newRows.push([
          getVal_(row, headerMap, ["customername", "custname"]),
          getVal_(row, headerMap, ["customernumber", "custphone", "number", "phone", "mob"]),
          getVal_(row, headerMap, ["googlemapsurl", "mapurl", "maps", "location"]),
          getVal_(row, headerMap, ["customervehiclephotourl", "photourl", "photo"]),
          getVal_(row, headerMap, ["address"]),
          getVal_(row, headerMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
          getVal_(row, headerMap, ["packagetype", "pkgtype"]),
          getVal_(row, headerMap, ["packagespurchased", "pkgcount"]) || "1",
          getVal_(row, headerMap, ["staffname", "staff"]),
          getVal_(row, headerMap, ["staffnotescleaninginstructions", "staffnotes", "notes"]),
          getVal_(row, headerMap, ["secondaryaddressifany", "secondaryaddress"]),
          getVal_(row, headerMap, ["secondarymapsurl"]),
          getVal_(row, headerMap, ["active", "status"]) || "Yes"
        ]);
      }
      
      dailySheet.clearContents();
      dailySheet.getRange(1, 1, newRows.length, newHeaders.length).setValues(newRows);
      formatSheetHeaders_(dailySheet, newHeaders.length);
    }
  }
  
  var otherSheet = ss.getSheetByName("All Other Work");
  if (otherSheet) {
    var oData = otherSheet.getDataRange().getValues();
    if (oData.length > 0) {
      var oHeaderMap = getHeaderIndexMap_(otherSheet);
      var newOtherHeaders = [
        "Customer Name",
        "Customer Number",
        "Google Maps URL",
        "Vehicle / Site Photo URL",
        "Address",
        "Service Type (Car Wash / Solar Cleaning)",
        "Vehicle Number / Site Name",
        "Package / Service Details",
        "Staff Name",
        "Staff Notes / Special Instructions",
        "Secondary Address (if any)",
        "Secondary Maps URL",
        "Active"
      ];
      
      var newOtherRows = [newOtherHeaders];
      for (var or = 1; or < oData.length; or++) {
        var oRow = oData[or];
        newOtherRows.push([
          getVal_(oRow, oHeaderMap, ["customername", "custname"]),
          getVal_(oRow, oHeaderMap, ["customernumber", "custphone", "number", "phone", "mob"]),
          getVal_(oRow, oHeaderMap, ["googlemapsurl", "mapurl", "maps", "location"]),
          getVal_(oRow, oHeaderMap, ["vehiclesitephotourl", "photourl", "photo"]),
          getVal_(oRow, oHeaderMap, ["address"]),
          getVal_(oRow, oHeaderMap, ["servicetypecarwashsolarcleaning", "servicetype"]),
          getVal_(oRow, oHeaderMap, ["vehiclenumbersitename", "vehicleorsite", "vehicle"]),
          getVal_(oRow, oHeaderMap, ["packageservicedetails", "packagedetails"]),
          getVal_(oRow, oHeaderMap, ["staffname", "staff"]),
          getVal_(oRow, oHeaderMap, ["staffnotesspecialinstructions", "staffnotes", "notes"]),
          getVal_(oRow, oHeaderMap, ["secondaryaddressifany", "secondaryaddress"]),
          getVal_(oRow, oHeaderMap, ["secondarymapsurl"]),
          getVal_(oRow, oHeaderMap, ["active", "status"]) || "Yes"
        ]);
      }
      
      otherSheet.clearContents();
      otherSheet.getRange(1, 1, newOtherRows.length, newOtherHeaders.length).setValues(newOtherRows);
      formatSheetHeaders_(otherSheet, newOtherHeaders.length);
    }
  }
  
  syncStaffDropdownValidation_();
  
  return {
    success: true,
    message: "शीट्स सफलतापूर्वक कस्टमर-फर्स्ट क्रम में व्यवस्थित हो गईं!"
  };
}

function formatSheetHeaders_(sheet, colCount) {
  try {
    var headerRange = sheet.getRange(1, 1, 1, colCount);
    headerRange.setBackground("#0f2942");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);
  } catch (e) {}
}

/**
 * =========================================================================
 * ADMIN AUTHENTICATION
 * Default production credentials have been strictly removed.
 * =========================================================================
 */
function getAdminPassword_() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(ADMIN_PASSWORD_PROP_KEY);
  if (saved && saved.toString().trim()) {
    return saved.toString().trim();
  }
  return "";
}

function verifyAdminPassword_(inputPassword) {
  var current = getAdminPassword_();
  if (!current) {
    return { success: false, error: "एडमिन पासवर्ड Script Properties में कॉन्फ़िगर नहीं है।" };
  }
  var input = (inputPassword || "").toString().trim();
  if (input === current) {
    var token = createAdminSessionGas_();
    return { success: true, token: token, message: "प्रमाणित हुआ" };
  }
  return { success: false, error: "गलत एडमिन पासवर्ड। कृपया सही पासवर्ड दर्ज करें।" };
}

function updateAdminPassword_(newPassword) {
  var p = (newPassword || "").toString().trim();
  if (!p || p.length < 6) {
    return { success: false, error: "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।" };
  }
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROP_KEY, p);
  return { success: true, message: "एडमिन पासवर्ड सफलतापूर्वक अपडेट हो गया!" };
}
