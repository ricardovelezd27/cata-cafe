# 05 · Catar ahora (exprés)

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 490–567 · **Domain briefs applied:** `session-setup` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-session-setup (Sonnet 5.5) · **Verification:** done 2026-11-06 (session-setup verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A registered user opens `/app/sessions/express` from the dashboard, the Sesiones page or the empty state (all `GuestGateLink`, so guests get the account modal). `ExpressForm.tsx` asks for name (prefilled "Cata · 6 nov 2026"), format (pills, default afectivo) and sample count (stepper 1–20, default 6). `createExpressSession` (`app/actions/sessions.ts:395`, `run()` → `ActionResult`, rejects `is_anonymous`) creates an active solo session with `cupsPerSample: 1` and N coffee-less samples "Muestra A…", and the form pushes to `/cup`. The cupper uses the normal `CupClient`, an optional "Notas rápidas" end step, and `submitAllEvaluations` → `maybeAutoCloseSoloSession`, which closes the session only when every sample has a submitted evaluation (`app/actions/community.ts:77`). Spec and code agree. Two board "to-be" items (note clamp, wizard prefill) are not implemented; the history and picker gaps are still real.

## 2. Expert bar applied

- **P7 fewer fields beat fewer steps / P1 defer the rest** (checklist 2, 4, 12): three fields, one ghost link to the full wizard. Met.
- **P9 defaults visible and changeable** (3, 10): format and count are preselected; nothing tells a newcomer what the three formats mean. Partly met.
- **P11 keep submit enabled, P12 keyboard hints** (15, 17): the CTA is disabled on a blank name with no message; no `enterkeyhint`. Partly met.
- **P5 recovery** (25, 28): the form stays filled on failure, but an over-sized created session cannot be finished (F-express-1).
- **Anti-pattern "deferral with no later prompt"**: coffee-less samples are valid, yet nothing later invites completion (F-express-2, F-express-3).
- **cupping-protocol lens**: a CVA score assumes several cups; express fixes one (F-express-4). **offline-native lens**: creation needs the network (§5).

## 3. Findings

### F-express-1 · A solo express session with fewer cupped samples than created never closes · severity: P2 · status: new

**Fixed in S8-05** (draft PR, branch `claude/s8-05-close-lifecycle-impl`): `finishSoloSession` ("Terminar cata") on the guard dialog and the results banner submits complete drafts, removes only unopened samples and closes through `closeSessionInternal` (Kim C2 default a).

- **Problem** — `maybeAutoCloseSoloSession` closes only when `submittedCount >= sampleCount` (`app/actions/community.ts:77`: `if (sampleCount === 0 || submittedCount < sampleCount) return;`). Express defaults to 6 samples (`lib/expressSession.ts:18`). The submit guard lets the cupper "submit anyway" with gaps (`CupClient.tsx` `handleGuardConfirm`, ~line 1296). Solo has no manual close (`ownerControls` renders only for `isOwner && isGroup`, `CupClient.tsx:1763`) and the cron only closes sessions with `closesAt` (`app/api/cron/close-expired-sessions/route.ts:29`), which express never sets. The session stays `active`, `sessionHref` keeps sending the user to `/cup`, and history and reveal never happen. The only exit is Edit → delete the untouched samples (`removeSessionSample` refuses samples that already have evaluations, `sessions.ts:1132`).
- **Implication** — Someone who planned 6 and tasted 4 sees a permanent "X of Y" notice and an eternal active session. The casual quick-notes user is the one least likely to find the Edit page. Trust and completeness suffer.
- **Fix** — When a solo cupper submits with some samples never opened, offer on the same guard dialog "Terminar con las N que catié": remove the unopened (evaluation-less) samples, then run the normal auto-close. Acceptance: (1) 6 created, 4 submitted, choosing it closes the session and lands on results with 4 samples; (2) samples with any evaluation are never removed; (3) group sessions never see the option; (4) the close goes through `closeSessionInternal` only. **Size:** M.
- **Native** — The Android back button must dismiss the dialog without side effects; no extra storage.
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-express-1.
- **Invariant check** — "No manual close path for solo": the close stays automatic (prune, then reuse auto-close); `closeSessionInternal` remains the only writer of `closed`; record the pruning in `docs/flows.md` §1.

### F-express-2 · Express cuppings leave no trace in history, and the empty state points to the wizard · severity: P2 · status: confirms-board(Las catas exprés no aparecen en el historial)
**Fixed in S8-16** — closed coffee-less samples leave a label-only history row (`coffeeId` NULL, "Sin café asignado"), replaced when a coffee is assigned. The empty-state CTA is not part of this change.

- **Problem** — `profile/history/page.tsx:27` reads only `userCoffeeHistory`; `syncCoffeeHistoryForSession` skips coffee-less samples (`lib/coffeeHistory.ts:24`: `coffeeId: { not: null }`). The empty-state action is a `GuestGateLink` to `/sessions/new` (`HistoryTable.tsx:209-221`), the wizard that requires coffees, not "Catar ahora".
- **Implication** — A user whose whole practice is express sees an empty history and no scores, and is nudged toward the heavy flow. The data exists (submitted evaluations) but is invisible. Trust and retention.
- **Fix** — List closed sessions' submitted evaluations with no coffee as "Sin café asignado" rows linking to the results drill-down "Asignar café"; replace the row once a coffee is assigned (no duplicate). Point the empty-state CTA at express. Acceptance: after an express close the history shows each sample with the user's score; assigning a coffee turns it into the normal row; profile counts separate "catas" from "cafés catados". **Size:** M.
- **Native** — n/a (server-rendered list).
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched (read-only query; `UserCoffeeHistory` semantics unchanged).

### F-express-3 · "Asignar café" can only mint a new coffee, non-atomically and with weak failure handling · severity: P2 · status: confirms-board(«Asignar café» sólo puede crear un café nuevo desde texto libre)
**Partly fixed in S8-10** (PR pending): coffee create + link is one transaction with whole-transaction retry on a code collision (T10 server half). The CoffeePicker UI and linking an existing coffee are NOT built.

- **Problem** — `updateSampleMetadata`'s implicit create (`sessions.ts:1308-1330`) runs `withCodeRetry(coffee.create)` and then a separate `sessionSample.update`; it accepts no existing coffee id, and `CoffeePicker` is used only by `NewSessionForm`. `addSessionSample` already accepts a validated `coffeeId` (`sessions.ts:1056`) but the edit form never sends one (`EditSessionForm.tsx:242`). The results caller has no try/catch (`ResultsClient.tsx:439-442`) and the action throws instead of returning `ActionResult`. Revalidation uses bare paths (`sessions.ts:1352-1359`, including `revalidatePath('/app/profile/history')`), which the codebase has already found match nothing (comment at `community.ts:40`).
- **Implication** — Owners who already catalogued the coffee get a duplicate private coffee with another code, and history and scores attach to the duplicate. A failure between the two writes leaves an orphan coffee; a thrown error shows the opaque production digest.
- **Fix** — Offer `CoffeePicker` in the Asignar café dialog, the cup-page sample editor and "Añadir muestra"; a picked id is re-validated with `usableCoffeeWhere`. Create plus link in one transaction, the action converted to `run()` with the toast path, locale-prefixed revalidation. Acceptance: picking an existing coffee links it (no new row), sets `revealed`, re-runs the history sync; a foreign or anonymized id gives `coffee_not_usable`; typing a name creates exactly one coffee; failure shows a localized toast and the dialog stays open. **Size:** M.
- **Native** — The picker is a typeahead: keep it reachable with the keyboard open; no storage.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — never trust a client coffee id (`usableCoffeeWhere`); closed = read-only: this stays the second sanctioned post-close write (owner, coffee-less sample only); the `ActionResult` contract is part of the fix.

### F-express-4 · A one-cup score looks identical to a full CVA score once a coffee is assigned · severity: P2 · status: new

**Fixed in S8-04** (draft PR, branch `claude/s8-04-scoring-impl`): history and the coffee profile show an "Impresión rápida" tag when the session ran with fewer than 5 cups (display-only, no score changes; TODO(A3) ships as option b).

- **Problem** — Express forces `cupsPerSample: 1` (`sessions.ts:411`), so no uniformity or defect check applies and the score carries no penalties (`computeEvaluationDerived(…, cupsPerSample)`, `lib/evaluation.ts:57`). After "Asignar café" the sync copies `individualScore` into `UserCoffeeHistory` (`lib/coffeeHistory.ts:71`); `HistoryRow` carries no cup count (`history/page.tsx:48-58`), so the row sits beside 5-cup scores.
- **Implication** — A quick impression can sit at the top of a professional ranking or in a coffee's average with no signal that it is a different kind of number. The scoring itself is correct; the comparability is not communicated.
- **Fix** — Show a small "impresión rápida" tag on scores from sessions below the CVA cup count wherever they appear next to others (history, coffee profile, results ranking), without changing the number. Acceptance: the tag shows for `cupsPerSample < 5` in those three places; PDFs only if Kim agrees; no score value changes. **Size:** M.
- **Native** — n/a.
- **Confidence** — inferred-from-code (surfaces read `individualScore` only; not run).
- **Kim?** — yes, K-express-2.
- **Invariant check** — `lib/scoring.ts` and the trigger untouched; the tag is display-only.

### F-express-5 · The server never bounds `nota_express` or the module JSON · severity: P3 · status: confirms-board(El JSON de evaluación no tiene límites de tamaño en el servidor)
**Fixed in S8-10** (PR pending): `assertModuleBounds` in `computeEvaluationDerived` rejects a note over 500 chars and a module over 64k chars with `invalid_input`, live and offline (T11).

- **Problem** — `computeEvaluationDerived` spreads `...data` untouched (`lib/evaluation.ts:48-53`); `upsertEvaluation` and offline `syncEvaluation` only check "is an object" (`sessions.ts:581-583`, `offline.ts:64-66`). `EXPRESS_NOTE_MAX` is used only by the textarea (`ExpressNotesStep.tsx:5`).
- **Implication** — A tampered client stores an arbitrarily long note that is printed in results and the PDF. Robustness only.
- **Fix** — Clamp the note to 500 characters and reject a serialized module above a fixed cap inside the shared derive function, so live and offline agree. Acceptance: a 600-char note stores 500; an oversize payload gives `invalid_input` live and a non-retryable result offline; scores unchanged; vitest covers both. **Size:** S.
- **Native** — An already-queued oversize offline blob must be discarded cleanly, not retried forever.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — scoring inputs stay server-derived; no new columns (JSON shape stays).

### F-express-6 · "Configurar sesión completa" discards what was typed · severity: P3 · status: confirms-board(«Configurar sesión completa» lleva lo ya escrito al asistente)

- **Problem** — `ExpressForm.tsx:177` links to `/sessions/new` with a plain `Link` and no values; `new/page.tsx:18-21` reads only `groupId`.
- **Implication** — Someone who types a name and then wants coffee cards re-types it (P6, ask once).
- **Fix** — Carry name, format and count in the query; the wizard pre-fills them and silently ignores invalid values. Acceptance: params pre-fill name, format and N sample chips with coffees still required; bad params ignored. **Size:** S.
- **Native** — Query strings survive WebView navigation; nothing personal beyond the session name.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched; the route stays gated for guests.

### F-express-7 · The three-field form leaves small friction on a phone · severity: P3 · status: new

- **Problem** — The CTA is `disabled={pending || !name.trim()}` (`ExpressForm.tsx:171`) with no message on a blank name; the text input has no `enterkeyhint` or `autoCapitalize` (`:89-96`); the format pills show labels only, with no hint of what afectivo, descriptivo and combinado mean (`:108-126`); the stepper is tap-only, so 6 → 12 takes six taps (`:139-162`).
- **Implication** — A cupper clears the prefilled name and finds a dead button (P11); a newcomer guesses the format. Minor, but the form's whole value is speed.
- **Fix** — Keep the CTA enabled and show "Ponle un nombre" beside the field on tap; `enterkeyhint="go"` submits from the keyboard; a one-line description under the selected format. Acceptance: blank name + tap shows the message and focuses the field; Enter submits; the description follows the pill. **Size:** S.
- **Native** — The keyboard must not cover the CTA (verify with `visualViewport` on a device).
- **Confidence** — verified-in-code.
- **Kim?** — no (format wording only if Kim wants to review it).
- **Invariant check** — none touched.

### F-express-8 · "Añadir muestra" is Spanish-only and uncapped · severity: P3 · status: new
**Fixed in S8-10** (PR pending): `addSessionSample` uses the locale label helper, the 100-sample cap and an in-transaction position with retry (T6).

- **Problem** — `addSessionSample` falls back to `` `Muestra ${position + 1}` `` regardless of locale (`sessions.ts:1076`) and has no 20-sample cap (`:1066-1070`), unlike express (`lib/expressSession.ts:17`, labels "Muestra A…").
- **Implication** — An English user adding a sample gets "Muestra 7" next to "Sample A", and the naming style flips from letters to numbers.
- **Fix** — Use the express label helper with the passed locale and enforce the same 1–20 bound server-side with `invalid_input`. Acceptance: an en session adds "Sample G"; the 21st sample is refused with a localized message. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched (the closed = read-only guard stays).

## 4. Keep — works well

- Anonymous users are rejected server-side and by the proxy (`sessions.ts:405-406`, `lib/guestScope.ts`); every entry link is a `GuestGateLink` (`app/[locale]/app/page.tsx:182`, `sessions/page.tsx:200`).
- The client sends only name, format and count; `cupsPerSample` is fixed by the server (`sessions.ts:411`).
- `validateExpressInput` reuses `lib/validate` and is pure (`lib/expressSession.ts:38`).
- The form keeps its state on failure and double submit is blocked (`useTransition`, `ExpressForm.tsx:55`).
- `nota_express` rides the module JSON and never touches completeness or scoring (`CupClient.tsx:1118`).
- Post-close naming is owner-only, coffee-less only, reveals and re-syncs history (`sessions.ts:1261-1347`).
- Auto-close goes through the one close routine (`community.ts:81`).

## 5. Not verified

- Offline: `createExpressSession` is a plain server call and `ExpressForm.tsx` has no offline path; whether the user sees an error toast or a hang with no connection needs a device in airplane mode. A lab with weak signal cannot start a cupping.
- `defaultExpressName(new Date())` runs in a page that exports `generateStaticParams`; I expect the authed layout's cookies make it dynamic, but a production build should confirm the prefilled date is not frozen.
- Whether the results page offers any way back to unopened samples beyond the "X of Y" notice (needs a click-through with a second-to-last-sample submit).
- How the one-cup score behaves in the community trigger for descriptive and combined formats (solo only, not exercised).

## 6. Questions for Kim (collected)

- **K-express-1** — Cuando haces una cata rápida y paras antes de probar todas las muestras que habías previsto, ¿qué esperas? (a) que la cata se cierre sola con las que sí probaste; (b) que te pregunte si quieres terminar; (c) que quede abierta por si sigues más tarde.
- **K-express-2** — Una cata rápida con una sola taza por muestra, ¿es comparable con una cata completa de cinco tazas? Opciones: (a) sí, mismo puntaje sin marca; (b) mismo puntaje pero con la etiqueta "impresión rápida"; (c) no guardarla en el historial de puntajes de un café.
- **K-express-3** (sharpens the board's open question) — ¿Una cata rápida debería poder llevar una muestra de referencia o un calentamiento? Hoy se puede añadir desde Editar, pero solo antes de empezar a puntuar, y el exprés abre directo la cata. Opciones: (a) nunca, el exprés es solo impresión rápida; (b) un interruptor opcional "más opciones" en la misma pantalla; (c) solo el calentamiento.

## 7. Verification log

F-express-1 — CONFIRMED — `maybeAutoCloseSoloSession` returns unless all samples are submitted (community.ts:75-77); `ownerControls` only for `isOwner && isGroup` (CupClient.tsx:1762); the cron selects only `closesAt < now` (close-expired-sessions/route.ts:29-30); `removeSessionSample` refuses samples with evaluations (sessions.ts:1131-1135). Express defaults to 6 samples. The Fix bends "no manual solo close" (the finding says so). — severity: keep (P2; common express pattern, session stuck active, no history).
F-express-2 — CONFIRMED — `syncCoffeeHistoryForSession` filters `coffeeId: { not: null }` (lib/coffeeHistory.ts:24-25); history page reads `userCoffeeHistory` (history/page.tsx:27); the empty-state CTA uses `newSessionHref` (HistoryTable.tsx:215). Scores stay visible in Sesiones/results and history is per-coffee by design, so this is discoverability, not loss. — severity: → P3.
F-express-3 — CONFIRMED — implicit create is `withCodeRetry(coffee.create)` then a separate `sessionSample.update` (sessions.ts:1308-1330); the input has no coffee id; ResultsClient.tsx:439-442 has no try/catch; the action throws. Minor: the bare-path revalidation point is moot since `router.refresh()` follows and pages are dynamic. — severity: keep (P2). The Fix respects `usableCoffeeWhere` and the post-close-write invariant as stated.
F-express-4 — CONFIRMED — `cupsPerSample: 1` forced (sessions.ts:411); `UserCoffeeHistory` stores only `individualScore` (lib/coffeeHistory.ts:71-75), no cup count. The number is correct; only comparability labelling is missing, a display decision pending Kim (K-express-2). — severity: → P3.
F-express-5 (P3) — no duplicate or citation problem spotted.
