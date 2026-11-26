# CWP UX/UI Issue Register & Defect Taxonomy

**Project:** CWP Detailers & Motors (Operations Management System & Customer Portal)  
**Document:** UX/UI Issue Register & Defect Remediation Log (Phase 1)  
**Date:** 2026-11-25  
**Author:** Principal Product Designer, Senior UX Architect, Accessibility Specialist  
**Status:** APPROVED BASELINE  

---

## 1. Issue Taxonomy & Severity Classification

This register catalogs all user experience defects, visual design flaws, accessibility violations, and ergonomic risks identified during the Phase 0 and Phase 1 audits.

| Severity Level | Definition | SLA / Priority |
| :--- | :--- | :--- |
| **FATAL** | Functional or navigational blocker preventing task completion or causing data loss / error. | Immediate (P0) |
| **HIGH** | Major usability defect, severe horizontal overflow, action proliferation, or WCAG AA failure. | High (P0 - P1) |
| **MEDIUM** | Visual inconsistency, cognitive clutter, redundant controls, or sub-optimal spacing. | Medium (P1 - P2) |
| **LOW** | Minor aesthetic blemish, micro-typography inconsistency, or non-blocking polish item. | Low (P2) |

---

## 2. Comprehensive Issue Register

### Category 1: Information Architecture & Visual Hierarchy (IA)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **IA-01** | **HIGH** | Customer Records (`tabBtnRecords`) | 5 stacked KPI cards above data table. | On mobile/tablet, user must scroll past 640px of cards before seeing records or search. | Convert KPI cards into a compact horizontal scroll strip or collapsible summary. | Search and first customer record visible above the fold on 768px tablet. |
| **IA-02** | **HIGH** | Wash & Solar Hub (`tabBtnSpecialJobs`) | 5 stacked visual layers (Header, KPIs, Period chips, Category chips, Dropdown toolbar). | Over 520px of vertical space consumed; only 1–2 table rows visible on 1080p laptop displays. | Consolidate period and category filters into a unified single-row toolbar with tabbed view toggle. | Table starts within 240px from page top on 1440px desktop. |
| **IA-03** | **MEDIUM** | Staff Management (`tabBtnStaff`) | "Change Admin Password" card placed at bottom of staff roster. | Administrative credential management is buried beneath field staff cards. | Move Admin Password to header user profile menu or dedicated Security settings dialog. | Security settings removed from staff roster; accessible via top avatar dropdown. |
| **IA-04** | **MEDIUM** | Admin Dashboard (`tabBtnDashboard`) | 10 disconnected card containers across 3 rows without clear visual hierarchy. | User cannot immediately identify which operational metric requires immediate attention. | Consolidate into 4 core operational cards (DCC Fulfillment, Active Crew, On-Demand, Quality Audit). | Executive dashboard scannable in < 5 seconds. |

---

### Category 2: Button & Action Proliferation (ACT)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ACT-01** | **HIGH** | Customer Records (`tabBtnRecords`) | 4 separate action buttons (`Map`, `Service`, `Edit`, `Delete`) on every single table row. | 416 competing buttons on a 104-row list; table overflows horizontally; severe visual clutter. | Consolidate secondary actions into a single contextual action menu (`...`); keep row click for details. | Maximum 1 action menu button per row; zero horizontal table scrollbar on 1440px desktop. | **REMEDIATED (Batch 2)** |
| **ACT-02** | **HIGH** | Staff Management (`tabBtnStaff`) | 5 competing action buttons (`Reset Device`, `Edit`, `Active`, `Open`, `Delete`) on each staff card. | Buttons compete for attention; accidental deletion or PIN reset risk; card overflows horizontally. | Single primary button (`Edit Staff`); secondary actions placed in contextual menu (`...`). | Clean staff card with 1 primary action and 1 menu trigger. | Pending Batch 4 |
| **ACT-03** | **MEDIUM** | Customer Records Header | 5 competing action buttons (`+ Lead`, `+ New Customer`, `Auto Indic`, `Export CSV`, refresh). | No clear visual hierarchy; user unsure which action is primary. | Elevate `+ New Customer` as the dominant primary button; quiet secondary styling for others. | Exactly one primary solid blue button in screen header. | **REMEDIATED (Batch 2)** |
| **ACT-04** | **HIGH** | Leads Pipeline (`tabBtnLeads`) | "Convert" button placed at the far right of wide table. | Button is clipped by table overflow; user cannot convert lead without scrolling right. | Make "Convert" the primary prominent row action; place in visible fixed column or card footer. | Convert button 100% visible on all viewports without scrolling. | Pending Batch 6 |

---

### Category 3: Table Usability & Horizontal Overflow (TBL)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TBL-01** | **FATAL** | Customer Records (`tabBtnRecords`) | 11-column desktop table forced on tablet and mobile viewports. | On 768px tablet, address and actions columns are completely cut off; unreadable on mobile. | Implement responsive card transformation: table transforms into clean stacked record cards < 768px. | Zero horizontal overflow; all customer details readable on 360px mobile. | **REMEDIATED (Batch 2)** |
| **TBL-02** | **HIGH** | Daily Reports (`tabBtnCleanReports`) | 7 wide columns including timestamp, photo, notes, and actions. | Horizontal scrollbar appears on 1280px laptops; photo proof thumbnail is cramped. | Sticky header, prioritized columns, and modal lightbox preview on photo click. | Table fits standard 1280px laptop without horizontal scrollbar. | Pending Batch 3 |
| **TBL-03** | **MEDIUM** | Leads Table (`tabBtnLeads`) | Remarks/notes column has inline textarea with native scrollbar. | Unruly row heights and broken alignment. | Truncate notes with "Read more" tooltip or detail drawer click. | Uniform row height of 52px across all rows. | Pending Batch 6 |

