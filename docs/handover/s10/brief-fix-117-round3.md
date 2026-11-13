# Brief — third fix round for PR #117 (S10 WP1a, scoring core)

Branch: check out the EXISTING branch `claude/s10-01a-score-core-impl` (tip `d02cf4a` when this
was written): `git fetch origin && git checkout -b s10-01a-fix3 origin/claude/s10-01a-score-core-impl`,
then `git merge origin/main` (never rebase or force-push). Push with
`git push origin HEAD:claude/s10-01a-score-core-impl`. The PR exists (#117): do not open a new
one; update its body.

Read first: CLAUDE.md on the branch (scoring sections), `docs/product/cata-descentralizada-puntaje.md`,
`lib/aggregates.ts`, `lib/scoreRule.ts`, `lib/legacyDrafts.ts`, `lib/guestClaim.ts`,
`prisma/migrations/20261113090000_evaluation_cups/migration.sql`, runbook §30,
`tests/db/scoreRuleActions.dbtest.ts`, `tests/db/README.md`.

A third independent review confirmed the rule, the TypeScript/SQL equality, the dry run (it
leaves nothing behind), the submit paths and the gates. It found the following. The OWNER RULE
stays: no past score changes by itself; data says which rule produced a number
(`Evaluation.cups IS NULL` = old rule; `AggregateScore.ruleVersion`).

## M-A — the migration's lock timeout does nothing (proven)
`prisma migrate deploy` (7.7.0) sends the file statement by statement in autocommit, so
`SET LOCAL lock_timeout` is outside a transaction: the reviewer's probes read `lock_timeout = 0`
and two different transaction ids for the two ALTERs. So nothing bounds the lock wait, and a
failure on the second ALTER would leave the first committed (the runbook's recovery path would
then fail with "column already exists").
Fix exactly as the reviewer verified: the file becomes
`BEGIN; SET LOCAL lock_timeout = '5s'; ALTER …; ALTER …; COMMIT;` (comments kept). Prove it
the way the reviewer did, on the throwaway database through the suite's own `migrate deploy`
path: a scratch copy with probes shows `5s` on both probes, ONE transaction id, and `0` in the
next migration; do not commit the probes; describe the evidence in your report. Runbook §30
step 1: the P3018 / `migrate resolve --rolled-back` / re-run text is now true; say why in one
sentence (one transaction: nothing is applied when it fails), and add the reviewer's read-only
pre-check to run right before the migration:
`select pid, now() - xact_start, state from pg_stat_activity where xact_start < now() - interval '5 seconds';`
(expect no rows; if there are rows, wait and re-run the check).

## M-B — the close pass still gives a first score under the new rule to an all-old sample that has no aggregate row
`lib/aggregates.ts` (~l.50-54), `keep-old-rule` mode: `EXISTS (… "ruleVersion" = 1)` is false
when the sample has no aggregate row, so it is re-fired, and a results page that showed the
old-rule number (`sampleScoreRule` → v1 when there is no row and every evaluation has `cups`
NULL) starts showing a v2 number.
Fix: in `keep-old-rule` a sample is skipped when
`NOT EXISTS (aggregate row with "ruleVersion" <> 1) AND NOT EXISTS (submitted evaluation with cups IS NOT NULL)`
(so: no row, or a v1 row, and no new data → untouched). Update the comment's truth table to
the seven rows the reviewer listed (aggregate absent / v1 / v2 × all NULL / some with cups /
none submitted).
DB tests (the reviewer showed two conditions are pinned by NO test): (1) no aggregate row +
all-NULL submitted evaluations → after `finalizeClosedSession` there is still no aggregate row
and the session finalizes (reveal, history, stamp); (2) `ruleVersion` 2 + all-NULL evaluations
→ re-fired; (3) the existing (a)-(d). Then verify by mutation, and say so in your report:
dropping the `"ruleVersion"` condition, and dropping the whole aggregate condition, must each
fail at least one test.
Check what else assumes an aggregate row exists after finalize (history sync
`syncCoffeeHistoryForSession`, the close email, results) and say what each shows for such a
sample (it is what `origin/main` shows today before a repair: confirm).
Runbook §30 pre-flight: add the reviewer's read-only query that lists samples in this shape
(submitted evaluations, no aggregate row, session not closed or not finalized) and say what the
code does with them (nothing; their displayed number stays the old-rule one).

## M-C — a guest claim re-fires whole old sessions under the new rule
`lib/guestClaim.ts` (~l.122-134, 218-231, 364-368): one conflicted sample adds its whole
session to `refireSessions`, and every submitted evaluation of that session is re-fired,
including samples where nothing changed.
Fix: re-fire only the SAMPLES whose included evaluation set really changed in the merge (a
sample where an evaluation was deleted or replaced by the conflict rule; and, when an
exclusion flag differs between the two participant rows and the merged result changes who is
included, the samples that person has submitted evaluations for). Every other sample of those
sessions is left alone (not re-fired at all; if the existing statement must stay
session-scoped, give it the same keep-old-rule filter and a sample-id list for the forced
ones). Decide the sample list in a small pure function with unit tests; DB tests in
`tests/db/guestMerge*.dbtest.ts`: a closed pre-deploy session with three samples, a conflict
on one → that sample's aggregate is recomputed (stamped 2), the other two rows are
byte-identical (`communityScore`, `ruleVersion`, `computedAt`); the exclusion-difference case;
a claim with no conflict re-fires nothing.
Document the one remaining exception plainly, in CLAUDE.md and runbook §30, as a decision the
ARCHITECT took and the owner must be told (do not call it "accepted"): "when a guest claim
removes or replaces an evaluation of a sample, that sample's group score is recomputed, and
the only function that exists computes the current rule; an old sample in that situation
moves to the current rule".

## L-1 — the legacy-draft recompute can overwrite a newer autosave
`lib/legacyDrafts.ts` (~l.88-129): read with `findMany`, then `update({ where: { id } })` with
the whole module JSON. Use `updateMany({ where: { id, cups: null, isDraft: true }, data })`, so
a row an autosave rewrote in between (it now carries `cups`) is left alone. DB test: a row
whose `cups` was set between the read and the write is not overwritten (simulate by running
the helper's write step against a row updated in between, or by exposing the two steps).

## L-2 — `tests/phase26Sql.test.ts` (~l.51) asserts PHASE 26 is the last phase
Another open PR appends `-- PHASE 27 (`. Remove that assertion (the block bounds are already
right). Confirm by appending dummy `-- PHASE 27 (` and `-- PHASE 28 (` blocks containing
ALTER TABLE / REVOKE / GRANT / a write policy to a scratch copy: phase 24, 25 and 26 tests
must all pass; say so in your report.

## L-3 — three places still say the close/repair pass recomputes old samples
`CLAUDE.md` (~l.475), the comment in `prisma/sql/rls_and_triggers.sql` (~l.2327-2329, OUTSIDE
the PHASE 26 markers: the function text between the markers must stay byte-identical, the
dry run copy too), runbook §30 step 3's list. Make all three say what the code does.

## Nits
Dry-run report (text only, outside the function markers): line 3 also explains large increases
on samples under five cups ("rows stored by an older version of the function, which amplified
deductions under five cups"); line 6 "1 cup per sample" (singular). Update the runbook's
example report accordingly (regenerate it from `tests/db/phase26DryRun.dbtest.ts`).

## Do not change
The rule, the v1 branches, the PHASE 26 function text between the markers, the rollback block,
the submit paths (confirmed correct), stored data.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build` after the last change). Update the PR body. Report: commits; the migration
file as committed and the probe evidence; the final `keep-old-rule` SQL and its truth table;
the mutation results; the guest-claim sample rule (pure function + where it is applied) and
its tests; gate tails with exact counts; anything not done or doubtful.
