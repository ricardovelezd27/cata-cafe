S8-10 PLANNER REPORT (read-only; paths checked against origin/claude/s8-03-guest-guard-email-impl = "B")

1. BUILDABLE NOW (B2, B8, C6 have spec defaults; A4 is TODO-only)
T1 Create actions to run(): wrap createSession/createGroupSession/createExpressSession bodies in run(); whitelist locale (redirect uses raw input.locale, sessions.ts:~384); keep the form mounted on failure via feedback.run. Files: app/actions/sessions.ts, NewSessionForm.tsx. Closes F-crear-sesion-1, F-04-2.
T2 Error copy: add invalid_warmup and not_found_or_forbidden to newForm.errors (es/en; invalid_warmup is missing today), show the error beside the field, add tests/sessionErrorsCopy.test.ts. Closes F-crear-sesion-3, -6.
T3 Wizard draft in localStorage (purged in lib/offline/deviceState.ts clearLocalDeviceState), beforeunload guard, owner-only route sessions/[id]/invite (force-dynamic) plus getLatestInvite (copy print/page.tsx:61-72). Closes F-crear-sesion-2, -6.
T4 Wizard hygiene: submit label, inputMode, localDateISO() replacing toISOString().slice(0,10) (NewSessionForm.tsx:273,1233), "Catar este café" via ?coffeeId= checked with usableCoffeeWhere, orphan coffee cards created only if referenced. Closes F-crear-sesion-7,-8,-9, F-04-6,-7, F-cafes-10.
T5 removeSessionSample: count evaluations inside the transaction, refuse or confirm when PhysicalEvaluation/ExtrinsicData exist; delete dialog gets the permanence line, submitted vs draft, participants, retry (DeleteSessionButton.tsx never renders `body`). Closes F-sesiones-3 (race half), F-sesiones-4.
T6 updateSession: run() plus lib/validate; ignore unchanged format/cups server-side; lock from startedAt (C6 default); closed form as one disabled fieldset; addSessionSample computes position inside the transaction with P2002 retry. Closes F-sesiones-7,-9,-10, F-express-8.
T7 setReferenceSample: confirmRepin flag, returns conflict if the sample has evaluations and is not yet a reference; EditSessionForm confirms with a count and reverts the select. B2 default (replace). Closes F-sesiones-6.
T8 duplicateSession: copy every referenceRank, check each coffeeId with usableCoffeeWhere (unusable becomes a coffee-less sample), visible failure text in DuplicateButton. B8 default (all). Closes F-sesiones-8, F-04-5.
T9 Express form: keep CTA enabled, use a <form>, shared defaults, carry name/format/n to the full wizard. Closes F-express-6,-7, F-04-8.
T10 "Asignar café": CoffeePicker, link or create in one transaction, run(), localized toast. Closes F-express-3.
T11 Clamp nota_express to 500 and cap module JSON inside computeEvaluationDerived (live invalid_input, offline non-retryable); history rows for coffee-less closed samples; submitAllEvaluations to run() returning {closed, submitted}. Closes F-express-5,-2, F-solo-6.
T12 createCoffee/updateCoffee/duplicateCoffee to run(); CoffeeForm keeps values; updatedAt precondition. Closes F-cafes-6,-9.

2. GATED
- A4 (random blind codes, F-crear-sesion-10): leave `// TODO(A4): wizard labels stay "Muestra N"` in the sample-label helper and the PR description; no code.
- B2 "keep originals aside" (T7 extension): `// TODO(B2-b)` in setReferenceSample.
- C6 (what freezes at "Iniciar cata"): built with the (b) default; `// TODO(C6)` at the lock.
Nothing else is gated.

3. FACTS FOR THE ARCHITECT
- BASE IS WRONG: B holds only the six S8-03 commits. S8-01 and S8-02 are separate branches (claude/s8-01-rls-closed-readonly-impl, claude/s8-02-blind-leaks-impl); none is an ancestor of B. isSessionExpired, assertSessionStarted, the SampleAuthRow additions (closesAt, isGroup, isAsync, startedAt, isOwner) and the reworked removeSessionSample are NOT on B. T5, T6 and T7 edit the same lines S8-01 changed (removeSessionSample, SessionAuthRow), so a branch from B will conflict. Merge all three into a base first.
- S8-02 adds lib/coffeeDuplicate.ts. Check it before T12/duplicateCoffee.
- ActionErrorCode is a closed union (lib/actionResult.ts), so wizard codes (invalid_name, no_samples...) cannot pass through run() as is. Two designs: (a) extend the union, or (b) keep the `{ok:false,error:string}` return for validation and use run() only for thrown errors. (b) is smaller. The spec's "typed union" implies (a).
- Spec says createSession "outside run()". True, but on B it already returns {ok:false,error} for validation. Only throws (guest, DB) lose the form. requireRegisteredUser throws not_found_or_forbidden for guests, and errors.generic hides it.
- T5: removeSessionSample already refuses sample_has_evaluations. The race is only the count outside the transaction, and physical/extrinsic data is not counted. The spec overstates this.
- F-sesiones-4 was downgraded to P3 in verification. The dialog already says "se eliminarán", so this is copy only.
- Spec line numbers drifted about 6 lines (createSession 326, createGroupSession 442, duplicateSession 731). The cited findings are still valid.
- Collisions with later specs: T11 touches lib/evaluation.ts (S8-04, S8-09) and submitAllEvaluations (S8-05 drafts at close); T3 touches createInviteToken (S8-11 revoke); T4 touches NewSessionForm.tsx (S8-04 cups default). Merge order matters.
- updateCoffee/createCoffee already return {ok,error}; S8-03 added coffeeInputBounds. T12 is mostly a wrapper plus the updatedAt precondition.
- Which express/coffee actions get `run()` has two designs: wrap the exported function (changes the return type for every consumer) or add a new wrapper. Grep shows only CoffeeForm.tsx and DuplicateButton.tsx consume them.

4. FILES TOUCHED
app/actions/sessions.ts, app/actions/community.ts, app/actions/coffees.ts, lib/evaluation.ts, lib/expressSession.ts, lib/sessionRouting.ts (if history rows), lib/offline/deviceState.ts, lib/referenceRules.ts (test only), app/[locale]/app/sessions/new/NewSessionForm.tsx, new/page.tsx, sessions/[id]/invite/page.tsx (new), sessions/[id]/edit/EditSessionForm.tsx, edit/page.tsx, sessions/DeleteSessionButton.tsx, sessions/express/ExpressForm.tsx, sessions/[id]/results/ResultsClient.tsx, sessions/[id]/cup/CupClient.tsx, components/DuplicateButton.tsx, components/coffees/CoffeeForm.tsx, messages/es.json, messages/en.json, docs/flows.md, docs/audits/flows-2026-11/{04,05,06,07,11,12}*.md, tests/{referenceRules,expressSession,actionsAndState,sessionErrorsCopy}.test.ts.
Prisma migration: none. SQL phase: none. Runbook section: none.

5. SIZE: L (12 tasks, about 20 files). Worth a PR: yes, but split it. PR-A = T1, T2, T3, T4, T9, T12 (create path and coffee actions). PR-B = T5, T6, T7, T8, T10, T11, after S8-01 is merged.