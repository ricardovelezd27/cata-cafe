S8-12 PLANNER REPORT (read-only; checked against origin/claude/s8-03-guest-guard-email-impl, "B", plus the s8-01 and s8-02 branches)

1. BUILDABLE NOW
All Kim items (D1, D2, D3, D5) have explicit defaults in the spec, so nothing is truly blocked.
T1. Ranking honesty, pure. Add `RANKING_POLICY` (min n 3, indicative below 5, gap 0.5×SD) to `lib/reports/ranking.ts`. Ties share a rank (1,1,3). Rows get n, basis, indicative, suppressed, noClearGap. Extend `RankableSample.aggregateScore` with participantCount, submittedCount and total. Tests go in `tests/reports.test.ts`, because `tests/ranking.test.ts` does not exist. Closes F-resultados-6.
T2. Wire T1 into `ResumenTab.tsx` (:127-140 stat cards, :181-210 ranking rows), `lib/reports/participantSummary.ts` (:129-134) and the ficha. Adds i18n and the "indicativo", "sin diferencia clara" and "basis mine" labels. Closes F-resultados-6.
T3. "n de N incluidos" everywhere. Files: `results/page.tsx`, `lib/reports/sessionReportData.ts`, `SampleRadarChart.tsx`, `ParticipantSummaryDocument.tsx:564`, `OwnerParticipantSection`. The participant PDF also states when the viewer's own evaluation is excluded. Closes F-informes-3 and F-resultados-5 (n of N half).
T4. Migration (one, 4 nullable columns): `session_participants.excluded_at`, `excluded_by` (text, no FK), `exclusion_reason`, plus `extrinsic_data.edited_at`.
T5. `setParticipantExclusion` becomes `run()` → `ActionResult`, with `oneOf` reason, author and time stamped, and cleared on restore. It is allowed after close. Add `ExclusionDialog` and `useActionFeedback` in `OwnerParticipantSection` (:148-160), show who, when and why in the matrix, and add a "Resultados actualizados el" banner and PDF line. Closes F-resultados-5.
T6. `upsertExtrinsic`: owner AND `revealed` allowed after close, otherwise `session_closed`. Stamp `edited_at`, return `ActionResult`, localize `ExtrinsicEditDialog` errors, and fix the stale comments. Show "Origen editado el" in reports. Closes F-resultados-4.
T7. Results hygiene. Localize the radar card (SampleRadarChart :213,233-238,258,262-266). Hide Revelar when closed. Guard `localStorage` at `ResultsClient.tsx:86-88`. Drop `onEdit` when closed (:1001). Add `next=` to the login redirect at `results/page.tsx:33`. Closes F-resultados-7 (UI half) and F-resultados-10.
T8. Report stamps. New `lib/pdf/sections/ReportStamp.tsx` (server date/time, locale, inclusion line, Borrador). Set `language` on every Document, which is supported (`@react-pdf/renderer/index.d.ts:53`). Date in filenames. Eight radar values as text. `cva-pdf` gets try/catch, a log line and `maxDuration` (copy the participant-summary pattern, :23 and :42). `closeEmail.ts:246` uses `referenceRank` and `orderReferencesFirst`. Closes F-resultados-8, F-informes-3, F-informes-5, F-informes-6, F-informes-7.
T9. Owner CSV at `app/api/sessions/[id]/results-csv/route.ts`. Extract `csvCell` from `lib/analytics/usersCsv.ts:12` to `lib/csv.ts`. Closes F-informes-7.
T10. Coffee links. `rotateCoffeeInvite`, a 30-day expiry in `createCoffeeInvite`, `maxUses` checked inside the transaction in `joinCoffeeViaToken`, invites deleted when leaving shared/public, and a keep/clear list on return. Files: `coffees.ts`, `CoffeeShareManager.tsx`. Closes F-cafes-4 and F-cafes-5.
T11. Docs: `flows.md` §1/§5/§6, CLAUDE.md sanctioned-writes line, "Fixed in S8-12" lines in the audits.

