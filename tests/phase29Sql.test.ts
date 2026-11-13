/**
 * PHASE 29 (S10 WP3b, Kim C4): is_affective_declared_partial() and the trigger function with ONE
 * changed clause. prisma/sql/rls_and_triggers.sql is applied by hand, so this test pins the block,
 * its dry-run copy, the rollback and the exact difference from the PHASE 26 body. The arithmetic is
 * pinned by tests/scoringConsistency.test.ts (TS port) and tests/db/aggregate.dbtest.ts (the real
 * trigger and the real helper). TODO(kim-validar:C4)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase29_dry_run.sql");

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}
const norm = (s: string) => stripComments(s).replace(/\s+/g, " ").trim();

/** One phase: from its `-- PHASE n (` header to the NEXT `-- PHASE <number> (` header, or the end. */
function phaseText(n: number): string {
  const start = SQL.search(new RegExp(`^-- PHASE ${n} \\(`, "m"));
  expect(start).toBeGreaterThan(-1);
  const rest = SQL.slice(start + 1);
  const next = rest.search(/^-- PHASE \d+ \(/m);
  return next === -1 ? SQL.slice(start) : SQL.slice(start, start + 1 + next);
}

const block = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
};

const phase26 = phaseText(26);
const phase29 = phaseText(29);
const stmts29 = block(phase29, ">>> PHASE 29 statements", "<<< end of PHASE 29 statements");
const stmts26 = block(phase26, ">>> PHASE 26 statements", "<<< end of PHASE 26 statements");

