# CWP Aura Design System — Validation Checklist & Governance
**System Name:** CWP Aura Design System  
**Version:** 1.0.0  
**Skill Reference:** Universal Design System Skill (`governance-and-validation.md`, `design-decision-record.md`)  
**Date:** 2026-11-21  

---

## 1. Production UI Pre-Release Validation Checklist

Before any screen, view, or component in the CWP Customer Data App or Staff Portal is approved for production release, it must be verified against this 8-category checklist.

### Category 1: Design Token & Spatial Compliance
- [ ] **Zero Arbitrary Values:** Every color, font-size, line-height, margin, padding, border-radius, and shadow references a defined design token (`var(--color-*)`, `var(--space-*)`, `var(--radius-*)`).
- [ ] **8dp Spatial Grid:** All component dimensions, margins, and gaps are strict multiples of 4px or 8px.
- [ ] **Surface Container Depth:** Surfaces follow the M3 container hierarchy (`surface`, `surface-container-low`, `surface-card`) rather than arbitrary drop-shadows.

### Category 2: Outdoor Sunlight & Color Contrast
- [ ] **Text Contrast (Normal Text):** Normal text (< 18.5px bold or < 24px regular) achieves >= 4.5:1 contrast against its background in both light and dark modes.
- [ ] **Text Contrast (Large Text & Headings):** Section headings achieve >= 3.0:1 contrast (and >= 7.0:1 for high-sunlight operational titles).
- [ ] **Non-Text Boundary Contrast:** Input borders, checkbox frames, and card borders achieve >= 3.0:1 contrast against adjacent surface colors.
- [ ] **Color Independence:** No status (Completed, Pending, Offline, Error, Aaj/Kal) is communicated by color alone. Every indicator pairs color with text and an icon.
- [ ] **Indian License Plate High-Contrast:** Vehicle registration badges maintain >= 15:1 contrast using black monospace lettering on white/yellow backgrounds.

### Category 3: Touch Ergonomics & Viewport Adaptability
- [ ] **48px Touch Target Rule (Mobile Staff):** All primary touch buttons (Call, Directions, Mark Done, Bottom Nav Tabs) have a minimum bounding box of 48 by 48 CSS pixels.
- [ ] **Touch Separation:** Adjacent touch targets have at least 8px spacing to prevent mis-clicks with wet or gloved hands.
- [ ] **Thumb Reach Zone:** The most frequent navigation actions are positioned within the bottom thumb zone on mobile devices.
- [ ] **Safe Area Insets:** Fixed header and bottom navigation bars respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- [ ] **Reflow at 320px:** Interface renders cleanly down to 320px width without horizontal scrolling.

### Category 4: Bilingual Hindi & Typographic Integrity
- [ ] **Devanagari Line-Height:** All Hindi strings enforce `line-height: 1.5` to prevent clipping of upper/lower matras.
- [ ] **No Awkward Truncation:** Customer names, addresses, and cleaning instructions wrap cleanly without ellipsis cut-offs.
- [ ] **Monospace Alignment:** Phone numbers, PIN codes, timestamps, and vehicle registration numbers render in `JetBrains Mono`.

### Category 5: Keyboard Accessibility & Focus Appearance
- [ ] **Logical Tab Order:** Focus navigates in natural reading order without unexpected jumps.
- [ ] **Visible Focus Indicator:** High-contrast focus outline (2px solid `--border-focus` with 2px offset) appears on all interactive elements when using keyboard navigation.
- [ ] **Modal Dialog Focus Trap:** Modals (`role="dialog"`) trap keyboard focus, dismiss on `Escape`, and return focus to the opening trigger button.

### Category 6: Screen Reader & Assistive Semantics
- [ ] **Semantic HTML:** Native elements (`<header>`, `<main>`, `<nav>`, `<article>`, `<button>`, `<table>`) are used instead of generic `<div>` click handlers.
- [ ] **Accessible Names:** All icon-only buttons include descriptive `aria-label` attributes.
- [ ] **Live Regions:** Asynchronous notifications (offline sync updates, route completion counts) use `aria-live="polite"`.

### Category 7: Offline State & Network Resilience
- [ ] **Offline Banner:** Visual notification immediately appears when network connectivity drops.
- [ ] **Local Mutation Queue:** Completed cleaning actions save locally with UUIDs and IST timestamps when offline.
- [ ] **Sync Confirmation:** Reconnecting triggers automatic background upload and shows a persistent "Synced" confirmation toast.

