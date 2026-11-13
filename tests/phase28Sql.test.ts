/**
 * PHASE 28 (S10 WP4a, Kim C5): group results are visible only at close.
 * prisma/sql/rls_and_triggers.sql is applied by hand, so this test pins the
 * block, its dry-run copy and the SQL twin of canViewGroupResults against the
 * TypeScript rule (a hand port of the SQL, compared on every combination).
 * TODO(kim-validar:C5)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canViewGroupResults, isSessionExpired } from "@/lib/sessionState";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase28_dry_run.sql");

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

/** One phase: from its own header up to the NEXT `-- PHASE <n>` header of any
 *  number (other phases may land before or after this one), or end of file. */
function phaseText(sql: string, n: number): string {
  const start = sql.indexOf(`-- PHASE ${n} `);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start + 1);
  const next = rest.search(/\n-- PHASE \d+/);
  return next === -1 ? sql.slice(start) : sql.slice(start, start + 1 + next);
}

const block = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
};

const phase28 = phaseText(SQL, 28);
const stmts = block(phase28, ">>> PHASE 28 statements", "<<< end of PHASE 28 statements");
const exec = stripComments(stmts).replace(/\s+/g, " ");

describe("PHASE 28: can_view_group_results without the all-submitted branch", () => {
  it("exists once and comes after PHASE 25", () => {
    expect(SQL.match(/-- PHASE 28 /g)?.length).toBe(1);
    expect(SQL.indexOf("-- PHASE 28")).toBeGreaterThan(SQL.indexOf("-- PHASE 25"));
  });

  it("re-issues the function with the same signature and attributes", () => {
    expect(exec).toContain("CREATE OR REPLACE FUNCTION public.can_view_group_results(p_session_id text)");
    expect(exec).toContain("RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public");
    expect(stmts).toContain("SQL twin of canViewGroupResults");
  });

  it("the body is owner OR closed OR past closesAt, and nothing else", () => {
    expect(exec).toContain(`cs."createdBy" = auth.uid()::text`);
    expect(exec).toContain("cs.status = 'closed'");
    expect(exec).toContain(`cs."closesAt" IS NOT NULL AND cs."closesAt" < (now() AT TIME ZONE 'utc')`);
    expect(exec).not.toMatch(/isDraft|cupperId|session_participants|evaluations/);
  });

  it("keeps the grants: revoked from PUBLIC and anon, kept for authenticated", () => {
    expect(exec).toContain("REVOKE EXECUTE ON FUNCTION public.can_view_group_results(text) FROM PUBLIC, anon;");
    expect(exec).toContain("GRANT EXECUTE ON FUNCTION public.can_view_group_results(text) TO authenticated;");
    expect([...exec.matchAll(/\bGRANT\b/g)]).toHaveLength(1);
  });

  it("changes nothing else: no policy, no table, no other function", () => {
    const all = stripComments(phase28);
    expect(all).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(POLICY|TABLE|TRIGGER|INDEX)\b/i);
    expect(all.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(all).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it("runs inside BEGIN/COMMIT with a self-check that aborts", () => {
    const e = stripComments(phase28).replace(/\s+/g, " ");
    expect(e).toMatch(/BEGIN;.*CREATE OR REPLACE FUNCTION.*DO \$chk\$.*RAISE EXCEPTION 'PHASE 28 aborted.*COMMIT;/);
  });

  it("carries a commented rollback with the PHASE 21 body (the all-submitted branch)", () => {
    const rollback = phase28.slice(phase28.indexOf("-- Rollback (restores the PHASE 21 body"));
    expect(rollback).toContain("--   CREATE OR REPLACE FUNCTION public.can_view_group_results");
    expect(rollback).toContain(`e."isDraft" = false`);
    expect(rollback).toContain("count(DISTINCT e.\"cupperId\")");
  });

  it("the function the PHASE 21 body had is the one the rollback restores", () => {
    const p21 = phaseText(SQL, 21);
    const body = p21.slice(p21.indexOf("CREATE OR REPLACE FUNCTION public.can_view_group_results"));
    const rb = phase28
      .slice(phase28.indexOf("--   CREATE OR REPLACE FUNCTION public.can_view_group_results"))
      .split("\n")
      .filter((l) => l.startsWith("--   "))
      .map((l) => l.slice(5))
      .join("\n");
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const fnOnly = (s: string) => norm(s.slice(0, s.indexOf("$$;") + 3));
    expect(fnOnly(rb)).toBe(fnOnly(body));
  });
});

describe("phase28_dry_run.sql", () => {
  it("runs exactly the PHASE 28 statements", () => {
    expect(block(DRY, ">>> PHASE 28 statements", "<<< end of PHASE 28 statements")).toBe(stmts);
  });

  it("is one DO statement that can only end in an exception, with no placeholders", () => {
    const e = stripComments(DRY);
    expect(e.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(e).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(e).toMatch(/RAISE EXCEPTION E'PHASE 28 DRY RUN: NOTHING WAS APPLIED/);
    expect(e.trimEnd().endsWith("$dry$;")).toBe(true);
    expect(DRY).not.toMatch(/'<[a-z-]+>'/);
  });

  it("reports the sessions that lose visibility and the live sessions idle 7 to 30 days and more than 30 days", () => {
    expect(DRY).toContain("lose group visibility");
    expect(DRY).toContain("2a live sessions started on or after the rule");
    expect(DRY).toContain("2b live sessions idle 30 days or more");
    expect(DRY).toContain("2c live sessions idle 7 days to under 30, left alone");
    expect(DRY).toContain("participants with an email");
    expect(DRY).toContain("interval '7 days'");
    expect(DRY).toContain("interval '30 days'");
    // the same boundary as the code (>= 7 days idle), not a strict one
    expect(DRY).toContain("last_activity <= ((now() AT TIME ZONE 'utc') - interval '7 days')");
  });

  it("line 3 says it measures the function installed now, and what it reads after PHASE 28", () => {
    expect(DRY).toContain("3 function installed now");
    expect(DRY).toContain("after PHASE 28 is applied this line reads 0");
    expect(DRY).not.toContain("OLD function");
  });

  it("the self-check also verifies the search_path setting (proconfig)", () => {
    expect(phase28).toContain("lost SET search_path = public");
    expect(phase28).toContain("proconfig");
  });

  it("only reads: no write statement outside the phase's own", () => {
    const outside = stripComments(DRY.replace(stmts, ""));
    expect(outside).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  });
});

// ---------------------------------------------------------------------------
// The SQL twin against the TypeScript rule. `sqlCanView` is a literal HAND PORT of
// the function body above:  isGroup AND (owner OR status='closed' OR
// (closesAt IS NOT NULL AND closesAt < now)). The TS side feeds `ownerRead`
// from "is the owner" (super-admin lens is TS-only and never reaches the API).
// ---------------------------------------------------------------------------
describe("canViewGroupResults (TS) agrees with a HAND PORT of the SQL twin on every combination (the REAL function is compared in tests/db/closeRules.dbtest.ts)", () => {
  const NOW = Date.parse("2026-11-20T12:00:00Z");

  function sqlCanView(r: { isGroup: boolean; isOwner: boolean; status: string; closesAt: number | null }): boolean {
    return (
      r.isGroup &&
      (r.isOwner || r.status === "closed" || (r.closesAt !== null && r.closesAt < NOW))
    );
  }

  const statuses = ["active", "closed", "draft", "open"];
  const closesAts: (number | null)[] = [null, NOW - 1, NOW, NOW + 1];

  it("every (isGroup, owner, status, closesAt) combination", () => {
    let checked = 0;
    for (const isGroup of [true, false])
      for (const isOwner of [true, false])
        for (const status of statuses)
          for (const closesAt of closesAts) {
            const ts = canViewGroupResults({
              isGroup,
              ownerRead: isOwner,
              status,
              // the page derives `sessionExpired` from closesAt only, the way the SQL does
              sessionExpired: isSessionExpired({ status: "active", closesAt: closesAt === null ? null : new Date(closesAt) }, NOW),
            });
            expect(ts, JSON.stringify({ isGroup, isOwner, status, closesAt })).toBe(
              sqlCanView({ isGroup, isOwner, status, closesAt }),
            );
            checked += 1;
          }
    expect(checked).toBe(2 * 2 * 4 * 4);
  });

  it("everyone submitted but still open: a participant cannot view (the whole point of C5)", () => {
    expect(canViewGroupResults({ isGroup: true, ownerRead: false, status: "active", sessionExpired: false })).toBe(false);
    expect(sqlCanView({ isGroup: true, isOwner: false, status: "active", closesAt: null })).toBe(false);
  });
});
