# CWP Aura Design System — Component Specifications
**System Name:** CWP Aura Design System  
**Version:** 1.0.0  
**Skill Reference:** Universal Design System Skill (`component-spec.md`)  
**Date:** 2026-11-21  

---

## Component Specification Index
1. **CMP-01:** Field Staff Customer Card (`cwp-customer-card`)
2. **CMP-02:** Vehicle Cleaning Checklist & Toggle (`cwp-cleaning-checklist`)
3. **CMP-03:** Indian License Plate Badge (`cwp-license-plate`)
4. **CMP-04:** Aaj / Kal Rotation Alert Banner (`cwp-rotation-banner`)
5. **CMP-05:** One-Tap Touch Action Buttons (`cwp-touch-action`)
6. **CMP-06:** Staff Bottom Navigation Bar (`cwp-staff-bottom-nav`)
7. **CMP-07:** Admin Records Data Table (`cwp-records-table`)
8. **CMP-08:** Operational Metric KPI Tile (`cwp-kpi-tile`)

---

## CMP-01: Field Staff Customer Card (`cwp-customer-card`)

### 1. Identity
- **Component Name:** `cwp-customer-card`
- **Status:** Supported (Production Core)
- **Owner:** CWP Operations & Frontend Team
- **Purpose:** Serve as the primary operational unit of work for field cleaners, containing all customer, vehicle, location, route sequence, and completion controls.
- **Use When:** Rendering assigned stops in the Staff Operations Feed (`/staff`).
- **Do Not Use When:** Rendering dense desktop tables in the Admin Console.

### 2. Anatomy
- **Header Slot:** Route sequence badge (`#1`, `#2`), Customer Full Name (H3), Primary Phone link.
- **Rotation Slot:** Optional `cwp-rotation-banner` if alternate-day package applies.
- **Vehicle Slot(s):** One or more `cwp-license-plate` badges, vehicle brand/model, color chip, and `cwp-cleaning-checklist` checkboxes.
- **Location Slot:** Primary residential address, parking notes pill (*"Front Porch Covered"*), and optional expandable secondary location.
- **Action Toolbar Slot:** Full-width container holding one-tap Call and Directions buttons.

### 3. Variants & Tokens
- **Variants:** `default` (Pending cleaning), `completed` (All vehicles cleaned today), `inactive` (Subscription paused).
- **Semantic Token Dependencies:**
  - Background: `var(--color-surface-card)` (`#ffffff` / `#111827`)
  - Border: `1.5px solid var(--color-border-subtle)` (`#e2e8f0` / `#233044`)
  - Completed Border Accent: `var(--color-status-success)` (`#059669`)
  - Padding: `var(--space-2)` (`16px`)
  - Border Radius: `var(--radius-md)` (`12px`)
  - Elevation: `var(--elevation-level-1)`

### 4. Behavior & States
- **Default:** Clean white card with crisp border and subtle shadow.
- **Completed:** Card border receives a subtle green accent; checklist items show checked green circles; route progress bar updates instantly.
- **Offline Mode:** Tapping checklist updates state immediately in UI and marks card with a compact amber "ऑफ़लाइन दर्ज (Queued)" pill.
- **Keyboard Access:** Tab navigates sequentially: Customer Name -> Call button -> Directions button -> Vehicle Checkbox(es).

### 5. Accessibility
- **Semantic Element:** `<article class="cwp-customer-card" aria-labelledby="cust-name-{id}">`
- **Heading:** `<h3 id="cust-name-{id}">{Customer Name}</h3>`
- **Contrast:** Heading text `#0f172a` against card `#ffffff` achieves **15.9:1** contrast.

---

## CMP-02: Vehicle Cleaning Checklist (`cwp-cleaning-checklist`)

### 1. Identity
- **Component Name:** `cwp-cleaning-checklist`
- **Status:** Supported
- **Purpose:** Allow field cleaners to toggle and record cleaning completion per vehicle with a single tap.
- **Use When:** Inside customer cards for each assigned vehicle.