### Category 8: Empty-State Completeness
- [ ] **Zero Customer Records:** Informative bilingual empty state with clear call-to-action button.
- [ ] **Zero Staff Assigned:** Explains how to assign staff to routes.
- [ ] **Zero Today Cleaning Jobs:** Clear message that all routes or assignments are clear.
- [ ] **Zero Audit Events:** Clean empty table state with explanatory text.

---

## 2. Design System Governance & Lifecycle

### Component Lifecycle Stages
1. **Proposed:** Operational need identified (e.g. specialized solar panel checklist). Documented in GitHub issue with task analysis.
2. **Experimental:** Implemented in branch or prototype. Tested with at least 2 staff members and 1 admin.
3. **Supported:** Passes the 8-category validation checklist. Documented in `docs/design-system/`. Fully approved for production.
4. **Deprecated:** Replacement component available. Marked with console warning and migration guide for at least 1 minor version cycle.
5. **Removed:** Component cleanly excised from codebase.

### Versioning Policy
- The CWP Aura Design System adheres to Semantic Versioning (`MAJOR.MINOR.PATCH`):
  - **MAJOR (e.g. 2.0.0):** Breaking changes to design token names, token deprecations without alias, or major architectural shifts.
  - **MINOR (e.g. 1.1.0):** Addition of new supported components, new semantic tokens, or non-breaking layout enhancements.
  - **PATCH (e.g. 1.0.1):** Bug fixes, contrast adjustments, typography tweaks, and documentation updates.

### Exception Approval Process
- If a specific operational screen requires an exception to the design system (e.g. a specialized barcode scanner overlay):
  1. Submit a formal Design Decision Record (DDR).
  2. Prove that existing tokens/components cannot fulfill the operational need.
  3. Verify that the exception does not violate WCAG 2.2 AA accessibility requirements.
  4. Obtain sign-off from the Operations Lead and Tech Lead.

---

## 3. Design Decision Records (DDR)

### DDR-001: 48px Minimum Touch Target for Field Staff Operatives
- **Status:** APPROVED
- **Date:** 2026-11-21
- **Context:** WCAG 2.2 SC 2.5.8 requires a minimum touch target size of 24 by 24 CSS pixels. However, CWP field operatives work in driveways, parking basements, and washing bays with damp, soapy hands or work gloves. In early testing, 24px and 36px buttons led to frequent mis-taps (dialing customers by accident or marking the wrong vehicle done).
- **Decision:** Mandate a strict minimum touch target of **48 by 48 CSS pixels** for all primary mobile field staff actions (Call, Directions, Mark Completed, Bottom Navigation Tabs), with at least **8px** spatial separation between adjacent actions.
- **Consequences:** Fewer items fit on a single mobile screen without scrolling; cards are slightly taller. This trade-off is accepted because zero mis-taps and rapid single-tap execution are top operational priorities.

### DDR-002: Dual-Script Bilingual Typography with 1.5 Devanagari Line-Height
- **Status:** APPROVED
- **Date:** 2026-11-21
- **Context:** The application serves bilingual users: Hindi for field cleaners and English for administrators and vehicle license plates. Standard English typography with line-heights of 1.1–1.2 causes vertical clipping of Devanagari matras (vowel signs), making words ambiguous or illegible on Android Chrome.
- **Decision:** Pair `Poppins` (Latin headings/buttons), `Noto Sans Devanagari` (Hindi text), and `JetBrains Mono` (license plates, PIN codes, timestamps). Enforce a minimum `line-height: 1.5` on all Hindi copy and provide at least 4px vertical padding on all pill badges.
- **Consequences:** Hindi copy renders cleanly without clipping across all Android and iOS devices.

### DDR-003: DTCG 2025.10 Layered Token Architecture with Pure CSS Custom Properties Pipeline
- **Status:** APPROVED
- **Date:** 2026-11-21
- **Context:** The application is deployed as a high-performance PWA without heavy frontend frameworks (React, Angular). The design tokens must provide a single source of truth without incurring runtime overhead or build-step dependencies for field workers on 2GB RAM devices.
- **Decision:** Adopt the Design Tokens Community Group (DTCG 2025.10) JSON format as the source of truth (`04-tokens-and-foundations.json`), compiling directly into native CSS Custom Properties (`m3-tokens.css`).
- **Consequences:** Zero client-side token parsing overhead; instantaneous dark-mode toggling; standard interoperability across design tools and code.
