# CWP Unified Design System Specification & Component Standards

**Project:** CWP Detailers & Motors (Operations Management System & Customer Portal)  
**System Name:** CWP Aura Design System (Material Design 3 & Operational Synthesis)  
**Document:** Design System Specification & Component Standards (Phase 2)  
**Date:** 2026-11-25  
**Author:** Principal Product Designer, Senior Design System Engineer  
**Status:** APPROVED SPECIFICATION  

---

## 1. Design System Philosophy & Principles

The CWP Unified Design System unifies the Admin Operations Console, Staff Mobile PWA, and Customer Web Applications into a cohesive, production-grade business platform. The system synthesizes:
1. **W3C WCAG 2.2 Level AA Accessibility Standards:** Strict contrast minimums (>= 4.5:1 text, >= 3:1 controls), visible 2px focus indicators, and 48x48px touch targets for mobile.
2. **Google Material Design 3 (M3 / Material You):** Dynamic surface container hierarchy, standardized elevation levels (0–5), state layers, and Material Symbols Outlined typography.
3. **Apple Human Interface Guidelines (HIG):** Thumb-zone navigation for one-handed mobile operations and native safe area handling (`env(safe-area-inset)`).
4. **Automotive Operational Realism:** High-contrast sunlight readability (100,000 lux legibility in Indian field conditions), authentic Indian HSRP license plate rendering, and bilingual Devanagari (Hindi) typography.

---

## 2. Design Tokens (W3C DTCG Format & CSS Custom Properties)

All visual attributes are strictly bound to semantic tokens defined in `public/css/m3-tokens.css`. Arbitrary inline hex colors, pixel margins, and custom shadows are prohibited.

### 2.1 Color System

#### A. Brand & Neutral Palette
- **Brand Navy Anchor (`--color-primitive-navy-900`):** `#0b192c` — Represents precision, automotive heritage, and stability. Used for primary app bar, brand headers, and high-contrast badges.
- **Brand Navy Deep (`--color-primitive-navy-950`):** `#07101c` — Dark mode canvas and extreme-contrast containers.
- **Action Cobalt Primary (`--color-primitive-blue-700`):** `#1d4ed8` — Dominant interactive action color.
- **Action Cobalt Hover (`--color-primitive-blue-600`):** `#2563eb` — Interactive hover and focus state color.
- **Neutral Canvas (`--color-surface-canvas`):** `#f8fafc` — Crisp, cool neutral background reducing eye strain.
- **Neutral Card Surface (`--color-surface-card`):** `#ffffff` — Elevated white container for cards, tables, and dialogs.
- **Neutral Borders (`--color-border-subtle`):** `#e2e8f0` — Subtle 1px structural container borders.
- **Input Borders (`--color-border-input`):** `#cbd5e1` — High-contrast 3:1 control boundaries for WCAG compliance.

#### B. Semantic Operational Palette
- **Success & Dial (`--color-status-success`):** `#059669` (Dark text) / `#d1fae5` (Container) — Completed tasks, active subscriptions, and one-tap telephone dialer.
- **Warning & Rotation (`--color-status-warning`):** `#d97706` (Dark text) / `#fef3c7` (Container) — Aaj/Kal vehicle rotation, pending items, and unassigned alerts.
- **Destructive & Error (`--color-status-error`):** `#dc2626` (Dark text) / `#fee2e2` (Container) — Deletion actions, job cancellations, and validation errors.
- **Informational / Dispatch (`--color-action-navigate`):** `#2563eb` — GPS navigation, in-transit state, and informational callouts.

---

### 2.2 Typography Scale & Bilingual Standards

CWP serves a bilingual operational team. Typography uses `Poppins` for Latin numerals and English strings, paired with `Noto Sans Devanagari` for Hindi strings.

- **Devanagari Vowel Matra Rule:** All text containers containing Hindi script must enforce `line-height: 1.5` minimum to prevent vertical vowel clipping (`ि`, `ी`, `ु`, `ू`, `े`, `ै`).

