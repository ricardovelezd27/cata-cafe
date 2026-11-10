# S8-01 planner output: closed = read-only in SQL and actions

Worktree: C:\projects\cata-cafe\.claude\worktrees\s8-01-rls-closed-readonly (HEAD a35649f). Paths below are relative to it.
Read-only pass; nothing in the repo was changed. "unverified" = could not be proven from the repo (needs staging/prod DB).

Legend: **[P]** = task touches `app/actions/sessions.ts`, `app/actions/community.ts` or `app/[locale]/app/sessions/[id]/results/page.tsx` (files other worktrees also edit). Edits there are kept to a few lines each.

---------------------------------------------------------------------------
## 1. Facts for the architect (lead-owned parts)

### 1.1 Current signatures
- `lib/sessionState.ts:13` `assertSessionWritable(row: { status: string }): void` throws `Error("session_closed")` iff `status === "closed"`.
- `lib/sessionState.ts:17` `isSessionClosed(row: { status: string }): boolean`.
- `lib/sessionAuth.ts:34` re-exports both.
- `lib/sessionAuth.ts:25-31` `SessionAuthRow = { id, createdBy, isGroup, status, startedAt: Date|null, closesAt: Date|null }`. It ALREADY has `closesAt` and `startedAt` (from `requireSessionOwner`/`requireSessionMember`). No `isAsync`.
- `lib/sessionAuth.ts:80-90` `SampleAuthRow = { sessionId, status, cupsPerSample, format, referenceSampleId }`, built by `requireSampleMember` (:96) and `requireSampleOwner` (:131). Neither selects `closesAt`, `createdBy`, `isGroup`, `isAsync`, `startedAt`. Step 4 (not-started guard) needs for a non-owner on a live group session: `isGroup`, `isAsync`, `startedAt`, and "caller is owner". `requireSampleMember` already has `session.createdBy` and `userId` in scope, so an `isOwner` boolean is free there.
- **Trap**: `assertSessionWritable` is structurally typed. Once it accepts `{ status; closesAt? }`, every caller passing a full `SessionAuthRow` (has `closesAt`) silently becomes expiry-aware with no code change (see 1.2). Decide deliberately. Recommendation: yes for all owner-side actions, but keep `updateSession` on status-only `isSessionClosed` (sessions.ts:925) so the owner can still extend an expired deadline before the cron runs.
- Existing test `tests/actionsAndState.test.ts:9-15` calls `assertSessionWritable({ status })` without `closesAt`; keep that valid.

### 1.2 Every caller of `assertSessionWritable` / `isSessionClosed` (grep, complete)
| Site | Row passed | Expiry-aware after change? |
|---|---|---|
| community.ts:25 `submitAllEvaluations` | SessionAuthRow | yes |
| community.ts:165 `startWarmup`, :211 `stopWarmup`, :397 `createInviteToken` | SessionAuthRow | yes |
| sessions.ts:578 `upsertEvaluation` | SampleAuthRow | only once `closesAt` is added to it |
| sessions.ts:811 `setReferenceSample`, :1054 `addSessionSample` | SessionAuthRow | yes |
| sessions.ts:925 `updateSession` (uses `isSessionClosed`, returns `{ok:false,error}`) | SessionAuthRow | status-only (keep) |
| sessions.ts:1096 `renameSessionSample`, :1181 `upsertPhysical`, :1372 `upsertExtrinsic` | SampleAuthRow | once `closesAt` added |
| sessions.ts:1260-1261 `updateSampleMetadata` (inline select `{createdBy,status}`, `postCloseNaming` uses `isSessionClosed`) | custom | no |
| offline.ts:48 `syncEvaluation` | none, inline `status === "closed"` -> `"discarded"` | manual edit needed |
| UNGUARDED, not named in spec: `revealSample` (community.ts:271), `removeSessionSample` (sessions.ts:1115), `setParticipantExclusion` (:426), `refreshAggregateScores` (:463), `startSession` (:137), `closeSession`, `resendCloseEmails`, `deleteSession`, `duplicateSession`, `getDeleteImpact` | | |

### 1.3 Where `closesAt < now` is already computed (boundary to match)
- `results/page.tsx:130` `const sessionExpired = session.closesAt ? session.closesAt < new Date() : false;` (strict `<`).
- `app/api/sessions/[id]/participant-summary/route.ts:103-105` same expression, a copy the spec does not name.
- `app/api/cron/close-expired-sessions/route.ts:29` `closesAt: { lt: new Date() }` (strict).
- The SQL twin must use strict `"closesAt" < now()`. Solo/express sessions never have `closesAt`.

