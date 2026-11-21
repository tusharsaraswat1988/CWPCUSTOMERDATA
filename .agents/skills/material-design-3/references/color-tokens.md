# Material Design 3 (M3) Color System & Token Specification

Material Design 3 uses a dynamic, role-based color system. Instead of assigning arbitrary hex codes, UI elements are mapped to semantic color roles.

---

## 1. Core Color Roles

| Token Name | Description | Example Usage |
| :--- | :--- | :--- |
| `--md-sys-color-primary` | High-emphasis primary brand tone | Primary buttons, active tabs, floating action buttons |
| `--md-sys-color-on-primary` | Text/icon color placed on primary | Button text/icon inside primary button |
| `--md-sys-color-primary-container` | Soft tint of primary color | Selected list item, pill badge background, active card |
| `--md-sys-color-on-primary-container` | Text/icon color on primary container | Text/icon inside active badge or tonal button |
| `--md-sys-color-secondary` | Less prominent accent tone | Filter chips, secondary buttons, badges |
| `--md-sys-color-on-secondary` | Text/icon color placed on secondary | Text inside secondary elements |
| `--md-sys-color-secondary-container` | Low-emphasis secondary background | Inactive filter chips, search background |
| `--md-sys-color-on-secondary-container` | Text on secondary container | Inactive chip labels |
| `--md-sys-color-tertiary` | Contrasting accent for special balance | Success indicators, notifications, highlight chips |
| `--md-sys-color-on-tertiary` | Text/icon placed on tertiary | Text inside tertiary badges |
| `--md-sys-color-tertiary-container` | Subtle tertiary surface | Accent cards, warning/alert backgrounds |
| `--md-sys-color-on-tertiary-container` | Text on tertiary container | Accent card text |
| `--md-sys-color-error` | Severe status, errors, destructive | Delete buttons, validation errors, offline warning |
| `--md-sys-color-on-error` | Text placed on error color | White text on red delete button |
| `--md-sys-color-error-container` | Soft red background | Error notification banner, failed sync badge |
| `--md-sys-color-on-error-container` | Text inside error container | Text in error banners |

---

## 2. Surface Container Scale (Layered Surfaces)

M3 replaces flat single surfaces with 5 distinct container tones to represent depth and containment without heavy borders:

```
[ surface-container-lowest ]   #ffffff (Deepest background layer)
      ↓
[ surface-container-low ]      #f8fafc (Subtle content sections)
      ↓
[ surface-container ]          #f1f5f9 (Standard card background)
      ↓
[ surface-container-high ]     #e2e8f0 (Elevated cards, table headers)
      ↓
[ surface-container-highest ]  #cbd5e1 (Active/hovered cards, dialog surfaces)
```

| Token Name | Light Value | Dark Value | Best Used For |
| :--- | :--- | :--- | :--- |
| `--md-sys-color-surface` | `#ffffff` | `#0f172a` | Main page body, base background |
| `--md-sys-color-on-surface` | `#0f172a` | `#f8fafc` | Primary body text, headings |
| `--md-sys-color-surface-variant` | `#e2e8f0` | `#1e293b` | Form input backgrounds, chip borders |
| `--md-sys-color-on-surface-variant` | `#475569` | `#94a3b8` | Subtitles, helper text, inactive icons |
| `--md-sys-color-outline` | `#94a3b8` | `#475569` | Outlined button borders, input borders |
| `--md-sys-color-outline-variant` | `#e2e8f0` | `#334155` | Table row dividers, subtle card borders |

---

## 3. CWP Motors & Detailers M3 Palette (Brand Mapped)

Configured for CWP brand Navy (`#0f2942`) and Blue (`#2563eb`):

```css
:root {
  /* Primary (CWP Royal Blue) */
  --md-sys-color-primary: #1d4ed8;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #dbeafe;
  --md-sys-color-on-primary-container: #1e3a8a;

  /* Secondary (CWP Slate Navy) */
  --md-sys-color-secondary: #0f2942;
  --md-sys-color-on-secondary: #ffffff;
  --md-sys-color-secondary-container: #e0e7ff;
  --md-sys-color-on-secondary-container: #0b192c;

  /* Tertiary (Emerald Success / Cleaning Glow) */
  --md-sys-color-tertiary: #059669;
  --md-sys-color-on-tertiary: #ffffff;
  --md-sys-color-tertiary-container: #d1fae5;
  --md-sys-color-on-tertiary-container: #064e3b;

  /* Error (Destructive / Warning) */
  --md-sys-color-error: #dc2626;
  --md-sys-color-on-error: #ffffff;
  --md-sys-color-error-container: #fee2e2;
  --md-sys-color-on-error-container: #7f1d1d;

  /* Background & Surfaces */
  --md-sys-color-surface: #ffffff;
  --md-sys-color-on-surface: #0f172a;
  --md-sys-color-surface-container-lowest: #ffffff;
  --md-sys-color-surface-container-low: #f8fafc;
  --md-sys-color-surface-container: #f1f5f9;
  --md-sys-color-surface-container-high: #e2e8f0;
  --md-sys-color-surface-container-highest: #cbd5e1;

  /* Borders & Dividers */
  --md-sys-color-outline: #94a3b8;
  --md-sys-color-outline-variant: #e2e8f0;
}
```
