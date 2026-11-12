# S10 — session handover

- **status:** in-progress
- **last updated:** 2026-11-13 (end of the first working day)
- **prompt:** `docs/prompts/S10-kim-answers.md`. **Approved plan with every decision:** `docs/handover/s10/approved-plan.md`.
- **goal:** the Flowmap board (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9) ends with zero open findings.
- **Resuming?** Read this file, then the plan. Do not re-plan and do not ask Ricardo again what §2 lists as decided. Continue from §5 "Next actions".

## 1. How this run works

- Ricardo, 2026-11-12: "do not stop until all is done". Every package's decisions were taken up front (§2). **PRs merge on a passing independent review** (gates green + Vercel preview green); the architect still reads scoring, SQL, auth and deletion diffs.
- Only Ricardo: `npx prisma migrate deploy`; an explicit yes for each SQL phase after its dry run; approving the legal preview before `LEGAL_PAGES_PUBLISHED` flips.
- Pipeline per PR: Sonnet executor in an isolated worktree → DRAFT PR → Opus reviewer in its own worktree ("attack it; would you merge this as is?") → fixes by the same executor → re-review when the fix is more than what the review prescribed → merge → production check → Flowmap.
- **Every review so far found real defects** (see §3). Do not merge on the builder's word.
- Executor briefs: `docs/handover/s10/brief-00-common-rules.md` holds the rules every executor gets; a package brief is a second file. Launch an executor with a short prompt that tells it to read both files.
- Machine limit: 15.6 GB RAM. Five or six concurrent builders/reviewers (each runs `npm ci`, build, tests) leave about 1.5 GB free. Keep it at five or fewer.
- A sub-agent sometimes ends without handing in its report: send it a message asking for the report; its context is intact.
- The browser pane is signed in to Supabase (SQL editor recipe: handover S8 §3) and to Vercel. `ANALYTICS_SUPER_ADMIN_EMAIL` has been set in Vercel since 2026-09-14 for Production and Preview.

## 2. Decisions taken by Ricardo (do not ask again)

