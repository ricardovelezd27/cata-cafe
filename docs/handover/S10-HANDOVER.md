# S10 — session handover

- **status:** in-progress
- **last updated:** 2026-11-13 by the database clock, end of day three: FOURTEEN PRs merged and live, four migrations and SQL phases 27, 26, 28 applied, legal pages published, **zero open findings on the Flowmap**; three branches in flight (see the "Late update" at the top of §3)
- **prompt:** `docs/prompts/S10-kim-answers.md`. **Approved plan with every decision:** `docs/handover/s10/approved-plan.md`.
- **goal:** the Flowmap board (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9) ends with zero open findings.
- **Resuming?** Read this file, then the plan. Do not re-plan and do not ask Ricardo again what §2 lists as decided. Continue from §5 "Next actions".

## 1. How this run works

- Ricardo, 2026-11-12: "do not stop until all is done". Every package's decisions were taken up front (§2). **PRs merge on a passing independent review** (gates green + Vercel preview green); the architect still reads scoring, SQL, auth and deletion diffs.
- Only Ricardo: `npx prisma migrate deploy`; an explicit yes for each SQL phase after its dry run; approving the legal preview before `LEGAL_PAGES_PUBLISHED` flips.
- Pipeline per PR: Sonnet executor in an isolated worktree → DRAFT PR → Opus reviewer in its own worktree ("attack it; would you merge this as is?") → fixes by the same executor → re-review when the fix is more than what the review prescribed → merge → production check → Flowmap.
- **Every review so far found real defects** (see §3). Do not merge on the builder's word.
- Executor briefs: `docs/handover/s10/brief-00-common-rules.md` holds the rules every executor gets; a package brief is a second file. Launch an executor with a short prompt that tells it to read both files.
- Machine limit: 15.6 GB RAM. Five concurrent builders/reviewers starved it on day three (0.58 GB free, `npm ci` never finished, `tsc` took 25 minutes). **At most FOUR agents.** When a builder stalls on install, have it commit and push and run the gates in the main session's worktree (it has `node_modules`, the `tests/db` dependencies and `.env.local`). Unit tests time out under load: re-run the file alone before believing a failure.
- A sub-agent sometimes ends without handing in its report: send it a message asking for the report; its context is intact.
- The browser pane is signed in to Vercel and (since day three) to Supabase. SQL editor recipe that worked three times: open `/sql/new` for the project, wait until `window.monaco.editor.getModels().length` is 1 (8 to 14 s; check `location.href`, a sign-out redirects), ship the script gzip+base64, in the page `atob` then `DecompressionStream('gzip')`, compare SHA-256, `getModels()[0].setValue(sql)`, click the element found by `find "Run"` (not "View running queries"), read `document.querySelector('main').innerText`; a read-only check is a `DO` block that ends in `RAISE EXCEPTION 'LABEL: %', v`. A health check answering 204 cannot be opened as a page: use `curl` or `fetch('/api/health')` from a loaded page.
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

## 3. Pull requests (state during day three, 2026-11-13 by the database clock)

### Update of 2026-11-14 (written by WP10, from `git log` on `main`; this wins over everything below)

Every S10 CODE package is now merged to `main`: #131 WP4b (`e594d13`, 2026-11-14 00:34 +01:00), #133 WP3a
(`29cc4aa`, 2026-11-13 22:34 +01:00), #136 WP5b (`1b6a192`, 23:57), #137 WP3b (`4265305`, 2026-11-14 00:48), #138 WP6
(`b7ff6d7`, 03:31). The branches listed as "open" in the Late update below are all merged.

- **SQL phases applied in S10:** 27, 26, 28 (2026-11-13) and **29** (dry run 2026-11-13 22:36 UTC, applied 23:36 UTC on the
  owner's yes, verified read-only: helper present and not executable by `authenticated`/`anon`, the trigger function mentions
  it, 354 aggregate rows all `ruleVersion` 1, none recomputed). The live `recompute_aggregate_score` is the PHASE 29 body.
  PHASE 23 step 2 stays CANCELLED.
