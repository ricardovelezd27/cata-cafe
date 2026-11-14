-- S10 WP4b (2026-11-15): announced close, late evaluations the owner accepts, a note after close.
-- Additive and backwards compatible: five NULLABLE columns, no default, no backfill, no index,
-- no trigger fires. Code that does not know the columns ignores them.
--   * cupping_sessions."closingAt"        the announced close moment (owner's "avisar y cerrar").
--   * evaluations."acceptedLateAt"        when the owner accepted a complete draft after the close.
--   * evaluations."receivedLateAt"       the server's own record that a draft's content arrived after the
--                                         close (stamped only by the late send from a device).
--   * evaluations."postCloseNote"         a cupper's text note on their own submitted evaluation
--                                         after the close (max 500 chars, enforced in the action).
--   * evaluations."postCloseNoteAt"       when that note was written.
-- No grant change: cupping_sessions and evaluations are granted table-wide to the browser key
-- (only session_samples and session_participants are column-level, PHASE 21 / PHASE 25).
-- Apply with `npx.cmd prisma migrate deploy` BEFORE the merge/deploy (runbook section 35).

-- ONE explicit transaction: `prisma migrate deploy` sends this file statement by statement in
-- autocommit, so without BEGIN/COMMIT the SET LOCAL below does nothing and the ALTERs would
-- commit separately. Each ALTER is metadata-only but takes a brief exclusive lock: fail fast.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN "closingAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN "acceptedLateAt" TIMESTAMPTZ(3),
ADD COLUMN "receivedLateAt" TIMESTAMPTZ(3),
ADD COLUMN "postCloseNote" TEXT,
ADD COLUMN "postCloseNoteAt" TIMESTAMPTZ(3);

COMMIT;
