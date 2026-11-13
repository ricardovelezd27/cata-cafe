import { describe, expect, it } from "vitest";
import {
  blindReferencePosition,
  finalSampleLabel,
  isAutoLabelFor,
  isBlankSampleLabel,
  planBlindOrder,
  planBlindSamples,
} from "@/lib/blindLabels";
import { activeCopyPosition, planDuplicateSamples } from "@/lib/sessionEdit";

/** Small deterministic PRNG (mulberry32) -> random(n) in [0, n). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

describe("the two label modes (A4 review)", () => {
  it("create: only a blank label is automatic; a typed 'Muestra B' is kept verbatim at its position", () => {
    for (const l of ["", "   ", null, undefined]) expect(isBlankSampleLabel(l)).toBe(true);
    for (const l of ["Muestra B", "Sample A", "Muestra 3", "Geisha"]) {
      expect(isBlankSampleLabel(l), l).toBe(false);
      expect(isAutoLabelFor("create", l), l).toBe(false);
    }
    const input = [{ label: "Muestra B" }, { label: "" }, { label: "Muestra A" }, { label: "" }];
    for (let seed = 1; seed <= 100; seed++) {
      const out = planBlindSamples(input, seeded(seed), "es"); // default mode = create
      const byIdx = (i: number) => out.find((o) => o.sourceIndex === i)!;
      expect(byIdx(0)).toMatchObject({ label: "Muestra B", position: 0 });
      expect(byIdx(2)).toMatchObject({ label: "Muestra A", position: 2 });
      expect(new Set([byIdx(1).position, byIdx(3).position])).toEqual(new Set([1, 3]));
      const entry = planBlindOrder(input, seeded(seed), "create")[0];
      expect(finalSampleLabel("Muestra B", entry, "es")).toBe("Muestra B");
    }
  });

  it("duplicate: a generated-looking stored label is automatic and is reshuffled", () => {
    expect(isAutoLabelFor("duplicate", "Muestra B")).toBe(true);
    expect(isAutoLabelFor("duplicate", "Geisha")).toBe(false);
    const stored = [{ label: "Muestra A" }, { label: "Muestra B" }, { label: "Mi lote" }, { label: "Muestra D" }];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const plan = planBlindOrder(stored, seeded(seed), "duplicate");
      expect(plan[2]).toEqual({ position: 2, auto: false });
      seen.add(plan.map((p) => p.position).join(","));
    }
    expect(seen.size).toBe(6);
  });
});

describe("blindReferencePosition (action-level remap)", () => {
  type Row = { label: string; coffeeIdx: number; prep: string };
  it("[X0, X1 = reference, X2] with final positions X0->2, X1->0, X2->1: the reference is the row at position 0 carrying X1's coffee and prep", () => {
    const input: Row[] = [
      { label: "", coffeeIdx: 0, prep: "p0" },
      { label: "", coffeeIdx: 1, prep: "p1" },
      { label: "", coffeeIdx: 2, prep: "p2" },
    ];
    let found = false;
    for (let seed = 1; seed <= 2000 && !found; seed++) {
      const planned = planBlindSamples(input, seeded(seed), "es");
      const pos = (i: number) => planned.find((p) => p.sourceIndex === i)!.position;
      if (pos(0) === 2 && pos(1) === 0 && pos(2) === 1) {
        found = true;
        const refPos = blindReferencePosition(planned, 1);
        expect(refPos).toBe(0);
        const refRow = planned.find((p) => p.position === refPos)!;
        expect(refRow.sourceIndex).toBe(1);
        expect(refRow.sample.coffeeIdx).toBe(1);
        expect(refRow.sample.prep).toBe("p1");
        expect(refRow.label).toBe("Muestra A");
      }
    }
    expect(found).toBe(true);
  });
  it("no reference, or an index that is not in the plan, is null", () => {
    const planned = planBlindSamples([{ label: "" }, { label: "" }], seeded(1), "es");
    expect(blindReferencePosition(planned, null)).toBeNull();
    expect(blindReferencePosition(planned, 9)).toBeNull();
  });
  it("every source index maps to its own final position (property)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = Array.from({ length: 6 }, (_, i) => ({ label: i === 3 ? "Fijo" : "" }));
      const planned = planBlindSamples(input, seeded(seed), "en");
      for (let i = 0; i < 6; i++) {
        const pos = blindReferencePosition(planned, i)!;
        expect(planned.find((p) => p.position === pos)!.sourceIndex).toBe(i);
      }
    }
  });
});

describe("activeCopyPosition (duplicate remap)", () => {
  const src = [
    { id: "s0", label: "Muestra A", position: 0, coffeeId: "c0", referenceRank: null },
    { id: "s1", label: "Muestra B", position: 1, coffeeId: "c1", referenceRank: 1 },
    { id: "s2", label: "Muestra C", position: 2, coffeeId: "c2", referenceRank: 2 },
    { id: "s3", label: "Muestra D", position: 3, coffeeId: "c3", referenceRank: null },
  ];
  const usable = new Set(["c0", "c1", "c2", "c3"]);
  it("with two references, both ranks travel and the active one's copy is found at its new position", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const plan = planDuplicateSamples(src, usable, seeded(seed), "es");
      const at = (id: string) => plan.samples.find((s) => s.sourceId === id)!;
      expect(at("s1").referenceRank).toBe(1);
      expect(at("s2").referenceRank).toBe(2);
      expect(plan.samples.filter((s) => s.referenceRank !== null)).toHaveLength(2);
      // The active reference is the highest rank (s2); its copy is the row at the returned position.
      const pos = activeCopyPosition(plan.samples, "s2");
      expect(pos).toBe(at("s2").position);
      expect(plan.samples.find((s) => s.position === pos)!.coffeeId).toBe("c2");
      // Coffee stays with its sample through the shuffle.
      for (const s of src) expect(at(s.id).coffeeId).toBe(s.coffeeId);
    }
  });
  it("no active reference (or one not in the plan) is null", () => {
    const plan = planDuplicateSamples(src, usable, seeded(1), "es");
    expect(activeCopyPosition(plan.samples, null)).toBeNull();
    expect(activeCopyPosition(plan.samples, "nope")).toBeNull();
  });
});
