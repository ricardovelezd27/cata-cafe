-- S8-14 digest claim-first (2026-11-11), F-insights-3. Additive only:
--   * status   "running" while a digest invocation holds the period, "done" after.
--              Existing rows are complete runs, so the default is 'done'.
--   * results  per-recipient outcome JSON, e.g. {"admin@x.co":"sent"}; nullable.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook §19).
-- Written by hand; NOT applied by the PR.

-- AlterTable
ALTER TABLE "digest_runs" ADD COLUMN     "results" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'done';
