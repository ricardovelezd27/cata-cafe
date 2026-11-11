-- PHASE 21 DRY RUN (S8-01). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 21 statement, runs the
-- probes, and ends with RAISE EXCEPTION carrying the probe results. One
-- statement is atomic however the SQL editor sends it: the exception rolls
-- everything back and the results arrive in the error message.
-- The red error it ends with IS the expected outcome. It starts with
-- "PHASE 21 DRY RUN: NOTHING WAS APPLIED"; compare each line with its
-- "(expect ...)" text. Any OTHER error: stop and report it.
--
-- The statements between the two marker comments must stay identical to PHASE 21
-- in prisma/sql/rls_and_triggers.sql (re-copy if that block changes; only the
-- function-body quotes differ: $fn$ here, $$ there).
--
-- Replace the three placeholders in DECLARE (see docs/LAUNCH-RUNBOOK.md §10).
-- NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_participant text := '<participant-uuid>';        -- a NON-owner participant of v_session
  v_owner       text := '<owner-uuid>';              -- creator of v_session
  v_session     text := '<active-group-session-id>'; -- active group session whose results are still hidden
  v_tables text[] := ARRAY['evaluations','aggregate_scores','cupping_sessions','session_samples',
    'session_participants','physical_evaluations','extrinsic_data','session_invites','profiles'];
  v_n int; v_m int;
  v_out text := '';
BEGIN
  -- >>> PHASE 21 statements (copy of rls_and_triggers.sql) >>>

-- Helpers. Policies run as the querying role, so both keep EXECUTE for
-- `authenticated` (PHASE 18b rule) and lose it for PUBLIC and anon.
CREATE OR REPLACE FUNCTION public.is_session_owner(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM cupping_sessions
    WHERE id = p_session_id AND "createdBy" = auth.uid()::text
  );
$fn$;

-- SQL twin of canViewGroupResults (lib/sessionState.ts). Keep the two in step.
-- "closesAt" is TIMESTAMP(3) holding UTC, hence now() AT TIME ZONE 'utc'.
CREATE OR REPLACE FUNCTION public.can_view_group_results(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
$fn$;

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
-- could set their own "analyticsAccess". Every profile write is server-side
-- (requireUser upserts through Prisma; handle_new_user is SECURITY DEFINER),
-- so profiles_insert is not needed either.
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

  -- <<< end of PHASE 21 statements <<<

  -- 1. Privileges and policies (no role switch needed)
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = ANY (v_tables)
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  v_out := v_out || format(E'\n 1a write grants left for anon/authenticated (expect 0): %s', v_n);
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY (v_tables) AND cmd <> 'SELECT';
  v_out := v_out || format(E'\n 1b non-SELECT policies left (expect 0): %s', v_n);
  v_out := v_out || format(E'\n 1c authenticated may read session_samples.coffeeId (expect f): %s',
    has_column_privilege('authenticated', 'public.session_samples', 'coffeeId', 'SELECT'));
  v_out := v_out || format(E'\n 1d authenticated may read session_samples.label (expect t): %s',
    has_column_privilege('authenticated', 'public.session_samples', 'label', 'SELECT'));
  v_out := v_out || format(E'\n 1e anon may read session_samples.label (expect f): %s',
    has_column_privilege('anon', 'public.session_samples', 'label', 'SELECT'));
  v_out := v_out || format(E'\n 1f helpers executable by authenticated (expect t t t): %s %s %s',
    has_function_privilege('authenticated', 'public.is_session_owner(text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.can_view_group_results(text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.is_session_participant(text)', 'EXECUTE'));
  v_out := v_out || format(E'\n 1g helpers executable by anon (expect f f f): %s %s %s',
    has_function_privilege('anon', 'public.is_session_owner(text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.can_view_group_results(text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.is_session_participant(text)', 'EXECUTE'));

  -- 2. As the participant
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_participant, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*), count(DISTINCT "cupperId") INTO v_n, v_m FROM evaluations;
  v_out := v_out || format(E'\n 2a participant sees %s evaluation rows from %s cupper(s) (expect 1 cupper, or 0 if they have none)', v_n, v_m);
  SELECT count(*) INTO v_n FROM aggregate_scores
   WHERE "sessionSampleId" IN (SELECT id FROM session_samples WHERE "sessionId" = v_session);
  v_out := v_out || format(E'\n 2b participant sees aggregate rows of the hidden session (expect 0): %s', v_n);
  SELECT count(*) INTO v_n FROM session_samples WHERE "sessionId" = v_session;
  v_out := v_out || format(E'\n 2c participant sees sample rows of the session (expect > 0): %s', v_n);

  -- 3. As the owner
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SELECT count(*), count(*) FILTER (WHERE "isDraft") INTO v_n, v_m FROM evaluations
   WHERE "cupperId" <> v_owner
     AND "sessionSampleId" IN (SELECT id FROM session_samples WHERE "sessionId" = v_session);
  v_out := v_out || format(E'\n 3a owner sees %s peer rows in the session, of which drafts (expect 0): %s', v_n, v_m);
  SELECT count(*) INTO v_n FROM aggregate_scores
   WHERE "sessionSampleId" IN (SELECT id FROM session_samples WHERE "sessionId" = v_session);
  v_out := v_out || format(E'\n 3b owner sees aggregate rows of the session (expect = samples with a submitted evaluation): %s', v_n);

  RESET ROLE;
  RAISE EXCEPTION E'PHASE 21 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
