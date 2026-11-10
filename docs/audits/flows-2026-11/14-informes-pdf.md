# 14 · Informes y PDFs

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1306–1376 · **Domain briefs applied:** `results-reporting` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-results-reporting (Sonnet 5.5) · **Verification:** done 2026-11-06 (results-reporting verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A cupper or owner leaves the results page by one of four plain links in the docked footer (`results/ResultsClient.tsx:931-984`): the HTML twin `/print`, the CVA PDF (`/api/sessions/[id]/cva-pdf`, attachment), "Mi resumen" (`participant-summary`, inline, new tab) and, for the owner, "Ficha técnica". The coffee page has its own ficha, and the close email links to results plus the participant summary. Routes authenticate, then authorize by membership (404 hides existence), then build from the shared pure models in `lib/reports/`. `buildCvaFormData` gates coffee name, roast, physical and origin data again inside the builder (`lib/pdf/cvaFormData.ts:881-907`). The board's code references are accurate on this branch; the print page is the one surface that does not apply the same gates before data leaves the server.

## 2. Expert bar applied

- **P10 tiers enforced where data is built** → does `/print` strip blind data in the query or only when painting? Do print, cva-pdf and email apply identical gates? (checklist 13, 14)
- **P2/P3/P5/P13 centre plus spread, n of N, snapshot** → does each PDF show n, SD, "n of N included", generation time? (2, 3, 7, 18, 19)
- **P5/P6 coffee-level numbers must respect blindness and exclusions** → what feeds the coffee ficha? (5, 6, 13)
- **P12 tagged, titled PDFs** with language and a text alternative (16, 17)
- **P14/P15 email: link plus one small attachment, ledgered** (20–23)
- **Native lens:** a WebView cannot reliably print, open `attachment` PDFs or follow `target=_blank`; the PDF needs a save/share path (offline-native §5).

## 3. Findings

### F-informes-1 · /print serializes coffee name and roast of blind samples to participants · severity: P1 · status: confirms-board(La hoja imprimible envía el nombre del café antes de revelar)
**Fixed in S8-02 (PR #67)** — `sheetSampleIdentity` gates name/roast at the data source in print, cva-pdf and close email; super-admin print uses the owner lens.

- **Problem** — `print/page.tsx:106-107` passes `coffeeName: s.coffee ? coffeeDisplayName(...) : null` and `roastLevel: s.coffee?.roastLevel ?? null` to the client component with no `revealed` condition (the query at `:42` selects them for everyone). The sheet hides them only at paint time (`cvaFormData.ts:881-886` gates on `revealed`), so the RSC payload of a participant in a blind group session carries every sample's coffee. The sibling `cva-pdf/route.ts:102-105` also hands the names to the builder, but there nothing is serialized to the browser. Also, `print/page.tsx:43` filters evaluations by `user.id` and `:99` uses `ownerView: isOwner`, never a `viewAsId`, so the super-admin gets their own empty sheet while `cva-pdf/route.ts:42-43,86` renders the owner's.
- **Implication** — Trust and scoring integrity: single-blind is the cupping norm. A curious participant (or anyone with a debugger in a wrapped app) can read which coffee is which before scoring. Easy to exploit, silent, and it contradicts the rule that the builder is the gate.
- **Fix** — Null both fields server-side unless the sample is revealed (owner included, same as the builder) and align the super-admin lens with cva-pdf. **Acceptance:** (1) a participant's `/print` payload for an unrevealed sample contains no coffee name or roast; (2) after reveal or close they appear as today; (3) the super-admin's `/print` equals their cva-pdf download; (4) one shared "sheet source" helper used by print, cva-pdf and the email, with a unit test. **Size:** S.
- **Native** — n/a (server payload); any native pre-fetch must use the same helper.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Reinforces "PDF gating inside the builder" and owner-only physical/extrinsic; touches none.

### F-informes-2 · The coffee ficha averages open blind sessions, excluded cuppers and other owners' session names · severity: P2 · status: confirms-board(La ficha del café mezcla catas abiertas, ciegas y de otros dueños)
**Fixed in S8-02 (PR #67)** — Ficha shares the viewer-aware model with the profile (closed sessions only, named rows only for own/joined sessions).

- **Problem** — `lib/coffees/aggregateSamples.ts:12-31` selects every `sessionSample` of the coffee with no filter on session status, `revealed`, group visibility or exclusion; evaluations are only `isDraft: false`. The ficha route builds from it (`ficha/route.ts:73-95`): `included` and `submitted` are both set to `evaluationsCount` (`:80-81`), `sd: null`, and `sessions` carries `r.sessionName` for any session, including another owner's. A non-owner reaches this once `coffee.resultsPublished` (`:69`). The DB trigger already drops excluded cuppers from `communityScore`, but `evaluationsCount`, individual averages and descriptors count their raw rows.
- **Implication** — A public coffee used in someone else's live blind cupping leaks a running community score and a session title to strangers. Owners see mixed, still-changing numbers labelled as a community result.
- **Fix** — Feed the ficha only from sessions the viewer may see: closed or group-visible sessions, revealed samples, excluded cuppers removed from counts, and session names only for sessions the viewer owns or joined (date only otherwise). Print real n and number of sessions, no empty SD. **Acceptance:** (1) a coffee in an open blind session adds nothing until it closes; (2) an excluded cupper is absent from counts and descriptors; (3) a stranger sees no session name; (4) the coffee page and the PDF agree. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code (filters absent); the leak itself needs two accounts.
- **Kim?** — no.
- **Invariant check** — `usableCoffeeWhere` stays the access gate; `canViewGroupResults` is reused as the visibility rule.

### F-informes-3 · The participant summary shows no n, no "n of N included", no snapshot stamp · severity: P2 · status: new

- **Problem** — `ParticipantSummaryDocument.tsx:564-565` prints only a head-count of participants, and `participantSummary.ts:229` counts `src.participants.length`, excluded cuppers included. Community score and SD appear without how many cuppers produced them, and an excluded cupper is never told. No session PDF carries a generation time (`generated`/`new Date` appears only in the insights report). The ficha técnica does print `included/total` (`FichaTecnicaDocument.tsx:226`), so the participant tier is the weaker one.
- **Implication** — Scoring trust: 84.5 ± 0.4 from two cuppers reads as a verdict. After an exclusion or a late coffee assignment, the PDF emailed at close and one downloaded later differ and nothing says which is current.
- **Fix** — Show "community of n (N invited)" beside score and SD on every sample, label results "indicative" below a minimum n (value from Kim), say plainly when the viewer's own evaluation is excluded, and stamp every report with a server-side generation date and time. **Acceptance:** (1) summary prints n and N; (2) excluding a cupper changes n in a regenerated PDF; (3) footer timestamp in es and en; (4) below the minimum n the indicative label shows. **Size:** M.
- **Native** — Stamp server-side, no dependence on the device clock.
- **Confidence** — verified-in-code.
- **Kim?** — yes: K-informes-1.
- **Invariant check** — The anonymity invariant (`tests/reports.test.ts`) is unaffected; counts only.
- **Fixed in S8-12** (PR #TBD) — participant summary shows "n de N incluidos" per sample, says when the viewer's own evaluation is excluded (no reason, no peer identity) and carries the generation stamp.

### F-informes-4 · PDF delivery has no WebView path (print dialog, attachment link) · severity: P2 · status: new

- **Problem** — `PrintClient.tsx:1225,1270` offer only `window.print()`. The CVA download is a plain link answered with `Content-Disposition: attachment` (`cva-pdf/route.ts:134`) and the route ignores `?inline=1`, unlike the newer routes (`participant-summary/route.ts:56,158`). Summary and ficha open with `target="_blank"` (`ResultsClient.tsx:963,974`).
- **Implication** — Native-readiness: in a Capacitor WebView, `window.print()`, `target=_blank` and attachment downloads often do nothing, so a roaster on an iPhone app taps and nothing happens. Offline is also silent, since the render needs a connection.
- **Fix** — One shared "open or share this PDF" action: fetch the bytes, then use the native share/save sheet in the shell and a new tab on the web, with a clear "needs a connection" state offline. Make cva-pdf honour `?inline=1`. **Acceptance:** (1) all four documents open or save from the shell on iOS and Android; (2) offline shows a message; (3) web behaviour unchanged. **Size:** M.
- **Native** — This is the finding: share/save plugin, base64 size over the bridge for a 30-sample CVA.
- **Confidence** — needs-runtime-check (print screen and each link in a Capacitor build or iOS standalone PWA).
- **Kim?** — no.
- **Invariant check** — none touched.

### F-informes-5 · cva-pdf renders without error handling, timeout or inline mode · severity: P3 · status: confirms-board(La hoja CVA no tiene manejo de errores como las rutas nuevas)

- **Problem** — `cva-pdf/route.ts:122` calls `renderToBuffer` outside any try/catch, and there is no `maxDuration` (only `runtime` and `dynamic`, `:17-18`); participant-summary has both (`:23,125-151`).
- **Implication** — Robustness: a font or data error is an opaque 500 with no digest, and the heaviest render (a many-sample combined sheet) has no explicit time budget.
- **Fix** — Same pattern as participant-summary: localized plain-text failure with a digest, one JSON log line, `maxDuration`. **Acceptance:** a forced render error returns 500 text with a digest and a log line carrying `sessionId`. **Size:** S.
- **Native** — The error text must be readable inside the share flow of F-informes-4.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.
- **Fixed in S8-12** (PR #TBD) — `cva-pdf` has `maxDuration = 60`, try/catch with a logged digest (`lib/pdf/routeFailure.ts`) and `?inline=1`.

### F-informes-6 · The close email's legacy CVA attachment loses multi-reference labels · severity: P3 · status: new

- **Problem** — In `lib/closeEmail.ts` the legacy `attachCva` branch sets `isReference: s.id === session.referenceSampleId` and omits `referenceRank`, while cva-pdf passes `sample.referenceRank != null` and the rank (`cva-pdf/route.ts:106-107`). It only runs with `CLOSE_EMAIL_ATTACH_CVA=1`.
- **Implication** — Earlier references (R1, R2) print as ordinary samples in the emailed sheet, differing from the downloaded one. Hidden today because the flag is off.
- **Fix** — Build the sheet props through the helper from F-informes-1 so email, print and download cannot drift. **Acceptance:** a two-reference session yields identical sample headers in all three. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Reference rules (display-only) untouched.
- **Fixed in S8-12** (PR #TBD) — the legacy CVA attachment in the close email passes `referenceRank`, so R1/R2/R3 labels survive.

### F-informes-7 · PDFs set no document language, radar values may lack a text twin, and there is no raw export · severity: P3 · status: new

- **Problem** — Every `<Document title=… author=…>` (e.g. `CvaFormDocument.tsx:1144`, `ParticipantSummaryDocument.tsx:550`) sets a title only, no language. Charts are SVG (`lib/pdf/charts.tsx`); I did not locate an adjacent table of the radar's eight values. There is no results CSV (the only CSV is the admin `lib/analytics/usersCsv.ts`).
- **Implication** — Accessibility for screen-reader users, and teachers cannot recompute results in a spreadsheet.
- **Fix** — Set the document language per locale if the library supports it, print the eight values beside each radar, and decide on an owner CSV (one row per cupper and sample, no email by default). **Acceptance:** PDF properties show es or en; radar values readable as text. **Size:** S for language and values, M for CSV.
- **Native** — The CSV needs the share path from F-informes-4.
- **Confidence** — inferred-from-spec for the radar table; needs-runtime-check with an accessibility checker.
- **Kim?** — yes: K-informes-2.
- **Invariant check** — An owner CSV must follow the ficha-técnica owner gate.
- **Fixed in S8-12** (PR #TBD) — `Document language` set, radar values printed as text in the participant summary (ficha already lists the eight means), owner CSV at `/api/sessions/[id]/results-csv`. TODO(Kim-D5) left.

## 4. Keep — works well

- Gate order in every route: 401, then 404 that hides existence, then the role lens, with `viewAsId` for super-admin (`cva-pdf`, `participant-summary`, `ficha-tecnica`).
- `canViewGroupResults` is shared by page and summary (409), `lib/sessionState.ts:26`.
- Builder-level gating of coffee, roast, physical and origin (`lib/pdf/cvaFormData.ts:881-907`); owner-only ficha técnica (`ficha-tecnica/route.ts`).
- Participant model carries only the viewer's evaluation plus the anonymous group (`lib/reports/participantSummary.ts`, tested).
- Close email: per-recipient isolation, bounded fan-out of 4, ledger skip of already-sent, guests as skipped, link plus one small attachment (`lib/closeEmail.ts`).
- `Cache-Control: no-store`, `sanitizePdfText`, `slug` filenames without secrets, font tracing entries (`next.config.ts:37-46`).

## 5. Not verified

- Font tracing on Vercel (board question stands): open one participant summary and one ficha técnica on a preview.
- WebView print and download behaviour (F-informes-4): Capacitor build or iOS standalone PWA.
- The blind leak in F-informes-2: two accounts, one open blind session using a public coffee with results published.
- SPF/DKIM/DMARC on the sending domain and attachment size bound: DNS lookup, and a 30-sample session sent to a test inbox.
- Whether `Document` accepts a `language` prop in react-pdf 4.5.1: check the package types.

## 6. Questions for Kim (collected)

- **K-informes-1** — ¿Con cuántos catadores en una cata de grupo te parece razonable mostrar el puntaje de la comunidad y la desviación? Opciones: desde 2; desde 3 con la etiqueta "indicativo" hasta 5; solo desde 5. Y si dos muestras se diferencian menos que lo que se dispersa el panel, ¿decimos "sin diferencia clara" o mostramos igual el orden?
- **K-informes-2** — ¿Quieres un archivo de datos (Excel/CSV) con el puntaje de cada catador por muestra? ¿Debe llevar los nombres de los catadores para el dueño, o solo códigos? ¿Cuánto tiempo deben seguir disponibles los informes después del cierre si el dueño cambia algo (excluir a alguien, asignar el café)?

## 7. Verification log

F-informes-1 — CONFIRMED — `print/page.tsx:106-107` passes `coffeeName`/`roastLevel` for every sample with no `revealed` check (query :42); only the client builder hides them (`cvaFormData.ts:881-886`). `/print` has no status or member gate beyond membership and is linked from the results page (`ResultsClient.tsx:937`), so a participant reaches it during a live blind cupping. cva-pdf only passes names to a server-side render, nothing serialized. Super-admin lens difference also true (`print/page.tsx:43,99` vs `cva-pdf/route.ts:43,86`). — severity: keep (P1, blind integrity; same class as F-resultados-1/2)
F-informes-2 — CONFIRMED — `aggregateSamples.ts:12-31` has no session status, revealed, exclusion or ownership filter; `ficha/route.ts:69,73-95` sets `included`/`submitted` to `evaluationsCount` and ships `sessionName`; non-owners get it when `resultsPublished`. Exposure needs a public coffee used in someone else's session. — severity: keep (P2) — duplicate of F-cafes-2 (and F-cafes-1 on session-name exposure); 12-cafes.md should own it, since the user first meets it on the coffee page.
F-informes-3 — CONFIRMED — `ParticipantSummaryDocument.tsx:446-451` prints SD with no n; `:564-565` shows head-count only, built from `participantSummary.ts:229` `src.participants.length` (excluded included); no generation stamp outside `InsightsReportDocument.tsx`; ficha prints included/total (`FichaTecnicaDocument.tsx:226`). Overlaps F-resultados-5/6 on "n of N". — severity: keep (P2, borderline P3)
F-informes-4 — PLAUSIBLE — Code facts confirmed (`PrintClient.tsx:1225,1270` `window.print()`; `cva-pdf/route.ts:134` always `attachment`, no `inline`; `ResultsClient.tsx:955-975` `target="_blank"`). WebView behaviour is unverified and no shell exists yet; settle with an iOS standalone-PWA or Capacitor build test. In a normal browser nothing is blocked. — severity: → P3 (native-readiness, no flow blocked today)

P3 notes: none with wrong citations.
