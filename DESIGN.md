# Cata Café — Design System Reference

> The single source of truth for visual and interaction design decisions.
> Last updated: 2026-05-05

---

## Design Principles

1. **Data speaks first.** Scores and evaluation data are always the visual hero. Typography and spacing serve legibility above everything else. Never bury a number.

2. **Trust through precision.** Exact values, consistent rounding, tabular numerics (JetBrains Mono). Nothing ambiguous. If it's 83.25, show 83.25.

3. **Craft without decoration.** The earthy palette and serif typography reference specialty coffee craft. Achieve richness through type and color — not illustration, texture, or ornament.

4. **Calm before complexity.** The CVA protocol is cognitively demanding. The interface must be spacious and sequenced to protect the user's focus. One thing at a time. Collapse what isn't needed now.

5. **Spanish first, always.** Language, labels, and units are rooted in Latin American specialty coffee culture. Translations exist; Spanish is the design language.

---

## Color Palette

All tokens are defined as CSS custom properties in `app/globals.css` and exposed as Tailwind utilities via `@theme inline`.

### Brand Greens

| Token | Value | Tailwind Class | Use |
|---|---|---|---|
| `--color-green-dark` | `#3D5A3E` | `text-green-dark`, `bg-green-dark` | Primary actions, headings, locked states |
| `--color-green-mid` | `#6B8F71` | `text-green-mid`, `bg-green-mid` | Slider fills, cup uniform state, fresh accents |
| `--color-green-light` | `#B4C8A8` | `text-green-light`, `bg-green-light` | Subtle highlights, hover states |

### Warm Accent

| Token | Value | Tailwind Class | Use |
|---|---|---|---|
| `--color-amber` | `#C17817` | `text-amber`, `bg-amber` | Affective scores ≥7, non-uniform badges, quality emphasis |

> **Rule:** Amber is a quality signal, not a warning. It means "notably good." Use red-defect for problems.

### Surface Palette

| Token | Value | Tailwind Class | Use |
|---|---|---|---|
| `--color-bg` | `#FDFBF7` | `bg-bg` | Page background (parchment) |
| `--color-cream` | `#F5F0E6` | `bg-cream` | Elevated surfaces, form backgrounds, cards |
| `--color-white` | `#FFFFFF` | `bg-white` | Modal backgrounds, high-contrast surfaces |

### Browns (Text & Structure)

| Token | Value | Tailwind Class | Use |
|---|---|---|---|
| `--color-brown-dark` | `#5C4A32` | `text-brown-dark` | Body text, primary labels, headings |
| `--color-brown-mid` | `#8B7355` | `text-brown-mid` | Secondary text, captions, section labels, icons |
| `--color-brown-light` | `#E8E0D0` | `border-brown-light` | Hairline borders, dividers, input borders |

### Status

| Token | Value | Tailwind Class | Use |
|---|---|---|---|
| `--color-red-defect` | `#A83232` | `text-red-defect`, `bg-red-defect` | Defective cups, defect indicators — **never decorative** |

### Flavor Family Colors

Used only in `CATAPills` and flavor-family labels. Do not use elsewhere.

| Family | Color |
|---|---|
| Floral | `#C17817` |
| Frutal | `#E8834A` |
| Dulce | `#B4874E` |
| Ácido/Fermentado | `#A83232` |
| Verde/Vegetal | `#6B8F71` |
| Nueces/Cacao | `#8B7355` |
| Especia | `#9B6B4A` |
| Tostado | `#5C4A32` |
| Otro | `#7A6E5F` |

### Score Band Colors

| Score | Band | Background tint | Badge color |
|---|---|---|---|
| ≥ 85 | Green | `color-mix(in oklch, green-mid 14%, bg)` | `green-dark` |
| 75–84 | Amber | `color-mix(in oklch, amber 10%, bg)` | `amber` |
| < 75 | Red | `color-mix(in oklch, red-defect 9%, bg)` | `red-defect` |

---

## Typography

### Font Stack

| Role | Font | Token | Tailwind |
|---|---|---|---|
| Display / Editorial | Cormorant Garamond | `--font-display` | `font-display` |
| UI / Body | Inter | `--font-ui` | `font-ui`, `font-sans` |
| Mono / Data | JetBrains Mono | `--font-mono` | `font-mono` |

Loaded via Google Fonts at the top of `globals.css`.

### Type Scale & Usage