### 1.4 `canViewGroupResults` exact TypeScript rule (`lib/sessionState.ts:26-37`)
```
isGroup && (ownerRead || status === "closed" || allSubmitted || sessionExpired)
```
Callers compute the inputs (results/page.tsx:50-130; participant-summary route :93-111):
- `ownerRead` = creator OR super-admin viewing another session. Server-only; SQL handles "owner" via `is_session_owner`; no admin concept in SQL (admin reads through Prisma).
- `allSubmitted` = `totalParticipants > 0 && submittedCupperCount >= totalParticipants`:
  - `submittedCupperCount` = number of DISTINCT `cupperId` with at least one evaluation `isDraft = false` on any sample of the session (`evaluation.groupBy cupperId`). NOT restricted to participants; does NOT exclude `excludedFromResults`.
  - `totalParticipants` = ALL `session_participants` rows of the session (any status owner/joined/invited, excluded included). The owner has a participant row with status `owner` (sessions.ts:515, :780).
- `sessionExpired` = 1.3.
- Solo (`isGroup = false`) -> false for everyone.

### 1.5 Final effective RLS per table (file order: PHASE 1 lines 1-62, PHASE 2 lines 86-182, then 18/18b/20; PHASE 11 and 20 only touch `coffees`)
| Table | Policy (line) | Effective |
|---|---|---|
| evaluations | `evals_own` (:132) | `FOR ALL USING ("cupperId" = auth.uid()::text)`, no TO clause, no WITH CHECK (USING doubles as check): any authenticated user can INSERT a row with own cupperId for ANY sessionSampleId (no membership test) |
| evaluations | `evals_submitted_participant` (:134) | `FOR SELECT USING ("isDraft" = false AND is_session_participant((SELECT ss."sessionId" FROM session_samples ss WHERE ss.id = "sessionSampleId")))`, no TO clause |
| cupping_sessions | `sessions_select` (:112) | `FOR SELECT USING (is_session_participant(id))` |
| cupping_sessions | `sessions_write` (:114) | `FOR ALL USING ("createdBy" = auth.uid()::text)` (owner can write `status`) |
| session_samples | `samples_select` (:119) | `FOR SELECT USING (is_session_participant("sessionId"))` (exposes `coffeeId`, `revealed`) |
| session_samples | `samples_write` (:121) | `FOR ALL USING (EXISTS (SELECT 1 FROM cupping_sessions WHERE id = session_samples."sessionId" AND "createdBy" = auth.uid()::text))` |
| session_participants | `participants_select` (:144) / `participants_write` (:146) | SELECT: `is_session_participant("sessionId")`; ALL: session owner |
| aggregate_scores | `agg_select` (:156) | `FOR SELECT USING (is_session_participant((SELECT ss."sessionId" FROM session_samples ss WHERE ss.id = aggregate_scores."sessionSampleId")))`, no TO clause; no write policy |
| physical_evaluations | `phys_all` (:51) | `FOR ALL USING ("evaluatedBy" = auth.uid()::text)` (predicate is the AUTHOR column; author is always the owner since `upsertPhysical` is owner-only) |
| extrinsic_data | `ext_all` (:55) | `FOR ALL USING (EXISTS (SELECT 1 FROM session_samples ss JOIN cupping_sessions cs ON cs.id = ss."sessionId" WHERE ss.id = extrinsic_data."sessionSampleId" AND cs."createdBy" = auth.uid()::text))` |

RLS enabled on all (lines 2-8, 92-95). Realtime publication `supabase_realtime` contains ONLY `evaluations` and `cupping_sessions` (Phase 7, :861-862). `session_samples` and `aggregate_scores` are NOT published. `evaluations` has `REPLICA IDENTITY FULL` (:271).

