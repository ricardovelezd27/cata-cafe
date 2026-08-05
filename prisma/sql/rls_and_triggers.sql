-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffees ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE extrinsic_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe, won't error if they don't exist)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "coffees_all" ON coffees;
DROP POLICY IF EXISTS "sessions_all" ON cupping_sessions;
DROP POLICY IF EXISTS "samples_all" ON session_samples;
DROP POLICY IF EXISTS "evals_all" ON evaluations;
DROP POLICY IF EXISTS "phys_all" ON physical_evaluations;
DROP POLICY IF EXISTS "ext_all" ON extrinsic_data;

-- Profiles: anyone authenticated can read, only self can update
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid()::text);
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid()::text);

-- Coffees: owner can do everything, public ones readable by all
CREATE POLICY "coffees_all" ON coffees
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- Sessions: owner only
CREATE POLICY "sessions_all" ON cupping_sessions
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- Samples: via parent session
CREATE POLICY "samples_all" ON session_samples
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cupping_sessions
      WHERE id = session_samples."sessionId"
        AND "createdBy" = auth.uid()::text
    )
  );

-- Evaluations: own only
CREATE POLICY "evals_all" ON evaluations
  FOR ALL USING ("cupperId" = auth.uid()::text);

-- Physical evaluations: own only
CREATE POLICY "phys_all" ON physical_evaluations
  FOR ALL USING ("evaluatedBy" = auth.uid()::text);

-- Extrinsic data: via parent session
CREATE POLICY "ext_all" ON extrinsic_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM session_samples ss
      JOIN cupping_sessions cs ON cs.id = ss."sessionId"
      WHERE ss.id = extrinsic_data."sessionSampleId"
        AND cs."createdBy" = auth.uid()::text
    )
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, "displayName", "preferredLang")
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'preferred_lang', 'es')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- PHASE 2: Group sessions, participants, aggregate scoring
-- Apply this section via Supabase SQL editor after running
-- npx prisma migrate dev --name phase2_group_sessions
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregate_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coffee_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites ENABLE ROW LEVEL SECURITY;

-- Helper: is_session_participant
-- Returns true if the current user is the session owner OR a participant
CREATE OR REPLACE FUNCTION is_session_participant(p_session_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM cupping_sessions
    WHERE id = p_session_id AND "createdBy" = auth.uid()::text
  ) OR EXISTS (
    SELECT 1 FROM session_participants
    WHERE "sessionId" = p_session_id AND "userId" = auth.uid()::text
  );
$$;

-- Update cupping_sessions: replace owner-only ALL with split SELECT + write
DROP POLICY IF EXISTS "sessions_all" ON cupping_sessions;
CREATE POLICY "sessions_select" ON cupping_sessions
  FOR SELECT USING (is_session_participant(id));
CREATE POLICY "sessions_write" ON cupping_sessions
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- Update session_samples: participants can SELECT; owner can write
DROP POLICY IF EXISTS "samples_all" ON session_samples;
CREATE POLICY "samples_select" ON session_samples
  FOR SELECT USING (is_session_participant("sessionId"));
CREATE POLICY "samples_write" ON session_samples
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cupping_sessions
      WHERE id = session_samples."sessionId"
        AND "createdBy" = auth.uid()::text
    )
  );

-- Update evaluations: own drafts fully accessible; submitted evals readable by participants
DROP POLICY IF EXISTS "evals_all" ON evaluations;
CREATE POLICY "evals_own" ON evaluations
  FOR ALL USING ("cupperId" = auth.uid()::text);
CREATE POLICY "evals_submitted_participant" ON evaluations
  FOR SELECT USING (
    "isDraft" = false
    AND is_session_participant((
      SELECT ss."sessionId" FROM session_samples ss
      WHERE ss.id = "sessionSampleId"
    ))
  );

-- session_participants policies
CREATE POLICY "participants_select" ON session_participants
  FOR SELECT USING (is_session_participant("sessionId"));
CREATE POLICY "participants_write" ON session_participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cupping_sessions
      WHERE id = session_participants."sessionId"
        AND "createdBy" = auth.uid()::text
    )
  );

