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

  // Serve static files (Code.gs, appsscript.json, etc.)
  if (pathname === '/Code.gs' || pathname === '/appsscript.json') {
    const filePath = path.join(__dirname, pathname);
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
          } else if (action === 'syncStaffDropdown') {
            responseData = { success: true, staffList: appState.staffList };
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

server.listen(PORT, () => {
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