| Role | Font | Size | Weight | Color | Notes |
|---|---|---|---|---|---|
| Page title | Display | 30px / text-3xl | 500 | green-dark | `font-display leading-tight` |
| Section heading | Display | 20px / text-xl | 500 | green-dark | |
| Card heading | Display | 16px | 500 | brown-dark | |
| Section label (uppercase) | Mono | 10–11px | 500–600 | brown-mid | `uppercase letter-spacing: 0.18em` |
| Body text | UI | 14px | 400 | brown-dark | `line-height: 1.5` |
| Label | UI | 13px | 500 | brown-dark | |
| Caption / meta | Mono | 10–11px | 500 | brown-mid | |
| Score numeral | Display | 88px | 500 | brown-dark | `tabular-nums line-height: 0.95` |
| Score decimal | Display | 56px | 500 | brown-mid | Italic, `margin-left: -6px` for tight spacing |
| Bubble numeral | Display | 19px | 600 | brown-dark | `tabular-nums` |

### Rules
- All numeric readouts use `font-variant-numeric: tabular-nums` (use `.mono` class or `font-mono`)
- Headings have `margin: 0` by default (set in globals.css)
- Serif italic (`.display-italic`) is reserved for score decimals and editorial emphasis only

---

## Spacing Scale

8px base. Use CSS custom properties in CSS Modules; use Tailwind spacing utilities in JSX.

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

---

## Border Radius

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--radius-pill` | `9999px` | `rounded-pill` | Pills, tags, badges |
| `--radius-card` | `12px` | `rounded-card` | Cards, section containers |
| `--radius-input` | `8px` | `rounded-input` | Inputs, buttons, small interactive elements |

---

## Shadows

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.06)` | `shadow-card` | Standard card elevation |
| `--shadow-card-lg` | `0 8px 24px rgba(92,74,50,0.10), 0 2px 6px rgba(92,74,50,0.05)` | `shadow-card-lg` | Modal, focused card |
| `--shadow-inset` | `inset 0 1px 2px rgba(92,74,50,0.06)` | `shadow-inset` | Input fields, inset surfaces |

---

## Motion

| Token | Value | Use |
|---|---|---|
| `--transition-fast` | `150ms ease` | Color/border state changes, hover effects |
| `--transition-med` | `240ms cubic-bezier(0.2, 0.8, 0.2, 1)` | Layout transitions, panel open/close |

**Animation:** `@keyframes phase-in` — `opacity 0→1` + `translateY 8px→0`. Use for page/section entry.

**Rules:**
- Do not animate score numbers (instant swap)
- Do not animate box-shadow as a length/transform
- Keep animations subtle — the user is concentrating on sensory evaluation

---

## Atomic Components (`components/ui/`)

All components are **controlled** — state lives in the parent (`CupClient` / Zustand store).

### `IntensitySlider`
**File:** `IntensitySlider.tsx` + `IntensitySlider.module.css`
**Purpose:** 0–15 linear intensity scale for descriptive attributes.

```tsx
<IntensitySlider
  value={value}           // number | null
  onChange={setValue}     // (v: number) => void
  label="Fragancia"
  disabled={false}
  min={0} max={15} step={0.5}
/>
```

- Track: 8px, cream bg, brown-light border, pill radius
- Fill: green-mid, green-dark border
- Thumb: 22px circle, green-dark border, inner dot
- Value display: Cormorant Garamond 24px/600, green-dark; `/15` suffix in mono 10px
- Empty state: "Sin marcar" italic, desaturated thumb
- Anchors: `0 LOW`, `5`, `10 MEDIUM`, `15 HIGH`

---

### `AffectiveBubbles`
**File:** `AffectiveBubbles.tsx` + `AffectiveBubbles.module.css`
**Purpose:** 1–9 hedonic scale for affective scoring.

```tsx
<AffectiveBubbles
  value={value}           // number | null
  onChange={setValue}     // (v: number) => void
  label="Acidez"
  showFinal={true}
/>
```

- 9 circles, 44×44px, Cormorant Garamond 19px/600
- Selected color by value: `n ≥ 7` → amber, `n ≤ 3` → red-defect, else → green-dark
- FINAL readout box (right end): green-dark when set, amber "FINAL" cap
- Scale legend: `AFFECTIVE_LABELS[1]` / `[5]` / `[9]` in mono 9px
- Container-query responsive: shrinks at ≤440px, hides final box at ≤360px

---

### `CATAPills`
**File:** `CATAPills.tsx` + `CATAPills.module.css`
**Purpose:** Multi-select CATA (Check All That Apply) for flavor families.

```tsx
<CATAPills
  options={FLAVOR_FAMILIES}    // readonly CATAOption[]
  selected={selected}          // string[]
  onChange={setSelected}       // (next: string[]) => void
  maxSelect={5}
  showSubItems={true}
/>
```

