# Cata Café — Product Document

> Last updated: 2026-11-14 (design rules and the landing page; the rest dates from 2026-09-07 and the S10 rules of 2026-11-12)

---

## Vision

**Cata Café is the professional evaluation tool for specialty coffee cuppers.**

It implements the SCA CVA (Coffee Value Assessment) methodology end-to-end — from session creation and blind sample management through structured sensory scoring, real-time group collaboration, and exportable PDF certificates.

The tool exists to make rigorous, reproducible cupping sessions as frictionless as possible, so that the cupper's full attention stays on the coffee — not the software.

**Standing product law: valor antes que fricción.** The app delivers value first and asks for identity, data, or money only afterwards — always dismissibly. Every gate we design, present and future, is checked against this ordering before it ships.

**El puntaje necesita contexto.** A CVA number alone is not a decision: the same coffee can be excellent for one objective (filter, education, alignment) and wrong for another (espresso, a buyer's target). Every score surface therefore ships with its comparison — community mean, consensus SD, and now the owner's reference sample with a signed Δ — all display-only; the CVA formula is never mutated. As of 2026-09-25 the reference is cupped first and its quality pinned at 5, so it works as a fixed reference the room aligns on (a Café Sensible exercise, not part of the CVA) rather than another competitor in the ranking. New features are checked against one question: does this help the user understand what they are evaluating, against what, and what the result means? Adding numbers without context is regression.

**Product rules decided on 2026-11-12 (built in S10; all merged to `main` in November 2026).** Source: `docs/product/cata-descentralizada-puntaje.md` and the top of `docs/prompts/S10-kim-answers.md`.
- **Stay close to the CVA.** The cupper sees the CVA's own deductions, not a reinterpretation: 4 points per defective cup, 2 per non-uniform cup.
- **A defect costs the cupper points at any cup count.** The earlier "no deductions under five cups" rule is gone. Stored scores keep their value and render unchanged (nothing was recomputed in bulk).
- **One cup never costs more than 6 points.** A rule under which a single cup cost 15 to 30 points was considered and rejected.
- **A shared deduction is diluted only beyond five pooled cups.** This holds for a session's group score and a coffee's lifetime score; a cupper's own score is always the flat CVA deduction.
- **The number is named "Puntaje Café Sensible (base CVA)".** It follows the CVA form but is not a CVA report.
- **A score is a number only.** No colour and no category name by quality; the legend gives two anchors, 79 as the neutral point and 100 as the maximum.
- **The total is not shown while cupping**, so nobody decides the final number and spreads it backwards. It appears after "Enviar", with its arithmetic in one line.
- **The fixed reference (79.00) is a Café Sensible classroom exercise, not part of the CVA.** The organizer can instead choose a free reference that everyone scores like any other sample.
- **Group results appear only when the session is closed**, so seeing the group cannot bias a cupper who has not finished.
- **As little free text as possible.** Prefer fixed option lists so cuppings stay comparable (the acidity and sweetness pickers stay as they are, a recorded departure from the CVA 2024 form).
- **Teaching and comparisons appear only when a session is closed**, never as guidance during the cupping.
- Every behaviour built on a simulated answer of Kim awaits his confirmation: `docs/product/kim-validar-S10.md`.

**How the product presents itself (decided 2026-11-14, while rebuilding the landing page).** These are product rules, not styling: they decide what a screen may contain. `DESIGN.md` is the design system that carries them out and governs every screen.
- **One action per screen or fold.** The landing's header has one action (sign in); the offer is made once, in the hero card. A second call to action in the same view competes with the first.
- **Say what a thing is, then what is true about it.** A section's title names the section in plain words ("Así funciona una cata.") and the line under it makes the claim ("Percibir, describir, alinear."). No clever title that hides what the section is.
- **Show the product, not a picture next to it.** "Cómo funciona" shows the app's own screens piling up through the three steps. Real photos of real sessions are for people ("Para quién es"), never as testimonials: no names, no quotes.
- **A feature is a name, an explanation and a drawing of it.** Every feature gets the same three parts and the same weight.
- **One way to move through a page.** On a phone every set of cards is worked the same way (the header stays, the scroll brings the cards one by one). A visitor does not learn a second gesture.
- **Changing language keeps your place.** The page does not reload and does not go back to the top.
- **Control before speed.** A card moves about as far as the finger does. A page that is a little longer but obeys the thumb beats a shorter one that runs away.
- **The dots never sit behind work.** The constellation belongs to moments of arrival (the landing; later sign-in, a waiting room, an empty state), never behind a form, a table or a cupping.
- **A score on the landing is a sample, and looks like one.** Group and individual are told apart by colour as two series, never as good and bad.

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
| **Valor antes que fricción** | Entry is name-only: guests join a session via QR with just a display name (anonymous auth) — no email, no password. Identity is requested only *after* value is delivered, via a dismissible "Guarda tus resultados" banner on the results page. This ordering is a standing law for every future gate too, monetization prompts included — never ask before you've given. |
| **Group collaboration** | Real-time submission tracking via Supabase Realtime. Community aggregate scores computed by PostgreSQL trigger. |
| **Blind integrity** | Sample labels are coded (A, B, C…); origin data is entered post-reveal only. |
| **Full traceability** | Every evaluation links to a coffee profile with complete tasting history and community scores. |
| **Export** | PDF certificate generation with score breakdown via `@react-pdf/renderer`. |
| **Contexto del puntaje** | Reference sample (control) with signed Δ on every results surface and in the PDF; SD consensus chip; community vs. mine — all display-only, scoring untouched. |

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

## Scoring (Puntaje Café Sensible, base CVA)

```
S = 0.65625 × Σhᵢ + 52.75 − uniformityPenalty − defectPenalty
```

| Variable | Definition |
|---|---|
| `hᵢ` | 9-point affective score for each of 8 sections (fragrance → overall) |
| uniformity penalty | 2 per non-uniform cup (only with 2 or more cups) |
| defect penalty | 4 per defective cup; a defective cup is also non-uniform, so at most 6 per cup |
| Result | Rounded to the nearest 0.25, kept between 0 and 100 |

Every attribute at 5 gives 79.00 and every attribute at 9 gives 100.00.

**Three scopes, one deduction rule** (`lib/scoring.ts`):

1. **Individual**: the cupper's own cups, always the flat CVA deduction.
2. **Session (group)**: the average of the included cuppers' raw scores, minus the deductions of all their pooled cups scaled by `5 ÷ max(5, pooled cups)`: flat up to five pooled cups, diluted beyond. Computed by the PostgreSQL trigger `trg_recompute_aggregate` (authoritative); the TypeScript function is display-only. An evaluation with a section marked "no evaluado" is a partial one: it has no total and is not included, but its rated sections feed the attribute averages.
3. **Coffee lifetime**: the same rule over every counted cup of a coffee (closed sessions, revealed samples, excluded cuppers out), computed when the coffee page is read and never stored. It also tallies defective cups by type (mohoso, fenólico, papa).

"Indicativo" labels a number built on few cuppers (3 to 5; firm from 6) or on fewer than 5 pooled cups. Equal or very close scores are shown as "sin diferencia clara". These labels, the reference, Δ chips and the spread (SD) are display only and never change a score.

**Old scores:** Stored scores from before the rule keep their value and render unchanged; the close, repair and cron passes and "Actualizar" on a closed session never recompute them. A deliberate re-fire (owner exclusion or inclusion, accepting a late evaluation, a guest claim that removes or replaces a submitted evaluation) or editing an old evaluation recomputes that sample under the current rule. The data says which rule produced a stored score.

---

## Feature Set (Current)

### Session Management
- [x] Create solo cupping session (Descriptive, Affective, Combined)
- [x] Create group session with invite link
- [x] Reusable invite link (no use limit by default)
- [x] Add samples with coded labels and optional coffee reference
- [x] Progressive metadata: only the coffee/sample **name** is required at creation — altitude and roast level are optional, filled in whenever convenient
- [x] Session status lifecycle: `draft → active → closed`
- [x] Close session (freezes evaluations)
- [x] Reveal samples (unlocks origin data entry)

### Evaluation Interface (`CupClient`)
- [x] Sample tab navigation (pill tabs, coded labels)
- [x] Phase tabs: Physical Evaluation / Cupping / Extrinsic Data
- [x] `IntensitySlider` (0–15, step 0.5) for descriptive attributes
- [x] `AffectiveBubbles` (1–9) for affective scores
- [x] `FlavorPicker` for flavor-wheel CATA selection — browse the hierarchy **or** predictive typeahead (Fuse.js, accent/typo-tolerant, breadcrumbed); unmatched input kept as a free note
- [x] `CupToggleGrid` for cup uniformity and defect tracking (also at one cup: defect row only)
- [x] Auto-save at 800ms debounce (no manual save)
- [x] Master Controls (session leader only): reveal, close
- [x] No live total while cupping; after submitting, the total with its arithmetic in one line (the live "Puntaje calculado" card was removed in S10)
- [x] Defect type per cup, optional timer, a second value "as it cooled", "no evaluado" per section, an optional market note
- [x] A revealed sample of an open session takes no more ratings
- [x] Responsive cupping layout with mobile sample navigation bar
- [x] Sample selection persists across phase tabs

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
- [x] Real-time submission tracking (Supabase Realtime) — badges the results page's refresh button when other cuppers submit, without auto-re-rendering
- [x] Participant management (owner / joined / invited)
- [x] Community aggregate score (PostgreSQL trigger)
- [x] One merged results view — mine and the community's scores render together (Tabla/Gráfico sub-views, choice persisted per-browser); there is no separate "my results / group results" toggle
- [x] Master can exclude a participant from group aggregates (re-fires recompute)
- [x] Owner-only "Análisis por catador": CVA matrix with per-cupper exclusion switches, folded into the Resultados tab
- [x] Session-level descriptor aggregates (CATA frequency across participants), sliced by one unified sample + perceptual-block filter (including a whole-profile "General" view) shared by the word cloud, frequency bars, and consensus sentences
- [x] Async sessions (`isAsync`) with optional close date (`closesAt`)
- [x] Configurable cups per sample (`cupsPerSample`, default 5)

### Offline-First
- [x] Continue cupping with no connection (drafts persisted to IndexedDB via localforage)
- [x] Online/offline detection with on-screen offline banner
- [x] Automatic draft sync on reconnect (`useOfflineSync` + `app/actions/offline.ts`)
- [x] Conflict-aware replay: local-wins for drafts; conflict modal if already submitted elsewhere
- [x] SSR-safe store (no-ops on the server; never imported by server code)

### Onboarding
- [x] First-run welcome modal capturing role and country
- [x] Guided first action (create a session / add a coffee)
- [x] `onboardingCompleted` flag on the profile

### Results & Export
- [x] Individual CVA score with formula breakdown
- [x] Three-tab results page for every viewer — **Resumen** (session dashboard: stat row, sample ranking by community score in group sessions / own score in solo, "Mi desempeño" card comparing my average to the community average with a consensus-alignment bar, per-sample descriptor highlights), **Resultados** (mine + community merged into one Tabla/Gráfico view; owner-only "Análisis por catador" CVA matrix), **Descriptores** (one sample + perceptual-block filter driving the word cloud, frequency bars, and consensus sentences; solo descriptive/combined sessions get this tab from their own data)
- [x] Personal per-sample drill-down dialog — opened from a ranking row, a table cell, a radar chart header, or the owner's CVA matrix; the owner additionally gets a catador switcher, the sample-metadata editor (moved here from the old header chips), and — for revealed samples — a post-close origin-data editor
- [x] Consensus (SD): a "± X.X" chip next to the community score in the Resumen ranking, and a "DE" column in the owner's CVA matrix — the spread of individual scores among included cuppers
- [x] Refresh ("Actualizar") always visible to every viewer; the server recompute stays owner-only since a participant's own view is already fresh (the DB trigger restamps `computedAt` on every submission)
- [x] Score transparency panel (`ScoreBreakdownPanel`, "¿Cómo se calculó?") — individual + community variants, reads authoritative numbers verbatim
- [x] Coffee profile with full tasting history
- [x] Personal history page (`/profile/history`)
- [x] PDF certificate export (`/sessions/[id]/print`) — physical-evaluation appendix with real defect/screen/color data and derived Cat.1/Cat.2 totals, roast level in the header (revealed-gated, same as the coffee name)

### Marketing / Public
- [x] Public marketing landing page at `/[locale]` (Spanish default, `/en` secondary), rebuilt 2026-11: one header action, the founding offer in the hero card, "Cómo funciona" as three app screens that pile up, six equal feature cards each with a drawing, five people cards with real session photos, the founding offer again, a closing line. A constellation of dots runs behind it and changes shape with each section. On a phone the three card sections share one scroll behaviour. Switching language keeps the reader's place.
- [x] Waitlist signup form (`app/actions/waitlist.ts`)

### Coffee Library
- [x] Coffee profile pages with aggregate scores
- [x] Public + owned coffees browse
- [x] Unique 6-char short code per coffee (e.g. `K7M-3FP`) — a human-shareable identifier shown on the profile, the coffee list, and the picker, with code-prefix search ranked above fuzzy name matches
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
| `Profile` | User account (id = Supabase UUID); `role`, `country`, `onboardingCompleted` |
| `CuppingSession` | Session event (format, status, isGroup, isAsync, closesAt, cupsPerSample) |
| `SessionSample` | Coffee sample within a session (position, label, revealed, coffeeId) |
| `Evaluation` | One cupper's score for one sample (JSON data + computed scores, isDraft) |
| `PhysicalEvaluation` | Green bean assessment (pre-reveal) |
| `ExtrinsicData` | Origin/processing info (post-reveal) |
| `Coffee` | Coffee product reference data; unique 6-char short `code` |
| `SessionParticipant` | Links user to group session (owner / joined / invited); `excludedFromResults` |
| `AggregateScore` | Trigger-computed community score (one per SessionSample) |
| `UserCoffeeHistory` | Per-user record of coffees tasted with scores |
| `SessionInvite` | Invite token (maxUses, expiresAt) |

---

## Roadmap

> The consolidated, prioritised list of everything not yet built lives in `docs/BACKLOG.md` (2026-09-25). This section is the coarse map.

### Shipped (since the original Phase 3 plan)
- [x] Evaluation UX rebuild on the `components/ui/` atomic design system
- [x] `IntensitySlider`, `AffectiveBubbles` (replaced `AffectiveScale`), `CATAPills`
      (replaced `FlavorTreeSelector`), `CupIndicators` (replaced `CupCheckboxes`)
- [x] Radar/spider chart for attribute profile comparison
- [x] `attrAverages` populated in aggregate scores (section-level community averages)
- [x] Async session support (`isAsync`, `closesAt`)
- [x] Configurable cup count (`cupsPerSample`)
- [x] Offline-first cupping with conflict-aware sync
- [x] Guided onboarding (role + country capture)
- [x] Mobile/responsive cupping layout
- [x] `FlavorPicker` — predictive typeahead over the 3-level flavor wheel (Fuse.js), replacing the browse-only `CATAPills` flavor flow
- [x] `ScoreBreakdownPanel` — score transparency ("¿Cómo se calculó?") for individual and community scores
- [x] Public marketing landing page (animated, bilingual) + waitlist; rebuilt 2026-11 as the reference for the design system (`DESIGN.md`)
- [x] Results page redesign (2026-08): collapsed to 3 tabs for every viewer (Resumen dashboard / merged Resultados / unified-filter Descriptores), removed the old "mis resultados vs. grupales" toggle and the separate master-only Individual tab, added a personal drill-down dialog with an owner catador switcher, and made the refresh control always visible
- [x] Coffee short codes + progressive metadata (2026-09): unique 6-char coffee codes end to end (creation, search, display); session/coffee creation now needs only a name, with post-close origin-data editing added to the results drill-down
- [x] Consensus SD + CVA PDF fixes (2026-09): a display-only standard-deviation figure alongside community scores; the exported PDF's physical-evaluation block now renders real defect/screen/color data and gates roast level on reveal like the coffee name
- [x] Guest → account claim (2026-09): the results-page banner now routes guests through the normal login flow (magic link or Google) and merges their tasting data onto the resulting account — new or existing — instead of an in-place email swap
- [x] Reference sample (2026-09): owner marks one sample as "Referencia" from the wizard, edit page or master panel (live to participants); cup, waiting room, results, PDF and print show it, results add a signed Δ against it — scoring untouched. First live test: end-of-month alignment cupping.
- [x] QR code for invite link (wizard step 2 + printable sheet)
- [x] Reference-first anchor (2026-09-25): the reference is now cupped FIRST (order swaps live if the owner changes it mid-session), its affective quality is pinned at 5 on every attribute with cup checks cleared (server-enforced, affective/combined formats only), and results show it as an anchor card above the ranking — excluded from the ranking, session average and "Mejor muestra" — instead of competing inside it.

### Next — Design system across the app
- [ ] UI/UX audit of the app against `DESIGN.md` (rubric: `docs/design-system/AUDIT-RUBRIC.md`; session prompt: `docs/prompts/S11-app-ui-ux-audit.md`)
- [ ] App revamp from that audit: shared primitives first (a card, a section heading for the app, a stage wrapper for the screens of arrival), then screen by screen
- [ ] The stage in the app's moments of arrival: sign-in, the waiting room, empty states

### Next — Results & Analytics
- [ ] Multi-session coffee comparison view
- [ ] Export to CSV
- [ ] Radar overlay: mine vs reference vs group mean (three polygons) — only after the reference experiment validates the concept
- [ ] Structured objectives + methodologies per session (educational / alignment / selection / consumer / professional) — design first outside the software (docs/product/objetivos-y-metodologias.md)

### Next — Session Controls & Workflow
- [ ] Sample order randomization per participant
- [ ] Session templates (pre-configured sample sets)

### Later — Collaboration & Sharing
- [ ] Organization accounts (team management)
- [ ] Public session results (shareable URL)
- [ ] Role-based access (admin / cupper / observer)

---

## Non-Goals (Explicit Scope Limits)

- **Professional-first social layer.** (Revised 2026-07) The platform now includes community features — tasting groups, activity levels, shared coffee profiles — but they stay professional in tone: no star ratings, no public follower counts, no engagement-bait mechanics.
- **No password auth.** Magic links only — by design, not by omission.
- **No mobile-native app.** Responsive web only — but offline-capable, so weak lab/farm connectivity is no longer a blocker. The cupping table already has enough gear.
- **No third-party integrations** (yet). Standalone tool; no CRM, no roastery software sync.
