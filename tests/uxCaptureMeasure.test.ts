/**
 * The capture tool's measure, steps and self-test (T1d): effective hit areas, painted text size, the
 * primary-button rule, the `waitFor` step, the `tiny` device and the self-test's write check. Pure parts
 * run everywhere; the fixture pages run through real Chrome when the tool's playwright-core and a Chrome
 * are installed (they are not in CI: those tests skip themselves and say so). `--self-test` runs the
 * same fixtures on every run of the tool.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePlan } from "../scripts/ux-capture/lib/plan.mjs";
import { MEASURE_EXPECT, MEASURE_FIXTURE_HTML, checkMeasureFixture, describeRequests, reconcileBlocked } from "../scripts/ux-capture/lib/selftest.mjs";
import { DEFAULT_STEP_TIMEOUT_MS, describeStep, stepTimeout } from "../scripts/ux-capture/lib/steps.mjs";
import { COMPARED_COUNTS, renderSummary, summarizeMeasure } from "../scripts/ux-capture/lib/summarize.mjs";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

const TOOL = join(__dirname, "..", "scripts", "ux-capture");
const read = (...p: string[]) => readFileSync(join(TOOL, ...p), "utf8");

describe("reconcileBlocked: every write the self-test tried was blocked; the page's own blocked writes are listed, not counted", () => {
  const tried = ["POST", "PUT", "PATCH", "DELETE"].map((method) => ({ method, path: "/api/health" }));

  it("four tried, four blocked: fine", () => {
    const r = reconcileBlocked(tried, tried);
    expect(r).toEqual({ allBlocked: true, missing: [], extra: [] });
  });

  it("the Next dev overlay's own POST is an extra, not a failure (the '4 writes tried, 5 blocked' case)", () => {
    const overlay = { method: "POST", path: "/__nextjs_original-stack-frames" };
    const r = reconcileBlocked(tried, [overlay, ...tried]);
    expect(r.allBlocked).toBe(true);
    expect(r.extra).toEqual([overlay]);
    expect(describeRequests(r.extra)).toBe("POST /__nextjs_original-stack-frames");
  });

  it("a tried write that was NOT blocked fails, even when other requests were blocked", () => {
    const blocked = [{ method: "POST", path: "/api/health" }, { method: "PUT", path: "/api/health" }, { method: "PATCH", path: "/api/health" }, { method: "POST", path: "/other" }];
    const r = reconcileBlocked(tried, blocked);
    expect(r.allBlocked).toBe(false);
    expect(r.missing).toEqual([{ method: "DELETE", path: "/api/health" }]);
    expect(r.extra).toEqual([{ method: "POST", path: "/other" }]);
  });

  it("one blocked request cannot stand for two tried ones", () => {
    const r = reconcileBlocked([tried[0], tried[0]], [tried[0]]);
    expect(r.allBlocked).toBe(false);
    expect(r.missing).toHaveLength(1);
  });

  it("describeRequests groups repeats by path", () => {
    const o = { method: "POST", path: "/__nextjs_original-stack-frames" };
    expect(describeRequests([o, o, { method: "PUT", path: "/x" }])).toBe("POST /__nextjs_original-stack-frames x2, PUT /x");
  });

  it("the write check never loosens what is blocked: capture.mjs still aborts by method and only connects the allowed socket", () => {
    const capture = read("capture.mjs");
    expect(capture).toContain("isReadOnlyMethod(request.method())");
    expect(capture).toContain('route.abort("blockedbyclient")');
    expect(capture.match(/connectToServer/g)).toHaveLength(1);
    expect(capture).toContain("shouldBlockWebSocket(ws.url(), origin)");
    // only method + path of a blocked request are kept, never the query (it can carry a token)
    expect(capture).toContain("new URL(request.url()).pathname");
  });
});

describe("steps: waitFor, click and hover wait for a visible match", () => {
  const screen = (steps: unknown[]) => ({ name: "p", signIn: false, screens: [{ id: "a", path: "/x", steps }] });

  it("waitFor is a step, with an optional timeout; click and hover take one too", () => {
    expect(validatePlan(screen([{ waitFor: "[role=tab]" }, { waitFor: ".x", timeout: 20000 }, { click: "button", timeout: 500 }, { hover: "a", timeout: 100 }]))).toEqual([]);
  });

  it("refuses an empty selector, a timeout out of range, a timeout beside a step that has no wait, and a step with two actions", () => {
    const bad = (steps: unknown[]) => validatePlan(screen(steps)).join(" | ");
    expect(bad([{ waitFor: "" }])).toContain("must be a selector");
    expect(bad([{ waitFor: 3 }])).toContain("must be a selector");
    expect(bad([{ waitFor: ".x", timeout: 50 }])).toContain("timeout must be a number of ms");
    expect(bad([{ waitFor: ".x", timeout: 70000 }])).toContain("timeout must be a number of ms");
    expect(bad([{ wait: 100, timeout: 500 }])).toContain('"timeout" goes only with');
    expect(bad([{ waitFor: ".x", click: ".y" }])).toContain("exactly one of");
    expect(bad([{ timeout: 500 }])).toContain("exactly one of");
    expect(bad([{ nonsense: 1 }])).toContain("exactly one of");
  });

  it("the default timeout is 8 s; a given one is used; one out of range falls back", () => {
    expect(DEFAULT_STEP_TIMEOUT_MS).toBe(8000);
    expect(stepTimeout({ click: "x" })).toBe(8000);
    expect(stepTimeout({ waitFor: "x", timeout: 20000 })).toBe(20000);
    expect(stepTimeout({ waitFor: "x", timeout: 5 })).toBe(8000);
  });

  it("describeStep names the step by its position and content", () => {
    expect(describeStep({ waitFor: ".tabs" }, 2)).toBe('step 3 {"waitFor":".tabs"}');
  });

  it("capture.mjs runs every step through runStep (no raw click with a fixed timeout is left)", () => {
    const capture = read("capture.mjs");
    expect(capture).toContain("await runStep(page, st, i)");
    expect(capture).not.toContain("click({ timeout: 8000 })");
  });

  it("the shipped plans still validate", () => {
    for (const name of ["visitor", "owner", "participant", "empty"]) expect(validatePlan(JSON.parse(read("plans", `${name}.json`)))).toEqual([]);
  });
});

describe("devices", () => {
  it("`tiny` is 320 x 568, listed with the others and in the README", () => {
    const capture = read("capture.mjs");
    expect(capture).toMatch(/tiny:\s*\{\s*width:\s*320,\s*height:\s*568,\s*touch:\s*true\s*\}/);
    expect(read("README.md")).toContain("tiny");
    expect(read("README.md")).toContain("320x568");
  });
});

describe("summaries keep the old numbers readable", () => {
  it("an old measure's plain targets-under-44 is read as its own-box number; a new one carries both", () => {
    const old = { targetsUnder44Count: 6, targetsUnder24Count: 2, layout: { under12Count: 9 } };
    const s = summarizeMeasure(old);
    expect([s.targetsUnder44, s.targetsUnder44OwnBox, s.targetsUnder24OwnBox, s.textUnder12, s.textUnder12Css]).toEqual([6, 6, 2, 9, 9]);
    const next = summarizeMeasure({ ...old, targetsUnder44Count: 1, targetsUnder44OwnBoxCount: 6, targetsUnder24Count: 0, targetsUnder24OwnBoxCount: 2, targetsWithHitArea: [{}, {}], layout: { under12Count: 3, under12CssCount: 9 } });
    expect([next.targetsUnder44, next.targetsUnder44OwnBox, next.targetsUnder24, next.targetsUnder24OwnBox, next.textUnder12, next.textUnder12Css, next.hitAreaControls]).toEqual([1, 6, 0, 2, 3, 9, 2]);
  });

  it("the new counts are compared and printed", () => {
    for (const c of ["targetsUnder44OwnBox", "targetsUnder24OwnBox", "textUnder12Css", "hitAreaControls"]) expect(COMPARED_COUNTS).toContain(c);
    const table = renderSummary({ "p/a": { finalUrl: "/a", targetsUnder44Count: 1, targetsUnder44OwnBoxCount: 6, layout: {} } });
    expect(table).toContain("<44 own box");
    expect(table).toContain("<12px css");
  });
});

describe("the measure's wiring", () => {
  it("measure.mjs reads the pseudo-element and the wrapping label, keeps the own-box numbers and no longer reads a class name for the primary fill", () => {
    const m = read("lib", "measure.mjs");
    expect(m).toContain('getComputedStyle(el, which)');
    expect(m).toContain("lab.contains(el)");
    expect(m).toContain("targetsUnder44OwnBoxCount");
    expect(m).toContain("textSizesCss");
    expect(m).not.toContain("byClass");
    expect(m).not.toContain("bg-primary-container");
    expect(m).toContain('closest("nav,[role=navigation]")');
  });

  it("capture.mjs measures through runMeasure, which hands the geometry kit to the page", () => {
    expect(read("capture.mjs")).toContain("await runMeasure(page)");
    expect(read("lib", "measure.mjs")).toContain("GEOMETRY_SOURCE");
  });

  it("the fixture lists the controls it expects, all of which are on the page", () => {
    const ids = new Set([...MEASURE_EXPECT.under44Own, ...Object.keys(MEASURE_EXPECT.hitArea)]);
    for (const id of ids) expect(MEASURE_FIXTURE_HTML).toContain(`id="${id}"`);
    for (const id of MEASURE_EXPECT.under44) expect(MEASURE_EXPECT.under44Own).toContain(id);
  });
});

describe("the fixtures, through real Chrome (skipped when the tool's playwright-core or Chrome is missing)", () => {
  it("hit areas, painted text size and primary buttons come out as the fixture says", async (ctx) => {
    if (!existsSync(join(TOOL, "node_modules", "playwright-core", "index.mjs"))) return ctx.skip();
    const { runMeasureFixture, runStepsFixture } = await import("../scripts/ux-capture/lib/selftest.mjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = (await import(/* @vite-ignore */ join(TOOL, "node_modules", "playwright-core", "index.mjs").replace(/\\/g, "/"))) as any;
    let browser;
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      return ctx.skip();
    }
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
      const { measure, problems } = await runMeasureFixture(page);
      expect(problems).toEqual([]);
      // the numbers side by side: what the old measure said (own box) and what a tap reaches
      expect(measure.targetsUnder44OwnBoxCount).toBe(MEASURE_EXPECT.under44Own.length);
      expect(measure.targetsUnder44Count).toBe(MEASURE_EXPECT.under44.length);
      expect(checkMeasureFixture(measure)).toEqual([]);
      expect(await runStepsFixture(page)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, HEAVY_TEST_TIMEOUT_MS);
});

describe("the safety rules are untouched", () => {
  it("lib/guard.mjs has no new way through: still only `/_next/` sockets on the tool's own host", () => {
    const guard = read("lib", "guard.mjs");
    expect(guard).toContain('export const ALLOWED_SOCKET_PATH_PREFIX = "/_next/"');
    expect(guard).toContain("assertTestAddress");
    expect(guard).toContain("isReadOnlyMethod");
  });
});
