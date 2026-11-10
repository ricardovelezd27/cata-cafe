# 15 · Offline y sincronización

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1377–1491 · **Domain briefs applied:** `offline-native` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-offline-native (Sonnet) · **Verification:** done 2026-11-06 (offline-native verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A cupper edits a sample; `CupClient.flushSave` (`CupClient.tsx:885`) writes to the server and, if offline or the call throws, to a user-keyed IndexedDB blob via `mergeModuleData` (`lib/offline/store.ts:144`) marked `pending`. `useConnectivity` decides offline from `navigator.onLine` plus a 30 s `/api/health` probe with 8 s timeout (`hooks/useConnectivity.ts:5-6,34-52`). On an offline→online edge, or once on an online mount, `useOfflineSync.syncAll` (`hooks/useOfflineSync.ts:100`) replays each `pending` module: evaluations through `syncEvaluation` (`app/actions/offline.ts:29`), physical/extrinsic straight to `upsertPhysical/upsertExtrinsic`, with 3 attempts and 1/2/4 s backoff. Submitted rows yield `conflict` (modal), closed sessions yield `discarded`. The spec matches the code; this audit adds two behaviours the board does not list (F-offline-3 and F-offline-6).

## 2. Expert bar applied

- **P3/P4, no silent loss and no false "saved"** → Does any path discard queued data without telling the user (checklist 5)? Can a conflict always reach the user with a choice (4)?
- **P2, idempotent replay that cannot regress newer data** → Can a late replay overwrite or relabel a newer edit (2, 10)?
- **P5/P6, honest connectivity and bounded retry** → Does a failed replay retry on its own (9)? Is there a resume hook (27)?
- **P8/P9, user caches die with the session; storage may be evicted** → Sign-out and claim (18), `persist()` (16), SW cache bounds (13).
- **Cupping lens** → Offline cupping is the lab case: whole sessions are cupped without signal and submitted later; a cupper's notes on a consumed sample cannot be recreated.

## 3. Findings

### F-offline-1 · Sesión cerrada: la evaluación offline entera se pierde en silencio · severity: P1 · status: confirms-board(Sesión cerrada mientras estabas offline)

- **Problem** — `syncEvaluation` returns `discarded` as soon as the session is closed: `if (status === "closed") return { status: "discarded" };` (`app/actions/offline.ts:48`). The client maps it to success: `return res.status === "discarded" ? "synced" : res.status;` (`hooks/useOfflineSync.ts:83`), then flips the module to `synced` (`:132`) with no notice. Sharpening: a cupper who cupped offline never had a server row (submit is blocked offline, `CupClient.tsx:1226-1232`), so on a cron-closed async session or an owner close, the draft is not "a stale edit on top of submitted data" but the cupper's whole evaluation of that sample.
- **Implication** — Data loss, trust. A cupper in a lab with bad signal finds, hours later, no score and no explanation. The sample was consumed, so the cupping cannot be repeated.
- **Fix** — Replay returns a distinct "closed" outcome. Drafts that exist locally and are missing or different on the server stay on the device as read-only "No sincronizados", with a persistent notice naming the session and count, and a way to view or copy them. Nothing is deleted without explicit confirmation. **Acceptance:** (1) offline draft + session closed → notice appears after reconnect and the draft stays viewable after reload; (2) the pending badge counts it; (3) closed-session server data is unchanged; (4) no write reaches the server. **Size:** M.
- **Native** — The kept drafts must live in the durable store (see F-offline-8) and survive WebView restarts; copy/export must use the native share path, not `<a download>`.
- **Confidence** — verified-in-code.
- **Kim?** — yes: when a session closes while a cupper still holds unsent notes, what should the cupper be able to do with them? Options: only read and copy them; send them to the session owner as a late contribution; let the owner decide whether to accept them.
- **Invariant check** — closed = read-only is respected (nothing is written to the server); the fix is client-only.

### F-offline-2 · La reconexión puede marcar «sincronizado» una edición más nueva · severity: P2 · status: confirms-board(La reconexión puede pisar una edición más nueva con el borrador viejo)

- **Problem** — `syncAll` reads `mod.data` (`useOfflineSync.ts:121`), awaits up to ~7 s of retries, then calls `setModuleStatus(..., "synced")` (`:132`). `setModuleStatus` reloads the blob and flips whatever module is there to `synced` with no `updatedAt` comparison (`lib/offline/store.ts:188-192`), although `mergeModuleData` stamps `updatedAt` on every write (`:168`). Server side `syncEvaluation` has no staleness check either (`offline.ts:79-94`), so an old replay arriving after a live save overwrites it.
- **Implication** — Data loss on a normal flaky-signal cupping: the cupper edits during the replay window, the newer edit is stored `pending`, then silently relabelled `synced` and never sent; pill and badge clear.
- **Fix** — Mark `synced` only if the module's `updatedAt` still equals the replayed snapshot; send the local `updatedAt` and have the server ignore a write older than the last accepted one. **Acceptance:** an edit during an in-flight replay leaves the module `pending` and replays the newer data later; an out-of-order older request does not regress the server row. **Size:** M.
- **Native** — Same logic; a `resume` replay (F-offline-6) makes this race more frequent in a WebView.
- **Confidence** — verified-in-code for the local relabel; needs-runtime-check for server ordering (throttle the network in devtools while editing).
- **Kim?** — no.
- **Invariant check** — scoring inputs stay derived server-side (`computeEvaluationDerived`); only a timestamp is added.

### F-offline-3 · Un conflicto desaparece al recargar y queda atascado · severity: P2 · status: new

- **Problem** — Conflicts are stored two ways: status `"conflict"` in IndexedDB (`useOfflineSync.ts:134`) and the modal list in React state only (`:51`). On reload `syncAll` skips anything not `pending` (`:122`), the cup page does not rehydrate non-pending modules ("Conflicts are the SyncConflictModal's job", `CupClient.tsx:698`), and `PendingDraftsBadge` counts only `pending` (`components/offline/PendingDraftsBadge.tsx:49`). Nothing rebuilds the modal list.
- **Implication** — Lossy and invisible: if the cupper closes the tab before answering, the local version is never offered again, never counted, never replayed. Together with F-offline-1 it is a second silent drop.
- **Fix** — On mount, rebuild `conflicts` from blobs holding `conflict` modules, count them in the badge and results pill, and keep the modal reachable until resolved. **Acceptance:** create a conflict, reload, the modal and badge still show it; resolving clears both. **Size:** S.
- **Native** — Process kill is common in WebViews, so this must survive an app restart.
- **Confidence** — needs-runtime-check (two tabs: submit in one, replay a stale draft in the other, reload).
- **Kim?** — no.
- **Invariant check** — none touched.

### F-offline-4 · Errores permanentes se reintentan para siempre · severity: P2 · status: confirms-board(Errores permanentes en la reconexión quedan pendientes para siempre)

- **Problem** — `replayModule` treats every throw the same: `catch { if (attempt < MAX_RETRIES) await wait(...) }` then `"failed"` (`useOfflineSync.ts:91-95`). `upsertPhysical/upsertExtrinsic` throw `session_closed` through `assertSessionWritable` (`app/actions/sessions.ts:1181,1372`), and `syncEvaluation` throws `not_found_or_forbidden` for a deleted sample (`requireSampleMember`, `offline.ts:39`). None can ever succeed; they stay `pending`, burn 3 attempts per reconnect and leave the banner at "failed".
- **Implication** — Robustness and trust: a permanent "no se pudo sincronizar" whose Retry button cannot work, and a badge that never clears. Other modules still replay (the loop continues), so the harm is noise plus an owner's closed-session physical edits being lost without explanation.
- **Fix** — Classify outcomes: network/5xx retry; closed → the F-offline-1 path; not found/forbidden/invalid → `rejected`, kept, shown once, never auto-retried. **Acceptance:** a closed-session physical edit ends in the F-offline-1 notice, not in "failed"; a deleted-sample draft is reported once and stops retrying. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — ActionResult contract: these actions are replay-only callers today; throwing coded errors stays valid, converting to `ActionResult` is optional.

### F-offline-5 · Salir o reclamar la cuenta deja borradores huérfanos · severity: P2 · status: confirms-board(Salir o reclamar la cuenta deja borradores pendientes huérfanos)

- **Problem** — `SignOutButton` runs `clearLocalDeviceState()` then signs out with no pending check (`components/layout/SignOutButton.tsx:29-35`); drafts are deliberately kept (`lib/offline/deviceState.ts:7-10`). Blobs are keyed `_user_<id>` (`store.ts:74`) and `removeSession` has no caller, so they are never cleaned. `mergeGuestData` moves server rows to the new user and deletes the anonymous user (`lib/guestClaim.ts:296-299`), but nothing re-keys the IndexedDB blobs of the anonymous id.
- **Implication** — A QR walk-up guest who cupped partly offline and then taps "Guardar mis resultados" silently loses the unsynced part; on a shared tablet, one user's unsent work stays on disk for the next.
- **Fix** — Before sign-out or claim, count pending modules; if any, offer "Sincronizar ahora" (online) or warn that N changes stay only on this device. On claim, re-key anonymous blobs to the new user id before the redirect. **Acceptance:** a guest with a pending module claims and the module replays under the new account; sign-out with pending shows the warning. **Size:** M.
- **Native** — The claim returns through the login deep link, so the re-key must happen before leaving the WebView and the blobs should be in the native mirror.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — guest scope unchanged; offline store stays client-only; `mergeGuestData` untouched.

### F-offline-6 · Una réplica fallida no se reintenta sola · severity: P2 · status: new (sharpens «Estado de sincronización con reintentos visibles»)

- **Problem** — `syncAll` runs only on an offline→online edge or first mount (`useOfflineSync.ts:217-224`). The 30 s probe updates state only when the value changes (`useConnectivity.ts:22-26`), so after a replay ends `failed` while the connection stays up (server hiccup, 5xx), no timer retries; recovery is the Retry button on the cup page (`OfflineBanner.tsx:78-85`) or leaving and re-entering.
- **Implication** — A cupper on shaky venue Wi-Fi who dismisses the banner believes work is queued, but nothing resends until the next flap; the final submit then refuses with the amber notice (`CupClient.tsx:1243-1252`).
- **Fix** — While any module is `pending` and online, retry on a bounded, jittered schedule and on app resume; show "próximo intento en N s" in the banner and badge. **Acceptance:** with the server forced to 500 then healthy, pending clears without a click within the next backoff window. **Size:** S.
- **Native** — Add `appStateChange/resume`: re-probe, refresh the session, replay (today only `pagehide`/`visibilitychange` exist, `CupClient.tsx:780-781`).
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-offline-7 · «Reemplazar con mi versión» deja el puntaje de comunidad viejo · severity: P2 · status: confirms-board(«Reemplazar con mi versión» no recalcula el puntaje de comunidad)

- **Problem** — A forced replay updates a submitted row without touching `isDraft` (`offline.ts:79-94`; the comment at `:26-28` says results recompute from raw rows). The trigger fires only `AFTER INSERT OR UPDATE OF "isDraft"` (`prisma/sql/rls_and_triggers.sql:264-268`), while the coffee profile and ficha read the stored aggregate (`lib/coffees/aggregateSamples.ts:18-20`).
- **Implication** — Scoring correctness on a rare path: the stored community score differs from the evaluations behind it. P2 rather than P1 because it needs a conflict plus an explicit "replace".
- **Fix** — After a forced replace, re-fire the aggregate for that sample (the same no-op `isDraft` update used by `refreshAggregateScores` and the claim merge) and correct the code comment. **Acceptance:** replace on a submitted evaluation makes `AggregateScore` match the evaluations. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code (trigger scope); needs-runtime-check for the end value.
- **Kim?** — no. (Whether "force" should ever overwrite a submitted evaluation is already open in the brief; not repeated.)
- **Invariant check** — the DB trigger stays the single source of truth; the fix calls it, not a TS recompute.

### F-offline-8 · Almacenamiento sin garantías y caché estática sin límite · severity: P2 · status: confirms-board(Pedir almacenamiento persistente; La caché estática del SW crece sin límite entre despliegues)

- **Problem** — No `navigator.storage.persist()` anywhere in `app/`, `components/`, `hooks/`, `lib/` (grep empty). The static cache is cache-first and unbounded (`public/sw.js:95-108`; only pages/RSC are trimmed, `:122`); `SW_VERSION = "v2"` (`:6`) changes only by hand. `skipWaiting()` on install (`:15`) plus `clients.claim()` swaps the worker under an open tasting. The storage banner flips only after a call has already failed (`store.ts:48-56`).
- **Implication** — Robustness: unsynced drafts sit beside a cache that grows each deploy, in an origin the browser may evict (Safari's 7-day rule for non-installed tabs). Nothing warns a cupper holding days of unsent work.
- **Fix** — Request persistence once on first authenticated load and record the answer; cap static entries by count and drop old build chunks; warn on pending work older than a few days when not installed. **Acceptance:** persist outcome recorded; cache size stays bounded across two deployments; the stale-pending warning appears. **Size:** M.
- **Native** — Mirror drafts write-through to native storage (SQLite/Preferences) and restore when IndexedDB is empty; verify SW registration under the chosen `server.url` origin.
- **Confidence** — verified-in-code; WKWebView eviction needs-runtime-check on a device.
- **Kim?** — no.
- **Invariant check** — offline store stays client-only; SW exclusion rules untouched; bump `SW_VERSION` if cache logic changes.

### F-offline-9 · Tableta compartida: cachés de páginas del usuario anterior · severity: P3 · status: confirms-board(Tableta compartida: páginas en caché del usuario anterior)

- **Problem** — Pages and RSC are cached by URL only (`public/sw.js:113-123`) and purged only through `SignOutButton` (`deviceState.ts:11-21`). Someone signing in without that button (expired session, another tab) can be served the previous user's cached `/app/sessions` while offline. The board rates this P2; downgraded here because the cache is served only when the network fails and needs a prior user on the same browser profile.
- **Implication** — Privacy leak, low frequency.
- **Fix** — Purge `cata-pages-*`/`cata-rsc-*` whenever the signed-in user id differs from the last seen one, and never cache `/app/insights/**` or profile pages. **Acceptance:** A's session expires, B signs in and goes offline: A's lists are not served. **Size:** S.
- **Native** — A WebView has one profile, so the same purge on user change applies.
- **Confidence** — needs-runtime-check.
- **Kim?** — no.
- **Invariant check** — none touched.

## 4. Keep — works well

- Storage failures never reject and outrank connectivity in the banner (`lib/offline/store.ts:48-71`, `components/offline/OfflineBanner.tsx:38-41`).
- The probe route is trivial, uncached and auth-free (`app/api/health/route.ts`); the SW excludes non-GET, cross-origin, `/api/`, `/auth/` and `hmr` before any cache logic (`public/sw.js:74-92`).
- `syncEvaluation` re-derives module and cups from the session row, is member-gated and pins the reference sample (`offline.ts:39-77`).
- Submit refuses while anything is device-only and replays first (`CupClient.tsx:1236-1252`); a local write never maps to the green "saved" state.
- Replay is per module, so one failed item does not stop the rest; backoff has jitter (`useOfflineSync.ts:31-35,111-148`).
- Sign-out purge keeps drafts rather than destroying work (`lib/offline/deviceState.ts:7-10`).

## 5. Not verified

- Real WKWebView/Safari IndexedDB eviction: test on a physical iPhone over weeks.
- F-offline-2 server ordering and F-offline-3 modal loss: reproduce with two browser tabs and devtools throttling.
- Whether a cron-closed async session really closes while a cupper holds an offline-only draft: two-user test with `closesAt` in the past.
- `public/sw.js` behaviour inside a Capacitor origin (no wrapper in the repo).

## 6. Questions for Kim (collected)

- **K-offline-1** — Si una sesión se cierra mientras un catador todavía tiene notas sin enviar (por ejemplo, catando sin señal), ¿qué debería poder hacer con ellas? Opciones: (a) solo verlas y copiarlas; (b) enviarlas al dueño de la sesión como aporte tardío; (c) que el dueño decida si las acepta.

## 7. Verification log

F-offline-1 — CONFIRMED — `offline.ts:48` returns discarded after the closed check; `useOfflineSync.ts:83` maps it to synced; submit is blocked offline (`CupClient.tsx:1226-1232`), so a never-synced cupper has no server row. Applies to evaluations only (physical/extrinsic throw, see F-4). — severity: keep
F-offline-2 — PLAUSIBLE — `setModuleStatus` flips status with no `updatedAt` check (`store.ts:176-195`) and `syncEvaluation` has no staleness guard (`offline.ts:79-94`). Needs an edit landing inside one replay round trip; a failing live save is what leaves it pending. Settle with devtools throttling. — severity: keep
F-offline-3 — CONFIRMED — `conflict` is only in React state plus a blob status; reload skips non-pending (`useOfflineSync.ts:122`), `CupClient.tsx:698` skips it, the badge counts only pending (`PendingDraftsBadge.tsx:49`). Server keeps the submitted row, so it is a dropped local alternative. — severity: keep
F-offline-4 — CONFIRMED — `upsertPhysical/upsertExtrinsic` assert writable (`sessions.ts:1181,1372`), replay catches every throw (`useOfflineSync.ts:91-95`). Worse than stated: `countLocalPending` is session-wide (`CupClient.tsx:1245`), so a stuck module for a deleted sample also blocks that cupper's final submit. — severity: keep
F-offline-5 — CONFIRMED — `SignOutButton.tsx:29-35` has no pending check; no caller of `removeSession`; `guestClaim.ts` does not re-key blobs. duplicate of F-guest-5 (claim part) and F-guest-4 (sign-out part); 03-invitado-qr-claim should own the claim half, this file the sign-out half. — severity: keep
F-offline-6 — CONFIRMED — `syncAll` triggers only on the edge or mount (`useOfflineSync.ts:217-224`) and the probe updates only on change (`useConnectivity.ts:22-26`). But submit already replays once via `retrySync` (`CupClient.tsx:1243`), so nothing is lost, only silent delay. — severity: → P3 (friction; the submit path self-heals)
F-offline-7 — CONFIRMED — trigger fires only on `UPDATE OF "isDraft"` (`rls_and_triggers.sql:264-268`) and the forced replay never touches `isDraft` (`offline.ts:21-28,79-94`); results read `aggregateScore` (`results/page.tsx:619`). End value needs a runtime check; it needs a conflict plus an explicit replace. — severity: keep
F-offline-8 — PLAUSIBLE — no `storage.persist()` anywhere (grep empty); static cache unbounded (`sw.js:95-108`), `SW_VERSION` manual (`sw.js:6`). The loss needs days of unsent work plus eviction; `docs/expertise/offline-native.md` itself finds no primary source for WKWebView eviction. — severity: → P3 (hardening, no observed loss path)
F-offline-9 — P3, no change: citations hold (`sw.js:113-123`, `deviceState.ts:11-21`).

Cross-cutting WebView/Capacitor-limitation theme (other audit files, not edited):
- F-informes-4 (14, P2) — window.print + attachment link + `target=_blank`: code-true (`PrintClient.tsx:1225,1270`, `ResultsClient.tsx:960,974`); WebView behaviour is plausible, unverified on device.
- F-resultados-8 (10) Native line "not a blob download" — carried over from the same theme; the blob download is not in the code at those sites, the claim is inference.
- F-insights-8 (17, P3) — blob link click (`UsersDirectory.tsx:58`): code-true, WebView result unverified; P3 is right.
- F-guest-5 (03), F-crear-sesion-6 (06), F-solo-5 (07), F-offline-8 (15) — IndexedDB eviction: inference only, no primary source (offline-native.md section 7). Treat as one unverified assumption.
- F-informes-7 (14) and F-offline-1 (15) — Native lines reuse the share path; derivative of F-informes-4.
Verdict for the report: one theme, "WebView save/print/storage", settle with a single device test on a physical iPhone; none is a standalone P1.
