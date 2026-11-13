import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mayBuildPersonalComparison, mayBuildRepeatedDiffs } from "@/lib/reports/comparisonGates";

const ok = { status: "closed", isGroup: true, canViewGroup: true, ownerRead: false };

describe("mayBuildPersonalComparison (B3)", () => {
  it("only a closed group session, viewable, participant lens", () => {
    expect(mayBuildPersonalComparison(ok)).toBe(true);
    expect(mayBuildPersonalComparison({ ...ok, status: "active" })).toBe(false);
    expect(mayBuildPersonalComparison({ ...ok, isGroup: false })).toBe(false);
    expect(mayBuildPersonalComparison({ ...ok, canViewGroup: false })).toBe(false);
    expect(mayBuildPersonalComparison({ ...ok, ownerRead: true })).toBe(false);
  });
});

describe("mayBuildRepeatedDiffs (B6)", () => {
  it("never on an open session, never for the admin read view", () => {
    expect(mayBuildRepeatedDiffs({ status: "closed", isAdminViewer: false })).toBe(true);
    expect(mayBuildRepeatedDiffs({ status: "active", isAdminViewer: false })).toBe(false);
    expect(mayBuildRepeatedDiffs({ status: "draft", isAdminViewer: false })).toBe(false);
    expect(mayBuildRepeatedDiffs({ status: "closed", isAdminViewer: true })).toBe(false);
  });
  it("the results page uses both helpers (no inline copy of the rule)", () => {
    const src = readFileSync("app/[locale]/app/sessions/[id]/results/page.tsx", "utf8");
    expect(src).toContain("mayBuildPersonalComparison(");
    expect(src).toContain("mayBuildRepeatedDiffs(");
    expect(src).not.toContain('session.status === "closed" && !isAdminViewer');
  });
});
