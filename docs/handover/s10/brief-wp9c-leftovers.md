# Brief — S10 leftovers (small follow-ups the independent reviews left for "a later PR"; no schema change, no SQL)

Branch: `claude/s10-09c-leftovers-impl` from `origin/main`. DRAFT PR against `main`.
PR title: `S10 leftovers: reservation move retried nightly, nightly passes isolated, guest re-key follow-ups`
`npm run test:db` required. Read `docs/handover/s10/brief-00-common-rules.md` first, then
CLAUDE.md sections named per item. Each item is small: verify what exists FIRST, then build
only what is missing. If an item cannot be pinned down from the code, STOP on that item,
report what you found, and continue with the others. No product decisions.

Do NOT touch (other PRs in flight): `app/actions/community.ts`, `CupClient.tsx` beyond item
C2's one call, the results page, `resultsCsv.ts`, `components/coffees/*`, the cup forms.

## A. Unused-account deletion (built in #118; switch `UNUSED_ACCOUNT_PURGE_ENABLED` is OFF). These must land before the owner ever turns it on.
Read CLAUDE.md "Insights Access Levels" (the long paragraph: `purgeUnusedAccounts`,
`recordEmailChange`, `moveReservationAfterEmailChange`, `completedEmailChange`,
`moveWaitlistEntry`), `lib/unusedAccountPurge.ts`, `lib/unusedAccountRules.ts`,
`lib/emailChangeMove.ts`, `lib/emailChangeRules.ts`, `lib/waitlistMove.ts`,
`app/api/cron/close-expired-sessions/route.ts`, runbook §17 item 4.
- A1. A reservation move that FAILED at verify time is never retried (the record stays in
  `app_metadata.email_change`; the reservation stays at the old address and would later be
  deleted as an orphan although the account is in use). Add a bounded reconcile pass to the
  daily cron, run BEFORE the unused-account pass: select (in SQL against `auth.users`, the
  way the purge selects its candidates; at most 50 per run, oldest first) the accounts whose
  `raw_app_meta_data` has the `email_change` key; for each, read the user through the admin
  API and apply the EXISTING rules: `completedEmailChange` true → run the same move the
  verify path runs (same function, same refusals: `old_address_held` keeps the record); the
  record is inert (the account's current address is not the recorded `to` and no change is
  pending) → clear ONLY that key. Per-account try/catch; logs carry ids and codes only; the
  cron JSON gains `emailChangeReconcile: { seen, moved, cleared, kept, failed }`. It runs
  whether or not the purge switch is on (it deletes nothing). Pure decision function
  (`reconcileAction(record, authUser)` → move | clear | keep) + unit tests; DB test for the
  SQL selection and the move.
- A2. `moveWaitlistEntry` when a reservation ALREADY exists at the new address
  (`target_exists`): today (check) the person's original reservation stays stranded at the
  old address. New rule: both rows are the same person's (they proved control of the new
  address); keep the EARLIER-created row (their place in the list), set its address to the
  new one, and delete the other, in one transaction; the kept row keeps its own
  `source`/consent fields, taking the other's consent stamp only where its own is null.
  Unit + DB tests. If the current code already does something safe and different, report
  it instead of changing it.
- A3. Runbook §17 item 4 pre-flight: in the Supabase SQL editor `current_user` is
  `postgres`; correct the expected answer of the check to what the editor really shows
  (postgres / true) and re-read the whole rehearsal: step 1 must say exactly how the
  throwaway account is created so that it qualifies as "never used" under
  `notUnusedReason` (through the landing form only; never opening the sign-in link). Check
  each rehearsal sentence against the rules in the code and fix any that is not true.
- A4. `normalizeEmail` (find it) delegates to `normalizeAddress` (`lib/emailChangeRules.ts`):
  one implementation, callers unchanged, test that both give the same result on a table of
  inputs. If they intentionally differ, report and do not merge them.

