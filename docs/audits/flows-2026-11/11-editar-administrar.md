# 11 · Editar y administrar sesiones

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1015–1120 · **Domain briefs applied:** `asset-admin` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-asset-admin (claude-sonnet) · **Verification:** done 2026-11-06 (asset-admin verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

The owner manages a session from the sessions list (edit, duplicate, delete icons) and from `/sessions/[id]/edit`. The edit form is not one transaction: Guardar calls `updateSession`, while sample add/rename/remove and the reference select each fire their own server action immediately (`EditSessionForm.tsx:193,231,242`, `setReferenceSample`). Format and cups lock on the first evaluation row; warm-up locks on `startedAt` or any evaluation; closed sessions are read-only except two named post-close writes. Delete runs `detachCoffeeHistoryForSession` and the session delete in one transaction, so cuppers keep snapshot history rows. The spec matches the code; two things the spec does not say: the delete dialog never renders its own warning text (F-4) and the board's "format/cups lock" is keyed to evaluation rows only (F-7).

## 2. Expert bar applied

- **P8/P9 server-side authorization, deny by default** → every mutation goes through an object-level helper and closed = read-only holds in every write path, including the database policies.
- **P1–P3, P6 destructive actions** → specific confirmation, impact counts, what survives vs what is lost; Cancel safe.
- **P12 freeze what has meaning** → format, cups, sample identity, reference and warm-up locked once data depends on them, enforced on the server.
- **P11 idempotent creates / P27 every failure shown** → no double sample, no silent failure of an owner action.
- **Lenses:** cupping protocol (fixed sample set, blind order, reference as anchor, blind until reveal); offline-native (what a cupper's unsynced device does when the owner deletes or removes under them).

## 3. Findings

### F-sesiones-1 · Database write policies bypass "closed = read-only" · severity: P1 · status: confirms-board(Las políticas RLS de escritura saltan «cerrada = solo lectura»)

- **Problem** — `prisma/sql/rls_and_triggers.sql:132` `CREATE POLICY "evals_own" ON evaluations FOR ALL USING ("cupperId" = auth.uid()::text)`, and the same shape for `sessions_write` (:114), `samples_write` (:121), `participants_write` (:146), `phys_all` (:51), `ext_all` (:55). No later phase replaces them (PHASE 18/18b/20 only touch reads, functions and coffees). The public anon key plus a user JWT can therefore write these tables directly through PostgREST. Sharpening beyond the board: the evaluation policy has no membership condition, so any authenticated user (a guest included) who knows a sample id can insert an evaluation for it, and an excluded or removed cupper keeps write access.
- **Implication** — Security and scoring correctness. After close, a cupper can change scores or flip `isDraft`, which re-fires the aggregate trigger, so results and already-emailed PDFs diverge without passing `assertSessionWritable` or server-side scoring derivation. The owner can reopen a closed session by writing `status`.
- **Fix** — Make every API role read-only on these tables (SELECT policies only, or revoke INSERT/UPDATE/DELETE from `anon, authenticated`); keep the SELECT policies Realtime depends on. **Acceptance:** with a browser JWT, UPDATE of own evaluation after close returns 401/403; INSERT into a session the user is not in is refused; realtime subscriptions on `evaluations` and `cupping_sessions` still deliver; every app flow (cup, results, wizard) still works. **Size:** M (SQL + Security Advisor + runbook section).
- **Native** — A Capacitor shell ships the same anon key; the fix must not break offline replay (it goes through Prisma, unaffected).
- **Confidence** — `verified-in-code` for the policies; `needs-runtime-check` for exploitability (curl PostgREST with a test JWT on staging, not prod: only one Supabase project exists).
- **Kim?** — no.
- **Invariant check** — enforces closed = read-only and "authz via lib/sessionAuth.ts"; manual SQL step must get a runbook entry (CLAUDE.md rule).

### F-sesiones-2 · Several server actions write after close, and two dead exports flip evaluations · severity: P2 · status: confirms-board(Lista cerrada de escrituras permitidas tras el cierre) — severity raised from the board's P3 for the dead exports

- **Problem** — `app/actions/community.ts:85 submitSampleEvaluation` and `:110 submitEvaluation` update `{ isDraft: false, submittedAt: new Date() }` with only `requireUser()`; no `assertSessionWritable`. They have no callers outside the file (grep) but, being `"use server"` exports, they are public endpoints. `revealSample` (:271) accepts a `coffeeId` and rewrites `session_samples.coffeeId` with no closed check (the UI only ever calls it without a coffee: `ResultsClient.tsx:448`). `setParticipantExclusion` (:426) and `refreshAggregateScores` (:463) also run after close, but neither is among the two sanctioned post-close writes in CLAUDE.md.
- **Implication** — Trust and scoring: a cupper whose draft was left at close can submit it afterwards and move the community score of a closed session; coffee identity of a closed sample can be re-aimed with no history re-sync.
- **Fix** — Delete the two dead exports. Give `revealSample` the closed guard (or drop its `coffeeId` parameter). Decide explicitly whether owner exclusion after close is sanctioned (board Option A); if yes, add it to the written list in CLAUDE.md and `docs/flows.md` §1 and implement the single helper the board proposes. **Acceptance:** each remaining mutating action either calls `assertSessionWritable` or is on the written list; a test scanning `'use server'` exports fails otherwise. **Size:** S–M.
- **Native** — n/a.
- **Confidence** — `verified-in-code`.
- **Kim?** — no (whether the teacher may exclude a participant after close is a product call; see §5).
- **Invariant check** — closed = read-only; fix tightens it. Any new exception must update `docs/flows.md` §1.

### F-sesiones-3 · Removing a sample: no closed guard, race with a first evaluation, silent loss of physical/extrinsic data · severity: P2 · status: confirms-board(Quitar una muestra sin evaluaciones en una sesión cerrada)

- **Problem** — `app/actions/sessions.ts:1115` `removeSessionSample` reads the sample with its own `findUnique` (not `requireSampleOwner`), never calls `assertSessionWritable`, checks `_count.evaluations > 0` at :1132 and only then deletes at :1137, outside the transaction. `PhysicalEvaluation` and `ExtrinsicData` cascade on sample delete (`schema.prisma:247,261`) but are not part of the refusal test.
- **Implication** — Data loss. (a) A closed session loses a sample from results and PDFs (board). (b) The owner's green-bean grading and origin data on a sample vanish with no warning, because only evaluations block removal and the dialog text says nothing about them (`removeSampleBody`). (c) A cupper's first autosave landing between the check and the delete is cascaded away.
- **Fix** — Authorize via `requireSampleOwner` + `assertSessionWritable`; count evaluations inside the same transaction (or delete conditionally on none existing); also refuse, or warn with counts, when physical/extrinsic rows exist. **Acceptance:** closed session → `session_closed`, nothing deleted; sample with a physical row asks for confirmation naming that data; open session still re-packs positions and compacts reference ranks; non-owner still gets `not_found_or_forbidden`. **Size:** S.
- **Native** — n/a.
- **Confidence** — `verified-in-code`; the race is `needs-runtime-check` (two tabs).
- **Kim?** — no.
- **Invariant check** — brings it under closed = read-only and `lib/sessionAuth.ts`.

### F-sesiones-4 · The delete dialog never says "permanent", and its impact line is incomplete · severity: P2 · status: new (board's "getDeleteImpact falla" is one sub-case)

- **Problem** — `DeleteSessionButton.tsx` declares `body: string` in its translations but never renders it: `dialogBody` (:56–83) shows only the coffee list and the `impact` sentence. The es copy that says "permanentemente… datos físicos y extrínsecos, invitaciones… No se puede deshacer" (`messages/es.json` `deleteSession.body`) is dead. `getDeleteImpact` counts `cupperCount` from submitted evaluations only (`sessions.ts:~620`) but `evaluationCount` includes drafts, and it ignores participants who joined and have not evaluated and whether the session is live. If the call fails the body shows "calculando…" forever (:40–50, board P3).
- **Implication** — Trust and data loss. A teacher can wipe a running group cupping, dropping every participant's work and drafts, from one icon tap, after reading only a count. "12 evaluaciones de 2 catadores" can contradict the real number of people hit. No undo exists.
- **Fix** — Render the permanence line, state that physical/origin data, invites and drafts go, and that each cupper keeps an anonymous history row; show participant count and a stronger line when the session is active/live and others have joined; on impact failure show an error with Reintentar and keep Eliminar disabled. **Acceptance:** dialog text includes irreversibility; counts distinguish submitted vs draft; live-session variant visible; failed impact load is recoverable. **Size:** S.
- **Native** — Confirm must be dismissed by hardware back before leaving the page; destructive style on the confirm button.
- **Confidence** — `verified-in-code`.
- **Kim?** — no.
- **Invariant check** — none touched (`ConfirmDialog` kit reused).

### F-sesiones-5 · A cupper's offline draft is orphaned when the owner deletes the session or removes the sample · severity: P2 · status: new

- **Problem** — `app/actions/offline.ts:39` `syncEvaluation` calls `requireSampleMember`, which throws `not_found_or_forbidden` when the sample no longer exists (`lib/sessionAuth.ts:118–124`). `hooks/useOfflineSync.ts:91–95` catches every throw, retries, then returns `"failed"`; only a `"discarded"` result (closed session) clears the pending flag (:80–83). Nothing handles "session deleted" or "sample removed".
- **Implication** — Native-readiness and trust. A participant who cupped offline sees the amber "pendiente de sincronizar" state and the pending-drafts badge indefinitely for a session that no longer exists, with no explanation and no way to dismiss or keep their notes. Likely on tablets in a lab with bad Wi-Fi, exactly when owners tidy up.
- **Fix** — Distinguish "gone" from "transient": the replay returns a `gone` outcome for a missing sample or a revoked membership; the client clears the pending flag and shows one plain notice ("Esta sesión ya no existe; tus notas siguen en este dispositivo / se descartaron"), choosing whether to offer a local export. **Acceptance:** delete a session while a second device holds an unsynced draft, reconnect → draft leaves the queue within one replay, a notice appears, badge count drops to zero. **Size:** M.
- **Native** — Applies to IndexedDB in the WebView after background resume; replay must run on resume, not only on the `online` event.
- **Confidence** — `needs-runtime-check` (two devices: owner deletes, participant reconnects).
- **Kim?** — no.
- **Invariant check** — offline store stays client-only; the action keeps the same authorization as the live path and returns a status, not a throw.

### F-sesiones-6 · Marking a rated sample as reference silently overwrites every cupper's ratings · severity: P2 · status: new

- **Problem** — `setReferenceSample` (`sessions.ts:~808–860`) re-pins the new active reference in the same transaction: `planReferenceRepin` rewrites each existing evaluation to 5 on all attributes and clears cup marks (`lib/referenceRules.ts:174–200`), without keeping the original. The edit form only shows "Referencia actualizada" (`referenceSaved`); the helper text explains the 79.00 anchor but not that already-entered ratings are replaced. Removing the reference later does not restore them (the pin applies only going forward, per CLAUDE.md).
- **Implication** — Data loss: real sensory scores are destroyed by one dropdown change mid-session, for all participants, with no prompt and no undo. Cuppers looking at that sample see their ratings jump.
- **Fix** — When any evaluation exists for the chosen sample, require a confirmation naming how many cuppers' ratings will be replaced; optionally keep the pre-pin values in the snapshot for owner recovery. **Acceptance:** choosing a sample with N evaluations shows the count and needs a confirm; choosing one with none behaves as today; cancelling leaves ratings untouched. **Size:** S (confirm) / M (keep originals).
- **Native** — n/a.
- **Confidence** — `verified-in-code`.
- **Kim?** — yes: "Si ya catamos una muestra y después decides que será tu referencia, ¿esas notas deben reemplazarse por el 5 de la referencia, guardarse aparte, o no debería poderse marcar una vez calificada?" Options: replace with warning · keep originals aside · block once rated.
- **Invariant check** — reference rules and the 79.00 anchor stay server-enforced; this adds a confirmation only.

### F-sesiones-7 · Saving the edit form can fail with a wrong "format locked" error, and the lock ignores whether the cupping has started · severity: P2 · status: new

- **Problem** — `EditSessionForm.tsx:~205` always sends `format` and `cupsPerSample` when the page-load `evalCount` was zero (`...(!locked ? { format, cupsPerSample: cups } : {})`), even when unchanged. `updateSession` (`sessions.ts:1009`) returns `format_locked` for any request containing them once an evaluation exists, before applying name/date/objective. The lock itself is only `evaluation.count > 0`, whereas the warm-up lock also uses `startedAt` (:~983).
- **Implication** — Robustness. If the first cupper's autosave lands while the owner has the page open (normal in a live group), the owner's rename or objective edit is rejected with "El formato… se bloquean" although they changed neither. Conversely, between "Iniciar cata" and the first autosave, format or cups can still change under cuppers' open screens (cupping protocol: the cup count and format are fixed once the cups are on the table).
- **Fix** — Send only changed fields (server also ignores unchanged format/cups); lock format/cups from `startedAt` as well as from the first evaluation, matching the warm-up rule. **Acceptance:** rename after another user evaluated → name saved, no format error; changing format after "Iniciar cata" → `format_locked`. **Size:** S.
- **Native** — n/a.
- **Confidence** — `verified-in-code`.
- **Kim?** — yes: "Una vez que empieza la cata en vivo, ¿el dueño debería poder cambiar tazas por muestra, formato o añadir una muestra nueva? ¿O todo queda fijo desde 'Iniciar cata'?" Options: lock all at start · lock format/cups only, allow late samples · as today.
- **Invariant check** — scoring inputs stay server-derived; no bend.

### F-sesiones-8 · Duplicate copies unusable coffees and keeps only one reference · severity: P2 · status: confirms-board(Duplicar copia cafés que ya no son usables y pierde referencias)

- **Problem** — `sessions.ts:775` `coffeeId: s.coffeeId` copies every link with no `usableCoffeeWhere(user.id)` check; the source select takes only `referenceSampleId` (:731) and `applyReferenceByPosition` receives one `refPosition` (:744). Re-verified in the current code.
- **Implication** — A template points at anonymized "Café eliminado" or no-longer-shared coffees (violates "never trust a client-supplied coffee id" in spirit); an R1/R2/R3 setup returns with one reference.
- **Fix** — Re-validate coffees per sample (unusable → coffee-less, label kept) and copy every `referenceRank` by position. **Acceptance:** per the board; plus the copy's edit screen shows the same number of references. **Size:** S.
- **Native** — n/a. **Confidence** — `verified-in-code`. **Kim?** — no.
- **Invariant check** — reference rules (rank cap 3, active = highest) preserved.

### F-sesiones-9 · Closed edit form still looks editable; add/rename fail silently or crash; Enter double-adds · severity: P3 · status: confirms-board(Sesión cerrada: el formulario parece editable) + new details

- **Problem** — Only Save (`:540`), closing date (:415), warm-up and the reference fieldset (:509) are disabled for `closed`; name, date, objective, format, sample rows and the add field are not. `commitRename` (:231) and `handleAddSample` (:239) ignore `!result.ok`, and a thrown `session_closed` reaches the error boundary. The add input's Enter handler (:480–483) calls `handleAddSample` without checking `addPending`, and `addSessionSample` computes `max+1` outside the transaction (`sessions.ts:1066`), so a double Enter creates two samples or a position-unique error.
- **Implication** — Friction; a duplicate sample in a live cupping shifts the sample letters of everyone.
- **Fix** — Wrap the whole form in a disabled fieldset when closed with one notice and a link to Resultados; show localized feedback for every non-ok result; guard Enter with `addPending` and map the unique violation to a friendly retry. **Acceptance:** closed → no enabled control; double Enter adds one sample; a failed rename shows a message. **Size:** S.
- **Native** — Enter on the soft keyboard behaves the same; verify viewport with the keyboard open.
- **Confidence** — `verified-in-code`. **Kim?** — no. **Invariant check** — ActionResult contract (`feedback.run`).

### F-sesiones-10 · `updateSession` stores unvalidated name, objective and format and throws opaque errors · severity: P3 · status: confirms-board(updateSession acepta formato, nombre y objetivo sin validar)

- **Problem** — `sessions.ts:953` trims the name with no length cap, `:963` stores the objective unbounded, `:1010` `data.format = input.format` trusts the TypeScript type. The action returns its own `{ok,error}` and is not wrapped in `run()`, so auth or DB failures reach the browser as an opaque digest.
- **Implication** — A tampered client can store any format string (breaking `moduleKeyForFormat` downstream) or huge text. Low likelihood, wide blast radius on results pages.
- **Fix** — Use `lib/validate` (`str`, `oneOf`) with the wizard's limits, map failures to `invalid_name`/`invalid_format`, and wrap in `run()`. **Acceptance:** format outside the catalogue → `invalid_format`; name over 120 → `invalid_name`; valid input unchanged. **Size:** S.
- **Native** — n/a. **Confidence** — `verified-in-code`. **Kim?** — no. **Invariant check** — validation and ActionResult contract.

### F-sesiones-11 · Deleting an open blind session reveals the coffee names in each cupper's history · severity: P3 · status: confirms-board(Borrar una cata ciega abierta revela el café en el historial)

- **Problem** — `lib/coffeeHistory.ts:133` calls `syncCoffeeHistoryForSession(sessionId, { includeUnrevealed: true, db })`, so rows for never-revealed samples are created and kept with a snapshot.
- **Implication** — A blind cupping the owner cancels teaches participants what was on the table. Cupping protocol: blind identity is the point of the exercise.
- **Fix** — Per the board: skip unrevealed samples of a session that never closed, or keep the row marked blind so history shows the sample label. **Acceptance:** as the board. **Size:** S.
- **Native** — n/a. **Confidence** — `verified-in-code`.
- **Kim?** — yes: "Si cancelas una cata ciega antes de revelar, ¿los catadores deben ver qué café era en su historial, o solo ‘Muestra B’?" Options: hide until a later reveal · show the name anyway · skip the history row.
- **Invariant check** — "delete keeps history" holds for closed sessions.

### F-sesiones-12 · Adding a closing date silently turns a live cupping into an asynchronous one · severity: P3 · status: new

- **Problem** — `planClosesAtChange` returns `isAsync: true` for any date (`lib/sessionState.ts:~104`) and the form saves it with other fields. Async removes the waiting room and "Iniciar cata" for non-owners (`cup/page.tsx:90`, `community.ts:351`) and `startWarmup` refuses async sessions (:170), while the edit form still offers a warm-up toggle. The hint (`closesAtHint`) says only that the session closes by itself.
- **Implication** — A teacher who adds a safety close date to a planned live cupping loses the synchronized start and shared warm-up with no warning.
- **Fix** — State the consequence next to the date field and when saving an unstarted live session ("pasará a cata a tu ritmo, sin sala de espera"). **Acceptance:** setting a date on an unstarted live session shows the notice before Guardar. **Size:** S.
- **Native** — n/a. **Confidence** — `needs-runtime-check` (set a date, open `/waiting` as a participant).
- **Kim?** — yes: "¿Ponen fecha de cierre a las catas en vivo, o solo a las que cada quien hace a su ritmo?" Options: date only for self-paced · allow both, keep the room.
- **Invariant check** — `closesAt` semantics (UTC end of day) unchanged.

## 4. Keep — works well

- Server-side format/cups lock and `warmup_locked`, independent of UI (`sessions.ts:1009`, `~983`).
- Owner-only authorization on every session action via `requireSessionOwner`; `setReferenceSample` guards the sample's session match (`sessions.ts:~812`).
- `deleteSession` + `detachCoffeeHistoryForSession` nulling FKs before delete in one 30 s transaction (`lib/coffeeHistory.ts`).
- `touchSession` bumping `updatedAt` so cup screens refresh (`sessions.ts:~1036`).
- `planClosesAtChange` no-op for unchanged dates and past-date rejection.
- Reference as display-only with server-enforced pin and ordered rank compaction on removal.
- `getDeleteImpact` listing coffees and their owners (counts shown before commit).
- Sequence-counter rollback of the reference select (`EditSessionForm.tsx` `referenceSeq`).

## 5. Not verified

- RLS exploitability (F-1): curl PostgREST with a staging JWT.
- Offline orphan (F-5): two devices; delete while one holds an unsynced draft.
- Whether `ErrorPanel` or a per-route boundary catches a thrown `session_closed` from add/rename (F-9): run on a closed session.
- Edit-page date shows `toISOString().slice(0,10)` (UTC), while Duplicate stamps `new Date()` (`sessions.ts:~757`): after ~19:00 in UTC-5 the copy may show tomorrow's date, and Guardar rewrites it; check at night in Bogotá/Santiago time.
- Mobile row-action touch size (16 px icons with `p-1.5` in `SessionsTable.tsx:208–222`, ≈28 px): measure on a phone.
- No version/`updatedAt` precondition exists on `updateSession` (last write wins between two owner devices): accepted or not is a product call (asset-admin §7.4).

## 6. Questions for Kim (collected)

- **K-sesiones-1** (F-6) — Si ya catamos una muestra y luego decides que será tu referencia, ¿qué debe pasar con las notas ya dadas? Opciones: se reemplazan con aviso · se guardan aparte · no se puede marcar una vez calificada.
- **K-sesiones-2** (F-7) — En una cata en vivo, una vez que das "Iniciar cata", ¿se pueden cambiar las tazas por muestra, el formato o añadir una muestra nueva? Opciones: todo fijo · solo se pueden añadir muestras · como hoy.
- **K-sesiones-3** (F-11) — Si cancelas una cata ciega antes de revelar, ¿los catadores deben ver qué café era en su historial? Opciones: no, solo "Muestra B" · sí · sin fila de historial.
- **K-sesiones-4** (F-12) — ¿Las catas en vivo llevan fecha de cierre automática o eso es solo para catas a ritmo propio?

## 7. Verification log

F-sesiones-1 — CONFIRMED — Final effective policies in file order: `evals_all` (:47) is replaced at :131-132 by `evals_own` FOR ALL USING cupperId = auth.uid() (no WITH CHECK, so INSERT is checked by the same expression: own cupperId only, NO membership/closed/status condition), plus the `evals_submitted_participant` SELECT policy (:134). `sessions_all` is replaced by `sessions_select` + `sessions_write` FOR ALL createdBy = auth.uid() (:112-114). `samples_all` is replaced by `samples_select` + `samples_write` FOR ALL via owner EXISTS (:119-121). `phys_all` (:51), `ext_all` (:55) and `participants_write` (:146) are unchanged. PHASE 13/14/15/16/17/18/18b/20 contain no policy, GRANT or REVOKE touching these tables (PHASE 18 only drops the invites/profiles reads and revokes function EXECUTE). So no status check exists anywhere: any authenticated user (anonymous guests are `authenticated`) can write own evaluation rows after close and insert one for any sample id, and the owner can UPDATE `cupping_sessions.status`. Correction to the finding: INSERT is limited to cupperId = own uid, so nobody can forge ANOTHER cupper's row; the gap is membership and closed state. Exploitation also needs Supabase's default table grants for `authenticated` (not in the repo); one PostgREST PATCH on staging settles it. The fix must keep the SELECT policies and `is_session_participant` EXECUTE for `authenticated` (PHASE 18b). Related, not duplicate: F-resultados-1 owns the READ-side policies; both belong to one SQL pass. — severity: keep (P1)
F-sesiones-2 — CONFIRMED — `submitSampleEvaluation` (:85) and `submitEvaluation` (:110) have only `requireUser()` and no callers anywhere; `revealSample` (:271) writes `coffeeId` with no closed guard; exclusion and refresh also run after close. The dead exports only touch the caller's OWN evaluation, so their reach equals F-sesiones-1; the live gaps are `revealSample`+`coffeeId` and exclusion (a policy call). — severity: keep (P2; the fix is a cheap delete)
F-sesiones-3 — CONFIRMED — `removeSessionSample` uses its own `findUnique`, no `assertSessionWritable` (`sessions.ts:1115-1140`); the evaluation count is read outside the transaction; physical/extrinsic cascade confirmed (`schema.prisma:247,261`). The race itself needs two tabs. — severity: keep
F-sesiones-4 — CONFIRMED — the `body` prop is never rendered (`DeleteSessionButton.tsx:56-86`); a failed impact load leaves "calculando" and Eliminar disabled; `getDeleteImpact` is at `sessions.ts:637` (not ~620; line corrected in verification). But the shown sentence already says the session and N evaluations "se eliminarán", so users are told what goes; the missing "permanente / no se puede deshacer" is copy friction. — severity: → P3 (copy gap, no loss beyond what the dialog states)
F-sesiones-5 — CONFIRMED — `syncEvaluation` (`offline.ts:39`) throws via `requireSampleMember` (`sessionAuth.ts:104-125`); `useOfflineSync.ts` catch retries then returns "failed"; only "discarded" clears the flag. Whether the badge stays forever depends on `PendingDraftsBadge`; a two-device check settles it. Orphaned offline notes for a deleted session are friction, not server data loss. — severity: → P3
F-sesiones-6 — CONFIRMED — `planReferenceRepin` (`referenceRules.ts:174-200`) rewrites existing evaluations to the pin with no stored original; the edit form calls `setReferenceSample` with no confirmation (`EditSessionForm.tsx:173`). It is the documented "ONE sanctioned server-side rewrite" (comment at :171), so adding a confirmation bends no invariant. — severity: keep
F-sesiones-7 — CONFIRMED — `EditSessionForm.tsx:108,205` sends format/cups whenever the page-load `evalCount` was 0; `updateSession` returns `format_locked` at `sessions.ts:1009` for any request carrying them once an evaluation exists. The lock ignores `startedAt`, while the warm-up lock uses it (`sessions.ts:~980`). — severity: keep
F-sesiones-8 — CONFIRMED — `sessions.ts:775` copies `coffeeId` with no `usableCoffeeWhere`; only `referenceSampleId` is selected (:731) and one `refPosition` is applied (:744, :787). — severity: keep
P3 notes: F-sesiones-9 to F-sesiones-12 were not re-verified in detail; no wrong citations or duplicates spotted.
