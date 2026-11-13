-- S10 WP5a (2026-11-15, F-cafes-9, review M1): when a coffee's ORIGIN data last changed.
-- Additive and backwards compatible: one nullable column, no default, no backfill
-- (NULL = no origin edit recorded), so no table rewrite. No trigger, function,
-- policy, index or FK is created or touched. Old code ignores the column.
-- Apply with `npx.cmd prisma migrate deploy` BEFORE the merge/deploy (runbook
-- section 34): the regenerated Prisma client selects it immediately.
--
--   * coffees."originEditedAt"  stamped by updateCoffee / updateSampleMetadata only
--     when an origin field (lib/coffeeOrigin.ts COFFEE_ORIGIN_FIELDS) really changes.
--     Read by the "Datos de origen editados el" note of the results page, the CVA
--     sheet, the participant summary / ficha stamps, the coffee profile and ficha.
--
-- coffees has no column grants (the API roles are read-only, PHASE 24), so no SQL
-- phase is needed. Scoring, trg_recompute_aggregate and aggregate_scores never read it.

ALTER TABLE "coffees" ADD COLUMN "originEditedAt" TIMESTAMPTZ(3);

-- Rollback (only if nothing depends on it yet):
--   ALTER TABLE "coffees" DROP COLUMN "originEditedAt";
