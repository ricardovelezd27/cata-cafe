# Café Sensible — Design System

> **Sensory Studio** — Warm Minimalist · Editorial Precision
> Version 2026-11-14. This is the design system that governs the product: the public landing page and the app.
> The landing page was rebuilt against it in November 2026. The app has not been checked against it yet; that is the job of the UI/UX audit (`docs/design-system/AUDIT-RUBRIC.md`).

---

## How this document governs

1. **It is normative.** A screen that departs from a rule here is a finding, unless the rule itself is wrong. If the rule is wrong, change the rule here first, in the same change as the code.
2. **Tokens live in one place.** Colours, type, radii and shadows are CSS custom properties in `app/globals.css` (`:root`, mirrored in `@theme inline` so Tailwind has utilities for them). This document describes them; the CSS is what runs. No hex, pixel radius or shadow literal in a component.
3. **Where the document and the code disagree, say so; do not guess.** Parts of the app predate parts of this document. The known gaps are listed in "Known drift" in the audit rubric. A rule marked **(rule)** binds new work today; a description of an existing component is a record of how it is built, and may itself be a finding.
4. **Order of authority.** `PRODUCT.md` (what the product is and its standing rules) comes first, then this file, then a component's own comment. A product rule beats a visual preference: "a score is a number only" is a product rule, so no palette decision can colour a score.
5. **One section, one owner of a pattern.** Every pattern here names the component that implements it. Use the component; do not re-create the pattern by hand.

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

8. **Spanish first, always.** Language, labels and units are rooted in Latin American specialty coffee culture. English mirrors the Spanish structure exactly.

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