| Token Name | Font Size | Font Weight | Line Height | Usage Context |
| :--- | :--- | :--- | :--- | :--- |
| `--type-display-lg` | 28px | 700 Bold | 1.2 | Marketing Hero Headers (`home.html`) |
| `--type-headline-md`| 20px | 700 Bold | 1.3 | Admin Page Titles, Staff View Headers |
| `--type-title-md`   | 16px | 600 SemiBold| 1.4 | Section Headings, Modal Dialog Titles |
| `--type-body-lg`    | 15px | 500 Medium  | 1.5 | Primary Customer Name, Staff Name, Inputs |
| `--type-body-md`    | 14px | 400 Regular | 1.5 | Table Body Cells, Secondary Addresses |
| `--type-label-bold` | 13px | 600 SemiBold| 1.4 | Form Field Labels, Button Labels, Column Headers |
| `--type-badge-mono` | 14px | 700 Bold    | 1.0 | Authentic HSRP License Plate Text (Monospace) |
| `--type-caption-sm` | 12px | 500 Medium  | 1.4 | Timestamps, Secondary Metadata, Helper Text |

---

### 2.3 Spatial Scale (8dp Grid)

All padding, margins, gaps, and heights adhere to an 8dp grid (with a 4px half-step for micro-alignment):

```css
--space-05: 4px;   /* Micro spacing, badge internal padding */
--space-1:  8px;   /* Button gaps, chip margins, compact table padding */
--space-15: 12px;  /* Card gaps, input field internal vertical padding */
--space-2:  16px;  /* Standard container padding, screen margins */
--space-25: 20px;  /* Section separation */
--space-3:  24px;  /* Large card padding, modal body padding */
--space-4:  32px;  /* Page block separation */
--space-6:  48px;  /* Minimum touch target height for mobile */
```

---

### 2.4 Elevation & Shape Hierarchy

- **Radii:**
  - Micro (`--radius-xs`): `4px` (Tags, chips)
  - Small (`--radius-sm`): `8px` (Inputs, buttons, table rows)
  - Medium (`--radius-md`): `12px` (Cards, dropdown menus)
  - Large (`--radius-lg`): `16px` (Modal dialogs, bottom sheets)
  - Full (`--radius-full`): `9999px` (Pill badges, status indicators)
- **Elevation Shadows:**
  - `Level 0`: Flat (bordered surfaces, data tables)
  - `Level 1`: Subtle cards (`0 1px 3px 1px rgba(15, 23, 42, 0.08)`)
  - `Level 2`: Hover states, dropdown menus (`0 2px 6px 2px rgba(15, 23, 42, 0.08)`)
  - `Level 3`: Modal dialogs, floating action bars (`0 4px 8px 3px rgba(15, 23, 42, 0.10)`)

---

## 3. Mandatory Icon Standards (Google Material Symbols Outlined)

In strict compliance with Master Task Section 5.4, **all Unicode system emojis are banned** from interface controls, tables, buttons, and badges. The entire platform standardizes exclusively on **Google Material Symbols Outlined** (variable font: Optical Size 24, Weight 400, Fill 0/1).

### 3.1 Official CWP Icon Mapping Table

