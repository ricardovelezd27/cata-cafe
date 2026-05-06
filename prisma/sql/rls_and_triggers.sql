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