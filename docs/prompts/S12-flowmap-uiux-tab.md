# S12 · Flowmap: the UI/UX analyzer tab

> Written 2026-11-15. Owner: Ricardo.
> Run this in a NEW session opened in the Flowmap folder (`C:\projects\flowmap`), not in this repository.
> It could not be started automatically on 2026-11-15: the app does not trust that folder yet. Open the folder once from "New session", then paste everything under "Prompt" below.

## Why

Ricardo, 2026-11-15: "the artifact that we have used to understand the flows is also useful to understand the UI UX and how each of the screens of the app look like ... right now we have the flows and a Kanban. I would like a third piece to be the UI UX analyzer ... a third tab ... it should be connected to the flows."

The Flowmap is the artifact "Café Sensible Flowmap" (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9): a blueprint board of the app's flows plus a Kanban. The coming audit of the whole app (`docs/prompts/S11-app-ui-ux-audit.md`, rubric in `docs/design-system/AUDIT-RUBRIC.md`) needs a home for its results; this tab is that home.

## Prompt

### Background

Ricardo (owner of Café Sensible / Cata Café, a coffee cupping app, repository `C:\projects\cata-cafe`) uses the Flowmap (this repository, `C:\projects\flowmap`) to understand the app. He asked for a third view, next to the flows board and the Kanban: a "UI/UX" analyzer, connected to the flows. He does not want to approve each change; he will look at the result.

The design system the app is audited against is `C:\projects\cata-cafe\DESIGN.md`. The audit checklist is `C:\projects\cata-cafe\docs\design-system\AUDIT-RUBRIC.md`. Read it first: section 2 = viewports (375x667, 390x844, 768x1024, 1440x900), languages, roles, states; section 3 = levels P0 to P3 and a 0 to 4 score per dimension; section 4 = the form of a finding; section 5 = the checklist, dimensions A to K; section 6 = the list of screens by area and route; section 8 = what the audit delivers (a report at `docs/audits/app-ui-ux-<date>/REPORT.md`). Do not edit anything in `C:\projects\cata-cafe`; re-read those files instead of copying their text into code, because they change.

Facts about the Flowmap repository that are easy to get wrong:

- Structure: `app/index.html` (single-file UI), `app/core.js` (pure UMD logic), `app/kanban.js` (`window.FlowmapKanban.mount(root, host)`), `boards/src/<id>.flows.mjs` built by `node scripts/build-board.mjs` into `boards/<id>.json`; `boards/_schema.md` is normative; `WALKTHROUGH.md` is the guided tour and must stay current when panels change. Never hand-edit `boards/cata-cafe.json`.
- There is already an audit layer for flow findings: side collections `findings/<F-id>` and specs in `prompts/<id>`, an Audit panel and a Specs panel, and `scripts/import-audit.mjs`. Reuse its patterns (side collections, `askText()` instead of `window.prompt`, which is inert in the artifact viewer).
- `.claude/CLAUDE.md` of that repository forbids committing without an explicit request, and all work since v2 is uncommitted in the working tree on purpose. Work in the folder as it is: do not commit, do not stash, do not reset, do not create a worktree.
- Local preview: `node scripts/dev-server.cjs` (port 8787, serves `app/` and `boards/`); the page renders read-only without `window.claude`.
- Publishing: the artifact has the capabilities db, room, downloads, user; omit `capabilities` on a republish to keep them. The Artifact tool refuses a republish until the live source has been read in full (about 2,000 lines; read it in chunks). Publish to the SAME url. The live database holds Ricardo's own edits (statuses, priorities, dragged positions): never reset or overwrite existing collections; only ADD new documents in new collections. ArtifactData limits: at most 50 writes per batch, file payloads up to 256 KB, and a batch aborts on one version mismatch.

### Task

Add a third view to the Flowmap, next to the flows board and the Kanban: a "UI/UX" analyzer, connected to the flows.

1. A third top-level view (the same switch that moves between the board and the Kanban), named "UI/UX".
2. It lists every SCREEN of the app, grouped by area, from section 6 of the rubric (route, area, the states worth looking at). Add the landing page as one screen marked "reference" (it is the model the rest is measured against, not a subject).
3. Each screen is connected to the flows: show which lanes and which items of the board pass through it (match on the route and code references the items already carry), let the user jump from a screen to those items on the board, and from an item or lane on the board to its screen in the UI/UX view. A lane shows a small marker with its screens' UI/UX state, the way lanes already show the audit badge.
4. For each screen the user can evaluate how good the UI/UX is, using the rubric as written: a score from 0 to 4 for each dimension A to K (with the dimension's questions readable in place), and findings in the rubric's form (id by dimension letter, viewport and language, rule, what, evidence, level P0 to P3, fix, size S/M/L, status). Show a roll-up per screen and per area (scores, open findings by level) and filters by level, dimension, viewport and status.
5. "How each screen looks": each screen has a slot per viewport (phone, tablet, desktop) and language for a screenshot, with a caption and the date. Choose a storage that really works in the published artifact (load the `artifact-capabilities` skill and check what this account offers before deciding; if stored images are not possible, say so plainly and use the best working alternative, such as a link field plus a local-file preview), and state the limit in the UI.
6. Findings can be sent to the existing Specs / prompt builder the same way flow findings are ("Add to spec"), so a UI/UX finding can become part of a development prompt, and to Kanban cards if the Kanban already takes findings.
7. An importer script next to `scripts/import-audit.mjs` (for example `scripts/import-ux-audit.mjs`) that reads a report in the rubric's format (a score per dimension and the findings table of rubric section 4) and writes the new collections, so the audit session can load its results in one step. The report does not exist yet: build the importer against the format the rubric defines, with a small sample file of your own as a test fixture, and say it has not met a real report.
8. Data: new side collections only (for example `uxScreens/<id>`, `uxFindings/<id>`, plus one meta document). Document them in `boards/_schema.md`. Seed the screens list with no scores and no findings: nobody has audited yet, and the tab must not show invented results.
9. Keep `WALKTHROUGH.md` and the README current: where the new view is, what it records, how it connects to the flows, how to import a report.

### How to work

- Read `README.md`, `WALKTHROUGH.md`, `boards/_schema.md` and the audit-layer code in `app/index.html` and `app/core.js` first, and follow their patterns and visual language. Put pure logic in `app/core.js` and cover it the way the repository already checks things; keep the UI in the existing single file unless a separate file for this view fits better, as `app/kanban.js` does for the Kanban.
- Verify in the local preview at phone and desktop widths: the view opens, the screens list, jumping screen to board and board to screen works, a score and a finding can be added, edited and removed, the roll-ups and filters are right, the importer loads your fixture, and the board and the Kanban still work exactly as before. Check the browser console for errors.
- Then publish to the same artifact url and seed the new collections there (add only). After publishing, list the new collections again and confirm they match what you built.
- Do not commit, stash or reset anything in that repository. Do not edit `C:\projects\cata-cafe`. Do not delete or overwrite any existing document in the artifact's database.

### Done

The published artifact has a working UI/UX view with every screen of the rubric listed, linked both ways with the flows, ready to receive scores, findings and screenshots; the importer exists; the documents are current; nothing is committed. End with a short plain report: what was built, what was verified and how, what could not be verified, and anything Ricardo must decide (for example where screenshots are stored).
