-- Reference sample (2026-09-22). Additive only:
--   * cupping_sessions.referenceSampleId — the ONE sample the owner marks as
--     "Referencia" (control the other samples are compared against).
--     SET NULL when that sample is removed. Display-only: the scoring trigger
--     and the ranking never read it; the results Δ is computed client-side
--     (lib/referenceDelta.ts).
-- Generated from `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` on 2026-09-22.

-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN     "referenceSampleId" TEXT;

-- CreateIndex
CREATE INDEX "cupping_sessions_referenceSampleId_idx" ON "cupping_sessions"("referenceSampleId");

-- AddForeignKey
ALTER TABLE "cupping_sessions" ADD CONSTRAINT "cupping_sessions_referenceSampleId_fkey" FOREIGN KEY ("referenceSampleId") REFERENCES "session_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;
