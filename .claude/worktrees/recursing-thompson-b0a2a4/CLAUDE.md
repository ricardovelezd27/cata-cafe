@AGENTS.md

# Cata Café — Project Guide for Claude

## What This Project Is

**Cata Café** is a professional coffee cupping evaluation platform for specialty coffee experts (catadores). It implements the SCA CVA (Specialty Coffee Association — Coffee Value Assessment) methodology, enabling structured sensory evaluations across three formats: Descriptive, Affective, and Combined. Users create cupping sessions, evaluate individual coffee samples cup-by-cup, and generate scored reports and PDF certificates.

Target users: coffee professionals conducting blind tastings in a lab or production environment.
Default language: Spanish (`es`). Secondary: English (`en`).

---

## Critical Warnings

### Next.js 16 — Breaking Changes
This project runs **Next.js 16.2.4**, which contains breaking API changes from 14/15. Before writing any Next.js-specific code (routing, layouts, middleware, server actions, caching), read the relevant guide in `node_modules/next/dist/docs/`. Do not assume any Next.js behavior from training data.

### Next.js 16 — Middleware File Name Is `proxy.ts` (NOT `middleware.ts`)
**Confirmed via build error:** Next.js 16 uses `proxy.ts` at the project root as the middleware file. The function must be exported as `proxy` (not `middleware`). If you create `middleware.ts`, the build will error: *"Both middleware file './middleware.ts' and proxy file './proxy.ts' are detected. Please use './proxy.ts' only."* The build output shows `ƒ Proxy (Middleware)` when correctly configured.

### Async Page Params
Page props always use `params: Promise<{ locale: string; id?: string }>`. Always `await params` before destructuring:
```ts
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  // ...
}
```

### Prisma Client Location
The generated Prisma client lives at `app/generated/prisma/` — **not** `@prisma/client`. Always import from the generated path:
```ts
import { PrismaClient } from "@/app/generated/prisma";
```
Never edit files in `app/generated/prisma/`. After any `schema.prisma` change, run:
```bash
npx prisma migrate dev
npx prisma generate
```

### Tailwind CSS 4
This project uses **Tailwind CSS v4** (PostCSS-based). There is no `tailwind.config.js` class safelist — Tailwind scans source files for class names. Do not generate class names dynamically via string concatenation.

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.4 |
| UI Runtime | React + React DOM | 19.2.4 |
| Language | TypeScript | 5 (strict) |
| ORM | Prisma + PrismaPg adapter | 7.7.0 |
| Database | PostgreSQL (via Supabase) | — |
| Auth | Supabase Auth (magic link OTP) | 2.104.0 |
| SSR Auth | @supabase/ssr | 0.10.2 |
| i18n | next-intl | 4.9.1 |
| Styling | Tailwind CSS 4 + PostCSS | 4 |
| Client State | Zustand | 5.0.12 |
| Charts | Recharts | 3.8.1 |
| PDF | @react-pdf/renderer | 4.5.1 |
| Primitives | Radix UI (dialog) | 1.1.15 |
| Icons | lucide-react | 1.8.0 |

---

## Project Structure

