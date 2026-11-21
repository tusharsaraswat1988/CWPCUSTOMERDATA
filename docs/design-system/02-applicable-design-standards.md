# Applicable Design Standards & Authority Model
**System Name:** CWP Aura Design System  
**Version:** 1.0.0  
**Skill Reference:** Universal Design System Skill (`source-map.md`, `accessibility.md`)  
**Date:** 2026-11-21  

---

## 1. Authority Hierarchy & Conflict Resolution

When design principles, platform conventions, or component behaviors conflict, decisions for the CWP Customer Data App and Staff Operations Portal must be resolved in strict accordance with the following hierarchy:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Normative Accessibility Standards (WCAG 2.2 AA - W3C Recommendation) │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Platform Human Interface Guidelines (Android / Material 3, Apple)  │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Validated CWP Operational Context (Field Staff & Admin Realities)   │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Cross-Platform Enterprise Patterns (Carbon, Atlassian, Fluent)      │
├────────────────────────────────────────────────────────────────────────┤
│ 5. Designer / Developer Preference (Only when steps 1–4 are silent)    │
└────────────────────────────────────────────────────────────────────────┘
```

### Conflict Resolution Rules
1. **Accessibility overrides visual minimalism:** If a design proposal calls for a subtle gray border or low-contrast text that violates WCAG 2.2 AA (e.g. contrast < 3:1 for borders or < 4.5:1 for text), accessibility mandates high-contrast solid lines and text.
2. **Operational field requirements override generic desktop patterns:** Desktop web conventions (such as compact 28px buttons or hover-only dropdowns) are strictly prohibited on field staff mobile views. Touch targets must be >= 48x48px.
3. **No vendor lock-in:** We synthesize the functional principles of Material 3 and Apple HIG without copying proprietary branding or forcing mobile patterns onto the desktop admin console.

---

## 2. Applicable Standards & Specifications

### A. W3C Web Content Accessibility Guidelines (WCAG 2.2 Level AA)
*Status:* Official W3C Recommendation (October 2023).  
*Scope:* All web and PWA pages, modal dialogs, forms, feeds, and tables.

| Success Criterion | Title & Level | Normative Requirement | CWP Design System Implementation |
|---|---|---|---|
| **1.4.1** | Use of Color (Level A) | Color is not used as the only visual means of conveying information, indicating an action, or prompting a response. | Every status badge (Completed, Pending, Offline, Aaj/Kal) pairs color with visible localized text and distinct Material Symbols iconography. |
| **1.4.3** | Contrast (Minimum) (Level AA) | Visual presentation of text and images of text has a contrast ratio of at least 4.5:1 (3:1 for large text >= 18.5px bold or >= 24px regular). | All primary text on surfaces achieves >= 10:1; secondary text achieves >= 5.5:1. High sunlight legibility standard targets >= 7:1 for operational headings. |
| **1.4.11** | Non-text Contrast (Level AA) | Visual presentation of user interface components (boundaries, states) and graphical objects has a contrast ratio of at least 3:1 against adjacent colors. | All input borders, card outlines, checkbox frames, and toggle switches enforce minimum 3:1 contrast against surface backgrounds. |
| **1.4.10** | Reflow (Level AA) | Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions down to 320px width. | Fluid flexbox/grid layout without fixed width containers. Staff cards stack vertically; admin tables convert to responsive cards on narrow viewports. |
| **2.4.7** | Focus Visible (Level AA) | Any keyboard-operable interface has a mode of operation where the keyboard focus indicator is visible. | Explicit `:focus-visible` styling using a 2px solid `--border-focus` (`#2563eb`) with a 2px offset ring on all interactive controls. |
| **2.4.13** | Focus Appearance (Level AAA / Best Practice) | Focus indicator has an area of at least double the perimeter of the component and >= 3:1 contrast. | Exceeds AA baseline: 2px high-contrast outline with 2px offset ensures focus is unmistakable during desktop keyboard navigation. |
| **2.5.8** | Target Size (Minimum) (Level AA) | Target size for pointer inputs is at least 24 by 24 CSS pixels, with specified spacing exceptions. | **CWP Strict Standard:** Primary field staff mobile action buttons are configured to minimum **48 by 48 CSS pixels** with 8px spatial separation for wet-hand and glove reliability. Desktop admin controls maintain minimum 36x36px. |
| **3.3.1 - 3.3.3** | Error Identification & Suggestions | Form errors are clearly announced in text, pinpointed to the field, and provide corrective instructions. | Specific bilingual error messages with red iconography and text suggestions (e.g. Indian mobile number format requirements). |

