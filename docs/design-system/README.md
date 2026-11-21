# CWP Aura Design System

The official, production-grade design system for the **CWP Customer Data App & Staff Operations Management System** ([https://cwpdata.up.railway.app](https://cwpdata.up.railway.app)).

Developed in strict adherence to the [universal-design-system skill](https://github.com/tusharsaraswat1988/designskillguidetushar), this system eliminates arbitrary design decisions by synthesizing normative accessibility standards (W3C WCAG 2.2 AA), touch ergonomics (Material Design 3 & Apple HIG), enterprise data patterns (IBM Carbon & Atlassian), and real-world automotive field cleaning operations.

---

## 📚 Design System Documentation Index

| Phase / Step | Document | Purpose & Contents |
|---|---|---|
| **Step 1: Product & Context** | [01-product-and-user-context.md](01-product-and-user-context.md) | Operational analysis of field staff and admin users, risk profile, bilingual needs, and 6 core design principles. |
| **Step 2: Standards Research** | [02-applicable-design-standards.md](02-applicable-design-standards.md) | Conflict resolution hierarchy, WCAG 2.2 AA matrix, M3 surface system, Apple touch ergonomics, and APG widget patterns. |
| **Step 3: Master Specification** | [03-design-system-specification.md](03-design-system-specification.md) | Comprehensive master specification detailing visual direction, architecture, and end-to-end system rules. |
| **Step 4: Design Tokens** | [04-tokens-and-foundations.json](04-tokens-and-foundations.json) | W3C DTCG 2025.10 compliant token dictionary (primitive, semantic, component layers) mapped to CSS custom properties. |
| **Step 4: Component Specs** | [05-component-specifications.md](05-component-specifications.md) | Detailed specifications for top 8 operational components (Customer Card, Checklist, License Plate, Rotation Banner, etc.). |
| **Step 5: Responsive & A11y** | [06-responsive-and-accessibility-contract.md](06-responsive-and-accessibility-contract.md) | Viewport strategy (<600px, 600-1023px, >=1024px), reflow, 48px touch rule, contrast compliance matrix, and ARIA live regions. |
| **Step 6: Validation & Governance**| [07-validation-checklist-and-governance.md](07-validation-checklist-and-governance.md) | 8-category pre-release quality gate, component lifecycle, versioning, and Design Decision Records (DDR-001 to DDR-003). |

---

## 🚀 Core Architectural Highlights

1. **Glove & Wet-Hand Ergonomics:** 48x48px minimum touch targets with 8px separation for all primary mobile actions.
2. **High-Contrast Sunlight Legibility:** Tested to withstand 100,000 lux Indian direct sunlight with >= 7:1 contrast on essential headings and license plate badges.
3. **Bilingual Hindi-First:** Built-in support for Devanagari script with minimum `line-height: 1.5` to eliminate vowel matra clipping.
4. **Authentic License Plates:** Authentic Indian High-Security Registration Plate (HSRP) visual styling for rapid vehicle identification.
5. **Zero Arbitrary Values:** 100% of spatial, typographic, and color properties are bound to semantic tokens.
