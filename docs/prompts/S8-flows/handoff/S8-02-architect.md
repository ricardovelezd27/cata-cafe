# S8-02 — architect decisions (2026-11-10)

Read after the spec (`../S8-02-blind-leaks.md`) and the planner's reconciliation (`S8-02-tasks.md`).
Where this file differs from either, this file wins. Task ids T1–T14 are the planner's.

## Decisions

1. **Helper signatures in `S8-02-tasks.md` §1 are approved as written.** All four helpers are
   dependency-free (no `lib/prisma`, no `"server-only"`, no Next imports) so vitest imports them:
   `lib/pdf/sheetSource.ts`, `lib/reports/sampleGate.ts`, a new pure file for `filterCoffeeSamples`
   (not `lib/coffees/aggregateSamples.ts`, which is server-only), `lib/coffeeDuplicate.ts`.
2. `filterCoffeeSamples` keeps the extra `revealed === true` requirement.
3. **Coffee profile "recent tastings":** the viewer's own evaluations, plus every evaluation of sessions
   the viewer owns. Never another cupper's individual score from a session the viewer only joined.
   Strangers' rows still feed the anonymous aggregate numbers.
4. **Super-admin lens** sees session names and dates, read-only, as the owner would.
5. **Step 6 ships commit 1 only:** `detachCoffeeHistoryForSession` stops writing history rows for samples
   never revealed; drop the `includeUnrevealed` option and filter by `revealed: true`. No migration, no
   schema change. Leave `// TODO(S8-02 D8): label-only history rows for unrevealed samples need nullable
   coffeeId — waits for Kim's answer D8` at that site and list it in the PR.
6. **D6 default (a):** only closed sessions count, excluded cuppers removed before counting.
7. **Step 4 Ficha bullet:** do only what is needed (most of it is already true). Invent nothing.
8. **Docs:** `docs/flows.md` §6 and §1, and the CLAUDE.md "Delete keeps history" bullet (unrevealed samples
   are skipped). `Fixed in S8-02 (PR #…)` under each covered finding in the audit files.
9. No new scoring maths. Do not touch `lib/scoring.ts` or the SQL file. No SQL, no migration.
10. State in the PR, as not verified: history rows leaked by earlier deletes remain in the database; the
    acceptance "profile average equals the session's community score" cannot be proven until S8-04.
11. Other specs merge before this one: S8-01 edits `results/page.tsx` (lines ~130, ~493, ~725) and
    S8-03 edits every export of `app/actions/coffees.ts`. Keep edits there to the sample-mapping block and
    to `duplicateCoffee`.

## Work already started

`S8-02-wip.patch` holds an earlier implementer's uncommitted work on T1–T4 (the two helpers, their tests,
and four call sites, stopped while wiring the print page). Apply it with `git apply`, then REVIEW it
against the task list before building on it: it was never typechecked or tested.
