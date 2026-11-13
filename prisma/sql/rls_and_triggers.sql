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

-- ============================================================================
-- PHASE 16 (2026-08-05): Coffee 3-tier visibility + sharing
-- (Renumbered from 15: the groups-creation branch independently added a
-- comment-only PHASE 15 the same day; the migration file's comment still says
-- 15 but can't be edited — it's checksum-locked as applied.)
-- The Prisma migration `coffee_visibility_and_sharing` replaced
-- coffees."isPublic" (boolean) with coffees."visibility"
-- ('private' | 'shared' | 'public') and added coffee_shares / coffee_invites.
-- That migration already dropped the Phase 11 coffees_select policy (it
-- referenced the removed column); this block recreates it with the new
-- semantics: public coffees readable by all, own coffees always, shared
-- coffees readable by users holding a coffee_shares row — but only while the
-- coffee is actually in 'shared' state (flipping to private makes share rows
-- inert without deleting them). coffees_write (Phase 11, owner FOR ALL) is
-- unchanged and still valid.
-- Writes to coffee_shares/coffee_invites happen only via server actions using
-- Prisma (postgres role, bypasses RLS), so neither table gets write policies;
-- coffee_invites gets no policies at all (deny-all, Phase 12 rationale —
-- tokens must never be enumerable from the client).
-- NOTE (drift incident 2026-08-05): after this branch's migration dropped
-- coffees."isPublic" on the shared DB, the column was re-added ADDITIVELY
-- (boolean, default false, backfilled from visibility) because origin/main
-- (= production) and the groups branch still read/write it. This branch now
-- mirrors isPublic = (visibility = 'public') on every write; a reconciliation
-- migration should drop isPublic again once every branch reads `visibility`.
-- Apply manually via the Supabase Dashboard → SQL Editor.
-- ============================================================================
DROP POLICY IF EXISTS "coffees_select" ON coffees;
CREATE POLICY "coffees_select" ON coffees
  FOR SELECT USING (
    "visibility" = 'public'
    OR "createdBy" = auth.uid()::text
    OR ("visibility" = 'shared' AND EXISTS (
      SELECT 1 FROM coffee_shares cs
      WHERE cs."coffeeId" = coffees.id AND cs."userId" = auth.uid()::text))
  );

ALTER TABLE coffee_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coffee_shares_select" ON coffee_shares;
CREATE POLICY "coffee_shares_select" ON coffee_shares
  FOR SELECT USING (
    "userId" = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM coffees c
      WHERE c.id = coffee_shares."coffeeId" AND c."createdBy" = auth.uid()::text)
  );

ALTER TABLE coffee_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 17 (2026-08-05): Group announcements feed (group_posts)
-- The Prisma migration `group_posts` added the group_posts table (owner-only
-- authorship, members read in-app). Same access model as Phase 10's
-- tasting_groups: RLS is enabled with OWNER-ONLY policies, and every
-- member-facing read goes through Prisma (postgres role, bypasses RLS) — the
-- server actions in app/actions/groups.ts are the real gate. Do NOT move
-- group_posts reads to the Supabase client: members would silently see
-- nothing (Phase 15 rationale).
-- Apply manually via the Supabase Dashboard → SQL Editor.
-- ============================================================================
ALTER TABLE group_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_posts_select" ON group_posts;
CREATE POLICY "group_posts_select" ON group_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasting_groups g
      WHERE g.id = group_posts."groupId"
        AND g."createdBy" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "group_posts_write" ON group_posts;
CREATE POLICY "group_posts_write" ON group_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasting_groups g
      WHERE g.id = group_posts."groupId"
        AND g."createdBy" = auth.uid()::text
    )
  );

