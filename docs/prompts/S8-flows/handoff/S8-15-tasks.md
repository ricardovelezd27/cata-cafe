S8-15 PLAN (checked against origin/claude/s8-03-guest-guard-email-impl)

1. BUILDABLE NOW
No step is tied to a Kim answer. E5 is explicitly non-blocking. Everything is web-only with `// TODO(native)` stubs, and no Capacitor dependency is added.
- T1 Platform seam. New client-only `lib/platform/`: `env.ts` (`isNativeShell`, injectable `win`), `files.ts` (`downloadFile`, `shareFile`), `print.ts`, `external.ts`, `openReport.ts`. Helpers return `{ ok, via }` and never throw. Closes F-informes-4, F-resultados-9, F-insights-8.
- T2 Route the call sites.
  - `PrintClient.tsx:1225,1270` use `printPage`.
  - New `components/ui/ReportLink.tsx`, used at `ResultsClient.tsx:943-981`.
  - Coffee ficha link at `coffees/[id]/page.tsx:511-512`.
  - `UsersDirectory.tsx:58-62` use `downloadFile`.
  - `InsightCardComposer.tsx:160-163` and `InviteQR.tsx:42-45` use `downloadFile`.
  - `cva-pdf/route.ts:134` honours `?inline=1` like `participant-summary/route.ts:56,158`.
  - Add `tests/platformSeam.test.ts` and `tests/platformEnv.test.ts`. Closes the same three findings.
- T3 `lib/platform/inAppBrowser.ts` (pure `detectInAppBrowser`). `LoginForm.tsx` (Google handler at line 68) swaps the Google button for an "open in your browser" hint with copy-link. Email stays first. Native TODO in `app/actions/auth.ts`. Closes F-entrar-8. Add i18n keys in both locales and a UA-fixture test.
- T4 `lib/platform/deepLink.ts` (pure `routeFromUrl`, via `lib/safeNext.ts`, `safeNext(next)` exists). Test includes an open-redirect case.
- T5 `lib/platform/storage.ts` (`requestPersistentStorage`, `getPersistState`, key `cata_storage_persist`). Call it after the first successful `saveSession` (`lib/offline/store.ts:108`). `PendingDraftsBadge` warns when a draft is older than 3 days and the app is not standalone, with an injectable clock. Closes F-offline-8, except the SW cap, which stays with S8-09.
- T6 `lib/platform/resume.ts` plus `hooks/useForegroundResume.ts`, and `recheck()` on `useConnectivity`. Adopt in Cup, Waiting and Results (see FACTS 3). Closes the resume half of F-movimiento-sensorial-2.
- T7 `WarmupPlayer` synced-mode resume. It recomputes position via `syncedRun.seekFor`/`isMissed`, re-seeks on drift above 1 s, and shows a persistent wake-lock note in synced mode only. Add a resume case to `tests/warmup-syncedRun.test.ts` plus `tests/platformResume.test.ts`. Closes F-movimiento-sensorial-2.
- T8 `docs/native/device-checklist.md`. Rows are listed as pending (no device available).
- T9 Docs: CLAUDE.md "Platform seam" paragraph, `docs/flows.md` §4 note, and "Fixed in S8-15" lines in the six audits. The PR number is unknown until merge; leave the placeholder.

2. GATED
- E5 (offline create / SQLite mirror): non-blocking. Leave `// TODO(E5)` in `lib/platform/storage.ts` and one line in the checklist.
- Device-run rows of the checklist and the 390x844 / 1280 screenshots on a physical iPhone need the owner. Mark them pending in the PR body.
- The S8-12 CSV link does not exist yet, so there is nothing to route. Leave `// TODO(S8-12)`. The same applies to S8-06's OTP and `?next=` rows (checklist only).
- Native branches (Filesystem, Share, Browser, `appStateChange`, keep-awake, `skipBrowserRedirect`) are all TODO stubs by design.

