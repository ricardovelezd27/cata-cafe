# S6 Stream B — Movimiento Sensorial warm-ups (notes for the lead's docs PR)

Status 2026-10-20: CP-B1…B6 implemented as stacked PRs (#26 → #33 → #40 → #41 → #44 → B6).
B7 (reveal moment) waits for Stream A. Migration for B6 is **created, not applied**.

## Paragraph for CLAUDE.md (new section under "Architecture & Conventions")

### Warm-ups — "Movimiento Sensorial" (2026-10)
- **Content is typed TS, not JSON**: `lib/warmup/exercises.ts` holds Kim's five exercises as
  `{es,en}` records (`WARMUP_EXERCISES`, `WARMUP_SHARED`, `WARMUP_IDS`, `warmupById/BySlug`,
  `lw(text, locale)`). The EN column is a draft until `WARMUP_EN_STATUS` flips to `"reviewed"`.
  Only chrome strings live in `messages/*.json` under the `warmup` namespace (appended at the
  end: `player`, `library`, `dashboard`, `waiting`, `wizard`). Step timing is literal (15 s legs,
  3 s holds; `WARMUP_LEG_SEC`, `WARMUP_HOLD_SEC`, `WARMUP_STEP_PAUSE_SEC`, `WARMUP_CLOSING_HOLD_SEC`);
  `tests/warmup.test.ts` guards the structure.
- **Figures** (`components/warmup/figures/`): one shared line-art `<Mannequin>` SVG (front/side
  views, `data-part` groups, strokes via `currentColor`/tokens — never hex) + `<Arrow>`; one
  figure per `WarmupFigureKind`; motion is CSS-module keyframes over `--warmup-duration` /
  `--warmup-delay` / `--warmup-iterations` / `--warmup-amp`, one iteration, remounted per step.
  **Mirror semantics**: "derecha" moves toward the viewer's right. `hooks/useReducedMotion.ts`
  → static end-pose + arrow, no auto-advance. No GSAP.
- **Player** (`components/warmup/WarmupPlayer.tsx`): `intro → step(i) → pause(3 s) → … →
  observe → closing (30 s) → done`; `hooks/useCountdown.ts` measures with `Date.now()` deltas,
  pauses on `visibilitychange`, re-renders only on whole seconds. Mobile = fixed full-screen
  stack (figure ≈42 dvh, docked controls with the CanvasFooter gesture padding); md:+ = two
  columns in 1100 px; `inline` for the library page. Not a dialog. Strings via
  `components/warmup/playerStrings.ts` (`t.raw` for `{n}` placeholders).
- **Library**: `/app/warmup` (static params OK) and `/app/warmup/[slug]` (`force-dynamic`, NO
  `generateStaticParams`). Dashboard card, not a nav tab. Guest-allowed (`lib/guestScope.ts`).
  Dev review routes `/app/warmup/dev-figures|dev-player|dev-moment` 404 in production
  (underscore folders are private in Next, hence no `_dev`).
- **Session moments** (`components/session-moments/`): `SessionMomentOverlay` + `useSessionMoment`
  are the ONE shell for in-shell interstitials (warm-up today; S5 materials checklist and the
  reveal moment later). Mounted as a **sibling of `SessionShell`** at the root of `CupClient`
  (never inside the top bar). Trigger = provider predicate AND a per-(kind, session) seen-set
  in localStorage (`cata_moment_<kind>_<sessionId>`, `lib/sessionMoments.ts`, read via
  `useSyncExternalStore` so it never opens during SSR). Always skippable; static content only, so
  it renders offline; never touches `flushSave`/`useOfflineSync`. Waiting room: "Mientras
  esperas" opens the player INSIDE `WaitingRoomClient` so the realtime `startedAt` redirect stays
  mounted.
- **Optional pre-cupping step**: `CuppingSession.warmupExerciseId String?` — a code constant,
  validated `oneOf(WARMUP_IDS)` in `validateSessionMeta` / `updateSession` (`invalid_warmup`),
  set from the wizard toggle + `Select` under Format and from `EditSessionForm`, copied by
  `duplicateSession`. `cup/page.tsx` passes it to `CupClient`'s `warmup` prop → `WarmupMoment`
  shows once per session per device before the first sample (solo, async and live alike).
  **Scoring, aggregates and the SQL trigger never read it.**

## Paragraphs for docs/flows.md

### §1 Session lifecycle — addition
"Pre-cupping warm-up (optional): when the owner picked `warmupExerciseId`, the first time a
cupper opens `/cup` on a device the session-moment overlay shows the exercise (skippable);
finish or skip writes `cata_moment_warmup_<sessionId>` to localStorage and it never shows
again on that device. Offline: identical (static content). Closed sessions never show it."

### Waiting room — addition
"While waiting, the participant may run any of the five warm-ups from the 'Mientras esperas'
card; the player is an overlay inside the waiting-room client, so the `startedAt` realtime
redirect (or its 15 s polling fallback) still moves them to `/cup`."

### App map — addition
`/app/warmup` (library, guest-allowed) → `/app/warmup/[slug]` (player). Dashboard card links in.

## HANDOVER ledger entry (suggested)
- 2026-10-20 S6-B: warm-ups B1–B6 on stacked PRs; migration
  `20261020120000_session_warmup_exercise` (ADD COLUMN "warmupExerciseId" TEXT) **pending
  `prisma migrate deploy` by Ricardo**. Until applied, any `cuppingSession` read through the
  regenerated client fails (column missing) — merge B6 and deploy the migration in the same
  release window.

## Findings for the lead
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  against prod also emits `ALTER COLUMN "startedAt" SET DATA TYPE TIMESTAMP(3)` — pre-existing
  drift between the live column type and the schema (not part of the B6 migration, which
  contains only the ADD COLUMN). Worth reconciling in the S4 hygiene pass.
- Realtime `cupping_sessions` UPDATE did not reach the waiting room in dev-against-prod with
  `par1@cata.test` (control test without the player open behaved the same; channel reported
  SUBSCRIBED so polling did not engage). Manual "Iniciar cata" works. Check with Stream C.
- `useCountdown`: rAF stops when the window is occluded while `visibilityState` stays
  "visible"; the hook adds a wall-clock completion timeout + 250 ms interval fallback.