```
cata-cafe/
├── app/
│   ├── [locale]/                   # All routes are locale-prefixed
│   │   ├── app/                    # Authenticated routes
│   │   │   ├── layout.tsx          # Auth guard — redirects unauthenticated users
│   │   │   ├── page.tsx            # Dashboard (recent sessions + group badges)
│   │   │   ├── coffees/
│   │   │   │   ├── page.tsx        # Coffee list (public + owned)
│   │   │   │   └── [id]/page.tsx   # Coffee profile + tasting history
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx        # User profile management
│   │   │   │   └── history/page.tsx # Complete coffee tasting history
│   │   │   └── sessions/
│   │   │       ├── page.tsx        # Session list (own + joined sections)
│   │   │       ├── new/            # Create session wizard (two-step for group)
│   │   │       └── [id]/
│   │   │           ├── cup/        # Main cupping interface (CupClient)
│   │   │           ├── results/    # Scores & analysis (group tab for group sessions)
│   │   │           └── print/      # PDF export
│   │   ├── join/[token]/page.tsx   # Invite join page (outside /app/ — no auth guard)
│   │   ├── auth/login/             # Magic link login (supports ?next= redirect)
│   │   └── layout.tsx              # Locale layout (next-intl)
│   ├── actions/                    # Server actions (all mutations live here)
│   │   ├── auth.ts                 # signInWithMagicLink(formData, next?), signOut
│   │   ├── sessions.ts             # createSession, createGroupSession, upsertEvaluation, upsertPhysical, upsertExtrinsic
│   │   ├── community.ts            # submitEvaluation, closeSession, revealSample, joinViaToken, createInviteToken, syncCoffeeHistory
│   │   └── profile.ts              # Profile updates
│   ├── auth/callback/route.ts      # Supabase OAuth callback (reads ?next= param)
│   ├── generated/prisma/           # AUTO-GENERATED — DO NOT EDIT
│   └── layout.tsx                  # Root layout
├── components/
│   └── cupping/                    # All evaluation form components
│       ├── CupClient.tsx           # Orchestrator: sample navigation, tabs, auto-save, master controls, realtime
│       ├── CombinedForm.tsx        # Descriptive + affective dual form
│       ├── DescriptiveForm.tsx     # Intensity & sensory descriptors
│       ├── AffectiveForm.tsx       # 1–9 quality impressions
│       ├── PhysicalEvalForm.tsx    # Green bean assessment (defects, color, screen)
│       ├── ExtrinsicForm.tsx       # Post-reveal origin data entry
│       ├── FlavorTreeSelector.tsx  # Hierarchical flavor descriptor tree
│       ├── AffectiveScale.tsx      # 1–9 Likert scale component
│       ├── IntensitySlider.tsx     # 0–10 intensity slider
│       ├── DescriptorSelector.tsx  # Multi-select descriptor pills
│       ├── GustosSelector.tsx      # Predominant taste selection
│       ├── CupCheckboxes.tsx       # Per-cup defect/uniformity checkboxes
│       ├── NotesInput.tsx          # Free-text notes
│       └── Section.tsx             # Consistent section wrapper
├── lib/
│   ├── prisma.ts                   # Prisma singleton — always import from here
│   ├── scoring.ts                  # SCA CVA formula — do not reimplement
│   ├── constants.ts                # All cupping reference data
│   └── supabase/
│       ├── server.ts               # Server-side Supabase client (cookie-based)
│       └── admin.ts                # Service-role client — SERVER ONLY, never import from client components
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── migrations/                 # Versioned migrations
│   └── sql/rls_and_triggers.sql    # Supabase RLS policies & triggers — APPLY MANUALLY via Supabase SQL editor
├── i18n/
│   ├── routing.ts                  # Locale config: ["es", "en"], default "es"
│   └── request.ts                  # Per-request locale resolution
├── messages/
│   ├── es.json                     # Spanish translations (default)
│   └── en.json                     # English translations
├── proxy.ts                        # Middleware: session refresh + i18n routing (Next.js 16 — must be proxy.ts)
├── prisma.config.ts                # Prisma CLI config (reads .env.local)
└── next.config.ts                  # Next.js config with next-intl plugin
```

If needed you may consult the graph version of the structure for additional context. 
## Context Navigation (Graphify)

### 2-Layer Query Rule
1. **First:** query `graphify-out/graph.json` or `graphify-out/wiki/index.md`
   to understand code structure and connections
3. **Third:** only read raw code files when editing
   or when the first two layers don't have the answer

### When to rebuild the graph
- After structural changes (new modules, major refactors)
- Command: `graphify . --update` (only processes modified files)
- The graph is persistent — NO need to rebuild every session
- **Phase 2 was completed (2026-04-22)** — the graph was built on Phase 1 (69 files). Run `graphify . --update` to include Phase 2 additions before querying structure of new routes/actions.

### Plan as Context Cache
When a detailed implementation plan encodes all the codebase knowledge needed (file paths, schema, conventions), graphify queries during implementation become redundant. The highest-ROI time to use graphify in a multi-phase project is **during planning** — not during execution. If you receive a pre-built plan, use it as your context cache and skip graph queries for information the plan already contains.

### Do NOT
- Don't manually modify files inside `graphify-out/`
- Don't re-read the entire codebase if the graph already has the information

---

## Architecture & Conventions

### Locale-First Routing
Every app route lives under `[locale]`. Every page component must:
1. Call `setRequestLocale(locale)` as the first line (enables static rendering)
2. Export `generateStaticParams()` returning `[{ locale: "es" }, { locale: "en" }]`

