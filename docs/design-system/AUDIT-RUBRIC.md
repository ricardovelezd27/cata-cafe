# App UI/UX audit: rubric

> Written 2026-11-14, after the landing page was rebuilt. Owner: Ricardo.
> The system being audited against is `DESIGN.md` (root of the repository). This file is the
> checklist derived from it, the list of screens, the scale for rating a finding, the form a
> finding is reported in, and what is already known to be out of line.

## 1. What is audited, and what is not

**In scope:** every screen a signed-in person, a guest or a visitor past the landing can
reach: `/app/**`, `/auth/**`, `/join/**`, the three legal pages, the error and not-found
screens, the emails' landing points. Both languages. Phone, tablet and desktop.

**Out of scope:**
- The landing page (`app/[locale]/page.tsx`, `components/landing/**`). It was built against
  the system; treat it as the reference, not as a subject.
- The scoring rules, the session lifecycle and every product rule in `PRODUCT.md` and
  `CLAUDE.md`. They are fixed inputs. If a screen breaks one, that is a finding; the rule
  itself is not up for review here.
- Anything that waits on Kim (`docs/product/kim-validar-S10.md`). Note it, do not resolve it.
- PDFs and emails as documents (`lib/pdf/**`): a separate medium with its own rules.
- The dev-only routes (`/dev`, `/app/warmup/dev-*`). List them once as "should not ship in
  the navigation"; do not audit their design.

**The audit changes no code and no data.** It ends in a report and a plan.

## 2. How to look

| Axis | Values |
|---|---|
| Viewports | 375 × 667 (small phone), 390 × 844 (phone), 768 × 1024 (tablet), 1440 × 900 (desktop) |
| Languages | Spanish (default) and English, on every screen |
| Who | Owner of a session, participant, guest (anonymous), registered user with no data yet, super-admin (read-only lens) |
| States | Empty, loading, filled, error, offline, saving / pending sync, closed session, expired session, revealed sample |
| Settings | Reduced motion, reduced transparency, 200 % zoom, keyboard only |

