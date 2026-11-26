# CWP Screen-by-Screen UX/UI Audit & Modernization Matrix

**Project:** CWP Detailers & Motors (Operations Management System & Customer Portal)  
**Document:** Screen-by-Screen Exhaustive Audit & Design Specifications (Phase 1)  
**Date:** 2026-11-25  
**Author:** Principal Product Designer, Senior UX Architect, Accessibility Specialist  
**Status:** APPROVED BASELINE  

---

## 1. Executive Summary & Audit Methodology

Every screen, sub-tab, dialog, and modal across the CWP Admin Portal, Staff Portal, and Customer Application was audited directly from source code (`Index.html`, `server.js`, `app.js`, `public/home.html`, `public/careers.html`), CSS styling rules (`style.css`, `m3-tokens.css`, `staff-m3.css`), and actual high-resolution visual captures across mobile (360px, 390px), tablet (768px), and desktop (1440px) viewports.

Each audit evaluates:
1. **Purpose & Role Alignment:** Does the interface align with the primary user persona?
2. **Visual Noise & Cognitive Load:** What elements distract the user from the primary task?
3. **Hierarchy & Primary Action:** Is there an unambiguous primary action?
4. **Redundant Controls & Emoji Pollution:** Are there mixed icon families, emojis, or stacked toolbars?
5. **Responsive & Ergonomic Viability:** Does the screen function on 360px mobile without clipping or horizontal overflow?
6. **Accessibility & Contrast:** Does it meet WCAG 2.2 AA (4.5:1 text, 3:1 controls, 48px touch)?
7. **DOM Safety & Risk:** Which IDs must be preserved to prevent automated QA test failures?

---

## 2. Screen Audit Matrix

### Screen 1: Admin Operations & Field Analytics Dashboard
- **Screen ID / Route:** `tabBtnDashboard` (`#adminTabDashboard`) / `/admin`
- **Current Purpose:** Executive operations overview: Daily Car Cleaning completion rate, Wash & Solar volumes, field crew attendance, quality photo audit status, and workload distribution.
- **Primary Persona:** Super Admin / Owner, Operations Manager.
- **Main Task:** Quickly assess whether today's cleaning operations are on schedule and identify operational exceptions.
- **Current UX Flaws & Visual Noise:**
  - Visual overload: 10 separate card containers displayed simultaneously across 3 rows (`09_admin_dashboard.png`).
  - Competing badges: "LIVE AUDIT", "0% Fulfilled", "Audit Passed", "Active On-Ground", "0% Done", "Cars Cleaned / Due", "Category Volume" in multiple conflicting colors (green, cyan, amber, purple).
  - Emoji pollution: Car (`🚗`), Sun (`🌞`), Hourglass (`⏳`), Camera (`📷`), Checkmark (`✅`), Lock (`🔒`), Stopwatch (`⏱️`), Pin (`📍`), Lightning (`⚡`) inside cards.
  - Three distinct button styles in header ("Refresh All", "Export CSV", "Print") competing with the cards.
- **Redundant Controls:** "Refresh All" button is redundant with the automatic 15-second live WebSocket / SSE pulse stream.
- **Mobile / Tablet Issues:** On 768px tablet, the three bottom charts stack awkwardly; on 360px mobile, the user must scroll through 9 screens of cards to see all metrics.
- **Accessibility / Contrast Flaws:** Light gray subtitles (`#64748b`) on pale background (`#f8fafc`) dip below 4.5:1 contrast in outdoor environments.
- **Proposed Layout:**
  - Calm executive summary with 4 unified KPI cards:
    1. Daily Car Cleaning Fulfillment (`Cleaned / Assigned • % Progress bar`)
    2. Active Field Crew (`On Route / Total Staff • Live Attendance`)
    3. On-Demand Jobs (`Done / Dispatched • Solar & Wash`)
    4. Photo Verification Rate (`Verified / Total • Quality Audit`)
  - Replace emojis with clean Google Material Symbols Outlined (`directions_car`, `solar_power`, `badge`, `verified`).
  - Single primary action: `Export Operational Report` (Secondary: quiet icon refresh).
- **Risk of Redesign:** Low. Dashboard is read-only; underlying calculation functions in `app.js` remain intact.
- **Implementation Priority:** P1.

---