3. FACTS FOR THE ARCHITECT
- Realtime resume. The spec says "remove and recreate the channel + `getSession()`". All three clients (Cup:800, Waiting:248, Results:379) now use `subscribeWithSessionAuth` (`lib/supabase/realtimeAuth.ts`), which already awaits the session, sets the socket auth and owns cleanup.
  - Design A: bump a `resumeKey` state so the existing effect re-runs. Cleanup then recreates the channel through the helper. This is smaller and safer, and I recommend it.
  - Design B: hand-roll `removeChannel` plus subscribe. This duplicates the helper.
- `useConnectivity` has no `recheck()` yet and its `ping` is private to the effect, so lift it into a ref or callback.
- Waiting room: `getWaitingState` is already imported (`WaitingRoomClient.tsx:9,291`), so re-seed there is trivial. Cup has no refetch action, so "refetch samples" probably means `router.refresh()`. Confirm.
- F-movimiento-sensorial-2 is listed in both S8-13 and S8-15. S8-13 is partly gated on F1. Assign T7 to one PR only.
- `storage.persist()` and the stale-draft warning are listed in both S8-09 and S8-15. Spec 15 says "reuse S8-09 if landed", and it has not. Decide the owner. Building it here is fine, but note S8-09 must reuse it.
- `wakeDenied` currently only reaches the intro panel (`WarmupPlayer.tsx:727`, note at ~1026). Synced mode opens in `run`, so the note is never shown. `useWakeLock` returns `{ denied, held }`, so "dropped" can use `!held`.
- `ResultsClient` line 943: the CVA PDF link has no `target` or `inline`. The spec's "intercept only in shell" is fine. `ButtonLink` may need an `onClick` prop or a wrapper.
- F-resultados-9 offline disabling needs `useConnectivity` inside `ReportLink`. The Results page is a client component, so it works. The coffee page is a server component, so `ReportLink` must be a small client island.
- The blob download in `UsersDirectory` is inside `feedback.run(..., onOk)`. Keep that wrapper when swapping in `downloadFile`.
- `InsightCardComposer` and `InviteQR` use `toPng` data URLs, not blobs. `downloadFile` must accept a `url` (data URL).
- The seam test scans source for `window.print`, `window.open` and `createElement("a")` outside `lib/platform`. The current hits are exactly the 6 sites above (PrintClient x2, InsightCardComposer, UsersDirectory, InviteQR). There is no existing `window.open`.
- Batch 1 does not conflict with this spec. `lib/safeNext.ts` exists. The spec's "S8-06 `?next=` and OTP" is not merged, so the OTP and deep-link checklist rows stay descriptive.
- The offline blob has `updatedAt` per sample and module (`lib/offline/types.ts`). Use it for draft age.
- `useRunClock` handles `visibilitychange` only for pause (`pauseOnHide`). The synced resume needs its own listener, ideally the new hook.

4. FILES TOUCHED
- New: `lib/platform/{env,files,print,external,openReport,storage,inAppBrowser,deepLink,resume}.ts`, `hooks/useForegroundResume.ts`, `components/ui/ReportLink.tsx`, `docs/native/device-checklist.md`, `tests/platform{Seam,Env,Resume,DeepLink,InAppBrowser,Storage}.test.ts`.
- Edited: `app/[locale]/app/sessions/[id]/print/PrintClient.tsx`, `.../results/ResultsClient.tsx`, `.../cup/CupClient.tsx`, `.../waiting/WaitingRoomClient.tsx`, `app/[locale]/app/coffees/[id]/page.tsx`, `app/api/sessions/[id]/cva-pdf/route.ts`, `components/insights/{UsersDirectory,InsightCardComposer}.tsx`, `components/ui/InviteQR.tsx`, `components/offline/PendingDraftsBadge.tsx`, `lib/offline/store.ts`, `hooks/useConnectivity.ts`, `components/warmup/WarmupPlayer.tsx`, `tests/warmup-syncedRun.test.ts`, `app/[locale]/auth/login/LoginForm.tsx` (+ its page), `messages/{es,en}.json`, `CLAUDE.md`, `docs/flows.md`, 6 audit files under `docs/audits/flows-2026-11/`.
- Prisma migration: none. SQL phase: none. Runbook section: none. No env var.

5. SIZE: M. It is worth its own PR: all six findings are P3 and nothing is gated. The risk is regressions on the web click path (the anchor stays default) and in Cup realtime (T6), so keep T6 in its own commit.