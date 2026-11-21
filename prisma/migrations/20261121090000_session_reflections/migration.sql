-- OR-D (2026-11-21, the owner's review): one general reflection per tasting and
-- person, written after the session closed.
-- Additive: one new table, no change to an existing one.
--   * session_reflections
--       one row per session and person ("sessionId", "userId" = the primary key),
--       the text (up to 500 characters) and when it was written. "sessionId"
--       cascades with the session; "userId" is a Restrict FK to profiles (account
--       deletion erases the rows explicitly, see lib/accountDeletion/deleteAccount.ts).
--       Read by that person and the session's organizer only.
-- The notes written per coffee before this change stay where they are
-- (evaluations."postCloseNote"): nothing is copied or deleted.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 38),
-- then PHASE 30 of prisma/sql/rls_and_triggers.sql (runbook section 38).

-- CreateTable
CREATE TABLE "session_reflections" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "writtenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_reflections_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateIndex
CREATE INDEX "session_reflections_userId_idx" ON "session_reflections"("userId");

-- AddForeignKey
ALTER TABLE "session_reflections" ADD CONSTRAINT "session_reflections_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reflections" ADD CONSTRAINT "session_reflections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
