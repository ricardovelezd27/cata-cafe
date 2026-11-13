# Brief — S10 WP3b: optional timer, "as it cooled" value, "no evaluado" per section (no schema change; ONE SQL phase, written by you, applied by the owner)

Branch: `claude/s10-03b-cooled-not-evaluated-impl` from `origin/main` (it must contain WP3a:
the reveal freeze and the market note in the cup forms). DRAFT PR against `main`.
PR title: `S10 WP3b: optional cupping timer, a second value "as it cooled", "no evaluado" per section (partial evaluations)`
Kim rows (as named in `docs/prompts/S10-kim-answers.md` WP3): A5 (timer and the cooled value), C4 (no evaluado). Answers are SIMULATED:
`TODO(kim-validar:<row>)`. `npm run test:db` required.

Read first: `docs/handover/s10/brief-00-common-rules.md` (incl. the SQL phase rules);
CLAUDE.md "Scoring System" WHOLE (rule versions; "Change SQL and port in one commit"),
"Aggregate Scoring Pattern", "Evaluation Data Shape", "Validation", "Offline-First Pattern";
`lib/scoring.ts` (`calcAffectiveSum`, `isAffectiveComplete`, `hasAffectiveData`,
`computeGroupAggregate` and its v1 branch), `lib/evaluation.ts` (`affectiveRatingKeys`,
`sanitizeAffectiveRatings`, `computeEvaluationDerived`), `lib/completeness.ts`,
`lib/evaluationState.ts`, `prisma/sql/rls_and_triggers.sql` (`is_affective_complete` ~l.544;
PHASE 26 `recompute_aggregate_score()` ~l.2366-2517, the LIVE function),
`prisma/sql/dry-runs/phase26_dry_run.sql`, `tests/phase26Sql.test.ts`,
`tests/scoringConsistency.test.ts`, `tests/db/aggregate.dbtest.ts`, the two cup forms,
`components/ui/AffectiveBubbles.tsx`, `lib/coffeeLifetimeScore.ts` if it exists (the coffee
score: "ratings incomplete → cups in, base out" must keep holding for a partial evaluation).

## 1. C4 — "No evaluado" per affective section → a PARTIAL evaluation
A cupper who could not judge one section (e.g. arrived after the fragrance) marks it "No
evaluado" instead of inventing a value.

**Data (module JSON, no column):** `<attr>_ne: true` for each of the 8 affective attributes
(`<attr>` = the ids in `AFFECTIVE_ATTRIBUTES`). In `computeEvaluationDerived`, in this order:
sanitize ratings as today; for every attribute whose `_ne` is exactly `true`, DELETE its
rating keys (`<attr>_final`, `<attr>`, and `<attr>_inicial` from §2) so a stale value can
never be read; any other `_ne` value is dropped (only literal `true` is stored). Pure helper
+ tests.

**Definitions (one pure module, e.g. beside `isAffectiveComplete`):**
- `isAffectiveComplete` — UNCHANGED (all 8 rated).
- `isAffectiveDeclaredPartial(data)` — at least one `_ne === true`, at least one attribute
  rated, and every attribute is EITHER rated OR marked `_ne`.
- "Finished" for the form, the submit path and `lib/completeness.ts`: complete OR declared
  partial. An evaluation with an attribute that is neither rated nor marked stays exactly as
  incomplete as today (old incomplete rows change nowhere: that is why the marker gates
  everything).

**Scores of a declared-partial evaluation:**
- `rawScore` and `individualScore` are stored NULL (both columns are nullable). It has NO
  total: never substitute 5 for the missing section. Check every reader of those two columns
  on the cupper's own path (results drill-down, score line, history sync, participant
  summary, CVA PDF, CSV, close email) renders "Parcial · sin puntaje" (es) / "Partial · no
  score" (en) instead of a number, a crash or a silent 79.00; list each in your report.
- Group TOTAL (average of totals, deductions, `participantCount`, `scoreSd`): a partial
  evaluation is NOT included (already so: it is not complete). Its cups and flags do not
  enter the session deduction either (the deduction pools the INCLUDED evaluations; keep).
- Per-attribute averages (`attrAverages`, the radar): an evaluation feeds them when it is
  complete OR declared partial; each attribute averages over the evaluations that RATED it
  (its own denominator). Today TS divides every attribute by `included`; SQL uses `AVG`
  (null-skipping) over complete rows. Both change together:
  - TS `computeGroupAggregate` (v2 branch ONLY; the v1 branch is history and stays
    byte-identical): per-attribute sum and count over complete + declared-partial
    evaluations; an attribute nobody rated is absent from the map.
  - SQL **PHASE 29** (below).
- UI honesty: where a sample's radar or attribute list includes a partial evaluation, one
  line: "Incluye {n} evaluación parcial" / plural (es + en). `submittedCount` / "n de N
  incluidos" keep their meaning (a partial evaluation is submitted and not included in the
  total).

**Form:** each affective section gets a small "No evaluado" toggle (text button, not colour
alone, `min-h-[44px]`); when on, the bubbles of that section are cleared and disabled and
the section reads "No evaluado"; toggling off re-enables them empty. Not offered on a pinned
reference (`lockedAffective`). The form's progress/completeness indicator counts a marked
section as answered. Before submit, if any section is marked: a one-line note on the
existing submit confirmation, "Tu evaluación de {muestra} es parcial: no tendrá puntaje
total. Lo que sí calificaste cuenta en los promedios por atributo." (+ en). No extra dialog.