### 1.6 Helper functions and grants (current)
- `is_session_participant(text)`: SECURITY DEFINER, STABLE, `search_path = public` (PHASE 18), EXECUTE revoked from `PUBLIC, anon, authenticated` (:1184) then granted back to `authenticated` only (PHASE 18b :1220). Body: owner OR a `session_participants` row.
- `recompute_aggregate_score()`: SECURITY DEFINER trigger fn, latest definition PHASE 6 (:710). Trigger `trg_recompute_aggregate AFTER INSERT OR UPDATE OF "isDraft" ON evaluations FOR EACH ROW WHEN (NEW."isDraft" = false)` (:264). EXECUTE revoked from API roles.
- `is_affective_complete(jsonb)`, `rls_auto_enable()`: revoked from API roles. `handle_new_user()`: EXECUTE only to `supabase_auth_admin`.
- `is_session_owner` and `can_view_group_results` do not exist yet. PHASE 18b rule: any function a policy calls keeps EXECUTE for `authenticated`.
- Table-level grants are NOT in the file; Supabase default privileges give `anon`/`authenticated` full table privileges (matters for step 11, see 2.8).

### 1.7 Numbering
- Next free SQL PHASE: **21** (last block PHASE 20; PHASE 19 never existed). Matches spec.
- Next free runbook section: **§10** (last is §9, `docs/LAUNCH-RUNBOOK.md:491`). Matches spec.
- `F-sesiones-13` is free in `11-editar-administrar.md` (last is F-sesiones-12).

### 1.8 Adjacent holes the spec does not cover (decide whether PHASE 21 grows)
- `profiles_update` (:23) `FOR UPDATE USING (id = auth.uid()::text)`, no column limit: a signed-in user can PATCH own `analyticsAccess` (schema.prisma:22) via PostgREST; `lib/analytics/access.ts:67-69` trusts that flag for insights access. Verified in SQL, exploitability unverified. Natural owner: S8-08.
- `invites_write` (:171) `FOR ALL USING ("createdBy" = auth.uid()::text)`, no check that the session is theirs: any signed-in user can INSERT a `session_invites` row for ANY `sessionId` with own `createdBy` and a chosen token, then redeem it via `joinViaToken` and become a participant of someone else's session (needs the session id, which is not secret). Recommend adding `session_invites` to the REVOKE list in PHASE 21 (all writes are server-side: `createInviteToken`, `createGroupSession`).
- `history_own` (:165) `FOR ALL`: users can forge own `user_coffee_history`. Low. Also `group_posts_write`, `tasting_groups_owner_all`, `tasting_group_members_owner_all` are `FOR ALL` (out of scope).

### 1.9 Browser-side Supabase usage (complete)
- `.from(` / `.rpc(` / `.storage` on any supabase client in `app/`, `components/`, `hooks/`, `lib/`, `scripts/`: **zero matches** (two greps). No browser REST read/write to break. Browser supabase-js is used only for `signInAnonymously` (`components/join/GuestJoinForm.tsx`) and the three Realtime clients below. `lib/supabase/server.ts` is used for `auth` only. The service-role `admin.ts` bypasses REVOKE.

### 1.10 Realtime subscriptions (all) and what each handler reads
| Component:lines | Channel | Table / event / filter | Columns read | Effect |
|---|---|---|---|---|
| `cup/CupClient.tsx:803-860` | `session:<id>` | `evaluations` UPDATE `sessionId=eq.<id>` | `isDraft`, `sessionSampleId` | `setSubmittedCount(+1)`; rendered only in `MasterControls` (:1766), owner-only |
| same | same | `cupping_sessions` UPDATE `id=eq.<id>` | `referenceSampleId` | `applyReferenceOrder`, then **`router.refresh()` on ANY session-row change** (:849) |
| `results/ResultsClient.tsx:379-414` | `results:<id>` | `evaluations` UPDATE `sessionId=eq.<id>` | `isDraft`, `sessionSampleId`, `cupperId`, `id` | badge counter (skips own and seen ids); mounted only if `isGroup && canViewGroup && !isAdminViewer` |
| `waiting/WaitingRoomClient.tsx:252-290` | `waiting:<id>` | `cupping_sessions` UPDATE `id=eq.<id>` | `referenceSampleId`, `startedAt`, `warmupStartedAt` | `onStarted()`, sync, and `router.refresh()` on ANY change |
No subscription on `session_samples`, `aggregate_scores`, `session_participants`.

---------------------------------------------------------------------------
## 2. Stale or wrong spec references

Cites confirmed unchanged: community.ts:25, :85, :110, :348, :365; sessions.ts:578, :1115; cup/page.tsx:81; waiting/page.tsx:56; sessionRouting.ts:22; results/page.tsx:130; offline.ts:48; ResultsClient.tsx:448, :379-414; CupClient.tsx:806-850. No cite moved. Problems are logic and omissions:

