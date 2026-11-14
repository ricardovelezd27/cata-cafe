# S11 — UI/UX audit of the app against the design system

> Prompt for a fresh session. Written 2026-11-14. Owner: Ricardo.
> Read `CLAUDE.md`, then `PRODUCT.md`, then `DESIGN.md` in full, then
> `docs/design-system/AUDIT-RUBRIC.md`, before looking at a single screen.

## Goal

Tell Ricardo, with evidence, where the app inside (everything past the landing page) departs
from the design system in `DESIGN.md`, how much each departure matters, and in what order to
fix it. When you finish he has a report he can read in ten minutes, a findings table he can
sort, and a plan in work packages he can approve one at a time.

The landing page was rebuilt in November 2026 and the system was written from what that
work taught. The app was built before most of those rules existed. Expect to find a lot;
the point is to size it and order it, not to be alarmed by it.

## What you produce

Exactly the five things listed in section 8 of the rubric. No code changes and no data
changes in this session: the audit ends in documents.

## Constraints you must not work around

- **The local environment is the production database.** Look and read. Do not create, edit
  or delete anything, do not submit a form with a real address, and agree with Ricardo
  first on any account or session you use to reach a state. A state you cannot reach safely
  is audited from the code and marked "from code, not seen".
- **Product rules are inputs, not subjects.** Scoring, the session lifecycle, blind data,
  what is shown when: all fixed (`PRODUCT.md`, `CLAUDE.md`). A screen that breaks one is a
  P0 finding; the rule is not reviewed here.
- **Evidence for every finding**: a file and line, a measured value, or a screenshot. Follow
  the form in section 4 of the rubric.
- **The landing page is the reference, not a subject.** Do not audit `components/landing/**`.
- **Do not start fixing.** If a fix is one line, it is still a row in the table.

## How to work

1. Start with the cheap, countable checks of rubric section 7 ("Known drift"): confirm each
   number with a search, so the report opens with facts.
2. Then go screen by screen in the order of rubric section 6, at the four viewports and in
   both languages, answering the checklist of section 5. The dev server and the browser
   pane are the way to look; `read_page` and computed styles are better evidence than
   screenshots for sizes and contrast.
3. Use `/impeccable audit` for the measurable dimensions (accessibility, performance,
   responsive, theming, anti-patterns) and `/impeccable critique` for hierarchy, cognitive
   load and words. Their output is input to the findings table, not the report itself.
4. Per the orchestration policy in `CLAUDE.md`, delegate self-contained sweeps (counting a
   class across files, listing every heading size, checking every button variant) to
   cheaper agents, and keep the judgement (what is a finding, how much it matters, the
   order of the plan) for yourself. Give each agent the rubric section it works from.
5. Group findings by cause. Four hundred uses of an old colour name are one finding with a
   count, not four hundred rows.
6. Keep section K (where the stage could come into the app) apart from the findings: those
   are proposals, with a cost, for Ricardo to choose from.

## Questions to put to Ricardo, not to answer yourself

- Whether a 1 to 9 rating tinted by its value (`AffectiveBubbles`) falls under "a score is a
  number only".
- Which type scale is the real one, given the 14 px root: the pixel sizes the document
  lists, or the sizes the classes paint today.
- Which screens of arrival get the stage first (sign-in, the waiting room, empty states).
- Anything that touches copy he or Kim wrote.

Ask with `AskUserQuestion` when a question blocks the work; otherwise collect them in the
report's decisions list.

## Done looks like

- `docs/audits/app-ui-ux-<date>/REPORT.md` exists, with a score per dimension, the findings
  table and the plan.
- Every P0 and P1 has evidence a second person could check.
- `DESIGN.md` is corrected where the audit proved it wrong, in the same pull request.
- Nothing in the app's code or data has changed.
