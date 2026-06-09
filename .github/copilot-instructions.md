# Cata Café — AI Coding Instructions

This file provides context for AI coding tools (GitHub Copilot, Claude, etc.) working on this codebase.

---

## Project Overview

**Cata Café** is a professional SCA CVA coffee cupping evaluation platform for specialty coffee experts. It implements the Coffee Value Assessment methodology with structured sensory evaluations, group sessions, real-time collaboration, and PDF export.

- **Framework:** Next.js 16.2.4 (App Router) — has breaking API changes; check `node_modules/next/dist/docs/` before any Next.js-specific code
- **Language:** TypeScript strict, React 19
- **Database:** PostgreSQL via Supabase + Prisma ORM
- **Auth:** Magic link OTP only (no passwords)
- **i18n:** next-intl, default locale `es`, all routes under `[locale]`
- **Styling:** Tailwind CSS v4 (PostCSS), CSS Modules for components

## Critical Rules

- Middleware file is `proxy.ts` (NOT `middleware.ts`) — function exported as `proxy`
- Prisma client: import from `@/app/generated/prisma` (not `@prisma/client`)
- Page params are async: always `const { locale, id } = await params`
- Never import `lib/supabase/admin.ts` in client components
- Never generate Tailwind class names dynamically (string concat) — Tailwind v4 scans statically
- All mutations go through `app/actions/` server actions, not direct DB calls from client
- Never import `lib/offline/store.ts` (localforage/IndexedDB) from a Server Component or server action — it is client-only and no-ops on the server
- Offline drafts replay through `app/actions/offline.ts` on reconnect: keep Prisma `cupperId` scoping (no raw Supabase selects), and never mutate `isDraft`/`submittedAt` during replay

---

## Design Context

### Users
Q-graders and trained cuppers conducting SCA CVA evaluations in a lab or production environment. Primary audience: Latin American specialty coffee professionals. Default language: Spanish.

### Brand Personality
**Auténtico · Profesional · Refinado**

A serious tool for credentialed professionals. It doesn't condescend or over-explain. It trusts the user.

### Emotional Goal
**Data clarity.** Users should always know exactly where they stand — scores, progress, group submissions. Quiet confidence: *I trust this tool completely.*

### Aesthetic Direction
Reference: Headspace + Linear — calm, spacious, intentional. Every element earns its place. The UI steps back so the coffee and scores step forward.

Light mode only. Warm parchment background (#FDFBF7). Typography-forward: Cormorant Garamond for display, Inter for UI, JetBrains Mono for data.

### Design Principles

1. **Data speaks first** — Scores are always the visual hero.
2. **Trust through precision** — Tabular numerics, exact values, unambiguous states.
3. **Craft without decoration** — Richness through type and color, not illustration.
4. **Calm before complexity** — Spacious, sequenced. Collapse what isn't needed now.
5. **Spanish first, always** — Language and metaphors rooted in coffee culture.

### Color Tokens

| Token | Value | Use |
|---|---|---|
| `--color-green-dark` | `#3D5A3E` | Primary actions, headings |
| `--color-green-mid` | `#6B8F71` | Secondary, slider fills |
| `--color-amber` | `#C17817` | Scores ≥7, quality highlights |
| `--color-bg` | `#FDFBF7` | Page background |
| `--color-cream` | `#F5F0E6` | Cards, surfaces |
| `--color-brown-dark` | `#5C4A32` | Body text |
| `--color-brown-mid` | `#8B7355` | Secondary text, captions |
| `--color-brown-light` | `#E8E0D0` | Borders |
| `--color-red-defect` | `#A83232` | Defects only — never decorative |

### Typography
- Display: `--font-display` (Cormorant Garamond) — score numerals, headings
- UI: `--font-ui` (Inter) — labels, buttons, body
- Mono: `--font-mono` (JetBrains Mono) — measurements, captions, formulas

### Atomic Components (`components/ui/`)

| Component | Purpose |
|---|---|
| `IntensitySlider` | 0–15 descriptive intensity |
| `AffectiveBubbles` | 1–9 hedonic scale |
| `CATAPills` | Multi-select flavor CATA pills |
| `CupIndicators` | Cup uniformity/defect status |
| `ScoreDisplay` | CVA score card with breakdown |

Other feature surfaces: `components/offline/` (OfflineBanner, SyncConflictModal, OfflineFirstLoadError), `components/onboarding/` (WelcomeModal), `components/results/` (ScoreTable, SampleRadarChart, descriptor frequency).

All new UI components go in `components/ui/` as CSS Modules. No inline styles in new work.

### What Not To Do
- Don't use `red-defect` decoratively
- Don't add inline styles to new components
- Don't create `middleware.ts` (use `proxy.ts`)
- Don't import Prisma directly (use `lib/prisma.ts`)
- Don't add `revalidatePath` inside debounced auto-save logic

---

*Full design system: see `DESIGN.md`. Full product context: see `PRODUCT.md`. Design context detail: see `.impeccable.md`.*
