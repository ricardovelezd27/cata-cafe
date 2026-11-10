-- S8-05 close lifecycle (2026-11-11). Additive only:
--   * cupping_sessions.closesAtZone      — IANA zone of the owner when the
--                                          closing date was set (null = UTC).
--   * cupping_sessions.closeFinalizedAt  — phase 2 of the close finished.
--                                          Backfilled to closedAt below so the
--                                          repair pass ignores history.
--   * session_reminder_deliveries        — ledger of deadline_24h / live_idle
--                                          reminders. No user FK (like
--                                          close_email_deliveries).
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 13).

-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN     "closesAtZone" TEXT,
ADD COLUMN     "closeFinalizedAt" TIMESTAMPTZ(3);

-- Backfill: every session that is already closed counts as finalized.
UPDATE "cupping_sessions"
SET "closeFinalizedAt" = COALESCE("closedAt", "updatedAt")
WHERE "status" = 'closed' AND "closeFinalizedAt" IS NULL;

-- CreateTable
CREATE TABLE "session_reminder_deliveries" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_reminder_deliveries_pkey" PRIMARY KEY ("sessionId","userId","kind")
);

-- AddForeignKey
ALTER TABLE "session_reminder_deliveries" ADD CONSTRAINT "session_reminder_deliveries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only ledger: Prisma connects as postgres and bypasses RLS; enabling it
-- with no policy keeps the table closed to the public anon key.
ALTER TABLE "session_reminder_deliveries" ENABLE ROW LEVEL SECURITY;
