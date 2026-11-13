import { describe, expect, it } from "vitest";
import { reconcileUnpinned } from "@/lib/sampleReconcile";
import { pinReferenceAffective } from "@/lib/referenceRules";

// S10 WP5b review H1, client half: the page's module for a sample that stopped being the
// pinned reference takes the server's restored values for the pinned keys only.

const rated = (v: number) => ({ fragancia_af_final: v, aroma_af_final: v, tazas_no_uniformes: [true, false] });
const sample = (id: string, affective: Record<string, unknown>) => ({ id, affective, combined: {} as Record<string, unknown> });

describe("reconcileUnpinned", () => {
  const pinned = { ...pinReferenceAffective(rated(7), 2), notas: "mía" };

  it("adopts the server's pinned keys, keeps the local descriptive edit, reports the sample", () => {
    const { samples, adopted } = reconcileUnpinned(
      [sample("A", pinned)],
      [sample("A", { ...rated(7), notas: "vieja" })],
      new Set(["A"]),
      "B",
    );
    expect(adopted).toEqual(["A"]);
    expect(samples[0].affective.fragancia_af_final).toBe(7);
    expect(samples[0].affective.tazas_no_uniformes).toEqual([true, false]);
    expect(samples[0].affective.notas).toBe("mía");
  });

  it("leaves a sample that is still the pinned reference alone", () => {
    const { samples, adopted } = reconcileUnpinned([sample("A", pinned)], [sample("A", rated(7))], new Set(["A"]), "A");
    expect(adopted).toEqual([]);
    expect(samples[0].affective.fragancia_af_final).toBe(5);
  });

  it("leaves samples never viewed under the pin, and samples the server dropped, alone", () => {
    const res = reconcileUnpinned([sample("A", pinned), sample("C", pinned)], [sample("A", rated(7))], new Set(["C"]), null);
    expect(res.adopted).toEqual([]);
    expect(res.samples[0].affective.fragancia_af_final).toBe(5);
    expect(res.samples[1].affective.fragancia_af_final).toBe(5);
  });
});
