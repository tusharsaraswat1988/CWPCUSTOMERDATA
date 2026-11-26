# CWP User Personas & Operational Workflow Research

**Project:** CWP Detailers & Motors (Operations Management System & Customer Portal)  
**Document:** User Personas, Workflows & Operational Ergonomics (Phase 1)  
**Date:** 2026-11-25  
**Author:** Principal Product Designer, Senior UX Architect  
**Status:** APPROVED BASELINE  

---

## 1. Persona Research & Analysis

CWP is an operational field platform with distinct internal staff hierarchies and external customer touchpoints. The system must accommodate users ranging from low-literacy field operatives operating entry-level Android devices in harsh sunlight to executive business owners reviewing city-wide operational margins on desktop workstations.

---

### Persona A: Super Admin / Business Owner

- **Role Overview:** Founder, Managing Director, and Executive Management of CWP Detailers & Motors. Responsible for business viability, operational quality, multi-city growth, and system governance.
- **Digital Comfort Level:** High. Accustomed to modern SaaS dashboards, analytics, and business communication tools.
- **Primary Devices:** 14"–16" MacBook Pro / Windows Laptop (1440px – 1920px), iPad Pro (1024px), iPhone / Android flagship on the move.
- **Frequency of Usage:** Multiple times daily (morning kickoff at 06:00 AM, mid-day operational check, evening financial and performance audit).
- **Primary Tasks:**
  1. Monitor overall operational completion rates (Daily Car Cleaning fulfillment percentage).
  2. Inspect quality audit logs (photo proof compliance, flagged customer complaints).
  3. Manage staff compensation, designation levels, and system access rights.
  4. Track business growth: customer count, package sales, and new inquiry conversions.
  5. Review future city/zone expansion metrics.
- **Most Critical Information Needed First:**
  - System-wide fulfillment metric: `Cars Cleaned vs Cars Assigned Today`.
  - Quality verification: `Photo Proof Rate` (% verified vs skipped).
  - Unassigned exceptions: Count of customers without an assigned cleaner or route.
- **Common Frustrations:**
  - Interfaces cluttered with low-level micro-actions that hide executive operational trends.
  - Inability to quickly filter by operational area or society.
  - Slow or broken CSV export when preparing accounting reconciliations.
- **Risks of User Error:** High financial/governance impact if system settings or administrative passwords are inadvertently changed.
- **Required Permissions:** Super Admin (unrestricted access to all modules, financial packages, designation configs, audit logs, and system credentials).
- **UX Needs:**
  - Executive KPI summary cards with clear delta indicators.
  - High-density data tables with fast sorting and export capabilities.
  - Multi-city and multi-zone organizational filtering.
- **Success Criteria:** Owner can assess operational health and review exceptions within 30 seconds of logging in.

---

### Persona B: Admin / Operations Manager

- **Role Overview:** Field Operations Lead based in the city headquarters. Manages daily scheduling, customer onboarding, staff route assignments, and emergency re-allocations.
- **Digital Comfort Level:** High to Moderate. Fluent with web apps, WhatsApp Business, Google Maps, and spreadsheet imports.
- **Primary Devices:** Office Desktop Monitor (1920x1080), Tablet (768px – 1024px) during morning hub standups.
- **Frequency of Usage:** Continuous throughout the day (05:30 AM to 08:00 PM).
- **Primary Tasks:**
  1. Review unassigned customers and allocate them to morning cleaner routes.
  2. Reassign routes and jobs when cleaners report sick or take sudden leaves.
  3. Onboard new customers: enter vehicle plates, society address, GPS coordinates, and package tier.
  4. Dispatch on-demand car washes and solar panel maintenance jobs.
  5. Investigate non-completion tickets (e.g. "Car not present" or "Gate locked").
- **Most Critical Information Needed First:**
  - Unassigned customer counter (amber highlight).
  - Active cleaner attendance and live route progression.
  - Emergency reassignments pending dispatch.
- **Common Frustrations:**
  - Having to click through multiple nested dialogs to assign a cleaner.
  - Horizontal scrolling tables where action buttons fall off the screen on 13" laptops.
  - Data leakage between customer creation and editing forms.
