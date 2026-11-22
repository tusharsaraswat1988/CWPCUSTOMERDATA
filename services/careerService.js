/**
 * CWP Detailers & Motors - Career & Recruitment Service
 * Processes job applications and manages applicant records
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/index');
const repos = require('../db/repositories/index');

const LOCAL_APPS_FILE = path.resolve(__dirname, '../data/job_applications.json');
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function loadLocalApplications() {
  try {
    if (fs.existsSync(LOCAL_APPS_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_APPS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[CareerService] Local file read warning:', e.message);
  }
  return [];
}

function saveLocalApplications(apps) {
  try {
    const dir = path.dirname(LOCAL_APPS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_APPS_FILE, JSON.stringify(apps, null, 2), 'utf8');
  } catch (e) {
    console.warn('[CareerService] Local file save warning:', e.message);
  }
}

async function submitJobApplication(payload, fileData = null) {
  const { name, mobile, age, gender, city, email, remark } = payload;

  if (!name || !String(name).trim()) {
    throw new Error('Name is required');
  }
  if (!mobile || !String(mobile).trim()) {
    throw new Error('Mobile number is required');
  }

  const cleanPhone = String(mobile).replace(/\D/g, '').slice(-10);
  if (cleanPhone.length < 10) {
    throw new Error('Please enter a valid 10-digit mobile number');
  }

  let resumeUrl = null;
  let resumeFilename = null;

  // Save uploaded file if provided
  if (fileData && fileData.base64 && fileData.filename) {
    const ext = path.extname(fileData.filename).toLowerCase() || '.bin';
    const safeName = `resume_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(targetPath, Buffer.from(fileData.base64, 'base64'));
    resumeUrl = `/uploads/${safeName}`;
    resumeFilename = fileData.filename;
  } else if (fileData && fileData.buffer && fileData.filename) {
    const ext = path.extname(fileData.filename).toLowerCase() || '.bin';
    const safeName = `resume_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(targetPath, fileData.buffer);
    resumeUrl = `/uploads/${safeName}`;
    resumeFilename = fileData.filename;
  }

  const applicationData = {
    name: String(name).trim(),
    mobile: cleanPhone,
    age: age ? parseInt(age, 10) || null : null,
    gender: gender ? String(gender).trim() : null,
    city: city ? String(city).trim() : 'Varanasi',
    email: email ? String(email).trim().toLowerCase() : null,
    resumeUrl,
    resumeFilename,
    remark: remark ? String(remark).trim() : null
  };

  // 1. Try Neon Database
  if (db.isConfigured()) {
    try {
      const saved = await repos.jobApplications.createJobApplication(applicationData);
      return saved;
    } catch (err) {
      console.warn('[CareerService] DB save error, falling back to local file:', err.message);
    }
  }

  // 2. Local fallback
  const localApps = loadLocalApplications();
  const newApp = {
    id: localApps.length + 1,
    ...applicationData,
    status: 'new',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  localApps.unshift(newApp);
  saveLocalApplications(localApps);
  return newApp;
}

async function getJobApplications(status = null) {
  if (db.isConfigured()) {
    try {
      return await repos.jobApplications.listJobApplications({ status });
    } catch (err) {
      console.warn('[CareerService] DB list error, using local file:', err.message);
    }
  }
  const apps = loadLocalApplications();
  if (status) {
    return apps.filter(a => a.status === status);
  }
  return apps;
}

module.exports = {
  submitJobApplication,
  getJobApplications
};
