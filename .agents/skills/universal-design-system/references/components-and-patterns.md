# Components, interaction patterns, and page composition

## 1. Component specification contract

Every reusable component should define:

1. Name, purpose, and when to use/not use it.
2. Anatomy and content slots.
3. Variants, sizes, hierarchy, and permitted composition.
4. Token dependencies.
5. Default, hover, focus, pressed, selected, disabled, loading, error, and other applicable states.
6. Behavior, events, keyboard interaction, focus entry/exit, dismissal, and persistence.
7. Responsive and platform-specific behavior.
8. Accessibility semantics, accessible name, role, value, state, and relationships.
9. Content constraints, localization, wrapping, truncation, and validation.
10. Edge cases, empty states, error recovery, and examples.
11. Implementation ownership and tests (when coded).

Use the [component-spec template](../templates/component-spec.md).

## 2. Core component families

Select based on product needs, not checklist completion.

### Actions and navigation

- Buttons: primary, secondary, tertiary/quiet, destructive, icon-only where justified; hierarchy and placement rules.
- Links: distinguish navigation from actions; preserve expected browser/platform behavior.
- Navigation: global/local navigation, tabs, breadcrumbs, pagination, menus, sidebars, bottom navigation, back behavior.
- Action menus and toolbars: define grouping, ordering, overflow, keyboard access, and touch behavior.

### Inputs and forms

- Text inputs, text areas, password fields, search fields, selects/comboboxes, date/time inputs, checkboxes, radio groups, switches, sliders, file upload, and specialized domain inputs.
- Define labels, instructions, required/optional status, constraints, validation timing, error placement, autocomplete, input mode, autofill, and submission behavior.
- Preserve user input on recoverable errors.
- Avoid placeholder text as the only label.
- Explain errors in a way that identifies the problem and corrective action.

### Data and information

- Cards, lists, tables, data grids, metrics, charts, timeline, status, tags, filters, sorting, search results, pagination, and bulk actions.
- Distinguish static data tables from interactive grids. Use native table semantics for tabular data where appropriate.
- Define empty, loading, partial, stale, unavailable, and error states.
- For charts, define units, scales, color meaning, labels, keyboard/assistive alternatives, and a tabular or textual equivalent where needed.

### Feedback and overlays

- Inline validation, alerts, banners, toasts, progress, skeletons, confirmation dialogs, modal dialogs, drawers/sheets, popovers, and tooltips.
- Define when to interrupt, when to be non-blocking, dismissal, persistence, focus management, stacking, and restoration of focus.
- Do not use a toast for an error that requires an action if it disappears before users can respond.

## 3. Search component standard

A search component is a product pattern, not merely an input with a magnifying-glass icon. Specify:

- Search scope and data domain (global, page, table, picker, catalog, etc.).
- Explicit label or accessible name; placeholder is supplementary.
- Query submission model: live/debounced, submit-on-enter, or explicit action; justify the choice.
- Minimum query length, debounce/cancellation behavior, stale response handling, and loading feedback where relevant.
- Clear/reset behavior and preservation of query when navigating back.
- Keyboard behavior: focus, enter, escape, arrow navigation if suggestions exist, and result selection.
- Suggestions/autocomplete semantics and distinction between suggestion list, combobox, and search results.
- No-results state, error/offline state, empty-query state, permissions state, and retry behavior.
- Responsive layout and mobile keyboard/input behavior.
- Privacy implications: do not expose sensitive queries in telemetry or logs without an approved purpose.

Do not add advanced filters beside a search field unless their purpose and relationship are clear. On data-heavy screens, define a compact, responsive filter/search pattern with clear filter chips, reset behavior, result count, and applied-filter visibility.

## 4. Button and action rules

- Use a clear verb/action label where possible.
- One visually dominant action per local decision area unless the task context justifies otherwise.
- Use destructive styling only for genuinely destructive actions; do not use color alone to communicate danger.
- Define when secondary actions are links, quiet buttons, or overflow actions.
- Define disabled versus unavailable behavior. When possible, explain why an action is unavailable.
- For asynchronous actions, prevent duplicate submission and show progress without losing context.
- Ensure icon-only controls have an accessible name and a sufficiently clear hit area.

## 5. Form patterns

- Group related fields and use a logical reading/focus order.
- Use labels, instructions, validation messages, and error summaries appropriately.
- Validate at a time that supports correction without unnecessary interruption.
- Associate errors programmatically with the relevant controls.
- Preserve entered values after errors unless safety or policy requires otherwise.
- Distinguish field-level errors from form-level errors.
- Explain successful save/submit and next steps.
- Support keyboard, autofill, password managers, and platform input conventions.

## 6. Table and data-grid patterns

Define:

- Static table versus interactive grid semantics.
- Column priority and responsive transformation (horizontal scroll, hide lower priority columns, row cards, or detail view).
- Header, row, cell, sorting, selection, pagination, and bulk-action behavior.
- Sticky header/column behavior and scroll container boundaries.
- Density settings and minimum readable targets.
- Empty, filtered-empty, loading, partial, error, and stale data states.
- Keyboard interaction and screen-reader announcement behavior.
- How row actions are discovered without cluttering every cell.

Never shrink text and controls to force every desktop column onto a phone screen. Prioritize task-critical information and offer a usable alternative.

## 7. Dialog, drawer, menu, and tooltip patterns

- Use dialogs for decisions or focused tasks that require attention; avoid modal overuse.
- Define initial focus, trapped focus when modal, Escape behavior, backdrop click policy, close control, and focus restoration.
- Define drawer/sheet behavior by platform and viewport; do not assume a desktop drawer and mobile sheet are identical.
- Menus need predictable keyboard behavior and clear ownership by a trigger.
- Tooltips supplement rather than replace visible labels or essential instructions; they must be available to keyboard and touch users where used.

## 8. Page and workflow patterns

For each pattern, define its intent, structure, component combination, hierarchy, responsive behavior, and all relevant states. Typical patterns include:

- Marketing/product landing page.
- Search/discovery/results.
- Dashboard/overview.
- List/detail/edit.
- Create/update workflow.
- Sign-in/account recovery.
- Checkout/booking/payment.
- Onboarding/first-use.
- Settings/preferences.
- Empty and first-run experience.
- Permission/access-denied experience.
- Error, offline, and recovery journeys.

Patterns must be based on user goals. Do not force every product into a dashboard with cards, metrics, charts, and side navigation.
