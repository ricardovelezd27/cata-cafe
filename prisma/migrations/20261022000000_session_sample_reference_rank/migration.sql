-- Multi-reference (S6): references accumulate instead of replace.
-- referenceRank: NULL = not a reference; 1, 2, 3 = order in which they were named.
-- CuppingSession.referenceSampleId stays = the ACTIVE reference (highest rank).
-- Additive; no scoring / trigger / aggregate_scores impact.
ALTER TABLE "session_samples" ADD COLUMN "referenceRank" INTEGER;

-- Backfill: the existing single reference becomes rank 1.
UPDATE "session_samples" s
SET "referenceRank" = 1
FROM "cupping_sessions" c
WHERE c."referenceSampleId" = s."id";

-- Postgres treats NULLs as distinct, so non-reference samples never collide.
CREATE UNIQUE INDEX "session_samples_sessionId_referenceRank_key"
  ON "session_samples"("sessionId", "referenceRank");
