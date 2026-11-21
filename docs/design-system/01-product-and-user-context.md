# CWP Data App & Staff Portal — Design System Brief
**System Name:** CWP Aura Design System  
**Version:** 1.0.0  
**Status:** Approved Baseline  
**Skill Reference:** Universal Design System Skill (`universal-design-system`)  
**Date:** 2026-11-21  

---

## 1. Product Overview

- **Product Name:** CWP Customer Data & Staff Operations Portal (CWP Detailers & Motors).
- **Product Category:** Operational Field Service Management & B2B/B2C Customer Management System (SaaS / PWA).
- **Product Stage:** Production System (Actively deployed on Railway with Neon PostgreSQL backend).
- **Value Proposition:** Replaces error-prone external spreadsheets with a decoupled, high-performance, mobile-first management system ensuring strict staff route isolation, offline field mutations, vehicle rotation compliance, and automated operational audit logs.
- **Primary Outcome the Interface Must Support:** Enable field car cleaning staff to rapidly execute and record daily vehicle detailing tasks on mobile devices under harsh field conditions with zero data loss, while granting administrative supervisors complete real-time visibility into customer records, route sequencing, staff rosters, and service compliance.

---

## 2. Users and Context

### User Groups

1. **Primary Group — Field Staff Operatives (Car Cleaners / Detailers):**
   - **Demographics & Language:** Primary working language is Hindi (Devanagari script); secondary reading of English (license plates, vehicle brand names, customer initials).
   - **Environment:** Outdoor parking lots, basements, driveways, high sunlight glare, damp/wet hands, occasional cleaning glove wear.
   - **Devices:** Entry-to-mid tier Android mobile smartphones (360px – 412px viewports), touch-only input, intermittent 3G/4G/5G mobile connectivity.
   - **Technical Literacy:** Moderate to low smartphone familiarity; prefers clear visual affordances, high-contrast badges, oversized touch targets, and unambiguous status icons over dense text.

2. **Secondary Group — Operations Supervisors & Business Administrators:**
   - **Demographics & Language:** Bilingual (English and Hindi); comfortable with enterprise dashboards and tabular data.
   - **Environment:** Indoor office or mobile supervision; laptop, desktop (1280px – 1920px), or tablet (768px – 1024px).
   - **Devices:** Desktop monitors, laptops, iPad/tablets; mouse, keyboard, and touch pointer inputs.
   - **Technical Literacy:** High; manages multi-customer batches, staff PIN assignments, route sequencing, CSV imports, and audit log reconciliation.

### User Tasks & Risk Profile

- **Top 5 User Tasks:**
  1. *Mark Daily Vehicle Cleaning Completion* (Field Staff: tap checkbox/action per car, instant feedback, offline-queued if disconnected).
  2. *Navigate to Next Customer Stop* (Field Staff: one-tap Google Maps GPS navigation launch).
  3. *Call Customer for Gate / Vehicle Access* (Field Staff: one-tap native telephone dialer via `tel:` protocol).
  4. *Inspect Aaj/Kal Vehicle Rotation Rules* (Field Staff: identify which car to wash today vs tomorrow for multi-car single subscriptions).
  5. *Manage Customer Records & Route Sequence* (Admin: search, filter, edit customer details, reorder stops via drag-and-drop or manual sequence inputs).
- **Most Frequent Task:** Daily vehicle checklist verification and completion toggle (executed dozens of times daily between 05:00 AM and 11:00 AM IST).
- **Highest-Risk / Highest-Cost User Error:**
  - *Cleaning the wrong car in a multi-car household* (e.g. cleaning vehicle B instead of vehicle A on an alternate-day "Aaj/Kal" package), leading to customer complaints and wasted supplies.
  - *Accidental customer deletion or unassigned route chaos* (Admin: causing staff to skip high-value detailing stops).
- **Research / Analytics / Support Evidence:**
  - Audit reports (`docs/reports/PHASE_1F_UI_UX_AUDIT.md`, `PHASE_1G_OPERATIONAL_QA.md`).
  - Observed field staff failure points: small buttons missed when hands are damp; glare in outdoor sunlight making pastel colors unreadable; font clipping on Hindi strings; disorientation when offline without prominent queue feedback.

---

## 3. Product Surfaces

- **Platforms:** Progressive Web App (PWA) with Service Worker offline caching; standalone installed mode on Android/iOS home screens; full desktop web app for administration.
- **Target Viewport Ranges:**
  - *Compact (Mobile):* 360px – 430px (Staff primary workflow).
  - *Medium (Tablet):* 600px – 1023px (Field supervisor / on-site tablet).
  - *Expanded (Desktop):* 1024px – 1920px+ (Admin workstation console).
