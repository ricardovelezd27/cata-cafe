# Café Sensible — Design System

> **Sensory Studio** — Warm Minimalist · Editorial Precision
> Version 2026-11-16. This is the design system that governs the product: the public landing page and the app.
> The landing page was rebuilt against it in November 2026. The app was audited against it on 2026-11-15 (`docs/audits/app-ui-ux-2026-11-15/`); the work packages that bring it into line are in that folder's `PLAN.md`, and the owner's decisions in its `DECISIONS.md`.

---

## How this document governs

1. **It is normative.** A screen that departs from a rule here is a finding, unless the rule itself is wrong. If the rule is wrong, change the rule here first, in the same change as the code.
2. **Tokens live in one place.** Colours, type, radii and shadows are CSS custom properties in `app/globals.css` (`:root`, mirrored in `@theme inline` so Tailwind has utilities for them). This document describes them; the CSS is what runs. No hex, pixel radius or shadow literal in a component.
3. **Where the document and the code disagree, say so; do not guess.** Parts of the app predate parts of this document. The known gaps are listed in "Known drift" in the audit rubric. A rule marked **(rule)** binds new work today; a description of an existing component is a record of how it is built, and may itself be a finding.
4. **Order of authority.** `PRODUCT.md` (what the product is and its standing rules) comes first, then this file, then a component's own comment. A product rule beats a visual preference: "a score is a number only" is a product rule, so no palette decision can colour a score.
5. **One section, one owner of a pattern.** Every pattern here names the component that implements it. Use the component; do not re-create the pattern by hand. Where the component is still to be built, this document states its contract and says so; the contract is the rule until it exists.
6. **Base element styles live in `@layer base`.** A rule on a bare element (`h1`, `button`, `a`) or on a shared class written outside Tailwind's layers outranks every utility: one such rule on the headings once cancelled the colour and weight classes of every title in the app. Base styles are written inside `@layer base` in `app/globals.css`, so a class on the element always wins. (The test that enforces it comes with the package that moves the heading rule, T2 in the audit's plan.)

---

## Design Principles

In this order. When two pull against each other, the earlier one wins.

1. **Data speaks first.** Scores and evaluation data are the visual hero. Typography and spacing serve legibility above everything else. Never bury a number, and never dress one: a score is a number only, with no colour or name by quality (`PRODUCT.md`).

2. **Trust through precision.** Exact values, consistent rounding, tabular numerics (Hanken Grotesk with `tabular-nums`). Nothing ambiguous. A number that states a fact or an offer is printed, never animated up to its value.

3. **Calm before complexity.** The CVA protocol is cognitively demanding. Spacious layout, sequenced disclosure, one thing at a time. During a cupping nothing moves, glows or competes with the cup.

4. **Value before friction.** The screen gives something before it asks for something. One clear action per screen or fold; a second call to action in the same view is a finding.

5. **One way to do a thing.** One gesture to move through a set of cards, one alignment for section headers, one anatomy for a card of a given kind, one component per pattern. A visitor learns the page once. Consistency beats a locally better idea.

6. **Text and picture arrive together.** A drawing, a screen or a photo is never decoration placed next to copy: it shows what the sentence says, at the moment the sentence is read. A feature is a name, an explanation and a drawing.

7. **Craft without decoration.** The earthy palette and the serif reference the tactile heritage of SCA paper forms. Richness comes from type, colour and real material (real sessions, the real protocol), not from ornament. Illustration is allowed where it explains (rule 6); texture is allowed only as the grain on a photo.

8. **Spanish first, always.** Language, labels and units are rooted in Latin American specialty coffee culture. English mirrors the Spanish structure exactly. One word for one thing, in the voice below.

### Spanish first: the words and the voice (rule)

**The glossary.** One word for each thing, in both languages. A synonym in the right-hand column is a finding. (The test that checks the message files against this table comes with package P4 of the audit's plan. The coffee words wait for Kim's confirmation.)

| Thing | Español | English | Not |
|---|---|---|---|
| The person who sets up and runs a session | organizador | organizer | maestro, dueño; master, owner, host |
| A person who cups | catador | cupper | |
| A person in a tasting group | integrante | member | |
| The event | sesión | session | |
| The act of cupping | cata | cupping | |
| What is cupped | muestra | sample | |
| The number | puntaje | score | puntuación, calificación |
| A 1 to 9 rating of one attribute | calificación | rating | nota (it is a tasting note: "Notas rápidas", "notas percibidas") |
| Leaving the account | Salir | Sign out | "Cerrar sesión" (it would also mean closing a session) |
| The fast way to start: solo, three taps | Cata rápida | Quick cupping | Catar ahora, Cup now |
| Setting up a session, mainly for a group | Organizar cata | Set up a cupping | Nueva sesión, New session |

**The copy rules.**

- Sentence case for titles, buttons and labels ("Siguiente muestra", not "Siguiente Muestra").
- No em dash in prose. An empty value is an en dash or the words "sin dato".
- The app speaks with tú; the legal pages keep usted.
- A neutral greeting ("Hola, {nombre}"), never a gendered one ("Bienvenido").
- No emoji, in copy or as a picture.
- A Spanish word where one exists ("lista", not "roster"). "Insights" and "benchmark" are product names and stay.

**Two ways to start a cupping.** Both stay, and each says what it is for. "Cata rápida" (en: "Quick cupping") is the fast way, mainly for one person, three taps, and it comes first with that name. "Organizar cata" (en: "Set up a cupping") sets up a cupping session and is meant for groups. Each label says what the action is, not when it happens: the old "Catar ahora" and "Nueva sesión" read as the same thing. Neither is offered under the other's name, and a screen offers each at most once (see "An ask appears once").

---

## Two modes: stage and paper

| Mode | Ground | Where | Purpose |
|---|---|---|---|
| **Paper** | Cream (`surface`), tonal layering, hairline borders | The app: every screen where someone works | Read, enter, compare, decide |
| **Stage** | Dark green with the constellation of dots | The landing page; later the moments of arrival in the app | Arrive, understand, be invited |

**(rule)** Paper is the default. A screen is a stage only when the person has nothing to enter and nothing to decide on it: the landing, signing in, a waiting room, an empty first-run state, a closing moment. The chapters "Color" to "Elevation" describe paper; "Stage and surfaces" describes the stage; "Bringing the stage into the app" says where the two may meet.

---

## Aesthetic

**Warm Minimalist** — generous whitespace, disciplined layout, organic earth tones. The feel of a high-end apothecary or analytical laboratory: precise and professional, yet deeply human. Depth is communicated through tonal surface layering, not shadows.

---

## Color Palette

All tokens are CSS custom properties in `app/globals.css`, exposed as Tailwind utilities via `@theme inline`.

### MD3 Color Roles (primary API)

| Token | Hex | Tailwind Class | Use |
|---|---|---|---|
| `--color-primary` | `#153526` | `text-primary`, `bg-primary` | Hover state for primary actions |
| `--color-primary-container` | `#2c4c3b` | `bg-primary-container` | Primary buttons, active states, brand accents |
| `--color-on-primary` | `#ffffff` | `text-on-primary` | Text on primary-container buttons |
| `--color-on-primary-container` | `#98bca6` | `text-on-primary-container` | Subtle text on dark green surfaces |
| `--color-primary-fixed` | `#c7ebd4` | `bg-primary-fixed` | Light green tint for selected card bg |
| `--color-primary-fixed-dim` | `#abcfb8` | `bg-primary-fixed-dim` | Muted green highlight |
| `--color-primary-muted` | `#6b8f71` | `text-primary-muted`, `hover:bg-primary-muted` | The softer green: hover on a green fill, a focus border, a small green accent (the legacy `green-mid`, same value) |
| `--color-secondary` | `#9d4326` | `bg-secondary` | Terracotta accent — highlights, warnings |
| `--color-secondary-container` | `#fd8c6a` | `bg-secondary-container` | Light terracotta fill |
| `--color-on-secondary` | `#ffffff` | `text-on-secondary` | Text on secondary bg |
| `--color-surface` | `#fff8f6` | `bg-surface` | Page background (warm cream parchment) |
| `--color-surface-container-lowest` | `#ffffff` | `bg-surface-container-lowest` | Modals, high-contrast surfaces |
| `--color-surface-container-low` | `#fcf1ee` | `bg-surface-container-low` | Subtle lift from page bg |
| `--color-surface-container` | `#f6ece8` | `bg-surface-container` | Cards, form inputs |
| `--color-surface-container-high` | `#f0e6e3` | `bg-surface-container-high` | Selected rows, hover backgrounds |
| `--color-surface-container-highest` | `#ebe0dd` | `bg-surface-container-highest` | Dividers with fill |
| `--color-on-surface` | `#1f1b19` | `text-on-surface` | Primary body text, labels |
| `--color-on-surface-variant` | `#424843` | `text-on-surface-variant` | Secondary text, captions, icons |
| `--color-outline` | `#727973` | `border-outline` | Interactive borders, hover states |
| `--color-outline-variant` | `#c1c8c2` | `border-outline-variant` | Hairline dividers, input borders |
| `--color-inverse-surface` | `#352f2d` | `bg-inverse-surface` | Dark overlay backgrounds |
| `--color-inverse-on-surface` | `#f9efeb` | `text-inverse-on-surface` | Text on dark overlay |
| `--color-error` | `#ba1a1a` | `text-error`, `bg-error` | Defective cups, error states |
| `--color-error-container` | `#ffdad6` | `bg-error-container` | Error background tint |
| `--color-on-error-container` | `#93000a` | `text-on-error-container` | Text on error container |
| `--color-warning` | `#755b00` | `text-warning`, `bg-warning` | Deviation/consensus warning signal — NOT for quality scoring or accents |
| `--color-on-warning` | `#ffffff` | `text-on-warning` | Text on warning bg |
| `--color-warning-container` | `#f6e388` | `bg-warning-container` | Deviation/consensus warning signal — NOT for quality scoring or accents |
| `--color-on-warning-container` | `#574600` | `text-on-warning-container` | Text on warning-container |

