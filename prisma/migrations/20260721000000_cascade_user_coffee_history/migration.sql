-- UserCoffeeHistory FKs were RESTRICT (Prisma default for required relations),
-- which blocked deleting any Coffee/CuppingSession/Evaluation referenced by a
-- history row. History is a derived record — it must follow its sources.

-- DropForeignKey
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_userId_fkey";
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_coffeeId_fkey";
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_evaluationId_fkey";
ALTER TABLE "user_coffee_history" DROP CONSTRAINT "user_coffee_history_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_coffee_history" ADD CONSTRAINT "user_coffee_history_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cupping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