---

### B. Google Material Design 3 (M3 / Material You)
*Status:* Industry Reference Specification for Adaptive Touch Interfaces.  
*Adopted Concepts:*
1. **Surface Container Hierarchy:**
   - Five distinct tonal surface levels (`surface`, `surface-container-lowest`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`) to structure depth and visual grouping without relying on heavy shadows.
2. **State Layer Model:**
   - Interaction states implemented via transparent color overlays (`hover` 8%, `focus` 12%, `pressed` 12%, `dragged` 16%).
3. **Material Symbols Outlined:**
   - Unified variable icon font (Optical Size 24, Weight 400, Fill 0/1) self-hosted as WOFF2 for offline caching.
4. **8dp Spatial Grid System:**
   - Multiples of 8px (with 4px half-grid for micro-adjustments) governing all margins, paddings, and component heights.

*Explicitly Rejected M3 Elements:*
- Dynamic Wallpaper Palette extraction (incompatible with CWP automotive brand identity).
- Floating Action Buttons (FAB) that obstruct customer cards or bottom navigation on small screens.

---

### C. Apple Human Interface Guidelines (HIG)
*Status:* Industry Reference Specification for Touch Ergonomics and iOS PWA Safari.  
*Adopted Concepts:*
1. **Ergonomic Thumb-Zone Navigation:**
   - Fixed bottom navigation bar for field staff on mobile devices, keeping the top 3 high-frequency destinations within easy thumb reach.
2. **Safe Area Inset Handling:**
   - Rigorous CSS support for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to accommodate device home bars and camera cutouts.
3. **Haptic Touch Targets & Native Action Delegation:**
   - Direct integration with native phone dialer (`tel:`) and native GPS navigation rather than clunky custom in-app web frames.

---

### D. IBM Carbon & Atlassian Design System
*Status:* Enterprise Reference for Dense Operational Dashboards.  
*Adopted Concepts:*
1. **Tabular Data Ergonomics (IBM Carbon):**
   - High-density data tables with fixed headers, sortable columns, and zebra/hover row highlights for the admin customer database.
2. **Status Badges & Tokens (Atlassian):**
   - Lozenge-style badges pairing high-contrast text, tinted container backgrounds, and explicit border strokes for status representation.
3. **Audit Trail Timeline (Atlassian):**
   - Chronological immutable event logging with actor attribution, timestamps, and mutation diffs.

---

### E. WAI-ARIA Authoring Practices Guide (APG 1.2)
*Status:* W3C WAI Informative Implementation Guidance.  
*Adopted Widget Patterns:*
1. **Modal Dialog Pattern (`role="dialog"`, `aria-modal="true"`):**
   - Traps Tab focus within modal; closes on Escape key; restores focus to trigger button upon close; dark backdrop click dismissal.
2. **Tabs Pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`):**
   - Arrow-key navigation between tabs; `aria-selected="true/false"`; `aria-controls` linkage.
3. **Accordion / Disclosure Pattern (`aria-expanded="true/false"`):**
   - Expandable vehicle and location cards with announced expansion states.

---

### F. Design Tokens Community Group (DTCG 2025.10)
*Status:* W3C Community Group Specification (Vendor-neutral token format).  
*Adoption:*
- Design tokens declared in structured JSON with `$type`, `$value`, and `$description` properties.
- Source tokens compiled into standard CSS Custom Properties for zero-runtime overhead.