**The local environment uses the production database** (the worktree's `.env.local`). So:
look and read; do not create, edit or delete anything from the audit session, do not type a
real address into any form, and agree with Ricardo first on any account or session used to
reach a state. Where a state cannot be reached safely, audit it from the code and say so in
the finding ("from code, not seen").

Every claim about a screen needs evidence: a file and line, a measured value (a size, a
contrast ratio, a count) or a screenshot. "Feels inconsistent" is not a finding; "the page
title is 26 px here and 31.5 px on the sessions list (`PageHeader` not used)" is.

## 3. Rating a finding

| Level | Meaning | Example |
|---|---|---|
| **P0** | Breaks a product rule, loses or misstates data, or blocks a task | A score coloured by quality; a save shown as done when it is only on the device; a control that cannot be reached by keyboard |
| **P1** | Breaks a rule of `DESIGN.md` in a way a user meets on a main path | Two primary buttons on the session screen; a touch target under 24 px; body text under 4.5 : 1 |
| **P2** | Breaks a rule off the main path, or is an inconsistency between screens | A hand-rolled status pill; a heading aligned differently from its neighbours; a legacy colour alias |
| **P3** | Polish: correct but could be clearer or calmer | Spacing rhythm, a title that could say more plainly what the section is |

Each dimension of section 5 also gets a score from 0 (failing) to 4 (exemplary), so the
result can be compared with the landing's own audit (11 of 20 before its redesign).

## 4. The form of a finding

One row per finding, in a table the plan can be built from:

| Field | Content |
|---|---|
| Id | `A-01`, `B-01`, ... by the dimension letter of section 5 |
| Screen | Route and, where it matters, the state (`/app/sessions/[id]/results`, closed, owner) |
| Viewport and language | Where it was seen |
| Rule | The heading in `DESIGN.md` (or the rule in `PRODUCT.md`) it breaks |
| What | One sentence, with the measured value |
| Evidence | `file:line`, and a screenshot name when one was taken |
| Level | P0 to P3 |
| Fix | The component or token to use; "new primitive needed" when nothing exists |
| Size | S (one file), M (one screen), L (a pattern across screens) |

Group findings that are one cause seen many times (one row, with a count and the list of
places) instead of repeating them.

## 5. The checklist

Each line is a question to answer for every screen. The heading in brackets is the part of
`DESIGN.md` it comes from.

### A. Product rules on screen
- A-1. Is any score coloured or named by how good it is? [No quality bands]
- A-2. Is a total shown while the person is still cupping? [`ScoreDisplay` (removed)]
- A-3. Does every score sit next to its context (group, spread, reference), and is the
  number named correctly ("Puntaje Café Sensible (base CVA)" once per surface)? [`PRODUCT.md`]
- A-4. Does anything on a participant's screen reveal blind data (a coffee's name, another
  cupper's values) before the rule allows it? [`CLAUDE.md`, blind-leak gates]
- A-5. Is a save shown as done only when it reached the server? [`CLAUDE.md`, save status honesty]
- A-6. Does every screen give something before it asks for something? [Principle 4]

### B. Hierarchy and type
- B-1. Is the page title one clear step above the section headings, and those above the
  card headings? Measure them. [Typography: hierarchy is a step]
- B-2. Is any heading smaller than a heading inside its own section?
- B-3. Do the sizes painted match the type scale's intent, given the 14 px root? List the
  real sizes per role across the app. [Typography: the root font size]
- B-4. Is `PageHeader` used for every page top? [Shared list/CRUD kit]
- B-5. Are numbers in `tabular-nums` everywhere?
- B-6. Is italic used only for score decimals, editorial emphasis and a title's assertion line?

### C. Actions
- C-1. How many primary buttons are visible at once? More than one is a finding. [Bringing
  the stage into the app: one action per fold]
- C-2. Is every action a `Button` / `ButtonLink`, with the right variant for its weight?
- C-3. Are `Button`, `PillTabs` and `SegmentedControl` each used for what they mean?
  [Interactive control vocabulary]
- C-4. Does every destructive action go through `ConfirmDialog`, and does its text state
  what will be lost?
- C-5. Is the main action reachable without scrolling on a 375 × 667 phone?

### D. One way to do a thing
- D-1. Do the sections of a screen open the same way (component, alignment, size)? [One
  header for every section]
- D-2. Do all cards of one kind have the same parts in the same order? [One anatomy per
  kind of card]
- D-3. Is a set of items moved through the same way everywhere on a given device? List
  every carousel, tab row, accordion and stepper. [One gesture]
- D-4. Is every list a `DataTable` (table from `md`, cards below), every status a
  `StatusPill`, every empty list an `EmptyState`?
- D-5. Does changing language, tab, filter or view keep the person where they were? [Keep
  the reader's place]
- D-6. Is anything implemented twice (two dialogs, two pill styles, two card recipes)?

### E. Surfaces, colour and tokens
- E-1. Any hex, rgba, pixel radius or shadow literal in a component? [How this document governs]
- E-2. Any legacy colour alias or legacy radius class? Count them per file. [Backward-compat
  aliases; Border radius]
- E-3. Is terracotta used as an accent only, never as a quality signal; is the error red used
  only for defects and errors? [Terracotta rule; What not to do]
- E-4. Is glass used only on overlays and side panels? Is there any decorative blur? [Glass
  and grain on paper]
- E-5. Is depth made by tone and a hairline, not by heavy shadow? [Elevation and depth]
- E-6. Does the thing the person must read or act on sit on the most opaque, highest-contrast
  surface of the screen?

### F. Layout and devices
- F-1. Do content layouts switch at `md`, the shell at `lg`, dialogs at 640 px? [Breakpoint rule]
- F-2. Any horizontal scroll of the page at 320 px wide? Any text or control cut off?
- F-3. Are all touch targets at least 44 × 44 px (measured, not read from a class name)?
- F-4. Is spacing on the 4 px grid, with a rhythm (not the same padding everywhere)?
- F-5. Do long Spanish and English strings both fit (buttons, tabs, table headers)?
- F-6. Does an enhanced layout have a plain fallback, and is it switched on only where it fits?

### G. Motion
- G-1. Does anything animate a number? [Motion; Principle 2]
- G-2. Does anything move during a cupping that is not a direct answer to a touch? [Principle 3]
- G-3. Are transitions on transform and opacity only, with the two motion tokens?
- G-4. With reduced motion, does everything still work, and does nothing pin or slide?

### H. Accessibility
Every row of the table in `DESIGN.md` "Accessibility" is a check: contrast (measure
`on-surface-variant` on each container tone, and any text at reduced opacity), focus ring and
order, names of controls, toggle and tab semantics, colour alone, zoom and reflow, reduced
transparency, the page's language attribute.

### I. Words
- I-1. Does each title say in plain words what the thing is? [Idea, then assertion]
- I-2. Is anything said twice (a heading restated by the line under it)?
- I-3. Are labels the same word for the same thing on every screen (and the same in both
  languages)? List the synonyms found.
- I-4. Do error messages say what happened and what to do, in the user's language?
- I-5. Is Spanish the original and English a mirror of its structure? [Principle 8]

### J. States
- J-1. Does every list have a designed empty state with one action?
- J-2. Does every screen that waits show a skeleton or a status, never a blank?
- J-3. Does every error keep the person's work and offer a way forward?
- J-4. Are offline, pending and conflict states visible outside the cup screen too?

### K. Where the stage could come in
Not findings: opportunities, listed separately. For each place in the table of `DESIGN.md`
"Where the dots and the dark ground may appear in the app", say what is there today, what
the stage version would be, and what it would cost. Never propose the dots behind a form.

## 6. The screens

| Area | Routes |
|---|---|
| Arriving | `/auth/login`, `/auth/confirm`, `/auth/claim`, `/join/[token]`, `/join/coffee/[token]`, the onboarding dialog |
| Home | `/app` |
| Sessions | `/app/sessions`, `/app/sessions/new`, `/app/sessions/express`, `/app/sessions/[id]/edit`, `/app/sessions/[id]/invite`, `/app/sessions/[id]/waiting` |
| Cupping | `/app/sessions/[id]/cup` (each format: descriptive, affective, combined; owner and participant; the notes step; the timer; the offline banner) |
| Results | `/app/sessions/[id]/results` (three tabs; owner, participant, guest; open and closed), `/app/sessions/[id]/print` |
| Coffees | `/app/coffees`, `/app/coffees/new`, `/app/coffees/[id]`, `/app/coffees/[id]/edit` |
| Groups | `/app/groups`, `/app/groups/[id]` |
| Profile | `/app/profile`, `/app/profile/history` |
| Warm-up | `/app/warmup`, `/app/warmup/[slug]`, the player in its three modes |
| Insights | `/app/insights`, `/explorer`, `/benchmark`, `/chat`, `/users`, `/access` |
| Shell | Sidebar, bottom navigation, top bar, the guest gate dialog, toasts, the pending-drafts badge |
| Edges | The error boundaries, the two not-found pages, `/privacidad`, `/terminos`, `/aviso-legal` |

## 7. Known drift (measured 2026-11-14; a baseline, not the audit)

These were counted while writing the system. Confirm each, then size it.

| What | Measure | Where to start |
|---|---|---|
| Legacy colour alias classes in components | 423 uses; the most common are `text-brown-mid` (151), `text-brown-dark` (88), `text-green-dark` (32), `border-brown-light` (30), `bg-cream` (27), `text-red-defect` (22) | `app/**`, `components/**` |
| Legacy colour variables inside CSS modules | 164 uses of `var(--color-brown-*)`, `--color-green-*`, `--color-amber`, `--color-cream`, `--color-bg`, `--color-red-defect` | `components/ui/*.module.css` |
| Legacy radius classes (`rounded-md`, `-lg`, `-xl`, `-2xl`) outside the landing | About 30 uses; they paint 24 to 48 px, far larger than intended on paper | Search `rounded-(md|lg|xl|2xl)` |
| Hex literals in components | `components/ui/Avatar.tsx` has a hard-coded palette; about a dozen other files contain a hex-looking literal to confirm | Search `#[0-9a-fA-F]{6}` |
| Inline styles | About 30 component files outside the landing use `style={{` | Each one: is it a computed value (fine) or a design value (not) |
| A rating tinted by its value | `AffectiveBubbles` tints the selected bubble terracotta from 7 and error-red up to 3 | Decide with Ricardo whether "no quality bands" covers a rating |
| Type scale against the 14 px root | The scale lists 32 px, 24 px and 20 px headings; the classes beside them paint 26.25, 21 and 17.5 px | Measure the real sizes and settle one scale |
| No shared section heading on paper | `PageHeader` exists for a page; sections are headed by hand | Propose the paper counterpart of `components/landing/SectionHeading.tsx` |
| No card primitive | `DESIGN.md` gives a class recipe for a card; there is no `Card` component | Count the hand-written cards and their variants |
| Layout note in `DESIGN.md` | "Container max 1280 px, outer margin 48 px" is stated but not checked against the shell | Measure the app's real container |
| Dev routes | `/dev`, `/app/warmup/dev-*` exist as pages | Confirm they are unreachable from the navigation in production |

## 8. What the audit delivers

1. **A report** at `docs/audits/app-ui-ux-<date>/REPORT.md`: the score per dimension (0 to 4),
   the findings table, and for each P0 and P1 a screenshot or a measured value.
2. **A plan** in work packages that each leave `main` shippable, ordered so the cheapest
   cross-cutting fixes come first (tokens and aliases, then shared primitives, then screen
   by screen). Each package lists its files and how it is verified.
3. **Proposals for the missing primitives**, each as a short spec: a `Card`, a paper
   `SectionHeading`, a stage wrapper for the screens of arrival. Schematics, not code.
4. **A list of decisions only Ricardo can take** (and those that wait on Kim), each with
   the options and a recommendation.
5. **Corrections to `DESIGN.md`** where the audit shows a rule to be wrong or missing. The
   document is changed in the same pull request as the report, never silently.
