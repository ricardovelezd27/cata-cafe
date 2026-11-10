# S8-02 — Blind-tasting and owner-data leaks

> **When:** after S8-01 is merged (it closes the same class at the database; this closes it in the payloads) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** `migrate deploy` only if the D8 default (a) commit lands (one additive migration); no SQL
> **Findings:** 8 (2 P1 · 4 P2 · 2 P3) from `docs/audits/flows-2026-11/14-informes-pdf.md, 10-resultados.md, 12-cafes.md, 11-editar-administrar.md` · **Gated on Kim:** D6, D8 (defaults given)

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: data the UI
hides but the server still sends — blind coffee names in /print, physical sheets and unreleased scores in
the results payload, strangers' session names and open-session scores in the coffee profile and Ficha,
owner notes. Invariants: PDF gating inside the builder, owner-only physical/extrinsic, participant-tier
anonymity, usableCoffeeWhere, canViewGroupResults, delete keeps history. Fix with pure, tested helpers
shared by page, PDF and email. Out of scope: database policies (S8-01), origin edit after close and
exclusion UX (S8-12). Lead decides helper shapes; Sonnet may do call sites, copy and tests. One commit per
step, `npx tsc --noEmit && npm run lint && npm test` before each, update docs/flows.md, finish with the
Definition of done in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-informes-1 | P1 | CONFIRMED | `/print` serializes coffee name and roast of unrevealed samples; super-admin lens differs from cva-pdf | `14-informes-pdf.md` |
| F-resultados-2 | P1 | CONFIRMED | Results payload carries `physical` to every viewer and the trigger score while the community is hidden | `10-resultados.md` |
| F-cafes-1 | P2 | CONFIRMED (lowered from P1) | Coffee profile and Ficha show other people's session names, dates, per-evaluation scores | `12-cafes.md` |
| F-informes-2 | P2 | CONFIRMED | Ficha averages open blind sessions, shows another owner's session names, fakes n and SD (owned here with F-cafes-2) | `14-informes-pdf.md` |
| F-cafes-2 | P2 | CONFIRMED (partly) | Coffee aggregate counts open sessions; excluded cuppers still move counts and descriptors | `12-cafes.md` |
| F-cafes-3 | P2 | CONFIRMED | Owner's private notes render for every viewer and are copied by Duplicate | `12-cafes.md` |
| F-sesiones-11 | P3 | CONFIRMED | Deleting an open blind session reveals coffee names in cuppers' history | `11-editar-administrar.md` |
| F-cafes-8 | P3 | CONFIRMED | "Anonymized" coffees keep farm/producer in sample origin data; dialog over-promises (bundled, copy only) | `12-cafes.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| D6 | Does a coffee's average include open sessions and excluded cuppers? | (a) only closed sessions, no excluded cuppers | Build (a); no "provisional" variant |
| D8 | Cancelled blind session: show the coffee in history? | (a) no, only "Muestra B" | Commit 1 skips unrevealed rows (leak closed); commit 2 adds label-only rows |

## 4. Plan

1. **One sheet-identity gate.** New pure `lib/pdf/sheetSource.ts`: `sheetSampleIdentity(sample)` returns `coffeeName`/`roastLevel` only when `revealed`, owner included (same rule as `cvaFormData.ts:881-886`). Use it in `print/page.tsx:106-107`, `api/sessions/[id]/cva-pdf/route.ts:102-105` and `lib/closeEmail.ts:242-245`. Give `print/page.tsx` the cva-pdf `viewAsId`/`ownerView` lens (`:43,99`). Test `tests/sheetSource.test.ts`. Covers: F-informes-1
2. **Results payload gate.** New pure `lib/reports/sampleGate.ts` (`gateSampleForViewer`): `physical` only for `ownerRead`; `aggregateScore: null` for a group session while `canViewGroup` is false. Replace `results/page.tsx:644-693` with it. Tests in `tests/reports.test.ts`: participant lens gets `physical: {}` and `null`, owner, admin and solo lenses unchanged. Covers: F-resultados-2
3. **Viewer-aware coffee loader.** Rewrite `lib/coffees/aggregateSamples.ts` to take `{ userId, isAdmin }`: only samples of closed sessions (closing reveals every coffee-linked sample), cuppers with `excludedFromResults` removed before counting, descriptors and individual averages, and `session.name`/`date` returned only for sessions the viewer owns or joined (`null` otherwise; strangers' rows still feed anonymous aggregates). Filtering lives in a pure, tested `filterCoffeeSamples`; no new scoring maths. Covers: F-cafes-1, F-cafes-2, F-informes-2 (D6)
4. **Page and Ficha share one model.** `computeCoffeeAggregate` (`lib/coffeeAggregate.ts`) skips named rows when the name is `null`; `coffees/[id]/page.tsx:380-440` lists only own/joined sessions with links to results, "recent tastings" shows only those rows. `api/coffees/[id]/ficha/route.ts:73-95` sets `included`/`submitted` to the real counts, omits SD when unknown, and prints names only for the same rows. `usableCoffeeWhere` and `resultsPublished || owner` stay the gate. Covers: F-cafes-1, F-cafes-2, F-informes-2
5. **Notes are owner-only.** `coffees/[id]/page.tsx:272-276` renders `coffee.notes` for owner or super-admin only; `duplicateCoffee` (`app/actions/coffees.ts:282,296-300`) drops `notes` from select and data via a pure `duplicableFields` helper with a test. Covers: F-cafes-3
6. **Blind cancel (D8).** Commit 1: `detachCoffeeHistoryForSession` (`lib/coffeeHistory.ts:133`) no longer passes `includeUnrevealed` for samples never revealed. Commit 2 (default (a)): additive migration making `UserCoffeeHistory.coffeeId` nullable; unrevealed rows are written with `coffeeId: null` and the snapshot's `sampleLabel`; readers (`profile/history/page.tsx`, `profile/page.tsx`, `app/[locale]/app/page.tsx`, `coffees/[id]/page.tsx`, `lib/guestClaim.ts`) show "Muestra B" without a link. Skip commit 2 if Kim picks (c). Covers: F-sesiones-11
7. **Anonymize copy.** Reword `coffee.deleteCoffee.body` in `messages/es.json`/`en.json` to list what remains on sample origin sheets (farm, producer, labels). No clearing: that would be a new post-close write (`docs/flows.md` §1). Covers: F-cafes-8
8. **Docs.** `docs/flows.md` §6: shared helpers, D6/D8 outcomes.

## 5. Acceptance (tests to write or checks to run)

- F-informes-1: participant `/print` payload for an unrevealed sample has no coffee name or roast; after reveal or close it does; super-admin `/print` equals their cva-pdf; `sheetSource` unit test.
- F-resultados-2: pure-builder test (participant: `physical: {}`, `aggregateScore: null` while hidden; owner/admin/solo unchanged); view-source of a participant page shows neither.
- F-cafes-1: a coffee owner who was not in a session sees no name or date of it, in page or PDF; own sessions still link to results; page and PDF share one sanitized model (test).
- F-cafes-2, F-informes-2: a submitted evaluation in an active session changes nothing on the profile; after exclusion and close the profile average equals the session's community score; the Ficha average equals the profile's; a stranger sees no session name.
- F-cafes-3: non-owner sees no notes; a duplicate of a foreign coffee has empty notes; owner view and edit form unchanged.
- F-sesiones-11: deleting an unrevealed open session leaves no row naming the coffee.
- F-cafes-8: the dialog text lists the remaining data.

## 6. Manual steps for Ricardo

- Only if commit 2 of step 6 ships: run `prisma migrate deploy` from the right checkout before deploying. No SQL phase.

## 7. Risks and rollback

- Coffees used only in open sessions show no results until close (intended, D6 (a)).
- Nullable `coffeeId` touches every history reader; the compile errors are the checklist.

## 8. Native-readiness clause

- Server-side shaping only; native pre-fetch or share of the Ficha/CVA PDF must use the same routes and helpers.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/sheetSource.test.ts`, `tests/reports.test.ts`, coffee-filter test)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-02 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the coffee profile
- [ ] gated items either done or left as named TODOs listed in the PR description
