# S10 — session handover

- **status:** in-progress
- **last updated:** 2026-11-14 (end of the second working day: #116, #119 and #120 merged and live; two migrations applied)
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
- The browser pane is signed in to Vercel; it was signed OUT of Supabase on day two (SQL editor recipe: handover S8 §3). A health check answering 204 cannot be opened as a page: load `/es` and `fetch('/api/health')` from there.
- A hook blocks Edit/Write into other worktrees. To edit a PR branch yourself, check it out in the main session's worktree. Ricardo's terminal needs `npx.cmd`, not `npx`. `ANALYTICS_SUPER_ADMIN_EMAIL` has been set in Vercel since 2026-09-14 for Production and Preview.

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

Decisions of day two (2026-11-14):
- **Ricardo, legal:** an account that was never used (a reservation or a sign-in request whose person never signed in) is REALLY deleted, with its reservation, after 12 months. Switch default off; rehearsal and switch-on are his.
- **Guests (#116):** `identity_changed` means only that a DIFFERENT user is positively signed in on the device; nobody signed in, or a failed lookup, behaves as before the guard.
- **Scoring (#117):** the close and repair passes never re-fire a sample made only of pre-deploy data (decided by data: aggregate `ruleVersion` 1 or absent, and every submitted evaluation with `cups` NULL). A guest claim that removes or replaces an evaluation recomputes THAT sample only, under the current rule (Ricardo was told in the day-two report; no answer yet).
- **Session creation (#120):** in create mode only a blank label is automatic; an automatic label keeps the letter of its position unless a typed label already uses it; adding a closing date to a live, not started, not yet notified session sends the group notice at that save, with an inline note before and a confirmation after.
- **Warm-up (#122):** the short version has no "open your eyes" cue or line when no kept step closed the eyes, and appends the exercise's own return-to-centre step when it would end off-centre (`TODO(kim-validar:F4)`).
- **Closing rules (#123):** on the idle auto-close, a session idle 30 days or more closes WITHOUT emails; 7 to 30 days closes with them. "Activity" = an evaluation being saved.

## 3. Pull requests (state at the end of day two, 2026-11-14)

**Merged to `main` and live** (production host `cata-cafe-opal.vercel.app`; `cafesensible.ai` redirects to it):

| PR | Package | Merge | Verified in production | NOT verified |
|---|---|---|---|---|
| #115 | WP0 housekeeping | `c3e6c52` | nothing to verify | — |
| #116 | WP8 guests on a shared device (F-guest-4) | `09715d0`, after FIVE reviews | deploy ok, health 204, join page loads | two people on one real device |
| #120 | WP2 creating a session (F-crear-sesion-10) | `b33f6fc`, three review rounds; migration `20261113100000_sample_prep_and_reference_mode` applied by Ricardo first | deploy ok, health 204, no error in Vercel logs (30 min) | anything signed in: random letters, sample warning, per-sample fields hidden until reveal, free reference mode, group notice on adding a closing date |
| #119 | WP9b admin variable + leftovers (F-insights-5) | `f867016`, two reviews + conflict resolution with #116 | preview and production boot with the variable required (health 204) | super-admin still sees Acceso / Usuarios; reload notice on a tab left open across a deploy |

Flowmap updated for each: findings F-guest-4 (v3), F-crear-sesion-10 (v2), F-insights-5 (v3) are `fixed`; cards `k-s10-08`, `k-s10-02`, `k-s10-09b` created; `k-s10` still "doing" (version 4).

**Open (all draft):**

| PR | Package | State | Next action |
|---|---|---|---|
| #122 | WP7 warm-up | **Review-approved** ("merge as is: yes" at `8e5ef43`; small follow-up `4a5e8c8` read by the architect: `requiresStep` on observe items, no "doble" demo on eyes-open short runs). Migration `20261113110000_warmup_reflections` is **APPLIED in production** (table exists, empty). Phase tests pass in either merge order with #117. | `git merge origin/main` on the branch + gates (main moved: #116, #120, #119). Then **PHASE 27**: dry run `prisma/sql/dry-runs/phase27_dry_run.sql` in the Supabase SQL editor (the pane was signed OUT of Supabase on day two: Ricardo signs in) → his explicit yes → apply the PHASE 27 block → verify queries (runbook §31) → merge → production check → Flowmap. Question for Kim noted in the PR body: an eyes-open short run has no sound marking the end. |
| #117 | WP1a scoring core | THREE reviews said "not yet"; each confirmed the rule, the TS/SQL equality and the dry run. Third fix round (`docs/handover/s10/brief-fix-117-round3.md`) was RUNNING at hand-over on the branch (tip before it: `d02cf4a`): migration wrapped in `BEGIN … COMMIT` (the reviewer PROVED `SET LOCAL lock_timeout` is a no-op the way Prisma sends the file), the close pass also skips an all-old sample that has no aggregate row, a guest claim re-fires only the samples whose evaluations changed, legacy-draft write guarded, "last phase" assertion dropped. | Check the branch tip and the builder's report (the PR body is updated by the builder); SHORT focused Opus re-review of that delta; then with Ricardo: check out the branch tip in the main session's worktree → `npx.cmd prisma migrate deploy` → PHASE 26 dry run → his yes → apply → verify → merge (runbook §30 on the branch). Then launch WP1b stacked on it (`brief-wp1b-cupper-experience.md`). |
| #118 | WP9a legal pages | Ricardo decided on day two: **unused accounts are really deleted after 12 months**. Spanish updated by the architect (`d0e3ed6`, `986c1f7`); builder added the deletion job (`lib/unusedAccountPurge.ts`, `lib/unusedAccountRules.ts`, switch `UNUSED_ACCOUNT_PURGE_ENABLED` default OFF = count only), the email-change move of the reservation, English in step, review fixes (tip `c32aa10`; 1,334 unit + 90 DB tests). THIRD review (Opus) was RUNNING at hand-over. | Read the review (questions put to it: can a USED account ever look unused, e.g. `last_sign_in_at` NULL after the ephemeral-client sign-in flow; `user_metadata.email_change_from` is writable by the user from the browser, so the move may be spoofable → should be `app_metadata`; hosted GoTrue columns vs the test shim; does the hosted `postgres` role read `auth.users`). Fix round → merge with the flag false and the switch off → Ricardo reads the preview (`/es/privacidad`, `/es/terminos`, `/es/aviso-legal`). |
| #123 | WP4a closing rules | Built (PHASE 28, runbook §33; 1,302 unit + 63 DB tests). Review said "not yet". Fix round (`brief-fix-123-close-rules.md`) was RUNNING at hand-over: the cup page still showed participants "3 de 5 enviados"; idle sessions of 30+ days close WITHOUT emails (backlog rule), 7–30 days with emails; idle pass last, 5 per run, time budget; owner "Cerrar ahora" on the results page of an expired, not closed session; tests that pin the two rules; neutral copy. | Focused Opus re-review → PHASE 28 dry run (it lists, by name, the sessions the first idle run would close, in two groups) → Ricardo's yes → apply → merge. **Conflict of meaning with #119 (now in main):** #119 left the closing date of an expired session editable; this PR must lock it (the brief says so). |

Stopped at hand-over, nothing pushed: the WP8b builder (guest follow-ups). Brief ready: `brief-wp8b-guest-followups.md`.

What the reviews caught on day two (keep doing them, including reviews of fixes):
- #116: the guard blocked legitimate cuppers after any sign-in hiccup; the notice was hidden on the cup page; a guest who claimed an account in another tab was locked out.
- #117: the close/repair pass could recompute pre-deploy sessions; every submit had become an interactive transaction; the migration's lock timeout did nothing (proven with probes).
- #120: a typed label that looked automatic was overwritten; then two samples could share a label; a closing date emailed the group silently. The architect also corrected the builder's letter draw (a label keeps its position's letter unless a typed label uses it).
- #122: the short version said "open your eyes" to people whose eyes were open and ended two exercises off-centre.
- #123: a participant-visible count the builder said was never rendered; the first idle run would have emailed months-old sessions.
- #118: every reservation already creates an account, so the old 12-month promise never ran.

## 4. Waiting on Ricardo

1. **Sign in to Supabase in the browser pane** (it was signed out on day two; Vercel is signed in) for the PHASE 27 dry run, then his yes. Same sitting later for PHASE 26 (#117) and PHASE 28 (#123).
2. `npx.cmd prisma migrate deploy` for #117 when its review passes. **Always give him `npx.cmd`**: PowerShell on his machine blocks `npx` (execution policy). Procedure that worked on day two: check out the PR's tip in the main session's worktree (it has `node_modules` and `.env.local`), confirm with `npx prisma migrate status` that only the intended migrations are pending, give him the one-line command, then `migrate status` again.
3. Reading the legal preview once #118 merges. Still open for him there: Registro Mercantil data (a test blocks publishing while it is null), founding-offer conditions, which contact address to publish, whether custom SMTP is configured in Supabase Auth (decides who sends access emails), transfer-safeguard wording, the "bloqueo" paragraphs, no age check exists, the liability cap. Later: the rehearsal and the switch for the unused-account deletion (before the oldest unused account reaches 12 months, about mid-2027; the runbook on the branch has the query).
4. To be told (architect decisions of day two, see §2): a guest claim that removes or replaces an evaluation recomputes THAT sample under the current rule; idle sessions of 30+ days close silently.
5. Device checks only he can do: two people on one tablet (join screen, old-tab notice, claim in a second tab); two phones in a live session; the warm-up on a phone (short version, lock screen, the entry on the cup page); a signed-in pass over the new session wizard.

## 5. Next actions, in order

1. `gh pr list --state open` → #117, #118, #122, #123. For the three that had an agent running at hand-over, read the PR body and `git log` of the branch first: the agent's report may never have been read.
2. #122: merge main, gates, PHASE 27 with Ricardo, merge. Smallest step to a fourth merge.
3. #123: re-review, PHASE 28 with Ricardo, merge. #117: re-review, migration + PHASE 26 with Ricardo, merge. Merge order of the SQL file blocks does not matter for the tests (each phase test reads only its own block), but each branch must `git merge origin/main` and re-run gates after another lands.
4. #118: act on the third review; merge with the flag false; show Ricardo the preview.
5. Launch, in this order as their bases merge: WP8b (now; from main), WP1b (stacked on #117), WP3a (after #117; brief ready), WP1c (after WP1b), WP3b (PHASE 29), WP4b (migration), WP5 (after WP1c), WP6 copy, WP10 documentation. Designs in §6; briefs in `docs/handover/s10/`.
6. After every merge: production check, Flowmap (`findings` → `state: "fixed"`, `pr`, `fixNote`, pinned with `if_version`; `kanban` card `k-s10-NN` shaped like `k-s10-02`), and this file.

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

SQL phase numbers reserved: 26 scoring core (#117), 27 warm-up reflections (WP7), 28 `can_view_group_results` (WP4a), 29 "no evaluado" attribute averages (WP3b). Runbook sections: §30 (#117), §31 (#122), §32 (#120, in main), §33 (#123). Each "is the last phase" test must tolerate earlier numbers landing first.

## 7. Facts gathered in production (read-only, 2026-11-13)

- Impact list (`docs/handover/s10/score-impact-result.md`, query beside it): 47 flagged samples, 60 flagged evaluations. 25 stored session scores are LOWER than the new rule would give (the old trigger over-deducted, up to 14 points; one 2-cup sample stores 0). 54 stored individual scores under five cups carry no deduction. Nothing is recomputed.
- Supabase project region: Central EU (Frankfurt).
- Vercel: `ANALYTICS_SUPER_ADMIN_EMAIL` present for Production and Preview since 2026-09-14; `UNSUBSCRIBE_SECRET` and `ACCOUNT_DELETION_ENABLED` not present.
- No test data was added to production today. No SQL was applied. No migration was run.

## 8. Verified / not verified

- Verified: #115 merged and its preview green; the #119 preview boots (health 204) with the variable required.
- Not verified in production: anything else, because nothing else is merged.
- Flowmap: `k-s10` set to in progress with the impact numbers and the end-of-day state; `k-s10-00` created (done). No finding changed state yet: F-insights-5 closes with #119, F-crear-sesion-10 with #120, F-guest-4 with #116, F-landing-1 when the legal flag flips, F-grupal-1 with WP1c, F-grupos-10 and F-cafes-9 with WP5.
