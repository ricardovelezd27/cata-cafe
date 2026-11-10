# 07 · Sesión solo

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 659–725 · **Domain briefs applied:** `live-collab` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-live-collab (claude-sonnet-5-5) · **Verification:** done 2026-11-06 (live-collab verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

The owner of a solo session (wizard or express; always `status: "active"` from creation) cups every sample in `CupClient`, with an 800 ms server save and a 500 ms IndexedDB mirror per edit (`CupClient.tsx:1074-1094`, `:1027-1049`). An optional "Notas rápidas" step precedes the explicit submit (`doGoToResults`, `CupClient.tsx:1224-1263`): flush, replay the local queue, refuse while anything is device-only, then `submitAllEvaluations` (`app/actions/community.ts:22-45`). That action flips this user's drafts to submitted (the aggregate trigger fires per row) and calls `maybeAutoCloseSoloSession`, which closes only when the owner has a submitted row for every sample (`community.ts:53-82`), through the one routine `closeSessionInternal` (`lib/closeSession.ts:39-60`: flip, reveal, history sync). The client navigates to `/results` unconditionally after the action returns (`CupClient.tsx:1258`), whether or not the session closed. Spec and code agree; the board's line numbers for the amber indicator have drifted (`:955-976` is now `:1051-1072`).

## 2. Expert bar applied

- **Close is one idempotent routine, and retrying a failed close must converge** (live-collab P1, P4, P19; checklist 2, 4, 22). Asked: after a partial failure, does a second call finish the job?
- **Closed means read-only, and any edit of submitted data recomputes results** (P20; checklist 23, 24). Asked: can a submitted row change while the aggregate and history keep the old value?
- **Be honest about save state** (P16; offline-native P4). Asked: does "pending" survive until every module is confirmed on the server?
- **Submitted data is never silently overwritten; conflicts are surfaced** (offline-native P3; live-collab P23).
- **Cupping protocol lens** (cupping-protocol P4, P5, P17): a score needs all eight affective ratings; an incomplete form should not become a finished cupping without the cupper knowing.
- **Native lens** (offline-native P9, P14): drafts must survive WebView storage eviction and background resume.

## 3. Findings

### F-solo-1 · A close that fails after the status flip cannot be retried · severity: P2 · status: confirms-board(El sync de historial lanza después del flip a «closed»)

- **Problem** — `closeSessionInternal` flips to `closed` first (`lib/closeSession.ts:39-42`), then reveals and syncs history (`:55-60`). If either throws, the session is already closed. For solo the retry path is worse than the board says: the cupper sees `submitError` and presses submit again, but `submitAllEvaluations` starts with `assertSessionWritable(await requireSessionMember(...))` (`community.ts:25`), which now throws `session_closed` before reaching `closeSessionInternal`. A reload goes to `/results` (`cup/page.tsx:80-81`; line corrected in verification). Nothing re-runs `syncCoffeeHistoryForSession`, and the cron only selects `status: "active"` (`close-expired-sessions/route.ts:29`).
- **Implication** — Results work (they read live evaluations) but the coffee never reaches the cupper's profile, coffee page or dashboard numbers. Silent and permanent: robustness plus trust.
- **Fix** — Make close recoverable: either flip, reveal and history sync commit together, or a "closed but history missing" session is detected and the sync re-run (idempotent upserts) on the next close call, results open or a reconciliation pass. A repeat close on a fully synced session stays a no-op. **Acceptance:** (1) force the sync to fail once after the flip, then submit again or open results: history rows exist and status stays closed; (2) repeat close on a healthy session writes nothing new; (3) group sessions and the cron get the same repair. **Size:** M.
- **Native** — n/a (server side); the client must not show a second submit's `session_closed` as its own failure.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — brushes "one close routine" and "closed = read-only": the repair lives inside `closeSessionInternal`, so there is still no second writer of `status: "closed"`.

### F-solo-2 · Editing a submitted evaluation leaves the aggregate, and then the history score, stale · severity: P2 · status: confirms-board(Editar una evaluación ya enviada no recalcula el agregado)

- **Problem** — The trigger is `AFTER INSERT OR UPDATE OF "isDraft"` (`prisma/sql/rls_and_triggers.sql:264-268`). `upsertEvaluation`'s update path writes `update: { sessionId, ...fields }` (`app/actions/sessions.ts:609`), never `isDraft`, so a save on a submitted row does not refire it. Solo route: submit a partial set, land on results with the session still active, press "Volver a catar" (rendered while not closed, `ResultsClient.tsx:581`), edit sample A (already submitted), submit the rest. The final `updateMany` only touches `isDraft: true` rows (`community.ts:29-36`), so A's aggregate is never recomputed, yet `syncCoffeeHistoryForSession` stores `aggregateScore.communityScore` (`coffeeHistory.ts:54`) beside the fresh `individualScore`. The offline path answers `conflict` for the same edit (`offline.ts:60-62`).
- **Implication** — Two different scores for one cupping in history and on the coffee page, when for a solo session they must be identical. Scoring correctness plus trust.
- **Fix** — One rule for both write paths: an edit of a submitted row refreshes the aggregate; close recomputes aggregates before writing history; the owner's own offline edit applies instead of conflicting. Draft saves do not fire it. **Acceptance:** edit after partial submit, then close: history `communityScore` equals `individualScore` for solo; offline replay of the same edit stores the same values; draft saves add no trigger cost. **Size:** M.
- **Native** — the replay change must hold after a WebView resume (draft replayed once, not twice).
- **Confidence** — verified-in-code (confirm the history numbers on a dev DB).
- **Kim?** — no.
- **Invariant check** — the trigger stays authoritative; scoring inputs stay server-derived.

### F-solo-3 · "Continuar de todos modos" turns a half-filled cupping into either an irreversible close or a silent non-close · severity: P2 · status: new

- **Problem** — The submit guard lists gaps but lets the cupper continue (`CupClient.tsx:1267-1300`). `submitAllEvaluations` has no completeness check and submits every draft row (`community.ts:29-36`). Case A: every sample has a row (even with blank quality) so `submittedCount >= sampleCount` (`:77`) and the session closes, reveals and writes history; there is no reopen. Case B: a sample was never touched, so it has no row, `:77` returns early, the session stays active, and the client still navigates to results (`CupClient.tsx:1258`) without saying nothing closed.
- **Implication** — In A the cupper loses the chance to finish a sample after tapping through a warning; in B they believe the cupping is done while the coffee is missing from their history. Same click, two unexplained outcomes.
- **Fix** — State the outcome before submit ("esto cierra la cata y ya no se podrá editar") versus what remains open; after a non-closing submit, show on results an open-session notice "faltan N muestras · seguir catando" linking to `/cup`. **Acceptance:** guard copy differs for will-close and will-stay-open; case B results page shows the notice; case A needs an explicit irreversibility confirmation. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes: K-solo-1.
- **Invariant check** — none touched (solo auto-close rule unchanged; messaging only). Option (b) in K-solo-1 would bend "partial submit keeps the session active" only in wording, not in logic.

### F-solo-4 · Incomplete and descriptive-only solo sessions store a community score of 0.00 in history · severity: P3 · status: new

- **Problem** — The trigger writes an aggregate row for any submitted evaluation; with no "affective complete" evaluation the average is null and the score becomes `GREATEST(0, … COALESCE(v_avg_raw,0) …)` = 0 (`rls_and_triggers.sql:776`; `is_affective_complete` at `:544-555`). A descriptive-only session reads `combinedData`, which is empty, so it is always 0. `syncCoffeeHistoryForSession` copies `aggregateScore?.communityScore ?? null` (`coffeeHistory.ts:54`), so 0 is stored, and `ScorePill` shows "—" only for `null` (`components/ui/Badge.tsx:82`).
- **Implication** — Profile history and coffee pages can show "0.00" in the lowest colour band for a cupping that never had a quality score. Trust.
- **Fix** — History keeps no community score when no complete evaluation contributed or the format has no quality rating. **Acceptance:** close a descriptive-only solo session: stored `communityScore` is null and the pill shows "—". **Size:** S.
- **Native** — n/a.
- **Confidence** — needs-runtime-check (close one on a dev DB and read `user_coffee_history`).
- **Kim?** — no.
- **Invariant check** — trigger stays authoritative; only what history copies changes.

### F-solo-5 · A good save of one sample clears the amber "pendiente" while another sample is still device-only · severity: P3 · status: confirms-board(Un guardado correcto de otra muestra borra el aviso ámbar)

- **Problem** — `persist` calls `setHasPending(false)` and `setSaveStatus("saved")` on any synced flush (`CupClient.tsx:1063-1066`) instead of reading the durable count (`countLocalPending`, `:952-962`).
- **Implication** — Pending sample A looks saved once B syncs, and the leave guard shows its plain body, so the cupper can walk away believing everything is on the server. Final submit stays protected (`:1243-1250`). Trust, mild data-loss risk.
- **Fix** — Derive indicator and leave-guard copy from the local pending count after each flush. **Acceptance:** A pending and B synced stays amber; it clears only after A syncs; leave guard uses the pending body meanwhile. **Size:** S.
- **Native** — the count comes from IndexedDB, which a WebView can evict (offline-native P9); the storage-unavailable banner must still show.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — enforces the "never green for a device-only write" rule.

### F-solo-6 · `submitAllEvaluations` throws instead of returning a result, so a double submit reads as a failure · severity: P3 · status: new
**Fixed in S8-10** (PR pending): `submitAllEvaluations` returns `ActionResult<{ closed, submitted }>`; a second submit after the solo auto-close is the final state (T11).

- **Problem** — The action has bare throw paths (`community.ts:22-25`) though it is called interactively; the client catch shows a generic `submitError` (`CupClient.tsx:1259-1262`). Submitting from two tabs or devices, or tapping twice after a slow response, makes the second call throw `session_closed` even though the first succeeded. Live-collab P1 asks a repeat to report the final state.
- **Implication** — An error message on a cupping that is closed and saved. Confusing, not lossy.
- **Fix** — Return `ActionResult` with `{ closed, submitted }`; for the owner treat `session_closed` as success-with-final-state and route to results. **Acceptance:** two submits in a row both land on results with no error; a partial submit returns `closed: false`. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — follows the Server Action Contract (`run()` / `ActionResult`).

## 4. Keep — works well

- Server derives module key and cups from the session row, pins the reference, never trusts client scoring: `app/actions/sessions.ts` `upsertEvaluation`, `app/actions/offline.ts`.
- Submit refuses while anything is device-only and replays the queue once first: `CupClient.tsx:1236-1252`.
- Single-slot save eviction so edits on two samples within 800 ms are not lost: `CupClient.tsx:1034-1048`, `:1079-1093`.
- Closed-while-offline replay returns `discarded`, clearing pending instead of looping: `offline.ts:44-48`; `hooks/useOfflineSync.ts` replay handling.
- Idempotent flip (`updateMany where status != closed`), one close routine for owner, solo and cron: `lib/closeSession.ts:36-50`.
- Replay backoff with jitter, bounded to 3 attempts: `hooks/useOfflineSync.ts` `backoffDelay`.
- Closed sessions redirect from `/cup` to results and "Volver a catar" is hidden when closed: `cup/page.tsx:73-75`, `ResultsClient.tsx:581`.

## 5. Not verified

- Race between an in-flight `upsertEvaluation` (started by slot eviction, `CupClient.tsx:1085-1088`) and `submitAllEvaluations`: a first-ever save landing after the flip would create a draft row and block the auto-close. Verify with a throttled-network, two-sample fast submit.
- `flushSave` turns every server error into local "pending" (`CupClient.tsx:916-921`), including a lapsed login or invalid data; whether the cupper can then ever submit (replay retries 3 times, then `failed`, `submitBlocked`) needs a run with an expired session cookie.
- `ScorePill` with 0 and the history pages for a descriptive-only solo close (F-solo-4): needs a DB.
- Abandoned solo sessions (never submitted) stay `active` forever (checklist 30); impact looks limited to list clutter, not checked against dashboard counts.
- IndexedDB eviction on iOS after inactivity (offline-native P9): needs a device.

## 6. Questions for Kim (collected)

- **K-solo-1** — Cuando un catador termina su cata solo y deja alguna muestra sin puntuar del todo (por ejemplo sin las calificaciones de calidad), ¿debe dejarle cerrar la cata igual o debe obligarle a completar las muestras? Opciones: (a) permitir cerrar y dejar esas muestras sin puntaje; (b) permitir enviar pero mantener la cata abierta hasta completar; (c) exigir todo antes de enviar. Y si cierra con huecos, ¿necesita poder corregir un puntaje después de cerrar?

## 7. Verification log

- F-solo-1 — PLAUSIBLE — Code confirms the flip at `lib/closeSession.ts:39-42`, the sync after it with no repair, and `submitAllEvaluations` throwing `session_closed` on retry (`community.ts:25`); the cron selects `status: "active"` only (`route.ts:29`). Settled by forcing `syncCoffeeHistoryForSession` to throw once. — severity: keep (P2). Same defect as F-grupal-asincrona-7; this file owns it.
- F-solo-2 — CONFIRMED — `upsertEvaluation` update (`sessions.ts:609`) never writes `isDraft`; the trigger is `UPDATE OF "isDraft"` (`rls_and_triggers.sql:264-268`); history copies the stored aggregate (`coffeeHistory.ts:54`). The offline `force` replay also skips the trigger (header of `offline.ts`). Group results are unaffected (TS recompute, `results/page.tsx:197-235`); solo falls back to the stored row. — severity: keep (P2).
- F-solo-3 — CONFIRMED — The guard lets the cupper through (`CupClient.tsx:1272-1300`), `submitAllEvaluations` has no completeness check, and auto-close needs a row per sample (`community.ts:77`). The existing guard copy (`messages/es.json:329`, button "Enviar de todos modos") says the score is calculated without the gaps but never says the session closes. The fix is messaging only and the cupper was warned of gaps — severity: → P3. Related: F-express-1 (case B, never closes).
- F-solo-4 / F-solo-5 / F-solo-6 (P3) — no wrong citations found. F-solo-4 is a sibling of F-grupal-1: the same stored trigger value reaches history. Note for F-grupal-1: a solo session with fewer than 5 cups and a flagged cup stores a community score below the individual score.
