-- Anonymizing soft delete for coffees (2026-09-26). Additive only:
--   * coffees.deletedAt — set by deleteCoffees (app/actions/coffees.ts) when
--     the OWNER deletes a coffee. Identifying fields (name, code, farm,
--     producer, notes, certifications) are wiped in the same statement; the
--     row itself stays so evaluations, aggregate scores, session samples and
--     user_coffee_history keep their link to the analytical attributes
--     (country, variety, process, altitude, harvest, roast).
--   * usableCoffeeWhere (lib/coffeeAccess.ts) hides deleted rows from every
--     list / picker / profile read.

-- AlterTable
ALTER TABLE "coffees" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "coffees_deletedAt_idx" ON "coffees"("deletedAt");
