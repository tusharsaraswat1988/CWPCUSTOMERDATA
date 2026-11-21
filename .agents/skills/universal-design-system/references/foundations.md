# Design foundations

This document describes what a project-specific system must define. It intentionally does not prescribe one universal visual style or fixed set of values.

## 1. Color

### Define roles, not just swatches

Create primitive palettes and map them to semantic roles. At minimum consider:

- Brand/action: primary, secondary, accent, link, selected.
- Surfaces: canvas, default surface, raised surface, sunken surface, overlay.
- Text: primary, secondary, tertiary, inverse, disabled, link.
- Borders: subtle, default, strong, focus.
- Status: success, warning, danger/error, info; each with foreground, background, border/icon relationships.
- Data visualization: categorical, sequential, diverging, neutral, selection, highlight.

Every semantic pairing must be checked in every theme and relevant state. Do not equate brand colors with status colors. Do not use the same color for unrelated meanings when this creates ambiguity.

### Color requirements

- State which color spaces and formats the token pipeline supports.
- Define light/dark/high-contrast behavior where applicable; do not simply invert colors.
- Define accessible foreground/background pairs and interaction states.
- Never rely on hue alone to distinguish statuses or chart series.
- Ensure disabled states remain perceivable and do not erase essential information.
- Test text and non-text contrast against the applicable WCAG criteria for web surfaces.
- Define image overlay, scrim, and translucent surface behavior; test against variable imagery.

### Color documentation fields

For each role: token name, intent, value/reference, permitted contexts, prohibited contexts, paired foreground, theme mapping, interaction states, contrast result, and source/decision reference.

## 2. Typography

Define:

- Font family and licensing/availability; primary and fallback stacks.
- Roles: display, page title, section heading, component title, body, label, caption, code, numeric/data.
- Scale, weight, line height, letter spacing, optical sizing, and variable-font axes if used.
- Maximum readable text measure for long-form content.
- Wrapping, truncation, multiline behavior, and minimum supported text size for the context.
- Responsive and user text-scaling behavior.
- Tabular numerals for aligned values when useful.
- Language/script fallback and font coverage.

Use hierarchy through size, weight, spacing, and placement—not color or all-caps alone. Avoid too many type families and weights. Validate real content, not only sample headings. Allow text to grow without clipping, overlap, or loss of essential actions.

## 3. Spacing, sizing, and layout

Define a controlled spacing scale and rules for when to use it. Use spacing to communicate grouping and hierarchy, not as decoration. Define:

- Inline spacing, component internal padding, stack/section spacing, page margins, grid gutters.
- Content max-widths and readable text measure.
- Grid columns, breakpoints, fluid ranges, and container behavior.
- Alignment rules, baseline alignment, and safe areas on native platforms.
- Component sizing and touch/pointer target behavior.
- Dense/comfortable modes if the product genuinely needs them.

Do not make a breakpoint solely because a device label changes. Introduce breakpoints where content or interaction stops working well. Test intermediate widths, not only named device presets.

## 4. Shape, borders, elevation, and layering

Define consistent roles for:

- Corner radius (small controls, cards, dialogs, large containers, pills only where meaningful).
- Border width, color, separators, and focus outlines.
- Elevation and shadows (including when not to use them).
- Surface layering, overlays, scrims, and stacking order.
- Dividers versus whitespace for grouping.

Use elevation to communicate hierarchy or interaction, not to put every object in a floating card. Ensure theme and high-contrast modes retain boundaries.

## 5. Iconography and imagery

- Select a coherent icon family and define licensed asset sources.
- Specify sizes, stroke/fill approach, optical alignment, baseline behavior, and RTL mirroring rules.
- Prefer familiar, meaningful metaphors; label unfamiliar or icon-only actions accessibly.
- Do not mix emoji, multiple icon packs, and unrelated illustration styles without a deliberate system decision.
- Define when icons are decorative versus functional and the corresponding accessible name/hidden behavior.
- Define image aspect ratios, crops, focal point behavior, alt-text guidance, placeholder/fallback behavior, and image licensing.
- Do not stretch raster assets or use decorative imagery that competes with task completion.

## 6. Motion and feedback

Define motion purpose before duration/easing values. Motion may communicate state change, spatial relationship, continuity, or feedback. It must not delay essential tasks or add unnecessary spectacle.

Specify:

- Motion principles and when motion should be absent.
- Duration/easing tokens by interaction class.
- Entrance/exit, loading, progress, feedback, and layout-change behavior.
- Reduced-motion behavior and platform settings.
- Whether animation can be paused/stopped for applicable content.
- Avoidance of flashing and vestibularly uncomfortable movement.

## 7. Interaction states

Define a state model for every interactive component as appropriate:

- Rest/default.
- Hover (pointer-capable surfaces only).
- Focus-visible (keyboard/accessibility focus).
- Pressed/active.
- Selected/checked/expanded.
- Disabled and read-only.
- Loading/busy.
- Invalid/error and success/valid.
- Empty/no results.
- Offline/unavailable where relevant.

States must be distinguishable without relying only on subtle color shifts. Specify transitions, focus movement, dismissal, and persistence.

## 8. Content and microcopy

Define voice, tone, terminology, capitalization, punctuation, date/time conventions, numeric formatting, error-message structure, confirmation language, and localization rules. Use specific action labels. Avoid vague “Submit” where the outcome can be named. Explain what happened, what the user can do next, and whether data was saved when errors occur.

## 9. Density and hierarchy

Choose density based on task frequency, expertise, screen size, and error cost. Data-heavy products may need compact tables, but compact must not mean unreadable or inaccessible. Consumer products may need more guidance and progressive disclosure. Document how hierarchy is expressed through layout, type, contrast, grouping, and action priority.
