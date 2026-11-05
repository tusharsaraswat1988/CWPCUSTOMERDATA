/**
 * Local preview and test server for CWP Staff Information Viewer
 * Zero external npm dependencies required (uses Node.js built-in http, fs, path, url)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'local_data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initial state if local_data.json doesn't exist
let appState = {
  staffList: [
    { id: 'STF01', name: 'Ramesh Kumar' },
    { id: 'STF02', name: 'Suresh Sharma' }
  ],
  customers: [
    {
      sheetName: 'Daily Clean',
      rowIndex: 2,
      staffId: 'STF01',
      staffName: 'Ramesh Kumar',
      customerName: 'Anand Verma',
      customerNumber: '9876543210',
      packageType: 'Daily Clean',
      packagesPurchased: '1',
      vehicleNumbers: 'UP65 AB 1234 - Creta (Aaj) / UP65 CD 5678 - Amaze (Kal)',
      photoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
      address: 'Flat 402, Tower B, Mahagun Moderne, Sector 78, Noida',
      googleMapsUrl: 'https://maps.google.com/?q=28.5800,77.3800',
      secondaryAddress: 'Basement -2 Pillar 42',
      secondaryMapsUrl: '',
      staffNotes: '1 package hai. Dono cars alternate day clean karni hain. Aaj Creta, kal Amaze.',
      active: 'Yes'
    },
    {
      sheetName: 'Daily Clean',
      rowIndex: 3,
      staffId: 'STF01',
      staffName: 'Ramesh Kumar',
      customerName: 'Dr. Priya Saxena',
      customerNumber: '9812345678',
      packageType: 'Ceramic Maintenance',
      packagesPurchased: '1',
      vehicleNumbers: 'DL01 XY 7788 - Fortuner',
      photoUrl: '',
      address: 'Villa 14, Lotus Boulevard, Sector 100, Noida',
      googleMapsUrl: 'https://maps.google.com/?q=28.5355,77.3910',
      secondaryAddress: '',
      secondaryMapsUrl: '',
      staffNotes: 'Use micro-fiber towel only. Do not wash inside the garage.',
      active: 'Yes'
    },
    {
      sheetName: 'All Other Work',
      rowIndex: 2,
      staffId: 'STF02',
      staffName: 'Suresh Sharma',
      serviceType: 'Solar Cleaning',
      customerName: 'Vikram Singhania',
      customerNumber: '9988776655',
      vehicleOrSite: 'Singhania Residency Rooftop Solar (15kW)',
      photoUrl: '',
      address: 'Plot 45, Sector 50, Noida',
      googleMapsUrl: 'https://maps.google.com/?q=28.5700,77.3600',
      packageDetails: '36 High-efficiency panels cleaning with deionized water',
      staffNotes: 'Wear safety harness. Water supply on 3rd floor terrace.',
      active: 'Yes'
    }
  ]
};

// Load saved data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    appState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading local_data.json:', e);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf8');
}

const server = http.createServer((req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Serve static files (Code.gs, Index.html, appsscript.json)
  if (pathname === '/Code.gs' || pathname === '/Index.html' || pathname === '/appsscript.json') {
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }
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

  // API Router
  if (pathname === '/api' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const action = payload.action;
        let response = {};

        if (action === 'getStaffList') {
          response = appState.staffList;
        } else if (action === 'cleanAndSyncStaff') {
          const map = {};
          const list = [];
          appState.customers.forEach(c => {
            const name = (c.staffName || '').trim();
            if (name && !map[name.toLowerCase()]) {
              const id = 'STF0' + (list.length + 1);
              map[name.toLowerCase()] = id;
              list.push({ id, name });
            }
          });
          if (list.length > 0) {
            appState.staffList = list;
            appState.customers.forEach(c => {
              if (c.staffName && map[c.staffName.trim().toLowerCase()]) {
                c.staffId = map[c.staffName.trim().toLowerCase()];
              }
            });
            saveData();
          }
          response = appState.staffList;
        } else if (action === 'saveStaffMember') {
          let id = (payload.id || '').trim();
          const name = (payload.name || '').trim();
          if (!id) {
            id = 'STF0' + (appState.staffList.length + 1);
          }
          const existing = appState.staffList.find(s => s.id.toLowerCase() === id.toLowerCase());
          if (existing) {
            existing.name = name;
          } else {
            appState.staffList.push({ id, name });
          }
          saveData();
          response = { success: true, staffList: appState.staffList };
        } else if (action === 'deleteStaffMember') {
          const id = (payload.id || '').trim().toLowerCase();
          appState.staffList = appState.staffList.filter(s => s.id.toLowerCase() !== id);
          saveData();
          response = { success: true, staffList: appState.staffList };
        } else if (action === 'getStaffData') {
          const targetId = (payload.staffId || '').trim().toLowerCase();
          const staffObj = appState.staffList.find(s => s.id.toLowerCase() === targetId);
          const staffName = staffObj ? staffObj.name : payload.staffId;

          const dailyClean = appState.customers.filter(c => 
            (c.staffId || '').toLowerCase() === targetId &&
            c.sheetName === 'Daily Clean' &&
            (c.active || 'Yes').toLowerCase() === 'yes'
          );

          const allOtherWork = appState.customers.filter(c => 
            (c.staffId || '').toLowerCase() === targetId &&
            c.sheetName === 'All Other Work' &&
            (c.active || 'Yes').toLowerCase() === 'yes'
          );

          response = {
            staffId: payload.staffId,
            staffName: staffName,
            dailyClean: dailyClean,
            allOtherWork: allOtherWork
          };
        } else if (action === 'saveCustomer') {
          let photoUrl = (payload.photoUrl || '').trim();

          // Handle base64 photo
          if (payload.photoFile && payload.photoFile.base64) {
            const ext = payload.photoFile.mimeType === 'image/png' ? '.png' : '.jpg';
            const filename = 'photo_' + Date.now() + ext;
            const filepath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, Buffer.from(payload.photoFile.base64, 'base64'));
            photoUrl = '/uploads/' + filename;
          }

          const isDaily = payload.category === 'daily';
          const newCust = {
            sheetName: isDaily ? 'Daily Clean' : 'All Other Work',
            rowIndex: appState.customers.length + 2,
            staffId: payload.staffId,
            staffName: payload.staffName,
            customerName: payload.customerName,
            customerNumber: payload.customerNumber,
            photoUrl: photoUrl,
            active: payload.active || 'Yes',
            address: payload.address,
            googleMapsUrl: payload.googleMapsUrl,
            staffNotes: payload.staffNotes
          };

          if (isDaily) {
            newCust.packageType = payload.packageType;
            newCust.packagesPurchased = payload.packagesPurchased;
            newCust.vehicleNumbers = payload.vehicleNumbers;
            newCust.secondaryAddress = payload.secondaryAddress;
            newCust.secondaryMapsUrl = payload.secondaryMapsUrl;
          } else {
            newCust.serviceType = payload.serviceType;
            newCust.vehicleOrSite = payload.vehicleOrSite;
            newCust.packageDetails = payload.packageDetails;
          }

          appState.customers.push(newCust);
          saveData();
          response = { success: true, message: 'Saved successfully', photoUrl };
        } else if (action === 'getAllCustomers') {
          response = appState.customers;
        } else if (action === 'toggleCustomerActive') {
          const cust = appState.customers.find(c => c.sheetName === payload.sheetName && c.rowIndex === payload.rowIndex);
          if (cust) {
            cust.active = cust.active === 'Yes' ? 'No' : 'Yes';
            saveData();
            response = { success: true, newStatus: cust.active };
          } else {
            response = { error: 'Record not found' };
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Deployment Guide Route
  if (pathname === '/deploy' || pathname === '/guide') {
    const guidePath = path.join(__dirname, 'deploy_guide.html');
    if (fs.existsSync(guidePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(guidePath).pipe(res);
    }
  }

  // Main UI Route (Index.html)
  const indexPath = path.join(__dirname, 'Index.html');
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');

    // Replace GAS template tags with values for local preview
    const staffParam = parsedUrl.query.staff || parsedUrl.query.id || '';
    const adminParam = parsedUrl.query.admin || '';
    const initialMode = adminParam ? 'admin' : (staffParam ? 'staff' : 'admin');

    content = content.replace("<?= typeof initialStaffId !== 'undefined' ? initialStaffId : '' ?>", staffParam);
    content = content.replace("<?= typeof initialMode !== 'undefined' ? initialMode : 'staff' ?>", initialMode);
    content = content.replace("<?= typeof webAppUrl !== 'undefined' ? webAppUrl : window.location.origin + window.location.pathname ?>", `http://localhost:${PORT}`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
  }

  res.writeHead(404);
  res.end('Index.html not found');
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚗 CWP Detailers & Motors - Staff Information Viewer`);
  console.log(`=======================================================`);
  console.log(`\x1b[32m✔ Local Server Running at:\x1b[0m http://localhost:${PORT}`);
  console.log(`\x1b[36m👉 Staff Viewer Link:\x1b[0m      http://localhost:${PORT}?staff=STF01`);
  console.log(`\x1b[33m👉 Admin Portal Link:\x1b[0m      http://localhost:${PORT}?admin=1`);
  console.log(`\x1b[35m👉 Deployment Guide:\x1b[0m       http://localhost:${PORT}/deploy`);
  console.log(`=======================================================`);
});
