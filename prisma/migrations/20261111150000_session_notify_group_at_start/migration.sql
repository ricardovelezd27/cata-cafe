-- S8-17 (2026-11-10): live group sessions notify their tasting group when the
-- owner STARTS the session, not at creation (C8 default b).
-- Additive and backwards compatible; apply with `npx prisma migrate deploy`
-- BEFORE the deploy (runbook section 22).
--   * notifyGroupAtStart: the owner asked to notify the linked group and the
--     session is live, so the email is owed at start (default false).
--   * groupNotifiedAt: when the group email was claimed/sent; the idempotence
--     stamp (cleared again if the send fails so it can be retried).
ALTER TABLE "cupping_sessions"
  ADD COLUMN "notifyGroupAtStart" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "groupNotifiedAt" TIMESTAMPTZ(3);
