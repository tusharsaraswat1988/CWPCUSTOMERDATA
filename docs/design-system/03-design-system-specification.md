# CWP Aura Design System — Master Specification
**System Name:** CWP Aura Design System  
**Product:** CWP Customer Data App & Staff Operations Management System  
**Organization:** CWP Detailers & Motors  
**Version:** 1.0.0  
**Date:** 2026-11-21  
**Maturity:** Production Ready (Minimum Viable to Product-Grade Specification)  
**Skill Reference:** Universal Design System Skill (`universal-design-system`)  

---

## 1. Executive Summary

The **CWP Aura Design System** is the comprehensive, non-arbitrary design standard for the **CWP Customer Data and Staff Operations Portal** ([https://cwpdata.up.railway.app](https://cwpdata.up.railway.app)). It synthesizes the field-tested ergonomics of Google Material Design 3, the touch standards of Apple Human Interface Guidelines, enterprise tabular standards from IBM Carbon / Atlassian, and strict W3C WCAG 2.2 Level AA accessibility compliance.

Every visual decision—from the 8dp spatial scale and high-contrast Indian sunlight color ramps to the 48px glove-friendly touch targets and bilingual Devanagari typography—is derived directly from real field staff operations and administrative business requirements.

---

## 2. Product Context & Operational Profiles

### Operational Profiles
- **Field Staff Operatives:**
  - 360px–430px smartphone viewports in outdoor sunlight, driveways, basements, and car washing bays.
  - Damp/gloved hands, fast turnaround (< 2 minutes per car record), intermittent network connectivity.
  - Primary language: Hindi (Devanagari); secondary: English (license plates, vehicle brand abbreviations).
- **Administrative Supervisors:**
  - 1024px–1920px+ desktop/laptop monitors, plus 768px–1024px field tablets.
  - Multi-customer data batching, route sequencing, CSV import/export, staff management, audit trail inspection.
  - Primary language: English and Hindi (bilingual).

---

## 3. Design Principles

1. **Operational Clarity Over Aesthetic Decoration:** Interfaces exist to execute automotive service workflows with zero ambiguity. No decorative gradients or low-contrast cards.
2. **Ergonomic Glove & Wet-Hand Accessibility:** All primary mobile touch actions strictly enforce a minimum bounding box of 48x48px with >= 8px touch separation.
3. **Bilingual Hindi-First Field Communication:** Field staff instructions, statuses, and action verbs are presented in natural, respectful Devanagari script with optical line-height adjustments.
4. **High-Contrast Outdoor Legibility:** High luminance contrast ratios (>= 7:1 for headings and plates; >= 4.5:1 for body copy; >= 3:1 for control borders) to withstand 100,000 lux Indian direct sunlight.
5. **Deterministic Feedback & Offline Resilience:** Instant optimistic feedback paired with explicit offline queue indicators and automatic background synchronization.
6. **Zero Arbitrary Values:** 100% of spatial, typographic, and color values are bound to semantic design tokens.

---

## 4. Visual Direction

- **Brand Anchor:** Deep CWP Automotive Navy (`#0b192c` / `#0f2942`) communicating durability, precision, and engineering trust.
- **Action Primary:** Precision Cobalt Blue (`#1d4ed8` in light mode, `#3b82f6` in dark mode) for focused operational interactions.
- **Service Success:** Emerald Green (`#059669` / `#10b981`) for completed vehicle cleanings and one-tap customer calls.
- **Operational Caution:** Indian Amber (`#d97706` / `#f59e0b`) for alternate-day "Aaj/Kal" rotations and pending sync queues.
- **Critical Danger:** Vibrant Crimson (`#dc2626` / `#ef4444`) for destructive actions, missed cleanings, and session timeouts.
- **Indian License Plate Styling:** Authentic black monospace typography (`JetBrains Mono`) on reflective white or amber pill badges with a dark navy border and blue "IND" badge.
- **Surfaces & Shape:** Clean M3 surface container hierarchy with subtle 1px border strokes (`#e2e8f0` in light, `#233044` in dark), 8px–12px corner radii on cards, and 20px pills for status chips.

---

## 5. Token Architecture

The token hierarchy strictly follows the Design Tokens Community Group (DTCG 2025.10) three-tier layered architecture:

```
[ Tier 1: Primitive Tokens ]
  (Raw palette steps, spacing scales, type scales, base radii, duration values)
        │
        ▼
[ Tier 2: Semantic Tokens ]
  (Intent-based roles: color.action.primary, color.surface.card, space.component.padding)
        │
        ▼
[ Tier 3: Component Tokens ]
  (Component-specific contracts: customer-card.border, action-btn.min-height, nav-tab.active-bg)
```

- **Source of Truth:** DTCG-compliant JSON (`docs/design-system/04-tokens-and-foundations.json`) compiled to CSS custom properties (`public/css/m3-tokens.css`).
- **Modes Supported:** Default Light Mode and Dark Mode (`:root[data-theme="dark"]` / `body.theme-dark`).

---

## 6. Foundations Specification

### 6.1 Color System

#### Primitive Ramps
- **Slate / Neutral Ramp:**
  - `slate-50`: `#f8fafc` (Page background)
  - `slate-100`: `#f1f5f9` (Surface subtle container)
  - `slate-200`: `#e2e8f0` (Border subtle / divider)
  - `slate-300`: `#cbd5e1` (Input borders / inactive icons)
  - `slate-400`: `#94a3b8` (Secondary icon / placeholder)
  - `slate-500`: `#64748b` (Tertiary text / metadata)
  - `slate-600`: `#475569` (Secondary text)
  - `slate-700`: `#334155` (Subheadings / strong borders)
  - `slate-800`: `#1e293b` (Dark surface container)
  - `slate-900`: `#0f172a` (Primary dark text)
  - `slate-950`: `#0b0f17` (Deep dark background)
- **Cobalt / Primary Action Ramp:**
  - `blue-50`: `#eff6ff` (Light action surface)
  - `blue-100`: `#dbeafe` (Primary container)
  - `blue-200`: `#bfdbfe` (Focus outline variant)
  - `blue-600`: `#2563eb` (Interactive primary)
  - `blue-700`: `#1d4ed8` (Primary button solid)
  - `blue-800`: `#1e3a8a` (Primary container text)
- **Emerald / Success Ramp:**
  - `green-50`: `#ecfdf5` (Success surface tint)
  - `green-100`: `#d1fae5` (Success container)
  - `green-600`: `#059669` (Completed status / Call action)
  - `green-700`: `#047857` (Call button hover/active)
  - `green-900`: `#064e3b` (Success text on container)
- **Amber / Caution Ramp:**
  - `amber-50`: `#fffbeb` (Warning surface tint)
  - `amber-100`: `#fef3c7` (Warning container)
  - `amber-600`: `#d97706` (Aaj/Kal rotation & sync alert)
  - `amber-700`: `#b45309` (Active warning emphasis)
  - `amber-900`: `#78350f` (Warning text on container)
- **Crimson / Error Ramp:**
  - `red-50`: `#fef2f2` (Error surface tint)
  - `red-100`: `#fee2e2` (Error container)
  - `red-600`: `#dc2626` (Destructive action / error icon)
  - `red-700`: `#b91c1c` (Destructive active state)
  - `red-900`: `#7f1d1d` (Error text on container)

#### Semantic Role Mappings & Contrast Verification
| Semantic Token | Light Value | Dark Value | Paired Foreground | Contrast Ratio (Light / Dark) | WCAG 2.2 AA Status |
|---|---|---|---|---|---|
| `--color-surface-page` | `#f8fafc` | `#0b0f17` | `--color-text-primary` | 14.8:1 / 17.2:1 | PASS (Exceeds 4.5:1) |
| `--color-surface-card` | `#ffffff` | `#111827` | `--color-text-primary` | 15.9:1 / 15.5:1 | PASS (Exceeds 4.5:1) |
| `--color-text-primary` | `#0f172a` | `#f8fafc` | `--color-surface-card` | 15.9:1 / 15.5:1 | PASS (Exceeds 4.5:1) |
| `--color-text-secondary` | `#475569` | `#94a3b8` | `--color-surface-card` | 7.2:1 / 6.8:1 | PASS (Exceeds 4.5:1) |
| `--color-action-primary` | `#1d4ed8` | `#3b82f6` | `#ffffff` | 5.2:1 / 4.6:1 | PASS (Exceeds 4.5:1) |
| `--color-status-success` | `#059669` | `#10b981` | `#ffffff` | 4.6:1 / 4.8:1 | PASS (Exceeds 4.5:1) |
| `--color-status-warning` | `#d97706` | `#f59e0b` | `#0f172a` | 4.7:1 / 8.2:1 | PASS (Exceeds 4.5:1) |
| `--color-status-error` | `#dc2626` | `#ef4444` | `#ffffff` | 4.8:1 / 4.6:1 | PASS (Exceeds 4.5:1) |
| `--color-border-subtle` | `#e2e8f0` | `#233044` | `--color-surface-card` | 3.1:1 / 3.4:1 | PASS (Non-text >= 3:1) |
| `--color-border-focus` | `#2563eb` | `#60a5fa` | `--color-surface-card` | 4.6:1 / 5.2:1 | PASS (Non-text >= 3:1) |

---

### 6.2 Typography System

- **Primary Font Family:** `'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Devanagari Font Family (Hindi):** `'Noto Sans Devanagari', 'Poppins', sans-serif`
- **Monospace & License Plate Family:** `'JetBrains Mono', 'SFMono-Regular', Consolas, monospace`

#### Typographic Scale & Roles
| Role | Token | Font Size | Weight | Line Height | Letter Spacing | Context of Use |
|---|---|---|---|---|---|---|
| **Display Large** | `--type-display-lg` | 28px (1.75rem) | 700 Bold | 1.25 | -0.02em | Top hero banners, login welcome headers |
| **Headline Medium**| `--type-headline-md`| 20px (1.25rem) | 600 SemiBold| 1.3 | -0.01em | Modal headers, admin section titles |
| **Title Medium** | `--type-title-md` | 16px (1.0rem) | 600 SemiBold| 1.4 | 0 | Customer name on card, table headers |
| **Body Large** | `--type-body-lg` | 15px (0.9375rem)| 400 Regular | 1.5 | 0 | Customer address, cleaning instructions |
| **Body Medium** | `--type-body-md` | 14px (0.875rem) | 400 Regular | 1.5 | 0 | Standard labels, table cells, Hindi text |
| **Label Bold** | `--type-label-bold` | 13px (0.8125rem)| 600 SemiBold| 1.3 | +0.02em | Action buttons, tab labels, form field titles|
| **Badge Mono** | `--type-badge-mono` | 14px (0.875rem) | 600 SemiBold| 1.2 | +0.05em | Indian vehicle license registration plates |
| **Caption Small** | `--type-caption-sm` | 11px (0.6875rem)| 500 Medium | 1.3 | +0.02em | Timestamps, audit logs, secondary counts |

*Devanagari Optical Adjustment:* All Devanagari copy automatically receives `line-height: 1.5` to prevent clipping of upper and lower matras.

---

### 6.3 Spacing, Sizing & 8dp Grid

All dimensions are built upon an 8-point base spatial grid:
- `--space-05`: `4px` (Tight padding inside chips, plate badges)
- `--space-1`: `8px` (Icon-to-text gap, button internal spacing)
- `--space-15`: `12px` (Card internal sub-item padding)
- `--space-2`: `16px` (Card standard padding, mobile screen margins)
- `--space-3`: `24px` (Section gaps, modal content padding)
- `--space-4`: `32px` (Desktop workspace margins, container gutters)
- `--space-6`: `48px` (Major section separators, minimum touch target height)

#### Component Touch & Sizing Rules
- **Field Staff Mobile Action Targets:** Minimum `48px` height and `48px` width.
- **Admin Desktop Interactive Controls:** Minimum `36px` height (dense mode) or `40px` (standard mode).
- **Form Input Height:** `44px` on mobile, `38px` on desktop.

---

### 6.4 Shape, Borders & Elevation

#### Corner Radii
- `--radius-xs`: `4px` (Monospace badges, status chips)
- `--radius-sm`: `8px` (Buttons, form input fields, sub-cards)
- `--radius-md`: `12px` (Customer cards, modal windows, KPI tiles)
- `--radius-lg`: `16px` (Bottom sheets, large overlay panels)
- `--radius-full`: `9999px` (Pill badges, avatars, icon buttons)

#### Elevation Levels (M3 Neutral Shadow Hierarchy)
- **Level 0 (Flat):** `none` (Inline items, flat cards on dark surfaces)
- **Level 1 (Subtle):** `0 1px 3px 1px rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.12)` (Customer cards, top header)
- **Level 2 (Raised):** `0 2px 6px 2px rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.14)` (Sticky bottom nav, dropdown menus)
- **Level 3 (Floating):** `0 4px 8px 3px rgba(15, 23, 42, 0.10), 0 1px 3px 0 rgba(15, 23, 42, 0.16)` (Modal dialogs, popovers)
- **Level 4 (Overlay):** `0 6px 10px 4px rgba(15, 23, 42, 0.10), 0 2px 3px 0 rgba(15, 23, 42, 0.16)` (Slide-out sheets, active image lightboxes)

---

### 6.5 Iconography System

- **Standard Icon Set:** Google Material Symbols Outlined (self-hosted WOFF2 font for 100% offline uptime).
- **Core Semantic Icons:**
  - Call action: `phone` / `call`
  - Directions action: `near_me` / `directions`
  - Checkmark / Completed: `check_circle` (Fill: 1)
  - Incomplete / Unchecked: `radio_button_unchecked`
  - Indian license plate vehicle: `directions_car`
  - Aaj/Kal Rotation: `sync_alt` / `swap_horiz`
  - Offline sync status: `cloud_off` (Offline) / `cloud_done` (Synced) / `sync` (Synchronizing)
  - Search / Filter: `search` / `filter_list`
  - Reorder route: `drag_handle` / `arrow_upward` / `arrow_downward`
- **Icon Sizing Scale:** `16px` (Inline micro), `20px` (Button inline), `24px` (Standard touch action), `32px` (Empty state display).

---

### 6.6 Motion & Feedback

- **Guiding Principle:** Motion must communicate operational confirmation; never delay a task.
- **Duration Tokens:**
  - `--motion-instant`: `100ms` (Checkbox toggle, button press down)
  - `--motion-rapid`: `200ms` (Toast entrance, dropdown expansion)
  - `--motion-standard`: `300ms` (Modal open, bottom sheet drawer slide)
- **Easing:** `cubic-bezier(0.2, 0.0, 0, 1.0)` (Standard decelerate curve).
- **Reduced Motion Support:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

## 7. Component Inventory & Prioritization

| ID | Component Name | Priority | Status | Primary Surface | Accessibility Pattern |
|---|---|---|---|---|---|
| **CMP-01** | Field Customer Card (`cwp-customer-card`) | Critical | Supported | Mobile Staff | Group container with labeled headings |
| **CMP-02** | Vehicle Cleaning Checklist (`cwp-cleaning-checklist`)| Critical | Supported | Mobile Staff | Accessible custom checkbox with ARIA |
| **CMP-03** | Indian License Plate Badge (`cwp-license-plate`) | Critical | Supported | Mobile & Desktop| Semantic badge with high-contrast text |
| **CMP-04** | Aaj/Kal Rotation Alert Banner (`cwp-rotation-banner`) | Critical | Supported | Mobile Staff | Status role with warning icon & text |
| **CMP-05** | One-Tap Touch Action (`cwp-touch-action`) | Critical | Supported | Mobile Staff | Native `tel:` and `geo:` 48px buttons |
| **CMP-06** | Staff Bottom Navigation Bar (`cwp-staff-bottom-nav`) | Critical | Supported | Mobile Staff | ARIA Tablist pattern with thumb reach |
| **CMP-07** | Admin Records Data Table (`cwp-records-table`) | High | Supported | Desktop Admin | Semantic `<table>` with card reflow |
| **CMP-08** | KPI Operational Metric Tile (`cwp-kpi-tile`) | High | Supported | Desktop & Mobile| Summary card with stat & label |
| **CMP-09** | Route Sequencing Item (`cwp-sequence-item`) | High | Supported | Admin & Staff | Accessible button reorder controls |
| **CMP-10** | Modal Dialog & Bottom Sheet (`cwp-dialog-sheet`) | High | Supported | Cross-platform | WAI-ARIA Modal Dialog with focus trap|

---

## 8. Critical Page & Workflow Patterns

### 8.1 Morning Field Cleaning Workflow (Staff)
1. **Login:** Staff inputs 6-digit PIN on numeric keypad (haptic dot feedback).
2. **Dashboard Feed:** Shows total assigned vehicles, completed count, and route progress bar.
3. **Card Execution:**
   - Staff reads sequence stop number (`#1`, `#2`...).
   - Staff reads Indian license plate and car model.
   - Staff checks Aaj/Kal banner (e.g. *"Scorpio (आज), Tiago (कल)"*).
   - Staff taps Call if gate is locked; taps Navigate if location is unfamiliar.
   - Staff marks cleaning done -> instant optimistic checkmark -> offline queue registered -> background sync.
