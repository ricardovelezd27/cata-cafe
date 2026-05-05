# Handoff: Cata Café Sensible — SCA CVA Cupping Web App

## Overview
Cata Café Sensible is a web app that walks Q-graders and trained cuppers through an SCA Coffee Value Assessment (CVA) session: per-sample descriptive intensity ratings, affective 1–9 scoring, CATA flavor selection, cup uniformity / defect tracking, and a final CVA score with formula breakdown. This handoff covers the **atomic component library + design tokens + scoring engine** that the rest of the app (sample list, session shell, results page) will be assembled from.

## About the design files
The files in this bundle are **design references created in HTML/JSX** — interactive prototypes showing intended look, behavior, and exact tokens. They are **not** production code to ship. Recreate them in the target codebase's environment (Next.js + React 18 + TypeScript + CSS Modules is the assumed target — see file structure below — but adapt to whatever the project actually uses) following its established patterns. The included `.tsx` and `.module.css` files are written in production-ready style and may be copied in directly *if* the target project is Next.js / React with CSS Modules.

## Fidelity
**High-fidelity.** Final colors, typography scale, spacing, radii, and interaction states are all locked. Implement pixel-perfectly. The only deliberately open choices are micro-animations (use the `--transition-fast` / `--transition-med` tokens, ease curves are suggestions).

## Components
Five atomic components. Each is documented below with props, states, and exact visual specs. All measurements assume the project's `globals.css` tokens are loaded.

### 1. `IntensitySlider`
**File**: `components/ui/IntensitySlider.tsx` + `.module.css`
**Purpose**: 0–15 linear scale used for the six descriptive attributes (Fragancia, Aroma, Sabor, Regusto, Acidez, Dulzor, Sensación). Step `0.5`.

**Props**
```ts
{ value: number | null; onChange: (v: number) => void;
  label?: string; disabled?: boolean;
  min?: number; max?: number; step?: number; }
```

**Anchors** (rendered as tick labels): `0 LOW`, `5`, `10 MEDIUM`, `15 HIGH`.

**Visual spec**
- Track: `height: 8px; background: var(--color-cream); border: 1px solid var(--color-brown-light); border-radius: var(--radius-pill);`
- Fill: `background: var(--color-green-mid); border: 1px solid var(--color-green-dark);`
- Thumb: `22px` circle, `2px` border `--color-green-dark`, inner dot `--color-green-dark`, `box-shadow: var(--shadow-card)`
- Value display (top-right): Cormorant Garamond, `24px / 600`, color `--color-green-dark`, with `/15` suffix in JetBrains Mono `10px` `--color-brown-mid`
- Empty state (`value === null`): thumb desaturated to cream/brown-light, value display reads italic "Sin marcar"
- Locked state (`disabled`): solid green thumb with white inner dot, no pointer events on the hidden range input

The visible thumb is decorative; an absolutely-positioned `<input type="range">` with `opacity: 0` covers the track for keyboard/pointer interaction.

### 2. `AffectiveBubbles`
**File**: `components/ui/AffectiveBubbles.tsx` + `.module.css`
**Purpose**: 9-point hedonic scale used for affective scoring of every CVA section.

**Props**
```ts
{ value: number | null; onChange: (v: number) => void;
  label?: string; disabled?: boolean; showFinal?: boolean; }
```

**Visual spec**
- 9 buttons in a row, gap `8px`. Bubble: `44×44`, `border-radius: 50%`, `1.5px` border `--color-brown-light`, `--color-bg` background.
- Glyph: Cormorant Garamond `19px / 600`, color `--color-brown-dark`, tabular-nums.
- Selected tone branches by value:
  - `n ≥ 7`: amber (`--color-amber`) + `box-shadow: 0 0 0 4px rgba(193,120,23,0.15)`
  - `n ≤ 3`: red (`--color-red-defect`) + `box-shadow: 0 0 0 4px rgba(168,50,50,0.12)`
  - else: green (`--color-green-dark`) + `box-shadow: 0 0 0 4px rgba(61,90,62,0.10)`