## B. Nightly close job (#123)
Read CLAUDE.md "Session Lifecycle" (idle auto-close, grandfather rule, `repairEmailMode`),
`lib/closeRules.ts`, `lib/idleClose.ts`, the cron route, runbook §33.
- B1. `repairEmailMode` stays silent when the session's creator is a deleted-account
  placeholder. Consequence to DOCUMENT, not change: if a session closed by its deadline
  failed its first finalize and the organiser deleted the account before the repair, the
  participants never get the close email (they still see results in the app). One comment at
  the rule, one line in `docs/flows.md` §1 and runbook §33, one test that pins it.
- B2. A test that pins the grandfather input of `repairEmailMode` (a session started before
  `IDLE_RULE_EFFECTIVE_AT` and closed for idleness is repaired silently; started after →
  per the idle decision).
- B3. In the cron route, the deadline-close candidate query and the repair candidate query
  must not take the later passes down when they throw: wrap each PASS so a failure is logged
  (`logError`, ids/codes only), flagged in the JSON summary (`…Failed: true`) and the next
  passes still run. The ledger purge stays last. Test the pass runner as a pure function if
  one exists, else extract a tiny one.
- B4. Runbook §33: replace "deploy before the effective date" with the fact: deployed
  2026-11-13, PHASE 28 applied the same day.

## C. Guest identity follow-ups (#126)
Read CLAUDE.md "Guests" (the long "Shared device" paragraph), `lib/identityResolve.ts`
(`reloadIdentity`), `lib/offline/claimMarker.ts`, `lib/offline/claimRekey.ts`
(`awaitClaimRekey`, `decideClaimRekey`), `hooks/useOfflineSync.ts`,
`components/join/GuestIdentityChoice.tsx`, `app/actions/join.ts` (`joinSessionAsGuest`).
- C1. Order tests: `reloadIdentity()` runs before-reload hooks, THEN the re-key, THEN the
  reload (inject the three as functions if needed to test without a browser); "No soy
  {nombre}" announces and clears device state only AFTER `signOut` succeeded (pure sequencing
  function or a test of the existing one).
- C2. After the cup page's `awaitClaimRekey` actually moved something, kick ONE replay
  (`useOfflineSync().retrySync` or its equivalent) so the moved pending modules sync without
  waiting for a reconnect. One call, guarded so it cannot loop. Test the guard as a pure rule.
- C3. The completion marker (`cata_claim_done`): verify it has an expiry (the re-key no
  longer clears it) and pin the TTL with a test; if it never expires, give it the same TTL
  rule `decideClaimRekey` already uses for freshness and remove expired markers on read.
- C4. A happy-path test for `joinSessionAsGuest(token, locale, expectedUserId)`: same user
  signed in → joins; different user → refused (if the refusal is already tested, add only
  the happy path). DB test.

## D. Three items the original S10 plan listed; verify each, build only what is missing
- D1. The "new version, reload" notice shows wherever the pending-drafts badge shows
  (CLAUDE.md "Save Status Honesty": `StaleBundleNotice`, `lib/staleNoticePlacement.ts`).
- D2. The owner's cup page refetches once on foreground resume (CLAUDE.md "Platform seam":
  `resumeKey`).
- D3. `app/[locale]/app/sessions/[id]/edit/page.tsx` uses `isSessionExpired` (read-only once
  the closing date passed).
Report each as "already there (file:line)" or "built".

## Docs
CLAUDE.md lines for A1, A2, B3, C2/C3; `docs/flows.md` and the runbook as said per item.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors in `app/[locale]/dev/page.tsx` and
`components/ui/IntensitySlider.tsx`, `npm run build` after the last change). A unit-test
timeout under load is not a failure if the file passes alone (say so). If `npm ci` stalls
more than ~15 minutes: commit, push, say so. Report per item: what existed, what you
changed (file:line), tests added; the final text of each pure rule; the cron JSON shape
after your change; gate tails with exact counts; anything not done or doubtful.
