-- PHASE 28 DRY RUN (S10 WP4a, Kim C5). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 28 statement, runs the
-- probes, and ends with RAISE EXCEPTION carrying the probe results. One
-- statement is atomic however the SQL editor sends it: the exception rolls
-- everything back (the function included) and the results arrive in the error
-- message. The red error it ends with IS the expected outcome. It starts with
-- "PHASE 28 DRY RUN: NOTHING WAS APPLIED"; compare each line with its
-- "(expect ...)" text. Any OTHER error: stop and report it; nothing was applied
-- either way.
--
-- It also reports read-only counts to read BEFORE the deploy:
--   * line 1: open group sessions where everyone has submitted today (name,
--     date, participants, submitted). Their participants lose group visibility
--     when PHASE 28 is applied.
--   * line 2a: live sessions idle 7 to 30 days. The idle pass of the daily cron
--     (runbook 33) closes them WITH the close emails, 5 per run, oldest first.
--     "participants with an email" is how many people would receive one.
--   * line 2b: live sessions idle MORE than 30 days. The same pass closes them
--     SILENTLY (no email): sessions abandoned long ago must not mail anyone.
--   Idle = now minus the later of the start and the last saved evaluation, the
--   same boundary as the code (7 days or more, 30 days or more).
--   * line 3 measures the function installed NOW: before PHASE 28 it equals
--     line 1; once PHASE 28 is applied it reads 0.
--
-- The statements between the two marker comments must stay identical to PHASE 28
-- in prisma/sql/rls_and_triggers.sql (tests/phase28Sql.test.ts checks it).
--
-- NO placeholders. NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_nobody  text := '00000000-0000-4000-8000-000000000000';  -- a viewer who owns nothing
  v_lose_n  int;
  v_lose_list text;
  v_old_true int;
  v_new_true int;
  v_idle_n  int;
  v_idle_list text;
  v_idle_people int;
  v_silent_n int;
  v_silent_list text;
  v_open_n  int;
  v_bad     int := 0;
  v_s       record;
  v_ok      boolean;
  v_def     text;
  v_out text := '';
BEGIN
  -- 1. Today, BEFORE the change: open group sessions where every participant has submitted
  CREATE TEMP TABLE dry_lose ON COMMIT DROP AS
    SELECT cs.id, cs.name, cs.date,
           (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = cs.id) AS people,
           (SELECT count(DISTINCT e."cupperId")
              FROM evaluations e
              JOIN session_samples ss ON ss.id = e."sessionSampleId"
             WHERE ss."sessionId" = cs.id AND e."isDraft" = false) AS submitted
    FROM cupping_sessions cs
    WHERE cs."isGroup"
      AND cs.status <> 'closed'
      AND (cs."closesAt" IS NULL OR cs."closesAt" >= (now() AT TIME ZONE 'utc'))
      AND (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = cs.id) > 0
      AND (
        SELECT count(DISTINCT e."cupperId")
        FROM evaluations e
        JOIN session_samples ss ON ss.id = e."sessionSampleId"
        WHERE ss."sessionId" = cs.id AND e."isDraft" = false
      ) >= (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = cs.id);
  SELECT count(*) INTO v_lose_n FROM dry_lose;
  SELECT string_agg(format('      - "%s", %s, %s participants, %s submitted', name, to_char(date, 'YYYY-MM-DD'), people, submitted),
                    E'\n' ORDER BY date, name)
    INTO v_lose_list FROM (SELECT * FROM dry_lose ORDER BY date, name LIMIT 10) x;
  v_out := v_out || format(E'\n 1 open group sessions where everyone submitted, whose participants lose group visibility (read this number; 0 is fine): %s%s', v_lose_n,
    CASE WHEN v_lose_n > 0 THEN E'\n' || v_lose_list ELSE '' END);

  -- 2. Live sessions idle for 7 days or more (the idle cron pass closes them). Idle = the later of
  --    the start and the last saved evaluation, the same rule as lib/closeRules.ts liveIdleMs.
  CREATE TEMP TABLE dry_idle ON COMMIT DROP AS
    SELECT x.id, x.name, x."startedAt", x.last_activity,
           (SELECT count(*) FROM session_participants sp WHERE sp."sessionId" = x.id) AS people,
           (SELECT count(*) FROM session_participants sp
              JOIN auth.users u ON u.id::text = sp."userId"
             WHERE sp."sessionId" = x.id AND coalesce(u.email, '') <> '') AS people_with_email
    FROM (
      SELECT cs.id, cs.name, cs."startedAt",
             GREATEST(
               cs."startedAt",
               COALESCE((
                 SELECT max(e."updatedAt")
                 FROM evaluations e
                 JOIN session_samples ss ON ss.id = e."sessionSampleId"
                 WHERE ss."sessionId" = cs.id
               ), cs."startedAt")
             ) AS last_activity
      FROM cupping_sessions cs
      WHERE cs."isGroup" AND NOT cs."isAsync" AND cs."closesAt" IS NULL
        AND cs.status = 'active' AND cs."startedAt" IS NOT NULL
    ) x
    WHERE x.last_activity <= ((now() AT TIME ZONE 'utc') - interval '7 days');
  -- 2a. 7 days or more, under 30: closed WITH the close emails
  SELECT count(*), COALESCE(sum(people_with_email), 0) INTO v_idle_n, v_idle_people
    FROM dry_idle WHERE last_activity > ((now() AT TIME ZONE 'utc') - interval '30 days');
  SELECT string_agg(format('      - "%s", last activity %s, %s participants (%s with an email)', name,
                           to_char(last_activity, 'YYYY-MM-DD'), people, people_with_email),
                    E'\n' ORDER BY last_activity, name)
    INTO v_idle_list
    FROM (SELECT * FROM dry_idle WHERE last_activity > ((now() AT TIME ZONE 'utc') - interval '30 days')
          ORDER BY last_activity, name LIMIT 10) z;
  v_out := v_out || format(E'\n 2a live sessions idle 7 to 30 days (closed WITH emails, 5 per run, oldest first; read these numbers): %s sessions, %s participants with an email%s', v_idle_n, v_idle_people,
    CASE WHEN v_idle_n > 0 THEN E'\n' || v_idle_list ELSE '' END);
  -- 2b. 30 days or more: closed silently
  SELECT count(*) INTO v_silent_n
    FROM dry_idle WHERE last_activity <= ((now() AT TIME ZONE 'utc') - interval '30 days');
  SELECT string_agg(format('      - "%s", last activity %s, %s participants', name,
                           to_char(last_activity, 'YYYY-MM-DD'), people),
                    E'\n' ORDER BY last_activity, name)
    INTO v_silent_list
    FROM (SELECT * FROM dry_idle WHERE last_activity <= ((now() AT TIME ZONE 'utc') - interval '30 days')
          ORDER BY last_activity, name LIMIT 10) w;
  v_out := v_out || format(E'\n 2b live sessions idle more than 30 days (closed silently, no email; read this number): %s sessions%s', v_silent_n,
    CASE WHEN v_silent_n > 0 THEN E'\n' || v_silent_list ELSE '' END);

  -- 3. The function installed NOW, for a viewer who owns nothing: true for exactly the sessions of
  --    line 1 until PHASE 28 is applied
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_nobody, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_old_true FROM dry_lose d WHERE public.can_view_group_results(d.id);
  v_out := v_out || format(E'\n 3 function installed now, outsider viewer, on the sessions of line 1 (before PHASE 28 this equals line 1: %s; after PHASE 28 is applied this line reads 0): %s', v_lose_n, v_old_true);

  -- >>> PHASE 28 statements (copy of rls_and_triggers.sql) >>>

