-- S8-12 (2026-11-10): exclusion trail + post-close origin-edit stamp.
-- Additive and backwards compatible: four NULLABLE columns, no defaults, no FK.
--   * session_participants.excluded_at / excluded_by / exclusion_reason
--       who excluded a cupper from the group results, when and why
--       (excluded_by is a plain user id, deliberately WITHOUT a foreign key).
--   * extrinsic_data.edited_at
--       stamped when the owner corrects origin data after the session closed.
-- Apply with `npx prisma migrate deploy` BEFORE the deploy (runbook section 20).

-- AlterTable
ALTER TABLE "session_participants"
  ADD COLUMN "excluded_at" TIMESTAMPTZ(3),
  ADD COLUMN "excluded_by" TEXT,
  ADD COLUMN "exclusion_reason" TEXT;

-- AlterTable
ALTER TABLE "extrinsic_data" ADD COLUMN "edited_at" TIMESTAMPTZ(3);
