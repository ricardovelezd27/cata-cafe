-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "analyticsAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "saved_insights" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_insights_createdBy_idx" ON "saved_insights"("createdBy");

-- AddForeignKey
ALTER TABLE "saved_insights" ADD CONSTRAINT "saved_insights_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
