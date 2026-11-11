# Audit B-lifecycle: session lifecycle, scoring and data integrity

Audited commit: `3713033` (detached `origin/claude/s8-21-loose-ends-impl`), diff base `origin/main`.
Auditor: independent, read-only. No DB, no dev server, no migrations run.

## 1. System overview of the area

- **Close.** `lib/closeSession.ts` holds `closeSessionInternal`. Phase 1 is a guarded `updateMany` (status not closed → closed, closedAt). Phase 2 is `finalizeClosedSession`: reveal coffee-linked samples, `refireAggregates` (no-op `isDraft` UPDATE that re-runs the trigger), `syncCoffeeHistoryForSession`, then close emails for group sessions, then `closeFinalizedAt`. A failed step is logged and leaves `closeFinalizedAt` null, so a repair is owed. Repairs run from: the cron's pass 2 (`closedAt` older than 5 min, ordered by `updatedAt`, bumped on failure); a solo resubmit (`submitAllEvaluations`, grace 0); `finishSoloSession` (grace 0); the owner close button; and a solo owner viewing `/results` (20 s grace). Every writer of `status: "closed"` goes through `closeSessionInternal`. A grep found no other writer (Verified).
- **Deadlines.** `closesAt` is stored as the end of the chosen day in `closesAtZone` (IANA zone, null = UTC). It is built by `endOfDayInZone`, read back by `dateInZone`, and changes are planned by `planClosesAtChange`. Writes stop as soon as `isSessionExpired` is true. The status flips later, at the daily 06:00 UTC cron. The cron also sends ledgered `deadline_24h` and `live_idle` reminders.
- **Scoring.** The SQL trigger (PHASE 23) stores `aggregate_scores`. The results page recomputes community scores in TS (`computeGroupAggregate`). Coffee history copies the stored trigger value. PHASE 23 gates penalties at `cupsPerSample >= 5` in both SQL and TS.
- **References, history, guest merge, ordered writes.** These are as described in CLAUDE.md. The details are under each finding.

## 2. Architecture assessment

- **Two-phase close with a stamp and repair (sound).** Phase 1 stays idempotent and remains the only place that writes `closed`. Phase 2 is retryable, and the email ledger keeps repairs from sending the same mail twice. The design trades some extra surface (four callers can trigger a repair) for eventual consistency, which is reasonable. One risk is classified D (unverified assumption): phase 2 is assumed to succeed eventually. A permanently failing step (see B-01) leaves the session in the repair queue for good, which is "requeued" but never alerted beyond one log line per day.
- **Trigger as authority with TS as display (flawed by duplication, class A).** The design depends on two independent implementations staying equal. The results page shows TS values and history shows trigger values. The equality test checks only identical cuppers at 79.00, and it does not model PG's float8→numeric cast (B-04). It also does not model input validation. The trigger casts JSON with `::numeric`, but TS uses `Number()` with fallbacks, so the two react differently to bad input (B-01).
- **Zone-aware deadline (sound).** Storing an IANA zone instead of an offset is the right choice. One DST edge is wrong (B-06).
- **Ordered writes with `lastClientWriteAt` (sound for its stated scope).** The conditional update keeps the hot path at one round trip. Cross-device clock skew is a documented, accepted risk.
- **Manual solo finish (sound bend).** The close still goes through the single routine.

## 3. Findings register

