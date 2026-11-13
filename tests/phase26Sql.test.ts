/**
 * PHASE 26 (S10 WP1a): recompute_aggregate_score() with the flat CVA deduction
 * at any cup count, diluted beyond five pooled cups. prisma/sql/rls_and_triggers.sql
 * is applied by hand, so this test pins the block and its dry-run copy. The
 * arithmetic itself is pinned by tests/scoringConsistency.test.ts (TS port) and
 * tests/db/aggregate.dbtest.ts (the real trigger).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const SQL = read("prisma/sql/rls_and_triggers.sql");
const DRY = read("prisma/sql/dry-runs/phase26_dry_run.sql");

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

const START = "-- >>> PHASE 26 statements";
const END = "-- <<< end of PHASE 26 statements";
// Bounded: from its own header to the NEXT "-- PHASE <number> (" header of any number (a later
// phase is appended after it by another PR), or the end of the file.
const phaseStart = SQL.search(/^-- PHASE 26 \(/m);
const phaseRest = SQL.slice(phaseStart + 1);
const nextPhase = phaseRest.search(/^-- PHASE \d+ \(/m);
const phase26 = nextPhase === -1 ? SQL.slice(phaseStart) : SQL.slice(phaseStart, phaseStart + 1 + nextPhase);

const block = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(s.indexOf("\n", a) + 1, s.lastIndexOf("\n", b)).trim();
};

describe("PHASE 26: flat deduction, diluted beyond five pooled cups", () => {
  const stmts = block(phase26, START, END);
  const exec = stripComments(stmts).replace(/\s+/g, " ");

  // Not asserted as "the last phase": another PR appends PHASE 27+ after it (third review L-2); the
  // block bounds above already stop at the next header.
  it("exists once, after PHASE 25", () => {
    expect(SQL.match(/^-- PHASE 26 \(/gm)?.length).toBe(1);
    expect(SQL.search(/^-- PHASE 26 \(/m)).toBeGreaterThan(SQL.indexOf("-- PHASE 25"));
  });

  it("re-issues the trigger function once, keeping SECURITY DEFINER and the pinned search_path", () => {
    expect(exec.match(/CREATE OR REPLACE FUNCTION recompute_aggregate_score\(\)/g)?.length).toBe(1);
    expect(exec).toContain("SECURITY DEFINER");
    expect(exec).toContain("SET search_path = public");
    expect(exec).toMatch(/RETURNS trigger LANGUAGE plpgsql/);
  });

  it("applies the rule: factor 5 / GREATEST(5, pooled cups), 2 and 4 per flagged cup, no >= 5 gate", () => {
    expect(exec).toContain("v_factor := 5.0 / GREATEST(5, v_total_cups);");
    expect(exec).toContain("v_uniformity_penalty := 2.0 * v_total_non_uniform * v_factor;");
    expect(exec).toContain("v_defect_penalty := 4.0 * v_total_defective * v_factor;");
    expect(exec).not.toMatch(/v_cups_per_sample >= 5/);
    expect(exec).not.toMatch(/10\.0 \/|30\.0 \//);
    expect(exec).not.toContain("v_total_cups := v_cups_per_sample * v_participant_count");
  });

  it("reads evaluations.cups with the session's cups as fallback, clamps counts, ignores uniformity at one cup", () => {
    expect(exec).toContain("COALESCE(e.cups, v_cups_per_sample)");
    expect(exec).toContain("CASE WHEN COALESCE(e.cups, v_cups_per_sample) >= 2");
    expect(exec).toMatch(/LEAST\(\(SELECT COUNT\(\*\) FROM unnest\(e\."nonUniformCups"\)/);
    expect(exec).toMatch(/LEAST\(\(SELECT COUNT\(\*\) FROM unnest\(e\."defectiveCups"\)/);
    expect(exec).toContain("SUM(s.cups) FILTER (WHERE s.inc)");
  });

  it("keeps the exclusion filter, is_affective_complete, the attrAverages block and the upsert", () => {
    expect(exec).toContain("sp.excluded_from_results = true");
    expect(exec).toContain("is_affective_complete(");
    expect(exec).toContain("'Impresión global'");
    expect(exec).toContain('ON CONFLICT ("sessionSampleId") DO UPDATE SET');
    expect(exec).toContain('ROUND((COALESCE(v_avg_raw, 0) - v_uniformity_penalty - v_defect_penalty)::numeric * 4) / 4');
  });

  it("introduces no policy, grant or other DDL: only the function (and a guard that reads the catalog)", () => {
    const all = stripComments(phase26);
    expect(all).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(POLICY|TABLE|TRIGGER)\b/i);
    expect(all).not.toMatch(/\b(GRANT|REVOKE|TRUNCATE)\b/i);
    expect(all).not.toMatch(/\bUPDATE\s+evaluations\b/i); // the recompute is NOT part of the phase
  });

  it("has a guard that refuses to run before the migration (both columns)", () => {
    expect(phase26).toMatch(/DO \$chk\$[\s\S]*column_name = 'cups'[\s\S]*column_name = 'ruleVersion'[\s\S]*RAISE EXCEPTION 'PHASE 26 aborted/);
  });

  it("stamps ruleVersion = 2 in the INSERT and in the ON CONFLICT UPDATE", () => {
    expect(exec).toContain('"attrAverages", "computedAt", "ruleVersion" ) VALUES (');
    expect(exec).toContain("COALESCE(v_attr_averages, '{}'::jsonb), now(), 2 )");
    expect(exec).toContain('"ruleVersion" = EXCLUDED."ruleVersion";');
  });

  it("the migration adds both columns and backfills NOTHING (cups NULL means scored before the rule)", () => {
    const m = stripComments(read("prisma/migrations/20261113090000_evaluation_cups/migration.sql"));
    expect(m).toContain('ALTER TABLE "evaluations" ADD COLUMN "cups" INTEGER;');
    expect(m).toContain('ALTER TABLE "aggregate_scores" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1;');
    expect(m).toContain("SET LOCAL lock_timeout = '5s';");
    expect(m).not.toMatch(/^\s*SET lock_timeout/m); // a plain SET would leak into later migrations
    // prisma migrate deploy sends the file statement by statement in autocommit: only an explicit
    // transaction makes SET LOCAL effective and the two ALTERs atomic (third review M-A).
    const trimmed = m.trim();
    expect(trimmed.startsWith("BEGIN;")).toBe(true);
    expect(trimmed.endsWith("COMMIT;")).toBe(true);
    expect(m.indexOf("SET LOCAL lock_timeout")).toBeGreaterThan(m.indexOf("BEGIN;"));
    expect(m.indexOf("COMMIT;")).toBeGreaterThan(m.indexOf('ADD COLUMN "ruleVersion"'));
    expect(m).not.toMatch(/\bUPDATE\b/i);
    expect(m).not.toMatch(/\bINSERT\b/i);
  });

  it("carries the PHASE 23 body as a commented rollback", () => {
    const after = phase26.slice(phase26.indexOf(END));
    expect(after).toMatch(/^-- ROLLBACK/m);
    expect(after).toContain("--   CREATE OR REPLACE FUNCTION recompute_aggregate_score()");
    expect(after).toContain("--     IF v_cups_per_sample >= 5 AND v_total_cups > 0 THEN");
  });

  it("marks PHASE 23 STEP 2 as cancelled", () => {
    const p23 = SQL.slice(SQL.search(/^-- PHASE 23 \(/m), SQL.search(/^-- PHASE 24 \(/m));
    expect(p23).toMatch(/-- STEP 2 -- CANCELLED/);
    expect(p23).toContain("docs/product/cata-descentralizada-puntaje.md");
  });
});

describe("phase26_dry_run.sql", () => {
  it("runs exactly the PHASE 26 statements", () => {
    expect(block(DRY, ">>> PHASE 26 statements", "<<< end of PHASE 26 statements")).toBe(
      block(phase26, START, END),
    );
  });

  it("is one DO statement that can only end in an exception, with no transaction control or placeholders", () => {
    const e = stripComments(DRY);
    expect(e.match(/\bDO \$dry\$/g)?.length).toBe(1);
    expect(e).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
    expect(e).toMatch(/RAISE EXCEPTION E'PHASE 26 DRY RUN: NOTHING WAS APPLIED/);
    expect(e.trimEnd().endsWith("$dry$;")).toBe(true);
    expect(DRY).not.toMatch(/'<[a-z-]+>'/);
  });

  it("states the migration prerequisite and checks it", () => {
    expect(DRY).toMatch(/REQUIRES the evaluation_cups migration/);
    expect(DRY).toContain("column_name = 'cups'");
    expect(DRY).toContain("column_name = 'ruleVersion'");
  });

  it("re-fires the trigger and reports the numbers the owner needs", () => {
    expect(DRY).toContain('UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;');
    for (const needle of [
      "1 cup",
      "2 cups",
      "3-4 cups",
      "5+ cups",
      "highest:",
      "lowest:",
      "NOT stamped ruleVersion 2 by the re-fire (expect 0)",
      "proconfig",
    ]) {
      expect(DRY).toContain(needle);
    }
  });
});
