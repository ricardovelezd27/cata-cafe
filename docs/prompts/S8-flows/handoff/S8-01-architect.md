# S8-01 — architect decisions and lead-owned code (2026-11-10)

Read after the spec (`../S8-01-rls-closed-readonly.md`) and the planner's reconciliation
(`S8-01-tasks.md`). Where this file differs from either, this file wins. Task ids T1–T13 are the planner's.

## Decisions

1. **Expiry becomes a write cutoff, as the spec says.** `assertSessionWritable` becomes expiry-aware for
   every caller that passes a row with `closesAt` (planner §1.1 "trap": accepted on purpose).
   `updateSession` stays status-only (`isSessionClosed`) so the owner can still move a passed deadline.
   The two sanctioned post-close writes keep using `isSessionClosed`. State in the PR: drafts not sent by
   `closesAt` now stop counting at the deadline instead of at the next 06:00 UTC cron; the warning and
   late-contribution rule are S8-05 (Kim C1).
2. **Step 3 (conditional submit):** follow planner T7. `count === 0` is NOT "closed"; re-read
   `{status, closesAt}` and throw `session_closed` only when `isSessionExpired`.
3. **Step 8 trigger `touch_session_on_submit`: NOT built.** No SQL trigger. Instead, in
   `submitAllEvaluations`, after the `updateMany`, when the session is a group session and this submit
   makes `allSubmitted` true (same rule as `results/page.tsx`: distinct cuppers with a submitted
   evaluation ≥ `session_participants` rows, and > 0), call the existing `touchSession` once (export it
   from a `lib/` module or duplicate the one-line update; do not import a non-async export from a
   `"use server"` file). One bump per visibility flip, no hot row, no refresh storm.
4. **Step 9:** planner T12 as written, plus: relax the results listener mount gate to
   `isGroup && !isAdminViewer` so a non-owner waiting for results gets the "hay novedades" chip when the
   flip happens. Bind the `evaluations` handler only for the owner, in both `ResultsClient` and `CupClient`.
5. **Step 11 (blind `coffeeId`):** column privileges, no function. See the SQL. Nobody reads
   `coffeeId` over the API afterwards, owner included (nothing in the browser reads `session_samples`;
   it is not in the Realtime publication). No `sample_coffee_id()`. Log the finding as `F-sesiones-13`.
6. **Two extra holes go into PHASE 21** (planner §1.8), logged as new findings in
   `11-editar-administrar.md` §3 as `F-sesiones-14` (invites) and `F-sesiones-15` (profiles):
   - `session_invites`: any signed-in user could INSERT an invite for any session and join it.
   - `profiles`: any signed-in user could PATCH their own `analyticsAccess` and open Insights.
   Before finalising, re-run the two greps (`.from(`, `.rpc(` over `app components hooks lib`) and paste
   the empty result into the PHASE 21 header comment, as PHASE 18 did.
7. **Step 5:** `revealSample` wrapped in `run()` and called through `feedback.run` (planner T9).
8. **Step 6:** `removeSessionSample` returns `{ ok: false, error: "session_closed" }` (planner T11).
9. **Step 4:** add `"pending"` to `syncEvaluation`'s result and map it to `failed` without retry in
   `hooks/useOfflineSync.ts` (planner T8). Never `"discarded"` for a not-started session.
10. **Step 7 allowlist:** planner T10 list, each entry with a one-line reason in the test.
11. **Runbook pre-flight** includes planner §2.13 (live group sessions with `startedAt IS NULL`).
12. Other specs run in parallel and merge after this one. In `app/actions/sessions.ts`,
    `app/actions/community.ts` and `results/page.tsx` keep each edit to the lines the task names.

## Lead-owned code (copy as written, then adjust imports only)

### `lib/sessionState.ts` — replace `assertSessionWritable`, add `isSessionExpired`