1. **Step 3 "returns `session_closed` when nothing matched" is wrong.** `updateMany` also matches zero rows in the normal case where the cupper has no drafts (double click, already submitted, solo owner done). Correct rule: filter on session not closed/expired; if `count === 0`, re-read `{status, closesAt}` and throw `session_closed` only if closed/expired now; otherwise return ok (idempotent). Also `submitAllEvaluations` throws (not `run()`-wrapped; CupClient catches at :1257 into the generic submit error), so "returns" means throws `Error("session_closed")` unless converted to `ActionResult`, which would also need the CupClient call site changed.
2. **Step 7 allowlist is incomplete and partly redundant.** `upsertExtrinsic` (sessions.ts:1372) already calls `assertSessionWritable`, so it needs no entry; and the "sanctioned" post-close extrinsic edit currently FAILS (F-resultados-4, S8-12): do not fix here. `updateSampleMetadata` has the call inside `if (!postCloseNaming)`, so a regex scan counts it as guarded. A scan flags these session-scoped exports unless allowlisted: `deleteSession`, `duplicateSession`, `getDeleteImpact`, `updateSession` (uses `isSessionClosed`), `startSession`, `closeSession`, `resendCloseEmails`, `checkSessionStarted`, `getWaitingState`, `syncEvaluation`, `setParticipantExclusion`, `refreshAggregateScores`. Scope the scan to exports whose body references `requireSession*`/`requireSample*`, and only `app/actions/*.ts` (some `lib/` files contain the literal "use server" in comments). Full list in T10.
3. **Step 2 misses call sites:** `participant-summary/route.ts:103`; `results/page.tsx:493` (`myDraftNotice` shown while `status !== "closed"`: an expired session tells cuppers to finish drafts they can no longer submit); `ResultsClient.tsx:581` and `:688` ("Volver a catar" gated on `sessionStatus !== "closed"`, would dead-end after the new `/cup` redirect). `sessionHref` has 6 call sites whose selects must include `closesAt`: `app/[locale]/app/page.tsx:97-107` (select), `profile/page.tsx:~92` (select), `groups/[id]/page.tsx:123` (select, plus row type :46); `sessions/page.tsx:62,106,121` use `include` (fine).
4. **Step 4:** `SampleAuthRow` lacks the needed fields (1.1). `syncEvaluation`'s return union is `"synced"|"conflict"|"discarded"` (offline.ts:29-36) and `hooks/useOfflineSync.ts:35,59` maps to `ReplayResult = "synced"|"conflict"|"failed"`. "Keeps such drafts pending" = either throw (hook retries 3x with 1-4 s backoff, then `failed`, draft stays pending) or add a fourth status mapped to `failed` with no retry. Recommended: add `"pending"` and map it to `"failed"` at the :59 line.
5. **Step 5:** `revealSample` is not `run()`-wrapped; `ResultsClient.handleReveal` (:445-453) catches everything into `notifyError("unknown")`. After the guard, "Revelar" on a closed session toasts "Algo salió mal". The button DOES appear on closed sessions for coffee-less (express) samples, because `closeSessionInternal` reveals only coffee-linked samples (`SampleRadarChart.tsx:232`, `ScoreTable.tsx:335-350`: `isOwner && !sample.revealed`). Minimum inside S8-01: wrap in `run("revealSample", ...)` -> `ActionResult` and use `feedback.run(...)`. Hiding the button belongs to S8-12 (F-resultados-7). `README.md:519` mentions `submitEvaluation` (update that line; `docs/social-engagement-blueprint.md:102` is a historical plan, leave).
6. **Step 6:** `removeSessionSample` returns `{ok:false,error}` for `sample_has_evaluations` and throws otherwise. A thrown `session_closed` reaches the browser as an opaque digest in production (`EditSessionForm.tsx:252-253` does `throw new Error(result.error)` for non-ok results; whether `ConfirmDialog` shows a thrown message: unverified). Prefer `return { ok:false, error:"session_closed" }` like `updateSession`; `EditSessionForm` already maps `errorCode === "session_closed"` (:263).
7. **Step 9 wording:** the owner counter keeps working through `evals_select_owner` (true), but it is rendered only for the owner (CupClient.tsx:1766), so for non-owners the `evaluations` binding becomes a dead socket carrying only their own row: bind it only when `isOwner`. The results listener mounts only after `canViewGroup` is already true, so the non-owner "generic chip" never announces the hidden->visible flip. Architect decision: relax the mount gate for `isGroup && !isOwner && !isAdminViewer` (my recommendation).
8. **Step 11 is partly impossible as written.**
   - `REVOKE SELECT ("coffeeId") ... FROM authenticated` is a no-op while `authenticated` holds a TABLE-level SELECT (Supabase default). Hiding one column requires `REVOKE SELECT ON session_samples FROM authenticated` + `GRANT SELECT (<every other column>)`. Future Prisma migrations adding a column to `session_samples` then need a matching column GRANT or `select *` breaks.
   - Column privileges are per role, not per row; the owner is also `authenticated`. Acceptance "refused for unrevealed rows; the owner still reads it" cannot hold. After the revoke nobody reads `coffeeId` over REST; the owner uses `sample_coffee_id()`. Since no browser code reads `session_samples` (1.9) the function is dead code unless used. Rewrite acceptance: "participant AND owner `select coffeeId` refused; `sample_coffee_id(id)` returns the id to the owner always, to participants only when `revealed`".
   - "Realtime payloads for `session_samples`" is moot: the table is not in the publication. CLAUDE.md's "live sample sync" rides the `cupping_sessions.updatedAt` touch.
