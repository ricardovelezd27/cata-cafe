---
domain: session-setup
researched: 2026-11-06
model: claude-sonnet
flows: [Empezar una cata, Catar ahora (exprés), Crear sesión (asistente completo)]
---

# Session setup: creation flows (wizards, express paths, templates, validation)

## 1. Scope

Covers how a cupping session comes into being: the home-screen entry points, the express path (name, format, sample count, coffee-less samples), the full wizard (catalogue coffees, group step 2 with invite link/QR), "duplicate as template", field-level validation on phones, and recovery after creation (edit, delete, undo). Out of scope: login and guest claim (auth-identity), what happens during the cupping (live-collab, cupping-protocol), results and PDFs (results-reporting), offline queueing (offline-native).

Evidence caveat: the research base is general form and wizard guidance (NN/g, GOV.UK, web.dev, Baymard). Nothing found studies cupping setup specifically, so applying it to a hurried professional at a table is inference. Items marked [secondary] come from summaries of a primary source, not the primary text; items marked [inferred] are the author's reasoning, not sourced.

## 2. Principles

1. **Put the short list first, defer the rest, and stop at two levels.** Show the few options most users need up front; move rare ones to a secondary screen with a clearly labelled, predictable control. Three or more levels usually make users lose their way. Rationale: fewer mistakes for novices, speed for experts; what appears first signals importance. Source: NN/g, Progressive Disclosure (2006).
2. **Choose the step structure from task shape.** Staged disclosure (wizards) suits tasks that split into steps with little interdependence; it fails when steps depend on each other and users bounce back and forth. Rationale: decide wizard vs single form by checking dependencies (e.g. format or cups changing later sample fields). Source: NN/g, Progressive Disclosure (2006). Older Microsoft guidance also calls wizards "relatively heavy" and says to prefer a lighter solution if one exists [secondary: search summary of Microsoft Win32 UX guide, undated].
3. **Default to one thing per page; group only when evidence supports it.** One question (or one small topic) per screen helps focus; group related questions only when user research says users do better, e.g. repeat expert users. Rationale: light first-time path, denser path for experts. Source: GOV.UK Design System, Question pages (fetched 2026); GDS, One thing per page (2015).
4. **Test without a progress indicator first, then add a plain one.** Fix question order and count before adding an indicator; if needed use a simple caption ("Question 3 of 9"), not a clickable all-steps stepper. Rationale: indicators add noise on short flows. Source: GOV.UK, Question pages. South Australia forms guidance notes one-per-page works poorly on long forms without progress [secondary].
5. **Never break Back.** Back returns to the previous screen in the state last seen; entered data survives; a one-time action must not repeat. Rationale: backtracking is how people fix mistakes. Source: GOV.UK, Question pages; NN/g, User Control and Freedom (2000 Alertbox / heuristic page).
6. **Ask for each thing once; reuse answers.** Pre-populate or offer earlier answers instead of re-asking. Source: GOV.UK, Question pages.
7. **Fewer fields beat fewer steps.** Baymard finds field count affects checkout usability more than step count, and unneeded fields make mobile forms feel longer. Rationale: the express path's value is its field budget (3), not its screen count. Source: Baymard, checkout research (2026 listing; figures via search summary [secondary]).
8. **Mark both required and optional explicitly.** When only optional fields were marked, 32% of testers hit a validation error on a missed required field. Source: Baymard, required/optional fields [secondary snippet; verify].
9. **Default only where most users agree; keep defaults visible and changeable.** A static default suits a choice most people make (a ~90% rule of thumb is quoted); never default anything needing thought (consent, opt-ins); say the system chose and make editing easy. Rationale: people skim past pre-filled values, so a wrong default silently becomes data. Source: NN/g, The Power of Defaults, via secondary summaries (not fetched). Treat 90% as a heuristic.
10. **Validate inline, after the field is finished, with the message beside the field.** Check when the user leaves the field, not mid-keystroke; use live feedback only for complex rules; a summary supplements but never replaces field messages; no tooltips; modals sparingly; the message says how to fix it. Rationale: no memory burden while correcting. Source: NN/g, Errors in Forms: Design Guidelines (2019, reviewed Dec 2024).
11. **Keep the submit button enabled.** A disabled primary button leaves people tapping something that looks broken; if you must disable, explain what is missing on tap. Disabling after the first tap (double submit) is fine. Source: web.dev, Sign-in form best practices.
12. **Match the phone keyboard to the field.** `inputmode` picks the keyboard (numeric for PINs and counts; `type="number"` adds spinner arrows, avoid for non-quantities); `enterkeyhint` labels the Enter key (`next`, `done`, `go`); Baseline since 2021. Source: web.dev, Sign-in form best practices; MDN, enterkeyhint.
13. **Touch targets of at least 44 CSS px for primary controls, with a finger-width gap.** web.dev cites W3C 44x44 CSS px, Apple 48 px and Android 7-10 mm; WCAG 2.2 sets 24 px at AA (2.5.8) and 44 px at AAA (2.5.5) [secondary]. Source: web.dev, Sign-in form best practices. The project's 14 px root font makes `min-h-11` paint about 38.5 px, so audit computed sizes.
14. **Dates: allow typing; use a calendar only for near-term picking, never as the only input.** Calendars fit near-future or recent dates, day-of-week context or relative dates; pickers are slow for keyboard and screen-reader users. Source: GOV.UK Design System, Date input (2026, snippet); MoJ pattern note [secondary]. Native `input type=date` behaviour on iOS was not established.
15. **Prefer undo to confirmation for reversible actions; reserve confirmation for the irreversible.** Frequent confirmations train click-through; users must be able to back out. Source: NN/g, User Control and Freedom (primary says users should be able to correct mistakes and backtrack); undo-over-confirm framing from InfoWorld and Ladder [secondary, practitioner; no controlled study found].
16. **A confirmation that remains must restate the consequence and not default to Confirm.** Name what is lost, put initial focus on Cancel for dangerous actions, offer undo after confirming where feasible. Source: Primer ConfirmationDialog accessibility; UX Movement [practitioner].
17. **Repeated identical errors mean redesign.** If the same error recurs three or more times in one attempt, fix the design, not just the copy. Source: NN/g, Errors in Forms (Guideline 10).

