// One-off backfill companion to migration solo_session_lifecycle_backfill:
// the migration closes completed solo sessions and reveals their samples at
// the SQL level; this script then runs syncCoffeeHistoryForSession for each
// closed solo session so UserCoffeeHistory finally includes solo work
// (pre-fix, solo sessions never closed, so history sync never ran for them).
// Idempotent — the sync upserts. Safe to re-run.
// Run: npx tsx scripts/backfill-solo-history.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL. Make sure .env.local has DATABASE_URL set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const sessions = await prisma.cuppingSession.findMany({
    where: { isGroup: false, status: "closed" },
    select: { id: true, name: true },
  });
  console.log(`Found ${sessions.length} closed solo sessions to sync.`);

  let synced = 0;
  for (const session of sessions) {
    // Inline (not imported from lib/coffeeHistory) so the script stays
    // runnable via tsx without Next.js path aliases. Keep in sync with
    // lib/coffeeHistory.ts syncCoffeeHistoryForSession.
    const samples = await prisma.sessionSample.findMany({
      where: { sessionId: session.id, revealed: true, coffeeId: { not: null } },
      include: {
        evaluations: {
          where: { isDraft: false },
          select: { id: true, cupperId: true, individualScore: true },
        },
        aggregateScore: { select: { communityScore: true } },
      },
    });
    const meta = await prisma.cuppingSession.findUnique({
      where: { id: session.id },
      select: { date: true },
    });
    const tastedAt = meta?.date ?? new Date();

    const upserts = [];
    for (const sample of samples) {
      if (!sample.coffeeId) continue;
      const communityScore = sample.aggregateScore?.communityScore ?? null;
      for (const evaluation of sample.evaluations) {
        upserts.push(
          prisma.userCoffeeHistory.upsert({
            where: {
              userId_coffeeId_sessionId: {
                userId: evaluation.cupperId,
                coffeeId: sample.coffeeId,
                sessionId: session.id,
              },
            },
            create: {
              userId: evaluation.cupperId,
              coffeeId: sample.coffeeId,
              evaluationId: evaluation.id,
              sessionId: session.id,
              individualScore: evaluation.individualScore,
              communityScore,
              tastedAt,
            },
            update: {
              individualScore: evaluation.individualScore,
              communityScore,
            },
          }),
        );
      }
    }
    if (upserts.length > 0) {
      await prisma.$transaction(upserts);
      synced++;
      console.log(`  synced ${upserts.length} history rows for "${session.name}"`);
    }
  }

  console.log(`Done. ${synced}/${sessions.length} sessions produced history rows.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