9. **Step 8 trigger `touch_session_on_submit` makes a hot row and a refresh storm.** A row-level trigger bumps `cupping_sessions.updatedAt` once per sample per submit (8 samples = 8 updates of the same row in one transaction; 50 cuppers submitting in a minute serialize on that row lock). Each bump emits a `cupping_sessions` UPDATE that makes EVERY cupper's CupClient and every waiting room call `router.refresh()`. The step-9 2 s debounce helps the client, not the lock. Suggestion: bump only on the submit that flips `can_view_group_results` to true (distinct submitted cuppers reaching the participant count), or use a statement-level trigger (whether `UPDATE OF` + transition tables is allowed: unverified). Must be SECURITY DEFINER; use `WHEN (OLD."isDraft" = true AND NEW."isDraft" = false)` so the exclusion/refresh `SET "isDraft" = "isDraft"` storms (community.ts:446, :470) do not bump.
10. Step 8 claim "aggregate trigger runs as table owner" is correct (`recompute_aggregate_score` is SECURITY DEFINER, :185, :711), so the REVOKE does not break it. Add `session_invites` (1.8) to the revoke list or document why not.
11. **Step 1:** pass the server clock to `isSessionExpired(row, now)` at every server call site; client components must never compute expiry (CupClient receives `sessionStatus` as a prop only).
12. **Sequencing risk step 2 vs S8-05:** writes now stop at `closesAt` (end of the chosen UTC day, e.g. 18:59 in Bogota) instead of the next 06:00 UTC cron. Drafts unsubmitted then, which could previously still be submitted for hours, are lost silently (F-grupal-asincrona-1 and -4 are S8-05). Ship S8-05 soon after or state it in the PR.
13. **Pre-flight for step 4:** no migration backfilled `startedAt` (migrations 20260423120000 and 20260908140000 only add the column). Any still-active live group session with `startedAt IS NULL` would refuse non-owner writes. Runbook pre-check: `select id,name from cupping_sessions where "isGroup" and not "isAsync" and status='active' and "startedAt" is null;` (prod count unverified).

---------------------------------------------------------------------------
## 3. Ordered tasks (13)

One commit each; run `npx tsc --noEmit && npm run lint && npm test` before each; es/en key parity (`node -e` set diff) for T1 and T12.

### T1. Error code `session_not_started` (no dependency)
- Spec step 4 prereq. Finding F-grupal-7.
- Files: `lib/actionResult.ts:12-25` add `"session_not_started"` to `ACTION_ERROR_CODES`; `messages/es.json` and `messages/en.json` `errors.codes` (es.json ~1555-1567) new key `session_not_started`. es: "La cata aún no empezó. Espera a que el maestro la inicie."; en: "The tasting has not started yet. Wait for the host to start it."
- Test: extend `tests/actionsAndState.test.ts` ("passes known codes through") with `classifyActionError(new Error("session_not_started"))`; key parity.