- **Migrations applied in S10 (all by the owner):** `evaluation_cups`, `sample_prep_and_reference_mode`, `warmup_reflections`
  (2026-11-13), `coffee_origin_edited_at` (before #128 merged), `close_notice_and_late_contributions` (before #131 merged).
  Nothing is pending.
- **Legal pages are PUBLISHED** (2026-11-13). `UNUSED_ACCOUNT_PURGE_ENABLED` is OFF: rehearse and switch it on before 2027-05-30.
- **WP10 (documentation)** is the PR titled "S10 WP10: documentation checked against the code after S10". It rewrites the
  top of `CLAUDE.md`, checks `docs/flows.md`, the runbook (a "Still owed by the owner" list at its top and a STATUS line on
  §30 to §36), `README.md` and `PRODUCT.md`, and adds `docs/product/kim-validar-S10.md` (every `TODO(kim-validar:...)` with the
  question for Kim). The first-person warm-up line attributed to Kim (`TODO(kim-validar:F3)`) shipped by the owner's decision
  ("ship now", 2026-11-13) and needs his yes.
- **Still to do:** the final handover and the Flowmap card `k-s10` (done, with the parked items recorded: B4, E2, group member
  consent, accessibility statement, `__Host-` cookie prefix, replayable old migrations); the owner items at the top of the runbook.

### Late update (end of day three, written when the 5-hour usage limit was at 97%) — READ THIS FIRST; where it differs from the text below, this wins

**The Flowmap board has ZERO open findings.** F-grupal-1, F-grupos-10, F-cafes-9 and F-landing-1 are `fixed`. The plan is NOT finished: see "Still to do".

Merged and live since the tables below were written (fourteen S10 PRs in total):

| PR | Package | Merge | Database step | Verified in production |
|---|---|---|---|---|
| #128 | WP5a privacy and organiser tools (F-grupos-10, F-cafes-9) | `75fcc06` | migration `20261115090000_coffee_origin_edited_at` run by Ricardo | deploy, health, results-csv 401 unsigned |
| #130 | Leftovers (reservation move retried nightly, nightly passes isolated, guest follow-ups) | `8699553` | none | deploy, health, cron 401 |
| #132 | WP1c coffee lifetime score (F-grupal-1) | `ed6330d` | none | deploy, health, ficha 401 unsigned |
| #134 | Legal pages PUBLISHED (F-landing-1) | `3d79885` | none | six pages without banner, indexable; footer + login links; waitlist notice; sitemap |

Ricardo's decisions of the late session: "Yes, publish" (legal pages); on the missing Registro Mercantil line: **"Publish without it"** (recorded as `REGISTRY_PENDING_BY_OWNER` in `lib/legal/company.ts`). **Deadline created by publishing:** the privacy text promises the deletion of never-used accounts after 12 months; read-only check in production: 30 never-used accounts, none due, the oldest reaches 12 months on **2027-05-30**; the rehearsal (runbook §17 item 4) and `UNUSED_ACCOUNT_PURGE_ENABLED=1` must happen before that date.

Open branches when work stopped (the three agents were told to commit, push and stop; resume them or start fresh from the branch):

| PR / branch | State | Next action |
|---|---|---|
| #131 `claude/s10-04b-late-contributions-impl` (WP4b) | Two reviews said no; first fix round done (`1bdce0c`: organiser sees score + label, `receivedLateAt`, version guard, `closeAnnounced`). SECOND fix round was running: a pre-close draft is replaced by a late send only when it is INCOMPLETE (a complete one is never replaced); 4 lows. Brief: `docs/handover/s10/brief-fix-131-late-contributions.md` + the second-round message (rule above). | Read `planLateDraftWrite` and the guarded update → gates → Ricardo runs `npx.cmd prisma migrate deploy` (migration `20261115100000_close_notice_and_late_contributions`, FIVE columns, runbook §35) → merge → card `k-s10-04b`. |
| #133 `claude/s10-03a-reveal-bands-impl` (WP3a) | First review said no (a revealed sample could be re-pinned as the fixed reference; organiser's origin data dropped). Fix round done at `61d465d` (`reference_revealed`, `lib/revealFreeze.ts`, status `revealed_unsent`). Short re-review was running. | Finish the re-review → merge (no schema, no SQL) → card `k-s10-03a` → launch WP3b. |
| `claude/s10-05b-results-comparisons-impl` (WP5b) | Builder was running (thresholds 3 to 5 cuppers + tie rule, re-pin keeps and restores the cupper's ratings, comparisons at close with a 3-cupper privacy gate, repeated sample). Brief: `docs/handover/s10/brief-wp5b-results-comparisons.md`. | Resume or rebuild from the pushed WIP → Opus review (focus: every write path that pins carries the stash; no other cupper's values in a participant's payload) → merge. |

Still to do after those: **WP3b** (brief `docs/handover/s10/brief-wp3b-timer-cooled-not-evaluated.md`: timer, cooled value, "no evaluado"; SQL **PHASE 29** = dry run, Ricardo's yes, apply BEFORE the merge), **leftovers-2** (review lows of #128: db test that `updateSampleMetadata` stamps `originEditedAt`, a real race test for the atomic coffee save, coffee page + ficha use `stoppedWritingAt`, the conflict message must warn that reloading discards typed text, stale header comment in `resultsCsv.ts`) together with **WP6 copy** ("alineación" for "calibración", a non-CVA name for the anchor reference, `CoCupperCard` hard-coded Spanish), **WP10 documentation**, the final handover, Flowmap card `k-s10` → done with the parked items recorded (B4 teacher's guide, E2, group member consent, accessibility statement, `__Host-` cookie prefix, replayable old migrations).

For Ricardo (none blocks): the Registro Mercantil line; the purge rehearsal before 2027-05-30; the founding-offer conditions, transfer-safeguards wording, contact address; pasting the email-change template (runbook §15); a decision on the default profile name (it is the first part of the email and is shown to co-cuppers in the waiting room, the organiser's matrix, group feed authors and the group page's "Propietario"); the browser pane's Vercel session expired (sign in again if a protected preview must be opened); every signed-in and device check listed in §4 item 5, plus: the coffee page's new score card, the published legal links, a results-CSV import that used the old `puntaje_cva` header (now `puntaje_cafe_sensible`).

Lessons of the late session: three review "no" verdicts came from the ARCHITECT'S briefs, not the builders' code (#127 untyped defects, #131 blind acceptance and then the incomplete-draft rule, #132 empty evaluations): tell every reviewer to attack the brief's rule too. A builder killed every `postgres.exe` on the machine: every prompt now says never to kill processes by image name. A branch merge once carried conflict markers (CRLF files): ask the reviewer to verify the MERGE RESULT. An automatic restart was scheduled in the session for 22:14 local (session-only; it works only while the app stays open).

### State before the late update


Dates: the database clock and the session say 2026-11-13. Some earlier entries in this file and
on the Flowmap are dated 2026-11-14 or 2026-11-15 by mistake; the order of events is right.

**Merged to `main` and live** (production host `cata-cafe-opal.vercel.app`; `cafesensible.ai`
redirects to it; `/es/...` answers 307 to the unprefixed URL, which is normal):

| PR | Package | Merge | Database step (all by Ricardo's command or explicit yes) | Verified in production | NOT verified |
|---|---|---|---|---|---|
| #115 | WP0 housekeeping | `c3e6c52` | none | nothing to verify | — |
| #116 | WP8 guests on a shared device (F-guest-4) | `09715d0` | none | deploy, health 204, join page loads | two people on one real device |
| #120 | WP2 creating a session (F-crear-sesion-10) | `b33f6fc` | migration `20261113100000_sample_prep_and_reference_mode` | deploy, health, no error in logs | everything signed in (wizard) |
| #119 | WP9b admin variable (F-insights-5) | `f867016` | none | boots with the variable required | super-admin pages signed in |
| #122 | WP7 warm-up | `a3e01ca` | migration `20261113110000_warmup_reflections`; **PHASE 27** applied (`rls=t; policies=0; grants=none`) | deploy, health | reflections, short version, entry on the cup page (signed in, phone) |
| #126 | WP8b guest follow-ups | `c2f0bb4` | none | deploy, health | claim in a second tab, paused tab |
| #117 | WP1a scoring core | `670ae89` | migration `20261113090000_evaluation_cups`; **PHASE 26** applied (new function has `v_factor`, old `>= 5` gate gone; 354 aggregate rows all still `ruleVersion` 1; nothing recomputed; no submission in the window) | deploy, health | a 2-cup session with one defective cup shows −6; an old closed session shows unchanged numbers |
| #118 | WP9a legal pages (unpublished) + unused-account deletion (switch off) | `9a123cf`, after FIVE reviews | none | six pages answer 200 with the draft banner and `noindex`; footer still mail links; sitemap lists none | Ricardo has not read them yet |
| #123 | WP4a closing rules | `6d71dcd`, after FOUR reviews | **PHASE 28** applied on "Yes, go ahead" (function body no longer reads `isDraft`/`cupperId`; security definer; `search_path=public`; EXECUTE authenticated yes / anon no; 354 aggregate rows untouched) | deploy, health, cron endpoint 401 without its secret | results page as a participant of an open group session, and as its organiser after the date ("Cerrar ahora") |
| #127 | WP1b the score as the cupper sees it | `799b83e`, two reviews + two small fixes by the architect | none | deploy, health, login | marking a defective cup and its type on a phone; the score line on results; keyboard use of the chooser |

SQL phases applied in S10: 27, 26, 28 (in that order). Migrations applied: three (above).
PHASE 23 step 2 stays CANCELLED; `scripts/resync-low-cup-history.ts` must never run.

Flowmap: findings `fixed`: F-guest-4, F-crear-sesion-10, F-insights-5. Cards: `k-s10-00`, `-01a`,
`-01b`, `-02`, `-04a`, `-07`, `-08`, `-08b`, `-09a`, `-09b`. `k-s10` still "doing". **Four findings
open:** F-grupal-1 (closes with WP1c), F-grupos-10 and F-cafes-9 (close with #128), F-landing-1
(closes when Ricardo approves the legal preview and the flag flips).

What the first nightly runs of the idle rule will do (PHASE 28 dry run, production, rolled back):
nobody is emailed; 8 abandoned group sessions close silently, 5 per night (fgh, nm, HONEY, Cata 09
Agosto, Cata 09 Agosto /2, lavados, Lucas, ALAMO ARTIST COFFEE); 4 are left alone until they reach
30 idle days (DEV 2026-11-27, Loumidis 2026-11-30, Las Adelitas 2026-12-05, RCS 2026-12-06: the
20-person class, organiser Kim; Ricardo said "Keep it out", so sessions started before
2026-11-18 are never emailed by this rule). 11 open group sessions no longer show group results to
participants until they are closed.

**Open or in flight** (check `gh pr list --state open` and each branch's `git log` first: an
agent's report may never have been read):

| PR / branch | Package | State when this was written | Next action |
|---|---|---|---|
| #128 `claude/s10-05a-privacy-owner-tools-impl` | WP5a: exclusion reasons + private notice, CSV with codes, group roster privacy (F-grupos-10), "editado" on origin data (F-cafes-9) | Review said NO: the "CSV sin nombres" was re-identifiable (rows in name order; C01 = organiser); the roster showed the email's local part through the default profile name; the "editado" note fired on publish/visibility changes; stale save not atomic. Fix round RUNNING (`brief-fix-128-privacy-tools.md`). It adds ONE migration: `20261115090000_coffee_origin_edited_at` (`Coffee.originEditedAt`). | Read the builder's report → short Opus re-review → Ricardo runs `npx.cmd prisma migrate deploy` → merge → production check → mark F-grupos-10 and F-cafes-9 fixed. Tell Ricardo the list of OTHER places where a default profile name (the email's local part) is shown to co-cuppers (the builder reports it; not fixed in this PR). |
| `claude/s10-01c-coffee-lifetime-score-impl` | WP1c: coffee lifetime score, "indicativo" under five pooled cups, the score's name | Builder RUNNING (`brief-wp1c-coffee-lifetime-score.md`). No schema, no SQL. | Architect reads the pure function (scoring) → Opus review → fixes → merge → mark F-grupal-1 fixed. |
| `claude/s10-04b-late-contributions-impl` | WP4b: close announced 2 or 5 minutes ahead, late evaluations the owner accepts, text note after close | Builder RUNNING (`brief-wp4b-late-contributions.md`). ONE migration: `20261115100000_close_notice_and_late_contributions`. Three new sanctioned post-close writes. | Opus review (focus: can a participant change the group result after seeing it; payload privacy) → fixes → Ricardo runs the migration → merge. |
| `claude/s10-09c-leftovers-impl` | Leftovers the reviews deferred (reservation move retried nightly, nightly passes isolated, guest re-key follow-ups) | Builder RUNNING (`brief-wp9c-leftovers.md`). No schema, no SQL. Part A must land before the unused-account switch is ever turned on. | Opus review (it touches deletion code) → merge. |
| not launched | WP3a: no evaluating after the reveal, scores without bands, market note | Brief ready with an addendum for what merged since (`brief-wp3a-reveal-bands-market.md`). Waiting for a free slot (max four agents). | Launch from `origin/main`. |
| not briefed | WP3b (PHASE 29: timer, cooled value, "no evaluado"), WP5b (B2 re-pin stash/undo, B3 comparisons, B6 repeated sample, D3 thresholds + tie rule; after WP1c), WP6 copy (+ `CoCupperCard` hard-coded Spanish), WP10 documentation | Designs in §6. | Brief and launch as bases merge. |

What the reviews caught on day three (keep doing them, including reviews of fixes):
- #117: third and fourth rounds (migration lock timeout proven a no-op; close pass on all-old samples; guest claim re-fire scope).
- #118: an email change could move ANOTHER person's reservation (`user_metadata` is user-writable → `app_metadata`); the period counts from the last reservation or access request.
- #123: a session closed silently could still be emailed by the repair pass; the first idle run would have emailed a real 20-person class → grandfather rule.
- #127: on an OLD evaluation, touching the cup grid dropped its untyped defective cups (score 77.5 → 83.5). The cause was the architect's own brief. Rule now: a flagged cup always counts; the form requires a type for a new cup. The owner's decision document had one line saying otherwise; it was corrected and marked "pendiente de que Ricardo la confirme".
- #128: see the table.

## 4. Waiting on Ricardo (none blocks the agents)

1. `npx.cmd prisma migrate deploy` for the two migrations above, when their PRs pass review (one run can apply both). Procedure: check the PR tip out in the main session's worktree, `npx prisma migrate status` shows only the intended ones pending, give him the one-line command, `migrate status` again. **Always `npx.cmd`.**
2. Read the legal pages in production and say yes: `/privacidad`, `/terminos`, `/aviso-legal` (and `/en/...`). Still his: Registro Mercantil data, founding-offer conditions, contact address, whether custom SMTP is set in Supabase, the email-change template to paste (runbook §15). Then a one-line PR flips `LEGAL_PAGES_PUBLISHED` and F-landing-1 closes.
3. Confirm (he was told; no objection so far): a flagged cup with no type still counts ("sin especificar") and the decision document was corrected to say so; a guest claim recomputes a sample only when it removes a SUBMITTED evaluation; sessions started before 2026-11-18 are never emailed by the idle rule; the score line uses dot decimals; owners reminded under the old copy get no new notice; "no estaba en condiciones de catar" instead of a health reason.
4. Later: rehearsal and switch for the unused-account deletion (after the leftovers PR; before the oldest never-used account reaches 12 months), with the read-only counts in runbook §17 item 4.
5. Signed-in and device checks only he can do: two people on one tablet; a 2-cup session with one defective cup shows −6 and asks the defect type; an old closed session shows unchanged numbers; reflections and the short warm-up; the new session wizard; results of an open group session as participant and as organiser.

## 5. Next actions, in order

1. `gh pr list --state open`; for each branch in the table of §3 read the PR body and `git log` first.
2. #128: re-review → migration with Ricardo → merge → F-grupos-10 and F-cafes-9 fixed.
3. WP1c: read the function, review, merge → F-grupal-1 fixed. Then WP5b can be briefed.
4. WP4b: review → migration with Ricardo → merge. Leftovers PR: review → merge.
5. Launch WP3a as soon as a slot is free; then WP3b (PHASE 29: dry run, Ricardo's yes), WP5b, WP6, WP10.
6. After every merge: production check, Flowmap (`findings` → `state: "fixed"`, `pr`, `fixNote`, pinned with `if_version`; `kanban` card `k-s10-NN` shaped like `k-s10-04a`), and this file.
7. End state: zero open findings (F-landing-1 needs Ricardo), `k-s10` set to done, the final handover lists what was verified in production and what only a signed-in person can check.

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

The table of merged PRs in §3 has a column for each. In short: every merge was followed by a
production check from outside (deploy state, health endpoint, public pages) and every SQL phase
by a separate read-only query. Nothing that needs a signed-in person or a real device has been
checked by a session: that list is §4 item 5. No test data was added to production.

Built since §6 was written: WP1b (#127, merged), WP4a (#123, merged), WP8b (#126, merged).
In §6 the WP1b line "a defective flag counts only where typed" is superseded: a flagged cup
always counts (see §3, #127). WP5 was split into WP5a (#128) and WP5b.
