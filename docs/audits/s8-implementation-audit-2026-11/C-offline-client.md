# Audit area C — Offline sync, realtime and client state

Audited commit: `3713033` (origin/claude/s8-21-loose-ends-impl), baseline origin/main.
Auditor stance: independent, adversarial. Nothing here ran in a browser or against a database.

## 1. System overview (this area)

- **Durable drafts**: `lib/offline/store.ts` (localforage/IndexedDB, client-only, never rejects) keeps one blob per `session × user`; every read-modify-write goes through a per-key promise chain (`lib/offline/serialize.ts`). Each module carries `syncStatus` (`pending | synced | conflict | failed | closed_unsent | orphaned`), `updatedAt`, `attempts`, `nextAttemptAt`, `waiting`.
- **Status machine**: `lib/offline/status.ts` (pure, tested) maps replay outcomes to statuses, ignores a result whose `updatedAt` no longer matches the sent snapshot (`ifUpdatedAt`), parks a module as `failed` after 5 runs that ended in `retry`, and defines `blocksSubmit` (pending, failed) / `hydratesForm`.
- **Replay driver**: `hooks/useOfflineSync.ts`, one module-level `inflight` lock shared by every instance (CupClient, SessionSyncStatus, UnsyncedGuardProvider in the app shell). Runs on online edge, first online mount, resume (`useResume` → `useForegroundResume`), and a jittered timer (15 s → 5 min) while anything is `pending` and not `waiting`. Conflicts are rebuilt from blobs.
- **Server**: `app/actions/offline.ts` — `replayEvaluation` (returns `synced | conflict | closed | pending | gone | rejected`, never throws for those), legacy `syncEvaluation` wrapper, `replayPhysical` / `replayExtrinsic` (owner-only, last-write-wins). Evaluation writes go through `lib/evaluationWrite.ts` (`writeEvaluationOrdered`, conditional update on `lastClientWriteAt`, migration `20261111160000_evaluation_last_client_write`), shared with the live `upsertEvaluation`.
- **Live path**: `CupClient` 800 ms server debounce + 500 ms local debounce, `flushSave` returns `synced | pending`, `refreshLocalState` derives the amber indicator from the store (F-solo-5), submit refuses while `countLocalPending() > 0` after one manual replay.
- **Guards**: `UnsyncedGuardProvider` (sign-out / claim warning, cache purge on user change, claim re-key via `claimMarker.ts` two-marker protocol).
- **Service worker** `public/sw.js` v3: static cache-first capped at 120 FIFO, navigations/RSC network-first, insights/profile never cached, exclusions unchanged.
- **Realtime**: CupClient / WaitingRoomClient / ResultsClient subscribe via `subscribeWithSessionAuth`; a `resumeKey` bump rebuilds the channel on foreground resume (S8-15). Waiting room has a 15 s ± 3 s polling fallback.

## 2. Architecture assessment

