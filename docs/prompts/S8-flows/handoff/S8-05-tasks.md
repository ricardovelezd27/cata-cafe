S8-05 PLANNER REPORT (read-only; code checked on origin/main, s8-01 and s8-03 branches)

1. BUILDABLE NOW (C1/C2/C3/C7 all have spec defaults, so nothing is blocked)
T1. Pure rules + tests: `lib/closeRules.ts` (`DRAFT_AT_CLOSE="exclude"`, `countUnsentComplete`, `endOfDayInZone`, `planFinish`), `tests/closeRules.test.ts`, `closesAtZone.test.ts`, `finalizeClose.test.ts`. Closes nothing alone; every later task depends on it.
T2. Migration: `closesAtZone`, `closeFinalizedAt` (backfill = closedAt), table `session_reminder_deliveries`. Touches `prisma/schema.prisma`, new migration. Setup for F-solo-1 and F-grupal-asincrona-7.
T3. Two-phase close: split `lib/closeSession.ts` into flip + `finalizeClosedSession`; a bounded repair pass and `logError` in the cron; the solo-owner resubmit repairs a closed, unfinalized session instead of throwing. Closes F-solo-1, F-grupal-asincrona-7.
T4. Close-impact dialog: owner-only `getCloseImpact` read, count of unsent complete drafts and the rule sentence in the confirm dialog and the close email. Closes F-grupal-2 and half of F-grupal-asincrona-1.
T5. Honest offline replay: `syncEvaluation` returns `closed` instead of `discarded`; new `closed_unsent` SyncStatus; hook, badge and a persistent notice; `/results?closed=1` notice. Closes F-offline-1 and the other half of F-grupal-asincrona-1.
T6. Zone-aware deadline: `closesAtZone` posted from the forms, `endOfDayInZone` replaces `dateOnlyEndOfDay`/`planClosesAtChange`/edit read-back; deadline shown on join, waiting, cup header and list row; 24h `deadline_24h` reminder in the cron. Closes F-grupal-asincrona-3 and -4.
T7. `finishSoloSession` ("Terminar cata") plus guard copy and results notice. Closes F-express-1, F-solo-3.
T8. Cron pass: one `live_idle` owner reminder at 12h of inactivity, never closes. Closes F-grupal-8.
T9. Consequence notice before saving a closing date on an unstarted live session (es/en). Closes F-sesiones-12.
T10. docs/flows.md §1 and the CLAUDE.md note, audit "Fixed in S8-05" lines.

2. GATED (build the default; leave a named TODO)
- C1 option (d): the owner "accept late contribution" is a post-close write. Leave `// TODO(S8-05/C1-d)` in `closeRules.ts` and flows.md §1. Do not build `promote_complete` beyond the constant and the pure function (off).
- C7: separating `isAsync` from `closesAt`. Leave `// TODO(S8-05/C7)` at `planClosesAtChange` and `createGroupSession`. Only the notice ships.
- C2 option "correct after closing" is out (default no). C9 (reopen) is out of scope.

