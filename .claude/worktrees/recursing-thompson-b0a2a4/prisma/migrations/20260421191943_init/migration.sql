-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cupping_pro',
    "preferredLang" TEXT NOT NULL DEFAULT 'es',
    "avatarUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coffees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "farm" TEXT,
    "producer" TEXT,
    "species" TEXT,
    "variety" TEXT,
    "harvestYear" TEXT,
    "processType" TEXT,
    "certifications" TEXT[],
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coffees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupping_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "objective" TEXT,
    "format" TEXT NOT NULL,
    "cupsPerSample" INTEGER NOT NULL DEFAULT 5,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "isAsync" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cupping_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_samples" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "coffeeId" TEXT,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "sessionSampleId" TEXT NOT NULL,
    "cupperId" TEXT NOT NULL,
    "descriptiveData" JSONB NOT NULL DEFAULT '{}',
    "affectiveData" JSONB NOT NULL DEFAULT '{}',
    "combinedData" JSONB NOT NULL DEFAULT '{}',
    "nonUniformCups" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "defectiveCups" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "defectTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectiveSum" DOUBLE PRECISION,
    "rawScore" DOUBLE PRECISION,
    "individualScore" DOUBLE PRECISION,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_evaluations" (
    "id" TEXT NOT NULL,
    "sessionSampleId" TEXT NOT NULL,
    "evaluatedBy" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extrinsic_data" (
    "id" TEXT NOT NULL,
    "sessionSampleId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "revealedBy" TEXT,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "extrinsic_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_samples_sessionId_position_key" ON "session_samples"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_sessionSampleId_cupperId_key" ON "evaluations"("sessionSampleId", "cupperId");

-- CreateIndex
CREATE UNIQUE INDEX "physical_evaluations_sessionSampleId_key" ON "physical_evaluations"("sessionSampleId");

-- CreateIndex
CREATE UNIQUE INDEX "extrinsic_data_sessionSampleId_key" ON "extrinsic_data"("sessionSampleId");

-- AddForeignKey
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupping_sessions" ADD CONSTRAINT "cupping_sessions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_samples" ADD CONSTRAINT "session_samples_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_samples" ADD CONSTRAINT "session_samples_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_sessionSampleId_fkey" FOREIGN KEY ("sessionSampleId") REFERENCES "session_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_cupperId_fkey" FOREIGN KEY ("cupperId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_sessionSampleId_fkey" FOREIGN KEY ("sessionSampleId") REFERENCES "session_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_evaluations" ADD CONSTRAINT "physical_evaluations_evaluatedBy_fkey" FOREIGN KEY ("evaluatedBy") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrinsic_data" ADD CONSTRAINT "extrinsic_data_sessionSampleId_fkey" FOREIGN KEY ("sessionSampleId") REFERENCES "session_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrinsic_data" ADD CONSTRAINT "extrinsic_data_revealedBy_fkey" FOREIGN KEY ("revealedBy") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
