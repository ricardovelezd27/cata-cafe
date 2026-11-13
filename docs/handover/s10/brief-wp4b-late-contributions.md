# Brief — S10 WP4b: close announced ahead, late evaluations the owner can accept, a note after close (one migration, no SQL phase expected)

Branch: `claude/s10-04b-late-contributions-impl` from `origin/main` (main has #123, the
closing rules: `lib/closeRules.ts`, `lib/idleClose.ts`, `canViewGroupResults`, "Cerrar ahora").
DRAFT PR against `main`.
PR title: `S10 WP4b: close announced a few minutes ahead, late evaluations the owner can accept, a text note after close`
Kim rows: C1, C2 (answers are SIMULATED: mark new behaviour `TODO(kim-validar:C1)` /
`TODO(kim-validar:C2)`). `npm run test:db` required.

Read first: `docs/handover/s10/brief-00-common-rules.md` (rules for every executor), CLAUDE.md
("Session Lifecycle" whole section incl. sanctioned post-close writes; "Scoring System": rule
versions, `lib/legacyDrafts.ts`, `refireAggregates` modes; "Offline-First Pattern": draft
status machine, `closed_unsent`; "Guests": `expectedUserId` on writes; "Realtime"),
`docs/flows.md` §1, `lib/closeRules.ts` (`DRAFT_AT_CLOSE`, the `TODO(S8-05/C1-d)` note),
`lib/closeSession.ts`, `app/actions/community.ts` (`closeSession`, `submitAllEvaluations`,
`setParticipantExclusion` as the model of a sanctioned post-close owner write),
`app/actions/offline.ts`, `components/offline/UnsyncedNotesPanel.tsx` (`TODO(C1)`),
`CupClient.tsx` (the `cupping_sessions` realtime handler, the close dialog ~l.782/2905),
`app/[locale]/app/sessions/[id]/results/page.tsx` (~l.612: the comment about complete drafts
left at close; "Resultados actualizados el…"), `lib/coffeeHistory.ts`, `lib/aggregateRefire.ts`,
`tests/useServerExports.test.ts`, `tests/registeredOnlyActions.test.ts`.

Two other PRs are open on neighbouring files and will merge before yours: #127 (cup forms,
`SampleDetail`, `ScoreBreakdownPanel`) and #128 (`OwnerParticipantSection`, results page
payload, `community.ts` exclusion, CSV). Keep your UI in NEW components and your edits to
shared files small; expect to `git merge origin/main` before the end.

## Owner decisions that bind this PR
Late contributions: allowed, by the session OWNER only, COMPLETE drafts only, stamped, shown
with the "Resultados actualizados el…" line. The cupper's own stored score for that
evaluation is written once, at acceptance; no score that already existed changes except the
group number of that sample, which is recomputed. A text note after close: text only, never
a rating.