> **Terracotta rule:** `secondary` (#9d4326) replaces amber as the accent. It signals energy and emphasis, never quality, and it is not a notice colour (a notice is `Notice`, under "Component Patterns"). No colour signals quality: see "No quality bands". The owner CVA deviation matrix (`OwnerParticipantSection`) is a consensus signal, not a quality score: it uses `primary-fixed` (within 1 SD), `warning-container` (1 SD or more), and `warning` (2 SD or more: "far from the group" is not an error, so never an error token); the two far tones also carry a mark (a triangle, a diamond).

### Backward-Compat Aliases (legacy code)

The old names below were renamed to the role names by package T3 of the audit's plan (each to the role with the same value, so nothing moved on screen); `tests/appTokens.test.ts` fails on a new one. `green-mid` had no role of its own: it is now `primary-muted`, same value. The alias block of `app/globals.css` keeps only `green-light`, because the landing still reads it; the folders that may still use an old name are listed, with their reason, in that test, and the list only shrinks. `text-white` and `border-white` are Tailwind's own white, not aliases. The table says what each old name became.

| Old class | Maps to |
|---|---|
| `text-green-dark` / `bg-green-dark` | `primary-container` (#2c4c3b) |
| `text-green-mid` / `bg-green-mid` | `primary-muted` (#6b8f71) |
| `text-green-light` / `bg-green-light` | `primary-fixed-dim` (#abcfb8) |
| `text-amber` / `bg-amber` / `text-amber-warm` | `secondary` (#9d4326) |
| `bg-bg` | `surface` (#fff8f6) |
| `bg-cream` | `surface-container` (#f6ece8) |
| `bg-white` | `surface-container-lowest` (#ffffff) |
| `text-brown-dark` | `on-surface` (#1f1b19) |
| `text-brown-mid` | `on-surface-variant` (#424843) |
| `border-brown-light` | `outline-variant` (#c1c8c2) |
| `text-red-defect` / `bg-red-defect` | `error` (#ba1a1a) |

### No quality bands (rule, since 2026-11)

A score is never coloured or named by how good it is. The band table that stood here (green from 85, terracotta from 75, red below) was retired with the S10 product rules; `ScorePill` is neutral and the band helpers were deleted. The only legend is the two anchors: 79 is the neutral point and 100 is the maximum.

- **A score's value is always `on-surface`.** The number itself is ink, wherever it stands: a stat card, a ranking, a table cell, a pill. Never terracotta to single it out, never green.
- **A difference is never coloured by its direction.** A Δ (from the group, from the reference, between two of one's own evaluations) is ink with its sign: "+1.25", "−0.50". Above is not green, below is not terracotta or red.
- **A selected rating has one colour whatever its value.** On the 1 to 9 scale the selected bubble is the same at 1, 5 and 9. This rests on a guess about Kim's answer and waits for her confirmation (`TODO(kim-validar:...)` where it is built).
- **The first of the ranking is named, not crowned.** It is "Primera del ranking", in ink, with no colour, badge or word of quality ("mejor", "ganadora").
- **An alignment is one neutral bar.** How close a cupper is to the group is a length on one neutral track, never a traffic light.

Colour may still say three other things about a number, none of them quality:

| Meaning | Tokens | Example |
|---|---|---|
| **Which series it is** | `primary` for one's own, `secondary` / `secondary-container` for the group | The two scores on the landing's score card; group markers on a bar |
| **How far from the group** | `primary-fixed` (within 1 SD), `warning-container` (1 SD or more), `warning` (2 SD or more; never an error token: far is not an error) | The owner's deviation matrix (a far cell also carries a mark, a triangle or a diamond: colour is never alone) |
| **A defect or an error** | `error`, `error-container` | A defective cup, a failed save |

Anything else that tints a number or a rating by its value is a finding.

### Flavor Family Colors

**(rule)** A family colour marks a family with a shape: a dot, a bar, an arc of the wheel, a ring. It is never the colour of text and never the background of text. Used as text these tones measure from about 2 : 1 to 4.1 : 1, all under the 4.5 : 1 that body text needs, so a family's name is ink beside its coloured dot, and a selected flavour pill is a neutral pill with a coloured dot.

**(departure, the owner, 2026-11-21)** One exception: on the cupping screen the descriptors a cupper has selected are pills FILLED with their family's shade (`FlavorPicker`, `CATAPills`), because he wants to see the families at a glance while cupping. Their text is ink or cream, whichever has the higher MEASURED contrast ratio against the fill (`getContrastTextColor`, `lib/constants.ts`; `tests/flavorPalette.test.ts` checks every family at its three levels). Six shades stay under 4.5 : 1 with either text (Frutal and Verde/Vegetal and Nueces/Cacao at level 1, Dulce and Ácido/Fermentado and Otro at level 2, between 4.1 and 4.4 : 1): that is his open question. Everywhere else the rule above holds.

| Family | Hex |
|---|---|
| Floral | `#c2368f` |
| Frutal | `#e0472e` |
| Dulce | `#cc7f2b` |
| Ácido/Fermentado | `#98941f` |
| Verde/Vegetal | `#4a8f5b` |
| Nueces/Cacao | `#9c6b43` |
| Especia | `#7a2638` |
| Tostado | `#5c4632` |
| Otro | `#6e8b94` |

### Colours for people, processes and formats (rule)

No palette outside the tokens. Three things that once had their own colours take them from the system:

- **A session's format** (descriptiva, afectiva, combinada) is a neutral `Badge`: no colour per format.
- **A person's avatar** is a neutral circle (`surface-container-high`) with the initials in ink, and a ring in one of the nine family tones. The tone is picked by a stable hash of the person's id, so a person keeps their tone everywhere.
- **A process type** (in the coffees table and on a coffee's page) is its name in ink with a dot in one family tone, from one fixed map of process to tone kept in one place.

Both follow the family-colour rule above: the tone is the ring or the dot, never the text or its background.

### Chart Color Exception (`components/results/chartColors.ts`)

`components/results/` is otherwise fully tokenized (no hex literals) — `chartColors.ts` is the one sanctioned exception, mirroring the Flavor Family table above. Recharts renders raw SVG, and `stroke`/`fill` props take literal color strings, not Tailwind classes. `getChartColors()` reads the live CSS custom properties off `document.documentElement` at render time (so it tracks `app/globals.css`, dark theme included, without a rebuild) and only falls back to a baked-in hex snapshot during SSR. Keep that fallback snapshot in sync with `app/globals.css` by hand — it must never drift from the token values in this file. Never copy this pattern into ordinary HTML-side styling; it exists solely for Recharts' SVG internals. A chart with more than two series takes `series` from it (S10): eight tokens in a fixed order (`primary-container`, `secondary`, `primary-muted`, then the family tones floral, nutty, sweet, other, spice), each at 3 : 1 or more on a card, never the error red; the Insights charts use it and keep no palette of their own.

The landing constellation canvas (`components/landing/journey/ConstellationCanvas.tsx`) is the second sanctioned user of the same pattern: it reads `--color-primary-fixed`, `--color-secondary-container`, `--color-surface` and the nine `--color-flavor-*` tokens at mount (resolving any CSS colour through the canvas' own parser) and keeps a fallback snapshot of the same values. Same rule: update the snapshot when the tokens change.

---

## Typography

### Font Stack

| Role | Font | CSS Variable | Tailwind Class |
|---|---|---|---|
| Display / Editorial | Newsreader | `--font-display` | `font-display` |
| UI / Body | Hanken Grotesk | `--font-ui` | `font-ui`, `font-sans` |
| Data / Mono | Hanken Grotesk + tabular-nums | `--font-mono` | `font-mono`, `.mono` class |

Loaded via `next/font/google` in `app/layout.tsx` with variables `--font-display` and `--font-ui`.

**Newsreader** is the editorial voice. Literary character for headlines, section titles, and score numerals. Evokes traditional printing and SCA paper forms.

**Hanken Grotesk** is the precise voice. Clean, geometric for all UI elements, data entry, labels, and numeric readouts. Enable `font-variant-numeric: tabular-nums` for all score/count displays.

### Type Scale

**The root font size is 14 px, not 16 px.** Every rem-based Tailwind size is therefore 87.5 % of its usual value: `text-3xl` is 26.25 px, `text-base` 14 px, `text-sm` 12.25 px, `h-11` 38.5 px, `max-w-6xl` 1008 px. Media-query breakpoints are not affected (`lg` is still 1024 px). **(rule)** A size that must be exact (a 44 px touch target, a hairline, a device frame) is written in pixels: `min-h-[44px]`, never `h-11`.

**(rule) Paper has six named text roles, and the sizes below are what the screen paints at that root.** The list this table replaced (page 32, section 24, card 20 px) was never what the classes painted: they painted 26.25, 21 and 17.5 px, and those are the sizes the app keeps. Each role becomes one named size in `app/globals.css` (package T4 of the audit's plan); until a role has its name, the class in the table is the one that paints its value.

| Role | Font | Painted size | Named class | Class at the 14 px root | Weight | Colour | Notes |
|---|---|---|---|---|---|---|---|
| Page title | Display | 26.25 px | `text-page` | `text-3xl` | 500 | `primary-container` | `leading-tight`; set by `PageHeader` |
| Section heading | Display | 21 px | `text-section` | `text-2xl` | 500 | `primary-container` | set by the paper `SectionHeading` |
| Card heading | Display | 17.5 px | `text-card` | `text-xl` | 500 | `on-surface` | |
| Body text | UI | 14 px | `text-body` | `text-base` | 400 | `on-surface` | `leading-relaxed`; a label in body text is the same size at 600 |
| Caption / meta | UI | 12.25 px | `text-caption` | `text-sm` | 500 | `on-surface-variant` | `tabular-nums` |
| Uppercase label | UI | 11 px | `text-label` | `text-[11px]` | 600 | `on-surface-variant` | `uppercase tracking-widest`; the floor |

- **(rule) Nothing is under 11 px**, and the uppercase label is the only role at 11 px. A smaller size is a finding, however little the text.
- **(rule) Data is never under 12 px.** A number, a count, a chart label, a table cell or an axis tick is at least the caption size.
- **(rule) Page and section titles are green (`primary-container`); everything else is ink.** The colour is set in one place for each: `PageHeader` for the page title and the paper `SectionHeading` for a section's. A title never sets its own colour. (Ink titles are an idea for a future dark mode, not a rule.)

Display sizes for a single number, outside the six roles:

| Role | Font | Size | Weight | Colour | Notes |
|---|---|---|---|---|---|
| Score numeral | Display | 88 px | 500 | `on-surface` | `tabular-nums leading-none` |
| Score decimal | Display | 56 px | 400 italic | `on-surface-variant` | `display-italic` |
| Bubble numeral | Display | 19 px | 600 | `on-surface` | `tabular-nums` |

**Hierarchy is a step, not a size (rule).** A title is one clear step (1.2 to 1.33 times) above anything inside the thing it titles, and never smaller than its own children. The stage's scale on a wide screen is 52.5 px (page), 42 px (section), 31.5 px (inside a section); see "How a section opens". Paper's is 26.25, 21 and 17.5 px, steps of 1.25 and 1.2. Check the same relation on every paper screen: page title, section heading, card heading.

### Rules
- All numeric readouts use `font-variant-numeric: tabular-nums` (`.mono` class or `font-mono`)
- Headings have `margin: 0` by default
- Italic (`display-italic` class) reserved for score decimals and editorial emphasis only
- Do not reference old font variables: `--font-cormorant`, `--font-geist-sans`, `--font-serif-alt` — they no longer exist

---

## Data display

How a count, a chart or a group of numbers is shown, on paper, in a report and on the stage. Every rule here is **(rule)**.

- **One counting unit per view, and it is named.** A view counts one thing: people ("personas", "catadores"), not mentions in one place and people in the next. The unit is written beside the number. A view that mixes a count of mentions with a count of people is a finding.
- **Every count carries its n.** "7 de 8 personas", never "7" alone or a bar with no number. A share is printed with the count it comes from.
- **A measure has one fixed scale.** A quality rating is drawn on 1 to 9, an intensity on 0 to 15, a score on its own fixed range: the same in every row and every card of a view, never fitted to the data, and a bar starts at the scale's lowest value. Two charts that look comparable are drawn on the same scale.
- **Chart text is text.** Labels, ticks and legends are at least 12 px and 4.5 : 1, like any data ("Data is never under 12 px"). A chart that is scaled down to fit a phone until its words are smaller is the wrong chart for a phone.
- Family colours mark the bars and dots of a chart, never its words ("Flavor Family Colors").

---

## Spacing

4px unit, 8px base grid.

| Token | Value | Approx Tailwind |
|---|---|---|
| `--space-1` | 4px | `p-1` / `gap-1` |
| `--space-2` | 8px | `p-2` / `gap-2` |
| `--space-3` | 12px | `p-3` / `gap-3` |
| `--space-4` | 16px | `p-4` / `gap-4` |
| `--space-5` | 24px | `p-6` / `gap-6` |
| `--space-6` | 32px | `p-8` / `gap-8` |
| `--space-7` | 48px | `p-12` / `gap-12` |
| `--space-8` | 64px | `p-16` / `gap-16` |

The `p-*` and `gap-*` classes beside the tokens are rem-based and paint 87.5 % of the token at the 14 px root (`p-4` is 14 px). A gap of the rhythm below is written in pixels.

**Vertical rhythm has a ceiling.** The gaps between sections, and between a section's heading and its content, are fixed per device class and never set per section (see "White space has a ceiling" under the stage's density rules).

### The paper rhythm (rule)

Paper is tighter than the stage (whose section padding is 40 / 48 / 56 px), which suits a screen where someone works. One scale for every paper screen, written in pixels as classes (`.paper-page`, `.paper-section`, `.paper-section-head`) and inside `Card`. No section sets its own padding. (The classes come with package P1 of the audit's plan.)

| Gap | Paper: phone | Paper: from 768 px | Stage, for comparison (phone / from 768 px) |
|---|---|---|---|
| Page header to the first section | 24 px | 32 px | |
| End of a section to the next section's heading | 32 px | 40 px | 80 px / 112 px |
| A section's heading to its content | 12 px | 16 px | 24 px / 36 px |
| Card padding | 16 px | 20 px | |
| Row padding in a list | 12 x 16 px | 12 x 16 px | |
| Gap between the cards of a set | 12 px | 16 px | |
| Outer margin | 16 px | 24 px (32 px from 1280 px) | |

---

## Border Radius

Contemporary, pill-influenced geometry. Softly rounded cards soften the analytical rigor.

The tokens are written in rem, so they paint 87.5 % of their nominal value at the 14 px root.

| Token | Written | Paints | Tailwind | Use |
|---|---|---|---|---|
| `--radius-sm` | 0.5rem | 7 px | `rounded-sm` | Small interactive elements, icon containers |
| `--radius-pill` | 9999px | full | `rounded-pill` | Buttons, tags, badges |
| `--radius-card` | 1rem | 14 px | `rounded-card` | Cards, section containers, modal |
| `--radius-input` | 1rem | 14 px | `rounded-input` | Inputs, selects |
| `--radius-md` | 1.5rem | 21 px | `rounded-md` | Legacy: not for paper |
| `--radius-lg` | 2rem | 28 px | `rounded-lg` | Legacy: not for paper |
| `--radius-xl` | 3rem | 42 px | `rounded-xl` | Legacy: not for paper |

**(rule)** Paper uses `rounded-card`, `rounded-input` and `rounded-pill` (through `Button`, `Card` and the kit). The legacy `rounded-md`, `rounded-lg` and `rounded-xl` paint 21, 28 and 42 px, not the 24, 32 and 48 px once listed here, and are not used on paper: a button, a banner or a dropdown that carries one is a finding.

---

## Elevation & Depth

No heavy drop shadows. Depth through tonal surface layering ("stacked paper" effect).

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--shadow-card` | `0 1px 3px rgba(31,27,25,0.06)` | `shadow-card` | Standard card |
| `--shadow-card-lg` | `0 4px 16px rgba(31,27,25,0.08), 0 1px 4px rgba(31,27,25,0.04)` | `shadow-card-lg` | Modal, focused card |
| `--shadow-inset` | `inset 0 1px 2px rgba(31,27,25,0.04)` | `shadow-inset` | Inset surfaces |

**Tonal layering:** interactive cards (`surface-container-lowest`) sit atop the page background (`surface`). Use 1px `border-outline-variant` to define card boundaries instead of shadow.

**Glassmorphism:** reserved for side panels and overlays (Flavor Wheel selector, etc.), never over a form being filled in (see "Glass and grain on paper"). Use `backdrop-blur-xl` with `bg-surface-container-lowest/80`, never as decoration. This is the rule for the **paper** mode (the app). The **stage** mode has its own glass surface, with its own rule: see the next chapter.

---

## Stage and surfaces

Added 2026-11-14 with the landing redesign. Everything above describes the *paper* mode; this describes the *stage* mode and the three surfaces that are allowed on it. What the app takes from it is in "Bringing the stage into the app", after this chapter.

### What the stage allows that paper does not

The two modes are defined at the top of this document. On the stage, atmosphere is allowed: the particle field and the grain on photos are the brand's voice there, not ornament (principle 7 is read strictly on paper and generously on the stage). They still never appear where someone is filling in a form.

**The constellation never sits behind a form the person is working in.** That is the one hard rule for bringing the dots into the app: no dots during a cupping.

### The ground: three depths and two lights

One green would read flat, so the stage has depth. Tokens in `app/globals.css` (both blocks):

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--color-stage` | `#153526` (= `primary`) | `bg-stage` | The base ground |
| `--color-stage-deep` | `#0e2a1c` | `bg-stage-deep` | Sections that should recede; the footer |
| `--color-stage-raised` | `#1d4532` | `bg-stage-raised` | Sections that come forward |
| `--color-glow-mint` | `primary-fixed` at 15 % | (class) | Cool light behind an app screen |
| `--color-glow-terra` | `secondary-container` at 22 % | (class) | Warm light behind the one offer |

- `.stage-ground` paints the three depths as ONE tall gradient on the element that contains the canvas. **Sections stay transparent**: an opaque section background hides the constellation.
- `.stage-light` + `.stage-light-mint | -terra | -shade` are soft radial pools, absolutely positioned inside a section. `-shade` is the opposite of a light: a pool of the deepest green behind text that sits directly on the dots with no card under it.
- Terracotta (`secondary-container`) is the stage's accent: step numbers, the active dot of a progress rail, a counter, one emphasised word. Still never a quality signal.

### Exactly three surfaces

| Surface | Class | Look | Use it for | Rule |
|---|---|---|---|---|
| **Solid** | `.surface-solid` | Opaque cream, `shadow-stage-card`, highest contrast on the page | What must be read or acted on: the offer card, every app "screen" (`mockframes/Frame.tsx`, `shadow-screen`) | One solid surface per fold carries the action |
| **Photo** | `.surface-photo` (+ `.surface-photo-veil`) | Real photo, a green veil rising from the bottom, a static grain | People | Never glass on the frame itself. Real sessions only; no stock, no testimonial framing |
| **Glass** | `.surface-glass` (old name `.stage-card`), `.surface-glass-ink` over a photo | Translucent: 8 % cream tint, 12 % border, 6 px blur. The `-ink` variant is 74 % deep green with a 10 px blur, for AA text on any picture | Secondary cards: feature cells, captions, the founding card | **Only where something lives behind it**: the constellation or a photo. Never on a flat ground, and never nested |

Supporting tokens: `--radius-device` / `--radius-device-inner` (app-screen frame), `--shadow-stage-card`, `--shadow-screen`, `--shadow-photo`, `--text-hero-numeral`, and (`:root` only) `--glass-tint`, `--glass-border`, `--glass-blur`, `--glass-ink`, `--texture-grain`.

**Grain** is one 160 px SVG noise tile in a CSS variable (`--texture-grain`), applied by `.surface-photo::after` with `mix-blend-mode: soft-light`. Static, no image file, no animation. Its job is to make small photos from different rooms read as one family. Use `components/landing/PhotoSlot.tsx`; do not re-create the treatment by hand.

**Reduced transparency:** under `prefers-reduced-transparency: reduce` both glass recipes drop the blur and become near-opaque greens.

### A feature is a name, an explanation and a drawing

In a set of feature cards every card has the same three parts and the same weight: the feature's name, one or two sentences, and a small drawing of the feature, centred at the bottom of the card (`components/landing/FeaturesSection.tsx`: three numerals, the score line, the 1 to 9 track, the deviation map, the offline line, two report sheets). No card is text only, and none is larger than the others. The drawings are illustrative, drawn with the stage's own tokens (cream, mint, terracotta as the accent), and share one baseline across a row.

### Layering

Things are layered, not stacked one after another:

- A glass plate set back and offset behind a solid card (`HeroFoundingCard.tsx`).
- A glass caption pulled up over the lower part of a photo, as a *sibling* of the photo frame so the grain stays off the text (`AudienceSection.tsx`).
- Solid screens piled one over another, each with a label on its top edge so the ones behind stay readable (`StepsShowcase.tsx`, `.steps-*`).

A photo and an app screen are never simply placed one under the other.

### How a section opens (the fold line)

Every section of the stage opens the same way, through `components/landing/SectionHeading.tsx`:

- **The fold line.** The section's name sits on a hairline (`.section-rule`, colour `--stage-rule`) that fades out before the edge of the content. The name is small print on purpose (12 px, uppercase, terracotta, no box around it): the pill shape is reserved for the offer ("Cohorte fundadora"). A larger, boxed section name was tried and rejected (2026-11-14).
- **One alignment for every section, at every width: centred.** The header is centred and the line runs out to both sides of the name, on a phone, a tablet and a desktop. (Until 2026-11-15 it turned left from 640 px up; the owner chose centred everywhere.) There is no per-section choice: all the section breaks of a page look the same. Anything that goes with the title (the arrows of a carousel) sits at the right end of the title's own row from 640 px up, and under it on a phone; it never adds a row under a centred title.
- **The title is one clear step above anything inside the section.** Stage scale on a wide screen: page title 52.5 px, section title 42 px, titles inside a section 31.5 px (a 1.25 to 1.33 step). A title inside a section is never as large as the section's own.
- **Idea, then assertion.** A section title tells a small story in two lines: first the idea, which says in plain words what the section is ("Así funciona una cata.", "Esto es lo que incluye.", "Para quién es."), then, on its own line under it, what we assert about it ("Percibir, describir, alinear.", "Todo el protocolo, cero fricción.", "Para quien forma paladares."). They are two message keys, `title` and `titleAssertion`, and two props of the component, so the break is fixed and never left to where the browser wraps. The idea stays on one line wherever it fits; the assertion is set in the display italic (`.display-italic`), same size and colour, so the two parts stay told apart on a small phone where the idea itself wraps. Write new section titles in this shape; a title that is a single statement has no `titleAssertion` and stays on one line.
- **A shade behind the text** (`stage-light-shade`), so the constellation never crosses a title while it travels between two folds.

Do not hand-write an eyebrow plus `<h2>` in a stage section; use the component. The closing section is the exception: it is the finale, with its own larger title.

### Density: four rules learned on the landing (2026-11-15)

The owner reviewed the live landing and asked for less text, less empty space and a progress that says where the page goes. These four rules came out of it. They are written for the stage, and they hold on paper too: the app audit (`docs/design-system/AUDIT-RUBRIC.md`) checks every screen against them.

#### White space has a ceiling

White space is rhythm, not filler. Each kind of gap has a largest value; a gap above it is a finding.

| Gap | Phone | Large phone (from 640 px) | Tablet and desktop (from 768 px) |
|---|---|---|---|
| Padding above and below a section (`.stage-section`) | 40 px | 48 px | 56 px |
| So: end of one section's content to the next section's heading | 80 px | 96 px | 112 px |
| A section's heading to its content (`.stage-section-head`) | 24 px | 28 px | 36 px |

- **(rule) A section never sets its own vertical padding.** On the stage it takes `.stage-section` and `.stage-section-head` (`app/globals.css`). Before this, six sections had six different paddings, from 70 to 140 px, and a desktop reader met 182 px between two sections and 238 px before the closing block.
- **(rule) A pinned or sticky layout may not buy its effect with empty screens.** In "Cómo funciona" each step's text block was 78 % of the screen tall so the pile had room to animate: three short texts took 1,870 px of scroll. A block is now as tall as the effect needs and no taller (56 % of the screen: a screen travels 42 %, `stepsProgress.ts`), the first text starts level with the pinned object instead of floating in the middle of its block, and the last block is long enough for the effect to finish before the pin lets go. Measure at an 800 px tall window: a column held by a pin should not be more than about half empty.
- **(rule) Stacked on a tablet means half the width is empty.** From 768 px a "picture plus text" block is two columns, even in the plain fallback.
- **(rule) A card is as wide as its content needs.** A card that spans the whole width of a tablet to hold one number and one button is capped (the hero's offer card: 480 px until the two-column layout).
- On paper the same idea applies with paper's own numbers: see "The paper rhythm" under "Spacing".

#### Progress follows the direction of travel

- **(rule) An indicator of progress runs the way the person moves.** The page scrolls DOWN, so the progress of a scroll-driven sequence is VERTICAL and fills downward. A horizontal row of dots under a header says "swipe sideways", which is the wrong instruction for a vertical scroll (feedback from users, 2026-11-15).
- **(rule) Say that there is more, and where.** While another item is still to come, show a plain cue in the direction of travel: a counter ("02 / 03") with a down chevron at the bottom of a phone stage; a chevron under the rail on a wide screen; in a sideways row, the next card showing at the edge. It goes when the last item is reached. It does not bounce or pulse.
- **(rule) A step of progress carries its number.** Every indicator is a row or a column of small NUMBERED steps (1, 2, 3 in a 20 px circle), never bare dots: a dot says "there are some", a number says which one this is and how many there are (the owner, second review of 2026-11-15: "not just the dots"). One recipe, `.rail-step`, for the vertical rails and for the sideways rows; the step being read is filled.
- **(rule) Horizontal progress is only for horizontal movement**: a sideways row moved with arrows or a swipe (its numbered steps run in a row under it), a wizard whose steps are laid out left to right AND advanced with a "next" button.
- The rail stands beside what it describes (between the pinned pile and its texts from 768 px, at the left edge on a phone; the right edge belongs to the browser's own scroll indicator), out of the flow, so it costs the content no room.
- Implementation: `.rail-step` (the numbered step), `components/landing/DeckRail.tsx`, `.deck-rail*`, `.deck-more`, `.steps-rail*`, `.rail-more`, and `CarouselSteps` in `components/landing/CarouselControls.tsx` (index rule in the pure `carouselIndex.ts`). No new clock: the same progress values the scroll code already writes.
- In the app this covers every stepper, wizard and phase indicator (`PhaseStepper`, the session wizard, the warm-up's step sequence on its intro).

#### A first screen has a word budget

- **(rule) One message.** The top of a page says what the product (or the screen) does for the person, once: a title of at most 7 words, one supporting sentence or two short ones of at most 25 words together, and nothing else that has to be read to understand it.
- **(rule) What it gives is seen, not read.** Up to four things, each an icon and at most three words ("Catas en grupo", "Funciona sin conexión"). The sentences that explain them live further down, once.
- **(rule) Do not say the same thing in the eyebrow, the title, the sentence and the chips.** A word that appears in three of them is in two too many.
- **(rule) The explanation of an offer lives in one place.** A card that repeats its section's name as a badge, its title as a sentence and the feature list of the section above is a wall of text; keep the one line that is new and the action.
- The landing's first screen went from about 150 words to about 45. Count the words of a screen's top block when auditing.
- Icons are `lucide-react`, the same icon for the same idea everywhere; a row of identical check marks is not "using icons".

#### An ask appears once

- **(rule) One form per ask, per page.** The reservation form is in one place (the founding card, `#fundadores`). Everywhere else that wants the same ask, a button takes the person there (`components/landing/ScrollToLink.tsx`): a real `#link` that jumps (never a smooth scroll through pinned sections, which would play every card on the way), and puts the cursor in the field only where there is a real keyboard.
- **(rule) A second, different ask is visibly quieter.** The newsletter sign-up at the end of the page has no card, an outlined button and smaller type; the page still has one primary action.
- **(rule) An ask that collects an address says, right under the field, who is responsible, what the address is for and how to stop**, and links the privacy policy. The policy must already say it (changing what is collected changes the policy in the same pull request).
- In the app: a screen with two primary buttons, or the same action offered in two places of one screen, is a finding.
- **(rule) A list's header carries its action; its empty state points to it.** A list page has its one action (create, add) in the `PageHeader`'s action slot. When the list is empty, `EmptyState` says what the list will hold and points to that action in words ("Crea tu primera sesión con el botón de arriba"); it does not repeat the button. A list that has no action of its own says why it is empty and where things come from.

#### Two more from the second review (2026-11-15)

The owner looked at the live page again the same day and walked back one decision of the day before. Both rules below replace what was built then.

- **(rule) A tablet is a small desktop, never a large phone.** The landing has ONE layout breakpoint, 768 px: under it the phone layout, from it the desktop layout (two-column hero, the pinned pile of "Cómo funciona", the 3 x 2 grid, three photo cards with arrows). There is no third, in-between layout: the 640 to 1023 px range used to have its own (a stacked hero, a 2 x 3 grid, unpinned steps) and it was the one that looked wrong. Between 768 and 1023 px the same composition is set a size down where a part would not fit (the section title 36 px instead of 42, the offer numeral follows the width, 16 px of padding in a feature cell, the pile's column never narrower than 348 px), and nothing is rearranged. `sm:` (640 px) may still change a padding or a type size; it may not change an arrangement.
- **(rule) What must be read in order rides the vertical scroll; optional detail goes sideways (phones).** On a phone, "Cómo funciona" is the one scroll stage: it is the explanation of the product and a reader goes through its three screens by scrolling down. "Qué incluye" and "Para quién es" are sets of equal, optional cards: each is a sideways row (CSS scroll-snap, no script needed), one card showing with the next one at the edge and the numbered steps under it, so a reader who does not want the detail passes the section in one screen. For one day all three were pinned stages; three in a row made the page long and gave the reader no way past. A set is one kind or the other: never pin optional cards, and never hide a required step in a sideways row.

### Motion on the stage

- Scroll storytelling uses CSS `position: sticky` plus one small script that only READS the scroll position and writes progress values (`--p2`, `--p3`, 0 to 1) and a `data-active` state on the section root; the visuals are static CSS rules over those values (transform and opacity only). No scroll hijacking, no pinning library.
- **The scroll is the timeline, and text and picture arrive together.** A screen starts to appear when its step's title enters at the bottom of the viewport and is in place exactly when that title is in the middle (`components/landing/stepsProgress.ts`, pure and tested). It eases in and out, with about 90 ms of follow so a mouse wheel's jumps do not show. Scrolling back plays it in reverse.
- An arriving solid surface becomes opaque within the first fifth of its travel: it never sits half see-through over the text of the surface behind it.
- Every such layout has a plain fallback (`prefers-reduced-motion`, no script, a screen where it does not fit) that shows the same content without sticking or moving.

#### The phone scroll stage ("Cómo funciona")

On a phone, the one sequence that must be read in order is a **scroll stage** (`components/landing/ScrollDeck.tsx`, `DeckRail.tsx`, pure rules in `deckProgress.ts`, `.deck-*` in `app/globals.css`). The two card sections after it are sideways rows; see "What must be read in order rides the vertical scroll" above.

- **The header stays.** The section's fold line and title stay under the top bar, a size down (24 px).
- **The vertical scroll brings the screens in one by one.** Each screen costs half a screen of scroll, so it moves about as far as the finger does (at a quarter of a screen a slight touch swapped a whole card): it arrives during the first 70 % of that stretch and rests for the last 30 %.
- **The progress says "down".** A vertical rail of numbered steps, filling downward, stands at the left edge, and a counter with a chevron ("02 / 03 ⌄") stands at the bottom of the stage until the last screen is reached. A horizontal rail under the header was tried and read as "swipe sideways" (2026-11-15).
- **Opaque surfaces go over one another.** The app screens pile up with their labelled edges showing. (Glass cards, which would be read through each other, are never piled.)
- **Text that belongs to a screen changes with it**, at the halfway point of the screen's arrival, out first and then in.
- **It is switched on only where it fits.** Under 768 px wide, motion allowed, script running, and the pile fits the room under the header (it may scale down to 72 %). Otherwise the section keeps its plain layout. The decision is made on load and when the width changes, never when a phone's toolbar hides (that would make the page jump).
- **Control comes before length.** The stage makes the section longer than its plain layout (about half a screen per step). That is the price of a pace the thumb controls; do not shorten the step to win the length back. It is also why only the required sequence is a stage.
- The constellation follows markers along the stage's track (`.deck-fold`), since the screens themselves no longer move down the page.

#### A sideways row (phones)

`FeaturesSection` and `AudienceSection`: a real `<ul>` with `snap-x snap-mandatory`, cards `w-[82vw] max-w-[320px]` so the next card always shows at the edge, the list bleeding to the screen's edges with `scroll-px` equal to the page padding, and `<CarouselSteps listId total />` under it. From 768 px the same list is the desktop layout (a grid, or three cards with `CarouselControls` arrows in the heading). The list scrolls by touch, wheel and keyboard with no script; the script only lights the step being read. A list that is a grid from 768 px passes `focusable`, so it is a Tab stop only while it scrolls.

- No count-up on a number that states an offer or a fact.
- The constellation's arrival (`journey/intro.ts`) plays once per tab and never delays the headline.

---

## Bringing the stage into the app

The landing was the place to find the rules; the app is where most of them apply. This chapter says which lessons carry over to paper and how. It is the part of the system the app has not been built against yet, so expect most audit findings to land here.

### What carries over unchanged (rules)

| Lesson from the landing | On a paper screen it means |
|---|---|
| **One action per fold** | Each screen has one primary button (`Button variant="primary"`). Everything else is `secondary` or `ghost`. Two primaries in one view, or a primary that is not the screen's main job, is a finding. |
| **One header for every section** | A screen's sections open the same way, with the same component, the same alignment and the same step in size. Per-screen heading styles are a finding. Paper has `PageHeader` for the page and the paper `SectionHeading` for a section (under "Component Patterns"). |
| **Idea, then assertion** | A title says in plain words what the thing is; the line under it says what is true about it. A clever title that hides what the section is, is a finding. |
| **One anatomy per kind of card** | All cards of one kind have the same parts in the same order (for a feature: name, explanation, drawing). A list where one card has an extra part, or lacks one, is a finding. |
| **One gesture per kind of content** | On a given device, content of one kind is moved through one way: a sequence that must be read in order rides the vertical scroll, a set of optional equal cards is a sideways row with numbered steps. Two sets of the same kind moved through differently, a pinned set of optional cards, or a required step hidden in a sideways row is a finding. |
| **Keep the reader's place** | Switching language, tab, filter or view must not send the person back to the top or lose what they were looking at (`components/landing/scrollAnchor.ts` is the model: "this section, this far through it"). **(rule) View state lives in the URL**: the tab, the sample, the step, a list's filter, search, sort and page, and an open dialog (`?tab=`, `?sample=`, `?step=`, `?q=`; opening a dialog adds a history entry), so a reload, "back" and a language switch keep them. Preferences (sound, the table or chart view, the comparison basis) are not view state: they stay in the device's storage. |
| **Hierarchy is a step** | A heading is never smaller than a heading inside its own section. |
| **Numbers are printed** | No count-up, no animated score, no number that is briefly wrong. |
| **Solid for what must be read or acted on** | The thing the person must read or act on sits on the most opaque, highest-contrast surface of the screen. |
| **Fits, or falls back** | An enhanced layout (pinned, animated) is switched on only where its content fits, and every one has a plain fallback for reduced motion, no script and small screens. |

### Where the dots and the dark ground may appear in the app

| Place | Allowed | Why |
|---|---|---|
| Sign-in, the emailed-link confirmation, the guest claim card, the two join pages | Yes: stage ground, the offer-card recipe (`surface-solid`) for the form. Built as `ArrivalStage` (S8): the ground and one still light, no dots yet | Nothing is being evaluated; this is an arrival |
| Waiting room before a live session starts | Yes, behind the status, never behind the participant list or a control | A moment of waiting |
| Empty states of a list (no sessions, no coffees yet) | A still, small formation as the illustration, on paper | It explains "nothing here yet" without a stock drawing |
| The warm-up ("Movimiento sensorial") | Yes: its eyes-closed legs ARE the stage (see "The warm-up's two stages" below), and the dots follow the instruction for the whole run (they breathe, travel with the movement, gather on a hold, settle into a ring) | It is a guided moment, not data entry |
| A session's closing moment (results first shown) | Once, briefly, never over the numbers | A moment of arrival at a result |
| The cup form, results tables, any list, any dialog, any form | **Never** | Sensory focus and legibility: principles 1 and 3 |

A screen that uses the dots must speak the one dialect: the seed, the easing, the idle drift, the dot size and the colour parsing of `lib/canvas/particles.ts`, and the draw-cost governor of `lib/canvas/governor.ts` with its kill switch; and it must respect reduced motion. There are two hosts today, because they are driven by different things: the landing's canvas (`components/landing/journey/`, driven by scroll, with its own loop) and the warm-up's stage field (`components/warmup/StageField.tsx`, drawn from the player's single clock, which may not have a second loop). A canvas that draws dots without taking these is a finding (`tests/canvasParticles.test.ts` checks both hosts). And the dots must MEAN something where they appear: a formation per section on the landing, the instruction in the warm-up.

### The warm-up's two stages

The warm-up player (`components/warmup/WarmupPlayer.tsx`) is the first screen of the app built on both modes. While the eyes are open it is paper (a warm cream ground); while the exercise asks for closed eyes it is the stage. Since 2026-11-14 that dark ground is the landing's own, not a second dark:

| Player variable | Eyes open (paper) | Eyes closed (stage) |
|---|---|---|
| `--wu-bg` / `--wu-bg-far` | warm cream to `surface` | `stage` to `stage-deep` |
| `--wu-ink` | `on-surface` | `surface` (cream) |
| `--wu-fill` + `--wu-on-fill` | `primary-container` + `on-primary` | `primary-fixed` (mint) + `on-primary-fixed` |
| `--wu-move` (the part that moves) | `secondary` | `secondary-container` (the stage's terracotta) |

- **(rule) A filled control names its text colour with its fill.** `--wu-fill` is always paired with `--wu-on-fill`; never pair a fill that changes between modes with a fixed text colour (white on mint was about 1.7 to 1). `tests/warmup-stage.test.ts` computes the contrast of both pairs from the tokens.
- **(rule) What the person will hear is on the intro screen**, not behind a fold: sound, the guiding voice (with the line that says it is a computer-generated voice) and "listen to the sounds". Most of the exercise happens with the eyes closed, so the sound is the interface. The folded "A tu manera" holds only the three display options.
- The change between the two stages takes 1.2 s on `--ease-out`, and starts when the voice says "cierra los ojos".
- The transport controls (previous, play, next) and the chips are the player's own, a documented exception to "use `Button`": they change colour with the stage, which `Button` does not do.
- **The dots follow the instruction** (`lib/warmup/stageField.ts`): a breathing disc on the arrival, a cloud that travels with the body part during a movement, gathering and stillness on a hold, one ring at the closing, a cup at the bridge. During a step they recede behind the figure, because the figure is the instruction there. The earlier finding (the breathing field was a second particle implementation, with its own easing, a larger dot, a glow drawn on the canvas and a rotation) is closed: the field takes the shared dialect and governor described above.

### Glass and grain on paper

- Glass on paper stays what it was: overlays and side panels only (`bg-surface-container-lowest/80` with `backdrop-blur-xl`), never a card in the page flow. The stage's `.surface-glass` is not used on a cream ground: there is nothing behind it to show.
- **(rule) A docked bar over a form does not blur.** The cupping footer, a form's sticky action bar and any bar fixed over content the person is filling in are opaque (`surface-container-lowest`), with a hairline (`outline-variant`) on the edge that meets the content. A blurred form behind a bar is still the form, half legible, moving under the controls. A long form's one submit sits in `FormActionBar` (`components/ui/FormActionBar.tsx`, S7a): sticky at the bottom of the page's scroll, above the phone's tab bar, the form's own error or pending line above the button, and the page's scroll reserving its room so a focused field is never left under it.
- Grain exists only on a photo of a real session (`.surface-photo`, through `PhotoSlot`). No textured cards, no noise backgrounds.

### Drawings in the app

A feature, an empty state or an explanation may carry a small drawing when it shows what the sentence says (principle 6). It is built from shapes and the system's tokens, as in `components/landing/FeaturesSection.tsx` (numerals, a score line, a track, a small map, a broken-then-whole line, two sheets). No stock illustration, no emoji, no icon used as a picture where a drawing of the real thing is possible. A drawing never shows a number that could be mistaken for a real result.

---

## Motion

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease` | Color/border state changes, hover |
| `--transition-med` | `240ms cubic-bezier(0.2, 0.8, 0.2, 1)` | Panel open/close, layout transitions |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | How a thing ARRIVES (fast out, long soft landing): the landing's hero entrance, the warm-up's change of stage. One definition; never paste the curve |

**Animation:** `@keyframes phase-in` — `opacity 0→1` + `translateY 8px→0`. For page/section entry.

**Rules:**
- Do not animate score numbers (instant swap)
- Keep animations subtle — user is in sensory evaluation mode

---

## Component Patterns

### Buttons — `Button` / `ButtonLink` (`components/ui/Button.tsx`)

The only sanctioned way to render an action button. Never hand-roll the class
strings below in a page or feature component — import `Button`/`ButtonLink`.

```tsx
<Button variant="primary" size="md" icon={<Plus size={16} aria-hidden />}>Acción</Button>
<Button variant="secondary" size="sm">Secundaria</Button>
<Button variant="ghost">Cancelar</Button>
<Button variant="accent" icon={<RefreshCw size={14} aria-hidden />}>Actualizar</Button>
<Button variant="accentOutline">Actualizar</Button>

{/* Anchor form — same classes, for plain links (e.g. a server-generated PDF
    download where no client JS should ship) */}
<ButtonLink href="/api/.../pdf" variant="primary" icon={<FileDown size={16} aria-hidden />}>
  Descargar PDF
</ButtonLink>
```

Shared base: `inline-flex items-center justify-center gap-1.5 rounded-pill
font-medium transition-colors min-h-[44px] whitespace-nowrap`.

| Prop | Values | Notes |
|---|---|---|
| `variant` | `primary` \| `secondary` \| `ghost` \| `accent` \| `accentOutline` \| `danger` | see classes below |
| `size` | `md` (default) \| `sm` | `md` = `px-5 text-sm`, `sm` = `px-3.5 text-xs` — height stays 44px at both |
| `icon` | `ReactNode` | leading icon, sized/`aria-hidden` by the caller |

| Variant | Classes | Use |
|---|---|---|
| `primary` | `bg-primary-container text-on-primary hover:bg-primary` | main CTA (Descargar PDF, Guardar) |
| `secondary` | `border border-primary-container text-primary-container hover:bg-primary-fixed` | secondary action alongside a primary (Ver formulario, Editar) |
| `ghost` | `text-on-surface-variant hover:text-on-surface` | lowest-emphasis action (Cancelar, metadata edit) |
| `accent` | `bg-secondary text-on-secondary hover:opacity-90` | terracotta emphasis when something needs attention (e.g. "Actualizar" with new submissions pending) |
| `accentOutline` | `border border-secondary text-secondary hover:bg-secondary-fixed` | the same action's resting/no-news state |
| `danger` | `border border-error text-error hover:bg-error-container` | destructive page action that opens a `ConfirmDialog` (Eliminar café, Eliminar seleccionados) |

Disabled state (native `disabled` attribute): `opacity-60 cursor-default`.
`ButtonLink` renders an `<a>` and takes `href` — no `disabled` (anchors don't
support it); only use it for always-available links.

#### Interactive control vocabulary

Three primitives look similar (pills, rounded tracks) but mean different
things — never style one as another:

- **`Button`** — performs an **action**: navigate, mutate, trigger a
  side-effect. (Editar, Actualizar, Descargar PDF.)
- **`PillTabs`** — **selects which content** is shown; tab semantics
  (`role="tablist"`), open-ended item count.
- **`SegmentedControl`** — **switches how** the same data is rendered (a
  fixed, small set of views — e.g. exactly 2). Never wire it to a mutation.

**(rule) A selection never looks like an action.** The selected state of a
tab, a chip or a segment never uses the action fill (`primary-container`
with `on-primary`): that fill means "press me to do something", and a
screen whose selected tab is filled green has two primaries before anyone
counts the buttons. A selected item is marked with a tone
(`primary-fixed` or `surface-container-lowest` on its track), a weight, an
underline or a check, and with `aria-selected` / `aria-pressed`.

**(rule) One green primary per fold.** One `Button variant="primary"` in
view at a time. A "next" button keeps one colour whatever comes next (the
next sample or the next stage of the form): its label says where it goes
("Siguiente: Aroma"), not its colour.

- **`TextAction`**: a small action that reads as a link ("Ver todas",
  "Editar muestra", "Omitir introducción", the language switch): the text
  stays small, the box around it is 44 px painted. It replaces bare text
  links and icon buttons under 44 px. (Built by package T7 of the audit's
  plan; until then the rule is the 44 px box.)

### Input / Select

```html
<input class="w-full border border-outline-variant rounded-input px-3 py-2 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors" />
```

As built, the field's focus is a 25 % ring (about 1.5 : 1), which is not a focus indicator: a field takes the one indicator under "Accessibility".

### `Card` and `Notice`

A card is one component, `Card` (`components/ui/Card.tsx`, built by package P2a of the audit's plan, 2026-11). A new card is never hand-written: it is a `Card`, and the existing hand-written cards move to it area by area (`node scripts/ux-recipes/count.mjs` counts what is left). An interactive card is the link (`href`) or the button (`onClick`) itself and takes no `action`; a `Card` inside a `Card` renders without a second frame (cards do not nest).

```
+--------------------------------------------------+   rounded-card, 1 px outline-variant, no shadow
| EYEBROW (optional)                [action slot]  |
| Title                                            |
| children                                         |
| ------------------------------------------------ |   optional footer on a hairline
| footer                                           |
+--------------------------------------------------+
```

- **Props:** `tone` (default `surface-container-lowest`; quiet `surface-container-low`; selected `primary-fixed`), `padding` (16 or 20 px, in pixels: the paper rhythm), `title`, `eyebrow`, `action`, `footer`, `interactive` (hover `surface-container-high`, a focus ring), `as`.
- All cards of one kind have the same parts in the same order, and a card is as wide as its content needs: a stat card is capped at 240 px, in an auto-fill grid.

**(rule) A notice is not a card.** A sentence that tells the person something about the screen (an admin lens, a pending save, a session that closed, a stale version) is a `Notice` (`components/ui/Notice.tsx`, same package), never a card and never a terracotta banner:

```
[icon]  One sentence that says what happened.            [one optional action]
```

- **Props:** `tone` (info `surface-container`, warning `warning-container`, error `error-container`), `icon`, `action`. Never terracotta: the accent is not a notice colour.

### Section Container

A tinted block that groups the controls of one part of a form (an attribute of the cup form: "Fragancia"). It is a `Card` with the quiet tone; its name is the uppercase label role (11 px, `on-surface-variant`), not a green title of its own. As built, the cup form's containers set their name in green at 12.25 px by hand.

### `SectionHeading` (paper)

The paper counterpart of the stage's `components/landing/SectionHeading.tsx`, named **`PaperSectionHeading`** (`components/ui/PaperSectionHeading.tsx`, package P2a) so the two are never imported in each other's place (a test pins it). Every section of a paper screen opens with it; a hand-written `h2` or `h3`, or an uppercase label used as a heading, is a finding. It carries the gap to its content (12 px on a phone, 16 px from 768 px); `flush` drops it.

```
SECTION NAME (uppercase label, on-surface-variant)          [action, InfoHint or count]
Section title (section heading size, primary-container)
Assertion line, optional (caption size, on-surface-variant)
```

- **Left-aligned at every width.** Paper is read down a left edge; the stage's heading is centred. One alignment per mode, never per screen.
- **Props:** `title`, `assertion`, `name`, `level` (2, or 3 for a title inside a card, which then takes the card heading's size and ink), `action`, `info`, `id`.

### Shared list/CRUD kit (2026-08 cohesion overhaul — `components/ui/`)

These are the ONLY sanctioned implementations of their patterns. Never hand-roll
a status pill, page header, list table, or delete confirmation again.

- **`DataTable<T>`** — generic sortable/searchable/facet-filterable table.
  Client-side `useMemo` filter → sort → paginate (no table library). Desktop
  `<table>` at `md:`+ (header `bg-surface-container`, rows
  `bg-surface-container-lowest` divided by `outline-variant/50`), mobile card
  list below `md:` via `renderMobileCard`. Two empty modes: `emptyState`
  (nothing exists — render an `EmptyState` with CTA) vs `noResults` (filters
  matched nothing — keep the controls visible). Translations arrive as props;
  the `showing` string uses `t.raw()` + manual `{from}/{to}/{total}` replace.
- **`Badge` / `StatusPill` / `ScorePill`** — `Badge` tones: neutral, success
  (primary-fixed), accent (secondary), danger (error-container), outline.
  `StatusPill` maps session status (draft/active/closed; legacy "open" renders
  as active) to translated labels with a leading dot. `ScorePill` is NEUTRAL:
  one style for every score, `tabular-nums`, no colour by value (see "No
  quality bands").
- **`PageHeader`** — canonical page top: optional back link, `font-display
  text-3xl text-primary-container` title, `on-surface-variant` description,
  right-aligned action slot (primary pill button).
- **`EmptyState`** — centered icon-in-circle + display title + body. It
  points to the list's one action in words (see "An ask appears once"); it
  carries a button only on a screen that has no header action.
- **`ConfirmDialog`** — destructive confirmation on `ResponsiveDialog` with
  `useTransition` pending state and inline error. Body copy must state the
  full cascade blast radius honestly (see the deleteSession/deleteCoffee keys).
- **`SearchInput` / `Select` / `FilterBar` / `Pagination`** — the table's
  control set; also reusable standalone. `FilterBar` renders one `Select` per
  facet plus a clear-filters ghost button.

### Breakpoint rule

A tablet is a small desktop, in the app as on the landing. **(rule)**

| Layer | Switch point |
|---|---|
| Content layouts (DataTable table↔cards, profile columns, grids) | **The width of their column, not the window**: container queries on the content area, so the same layout follows whether a sidebar or a rail is open. Where a media query is unavoidable, `md:` (768 px) |
| App shell | Under 768 px: the phone's top bar and bottom bar. From 768 px: an icon rail (about 72 px, every item of the navigation plus the language and the account). From 1280 px: the full sidebar |
| The cupping shell (`SessionShell`) | The same edges as the app shell: no band of its own (it had four, at 640, 768 and 1024 px) |
| Dialogs (centered modal ↔ bottom sheet) | 640px (`ResponsiveDialog` internal) |

- **(rule) `sm:` changes a padding or a type size, never an arrangement.** No third, in-between layout.
- **(departure, the owner, 2026-11-21) The cupping screen's info area is desktop only.** The organizer's info area left of the form (the timer, the coffee being cupped, "Clave de muestras", the tasting info) exists from 1024 px only; under 1024 px the form stands alone, with no timer and no sample key (a tablet follows the phone here, and only here).
- **(rule) The phone's bottom bar has six tabs at most.** Movimiento sensorial is one of them: the main navigation is its one entry, on phones too (the owner, 2026-11-21). Insights lives inside Perfil for those who have it; the account and sign-out are reachable from the shell.
- As built, the app shell switches at `lg:` (1024 px) and content arrangements switch at `lg:` by window width; moving both to this rule is package P6 of the audit's plan.

### `PillTabs` / `SegmentedControl` / `InfoHint` (2026-08 results redesign — `components/ui/`)

- **`PillTabs`** — tabs INSIDE a page (package P5a, audit D-02 / H-08): a horizontally-scrollable `role="tablist"` row of outlined pills (44 px min hit target). ONE Tab stop (the selected tab, a roving tabindex); the arrow keys, Home and End move and select (`lib/rovingFocus.ts`, shared with `SegmentedControl`). Selected: `primary-fixed` with `on-primary-fixed` and a heavier weight, never the action fill. With `idBase` each tab names its panel (`aria-controls`) and the caller wraps the shown content in `TabPanel` (or a `role="tabpanel"` element with `tabIds(idBase, value)`), as the results page and the alignment filter do. Disabled items sit at `opacity-45` and are skipped by the arrows. Optional numeric `badge` per item. Two densities via `size`.
- **`SegmentedControl`** — a small, fixed set of ways to draw the same data, so it is a RADIO GROUP (`role="radiogroup"`, `role="radio"` + `aria-checked`), one Tab stop, the same arrow keys. A single pill track (`surface-container-high`); the checked segment is raised (`surface-container-lowest` + `shadow-card`). Use `PillTabs` when the choice shows other content.
- **`RouteTabs`** — tabs BETWEEN pages (Insights' row is the reference): links, not a tablist; the current one carries `aria-current="page"` and a `primary-container` underline with ink text; each link is 44 px tall. When the row is wider than its box (a phone), a fade with a chevron at each edge that has more says so, and the current link is scrolled into view (`edgeHint`, `lib/viewAddress.ts`).
- **Place in the address (P5a, audit D-01)**: the results tab is `?tab=panel` (the results view has no key), beside R3's `?sample=`; every `DataTable` keeps its search, filters, sort and page as `q`, `f-<facet>`, `sort=<column>.<asc|desc>`, `page` (a page with two tables gives one an `addressKey`, which prefixes its keys; `addressKey={false}` keeps a table out of the address). Written with `history.replaceState` (no step of its own in "back"; typing after 300 ms), read once at mount; a value that is not the page's own is ignored and removed. Rules: `lib/viewAddress.ts`.
- **`InfoHint`** — a small inline info-icon button (`lucide-react` `Info`, `on-surface-variant`) placed next to a label or heading. Opens a `ResponsiveDialog` explainer (title + body) on tap/click — no bespoke chrome, it reuses the same modal/bottom-sheet the rest of the app uses. Content arrives as translated props (`results.help.*` keys resolved server-side) — like every client component here, it never calls `useTranslations()` itself. Use it to explain one non-obvious concept (e.g. what "alineación" measures, what the CVA matrix shows) without permanently spending layout space on the explanation.

### `IntensitySlider`

**File:** `IntensitySlider.tsx` + `IntensitySlider.module.css`

- Track: 8px, `surface-container` bg, `outline-variant` border, pill ends
- Fill: `primary-container`
- Thumb: 22px circle, `primary-container` border, terracotta (`secondary`) inner dot needle
- Value: Newsreader 24px/600, `primary-container`; `/15` in UI 10px
- Empty state: "Sin marcar" italic, desaturated
- Anchors: `0 LOW`, `5`, `10 MEDIUM`, `15 HIGH` in `on-surface-variant` 10px

### `AffectiveBubbles`

**File:** `AffectiveBubbles.tsx` + `AffectiveBubbles.module.css`

- 9 circles, 44×44px, Newsreader 19px/600
- **(rule)** The selected bubble has one colour whatever its value ("No quality bands"; the rule waits for Kim's confirmation). As built, it is tinted by its value (`n ≥ 7` terracotta, `n ≤ 3` the error red, otherwise green), through the legacy colour aliases in its CSS module.
- FINAL readout: `primary-container` when set, `secondary` "FINAL" label
- The nine bubbles are one radio group: one Tab stop, arrow keys between values (see "Accessibility").

### `CATAPills`

- Unselected: `outline-variant` border, transparent fill, pill shape
- Selected: the family's shade, with ink or cream text by measured contrast (`getContrastTextColor`; the owner's departure of 2026-11-21, "Flavor Family Colors")
- At-limit: unselected at `opacity: 0.45`
- A flavour's family is shown as a coloured dot in the pill, never as the pill's fill or its text colour ("Flavor Family Colors"), except the selected descriptors of the cupping screen, filled with their family's shade (the owner's departure of 2026-11-21, same section)

### `FlavorPicker`

**File:** `components/cupping/FlavorPicker.tsx` (modal via `ResponsiveDialog`)

The flavor-wheel descriptor selector. Two entry paths to the same wheel, not two flows:
- **Browse** — breadcrumb-navigated columns through the wheel hierarchy (L1 group → L2 → L3 leaf), `CATAPills` styling for the options.
- **Predictive search** — a typeahead (`Search` icon) backed by `lib/flavorSearch.ts` (Fuse.js). Accent- and typo-insensitive; each result shows its ancestor breadcrumb (`Afrutado › Berry`) and inherits its L1 group color. Unmatched input can be kept as a free note (`addAsNote`).
- Selected descriptors render as filled pills; an unmapped note uses `UNMAPPED_COLOR`.

### `ScoreBreakdownPanel`

**File:** `components/results/ScoreBreakdownPanel.tsx`

Collapsed-by-default disclosure — "¿Cómo se calculó?" — explaining a CVA score. Two variants:
- **individual** — one cupper's score, driven by `IndividualBreakdown` (the same source of truth as the displayed number).
- **group** — the community aggregate, reading `AggregateScoreData` verbatim (authoritative trigger output; never recomputed in the panel).

Shows the CVA formula, the per-section values, and the session setup (cups per sample, whether uniformity/defect penalties apply). `Σhᵢ` in `primary-container`, penalties in `error`.

### `CupIndicators`

- Uniform: `primary-fixed` bg, `primary-container` border, `on-surface` digit
- Non-uniform: `secondary-fixed` bg, `secondary` border + digit, `≠` badge
- Defective: `error-container` bg, `error` `×` glyph + defect badge

### `ScoreDisplay` (removed)

The live "Puntaje calculado" card was deleted in S10: the total is not shown while cupping. The score now appears after sending, in the results drill-down, with its arithmetic in one line (`lib/scoreLine.ts`). Do not rebuild a live total.

### Offline & Onboarding surfaces

- `OfflineBanner` (`components/offline/`): persistent, low-emphasis status strip shown while the device is offline; as built, `secondary-container` bg and `on-secondary-container` text (under the rule it is a `Notice`, warning tone). Non-blocking — cupping continues underneath.
- `SyncConflictModal` (`components/offline/`): Radix dialog surfaced on reconnect when a draft was already submitted elsewhere; offers keep-local vs. keep-remote.
- `OfflineFirstLoadError` (`components/offline/`): fallback when a session can't be hydrated offline on first load.
- `WelcomeModal` (`components/onboarding/`): first-run modal capturing role + country, then routing to a first action (new session / add coffee). Calm, editorial, single-column.

---

## Layout Patterns

### The page frame: `PageContainer` (rule)

Every paper page sits in `PageContainer` (`components/ui/PageContainer.tsx`, built by package P1 of the audit's plan), which has three widths and one alignment:

| Width | Up to | For |
|---|---|---|
| `wide` | 1200 px | Lists, results, profiles, Insights |
| `form` | 640 px | Creating and editing (a session, a coffee, a group) |
| `narrow` | 400 px | Arrival cards (sign-in, confirm, join) |

```
|<- margin ->|<--------------- wide: up to 1200 px --------------->|
|            | PageHeader (title, back link, one action)            |
|            | sections ...                                         |
|            |<----- form: up to 640 px ----->|                     |
```

- **One alignment.** The content's left edge is the page header's, at every width; a form is not centred under a left-aligned header.
- **Outer margin** 16 px on a phone, 24 px from 768 px, 32 px from 1280 px (the paper rhythm).
- Every page opens with `PageHeader`, with a back link on every detail and create page. A screen whose title is not visible (the cupping screen, the print sheet) still has one `h1`, visually hidden.
- The "container max 1280 px, outer margin 48 px" once written here was never built; it is replaced by this frame.

```html
<!-- Section dividers -->
<hr class="border-t border-outline-variant my-6" />
```

---

## Accessibility

The baseline is WCAG 2.2 AA. These are the measurable parts; each is a line of the audit rubric.

| Requirement | Measure |
|---|---|
| Touch targets | At least 44 × 44 px for anything tappable, **measured as painted**, not as written: the root is 14 px, so `h-11` paints 38.5 px and `min-h-11` is not 44. Write the size in pixels (`min-h-[44px]`), or give a smaller visible control a 44 px hit area (a transparent `::before`, as the slider does). 24 × 24 px is the floor that is never crossed. |
| Text contrast | 4.5 : 1 for body text, 3 : 1 for text from 24 px (or 19 px bold) and for the outline of a control. Check `on-surface-variant` on every container tone, and any text set at reduced opacity. |
| Text over something that moves | Never: dots do not cross body text. On the stage a shade (`stage-light-shade`) or a darker glass sits behind it. |
| Colour alone | Never the only carrier of meaning: a status has a word or an icon as well. |
| Focus indicator | One indicator for every control, fields included: a 2 px `primary-container` outline with a 2 px offset, on `:focus-visible`. A 25 % ring, a border change alone or `outline: none` is not a focus indicator. A control whose real input is hidden (the slider's range input) shows the indicator on what is seen. |
| Focus order | The order follows the reading order; a dialog traps focus and returns it. |
| A layer that covers the screen | A full-screen layer (the cupping screen, a drawer, a dialog) makes what is under it `inert`: nothing under it takes focus or a tap. |
| Composite controls | A group of options is one Tab stop, and the arrow keys move inside it: a rating scale is a radio group, a row of tabs is a real tablist with `aria-controls` and a panel. `aria-pressed` on a lone toggle button. |
| Names | Every control has an accessible name; an icon-only button has `aria-label`; a decorative drawing is `aria-hidden`; a meaningful one has a label. |
| Docked chrome | Everything docked over a screen (top bar, header, tabs, footer, the timer, a status line) has a budget measured on a 375 × 667 phone: together it leaves the content a fixed minimum of the height, and what the screen is for is visible in that first fold without scrolling. A docked part that does not fit the budget scrolls away with the content. |
| Reduced motion | With `prefers-reduced-motion`, nothing pins, slides, pulses or counts; the plain layout is shown and stays fully usable. One reset in `app/globals.css` covers every transition and animation, `scrollIntoView` uses `behavior: "auto"`, and charts draw without animating. A component does not need its own guard. |
| Reduced transparency | With `prefers-reduced-transparency`, glass becomes a near-opaque tone and loses its blur. |
| Zoom and reflow | Usable at 200 % zoom and at 320 px wide with no horizontal scroll of the page. |
| Numbers | `tabular-nums` on every score and count. |
| Hidden text | `.sr-only` for text that is for assistive technology only. |
| Language | `<html lang>` matches the language shown, also after a change of language without a reload. |

---

## Brand mark

**(rule)** The product has one name, **"Café Sensible"**, in Spanish and in English, in the app, the emails, the reports and the arrival screens. "Cata Café", "Cata Café Sensible" and "cafesensible.ai" are not used as the product's name in copy (the repository and the domain keep their names).

The name is shown through one component, `Wordmark` (`components/brand/Wordmark.tsx`: the landing header's wordmark, made shared in package S8). It links home and appears in:

- the landing's header and footer;
- the app shell: the sidebar, the icon rail and the phone's top bar;
- every arrival screen: sign-in, the emailed-link confirmation, the guest claim card, the two join pages, the not-found and first-load error pages.

A screen that writes the name by hand, or shows no mark where this list says one belongs, is a finding.

---

## Icon Usage

**Library:** `lucide-react` only.

- Default: `text-on-surface-variant`, 16px inline / 20px standalone
- Action: `text-primary-container` or inherit
- Status: match status color

---

## What Not To Do

| Don't | Do instead |
|---|---|
| Use `error` / `red-defect` decoratively | Reserve strictly for cup defects and errors |
| Colour or name a score by how good it is | A score is a number; colour may mark the series, the distance from the group, or a defect ("No quality bands") |
| Put two primary buttons in one view | One primary action per screen or fold; the rest are `secondary` or `ghost` |
| Style a section heading by hand, or align it differently from its neighbours | One heading component per mode, one alignment (centred on the stage, left on paper, at every width) |
| Make a heading smaller than a heading inside its own section | A title is one clear step above its content |
| Give one card of a set an extra part, or leave one without | One anatomy per kind of card |
| Move two sets of the same kind differently on one device, pin optional cards, or put a required step in a sideways row | One gesture per kind of content |
| Give a tablet its own third layout, or a stretched phone layout | A tablet is a small desktop |
| Show progress as bare dots | A step of progress carries its number |
| Send the reader to the top when the language, tab or filter changes | Keep their place |
| Box or enlarge a section's small name to make it "clearer" | Say what the section is in the title's first line; the pill shape is the offer's |
| Use `h-11`, `w-11` and other rem sizes for a touch target | Pixels: `min-h-[44px]` (the root is 14 px) |
| Use the legacy colour aliases (`text-brown-mid`, `bg-cream`, `text-green-dark`, ...) in new code | The MD3 role names |
| Start a second particle engine or a second card primitive | Reuse the one that exists |
| Put glass on a flat background, or nest glass in glass | Glass only over the constellation or a photo ("Stage and surfaces") |
| Give a stage section an opaque background | Keep sections transparent; depth comes from `.stage-ground` and `.stage-light` |
| Stack a photo and an app screen one under the other | Layer them, or keep them in different sections |
| Animate a count-up on an offer or a fact | Print the number |
| Use `secondary` (terracotta) as a quality signal, or to single out a score | A score is ink; no colour signals quality ("No quality bands") |
| Colour a difference green above and terracotta below | Ink with its sign |
| Set a family colour as text or behind text | A coloured dot or bar beside ink text (one departure: the cupping screen's selected descriptor pills, "Flavor Family Colors") |
| Paint a terracotta banner to say something | `Notice` (info, warning, error) |
| Fill a selected tab, chip or segment with the action green | A tone, a weight, an underline or a check |
| Set text under 11 px, or data under 12 px | The six text roles ("Type Scale") |
| Keep the open tab, sample or filter only in component state | The URL |
| Blur a form under a docked bar | An opaque bar with a hairline |
| Generate Tailwind classes via string concat | Full static class names only (Tailwind v4) |
| Add inline styles to new components | CSS Modules in `components/ui/` |
| Import `PrismaClient` directly | `lib/prisma.ts` singleton |
| Import `admin.ts` in client components | Server actions / API routes only |
| Add `revalidatePath` inside debounced auto-save | Auto-save is debounced at 800ms |
| Use `middleware.ts` | Middleware is `proxy.ts` (Next.js 16) |
| Access `params` without `await` | `const { locale } = await params` |
| Reference `--font-cormorant`, `--font-geist-sans`, `--font-serif-alt` | Use `--font-display` and `--font-ui` |

---

## Auditing against this system

The app is audited against this document with `docs/design-system/AUDIT-RUBRIC.md`: the checklist derived from the rules above, the list of screens, the scale for rating a finding, the form a finding is reported in, and the gaps between this document and the code that are already known. The prompt that started the first audit is `docs/prompts/S11-app-ui-ux-audit.md`; its report, plan and decisions are in `docs/audits/app-ui-ux-2026-11-15/`.

**Source scans.** The landing is held to this document by scans of its source (`tests/landingDensity.test.ts` and its neighbours). The app gets the same kind of scans, each added by the token package that clears its drift, so a new departure fails a test instead of waiting for the next audit (the packages are in that folder's `PLAN.md`):

| Scan | Fails on | Added by |
|---|---|---|
| Hex literals | A hex colour in a component outside the sanctioned files (the chart colours, the stage canvases, the emails, the print twin, the Google mark) | T5 |
| Legacy aliases | A legacy colour alias class or variable (`text-brown-mid`, `bg-cream`, `--color-green-dark`, ...) | T3 |
| Legacy radius | `rounded-md`, `rounded-lg` or `rounded-xl` on paper | T3 |
| Text under the floor | A text size that paints under 11 px | T4 |
| Base styles | A rule on a bare element outside `@layer base` | T2 |