### B-01: affective ratings are never validated; one cupper can set a sample's community score to 100, or block the sample's aggregate for everyone (High)
- **Category:** security / data integrity. Class B (implementation flaw), also present before S8. S8 widened the impact: the new refire paths run at every close and repair.
- **Files:** `lib/evaluation.ts:62-107` (`computeEvaluationDerived` validates only the note length and JSON size, then stores `data` verbatim); `lib/scoring.ts:100-113` (`calcAffectiveSum`: `const finalVal = rawVal > 0 ? rawVal : 5;`, with no upper bound); `app/actions/sessions.ts:677-756` (`upsertEvaluation`, any member, followed by `prisma.evaluation.updateMany(submittedRefireArgs(result.id))`); SQL `is_affective_complete` (`NULLIF(data->>'aroma_af_final','')::numeric`) at `prisma/sql/rls_and_triggers.sql:544-555`, and the attrAverages casts in PHASE 23.
- **Expected:** every affective `_final` value is an integer from 1 to 9 (CVA scale), and "scoring inputs are never taken from the client" (CLAUDE.md).
- **Actual (Verified, executed):** `computeEvaluationDerived("affective", {…5s…, sabor_af_final: 9999}, 5)` returns `rawScore 6637.5625`, `individualScore 100` and `affectiveSum 10034`. With that row plus four honest cuppers at 79, the faithful trigger port gives community **100**. The TS path (`computeGroupAggregate`, also unbounded) does the same. A value of `"abc"` is stored verbatim (`aroma_af_final: "abc"`) and `rawScore` stays 79.
- **Strongly supported (PG semantics, not run):** a submitted row with a non-numeric `_final` string makes `is_affective_complete` raise `invalid input syntax for type numeric`. From then on, every trigger fire on that sample fails. Other cuppers' submits for the sample fail, and so does `refireAggregates` at close. The close is then never finalized and the cron retries it daily. The poison route is: submit valid data, then edit the submitted row through `upsertEvaluation`. The data write lands before the refire `updateMany` throws, because the two are separate statements outside a transaction.
- **Reproduction:** a group participant (including an anonymous QR guest) calls the `upsertEvaluation` server action with crafted `data`.
- **Smallest fix:** in `computeEvaluationDerived`, coerce each affective `_final` and base key to an integer from 1 to 9 or delete it (`v.int`), and do the same for intensity fields if used in SQL. Run the data write and the refire in one `$transaction`. Optionally harden the SQL with a safe cast (`CASE WHEN x ~ '^\d+(\.\d+)?$'`).
- **Regression tests:** an out-of-range value and a string are rejected or clamped; `rawScore` stays within [58, 100].

### B-02: clearing the closing date on a running self-paced session locks out every participant (Medium)
- **Category:** lifecycle correctness. Class C (implementation does not match the design).
- **Files:** `lib/sessionState.ts:106` (`if (input === null || input === "") return { closesAt: null, closesAtZone: null, isAsync: false };`), `app/actions/sessions.ts:1109ff` (`updateSession`), `lib/sessionState.ts` `assertSessionStarted` (`isGroup && !isAsync && !startedAt && !isOwner` → `session_not_started`), and the cup page redirect to `/waiting` (`cup/page.tsx:90`).
- **Expected:** clearing the date turns the session into a live cupping that the owner closes by hand. Participants who are mid-cupping keep working.
- **Actual (Strongly supported):** self-paced sessions never get `startedAt`; grep shows it is set only by `startSession`. Clearing the date sets `isAsync=false` while `startedAt` is null. Every participant's save, submit and offline replay then fails with `session_not_started` or `pending`, and `/cup` redirects them to the waiting room until the owner presses "Iniciar cata". The doc comment says this is "allowed even when cuppers already submitted", and no notice warns the owner.
- **Fix:** when clearing a date on a session with any evaluation (or always), also set `startedAt = startedAt ?? now()`. Add a test for `planClosesAtChange`/`updateSession` covering clearing on an in-progress async session.

### B-03: the guest merge leaves stale or wrong coffee history when a conflict is resolved in the guest's favour (Medium)
- **Category:** data integrity. Class B.
- **File:** `lib/guestClaim.ts:134-188, 356-371`.
- **Expected:** after the merge, the account's history row for a (coffee, session) reflects the surviving evaluation and the current aggregate.
- **Actual (Strongly supported):** when the guest's evaluation wins, the account's evaluation is deleted. Its coffee-linked history row keeps the deleted evaluation's `individualScore`, with `evaluationId` set to NULL by SetNull. The guest's row is then deleted as a duplicate (`taken.has(...)`), because "target's row wins". The refire updates `aggregate_scores`, but nothing re-runs `syncCoffeeHistoryForSession`. A merge into a closed session therefore leaves a history row with the losing score and a stale community score. The row is also unreachable by `scripts/resync-low-cup-history.ts`, which skips rows without an evaluation.
- **Fix:** after the transaction, call `syncCoffeeHistoryForSession` for every closed session in `refireSessions`. Or, inside the transaction, when the guest wins, delete the target's coffee row instead of the guest's.
- **Test:** a pure planner test that the winner's history row survives.

### B-04: the trigger and the TS community score still differ by 0.25 on rounding boundaries (Low)
- **Category:** scoring consistency. Class D (the equality test does not model the cast).
- **Files:** `lib/scoring.ts:335-354` and PHASE 23 (`ROUND((… )::numeric * 4) / 4`).
- **Evidence (Verified with a port, Hypothesis on PG internals):** PG casts float8→numeric with 15 significant digits (`%.15g` in `float8_numeric`), while JS rounds the full double. Over a grid of 78,000 cases (5–10 cups, 1–10 cuppers, every sum, ≤4 non-uniform, ≤3 defective cups), 8 cases differed. Example: 7 cuppers, 5 cups, Σ=20, 1 non-uniform and 2 defective cups. The exact value is 63.875: TS gives 63.75, the trigger gives 64. Random sampling of 200,000 cases with mixed cuppers found 0, so the effect is rare.
- **Impact:** the results page and the coffee history can differ by 0.25. That breaks the S8-04 goal that the two "can never differ".
- **Fix:** in TS, round the pre-rounding value to 12 decimals (`Number(x.toFixed(10))`) before `*4`, or round penalties in SQL with numeric arithmetic. Add the boundary case to `tests/scoringConsistency.test.ts`.

