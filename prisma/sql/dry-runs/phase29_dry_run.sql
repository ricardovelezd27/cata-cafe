-- PHASE 29 DRY RUN (S10 WP3b, Kim C4). Fail-safe: ONE statement, nothing can be applied.
--
-- What it is: a single DO block that runs every PHASE 29 statement, runs the probes,
-- and ends with RAISE EXCEPTION carrying the probe results. One statement is atomic
-- however the SQL editor sends it: the exception rolls everything back (the two
-- functions AND the temporary session below) and the results arrive in the error
-- message. The red error it ends with IS the expected outcome. It starts with
-- "PHASE 29 DRY RUN: NOTHING WAS APPLIED"; compare each line with its "(expect ...)"
-- text. Any OTHER error: stop and report it; nothing was applied either way.
--
-- What it reports:
--   * line 1: how many SUBMITTED evaluations carry any `_ne` ("no evaluado") key
--     today. Expect 0: the feature is not deployed yet.
--   * line 2: the two functions' proconfig after the statements (both pinned).
--   * line 3: whether an API role can execute the new helper (expect false).
--   * line 4: the helper on eight hand-made evaluations (truth table).
--   * line 5: a TEMPORARY sample (created and rolled back inside this block, using
--     the ids of three existing profiles as cuppers; skipped with a message when fewer
--     than three profiles exist): a complete evaluation, then a declared-partial one,
--     then an old-style incomplete one WITHOUT a marker. It prints the aggregate after
--     each insert: the total, "participantCount" and the other per-attribute averages
--     do not move for the partial and the unmarked rows; the partial one moves only the
--     attributes it rated (each over its own denominator).
--
-- The statements between the two marker comments must stay identical to PHASE 29
-- in prisma/sql/rls_and_triggers.sql (tests/phase29Sql.test.ts checks it).
--
-- NO placeholders. NEVER add BEGIN / COMMIT around this file.
DO $dry$
DECLARE
  v_marked int;
  v_out text := '';
  v_ids text[];
  v_def text;
  v_base jsonb := jsonb_build_object(
    'fragancia_af_final', 6, 'aroma_af_final', 6, 'sabor_af_final', 6, 'sabor_residual_af_final', 6,
    'acidez_af_final', 6, 'dulzor_af_final', 6, 'sensacion_af_final', 6, 'impresion_global_final', 6);
  v_all_ne jsonb := '{"fragancia_af_ne":true,"aroma_af_ne":true,"sabor_af_ne":true,"sabor_residual_af_ne":true,"acidez_af_ne":true,"dulzor_af_ne":true,"sensacion_af_ne":true,"impresion_global_ne":true}';
  v_truth text;
  v_sess text := 'dry29_session';
  v_sample text := 'dry29_sample';
  v_a record;
BEGIN
  -- 1. Today, BEFORE the change: submitted evaluations carrying any _ne key
  SELECT count(*) INTO v_marked FROM evaluations
   WHERE "isDraft" = false
     AND ("affectiveData"::text LIKE '%\_ne"%' OR "combinedData"::text LIKE '%\_ne"%');
  v_out := v_out || E'\n 1 submitted evaluations carrying a "no evaluado" (_ne) key today (expect 0): ' || v_marked;

  -- >>> PHASE 29 statements (copy of rls_and_triggers.sql) >>>
