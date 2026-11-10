# S8-04 — One score below five cups

> **When:** after S8-03 (S8-01/02 merged) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** answer A1 (and A2/A3), then apply PHASE 23 SQL + the one-off recompute from the runbook; no migration
> **Findings:** 7 (1 P1 · 4 P2 · 2 P3) from `docs/audits/flows-2026-11/` files 04, 05, 06, 07, 08, 15 · **Gated on Kim:** A1, A2, A3

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: the SQL trigger
penalises uniformity/defects at any cup count, TypeScript only from 5, so one coffee shows two scores. The
trigger stays the authority for the STORED community score and `calcCommunityScore` stays display-only; the
goal is that they can never differ. Out of scope: the SCA formula itself, the reference anchor, report
layouts. Step 1 has two ALTERNATIVE branches (1a / 1b): implement ONLY the one Kim chose in
docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md row A1; if the file or the row is missing,
implement 1a (her stated default) and say so in the PR. The lead (Fable) owns the SQL, the scoring changes
and the equality test; Sonnet may do copy, i18n mirroring, the CupToggleGrid hide and the history/tag UI;
Haiku the docs lines. Work the plan in order, one commit per step, `npx tsc --noEmit && npm run lint &&
npm test` before each commit, update docs/flows.md in the same PR, and finish with the Definition of done
checklist in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-grupal-1 | P1 | CONFIRMED | Trigger (`prisma/sql/rls_and_triggers.sql:765-772`) penalises at any cup count; TS gates at `lib/scoring.ts:209`; history stores the trigger value (`lib/coffeeHistory.ts:54`) | `08-grupal-en-vivo.md` |
| F-04-4 | P2 | CONFIRMED (duplicate of F-crear-sesion-5, 06 owns the field) | Wizard default 2 cups, label "Tazas por café", spinner (`NewSessionForm.tsx:274`) | `04-empezar-cata.md` |
| F-crear-sesion-5 | P2 | CONFIRMED | Same default, consequence never shown | `06-crear-sesion.md` |
| F-express-4 | P3 (was P2) | CONFIRMED | One-cup score indistinguishable from a CVA score in history (`lib/coffeeHistory.ts:71`) | `05-catar-ahora.md` |
| F-solo-2 | P2 | CONFIRMED | Editing a submitted row never re-fires the trigger (`app/actions/sessions.ts:609`); history keeps a stale community score | `07-sesion-solo.md` |
| F-solo-4 | P3 | needs-runtime-check | Descriptive-only or incomplete solo sessions store community 0.00 in history (`lib/coffeeHistory.ts:54`) | `07-sesion-solo.md` |
| F-offline-7 | P2 | CONFIRMED | "Reemplazar con mi versión" updates a submitted row without re-firing the trigger (`app/actions/offline.ts:79-94`) | `15-offline-sync.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| A1 | Below five cups, what happens to uniformity/defect deductions? (a) never deduct, hide the boxes · (b) deduct the full 2/4 points per cup · (c) deduct in proportion to cups tasted | (a) | Build 1a. Option (b) is not built here (one defect in one cup would cost 4 points of a 1-cup score); if Kim picks it, stop and ask |
| A2 | How many cups do you use in a serious cupping, what should the app propose? (a) 5 always · (b) 5 in affective/combined, free in descriptive · (c) keep 2 and warn | (b) | Ship hint, label and descriptive-hide (step 3) with default 5 for affective/combined |
| A3 | How do we treat quick one/two-cup scores? (a) same, no mark · (b) same with an "impresión rápida" tag · (c) leave them out of the coffee's score history | (b) | Ship the tag (step 6) |

## 4. Plan

1a. **(A1 = a, default) Penalties only from 5 cups, everywhere.** Export `MIN_CUPS_FOR_PENALTIES = 5` and `penaltiesApply(cups)` from `lib/scoring.ts` and route `calcIndividualBreakdown`, `computeGroupAggregate` and `calcCommunityScore` through it (the last has no gate today). PHASE 23 in `prisma/sql/rls_and_triggers.sql` re-issues `recompute_aggregate_score()` identical to the definition at line 710 except `IF v_cups_per_sample >= 5 AND v_total_cups > 0` around both penalties. Hide the cup-check boxes below 5 (`components/ui/CupToggleGrid.tsx`, per A1 "ni siquiera mostrar las casillas"); stored flags stay in the arrays but are ignored. Files: `lib/scoring.ts`, `lib/evaluation.ts`, the SQL file, `CupToggleGrid.tsx`. Invariant: trigger authoritative, TS display-only (SQL is aligned to the documented formula). Covers: F-grupal-1.

1b. **(A1 = c, ALTERNATIVE to 1a — never both) Proportional below 5 cups.** The trigger's community penalty is already a per-cup fraction (`10/total_cups`, `30/total_cups`), so PHASE 23 re-issues the function numerically unchanged (pinned comment, no gate) and the real change is TypeScript: remove the `>= 5` gate in `computeGroupAggregate` and `calcIndividualBreakdown`, scale the individual deduction `(2u + 4d) × 5 / cups` so the same share of flagged cups costs the same at any cup count, and keep the boxes visible. Same files minus the grid. Covers: F-grupal-1.

2. **Equality fixture.** `tests/scoringConsistency.test.ts`: a pure TS port of the SQL arithmetic (`sqlCommunityScore(avgRaw, nonUniform, defective, cups, cuppers)` with the same `ROUND(x*4)/4` and 0–100 clamp) compared against `calcCommunityScore` and `computeGroupAggregate`. Main case: 2 cuppers × 2 cups, raw 80.00, one non-uniform cup — 1a expects 80.00 on both sides, 1b expects 77.50 on both. Add the 5-cup case (CLAUDE.md verification, −1.0), a defective-only cup, 1 cup and zero evaluations. Update the "ignores penalties below 5 cups" case in `tests/scoring.test.ts` to the chosen branch. Covers: F-grupal-1.

3. **Cups default and disclosure.** `NewSessionForm.tsx` (under `app/[locale]/app/sessions/new/`): label "Tazas por muestra", `inputMode="numeric"`, field absent for descriptive, default per A2, and a one-line hint for 1–4 whose text follows the branch (1a: "con menos de 5 tazas no se descuentan uniformidad ni defectos"; 1b: "los descuentos se calculan en proporción a las tazas"). es/en keys appended at the END of the JSON. Covers: F-04-4, F-crear-sesion-5.

4. **Stale aggregates: edit after submit and replace-with-mine.** In `upsertEvaluation`'s update path, when the existing row is submitted, put `isDraft: false` in the SET so Postgres fires `UPDATE OF "isDraft"` (CLAUDE.md note); draft saves stay trigger-free (`WHEN NEW."isDraft" = false` already filters them). Same in `syncEvaluation` for the forced replace, and fix the comment at `offline.ts:26-28`. Solo only: a replay over a submitted row of the owner's own active solo session applies instead of returning `conflict` (one person, nobody else's data); group conflict rules are untouched (S8-09 keeps them). Extract `refireAggregates(sessionId)` from `refreshAggregateScores` (`app/actions/community.ts`) into `lib/aggregates.ts` and call it in `closeSessionInternal` before `syncCoffeeHistoryForSession`, so history never reads a stale aggregate. Add `isGroup` to `SampleAuthRow` (`lib/sessionAuth.ts`) if absent. Invariants: scoring inputs stay server-derived; `closeSessionInternal` stays the only closer (S8-05 builds on this call). Covers: F-solo-2, F-offline-7.

5. **One-off recompute.** PHASE 23 tail: `UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;` (idempotent), then re-sync history for sessions with `cupsPerSample < 5` via `scripts/resync-low-cup-history.ts` (dry-run by default, `--apply` to write; Ricardo runs it). Add `docs/LAUNCH-RUNBOOK.md` §10, click by click, with a before/after query for one known session. Covers: F-grupal-1.

6. **History honesty.** `syncCoffeeHistoryForSession` copies `communityScore` only when `aggregateScore.participantCount > 0` and the format has a quality rating (never 0.00 for descriptive-only or incomplete); `HistoryRow` and the coffee profile show an "impresión rápida" tag when the session's `cupsPerSample < 5` per A3 (display-only, no score change; PDFs untouched unless Kim says so). Files: `lib/coffeeHistory.ts`, `app/[locale]/app/profile/history/page.tsx`, `components/ui/Badge.tsx` reuse. Covers: F-solo-4, F-express-4.

## 5. Acceptance (tests to write or checks to run)

- F-grupal-1: `tests/scoringConsistency.test.ts` passes for the chosen branch; a 2-cup session with one flagged cup shows the same score on results, coffee profile and history; a 5-cup session is unchanged; running the recompute twice changes nothing.
- F-04-4 / F-crear-sesion-5: hint visible at 1–4 and gone at 5, es and en; label per sample; field absent for descriptive; numeric keyboard.
- F-solo-2 / F-offline-7: edit after partial submit then close gives history `communityScore` equal to `individualScore` (solo); forced replace leaves `AggregateScore` matching the evaluations (`tests/aggregateRefire.test.ts` on the pure SET-shape helper); a draft save does not include `isDraft`.
- F-solo-4: closing a descriptive-only solo session stores `communityScore = null` and the pill shows "—".
- F-express-4: the tag renders for `cupsPerSample < 5` in history and coffee profile, not at 5; no score value changes.

## 6. Manual steps for Ricardo

- Supabase SQL editor: apply PHASE 23 (runbook §12; confirm first that the live function body matches line 710, audit 08 §5), run the recompute statement, then `npx tsx scripts/resync-low-cup-history.ts --apply` from the right checkout. Check the Security Advisor afterwards.
- `.env.local` IS production: no session runs any of this.

## 7. Risks and rollback

- Past scores for sessions below 5 cups change once (1a raises them, 1b may lower some); tell Kim. Rollback: re-apply the previous function body (kept verbatim in the PHASE 23 comment) and rerun the recompute.
- Nothing is deleted: flags below 5 cups stay in the arrays.
- The `isDraft` SET on submitted-row edits adds one trigger run per edit; the 800 ms draft hot path is unaffected.

## 8. Native-readiness clause

- Server and database only, plus numeric `inputMode` on the cups field. A replay of an edited submitted row must apply once after a WebView resume (no double trigger side effects).

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/scoringConsistency.test.ts`, `tests/scoring.test.ts`, `tests/aggregateRefire.test.ts`)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-04 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the wizard hint and the history tag
- [ ] gated items either done or left as named TODOs listed in the PR description (A1 unanswered = 1a shipped and flagged)