### Screen 2: Daily Car Cleaning Reports & Proof of Work
- **Screen ID / Route:** `tabBtnCleanReports` (`#adminTabCleanReports`) / `/admin`
- **Current Purpose:** Audit daily vehicle cleaning punches, inspect uploaded completion photos, review non-completion reason notes, and export proof-of-work records.
- **Primary Persona:** Operations Manager, Super Admin, Customer Support.
- **Main Task:** Verify that cleaners uploaded genuine photos of customer vehicles and review skipped vehicles.
- **Current UX Flaws & Visual Noise:**
  - Triple-stacked controls: Operations intelligence hero card + Period chips + Filter dropdowns row + Table (`27_admin_clean_reports.png`).
  - Table causes horizontal scrollbar on screens below 1400px; columns for photo proof, reason, notes, and actions are squished.
  - Emojis in dropdown options (`👥 All Staff`, `📑 All Records`, `📅 Custom`).
- **Redundant Controls:** Separate "Today (आज)" button in the empty state duplicates the "Today (आज)" period chip above.
- **Mobile / Tablet Issues:** Severe horizontal overflow on tablet; table text truncates; lightbox photo viewer lacks pinch-to-zoom on touch devices.
- **Accessibility / Contrast Flaws:** Empty state icon has low contrast; table header text is 11px uppercase, hard to read on mobile.
- **Proposed Layout:**
  - Consolidated single-row filter bar: Period selector + Search input + Cleaner filter dropdown + Reset.
  - Sticky table header with responsive card fallback for viewports < 768px.
  - One-click photo thumbnail that opens high-resolution accessible lightbox modal (`reportPhotoLightboxModal`).
  - Contextual action menu (`...`) for Edit/Delete report records.
- **Risk of Redesign:** Low. DOM IDs (`reportStaffFilter`, `reportPhotoFilter`, `reportRouteFilter`, `reportSearchFilter`) must be preserved for QA test compliance.
- **Implementation Priority:** P1.

---

### Screen 3: Wash & Solar Hub (On-Demand Operations)
- **Screen ID / Route:** `tabBtnSpecialJobs` (`#adminTabSpecialJobs`) / `/admin`
- **Current Purpose:** Dispatch, monitor, and track on-demand vehicle washes, rooftop solar panel cleanings, and interior/exterior detailing jobs.
- **Primary Persona:** Operations Manager, Dispatcher, Solar Lead.
- **Main Task:** Assign new wash/solar jobs to available staff and track job completion from "Assigned" to "In Progress" to "Completed".
- **Current UX Flaws & Visual Noise:**
  - Five stacked visual tiers above the table (`24_admin_special_jobs_tab.png`):
    1. Header with "+ Assign Wash & Solar" bright orange button
    2. Four KPI cards
    3. Six Period filter chips
    4. Six Category filter chips
    5. Search bar + 3 dropdowns + Reset button.
  - Three different orange/amber hues used simultaneously (button, icon, chips).
  - Empty state contains redundant emoji (`☀️`).
- **Redundant Controls:** Work Type dropdown duplicates the Category filter chips directly above it.
- **Mobile / Tablet Issues:** Filter chips wrap onto 3 lines on mobile, pushing the table completely off-screen.
- **Accessibility / Contrast Flaws:** Inactive filter chips have gray text on pale gray backgrounds (3.2:1 contrast, failing WCAG 2.2 AA).
- **Proposed Layout:**
  - Restrained header with prominent primary action: `+ Book & Dispatch Job`.
  - Integrated filter bar combining Work Type tabs and Date range.
  - Ledger table with clear status lozenges (Assigned = Blue, In Progress = Amber, Completed = Emerald).
  - Contextual action menu (`...`) containing "Reassign", "Edit Details", and "Cancel Job".
- **Risk of Redesign:** Medium. Preserves `assignSpecialJobModal`, `reassignJobModal`, and `completeSpecialJobModal` contracts.
- **Implementation Priority:** P1.

---

