# CWP Staff Information Viewer — CWP Detailers & Motors

A simple, lightweight, and mobile-friendly Staff Information Viewer built for **CWP Detailers & Motors**, powered directly by your existing Google Sheet.

**Target Google Sheet:** [CWP_Staff_Information_Viewer_Sheet_Template](https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit?usp=sharing)  
**Spreadsheet ID:** `1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY`

---

## 🎯 Key Capabilities

1. **Staff Read-Only View (`?staff=STAFF_ID`)**:
   - Field staff open their unique link on their mobile phones.
   - They see **only** their own assigned active customer records (data for other staff is never exposed).
   - **One-Tap Phone Call**: Direct `tel:` button dials the customer instantly.
   - **One-Tap Google Maps**: Opens the exact location in the Google Maps app for step-by-step navigation.
   - **License Plate Vehicle Display**: Indian license plate styling for instant car identification.
   - **Package Logic Alert Banner**: High-visibility alert when 1 package is purchased for 2 cars (e.g. alternate day Aaj / Kal rotation).
   - **Prominent Cleaning Instructions**: Yellow-bordered callout box displaying custom staff notes.
   - **Photo Thumbnail & Lightbox**: Tap-to-zoom vehicle photo.
   - **Secondary Address & Map Link**: Clear directions for alternate addresses / basement parking.

2. **Admin Page (`?admin=1`)**:
   - **Staff Management & Link Generator**:
     - Add new staff members with auto or custom IDs (e.g. `STF01`, `STF02`).
     - **📋 One-Click Copy Link**: Copies unique staff viewer URL to clipboard.
     - **🟢 Share via WhatsApp**: One-tap pre-composed message to send the link directly to the staff member's WhatsApp.
     - Preview any staff portal directly.
   - **Add Customer Information**:
     - Works seamlessly for both **`Daily Clean`** (14 columns) and **`All Other Work`** (12 columns).
     - **Direct Photo Upload**: Pick an image from desktop or take a photo with your smartphone camera (no manual URL pasting required). Automatically uploads to Google Drive folder `CWP_Customer_Photos` and inserts the public view URL.
     - **GPS Location Helper**: 1-click "📍 GPS" button fetches current phone/computer coordinates and creates a Google Maps link.
     - **Quick Chips**: 1-tap chips for rotation notes (e.g. `1 package hai. Dono cars alternate day clean karni hain.`).
     - Saves directly to the existing Google Sheet without modifying columns or tabs.
   - **Active Records List**:
     - View all records and toggle Active status (`Yes` / `No`) with 1 click.

---

## 📋 Google Sheet Structure (Customer-First Architecture)

The spreadsheet is structured with a **Customer-First** philosophy: customer identity (Name, Mobile, Location, Photo, Address) takes center stage in the first 5 columns. Staff code is eliminated from the sheet, and staff names are populated via backend validation to completely prevent typos.

### Tab 1: `Daily Clean`
| Col | Column Name | Type / Input | Description |
|---|---|---|---|
| **A** | **`Customer Name`** | Text | Customer full name (👤 Primary identity) |
| **B** | **`Customer Number`** | Number / Phone | 10-digit mobile number (📞 One-tap calling & WhatsApp) |
| **C** | **`Google Maps URL`** | Link / Plus Code | Coordinates / Plus code (🧭 Step-by-step navigation) |
| **D** | **`Customer / Vehicle Photo URL`** | Image Link | Viewable photo thumbnail / full lightbox |
| **E** | **`Address`** | Text | Primary society / flat / landmark address |
| **F** | `Vehicle Number(s) / Model(s)` | Text | e.g. `UP65 AB 1234 - Creta (Aaj) / UP65 CD 5678 - Amaze (Kal)` |
| **G** | `Package Type` | Dropdown | e.g. `Daily Clean`, `Ceramic Maintenance` |
| **H** | `Packages Purchased` | Number | Number of packages (Default `1`) |
| **I** | `Staff Name` | **Backend Dropdown** | Selected from registered backend staff (prevents typos) |
| **J** | `Staff Notes / Cleaning Instructions` | Text | Alternate day rotation, key notes, instructions |
| **K** | `Secondary Address (if any)` | Text | Alternate address / parking pillar |
| **L** | `Secondary Maps URL` | Link | Navigation link for secondary address |
| **M** | `Active` | Status | `Yes` or `No` |

