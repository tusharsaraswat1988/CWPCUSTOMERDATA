# CWP Data App & Staff Portal — CWP Detailers & Motors

A high-performance, mobile-first Customer Data and Staff Operations Management System built for **CWP Detailers & Motors**, powered exclusively by **Neon PostgreSQL** and deployed on **Railway**.

**Production URL:** [https://cwpdata.up.railway.app](https://cwpdata.up.railway.app)  
**Database:** Neon PostgreSQL (`cwp_customer_db`)  

---

## 🎯 Architecture & Overview

The CWP Data App is an enterprise-grade operational application completely decoupled from external spreadsheets and third-party script engines. All customer, staff, route sequence, subscription, and service records are persistently managed within Neon PostgreSQL using strict relational constraints, compound foreign keys, and immutable audit logs.

### Key Highlights:
- **Neon PostgreSQL Exclusive Backend**: Zero runtime linkages, dependencies, or fallbacks to Google Sheets or Google Apps Script (`Code.gs`).
- **Strict Staff Data Isolation**: Staff members authenticate with a 6-digit PIN and receive access exclusively to their assigned customers and active routes.
- **Route Sequence Management**: Admin-configurable customer route ordering with one-tap reset to default sequence.
- **Aaj / Kal Alternate Day Cleaning Rotation**: Built-in vehicle rotation display for single packages serving multiple cars.
- **Offline Mutation Queue**: Field staff can mark daily completions offline; mutations are stored locally with client UUIDs and synchronized automatically upon reconnect with IST date preservation.
- **Cloudinary Image CDN**: Vehicle and site photos are stored in Cloudinary CDN with optimized mobile thumbnails and full lightbox preview.

---

## 📱 Portals & Features

### 1. Staff Operations Portal (`/staff` or `?staff=STAFF_ID`)
- **Secure Authentication**: 6-digit PIN login with automatic scrypt password hashing and rate-limited brute force protection.
- **Assigned Route & Customer Cards**: Only displays records assigned to the logged-in staff member.
- **One-Tap Calling**: Direct phone call via native `tel:` protocol.
- **One-Tap GPS Navigation**: Launches step-by-step navigation directly in Google Maps.
- **License Plate Badges**: Indian license plate visual styling for quick vehicle identification.
- **Alternate Day Rotation Alert**: Visual badge for Aaj/Kal vehicle rotation rules.
- **Cleaning Notes Callout**: Prominent instructions banner for staff.
- **Vehicle Photo Lightbox**: Tap-to-zoom vehicle and site photos.
- **Daily Cleaning Checklist**: Live checkmarks with offline caching and automatic midnight IST reset.

### 2. Admin Dashboard (`/admin` or `?admin=1`)
- **Master Authentication**: Secure admin password gate with 12-hour session issuance.
- **Customer Management**:
  - Full CRUD operations (Create, Read, Update, and Soft-Delete).
  - Service categorization: **Daily Car Cleaning**, **Car Washing**, and **Solar Panel Cleaning**.
  - Multi-vehicle and multi-location management per customer.
  - Indian mobile number validation and normalization.
  - GPS coordinate capture and map pin generation.
- **Staff Management**:
  - Staff creation, phone number management, and PIN reset.
  - Active/Inactive staff access toggle with immediate session revocation.
  - Unassigned customer pool management.
- **Route Sequencing**:
  - Drag-and-drop / reorder customer stops for staff routes.
  - One-click reset to default route order.
- **Immutable Audit Logging**:
  - Full audit trail recording all admin mutations with actor identity and timestamps.

---

## ⚙️ Environment Configuration

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Runtime environment | `production` |
| `DATABASE_URL` | Neon PostgreSQL pooled connection string | `postgresql://user:pass@ep-...neon.tech/cwp_customer_db?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Neon PostgreSQL direct connection string | Optional (used for direct migrations/DDL) |
| `DB_PROVIDER` | Backend database provider | `neon_postgresql` |
| `ADMIN_PASSWORD` | Master administrator password | Required for admin access |
| `CLOUDINARY_URL` | Cloudinary CDN connection URL | `cloudinary://api_key:api_secret@cloud_name` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud identifier | Optional if `CLOUDINARY_URL` is set |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Optional if `CLOUDINARY_URL` is set |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Optional if `CLOUDINARY_URL` is set |

---

## 💻 Local Development

```bash
# Start local dev server (default port 3005 defined in .env)
npm run dev
# or
npm start

# If port 3005 is occupied by a previous process, free it with:
npm run clean-port
```

Access locally at:
- **Customer Homepage**: [http://localhost:3005/](http://localhost:3005/)
- **Admin Portal**: [http://localhost:3005/admin](http://localhost:3005/admin)
- **Staff Operations Portal**: [http://localhost:3005/staff](http://localhost:3005/staff)

---

## 🧪 Testing & Verification

The application includes comprehensive automated test suites:

```bash
# Run local unit, security, mobile, and router tests
npm test

# Run Neon database schema, repository, and workflow verification tests
npm run test:neon
```

---

## 🚀 Deployment

The repository is configured with Railway GitHub auto-deployment on the `main` branch:
- **Repository**: `tusharsaraswat1988/CWPCUSTOMERDATA`
- **Branch**: `main`
- **Railway Domain**: `https://cwpdata.up.railway.app`
