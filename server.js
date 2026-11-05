/**
 * =========================================================================
 * CWP Staff Information Viewer - Node.js Production Server for Railway
 * CWP Detailers & Motors
 *
 * Fully integrated with Google Apps Script Web App Backend & Live Google Sheets:
 * Spreadsheet ID: 1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY
 * =========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbyoDbQHE4LQgGOylM0IYatOCMiueKDVqeR8NdPAKj2hOt6fsp9Pb3B-lOxkRFaF8nUH/exec';

const DATA_FILE = path.join(__dirname, 'local_data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

function saveLocalData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local_data.json:', e);
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
    return res.end(JSON.stringify({ status: 'ok', service: 'cwp-staff-viewer', time: new Date().toISOString() }));
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

        // Forward to live Google Apps Script Web App
        let responseData;
        try {
          responseData = await forwardToGoogleAppsScript(payload);
        } catch (gasErr) {
          console.error('Apps Script forwarding failed, using fallback:', gasErr.message);
          // Local fallback handlers if GAS is momentarily unreachable
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
  console.log(`✔ Connected Google Apps Script URL:`);
  console.log(`  ${APPS_SCRIPT_URL}`);
  console.log(`=======================================================`);
});
