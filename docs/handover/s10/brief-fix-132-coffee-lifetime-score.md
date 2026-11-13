# Brief — fixes for PR #132 (S10 WP1c, coffee lifetime score) after its independent review

Branch: the EXISTING branch `claude/s10-01c-coffee-lifetime-score-impl`. `git fetch origin`,
then `git merge origin/main` FIRST (main now has #128: conflicts expected in
`app/api/coffees/[id]/ficha/route.ts`, `lib/pdf/CoffeeFichaDocument.tsx`, `messages/*.json`,
`tests/reports.test.ts`; keep BOTH sides' intent: #128's "Datos de origen editados" note and
keyed CSV codes, your lifetime block and renamed score header). Never rebase or force-push.
The PR exists (#132): update its body.

The review confirmed: every gate intact, no id leaves the server, every coffee-scope row of
the decision document matches, 3000 random cases never exceed 6 per flagged cup, all seven
mutants caught. It said "merge as is: NO" for one High and several Mediums. The architect's
decisions below are final (two of them change the brief's own table: the brief was wrong).
Tests FIRST.

## H1 — who feeds cups and flags (the brief's table was wrong)
Measured: one cupper, 2 cups, 1 defective, plus 4 EMPTY submitted evaluations of 2 cups →
shown 10 cups, −3; must be 2 cups, −6. And with partly filled evaluations the coffee shows
−3.75 where its only session shows −6, which breaks the decision document's row "Perfil del
café justo después: −6".
New rule: **the coffee pools the cups and flags of exactly the evaluations a session's group
score pools: the COMPLETE ones (`isAffectiveComplete`)**. Quick impressions (1 cup per
sample) that are complete still feed cups and flags and still do not feed the base
(decision 4). Table as it must be committed:

| evaluation | BASE (one voice) | CUPS + FLAGS |
|---|---|---|
| descriptive format | no | no |
| complete, session with 2+ cups per sample | yes | yes |
| complete, quick impression (1 cup per sample) | NO | yes |
| incomplete ratings (partly filled or empty) | no | NO |
| any reference sample of an `anchor`-mode session | no | no |
| reference sample of a `free`-mode session | as any other | as any other |

Tests: the reviewer's two scenarios; a coffee with ONE session always shows the same
deduction as that session's group score (property test: build random single-session inputs,
compare `computeCoffeeLifetimeScore(...).deduction` with `computeGroupAggregate(...)`'s
penalties for the same evaluations, excluding quick-impression and reference cases); fix the
test that pinned "no ratings still counts its cups". Update the function's header comment,
CLAUDE.md and `docs/product/cata-descentralizada-puntaje.md` §8 only.

## M4 — references: keep the rule, SAY it
Decision: every reference sample of an anchor-mode session stays out (an earlier reference
keeps its pinned 5s unless a cupper re-rated it; counting 79.00 placeholders as opinions is
worse than dropping a few real re-ratings). But the page must say it:
- The function also returns `anchorReferenceSessions` (distinct sessions skipped for that
  reason). Numbers only.
- Coffee page and ficha: when it is > 0, one line, es: "{n} cata en la que este café fue la
  referencia fija no cuenta para este puntaje." / plural "{n} catas en las que este café fue
  la referencia fija no cuentan para este puntaje." (+ en).
- The no-base text must not blame quick impressions when the cause is something else: three
  honest variants chosen by the data (only quick impressions; only anchor references; none
  of its catas is complete yet), es + en.
- The "0 tazas en 0 catas" line is not printed when cups = 0.

## M2 — the arithmetic line must never look wrong
In 3000 random cases the line printed sums that do not add up 492 times (each part rounded
on its own, e.g. "Base 88.52 − 1.07 = 87.44 → 87.50"). Decision: NO equation. One labelled
line, es: "Base {base, 2 decimals} · Descuento {deduction, 2 decimals} ({motivo}) · Puntaje
{score}" and, always under the headline, the fixed note "El puntaje se redondea al cuarto de
punto más cercano." (+ en: "Base … · Deduction … · Score …", "The score is rounded to the
nearest quarter point."). No "−", "=" or "→" between rounded numbers anywhere in this block
(page and PDF). With no deduction: "Base {base} · Puntaje {score}". Test: the line contains
no "=" and its three numbers are the function's own `base`, `deduction`, `score`.

## M3 — one flagged cup must not read as two
A defective cup is also flagged non-uniform (that is the rule), so today the text says "1
taza defectuosa y 1 no uniforme" for ONE cup. Wording only (the arithmetic and the returned
`nonUniform` total stay): the function also returns `nonUniformOnly` = cups flagged
non-uniform and NOT defective, counted positionally within each evaluation's cups; every
sentence (reason in the line, tally) uses `defective` and `nonUniformOnly`: "1 taza
defectuosa de 40 catadas (2.5 %), encontrada por 1 persona"; "2 tazas no uniformes (sin
defecto)" only when `nonUniformOnly` > 0. Tests incl. a legacy row where a defective cup is
not flagged non-uniform.

## Low / nit
- L8 the ficha PDF says "indicativo" twice: once.
- N10 gone with M2 (the base is always shown with two decimals).
- Do NOT change: `evaluationCupCounts` (legacy flags beyond the cup count behave as in the
  session scope), the `foundBy` sentence, the radar population. Add to the PR body's
  questions for Kim: (a) the radar and attribute averages still include anchor 5s and quick
  impressions while the score does not; (b) with one evaluation the page shows "encontrada
  por 1 persona" and the defect type: should a minimum number of people apply?; (c) earlier
  (unlocked) references are left out of the coffee score.

## Gates and delivery
All five gates, one at a time, AFTER the merge of main (`npx tsc --noEmit`, `npm test`,
`npm run test:db`, `npm run lint` with exactly the 4 known errors, `npm run build` after the
last change). If `test:db` fails at database setup or hangs with no output for 10 minutes
under load, stop and re-run it alone. Start no background timers or monitors; do not stop to
wait on background work. Report: commits; how each merge conflict was resolved; the final
function text and output type; the feed table as committed; the three no-base variants and
every string added or changed (es and en); six worked examples in the new line format; gate
tails with exact counts; anything not done or doubtful.
