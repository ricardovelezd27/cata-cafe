import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES, CUPPING_STEPS } from "@/lib/constants";
import { isAffectiveDeclaredPartial } from "@/lib/affectivePartial";
import { sessionMissing, stepMissing, isAllNotEvaluated, type SampleModules } from "@/lib/completeness";
import { isEvaluationComplete } from "@/lib/evaluationState";
import { computeCoffeeAggregate, type CoffeeAggregateSampleInput } from "@/lib/coffeeAggregate";
import { filterCoffeeSamples, type RawCoffeeSample } from "@/lib/coffees/filterCoffeeSamples";
import { buildCvaFormData } from "@/lib/pdf/cvaFormData";

// S10 WP3b review round (#137). TODO(kim-validar:C4)
const IDS = AFFECTIVE_ATTRIBUTES.map((a) => a.id);
const all = (v: number): Record<string, unknown> => Object.fromEntries(IDS.map((id) => [`${id}_final`, v]));

describe("1. the helper's TS twin reads a rating ONLY when the JSON value is a number", () => {
  const base = (() => {
    const d: Record<string, unknown> = { ...all(6), impresion_global_ne: true };
    delete d["impresion_global_final"];
    return d;
  })();

  it("a partial with numeric ratings is a partial; any non-number rating reads as not rated", () => {
    expect(isAffectiveDeclaredPartial(base)).toBe(true);
    for (const odd of ["abc", true, "7", "NaN", null, {}, [1], NaN, Infinity]) {
      expect(isAffectiveDeclaredPartial({ ...base, aroma_af_final: odd }), String(odd)).toBe(false);
    }
  });

  it("`_final` first, else the bare key, each only when a number", () => {
    const d: Record<string, unknown> = { ...base };
    delete d["aroma_af_final"];
    expect(isAffectiveDeclaredPartial({ ...d, aroma_af: 5 })).toBe(true);
    expect(isAffectiveDeclaredPartial({ ...d, aroma_af_final: "x", aroma_af: 5 })).toBe(true); // falls to the bare key
    expect(isAffectiveDeclaredPartial({ ...d, aroma_af_final: 0, aroma_af: 5 })).toBe(false); // a numeric _final wins
    expect(isAffectiveDeclaredPartial({ ...d, aroma_af: "5" })).toBe(false);
  });
});

describe("5. all eight sections marked 'no evaluado' is NOT finished", () => {
  const allNe = Object.fromEntries(IDS.map((id) => [`${id}_ne`, true]));
  const modules = (affective: Record<string, unknown>): SampleModules => ({ affective, descriptive: {}, combined: {} });

  it("neither complete nor a partial, so not finished", () => {
    expect(isAffectiveDeclaredPartial(allNe)).toBe(false);
    expect(isEvaluationComplete("affective", allNe)).toBe(false);
    expect(isAllNotEvaluated(allNe)).toBe(true);
  });

  it("completeness reports every section missing, and the roll-up flags the sample", () => {
    expect(stepMissing(modules(allNe), "aroma", "affective")).toEqual(["aroma_af"]);
    const gaps = sessionMissing(
      [{ label: "A", ...modules(allNe) }],
      [...CUPPING_STEPS],
      "affective",
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].allNotEvaluated).toBe(true);
    expect(gaps[0].sections).toHaveLength(IDS.length);
  });

  it("seven marked + one rated stays finished (a real partial), and the roll-up does not flag it", () => {
    const seven = { ...allNe, aroma_af_final: 5 };
    delete (seven as Record<string, unknown>)["aroma_af_ne"];
    expect(isEvaluationComplete("affective", seven)).toBe(true);
    expect(stepMissing(modules(seven), "fragrance", "affective")).toEqual([]);
    expect(sessionMissing([{ label: "A", ...modules(seven) }], ["fragrance", "aroma"], "affective")).toEqual([]);
  });
});

