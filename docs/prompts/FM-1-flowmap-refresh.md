# FM-1: make the Flowmap paint the current app, and make it easy to use

First job after the weekly reset (2026-11-21). Owner's words (2026-11-19): "I do not think the
artifact is updated and also has gotten complex. I need like a walkthrough and a help menu or
something to help me use the app. Not sure that the artifact paints the current picture of the app,
and the scores, not sure if it is updated."

Artifact: https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9 ("Café Sensible Flowmap").
Source: `C:/projects/flowmap` (board source `boards/src/cata-cafe.flows.mjs` and
`boards/src/cata-cafe.ux.mjs`, page code, `scripts/`). Gotchas for building, validating and
republishing, and for ArtifactData batches: memory `flowmap-and-kim-2026-10-15.md` (≤ 50 writes per
batch, pin every write with `if_version`, omit `capabilities` on republish, re-list after a run).

## State found on 2026-11-19 (checked)

- `uxScores`: every document still carries the audit's scores (`by: "audit"`, updated 2026-11-16),
  before any of the 66 merged UI/UX pull requests. They do not describe production.
- `uxFindings`: CURRENT. 75 of 93 `fixed` with their `pr`; the 18 open ones have `fixNote` and
  `nextPackage`. Check whether the page shows those two fields; if not, show them.
- `findings`: the flows audit (F-xx-n) plus the rollout's non-UX items `F-R-01..09` (open).
- The flow lanes (the board's items and edges) describe the screens BEFORE the rollout.
- `uxShots`: the audit's 275 pictures, all from before the rollout.

## The package, in order (three pull requests in the flowmap repo, or one per part)

1. **Scores that describe production.** Re-score every screen of `uxScores` against
   `docs/design-system/AUDIT-RUBRIC.md` on the CURRENT app, read-only (the capture tool
   `scripts/ux-capture` in cata-cafe, production database look-only, test accounts only, names
   replaced). Write the new scores with `by: "rescore-2026-11"` and a date, and KEEP the audit's as
   the "before" (for example `before` beside `scores`), so the page can show before → now per
   dimension and the overall (the audit's was 20 / 40). Replace the screenshots with current ones the
   same way, keeping the old as "before".
2. **Lanes that match production.** Redraw the lanes of the flows that changed (the table "What
   changed, by flow" in `docs/handover/UX-ROLLOUT-HANDOVER.md`): sign-in / join / claim on the stage,
   the waiting room, the cupping screen (ways out, place in the address, the language switch), the
   results (overview, coffee cards, the sheet, learnings, the organizer's Panel, export), dashboard,
   wizard. Verify each changed step against the code, as the 2026-10-29 verification did. Keep
   `docs/flows.md` in sync.
3. **Simpler to use.**
   - A **"Start here" view** as the default: one screen saying what the Flowmap is, the
     current numbers (UI/UX closed / open, non-UX open, score before → now), and three buttons:
     "Walk a flow", "See what is open", "See what changed".
   - A **guided walkthrough** (first visit, and from a "?" button): 5 to 7 steps pointing at the
     real controls (lanes, a step's card, the findings overlay, the open list, the prompt panel),
     each one or two plain sentences, skippable, never shown again once finished (remember per
     viewer).
   - A **help menu** ("?" in the header): what each panel and colour means, what "fixed / open /
     nextPackage" means, how to add a note during his manual test, how to export.
   - **Fewer things at once:** hide the advanced panels (prompt builder, kanban, audit import)
     behind "More"; one clear filter for "open only".
   - Spanish first, English second, like the app; the app's design system (`DESIGN.md`) for the
     page's look.
4. **His manual test:** a simple way to record a problem while walking a flow (a note on a step:
   screen, phone or desktop, what he expected), stored in the artifact's database, so the governing
   session can turn each into a correction or a new `findings/F-R-*` item.

## Done means

- Every score on the page has a "now" measured on production after 2026-11-21, and the old one as
  "before".
- Every changed flow's lane matches production, checked step by step against the code.
- A first-time visitor understands the page from the "Start here" view and the walkthrough without
  being told anything.
- Ricardo can record his manual-test notes on the page.
