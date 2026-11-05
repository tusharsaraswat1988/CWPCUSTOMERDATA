/**
 * =========================================================================
 * CWP Staff Information Viewer - Google Apps Script Backend
 * CWP Detailers & Motors
 *
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit
 *
 * Architecture:
 * - Customer-First Column Layout:
 *   1. Customer Name
 *   2. Customer Number (Mobile)
 *   3. Google Maps URL (Location)
 *   4. Customer / Vehicle Photo URL
 *   5. Address
 *   ...followed by vehicle, package, staff (from backend dropdown), and notes.
 * - Dynamic Header Mapping: Reads and writes by column name, making it 100%
 *   resilient to column reordering or additions.
 * - Staff Name from Backend: Staff list is managed centrally. Google Sheets
 *   receives native Data Validation dropdowns to prevent manual spelling mistakes.
 *   Staff code is eliminated from the sheet.
 * =========================================================================
 */

// Spreadsheet ID (Falls back to active sheet if bound to container)
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
      .addItem('3. 🧹 Fix & Remove Address Dropdown', 'clearInvalidDropdowns')
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
  
  // Extract staff query parameter if present: ?staff=STF01 or ?staff=Chandan
  var staffId = (e && e.parameter && (e.parameter.staff || e.parameter.id)) ? e.parameter.staff || e.parameter.id : "";
  var mode = (e && e.parameter && e.parameter.admin) ? "admin" : (staffId ? "staff" : "admin");
  
  // Pass configuration into HTML template
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
 * Handle API POST requests
 */
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var result = {};
    
    if (action === "getStaffData") {
      result = getStaffCustomerData(requestData.staffId);
    } else if (action === "getStaffList") {
      result = getStaffList();
    } else if (action === "cleanAndSyncStaff") {
      result = cleanAndSyncStaff();
    } else if (action === "saveStaffMember") {
      result = saveStaffMember(requestData.name, requestData.id);
    } else if (action === "deleteStaffMember") {
      result = deleteStaffMember(requestData.id);
    } else if (action === "saveCustomer") {
      result = saveCustomer(requestData.customerData);
    } else if (action === "getAllCustomers") {
      result = getAllCustomersForAdmin();
    } else if (action === "toggleCustomerActive") {
      result = toggleCustomerActive(requestData.sheetName, requestData.rowIndex, requestData.currentStatus);
    } else if (action === "verifyAdminPassword") {
      result = verifyAdminPassword(requestData.password);
    } else if (action === "updateAdminPassword") {
      result = updateAdminPassword(requestData.newPassword);
    } else if (action === "updateCustomer") {
      result = updateCustomer(requestData.customerData);
    } else if (action === "reorderSheet") {
      result = reorderSheetToCustomerFirst();
    } else if (action === "syncStaffDropdown") {
      syncStaffDropdownValidation();
      result = { success: true, staffList: getStaffList() };
    } else if (action === "clearInvalidDropdowns") {
      result = clearInvalidDropdowns();
    } else {
      result = { error: "Unknown action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
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
 * =========================================================================
 * DYNAMIC HEADER MAPPING HELPER
 * Resolves column index dynamically from Row 1 header text.
 * Prevents any breakage when columns are moved, inserted or reordered!
 * =========================================================================
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
    
    // Semantic aliases
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
    if (norm.indexOf("vehicle") >= 0 || norm.indexOf("model") >= 0 || norm.indexOf("site") >= 0) {
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

/**
 * Extracts cell value safely using aliases from dynamic header map
 */
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

/**
 * =========================================================================
 * STAFF MANAGEMENT (Stored in Script Properties to NOT pollute Sheet)
 * =========================================================================
 */

/**
 * Retrieve staff list
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
  
  // If property was never set, run cleanAndSyncStaff to auto-discover
  return cleanAndSyncStaff();
}

/**
 * Deduplicate staff array by name
 */
function deduplicateStaffList(list) {
  if (!list || !Array.isArray(list)) return [];
  var seenNames = {};
  var clean = [];
  
  list.forEach(function(item) {
    if (!item || !item.name) return;
    var normName = item.name.toString().trim().toLowerCase();
    if (seenNames[normName]) return;
    seenNames[normName] = true;
    clean.push({
      id: (item.id || "STF0" + (clean.length + 1)).toString().trim().toUpperCase(),
      name: item.name.toString().trim()
    });
  });
  
  return clean;
}

/**
 * Discover unique staff members from sheets and sync dropdown validation
 */
function cleanAndSyncStaff() {
  var ss = getSpreadsheet();
  var sheets = ["Daily Clean", "All Other Work"];
  var nameToStaff = {};
  var staffList = [];
  var idCounter = 1;

  // 1. Scan sheets and find Staff Names dynamically
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    
    var hMap = getHeaderIndexMap(sheet);
    for (var r = 1; r < data.length; r++) {
      var sName = getVal(data[r], hMap, ["staffname", "staff"]).toString().trim();
      if (!sName) continue;
      
      var normName = sName.toLowerCase();
      if (!nameToStaff[normName]) {
        var cleanId = "STF" + (idCounter < 10 ? "0" + idCounter : idCounter);
        idCounter++;
        nameToStaff[normName] = { id: cleanId, name: sName };
        staffList.push({ id: cleanId, name: sName });
      }
    }
  });

  // If no staff found in sheets, provide default starter
  if (staffList.length === 0) {
    staffList = [{ id: "STF01", name: "Chandan Soni" }];
    nameToStaff["chandan soni"] = { id: "STF01", name: "Chandan Soni" };
  }

  // 2. Save clean unique staff list in Properties
  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(staffList));
  
  // 3. Automatically apply native Google Sheet dropdown validation on Staff Name column
  syncStaffDropdownValidation();
  
  return staffList;
}

