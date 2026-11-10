---
domain: live-collab
researched: 2026-11-06
model: claude-sonnet
flows: [Sesión solo, Sesión grupal en vivo, Sesión grupal asíncrona]
---

# Live collaboration: host/participant sessions and their lifecycle

## 1. Scope

Covers the lifecycle of a hosted session (created, lobby, running, closed), lobby/join UX, realtime delivery and recovery on flaky phone networks, host progress visibility, close semantics, notification ledgering, and multi-device/guest identity. It leaves scoring maths and cupping protocol to `cupping-protocol`, auth mechanics to `auth-identity`, and draft-queue internals to `offline-native`. Source-quality note: official Kahoot, Zoom, Meet and Mentimeter pages were not retrievable; lobby claims rest on secondary university/IT mirrors and are marked "(secondary)". Claims marked "inference" are the researcher's, not a source's.

## 2. Principles

**P1. Every lifecycle transition is a guarded, idempotent state change.** Express each transition as "set state B where state is A" so a double click, retry or concurrent caller is a no-op and the response reports the final state. Stripe's design rests on the server recognising a retried operation and returning the earlier outcome; clients retry until verified success so both sides converge. Source: Stripe, idempotency (https://stripe.com/blog/idempotency).

**P2. Idempotency needs a stable key; the same key with a different payload is an error.** Resend keeps keys 24 h, returns the original response for a duplicate, answers 409 for a changed payload and 409 while the first request is still in flight. Use the same shape for start and close (natural key = session id + transition). Source: Resend docs (https://resend.com/docs/dashboard/emails/idempotency-keys).

**P3. Treat delivery as at-least-once and dedupe at the consumer.** Webhooks and serverless triggers are at-least-once; effectively-once comes from a consumer that atomically processes and records that it did. Source: Ably (https://ably.com/blog/achieving-exactly-once-message-processing-with-ably).

**P4. Scheduled jobs are best-effort: they can miss a run and repeat one, so make them reconciliation-based.** Vercel states cron delivery is best effort, may invoke the same run more than once, does not retry failures, and can overlap runs; it advises idempotent operations ("set status", not "increment"), state checks, locks, and processing all outstanding work since the last success. A close-expired job should be "close every overdue unclosed session", never "yesterday's". Source: Vercel, Managing Cron Jobs, 2026 (https://vercel.com/docs/cron-jobs/manage-cron-jobs).

**P5. Authority over transitions is explicit and server-checked.** Waiting-room products give the host (and delegated co-hosts) admit/remove powers; participants cannot advance the session. Enforce per transition on the server (start: host; close: host or system job; submit: member). Source: Zoom waiting-room guides (secondary) (https://it.tufts.edu/guides/zoom-audio-and-virtual-conferencing/waiting-rooms).

**P6. The lobby says what is happening and what the participant can do.** Zoom shows a plain "wait for the host to admit you" message; participants cannot interact with each other; the host can message them. A waiting screen should show session name, host, not-started status, the participant's own identity, and live-connection state. Sources: Brown IT Zoom guide (secondary) (https://ithelp.brown.edu/kb/articles/using-the-waiting-room-in-zoom-web-conferencing); NN/g (https://www.nngroup.com/articles/visibility-system-status/).

**P7. Host lobby controls: roster, remove before start, lock new joins.** Kahoot lets the host kick a player by name (only before play), lock the game against further joins (toggleable during play), and offers join-gate options (player identifier, two-step join). Zoom distinguishes permanent removal from sending back to the waiting room. Source: Kahoot live game settings (third-party mirror, secondary) (https://z3n-irynaparahailo.zendesk.com/hc/en-us/articles/15168264775313-Live-game-settings); Zoom guides above.

**P8. Late joiners have a defined, visible policy.** Whether joining after start is allowed, and what a latecomer sees, is a deliberate rule, with a host-side join lock. Source: Kahoot lock option (secondary). Inference for async sessions: no start gate, but joining after close must refuse and route to results.

**P9. Join links are bounded capabilities.** Max uses, expiry and idempotent re-entry (owner or existing member re-opening is a no-op) prevent seat-burning and overshoot when many scan one QR at once. Source: Kahoot join-gate options (secondary); inference from P1.

**P10. A realtime channel is a hint, not the source of truth.** Postgres Changes are ordered on a single thread, but Supabase documents no delivery guarantee; its replay feature (private channels, database-sent messages only, max 25, about three days retention) exists to catch up after "a page reload or network interruption". Robust pattern: refetch authoritative state on every (re)subscribe; use events to trigger or patch. Source: Supabase Postgres Changes (https://supabase.com/docs/guides/realtime/postgres-changes); Broadcast (https://supabase.com/docs/guides/realtime/broadcast).

**P11. Edge-detect events.** Presence `sync` can emit join/leave with no real movement, and full-row payloads re-deliver unchanged values on unrelated updates. Compare with last known state before acting. Source: Supabase Presence (https://supabase.com/docs/guides/realtime/presence).

**P12. Know realtime authorisation and scale limits.** Postgres Changes authorises each event per subscriber, does not apply RLS to DELETE events, needs REPLICA IDENTITY FULL for old values, and Supabase recommends Broadcast beyond about 3,000 concurrent subscribers. Never rely on DELETE events for sensitive removal state. Source: Supabase Postgres Changes.

**P13. Phones silently drop sockets; recover on visibility, not on `onclose`.** `hidden` is the last event reliably observable and pages may be suspended afterwards. Field reports show iOS Safari sockets dying without `onclose` and bfcache restores firing `pageshow` (persisted) rather than `visibilitychange`. On visible/`pageshow`/`online`: resubscribe if needed and refetch. Sources: MDN (https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event); Flarum issue 4588, anecdotal (https://github.com/flarum/framework/issues/4588).

**P14. Retries and polling use backoff with jitter.** Exponential backoff plus random jitter avoids a room of phones reconnecting in lockstep. Source: Stripe (above). Cadence numbers are not standardised (Section 7).

**P15. Synced timers use server time plus measured skew.** A late or reloaded client seeks to the right offset instead of restarting. Source: inference; Ably's resume-from-serial model is analogous (https://ably.com/blog/achieving-exactly-once-message-processing-with-ably). No primary source on skew was found.

**P16. Be honest about connectivity and save state.** NN/g: no consequential action should occur without informing the user; feedback prevents repeated taps. Show "saved on this device, not synced" distinct from "saved"; never show success for a local-only write. Source: NN/g (https://www.nngroup.com/articles/visibility-system-status/). The article does not cover offline; the application is inference.

**P17. Host progress shows counts and states, never content.** "Submitted / in progress / not started" and last-seen serve facilitation; answers and other participants' identities stay hidden from participants. Source: inference, consistent with Zoom participant isolation (secondary).

**P18. Presence suits slow-changing state; stale means unknown, not gone.** Supabase advises Presence for online/offline-type state and Broadcast for high-frequency updates. Mark clients stale after a threshold instead of removing them. Source: Supabase Presence.

**P19. Close is one idempotent routine with explicit triggers.** Manual host close, deadline job and completion rule (solo: all samples submitted) all call it; it must be safe if they race. Source: P1, P4.

**P20. Closed means read-only, with enumerated exceptions and an audit trail.** If reopening or post-close edits exist they must be owner-only, logged (who, when, what), and must recompute results and flag already-sent notifications. Source: inference (a changed payload is a new operation, per Resend's 409 rule); no authoritative source on reopening was found.

**P21. Notifications are ledgered per recipient per event, and provider calls carry idempotency keys.** One ledger row per (session, recipient, event type) with status sent/skipped/failed lets retries and cron repeats skip delivered recipients. Resend suggests keys shaped `<event-type>/<entity-id>`; Vercel advises tracking processed event ids. Sources: Resend docs; Vercel cron guidance.

**P22. Pre-deadline reminders are found by reconciliation.** Query "deadline within N hours and no reminder ledger row" rather than relying on an exact-time trigger. Source: Vercel cron guidance; inference.

**P23. Multi-device: identity is the account, state is server-held.** The same user on two devices converges via the server; conflicts on a submitted evaluation are surfaced, not silently overwritten. Source: inference; Ably's resume model analogous.

**P24. Anonymous identity is fragile; give it a recovery path.** Re-joining by the same link should rebind to the existing participant record, or a claim/upgrade flow should exist, and users should be warned before leaving. Source: inference; no primary source retrieved.

## 3. Audit checklist

1. Is every status change (start, close, reopen, exclude) a conditional update that is a no-op when already applied? (P1)
2. Does a second start/close call return success with the final state rather than an error or a second side effect? (P1, P19)
3. Does each transition have a natural unique key or constraint so concurrent callers cannot both run side effects? (P2)
4. Do side effects (emails, history sync, reveal) run only for the caller whose conditional update actually changed a row? (P3)
5. Does the cron close job select by state and deadline (all overdue), tolerating a skipped day and a duplicate run? (P4)
6. Is there a lock or atomic claim preventing overlapping cron runs from double-processing? (P4)
7. Does every transition check the caller's role on the server, not only in the client? (P5)
8. Does the waiting screen show session name, host, "not started" status and the participant's own identity? (P6)
9. Can the host remove or exclude a participant, enforced server-side rather than by hiding UI? (P7)
10. Can the host cap or lock joins, and is the cap enforced atomically? (P7, P9)
11. Is joining after start and after close defined and tested (members routed, newcomers refused)? (P8)
12. Does an owner or existing member re-opening an invite link avoid consuming a seat or changing role? (P9)
13. On every (re)subscribe, does the client refetch authoritative state instead of trusting the next event? (P10)
14. Do realtime handlers compare against previous state before triggering actions? (P11)
15. Does any logic depend on DELETE events or old-row values without REPLICA IDENTITY FULL? (P12)
16. Do clients listen to `visibilitychange`, `pageshow` and `online`, and refetch and resubscribe on return? (P13)
17. Does the polling fallback use backoff with jitter and stand down when realtime is healthy? (P14)
18. Is every synced timer derived from a server timestamp and skew, with seek-on-late-join? (P15)
19. Does the UI distinguish "saved" from "saved locally, pending sync", clearing pending only on confirmed sync? (P16)
20. Does the host progress view expose only status and counts, never answers or other participants' names to participants? (P17)
21. Is staleness derived from last-seen and shown as unknown, without auto-removing participants? (P18)
22. Do manual close, deadline job and completion rule all call one close routine? (P19)
23. Do all mutations after close assert the session is writable, with an enumerated exception list? (P20)
24. If reopening exists, is it owner-only, logged, and does it recompute results and flag sent notifications? (P20)
25. Is there a per-recipient, per-event notification ledger consulted before each send? (P21)
26. Do provider send calls carry idempotency keys derived from event and entity? (P21)
27. Is any pre-deadline reminder reconciliation-based with a ledger row preventing repeats? (P22)
28. When the same user opens a session on two devices, do both converge to server state and surface submitted-evaluation conflicts? (P23)
29. Can a guest who lost storage rejoin or claim their data, and are guests warned before leaving? (P24)
30. Is a forgotten live session (never closed) auto-closed after inactivity or surfaced to the host? (P19, P22)

## 4. Anti-patterns

- **Unconditional `status = closed` writes.** Look idempotent; double emails and double reveal appear when two callers race (P1).
- **Cron that only looks at "yesterday".** A missed or repeated run leaves sessions open or processes twice (P4).
- **Trusting the realtime event as the data.** After a background/foreground cycle the event was never delivered and the host sees stale state (P10, P13).
- **Treating socket `onclose` as the only failure signal.** iOS can drop the socket silently (P13).
- **Presence join/leave as truth.** Sync-induced join/leave flaps the roster (P11).
- **Client-hidden host powers.** Removal or lock that only hides a button; the participant can still call the action (P5, P7).
- **Counters instead of per-recipient rows** for notification state (P21).
- **Per-device clock for shared timers.** Phones drift; cues land at different moments (P15).
- **Green "saved" for a local write.** Erodes trust the first time a draft is lost (P16).
- **Silent reopen/edit after close.** Reports and emails already sent no longer match (P20).
- **Guest identity only in a cookie, no recovery.** Cleared browser equals lost evaluation (P24).

## 5. Native-app considerations

- Capacitor WebViews are suspended in the background like Safari tabs: assume the socket is dead on resume; combine Capacitor `appStateChange` with `visibilitychange` to refetch (P13). Inference from the web lifecycle, not a source.
- Timers do not run reliably while backgrounded; pre-scheduled audio cues and synced clocks must re-derive position from the server timestamp on resume (P15).
- Push (APNs/FCM) would be a third notification channel: it needs its own ledger rows and token invalidation; email stays the durable channel (P21).
- WebView storage can be evicted; guest identity and offline drafts need the same recovery story (P24).
- Join links should open the app through universal/app links with a web fallback, and the lobby state must be identical across entry paths (P9).

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Sala de espera | Waiting room / lobby | Pre-start state where participants wait for the host |
| Anfitrión / maestro | Host / master | The creator with transition authority |
| Participante | Participant | Member who evaluates |
| Invitado | Guest | Anonymous participant |
| Enlace de invitación | Invite link / capability URL | Token granting join rights, bounded by uses and expiry |
| Cierre | Close | Terminal transition that reveals and scores |
| Idempotente | Idempotent | Repeating the operation has no further effect |
| Reconciliación | Reconciliation | Recomputing outstanding work from state rather than events |
| Registro de envíos | Delivery ledger | Per-recipient record of notifications |
| Sesión huérfana | Orphaned session | Live session never closed |
| Respaldo por sondeo | Polling fallback | Periodic fetch when realtime is unhealthy |
| Desfase de reloj | Clock skew | Difference between device and server time |
| Reapertura | Reopen | Transition from closed back to active (usually not offered) |

## 7. Open practice questions

- What cadence should the polling fallback use during a live cupping (5 s, 15 s)? No standard found; trade server cost against perceived lag.
- Should a live session auto-close after N hours of inactivity, or only alert the host? No benchmark found.
- Should reopening a closed session exist, given emails and reveals already happened?
- Can the host hand over mid-session, and who owns results access afterwards?
- How should a late joiner to a running live session treat samples already passed (cup anyway, or observe only)?
- Does the installed supabase-js re-join channels automatically after network loss? The fetched docs did not specify reconnection; verify against the installed version.
- Is a lab-sized room within Postgres Changes throughput given per-subscriber RLS checks? Likely at this scale; load-test rather than assume.

## 8. Sources (newest first)

- Vercel, Managing Cron Jobs (updated 2026-08): https://vercel.com/docs/cron-jobs/manage-cron-jobs (2026)
- Supabase, Realtime Broadcast (replay, REST send, ack): https://supabase.com/docs/guides/realtime/broadcast (2026)
- Supabase, Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes (2026)
- Supabase, Realtime Presence: https://supabase.com/docs/guides/realtime/presence (2026)
- Supabase, Realtime Concepts: https://supabase.com/docs/guides/realtime/concepts (2026)
- Resend, Idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys (2025)
- Flarum issue 4588, iOS Safari WebSocket silent close (anecdotal): https://github.com/flarum/framework/issues/4588 (2025)
- MDN, Document visibilitychange event: https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event (current)
- NN/g, Visibility of system status: https://www.nngroup.com/articles/visibility-system-status/ (2023)
- Kahoot live game settings, third-party mirror (secondary): https://z3n-irynaparahailo.zendesk.com/hc/en-us/articles/15168264775313-Live-game-settings (n.d.)
- Brown University IT, Zoom waiting room (secondary): https://ithelp.brown.edu/kb/articles/using-the-waiting-room-in-zoom-web-conferencing (n.d.)
- Tufts IT, Zoom waiting rooms (secondary): https://it.tufts.edu/guides/zoom-audio-and-virtual-conferencing/waiting-rooms (n.d.)
- Ably, Achieving exactly-once message processing: https://ably.com/blog/achieving-exactly-once-message-processing-with-ably (2020s)
- Stripe, Designing robust and predictable APIs with idempotency: https://stripe.com/blog/idempotency (2017, still canonical)

Not retrieved: Mentimeter and Google Meet help centers, Kleppmann, Apple background-execution docs.