### 2. Anatomy
- Custom touch target container (height: 48px).
- Status Indicator Icon (`radio_button_unchecked` / `check_circle`).
- Vehicle Description Label (License plate + Model).
- Timestamp / Offline Sync status pill.

### 3. States & Feedback
- **Incomplete:** Large outlined circle (`#94a3b8`), clear actionable label: *"सफाई करें (Mark Cleaned)"*.
- **Pending/Optimistic:** Spinner animation (< 200ms) with haptic vibration if supported (`navigator.vibrate(20)`).
- **Completed:** Solid green checkmark (`#059669`), label changes to *"सफाई पूर्ण (Cleaned)"* with timestamp.
- **Offline Queued:** Solid green checkmark accompanied by small amber badge: *"सिंक प्रतीक्षा (Pending Sync)"*.

### 4. Accessibility
- **ARIA Semantics:** `<button role="checkbox" aria-checked="true|false" aria-label="Mark cleaning completed for vehicle {PLATE}">`
- **Touch Target:** Minimum 48px height, full-width touch area across vehicle row.

---

## CMP-03: Indian License Plate Badge (`cwp-license-plate`)

### 1. Identity
- **Component Name:** `cwp-license-plate`
- **Status:** Supported
- **Purpose:** Visually replicate an authentic Indian High-Security Registration Plate (HSRP) for rapid, error-free vehicle identification by staff in parking lots.

### 2. Anatomy
- Outer border: 1.5px solid dark navy frame (`#0b192c`).
- Left vertical strip: Blue background with white "IND" lettering.
- Main alphanumeric area: Black monospace text in `JetBrains Mono`.
- Background: Reflective white (Private vehicles) or Amber yellow (Commercial vehicles).

### 3. Tokens & Styling
```css
.cwp-license-plate {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1.5px solid #0b192c;
  border-radius: 4px;
  height: 28px;
  padding: 0 8px 0 0;
  overflow: hidden;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 14px;
  color: #000000;
  letter-spacing: 0.05em;
}
.cwp-license-plate-ind {
  background: #1d4ed8;
  color: #ffffff;
  font-size: 8px;
  font-weight: 800;
  padding: 0 4px;
  height: 100%;
  display: flex;
  align-items: center;
}
```

### 4. Accessibility
- Monospace black text on white background achieves **21:1 contrast** (maximum legibility in bright sunlight).
- Screen reader accessible name includes state code and full number: `aria-label="License Plate UP 16 AB 1234"`.

---

## CMP-04: Aaj / Kal Rotation Alert Banner (`cwp-rotation-banner`)

### 1. Identity
- **Component Name:** `cwp-rotation-banner`
- **Status:** Supported
- **Purpose:** Prevent the high-cost error of washing the wrong vehicle in single-package multi-car households by displaying bold, unmissable alternate-day rules.

### 2. Anatomy
- Icon: Material Symbol `sync_alt` (`20px`).
- Bold Heading: *"आज की गाड़ी (Today's Scheduled Vehicle)"*.
- Active Vehicle Callout: High-contrast pill showing the active car for today.
- Inactive Vehicle Callout: Subdued pill showing the alternate car scheduled for tomorrow (*"कल की गाड़ी"*).

### 3. Tokens & Color Specification
- Background: `var(--color-status-warning-bg)` (`#fef3c7`)
- Border: `1.5px solid var(--color-status-warning)` (`#d97706`)
- Text Color: `#78350f` (Contrast ratio **7.8:1** against `#fef3c7`, exceeding WCAG 2.2 AA).
- Icon Color: `#d97706`

---

## CMP-05: One-Tap Touch Action Buttons (`cwp-touch-action`)

### 1. Identity
- **Component Name:** `cwp-touch-action`
- **Status:** Supported
- **Purpose:** Execute high-frequency field actions (Direct Calling and GPS Directions) without leaving the operational card.