### B-05: a re-enabled earlier reference is not re-pinned (Low)
- **File:** `app/actions/sessions.ts:1014-1022` (the `setReferenceSample(null)` path never sets `repinTarget`) and `lib/referenceRules.ts:23-28`.
- **Actual (Strongly supported):** while R2 is active, R1 is unlocked, so cuppers can submit real ratings on it. When the owner removes R2, R1 becomes the active, pinned anchor again, but its stored submitted rows are not rewritten. They no longer equal 79.00 until each cupper saves again. The 79.00 anchor invariant and the Δ basis are wrong for that session.
- **Fix:** run `planReferenceRepin` on `plan.activeId` in the null path, with the same confirm rule.

### B-06: `endOfDayInZone` picks the first occurrence of 23:59:59.999 on the day a fall-back DST change happens at midnight (Low)
- **File:** `lib/closeRules.ts:133-143`.
- **Evidence (Verified, executed over every day of 2026–2027 in 14 zones):** America/Santiago on 2026-04-04 returns `2026-04-05T02:59:59.999Z`. One millisecond later is still 2026-04-04 local, so the deadline lands one hour early. 2027-04-03 behaves the same. Every other zone and day was correct.
- **Fix:** after computing `t`, if `dateInZone(t+1, zone) === value`, add the offset difference (pick the later instant). Add a test for Santiago 2026-04-04.

### B-07: when every cupper of a sample is excluded, results fall back to the trigger row and show community 0 (Low)
- **File:** `app/[locale]/app/sessions/[id]/results/page.tsx:267-290, 767-800`.
- **Actual (Strongly supported):** the recompute map skips the sample, and the fallback uses `agg.communityScore`. The trigger writes `COALESCE(avg,0)=0` with `participantCount 0`, so `rankFor` treats 0 as a real community score (`community !== null`). `totalSubmitted` becomes 0 instead of the real N.
- **Fix:** if `agg.participantCount === 0`, return a null community score, as `historyCommunityScore` already does.

### B-08: close-email sends are not reserved before sending (Low, pre-existing)
- **File:** `lib/closeEmail.ts:178-188, 335`.
- **Actual (Strongly supported):** the ledger is read first, then the mail is sent, then the ledger row is upserted. A repair from the cron racing `resendCloseEmails`, or an owner re-close after the 5-minute grace, can double-send.
- **Fix:** reserve the ledger row before sending, the same way `lib/reminderEmail.ts` already does.

### Notes (not findings, or outside this area)
- **Same coffee on two samples:** the (user, coffee, session) unique key collapses them into one history row, and the last write wins. Assigning one coffee to two coffee-less samples deletes both label rows and keeps one score. This is pre-existing design; Medium if duplicate-sample calibration is common.
- **`finishSoloSession` pruning:** `findMany` followed by delete inside a READ COMMITTED transaction can cascade-delete an evaluation created between the two statements. The window is tiny and the session is solo. Low.
- **Solo double-submit with `repairGraceMs: 0`:** two submits can run phase 2 concurrently. All steps are idempotent: native upserts, and `createMany skipDuplicates` against the partial unique index. Benign.
- **Deploy order:** if the app deploys before PHASE 23 is applied, TS shows un-penalised scores for <5 cups while the trigger still penalises them, so history diverges until the SQL is applied. The runbook should state that order.

## 4. Traceability matrix

