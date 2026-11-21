---
name: universal-design-system
description: Create, define, document, implement, audit, or evolve a complete product-specific design system for websites, web apps, SaaS products, dashboards, and native or cross-platform mobile applications. Use when starting a product, establishing visual foundations, defining design tokens or components, modernizing inconsistent UI, or reviewing design-system quality.
---

# Universal Design System Skill

## Mission

Create a coherent, product-specific design system by synthesizing established design-system practice and applicable accessibility requirements. This skill is the reusable method and governance layer; it is **not** a preselected visual theme, brand palette, component library, or framework mandate.

The system created for each project must fit its users, product category, tasks, brand, platform conventions, content, operating environment, and technical constraints. Never impose one aesthetic or one vendor's component language on every product.

## Source and authority model

Use the official sources listed in [source-map.md](references/source-map.md). Synthesize their common principles; do not copy a source's proprietary visual expression or assume that several vendors' guidance is identical.

Resolve conflicts in this order:

1. Applicable law, regulation, procurement obligations, contractual requirements, and the project's explicitly approved accessibility target.
2. Testable accessibility requirements, especially WCAG 2.2 where web content is in scope; use native platform accessibility requirements for native surfaces.
3. Platform conventions and human-interface guidance for the platform being designed (for example, Apple HIG for Apple-native UI; Android/Material guidance for Android-native UI).
4. The product's validated user needs, task context, domain constraints, brand requirements, and existing approved product decisions.
5. Cross-platform design-system guidance from Material, Carbon, Atlassian, and Fluent as patterns and reference material.
6. Designer/agent preference, only where no higher-priority requirement decides the question.

When sources disagree, record the decision and rationale. Do not silently combine mutually incompatible patterns. Do not call a guideline a legal or normative requirement unless its source actually has that status. WCAG is a W3C Recommendation; the DTCG token format is a W3C Community Group specification, not a W3C Web Standard.

## Non-negotiable operating rules

- Do not start by choosing colors, fonts, gradients, corner radii, or a trendy style. Start with product and user context.
- Do not copy Material, Apple, Carbon, Atlassian, Fluent, or another product's visual identity wholesale. Reuse principles and suitable interaction patterns, not their brand expression.
- Do not invent a universal fixed palette, font family, spacing scale, breakpoint set, component size, or navigation model. Derive and document them for the project.
- Do not create one-off component styles when an approved token or component already exists.
- Do not use raw hex values, arbitrary spacing, random radii, ad hoc shadows, or unapproved icon packs in production UI when a token or approved asset exists.
- Do not use color as the sole carrier of meaning. Pair status with text, iconography, shape, or another perceivable cue.
- Do not treat accessibility as a final visual audit. Include it in discovery, foundations, component anatomy, interaction design, and validation.
- Do not invent data, chart values, customer content, or product states for visual polish. Use representative, clearly labelled sample data only in prototypes.
- Do not declare a design system complete because a token file or component gallery exists. Verify real workflows and screens.
- Do not claim WCAG conformance from automated scans alone. Assess all applicable success criteria using suitable manual and automated methods.
- Preserve existing project decisions and user changes. Inspect before replacing; document migrations and breaking changes.
- Keep recommendations proportional. A small MVP needs a deliberate minimum viable system, not an enterprise design-system bureaucracy.

## Required workflow

### Stage 0 — Identify the work mode

Classify the request as one or more of:

- **Create**: establish a new design system.
- **Extend**: add tokens, components, patterns, themes, or platforms to an existing system.
- **Audit**: assess a product or system against documented principles and applicable standards.
- **Modernize**: improve an existing UI while preserving required behavior and product identity.
- **Implement**: translate approved design decisions into code or design-tool assets.

State the mode and intended deliverables in the plan.

### Stage 1 — Product and context discovery

Read [discovery-and-brief.md](references/discovery-and-brief.md) and complete the project brief template. Establish at minimum:

- Product category, value proposition, and maturity (concept, MVP, established product, redesign).
- Primary user groups, abilities, contexts of use, critical tasks, frequency, and consequences of error.
- Platforms and surfaces: responsive web, desktop web app, iOS, iPadOS, Android, tablet, kiosk, wearable, embedded, or other.
- Information density and interaction complexity (marketing/editorial, transactional, operational, analytical, authoring, etc.).
- Brand assets, positioning, tone, existing identity constraints, and freedom to evolve.
- Locales, languages, writing direction, date/number/currency conventions, and content length variability.
- Accessibility target, applicable regulations, industry constraints, security/privacy-sensitive interactions, and assistive-technology needs.
- Technical stack and existing component/design-token infrastructure, if implementation is in scope.
- Existing user research, analytics, support themes, usability findings, and known pain points.

If information is missing, distinguish facts from assumptions. Ask only questions that materially change the design direction. When work must proceed, document assumptions and identify what needs validation; do not fabricate research evidence.

### Stage 2 — Inspect before defining

For an existing project, inspect current screens, component inventory, token definitions, assets, design files, CSS/theme configuration, responsive behavior, and known accessibility issues before proposing replacements. Identify what is reusable, inconsistent, obsolete, missing, or risky.

For a greenfield project, inspect the available product brief, brand materials, references, and platform requirements. Do not pretend a codebase audit occurred when no codebase exists.

Produce a concise findings list and an initial scope boundary.

### Stage 3 — Establish design principles and product character

Define 4–8 project-specific principles that can guide trade-offs (for example, clarity over decoration, rapid task completion, progressive disclosure, trust through transparency, calm density, or expressive storytelling). Explain what each principle means in observable UI terms.

Select a visual direction only after discovery. Explain how the direction serves the users and product. Avoid empty descriptors such as “modern,” “premium,” or “clean” without concrete implications for hierarchy, density, type, color, layout, motion, imagery, and component behavior.

### Stage 4 — Architect the design system

Use the layered model in [tokens-and-architecture.md](references/tokens-and-architecture.md):

1. **Primitive tokens**: raw palette, dimensions, typeface families, duration values, and other base values.
2. **Semantic tokens**: intent-based roles such as text-primary, surface-default, border-subtle, action-primary, status-danger, focus-indicator.
3. **Component tokens**: component-specific decisions only where a reusable component genuinely needs them.
4. **Platform mappings**: aliases or exports that map common intent to platform-appropriate values and behaviors.

Define themes and modes where needed (light/dark, high contrast, brand, density, platform, or user preference). Keep semantic names stable when the underlying brand palette changes. Avoid proliferating tokens without a clear use case.

Use the Design Tokens Community Group format where interoperability is useful. The current stable DTCG format is version 2025.10; confirm current format guidance when implementing tooling. Do not present DTCG as a formal W3C Recommendation.

### Stage 5 — Specify foundations

Document the project's decisions for:

- Brand expression and logo/asset use.
- Color roles, ramps, semantic mappings, contrast pairs, states, data visualization, and themes.
- Typography: family, fallback stacks, roles, scale, weight, line height, letter spacing, truncation, responsive behavior, and tabular numerals where appropriate.
- Spacing, sizing, layout grids, containers, alignment, breakpoints, and content widths.
- Shape, borders, elevation, shadows, surfaces, and layering.
- Iconography, illustrations, imagery, and data visualization conventions.
- Motion, transitions, reduced-motion behavior, and feedback timing.
- Interaction states, focus visibility, target sizes, and input affordances.
- Content design: voice, tone, labels, helper text, errors, date/time and localization.

Do not fill a specification with arbitrary exact numbers merely to appear complete. Each value must have a reason, platform mapping, and validation method. See [foundations.md](references/foundations.md).

### Stage 6 — Specify components and patterns

Create a prioritized component inventory, then document each production component using [component-spec.md](templates/component-spec.md). Include purpose, anatomy, variants, tokens, behavior, states, responsive changes, accessibility semantics and keyboard behavior, content rules, edge cases, and examples.

Cover the components that the product actually needs. Typical candidates include buttons, links, text fields, search, select/combobox, checkboxes, radio groups, switches, date/time inputs, file upload, navigation, tabs, breadcrumbs, cards, tables/data grids, pagination, filters, menus, tooltips, dialogs, drawers, toasts, alerts, charts, empty states, skeletons, and error/recovery patterns.

Distinguish a static table from an interactive grid. Do not choose ARIA roles by appearance; use native semantic elements whenever possible and consult WAI-ARIA APG for custom web widgets.