| Operational Function | Material Symbol Name | Visual Rendering Class | Usage Context |
| :--- | :--- | :--- | :--- |
| **Add / Create** | `add` / `add_circle` | `material-symbols-outlined` | "+ New Customer", "+ Add Staff", "+ Create Route" |
| **Edit / Modify** | `edit` | `material-symbols-outlined` | "Edit Customer", "Edit Route", "Edit Staff" |
| **Delete / Remove** | `delete` | `material-symbols-outlined text-danger` | Destructive record deletion (guarded by modal) |
| **Archive / Deactivate** | `archive` / `block` | `material-symbols-outlined` | Route pausing, staff deactivation |
| **Search** | `search` | `material-symbols-outlined` | Search inputs across tables and feeds |
| **Filter** | `tune` / `filter_alt` | `material-symbols-outlined` | Multi-category filter triggers |
| **Sort / Reorder** | `swap_vert` / `drag_indicator` | `material-symbols-outlined` | Table column sorting, route stop drag handles |
| **Calendar / Date** | `calendar_today` / `event` | `material-symbols-outlined` | Scheduled service dates, period selection |
| **Location / GPS** | `location_on` / `near_me` | `material-symbols-outlined` | Primary customer address, Google Maps launch |
| **Phone / Dial** | `call` | `material-symbols-outlined` | Direct `tel:` calling button for field staff |
| **WhatsApp** | `chat` / `forum` | `material-symbols-outlined` | WhatsApp proof share, customer messaging |
| **Customer / Client** | `person` / `account_circle` | `material-symbols-outlined` | Customer directory, profile avatars |
| **Vehicle / Car** | `directions_car` | `material-symbols-outlined` | Daily car cleaning, vehicle models, HSRP plates |
| **Staff / Crew** | `badge` / `group` | `material-symbols-outlined` | Staff management, cleaner allocation |
| **Daily Car Cleaning**| `local_car_wash` | `material-symbols-outlined` | DCC service tabs, route badges |
| **Car Wash & Foam** | `water_drop` | `material-symbols-outlined` | On-demand pressure wash service |
| **Solar Cleaning** | `solar_power` | `material-symbols-outlined` | Rooftop solar array cleaning, panel count |
| **Interior Detailing**| `airline_seat_recline_extra` | `material-symbols-outlined` | Deep cleaning, upholstery extraction |
| **Exterior Detailing**| `auto_awesome` | `material-symbols-outlined` | Ceramic coating, waxing, polishing |
| **Payment / Pricing** | `payments` / `currency_rupee` | `material-symbols-outlined` | Package sales, subscriptions, billing |
| **Status: Completed** | `check_circle` | `material-symbols-outlined text-success` | Verified cleans, completed jobs |
| **Status: Pending** | `schedule` / `hourglass_empty` | `material-symbols-outlined text-warning` | Scheduled tasks awaiting cleaner punch |
| **Status: Exception** | `error` / `warning` | `material-symbols-outlined text-danger` | Car not present, gate locked, overdue |
| **Settings / Admin** | `settings` | `material-symbols-outlined` | Portal preferences, system settings |
| **Reassign / Transfer**| `swap_horiz` / `change_circle` | `material-symbols-outlined` | Reassign cleaner, transfer route stop |
| **History / Audit** | `history` | `material-symbols-outlined` | Audit logs, package redemption history |
| **Refresh / Sync** | `refresh` / `sync` | `material-symbols-outlined` | Real-time data refresh, offline sync status |
| **Camera / Proof** | `photo_camera` | `material-symbols-outlined` | Field photo proof capture, inspection lightbox |
| **More / Context Menu**| `more_vert` | `material-symbols-outlined` | Table row secondary actions menu |

---

## 4. Shared Component Specifications & Behavior Standards

### 4.1 Buttons

- **Primary Action (`.btn-primary`):** Solid Cobalt Blue (`#1d4ed8`), white text, bold font, 8px radius. Maximum **one primary button** per view hierarchy.
- **Secondary Action (`.btn-secondary`):** White surface, 1px slate-300 border, slate-800 text. Used for "Export CSV", "Cancel", "Filter".
- **Tertiary / Ghost Action (`.btn-ghost`):** Transparent background, slate-600 text, slate-100 hover background. Used for navigation and light toggles.
- **Destructive Action (`.btn-destructive`):** Solid or outlined Crimson Red (`#dc2626`). Must be visually separated from primary save actions and guarded by a confirmation dialog.
- **Contextual Action Menu Trigger (`.btn-icon-menu`):** Compact 36x36px (desktop) or 48x48px (mobile) ghost button containing `more_vert`. Opens a lightweight positioned dropdown containing secondary actions (Edit, Reassign, View History, Delete).
- **Mobile Touch Target:** Minimum **48 by 48 CSS pixels** on mobile viewports (< 768px).

---

### 4.2 Data Tables & Responsive Transformation

