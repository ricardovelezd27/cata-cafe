-- PHASE 26 DRY RUN (S10 WP1a). Fail-safe: ONE statement, nothing can be applied.
--
-- REQUIRES the evaluations."cups" migration to be applied first
-- (npx prisma migrate deploy, migration 20261113090000_evaluation_cups); the
-- first thing this does is check it and stop with a plain message if it is missing.
-- NOTHING is applied by running this file: the statement ends with RAISE EXCEPTION,
-- which rolls back the re-issued function and the re-fire alike.
--
-- What it does: snapshots aggregate_scores, re-issues recompute_aggregate_score()
-- with the PHASE 26 body, re-fires the trigger for every submitted evaluation
-- (UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false) and
-- reports, in the exception text: how many aggregate rows WOULD change (split by
-- cups per sample 1, 2, 3-4, 5+), the largest increase and decrease of
-- communityScore, how many rows charge more than 6 points per flagged cup (must
-- be 0) and the function's proconfig. The red error it ends with IS the expected
-- outcome; it starts with "PHASE 26 DRY RUN: NOTHING WAS APPLIED". Any OTHER
-- error: stop and report it.
--
-- The statements between the two marker comments must stay identical to PHASE 26
-- in prisma/sql/rls_and_triggers.sql (tests/phase26Sql.test.ts checks it).
-- NEVER add BEGIN / COMMIT around this file. No placeholders to fill in.
DO $dry$
DECLARE
  v_total int; v_changed int; v_excess int;
  v_up numeric; v_down numeric;
  v_out text := '';
  v_conf text;
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluations' AND column_name = 'cups'
  ) THEN
    RAISE EXCEPTION 'PHASE 26 DRY RUN: evaluations.cups is missing. Run npx prisma migrate deploy first. Nothing was applied.';
  END IF;

  CREATE TEMP TABLE agg_before ON COMMIT DROP AS
    SELECT "sessionSampleId", "cupsPerSample", "totalCups", "communityScore", "avgRawScore",
           "uniformityPenalty", "defectPenalty"
      FROM aggregate_scores;

  -- >>> PHASE 26 statements (copy of rls_and_triggers.sql) >>>
-- PHASE 26: the flat CVA deduction at ANY cup count, diluted by 5 / pooled cups
-- beyond five. Differences from the PHASE 23 body, and only these: (1) the
-- per-evaluation values (cups, non-uniform count, defective count) are computed
-- in a subquery and then pooled over the INCLUDED (complete) evaluations;
-- (2) v_total_cups is the SUM of those cups, not cupsPerSample x participants;
-- (3) the deduction is 2 x non-uniform x factor and 4 x defective x factor with
-- factor = 5 / GREATEST(5, v_total_cups). No `>= 5` gate. Everything else
-- (SECURITY DEFINER, search_path, exclusion filter, is_affective_complete,
-- attrAverages, INSERT ... ON CONFLICT) is unchanged.
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

  -- Per-attribute averages over submitted, NON-EXCLUDED, COMPLETE evaluations.
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
      AND is_affective_complete(
        CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)
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
    "attrAverages", "computedAt"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."sessionSampleId", v_participant_count, v_submitted_count, v_cups_per_sample, v_total_cups,
    v_avg_raw, v_total_non_uniform, v_total_defective,
    v_uniformity_penalty, v_defect_penalty, v_community_score,
    COALESCE(v_attr_averages, '{}'::jsonb), now()
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
    "computedAt"        = EXCLUDED."computedAt";

  RETURN NEW;
END;
$fn$;
  -- <<< end of PHASE 26 statements <<<

  SELECT proconfig::text INTO v_conf FROM pg_proc WHERE proname = 'recompute_aggregate_score';

  -- Re-fire the trigger for every submitted evaluation (rolled back below).
  UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;

  SELECT count(*) INTO v_total FROM agg_before;
  SELECT count(*) INTO v_changed
    FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
   WHERE a."communityScore" IS DISTINCT FROM b."communityScore";
  v_out := v_out || format(E'\n 1 aggregate rows: %s, of which communityScore WOULD CHANGE: %s', v_total, v_changed);

  FOR r IN
    SELECT CASE WHEN b."cupsPerSample" <= 1 THEN '1 cup'
                WHEN b."cupsPerSample" = 2 THEN '2 cups'
                WHEN b."cupsPerSample" <= 4 THEN '3-4 cups'
                ELSE '5+ cups' END AS bucket,
           count(*) AS n,
           count(*) FILTER (WHERE a."communityScore" IS DISTINCT FROM b."communityScore") AS changed
      FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
     GROUP BY 1 ORDER BY 1
  LOOP
    v_out := v_out || format(E'\n 2 cups per sample %s: %s rows, %s would change', r.bucket, r.n, r.changed);
  END LOOP;

  SELECT max(a."communityScore" - b."communityScore"), min(a."communityScore" - b."communityScore")
    INTO v_up, v_down
    FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId");
  v_out := v_out || format(E'\n 3 largest increase of communityScore: %s; largest decrease: %s', v_up, v_down);

  SELECT count(*) INTO v_excess
    FROM aggregate_scores a
   WHERE GREATEST(a."totalNonUniform", a."totalDefective") > 0
     AND (a."uniformityPenalty" + a."defectPenalty") / GREATEST(a."totalNonUniform", a."totalDefective") > 6.000001;
  v_out := v_out || format(E'\n 4 rows whose new penalty per flagged cup exceeds 6 (expect 0): %s', v_excess);
  v_out := v_out || format(E'\n 5 proconfig of recompute_aggregate_score (expect {search_path=public}): %s', v_conf);

  FOR r IN
    SELECT b."sessionSampleId" AS id, b."cupsPerSample" AS cups, b."communityScore" AS before, a."communityScore" AS after
      FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
     WHERE a."communityScore" IS DISTINCT FROM b."communityScore"
     ORDER BY abs(a."communityScore" - b."communityScore") DESC, b."sessionSampleId" LIMIT 10
  LOOP
    v_out := v_out || format(E'\n   sample %s (%s cups per sample): %s -> %s', r.id, r.cups, r.before, r.after);
  END LOOP;

  RAISE EXCEPTION E'PHASE 26 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