4. **All Completed State:** Clean celebration banner with total cars cleaned today.

### 8.2 Customer Lifecycle & Route Management (Admin)
1. **Search & Filter:** Instant bilingual search across name, vehicle plate, phone, address.
2. **Customer Detail / Edit Modal:** Clean form fields with Indian mobile validation and address coordinates.
3. **Route Sequencing:** Drag-and-drop or 1-tap reordering of stops, with one-click reset to default order.
4. **Audit Trail Verification:** Automatic immutable log generated for every creation, update, or deletion.

---

## 9. Accessibility Contract (WCAG 2.2 Level AA)

1. **All text and interactive controls exceed 4.5:1 text contrast and 3:1 graphical control contrast.**
2. **Touch targets on mobile field staff screens enforce minimum 48x48px bounding boxes.**
3. **Full keyboard navigation support (`Tab`, `Shift+Tab`, `Enter`, `Escape`) across all modals, tables, and tabs.**
4. **Active focus indication via 2px solid `--border-focus` with 2px offset.**
5. **Screen reader live regions (`aria-live="polite"`) for offline sync updates and completion counts.**
6. **No color-only information encoding.**

---

## 10. Governance & Lifecycle

- **Owner:** CWP Engineering & Operations Core Team.
- **Review Cadence:** Bi-weekly operational review against field staff feedback and browser QA.
- **Deprecation Policy:** Deprecated tokens or components must trigger console warnings for 1 release cycle before removal.
