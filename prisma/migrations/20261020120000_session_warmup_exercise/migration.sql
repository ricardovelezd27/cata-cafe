-- S6 CP-B6: optional pre-cupping warm-up ("Movimiento Sensorial").
-- Code constant from lib/warmup/exercises.ts (WARMUP_IDS), validated with
-- oneOf() in app/actions/sessions.ts. Nullable, no default, no index:
-- display/flow only — scoring never reads it.
-- AlterTable
ALTER TABLE "cupping_sessions" ADD COLUMN "warmupExerciseId" TEXT;