### Screen 4: Job Assignment & Dispatch Hub
- **Screen ID / Route:** `tabBtnJobAssignment` (`#adminTabJobAssignment`) / `/admin`
- **Current Purpose:** Allocate unassigned customers to morning daily clean routes and dispatch on-demand jobs to cleaners.
- **Primary Persona:** Dispatcher, Operations Manager.
- **Main Task:** Ensure 100% of customers have an assigned cleaner before morning operations commence.
- **Current UX Flaws & Visual Noise:**
  - Two disconnected sub-tabs: "Daily Clean Routes (12)" and "On-Demand Jobs (46)" (`25_admin_job_assignment_daily.png`).
  - Full-width amber alert banner: *"12 Daily Clean customers need a cleaner assigned!"* with duplicate "View Unassigned" dropdown.
  - Large inline creation form ("Allocate Customer to Daily Clean Route") occupying prominent screen space above the roster table.
  - Roster table displays full "Assign cleaner" dropdown in every single row.
- **Redundant Controls:** Customer selection in the top form duplicates clicking an unassigned row in the table below.
- **Mobile / Tablet Issues:** Inline allocation form wraps into 4 misaligned lines on mobile; table actions column overflows.
- **Accessibility / Contrast Flaws:** Yellow unassigned badges (`#fef3c7`) have insufficient contrast in bright environments.
- **Proposed Layout:**
  - Clean master-detail layout: Unassigned queue at top/left, active staff capacity on right.
  - Quick one-click cleaner assignment from table row or batch assign bar.
  - Clear capacity indicators for cleaners (e.g. `Chandan: 22/28 cars assigned`).
- **Risk of Redesign:** Medium. Preserves `btnSubTabDailyRoutes`, `btnSubTabSpecialJobs`, and table body IDs.
- **Implementation Priority:** P0.

---

### Screen 5: Staff Live Tracking & Movement Analytics
- **Screen ID / Route:** `tabBtnStaffTracking` (`#adminTabStaffTracking`) / `/admin`
- **Current Purpose:** Real-time field staff GPS tracking, movement route trail, dwell stoppage detection, and direct ping messaging.
- **Primary Persona:** Operations Manager, Zone Supervisor.
- **Main Task:** Verify cleaner presence on assigned morning routes and detect abnormal delays.
- **Current UX Flaws & Visual Noise:**
  - 4 KPI cards at top + Left sidebar list of cleaners + Full-screen Leaflet map (`28_admin_staff_tracking.png`).
  - Cleaner cards in sidebar are cramped: display ID, phone, coordinates, last update, distance today, stops count, battery percentage, Center button, Ping button, Stops button all within a 280px width card!
- **Redundant Controls:** "Center" button on card duplicates clicking the staff pin on the map.
- **Mobile / Tablet Issues:** On mobile screens, the map and the staff list compete for vertical height; map controls zoom awkwardly.
- **Accessibility / Contrast Flaws:** Small coordinate text (`25.2935, 82.9986`) is 11px gray text, unreadable in outdoor sunlight.
- **Proposed Layout:**
  - Unified split layout: Responsive staff drawer / sheet over full-height interactive map.
  - Clean staff cards showing Cleaner Name, Current Stop, Battery, and Status indicator.
  - Contextual bottom sheet for selected cleaner showing GPS breadcrumb trail and stop sequence.
- **Risk of Redesign:** Low. Leaflet map integration and WebSocket tracking stream must remain untouched.
- **Implementation Priority:** P2.

---

### Screen 6: Customer Records & Directory
- **Screen ID / Route:** `tabBtnRecords` (`#adminTabRecords`) / `/admin`
- **Current Purpose:** Master directory of all CWP customers: search by name, vehicle plate, phone; view subscriptions; launch edit and service assignment workflows.
- **Primary Persona:** Operations Manager, Customer Support, Super Admin.
- **Main Task:** Find a customer record in under 5 seconds to answer inquiries, update vehicle/address, or add services.
- **Current UX Flaws & Visual Noise:**
  - Top header has 5 action buttons ("+ Lead", "+ New Customer", "Auto Indic", "Export CSV", refresh) (`10_admin_records_customers.png`).
  - Five large stacked KPI cards (`104 ALL CLIENTS`, `68 DAILY CLEANING`, etc.).
  - Table has 11 columns with 4 action buttons per row (`Map`, `Service`, `Edit`, `Delete`), causing severe horizontal overflow (`10_admin_records_customers.png`, `34_admin_records_768px_tablet.png`).
  - Red trash icon on every row creates risk of accidental customer deletion.
