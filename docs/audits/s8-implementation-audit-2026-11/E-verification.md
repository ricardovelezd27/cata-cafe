# E — Verification of the S8 audit remediation

Verified tip: `origin/claude/s8-25-next-upgrade-impl` @ `2a19f83` (detached), compared against
`origin/claude/s8-21-loose-ends-impl` (audited commit `3713033`). 21 commits: S8-22 server rules,
S8-23 client/offline, S8-24 SQL+docs, S8-25 Next upgrade.
Verifier: read-only on tracked code. One temporary test folder (`tests/_verify/`, with copies of the
OLD modules taken via `git show`) was created, run and deleted; `git status --short` is empty at the end.
No database, dev server, browser or email was used.

Labels: **V** = Verified (executed or established from quoted code); **SS** = Strongly supported; **H** = Hypothesis.

## 1. Summary table

| Finding | Original reproduced? | Fixed at root? | Regression test real? | Residual risk | Status |
|---|---|---|---|---|---|
| B-01 (High) | Yes, executed on old module: rawScore 6637.5625, `"abc"` stored (V) | Yes for every key the scorer/trigger read (`<attr>_final`, `<attr>`), both write paths, drafts and submitted, ref pin (V); write + re-fire now one tx (V on fake; SS on Postgres) | Partly: string/clamp tests fail on revert; the "ceiling" test passes on the OLD code (tautological, V) | Rows already stored before the fix are not cleaned; `0` now becomes `1` and numeric strings are dropped (behaviour change, no UI path sends them); P2025-inside-tx assumption not run on PG | Resolved (code); runtime unverified |
| A-01 (High) | n/a (release defect) | Yes: both exported entry points check the flag before `requireUser`; dialog hidden; no other importer of `deleteAccountData`/`getAccountDeletionImpact` (V by grep) | Parse test real; wiring is a source scan (weak) | None while unset; flag default off | Resolved |
| D-01 (High) | Old audit: next 16.2.4 critical (from report) | next 16.4.6 + eslint-config-next 16.4.6 in package.json and lockfile (V); `next` no longer in `npm audit` (V); boundaries use `retry`, which 16.4.6 passes (V: `error-boundary.js:114`) | No CI audit gate added | 7 transitive vulns left (4 high) all under `prisma` (deepmerge-ts, mysql2, @hono/node-server, valibot) | Resolved (residual transitive) |
| A-02 (Medium) | SS (policy text) | Yes: 5 write policies dropped, 3 read twins identical USING, 6 SELECT policies → TO authenticated, schema-wide REVOKE + default privileges, fail-safe self-check; rollback matches original definitions verbatim (V by reading) | Static replay of the SQL file: real (fails without PHASE 24); no DB execution | Not run anywhere; tables created by other roles (dashboard) still get Supabase defaults (documented); coffees↔coffee_shares recursion follow-up excluded per brief | Resolved in SQL, Not verifiable at runtime |
| A-03 (Medium) | V (no throttle in old code) | Mostly: attempts reserved per address (lower-cased HMAC) and per IP before `verifyOtp`/`token_hash` | Pure rule real; wiring is a source scan (weak) | Targeted lockout: anyone can burn a known address's 10 attempts/15 min (code entry refused; link path still works); unauthenticated endpoint now writes ledger rows with no retention purge; per-target key on token hash is useless (per-IP only) | Partially resolved (acceptable) |
| A-04 (Medium, H) | V (code) | Partly: reserves per NEW address + per IP; no per-user key, so one account can vary targets up to 60/15 min/IP | Source scan (weak) | Project-wide Supabase mail quota still drainable by one account across many targets | Partially resolved |
| A-05 (Low) | V (old select lacks closesAt) | Yes; UI already hides "edit metadata" when expired, "Asignar café" only when status closed (V) | Weak: two pure assertions pass on old code too; wiring is a source scan | none | Resolved |
| B-02 (Medium) | V (old plan: no startedAt) | Mostly: startedAt=now when any evaluation exists | Real (fails on old) | Joined participants with no saved evaluation are still sent to the waiting room until the owner presses Iniciar; read/plan/write not atomic | Resolved (narrow residual) |
| B-03 (Medium) | SS | Partly: closed sessions re-synced after commit, so individual/community scores become correct (SS); `evaluationId` stays NULL on the surviving row (upsert update does not set it) | Source scan (weak) | History row unlinked from its evaluation; a failing sync is only logged and the comment's "repair pass re-syncs" is wrong for finalized sessions | Partially resolved |
| B-05 (Low) | SS | Partly: `setReferenceSample(null)` re-pins; **`removeSessionSample` (removing the active reference sample) still re-activates the earlier one without re-pin** | Plan test real; wiring source scan | Also NEW behaviour: the re-pin silently overwrites cuppers' submitted ratings without the confirm the forward path requires (TODO in code) | Partially resolved |
| B-06 / D-07 (Low) | V (old Santiago 2026-04-05T02:59:59.999Z) | Yes; my sweep over all 418 IANA zones, every DST-transition day ±1–2, 2026–2028: 3,120 checks, 0 bad (V) | Real (fails on old) | Stored deadlines computed by old code for those two Santiago dates stay 1 h early (no recomputation); 2026-04-04 is already past | Resolved |
| B-07 (Low) | SS | Yes for the group results page; solo/non-group fallback still reads the trigger row (`participantCount 0` → community 0) | Pure helper new; wiring source scan | Minor | Resolved (group) |
| C-01 (Medium) | SS (old sends start-of-pass snapshot) | Yes: every module kind re-read through the serialized store right before send; skipped if no longer pending/failed (V by reading) | Pure `moduleToSend` tests; hook not tested | Remaining gap is only between the re-read and the dispatch (one microtask) and relies on Next's one-at-a-time action dispatch (SS); physical/extrinsic still unordered server-side (cross-tab/device) | Resolved (client) |
| C-02 (Medium) | V (test reproduces hole) | Indirectly: stale payload no longer sent; the server clamp hole itself remains (the new test asserts it still exists) | Real for the client path | Two tabs/devices with fast clock still order by arrival | Partially resolved (by design) |
| C-03 (Medium) | V (audit) | Yes: chain survives a rejected tick; `handleStart` try/finally | Real | **NEW**: `stop()`+`start()` while a tick is in flight arms a second chain (V: 2 ticks per interval, 8 in 4 intervals) | Resolved, new Low issue |
| C-04 (Medium, H) | H | Partly: hit re-puts entry (LRU per spec); cap still 120, so a long SPA session that fetches >120 new assets after boot can still evict the core chunks it loaded once | None (no test) | Browser `keys()` ordering after `put` not observed | Partially resolved (H) |
| C-05 (Low) | SS | Yes for all three sub-items; no real failure hidden (waiting is not a failure; retry still marks phase failed; old orphans still stored) | Real | Old conflicts/closed_unsent still warn on every sign-out (audit suggested pending/failed only) | Resolved |
| D-02 (Medium) | V (audit script) | Yes | Real (scanner + synthetic case) | es only, literal keys only | Resolved |
| D-03 (Medium) | V | Yes: §27 combined rollout with order, ten names, checksums, rollback order | n/a | §27 sits before §10 (numbering) | Resolved |
| D-04 (Medium) | V | Yes for the three passages | n/a | NEW drift: CLAUDE.md:283 still says earlier references "keep their pinned data but unlock" on `null` (B-05 now re-pins) | Resolved, new doc drift |
| D-09 (Low) | SS | Partly: group must equal `session.groupId`; repeat notifications by direct POST still possible (no `groupNotifiedAt` check), bounded by 3 broadcasts/h | Source scan | Owner self-spam | Partially resolved |
| Saved-insights scope | SS | Yes: non-super-admins list only own; delete already scoped | Pure helper real; wiring scan | AI admins (non-super) lose visibility of others' saved insights (intended per S8-08) | Resolved |

