# Brief — S10 WP7: Movimiento Sensorial

Branch: `claude/s10-07-warmup-impl` from `origin/main`.
PR title: `S10 WP7: Movimiento Sensorial — private reflections, short version, entry after start, seated and small-space options`
Kim rows: F1, F2, F4, F5, B7. `npm run test:db` required (new table, merge and deletion paths).

Read `components/warmup/` (README if any), `lib/warmup/*`, the "Warm-ups" section of
CLAUDE.md in full: there is ONE timeline and ONE clock; never add a second clock.

## Facts (verified; re-check line numbers)
- `lib/warmup/timeline.ts` `buildExerciseTimeline(ex, { mode })`, `TimelineMode = "library" |
  "session"`; arrive is fixed at 40 s (`ARRIVE_PLAN` must total `WARMUP_ARRIVE_SEC`, else it
  throws), closing 30 s, so the fixed part alone is 70 s. Library totals today: 185 s to 372 s.
  `tests/warmup-timeline.test.ts` pins golden fixtures and invariants for 5 exercises × 2 modes.
- `lib/warmup/exercises.ts`: `WarmupExercise` has `posture: "seated" | "standing"` (only
  `arm-raise` is "standing", text "De pie o sentado…"), `figure.amplitude?: "normal" | "small"`,
  `SMALL_AMPLITUDE = 0.18` in the timeline. The two closing questions are the `CLOSING` const.
- Reflections: `WarmupPlayer.tsx` library mode ends in a `reflect` phase that only SHOWS the
  two questions (no inputs; S8-13 removed saving). `lib/warmup/reflections.ts` only purges
  legacy localStorage keys and carries `TODO(Kim F2)`.
- `lib/warmup/overlayGate.ts` carries `TODO(Kim F1)`, `TODO(Kim F4)`, `TODO(Kim F5)`; the
  overlay never shows once a live group cupping has started or the cupper has an evaluation.
- "Catar ahora" (`app/[locale]/app/sessions/express/ExpressForm.tsx`, `createExpressSession`)
  has no warm-up; express sessions have `warmupExerciseId` null.
- Guests cannot reach `/app/warmup` (see `lib/guestScope.ts`).

## 1. F2 — reflections are saved again, private to the person
Owner's decision: an account table, readable only by its owner.
- Prisma model `WarmupReflection` (`@@map("warmup_reflections")`): `id` cuid, `userId` with a
  `Profile` relation (`onDelete: Restrict`-style default, NOT Cascade: account deletion erases
  it explicitly), `exerciseId String` (validated with `oneOf(…, WARMUP_IDS)`), `feel String?`,
  `discovery String?` (answers to the two closing questions, each max 500, at least one
  non-empty), `createdAt`. Index on `[userId, exerciseId, createdAt]`. Hand-written migration
  `prisma/migrations/20261113110000_warmup_reflections/migration.sql`.
- Add it to `lib/accountDeletion/manifest.ts` (merge: move; delete: erase), `mergeGuestData`
  and `deleteAccount`, and extend the DB tests that cover merge and deletion.
- **PHASE 27** (SQL phase with dry run, replay test, runbook section): `ALTER TABLE
  warmup_reflections ENABLE ROW LEVEL SECURITY;` with NO policy (deny-all for the API roles,
  like the PHASE 22 ledger tables), plus `REVOKE ALL ON warmup_reflections FROM anon,
  authenticated;`. Add a `tests/db` assertion that `authenticated` cannot select it. Another
  PR in flight adds PHASE 26 before yours: if `origin/main` does not have PHASE 26 when you
  start, still number yours 27, append after the last phase present, and write the "last
  phase" test so it tolerates PHASE 26 landing first (state this in the PR body).
- Server: `app/actions/warmup.ts` with `saveWarmupReflection({ exerciseId, feel, discovery })`
  and `deleteWarmupReflection(id)` (`run()` → `ActionResult`, `requireRegisteredUser()`, the
  delete scoped by `userId`), and a read helper in `lib/warmup/reflectionsData.ts`
  (`import "server-only"`, takes the user id, never an action).