| Concern | Class | Assessment |
|---|---|---|
| Two ordering mechanisms (client `ifUpdatedAt` + server `lastClientWriteAt`) but the replay pass sends a **snapshot** loaded once at pass start | A design flaw | The client guard only prevents a stale *result* from marking fresh work synced; it does not prevent a stale *payload* from being sent after a newer live save. Evaluation modules are then saved only by the server ordering (which the clamp weakens, C-02); physical/extrinsic have no server ordering at all (C-01). Re-reading the module immediately before sending removes the whole class. |
| `effectiveClientTs = min(clientTs, serverNow)` | A | Prevents a fast clock from "hardening" a row, but converts a fast device clock into arrival-order semantics, i.e. exactly the race ordering was added for (C-02). Tradeoff was only tested in one direction. |
| Module-level `inflight` lock across hook instances | Sound | Late non-manual callers await and return; manual callers run their own pass after. No deadlock path found (traced microtask order). |
| Status machine (pure, tested) | Sound | `retry`/`waiting` semantics and terminal set are coherent. `failed` deliberately still blocks submit (deviation from spec text "terminal excluded from the gate"), mitigated because submit calls `retrySync()` = manual pass that revives `failed`. Acceptable and safer. |
| Legacy compatibility (`syncEvaluation` "discarded", boolean `checkSessionStarted`) for "service-worker-cached bundles" | D unverified assumption | Next 16 docs (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:276`): action IDs are "encrypted, non-deterministic … recalculated between builds". A pre-deploy bundle cannot reach these exports at all; it gets "Server Action not found" (throws). The shims are harmless dead weight; the real behaviour of a tab left open across a deploy is "every save goes amber/pending until reload" (no data loss, not handled). |
| SW static cache FIFO cap | A | FIFO on insertion order with no re-insert on hit is not LRU; the earliest-cached (core runtime) chunks of the CURRENT build are the first evicted (C-04). |
| Claim re-key two-marker protocol | Sound, one gap | Prevents handing a guest's notes to a later account. Gap: "Usar otra cuenta" clears the start marker (C-08). |
| Realtime resume via `resumeKey` | Sound | Implemented as decided; duplicated legacy refresh listeners remain (C-07). |

## 3. Findings register

### C-01 — Medium — correctness / silent data loss (owner physical & extrinsic)
- **Files**: `hooks/useOfflineSync.ts:173-205` (snapshot), `app/actions/offline.ts:203-211` and `243-258` (unordered upsert), `app/[locale]/app/sessions/[id]/cup/CupClient.tsx:1106-1113` (live save marks synced).
- **Expected**: "a draft is never dropped silently"; an edit made while a replay is in flight wins (S8-09 §4 step 1, `status.ts` header).
- **Actual**: `runPass` loads all blobs once (`const blobs = await loadUserBlobs(userId)`, l.173) and sends `mod.data` from that snapshot (l.186-193). If the owner edits physical (or extrinsic) of sample A while the pass is working through earlier modules, the live `upsertPhysical(D2)` is dispatched first; the pass later sends the stale `replayPhysical(D1)`. Server actions are dispatched one at a time from the client (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206`), so the server applies D2 then D1. `replayPhysical` is a plain `upsert` with no ordering. On the client, `applyReplayOutcome(..., { ifUpdatedAt: sentAt })` sees a newer `updatedAt` and does nothing; the earlier live save already ran `setModuleStatus(..., "synced", { ifData: D2 })`. The quick re-run (`skippedStale`) finds the module `synced`. Final state: server holds D1, device shows D2 as synced; no indicator.
- **Evidence**: `const mod = sample.modules[moduleKey]; … const result = await replayModule(sampleId, moduleKey, mod.data, …)` with `mod` from the start-of-pass snapshot; `prisma.physicalEvaluation.upsert({ … update: { data: input.data } })`.
- **Verification**: Strongly supported (full path traced in code; client dispatch ordering per Next docs). Not runtime-verified.
- **Reproduction**: owner offline edits several modules incl. physical A → reconnect → while the "Sincronizando" pass runs, edit physical A again → reload: physical A shows the offline value.
- **Smallest fix**: inside the loop, re-load the module (`loadSession(blob.sessionId, blob.userId)`) immediately before `replayModule` and skip it if no longer `pending`; send that fresh `data`/`updatedAt`.
- **Regression test**: hook-level test (or extract `runPass` into a pure driver with injected store/actions) asserting that a module edited and live-synced during a pass is never re-sent with older data.

### C-02 — Medium — correctness (evaluation ordering defeated by a fast device clock)
- **Files**: `lib/offline/clientWrite.ts:322-325` (clamp), `lib/evaluationWrite.ts:40-62`, `hooks/useOfflineSync.ts:185-193`, `CupClient.tsx:1093-1101`.
- **Expected**: S8-18 / S8-09 step 1 — a write older than the row's newest accepted write is ignored.
- **Actual**: both stamps are clamped to server time. Live save stamp = `min(tLive+δ, S_live) = S_live` when the device clock is ahead by δ. The stale snapshot replay (C-01 path) arrives later with stamp `min(tOld+δ, S_replay)`; it is applied whenever `tOld + δ ≥ S_live`, i.e. when the clock lead exceeds the gap between the old edit and the newer live save (seconds in the flaky-network case: a live save failed, the user keeps editing).
- **Evidence (executed)**: temporary test, δ = 10 s, old edit at S0, live save at S0+5 s, replay at S0+5.3 s: `shouldApplyClientWrite(stored, oldUpdatedAt, S_replay) === true`; control with correct clock `=== false`. Both passed.
- **Verification**: Verified (pure logic executed); end-to-end needs a device with a fast clock.
- **Smallest fix**: same as C-01 (never send a stale snapshot). Optionally compare on raw client ts for writes from the same device and keep the clamp only as an upper bound when storing.
- **Regression test**: add the fast-clock case to `tests/offlineOrdering.test.ts`.

