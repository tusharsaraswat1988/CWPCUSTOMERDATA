# CWP UX/UI Redesign Roadmap & Living Implementation Tracker

**Project:** CWP Detailers & Motors (Operations Management System & Customer Portal)  
**Document:** Master Engineering Redesign Roadmap & Implementation Tracker (Phases 0–6)  
**Date:** 2026-11-25  
**Author:** Principal Product Designer, Senior UX Architect, Senior Frontend Engineer  
**Status:** ACTIVE LIVING ROADMAP  

---

## 1. Executive Implementation Strategy

The CWP UX/UI modernization is executed in controlled, decoupled stages. Rather than performing a risky all-at-once rewrite of the 25,000-line client codebase, implementation progresses sequentially from foundations to shared components to individual screen batches. Every stage is verified against automated QA test suites before advancing.

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Baseline Architecture & Technical Inventory (COMPLETED)       │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Personas, Workflows & Screen-by-Screen Audit (COMPLETED)      │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Unified Design System & Token Binding (DEFINED)               │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Shared Component Foundation (Buttons, Tables, Menus, Modals)  │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Controlled Screen Redesign Batches (Batches 1 to 7)           │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 5: Visual QA Across All Viewports (360px, 768px, 1024px, 1440px) │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 6: Full Regression QA (55+ Automated Test Suites Passing)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Living Implementation Status Matrix

Status Labels:
- `Not Audited`
- `Audited`
- `Design Defined`
- `In Progress`
- `Implemented`
- `QA Pending`
- `Verified`
- `Blocked`

| Screen / Component Group | Primary Persona | Audit Status | Design Status | Implementation Status | QA Status | Assigned Batch |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Design Tokens & Icons Standard** | All | Audited | Design Defined | Verified | Verified | Phase 2 / Foundation |
| **Shared Action Menu (`more_vert`)** | Admin, Staff | Audited | Design Defined | Verified | Verified | Phase 3 / Foundation |
| **Shared Table & Card Transformer** | Admin | Audited | Design Defined | Verified | Verified | Phase 3 / Foundation |
| **Admin Login Gate (`/admin`)** | Super Admin, Ops | Audited | Design Defined | Verified | Verified | Batch 1 |
| **Admin App Shell & Navigation Rail**| All Admin | Audited | Design Defined | Verified | Verified | Batch 1 |
| **Customer Records Directory (`records`)**| Ops, Admin | Audited | Design Defined | Verified | Verified | Batch 2 |
| **Edit Customer Modal & Tabs** | Ops, Admin | Audited | Design Defined | Implemented | Verified | Batch 2 |
| **Admin Dashboard (`dashboard`)** | Owner, Ops | Audited | Design Defined | Verified | Verified | Batch 3 |
| **Daily Reports (`cleanReports`)** | Ops, Owner | Audited | Design Defined | Verified | Verified | Batch 3 |
| **Staff Management (`staff`)** | Ops, Owner | Audited | Design Defined | Verified | Verified | Batch 4 |
| **Designations & Org Hierarchy** | Super Admin | Audited | Design Defined | Verified | Verified | Batch 4 |
| **Route Sequence & Hub (`sequence`)**| Ops, Dispatch | Audited | Design Defined | Verified (T01.11)| Verified | Batch 5 |
| **Job Assignment (`jobAssignment`)** | Dispatch, Ops | Audited | Design Defined | Design Defined | QA Pending | Batch 5 |
| **Wash & Solar Hub (`specialJobs`)** | Dispatch, Solar | Audited | Design Defined | Design Defined | QA Pending | Batch 5 |
| **Leads Pipeline & Kanban (`leads`)** | Sales, Ops | Audited | Design Defined | Design Defined | QA Pending | Batch 6 |
| **Staff Live Tracking (`staffTracking`)**| Ops, Zone Sup | Audited | Design Defined | Design Defined | QA Pending | Batch 6 |
| **Staff Login Gate (`/staff`)** | Cleaner, Tech | Audited | Design Defined | Design Defined | QA Pending | Batch 7 |
| **Staff Daily Clean Route (`/staff`)** | Cleaner (DCC) | Audited | Design Defined | Design Defined | QA Pending | Batch 7 |
| **Staff Other Jobs & 3-Step Proof** | Wash/Solar Tech| Audited | Design Defined | Design Defined | QA Pending | Batch 7 |
| **Customer Homepage (`public/home.html`)**| Customer | Audited | Design Defined | Design Defined | QA Pending | Batch 7 |
| **Customer Booking Modal** | Customer | Audited | Design Defined | Design Defined | QA Pending | Batch 7 |
| **Careers Portal (`public/careers.html`)**| Applicant | Audited | Design Defined | Design Defined | QA Pending | Batch 7 |

---

## 3. Implementation Batches & Action Plan

### Batch 1: Admin Navigation Shell & Enterprise Login Gate
- **Objective:** Establish the quiet, professional enterprise console shell and eliminate the sci-fi canvas login orb.
- **Key Tasks:**
  1. Replace "Tap core to authenticate" 3D canvas orb on `/admin` with a clean, accessible enterprise login card featuring the official CWP logo, password toggle, and clear error messaging.
  2. Streamline Admin navigation rail: quiet icons with Material Symbols, high-contrast active states, and persistent tooltips on collapsed viewports.
  3. Relocate "Change Admin Password" from the staff roster to a header profile popover menu.