- **Risks of User Error:**
  - Assigning a cleaner who does not have Daily Car Cleaning capabilities.
  - Setting the wrong vehicle seater type (`5_seater` vs `5_plus_seater`), causing pricing errors.
- **Required Permissions:** Operations Manager (Customer Management, Staff Dispatch, Route Management, Job Reassignment, Reports Review).
- **UX Needs:**
  - Streamlined batch assignment workflows.
  - Clear visual badges for vehicle sizing and service categories.
  - Instant phone number validation and auto-transliteration for customer Hindi names.
- **Success Criteria:** Manager can reassign an entire 25-car route within 60 seconds of a cleaner reporting absent.

---

### Persona C: City Manager (Future Multi-City Persona)

- **Role Overview:** Regional Operations Director responsible for a specific city cluster (e.g. Varanasi, Lucknow, Kanpur, Prayagraj).
- **Digital Comfort Level:** High.
- **Primary Devices:** Laptop (1366px – 1920px), Tablet (1024px).
- **Frequency of Usage:** Daily morning and evening reviews.
- **Primary Tasks:**
  1. Monitor city-wide route density, fleet mileage, and staff retention.
  2. Allocate operational zones and appoint zone supervisors.
  3. Compare performance across city societies and apartment clusters.
- **Most Critical Information Needed First:**
  - City selector with instant scope isolation.
  - Zone-by-zone SLA compliance and on-time arrival rates.
- **Common Frustrations:**
  - Mixed data from other cities cluttering local reports.
  - Clunky multi-step zone creation.
- **Risks of User Error:** Modifying configurations belonging to another city's operational boundary.
- **Required Permissions:** City Admin (restricted strictly to assigned city records and zones).
- **UX Needs:**
  - Prominent city/zone breadcrumb selector in the main header.
  - City-level performance aggregations.
- **Success Criteria:** Complete operational visibility into the assigned city without any visual bleed from other cities.

---

### Persona D: Zone / Area Manager

- **Role Overview:** Local territory supervisor managing 5 to 10 apartment societies and a team of 8 to 15 cleaners (e.g. Sigra / Mahmoorganj Zone, Varanasi).
- **Digital Comfort Level:** Moderate.
- **Primary Devices:** Mid-tier Android Smartphone (390px – 412px), Android Tablet (800px).
- **Frequency of Usage:** Continuously in the field (06:00 AM to 12:00 PM).
- **Primary Tasks:**
  1. Spot-check field cleaners on morning routes.
  2. Resolve customer gate pass and security access issues.
  3. Verify physical condition of vehicles and audit cleaning quality.
  4. Balance workload between adjacent cleaner routes.
- **Most Critical Information Needed First:**
  - Live map showing cleaner GPS positions within the zone.
  - Stop sequence order and current stop status per cleaner.
  - Flagged non-completion logs requiring immediate customer phone calls.
- **Common Frustrations:**
  - Small buttons that cannot be tapped while walking or holding a clipboard.
  - Slow loading times on mobile 4G networks.
- **Risks of User Error:** Misreading route stop sequence, causing cleaner confusion.
- **Required Permissions:** Zone Supervisor (read/write access to zone routes, staff tracking, and non-completion photo verification).
- **UX Needs:**
  - Mobile-optimized card feeds with direct one-tap Call and Navigate actions.
  - Offline-first cached data with clear queue badges.
- **Success Criteria:** Supervisor can inspect a cleaner's 25-car route and verify completion status in less than 15 seconds on mobile.

---

### Persona E: Dispatcher / Operations Coordinator

- **Role Overview:** Dedicated scheduling coordinator handling real-time customer calls, rescheduling requests, and on-demand wash/solar bookings.
- **Digital Comfort Level:** Moderate to High.
- **Primary Devices:** Dual-monitor Desktop (1920x1080), Office Laptop.
- **Frequency of Usage:** Continuous (08:00 AM to 06:00 PM).
- **Primary Tasks:**
  1. Convert incoming WhatsApp/phone leads into booked jobs.
  2. Assign on-demand car washes and solar cleaning visits to available technicians.
  3. Set tentative arrival times and dispatch sequence order.
  4. Send WhatsApp dispatch confirmations with customer details to technicians.
- **Most Critical Information Needed First:**
  - Available technician capacity for today and tomorrow.
  - Unscheduled on-demand jobs ledger.
  - Customer contact and exact parking/site details.
