# Brief — S10 WP5b: thresholds and tie rule, re-pin keeps the cupper's ratings, personal comparisons at close, repeated sample (no schema change, no SQL)

Branch: `claude/s10-05b-results-comparisons-impl` from the CURRENT `origin/main` (it must
contain the coffee lifetime score PR, which added `lib/indicativeCups.ts` and the cups rule in
`lib/reports/ranking.ts`). DRAFT PR against `main`.
PR title: `S10 WP5b: "indicativo" from 3 to 5 cuppers and the tie rule, a re-pin keeps the cupper's ratings, personal comparisons at close, repeated-sample difference`
Kim rows (as named in `docs/prompts/S10-kim-answers.md` WP5): D3, B2, B3, B6. Answers are
SIMULATED: `TODO(kim-validar:<row>)` on new behaviour. `npm run test:db` required (B2 changes
write paths).

Read first: `docs/handover/s10/brief-00-common-rules.md`; CLAUDE.md "Reference Sample" WHOLE
(pin, multi-reference, re-pin confirmation S8-27, reference MODE and `shouldPinReference`),
"Session Lifecycle" (group results only at close: `viewerMayReadGroupResults`; ranking
honesty), "Scoring System" (rule versions), "CVA PDF Export & Reports" (anonymity invariant),
"Evaluation Data Shape", "Validation"; `lib/referenceRules.ts`, `app/actions/sessions.ts`
(`setReferenceSample`, `upsertEvaluation`, `removeSamplesInTx`), `app/actions/offline.ts`,
`lib/evaluation.ts` (`assertModuleBounds`, `computeEvaluationDerived`),
`lib/reports/ranking.ts`, `lib/reports/cupperStats.ts`, the results route
(`results/page.tsx`, `ResultsClient.tsx`, `ResumenTab.tsx`), `components/results/SampleDetail.tsx`
and `SampleDetailDialog.tsx`, `lib/referenceDelta.ts`.

Product law for everything below (owner's decisions): comparisons and teaching views exist
ONLY on a CLOSED session; scoring differently from the group is never called an error.

## 1. D3 — thresholds and the tie rule (`lib/reports/ranking.ts`)
- `RANKING_POLICY.indicativeBelow` becomes 6: a community number is "indicativo" with 3, 4
  or 5 included cuppers and firm from 6 (`minN` stays 3: under 3, no SD and never "mejor").
  The cups rule added by the lifetime-score PR stays: either one holding shows the flag.
- Tie: neighbours have "sin diferencia clara" when their gap is under the LARGER of 1 point
  and half the larger sample SD (today: only the SD half). When no SD exists (n < 2) the
  1-point floor alone applies. One pure function; every consumer (results ranking, PDFs,
  ficha) picks it up through the policy.
- Tests: boundaries 2/3/5/6 cuppers; gap 0.75 with tiny SD → no clear gap; gap 1.25 with SD
  3 → no clear gap (1.5 > 1.25); gap 1.25 with SD 2 → clear; existing fixtures updated with
  a note of each changed expectation in your report. Update the help text that explains
  "indicativo" / "sin diferencia clara" (es + en) and CLAUDE.md.

## 2. B2 — re-pinning a reference never destroys a cupper's ratings (`TODO(B2-b)`)
Today, in anchor mode, marking a sample as the reference rewrites every cupper's affective
ratings of it to 5 and clears their cup checks (after a confirmation that counts the
evaluations). The ratings are gone for good.
- STASH: whenever a pin overwrites stored affective input that is not already the anchor
  state, the previous values are kept inside the same module JSON under ONE key,
  `ref_previo`: `{ at: ISO string, valores: { <each key the pin overwrites>: previous value } }`
  (ratings `_final`/base, the two cup arrays, `tazas_defecto_tipo`, `defecto_tipo`, and any
  other key `pinReferenceAffective` clears: read it and list them). An existing stash is
  NEVER overwritten by a later pin (the first real values win). One pure pair in
  `lib/referenceRules.ts`: `stashBeforePin(data, pinned)` and `restoreFromStash(data)`.
- The stash must survive ordinary saves: while the sample is the pinned reference the
  client posts the module without knowing the stash, so EVERY write path that pins
  (`upsertEvaluation`, the offline replay core, the re-pin planning in `setReferenceSample`,
  `removeSamplesInTx`'s reactivation re-pin, the legacy-draft rewrite at submit) carries the
  stored row's `ref_previo` over into what it writes. A client can never set, change or
  delete `ref_previo` (strip it from client payloads in the shared derivation, then re-attach
  the stored one): test with a tampered payload.
- It is invisible to scoring: `computeEvaluationDerived`, `isAffectiveComplete`,
  completeness, `defectTally`, the trigger (JSON key it never reads) and every report ignore
  it; check `assertModuleBounds` accepts the nested object and its size (raise no limit: if
  it does not fit, store the values flat under prefixed keys `ref_previo_<key>` instead and
  say so).
- RESTORE ("undo"): when a sample STOPS being the active pinned reference while the session
  is open (the owner removes the reference, or marks another sample so this one becomes an
  earlier, unlocked reference), each evaluation of it that has a stash AND still holds
  exactly the anchor state gets its stashed values back, its derived scores recomputed
  through `computeEvaluationDerived`, the stash removed, and, if it was submitted, the
  aggregate re-fired the way an edited submitted evaluation is (`submittedRefireArgs`). An
  evaluation the cupper re-rated after the unlock keeps its current values and just drops
  the stash. Same transaction as the reference change. Only where `shouldPinReference`
  applies (anchor mode; free mode never pins, never stashes).
- Copy: the existing re-pin confirmation (cup master panel and edit form) gains one
  sentence, es: "Sus calificaciones anteriores de esta muestra se guardan y vuelven si quitas
  la referencia." (+ en). After a restore the owner gets a non-blocking notice: "Se
  recuperaron las calificaciones anteriores de {n} evaluaciones." (+ en; mind the ICU rule
  for client-rendered placeholders).
- Tests: unit (stash/restore truth table; stash never overwritten; tampered payload); DB:
  cupper rates 7s → owner marks the sample as reference (stored 5s, 79.00, stash present) →
  cupper's page autosaves the pinned module (stash still present) → owner removes the
  reference → stored ratings are the 7s again, individual score recomputed, stash gone,
  aggregate row re-fired when submitted; the same through "mark another sample"; free mode:
  nothing stashed. `tests/referencePinGate.test.ts` must still pass. Remove `TODO(B2-b)`.

## 3. B3 — personal comparisons, closed sessions only
In the cupper's own drill-down of a sample, when the session is CLOSED and it is a group
session (take the gate from `viewerMayReadGroupResults`; never a second rule):
- Affective / combined: the cupper's own total next to the group's score and its spread
  ("Grupo: 84.25 · entre 82.50 y 86.00 · ± 1.2"), plus per attribute "tú 7 · grupo 6.4".
  Neutral wording and tokens: never "error", "desviación" as a fault, red or green by
  direction. One line under it: "Calificar distinto al grupo no es un error: en la cata
  afectiva las preferencias pueden diferir." (reuse the string #128 added for the outlier
  hint if it fits).