---

### Category 4: Form & Modal Ergonomics (FRM)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FRM-01** | **HIGH** | Edit Customer Modal (`editCustomerModal`) | 6 horizontal tabs (`Profile`, `Locations`, etc.) overflow on screens < 900px. | Horizontal scrollbar appears inside modal header; tabs cut off on tablet. | Responsive segmented tabs with horizontal swipe or two-row wrap. | All modal tabs visible without horizontal scrollbar on 768px tablet. | Pending Batch 2 Polish |
| **FRM-02** | **HIGH** | Staff Management (`tabBtnStaff`) | Inline staff creation form squishes 6 controls side-by-side. | Fields are cramped (< 120px width), labels truncate, unusable on mobile/tablet. | Replace inline form with a dedicated `+ Add Staff` modal dialog. | Clean, accessible modal dialog with standard 48px input fields. | Pending Batch 4 |
| **FRM-03** | **MEDIUM** | Edit Customer Modal Footer | Destructive `Delete Customer` button placed directly adjacent to `Save Changes`. | Accidental deletion risk when attempting to submit form updates. | Separate destructive action with visual divider and require explicit confirmation modal. | Red delete button placed on opposite side from primary submit button. | Pending Batch 2 Polish |

---

### Category 5: Mobile & Responsive Breakpoints (RSP)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSP-01** | **HIGH** | Staff Portal (`/staff`) | Bottom navigation bar lacks safe-area insets. | Tab bar overlaps home indicator on iOS and gestures on modern Android devices. | Add `padding-bottom: env(safe-area-inset-bottom)` and minimum 56px height. | Zero overlap with device navigation bars across iOS and Android. | Pending Batch 7 |
| **RSP-02** | **HIGH** | Staff Portal Customer Cards | Touch targets for Call, Directions, and Mark Cleaned < 48px in certain states. | Missed taps when cleaners have wet hands or wear gloves in morning operations. | Enforce strict 48x48px minimum touch target with 8px spatial separation. | 100% of interactive elements meet 48px touch target standard. | Pending Batch 7 |
| **RSP-03** | **MEDIUM** | Admin Console Navigation | Collapsed rail navigation icons lack tooltips on tablet viewports. | Users cannot identify tab destinations without expanding sidebar. | Add accessible floating tooltips and text labels on touch/hover. | All navigation icons display destination label on hover/focus. | Pending Batch 1 Polish |

---

### Category 6: Accessibility, Focus & Contrast (A11Y)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A11Y-01** | **FATAL** | Admin Login Gate (`/admin`) | "Tap core to authenticate" 3D canvas orb has no keyboard focus or ARIA role. | Blind, low-vision, or keyboard-only users cannot log in to the admin console. | Replace canvas orb with standard accessible HTML `<form>` and `<input>`. | 100% keyboard operable (Tab, Enter) with visible 2px focus ring. | **REMEDIATED (Batch 1)** |
| **A11Y-02** | **HIGH** | All Data Badges | Status communicated with low-contrast pastel colors without distinct icons. | Fails WCAG 2.2 SC 1.4.1 (Use of Color) and SC 1.4.3 (Contrast Minimum). | Pair every badge with high-contrast text (>= 4.5:1) and a distinctive Material Symbol icon. | All status badges achieve >= 4.5:1 contrast and color independence. | Pending Batch 3 |
| **A11Y-03** | **MEDIUM** | Staff Portal Hindi Strings | Line-height set to tight values (`1.2`), causing vowel matra clipping. | Hindi text appears clipped or illegible on Android mobile screens. | Enforce minimum `line-height: 1.5` on all Devanagari text containers. | Zero vowel matra clipping across all Hindi strings. | Verified (DDR-002) |

---

### Category 7: Decorative & Brand Consistency (BRD)

| Issue ID | Severity | Affected Screens | Root Cause | Observed Impact | Proposed Remedy | Verification Criteria | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BRD-01** | **HIGH** | Product-Wide | Unicode system emojis (`🚗`, `☀️`, `🧼`, `🎯`, `📥`, `📞`, `🗑️`, `💾`) used in UI buttons and badges. | Unprofessional appearance; renders inconsistently across OS platforms; breaks typography baseline. | Replace 100% of emojis with Google Material Symbols Outlined font. | Zero system emojis in interface controls, tables, buttons, or badges. | **REMEDIATED (Directory/Dash)** |
| **BRD-02** | **MEDIUM** | CSS Architecture | Monolithic `style.css` contains 21,111 lines with duplicate `.admin-card-section` rules. | Style regression risk; slow debugging; CSS bloat (572 KB). | Modernize and consolidate shared components into modular, token-bound CSS. | Unified design tokens in `m3-tokens.css` govern all visual styles. | **REMEDIATED (m3-tokens)** |
| **BRD-03** | **MEDIUM** | Admin Header & Branding | Multiple conflicting brand colors (Teal `#008080`, Orange `#f59e0b`, Blue `#2563eb`). | Brand looks disjointed and lacks coherent enterprise identity. | Standardize on Deep Navy (`#0b192c`) brand anchor with Cobalt Blue (`#1d4ed8`) primary action. | Strict brand color palette enforced across all application surfaces. | Verified (Task 01.10) |
