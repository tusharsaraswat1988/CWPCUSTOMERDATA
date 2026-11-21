---
name: material-design-3-icons
description: Complete guidelines, implementation standards, CSS variable font setup, and usage patterns for Google Material Design 3 (M3) Material Symbols (Outlined, Rounded, Sharp). Use when adding, styling, or replacing icons in web projects and PWAs.
---

# Material Design 3 (M3) Icons & Symbols Skill Guide

This skill provides complete reference documentation, implementation rules, and practical examples for using **Google Material Design 3 (M3) Icons (Material Symbols)** in web applications, with special attention to vanilla web apps, PWAs, and modern UI components.

---

## 1. Overview: Material Symbols vs Material Icons

Material Design 3 replaces the older "Material Icons" with **Material Symbols**.
Material Symbols unify over 3,000+ glyphs into a single variable font or modular SVGs with 4 dynamic stylistic axes.

### Three Visual Styles
Each app should consistently use **one primary style** across the entire UI:

1. **Outlined (Default / Recommended)**:
   - Clean, lightweight stroke aesthetic.
   - Ideal for information-dense dashboards, enterprise portals, and clean modern interfaces.
2. **Rounded**:
   - Soft, curved corner radii.
   - Ideal for consumer-facing apps, friendly touch-heavy interfaces, and mobile portals.
3. **Sharp**:
   - Crisp, rectangular edges with high geometric precision.
   - Ideal for technical, industrial, or architectural visual languages.

---

## 2. Variable Font Axes

Material Symbols use variable font technology with 4 key axes:

| Axis | Tag | Range | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Fill** | `'FILL'` | `0` or `1` | `0` | `0` = outlined/unfilled; `1` = solid/filled (e.g. active tab, favorited star). |
| **Weight** | `'wght'` | `100` – `700` | `400` | Stroke thickness. Adjust to balance with adjacent typography. |
| **Grade** | `'GRAD'` | `-25` – `200` | `0` | Subtle weight adjustment without changing layout/bounding box (useful for Dark Mode or hover contrast). |
| **Optical Size** | `'opsz'` | `20` – `48` | `24` | Fine-tunes stroke and detail for physical rendering size (20, 24, 40, 48px). |

---

## 3. Web Integration Methods

### Method A: Google Fonts CDN (Fastest, Cloud-Hosted)
Add the font link in `<head>` (e.g., inside `Index.html`):

```html
<!-- Material Symbols Outlined (Variable Font) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
```

*(Note: Replace `Material+Symbols+Outlined` with `Material+Symbols+Rounded` or `Material+Symbols+Sharp` if choosing another style).*

---

### Method B: Self-Hosted / Offline PWA (Recommended for CWP Portal)
To allow icons to render offline without network latency in PWAs:

1. Install the official npm package:
   ```bash
   npm install material-symbols
   ```
2. The package includes:
   - Variable fonts in WOFF2 format (`material-symbols/outlined.woff2`, `rounded.woff2`, `sharp.woff2`).
   - SVG files per icon.
3. Copy the WOFF2 font into your static assets (e.g., `public/fonts/material-symbols-outlined.woff2`) and add it to `sw.js` cache.

---

## 4. Standard CSS Setup

Include this baseline CSS in your stylesheet (e.g., `public/css/style.css`):

```css
/* ==========================================================================
   Material Design 3 (M3) Symbols Base Configuration
   ========================================================================== */
.material-symbols-outlined,
.material-symbols-rounded,
.material-symbols-sharp {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;              /* Preferred default size */
  line-height: 1;
  display: inline-block;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  white-space: nowrap;
  direction: ltr;
  vertical-align: middle;
  flex-shrink: 0;
  user-select: none;

  /* Enable ligatures and font features */
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;

  /* Default variable axes settings */
  font-variation-settings:
    'FILL' 0,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
}

/* Rounded Variant (if imported) */
.material-symbols-rounded {
  font-family: 'Material Symbols Rounded';
}

/* Sharp Variant (if imported) */
.material-symbols-sharp {
  font-family: 'Material Symbols Sharp';
}

/* --------------------------------------------------------------------------
   Optical Size Modifiers
   -------------------------------------------------------------------------- */
.m3-icon-20 {
  font-size: 20px;
  font-variation-settings: 'opsz' 20, 'wght' 400, 'FILL' 0, 'GRAD' 0;
}
.m3-icon-24 {
  font-size: 24px;
  font-variation-settings: 'opsz' 24, 'wght' 400, 'FILL' 0, 'GRAD' 0;
}
.m3-icon-40 {
  font-size: 40px;
  font-variation-settings: 'opsz' 40, 'wght' 400, 'FILL' 0, 'GRAD' 0;
}
.m3-icon-48 {
  font-size: 48px;
  font-variation-settings: 'opsz' 48, 'wght' 400, 'FILL' 0, 'GRAD' 0;
}

/* --------------------------------------------------------------------------
   State Modifiers (Fill / Bold)
   -------------------------------------------------------------------------- */
.m3-icon-filled {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
.m3-icon-bold {
  font-variation-settings: 'wght' 600, 'FILL' 0, 'GRAD' 0, 'opsz' 24;
}
```

