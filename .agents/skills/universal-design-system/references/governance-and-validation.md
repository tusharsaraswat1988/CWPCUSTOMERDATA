# Governance, implementation quality, and validation

## 1. Design-system ownership

Every system must identify:

- Accountable owner or team.
- Decision-makers for foundations, components, content, and accessibility.
- Contribution/review path.
- Release cadence and support channel.
- Exception approval owner.
- Review frequency and source-refresh date.

For a solo or MVP project, one person may hold multiple roles; document ownership anyway.

## 2. Component lifecycle

Use a predictable lifecycle such as:

- Proposed: need and use case identified.
- Experimental: being tested; not guaranteed stable.
- Supported: documented, tested, and approved for production use.
- Deprecated: replacement or migration guidance published.
- Removed: usage eliminated and breaking change recorded.

Do not quietly alter a supported component in a way that breaks consumers. Communicate changes, provide migration guidance, and define compatibility where appropriate.

## 3. Versioning and decisions

Use semantic versioning as a governance convention where the system is consumed by multiple projects:

- MAJOR: breaking token/component contract or behavior changes.
- MINOR: backward-compatible additions.
- PATCH: compatible fixes and documentation corrections.

A single-product system may use lighter versioning, but changes still need traceability. Keep a decision log with context, options considered, choice, rationale, source references, consequences, owner, and review date.

## 4. Design quality assurance

Review complete screens and user journeys, not only component demos. At minimum evaluate:

- Visual hierarchy and task priority.
- Spacing rhythm, alignment, typography, color roles, and content density.
- Consistency of components and interaction states.
- Responsive behavior and content reflow.
- Long text, empty data, large numbers, localization, and error cases.
- Loading, offline, partial, permission, and recovery states.
- Focus, keyboard behavior, assistive semantics, contrast, and reduced motion.
- Platform conventions and safe areas.

Capture screenshots at agreed viewport sizes and compare against approved references for material changes. Visual regression is a signal for review, not a substitute for judgment.

## 5. Implementation checks (when code is in scope)

- Tokens are the source of truth; detect unexpected raw values in production components.
- Components import from approved primitives rather than duplicate styling.
- Check for duplicate components and conflicting CSS/theme rules.
- Run component tests and interaction tests.
- Run accessibility automation and manual checks.
- Run responsive/visual regression at representative breakpoints.
- Check bundle/performance impact where new assets or motion are introduced.
- Verify themes, forced colors, and platform mappings.
- Keep generated token outputs reproducible.

## 6. Adoption and maintenance metrics

Choose a small useful set:

- Percentage of production UI using approved tokens/components.
- Duplicate or deprecated component usage.
- Number and age of unresolved accessibility defects.
- Visual regression failure rate and root causes.
- Component adoption and contribution cycle time.
- Design-system user feedback and product usability outcomes.

Do not optimize adoption percentage at the cost of product fit. A documented, justified exception can be better than forcing the wrong component.

## 7. Exception process

Every exception should state:

- Requirement or token/pattern being deviated from.
- Reason and evidence.
- Affected products/platforms/users.
- Accessibility and maintenance impact.
- Owner/approver.
- Expiry or review date.
- Remediation plan, if temporary.

Do not approve an exception that waives applicable legal obligations or essential user safety requirements.

## 8. Definition of done

A foundation, component, pattern, or screen is done only when:

- Its purpose and user context are clear.
- Tokens and usage rules are documented.
- Variants and states are specified.
- Responsive/platform behavior is defined.
- Accessibility requirements and validation are addressed.
- Content and localization constraints are considered.
- Implementation and documentation agree.
- Tests/reviews are complete for the declared scope.
- Known limitations and open issues are recorded.
