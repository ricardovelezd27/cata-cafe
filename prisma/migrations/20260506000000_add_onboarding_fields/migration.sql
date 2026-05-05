-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "country" TEXT,
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