### T2. Expiry rule unit tests (lead-owned dependency: `isSessionExpired`, new `assertSessionWritable`)
- Spec step 1. Finding F-grupal-asincrona-2.
- New `tests/sessionExpiry.test.ts`: `closesAt === now` NOT expired (strict `<`, same as results/page.tsx:130 and the cron); +1 ms expired; `closesAt` null/undefined -> status decides; `status "closed"` with future `closesAt` -> expired; legacy `draft`/`open` writable; `assertSessionWritable({status:"active", closesAt: past})` throws `session_closed`; old `{status}`-only call still works; parity case against `canViewGroupResults({ ..., sessionExpired: isSessionExpired(row, now) })`.

### T3. Expiry in actions: `submitAllEvaluations`, `joinViaToken`, `upsertEvaluation` **[P: community.ts, sessions.ts]** (lead-owned dependency)
- Spec step 2 (actions). Finding F-grupal-asincrona-2.
- `submitAllEvaluations` (community.ts:25) and `upsertEvaluation` (sessions.ts:578): no code change if the architect's assert takes the existing rows; verify `requireSampleMember` SELECTs `closesAt`. `joinViaToken` (community.ts:~333-367): add `closesAt: true` to the `session` select (:333); replace `const closed = session.status === "closed"` (:348) with `isSessionExpired(session, new Date())`; line :365 then refuses newcomers, and `destination`/owner redirect send members to `/results` at the same instant results open.
- Test: T2 + T10; manual: after `closesAt` the three calls throw `session_closed` with status still `active`.

### T4. Expiry in routing and redirects (lead-owned dependency)
- Spec step 2 (routes). Finding F-grupal-asincrona-2.
- `lib/sessionRouting.ts:5-10,22`: add `closesAt?: Date | string | null` to `SessionRouteInfo`; line 22 uses the helper (convert string to Date). Add `closesAt: true` to the selects: `app/[locale]/app/page.tsx:~105`, `profile/page.tsx:~92`, `groups/[id]/page.tsx:123` (+ type :46). `cup/page.tsx:81` -> `isSessionExpired(session, new Date())` (query uses `include`). `waiting/page.tsx:56`: add `closesAt: true` to its select (:30-45), same helper.
- Test: new `tests/sessionRouting.test.ts`: expired active group session -> `/results` for owner and participant; unstarted live group with future `closesAt` -> `/waiting`; admin viewer unchanged; `closesAt` absent behaves as before.

### T5. Expiry on the results side **[P: results/page.tsx]** (lead-owned dependency)
- Spec step 2. Finding F-grupal-asincrona-2.
- `results/page.tsx:130`: use the helper for the `sessionExpired` input. `:493`: `myDraftNotice` condition `session.status !== "closed"` -> `!sessionOver` (`sessionOver = isSessionExpired(session, now)`). Pass one new boolean prop `cuppingOpen` (= `!sessionOver`) to `ResultsClient` and use it at `ResultsClient.tsx:581` and `:688` instead of `sessionStatus !== "closed"`; leave `:1005`, `:1016`, `:1048` (owner sample-edit rules tied to real `status`). `participant-summary/route.ts:103-105`: replace the inline expression with the helper.
- Test: extend `tests/sessionExpiry.test.ts` (helper agrees with the old expression for null/past/future).

### T6. Offline replay on expiry (lead-owned dependency)
- Spec step 2 (offline branch). Finding F-grupal-asincrona-2. Keep item: "Offline replay answers `discarded`... F-1 must extend this pattern".
- `app/actions/offline.ts:48`: replace `status === "closed"` with the helper using the row from `requireSampleMember` (needs `closesAt`). Update comment :6-7. Return `discarded`, never throw.
- Note only (S8-09): `upsertPhysical`/`upsertExtrinsic` replayed from `useOfflineSync.ts:62-65` throw `session_closed` and retry 3x, then stay pending forever.
- Test: manual (sync a pending draft after `closesAt` -> `discarded`); not unit-testable (imports prisma).

### T7. Conditional submit in `submitAllEvaluations` **[P: community.ts]** (lead-owned dependency)
- Spec step 3. Finding F-grupal-6.
- `community.ts:22-37`: extend the `where` of the `updateMany` with `sessionSample: { sessionId, session: { status: { not: "closed" }, OR: [{ closesAt: null }, { closesAt: { gte: now } }] } }`; if `res.count === 0`, re-read `{status, closesAt}` and throw `Error("session_closed")` when closed/expired, else return `{ ok: true }` (section 2.1). Leave `maybeAutoCloseSoloSession` as is. Residual: a close committed during the single statement is not excluded (state in PR).
- Test: manual two-tab (submit vs close); no unit test unless the decision is extracted (do not edit lead-owned `lib/sessionState.ts`).