### Server Components by Default
Pages and layouts are async RSC. Add `"use client"` only to components that use browser APIs, event handlers, or React state. Client components in `components/cupping/` receive data as props.

### Mutations via Server Actions
All writes go through `app/actions/`. Call `revalidatePath()` after mutations to invalidate the Next.js cache. Never write to the database from client components directly.

### Auto-Save in CupClient
`CupClient` debounces evaluation saves at 800ms. Do not add additional `revalidatePath` calls that would trigger a full re-render on every keystroke — the debounce exists to batch writes.

### Evaluation Data Shape
`descriptiveData`, `affectiveData`, and `combinedData` on the `Evaluation` model are stored as JSON (`Record<string, unknown>`). Do not flatten these into new columns — the flexible JSON structure is intentional to support dynamic attribute sets.

### Auth Pattern
- `requireUser()` helper in every server action — throws/redirects if unauthenticated
- Protected layout at `app/[locale]/app/layout.tsx` redirects to login
- Session stored in cookies via `@supabase/ssr`; refreshed by `proxy.ts` middleware on every request
- Auth is **magic link OTP only** — there are no passwords in this system
- `signInWithMagicLink(formData, next?)` threads `next` into `emailRedirectTo` → `/auth/callback?next=...` → callback at `app/auth/callback/route.ts` reads `?next=` and redirects there after auth. Used for invite links that require auth before joining.

### Group Sessions Pattern
- **`createSession`** (solo) uses `redirect()` inside — do not modify; it cannot return a value.
- **`createGroupSession`** is a separate action that returns `{ sessionId, inviteToken }` without redirecting, enabling the two-step wizard (Step 2 shows invite link).
- Invite tokens are `crypto.randomUUID()` stored in `SessionInvite`. `joinViaToken` uses `prisma.$transaction` to atomically increment `useCount` and upsert `SessionParticipant`, then redirects.
- `joinViaToken` uses `createAdminClient()` (service-role key) for the participant insert to bypass RLS, after validating the token server-side.

### Aggregate Scoring Pattern
- The **PostgreSQL trigger** `trg_recompute_aggregate` is the single source of truth for community scores. It fires `AFTER INSERT OR UPDATE OF "isDraft"` on `evaluations` when `isDraft=false` and writes to `aggregate_scores`.
- TypeScript `calcCommunityScore()` in `lib/scoring.ts` is **display-only** — never store its result.
- `prisma/sql/rls_and_triggers.sql` must be applied **manually** via the Supabase dashboard SQL editor. Prisma migrate does NOT apply triggers or functions.
- `attrAverages` JSONB column on `AggregateScore` is not populated by the v1 trigger — Phase 2.1 enhancement.

### Realtime (Group Sessions)
- Use `createBrowserClient` from `@supabase/ssr` in client components.
- Subscribe to `evaluations` table updates **without a filter string** to avoid Realtime filter length limits. Filter client-side by comparing `payload.new.session_sample_id` against a `Set` of the current session's sample IDs.
- Requires `ALTER TABLE evaluations REPLICA IDENTITY FULL` (in rls_and_triggers.sql) so UPDATE events include full row data.

### Admin Client (Service Role)
`lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY`. **Import only from server-side code** (server actions, API routes). Never import in client components or pages that render client-side.

### Form State Pattern
Cupping form components are fully controlled. State is lifted to `CupClient`, which orchestrates sample navigation, tab switching, and auto-save. Individual forms receive data and `onChange` callbacks as props.

### i18n Pattern
- Server components: `const t = await getTranslations("section")`
- Client components: receive translations as props (a `translations` object) — do not call `useTranslations()` inside components that are passed as children to server-rendered layouts
- All reference data in `lib/constants.ts` uses Spanish labels; UI strings use the translation system

---

## Database Schema (Key Models)

| Model | Purpose |
|---|---|
| `Profile` | User account (id = Supabase user UUID) |
| `CuppingSession` | A cupping event (format, date, status, isGroup, isAsync, closesAt) |
| `SessionSample` | A coffee sample within a session (position, label, revealed, coffeeId) |
| `Evaluation` | A cupper's score for one sample (JSON data + computed scores, isDraft, submittedAt) |
| `PhysicalEvaluation` | Green bean assessment for a sample (pre-reveal) |
| `ExtrinsicData` | Origin/processing info revealed post-tasting |
| `Coffee` | Coffee product reference data |
| `SessionParticipant` | Links a user to a group session (status: "invited"\|"joined"\|"owner") |
| `AggregateScore` | Trigger-computed community score for a sample (one per SessionSample) |
| `UserCoffeeHistory` | Per-user record of coffees tasted with individual + community scores |
| `SessionInvite` | Invite token for joining a group session (maxUses, expiresAt) |