### C-03 — Medium — reliability regression (waiting-room fallback poll dies after one failure)
- **File**: `app/[locale]/app/sessions/[id]/waiting/WaitingRoomClient.tsx:336-345`.
- **Expected**: S8-11 T2 — when realtime is not SUBSCRIBED, poll every 15 s ± 3 s so a dropped socket never strands the room.
- **Actual**: `pollRef.current = setTimeout(async () => { await refetchState(); if (pollRef.current !== null) tick(); }, …)`. `getWaitingState` catches server errors, but a network failure rejects the server-action promise on the client; the callback rejects, `tick()` is never called again, and `pollRef.current` keeps the spent timer id so `if (!pollRef.current)` in the status callback can never restart the loop. Baseline (origin/main) used `setInterval`, which survived a rejected tick, so this is a regression introduced by the jitter change.
- **Evidence (executed)**: the pattern copied verbatim into a temp test with fake timers: after one rejected refetch, 75 s of timers produce exactly 1 call and `pollRef.current` stays non-null.
- **Impact**: precisely when the socket is down (venue Wi-Fi), one blip stops automatic transition to `/cup`; the participant stays on "Esperando…" until they tap "Comprobar" or background/foreground the tab (resume path rebuilds the effect). Related pre-existing defect: `handleStart` (l.356-370) does not catch a rejected `checkSessionStarted`, so `checking` stays true and the button stays disabled.
- **Verification**: Verified (logic) / not in browser.
- **Smallest fix**: `try { await refetchState(); } catch {} finally { if (pollRef.current !== null) tick(); }`; wrap `handleStart` in try/finally.
- **Regression test**: extract the poll loop into `lib/waitingPoll.ts` and test "a rejected refetch schedules the next tick".

### C-04 — Medium (hypothesis) — offline shell can lose its own runtime chunks
- **File**: `public/sw.js:13-14, 37-46, 95-110`.
- **Expected**: S8-09 step 7 bounds `cata-static-*` across deployments without harming offline boot.
- **Actual**: FIFO trim on insertion order; a cache hit is never re-inserted, so the first assets cached in a session — the current build's framework/runtime/main-app chunks — are the first evicted once >120 entries exist. Every `/_next/image` width variant, landing photo, icon, font and every route chunk counts. After eviction an offline hard reload gets the HTML from `cata-pages-*`, but its core chunk misses the cache and fails, so the app (and `cup/error.tsx`'s IndexedDB rebuild) never boots.
- **Verification**: Hypothesis. Settling evidence: a production build, count of distinct static URLs fetched while browsing landing → app → several sessions → cup, then an offline reload test.
- **Smallest fix**: re-`put` (touch) on cache hit to make it LRU, or cap only entries not referenced by the current build id, or raise the cap substantially (e.g. 400) and trim only on `activate`.
- **Regression test**: manual device check in runbook; optionally a node test of `trimCache` ordering with a fake Cache.

### C-05 — Low — status honesty edge cases
- `useOfflineSync.ts:209,224`: a `waiting` outcome (live session not started) sets `anyRetry` → `syncPhase "failed"` → OfflineBanner shows the sync-failed message with a retry button although nothing failed.
- `status.ts:232-234` + `UnsyncedGuardProvider.tsx:122`: `countDeviceOnly` counts `conflict`, `closed_unsent`, `orphaned`; a user with one old orphaned note gets the "N cambios quedan solo en este dispositivo" dialog on every sign-out, after a forced manual replay pass. By design "visible", but noisy.
- `attempts` increments for every pass that ends in `retry`, and passes run on every visibility change (`useResume` with `minHiddenMs: 0`); on a captive-portal network five app switches park drafts as `failed` (manual retry; submit revives them). No loss.
- Verification: Strongly supported (code). Fix: map `waiting` to a neutral phase; count only `pending|failed` for the sign-out warning and mention terminal notes separately.

### C-06 — Low — compatibility shims built on an unverified assumption
- `app/actions/offline.ts:165-176` (`syncEvaluation`), `app/actions/sessions.ts:1775` (`checkSessionStarted` boolean "for cached bundles").
- Next 16 recalculates server-action IDs between builds (docs cited in §2); old bundles cannot call these. The real stale-bundle behaviour: a cupper's tab open across a deploy gets "Server Action not found" on every save → all edits go amber/pending, submit blocked, until a reload. Data is safe locally; nothing tells the user to reload.
- Verification: Strongly supported (docs), not runtime-verified (depends on whether `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` / deployment pinning is used on Vercel; none is configured in the repo).
- Fix: detect the action-not-found error in `flushSave`/`replayModule` and show "Nueva versión: recarga" ; avoid deploying during live sessions (runbook note).