describe("2. coffee profile: a sample's weight in the attribute merge counts its partial evaluations", () => {
  // The attribute merge exactly as it was on main (reference copy): weight = participantCount.
  function mainAttrMerge(samples: CoffeeAggregateSampleInput[]) {
    const out: Record<string, number> = {};
    for (const attr of AFFECTIVE_ATTRIBUTES) {
      let ws = 0, w = 0, us = 0, uc = 0;
      for (const s of samples) {
        const agg = s.aggregateScore;
        if (!agg || typeof agg.attrAverages !== "object" || agg.attrAverages === null) continue;
        const raw = (agg.attrAverages as Record<string, unknown>)[attr.label];
        if (typeof raw !== "number") continue;
        const wt = agg.participantCount ?? 0;
        ws += raw * wt; w += wt; us += raw; uc += 1;
      }
      if (uc === 0) continue;
      out[attr.label] = Math.round((w > 0 ? ws / w : us / uc) * 100) / 100;
    }
    return out;
  }
  const mk = (id: string, participantCount: number, attr: number, partialCount?: number): CoffeeAggregateSampleInput => ({
    id,
    sessionId: "s" + id,
    session: { id: "s" + id, name: "n", date: new Date("2026-10-01") },
    aggregateScore: {
      communityScore: 80,
      participantCount,
      attrAverages: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.label, attr])),
    },
    evaluations: [],
    ...(partialCount === undefined ? {} : { partialCount }),
  });

  it("without partials the output is identical to main's function (varied fixtures)", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 200; n++) {
      const samples = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) =>
        mk(String(i), Math.floor(rnd() * 6), 1 + Math.round(rnd() * 80) / 10, rnd() < 0.5 ? undefined : 0),
      );
      expect(computeCoffeeAggregate(samples).attrAverages).toEqual(mainAttrMerge(samples));
    }
  });

  it("a sample with ONLY partial evaluations (participantCount 0) is no longer dropped; weights add", () => {
    const merged = computeCoffeeAggregate([mk("a", 2, 6), mk("b", 0, 9, 1)]).attrAverages;
    expect(merged["Fragancia"]).toBe(7); // (6 * 2 + 9 * 1) / 3
    // main would have dropped the partial-only sample (weight 0):
    expect(mainAttrMerge([mk("a", 2, 6), mk("b", 0, 9, 1)])["Fragancia"]).toBe(6);
    // a partial next to complete ones in the same sample adds to its weight
    expect(computeCoffeeAggregate([mk("a", 1, 6, 1), mk("b", 1, 9)]).attrAverages["Fragancia"]).toBe(7); // (6 * 2 + 9 * 1) / 3
  });
});

describe("2b. filterCoffeeSamples carries a partialCount (a number, no cupper id)", () => {
  const ev = (cupperId: string, data: Record<string, unknown>) => ({
    cupperId,
    descriptiveData: {},
    affectiveData: data,
    combinedData: {},
    nonUniformCups: [] as boolean[],
    defectiveCups: [] as boolean[],
    cups: 2,
    individualScore: null,
    submittedAt: new Date("2026-10-02"),
  });
  const partial = (() => {
    const d: Record<string, unknown> = { ...all(7), sabor_af_ne: true };
    delete d["sabor_af_final"];
    return d;
  })();
  const raw: RawCoffeeSample[] = [
    {
      id: "x",
      sessionId: "s1",
      revealed: true,
      referenceRank: null,
      session: {
        id: "s1", name: "N", date: new Date("2026-10-01"), closedAt: null, status: "closed", format: "affective",
        cupsPerSample: 2, referenceMode: "anchor", createdBy: "owner", participants: [{ userId: "u3", excludedFromResults: true }],
      },
      aggregateScore: { communityScore: 80, participantCount: 1, attrAverages: {} },
      evaluations: [ev("u1", all(6)), ev("u2", partial), ev("u3", partial)],
    } as unknown as RawCoffeeSample,
  ];

  it("counts declared partials among the surviving (non-excluded) evaluations", () => {
    const out = filterCoffeeSamples(raw, { userId: "owner", isAdmin: false });
    expect(out[0].partialCount).toBe(1);
    expect(JSON.stringify(out[0])).not.toContain("u2");
  });
});

describe("6. the CVA form labels a declared partial differently from an unmarked incomplete one", () => {
  const input = (affective: Record<string, unknown>) => ({
    ownerView: false,
    format: "affective",
    sessionName: "S",
    date: "1 oct 2026",
    cupperName: "Ana",
    purpose: "",
    cupsPerSample: 5,
    locale: "es" as const,
    sample: {
      label: "A", revealed: false, coffeeName: "x", roastLevel: "", descriptive: {}, affective, combined: {},
      physical: {}, extrinsic: {},
    },
  });
  it("declared partial: partialDeclared; unmarked incomplete: unchanged", () => {
    const declared: Record<string, unknown> = { ...all(7), sabor_af_ne: true };
    delete declared["sabor_af_final"];
    const a = buildCvaFormData(input(declared));
    expect(a.scoreState).toBe("partial");
    expect(a.partialDeclared).toBe(true);
    const unmarked = buildCvaFormData(input({ fragancia_af_final: 7, aroma_af_final: 8 }));
    expect(unmarked.scoreState).toBe("partial");
    expect(unmarked.partialDeclared).toBeUndefined();
  });
});