- **Safety Gate:** Verify unauthenticated `/admin` redirection, 12-hour session persistence, and session recovery across page refreshes.

### Batch 2: Customer Records Directory & Customer Modals (P0 Priority)
- **Objective:** Eliminate horizontal table overflow and the 416-button clutter across customer records.
- **Key Tasks:**
  1. Consolidate row action buttons (`Map`, `Service`, `Edit`, `Delete`) into a single contextual action menu (`more_vert`).
  2. Implement responsive table transformation: on viewports < 768px, table transforms into clean stacked customer cards.
  3. Convert 5 huge stacked KPI cards into a compact horizontal pill strip.
  4. Fix Edit Customer modal header horizontal scrollbar and separate the destructive `Delete Customer` action.
- **Safety Gate:** Run `tests/test_dom_contract_reconciliation_qa.js` and verify zero customer data loss or edit leakage.

### Batch 3: Executive Dashboard & Daily Clean Reports
- **Objective:** Transform cluttered multi-card layouts into calm, scannable intelligence dashboards.
- **Key Tasks:**
  1. Consolidate Dashboard from 10 cards to 4 core operational metrics with Material Symbols (zero emojis).
  2. Streamline Daily Clean Reports filter toolbar: single-row period and cleaner selector.
  3. Ensure report photo thumbnails open accessible full-resolution lightbox viewer.
- **Safety Gate:** Run `tests/test_daily_clean_reports_backend.js` and `tests/test_daily_clean_photo_and_reports_frontend.js`.

### Batch 4: Staff Management & Designations Console
- **Objective:** Eliminate the cramped 6-control inline staff creation form and row action clutter.
- **Key Tasks:**
  1. Replace inline form with a dedicated, accessible `+ Add Staff` modal dialog.
  2. Redesign staff cards with clean hierarchy: Staff photo/initials, name, designation, capacity, and a single `more_vert` menu for secondary actions.
  3. Ensure masked PIN reveal adheres strictly to administrative authorization.
- **Safety Gate:** Run `tests/test_staff_pin_reveal_qa.js` and `tests/test_staff_extended_fields_qa.js`.

### Batch 5: Job Assignment & Wash & Solar Hub
- **Objective:** Streamline morning cleaner dispatch and on-demand job tracking.
- **Key Tasks:**
  1. Consolidate the 5 stacked filter tiers in Wash & Solar Hub into a unified tabbed toolbar.
  2. Clearly differentiate vehicle wash cards (`5_seater` vs `5_plus_seater`) from rooftop solar arrays (`panel_count`).
  3. Verify seamless integration with the Task 01.11 Route Management Hub.
- **Safety Gate:** Run `tests/test_service_catalog_and_reassignment_qa.js` and `tests/test_route_management_ui_first_qa.js`.

### Batch 6: Leads Pipeline & Staff Live Tracking
- **Objective:** Modernize lead conversion workflows and real-time GPS field tracking.
- **Key Tasks:**
  1. Fix table horizontal overflow on Leads table and make "Convert" button prominent.
  2. Eliminate emoji icons from pipeline status cards.
  3. Optimize staff tracking layout with responsive drawer over Leaflet map.
- **Safety Gate:** Run `tests/test_leads_feature_qa.js` and `tests/test_lead_edit_qa.js`.

### Batch 7: Staff Mobile PWA & Customer Homepage
- **Objective:** Finalize outdoor mobile touch ergonomics for cleaners and brand alignment for customers.
- **Key Tasks:**
  1. Enforce 48x48px touch targets for Call and Directions buttons on mobile cleaner cards.
  2. Implement `env(safe-area-inset-bottom)` on staff bottom navigation.
  3. Align Customer Homepage color tokens with Deep Navy `#0b192c` brand anchor.
- **Safety Gate:** Run `tests/test_pwa_staff_qa.js` and `tests/test_homepage_and_careers_qa.js`.

---

## 4. Verification Protocol & Quality Gates

A batch cannot be merged or marked `Verified` until all 5 gates pass:

1. **Design Gate:**
   - Adheres 100% to tokens in `m3-tokens.css`.
   - Exactly zero Unicode system emojis in UI controls or badges.
   - Material Symbols Outlined used consistently.
2. **UX Gate:**
   - Dominant primary action clearly identifiable.
   - Secondary actions consolidated into contextual menu (`...`).
   - Cognitive load reduced; no redundant filter bars.
3. **Responsive Gate:**
   - Tested at 360px (mobile), 768px (tablet), 1024px (compact desktop), and 1440px (desktop).
   - Zero horizontal overflow or clipped text.
   - Touch targets >= 48x48px on mobile viewports.
4. **Functional Safety Gate:**
   - All forms submit correctly with error handling and data preservation.
   - All 100+ DOM element IDs verified in `tests/test_dom_contract_reconciliation_qa.js` remain intact.
5. **Engineering Regression Gate:**
   - `npm test` runs all 55+ test suites with 100% pass rate.
   - Zero console errors in browser dev tools.
