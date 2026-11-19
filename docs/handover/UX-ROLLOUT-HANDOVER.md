# UI/UX rollout: handover (2026-11-19, for Saturday 2026-11-21)

The app was brought to its design system (`DESIGN.md`), package by package, from the 2026-11-15 audit
(`docs/audits/app-ui-ux-2026-11-15/`: `REPORT.md`, `PLAN.md`, `DECISIONS.md`, `RESULTS-DESIGN.md`).
Production is `main` at `be8be6e`, deployed and fully working.

## 1. Where it stands

| | |
|---|---|
| Pull requests merged | 66 (#154 to #219) |
| UI/UX items closed on the Flowmap | 75 of 93 (88 audit findings + 5 "stage" opportunities) |
| Open | 18: 12 in three packages, 3 polish, 3 decisions or Kim |
| Planned work done | about 88 % |
| Tests on `main` | 271 files, 3,715 tests, all passing |

Where to see it: the Flowmap (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9).
- UI/UX findings: collection `uxFindings`. A closed one has `status: fixed` and the `pr` that closed
  it. Every OPEN one now has `fixNote` (what remains) and `nextPackage` (which package finishes it).
- Improvements that are NOT UI/UX (found during this work): collection `findings`, ids `F-R-01` to
  `F-R-09`, `audit: "ux-rollout-2026-11"`, each tied to its flow lane. See section 4.
- **Not yet done on the Flowmap:** the flow LANES (the step-by-step as-is flows) were not redrawn
  for the new screens. Section 2 lists what changed per flow so you can test against it; redrawing
  the lanes is package FM-1 in section 6.

## 2. What changed, by flow (use this for your manual test)

| Flow | What is new | PRs |
|---|---|---|
| Every page | One text scale (nothing under 11 px), one colour system (no stray hex), one page frame (one margin, one spacing scale, a back link on detail and create pages, one title per page), focus rings, 44 px targets, shared card / notice / heading / button / pill / empty state / confirm dialog | #155-#163, #165, #174, #184-#186, #192, #194, #198-#201, #204, #206, #208, #211, #212, #214-#216, #219 |
| Sign-in, confirm, claim, join | On the dark stage, one card per state (expired, closed, check your email…), numbered onboarding. Sign-in logic unchanged | #202 |
| Dashboard | One ask ("Catar ahora") in the first fold, stat cards 240 px, scores in ink, empty states with drawings | #177, #183, #200, #207, #208, #218, #219 |
| Starting a session | Wizard with numbered sections and a docked action, 640 px form | #189, #199, #211, #215 |
| Waiting room | On the stage, a still "gathering" drawing, nothing bounces (logic unchanged) | #205 |
| Cupping screen | Every way out goes through the save guard; "Resultados" only navigates; layout inside a phone budget (chrome 159 px); one green "next"; selected rating one colour; text sizes; rating bubbles = one keyboard stop; step count and edge arrow; your sample and step kept through reload, back, results-and-back and a language switch (new English/Español switch in the menu); "FINAL" and the scale words removed | #193, #195, #210, #213 |
| Results | Overview tiles, one card per coffee, the coffee's sheet (`?sample=`), the flavour wheel, "Aprendizajes" + reflection, the organizer's "Panel" (`?tab=panel`), export sheet, loading placeholder | #159, #166-#172, #175-#182, #187, #191, #196, #197, #206, #209, #212, #218 |
| Coffees, groups, profile | One score block, coffees table fits at 768, kit everywhere, two confirm dialogs instead of double taps | #188, #201, #204, #216, #219 |
| Insights | Tokens, real tabs, users/access as tables, the explorer keeps your work on a failed request | #190, #201, #204, #209, #216, #218 |
| Words | One name "Café Sensible" + wordmark in the shell, the glossary ("organizador", "puntaje", "calificación" for the 1-9 rating, "Salir" to sign out), sentence case, no em dash | #217 |
| Lists everywhere | Your search, filters, sort and page kept in the address | #209 |

## 3. What is still missing (18 open UI/UX items)

| Package | Findings | What it does | Notes |
|---|---|---|---|
| **P2e + P4b: the cupping screen's notices, cards and words** | D-07, E-05, B-04, C-05, D-08, H-01 (rest), E-04 (rest), I-01, I-03, I-05, A-10 | The cupping screen gets the shared card / notice / heading / button / pill; its 11 terracotta banners become notices (offline and sync notices: frame only); its words follow the glossary and sentence case; its English stops showing Spanish; "Enviar y ver resultados" in an open group session says when results appear | Needs your phone test before merge |
| **P6: a tablet is a small desktop** | F-07, F-12 | An icon rail from 768 px; content arranged by its column, not the window | The shell and page grids |
| **Polish** | F-15, I-04 | The dashboard explainer for returning users, line length, onboarding's emoji | Small |
| **Decisions / Kim** | J-05, K-04, A-02 | J-05: descriptive-session results (waits on Kim). K-04: an optional stage cover for closed results (decision 4). A-02: accepted by your decision 6, mark fixed if you agree | |

## 4. Found along the way, NOT UI/UX (Flowmap `findings/F-R-*`)

| Id | Flow | What | Needs |
|---|---|---|---|
| F-R-01 | Guest | A guest is never told when the group's results are ready (results only at the close, no email) | Your rule |
| F-R-02 | Results | The eight decisions of `docs/product/results-and-session-life-proposal-2026-11.md` (FLOW-1) are unanswered | Your answers |
| F-R-03 | Live group | With the live connection down, the cupper is moved to results without "La sesión se cerró." | A small fix |
| F-R-04 | Coffees | Coffee names are saved with trailing spaces | A small fix (+ your yes for a cleanup) |
| F-R-05 | Reports | Bold prints as regular in every PDF (mislabelled font file) | Your yes to download the font |
| F-R-06 | Sign-in | The sign-in emails still say "Cata Café Sensible" | Your manual paste in Supabase (runbook §15) |
| F-R-07 | Live group | The waiting room was never checked in a real live session | Your live test |
| F-R-08 | Results | Two dates render differently on the server and in the browser | A small fix |
| F-R-09 | Results | An organizer who did not cup sees no line saying why there is nothing of their own | Your choice |

## 5. Choices built with a default, approved by you on 2026-11-19

Panel: a row per cupper; no distance mark with two cuppers; the "Pendiente" tile counts notes too.
Learnings: the repeated-coffee sentence first. Forms left-aligned at 640 px. The landing keeps the
stage's own type scale. Table headers at 0.1em tracking. Wizard field labels stay uppercase 11 px.
"calificación" for the 1-9 rating. FINAL readout and scale words removed from the rating bubbles.

Waits on Kim (not decided by anyone here): descriptive results (J-05), the coffee words of the
glossary, every learnings threshold, the selected bubble's single colour (`TODO(kim-validar:...)`).

## 6. How to resume on Saturday (weekly limit resets 2026-11-21 06:00)

1. In the governing session ("cafe-sensible-design-system"), say "continue". It reads
   `memory/design-system-rollout-2026-11-16.md`, checks usage, restarts the hourly check.
2. Packages, in this order (never two on the same files, at most three at once):
   - **P2e + P4b** (cupping screen) to Worker B (it built the cupping screen's other packages). Ends
     with your phone test.
   - **P6** (tablet) to Worker C, in parallel (shell and page grids; no cupping files).
   - **FM-1: redraw the Flowmap lanes** for the screens that changed (section 2), so the as-is flows
     match production. Source: `C:/projects/flowmap/boards/src/cata-cafe.flows.mjs` → build →
     validate → republish the same artifact URL (see the Flowmap memory for the gotchas).
   - **Small fixes** F-R-03, F-R-04, F-R-08 together; then Polish (F-15, I-04).
   - Your items: F-R-01, F-R-02, F-R-05, F-R-06, F-R-07, F-R-09, A-02, K-04.
3. Your manual test document: list each problem with the screen, phone or desktop, and what you
   expected. The governing session turns each into either a correction for an open package or a new
   `findings/F-R-*` item.

Sessions: Worker A `local_6c2569ee…`, Worker B `local_d60bb5f5…`, Worker C `local_051fc64a…`,
designer `local_af04a357…` (on Opus until Fable resets). Rules for every package: `PLAN.md`'s, plus
the production database is look-only, nothing touches saving or sync, and a cupping-screen change
merges only after your phone test.