- **Redundant Controls:** "Auto Indic" button is redundant with the automatic transliteration triggered during customer creation/save.
- **Mobile / Tablet Issues:** On 360px mobile, 5 KPI cards consume 100% of initial viewport (`35_admin_records_360px_mobile.png`); table cannot be navigated without endless 2-axis scrolling.
- **Accessibility / Contrast Flaws:** Cyan "Auto Indic" button (`#06b6d4`) has poor white text contrast; tiny phone action buttons fail 48px touch targets.
- **Proposed Layout:**
  - Clean header with ONE dominant primary action: `+ New Customer` (Secondary: Export, Lead).
  - Compact horizontal KPI pill strip that does not hijack vertical space.
  - Modern data table with sticky header:
    - Customer Info (Avatar, Name, Bilingual Hindi, Phone with WhatsApp quick icon)
    - Vehicle & HSRP Plate (Distinctive plate badge + make/color)
    - Primary Society / Address
    - Active Service & Assigned Cleaner
    - Actions: Single contextual menu icon (`more_vert`) containing Edit, Service, View Map, Delete.
  - Automatic responsive card layout on viewports < 768px.
- **Risk of Redesign:** High. This is the most frequently used administrative screen. All modal trigger functions (`openEditCustomerModal`, `openAddCustomerModal`, `deleteCustomer`) must be preserved.
- **Implementation Priority:** P0.

---

### Screen 7: Leads Pipeline & Inquiries Directory
- **Screen ID / Route:** `tabBtnLeads` (`#adminTabLeads`) / `/admin`
- **Current Purpose:** Manage incoming prospect inquiries from website booking and WhatsApp; track follow-ups and convert inquiries into paying customers.
- **Primary Persona:** Sales Lead, Dispatcher, Operations Manager.
- **Main Task:** Review new inquiries, record call notes, and convert leads into active customer subscriptions.
- **Current UX Flaws & Visual Noise:**
  - Emojis in KPI cards (`🎯`, `📥`, `📞`, `☀️`) and button (`✨ New Lead`) (`29_admin_leads_tab.png`).
  - Dual view toggle (Table vs Pipeline) placed inside the filter bar rather than the view header.
  - In Table view, the "Convert" button is clipped by table horizontal overflow (`29_admin_leads_tab.png`).
  - Stage dropdown inside table row (`New`, `Contacted`, `Follow-up`, `Lost`) lacks clear visual feedback upon update.
- **Redundant Controls:** Category filter chips duplicate the main service type field in lead cards.
- **Mobile / Tablet Issues:** Pipeline Kanban cards overflow horizontally without smooth touch drag-and-drop on mobile.
- **Accessibility / Contrast Flaws:** Orange "✨ New Lead" gradient button violates design system palette; yellow/amber badges fail contrast.
- **Proposed Layout:**
  - Executive header with `+ Add Lead` primary action.
  - Restrained 4-stage pipeline summary: `New Inquiries`, `In Follow-Up`, `Ready to Convert`, `Converted / Lost`.
  - Responsive table with clear `Convert to Customer` primary row action and contextual menu for notes and stage updates.
  - Mobile card transformation with direct one-tap Call and WhatsApp icons.
- **Risk of Redesign:** Medium. Preserves `addLeadModal`, `convertLeadModal`, and `leadNoteModal` element IDs.
- **Implementation Priority:** P1.

---

### Screen 8: Route Sequence & Routes Hub
- **Screen ID / Route:** `tabBtnSequence` (`#adminTabSequence`) / `/admin`
- **Current Purpose:** Configure master daily cleaning routes, set stop sequence order (1..N), assign primary cleaners, and allocate unassigned subscription vehicles from the workbench.
- **Primary Persona:** Operations Manager, Dispatcher.
- **Main Task:** Optimize morning cleaning travel order and assign vehicles to cleaners.
- **Current UX Flaws & Visual Noise:**
  - Recently modernized in Task 01.11 with M3 principles (`audit_01_11_1/01_desktop_1440_routes_hub.png`), but legacy sequence view still contains legacy emoji controls.
  - Subtab navigation has 3 tabs: "Routes Hub", "Unassigned Workbench", and "Staff Sequence View". The relationship between Routes Hub and Staff Sequence View requires clearer hierarchy.
