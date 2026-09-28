import { describe, expect, it } from "vitest";
import { pageState, pruneSelection, togglePage } from "../lib/tableSelection";

describe("pruneSelection", () => {
  it("keeps ids that are still present and drops the rest", () => {
    const next = pruneSelection(new Set(["a", "b", "c"]), ["a", "c", "z"]);
    expect([...next].sort()).toEqual(["a", "c"]);
  });
  it("returns the same instance when nothing changed", () => {
    const sel = new Set(["a", "b"]);
    expect(pruneSelection(sel, new Set(["a", "b", "c"]))).toBe(sel);
  });
});

describe("togglePage", () => {
  it("selects every page id when not all are selected", () => {
    const next = togglePage(new Set(["a"]), ["a", "b", "c"]);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });
  it("deselects the page when all its ids are selected, leaving other pages alone", () => {
    const next = togglePage(new Set(["a", "b", "other"]), ["a", "b"]);
    expect([...next]).toEqual(["other"]);
  });
  it("is a no-op for an empty page", () => {
    expect([...togglePage(new Set(["x"]), [])]).toEqual(["x"]);
  });
});

describe("pageState", () => {
  it("reports none / some / all", () => {
    expect(pageState(new Set(), ["a", "b"])).toBe("none");
    expect(pageState(new Set(["a"]), ["a", "b"])).toBe("some");
    expect(pageState(new Set(["a", "b", "c"]), ["a", "b"])).toBe("all");
    expect(pageState(new Set(["a"]), [])).toBe("none");
  });
});
