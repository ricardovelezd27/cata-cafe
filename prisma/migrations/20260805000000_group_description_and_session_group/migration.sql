ALTER TABLE "tasting_groups" ADD COLUMN "description" TEXT;
ALTER TABLE "cupping_sessions" ADD COLUMN "groupId" TEXT;
ALTER TABLE "cupping_sessions" ADD CONSTRAINT "cupping_sessions_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "tasting_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cupping_sessions_groupId_idx" ON "cupping_sessions"("groupId");
