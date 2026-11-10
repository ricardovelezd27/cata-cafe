# S8-01 — Closed means read-only, in SQL too

> **When:** first of the series; nothing must be merged before · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** apply `PHASE 21` in the Supabase SQL editor (runbook §10), dry-run first; no Prisma migration
> **Findings:** 8 (2 P1 · 3 P2 · 3 P3) from `docs/audits/flows-2026-11/11-editar-administrar.md, 10-resultados.md, 08-grupal-en-vivo.md, 09-grupal-asincrona.md` · **Gated on Kim:** none

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: the browser's
Supabase key can still write evaluations, sessions and samples after close and read other cuppers'
submitted rows, bypassing lib/sessionAuth.ts. Close it in the database and the action layer. Invariants:
closed = read-only, never USING (true) without TO authenticated, policy helpers keep EXECUTE for
authenticated, owner-only physical/extrinsic. Out of scope: exclusion after close (S8-12), sample-removal
race (S8-10), progress counter (S8-11). Lead writes the SQL and expiry rule; Sonnet may do call sites and
tests. One commit per step, `npx tsc --noEmit && npm run lint && npm test` before each, update
docs/flows.md, finish with the Definition of done in the PR description. Forbid bare `git stash`. Never run
SQL or migrations against the shared project; produce SQL and runbook.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-sesiones-1 | P1 | CONFIRMED | Write policies (`evals_own`, `sessions_write`, `samples_write`, `participants_write`, `phys_all`, `ext_all`) ignore closed state and membership | `11-editar-administrar.md` |
| F-resultados-1 | P1 | CONFIRMED | `evals_submitted_participant` and `agg_select` let a participant read peers' rows and hidden community scores | `10-resultados.md` |
| F-sesiones-2 | P2 | CONFIRMED | `revealSample` rewrites `coffeeId` after close; exclusion/refresh are not on the written list | `11-editar-administrar.md` |
| F-grupal-asincrona-2 | P2 | CONFIRMED | After `closesAt` the session stays writable and joinable until the cron | `09-grupal-asincrona.md` |
| F-sesiones-3 | P2 | CONFIRMED | `removeSessionSample` has no closed guard (closed-guard half only; race and physical-data half is S8-10) | `11-editar-administrar.md` |
| F-resultados-3 | P3 | PLAUSIBLE | Dead `submitSampleEvaluation`/`submitEvaluation` flip own drafts unguarded | `10-resultados.md` |
| F-grupal-6 | P3 | CONFIRMED | Submit-versus-close race in `submitAllEvaluations` (its dead exports are the same two as above) | `08-grupal-en-vivo.md` |
| F-grupal-7 | P3 | CONFIRMED | Start not enforced server-side for non-owner writes | `08-grupal-en-vivo.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| — | none | — | Owner exclusion after close stays as today (allowlisted; S8-12 decides) |

## 4. Plan

1. **One expiry rule.** Add `isSessionExpired(row, now)` to `lib/sessionState.ts` (closed OR `closesAt` passed) and let `assertSessionWritable` accept `{status, closesAt?}`; add `closesAt` to `SampleAuthRow` in `lib/sessionAuth.ts`. Test `tests/sessionExpiry.test.ts` covers the boundary. Status is still flipped only by `closeSessionInternal`. Covers: F-grupal-asincrona-2
2. **Use it wherever the session cuts over.** `upsertEvaluation` (`app/actions/sessions.ts:578`), `submitAllEvaluations` (`app/actions/community.ts:25`), `joinViaToken` for newcomers (`community.ts:348,365`, select `closesAt`), the redirects in `cup/page.tsx:81` and `waiting/page.tsx:56`, `sessionHref` (`lib/sessionRouting.ts:22`), `results/page.tsx:130`, and the offline `"discarded"` branch (`app/actions/offline.ts:48`). Server clock only. Covers: F-grupal-asincrona-2
3. **Submit is conditional.** `submitAllEvaluations` filters its `updateMany` on the session not being closed or expired and returns `session_closed` when nothing matched. Covers: F-grupal-6
4. **Not-started guard.** `upsertEvaluation` and `submitAllEvaluations` refuse a non-owner on a live group session with `startedAt` null (`session_not_started`, es/en copy); offline replay keeps such drafts pending, never "discarded". Covers: F-grupal-7
5. **Delete dead actions; guard reveal.** Remove `submitSampleEvaluation` and `submitEvaluation` (`community.ts:85,110`). `revealSample` calls `assertSessionWritable` and loses its `coffeeId` parameter (its only caller, `ResultsClient.tsx:448`, never passes one). Covers: F-resultados-3, F-sesiones-2, F-grupal-6
6. **Sample removal respects close.** `removeSessionSample` (`sessions.ts:1115`) authorizes with `requireSampleOwner` plus `assertSessionWritable`; the transaction and physical-data warning stay for S8-10. Covers: F-sesiones-3
7. **Guard test.** `tests/useServerExports.test.ts` reads every `app/actions/*.ts` and fails when a mutating export neither calls `assertSessionWritable` nor is on a written allowlist: `updateSampleMetadata` (coffee-less post-close naming), `upsertExtrinsic`, `setParticipantExclusion`, `refreshAggregateScores` (annotated "S8-12 decides"). Covers: F-sesiones-2
8. **`PHASE 21` SQL** appended to `prisma/sql/rls_and_triggers.sql`, inside `BEGIN`/`COMMIT`, with a commented rollback. Final intended behaviour:
   - New `is_session_owner(text)` and `can_view_group_results(text)` (SQL twin of `canViewGroupResults`: group session and closed, or `closesAt` passed, or distinct cuppers with a submitted evaluation ≥ participant rows). Both `SECURITY DEFINER`, `SET search_path = public`, revoked from `PUBLIC, anon`, EXECUTE granted to `authenticated`.
   - `evaluations`: drop `evals_own` and `evals_submitted_participant`; add `evals_select_own` (`TO authenticated`, `cupperId = auth.uid()`) and `evals_select_owner` (`TO authenticated`, `isDraft = false` and `is_session_owner` of the sample's session). No INSERT/UPDATE/DELETE policy at all.
   - `aggregate_scores`: `agg_select` becomes `TO authenticated`: owner always, otherwise participant and `can_view_group_results`.
   - `cupping_sessions`, `session_samples`, `session_participants`: keep the SELECT policies (Realtime needs them); drop `sessions_write`, `samples_write`, `participants_write`.
   - `physical_evaluations`, `extrinsic_data`: replace `phys_all`/`ext_all` with SELECT-only policies of the same predicate.
   - `REVOKE INSERT, UPDATE, DELETE, TRUNCATE` on those seven tables from `anon, authenticated` as belt and braces (Prisma runs as postgres; the aggregate trigger runs as table owner).
   - Trigger `touch_session_on_submit`: after an `isDraft` true→false change, bump `cupping_sessions."updatedAt"` so participants get a Realtime signal without any evaluation row.
9. **Realtime without peer rows.** `ResultsClient.tsx:379-414`: the owner keeps the `evaluations` channel; non-owners listen to the `cupping_sessions` UPDATE on the same channel and show a generic "hay novedades" refresh chip (new key `results.refreshNewGeneric`, es/en). `CupClient.tsx:806-850`: debounce the existing `router.refresh()` (2 s trailing); the owner's submitted counter keeps working through `evals_select_owner`. Covers: F-resultados-1, F-sesiones-1
10. **Docs.** Runbook `docs/LAUNCH-RUNBOOK.md` §10 (dry run, apply, verify queries); `docs/flows.md` §1 gets the written list and expiry rule; one RLS line in CLAUDE.md. Covers: F-sesiones-1
11. **Hide `coffeeId` of unrevealed samples at the column level.** PostgREST honours column privileges: in PHASE 21 add `REVOKE SELECT ("coffeeId") ON session_samples FROM authenticated` and expose it only through a `SECURITY DEFINER` function `sample_coffee_id(sample_id)` that returns the id when the sample is `revealed` or the caller is the owner (EXECUTE kept for `authenticated`, revoked from `PUBLIC`/`anon`). Prisma runs as `postgres`, so server reads are unaffected; check that no client component selects `coffeeId` from `session_samples` through supabase-js (grep `from("session_samples")`), and that Realtime payloads for `session_samples` (CupClient live sample sync) do not need the column for non-owners. Acceptance: a participant JWT `select coffeeId from session_samples` is refused for unrevealed rows; the owner still reads it; the cup page for participants renders unchanged. Covers: blind-coding leak found in S8-01 review (no finding id; log it as F-sesiones-13 in `11-editar-administrar.md` §3 when done).

## 5. Acceptance (tests to write or checks to run)

- F-sesiones-1: with a participant JWT, PATCH of own evaluation after close, INSERT into a non-member session and owner PATCH of `status` are all refused; Realtime on `cupping_sessions` still delivers.
- F-resultados-1: a participant's `select * from evaluations` returns only own rows; `aggregate_scores` returns nothing while hidden; owner and closed reads work.
- F-grupal-asincrona-2: after `closesAt`, `upsertEvaluation`, `submitAllEvaluations` and a newcomer `joinViaToken` return `session_closed` with status still `active`; `/cup` redirects at the same instant results open.
- F-grupal-6, F-resultados-3, F-sesiones-2: the two dead exports are gone; `tests/useServerExports.test.ts` passes; a submit after close changes nothing.
- F-grupal-7: a participant write before start returns `session_not_started`; owner and async sessions unaffected.
- F-sesiones-3: removal on a closed session returns `session_closed`; on an open one it still compacts positions and reference ranks.

## 6. Manual steps for Ricardo

- Supabase SQL editor: run the `PHASE 21` dry-run (ends in `ROLLBACK`), read the probes, then run it for real; SQL first, deploy second. Check the Security Advisor. The shared project is production.

## 7. Risks and rollback

- A missed browser write path would fail silently: re-grep `.from(` writes. Rollback: the commented block restores the old policies and grants.
- Realtime dies if a helper loses EXECUTE for `authenticated` (PHASE 18b); the verify query checks it.
- Was an observation, now step 11: `samples_select` exposed `coffeeId` of unrevealed samples to participants through the REST API (a blind-coding leak the page never shows).

## 8. Native-readiness clause

- Same anon key and JWT in the shell: policies, Realtime and the `discarded` replay must behave identically; re-subscribe Realtime on app resume.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/sessionExpiry.test.ts`, `tests/useServerExports.test.ts`, probe queries in the runbook)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-01 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the results chip
- [ ] gated items either done or left as named TODOs listed in the PR description
