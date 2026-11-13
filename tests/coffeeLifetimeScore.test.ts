import { describe, it, expect } from "vitest";
import {
  computeCoffeeLifetimeScore,
  nonUniformOnlyCount,
  type LifetimeEvaluation,
  type LifetimeSample,
} from "@/lib/coffeeLifetimeScore";
import { buildLifetimeLines, LIFETIME_COPY } from "@/lib/coffeeLifetimeLines";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { computeGroupAggregate } from "@/lib/scoring";

// Written FIRST from docs/product/cata-descentralizada-puntaje.md (§3, the
// "Comprobaciones" table, §5 decisions 2-5 and 7) and the S10 WP1c brief.
// TODO(kim-validar:A2)

const ratings = (n: number, final = true): Record<string, unknown> =>
  Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [final ? `${a.id}_final` : a.id, n]));

type EvOpts = {
  cupper?: number;
  rating?: number | null; // null = no ratings at all
  partial?: boolean; // 7 of 8 ratings
  cups?: number | null; // evaluation.cups (null = legacy)
  nu?: number[]; // indexes of non-uniform cups
  def?: number[]; // indexes of defective cups
  types?: (string | null)[];
  legacyKey?: boolean; // module without the per-cup type key
  column?: "affectiveData" | "combinedData";
};

let nextCupper = 100;

function ev(o: EvOpts = {}): LifetimeEvaluation {
  const cups = o.cups === undefined ? 2 : o.cups;
  const n = cups ?? 2;
  const flags = (idx: number[] | undefined) => Array.from({ length: n }, (_, i) => (idx ?? []).includes(i));
  let data: Record<string, unknown> = {};
  if (o.rating !== null) {
    data = ratings(o.rating ?? 5);
    if (o.partial) delete data[`${AFFECTIVE_ATTRIBUTES[0].id}_final`];
  }
  data.tazas_defectuosas = flags(o.def);
  data.tazas_no_uniformes = flags(o.nu);
  if (!o.legacyKey && o.types) data.tazas_defecto_tipo = o.types;
  const column = o.column ?? "affectiveData";
  return {
    cupperKey: o.cupper ?? nextCupper++,
    affectiveData: column === "affectiveData" ? data : {},
    combinedData: column === "combinedData" ? data : {},
    nonUniformCups: flags(o.nu),
    defectiveCups: flags(o.def),
    cups,
  };
}

type SmpOpts = {
  sessionId?: string;
  format?: string;
  cupsPerSample?: number;
  mode?: string | null;
  rank?: number | null;
};

function smp(evs: LifetimeEvaluation[], o: SmpOpts = {}): LifetimeSample {
  return {
    sessionId: o.sessionId ?? "s1",
    referenceRank: o.rank ?? null,
    session: {
      format: o.format ?? "affective",
      cupsPerSample: o.cupsPerSample ?? 2,
      referenceMode: o.mode ?? "anchor",
    },
    evaluations: evs,
  };
}

describe("coffee lifetime score: the decision's example (§3)", () => {
  it("1 person, 2 cups, 1 defective -> -6", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ def: [0], nu: [0], types: ["moldy", null] })])]);
    expect(r.base).toBeCloseTo(79, 10);
    expect(r.deduction).toBe(6);
    expect(r.score).toBe(73);
    expect(r.cups).toBe(2);
    expect(r.indicative).toBe(true);
  });

  it("+ 4 people with 2 clean cups each = 10 cups -> -3", () => {
    const evs = [ev({ def: [0], nu: [0], types: ["moldy", null] }), ...[1, 2, 3, 4].map(() => ev())];
    const r = computeCoffeeLifetimeScore([smp(evs)]);
    expect(r.cups).toBe(10);
    expect(r.deduction).toBe(3);
    expect(r.factor).toBe(0.5);
    expect(r.score).toBe(76);
    expect(r.indicative).toBe(false);
  });

  it("40 cups, 1 defective -> -0.75", () => {
    const evs = [ev({ def: [0], nu: [0] }), ...Array.from({ length: 19 }, () => ev())];
    const r = computeCoffeeLifetimeScore([smp(evs)]);
    expect(r.cups).toBe(40);
    expect(r.deduction).toBe(0.75);
    expect(r.score).toBe(78.25);
  });

  it("café with 3 closed sessions, 10 cups in total, 1 defective -> -3, sessions counted", () => {
    const a = smp([ev({ def: [0], nu: [0] }), ev(), ev()], { sessionId: "a" }); // 6 cups
    const b = smp([ev(), ev()], { sessionId: "b" }); // 4 cups
    const c = smp([], { sessionId: "c" });
    const r = computeCoffeeLifetimeScore([a, b, c]);
    expect(r.cups).toBe(10);
    expect(r.deduction).toBe(3);
    expect(r.sessions).toBe(2); // only sessions that fed cups
    expect(r.voices).toBe(5);
  });

  it("a 5-cup person, 1 non-uniform only -> -2 (flat up to five cups)", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cups: 5, nu: [1] })], { cupsPerSample: 5 })]);
    expect(r.deduction).toBe(2);
  });

  it("1 cup, defective -> -4; uniformity does not exist", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cups: 1, def: [0], nu: [0] })], { cupsPerSample: 1 })]);
    // quick impression: ratings do not feed the base, but the cup and defect do
    expect(r.cups).toBe(1);
    expect(r.deduction).toBe(4);
    expect(r.tally.nonUniform).toBe(0);
  });
});

