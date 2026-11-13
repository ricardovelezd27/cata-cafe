# Brief — S10 WP1c: the coffee's lifetime score, "indicativo" by cups, the score's name (no schema change, no SQL)

Branch: `claude/s10-01c-coffee-lifetime-score-impl` from `origin/main` (main has the scoring
core #117 and the cupper's experience #127: `cupDeduction`, `evaluationCupCounts`,
`Evaluation.cups`, rule versions, per-cup defect types, `lib/cupDefects.ts` `defectTally`).
DRAFT PR against `main`.
PR title: `S10 WP1c: coffee lifetime score (one rule, every cup ever cupped), "indicativo" under five cups, the score's name`
Kim rows: A1, A2, A3 (answers are SIMULATED: `TODO(kim-validar:A2)` on new behaviour).
`npm run test:db` required (the loader's query changes). Closes finding F-grupal-1.

Read first: `docs/handover/s10/brief-00-common-rules.md`;
`docs/product/cata-descentralizada-puntaje.md` WHOLE (the owner's decision; it wins: §3 the
three scopes and the example, the "Comprobaciones" table, §5 decisions 2, 3, 4, 5, 7, 8, §7
limits); CLAUDE.md "Scoring System", "Reference Sample" (anchor / free mode), "Session
Lifecycle" (blind-leak gates: `loadCoffeeAggregateSamples` → `filterCoffeeSamples`),
"CVA PDF Export & Reports"; `lib/scoring.ts`, `lib/scoreRule.ts`, `lib/cupDefects.ts`,
`lib/coffeeAggregate.ts`, `lib/coffees/aggregateSamples.ts`,
`lib/coffees/filterCoffeeSamples.ts`, `lib/historyRules.ts` (`isQuickImpression`),
`app/[locale]/app/coffees/[id]/page.tsx`, `app/api/coffees/[id]/ficha/route.ts`,
`lib/pdf/CoffeeFichaDocument.tsx` (find the real file), `lib/reports/ranking.ts`
(`RANKING_POLICY`), `lib/reports/resultsCsv.ts`.

Other PRs open on neighbouring files (they merge before you; `git merge origin/main` before
your last commit): #128 (`resultsCsv.ts`, coffee page "editado" note, results page), WP4b
(results page, `community.ts`). Keep your UI in small new components where you can.

## 1. The pure function (new file beside `lib/coffeeAggregate.ts`, e.g. `lib/coffeeLifetimeScore.ts`)
The coffee's score is a NEW computation at read time. It is never stored, never read or
written by the trigger, and always uses the current rule (v2), even over evaluations stored
before 2026-11 (their flags and ratings are data; only their stored totals are history).

Input: the samples that survive `filterCoffeeSamples` (closed session, revealed sample,
excluded cuppers removed: decision 2; do not add or relax a gate), each evaluation carrying
what the function needs. Per evaluation decide two things:

| | feeds the BASE (one voice) | feeds CUPS and FLAGS |
|---|---|---|
| format `descriptive` (no quality ratings, no cup checks) | no | no |
| affective / combined, complete ratings, session with 2+ cups per sample | yes | yes |
| affective / combined, session with exactly 1 cup per sample ("impresión rápida", `isQuickImpression`) | NO (decision 4) | yes |
| affective / combined, ratings incomplete (the existing completeness rule: find it, do not write a second one) | no | yes |
| a reference sample (`referenceRank` not null) of a session in `anchor` mode (its quality is pinned at 5 and its cup checks are cleared: not an opinion) | no | no |
| a reference sample of a session in `free` mode | as any other sample | as any other |

- BASE: `B = 0.65625 × mean(Σ of the 8 affective ratings) + 52.75` over the evaluations that
  feed it, each ONE voice whatever its cups (decision 5). Use the existing helpers for the
  sum and the base (`calcAffectiveSum` / `calcRawScore` or what `computeGroupAggregate` uses);
  no new arithmetic.
- CUPS: per evaluation `cups = evaluation.cups ?? session.cupsPerSample`; flags through
  `evaluationCupCounts(nonUniform, defective, cups)` (clamped; non-uniform only with 2+ cups).
  Sum cups, non-uniform and defective over the evaluations that feed cups.
- DEDUCTION: `cupDeduction({ cups: Σcups, nonUniform: Σ, defective: Σ })`. Nothing else.
- SCORE: `B − deduction`, rounded with `roundToQuarter`, clamped 0..100. `null` when no
  evaluation feeds the base (then the page shows the tally and says why there is no number).
- TALLY (through `defectTally`, the one reader): defective cups by type (mohoso / fenólico /
  papa / sin especificar) and total, non-uniform cups, cups cupped, percentage of defective
  cups, and `foundBy` = how many DIFFERENT cuppers flagged at least one defective cup. Only
  that NUMBER leaves the function: no cupper id, no name, in the output type.
- `indicative`: `Σcups < 5` (decision 7: one definition, "menos de 5 tazas sumadas en ese
  ámbito").
- Also return what the page needs to explain it: `voices`, `cups`, `sessions` (distinct
  sessions that fed cups), `base`, `deduction`, `factor`.

Tests (unit, written FIRST from the decision doc, each row a test): the example table of §3
(2 cups 1 defective → −6; +4 people × 2 clean cups = 10 cups → −3; 40 cups → −0.75); "Café
con 3 sesiones cerradas, 10 tazas, 1 defectuosa → −3"; excluded cupper out of base and cups;
every row of the table above (quick impression: its ratings do not move B, its defective cup
does move the deduction and the tally; anchor reference out entirely; free reference in;
descriptive contributes nothing; incomplete ratings: cups in, base out); legacy untyped
defective cup → "sin especificar" and it deducts; `cups` NULL falls back to the session's
cups; a property test: the deduction never exceeds 6 per flagged cup; `foundBy` counts
people, not cups; no base → `null` score with a tally; output type has no id (a type-level or
key-list assertion).

## 2. Loader and filter
- `lib/coffees/aggregateSamples.ts`: select what the function needs (evaluation:
  `affectiveData`, `combinedData`, the two cup-flag columns, `cups`; sample: `referenceRank`;
  session: `format`, `cupsPerSample`, `referenceMode`). `filterCoffeeSamples` passes them
  through and keeps EVERY existing gate and the rule that the cupper id is never passed on
  (compute `foundBy` so that no id leaves the filter: e.g. the filter hands the function an
  opaque per-coffee index per cupper, or the function runs on the raw rows inside the
  server-only loader and returns only numbers: choose, and prove with a test that the value
  handed to the page/PDF contains no cupper id).
- DB test (`tests/db/`): two closed sessions of one coffee + one open session + one
  unrevealed sample + one excluded participant → the loader + function give the expected
  score, cups and tally; the open/unrevealed/excluded data moves nothing.

## 3. Where it shows
- Coffee page (`app/[locale]/app/coffees/[id]/page.tsx`): the headline number of the
  community block becomes the lifetime score (today `aggregate.communityAvg`, an average of
  stored session scores: remove that headline; `computeCoffeeAggregate` keeps feeding the
  other parts). Under it, plain lines (new small component):
  - "Acumulado de {cups} tazas en {sessions} catas · {voices} evaluaciones".
  - the arithmetic when there is a deduction, reusing the WP1b line builder if it fits, else
    the same wording style: "Base 84.00 − 0.75 (1 taza defectuosa de 40) = 83.25".
  - tally: "{d} tazas defectuosas de {cups} catadas ({pct} %), encontradas por {n} personas"
    with singular forms, then by type; "{u} tazas no uniformes"; nothing when there are none
    ("Sin tazas defectuosas en {cups} tazas catadas").
  - `indicative` → the existing "indicativo" badge style + "Menos de 5 tazas catadas: es una
    primera señal."
  - one line: "Cada cata conserva su propio puntaje. Este número es del café y cambia cuando
    se cierra una cata nueva." The per-session rows below keep each session's stored number.
  - no base: "Todavía no hay una cata completa de este café. Las impresiones rápidas (1 taza)
    cuentan sus tazas y defectos, no su puntaje."
  All through messages (es + en), number format as the rest of the app (dot, two decimals).
  The gate for showing community results at all (owner / `resultsPublished` / super-admin)
  is unchanged.
- Coffee ficha PDF (`/api/coffees/[id]/ficha` + its document): the same score, the cups line
  and the tally, same gate as today for the community block. The fonts lack some glyphs: no
  "Σ"; check "−" and "·" render (see CLAUDE.md, preview script `scripts/render-ficha-preview.tsx`).
- The coffees list and the personal history show a person's OWN stored scores: unchanged.
  Report any other place that shows a coffee-level number and what you did with it.
- The radar / attribute averages on the coffee page: unchanged (merged from session rows).
  Note in the PR body's questions for Kim: quick impressions feed the radar but not B.

## 4. "Indicativo" by cups in the session ranking
`lib/reports/ranking.ts` `RANKING_POLICY`: add the decided cup rule: a sample's group number
is "indicativo" when its pooled cups (Σ over the included evaluations) are under 5, IN
ADDITION to whatever cupper-count rule exists today (either one holding shows the flag; do
not change the cupper thresholds: another PR does). One pure predicate shared with the
coffee function. The results page and the reports that already show "indicativo" pick it up
through the same policy; add tests (1 person × 2 cups → indicativo; 3 people × 2 cups → by
cups no; existing cupper rule untouched).

## 5. The score's name (decision 8) — LAST commit, after `git merge origin/main`
The number this app computes is named "Puntaje Café Sensible (base CVA)" (en: "Café Sensible
score (CVA-based)").
- First produce an inventory table (file:line, current es / en text, surface) of every place
  that NAMES the score as "CVA" / "SCA" / "puntaje CVA" / "CVA score" / "puntaje
  comunitario" etc.: results page, drill-down, reports (participant summary, ficha técnica,
  coffee ficha), CVA PDF and print page, close email, CSV, dashboard, history. Put it in the
  PR body.
- Rule: each surface names the score in full ONCE (its title, legend, header row or first
  label); short labels elsewhere stay short ("Puntaje", "Mi puntaje", "Grupo", "Score").
  Never "Puntaje CVA" or "SCA score" as the name of this app's number. The CVA FORM keeps
  its name where the text refers to the SCA's form itself (the PDF/print twin of the form,
  "formato CVA", the methodology explanation).
- CSV: the score header columns become `puntaje_cafe_sensible` (es) / `cafe_sensible_score`
  (en) for the cupper's score and the matching `…_grupo` / `…_group` for the session's:
  look at the current headers, rename only the score ones, keep column ORDER, update tests,
  and say in the PR body that the header changed (anyone with a spreadsheet import must know).
- Remove the markers this package resolves (`TODO(A1`, `TODO(A2`, `TODO(A3` that are not
  `kim-validar`); list what you removed.

## Do not change
`lib/scoring.ts` arithmetic, the SQL, stored scores, `filterCoffeeSamples` gates,
`UserCoffeeHistory`, analytics queries, score band colours (another PR).

## Docs
CLAUDE.md "Scoring System" (the coffee lifetime scope: where it is computed, what feeds base
and cups, never stored), `docs/flows.md` §6 if it describes the coffee profile numbers,
`docs/product/cata-descentralizada-puntaje.md` §8 ("Dónde vive el cálculo") only.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors in `app/[locale]/dev/page.tsx` and
`components/ui/IntensitySlider.tsx`, `npm run build` after the last change). A unit-test
timeout under load is not a failure if the file passes alone (say so). If `npm ci` stalls
more than ~15 minutes: commit, push, say so. Report: branch, PR number, commits; the final
text of the pure function and its output type; how `foundBy` is computed without an id
leaving the server; the feed table as committed; six worked examples (inputs → base,
deduction, score, tally); the name inventory; every string added or changed (es and en);
gate tails with exact counts; anything not done or doubtful; what can only be judged signed in.
