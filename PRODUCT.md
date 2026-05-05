# Cata Café — Product Document

> Last updated: 2026-05-05

---

## Vision

**Cata Café is the professional evaluation tool for specialty coffee cuppers.**

It implements the SCA CVA (Coffee Value Assessment) methodology end-to-end — from session creation and blind sample management through structured sensory scoring, real-time group collaboration, and exportable PDF certificates.

The tool exists to make rigorous, reproducible cupping sessions as frictionless as possible, so that the cupper's full attention stays on the coffee — not the software.

---

## Target Users

### Primary: The Q-Grader / Trained Cupper
A licensed Q-Grader or SCA-trained cupper conducting formal evaluations in a lab or roastery setting. They are proficient in the CVA methodology, comfortable with Spanish-language sensory vocabulary, and expect a tool that matches their level of expertise.

**Context:** Cupping table in front of them, 3–5 samples, cups numbered 1–5. They evaluate each sample systematically across fragrance, aroma, flavor, aftertaste, acidity, sweetness, mouthfeel, and overall impression.

**Needs:**
- Fast, reliable data entry during a timed protocol
- Precise score calculation with formula transparency
- Physical evaluation (green bean defects, screen size, color) before the session
- Post-reveal origin data entry
- PDF certificate export for records or clients

### Secondary: The Session Organizer / Lab Manager
Responsible for setting up cupping sessions, inviting participants, managing blind sample codes, and closing the session once all evaluations are submitted.

**Needs:**
- Create solo or group sessions with format selection (Descriptive, Affective, Combined)
- Assign samples and manage reveal status
- Monitor real-time group submission progress
- Generate aggregate community scores
- Share invite links with participants

### Tertiary: The Participant (Group Sessions)
A cupper invited via link to join a group session. They join, evaluate their assigned samples, and submit. They can see aggregate results after the session closes.

---

## Core Value Propositions

| Value | Description |
|---|---|
| **Protocol fidelity** | Implements the official SCA CVA formula exactly: `S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d`, rounded to nearest 0.25 |
| **Zero friction entry** | Auto-save at 800ms debounce; no manual save required. Magic link auth — no passwords. |
| **Group collaboration** | Real-time submission tracking via Supabase Realtime. Community aggregate scores computed by PostgreSQL trigger. |
| **Blind integrity** | Sample labels are coded (A, B, C…); origin data is entered post-reveal only. |
| **Full traceability** | Every evaluation links to a coffee profile with complete tasting history and community scores. |
| **Export** | PDF certificate generation with score breakdown via `@react-pdf/renderer`. |

---

## Evaluation Formats

Cata Café supports three formats from the SCA CVA methodology:

### Descriptive
Evaluators rate the **intensity** of sensory attributes on a 0–15 scale and select flavor descriptors (CATA — Check All That Apply). No hedonic scoring.

### Affective
Evaluators rate the **quality** of each section on a 1–9 hedonic scale (`AffectiveBubbles`). Results feed directly into the CVA formula. Includes cup uniformity and defect tracking.

### Combined
Both descriptive intensities and affective quality scores evaluated together. The standard professional format.

---

## CVA Scoring Formula

```
S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
```

| Variable | Definition |
|---|---|
| `hᵢ` | 9-point affective score for each of 8 sections (fragrance → overall) |
| `u` | Non-uniform cups (0–5) |
| `d` | Defective cups (0–5) |
| Result | Rounded to nearest 0.25 |

**Score bands:**

| Score | Category | UI Color |
|---|---|---|
| ≥ 90 | Excepcional | Green |
| 85–89 | Excelente | Green |
| 80–84 | Muy bueno | Green |
| 79 | Bueno | Amber |
| 70–78 | Promedio | Amber |
| < 70 | Bajo | Red |

**Community score** (group sessions): computed by PostgreSQL trigger `trg_recompute_aggregate` — normalized penalties across all participants. The TypeScript function is display-only; the trigger result is authoritative.

---

## Feature Set (Current)

### Session Management
- [x] Create solo cupping session (Descriptive, Affective, Combined)
- [x] Create group session with invite link
- [x] Reusable invite link (no use limit by default)
- [x] Add samples with coded labels and optional coffee reference
- [x] Session status lifecycle: `draft → active → closed`
- [x] Close session (freezes evaluations)
- [x] Reveal samples (unlocks origin data entry)

### Evaluation Interface (`CupClient`)
- [x] Sample tab navigation (pill tabs, coded labels)
- [x] Phase tabs: Physical Evaluation / Cupping / Extrinsic Data
- [x] `IntensitySlider` (0–15, step 0.5) for descriptive attributes
- [x] `AffectiveBubbles` (1–9) for affective scores
- [x] `CATAPills` for flavor family + sub-descriptor CATA selection
- [x] `CupIndicators` for cup uniformity and defect tracking
- [x] Auto-save at 800ms debounce (no manual save)
- [x] Master Controls (session leader only): reveal, close
- [x] Score preview (`ScoreDisplay` with expandable formula breakdown)

