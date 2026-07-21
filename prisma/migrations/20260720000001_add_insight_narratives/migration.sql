-- CreateTable
CREATE TABLE "insight_narratives" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_narratives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insight_narratives_kind_dataHash_key" ON "insight_narratives"("kind", "dataHash");
