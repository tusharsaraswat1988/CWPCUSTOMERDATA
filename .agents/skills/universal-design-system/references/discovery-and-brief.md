# Discovery and design-system brief

A design system is a response to product context. Complete discovery before prescribing visual values.

## 1. Discovery dimensions

### Product and business context

- Product name and category: marketing site, content platform, SaaS, CRM/ERP, marketplace, commerce, finance, healthcare, education, internal tool, public service, media, utility, or other.
- Product stage: exploration, prototype, MVP, active product, scale-up, redesign, or consolidation.
- Primary value proposition and measurable outcomes.
- Business constraints: time, budget, maintainers, release cadence, risk tolerance, legacy integrations.

### People and tasks

- Primary and secondary user groups; do not invent personas as research findings.
- User expertise, accessibility needs, devices, connectivity, physical context, language, and environment.
- Top tasks, task frequency, urgency, and cost of user error.
- Critical, irreversible, high-impact, or regulated interactions.
- Support themes, analytics, interviews, usability evidence, and known friction.

### Product surfaces

- Responsive website, desktop web app, PWA, native iOS/iPadOS, Android, desktop app, kiosk, wearable, embedded, or mixed.
- Screen sizes, input modes, orientation, safe areas, system navigation, touch, keyboard, pointer, voice, assistive technology.
- Online/offline conditions, latency, low-end devices, shared devices, and environmental constraints.

### Content and localization

- Languages and script coverage; right-to-left support.
- Date/time, numeric, currency, address, phone, units, and timezone conventions.
- Content length variability, pluralization, validation copy, legal text, and translation expansion.
- Voice, tone, terminology, reading level, and plain-language needs.

### Brand and visual freedom

- Existing logo, colors, typefaces, photography, illustration, motion, and brand guidelines.
- Which brand assets are mandatory, preferred, or obsolete.
- Whether the product needs a new visual direction or must align with an existing identity.
- Competitor/reference examples and what specifically is admired or rejected. Treat examples as evidence of preference, not universal standards.

### Accessibility and policy

- Target conformance level and applicable legal/regulatory/contractual obligations.
- Known disabilities/accessibility requirements relevant to the user population.
- Assistive technologies and platform accessibility APIs to test.
- Privacy, safety, trust, and sensitive-data implications of interface decisions.

### Technical context (when implementation is in scope)

- Framework/platform, styling system, component library, design tools, token pipeline, icon library, test stack.
- Existing design-system ownership and contribution model.
- Constraints around native components, third-party widgets, generated code, legacy CSS, and migration.

## 2. Discovery output

Produce a brief with:

1. Product summary and design-system goal.
2. Target users and top tasks.
3. Product surfaces/platforms.
4. Brand constraints and visual freedom.
5. Density and interaction profile.
6. Accessibility target and policy context.
7. Localization requirements.
8. Technical constraints (if applicable).
9. Success measures and validation plan.
10. Facts, assumptions, open questions, and risks.
11. In-scope and explicitly out-of-scope areas.

## 3. Design principles

Write 4–8 principles. Each principle must include:

- A short name.
- A one-sentence intent.
- Observable implications (what the UI should do).
- A trade-off (what it does not mean).
- One example of a decision it should influence.

Avoid principles that cannot change a decision. “Beautiful” or “modern” alone is not operational.

## 4. Choosing a visual direction

Develop 1–3 coherent directions only when visual direction is genuinely undecided. For each, describe:

- Brand character and emotional register.
- Information density and hierarchy.
- Typography approach.
- Color role strategy (not a random palette).
- Surface, border, shape, and elevation approach.
- Iconography and imagery treatment.
- Motion behavior.
- Platform fit and accessibility risks.
- Why it fits the product and target users.

Do not select a direction by popularity, novelty, or imitation. Select and record one direction, or state what evidence is needed before selection.

## 5. Scope by maturity

### Minimum viable design system

For a prototype or small MVP: semantic color and typography roles, spacing/layout rules, core controls, interaction states, accessibility baseline, responsive rules for required surfaces, and a small validation checklist. Explicitly label deferred areas.

### Product design system

Add complete token layers, prioritized component inventory, patterns for critical journeys, content standards, themes, platform mapping, contribution rules, changelog, and automated quality checks.

### Mature multi-product system

Add governance ownership, release channels, compatibility policy, contribution review, deprecation windows, token transformation pipeline, multi-brand/multi-platform modes, adoption metrics, visual regression, and formal accessibility testing.