-- aggregate_scores: readable by session participants
CREATE POLICY "agg_select" ON aggregate_scores
  FOR SELECT USING (
    is_session_participant((
      SELECT ss."sessionId" FROM session_samples ss
      WHERE ss.id = aggregate_scores."sessionSampleId"
    ))
  );

-- user_coffee_history: own records only
CREATE POLICY "history_own" ON user_coffee_history
  FOR ALL USING ("userId" = auth.uid()::text);

-- session_invites: anyone can SELECT by token (for join page); creator can write
CREATE POLICY "invites_select" ON session_invites
  FOR SELECT USING (true);
CREATE POLICY "invites_write" ON session_invites
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- ============================================================
-- Aggregate score trigger
-- Fires after evaluation is submitted (isDraft set to false).
-- totalNonUniform = cups marked non-uniform but NOT defective
-- totalDefective  = cups marked defective only
-- Community score formula:
--   uniformityPenalty = totalNonUniform × (10 / totalCups)
--   defectPenalty     = totalDefective  × (30 / totalCups)
--   communityScore    = avgRawScore - uniformityPenalty - defectPenalty
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cups_per_sample    int;
  v_participant_count  int;
  v_total_cups         int;
  v_avg_raw            float;
  v_total_non_uniform  int;
  v_total_defective    int;
  v_uniformity_penalty float;
  v_defect_penalty     float;
  v_community_score    float;
BEGIN
  -- Get cupsPerSample from parent session
  SELECT cs."cupsPerSample" INTO v_cups_per_sample
  FROM session_samples ss
  JOIN cupping_sessions cs ON cs.id = ss."sessionId"
  WHERE ss.id = NEW."sessionSampleId";

  -- Aggregate over all submitted evaluations for this sample.
  -- totalNonUniform = ALL cups marked non-uniform (including defective ones).
  -- totalDefective  = ALL cups marked defective.
  -- A defective cup contributes to both, so its community penalty = 10/cup + 30/cup = 40/cup.
  SELECT
    COUNT(*)::int,
    AVG("rawScore"),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u)
      WHERE u = true
    )::int), 0),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v)
      WHERE v = true
    )::int), 0)
  INTO v_participant_count, v_avg_raw, v_total_non_uniform, v_total_defective
  FROM evaluations
  WHERE "sessionSampleId" = NEW."sessionSampleId" AND "isDraft" = false;

  v_total_cups := v_cups_per_sample * v_participant_count;

  IF v_total_cups > 0 THEN
    v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
    v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
  ELSE
    v_uniformity_penalty := 0;
    v_defect_penalty     := 0;
  END IF;

  v_community_score := GREATEST(0, LEAST(100,
    ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric, 2)
  ));

  INSERT INTO aggregate_scores (
    id,
    "sessionSampleId", "participantCount", "cupsPerSample", "totalCups",
    "avgRawScore", "totalNonUniform", "totalDefective",
    "uniformityPenalty", "defectPenalty", "communityScore", "computedAt"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."sessionSampleId", v_participant_count, v_cups_per_sample, v_total_cups,
    v_avg_raw, v_total_non_uniform, v_total_defective,
    v_uniformity_penalty, v_defect_penalty, v_community_score, now()
  )
  ON CONFLICT ("sessionSampleId") DO UPDATE SET
    "participantCount"  = EXCLUDED."participantCount",
    "cupsPerSample"     = EXCLUDED."cupsPerSample",
    "totalCups"         = EXCLUDED."totalCups",
    "avgRawScore"       = EXCLUDED."avgRawScore",
    "totalNonUniform"   = EXCLUDED."totalNonUniform",
    "totalDefective"    = EXCLUDED."totalDefective",
    "uniformityPenalty" = EXCLUDED."uniformityPenalty",
    "defectPenalty"     = EXCLUDED."defectPenalty",
    "communityScore"    = EXCLUDED."communityScore",
    "computedAt"        = EXCLUDED."computedAt";

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_aggregate ON evaluations;
CREATE TRIGGER trg_recompute_aggregate
  AFTER INSERT OR UPDATE OF "isDraft" ON evaluations
  FOR EACH ROW
  WHEN (NEW."isDraft" = false)
  EXECUTE FUNCTION recompute_aggregate_score();