- **Common Frustrations:**
  - Having to switch between multiple tabs to check technician availability before assigning.
  - Lack of instant audio alerting when new leads arrive.
- **Risks of User Error:** Double-booking a technician or dispatching a car cleaner for a rooftop solar panel job.
- **Required Permissions:** Dispatcher (Leads Pipeline, Job Assignment, Customer Directory, Service Catalog).
- **UX Needs:**
  - Visual distinction between vehicle cleaning and solar array cleaning.
  - Clear technician capability indicators (e.g., "Eligible: Wash, Solar").
- **Success Criteria:** Booking and dispatching an incoming service lead in under 45 seconds.

---

### Persona F: Cleaner / Daily Car Cleaning (DCC) Staff

- **Role Overview:** Doorstep car cleaning operatives executing morning cleaning routines (typically 20–30 vehicles per morning between 05:30 AM and 10:00 AM).
- **Digital Comfort Level:** Low to Moderate. Limited English fluency; working language is Hindi (Devanagari script). Uses WhatsApp and YouTube daily.
- **Primary Devices:** Entry-level Android smartphones (e.g., Redmi, Realme, Samsung Galaxy M-series; 360px – 400px viewports; 720p resolution).
- **Environmental Context:**
  - Working outdoors in society parking lots, basements, and open driveways.
  - Extreme sunlight glare (up to 100,000 lux in Indian summers) and dim basement lighting.
  - Hands are frequently damp, wet, or soapy; occasional glove wear.
  - Phone is held in one hand while carrying cleaning buckets, microfiber cloths, and spray bottles in the other.
  - Intermittent 4G connectivity in underground parking basements.
- **Frequency of Usage:** High bursts every 10–15 minutes during morning cleaning rounds.
- **Primary Tasks:**
  1. Open app at 05:30 AM and review assigned morning route list in sequential stop order.
  2. Tap customer to view parking location, vehicle license plate, and car model/color.
  3. Check "Aaj/Kal" alternate-day rotation instructions (which car gets washed today).
  4. Call customer via one tap if society gate or car keys are locked.
  5. Take photo proof and mark vehicle cleaned (or report "Car not present" with reason).
- **Most Critical Information Needed First:**
  - Large vehicle license registration plate (HSRP style: `UP 65 AB 1234`).
  - Vehicle make, model, and color (e.g. `White Creta`, `Black Scorpio`).
  - Exact parking spot (e.g. `Basement Bay B-14`, `Porch Under Shed`).
  - Aaj/Kal rotation banner (e.g. *"Aaj: Scorpio / Kal: Tiago"*).
- **Common Frustrations:**
  - Small touch buttons (<48px) missed with wet thumbs.
  - Low contrast text unreadable under glaring morning sunlight.
  - Complex nested menus or English technical jargon.
  - App locking up or losing progress when internet drops in basement parking.
- **Risks of User Error:**
  - Cleaning the wrong car in a multi-car household.
  - Accidentally marking a car as cleaned before work is done.
- **Required Permissions:** Field Staff (restricted exclusively to assigned daily route vehicles; zero access to customer financial data or other staff rosters).
- **UX Needs:**
  - Minimum 48x48px touch targets with 8px physical separation.
  - High-contrast typography (>= 7:1 for headings and license plates).
  - Prominent bilingual Hindi display (`गाड़ी नंबर`, `सफाई पूर्ण करें`, `कॉल करें`).
  - Flawless offline operation with automatic background sync when returning to surface coverage.
- **Success Criteria:** Cleaner can locate the vehicle, review rotation, take photo proof, and mark done in two thumb taps.

---

### Persona G: Car Wash Technician

- **Role Overview:** Skilled detailing technician executing high-pressure foam washes, waxing, and interior steam extraction at customer doorstep using mobile wash van equipment.
- **Digital Comfort Level:** Moderate. Comfortable with Hindi and basic English vehicle terminology.
- **Primary Devices:** Android smartphone (380px – 420px).
- **Frequency of Usage:** 3 to 6 visits per day, scheduled at specific 2-hour appointment windows.
- **Primary Tasks:**
  1. Review today's dispatched car wash appointments in "Other Jobs" tab.
  2. Navigate to customer location using one-tap Google Maps GPS.
  3. Inspect vehicle seater size (`5_seater` vs `5_plus_seater`) and package scope (e.g. Foam Wash + Wax).
  4. Capture "Before" photos, execute wash, capture "After" photos.
  5. Share WhatsApp completion proof card directly to customer.
