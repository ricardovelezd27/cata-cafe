import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// S8-22 B-03: the guest merge re-syncs coffee history for closed sessions whose
// evaluations were re-resolved (source scan: the function imports prisma).
describe("mergeGuestData history re-sync (B-03)", () => {
  const src = readFileSync("lib/guestClaim.ts", "utf8");

  it("reads the closed sessions of the refire set (the re-fired SAMPLES) inside the transaction", () => {
    expect(src).toMatch(
      /cuppingSession\.findMany\(\{\s*where: \{ status: "closed", samples: \{ some: \{ id: \{ in: refireSamples \} \} \} \}/,
    );
  });

  it("syncs history for each of them AFTER the transaction commits, logging failures", () => {
    const commit = src.indexOf("}, MERGE_TX_OPTIONS);");
    const sync = src.indexOf("syncCoffeeHistoryForSession(sessionId)");
    expect(commit).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(commit);
    const around = src.slice(commit, sync + 400);
    expect(around).toContain("catch (e)");
    expect(around).toContain("logError");
  });
});