-- Enable full row data in Realtime UPDATE events for evaluations
ALTER TABLE evaluations REPLICA IDENTITY FULL;

-- ============================================================
-- PHASE 3: Populate attrAverages in aggregate_scores trigger
-- Apply this block via Supabase Dashboard → SQL Editor.
-- This replaces recompute_aggregate_score() to also compute
-- per-attribute averages from the evaluation JSON fields.
-- After this, attrAverages is populated automatically on every
-- evaluation submission — no manual refresh needed going forward.
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cups_per_sample    int;
  v_format             text;
  v_participant_count  int;
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
  -- Get cupsPerSample and format from parent session
  SELECT cs."cupsPerSample", cs.format INTO v_cups_per_sample, v_format
  FROM session_samples ss
  JOIN cupping_sessions cs ON cs.id = ss."sessionId"
  WHERE ss.id = NEW."sessionSampleId";

  -- Pick which JSON column holds affective data
  v_json_col := CASE WHEN v_format = 'affective' THEN 'affectiveData' ELSE 'combinedData' END;

  -- Aggregate penalty and score metrics
  SELECT
    COUNT(*)::int,
    AVG("rawScore"),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u) WHERE u = true
    )::int), 0),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v) WHERE v = true
    )::int), 0)
  INTO v_participant_count, v_avg_raw, v_total_non_uniform, v_total_defective
  FROM evaluations
  WHERE "sessionSampleId" = NEW."sessionSampleId" AND "isDraft" = false;

  v_total_cups := v_cups_per_sample * v_participant_count;

  IF v_total_cups > 0 THEN
    v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
    v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
  ELSE
    v_uniformity_penalty := 0;
    v_defect_penalty     := 0;
  END IF;

  v_community_score := GREATEST(0, LEAST(100,
    ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric, 2)
  ));

  -- Compute per-attribute averages from the affective JSON column
  -- Attributes (id → label): fragancia_af→Fragancia, aroma_af→Aroma, sabor_af→Sabor,
  --   sabor_residual_af→Sabor residual, acidez_af→Acidez, dulzor_af→Dulzor,
  --   sensacion_af→Sensación en boca, impresion_global→Impresión global
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
    FROM evaluations
    WHERE "sessionSampleId" = NEW."sessionSampleId" AND "isDraft" = false
  ) e;

  INSERT INTO aggregate_scores (
    id,
    "sessionSampleId", "participantCount", "cupsPerSample", "totalCups",
    "avgRawScore", "totalNonUniform", "totalDefective",
    "uniformityPenalty", "defectPenalty", "communityScore",
    "attrAverages", "computedAt"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."sessionSampleId", v_participant_count, v_cups_per_sample, v_total_cups,
    v_avg_raw, v_total_non_uniform, v_total_defective,
    v_uniformity_penalty, v_defect_penalty, v_community_score,
    COALESCE(v_attr_averages, '{}'::jsonb), now()
  )
  ON CONFLICT ("sessionSampleId") DO UPDATE SET
    "participantCount"  = EXCLUDED."participantCount",
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
$$;
-- Trigger definition is unchanged — no need to recreate it.

