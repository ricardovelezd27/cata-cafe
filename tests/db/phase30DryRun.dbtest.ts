// The PHASE 30 dry-run file, executed against a throwaway database: it must end in its own expected
// exception, every probe must read as expected, and nothing may be applied or written.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

beforeEach(resetDb);

async function runDry(): Promise<string> {
  const sql = readFileSync(join(__dirname, "../../prisma/sql/dry-runs/phase30_dry_run.sql"), "utf8");
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

describe("phase30_dry_run.sql", () => {
  it("reads as expected, refuses both API roles, and applies nothing", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner });
    await prisma.sessionReflection.create({ data: { sessionId: s.id, userId: owner, text: "una reflexión" } });

    const message = await runDry();
    // Printed so the runbook can carry a real example (throwaway data).
    console.log(message);

    expect(message).toMatch(/^PHASE 30 DRY RUN: NOTHING WAS APPLIED/);
    expect(message).toContain(" 1a row level security on (expect t): t");
    expect(message).toContain(" 1b policies on the table (expect 0): 0");
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        expect(message).toContain(` 1c ${role} may ${priv} (expect f): f`);
      }
    }
    expect(message).toContain(" 2a authenticated select (expect insufficient_privilege): refused");
    expect(message).toContain(" 2b authenticated insert (expect insufficient_privilege): refused");
    expect(message).toContain(" 3 anon select (expect insufficient_privilege): refused");
    expect(message).toContain(" 4 owner (postgres) select (expect a number, no error; this is how the app reads it): 1");
    expect(message).not.toMatch(/NOT REFUSED|FAILED/);

    // Nothing was written: the one row is the one this test made.
    expect((await prisma.sessionReflection.findMany()).map((r) => r.text)).toEqual(["una reflexión"]);
  });
});
