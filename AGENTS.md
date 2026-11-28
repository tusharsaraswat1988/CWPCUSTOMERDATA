# CWP Repository Agent Instructions

## Active UI Ownership Protocol

This repository contains both **Legacy** (`public/js/app.js`, `public/css/style.css`, etc.) and **Admin V2** (`public/admin-v2/`) implementations that share similar feature names, modals, controls, and business concepts.

### Mandatory Rule

**Never modify a UI implementation merely because its filename, function name, or DOM ID appears relevant.**

First establish that it owns the active runtime screen.

Before any UI modification, you MUST document:

1. **Active application entry point** (e.g., `server.js` route handler for `/admin`, `/staff`, `/`)
2. **Active page/route** (e.g., `/admin` -> `public/admin-v2/index.html`, default tab `records`)
3. **Active UI generation** (Legacy, Admin V2, Staff, Customer, etc.)
4. **Target DOM element/ID** (e.g., `v2ModalEditCustomer`, `v2EditCustCategory`, `v2EditCustPackage`)
5. **Owning JavaScript module/file** (e.g., `public/admin-v2/js/v2-customers.js`)
6. **Owning CSS file(s)** (e.g., `public/admin-v2/css/v2-customers.css`)
7. **API endpoint(s) involved** (e.g., `POST /api` with `action: 'updateCustomer'`)
8. **Evidence establishing that the target code controls the actual UI** (route trace, loaded `<script>`/`<link>` tags, event handler binding, or browser/runtime DOM inspection)

### Multiple Implementations Rule

If there are multiple implementations of the same feature:

- Identify each implementation.
- Identify which one is active at the target URL.
- Identify whether the others are legacy, fallback, mobile, or alternate versions.
- Modify only the intended active implementation unless cross-version parity is explicitly required.

### Stop-on-Uncertainty Rule

If ownership cannot be verified:

- Stop before editing.
- Report the uncertainty.
- Ask for clarification only if needed.
- Do not claim the UI fix is complete.

### Asset Cache-Busting & Post-Change Verification

- Static `.js` and `.css` assets in `server.js` are served with `Cache-Control: public, max-age=86400`. Whenever modifying any Admin V2 JS or CSS file, bump its `?v=` query parameter in `public/admin-v2/index.html`.
- After every UI change, run syntax/unit/contract tests AND perform browser/visual verification of the active route and component where browser access is available.

### Verified Active Portal Map (Reference — Re-verify Before Editing)

- `/admin` and `/admin/*` (and 302 redirects from `/admin-v2`, `/admin/v2`): served by `server.js` -> `public/admin-v2/index.html` (**Admin V2**).
- `public/js/app.js` and `public/css/style.css`: **Legacy** portal scripts/styles (not loaded by `public/admin-v2/index.html`).
