# S6 pre-production audit: Stream A (reports), E3 (brand/EN), C4 (realtime), B5 overlay

Scope: `C:\projects\cata-cafe\.claude\worktrees\s6-integration` (branch `s6-integration`, HEAD 9ad9a91 = origin/main + #43 + #34 + #42 + #44). Read-only. Static review only: `node_modules` in that checkout is mid-install (`.bin` and vitest missing), so `tsc` / `npm test` were NOT run, and no route was exercised live.

## Verdicts

| Area | Verdict | Why |
|---|---|---|
| A. Reports, PDFs, close email | **NO-GO until A-1 is fixed** | Three of the four new PDF routes will 500 on Vercel (fonts not traced). Everything else is GO with fixes. |
| B. Brand / EN (#34) | **GO** (clean up leftovers) | i18n wiring is correct; some "Cata Café" strings remain. |
| C. Realtime + live samples (#42) | **GO** | Auth-before-subscribe is correct everywhere; the cleanup path is sound. Medium and low items only. |
| D. Session-moment overlay (#44) | **GO** (dormant) | Not mounted anywhere except a dev-only route that 404s in production. Fix the accessibility gaps before B6 wires it in. |

## Findings, severity-sorted

| # | Sev | Area | Finding | Evidence | Fix |
|---|---|---|---|---|---|
| A-1 | **BLOCKER** | A | `outputFileTracingIncludes` only lists `/api/sessions/*/cva-pdf`, insights report, the two crons and `/*/app/sessions/**`. The three NEW PDF routes are not listed, so `public/fonts/*.ttf` is not in their serverless bundles. `registerPdfFonts()` reads from `process.cwd()/public/fonts`, so `renderToBuffer` throws ENOENT and the route returns 500. Local dev and `next start` hide this because the files exist on disk. | `next.config.ts:41-47`; `lib/pdf/fonts.ts:24`; routes `app/api/sessions/[id]/participant-summary/route.ts`, `.../ficha-tecnica/route.ts`, `app/api/coffees/[id]/ficha/route.ts`. Glob mechanism confirmed in `node_modules/next/dist/build/collect-build-traces.js:446-470`: picomatch against the normalized route, so `*` does match `[id]`. | Add `"/api/sessions/*/participant-summary"`, `"/api/sessions/*/ficha-tecnica"` and `"/api/coffees/*/ficha"` (each `["./public/fonts/**/*"]`). Smoke-test on a Vercel preview (not local) for all three, es and en. |
| A-2 | MEDIUM | A | The email CTA "Ver mis resultados" goes to `/{locale}/auth/login?next=...`, but the login page never checks for an existing session. The comment in `lib/inviteUrl.ts:27-29` ("a signed-in browser passes straight through") is false. A signed-in participant gets an email form and must request a second magic link. `next` itself survives correctly: `LoginForm` -> `signInWithMagicLink` builds `${origin}${next}` -> `/auth/callback?next=` -> `resolveNext`. | `app/[locale]/auth/login/page.tsx:1-50` (no `getUser`/`redirect`); `proxy.ts:49-80` only redirects anonymous users. | In `login/page.tsx`, call `supabase.auth.getUser()`. If there is a non-anonymous user and `next` is a same-origin path starting with `/`, `redirect(next)`. Alternatively link straight to `/{locale}/app/sessions/{id}/results`, since the `/app` layout already redirects unauthenticated users to login. |
| A-3 | MEDIUM | A | `ficha-tecnica` passes `tResults("soloTopDescriptors")`. The real key is `results.dashboard.soloTopDescriptors` (`results.soloTopDescriptors` is undefined in es and en). next-intl does not throw: it logs MISSING_MESSAGE and returns the raw key, so a SOLO session's ficha prints "results.soloTopDescriptors: a, b, c". The participant-summary route and `closeEmail.ts` use the right key. | `app/api/sessions/[id]/ficha-tecnica/route.ts:61` vs `participant-summary/route.ts:110` and `closeEmail.ts:202`. | `tResults("dashboard.soloTopDescriptors")`. Add a unit test that every label key used by the routes resolves in es.json and en.json. |
| A-4 | MEDIUM | A | No `try/catch` around `loadSessionReportSource` / `buildX` / `renderToBuffer` in the 3 new routes. Any model or render error returns Next's HTML 500. The buttons open the PDF in a new tab (`target=_blank`), so the user sees a broken page. Nothing is logged in the `lib/log.ts` JSON shape (no route, sessionId), so Vercel Logs can't be searched by id. | The three route files, around the `renderToBuffer` calls. | Wrap the build + render and `logError({ where: "participant-summary", sessionId, ... })`. Return a short `text/plain` 500 with `Cache-Control: no-store`. |
| A-5 | MEDIUM | A | The 50-cupper ficha is not load-tested. The owner ficha is cover + 2 pages/sample + appendix matrix + one teacher page per cupper, so about 60 or more pages, rendered in one synchronous react-pdf pass inside `maxDuration = 60`. The preview script only covers a 5-cupper fixture (13 pages). | `FichaTecnicaDocument.tsx`, `TeacherNotesPages.tsx`; `docs/notes/S6-A.md` CP-A4. | Time `scripts/render-ficha-preview.tsx` with 50 cuppers and 10 samples. If over about 25 s, raise `maxDuration` (Vercel allows 300 with Fluid) or cap or paginate the teacher notes. |
| A-6 | LOW | A | The close-email ledger records `email_not_configured` and "no email" as `skipped`, and `resendCloseEmails` re-runs every non-`sent` recipient, repeating one GoTrue lookup per skipped guest. Cost only, no wrong behaviour. Guests (no email) get no email; they still get the PDF from the results page. | `lib/closeEmail.ts:161-169, 185, 274`. | Optional: exclude `skipped/no_email` rows from retry. |
| A-7 | LOW | A | The coffee ficha route is not guest-scoped: `/api/*` is excluded from the proxy matcher, so an anonymous QR guest can fetch `/api/coffees/:id/ficha` for any public coffee, while the coffee page itself is guest-gated (CLAUDE.md "Guests"). Data is public by visibility, and results are still gated by `resultsPublished`. The participant-summary route allowing guests fits "guests see their own results". | `app/api/coffees/[id]/ficha/route.ts:36-42`; `lib/guestScope.ts`. | `if (user.is_anonymous) return new Response("Not found", { status: 404 })`. |
| A-8 | LOW | A | Free text is stripped of emoji only (`sanitizePdfText`). Characters outside the bundled fonts (CJK, Cyrillic, Greek in coffee/session/cupper names) still render as garbage. Newsreader also lacks Δ (checked with fontkit). The new documents use no Δ/Σ in strings, so there is no current bug. | `lib/pdf/text.ts`; fontkit glyph check on `public/fonts`. | Optional: replace unsupported code points with "?". Never put Δ or Σ in `SERIF` text. |
| A-9 | LOW | A | The "Resumen" button is shown (and the close email attaches a summary) even for a participant who submitted nothing, producing a mostly empty PDF. The 409 for a locked group session is plain text, but the UI hides the button in that case, so it is only reachable from a stale tab. | `ResultsClient.tsx:886-897`; `participantSummary.ts`. | Optional: hide the button or skip the attachment when `kpis.evaluated === 0`. |
| A-10 | LOW | A | `removeSessionSample` has no `assertSessionWritable` and no `run()`/ActionResult, so a closed session's evaluation-free sample can still be removed. Pre-existing (not in the #42 diff) and contradicts "Closed = read-only". | `app/actions/sessions.ts:964-1000`. | `assertSessionWritable(await requireSampleOwner(...))` and convert to `run()`. |
| B-1 | LOW | B | User-facing "Cata Café" remains: `messages/{es,en}.json` lines 85 (landing "why"), 93 (dashboard "reopen"), 1439 (`inviteDefaultMessage`, sent to invitees); `lib/email.ts:44` default sender `Cata Café <no-reply@catacafe.app>`; `InsightCardComposer.tsx:331-333` (exported PNG: "Cata Café" / "catacafe.app") and download name `cata-cafe-insight.png`. `brand.name` is "Cata Café Sensible". | greps over `lib app components messages`. | Replace the strings. For the sender, verify the new domain in Resend first (a wrong `EMAIL_FROM` domain drops ALL mail, including close emails), or set `EMAIL_FROM` in Vercel and leave the default. Leave `lib/offline/store.ts:33` (`name: "cata-cafe"`, an IndexedDB name): renaming it orphans every offline draft. |
| C-1 | MEDIUM | C | The waiting room has no safety net when the channel reports SUBSCRIBED but is silently dead (the failure the helper fixes). Its poll only starts when status is not SUBSCRIBED. The cup screen got a 30 s refresh for exactly this case; the waiting room did not. Risk: a cupper stuck in the waiting room if auth falls back to anon. | `WaitingRoomClient.tsx:100-125`. | Always run the 15 s `checkSessionStarted` poll while `!isAsync`. It is cheap and the redirect is idempotent. |
| C-2 | MEDIUM | C | Thundering herd, accepted in the notes but unmeasured. Every sample add/rename/remove/metadata edit by the owner makes all N cuppers `router.refresh()` at once (a full cup page server render each). On top of that every group cupper polls every 30 s: 50 cuppers is about 100 RSC renders/min steady, with `DB_POOL_MAX` 8 per instance. | `CupClient.tsx:688-715`; `app/actions/sessions.ts:890-896`. | Add random jitter (0-3 s) before `router.refresh()` in the realtime handler and 30 s +/- 5 s on the poll. Check Vercel/Supabase connection headroom before a 50-person event. |
| C-3 | LOW | C | A stale refresh can flip the reference back. The reconcile effect always does `setReferenceSampleId(session.referenceSampleId)`. If an in-flight refresh started before the owner changed the reference, it lands after the realtime-applied `applyReferenceOrder` and briefly restores the old reference until the next refresh. It also uses non-functional `setSamples(next)` built from `samplesRef`. | `CupClient.tsx:362-373`. | Use `setSamples(prev => reconcileSamples(prev, ...))`. Skip the reference overwrite when `referenceSeqRef` shows a newer realtime update. |
| C-4 | LOW | C | `revealSample` does not `touchSession`, so participants only see a reveal on their next poll (up to 30 s). Reveal is usually post-close, so low impact. | `app/actions/community.ts` (no touch); only 4 touch sites, all in `sessions.ts`. | Call `touchSession` in `revealSample` too. |
| C-5 | LOW | C | In `ResultsClient` the realtime effect depends on `session.samples`, so every `router.refresh()` (e.g. after saving sample metadata) tears down and re-subscribes the channel. Correct but chatty. Pre-existing dependency. | `ResultsClient.tsx:392`. | Depend on a joined id string instead. |
| D-1 | MEDIUM | D | When wired in (B6): no focus management. The overlay is `role="region"`, not a modal dialog: no `aria-modal`, no focus move or trap, no `inert` on the shell behind, no body scroll lock. Keyboard and screen-reader users can reach the cup form beneath. | `SessionMomentOverlay.tsx:62-80`. | On open: focus the container (`tabIndex=-1`), set `inert` on the sibling shell (or use Radix Dialog), restore focus on dismiss. |
| D-2 | LOW | D | Stacking: overlay `z-[60]` is above SessionShell (40), `WelcomeModal` and `OfflineFirstLoadError` (50), but below ResponsiveDialog (200/201) and Toast (100). So the leave-guard dialog and toasts show over it; an onboarding modal and the offline banner hide beneath it. The `Escape` listener is on `window`, so Escape inside the leave-guard dialog also dismisses the moment. | `ResponsiveDialog.module.css:4,11`; `Toast.tsx:130`. | Ignore the key event if `e.defaultPrevented` or a dialog is open. |

## Detail by area

### A. Reports and PDFs

**1. Authorization (traced line by line)**

| Caller | cva-pdf | participant-summary | ficha-tecnica | coffee ficha |
|---|---|---|---|---|
| No session | 401 | 401 | 401 | 401 |
| Stranger | 404 | 404 | 404 | 404 unless coffee is public or shared with them |
| Participant (not owner) | 200, own evals only, physical `{}`, extrinsic only if revealed | 200 once `canViewGroupResults` (else 409) | 404 | n/a |
| Owner | 200, full | 200 (owner always passes the group gate) | 200 | full incl. community and notes |
| Super-admin | 200, owner's lens | 200, owner's lens | 200 | 200, community yes, notes no (not owner) |
| Guest (anonymous) | 200 if participant | 200 if participant | 404 (never owner) | 200 for public coffees (A-7) |

- participant-summary never leaks another cupper. `buildParticipantSummary` returns only the viewer's name, aggregates, own notes and no `physical`; unit-tested (`tests/reports.test.ts:337-377`). `loadSessionReportSource` does load every cupper's name into memory and the builder strips it; there is no defence in depth beyond the builder.
- ficha-tecnica is owner-or-admin via `where: { id, createdBy: user.id }` (`route.ts:38-43`); 404 (not 403) for everyone else.
- The coffee ficha mirrors the coffee page: `usableCoffeeWhere` (includes `deletedAt: null`), community data for `resultsPublished || isOwner || isAdmin`, notes for the owner only. The loader is shared with the page (`lib/coffees/aggregateSamples.ts`).
- cva-pdf gates physical to the owner and extrinsic to the owner or revealed samples (`route.ts:86-117`); logic unchanged.

**2. Data correctness.** `lib/reports/ranking.ts` is a verbatim extraction of the old `ResumenTab` logic. I diffed `ResumenTab.tsx` against origin/main: the removed code and the new `rankFor`, `rankSamples`, `sessionStats`, `consensusLine` match (reference excluded, sort by score desc then position, unscored last, Δ via `deltasVsReference` with the basis guard, SD only with a community score). `sessionReportData` recomputes the community score exactly like `results/page.tsx:221-246` (excluded cuppers removed, per-format blob, `computeGroupAggregate`). One known difference: the page falls back to the trigger row when no recompute exists (`page.tsx:645-657`), while the report model uses `null`; this only matters if every cupper of a sample is excluded. "Included X of Y" uses `agg.included/submitted`, the same fields the page uses. No other divergence found.

**3. Runtime on Vercel.** Fonts: A-1. `maxDuration = 60` on the three new routes; none on cva-pdf (unchanged). `Content-Disposition` filenames come from `slug()` (NFD + ASCII only), so accents and emoji are safe. `locale` is whitelisted to es/en. `Font.register` is guarded by a module-level flag; hot-reload re-registration is harmless. `sanitizePdfText` is applied to session, sample, coffee, cupper, descriptor and notes strings across the new documents; `cvaFormData.str()/arr()` sanitize extrinsic and physical values. No remote images in the PDFs.

**4. Close email.**
- Subject and body are escaped (`escapeHtml` on name, date and href).
- `next` survives the whole path (A-2 covers the signed-in gap). It relies on the Supabase magic-link template appending `{{ .RedirectTo }}`; existing, documented behaviour.
- One summary PDF attachment (small). `CLOSE_EMAIL_ATTACH_CVA=1` adds the CVA form with the same owner-only physical gating as cva-pdf.
- Failure isolation is good: per-locale source load wrapped, per-recipient model/render wrapped (marks only that recipient `failed`), `Promise.allSettled`, ledger `upsert` in `try/catch`, concurrency 4.
- Guests with no email get `skipped/no_email` and no email.
- Fonts for the email path are covered (`/*/app/sessions/**` and the close cron).

**5. Tests.**
- `reports.test.ts`: `canViewGroupResults` truth table, `rankSamples`/`sessionStats`/`consensusLine`, `rowStats`/`bandFor`, participant anonymity invariant, ficha tiers, teacher notes, majority sets.
- `cvaFormData.test.ts`: owner-only data, blind coffee, score states, `sanitizePdfText`.
- `closeEmail.test.ts`: only the body builder (login URL with `next`, escaping).
- `pdfCharts.test.ts`: chart math only.
- Not covered: any route's authorization (no handler tests); a real `renderToBuffer` smoke test with the fonts; `sendCloseEmails` ledger, guest and failure paths; excluded-cupper behaviour in the participant summary; solo-session ficha (would have caught A-3); `buildResultsLoginUrl`; the coffee ficha model; i18n key existence for the route labels.

### B. Brand and EN

`WelcomeModal` is wired correctly: copy arrives as the `translations` prop built in `app/[locale]/app/layout.tsx:50-83`; `goTo` is fetched with `.raw()` and `{label}` is replaced client-side (`WelcomeModal.tsx:261`). The es and en message key sets are identical (checked programmatically). Remaining brand strings: B-1.

### C. Realtime and live samples

- `subscribeWithSessionAuth` awaits `getSession`, calls `realtime.setAuth`, then builds and subscribes. Cleanup sets `cancelled` before the channel exists and removes the channel afterwards, which handles StrictMode double mounts and the online toggle (the effect re-runs on `online`). No path subscribes before `setAuth` in the three call sites (`CupClient.tsx:637`, `ResultsClient.tsx:334`, `WaitingRoomClient.tsx:77`). Token refresh is handled by supabase-js.
- The 30 s poll is gated on `isGroup && online && document.visibilityState === "visible"` (`CupClient.tsx:702-710`); offline and solo paths are untouched.
- `reconcileSamples`: the current sample is preserved by id (`indexAfterReconcile`), local evaluation fields always win (`...mine` spread), server metadata wins, removed ids drop, the reference comes from the refreshed prop. A refresh cannot wipe unsaved edits: they live in `samples` state and the pending refs (800 ms debounce, `flushSave`), none of which the reconcile touches. Residual race: C-3.
- `touchSession` runs inside the same `$transaction` for add, rename and remove. `updateSampleMetadata` touches in its own final transaction after the coffee write; fine, since the touch is only a notification.
- The waiting room just calls `router.refresh()` (samples are props there). See C-1 for its missing safety net.

### D. Session-moment overlay

Dormant: `SessionMomentOverlay` and `WarmupMoment` are imported only by `app/[locale]/app/warmup/dev-moment/*`, which calls `notFound()` in production, so no visible change on main. Storage key is `cata_moment_<kind>_<sessionId>`; reads and writes are try/catch wrapped; the server snapshot is "seen" so SSR and hydration never render it open; it is skippable by Escape and the provider's buttons. Gaps: D-1 and D-2.

## Not verified

- `tsc`, `npm test`, `npm run build` (dependencies incomplete in the integration checkout).
- Any behaviour on a live deployment (no login, no network calls, production DB untouched).
- Supabase RLS for realtime: no SQL changed in these PRs, per the C4 notes.
