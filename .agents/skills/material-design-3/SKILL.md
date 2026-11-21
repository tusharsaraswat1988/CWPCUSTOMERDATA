---
name: material-design-3
description: Complete Google Material Design 3 (M3 / Material You) Design System skill. Covers the full specification including Color System (tokens, dynamic color, surface containers), Typography scale, Elevation & Shadows (levels 0-5), Shape system (radii 0-full), Spacing & Layout (8dp grid), Icons (Material Symbols), and UI Components/Widgets (Tables, Buttons, Cards, Inputs, Dialogs, Chips, Navigation, Menus).
---

# Google Material Design 3 (M3) Complete Design System Skill

This skill is the authoritative guide and implementation blueprint for building and refactoring user interfaces using **Google Material Design 3 (Material You)**.

It covers all visual layers:
1. **Design Tokens & Color System** (Primary, Secondary, Tertiary, Surface Containers, Outlines, Dark/Light modes)
2. **Typography Scale** (Display, Headline, Title, Body, Label)
3. **Elevation & Shadow System** (Levels 0 through 5 + surface tinting)
4. **Shape System** (Corner radii from Extra Small to Full Pill)
5. **Spacing & 8dp Grid** (Layout margins, paddings, responsive breakpoints)
6. **Material Symbols (Icons)** (Outlined, Rounded, Sharp, Variable font axes)
7. **Complete Component Library** (Data Tables, Buttons, Cards, Text Fields, Dialogs, Bottom Sheets, Chips, Navigation, Badges, Snackbars)
8. **Drop-in CSS Variables & Utility Classes**

---

## Skill Directory Structure

- [SKILL.md](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/SKILL.md) — *This file (Overview, Core Rules, Quick Reference)*
- [color-tokens.md](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/references/color-tokens.md) — *Complete M3 color palette, roles, surface containers & dark theme*
- [typography-layout.md](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/references/typography-layout.md) — *Type scale, 8dp spacing, elevation levels, and corner shapes*
- [components.md](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/references/components.md) — *HTML & CSS recipes for Tables, Cards, Inputs, Buttons, Dialogs, etc.*
- [m3-tokens.css](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/assets/m3-tokens.css) — *Ready-to-use CSS file containing all CSS variables and component styles*

---

## 1. M3 Core Design Principles

1. **Hierarchy via Color Roles & Containers**:
   - Instead of static grays and borders, M3 uses layered surfaces: `surface-container-lowest` -> `surface-container-low` -> `surface-container` -> `surface-container-high` -> `surface-container-highest`.
   - Contrast is guaranteed through paired tokens: `on-primary` on `primary`, `on-surface` on `surface`, `on-primary-container` on `primary-container`.
2. **Predictable Shape Language**:
   - Inputs and Chips: Small/Medium (8px - 12px).
   - Cards and Containers: Medium/Large (12px - 16px).
   - Dialogs and Modal Sheets: Extra Large (28px).
   - Action Badges and Pills: Full (9999px).
3. **Intentional Elevation**:
   - M3 uses subtle shadows paired with surface tint colors rather than harsh, dark drop-shadows.
4. **Accessibility First**:
   - Minimum tap target for interactive elements: **48x48px**.
   - Contrast ratios: Minimum 4.5:1 for body text, 3:1 for large display text and key UI boundaries.
   - All icons are accompanied by screen-reader text or `aria-label`.

---

## 2. Quick Token Cheat Sheet

### Typography
```css
/* Display: 57/45/36px | Headline: 32/28/24px | Title: 22/16/14px | Body: 16/14/12px | Label: 14/12/11px */
font-family: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### Elevation Levels
| Level | DP | Shadow / Box-Shadow | Typical Elements |
| :--- | :--- | :--- | :--- |
| **0** | 0dp | `none` | Flat background, standard table rows |
| **1** | 1dp | `0 1px 3px 1px rgba(0,0,0,0.12), 0 1px 2px 0 rgba(0,0,0,0.20)` | Cards, top app bars |
| **2** | 3dp | `0 2px 6px 2px rgba(0,0,0,0.12), 0 1px 2px 0 rgba(0,0,0,0.20)` | Hovered cards, dropdown menus |
| **3** | 6dp | `0 4px 8px 3px rgba(0,0,0,0.12), 0 1px 3px 0 rgba(0,0,0,0.20)` | Dialogs, floating action buttons (FAB) |
| **4** | 8dp | `0 6px 10px 4px rgba(0,0,0,0.12), 0 2px 3px 0 rgba(0,0,0,0.20)` | Active drag states |
| **5** | 12dp| `0 8px 12px 6px rgba(0,0,0,0.12), 0 4px 4px 0 rgba(0,0,0,0.20)` | Modal bottom sheets |

### Spacing Scale
- `4px` (`--md-sys-spacing-1`): Ultra tight, badge padding, icon gap.
- `8px` (`--md-sys-spacing-2`): Tight, chip spacing, inner button gap.
- `12px` (`--md-sys-spacing-3`): Compact, form input internal padding.
- `16px` (`--md-sys-spacing-4`): Standard, card padding, content gutters.
- `24px` (`--md-sys-spacing-6`): Generous, section margins, modal padding.
- `32px` (`--md-sys-spacing-8`): Large screen hero margins, table container outer padding.

---

## 3. How to Use in this Workspace

To apply Material Design 3 styles to this web project:
1. Link or import the ready-made CSS tokens file:
   ```html
   <link rel="stylesheet" href="/css/m3-tokens.css">
   ```
2. Consult the detailed component specifications in [components.md](file:///d:/cwp%20customer%20data%20app/.agents/skills/material-design-3/references/components.md) when building or restyling:
   - Modern Data Tables (sticky header, zebra striping, status chips)
   - Form Controls & Outlined Inputs with floating labels
   - Primary & Secondary Action Buttons with ripple effects
   - Elevation Cards & KPI metric tiles
   - Modal Dialogs and Confirmation Sheets