- Final readout (right end of row, gap `16px`): `58×44` rounded box. When set, fills with `--color-green-dark` and a "FINAL" mono caplet appears in `--color-amber`.
- Scale legend below the row (`AFFECTIVE_LABELS[1] / [5] / [9]` in mono `9px`, `letter-spacing: 0.16em`, color `--color-brown-mid`).

**Responsive**: at `max-width: 480px`, bubbles shrink to `32×32`, final box to `42×32`, scale labels to short forms.

### 3. `CATAPills`
**File**: `components/ui/CATAPills.tsx` + `.module.css`
**Purpose**: Multi-select "Check All That Apply" pills for flavor families and other taxonomies.

**Props**
```ts
{ options: readonly CATAOption[]; selected: string[];
  onChange: (next: string[]) => void;
  maxSelect?: number; showSubItems?: boolean; disabled?: boolean; }

interface CATAOption { id: string; label: string; color: string; subItems?: readonly string[]; }
```

**Visual spec**
- Pill (unselected): `padding: 7px 14px; border-radius: var(--radius-pill); border: 1.5px solid <option.color>; background: color-mix(in oklch, <color> 10%, transparent); color: <color>;` with a `6px` dot of the same color.
- Pill (selected): solid fill of `<option.color>`, transparent border, white text, dot becomes 65%-white.
- Sub-row (only when `showSubItems` and parent selected): renders `option.subItems` as smaller pills (`font-size: 11.5px; padding: 5px 11px;`) under the parent, indented `16px` with a `2px` left border in `--color-brown-light`. The sub-row is rendered as a `flex-basis: 100%` row so it line-breaks inside the same flex-wrap container.
- Counter at top (only when `maxSelect` is defined): "Selecciona hasta N · X/N" in mono.
- At-limit state: unselected pills get `disabled` + `opacity: 0.45`.

### 4. `CupIndicators`
**File**: `components/ui/CupIndicators.tsx` + `.module.css`
**Purpose**: Per-sample cup status row (5 cups by default).

**Props**
```ts
{ totalCups?: number;
  nonUniform?: number[];
  defective?: { cup: number; type: 'potato'|'moldy'|'phenolic' }[];
  showSummary?: boolean; }
```

**Visual spec** (each cup is a `38×38` circle in mono `13px / 600`)
- Uniform: bg `--color-green-mid`, border `--color-green-dark`, white digit
- Non-uniform: bg `--color-bg`, `1.5px` `--color-amber` border, amber digit, `≠` superscript badge top-right
- Defective: bg `--color-red-defect`, white "×" (digit hidden), defect badge below the circle (`POTATO` / `MOLDY` / `PHENOLIC`) in mono `8.5px / 700`, red text, `12% red` bg, `30% red` border.
- Summary row (`showSummary`): "Uniformes X/5 · No unif. N · Defectos D" in mono with Cormorant Garamond numerals.

### 5. `ScoreDisplay`
**File**: `components/ui/ScoreDisplay.tsx` + `.module.css`
**Purpose**: Final CVA score card with formula breakdown.

**Props**
```ts
{ sectionScores: number[];      // 8 values
  nonUniformCups: number;        // 0–5
  defectiveCups: number;         // 0–5
  expandable?: boolean; defaultExpanded?: boolean; }
```

**Visual spec**
- Outer card: `padding: 28px 28px 24px; border-radius: var(--radius-card); border: 1px solid;`
- Background tint and band color follow `scoreBand(score)`:
  - `≥85` (green): `bg = color-mix(in oklch, var(--color-green-mid) 14%, var(--color-bg))`, band `--color-green-dark`
  - `75–84` (amber): `bg = color-mix(in oklch, var(--color-amber) 10%, var(--color-bg))`, band `--color-amber`
  - `<75` (red): `bg = color-mix(in oklch, var(--color-red-defect) 9%, var(--color-bg))`, band `--color-red-defect`
