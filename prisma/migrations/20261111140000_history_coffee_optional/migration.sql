-- S8-16 (F-sesiones-11 commit 2, F-express-2): a history row may name NO coffee.
-- Used for (a) a never-revealed sample whose session was deleted (the coffee
-- must stay blind) and (b) a closed coffee-less (express) sample. Additive:
-- only drops NOT NULL; the FK to coffees (ON DELETE CASCADE) is kept.
--
-- The unique index (userId, coffeeId, sessionId) is untouched. Postgres treats
-- NULLs as distinct, so it does NOT dedupe label-only rows; lib/coffeeHistory.ts
-- keys those rows on the existing evaluationId and finds-or-creates them.
ALTER TABLE "user_coffee_history" ALTER COLUMN "coffeeId" DROP NOT NULL;
