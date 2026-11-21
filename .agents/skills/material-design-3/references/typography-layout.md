# Material Design 3 (M3) Typography, Elevation, Shapes & Layout

---

## 1. Typography Scale

Material 3 uses a 15-level typographic scale divided into 5 roles: **Display**, **Headline**, **Title**, **Body**, and **Label**.

| Role | Size | Line Height | Font Weight | Recommended HTML Tag | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Large** | 57px | 64px | 400 (Regular) | `<h1>` (Hero) | Hero stats, landing numbers |
| **Display Medium** | 45px | 52px | 400 | `<h1>` | Promotional splash titles |
| **Display Small** | 36px | 44px | 400 | `<h1>` | Prominent dashboard KPIs |
| **Headline Large** | 32px | 40px | 400 | `<h2>` | Top-level section headers |
| **Headline Medium** | 28px | 36px | 400 | `<h2>` | Modal titles, screen titles |
| **Headline Small** | 24px | 32px | 400 | `<h3>` | Card section titles |
| **Title Large** | 22px | 28px | 500 (Medium) | `<h4>` | App bar title, dialog header |
| **Title Medium** | 16px | 24px | 500 | `<h5>` | Table column headers, subheads |
| **Title Small** | 14px | 20px | 500 | `<h6>` | Form group labels, card titles |
| **Body Large** | 16px | 24px | 400 | `<p>` | Primary descriptive copy |
| **Body Medium** | 14px | 20px | 400 | `<p>` | Default body text, table cells |
| **Body Small** | 12px | 16px | 400 | `<span>` | Secondary captions, timestamps |
| **Label Large** | 14px | 20px | 600 (Semibold) | `<button>` | Button text, action links |
| **Label Medium** | 12px | 16px | 500 | `<button>` | Chips, tab labels, badges |
| **Label Small** | 11px | 16px | 500 | `<small>` | Input helper text, badge count |

---

## 2. Elevation & Shadow Levels

M3 uses 6 elevation levels (Level 0 to Level 5) combining multi-tier ambient and key shadows:

```css
:root {
  /* Level 0: Completely flat */
  --md-sys-elevation-0: none;

  /* Level 1: Cards, top app bars */
  --md-sys-elevation-1: 0 1px 3px 1px rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.12);

  /* Level 2: Hovered cards, dropdown menus, filter trays */
  --md-sys-elevation-2: 0 2px 6px 2px rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.14);

  /* Level 3: Dialogs, Floating Action Buttons (FAB), search drawers */
  --md-sys-elevation-3: 0 4px 8px 3px rgba(15, 23, 42, 0.10), 0 1px 3px 0 rgba(15, 23, 42, 0.16);

  /* Level 4: Active drag cards, floating context panels */
  --md-sys-elevation-4: 0 6px 10px 4px rgba(15, 23, 42, 0.10), 0 2px 3px 0 rgba(15, 23, 42, 0.16);

  /* Level 5: Bottom sheets, fullscreen dialogs */
  --md-sys-elevation-5: 0 8px 12px 6px rgba(15, 23, 42, 0.12), 0 4px 4px 0 rgba(15, 23, 42, 0.18);
}
```

---

## 3. Shape Scale (Corner Radii)

| Shape Token | Radius | CSS Variable | Applied Elements |
| :--- | :--- | :--- | :--- |
| **None** | `0px` | `--md-sys-shape-none` | Full bleed banners, square avatars |
| **Extra Small** | `4px` | `--md-sys-shape-xs` | Badges, snackbars, small status tags |
| **Small** | `8px` | `--md-sys-shape-sm` | Text inputs, dropdown menus, tooltips |
| **Medium** | `12px` | `--md-sys-shape-md` | Standard cards, action buttons, image cards |
| **Large** | `16px` | `--md-sys-shape-lg` | Floating action buttons, large summary tiles |
| **Extra Large** | `28px` | `--md-sys-shape-xl` | Modal dialogs, bottom sheets |
| **Full** | `9999px`| `--md-sys-shape-full`| Pill buttons, filter chips, circular badges |

---

## 4. Spacing Scale & 8dp Grid

Material Design layouts adhere to an **8dp baseline grid** (with a 4dp micro-step for compact components).

```css
:root {
  --md-sys-spacing-1: 4px;   /* Micro spacing (icon-to-text gap, badge margin) */
  --md-sys-spacing-2: 8px;   /* Tight spacing (button gap, chip gap, input margin) */
  --md-sys-spacing-3: 12px;  /* Compact spacing (input internal vertical padding) */
  --md-sys-spacing-4: 16px;  /* Base spacing (card padding, gutter, table padding) */
  --md-sys-spacing-5: 20px;  /* Extended spacing */
  --md-sys-spacing-6: 24px;  /* Generous spacing (section spacing, modal inner padding) */
  --md-sys-spacing-8: 32px;  /* Large spacing (page padding, hero section margins) */
  --md-sys-spacing-12: 48px; /* Extra large container spacing */
}
```

---

## 5. Responsive Layout Breakpoints

| Breakpoint | Window Width | Columns | Margins | Target Device |
| :--- | :--- | :--- | :--- | :--- |
| **Compact** | `< 600px` | 4 | 16px | Mobile phones (e.g. Staff portal view) |
| **Medium** | `600px - 839px` | 8 | 24px | Tablets, folded foldables |
| **Expanded** | `840px - 1199px` | 12 | 24px | Small laptops, desktop windows |
| **Large** | `1200px - 1599px`| 12 | 32px | Standard desktop displays |
| **Extra Large** | `≥ 1600px` | 12 | 32px+ | Ultra-wide monitors |
