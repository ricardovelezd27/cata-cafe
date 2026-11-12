# S10 — Build what was waiting on Kim (simulated answers) and the decentralized score

> Prompt for a fresh session. Written 2026-11-12 by the S9 session. Owner: Ricardo.
> This is the last block of work identified by the flows audit (Flowmap artifact
> https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9). When it is done, every finding on the
> board is either fixed or explicitly parked with a reason.

## Read first, in this order

1. `CLAUDE.md` and `AGENTS.md`.
2. `docs/product/cata-descentralizada-puntaje.md` — the scoring decision. **This overrides
   S8-04 and the "One score below five cups" section of `CLAUDE.md`.**
3. `docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md` — the answers. They are
   **simulated by Ricardo's committee, not Kim's**. Treat them as the product decision, and
   mark everything built on them with `TODO(kim-validar:<code>)` (e.g.
   `TODO(kim-validar:A4)`) so it can be found when Kim replies. The questions are in
   `01-preguntas-para-kim.md` in the same folder.
4. `docs/handover/S8-ROLLOUT-HANDOVER.md`, last two sections, and §3 for how SQL is run.

## Decisions Ricardo has already taken (2026-11-12). Do not ask them again

- **The score** (full text in the scoring decision): CVA's flat deductions, 4 points per
  defective cup and 2 per non-uniform cup, at most 6 per cup, for what a cupper sees; the
  deduction is diluted only when MORE than five cups are pooled (a session's group score, a
  coffee's lifetime score). One cup never costs 15, 20 or 30 points. A purely proportional
  rule was considered and rejected the same day; ignore any text that still describes it.
- **No past score ever changes.** Only the coffee profile's lifetime score moves.
- **Latecomers ("no evaluado"):** a cupper who skipped a section gets no total and is left out
  of the session's average of totals; the sections they did rate still count in the
  per-attribute averages; labelled "parcial".
- **Late contributions after close:** allowed, owner only, complete drafts only, stamped,
  shown with the "Resultados actualizados el…" banner.
- **As little free text as possible.** Keep fixed option lists for consistency across
  cuppings. The acidity and sweetness pickers stay as they are; do not replace them with free
  words, even though CVA 2024 did. This is a deliberate departure from the answers file.
- **Teaching and comparisons only when the session is closed.** No "teacher's guide" shown
  during a session; that feature (answer B4) is parked.
- **Optional email at join (E2):** parked.

## State you start from (2026-11-12)

- `main` = `4dce4d9` plus a docs commit; production runs it. No open PRs.
- Production database has PHASE 21, 22, 23 step 1, 24 and 25. **PHASE 23 step 2 is CANCELLED:
  never run it, and never run `scripts/resync-low-cup-history.ts` under the S8-04 rule.**
- `npm run test:db` runs 54 tests against a throwaway local Postgres. Use it for every change
  to scoring, the trigger, close, delete, merge, RLS or email ledgers.
- Open findings on the board: F-crear-sesion-10, F-guest-4, F-grupos-10, F-cafes-9 (all in
  this prompt), F-landing-1 and F-insights-5 (Ricardo's: legal text, a Vercel variable; not
  yours), and F-grupal-1 (reopened: the scoring rule, WP1).

## How to work (non-negotiable; this is what worked in S8 and S9)

- **Ask before building, per work package.** Each package below lists "Decisions to confirm".
  Put them to Ricardo with AskUserQuestion (recommendation first) before you write code for
  that package. Do not resolve a product question inside a subagent.
- **Pipeline:** you are the architect. For each package: brief a Sonnet executor in
  `isolation: "worktree"` (it checks out `origin/main`, pushes a branch
  `claude/s10-NN-<name>-impl`, opens a DRAFT PR) → independent Opus review in its own
  worktree, told to attack and to answer "would you merge this as is?" → fix → you read the
  final diff of anything touching auth, scoring, SQL or deletion → merge only after Ricardo
  says so for that PR, unless he has told you to merge on a passing review.
  Every S9 review found a real defect. Do not skip it. Tell executors to check whether the
  thing already exists before building it.
- **One PR per work package**, stacked only when one needs another. Gate on every PR:
  `npx tsc --noEmit`, `npm test`, `npm run test:db` when data paths change, `npm run lint`
  (4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`),
  `npm run build`. The Vercel preview build must be green before a merge.
- **The only hosted database is production.** Sessions never run `prisma migrate`, seeds or
  the dev server against it. Migrations: write the file, Ricardo runs `migrate deploy` BEFORE
  the deploy that needs the column (the Prisma client selects new columns as soon as it is
  regenerated). SQL phases: append to `prisma/sql/rls_and_triggers.sql`, write a
  self-rolling-back dry run in `prisma/sql/dry-runs/`, a replay test, a runbook section; run
  the dry run in production through the SQL editor; apply only on Ricardo's explicit yes for
  that phase; verify with a separate read-only query.
- **After every merge that changes behaviour:** verify in production in the browser pane
  with Ricardo's test account (sign-in by email link works; see the handover). Say plainly
  what was and was not seen.
- **Report back to the Flowmap** after each merge (ArtifactData on the artifact URL above):
  collection `findings` (`state: "fixed"`, `pr: <number>`), collection `kanban` (one card per
  work package, `k-s10-NN`, same shape as `k-s9-03`; update the card
  `k-s10` and `k-s8-open`). Writes need `if_version`; at most 50 per batch.
- **Docs in the same PR:** `CLAUDE.md` where behaviour it describes changes, `docs/flows.md`
  for diagrammed flows, `docs/LAUNCH-RUNBOOK.md` for every manual step. Update the handover
  at the end of each working day.
- UI rules that bite: root font-size is 14 px, so use `min-h-[44px]`, not `min-h-11`; MD3
  token classes only; both `messages/es.json` and `messages/en.json`; client components get
  translations as props; an ICU `{placeholder}` rendered client-side needs `t.raw()`.

## Order

WP0 → WP1 (the score; biggest, everything about results depends on it) → WP2 → WP3 → WP4 →
WP5 → WP7 → WP8 → WP6 (copy last, after names settle). WP0, WP2, WP7 can run in parallel
with WP1 because they touch different files.

---

## WP0 — Housekeeping (S, no decisions)

Answers that match what is already built: delete the marker, change nothing else.
`TODO(B8)` `app/actions/sessions.ts`; `TODO(Kim-D1)` same file; `TODO(E3-Kim)`
`lib/accountDeletion/{deleteAccount,manifest,plan}.ts`; `TODO(E4-Kim)` `manifest.ts`;
`TODO(D4)` `lib/analytics/{cupperPrivacy,scope}.ts`; `TODO(C4)` `lib/joinRules.ts`;
`TODO(C6)` `lib/sessionEdit.ts`; `TODO(S8-05/C7)` `lib/sessionState.ts`. Keep `TODO(E5)`
(offline creation stays deferred, answer E5) and `TODO(S8-11 step 9, owner decision)`
(group member consent: no answer covers it).

Also fix the doc error found in S10 preparation: `CLAUDE.md` "Community Score" says
`totalNonUniform` excludes defective cups; code and data say a defective cup is in both lists.

## WP1 — The decentralized score (L; migration + SQL phase)

Spec: `docs/product/cata-descentralizada-puntaje.md`. Read all of it. Summary: one formula,
`(4 × defective + 2 × non-uniform) × 5 ÷ max(5, cups)`, in three scopes. **My score:** my
cups, never more than five, so always the flat CVA deduction. **The session's score:** the
included cuppers' pooled cups, flat up to five cups and diluted beyond. **The coffee's
lifetime score** on its profile: every cup of that coffee across the sessions that count.
The first two are frozen at close; only the third moves.

**Decisions to confirm:** the eight under "A confirmar con Ricardo" in §5 of the spec. The
ones under "Ya decididas" are settled.

**Today (verified 2026-11-12):**
- Deductions only from 5 cups, TS and SQL: `lib/scoring.ts` (`penaltiesApply`,
  `calcIndividualBreakdown`, `computeGroupAggregate`, `calcCommunityScore`), SQL PHASE 23.
- At 5 cups the individual score charges 6 for a defective cup and the stored session score
  charges 8 (the cup is in both arrays: 10/total + 30/total). Tests miss it because their
  fixtures flag "defective" without "non-uniform".
- `cupsPerSample` is one session-level value (1–5). Cup arrays are not `cupsPerSample` long
  in most rows, so the trigger cannot read a cupper's cup count from them.
- Defect type is `defecto_tipo`, a list per evaluation (also `Evaluation.defectTypes`), not
  per cup; it does not gate anything. `SENSORY_DEFECTS` already holds exactly potato, moldy,
  phenolic, but the labels shown are English uppercase.
- The cup section is hidden below 2 cups (`AffectiveForm.tsx`, `CombinedForm.tsx`), so with
  1 cup a defect cannot be marked at all.
- Both forms show a live "Puntaje Calculado" while cupping.
- The coffee profile averages what each session stored (`lib/coffees/filterCoffeeSamples.ts`,
  `loadCoffeeAggregateSamples`); quick impressions are not separated; no defect tally exists.
- `lib/reports/fichaTecnica.ts` re-implements the 10/30 formula.

**Build, in this order (each step its own commit; steps 1–2 can be one PR, 3–5 a second, 6–7
a third):**
1. **Read-only impact list first.** A script or SQL (dry, writes nothing) listing every
   sample with a flagged cup: session, cups, today's stored session score, the score under
   the new rule, and the same for each individual score. 47 samples are expected. Give the
   list to Ricardo so he can confirm spec §5.1 (recommended: nothing stored is recomputed;
   the new rule applies to what is submitted after the deploy).
2. **Pure rule in TypeScript.** One function for the deduction (flat up to five cups,
   diluted beyond), used by the individual breakdown, the session aggregate and the coffee
   aggregate. Remove `MIN_CUPS_FOR_PENALTIES`/`penaltiesApply` as a gate. Table-driven tests
   from the spec's "Comprobaciones", including: a defective cup that is also non-uniform at
   5 cups (= 6, on every side); two defective cups of two (= 12); one cup, defective (= 4);
   and a property test that no flagged cup ever costs more than 6.
3. **Per-cup defect type and cups on the evaluation.** Type per cup in the module JSON (the
   JSON shape is intentionally flexible), validated server-side in `computeEvaluationDerived`:
   a new defective cup without a type does not count. Keep `Evaluation.defectTypes` as the
   distinct set. New `Evaluation` column for the number of cups that evaluation covers
   (migration; backfill from the session's `cupsPerSample`). Forms: the cup grid appears with
   1 cup too (defect only, with the line "Con una taza no se evalúa uniformidad"); marking a
   cup defective asks for its type; Spanish labels mohoso / fenólico / papa.
4. **SQL phase (PHASE 26):** new `recompute_aggregate_score()` with the rule of spec §2 (flat up to five pooled cups, diluted beyond),
   reading cups from the new column; port it in `tests/scoringConsistency.test.ts` in the
   same commit and extend `tests/db/aggregate.dbtest.ts` (trigger must equal TypeScript on
   every case, including the tie cases). Dry run in production, then Ricardo's yes.
   Deploy order matters: document it in the runbook (S8 lesson: page and trigger must not
   disagree in between).
5. **What the cupper sees (answer "no total while cupping").** Remove the live total from the
   two forms. At submit and in results show the breakdown through the existing
   `ScoreBreakdownPanel`: "82,25 − 4 (1 taza fenólica) − 2 (no uniforme) = 76,25". Where a
   session's group score was diluted, one line says why: "Entre todos se cataron 8 tazas: el
   descuento del grupo se reparte". New hint copy (answer A2, which now matches the rule):
   "Tus tazas se suman a las del grupo. Cada taza defectuosa que marques te resta 4 puntos",
   replacing "Con menos de 5 tazas no se descuentan…" (`messages/*.json`, and the hardcoded
   `notScored` in the two forms).
6. **Coffee lifetime score and defect tally (answers A3, D6).** A pure function over the
   coffee's counted evaluations (spec §3 and §5 items 2, 4 and 5); computed at read time, not
   stored, never read or written by the session trigger. Coffee profile and
   `/api/coffees/[id]/ficha`: the lifetime score, "X tazas defectuosas de N catadas (%)" by
   type, and how many different people found it; "indicativo" under 5 pooled cups. Keep the
   blind-leak gates (`filterCoffeeSamples`: closed + revealed, excluded cuppers out, session
   names only for sessions the viewer owns or joined). Quick impressions: tag kept, their
   quality ratings out of the coffee's B, their cups in the tally and the deduction.
7. **Everything downstream reads the one rule:** `fichaTecnica.ts` (delete its copy of the
   formula), `participantSummary.ts`, `resultsCsv.ts`, `cvaFormData.ts`, close email, history
   (`coffeeHistory.ts`, `historyRules.ts`), analytics queries, `RANKING_POLICY`
   ("indicativo" by pooled cups). Rename to "Puntaje Café Sensible (base CVA)" (spec §5.8;
   CSV header too, noted in the PR because it changes a file format).
8. **Stored data: by default nothing.** Ricardo decided that no past score changes. Stored
   individual and session scores of closed sessions stay as they are; do not re-fire
   aggregates in bulk and do not resync history. Only if he says otherwise after seeing the
   list from step 1. Note in the runbook that scores stored before the deploy were computed
   under older rules.

Closes: F-grupal-1 (reopened), `TODO(A1)`, `TODO(A2)`, `TODO(A3)`, K-cafes-1.

## WP2 — Creating a session (M; two columns)

**Decisions to confirm:** (a) X6: warn above 6 samples, and above 4 for combined
(recommended; a warning, never a hard cap); (b) A9 scope: roast date and a free
"preparación" note per sample, plus "catado fuera de protocolo" as a tick with a note
(recommended: all optional, shown collapsed).

- **A2:** default cups 2 for affective and combined in the wizard (today 5,
  `NewSessionForm.tsx`); express stays 1.
- **A4 (F-crear-sesion-10):** letters stay, but assigned at random, not in the owner's
  creation order. The owner's view keeps a stable mapping; participants only ever see the
  letter. Applies to the wizard, the edit form's "Añadir muestra" (`lib/sessionEdit.ts`) and
  duplication. Three-digit codes are out of scope (answer: "later").
- **X6:** the warning.
- **C8:** the owner chooses when the linked group is emailed: at creation or at start, with
  today's rule as the default (async at creation, live at start). `lib/groupNotify.ts`,
  `CuppingSession.notifyGroupAtStart` already exists.
- **A9:** roast date (the coffee already has roast level), preparation note,
  out-of-protocol note. Per sample; migration.
- **B1:** reference mode per session: "ancla" (today's pinned reference, a Café Sensible
  exercise, say so in the helper text) or "referencia libre" (everyone scores it freely;
  compared with the group average). Off by default as today. Migration (one column). The pin
  (`pinReferenceAffective`, `isPinnedModule`) applies only in anchor mode. Fix the wizard
  helper that says the reference "se puntúa como cualquier otra", which is false for an
  anchor.

## WP3 — The cupping form (M)

**Decision to confirm:** A10 bands: recommended, colour by nothing but keep the number; show
only the two anchors (79 and 100) as reference text. (C4 and X4 are already decided, see the
top of this file.)

- **X3:** an evaluation of a sample cannot be written after that sample is revealed, and
  `revealSample` on an open session warns the owner that it freezes cupping for it. Today no
  write path checks `revealed`.
- **A5:** optional, discreet timer (crust at 4 min, first pass around 8–10 min, two more
  passes); and a second value per affective attribute "as it cooled" with the final one
  chosen, the first kept (JSON keys; scoring uses the final).
- **C4:** "no evaluado" per section for a latecomer: no total for that cupper, left out of
  the session's average of totals, rated sections still feed the per-attribute averages,
  labelled "parcial". `isAffectiveComplete` (`lib/scoring.ts`) and its SQL twin
  `is_affective_complete` decide today who has a total: check both.
- **X4: no change.** Acidity and sweetness keep their fixed option pickers (decided:
  as little free text as possible). Record it in `CLAUDE.md` as a deliberate departure from
  CVA 2024 so nobody "fixes" it later.
- **A10:** bands (`scoreBand`, `scoreToCategory`, `ScorePill`, PDFs) after the decision
  above; optional
  "market" note per evaluation with "mi preferencia" as default (JSON key). Do NOT rename
  attributes to "official Spanish" wording: blocked until the official form is available.

## WP4 — Closing a session (M; one SQL phase)

**Decision to confirm:** C9: today the owner can re-date a session whose closing date has
passed but which the cron has not closed yet, which is a reopen; recommended: block it with
`isSessionExpired`. (Late contributions are already decided: allowed, owner only, complete
drafts only, stamped, shown with the "Resultados actualizados el…" banner. It becomes a
sanctioned post-close write: update `docs/flows.md` §1 and the allowlist in
`tests/useServerExports.test.ts`. The cupper's own stored score for that evaluation is
written once, at acceptance; it does not change a score that already existed.)

- **C1:** a warning to cuppers a few minutes before a live close (the owner's close dialog
  already counts unsent cuppers; async already has the 24 h mail); unsent complete drafts are
  kept aside at close and the owner can accept each one (`TODO(S8-05/C1-d)` in
  `lib/closeRules.ts`, `TODO(C1)` in `UnsyncedNotesPanel.tsx`: "send to owner").
- **C2:** a text note can be added to one's evaluation after close (another sanctioned
  write; text only, never a rating).
- **C3:** live sessions: reminder at 24 h (today 12 h, `LIVE_IDLE_MS`) and automatic close at
  7 days through the existing cron and `closeSessionInternal`. Only after C1 works.
- **C5:** group results visible only at close (today: when everyone has submitted). TypeScript
  (`canViewGroupResults`, `lib/sessionState.ts`) AND its SQL twin `can_view_group_results`
  (new SQL phase, dry run, Ricardo's yes), the participant-summary route and the results
  banner. This is also the rule for every comparison and teaching view: nothing about the
  group is shown before close.
- **C9:** after the decision above.

## WP5 — Results, reports, privacy (M)

**Decisions to confirm:** (a) D3 "hasta 6": recommended, "indicativo" for 3 to 5 cuppers,
firm from 6; (b) D2: is "calibración distinta" removed as an exclusion reason (the answer
says "scored differently" must never be a reason)? Recommended: remove it for new
exclusions, keep reading old rows.

- **B2 (`TODO(B2-b)`):** re-pinning a reference never destroys a cupper's ratings: stash the
  previous values inside the module JSON, warn, allow undo.
- **B3:** personal drill-down: descriptive intensities and descriptors against the group
  average; affective shows own score and the group's spread, with no "error" wording; Δ
  against a reference only in anchor mode (needs WP2's B1).
- **B4 is parked, not built** (decided: teaching and comparisons only at close; no teacher's
  guide during a session, no session type column). Record it on the board as parked by the
  owner. B3 above is shown only on a closed session.
- **B6:** a repeated sample in one session (same coffee, different letter): show each cupper
  the difference between their two evaluations, tolerance 2 points total and 2 on
  intensities. No consistency score.
- **D2 (`TODO(Kim-D2)`):** reasons: wrong sample, protocol not followed, incomplete cupping,
  health, test or duplicate, other (free text). A private, kind notice to the excluded
  cupper. The ≥2 SD "posible atípico" wording must not suggest that scoring differently is
  an error.
- **D3 (`TODO(Kim-D3)`):** after (a); tie = "sin diferencia clara" when the gap is under
  1 point or under half the panel's SD, whichever is larger (today only the SD half).
- **D5 (`TODO(Kim-D5)`):** results CSV with names AND a code column for the owner; a
  "sin nombres" download in the UI.
- **D7 (`TODO(D7)`, F-grupos-10):** every member sees names; nobody but the group's owner
  sees an email, not even masked (today email-only invitees show masked to members).
- **F-cafes-9:** editing a coffee's origin data shows in past sessions with an "editado"
  note (answer D1 confirms the current behaviour): add the note where it is missing (check
  the CVA PDF and the coffee ficha) and close the finding.

## WP6 — Copy (S; last)

- "alineación", never "calibración", in `messages/*.json`, `components/landing/*` and docs
  shown to users (12 lines per language today).
- The anchor reference gets a name that does not read as CVA (answer B1 and the first
  doubt); the score name from WP1.
- F3: optional first-person line for the warm-up; no claim about "awakening the senses".

## WP7 — Movimiento Sensorial (M)

**Decision to confirm:** F2 storage: recommended, an account table readable only by its
owner (RLS: no API access; Prisma only), added to `mergeGuestData`, `deleteAccount` and
`lib/accountDeletion/manifest.ts` (the manifest test fails if you forget).

- **F2:** keep the two reflections, private, re-readable from the warm-up library (S8-13
  removed saving; this reverses it on purpose).
- **F4 / B7:** a short version, 1–2 minutes, also offered in "Catar ahora" (the fixed
  arrive + closing is 70 s today, so it needs its own timeline; `lib/warmup/timeline.ts` is
  the only clock).
- **F1:** after the cupping has started, a discreet optional entry to the warm-up; never the
  interstitial.
- **F5:** seated and small-space substitutions as alternative steps.

## WP8 — Guests (M)

- **E1 (F-guest-4, `TODO(E1-Kim)`):** on a shared device the join page asks "¿Eres <nombre>?
  / No soy <nombre>" when an anonymous session already exists, so a second guest starts
  clean. `app/[locale]/join/[token]/page.tsx`, `SignOutButton.tsx`.
- **E2 is parked, not built:** an optional email at join needs a consent notice, and the
  legal pages are unpublished drafts (`LEGAL_PAGES_PUBLISHED = false`). Record it on the
  board as waiting on Ricardo's legal text, next to F-landing-1.

## Explicitly not in scope

- Three-digit blind codes (A4 "later"), queued offline session creation (E5), group member
  consent (S8-11 step 9), official Spanish CVA wording (blocked on the form), the optional
  email at join (E2), the teacher's guide and session types (B4), free-word acidity and
  sweetness (X4).
- The database cleanup (`docs/prompts/S9-database-cleanup.md`) is its own session.
- Ricardo's items: legal text, `ANALYTICS_SUPER_ADMIN_EMAIL` and `UNSUBSCRIBE_SECRET` in
  Vercel, device checks, making old migrations replayable.

## Done means

- Every item above is merged and deployed, or recorded on the board as parked with the
  reason and who it waits on.
- The Flowmap shows F-grupal-1, F-crear-sesion-10, F-guest-4, F-grupos-10 and F-cafes-9 as
  fixed with their PRs, and only F-landing-1 and F-insights-5 open.
- `grep -rn "TODO(" app lib components hooks` shows no Kim marker other than
  `TODO(kim-validar:…)`, `TODO(E5)` and the S8-11 consent one.
- `CLAUDE.md`'s scoring sections describe the rule (flat CVA deductions, diluted beyond five
  pooled cups) and the three scopes, and no document still says "no deductions under five
  cups" or describes a deduction above 6 points per cup.
- A final section in the handover says what was verified in production and what was not.
