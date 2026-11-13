# S10 — the whole run: WP0 to WP10, without stopping

## Context

`docs/prompts/S10-kim-answers.md` is the last block of the flows audit. Done means the Flowmap
board has zero open findings, or a finding parked by Ricardo with the reason written on it.
Ricardo's instruction (2026-11-12): once this plan is approved, do not stop until all of it is
done. So every package's open decisions were collected up front (below) and PRs merge on a
passing independent review. Work never waits idle: anything that needs Ricardo is queued and
the next package continues.

WP1 returns the score to the pre-S8 principle, fixes three bugs and adds the coffee lifetime
score: `(4 × defective + 2 × nonUniform) × 5 ÷ max(5, cups)`, three scopes
(`docs/product/cata-descentralizada-puntaje.md`). No past score changes.

## Decisions taken by Ricardo in this session (do not ask again)

**Process**
- Merge on a passing review: independent Opus review says yes + every gate green + Vercel
  preview green → the architect merges. Scoring, SQL, auth and deletion diffs are still read
  by the architect first.
- Legal: adapt the five Caldi's Cup PDFs to Café Sensible; Ricardo approves a preview of both
  languages before `LEGAL_PAGES_PUBLISHED` flips. Pages: Privacy, Terms, Aviso Legal. Cookies
  becomes a short, code-verified section inside Privacy. Accessibility statement: parked until
  an audit of this app exists.

**WP1** — §5.1 nothing stored is recomputed; the impact list is produced for the record and
does not block. §5.2 closed + revealed + excluded out. §5.3 type mandatory per cup from now
on; the 22 legacy cups count in tally and deduction as "sin especificar". §5.4 quick
impression = **1 cup per sample**; ratings out of the coffee's B, cups and defects in.
§5.5 one voice per evaluation. §5.6 the session's cups for everyone, stored on the evaluation.
§5.7 "indicativo" = under 5 pooled cups in that scope. §5.8 "Puntaje Café Sensible (base
CVA)", CSV headers renamed too.

**WP2** — warn above 6 samples, above 4 for combined (never a cap). Per sample: roast date,
preparation note, out-of-protocol tick + note; optional, collapsed.
**WP3** — number only, no colour or category names; anchors 79 and 100 as text.
**WP4** — block re-dating once the closing date has passed (`isSessionExpired`).
**WP5** — "indicativo" for 3 to 5 cuppers, firm from 6 (shown when this OR the under-5-cups
rule holds). "Calibración distinta" removed for new exclusions; old rows still read.
**WP7** — reflections in an account table, owner-only.
**WP9** — group member consent: parked by Ricardo, unsubscribe stays.

## What still needs Ricardo (queued, never blocks the next package)

1. `ANALYTICS_SUPER_ADMIN_EMAIL` in Vercel Production, then tell me (not answered yet).
2. `npx prisma migrate deploy` for each migration, before the deploy that needs it.
3. An explicit yes per SQL phase applied to production, after its dry run; and being signed in
   to the Supabase dashboard in the browser pane.
4. Reading the legal preview and saying yes. Two facts the PDFs do not contain: the
   founding-offer terms and the waitlist retention period (12 months proposed), and the
   Registro Mercantil line, which the PDFs leave as `[0] [0] [GNE] [882914]`.

## Pipeline (every PR)

Sonnet executor in `isolation: "worktree"` from `origin/main`, told to check whether the thing
already exists → branch `claude/s10-NN-<name>-impl`, DRAFT PR → independent Opus review in its
own worktree ("attack it; would you merge this as is?") → fixes → gates (`npx tsc --noEmit`,
`npm test`, `npm run test:db` when data paths change, `npm run lint` with its 4 known errors,
`npm run build`, Vercel preview) → merge → production check in the browser pane → Flowmap
update. Docs (`CLAUDE.md`, `docs/flows.md`, `docs/LAUNCH-RUNBOOK.md`) in the same PR. Code
built on simulated answers carries `TODO(kim-validar:<code>)`. Up to three executors at once.
No blocking "write this function" request to Ricardo during the run; insights go in messages.