### C-07 — Low — duplicated refresh handlers after merges
- `CupClient.tsx:933-938` (useForegroundResume → `router.refresh()`), `1046-1053` (legacy owner visibilitychange → `router.refresh()`), `1031-1035` (SUBSCRIBED → `router.refresh()` for owner): up to three full RSC refetches per owner resume.
- `ResultsClient.tsx:552` effect deps include `session.samples` (new array per refresh) → the realtime channel is torn down and rebuilt on every `router.refresh()`.
- Verification: Strongly supported. Fix: delete the legacy visibility effect; depend on a stable sample-id key.

### C-08 — Low — claim re-key skipped after "Usar otra cuenta"
- `components/auth/ClaimCard.tsx:110-113` → `clearLocalDeviceState()` removes `CLAIM_ANON_KEY` (`lib/offline/deviceState.ts:49-52`); after signing in with the other account and confirming, `decideClaimRekey` has only the done marker → no re-key (verified with a temp test). Remaining anonymous blobs are stranded under a deleted user id, invisible to every panel. The pre-claim guard already warned or synced, so only work the guest accepted to lose is at risk.
- Fix: do not clear `CLAIM_ANON_KEY` in the switch-account path of an in-progress claim.

### Checked and found compliant (no finding)
- Every client consumer of an action whose shape changed in the series (≈30 call sites: submitAllEvaluations, finishSoloSession, revealSample, upsertExtrinsic, assignSampleCoffee, signOut, switchAccount, confirmGuestClaim, joinSessionAsGuest, checkJoinable, updateProfile, dismissOnboarding, duplicateCoffee, rotateCoffeeInvite, updateGroup, addMemberByUserId/Email, removeMember, createGroupPost, updateMemberDisplayName, resendInvitation, listSavedInsights, setGroupEmailOptOut, deleteAccount, getMyAccountDeletionImpact, verifyEmailCode, confirmEmailToken, requestEmailChange, startWarmup/stopWarmup, setEntriesLocked, createInviteToken, setReferenceSample) checks `.ok` or goes through `feedback.run`. Server-side callers of `notifyGroupOfSession` (`community.ts:369`, `sessions.ts:642`) handle the new shape. `closeSession` still throws but is wrapped by `ConfirmDialog` (sanctioned). `startSession` returns a plain object and CupClient reads it correctly.
- `NewSessionForm` redirect handling: Next 16 rejects the action promise with a redirect error (`server-action-reducer.js:215-234`), so `clearDraft()` in the `NEXT_REDIRECT` branch does run.
- Submit gate: flush → manual replay → recount → refuse; `failed` revived by the manual pass; terminal statuses do not block.
- Save-status honesty: amber derived from the store after every flush; never cleared by one synced module.

## 4. Traceability matrix

| Requirement / decision | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| S8-09 step 1 ordering (F-offline-2) | in-flight edit wins; older write never regresses row | client `ifUpdatedAt` + server `lastClientWriteAt`; stale snapshot still sent; clamp weakens ordering; physical/extrinsic unordered | C-01, C-02 | Partially compliant |
| Architect S8-09 #1 "client-only ordering, no migration" | no migration | S8-18 added migration `20261111160000…` + runbook entry | prisma/migrations, runbook l.1147 | Deviates (documented later decision) |
| Step 2 status machine, conflicts durable | rebuilt from blobs, survive reload | `rebuildConflicts` on mount and after every pass | useOfflineSync.ts:118-136, 310-314 | Compliant |
| Step 3 classified outcomes, 5 attempts → failed, terminal not blocking submit | as spec | as spec; `failed` still blocks but is revived by submit's manual pass | status.ts, CupClient 1441-1450 | Compliant (safer deviation) |
| Step 4 orphans kept, dismiss only on confirm | no auto-delete | `listTerminalEntries`, `removeModule` explicit; panel UI not reviewed | store.ts:346-393 | Partially verified |
| Step 5 self-healing retry + honest indicator (F-offline-6, F-solo-5) | timed retries, amber until all synced | timer 15 s→5 min, resume replay, store-derived indicator | useOfflineSync.ts:138-161; CupClient 456-472, 1249-1270 | Compliant |
| Step 6 sign-out / claim guards, rekey design (a) | warn/sync before leaving; rekey after claim | implemented; gap on switch-account | UnsyncedGuardProvider; C-08 | Partially compliant |
| Architect S8-09 #4 module-level lock | one replay at a time | `inflight` module variable | useOfflineSync.ts:47, 244-260 | Compliant |
| Step 7 SW cap, v3, user-change purge, insights/profile not cached, exclusions untouched | bounded, no offline harm | done; FIFO cap may evict core chunks | sw.js; C-04 | Partially compliant (risk) |
| Step 8 offline create + warm-up cache | offline disables submit, `offline` code; warm-up rebuilt without run clock | NewSessionForm/ExpressForm use `useConnectivity`; `warmupForCache/FromCache` tested | NewSessionForm 1499-1507, offlineCache.ts | Compliant |
| Replay outcomes returned, not thrown | statuses returned | yes for gone/rejected/closed/pending; transient errors still throw (intended) | offline.ts | Compliant |
| Legacy bundles keep working | old clients unaffected | old clients cannot reach new action IDs at all | Next docs | Not verifiable / assumption wrong (C-06) |
| S8-15 realtime resume (`resumeKey`) | effect re-runs on resume | Cup/Waiting/Results bump `resumeKey` | CupClient 933-1042, Waiting 236-354, Results 459-552 | Compliant (C-07 duplicates) |
| S8-11 waiting-room polling fallback | never stranded | dies after one network error | C-03 | Noncompliant |
| ActionResult contract on client callers | no ignored `.ok`, no dead try/catch | all checked call sites handle it | §3 checked list | Compliant |
| Warm-up one-clock / audio resume / synced re-seek | single clock; prompt on suspended ctx | `useRunClock` only; `audioResumeDecision` + `shouldResync` on visibility | WarmupPlayer.tsx:409-470 | Compliant (code review only) |

