S8-04 PLANNER REPORT (checked against origin/claude/s8-03-guest-guard-email-impl, "tip")

1. BUILDABLE NOW (A1/A2/A3 all have explicit spec defaults: 1a, "5 in affective/combined, free in descriptive", tag)
T1. lib/scoring.ts: export MIN_CUPS_FOR_PENALTIES=5 and penaltiesApply(cups). Route calcIndividualBreakdown (:276), computeGroupAggregate (:209) and calcCommunityScore (no gate today, :323) through it. calcCommunityScore needs a cups argument or must receive already-gated totals. Closes F-grupal-1.
T2. prisma/sql/rls_and_triggers.sql PHASE 23: re-issue recompute_aggregate_score() with the body at :710-:840, adding "IF v_cups_per_sample >= 5 AND v_total_cups > 0" around both penalties. Also add the idempotent recompute UPDATE and the previous body verbatim in a comment. F-grupal-1.
T3. tests/scoringConsistency.test.ts (pure TS port of the SQL arithmetic vs calcCommunityScore and computeGroupAggregate; 2x2 case gives 80.00, 5-cup case gives -1.0, defective-only, 1 cup, zero evals). Update tests/scoring.test.ts:39. F-grupal-1.
T4. components/ui/CupToggleGrid.tsx: hide the boxes below 5 cups. Stored flags stay in the arrays. F-grupal-1.
T5. NewSessionForm.tsx (cupsInput at :276-277, label key at :687): default 5 for affective/combined (descriptive free), label "Tazas por muestra", inputMode numeric, hint for 1-4, field hidden for descriptive. Append es/en keys at the END of each JSON. F-04-4, F-crear-sesion-5.
T6. Stale aggregates: upsertEvaluation (sessions.ts:577, update branch :~612) and syncEvaluation force path (offline.ts:~79-94). Add a pure helper (for tests/aggregateRefire.test.ts) and fix the comment at offline.ts:26-28. Solo-only: a replay over the owner's own submitted solo row applies instead of returning conflict. Needs isGroup added to SampleAuthRow (lib/sessionAuth.ts:84; absent today). F-solo-2, F-offline-7.
T7. Extract refireAggregates(sessionId) from refreshAggregateScores (community.ts:463) into lib/aggregates.ts. Call it in closeSessionInternal (lib/closeSession.ts:60) before syncCoffeeHistoryForSession. F-solo-2.
T8. lib/coffeeHistory.ts: communityScore = null unless aggregateScore.participantCount > 0. The select at :~36 only has communityScore, so add participantCount. F-solo-4.
T9. History tag: HistoryTable.tsx and the coffee profile get an "impresion rapida" Badge when cupsPerSample < 5. Read it from the snapshot or select it on the session in history/page.tsx:~30; the session select currently has only id and name. F-express-4.
T10. scripts/resync-low-cup-history.ts (dry-run by default, --apply), runbook section, docs/flows.md, and "Fixed in S8-04" lines in the audit files.

2. GATED
Nothing is truly blocked; the defaults are built. Leave these named TODOs:
- TODO(A1): code stays on 1a. Option 1b (proportional deductions) is not built. If Kim picks (b), stop and ask.
- TODO(A2): a one-line constant for the default cup count.
- TODO(A3): the tag ships as (b); (c) would drop the score from history.
- Owner steps: apply PHASE 23, run the recompute, run the resync script with --apply.

3. FACTS FOR THE ARCHITECT
- The spec says CupToggleGrid should hide the boxes, but the tip already shows them with a "notScored" note when uniformityInScore is false (CupToggleGrid.tsx:24,86). Two designs: hide them (spec, per Kim A1) or keep the note and drop only the scoring. The spec's hide is a UX change on top of the note that is already there.
- The spec's line refs for the SQL are right (function at :710, penalties at :765-772).
- Spec step 4 hazard: putting isDraft:false into the upsert's update SET would SUBMIT a draft. The update branch needs to know the row is submitted. Design (a): pre-read isDraft, which costs a query on the 800 ms hot path. Design (b): after the upsert, run updateMany({id, isDraft:false}, data isDraft:false). That fires only for submitted rows and adds nothing to draft saves. I recommend (b).
- upsertEvaluation has no submitted-row guard today. If the UI locks submitted rows, the F-solo-2 path may be rare, but the server permits it.
- Close-time refire (T7) causes a trigger storm of roughly evals x evals at close, on the 120 s close path. The alternative is to rely on T6 alone and skip T7. Spec wants both; the cost is probably acceptable at under 50 cuppers.
- refreshAggregateScores lives in a "use server" file and requires an owner, so it is a public endpoint. Extracting it to lib/ removes one. T7 also lets the action stay a thin wrapper.
- The tip has NO PHASE 21 (S8-01 is a separate branch, origin/claude/s8-01-rls-closed-readonly-impl). The tip has PHASE 22 and runbook section 11 only, and section 10 is absent. Your brief says it has PHASE 21; it does not. Spec numbers (PHASE 23; runbook sections 10 and 12) will collide or leave gaps. Take the next free number at merge, per README.
- "Results recompute from raw evaluations" (offline.ts:26-28) is only partly true. History and the coffee profile read the stored AggregateScore, which is why T6 matters.
- F-solo-4: the trigger writes communityScore=0 when there are no complete evaluations (COALESCE to 0). Descriptive sessions therefore store 0.00, not null, so the null mapping must happen in the history sync.
- Past scores for sessions under 5 cups change once under 1a. Kim needs to be told.

4. FILES TOUCHED
lib/scoring.ts, lib/coffeeHistory.ts, lib/closeSession.ts, lib/aggregates.ts (new), lib/sessionAuth.ts, app/actions/sessions.ts, app/actions/offline.ts, app/actions/community.ts, components/ui/CupToggleGrid.tsx, app/[locale]/app/sessions/new/NewSessionForm.tsx, app/[locale]/app/profile/history/page.tsx, app/[locale]/app/profile/history/HistoryTable.tsx, coffee profile page and its history list, messages/es.json, messages/en.json, tests/scoring.test.ts, tests/scoringConsistency.test.ts (new), tests/aggregateRefire.test.ts (new), scripts/resync-low-cup-history.ts (new), prisma/sql/rls_and_triggers.sql, docs/LAUNCH-RUNBOOK.md, docs/flows.md, the audit files under docs/audits/flows-2026-11/.
Needed: no Prisma migration; one SQL phase (unapplied, flag it); one runbook section; a manual resync script.

5. SIZE: M. It is worth one PR on its own, because the code is not gated and only the SQL and the script need the owner.