// The PHASE 26 dry-run file, executed against a throwaway database with a little
// seeded data: it must end in its own expected exception, carry an expectation on
// every numbered line and name the session (not raw ids) on line 6.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeEvaluation, makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

beforeEach(resetDb);

describe("phase26_dry_run.sql", () => {
  it("reports every line with its expectation and names the session on line 6", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const u1 = await makeUser({ name: "Uno" });
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
      samples: [{ label: "Huila lote 7" }],
    });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { name: "Cata del viernes" } });
    const A = s.samples[0];
    for (const cupper of [owner, u1]) {
      await makeEvaluation({
        sampleId: A.id,
        sessionId: s.id,
        cupperId: cupper,
        cupsPerSample: 2,
        values: 7,
        nonUniform: [true, false],
        defective: [true, false],
        overrides: { cups: null },
      });
    }
    // What the OLD function stored (no deduction under five cups).
    await prisma.aggregateScore.update({
      where: { sessionSampleId: A.id },
      data: { ruleVersion: 1, communityScore: 80.25 },
    });

    const sql = readFileSync(join(__dirname, "../../prisma/sql/dry-runs/phase26_dry_run.sql"), "utf8");
    const c = await rawClient();
    let message = "";
    try {
      await c.query(sql);
    } catch (err) {
      message = (err as Error).message;
    } finally {
      await c.end();
    }
    // Printed so the runbook can carry a real example (throwaway data).
    console.log(message);

    expect(message).toMatch(/^PHASE 26 DRY RUN: NOTHING WAS APPLIED/);
    const lines = message.split("\n").filter((l) => /^ [1-6] /.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const l of lines) {
      expect(l).toMatch(/informational|expect/);
    }
    expect(message).toContain("Increases are expected for samples with 5 or more cups");
    expect(message).toContain("decreases are expected for samples under 5 cups with flagged cups");
    expect(message).toMatch(/ 6 \(informational\) Cata del viernes, \d{4}-\d{2}-\d{2}, sample Huila lote 7 \(2 cups per sample\)/);
    expect(message).toMatch(/ 4 .*\(expect 0\): 0/);
    // Nothing was applied: the stored row is the one we pinned.
    expect((await prisma.aggregateScore.findUniqueOrThrow({ where: { sessionSampleId: A.id } })).ruleVersion).toBe(1);
  });
});
