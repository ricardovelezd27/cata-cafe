-- S8-11 live group robustness (2026-11). Additive only, safe defaults:
--   * session_invites.active          — false once "Regenerar enlace" revokes the token
--   * cupping_sessions.entriesLocked  — owner closed new entries (newcomers refused)
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook §18).

-- AlterTable
ALTER TABLE "session_invites" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN     "entriesLocked" BOOLEAN NOT NULL DEFAULT false;
