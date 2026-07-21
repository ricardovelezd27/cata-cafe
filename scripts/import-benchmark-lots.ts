// Imports the CQI Arabica benchmark dataset (scripts/data/cqi_arabica.csv)
// into benchmark_lots. Idempotent per source — safe to re-run after
// re-downloading the CSV. See scripts/data/README.md for provenance.
// Run: npm run import:benchmarks

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeCountry, normalizeProcess, parseHarvestYear } from "../lib/analytics/normalize";

const SOURCE = "cqi_arabica";
const CHUNK_SIZE = 500;

type CqiRow = Record<string, string>;

interface BenchmarkLotInsert {
  source: string;
  countryCode: string | null;
  countryRaw: string;
  region: string | null;
  variety: string | null;
  processType: string | null;
  processRaw: string | null;
  altitudeM: number | null;
  harvestYear: number | null;
  totalCupPoints: number;
  attributes: Record<string, number>;
}

const ATTRIBUTE_COLUMNS: Array<[key: string, column: string]> = [
  ["aroma", "Aroma"],
  ["flavor", "Flavor"],
  ["aftertaste", "Aftertaste"],
  ["acidity", "Acidity"],
  ["body", "Body"],
  ["balance", "Balance"],
  ["uniformity", "Uniformity"],
  ["cleanCup", "Clean.Cup"],
  ["sweetness", "Sweetness"],
  ["cupperPoints", "Cupper.Points"],
];

function trimOrNull(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildAttributes(row: CqiRow): Record<string, number> {
  const attributes: Record<string, number> = {};
  for (const [key, column] of ATTRIBUTE_COLUMNS) {
    const value = parseFloat(row[column]);
    if (!Number.isNaN(value)) {
      attributes[key] = value;
    }
  }
  return attributes;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL. Make sure .env.local has DATABASE_URL set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const csvPath = path.join(__dirname, "data", "cqi_arabica.csv");
  const raw = fs.readFileSync(csvPath);
  const rows: CqiRow[] = parse(raw, { columns: true, skip_empty_lines: true, bom: true });

  let skippedInvalidTotal = 0;
  let skippedMissingCountry = 0;
  let nullAltitudeCount = 0;
  let nullHarvestYearCount = 0;
  const unmatchedCountries = new Map<string, number>();
  const unmatchedProcesses = new Map<string, number>();

  const toInsert: BenchmarkLotInsert[] = [];

  for (const row of rows) {
    const totalCupPoints = parseFloat(row["Total.Cup.Points"]);
    if (Number.isNaN(totalCupPoints) || totalCupPoints <= 40) {
      skippedInvalidTotal++;
      continue;
    }

    const countryRaw = (row["Country.of.Origin"] ?? "").trim();
    if (!countryRaw) {
      skippedMissingCountry++;
      continue;
    }

    const normalizedCountry = normalizeCountry(countryRaw);
    const countryCode = normalizedCountry?.iso2 ?? null;
    if (!countryCode) {
      unmatchedCountries.set(countryRaw, (unmatchedCountries.get(countryRaw) ?? 0) + 1);
    }

    const region = trimOrNull(row["Region"]);
    const variety = trimOrNull(row["Variety"]);
    const processRaw = trimOrNull(row["Processing.Method"]);
    const processType = normalizeProcess(processRaw);
    if (processRaw && !processType) {
      unmatchedProcesses.set(processRaw, (unmatchedProcesses.get(processRaw) ?? 0) + 1);
    }

    const harvestYear = parseHarvestYear(row["Harvest.Year"]);
    if (harvestYear === null) nullHarvestYearCount++;

    const altitudeCandidate = parseFloat(row["altitude_mean_meters"]);
    const altitudeM =
      Number.isFinite(altitudeCandidate) && altitudeCandidate > 0 && altitudeCandidate <= 4500
        ? Math.round(altitudeCandidate)
        : null;
    if (altitudeM === null) nullAltitudeCount++;

    toInsert.push({
      source: SOURCE,
      countryCode,
      countryRaw,
      region,
      variety,
      processType,
      processRaw,
      altitudeM,
      harvestYear,
      totalCupPoints,
      attributes: buildAttributes(row),
    });
  }

  await prisma.benchmarkLot.deleteMany({ where: { source: SOURCE } });

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    await prisma.benchmarkLot.createMany({ data: chunk });
  }

  console.log("\n=== Benchmark lots import (cqi_arabica) ===");
  console.log(`Total rows read:      ${rows.length}`);
  console.log(`Rows imported:        ${toInsert.length}`);
  console.log(`Rows skipped:         ${skippedInvalidTotal + skippedMissingCountry}`);
  console.log(`  - invalid/zero Total.Cup.Points (NaN or <=40): ${skippedInvalidTotal}`);
  console.log(`  - missing Country.of.Origin:                   ${skippedMissingCountry}`);

  console.log(`\nRows with null altitude:    ${nullAltitudeCount}`);
  console.log(`Rows with null harvestYear: ${nullHarvestYearCount}`);

  console.log("\nUnmatched country values (countryCode null), sorted by count desc:");
  if (unmatchedCountries.size === 0) {
    console.log("  (none)");
  } else {
    for (const [value, count] of [...unmatchedCountries.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}x  "${value}"`);
    }
  }

  console.log("\nUnmatched process values (processType null, processRaw non-null), sorted by count desc:");
  if (unmatchedProcesses.size === 0) {
    console.log("  (none)");
  } else {
    for (const [value, count] of [...unmatchedProcesses.entries()].sort((a, b) => b[1] - a[1])) {
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