### Stage 7 — Compose page and workflow patterns

Define repeatable patterns for real user goals: onboarding, sign-in, search and discovery, create/edit forms, checkout or booking, task queues, dashboards, settings, bulk actions, destructive actions, permissions, file handling, and recovery. Select only those applicable to the product.

For each critical journey, map entry point, user intent, steps, decision points, validation, loading, success, empty, error, cancellation, interruption, and recovery. Ensure the page hierarchy follows task importance, not component availability.

### Stage 8 — Build the implementation contract

If code implementation is in scope:

- Map design tokens to the existing framework/theme architecture rather than imposing a new stack.
- Identify the source of truth for tokens and component primitives.
- Define naming, export, theming, component ownership, documentation, and deprecation conventions.
- Reuse accessible native controls or mature components where appropriate; do not rebuild complex widgets without a reason.
- Add token and component linting or checks where feasible.
- Keep design source, token source, and shipped implementation synchronized.

Do not claim a component is reusable or accessible until it has been tested in its actual integration context.

### Stage 9 — Validate and govern

Use [accessibility.md](references/accessibility.md) and [governance-and-validation.md](references/governance-and-validation.md). Validate representative critical journeys, not just isolated components. Include keyboard and assistive technology checks, responsive layouts, contrast and non-text contrast, reduced motion, content expansion, RTL where applicable, and real-device/platform checks where relevant.

Record decisions with the decision-record template. Define versioning, release notes, deprecation, contribution, exception approval, and periodic review.

## Required deliverables for a new design system

Scale depth to project maturity, but a new system must produce at least:

1. Product/design-system brief, with facts, assumptions, constraints, and target platforms.
2. Design principles and visual-direction rationale.
3. Source and standards applicability note.
4. Token architecture and an initial token dictionary (format and theme strategy documented).
5. Foundation specification: color, type, spacing/layout, shape, elevation, icons/assets, motion, and content.
6. Prioritized component inventory plus complete specs for the first critical components.
7. Critical workflow/page patterns, including non-happy states.
8. Accessibility and responsive behavior requirements.
9. Implementation mapping and usage guidance if code is in scope.
10. Validation checklist, known gaps, decision log, and version/governance plan.

For an MVP, explicitly label the system **minimum viable** and list deferred foundations/components. Never imply the deferred areas are already standardized.

## Minimum quality gate before declaring a system ready

- Product context and intended users are documented.
- A visual direction is justified by user/product context, not trend preference.
- Every design decision uses a documented token or is an explicitly approved exception.
- Semantic tokens are distinct from primitive palette values.
- Themes and platform variations are considered where required.
- Typography, spacing, layout, and responsive behavior have defined rules.
- Components specify anatomy, variants, states, behavior, and accessibility.
- Forms, search, tables, navigation, overlays, feedback, and empty/error/loading states are covered where relevant.
- WCAG target and applicability are stated; contrast, keyboard, focus, labels, reflow, target size, and semantics are checked.
- Content expansion, localization, and RTL are considered where relevant.
- Critical journeys have been reviewed at representative viewport sizes and on relevant platforms.
- Token and component sources of truth are identified.
- Known gaps, exceptions, owners, and review date are recorded.

## Output behavior

When creating a system, present the architecture and decisions first, then create the files. Use concise, implementation-ready language. Separate:

- **Requirement**: must be met because of policy, accessibility criterion, platform requirement, or approved product rule.
- **Recommendation**: strongly preferred practice, but context-dependent.
- **Option**: a valid design choice that requires project selection.
- **Exception**: a documented deviation with rationale, impact, owner, and review date.

Cite source names and links in the generated documentation. Never imply the project is certified, compliant, or validated unless the relevant assessment has actually been performed.

## Supporting references

Load only what the current task needs:

- [Source map and synthesis method](references/source-map.md)
- [Discovery and design-system brief](references/discovery-and-brief.md)
- [Foundations](references/foundations.md)
- [Tokens and system architecture](references/tokens-and-architecture.md)
- [Components and interaction patterns](references/components-and-patterns.md)
- [Accessibility](references/accessibility.md)
- [Platform adaptation](references/platform-adaptation.md)
- [Governance and validation](references/governance-and-validation.md)
- [Templates](templates/)