- **Desktop Standard (>= 1025px):**
  - High-density layout (48px row height).
  - Sticky table header (`top: 0`, `z-index: 10`) with solid surface-low background (`#f1f5f9`).
  - Strict column prioritization: Customer Info, Vehicle Plate, Address, Service Status, Contextual Menu (`...`).
  - Zero multi-button clusters on rows.
- **Tablet Reflow (768px – 1024px):**
  - Secondary columns (e.g. secondary address, detailed coordinates) collapse into an expandable accordion row or detail drawer.
  - Horizontal scrollbars within tables are strictly eliminated.
- **Mobile Transformation (< 768px):**
  - Tables automatically transform via CSS into stacked **Record Cards**.
  - Each card presents:
    - Header: Customer Name + HSRP License Plate badge
    - Body: Primary Address + Service Status Chip
    - Footer: Direct Call button + `more_vert` menu.

---

### 4.3 Form Inputs & Validation

- **Height & Spacing:** 48px height on mobile (`--space-6`), 40px height on desktop (`--space-5`).
- **Input Boundaries:** 1.5px solid `--color-border-input` (`#cbd5e1`), achieving 3.5:1 contrast against white backgrounds.
- **Focus Rings:** 2px solid `--color-border-focus` (`#2563eb`) with a 2px offset ring, meeting WCAG 2.2 SC 2.4.7 and SC 2.4.13.
- **Indian Mobile Validation:** Integrated `+91` prefix with automated 10-digit sanitization (strips spaces, dashes, leading zeroes).
- **Hindi Transliteration:** Instant transliteration helper beneath English name inputs, with clickable editable badge.
- **Error States:** Red input boundary (`#dc2626`), inline accessible error message with `error` icon and explicit corrective advice.

---

### 4.4 Modal Dialogs & Bottom Drawers

- **Desktop Modals:** Centered in viewport, maximum width 640px (or 880px for multi-tab workflows), elevation Level 3.
- **Mobile Transformation (< 600px):** Modals transform into bottom-anchored sheets (`bottom-sheet`) with touch drag handle and full-width safe-area actions.
- **Header:** Title + Subtitle + Explicit accessible close button (`close` icon, `aria-label="Close dialog"`).
- **Body:** Scrollable container (`max-height: calc(85vh - 120px)`) with trapped tab keyboard focus.
- **Footer:** Fixed, non-scrolling sticky action footer. Primary submit on the right; Cancel on the left; Destructive actions strictly separated.
- **Keyboard Behavior:** Pressing `Escape` closes the dialog; focus returns to the triggering element.

---

### 4.5 Status Badges & Vehicle Tags

- **Color Independence Rule:** No badge conveys status by color alone. Every badge pairs a background tint, an explicit text label, and a distinct Material Symbol icon.
- **HSRP License Plate Component:**
  - White background for private vehicles (`#ffffff`), Yellow background for commercial vehicles (`#fde047`).
  - Bold black monospace text (`JetBrains Mono` / `Consolas`).
  - Left-aligned blue strip with white `IND` lettering and Ashoka Chakra circle.

---

## 5. Responsive Breakpoint Matrix

| Viewport Range | Breakpoint Token | Target Platform | Layout Strategy |
| :--- | :--- | :--- | :--- |
| **320px – 375px** | `compact-sm` | Entry-tier Android (Jio, Redmi 720p) | Single-column, stacked cards, full-width 48px touch targets, zero tables |
| **376px – 430px** | `compact-md` | Standard Smartphones (iPhone 14/15, Galaxy S) | Single-column, thumb-zone bottom navigation, sticky primary actions |
| **431px – 767px** | `compact-lg` | Large Phablets, Foldables | 2-column KPI grids, responsive record cards, bottom sheet dialogs |
| **768px – 1024px** | `medium` | Tablets, iPad 10", Folded Laptops | Collapsed rail navigation, prioritized 5-column tables, drawer dialogs |
| **1025px and above**| `expanded` | Desktop Workstations, 1080p/4K Monitors | Expanded sidebar navigation, high-density tables, multi-column forms |
