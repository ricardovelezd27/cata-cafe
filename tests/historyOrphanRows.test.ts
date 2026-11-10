import { describe, expect, it } from "vitest";
import { orphanLabelRowWhere, partitionLabelRows } from "@/lib/historyRules";

describe("orphanLabelRowWhere", () => {
  it("targets label-only rows of THIS live session with no evaluation", () => {
    expect(orphanLabelRowWhere("s1")).toEqual({ sessionId: "s1", coffeeId: null, evaluationId: null });
  });
  it("always pins a session id, so detached rows (sessionId NULL) never match", () => {
    expect(orphanLabelRowWhere("s1").sessionId).toBeTruthy();
  });
});

describe("partitionLabelRows", () => {
  it("existing evaluations update, new ones insert", () => {
    const out = partitionLabelRows([{ evaluationId: "a" }, { evaluationId: "b" }], new Set(["a"]));
    expect(out.toUpdate).toEqual([{ evaluationId: "a" }]);
    expect(out.toInsert).toEqual([{ evaluationId: "b" }]);
  });
});