```ts
type ExpiryRow = { status: string; closesAt?: Date | string | null };

function toMs(v: Date | string | number): number {
  return typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : v.getTime();
}

/** A session stops accepting work when it is closed OR its `closesAt` has
 *  passed (strict `<`, the same boundary as the results page and the cron).
 *  `status` is still flipped only by closeSessionInternal: an expired session
 *  stays "active" until the cron or the owner closes it, but it is already
 *  read-only and its group results are already visible. Server clock only:
 *  client components never compute this. */
export function isSessionExpired(row: ExpiryRow, now: Date | number = Date.now()): boolean {
  if (row.status === "closed") return true;
  if (row.closesAt == null) return false;
  return toMs(row.closesAt) < toMs(now);
}

/** Throws `session_closed` for a closed or expired session. (Keep the
 *  existing doc comment above it and add: a row without `closesAt` is judged
 *  on status alone, which is what the two post-close writes rely on.) */
export function assertSessionWritable(row: ExpiryRow, now: Date | number = Date.now()): void {
  if (isSessionExpired(row, now)) throw new Error("session_closed");
}
```

`isSessionClosed` is unchanged (status only).

### `lib/sessionAuth.ts`

- `SESSION_AUTH_SELECT` and `SessionAuthRow` gain `isAsync: boolean`.
- `SampleAuthRow` gains `closesAt: Date | null; isGroup: boolean; isAsync: boolean; startedAt: Date | null; isOwner: boolean`.
  Both `requireSample*` selects add `closesAt, isGroup, isAsync, startedAt` (and `createdBy` where
  missing); `isOwner = session.createdBy === userId` (always `true` in `requireSampleOwner`).
- New pure rule in `lib/sessionState.ts`, used by the three write paths of step 4:

```ts
/** A participant cannot write before the master starts a live group session.
 *  Owner, async and solo sessions are never blocked. */
export function assertSessionStarted(row: {
  isGroup: boolean; isAsync: boolean; startedAt: Date | string | null; isOwner: boolean;
}): void {
  if (row.isGroup && !row.isAsync && !row.startedAt && !row.isOwner) {
    throw new Error("session_not_started");
  }
}
```

### PHASE 21 SQL — append to `prisma/sql/rls_and_triggers.sql`

Write the header comment in the style of PHASE 18 (why, what was verified, how to apply, how to verify).
`cupping_sessions."closesAt"` is `TIMESTAMP(3)` holding UTC, hence `now() AT TIME ZONE 'utc'`.