---

## 5. HTML Usage Patterns

### Pattern A: Standard Text Ligature
```html
<span class="material-symbols-outlined" aria-hidden="true">search</span>
```

### Pattern B: Button with Accessible Text
```html
<button type="button" class="btn btn-primary" aria-label="Add new customer">
  <span class="material-symbols-outlined" aria-hidden="true">person_add</span>
  <span>Add Customer</span>
</button>
```

### Pattern C: Icon-Only Action Button (Requires Accessible Label)
```html
<button type="button" class="btn-icon" aria-label="Refresh customer list" title="Refresh">
  <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
</button>
```

### Pattern D: Toggle States (Outlined vs Filled)
```html
<!-- Inactive Bookmark (Outline) -->
<button class="btn-bookmark" aria-pressed="false" aria-label="Bookmark record">
  <span class="material-symbols-outlined" aria-hidden="true">bookmark</span>
</button>

<!-- Active Bookmark (Filled) -->
<button class="btn-bookmark active" aria-pressed="true" aria-label="Remove bookmark">
  <span class="material-symbols-outlined m3-icon-filled" aria-hidden="true">bookmark</span>
</button>
```

---

## 6. Sizing, Layout & Touch Target Best Practices

1. **Standard Sizes**:
   - `20px`: Dense data tables, secondary badge indicators, compact mobile headers.
   - `24px`: Primary buttons, navigation drawers, standard input field adornments.
   - `40px` / `48px`: Empty states, upload drop-zones, hero banners.
2. **Touch Targets (Mobile / Staff Portal)**:
   - Even if the icon is `24px`, the interactive parent container (`<button>` or `<a>`) must have a minimum tap area of **`48px × 48px`** (or `min-height: 44px` with sufficient padding) to comply with mobile accessibility standards.
3. **Color Pairing**:
   - Icons should inherit color from their parent via `fill: currentColor` or `color: inherit`.
   - Never hardcode color on the icon span itself; style the parent component or context class.

---

## 7. Common Material Symbols for Automotive / Customer Portal (CWP)

| Action / Entity | Glyph Ligature Name | Intended Usage |
| :--- | :--- | :--- |
| Car / Vehicle | `directions_car` | Vehicle profile, car model, detailing entry |
| Customer / Person | `person` or `group` | Customer info, staff management |
| Clean / Sparkle | `auto_awesome` or `cleaning_services` | Detailing services, foam wash, coating |
| Location / Address | `location_on` | Customer residence, colony, floor info |
| Phone / WhatsApp | `call` or `chat` | Direct contact actions |
| Camera / Photo | `photo_camera` | Daily clean proof photos, vehicle inspection |
| Sync / Refresh | `sync` | Offline-to-cloud synchronization status |
| Check / Done | `check_circle` | Completed wash, validated attendance |
| Search | `search` | Hindi/English bilingual customer search |
| Admin / Shield | `shield_person` or `admin_panel_settings` | Admin mode, security controls |

---

## 8. Verification & QA Checklist

When updating or introducing Material Symbols:
- [ ] Only one symbol style (Outlined or Rounded) is active across the interface.
- [ ] All decorative icons include `aria-hidden="true"`.
- [ ] Icon-only buttons contain `aria-label` or `.sr-only` text.
- [ ] Ligature names are spelled correctly in lowercase with snake_case (e.g. `arrow_forward_ios`).
- [ ] If running offline (PWA), ensure font files are precached in `sw.js`.
