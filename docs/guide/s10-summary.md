# S10 summary

## S10 in one page (2026-11, read this first)

Every S10 code package is merged to `main`, #139 (WP6b) the last (the PRs are listed in `docs/handover/S10-HANDOVER.md`). Each rule below has its full text in a
section further down; this block says what changed and where to look. Every S10 behaviour built on
a SIMULATED answer of Kim carries `TODO(kim-validar:<code>)`; the list for Kim is
`docs/product/kim-validar-S10.md`.

**For a cupper.** The total is never shown while cupping: it appears after "Enviar", with its
arithmetic in one line (`lib/scoreLine.ts`). Each defective cup has a type (mohoso, fenólico, papa).
A second value "as it cooled" and "No evaluado" per section (a declared partial evaluation)
exist; the optional timer is the organiser's (OR-C). A revealed sample of an open session takes no more ratings. Group results appear
only when the session is closed. On a closed session the cupper sees "tú vs. grupo" and, for a
repeated coffee, the difference between their own two evaluations. A note can be added after
close, and a note left on the device can be sent to the organiser. Warm-up reflections are private
and there is a short warm-up version.

**For an organiser.** Blind letters are random; the owner reads letter to coffee in "Clave de
muestras". The wizard proposes 2 cups per sample and warns above 6 samples. Each sample can carry
prep data (roast date, note, off-protocol), visible to the owner or once revealed. The reference
has two modes: `anchor` (pinned 79.00, a Café Sensible exercise, not CVA) or `free`; the fixed reference exists in the affective and combined formats only (a descriptive session never pins and never says "fija" or "79.00": one predicate, `referenceExplanation` / `shouldPinReference`, `lib/referenceRules.ts`); a re-pin keeps
the cupper's previous ratings and restores them. The close can be announced 2 or 5 minutes ahead,
late evaluations are accepted one by one, an idle live session is handled by the idle rule (sessions started on or
after 2026-11-18 UTC: reminder at 24 h, closed with emails after 7 to under 30 idle days, closed silently after 30 or
more; sessions started before that date: no reminder, closed silently only after 30 idle days, never emailed;
`idleCloseDecision`, `lib/closeRules.ts`), and nothing can be re-dated once the closing date passed. Exclusions use
a fixed reason list and the excluded cupper gets one private line. The results CSV carries keyed
codes, with a variant without names.

**For a coffee owner.** The coffee page shows a lifetime score over every counted cup of that
coffee (never stored), the defect tally by type, and "Datos de origen editados el …" when origin
data changed after the close.

**Three scoring scopes, one formula** (details in "Scoring System"): the cupper's own score, the
session (group) score computed by the PHASE 29 trigger, and the coffee lifetime score computed at
read time. Flat CVA deductions (4 per defective cup, 2 per non-uniform cup, at most 6 per cup) at
any cup count; the shared deduction is diluted only beyond five pooled cups. The number is named
"Puntaje Café Sensible (base CVA)". Stored scores from before the rule keep their value and render unchanged; the close, repair and cron passes and "Actualizar" on a closed session never recompute them. A deliberate re-fire (owner exclusion or inclusion, accepting a late evaluation, a guest claim that removes or replaces a submitted evaluation) or editing an old evaluation recomputes that sample under the current rule.
(`ruleVersion`, `Evaluation.cups` NULL = old rule; a draft saved before the change and submitted after it is scored under the current rule.)

**Display-only (never read by scoring, the trigger or `AggregateScore`):** the reference and its
mode, ranking flags (`RANKING_POLICY`: "indicativo", ties, SD), Δ chips, the
express note, prep data, the timer, `<attr>_inicial`, `closingAt`, `warmupStartedAt`, `originEditedAt` and the late/post-close
columns. `entriesLocked` (it gates joins), `notifyGroupAtStart` and `lastClientWriteAt` (ordering metadata) are not display-only, but scoring, the trigger and `AggregateScore` never read them. A score is a number only: no colour or name by quality band.

**Where the process lives:** `docs/flows.md` (normative diagrams), `docs/LAUNCH-RUNBOOK.md` (every
manual step and what is still owed), `docs/handover/S10-HANDOVER.md` (what happened, in order),
`docs/product/` (Kim's questionnaire, the simulated answers, the score decision).