- **Most Critical Information Needed First:**
  - Scheduled appointment time (e.g. `11:00 AM`).
  - Vehicle model, color, and seater classification.
  - Customer phone and full society address with landmark.
- **Common Frustrations:**
  - Customer not answering phone upon arrival.
  - Customer vehicle being larger than booked (e.g. booked 5-seater for a 7-seater Safari).
- **Risks of User Error:** Performing standard wash when customer paid for deep foam & interior steam treatment.
- **Required Permissions:** Field Technician (assigned on-demand wash jobs, photo upload, WhatsApp proof trigger).
- **UX Needs:**
  - Clear 3-step workflow (Start Job → Photo Verification → Complete & Share).
  - Prominent seater sizing chips.
- **Success Criteria:** Technician completes inspection, photos, and WhatsApp proof without manual admin phone calls.

---

### Persona H: Solar Cleaning Staff

- **Role Overview:** Specialized technician cleaning rooftop solar panel arrays using demineralized water and telescopic carbon-fiber brushes.
- **Digital Comfort Level:** Moderate to Low.
- **Primary Devices:** Ruggedized Android smartphone (360px – 400px).
- **Environmental Context:** Rooftop environments, bright glare, outdoor safety harnesses, wet surfaces.
- **Frequency of Usage:** 2 to 4 rooftop jobs daily.
- **Primary Tasks:**
  1. Review assigned rooftop solar visits and panel counts (`panel_count`).
  2. Verify rooftop access instructions and water tap availability.
  3. Complete cleaning and upload wide-angle photo proof of clean solar array.
- **Most Critical Information Needed First:**
  - **Number of Solar Panels** (e.g. `24 Panels`, `48 Panels`) to prepare equipment and demineralized filters.
  - Site address, rooftop floor number, and customer contact.
- **Common Frustrations:**
  - Finding out rooftop has no water connection upon arrival.
  - Confusion when solar tasks look identical to car wash tasks in the UI.
- **Risks of User Error:** Severe safety hazard if technician rushes without reviewing site instructions.
- **Required Permissions:** Solar Technician (assigned solar jobs, site instructions, photo proof upload).
- **UX Needs:**
  - Distinct solar iconography (Sun / Solar array, distinct from car wash icons).
  - Prominent display of `panel_count` badge.
- **Success Criteria:** Technician verifies site scope and panel count at a glance before ascending rooftop.

---

### Persona I: Customer (Vehicle & Home Solar Owner)

- **Role Overview:** Vehicle owner living in gated societies or independent bungalows in Varanasi/Lucknow who subscribes to daily car cleaning or books on-demand detailing and solar cleaning.
- **Digital Comfort Level:** High to Moderate. Daily user of Swiggy, Zomato, Urban Company, WhatsApp.
- **Primary Devices:** iOS / Android smartphone (390px – 430px), Desktop browser (1440px).
- **Frequency of Usage:** Weekly or monthly (reviewing cleaning photos, renewing subscription, booking on-demand services).
- **Primary Tasks:**
  1. Explore service packages and transparent pricing on `home.html`.
  2. Book a doorstep car wash, solar panel cleaning, or daily cleaning trial via quick modal.
  3. Receive daily photo proof via WhatsApp every morning after vehicle cleaning.
  4. View active subscription validity and remaining car wash credits.
- **Most Critical Information Needed First:**
  - Transparent pricing based on vehicle seater size (`5 Seater` vs `5+ Seater`) or solar panel count.
  - Assurance of scratch-free, treated soft-water technique (no colony-cleaner swirls).
  - Frictionless booking without mandatory lengthy registration forms.
- **Common Frustrations:**
  - Hidden pricing or mandatory phone calls just to get a quote.
  - Complex account creation before seeing service availability.
- **Risks of User Error:** Selecting wrong vehicle seater category during self-booking.
- **Required Permissions:** Public Customer (Landing page, booking lead capture, WhatsApp support).
- **UX Needs:**
  - Trust-inspiring visual design (deep navy corporate tones, authentic customer reviews, video proof).
  - 3-field booking modal (Name, 10-digit Phone, Vehicle/Society) with instant WhatsApp confirmation.