## Order and overlap

WP0 → WP1 (A, B, C) → WP2 → WP3 → WP4 → WP5 → WP7 → WP8 → WP9 → WP6 → WP10.
Parallel with WP1: WP0, WP2, WP7, WP9. After WP1 B: WP3 (same two forms). After WP1 C: WP5
(same results files). `messages/*.json` conflicts are resolved by rebase.

## WP0 — Housekeeping (`claude/s10-00-housekeeping-impl`)

Delete the marker comment only: `TODO(B8)`, `TODO(Kim-D1)` (`app/actions/sessions.ts`);
`TODO(E3-Kim)` (`lib/accountDeletion/deleteAccount.ts`, `manifest.ts`, `plan.ts`);
`TODO(E4-Kim)` (`manifest.ts`); `TODO(D4)` (`lib/analytics/cupperPrivacy.ts`, `scope.ts`);
`TODO(C4)` (`lib/joinRules.ts`); `TODO(C6)` (`lib/sessionEdit.ts`); `TODO(S8-05/C7)`
(`lib/sessionState.ts`). Keep `TODO(E5)` and the S8-11 consent one. `CLAUDE.md` "Community
Score": a defective cup IS in both lists.

## WP1 — The score

Found in exploration: three formulas are live today (the form's `ScoreDisplay` →
`calculateCVABreakdown` always deducts, counts unset as 0, no clamp; the stored individual
score gates at 5 cups; the trigger uses 10/30); `isQuickImpression` reads the 5-cup gate;
`computeCoffeeAggregate` (`lib/coffeeAggregate.ts`) averages stored scores;
`calcIndividualBreakdown` rounds without `roundToQuarter`; PHASE 23 has no replay test.

**Step 1 (architect, no PR).** One read-only `SELECT` in the Supabase SQL editor (handover
§3): per flagged sample and evaluation, stored score vs new-rule score. Table with ids and
numbers only, given to Ricardo.

**PR A — pure rule (`claude/s10-01a-score-rule-impl`).** `lib/scoring.ts`: one deduction
function used by `calcIndividualBreakdown`, `computeGroupAggregate`, `calcCommunityScore`;
non-uniformity ignored at 1 cup; `MIN_CUPS_FOR_PENALTIES` / `penaltiesApply` removed as a
gate; `roundToQuarter` everywhere. Callers: `AffectiveForm`, `CombinedForm`, `SampleDetail`,
`SampleRadarChart`, `lib/pdf/cvaFormData.ts`, `NewSessionForm.tsx`, `lib/historyRules.ts`
(quick impression = 1 cup). Tests: the spec's "Comprobaciones" table in
`tests/scoring.test.ts`, a property test (no flagged cup costs over 6), fixtures that flag a
defective cup as non-uniform too. **Not merged alone:** main deploys to production and
TypeScript deducting while PHASE 23 does not is the S8 mismatch. Merges with B.

**PR B — cups, defect type, SQL, what the cupper sees (stacked on A).**
- Migration: `Evaluation.cups Int?`, backfilled from `cupsPerSample` (the trigger fires only
  on `isDraft`, so the backfill fires nothing).
- Per-cup type in the module JSON, validated in `computeEvaluationDerived`
  (`lib/evaluation.ts`): key present → a defective flag counts only where typed; blob without
  the key is legacy and keeps its flags. Server forces defective ⇒ non-uniform at 2+ cups and
  clears non-uniform at 1 cup. `Evaluation.defectTypes` stays the distinct set. The offline
  replay goes through the same function.
- Forms (`CupToggleGrid`, `AffectiveForm`, `CombinedForm`): grid at 1 cup (defect row only,
  "Con una taza no se evalúa uniformidad"); marking defective asks its type; labels mohoso /
  fenólico / papa; the live `ScoreDisplay` removed; new hint copy replacing
  `session.newForm.cupsHint`, `results.breakdown.notTrackedNote`, `dashboard.intro.calcU` and
  the hardcoded `notScored`.