## 2. Details per finding

### B-01 (High) — Resolved in code
- Fix: `lib/evaluation.ts` `sanitizeAffectiveRatings` applied inside `computeEvaluationDerived` (`...sanitizeAffectiveRatings(data)`); keys = `<id>_final` and `<id>` for the 8 `AFFECTIVE_ATTRIBUTES`. The trigger/`is_affective_complete`/attrAverages read exactly `fragancia_af_final … impresion_global_final` and `<id>` bases (`rls_and_triggers.sql:547-554, 1667-1674`); `rawScore` column is server-derived; cup arrays already go through `cupFlags`. So every numeric the trigger reads is bounded (V).
- Both write paths: `upsertEvaluation` (`sessions.ts:711-713`) and offline `replayEvaluationCore` (`offline.ts:127-133`) call it; pin (`pinReferenceAffective`) runs before it and still yields 79.00 with hostile input (V executed). Drafts and submitted are both sanitized at write.
- Atomicity: `lib/evaluationWrite.ts` now runs `update` + `updateMany(submittedRefireArgs)` in one `$transaction` for non-draft rows; the hot draft path stays one statement guarded by `isDraft: true`. The comment's claim that a P2025 inside the interactive tx "does not abort the Postgres transaction" is SS (Prisma raises P2025 client-side after a zero-row UPDATE) but not executed.
- Executed: old module 9999 → rawScore 6637.5625, individual 100; `"abc"` stored. HEAD: affective and combined clamp to 9/1, string dropped. Fake client: a throwing re-fire surfaces from the same tx (`update, tx, update, updateMany`).
- Test quality: `affectiveBounds.test.ts` "an all-9 sheet is the ceiling…" passes on the OLD module too (individual score was already clamped at 100) — tautological. The other cases are real.
- Behaviour changes for honest users (V executed): `_final: 0` used to mean "unset" (score fallback 5, incomplete in SQL) and now becomes 1 (raw 88.1875 → 85.5625, and counts as complete); numeric strings like `"7"` are now dropped (89.5 → 88.1875). The current UI only emits integers 1–9 (`AffectiveBubbles.onChange(n)`), so no honest path is affected (SS).
- Residual: pre-existing stored rows with bad values are not cleaned; a read-only production query (`select id from evaluations where "affectiveData"->>'sabor_af_final' !~ '^\d+(\.\d+)?$' …`) should confirm none exist. Descriptive `_int` intensities remain unbounded (display only, pre-existing).