- **Redundant Controls:** Reset Sequence button requires prominent destructive protection to avoid accidental route erasure.
- **Mobile / Tablet Issues:** Route detail stop list sequence requires touch-friendly reorder handles on tablet.
- **Accessibility / Contrast Flaws:** Inactive route badges need clear non-color distinction.
- **Proposed Layout:**
  - Maintain the successful Task 01.11 M3 foundation while polishing touch handles and stop transfer workflows.
  - Ensure 100% of Material Symbols are used with zero emojis.
- **Risk of Redesign:** High. Automated QA suite `test_route_management_ui_first_qa.js` strictly validates 22 structural gates.
- **Implementation Priority:** P0.

---

### Screen 9: Staff Management & Designations Roster
- **Screen ID / Route:** `tabBtnStaff` (`#adminTabStaff`) / `/admin`
- **Current Purpose:** Register staff, manage 6-digit PINs, configure job capabilities (DCC, Car Wash, Solar), assign operational designations, and manage hierarchy.
- **Primary Persona:** Operations Manager, Super Admin.
- **Main Task:** Onboard new staff members and configure access permissions.
- **Current UX Flaws & Visual Noise:**
  - Inline staff creation form squished into 6 side-by-side controls at the top (`19_admin_staff_management.png`).
  - Five competing action buttons on every staff card: `Reset Device`, `Edit`, `Active`, `Open`, `Delete`.
  - "Change Admin Password" placed abruptly at the bottom of the staff management page.
  - Excessive badges: `DCC + Services`, `Cleaner`, `Active`, `Logged In` competing on each card.
- **Redundant Controls:** "Open" button (which opens staff portal preview) competes with the primary "Edit" action.
- **Mobile / Tablet Issues:** 6-column inline form completely breaks on viewports < 1024px; action buttons overflow.
- **Accessibility / Contrast Flaws:** Masked PIN (`••••••`) and "Show" button lack explicit ARIA labels.
- **Proposed Layout:**
  - Header with `+ Add Staff` primary action launching a clean modal form (removing the cramped inline form).
  - Staff card redesign: Staff Photo/Avatar, Name, Designation pill, Assigned Route / Capacity, Status indicator.
  - Clean action hierarchy: `Edit Staff` primary action, with secondary actions (`Reset Device`, `Reveal PIN`, `Deactivate`) in a contextual menu (`...`).
  - Move "Change Admin Password" to a dedicated Settings / Security dialog or profile dropdown.
- **Risk of Redesign:** Medium. Preserves `staffEditModal`, `designationManagementModal`, and `staffHierarchyModal` element contracts.
- **Implementation Priority:** P0.

---

### Screen 10: Admin Login Gate
- **Screen ID / Route:** `/admin` (when unauthenticated)
- **Current Purpose:** Administrative security checkpoint to authenticate management users before accessing operations data.
- **Primary Persona:** Super Admin, Operations Manager, Dispatcher.
- **Main Task:** Enter password and log in immediately.
- **Current UX Flaws & Visual Noise:**
  - Sci-fi floating 3D canvas orb ("Tap core to authenticate") obscures the login form (`05_admin_login_desktop.png`).
  - Requires unnecessary extra interaction (tapping the orb) just to show the password input.
  - Excessive GPU and CPU consumption on lower-end devices from the continuous canvas animation.
- **Redundant Controls:** Animated canvas orb is entirely redundant with standard enterprise authentication.
- **Mobile / Tablet Issues:** On mobile screens, the animated orb pushes the password input below the fold.
- **Accessibility / Contrast Flaws:** Fails WCAG 2.2 focus visibility; screen readers cannot interact with the raw canvas element.
- **Proposed Layout:**
  - Clean, professional enterprise login card:
    - Official CWP Detailers & Motors logo
    - Subtitle: "Operations & Administrative Console"
    - Clear Password input with show/hide password toggle
    - Prominent Primary Button: `Sign In to Admin Console`
    - High-contrast, keyboard-accessible focus rings.
- **Risk of Redesign:** Low. Authentication endpoint (`/api` with `action: 'login'`) remains identical.
- **Implementation Priority:** P0.

---

### Screen 11: Staff Login Gate
- **Screen ID / Route:** `/staff` (when unauthenticated)
- **Current Purpose:** Mobile security gate for field cleaning and detailing staff.
- **Primary Persona:** Cleaner / DCC Staff, Wash Technician, Solar Technician.
- **Main Task:** Enter 10-digit mobile number and 6-digit PIN to access today's work.
- **Current UX Flaws & Visual Noise:**
  - Generally clean (`07_staff_login_desktop.png`), but install PWA banner at top competes with the login card.
  - Error messages appear as opaque black overlay badges that block the inputs (`30_staff_portal_daily_clean_mobile.png`).
