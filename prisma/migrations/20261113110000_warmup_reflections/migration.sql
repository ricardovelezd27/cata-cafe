-- S10 WP7 (2026-11-13, Kim F2): private reflections after a Movimiento Sensorial exercise.
-- Additive: one new table, no change to an existing one.
--   * warmup_reflections
--       one row per saved pair of answers to the two closing questions. userId is a
--       Restrict FK to profiles (account deletion erases the rows explicitly, see
--       lib/accountDeletion/deleteAccount.ts). Nothing else ever reads it.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 31),
-- then PHASE 27 of prisma/sql/rls_and_triggers.sql (runbook section 31).

-- CreateTable
CREATE TABLE "warmup_reflections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "feel" TEXT,
    "discovery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warmup_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warmup_reflections_userId_exerciseId_createdAt_idx" ON "warmup_reflections"("userId", "exerciseId", "createdAt");

-- AddForeignKey
ALTER TABLE "warmup_reflections" ADD CONSTRAINT "warmup_reflections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
