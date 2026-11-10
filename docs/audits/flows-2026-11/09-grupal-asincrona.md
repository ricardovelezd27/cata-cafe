# 09 · Sesión grupal asíncrona

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 834–890 · **Domain briefs applied:** `live-collab` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-live-collab (claude-sonnet) · **Verification:** done 2026-11-06 (live-collab verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

An owner turns on "sesión grupal" in the wizard and picks a closing date; `validateSessionMeta` stores the END of that day in UTC and `createGroupSession` sets `isAsync = closesAt !== null` (`app/actions/sessions.ts:496-498`). Invitees join by link (`joinViaToken`) and cup at their own pace. Nothing ever starts the session: in the current wizard the primary button goes to `/cup` without `startSession`, and "Iniciar ahora" is hidden when a date is set (`NewSessionForm.tsx:623` `{!closesAt && (`), so for async sessions `startedAt` stays null. The only closers are the daily cron (`vercel.json` `0 6 * * *` → `closeSessionInternal`) or the owner's manual close. **Spec vs code:** the spec says wizard step 2 "Siguiente" calls `startSession` for async sessions; it no longer does. The async waiting room is therefore the normal list entry for participants, not a rare one (F-grupal-asincrona-5).

## 2. Expert bar applied

- **P4/P19 · scheduled jobs are best-effort; close is one idempotent routine.** Does the cron leave a half-closed session with no repair path? Is a missed or truncated run visible?
- **P20 · closed means read-only, with a defined cut-over.** Does "closed for the user" switch at the same instant for writes, joins and results?
- **P16/P23 · honest save state and multi-device.** Is the participant told what happens to unsent work at the deadline? Is a dropped local draft shown as "saved"?
- **P6/P8 · the participant sees what is expected of them.** Does a cupper know the deadline?
- **Cupping-protocol lens · blind integrity.** Can a cupper see group scores before they have cupped?
- **Offline lens.** What happens to a phone that was offline over the deadline?

## 3. Findings

### F-grupal-asincrona-1 · Unsent evaluations are silently dropped when the session closes · severity: P1 · status: new

- **Problem** — Community scores, results and coffee history only read `isDraft: false` rows (`lib/coffeeHistory.ts` `evaluations: { where: { isDraft: false } }`; the aggregate trigger fires on `isDraft=false`). Drafts become final only through `submitAllEvaluations` (`app/actions/community.ts:29-35`), a participant action. `closeSessionInternal` (`lib/closeSession.ts:38-60`) flips status, reveals and syncs history but never promotes drafts, and after the flip every write throws `session_closed`. In an async session people cup over days; a cupper who scored every sample but did not press the final submit loses it at the cron. The offline path then reports the draft as handled: `syncEvaluation` returns `"discarded"` (`app/actions/offline.ts:48`) and `useOfflineSync` maps it to `"synced"` (`hooks/useOfflineSync.ts:83` `return res.status === "discarded" ? "synced" : res.status`), so the pending badge turns green for work that was thrown away.
- **Implication** — Data loss and trust. A participant opens the results email and their own evaluation is absent from the group; the owner's average silently excludes them. Worst in async because nobody is in the room to say "send it now".
- **Fix** — Decide with Kim what counts at the deadline (K-grupal-asincrona-1). Whatever the rule, the participant is told before it happens (deadline and reminder, F-3) and, when work is discarded, told afterwards instead of seeing green "synced". **Acceptance:** (1) a complete-but-unsent draft at cron close follows the agreed rule and the cupper sees which of their samples counted; (2) an offline draft discarded by close shows a distinct "la sesión cerró; esta evaluación no se envió" notice, never the green saved state; (3) the rule lives inside the one close routine, not per caller; (4) closing twice changes nothing. **Size:** M.
- **Native** — The notice must survive background resume and an IndexedDB draft that is kept or cleared; a deadline reminder would be a local notification in a shell (not available in the PWA).
- **Confidence** — verified-in-code (drafts never promoted in `lib/closeSession.ts`); needs-runtime-check for what the cupper sees on `/results` after close (seed a draft, run the cron locally).
- **Kim?** — yes (K-grupal-asincrona-1).
- **Invariant check** — touches "one close routine" and "closed = read-only": any promotion must live in `closeSessionInternal` and must not allow edits after close. Scoring stays server-derived.

### F-grupal-asincrona-2 · After the deadline the session stays writable and joinable until the cron runs · severity: P2 · status: confirms-board(Pasada la fecha de cierre la sesión sigue escribible hasta el cron)

- **Status** — Fixed in S8-01 (PR #68): `closesAt` is now a write cutoff (`isSessionExpired`) in `assertSessionWritable`, `joinViaToken`, the `/cup` and `/waiting` redirects, `sessionHref`, the offline replay and the results page.

- **Problem** — `assertSessionWritable` checks status only (`lib/sessionState.ts:13-15` `if (row.status === "closed") throw`); `joinViaToken` checks `session.status === "closed"` only (`app/actions/community.ts:348,365`) and does not select `closesAt`; `cup/page.tsx` redirects on status only. Meanwhile results already treat `closesAt < now` as "open to everyone" (`results/page.tsx:130`, `lib/sessionState.ts:32`). Between 23:59:59 UTC and the next 06:00 UTC run (longer if a run is missed; Vercel does not retry) cuppers can still submit and newcomers join while participants already see group results.
- **Implication** — Robustness and blind integrity: someone who sees community scores can still submit; late evaluations change aggregates after results were shown; the deadline is soft by hours or a day.
- **Fix** — One shared "is expired" rule (closed OR `closesAt` passed) for writes, join, cup redirect and results, so the cut-over is one instant; the cron stays the finalizer. **Acceptance:** `upsertEvaluation`, `submitAllEvaluations` and `joinViaToken` (newcomer) after `closesAt` return `session_closed` with status still `active`; `/cup` redirects to `/results` at the instant results open; offline replay answers `discarded` with the F-1 notice; vitest covers the boundary. **Size:** S.
- **Native** — A phone offline across the deadline gets the F-1 notice on reconnect; use server time (as the warm-up does with `serverNow`) to avoid local-clock disputes.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — extends `assertSessionWritable` rather than bending it; status is still flipped only by `closeSessionInternal`.

### F-grupal-asincrona-3 · Participants never see the deadline · severity: P2 · status: new

- **Problem** — `closesAt` is read only by the wizard, the edit form, results, the participant-summary route and the cron (grep over `app lib components`). It is not selected or shown in `cup/page.tsx`, `waiting/page.tsx`, the join page or the sessions list; the async waiting copy only says "a tu propio ritmo" (`messages/es.json:361`). The owner-side hint explains the "madrugada siguiente" (`es.json:269`) but that never reaches invitees.
- **Implication** — Trust and data loss (feeds F-1): a participant cannot know "tienes hasta el jueves"; the first signal is the close email. They also cannot see that the owner moved or removed the date.
- **Fix** — Show the deadline in the viewer's local time on the join confirmation, the async waiting screen, the cup header and the list row; reflect owner edits; stronger state in the last 24 h. **Acceptance:** an invitee sees the date on join and on `/cup`; an edit in `/edit` appears on next open or live; no date → no banner. **Size:** M.
- **Native** — Format in device locale/timezone.
- **Confidence** — verified-in-code (absence); needs-runtime-check for the visual.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-grupal-asincrona-4 · The closing date is a UTC day, not the owner's day · severity: P2 · status: confirms-board(La fecha de cierre es un día UTC, no el día local del dueño)

- **Problem** — `dateOnlyEndOfDay` appends `T23:59:59.999Z` (`lib/validate.ts:79`; line corrected in verification); the picker `min` and the session-date default use `new Date().toISOString().slice(0, 10)` (`NewSessionForm.tsx:271,1220`; `EditSessionForm.tsx:414` `min={utcDateString()}`); `/edit` reads the stored date back with `.toISOString().slice(0, 10)` (`edit/page.tsx:130`). In UTC−5 "cierra hoy" expires at 18:59 local and after 19:00 today cannot be picked. The hint never says UTC. Board line numbers (266, 1195) have shifted to 271 and 1220.
- **Implication** — Wrong behaviour for the Latin-American core audience (Colombia, Chile, Peru): sessions expire hours before the owner expects, mid-evening.
- **Fix** — Interpret the date in the owner's IANA zone (sent with the form, stored with the session), state the exact local deadline in the UI, and use one zone-aware helper for creation, edit and `planClosesAtChange`. **Acceptance:** a Bogotá owner picking today at 20:00 is accepted and closes after 23:59 local; default date = local date; vitest covers UTC−5, UTC−3, UTC+1; the `/edit` round trip shows the day the owner picked. **Size:** M.
- **Native** — Store the zone name, not an offset; the WebView `Intl` zone can differ from the OS setting.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — keeps `closesAt` semantics (end of day, cron D+1); update `docs/flows.md` and the CLAUDE.md `closesAt` note in the same PR.

### F-grupal-asincrona-5 · Unstarted async sessions go to a waiting room from the list, to `/cup` from the link · severity: P3 · status: confirms-board(Sesión asíncrona sin iniciar enrutada a la sala de espera)

- **Problem** — `sessionHref` has no `isAsync` input and routes any unstarted group session for a non-owner to `/waiting` (`lib/sessionRouting.ts:24`; line corrected in verification `if (s.isGroup && !s.startedAt && !ctx.isOwner)`), while `joinViaToken` and `cup/page.tsx:90` exempt async (`community.ts:351`). Because async sessions are never started (section 1), this is every async session, not the edge case the board describes. The waiting page then shows an extra entry button (`WaitingRoomClient.tsx:311-313`).
- **Implication** — Friction and an inconsistent first impression: the same session opens differently from the link and from the list.
- **Fix** — Add `isAsync` to the routing input; async goes to `/cup`, `/waiting` stays for live unstarted sessions. **Acceptance:** list, dashboard, profile and group page land on `/cup` for async; live unstarted still waits; vitest matrix over (isGroup, isAsync, startedAt, isOwner). **Size:** S.
- **Native** — A deep link and an in-app tap resolve to the same screen.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — "all session links go through `sessionHref()`" respected.

### ~~F-grupal-asincrona-6 · Group results open when "everyone who has joined so far" has submitted · severity: P2 · status: new~~

> REJECTED in verification: the claimed harm (a not-yet-cupped invitee reading the community score first) cannot happen. Only the owner and participant rows can open `/results` (`results/page.tsx:58`), and any joined participant who has not submitted keeps `allSubmitted` false (`results/page.tsx:129`), so they stay locked out; not-yet-joined invitees cannot open the page at all. What remains is cosmetic: results appear and vanish as people join, and a cupper counts as submitted after one sample (`distinct: ["cupperId"]`, `cup/page.tsx:98-106`). That is P3 friction, not a blind-integrity loss.

- **Problem** — `allSubmitted = totalParticipants > 0 && submittedCupperCount >= totalParticipants`, where participants are only those who already joined, owner included (`results/page.tsx:128-129`; same in `participant-summary/route.ts:102`). `canViewGroupResults` opens community results to every participant on that condition (`lib/sessionState.ts:32`). In an async session invitees arrive over days: owner plus the first joiner submitting is enough to expose scores to the group, and a new joiner flips it back to hidden.
- **Implication** — Blind integrity and trust: someone who has not cupped yet can open `/results` and read the community score first; results appear and vanish as people join.
- **Fix** — For async sessions, group results depend on the deadline or the owner's close (plus the viewer's own submission), not on "all joined so far"; keep the current rule for live sessions. **Acceptance:** with owner + 1 joiner submitted and a third invitee not yet joined, the third cannot see group scores; at `closesAt` or owner close everyone can; live behaviour unchanged; page and PDF routes agree. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code for the rule; inferred that a non-submitter can reach `/results` by URL or tab (check with a second user).
- **Kim?** — yes (K-grupal-asincrona-2).
- **Invariant check** — `canViewGroupResults` stays the single source for page and routes.

### F-grupal-asincrona-7 · A failed cron close is never retried and nobody is told · severity: P2 · status: new

- **Problem** — `closeSessionInternal` flips `status` first, then reveals, syncs history and emails (`lib/closeSession.ts:38-60`); the cron selects only `status: "active"` (`route.ts:29`). If `syncCoffeeHistoryForSession` throws after the flip, the cron puts `error` in its JSON response and moves on; the session is closed, history rows are missing, and the next run no longer sees it. No one reads that response (no alert). Emails run inline (`emails: "await"`) for up to 25 sessions within `maxDuration = 300` (`route.ts:14`, batch size `:16`; lines corrected in verification); `truncated` is returned but only the next day's run continues.
- **Implication** — Robustness: silently missing coffee history for a session's cuppers; a slow day delays closes by 24 h. Low frequency, hard to notice.
- **Fix** — Make post-flip steps re-runnable by reconciliation: the cron also finds recently closed sessions whose history or email ledger is incomplete and finishes them, and it logs an error-level line that log search can alert on. **Acceptance:** forcing the history sync to throw leaves the session closed and the next run completes the missing rows once; a truncated run is continued without a day's gap or at least logged; a double run creates no duplicate rows or emails. **Size:** M.
- **Native** — n/a (server).
- **Confidence** — needs-runtime-check (throw inside `syncCoffeeHistoryForSession` locally; time 25 sessions with PDF renders on a Vercel preview).
- **Kim?** — no.
- **Invariant check** — stays inside `lib/closeSession.ts`; nothing else writes `status: closed`.

## 4. Keep — works well

- Idempotent close: `updateMany where status != closed` plus ledgered close emails (`lib/closeSession.ts:38-47`).
- Cron contract: 503 without `CRON_SECRET`, 401 on a wrong bearer, bounded batch, `truncated` flag (`app/api/cron/close-expired-sessions/route.ts:20-62`).
- End-of-day `closesAt` (not 00:00 UTC) and `planClosesAtChange`: unchanged value is a no-op, clearing returns to a live session (`lib/sessionState.ts:55-74`).
- `joinViaToken` bounds seats inside the transaction; owner or existing member re-opening is a no-op (`app/actions/community.ts:344-390`).
- Offline replay answers `discarded` instead of retrying forever on a closed session (`app/actions/offline.ts:48`); F-1 must extend this pattern, not remove it.
- Async sessions skip warm-up start and "Iniciar cata" (`CupClient.tsx:1514`; `startWarmup` rejects `isAsync`).

## 5. Not verified

- What a cupper sees on `/results` for their own unsent draft after close: seed a draft, call the cron route locally with `CRON_SECRET`.
- Whether a non-submitter can reach group results before the deadline (F-6): two accounts on a dev session.
- Cron behaviour at 25 sessions with PDF renders inside 300 s: Vercel preview run.
- Close emails for async participants who joined days apart or are guests (`skipped`): ledger query on a real session.
- Late-join policy (joining in the last hour): no rule exists in code; product call.
- Idempotency of `syncCoffeeHistoryForSession` when re-run by a repair job: read only partially.

## 6. Questions for Kim (collected)

- **K-grupal-asincrona-1.** En una cata asíncrona, una persona calificó todas las muestras pero no pulsó "Enviar" y llega la fecha de cierre. ¿Qué debe pasar? (a) Cuenta lo que calificó si está completo; (b) cuenta solo lo enviado y avisamos el día antes; (c) cuenta solo lo enviado y lo demás se descarta con un aviso claro después. Nuestra inclinación es (b), pero depende de cómo lo quiera un catador.
- **K-grupal-asincrona-2.** En una cata asíncrona donde los invitados se suman en distintos días, ¿cuándo deben ver todos el puntaje del grupo? (a) Solo al cierre (fecha o dueño); (b) cuando cada uno haya enviado lo suyo, aunque otros no hayan catado aún; (c) el dueño decide. Queremos evitar que alguien vea el puntaje antes de catar.

## 7. Verification log

- F-grupal-asincrona-1 — CONFIRMED — The close never promotes drafts (`lib/closeSession.ts:38-60`), history and the aggregate read only `isDraft: false`, offline replay answers `discarded` (`offline.ts:48`) and `useOfflineSync.ts:83` maps it to green `synced`. The data is not destroyed (draft rows stay in the database) and the cupper never pressed the final submit, so this is lost-from-results, not erased. — severity: → P2 (consistent with F-grupal-2, the same close routine). Core is a duplicate of F-grupal-2 (owner); the "discarded shown as green synced" part is unique to this file and is the sharper defect.
- F-grupal-asincrona-2 — CONFIRMED — `assertSessionWritable` checks status only (`sessionState.ts:13-15`); `joinViaToken` and `/cup` check status only; results open on `closesAt < now` (`results/page.tsx:130`, `sessionState.ts:32`); the cron runs at 06:00 UTC (`vercel.json`). So results are visible to everyone while submits are still accepted until the next cron. — severity: keep (P2).
- F-grupal-asincrona-3 — CONFIRMED — `closesAt` is not read in the cup, waiting or join pages or the list (file list from grep over app, lib, components). — severity: keep (P2).
- F-grupal-asincrona-4 — CONFIRMED — `dateOnlyEndOfDay` builds `T23:59:59.999Z` (`validate.ts:79`); the picker min and the round trip are UTC-based (`NewSessionForm.tsx:271,1220`, `EditSessionForm.tsx:71,414`, `edit/page.tsx:130`). Nuance the finding omits: the status flip happens at the 06:00 UTC cron (about 01:00 in Bogota), so writes stay open after the local evening cutoff; the early moment is when results open (F-2). — severity: keep (P2).
- F-grupal-asincrona-5 (P3) — citation corrected: the routing line is `sessionRouting.ts:24`.
- F-grupal-asincrona-6 — REJECTED — see the note under the heading. — severity: → P3 if kept as friction only.
- F-grupal-asincrona-7 — PLAUSIBLE — Flip first, then sync; the cron selects active only (`route.ts:29`); the results JSON is returned but nothing retries. Whether `syncCoffeeHistoryForSession` throws is runtime; settle by forcing a throw locally. — severity: keep (P2). Duplicate of F-solo-1 (owner); this file adds only the cron truncation and no-alert angle.
