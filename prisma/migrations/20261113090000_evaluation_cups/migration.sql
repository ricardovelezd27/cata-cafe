-- S10 WP1a (2026-11-13): which cup-deduction rule each stored score was computed under.
-- Additive and backwards compatible; NO backfill and NO trigger fires.
--   * evaluations."cups"  (nullable, no default)
--       cups this evaluation covers; the app writes it on every save. It is left NULL
--       on existing rows ON PURPOSE: NULL means "scored before the 2026-11 rule" and
--       the app keeps showing those evaluations under the old rule, so past results
--       render unchanged. The PHASE 26 trigger reads COALESCE("cups", cupsPerSample).
--   * aggregate_scores."ruleVersion"  (INTEGER NOT NULL DEFAULT 1)
--       1 = computed under the rule before 2026-11; the PHASE 26 function stamps 2
--       whenever it (re)computes a sample. Existing rows therefore stay 1.
-- Apply with `npx prisma migrate deploy` BEFORE PHASE 26 and before the deploy
-- (runbook section 30).

-- ONE explicit transaction (third review M-A): `prisma migrate deploy` sends this file statement by
-- statement in autocommit, so without BEGIN/COMMIT the SET LOCAL below does nothing and the two
-- ALTERs would commit separately (a failure on the second would leave the first applied).
-- Both ALTERs are metadata-only but each takes a brief exclusive lock: fail fast instead of queueing behind a long transaction.
-- SET LOCAL, not SET: a plain SET leaks into the next migrations of the same deploy run (second review M3).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN "cups" INTEGER;

-- AlterTable
ALTER TABLE "aggregate_scores" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1;

COMMIT;