- Band (top-right): mono `9.5px / 700`, white text, label from `SCORE_CATEGORY_LABELS[scoreToCategory(score)]`.
- Score number: Cormorant Garamond `88px / 500`, line-height `0.95`, letter-spacing `-0.025em`, tabular-nums; the `.dd` decimal portion is `56px`, italic, `--color-brown-mid`, negative `margin-left: -6px`.
- Formula `<dl>`: 2-column grid (label / value), mono `11.5px`. Σhᵢ row uses `--color-green-dark`, `2u` and `4d` rows use `--color-red-defect`.
- Expand button toggles a section list (8 rows from `CUPPING_SECTIONS`, each `labelEs` + score in Cormorant Garamond `14px / 600`).

## Design tokens
All in `app/globals.css` as CSS custom properties.

**Greens** — `--color-green-dark #3D5A3E`, `--color-green-mid #6B8F71`, `--color-green-light #B4C8A8`
**Warm accent** — `--color-amber #C17817`
**Surface** — `--color-bg #FDFBF7` (parchment), `--color-cream #F5F0E6`, `--color-white #FFFFFF`
**Browns** — `--color-brown-dark #5C4A32`, `--color-brown-mid #8B7355`, `--color-brown-light #E8E0D0`
**Status** — `--color-red-defect #A83232` (defects only — never decorative)
**Flavor families** — see `lib/constants.ts` `FLAVOR_FAMILIES[].color`. Floral `#C17817`, Frutal `#E8834A`, Dulce `#B4874E`, Ácido/Fermentado `#A83232`, Verde/Vegetal `#6B8F71`, Nueces/Cacao `#8B7355`, Especia `#9B6B4A`, Tostado `#5C4A32`, Otro `#7A6E5F`.

