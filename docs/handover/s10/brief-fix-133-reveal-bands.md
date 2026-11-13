# Brief — fixes for PR #133 (S10 WP3a) after its independent review

Branch: the EXISTING branch `claude/s10-03a-reveal-bands-impl`. `git fetch origin`,
`git merge origin/main` FIRST (main moved: #130 leftovers touched `CupClient.tsx`, the cron
route and `lib/offline/claimMarker.ts`; resolve keeping both sides; `npx prisma generate`
after the merge). Never rebase or force-push. The PR exists (#133): update its body.

The review confirmed: the live save and both replays refuse a revealed sample, submit of an
existing draft works, no quality band or category name remains, the legend is single-sourced,
the market note never touches a score, nothing reads the session row's `updatedAt` as
activity. It said "merge as is: NO" for two Highs. Decisions below are final. Tests FIRST.

MACHINE RULE (you broke it last round): NEVER kill processes by image name (`taskkill /IM
postgres.exe`, `/IM node.exe`, `pkill`). Other agents share this machine and their test runs
died. Stop only a process you started, by its PID. A slow `test:db` is just slow: wait.

## H1 — marking a REVEALED sample as the fixed reference rewrites everyone's ratings of it
`app/actions/sessions.ts` `setReferenceSample` (add path ~l.1170-1213 and the reactivation
path ~l.1156) and `removeSamplesInTx` (reactivation re-pin) have no `revealed` check: in an
anchor-mode session the owner reveals sample C, then marks C as the reference → every
cupper's eight ratings of C become 5 and the group score moves after the reveal.
- Rule (pure, beside `shouldPinReference` or in `lib/sessionState.ts`): a reference change
  that would PIN a revealed sample is refused. That is: the mode pins (`shouldPinReference`
  for that module) AND the sample that would become the active pinned reference is
  `revealed`: whether it is newly marked, or an earlier reference being reactivated because
  the active one is removed or its sample deleted.
- New typed code `reference_revealed` (`ActionErrorCode`, both message files under
  `errors.codes`), es: "Esta acción cambiaría las calificaciones de una muestra ya revelada.
  Elige otra muestra como referencia." en: "This would change the ratings of a sample that
  has already been revealed. Choose another sample as the reference." Thrown BEFORE any
  write; in `removeSamplesInTx` it rolls the transaction back like `reference_repin_required`.
- Free mode (no pin): allowed as today.
- UI: the master panel and the edit form do not offer a revealed sample as a fixed
  reference in anchor mode (disabled option with the reason as text); the server check is
  the gate.
- DB tests: mark a revealed sample (anchor) → refused, every stored rating unchanged, the
  aggregate row unchanged; remove the active reference when the earlier one is revealed →
  refused; delete the active reference's sample when the earlier one is revealed → refused,
  nothing deleted; free mode → allowed, nothing rewritten. `tests/referencePinGate.test.ts`
  must still pass.

## H2 — the owner's origin and physical data on a revealed sample are silently dropped
`CupClient.tsx` ~l.1520: `setSampleData` returns early on `sample.revealed` for EVERY key.
The freeze concerns the evaluation module (ratings, descriptors, cup checks, the quick note,
the market note). `extrinsic` and `physical` are the owner's per-sample rows, entered after
the reveal by design: they must keep working (state, autosave, indicator). Put "which keys
are frozen for a revealed sample" in ONE pure function with tests and use it in
`setSampleData` and wherever the read-only render is decided. Test: a revealed sample accepts
an extrinsic and a physical change and refuses a module change.

## M3 + M4 — a note refused because of the reveal gets its own status, never sendable
Today it is parked as `closed_unsent` while the session is OPEN: the panel says "La cata ya
estaba cerrada", links to `results?closed=1`, and (once the late-contributions PR merges) it
would offer "Enviar al organizador" for ratings typed AFTER the reveal.
- `lib/offline/status.ts`: new status `revealed_unsent` (transitions + tests): entered when
  the live save or a replay is refused for the reveal; like `closed_unsent` it never blocks
  the final submit of other samples, is never retried, and is listed in "Notas sin
  sincronizar" for read / copy / confirmed discard only. It is NEVER offered a send action
  (leave a comment at the status naming the late-contributions action so the next PR does not
  wire it).
- Replay answer: keep the server contract simple: answer a distinct outcome (`revealed`) if
  the union allows it without breaking cached clients (action ids change per build, so old
  bundles cannot call it); else map on the client from the refusal reason. Say which.
- Copy (es + en): panel row "La muestra se reveló antes de que esto se guardara. No se
  puede enviar." ; badge wording must not say the cupping was closed; no link to
  `results?closed=1` for this status.

## M5 — the market note for the organiser
The brief asked for it next to that cupper's detail for the owner. Find where the owner
reads ONE cupper's evaluation of a sample on the results page (the owner's drill-down /
participant detail that `OwnerParticipantSection` opens); show "Punto de vista: un mercado
que conozco (…)" there when set. If the owner has no per-cupper detail view on main, do not
build one: say so in the report.

## Low / nit
- L6: the `sample_revealed` toast shows ONCE per sample per page (latch), not on every
  800 ms autosave; the amber "pending" indicator stays.
- L7: document in CLAUDE.md and `docs/flows.md` §1: submitting an existing draft of a
  revealed sample is allowed and may recompute its stored SCORE under the current rule (the
  legacy-draft rewrite); it never changes a rating except on the pinned anchor.
- Nit: `lib/sessionAuth.ts` ~l.94 names `lib/evaluationFreeze.ts`; the rule lives in
  `lib/sessionState.ts`.
- Two mutations were NOT caught: removing the read-only render, and restoring a colour on
  `ScorePill`. Add tests: the pure "frozen keys / read-only" function from H2 drives the
  fieldset's `disabled` (test the function and that the component passes its result: a small
  source assertion is acceptable); `ScorePill`'s class list is built by a pure function that
  takes NO score (test: same output for 60, 79, 95; no token name that encodes quality).
- Leave the history numeric filter as it is (decided: a numeric range is not a band).

## Docs
CLAUDE.md, `docs/flows.md` §1 (reveal rule incl. references; the new status), both message
files.

## Gates and delivery
All five gates, one at a time, after the merge of main (`npx tsc --noEmit`, `npm test`,
`npm run test:db`, `npm run lint` with exactly the 4 known errors, `npm run build` after the
last change). Under load a `test:db` file may time out: re-run that file alone and say so.
Start no background timers; do not stop to wait on background work. Report: commits; how
each merge conflict was resolved; the final text of the two pure rules and the status
transitions; where `reference_revealed` is thrown (file:line, each path); the replay
contract choice; every string added or changed (es and en); the M5 answer; mutation results
for H1, H2, read-only render and ScorePill; gate tails with exact counts; anything not done.
