/**
 * =========================================================================
 * CWP Staff Information Viewer - Google Apps Script Backend
 * CWP Detailers & Motors
 *
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit
 * =========================================================================
 */

// Spreadsheet ID (Falls back to active sheet if bound to container)
var SPREADSHEET_ID = "1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY";
var DRIVE_FOLDER_NAME = "CWP_Customer_Photos";

/**
 * Serves the Web Application
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile("Index");
  
  // Extract staff query parameter if present: ?staff=STF01
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
 * Handle API POST requests (optional JSON API support)
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
    } else {
      result = { error: "Unknown action" };
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
 * STAFF MANAGEMENT (Stored in Script Properties to NOT touch Sheet Structure)
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
    // Return clean deduplicated list
    return deduplicateStaffList(list);
  }
  
  // If property was never set, run cleanAndSyncStaff to auto-discover unique staff from sheets
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
 * Deduplicate and standardize staff list and sheet assignments.
 * Ensures each unique staff name has ONE consistent Staff ID across all sheet rows.
 */
function cleanAndSyncStaff() {
  var ss = getSpreadsheet();
  var sheets = ["Daily Clean", "All Other Work"];
  var nameToStaff = {};
  var staffList = [];
  var idCounter = 1;

  // 1. Scan sheets and group by Staff Name (one Staff ID per person)
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    for (var r = 1; r < data.length; r++) {
      var currentId = (data[r][0] || "").toString().trim();
      var sName = (data[r][1] || "").toString().trim();
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

  // If no staff found in sheets, provide sample starter
  if (staffList.length === 0) {
    staffList = [{ id: "STF01", name: "Chandan Soni" }];
    nameToStaff["chandan soni"] = { id: "STF01", name: "Chandan Soni" };
  }

  // 2. Standardize Column A (Staff ID) in the sheets so all rows for that person share the SAME ID
  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    var idColUpdates = [];
    var changed = false;

    for (var r = 1; r < data.length; r++) {
      var currentId = (data[r][0] || "").toString().trim();
      var sName = (data[r][1] || "").toString().trim();
      var targetId = currentId;

      if (sName && nameToStaff[sName.toLowerCase()]) {
        targetId = nameToStaff[sName.toLowerCase()].id;
      }

      if (targetId !== currentId) {
        changed = true;
      }
      idColUpdates.push([targetId]);
    }

    if (changed && idColUpdates.length > 0) {
      sheet.getRange(2, 1, idColUpdates.length, 1).setValues(idColUpdates);
    }
  });

  // 3. Save clean unique staff list in Properties
  PropertiesService.getScriptProperties().setProperty("STAFF_LIST", JSON.stringify(staffList));
  return staffList;
}

/**
 * Scan sheets for any pre-existing staff (Legacy helper)
 */
function discoverStaffFromSheets() {
  return cleanAndSyncStaff();
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
  
  // If ID is not provided, generate a clean one like STF01, STF02...
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
  
  // Check if exists by name or ID
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
  
  // Save even if empty! Do NOT auto-repopulate.
  props.setProperty("STAFF_LIST", JSON.stringify(list));
  return { success: true, staffList: list };
}

/**
 * =========================================================================
 * STAFF READ-ONLY CUSTOMER DATA VIEWER
 * Restricted strictly to the requested staff member's active records
 * =========================================================================
 */