[inferred] Templates should carry structure (sample count, labels, format, cups, reference, warm-up) and not people or outcomes (participants, invites, results, status, close date); the copy's name should be distinguishable ("Copia de X" or a date suffix). No source specifies template carry-over; this follows from P6 and from not copying state that belongs to one event.

## 3. Audit checklist

Entry points
1. Does the home/sessions screen offer one primary start action, with any second path visually subordinate and labelled by outcome, not by implementation? (P3, P9)
2. Is the express path completable in three decisions with only the fields it truly needs (name, format, count)? (P7)
3. Does a first-run user land on pre-selected sensible defaults (format, count) instead of blank choices? (P9)
4. Is there one visible, labelled route from express to the full options, with no duplicate buttons to the same screen? (P1)

Structure and navigation
5. Does the wizard order steps so later steps never change earlier choices (format, cups and count before sample fields)? (P2)
6. Do back and forward preserve every entered value (state held above the step component)? (P5)
7. Does browser/system back (and the Android back button in a native shell) step back inside the wizard rather than exit it? (P5)
8. Is the progress cue a simple "step n of N" rather than a clickable stepper? (P4)
9. Is an unfinished wizard persisted as a draft, or at least guarded against accidental exit? (P5)
10. Are previously entered values (last format, last cups) reused as defaults instead of re-asked? (P6, P9)

