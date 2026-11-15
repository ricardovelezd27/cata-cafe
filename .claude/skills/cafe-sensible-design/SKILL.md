---
name: cafe-sensible-design
description: Design, review or audit any screen of Café Sensible (the landing page and the app). Use before writing or changing UI in this repository, when auditing the app's UI/UX, and whenever the owner gives design feedback that should become a rule. It tells you what to read, the rules that are easiest to break, how to check a screen on phone, tablet and desktop, and where a new rule must be written down.
---

# Café Sensible design

This skill holds no rules of its own. The rules live in two documents, and this file tells
you how to use them and how to keep them true. If a rule is written here and not there, it
is not a rule yet: move it.

## Read first, in this order

1. `DESIGN.md` (repository root). It governs the product. Start with "How this document
   governs", then the eight principles, then "Two modes: stage and paper".
2. `PRODUCT.md`: who uses the product and what must never be done to them.
3. `docs/design-system/AUDIT-RUBRIC.md`: the checklist (dimensions A to K), the screens,
   how a finding is rated and written.
4. For work on the landing: `components/landing/journey/README.md` (the dots).
5. For an audit of the app: `docs/prompts/S11-app-ui-ux-audit.md`.

Use the `impeccable` skill for the craft itself (critique, layout, distill, clarify). This
skill is what is specific to this product.

## The rules most often broken

Each is one line here and a full section in `DESIGN.md`. Read the section before acting.

| Rule | Where in `DESIGN.md` |
|---|---|
| A score is a number only: no colour or name by how good it is | No quality bands |
| Nothing moves during a cupping that is not an answer to a touch; no dots behind a form | Design Principles; Where the dots may appear |
| Every section opens the same way: one heading component, centred at every width | How a section opens |
| White space has a ceiling: fixed gaps per device class, never set per section | Density: White space has a ceiling |
| Progress runs the way the person moves: a vertical scroll gets a vertical indicator and a "more below" cue | Density: Progress follows the direction of travel |
| The top of a screen has a word budget: title up to 7 words, up to 25 more, features as icon plus three words | Density: A first screen has a word budget |
| An ask appears once: one form per ask, other places link to it, a second ask is quieter | Density: An ask appears once |
| One way to do a thing: one card anatomy per kind, one gesture per device, one dialog | What carries over unchanged |
| Tokens only: no hex, no pixel radius, no legacy colour alias in new code | How this document governs; Color Palette |
| The root font size is 14 px: a rem is 87.5 %, so write touch targets in px | Typography; Accessibility |

## How to look at a screen

- Three widths before anything ships: 375 (phone), 768 (tablet), 1440 (desktop), in Spanish
  and in English. The rubric's audit adds 390 x 844.
- Measure, do not estimate: computed sizes, real gaps in px, word counts, contrast ratios.
  "Feels loose" is not a finding; "182 px between the end of one section and the next
  heading" is.
- The local server uses the production database. Look and read; do not create, edit or
  delete anything, and do not type a real address into a form.
- The browser pane throttles animation frames and freezes transitions when it is not in
  view: a frame rate or an animation cannot be judged there. Make the decision a pure
  function and test it.

## How the owner judges design

- He wants the page calmer, clearer and less wordy. "Make it clear" means the words, not
  the styling.
- One rule everywhere. He does not want per-section options or to be asked to choose
  between variants; decide, apply it to every place, and say what you decided.
- On phones he wants control over speed: never shorten a scroll-driven step to save length.
- He is sceptical of output that looks uniform. Say what you verified, how, and what you
  did not.

## When feedback becomes a rule

When the owner asks for a change that is really a principle ("these behaviours should go
throughout the whole app"):

1. Fix the place he pointed at.
2. Write the rule in `DESIGN.md`, in the section it belongs to, with the date, the number
   it sets and the reason (what was tried and rejected counts as a reason).
3. Add the check to `docs/design-system/AUDIT-RUBRIC.md` under its dimension, worded so it
   can be answered with a measurement for any screen of the app.
4. If a test can hold it (a token, a spacing class, a word count), add the test.
5. Update the "Rules most often broken" table above only if the new rule belongs there.

All in the same pull request as the fix.

## Tools that go with this

- The Flowmap artifact ("Café Sensible Flowmap") holds the flows of the app and, once
  `docs/prompts/S12-flowmap-uiux-tab.md` has been run, a UI/UX view where each screen is
  scored against the rubric and linked to its flows. Audit results go there.
