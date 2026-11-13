# Brief — fixes for PR #131 (S10 WP4b, late contributions) after its independent review

Branch: the EXISTING branch `claude/s10-04b-late-contributions-impl` (its tip is now
`e1c83c7`: the architect merged `origin/main` into it and renumbered your runbook section to
§35; `git fetch origin` and start from that tip; never rebase or force-push). The PR exists
(#131): update its body, do not open a new one.

The review confirmed the guards, the payload privacy, the anchor pin, the migration and the
registrations, and every mutation it tried was caught. It said "merge as is: NO" because the
DESIGN (the architect's) let the organiser change a group result without knowing what they
accept. The decisions below are final. Tests FIRST for each rule.

## H1 + H2 — the organiser must see what they accept, and accept exactly that
After the close every coffee is revealed and everyone sees the group results, so a late
evaluation may have been written knowing the answer. The organiser decides, informed.

1. **Migration (not applied yet, so EDIT the same file, do not add a second one):** add
   `evaluations."receivedLateAt" TIMESTAMPTZ(3)` (nullable) to
   `20261115100000_close_notice_and_late_contributions` and the schema. Stamped ONLY by
   `submitLateDraft` (create and update). It is the server's own record that this content
   arrived after the close; nothing the client sends decides it. Runbook §35: five columns.
2. **A draft the server already had when the session closed is never replaced after the
   close.** `planLateDraftWrite`: existing DRAFT with `receivedLateAt` NULL (saved before
   the close) → answer `conflict`, write nothing (the organiser can accept that version);
   existing draft with `receivedLateAt` set → update only if newer (as today); no row →
   create; submitted row → `conflict` (as today). Panel copy for that conflict, es: "El
   organizador ya tiene la versión que guardaste antes del cierre." (+ en).
3. **What the organiser sees per late row** (owner lens only, as today): cupper, sample, the
   evaluation's own total (`individualScore`, or "Parcial/—" if null), the difference from
   that sample's current group score, the 8 ratings on demand (reuse an existing compact
   per-attribute list component if one exists; else a simple list), and ONE of two labels
   decided by the server column:
   - `receivedLateAt` NULL → es "Guardada antes del cierre" (en "Saved before the close").
   - set → es "Recibida después del cierre: pudo escribirse después de ver los
     resultados." (en "Received after the close: it may have been written after seeing the
     results."), `warning` token, text not colour alone.
   The confirm dialog repeats the score and the label.
4. **Version guard:** `acceptLateEvaluation(evaluationId, expectedUpdatedAt)`: inside the
   locked transaction refuse with `conflict` when the row's `updatedAt` differs from the one
   the organiser's page rendered (ISO string round trip, milliseconds kept: check the column
   type); the panel shows "Esta evaluación cambió. Recarga para ver la versión actual." (+ en)
   and refreshes. DB test = the reviewer's probe: page shows a pre-close draft, a late send
   arrives (now refused by rule 2: also test the guard directly by updating the row),
   accept with the stale stamp → `conflict`, nothing flipped.

## M1 — excluded cuppers
A participant flagged `excludedFromResults` is not listed in the late panel,
`isAcceptableLate` refuses their draft (`invalid_input`), and they get no "se incluyó" line.
(`submitLateDraft` may still store their draft: harmless.) Tests.

## M2 — say it when one acceptance moves a sample to the current rule
When the sample's stored aggregate row has `ruleVersion` 1 (or no row and only old
evaluations: use `sampleScoreRule`), the confirm dialog adds, es: "El resultado del grupo de
esta muestra se calculó con la regla anterior de descuentos. Al incluir esta evaluación se
vuelve a calcular con la regla actual; las demás muestras no cambian." (+ en). Owner payload
carries a boolean only. Test the builder.

## M3 + L2 — an announced close can only close what was announced
- New owner action `closeAnnounced(sessionId, closingAt)` (or a parameter of `closeSession`:
  choose the smaller diff): on the server, close ONLY if the session's stored `closingAt`
  equals the value the page counted down (same instant) AND that instant has passed by the
  server clock (allow 2 s of tolerance); otherwise answer ok with `closed: false` and change
  nothing. The auto-close at zero calls THIS, never the plain `closeSession`. A cancel (null)
  or a re-announce (another instant) therefore defeats a stale tab, a second tab and an old
  `serverNow`. "Cerrar ahora" stays the plain close.
- Client: while a cancel is in flight (`busy`) or after the owner clicked "Cancelar", the
  tick never fires the auto-close; pure rule (`shouldAutoClose` gains the inputs) + tests.
- DB tests: announced → cancelled → `closeAnnounced` with the old instant closes nothing;
  announced for the future → closes nothing; announced and due → closes through
  `closeSessionInternal` (emails mode as the owner's manual close).

## L1 — the cupper's banner when nothing closes
`bannerState`: counting → due ("El organizador está por cerrar la cata.") for at most 2
minutes past zero → then "El cierre anunciado no se hizo. La cata sigue abierta." (+ en) for
10 minutes → none. Pure + tests.

## L3, L4, nit
- `setPostCloseNote` bumps `updatedAt` (Prisma `@updatedAt`): say so in CLAUDE.md and
  `docs/flows.md` ("writes its two columns; `updatedAt` moves; nothing reads it for a
  submitted evaluation of a closed session": verify that sentence by grep and report).
- Account deletion: when a person's evaluations move to the deleted-account placeholder,
  their `postCloseNote` and `postCloseNoteAt` are set NULL (free text the person wrote).
  Find where `deleteAccountData` moves evaluations; add it; update the manifest note and a
  DB test. Guest claim: a conflict that deletes the losing evaluation loses its note: write
  that in `docs/flows.md` and CLAUDE.md (accepted, documented).
- Fix the `isAcceptableLate` comment ("a real account" → guests pass; only deleted-account
  placeholders and excluded cuppers are refused).

## Docs
CLAUDE.md and `docs/flows.md` §1 for every rule above (the two labels, "a pre-close draft is
never replaced", the version guard, `closeAnnounced`, excluded cuppers), runbook §35.

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors, `npm run build` after the last change). If
`test:db` hangs with no output for 10 minutes, stop and re-run it. Do not stop to wait on
background work. Report: commits; the migration SQL as now committed; the final text of
`planLateDraftWrite`, `isAcceptableLate`, `shouldAutoClose`, `bannerState` and the guards of
`acceptLateEvaluation` and `closeAnnounced` in order; what the organiser's row and confirm
dialog show (es and en, all strings added or changed); the grep result for L3; gate tails
with exact counts; anything not done or doubtful.
