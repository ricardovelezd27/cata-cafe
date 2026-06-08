-- Add per-participant "exclude from results" flag. When true, the participant's
-- evaluations are dropped from group aggregates, descriptor frequency and charts.
-- The aggregate trigger (prisma/sql/rls_and_triggers.sql, Phase 4) reads this column;
-- apply that trigger block manually via the Supabase SQL editor after this migration.

-- AlterTable
ALTER TABLE "session_participants"
  ADD COLUMN "excluded_from_results" BOOLEAN NOT NULL DEFAULT false;
