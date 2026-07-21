// Imports OWID/FAO coffee production data (scripts/data/owid_coffee_production.csv)
// into reference_series. Idempotent per source — safe to re-run after
// re-downloading the CSV. See scripts/data/README.md for provenance.
// Run: npm run import:reference

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { COFFEE_COUNTRIES } from "../lib/analytics/normalize";

const SOURCE = "owid_fao";
const METRIC = "production";
const UNIT = "tonnes";
const VALUE_COLUMN = "coffee__green__00000656__production__005510__tonnes";
const CHUNK_SIZE = 1000;

type OwidRow = Record<string, string>;

interface ReferenceSeriesInsert {
  source: string;
  metric: string;
  countryCode: string;
  year: number;
  value: number;
  unit: string;
}

const iso3ToIso2 = new Map(COFFEE_COUNTRIES.map((c) => [c.iso3, c.iso2]));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL. Make sure .env.local has DATABASE_URL set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const csvPath = path.join(__dirname, "data", "owid_coffee_production.csv");
  const raw = fs.readFileSync(csvPath);
  const rows: OwidRow[] = parse(raw, { columns: true, skip_empty_lines: true, bom: true });

  let aggregateSkipped = 0;
  let invalidNumericSkipped = 0;
  const unmatchedCodes = new Map<string, number>();
  const toInsert: ReferenceSeriesInsert[] = [];

  for (const row of rows) {
    const code = (row.code ?? "").trim();
    if (!code || code.startsWith("OWID_")) {
      aggregateSkipped++;
      continue;
    }

    const countryCode = iso3ToIso2.get(code.toUpperCase());
    if (!countryCode) {
      unmatchedCodes.set(code, (unmatchedCodes.get(code) ?? 0) + 1);
      continue;
    }

    const year = parseInt(row.year, 10);
    const value = parseFloat(row[VALUE_COLUMN]);
    if (Number.isNaN(year) || Number.isNaN(value)) {
      invalidNumericSkipped++;
      continue;
    }

    toInsert.push({ source: SOURCE, metric: METRIC, countryCode, year, value, unit: UNIT });
  }

  await prisma.referenceSeries.deleteMany({ where: { source: SOURCE } });

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    await prisma.referenceSeries.createMany({ data: chunk, skipDuplicates: true });
  }

  const years = toInsert.map((r) => r.year);
  const yearMin = years.length ? Math.min(...years) : null;
  const yearMax = years.length ? Math.max(...years) : null;
  const distinctCountries = new Set(toInsert.map((r) => r.countryCode));

  console.log("\n=== Reference series import (owid_fao / production) ===");
  console.log(`Total rows read:                  ${rows.length}`);
  console.log(`Rows imported:                    ${toInsert.length}`);
  console.log(`Aggregate/region rows skipped (expected, code empty or OWID_*): ${aggregateSkipped}`);
  console.log(`Rows skipped (invalid year/value): ${invalidNumericSkipped}`);
  console.log(`Year range covered:                ${yearMin ?? "n/a"}–${yearMax ?? "n/a"}`);
  console.log(`Distinct countries imported:       ${distinctCountries.size}`);

  console.log("\nUnmatched codes (no ISO3→ISO2 match in COFFEE_COUNTRIES; expected for non-producing/minor countries), sorted by count desc:");
  if (unmatchedCodes.size === 0) {
    console.log("  (none)");
  } else {
    for (const [value, count] of [...unmatchedCodes.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}x  "${value}"`);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
