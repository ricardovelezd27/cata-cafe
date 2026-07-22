-- Denormalize evaluations.sessionId from session_samples.sessionId so server-side
-- Realtime subscriptions can filter with `sessionId=eq.<id>` instead of relying on
-- client-side filtering only. Nullable so old deployed code (rolling deploys)
-- keeps writing rows without it; new writes always set it, and updates heal old
-- NULL rows over time.

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "evaluations_sessionId_idx" ON "evaluations"("sessionId");

-- Backfill existing rows from their session sample's sessionId.
UPDATE "evaluations" SET "sessionId" = ss."sessionId" FROM "session_samples" ss WHERE ss."id" = "evaluations"."sessionSampleId" AND "evaluations"."sessionId" IS NULL;
