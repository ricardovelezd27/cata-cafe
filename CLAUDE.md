@AGENTS.md

# Cata Café — Project Guide for Claude

## What This Project Is

**Cata Café** is a professional coffee cupping evaluation platform for specialty coffee experts (catadores). It implements the SCA CVA (Specialty Coffee Association — Coffee Value Assessment) methodology, enabling structured sensory evaluations across three formats: Descriptive, Affective, and Combined. Users create cupping sessions, evaluate individual coffee samples cup-by-cup, and generate scored reports and PDF certificates.

Target users: coffee professionals conducting blind tastings in a lab or production environment.
Default language: Spanish (`es`). Secondary: English (`en`).

## Critical Warnings

### Next.js 16 — Breaking Changes
This project runs **Next.js 16.4.6**, which contains breaking API changes from 14/15. Before writing any Next.js-specific code (routing, layouts, middleware, server actions, caching), read the relevant guide in `node_modules/next/dist/docs/`. Do not assume any Next.js behavior from training data.

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

## Where the detail lives

| File (under `docs/guide/`) | Read it when |
|---|---|
| `s10-summary.md` | you need the product rules in one page: what S10 changed for cuppers, organisers and coffee owners, the three scoring scopes, the display-only fields |
| `project-map.md` | you need to find where something lives: stack versions, folder tree, search-tool policy, database models, reference-data constants |
| `server-actions-and-validation.md` | you wrap an existing flat-shaped action (`runFlat`), touch group, insight, digest or chat-quota actions, or serialise a stored date |
| `cupping-form-and-scoring.md` | you touch the cup forms, CupClient auto-save, the evaluation JSON keys (defect type, "no evaluado", cooled value), the score formula, rule versions, the trigger's arithmetic or the score's name |
| `auth-and-accounts.md` | you touch sign-in, the confirm page, the login CSRF guard, guests and shared devices, the guest claim, account deletion or sign-out |
| `creating-sessions-and-coffees.md` | you touch the session wizard, blind letters, the reveal freeze, coffee short codes, sample or coffee metadata, or origin-data edits |
| `reference-sample.md` | you touch the reference sample: order, pin, multi-reference, mode, the stash, the session lock order |
| `session-lifecycle.md` | you touch closing, idle close, late evaluations, notes after close, express, start, `closesAt`, delete, join rules, the group notice, cron routes or realtime |
| `results-page.md` | you touch the results page: overview, coffee cards, the sheet, learnings, the Panel, tabs and the address, personal comparisons, exclusion reasons |
| `reports-pdf-csv.md` | you touch a PDF, a report model, the CVA sheet or the results CSV |
| `offline-and-platform.md` | you touch offline drafts, the replay, the service worker, the save status, the reload notice or `lib/platform/` |
| `warmup.md` | you touch Movimiento Sensorial (player, timeline, sound, voice, synced run, reflections) |
| `design-and-landing.md` | you touch the landing page, its density rules, the arrival stage or `<html lang>` |
| `email.md` | you send any email or touch a budget, the unsubscribe link, the close-email ledger or the newsletter |
| `legal-and-retention.md` | you touch the legal pages, consent, the unused-account purge or the email-change reservation move |
| `environment-and-testing.md` | you add or read an environment variable, touch the boot assertions or headers, or run `npm run test:db` |
| `insights-and-ai.md` | you touch `/app/insights`, access levels, the analytics scope, AI narratives, the chat or the reference-data imports |
| `supabase-sql.md` | you change any SQL: manual steps, RLS policy rules, the phases and their state in production |

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
- `lib/validate.ts` (`str`, `int`, `oneOf`, `isoDate`, `list`, `email`, `cupFlags`, `cupDefectTypes` (never throws: exactly `cups` entries, anything not a defect id becomes `null`)) — no zod. Every client-posted string/number/enum/date/array goes through one of these before Prisma; they throw `invalid_input` (mapped by `run()`), or the caller translates to its own code (the session wizard's `validateSessionMeta` → `session.newForm.errors.*`).
- **Scoring inputs are never taken from the client**: `upsertEvaluation` and `syncEvaluation` read `cupsPerSample` and `format` from the session row (`requireSample*` return them) and derive the JSON column via `moduleKeyForFormat`; `computeEvaluationDerived` clamps the cup arrays with `cupFlags`. The `cupsPerSample` / `moduleKey` fields in those inputs are kept for API compatibility and ignored.

### Logging
- `lib/log.ts` (`logError` / `logWarn` / `logInfo`) writes one JSON line per event so Vercel Logs can be searched by `digest`, `action`, `sessionId`. `run()` logs unknown action failures; `instrumentation.ts` logs render/route failures with the same shape.
- **Log**: action name, error code, digest, ids (userId/sessionId/coffeeId/groupId), the route template, locale, and `message` only for `unknown`. **Never log**: request headers/cookies, concrete `/join/*` or `/auth/*` paths (tokens — use `redactPath`), emails, display names, form bodies, evaluation payloads, AI prompts.

### Evaluation Data Shape
`descriptiveData`, `affectiveData`, and `combinedData` on the `Evaluation` model are stored as JSON (`Record<string, unknown>`). Do not flatten these into new columns — the flexible JSON structure is intentional to support dynamic attribute sets.

### Auth Pattern
- `requireUser()` helper in every server action — throws/redirects if unauthenticated. That is AUTHENTICATION only.
- **AUTHORIZATION** for session-scoped actions goes through `lib/sessionAuth.ts`: `requireSessionOwner`/`requireSessionMember` (by session id) and `requireSampleOwner`/`requireSampleMember` (by sample id — also returns the sample's real `sessionId`; never trust a client-supplied sessionId next to a sampleId). Every new session/sample mutation MUST call one of these — Prisma connects as postgres and bypasses RLS, so these TS checks are the real gate.
- Protected layout at `app/[locale]/app/layout.tsx` redirects to login
- Session stored in cookies via `@supabase/ssr`; refreshed by `proxy.ts` middleware on every request
- Sign-in is passwordless and has three entry points: the **email link** (opens `/auth/confirm`, a button completes it), the **6-digit code** typed on the login screen (`verifyEmailCode`), and **Google**; walk-up guests are anonymous Supabase users. There are no passwords in this system. (Details in "Sign-in deep links, code entry and locale" below.)
- `signInWithMagicLink(formData, next?)` threads `next` into `emailRedirectTo` → `/auth/callback?next=...` → callback at `app/auth/callback/route.ts` reads `?next=` and redirects there after auth. Used for invite links that require auth before joining.
- Owner vs participant rule (product-wide): the creator of an asset (session, coffee, group) has full create/edit/delete; participants/members only take part (evaluate, read the feed, leave a group).
- **Registered-only actions (S8-03)**: anything that creates an asset, shares, invites or sends email calls `requireRegisteredUser()` (`lib/auth.ts`, `isRegisteredUser` in `lib/guestScope.ts`) — never bare `requireUser()` — because `proxy.ts` gates pages, not server-action POSTs. Every export of `coffees.ts` and `groups.ts`, plus `createSession`/`createExpressSession`/`createGroupSession`/`duplicateSession`/`createInviteToken`, is pinned by `tests/registeredOnlyActions.test.ts`. Guests keep `requireUser()` for join, evaluate, submit, waiting room, offline replay and claim.
- **Per-sample rows are owner-only**: `PhysicalEvaluation` and `ExtrinsicData` are one row per *sample* (not per cupper), so `upsertPhysical`/`upsertExtrinsic` use `requireSampleOwner`, the cup page and the CVA PDF route only ship `physical` to the owner and `extrinsic` to the owner or once `sample.revealed`, and `CupClient` hides those two tabs for participants. Mirrors the owner-only `phys_all`/`ext_all` RLS policies.
- **Never trust a client-supplied coffee id**: every write that links a coffee (`linkedCoffeesUsable` in the wizard create paths, `addSessionSample`, `revealSample`) re-validates it with `usableCoffeeWhere(user.id)` (`lib/coffeeAccess.ts`).
- **Read helpers are not server actions**: functions that take a `userId` and only read (e.g. `getCoffeesWithStats`, `getUsableCoffees` in `lib/coffees/queries.ts`) live in `lib/` with `import "server-only"`, never in `app/actions/` — every `"use server"` export is an unauthenticated public POST endpoint unless it calls `requireUser()` itself.
- **User-id → email resolution is co-cupper-scoped**: anything that turns a UUID into an email via the service-role client (`addMemberByUserId`, `createGroupWithMembers.coCupperUserIds`) must first pass `isCoCupper` / `coCupperIdsAmong` (`lib/coCuppers.ts`); no group MEMBER sees an email in any form (S10 WP5a, F-grupos-10): the member view runs a query that does not select the address, shows the name, else a profile name only when it does NOT look like the address (a profile name defaults to the email local part; `looksLikeAddress`: equals the local part or the whole address, any case, or contains `@`), else "Miembro" (linked) / "Invitación pendiente" (`memberRosterForMember`, `lib/groupRoster.ts`, applied inside the server-only loader `lib/groups/memberView.ts` whose typed `select` returns rows with no email key), and only the group OWNER's roster shows addresses (typed ones whole, linked accounts' masked with `maskEmail`).

### Blind data and closed sessions

- **Per-sample prep data (A9)** — `session_samples.roastDate / preparationNote / offProtocol / offProtocolNote` (migration `20261113100000_sample_prep_and_reference_mode`, runbook §32). BLIND DATA: they can identify a coffee, so they are **deliberately NOT in the PHASE 21 column GRANT** (invisible to the browser key like `"coffeeId"`; a note at the end of `rls_and_triggers.sql` and `tests/db/rls.dbtest.ts` pin this) and every read site ships them to the owner or once `sample.revealed` through ONE rule, `lib/samplePrep.ts gateSamplePrep` (cup page, results page, `sheetSamplePrep` for the CVA PDF / print / close email, re-gated inside `buildCvaFormData`). Written by the wizard create paths (validated in `validateSessionInput`, code `invalid_sample_prep`) and by `updateSampleMetadata` (merge semantics: absent key untouched, "" clears; unticking "off protocol" clears its note; refused with `session_closed` on a closed or expired session even when the call names a coffee). Display-only: never read by scoring, the trigger or `AggregateScore`. `duplicateSession` does not copy them (a roast date belongs to one cupping).
- **One close routine**: `closeSessionInternal(sessionId, { reason, emails })` in `lib/closeSession.ts` is the ONLY thing that flips a session to `closed`. It runs in two phases (S8-05): the idempotent flip (`updateMany where status != closed`, stamps `closedAt`) and `finalizeClosedSession` (**reveals every coffee-linked sample**, refires the aggregate, runs `syncCoffeeHistoryForSession`, for group sessions sends close emails, then stamps `closeFinalizedAt`). A failed phase-2 step logs `closeSession.finalize` and leaves the stamp null; the solo resubmit, an owner close after 5 min and the cron repair pass retry it. Pure rules (draft policy `DRAFT_AT_CLOSE`, zone-aware `endOfDayInZone`, `planFinish`, reminder windows) live in `lib/closeRules.ts`. Callers: owner `closeSession` (emails via `after()`), solo auto-close inside `submitAllEvaluations` (`emails: "skip"`), and the daily cron `app/api/cron/close-expired-sessions` (`emails: "await"`). Never write `status: "closed"` anywhere else.
- **Group results are visible only at close (S10 WP4a, Kim C5; `TODO(kim-validar:C5)`)**: `canViewGroupResults` is group AND (owner/admin lens OR closed OR `closesAt` passed); "everyone submitted" no longer opens it. Every group-data path takes it from that one rule (results page payload, counts of who submitted, participant-summary 409, the cup page's `submittedCount` is owner-only) and its SQL twin `public.can_view_group_results` was re-issued as PHASE 28 (dry run `prisma/sql/dry-runs/phase28_dry_run.sql`, runbook §33). `touchOnResultsVisible` was removed.
- **Sanctioned post-close writes: the full list** (single source `docs/flows.md` §1; enforced by the `ALLOWLIST` of `tests/useServerExports.test.ts`): (1) `upsertExtrinsic` via `ExtrinsicEditDialog` and its offline twin `replayExtrinsic` (owner, revealed sample), (2) `setParticipantExclusion` (owner), (3) `updateSampleMetadata` naming a coffee on a coffee-less sample and `assignSampleCoffee` (owner; both set the coffee, reveal the sample and sync history), (4) `deleteAccount` and `confirmGuestClaim` (the person; they move rows, are not session-scoped, so not in the test), (5) `acceptLateEvaluation` (owner), (6) `submitLateDraft` (member, closed group session, draft only), (7) `setPostCloseNote` (the cupper's own submitted evaluation). Anything else throws `session_closed`. Adding one means updating `docs/flows.md` §1 and the allowlist. The idempotent lifecycle actions (`closeSession`, `closeAnnounced`, `startSession`, `resendCloseEmails`, `deleteSession`, `duplicateSession`) and the no-op `refreshAggregateScores` are on the allowlist too but write no result.
- **Closed = read-only**: every session/sample mutation calls `assertSessionWritable(row)` (`lib/sessionAuth.ts`) right after its `requireSession*`/`requireSample*` check and throws `session_closed`. **Expired = closed too (S8-01)**: `assertSessionWritable` is expiry-aware (`isSessionExpired`: status `closed` OR `closesAt < now`, server clock) for any row that carries `closesAt`, and the `/cup`, `/waiting` redirects, `sessionHref`, `joinViaToken` and the offline replay use the same helper; `updateSession` is expiry-aware too since S10 WP4a (Kim C9: it refuses any change, a new or cleared closing date included, once `closesAt` has passed). A participant cannot write to an unstarted live group session (`assertSessionStarted` → `session_not_started`). **RLS (PHASE 21)**: the browser key is SELECT-only on the session tables, participants read only their own `evaluations`, and `session_samples."coffeeId"` is hidden from the API; a new `session_samples` column needs a column `GRANT SELECT` in a new SQL phase, EXCEPT blind data: `"coffeeId"` and the four S10 A9 prep columns (`roastDate`, `preparationNote`, `offProtocol`, `offProtocolNote`) are deliberately ungranted and must stay so (owner, or once revealed, through Prisma behind `gateSamplePrep`). `tests/useServerExports.test.ts` fails when a session-scoped export forgets the guard. The `requireSample*` helpers return `{ sessionId, status }` for this. The cup route redirects closed sessions to `/results`; the offline replay returns `"closed"` (not an error) for a closed or expired session (`replay*`; only the legacy `syncEvaluation` still maps it to `"discarded"` for cached bundles). **Sanctioned post-close writes (S8-12)**: `upsertExtrinsic` via `ExtrinsicEditDialog` (owner AND a revealed sample, else `session_closed`; stamps `extrinsic_data.edited_at`, returns `ActionResult`; the offline `replayExtrinsic` applies the same `extrinsicWriteAllowed` rule), `setParticipantExclusion` (owner; stamps `excluded_at/by/reason` on `session_participants`, returns `ActionResult`, reason from `lib/exclusionReasons.ts`; the results page then says "Resultados actualizados el …") and `updateSampleMetadata` naming a coffee on a **coffee-less** sample (owner only, must carry a coffee field, sets `revealed: true` and re-runs `syncCoffeeHistoryForSession`; label-only edits still throw) — results drill-down "Asignar café". Never add another without updating `docs/flows.md` §1 and the allowlist in `tests/useServerExports.test.ts`.
- **Blind-leak gates (S8-02)**: coffee-profile and Ficha numbers come from `loadCoffeeAggregateSamples(coffeeId, viewer)` → pure `filterCoffeeSamples` (closed + revealed sessions only, excluded cuppers removed, session name/date only for sessions the viewer owns or joined). `/print`, `cva-pdf` and the close email take coffee name/roast from `sheetSampleIdentity` (revealed only); the results payload goes through `gateSampleForViewer`; coffee `notes` are owner/super-admin only and `duplicableFields` is the duplicate allow-list. See `docs/flows.md` §6.
- All session links in lists MUST go through `sessionHref()` (`lib/sessionRouting.ts`).

### Aggregate Scoring Pattern
- The **PostgreSQL trigger** `trg_recompute_aggregate` is the single source of truth for community scores. It fires `AFTER INSERT OR UPDATE OF "isDraft"` on `evaluations` when `isDraft=false` and writes to `aggregate_scores`.
- TypeScript `calcCommunityScore()` in `lib/scoring.ts` is **display-only** — never store its result.
- `prisma/sql/rls_and_triggers.sql` must be applied **manually** via the Supabase dashboard SQL editor. Prisma migrate does NOT apply triggers or functions.
- `attrAverages` JSONB column on `AggregateScore` is populated alongside the score (section-level community averages); the exclude-participant path re-fires the recompute so penalties, pooled cups and `attrAverages` exclude removed cuppers.

### Offline-First Pattern
- The offline draft store (`lib/offline/store.ts`) wraps **localforage/IndexedDB** and is **client-only**. It is accessed through a lazy `instance()` getter that returns `null` during SSR, so an accidental server import degrades to a no-op instead of crashing. **Never import `lib/offline/store` from a Server Component or server action.**

### Boot-time Env Assertions, Headers, Tests

- `npm test` runs vitest over `tests/**` (pure libs only: scoring, evaluation derivation, validate, session state, action error mapping, env, log redaction, guest scope). Anything importing `lib/prisma` or `server-only` stays out of tests — keep pure rules in dependency-free modules (`lib/sessionState.ts`, `lib/actionResult.ts`) and re-export.

### Admin Client (Service Role)
`lib/supabase/admin.ts` exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY`. **Import only from server-side code** (server actions, API routes). Never import in client components or pages that render client-side.

### Error Boundaries & Not-Found
- `components/errors/ErrorPanel.tsx` is the single error surface. Boundaries: `app/global-error.tsx` (replaces the root layout — own `<html>/<body>`, hardcoded es/en map), `app/[locale]/error.tsx`, `app/[locale]/app/error.tsx` (app shell stays mounted), `app/[locale]/app/sessions/[id]/cup/error.tsx` (offline-aware). 404: `app/[locale]/not-found.tsx` (localized) reached via the `app/[locale]/[...rest]/page.tsx` catch-all; `app/not-found.tsx` (bilingual) only for an unknown locale segment. `loading.tsx` skeletons on `/app` and `/app/sessions/[id]`.
- Retry with **`retry()`** (re-fetches; the boundary prop was `unstable_retry` until Next 16.3 made it stable as `retry`, and 16.4 no longer passes the old name), never `reset()` (re-renders the same failed tree — the old cup boundary looped on exactly this). The cup boundary allows 2 automatic retries per 30 s, then shows a manual retry + back link.
- Boundary components cannot receive a `translations` prop, so `app/[locale]/error.tsx` and `app/[locale]/app/error.tsx` call `useTranslations("errors")` directly — the ONE sanctioned exception to the i18n rule below (they render inside `[locale]/layout.tsx`'s `NextIntlClientProvider`).

### i18n Pattern
- Server components: `const t = await getTranslations("section")`
- Client components: receive translations as props (a `translations` object) — do not call `useTranslations()` inside components that are passed as children to server-rendered layouts (exception: the two `error.tsx` boundaries above)
- All reference data in `lib/constants.ts` uses Spanish labels; UI strings use the translation system

## Scoring System

The SCA CVA scoring formula is implemented in `lib/scoring.ts`. **Do not reimplement it.**

## Styling

- **Tailwind CSS 4** — PostCSS-based, no `tailwind.config.js` safelist
- **`DESIGN.md` is the design system that governs the product** (landing and app): principles in order of precedence, the two modes (paper = the app, stage = the dark ground with the dots), tokens, surfaces, patterns, the accessibility baseline and a "what not to do" table. Read its "How this document governs" before any UI work. The app has not been audited against it yet: `docs/design-system/AUDIT-RUBRIC.md` is the checklist and `docs/prompts/S11-app-ui-ux-audit.md` starts that session.
- **`DESIGN.md` is also the single source of truth for tokens** (MD3 role system in `app/globals.css`): `primary-container`, `surface`/`surface-container-*`, `on-surface`/`on-surface-variant`, `outline`/`outline-variant`, `secondary` (terracotta), `error`, radius tokens `rounded-card/input/pill`. **Never write hex literals in components.**
- Legacy alias classes (`green-dark`, `brown-*`, `cream`, `amber-warm`, `red-defect`, `bg`) still resolve via a back-compat block in `globals.css` — do not use them in NEW code; prefer MD3 names.
- Responsive breakpoint rule: **content layouts switch at `md:`** (DataTable table↔cards), **the app shell at `lg:`** (Sidebar↔BottomNav), **dialogs at 640px** (ResponsiveDialog internal media query).
- Reuse the shared UI kit for anything list/CRUD-shaped: `DataTable`, `Badge`/`StatusPill`/`ScorePill`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `SearchInput`, `Select`, `Pagination`, `FilterBar`, plus `InfoHint` for an inline info-icon → `ResponsiveDialog` explainer (all in `components/ui/`).
- Use **Radix UI** for accessible overlays and dialogs (via `ResponsiveDialog`)
- Use **lucide-react** for all icons
- App flows (session lifecycle, coffee sharing, group invites, app map) are diagrammed in **`docs/flows.md`** — those diagrams are normative; update them in the same PR as any flow change.

## Dev Commands

```bash
npm run dev                  # Dev server → http://localhost:3000
npm run build                # Production build
npm run lint                 # ESLint

npx prisma migrate dev       # Apply pending migrations
npx prisma generate          # Regenerate client after schema change
npx prisma studio            # GUI DB explorer
```

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
