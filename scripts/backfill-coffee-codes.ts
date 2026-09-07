// Stamps a short shareable code onto every Coffee row that predates the
// `code` column (migration 20260907120000_add_coffee_code). Idempotent: only
// touches rows where code IS NULL, so re-running is always safe.
// Run: npx tsx scripts/backfill-coffee-codes.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withCodeRetry } from "../lib/coffeeCode";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env.local");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const missing = await prisma.coffee.findMany({
    where: { code: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${missing.length} coffees without a code`);

  let done = 0;
  for (const coffee of missing) {
    await withCodeRetry((code) =>
      prisma.coffee.update({ where: { id: coffee.id }, data: { code } }),
    );
    done++;
    if (done % 50 === 0) console.log(`  ...${done}/${missing.length}`);
  }

  const total = await prisma.coffee.count();
  const withCode = await prisma.coffee.count({ where: { code: { not: null } } });
  console.log(`Backfilled ${done}. Coverage: ${withCode}/${total} coffees have a code.`);
  if (withCode !== total) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