## 1. Migration (hand-written, additive, nullable; you NEVER run it)
`prisma/migrations/20261115100000_close_notice_and_late_contributions/migration.sql` +
`schema.prisma` (follow the models' naming/mapping style), then `npx prisma generate`:
- `CuppingSession.closingAt DateTime? @db.Timestamptz(3)`: the announced close moment.
- `Evaluation.acceptedLateAt DateTime? @db.Timestamptz(3)`.
- `Evaluation.postCloseNote String?` (max 500 chars, enforced in the action) and
  `Evaluation.postCloseNoteAt DateTime? @db.Timestamptz(3)`.
No "accepted by" column: only the session owner can accept, so it would add a user column
for nothing. Check how `cupping_sessions` and `evaluations` are granted to the browser key in
`prisma/sql/rls_and_triggers.sql`: table-level SELECT means the new columns need nothing
(as `warmupStartedAt` and `cups` did). If either is column-level, STOP on that point and
report (the realtime banner would need a grant phase). Runbook section in the style of the
last migration sections; PR body: the owner runs `npx.cmd prisma migrate deploy` BEFORE the
merge; old code ignores the columns.

## 2. C1a — the close is announced a few minutes ahead
- Owner actions in `app/actions/community.ts`, `run()` → `ActionResult`,
  `requireSessionOwner` + `assertSessionWritable`, group sessions only:
  `announceClose(sessionId, minutes)` (`minutes` ∈ {2, 5} via `lib/validate.ts`; sets
  `closingAt = now + minutes`; idempotent overwrite) and `cancelAnnouncedClose(sessionId)`.
  `closeSessionInternal` leaves the column alone (a closed session's `closingAt` is history).
- Owner UI: in the existing close dialog on the cup page (it already counts cuppers who have
  not sent), three choices: "Cerrar ahora" (today's behaviour), "Avisar y cerrar en 2 min",
  "Avisar y cerrar en 5 min". While a close is announced the owner sees a docked line with
  the countdown, "Cerrar ahora" and "Cancelar". The owner's cup page calls the existing
  `closeSession` when the countdown reaches zero (it already confirmed in the dialog). NO
  server enforcement and no cron: if the owner's page is not open at that moment nothing
  closes; on return the line reads "El cierre anunciado ya pasó" with "Cerrar ahora" /
  "Cancelar". Say this limit in the PR body.
- Cuppers: a calm, persistent banner on the cup page (and the waiting room if it is trivial
  there; else skip and report), es: "El organizador cerrará la cata en {tiempo}. Envía tus
  evaluaciones." (+ en), fed by the EXISTING `cupping_sessions` UPDATE realtime handler and
  by the page's server render (ship `closingAt` and `serverNow`; correct the countdown for
  clock skew the way the warm-up's synced run does, pure function + tests). Past zero and not
  yet closed: "El organizador está por cerrar la cata." No sound, no modal, never blocks
  input. Cancelled → the banner disappears. `aria-live="polite"`, announced once per minute
  at most.
- Pure rules (new dependency-free module + tests): countdown/skew, banner state
  (none | counting | due), what the owner line shows.

## 3. C1b — complete drafts left at close; the owner accepts each one
Today (keep): a draft at close stays a draft and does not count.
- Pure rule `isAcceptableLate(evaluation, session)`: session `closed`; the evaluation is a
  DRAFT; it is COMPLETE by the same completeness rule the submit path uses for that format
  (find it; do not write a second one); its cupper is not a deleted-account placeholder
  (`isDeletedProfileId`).
- Owner action `acceptLateEvaluation(evaluationId)`: `run()` → `ActionResult`;
  `requireRegisteredUser`; resolve the evaluation → sample → session on the server and
  require the caller to be the session OWNER (never trust a client session id); refuse unless
  `isAcceptableLate`; in ONE transaction: if the draft was saved before the 2026-11 rule
  (`cups` NULL) rewrite it first exactly as `submitAllEvaluations` does (`lib/legacyDrafts.ts`),
  then flip `isDraft = false`, set `submittedAt` and `acceptedLateAt` to now (the trigger
  recomputes that sample's group score: mode-`full` semantics, it is a deliberate owner
  action); after commit re-run `syncCoffeeHistoryForSession` and `revalidatePath` as the
  exclusion action does. Idempotent: a second call on an already-submitted row is a no-op
  success. It never touches any other evaluation. It is a SANCTIONED post-close write:
  `docs/flows.md` §1, the allowlist in `tests/useServerExports.test.ts` (with the reason),
  `tests/registeredOnlyActions.test.ts`.
- Owner UI on the results page of a closed group session: a NEW component (e.g.
  `components/results/LateEvaluationsPanel.tsx`), shown only when there is at least one
  acceptable draft: per cupper and sample one row (name, sample label, "guardada el {fecha}",
  and the honest flag "Recibida después del cierre" when the row's `updatedAt` is later than
  the close), an "Aceptar" button with a `ConfirmDialog`: "Se incluirá la evaluación de
  {nombre} para {muestra}. El resultado del grupo de esa muestra se vuelve a calcular. Los
  resúmenes que ya se enviaron tenían el número anterior. No se puede deshacer; si hace
  falta, puedes excluir al catador." (+ en). The payload with these rows goes to the OWNER
  only (gate it in the server payload builder, test: a participant's payload never carries
  another cupper's draft, name or count).
- The cupper whose complete draft was left out sees, on their own results page, one line per
  such sample: "Tu evaluación de {muestra} no se envió antes del cierre. El organizador puede
  incluirla." and after acceptance "Tu evaluación de {muestra} se incluyó el {fecha}." Only
  their own.
- "Resultados actualizados el…": the existing line (and `ReportStamp.resultsUpdatedAt`) must
  also move when a late evaluation is accepted (latest of the exclusion stamp and
  `acceptedLateAt`). Find the one place that computes it.
- Remove the `TODO(S8-05/C1-d)` marker; `DRAFT_AT_CLOSE` stays "exclude" with the comment
  updated ("…unless the owner accepts it afterwards").

## 4. C1c — a note left only on the device reaches the owner
`UnsyncedNotesPanel` lists `closed_unsent` modules (work that never reached the server
because the session closed). Add "Enviar al organizador" on a module that is COMPLETE:
- Member action `submitLateDraft(input, expectedUserId)` in `app/actions/offline.ts`
  (answers a status like the replay actions, never throws for expected cases; guests
  allowed; `requireUserExpecting`; `requireSampleMember`; the session must be CLOSED, not
  merely expired, else answer `pending`): it derives everything through
  `computeEvaluationDerived` with `cups`/`format` from the session row (never from the
  client), applies the reference pin rule through `shouldPinReference`, and writes a DRAFT
  row only: no row → create draft; existing DRAFT → update it only if the device copy is
  newer (the `clientTs` rule in `lib/evaluationWrite.ts`); existing SUBMITTED row → answer
  `conflict` and write nothing. It never sets `isDraft = false`, `submittedAt` or
  `acceptedLateAt`. Sanctioned post-close write (same three registrations).
- On success the module leaves the panel as synced (use the status machine in
  `lib/offline/status.ts`; add a transition only if none fits, with tests) and a toast says
  "Enviado. El organizador decide si lo incluye." Remove the `TODO(C1)` marker.
- Incomplete modules keep today's options (read, copy, discard).

## 5. C2 — a text note after close
- Action `setPostCloseNote(evaluationId, text)`: `run()` → `ActionResult`; `requireUser`
  (guests allowed: it is their own evaluation) with `expectedUserId` like the other cup-page
  writes; the evaluation must be the CALLER'S OWN (`cupperId`), SUBMITTED, in a CLOSED
  session; `str` max 500, "" clears; writes ONLY `postCloseNote` / `postCloseNoteAt` (never
  the JSON module, a rating, `isDraft`: assert in a DB test that the trigger does not fire
  and no score column changes). Sanctioned post-close write (three registrations).
- UI: in the cupper's own sample drill-down on the results page, under their notes, "Añadir
  una nota después del cierre" → textarea + Guardar; shown afterwards as "Nota añadida el
  {fecha}: …". Keep it out of `SampleDetail`'s score area (another PR edits it): a small new
  component mounted by the drill-down dialog.
- Who reads it: the cupper, and the session owner in the owner's per-cupper view (find where
  the owner reads a cupper's notes today and add it there, labelled with its date). Never
  another participant; not in the participant tier of any report; not in the CSV in this PR.
  Test the participant payload: no other cupper's note.

## 6. Tests (pure first)
Unit: every pure rule above. DB (`tests/db/`): accept → row submitted + stamped, the sample's
aggregate recomputed with `ruleVersion` 2 and the right `submittedCount`, other samples'
aggregate rows untouched (compare before/after), history row exists for that cupper;
accepting twice; accepting an incomplete draft / a draft in an open session / as a non-owner
refused; a legacy draft (`cups` NULL) accepted → `cups` written; `submitLateDraft` create /
newer-update / never over a submitted row / refused on an open session; `setPostCloseNote`
writes only its two columns and refuses someone else's evaluation and a draft.

## Do not change
`lib/scoring.ts`, the SQL file (unless the grant check says so: then stop and report), the
close routine's two phases, `canViewGroupResults`, the idle rules, emails (no new email).

## Docs
CLAUDE.md ("Session Lifecycle": the announced close, the three new sanctioned writes),
`docs/flows.md` §1 (diagram + sanctioned writes list), `docs/LAUNCH-RUNBOOK.md` (migration
step), both message files.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors in `app/[locale]/dev/page.tsx` and
`components/ui/IntensitySlider.tsx`, `npm run build` after the last change). A unit-test
timeout under load is not a failure if the file passes alone (say so). If `npm ci` stalls for
more than ~15 minutes: commit, push and say so (the architect runs the gates). Report: branch,
PR number, commits; the migration SQL; the grant check result; the final text of each pure
rule and each action's guards in order; every string added or changed (es and en); the three
payload-privacy tests; gate tails with exact counts; anything not done or doubtful; what can
only be judged signed in or with two devices.
