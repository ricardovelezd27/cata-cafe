# Plan: bringing the app to the design system

> Part of the app UI/UX audit of 2026-11-15 (`REPORT.md`). A proposal: nothing is implemented until
> the owner approves it, one package at a time. Finding ids are those of `REPORT.md`; decision numbers
> are those of `DECISIONS.md`.

## How the plan is built

- **Every package leaves `main` shippable.** A package is one pull request, or a short series where
  that is said.
- **Cheap and cross-cutting first:** fixes that are wrong today, then tokens and base styles, then the
  shared parts, then screen by screen in order of use.
- **Three kinds of change, never mixed in one pull request:**
  - *No visual change* (a rename, a codemod): verified by taking the same screenshots before and after
    and finding them identical.
  - *A change of one rule everywhere* (a size, a colour): verified by the measurements of the capture
    run on a fixed list of screens.
  - *A redesign of a screen:* verified on the screen at 375, 768 and 1440 px in both languages, and by
    its tests.
- **Every package ends with** `npx tsc --noEmit`, `npm run lint`, `npm test`, and the three widths in
  Spanish and English for the screens it touches.
- **The capture tool** used for this audit (a headless browser that blocks writes, takes each screen
  and measures headings, targets, contrast, docked parts and overflow) lives outside the repository
  today. Package T1 proposes moving it into `scripts/` so "before and after" is one command.

Sizes: S = up to a day, M = two to four days, L = a week or more, to be split.

## Phase 0. Wrong today (each is small; none waits for the rest)

| Package | Closes | What | Files | Size | Verified by |
|---|---|---|---|---|---|
| **F1. The mistyped closing date** | J-01 | Correct the one row (the owner, in the database); refuse a year beyond four digits where a closing date is entered and parsed; format dates so one bad row cannot take down a list | `lib/sessionState.ts` (`planClosesAtChange`), `lib/closeRules.ts`, `app/[locale]/app/sessions/page.tsx`, the wizard and edit forms | S | A unit test for the year; the sessions list opens for that session's owner |
| **F2. No total before sending** | A-01 | One rule, "the evaluation was sent", for the results page, the print page and the PDF. Needs decision 10 first | `lib/evaluationState.ts`, `lib/reports/ranking.ts`, `lib/pdf/cvaFormData.ts`, `app/api/sessions/[id]/cva-pdf/route.ts`, `print/page.tsx` | S | Tests on `canShowMyScore` and on the sheet builder with a complete draft |
| **F3. The cloud's merge** | A-03 | Merge words by descriptor id, or only inside one block | `lib/wordCloud.ts` and its test | S | A test with two descriptors that share a label |
| **F4. Sentences that are not true, buttons that do not do what they say** | A-09, A-12, C-03, C-04, C-07, D-03, H-05, I-06 | "sesiones realizadas" counts closed sessions; "5 no enviaron" after close; the waiting room's "Iniciar cata" removed for participants; the onboarding "join" path says what to do; "Actualizar" hidden on a closed session; Insights tabs active in Spanish; the dashboard row readable on hover; plurals | `app/[locale]/app/page.tsx`, `results/page.tsx`, `WaitingRoomClient.tsx`, `WelcomeModal.tsx`, `ResultsClient.tsx`, `InsightsTabs.tsx`, `messages/*.json` | S | The capture run on those six screens; message tests |

## Phase 1. Tokens and base styles