- The total first appears on the results drill-down after submit, breakdown line visible
  without expanding (`ScoreBreakdownPanel`: "82,25 − 4 (1 taza fenólica) − 2 (no uniforme) =
  76,25"; group variant with the dilution line).
- **PHASE 26** in `prisma/sql/rls_and_triggers.sql`: `recompute_aggregate_score()` with pooled
  cups `SUM(COALESCE(e.cups, cs."cupsPerSample"))`, factor `5 / GREATEST(5, cups)`, 4 and 2 per
  flag, non-uniform ignored on 1-cup evaluations; commented rollback. Dry run
  `prisma/sql/dry-runs/phase26_dry_run.sql`, replay test `tests/phase26Sql.test.ts` (copy
  `phase25Sql.test.ts`), port in `tests/scoringConsistency.test.ts` in the same commit,
  `tests/db/aggregate.dbtest.ts` extended to every cup count.
- Deploy order (runbook): migration → PHASE 26 dry run → Ricardo's yes → apply → read-only
  check → merge A and B → deploy → production check. `COALESCE` keeps the new trigger correct
  under old and new code.

**PR C — coffee lifetime score and downstream (after B is live).** Pure function beside
`lib/coffeeAggregate.ts` (B from counted evaluations, one voice each, 1-cup sessions out of B;
pooled cups and flags from all; the one deduction function; tally by type with "sin
especificar" and distinct people; read time only). `lib/coffees/aggregateSamples.ts` selects
the extra fields; `filterCoffeeSamples` keeps every gate. Coffee page, `/api/coffees/[id]/ficha`,
`CoffeeFichaDocument`. One rule in `lib/reports/fichaTecnica.ts` (its copy deleted),
`participantSummary.ts`, `resultsCsv.ts`, `lib/pdf/cvaFormData.ts`, `lib/closeEmail.ts`,
`lib/coffeeHistory.ts`, `lib/analytics/queries.ts`, `RANKING_POLICY`. Rename everywhere.
Closes F-grupal-1, `TODO(A1/A2/A3)`, K-cafes-1.

## WP2 — Creating a session (`claude/s10-02-session-create-impl`; one migration)

Default 2 cups for affective and combined (`NewSessionForm.tsx`; express stays 1). Letters
assigned at random with a stable owner mapping, in the wizard, `lib/sessionEdit.ts` and
duplication (F-crear-sesion-10). Sample-count warning. Owner chooses when the group is emailed
(`lib/groupNotify.ts`, `notifyGroupAtStart`). Per-sample roast date, preparation note,
out-of-protocol tick + note. Reference mode per session, "ancla" or "referencia libre"; the pin
(`pinReferenceAffective`, `isPinnedModule`) only in anchor mode; fix the false wizard helper.

## WP3 — The cupping form (`claude/s10-03-cupping-form-impl`)

No evaluation write after a sample is revealed; `revealSample` on an open session warns.
Optional timer; a second "as it cooled" value per affective attribute (JSON keys, scoring uses
the final). "No evaluado" per section: no total, out of the average of totals, rated sections
still feed attribute averages, labelled "parcial" (`isAffectiveComplete` and SQL
`is_affective_complete`; a SQL phase if the twin changes). Bands removed per the decision
(`scoreBand`, `scoreToCategory`, `ScorePill`, PDFs). Optional "market" note. `CLAUDE.md`
records that acidity and sweetness pickers stay on purpose.

## WP4 — Closing a session (`claude/s10-04-close-impl`; SQL phase)

Warning before a live close; unsent complete drafts kept aside, owner accepts each (new
sanctioned post-close write: `docs/flows.md` §1 and the `tests/useServerExports.test.ts`
allowlist). Text note after close. Live sessions: reminder at 24 h, auto-close at 7 days via
the existing cron and `closeSessionInternal`. Group results only at close:
`canViewGroupResults` and its SQL twin `can_view_group_results` (dry run, Ricardo's yes).
Re-dating blocked once expired.

## WP5 — Results, reports, privacy (`claude/s10-05-results-impl`)

Re-pin never destroys ratings (stash in JSON, warn, undo). Personal drill-down comparisons,
closed sessions only. Repeated sample difference. New exclusion reasons and a private notice.
Thresholds and tie rule (1 point or half the SD, whichever is larger). CSV with a code column
and a "sin nombres" download. Members see names, only the group owner sees emails
(F-grupos-10). "Editado" note on origin data where missing (F-cafes-9). B4 recorded as parked.

## WP7 — Movimiento Sensorial (`claude/s10-07-warmup-impl`; migration + SQL phase for the table)

Reflections table (owner-only, in `mergeGuestData`, `deleteAccount`, the manifest). Short 1–2
minute version with its own timeline in `lib/warmup/timeline.ts`, also in "Catar ahora".
Discreet entry after start. Seated and small-space substitutions.

## WP8 — Guests (`claude/s10-08-guests-impl`)

"¿Eres <nombre>? / No soy <nombre>" on the join page when an anonymous session exists
(F-guest-4). E2 recorded as parked next to F-landing-1.

## WP9 — Ricardo's two findings and loose ends

- `claude/s10-09a-legal-impl`: adapted Privacy, Terms and new Aviso Legal pages (es + en) from
  the PDFs: company facts, legal bases, rights, AEPD, minors, jurisdiction, licence kept; product
  name and domain changed; only sections about features this app lacks removed (passwords,
  Stripe, marketplace, scanner, gamification, cookie banner, analytics cookies). Cookies section
  written from what the code sets. Waitlist retention purge in the daily cron (bounded, counts
  only). Manifest check for the waitlist row. Built with the flag still false; the flag flips
  in a one-line follow-up after Ricardo approves the preview (F-landing-1).
- `claude/s10-09b-insights-env-impl`: `ANALYTICS_SUPER_ADMIN_EMAIL` required in `lib/env.ts`,
  hard-coded fallback removed from `lib/analytics/access.ts`. Merged only after Ricardo
  confirms the variable is set (F-insights-5).
- `claude/s10-09c-leftovers-impl`: reload notice wherever the pending-drafts badge shows; one
  refetch on resume on the owner's cup page; `isSessionExpired` in `edit/page.tsx`.
- Recorded as the owner's decision, not built: replayable old migrations, `__Host-` cookie
  prefix, group member consent, accessibility statement.

## WP6 — Copy, then WP10 — Documentation

WP6: "alineación" for "calibración" in `messages/*.json`, `components/landing/*`, user docs;
a non-CVA name for the anchor reference; optional first-person warm-up line. WP10: `README.md`,
`CLAUDE.md`, `docs/flows.md`, `PRODUCT.md`, runbook, handovers, each claim checked against the
code; the reviewer reads the scoring sections against `lib/scoring.ts` and the SQL.

## Verification

- Per PR: the gates above. SQL phases: dry-run output read back, then a separate read-only
  query after apply (function body; no `aggregate_scores` row changed).
- Production, browser pane, Ricardo's test account, after each behaviour merge. For the score:
  a 2-cup solo session with one phenolic cup shows −6 for the cupper and the session; a 1-cup
  session shows −4 and no uniformity row; no live total in the form; a coffee profile shows the
  lifetime score and the tally. Said plainly what was and was not seen.
- Flowmap after each merge: `findings` → fixed with the PR number; `kanban` cards `k-s10-NN`,
  `k-s10`, `k-s8-open`.
- End state: `grep -rn "TODO(" app lib components hooks` shows no Kim marker except
  `TODO(kim-validar:…)`, `TODO(E5)` and the S8-11 one; the handover lists what was verified in
  production, what was not, and the device checks that remain Ricardo's.
