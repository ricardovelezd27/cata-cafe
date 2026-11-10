import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { savedInsightsWhere } from "@/lib/analytics/savedInsightsScope";

describe("savedInsightsWhere (S8-22)", () => {
  it("a regular analytics user lists only their own", () => {
    expect(savedInsightsWhere({ userId: "u1", isSuperAdmin: false })).toEqual({ createdBy: "u1" });
  });
  it("the super-admin lists everyone's", () => {
    expect(savedInsightsWhere({ userId: "root", isSuperAdmin: true })).toEqual({});
  });
  it("loadSavedInsights applies it to the query", () => {
    const src = readFileSync("lib/analytics/savedInsights.ts", "utf8");
    expect(src).toContain("where: savedInsightsWhere(access)");
  });
});
