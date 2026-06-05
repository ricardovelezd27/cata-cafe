-- Phase 1 scaling hardening — foreign-key / filter-column indexes.
--
-- Use THIS file to apply the indexes to the LIVE Supabase database, because the
-- runtime DATABASE_URL points at the pgbouncer transaction pooler (port 6543),
-- which `prisma migrate` cannot use. The matching Prisma migration lives at
-- prisma/migrations/20260605000000_add_fk_indexes (apply that via `migrate deploy`
-- against a DIRECT session-mode URL if/when one is configured).
--
-- CREATE INDEX CONCURRENTLY does NOT take a write lock, so it is safe to run while
-- the app is live. It CANNOT run inside a transaction block — in the Supabase SQL
-- editor, run these statements ONE AT A TIME (or paste all and run; the editor
-- executes them sequentially without a wrapping BEGIN/COMMIT).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "coffees_createdBy_idx" ON "coffees"("createdBy");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "coffees_isPublic_idx" ON "coffees"("isPublic");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "cupping_sessions_createdBy_idx" ON "cupping_sessions"("createdBy");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "cupping_sessions_createdBy_status_idx" ON "cupping_sessions"("createdBy", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_samples_coffeeId_idx" ON "session_samples"("coffeeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "evaluations_cupperId_idx" ON "evaluations"("cupperId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "evaluations_sessionSampleId_isDraft_idx" ON "evaluations"("sessionSampleId", "isDraft");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "physical_evaluations_evaluatedBy_idx" ON "physical_evaluations"("evaluatedBy");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "extrinsic_data_revealedBy_idx" ON "extrinsic_data"("revealedBy");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_participants_userId_status_idx" ON "session_participants"("userId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_coffee_history_userId_idx" ON "user_coffee_history"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_coffee_history_coffeeId_idx" ON "user_coffee_history"("coffeeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_coffee_history_sessionId_idx" ON "user_coffee_history"("sessionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_invites_sessionId_idx" ON "session_invites"("sessionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_invites_createdBy_idx" ON "session_invites"("createdBy");