| Package | Closes | What | Files | Size | Verified by |
|---|---|---|---|---|---|
| **T1. The capture tool in the repository** | (method) | `scripts/ux-capture/`: the tool, the plans per role, a summary of measures per screen. Reads only; refuses to run against anything but localhost | `scripts/ux-capture/**` | S | It reproduces this audit's numbers on three screens |
| **T2. Headings obey their classes** | B-01 | Step 1, no visual change: remove the 79 colour classes and 33 weight classes that do nothing today (or, if decision 2 says green titles, keep them). Step 2: move the base heading rule into `@layer base`; set the title colour once in `PageHeader` and the section heading | `app/globals.css`, about 60 files for step 1 | M | Step 1: screenshots identical. Step 2: measured colour and weight of every heading on 12 screens |
| **T3. The alias rename** | E-02, E-03 | No visual change: 426 alias classes and 166 variables to the role names; `green-mid` decided; the 15 legacy radius classes to `rounded-card` / `rounded-input` / `Button`; delete the alias block; a test that fails on a new alias | 47 component files, 14 CSS modules, `app/globals.css`, a new `tests/appTokens.test.ts` | M | Screenshots identical (the radius change excepted, checked by eye); the test |
| **T4. The paper type scale** | B-02, B-05 | Named sizes (decision 1): page, section, card, body, caption, label, with a floor. First in the kit and `PageHeader`, then a sweep of the 294 arbitrary sizes, in two or three pull requests by area | `app/globals.css`, `components/ui/**`, then by area | L | The test scans for sizes under the floor; measured text sizes per screen; the cup page checked on a phone (body text grows from 12.25 to 14 px) |
| **T5. The old palette** | E-01, E-04 | 251 hex literals to tokens, by area: arrival cards and the PWA theme; the cup stepper, `Avatar`, `FormatBadge`; Insights, with its charts through `getChartColors()` | `PhaseStepper.tsx`, `Avatar.tsx`, `FormatBadge.tsx`, `app/manifest.ts`, the auth and join pages, `components/insights/**` | L (3 pull requests) | The test scans for hex outside the sanctioned files; contrast re-measured on the stepper |
| **T6. Accessibility base** | H-03, H-04, H-06, H-07, G-01 | One focus indicator on every control; the shell inert under the cupping screen; a skip link, `aria-current`, labelled navigation; names for the unnamed switches and inputs; one reduced-motion reset | `app/globals.css`, `components/layout/**`, `components/ui/SessionShell.tsx`, `IntensitySlider.module.css`, `AccessManager.tsx`, `NewSessionForm.tsx`, `EditSessionForm.tsx` | M | A keyboard walk of sign-in, the dashboard, the wizard, the cup page and results (the first Tab stop is visible on every one); `unnamedControls` is 0 |
| **T7. The kit's sizes** | F-02, F-03, F-04, F-14 | 44 px painted in `Button`, `Select`, `SearchInput`, `PillTabs`, `SegmentedControl`, the dialog close and `InfoHint`; rating bubbles at 34 px with a 44 px hit area; a `TextAction` for small actions; checkboxes in a 24 px label; the language switch in a 44 px box | `components/ui/**`, `AffectiveBubbles.module.css`, `components/layout/TopBar.tsx`, `DataTable.tsx` | M | `targetsUnder44` and `targetsUnder24` per screen, before and after |

## Phase 2. Shared parts