- Descriptive / combined: each intensity "tú 3 · grupo 2.6", and the descriptors: which of
  the cupper's descriptors the group also chose most ("coincides en: …") and the group's top
  descriptors they did not choose. Find what the Descriptores tab already computes and reuse
  it; no new aggregation rules.
- Δ against the reference: only in anchor mode and only where the page already shows Δ
  (`lib/referenceDelta.ts`); nothing new in free mode beyond what exists.
- PRIVACY (hard rule, tested on the payload builder): a group comparison for a sample is
  sent to a participant only when at least `RANKING_POLICY.minN` (3) cuppers are included
  for that sample; with fewer the drill-down says "Con menos de 3 catadores no se muestra la
  comparación con el grupo." (with 2 people an average reveals the other person's values).
  The payload never carries another cupper's individual values, name or id, and an excluded
  cupper's values never enter the averages. The owner already sees everything in the owner
  matrix: do not add this panel for the owner lens.
- Server-computed, pure builder in `lib/reports/` with tests; the dialog gets a small NEW
  component (do not restructure `SampleDetail`).

## 4. B6 — the same coffee twice in one session
When a CLOSED session has two samples linked to the same coffee (both revealed; `coffeeId`
is server-only: compute the pairs on the server, never ship `coffeeId` to a participant),
each cupper who evaluated BOTH sees, in the drill-down of either, the difference between
their own two evaluations: total (affective/combined) and each intensity
(descriptive/combined), with the owner's tolerance: within 2 points on the total and within
2 on each intensity reads "dentro de la tolerancia"; beyond it "diferencia de {x}" in
neutral wording, with one line: "Es la misma muestra servida dos veces: sirve para ver cuánto
varía tu propia cata." No consistency score, no ranking of cuppers, nothing sent to anyone
else (the owner sees nothing new). A sample that is an anchor-mode reference is never part of
a pair (its ratings are pinned). More than two samples of one coffee: compare each with the
first by position. Pure builder + tests (tolerance boundaries 2 and 2.25; missing second
evaluation → nothing; partial data → only what both have).

## Do not change
Scoring arithmetic, the SQL, stored scores of closed sessions, the anonymity of reports, the
pin rule itself (`shouldPinReference`), what the owner matrix shows.

## Docs
CLAUDE.md ("Reference Sample": the stash and the restore; "Session Lifecycle": ranking
thresholds and tie rule; the comparison panel and its n ≥ 3 gate; repeated sample),
`docs/flows.md` where the reference flow is drawn. Record in the PR body: B4 (teacher's guide
during a session) is PARKED by the owner, not built.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors, `npm run build` after the last change). If
`test:db` fails at setup or hangs with no output for 10 minutes under load, stop and re-run
it alone. Start no background timers; do not stop to wait on background work. Report: branch,
PR number, commits; the keys the pin overwrites and the stash shape as committed; every
write path that carries the stash (file:line); the final text of the tie rule and of the two
payload builders with their privacy gates; every changed test expectation for D3; every
string added or changed (es and en); gate tails with exact counts; anything not done or
doubtful; what can only be judged signed in with several accounts.
