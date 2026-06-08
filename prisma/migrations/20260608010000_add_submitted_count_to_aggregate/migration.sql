-- Add "submittedCount" to aggregate_scores: the Y in "X of Y participants
-- included in average". "participantCount" is the X (complete evaluations only);
-- "submittedCount" counts all submitted, non-excluded evaluations.
-- The aggregate trigger (prisma/sql/rls_and_triggers.sql, Phase 5) writes this
-- column; apply that trigger block manually via the Supabase SQL editor after
-- this migration.

-- AlterTable
ALTER TABLE "aggregate_scores"
  ADD COLUMN "submittedCount" INTEGER NOT NULL DEFAULT 0;