```sql
BEGIN;

-- Helpers. Policies run as the querying role, so both keep EXECUTE for
-- `authenticated` (PHASE 18b rule) and lose it for PUBLIC and anon.
CREATE OR REPLACE FUNCTION public.is_session_owner(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM cupping_sessions
    WHERE id = p_session_id AND "createdBy" = auth.uid()::text
  );
$$;

-- SQL twin of canViewGroupResults (lib/sessionState.ts). Keep the two in step.
CREATE OR REPLACE FUNCTION public.can_view_group_results(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM cupping_sessions cs
    WHERE cs.id = p_session_id
      AND cs."isGroup"
      AND (
        cs."createdBy" = auth.uid()::text
        OR cs.status = 'closed'
        OR (cs."closesAt" IS NOT NULL AND cs."closesAt" < (now() AT TIME ZONE 'utc'))
        OR (
          (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = cs.id) > 0
          AND (
            SELECT count(DISTINCT e."cupperId")
            FROM evaluations e
            JOIN session_samples ss ON ss.id = e."sessionSampleId"
            WHERE ss."sessionId" = cs.id AND e."isDraft" = false
          ) >= (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = cs.id)
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_session_owner(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_group_results(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_session_owner(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_view_group_results(text) TO authenticated;

-- evaluations: a cupper reads their own rows; the session owner reads
-- submitted rows (live "submitted" counter). Nobody reads a peer's row.
DROP POLICY IF EXISTS "evals_own" ON evaluations;
DROP POLICY IF EXISTS "evals_submitted_participant" ON evaluations;
DROP POLICY IF EXISTS "evals_select_own" ON evaluations;
DROP POLICY IF EXISTS "evals_select_owner" ON evaluations;
CREATE POLICY "evals_select_own" ON evaluations
  FOR SELECT TO authenticated
  USING ("cupperId" = auth.uid()::text);
CREATE POLICY "evals_select_owner" ON evaluations
  FOR SELECT TO authenticated
  USING (
    "isDraft" = false
    AND is_session_owner(COALESCE(
      "sessionId",
      (SELECT ss."sessionId" FROM session_samples ss WHERE ss.id = "sessionSampleId")
    ))
  );

-- aggregate_scores: owner always; a participant only once group results are visible.
DROP POLICY IF EXISTS "agg_select" ON aggregate_scores;
CREATE POLICY "agg_select" ON aggregate_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM session_samples ss
      WHERE ss.id = aggregate_scores."sessionSampleId"
        AND (
          is_session_owner(ss."sessionId")
          OR (is_session_participant(ss."sessionId") AND can_view_group_results(ss."sessionId"))
        )
    )
  );

-- Write policies go: every write is a server action through Prisma (postgres).
-- The SELECT policies stay (Realtime evaluates them).
DROP POLICY IF EXISTS "sessions_write" ON cupping_sessions;
DROP POLICY IF EXISTS "samples_write" ON session_samples;
DROP POLICY IF EXISTS "participants_write" ON session_participants;

DROP POLICY IF EXISTS "phys_all" ON physical_evaluations;
DROP POLICY IF EXISTS "phys_select" ON physical_evaluations;
CREATE POLICY "phys_select" ON physical_evaluations
  FOR SELECT TO authenticated
  USING ("evaluatedBy" = auth.uid()::text);

DROP POLICY IF EXISTS "ext_all" ON extrinsic_data;
DROP POLICY IF EXISTS "ext_select" ON extrinsic_data;
CREATE POLICY "ext_select" ON extrinsic_data
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM session_samples ss
      JOIN cupping_sessions cs ON cs.id = ss."sessionId"
      WHERE ss.id = extrinsic_data."sessionSampleId"
        AND cs."createdBy" = auth.uid()::text
    )
  );

-- session_invites (F-sesiones-14): the FOR ALL policy let any signed-in user
-- mint an invite for any session. Owner keeps reading their own invites.
DROP POLICY IF EXISTS "invites_write" ON session_invites;
DROP POLICY IF EXISTS "invites_select_own" ON session_invites;
CREATE POLICY "invites_select_own" ON session_invites
  FOR SELECT TO authenticated
  USING ("createdBy" = auth.uid()::text);

-- profiles (F-sesiones-15): the UPDATE policy had no column limit, so a user
-- could set their own "analyticsAccess". Every profile write is server-side.
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- Belt and braces: no API role can write these tables whatever a future
-- policy says. Prisma (postgres) and SECURITY DEFINER triggers are unaffected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  evaluations, aggregate_scores, cupping_sessions, session_samples,
  session_participants, physical_evaluations, extrinsic_data,
  session_invites, profiles
FROM anon, authenticated;

-- Blind coding (F-sesiones-13): participants could read the coffee id of an
-- unrevealed sample. Column privileges are per role, so the column is hidden
-- from the API for everyone; the app reads it through Prisma.
-- RULE: a new column on session_samples needs a GRANT SELECT (col) here, or
-- API reads of it fail. List every column of the table except "coffeeId".
REVOKE SELECT ON session_samples FROM anon, authenticated;
GRANT SELECT (id, "sessionId", position, label, revealed, "referenceRank", "createdAt")
  ON session_samples TO authenticated;

COMMIT;
```

Before committing the SQL: confirm the column list against `model SessionSample` in
`prisma/schema.prisma` (scalar columns only), and confirm `profiles_insert` is not needed
(`handle_new_user` is SECURITY DEFINER and `requireUser` upserts through Prisma).

Also write, as comments under the block:
- a **dry run**: the same statements between `BEGIN;` and `ROLLBACK;` followed by probes run as a
  participant (`set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`):
  own evaluations only; `aggregate_scores` empty while hidden; `update evaluations …` and
  `insert into session_invites …` refused; `select "coffeeId" from session_samples` refused;
  `select id, label from session_samples` works; `has_function_privilege('authenticated', 'public.is_session_owner(text)', 'EXECUTE')` true and the same for `can_view_group_results(text)` and `is_session_participant(text)`, all false for `anon`;
- a **rollback** block that restores the dropped policies and grants exactly as they were.

Never run any of it. Ricardo applies it in the Supabase SQL editor (runbook §10): SQL first, deploy second.