### Physical Evaluation (Pre-reveal)
- [x] Green bean defect counting (CAT1 / CAT2)
- [x] Screen size selection
- [x] Bean color classification
- [x] Free-text notes

### Extrinsic Data (Post-reveal)
- [x] Origin, farm, variety, altitude, process type
- [x] Certifications
- [x] Harvest date, producer notes

### Group Sessions
- [x] Real-time submission tracking (Supabase Realtime)
- [x] Participant management (owner / joined / invited)
- [x] Community aggregate score (PostgreSQL trigger)
- [x] Group results tab with comparison view

### Results & Export
- [x] Individual CVA score with formula breakdown
- [x] Group results page with sample comparison
- [x] Coffee profile with full tasting history
- [x] Personal history page (`/profile/history`)
- [x] PDF certificate export (`/sessions/[id]/print`)

### Coffee Library
- [x] Coffee profile pages with aggregate scores
- [x] Public + owned coffees browse
- [x] `UserCoffeeHistory` — per-user record of every coffee tasted

### Auth
- [x] Magic link OTP (email-only, no passwords)
- [x] `?next=` redirect flow for invite links requiring auth
- [x] Session refresh via `proxy.ts` middleware

### i18n
- [x] Spanish (primary) + English (secondary)
- [x] `next-intl` with locale-prefixed routes (`/es/`, `/en/`)

---

## Evaluation Protocol — 8 Sections (in order)

| # | Section | Step | Type | Notes |
|---|---|---|---|---|
| 1 | Fragancia | 1 | Orthonasal | Dry grounds |
| 2 | Aroma | 2 | Orthonasal | After hot water |
| 3 | Sabor | 3 | Gustative/Retronasal | |
| 4 | Regusto | 3 | Gustative/Retronasal | |
| 5 | Acidez | 3 | Gustative | Free descriptors |
| 6 | Dulzor | 3 | Gustative/Retronasal | Free descriptors |
| 7 | Sensación en Boca | 3 | Tactile | |
| 8 | Global | 4 | Affective only | Overall impression |

---

## Data Model (Key Entities)

| Model | Purpose |
|---|---|
| `CuppingSession` | Session event (format, status, isGroup, isAsync, closesAt) |
| `SessionSample` | Coffee sample within a session (position, label, revealed, coffeeId) |
| `Evaluation` | One cupper's score for one sample (JSON data + computed scores, isDraft) |
| `PhysicalEvaluation` | Green bean assessment (pre-reveal) |
| `ExtrinsicData` | Origin/processing info (post-reveal) |
| `Coffee` | Coffee product reference data |
| `SessionParticipant` | Links user to group session (owner / joined / invited) |
| `AggregateScore` | Trigger-computed community score (one per SessionSample) |
| `UserCoffeeHistory` | Per-user record of coffees tasted with scores |
| `SessionInvite` | Invite token (maxUses, expiresAt) |

---

## Roadmap

### Phase 3 — Evaluation UX Rebuild (Current)
Migrate the cupping interface from the legacy inline-styled components to the new `components/ui/` design system:
- [ ] `SampleTabs` — pill navigation between samples in a session
- [ ] `PhaseStepper` — chronological CVA phase indicator (1 Fragancia → 7 Global)
- [ ] `SessionShell` — page-level layout composing atoms into a sample evaluation form
- [ ] Rebuild `DescriptiveForm`, `AffectiveForm`, `CombinedForm` using new atomic components
- [ ] Rebuild `CupClient` orchestration with new design system
- [ ] Replace `AffectiveScale` with `AffectiveBubbles`
- [ ] Replace `FlavorTreeSelector` with `CATAPills`
- [ ] Replace `CupCheckboxes` with `CupIndicators`

### Phase 4 — Results & Analytics
- [ ] `attrAverages` JSONB populated in aggregate scores (section-level community averages)
- [ ] Radar/spider chart for attribute profile comparison
- [ ] Multi-session coffee comparison view
- [ ] Export to CSV

### Phase 5 — Session Controls & Workflow
- [ ] Async session support (`isAsync`, `closesAt` timer)
- [ ] Customizable cup count (3–5 cups)
- [ ] Sample order randomization per participant
- [ ] QR code for invite link

### Phase 6 — Collaboration & Sharing
- [ ] Organization accounts (team management)
- [ ] Session templates (pre-configured sample sets)
- [ ] Public session results (shareable URL)
- [ ] Role-based access (admin / cupper / observer)

---

## Non-Goals (Explicit Scope Limits)

- **No consumer-facing features.** This is a professional tool. No star ratings, no social sharing, no gamification.
- **No password auth.** Magic links only — by design, not by omission.
- **No mobile-native app.** Responsive web only. The cupping table already has enough gear.
- **No third-party integrations** (yet). Standalone tool; no CRM, no roastery software sync in Phase 3.