| Package | Closes | What | Files | Size | Verified by |
|---|---|---|---|---|---|
| **P1. The page frame** | F-09, F-10, B-03, D-06, F-11 | `PageContainer` (wide, form, narrow), the paper spacing classes, `PageHeader` with a back link on every page, a visually hidden h1 on cup and print | `components/ui/PageContainer.tsx` (new), `app/globals.css`, every page under `app/[locale]/app/**` | L (by area) | One h1 per screen; the measured gaps are the scale's values; seven widths become three |
| **P2. `Card`, `Notice`, `SectionHeading`** | D-07, E-05, B-04 | The three primitives (specs below), then the 129 cards, the 14 terracotta banners and the 64 hand-written section headings moved to them, by area | `components/ui/Card.tsx`, `Notice.tsx`, `SectionHeading.tsx` (new), then by area | L (4 or 5 pull requests) | A count of hand-written recipes going to zero; screenshots by area |
| **P3. The kit, used** | C-05, D-08, J-02, C-09, C-06 | About 120 buttons to `Button`, 31 pills to `Badge` / `StatusPill`, 22 empty lists to `EmptyState` with one action, the two double-tap confirmations to `ConfirmDialog` | by area | L (mechanical) | A scan for hand-written button classes; the screens by eye |
| **P4. Words** | I-01, I-02, I-03, I-05, I-06, A-07 | A glossary (decision 9) and one product name with a `Wordmark` (decision 8); the cup form, the results labels and the dashboard pills through the message files; a copy pass (sentence case, no em dash, no emoji); a next step in each error message | `messages/*.json`, `lib/constants.ts`, `components/cupping/**`, `components/layout/**`, `DESIGN.md` | M | A test for the glossary's banned synonyms; the cup page in English shows no Spanish |
| **P5. Tabs, steps and place** | D-01, D-02, D-04, H-08, C-11 | Two recipes for sibling views; a selected tab that does not look like a primary button; numbered steps; one Tab stop with arrow keys; the tab, the sample, the step and the filters in the address | `components/ui/PillTabs.tsx`, `SegmentedControl.tsx`, `PhaseStepper.tsx`, `SampleTabs.tsx`, `DataTable.tsx`, `ResultsClient.tsx`, `CupClient.tsx` | M to L | Reload and "back" keep the tab and the filter; a keyboard walk |
| **P6. A tablet is a small desktop** | F-07, F-12, F-13, F-14 | Per decision 3: an icon rail from 768 px; content arrangements that follow their column (container queries); the cupping shell on the same edges | `app/[locale]/app/layout.tsx`, `components/layout/**`, `SessionShell.module.css`, the 19 `lg:` grids | L | Every screen at 768 x 1024 is the desktop arrangement a size down; nothing changes at 1440 (measured) |

## Phase 3. Screen by screen

In order of use and of score. Each package assumes phases 1 and 2 for the parts it uses, and can start
earlier where it says so.

| Package | Closes | What | Size | Notes |
|---|---|---|---|---|
| **S1. Results, step 1: room to read** | F-01, C-07, A-12 | One "Exportar" button that opens a sheet; the header scrolls away and only the tabs stay; one scroll container | M | **Can start at once.** It gives a phone back about 500 px without touching the content |
| **S2. Results, step 2: one card per coffee** | D-09, D-10, F-08, H-02, A-04, A-05, A-07, A-11, A-13, A-02, H-01, H-09, H-10 | Direction 1 of `RESULTS-DIAGNOSIS.md`: the ranking as coffee cards with "tú" beside the group; the coffee sheet with a dot plot and counted bars; the cloud, the stat row and the Tabla/Gráfico switch removed; group values per attribute from three cuppers | L (3 pull requests) | Needs decisions 6, 11, 12, 13. New parts: `ScoreWithContext`, `DotPlot`, `CountBar` |
| **S3. Results, step 3: the owner's panel and the descriptive session** | J-05, C-11 | The matrix, exclusions, alignment and late items in one "Panel" view; a first view for descriptive sessions | M | Waits on Kim for what a descriptive result is |
| **S4. Results, step 4 (optional): the flavour wheel and the cover** | K-04 | The counted flavour wheel on the coffee sheet; then, if wanted, the stage cover of a closed session | L | Needs decision 4 |
| **S5. The cupping screen** | F-05, F-06, A-08, C-10, D-12, C-02, J-04, A-06, E-06 | The chrome inside a budget on a 375 x 667 phone; the form flush to the screen; the pending state in the header row; one green "next"; the drawer as a dialog; the "Resultados" item only navigates; one guarded exit | L | Decision 5 (bubble colour); the order inside a combined step waits on Kim. Try on a real phone before merging |
| **S6. The dashboard** | C-01, I-04, D-08, A-09, F-15 | One ask; the intro inside the word budget and collapsed for a returning user; `StatusPill`; no emoji | M | Decision 14 (which way to start is first) |
| **S7. Starting a session** | C-08, D-05, K-02, C-03 | The wizard with numbered sections, one list of samples and a docked action; the waiting room on the stage | M to L | |
| **S8. Arrival** | K-01, K-05, D-11, C-04, D-04 | `ArrivalStage` for sign-in, confirm, claim and the two join pages; one arrival card for errors; onboarding with numbered steps | M | |
| **S9. Coffees, groups, profile** | I-07, F-13, J-02, K-03 | One score block on the coffee page; the coffees table at 768; empty states with a still formation | M | |
| **S10. Insights** | E-01 (its part), D-13, H-07 | Tokens and the shared chart colours; the access list as a `DataTable` | M | Lowest scores, fewest users: last |

