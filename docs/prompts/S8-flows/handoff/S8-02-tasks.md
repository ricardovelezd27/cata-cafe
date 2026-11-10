# S8-02 blind leaks — reconciled task list (planner output)

Worktree read: `C:\projects\cata-cafe\.claude\worktrees\s8-02-blind-leaks` (HEAD a35649f). Nothing in the repo was edited or run.
Scope taken as given: step 6 = commit 1 only (no migration, no SQL); D6 default (a).

Conventions: "spec" = `docs/prompts/S8-flows/S8-02-blind-leaks.md`. Line numbers are from this worktree today.
Files owned by parallel specs: **[S8-01]** = `app/[locale]/app/sessions/[id]/results/page.tsx` (expiry redirect near the top). **[S8-03]** = `app/actions/coffees.ts` (guard swap + bounds on every export).

---

## 1. Proposed helper signatures with test cases

All four are dependency-free: they may import only other pure modules (`lib/coffeeAnonymize.ts`, `lib/coffeeAggregate.ts`). Prisma queries stay in the callers.

### 1.1 `sheetSampleIdentity` — `lib/pdf/sheetSource.ts` (new)

Replaces three copies of the same ungated pair:

```ts
// print/page.tsx:106-107
coffeeName: s.coffee ? coffeeDisplayName(s.coffee, tc("coffeeDeleted")) : null,
roastLevel: s.coffee?.roastLevel ?? null,
// cva-pdf/route.ts:102-105
coffeeName: sample.coffee ? coffeeDisplayName(sample.coffee, deletedCoffeeLabel(locale)) : null,
roastLevel: sample.coffee?.roastLevel ?? null,
// closeEmail.ts:242-245  (same shape, recipientLocale)
```
The only gate today is `cvaFormData.ts:881-887` (`input.sample.revealed ? … : null`), i.e. at paint time. The helper moves the same rule to the data source. Owner is NOT exempt (identical to the builder, so no behaviour change on paper).

```ts
export interface SheetSampleSource {
  revealed: boolean;
  coffee: { name: string; deletedAt?: Date | string | null; roastLevel?: string | null } | null;
}
export interface SheetSampleIdentity { coffeeName: string | null; roastLevel: string | null }

/** Name + roast of the coffee, only when the sample is revealed. `deletedLabel` is the
 *  localized "Café eliminado" (next-intl in the page, deletedCoffeeLabel(locale) in routes/email). */
export function sheetSampleIdentity(sample: SheetSampleSource, deletedLabel: string): SheetSampleIdentity;
```
Call sites spread it: `{ label, revealed, ...sheetSampleIdentity(s, label), isReference… }`.

Optional extension (architect to approve; recommended, because the same three files also triplicate the physical/extrinsic gate):
```ts
export function sheetSampleRecords(
  sample: { revealed: boolean; physical: { data: unknown } | null; extrinsic: { data: unknown } | null },
  ownerView: boolean,
): { physical: Record<string, unknown>; extrinsic: Record<string, unknown> };
// physical only if ownerView; extrinsic if ownerView || revealed; else {}
```
Tests (`tests/sheetSource.test.ts`):
1. unrevealed + coffee -> `{null,null}`.
2. revealed + coffee -> name and roast.
3. revealed, `coffee: null` -> `{null,null}`.
4. revealed, anonymized coffee (`deletedAt` set) -> name = `deletedLabel`, roast kept (anonymization keeps `roastLevel`).
5. unrevealed + anonymized coffee -> null (not even the deleted label).
6. revealed, blank name -> falls back to label.
7. `roastLevel` undefined -> null.
8. (if 2b) physical `{}` for non-owner, owner gets data; extrinsic `{}` when !revealed && !ownerView; owner gets extrinsic pre-reveal; null rows -> `{}`.
9. Parity test: for a matrix of (revealed, ownerView) the helper output fed through `buildCvaFormData` gives the same header as the builder alone (guards drift). `tests/cvaFormData.test.ts` already has a fixture.

### 1.2 `gateSampleForViewer` — `lib/reports/sampleGate.ts` (new)