/** The `CREATE OR REPLACE FUNCTION recompute_aggregate_score() ... $fn$;` text of a block. */
const triggerFn = (s: string) => {
  const a = s.indexOf("CREATE OR REPLACE FUNCTION recompute_aggregate_score()");
  const b = s.indexOf("$fn$;", a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(a, b + "$fn$;".length);
};

const OLD_CLAUSE = `AND is_affective_complete( CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END)`;
const NEW_CLAUSE = `AND ( is_affective_complete( CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END) OR is_affective_declared_partial( CASE v_json_col WHEN 'affectiveData' THEN ev."affectiveData" ELSE ev."combinedData" END) )`;

describe("PHASE 29: the trigger function differs from PHASE 26 in exactly ONE clause", () => {
  it("exists once, after PHASE 28", () => {
    expect(SQL.match(/^-- PHASE 29 \(/gm)?.length).toBe(1);
    expect(SQL.search(/^-- PHASE 29 \(/m)).toBeGreaterThan(SQL.search(/^-- PHASE 28 \(/m));
  });

  it("the executable text is identical once that one clause is swapped back", () => {
    const old = norm(triggerFn(stmts26));
    const now = norm(triggerFn(stmts29));
    expect(now).not.toBe(old);
    expect(now.split(NEW_CLAUSE)).toHaveLength(2); // the new clause appears exactly once
    expect(now.replace(NEW_CLAUSE, OLD_CLAUSE)).toBe(old);
  });

  it("keeps SECURITY DEFINER, the pinned search_path, the totals, the factor, ruleVersion = 2 and the upsert", () => {
    const e = norm(triggerFn(stmts29));
    expect(e).toContain("SECURITY DEFINER SET search_path = public");
    expect(e).toContain("v_factor := 5.0 / GREATEST(5, v_total_cups);");
    expect(e).toContain("COALESCE(v_attr_averages, '{}'::jsonb), now(), 2 )");
    expect(e).toContain('"ruleVersion" = EXCLUDED."ruleVersion";');
    // the TOTALS still read complete evaluations only
    expect(e).toContain(`is_affective_complete(CASE WHEN v_format = 'affective' THEN e."affectiveData" ELSE e."combinedData" END) AS inc`);
    expect(e).not.toMatch(/is_affective_declared_partial\(CASE WHEN v_format/);
  });
});

describe("PHASE 29: the helper", () => {
  const helper = norm(stmts29.slice(0, stmts29.indexOf("-- PHASE 29: the PHASE 26 body")));

  it("is IMMUTABLE, SQL, pinned to search_path public and revoked from every API role", () => {
    expect(helper).toContain("CREATE OR REPLACE FUNCTION public.is_affective_declared_partial(data jsonb)");
    expect(helper).toContain("RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public");
    expect(helper).toContain("REVOKE EXECUTE ON FUNCTION public.is_affective_declared_partial(jsonb) FROM PUBLIC, anon, authenticated;");
    expect(helper).not.toMatch(/\bGRANT\b/);
  });

  it("reads the same eight keys; a rating counts only when its JSON value is a number (no text cast, cannot raise)", () => {
    for (const k of [
      "fragancia_af", "aroma_af", "sabor_af", "sabor_residual_af",
      "acidez_af", "dulzor_af", "sensacion_af", "impresion_global",
    ]) {
      expect(helper).toContain(`'${k}'`);
      // is_affective_complete reads <k>_final then <k>: the same two keys, in the same order
      expect(SQL).toContain(`data->>'${k}_final'`);
    }
    expect(helper).toContain("CASE WHEN jsonb_typeof(data->(k || '_final')) = 'number' THEN (data->(k || '_final'))::numeric WHEN jsonb_typeof(data->k) = 'number' THEN (data->k)::numeric END, 0) > 0 AS rated");
    expect(helper).not.toMatch(/data->>/); // no text extraction anywhere in the helper
    expect(helper).not.toMatch(/::text/);
  });

  it("a marker counts only as the JSON boolean true; all sections rated or marked, one marked, one rated", () => {
    expect(helper).toContain("COALESCE((data->(k || '_ne')) = 'true'::jsonb, false) AS marked");
    expect(helper).toContain("COALESCE(bool_and(a.rated OR a.marked), false)");
    expect(helper).toContain("AND COALESCE(bool_or(a.marked), false)");
    expect(helper).toContain("AND COALESCE(bool_or(a.rated), false)");
  });
});

describe("PHASE 29: block shape", () => {
  it("is one transaction with a self-check that aborts, and changes nothing else", () => {
    const e = norm(phase29);
    expect(e).toMatch(/BEGIN; CREATE OR REPLACE FUNCTION public\.is_affective_declared_partial.*DO \$chk\$.*RAISE EXCEPTION 'PHASE 29 aborted.*COMMIT;/);
    const all = stripComments(phase29);
    expect(all).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(POLICY|TABLE|TRIGGER|INDEX)\b/i);
    expect(all).not.toMatch(/\b(GRANT|TRUNCATE)\b/i);
    expect(all).not.toMatch(/\bUPDATE\s+evaluations\b/i); // nothing is recomputed by the phase
    expect(all.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
  });

  it("carries the PHASE 26 body as a commented rollback, then drops the helper", () => {
    const rb = phase29.slice(phase29.indexOf("-- ROLLBACK (one transaction)"));
    const body = rb
      .split("\n")
      .filter((l) => l.startsWith("--   "))
      .map((l) => l.slice(5))
      .join("\n");
    expect(body).toContain("BEGIN;");
    expect(body).toContain("DROP FUNCTION public.is_affective_declared_partial(jsonb);");
    expect(body).toContain("COMMIT;");
    expect(norm(triggerFn(body))).toBe(norm(triggerFn(stmts26)));
  });

  it("states the order: apply BEFORE the merge (the old app writes no markers, so it is a no-op until then)", () => {
    expect(phase29).toContain("WHY BEFORE THE MERGE");
    expect(phase29).toContain("runbook §35");
  });
});

describe("phase29_dry_run.sql", () => {
  it("runs exactly the PHASE 29 statements", () => {
    expect(block(DRY, ">>> PHASE 29 statements", "<<< end of PHASE 29 statements")).toBe(stmts29);
  });

  it("is one DO statement that can only end in an exception, with no transaction control or placeholders", () => {
    const e = stripComments(DRY);
    expect(e.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(e).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
    expect(e).toMatch(/RAISE EXCEPTION E'PHASE 29 DRY RUN: NOTHING WAS APPLIED/);
    expect(e.trimEnd().endsWith("$dry$;")).toBe(true);
    expect(DRY).not.toMatch(/'<[a-z-]+>'/);
  });

  it("reports the `_ne` count and proves the temporary sample, with an expectation on every line", () => {
    for (const needle of [
      '1 submitted evaluations carrying a "no evaluado" (_ne) key today (expect 0)',
      "2 proconfig of recompute_aggregate_score and is_affective_declared_partial (expect {search_path=public} twice)",
      "3 authenticated / anon can execute is_affective_declared_partial (expect false / false)",
      "1b submitted evaluations holding a rating key that is present but not a JSON number (expect 0)",
      "4 is_affective_declared_partial (expect false | true | false | true | false | false | false | false | false | false | false | false; the last four cannot raise)",
      "5a after a complete evaluation (expect included 1, submitted 1, score 84.25, Fragancia 6.00, Sabor 6.00)",
      "5b after a declared-partial evaluation (expect included 1, submitted 2, score 84.25, Fragancia 7.00, Sabor 6.00)",
      "5c after an unmarked incomplete evaluation (expect NOTHING to move: included 1, submitted 3, score 84.25, Fragancia 7.00, Sabor 6.00)",
    ]) {
      expect(DRY).toContain(needle);
    }
  });

  it("only writes rows of its own temporary session (rolled back by the final exception)", () => {
    const outside = stripComments(DRY.replace(stmts29, ""));
    const writes = outside.match(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+\w+/gi) ?? [];
    expect(writes.map((w) => w.replace(/\s+/g, " ").toLowerCase())).toEqual([
      "insert into cupping_sessions",
      "insert into session_samples",
      "insert into evaluations",
      "insert into evaluations",
      "insert into evaluations",
    ]);
  });
});
