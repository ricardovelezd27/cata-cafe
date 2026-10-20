import { describe, it, expect } from "vitest";
import { ancestorsOf } from "@/lib/descriptors";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { FLAVOR_WHEEL } from "@/lib/constants";

const leaf = FLAVOR_WHEEL.find((n) => n.level === 3)!;
const l2 = FLAVOR_WHEEL.find((n) => n.id === leaf.parentId)!;

describe("ancestorsOf", () => {
  it("returns root-first ancestors, excluding the node", () => {
    expect(ancestorsOf(leaf.id)).toEqual([l2.parentId, l2.id]);
    expect(ancestorsOf(l2.id)).toEqual([l2.parentId]);
    expect(ancestorsOf(l2.parentId!)).toEqual([]);
    expect(ancestorsOf("acidity:citric")).toEqual([]);
  });
  it("migrates retired ids", () => {
    expect(ancestorsOf("green_veg:dried")).toEqual([]); // → green_veg (L1)
  });
});

describe("rollup", () => {
  it("counts cuppers per group and files typed notes under it", () => {
    const f = computeSampleBlockFrequencies({
      format: "descriptive",
      samples: [{ id: "s1", label: "S1" }],
      evals: ["u1", "u2"].map((u) => ({
        cupperId: u,
        sessionSampleId: "s1",
        descriptiveData: {
          aroma_desc: [leaf.id],
          aroma_desc_notes: u === "u1" ? { [leaf.id]: ["lulo"] } : {},
        },
        combinedData: null,
      })),
      excludedUserIds: new Set(),
      blockLabel: (id) => id,
      locale: "es",
    })!;
    const g = f[0].rollup!.nariz.find((x) => x.id === l2.parentId)!;
    expect(g.count).toBe(2);
    expect(g.notes).toEqual(["lulo"]);
    expect(f[0].rollup!.general.find((x) => x.id === l2.id)?.count).toBe(2);
  });
});