Replaces the ungated assignments in `results/page.tsx`: `physical: (s.physical?.data …) ?? {}` (:693) and the `aggregateScore` object whose fallback arm reads the trigger row `agg` (:619-658) whenever `groupAggBySample` is null (which is exactly `!(canViewGroup && isGroup)`, :204).

Non-generic on purpose (a generic `<S>` returning `{...sample, aggregateScore:null}` does not typecheck as `S`):
```ts
export interface SampleGateContext { ownerRead: boolean; isGroup: boolean; canViewGroup: boolean }
export function communityHidden(ctx: SampleGateContext): boolean;   // ctx.isGroup && !ctx.canViewGroup
export function gateSampleForViewer<A>(
  input: { physical: Record<string, unknown>; aggregateScore: A | null },
  ctx: SampleGateContext,
): { physical: Record<string, unknown>; aggregateScore: A | null };
// physical: ctx.ownerRead ? input.physical : {}
// aggregateScore: communityHidden(ctx) ? null : input.aggregateScore
```
Tests (add to `tests/reports.test.ts`, which already imports `canViewGroupResults`):
1. participant, group, hidden -> `physical {}`, `aggregateScore null`.
2. owner, group (canViewGroup true by rule) -> unchanged.
3. admin viewer (ownerRead true), group -> unchanged.
4. solo owner (`isGroup:false`, `canViewGroup:false`) -> aggregate kept (solo relies on the trigger-row fallback), physical kept.
5. participant, group, `canViewGroup:true` (closed) -> `physical {}`, aggregate kept.
6. assert via the real `canViewGroupResults` that (isGroup, ownerRead) always yields canViewGroup true, so "owner + hidden" is unreachable.
7. does not mutate its input.

### 1.3 `filterCoffeeSamples` — **new file `lib/coffees/filterCoffeeSamples.ts`**, NOT `aggregateSamples.ts`

Spec places it in `lib/coffees/aggregateSamples.ts`, but that file begins `import "server-only"` (line 1) and imports `@/lib/prisma`; vitest cannot import it. Keep the Prisma query there, put the pure filter next to it.

Today the loader returns, unfiltered (aggregateSamples.ts:11-31): `{ id, sessionId, session:{id,name,date}, aggregateScore:{communityScore,participantCount,attrAverages}, evaluations(isDraft false):{descriptiveData,combinedData,individualScore,submittedAt} }`, and its header says "NO AUTHORIZATION HERE".

```ts
export interface CoffeeViewer { userId: string; isAdmin: boolean }

export interface RawCoffeeSample {                 // exactly what the new Prisma select returns
  id: string; sessionId: string; revealed: boolean;
  session: { id: string; name: string; date: Date; status: string; createdBy: string;
             participants: { userId: string; excludedFromResults: boolean }[] };
  aggregateScore: { communityScore: number | null; participantCount: number; attrAverages: unknown } | null;
  evaluations: { cupperId: string; descriptiveData: unknown; combinedData: unknown;
                 individualScore: number | null; submittedAt: Date | null }[];
}

/** Output = CoffeeAggregateSampleInput (lib/coffeeAggregate.ts) with two changes there:
 *  session.name / session.date become nullable; each evaluation gains `own: boolean`. */
export function filterCoffeeSamples(raw: RawCoffeeSample[], viewer: CoffeeViewer): CoffeeAggregateSampleInput[];
```
Rules, in this order per sample:
1. keep only `session.status === "closed"` (D6 a). Closing reveals every coffee-linked sample.
2. ADDITION to the spec (architect to approve): also require `revealed === true`. Costs nothing; protects legacy closed sessions closed before the reveal-on-close rule, where a viewer of a public coffee could otherwise match a never-revealed sample through the session row.
3. drop evaluations whose `cupperId` is a participant with `excludedFromResults`.
4. drop the sample if no evaluations remain (nothing to aggregate; changes `sessionsCount`, see section 4).
5. `session.name` / `session.date` = real value iff `viewer.isAdmin || session.createdBy === viewer.userId || participants.some(p => p.userId === viewer.userId)`; else `null` (the row still feeds anonymous totals).
6. `own = (cupperId === viewer.userId)` per evaluation. `cupperId` itself is NOT passed on.
`aggregateScore` passes through untouched (trigger row; already excludes excluded cuppers). No scoring maths.