## 2. A5 — a second value "as it cooled"
- Data: `<attr>_inicial` (1..9) = the first value the cupper gave; `<attr>_final` stays THE
  value scoring, completeness, the trigger and every report read. `_inicial` is display-only:
  add it to the sanitizer (clamped 1..9, non-numbers removed) but NOT to anything that
  scores. If `_inicial` equals `_final`, drop `_inicial`.
- Form: after a section has a value, a quiet text button "¿Cambió al enfriarse?" lets the
  cupper give the cooled value: the current value moves to `_inicial`, the new one becomes
  `_final`, shown as "7 → 8"; "Quitar" restores the single value (the `_final` stays).
  Optional, collapsed, never required; not on a pinned reference.
- Shown in the cupper's own drill-down ("7 → 8 al enfriarse") and for the owner where a
  cupper's per-attribute values are listed; not in the CSV/PDF in this PR unless a notes area
  takes it without a layout change (say which).

## 3. A5 — optional timer (client only)
- A small, optional timer on the cup page, off by default, per session + user in
  `localStorage` (`cata_timer_<sessionId>_<userId>`: start timestamp only). The cupper starts
  it when water is poured. It shows mm:ss and four text cues: 4:00 "Rompe la costra", 8:00
  "Primera pasada (entre 8 y 10 min)", then two more passes named without times ("Segunda pasada", "Tercera
  pasada") that the cupper advances by hand. No sound by default (a mute-able single beep is
  NOT in scope), no server call, nothing stored in the evaluation, survives reload, cleared
  by "Reiniciar" and by `clearLocalDeviceState`. One clock: derive from `Date.now() - start`
  in a 1 s interval; pure function for "which cue at t" + tests. It must not sit over the
  form's controls on a phone (dock it with the existing sample header/controls; say where).

## 4. SQL — PHASE 29 (append at the END of `prisma/sql/rls_and_triggers.sql`)
- New helper `public.is_affective_declared_partial(data jsonb) RETURNS boolean`, IMMUTABLE,
  the exact twin of the TS definition (same key list as `is_affective_complete`; a rating
  counts when its `::numeric` > 0, read with the same `_final`-then-base fallback
  `is_affective_complete` uses; a marker counts only when the JSON value is boolean true).
  Same privileges pattern as `is_affective_complete` (look at how it is granted/revoked and
  copy it; `SET search_path = public`).
- Re-issue `recompute_aggregate_score()` as a copy of the PHASE 26 body with ONE change: the
  WHERE of the `v_attr_averages` subquery becomes
  `(is_affective_complete(...) OR is_affective_declared_partial(...))`. Nothing else: totals,
  factor, `ruleVersion = 2`, the ON CONFLICT list stay byte-identical (the replay test should
  assert the diff between the PHASE 26 and PHASE 29 function bodies is exactly that clause).
- With old application code the new function behaves exactly as PHASE 26 (no row carries a
  marker), so the owner applies PHASE 29 BEFORE the merge. Dry run
  `prisma/sql/dry-runs/phase29_dry_run.sql` (one `DO` block, rolls back, statements verbatim
  between the markers; it must print: how many submitted evaluations carry any `_ne` key
  today (expected 0), and prove on a temporary sample inside the block that a complete + a
  declared-partial evaluation give the expected attribute averages and an unchanged total);
  replay test `tests/phase29Sql.test.ts`; the port in `tests/scoringConsistency.test.ts`
  changed in the SAME commit; `tests/db/aggregate.dbtest.ts` extended (complete + partial at
  2 and 5 cups: total = the complete ones only; attribute averages with per-attribute
  denominators; TS `computeGroupAggregate` equals the real trigger; an old-style incomplete
  row with no marker changes nothing); commented rollback (= the PHASE 26 body); runbook
  section (dry run → the owner's yes → apply → read-only check → merge), in the style of §30.

## 5. Tests beyond the SQL
Unit: the two definitions (truth table over rated / marked / neither); derivation (marker
deletes stale ratings; partial → NULL scores; complete unchanged byte for byte; `_inicial`
sanitised and never scored: a property test that changing `_inicial` never changes
`rawScore`/`individualScore`); the offline replay path with a partial module; the legacy
draft rewrite at submit (`lib/legacyDrafts.ts`) with a partial module; the reference pin
clears `_ne` and `_inicial`; the timer cue function; the score line / "Parcial" rendering
helpers. DB: submit a partial evaluation through the real actions (stored NULL scores,
aggregate row as expected, history row with NULL individual score, solo auto-close still
happens when every sample is finished).

## Do not change
The deduction arithmetic, the v1 branches, stored data of existing rows, `isAffectiveComplete`,
the completeness of old rows, the reveal freeze, the market keys.

## Docs
CLAUDE.md ("Evaluation Data Shape": the three new key families and that only `_final`
scores; "Scoring System": partial evaluations, per-attribute denominators, PHASE 29 is now
the live function), `docs/flows.md` if it shows the form, runbook.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors in `app/[locale]/dev/page.tsx` and
`components/ui/IntensitySlider.tsx`, `npm run build` after the last change). A unit-test
timeout under load is not a failure if the file passes alone (say so). If `npm ci` stalls
more than ~15 minutes: commit, push, say so. Report: branch, PR number, commits; the final
text of both definitions (TS and SQL); the diff between the PHASE 26 and PHASE 29 function
bodies; the dry run's expected output; every reader of `rawScore`/`individualScore` and what
it shows for a partial evaluation; every string added or changed (es and en); gate tails
with exact counts; anything not done or doubtful; what can only be judged on a phone.
