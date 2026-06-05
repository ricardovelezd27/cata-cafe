-- Phase 1 scaling hardening: add indexes on foreign keys and common filter columns.
-- Plain CREATE INDEX (acquires a brief lock). The tables are small today, so this is
-- instant. On a large production table, apply the CONCURRENTLY variant manually via the
-- Supabase SQL editor instead (see prisma/sql/rls_and_triggers.sql notes) to avoid locks.

-- CreateIndex
CREATE INDEX "coffees_createdBy_idx" ON "coffees"("createdBy");

-- CreateIndex
CREATE INDEX "coffees_isPublic_idx" ON "coffees"("isPublic");

-- CreateIndex
CREATE INDEX "cupping_sessions_createdBy_idx" ON "cupping_sessions"("createdBy");

-- CreateIndex
CREATE INDEX "cupping_sessions_createdBy_status_idx" ON "cupping_sessions"("createdBy", "status");

-- CreateIndex
CREATE INDEX "session_samples_coffeeId_idx" ON "session_samples"("coffeeId");

-- CreateIndex
CREATE INDEX "evaluations_cupperId_idx" ON "evaluations"("cupperId");

-- CreateIndex
CREATE INDEX "evaluations_sessionSampleId_isDraft_idx" ON "evaluations"("sessionSampleId", "isDraft");

-- CreateIndex
CREATE INDEX "physical_evaluations_evaluatedBy_idx" ON "physical_evaluations"("evaluatedBy");

-- CreateIndex
CREATE INDEX "extrinsic_data_revealedBy_idx" ON "extrinsic_data"("revealedBy");

-- CreateIndex
CREATE INDEX "session_participants_userId_status_idx" ON "session_participants"("userId", "status");

-- CreateIndex
CREATE INDEX "user_coffee_history_userId_idx" ON "user_coffee_history"("userId");

-- CreateIndex
CREATE INDEX "user_coffee_history_coffeeId_idx" ON "user_coffee_history"("coffeeId");

-- CreateIndex
CREATE INDEX "user_coffee_history_sessionId_idx" ON "user_coffee_history"("sessionId");

-- CreateIndex
CREATE INDEX "session_invites_sessionId_idx" ON "session_invites"("sessionId");

-- CreateIndex
CREATE INDEX "session_invites_createdBy_idx" ON "session_invites"("createdBy");
