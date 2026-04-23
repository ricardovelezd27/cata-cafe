-- Add altitude and roast level fields to coffees table
ALTER TABLE "coffees" ADD COLUMN IF NOT EXISTS "altitude" TEXT;
ALTER TABLE "coffees" ADD COLUMN IF NOT EXISTS "roastLevel" TEXT;
