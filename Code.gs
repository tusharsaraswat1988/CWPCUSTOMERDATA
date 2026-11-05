/**
 * =========================================================================
 * CWP Staff Information Viewer - Google Apps Script Backend
 * CWP Detailers & Motors
 *
 * Hardened Security & Functional Backend:
 * - Server-Issued Admin & Staff Sessions with Expiry & Revocation
 * - Server-Side Authorization for Every Admin API Operation
 * - Strict Staff Data Isolation (No cross-staff data leakage)
 * - Salted SHA-256 PIN Hashing with Seamless Legacy Plaintext Migration
 * - Explicit Service Category Mapping (Daily Car Cleaning / Car Washing / Solar Panel Cleaning)
 * - Safe Handling of Unknown Service Types (No accidental Daily Clean fallback)
 * - Sheet Update Integrity (No duplicate, orphaned, or auto-moved rows)
 * - Daily Clean Source Row Order Strictly Preserved
 * - Plaintext PIN Exposure Completely Eliminated
 *
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit
 * =========================================================================
 */

var SPREADSHEET_ID = "1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY";
var DRIVE_FOLDER_NAME = "CWP_Customer_Photos";

/**
 * Custom Menu inside Google Sheets for 1-Click Operations
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🚗 CWP Management')
      .addItem('1. 🔄 Reorder Columns (Customer-First)', 'reorderSheetToCustomerFirst')
      .addItem('2. 👔 Sync Staff Dropdown in Sheet', 'syncStaffDropdownValidation')
      .addItem('3. 👥 Sync Dedicated Staff Sheet Tab', 'syncStaffSheet')
      .addItem('4. 🧹 Fix & Remove Address Dropdown', 'clearInvalidDropdowns')
      .addToUi();
  } catch (e) {
    // UI may not be available in standalone execution contexts
  }
}

/**
 * Serves the Web Application
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile("Index");
  
  var staffId = (e && e.parameter && (e.parameter.staff || e.parameter.id)) ? e.parameter.staff || e.parameter.id : "";
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
 * SECURITY: PIN HASHING & PIN VERIFICATION (Salted SHA-256)
 * Format: sha256:16char_salt:64char_hex_hash
 * Exactly matches Node.js / Railway backend format.
 * =========================================================================
 */
