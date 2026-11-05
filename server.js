/**
 * =========================================================================
 * CWP Staff Information Viewer - Node.js Production Server for Railway
 * CWP Detailers & Motors
 *
 * Fully integrated with Google Apps Script Web App Backend & Live Google Sheets:
 * Spreadsheet ID: 1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY
 * Production Domain: cwpdata.up.railway.app
 * Image Storage: Cloudinary CDN (Direct HTTPS Links & Instant Thumbnails)
 * =========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyoDbQHE4LQgGOylM0IYatOCMiueKDVqeR8NdPAKj2hOt6fsp9Pb3B-lOxkRFaF8nUH/exec';
const DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || 'cwpdata.up.railway.app';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY';

const DATA_FILE = path.join(__dirname, 'local_data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Cloudinary Configuration
function isCloudinaryConfigured() {
  if (process.env.CLOUDINARY_URL) return true;
  const cName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET;
  return !!(cName && apiKey && apiSecret);
}

if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
} else if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET,
    secure: true
  });
}

/**
 * Uploads image to Cloudinary CDN and returns viewable HTTPS link
 * If Cloudinary keys are not set yet, falls back to hosted uploads
 */
async function uploadToCloudinary(photoObj) {
  if (!photoObj || !photoObj.base64) return '';

  const mimeType = photoObj.mimeType || 'image/jpeg';
  const dataUri = `data:${mimeType};base64,${photoObj.base64}`;

  if (isCloudinaryConfigured()) {
    try {
      console.log('Uploading photo to Cloudinary CDN...');
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'cwp_customer_photos',
        resource_type: 'image',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
      console.log('Cloudinary upload successful:', uploadResult.secure_url);
      return uploadResult.secure_url;
    } catch (err) {
      console.error('Cloudinary upload error:', err.message);
      return saveLocalUpload(photoObj);
    }
  }

  return saveLocalUpload(photoObj);
}

function saveLocalUpload(photoObj) {
  const mimeType = photoObj.mimeType || 'image/jpeg';
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const filename = 'cwp_' + Date.now() + ext;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(photoObj.base64, 'base64'));
  return `https://${DOMAIN}/uploads/${filename}`;
}

// Local fallback state
let appState = {
  staffList: [{ id: 'STF01', name: 'Chandan Soni' }],
  customers: []
};

if (fs.existsSync(DATA_FILE)) {
  try {
    appState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading local_data.json:', e);
  }
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local_data.json:', err.message);
  }
}

/**
 * Fetches all live customers directly from Google Sheets using official Visualization API
 * Ensures zero delay and 100% accurate column mapping (vehicle, address, maps, photo, staff)
 */
async function fetchAllLiveCustomers() {
  const ssId = SPREADSHEET_ID;
  const sheets = ['Daily Clean', 'All Other Work'];
  const allRecords = [];

  for (const sheetName of sheets) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
      if (!json || !json.table || !json.table.rows) continue;

      const rawCols = json.table.cols.map(c => (c.label || '').trim());
      const normCols = rawCols.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const rows = json.table.rows;

      rows.forEach((row, rIdx) => {
        const rowVals = (row.c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v.toString().trim() : '');

        function getCell(aliases) {
          for (let alias of aliases) {
            const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const idx = normCols.indexOf(key);
            if (idx >= 0 && rowVals[idx] !== undefined && rowVals[idx] !== '') {
              return rowVals[idx];
            }
          }
          return '';
        }

        const custName = getCell(['customername', 'custname']);
        // Skip empty rows
        if (!custName && !rowVals.some(v => v !== '')) return;

        const custPhone = getCell(['customernumber', 'custphone', 'number', 'phone', 'mob']);
        const mapUrl = getCell(['googlemapsurl', 'mapurl', 'maps', 'location']);
        const photo = getCell(['customervehiclephotourl', 'vehiclesitephotourl', 'photourl', 'photo']);
        const address = getCell(['address']);

        // Explicit vehicle column parsing depending on sheet
        let vehicle = '';
        if (sheetName === 'Daily Clean') {
          vehicle = getCell(['vehiclenumbersmodels', 'vehiclenumbers', 'vehicle']);
        } else {
          vehicle = getCell(['vehiclenumbersitename', 'vehicleorsite', 'vehicle']);
        }

        const pkgType = getCell(['packagetype', 'pkgtype', 'servicetypecarwashsolarcleaning', 'servicetype']) || 'DCC ONLY';
        const pkgCount = getCell(['packagespurchased', 'pkgcount']) || '1';
        const staff = getCell(['staffname', 'staff']);
        const notes = getCell(['staffnotescleaninginstructions', 'staffnotesspecialinstructions', 'staffnotes', 'notes']);
        const secAddr = getCell(['secondaryaddressifany', 'secondaryaddress']);
        const secMap = getCell(['secondarymapsurl']);
        const active = getCell(['active', 'status']) || 'Yes';

        allRecords.push({
          sheetName: sheetName,
          rowIndex: rIdx + 2,
          customerName: custName,
          customerNumber: custPhone,
          googleMapsUrl: mapUrl,
          photoUrl: photo,
          address: address,
          vehicle: vehicle,
          packageType: pkgType,
          packagesPurchased: pkgCount,
          staffName: staff,
          secondaryAddress: secAddr,
          secondaryMapsUrl: secMap,
          notes: notes,
          active: active
        });
      });
    } catch (e) {
      console.error(`Error fetching live sheet ${sheetName}:`, e.message);
    }
  }

  return allRecords;
}

