---
domain: offline-native
researched: 2026-11-06
model: claude-sonnet
flows: [Offline y sincronización, native lens on every flow]
---

# Offline-first and native-readiness (Capacitor wrapper)

## 1. Scope

Covers: offline-first data handling (outbox, replay, idempotency, conflicts, sync status), service worker and PWA rules, connectivity honesty, and everything that changes when the web app runs inside a Capacitor WebView on iOS/Android. It is the cross-cutting native lens for every flow.
Left to other briefs: auth UX details (`auth-identity`), websocket collaboration semantics (`live-collab`), PDF content (`results-reporting`).
Context assumed: Next.js server app, hand-rolled SW, localforage drafts, conflict-aware replay action, Capacitor with `server.url`, iPhone users on flaky lab Wi-Fi, a future "create session offline by coffee code".
Evidence note: statements marked *(inference)* are reasoned from sources, not stated by them. No primary source was found for WKWebView storage eviction inside Capacitor (see section 7).

## 2. Principles

**P1. The local copy is the working copy; the network is optional.** Reads and edits work offline and sync later; the user never waits on a spinner for their own data. Source: Ink & Switch, "Local-first software" (ideals "no spinners", "the network is optional") https://www.inkandswitch.com/essay/local-first/ (2019, still the reference).

**P2. Every queueable write is an outbox entry with a client-generated stable id.** *(inference)* Replay means "resending requests that failed while offline" (MDN); a retried request must be idempotent, so the id (UUID / idempotency key) is created on the device at the moment of the user action, never by the server afterwards. This is also what makes offline creation (a session by coffee code) possible: child rows can reference a parent id the server has not seen yet. Source: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API (MDN).

**P3. The conflict policy is explicit per data type and never silent for submitted data.** Local-first reduces conflicts to concurrent edits of the same property of the same object, which the app or user must resolve. Single-author drafts can be last-writer-wins; finalised data must surface a choice instead of being overwritten. Source: https://www.inkandswitch.com/essay/local-first/.

**P4. Never present a local-only write as "saved".** Distinguish saved on device / pending sync / synced / conflict / failed; pending persists until a confirmed server ack. The ack, not a connectivity signal, is the truth, because connectivity signals are unreliable (P5). Source: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine (MDN); reasoning *(inference)*.

**P5. Connectivity is a probe result, not `navigator.onLine`.** MDN calls the property "inherently unreliable" (a LAN counts as online without Internet). Use a same-origin probe with a timeout, treat failed real requests as offline evidence, and retry with exponential backoff and jitter *(backoff: inference)*. Source: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine.

**P6. Do not depend on Background Sync.** It has "limited availability"; feature-detect and fall back to retrying when the app is next open or resumes. Source: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API. (Safari absence was not confirmed on the fetched page; check the MDN compatibility table.)

**P7. Cache strategy follows route type.** Static assets cache-first; frequently changing HTML/data network-first with cache fallback; network-only where there is no offline equivalent. Version cache names, delete old versions in `activate`, keep activation lean, prune dynamic caches. Source: https://web.dev/articles/offline-cookbook (web.dev).

**P8. Auth, API and probe requests are never served from cache; user-specific caches die with the session.** A cached probe produces false "online", a cached auth redirect a false session. *(inference; the network-only category is from web.dev)* Source: https://web.dev/articles/offline-cookbook.

**P9. Assume Safari may delete script-writable storage.** WebKit ITP: after 7 days of Safari use without user interaction on a site, script-writable storage (IndexedDB, localStorage, SW registrations and caches) is deleted. Home-screen web apps have their own usage counter and WebKit calls deletion there "a serious bug". So unsynced work in a Safari tab is at risk: request `navigator.storage.persist()` (the browser may decline) and make pending work visible. Sources: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ (2020); https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist (MDN).

**P10. A native shell must add real native value (Apple 4.2).** Apps must "elevate it beyond a repackaged website" and not primarily be "web clippings ... or a collection of links". A thin website wrapper invites rejection; push, share sheet, file save, in-app scanner and durable storage are the differentiators. Source: https://developer.apple.com/app-store/review/guidelines/ (Apple, current).

**P11. `server.url` is documented as a development feature.** Capacitor says `server.url`, `cleartext` and `allowNavigation` are "not intended for use in production"; URLs outside the allow-list open in the external browser. Using it in production is a conscious risk, not a default. Source: https://capacitorjs.com/docs/config.