-- ============================================================================
-- PHASE 18 (2026-09-08): Launch security hardening — close the anon-key reads
-- and lock down SECURITY DEFINER functions.
--
-- Why: NEXT_PUBLIC_SUPABASE_ANON_KEY is public by design (it ships to every
-- browser for Realtime). Two Phase 1/2 policies were written with USING (true)
-- and no TO clause, so they applied to the `anon` role as well:
--   * "invites_select" on session_invites  → every invite token on the platform
--     was readable via /rest/v1/session_invites — anyone could walk into any
--     group session.
--   * "profiles_select" on profiles         → every profile row (displayName,
--     role, country, analyticsAccess) was readable anonymously.
-- Neither is needed by any browser code: the join page and every profile read
-- go through Prisma (postgres role, bypasses RLS). Verified on 2026-09-08 with
--   grep -rn '\.from("session_invites"\|\.from("profiles"' app components lib
-- (only server-side admin-client calls exist).
--
-- Also per Supabase security advisors 0011 / 0028 / 0029: the helper functions
-- had a role-mutable search_path and were EXECUTE-able by anon/authenticated
-- via /rest/v1/rpc/*. Triggers do not need EXECUTE for the calling role at
-- fire time (only at CREATE TRIGGER time, which runs as postgres), so revoking
-- from the API roles is safe.
--
-- Apply manually via the Supabase Dashboard → SQL Editor (see
-- docs/LAUNCH-RUNBOOK.md §1). Verify afterwards with:
--   select policyname, roles, qual from pg_policies
--     where tablename in ('session_invites','profiles');
-- ============================================================================

-- session_invites: drop the anonymous read. "invites_write" (FOR ALL,
-- createdBy = auth.uid()) already lets an owner read their own invites.
DROP POLICY IF EXISTS "invites_select" ON session_invites;

-- profiles: own row only, signed-in users only (anonymous guests are also
-- `authenticated` in Supabase, so this still lets a guest read their own row).
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

-- Helper functions: no API-role execution, pinned search_path.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_session_participant(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_aggregate_score() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_affective_complete(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.is_session_participant(text) SET search_path = public;
ALTER FUNCTION public.recompute_aggregate_score() SET search_path = public;
ALTER FUNCTION public.is_affective_complete(jsonb) SET search_path = public;

-- Rollback (only if something client-side turns out to need the old reads):
--   CREATE POLICY "invites_select" ON session_invites FOR SELECT USING (true);
--   DROP POLICY "profiles_select" ON profiles;
--   CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
-- ============================================================================

-- ============================================================================
-- PHASE 18b (2026-09-14): correction to PHASE 18 — functions referenced by RLS
-- policies must stay EXECUTE-able by the role the policy runs as.
--
-- `is_session_participant(text)` is called from the sessions_select,
-- samples_select, participants_select, evals_submitted_participant and
-- agg_select policies. Policy expressions are evaluated AS THE QUERYING ROLE,
-- so after PHASE 18 revoked EXECUTE from `authenticated`, every RLS-gated read
-- by that role (Supabase Realtime subscriptions in the waiting room, cup and
-- results screens) failed with "permission denied for function". Verified on
-- production with `set local role authenticated; select is_session_participant(…)`.
-- Prisma (postgres role, bypasses RLS) was never affected.
--
-- Rule going forward: revoke from `anon` and `PUBLIC` only; any function a
-- policy calls keeps EXECUTE for `authenticated`. Trigger functions
-- (handle_new_user, recompute_aggregate_score) do NOT need EXECUTE for the
-- role that fires the trigger (verified with a rolled-back probe), but
-- granting handle_new_user to supabase_auth_admin is harmless belt-and-braces.
-- Apply manually via the Supabase Dashboard → SQL Editor (runbook §1b).
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.is_session_participant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
-- ============================================================================

-- ============================================================================
-- PHASE 20 (2026-09-26): coffee soft delete — hide anonymized coffees from
-- direct-client reads.
--
-- deleteCoffees (app/actions/coffees.ts) no longer deletes the row: it wipes
-- the identifying fields, stamps coffees."deletedAt" and removes the
-- coffee_shares / coffee_invites rows (see lib/coffeeAnonymize.ts). Prisma
-- (postgres role) already filters on "deletedAt" IS NULL through
-- usableCoffeeWhere; these policies keep PostgREST/Realtime reads honest so an
-- anonymized row is not readable (or writable back into existence) via the
-- anon/authenticated key either. Nothing client-side reads `coffees` today.
-- Apply manually via the Supabase Dashboard → SQL Editor (runbook §8).
-- ============================================================================
DROP POLICY IF EXISTS "coffees_select" ON coffees;
CREATE POLICY "coffees_select" ON coffees
  FOR SELECT USING (
    "deletedAt" IS NULL
    AND (
      "visibility" = 'public'
      OR "createdBy" = auth.uid()::text
      OR ("visibility" = 'shared' AND EXISTS (
        SELECT 1 FROM coffee_shares cs
        WHERE cs."coffeeId" = coffees.id AND cs."userId" = auth.uid()::text))
    )
  );

DROP POLICY IF EXISTS "coffees_write" ON coffees;
CREATE POLICY "coffees_write" ON coffees
  FOR ALL USING ("deletedAt" IS NULL AND "createdBy" = auth.uid()::text);
-- ============================================================================

-- ============================================================================
-- PHASE 21 (2026-11-10): closed / expired means read-only IN SQL TOO, and a
-- participant can no longer read a peer's submitted rows through the API.
-- Spec: docs/prompts/S8-flows/S8-01-rls-closed-readonly.md (F-sesiones-1,
-- F-resultados-1, F-sesiones-13/14/15). Apply via runbook §10 — SQL FIRST,
-- then deploy the app. The Supabase project is production.
--
-- NOTE (S9-01, audit A-12; comment only): the SECURITY DEFINER policy helpers
-- (is_session_participant, is_session_owner, can_view_group_results,
-- is_coffee_owner, ...) are callable over /rest/v1/rpc by ANY signed-in user.
-- That is acceptable only because each one answers about the caller's own
-- standing; never add a helper that takes a user id to probe. They must also
-- KEEP EXECUTE for `authenticated`: policy expressions run as the querying
-- role, and revoking it broke every Realtime subscription on 2026-09-14
-- (PHASE 18b). Revoke from PUBLIC / anon only.
--
-- Why: NEXT_PUBLIC_SUPABASE_ANON_KEY is public and every signed-in user
-- (guests included) holds an `authenticated` JWT. The Phase 1/2 policies were
-- written for a browser that talked to PostgREST directly, which this app
-- stopped doing long ago (every write is a server action running through
-- Prisma as `postgres`, which bypasses RLS). What is left is only attack
-- surface that bypasses lib/sessionAuth.ts:
--   * evals_own (FOR ALL, no membership test, no closed test): any user could
--     INSERT/UPDATE/DELETE evaluations for ANY sample, before or after close.
--   * sessions_write / samples_write / participants_write: the owner could
--     PATCH `status`, samples or the roster directly, past the closed guard.
--   * phys_all / ext_all: same, for the owner-only per-sample tables.
--   * evals_submitted_participant + agg_select: a participant could read every
--     peer's submitted evaluation (names via cupperId, raw scores) and the
--     hidden community score while results were not yet visible.
--   * samples_select exposes session_samples."coffeeId" (blind coding): a
--     participant could read which coffee an unrevealed sample is.
--   * invites_write (FOR ALL, no session check): any user could mint an invite
--     for ANY session id and redeem it (F-sesiones-14).
--   * profiles_update (no column limit): a user could set their own
--     "analyticsAccess" and open Insights (F-sesiones-15).
-- Exploitability of these over PostgREST was read from the policies, not
-- demonstrated against production.
--
-- Verified 2026-11-10 that NO browser code reads or writes these tables:
--   grep -rnE '\.(from|rpc)\(\s*["'"'"'`]' app components hooks lib scripts
--   → no matches. Browser supabase-js is used only for signInAnonymously and
--   three Realtime clients (CupClient, ResultsClient, WaitingRoomClient). Those
--   subscribe to `evaluations` (owner only after this phase) and
--   `cupping_sessions`; neither the SELECT policies nor the publication change.
--   `session_samples` and `aggregate_scores` are NOT in supabase_realtime.
--
-- What it does (see the statements; all inside one transaction):
--   1. Two helpers, is_session_owner() and can_view_group_results() (the SQL
--      twin of canViewGroupResults in lib/sessionState.ts: keep them in step).
--      SECURITY DEFINER, pinned search_path, EXECUTE revoked from PUBLIC/anon and
--      kept for `authenticated` (PHASE 18b rule: policy helpers run as the
--      querying role).
--   2. evaluations: own rows + owner's submitted rows, SELECT only.
--   3. aggregate_scores: owner always; participant only once group results are
--      visible (strict `closesAt < now`, the same boundary as isSessionExpired).
--   4. Write policies dropped on the seven session tables + session_invites +
--      profiles; INSERT/UPDATE/DELETE/TRUNCATE revoked from anon/authenticated.
--      Prisma (postgres) and SECURITY DEFINER triggers are unaffected.
--   5. session_samples."coffeeId" hidden by column privileges for everyone over
--      the API (nothing in the browser reads it). RULE: a future column added to
--      session_samples needs `GRANT SELECT ("col") ... TO authenticated` here,
--      or API reads of it fail.
--
-- Not built (architect decision): a `touch_session_on_submit` trigger. The app
-- touches cupping_sessions."updatedAt" once, in submitAllEvaluations, on the
-- submit that makes group results visible.
--
-- Pre-flight (read-only; run first, expect what is noted):
--   -- column list must still be exactly the GRANT below (+ "coffeeId"):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='session_samples' order by 1;
--     -- expect: coffeeId, createdAt, id, label, position, referenceRank, revealed, sessionId
--   -- live group sessions that never recorded a start would block participants
--   -- (assertSessionStarted); list them and decide before deploying the app:
--   select id, name from cupping_sessions
--     where "isGroup" and not "isAsync" and status = 'active' and "startedAt" is null;
--   -- current table privileges (Supabase default: all to anon+authenticated):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name in ('evaluations','session_samples')
--       and grantee in ('anon','authenticated') order by 1,2,3;
--
-- Dry run: prisma/sql/dry-runs/phase21_dry_run.sql. It is ONE DO statement, so
-- nothing can be applied and no transaction can be left open. Replace its three
-- placeholders (participant uuid, owner uuid, session id) and run it: it ends in
-- an intentional error whose message lists every check with its expected value.
--
-- After applying: Supabase Dashboard → Advisors → Security (no new findings),
-- and open one group session as owner + participant to confirm the waiting
-- room, cup and results screens still update (Realtime delivers).
-- Rollback: the commented block at the end of this phase.
-- ============================================================================
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
-- "closesAt" is TIMESTAMP(3) holding UTC, hence now() AT TIME ZONE 'utc'.
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

COMMIT;

-- Rollback (restores the policies and grants exactly as they were before this
-- phase; run it in one transaction):
--   BEGIN;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON
--     evaluations, aggregate_scores, cupping_sessions, session_samples,
--     session_participants, physical_evaluations, extrinsic_data,
--     session_invites, profiles
--   TO anon, authenticated;
--   GRANT SELECT ON session_samples TO anon, authenticated;
--   DROP POLICY IF EXISTS "evals_select_own" ON evaluations;
--   DROP POLICY IF EXISTS "evals_select_owner" ON evaluations;
--   CREATE POLICY "evals_own" ON evaluations
--     FOR ALL USING ("cupperId" = auth.uid()::text);
--   CREATE POLICY "evals_submitted_participant" ON evaluations
--     FOR SELECT USING (
--       "isDraft" = false
--       AND is_session_participant((
--         SELECT ss."sessionId" FROM session_samples ss
--         WHERE ss.id = "sessionSampleId"
--       ))
--     );
--   DROP POLICY IF EXISTS "agg_select" ON aggregate_scores;
--   CREATE POLICY "agg_select" ON aggregate_scores
--     FOR SELECT USING (
--       is_session_participant((
--         SELECT ss."sessionId" FROM session_samples ss
--         WHERE ss.id = aggregate_scores."sessionSampleId"
--       ))
--     );
--   CREATE POLICY "sessions_write" ON cupping_sessions
--     FOR ALL USING ("createdBy" = auth.uid()::text);
--   CREATE POLICY "samples_write" ON session_samples
--     FOR ALL USING (
--       EXISTS (
--         SELECT 1 FROM cupping_sessions
--         WHERE id = session_samples."sessionId"
--           AND "createdBy" = auth.uid()::text
--       )
--     );
--   CREATE POLICY "participants_write" ON session_participants
--     FOR ALL USING (
--       EXISTS (
--         SELECT 1 FROM cupping_sessions
--         WHERE id = session_participants."sessionId"
--           AND "createdBy" = auth.uid()::text
--       )
--     );
--   DROP POLICY IF EXISTS "phys_select" ON physical_evaluations;
--   CREATE POLICY "phys_all" ON physical_evaluations
--     FOR ALL USING ("evaluatedBy" = auth.uid()::text);
--   DROP POLICY IF EXISTS "ext_select" ON extrinsic_data;
--   CREATE POLICY "ext_all" ON extrinsic_data
--     FOR ALL USING (
--       EXISTS (
--         SELECT 1 FROM session_samples ss
--         JOIN cupping_sessions cs ON cs.id = ss."sessionId"
--         WHERE ss.id = extrinsic_data."sessionSampleId"
--           AND cs."createdBy" = auth.uid()::text
--       )
--     );
--   DROP POLICY IF EXISTS "invites_select_own" ON session_invites;
--   CREATE POLICY "invites_write" ON session_invites
--     FOR ALL USING ("createdBy" = auth.uid()::text);
--   CREATE POLICY "profiles_update" ON profiles
--     FOR UPDATE USING (id = auth.uid()::text);
--   CREATE POLICY "profiles_insert" ON profiles
--     FOR INSERT WITH CHECK (id = auth.uid()::text);
--   -- the two helpers are harmless to keep; to drop them, first drop the
--   -- policies above that call them (already done), then:
--   --   DROP FUNCTION public.is_session_owner(text);
--   --   DROP FUNCTION public.can_view_group_results(text);
--   COMMIT;
-- ============================================================================
-- PHASE 22 (2026-11-10, S8-03): outbound email ledger tables, server-only
-- `outbound_email_events` (the throttle's reservations) and
-- `group_email_deliveries` (per-recipient ledger of a group broadcast) are read
-- and written only through server-side Prisma (postgres role, bypasses RLS):
-- lib/emailBudget.ts and lib/groupEmail.ts. Deny-all via RLS with no policies,
-- same rationale as ai_chat_usage (PHASE 12). Supabase auto-enables RLS on new
-- public tables, so this is documentation + idempotent. Neither table holds a
-- raw address or IP: the keys are HMACs (lib/emailKeys.ts).
-- Apply AFTER `npx prisma migrate deploy` created the tables (runbook §11).
-- ============================================================================
ALTER TABLE outbound_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_email_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 23 (2026-11-10, S8-04): one community score below five cups
-- Spec: docs/prompts/S8-flows/S8-04-scoring-under-five-cups.md (F-grupal-1).
-- Apply via runbook §12, dry run first (prisma/sql/dry-runs/phase23_dry_run.sql).
--
-- Why: recompute_aggregate_score() (PHASE 11 body, line ~710) subtracts the
-- uniformity (10/total_cups) and defect (30/total_cups) penalties at ANY cup
-- count, while lib/scoring.ts (computeGroupAggregate, calcIndividualBreakdown)
-- only deducts from 5 cups per sample (CLAUDE.md "Scoring System"). A 2-cup
-- session with one flagged cup therefore showed 79.00 on the results page and
-- a lower number in the coffee history, which copies the stored aggregate.
-- This phase aligns the SQL with the documented formula: the trigger stays the
-- authority for the STORED score, and it now agrees with the TypeScript gate.
-- calcCommunityScore stays display-only.
--
-- Pre-flight (do NOT skip): confirm the live function body still matches the
-- definition at line ~710 of this file:
--   SELECT pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure);
-- It must contain "IF v_total_cups > 0 THEN" and no "v_cups_per_sample >= 5".
--
-- TWO STEPS, in this order, in separate SQL editor runs (STEP 2 was CANCELLED on
-- 2026-11-12 and must never run, see PHASE 26; STEP 1 was applied 2026-11-11):
--   STEP 1  re-issue the function (changes nothing stored by itself).
--   STEP 2  the recompute (below, commented). It CHANGES the stored community
--           score of every past session with cupsPerSample < 5 and a flagged
--           cup, exactly once; it is idempotent (a second run changes nothing).
--           Tell Kim BEFORE running it.
--
-- Post-apply check (STEP 1 must keep the PHASE 18 pin; CREATE OR REPLACE resets function config):
--   select proconfig from pg_proc where proname = 'recompute_aggregate_score';  -- expect {search_path=public}
-- Verify: pick a session with cupsPerSample < 5 and a flagged cup; before STEP 2
-- its aggregate_scores."communityScore" is below "avgRawScore", after it equals
-- "avgRawScore" rounded to 0.25. Sessions with cupsPerSample >= 5 never move.
-- ============================================================================
-- STEP 1
CREATE OR REPLACE FUNCTION recompute_aggregate_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- STEP 2 -- CANCELLED 2026-11-12, NEVER RUN. Do not run it (nor
-- scripts/resync-low-cup-history.ts): it would raise 54 stored scores and the
-- rule that replaced S8-04 is docs/product/cata-descentralizada-puntaje.md
-- (PHASE 26 below). The text that follows is kept only as a record of what it was.
-- (separate run, after telling Kim). Idempotent. Re-fires the trigger
-- (it fires on UPDATE OF "isDraft" when "isDraft" = false) for every submitted
-- evaluation. Afterwards run: npx tsx scripts/resync-low-cup-history.ts --apply
-- (dry-run without --apply) so UserCoffeeHistory follows the new aggregates.
--   UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;
--
-- ROLLBACK: re-create the previous function body (verbatim below) and re-run
-- STEP 2. The scores of sessions under 5 cups then go back to the old values.
--   CREATE OR REPLACE FUNCTION recompute_aggregate_score()
--   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   DECLARE
--     v_session_id         text;
--     v_cups_per_sample    int;
--     v_format             text;
--     v_participant_count  int;   -- INCLUDED (complete) evaluations
--     v_submitted_count    int;   -- all submitted, non-excluded evaluations
--     v_total_cups         int;
--     v_avg_raw            float;
--     v_total_non_uniform  int;
--     v_total_defective    int;
--     v_uniformity_penalty float;
--     v_defect_penalty     float;
--     v_community_score    float;
--     v_attr_averages      jsonb;
--     v_json_col           text;
--   BEGIN
--     -- Get sessionId, cupsPerSample and format from parent session
--     SELECT ss."sessionId", cs."cupsPerSample", cs.format
--       INTO v_session_id, v_cups_per_sample, v_format
--     FROM session_samples ss
--     JOIN cupping_sessions cs ON cs.id = ss."sessionId"
--     WHERE ss.id = NEW."sessionSampleId";
--   
--     -- Pick which JSON column holds affective data
--     v_json_col := CASE WHEN v_format = 'affective' THEN 'affectiveData' ELSE 'combinedData' END;
--   
--     -- Aggregate over submitted, NON-EXCLUDED evaluations. Score/penalty metrics use
--     -- a FILTER so only COMPLETE evaluations contribute; submittedCount counts all.
--     SELECT
--       COUNT(*) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END))::int,
--       COUNT(*)::int,
--       AVG("rawScore") FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)),
--       COALESCE(SUM((
--         SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u) WHERE u = true
--       )::int) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0),
--       COALESCE(SUM((
--         SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v) WHERE v = true
--       )::int) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0)
--     INTO v_participant_count, v_submitted_count, v_avg_raw, v_total_non_uniform, v_total_defective
--     FROM evaluations e
--     WHERE e."sessionSampleId" = NEW."sessionSampleId" AND e."isDraft" = false
--       AND NOT EXISTS (
--         SELECT 1 FROM session_participants sp
--         WHERE sp."sessionId" = v_session_id
--           AND sp."userId" = e."cupperId"
--           AND sp.excluded_from_results = true
--       );
--   
--     -- totalCups uses the INCLUDED count so penalties normalize over real cups only.
--     v_total_cups := v_cups_per_sample * v_participant_count;
--   
--     IF v_total_cups > 0 THEN
--       v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
--       v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
--     ELSE
--       v_uniformity_penalty := 0;
--       v_defect_penalty     := 0;
--     END IF;
--   
--     -- N4: round the final community score to the nearest 0.25 (was ROUND(..., 2)).
--     v_community_score := GREATEST(0, LEAST(100,
--       ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric * 4) / 4
--     ));
--   
--     -- Per-attribute averages over submitted, NON-EXCLUDED, COMPLETE evaluations.
--     SELECT jsonb_build_object(
--       'Fragancia',        ROUND(AVG(NULLIF((e.data->>'fragancia_af_final'),   '')::numeric), 2),
--       'Aroma',            ROUND(AVG(NULLIF((e.data->>'aroma_af_final'),        '')::numeric), 2),
--       'Sabor',            ROUND(AVG(NULLIF((e.data->>'sabor_af_final'),        '')::numeric), 2),
--       'Sabor residual',   ROUND(AVG(NULLIF((e.data->>'sabor_residual_af_final'),'')::numeric), 2),
--       'Acidez',           ROUND(AVG(NULLIF((e.data->>'acidez_af_final'),       '')::numeric), 2),
--       'Dulzor',           ROUND(AVG(NULLIF((e.data->>'dulzor_af_final'),       '')::numeric), 2),
--       'Sensación en boca',ROUND(AVG(NULLIF((e.data->>'sensacion_af_final'),    '')::numeric), 2),
--       'Impresión global', ROUND(AVG(NULLIF((e.data->>'impresion_global_final'),'')::numeric), 2)
--     )
--     INTO v_attr_averages
--     FROM (
--       SELECT CASE v_json_col
--         WHEN 'affectiveData' THEN "affectiveData"
--         ELSE "combinedData"
--       END AS data
--       FROM evaluations ev
--       WHERE ev."sessionSampleId" = NEW."sessionSampleId" AND ev."isDraft" = false
--         AND is_affective_complete(
--           CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)
--         AND NOT EXISTS (
--           SELECT 1 FROM session_participants sp
--           WHERE sp."sessionId" = v_session_id
--             AND sp."userId" = ev."cupperId"
--             AND sp.excluded_from_results = true
--         )
--     ) e;
--   
--     INSERT INTO aggregate_scores (
--       id,
--       "sessionSampleId", "participantCount", "submittedCount", "cupsPerSample", "totalCups",
--       "avgRawScore", "totalNonUniform", "totalDefective",
--       "uniformityPenalty", "defectPenalty", "communityScore",
--       "attrAverages", "computedAt"
--     ) VALUES (
--       gen_random_uuid()::text,
--       NEW."sessionSampleId", v_participant_count, v_submitted_count, v_cups_per_sample, v_total_cups,
--       v_avg_raw, v_total_non_uniform, v_total_defective,
--       v_uniformity_penalty, v_defect_penalty, v_community_score,
--       COALESCE(v_attr_averages, '{}'::jsonb), now()
--     )
--     ON CONFLICT ("sessionSampleId") DO UPDATE SET
--       "participantCount"  = EXCLUDED."participantCount",
--       "submittedCount"    = EXCLUDED."submittedCount",
--       "cupsPerSample"     = EXCLUDED."cupsPerSample",
--       "totalCups"         = EXCLUDED."totalCups",
--       "avgRawScore"       = EXCLUDED."avgRawScore",
--       "totalNonUniform"   = EXCLUDED."totalNonUniform",
--       "totalDefective"    = EXCLUDED."totalDefective",
--       "uniformityPenalty" = EXCLUDED."uniformityPenalty",
--       "defectPenalty"     = EXCLUDED."defectPenalty",
--       "communityScore"    = EXCLUDED."communityScore",
--       "attrAverages"      = EXCLUDED."attrAverages",
--       "computedAt"        = EXCLUDED."computedAt";
--   
--     RETURN NEW;
--   END;
--   $$;

-- ============================================================================
-- PHASE 24 (2026-11-10, S8-24 / audit A-02): the API roles are READ-ONLY across
-- the whole public schema.
-- Apply via runbook §26, dry run first (prisma/sql/dry-runs/phase24_dry_run.sql).
-- The Supabase project is production (there is only one).
--
-- Why: PHASE 21 closed the browser-key write surface on the nine session tables
-- only. Five tables still carried a FOR ALL policy (USING doubles as WITH CHECK,
-- no TO clause, so it applied to `anon` too) and the Supabase default grants
-- (INSERT/UPDATE/DELETE/TRUNCATE to anon + authenticated) were still in place:
--   * tasting_groups_owner_all        (PHASE 10)  tasting_groups
--   * tasting_group_members_owner_all (PHASE 10)  tasting_group_members
--   * group_posts_write               (PHASE 17)  group_posts
--   * coffees_write                   (PHASE 20)  coffees
--   * history_own                     (PHASE 2)   user_coffee_history
-- The exploitable one: with any `authenticated` JWT (a guest's too) a group
-- owner could POST /rest/v1/tasting_group_members with {groupId: <own group>,
-- userId: <any user uuid>} (the policy only checks group ownership), and the
-- group mail path (liveEmails in app/actions/groups.ts) then resolves that
-- uuid to the victim's real address and mails attacker-written text to it.
-- Guests could also INSERT coffees / tasting_groups past requireRegisteredUser
-- and forge their own user_coffee_history rows. Read from the policies and the
-- code, not demonstrated against production.
--
-- Verified 2026-11-10 at this tip:
--   * Every write in this app is a server action / route / script going
--     through Prisma as `postgres` (table owner, bypasses RLS). SECURITY
--     DEFINER triggers (handle_new_user, recompute_aggregate_score) run as
--     their owner. Neither depends on anon/authenticated privileges.
--   * The browser makes no PostgREST call at all:
--       grep -rnE '\.(from|rpc)\(\s*["'"'"'`]' app components hooks lib scripts
--       → (no output, exit 1)
--     Browser supabase-js is used only for auth and three Realtime clients.
--   * supabase_realtime holds only `evaluations` and `cupping_sessions`
--     (Phase 7). Realtime evaluates their SELECT policies as `authenticated`;
--     both stay SELECT policies with the same USING expression.
--
-- What it does (one transaction):
--   1. Drops the five write policies. Where the FOR ALL policy was also the
--      only READ path (tasting_groups, tasting_group_members,
--      user_coffee_history) a SELECT-only policy TO authenticated with the SAME
--      USING expression replaces it, so reads are unchanged. group_posts and
--      coffees already have a SELECT policy covering the owner's rows
--      (group_posts_select has the identical USING; coffees_select includes
--      "createdBy" = auth.uid() AND "deletedAt" IS NULL), so nothing is added.
--   2. Every remaining SELECT policy without a role (coffees_select,
--      group_posts_select, sessions_select, samples_select,
--      participants_select) is re-targeted TO authenticated
--      with ALTER POLICY, which keeps the USING expression byte for byte. For
--      `anon` they returned nothing anyway (auth.uid() is NULL), except
--      coffees_select, which let the public key read every public coffee with
--      its "createdBy" (the uuid harvest the attack above starts from).
--      coffee_shares_select is not ALTERed but recreated (see "Recursion" below).
--      is_session_participant keeps EXECUTE for authenticated (PHASE 18b rule)
--      and is not touched here. Functions added by this phase: one,
--      is_coffee_owner(text) (SECURITY DEFINER, EXECUTE for authenticated only).
--      Recursion (found by the 2026-11-10 production dry run): since PHASE 16
--      coffees_select reads coffee_shares and coffee_shares_select reads coffees,
--      so ANY select on either table as `authenticated` failed with 42P17
--      "infinite recursion detected in policy". The app never saw it (Prisma
--      runs as postgres) but a policy that errors is not a policy and the dry
--      run's probes could not run. coffee_shares_select now asks is_coffee_owner(),
--      which reads coffees as its owner (RLS bypassed), so the loop is broken
--      with the same visible rows. Policies after the phase: 16 (18 before,
--      minus 5 write policies, plus 3 read twins; the recreated one is a swap).
--   3. Belt and braces, schema-wide: INSERT/UPDATE/DELETE/TRUNCATE revoked from
--      anon and authenticated on EVERY table in public, and the default
--      privileges of `postgres` (the role Prisma migrations create tables as)
--      no longer hand those four to anon/authenticated, so a future table is
--      born read-only for the API roles.
--      FUTURE WORK: a table that must be written from the browser needs an
--      explicit `GRANT INSERT|UPDATE|DELETE ... TO authenticated` in its own
--      SQL phase, plus a policy. Nothing today needs it.
--      Not touched: SELECT grants (beyond PHASE 21's session_samples column
--      grant), REFERENCES/TRIGGER grants, sequences, functions, service_role,
--      and default privileges of roles other than postgres (a table created
--      from the dashboard Table Editor as supabase_admin would still get the
--      Supabase defaults; the dry run reports them, line 4b).
--   4. A self-check at the end aborts the whole transaction (nothing applied)
--      if any non-SELECT policy, any `TO public USING (true)` policy or any
--      API-role write privilege is left in public.
--
-- Pre-flight (read-only; run first, SAVE BOTH OUTPUTS: they are the exact rollback):
--   -- (a) current policies; expect exactly these 18 (PHASE 21 applied):
--   select tablename, policyname, cmd, roles from pg_policies
--     where schemaname = 'public' order by 1, 2;
--   --   aggregate_scores.agg_select SELECT {authenticated}
--   --   coffee_shares.coffee_shares_select SELECT {public}
--   --   coffees.coffees_select SELECT {public}; coffees.coffees_write ALL {public}
--   --   cupping_sessions.sessions_select SELECT {public}
--   --   evaluations.evals_select_own, evals_select_owner SELECT {authenticated}
--   --   extrinsic_data.ext_select SELECT {authenticated}
--   --   group_posts.group_posts_select SELECT {public}; group_posts_write ALL {public}
--   --   physical_evaluations.phys_select SELECT {authenticated}
--   --   profiles.profiles_select SELECT {authenticated}
--   --   session_invites.invites_select_own SELECT {authenticated}
--   --   session_participants.participants_select SELECT {public}
--   --   session_samples.samples_select SELECT {public}
--   --   tasting_group_members.tasting_group_members_owner_all ALL {public}
--   --   tasting_groups.tasting_groups_owner_all ALL {public}
--   --   user_coffee_history.history_own ALL {public}
--   -- Anything else (an extra write policy, a missing one): stop and report.
--   -- (b) API-role write grants today, printed as the GRANT statements that
--   --     restore them (this output IS the grant half of the rollback):
--   select format('GRANT %s ON public.%I TO %I;',
--                 string_agg(DISTINCT a.privilege_type, ', '), c.relname, r.rolname)
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
--     cross join lateral aclexplode(c.relacl) a
--     join pg_roles r on r.oid = a.grantee and r.rolname in ('anon', 'authenticated')
--    where c.relkind in ('r', 'p', 'v', 'f')
--      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
--    group by c.relname, r.rolname order by 1;
--   -- expect: every public table EXCEPT PHASE 21's nine (evaluations,
--   -- aggregate_scores, cupping_sessions, session_samples, session_participants,
--   -- physical_evaluations, extrinsic_data, session_invites, profiles).
--   -- (c) default privileges of postgres in public (expect anon and authenticated
--   --     to hold arwdDxt or similar, i.e. the Supabase default):
--   select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl
--     from pg_default_acl where defaclnamespace = 'public'::regnamespace order by 1, 2, 3;
--   -- Supabase's own storage schema keeps its own defaults and is out of scope.
--
-- Dry run: prisma/sql/dry-runs/phase24_dry_run.sql (ONE DO statement, nothing
-- can be applied; one placeholder, the owner uuid). It ends in an intentional
-- error whose message lists every probe with its expected value.
--
-- How to verify after applying:
--   select tablename, policyname, cmd, roles from pg_policies
--     where schemaname = 'public' and (cmd <> 'SELECT' or roles <> '{authenticated}');
--     -- expect 0 rows
--   then Supabase Dashboard → Advisors → Security (no new findings), and the
--   two-account Realtime smoke test of runbook §10 step 5 (waiting room, cup,
--   results still update: sessions_select / evals_* are what Realtime reads).
-- Rollback: the commented block at the end of this phase.
-- ============================================================================
BEGIN;

-- >>> PHASE 24 statements (copied verbatim into phase24_dry_run.sql) >>>

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
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM coffees
    WHERE id = p_coffee_id AND "createdBy" = auth.uid()::text
  );
$$;
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

-- 4. Self-check (not copied into the dry run, whose probes 1a-1c check the
--    same things). Any failure aborts the transaction: nothing is applied.
DO $chk$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND cmd <> 'SELECT';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PHASE 24 aborted, nothing applied: % non-SELECT policies left in public', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND 'public' = ANY (roles) AND qual = 'true';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PHASE 24 aborted, nothing applied: % TO public USING (true) policies in public', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role)
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(priv)
   WHERE c.relkind IN ('r', 'p', 'v', 'f')
     AND has_table_privilege(r.role::name, c.oid, p.priv);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'PHASE 24 aborted, nothing applied: % API-role write privileges left in public', v_n;
  END IF;
END
$chk$;

COMMIT;

-- Rollback (restores exactly what was there before this phase; one transaction):
--   BEGIN;
--   -- grants: paste the output of pre-flight (b) here, e.g.
--   --   GRANT DELETE, INSERT, TRUNCATE, UPDATE ON public.coffees TO anon;
--   --   GRANT DELETE, INSERT, TRUNCATE, UPDATE ON public.coffees TO authenticated;
--   --   ...
--   -- default privileges (only if pre-flight (c) showed them for postgres in public):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO anon, authenticated;
--   ALTER POLICY "coffees_select" ON coffees TO public;
--   DROP POLICY IF EXISTS "coffee_shares_select" ON coffee_shares;
--   CREATE POLICY "coffee_shares_select" ON coffee_shares
--     FOR SELECT USING ("userId" = auth.uid()::text OR EXISTS (SELECT 1 FROM coffees c WHERE c.id = coffee_shares."coffeeId" AND c."createdBy" = auth.uid()::text));
--   DROP FUNCTION IF EXISTS public.is_coffee_owner(text);
--   ALTER POLICY "group_posts_select" ON group_posts TO public;
--   ALTER POLICY "sessions_select" ON cupping_sessions TO public;
--   ALTER POLICY "samples_select" ON session_samples TO public;
--   ALTER POLICY "participants_select" ON session_participants TO public;
--   DROP POLICY IF EXISTS "tasting_groups_select_own" ON tasting_groups;
--   CREATE POLICY "tasting_groups_owner_all" ON tasting_groups
--     FOR ALL USING ("createdBy" = auth.uid()::text);
--   DROP POLICY IF EXISTS "tasting_group_members_select_owner" ON tasting_group_members;
--   CREATE POLICY "tasting_group_members_owner_all" ON tasting_group_members
--     FOR ALL USING (
--       EXISTS (
--         SELECT 1 FROM tasting_groups
--         WHERE id = tasting_group_members."groupId"
--           AND "createdBy" = auth.uid()::text
--       )
--     );
--   DROP POLICY IF EXISTS "history_select_own" ON user_coffee_history;
--   CREATE POLICY "history_own" ON user_coffee_history
--     FOR ALL USING ("userId" = auth.uid()::text);
--   CREATE POLICY "group_posts_write" ON group_posts
--     FOR ALL USING (
--       EXISTS (
--         SELECT 1 FROM tasting_groups g
--         WHERE g.id = group_posts."groupId"
--           AND g."createdBy" = auth.uid()::text
--       )
--     );
--   CREATE POLICY "coffees_write" ON coffees
--     FOR ALL USING ("deletedAt" IS NULL AND "createdBy" = auth.uid()::text);
--   COMMIT;
-- ============================================================================

-- ============================================================================
-- PHASE 25 (2026-11-12, S9-02 / audit A-10): a participant can no longer read a
-- peer's exclusion state or reason through the API.
-- Apply via runbook §28, dry run first (prisma/sql/dry-runs/phase25_dry_run.sql).
-- The Supabase project is production (there is only one). NOT applied by the PR
-- that adds it: the owner applies it.
--
-- Why: participants_select (USING is_session_participant("sessionId")) lets every
-- member of a session read EVERY row of session_participants over PostgREST,
-- including excluded_from_results, excluded_at, excluded_by and exclusion_reason,
-- i.e. who the owner excluded from the results and why (a sample_error /
-- protocol / calibration label is a judgement about a named cupper). Read from
-- the policy, not demonstrated against production. The app reads this table with
-- Prisma as `postgres` (table owner, bypasses RLS and column privileges) and the
-- browser never queries it (verified 2026-11-12: no supabase-js .from()/.rpc()
-- call anywhere; supabase_realtime holds only evaluations and cupping_sessions),
-- so column privileges change nothing for the app.
--
-- Everything that touches session_participants (latest definition of each, read
-- from this file on 2026-11-12) and what it reads:
--   1. POLICY participants_select (PHASE 2; PHASE 24 made it TO authenticated).
--      Querying-role expression: is_session_participant("sessionId"). Reads
--      "sessionId" only. PHASE 21 dropped participants_write.
--   2. FUNCTION is_session_participant(text) (PHASE 2). SECURITY DEFINER. Reads
--      "sessionId", "userId". Called by participants_select, sessions_select,
--      samples_select and agg_select.
--   3. FUNCTION can_view_group_results(text) (PHASE 21). SECURITY DEFINER,
--      search_path pinned. Reads "sessionId" (two count(*) subqueries). Called by
--      agg_select.
--   4. FUNCTION/TRIGGER recompute_aggregate_score() (PHASE 2, 3, 4, 5, 6; latest
--      PHASE 23). SECURITY DEFINER, search_path pinned. Reads "sessionId",
--      "userId" AND excluded_from_results (the exclusion filter in both the
--      INCLUDED count and the SD query). Runs as its owner, never as the
--      querying role, so it keeps working with the column hidden.
--   5. FUNCTION is_session_owner(text) (PHASE 21): does NOT touch
--      session_participants (cupping_sessions only). evals_select_owner,
--      ext_select, phys_select, invites_select_own: no reference either.
--   No other policy, view or function in this file mentions the table.
-- Result: NO querying-role expression reads excluded_from_results (the only
-- consumers are SECURITY DEFINER), so it is HIDDEN along with the other three.
-- The only column a querying-role expression reads is "sessionId" (policy 1); the
-- GRANT below covers it, and dry-run probe 3 selects from every table whose
-- policy goes through these helpers, which is what would fail with "permission
-- denied" if a column had been missed.
--
-- Allowed to `authenticated`: "sessionId", "userId", status, "joinedAt".
-- Hidden from everyone over the API: excluded_from_results, excluded_at,
-- excluded_by, exclusion_reason.
-- RULE: a NEW column on session_participants needs an explicit
--   GRANT SELECT ("col") ON session_participants TO authenticated;
-- in a later phase, or API reads of that column fail (same rule as
-- session_samples after PHASE 21). Never grant the four hidden columns.
-- Consequence: `select=*` against /rest/v1/session_participants now errors with
-- "permission denied"; name the columns.
--
-- Pre-flight (read-only; run first, SAVE THE OUTPUT: it is the rollback):
--   -- (a) column list must still be exactly the 8 columns of the GRANT + hidden:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='session_participants' order by 1;
--     -- expect: excluded_at, excluded_by, excluded_from_results, exclusion_reason,
--     --         joinedAt, sessionId, status, userId
--   -- (b) current TABLE privileges for the API roles (Supabase default after
--   --     PHASE 21/24: SELECT/REFERENCES/TRIGGER, no writes):
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name='session_participants'
--       and grantee in ('anon','authenticated') order by 1,2;
--   -- (c) current COLUMN privileges (expect no rows: nothing column-level yet):
--   select grantee, column_name, privilege_type from information_schema.column_privileges
--     where table_schema='public' and table_name='session_participants'
--       and grantee in ('anon','authenticated') order by 1,2,3;
--   -- (d) the policy set on the table (expect participants_select SELECT {authenticated}):
--   select policyname, cmd, roles, qual from pg_policies
--     where schemaname='public' and tablename='session_participants';
--
-- Dry run: prisma/sql/dry-runs/phase25_dry_run.sql (ONE DO statement, nothing can
-- be applied; two placeholders, the owner uuid and a session id). It ends in an
-- intentional error whose message lists every probe with its expected value.
--
-- How to verify after applying:
--   select column_name, grantee from information_schema.column_privileges
--     where table_schema='public' and table_name='session_participants'
--       and grantee in ('anon','authenticated') and privilege_type='SELECT' order by 1;
--     -- expect exactly: joinedAt, sessionId, status, userId (all authenticated)
--   then the two-account smoke test of runbook §28 (waiting room, cup and results
--   still load; Supabase Advisors → Security shows nothing new).
-- Rollback: the commented block at the end of this phase.
-- ============================================================================
BEGIN;

-- >>> PHASE 25 statements (copied verbatim into phase25_dry_run.sql) >>>

-- Table-level SELECT goes; only the columns the API may show are granted back.
-- Hidden: excluded_from_results, excluded_at, excluded_by, exclusion_reason.
-- "joinedAt" is granted too: it is the only other column, and harmless.
REVOKE SELECT ON session_participants FROM anon, authenticated;
GRANT SELECT ("sessionId", "userId", status, "joinedAt")
  ON session_participants TO authenticated;

-- <<< end of PHASE 25 statements <<<

-- Self-check (not copied into the dry run, whose probes 1a-1c check the same
-- things). Any failure aborts the transaction: nothing is applied.
DO $chk$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['excluded_from_results', 'excluded_at', 'excluded_by', 'exclusion_reason'] LOOP
    IF has_column_privilege('authenticated', 'public.session_participants', v_col, 'SELECT')
       OR has_column_privilege('anon', 'public.session_participants', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'PHASE 25 aborted, nothing applied: % is still readable by an API role', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['sessionId', 'userId', 'status', 'joinedAt'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.session_participants', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'PHASE 25 aborted, nothing applied: % is not readable by authenticated', v_col;
    END IF;
  END LOOP;
END
$chk$;

COMMIT;

-- Rollback (restores table-level SELECT exactly as before; one transaction):
--   BEGIN;
--   REVOKE SELECT ("sessionId", "userId", status, "joinedAt")
--     ON session_participants FROM authenticated;
--   -- then the table-level grants saved from pre-flight (b), normally:
--   GRANT SELECT ON session_participants TO anon, authenticated;
--   COMMIT;
--   -- (anon had SELECT under the Supabase default; the policy never returned
--   --  rows to it. Grant it back only if pre-flight (b) listed it.)
-- ============================================================================

-- ============================================================================
-- PHASE 26 (2026-11-13, S10 WP1a): the flat CVA deduction at ANY cup count,
-- shared across everyone's cups and diluted beyond five pooled cups.
-- Spec: docs/product/cata-descentralizada-puntaje.md (overrides S8-04 / PHASE 23).
-- Apply via runbook §30, dry run first (prisma/sql/dry-runs/phase26_dry_run.sql).
-- The Supabase project is production (there is only one). NOT applied by the PR
-- that adds it: the owner applies it, on an explicit yes, AFTER
-- `npx prisma migrate deploy` added evaluations."cups" (migration
-- 20261113090000_evaluation_cups).
--
-- Why: the score that existed before S8 was right in principle and had bugs;
-- S8-04 / PHASE 23 removed the deductions below five cups instead of fixing them.
-- This goes back to the principle (flagged cups cost points at any cup count;
-- everyone's cups share the deduction) and fixes three bugs: (1) a cupper with
-- fewer than five cups saw no deduction; (2) with fewer than five pooled cups
-- the stored group score AMPLIFIED the deduction (10 / total_cups, 30 /
-- total_cups: 1 defective cup of 2 cost 20 points); (3) a defective cup is also
-- flagged non-uniform by the form, so the old 10 + 30 per total cups counted it
-- twice (8 points for 1 of 5, against 6 in the CVA and in the individual score).
--
-- The rule (same arithmetic, same operation order as lib/scoring.ts cupDeduction;
-- tests/scoringConsistency.test.ts ports it and tests/db/aggregate.dbtest.ts
-- runs this function against computeGroupAggregate):
--   factor            = 5 / max(5, pooled cups)
--   uniformityPenalty = 2 * non-uniform * factor   (only evaluations with 2+ cups)
--   defectPenalty     = 4 * defective  * factor
--   score             = clamp(0..100, round to 0.25 (base - both penalties))
-- Pooled cups = SUM over the INCLUDED evaluations of evaluations."cups" (NULL
-- falls back to the session's cupsPerSample, so the stored value is right under
-- the old app code too: that is why the order in the runbook is migrate, SQL,
-- then deploy). Flag counts are clamped to each evaluation's cups.
--
-- Rule versions: evaluations."cups" IS NULL means "scored before the 2026-11 rule"
-- (v1; the migration does NOT backfill it) and aggregate_scores."ruleVersion" is 1
-- until this function recomputes the sample (then 2). The app shows each stored
-- score under the rule its data says, so past results render unchanged. A re-fire
-- of an old sample (exclusion after close, repair) recomputes it under this rule
-- and stamps ruleVersion 2: intended.
--
-- Nothing stored is recomputed by this phase: it only re-issues the function, so
-- aggregate_scores keeps what the old function computed until an evaluation is
-- next submitted or edited (owner's decision: scores stored before the deploy
-- are NOT recomputed; PHASE 23 STEP 2 is cancelled).
--
-- Pre-flight (read-only):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='evaluations' and column_name='cups'; -- 1 row
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='aggregate_scores' and column_name='ruleVersion'; -- 1 row
--   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure);
--     -- must still be the PHASE 23 body ("v_cups_per_sample >= 5", no "v_factor")
-- Post-apply check:
--   select proconfig from pg_proc where proname = 'recompute_aggregate_score';  -- {search_path=public}
--   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure) like '%v_factor%';  -- t
--   select count(*) from aggregate_scores where "computedAt" > now() - interval '10 minutes';  -- 0 (nothing recomputed)
-- ============================================================================
-- Guard (not copied into the dry run, which has its own): refuse to run before
-- the evaluation_cups migration (evaluations."cups" AND aggregate_scores."ruleVersion"),
-- because the trigger would then fail on the next submit with `column ... does not exist`.
DO $chk$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'evaluations' AND column_name = 'cups')
          OR (table_name = 'aggregate_scores' AND column_name = 'ruleVersion'))) <> 2 THEN
    RAISE EXCEPTION 'PHASE 26 aborted, nothing applied: evaluations.cups and/or aggregate_scores."ruleVersion" is missing (run npx prisma migrate deploy first)';
  END IF;
END
$chk$;

-- >>> PHASE 26 statements (copied verbatim into phase26_dry_run.sql) >>>
-- PHASE 26: the flat CVA deduction at ANY cup count, diluted by 5 / pooled cups
-- beyond five. Differences from the PHASE 23 body, and only these: (1) the
-- per-evaluation values (cups, non-uniform count, defective count) are computed
-- in a subquery and then pooled over the INCLUDED (complete) evaluations;
-- (2) v_total_cups is the SUM of those cups, not cupsPerSample x participants;
-- (3) the deduction is 2 x non-uniform x factor and 4 x defective x factor with
-- factor = 5 / GREATEST(5, v_total_cups). No `>= 5` gate. Everything else
-- (SECURITY DEFINER, search_path, exclusion filter, is_affective_complete,
-- attrAverages, INSERT ... ON CONFLICT) is unchanged, except that the upsert now
-- also writes "ruleVersion" = 2 (INSERT and ON CONFLICT UPDATE): a sample the
-- trigger (re)computes says it was scored under this rule; rows it does not
-- touch keep ruleVersion 1 and the screen keeps showing them under the old rule.
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
-- <<< end of PHASE 26 statements <<<

-- ROLLBACK: re-create the PHASE 23 function body (below). It differs from the
-- original PHASE 23 text in ONE way: it writes "ruleVersion" = 1 in the INSERT
-- and in the ON CONFLICT UPDATE, because the column survives a rollback and a
-- sample re-fired under this body must read as the old rule. Stored scores are
-- not touched by either direction; rows already stamped 2 keep that stamp until
-- they are re-fired under this body.
--   CREATE OR REPLACE FUNCTION recompute_aggregate_score()
--   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   DECLARE
--     v_session_id         text;
--     v_cups_per_sample    int;
--     v_format             text;
--     v_participant_count  int;   -- INCLUDED (complete) evaluations
--     v_submitted_count    int;   -- all submitted, non-excluded evaluations
--     v_total_cups         int;
--     v_avg_raw            float;
--     v_total_non_uniform  int;
--     v_total_defective    int;
--     v_uniformity_penalty float;
--     v_defect_penalty     float;
--     v_community_score    float;
--     v_attr_averages      jsonb;
--     v_json_col           text;
--   BEGIN
--     -- Get sessionId, cupsPerSample and format from parent session
--     SELECT ss."sessionId", cs."cupsPerSample", cs.format
--       INTO v_session_id, v_cups_per_sample, v_format
--     FROM session_samples ss
--     JOIN cupping_sessions cs ON cs.id = ss."sessionId"
--     WHERE ss.id = NEW."sessionSampleId";
--
--     -- Pick which JSON column holds affective data
--     v_json_col := CASE WHEN v_format = 'affective' THEN 'affectiveData' ELSE 'combinedData' END;
--
--     -- Aggregate over submitted, NON-EXCLUDED evaluations. Score/penalty metrics use
--     -- a FILTER so only COMPLETE evaluations contribute; submittedCount counts all.
--     SELECT
--       COUNT(*) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END))::int,
--       COUNT(*)::int,
--       AVG("rawScore") FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)),
--       COALESCE(SUM((
--         SELECT COUNT(*) FROM unnest("nonUniformCups") AS t(u) WHERE u = true
--       )::int) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0),
--       COALESCE(SUM((
--         SELECT COUNT(*) FROM unnest("defectiveCups") AS d(v) WHERE v = true
--       )::int) FILTER (WHERE is_affective_complete(
--         CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END)), 0)
--     INTO v_participant_count, v_submitted_count, v_avg_raw, v_total_non_uniform, v_total_defective
--     FROM evaluations e
--     WHERE e."sessionSampleId" = NEW."sessionSampleId" AND e."isDraft" = false
--       AND NOT EXISTS (
--         SELECT 1 FROM session_participants sp
--         WHERE sp."sessionId" = v_session_id
--           AND sp."userId" = e."cupperId"
--           AND sp.excluded_from_results = true
--       );
--
--     -- totalCups uses the INCLUDED count so penalties normalize over real cups only.
--     v_total_cups := v_cups_per_sample * v_participant_count;
--
--     -- S8-04: deductions only from 5 cups per sample (mirror of penaltiesApply() in
--     -- lib/scoring.ts). Below that the stored community score is the plain average.
--     IF v_cups_per_sample >= 5 AND v_total_cups > 0 THEN
--       v_uniformity_penalty := v_total_non_uniform::float * (10.0 / v_total_cups);
--       v_defect_penalty     := v_total_defective::float  * (30.0 / v_total_cups);
--     ELSE
--       v_uniformity_penalty := 0;
--       v_defect_penalty     := 0;
--     END IF;
--
--     -- N4: round the final community score to the nearest 0.25 (was ROUND(..., 2)).
--     v_community_score := GREATEST(0, LEAST(100,
--       ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric * 4) / 4
--     ));
--
--     -- Per-attribute averages over submitted, NON-EXCLUDED, COMPLETE evaluations.
--     SELECT jsonb_build_object(
--       'Fragancia',        ROUND(AVG(NULLIF((e.data->>'fragancia_af_final'),   '')::numeric), 2),
--       'Aroma',            ROUND(AVG(NULLIF((e.data->>'aroma_af_final'),        '')::numeric), 2),
--       'Sabor',            ROUND(AVG(NULLIF((e.data->>'sabor_af_final'),        '')::numeric), 2),
--       'Sabor residual',   ROUND(AVG(NULLIF((e.data->>'sabor_residual_af_final'),'')::numeric), 2),
--       'Acidez',           ROUND(AVG(NULLIF((e.data->>'acidez_af_final'),       '')::numeric), 2),
--       'Dulzor',           ROUND(AVG(NULLIF((e.data->>'dulzor_af_final'),       '')::numeric), 2),
--       'Sensación en boca',ROUND(AVG(NULLIF((e.data->>'sensacion_af_final'),    '')::numeric), 2),
--       'Impresión global', ROUND(AVG(NULLIF((e.data->>'impresion_global_final'),'')::numeric), 2)
--     )
--     INTO v_attr_averages
--     FROM (
--       SELECT CASE v_json_col
--         WHEN 'affectiveData' THEN "affectiveData"
--         ELSE "combinedData"
--       END AS data
--       FROM evaluations ev
--       WHERE ev."sessionSampleId" = NEW."sessionSampleId" AND ev."isDraft" = false
--         AND is_affective_complete(
--           CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)
--         AND NOT EXISTS (
--           SELECT 1 FROM session_participants sp
--           WHERE sp."sessionId" = v_session_id
--             AND sp."userId" = ev."cupperId"
--             AND sp.excluded_from_results = true
--         )
--     ) e;
--
--     INSERT INTO aggregate_scores (
--       id,
--       "sessionSampleId", "participantCount", "submittedCount", "cupsPerSample", "totalCups",
--       "avgRawScore", "totalNonUniform", "totalDefective",
--       "uniformityPenalty", "defectPenalty", "communityScore",
--       "attrAverages", "computedAt", "ruleVersion"
--     ) VALUES (
--       gen_random_uuid()::text,
--       NEW."sessionSampleId", v_participant_count, v_submitted_count, v_cups_per_sample, v_total_cups,
--       v_avg_raw, v_total_non_uniform, v_total_defective,
--       v_uniformity_penalty, v_defect_penalty, v_community_score,
--       COALESCE(v_attr_averages, '{}'::jsonb), now(), 1
--     )
--     ON CONFLICT ("sessionSampleId") DO UPDATE SET
--       "participantCount"  = EXCLUDED."participantCount",
--       "submittedCount"    = EXCLUDED."submittedCount",
--       "cupsPerSample"     = EXCLUDED."cupsPerSample",
--       "totalCups"         = EXCLUDED."totalCups",
--       "avgRawScore"       = EXCLUDED."avgRawScore",
--       "totalNonUniform"   = EXCLUDED."totalNonUniform",
--       "totalDefective"    = EXCLUDED."totalDefective",
--       "uniformityPenalty" = EXCLUDED."uniformityPenalty",
--       "defectPenalty"     = EXCLUDED."defectPenalty",
--       "communityScore"    = EXCLUDED."communityScore",
--       "attrAverages"      = EXCLUDED."attrAverages",
--       "computedAt"        = EXCLUDED."computedAt",
--       "ruleVersion"       = EXCLUDED."ruleVersion";
--
--     RETURN NEW;
--   END;
--   $$;
-- ============================================================================