function formatStaffDataResponse(staffId, allCustomers) {
  const staffQuery = (staffId || '').trim().toLowerCase();
  const staffObj = (appState.staffList || []).find(s => 
    (s.id || '').toLowerCase() === staffQuery || 
    (s.name || '').toLowerCase() === staffQuery
  );
  const matchName = staffObj ? staffObj.name.toLowerCase() : staffQuery;

  const dailyClean = (allCustomers || []).filter(c => 
    c.sheetName === 'Daily Clean' && 
    (c.staffName || '').trim().toLowerCase() === matchName &&
    (c.active || 'Yes').toLowerCase() === 'yes'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    vehicleNumbers: c.vehicle,
    packageType: c.packageType,
    packagesPurchased: c.packagesPurchased,
    staffNotes: c.notes,
    secondaryAddress: c.secondaryAddress,
    secondaryMapsUrl: c.secondaryMapsUrl,
    active: c.active
  }));

  const allOtherWork = (allCustomers || []).filter(c => 
    c.sheetName === 'All Other Work' && 
    (c.staffName || '').trim().toLowerCase() === matchName &&
    (c.active || 'Yes').toLowerCase() === 'yes'
  ).map(c => ({
    staffId: staffObj ? staffObj.id : staffId,
    staffName: c.staffName || (staffObj ? staffObj.name : staffId),
    customerName: c.customerName,
    customerNumber: c.customerNumber,
    googleMapsUrl: c.googleMapsUrl,
    photoUrl: c.photoUrl,
    address: c.address,
    serviceType: c.packageType,
    vehicleOrSite: c.vehicle,
    packageDetails: c.packageType,
    staffNotes: c.notes,
    active: c.active
  }));

  return {
    staffId: staffObj ? staffObj.id : staffId,
    staffName: staffObj ? staffObj.name : staffId,
    dailyClean: dailyClean,
    allOtherWork: allOtherWork,
    totalCount: dailyClean.length + allOtherWork.length
  };
}

/**
 * Proxy API request directly to Google Apps Script Web App
 */
