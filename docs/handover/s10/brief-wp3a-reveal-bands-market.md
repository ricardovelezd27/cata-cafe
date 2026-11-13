# Brief — S10 WP3a: no evaluating after the reveal, no quality bands, the "market" note (no schema change, no SQL)

Branch: `claude/s10-03a-reveal-bands-impl` from `origin/main` (the architect tells you in the
launch prompt if it must start from another branch instead). DRAFT PR against `main`.
PR title: `S10 WP3a: a revealed sample can no longer be evaluated, scores shown without bands, optional market note`
Kim rows (as named in `docs/prompts/S10-kim-answers.md` WP3): X3 (reveal), A10 (bands and the market note), X4 (pickers stay). Answers are simulated: mark new behaviour
`TODO(kim-validar:<row>)`. `npm run test:db` required (write paths change).

Read first: CLAUDE.md ("Session Lifecycle", "Offline-First Pattern", "Server Action
Contract", "Styling", "CVA PDF Export & Reports"), `docs/flows.md` §1 and §6,
`lib/sessionAuth.ts` (`requireSampleOwner` / `requireSampleMember`, `assertSessionWritable`),
`app/actions/sessions.ts` (`upsertEvaluation`), `app/actions/community.ts` (`revealSample`,
`submitAllEvaluations`), `app/actions/offline.ts` + `lib/offline/status.ts` (replay outcomes),
`lib/scoring.ts` (`scoreBand`, `scoreToCategory`, `SCORE_CATEGORY_LABELS`),
`components/ui/ScorePill.tsx` (and `Badge`), `components/results/ScoreTable.tsx`,
`SampleRadarChart.tsx`, `lib/pdf/charts.tsx` (`PdfScoreBand`), `lib/pdf/palette.ts`.
Before building each part, check whether it already exists.

## Owner decisions that bind this PR (do not re-open)
- Scores are shown as a NUMBER only: no colour by quality, no category names ("Excelente",
  "Muy bueno", "Specialty"...). Two anchors are given as plain text wherever a legend helps:
  79 = the neutral point ("ni alto ni bajo", every attribute at 5) and 100 = the maximum.
- Once a sample is revealed (its coffee is shown), nobody can keep evaluating it.

## 1. X3 — a revealed sample is frozen for evaluation
Today `revealSample` on an OPEN session shows the coffee to everyone while cuppers can still
change their ratings for it: the evaluation is no longer blind.
- `requireSampleOwner` / `requireSampleMember` also return the sample's `revealed`.
- `upsertEvaluation` (live autosave) refuses a write for a revealed sample of a session that
  is not closed, with a new typed code `sample_revealed` (add to `ActionErrorCode`,
  `errors.codes` in both message files, es: "Esta muestra ya fue revelada y no se puede seguir
  evaluando.", en: "This sample has been revealed and can no longer be evaluated."). Follow
  `upsertEvaluation`'s existing return contract for refusals (see how `session_closed` is
  handled there and in `CupClient`): the save indicator must never show green for a refused
  write, and the cupper's local draft is not deleted.
- EXCEPTIONS that stay allowed on a revealed sample: submitting an existing complete draft
  (`submitAllEvaluations` flips `isDraft`; it does not change ratings); the owner-only
  per-sample rows (`upsertPhysical`, `upsertExtrinsic`: origin data is entered after the
  reveal by design); the reference pin's first-visit auto-save must NOT be attempted for a
  revealed sample (check `CupClient`).
- Offline replay (`replayEvaluation` and the legacy `syncEvaluation`): a draft for a revealed
  sample of an open session answers like a closed session for that module (the existing
  `closed` → `closed_unsent` path: the note is kept on the device and listed in "Notas sin
  sincronizar"); never an error, never a silent overwrite. Put the decision in a pure rule
  (e.g. `evaluationWriteAllowed({ status, expired, revealed })` beside the existing rules) used
  by the live and the replay paths, with unit tests; add DB tests for: live write refused and
  the stored row unchanged; replay answers `closed`; submit of an existing draft still works;
  a NOT revealed sample of the same session still accepts writes.
- `revealSample` on an open session: the owner's control asks first (`ConfirmDialog`), es
  title "¿Revelar esta muestra?", body "Todos verán qué café es y nadie podrá seguir evaluando
  esta muestra. Las evaluaciones en borrador de esta muestra quedarán como están." (+ en).
  No dialog when the session is already closed (close reveals everything).
- Cup page: a revealed sample renders read-only for everyone (same visual treatment as the
  locked reference: controls disabled, one line "Muestra revelada: ya no se puede evaluar."),
  including when the reveal arrives over realtime while the cupper has the sample open (find
  the handler that already receives `session_samples` / reveal updates; if none exists, the
  server refusal + the notice on the next save is the fallback: say which it is).
- `tests/useServerExports.test.ts` and its allowlists must still pass; `docs/flows.md` §1
  gets the rule.

## 2. A10 — scores without bands
- `ScorePill`: neutral surface for every score (MD3 tokens, no hex), no category name, no
  colour that depends on the value. Keep its size/shape API so call sites do not change.
- Remove every consumer of `scoreBand` / `scoreToCategory` / `SCORE_CATEGORY_LABELS` /
  `scorePillClass` that colours or names a QUALITY level: `ScoreTable`, `SampleRadarChart`,
  the dashboard, coffee pages, history, `PdfScoreBand` call sites in the PDF documents
  (`lib/pdf/*`), the print page, the close email, CSV headers if any name a category. Grep
  for all of them and list each in your report with what it shows now. Delete the functions
  and label maps once nothing uses them (and their tests), or keep a function only if a
  non-quality use remains (say which).
- NOT a quality band, so they stay: the `warning` token for a cupper far from the group's
  consensus (`bandFor` in `lib/reports/cupperStats.ts`, the owner matrix "semáforo"), status
  pills, the Δ chips against the reference (direction only), flavour-wheel group colours.
  If the owner matrix colours by QUALITY rather than by distance from the group, report it and
  make it neutral.
- One legend, as text, where a reader first meets a score list (results Resumen, the PDFs'
  score sections, coffee page): es "79 es el punto neutro (ni alto ni bajo) · 100 es el
  máximo.", en "79 is the neutral point (neither high nor low) · 100 is the maximum." Put the
  string once in messages and once in the PDF text map; reuse.
- `lib/pdf/palette.ts` stays the only place with hex; drop palette entries that only the
  bands used.

## 3. A10 — optional "market" note per evaluation
- Two JSON keys in the evaluation's module blob (no column): `mercado` = `"propio"` (default,
  "mi preferencia") | `"conocido"` ("un mercado que conozco"), and `mercado_nota` (free text,
  max 120 chars, only kept when `mercado` is `"conocido"`). Affective and combined formats
  only (it qualifies the affective ratings). Validate in `computeEvaluationDerived` through
  `lib/validate.ts` (`oneOf`, `str`); unknown values are dropped; never read by scoring,
  completeness, the trigger or `AggregateScore`.
- Form: one collapsed, optional line at the end of the affective part ("¿Desde qué punto de
  vista calificaste?" → two choices + the short text when "un mercado que conozco"); touch
  targets `min-h-[44px]`; translations as props; autosaved with the module (no extra call).
- Shown in the personal drill-down (`SampleDetail`) and, for the owner, next to that cupper's
  row detail if such a detail exists; on the CVA PDF / print page only if it fits an existing
  notes area without changing the layout (otherwise leave it out and say so).
- Pinned reference: the keys are cleared by the pin like the other affective inputs.

## 4. Documentation only
CLAUDE.md gains one sentence under the cupping form notes: the acidity and sweetness
descriptor pickers stay on purpose (a recorded departure from the CVA 2024 form, Kim's
answer), with `TODO(kim-validar:X4)` only in the doc line, not in code.

## Addendum (2026-11-13): what merged since this brief was written
- Start from the current `origin/main`. It contains #127 (cup forms rebuilt around
  `lib/cupDefects.ts`, no live total, the score line in `SampleDetail` /
  `ScoreBreakdownPanel`: keep all of it), #123 (closing rules: an EXPIRED session is already
  not writable; group results only at close), reference MODE (`shouldPinReference`: "the pin
  clears the market keys" applies only where that predicate pins), and the guest identity
  guard (`expectedUserId` on every cup-page write: keep passing it).
- The reveal freeze concerns sessions that are NOT closed and NOT expired. Do not touch the
  post-close paths: another PR in flight adds two sanctioned post-close writes
  (`acceptLateEvaluation`, `submitLateDraft`); your pure rule must not be wired into them.
- Other PRs in flight on neighbouring files (they may merge before you; `git merge
  origin/main` before your last commit and re-run the gates): the coffee lifetime score
  (coffee page, `lib/reports/ranking.ts`, the score's NAME in labels and CSV headers: do not
  rename score labels yourself, only remove band colours and category names), the privacy
  PR #128 (results page, `OwnerParticipantSection`, CSV), late contributions (results page,
  `CupClient` banner). Keep your edits to shared files small.
- If `npm ci` stalls more than ~15 minutes: commit, push and say so.

## Do not change
Scoring arithmetic, the SQL, stored data, the reference pin rule, completeness rules.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build`). Report: branch, PR number, commits; the pure write rule and every caller;
what a cupper sees when a sample is revealed under them (live and offline); the full list of
band consumers and what each shows now; what was deleted; the market keys and where they are
shown; every string added or changed (es and en); gate tails with exact counts; anything not
done or doubtful; what can only be judged on a phone.