- **Input Modes:**
  - Mobile: Capacitive touch, single-finger tap, swipe-to-dismiss, scroll.
  - Desktop: Mouse pointer, physical keyboard (Tab navigation, Enter, Escape, Arrow keys, shortcuts).
- **Connectivity & Offline Expectations:**
  - App MUST function fully when offline during morning route execution.
  - Daily checklist completions must queue locally (`IndexedDB`/`localStorage`) with UUIDs and IST timestamps, displaying an explicit offline warning badge.
  - Automatic silent background reconciliation upon reconnect with visual confirmation toast.
- **Native System Integrations:**
  - Native telephone dialer (`tel:+91...`).
  - Native maps navigation (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`).
  - Device camera & gallery file picker (`<input type="file" accept="image/*" capture="environment">`) with client-side image compression and cropping.

---

## 4. Brand & Visual Constraints

- **Existing Brand Assets:**
  - Brand identity: **CWP Detailers & Motors**.
  - Official brand logo: `cwp_logo.jpg` (Navy Blue, Silver, and Clean White detailing automotive insignia).
- **Mandatory Brand Rules:**
  - Primary corporate tone must project automotive craftsmanship, precision, reliability, and cleanliness.
  - Primary anchor color: Deep Navy Blue (`#0b192c` / `#0f2942`).
  - The CWP logo must maintain aspect ratio and never be stretched or cropped arbitrarily.
- **Reference Products & Synthesized Principles:**
  - *Material Design 3 (M3):* Dynamic tonal surface containers, state layers, standardized elevation, and 8dp spatial grid.
  - *Apple Human Interface Guidelines (HIG):* 48px+ touch targets, ergonomic bottom tab navigation for thumb reach, and native safe area insets.
  - *IBM Carbon & Atlassian Design System:* Clean high-density data tables, unambiguous status badges, and structured audit logs.
- **Visual Direction Constraints:**
  - Avoid purely decorative gradients, micro-animations, or low-contrast "glassmorphism" that degrades readability under direct sunlight.
  - High non-text contrast boundaries on all interactive cards, checkboxes, and buttons.

---

## 5. Accessibility & Policy

- **Accessibility Target:** **WCAG 2.2 Level AA Conformance** across all web and PWA surfaces.
- **Applicable Legal / Operational Obligations:**
  - High color contrast for outdoor accessibility (WCAG 2.2 SC 1.4.3 minimum 4.5:1 text; SC 1.4.11 minimum 3:1 non-text control boundaries).
  - Robust touch target size (WCAG 2.2 SC 2.5.8 requires 24x24px minimum; CWP operational standard requires **48x48px** for primary staff mobile actions).
  - Color independence (WCAG 2.2 SC 1.4.1): Never communicate service status, Aaj/Kal rotation, or online/offline status by color alone; always pair with text and distinct iconography.
- **Assistive Technologies & Devices to Validate:**
  - Screen readers: Android TalkBack, Apple VoiceOver, NVDA on Windows Chrome.
  - Keyboard-only navigation with visible focus indicators (`:focus-visible`).
  - Display zoom (up to 200% reflow without horizontal scrolling or text overlap).

---

## 6. Localization & Content

- **Languages & Scripts:**
  - **Hindi (Devanagari):** Primary language for field staff interface (labels, action buttons, instructions, status alerts, offline notices).
  - **English (Latin):** Primary language for administrative headers, technical metrics, Indian vehicle license plates (`UP16 AB 1234`), and timestamps.
- **RTL Support:** Not required for current scope (Left-to-Right exclusively).
- **Date / Time / Currency / Units:**
  - Timezone: Indian Standard Time (IST, UTC+05:30) strictly enforced across UI and server.
  - Date format: `DD MMM YYYY` (e.g. `21 Nov 2026`) or `YYYY-MM-DD` for tabular filtering.
  - Currency: Indian Rupee (₹, INR).
  - Phone format: Normalized 10-digit Indian mobile numbers (`+91 XXXXX XXXXX`).
- **Content Voice and Tone:**
  - Direct, respectful, active, and unambiguous.
  - Hindi copy uses clear conversational terms understood by field crews (e.g. *"गाड़ी धोई गई"* for Car Washed, *"रास्ता देखें"* for View Route, *"कॉल करें"* for Call).
  - Error messages clearly indicate what went wrong and how to fix it, never blaming the user.

---

## 7. Technical Context

- **Frontend Architecture:** Vanilla ES6+ JavaScript, Native Web Components / Modular Controllers, CSS Variables (Design Tokens), Service Worker PWA.
- **Backend Architecture:** Node.js HTTP/REST API server (`server.js`), Neon Serverless PostgreSQL (`cwp_customer_db`) with connection pooling, Cloudinary image CDN.
- **Design Token Pipeline:** CSS Custom Properties structured under the W3C DTCG (Design Tokens Community Group) standard format (`public/css/m3-tokens.css`).
- **Iconography System:** Google Material Symbols Outlined (self-hosted WOFF2 font for 100% offline reliability).
- **Constraints:** Zero heavy frontend framework bloat (no React/Angular overhead); high performance on budget smartphones with 2GB RAM; zero external un-cached CDN dependencies for critical offline path.

---

## 8. Success Measures & Scope

- **Measurable Success Metrics:**
  - Field completion task recorded in < 2 seconds with 1 tap.
  - Zero accidental clicks due to undersized touch targets (100% touch targets >= 48px on staff view).
  - 100% color pairings meet or exceed WCAG 2.2 AA contrast ratios (>= 4.5:1 text, >= 3:1 graphical controls).
  - 100% zero-data empty states documented, tested, and localized in Hindi and English.
  - 100% offline mutation queue preservation during network dropouts.
- **In Scope:**
  - Complete project-specific design system specification.
  - Token architecture (primitive, semantic, component layers) in CSS and DTCG JSON.
  - Foundation specification (color, typography, layout, elevation, icons, motion, microcopy).
  - Component specifications for top 10 operational UI patterns.
  - Responsive and accessibility contracts.
  - Validation checklists and governance rules.
- **Explicitly Out of Scope:**
  - Redesigning external customer marketing website.
  - Unrelated third-party payment gateway screens.
  - Imposing arbitrary desktop-only navigation paradigms onto field mobile workers.

---

## 9. Design Principles

### Principle 1: Operational Clarity Over Aesthetic Decoration
- **Intent:** Every visual element must directly help the user accomplish their operational task faster and with fewer errors.
- **Observable Implication:** Remove non-functional gradients, decorative card glows, and parallax scroll. Use crisp borders, clear visual grouping, and legible typographic hierarchy.
- **Trade-off:** The UI will prioritize high functional density and daylight contrast over "trendy" low-contrast or glassmorphism aesthetics.
- **Example Decision:** Use solid high-contrast status pills with text and icons rather than subtle translucent background tints.

### Principle 2: Ergonomic Glove & Wet-Hand Accessibility
- **Intent:** Interface controls must be instantly operable by field cleaners working in wet, outdoor conditions with variable grip.
- **Observable Implication:** Primary action buttons (Call, Navigate, Mark Done) must meet a minimum bounding box of 48x48px with at least 8px spacing between touch targets.
- **Trade-off:** Fewer items fit on a single screen without scrolling, requiring intentional vertical chunking of customer cards.
- **Example Decision:** Stack Call and Navigation buttons with generous tap targets rather than packing miniature icon buttons side-by-side.

### Principle 3: Bilingual Hindi-First Field Communication
- **Intent:** Field staff must comprehend instructions and feedback instantly in their primary language (Hindi) without cognitive delay.
- **Observable Implication:** All field status messages, modal prompts, and action labels use plain-language Devanagari script paired with Latin numerals for license plates and phone numbers.
- **Trade-off:** Devanagari script requires slightly larger font sizes (`+1px` to `+2px`) and higher line-height (`1.4` to `1.5`) to prevent vertical clipping of vowel diacritics (matras).
- **Example Decision:** Explicitly set `line-height: 1.5` on all Hindi body and label tokens.

### Principle 4: High-Contrast Outdoor Legibility
- **Intent:** Screens must remain fully legible under bright direct Indian sunlight (up to 100,000 lux).
- **Observable Implication:** High text contrast (>= 7:1 for essential headings and vehicle plates; >= 4.5:1 for body copy). License plates use authentic Indian high-contrast yellow/white backgrounds with bold black typography.
- **Trade-off:** Subtle gray-on-gray tints are strictly prohibited on operational cards.
- **Example Decision:** Vehicle registration badges are rendered in bold monospace black on white/amber with a distinct navy border.

### Principle 5: Deterministic Feedback & Offline Resilience
- **Intent:** Staff members must never wonder whether their action was registered, saved, or lost due to poor mobile network.
- **Observable Implication:** Every action immediately provides visual confirmation (haptic feel, animated check, persistent offline status badge, sync counter).
- **Trade-off:** Optimistic UI state updates must carry explicit sync badges until the server handshake confirms persistent storage in Neon PostgreSQL.
- **Example Decision:** When offline, marking a car clean immediately turns the checkbox green with an amber "Pending Sync" pill, transitioning to "Synced" once online.

### Principle 6: Zero Arbitrary Values
- **Intent:** No developer or designer may introduce arbitrary hex codes, margin values, or corner radii.
- **Observable Implication:** 100% of UI elements must consume semantic tokens mapped to the 8dp spatial scale and approved palette.
- **Trade-off:** Custom ad-hoc styling is blocked in code review.
- **Example Decision:** Any spacing outside the defined `--space-*` tokens is rejected by linting and automated test suites.