**Radii** — `--radius-input 8px`, `--radius-card 12px`, `--radius-pill 9999px`
**Shadows** — `--shadow-card 0 2px 8px rgba(0,0,0,0.06)`, `--shadow-card-lg`, `--shadow-inset`
**Spacing scale** — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px` (`--space-1`…`--space-8`)
**Motion** — `--transition-fast 150ms ease`, `--transition-med 240ms cubic-bezier(0.2,0.8,0.2,1)`

**Typography**
- `--font-display: 'Cormorant Garamond', Georgia, serif;` — score numerals, headings, editorial italics
- `--font-ui: 'Inter', system-ui, sans-serif;` — labels, buttons, body
- `--font-mono: 'JetBrains Mono', ui-monospace, monospace;` — measurements, captions, formula readouts

Type usage:
- Body: Inter 14/1.5 (`--color-brown-dark`)
- Section captions: mono 10–11px, `letter-spacing: 0.18em`, uppercase, `--color-brown-mid`
- Score numerals & section sub-titles: Cormorant Garamond, `letter-spacing: -0.005em`
- All numeric readouts: `font-variant-numeric: tabular-nums`

## Scoring engine
**File**: `lib/scoring.ts`. Single source of truth. Pure functions — no React.

Formula: `S = 0.65625 · Σhᵢ + 52.75 − 2u − 4d`, rounded to nearest `0.25`.
- `calculateCVAScore(sectionScores: number[], u: number, d: number): number`
- `calculateCVABreakdown(...)` — returns every intermediate value the `ScoreDisplay` card renders.
- `scoreToCategory(score)` → `'exceptional' | 'excellent' | 'vgood' | 'good' | 'average' | 'low'` (per SCA bands)
- `scoreBand(score)` → `'green' | 'amber' | 'red'` (the visual band only)

## Constants
**File**: `lib/constants.ts`.
- `CUPPING_SECTIONS` (8 entries — 6 descriptive + Sensación + Global)
- `AFFECTIVE_LABELS` and `AFFECTIVE_SHORT` (1–9, full Spanish)
- `FLAVOR_FAMILIES` (9 with sub-items)
- `MOUTHFEEL_OPTIONS`, `MAIN_TASTES`, `SENSORY_DEFECTS`, `SENSORY_DEFECT_LABELS`
- `PROCESS_TYPES` (Lavado, Natural, Honey, Anaeróbico, Maceración Carbónica, Láctico, Co-fermentación, Otro)
- `CATA_MAX_SELECT` (per-section selection limits)

## Interactions & behavior
- **Slider**: drag-to-set, snaps to `0.5` step. Hidden `<input type="range">` provides keyboard support (←/→). Disabled state is non-interactive.
- **Bubbles**: single-select; clicking the active bubble does **not** clear (the design treats every click as a confirmation). Clearing happens via parent state.
- **CATA pills**: multi-select. When `selected.length === maxSelect`, unselected pills become `disabled`. Selected pills can always be unselected.
- **Sub-items**: collapse with the parent. Sub-pills don't currently track their own selection — selecting them is parent-state work for the consumer (next iteration).
- **Cup indicators**: read-only in the atomic library; mutation handled by a parent `CupGrid` component.
- **Score**: `ScoreDisplay` is read-only. The breakdown list expands inline, animated by appearing in the layout.
- **Animations**: keep them subtle — `--transition-fast` for color/border on interactive states, no length/transform animation on `box-shadow`. Don't tween the score number; it should swap.

## State management
The atomic components are all **controlled**. State for an entire cupping session lives one level up (a `useCuppingSession` hook or Zustand store, depending on what the project uses). Per-sample state shape:

```ts
interface SampleEvaluation {
  sampleId: string
  intensities: Record<CuppingSectionId, number | null>     // 0–15
  affectives:  Record<CuppingSectionId, number | null>     // 1–9
  cataSelections: Record<CuppingSectionId, string[]>
  nonUniformCups: number[]                                  // cup numbers 1..N
  defectiveCups: { cup: number; type: SensoryDefect }[]
  notes: string
}
```

Persist to localStorage on every change keyed by `sessionId` so refresh is safe; sync to backend on session close.

## Assets
- **Fonts**: Cormorant Garamond, Inter, JetBrains Mono — loaded via Google Fonts in `globals.css`. No font files shipped.
- **Icons**: none yet. The "≠" non-uniform badge and "×" defect glyph are typographic. If the app needs more icons later, use a single set (Lucide is a good default for this aesthetic).
- **Brand mark**: the wordmark in `Component Library.html` is a placeholder — a circled italic "c" lockup in cream on green. The final wordmark will come from the brand team; do not commit the placeholder to production.

## Files in this bundle
| Path | Purpose |
|---|---|
| `app/globals.css` | All design tokens + base styles |
| `lib/constants.ts` | CVA protocol data |
| `lib/scoring.ts` | Pure scoring functions + breakdown |
| `components/ui/IntensitySlider.tsx` + `.module.css` | 0–15 slider |
| `components/ui/AffectiveBubbles.tsx` + `.module.css` | 1–9 hedonic |
| `components/ui/CATAPills.tsx` + `.module.css` | Flavor pills |
| `components/ui/CupIndicators.tsx` + `.module.css` | Cup status row |
| `components/ui/ScoreDisplay.tsx` + `.module.css` | Final CVA card |
| `components/ui/index.ts` | Barrel export |
| `Component Library.html` | Live preview of all five components |
| `Cata Café Sensible.html` | Pure-HTML artboard (visual reference, not code) |

## Recommended next-step components (not in this bundle)
- `SampleTabs` — pestañas to switch between samples in a session
- `PhaseStepper` — chronological CVA phase indicator (1 Fragancia → 7 Global)
- `SessionShell` — page-level layout that composes the atoms above into a sample evaluation form

Designs for these exist in the `Cata Café Sensible.html` artboard for reference; the production TSX has not been written yet.

## Conventions for the implementer
- All component file names are PascalCase (`IntensitySlider.tsx`), CSS Modules siblings (`IntensitySlider.module.css`).
- Path alias assumed: `@/lib/...`, `@/components/ui/...`. If the target project uses different aliases, adjust the imports.
- Components use `'use client'` because they hold state — fine for both Next.js App Router and any client-only React setup. Remove the directive in non-Next environments.
- All copy is in **Spanish** (the primary audience is Latin American Q-graders). Keep label keys in English for code, but display strings should pass through `labelEs`.
- Keep `lib/scoring.ts` framework-free. No React imports, no DOM. It's the foundation for both the UI and any future CSV/PDF export.