-- SQL twin of isAffectiveDeclaredPartial (lib/affectivePartial.ts). Same key list and the
-- same rating read as is_affective_complete; a marker counts only as the JSON boolean true.
CREATE OR REPLACE FUNCTION public.is_affective_declared_partial(data jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(bool_and(a.rated OR a.marked), false)
     AND COALESCE(bool_or(a.marked), false)
     AND COALESCE(bool_or(a.rated), false)
  FROM (
    SELECT
      COALESCE(NULLIF(data->>(k || '_final'),'')::numeric, NULLIF(data->>k,'')::numeric, 0) > 0 AS rated,
      COALESCE((data->(k || '_ne')) = 'true'::jsonb, false) AS marked
    FROM unnest(ARRAY[
      'fragancia_af', 'aroma_af', 'sabor_af', 'sabor_residual_af',
      'acidez_af', 'dulzor_af', 'sensacion_af', 'impresion_global'
    ]) AS k
  ) a
$$;

REVOKE EXECUTE ON FUNCTION public.is_affective_declared_partial(jsonb) FROM PUBLIC, anon, authenticated;

-- PHASE 29: the PHASE 26 body with ONE changed clause (the WHERE of the v_attr_averages subquery).
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_session_id         text;
  v_cups_per_sample    int;
  v_format             text;
  v_participant_count  int;   -- INCLUDED (complete) evaluations
  v_submitted_count    int;   -- all submitted, non-excluded evaluations
  v_total_cups         int;   -- pooled cups of the INCLUDED evaluations
  v_avg_raw            float;
  v_total_non_uniform  int;
  v_total_defective    int;
  v_factor             float;
  v_uniformity_penalty float;
  v_defect_penalty     float;
  v_community_score    float;
  v_attr_averages      jsonb;
  v_json_col           text;
BEGIN
  -- Get sessionId, cupsPerSample and format from parent session
  SELECT ss."sessionId", cs."cupsPerSample", cs.format
    INTO v_session_id, v_cups_per_sample, v_format
  FROM session_samples ss
  JOIN cupping_sessions cs ON cs.id = ss."sessionId"
  WHERE ss.id = NEW."sessionSampleId";

  -- Pick which JSON column holds affective data
  v_json_col := CASE WHEN v_format = 'affective' THEN 'affectiveData' ELSE 'combinedData' END;

  -- Per-evaluation values (cups, non-uniform and defective counts clamped to
  -- the evaluation's cups; non-uniformity exists only with 2+ cups), then
  -- pooled over the INCLUDED (complete) evaluations. submittedCount counts all
  -- submitted, non-excluded evaluations. A row with cups NULL (older than the
  -- backfill) falls back to the session's cupsPerSample.
  SELECT
    COUNT(*) FILTER (WHERE s.inc)::int,
    COUNT(*)::int,
    AVG(s."rawScore") FILTER (WHERE s.inc),
    COALESCE(SUM(s.nu) FILTER (WHERE s.inc), 0)::int,
    COALESCE(SUM(s.df) FILTER (WHERE s.inc), 0)::int,
    COALESCE(SUM(s.cups) FILTER (WHERE s.inc), 0)::int
  INTO v_participant_count, v_submitted_count, v_avg_raw,
       v_total_non_uniform, v_total_defective, v_total_cups
  FROM (
    SELECT
      e."rawScore",
      is_affective_complete(CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END) AS inc,
      GREATEST(COALESCE(e.cups, v_cups_per_sample), 0) AS cups,
      CASE WHEN COALESCE(e.cups, v_cups_per_sample) >= 2
           THEN LEAST((SELECT COUNT(*) FROM unnest(e."nonUniformCups") AS t(u) WHERE u = true)::int,
                      COALESCE(e.cups, v_cups_per_sample))
           ELSE 0 END AS nu,
      LEAST((SELECT COUNT(*) FROM unnest(e."defectiveCups") AS d(v) WHERE v = true)::int,
            GREATEST(COALESCE(e.cups, v_cups_per_sample), 0)) AS df
    FROM evaluations e
    WHERE e."sessionSampleId" = NEW."sessionSampleId" AND e."isDraft" = false
      AND NOT EXISTS (
        SELECT 1 FROM session_participants sp
        WHERE sp."sessionId" = v_session_id
          AND sp."userId" = e."cupperId"
          AND sp.excluded_from_results = true
      )
  ) s;

  IF v_total_cups > 0 THEN
    v_factor             := 5.0 / GREATEST(5, v_total_cups);
    v_uniformity_penalty := 2.0 * v_total_non_uniform * v_factor;
    v_defect_penalty     := 4.0 * v_total_defective  * v_factor;
  ELSE
    v_uniformity_penalty := 0;
    v_defect_penalty     := 0;
  END IF;

  -- N4: round the final community score to the nearest 0.25 (was ROUND(..., 2)).
  v_community_score := GREATEST(0, LEAST(100,
    ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric * 4) / 4
  ));

  -- Per-attribute averages over submitted, NON-EXCLUDED evaluations that are COMPLETE or a declared
  -- PARTIAL ("no evaluado"), each attribute over the evaluations that rated it (AVG skips NULLs).
  SELECT jsonb_build_object(
    'Fragancia',        ROUND(AVG(NULLIF((e.data->>'fragancia_af_final'),   '')::numeric), 2),
    'Aroma',            ROUND(AVG(NULLIF((e.data->>'aroma_af_final'),        '')::numeric), 2),
    'Sabor',            ROUND(AVG(NULLIF((e.data->>'sabor_af_final'),        '')::numeric), 2),
    'Sabor residual',   ROUND(AVG(NULLIF((e.data->>'sabor_residual_af_final'),'')::numeric), 2),
    'Acidez',           ROUND(AVG(NULLIF((e.data->>'acidez_af_final'),       '')::numeric), 2),
    'Dulzor',           ROUND(AVG(NULLIF((e.data->>'dulzor_af_final'),       '')::numeric), 2),
    'Sensación en boca',ROUND(AVG(NULLIF((e.data->>'sensacion_af_final'),    '')::numeric), 2),
    'Impresión global', ROUND(AVG(NULLIF((e.data->>'impresion_global_final'),'')::numeric), 2)
  )
  INTO v_attr_averages
  FROM (
    SELECT CASE v_json_col
      WHEN 'affectiveData' THEN "affectiveData"
      ELSE "combinedData"
    END AS data
    FROM evaluations ev
    WHERE ev."sessionSampleId" = NEW."sessionSampleId" AND ev."isDraft" = false
      AND (
        is_affective_complete(
          CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)
        OR is_affective_declared_partial(
          CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)
      )
      AND NOT EXISTS (
        SELECT 1 FROM session_participants sp
        WHERE sp."sessionId" = v_session_id
          AND sp."userId" = ev."cupperId"
          AND sp.excluded_from_results = true
      )
  ) e;

  INSERT INTO aggregate_scores (
    id,
    "sessionSampleId", "participantCount", "submittedCount", "cupsPerSample", "totalCups",
    "avgRawScore", "totalNonUniform", "totalDefective",
    "uniformityPenalty", "defectPenalty", "communityScore",
    "attrAverages", "computedAt", "ruleVersion"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."sessionSampleId", v_participant_count, v_submitted_count, v_cups_per_sample, v_total_cups,
    v_avg_raw, v_total_non_uniform, v_total_defective,
    v_uniformity_penalty, v_defect_penalty, v_community_score,
    COALESCE(v_attr_averages, '{}'::jsonb), now(), 2
  )
  ON CONFLICT ("sessionSampleId") DO UPDATE SET
    "participantCount"  = EXCLUDED."participantCount",
    "submittedCount"    = EXCLUDED."submittedCount",
    "cupsPerSample"     = EXCLUDED."cupsPerSample",
    "totalCups"         = EXCLUDED."totalCups",
    "avgRawScore"       = EXCLUDED."avgRawScore",
    "totalNonUniform"   = EXCLUDED."totalNonUniform",
    "totalDefective"    = EXCLUDED."totalDefective",
    "uniformityPenalty" = EXCLUDED."uniformityPenalty",
    "defectPenalty"     = EXCLUDED."defectPenalty",
    "communityScore"    = EXCLUDED."communityScore",
    "attrAverages"      = EXCLUDED."attrAverages",
    "computedAt"        = EXCLUDED."computedAt",
    "ruleVersion"       = EXCLUDED."ruleVersion";

  RETURN NEW;
END;
$fn$;
  -- <<< end of PHASE 29 statements <<<

  -- 2. Both functions keep the pinned search_path
  v_out := v_out || E'\n 2 proconfig of recompute_aggregate_score and is_affective_declared_partial (expect {search_path=public} twice): '
    || (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.recompute_aggregate_score()'::regprocedure) || ' '
    || (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.is_affective_declared_partial(jsonb)'::regprocedure);
  v_def := pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure);
  v_out := v_out || E'\n 2 the live trigger function now mentions is_affective_declared_partial (expect true): '
    || (v_def LIKE '%is_affective_declared_partial%');

  -- 3. No API role can execute the helper
  v_out := v_out || E'\n 3 authenticated / anon can execute is_affective_declared_partial (expect false / false): '
    || has_function_privilege('authenticated', 'public.is_affective_declared_partial(jsonb)', 'EXECUTE') || ' / '
    || has_function_privilege('anon', 'public.is_affective_declared_partial(jsonb)', 'EXECUTE');

  -- 4. The helper on hand-made evaluations
  v_truth :=
       'all 8 rated=' || is_affective_declared_partial(v_base)
    || ' | 7 rated + 1 marked=' || is_affective_declared_partial((v_base - 'impresion_global_final') || '{"impresion_global_ne":true}')
    || ' | 7 rated + 1 neither=' || is_affective_declared_partial(v_base - 'impresion_global_final')
    || ' | 1 rated + 7 marked=' || is_affective_declared_partial('{"aroma_af_final":5,"fragancia_af_ne":true,"sabor_af_ne":true,"sabor_residual_af_ne":true,"acidez_af_ne":true,"dulzor_af_ne":true,"sensacion_af_ne":true,"impresion_global_ne":true}'::jsonb)
    || ' | 8 marked, none rated=' || is_affective_declared_partial(v_all_ne)
    || ' | marker is the string "true"=' || is_affective_declared_partial((v_base - 'impresion_global_final') || '{"impresion_global_ne":"true"}')
    || ' | {}=' || is_affective_declared_partial('{}'::jsonb)
    || ' | NULL=' || is_affective_declared_partial(NULL);
  v_out := v_out || E'\n 4 is_affective_declared_partial (expect false | true | false | true | false | false | false | false): ' || v_truth;

  -- 5. A temporary sample: complete, then declared partial, then an old-style incomplete one
  SELECT array_agg(id) INTO v_ids FROM (SELECT id FROM profiles ORDER BY id LIMIT 3) p;
  IF v_ids IS NULL OR array_length(v_ids, 1) < 3 THEN
    v_out := v_out || E'\n 5 temporary sample: SKIPPED (fewer than three profiles exist); lines 1 to 4 are still valid';
  ELSE
    INSERT INTO cupping_sessions (id, name, date, format, "cupsPerSample", "isGroup", status, "createdBy", "updatedAt")
      VALUES (v_sess, 'PHASE 29 dry run', now(), 'affective', 2, true, 'active', v_ids[1], now());
    INSERT INTO session_samples (id, "sessionId", position, label)
      VALUES (v_sample, v_sess, 1, 'dry run');

    -- (a) a COMPLETE evaluation: all eight at 6, two cups, no flags: raw 0.65625 * 48 + 52.75 = 84.25
    INSERT INTO evaluations (id, "sessionSampleId", "cupperId", "affectiveData", "rawScore", "individualScore", cups, "isDraft", "submittedAt", "updatedAt")
      VALUES ('dry29_e1', v_sample, v_ids[1], v_base, 84.25, 84.25, 2, false, now(), now());
    SELECT "participantCount" AS pc, "submittedCount" AS sc, "communityScore" AS cs, "attrAverages" AS aa
      INTO v_a FROM aggregate_scores WHERE "sessionSampleId" = v_sample;
    v_out := v_out || E'\n 5a after a complete evaluation (expect included 1, submitted 1, score 84.25, Fragancia 6.00, Sabor 6.00): included '
      || v_a.pc || ', submitted ' || v_a.sc || ', score ' || v_a.cs
      || ', Fragancia ' || (v_a.aa->>'Fragancia') || ', Sabor ' || (v_a.aa->>'Sabor');

    -- (b) a DECLARED PARTIAL: Sabor marked "no evaluado" (no rating), the other seven at 8; no total
    INSERT INTO evaluations (id, "sessionSampleId", "cupperId", "affectiveData", "rawScore", "individualScore", cups, "isDraft", "submittedAt", "updatedAt")
      VALUES ('dry29_e2', v_sample, v_ids[2],
        '{"fragancia_af_final":8,"aroma_af_final":8,"sabor_af_ne":true,"sabor_residual_af_final":8,"acidez_af_final":8,"dulzor_af_final":8,"sensacion_af_final":8,"impresion_global_final":8}'::jsonb,
        NULL, NULL, 2, false, now(), now());
    SELECT "participantCount" AS pc, "submittedCount" AS sc, "communityScore" AS cs, "attrAverages" AS aa
      INTO v_a FROM aggregate_scores WHERE "sessionSampleId" = v_sample;
    v_out := v_out || E'\n 5b after a declared-partial evaluation (expect included 1, submitted 2, score 84.25, Fragancia 7.00, Sabor 6.00): included '
      || v_a.pc || ', submitted ' || v_a.sc || ', score ' || v_a.cs
      || ', Fragancia ' || (v_a.aa->>'Fragancia') || ', Sabor ' || (v_a.aa->>'Sabor');

    -- (c) an old-style INCOMPLETE evaluation with NO marker (impresion global missing): changes nothing
    INSERT INTO evaluations (id, "sessionSampleId", "cupperId", "affectiveData", "rawScore", "individualScore", cups, "isDraft", "submittedAt", "updatedAt")
      VALUES ('dry29_e3', v_sample, v_ids[3],
        '{"fragancia_af_final":2,"aroma_af_final":2,"sabor_af_final":2,"sabor_residual_af_final":2,"acidez_af_final":2,"dulzor_af_final":2,"sensacion_af_final":2}'::jsonb,
        74.40625, 74.40625, 2, false, now(), now());
    SELECT "participantCount" AS pc, "submittedCount" AS sc, "communityScore" AS cs, "attrAverages" AS aa
      INTO v_a FROM aggregate_scores WHERE "sessionSampleId" = v_sample;
    v_out := v_out || E'\n 5c after an unmarked incomplete evaluation (expect NOTHING to move: included 1, submitted 3, score 84.25, Fragancia 7.00, Sabor 6.00): included '
      || v_a.pc || ', submitted ' || v_a.sc || ', score ' || v_a.cs
      || ', Fragancia ' || (v_a.aa->>'Fragancia') || ', Sabor ' || (v_a.aa->>'Sabor');
  END IF;

  RAISE EXCEPTION E'PHASE 29 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