describe("what feeds the base and what feeds the cups (the brief's table)", () => {
  it("an excluded cupper never reaches the function (the filter drops them): nothing to count", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ rating: 7 })])]);
    expect(r.voices).toBe(1);
  });

  it("descriptive format contributes nothing", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ def: [0] })], { format: "descriptive" })]);
    expect(r.score).toBeNull();
    expect(r.cups).toBe(0);
    expect(r.voices).toBe(0);
    expect(r.tally.defective).toBe(0);
  });

  it("quick impression (1 cup per sample): ratings do not move B, its defective cup moves the deduction and the tally", () => {
    const normal = smp([ev({ rating: 7, cups: 2 })], { sessionId: "n", cupsPerSample: 2 });
    const quick = smp([ev({ rating: 9, cups: 1, def: [0], types: ["phenolic"] })], { sessionId: "q", cupsPerSample: 1 });
    const r = computeCoffeeLifetimeScore([normal, quick]);
    expect(r.base).toBeCloseTo(0.65625 * 56 + 52.75, 10); // only the rating-7 evaluation
    expect(r.voices).toBe(1);
    expect(r.cups).toBe(3);
    expect(r.deduction).toBe(4); // defective, 1 cup, 3 pooled cups: flat
    expect(r.tally.byType.phenolic).toBe(1);
    expect(r.tally.defective).toBe(1);
    expect(r.sessions).toBe(2);
  });

  it("only quick impressions: no base, no score, but the tally stands", () => {
    const r = computeCoffeeLifetimeScore([
      smp([ev({ cups: 1, def: [0], types: ["moldy"] })], { cupsPerSample: 1 }),
    ]);
    expect(r.score).toBeNull();
    expect(r.base).toBeNull();
    expect(r.tally.defective).toBe(1);
    expect(r.tally.byType.moldy).toBe(1);
    expect(r.cups).toBe(1);
  });

  it("incomplete ratings (partly filled) feed nothing: not the base, not the cups, not the flags (H1)", () => {
    const complete = ev({ rating: 7 });
    const partial = ev({ rating: 9, partial: true, def: [0], nu: [0] });
    const r = computeCoffeeLifetimeScore([smp([complete, partial])]);
    expect(r.voices).toBe(1);
    expect(r.base).toBeCloseTo(0.65625 * 56 + 52.75, 10);
    expect(r.cups).toBe(2);
    expect(r.deduction).toBe(0);
    expect(r.tally.defective).toBe(0);
    expect(r.tally.foundBy).toBe(0);
  });

  it("an EMPTY submitted evaluation feeds nothing (reviewer scenario: 2 cups 1 defective + 4 empty -> -6, not -3)", () => {
    const real = ev({ rating: 5, def: [0], nu: [0] });
    const empties = [1, 2, 3, 4].map(() => ev({ rating: null }));
    const r = computeCoffeeLifetimeScore([smp([real, ...empties])]);
    expect(r.cups).toBe(2);
    expect(r.deduction).toBe(6);
    expect(r.voices).toBe(1);
    expect(r.score).toBe(73);
  });

  it("partly filled evaluations do not make the coffee show less than its only session (reviewer scenario)", () => {
    const real = ev({ rating: 7, def: [0], nu: [0] });
    const partials = [1, 2].map(() => ev({ rating: 6, partial: true }));
    const r = computeCoffeeLifetimeScore([smp([real, ...partials])]);
    expect(r.deduction).toBe(6);
    expect(r.cups).toBe(2);
  });

  it("a coffee with ONE session shows the deduction of that session's group score (seeded random cases)", () => {
    let seed = 777;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let run = 0; run < 400; run++) {
      const cupsPer = 2 + Math.floor(rnd() * 4); // 2..5 (not a quick impression)
      const evs: LifetimeEvaluation[] = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => {
        const nu = Array.from({ length: cupsPer }, () => rnd() < 0.3);
        const def = Array.from({ length: cupsPer }, () => rnd() < 0.2);
        const kind = rnd();
        const data: Record<string, unknown> =
          kind < 0.6
            ? { ...ratings(1 + Math.floor(rnd() * 9)), tazas_defectuosas: def, tazas_no_uniformes: nu }
            : kind < 0.8
              ? { ...ratings(6), tazas_defectuosas: def, tazas_no_uniformes: nu, [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: 0 }
              : { tazas_defectuosas: def, tazas_no_uniformes: nu };
        return {
          cupperKey: 1,
          affectiveData: data,
          combinedData: {},
          nonUniformCups: nu,
          defectiveCups: def,
          cups: rnd() < 0.2 ? null : cupsPer,
        };
      });
      const coffee = computeCoffeeLifetimeScore([smp(evs, { cupsPerSample: cupsPer })]);
      const group = computeGroupAggregate(
        evs.map((e) => ({
          data: e.affectiveData as Record<string, unknown>,
          nonUniformCups: [...e.nonUniformCups],
          defectiveCups: [...e.defectiveCups],
          cups: e.cups ?? undefined,
        })),
        cupsPer,
      );
      expect(coffee.cups).toBe(group.totalCups);
      expect(coffee.deduction).toBeCloseTo(group.uniformityPenalty + group.defectPenalty, 9);
      if (group.communityScore !== null && group.included > 0) expect(coffee.score).toBe(group.communityScore);
    }
  });

  it("an anchor-mode reference sample is out entirely (base, cups, flags, tally)", () => {
    const anchor = smp([ev({ rating: 5, def: [0], nu: [0] })], { sessionId: "a", rank: 1, mode: "anchor" });
    const other = smp([ev({ rating: 7 })], { sessionId: "b" });
    const r = computeCoffeeLifetimeScore([anchor, other]);
    expect(r.voices).toBe(1);
    expect(r.cups).toBe(2);
    expect(r.deduction).toBe(0);
    expect(r.tally.defective).toBe(0);
    expect(r.sessions).toBe(1);
  });

  it("a free-mode reference sample counts like any other", () => {
    const free = smp([ev({ rating: 7, def: [0], nu: [0] })], { rank: 1, mode: "free" });
    const r = computeCoffeeLifetimeScore([free]);
    expect(r.voices).toBe(1);
    expect(r.cups).toBe(2);
    expect(r.deduction).toBe(6);
  });

  it("a sample of a reference session that is not itself a reference counts normally", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ rating: 7 })], { rank: null, mode: "anchor" })]);
    expect(r.voices).toBe(1);
  });

  it("combined-format sessions read combinedData", () => {
    const r = computeCoffeeLifetimeScore([
      smp([ev({ rating: 7, column: "combinedData" })], { format: "combined" }),
    ]);
    expect(r.voices).toBe(1);
    expect(r.base).toBeCloseTo(0.65625 * 56 + 52.75, 10);
  });

  it("each evaluation is ONE voice in the base whatever its cups (decision 5)", () => {
    const a = ev({ rating: 9, cups: 5 });
    const b = ev({ rating: 5, cups: 1 });
    const r = computeCoffeeLifetimeScore([smp([a], { cupsPerSample: 5 }), smp([b], { sessionId: "s2", cupsPerSample: 2 })]);
    // b's session has 2 cups per sample but b says cups = 1: still one voice
    expect(r.voices).toBe(2);
    expect(r.base).toBeCloseTo(0.65625 * ((72 + 40) / 2) + 52.75, 10);
  });

  it("evaluation.cups NULL falls back to the session's cups per sample", () => {
    const legacy: LifetimeEvaluation = { ...ev({ cups: 3, def: [0], nu: [0] }), cups: null };
    const r = computeCoffeeLifetimeScore([smp([legacy], { cupsPerSample: 3 })]);
    expect(r.cups).toBe(3);
    expect(r.deduction).toBe(6);
  });

  it("evaluation.cups wins over the session's cups per sample", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cups: 2, def: [0], nu: [0] })], { cupsPerSample: 5 })]);
    expect(r.cups).toBe(2);
  });

  it("flags beyond the evaluation's cups are clamped (never more than 6 per cup)", () => {
    const e: LifetimeEvaluation = { ...ev({ cups: 2 }), defectiveCups: [true, true, true, true], nonUniformCups: [true, true, true, true] };
    const r = computeCoffeeLifetimeScore([smp([e])]);
    expect(r.deduction).toBe(12);
    expect(r.tally.defective).toBe(2);
  });
});

