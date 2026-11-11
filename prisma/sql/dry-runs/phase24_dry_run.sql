-- PHASE 24 DRY RUN (S8-24, audit A-02). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 24 statement, runs the
-- probes, and ends with RAISE EXCEPTION carrying the probe results. One
-- statement is atomic however the SQL editor sends it: the exception rolls
-- everything back (policies, grants AND the default privileges) and the
-- results arrive in the error message.
-- The red error it ends with IS the expected outcome. It starts with
-- "PHASE 24 DRY RUN: NOTHING WAS APPLIED"; compare each line with its
-- "(expect ...)" text. Any OTHER error (for example "policy ... does not
-- exist"): stop and report it; nothing was applied either way.
--
-- The statements between the two marker comments must stay identical to PHASE 24
-- in prisma/sql/rls_and_triggers.sql (tests/phase24Sql.test.ts checks it); the only
-- difference is the function body quote tag ($fn$ here, $$ there).
--
-- Replace the ONE placeholder in DECLARE (see docs/LAUNCH-RUNBOOK.md §26).
-- NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_owner text := '<owner-uuid>';  -- a registered user who owns at least one tasting group and one coffee
  v_n int; v_m int;
  v_names text;
  v_out text := '';
BEGIN
  -- >>> PHASE 24 statements (copy of rls_and_triggers.sql) >>>

-- 1. Write policies go. The three FOR ALL policies that were also the only read
--    path get a SELECT-only twin with the same USING expression.
DROP POLICY IF EXISTS "tasting_groups_owner_all" ON tasting_groups;
DROP POLICY IF EXISTS "tasting_groups_select_own" ON tasting_groups;
CREATE POLICY "tasting_groups_select_own" ON tasting_groups
  FOR SELECT TO authenticated
  USING ("createdBy" = auth.uid()::text);

DROP POLICY IF EXISTS "tasting_group_members_owner_all" ON tasting_group_members;
DROP POLICY IF EXISTS "tasting_group_members_select_owner" ON tasting_group_members;
CREATE POLICY "tasting_group_members_select_owner" ON tasting_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasting_groups
      WHERE id = tasting_group_members."groupId"
        AND "createdBy" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "history_own" ON user_coffee_history;
DROP POLICY IF EXISTS "history_select_own" ON user_coffee_history;
CREATE POLICY "history_select_own" ON user_coffee_history
  FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

-- group_posts_select (same USING) and coffees_select (a superset) already
-- cover the owner's reads.
DROP POLICY IF EXISTS "group_posts_write" ON group_posts;
DROP POLICY IF EXISTS "coffees_write" ON coffees;

-- 2. SELECT policies without a role: TO authenticated, USING untouched.
--    ALTER POLICY fails (and the whole transaction rolls back) if one of them
--    does not exist: that is drift, stop and report it.
ALTER POLICY "coffees_select" ON coffees TO authenticated;
-- Break the coffees <-> coffee_shares policy loop (42P17 since PHASE 16):
-- coffee_shares_select asked `coffees` (whose policy asks coffee_shares back).
-- A SECURITY DEFINER helper answers "is this caller the coffee's owner?"
-- without going through the coffees policy. PHASE 18b rule: it keeps EXECUTE
-- for `authenticated` (policies run as the querying role).
CREATE OR REPLACE FUNCTION public.is_coffee_owner(p_coffee_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM coffees
    WHERE id = p_coffee_id AND "createdBy" = auth.uid()::text
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.is_coffee_owner(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_coffee_owner(text) TO authenticated;

DROP POLICY IF EXISTS "coffee_shares_select" ON coffee_shares;
CREATE POLICY "coffee_shares_select" ON coffee_shares
  FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text OR is_coffee_owner("coffeeId"));
ALTER POLICY "group_posts_select" ON group_posts TO authenticated;
ALTER POLICY "sessions_select" ON cupping_sessions TO authenticated;
ALTER POLICY "samples_select" ON session_samples TO authenticated;
ALTER POLICY "participants_select" ON session_participants TO authenticated;

-- 3. Belt and braces, schema-wide and for future tables. Prisma (postgres, the
--    table owner) and SECURITY DEFINER triggers are unaffected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

  -- <<< end of PHASE 24 statements <<<

  -- 1. Privileges and policies across the WHOLE public schema (no role switch needed)
  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role)
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
   WHERE c.relkind IN ('r', 'p', 'v', 'f')
     AND has_table_privilege(r.role::name, c.oid, p.priv);
  v_out := v_out || format(E'\n 1a write privileges left for anon/authenticated on public tables (expect 0): %s', v_n);
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ') INTO v_n, v_names
    FROM pg_policies WHERE schemaname = 'public' AND cmd <> 'SELECT';
  v_out := v_out || format(E'\n 1b non-SELECT policies left in public (expect 0): %s %s', v_n, COALESCE(v_names, ''));
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ') INTO v_n, v_names
    FROM pg_policies WHERE schemaname = 'public' AND 'public' = ANY (roles) AND qual = 'true';
  v_out := v_out || format(E'\n 1c TO public USING (true) policies in public (expect 0): %s %s', v_n, COALESCE(v_names, ''));
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ') INTO v_n, v_names
    FROM pg_policies WHERE schemaname = 'public' AND roles <> '{authenticated}'::name[];
  v_out := v_out || format(E'\n 1d policies in public not TO authenticated (expect 0): %s %s', v_n, COALESCE(v_names, ''));
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public';
  v_out := v_out || format(E'\n 1e policies in public (expect 16 = the 18 of pre-flight (a) - 5 write + 3 read twins; the recreated coffee_shares_select is a swap): %s', v_n);
  v_out := v_out || format(E'\n 1f is_session_participant executable by authenticated (expect t): %s',
    has_function_privilege('authenticated', 'public.is_session_participant(text)', 'EXECUTE'));
  v_out := v_out || format(E'\n 1g is_coffee_owner executable by authenticated / anon (expect t f): %s %s',
    has_function_privilege('authenticated', 'public.is_coffee_owner(text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.is_coffee_owner(text)', 'EXECUTE'));

  -- 2. tasting_group_members cannot be written by the API roles (checked, never provoked)
  v_out := v_out || format(E'\n 2a authenticated may INSERT tasting_group_members (expect f): %s',
    has_table_privilege('authenticated', 'public.tasting_group_members', 'INSERT'));
  v_out := v_out || format(E'\n 2b anon may INSERT tasting_group_members (expect f): %s',
    has_table_privilege('anon', 'public.tasting_group_members', 'INSERT'));
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tasting_group_members' AND cmd IN ('INSERT', 'ALL');
  v_out := v_out || format(E'\n 2c INSERT/ALL policies on tasting_group_members (expect 0): %s', v_n);
  v_out := v_out || format(E'\n 2d authenticated may SELECT tasting_group_members (expect t, unchanged): %s',
    has_table_privilege('authenticated', 'public.tasting_group_members', 'SELECT'));

  -- 3. As the owner (authenticated, with jwt claims): reads unchanged
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM tasting_groups;
  SELECT count(*) INTO v_m FROM tasting_group_members;
  v_out := v_out || format(E'\n 3a owner sees %s own tasting_groups and %s of their members (expect > 0 if they own a group)', v_n, v_m);
  SELECT count(*), count(*) FILTER (WHERE "createdBy" = v_owner) INTO v_n, v_m FROM coffees;
  v_out := v_out || format(E'\n 3b owner sees %s coffees, %s of them their own (expect own > 0 if they own a non-deleted coffee)', v_n, v_m);
  SELECT count(*) INTO v_n FROM user_coffee_history;
  v_out := v_out || format(E'\n 3c owner sees %s own history rows (expect their count, usually > 0)', v_n);
  SELECT count(*) INTO v_n FROM cupping_sessions;
  v_out := v_out || format(E'\n 3d owner sees %s sessions they own or joined (expect > 0 if they have any)', v_n);
  SELECT count(*) INTO v_n FROM coffee_shares;
  v_out := v_out || format(E'\n 3e owner reads coffee_shares without error: %s', v_n);
  RESET ROLE;

  -- 4. Default privileges: future tables are born read-only for the API roles
  SELECT count(*) INTO v_n
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_namespace n ON n.oid = d.defaclnamespace AND n.nspname = 'public'
    JOIN pg_roles g ON g.oid = a.grantee AND g.rolname IN ('anon', 'authenticated')
   WHERE d.defaclrole = 'postgres'::regrole
     AND d.defaclobjtype = 'r'
     AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  v_out := v_out || format(E'\n 4a postgres default write privileges for anon/authenticated on new tables in schema public (expect 0): %s', v_n);
  SELECT string_agg(DISTINCT d.defaclrole::regrole::text, ', ') INTO v_names
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_namespace n ON n.oid = d.defaclnamespace AND n.nspname = 'public'
    JOIN pg_roles g ON g.oid = a.grantee AND g.rolname IN ('anon', 'authenticated')
   WHERE d.defaclrole <> 'postgres'::regrole
     AND d.defaclobjtype = 'r'
     AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  v_out := v_out || format(E'\n 4b other roles whose new tables in schema public still grant writes to the API roles (informational, not changed by PHASE 24): %s', COALESCE(v_names, 'none'));
  SELECT string_agg(DISTINCT d.defaclnamespace::regnamespace::text, ', ') INTO v_names
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles g ON g.oid = a.grantee AND g.rolname IN ('anon', 'authenticated')
   WHERE d.defaclrole = 'postgres'::regrole
     AND d.defaclobjtype = 'r'
     AND d.defaclnamespace <> 'public'::regnamespace
     AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  v_out := v_out || format(E'
 4c other schemas where postgres still grants default writes to the API roles (informational; PHASE 24 only covers public): %s', COALESCE(v_names, 'none'));

  RAISE EXCEPTION E'PHASE 24 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
