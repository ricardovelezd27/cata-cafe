# S8-15 — Native-readiness foundation

> **When:** after S8-06 (`?next=` and the OTP code path) and S8-09 (reuse its `storage.persist()` call if it landed); S8-12 adds the CSV link this seam wraps · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** a physical iPhone (ideally an Android) for the checklist; no SQL, no migration
> **Findings:** 6 (0 P1 · 0 P2 · 6 P3) from `docs/audits/flows-2026-11/14-informes-pdf.md`, `10-resultados.md`, `17-insights-admin.md`, `01-entrar.md`, `15-offline-sync.md`, `16-movimiento-sensorial.md` · **Gated on Kim:** E5 (does not block)

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read docs/expertise/offline-native.md §3 "Native-readiness" and §5,
docs/product/native-app.md, and the audit files named below finding by finding (§7 and §4 "Keep" included).
Goal: the web app behaves EXACTLY as today, but everything that would misbehave in a Capacitor WebView goes
through one seam (`lib/platform/`), so adding the shell later is plugin wiring. No Capacitor dependency is
installed in this PR: native branches are documented TODO stubs. Out of scope: the shell itself, push, the
SQLite mirror, QR scanner, hosting universal-link files. The lead owns steps 1, 3 and 5; Sonnet may do the
call-site routing (2) and checklist text (6). One commit per step, `npx tsc --noEmit && npm run lint &&
npm test` before each, Definition of done in the PR description. No bare `git stash`.
```

## 2. Findings covered

| Id | Sev. (final) | Verdict | One line | File |
|---|---|---|---|---|
| F-informes-4 | P3 | PLAUSIBLE (downgraded) | `window.print`, `target=_blank`, attachment downloads have no WebView path; `cva-pdf` ignores `?inline=1` | `14` |
| F-resultados-9 | P3 | inferred | Footer PDF links are plain anchors; offline they hit a browser error | `10` |
| F-insights-8 | P3 | inferred | Users CSV uses a blob link click a WebView will not save | `17` |
| F-entrar-8 | P3 | inferred | Google button dead in in-app browsers; no system-browser route | `01` |
| F-offline-8 | P3 | PLAUSIBLE (downgraded) | No `storage.persist()`; no warning for old unsynced drafts | `15` |
| F-movimiento-sensorial-2 | P3 | PLAUSIBLE (downgraded) | Synced warm-up never shows a lost wake lock or re-syncs after sleep | `16` |

Files are under `docs/audits/flows-2026-11/`. The static-cache cap in F-offline-8 stays with S8-09 (needs a `SW_VERSION` bump); do not touch `public/sw.js`.

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| E5 | How often do you cup without signal; must you create a session offline? | (b) sometimes; keep cupping if the network drops | Nothing here depends on it; it decides the later storage mirror and offline create |

## 4. Plan

1. **The platform seam** — new client-only `lib/platform/`: `env.ts` (`isNativeShell()` reads `window.Capacitor?.isNativePlatform?.()`, injectable `win` for tests; the ONLY place that sniffs the shell), `files.ts` (`downloadFile({ url | blob | text, filename, mime })`, `shareFile`), `print.ts` (`printPage`), `external.ts` (`openExternal`), `openReport.ts` (`openReport(url, filename)`: authenticated fetch, then `downloadFile`/`shareFile`; returns `offline` without fetching when `useConnectivity` says so). Web implementations now: download anchor, `navigator.share({ files })` when `canShare`, `window.print()`, `window.open(url, "_blank", "noopener")`. Native branches are `// TODO(native)` stubs naming the call (`Filesystem.writeFile` + `Share.share`; `Browser.open`; print becomes share-the-PDF). Helpers return `{ ok, via }` and never throw. Covers: F-informes-4, F-resultados-9.
2. **Route every call site** — `PrintClient.tsx:1225,1270`; `results/ResultsClient.tsx:943-981` (new `components/ui/ReportLink.tsx`: same `<a href target=_blank>` on web, intercepts only in the shell, disabled with "necesita conexión" offline); `coffees/[id]/page.tsx:512`; `components/insights/UsersDirectory.tsx:55-65` (hidden in the shell, `downloadFile` on web); `components/insights/InsightCardComposer.tsx:163`; `components/ui/InviteQR.tsx:45`; the S8-12 CSV link. `app/api/sessions/[id]/cva-pdf/route.ts` honours `?inline=1` like `participant-summary`. `tests/platformSeam.test.ts` scans source and fails on `window.print`, `window.open`, `createElement("a")` + `.click()` outside `lib/platform/` (allow-list `ReportLink`'s plain anchor). Covers: F-informes-4, F-resultados-9, F-insights-8.
3. **Foreground resume hook** — `hooks/useForegroundResume.ts` over pure `lib/platform/resume.ts`: `cb(reason)` on `visibilitychange` to visible after ≥ `minHiddenMs` (2000) and on `online`, bursts deduped within 1 s, `// TODO(native)` for Capacitor `appStateChange`. `hooks/useConnectivity.ts` also returns `recheck()`. Adopt in `cup/CupClient.tsx` (channel `:804`), `waiting/WaitingRoomClient.tsx` (`:252`), `results/ResultsClient.tsx` (`:383`): on resume run `recheck()`, `supabase.auth.getSession()`, remove and recreate the channel, then re-seed (cup: refetch samples; waiting: `getWaitingState`; results: `router.refresh()`). The existing `pagehide` flush at `CupClient.tsx:745-785` stays; the hook re-attaches, it does not save. Channel names and `flushSave` honesty unchanged.
4. **Warm-up synced resume** — `components/warmup/WarmupPlayer.tsx`, synced mode only: on resume recompute position from `warmupStartedAt` + skew via `lib/warmup/syncedRun.ts` (`seekFor`, `isMissed`; math stays there), re-seek if drift > 1 s, take the missed path if under 20 s remain. Show a small persistent "pantalla encendida / puede apagarse" note when `useWakeLock` is `denied` or dropped (shell: keep-awake plugin, TODO). Library and session modes unchanged; add a resume case to `tests/warmup-syncedRun.test.ts`. Covers: F-movimiento-sensorial-2.
5. **Storage, in-app browsers, deep links** — (a) `lib/platform/storage.ts`: `requestPersistentStorage()` runs `navigator.storage.persist()` once after the first successful `saveSession` (`lib/offline/store.ts:108`), records `{ outcome, at }` in `localStorage` key `cata_storage_persist` (try/catch), exposes `getPersistState()`; `components/offline/PendingDraftsBadge.tsx` warns when a draft is over 3 days old and the app is not standalone. The store stays client-only and never rejects. Covers: F-offline-8. (b) `lib/platform/inAppBrowser.ts` (`detectInAppBrowser(ua)`: Instagram, Facebook, WhatsApp, Line, TikTok; pure): at `auth/login/LoginForm.tsx:69` those user agents get an "ábrelo en tu navegador" hint with copy-link instead of the Google button; email/OTP stays first. Native TODO in `app/actions/auth.ts`: `signInWithOAuth({ skipBrowserRedirect: true })` → `openExternal` → return via `appUrlOpen`. Covers: F-entrar-8. (c) `lib/platform/deepLink.ts`: pure `routeFromUrl(url)` accepts only the production origin and maps `/{locale}/join/*`, `/{locale}/auth/claim`, `/{locale}/app/*` to in-app paths, keeping `?next=` through `lib/safeNext.ts`, else `null`.
6. **Device checklist** — create `docs/native/device-checklist.md` (new folder), pass/fail rows for iOS Safari standalone PWA and a Capacitor dev build: storage after 7 idle days with 3 unsynced drafts; Google OAuth in the system browser and return; magic-link OTP code inside the shell; CVA, summary, ficha and CSV save or share; print replaced by share; QR camera join and typed-code fallback; background 30 s, lock 10 s and airplane toggle in cup, waiting room, results and synced warm-up (cue offset ≤ 1 s); deep links cold and warm for `/join`, `/auth/claim`, `/app/sessions`; no `window.confirm`, safe-area insets, `dvh`. Each row: steps, expected, result, build id, date. Include the entry contract: every `/app/*` login redirect carries `?next=` (S8-06).
7. **Docs** — CLAUDE.md "Platform seam" paragraph (no raw print/open/blob download or platform sniffing outside `lib/platform/`), `docs/flows.md` §4 note, Fixed-in lines in the six audits.

## 5. Acceptance (tests to write or checks to run)

- F-informes-4 / F-resultados-9: with `isNativeShell` stubbed true, `ReportLink` calls `openReport`; offline it is disabled with the copy; the web click still opens a new tab; `cva-pdf?inline=1` returns inline disposition.
- F-insights-8: shell hides the export; web download unchanged.
- F-entrar-8: Instagram and WhatsApp user-agent fixtures show the hint and the email form; sniffing only in `lib/platform`.
- F-offline-8: persist outcome recorded once; stale-draft warning at 3 days (injectable clock).
- F-movimiento-sensorial-2: lock 10 s, return within ~1 s of the host; wake-lock note shows in synced mode only.
- `tests/platformSeam.test.ts`, `platformEnv`, `platformResume`, `platformDeepLink` (including an open-redirect attempt) green; realtime delivers after resume.

## 6. Manual steps for Ricardo

- Run `docs/native/device-checklist.md` on a physical iPhone (standalone PWA now, Capacitor build later) and record results. No SQL, migration or env var.

## 7. Risks and rollback

- Intercepting clicks could break the web path: the anchor stays default, interception is shell-only; revert step 2.
- Re-subscribing on `online` could double-subscribe: the hook dedupes and clients remove the old channel first.

## 8. Native-readiness clause

- This PR is the clause. Later PRs: no raw `window.print`/`window.open`/blob downloads or shell sniffing outside `lib/platform/`; every new `/app/*` redirect carries `?next=`.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (the four `tests/platform*.test.ts` files)
- [ ] docs/flows.md and CLAUDE.md updated; audit files get `Fixed in S8-15 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the login hint, offline report links and the warm-up note
- [ ] checklist committed; iOS standalone PWA rows run or listed as pending in the PR description
- [ ] E5 noted, no work left behind
