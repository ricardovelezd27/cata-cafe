-- S10 WP1 step 1: READ-ONLY impact list. One SELECT, no writes, no temp tables.
-- Per flagged sample: stored session score vs the score under the new rule
--   deduction = (4 x defective + 2 x nonUniform) x 5 / max(5, pooled cups)
-- Per flagged evaluation: stored individual score vs flat CVA deduction.
-- Ids are truncated; no names, no user ids. Nothing is recomputed (owner's decision).
WITH ev AS (
  SELECT
    e.id,
    e."sessionSampleId"                         AS sid,
    ss."sessionId"                              AS sess,
    cs."cupsPerSample"                          AS cps,
    cs.status,
    e."rawScore",
    e."individualScore",
    is_affective_complete(
      CASE WHEN cs.format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END
    )                                           AS inc,
    CASE WHEN cs."cupsPerSample" >= 2
         THEN LEAST((SELECT count(*) FROM unnest(e."nonUniformCups") AS t(u) WHERE u)::int, cs."cupsPerSample")
         ELSE 0 END                             AS nu,
    LEAST((SELECT count(*) FROM unnest(e."defectiveCups") AS t(d) WHERE d)::int, cs."cupsPerSample") AS df,
    (SELECT count(*) FROM unnest(e."nonUniformCups") AS t(u) WHERE u)::int
      + (SELECT count(*) FROM unnest(e."defectiveCups") AS t(d) WHERE d)::int AS flags_raw
  FROM evaluations e
  JOIN session_samples ss  ON ss.id = e."sessionSampleId"
  JOIN cupping_sessions cs ON cs.id = ss."sessionId"
  WHERE e."isDraft" = false
    AND cs.format <> 'descriptive'
    AND NOT EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp."sessionId" = ss."sessionId"
        AND sp."userId" = e."cupperId"
        AND sp.excluded_from_results = true
    )
),
samp AS (
  SELECT
    sid, sess, cps, status,
    count(*) FILTER (WHERE inc)                        AS n,
    avg("rawScore") FILTER (WHERE inc)                 AS avg_raw,
    coalesce(sum(nu)  FILTER (WHERE inc), 0)           AS u,
    coalesce(sum(df)  FILTER (WHERE inc), 0)           AS d,
    coalesce(sum(cps) FILTER (WHERE inc), 0)           AS cups,
    sum(flags_raw)                                     AS flags_raw
  FROM ev
  GROUP BY sid, sess, cps, status
),
samp_out AS (
  SELECT
    left(s.sess, 8) AS session, left(s.sid, 8) AS sample, s.status, s.cps, s.n, s.cups, s.u, s.d,
    a."communityScore" AS stored,
    CASE WHEN s.n = 0 THEN NULL ELSE
      GREATEST(0, LEAST(100, ROUND((
        s.avg_raw
        - 2.0 * s.u * (5.0 / GREATEST(5, s.cups))
        - 4.0 * s.d * (5.0 / GREATEST(5, s.cups))
      )::numeric * 4) / 4))
    END AS new_rule
  FROM samp s
  LEFT JOIN aggregate_scores a ON a."sessionSampleId" = s.sid
  WHERE s.flags_raw > 0
),
ev_out AS (
  SELECT
    left(sess, 8) AS session, left(sid, 8) AS sample, left(id, 8) AS evaluation, cps, nu, df,
    "individualScore" AS stored,
    GREATEST(0, LEAST(100, ROUND(("rawScore" - 2.0 * nu - 4.0 * df)::numeric * 4) / 4)) AS new_rule
  FROM ev
  WHERE flags_raw > 0 AND "rawScore" IS NOT NULL
)
SELECT
  (SELECT count(*) FROM samp_out)                                                    AS flagged_samples,
  (SELECT count(*) FROM samp_out WHERE stored IS DISTINCT FROM new_rule)             AS samples_that_would_differ,
  (SELECT count(*) FROM ev_out)                                                      AS flagged_evaluations,
  (SELECT count(*) FROM ev_out WHERE stored IS DISTINCT FROM new_rule)               AS evaluations_that_would_differ,
  (SELECT json_agg(row_to_json(o) ORDER BY o.session, o.sample) FROM samp_out o)     AS samples,
  (SELECT json_agg(row_to_json(o) ORDER BY o.session, o.sample) FROM ev_out o)       AS evaluations;