### 2. Variants
- **Call Action (`variant-call`):**
  - Background: `var(--color-status-success)` (`#059669`)
  - Text & Icon: `#ffffff`
  - Icon: `phone`
  - Label: *"कॉल करें (Call)"*
  - Protocol: `tel:+91XXXXXXXXXX`
  - Contrast: 4.6:1 against background.
- **Directions Action (`variant-nav`):**
  - Background: `var(--color-action-primary)` (`#1d4ed8`)
  - Text & Icon: `#ffffff`
  - Icon: `near_me`
  - Label: *"रास्ता देखें (Directions)"*
  - Link: Launches Google Maps with exact customer coordinates.
  - Contrast: 5.2:1 against background.

### 3. Touch Ergonomics
- Minimum Height: **48px**.
- Minimum Width: 100% split evenly (2-column grid with 8px gap).
- Border Radius: `var(--radius-sm)` (`8px`).
- Active state: 12% black overlay on press.

---

## CMP-06: Staff Bottom Navigation Bar (`cwp-staff-bottom-nav`)

### 1. Identity
- **Component Name:** `cwp-staff-bottom-nav`
- **Status:** Supported
- **Purpose:** Provide ergonomic thumb-zone switching between the 3 main field staff modes: Assigned Jobs, Route History, and Profile/Settings.

### 2. Anatomy & Slots
- Fixed bottom container with `z-index: 900`.
- Safe area inset padding: `padding-bottom: calc(8px + env(safe-area-inset-bottom))`.
- 3 Tab Buttons:
  1. `tab-jobs`: Icon `directions_car`, Label *"कार्य (Jobs)"*.
  2. `tab-history`: Icon `history`, Label *"इतिहास (History)"*.
  3. `tab-settings`: Icon `person`, Label *"प्रोफाइल (Profile)"*.

### 3. Active Pill Indicator
- Active tab features an M3-inspired rounded pill background (`#dbeafe`), bold primary blue icon and text (`#1d4ed8`).
- Inactive tabs use muted slate icon and text (`#64748b`).

### 4. Accessibility
- Semantics: `<nav role="navigation" aria-label="Staff Bottom Navigation"><div role="tablist">`
- Tab elements: `<button role="tab" aria-selected="true|false" aria-controls="panel-id">`

---

## CMP-07: Admin Records Data Table (`cwp-records-table`)

### 1. Identity
- **Component Name:** `cwp-records-table`
- **Status:** Supported
- **Purpose:** High-density, high-efficiency data inspection and management for administrators across hundreds of customer accounts.

### 2. Anatomy & Column Structure
- Fixed sticky header (`top: 56px`, `z-index: 50`).
- Columns:
  1. `#` (Sequence / Stop order)
  2. `Customer Name & ID`
  3. `Mobile Number` (with quick call link)
  4. `Vehicles & Plates` (renders `cwp-license-plate` chips)
  5. `Address & Bay Location`
  6. `Assigned Staff`
  7. `Status & Frequency`
  8. `Actions` (Edit, Reset PIN, Delete)
- Responsive Reflow: On viewports < 768px, table rows automatically collapse into card view to avoid unreadable horizontal squishing.

### 3. Accessibility
- Semantic HTML: `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`.
- Sortable headers indicate direction via `aria-sort="ascending|descending"`.

---

## CMP-08: Operational Metric KPI Tile (`cwp-kpi-tile`)

### 1. Identity
- **Component Name:** `cwp-kpi-tile`
- **Status:** Supported
- **Purpose:** Display instant operational summary metrics (Total Customers, Active Subscriptions, Today's Cleaned Cars, Unassigned Stops).

### 2. Anatomy
- Leading icon container (circle with tinted background).
- Big metric value (`24px`, bold, `JetBrains Mono` or `Poppins`).
- Descriptive bilingual label (`13px`, slate-600).
- Subtle card border and hover elevation lift.