### Tab 2: `All Other Work`
| Col | Column Name | Type / Input | Description |
|---|---|---|---|
| **A** | **`Customer Name`** | Text | Customer full name |
| **B** | **`Customer Number`** | Phone | 10-digit mobile number |
| **C** | **`Google Maps URL`** | Link | Navigation link |
| **D** | **`Vehicle / Site Photo URL`** | Image Link | Viewable photo |
| **E** | **`Address`** | Text | Site / customer address |
| **F** | `Service Type (Car Wash / Solar Cleaning)` | Text | Service scope |
| **G** | `Vehicle Number / Site Name` | Text | Identifier |
| **H** | `Package / Service Details` | Text | Work scope |
| **I** | `Staff Name` | **Backend Dropdown** | Selected from backend staff |
| **J** | `Staff Notes / Special Instructions` | Text | Safety / operational notes |
| **K** | `Active` | Status | `Yes` or `No` |

> [!NOTE]
> **Why no Staff Code in the Sheet?** Staff IDs (`STF01`, etc.) are internal system identifiers used only for lightweight URL tokens (`?staff=STF01`). Field staff and customers identify people by their name (`Chandan Soni`). Having staff names selected via Google Sheet Data Validation dropdown ensures zero spelling errors.

---

## 🚀 How to Deploy to Google Apps Script (2-Minute Setup)

1. Open your Google Sheet: [Open Sheet](https://docs.google.com/spreadsheets/d/1IXs46tRE324YYgBBAKxD1aCCnYVzmqfX4jxCWvfiALY/edit)
2. In the top menu, click **Extensions** &rarr; **Apps Script**.
3. Replace the content of `Code.gs` with the code in [`Code.gs`](file:///d:/cwp%20customer%20data%20app/Code.gs).
4. Click **+** (Add a file) &rarr; **HTML**, name it `Index`, and paste the code from [`Index.html`](file:///d:/cwp%20customer%20data%20app/Index.html).
5. Click **Deploy** (top right blue button) &rarr; **New deployment**.
   - Gear icon &rarr; Select **Web app**.
   - **Description:** `CWP Staff Information Viewer`
   - **Execute as:** `Me` (your Google Account)
   - **Who has access:** `Anyone` (allows staff to open links without needing Google accounts)
6. Click **Deploy**, click **Authorize access**, choose your account, click **Advanced**, click **Go to CWP Staff Information Viewer (unsafe)**, and click **Allow**.
7. Copy the provided **Web App URL** (e.g. `https://script.google.com/macros/s/AKfycb.../exec`).

### Using Your App:
- **Admin Dashboard:** Open `YOUR_WEB_APP_URL?admin=1`
- **Staff Viewer Links:**
  - Staff 1: `YOUR_WEB_APP_URL?staff=STF01`
  - Staff 2: `YOUR_WEB_APP_URL?staff=STF02`
  - Or simply click **🟢 WhatsApp Link** in the Admin page to send it directly to their phone!

---

## 💻 Local Testing & Preview

A lightweight Node.js test server is included in this repository:

```bash
# Start the local preview server
npm start
```

Then visit:
- **Staff Portal Preview:** [http://localhost:3000?staff=STF01](http://localhost:3000?staff=STF01)
- **Admin Dashboard:** [http://localhost:3000?admin=1](http://localhost:3000?admin=1)
- **Deployment Guide:** [http://localhost:3000/deploy](http://localhost:3000/deploy)

---

## ☁️ Cloudinary Image CDN Setup (High Speed & Direct Google Sheet Links)

Google Drive image links have access restrictions, cookie prompts, and viewing limits. This application uses **Cloudinary CDN** for all vehicle & customer photos:

1. **Direct Public Links**: Photos open anywhere without login barriers.
2. **Auto Thumbnails**: Instant, lightweight thumbnail loading in mobile staff cards and Google Sheets.
3. **Environment Variables on Railway**:
   Add either `CLOUDINARY_URL` OR the 3 credentials:
   - `CLOUDINARY_CLOUD_NAME` = your_cloud_name
   - `CLOUDINARY_API_KEY` = your_api_key
   - `CLOUDINARY_API_SECRET` = your_api_secret
   *(Sign up free at [cloudinary.com](https://cloudinary.com) — free plan includes 25GB storage and 25,000 monthly transformations)*

---

## 🔒 Scope & Privacy Compliance

- **No Over-Engineering**: Strictly no CRM, analytics, attendance, payroll, or complex workflows.
- **Strict Data Isolation**: When staff member `STF01` opens their link, the backend only returns records matching `Staff ID === "STF01"` and `Active === "Yes"`. Records for other staff members are never sent over the wire.