**Cascade deletes:** Deleting a `SessionSample` cascades to `Evaluation`, `PhysicalEvaluation`, `ExtrinsicData`, and `AggregateScore`. Deleting a `CuppingSession` cascades to `SessionParticipant` and `SessionInvite`.

**Always use** the Prisma singleton at `lib/prisma.ts` — never instantiate `PrismaClient` directly.

---

## Scoring System

The SCA CVA scoring formula is implemented in `lib/scoring.ts`. **Do not reimplement it.**

### Individual Score (per cupper)
```
S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
```
- `hᵢ` — final value (1–9) for each of 8 affective attributes
- `u` — non-uniform cups (penalized only when ≥5 cups per sample)
- `d` — defective cups (penalized only when ≥5 cups per sample)

Functions: `calcAffectiveSum()`, `calcRawScore()`, `calcIndividualScore()` — all exported from `lib/scoring.ts`.

### Community Score (group sessions — trigger-authoritative)
```
uniformityPenalty = totalNonUniform × (10 / totalCups)
defectPenalty     = totalDefective  × (30 / totalCups)
communityScore    = avgRawScore − uniformityPenalty − defectPenalty
```
- `totalNonUniform` — cups marked non-uniform but NOT defective (non-overlapping)
- `totalDefective` — cups marked defective only
- `totalCups` = `cupsPerSample × participantCount`
- Computed by PostgreSQL trigger `trg_recompute_aggregate` on `evaluations` table; written to `aggregate_scores`
- TypeScript function `calcCommunityScore()` in `lib/scoring.ts` is **display-only** — trigger result is authoritative

Verification: 2 participants, cupsPerSample=5, 1 uOnly cup → uniformityPenalty = 1×(10/10) = 1.0 ✓

---

## Reference Data

All cupping reference data is in `lib/constants.ts` (Spanish-labeled):

- `FLAVOR_TREE` — 8 flavor families with hierarchical sub-descriptors
- `ACIDITY_DESCRIPTORS`, `SWEETNESS_DESCRIPTORS`, `MOUTHFEEL_DESCRIPTORS`
- `GUSTOS_PREDOMINANTES` — 5 basic tastes
- `AFFECTIVE_ATTRIBUTES` — 8 scored attributes (Fragancia, Aroma, Sabor, etc.)
- `AFFECTIVE_LABELS` — 9-point scale labels
- `CAT1_DEFECTS`, `CAT2_DEFECTS` — green bean defect categories with ratios
- `GREEN_COLORS`, `SCREEN_SIZES`, `PROCESS_TYPES`, `CERTIFICATIONS`

---

## Styling

- **Tailwind CSS 4** — PostCSS-based, no `tailwind.config.js` safelist
- Custom color tokens (defined in CSS globals, referenced via Tailwind):
  - `green-dark` (#3D5A3E) — primary actions
  - `brown-dark / brown-mid / brown-light` — typography & borders
  - `red-defect` (#A83232) — defect highlighting
  - `cream` — subtle backgrounds
  - `amber-warm` — affective/secondary accents
  - Page background: `#FDFBF7`
- Use **Radix UI** for accessible overlays and dialogs
- Use **lucide-react** for all icons

---

## Dev Commands

```bash
npm run dev                  # Dev server → http://localhost:3000
npm run build                # Production build
npm run lint                 # ESLint

npx prisma migrate dev       # Apply pending migrations
npx prisma generate          # Regenerate client after schema change
npx prisma studio            # GUI DB explorer
```

---

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # Used by lib/supabase/admin.ts — never expose to client
DATABASE_URL=                 # Supabase connection pooler URL
```

---

## Supabase Manual Steps

Changes that Prisma migrate does NOT handle must be applied manually via the **Supabase Dashboard → SQL Editor**:

- RLS policies and policy updates
- Trigger functions (`recompute_aggregate_score`, etc.)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE ... REPLICA IDENTITY FULL`

These are all collected in `prisma/sql/rls_and_triggers.sql`. Append new blocks to that file and apply the new block manually each time.
