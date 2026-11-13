# Brief — S10 WP1b: the score as the cupper sees it (stacked on PR #117; no schema change, no SQL)

Branch: `claude/s10-01b-cupper-score-impl`, created from the TIP of
`origin/claude/s10-01a-score-core-impl` (PR #117, the scoring core: one deduction rule,
`Evaluation.cups`, rule versions v1/v2). Open a DRAFT PR whose BASE is
`claude/s10-01a-score-core-impl` (a stacked PR; when #117 merges it is retargeted to main).
PR title: `S10 WP1b: defect type per cup, cup grid at one cup, no live total in the form, breakdown line on results`
Kim rows: A1, A3 (answers are simulated: mark new behaviour `TODO(kim-validar:A1)` /
`TODO(kim-validar:A3)`). `npm run test:db` required (the evaluation write path changes).

Read first, on that branch: `docs/product/cata-descentralizada-puntaje.md` (the decision; it
wins over everything), CLAUDE.md "Scoring System" and "Validation", `lib/scoring.ts`
(`evaluationCupCounts`, `cupDeduction`, `calcIndividualBreakdown`), `lib/scoreRule.ts`,
`lib/evaluation.ts` (`computeEvaluationDerived`), `lib/cupHint.ts`, `lib/validate.ts`
(`cupFlags`), `lib/constants.ts` (`SENSORY_DEFECTS`, `SENSORY_DEFECT_LABELS`),
`components/ui/CupToggleGrid.tsx` (and `CupIndicators`), `components/cupping/AffectiveForm.tsx`,
`components/cupping/CombinedForm.tsx`, `components/ui/ScoreDisplay.tsx`,
`components/results/ScoreBreakdownPanel.tsx`, `components/results/SampleDetail.tsx`,
`app/actions/offline.ts`, `lib/referenceRules.ts` (`pinReferenceAffective`).

## Owner decisions that bind this PR (do not re-open)
- The defect TYPE is mandatory per defective cup from now on (mohoso / fenólico / papa). Old
  evaluations whose defective cups have no type keep counting, shown as "sin especificar".
- Deduction rule (already built in #117): 4 per defective cup, 2 per non-uniform cup,
  non-uniformity exists only with 2+ cups, a defective cup is also non-uniform, never more than
  6 per cup, `factor = 5 / max(5, cups)`. Do not change `lib/scoring.ts` arithmetic.
- No past score ever changes: v1 rows (`Evaluation.cups IS NULL`) are never recomputed.
- The cupper does not see a running total while cupping. The total appears after submitting.

## 1. Per-cup defect type (data)
- New module-JSON key `tazas_defecto_tipo`: an array with one entry per cup (length =
  the session's `cupsPerSample`), each entry one of `SENSORY_DEFECTS` or `null`. JSON only: no
  column, no migration. The existing `defecto_tipo` (distinct list) and the
  `Evaluation.defectTypes` column stay and are DERIVED from it when the key is present (the
  distinct non-null types of the cups that are flagged defective, in `SENSORY_DEFECTS` order).
- `computeEvaluationDerived` (`lib/evaluation.ts`), the one derivation shared by the live save
  and the offline replay:
  - key ABSENT → legacy blob: behave exactly as today (flags kept, `defecto_tipo` as posted).
  - key PRESENT → normalise it with a new validator in `lib/validate.ts` (e.g.
    `cupDefectTypes(value, cups)`: clamp length to `cups`, anything not in `SENSORY_DEFECTS`
    becomes `null`); then a cup counts as defective ONLY where its flag is true AND its type is
    set: a flagged cup with no type is stored as NOT defective (the form cannot produce that
    state; a tampered or half-synced payload must not create an untyped defect), and a type on
    an unflagged cup is cleared to `null`.
  - With 2+ cups, a defective cup is forced non-uniform on the server too (today only the forms
    do it). With 1 cup the non-uniform flags stay all false (already done in #117).
  - Pure, unit-tested (`tests/evaluation*.test.ts`): legacy blob untouched; typed cups; untyped
    flagged cup dropped; type on unflagged cup cleared; over-long array; garbage values; 1 cup;
    the derived distinct list; the pinned reference (`pinReferenceAffective` clears cup checks:
    it must clear `tazas_defecto_tipo` too).
- The offline replay goes through the same function: confirm, and add a replay test with the
  new key.
- Everything that READS defect types keeps working for both shapes: grep `defecto_tipo`,
  `defectTypes` (results drill-down, CVA PDF `lib/pdf/cvaFormData.ts`, print page, CSV,
  analytics). Add ONE pure reader in `lib/` (e.g. `defectTally(data, cups)` →
  `{ byType: Record<SensoryDefect, number>, unspecified: number, total: number }`) for
  "which cups were defective and of which type", with tests; use it where a surface lists
  types. Do not build the coffee lifetime tally (that is the next PR); just make the reader
  reusable for it.

## 2. The cup grid in the form
- `CupToggleGrid` (and its use in `AffectiveForm` / `CombinedForm`) is shown at ONE cup too:
  only the "defectuosa" row, with the line es "Con una taza no se evalúa uniformidad." (en
  "With one cup, uniformity is not assessed."). Check what hides the grid at 1 cup today.
- Marking a cup defective asks for its type at that moment (a small inline choice of three
  under the grid, or a `ResponsiveDialog` on phones: pick what fits the existing form; touch
  targets `min-h-[44px]`, the root font is 14px). No type chosen = the cup is not marked.
  Unmarking clears the type. Changing the type of a marked cup is possible. The chosen type is
  visible on the cup (text, not colour alone).
- Labels through messages, both languages: mohoso / fenólico / papa (en: moldy / phenolic /
  potato). `SENSORY_DEFECT_LABELS` is hardcoded English uppercase today: replace its uses with
  the messages (forms receive translations as props; server/PDF code uses `getTranslations`
  or the existing label maps: follow what each surface already does). "Sin especificar" /
  "Unspecified" for legacy untyped cups wherever types are listed.
- Locked reference (`lockedAffective`): unchanged (the grid is replaced by the note).
- The form state is lifted to `CupClient` and autosaved (800 ms debounce): the new key travels
  in the same module object; no extra save call, no `revalidatePath`.

## 3. No live total while cupping
- Remove the live "Puntaje calculado" from `AffectiveForm` and `CombinedForm`
  (`components/ui/ScoreDisplay.tsx` → `calculateCVABreakdown`, a third formula that always
  deducts, counts unset as 0 and never clamps). Delete `ScoreDisplay`, its CSS module, its
  export and `calculateCVABreakdown` if nothing else uses them (grep, including `/dev` pages
  and tests; `scoreBand` / `scoreToCategory` stay: another PR handles bands).
- In its place, one quiet line so the cupper knows where the number is, es: "Verás tu puntaje
  al enviar la evaluación." (en: "You will see your score when you submit."). Nothing numeric.
- Check nothing else shows a running total during cupping (sample tabs, the notes step, the
  submit confirmation, the master panel). A per-attribute value the cupper just tapped is fine.

## 4. The breakdown line on results
- Results drill-down (`SampleDetail` → `ScoreBreakdownPanel`): the cupper's own total shows
  its arithmetic WITHOUT expanding, one line, built by a pure function with tests, e.g.
  es: "82,25 − 4 (1 taza fenólica) − 2 (1 taza no uniforme) = 76,25"; no flagged cups → just
  the total with no line; legacy untyped → "(1 taza defectuosa, sin especificar)"; several
  types → "− 8 (1 fenólica, 1 mohosa)"; beyond five cups the factor is stated: "× 5/8".
  Use the app's existing number formatting for each locale (check how results print decimals
  today and match it; do not introduce a second convention).
- Group/session scope line under the session score: es "Entre todos se cataron {cups} tazas:
  el descuento del grupo se reparte entre ellas." only when pooled cups > 5; otherwise nothing.
- The numbers come from `calcIndividualBreakdown` / `computeGroupAggregate` with the rule
  picked from the data (`evaluationScoreRule` / `sampleScoreRule`): for a v1 row the line shows
  what v1 actually did (possibly no deduction under five cups, with the existing "regla
  anterior" wording #117 introduced: find it and reuse it). Never show arithmetic that does not
  add up to the stored number: add a test that for a set of fixtures (v1 and v2, 1/2/5/8 cups)
  the line's last number equals the stored `individualScore`.
- The "¿Cómo se calculó?" expandable stays below with the full explanation; update its copy
  where it still describes the old rule (`results.breakdown.*`).

## 5. Copy leftovers
Grep both message files and components for text that still says deductions need five cups or
that cups are "not scored" (`cupsHint`, `notTrackedNote`, `dashboard.intro.calcU`, a hardcoded
`notScored`): #117 replaced some through `lib/cupHint.ts`. List what remained and fix it, in
both languages, with plain wording.

## Do not change
`lib/scoring.ts` arithmetic, the SQL, the migration, stored data, `scoreBand` colours (another
PR), the coffee page (next PR).

## Docs
CLAUDE.md ("Evaluation Data Shape": the new key and that it is JSON on purpose; "Scoring
System": where the cupper sees the total; "Validation": the new validator), `docs/flows.md` if
it shows the form's score.

## Gates and delivery
All five gates. Report: branch, PR number, commits; the derivation rule as committed (a table:
key absent/present × flag × type → stored); every surface that reads defect types and what it
shows for both shapes; the breakdown line function with six example outputs (es and en); what
was deleted; every string added or changed (es and en); gate tails with exact counts; anything
not done or doubtful; what can only be judged on a phone.
