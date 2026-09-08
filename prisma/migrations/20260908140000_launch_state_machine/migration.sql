-- Launch state machine (2026-09-08). Additive only:
--   * cupping_sessions.closedAt — stamped by lib/closeSession.ts
--   * close_email_deliveries    — per-recipient close-email idempotency ledger
--   * user_coffee_history       — outlives its session: session/evaluation FKs
--                                 become nullable SET NULL, plus snapshot/detachedAt
-- Generated from `prisma migrate diff --from-config-datasource --to-schema`
-- against production on 2026-09-08 (a pre-existing `startedAt` precision
-- no-op was dropped from the output).

-- DropForeignKey
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_evaluationId_fkey";

-- DropForeignKey
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_sessionId_fkey";

-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_coffee_history" ADD COLUMN     "detachedAt" TIMESTAMP(3),
ADD COLUMN     "snapshot" JSONB,
ALTER COLUMN "evaluationId" DROP NOT NULL,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "close_email_deliveries" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "close_email_deliveries_pkey" PRIMARY KEY ("sessionId","userId")
);

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_email_deliveries" ADD CONSTRAINT "close_email_deliveries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
