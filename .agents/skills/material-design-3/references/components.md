# Material Design 3 (M3) Complete Component Recipes

This document provides drop-in HTML and CSS markup patterns for all major UI components in Material Design 3.

---

## 1. Data Tables & Data Grids

M3 data tables present structured data clearly with clean surface levels and subtle divider lines.

### HTML Structure
```html
<div class="m3-table-container">
  <table class="m3-data-table">
    <thead>
      <tr>
        <th class="m3-th-checkbox"><input type="checkbox" aria-label="Select all rows"></th>
        <th>Customer Name</th>
        <th>Vehicle</th>
        <th>Service Plan</th>
        <th>Daily Status</th>
        <th class="m3-th-actions">Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="m3-td-checkbox"><input type="checkbox" aria-label="Select row"></td>
        <td>
          <div class="m3-cell-primary">Rahul Sharma</div>
          <div class="m3-cell-secondary">+91 98765 43210</div>
        </td>
        <td>
          <span class="m3-chip m3-chip-tonal">
            <span class="material-symbols-outlined" aria-hidden="true">directions_car</span>
            Creta (White)
          </span>
        </td>
        <td>Daily Exterior Wash</td>
        <td>
          <span class="m3-badge m3-badge-success">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            Cleaned Today
          </span>
        </td>
        <td class="m3-td-actions">
          <button class="m3-icon-button" title="View Details" aria-label="View Details">
            <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
          </button>
          <button class="m3-icon-button" title="Edit" aria-label="Edit">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Table CSS
```css
.m3-table-container {
  width: 100%;
  overflow-x: auto;
  background: var(--md-sys-color-surface-container-lowest);
  border-radius: var(--md-sys-shape-md);
  border: 1px solid var(--md-sys-color-outline-variant);
  box-shadow: var(--md-sys-elevation-1);
}

.m3-data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-family: inherit;
}

.m3-data-table thead th {
  height: 56px;
  padding: 0 16px;
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  position: sticky;
  top: 0;
  z-index: 10;
}

.m3-data-table tbody tr {
  height: 52px;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.m3-data-table tbody tr:hover {
  background-color: var(--md-sys-color-surface-container-high);
}

.m3-data-table td {
  padding: 10px 16px;
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
  vertical-align: middle;
}
```

---

## 2. Buttons & Actions

Material 3 defines 5 standard button types plus the Floating Action Button (FAB).

```html
<!-- 1. Filled Button (High Emphasis) -->
<button class="m3-btn m3-btn-filled">
  <span class="material-symbols-outlined" aria-hidden="true">add</span>
  <span>New Customer</span>
</button>

<!-- 2. Tonal Button (Medium-High Emphasis) -->
<button class="m3-btn m3-btn-tonal">
  <span class="material-symbols-outlined" aria-hidden="true">filter_list</span>
  <span>Filter List</span>
</button>

<!-- 3. Outlined Button (Medium Emphasis) -->
<button class="m3-btn m3-btn-outlined">
  <span class="material-symbols-outlined" aria-hidden="true">download</span>
  <span>Export CSV</span>
</button>

<!-- 4. Text Button (Low Emphasis) -->
<button class="m3-btn m3-btn-text">Cancel</button>

<!-- 5. Floating Action Button (FAB) -->
<button class="m3-fab" aria-label="Add Record">
  <span class="material-symbols-outlined" aria-hidden="true">add</span>
</button>

<!-- 6. Extended FAB -->
<button class="m3-fab m3-fab-extended">
  <span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>
  <span>Upload Photo</span>
</button>

<!-- 7. Icon Button -->
<button class="m3-icon-button" aria-label="Settings">
  <span class="material-symbols-outlined" aria-hidden="true">settings</span>
</button>
```

---

## 3. Cards & KPI Metric Tiles

### HTML Structure
```html
<!-- Outlined Card (Default for Clean Grid Layouts) -->
<div class="m3-card m3-card-outlined">
  <div class="m3-card-header">
    <div class="m3-card-icon-wrap">
      <span class="material-symbols-outlined" aria-hidden="true">directions_car</span>
    </div>
    <div class="m3-card-title-group">
      <h3 class="m3-title-medium">Active Vehicles</h3>
      <p class="m3-body-small">Today's assigned workload</p>
    </div>
  </div>
  <div class="m3-card-content">
    <div class="m3-kpi-value">128</div>
    <div class="m3-badge m3-badge-success">+12 from yesterday</div>
  </div>
</div>
```

---

## 4. Text Fields (Outlined & Filled)

### Outlined Text Field with Floating Label
```html
<div class="m3-text-field m3-text-field-outlined">
  <span class="material-symbols-outlined m3-field-icon-leading" aria-hidden="true">search</span>
  <input type="text" id="custSearch" placeholder=" " class="m3-field-input" />
  <label for="custSearch" class="m3-field-label">Search Customer or Car Number</label>
</div>
```

```css
.m3-text-field-outlined {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-sm);
  background: var(--md-sys-color-surface);
  padding: 0 16px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.m3-text-field-outlined:focus-within {
  border: 2px solid var(--md-sys-color-primary);
}

.m3-field-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--md-sys-color-on-surface);
  padding-top: 14px;
}

.m3-field-label {
  position: absolute;
  left: 44px;
  top: 18px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
  pointer-events: none;
  transition: all 0.2s ease;
}

.m3-field-input:focus ~ .m3-field-label,
.m3-field-input:not(:placeholder-shown) ~ .m3-field-label {
  top: 6px;
  font-size: 11px;
  color: var(--md-sys-color-primary);
  font-weight: 600;
}
```

---

## 5. Chips & Badges

```html
<!-- Filter Chip (Active) -->
<button class="m3-chip m3-chip-selected" aria-pressed="true">
  <span class="material-symbols-outlined" aria-hidden="true">check</span>
  <span>Today Cleaned</span>
</button>

<!-- Filter Chip (Inactive) -->
<button class="m3-chip" aria-pressed="false">
  <span>Pending Wash</span>
</button>

<!-- Status Badge -->
<span class="m3-badge m3-badge-success">
  <span class="m3-badge-dot"></span>
  Completed
</span>
```

---

## 6. Dialogs & Modal Sheets

```html
<div class="m3-dialog-scrim">
  <div class="m3-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
    <div class="m3-dialog-icon">
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
    </div>
    <h3 id="dialogTitle" class="m3-headline-small">Delete Customer?</h3>
    <p class="m3-body-medium">Are you sure you want to delete this record? This action cannot be undone.</p>
    <div class="m3-dialog-actions">
      <button class="m3-btn m3-btn-text">Cancel</button>
      <button class="m3-btn m3-btn-filled m3-btn-error">Delete</button>
    </div>
  </div>
</div>
```