describe("defect tally", () => {
  it("counts by type, a legacy untyped defective cup is 'sin especificar' and still deducts", () => {
    const typed = ev({ def: [0, 1], nu: [0, 1], types: ["moldy", "potato"] });
    const legacy = ev({ def: [0], nu: [0], legacyKey: true });
    const r = computeCoffeeLifetimeScore([smp([typed, legacy])]);
    expect(r.tally.byType.moldy).toBe(1);
    expect(r.tally.byType.potato).toBe(1);
    expect(r.tally.byType.phenolic).toBe(0);
    expect(r.tally.unspecified).toBe(1);
    expect(r.tally.defective).toBe(3);
    expect(r.deduction).toBe(18 * (5 / 5)); // 3 defective + 3 non-uniform over 4 cups: 12 + 6
    expect(r.tally.nonUniform).toBe(3);
  });

  it("reports the share of defective cups", () => {
    const evs = [ev({ def: [0], nu: [0] }), ...Array.from({ length: 19 }, () => ev())];
    const r = computeCoffeeLifetimeScore([smp(evs)]);
    expect(r.tally.defectivePct).toBe(2.5);
  });

  it("foundBy counts people, not cups", () => {
    const one = ev({ cupper: 1, def: [0, 1], nu: [0, 1], types: ["moldy", "moldy"] });
    const two = ev({ cupper: 2, def: [0], nu: [0], types: ["moldy", null] });
    const three = ev({ cupper: 3 });
    const r = computeCoffeeLifetimeScore([smp([one, two, three])]);
    expect(r.tally.defective).toBe(3);
    expect(r.tally.foundBy).toBe(2);
  });

  it("foundBy counts one person once across sessions", () => {
    const a = smp([ev({ cupper: 1, def: [0], nu: [0] })], { sessionId: "a" });
    const b = smp([ev({ cupper: 1, def: [1], nu: [1] })], { sessionId: "b" });
    expect(computeCoffeeLifetimeScore([a, b]).tally.foundBy).toBe(1);
  });

  it("an anchor reference's flags are not found by anyone", () => {
    const anchor = smp([ev({ cupper: 1, def: [0], nu: [0] })], { rank: 1, mode: "anchor" });
    expect(computeCoffeeLifetimeScore([anchor]).tally.foundBy).toBe(0);
  });

  it("no defective cup: no percentage ratio problem", () => {
    const r = computeCoffeeLifetimeScore([smp([ev()])]);
    expect(r.tally.defective).toBe(0);
    expect(r.tally.defectivePct).toBe(0);
    expect(r.tally.foundBy).toBe(0);
  });

  it("no cups at all: percentage is null", () => {
    const r = computeCoffeeLifetimeScore([]);
    expect(r.tally.defectivePct).toBeNull();
    expect(r.score).toBeNull();
    expect(r.cups).toBe(0);
    expect(r.indicative).toBe(true);
  });
});

