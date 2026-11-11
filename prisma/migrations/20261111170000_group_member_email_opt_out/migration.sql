-- S8-20 per-group email unsubscribe (2026-11-11), F-grupos-8. Additive only:
--   * emailOptOutAt  when the member unsubscribed from this group's emails; NULL = receives them.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook §25).
-- Written by hand; NOT applied by the PR.

-- AlterTable
ALTER TABLE "tasting_group_members" ADD COLUMN     "emailOptOutAt" TIMESTAMPTZ(3);
