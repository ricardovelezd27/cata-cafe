# 08 · Sesión grupal en vivo

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 726–833 · **Domain briefs applied:** `live-collab` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-live-collab (Sonnet 5.5) · **Verification:** done 2026-11-06 (live-collab verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

The owner creates a group session (`createGroupSession`), shares `/join/[token]` as link or QR, and participants (signed-in or anonymous guests) join through `joinViaToken` (`app/actions/community.ts:85`). Newcomers land in `/waiting` until the owner presses «Iniciar cata» (`startSession`, `community.ts:137`, a guarded `updateMany` on `startedAt: null`), then everyone cups in the same `CupClient`; the owner also sees the master panel (counter, invite, close). Participants submit with `submitAllEvaluations` (a group session never auto-closes); the owner closes with `closeSession` → `closeSessionInternal` (`lib/closeSession.ts:39`: one idempotent flip, reveal, history sync, ledgered emails via `after()`). The daily cron only sweeps sessions that have `closesAt` (`app/api/cron/close-expired-sessions/route.ts:29`). Difference from the spec: the board says a participant can open `/cup` before the start; the page now redirects them (`cup/page.tsx:51`), so only the server-action half of that requirement is still open (F-grupal-7).

## 2. Expert bar applied

- **P1/P19/P4 idempotent transitions and one close routine.** Does every transition flip state only where it still applies, and do side effects run only for the caller whose update changed a row? Checked: start, close, cron.
- **P5/P7/P8/P9 lobby authority and bounded links.** Are join rules enforced where the user first meets them, can the host revoke, lock or remove, and what is the late-joiner rule?
- **P10/P13/P14 realtime is a hint.** Does the client refetch on every (re)subscribe and on visibility, pageshow and online, and do polls stand down and back off?
- **P17/P16 host progress and honest state.** Does the counter show cuppers rather than events, and is stale data labelled?
- **P20/P21 closed is read-only; notifications are ledgered.** Are all post-close writes blocked and every send recorded per recipient?
- **Lenses.** Cupping protocol: a score must mean the same on every surface. Offline-native: background resume, WebView storage, deep links.

## 3. Findings

### F-grupal-1 · El disparador de la base penaliza uniformidad/defectos con menos de 5 tazas; la app no · severity: P1 · status: confirms-board(Con 2–4 tazas el trigger penaliza y la vista no)

**Fixed in S8-04** (draft PR, branch `claude/s8-04-scoring-impl`): option 1a: `penaltiesApply` gates deductions at 5 cups in TS and in the trigger (PHASE 23, owner applies, runbook §12); `tests/scoringConsistency.test.ts` ties the two. TODO(A1): Kim has not answered.

- **Problem** — The authoritative SQL aggregate subtracts penalties for any number of cups: `v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups)` with no cup-count guard (`prisma/sql/rls_and_triggers.sql:765-772`). The TypeScript side applies them only `if (cupsPerSample >= 5)` (`lib/scoring.ts:209`), and the results page prefers that recompute (`results/page.tsx:619-624`). Coffee history stores the trigger value: `communityScore = sample.aggregateScore?.communityScore` (`lib/coffeeHistory.ts:54`).
- **Implication** — Scoring correctness. With the wizard default of 2 cups and any cup marked, the session results and the coffee profile / history show different community scores for the same coffee. A teacher cannot reconcile them and the cupper's history is wrong without any signal. The board rates this P2; by the severity rule (scoring correctness) it is P1.
- **Fix** — One penalty rule everywhere: penalties apply only from 5 cups, in SQL and TS. Ship it as a new PHASE block plus a runbook step, then recompute existing aggregates and re-sync history rows for sessions with fewer than 5 cups. **Acceptance:** a 2-cup session with a non-uniform cup shows the same score on results, coffee profile and history; a 5-cup session is unchanged; a repeated recompute is idempotent. **Size:** M.
- **Native** — n/a (server and database only).
- **Confidence** — verified-in-code (the definition at line 710 is the latest in the file; no later override found).
- **Kim?** — no
- **Invariant check** — Touches the trigger-authoritative community score. Allowed: the change aligns SQL to the documented formula, and TS stays display-only.

### F-grupal-2 · Cerrar deja fuera los borradores sin enviar y nadie lo sabe · severity: P2 · status: confirms-board(Cerrar con borradores sin enviar: no cuentan y nadie avisa)

**Fixed in S8-05** (draft PR, branch `claude/s8-05-close-lifecycle-impl`): the close dialog counts cuppers with complete unsent notes and states the rule (`getCloseImpact`); the close email repeats it and tells each affected cupper. Default policy `DRAFT_AT_CLOSE = "exclude"` (Kim C1 b); TODO(S8-05/C1-d) accept-late action not built.

- **Problem** — The close dialog says only «¿Cerrar la sesión? Los resultados quedarán finales.» (`messages/es.json:501`). `closeSessionInternal` never looks at drafts, and history sync reads only `isDraft: false` (`lib/coffeeHistory.ts:28`). After close every write throws `session_closed`, so a participant still typing is moved to results by the page redirect (`cup/page.tsx:80-81`; line corrected in verification) and the offline replay discards their pending draft silently (CLAUDE.md, closed = read-only). The cron has the same blind spot for async sessions.
- **Implication** — Data loss in the most common live moment: the owner closes while two people are on the last sample. Their notes vanish from results, history and the email, and they get no explanation.
- **Fix** — Before the owner confirms, show how many cuppers have unsent work. Apply one decided rule at close (see K-grupal-1), and tell a participant who is moved to results that their unsent notes were or were not counted. **Acceptance:** the dialog shows the draft count; the rule is stated in the dialog and in the close email; a participant redirected at close sees one explanatory notice. **Size:** M.
- **Native** — A backgrounded phone resumes after the close: the notice must show on resume, and the local draft must be kept (not deleted) so the cupper can recover it.
- **Confidence** — verified-in-code for no draft handling and the dialog text; needs-runtime-check for the participant experience (two browsers, owner closes mid-edit).
- **Kim?** — yes: see K-grupal-1.
- **Invariant check** — One close routine and closed = read-only: any auto-submit must live inside `closeSessionInternal`, before the flip, never as a post-close write.

### F-grupal-3 · `/join` no aplica las reglas de `joinViaToken` · severity: P2 · status: confirms-board(/join no aplica las reglas de joinViaToken)

**Fixed in S8-11** (PR pending): pure `evaluateJoin` (`lib/joinRules.ts`) shared by `/join` and `joinViaToken`; closed, expired/revoked, exhausted, entries-closed and invalid each get their own es/en copy and a refused link never offers the anonymous sign-in; owner/member go straight in even with a dead link; non-group tokens are `invalid_input`; the guest form posts through `joinSessionAsGuest` (ActionResult) (T4).

- **Problem** — The page checks only token existence, expiry and seats (`join/[token]/page.tsx:33-36`) and shows one generic invalid-token message. It ignores session status and membership. A visitor to a closed session sees the guest form; `GuestJoinForm` creates an anonymous user (`GuestJoinForm.tsx:41`), then calls the raw `joinViaToken`, which throws `session_closed` (`community.ts:365`; line corrected in verification), and the form shows a generic guest error (`GuestJoinForm.tsx:59`). A member re-opening an exhausted link sees «enlace inválido» even though `joinViaToken` would route them in (`community.ts:363`; line corrected in verification).
- **Implication** — Trust and robustness. Guests arriving late at a QR-led event pile up throwaway users and get no reason; a member whose seat count ran out cannot get back to their own session from the link.
- **Fix** — Evaluate the same rules before rendering: owner or member goes straight to their destination; a newcomer to a closed session sees a specific closed message and no sign-in is attempted; expired and exhausted show their own messages. Route the guest form through an `ActionResult` wrapper like `joinSessionForm`. **Acceptance:** a closed link as visitor creates no anonymous user; a member with an exhausted link lands in `/cup` or `/waiting`; each error has distinct copy in es and en. **Size:** S.
- **Native** — The same decision must run when the link opens through a universal link and when OAuth returns with `next=`.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — Guest scope and the ActionResult contract respected (extends the existing `run()` use in `app/actions/join.ts`).

### F-grupal-4 · El contador «enviados» del dueño cuenta eventos, no catadores · severity: P2 · status: confirms-board(El contador «enviados» del panel maestro cuenta filas, no catadores)

**Fixed in S8-11** (PR pending): numerator = eligible cuppers with EVERY sample submitted, denominator = joined/owner non-excluded; client `Map<cupperId, sampleIds>` re-seeded on refresh, SUBSCRIBED and visibility; label "N de M enviaron todo" (T1).

- **Problem** — The realtime handler does `setSubmittedCount((prev) => prev + 1)` for every evaluation UPDATE with `isDraft === false` (`CupClient.tsx:822`). The state is seeded once from the prop (`CupClient.tsx:391`), so the 30 s `router.refresh()` (`CupClient.tsx:871`; line corrected in verification) never corrects it. The denominator is `session.participants.length`, which includes the owner row and excluded cuppers (`cup/page.tsx:168`), while the numerator counts distinct cuppers (`cup/page.tsx:98-106`; line corrected in verification).
- **Implication** — Trust. The owner decides when to close by this number; it can read «9 / 3» or lag after a missed event, and an unreliable counter pushes owners to close early (see F-grupal-2).
- **Fix** — Track a set of cupper ids from events, and reconcile with the server count on every successful subscribe and on each periodic refresh. Define numerator and denominator over the same population and say which. **Acceptance:** a participant submitting 6 samples moves the counter by 1; autosaves of an already-submitted evaluation do not move it; after a reconnect the number equals the server value. **Size:** S.
- **Native** — Reconcile on `appStateChange` / `visibilitychange` resume, not only on subscribe.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched.

### F-grupal-5 · La sala de espera no se recupera tras bloquear el teléfono · severity: P2 · status: new
**Also fixed in S8-21** — the waiting room has one foreground-resume path (shared `useForegroundResume` with `pageshow`).

**Fixed in S8-11** (PR pending): one `refetchState()` over `getWaitingState` on SUBSCRIBED, visibilitychange, pageshow and online; fallback poll 15 s +/- 3 s (T2).

- **Problem** — The waiting room subscribes once and polls only when the channel status is not `SUBSCRIBED` (`WaitingRoomClient.tsx:277-296`). It never refetches state when the channel becomes subscribed, so an owner start that lands between the server render and the subscription is missed. There is no `visibilitychange`, `pageshow` or `online` handler in the file (grep finds none), and a silently dead socket on a locked iOS phone can keep reporting a healthy status. The 15 s poll has no jitter. The only recovery left is the manual button (`WaitingRoomClient.tsx:316`).
- **Implication** — Robustness. Participants lock their phones while waiting; after the owner starts, some stay on the waiting card and ask the room what to do, which is what the wait screen was meant to avoid. This matters at the QR-event scale in the project memory.
- **Fix** — On every `SUBSCRIBED`, on `visibilitychange` to visible, `pageshow` and `online`, call `getWaitingState` once and act on it; add jitter to the poll. **Acceptance:** start the session while a participant's phone is locked, unlock it, and the participant reaches `/cup` within 3 s without tapping; start during the subscribe gap and the participant still moves. **Size:** S.
- **Native** — Add Capacitor `appStateChange` to the same refetch; the synced warm-up seek already uses `serverNow` and should re-seek on resume.
- **Confidence** — verified-in-code for the missing handlers; needs-runtime-check on a real iPhone for the silent-socket case.
- **Kim?** — no
- **Invariant check** — none touched (`checkSessionStarted` stays boolean for cached bundles).

### F-grupal-6 · Un envío puede llegar después del cierre y hay endpoints sin guarda · severity: P2 · status: confirms-board(Envíos que llegan después del cierre)

- **Status** — Fixed in S8-01 (PR #68): the two dead exports are gone and `submitAllEvaluations` flips drafts with an `updateMany` conditional on the session being open.

- **Problem** — `submitAllEvaluations` checks `assertSessionWritable` first (`community.ts:25`) and then runs an `updateMany` with no status condition (`community.ts:29-36`), so a submit racing a close can land after the flip. Two more exported actions, `submitSampleEvaluation` (`community.ts:85`) and `submitEvaluation` (`community.ts:110`), have no closed guard at all and no caller in `app/`, `components/`, `lib/` or `hooks/` (grep). Each is a public endpoint that flips `isDraft` and re-fires the aggregate trigger. The board rates this P3; I raise it to P2 because it breaks the closed = read-only rule.
- **Implication** — Trust and closed = read-only: after the owner shares final results, a participant can still change the community score, and the history row is not written for that late submit.
- **Fix** — Make the submit itself conditional on an open session, and delete the two unused actions. **Acceptance:** a submit sent after close changes nothing and returns `session_closed`; the two actions no longer exist; a submit racing a close either lands before close and appears in history, or is refused. **Size:** S.
- **Native** — A queued offline submit that replays after close must resolve to a visible «cerrada, no contó» state, not silence.
- **Confidence** — verified-in-code (no call sites found); race is needs-runtime-check.
- **Kim?** — no
- **Invariant check** — Restores closed = read-only; one close routine untouched.

### F-grupal-7 · El inicio no se exige en el servidor para evaluar o enviar · severity: P3 · status: confirms-board(Un participante abre /cup de una sesión en vivo sin iniciar)

**Not in S8-11**: the server-side start check is S8-01 (`assertSessionStarted`, already in the base).

- **Status** — Fixed in S8-01 (PR #68): `assertSessionStarted` in `upsertEvaluation`, `submitAllEvaluations` and the offline replay (`session_not_started`; the replay keeps the draft pending).

- **Problem** — The UI half is fixed: a non-owner is redirected to `/waiting` (`cup/page.tsx:51`). `upsertEvaluation` (`sessions.ts:561-593`) and `submitAllEvaluations` still never read `startedAt`, although `requireSessionMember` already returns it (`lib/sessionAuth.ts:76`).
- **Implication** — Low in practice: only a stale tab or a hand-built request writes before the start. The owner's simultaneous-start control is client-enforced only.
- **Fix** — Refuse writes on a live, unstarted group session for non-owners with a new `session_not_started` code; the offline replay keeps such drafts pending. **Acceptance:** a participant call before start returns `session_not_started` (es/en copy); owner writes are unaffected; async sessions are unaffected. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — Offline replay must keep returning "pending", not "discarded", so the cupper loses nothing.

### F-grupal-8 · Una sesión en vivo olvidada nunca se cierra ni avisa · severity: P3 · status: confirms-board(⚑ sesión en vivo sin fecha de cierre)

**Fixed in S8-05** (draft PR, branch `claude/s8-05-close-lifecycle-impl`): one `live_idle` owner reminder after 12 h of inactivity from the cron, ledgered, never closes (Kim C3 default a).

- **Problem** — The cron selects only `status: "active", closesAt: { lt: now }` (`close-expired-sessions/route.ts:29`); a live session has no `closesAt` and stays active indefinitely. Nothing reminds the owner.
- **Implication** — Provisional results for participants, no coffee history and no email until the owner returns. Nothing is lost while the session stays open, so this is friction, not data loss. Sharpening: a reminder to the owner is safer than an auto-close, which would run into F-grupal-2.
- **Fix** — A reconciliation-based nudge: a daily pass finds live active sessions with no activity for N hours and emails the owner once (ledgered), without closing. **Acceptance:** a session idle past N hours produces one owner reminder; a second cron run sends nothing; closing stops reminders. **Size:** M.
- **Native** — A later push channel would need its own ledger rows.
- **Confidence** — verified-in-code.
- **Kim?** — yes: see K-grupal-2.
- **Invariant check** — One close routine: the nudge never writes `closed`.

### F-grupal-9 · Los enlaces de invitación no se pueden revocar y cada «Invitar» crea uno nuevo · severity: P3 · status: confirms-board(Un enlace filtrado no se puede revocar)

**Fixed in S8-11** (PR pending): `createInviteToken` returns the newest active unexpired invite; "Regenerar enlace" (confirm) deactivates earlier tokens in one transaction (`SessionInvite.active`); `joinViaToken`, `/join`, the print QR and the group page ignore inactive tokens (T5). Needs the unapplied migration (runbook section 18).

- **Problem** — `handleGenerateInvite` calls `createInviteToken(session.id)` with no limits (`CupClient.tsx:1307`), and the action stores `maxUses: null`, `expiresAt: null` when none are passed (`community.ts:162-176`). There is no revoke path.
- **Implication** — A link posted in a public chat stays valid until the session closes; seats cannot be capped after the fact.
- **Fix** — Reuse the current token when opening «Invitar» and add «Regenerar enlace», which expires earlier tokens. **Acceptance:** opening «Invitar» twice shows one token; after «Regenerar» the old link shows the expired message. **Size:** S.
- **Native** — The QR printed for a lab must stay valid until the owner regenerates it.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched.

### F-grupal-10 · No hay regla visible para quien llega tarde ni forma de bloquear o sacar participantes · severity: P3 · status: new

**Fixed in S8-11** (PR pending, C4 default a): `CuppingSession.entriesLocked` + owner-only `setEntriesLocked`; newcomers get `entries_closed`, members re-enter; `/join` tells a latecomer they can cup every sample (T6). Per-sample cut-offs not built: `TODO(C4)`.

- **Problem** — `joinViaToken` admits any newcomer while the session is not closed, before or after the start, with no host lock (`community.ts:126-146`). The owner can exclude a cupper from results (`setParticipantExclusion`, `community.ts:426`) but cannot remove a participant or stop new joins.
- **Implication** — A late joiner who cups only the last two samples enters the average with a partial set, and the owner has no way to stop it except by closing.
- **Fix** — Decide the rule (K-grupal-3), then show it to the latecomer and give the owner a «cerrar entradas» toggle. **Acceptance:** with entries locked a new scan shows a specific message; existing members re-enter; the toggle is owner-only and server-checked. **Size:** M.
- **Native** — Lock state must show identically for app-link and web entry.
- **Confidence** — verified-in-code.
- **Kim?** — yes: see K-grupal-3.
- **Invariant check** — Authorization through `lib/sessionAuth.ts`.

## 4. Keep — works well

- Start and close are guarded, idempotent flips: `startSession` (`community.ts:137`) and `closeSessionInternal` (`lib/closeSession.ts:39`), so side effects run only for the winning caller.
- `joinViaToken` makes the owner and existing members no-ops and enforces `maxUses` by increment-then-check in the transaction (`community.ts:131-146`).
- Close emails are ledgered per recipient and skip already-sent ones (`lib/closeEmail.ts:159-173`); the owner «reenviar» exists (`ResultsClient.tsx:477`).
- Realtime joins with the user's JWT before subscribing (`lib/supabase/realtimeAuth.ts`), and the cup screen has a 30 s safety refresh plus a «live count down» label.
- The cup page redirects non-owners of an unstarted live session to `/waiting` (`cup/page.tsx:51`); the waiting room edge-detects the synced warm-up.
- The cron route is bounded and idempotent (`BATCH = 25`, status filter, `maxDuration = 300`).

## 5. Not verified

- Silent socket death on a locked iPhone (F-grupal-5): two phones, lock one, start from the owner.
- Participant experience when redirected at close with an unsent draft (F-grupal-2): two browsers, close while one is editing.
- Whether `router.refresh()` every 30 s with a 50-person room loads the server acceptably: load test with the QR-event numbers.
- Whether `evaluations` is in the Realtime publication so the owner receives other cuppers' events under RLS: check Supabase Realtime logs in production.
- Whether the SQL file's latest `recompute_aggregate_score` (line 710) is what runs in the single Supabase project: read the live function body in the SQL editor.

## 6. Questions for Kim (collected)

- **K-grupal-1.** Cuando el dueño cierra la cata y alguien todavía tiene una muestra a medias o sin enviar, ¿qué debería pasar con esas notas? (a) contarlas si están completas y avisar; (b) dejarlas fuera y avisar claramente a esa persona; (c) no dejar cerrar hasta que todos envíen o el dueño lo confirme expresamente.
- **K-grupal-2.** Si el dueño olvida cerrar una cata en vivo, ¿cuánto tiempo sin actividad es razonable antes de recordárselo (por ejemplo 6, 12 o 24 horas), y es mejor un recordatorio o cerrarla solos?
- **K-grupal-3.** Si alguien se une cuando la cata ya empezó y las primeras muestras pasaron, ¿puede catar todo igual, solo las que faltan, o no debería entrar? ¿Quieres que el dueño pueda cerrar las entradas?

## 7. Verification log

- F-grupal-1 — CONFIRMED — Reproduced from both sources. Example: 2 cuppers, `cupsPerSample` 2 (wizard default, `NewSessionForm.tsx:274`), both evaluations complete, average raw score 80.00, one cupper taps one cup non-uniform (the grid allows it and only adds a "not scored" note, `CupToggleGrid.tsx:86`; the flags are stored, `lib/evaluation.ts:41`). SQL (`rls_and_triggers.sql:765-772`; the definition at `:710` is the last one in the file): total cups = 2 x 2 = 4, penalty = 1 x 10/4 = 2.50, stored score = ROUND((80 - 2.5) x 4)/4 = 77.50. TS (gate at `scoring.ts:209`, `calcCommunityScore` at `:323-335`): `cupsPerSample` < 5, so non-uniform total = 0 and the score is 80.00. One defective cup instead takes 7.50 off in SQL (30/4) and 0 in TS. So the stored and displayed scores do differ, by 2.50 and 7.50 in these cases. Where each shows: the group results page uses the TS value (`results/page.tsx:197-235`, `:623`); coffee history (`coffeeHistory.ts:54`), the coffee aggregates and the solo results fallback read the stored value. Solo is affected too (individual score 80.00, stored community 75.00 for one flagged cup of two). Caveat: which rule is correct under 5 cups is an open protocol question (`docs/expertise/cupping-protocol.md:154`); the mismatch is real either way, so the Fix direction needs Kim's answer first. — severity: keep (P1, scoring correctness).
- F-grupal-2 — CONFIRMED — No draft handling in `closeSessionInternal` (`lib/closeSession.ts:39-60`), history reads `isDraft: false` (`coffeeHistory.ts:29`), dialog copy at `messages/es.json:501` is as quoted, post-close writes throw. The participant experience still needs a two-browser run. — severity: keep (P2). Owns the core of F-grupal-asincrona-1 (same close routine). The Fix stays inside `closeSessionInternal` before the flip, as the finding says.
- F-grupal-3 — CONFIRMED — The page checks token, expiry and seats only (`join/[token]/page.tsx:33-36`); the guest creates the anonymous user first (`GuestJoinForm.tsx:41`), then `joinViaToken` throws `session_closed` (`community.ts:365`) and the form shows one generic error (`:59`). Signed-in newcomers already get a specific closed message (`page.tsx` `joinErrors`). — severity: keep (P2). Partial duplicate of F-guest-3 (generic guest error, orphan anonymous users): F-guest-3 owns the guest-form half; this file keeps the member-with-exhausted-link half.
- F-grupal-4 — CONFIRMED — The counter increments on every evaluation UPDATE with `isDraft === false` (`CupClient.tsx:822`), including autosaves of already-submitted rows; it is seeded once (`:391`) with no resync from props; the denominator counts all participant rows (`cup/page.tsx:168`) against distinct cuppers. — severity: keep (P2).
- F-grupal-5 — PLAUSIBLE — The missing `visibilitychange`/`pageshow`/`online` handlers and the missing refetch on `SUBSCRIBED` are real (`WaitingRoomClient.tsx:277-296`), and a manual button exists (`:316`). The visible failure needs a start landing in the subscribe gap or a silently dead iOS socket; settle with a locked real-iPhone test. — severity: → P3 (recoverable with the visible button, narrow window) unless that test shows frequent misses.
- F-grupal-6 — CONFIRMED — `submitSampleEvaluation` (`community.ts:85`) and `submitEvaluation` (`:110`) have no closed guard and no callers in app, components, lib, hooks or tests (grep); the check-then-update race in `submitAllEvaluations` is real (`:25-36`). The impact is a member changing their own evaluation through a hand-made request or a millisecond race. — severity: → P3. Duplicate of F-resultados-3 and F-sesiones-2 (same two dead exports): F-sesiones-2 should own the removal; this file keeps the submit-versus-close race.
- F-grupal-7 .. F-grupal-10 (P3) — no wrong citations found.
