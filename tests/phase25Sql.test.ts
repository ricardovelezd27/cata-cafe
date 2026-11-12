/**
 * PHASE 25 (S9-02, audit A-10): exclusion metadata on session_participants is
 * hidden from the API by column privileges. prisma/sql/rls_and_triggers.sql is
 * applied by hand, so this test pins the block and its dry-run copy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase25_dry_run.sql");

const HIDDEN = ["excluded_from_results", "excluded_at", "excluded_by", "exclusion_reason"];
const ALLOWED = ["sessionId", "userId", "status", "joinedAt"];

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

const phase25 = SQL.slice(SQL.indexOf("-- PHASE 25"));

const block = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
};

describe("PHASE 25: session_participants exclusion metadata hidden from the API", () => {
  const stmts = block(phase25, ">>> PHASE 25 statements", "<<< end of PHASE 25 statements");
  const exec = stripComments(stmts).replace(/\s+/g, " ");

  it("is the last phase and exists once", () => {
    expect(SQL.match(/-- PHASE 25 /g)?.length).toBe(1);
    expect(SQL.indexOf("-- PHASE 25")).toBeGreaterThan(SQL.indexOf("-- PHASE 24"));
  });

  it("revokes table-level SELECT from both API roles", () => {
    expect(exec).toContain("REVOKE SELECT ON session_participants FROM anon, authenticated;");
  });

  it("grants only SELECT on exactly the allowed columns, to authenticated", () => {
    const grants = [...exec.matchAll(/GRANT\s+(\w+)\s*\(([^)]*)\)\s+ON\s+(\w+)\s+TO\s+(\w+)/gi)];
    expect(grants).toHaveLength(1);
    const [, priv, cols, table, role] = grants[0];
    expect(priv.toUpperCase()).toBe("SELECT");
    expect(table).toBe("session_participants");
    expect(role).toBe("authenticated");
    const list = cols.split(",").map((c) => c.trim().replace(/"/g, ""));
    expect(list.sort()).toEqual([...ALLOWED].sort());
    for (const h of HIDDEN) expect(list).not.toContain(h);
    // every GRANT in the whole phase is that one
    expect([...stripComments(phase25).matchAll(/\bGRANT\b/g)]).toHaveLength(1);
  });

  it("introduces no write grant and no policy", () => {
    const all = stripComments(phase25);
    expect(all).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(all).not.toMatch(/\b(CREATE|ALTER|DROP)\s+POLICY\b/i);
    expect(all).not.toMatch(/\bTO\s+(public|anon)\b/i);
  });

  it("the column list matches the Prisma model (every column is allowed or hidden, nothing new)", () => {
    const schema = read("prisma/schema.prisma");
    const model = /model SessionParticipant \{([\s\S]*?)\n\}/.exec(schema)![1];
    const cols: string[] = [];
    for (const line of model.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      const name = t.split(/\s+/)[0];
      if (/@relation/.test(t)) continue; // relation fields are not columns
      const map = /@map\("([^"]+)"\)/.exec(t);
      cols.push(map ? map[1] : name);
    }
    expect(cols.sort()).toEqual([...ALLOWED, ...HIDDEN].sort());
  });

  it("no querying-role policy expression reads a hidden column", () => {
    // Policies in the file may only reach session_participants through the
    // SECURITY DEFINER helpers; none names a hidden column in a USING clause.
    const exec = stripComments(SQL);
    const policies = [...exec.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map((m) => m[0]);
    for (const p of policies) {
      for (const h of HIDDEN) expect(p).not.toContain(h);
    }
  });

  it("runs inside BEGIN/COMMIT with a self-check that aborts", () => {
    const e = stripComments(phase25).replace(/\s+/g, " ");
    expect(e).toMatch(/BEGIN;.*REVOKE SELECT.*GRANT SELECT.*DO \$chk\$.*RAISE EXCEPTION 'PHASE 25 aborted.*COMMIT;/);
  });
});

describe("phase25_dry_run.sql", () => {
  it("runs exactly the PHASE 25 statements", () => {
    expect(block(DRY, ">>> PHASE 25 statements", "<<< end of PHASE 25 statements")).toBe(
      block(SQL.slice(SQL.indexOf("-- PHASE 25")), ">>> PHASE 25 statements", "<<< end of PHASE 25 statements"),
    );
  });

  it("is one DO statement that can only end in an exception", () => {
    const e = stripComments(DRY);
    expect(e.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(e).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(e).toMatch(/RAISE EXCEPTION E'PHASE 25 DRY RUN: NOTHING WAS APPLIED/);
    expect(e.trimEnd().endsWith("$dry$;")).toBe(true);
    expect((DRY.match(/'<[a-z-]+>'/g) ?? []).length).toBe(2);
  });

  it("probes allowed columns, every hidden column, every dependent table and the RPC helpers", () => {
    for (const h of HIDDEN) expect(DRY).toContain(h);
    expect(DRY).toContain("insufficient_privilege");
    for (const t of [
      "evaluations",
      "session_samples",
      "cupping_sessions",
      "aggregate_scores",
      "physical_evaluations",
      "extrinsic_data",
      "session_participants",
    ]) {
      expect(DRY).toContain(`'${t}'`);
    }
    for (const f of ["is_session_participant", "is_session_owner", "can_view_group_results"]) {
      expect(DRY).toContain(`public.${f}(`);
    }
  });
});