- **Redundant Controls:** Dot indicators under the PIN field duplicate the native password input dots.
- **Mobile / Tablet Issues:** Keyboard opening on mobile screens can obscure the login button if padding is insufficient.
- **Accessibility / Contrast Flaws:** Error messages must be dismissible and announced via `aria-live`.
- **Proposed Layout:**
  - Mobile-first card centered in viewport with CWP logo.
  - Large touch-friendly input fields (48px height) for Phone Number and 6-digit PIN.
  - Dedicated "Remember Me on this Phone" toggle.
  - Clear, accessible Hindi validation messages.
- **Risk of Redesign:** Low. Authentication endpoint (`/api` with `action: 'staff_login'`) remains identical.
- **Implementation Priority:** P0.

---

### Screen 12: Staff Portal — Daily Car Cleaning Route View
- **Screen ID / Route:** `pillDailyClean` (`#staffViewDailyClean`) / `/staff`
- **Current Purpose:** Morning doorstep car cleaning route execution: vehicle list, HSRP plates, parking details, Aaj/Kal rotation, one-tap calling, and camera photo proof.
- **Primary Persona:** Cleaner / DCC Staff.
- **Main Task:** Clean assigned cars in stop sequence order (1..N) and record photo proof.
- **Current UX Flaws & Visual Noise:**
  - Customer cards are well-structured (`mobile_07_staff_daily_cleaning_modern.png`), but header contains multiple competing items (logo, Hindi switch, dark mode toggle, live indicator, logout button).
  - Search box is always expanded, consuming 56px of vertical height even during active cleaning.
  - Emojis in buttons (`📞 Call`, `📍 Location`, `🏎️ Vehicle`).
- **Redundant Controls:** Customer photo button inside card duplicates the main "Mark Cleaned" camera workflow.
- **Mobile / Tablet Issues:** In basement parking lots without internet, lack of prominent offline indicator causes anxiety about whether work was recorded.
- **Accessibility / Contrast Flaws:** Hindi font line-height must be >= 1.5 to prevent vowel matra clipping (`ि`, `ी`, `ु`, `ू`).
- **Proposed Layout:**
  - Streamlined header with cleaner name, route progress pill (`8/26 Done`), and quiet settings gear.
  - Collapsible search bar to maximize screen space for vehicle cards.
  - High-visibility customer cards:
    - Bold sequence stop badge (`#1`, `#2`)
    - Customer Name in prominent Devanagari script
    - Authentic HSRP License Plate (`UP 65 AB 1234`) with Indian flag badge
    - Bold "Aaj/Kal" vehicle rotation banner
    - Two large primary action buttons (>= 48x48px): `Call Customer` (Green) and `Directions` (Blue)
    - Full-width dominant bottom button: `Mark Cleaned` (launching camera).
- **Risk of Redesign:** High. Core revenue-generating workflow of CWP. Must preserve offline queuing and photo upload handlers.
- **Implementation Priority:** P0.

---

### Screen 13: Staff Portal — Other Jobs View (Wash, Solar, Detailing)
- **Screen ID / Route:** `pillOtherJobs` (`#staffViewOtherJobs`) / `/staff`
- **Current Purpose:** Execution view for on-demand car washing, rooftop solar cleaning, and vehicle detailing.
- **Primary Persona:** Car Wash Technician, Solar Technician.
- **Main Task:** View scheduled jobs, review site scope (seater size or panel count), execute 3-step completion, and share WhatsApp proof.
- **Current UX Flaws & Visual Noise:**
  - Category filter chips at top (`All`, `Wash`, `Solar`, `Interior`, `Exterior`) wrap awkwardly on narrow mobile screens.
  - Solar panel count badge lacks distinct visual differentiation from vehicle wash cards.
