-- S8-08 waitlist consent record (2026-11-11). Additive only, both nullable:
--   * consentAt            when the person submitted the form
--   * consentNoticeVersion which privacy notice was shown ("draft-0" until the
--                          owner publishes the final text)
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook §17).
-- Written by hand; NOT applied by the PR.

-- AlterTable
ALTER TABLE "waitlist_entries" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentNoticeVersion" TEXT;
