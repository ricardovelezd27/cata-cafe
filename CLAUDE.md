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
| Offline storage | localforage (IndexedDB) | 1.10.0 |
| Flavor search | Fuse.js (fuzzy typeahead) | 7.4.2 |
| Animation | GSAP (marketing landing only) | 3.15.0 |

---

## Project Structure

```
cata-cafe/
├── app/
│   ├── [locale]/                   # All routes are locale-prefixed
│   │   ├── page.tsx                # Public marketing landing page (es default, /en secondary)
│   │   ├── app/                    # Authenticated routes
│   │   │   ├── layout.tsx          # Auth guard — redirects unauthenticated users
│   │   │   ├── page.tsx            # Dashboard (DashboardIntro + recent sessions + group badges)
│   │   │   ├── coffees/
│   │   │   │   ├── page.tsx        # Coffee list (public + owned)
│   │   │   │   └── [id]/page.tsx   # Coffee profile + tasting history
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx        # User profile management
│   │   │   │   └── history/page.tsx # Complete coffee tasting history
│   │   │   ├── team/page.tsx       # Team / participants view
│   │   │   └── sessions/
│   │   │       ├── page.tsx        # Session list (own + joined sections)
│   │   │       ├── new/            # Create session wizard (two-step for group)
│   │   │       └── [id]/
│   │   │           ├── cup/        # Main cupping interface (CupClient)
│   │   │           ├── waiting/    # Pre-start waiting room (group/async sessions)
│   │   │           ├── results/    # 3-tab shell — Resumen (dashboard) / Resultados (Tabla·Gráfico) / Descriptores
│   │   │           └── print/      # PDF export
│   │   ├── join/[token]/page.tsx   # Invite join page (outside /app/ — no auth guard)
│   │   ├── auth/login/             # Magic link login (supports ?next= redirect)
│   │   └── layout.tsx              # Locale layout (next-intl)
│   ├── actions/                    # Server actions (all mutations live here)
│   │   ├── auth.ts                 # signInWithMagicLink(formData, next?), signOut
│   │   ├── sessions.ts             # createSession, createGroupSession, updateSession, deleteSession,
│   │   │                           #   addSessionSample/renameSessionSample/removeSessionSample (owner, guarded),
│   │   │                           #   upsertEvaluation/upsertPhysical/upsertExtrinsic (member-gated), updateSampleMetadata
│   │   ├── community.ts            # submitAllEvaluations (+ solo auto-close), closeSession, revealSample,
│   │   │                           #   joinViaToken, createInviteToken, setParticipantExclusion, refreshAggregateScores
│   │   ├── coffees.ts              # createCoffee, updateCoffee, deleteCoffee, visibility/sharing/invites
│   │   ├── groups.ts               # createGroupWithMembers, updateGroup, deleteGroup, roster (add/remove/rename/resend),
│   │   │                           #   leaveGroup (member), GroupPost feed (create/update/delete), email blasts
│   │   ├── offline.ts              # Conflict-aware replay of offline evaluation drafts on reconnect
│   │   ├── profile.ts              # Profile updates, completeOnboarding
│   │   ├── waitlist.ts             # Landing-page waitlist signup
│   │   └── dev.ts                  # Dev-only helpers (seed/inspect)
│   ├── auth/callback/route.ts      # Supabase OAuth callback (reads ?next= param)
│   ├── generated/prisma/           # AUTO-GENERATED — DO NOT EDIT
│   └── layout.tsx                  # Root layout
├── components/
│   ├── cupping/                    # Evaluation form components (lifted state, controlled by CupClient)
│   │   ├── CombinedForm.tsx        # Descriptive + affective dual form
│   │   ├── DescriptiveForm.tsx     # Intensity & sensory descriptors
│   │   ├── AffectiveForm.tsx       # 1–9 quality impressions
│   │   ├── PhysicalEvalForm.tsx    # Green bean assessment (defects, color, screen)
│   │   ├── ExtrinsicForm.tsx       # Post-reveal origin data entry
│   │   ├── FlavorPicker.tsx        # Flavor-wheel selector: predictive typeahead (Fuse.js) + browsable modal
│   │   └── PhaseStepper.tsx        # Phase/step progress indicator
│   │   # NOTE: CupClient.tsx lives at app/[locale]/app/sessions/[id]/cup/CupClient.tsx —
│   │   #       it is the orchestrator (sample nav, tabs, auto-save, master controls, realtime)
│   ├── ui/                         # Atomic design system (replaced old per-form widgets):
│   │   #   IntensitySlider, AffectiveBubbles, CATAPills, CupIndicators/CupToggleGrid,
│   │   #   ScoreDisplay, MasterControls, SampleTabs, SessionShell, ResponsiveDialog, Notes…
│   │   #   PLUS the shared list/CRUD kit (2026-08 cohesion overhaul):
│   │   #   Button/ButtonLink, DataTable (sort/search/facets/pagination, desktop table + mobile cards),
│   │   #   Badge/StatusPill/ScorePill, PageHeader, SearchInput, Select, EmptyState,
│   │   #   Pagination, FilterBar, ConfirmDialog — ALWAYS reuse these for list pages,
│   │   #   status/score pills, page headers, and delete confirmations.
│   ├── results/                    # ScoreTable, SampleRadarChart, DescriptorFrequency, WordCloud, FlavorCloud,
│   │   #   CupperAlignment, ExtrinsicSummary, chartColors (Recharts palette, MD3-derived hex),
│   │   #   SampleDetail/SampleDetailDialog (personal per-sample drill-down),
│   │   #   OwnerParticipantSection (owner CVA matrix + exclusion toggle),
│   │   #   ScoreBreakdownPanel ("¿Cómo se calculó?" — typed t prop, no private LABELS dict).
│   │   #   MyResultsSummary/IndividualResultsPanel DELETED (2026-08 results redesign);
│   │   #   folded into ResumenTab (dashboard) + OwnerParticipantSection (owner matrix).
│   │   # The results ROUTE (app/[locale]/app/sessions/[id]/results/) owns the 3-tab
│   │   #   shell: ResultsClient.tsx (tabs, docked header/footer, drill-down state),
│   │   #   ResumenTab.tsx (dashboard), DescriptoresTab.tsx (filters + cloud + frequency +
│   │   #   alignment). The Resultados tab has no separate file — its Tabla/Gráfico
│   │   #   sub-view is inline JSX in ResultsClient.tsx.
│   ├── landing/                    # Marketing landing sections (Hero, Pricing, Roadmap, WaitlistForm, ScrollFx…)
│   ├── offline/                    # OfflineBanner, SyncConflictModal, OfflineFirstLoadError
│   ├── onboarding/                 # WelcomeModal, OnboardingWrapper (role/country capture)
│   └── layout/, dashboard/         # App shell + dashboard widgets (DashboardIntro, StatCard, FormatBadge)
├── hooks/
│   ├── useConnectivity.ts          # Online/offline detection
│   └── useOfflineSync.ts          # Drains offline draft queue on reconnect
├── lib/
│   ├── prisma.ts                   # Prisma singleton — always import from here
│   ├── scoring.ts                  # SCA CVA formula — do not reimplement
│   ├── sessionAuth.ts              # requireSessionOwner/Member + requireSampleOwner/Member — THE authz gate
│   │                               #   (Prisma runs as postgres and bypasses RLS; these TS checks are the real gate)
│   ├── sessionRouting.ts           # sessionHref() — where clicking a session goes (closed→results, etc.). Never hardcode /cup in lists.
│   ├── coffeeHistory.ts            # syncCoffeeHistoryForSession() — plain lib fn, callers must authorize first
│   ├── evaluation.ts               # Derived-score computation shared by live + offline paths
│   ├── constants.ts                # All cupping reference data (FLAVOR_WHEEL, attributes, defects…)
│   ├── descriptors.ts              # Descriptor helpers + unmapped-note resolution
│   ├── flavorSearch.ts             # Fuse.js predictive search over FLAVOR_WHEEL (powers FlavorPicker)
│   ├── offline/
│   │   ├── store.ts                # localforage/IndexedDB draft store — CLIENT ONLY, SSR-safe (no-ops on server)
│   │   └── types.ts                # Offline blob + sync-status types
│   └── supabase/
│       ├── client.ts               # Browser client (Realtime + offline)
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

## Codebase Navigation

Use the native search tools (Grep, Glob, Read) as the primary way to explore this
codebase — they are fast, always reflect the current source, and integrate with the
editor. The structure documented above plus these tools is sufficient for almost all
work here.

> **Overrides global config:** Any global instruction to "query the knowledge graph
> first / avoid reading raw files" does **not** apply to this project. We evaluated the
> graphify integration on this 123-file codebase and found it added little over native
> tools while introducing staleness risk, so it is **not** part of the default workflow.
> A `graphify-out/` graph may exist on disk (gitignored) and the `/graphify` skill is
> available for deliberate, manual use, but treat any graph output as possibly stale and
> verify against the actual source before relying on it. Do not query the graph by
> default and do not auto-rebuild it.

---

## Architecture & Conventions

### Locale-First Routing
Every app route lives under `[locale]`. Every page component must:
1. Call `setRequestLocale(locale)` as the first line (enables static rendering)
2. Export `generateStaticParams()` returning `[{ locale: "es" }, { locale: "en" }]` — **but ONLY on routes whose sole dynamic segment is `[locale]`**.

**EXCEPTION — authed pages with an extra dynamic segment (`[id]`, `[token]`):** do NOT export `generateStaticParams` (not even returning `[]`). With it present, production attempts on-demand static generation and the `cookies()` call inside the Supabase client crashes the route with a 500 — while dev renders dynamically and hides the bug. Instead export `export const dynamic = "force-dynamic";` (see `app/[locale]/join/[token]/page.tsx`, `app/[locale]/app/groups/[id]/page.tsx`). This caused a real production outage on 2026-07-21 (groups/[id] and coffees/[id] returned 500 for every user).

### Server Components by Default
Pages and layouts are async RSC. Add `"use client"` only to components that use browser APIs, event handlers, or React state. Client components in `components/cupping/` receive data as props.

### Mutations via Server Actions
All writes go through `app/actions/`. Call `revalidatePath()` after mutations to invalidate the Next.js cache. Never write to the database from client components directly.

### Server Action Contract (2026-09 error-handling foundation)
- A thrown error inside a server action reaches the browser as an **opaque digest** in production. So every action that a client component calls **interactively** (button, toggle, dialog, form) must return `ActionResult<T>` (`lib/actionResult.ts`: `{ ok: true, data } | { ok: false, error: ActionErrorCode }`) by wrapping its body in `run("actionName", async () => { … }, { userId, sessionId })` from `lib/safeAction.ts`. `run()` lets `redirect()`/`notFound()` through (`unstable_rethrow`), maps the known thrown codes (`not_authenticated`, `not_found_or_forbidden`, `session_closed`, `token_*`, `coffee_not_usable`, `invalid_input`) and Prisma `P2002 → conflict`, `P2025 → not_found`, `P2003 → invalid_reference`, and logs everything else as `unknown`. Keep throwing `Error("<code>")` INSIDE the body — that is the mechanism, not a smell.
- Actions only called from server pages, or already wrapped by `ConfirmDialog`, may keep throwing. Reference conversion: `completeOnboarding` in `app/actions/profile.ts`.
- **Client side**: never `startTransition(async () => { await action() })` bare. Use `const feedback = useActionFeedback()` (`components/ui/Toast.tsx`, provider mounted in `app/[locale]/layout.tsx`) and `feedback.run(action(...), onOk)` — it toasts the localized copy for `errors.codes.<code>` on failure. Actions that still throw are wrapped in try/catch → `feedback.notifyError("unknown")`. Plain `<form action>` pages use React 19 `useActionState` with a `(prev, formData)` action (see `components/join/*Form.tsx`).
- Copy for every `ActionErrorCode` lives in `messages/*.json` under `errors.codes`; adding a code means adding both translations.

### Validation
- `lib/validate.ts` (`str`, `int`, `oneOf`, `isoDate`, `list`, `email`, `cupFlags`) — no zod. Every client-posted string/number/enum/date/array goes through one of these before Prisma; they throw `invalid_input` (mapped by `run()`), or the caller translates to its own code (the session wizard's `validateSessionMeta` → `session.newForm.errors.*`).
- **Scoring inputs are never taken from the client**: `upsertEvaluation` and `syncEvaluation` read `cupsPerSample` and `format` from the session row (`requireSample*` return them) and derive the JSON column via `moduleKeyForFormat`; `computeEvaluationDerived` clamps the cup arrays with `cupFlags`. The `cupsPerSample` / `moduleKey` fields in those inputs are kept for API compatibility and ignored.

### Logging
- `lib/log.ts` (`logError` / `logWarn` / `logInfo`) writes one JSON line per event so Vercel Logs can be searched by `digest`, `action`, `sessionId`. `run()` logs unknown action failures; `instrumentation.ts` logs render/route failures with the same shape.
- **Log**: action name, error code, digest, ids (userId/sessionId/coffeeId/groupId), the route template, locale, and `message` only for `unknown`. **Never log**: request headers/cookies, concrete `/join/*` or `/auth/*` paths (tokens — use `redactPath`), emails, display names, form bodies, evaluation payloads, AI prompts.

### Auto-Save in CupClient
`CupClient` debounces evaluation saves at 800ms. Do not add additional `revalidatePath` calls that would trigger a full re-render on every keystroke — the debounce exists to batch writes.

### Evaluation Data Shape
`descriptiveData`, `affectiveData`, and `combinedData` on the `Evaluation` model are stored as JSON (`Record<string, unknown>`). Do not flatten these into new columns — the flexible JSON structure is intentional to support dynamic attribute sets.

### Auth Pattern
- `requireUser()` helper in every server action — throws/redirects if unauthenticated. That is AUTHENTICATION only.
- **AUTHORIZATION** for session-scoped actions goes through `lib/sessionAuth.ts`: `requireSessionOwner`/`requireSessionMember` (by session id) and `requireSampleOwner`/`requireSampleMember` (by sample id — also returns the sample's real `sessionId`; never trust a client-supplied sessionId next to a sampleId). Every new session/sample mutation MUST call one of these — Prisma connects as postgres and bypasses RLS, so these TS checks are the real gate.
- Protected layout at `app/[locale]/app/layout.tsx` redirects to login
- Session stored in cookies via `@supabase/ssr`; refreshed by `proxy.ts` middleware on every request
- Auth is **magic link OTP only** — there are no passwords in this system
- `signInWithMagicLink(formData, next?)` threads `next` into `emailRedirectTo` → `/auth/callback?next=...` → callback at `app/auth/callback/route.ts` reads `?next=` and redirects there after auth. Used for invite links that require auth before joining.
- Owner vs participant rule (product-wide): the creator of an asset (session, coffee, group) has full create/edit/delete; participants/members only take part (evaluate, read the feed, leave a group).
- **Per-sample rows are owner-only**: `PhysicalEvaluation` and `ExtrinsicData` are one row per *sample* (not per cupper), so `upsertPhysical`/`upsertExtrinsic` use `requireSampleOwner`, the cup page and the CVA PDF route only ship `physical` to the owner and `extrinsic` to the owner or once `sample.revealed`, and `CupClient` hides those two tabs for participants. Mirrors the owner-only `phys_all`/`ext_all` RLS policies.
- **Never trust a client-supplied coffee id**: every write that links a coffee (`resolveCoffees`, `addSessionSample`, `revealSample`) re-validates it with `usableCoffeeWhere(user.id)` (`lib/coffeeAccess.ts`).
- **Read helpers are not server actions**: functions that take a `userId` and only read (e.g. `getCoffeesWithStats`, `getUsableCoffees` in `lib/coffees/queries.ts`) live in `lib/` with `import "server-only"`, never in `app/actions/` — every `"use server"` export is an unauthenticated public POST endpoint unless it calls `requireUser()` itself.
- **User-id → email resolution is co-cupper-scoped**: anything that turns a UUID into an email via the service-role client (`addMemberByUserId`, `createGroupWithMembers.coCupperUserIds`) must first pass `isCoCupper` / `coCupperIdsAmong` (`lib/coCuppers.ts`); linked members' emails render masked (`maskEmail`) on the group page.
- **Guest → account ("claim")**: QR walk-ups are anonymous Supabase users. The results-page banner (`components/results/GuestSaveCta.tsx`) does NOT run its own auth — `startGuestClaim` mints a signed claim token (`lib/guestClaim.ts`, HMAC, 7 days) and sends the guest through the normal login page with `next=/auth/claim?token=…`; after the magic-link/Google sign-in, `app/[locale]/auth/claim/page.tsx` shows a confirmation card (name + session count — **never merges on GET**) whose button runs the `confirmGuestClaim` server action → `mergeGuestData`, which moves EVERY user-referencing row from the anonymous id to the signed-in account (new or existing) inside one transaction and deletes the anonymous user. When you add a table with a user FK, add it to `mergeGuestData` — the final `profile.delete` there fails loudly (rollback) if a Restrict FK was forgotten, but Cascade FKs would silently drop rows.

### Coffee Short Codes
- Every `Coffee` gets a unique 6-char code (`lib/coffeeCode.ts`, alphabet `A-Z2-9` minus lookalikes I/L/O/0/1; displayed hyphenated, e.g. `K7M-3FP`) stamped at every create path: `createCoffee`, the session wizard's `resolveCoffees`, `updateSampleMetadata`'s implicit create, and `duplicateCoffee`.
- Use `withCodeRetry` (retry-on-P2002) for creates that run as their own implicit transaction. Inside an interactive `$transaction` (e.g. batch wizard creates), pre-generate codes with `generateUniqueCoffeeCodes` and retry the **whole transaction** on collision — a first P2002 aborts the surrounding Postgres transaction (25P02 on every later statement), so a per-row retry can never succeed there.
- `CoffeePicker` ranks code-prefix hits (3+ normalized chars) first but never replaces fuzzy name results; `CoffeesTable` and the coffee detail header show the code as a formatted pill and it is searchable in both raw and hyphenated form.

### Sample / Coffee Metadata Editing
- Session creation and coffee forms only require **name** — altitude is range-checked (1–6000) only when a value is entered, and roast level is optional ("valor antes que fricción": progressive data-quality gate relaxed 2026-09).
- `updateSampleMetadata` merges rather than overwrites: an absent key leaves that coffee field untouched, `""` clears it, and `name` is never blanked. It returns `coffeeUpdated: false` when the linked coffee isn't owned by the caller (the two callers show a dismissible notice instead of failing).
- Post-close origin-data editing lives in `ExtrinsicEditDialog` (`components/results/`), opened from the results drill-down for the session **owner** on a **revealed** sample — it reuses `ExtrinsicForm` with its in-cupping header/disclaimer suppressed and still saves through `upsertExtrinsic`.

### CVA PDF Export (`lib/pdf/`)
- `lib/pdf/cvaFormData.ts` builds the appendix physical block from the real `phys_*` fields plus derived lines: dominant screen size by weight share ("Malla 15 — 42%") and Cat.1/Cat.2 full-defect totals via `calcFullDefects` (`lib/constants.ts` — the single source, shared with `PhysicalEvalForm` so the PDF and the live form can never drift).
- Roast level renders in the sheet header (`DotField`) with the same reveal gate as `coffeeName` — both `null` until `sample.revealed`. Threaded through the PDF route (`app/api/sessions/[id]/cva-pdf/route.ts`), the print page, close emails, and `scripts/render-cva-preview.ts`.

### Session Lifecycle (see docs/flows.md for diagrams)
- **One close routine**: `closeSessionInternal(sessionId, { reason, emails })` in `lib/closeSession.ts` is the ONLY thing that flips a session to `closed`. It is idempotent (`updateMany where status != closed`, so a double click / concurrent call / cron retry is a no-op), stamps `closedAt`, **reveals every coffee-linked sample**, runs `syncCoffeeHistoryForSession`, and for group sessions sends close emails. Callers: owner `closeSession` (emails via `after()`), solo auto-close inside `submitAllEvaluations` (`emails: "skip"`), and the daily cron `app/api/cron/close-expired-sessions` (`emails: "await"`). Never write `status: "closed"` anywhere else.
- **Closed = read-only**: every session/sample mutation calls `assertSessionWritable(row)` (`lib/sessionAuth.ts`) right after its `requireSession*`/`requireSample*` check and throws `session_closed`. The `requireSample*` helpers return `{ sessionId, status }` for this. The cup route redirects closed sessions to `/results`; the offline replay returns `"discarded"` (not an error) for a closed session.
- Solo: `createSession` sets `status:"active"`; `submitAllEvaluations` **auto-closes** once the owner has a submitted evaluation for every sample. Do not add a manual close path for solo.
- Group: active → `startedAt` via `startSession` (idempotent `updateMany where startedAt: null`; exposed on wizard step 2 AND the master panel's "Iniciar cata") → closed via owner `closeSession` or the cron once `closesAt` passes.
- **Close emails are ledgered**: `close_email_deliveries` (one row per session × participant, status `sent | skipped | failed`) makes `sendCloseEmails` skip already-sent recipients; `resendCloseEmails` (owner) retries the rest. Anonymous guests have no email → `skipped`, not `failed`. Fan-out is bounded (4 concurrent PDF renders). Pages that invoke these actions export `maxDuration = 120`.
- **Delete keeps history**: `deleteSession` runs `detachCoffeeHistoryForSession` in the same transaction — every cupper keeps a `UserCoffeeHistory` row per coffee-linked sample they submitted (revealed or not) with a `snapshot` of their OWN evaluation + session metadata; `sessionId`/`evaluationId` are nullable `SetNull`. Readers must handle `session: null` (fall back to `snapshot`, no link). Coffee records are never touched by a session delete. `getDeleteImpact` feeds the confirm dialog (coffees + owners, cupper/evaluation counts).
- `status` values in the wild: "active" | "closed" (+ legacy "draft"/"open" rows render as neutral/active in `StatusPill`).
- All session links in lists MUST go through `sessionHref()` (`lib/sessionRouting.ts`).
- **Cron routes** (`app/api/cron/*`): `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration`, 503 when `CRON_SECRET` is unset, 401 on a bad `Authorization: Bearer`, bounded batch per run, JSON summary. Register in `vercel.json` and document the manual check in `docs/LAUNCH-RUNBOOK.md`.

### Group Sessions Pattern
- **`createSession`** (solo) uses `redirect()` inside — do not modify; it cannot return a value.
- **`createGroupSession`** is a separate action that returns `{ sessionId, inviteToken }` without redirecting, enabling the two-step wizard (Step 2 shows invite link).
- Invite tokens are `crypto.randomUUID()` stored in `SessionInvite`. `joinViaToken` is pure Prisma (postgres role, no admin client needed): the owner opening their own link and an existing participant re-opening it are no-ops (no `useCount` burn, owner never demoted to `joined`); a closed session sends members to `/results` and refuses newcomers with `session_closed`; `maxUses` is enforced inside the transaction (increment on the locked row, then check, throw to roll back) so simultaneous scans cannot overshoot the seat count.

### Aggregate Scoring Pattern
- The **PostgreSQL trigger** `trg_recompute_aggregate` is the single source of truth for community scores. It fires `AFTER INSERT OR UPDATE OF "isDraft"` on `evaluations` when `isDraft=false` and writes to `aggregate_scores`.
- TypeScript `calcCommunityScore()` in `lib/scoring.ts` is **display-only** — never store its result.
- `prisma/sql/rls_and_triggers.sql` must be applied **manually** via the Supabase dashboard SQL editor. Prisma migrate does NOT apply triggers or functions.
- `attrAverages` JSONB column on `AggregateScore` is populated alongside the score (section-level community averages); the exclude-participant path re-fires the recompute so penalties and `attrAverages` exclude removed cuppers.

### Offline-First Pattern
- The offline draft store (`lib/offline/store.ts`) wraps **localforage/IndexedDB** and is **client-only**. It is accessed through a lazy `instance()` getter that returns `null` during SSR, so an accidental server import degrades to a no-op instead of crashing. **Never import `lib/offline/store` from a Server Component or server action.**
- Drafts are keyed by session + user (`cata_session_<sessionId>_user_<userId>`). Connectivity is tracked by `hooks/useConnectivity.ts`; `hooks/useOfflineSync.ts` drains the queue on reconnect.
- Reconnect replay goes through `app/actions/offline.ts`, which keeps the **same authorization as the live path** — Prisma scoped by `cupperId`, never a raw Supabase select, so RLS/ownership rules hold. Conflict rules: no row → create; existing draft → local wins; already submitted → `conflict` unless `force`. `isDraft`/`submittedAt` are never mutated by replay.
- `lib/evaluation.ts` (`computeEvaluationDerived`) computes derived scores for both the live and offline paths so a replayed draft scores identically.

### PWA / Offline Shell
- `public/sw.js` is a hand-rolled vanilla service worker (no build step, no workbox/serwist). `SW_VERSION` is baked into the cache names (`cata-static-<v>`, `cata-pages-<v>`); **bump it whenever a change would make old cached entries incompatible** (e.g. cache-key logic changes) — `activate` deletes any cache not matching the current version.
- Exclusion rules the fetch handler applies **before** any caching logic — never intercepted: non-GET requests, cross-origin requests (Supabase Realtime `wss://`, etc.), `/api/*` (especially `/api/health` — the 30s connectivity probe in `hooks/useConnectivity.ts` must never be answered from cache), `/auth/*` (magic-link callback must always hit the network), and any path containing `hmr` (dev-only HMR sockets).
- `/_next/static/`, `/_next/image`, `/icons/`, and root-level image assets are cache-first. Navigations and RSC data fetches are network-first with a cache fallback (falling back further to `ignoreSearch` matching, then letting the failure propagate so a route's own error boundary — e.g. `app/[locale]/app/sessions/[id]/cup/error.tsx` — can rebuild from IndexedDB). The `cata-pages` cache is capped at 60 entries (FIFO).
- `components/pwa/ServiceWorkerRegister.tsx` registers the SW **production-only** by default (dev + Turbopack HMR interact badly with a caching layer). To test locally anyway: `localStorage.setItem("cata_sw_dev", "1")` then hard-reload. Mounted once in the root `app/layout.tsx` (the actual HTML shell — not `app/[locale]/layout.tsx`).
- `app/manifest.ts` + `public/icons/icon-{192,512,512-maskable}.png` make the app installable. **The current icons are placeholders** (programmatically generated flat-color + glyph) — swap in real brand icons before shipping broadly.

### Realtime (Group Sessions)
- Use `createBrowserClient` from `@supabase/ssr` in client components.
- Subscribe to `evaluations` table updates **without a filter string** to avoid Realtime filter length limits. Filter client-side by comparing `payload.new.session_sample_id` against a `Set` of the current session's sample IDs.
- Requires `ALTER TABLE evaluations REPLICA IDENTITY FULL` (in rls_and_triggers.sql) so UPDATE events include full row data.

### Admin Client (Service Role)
`lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY`. **Import only from server-side code** (server actions, API routes). Never import in client components or pages that render client-side.

### Form State Pattern
Cupping form components are fully controlled. State is lifted to `CupClient`, which orchestrates sample navigation, tab switching, and auto-save. Individual forms receive data and `onChange` callbacks as props.

### Error Boundaries & Not-Found
- `components/errors/ErrorPanel.tsx` is the single error surface. Boundaries: `app/global-error.tsx` (replaces the root layout — own `<html>/<body>`, hardcoded es/en map), `app/[locale]/error.tsx`, `app/[locale]/app/error.tsx` (app shell stays mounted), `app/[locale]/app/sessions/[id]/cup/error.tsx` (offline-aware). 404: `app/[locale]/not-found.tsx` (localized) reached via the `app/[locale]/[...rest]/page.tsx` catch-all; `app/not-found.tsx` (bilingual) only for an unknown locale segment. `loading.tsx` skeletons on `/app` and `/app/sessions/[id]`.
- Retry with **`unstable_retry()`** (re-fetches), never `reset()` (re-renders the same failed tree — the old cup boundary looped on exactly this). The cup boundary allows 2 automatic retries per 30 s, then shows a manual retry + back link.
- Boundary components cannot receive a `translations` prop, so `app/[locale]/error.tsx` and `app/[locale]/app/error.tsx` call `useTranslations("errors")` directly — the ONE sanctioned exception to the i18n rule below (they render inside `[locale]/layout.tsx`'s `NextIntlClientProvider`).

### i18n Pattern
- Server components: `const t = await getTranslations("section")`
- Client components: receive translations as props (a `translations` object) — do not call `useTranslations()` inside components that are passed as children to server-rendered layouts (exception: the two `error.tsx` boundaries above)
- All reference data in `lib/constants.ts` uses Spanish labels; UI strings use the translation system

---

## Database Schema (Key Models)

| Model | Purpose |
|---|---|
| `Profile` | User account (id = Supabase user UUID); `role`, `country`, `onboardingCompleted` |
| `CuppingSession` | A cupping event (format, date, status, isGroup, isAsync, closesAt, cupsPerSample) |
| `SessionSample` | A coffee sample within a session (position, label, revealed, coffeeId) |
| `Evaluation` | A cupper's score for one sample (JSON data + computed scores, isDraft, submittedAt) |
| `PhysicalEvaluation` | Green bean assessment for a sample (pre-reveal) |
| `ExtrinsicData` | Origin/processing info revealed post-tasting |
| `Coffee` | Coffee product reference data; `code` — unique 6-char short code (`lib/coffeeCode.ts`), stamped at every create path |
| `SessionParticipant` | Links a user to a group session (status: "invited"\|"joined"\|"owner"; `excludedFromResults`) |
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

### Consensus (SD)
`computeGroupAggregate` also returns `scoreSd` — the population standard deviation (÷n) of the included cuppers' individual CVA totals, `null` when fewer than 2 evaluations are included. Display-only, like `communityScore`; the DB trigger is untouched. Shown as a neutral "± X.X" chip next to the community `ScorePill` in the Resumen ranking, and as a "DE" column in the owner's CVA matrix (`OwnerParticipantSection`, reusing its existing `rowStats`).

---

## Reference Data

All cupping reference data is in `lib/constants.ts` (Spanish-labeled):

- `FLAVOR_WHEEL` — flat list of 3-level flavor-wheel nodes (L1 group → L2 → L3 leaf) with bilingual labels, `parentId`/`level`, synonyms, and group colors. Helpers: `flavorNodeById`, `flavorChildren`, `flavorGroupColor`, `migrateFlavorId`. `FLAVOR_FAMILIES` is a back-compat 2-level view derived from it. (Replaces the old `FLAVOR_TREE`.)
- `ACIDITY_DESCRIPTORS`, `SWEETNESS_DESCRIPTORS`, `MOUTHFEEL_DESCRIPTORS` / `MOUTHFEEL_OPTIONS`
- `GUSTOS_PREDOMINANTES` / `MAIN_TASTES` — basic tastes
- `AFFECTIVE_ATTRIBUTES` — 8 scored attributes (Fragancia, Aroma, Sabor, etc.)
- `AFFECTIVE_LABELS` — 9-point scale labels
- `CAT1_DEFECTS`, `CAT2_DEFECTS` — green bean defect categories with ratios
- `GREEN_COLORS`, `SCREEN_SIZES`, `PROCESS_TYPES`, `CERTIFICATIONS`

---

## Styling

- **Tailwind CSS 4** — PostCSS-based, no `tailwind.config.js` safelist
- **`DESIGN.md` is the single source of truth for tokens** (MD3 role system in `app/globals.css`): `primary-container`, `surface`/`surface-container-*`, `on-surface`/`on-surface-variant`, `outline`/`outline-variant`, `secondary` (terracotta), `error`, radius tokens `rounded-card/input/pill`. **Never write hex literals in components.**
- Legacy alias classes (`green-dark`, `brown-*`, `cream`, `amber-warm`, `red-defect`, `bg`) still resolve via a back-compat block in `globals.css` — do not use them in NEW code; prefer MD3 names.
- Responsive breakpoint rule: **content layouts switch at `md:`** (DataTable table↔cards), **the app shell at `lg:`** (Sidebar↔BottomNav), **dialogs at 640px** (ResponsiveDialog internal media query).
- Reuse the shared UI kit for anything list/CRUD-shaped: `DataTable`, `Badge`/`StatusPill`/`ScorePill`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `SearchInput`, `Select`, `Pagination`, `FilterBar`, plus `InfoHint` for an inline info-icon → `ResponsiveDialog` explainer (all in `components/ui/`).
- Use **Radix UI** for accessible overlays and dialogs (via `ResponsiveDialog`)
- Use **lucide-react** for all icons
- App flows (session lifecycle, coffee sharing, group invites, app map) are diagrammed in **`docs/flows.md`** — those diagrams are normative; update them in the same PR as any flow change.

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
RESEND_API_KEY=               # Server-only. Unset → lib/email.ts sending is a graceful no-op
EMAIL_FROM=                   # Optional — overrides the default sender; must be a Resend-verified domain
```

Optional (features degrade gracefully to no-ops when unset):

```
RESEND_API_KEY=               # lib/email.ts — transactional email; unset → sends skipped
EMAIL_FROM=                   # Sender override; defaults to "Cata Café <no-reply@catacafe.app>"
ANALYTICS_SUPER_ADMIN_EMAIL=  # lib/analytics/access.ts — insights super-admin (has code fallback)
GEMINI_API_KEY=               # lib/ai/gemini.ts — AI narratives; unset → "AI not configured" UI
GEMINI_MODEL_LITE=            # Model override; default gemini-3.1-flash-lite
GEMINI_MODEL_STANDARD=        # Model override; default gemini-3.5-flash
ANALYTICS_AI_ADMIN_EMAILS=    # lib/analytics/access.ts — comma-separated AI-chat admins; unset → super-admin only
GEMINI_MODEL_PRO=             # Model override for the insights chat; default gemini-3.1-pro-preview (no stable 3.x pro on the API yet)
CRON_SECRET=                  # Vercel Cron auth for /api/cron/insights-digest (Vercel env)
NEXT_PUBLIC_SITE_URL=         # Absolute URL used in email links; defaults to localhost
DB_POOL_MAX=                  # Per-instance Postgres pool size for the pg driver adapter; default 8
```

### Insights Access Levels (`lib/analytics/access.ts`)
Three levels, all resolved from `getAnalyticsAccess()`:

| Level | Grant | Sees |
|---|---|---|
| Super-admin | `ANALYTICS_SUPER_ADMIN_EMAIL` (code fallback) | Everything, incl. **Acceso** (grant management via `requireSuperAdmin`) |
| AI admin | `ANALYTICS_AI_ADMIN_EMAILS` allowlist | `/app/insights` + the **Análisis** (AI chat) sidebar item + the **Usuarios** directory (`requireUsersDirectoryAccess` — shared with super-admin; Acceso stays super-admin-only) |
| Flagged user | `Profile.analyticsAccess` | Base `/app/insights` only, no AI chat, no Usuarios |

Emails for the Usuarios directory are resolved via `lib/supabase/adminUsers.ts` (`listAllAuthUsers`, paginated on GoTrue's `nextPage` — never the `length < perPage` heuristic, which silently truncated to page 1). Anonymous/guest accounts show an "Invitado" badge and em-dash email, with a registered-vs-guest facet and a summary count line.

### AI Narrative Pattern (`lib/ai/`)
- Provider-agnostic seam: `getAiProvider()` in `lib/ai/index.ts` returns the Gemini impl (`lib/ai/gemini.ts`); a Claude impl would slot in there without touching callers.
- All prompts live in `lib/ai/narratives.ts` and receive **only aggregated numbers/labels** — never raw evaluations or emails. Bump `PROMPT_VERSION` when editing a prompt (it invalidates the cache).
- `cachedGenerate()` in `lib/ai/cache.ts` is cache-first over the `insight_narratives` table (sha256 data-hash key) — repeat views never re-bill the provider. Shared by server actions (`app/actions/ai.ts`), the report PDF route, and the digest cron.
- AI is server-only and gated by `requireAnalyticsAccess()`; never call from client components.
- Chat continuity: assistant turns replay a compact `[datos]` digest of that turn's tool-result blocks (`serializeBlocksForHistory` in `lib/ai/chatTypes.ts`, 700-char cap per block) so follow-up questions can reference earlier figures without re-fetching them; `MAX_TEXT_LENGTH` is 3000.

### Reference Data (`reference_series`, `benchmark_lots`)
- Imported from vendored CSVs by `npm run import:reference` / `npm run import:benchmarks` (idempotent per source; see `scripts/data/README.md` for provenance/licenses). Refresh = re-download CSV + re-run.
- Free-text coffee metadata (country/process/harvest/altitude) is normalized **at query time** by `lib/analytics/normalize.ts` (deterministic exact-alias matching only — extend the alias lists there; `scripts/report-normalization.ts` audits live-DB coverage).
- Every UI/PDF/email surface showing derived numbers must render the citation lines from `lib/analytics/referenceSources.ts` (CC-BY / MIT attribution requirements).

---

## Supabase Manual Steps

Changes that Prisma migrate does NOT handle must be applied manually via the **Supabase Dashboard → SQL Editor**:

- RLS policies and policy updates
- Trigger functions (`recompute_aggregate_score`, etc.)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE ... REPLICA IDENTITY FULL`
- Enable **"Allow anonymous sign-ins"** (Dashboard → Authentication → Sign In / Up) — required for the guest QR-join flow (`supabase.auth.signInAnonymously()` in `components/join/GuestJoinForm.tsx`)
- Apply the PHASE 13 `handle_new_user()` redefinition in `prisma/sql/rls_and_triggers.sql` **before** enabling anonymous sign-ins above — otherwise an anonymous user's NULL email hard-fails the profile insert

These are all collected in `prisma/sql/rls_and_triggers.sql`. Append new blocks to that file and apply the new block manually each time. Every manual step gets a click-by-click section in **`docs/LAUNCH-RUNBOOK.md`** in the same PR (PHASE 18 = runbook §1).

**RLS policy rules (learned the hard way, PHASE 18):** never write `USING (true)` without a `TO authenticated` clause — a policy with no `TO` applies to the `anon` role, and the anon key is public. New helper functions get `SET search_path = public` and `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (they are reachable via `/rest/v1/rpc/*` otherwise). Check the Supabase **Security Advisor** after every SQL change.

---

## Resuming In-Progress Work

If `docs/HANDOVER.md` exists with `status: in-progress`, **read it first** and continue
from its "Next action" on the branch it names. Do not re-plan or re-audit. Update the
ledger after every completed step and before every commit; when the user says
"handover", finish the in-flight edit, run `npx tsc --noEmit && npm run lint`, commit a
WIP on the WP branch, update the ledger, and stop.

## Orchestration Policy

- Fable (claude-fable-5) acts as the orchestrator for multi-part work in this repo:
  it plans, decomposes, and reviews, but delegates self-contained subtasks
  (mechanical edits, i18n key mirroring, boilerplate components, test runs) to
  cheaper Sonnet/Haiku agents. Reserve Fable-level reasoning for schema/auth/RLS
  design, cross-cutting refactors, and hard debugging.
- Never assume on ambiguity: surface clarifying questions to the user via the
  AskUserQuestion tool before committing to a direction; do not resolve product
  decisions inside a subagent.