2. GATED
None blocked. Leave named TODOs for the points where Kim could overturn the default:
- `TODO(Kim-D1)`: if origin edit after close is refused, hide the button and drop the allow-list in T6.
- `TODO(Kim-D2)`: no notification to the excluded cupper; the reason list is a constant.
- `TODO(Kim-D3)`: `RANKING_POLICY` values.
- `TODO(Kim-D5)`: CSV uses names, with a codes flag.

3. FACTS FOR THE ARCHITECT
- Premise is wrong. Branch B contains only S8-03's 6 commits and is NOT stacked on S8-01 or S8-02. `isSessionExpired` and `assertSessionStarted` exist only on `origin/claude/s8-01-rls-closed-readonly-impl`. `lib/pdf/sheetSource.ts` exists only on s8-02. Expect conflicts in `community.ts`, `sessions.ts`, `results/page.tsx`, `ResultsClient.tsx`, `cva-pdf/route.ts` and `closeEmail.ts`. Two designs: branch from B and rebase later, or wait and stack on all three.
- S8-01 already converts `revealSample` to `run()` + `assertSessionWritable` (its `ActionResult` signature drops the `coffeeId` arg). T7 should do only the UI hide, not the action.
- S8-01's PHASE 21 drops the `participants_write` and `ext_all` policies. Prisma bypasses RLS, so T5/T6 still work, but check them against the PHASE 21 text.
- `submittedCount` is already filtered to non-excluded cuppers (`page.tsx:228` skips excluded before `computeGroupAggregate`). So `submitted`/`participantCount` cannot give N. The pre-filter total must be computed separately. The fallback branch (`page.tsx:650`) sets `submittedCount` = `participantCount`.
- `participantSummary.ts:229` counts `participants.length`, which includes non-submitters.
- `ExtrinsicData` has no `updatedAt` (`revealedAt` is overwritten on every save), which is why `edited_at` is needed.
- Inconsistent: `updateSampleMetadata` is the "second" sanctioned write. `upsertExtrinsic` is listed as the first, but it throws on closed sessions.
- F-cafes-4: revoke should either auto-rotate the invite or only offer rotation. Rotation can delete the invite (old URL reads "invalid") or set `expiresAt` to now (keeps `useCount`). `createCoffeeInvite` already honors `expiresAt`, so no migration is needed there.
- F-informes-6: the spec's "S8-02 sheet helper" handles blind identity, not references. Use `orderReferencesFirst` and `referenceRank`.
- The spec says to run S8-12 after S8-04 (scoring, gated on Kim A1). T1 to T3 are display-only and do not need it.
- The new migration timestamp must be later than S8-03's migration.

4. FILES TOUCHED
`lib/reports/ranking.ts`, `lib/reports/participantSummary.ts`, `lib/reports/sessionReportData.ts`, `lib/reports/fichaTecnica.ts`, `lib/csv.ts` (new), `lib/analytics/usersCsv.ts`, `lib/pdf/sections/ReportStamp.tsx` (new), `lib/pdf/filename.ts`, `lib/pdf/*Document.tsx` (6), `lib/closeEmail.ts`, `app/actions/community.ts`, `app/actions/sessions.ts`, `app/actions/coffees.ts`, `app/api/sessions/[id]/{cva-pdf,participant-summary,ficha-tecnica,results-csv}/route.ts`, `results/{page,ResultsClient,ResumenTab}.tsx`, `components/results/{OwnerParticipantSection,SampleRadarChart,ExtrinsicEditDialog}.tsx`, `CoffeeShareManager.tsx`, `prisma/schema.prisma`, one new migration, `messages/{es,en}.json`, `tests/reports.test.ts`, new tests, `docs/flows.md`, `CLAUDE.md`, the three audit files.
A Prisma migration is needed. No SQL PHASE and no new runbook section are needed, only a "migrate deploy" note in the existing runbook.

5. SIZE: M to L (about 10 tasks). Worth its own PR. Splitting is optional: T1-T3 and T8 are pure display, while T4-T6 carry the migration.