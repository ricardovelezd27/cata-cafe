-- CreateTable
CREATE TABLE "reference_series" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "reference_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_lots" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cqi_arabica',
    "countryCode" TEXT,
    "countryRaw" TEXT NOT NULL,
    "region" TEXT,
    "variety" TEXT,
    "processType" TEXT,
    "processRaw" TEXT,
    "altitudeM" INTEGER,
    "harvestYear" INTEGER,
    "totalCupPoints" DOUBLE PRECISION NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "benchmark_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_series_source_metric_countryCode_year_key" ON "reference_series"("source", "metric", "countryCode", "year");

-- CreateIndex
CREATE INDEX "reference_series_countryCode_metric_idx" ON "reference_series"("countryCode", "metric");

-- CreateIndex
CREATE INDEX "benchmark_lots_countryCode_idx" ON "benchmark_lots"("countryCode");

-- CreateIndex
CREATE INDEX "benchmark_lots_processType_idx" ON "benchmark_lots"("processType");
