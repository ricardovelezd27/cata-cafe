import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRovingKey, nextRovingIndex, tabIds, tabStopIndex } from "@/lib/rovingFocus";
import {
  edgeHint,
  readTablePlace,
  resultsTabFrom,
  resultsTabParam,
  sameSearch,
  tableKeys,
  withParams,
  writeTablePlace,
  type TableSpec,
} from "@/lib/viewAddress";

// Package P5a (audit D-01, D-02, D-04, H-08): tabs are one Tab stop with the
// arrow keys, and a page's place (the results tab, a table's search, filters,
// sort and page) lives in the address.

const src = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the keyboard of a row of choices", () => {
  const none = [false, false, false, false];

  it("arrows move and wrap, Home and End go to the ends", () => {
    expect(nextRovingIndex("ArrowRight", 0, none)).toBe(1);
    expect(nextRovingIndex("ArrowDown", 3, none)).toBe(0);
    expect(nextRovingIndex("ArrowLeft", 0, none)).toBe(3);
    expect(nextRovingIndex("ArrowUp", 2, none)).toBe(1);
    expect(nextRovingIndex("Home", 2, none)).toBe(0);
    expect(nextRovingIndex("End", 0, none)).toBe(3);
  });

  it("skips disabled items, also at the ends", () => {
    const d = [true, false, true, false];
    expect(nextRovingIndex("ArrowRight", 1, d)).toBe(3);
    expect(nextRovingIndex("ArrowRight", 3, d)).toBe(1);
    expect(nextRovingIndex("Home", 3, d)).toBe(1);
    expect(nextRovingIndex("End", 1, d)).toBe(3);
  });

  it("other keys and a row with nothing enabled are not ours", () => {
    expect(nextRovingIndex("Tab", 0, none)).toBeNull();
    expect(nextRovingIndex("Enter", 0, none)).toBeNull();
    expect(nextRovingIndex("ArrowRight", 0, [true, true])).toBeNull();
    expect(isRovingKey("PageDown")).toBe(false);
  });

  it("the Tab stop is the selected item, else the first enabled one", () => {
    expect(tabStopIndex(2, none)).toBe(2);
    expect(tabStopIndex(-1, none)).toBe(0);
    expect(tabStopIndex(0, [true, false])).toBe(1);
    expect(tabStopIndex(-1, [true, true])).toBe(-1);
  });

  it("a tab and its panel name each other with safe ids", () => {
    expect(tabIds("results", "panel")).toEqual({ tab: "results-tab-panel", panel: "results-panel-panel" });
    expect(tabIds("x", "a b/c").tab).toBe("x-tab-a_b_c");
  });
});

describe("the results tab in the address", () => {
  it("only `panel` is a tab of its own; anything else is the results view", () => {
    expect(resultsTabFrom("panel")).toBe("panel");
    expect(resultsTabFrom(null)).toBe("resumen");
    expect(resultsTabFrom("Panel")).toBe("resumen");
    expect(resultsTabFrom("resumen")).toBe("resumen");
    expect(resultsTabParam("resumen")).toBeNull();
    expect(resultsTabParam("panel")).toBe("panel");
  });

  it("writing the tab keeps R3's open coffee", () => {
    expect(withParams("?sample=abc", { tab: "panel" })).toBe("?sample=abc&tab=panel");
    expect(withParams("?sample=abc&tab=panel", { tab: null })).toBe("?sample=abc");
    expect(withParams("?tab=panel", { tab: null })).toBe("");
  });
});

