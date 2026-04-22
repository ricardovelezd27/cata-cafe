-- CreateTable
CREATE TABLE "session_participants" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "aggregate_scores" (
    "id" TEXT NOT NULL,
    "sessionSampleId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "cupsPerSample" INTEGER NOT NULL DEFAULT 0,
    "totalCups" INTEGER NOT NULL DEFAULT 0,
    "avgRawScore" DOUBLE PRECISION,
    "totalNonUniform" INTEGER NOT NULL DEFAULT 0,
    "totalDefective" INTEGER NOT NULL DEFAULT 0,
    "uniformityPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defectPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "communityScore" DOUBLE PRECISION,
    "attrAverages" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregate_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_coffee_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coffeeId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "individualScore" DOUBLE PRECISION,
    "communityScore" DOUBLE PRECISION,
    "tastedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_coffee_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_invites" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aggregate_scores_sessionSampleId_key" ON "aggregate_scores"("sessionSampleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_coffee_history_userId_coffeeId_sessionId_key" ON "user_coffee_history"("userId", "coffeeId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "session_invites_token_key" ON "session_invites"("token");

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregate_scores" ADD CONSTRAINT "aggregate_scores_sessionSampleId_fkey" FOREIGN KEY ("sessionSampleId") REFERENCES "session_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
