# 10 · Resultados

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 891–1014 · **Domain briefs applied:** `results-reporting` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-results-reporting (claude-sonnet-5-5) · **Verification:** done 2026-11-06 (results-reporting verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

After a cupping, owner, participants, guests and the super-admin lens all land on one route, `app/[locale]/app/sessions/[id]/results/page.tsx`, which renders three tabs: Resumen, Resultados and Descriptores. The server decides what each viewer may see through `canViewGroupResults` (`lib/sessionState.ts:26`) and `ownerRead`. It recomputes community numbers from raw evaluations with `computeGroupAggregate` (`lib/scoring.ts:167`), excluding cuppers the owner switched off. The client adds the ranking, the reference anchors with Δ chips, the owner matrix, a drill-down dialog, and a footer with Imprimir, CVA PDF, Mi resumen and Ficha técnica. The board's description matches the code. Two points the board only half says: the page serializes owner-only and not-yet-visible data to every viewer, and the database lets a participant read other cuppers' evaluations directly (F-resultados-1, F-resultados-2).

## 2. Expert bar applied

- **P10 tiers enforced where data is built.** Questions: does the participant payload omit physical data and hidden community numbers? Does Postgres enforce the same gate as the page?
- **P11 hide others until you submit; P5 exclusion is documented and reversible.** Questions: can a participant read peers early? Does an exclusion record who, when and why, and is it final after close?
- **P7 rank honestly; P2/P3 spread and small n.** Questions: are ties shown as ties? Is "best" shown with n=1? Does the ranking mix community and own scores?
- **P13 versioned snapshot; P12 PDF structure.** Questions: do PDFs carry a timestamp, language and inclusion state? Can a post-close change leave a stale copy?
- **Lenses.** Cupping protocol: closed = read-only, blind integrity. Native: PDF links, `target=_blank`, storage guards.

## 3. Findings

### F-resultados-1 · A participant can read other cuppers' evaluations, hidden community scores and the coffee through the public key · severity: P1 · status: confirms-board(Con la clave pública un participante lee evaluaciones ajenas y el café)

- **Status** — Fixed in S8-01 (PR #68): PHASE 21 SQL (owner applies, runbook §10) limits `evaluations` to own rows plus the owner's submitted rows and hides `aggregate_scores` until group results are visible; non-owners get a generic refresh chip instead of peers' rows over Realtime.

- **Problem** — `prisma/sql/rls_and_triggers.sql:134` creates `evals_submitted_participant` (`FOR SELECT USING ("isDraft" = false AND is_session_participant(...))`), and `:156` creates `agg_select` with only `is_session_participant(...)`. No later block drops or narrows them; PHASE 18b only re-grants EXECUTE on the helper. So any signed-in participant (guests included) can query the REST endpoint with their own JWT and get every submitted evaluation of the session (`cupperId`, raw data, `nota_express`) and `aggregate_scores` while the page shows "communityPending". `ResultsClient.tsx:379-414` also subscribes to raw `evaluations` UPDATE rows, so the app itself relies on that access.
- **Implication** — Security and trust. A cupper can see peers' scores before committing (anchoring), the owner's blind cupping is undone, and identities are linked to scores. It affects every group session, but only someone who opens dev tools will notice.
- **Fix** — Participants can read only their own evaluation rows. `aggregate_scores` is readable by non-owners only under the same condition as `canViewGroupResults` (closed, all submitted, or `closesAt` passed). The results "nuevos envíos" badge listens to a source with no per-cupper data. **Acceptance:** with a participant JWT, `select * from evaluations` returns only own rows; `aggregate_scores` returns nothing while the community is hidden; owner and closed-session reads still work; the realtime badge still fires. **Size:** M (SQL plus runbook section, applied manually).
- **Native** — Realtime and REST must keep working with the JWT the shell stores; re-subscribe on resume.
- **Confidence** — verified-in-code for the policies; needs-runtime-check with a second account (`set local role authenticated`).
- **Kim?** — no.
- **Invariant check** — Touches the RLS rules (never `USING (true)` without `TO authenticated`; keep EXECUTE on helpers used by policies). The new SQL twin of `canViewGroupResults` must be kept in sync.

### F-resultados-2 · The results page ships physical data and pre-release community scores to every viewer · severity: P1 · status: confirms-board(El payload incluye la hoja física del dueño…, El payload lleva el puntaje comunitario…)
**Fixed in S8-02 (PR #67)** — results payload gated by `gateSampleForViewer` (physical owner-only, community withheld while hidden).

- **Problem** — `results/page.tsx:693` sends `physical: (s.physical?.data …) ?? {}` with no `ownerRead` condition, although `cup/page.tsx` and `cva-pdf/route.ts:111` gate it. Lines `:644-658` fall back to the trigger row `agg` (`communityScore`, `attrAverages`, penalties) whenever `groupAggBySample` is null, which is exactly the case when `canViewGroup` is false. The UI hides both (`physical` is not read anywhere under `results/` or `components/results/`), but the RSC payload carries them.
- **Implication** — Security and scoring leak, same audience as F-1 but needing no key: view-source is enough. Contradicts CLAUDE.md ("the cup page and the CVA PDF route only ship `physical` to the owner").
- **Fix** — Build the per-sample payload in one pure function: `physical` only for `ownerRead`; `aggregateScore: null` for group sessions while `canViewGroup` is false. **Acceptance:** vitest on the pure builder: participant lens has `physical: {}` and `aggregateScore: null` when hidden; owner and admin lenses unchanged; solo sessions unchanged. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Restores "owner-only physical/extrinsic" and page/PDF parity; does not touch scoring.

### F-resultados-3 · Two forgotten server actions let a cupper submit an evaluation after the session is closed · severity: P2 · status: new

- **Status** — Fixed in S8-01 (PR #68): `submitSampleEvaluation` and `submitEvaluation` deleted, guarded by `tests/useServerExports.test.ts`.

- **Problem** — `app/actions/community.ts:85-103` (`submitSampleEvaluation`) and `:110-125` (`submitEvaluation`) are exported `"use server"` functions with no `requireSession*`/`assertSessionWritable`, no `run()` wrapper, and no caller anywhere in `app/`, `components/`, `hooks/` or `lib/`. They flip the caller's own draft to `isDraft: false`. Unlike `submitAllEvaluations` (`:24-26`, guarded), they work on a closed session, and the flip re-fires `trg_recompute_aggregate`.
- **Implication** — Scoring correctness and trust. A participant who left a draft at close can add it afterwards with a hand-made POST. The community score and ranking change after the close emails went out. A normal user cannot reach this, so it is rare, but it breaks "closed = read-only".
- **Fix** — Delete both unused actions (or guard them like `submitAllEvaluations`). **Acceptance:** no exported action can change `isDraft` on a closed session; a test or CI grep checks the action list; `submitAllEvaluations` unchanged. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code (grep finds no importer).
- **Kim?** — no.
- **Invariant check** — Enforces closed = read-only and the authz-through-`sessionAuth` rule.

### F-resultados-4 · "Editar origen" is offered on closed sessions and always fails · severity: P2 · status: confirms-board(Guardar origen en una sesión cerrada siempre falla)

- **Problem** — `results/ResultsClient.tsx` offers `onEditExtrinsic` for `isOwner && detailSample.revealed && !isAdminViewer` with no closed check (about `:1020-1030`). `upsertExtrinsic` calls `assertSessionWritable(...)` at `app/actions/sessions.ts:1372`. The comment in `updateSampleMetadata` (`:1254-1257`) and `ExtrinsicEditDialog.tsx:12-14` still describe origin edit as a sanctioned, "status-ungated" post-close write, which is false. Closing also reveals coffee-linked samples, so the button shows on every closed session.
- **Implication** — Trust and a blocked flow: the owner types origin data, gets a generic error and loses it. The express flow ("assign coffee after close, then fill origin") dead-ends.
- **Fix** — Decide (K-resultados-1). Recommended: allow origin edits by the owner on a revealed sample as the third named post-close write, through the same allow-list as coffee naming, returning `ActionResult`. Otherwise hide the button when closed and correct the docs. **Acceptance:** the button either saves on a closed session or is absent; `docs/flows.md` and the comments agree; origin data never feeds `aggregate_scores`. **Size:** S (decision) to M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-resultados-1.
- **Invariant check** — Option A adds a third sanctioned post-close write; CLAUDE.md and `docs/flows.md` §1 must be updated in the same PR.
- **Fixed in S8-12** (PR #74) — owner AND revealed sample may save origin data after close (`upsertExtrinsic` returns `ActionResult`, stamps `edited_at`; others get `session_closed`), dialog errors are localized toasts, reports say "Origen editado el …". TODO(Kim-D1) left.

### F-resultados-5 · Excluding a cupper is a bare switch: no reason, no author, no notice, and it still works after close · severity: P2 · status: confirms-board(Excluir a un catador después del cierre cambia resultados ya enviados) + new (no audit trail, no n of N)

- **Problem** — `setParticipantExclusion` (`community.ts:426-445`) only sets `excludedFromResults` (a boolean), never calls `assertSessionWritable`, is not wrapped in `run()`, and returns `{ ok: true }`. The switch (`OwnerParticipantSection.tsx:148-160`) reverts silently in a bare `catch`. After close, ranking, Ficha técnica and the results page change, but the participant-summary PDFs already emailed (`lib/closeEmail.ts`) keep the old numbers. The ranking and Resumen show no "n of N included" (only the radar card does, `SampleRadarChart.tsx:262-266`).
- **Implication** — Trust and scoring: students hold a PDF that disagrees with the screen; the excluded cupper is never told; nothing records who excluded whom or why.
- **Fix** — Make exclusion a named post-close write for the owner (or lock it at close, K-resultados-2). Store excluder and time, and a short reason chosen from a list. Wrap it in `run()` with a toast on failure. Show "n of N included" wherever a community number appears. Mark results edited after the close email. **Acceptance:** unit test for the closed-session rule; a failed toggle shows localized copy; every community number shows included/total. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-resultados-2.
- **Invariant check** — If allowed after close, add it to the sanctioned-writes list in CLAUDE.md and `docs/flows.md` §1.
- **Fixed in S8-12** (PR #74) — `setParticipantExclusion` is `run()` -> `ActionResult` with a fixed reason list, author/time/reason stored (migration `20261111130000`), `ExclusionDialog` + localized toasts, matrix shows who/when/why, "n de N incluidos" everywhere, "Resultados actualizados el …" after close. TODO(Kim-D2) left.

### F-resultados-6 · Ranking implies a verdict the data cannot support · severity: P2 · status: new

- **Problem** — `ResumenTab.tsx:181-189` numbers every row `idx + 1`, including ties (the sort in `lib/reports/ranking.ts:146-152` breaks equal scores by position) and unscored rows at the bottom. "Mejor muestra" (`:88`, `:129-140`) is the first scored row even with one evaluator or a 0.1 gap. The SD chip is shown without n (`:202-210`). `rankFor` (`ranking.ts:72-86`) falls back from the community to the viewer's own score per sample, so one list can mix bases while the stat card is labelled community (`ResumenTab.tsx:127`). The SD is population SD (÷n, `lib/scoring.ts:198-204`), which understates spread for 3 to 8 cuppers.
- **Implication** — Trust: a class sees "1st vs 2nd" for a gap inside the panel's own spread, and a teacher reads a false consensus.
- **Fix** — Show ties as ties; label rows whose basis is "mine" inside a community list; show "n = x" beside score and SD; say "sin diferencia clara" when two scores are closer than the panel spread (threshold from Kim); suppress or label SD and "best" below a minimum n. **Acceptance:** two equal scores show the same rank; a row with n=1 reads "indicativo"; the basis mix is visible. **Size:** M.
- **Native** — layout must hold at 375 px with no hover-only text.
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-resultados-3.
- **Invariant check** — Display-only; reference anchors stay out of ranking, average and best; scoring untouched.
- **Fixed in S8-12** (PR #74) — `RANKING_POLICY` in `lib/reports/ranking.ts`: shared ranks, suppressed/indicative n, no SD or "mejor" under 3 cuppers, "sin diferencia clara", basis chip when bases mix; page, summary and ficha read one output. TODO(Kim-D3) left.

### F-resultados-7 · Radar card hard-codes Spanish and "Revelar" works on closed sessions · severity: P3 · status: confirms-board(Revelar sigue disponible en una sesión cerrada)

- **Problem** — `SampleRadarChart.tsx:213`, `:233-238`, `:258`, `:262-266` hard-code "PUNTAJE CVA", "Revelar", "Puntuación comunidad" and "evaluadores incluidos en el promedio". `revealSample` (`community.ts:271-290`) has no closed check or `run()`, and the buttons in the table and radar render regardless of status.
- **Implication** — English users see mixed language; on a closed session "Revelar" works, bypassing the read-only rule.
- **Fix** — Localize through `t`; guard `revealSample` with `assertSessionWritable` and hide the buttons when closed. **Acceptance:** `/en` radar has no Spanish; revealing on a closed session throws `session_closed`. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Restores closed = read-only.
- **Fixed in S8-12** (PR #74) — radar card strings come from `results.radar.*` (es/en), "Revelar" is hidden on closed sessions (the action itself was already guarded by S8-01).

### F-resultados-8 · PDFs carry no timestamp, language or inclusion state, and the CVA form can print an unfinished draft unmarked · severity: P3 · status: new

- **Problem** — `<Document title=… author=…>` in `lib/pdf/*Document.tsx` sets no `language`; only the insights report has a generated date. `cva-pdf/route.ts:58` loads all of the cupper's evaluations including drafts, and the document never receives `isDraft`. Filenames (`:128`) have no date. The legacy `CLOSE_EMAIL_ATTACH_CVA` path (`lib/closeEmail.ts:246`) marks the reference by `referenceSampleId` only and does not use `orderReferencesFirst`, so it diverges from the route.
- **Implication** — Trust and robustness: a saved summary cannot be told apart from a later one (links to F-5); a draft looks final; screen readers lack a language.
- **Fix** — Stamp generation time and "n of N included" on every report; set language; mark draft sheets; add the date to filenames; reuse the route's sample mapping in the email. **Acceptance:** each PDF shows a date and inclusion line; a draft CVA sheet reads "Borrador". **Size:** M.
- **Native** — Saving must use a native save/share path, not a blob download.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — PDF gating stays inside builders.
- **Fixed in S8-12** (PR #74) — `ReportStamp` (server date/time UTC, language, inclusion, "Borrador"), `Document language` on all six PDFs, dated filenames, `cva-pdf` passes `draft`.

### F-resultados-9 · Footer PDF links are plain anchors with no offline or native path · severity: P3 · status: new

- **Problem** — `ResultsClient.tsx:943-981` uses `<a href>` and `target="_blank"` for the CVA, summary and ficha PDFs, and `router.push` to `/print` (`:937`). There is no connectivity check; offline the link dies in the browser error page.
- **Implication** — Native-readiness: a WebView often cannot open `_blank` PDFs or save `blob:` downloads; a cupper offline at the table taps a dead button.
- **Fix** — Route all report opens through one helper (web: anchor; native: fetch then share/save) and disable with a message when offline. **Acceptance:** offline shows "necesita conexión"; one helper owns the open logic. **Size:** M.
- **Native** — This is the finding.
- **Confidence** — inferred-from-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-resultados-10 · Small board-confirmed defects · severity: P3 · status: confirms-board(several)

- **Problem** — `ResultsClient.tsx:86-88`: `localStorage.getItem` is unguarded (the sibling at `:105-110` is guarded), so blocked storage crashes the page (board: *localStorage bloqueado*). `ResultsClient.tsx:1001`: `onEdit` is passed on closed sessions and `/cup` redirects back (`cup/page.tsx:80-83`). `app/[locale]/app/layout.tsx:33` and `results/page.tsx:33` redirect to login with no `next=`, so a bookmarked results URL is lost (board: *Enlace de resultados que sobrevive al login*; the close email already threads `next`).
- **Implication** — Robustness and friction: an error panel instead of results in strict-privacy browsers, a dead Editar button, and a lost deep link.
- **Fix** — Fix each as the board states. **Acceptance:** results render with storage throwing; no Editar on a closed session; a signed-out visit to the results URL lands there after login. **Size:** S each.
- **Native** — the `next=` path must survive an OAuth round trip in a system browser.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.
- **Fixed in S8-12** (PR #74) — `localStorage` read guarded, "Editar" dropped on closed sessions, login redirect carries `next=`.

## 4. Keep — works well

- Community numbers recomputed in TS from complete, non-excluded evaluations, shared with the PDFs: `lib/reports/ranking.ts`, `lib/reports/sessionReportData.ts`, `lib/scoring.ts` (`computeGroupAggregate`).
- References are anchors outside ranking, average and best; Δ uses the displayed score: `lib/reports/ranking.ts:117-216`.
- `canViewGroupResults` is one rule for the page and the report routes: `lib/sessionState.ts:26`; the participant-summary route returns 409 while hidden.
- Owner matrix and per-cupper alignment rows go only to `ownerRead`; participants get their own triple: `results/page.tsx:332-346`.
- Extrinsic data is gated by `revealed`, and the CVA route gates physical by owner: `cva-pdf/route.ts:111-117`.
- Close-email ledger, with guests marked skipped and the resend retrying only unsent: `lib/closeEmail.ts:156-169`.
- Draft evaluations are never ranked or averaged (`canShowMyScore`), and the realtime badge seeds known ids (`ResultsClient.tsx:355-360`).

## 5. Not verified

- RLS findings need a second account or `set local role authenticated` on a staging database.
- `allSubmitted` counts a cupper with one submitted evaluation and counts excluded and never-joined `invited` rows (`results/page.tsx:129`). Whether this unlocks the community too early or never needs a two-user run.
- The radar's English labels via `attrAverages[attr.label]` (`SampleRadarChart.tsx:125`) were read, not exercised in `/en`.
- PDF tagging and contrast were not inspected; render with `scripts/render-*-preview.ts` and check in a PDF/UA validator.
- Contrast and colour-only use of the two radar series (tokens in `chartColors.ts`) were not measured.
- WebView save/share behaviour needs a device.

## 6. Questions for Kim (collected)

- **K-resultados-1 · Origen después del cierre.** Después de cerrar la cata, ¿el dueño debe poder completar o corregir el origen de una muestra ya revelada (finca, proceso, altitud)? Opciones: (a) sí, siempre, porque el origen no cambia ningún puntaje; (b) solo dentro de unos días; (c) no, queda cerrado. Hoy el botón aparece y nunca guarda.
- **K-resultados-2 · Quitar a un catador de los resultados.** ¿Por qué razones se excluye a alguien (error de muestra, no siguió el protocolo, calibración)? ¿Se le avisa a esa persona? ¿Puede el dueño hacerlo después de cerrar, sabiendo que los resúmenes ya enviados quedan con el número anterior? Opciones: lista de razones fija, texto libre, o no permitir tras el cierre.
- **K-resultados-3 · Cuándo hay "mejor muestra".** ¿Con cuántos catadores se puede mostrar un promedio de grupo y su dispersión? Si dos muestras están más cerca que la dispersión del panel, ¿preferís decir "sin diferencia clara" en lugar de 1º y 2º? ¿Con qué diferencia en puntos?
- **K-resultados-4 · Ver al grupo antes de cerrar.** Hoy los participantes ven el grupo cuando todos enviaron, aunque el dueño no haya cerrado. ¿Preferís que sea solo al cerrar, o apenas cada uno envía lo suyo?

## 7. Verification log

F-resultados-1 — CONFIRMED — Final effective policies on `evaluations` (read in file order; nothing after line 156 touches them, PHASE 18/18b only change profiles, session_invites and function EXECUTE): `evals_own` FOR ALL where `cupperId = auth.uid()` (:132) plus `evals_submitted_participant` FOR SELECT where `isDraft = false` and `is_session_participant(session)` (:134), which includes any `session_participants` row and the owner. `aggregate_scores`: `agg_select` FOR SELECT, `is_session_participant` only (:156), no visibility condition. The earlier `evals_all` is dropped (:16, :131). No policy mentions `canViewGroupResults`, status or `closesAt`. So a participant JWT reads peers' submitted rows and hidden community scores via REST. Policies lack `TO`, but `auth.uid()` is null for anon so only authenticated users pass. Runtime proof still needs one `set local role authenticated` probe; `ResultsClient.tsx:390` realtime relies on this access. Solo sessions unaffected. — severity: keep (P1, security/blind integrity)
F-resultados-2 — CONFIRMED — `results/page.tsx:693` sends `physical` with no `ownerRead` guard and the query includes `physical: true` and `aggregateScore: true` (:59-65 region); `:644-657` falls back to trigger row `agg` when `groupAggBySample` is null (set only if `canViewGroup`, :204). Cva-pdf gates physical at `cva-pdf/route.ts:111`. Partly subsumed by F-resultados-1 for the score, not for physical. — severity: keep
F-resultados-3 — PLAUSIBLE — Code confirmed (`community.ts:85-125`, no guard, no importer in app/components/hooks/lib/tests). But Next.js prunes unused server actions from the client manifest, so the endpoint may not be reachable at all in production; settle by calling a built action id, or just delete both. Own draft only. — severity: → P3 (dead code, own row only; keep the cheap delete)
F-resultados-4 — CONFIRMED — `ResultsClient.tsx:1023-1030` gates only on `isOwner && revealed && !isAdminViewer`; `sessions.ts:1372` `assertSessionWritable` throws `session_closed`; `ExtrinsicEditDialog.tsx:12-14` comment and the generic catch (`:55-60`) confirm a stale doc and an unlocalized failure. `docs/flows.md` ~235/251 repeats the false claim. Fix bends the "two sanctioned post-close writes" invariant (finding already says so). — severity: keep
F-resultados-5 — CONFIRMED — `community.ts:426-445`: owner check only, no `assertSessionWritable`, no `run()`; `OwnerParticipantSection.tsx:148-160` bare catch reverts silently; the recompute re-fires the trigger after close. Emailed PDF drift follows. Fix bends closed = read-only (finding says so). Overlaps F-informes-3 on "n of N". — severity: keep
F-resultados-6 — CONFIRMED — `ResumenTab.tsx:189` prints `idx + 1` for every ranked row; `ranking.ts` sort breaks ties by position; `bestEntry` = first scored row (:88); SD is population SD (`scoring.ts:198-204`), community score rounds to 0.25 so ties are common. Mixed-basis list needs a group with some samples lacking a community row, which is an edge case. — severity: keep (P2, borderline P3)

P3 notes: none with wrong citations.
