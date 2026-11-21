# Design-token architecture and interoperability

## 1. Purpose

Tokens are named design decisions that create a shared source of truth across design files, code, platforms, and themes. They are not merely a bag of CSS variables. Their value is consistent intent, traceability, reuse, and controlled change.

## 2. Recommended token layers

### Primitive tokens

Raw values without direct UI intent: palette steps, dimension values, typeface families, weights, durations, opacities, and elevation primitives. Primitive names should describe the value family, not a usage that may change.

### Semantic tokens

Intent-based values used by the product: `color.text.primary`, `color.surface.canvas`, `color.action.primary`, `color.border.subtle`, `color.status.danger`, `space.section`, `type.body.default`. Semantic tokens should be stable when a brand hue or raw scale changes.

### Component tokens

Use only when a component needs its own deliberate contract, such as `button.primary.container`, `field.border.focus`, or `dialog.surface`. Avoid duplicating semantic values unnecessarily. Component tokens should generally reference semantic or primitive tokens rather than repeat raw values.

### Platform tokens/mappings

Map semantic intent into platform-specific implementation. A mobile tab bar, web navigation rail, and desktop menu may share a navigation concept but differ in layout and interaction. Keep the shared meaning while allowing platform-specific dimensions and behaviors.

## 3. Token categories to evaluate

- Color, including semantic roles and theme mappings.
- Typography, including families, roles, sizes, weights, line heights, and letter spacing.
- Spacing, sizing, layout, breakpoints, and content widths.
- Shape, border, stroke, and radius.
- Elevation, shadow, opacity, and layering.
- Motion, duration, easing, and reduced-motion alternatives.
- Icon size and asset conventions where a token is useful.
- Component-specific dimensions and states only when justified.

## 4. Naming principles

- Use a predictable hierarchy and one naming grammar.
- Prefer role + property + variant/state where it improves discoverability.
- Avoid names tied to temporary appearance (for example, `blue-button`) when semantic intent is stable (`action-primary`).
- Avoid ambiguous abbreviations and duplicate synonyms.
- Document allowed contexts and prohibited use for high-impact tokens.
- Separate tokens from content strings and business data.

A token name must answer “what decision does this represent?” not merely “what value is this?”

## 5. Themes and modes

Define themes only when required. Typical axes include light/dark, high contrast, brand, platform, density, and user preference. Avoid a Cartesian explosion of modes. Make sure semantic roles resolve correctly in every supported mode. Test every supported combination that ships, not only the default theme.

## 6. DTCG interoperability

Where cross-tool or cross-platform exchange matters, use the Design Tokens Community Group format 2025.10 or verify the current published version. Follow the official format for `$type`, `$value`, groups, descriptions, and references. Treat the format as a stable Community Group specification; it is not itself a W3C Web Standard and does not prescribe your token taxonomy or actual values.

Keep source token data separate from generated outputs. Record which tool/library transforms tokens, the version, naming transforms, platform exporters, and validation steps. Do not hand-edit generated files.

## 7. Minimal token example (illustrative only)

The following example demonstrates the separation between a raw value and semantic intent. The values and names are placeholders, not a recommended project palette.

```json
{
  "color": {
    "primitive": {
      "brand": {
        "example-500": {
          "$type": "color",
          "$value": "#315EA8",
          "$description": "Illustrative placeholder only; replace after product and brand discovery."
        }
      }
    },
    "semantic": {
      "action": {
        "primary": {
          "$type": "color",
          "$value": "{color.primitive.brand.example-500}",
          "$description": "Primary action container or emphasis; define permitted contexts and foreground pairing."
        }
      }
    }
  }
}
```

Validate reference syntax and supported color representation against the exact DTCG version and token tool in use.

## 8. Source-of-truth contract

Every project must state:

- Authoritative token source file(s).
- Authoritative design-library source, if any.
- Generated platform outputs and build pipeline.
- Naming and transform conventions.
- How token changes are reviewed and released.
- How deprecated tokens are detected and migrated.
- How visual regression and contrast checks are connected to tokens.

## 9. Avoid token anti-patterns

- Raw values scattered across production UI.
- Component tokens duplicating every primitive with no semantic value.
- Semantic names that encode a color rather than intent.
- Tokens added for one-off exceptions that should remain local.
- Renaming tokens without a migration/deprecation plan.
- Theme variants that are not tested.
- Token files generated from multiple conflicting sources.
- Token names that describe a specific screen instead of a reusable decision.