Admin semantics (architect to confirm): `isAdmin` only unlocks names/dates; closed-only, revealed-only and exclusion filters still apply, so admin sees the same numbers as the owner.

Tests (`tests/coffeeSamples.test.ts`):
1. active session sample dropped; `closed` kept.
2. closed but `revealed:false` dropped.
3. excluded cupper's evaluation removed (count, descriptors, individual avg via `computeCoffeeAggregate`); sample with only excluded evals dropped.
4. stranger -> name/date null but evaluations still counted; owner -> name; participant (incl. status invited) -> name; admin -> name.
5. viewer excluded themselves: their evaluation not in aggregate, but name still shown if participant.
6. `own` flag only on the viewer's evaluations; output never contains `cupperId`.
7. aggregateScore identity passthrough.
8. input not mutated; empty input -> `[]`.
9. integration with `computeCoffeeAggregate`: open-session score does not move `communityAvg`; once status is closed it does.

### 1.4 `duplicableFields` — **new file `lib/coffeeDuplicate.ts`**, NOT `app/actions/coffees.ts`

`app/actions/coffees.ts` is a `"use server"` file; every export must be an async server action, so a sync helper cannot live there (and the file is S8-03's).

Current code (coffees.ts:~262-310): `select` includes `notes: true` (:283) and the create does `data: { ...source, code, name, createdBy, visibility, resultsPublished }` (:296-300). The spread is what copies notes, and any future column added to the select would leak the same way.
```ts
export type DuplicableCoffeeFields = {
  country: string | null; region: string | null; farm: string | null; producer: string | null;
  species: string | null; variety: string | null; harvestYear: string | null;
  processType: string | null; altitude: string | null; roastLevel: string | null;
  certifications: string[];
};
export const DUPLICABLE_COFFEE_FIELDS: readonly (keyof DuplicableCoffeeFields)[];
export function duplicableFields(source: Partial<DuplicableCoffeeFields> & Record<string, unknown>): DuplicableCoffeeFields;
// explicit allow-list pick; certifications copied (new array); missing -> null / []
```
Tests (`tests/coffeeDuplicate.test.ts`): never returns `notes`, `name`, `code`, `createdBy`, `visibility`, `resultsPublished`, `id`, `deletedAt`; unknown keys ignored; certifications is a copy; missing fields -> null/[]; key set equals the allow-list exactly (fails if someone adds a column).

---

## 2. Stale or wrong spec references

| Spec text | Reality today | Effect |
|---|---|---|
| step 3: `filterCoffeeSamples` lives in `lib/coffees/aggregateSamples.ts` | file has `import "server-only"` + prisma (:1, :9) | cannot be unit-tested there; use new `lib/coffees/filterCoffeeSamples.ts` |
| step 5: `duplicableFields` (no path) beside `duplicateCoffee` | `coffees.ts` is `"use server"` | helper must be in `lib/coffeeDuplicate.ts` |
| step 5: `coffees/[id]/page.tsx:272-276` | notes block is :274-278 (the audit's own cite is off by 2) | cosmetic |
| step 5: `coffees.ts:282,296-300` | `notes: true` is :283; spread :296 | cosmetic |
| step 2: replace `results/page.tsx:644-693` | the aggregate object starts :619 (`agg`/`recomputed` :619-658); `physical` :693; return object :659-699 | replace the object construction :617-700 by passing `{physical, aggregateScore}` through the gate |
| step 4: Ficha "sets `included`/`submitted` to real counts, omits SD" | `CoffeeFichaDocument` renders `AffectiveBlock` with `showIncluded={false}` `showPenalties={false}`; SD is printed only when non-null (AffectiveBlock.tsx:45-53). `included`/`submitted` are never shown and SD is already omitted | audit claim "fakes n and SD" is stale for the PDF; step-4 Ficha bullet reduces to "names only for named rows". Do not add n/SD UI (S8-12 scope) |
| audit cites `lib/coffeeAggregate.ts:85-148, 224-248` | file is 190 lines | audit only |
| spec header/§6/§7: migration, nullable `coffeeId` | commit 2 not built | PR text: "no migration, no SQL"; D8 commit 2 = named TODO |
| step 6: "no longer passes `includeUnrevealed`" | correct (:133), but the second `findMany` (:135-150) still scans unrevealed samples (harmless `updateMany` count 0); the option has no other caller | remove the option entirely and filter the second query by `revealed: true` |
| step 8: update `docs/flows.md` §6 only | flows.md §1 "Deleting a session" (:138-148) and CLAUDE.md "Delete keeps history … (revealed or not)" say the opposite of commit 1; §2 and the §6 mermaid node `CF` also change | update all of them |
| step 1: `cvaFormData.ts:881-886` | :881-887 | cosmetic |

Resolve as written: print `:43,99,106-107`; cva-pdf `:42-43,86,102-105`; closeEmail `:242-245`; coffeeHistory `:133`; ficha `:73-95`; profile page `:380-440`; `coffee.deleteCoffee.body` (es.json:864, en.json:864).

---

## 3. Ordered tasks

Independent chains (can run in parallel): T1-T2, T3-T4, T5-T8, T9-T10, T11, T12. T13/T14 last.

### T1 — sheetSampleIdentity + tests (spec step 1; F-informes-1)
- Create `lib/pdf/sheetSource.ts` (1.1) and `tests/sheetSource.test.ts`. Import only `coffeeDisplayName` from `@/lib/coffeeAnonymize`.
- Test: the 8-9 cases above.

### T2 — wire print / cva-pdf / email + super-admin lens (spec step 1; F-informes-1)
- `app/[locale]/app/sessions/[id]/print/page.tsx`: (a) replace :106-107 with `...sheetSampleIdentity(s, tc("coffeeDeleted"))`; (b) add the cva-pdf lens: `isSuperAdmin`, `adminTarget` lookup of `createdBy`, `viewAsId = adminTarget && adminTarget.createdBy !== user.id ? adminTarget.createdBy : user.id` (copy of cva-pdf :36-43); use `viewAsId` for `evaluations: { where: { cupperId } }` (:43) and the `profile` lookup (:50); `ownerView = session.createdBy === viewAsId` replaces `isOwner` at :99, :113, :115. KEEP the real `isOwner = session.createdBy === user.id` for the invite QR (:60), per the comment at :27-28.
- `app/api/sessions/[id]/cva-pdf/route.ts:102-105` and `lib/closeEmail.ts:242-245`: use the helper (`deletedCoffeeLabel(locale)` / `deletedCoffeeLabel(recipientLocale)`).
- Test: T1 parity test; manual view-source of a participant `/print` for an unrevealed sample (needs a second account; unverified here).
- Touches neither S8-01 nor S8-03 files.

### T3 — gateSampleForViewer + tests (spec step 2; F-resultados-2)
- Create `lib/reports/sampleGate.ts` (1.2); add tests to `tests/reports.test.ts`.

### T4 — wire the results payload (spec step 2; F-resultados-2) **[S8-01 file — keep local]**
- `results/page.tsx` ~:617-700 only: keep the `recomputed`/`agg` code, then
  `const gated = gateSampleForViewer({ physical: (s.physical?.data as Record<string, unknown>) ?? {}, aggregateScore }, { ownerRead, isGroup: session.isGroup, canViewGroup });` and return `physical: gated.physical, aggregateScore: gated.aggregateScore`.
- Optional one-liner in the freshness block (:543-548): skip the `computedAt` loop when `communityHidden(ctx)`; today `lastUpdatedLabel` (a trigger timestamp) is serialized while hidden although `ResultsClient.tsx:647` only shows it when `canViewGroup`.
- Do not touch lines 25-140 (S8-01 expiry redirect and `canViewGroup` derivation). If S8-01 renames `canViewGroup`, adapt.
- Test: T3 covers logic; manual: participant view-source shows `physical:{}` and `aggregateScore:null` on a hidden group session (unverified).

### T5 — filterCoffeeSamples + type change in coffeeAggregate (spec step 3; F-cafes-1, F-cafes-2, F-informes-2)
- Create `lib/coffees/filterCoffeeSamples.ts` (1.3) and `tests/coffeeSamples.test.ts`.
- `lib/coffeeAggregate.ts`: `CoffeeAggregateSampleInput.session` -> `{ id: string; name: string | null; date: Date | null }`; `CoffeeAggregateEvaluationInput` gains `own?: boolean`. Do T5 and T7 in one commit so tsc stays green.

### T6 — viewer-aware loader and callers (spec step 3; same findings)
- Rewrite `lib/coffees/aggregateSamples.ts`: `loadCoffeeAggregateSamples(coffeeId, viewer: CoffeeViewer)`; the Prisma select adds `revealed`, `session.status`, `session.createdBy`, `session.participants {userId, excludedFromResults}` and `cupperId` on evaluations; return `filterCoffeeSamples(rows, viewer)`. A `where: { coffeeId, session: { status: "closed" } }` pre-filter is an optimisation only; the pure function stays authoritative. Fix the header comment ("NO AUTHORIZATION HERE" no longer true for names/open sessions; access to the coffee remains the caller's `usableCoffeeWhere`).
- Callers (the only two): `app/[locale]/app/coffees/[id]/page.tsx:117` -> `{ userId: user.id, isAdmin }`; `app/api/coffees/[id]/ficha/route.ts:73` -> same. Grep confirms no other consumer of `loadCoffeeAggregateSamples` or `computeCoffeeAggregate`.
- Test: T5 suite.

### T7 — computeCoffeeAggregate skips unnamed rows (spec step 4; F-cafes-1)
- `lib/coffeeAggregate.ts`: `sessionRows` (:171-178) skip samples whose `session.name`/`date` is null (they still count toward `sessionIds`, `evaluationsCount`, averages, descriptors); `recentEvaluations` (:98-105) include only `ev.own === true` evaluations of named sessions. `CoffeeSessionRow` keeps non-null `sessionName`/`sessionDate` so the page compiles unchanged.
- DECISION FOR ARCHITECT: spec says "recent tastings shows only those rows", but rows of an own/joined session still carry OTHER cuppers' `individualScore` + timestamp (anonymous but identifying in a 2-3 person session). Recommended: own evaluations only (audit acceptance F-cafes-1 (3) allows "removed or only the viewer's own"). Alternative: remove the section and keys `recentTastingsTitle/Empty` (es/en parity).
- Test: new `tests/coffeeAggregate.test.ts` (none exists): unnamed rows excluded from lists but counted in totals; recent = own only; `communityAvg` weighting unchanged (golden numbers).

### T8 — profile page and Ficha show named rows only (spec step 4; F-cafes-1, F-informes-2)
- `coffees/[id]/page.tsx`: sessions list (:380-420) renders `aggregate.sessionRows` (now own/joined/admin only); drop the `isOwner ? Link : div` split (:403-415): every remaining row links to `/${locale}/app/sessions/${row.sessionId}/results` (non-null name implies the viewer can open it; before, the coffee owner's links to strangers' sessions would 404). "Recent tastings" (:422-447) per T7. `hasResults` (:125) now reflects filtered samples. Optional: muted line "and N sessions by other cuppers" when `sessionsCount > sessionRows.length` (new i18n key, es/en parity; if it has `{count}` fetch via `t.raw` and replace client-side per the ICU gotcha).
- `api/coffees/[id]/ficha/route.ts:90-94`: `sessions` already comes from `sessionRows`, so it is filtered through T6/T7. Keep `sd: null`. `included`/`submitted` (:80-81) may stay `evaluationsCount` (now truthful and never rendered). `usableCoffeeWhere` (:62) and `isOwner || resultsPublished || isAdmin` (:69) remain the gate.
- Test: model tests T5/T7; screenshots 390x844 + 1280 of the coffee profile.

### T9 — duplicableFields + tests (spec step 5; F-cafes-3)
- Create `lib/coffeeDuplicate.ts` (1.4) and `tests/coffeeDuplicate.test.ts`.

### T10 — notes owner-only: duplicate and page (spec step 5; F-cafes-3) **[S8-03 file `app/actions/coffees.ts` — keep local]**
- `duplicateCoffee`: remove `notes: true` from the select (:283), replace `...source` (:296) with `...duplicableFields(source)`; keep explicit `code`, `name`, `createdBy`, `visibility: "private"`, `resultsPublished: false`. Do not touch `requireUser`/guards (S8-03 swaps them).
- `coffees/[id]/page.tsx:274-278`: render `coffee.notes` only when `isOwner || isAdmin`. The Ficha (`ficha/route.ts:123`) is owner-only (admin gets none); leave it (audit Keep list); note the admin asymmetry in the PR.
- Notes readers found by grep: edit page (`coffees/[id]/edit/page.tsx:98`, owner-only via :31), `CoffeeForm`, `NewSessionForm.tsx:1061` (inline create input, not a read), `CoffeeFichaDocument` (fed owner-only). No other reader or copier.
- Residual: RLS `coffees_select` lets any usable viewer read the whole row (notes included) over the REST key; payload fix cannot close that (S8-01 / column scope).
- Test: T9 + manual: non-owner on a public coffee sees no notes; duplicate of a foreign coffee has empty notes.

### T11 — blind cancel, commit 1 (spec step 6; F-sesiones-11)
- `lib/coffeeHistory.ts`: `detachCoffeeHistoryForSession` (:133) -> `syncCoffeeHistoryForSession(sessionId, { db })`; add `revealed: true` to the second `findMany` (:135-136); delete the `includeUnrevealed` option and its comment (:12-15, :25, :132); update the doc comment (:114-121, "revealed or not" -> revealed only). Callers: `deleteSession` (`app/actions/sessions.ts:695`) is the only user of detach; `syncCoffeeHistoryForSession` is also called by `lib/closeSession.ts:60` and `sessions.ts:1351` without the option; `scripts/backfill-solo-history.ts` does not use it.
- Closed sessions unaffected (close reveals every coffee-linked sample, so all rows exist).
- Proof: no Prisma in vitest. Option: tiny pure `lib/historyRules.ts` `historySampleWhere()` returning `{ coffeeId: { not: null }, revealed: true }` with a one-assert test; otherwise "unverified in CI". Do NOT run a delete against `.env.local` (production); Ricardo checks on a preview: delete an open blind session, then open a cupper's history.
- Optional copy: `session.deleteSession.impact` (es.json:227) says each cupper keeps their coffee history; not in spec, leave unless architect asks.
- PR text: commit 2 (nullable `UserCoffeeHistory.coffeeId`, label-only rows) deferred, TODO for Kim D8.

### T12 — anonymize copy (spec step 7; F-cafes-8)
- `messages/es.json` and `messages/en.json` `coffee.deleteCoffee.body` (line 864 in both): keep the sentence, add that farm/producer entered on session origin sheets and the sample labels remain on past results, CVA PDF and print. No code change, no clearing (a new post-close write, flows.md §1). Key parity check by `node -e`. Consumer: `coffees/page.tsx:102`.

### T13 — docs and bookkeeping (spec step 8)
- `docs/flows.md`: §6 (helpers `sheetSource`, `sampleGate`, `filterCoffeeSamples`; mermaid node `CF` -> viewer-aware loader), §2 (profile community block rules; notes owner-only), §1 "Deleting a session" (:138-148; D8 outcome), D6/D8 outcomes.
- `CLAUDE.md`: "Delete keeps history" bullet ("revealed or not" -> revealed only) and one line on the viewer-aware coffee loader. Spec file header: no migration/SQL, step 6 commit 2 deferred.
- Audit files: add `Fixed in S8-02 (PR #…)` under F-informes-1/2, F-resultados-2, F-cafes-1/2/3/8, F-sesiones-11.

### T14 — gate
- Per commit: `npx tsc --noEmit && npm run lint && npm test`; i18n parity; screenshots 390x844 + 1280 of coffee profile (and results/print for the admin lens); Definition of done in PR.

Count: **14 tasks**. Suggested commits: T1+T2, T3+T4, T5+T6+T7+T8, T9+T10, T11, T12, T13.

---

## 4. Visible output changes per screen

**Coffee profile `/app/coffees/[id]`** (designer check)
- Stats "Sesiones" / "Evaluaciones" / "Promedio comunidad", attribute bars, flavor cloud: now count closed + revealed sessions only and drop excluded cuppers, for every viewer incl. the coffee owner. "Sesiones" counts sessions with at least one included evaluation (before: any session with a sample). A coffee used only in open sessions shows the `noResults` state until close (intended, D6 a).
- Sessions list: only sessions the viewer owns, joined (or admin). Coffee owner no longer sees strangers' names/dates/scores; those sessions vanish from the list but stay in the totals. Every listed row links to results (before: only the coffee owner's rows linked, even to strangers' sessions that 404).
- "Catas recientes": viewer's own evaluations only (or section removed). No other cuppers' scores.
- Notes paragraph: owner (and super-admin) only; hidden for others on public/shared coffees.
- Duplicate button: the copy has empty notes.

**Coffee Ficha PDF** — same community block; the sessions table lists named rows only, totals stay anonymous; no layout change; notes already owner-only.

**Results page** — no visible change (UI already hid physical data and hidden community). Payload only.

**Print page `/print`** — looks identical for owner and participants (the header already hid blind coffee at paint). Super-admin viewing another owner's session now gets the OWNER's sheet (owner evaluation, owner name, physical + extrinsic), same as cva-pdf, instead of their own empty sheet. Invite QR still only for the real owner.

**CVA PDF / close email attachment** — no visible change.

**Profile history / dashboard** — after the owner deletes an open blind session, cuppers get no history row for samples never revealed (before: a row naming the coffee). Closed-session deletes unchanged.

**Coffee delete dialog** — longer body text listing what remains on sample origin sheets.

---

## 5. Risks and unverified items

1. **Spec step 6 vs documented invariant** — CLAUDE.md and flows.md say history rows exist "revealed or not". Commit 1 deliberately changes that; update both (T13) or a later session will "fix" it back.
2. **Already-leaked rows remain** — history rows from past deletes of open blind sessions are not removed. Cleanup would need a script/SQL by Ricardo; out of scope. Count unknown.
3. **Open-session delete still copies a hidden community score** into `UserCoffeeHistory.communityScore` for samples the owner already revealed (`syncCoffeeHistoryForSession` :54). Edge case, flagged, not fixed.
4. **Trigger vs TS divergence** — profile `communityAvg` is the weighted trigger `AggregateScore.communityScore`; the results page recomputes in TS (complete-only). They can differ (under 5 cups, incomplete evals; S8-04). The acceptance "profile average equals the session's community score" cannot be unit-proven and may fail until S8-04 lands. Unverified.
5. **D6 changes numbers** — `sessionsCount` semantics change; owners with only open sessions see empty stats.
6. **Admin lens choices** (print super-admin = owner sheet; admin sees all session names) mirror cva-pdf/results; architect to confirm.
7. **Merge risk** — T4 edits S8-01's file (sample map ~:617-700 and freshness block ~:543-565; S8-01 works near the top). T10 edits `duplicateCoffee` in S8-03's `coffees.ts`; expect a conflict at the select/spread; resolve by keeping `duplicableFields` plus S8-03's guard.
8. **RLS side doors (S8-01 scope)** — `evaluations`/`aggregate_scores` and `coffees.notes` stay readable via the public key; payload fixes do not close them.
9. **Nothing was run** — no tsc, tests or app. All line numbers are static reads. Two-account behaviours (participant payload, stranger on a public coffee, exclusion then close) are unverified. `.env.local` is production: implementers must not exercise create/delete flows from the session.
10. **Count-only exposure left alone** — `getCoffeesWithStats` `_count.sessionSamples` (`lib/coffees/queries.ts:55`) includes open sessions; no names or scores.
11. **Not touched on purpose** — `lib/analytics/queries.ts:1113`, `lib/ai/chatTypes.ts` (super-admin only). Already gated on `revealed`/owner and verified: `participantSummary.ts:196`, `fichaTecnica.ts:128`, `results/page.tsx:277,664`, `cup/page.tsx:201`, `app/page.tsx:412`.
