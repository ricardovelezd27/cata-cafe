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

/** Text after ON coffee_shares of the (last) coffee_shares_select CREATE POLICY in executable SQL. */
function coffeeSharesUsing(exec: string): string {
  const m = /CREATE POLICY "coffee_shares_select" ON coffee_shares(.*?);/.exec(exec);
  expect(m).not.toBeNull();
  return m![1];
}

const phase24 = SQL.slice(SQL.indexOf("-- PHASE 24"), SQL.indexOf("-- PHASE 25"));

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
    // The only GRANT is EXECUTE on is_coffee_owner (checked below).
    expect(exec).not.toMatch(/ON ALL SEQUENCES|ON ALL FUNCTIONS|service_role/i);
    expect([...exec.matchAll(/GRANT\s+(\w+)/gi)].map((m) => m[1].toUpperCase())).toEqual(["EXECUTE"]);
  });

  it("breaks the coffees <-> coffee_shares recursion with a SECURITY DEFINER helper", () => {
    const exec = stripComments(phase24).replace(/\s+/g, " ");
    expect(exec).toMatch(
      /CREATE OR REPLACE FUNCTION public\.is_coffee_owner\(p_coffee_id text\) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$/,
    );
    expect(exec).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_coffee_owner\(text\) FROM PUBLIC, anon;/);
    expect(exec).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_coffee_owner\(text\) TO authenticated;/);
    expect(coffeeSharesUsing(exec)).toContain("is_coffee_owner");
    expect(coffeeSharesUsing(exec)).not.toMatch(/\bcoffees\b/);
    expect(exec).not.toMatch(/ALTER POLICY "coffee_shares_select"/);
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

  it("runs exactly the PHASE 24 statements (function quote tag aside)", () => {
    // Inside the dry run's $dry$ body the function is quoted $fn$ ... $fn$.
    expect(block(DRY, ">>> PHASE 24 statements", "<<< end of PHASE 24 statements").replaceAll("$fn$", () => "$$")).toBe(
      block(phase24, ">>> PHASE 24 statements", "<<< end of PHASE 24 statements"),
    );
  });

  it("carries the same is_coffee_owner function and coffee_shares_select policy", () => {
    const exec = stripComments(DRY).replace(/\s+/g, " ");
    expect(exec).toMatch(
      /CREATE OR REPLACE FUNCTION public\.is_coffee_owner\(p_coffee_id text\) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$fn\$/,
    );
    expect(exec).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_coffee_owner\(text\) FROM PUBLIC, anon;/);
    expect(exec).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_coffee_owner\(text\) TO authenticated;/);
    expect(coffeeSharesUsing(exec)).not.toMatch(/\bcoffees\b/);
    expect(exec).toContain("1g is_coffee_owner executable by authenticated / anon (expect t f)");
    expect(exec).toContain("3e owner reads coffee_shares without error");
  });

  it("restricts every default-ACL probe feeding an expect-0 check to schema public", () => {
    const exec = stripComments(DRY);
    const probe4a = /SELECT count\(\*\) INTO v_n\s+FROM pg_default_acl[\s\S]*?;/.exec(exec);
    expect(probe4a).not.toBeNull();
    expect(probe4a![0]).toMatch(/JOIN pg_namespace n ON n\.oid = d\.defaclnamespace AND n\.nspname = 'public'/);
    // every pg_default_acl query other than the informational 4c is public-only
    const queries = exec.match(/FROM pg_default_acl[\s\S]*?;/g) ?? [];
    expect(queries.length).toBe(3);
    for (const q of queries.slice(0, 2)) expect(q).toMatch(/n\.nspname = 'public'/);
    expect(DRY).toContain("4c other schemas where postgres still grants default writes");
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
