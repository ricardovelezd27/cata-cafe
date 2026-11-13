import { describe, expect, it } from "vitest";
import {
  changedFormatCups,
  defaultSampleLabel,
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
  // Owner-typed labels: nothing is shuffled, so the old guarantees still hold.
  const src = [
    { id: "s0", label: "A", position: 0, coffeeId: "c1", referenceRank: 1 },
    { id: "s1", label: "B", position: 1, coffeeId: "gone", referenceRank: 2 },
    { id: "s2", label: "C", position: 2, coffeeId: null, referenceRank: null },
  ];
  const first = () => 0;
  it("copies every reference rank and nulls unusable coffees", () => {
    const plan = planDuplicateSamples(src, new Set(["c1"]), first, "es");
    expect(plan.samples.map((s) => s.referenceRank)).toEqual([1, 2, null]);
    expect(plan.samples[1]).toMatchObject({ label: "B", coffeeId: null });
    expect(plan.samples[0].coffeeId).toBe("c1");
    expect(plan.droppedCoffees).toBe(1);
  });

  it("keeps owner-typed labels in place", () => {
    const plan = planDuplicateSamples(src, new Set(["c1"]), () => 0, "es");
    expect(plan.samples.map((s) => [s.sourceId, s.label, s.position])).toEqual([
      ["s0", "A", 0],
      ["s1", "B", 1],
      ["s2", "C", 2],
    ]);
  });

  // A4: a duplicate must not reuse the source's letter <-> coffee mapping.
  const auto = [
    { id: "a", label: "Muestra A", position: 0, coffeeId: "c1", referenceRank: null },
    { id: "b", label: "Muestra B", position: 1, coffeeId: "c2", referenceRank: 1 },
    { id: "c", label: "Muestra C", position: 2, coffeeId: "c3", referenceRank: null },
  ];
  it("re-shuffles auto-labelled samples, relabels by the new position and keeps rank + coffee with the sample", () => {
    // random(i+1) = 0 always: Fisher-Yates rotates the slots [0,1,2] -> [1,2,0].
    const plan = planDuplicateSamples(auto, new Set(["c1", "c2", "c3"]), () => 0, "es");
    expect(plan.samples.map((s) => s.position)).toEqual([0, 1, 2]);
    const bySource = Object.fromEntries(plan.samples.map((s) => [s.sourceId, s]));
    expect(bySource.a.position).not.toBe(0);
    for (const s of plan.samples) {
      expect(s.label).toBe(`Muestra ${"ABC"[s.position]}`);
    }
    expect(bySource.b).toMatchObject({ coffeeId: "c2", referenceRank: 1 });
    expect(bySource.a.coffeeId).toBe("c1");
    expect(bySource.c.coffeeId).toBe("c3");
  });

  it("every order is reachable and typed labels stay fixed in a mixed list", () => {
    const mixed = [
      { id: "a", label: "Muestra A", position: 0, coffeeId: null, referenceRank: null },
      { id: "t", label: "Mi lote", position: 1, coffeeId: null, referenceRank: null },
      { id: "c", label: "Muestra C", position: 2, coffeeId: null, referenceRank: null },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const plan = planDuplicateSamples(mixed, new Set(), (n) => Math.floor(Math.random() * n), "en");
      const t = plan.samples.find((s) => s.sourceId === "t")!;
      expect(t).toMatchObject({ label: "Mi lote", position: 1 });
      seen.add(plan.samples.map((s) => s.sourceId).join(""));
    }
    expect([...seen].sort()).toEqual(["atc", "cta"]);
  });
});

describe("defaultSampleLabel (A4)", () => {
  it("is the letter form of the position", () => {
    expect(defaultSampleLabel(3, "es")).toBe("Muestra D");
    expect(defaultSampleLabel(0, "en")).toBe("Sample A");
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
