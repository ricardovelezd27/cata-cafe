-- CreateTable
CREATE TABLE "digest_runs" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL,
    "aiSkipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digest_runs_period_key" ON "digest_runs"("period");