function getStaffCustomerData(requestedStaffId) {
  if (!requestedStaffId) {
    return { error: "No Staff ID provided.", staffId: "", staffName: "", dailyClean: [], allOtherWork: [] };
  }
  
  var targetId = requestedStaffId.toString().trim().toLowerCase();
  var ss = getSpreadsheet();
  
  // Find staff name
  var staffList = getStaffList();
  var foundStaff = staffList.find(function(s) {
    return s.id.toLowerCase() === targetId;
  });
  var staffName = foundStaff ? foundStaff.name : requestedStaffId;
  
  var dailyCleanList = [];
  var allOtherWorkList = [];
  
  // 1. Process "Daily Clean" tab
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dailyData = dailySheet.getDataRange().getValues();
    if (dailyData.length > 1) {
      for (var i = 1; i < dailyData.length; i++) {
        var row = dailyData[i];
        var rowStaffId = (row[0] || "").toString().trim().toLowerCase();
        var rowActive = (row[13] || "Yes").toString().trim().toLowerCase();
        
        var rowStaffName = (row[1] || "").toString().trim().toLowerCase();
        
        // Match Staff ID OR Staff Name (ensures staff sees their assigned customers even if sheet row has variant ID)
        var isMatch = (rowStaffId === targetId) || (foundStaff && rowStaffName === foundStaff.name.toLowerCase());
        
        if (isMatch && (rowActive === "yes" || rowActive === "true" || rowActive === "")) {
          if (!foundStaff && row[1]) {
            staffName = row[1];
          }
          
          dailyCleanList.push({
            staffId: row[0] || "",
            staffName: row[1] || "",
            customerName: row[2] || "",
            customerNumber: (row[3] || "").toString(),
            packageType: row[4] || "",
            packagesPurchased: row[5] || "1",
            vehicleNumbers: row[6] || "",
            photoUrl: row[7] || "",
            address: row[8] || "",
            googleMapsUrl: row[9] || "",
            secondaryAddress: row[10] || "",
            secondaryMapsUrl: row[11] || "",
            staffNotes: row[12] || "",
            active: row[13] || "Yes"
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
      for (var j = 1; j < otherData.length; j++) {
        var oRow = otherData[j];
        var oStaffId = (oRow[0] || "").toString().trim().toLowerCase();
        var oActive = (oRow[11] || "Yes").toString().trim().toLowerCase();
        
        var oStaffName = (oRow[1] || "").toString().trim().toLowerCase();
        var isMatchOther = (oStaffId === targetId) || (foundStaff && oStaffName === foundStaff.name.toLowerCase());
        
        if (isMatchOther && (oActive === "yes" || oActive === "true" || oActive === "")) {
          if (!foundStaff && oRow[1]) {
            staffName = oRow[1];
          }
          
          allOtherWorkList.push({
            staffId: oRow[0] || "",
            staffName: oRow[1] || "",
            serviceType: oRow[2] || "",
            customerName: oRow[3] || "",
            customerNumber: (oRow[4] || "").toString(),
            vehicleOrSite: oRow[5] || "",
            photoUrl: oRow[6] || "",
            address: oRow[7] || "",
            googleMapsUrl: oRow[8] || "",
            packageDetails: oRow[9] || "",
            staffNotes: oRow[10] || "",
            active: oRow[11] || "Yes"
          });
        }
      }
    }
  }
  
  return {
    staffId: requestedStaffId,
    staffName: staffName,
    dailyClean: dailyCleanList,
    allOtherWork: allOtherWorkList,
    totalCount: dailyCleanList.length + allOtherWorkList.length
  };
}

/**
 * =========================================================================
 * ADMIN: SAVE CUSTOMER & UPLOAD PHOTO
 * =========================================================================
 */
function saveCustomer(customerData) {
  if (!customerData) {
    throw new Error("No customer data provided.");
  }
  
  var ss = getSpreadsheet();
  var sheetName = customerData.category === "other" ? "All Other Work" : "Daily Clean";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error("Sheet '" + sheetName + "' was not found in the spreadsheet.");
  }
  
  // 1. Handle Photo Upload to Google Drive if photo data exists
  var photoUrl = (customerData.photoUrl || "").trim();
  var photoObj = customerData.photoFile || customerData.photoData;
  if (photoObj && photoObj.base64) {
    try {
      photoUrl = uploadPhotoToDrive(photoObj);
    } catch (e) {
      Logger.log("Drive upload failed: " + e.toString());
      // continue without blocking record save
    }
  }
  
  // 2. Prepare row according to EXACT sheet column specifications
  var newRow = [];
  
  if (sheetName === "Daily Clean") {
    // 14 Columns:
    // 1. Staff ID
    // 2. Staff Name
    // 3. Customer Name
    // 4. Customer Number
    // 5. Package Type
    // 6. Packages Purchased
    // 7. Vehicle Number(s) / Model(s)
    // 8. Customer / Vehicle Photo URL
    // 9. Address
    // 10. Google Maps URL
    // 11. Secondary Address (if any)
    // 12. Secondary Maps URL
    // 13. Staff Notes / Cleaning Instructions
    // 14. Active
    newRow = [
      customerData.staffId || "",
      customerData.staffName || "",
      customerData.customerName || "",
      customerData.customerNumber ? "'" + customerData.customerNumber : "",
      customerData.packageType || "",
      customerData.packagesPurchased || "1",
      customerData.vehicleNumbers || "",
      photoUrl,
      customerData.address || "",
      customerData.googleMapsUrl || "",
      customerData.secondaryAddress || "",
      customerData.secondaryMapsUrl || "",
      customerData.staffNotes || "",
      customerData.active || "Yes"
    ];
  } else {
    // All Other Work - 12 Columns:
    // 1. Staff ID
    // 2. Staff Name
    // 3. Service Type (Car Wash / Solar Cleaning)
    // 4. Customer Name
    // 5. Customer Number
    // 6. Vehicle Number / Site Name
    // 7. Vehicle / Site Photo URL
    // 8. Address
    // 9. Google Maps URL
    // 10. Package / Service Details
    // 11. Staff Notes / Special Instructions
    // 12. Active
    newRow = [
      customerData.staffId || "",
      customerData.staffName || "",
      customerData.serviceType || "",
      customerData.customerName || "",
      customerData.customerNumber ? "'" + customerData.customerNumber : "",
      customerData.vehicleOrSite || "",
      photoUrl,
      customerData.address || "",
      customerData.googleMapsUrl || "",
      customerData.packageDetails || "",
      customerData.staffNotes || "",
      customerData.active || "Yes"
    ];
  }
  
  sheet.appendRow(newRow);
  
  return {
    success: true,
    message: "Customer saved successfully to " + sheetName + "!",
    photoUrl: photoUrl
  };
}

/**
 * Uploads image directly to Google Drive folder and returns viewable URL
 */
function uploadPhotoToDrive(fileObj) {
  var folder;
  var folderIterator = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  
  if (folderIterator.hasNext()) {
    folder = folderIterator.next();
  } else {
    folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  }
  
  // Set folder public viewable for field staff access
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  
  var decoded = Utilities.base64Decode(fileObj.base64);
  var mimeType = fileObj.mimeType || "image/jpeg";
  var fileName = fileObj.fileName || ("cwp_photo_" + new Date().getTime() + ".jpg");
  
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  var file = folder.createFile(blob);
  
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  
  var fileId = file.getId();
  // Direct fast thumbnail / image URL from Google Drive
  return "https://lh3.googleusercontent.com/d/" + fileId;
}

/**
 * =========================================================================
 * ADMIN: GET ALL CUSTOMERS & TOGGLE STATUS
 * =========================================================================
 */
function getAllCustomersForAdmin() {
  var ss = getSpreadsheet();
  var records = [];
  
  // Daily Clean
  var dailySheet = ss.getSheetByName("Daily Clean");
  if (dailySheet) {
    var dData = dailySheet.getDataRange().getValues();
    for (var i = 1; i < dData.length; i++) {
      records.push({
        sheetName: "Daily Clean",
        rowIndex: i + 1,
        staffId: dData[i][0],
        staffName: dData[i][1],
        customerName: dData[i][2],
        customerNumber: dData[i][3],
        vehicle: dData[i][6],
        address: dData[i][8],
        notes: dData[i][12],
        active: (dData[i][13] || "Yes").toString()
      });
    }
  }
  
  // All Other Work
  var otherSheet = ss.getSheetByName("All Other Work");
  if (otherSheet) {
    var oData = otherSheet.getDataRange().getValues();
    for (var j = 1; j < oData.length; j++) {
      records.push({
        sheetName: "All Other Work",
        rowIndex: j + 1,
        staffId: oData[j][0],
        staffName: oData[j][1],
        customerName: oData[j][3],
        customerNumber: oData[j][4],
        vehicle: oData[j][5],
        address: oData[j][7],
        notes: oData[j][10],
        active: (oData[j][11] || "Yes").toString()
      });
    }
  }
  
  return records;
}

function toggleCustomerActive(sheetName, rowIndex, currentStatus) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found");
  
  var colIndex = sheetName === "Daily Clean" ? 14 : 12;
  var newStatus = (currentStatus || "").toString().toLowerCase() === "yes" ? "No" : "Yes";
  sheet.getRange(rowIndex, colIndex).setValue(newStatus);
  return { success: true, newStatus: newStatus };
}