describe("a table's place in the address", () => {
  const spec: TableSpec = {
    sortKeys: ["name", "date"],
    facets: [{ key: "status", values: ["", "active", "closed"] }],
  };
  const first = { key: "date", dir: "desc" as const };

  it("reads every part it knows", () => {
    expect(readTablePlace("?q=etiop%C3%ADa&sort=name.asc&page=3&f-status=closed", "", spec, first)).toEqual({
      q: "etiopía",
      sort: { key: "name", dir: "asc" },
      page: 3,
      facets: { status: "closed" },
    });
  });

  it("ignores what is not the table's own (unknown column, direction, page, facet value)", () => {
    expect(readTablePlace("?sort=secret.asc&page=0&f-status=gone&f-other=x", "", spec, first)).toEqual({
      q: "",
      sort: first,
      page: 1,
      facets: {},
    });
    expect(readTablePlace("?sort=name.sideways&page=2x", "", spec, null).sort).toBeNull();
    expect(readTablePlace(`?q=${"a".repeat(121)}`, "", spec, null).q).toBe("");
  });

  it("writes only what differs from the defaults, and removes its own bad keys", () => {
    const place = { q: " kenia ", sort: { key: "name", dir: "desc" as const }, page: 2, facets: { status: "active" } };
    expect(writeTablePlace("?sample=s1&f-other=x", "", place, first)).toBe(
      "?sample=s1&q=kenia&sort=name.desc&page=2&f-status=active",
    );
    expect(writeTablePlace("?q=a&sort=date.desc&page=1&f-status=", "", { q: "", sort: first, page: 1, facets: { status: "" } }, first)).toBe("");
  });

  it("round-trips through the address", () => {
    const place = { q: "a b", sort: { key: "date", dir: "asc" as const }, page: 4, facets: { status: "closed" } };
    expect(readTablePlace(writeTablePlace("", "", place, first), "", spec, first)).toEqual(place);
  });

  it("two tables on one page never share a key", () => {
    const a = tableKeys("");
    const b = tableKeys("users");
    expect([a.q, a.sort, a.page, a.facet("role")]).toEqual(["q", "sort", "page", "f-role"]);
    expect([b.q, b.sort, b.page, b.facet("role")]).toEqual(["users-q", "users-sort", "users-page", "users-f-role"]);
    const both = writeTablePlace(
      writeTablePlace("", "", { q: "x", sort: null, page: 2, facets: {} }, null),
      "users",
      { q: "y", sort: null, page: 3, facets: {} },
      null,
    );
    expect(readTablePlace(both, "", spec, null)).toMatchObject({ q: "x", page: 2 });
    expect(readTablePlace(both, "users", spec, null)).toMatchObject({ q: "y", page: 3 });
  });

  it("compares query strings by content, not order", () => {
    expect(sameSearch("?a=1&b=2", "b=2&a=1")).toBe(true);
    expect(sameSearch("?a=1", "?a=2")).toBe(false);
  });
});

describe("a sideways row says where there is more", () => {
  it("no hint when it fits; each edge with something behind it otherwise", () => {
    expect(edgeHint(0, 300, 300)).toEqual({ start: false, end: false });
    expect(edgeHint(0, 600, 300)).toEqual({ start: false, end: true });
    expect(edgeHint(150, 600, 300)).toEqual({ start: true, end: true });
    expect(edgeHint(300, 600, 300)).toEqual({ start: true, end: false });
  });
});

describe("the controls are wired to the rules", () => {
  it("PillTabs: tabs, one Tab stop, arrows, panel ids, no action fill when selected", () => {
    const s = src("components/ui/PillTabs.tsx");
    expect(s).toContain('role="tablist"');
    expect(s).toContain('role="tab"');
    expect(s).toContain("tabIndex={index === stop ? 0 : -1}");
    expect(s).toContain("nextRovingIndex(");
    expect(s).toContain("aria-controls=");
    expect(s).toContain('role="tabpanel"');
    expect(s).not.toMatch(/bg-primary-container|text-on-primary(?![-\w])/);
  });

  it("SegmentedControl: a radio group, one Tab stop, arrows", () => {
    const s = src("components/ui/SegmentedControl.tsx");
    expect(s).toContain('role="radiogroup"');
    expect(s).toContain('role="radio"');
    expect(s).toContain("aria-checked={active}");
    expect(s).toContain("tabIndex={index === stop ? 0 : -1}");
    expect(s).not.toContain('role="tablist"');
  });

  it("RouteTabs: links with aria-current, the edge hint, and Insights uses it", () => {
    const s = src("components/ui/RouteTabs.tsx");
    expect(s).toContain('aria-current={active ? "page" : undefined}');
    expect(s).toContain("edgeHint(");
    expect(s).not.toContain('role="tab');
    expect(src("components/insights/InsightsTabs.tsx")).toContain("<RouteTabs");
  });

  it("DataTable keeps its place through the address hooks", () => {
    const s = src("components/ui/DataTable.tsx");
    expect(s).toContain("useTablePlace(");
    expect(s).toContain("useWriteTablePlace(");
    expect(s).not.toMatch(/useState\(""\)|useState\(1\)/);
    expect(src("components/ui/useTablePlace.ts")).toContain("window.history.replaceState(null");
  });

  it("the results tab lives in the address beside the open coffee", () => {
    const s = src("app/[locale]/app/sessions/[id]/results/ResultsClient.tsx");
    expect(s).toContain("RESULTS_TAB_PARAM");
    expect(s).toContain('idBase="results"');
    expect(s).toContain('role: "tabpanel"');
    expect(s).toContain("useSheetAddress(");
  });
});