3. FACTS FOR THE ARCHITECT
- The three batch-1 branches are NOT stacked. `origin/claude/s8-03-guest-guard-email-impl` is based on main 8a718c4 and does not contain S8-01. `isSessionExpired`, `assertSessionStarted` and the richer `SampleAuthRow` live only on `origin/claude/s8-01-rls-closed-readonly-impl`. Branch from a merge of both (`lib/sessionAuth.ts` and `app/actions/community.ts` will conflict), or wait for the merges.
- Step 5's "extend assertSessionWritable to take {status, closesAt}" is already done by S8-01 (`ExpiryRow`, strict `<`, `submitAllEvaluations` conditional update). Skip it. Write-stop at the deadline exists; only the zone and display work remain.
- Runbook numbers are stale. §10 is S8-01 and §11 is S8-03, so the next free section is §12, not §11 or §13 as the spec says. SQL: none needed (spec agrees). Migration: exactly one.
- S8-04 does not exist, so there is no `lib/aggregates.ts` or `refireAggregates`. Phase 2 must leave a `// TODO(S8-04) refireAggregates` hook.
- The spec's `mergeGuestData` edit is unnecessary. `CloseEmailDelivery.userId` is a plain String with no FK, so a reminder table modelled the same way adds no user FK. Do not add a Profile FK.
- The client cannot see thrown codes in production (opaque digest). Physical and extrinsic replay throw `session_closed`, so the hook retries 3 times and returns "failed" forever. T5 therefore needs result-returning replay wrappers in `app/actions/offline.ts` (`syncPhysical`/`syncExtrinsic` returning a status). The spec only mentions "replay".
- On main, `app/actions/offline.ts:48` uses `status === "closed"`. On the S8-01 branch it is `isSessionExpired(auth)`. Rebase T5 onto the S8-01 version; an expired but still-active session also yields `closed`.
- `submitAllEvaluations` throws at the top via `assertSessionWritable` before reaching any repair logic. The F-solo-1 repair must run before that guard. Design A (the spec): a `closeFinalizedAt` column plus a repair in resubmit and cron. Design B: wrap flip, reveal and `syncCoffeeHistoryForSession({db: tx})` in one `$transaction` (the `db` option already exists), which needs no column. B does not retry failed group emails. The cron only selects `active` sessions and `resendCloseEmails` is manual, so a repair pass is still needed for emails.
- `removeSessionSample` (main) has no `assertSessionWritable` (S8-01 adds one) and is an action keyed on a sample id. `finishSoloSession` must extract the prune-plus-rank-compaction-plus-position-repack transaction into a lib function, not call the action. Opening the reference sample auto-saves a pinned draft, so the reference always has a row and is never pruned.
- "Submit the owner's complete drafts" conflicts with `submitAllEvaluations`, which submits every draft. Two designs: submit all drafts (simple, matches F-solo-3 case A) or submit only complete ones via `lib/completeness.ts` and leave partials as drafts. The spec's "keeps partial ones without a score" implies the second. Needs the architect's call.
- Deadline zone: legacy rows have a null `closesAtZone`, so fall back to UTC (current behaviour). `planClosesAtChange` compares `toISOString().slice(0,10)` for no-op detection; that must switch to zone-aware too, otherwise saving unrelated fields on a Bogotá session throws `invalid_closes_at`.
- The daily 06:00 UTC cron means the "24h before" reminder arrives 0 to 24h before the deadline. Use a window `closesAt in (now, now+24h]` with the ledger to dedupe. Reminders are system mail, not user-triggered, so keep them out of the S8-03 `reserveEmailBudget` and use their own ledger. Guests have no email and get no row.
- The `live_idle` signal: `Evaluation.updatedAt` exists; "start" is `startedAt`.
- The cron already has `maxDuration` 300; three passes are fine if each is capped at BATCH 25.

4. FILES TOUCHED
prisma/schema.prisma; prisma/migrations/<new>/migration.sql; lib/closeRules.ts (new); lib/closeSession.ts; lib/sessionState.ts; lib/validate.ts; lib/offline/types.ts; lib/offline/store.ts (status only); lib/closeEmail.ts; lib/sessionRouting.ts (maybe); app/actions/community.ts; app/actions/offline.ts; app/actions/sessions.ts; app/api/cron/close-expired-sessions/route.ts; hooks/useOfflineSync.ts; components/offline/PendingDraftsBadge.tsx; components/offline/SessionSyncStatus.tsx; app/[locale]/app/sessions/[id]/cup/page.tsx; cup/CupClient.tsx; results/page.tsx; results/ResultsClient.tsx; edit/page.tsx; edit/EditSessionForm.tsx; new/NewSessionForm.tsx; join/waiting pages; messages/es.json and en.json; docs/flows.md; docs/LAUNCH-RUNBOOK.md (§12, migrate deploy only); CLAUDE.md; docs/audits/flows-2026-11/05,07,08,09,11,15; tests/closeRules.test.ts, closesAtZone.test.ts, finalizeClose.test.ts.
Needs: one Prisma migration (yes), SQL phase (no), runbook section (yes, §12).

5. SIZE: L. Worth its own PR, but only after S8-01 and S8-03 are merged (two shared-file conflicts). T3 and T6 are the riskiest; T7 to T9 can ship separately if the PR gets too big.