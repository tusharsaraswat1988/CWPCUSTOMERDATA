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

## 📋 Google Sheet Structure (100% Preserved)

The application uses your existing Google Sheet structure without altering tabs or adding columns:

### Tab 1: `Daily Clean`
| # | Column Name | Description |
|---|---|---|
| 1 | `Staff ID` | e.g. `STF01` |
| 2 | `Staff Name` | e.g. `Ramesh Kumar` |
| 3 | `Customer Name` | Customer full name |
| 4 | `Customer Number` | 10-digit mobile number |
| 5 | `Package Type` | e.g. `Daily Exterior`, `Ceramic Maintenance` |
| 6 | `Packages Purchased` | Number of packages (e.g. `1`) |
| 7 | `Vehicle Number(s) / Model(s)` | e.g. `UP65 AB 1234 - Creta (Aaj) / UP65 CD 5678 - Amaze (Kal)` |
| 8 | `Customer / Vehicle Photo URL` | Viewable image link (auto-uploaded to Drive) |
| 9 | `Address` | Primary society / apartment address |
| 10 | `Google Maps URL` | Navigation link |
| 11 | `Secondary Address (if any)` | Alternate address / parking pillar |
| 12 | `Secondary Maps URL` | Navigation link for secondary address |
| 13 | `Staff Notes / Cleaning Instructions` | Cleaning instructions & rotation details |
| 14 | `Active` | `Yes` or `No` |

### Tab 2: `All Other Work`
| # | Column Name | Description |
|---|---|---|
| 1 | `Staff ID` | e.g. `STF02` |
| 2 | `Staff Name` | e.g. `Suresh Sharma` |
| 3 | `Service Type (Car Wash / Solar Cleaning)` | Service type |
| 4 | `Customer Name` | Customer full name |
| 5 | `Customer Number` | 10-digit mobile number |
| 6 | `Vehicle Number / Site Name` | Vehicle or site identifier |
| 7 | `Vehicle / Site Photo URL` | Photo link |
| 8 | `Address` | Site address |
| 9 | `Google Maps URL` | Navigation link |
| 10 | `Package / Service Details` | Scope of work |
| 11 | `Staff Notes / Special Instructions` | Safety instructions / notes |
| 12 | `Active` | `Yes` or `No` |

> [!NOTE]
> Staff member names and links are managed cleanly via Google Apps Script `PropertiesService` and auto-discovery, so **no extra tabs or columns** are created in your Google Sheet!

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

## 🔒 Scope & Privacy Compliance

- **No Over-Engineering**: Strictly no CRM, analytics, attendance, payroll, or complex workflows.
- **Strict Data Isolation**: When staff member `STF01` opens their link, the backend only returns records matching `Staff ID === "STF01"` and `Active === "Yes"`. Records for other staff members are never sent over the wire.
