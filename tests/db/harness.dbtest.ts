// The bring-up of the suite tolerates exactly ONE failing statement of
// prisma/sql/rls_and_triggers.sql (PHASE 11 coffees_select, see
// support/knownSqlFailures.ts). globalSetup already refuses any other outcome;
// this asserts it again from inside the run so the contract is visible in the
// test report and cannot be lost by editing the setup.
import { describe, expect, it, inject } from "vitest";
import { KNOWN_SQL_FAILURES } from "./support/knownSqlFailures";

describe("harness bring-up", () => {
  it("tolerated SQL failures are exactly the one known statement", () => {
    const failures = inject("sqlFailures");
    expect(KNOWN_SQL_FAILURES).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/CREATE POLICY "coffees_select" ON coffees/);
    expect(failures[0]).toMatch(/column "isPublic" does not exist/);
  });
});
