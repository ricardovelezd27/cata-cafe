-- S10 WP2 (2026-11-13): per-sample preparation data (A9) and the reference mode (B1).
-- Additive and backwards compatible: nullable columns plus two columns with a
-- constant default (metadata-only in Postgres 11+, no table rewrite). No trigger,
-- function, policy, index or FK is created or touched.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 29):
-- the regenerated Prisma client selects these columns immediately.
--
--   * session_samples."roastDate"        optional roast date of the sample (DATE)
--   * session_samples."preparationNote"  optional free note (water, ratio, grind)
--   * session_samples."offProtocol"      "cupped outside protocol" tick (default false)
--   * session_samples."offProtocolNote"  optional note for that tick
--       BLIND DATA: these four can identify a coffee, so they are owner-only until the
--       sample is revealed. They are deliberately NOT added to the PHASE 21 column
--       GRANT SELECT on session_samples, so the browser key cannot read them (like
--       "coffeeId"); only Prisma (postgres role) does, behind the TypeScript gates.
--   * cupping_sessions."referenceMode"   'anchor' (today's pinned reference, the
--       default for every existing row) or 'free' (everyone scores the reference
--       like any other sample). cupping_sessions has no column grants, so nothing
--       to add there.
-- Scoring, trg_recompute_aggregate and aggregate_scores never read any of these.

-- AlterTable
ALTER TABLE "session_samples"
  ADD COLUMN "roastDate" DATE,
  ADD COLUMN "preparationNote" TEXT,
  ADD COLUMN "offProtocol" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offProtocolNote" TEXT;

-- AlterTable
ALTER TABLE "cupping_sessions"
  ADD COLUMN "referenceMode" TEXT NOT NULL DEFAULT 'anchor';