### T8. Not-started guard (lead-owned dependency: `SampleAuthRow`/`SessionAuthRow` fields) **[P: sessions.ts 2 lines, community.ts]**
- Spec step 4. Finding F-grupal-7. Uses T1.
- Rule (one place, mirrors `cup/page.tsx:88` and `sessionHref`): `isGroup && !isAsync && !startedAt && !isOwner` -> `throw new Error("session_not_started")`. Add right after `assertSessionWritable(auth)` in `upsertEvaluation` (sessions.ts:578) and in `submitAllEvaluations` (needs `isAsync` on `SessionAuthRow`), and in `syncEvaluation` (offline.ts, after the closed branch) by extending the return union with `"pending"`; `hooks/useOfflineSync.ts:59` maps `"pending"` to `"failed"` without retry so the draft stays pending (NEVER `discarded`).
- Test: owner and async unaffected; participant before start gets `session_not_started`; offline draft stays pending.

### T9. Delete dead actions; guard `revealSample` **[P: community.ts]**
- Spec step 5. Findings F-resultados-3, F-sesiones-2, F-grupal-6.
- Delete `submitSampleEvaluation` (community.ts:84-105) and `submitEvaluation` (:107-128); grep found no importer in `app/`, `components/`, `hooks/`, `lib/`, `tests/`. Edit `README.md:519`. `revealSample(sampleId)` (:271): drop `coffeeId` and its `usableCoffeeWhere` branch (remove the import if now unused), `assertSessionWritable(auth)` on the `requireSampleOwner` result, wrap in `run("revealSample", ...)` -> `ActionResult`; `ResultsClient.tsx:445-453` `handleReveal` uses `feedback.run(revealSample(sampleId), () => router.refresh())`.
- Test: T10.

### T10. Server-export guard test (after T7-T9, T11)
- Spec step 7. Finding F-sesiones-2.
- New `tests/useServerExports.test.ts`: read `app/actions/*.ts` with `fs`, split into brace-balanced `export async function name(` bodies; every export whose body references `requireSessionOwner|requireSessionMember|requireSampleOwner|requireSampleMember` must contain `assertSessionWritable(` or `isSessionClosed(`, or be allowlisted with a reason: `getDeleteImpact`, `getWaitingState`, `checkSessionStarted` (reads); `deleteSession`, `duplicateSession` (allowed on closed by design); `closeSession`, `resendCloseEmails`, `startSession` (idempotent lifecycle); `syncEvaluation` (returns `discarded`); `setParticipantExclusion`, `refreshAggregateScores` ("S8-12 decides"). Also assert `submitSampleEvaluation` and `submitEvaluation` are exported nowhere. Message names file and export. Verify once by hand that removing a guard fails the test.

### T11. `removeSessionSample` closed guard **[P: sessions.ts]**
- Spec step 6. Finding F-sesiones-3 (closed-guard half).
- sessions.ts:1115-1137: replace the hand-rolled `findUnique`/`createdBy` check with `const auth = await requireSampleOwner(sampleId, user.id)`; `if (isSessionClosed(auth)) return { ok:false as const, error:"session_closed" }` (section 2.6); keep the `_count.evaluations` check, the transaction, reference-rank compaction and position repack unchanged (race and physical-data warning are S8-10).
- Test: T10; manual: closed -> `session_closed`, nothing deleted; open -> positions and reference ranks still compact; non-owner -> `not_found_or_forbidden`.

### T12. Results realtime without peer rows; cup refresh debounce (lead-owned dependency: which events non-owners receive) **[P: results/page.tsx 1 line]**
- Spec step 9. Findings F-resultados-1, F-sesiones-1.
- `messages/es.json` and `en.json` `results` namespace beside `refreshNew` (:558): `refreshNewGeneric` (es "Hay novedades · Actualizar", en "New updates · Refresh"). `results/page.tsx:~725` add `refreshNewGeneric: tResults("refreshNewGeneric")`; type at `ResultsClient.tsx:214`.
- `ResultsClient.tsx:379-414`: owner keeps the `evaluations` binding unchanged (seenEvalIds seeding :355-360 stays); non-owner (not admin) binds `cupping_sessions` UPDATE `id=eq.<id>` on the same `results:<id>` channel, sets `hasUpdates`; the refresh button (:599-604) shows `refreshNewGeneric` when `hasUpdates && !refreshing`; `handleRefreshScores` clears it. Decide the mount gate (section 2.7).
- `CupClient.tsx:806-850`: bind the `evaluations` handler only when `isOwner`; replace the `router.refresh()` at :849 with a 2 s trailing debounce in a ref, cleared on cleanup; keep `applyReferenceOrderRef` immediate.
- Test: manual with two accounts (participant REST `select *` from `evaluations` returns own rows; owner badge increments; participant chip appears). Screenshots 390x844 and 1280 of the results header with the chip (DoD).

