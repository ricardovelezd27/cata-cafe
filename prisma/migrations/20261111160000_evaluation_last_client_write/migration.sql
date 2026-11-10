-- S8-18 (2026-11-10, S8-09 step 1, F-offline-2): server-side ordering of offline writes.
-- Additive and backwards compatible: one NULLABLE column, no default, no index, no FK.
--   * evaluations."lastClientWriteAt"
--       the newest client edit time (ms epoch of the cupper's edit on the device)
--       accepted for the row; an OLDER write arriving later is ignored.
--       Ordering metadata only: scoring, trg_recompute_aggregate and aggregate_scores never read it.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 23).

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN "lastClientWriteAt" TIMESTAMPTZ(3);
