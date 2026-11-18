/**
 * `unnamedControls` of the capture tool (scripts/ux-capture/lib/axnames.mjs) is the accessible name AS
 * CHROME COMPUTES IT, not a copy of the algorithm. What the tool decides itself is tested here:
 *  - classifyAxNode / summarizeNames: pure, on nodes shaped like Chrome's real answers;
 *  - the HTML fixtures (label for, wrapping label, aria-labelledby, placeholder only, icon buttons, an
 *    inert subtree...) run through real Chrome when the tool's playwright-core and a Chrome are
 *    installed (they are not in CI: those tests skip themselves and say so). `--self-test` runs the same
 *    fixtures on every run of the tool.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_FINE, FIXTURE_HTML, FIXTURE_UNNAMED, classifyAxNode, collectControls, summarizeNames } from "../scripts/ux-capture/lib/axnames.mjs";
import { HEAVY_TEST_TIMEOUT_MS } from "./helpers/timeouts";

const TOOL = join(__dirname, "..", "scripts", "ux-capture");

/** A node shaped like Chrome's Accessibility.getFullAXTree answers (see the fixtures below). */
const node = (role: string, name: string, sources: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}) => ({
  ignored: false,
  role: { type: "role", value: role },
  name: { type: "computedString", value: name, sources },
  ...extra,
});

describe("classifyAxNode: what the tool decides from Chrome's answer", () => {
  it("a name from a label, aria-labelledby, aria-label, alt, title, text or a button's value is named", () => {
    for (const src of [
      { type: "relatedElement", value: { type: "computedString", value: "Fecha" } },
      { type: "relatedElement", attribute: "aria-labelledby", value: { type: "computedString", value: "Visible text" } },
      { type: "attribute", attribute: "aria-label", value: { type: "computedString", value: "Cerrar" } },
      { type: "attribute", attribute: "title", value: { type: "computedString", value: "Solo title" } },
      { type: "attribute", attribute: "value", value: { type: "computedString", value: "Enviar" } },
      { type: "contents", value: { type: "computedString", value: "Alt name" } },
    ]) {
      expect(classifyAxNode(node("textbox", "x", [src])).status).toBe("named");
    }
  });

  it("an empty name is unnamed, and the role is reported", () => {
    expect(classifyAxNode(node("button", ""))).toEqual({ status: "unnamed", role: "button", name: "" });
    expect(classifyAxNode(node("button", "   ")).status).toBe("unnamed");
    expect(classifyAxNode(node("switch", "")).status).toBe("unnamed");
    expect(classifyAxNode(node("checkbox", "")).status).toBe("unnamed");
  });

  it("a placeholder alone does NOT count as a name; a placeholder next to a real source does", () => {
    const placeholder = { type: "placeholder", attribute: "placeholder", value: { type: "computedString", value: "Solo placeholder" } };
    expect(classifyAxNode(node("textbox", "Solo placeholder", [placeholder])).status).toBe("placeholder-only");
    const label = { type: "relatedElement", value: { type: "computedString", value: "Nombre" } };
    expect(classifyAxNode(node("textbox", "Nombre", [label, placeholder])).status).toBe("named");
    const superseded = { ...placeholder, superseded: true };
    expect(classifyAxNode(node("textbox", "Nombre", [label, superseded])).status).toBe("named");
  });

  it("an ignored node (aria-hidden), a missing node (inert, hidden) and a structural role are not controls to name", () => {
    expect(classifyAxNode(node("none", "", [], { ignored: true })).status).toBe("ignored");
    expect(classifyAxNode(undefined).status).toBe("no-ax-node");
    expect(classifyAxNode(node("generic", "")).status).toBe("not-a-control"); // a focusable scroller
    expect(classifyAxNode(node("region", "")).status).toBe("not-a-control");
  });

  it("summarizeNames counts every outcome and lists only what fails, with the reason", () => {
    const metas = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }, { id: "f" }];
    const verdicts = [
      classifyAxNode(node("textbox", "Fecha", [{ type: "relatedElement", value: { value: "Fecha" } }])),
      classifyAxNode(node("button", "")),
      classifyAxNode(node("textbox", "P", [{ type: "placeholder", value: { value: "P" } }])),
      classifyAxNode(node("none", "", [], { ignored: true })),
      classifyAxNode(node("generic", "")),
      classifyAxNode(undefined),
    ];
    const out = summarizeNames(metas, verdicts);
    expect(out.counts).toEqual({ checked: 6, named: 1, unnamed: 1, placeholderOnly: 1, ignored: 1, notAControl: 1, noAxNode: 1 });
    expect(out.unnamedCount).toBe(2);
    expect(out.unnamed.map((u: { id: string; why: string }) => [u.id, u.why])).toEqual([
      ["b", "no accessible name"],
      ["c", "placeholder only"],
    ]);
  });
});

describe("the capture reads names from the browser, not from a copy of the algorithm", () => {
  it("capture.mjs sets unnamedControls from readControlNames and measure.mjs no longer guesses", () => {
    const capture = readFileSync(join(TOOL, "capture.mjs"), "utf8");
    expect(capture).toContain("await readControlNames(page)");
    expect(capture).toContain("m.unnamedControls = names.unnamed");
    const measure = readFileSync(join(TOOL, "lib", "measure.mjs"), "utf8");
    expect(measure).not.toContain("noName");
    expect(measure).not.toContain("unnamedControls");
  });

  it("the page-side collector is self-contained (it is serialised into the page) and skips inert, aria-hidden, hidden and disabled", () => {
    const src = collectControls.toString();
    for (const needle of ["[inert]", 'aria-hidden="true"', "[hidden]", "el.disabled", "aria-disabled"]) expect(src).toContain(needle);
  });

  it("the README says what the measure counts", () => {
    const readme = readFileSync(join(TOOL, "README.md"), "utf8");
    expect(readme).toContain("unnamedControls");
    expect(readme).toContain("placeholder");
  });

  it("the fixture lists every expected id once and none of the fine ones", () => {
    for (const id of [...Object.keys(FIXTURE_UNNAMED), ...FIXTURE_FINE]) expect(FIXTURE_HTML).toContain(`id="${id}"`);
    expect(Object.keys(FIXTURE_UNNAMED).filter((id) => FIXTURE_FINE.includes(id))).toEqual([]);
  });
});

describe("the fixtures, through real Chrome (skipped when the tool's playwright-core or Chrome is missing)", () => {
  it("reports exactly the controls without a name, and nothing else", async (ctx) => {
    const installed = existsSync(join(TOOL, "node_modules", "playwright-core", "index.mjs"));
    if (!installed) return ctx.skip();
    const { readControlNames } = await import("../scripts/ux-capture/lib/axnames.mjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = (await import(/* @vite-ignore */ join(TOOL, "node_modules", "playwright-core", "index.mjs").replace(/\\/g, "/"))) as any;
    let browser;
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      return ctx.skip();
    }
    try {
      const page = await browser.newPage();
      await page.setContent(FIXTURE_HTML);
      const out = await readControlNames(page);
      const got = Object.fromEntries(out.unnamed.map((u: { id: string; why: string }) => [u.id, u.why]));
      expect(got).toEqual(FIXTURE_UNNAMED);
      for (const id of FIXTURE_FINE) expect(got).not.toHaveProperty(id);
      expect(out.counts.placeholderOnly).toBe(1);
    } finally {
      await browser.close();
    }
  }, HEAVY_TEST_TIMEOUT_MS);
});