| Decision / requirement | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Only `closeSessionInternal` writes closed | single writer | single writer (grep) | the grep in section 5 | Compliant |
| Two-phase close, `closeFinalizedAt`, repair pass (S8-05 T2, design A) | phase 2 retryable, stamp after success | as specified; group stamp written after emails | closeSession.ts:61-140, cron:70-99 | Compliant |
| Backfill `closeFinalizedAt` for closed rows | yes | `COALESCE(closedAt, updatedAt)` | migration 20261111090000 | Compliant |
| Solo resubmit repairs instead of `session_closed` | yes | community.ts:55-66 | code | Compliant |
| `finishSoloSession`: submit complete drafts only, prune in lib, close via routine | yes | planFinish + removeSamplesInTx + closeSessionInternal | community.ts:203-307 | Compliant |
| Penalties only from 5 cups in TS and SQL (A1 = a) | equal everywhere | gated in both; rounding differs in rare cases | B-04 | Partially compliant |
| "Scoring inputs never from client" | server-derived inputs | cups and format derived; attribute values unvalidated | B-01 | Noncompliant |
| Refire edits of submitted rows (design b) | guarded updateMany | sessions.ts:753, offline.ts | code | Compliant (non-atomic with the write, see B-01) |
| Refire at close before history | yes | finalize step order | closeSession.ts:98-100 | Compliant |
| History has no 0.00 community score without included evals | null | `historyCommunityScore` | historyRules.ts | Compliant |
| Zone-aware deadline, null = UTC; zone-aware no-op | yes | yes; one DST edge | B-06 | Partially compliant |
| Clearing a date makes a live session the owner closes | participants keep access | participants locked out | B-02 | Noncompliant |
| Reminders: own ledger, reserved before send, no Profile FK | yes | yes | reminderEmail.ts | Compliant |
| Multi-reference: only the active reference pinned | the active one always pinned | the re-activated one not re-pinned | B-05 | Partially compliant |
| Label-only history: partial unique index, skipDuplicates | yes | yes | migration 20261111140000, coffeeHistory.ts:36-66 | Compliant (DB index not verifiable here) |
| Guest merge moves every user FK; eval-wins; exclusion carry-over; refire | yes | yes; history not re-synced | B-03 | Partially compliant |
| Ordered writes (S8-18) | conditional update | as designed | evaluationWrite.ts | Compliant |
| "n de N": N before the exclusion filter | yes | yes, except the all-excluded fallback | B-07 | Partially compliant |

## 5. What I executed

- `git fetch`, then a detached checkout of `origin/claude/s8-21-loose-ends-impl` (3713033); `npm ci` and `npx prisma generate` succeeded.
- `npx tsc --noEmit` exited 0.
- `npx vitest run` (full existing suite): **114 files, 1088 tests passed**, 0 failed.
- Temporary `tests/_audit_b_scoring.test.ts`:
  - Out-of-range value: rawScore 6637.5625 / individual 100 / community 100. Passed.
  - Non-numeric value stored verbatim. Passed.
  - NaN or negative cups give 79. Passed.
  - Random comparison of the TS score and the trigger port (200,000 cases): 0 mismatches. The run timed out after logging; the logged numbers are valid.
  - Targeted search: mismatch found at 7 cuppers / 5 cups / Σ20 / 1 non-uniform / 2 defective: TS 63.75, SQL 64.
  - `endOfDayInZone` sweep over 2 years × 14 zones: 2 bad days (Santiago). The run timed out after logging; the logged output is complete.
- Temporary `tests/_audit_b_grid.test.ts`: 8 of 78,000 mismatches. Passed.
- Both temporary files were deleted. `git status --short` is empty.

## 6. What remains unverified

- PG's float8→numeric digits (B-04) and the `::numeric` exception poisoning (B-01, second half). One `SELECT (63.87500000000001::float8)::numeric` and one `SELECT is_affective_complete('{"aroma_af_final":"abc"}')` on any Postgres instance would settle both.
- Whether the live production function body matches the PHASE 23 pre-flight, and whether the partial unique index exists in production.
- Behaviour of the cron under `maxDuration` with 25 group closes rendering PDFs.
- Prisma native upsert being used for the compound key in `syncCoffeeHistoryForSession`. A query log would show `ON CONFLICT`.
- UI rendering of a 0 community score with n=0 (B-07).

## 7. Answers

- **Did the implementer correctly implement the architecture?** Mostly yes. The close lifecycle, the repair pass, the reminders ledger, label-only history and ordered writes match the architect's decisions closely. The deviations are edge cases: B-02, B-05, B-06, B-07, and history after a merge (B-03).
- **Was the architecture sound?** Yes for the close and deadline design. The scoring design keeps two independent implementations and relies on a weak equality test. It never addressed input validation, which is the actual weak point of "trigger authoritative" (B-01).
- **Most serious defects or risks?** B-01: unbounded or unvalidated affective values let any participant, including an anonymous guest, set a sample's community score to 100. Non-numeric values can likely block a sample's aggregate and make its close permanently unfinalized. After that, B-02, where participants are locked out after the date is cleared.
- **What must be fixed before this is reliable?** B-01: clamp and validate attributes server-side, and make the write and the refire atomic. B-02 as well. B-03 and B-05 are recommended. Add a boundary case to the scoring equality test (B-04).
- **What uncertainties remain?** The production SQL state (PHASE 21/23 applied, the partial index), PG cast behaviour, and runtime behaviour of the cron at scale. Nothing was executed against a database or in a browser.
