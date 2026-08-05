-- Solo-session lifecycle backfill (data-only migration).
-- Pre-fix, solo sessions could never leave "draft": no close UI existed for
-- them, so closeSession/syncCoffeeHistory never ran and solo evaluations never
-- produced user_coffee_history rows. The app now creates solo sessions as
-- "active" and auto-closes them once every sample has a submitted evaluation
-- (app/actions/community.ts maybeAutoCloseSoloSession). This migration
-- reconciles existing rows. Idempotent — safe to re-run.
-- Companion: scripts/backfill-solo-history.ts (run once after this applies)
-- populates user_coffee_history for the sessions closed here.

-- 1) Close solo sessions where the owner has a submitted evaluation for EVERY
--    sample (the same completeness rule the app now applies).
UPDATE cupping_sessions s
SET status = 'closed'
WHERE s."isGroup" = false
  AND s.status <> 'closed'
  AND EXISTS (SELECT 1 FROM session_samples ss WHERE ss."sessionId" = s.id)
  AND NOT EXISTS (
    SELECT 1
    FROM session_samples ss
    LEFT JOIN evaluations e
      ON e."sessionSampleId" = ss.id
     AND e."cupperId" = s."createdBy"
     AND e."isDraft" = false
    WHERE ss."sessionId" = s.id
      AND e.id IS NULL
  );

-- 2) Reveal coffee-linked samples of closed solo sessions — solo blind ends at
--    submit, and the history sync only reads revealed samples.
UPDATE session_samples ss
SET revealed = true
FROM cupping_sessions s
WHERE s.id = ss."sessionId"
  AND s."isGroup" = false
  AND s.status = 'closed'
  AND ss."coffeeId" IS NOT NULL
  AND ss.revealed = false;

-- 3) Remaining open solo sessions: "draft" is meaningless for solo — align to
--    the new lifecycle (active → closed).
UPDATE cupping_sessions
SET status = 'active'
WHERE "isGroup" = false
  AND status NOT IN ('active', 'closed');
