import { describe, expect, it } from "vitest";
import { fillTemplate, splitEvaluationCounts } from "@/lib/deleteImpact";

describe("deleteImpact", () => {
  it("splits submitted from drafts", () => {
    expect(splitEvaluationCounts(10, 7)).toEqual({ submittedCount: 7, draftCount: 3 });
    expect(splitEvaluationCounts(0, 0)).toEqual({ submittedCount: 0, draftCount: 0 });
  });
  it("never goes negative", () => {
    expect(splitEvaluationCounts(2, 5)).toEqual({ submittedCount: 2, draftCount: 0 });
    expect(splitEvaluationCounts(2, -1)).toEqual({ submittedCount: 0, draftCount: 2 });
  });
  it("fills every token and leaves unknown ones", () => {
    expect(fillTemplate("{a} y {a} y {b}", { a: 1 })).toBe("1 y 1 y {b}");
  });
});