- **Success Criteria:** Customer completes doorstep service booking in under 30 seconds.

---

## 2. Core Operational Workflow Maps

### Workflow 1: Daily Car Cleaning (DCC) Morning Lifecycle (05:00 AM – 11:00 AM)

```
[05:00 AM] Operations Manager reviews morning route roster & cleaner attendance
     │
     ├─► Cleaner Present? ──► Cleaner logs into Staff PWA (/staff) via Phone + PIN
     │                            │
     │                            ▼
     │                     Staff View: "Daily Car Cleaning" (Sequential List 1..28)
     │                            │
     │                            ▼
     │                     Arrives at Customer Stop
     │                     • Checks HSRP Plate (e.g. UP 65 AB 1234)
     │                     • Reads Parking Note ("Basement Bay 14")
     │                     • Inspects "Aaj/Kal" Badge (e.g. "Aaj: Creta")
     │                            │
     │                            ├─► Gate locked / Keys missing? ──► Tap "Call" (tel:)
     │                            │
     │                            ▼
     │                     Executes Exterior Cleaning
     │                            │
     │                            ▼
     │                     Taps "Mark Cleaned"
     │                     • Captures photo proof via camera modal
     │                     • Photo compressed client-side & tagged with IST timestamp
     │                     • If offline: Stored in IndexedDB queue with amber badge
     │                     • If online: Uploaded to Cloudinary & synced to Neon DB
     │                            │
     │                            ▼
     │                     Customer receives WhatsApp completion update
     │                     Card marked green "Cleaned" in staff app
     │                     Advances to Stop #2
     │
     └─► Cleaner Absent? ──► Operations Manager opens "Job Assignment & Dispatch"
                                  │
                                  ▼
                           Clicks "Reassign Route" ──► Selects Standby Cleaner
                                  │
                                  ▼
                           Instant Audio Alert & Toast on Standby Cleaner's phone
                           Route immediately transfers with zero data loss
```

---

### Workflow 2: On-Demand Service Booking, Dispatch & Execution Lifecycle

```
[Customer Inquires via Website or WhatsApp]
     │
     ▼
Lead captured in "Leads Pipeline" (/admin -> Leads)
     │
     ▼
Operations Manager reviews lead details:
• Customer Name, Phone, Vehicle Make & Sizing (5-seater vs 5+ seater) or Solar Panels
     │
     ▼
Converts Lead into Customer / Sells Package
• "Sell Package" Modal: Assigns Package Tier (e.g. 4-Wash Subscription or 6-Mo Solar)
     │
     ▼
Dispatcher opens "Job Assignment" -> "On-Demand Jobs"
• Creates Booking: Sets Scheduled Date, Tentative Time (e.g. 10:30 AM), Technician
     │
     ▼
Technician receives notification on mobile PWA (/staff -> "Other Jobs")
• Inspects site details: Panel Count or Vehicle Seater Type
     │
     ▼
Technician arrives at site:
1. Tap "Start Job" (Captures "Before" Photo)
2. Executes High-Pressure Wash / Rooftop Solar Cleaning
3. Tap "Complete Job" (Captures "After" Photo)
4. Tap "Share WhatsApp" ──► Generates branded before/after summary directly to customer
```

---

### Workflow 3: Route Hub Creation & Stop Sequence Optimization Lifecycle

```
[Operations / Dispatcher opens "Route Sequence" Hub]
     │
     ▼
Inspects "Unassigned DCC Workbench"
• Sees all active subscription vehicles without an assigned route
     │
     ▼
Selects Route or Clicks "Create Route"
• Route Code (e.g. VAR-SIGRA-01)
• Operational Area (e.g. Sigra / Mahmoorganj)
• Primary Assigned Cleaner (e.g. Chandan Soni)
     │
     ▼
Adds Stops to Route:
• Organizes stop order 1, 2, 3... based on geographic proximity
• Drag-and-drop or manual sequence adjustment
• Live sequence auto-reindexing preserves contiguous 1..N order
     │
     ▼
Cleaner's mobile feed updates instantly with sorted sequence
```
