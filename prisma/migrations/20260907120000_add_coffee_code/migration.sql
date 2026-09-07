-- Short human-shareable coffee code (6 chars, A-Z/2-9 minus lookalikes; see
-- lib/coffeeCode.ts). Nullable until scripts/backfill-coffee-codes.ts stamps
-- legacy rows; new rows get a code at every create path.
ALTER TABLE "coffees" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "coffees_code_key" ON "coffees"("code");