- Each option has `id`, `label`, `color`, `subItems?`
- Unselected: outlined in `option.color`, soft color fill
- Selected: solid `option.color` fill, white text
- At-limit: unselected pills get `opacity: 0.45`
- Sub-items appear indented below parent when `showSubItems && selected`

---

### `CupIndicators`
**File:** `CupIndicators.tsx` + `CupIndicators.module.css`
**Purpose:** Per-sample cup status row.

```tsx
<CupIndicators
  totalCups={5}
  nonUniform={[2]}                           // cup numbers
  defective={[{ cup: 4, type: 'moldy' }]}
  showSummary={true}
/>
```

- Uniform: green-mid bg, green-dark border, white digit
- Non-uniform: bg, amber border + digit, `≠` superscript badge
- Defective: red-defect bg, `×` glyph, defect badge below (`POTATO` / `MOLDY` / `PHENOLIC`)
- Summary row: mono 10–11px with Cormorant numerals

---

### `ScoreDisplay`
**File:** `ScoreDisplay.tsx` + `ScoreDisplay.module.css`
**Purpose:** Final CVA score card with formula breakdown.

```tsx
<ScoreDisplay
  sectionScores={[7, 7, 8, 7, 8, 7, 7, 8]}  // 8 values, 1–9
  nonUniformCups={0}
  defectiveCups={0}
  expandable={true}
  defaultExpanded={false}
/>
```

- Score numeral: Cormorant Garamond 88px/500, tabular-nums
- Band label (top-right): mono 9.5px/700, white text on score-color bg
- Formula `<dl>`: 2-column grid, mono 11.5px; `Σhᵢ` in green-dark, penalties in red-defect
- Expandable section list: 8 rows with `labelEs` + score
- Responsive: compact at ≤480px (60px numeral, single-column formula)

---

## Component Conventions (existing `components/cupping/`)

Legacy components in `components/cupping/` use inline styles with hardcoded hex values. These will be migrated to CSS Modules in Phase 3. Do not add new inline-style components — all new work goes through `components/ui/`.

### `Section` wrapper pattern
```tsx
<Section title="Fragancia" collapsible defaultOpen>
  {/* content */}
</Section>
```
- Cream bg (#FDFBF7), brown-light border, 12px radius, 14px padding
- Title: uppercase, green-dark, Cormorant Garamond 14px/700

---

## Icon Usage

**Library:** `lucide-react` — the only icon set used.

- Default color: `--color-brown-mid` for decorative icons
- Action icons: `--color-green-dark` or inherit parent color
- Status icons: use appropriate status color
- Size: 16px (inline), 20px (standalone buttons)

---

## Layout Patterns

### Page structure
```
[locale]/app/
├── layout.tsx          ← Auth guard, no layout chrome
└── sessions/[id]/
    └── cup/page.tsx    ← Full-height, no sidebar
```

Every page component must:
1. `await params` before destructuring (Next.js 16 async params)
2. Call `setRequestLocale(locale)` as first line
3. Export `generateStaticParams()` returning `[{ locale: 'es' }, { locale: 'en' }]`

### Card
```html
<div class="bg-white border border-brown-light rounded-card shadow-card p-4">
```

### Section container (new design system)
```html
<div class="bg-cream border border-brown-light rounded-card p-4 mb-3">
  <h3 class="font-display text-sm font-bold text-green-dark uppercase tracking-wide">
    Fragancia
  </h3>
</div>
```

---

## Accessibility

- `.sr-only` utility for visually hidden but accessible text (defined in `globals.css`)
- All interactive elements have `aria-label` or visible label
- `aria-pressed` on toggle buttons (bubbles, pills)
- `font-variant-numeric: tabular-nums` for all score/count displays (prevents layout shift)
- Color is never the sole carrier of meaning (status also uses text/icons)
- Reduced motion: components use CSS `transition` not JS animation; respects `prefers-reduced-motion` implicitly via short durations

---

## What Not To Do

| ❌ Don't | ✅ Do instead |
|---|---|
| Use `red-defect` decoratively | Reserve it strictly for cup defects |
| Generate Tailwind class names dynamically (string concat) | Use full static class names |
| Add inline styles to new components | Use CSS Modules in `components/ui/` |
| Import `PrismaClient` directly | Import from `lib/prisma.ts` singleton |
| Import `admin.ts` in client components | Server actions / API routes only |
| Add `revalidatePath` inside debounced auto-save | Auto-save is already debounced at 800ms |
| Use `middleware.ts` | Middleware is `proxy.ts` (Next.js 16) |
| Access `params` without `await` | Always `const { locale } = await params` |