-- ============================================================
-- PHASE 4: Exclude master-flagged participants from aggregates
-- Apply this block via Supabase Dashboard → SQL Editor AFTER running
-- migration 20260608000000_add_participant_exclusion (which adds
-- session_participants.excluded_from_results).
--
-- The cupping master can exclude a participant's data from the group
-- aggregate. This redefines recompute_aggregate_score() so every
-- aggregation over the sample's submitted evaluations skips evaluations
-- whose cupper is flagged excluded_from_results = true for THIS session.
-- Excluded cuppers still see their own results (read paths are unchanged).
--
-- Re-running the toggle does not, by itself, fire this trigger — the
-- server action setParticipantExclusion() re-fires it by touching the
-- session's submitted evaluations (UPDATE ... SET "isDraft" = "isDraft").
-- Trigger definition is unchanged — no need to recreate it.
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id         text;
  v_cups_per_sample    int;
  v_format             text;
  v_participant_count  int;
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

  -- Aggregate penalty and score metrics over submitted, NON-EXCLUDED evaluations.
  SELECT
    COUNT(*)::int,
    AVG("rawScore"),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u) WHERE u = true
    )::int), 0),
    COALESCE(SUM((
      SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v) WHERE v = true
    )::int), 0)
  INTO v_participant_count, v_avg_raw, v_total_non_uniform, v_total_defective
  FROM evaluations e
  WHERE e."sessionSampleId" = NEW."sessionSampleId" AND e."isDraft" = false
    AND NOT EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp."sessionId" = v_session_id
        AND sp."userId" = e."cupperId"
        AND sp.excluded_from_results = true
    );

  v_total_cups := v_cups_per_sample * v_participant_count;

  IF v_total_cups > 0 THEN
    v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
    v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
  ELSE
    v_uniformity_penalty := 0;
    v_defect_penalty     := 0;
  END IF;

  v_community_score := GREATEST(0, LEAST(100,
    ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric, 2)
  ));

  -- Per-attribute averages, also over submitted, NON-EXCLUDED evaluations.
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
      AND NOT EXISTS (
        SELECT 1 FROM session_participants sp
        WHERE sp."sessionId" = v_session_id
          AND sp."userId" = ev."cupperId"
          AND sp.excluded_from_results = true
      )
  ) e;

  INSERT INTO aggregate_scores (
    id,
    "sessionSampleId", "participantCount", "cupsPerSample", "totalCups",
    "avgRawScore", "totalNonUniform", "totalDefective",
    "uniformityPenalty", "defectPenalty", "communityScore",
    "attrAverages", "computedAt"
  ) VALUES (
    gen_random_uuid()::text,
    NEW."sessionSampleId", v_participant_count, v_cups_per_sample, v_total_cups,
    v_avg_raw, v_total_non_uniform, v_total_defective,
    v_uniformity_penalty, v_defect_penalty, v_community_score,
    COALESCE(v_attr_averages, '{}'::jsonb), now()
  )
  ON CONFLICT ("sessionSampleId") DO UPDATE SET
    "participantCount"  = EXCLUDED."participantCount",
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
$$;
-- Trigger definition is unchanged — no need to recreate it.


-- ============================================================
-- PHASE 5: Exclude INCOMPLETE evaluations from the group aggregate
-- Apply this block via Supabase Dashboard → SQL Editor AFTER running the
-- migration that adds aggregate_scores."submittedCount".
-- ============================================================
-- A participant who submits (isDraft=false) but leaves affective scores at
-- 0/null must NOT skew the community average. This mirrors the TypeScript rule
-- in lib/scoring.ts isAffectiveComplete(): an evaluation counts toward the
-- average only when ALL 8 affective attributes are present and > 0.
--
-- "participantCount" now means INCLUDED (complete) evaluations — the denominator
-- of the average. The new "submittedCount" column is the Y in "X of Y": all
-- submitted, non-excluded evaluations regardless of completeness.
-- ============================================================

