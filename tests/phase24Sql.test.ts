/**
 * PHASE 24 (S8-24, audit A-02): the API roles are read-only across the public
 * schema. prisma/sql/rls_and_triggers.sql is applied by hand, phase by phase,
 * so this test replays every executable CREATE / DROP / ALTER POLICY in file
 * order (comments stripped, later phases redefine earlier ones) and checks the
 * resulting policy set, plus the schema-wide REVOKE and the dry-run copy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase24_dry_run.sql");

/** Executable SQL only: every `-- …` comment removed (no string literal in the file holds `--`). */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

type Policy = { cmd: string; roles: string };

function finalPolicies(sql: string): Map<string, Policy> {
  const exec = stripComments(sql);
  const policies = new Map<string, Policy>();
  const re =
    /(CREATE|DROP|ALTER)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+([\w."]+)([\s\S]*?);/gi;
  for (const m of exec.matchAll(re)) {
    const verb = m[1].toUpperCase();
    const key = `${m[3].replace(/"/g, "").replace(/^public\./, "")}.${m[2]}`;
    const rest = m[4];
    if (verb === "DROP") {
      policies.delete(key);
      continue;
    }
    const to = /^\s*(?:FOR\s+\w+\s+)?TO\s+([\w\s,]+?)\s*(?:USING|WITH\s+CHECK|$)/i.exec(rest);
    if (verb === "ALTER") {
      const prev = policies.get(key);
      if (!prev) throw new Error(`ALTER POLICY on unknown policy ${key}`);
      if (to) policies.set(key, { ...prev, roles: to[1].trim().toLowerCase() });
      continue;
    }
    const cmd = /^\s*FOR\s+(\w+)/i.exec(rest)?.[1].toUpperCase() ?? "ALL";
    policies.set(key, { cmd, roles: to ? to[1].trim().toLowerCase() : "public" });
  }
  return policies;
}

const phase24 = SQL.slice(SQL.indexOf("-- PHASE 24"));

describe("PHASE 24: API roles read-only (rls_and_triggers.sql replayed in order)", () => {
  const policies = finalPolicies(SQL);

  it("exists", () => {
    expect(SQL.includes("-- PHASE 24")).toBe(true);
  });

  it("leaves no INSERT/UPDATE/DELETE/ALL policy in public", () => {
    const writable = [...policies].filter(([, p]) => p.cmd !== "SELECT").map(([k]) => k);
    expect(writable).toEqual([]);
  });

  it("targets every remaining policy TO authenticated (none applies to anon)", () => {
    const notAuth = [...policies].filter(([, p]) => p.roles !== "authenticated").map(([k]) => k);
    expect(notAuth).toEqual([]);
  });

  it("keeps a read path for the tables whose FOR ALL policy was dropped", () => {
    for (const table of ["tasting_groups", "tasting_group_members", "user_coffee_history", "group_posts", "coffees"]) {
      expect([...policies.keys()].some((k) => k.startsWith(`${table}.`))).toBe(true);
    }
    // Realtime evaluates these two tables' SELECT policies.
    expect(policies.get("cupping_sessions.sessions_select")).toEqual({ cmd: "SELECT", roles: "authenticated" });
    expect(policies.get("evaluations.evals_select_own")).toEqual({ cmd: "SELECT", roles: "authenticated" });
  });

  it("revokes writes schema-wide and for future tables, inside BEGIN/COMMIT", () => {
    const exec = stripComments(phase24).replace(/\s+/g, " ");
    expect(exec).toMatch(
      /BEGIN;.*REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;.*COMMIT;/,
    );
    expect(exec).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;/,
    );
    // Out of scope by design: SELECT grants, sequences, functions, service_role.
    expect(exec).not.toMatch(/ON ALL SEQUENCES|ON ALL FUNCTIONS|service_role|GRANT /i);
  });
});

describe("phase24_dry_run.sql", () => {
  const block = (s: string, start: string, end: string) => {
    const a = s.indexOf(start);
    const b = s.indexOf(end);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
  };

  it("runs exactly the PHASE 24 statements", () => {
    expect(block(DRY, ">>> PHASE 24 statements", "<<< end of PHASE 24 statements")).toBe(
      block(phase24, ">>> PHASE 24 statements", "<<< end of PHASE 24 statements"),
    );
  });

  it("is one DO statement that can only end in an exception", () => {
    const exec = stripComments(DRY);
    expect(exec.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(exec).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(exec).toMatch(/RAISE EXCEPTION E'PHASE 24 DRY RUN: NOTHING WAS APPLIED/);
    expect(exec.trimEnd().endsWith("$dry$;")).toBe(true);
    // at most two placeholders
    expect((DRY.match(/'<[a-z-]+>'/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});
