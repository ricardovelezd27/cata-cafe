-- Groups announcements feed (GroupPost). Owner-authored posts visible to
-- members in-app; optional email notification recorded in "emailSent".

-- CreateTable
CREATE TABLE "group_posts" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_posts_groupId_createdAt_idx" ON "group_posts"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tasting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