## The order, and what can run side by side

```
Phase 0   F1  F2  F3  F4          (now; independent of everything)
          S1                      (now; results gets its room back on phones)
Phase 1   T1 -> T2 -> T3 -> T4    (T3 and T5 touch the same files as T2: one after another)
                 T5   T6   T7     (T6 and T7 touch other files: alongside)
Phase 2   P1 -> P2 -> P3          (each by area: cupping, results, lists, arrival, insights)
          P4  P5                  (alongside P2)
          P6                      (after P1)
Phase 3   S2 S3 (S4)  S5  S6  S7  S8  S9  S10
```

Decisions needed before a package can start: F2 (10), T2 (2), T4 (1), P4 (8, 9), P6 (3), S2 (6, 11,
12, 13), S4 (4), S5 (5), S6 (14).

## Proposal: one paper type scale (decision 1)

The root stays 14 px. Two options; the second is recommended.

| Role | Painted today | A. Paint the document's intent | B. The 1.25 ladder on 14 px (recommended) |
|---|---|---|---|
| Page title | 26.25, 21, 32, 17.5 or none | 32 px | 26.25 px |
| Section heading | 17.5 (most), 21, 26, 15.75, 10.5 caps | 24 px | 21 px |
| Card heading | 17.5, 15.75, 14, 12.25, 10.5 caps | 20 px | 17.5 px |
| Body | 12.25 | 14 px | 14 px |
| Caption | 10.5, 10, 11 | 12 px | 12.25 px |
| Uppercase label | 9 to 12 in 31 recipes | 11 px | 11 px (the floor) |

- **A** re-classes every heading and makes titles 22 % larger, close to the landing's in-section size:
  loud for a screen where someone works.
- **B** keeps the classes most headings already have and rewrites `DESIGN.md` to the painted values.
- **Both** move body text from 12.25 to 14 px (474 uses) and lift the 515 uses under 12 px. On the cup
  page that costs height, so it goes with S5 and is checked on a phone.

## Proposal: one paper spacing scale

Measured today: 13 distinct gaps and 7 card paddings (page header to first section 0 to 35 px by page;
section to section 17.5 to 35; heading to content 3.5 to 21; card padding 8.75 to 21).

| Gap | Phone | From 768 px |
|---|---|---|
| Page header to first section | 24 | 32 |
| End of a section to the next section heading | 32 | 40 |
| Section heading to its content | 12 | 16 |
| Card padding | 16 | 20 |
| Row padding in a list | 12 x 16 | 12 x 16 |
| Gap between the cards of a set | 12 | 16 |
| Outer margin | 16 | 24 (32 from 1280) |

Written in pixels, as classes (`.paper-page`, `.paper-section`, `.paper-section-head`) and inside
`Card`. No section sets its own padding. Paper is about 0.7 of the stage's scale (40 / 48 / 56 between
sections), which suits a screen where someone works.

**Content widths:** wide 1200 px (lists, results, profiles, Insights), form 640 px, narrow 400 px
(arrival cards), all aligned with the page header.

## Specs for the missing primitives (schematics, not code)

### `Card` (paper)

```
+--------------------------------------------------+   rounded-card, 1 px outline-variant, no shadow
| EYEBROW (optional)                [action slot]  |
| Title                                            |
| children                                         |
| ------------------------------------------------ |   optional footer on a hairline
| footer                                           |
+--------------------------------------------------+
```

- **Props:** `tone` (default = `surface-container-lowest`, quiet = `surface-container-low`, selected =
  `primary-fixed`), `padding` (16 or 20 px, in pixels), `title`, `eyebrow`, `action`, `footer`,
  `interactive` (hover `surface-container-high`, focus ring), `as`.