-- SQL twin of canViewGroupResults (lib/sessionState.ts). Keep the two in step.
-- "closesAt" is TIMESTAMP(3) holding UTC, hence now() AT TIME ZONE 'utc'.
-- Visible to the session owner, once the session is closed, or once its
-- closesAt has passed. "Everyone has submitted" no longer opens it (Kim C5).
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
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_group_results(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_group_results(text) TO authenticated;

  -- <<< end of PHASE 28 statements <<<

  -- 4. The NEW function, same outsider viewer
  SELECT count(*) INTO v_new_true FROM dry_lose d WHERE public.can_view_group_results(d.id);
  v_out := v_out || format(E'\n 4 NEW function, outsider viewer, on the sessions of line 1 (expect 0): %s', v_new_true);

  -- 5. Sessions that must stay visible to a participant who owns nothing: closed, and past closesAt
  SELECT count(*) INTO v_bad FROM cupping_sessions cs
   WHERE cs."isGroup" AND cs.status = 'closed' AND NOT public.can_view_group_results(cs.id);
  v_out := v_out || format(E'\n 5a closed group sessions the new function hides from an outsider (expect 0): %s', v_bad);
  SELECT count(*) INTO v_bad FROM cupping_sessions cs
   WHERE cs."isGroup" AND cs.status <> 'closed' AND cs."closesAt" IS NOT NULL
     AND cs."closesAt" < (now() AT TIME ZONE 'utc') AND NOT public.can_view_group_results(cs.id);
  v_out := v_out || format(E'\n 5b expired group sessions the new function hides from an outsider (expect 0): %s', v_bad);

  -- 6. The owner still sees their own open group sessions (checked for up to 20 owners' sessions)
  v_bad := 0;
  v_open_n := 0;
  FOR v_s IN
    SELECT cs.id, cs."createdBy" AS owner_id FROM cupping_sessions cs
     WHERE cs."isGroup" AND cs.status <> 'closed' ORDER BY cs.id LIMIT 20
  LOOP
    v_open_n := v_open_n + 1;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_s.owner_id, 'role', 'authenticated')::text, true);
    SELECT public.can_view_group_results(v_s.id) INTO v_ok;
    IF NOT v_ok THEN v_bad := v_bad + 1; END IF;
  END LOOP;
  v_out := v_out || format(E'\n 6 open group sessions checked as their owner (%s) that the owner could NOT view (expect 0): %s', v_open_n, v_bad);

  -- 7. Attributes
  v_def := pg_get_functiondef('public.can_view_group_results(text)'::regprocedure);
  v_out := v_out || format(E'\n 7a body mentions isDraft / cupperId (expect f f): %s %s', v_def LIKE '%isDraft%', v_def LIKE '%cupperId%');
  v_out := v_out || format(E'\n 7b SECURITY DEFINER (expect t): %s',
    (SELECT prosecdef FROM pg_proc WHERE oid = 'public.can_view_group_results(text)'::regprocedure));
  v_out := v_out || format(E'\n 7c search_path setting (expect search_path=public): %s',
    (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.can_view_group_results(text)'::regprocedure));
  v_out := v_out || format(E'\n 7d EXECUTE authenticated / anon (expect t f): %s %s',
    has_function_privilege('authenticated', 'public.can_view_group_results(text)', 'EXECUTE'),
    has_function_privilege('anon', 'public.can_view_group_results(text)', 'EXECUTE'));

  RAISE EXCEPTION E'PHASE 28 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
