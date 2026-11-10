import { describe, expect, it } from "vitest";
import {
  changedFormatCups,
  isFormatLocked,
  nextSamplePosition,
  planDuplicateSamples,
  repinNeedsConfirm,
} from "../lib/sessionEdit";

describe("isFormatLocked (C6 default)", () => {
  it("locks from the start or the first evaluation", () => {
    expect(isFormatLocked(null, 0)).toBe(false);
    expect(isFormatLocked(null, 1)).toBe(true);
    expect(isFormatLocked(new Date(), 0)).toBe(true);
  });
});

describe("changedFormatCups", () => {
  const cur = { format: "combined", cupsPerSample: 5 };
  it("drops unchanged values so a rename is never blocked by the lock", () => {
    expect(changedFormatCups(cur, { format: "combined", cupsPerSample: 5 })).toEqual({});
  });
  it("keeps real changes", () => {
    expect(changedFormatCups(cur, { format: "affective" })).toEqual({ format: "affective" });
    expect(changedFormatCups(cur, { cupsPerSample: 3 })).toEqual({ cupsPerSample: 3 });
  });
});

describe("planDuplicateSamples", () => {
  const src = [
    { label: "A", position: 0, coffeeId: "c1", referenceRank: 1 },
    { label: "B", position: 1, coffeeId: "gone", referenceRank: 2 },
    { label: "C", position: 2, coffeeId: null, referenceRank: null },
  ];
  it("copies every reference rank and nulls unusable coffees", () => {
    const plan = planDuplicateSamples(src, new Set(["c1"]));
    expect(plan.samples.map((s) => s.referenceRank)).toEqual([1, 2, null]);
    expect(plan.samples[1]).toMatchObject({ label: "B", coffeeId: null });
    expect(plan.samples[0].coffeeId).toBe("c1");
    expect(plan.droppedCoffees).toBe(1);
  });
});

describe("repinNeedsConfirm (B2 default)", () => {
  it("asks only when ratings would be replaced", () => {
    expect(repinNeedsConfirm({ isAlreadyReference: false, evaluationCount: 2, confirmRepin: false })).toBe(true);
    expect(repinNeedsConfirm({ isAlreadyReference: false, evaluationCount: 2, confirmRepin: true })).toBe(false);
    expect(repinNeedsConfirm({ isAlreadyReference: false, evaluationCount: 0, confirmRepin: false })).toBe(false);
    expect(repinNeedsConfirm({ isAlreadyReference: true, evaluationCount: 5, confirmRepin: false })).toBe(false);
  });
});

describe("nextSamplePosition", () => {
  it("is one past the max, 0 when empty", () => {
    expect(nextSamplePosition(null)).toBe(0);
    expect(nextSamplePosition(4)).toBe(5);
  });
});
