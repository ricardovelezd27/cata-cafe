-- S10 WP1a (2026-11-13): the number of cups each evaluation covers.
-- Additive and backwards compatible: one NULLABLE column, no default, no index, no FK.
--   * evaluations."cups"
--       cups this evaluation covers; the app writes it on every save. The PHASE 26
--       trigger pools it across a sample's included evaluations and falls back to
--       the session's "cupsPerSample" while it is NULL, so the stored score is
--       right under both old and new app code.
-- The backfill UPDATE names only "cups": trg_recompute_aggregate is
-- AFTER INSERT OR UPDATE OF "isDraft", so it does NOT fire and no stored score
-- is recomputed.
-- Apply with `npx prisma migrate deploy` BEFORE PHASE 26 and before the deploy
-- (runbook section 30).

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN "cups" INTEGER;

-- Backfill from the session's cups per sample.
UPDATE "evaluations" e SET "cups" = cs."cupsPerSample"
FROM "session_samples" ss JOIN "cupping_sessions" cs ON cs.id = ss."sessionId"
WHERE ss.id = e."sessionSampleId";