### T13. Docs
- Spec step 10 + DoD. Finding F-sesiones-1.
- `docs/LAUNCH-RUNBOOK.md`: new `## §10. Supabase — apply PHASE 21 (closed = read-only in SQL)` after §9: why; pre-flight (section 2.13 query, table privileges query); dry-run ending in `ROLLBACK`; apply; verify with `set local role authenticated` + `request.jwt.claims` (own rows only on `evaluations`, empty `aggregate_scores` while hidden, INSERT/UPDATE refused, `has_function_privilege('authenticated', 'public.is_session_owner(text)', 'EXECUTE')` and for `can_view_group_results(text)` true, anon false); Security Advisor; rollback pointer; SQL first, deploy second. The SQL block is lead-owned; implementer writes the prose and probes around it.
- `docs/flows.md` §1: read-only paragraph (:30) gets the written list (extrinsic edit, coffee-less naming, owner exclusion/refresh pending S8-12) and the expiry rule; group paragraph (:75), mermaid label (:94) and the `sessionHref` subsection (:214) mention expiry.
- `CLAUDE.md`: one RLS line (browser key is SELECT-only on the seven tables; writes only through server actions).
- Audit files `11-`, `10-`, `08-`, `09-`: `Fixed in S8-01 (PR #…)` under each of the 8 findings; add `F-sesiones-13` (coffeeId column) in `11-editar-administrar.md` §3.

### Lead-owned (listed so nobody builds them)
- L1 `isSessionExpired`, widened `assertSessionWritable`, `SampleAuthRow` (+ `closesAt`, `isAsync`, `startedAt`, `isGroup`, `isOwner`), both `requireSample*` selects.
- L2 PHASE 21 SQL (steps 8 and 11) with probes and commented rollback.

---------------------------------------------------------------------------
## 4. Risks

1. Silent behaviour change across 15 call sites when `assertSessionWritable` becomes expiry-aware by structural typing (1.1); document with a test.
2. Draft loss at the exact deadline until S8-05 (2.12).
3. `submitAllEvaluations` count 0 is not "closed" (2.1); a wrong implementation errors on every double click.
4. Hot row and refresh storm from `touch_session_on_submit` (2.9); Keep item "touchSession bumping updatedAt so cup screens refresh" stays valid only if bump frequency is bounded.
5. Column REVOKE does not do what step 11 says and adds a migration trap (2.8). The leak is real (`samples_select` exposes `coffeeId`) but nothing in the browser reads the table.
6. Realtime dead socket if the new helpers lack EXECUTE for `authenticated` (PHASE 18b), or walrus cannot evaluate a policy: probe with `set local role authenticated`; deploy SQL and app in the same window, since non-owner results chip and cup refresh depend on T12.
7. Invites and profiles holes stay open if PHASE 21 covers only the seven tables (1.8): escalate to Ricardo.
8. Offline physical/extrinsic replay retries forever against closed/expired sessions (T6 note); more sessions hit it once expiry is enforced.
9. Legacy live sessions with `startedAt IS NULL` would block non-owner writes (2.13; prod count unverified).
10. Parallel-merge conflicts: sessions.ts (T8 two lines in `upsertEvaluation`, T11 `removeSessionSample`), community.ts (T3, T7, T9 in separate regions), results/page.tsx (T5 lines 130/493, T12 ~725). Keep each its own small commit.
11. Unverified: whether `ConfirmDialog` shows a thrown message from `removeSessionSample`; whether a statement-level trigger with `UPDATE OF` plus transition tables is allowed; real exploitability of the PostgREST holes (one Supabase project, `.env.local` is prod, so test on a throwaway JWT only with Ricardo's go-ahead).