/**
 * Add or update a staff member
 */
function saveStaffMember(name, id) {
  name = (name || "").toString().trim();
  id = (id || "").toString().trim();
  
  if (!name) {
    throw new Error("Staff name is required.");
  }
  
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList();
  
  // Auto-generate clean ID if not provided
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
    return item.id.toLowerCase() === id.toLowerCase() || item.name.toLowerCase() === name.toLowerCase();
  });
  
  if (existingIndex >= 0) {
    list[existingIndex].name = name;
    list[existingIndex].id = id;
  } else {
    list.push({ id: id, name: name });
  }
  
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  
  // Update Google Sheet dropdown
  syncStaffDropdownValidation();
  
  return { success: true, staffList: list, newStaff: { id: id, name: name } };
}

/**
 * Delete a staff member
 */
function deleteStaffMember(id) {
  id = (id || "").toString().trim().toLowerCase();
  var props = PropertiesService.getScriptProperties();
  var list = getStaffList();
  
  list = list.filter(function(item) {
    return item.id.toLowerCase() !== id;
  });
  
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  syncStaffDropdownValidation();
  return { success: true, staffList: list };
}

/**
 * =========================================================================
 * GOOGLE SHEETS DATA VALIDATION (PREVENTS MANUAL SPELLING MISTAKES)
 * Ensures anyone editing directly in Google Sheets picks staff from a dropdown!
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
    var textAliases = [
      "address", "secondaryaddress", "secondaryaddressifany",
      "custname", "customername",
      "custphone", "customernumber", "number", "phone", "mob",
      "mapurl", "googlemapsurl", "maps", "location", "secondarymapsurl",
      "photo", "customervehiclephotourl", "vehiclesitephotourl",
      "vehicle", "vehiclenumbersmodels", "vehiclenumbersitename",
      "notes", "staffnotes", "staffnotescleaninginstructions"
    ];
    
    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var hMap = getHeaderIndexMap(sheet);
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      
      textAliases.forEach(function(alias) {
        if (hMap[alias] !== undefined) {
          try {
            sheet.getRange(2, hMap[alias] + 1, maxRows - 1, 1).clearDataValidations();
          } catch (e) {}
        }
      });
    });
    
    // Re-apply staff and package validations properly
    syncStaffDropdownValidation();
    return { success: true, message: "Address और अन्य टेक्स्ट कॉलम्स से ड्रॉपडाउन सफलतापूर्वक हटा दिया गया है।" };
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
    
    // 1. First ensure all TEXT columns (Address, Customer Name, Mobile, etc.) have NO dropdowns
    var textAliases = [
      "address", "secondaryaddress", "secondaryaddressifany",
      "custname", "customername",
      "custphone", "customernumber", "number", "phone", "mob",
      "mapurl", "googlemapsurl", "maps", "location", "secondarymapsurl",
      "photo", "customervehiclephotourl", "vehiclesitephotourl",
      "vehicle", "vehiclenumbersmodels", "vehiclenumbersitename",
      "notes", "staffnotes", "staffnotescleaninginstructions"
    ];
    
    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      var hMap = getHeaderIndexMap(sheet);
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      
      textAliases.forEach(function(alias) {
        if (hMap[alias] !== undefined) {
          try {
            sheet.getRange(2, hMap[alias] + 1, maxRows - 1, 1).clearDataValidations();
          } catch (e) {}
        }
      });
    });

    // 2. Apply Data Validation ONLY on Staff Name column
    var staffNames = staffList.map(function(s) { return s.name; });
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(staffNames, true)
      .setAllowInvalid(false)
      .setHelpText("कृपया बैकएंड में पंजीकृत स्टाफ में से ही नाम चुनें। (Select from registered backend staff list)")
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

    // 3. Also apply Data Validation on Package Type in Daily Clean ONLY
    var dailySheet = ss.getSheetByName("Daily Clean");
    if (dailySheet) {
      var dMap = getHeaderIndexMap(dailySheet);
      var pkgColIdx = dMap["packagetype"] !== undefined ? dMap["packagetype"] : (dMap["pkgtype"] !== undefined ? dMap["pkgtype"] : -1);
      if (pkgColIdx >= 0) {
        var pkgRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(CWP_PACKAGE_TYPES, true)
          .setAllowInvalid(true)
          .setHelpText("पैकेज प्रकार चुनें (Select Package Type)")
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
 * =========================================================================
 * STAFF READ-ONLY CUSTOMER DATA VIEWER
 * Dynamic matching: Staff ID or Staff Name matched reliably without needing
 * any Staff ID column in the sheet.
 * =========================================================================
 */