## 5. What I executed

- `git checkout --detach origin/claude/s8-21-loose-ends-impl` (HEAD 3713033); `npm ci` + `npx prisma generate` → exit 0.
- `npx tsc --noEmit` → exit 0, no errors.
- `npx vitest run` (full) → 112/114 files, 1086/1088 tests passed; 2 failures were 5 s timeouts (`tests/groupMailWiring.test.ts`, `tests/platformSeam.test.ts`) while tsc/lint ran concurrently. Re-run in isolation with the offline/ordering suites: 11 files, 71 tests, all passed.
- `npx eslint` (as invoked, ran the project lint) → exit 0.
- Temporary `tests/_audit_c_offline.test.ts` (9 tests, all passed as written): fast-clock clamp race (C-02) + control; status machine (5 retries → failed, waiting burns no attempt, stale result ignored, rejected → orphaned, conflict not blocking); `rekeyBlob` newer-wins; keyed queue survives a failing task; claim decision with only the done marker (C-08); waiting-room poll chain death (C-03). File deleted; `git status --short` clean.
- Read: Next 16 docs on server-action dispatch order and action-ID recalculation; `server-action-reducer.js` redirect handling.

## 6. Unverified, and what would settle it

- C-01 end-to-end: browser run with throttled network, owner edits physical during a replay pass, then DB read of `physical_evaluations.data`.
- C-04: production build + offline reload after browsing >120 static URLs.
- C-06: whether Vercel deployment uses a pinned `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`/skew protection; observe an open tab across a deploy.
- Prisma `update` with extended unique `where` + `OR` on `lastClientWriteAt` against Postgres (only a fake client is tested).
- Realtime delivery (RLS, publication) for all three channels; Capacitor/iOS resume and AudioContext behaviour; IndexedDB persistence over days; `navigator.storage.persist()` outcome.
- Orphan panel UI, PendingDraftsBadge refresh timing (it only listens to `OFFLINE_SYNC_EVENT`, not to local writes), SyncConflictModal behaviour when the cupper edits a conflicted module before resolving (the "keep submitted" path marks the module `synced` without an `ifData` guard).

## 7. Answers

- **Did the implementer correctly implement the architecture?** Mostly yes. The status machine, outcome classification, lock, guards, SW changes, offline create and warm-up cache match the specs and decisions, and every ActionResult consumer I traced is correct. The gaps are at the seams: the replay pass sends a stale snapshot (C-01/C-02) and a refactor of the waiting-room poll introduced a regression (C-03).
- **Was the architecture sound?** Largely. Two design weaknesses: ordering relies on payload freshness that the driver does not guarantee, with a clamp that trades one clock-skew failure for another; and a FIFO static cap that can evict the active build's runtime. The "cached bundle" compatibility rationale is based on an assumption Next 16 contradicts.
- **Most serious defects/risks**: C-01 (silent overwrite of owner physical/extrinsic), C-02 (stale evaluation wins on a fast clock), C-03 (waiting room stranded after one network blip), C-04 (offline boot can break).
- **Must fix before reliable**: re-read each module immediately before replay (fixes C-01 and most of C-02); make the waiting-room poll loop survive a rejection and guard `handleStart`; make the static cache LRU or raise/scope the cap. Then run the device checks the runbook already lists.
- **Uncertainties**: everything runtime — realtime delivery, iOS lifecycle, SW behaviour, Prisma conditional update on Postgres, deploy-time action-ID skew.
