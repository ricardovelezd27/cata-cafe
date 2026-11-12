// S8-04 (F-grupal-1, F-solo-4): re-point UserCoffeeHistory.communityScore at the
// STORED aggregate after PHASE 23 + its recompute changed the aggregates of
// sessions under 5 cups, and null the 0.00 that descriptive-only / incomplete
// sessions got (no included evaluation = no community score).
//
// DRY RUN BY DEFAULT: prints what would change and writes nothing. Pass --apply
// to write. Idempotent: only rows whose value differs are touched.
//
// Run ONLY after PHASE 23 and its recompute (docs/LAUNCH-RUNBOOK.md §12):
//   npx tsx scripts/resync-low-cup-history.ts            # dry run
//   npx tsx scripts/resync-low-cup-history.ts --apply
// .env.local IS production: run it from the checkout the owner chooses.
//
// The rule is inlined (lib/historyRules.ts historyCommunityScore) so the script
// runs under tsx without Next.js path aliases. Keep the two in step.

// CANCELLED 2026-11-12 (S10 WP1a). PHASE 23 STEP 2 never ran and must not: the
// rule that replaced S8-04 is docs/product/cata-descentralizada-puntaje.md, and
// no stored score is recomputed. The script refuses to run (first statement).
console.error("CANCELLED 2026-11-12, see docs/product/cata-descentralizada-puntaje.md §6");
process.exit(1);

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL. Make sure .env.local has DATABASE_URL set.");
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

  const rows = await prisma.userCoffeeHistory.findMany({
    // coffeeId NOT NULL: label-only rows (S8-16) never carry a community score.
    where: { sessionId: { not: null }, coffeeId: { not: null } },
    select: {
      id: true,
      sessionId: true,
      communityScore: true,
      session: { select: { name: true, cupsPerSample: true } },
      evaluation: {
        select: {
          sessionSample: {
            select: { aggregateScore: { select: { communityScore: true, participantCount: true } } },
          },
        },
      },
    },
  });

  let changed = 0;
  let lowCupChanged = 0;
  let toNull = 0;
  const bySession = new Map<string, number>();
  for (const r of rows) {
    const agg = r.evaluation?.sessionSample?.aggregateScore;
    if (!r.evaluation) continue; // detached row: snapshot only, nothing to re-point
    const next = agg && agg.participantCount > 0 ? agg.communityScore : null;
    const same =
      (next === null && r.communityScore === null) ||
      (next !== null && r.communityScore !== null && Number(next) === Number(r.communityScore));
    if (same) continue;
    changed++;
    if (next === null) toNull++;
    if ((r.session?.cupsPerSample ?? 5) < 5) lowCupChanged++;
    const key = `${r.sessionId} (${r.session?.name ?? "?"}, ${r.session?.cupsPerSample ?? "?"} cups)`;
    bySession.set(key, (bySession.get(key) ?? 0) + 1);
    if (APPLY) {
      await prisma.userCoffeeHistory.update({ where: { id: r.id }, data: { communityScore: next } });
    }
  }

  console.log(`${APPLY ? "APPLIED" : "DRY RUN (nothing written)"}: ${changed} of ${rows.length} history rows differ.`);
  console.log(`  of which in sessions under 5 cups: ${lowCupChanged}; set to null (no included evaluation): ${toNull}`);
  for (const [k, n] of [...bySession.entries()].slice(0, 25)) console.log(`  ${n} row(s): ${k}`);
  if (bySession.size > 25) console.log(`  ... and ${bySession.size - 25} more session(s)`);
  if (!APPLY && changed > 0) console.log("Re-run with --apply to write.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
