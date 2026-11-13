# Brief — S10 WP4a: closing rules (no schema change, one SQL phase)

Branch: `claude/s10-04a-close-rules-impl` from `origin/main`.
PR title: `S10 WP4a: closing rules — group results only at close, no re-dating after the deadline, live sessions close after 7 idle days`
Kim rows: C3, C5, C9. `npm run test:db` required.

## Facts (verified; re-check line numbers)
- `lib/sessionState.ts`: `canViewGroupResults({ isGroup, ownerRead, status, allSubmitted,
  sessionExpired })` = group AND (owner OR closed OR allSubmitted OR expired). Callers:
  `app/[locale]/app/sessions/[id]/results/page.tsx` (~l.162-166) and
  `app/api/sessions/[id]/participant-summary/route.ts` (~l.94-120, 409 while hidden).
- SQL twin `public.can_view_group_results(p_session_id text)` in
  `prisma/sql/rls_and_triggers.sql` (PHASE 21, ~l.1359-1387), called only by the `agg_select`
  policy on `aggregate_scores`.
- Banner copy `results.communityPending`: "Los resultados grupales aparecerán cuando todos los
  participantes envíen sus evaluaciones o el maestro cierre la sesión."
- `updateSession` (`app/actions/sessions.ts` ~l.1128-1169) checks `isSessionClosed` (status
  only) and then `planClosesAtChange`: the owner can move a passed deadline while the nightly
  job has not closed the session yet. `docs/flows.md` (~l.93) documents that exception.
- `lib/closeRules.ts`: `LIVE_IDLE_MS = 12 h` (one owner reminder, never a close), `isLiveIdle`,
  `REMINDER_KINDS`. `lib/reminderEmail.ts` `sendLiveIdleReminders` (ledger
  `SessionReminderDelivery`, kind `live_idle`, sent once per session).
- Cron `app/api/cron/close-expired-sessions/route.ts`: pass 1 closes `status: "active",
  closesAt < now` (batch 25) through `closeSessionInternal(id, { reason: "cron", emails:
  "await" })`; nothing closes a LIVE session. `CloseReason` is in `lib/closeSession.ts`.
- At close, complete unsent drafts stay as drafts and are left out (`DRAFT_AT_CLOSE =
  "exclude"`); a later PR (WP4b) lets the owner accept them. Do not build that here.

## 1. C5 — group results are visible only at close
"Nothing about the group is shown before close" (it biases cuppers, and in a self-paced
session it spoils the cupping for whoever has not cupped yet).
- `canViewGroupResults`: remove the `allSubmitted` condition (and the parameter). Visible to
  the owner, or when the session is closed, or expired. Update both callers and stop computing
  what they no longer need. The participant-summary route keeps its 409 while hidden.
- **PHASE 28**: re-issue `public.can_view_group_results` without the all-submitted branch
  (same signature, `STABLE SECURITY DEFINER SET search_path = public`, same grants; keep the
  comment "SQL twin of canViewGroupResults"). Dry run: applies the function inside the DO
  block and reports, for every ACTIVE group session, how many would lose group visibility for
  participants today (sessions where everyone submitted but the session is not closed), then
  rolls back. Replay test, runbook section (order: deploy and SQL in either order is safe,
  both only narrow visibility; apply the SQL right after the deploy), commented rollback with
  the PHASE 21 body. Other PRs add PHASE 26 and 27 before yours: number yours 28, append after
  the last phase present, and write the "last phase" test to tolerate them landing first.
- Add a pure test that TypeScript and a hand port of the SQL agree on every combination of
  (owner, status, expired).
- Copy: `results.communityPending` → es "Los resultados del grupo aparecerán cuando el
  organizador cierre la cata." (+ en), and any other text that promises group results "when
  everyone has submitted" (grep both message files, the close email, the participant summary
  PDF strings, `docs/flows.md`).
- A participant's OWN results stay visible exactly as today. Solo sessions are unaffected.
- Check everything that leaks group data before close through another path and gate it with
  the same rule: the results payload (`gateSampleForViewer`), realtime handlers on the results
  page, `ResumenTab`, `DescriptoresTab` (descriptor clouds across cuppers), `CupperAlignment`,
  the CSV and PDF routes, the cup page's "enviados" counter (a count of who has submitted is
  fine for the owner only). List what you found and what you changed.

## 2. C9 — never reopen
Once the closing date has passed, the session is closed for date changes too.
- `updateSession`: use `isSessionExpired` (server clock) instead of the status-only check, so
  ANY update of an expired session is refused with `session_closed`, including a new closing
  date and clearing the date. `planClosesAtChange` keeps its own rules for sessions that are
  still open. Update or replace the tests that pin the old exception
  (`tests/actionsAndState.test.ts` "an unchanged stored date is a no-op even when it is now in
  the past", `tests/closesAtZone.test.ts` "saving an unrelated field on a Bogota session is a
  no-op even after the date passed"): the pure function may stay as it is, but there must be a
  test at the action-rule level that an expired session refuses the change (extract a pure
  `canEditSessionSettings(row, now)` if that is the cleanest seam).
- Edit page/form (`app/[locale]/app/sessions/[id]/edit/`): an expired session renders fully
  read-only, closing-date control included, with the existing "session closed" notice. Another
  PR (WP9b) may already have introduced an `expired` flag there: build on what `origin/main`
  has when you start.
- `docs/flows.md` (~l.93): remove the documented exception. Mark `TODO(kim-validar:C9)`.

## 3. C3 — live sessions: reminder at 24 h, automatic close after 7 idle days
- `LIVE_IDLE_MS` becomes 24 h (the owner reminder, still sent once).
- New `LIVE_AUTO_CLOSE_MS = 7 days` and a pure `isLiveAbandoned(row, lastEvaluationAt, now)`
  (same shape as `isLiveIdle`: group, not async, no `closesAt`, active, started; idle =
  time since max(startedAt, last evaluation update)). Unit tests at the boundaries.
- Cron: a new bounded pass (batch 25, oldest first) that closes abandoned live sessions through
  `closeSessionInternal(id, { reason: "idle", emails: "await" })` (add `"idle"` to
  `CloseReason`); per-session failure logged and isolated like pass 1; the JSON summary gains
  `idleClosed` (count) and `idleTruncated`. Sessions never started are not touched. Solo
  sessions are not touched.
- The close email and the results notice for a session closed this way must not claim the
  organiser closed it: check `lib/closeEmail.ts` and `results.closedNotice` and make the
  wording neutral if needed ("La cata se cerró.").
- Runbook: the manual check for the new pass, next to the cron's section. First production run
  may close several forgotten sessions at once: the dry-run SQL of PHASE 28 should ALSO report
  how many live sessions are idle for more than 7 days today (read-only count), and the
  runbook says to read that number before the deploy. Mark `TODO(kim-validar:C3)`.

## Docs
CLAUDE.md "Session Lifecycle" (visibility rule, no re-dating, idle close, PHASE 28),
`docs/flows.md` §1 diagrams, `docs/LAUNCH-RUNBOOK.md`.
