# Platform adaptation guidance

A universal design system should share intent and foundations while respecting platform conventions. Consistency does not mean identical pixels or interaction models everywhere.

## 1. Responsive web

- Design for fluid content and real constraints, not device labels alone.
- Define breakpoint behavior based on content failure points.
- Preserve browser semantics: links navigate, buttons perform actions, forms submit, and native controls retain expected behavior where suitable.
- Support keyboard, pointer, touch, zoom, reflow, browser autofill, and history/navigation conventions.
- Use responsive images and ensure content remains usable at narrow widths and high zoom.
- Avoid fixed heights for content that may wrap or scale.

## 2. Desktop web applications

- Optimize for frequent workflows, information scanning, keyboard efficiency, and dense data where user tasks require it.
- Make navigation, search, filters, bulk actions, tables, and contextual actions predictable.
- Consider narrow windows and browser zoom; desktop does not mean a permanently wide viewport.
- Use shortcuts only as an enhancement; essential functionality must remain discoverable and usable without them.

## 3. Apple-native surfaces

When building native iOS/iPadOS/macOS/watchOS/visionOS experiences, consult the relevant current Apple HIG chapters for the target OS and device. Respect system conventions for navigation, controls, safe areas, Dynamic Type, accessibility, system materials, privacy prompts, and input.

Do not make a web component imitate an Apple control if the web environment has different semantics. On native surfaces, avoid replacing familiar system components without a clear product reason.

Official reference: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).

## 4. Android-native surfaces

For Android-native surfaces, consult current Android/Material platform guidance and use platform-appropriate controls, navigation, window insets, typography, accessibility, and touch behavior. Material 3 is a strong reference, but a product can have its own brand identity and component architecture.

Official reference: [Material Design 3](https://m3.material.io/).

## 5. Cross-platform applications

- Separate shared semantic decisions from platform-specific implementation.
- Use the same conceptual roles for color, type, status, and component intent where possible.
- Permit native navigation, selection, back behavior, keyboard handling, safe areas, and system integrations to differ.
- Document where components intentionally diverge and why.
- Avoid a lowest-common-denominator UI that feels unnatural on every platform.

## 6. Tablet, foldable, kiosk, and unusual form factors

- Re-evaluate information architecture, not merely scale the phone UI.
- Use available space for meaningful multi-pane workflows where helpful.
- Respect posture, orientation, safe zones, physical distance, shared-device use, and input hardware.
- Define session, privacy, timeout, and reset behavior for shared/public devices.

## 7. Localization, internationalization, and RTL

- Treat text expansion as a layout requirement.
- Use locale-aware formatting for dates, times, currencies, numbers, units, addresses, and names.
- Avoid concatenating translated fragments into sentences.
- Mirror directional layouts only where semantics are directional; do not blindly mirror logos, media controls, or universally understood symbols.
- Ensure icons, charts, navigation, tables, and keyboard direction behave correctly in RTL.
- Test real scripts and fallback fonts, not only English placeholders.