### A-01 (High) — Resolved
- `lib/features.ts` `parseFlag` (only exact `"1"`), `isAccountDeletionEnabled`; `getMyAccountDeletionImpact` and `deleteAccount` throw `not_found_or_forbidden` first; profile page renders the dialog only when on. Grep: `deleteAccountData` and `getAccountDeletionImpact` are imported only by `app/actions/account.ts`; no script imports them; `admin.deleteUser` elsewhere only in `guestClaim.ts` (guest merge, unrelated). Runbook §27 step 7 and CLAUDE.md env list document it.

### D-01 (High) — Resolved, transitive residue
- `package.json` next 16.4.6, eslint-config-next 16.4.6; lockfile `node_modules/next` 16.4.6, next-intl 4.14.10 (peer `next ^16.0.0`). Build banner: "Next.js 16.4.6 (Turbopack)".
- Boundaries: Next 16.4.6 `client/components/error-boundary.js:111-115` passes `{ error, reset, retry }`; docs `error.md:331-332` "v16.3.0 retry stable, v16.2.0 unstable_retry added". All four boundaries use `retry`; grep finds no `unstable_retry` in app/components/lib/hooks. Upgrade notes (version-16.md:1262-1273): removed `unstable_rootParams`, `experimental.viewTransition`, `experimental.appNewScrollHandler` — none used (grep). `unstable_rethrow` is still exported (`navigation.d.ts:128`). `proxy.ts:41` exports `proxy`; build shows `ƒ Proxy (Middleware)`.
- `npm audit --omit=dev`: 7 vulnerabilities (3 moderate, 4 high), all under `prisma@7.7.0` (`@prisma/config`→deepmerge-ts, `@prisma/dev`→@hono/node-server, valibot, `mysql2`). No `next` entry. No CI audit gate was added (audit's suggested regression test).

### A-02 / PHASE 24 — Resolved in SQL, not run
- Correctness (read): the 18 expected pre-flight policies match every `CREATE POLICY` left in the file; after PHASE 24, 16 remain, all SELECT TO authenticated (the static test replays this). REVOKE `ON ALL TABLES` covers tables, views, foreign tables; column privileges of the same type are revoked with the table privilege. Default privileges are revoked for role postgres only (others reported by dry-run 4b). Realtime still has SELECT policies on `cupping_sessions` and `evaluations`. Helper EXECUTE untouched.
- Fail-safety: self-check aborts the tx on any non-SELECT policy, any `TO public USING (true)`, any API-role write privilege (via `has_table_privilege`, which also counts PUBLIC grants — would abort, i.e. fail safe). Dry run is one DO block ending in RAISE (atomic), statements byte-identical to the phase (tested).
- Reversibility: rollback recreates `tasting_groups_owner_all`, `tasting_group_members_owner_all`, `history_own`, `group_posts_write`, `coffees_write` verbatim as in PHASE 2/10/17/20 (compared line by line), re-targets the six policies TO public, and restores grants from the saved pre-flight (b) output. DDL and ALTER DEFAULT PRIVILEGES are transactional.
- Not covered by design: the coffees↔coffee_shares policy recursion (separate follow-up, not reported).

### A-03 — Partially resolved (acceptable)
- `verifyEmailCode` reserves `code_verify` (10/15 min per lower-cased address HMAC, 120/15 min per IP) before `verifyOtp`; `confirmEmailToken` keys on sha256(token_hash). Varying case does not bypass (`targetKeyForEmail` lowercases + trims, V). Brute force of one code: ≤10 guesses per 15 min (SS sufficient).
- Lockout: counts attempts, not failures, so an attacker who knows an address can keep that user's code entry refused (the emailed link still works through a different bucket). Rows are written on an unauthenticated endpoint; no retention purge exists for `outbound_email_events` (only account deletion deletes rows). `kind` is free text, so `code_verify` inserts cannot violate a constraint (V schema/migration).

### A-04 — Partially resolved
- Reserve keyed on target + IP; the audit asked for target + user. Without a per-user key one account can mail up to 60 distinct targets per 15 min per IP (GoTrue's own per-user frequency still applies, H).

### A-05 — Resolved
- `session: { select: { createdBy, status, closesAt } }`; `isSessionClosed` is status-only so post-close naming is still only allowed once closed, consistent with `ResultsClient` (`onEditMetadata` gated by `cuppingOpen`, `onAssignCoffee` by `sessionClosed`). Test: the pure assertions pass on the old code (they test an unchanged function); only the source scan detects a revert.

### B-02 — Resolved (narrow residual)
- `planClosesAtChange` returns `startedAt: now` when no `startedAt` and `hasActivity` (any evaluation on any sample). Executed: old plan has no `startedAt`. Joined participants who have not saved anything are still redirected to `/waiting` until the owner starts; that is a product call, not a lockout of work in progress.

### B-03 — Partially resolved
- After the merge tx, `syncCoffeeHistoryForSession` runs for each closed session in `refireSessions` (which includes every conflict session). Its upsert updates `individualScore` and `communityScore` but not `evaluationId` (`coffeeHistory.ts:148-151`), so the account's row keeps `evaluationId = NULL` (unlinked; `resync-low-cup-history.ts` still skips it). A failure is only logged; the comment's "the close repair pass re-syncs history too" does not hold for already-finalized sessions.

### B-05 — Partially resolved
- `planRemoveActive` adds `repinId`; `setReferenceSample(null)` sets `repinTarget`. Missed neighbour: `removeSessionSample` → `removeSamplesInTx` (`lib/sampleRemoval.ts:24-35`) re-aims `referenceSampleId` to the earlier reference with no re-pin, so removing the active reference SAMPLE leaves R1 active with drifted ratings (SS). New behaviour: the null path rewrites other cuppers' submitted ratings with no owner confirmation (code TODO), unlike the forward path's `confirmRepin`. Irreversible for those rows.

### B-06 / D-07 — Resolved
- Binary search for the first second of the next local day, fast path verified. Executed: old 02:59:59.999Z vs new 03:59:59.999Z; full IANA sweep (418 zones, 3,120 transition-adjacent days 2026–2028) 0 failures. Only caller writes new deadlines; stored ones are compared by `dateInZone` (unchanged), so nothing already stored moves.

### B-07 — Resolved for group results
- `noIncludedAggregate(N)` used when a recompute map exists but the sample has none and N>0. The plain `agg` fallback (solo/non-group) still maps `participantCount 0` to community 0.

### C-01 / C-02
- `loadModuleSerialized` goes through the same per-key chain as writes; `moduleToSend` returns current data/updatedAt or null; `ifUpdatedAt` uses the fresh stamp. All module keys of each sample are iterated (physical/extrinsic included). The server-side clamp (`effectiveClientTs`) is unchanged; the shipped test explicitly asserts the hole still exists at the server and relies on the client not sending stale data.

### C-03 — Resolved; new Low issue
- `createPollChain` re-arms in `finally`; `handleStart` try/finally. New: if `stop()` and `start()` happen while a tick is awaiting (SUBSCRIBED then drop within one request), the old tick's `finally` sees `running === true` and arms a second timer. Executed: 2 ticks in one interval, 8 in four. Each further flap during an in-flight tick adds another chain until the next `stop()`.

### C-04 — Partially resolved (H)
- Cache hit → `event.waitUntil(cache.put(request, cached.clone()))` (allowed while respondWith is pending). Per the Cache spec a put removes and re-appends, so `keys()` order becomes LRU; not observed in a browser. Cap still 120; core chunks fetched once at boot age out during a long SPA session.

### C-05 — Resolved
- `phaseAfterPass` maps waiting-only to idle; `warnableCount` drops orphans > 30 days; not-due `retry` keeps attempts (waiting and `nextAttemptAt` cannot coexist, so no stuck-waiting case).

### D-02, D-03, D-04, D-09, saved insights — see table.

## 3. New issues introduced by the remediation

| # | Sev. | Where | Evidence | Smallest fix |
|---|---|---|---|---|
| N-1 | Low/Medium (product) | `app/actions/sessions.ts` setReferenceSample null path (`repinTarget = plan.repinId`, TODO) | Re-pin rewrites every cupper's submitted ratings on the re-activated reference without confirmation; the forward path requires `confirmRepin` | Reuse `repinNeedsConfirm` on the removal path (or owner decision recorded) |
| N-2 | Low | `lib/sampleRemoval.ts:24-35` | B-05 neighbour: removing the active reference sample re-activates the earlier one unpinned | Run `planReferenceRepin` on the new active id inside `removeSamplesInTx` |
| N-3 | Low | `lib/waitingPoll.ts` `arm()` finally | Executed: double chain after stop/start during an in-flight tick | Generation counter: capture `gen` at arm, re-arm only if `gen === current` |
| N-4 | Low | `lib/emailBudget.ts` code_verify | Unauthenticated endpoint inserts one row per attempt; no purge; attackers can lock a known address's code entry for 15 min | Periodic purge of rows older than `MAX_WINDOW_MS` in the daily cron; consider counting only failures per target |
| N-5 | Low | `lib/guestClaim.ts` B-03 comment | "the close repair pass re-syncs history too" is false for finalized sessions; history row keeps `evaluationId NULL` | Set `evaluationId` in the history upsert's `update`; fix the comment |
| N-6 | Low (doc) | `CLAUDE.md:283` | Still says earlier references "keep their pinned data but unlock" on null; code now re-pins | One sentence |
| N-7 | Info | `lib/evaluation.ts` | `0`→1 and numeric strings dropped (behaviour change; no UI path) | Document; or treat 0 as unset (delete) |
| N-8 | Info | `lib/evaluationWrite.ts` | First save of a new evaluation now costs update + BEGIN/update/COMMIT + create (was update + create) | Acceptable; watch pool under 50-person rooms |

No new unguarded server action, no new unvalidated input reaching Prisma, no signature change with an unupdated caller (`writeEvaluationOrdered` return shape unchanged; `planClosesAtChange`/`planRemoveActive` additions are optional fields; `notifyGroupOfSession` callers pass the session's own `groupId`, V).

## 4. What I executed (real output)

| Command | Result |
|---|---|
| `git checkout --detach origin/claude/s8-25-next-upgrade-impl` | HEAD `2a19f83` |
| `npm ci && npx prisma generate` | exit 0; "Generated Prisma Client (7.7.0)" |
| `npm test` | **128 files, 1153 tests passed**, exit 0 (23.5 s) |
| `npx tsc --noEmit` | exit 0, no output |
| `npm run lint` | exit 1: **11 problems (4 errors, 7 warnings)** — same files as the audit's baseline (`app/[locale]/dev/page.tsx` ×2, `components/ui/IntensitySlider.tsx` ×2); nothing in the remediation diff |
| `npm audit --omit=dev` | **7 vulnerabilities (3 moderate, 4 high)**, all transitive under `prisma`; no `next` advisory (was 19 incl. 1 critical) |
| `npx next build` | "Next.js 16.4.6 (Turbopack)", "✓ Compiled successfully in 20.4s", `ƒ Proxy (Middleware)`, exit 0 |
| Temporary `tests/_verify/verify.test.ts` against OLD modules (git show) and HEAD | 13/13 passed: B-01 reproduced (raw 6637.5625, `"abc"` stored) and fixed; ceiling test tautological on old code; 0/string behaviour change measured; write+refire in one tx (fake); B-02 reproduced and fixed; B-06 reproduced and fixed + 418-zone sweep 0/3,120 bad; B-05 old plan lacks repinId; C-03 new double-chain (2 ticks/interval) |
| `git status --short` at end | empty |

## 5. Not verified (and what would settle it)
- Everything against Postgres: PHASE 24 (dry run in production per §26), the transactional write + re-fire under Prisma 7/pg adapter (P2025 inside an interactive tx), guest merge + history resync, existence of already-poisoned evaluation rows (one read-only query).
- Browser/runtime: Cache `put` reordering of `keys()` (C-04), waiting-room poll under real socket flaps, offline replay ordering on a phone, Realtime after PHASE 24 (§10 step 5 two-account test), GoTrue rate-limit attribution behind Vercel.
- next-intl 4.14.10 at runtime beyond a successful build (no page rendered).
