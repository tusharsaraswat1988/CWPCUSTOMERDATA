# Accessibility requirements and design practice

## 1. Target and claims

For web products, explicitly select an accessibility target. WCAG 2.2 Level AA is a strong default target for many public and commercial web products, but applicable law, procurement, customer requirements, and jurisdiction may require something different. The project owner must confirm applicability and target.

WCAG 2.2 is a W3C Recommendation with testable success criteria. Conformance claims require assessment of all applicable criteria for the claimed scope. A scan, component library claim, or single-page review is not sufficient.

For native mobile/desktop products, include applicable platform accessibility requirements and test with the platform's accessibility APIs and assistive technologies; WCAG can inform cross-platform content but does not replace platform-specific guidance.

## 2. Perceivable information

- Provide text alternatives for meaningful non-text content; mark decorative images appropriately.
- Provide captions/transcripts or alternatives for relevant media.
- Do not use color alone to communicate status, validation, selection, or chart categories.
- Check text contrast against the applicable criterion: WCAG 2.2 AA generally requires 4.5:1 for normal text and 3:1 for large text under SC 1.4.3.
- Check non-text contrast for essential control boundaries, states, and graphical objects under SC 1.4.11 where applicable.
- Support text resizing and responsive reflow without loss of content or functionality under applicable criteria.
- Avoid images of text except for permitted cases.
- Ensure content can be presented in meaningful sequence and adapts to orientation requirements.

## 3. Operable interaction

- All functionality must be keyboard accessible, with no keyboard trap.
- Focus order must preserve meaning and operability.
- Focus must be visible and not obscured by sticky headers, dialogs, or overlays.
- Avoid interactions that require precise dragging without an alternative pointer action where WCAG applies.
- Provide adequate pointer target size/spacing. WCAG 2.2 SC 2.5.8 defines a 24 by 24 CSS pixel minimum target size at AA with specified exceptions; larger targets are often preferable and platform guidance may require more.
- Provide alternatives to complex gestures where relevant.
- Avoid time limits unless justified and provide required adjustment/extension mechanisms.
- Respect reduced-motion preferences and avoid flashing content that may trigger seizures.

## 4. Understandable content and behavior

- Use clear, consistent navigation and naming.
- Identify the language of the page and language changes where applicable.
- Label inputs and explain instructions before errors occur.
- Identify errors in text and provide correction suggestions when known.
- Avoid unexpected context changes when a field receives focus or a value changes.
- Support accessible authentication approaches and avoid unnecessary cognitive-function tests where applicable.

## 5. Robust semantics and assistive technology

- Prefer semantic HTML and native platform controls before custom ARIA widgets.
- Ensure accessible name, role, value, state, and relationships are exposed.
- Ensure status messages are programmatically determinable when required.
- Use headings, landmarks, labels, descriptions, table headers, and document structure meaningfully.
- Do not use ARIA to disguise a control whose behavior is not implemented.
- For custom web widgets, consult the WAI-ARIA Authoring Practices Guide for the relevant pattern and keyboard model. APG is implementation guidance, not a substitute for testing.

## 6. Forms and errors

- Every control has a persistent visible label or a suitable accessible name.
- Instructions and constraints are discoverable before submission.
- Required/optional status is communicated in text, not color alone.
- Error messages are specific, associated with fields, and announced appropriately.
- Form-level errors identify where attention is needed.
- Do not erase valid user input on failure.
- Use autocomplete/input type/input mode to reduce effort where appropriate.

## 7. Accessibility validation matrix

For representative critical journeys, test:

- Keyboard-only operation and logical focus order.
- Visible focus and focus restoration after dialogs/menus.
- Screen reader names, roles, states, labels, descriptions, landmarks, tables, and announcements.
- Text and non-text contrast in every supported theme and state.
- Zoom/text scaling/reflow and long localized strings.
- Reduced-motion preference.
- High-contrast/forced-colors behavior where supported.
- Target size and spacing.
- Error identification, recovery, timeout behavior, and authentication.
- Charts/data visualizations with non-visual alternatives.
- Touch and platform accessibility on actual target devices.

Use automated checks as one layer. Manual expert review and assistive-technology testing remain necessary. Record the tested scope, tools, assistive technology, platform/browser versions, results, and unresolved issues.

## 8. Source references

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [WAI-ARIA APG patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)
- [Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Carbon accessibility guidance](https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/developers)
- [Fluent 2 Accessibility](https://fluent2.microsoft.design/accessibility)
