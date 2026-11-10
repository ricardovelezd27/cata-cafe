-- PHASE 23 DRY RUN (S8-04). Fail-safe: ONE statement, nothing can be applied.
--
-- A single DO block that re-issues recompute_aggregate_score() (STEP 1), runs the
-- recompute (STEP 2) and ends with RAISE EXCEPTION carrying the before/after
-- counts. One statement is atomic however the SQL editor sends it: the exception
-- rolls everything back. The red error it ends with IS the expected outcome; it
-- starts with "PHASE 23 DRY RUN: NOTHING WAS APPLIED". Any OTHER error: stop and
-- report it.
--
-- The function between the markers must stay identical to PHASE 23 STEP 1 in
-- prisma/sql/rls_and_triggers.sql (only the quotes differ: $fn$ here, $$ there).
-- NEVER add BEGIN / COMMIT around this file. No placeholders to fill in.
DO $dry$
DECLARE
  v_total int; v_low int; v_low_changed int; v_high_changed int;
  v_out text := '';
  r record;
BEGIN
  CREATE TEMP TABLE agg_before ON COMMIT DROP AS
    SELECT "sessionSampleId", "cupsPerSample", "communityScore", "avgRawScore" FROM aggregate_scores;

  -- >>> PHASE 23 STEP 1 (copy of rls_and_triggers.sql) >>>
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_session_id         text;
  v_cups_per_sample    int;
  v_format             text;
  v_participant_count  int;   -- INCLUDED (complete) evaluations
  v_submitted_count    int;   -- all submitted, non-excluded evaluations
  v_total_cups         int;
  v_avg_raw            float;
  v_total_non_uniform  int;
  v_total_defective    int;
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

  -- Aggregate over submitted, NON-EXCLUDED evaluations. Score/penalty metrics use
  -- a FILTER so only COMPLETE evaluations contribute; submittedCount counts all.
  SELECT
    COUNT(*) FILTER (WHERE is_affective_complete(
      CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END))::int,
    COUNT(*)::int,
    AVG("rawScore") FILTER (WHERE is_affective_complete(
      CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u) WHERE u = true
    )::int) FILTER (WHERE is_affective_complete(
      CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v) WHERE v = true
    )::int) FILTER (WHERE is_affective_complete(
      CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0)
  INTO v_participant_count, v_submitted_count, v_avg_raw, v_total_non_uniform, v_total_defective
  FROM evaluations e
  WHERE e."sessionSampleId" = NEW."sessionSampleId" AND e."isDraft" = false
    AND NOT EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp."sessionId" = v_session_id
        AND sp."userId" = e."cupperId"
        AND sp.excluded_from_results = true
    );

  -- totalCups uses the INCLUDED count so penalties normalize over real cups only.
  v_total_cups := v_cups_per_sample * v_participant_count;

  -- S8-04: deductions only from 5 cups per sample (mirror of penaltiesApply() in
  -- lib/scoring.ts). Below that the stored community score is the plain average.
  IF v_cups_per_sample >= 5 AND v_total_cups > 0 THEN
    v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
    v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
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
  -- <<< PHASE 23 STEP 1 <<<

  -- STEP 2
  UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;

  SELECT count(*) INTO v_total FROM agg_before;
  SELECT count(*) INTO v_low FROM agg_before WHERE "cupsPerSample" < 5;
  SELECT count(*) INTO v_low_changed
    FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
   WHERE b."cupsPerSample" < 5 AND a."communityScore" IS DISTINCT FROM b."communityScore";
  SELECT count(*) INTO v_high_changed
    FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
   WHERE b."cupsPerSample" >= 5 AND a."communityScore" IS DISTINCT FROM b."communityScore";
  v_out := v_out || format(E'\n 1 aggregate rows: %s, of which cupsPerSample < 5: %s', v_total, v_low);
  v_out := v_out || format(E'\n 2 rows with cupsPerSample < 5 whose communityScore CHANGES (tell Kim first): %s', v_low_changed);
  v_out := v_out || format(E'\n 3 rows with cupsPerSample >= 5 whose communityScore changes (expect 0): %s', v_high_changed);
  FOR r IN
    SELECT b."sessionSampleId" AS id, b."cupsPerSample" AS cups, b."communityScore" AS before, a."communityScore" AS after
      FROM agg_before b JOIN aggregate_scores a USING ("sessionSampleId")
     WHERE a."communityScore" IS DISTINCT FROM b."communityScore"
     ORDER BY b."sessionSampleId" LIMIT 10
  LOOP
    v_out := v_out || format(E'\n   sample %s (%s cups): %s -> %s', r.id, r.cups, r.before, r.after);
  END LOOP;

  RAISE EXCEPTION E'PHASE 23 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:%', v_out;
END
$dry$;