> **Terracotta rule:** `secondary` (#9d4326) replaces amber as the accent. It signals energy and emphasis, not quality scoring. For quality signals, use green (`primary-container`). The owner CVA deviation matrix (`OwnerParticipantSection`) is a consensus signal, not a quality score — it uses `primary-fixed` (within 1 SD), `warning-container` (> 1 SD), and `error-container` (≥ 2 SD).

### Backward-Compat Aliases (legacy code)

These keep existing Tailwind utility classes working. Prefer MD3 names in new code.

| Old class | Maps to |
|---|---|
| `text-green-dark` / `bg-green-dark` | `primary-container` (#2c4c3b) |
| `text-green-mid` / `bg-green-mid` | #6b8f71 (unchanged) |
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

Colour may still say three other things about a number, none of them quality:

| Meaning | Tokens | Example |
|---|---|---|
| **Which series it is** | `primary` for one's own, `secondary` / `secondary-container` for the group | The two scores on the landing's score card; group markers on a bar |
| **How far from the group** | `primary-fixed` (within 1 SD), `warning-container` (over 1 SD), `error-container` (2 SD or more) | The owner's deviation matrix |
| **A defect or an error** | `error`, `error-container` | A defective cup, a failed save |

Anything else that tints a rating by its value is a finding for the audit (see `AffectiveBubbles` under "Component Patterns").

### Flavor Family Colors

Used only in `CATAPills` and flavor-family labels. Do not use elsewhere.

| Family | Hex |
|---|---|
| Floral | `#b07d2f` |
| Frutal | `#c0552a` |
| Dulce | `#a07040` |
| Ácido/Fermentado | `#ba1a1a` |
| Verde/Vegetal | `#456553` |
| Nueces/Cacao | `#6b5240` |
| Especia | `#8b5e3c` |
| Tostado | `#332f2a` |
| Otro | `#5e5a55` |

### Chart Color Exception (`components/results/chartColors.ts`)

`components/results/` is otherwise fully tokenized (no hex literals) — `chartColors.ts` is the one sanctioned exception, mirroring the Flavor Family table above. Recharts renders raw SVG, and `stroke`/`fill` props take literal color strings, not Tailwind classes. `getChartColors()` reads the live CSS custom properties off `document.documentElement` at render time (so it tracks `app/globals.css`, dark theme included, without a rebuild) and only falls back to a baked-in hex snapshot during SSR. Keep that fallback snapshot in sync with `app/globals.css` by hand — it must never drift from the token values in this file. Never copy this pattern into ordinary HTML-side styling; it exists solely for Recharts' SVG internals.

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

| Role | Font | Size | Weight | Color | Notes |
|---|---|---|---|---|---|
| Page title | Display | 32px / `text-3xl` | 500 | `text-primary-container` | `font-display leading-tight` |
| Section heading | Display | 24px / `text-2xl` | 500 | `text-primary-container` | |
| Card heading | Display | 20px / `text-xl` | 500 | `text-on-surface` | |
| Section label (uppercase) | UI | 11px | 600 | `text-on-surface-variant` | `uppercase tracking-widest` |
| Body text | UI | 14px | 400 | `text-on-surface` | `leading-relaxed` |
| Label | UI | 14px | 600 | `text-on-surface` | |
| Caption / meta | UI | 12px | 500 | `text-on-surface-variant` | `tabular-nums` |
| Score numeral | Display | 88px | 500 | `text-on-surface` | `tabular-nums leading-none` |
| Score decimal | Display | 56px | 400 italic | `text-on-surface-variant` | `display-italic` |
| Bubble numeral | Display | 19px | 600 | `text-on-surface` | `tabular-nums` |

**The root font size is 14 px, not 16 px.** Every rem-based Tailwind size is therefore 87.5 % of its usual value: `text-3xl` is 26.25 px, `text-4xl` 31.5 px, `text-5xl` 42 px, `h-11` 38.5 px, `max-w-6xl` 1008 px. Media-query breakpoints are not affected (`lg` is still 1024 px). The pixel sizes in the table above are the design intent; the classes beside them paint smaller. Reconciling the two is an open item for the audit. **(rule)** A size that must be exact (a 44 px touch target, a hairline, a device frame) is written in pixels: `min-h-[44px]`, never `h-11`.

**Hierarchy is a step, not a size (rule).** A title is one clear step (1.25 to 1.33 times) above anything inside the thing it titles, and never smaller than its own children. The stage's scale on a wide screen is 52.5 px (page), 42 px (section), 31.5 px (inside a section); see "How a section opens". Check the same relation on every paper screen: page title, section heading, card heading.

### Rules
- All numeric readouts use `font-variant-numeric: tabular-nums` (`.mono` class or `font-mono`)
- Headings have `margin: 0` by default
- Italic (`display-italic` class) reserved for score decimals and editorial emphasis only
- Do not reference old font variables: `--font-cormorant`, `--font-geist-sans`, `--font-serif-alt` — they no longer exist

---

## Spacing

4px unit, 8px base grid. Generous outer margins create a "letterhead" feel.

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

Desktop outer margin: 48px. Mobile: 16px. Container max: 1280px.

---

## Border Radius

Contemporary, pill-influenced geometry. 16px cards soften the analytical rigor.

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--radius-sm` | 8px | `rounded-sm` | Small interactive elements, icon containers |
| `--radius-pill` | 9999px | `rounded-pill` | Buttons, tags, badges |
| `--radius-card` | 16px | `rounded-card` | Cards, section containers, modal |
| `--radius-input` | 16px | `rounded-input` | Inputs, selects |
| `--radius-md` | 24px | `rounded-md` | Side panels (leading corner) |
| `--radius-lg` | 32px | `rounded-lg` | Large containers |
| `--radius-xl` | 48px | `rounded-xl` | Hero elements |

---

## Elevation & Depth

No heavy drop shadows. Depth through tonal surface layering ("stacked paper" effect).

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--shadow-card` | `0 1px 3px rgba(31,27,25,0.06)` | `shadow-card` | Standard card |
| `--shadow-card-lg` | `0 4px 16px rgba(31,27,25,0.08), 0 1px 4px rgba(31,27,25,0.04)` | `shadow-card-lg` | Modal, focused card |
| `--shadow-inset` | `inset 0 1px 2px rgba(31,27,25,0.04)` | `shadow-inset` | Inset surfaces |

**Tonal layering:** interactive cards (`surface-container-lowest`) sit atop the page background (`surface`). Use 1px `border-outline-variant` to define card boundaries instead of shadow.

**Glassmorphism:** reserved for side panels and overlays (Flavor Wheel selector, etc.). Use `backdrop-blur-xl` with `bg-surface-container-lowest/80` — not decorative. This is the rule for the **paper** mode (the app). The **stage** mode has its own glass surface, with its own rule: see the next chapter.

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
- **One alignment for every section.** On a phone the header is centred and the line runs out to both sides of the name. From 640 px up (tablet and desktop) it is on the left and the line runs to the right. There is no per-section choice: all the section breaks of a page look the same.
- **The title is one clear step above anything inside the section.** Stage scale on a wide screen: page title 52.5 px, section title 42 px, titles inside a section 31.5 px (a 1.25 to 1.33 step). A title inside a section is never as large as the section's own.
- **Idea, then assertion.** A section title tells a small story in two lines: first the idea, which says in plain words what the section is ("Así funciona una cata.", "Esto es lo que incluye.", "Para quién es."), then, on its own line under it, what we assert about it ("Percibir, describir, alinear.", "Todo el protocolo, cero fricción.", "Para quien forma paladares."). They are two message keys, `title` and `titleAssertion`, and two props of the component, so the break is fixed and never left to where the browser wraps. The idea stays on one line wherever it fits; the assertion is set in the display italic (`.display-italic`), same size and colour, so the two parts stay told apart on a small phone where the idea itself wraps. Write new section titles in this shape; a title that is a single statement has no `titleAssertion` and stays on one line.
- **A shade behind the text** (`stage-light-shade`), so the constellation never crosses a title while it travels between two folds.

Do not hand-write an eyebrow plus `<h2>` in a stage section; use the component. The closing section is the exception: it is the finale, with its own larger title.

### Motion on the stage

- Scroll storytelling uses CSS `position: sticky` plus one small script that only READS the scroll position and writes progress values (`--p2`, `--p3`, 0 to 1) and a `data-active` state on the section root; the visuals are static CSS rules over those values (transform and opacity only). No scroll hijacking, no pinning library.
- **The scroll is the timeline, and text and picture arrive together.** A screen starts to appear when its step's title enters at the bottom of the viewport and is in place exactly when that title is in the middle (`components/landing/stepsProgress.ts`, pure and tested). It eases in and out, with about 90 ms of follow so a mouse wheel's jumps do not show. Scrolling back plays it in reverse.
- An arriving solid surface becomes opaque within the first fifth of its travel: it never sits half see-through over the text of the surface behind it.
- Every such layout has a plain fallback (`prefers-reduced-motion`, no script, a screen where it does not fit) that shows the same content without sticking or moving.

#### One way to move through a section on a phone (the scroll stage)

On a phone, a section made of several cards is not a long list and not a sideways swipe: it is a **scroll stage** (`components/landing/ScrollDeck.tsx`, `DeckRail.tsx`, pure rules in `deckProgress.ts`, `.deck-*` in `app/globals.css`). "Cómo funciona", "Qué incluye" and "Para quién es" all use it, so the visitor learns one gesture.

- **The header stays.** The section's fold line and title stay under the top bar, a size down (24 px).
- **The vertical scroll brings the cards in one by one.** Each card costs half a screen of scroll, so a card moves about as far as the finger does (at a quarter of a screen a slight touch swapped a whole card): it arrives during the first 70 % of that stretch and rests for the last 30 %. A progress rail (one dot per card) advances with it.
- **Opaque surfaces go over one another; glass surfaces take turns.** The app screens pile up with their labelled edges showing. A photo card lands over the previous photo, which stays underneath until it is covered, so the stage is never empty between two pictures. A glass card leaves as the next one arrives, one after the other, because two translucent cards would be read through each other.
- **Text that belongs to a card changes with it**, at the halfway point of the card's arrival, out first and then in.
- **It is switched on only where it fits.** Under 640 px wide, motion allowed, script running, and the cards fit the room under the header (the pile may scale down to 72 %). Otherwise the section keeps its plain layout. The decision is made on load and when the width changes, never when a phone's toolbar hides (that would make the page jump).
- **Control comes before length.** The three stages make the page longer than the plain layouts they replace (about half a screen per card). That is the price of a pace the thumb controls; do not shorten the step to win the length back.
- The constellation follows markers along the stage's track (`.deck-fold`), since the cards themselves no longer move down the page.

To give a new section this behaviour: `data-deck="pile | swap | fill"` on the `<section>`, `deck-stage` on its inner container, `deck-head` around the `SectionHeading`, a `DeckRail`, `data-deck-area` on the element that holds the cards, `data-deck-card` on each card, and one `<ScrollDeck rootId>`. A card that carries `data-reveal` cannot be the deck card itself (the reveal clears its inline styles); put the reveal on an element inside it.
- No count-up on a number that states an offer or a fact.
- The constellation's arrival (`journey/intro.ts`) plays once per tab and never delays the headline.

---

## Bringing the stage into the app

The landing was the place to find the rules; the app is where most of them apply. This chapter says which lessons carry over to paper and how. It is the part of the system the app has not been built against yet, so expect most audit findings to land here.

### What carries over unchanged (rules)

| Lesson from the landing | On a paper screen it means |
|---|---|
| **One action per fold** | Each screen has one primary button (`Button variant="primary"`). Everything else is `secondary` or `ghost`. Two primaries in one view, or a primary that is not the screen's main job, is a finding. |
| **One header for every section** | A screen's sections open the same way, with the same component, the same alignment and the same step in size. Per-screen heading styles are a finding. (Paper has `PageHeader` for the page; it has no shared section-heading component yet. That gap is the first thing the audit should size.) |
| **Idea, then assertion** | A title says in plain words what the thing is; the line under it says what is true about it. A clever title that hides what the section is, is a finding. |
| **One anatomy per kind of card** | All cards of one kind have the same parts in the same order (for a feature: name, explanation, drawing). A list where one card has an extra part, or lacks one, is a finding. |
| **One gesture** | A set of items is moved through the same way everywhere on a given device. Mixing a sideways swipe, a vertical list and tabs for the same kind of content is a finding. |
| **Keep the reader's place** | Switching language, tab, filter or view must not send the person back to the top or lose what they were looking at (`components/landing/scrollAnchor.ts` is the model: "this section, this far through it"). |
| **Hierarchy is a step** | A heading is never smaller than a heading inside its own section. |
| **Numbers are printed** | No count-up, no animated score, no number that is briefly wrong. |
| **Solid for what must be read or acted on** | The thing the person must read or act on sits on the most opaque, highest-contrast surface of the screen. |
| **Fits, or falls back** | An enhanced layout (pinned, animated) is switched on only where its content fits, and every one has a plain fallback for reduced motion, no script and small screens. |

### Where the dots and the dark ground may appear in the app

| Place | Allowed | Why |
|---|---|---|
| Sign-in, the emailed-link confirmation, the guest claim card | Yes: stage ground, the offer-card recipe (`surface-solid`) for the form | Nothing is being evaluated; this is an arrival |
| Waiting room before a live session starts | Yes, behind the status, never behind the participant list or a control | A moment of waiting |
| Empty states of a list (no sessions, no coffees yet) | A still, small formation as the illustration, on paper | It explains "nothing here yet" without a stock drawing |
| The warm-up ("Movimiento sensorial") | Already uses the particle language for breathing | It is a guided moment, not data entry |
| A session's closing moment (results first shown) | Once, briefly, never over the numbers | A moment of arrival at a result |
| The cup form, results tables, any list, any dialog, any form | **Never** | Sensory focus and legibility: principles 1 and 3 |

A screen that uses the constellation must take it from the one engine (`components/landing/journey/`), keep its governor and kill switch, and respect reduced motion. A second particle implementation is a finding.

### Glass and grain on paper

- Glass on paper stays what it was: overlays and side panels only (`bg-surface-container-lowest/80` with `backdrop-blur-xl`), never a card in the page flow. The stage's `.surface-glass` is not used on a cream ground: there is nothing behind it to show.
- Grain exists only on a photo of a real session (`.surface-photo`, through `PhotoSlot`). No textured cards, no noise backgrounds.

### Drawings in the app

A feature, an empty state or an explanation may carry a small drawing when it shows what the sentence says (principle 6). It is built from shapes and the system's tokens, as in `components/landing/FeaturesSection.tsx` (numerals, a score line, a track, a small map, a broken-then-whole line, two sheets). No stock illustration, no emoji, no icon used as a picture where a drawing of the real thing is possible. A drawing never shows a number that could be mistaken for a real result.

---

## Motion

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease` | Color/border state changes, hover |
| `--transition-med` | `240ms cubic-bezier(0.2, 0.8, 0.2, 1)` | Panel open/close, layout transitions |

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

### Input / Select

```html
<input class="w-full border border-outline-variant rounded-input px-3 py-2 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors" />
```

### Card

```html
<div class="bg-surface-container-lowest border border-outline-variant rounded-card shadow-card p-4">
```

### Section Container

```html
<div class="bg-surface-container border border-outline-variant rounded-card p-4 mb-3">
  <h3 class="font-display text-sm font-semibold text-primary-container uppercase tracking-widest">
    Fragancia
  </h3>
</div>
```

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
- **`EmptyState`** — centered icon-in-circle + display title + body + CTA.
- **`ConfirmDialog`** — destructive confirmation on `ResponsiveDialog` with
  `useTransition` pending state and inline error. Body copy must state the
  full cascade blast radius honestly (see the deleteSession/deleteCoffee keys).
- **`SearchInput` / `Select` / `FilterBar` / `Pagination`** — the table's
  control set; also reusable standalone. `FilterBar` renders one `Select` per
  facet plus a clear-filters ghost button.

### Breakpoint rule

| Layer | Switch point |
|---|---|
| Content layouts (DataTable table↔cards, profile columns) | `md:` (768px) |
| App shell (Sidebar ↔ BottomNav/TopBar) | `lg:` (1024px) |
| Dialogs (centered modal ↔ bottom sheet) | 640px (`ResponsiveDialog` internal) |

### `PillTabs` / `SegmentedControl` / `InfoHint` (2026-08 results redesign — `components/ui/`)

- **`PillTabs`** — a horizontally-scrollable `role="tablist"` row of individually-outlined pills (44px min hit target). Active: `bg-primary-container text-on-primary`; inactive: `border-outline-variant` outline, `on-surface-variant` text hovering to `on-surface`; disabled items sit at `opacity-45`. Takes an optional numeric `badge` chip per item (`bg-secondary`/`text-on-secondary`, or `bg-on-primary/20` when the item is active). Two densities via `size`: `"md"` (default) and `"sm"` for secondary filter rows. Used for the results page's three main tabs, the Descriptores sample/block filter rows, and the `SampleDetailDialog` catador switcher.
- **`SegmentedControl`** — a single inline-flex pill "track" (`bg-surface-container-high`, `role="tablist"`, 4px padding) holding equal-width (`flex-1`) segments. The active segment gets its own raised pill (`bg-surface-container-lowest` + `shadow-card` + `on-surface` text); inactive segments are transparent with `on-surface-variant` text. Reserve this for a small, fixed set of mutually-exclusive views (e.g. exactly 2) — use `PillTabs` for anything open-ended. Used for the Resultados tab's Tabla/Gráfico switch, persisted per-browser via `localStorage` (`cata_results_view`).
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
- As built: the selected bubble is tinted by its value (`n ≥ 7` terracotta, `n ≤ 3` the error red, otherwise green), through the legacy colour aliases in its CSS module.
- FINAL readout: `primary-container` when set, `secondary` "FINAL" label
- **Open question for the audit:** tinting a 1 to 9 rating by how high it is reads as a quality colour, which "No quality bands" forbids for scores, and it uses the error red for something that is not an error. Decide with the product owner whether a rating is covered by that rule; if it is, the selected bubble becomes one colour.

### `CATAPills`

- Unselected: `outline-variant` border, transparent fill, pill shape
- Selected: solid `primary-container` fill, `on-primary` text
- At-limit: unselected at `opacity: 0.45`

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

- `OfflineBanner` (`components/offline/`): persistent, low-emphasis status strip shown while the device is offline; `secondary-container` bg, `on-secondary-container` text. Non-blocking — cupping continues underneath.
- `SyncConflictModal` (`components/offline/`): Radix dialog surfaced on reconnect when a draft was already submitted elsewhere; offers keep-local vs. keep-remote.
- `OfflineFirstLoadError` (`components/offline/`): fallback when a session can't be hydrated offline on first load.
- `WelcomeModal` (`components/onboarding/`): first-run modal capturing role + country, then routing to a first action (new session / add coffee). Calm, editorial, single-column.

---

## Layout Patterns

```html
<!-- Page shell -->
<main class="min-h-screen bg-surface">
  <div class="max-w-[1280px] mx-auto px-12 py-8">
```

```html
<!-- Section dividers -->
<hr class="border-t border-outline-variant my-6" />
```

---

## Accessibility

The baseline is WCAG 2.2 AA. These are the measurable parts; each is a line of the audit rubric.

| Requirement | Measure |
|---|---|
| Touch targets | At least 44 × 44 px for anything tappable (written in pixels: the root is 14 px). 24 × 24 px is the floor that is never crossed. |
| Text contrast | 4.5 : 1 for body text, 3 : 1 for text from 24 px (or 19 px bold) and for the outline of a control. Check `on-surface-variant` on every container tone, and any text set at reduced opacity. |
| Text over something that moves | Never: dots do not cross body text. On the stage a shade (`stage-light-shade`) or a darker glass sits behind it. |
| Colour alone | Never the only carrier of meaning: a status has a word or an icon as well. |
| Focus | Every interactive element shows a visible focus ring; the order follows the reading order; a dialog traps focus and returns it. |
| Names | Every control has an accessible name; an icon-only button has `aria-label`; a decorative drawing is `aria-hidden`; a meaningful one has a label. |
| Toggles and tabs | `aria-pressed` on toggle buttons (bubbles, pills); `role="tablist"` semantics on `PillTabs` and `SegmentedControl`. |
| Reduced motion | With `prefers-reduced-motion`, nothing pins, slides or counts; the plain layout is shown and stays fully usable. |
| Reduced transparency | With `prefers-reduced-transparency`, glass becomes a near-opaque tone and loses its blur. |
| Zoom and reflow | Usable at 200 % zoom and at 320 px wide with no horizontal scroll of the page. |
| Numbers | `tabular-nums` on every score and count. |
| Hidden text | `.sr-only` for text that is for assistive technology only. |
| Language | `<html lang>` matches the language shown, also after a change of language without a reload. |

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
| Style a section heading by hand, or align it differently from its neighbours | One heading component, one alignment (centred on a phone, left from 640 px on the stage) |
| Make a heading smaller than a heading inside its own section | A title is one clear step above its content |
| Give one card of a set an extra part, or leave one without | One anatomy per kind of card |
| Offer a sideways swipe for one set and a vertical list for another on the same device | One gesture per device |
| Send the reader to the top when the language, tab or filter changes | Keep their place |
| Box or enlarge a section's small name to make it "clearer" | Say what the section is in the title's first line; the pill shape is the offer's |
| Use `h-11`, `w-11` and other rem sizes for a touch target | Pixels: `min-h-[44px]` (the root is 14 px) |
| Use the legacy colour aliases (`text-brown-mid`, `bg-cream`, `text-green-dark`, ...) in new code | The MD3 role names |
| Start a second particle engine or a second card primitive | Reuse the one that exists |
| Put glass on a flat background, or nest glass in glass | Glass only over the constellation or a photo ("Stage and surfaces") |
| Give a stage section an opaque background | Keep sections transparent; depth comes from `.stage-ground` and `.stage-light` |
| Stack a photo and an app screen one under the other | Layer them, or keep them in different sections |
| Animate a count-up on an offer or a fact | Print the number |
| Use `secondary` (terracotta) as a quality signal | Quality = green (`primary-container`) |
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

The app is audited against this document with `docs/design-system/AUDIT-RUBRIC.md`: the checklist derived from the rules above, the list of screens, the scale for rating a finding, the form a finding is reported in, and the gaps between this document and the code that are already known. The prompt that starts the audit session is `docs/prompts/S11-app-ui-ux-audit.md`.
