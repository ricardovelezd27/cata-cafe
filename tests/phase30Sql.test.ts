/**
 * PHASE 30 (OR-D, 2026-11-21): session_reflections is read by the person who
 * wrote the reflection and the session's organizer, through Prisma only, so the
 * API roles get nothing (RLS on, no policy, every privilege revoked).
 * prisma/sql/rls_and_triggers.sql is applied by hand, so this test pins the
 * block and its dry-run copy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase30_dry_run.sql");

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

// Bounded from this phase's own header to the NEXT "-- PHASE <number>" header of
// ANY number (or the end of the file), so a phase that lands before or after in
// either merge order cannot leak into these assertions.
const start = /^-- PHASE 30 /m.exec(SQL)!.index;
const next = /^-- PHASE \d+/m.exec(SQL.slice(start + 10));
const phase30 = SQL.slice(start, next ? start + 10 + next.index : undefined);

const block = (s: string, from: string, to: string) => {
  const a = s.indexOf(from);
  const b = s.indexOf(to);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
};

describe("PHASE 30: session_reflections deny-all", () => {
  const stmts = block(phase30, ">>> PHASE 30 statements", "<<< end of PHASE 30 statements");
  const exec = stripComments(stmts).replace(/\s+/g, " ").trim();

  it("exists once, after PHASE 29", () => {
    expect(SQL.match(/^-- PHASE 30 /gm)?.length).toBe(1);
    expect(start).toBeGreaterThan(SQL.indexOf("-- PHASE 29"));
  });

  it("enables RLS and revokes everything from both API roles, nothing else", () => {
    expect(exec).toBe(
      "ALTER TABLE session_reflections ENABLE ROW LEVEL SECURITY; REVOKE ALL ON session_reflections FROM anon, authenticated;",
    );
  });

  it("creates no policy and grants nothing (the table has no API access at all)", () => {
    const all = stripComments(phase30);
    expect(all).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
    expect(all).not.toMatch(/\bGRANT\b/i);
    expect(all).not.toMatch(/\bTO\s+(public|anon|authenticated)\b/i);
  });

  it("runs inside BEGIN/COMMIT with a self-check that aborts", () => {
    const e = stripComments(phase30).replace(/\s+/g, " ");
    expect(e).toMatch(/BEGIN;.*ENABLE ROW LEVEL SECURITY.*REVOKE ALL.*DO \$chk\$.*RAISE EXCEPTION 'PHASE 30 aborted.*COMMIT;/);
  });

  it("matches the Prisma model: the table and its columns exist as the header says", () => {
    const schema = read("prisma/schema.prisma");
    const model = /model SessionReflection \{([\s\S]*?)\n\}/.exec(schema)![1];
    expect(model).toContain('@@map("session_reflections")');
    const cols = model
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@") && !/@relation/.test(l))
      .map((l) => l.split(/\s+/)[0]);
    expect(cols.sort()).toEqual(["sessionId", "text", "userId", "writtenAt"]);
    // one row per session and person
    expect(model).toContain("@@id([sessionId, userId])");
    // The person: Restrict (account deletion erases the rows explicitly). The session: Cascade.
    expect(model).toMatch(/user\s+Profile\s+@relation\([^)]*onDelete:\s*Restrict/);
    expect(model).toMatch(/session\s+CuppingSession\s+@relation\([^)]*onDelete:\s*Cascade/);
  });
});

describe("phase30_dry_run.sql", () => {
  it("runs exactly the PHASE 30 statements", () => {
    expect(block(DRY, ">>> PHASE 30 statements", "<<< end of PHASE 30 statements")).toBe(
      block(phase30, ">>> PHASE 30 statements", "<<< end of PHASE 30 statements"),
    );
  });

  it("is one DO statement that can only end in an exception, with no placeholder", () => {
    const e = stripComments(DRY);
    expect(e.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(e).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(e).toMatch(/RAISE EXCEPTION E'PHASE 30 DRY RUN: NOTHING WAS APPLIED/);
    expect(e.trimEnd().endsWith("$dry$;")).toBe(true);
    expect((DRY.match(/'<[a-z-]+>'/g) ?? []).length).toBe(0);
  });

  it("probes RLS, policies, every privilege of both roles, a refused read and write, and the owner read", () => {
    for (const needle of ["relrowsecurity", "pg_policies", "has_table_privilege", "insufficient_privilege", "'anon'", "'authenticated'"]) {
      expect(DRY).toContain(needle);
    }
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(DRY).toContain(`'${priv}'`);
    }
  });
});

describe("the runbook", () => {
  it("has a click-by-click section for the migration and PHASE 30", () => {
    const rb = read("docs/LAUNCH-RUNBOOK.md");
    expect(rb).toContain("PHASE 30");
    expect(rb).toContain("20261121090000_session_reflections");
    expect(rb).toContain("phase30_dry_run.sql");
  });
});