- UI: in library mode the `reflect` phase shows two optional textareas under the two
  questions, "Guardar" and "Continuar sin guardar". Replace `warmup.reflect.lead` ("Sin
  escribir nada…") in both languages. The exercise page (`/app/warmup/[slug]`) lists "Tus
  reflexiones" for that exercise (date, the two answers, a delete with `ConfirmDialog`), and
  says once: "Solo tú puedes verlas." Session and synced modes are unchanged (no reflect phase).
- Nobody else ever reads them: no analytics query, no admin view, no export, no AI prompt.
  Say so in CLAUDE.md. Remove `TODO(Kim F2)`.

## 2. F4 / B7 — a short version, 1 to 2 minutes
- `buildExerciseTimeline(ex, { mode, length?: "full" | "short" })`, default "full" with
  byte-identical output to today (the golden fixtures must not change). "short": a shorter
  arrival (posture 5 s + ONE breath cycle 10 s), the exercise's first movement steps only (take
  steps in order while the running total stays ≤ 75 s of step time, at least one step, never
  cutting a step in half), and a 15 s closing; `bridge` as today in session mode. Total must
  land between 60 s and 120 s for all five exercises: add that as a test, with a golden
  fixture for one exercise. Cues, hums, narrations, whispers and `stepStart`/`stepEnd` are
  derived for the short timeline by the same code paths (no special-casing in the player).
  `timelineTotalMs` and `lib/warmup/syncedRun.ts` keep using "full" (the master-led synced run
  is always the full version).
- Player: an optional `length` prop. Library exercise page: a choice "Completa · N min" /
  "Corta · 1–2 min" on the intro screen. The short version has no reflect phase.
- "Catar ahora": in `ExpressForm.tsx` an optional, clearly secondary action "Calentar 1–2 min
  antes" that opens the short player for a default exercise (`arm-raise`) inline BEFORE the
  session is created (library-like, `onFinish`/`onExit` return to the form with its state
  intact). No schema change and `createExpressSession` is unchanged. Guests cannot create
  sessions, so nothing changes for them.
- Remove `TODO(Kim F4)`.

## 3. F1 — a discreet entry after the cupping has started
Never the interstitial. On the cup page, when the session has a `warmupExerciseId`, the
overlay gate said no, and the session is not closed: one small text button ("Movimiento
Sensorial · N min", secondary style, `min-h-[44px]`) that opens the same player in session
mode; closing it changes nothing (it does not mark anything seen, it never blocks cupping, it
is not shown while the overlay itself is open). Keep the change to `CupClient.tsx` minimal: a
small component next to `WarmupMoment`. Add the case to `tests` for the pure gate
(`shouldOfferWarmupEntry`) in `lib/warmup/overlayGate.ts`. Remove `TODO(Kim F1)`.

## 4. F5 — seated and small-space options
No new choreography. On the player's intro screen, two optional chips, both off by default:
- "Sentado" — only for an exercise whose `posture` is "standing": shows the seated posture
  line instead of the standing one.
- "Poco espacio" — renders every movement with the existing small amplitude
  (`amplitude: "small"` / `SMALL_AMPLITUDE`) and adds one line to the intro and to the arrival
  narration: "Haz el mismo movimiento, más pequeño." Timing does not change: the timeline's
  durations are identical with the option on or off (test it).
Texts live with the exercise content in `lib/warmup/exercises.ts` as `{ es, en }` records
(≤ 32 words, they are read aloud), marked `TODO(kim-validar:F5)`. Remember the two chips per
device in localStorage (`cata_warmup_seated`, `cata_warmup_compact`, try/catch). The synced
run ignores both (everyone follows the master's timeline). Remove `TODO(Kim F5)`.

## Docs
CLAUDE.md "Warm-ups" (reflections table and privacy, `length`, the entry after start, the two
options, PHASE 27), `docs/flows.md` warm-up flow, `docs/LAUNCH-RUNBOOK.md` (migration before
deploy; PHASE 27).

## Report extras
The short timeline's total for each of the five exercises; proof the full fixtures are
unchanged; the manifest entry and the merge/delete lines; what you could not check without a
phone (audio unlock, lock-screen resume, the express inline player).
