# Cata Café — Design System Reference

> **Sensory Studio** — Warm Minimalist · Editorial Precision
> Last updated: 2026-08-06

---

## Design Principles

1. **Data speaks first.** Scores and evaluation data are always the visual hero. Typography and spacing serve legibility above everything else. Never bury a number.

2. **Trust through precision.** Exact values, consistent rounding, tabular numerics (Hanken Grotesk with `tabular-nums`). Nothing ambiguous.

3. **Craft without decoration.** The earthy palette and serif typography reference the tactile heritage of SCA paper forms. Richness through type and color — not illustration, texture, or ornament.

4. **Calm before complexity.** The CVA protocol is cognitively demanding. Spacious layout, sequenced disclosure. One thing at a time.

5. **Spanish first, always.** Language, labels, and units are rooted in Latin American specialty coffee culture.

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

### Score Band Colors

| Score | Band | Background | Badge |
|---|---|---|---|
| ≥ 85 | Excepcional / Excelente | `bg-primary-fixed` | `bg-primary-container text-on-primary` |
| 75–84 | Muy bueno / Bueno | `bg-secondary-fixed` | `bg-secondary text-on-secondary` |
| < 75 | Promedio / Bajo | `bg-error-container` | `bg-error text-on-error` |

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

**Glassmorphism:** reserved for side panels and overlays (Flavor Wheel selector, etc.). Use `backdrop-blur-xl` with `bg-surface-container-lowest/80` — not decorative.

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
| `variant` | `primary` \| `secondary` \| `ghost` \| `accent` \| `accentOutline` | see classes below |
| `size` | `md` (default) \| `sm` | `md` = `px-5 text-sm`, `sm` = `px-3.5 text-xs` — height stays 44px at both |
| `icon` | `ReactNode` | leading icon, sized/`aria-hidden` by the caller |

| Variant | Classes | Use |
|---|---|---|
| `primary` | `bg-primary-container text-on-primary hover:bg-primary` | main CTA (Descargar PDF, Guardar) |
| `secondary` | `border border-primary-container text-primary-container hover:bg-primary-fixed` | secondary action alongside a primary (Ver formulario, Editar) |
| `ghost` | `text-on-surface-variant hover:text-on-surface` | lowest-emphasis action (Cancelar, metadata edit) |
| `accent` | `bg-secondary text-on-secondary hover:opacity-90` | terracotta emphasis when something needs attention (e.g. "Actualizar" with new submissions pending) |
| `accentOutline` | `border border-secondary text-secondary hover:bg-secondary-fixed` | the same action's resting/no-news state |

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
  as active) to translated labels with a leading dot. `ScorePill` applies the
  score bands (≥85 green, 75–84 terracotta, <75 error) with `tabular-nums`.
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
- Selected by value: `n ≥ 7` → `secondary` (terracotta), `n ≤ 3` → `error`, else → `primary-container`
- FINAL readout: `primary-container` when set, `secondary` "FINAL" label

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

Shows the CVA formula, the per-section values, and the session setup (cups per sample, whether uniformity/defect penalties apply). `Σhᵢ` in `primary-container`, penalties in `error`, consistent with `ScoreDisplay`.

### `CupIndicators`

- Uniform: `primary-fixed` bg, `primary-container` border, `on-surface` digit
- Non-uniform: `secondary-fixed` bg, `secondary` border + digit, `≠` badge
- Defective: `error-container` bg, `error` `×` glyph + defect badge

### `ScoreDisplay`

- Numeral: Newsreader 88px/500, `tabular-nums`
- Band label: score-band bg, `on-primary` or `on-secondary` text
- Formula `<dl>`: 2-column, UI 11.5px; `Σhᵢ` in `primary-container`, penalties in `error`

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

- `.sr-only` for visually hidden accessible text
- `aria-pressed` on toggle buttons (bubbles, pills)
- `tabular-nums` on all score/count displays
- Color is never the sole carrier of meaning (status uses text + icons too)
- Reduced motion: short CSS transition durations

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
| Use `secondary` (terracotta) as a quality signal | Quality = green (`primary-container`) |
| Generate Tailwind classes via string concat | Full static class names only (Tailwind v4) |
| Add inline styles to new components | CSS Modules in `components/ui/` |
| Import `PrismaClient` directly | `lib/prisma.ts` singleton |
| Import `admin.ts` in client components | Server actions / API routes only |
| Add `revalidatePath` inside debounced auto-save | Auto-save is debounced at 800ms |
| Use `middleware.ts` | Middleware is `proxy.ts` (Next.js 16) |
| Access `params` without `await` | `const { locale } = await params` |
| Reference `--font-cormorant`, `--font-geist-sans`, `--font-serif-alt` | Use `--font-display` and `--font-ui` |