- **Replaces:** 129 hand-written cards in 43 recipes (9 backgrounds, 13 paddings).
- **Rule:** all cards of one kind have the same parts in the same order. A card is as wide as its
  content needs: a stat card is capped at 240 px.

### `Notice`

```
[icon]  One sentence that says what happened.            [one optional action]
```

- **Props:** `tone` (info = `surface-container`, warning = `warning-container`, error =
  `error-container`), `icon`, `action`. Never terracotta.
- **Replaces:** 14 terracotta banners on results and cup, three `rounded-md` banners, the stale-bundle
  and identity notices, `GuestSaveCta`'s frame.

### `SectionHeading` (paper counterpart of `components/landing/SectionHeading.tsx`)

```
SECTION NAME (label size, on-surface-variant)              [action, InfoHint or count]
Section title (section size)
Assertion line, optional (caption size, on-surface-variant)
```

- Left-aligned at every width on paper (the stage's is centred; paper is read down a left edge).
- **Props:** `title`, `assertion`, `name`, `level` (2, or 3 for a title inside a card), `action`,
  `info`, `id`.
- **Replaces:** 43 `h2` in 16 recipes, 21 `h3` in 14, the uppercase labels used as headings.

### `PageContainer`

```
|<- margin ->|<--------------- wide: up to 1200 px --------------->|
|            | PageHeader (title, back link, one action)            |
|            | sections ...                                         |
|            |<----- form: up to 640 px ----->|                     |
```

- **Props:** `width` (wide, form, narrow). One alignment: the content's left edge is the header's.
- **Replaces:** seven widths and three alignments chosen page by page.

### `TextAction`

A link-styled button inside a 44 px box (the text stays small; the box does not).

- **Replaces:** about 20 text links and icon actions of 14 to 27 px ("Ver →", "Editar muestra",
  "Omitir introducción", "Ver todas las sesiones", the language switch).

### `ScoreWithContext`

```
92.75   ± 4.8 · 7 de 8 incluidos · indicativo            Δ +13.75 vs. referencia
        tú 98.00
```

- One line: the number in ink (never coloured), its spread, how many were included, the honesty flags,
  the difference from the reference in ink with its sign, and for a participant their own number.
- The score is named once per surface by the surface's heading, not here.
- **Replaces:** six hand-built places on results, the coffee page's score rows, the dashboard's.

### `CountBar` and `DotPlot`

```
CountBar:   Frutal   ████████████░░░░   7 de 8        (length = people / cuppers; the count is printed)
DotPlot:    Aroma    1 ----o-------●---- 9            (o = the group, ● = me; one fixed scale for all rows)
```

- `CountBar` replaces five bar implementations; `DotPlot` replaces the radar, the table row and the
  comparison block for "me against the group". No animation; text never under 12 px; family colours on
  the bar only, never on the text.

### `ExportSheet`

One "Exportar" button that opens a `ResponsiveDialog` listing the documents (the form, the PDF, my
summary, the technical sheet, the two CSVs) with one line each on what they are.

- **Replaces:** six docked buttons (272 px on a phone).

### `Wordmark`

The landing's mark as one component, used by the landing header, the sidebar, the top bar and
`ArrivalStage`; it links home.

### `ArrivalStage`

```
[stage ground]  wordmark ................................... ES | EN
          (a still formation or a pool of light behind the card only)
          +--------------- solid cream card ---------------+
          | Title, one line of up to 25 words              |
          | the form, or one primary button                |
          | small print                                    |
          +------------------------------------------------+
   Privacidad · Términos · Aviso legal
```

- **Props:** `title`, `lead`, `children`, `formation`, `showLocaleSwitch`, `footerLinks`.
- The dots never sit under the card. Plain cream fallback under reduced motion and without script.
- **Replaces:** seven hand-made cards and about twelve states across sign-in, confirm, claim, the two
  join pages, the first-load error and the not-found pages.
