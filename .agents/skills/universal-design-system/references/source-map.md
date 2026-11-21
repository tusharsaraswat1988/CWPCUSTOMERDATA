# Source map and synthesis method

**Review date:** 2026-11-21  
**Purpose:** Identify authoritative references, explain what each contributes, and prevent accidental conflation of vendor guidance with formal standards.

## 1. Core reference set

| Source | Status / nature | Best used for | Do not infer |
|---|---|---|---|
| [Google Material Design 3](https://m3.material.io/) | Product design system and guidance | Foundations, roles, tokens, components, interaction states, responsive/adaptive patterns | That Material's visual style or component model is mandatory for every product or platform |
| [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) | Platform-specific human-interface guidance | Apple-platform conventions, layout, typography, color, motion, privacy, accessibility, system integration | That Apple-native patterns should be transplanted unchanged into web or Android products |
| [IBM Carbon Design System](https://carbondesignsystem.com/) | Enterprise design system | Foundations, dense enterprise workflows, components, patterns, data presentation, accessibility | That every product should use enterprise density or Carbon's visual language |
| [Atlassian Design System](https://atlassian.design/) | Product design system | Foundations, design tokens, content, collaboration workflows, complex product UI, component reuse | That Jira/Confluence interaction patterns fit all products |
| [Microsoft Fluent 2](https://fluent2.microsoft.design/) | Cross-platform product design system | Token layers, theming, typography, layout, cross-platform adaptation, accessibility guidance | That Segoe UI or Fluent's exact scale is appropriate everywhere |
| [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | W3C Recommendation; testable accessibility success criteria | Accessibility conformance requirements for in-scope web content | That every useful accessibility practice is a WCAG success criterion, or that an automated scan proves conformance |
| [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) | W3C WAI informative implementation guidance | Accessible web widget patterns, roles, states, keyboard interactions, landmarks, names and descriptions | That ARIA should replace native HTML controls or that APG examples are the only valid implementation |
| [Design Tokens Community Group (DTCG), 2025.10](https://www.designtokens.org/tr/2025.10/) | Stable Community Group specification hosted by W3C; not a W3C Web Standard | Vendor-neutral token exchange format, token types, groups, aliases/references, cross-tool interoperability | That DTCG defines the design values, visual direction, or token taxonomy a product must choose |

## 2. What to synthesize across sources

### Shared foundations

Material, Carbon, Atlassian, and Fluent all treat foundations and reusable components as connected layers. Their guidance supports defining consistent color, typography, spacing/layout, iconography, motion, elevation/shape, and component behavior. The exact terminology and values differ; synthesize intent rather than copying a particular scale.

### Platform-aware design

Apple HIG is particularly important when a product uses Apple-native surfaces and system conventions. Material provides a broad component and adaptive design reference, especially for Android and cross-platform work. A web product should also respect web semantics, browser behavior, responsive constraints, and WCAG. Platform-native behavior is a deliberate mapping layer, not an inconsistency to erase.

### Accessibility is not a decorative layer

Use WCAG 2.2 for applicable web conformance criteria. Use WAI-ARIA APG when a web implementation needs custom widgets and keyboard interaction patterns. Use native platform accessibility guidance for native applications. Vendor systems can add practical design advice, but cannot replace the applicable accessibility standard or legal requirement.

### Design-token interoperability

Use DTCG 2025.10 when tokens need to move between tools or platforms. The DTCG format standardizes representation and exchange, not the visual decisions themselves. Keep the system's semantic model clear and ensure the chosen token tooling supports the format/version.

## 3. Source hierarchy and conflict handling

1. Applicable law, regulation, procurement/contract requirements, and approved accessibility target.
2. Applicable normative standards and testable requirements (for example, WCAG 2.2 for web content when selected/applicable).
3. Platform conventions for the actual target platform.
4. Validated user needs, product tasks, domain constraints, approved brand requirements, and existing decisions.
5. Vendor design-system guidance as reference patterns.
6. Personal preference.

When two sources offer different patterns, do not average them. Identify the product surface, user task, platform, accessibility implications, and technical constraint. Select the pattern with the strongest contextual fit and record why. If a platform convention conflicts with a cross-platform component, use a shared semantic intent with platform-specific presentation/behavior where appropriate.

## 4. Research rules for agents

- Prefer current official documentation over third-party summaries.
- Check the page's version, publication/update date, and platform scope before applying it.
- When standards may have changed, verify the current official edition before finalizing a compliance statement.
- Do not reproduce long passages or copy source assets. Summarize principles and link to sources.
- Preserve source attribution in the generated design-system documentation.
- Separate evidence from interpretation. Label inferred recommendations as recommendations, not source mandates.
- Record the source version/date used when a high-impact rule is adopted.

## 5. Official references by subject

### Foundations and components

- [Material Design 3 Foundations](https://m3.material.io/foundations/)
- [Material Design 3 getting started](https://m3.material.io/get-started)
- [Material color roles](https://m3.material.io/styles/color/the-color-system)
- [Material typography](https://m3.material.io/styles/typography/applying-type)
- [Apple HIG Foundations](https://developer.apple.com/design/human-interface-guidelines/foundations)
- [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Carbon Design System](https://carbondesignsystem.com/)
- [Carbon foundations/components/patterns overview](https://www.carbondesignsystem.com/getting-started/developing/overview)
- [Atlassian Design System](https://atlassian.design/)
- [Atlassian foundations and design tokens](https://atlassian.design/resources/)
- [Fluent 2](https://fluent2.microsoft.design/)
- [Fluent 2 design tokens](https://fluent2.microsoft.design/design-tokens/)
- [Fluent 2 color](https://fluent2.microsoft.design/color/)
- [Fluent 2 layout](https://fluent2.microsoft.design/layout)
- [Fluent 2 typography](https://fluent2.microsoft.design/typography/)

### Accessibility and interaction

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)
- [WAI-ARIA APG patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)
- [IBM Carbon accessibility guidance](https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/developers)
- [Fluent 2 accessibility](https://fluent2.microsoft.design/accessibility)

### Token interoperability

- [DTCG format 2025.10](https://www.designtokens.org/tr/2025.10/)
- [DTCG overview and status](https://www.w3.org/community/design-tokens/)

### Agent skill packaging

- [Agent Skills standard](https://agentskills.io/specification)
- [OpenAI Skills guide](https://developers.openai.com/api/docs/guides/tools-skills)
- [VS Code Agent Skills and supported locations](https://code.visualstudio.com/docs/agent-customization/agent-skills)
