// The PHASE 29 dry-run file, executed against a throwaway database: it must end in its own expected
// exception, carry an expectation on every numbered line, and every line must read as expected
// (including the temporary sample: complete, then declared partial, then an unmarked incomplete one).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeUser, prisma, rawClient, resetDb } from "./support/db";

beforeEach(resetDb);

async function runDry(): Promise<string> {
  const sql = readFileSync(join(__dirname, "../../prisma/sql/dry-runs/phase29_dry_run.sql"), "utf8");
  const c = await rawClient();
  try {
    await c.query(sql);
    return "";
  } catch (err) {
    return (err as Error).message;
  } finally {
    await c.end();
  }
}

describe("phase29_dry_run.sql", () => {
  it("reads as expected on a database with profiles, and applies nothing", async () => {
    await makeUser();
    await makeUser();
    await makeUser();
    const message = await runDry();
    // Printed so the runbook can carry a real example (throwaway data).
    console.log(message);

    expect(message).toMatch(/^PHASE 29 DRY RUN: NOTHING WAS APPLIED/);
    expect(message).toContain('(_ne) key today (expect 0): 0');
    expect(message).toContain(' 1b submitted evaluations holding a rating key that is present but not a JSON number (expect 0): 0');
    expect(message).toContain("(expect {search_path=public} twice): {search_path=public} {search_path=public}");
    expect(message).toContain("(expect true): true");
    expect(message).toContain("(expect false / false): false / false");
    expect(message).toContain(
      'all 8 rated=false | 7 rated + 1 marked=true | 7 rated + 1 neither=false | 1 rated + 7 marked=true | 8 marked, none rated=false | marker is the string "true"=false | {}=false | NULL=false | rating "abc"=false | rating true=false | rating "7"=false | rating "NaN"=false',
    );
    expect(message).toContain("5a after a complete evaluation (expect included 1, submitted 1, score 84.25, Fragancia 6.00, Sabor 6.00): included 1, submitted 1, score 84.25, Fragancia 6.00, Sabor 6.00");
    expect(message).toContain("5b after a declared-partial evaluation (expect included 1, submitted 2, score 84.25, Fragancia 7.00, Sabor 6.00): included 1, submitted 2, score 84.25, Fragancia 7.00, Sabor 6.00");
    expect(message).toContain("5c after an unmarked incomplete evaluation (expect NOTHING to move: included 1, submitted 3, score 84.25, Fragancia 7.00, Sabor 6.00): included 1, submitted 3, score 84.25, Fragancia 7.00, Sabor 6.00");

    // Nothing was applied: the rolled-back session and the aggregate are gone.
    expect(await prisma.cuppingSession.count({ where: { id: "dry29_session" } })).toBe(0);
    expect(await prisma.aggregateScore.count()).toBe(0);
  });

  it("with fewer than three profiles the temporary-sample line is skipped, lines 1 to 4 still report", async () => {
    await makeUser();
    const message = await runDry();
    expect(message).toMatch(/^PHASE 29 DRY RUN: NOTHING WAS APPLIED/);
    expect(message).toContain("5 temporary sample: SKIPPED (fewer than three profiles exist)");
    expect(message).toContain("the last four cannot raise)");
  });
});