Process: merge on a passing review. Legal: adapt his five documents (written for Caldi's Cup) to Café Sensible; pages = Privacy, Terms, Legal notice; cookies = a code-verified section of Privacy; accessibility statement parked; he approves a preview first.

| Package | Decision |
|---|---|
| WP1 §5.1 | Nothing stored is recomputed. |
| WP1 §5.2 | Coffee lifetime score counts closed + revealed samples, excluded cuppers out. |
| WP1 §5.3 | Defect type mandatory per cup from now on; the 22 legacy cups count (tally and deduction) as "sin especificar". |
| WP1 §5.4 | Quick impression = exactly 1 cup per sample. Its ratings stay out of the coffee's base; its cups and defects count. |
| WP1 §5.5 | One voice per evaluation in the coffee's base. |
| WP1 §5.6 | The session's cups for everyone, stored on the evaluation. |
| WP1 §5.7 | "Indicativo" = under 5 pooled cups in that scope. |
| WP1 §5.8 | "Puntaje Café Sensible (base CVA)"; CSV headers renamed too. |
| WP2 | Warn above 6 samples (4 for combined), never a cap. Per sample: roast date, preparation note, out-of-protocol tick + note. |
| WP3 | Score shown as a number only: no colour, no category names; anchors 79 and 100 as text. |
| WP4 | Block re-dating once the closing date has passed. |
| WP5 | "Indicativo" for 3 to 5 cuppers, firm from 6 (shown when this OR the cups rule holds). "Calibración distinta" removed for new exclusions, old rows still read. |
| WP7 | Reflections in an account table, owner-only. |
| WP9 | Group member consent: parked by Ricardo, unsubscribe stays. |

Architect decisions made during the run (told to Ricardo, not objected to):
- **Rule versions.** "No past score ever changes" also has to hold on screen, and the results page, PDFs and CSV recompute scores. So the data says which rule produced it: `Evaluation.cups IS NULL` = old rule ("v1"), a number = new rule ("v2"); `AggregateScore.ruleVersion` (default 1) is stamped 2 by the PHASE 26 trigger. The migration backfills nothing. A re-fire of an old sample (owner exclusion after close, repair) moves it to v2: intended. Ricardo can switch old cuppings to the new rule on screen instead (he was told it is a small change).
- **WP1 was re-split**: PR 1 = scoring core (TS rule + migration + PHASE 26 + tests), because `tests/scoringConsistency.test.ts` and `npm run test:db` fail whenever TypeScript and the trigger disagree; PR 2 = the cupper's experience; PR 3 = coffee lifetime score.
- **WP3 and WP4 are split in two each** (see §6).
- **D2 "health" exclusion reason**: storing a health reason about a named person conflicts with the privacy text ("no special-category data"). Plan: word it "no estaba en condiciones de catar". Ricardo was told; no objection yet.
- **Legal contact**: the pages use `SUPPORT_EMAIL` (`lib/siteContact.ts`), not the personal email and phone printed in his documents.

## 3. Pull requests

| PR | Package | State at hand-over | Next action |
|---|---|---|---|
| #115 | WP0 housekeeping | **MERGED** (`c3e6c52`). Comments and docs only. | none |
| #117 | WP1a scoring core | Draft. Tip `d4fcd8b`: rule, migration (two columns, no backfill), PHASE 26 + dry run, rule versions. 1,314 unit + 68 DB tests. **Independent review running at hand-over.** | Read the review; fix; then Ricardo: `migrate deploy` → dry run in SQL editor → his yes → apply PHASE 26 → verify → merge → production check (runbook §30 on the branch). |
| #116 | WP8 guest join | Draft. Two reviews said "not yet". Second-round fixes in progress at hand-over (wrapping via a `wrap` prop on `Button`; identity check on every action; missing-session = refresh; replay actions take `expectedUserId`; 8 s cap on the pre-sign-out sync; forget the remembered anonymous id on refusal). | Third, focused review of the fix commit; merge if yes. Needs two people on one device to verify for real (list it for Ricardo). |
| #118 | WP9a legal pages | Draft, tip `3ebb9df`, gates green (1,308 tests, six legal routes static). First review said "not yet" (purge deleted founders' rows; three false statements). Fixed: Spanish text corrected by the architect (`a59f9c2`); English back in step; purge only removes reservations with no account (and deletes nothing if the account listing fails); `localeCookie: false`; publish guard test (flag true requires the Registro Mercantil data). **The fix has NOT been re-reviewed.** The builder doubts two source statements: AECOSAN may have been renamed AESAN, and the PLOPMED note may be out of date (both are Ricardo's source text). | Focused re-review of `6058d4c..3ebb9df`; merge with the flag still false; open `/es/privacidad`, `/es/terminos`, `/es/aviso-legal` on the preview for Ricardo; flag flip is a one-line follow-up after his yes. |
| #119 | WP9b env + leftovers | Draft, gates green. Preview boots with the variable required (health 204, checked 2026-11-13). **Independent review running at hand-over.** | Read the review; fix; merge. Closes F-insights-5. |
| #120 | WP2 session creation | Draft. Conflicts with main in `app/actions/sessions.ts` (comment-only, from #115); builder asked to merge main in. Its report was not yet in at hand-over. | Get the report; independent review; Ricardo runs `migrate deploy` (four `session_samples` columns + `cupping_sessions.referenceMode`) before the deploy. Closes F-crear-sesion-10. |
| — | WP7 warm-up | Builder running at hand-over (`claude/s10-07-warmup-impl`; brief in `docs/handover/s10/brief-wp7-warmup.md`). Migration `warmup_reflections` + PHASE 27. | Get the report; review; migration + PHASE 27 with Ricardo. |

What the reviews caught (keep doing them):
- #115: a reworded comment stated something the code does not do.
- #116: a stale tab could sign out a different guest; later, three fixes that did not work and a draft replay that could write under another user.
- #118: the purge contradicted the policy; "closed results are never modified", the sign-out storage statement and the locale cookie row were false; source wording dropped without a marker.
- #117 (found by the builder's own report): recomputed scores would have changed past results on screen.

## 4. Waiting on Ricardo

1. `npx prisma migrate deploy` for #117 (adds `evaluations.cups` and `aggregate_scores."ruleVersion"`, backfills nothing), later for #120 and WP7.
2. His yes for PHASE 26 after the dry run (and later PHASE 27, 28).
3. Reading the legal preview. Open items for him there: Registro Mercantil data (mandatory, pages omit the line; a test blocks publishing while it is null); founding-offer conditions; the 12-month waitlist retention and its scope; which contact address to publish (the support address's domain is not the company's); transfer-safeguard wording for Vercel and Resend and the Supabase "acuerdo de encargo firmado" claim; whether the "bloqueo" paragraphs stay; account deletion is still switched off (a deletion request by email has no tooling); no age check exists; the liability cap is zero while access is free; the PLOPMED note may be out of date.
4. Device checks only he can do (list at the end of the run): two people on one tablet for the join screen, two phones in a live session, a locked phone in the warm-up, offline on a phone.

Not needed from him: the Vercel variable (already set).

## 5. Next actions, in order

1. Collect the reports that were in flight (reviews of #117 and #119; fix rounds of #116 and #118; builders of #120 and WP7). `gh pr list --state open` and `gh pr view <n>` show the current tips.
2. #119: fix what the review found, merge, check production, mark F-insights-5 fixed on the Flowmap.
3. #117: fix what the review found; then the manual sequence with Ricardo (§3). After the merge: production check (a 2-cup solo session with one defective cup shows −6 for the cupper and the session; an old closed session shows the same numbers as before; `aggregate_scores` rows untouched).
4. Launch WP1b (cupper's experience) stacked on #117's branch as soon as #117's review passes; then WP1c.
5. #116, #118, #120, WP7: review rounds and merges as they go green. WP4a can start any time (brief ready). WP3a/3b after WP1b (same two forms). WP5 after WP1c (same results files). WP6 copy, then WP10 docs, last.
6. After every merge: production check in the browser pane, Flowmap `findings` + `kanban` (`k-s10-NN`, shape of `k-s10-00`; `k-s10` is at version 3), and this file.

## 6. Designs for the packages not yet built

**WP1b — the cupper's experience** (branch from #117's tip; no schema change):
- Per-cup defect type in the module JSON (`tazas_defecto_tipo`, one entry per cup, values from `SENSORY_DEFECTS`), validated in `computeEvaluationDerived`: when the key is present a defective flag counts only where typed; a blob without the key is legacy and keeps its flags. Server forces defective ⇒ non-uniform at 2+ cups. `Evaluation.defectTypes` stays the distinct set. Offline replay goes through the same function.
- `CupToggleGrid` / `AffectiveForm` / `CombinedForm`: grid shown at 1 cup (defect row only, "Con una taza no se evalúa uniformidad"); marking a cup defective asks its type; labels mohoso / fenólico / papa through messages (today hardcoded English uppercase).
- Remove the live "Puntaje Calculado" (`components/ui/ScoreDisplay.tsx`, `calculateCVABreakdown`): it is a third formula (always deducts, unset = 0, no clamp). The total first appears on the results drill-down after submit, breakdown visible without expanding: "82,25 − 4 (1 taza fenólica) − 2 (no uniforme) = 76,25"; the group variant adds "Entre todos se cataron 8 tazas: el descuento del grupo se reparte".

**WP1c — coffee lifetime score** (after WP1b is live): a pure function beside `lib/coffeeAggregate.ts`: base from counted evaluations (one voice each, 1-cup sessions out of the base), cups and flags pooled from all of them, the one deduction function, always v2 (it is a new computation, not a stored number); tally "X tazas defectuosas de N catadas (%)" by type with "sin especificar", and how many different people found it; "indicativo" under 5 pooled cups; read time only, never stored, never touched by the trigger. `lib/coffees/aggregateSamples.ts` must select `affectiveData`, `combinedData`, the cup columns, `cups`, `cupsPerSample`, `format`; `filterCoffeeSamples` keeps every gate. Coffee page, `/api/coffees/[id]/ficha`, `CoffeeFichaDocument`. Rename the score everywhere ("Puntaje Café Sensible (base CVA)", CSV headers `puntaje_cafe_sensible` / `cafe_sensible_score`). Closes F-grupal-1, `TODO(A2)`, K-cafes-1.

**WP3a — reveal freeze, bands, market note** (no SQL):
- No evaluation write after its sample is revealed while the session is open: `requireSample*` select `revealed`; `upsertEvaluation` refuses with a new code (copy in both languages); the offline replay answers like a closed session for that sample; submitting an existing draft stays allowed. `revealSample` on an open session asks first ("nadie podrá seguir evaluando esta muestra"). The cup page renders a revealed sample read-only.
- Bands: `ScorePill` neutral, no category names, `scoreBand` consumers (`ScoreTable`, `SampleRadarChart`, `PdfScoreBand` call sites, the dashboard's `scorePillClass`) neutral; one legend with the two anchors. The `warning` token for consensus deviation stays (it is not a quality band).
- Optional "market" key per evaluation: "mi preferencia" (default) / "un mercado que conozco" + short text. JSON keys, shown in the drill-down.
- `CLAUDE.md`: acidity and sweetness pickers stay on purpose (departure from CVA 2024).

**WP3b — timer, cooled value, "no evaluado"** (SQL phase):
- Timer: client-only, optional, per session + user in localStorage; cues at 4:00 (costra) and 8:00 (primera pasada), then two more passes without times.
- "As it cooled": the first value is kept in `<attr>_inicial`, `<attr>_final` stays what scoring reads; `sanitizeAffectiveRatings` must accept the new key.
- "No evaluado" per affective attribute (`<attr>_ne: true`): such an evaluation is "parcial": no total (store `rawScore` and `individualScore` NULL), left out of the average of totals (already, through `isAffectiveComplete`), but its rated attributes feed the per-attribute averages. Gate on the marker so old incomplete rows change nowhere: an evaluation feeds attribute averages when it is complete OR declared partial. TS (`computeGroupAggregate`) and SQL (`recompute_aggregate_score` attrAverages subquery) change together: a new phase that re-issues the PHASE 26 function.

**WP4a — closing rules**: brief ready, `docs/handover/s10/brief-wp4a-close-rules.md` (C5 group results only at close with PHASE 28 for `can_view_group_results`; C9 no re-dating; C3 reminder at 24 h and close after 7 idle days).

**WP4b — late contributions and notes** (migration):
- `CuppingSession.closingAt` (timestamptz): the owner announces a close 2 or 5 minutes ahead; cuppers see a banner with a countdown through the existing realtime handler; the owner's client calls `closeSession` at the deadline. No server enforcement.
- Complete drafts left at close stay drafts (today's behaviour). New owner action `acceptLateEvaluation` (post-close, complete draft only, stamps `acceptedLateAt` / `acceptedLateBy` on the evaluation, flips `isDraft` so the trigger recomputes, re-syncs history, results show "Resultados actualizados el…"). New member action `submitLateDraft` for a device-only `closed_unsent` draft: writes a DRAFT row only (never over a submitted one); results change only if the owner accepts. Both are sanctioned post-close writes: `docs/flows.md` §1 and the allowlist in `tests/useServerExports.test.ts`.
- A text note after close on one's own submitted evaluation: columns `postCloseNote` / `postCloseNoteAt`, never the JSON blob, never a rating.

**WP5 — results, reports, privacy** (after WP1c): B2 re-pin stashes previous ratings in the JSON, warns, allows undo; B3 personal drill-down comparisons on closed sessions only; B6 repeated-sample difference (tolerance 2 points total, 2 on intensities); D2 new reasons (see §2 on "health") and a private notice; D3 thresholds and tie rule (1 point or half the SD, whichever is larger); D5 CSV with a code column and a "sin nombres" download; D7 members see names, only the group owner sees emails (F-grupos-10); F-cafes-9 "editado" note where missing. B4 and E2 recorded as parked.

**WP6 — copy**: "alineación" for "calibración"; a non-CVA name for the anchor reference; optional first-person warm-up line. **WP10 — documentation**: README, CLAUDE.md, flows.md, PRODUCT.md, runbook, handovers, each claim checked against the code; the reviewer reads the scoring sections against `lib/scoring.ts` and the SQL.

SQL phase numbers reserved: 26 scoring core (#117), 27 warm-up reflections (WP7), 28 `can_view_group_results` (WP4a), 29 "no evaluado" attribute averages (WP3b). Each "is the last phase" test must tolerate earlier numbers landing first.

## 7. Facts gathered in production (read-only, 2026-11-13)

- Impact list (`docs/handover/s10/score-impact-result.md`, query beside it): 47 flagged samples, 60 flagged evaluations. 25 stored session scores are LOWER than the new rule would give (the old trigger over-deducted, up to 14 points; one 2-cup sample stores 0). 54 stored individual scores under five cups carry no deduction. Nothing is recomputed.
- Supabase project region: Central EU (Frankfurt).
- Vercel: `ANALYTICS_SUPER_ADMIN_EMAIL` present for Production and Preview since 2026-09-14; `UNSUBSCRIBE_SECRET` and `ACCOUNT_DELETION_ENABLED` not present.
- No test data was added to production today. No SQL was applied. No migration was run.

## 8. Verified / not verified

- Verified: #115 merged and its preview green; the #119 preview boots (health 204) with the variable required.
- Not verified in production: anything else, because nothing else is merged.
- Flowmap: `k-s10` set to in progress with the impact numbers; `k-s10-00` created (done). No finding changed state yet: F-insights-5 closes with #119, F-crear-sesion-10 with #120, F-guest-4 with #116, F-landing-1 when the legal flag flips, F-grupal-1 with WP1c, F-grupos-10 and F-cafes-9 with WP5.