describe("indicative = fewer than 5 pooled cups", () => {
  it("4 cups yes, 5 cups no", () => {
    expect(computeCoffeeLifetimeScore([smp([ev(), ev()])]).indicative).toBe(true);
    expect(computeCoffeeLifetimeScore([smp([ev(), ev(), ev()])]).indicative).toBe(false);
  });
});

describe("score bounds and the output", () => {
  it("clamps to 0..100 and rounds to a quarter", () => {
    const heavy = ev({ rating: 1, cups: 5, def: [0, 1, 2, 3, 4], nu: [0, 1, 2, 3, 4] });
    const r = computeCoffeeLifetimeScore([smp([heavy], { cupsPerSample: 5 })]);
    expect(r.score).toBe(28); // 58 - 30: six per cup is the ceiling, no negative runaway
    const top = computeCoffeeLifetimeScore([smp([ev({ rating: 9 })])]);
    expect(top.score).toBe(100);
    const odd = computeCoffeeLifetimeScore([smp([ev({ rating: 5 }), ev({ rating: 6 })])]);
    expect(((odd.score as number) * 4) % 1).toBe(0);
  });

  it("the output carries no cupper id: only numbers", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cupper: 987654, def: [0], nu: [0] })])]);
    expect(Object.keys(r).sort()).toEqual(
      ["anchorReferenceSessions", "base", "cups", "deduction", "factor", "indicative", "noBaseReason", "score", "sessions", "tally", "voices"].sort(),
    );
    expect(Object.keys(r.tally).sort()).toEqual(
      ["byType", "defective", "defectivePct", "foundBy", "nonUniform", "nonUniformOnly", "unspecified"].sort(),
    );
    expect(JSON.stringify(r)).not.toContain("987654");
    const walk = (v: unknown): void => {
      if (v === null) return;
      if (typeof v === "object") Object.values(v as object).forEach(walk);
      else expect(["number", "boolean", "string"]).toContain(typeof v);
    };
    walk(r);
    expect(["quick", "anchor", "incomplete", null]).toContain(r.noBaseReason);
  });

  it("property: the deduction never exceeds 6 per flagged cup (seeded random cases)", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let run = 0; run < 300; run++) {
      const evs: LifetimeEvaluation[] = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => {
        const cups = 1 + Math.floor(rnd() * 6);
        const len = Math.floor(rnd() * 9);
        const nu = Array.from({ length: len }, () => rnd() < 0.4);
        const def = Array.from({ length: len }, () => rnd() < 0.3);
        return {
          cupperKey: 1,
          affectiveData: { ...ratings(6), tazas_defectuosas: def, tazas_no_uniformes: nu },
          combinedData: {},
          nonUniformCups: nu,
          defectiveCups: def,
          cups,
        };
      });
      const r = computeCoffeeLifetimeScore([smp(evs, { cupsPerSample: 2 })]);
      const flaggedCups = r.tally.defective + r.tally.nonUniform; // upper bound on flagged cups
      expect(r.deduction).toBeLessThanOrEqual(6 * flaggedCups + 1e-9);
      expect(r.deduction).toBeLessThanOrEqual(4 * r.tally.defective + 2 * r.tally.nonUniform + 1e-9);
      expect(r.deduction).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("anchor references are counted, quick impressions are classified, non-uniform-only is positional", () => {
  it("anchorReferenceSessions counts the distinct sessions skipped for being an anchor reference", () => {
    const a1 = smp([ev({ rating: 5 })], { sessionId: "a", rank: 1, mode: "anchor" });
    const a2 = smp([ev({ rating: 5 })], { sessionId: "a", rank: 2, mode: "anchor" });
    const b = smp([ev({ rating: 5 })], { sessionId: "b", rank: 1, mode: "anchor" });
    const free = smp([ev({ rating: 5 })], { sessionId: "c", rank: 1, mode: "free" });
    const r = computeCoffeeLifetimeScore([a1, a2, b, free]);
    expect(r.anchorReferenceSessions).toBe(2);
    expect(computeCoffeeLifetimeScore([smp([ev()])]).anchorReferenceSessions).toBe(0);
  });

  it("noBaseReason: quick / anchor / incomplete / null", () => {
    const quick = smp([ev({ cups: 1 })], { cupsPerSample: 1 });
    const anchor = smp([ev()], { rank: 1, mode: "anchor" });
    const partial = smp([ev({ partial: true })]);
    expect(computeCoffeeLifetimeScore([quick]).noBaseReason).toBe("quick");
    expect(computeCoffeeLifetimeScore([anchor]).noBaseReason).toBe("anchor");
    expect(computeCoffeeLifetimeScore([partial]).noBaseReason).toBe("incomplete");
    expect(computeCoffeeLifetimeScore([]).noBaseReason).toBe("incomplete");
    expect(computeCoffeeLifetimeScore([smp([ev()])]).noBaseReason).toBeNull();
  });

  it("nonUniformOnly = cups non-uniform and NOT defective; a defective cup also flagged non-uniform is one cup", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cups: 3, def: [0], nu: [0, 1, 2] })], { cupsPerSample: 3 })]);
    expect(r.tally.defective).toBe(1);
    expect(r.tally.nonUniform).toBe(3);
    expect(r.tally.nonUniformOnly).toBe(2);
    expect(r.deduction).toBe(4 + 2 * 3);
  });

  it("legacy row: a defective cup NOT flagged non-uniform is not counted as non-uniform-only", () => {
    const e = { ...ev({ cups: 3, def: [0], nu: [1] }) };
    const r = computeCoffeeLifetimeScore([smp([e], { cupsPerSample: 3 })]);
    expect(r.tally.defective).toBe(1);
    expect(r.tally.nonUniformOnly).toBe(1);
    expect(r.tally.nonUniform).toBe(1);
  });

  it("with one cup there is no non-uniformity at all", () => {
    const r = computeCoffeeLifetimeScore([smp([ev({ cups: 1, def: [0], nu: [0] })], { cupsPerSample: 1 })]);
    expect(r.tally.nonUniformOnly).toBe(0);
  });
});