- **Redundant Controls:** Multiple photo preview buttons before job completion.
- **Mobile / Tablet Issues:** 3-step completion modal needs full-screen mobile behavior with large touch targets.
- **Accessibility / Contrast Flaws:** "Start Job" and "Complete Job" status badges must have distinct non-color shapes and icons.
- **Proposed Layout:**
  - Clean horizontal scroll filter chips with touch snap.
  - Distinctive Solar Array card treatment highlighting **`☀️ 24 Panels`** in bold high-contrast container.
  - Distinctive Car Wash card treatment highlighting **`🚗 5-Seater`** or **`🚙 5+-Seater`**.
  - Obvious 3-step action bar: `Start Job (Before Photos)` → `Complete Job (After Photos)` → `Share WhatsApp Proof`.
- **Risk of Redesign:** Medium. Preserves `startSpecialJobModal` and `completeSpecialJobModal` contracts.
- **Implementation Priority:** P1.

---

### Screen 14: Customer Homepage & Service Showcase
- **Screen ID / Route:** `/` or `/home` (`public/home.html`)
- **Current Purpose:** Public customer-facing showcase for CWP Detailers & Motors: service plans, transparent pricing, society coverage, reviews, and quick booking.
- **Primary Persona:** Vehicle & Home Solar Owner.
- **Main Task:** Explore pricing, understand CWP's premium treated soft-water technique, and book doorstep service.
- **Current UX Flaws & Visual Noise:**
  - Modern baseline (`01_customer_home_desktop.png`), but top navigation bar has competing telephone and Book Service buttons.
  - Floating WhatsApp icon at bottom right can overlap mobile footer actions.
- **Redundant Controls:** Multiple "Book Service" buttons scattered across each section without clear context.
- **Mobile / Tablet Issues:** Pricing tables require touch swipe cards on mobile viewports.
- **Accessibility / Contrast Flaws:** Teal primary buttons (`#008080`) on white background achieve ~4.6:1 contrast (barely passing AA); deep brand navy (`#0b192c`) provides superior contrast (>= 12:1).
- **Proposed Layout:**
  - Align with CWP Unified Design System tokens (Deep Navy `#0b192c`, Neutral Slate `#0f172a`, Emerald `#059669`).
  - Clear value proposition hierarchy: Services → Pricing Calculator → Customer Video Proof → Fast Booking Modal.
- **Risk of Redesign:** Low. Public static page; SEO meta tags and lead submission endpoints remain identical.
- **Implementation Priority:** P2.

---

### Screen 15: Customer Booking Modal
- **Screen ID / Route:** `#bookModal` (`public/home.html`)
- **Current Purpose:** Frictionless 4-field lead capture modal to book doorstep cleaning and connect directly with CWP on WhatsApp.
- **Primary Persona:** Customer.
- **Main Task:** Enter name, phone, and society to request service.
- **Current UX Flaws & Visual Noise:**
  - Clean form (`03_customer_home_booking_modal.png`), but input borders have subtle gray outline (< 3:1 contrast against white background).
- **Redundant Controls:** None.
- **Mobile / Tablet Issues:** Bottom button can be hidden by virtual keyboard on older Android browsers without safe-area scrolling.
- **Accessibility / Contrast Flaws:** Input border contrast must be increased to 3:1 (`#cbd5e1`).
- **Proposed Layout:**
  - Retain the fast 4-field structure with high-contrast input borders and clear focus rings.
  - Sticky bottom action button with `env(safe-area-inset-bottom)`.
- **Risk of Redesign:** Low. Lead submission endpoint (`/api/leads`) remains identical.
- **Implementation Priority:** P2.

---

### Screen 16: Customer Careers Page
- **Screen ID / Route:** `/careers` (`public/careers.html`)
- **Current Purpose:** Recruitment page for field car cleaners, detailing technicians, and operational supervisors.
- **Primary Persona:** Job Applicant.
- **Main Task:** Review open positions, compensation benefits, and submit employment application.
- **Current UX Flaws & Visual Noise:**
  - Functional (`04_careers_page_desktop.png`), but uses independent CSS (`careers.css`) that does not share tokens with the main design system.
- **Redundant Controls:** None.
- **Mobile / Tablet Issues:** Application form fields are excessively wide on tablet.
- **Accessibility / Contrast Flaws:** Form helper text is low-contrast gray.
- **Proposed Layout:**
  - Integrate unified typography and color tokens from `m3-tokens.css`.
  - Responsive single-column application form with phone number validation.
- **Risk of Redesign:** Low. Application submission endpoint (`/api/careers/apply`) remains identical.
- **Implementation Priority:** P2.