-- Completeness predicate: true iff all 8 affective attributes have a real value.
-- Falls back from the "<attr>_final" key to the bare "<attr>" key, matching the
-- TS `Number(data["${id}_final"] ?? data[id] ?? 0) > 0`.
CREATE OR REPLACE FUNCTION is_affective_complete(data jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    COALESCE(NULLIF(data->>'fragancia_af_final','')::numeric,        NULLIF(data->>'fragancia_af','')::numeric,        0) > 0 AND
    COALESCE(NULLIF(data->>'aroma_af_final','')::numeric,            NULLIF(data->>'aroma_af','')::numeric,            0) > 0 AND
    COALESCE(NULLIF(data->>'sabor_af_final','')::numeric,            NULLIF(data->>'sabor_af','')::numeric,            0) > 0 AND
    COALESCE(NULLIF(data->>'sabor_residual_af_final','')::numeric,   NULLIF(data->>'sabor_residual_af','')::numeric,   0) > 0 AND
    COALESCE(NULLIF(data->>'acidez_af_final','')::numeric,           NULLIF(data->>'acidez_af','')::numeric,           0) > 0 AND
    COALESCE(NULLIF(data->>'dulzor_af_final','')::numeric,           NULLIF(data->>'dulzor_af','')::numeric,           0) > 0 AND
    COALESCE(NULLIF(data->>'sensacion_af_final','')::numeric,        NULLIF(data->>'sensacion_af','')::numeric,        0) > 0 AND
    COALESCE(NULLIF(data->>'impresion_global_final','')::numeric,    NULLIF(data->>'impresion_global','')::numeric,    0) > 0
$$;

CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  IF v_total_cups > 0 THEN
    v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
    v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
  ELSE
    v_uniformity_penalty := 0;
    v_defect_penalty     := 0;
  END IF;

  v_community_score := GREATEST(0, LEAST(100,
    ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric, 2)
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
$$;
-- Trigger definition is unchanged — no need to recreate it.

-- ============================================================
-- 2026-06-12: Waitlist table (landing page email capture)
-- Written exclusively via Prisma server actions (postgres role,
-- bypasses RLS). Enabling RLS with NO policies closes the anon
-- PostgREST surface entirely.
-- ============================================================
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PHASE 6 (N4): Round the community score to the nearest 0.25
-- Apply this block via Supabase Dashboard → SQL Editor.
--
-- SCA CVA scores fall on quarter-point steps (.00 / .25 / .50 / .75).
-- The authoritative community score (this trigger) previously rounded to 2
-- decimals, producing values like 84.91. This redefines recompute_aggregate_score()
-- IDENTICALLY to the PHASE 5 version EXCEPT the final v_community_score line, which
-- now rounds to the nearest 0.25 (ROUND(x * 4) / 4) as the single last step.
--
-- After applying, re-fire the recompute on existing rows so already-stored scores
-- re-round (the trigger fires on UPDATE OF "isDraft"):
--   UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;
-- Trigger definition is unchanged — no need to recreate it.
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  IF v_total_cups > 0 THEN
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
$$;
-- Trigger definition is unchanged — no need to recreate it.

-- ============================================================================
-- Phase 5 (2026-07-06): saved_insights hardening
-- The insights/analytics feature reads and writes exclusively through
-- server-side Prisma (direct DATABASE_URL role), guarded by
-- lib/analytics/access.ts. Enabling RLS with NO policies makes the table
-- deny-all through PostgREST/Supabase clients (anon/authenticated), so it can
-- never leak via the public API. Apply manually in the Supabase SQL editor.
-- ============================================================================
ALTER TABLE saved_insights ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Phase 7 (2026-07-07): enable Realtime postgres_changes for group sessions
-- The supabase_realtime publication existed but contained NO tables, so no
-- postgres_changes event ever fired: the waiting-room auto-start, the live
-- submitted counter in CupClient, and the results-page "new results" badge
-- all depend on UPDATE events from these two tables. REPLICA IDENTITY FULL
-- on evaluations was already applied (see above). Metadata-only change; no
-- data is modified. Apply manually in the Supabase SQL editor.
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cupping_sessions;

-- ============================================================================
-- Phase 8 (2026-07-20): third-party reference data tables hardening
-- reference_series (OWID/FAO production series, USDA PSD) and benchmark_lots
-- (CQI cupping dataset) are written only by import scripts and read only
-- through server-side Prisma (direct DATABASE_URL role), guarded by
-- lib/analytics/access.ts. Same rationale as saved_insights (Phase 5): RLS
-- with NO policies = deny-all through PostgREST/Supabase clients, so the data
-- can never leak via the public API. Apply manually in the Supabase SQL editor.
-- ============================================================================
ALTER TABLE reference_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_lots ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Phase 9 (2026-07-20): AI narrative cache hardening
-- insight_narratives caches AI-generated narrative JSON, written/read only via
-- server-side Prisma behind requireAnalyticsAccess(). Deny-all via RLS with no
-- policies, same rationale as Phase 5/8.
-- NOTE (verified 2026-07-20): this Supabase project auto-enables RLS on new
-- public tables, so Phases 8-9 were already active on creation; these
-- statements are kept for documentation and are idempotent.
-- ============================================================================
ALTER TABLE insight_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_runs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 10 (2026-07-21): Tasting Groups
-- A maestro's standing address book of co-cuppers, reusable across sessions
-- without re-inviting people one by one. All app reads/writes go through
-- Prisma server actions (app/actions/groups.ts, lib/coCuppers.ts), which run
-- with the postgres role and bypass RLS entirely. RLS here is a defense-in-depth
-- backstop for the anon/authenticated PostgREST surface — same pattern as
-- saved_insights (Phase 5) and waitlist_entries. Apply manually via the
-- Supabase Dashboard → SQL Editor.
-- ============================================================================
ALTER TABLE tasting_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasting_group_members ENABLE ROW LEVEL SECURITY;

-- Owner-only: only the group's creator can read or write the group row itself.
CREATE POLICY "tasting_groups_owner_all" ON tasting_groups
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- Owner-only, via the owning group.
--
-- Deliberately NO member-read policy for members themselves (e.g. "a member
-- can see who else is in a group they belong to") — that would leak co-members'
-- email addresses to every other member. The app never needs this: all reads
-- go through Prisma (app/actions/groups.ts, lib/coCuppers.ts), which uses the
-- postgres role and bypasses RLS, so owner-only here does not block any
-- legitimate app functionality.
CREATE POLICY "tasting_group_members_owner_all" ON tasting_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasting_groups
      WHERE id = tasting_group_members."groupId"
        AND "createdBy" = auth.uid()::text
    )
  );

-- ============================================================================
-- PHASE 10b (2026-07-21): Auto-link email-only group invitees on signup
-- Redefines handle_new_user() — body copied verbatim from its original
-- definition above, plus one statement after the profile insert — so an
-- email-only tasting-group invitee is automatically linked to their Profile
-- the moment they sign up, with no separate reconciliation job needed.
-- Trigger definition (on_auth_user_created) is unchanged — no need to recreate it.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, "displayName", "preferredLang")
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'preferred_lang', 'es')
  );

  -- Auto-link email-only group invitees: claim any tasting_group_members rows
  -- that were added by email before this user existed. Schema-qualified because
  -- this trigger fires from auth.users, where search_path may not include public.
  UPDATE public.tasting_group_members SET "userId" = NEW.id::text WHERE "userId" IS NULL AND lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PHASE 11 (2026-07-21): Fix coffees RLS — policy comment vs. behavior mismatch
