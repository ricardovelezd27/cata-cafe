-- PHASE 27 DRY RUN (S10 WP7, Kim F2). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 27 statement, runs the
-- probes, and ends with RAISE EXCEPTION carrying the probe results. One
-- statement is atomic however the SQL editor sends it: the exception rolls
-- everything back (RLS and revokes included) and the results arrive in the error
-- message. The red error it ends with IS the expected outcome. It starts with
-- "PHASE 27 DRY RUN: NOTHING WAS APPLIED"; compare each line with its
-- "(expect ...)" text. Any OTHER error: stop and report it; nothing was applied
-- either way.
--
-- The statements between the two marker comments must stay identical to PHASE 27
-- in prisma/sql/rls_and_triggers.sql (tests/phase27Sql.test.ts checks it).
--
-- There is NOTHING to replace: no placeholder. Run it after `npx prisma migrate
-- deploy` created the table (docs/LAUNCH-RUNBOOK.md §31).
-- NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_role text;
  v_priv text;
  v_n bigint;
  v_out text := '';
BEGIN
  -- >>> PHASE 27 statements (copy of rls_and_triggers.sql) >>>

ALTER TABLE warmup_reflections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON warmup_reflections FROM anon, authenticated;

  -- <<< end of PHASE 27 statements <<<

  -- 1. The catalog after the statements
  v_out := v_out || format(E'\n 1a row level security on (expect t): %s',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.warmup_reflections'::regclass));
  v_out := v_out || format(E'\n 1b policies on the table (expect 0): %s',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warmup_reflections'));
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      v_out := v_out || format(E'\n 1c %s may %s (expect f): %s', v_role, v_priv,
        has_table_privilege(v_role, 'public.warmup_reflections', v_priv));
    END LOOP;
  END LOOP;

  -- 2. As the signed-in role: refused (caught and recorded, never fatal)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    EXECUTE 'SELECT count(*) FROM warmup_reflections' INTO v_n;
    v_out := v_out || format(E'\n 2a authenticated select (expect insufficient_privilege): NOT REFUSED, read %s rows, PHASE 27 FAILED', v_n);
  EXCEPTION WHEN insufficient_privilege THEN
    v_out := v_out || E'\n 2a authenticated select (expect insufficient_privilege): refused';
  END;
  BEGIN
    EXECUTE 'INSERT INTO warmup_reflections (id, "userId", "exerciseId", feel) VALUES (''dry'', ''dry'', ''arm-raise'', ''x'')';
    v_out := v_out || E'\n 2b authenticated insert (expect insufficient_privilege): NOT REFUSED, PHASE 27 FAILED';
  EXCEPTION WHEN insufficient_privilege THEN
    v_out := v_out || E'\n 2b authenticated insert (expect insufficient_privilege): refused';
  END;
  RESET ROLE;

  -- 3. As anon: refused
  PERFORM set_config('role', 'anon', true);
  BEGIN
    EXECUTE 'SELECT count(*) FROM warmup_reflections' INTO v_n;
    v_out := v_out || format(E'\n 3 anon select (expect insufficient_privilege): NOT REFUSED, read %s rows, PHASE 27 FAILED', v_n);
  EXCEPTION WHEN insufficient_privilege THEN
    v_out := v_out || E'\n 3 anon select (expect insufficient_privilege): refused';
  END;
  RESET ROLE;

  -- 4. The app (Prisma as postgres, the table owner) is unaffected
  EXECUTE 'SELECT count(*) FROM warmup_reflections' INTO v_n;
  v_out := v_out || format(E'\n 4 owner (postgres) select (expect a number, no error; this is how the app reads it): %s', v_n);

  RAISE EXCEPTION E'PHASE 27 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