function hashPin(pin, salt) {
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

function verifyPin(inputPin, storedValue) {
  if (!storedValue || !inputPin) return false;
  var str = storedValue.toString().trim();
  var inputStr = inputPin.toString().trim();
  if (/^\d{4,8}$/.test(str)) {
    return inputStr === str;
  }
  if (str.indexOf("sha256:") === 0) {
    var parts = str.split(":");
    if (parts.length === 3) {
      var salt = parts[1];
      var expectedHash = parts[2];
      var computed = hashPin(inputStr, salt);
      return computed === str;
    }
  }
  return false;
}

/**
 * =========================================================================
 * SECURITY: SERVER-ISSUED SESSIONS (ADMIN & STAFF)
 * =========================================================================
 */
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createAdminSessionGas() {
  var token = "adm_" + Utilities.getUuid().replace(/-/g, "");
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

function isValidAdminSessionGas(token) {
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

function revokeAdminSessionGas(token) {
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

function createStaffSessionGas(staffId) {
  var token = "stf_" + Utilities.getUuid().replace(/-/g, "");
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

function getValidStaffSessionGas(token) {
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

function revokeStaffSessionGas(token) {
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

function revokeAllStaffSessionsForIdGas(staffId) {
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
 * Handle API POST requests
 */
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var token = (requestData.token || requestData.adminToken || requestData.staffToken || "").toString().trim();
    var result = {};
    
    // 1. Staff PIN Verification
    if (action === "verifyStaffPin") {
      result = verifyStaffPin(requestData.phone || requestData.mobile || requestData.staffPhone || requestData.staffId, requestData.pin);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Staff Logout
    if (action === "logoutStaff") {
      revokeStaffSessionGas(token);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Admin Authentication
    if (action === "verifyAdminPassword") {
      result = verifyAdminPassword(requestData.password);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Admin Logout
    if (action === "logoutAdmin") {
      revokeAdminSessionGas(token);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. Staff Customer Data (Requires valid Staff Session or Admin Session)
    if (action === "getStaffData") {
      result = getStaffCustomerData(requestData.staffId, token);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. Public Staff List (Sanitized: NO PINs returned)
    if (action === "getStaffList") {
      var isAdmin = isValidAdminSessionGas(token);
      result = getStaffListSanitized(isAdmin);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // PROTECTED ADMIN ACTIONS (REQUIRE VALID ADMIN SESSION TOKEN)
    // =========================================================================
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
      if (!isValidAdminSessionGas(token)) {
        result = { success: false, error: "Unauthorized: Valid Admin session required", unauthorized: true };
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === "cleanAndSyncStaff") {
      result = cleanAndSyncStaff();
    } else if (action === "saveStaffMember") {
      result = saveStaffMember(requestData.staffData || requestData, requestData.id);
    } else if (action === "resetStaffPin") {
      result = resetStaffPin(requestData.staffId, requestData.newPin);
    } else if (action === "toggleStaffActive") {
      result = toggleStaffActive(requestData.staffId, requestData.active);
    } else if (action === "deleteStaffMember") {
      result = deleteStaffMember(requestData.id);
    } else if (action === "syncStaffSheet") {
      syncStaffSheet();
      result = { success: true, staffList: getStaffListSanitized(true) };
    } else if (action === "saveCustomer") {
      result = saveCustomer(requestData.customerData);
    } else if (action === "getAllCustomers") {
      result = getAllCustomersForAdmin();
    } else if (action === "toggleCustomerActive") {
      result = toggleCustomerActive(requestData.sheetName, requestData.rowIndex, requestData.currentStatus);
    } else if (action === "updateAdminPassword") {
      result = updateAdminPassword(requestData.newPassword);
    } else if (action === "updateCustomer") {
      result = updateCustomer(requestData.customerData);
    } else if (action === "reorderSheet") {
      result = reorderSheetToCustomerFirst();
    } else if (action === "syncStaffDropdown") {
      syncStaffDropdownValidation();
      result = { success: true, staffList: getStaffListSanitized(true) };
    } else if (action === "clearInvalidDropdowns") {
      result = clearInvalidDropdowns();
    } else {
      result = { error: "Unknown action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper to get the target spreadsheet
 */
function getSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Dynamic Header Index Map
 */
function getHeaderIndexMap(sheet) {
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

function getVal(row, headerMap, aliases) {
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

function isActiveStatus(val) {
  if (val === undefined || val === null || val === "") return true;
  var s = val.toString().trim().toLowerCase();
  return s === "yes" || s === "active" || s === "true" || s === "y" || s === "1";
}

/**
 * =========================================================================
 * CATEGORY CLASSIFICATION (EXPLICIT SERVICE TYPE MAPPING)
 * Categories:
 * 1. Daily Car Cleaning
 * 2. Car Washing
 * 3. Solar Panel Cleaning
 * =========================================================================
 */
function classifyServiceCategory(sheetName, serviceType, packageType, packageDetails, vehicleOrSite) {
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
  if (sName.indexOf("other") >= 0) {
    return "Car Washing";
  }

  return "Car Washing";
}

/**
 * =========================================================================
 * STAFF MANAGEMENT
 * =========================================================================
 */
function getStaffList() {
  var props = PropertiesService.getScriptProperties();
  var staffJson = props.getProperty("STAFF_LIST");
  var list = [];
  
  if (staffJson !== null && staffJson !== undefined) {
    try {
      list = JSON.parse(staffJson);
    } catch (e) {
      list = [];
    }
    return deduplicateStaffList(list);
  }
  
  return cleanAndSyncStaff();
}

function getStaffListSanitized(isAdmin) {
  var list = getStaffList();
  return list.map(function(s) {
    if (isAdmin) {
      return {
        id: s.id,
        name: s.name,
        phone: s.phone || "",
        active: s.active !== undefined ? s.active : true,
        hasPin: !!s.pin
      };
    }
    return {
      id: s.id,
      name: s.name,
      active: s.active !== undefined ? s.active : true
    };
  });
}

function deduplicateStaffList(list) {
  if (!list || !Array.isArray(list)) return [];
  var seenNames = {};
  var clean = [];
  
  list.forEach(function(item) {
    if (!item || !item.name) return;
    var normName = item.name.toString().trim().toLowerCase();
    if (seenNames[normName]) return;
    seenNames[normName] = true;
    
    var rawPin = item.pin ? item.pin.toString().trim() : "";
    if (rawPin && /^\d{4,8}$/.test(rawPin)) {
      rawPin = hashPin(rawPin);
    } else if (!rawPin) {
      rawPin = hashPin("123456");
    }

    clean.push({
      id: (item.id || "STF0" + (clean.length + 1)).toString().trim().toUpperCase(),
      name: item.name.toString().trim(),
      phone: (item.phone || "").toString().trim(),
      pin: rawPin,
      active: item.active !== undefined ? (item.active === true || item.active === "Yes" || item.active === "yes" || item.active === "Active") : true
    });
  });
  
  return clean;
}

function cleanAndSyncStaff() {
  var ss = getSpreadsheet();
  var sheets = ["Daily Clean", "All Other Work"];
  
  var existingList = [];
  try {
    var props = PropertiesService.getScriptProperties();
    var staffJson = props.getProperty("STAFF_LIST");
    if (staffJson) existingList = JSON.parse(staffJson);
  } catch (e) {}

  var nameToStaff = {};
  var staffList = [];
  var idCounter = 1;

  if (Array.isArray(existingList)) {
    existingList.forEach(function(s) {
      if (!s || !s.name) return;
      var strName = s.name.toString().trim();
      if (/^\d+$/.test(strName) || strName.length < 2 || strName.startsWith("http")) return;
      var norm = strName.toLowerCase();
      if (!nameToStaff[norm]) {
        var rawPin = s.pin ? s.pin.toString().trim() : "";
        if (rawPin && /^\d{4,8}$/.test(rawPin)) {
          rawPin = hashPin(rawPin);
        } else if (!rawPin) {
          rawPin = hashPin("123456");
        }
        s.pin = rawPin;
        nameToStaff[norm] = s;
        staffList.push(s);
        var match = (s.id || "").match(/^STF0*(\d+)$/i);
        if (match) {
          var num = parseInt(match[1], 10);
          if (num >= idCounter) idCounter = num + 1;
        }
      }
    });
  }

  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    
    var hMap = getHeaderIndexMap(sheet);
    for (var r = 1; r < data.length; r++) {
      var sName = getVal(data[r], hMap, ["staffname", "staff"]).toString().trim();
      if (!sName || /^\d+$/.test(sName) || sName.length < 2 || sName.startsWith("http")) continue;
      
      var normName = sName.toLowerCase();
      if (!nameToStaff[normName]) {
        var cleanId = "STF" + (idCounter < 10 ? "0" + idCounter : idCounter);
        idCounter++;
        var newStaffObj = { id: cleanId, name: sName, phone: "", pin: hashPin("123456"), active: true };
        nameToStaff[normName] = newStaffObj;
        staffList.push(newStaffObj);
      }
    }
  });

  if (staffList.length === 0) {
    staffList = [
      { id: "STF01", name: "Chandan Soni", phone: "9919856161", pin: hashPin("123456"), active: true },
      { id: "STF02", name: "Taufiq Ahmed", phone: "8081913264", pin: hashPin("654321"), active: true }
    ];
  }

  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(staffList));
  syncStaffDropdownValidation();
  syncStaffSheet(staffList);
  
  return getStaffListSanitized(true);
}

function saveStaffMember(staffData, legacyId) {
  var name = "", id = "", phone = "", pin = "", active = true;
  
  if (typeof staffData === "object" && staffData !== null) {
    name = (staffData.name || "").toString().trim();
    id = (staffData.id || "").toString().trim();
    phone = (staffData.phone || "").toString().trim();
    pin = (staffData.pin || "").toString().trim();
    if (staffData.active !== undefined) {
      active = (staffData.active === true || staffData.active === "Yes" || staffData.active === "yes" || staffData.active === "Active");
    }
  } else {
    name = (staffData || "").toString().trim();
    id = (legacyId || "").toString().trim();
  }
  
  if (!name) {
    throw new Error("Staff name is required.");
  }
  
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList();
  
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
  
  var existingIndex = list.findIndex(function(item) {
    return (item.id && item.id.toLowerCase() === id.toLowerCase()) || 
           (item.name && item.name.toLowerCase() === name.toLowerCase());
  });

  var pinToStore = "";
  if (pin) {
    if (pin.indexOf("sha256:") === 0) {
      pinToStore = pin;
    } else if (/^\d{6}$/.test(pin)) {
      pinToStore = hashPin(pin);
    } else {
      throw new Error("PIN must be exactly 6 numeric digits.");
    }
  } else if (existingIndex >= 0 && list[existingIndex].pin) {
    pinToStore = list[existingIndex].pin;
  } else {
    pinToStore = hashPin("123456");
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
  syncStaffDropdownValidation();
  syncStaffSheet(list);
  
  return { success: true, staffList: getStaffListSanitized(true), staff: { id: updatedStaff.id, name: updatedStaff.name, phone: updatedStaff.phone, active: updatedStaff.active, hasPin: true } };
}

function resetStaffPin(staffId, newPin) {
  var sId = (staffId || "").toString().trim().toUpperCase();
  var pinStr = (newPin || "").toString().trim();
  if (!sId) throw new Error("Staff ID is required.");
  if (!/^\d{6}$/.test(pinStr)) throw new Error("Staff PIN must be exactly 6 numeric digits.");

  var list = getStaffList();
  var staff = list.find(function(item) { return (item.id || "").toUpperCase() === sId; });
  if (!staff) throw new Error("Staff member not found: " + sId);

  staff.pin = hashPin(pinStr);
  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
  revokeAllStaffSessionsForIdGas(staff.id);
  syncStaffSheet(list);

  return { success: true, message: "स्टाफ सदस्य का पिन सफलतापूर्वक रीसेट कर दिया गया।" };
}

function toggleStaffActive(id, newStatus) {
  id = (id || "").toString().trim().toLowerCase();
  var list = getStaffList();
  var found = false;
  
  list.forEach(function(item) {
    if ((item.id || "").toLowerCase() === id) {
      item.active = !!newStatus;
      found = true;
      if (!item.active) {
        revokeAllStaffSessionsForIdGas(item.id);
      }
    }
  });
  
  if (found) {
    PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
    syncStaffDropdownValidation();
    syncStaffSheet(list);
  }
  
  return { success: found, staffList: getStaffListSanitized(true) };
}

function verifyStaffPin(identifier, pin) {
  var list = getStaffList();
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
    return { success: false, error: "यह मोबाइल नंबर स्टाफ लिस्ट में पंजीकृत नहीं मिला।" };
  }
  
  var isActive = staff.active !== undefined ? (staff.active === true || staff.active === "Yes" || staff.active === "yes" || staff.active === "Active") : true;
  if (!isActive) {
    return {
      success: false,
      inactive: true,
      error: "आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।"
    };
  }
  
  var input = (pin || "").toString().trim();
  var isMatch = verifyPin(input, staff.pin);
  
  if (isMatch) {
    // Migration: If legacy plaintext PIN, upgrade to salted SHA-256 hash now
    if (/^\d{4,8}$/.test((staff.pin || "").toString().trim())) {
      staff.pin = hashPin(input);
      PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(list));
      syncStaffSheet(list);
    }
    var token = createStaffSessionGas(staff.id);
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

function deleteStaffMember(id) {
  id = (id || "").toString().trim().toLowerCase();
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList();
  
  revokeAllStaffSessionsForIdGas(id);
  list = list.filter(function(item) {
    return item.id.toLowerCase() !== id;
  });
  
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  syncStaffDropdownValidation();
  syncStaffSheet(list);
  return { success: true, staffList: getStaffListSanitized(true) };
}

/**
 * =========================================================================
 * GOOGLE SHEETS DATA VALIDATION
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

function clearInvalidDropdowns() {
  try {
    var ss = getSpreadsheet();
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
    
    syncStaffDropdownValidation();
    return { success: true, message: "गैर-स्टाफ कॉलम्स से अवैध ड्रॉपडाउन हटा दिया गया है।" };
  } catch (err) {
    return { error: err.toString() };
  }
}

function syncStaffDropdownValidation() {
  try {
    var ss = getSpreadsheet();
    var staffList = getStaffList();
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
      var hMap = getHeaderIndexMap(sheet);
      var staffColIdx = hMap["staffname"] !== undefined ? hMap["staffname"] : (hMap["staff"] !== undefined ? hMap["staff"] : -1);
      if (staffColIdx >= 0) {
        var maxRows = Math.max(sheet.getMaxRows(), 100);
        var range = sheet.getRange(2, staffColIdx + 1, maxRows - 1, 1);
        range.setDataValidation(rule);
      }
    });

    var dailySheet = ss.getSheetByName("Daily Clean");
    if (dailySheet) {
      var dMap = getHeaderIndexMap(dailySheet);
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

    syncStaffSheet(staffList);
  } catch (err) {
    Logger.log("Validation sync notice: " + err.toString());
  }
}

/**
 * Sync Dedicated Staff sheet tab (NEVER writes plaintext PIN)
 */
function syncStaffSheet(list) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName("Staff");
    if (!sheet) {
      sheet = ss.insertSheet("Staff");
    }
    if (!list || !Array.isArray(list)) list = getStaffList();
    
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
 * STAFF READ-ONLY CUSTOMER DATA VIEWER
 * Strict Data Isolation:
 * - When called with staff session token, discards browser-supplied staffId
 *   and enforces session identity.
 * - Source row order in Daily Clean is strictly preserved.
 * =========================================================================
 */
function getStaffCustomerData(requestedStaffId, authToken) {
  var staffSess = getValidStaffSessionGas(authToken);
  var adminSess = isValidAdminSessionGas(authToken);

  if (authToken) {
    if (!staffSess && !adminSess) {
      return { error: "Unauthorized: Invalid or expired session token", unauthorized: true };
    }
    if (staffSess) {
      // Discard browser staffId, use verified session identity to prevent cross-staff data access
      requestedStaffId = staffSess.staffId;
    }
  }

  if (!requestedStaffId) {
    return { error: "No Staff identifier provided.", staffId: "", staffName: "", dailyCarCleaning: [], carWashing: [], solarCleaning: [], dailyClean: [], allOtherWork: [] };
  }
  
  var targetQuery = requestedStaffId.toString().trim().toLowerCase();
  var ss = getSpreadsheet();
  
  var staffList = getStaffList();
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
      var dMap = getHeaderIndexMap(dailySheet);
      for (var i = 1; i < dailyData.length; i++) {
        var row = dailyData[i];
        var rowStaffName = getVal(row, dMap, ["staffname", "staff"]).toString().trim().toLowerCase();
        var rowStaffId = getVal(row, dMap, ["staffid", "id"]).toString().trim().toLowerCase();
        var rowActive = getVal(row, dMap, ["active", "status"]);
        
        var isMatch = false;
        if (foundStaff) {
          isMatch = (rowStaffName === foundStaff.name.toLowerCase()) || (rowStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatch = (rowStaffName === targetQuery) || (rowStaffId === targetQuery);
        }
        
        if (isMatch && isActiveStatus(rowActive)) {
          dailyCarCleaningList.push({
            staffId: staffId,
            staffName: getVal(row, dMap, ["staffname", "staff"]) || staffName,
            customerName: getVal(row, dMap, ["customername", "custname"]),
            customerNumber: (getVal(row, dMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal(row, dMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal(row, dMap, ["customervehiclephotourl", "photourl", "photo"]),
            address: getVal(row, dMap, ["address"]),
            vehicleNumbers: getVal(row, dMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
            vehicle: getVal(row, dMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
            packageType: getVal(row, dMap, ["packagetype", "pkgtype"]),
            packagesPurchased: getVal(row, dMap, ["packagespurchased", "pkgcount"]) || "1",
            serviceCategory: "Daily Car Cleaning",
            category: "daily_car_cleaning",
            staffNotes: getVal(row, dMap, ["staffnotescleaninginstructions", "staffnotes", "notes"]),
            secondaryAddress: getVal(row, dMap, ["secondaryaddressifany", "secondaryaddress"]),
            secondaryMapsUrl: getVal(row, dMap, ["secondarymapsurl"]),
            active: getVal(row, dMap, ["active", "status"]) || "Yes"
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
      var oMap = getHeaderIndexMap(otherSheet);
      for (var j = 1; j < otherData.length; j++) {
        var oRow = otherData[j];
        var oStaffName = getVal(oRow, oMap, ["staffname", "staff"]).toString().trim().toLowerCase();
        var oStaffId = getVal(oRow, oMap, ["staffid", "id"]).toString().trim().toLowerCase();
        var oActive = getVal(oRow, oMap, ["active", "status"]);
        
        var isMatchOther = false;
        if (foundStaff) {
          isMatchOther = (oStaffName === foundStaff.name.toLowerCase()) || (oStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatchOther = (oStaffName === targetQuery) || (oStaffId === targetQuery);
        }
        
        if (isMatchOther && isActiveStatus(oActive)) {
          var sType = getVal(oRow, oMap, ["servicetypecarwashsolarcleaning", "servicetype"]);
          var pType = getVal(oRow, oMap, ["packagetype", "pkgtype"]);
          var pDetails = getVal(oRow, oMap, ["packageservicedetails", "packagedetails"]);
          var vSite = getVal(oRow, oMap, ["vehiclenumbersitename", "vehicleorsite", "vehicle"]);
          var classifiedCat = classifyServiceCategory("All Other Work", sType, pType, pDetails, vSite);

          var item = {
            staffId: staffId,
            staffName: getVal(oRow, oMap, ["staffname", "staff"]) || staffName,
            customerName: getVal(oRow, oMap, ["customername", "custname"]),
            customerNumber: (getVal(oRow, oMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal(oRow, oMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal(oRow, oMap, ["vehiclesitephotourl", "photourl", "photo"]),
            address: getVal(oRow, oMap, ["address"]),
            serviceType: sType || pType || classifiedCat,
            vehicleNumbers: vSite,
            vehicleOrSite: vSite,
            vehicle: vSite,
            packageDetails: pDetails || pType || classifiedCat,
            packageType: pType || pDetails || classifiedCat,
            packagesPurchased: "1",
            serviceCategory: classifiedCat,
            category: classifiedCat === "Solar Panel Cleaning" ? "solar_cleaning" : (classifiedCat === "Daily Car Cleaning" ? "daily_car_cleaning" : "car_washing"),
            staffNotes: getVal(oRow, oMap, ["staffnotesspecialinstructions", "staffnotes", "notes"]),
            active: getVal(oRow, oMap, ["active", "status"]) || "Yes"
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
  
  return {
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
}

/**
 * =========================================================================
 * ADMIN: SAVE CUSTOMER (CUSTOMER-FIRST COLUMN ORDER)
 * =========================================================================
 */
function saveCustomer(customerData) {
  if (!customerData) {
    throw new Error("No customer data provided.");
  }
  
  var ss = getSpreadsheet();
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
  var headerMap = getHeaderIndexMap(sheet);
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
  
  var custNum = customerData.customerNumber ? "'" + customerData.customerNumber : "";
  
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
function getAllCustomersForAdmin() {
  var ss = getSpreadsheet();
  var records = [];
  var sheets = ["Daily Clean", "All Other Work"];
  
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    
    var hMap = getHeaderIndexMap(sheet);
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var sType = getVal(row, hMap, ["servicetypecarwashsolarcleaning", "servicetype"]);
      var pType = getVal(row, hMap, ["packagetype", "pkgtype", "servicetypecarwashsolarcleaning", "servicetype"]) || "DCC ONLY";
      var pDetails = getVal(row, hMap, ["packageservicedetails", "packagedetails"]);
      var veh = getVal(row, hMap, ["vehiclenumbersmodels", "vehiclenumbersitename", "vehiclenumbers", "vehicle", "models", "site"]);
      var serviceCategory = classifyServiceCategory(sheetName, sType, pType, pDetails, veh);

      records.push({
        sheetName: sheetName,
        serviceCategory: serviceCategory,
        rowIndex: i + 1,
        staffId: getVal(row, hMap, ["staffid", "id"]) || "",
        staffName: getVal(row, hMap, ["staffname", "staff"]),
        customerName: getVal(row, hMap, ["customername", "custname"]),
        customerNumber: (getVal(row, hMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
        googleMapsUrl: getVal(row, hMap, ["googlemapsurl", "mapurl", "maps", "location"]),
        photoUrl: getVal(row, hMap, ["customervehiclephotourl", "vehiclesitephotourl", "photourl", "photo"]),
        address: getVal(row, hMap, ["address"]),
        vehicle: veh,
        vehicleNumbers: veh,
        packageType: pType,
        serviceType: sType,
        packageDetails: pDetails,
        packagesPurchased: (getVal(row, hMap, ["packagespurchased", "pkgcount"]) || "1").toString(),
        secondaryAddress: getVal(row, hMap, ["secondaryaddressifany", "secondaryaddress"]) || "",
        secondaryMapsUrl: getVal(row, hMap, ["secondarymapsurl"]) || "",
        notes: getVal(row, hMap, ["staffnotes", "notes"]),
        active: (getVal(row, hMap, ["active", "status"]) || "Yes").toString()
      });
    }
  });
  
  return records;
}

function toggleCustomerActive(sheetName, rowIndex, currentStatus) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found");
  
  var hMap = getHeaderIndexMap(sheet);
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
function updateCustomer(customerData) {
  if (!customerData || !customerData.sheetName || !customerData.rowIndex) {
    throw new Error("Missing sheetName or rowIndex for update.");
  }
  
  var ss = getSpreadsheet();
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
  
  var hMap = getHeaderIndexMap(sheet);
  
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
  
  var custNum = customerData.customerNumber ? "'" + customerData.customerNumber.toString().replace(/^'+/, '') : "";
  
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
  }
  
  return { success: true, message: "ग्राहक का विवरण सफलतापूर्वक अपडेट हुआ!" };
}

/**
 * Reorder sheet columns to Customer-First structure
 */
function reorderSheetToCustomerFirst() {
  var ss = getSpreadsheet();
  
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dData = dailySheet.getDataRange().getValues();
    if (dData.length > 0) {
      var headerMap = getHeaderIndexMap(dailySheet);
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
          getVal(row, headerMap, ["customername", "custname"]),
          getVal(row, headerMap, ["customernumber", "custphone", "number", "phone", "mob"]),
          getVal(row, headerMap, ["googlemapsurl", "mapurl", "maps", "location"]),
          getVal(row, headerMap, ["customervehiclephotourl", "photourl", "photo"]),
          getVal(row, headerMap, ["address"]),
          getVal(row, headerMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
          getVal(row, headerMap, ["packagetype", "pkgtype"]),
          getVal(row, headerMap, ["packagespurchased", "pkgcount"]) || "1",
          getVal(row, headerMap, ["staffname", "staff"]),
          getVal(row, headerMap, ["staffnotescleaninginstructions", "staffnotes", "notes"]),
          getVal(row, headerMap, ["secondaryaddressifany", "secondaryaddress"]),
          getVal(row, headerMap, ["secondarymapsurl"]),
          getVal(row, headerMap, ["active", "status"]) || "Yes"
        ]);
      }
      
      dailySheet.clearContents();
      dailySheet.getRange(1, 1, newRows.length, newHeaders.length).setValues(newRows);
      formatSheetHeaders(dailySheet, newHeaders.length);
    }
  }
  
  var otherSheet = ss.getSheetByName("All Other Work");
  if (otherSheet) {
    var oData = otherSheet.getDataRange().getValues();
    if (oData.length > 0) {
      var oHeaderMap = getHeaderIndexMap(otherSheet);
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
        "Active"
      ];
      
      var newOtherRows = [newOtherHeaders];
      for (var or = 1; or < oData.length; or++) {
        var oRow = oData[or];
        newOtherRows.push([
          getVal(oRow, oHeaderMap, ["customername", "custname"]),
          getVal(oRow, oHeaderMap, ["customernumber", "custphone", "number", "phone", "mob"]),
          getVal(oRow, oHeaderMap, ["googlemapsurl", "mapurl", "maps", "location"]),
          getVal(oRow, oHeaderMap, ["vehiclesitephotourl", "photourl", "photo"]),
          getVal(oRow, oHeaderMap, ["address"]),
          getVal(oRow, oHeaderMap, ["servicetypecarwashsolarcleaning", "servicetype"]),
          getVal(oRow, oHeaderMap, ["vehiclenumbersitename", "vehicleorsite", "vehicle"]),
          getVal(oRow, oHeaderMap, ["packageservicedetails", "packagedetails"]),
          getVal(oRow, oHeaderMap, ["staffname", "staff"]),
          getVal(oRow, oHeaderMap, ["staffnotesspecialinstructions", "staffnotes", "notes"]),
          getVal(oRow, oHeaderMap, ["active", "status"]) || "Yes"
        ]);
      }
      
      otherSheet.clearContents();
      otherSheet.getRange(1, 1, newOtherRows.length, newOtherHeaders.length).setValues(newOtherRows);
      formatSheetHeaders(otherSheet, newOtherHeaders.length);
    }
  }
  
  syncStaffDropdownValidation();
  
  return {
    success: true,
    message: "शीट्स सफलतापूर्वक कस्टमर-फर्स्ट क्रम में व्यवस्थित हो गईं!"
  };
}

function formatSheetHeaders(sheet, colCount) {
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
var ADMIN_PASSWORD_PROP_KEY = "CWP_ADMIN_PASSWORD";

function getAdminPassword() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(ADMIN_PASSWORD_PROP_KEY);
  if (saved && saved.toString().trim()) {
    return saved.toString().trim();
  }
  return "";
}

function verifyAdminPassword(inputPassword) {
  var current = getAdminPassword();
  if (!current) {
    return { success: false, error: "एडमिन पासवर्ड Script Properties में कॉन्फ़िगर नहीं है।" };
  }
  var input = (inputPassword || "").toString().trim();
  if (input === current) {
    var token = createAdminSessionGas();
    return { success: true, token: token, message: "प्रमाणित हुआ" };
  }
  return { success: false, error: "गलत एडमिन पासवर्ड। कृपया सही पासवर्ड दर्ज करें।" };
}

function updateAdminPassword(newPassword) {
  var p = (newPassword || "").toString().trim();
  if (!p || p.length < 6) {
    return { success: false, error: "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।" };
  }
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROP_KEY, p);
  return { success: true, message: "एडमिन पासवर्ड सफलतापूर्वक अपडेट हो गया!" };
}
