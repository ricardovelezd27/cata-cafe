-- S6 warm-up v3 PR3: master-led synced warm-up run (nullable, no default, no index).
ALTER TABLE "cupping_sessions" ADD COLUMN "warmupStartedAt" TIMESTAMPTZ(3);