function getStaffCustomerData(requestedStaffId) {
  if (!requestedStaffId) {
    return { error: "No Staff identifier provided.", staffId: "", staffName: "", dailyClean: [], allOtherWork: [] };
  }
  
  var targetQuery = requestedStaffId.toString().trim().toLowerCase();
  var ss = getSpreadsheet();
  
  // Find staff in staffList
  var staffList = getStaffList();
  var foundStaff = staffList.find(function(s) {
    return s.id.toLowerCase() === targetQuery || s.name.toLowerCase() === targetQuery;
  });
  
  var staffName = foundStaff ? foundStaff.name : requestedStaffId;
  var staffId = foundStaff ? foundStaff.id : requestedStaffId;
  
  var dailyCleanList = [];
  var allOtherWorkList = [];
  
  // 1. Process "Daily Clean" tab
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dailyData = dailySheet.getDataRange().getValues();
    if (dailyData.length > 1) {
      var dMap = getHeaderIndexMap(dailySheet);
      for (var i = 1; i < dailyData.length; i++) {
        var row = dailyData[i];
        var rowStaffName = getVal(row, dMap, ["staffname", "staff"]).toString().trim().toLowerCase();
        var rowStaffId = getVal(row, dMap, ["staffid", "id"]).toString().trim().toLowerCase();
        var rowActive = (getVal(row, dMap, ["active", "status"]) || "Yes").toString().trim().toLowerCase();
        
        var isMatch = false;
        if (foundStaff) {
          isMatch = (rowStaffName === foundStaff.name.toLowerCase()) || (rowStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatch = (rowStaffName === targetQuery) || (rowStaffId === targetQuery);
        }
        
        if (isMatch && (rowActive === "yes" || rowActive === "true" || rowActive === "")) {
          dailyCleanList.push({
            staffId: staffId,
            staffName: getVal(row, dMap, ["staffname", "staff"]) || staffName,
            customerName: getVal(row, dMap, ["customername", "custname"]),
            customerNumber: (getVal(row, dMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal(row, dMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal(row, dMap, ["customervehiclephotourl", "photourl", "photo"]),
            address: getVal(row, dMap, ["address"]),
            vehicleNumbers: getVal(row, dMap, ["vehiclenumbersmodels", "vehiclenumbers", "vehicle"]),
            packageType: getVal(row, dMap, ["packagetype", "pkgtype"]),
            packagesPurchased: getVal(row, dMap, ["packagespurchased", "pkgcount"]) || "1",
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
        var oActive = (getVal(oRow, oMap, ["active", "status"]) || "Yes").toString().trim().toLowerCase();
        
        var isMatchOther = false;
        if (foundStaff) {
          isMatchOther = (oStaffName === foundStaff.name.toLowerCase()) || (oStaffId === foundStaff.id.toLowerCase());
        } else {
          isMatchOther = (oStaffName === targetQuery) || (oStaffId === targetQuery);
        }
        
        if (isMatchOther && (oActive === "yes" || oActive === "true" || oActive === "")) {
          allOtherWorkList.push({
            staffId: staffId,
            staffName: getVal(oRow, oMap, ["staffname", "staff"]) || staffName,
            customerName: getVal(oRow, oMap, ["customername", "custname"]),
            customerNumber: (getVal(oRow, oMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
            googleMapsUrl: getVal(oRow, oMap, ["googlemapsurl", "mapurl", "maps", "location"]),
            photoUrl: getVal(oRow, oMap, ["vehiclesitephotourl", "photourl", "photo"]),
            address: getVal(oRow, oMap, ["address"]),
            serviceType: getVal(oRow, oMap, ["servicetypecarwashsolarcleaning", "servicetype"]),
            vehicleOrSite: getVal(oRow, oMap, ["vehiclenumbersitename", "vehicleorsite", "vehicle"]),
            packageDetails: getVal(oRow, oMap, ["packageservicedetails", "packagedetails"]),
            staffNotes: getVal(oRow, oMap, ["staffnotesspecialinstructions", "staffnotes", "notes"]),
            active: getVal(oRow, oMap, ["active", "status"]) || "Yes"
          });
        }
      }
    }
  }
  
  return {
    staffId: staffId,
    staffName: staffName,
    dailyClean: dailyCleanList,
    allOtherWork: allOtherWorkList,
    totalCount: dailyCleanList.length + allOtherWorkList.length
  };
}

/**
 * =========================================================================
 * ADMIN: SAVE CUSTOMER (CUSTOMER-FIRST COLUMN ORDER)
 * Saves directly into dynamic header positions.
 * =========================================================================
 */
function saveCustomer(customerData) {
  if (!customerData) {
    throw new Error("No customer data provided.");
  }
  
  var ss = getSpreadsheet();
  var sheetName = (customerData.category === "other" || customerData.sheetName === "All Other Work") ? "All Other Work" : "Daily Clean";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error("Sheet '" + sheetName + "' was not found in the spreadsheet.");
  }
  
  // 1. Direct Image URL (Uploaded via Cloudinary CDN)
  var photoUrl = (customerData.photoUrl || "").trim();

  // 2. Prepare row according to dynamic header mapping
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
    setCol(["vehiclenumbersmodels", "vehiclenumbers", "vehicle"], customerData.vehicleNumbers || "");
    setCol(["packagetype", "pkgtype"], customerData.packageType || "DCC ONLY");
    setCol(["packagespurchased", "pkgcount"], customerData.packagesPurchased || "1");
    setCol(["staffname", "staff"], customerData.staffName || "");
    setCol(["staffnotescleaninginstructions", "staffnotes", "notes"], customerData.staffNotes || "");
    setCol(["secondaryaddressifany", "secondaryaddress"], customerData.secondaryAddress || "");
    setCol(["secondarymapsurl"], customerData.secondaryMapsUrl || "");
    setCol(["active", "status"], customerData.active || "Yes");
    setCol(["staffid", "id"], customerData.staffId || "");
  } else {
    setCol(["customername", "custname"], customerData.customerName || "");
    setCol(["customernumber", "custphone", "number", "phone", "mob"], custNum);
    setCol(["googlemapsurl", "mapurl", "maps", "location"], customerData.googleMapsUrl || "");
    setCol(["vehiclesitephotourl", "photourl", "photo"], photoUrl);
    setCol(["address"], customerData.address || "");
    setCol(["servicetypecarwashsolarcleaning", "servicetype"], customerData.serviceType || "");
    setCol(["vehiclenumbersitename", "vehicleorsite", "vehicle"], customerData.vehicleOrSite || "");
    setCol(["packageservicedetails", "packagedetails"], customerData.packageDetails || "");
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
      records.push({
        sheetName: sheetName,
        rowIndex: i + 1,
        staffId: getVal(row, hMap, ["staffid", "id"]) || "",
        staffName: getVal(row, hMap, ["staffname", "staff"]),
        customerName: getVal(row, hMap, ["customername", "custname"]),
        customerNumber: (getVal(row, hMap, ["customernumber", "custphone", "number", "phone", "mob"]) || "").toString(),
        googleMapsUrl: getVal(row, hMap, ["googlemapsurl", "mapurl", "maps", "location"]),
        photoUrl: getVal(row, hMap, ["customervehiclephotourl", "vehiclesitephotourl", "photourl", "photo"]),
        address: getVal(row, hMap, ["address"]),
        vehicle: getVal(row, hMap, ["vehicle", "vehiclenumbersmodels", "vehiclenumbersitename"]),
        packageType: getVal(row, hMap, ["packagetype", "pkgtype", "servicetypecarwashsolarcleaning", "servicetype"]) || "DCC ONLY",
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
 * Updates an existing customer row in Google Sheets
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
    updateCell(["vehiclenumbersitename", "vehicleorsite", "vehicle"], customerData.vehicleOrSite || customerData.vehicleNumbers || customerData.vehicle);
    updateCell(["servicetypecarwashsolarcleaning", "servicetype"], customerData.serviceType || customerData.packageType || "");
    updateCell(["packageservicedetails", "packagedetails"], customerData.packageDetails || customerData.packageType || "");
  }
  
  return { success: true, message: "ग्राहक का विवरण सफलतापूर्वक अपडेट हुआ!" };
}

/**
 * =========================================================================
 * 1-CLICK MIGRATION: REORDER SHEET COLUMNS TO CUSTOMER-FIRST STRUCTURE
 * Moves existing rows cleanly with zero data loss!
 * Removes Staff ID column.
 * Adds Google Sheets Data Validation dropdown on Staff Name.
 * =========================================================================
 */
function reorderSheetToCustomerFirst() {
  var ss = getSpreadsheet();
  
  // 1. Process "Daily Clean" Tab
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
  
  // 2. Process "All Other Work" Tab
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
  
  // 3. Apply Data Validation for Staff Name
  syncStaffDropdownValidation();
  
  return {
    success: true,
    message: "शीट्स सफलतापूर्वक कस्टमर-फर्स्ट क्रम में व्यवस्थित हो गईं! (Customer Name, Mob, Location, Photo, Address are now first columns)."
  };
}

/**
 * Applies header styling and freezes row 1
 */
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
 * =========================================================================
 */
var ADMIN_PASSWORD_PROP_KEY = "CWP_ADMIN_PASSWORD";
var DEFAULT_ADMIN_PASSWORD = "cwp2026";

function getAdminPassword() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(ADMIN_PASSWORD_PROP_KEY);
  if (saved && saved.toString().trim()) {
    return saved.toString().trim();
  }
  return DEFAULT_ADMIN_PASSWORD;
}

function verifyAdminPassword(inputPassword) {
  var current = getAdminPassword();
  var input = (inputPassword || "").toString().trim();
  if (input === current) {
    return { success: true, message: "प्रमाणित हुआ" };
  }
  return { success: false, error: "गलत एडमिन पासवर्ड। कृपया सही पासवर्ड दर्ज करें।" };
}

function updateAdminPassword(newPassword) {
  var p = (newPassword || "").toString().trim();
  if (!p || p.length < 4) {
    return { success: false, error: "पासवर्ड कम से कम 4 अक्षरों का होना चाहिए।" };
  }
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROP_KEY, p);
  return { success: true, message: "एडमिन पासवर्ड सफलतापूर्वक अपडेट हो गया!" };
}