**P12. OAuth runs in the system browser, never in the WebView.** Google forbids sending authorization requests to an embedded user-agent. Use the Capacitor Browser plugin (SFSafariViewController on iOS) and return through a deep link. Apple 4.8 also requires an equivalent privacy-preserving login option when a third-party/social login is the primary account method (whether magic link qualifies as the company's own system needs confirmation). Sources: https://developers.google.com/identity/protocols/oauth2/policies#browsers; https://capacitorjs.com/docs/apis/browser; https://developer.apple.com/app-store/review/guidelines/.

**P13. Deep links are verified HTTPS links on a domain you own.** iOS: `apple-app-site-association` at `/.well-known/` plus Associated Domains. Android: `assetlinks.json` plus an `autoVerify` intent filter. The OS does not route the URL: an `appUrlOpen` listener must map it to a router path. Supabase notes the AASA file is self-hosted, must be JSON over HTTPS without redirects, and redirect URLs must be allow-listed. Sources: https://capacitorjs.com/docs/guides/deep-links; https://supabase.com/docs/guides/auth/native-mobile-deep-linking; https://developer.android.com/training/app-links/verify-android-applinks.

**P14. Use app lifecycle events, not only `visibilitychange`/`beforeunload`.** Capacitor `appStateChange`/`pause`/`resume` map to iOS resign/become-active, Android `onStop`/`onResume`, and `visibilitychange` on web. Flush drafts on pause; re-probe and re-join realtime on resume. On Android, adding a `backButton` listener disables default back behaviour. Source: https://capacitorjs.com/docs/apis/app.

**P15. Files leave the WebView through native plugins.** `Filesystem.writeFile` takes base64 for binary (Blob is web-only); on Android 11+ `Documents` exposes only app-created files; `Share.share` with `files` needs `file://` URLs (Android: cache folder by default, others via `file_paths.xml`); `downloadFile` is deprecated in favour of `@capacitor/file-transfer`. Sources: https://capacitorjs.com/docs/apis/filesystem; https://capacitorjs.com/docs/apis/share.

**P16. Push is native (APNs/FCM) and never the only path to state.** Needs the iOS capability, FCM `google-services.json`, Android 13+ runtime permission; data-only pushes are not supported on iOS by the plugin; Doze can delay Android delivery. Source: https://capacitorjs.com/docs/apis/push-notifications.

## 3. Audit checklist

### Offline
1. Does every queued write (evaluation, note, session create) carry an id generated on the device before the first send? (P2)
2. Is the server write idempotent for that id (upsert or unique key), so a double replay cannot duplicate or regress data? (P2)
3. Is the conflict rule defined per data type, and does "submitted vs local draft" return an explicit conflict instead of overwriting? (P3)
4. Can a conflict reach the user with a choice (keep mine / keep server), and is "force" reachable only from that choice? (P3)
5. Is there any path that discards queued data without telling the user (closed session, expired auth, parse failure)? (P3, P4)
6. Does the "saved" state appear only after a server ack, with a distinct persistent "pending on this device" state? (P4)
7. Is there an app-wide pending indicator (outside the screen that created the data) with a count and a manual "sync now"? (P4)
8. Does connectivity use a real probe with a timeout, and do failed real requests also flip state, rather than trusting `navigator.onLine`? (P5)
9. Is retry bounded with exponential backoff and jitter, and does it behave on a captive-portal or LAN-only network? (P5)
10. Is replay ordered and resumable, so one failed item neither blocks nor silently drops the rest? (P2, P5)
11. If Background Sync is used, is it feature-detected with a resume/open fallback? (P6)
12. Does the SW exclude non-GET, cross-origin (websocket), `/api/*`, `/auth/*` and the probe route before any caching logic? (P8)
13. Do caches have versioned names, deletion of old versions in `activate`, a size cap on dynamic caches, and a documented rule for bumping the version? (P7)
14. Is cache-first limited to hashed/static assets, with network-first plus fallback for HTML/RSC? (P7)
15. Is there a user-visible "new version available" path rather than a silent `skipWaiting` mid-edit? (P7) *(inference)*
16. Does the app call `navigator.storage.persist()` (guarded) and handle a `false` result? (P9)
17. Does the app warn when unsynced work is older than a few days and the app runs in a non-installed Safari tab? (P9)
18. Does sign-out clear user-specific caches and pointers while keeping, or explicitly handling, unsynced drafts? (P8, P9)
19. For offline session creation: are the coffee catalogue and coffee-code lookup available locally, and are all child rows keyed by client ids? (P2)

### Native-readiness (apply to every flow)
20. Are downloads and PDF opens routed through one abstraction (web: anchor/`?inline=1`; native: Filesystem + Share) instead of raw `<a download>`/`window.open`? (P15)
21. Are `navigator.share`, `navigator.clipboard` and `window.print` wrapped in a helper with feature detection and a native branch? (P15)
22. Is any OAuth or external link opened via `window.location`/`window.open` in a way that would stay inside the WebView? (P12)
23. Is platform detection (`Capacitor.isNativePlatform()`) in exactly one place, not scattered UA sniffing? (P10)
24. Do auth callbacks and invite/QR links work as plain HTTPS URLs that universal/App Links can claim? (P13)
25. Is there one router-level handler able to receive an opened URL (`appUrlOpen`) and map `/join/*`, `/auth/*`, `/app/*`? (P13)
26. Are `beforeunload`/`pagehide`/`visibilitychange` flushes behind a lifecycle abstraction that can also listen to `pause`/`resume`? (P14)
27. On resume, does the code re-probe connectivity, refresh the auth session and re-subscribe realtime channels? (P14)
28. Do layouts use `100dvh`, `env(safe-area-inset-*)` and `viewport-fit=cover`, with keyboard-open handling, instead of `100vh` and fixed bottom bars? (P10) *(inference: no Capacitor primary source fetched)*
29. Is QR join usable without a camera (typed code, link) and structured so a native scanner can feed the same handler? (P10)
30. Does the wrapper plan include at least one native-only capability beyond the website (push, share, file save, scanner, durable storage)? (P10)
31. Does every Google sign-in path have a system-browser route, and is a non-social option present? (P12)
32. Does any server action or page assume same-site cookies in a way that breaks under `capacitor://` or `https://localhost` origins (CORS, SameSite)? (P11) *(inference)*
33. Are push tokens stored per device and unregistered on sign-out, and does the app re-fetch state rather than trust payloads? (P16)
34. Are timers (cupping and warm-up clocks) derived from server/epoch time so a backgrounded WebView catches up on resume? (P14) *(inference)*

## 4. Anti-patterns

- **"Saved" toast on a local write.** Users close the app trusting data that never reached the server. (P4)
- **Trusting `navigator.onLine`.** LAN-without-Internet reads as online; replay is skipped or fails silently. (P5)
- **Server-generated ids for offline-created things.** Replay duplicates rows or cannot link children. (P2)
- **Replay overwriting a submitted row.** Silent loss in the one case that must ask. (P3)
- **Caching an auth redirect or the health probe.** False "online", stale sessions. (P8)
- **Unversioned SW caches.** Old JS meets a new server; server action calls can break after a deploy. *(inference)* (P7)
- **Relying on Safari-tab storage for days of unsynced work.** ITP can delete it. (P9)
- **Google sign-in inside the WebView.** Blocked by Google policy. (P12)
- **Shipping `server.url` as a pure website shell.** Apple 4.2 rejection risk and no offline shell. (P10, P11)
- **`<a download>` or blob URLs for PDFs in the WebView.** Likely does nothing useful; Capacitor's file path is Filesystem + Share. *(inference)* (P15)
- **Only `visibilitychange` to flush.** Not a guarantee on kill; pair with debounced saves and `pause`. (P14)
- **Push as the only notification path.** Doze, denied permission or locked private space lose messages. (P16)

## 5. Native-app considerations: Capacitor migration checklist

1. **Shell mode.** A server-component Next.js app cannot ship as a purely bundled static build *(inference)*, so the realistic options are `server.url` to production (documented as dev-only, P11) or a thin local shell that loads the site plus native bridges. Record the choice and the 4.2 argument. Keep `allowNavigation` minimal.
2. **Native value list for review (P10).** In-app QR scanner (camera usage string in Info.plist), share sheet for PDFs, file save, push, and a durable-storage mirror of the draft outbox. Provide demo credentials to App Review.
3. **Storage.** Do not assume WKWebView IndexedDB is immune from eviction (no primary source found; test on device over weeks). Mirror the outbox to a native store (Preferences/SQLite) and restore when IndexedDB is empty. Still call `persist()`.
4. **Auth.** Keep Supabase cookie sessions on the remote origin. For OAuth: Browser plugin -> system browser -> universal link back (`appUrlOpen`) -> site completes the callback. Allow-list redirect URLs in Supabase. Resolve the Apple 4.8 equivalence question for Google sign-in.
5. **Deep links.** Host `apple-app-site-association` and `assetlinks.json` on the production domain with no redirects; add Associated Domains and `autoVerify`; implement an `appUrlOpen` router for `/join/*`, `/auth/claim`, `/app/sessions/*`. Test Android with `adb shell pm get-app-links`; on Android 15+ re-verification after a file change can take up to 7 days.
6. **QR join.** In-app scanner opens the same `/join/<token>` route; keep the HTTPS link canonical so camera-app cold starts also work through universal links.
7. **Files.** Abstract `saveOrOpenPdf(url, filename)`: authenticated fetch, base64, `Filesystem.writeFile` (cache), `Share.share({ files: [uri] })`; configure Android `file_paths.xml`; use `@capacitor/file-transfer` for large files.
8. **Push.** APNs key and capability, FCM config, Android 13 permission flow, notification channel, token registration tied to user, unregister on sign-out. Use for "session started", "results ready".
9. **Lifecycle.** On `pause` flush the outbox; on `resume` re-probe, refresh session, re-join realtime, resync clocks. Handle Android `backButton` explicitly.
10. **Viewport and input.** `viewport-fit=cover`, safe-area insets, `dvh`, keyboard behaviour on iPhone, no hover-only controls.
11. **Service worker in the WebView.** Verify registration under the chosen origin, that the exclusion list still holds, and that a first launch with no network shows a native-feeling fallback (equivalent of `OfflineFirstLoadError`).
12. **Identity and assets.** Replace placeholder icons and splash; add usage strings and privacy declarations.
13. **Release hygiene.** The web deploys instantly to all installs: keep server actions and API backward compatible with older shells; add a minimum-version check or kill switch.

## 6. Vocabulary

| Español | English | Meaning |
|---|---|---|
| bandeja de salida | outbox | Durable queue of local writes awaiting server ack |
| reenvío / reintento | replay / retry | Resending queued writes after reconnect |
| clave de idempotencia | idempotency key | Client id that makes a retried write safe |
| conflicto | conflict | Local and server both changed the same record |
| el último gana | last-writer-wins (LWW) | Newest write replaces the older without asking |
| pendiente de sincronizar | pending sync | Saved only on this device |
| sondeo de conectividad | connectivity probe | Real request used to decide online/offline |
| envoltorio nativo | native wrapper | Capacitor shell around the web app |
| enlace universal / App Link | universal link / App Link | Verified HTTPS link that opens the app |
| enlace profundo | deep link | URL that opens a specific in-app route |
| service worker | service worker | Script that intercepts fetches and caches |
| almacenamiento persistente | persistent storage | Origin storage the browser promises not to evict |
| primer / segundo plano | foreground / background | App lifecycle state |
| notificación push | push notification | APNs/FCM native message |

## 7. Open practice questions

- Production `server.url`, or a hybrid with a local fallback shell? What is the plan if App Review cites 4.2?
- Does App Review accept magic link as satisfying 4.8 next to Google sign-in? (Only the guideline wording was read.)
- What is the real IndexedDB persistence behaviour in WKWebView for the Capacitor origin? No primary source found; must be tested on device.
- Should an offline replay ever overwrite a submitted evaluation, even with "force"? Product/Kim decision.
- Offline session creation by coffee code: how fresh must the local catalogue be, and what if a code is claimed or changed meanwhile?
- Scanner plugin choice: the vendor docs page failed to load, so no vetted comparison is included.
- Supabase-in-Capacitor specifics (storage adapter, session persistence across WebView restarts): no Capacitor-specific Supabase doc found.

## 8. Sources

- Capacitor Push Notifications API, 2025/26: https://capacitorjs.com/docs/apis/push-notifications
- Capacitor Filesystem API, 2025/26: https://capacitorjs.com/docs/apis/filesystem
- Capacitor Share API, 2025/26: https://capacitorjs.com/docs/apis/share
- Capacitor Browser API, 2025/26: https://capacitorjs.com/docs/apis/browser
- Capacitor App API, 2025/26: https://capacitorjs.com/docs/apis/app
- Capacitor configuration, 2025/26: https://capacitorjs.com/docs/config
- Capacitor deep links guide, 2025/26: https://capacitorjs.com/docs/guides/deep-links
- Apple App Review Guidelines (4.2, 4.8), current: https://developer.apple.com/app-store/review/guidelines/
- Android Developers, verify Android App Links, current: https://developer.android.com/training/app-links/verify-android-applinks
- Supabase, native mobile deep linking, current: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Google OAuth 2.0 policies (secure browsers), current: https://developers.google.com/identity/protocols/oauth2/policies#browsers
- MDN, Background Synchronization API, current: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- MDN, StorageManager.persist(), current: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN, Navigator.onLine, current: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- web.dev, The Offline Cookbook: https://web.dev/articles/offline-cookbook
- WebKit blog, Full Third-Party Cookie Blocking and More (7-day cap), 2020: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Ink & Switch, Local-first software, 2019: https://www.inkandswitch.com/essay/local-first/
