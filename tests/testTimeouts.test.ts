// L3: the per-test limits come from ONE place (tests/helpers/timeouts.ts), and
// vitest's own 5 s limit stays the default for every other test.
//
// A heavy test (it renders every scenario, loops thousands of seeded cases,
// sweeps dates or scans the tree) passes SCAN_TIMEOUT_MS or HEAVY_TEST_TIMEOUT_MS
// as the third argument of `it(...)`. What this file pins:
//   - no global `testTimeout` / `hookTimeout` in the vitest config, so a light
//     test that hangs still fails in 5 s;
//   - no test writes a limit as a raw number (`}, 60_000)` or `{ timeout: 120_000 }`):
//     a limit is one of the named constants, so raising or reading them is one edit.
// What it does NOT check: that every heavy test declares a limit. Telling a heavy
// test from a light one by its shape gave as many false alarms as hits (a loop of
// 20 000 over plain arithmetic runs in a few ms; the slowest test of all, a date
// sweep, has no literal count), so that is left to measurement (see the PR of L3).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/sourceTree";
import { HEAVY_TEST_TIMEOUT_MS, SCAN_TIMEOUT_MS } from "./helpers/timeouts";

const CALLS = new Set(["it", "test", "describe"]);

/** Every `it` / `test` / `describe` call of a file whose limit is a raw number, as "file:line". */
function rawLimits(rel: string): string[] {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const src = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const at = (n: ts.Node) => `${rel}:${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}`;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      // it(...), it.each(...)(...), describe.skip(...): the name is the leftmost identifier
      let callee: ts.Expression = n.expression;
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
        callee = ts.isPropertyAccessExpression(callee) ? callee.expression : callee.expression;
      }
      if (ts.isIdentifier(callee) && CALLS.has(callee.text)) {
        for (const arg of n.arguments.slice(1)) {
          if (ts.isNumericLiteral(arg)) out.push(at(arg));
          if (ts.isObjectLiteralExpression(arg)) {
            for (const p of arg.properties) {
              if (ts.isPropertyAssignment(p) && p.name.getText(src) === "timeout" && ts.isNumericLiteral(p.initializer)) out.push(at(p));
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe("test time limits (L3)", () => {
  it("the vitest config sets no global test or hook limit", () => {
    const config = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    expect(config).not.toMatch(/testTimeout|hookTimeout/);
  });

  it("the two limits are generous and the heavy one is the larger", () => {
    expect(SCAN_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(HEAVY_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(SCAN_TIMEOUT_MS);
  });

  it("no test file writes a per-test limit as a raw number: it names a constant of tests/helpers/timeouts.ts", () => {
    const files = readdirSync(join(ROOT, "tests"))
      .filter((n) => n.endsWith(".test.ts"))
      .map((n) => `tests/${n}`);
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(rawLimits)).toEqual([]);
  }, SCAN_TIMEOUT_MS);
});
