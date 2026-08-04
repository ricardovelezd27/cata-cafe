-- Coffee: isPublic (boolean) → visibility (text, "private" | "shared" | "public").
-- The live coffees_select RLS policy references "isPublic", so it must be
-- dropped before the column; it is recreated with visibility + share semantics
-- in prisma/sql/rls_and_triggers.sql PHASE 15 (applied manually).
DROP POLICY IF EXISTS "coffees_select" ON "coffees";
DROP INDEX IF EXISTS "coffees_isPublic_idx";
ALTER TABLE "coffees" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
UPDATE "coffees" SET "visibility" = 'public' WHERE "isPublic" = true;
ALTER TABLE "coffees" DROP COLUMN "isPublic";
CREATE INDEX "coffees_visibility_idx" ON "coffees"("visibility");

-- CreateTable
CREATE TABLE "coffee_shares" (
    "coffeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coffee_shares_pkey" PRIMARY KEY ("coffeeId","userId")
);

-- CreateTable
CREATE TABLE "coffee_invites" (
    "id" TEXT NOT NULL,
    "coffeeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coffee_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coffee_shares_userId_idx" ON "coffee_shares"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "coffee_invites_token_key" ON "coffee_invites"("token");

-- CreateIndex
CREATE INDEX "coffee_invites_coffeeId_idx" ON "coffee_invites"("coffeeId");

-- AddForeignKey
ALTER TABLE "coffee_shares" ADD CONSTRAINT "coffee_shares_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coffee_shares" ADD CONSTRAINT "coffee_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coffee_invites" ADD CONSTRAINT "coffee_invites_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coffee_invites" ADD CONSTRAINT "coffee_invites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
