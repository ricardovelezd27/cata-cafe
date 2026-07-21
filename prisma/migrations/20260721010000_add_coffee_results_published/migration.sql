-- AlterTable
ALTER TABLE "coffees" ADD COLUMN     "resultsPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "coffees" ADD COLUMN     "resultsPublishedAt" TIMESTAMP(3);
