-- S8-03 outbound email ledger (2026-11-10). Additive only:
--   * outbound_email_events   — one row per reserved send; the throttle in
--                               lib/emailBudget.ts counts these. No user FK:
--                               actorKey is "u_<userId>" or an HMAC of the IP,
--                               targetKey an HMAC of the address (never raw).
--   * group_email_deliveries  — per-recipient ledger of a group broadcast
--                               (same shape as close_email_deliveries), so
--                               "retry failed" resends non-sent rows only.
--   * tasting_groups.clientKey — idempotency key of the create-group dialog.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy, then enable RLS on
-- the two new tables (prisma/sql/rls_and_triggers.sql, runbook).

-- AlterTable
ALTER TABLE "tasting_groups" ADD COLUMN     "clientKey" TEXT;

-- CreateTable
CREATE TABLE "outbound_email_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKey" TEXT,
    "targetKey" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_email_deliveries" (
    "broadcastId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_email_deliveries_pkey" PRIMARY KEY ("broadcastId","memberId")
);

-- CreateIndex
CREATE INDEX "outbound_email_events_kind_actorKey_createdAt_idx" ON "outbound_email_events"("kind", "actorKey", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_email_events_kind_targetKey_createdAt_idx" ON "outbound_email_events"("kind", "targetKey", "createdAt");

-- CreateIndex
CREATE INDEX "group_email_deliveries_memberId_idx" ON "group_email_deliveries"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "tasting_groups_clientKey_key" ON "tasting_groups"("clientKey");

-- AddForeignKey
ALTER TABLE "group_email_deliveries" ADD CONSTRAINT "group_email_deliveries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "tasting_group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