-- The original Phase 1 comment above ("public ones readable by all") never
-- matched the actual policy: "coffees_all" was FOR ALL USING ("createdBy" =
-- auth.uid()::text), so a public coffee (isPublic = true) created by someone
-- else was NOT selectable via the anon/authenticated PostgREST surface —
-- only Prisma's server-side postgres-role reads (which bypass RLS) ever
-- honored isPublic. This splits SELECT (public OR own) from write (own only),
-- matching what the app has always assumed. Also gates the new
-- resultsPublished/resultsPublishedAt columns (Phase 3, coffee profile
-- community results) the same way — they're plain columns on this row, no
-- separate policy needed; setCoffeeResultsPublished() writes via Prisma
-- (postgres role) but this keeps direct-client reads honest too.
-- Apply manually via the Supabase Dashboard → SQL Editor.
-- ============================================================================
DROP POLICY IF EXISTS "coffees_all" ON coffees;
CREATE POLICY "coffees_select" ON coffees
  FOR SELECT USING ("isPublic" = true OR "createdBy" = auth.uid()::text);
CREATE POLICY "coffees_write" ON coffees
  FOR ALL USING ("createdBy" = auth.uid()::text);

-- ============================================================================
-- Phase 12 (2026-07-21): ai_chat_usage hardening
-- Per-user daily AI-chat counters, written/read only via server-side Prisma
-- behind requireAiAdmin(). Deny-all via RLS with no policies, same rationale
-- as saved_insights / insight_narratives. Supabase auto-enables RLS on new
-- public tables, so this is documentation + idempotent.
-- ============================================================================
ALTER TABLE ai_chat_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 13 (2026-07-22): evaluations.sessionId for server-side Realtime filtering
-- Added via Prisma migration `evaluation_session_id` (denormalized copy of
-- session_samples.sessionId, nullable, backfilled by the migration itself) so
-- CupClient/ResultsClient can subscribe with a `sessionId=eq.<id>` Realtime
-- filter instead of relying only on client-side sampleIds/isDraft filtering.
-- REPLICA IDENTITY FULL on evaluations (set above, Phase 2) already covers
-- this — no additional trigger or RLS change needed. No executable SQL in
-- this section; the only manual prod step is confirming the migration's
-- backfill ran: SELECT count(*) FROM evaluations WHERE "sessionId" IS NULL
-- should be ~0 after deploy.
-- ============================================================================