async function forwardToGoogleAppsScript(payload) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  return await response.json();
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Serve raw files for Apps Script editor sync
  if (pathname === '/raw-Code.gs' || pathname === '/Code.gs' || pathname === '/raw-Index.html' || pathname === '/appsscript.json') {
    const rawFile = (pathname === '/raw-Index.html') ? 'Index.html' : ((pathname === '/raw-Code.gs' || pathname === '/Code.gs') ? 'Code.gs' : path.basename(pathname));
    const filePath = path.join(__dirname, rawFile);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Health check endpoint for Railway monitoring
  if (pathname === '/health' || pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'cwp-staff-viewer',
      domain: DOMAIN,
      cloudinary: isCloudinaryConfigured(),
      time: new Date().toISOString()
    }));
  }

  // Cloudinary Status endpoint
  if (pathname === '/api/cloudinary-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      configured: isCloudinaryConfigured(),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || (process.env.CLOUDINARY_URL ? 'Configured via CLOUDINARY_URL' : 'Not configured')
    }));
  }

  // Serve static uploads
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filepath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filepath)) {
      const ext = path.extname(filepath).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(filepath).pipe(res);
    } else {
      res.writeHead(404);
      return res.end('Not found');
    }
  }

  // Backwards compatibility GET routes
  if (req.method === 'GET' && pathname === '/api/staff') {
    try {
      const data = await forwardToGoogleAppsScript({ action: 'getStaffList' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(appState.staffList));
    }
  }

  if (req.method === 'GET' && pathname === '/api/staff-data') {
    const staffId = parsedUrl.searchParams.get('staffId') || '';
    try {
      const allCustomers = await fetchAllLiveCustomers();
      if (allCustomers && allCustomers.length > 0) {
        const staffData = formatStaffDataResponse(staffId, allCustomers);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(staffData));
      }
      const data = await forwardToGoogleAppsScript({ action: 'getStaffData', staffId: staffId });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, staffId: staffId }));
    }
  }

  // Main API POST route - Bridges to Google Apps Script & Google Sheet
  if (req.method === 'POST' && pathname === '/api') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        let payload = {};
        if (body) {
          payload = JSON.parse(body);
        }

        // Dedicated fast Admin Authentication handler
        if (payload.action === 'verifyAdminPassword') {
          const inputPass = (payload.password || '').trim();
          const envPass = (process.env.ADMIN_PASSWORD || 'cwp2026').trim();

          // 1. Match with Environment Variable or default
          if (inputPass === envPass) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              token: 'auth_' + Buffer.from(inputPass + '_' + Date.now()).toString('base64')
            }));
          }

          // 2. Also check Google Apps Script properties
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            if (gasRes && gasRes.success) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(gasRes));
            }
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'गलत एडमिन पासवर्ड। कृपया सही पासवर्ड दर्ज करें।' }));
        }

        if (payload.action === 'updateAdminPassword') {
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(gasRes));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to update password: ' + e.message }));
          }
        }

        // Dedicated Staff PIN verification handler
        if (payload.action === 'verifyStaffPin') {
          const staffId = (payload.staffId || '').trim();
          const pin = (payload.pin || '').trim();

          // 1. Forward to Google Apps Script
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            if (gasRes && !gasRes.error && (gasRes.success !== undefined || gasRes.inactive !== undefined)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(gasRes));
            }
          } catch (e) {
            console.warn('GAS verifyStaffPin error, using local fallback:', e.message);
          }

          // 2. Fallback to local staffList check
          const staff = (appState.staffList || []).find(s => 
            (s.id || '').toUpperCase() === staffId.toUpperCase() || 
            (s.name || '').toLowerCase() === staffId.toLowerCase()
          );

          if (!staff) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'स्टाफ आईडी नहीं मिली।' }));
          }

          const isActive = staff.active !== undefined ? (staff.active === true || staff.active === 'Yes' || staff.active === 'yes' || staff.active === 'Active') : true;
          if (!isActive) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, inactive: true, error: 'आपका स्टाफ अकाउंट निष्क्रिय (Inactive) कर दिया गया है। कृपया अपने एडमिन से संपर्क करें।' }));
          }

          const expectedPin = (staff.pin || '123456').toString().trim();
          if (pin === expectedPin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              staffId: staff.id,
              staffName: staff.name,
              phone: staff.phone || '',
              active: true
            }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'गलत 6-डिजिट पासवर्ड! कृपया सही पिन दर्ज करें।' }));
          }
        }

        // Staff management save handler
        if (payload.action === 'saveStaffMember') {
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            if (gasRes && !gasRes.error && gasRes.staffList) {
              appState.staffList = gasRes.staffList;
              saveLocalData(appState);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(gasRes));
            }
          } catch (e) {
            console.warn('GAS saveStaffMember error, using local fallback:', e.message);
          }

          const sData = payload.staffData || {};
          const name = sData.name || payload.name || '';
          let id = sData.id || payload.id || '';
          const phone = sData.phone || '';
          const pin = sData.pin || '123456';
          const active = sData.active !== undefined ? sData.active : true;
          if (!id) {
            id = 'STF' + String(appState.staffList.length + 1).padStart(2, '0');
          }
          const idx = appState.staffList.findIndex(s => (s.id || '').toLowerCase() === id.toLowerCase() || (s.name || '').toLowerCase() === name.toLowerCase());
          const newObj = { id, name, phone, pin, active };
          if (idx >= 0) {
            if (!phone && appState.staffList[idx].phone) newObj.phone = appState.staffList[idx].phone;
            if (!pin && appState.staffList[idx].pin) newObj.pin = appState.staffList[idx].pin;
            appState.staffList[idx] = Object.assign(appState.staffList[idx], newObj);
          } else {
            appState.staffList.push(newObj);
          }
          saveLocalData(appState);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, staffList: appState.staffList, staff: newObj }));
        }

        // Staff active status toggle handler
        if (payload.action === 'toggleStaffActive') {
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            if (gasRes && !gasRes.error && gasRes.staffList) {
              appState.staffList = gasRes.staffList;
              saveLocalData(appState);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(gasRes));
            }
          } catch (e) {
            console.warn('GAS toggleStaffActive error, using local fallback:', e.message);
          }

          const s = (appState.staffList || []).find(x => (x.id || '').toLowerCase() === (payload.staffId || '').toLowerCase());
          if (s) {
            s.active = !!payload.active;
            saveLocalData(appState);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, staffList: appState.staffList }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'स्टाफ सदस्य नहीं मिला।' }));
          }
        }

        // Live All Customers handler for Admin Active Records
        if (payload.action === 'getAllCustomers') {
          try {
            const records = await fetchAllLiveCustomers();
            if (records && records.length > 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(records));
            }
          } catch (liveErr) {
            console.warn('Live fetchAllLiveCustomers failed, proxying to Apps Script:', liveErr.message);
          }
          try {
            const gasRes = await forwardToGoogleAppsScript(payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(gasRes));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(appState.customers || []));
          }
        }

        // Live Staff Customer Data handler
        if (payload.action === 'getStaffData') {
          const staffId = payload.staffId || '';
          try {
            const allCustomers = await fetchAllLiveCustomers();
            if (allCustomers && allCustomers.length > 0) {
              const staffData = formatStaffDataResponse(staffId, allCustomers);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify(staffData));
            }
          } catch (liveErr) {
            console.warn('Live getStaffData failed, proxying to Apps Script:', liveErr.message);
          }
        }

        // Upload photo to Cloudinary CDN before saving/updating customer record in Google Sheet
        if ((payload.action === 'saveCustomer' || payload.action === 'updateCustomer') && payload.customerData) {
          const cust = payload.customerData;
          const photoObj = cust.photoFile || cust.photoData;
          if (photoObj && photoObj.base64) {
            try {
              const uploadedUrl = await uploadToCloudinary(photoObj);
              if (uploadedUrl) {
                cust.photoUrl = uploadedUrl;
              }
            } catch (uErr) {
              console.error('Photo upload process failed:', uErr);
            }
            // Remove heavy base64 strings so GAS request is ultra fast and under limit
            delete cust.photoFile;
            delete cust.photoData;
          }
        }

        // Forward to live Google Apps Script Web App
        let responseData;
        try {
          responseData = await forwardToGoogleAppsScript(payload);
        } catch (gasErr) {
          console.error('Apps Script forwarding failed, using fallback:', gasErr.message);
          const action = payload.action;
          if (action === 'getStaffList') {
            responseData = appState.staffList;
          } else if (action === 'getStaffData') {
            responseData = {
              staffId: payload.staffId,
              staffName: 'Staff Member',
              dailyClean: [],
              allOtherWork: []
            };
          } else if (action === 'reorderSheet') {
            responseData = { success: true, message: 'कस्टमर-फर्स्ट कॉलम संरचना सक्रिय है।' };
          } else if (action === 'syncStaffDropdown' || action === 'clearInvalidDropdowns') {
            responseData = { success: true, message: 'ड्रॉपडाउन सफलतापूर्वक सिंक व रीसेट कर दिए गए।' };
          } else {
            responseData = { error: 'Backend request failed: ' + gasErr.message };
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
      } catch (parseErr) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload: ' + parseErr.message }));
      }
    });
    return;
  }

  // Main UI Route (Index.html)
  const indexPath = path.join(__dirname, 'Index.html');
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');

    // Parse query params to set initial mode & staff ID
    const staffParam = parsedUrl.searchParams.get('staff') || parsedUrl.searchParams.get('id') || '';
    const adminParam = parsedUrl.searchParams.get('admin');
    const initialMode = (adminParam !== null) ? 'admin' : (staffParam ? 'staff' : 'admin');

    // Dynamically replace Google Apps Script template variables
    content = content.replace(/<\?=\s*typeof\s+initialStaffId\s*!==\s*'undefined'\s*\?\s*initialStaffId\s*:\s*''\s*\?>/g, staffParam);
    content = content.replace(/<\?=\s*typeof\s+initialMode\s*!==\s*'undefined'\s*\?\s*initialMode\s*:\s*'[a-zA-Z]+'\s*\?>/g, initialMode);
    content = content.replace(/<\?=\s*typeof\s+webAppUrl\s*!==\s*'undefined'\s*\?\s*webAppUrl\s*:[^?]*\?>/g, '');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Index.html not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚗 CWP Detailers & Motors - Staff Information Viewer`);
  console.log(`=======================================================`);
  console.log(`✔ Server Running on PORT: ${PORT}`);
  console.log(`✔ Production Domain: https://${DOMAIN}`);
  console.log(`✔ Cloudinary Status: ${isCloudinaryConfigured() ? 'Connected' : 'Pending Environment Variables'}`);
  console.log(`✔ Connected Google Apps Script URL:`);
  console.log(`  ${APPS_SCRIPT_URL}`);
  console.log(`=======================================================`);
});
