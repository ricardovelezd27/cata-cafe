-- CreateTable
CREATE TABLE "tasting_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasting_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasting_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasting_groups_createdBy_idx" ON "tasting_groups"("createdBy");

-- CreateIndex
CREATE INDEX "tasting_group_members_groupId_idx" ON "tasting_group_members"("groupId");

-- CreateIndex
CREATE INDEX "tasting_group_members_userId_idx" ON "tasting_group_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tasting_group_members_groupId_email_key" ON "tasting_group_members"("groupId", "email");

-- AddForeignKey
ALTER TABLE "tasting_groups" ADD CONSTRAINT "tasting_groups_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_group_members" ADD CONSTRAINT "tasting_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tasting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasting_group_members" ADD CONSTRAINT "tasting_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
