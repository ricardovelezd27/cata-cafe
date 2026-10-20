# Native app memo — S6 CP-E4 (2026-10-20)

**Question:** should cafesensible.ai ship in the App Store / Google Play before the Madrid Coffee
Festival (Jan/Feb 2027), and how?

## TL;DR / recommendation
1. **Do not build React Native.** It means rewriting every screen (cup flow, results, PDF) for a product that is a Next.js server-rendered app with server actions. Not feasible for Jan/Feb 2027 and no gain Kim's users need.
2. **Ship the PWA as the Madrid answer** (installable today: `app/manifest.ts`, `public/sw.js`, offline drafts in IndexedDB). Make "Add to Home Screen" a guided step in onboarding and on the QR join page.
3. **If stores are a hard requirement, wrap with Capacitor** (iOS + Android from one config) pointing at the production site (`server.url`), plus real native value so Apple does not reject it as a repackaged website. Treat it as a **post-Madrid, ~3–4 week** project, started in Nov 2026 only if Ricardo wants a store presence for credibility.
4. **TWA (Bubblewrap) is the cheapest Android-only path** (a few days, hours of config) but covers 0% of iOS, and Kim's cohort is mostly iPhone. Only worth it as a bonus once Capacitor is rejected.

## Options compared
| | PWA only (today) | TWA (Android) | Capacitor (iOS+Android) | React Native/Expo |
|---|---|---|---|---|
| Reuses current code | 100% | ~100% | ~95% (wrap + plugins) | ~10% (logic only) |
| Store presence | none | Play only | both | both |
| Offline | SW + IndexedDB (works) | same engine as Chrome | same, but inside WKWebView / Android WebView | native storage (SQLite) |
| Push | web push (iOS only when installed) | web push | native push (APNs/FCM) | native push |
| Effort to Madrid | 0 | 2–4 days | 3–4 weeks incl. review | 4+ months |
| Main risk | iOS install friction | Play account rules | Apple rejection (guideline 4.2) | scope |

## Costs and review timelines
- **Apple Developer Program: $99/yr** (annual, lapse = app pulled). Apple says it reviews most submissions in <24–48 h ([source summary](https://magora-systems.com/publish-app-on-app-store/)); forum reports for first submissions range 6–10+ days ([example](https://developer.apple.com/forums/thread/839107), [example](https://developer.apple.com/forums/thread/816589)). Budget **1–2 weeks** for first approval plus one rejection round.
- **Google Play: $25 one-time** ([source](https://www.perfectiongeeks.com/mobile-app-development/guides/cost-of-app-store-submission)). New **personal** accounts must run a closed test with **12 testers opted in for 14 continuous days** before production access ([Google help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB), [explainer](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026)). An **organization** account (needs a D-U-N-S number — Just a Simple Company S.L. would qualify) is reported to be exempt; verify on Google's site. Plan **3 weeks** for Android if personal.
- Unverified in my search (check before committing): Apple Guideline 4.2 (minimum functionality) text — wrappers that are "just a website" are routinely rejected; mitigation is native features (push, share sheet, file save for the PDF, camera/QR scanner, offline queue indicator) and a demo account in review notes.

## What native/offline would actually gain
Today the offline model (see `docs/flows.md`, `lib/offline/*`) is draft-evaluations-in-IndexedDB while a session already exists. Gains a shell could add:
- **Durable storage on iOS.** Safari deletes script-writable storage (IndexedDB, SW caches) after 7 days without use ([Didomi summary](https://docs.didomi.io/releases-and-announcements/announcements/apple-implements-7-day-cap-on-script-writable-storage), [Search Engine Land](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519)). Home-screen PWAs have their own usage counter, but there are conflicting reports of eviction anyway ([WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=211775)). I found no source on WKWebView (Capacitor) behavior — **test on a real device before promising this**; a native SQLite plugin would make it safe.
- **Create a session offline by coffee code, sync later** (Kim's ask): needs a *product* change either way, not just a wrapper — the coffee catalogue must be cached locally (id, code, name, owner), a client-generated session id, and a replay path like `app/actions/offline.ts` for `createSession` + samples (idempotent on a client UUID; `referenceSampleId` by position already exists). This works equally in the PWA and a wrapper; estimate **~1.5 weeks** and is the real offline win. Do it in the web app first.
- Native push for "your group session started / closes today", better camera/QR, share sheet — nice-to-have.

## Timeline to Madrid (Jan/Feb 2027)
| When | What |
|---|---|
| Nov 2026 | PWA install flow + iOS A2HS instructions; offline session creation by coffee code (web) |
| Dec 2026 | Optional: Capacitor shell, TestFlight/Play internal; submit by mid-Dec |
| Jan 2027 | Review buffer (Apple 1–2 wks, Play closed test 14 days if personal account); Madrid demo runs on the PWA regardless |

Decision needed from Ricardo/Kim: is store presence a requirement or just credibility? If the latter, skip until after Madrid.