// Second review of S10 WP1c: the no-base sentence must be true, and a legacy row
// whose flag arrays do not fit its cups never yields a deduction without a reason
// or a sentence naming more cups than were cupped.
describe("no-base reason is true for mixed coffees; non-uniform-only wording follows the deducted totals", () => {
  it("'anchor' only when EVERY scored cupping was as the fixed reference", () => {
    const anchor = smp([ev()], { sessionId: "a", rank: 1, mode: "anchor" });
    const partial = smp([ev({ partial: true })], { sessionId: "b" });
    const descriptive = smp([ev()], { sessionId: "c", format: "descriptive" });
    expect(computeCoffeeLifetimeScore([anchor]).noBaseReason).toBe("anchor");
    expect(computeCoffeeLifetimeScore([anchor, partial]).noBaseReason).toBe("incomplete");
    expect(computeCoffeeLifetimeScore([anchor, descriptive]).noBaseReason).toBe("incomplete");
  });

  it("'descriptive' when the coffee only has descriptive cuppings", () => {
    const descriptive = smp([ev()], { format: "descriptive" });
    expect(computeCoffeeLifetimeScore([descriptive]).noBaseReason).toBe("descriptive");
    expect(computeCoffeeLifetimeScore([descriptive, smp([ev({ partial: true })])]).noBaseReason).toBe("incomplete");
  });

  it("nonUniformOnlyCount: positional when the arrays fit, u - d when a legacy row's flags fall outside its cups", () => {
    // fits: cup 1 defective + non-uniform, cup 2 non-uniform only
    expect(nonUniformOnlyCount([true, true], [true, false], 2, 2, 1)).toBe(1);
    // a flag beyond the cup count: the deduction used u = 1, the sentence must name 1 cup
    expect(nonUniformOnlyCount([false, false, true], [false, false, false], 2, 1, 0)).toBe(1);
    // defective flag beyond the cup count: 1 defective + 1 non-uniform-only = 2 cups, never 3
    expect(nonUniformOnlyCount([true, true], [false, false, true], 2, 2, 1)).toBe(1);
    expect(nonUniformOnlyCount([], [], 2, 0, 0)).toBe(0);
  });

  it("a legacy row with a non-uniform flag beyond its cups: the deduction has a stated reason", () => {
    const e: LifetimeEvaluation = {
      ...ev({ rating: 7, cups: null }),
      nonUniformCups: [false, false, true],
      defectiveCups: [false, false, false],
    };
    const r = computeCoffeeLifetimeScore([smp([e], { cupsPerSample: 2 })]);
    expect(r.deduction).toBe(2);
    expect(r.tally.nonUniformOnly).toBe(1);
    const line = buildLifetimeLines(r, LIFETIME_COPY.es).arithmetic as string;
    expect(line).not.toContain("()");
    expect(line).toContain("1 ");
  });

  it("random legacy rows: named cups never exceed cups cupped, and a deduction always has a reason", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 1500; i++) {
      const cups = 2 + Math.floor(rnd() * 4);
      const len = cups + Math.floor(rnd() * 3) - 1;
      const arr = () => Array.from({ length: Math.max(0, len) }, () => rnd() < 0.3);
      const e: LifetimeEvaluation = { ...ev({ rating: 6, cups: null }), nonUniformCups: arr(), defectiveCups: arr() };
      const r = computeCoffeeLifetimeScore([smp([e], { cupsPerSample: cups })]);
      expect(r.tally.defective + r.tally.nonUniformOnly).toBeLessThanOrEqual(cups);
      if (r.deduction > 0) {
        expect(r.tally.defective + r.tally.nonUniformOnly).toBeGreaterThan(0);
        expect(buildLifetimeLines(r, LIFETIME_COPY.es).arithmetic as string).not.toContain("()");
      }
    }
  });
});
