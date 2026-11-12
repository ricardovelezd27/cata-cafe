-- PHASE 25 DRY RUN (S9-02, audit A-10). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 25 statement, runs the
-- probes, and ends with RAISE EXCEPTION carrying the probe results. One
-- statement is atomic however the SQL editor sends it: the exception rolls
-- everything back (grants included) and the results arrive in the error message.
-- The red error it ends with IS the expected outcome. It starts with
-- "PHASE 25 DRY RUN: NOTHING WAS APPLIED"; compare each line with its
-- "(expect ...)" text. Any OTHER error: stop and report it; nothing was applied
-- either way.
--
-- The statements between the two marker comments must stay identical to PHASE 25
-- in prisma/sql/rls_and_triggers.sql (tests/phase25Sql.test.ts checks it).
--
-- Replace the TWO placeholders in DECLARE (see docs/LAUNCH-RUNBOOK.md §28).
-- NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_owner   text := '<owner-uuid>';   -- creator of v_session
  v_session text := '<session-id>';   -- a group session the owner created (any status)
  v_tables  text[] := ARRAY['evaluations','session_samples','cupping_sessions','aggregate_scores',
    'physical_evaluations','extrinsic_data','session_invites','session_participants'];
  v_t text;
  v_col text;
  v_n int;
  v_out text := '';
BEGIN
  -- >>> PHASE 25 statements (copy of rls_and_triggers.sql) >>>

-- Table-level SELECT goes; only the columns the API may show are granted back.
-- Hidden: excluded_from_results, excluded_at, excluded_by, exclusion_reason.
-- "joinedAt" is granted too: it is the only other column, and harmless.
REVOKE SELECT ON session_participants FROM anon, authenticated;
GRANT SELECT ("sessionId", "userId", status, "joinedAt")
  ON session_participants TO authenticated;

  -- <<< end of PHASE 25 statements <<<

  -- 1. Privileges as the catalog reports them (no role switch needed)
  FOREACH v_col IN ARRAY ARRAY['sessionId', 'userId', 'status', 'joinedAt'] LOOP
    v_out := v_out || format(E'\n 1a authenticated may SELECT %s (expect t): %s', v_col,
      has_column_privilege('authenticated', 'public.session_participants', v_col, 'SELECT'));
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['excluded_from_results', 'excluded_at', 'excluded_by', 'exclusion_reason'] LOOP
    v_out := v_out || format(E'\n 1b authenticated / anon may SELECT %s (expect f f): %s %s', v_col,
      has_column_privilege('authenticated', 'public.session_participants', v_col, 'SELECT'),
      has_column_privilege('anon', 'public.session_participants', v_col, 'SELECT'));
  END LOOP;
  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role)
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
   WHERE c.relkind IN ('r', 'p', 'v', 'f')
     AND has_table_privilege(r.role::name, c.oid, p.priv);
  v_out := v_out || format(E'\n 1c write privileges for anon/authenticated on public tables (expect 0, unchanged from PHASE 24): %s', v_n);

  -- 2. As the owner (authenticated, with jwt claims)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- 2a. The allowed columns still read (this also evaluates participants_select)
  SELECT count(*) INTO v_n FROM session_participants WHERE "sessionId" = v_session;
  v_out := v_out || format(E'\n 2a owner reads %s participant rows of the session through the allowed columns (expect the roster size, no error)', v_n);
  PERFORM "sessionId", "userId", status, "joinedAt" FROM session_participants WHERE "sessionId" = v_session;
  v_out := v_out || E'\n 2b select "sessionId", "userId", status, "joinedAt" (expect no error): ok';

  -- 2c. Each hidden column is refused (caught and recorded, never fatal)
  FOREACH v_col IN ARRAY ARRAY['excluded_from_results', 'excluded_at', 'excluded_by', 'exclusion_reason'] LOOP
    BEGIN
      EXECUTE format('SELECT %I FROM session_participants LIMIT 1', v_col);
      v_out := v_out || format(E'\n 2c select %s (expect insufficient_privilege): NOT REFUSED, PHASE 25 FAILED', v_col);
    EXCEPTION WHEN insufficient_privilege THEN
      v_out := v_out || format(E'\n 2c select %s (expect insufficient_privilege): refused', v_col);
    END;
  END LOOP;
  BEGIN
    EXECUTE 'SELECT * FROM session_participants LIMIT 1';
    v_out := v_out || E'\n 2d select * (expect insufficient_privilege, names the columns now): NOT REFUSED';
  EXCEPTION WHEN insufficient_privilege THEN
    v_out := v_out || E'\n 2d select * (expect insufficient_privilege, names the columns now): refused';
  END;

  -- 3. THE check that catches a broken policy: a plain select on every table whose
  --    policy goes through session_participants (directly or via the helpers) must
  --    still run without "permission denied".
  FOREACH v_t IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', v_t) INTO v_n;
      v_out := v_out || format(E'\n 3 select count(*) from %s (expect no error): %s', v_t, v_n);
    EXCEPTION WHEN OTHERS THEN
      v_out := v_out || format(E'\n 3 select count(*) from %s (expect no error): FAILED %s %s', v_t, SQLSTATE, SQLERRM);
    END;
  END LOOP;

  -- 4. The RPC helpers still execute for the signed-in role
  BEGIN
    v_out := v_out || format(E'\n 4a is_session_participant(session) (expect t for a roster member or the owner): %s', public.is_session_participant(v_session));
    v_out := v_out || format(E'\n 4b is_session_owner(session) (expect t for the owner): %s', public.is_session_owner(v_session));
    v_out := v_out || format(E'\n 4c can_view_group_results(session) (expect no error): %s', public.can_view_group_results(v_session));
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(E'\n 4 RPC helpers (expect no error): FAILED %s %s', SQLSTATE, SQLERRM);
  END;
  RESET ROLE;

  RAISE EXCEPTION E'PHASE 25 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