Fields and validation
11. Are required and optional fields both marked, or is every field required by design? (P8)
12. Are fields not needed to start a cupping (altitude, roast, origin) absent or optional in both paths? (P7)
13. Does validation run on blur or step-advance, with the message adjacent to the field and focus moved to the first invalid field? (P10)
14. Do error messages say what to change (range, allowed values) and exist in es and en? (P10)
15. Is the submit/next button enabled while the form is incomplete (explaining on tap), and disabled only while the request is in flight? (P11)
16. Do numeric inputs use `inputmode="numeric"` (not a spinner `type="number"` where spinners are wrong)? (P12)
17. Do text fields set `enterkeyhint` (`next` mid-form, `done` or `go` last) and sensible `autocomplete`/`autocapitalize`? (P12)
18. Do primary buttons, chips and steppers compute to at least 44 px high and wide, given the 14 px root font? (P13)
19. Can the close date be typed or picked without a scroll-wheel-only picker, and is "empty = manual close" explained? (P14)
20. Are the sample-count bounds (1-20) enforced in both the control and the server with the same message? (P10, P7)

Templates and group
21. Does duplicate copy structure (labels, format, cups, count, reference position, warm-up) and exclude participants, invites, results, status and close date? ([inferred]; P6)
22. Does the duplicate get a distinguishable default name and open for editing before anything reaches participants? ([inferred]; P5)
23. After group creation, are invite link, QR and a copy/share control on one screen with a clear next "start" action? (P3)
24. Is the QR large and high-contrast enough to scan from across a table, with the link as text fallback? ([inferred]; P13)

Recovery
25. Can name, samples and reference be edited after creation until the session starts, with locked fields explained rather than silently absent? (P5, P15)
26. Is deleting a freshly created, empty session one action with undo or a light confirm, and heavier only when results exist? (P15, P16)
27. Does each confirm dialog name the object and consequence and put initial focus on Cancel? (P16)
28. Does a failed create keep the form filled and show a recoverable error? (P5, P10)

## 4. Anti-patterns

- **Wizard for a three-field task.** Heavy structure for a light task; the express path exists because of this (P2, P7).
- **Disabled "Next" with no explanation.** Looks broken on a phone (P11).
- **Resetting state on step unmount.** Back silently wipes samples (P5).
- **Errors only in a top banner or toast.** Far from the field, gone before the fix (P10).
- **Deferral with no later prompt.** Coffee-less samples are valid but leave names and coffee links missing; deferral becomes downstream debt unless later screens prompt completion and make assignment easy ([inferred] from P1, P7; no source quantifies this).
- **Silent smart defaults.** A skimmed pre-filled format or cup count becomes wrong data (P9).
- **Two buttons to the same screen with different labels.** NN/g warns against multiple paths to the same secondary options (P1).
- **Confirm on every delete, focus on Confirm.** Trains click-through (P15, P16).
- **Template that copies the old close date or participants.** The new event inherits stale state ([inferred]).
- **Spinner `type=number` for counts; 38 px chips.** Wrong keyboard, missed taps (P12, P13).

## 5. Native-app considerations

