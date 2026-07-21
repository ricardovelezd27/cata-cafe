// Alias-coverage QA: maps every distinct Coffee.country / Coffee.processType
// value in the live DB through lib/analytics/normalize and reports what
// matches and what falls through. Read-only. Run: npx tsx scripts/report-normalization.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeCountry, normalizeProcess } from "../lib/analytics/normalize";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env.local");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const coffees = await prisma.coffee.findMany({
    select: { country: true, processType: true },
  });

  const countries = new Map<string, number>();
  const processes = new Map<string, number>();
  for (const c of coffees) {
    if (c.country?.trim()) countries.set(c.country.trim(), (countries.get(c.country.trim()) ?? 0) + 1);
    if (c.processType?.trim()) processes.set(c.processType.trim(), (processes.get(c.processType.trim()) ?? 0) + 1);
  }

  console.log(`\n${coffees.length} coffees — ${countries.size} distinct countries, ${processes.size} distinct processes\n`);

  console.log("COUNTRY VALUES:");
  for (const [raw, n] of [...countries.entries()].sort((a, b) => b[1] - a[1])) {
    const norm = normalizeCountry(raw);
    console.log(`  ${norm ? `OK   → ${norm.iso2} (${norm.nameEs})` : "MISS"}  [${n}×] "${raw}"`);
  }

  console.log("\nPROCESS VALUES:");
  for (const [raw, n] of [...processes.entries()].sort((a, b) => b[1] - a[1])) {
    const norm = normalizeProcess(raw);
    console.log(`  ${norm ? `OK   → ${norm}` : "MISS"}  [${n}×] "${raw}"`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