-- ============================================================================
-- PHASE 14 (2026-07-22): anonymous-safe handle_new_user()
-- Redefines handle_new_user() — body copied verbatim from the Phase 10b
-- definition above, with ONE change: the displayName expression now falls
-- back through raw_user_meta_data.display_name → the email local-part →
-- the literal 'Catador', instead of assuming NEW.email is non-null.
-- REQUIRED before enabling Supabase anonymous sign-ins (Dashboard →
-- Authentication → Sign In / Up → "Allow anonymous sign-ins"): an anonymous
-- user has NEW.email = NULL, and split_part(NULL, '@', 1) is NULL, which
-- would violate profiles."displayName" NOT NULL and hard-fail
-- supabase.auth.signInAnonymously() for every guest joining via QR invite.
-- Apply manually via the Supabase Dashboard → SQL Editor, BEFORE flipping the
-- anonymous sign-ins toggle.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, "displayName", "preferredLang")
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Catador'),
    COALESCE(NEW.raw_user_meta_data->>'preferred_lang', 'es')
  );

  -- Auto-link email-only group invitees: claim any tasting_group_members rows
  -- that were added by email before this user existed. Schema-qualified because
  -- this trigger fires from auth.users, where search_path may not include public.
  UPDATE public.tasting_group_members SET "userId" = NEW.id::text WHERE "userId" IS NULL AND lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================================

-- ============================================================================
-- PHASE 15 (2026-08-05): Groups v2 — description + session groupId (no RLS
-- changes; comment-only documentation block, nothing to run this round).
--
-- Migration `20260805000000_group_description_and_session_group` added
-- `tasting_groups.description` (plain text column, no new access surface) and
-- `cupping_sessions.groupId` (nullable FK, ON DELETE SET NULL) plus its index.
--
-- Why no policy work is required:
--   - Every group/session read added by Groups v2 (owner group list, member
--     group list, group→sessions list, session→group name) is served through
--     Prisma from server actions/RSCs, which run as the `postgres` role and
--     bypass RLS entirely. There is no new PostgREST/anon-key access path for
--     these columns.
--   - The Phase 10 owner-only policies on tasting_groups /
--     tasting_group_members are intentionally left unchanged. A member-read
--     policy (letting a linked member SELECT the group row and its member
--     list directly via PostgREST) would leak co-member email addresses to
--     every member, not just the owner — the read-only member view added in
--     this feature deliberately goes through a server action instead, which
--     masks co-member emails before they ever reach the client
--     (`j***@domain.com`, never the full address, per the plan's decision).
--   - `cupping_sessions.groupId` needs no policy of its own: cupping_sessions
--     already has no direct-client RLS surface (all reads/writes go through
--     Prisma), and the new column is just a nullable FK alongside the
--     existing ones.
--   - `handle_new_user()` (redefined in Phase 14 above) already auto-links
--     email-only tasting_group_members rows to a Profile on signup — Groups
--     v2's new invitation-email flow reuses that same trigger; no further
--     trigger change is needed.
--
-- No executable SQL in this block — nothing to apply via the Supabase
-- Dashboard SQL editor for this phase.
-- ============================================================================