- Wizard back: hardware or gesture back must map to step-back; a WebView that exits on back loses the draft (P5). Capacitor back-button handling is platform behaviour, not researched here.
- Keyboards: `inputmode` and `enterkeyhint` are Baseline in browsers (MDN); verify the Enter-key label in WKWebView and Android WebView on device. The keyboard can cover the action row, so keep the primary action reachable [inferred].
- Touch targets: Apple 44 pt and Material 48 dp are the native bars [secondary; primaries not fetched]; store accessibility checks compare against them.
- Dates: native pickers differ by OS; keep typed entry available (GOV.UK) and test the iOS picker on device, since this research did not establish its behaviour.
- Sharing the invite: a native share sheet and a screen-awake, high-contrast QR suit a table [inferred].
- Drafts: IndexedDB in a WebView can be evicted, so a draft that must survive should not live only there [inferred]; see offline-native.
- Undo: a snackbar undo is Android-idiomatic; iOS users expect alerts for destructive confirms (platform convention, not researched).

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Catar ahora | Express start | Three-tap session creation, coffee-less samples |
| Asistente / Crear sesión | Wizard / full create | Multi-step creation with catalogue coffees |
| Muestra | Sample | One coffee in a session; may be label-only |
| Formato | Format | Descriptive, affective or combined (SCA CVA) |
| Tazas por muestra | Cups per sample | Replicates per sample; affects scoring |
| Plantilla / Duplicar | Template / Duplicate | Copy of structure into a new session |
| Referencia | Reference sample | Control cupped first; display-only context |
| Calentamiento | Warm-up | Optional guided exercise before cupping |
| Grupal en vivo / asíncrona | Live / async group | Host-led vs close-date |
| Enlace de invitación / QR | Invite link / QR | Token link to join a group session |
| Divulgación progresiva | Progressive disclosure | Defer rarely used options |
| Valores por defecto | Defaults | Pre-filled choices |
| Deshacer | Undo | Reverse an action after the fact |

## 7. Open practice questions

1. Is "name" worth requiring at all, or should express auto-name from date and time? (needs usage data; no source)
2. When coffee-less samples are later assigned, what reminder is acceptable without nagging? (no source quantifies deferral debt)
3. How much of a template should be editable at duplicate time versus after? (owner decision)
4. Should an accidental empty session expire or delete without confirmation? (P15 suggests undo; no source on empty-object cleanup)
5. What does the host need on screen at the table (QR size, joined count, start button)? No cupping-host source found; ask Kim.
6. Does the native iOS date picker suit a close-date field for this audience? Not established.
7. Where is the line between "draft of an unfinished wizard" and a created-but-unstarted session? GOV.UK is silent on saving drafts.

## 8. Sources

Newest first ("fetched" = full page read, "snippet" = search result only).

- GOV.UK Design System, Question pages, 2026 (fetched). https://design-system.service.gov.uk/patterns/question-pages
- GOV.UK Design System, Date input, 2026 (snippet). https://design-system.service.gov.uk/components/date-input
- Baymard Institute, Required vs optional form fields, 2026 listing (snippet). https://baymard.com/research-articles/required-optional-form-fields
- GDS blog, How we're making it easier to access government forms online, 2024 (snippet). https://gds.blog.gov.uk/2024/01/12/how-were-making-it-easier-to-access-government-forms-online/
- NN/g, Errors in Forms: Design Guidelines, 2019 (reviewed Dec 2024) (fetched). https://www.nngroup.com/articles/errors-forms-design-guidelines/
- MDN, enterkeyhint, 2026 (fetched). https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint
- web.dev, Sign-in form best practices, 2026 (fetched). https://web.dev/articles/sign-in-form-best-practices
- web.dev, Payment and address form best practices, 2026 (snippet). https://web.dev/articles/payment-and-address-form-best-practices
- Primer, ConfirmationDialog accessibility, 2026 (snippet). https://primer.style/product/components/confirmation-dialog/accessibility
- GDS Design Notes, One thing per page, 2015 (snippet). https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/
- NN/g, User Control and Freedom, 2000 / heuristic page (snippet). https://www.nngroup.com/articles/user-control-and-freedom/
- NN/g, Progressive Disclosure, 2006 (fetched). https://www.nngroup.com/articles/progressive-disclosure/
- Practitioner, undo over confirmation: InfoWorld "Ask Forgiveness, Not Permission" https://informit.com/articles/article.aspx?p=1091575 ; Ladder https://ladder.io/tactic/undos-not-prompts (years not confirmed).
- Not retrieved, verify before relying: Apple HIG (44 pt), Material 3 (48 dp), W3C WCAG 2.2 SC 2.5.8 / 2.5.5, NN/g The Power of Defaults, NN/g wizard and date-picker articles.
