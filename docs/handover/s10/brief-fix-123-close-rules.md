# Brief — fixes for PR #123 (S10 WP4a, closing rules) after its independent review

Branch: check out the EXISTING branch `claude/s10-04a-close-rules-impl` (tip `52a3645` when
this was written): `git fetch origin && git checkout -b s10-04a-fix origin/claude/s10-04a-close-rules-impl`,
then `git merge origin/main` (never rebase or force-push). Push with
`git push origin HEAD:claude/s10-04a-close-rules-impl`. The PR exists (#123): do not open a new
one; update its body.

The review confirmed: PHASE 28's SQL (types, grants, rollback byte-equal to PHASE 21), the
dry run leaves nothing behind, the results page no longer leaks group data, removing
`touchOnResultsVisible` is right, the gates. It said "not yet" for the following.

## H1 — the cup page still tells every participant how many cuppers have submitted
`app/[locale]/app/sessions/[id]/cup/page.tsx` (~l.297) formats `submittedOf` ("3 de 5
enviados") on the server for every viewer; `CupClient.tsx` (~l.2003-2008) falls back to it for
non-owners and renders it in the sidebar (~l.2018-2022) and the header (~l.2109-2111).
Fix: the page sends the text to the owner only (empty for everyone else) and `CupClient`
renders that line only when `isOwner`; also make sure the realtime handler that keeps the
counter fresh does nothing for participants. Correct the false comment at ~l.195-198. Test:
a pure function that builds the participant-facing cup payload fields (or a source-level
test if no seam exists: say which) proves a non-owner gets no count.

## H2 — the first production run must not email the backlog
`lib/idleClose.ts` closes every live session idle for 7+ days with `emails: "await"`. On the
first run that includes sessions abandoned months ago (one with ~50 participants): each
participant would get a results email out of the blue. Architect's decision
(`TODO(kim-validar:C3)`):
- Idle 7 days to under 30 days since the last activity → close with `emails: "await"` (the
  designed flow).
- Idle 30 days or more → close with `emails: "skip"`, same `reason: "idle"`. (`skip` stamps
  `closeFinalizedAt`, so the repair pass never sends later; the owner can still use "Reenviar
  correos".) Because the job runs daily, after the first week only the backlog can cross 30
  days, so the rule needs no switch. Pure function `idleCloseEmailMode(idleMs)` with boundary
  tests; DB test for both buckets (assert no `close_email_deliveries` row is created for the
  30+ bucket and the session is finalized).
- The JSON summary reports both counts (`idleClosed`, `idleClosedSilently`).

## M1 — cron order and time budget
`app/api/cron/close-expired-sessions/route.ts`: run the idle pass AFTER the repair pass and the
reminders (and before or after the ledger purge, whichever keeps the purge always running: say
which); its own batch of 5 per run (not 25), oldest first; and stop STARTING new closes (in
both the idle pass and, if cheap, pass 1) once ~150 s of the 300 s budget have elapsed
(`truncated` flags in the summary say so). Unit-test the "may I start another" rule.

## M2 — an expired, not-closed session leaves the owner with no way to act
`/cup` redirects an expired session to `/results`, the results page has no close control, and
C9 now (rightly) refuses re-dating. If the nightly job fails, the owner can do nothing.
Fix: on the results page, the OWNER of a group session that is expired but not closed sees a
"Cerrar ahora" button (reuse `Button` + `ConfirmDialog`, `closeSession` already accepts
expired sessions; `feedback.run`; after success `router.refresh()`), with one line, es: "La
fecha de cierre ya pasó. La cata se cierra sola esta noche; puedes cerrarla ahora para enviar
los resultados." (+ en). Pure rule `canCloseNow({ isOwner, isGroup, status, expired })` with
tests. The results page must export `maxDuration = 120` if it does not already (close sends
email).

## M3 — tests that pin what matters
The reviewer reverted two behaviours and NO test failed: (a) the results-page call site using
the all-submitted rule again; (b) `updateSession`'s guard back to the status-only check. Add:
an action-level DB test (`tests/db/`, mocking `@/lib/auth` as other suites do) that
`updateSession` on an expired, not closed session returns `session_closed` for a rename, a new
closing date and a cleared date, and changes nothing; a test at the seam where the results
page decides `canViewGroup` (extract the argument-building into a small pure function used by
BOTH the page and the participant-summary route, so neither can pass `allSubmitted` again);
make the "truth table" test honest: either it runs the real SQL function in the DB suite for
every combination of (owner, status, expired, everyone-submitted) and compares with
TypeScript, or the unit test is renamed to say it compares with a hand port. Make the
"failure is isolated" DB test really make one close throw (mock/stub `closeSessionInternal`
for one id) so the `catch` path in `idleClose.ts` runs.

## M4 — PR #119 says the opposite about the closing date
`origin/claude/s10-09b-env-leftovers-impl` (it may be merged into `main` by the time you
start: check `git log origin/main --oneline | head`) makes the edit page of an expired session
"read-only EXCEPT the closing date", with its own `sessionExpired` copy and nested fieldsets.
C9 (this PR, the owner's decision) locks the date too. If #119 is in `main`: after
`git merge origin/main`, remove that exception (the date control is disabled too) and keep ONE
string for the state. If #119 is not in `main` yet: write in the PR body, at the top, that
whichever merges second must drop #119's date exception; and still add the string below.
The edit page of an expired, not closed session must not say "está cerrada": es "La fecha de
cierre de esta cata ya pasó: se cerrará en las próximas horas y ya no se puede editar." (+ en).

## Low
- Copy that is false for dated sessions and for the idle close: `results.communityPending` and
  `community.noGroupData` → neutral, es "Los resultados del grupo aparecerán cuando se cierre
  la cata." (+ en).
- "Activity" means an evaluation being saved (`isLiveAbandoned` reads evaluation `updatedAt`
  and `startedAt` only). Make the reminder email say exactly that, es: "…lleva un día sin
  evaluaciones nuevas y sigue abierta. Ciérrala desde el panel cuando termines; si pasan 7
  días sin que nadie evalúe, la cerramos por ti." (+ en). Do not widen the definition.
- Race: re-check idleness for the session right before closing it (one cheap query inside the
  loop); a session with a fresh evaluation is skipped.
- C5 through two older paths the reviewer found: (1) deleting an OPEN group session that has a
  revealed coffee sample writes each participant's history with the stored community score
  (`lib/coffeeHistory.ts` ~l.211 → `syncCoffeeHistoryForSession` /
  `detachCoffeeHistoryForSession`): when the session was not closed, the history row carries
  no community score (null); (2) the group activity feed (`app/[locale]/app/groups/[id]/page.tsx`
  ~l.316-366) shows the GROUP owner who submitted in open sessions linked to the group even
  when the group owner is not the session owner: show submissions only for closed sessions or
  sessions the viewer owns. If either turns out larger than ~30 lines, stop, leave it, and
  describe it in your report.
- Dry run (report text and read-only counts only; the PHASE 28 statements between the markers
  must stay byte-identical to `rls_and_triggers.sql`): line 3 is labelled "OLD function" but
  measures whatever is installed: say "function installed now" and add "(after PHASE 28 is
  applied this line reads 0)"; replace raw ids with session name, date, participants and
  submitted counts; split line 2 into "idle 7 to 30 days (closed WITH emails): N sessions,
  M participants with an email" and "idle more than 30 days (closed silently): N sessions";
  use the same boundary as TypeScript (`>=` 7 days). PHASE 28's self-check also verifies
  `proconfig` (search_path).
- Nits: the stale comment at `ResultsClient.tsx` ~l.477-480.

## Docs
CLAUDE.md "Session Lifecycle", `docs/flows.md` §1, runbook §33 (the backlog rule, the new
dry-run lines and how to read them, the owner's "Cerrar ahora").

## Do not change
PHASE 28's function text, `closeSessionInternal`, the two-phase close, the reminder ledger.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build` after the last change). Update the PR body. Report: commits; H1 before/after
with the test; the idle rule and the cron order as committed, with the summary JSON shape;
the "Cerrar ahora" rule; the new tests and, for (a) and (b) of M3, proof by mutation that they
now fail; what you did for M4 (and whether #119 was in main); every string added or changed
(es and en); the new dry-run report text; gate tails with exact counts; anything not done or
doubtful.
