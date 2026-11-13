import { describe, expect, it } from "vitest";
import { buildScoreLine, groupScopeLine, type ScoreLineLabels } from "@/lib/scoreLine";
import { calcIndividualBreakdown } from "@/lib/scoring";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

const KEY = "tazas_defecto_tipo";
const ES = es.results.breakdown.line as ScoreLineLabels & { groupScope: string };
const EN = en.results.breakdown.line as ScoreLineLabels & { groupScope: string };

function ratings(values: number[]) {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a, i) => [`${a.id}_final`, values[i % values.length]]));
}

/** The evaluation as stored (the server derivation), and its breakdown. */
function stored(extra: Record<string, unknown>, cups: number, values = [8, 7, 8, 7, 8, 7, 8, 7]) {
  const derived = computeEvaluationDerived("affective", { ...ratings(values), ...extra }, cups);
  const data = derived.affectiveData as Record<string, unknown>;
  return { data, derived, b: calcIndividualBreakdown(data, cups) };
}

describe("buildScoreLine: examples", () => {
  it("1 phenolic cup + the non-uniform that comes with it (es / en)", () => {
    const { data, b } = stored({ tazas_defectuosas: [false, true, false], [KEY]: [null, "phenolic", null] }, 3);
    // Σ = 60 -> base 92.125 -> shown rounded to 0.25
    expect(buildScoreLine(b, data, ES)).toBe("92.25 − 4 (1 taza fenólica) − 2 (1 taza no uniforme) = 86.25");
    expect(buildScoreLine(b, data, EN)).toBe("92.25 − 4 (1 phenolic cup) − 2 (1 non-uniform cup) = 86.25");
  });
  it("several types: one term with each count", () => {
    const { data, b } = stored(
      { tazas_defectuosas: [true, true, true], [KEY]: ["phenolic", "moldy", "phenolic"] },
      3,
    );
    expect(buildScoreLine(b, data, ES)).toBe(
      "92.25 − 12 (1 taza mohosa, 2 tazas fenólicas) − 6 (3 tazas no uniformes) = 74.25",
    );
  });
  it("a cup that is only non-uniform: no defect term", () => {
    const { data, b } = stored({ tazas_no_uniformes: [true, false, false] }, 3);
    expect(buildScoreLine(b, data, EN)).toBe("92.25 − 2 (1 non-uniform cup) = 90.25");
  });
  it("one cup: only the defect term (uniformity does not exist)", () => {
    const { data, b } = stored({ tazas_defectuosas: [true], [KEY]: ["potato"] }, 1);
    expect(buildScoreLine(b, data, ES)).toBe("92.25 − 4 (1 taza con papa) = 88.25");
  });
  it("legacy untyped defective cup reads 'sin especificar'", () => {
    const { data, b } = stored({ tazas_defectuosas: [true, false], tazas_no_uniformes: [true, false] }, 2);
    expect(buildScoreLine(b, data, ES)).toBe(
      "92.25 − 4 (1 taza defectuosa, sin especificar) − 2 (1 taza no uniforme) = 86.25",
    );
    expect(buildScoreLine(b, data, EN)).toBe(
      "92.25 − 4 (1 defective cup, unspecified) − 2 (1 non-uniform cup) = 86.25",
    );
  });
  it("no flagged cups: no line, the total stands alone", () => {
    const { data, b } = stored({}, 3);
    expect(buildScoreLine(b, data, ES)).toBeNull();
  });
  it("beyond five cups the factor is stated and the line still adds up (unrounded form)", () => {
    const { data, b } = stored({ tazas_defectuosas: [true, false, false, false, false, false, false, false], [KEY]: ["moldy", null, null, null, null, null, null, null] }, 8);
    const line = buildScoreLine(b, data, ES)!;
    expect(line).toContain("× 5/8");
    expect(line).toBe("92.25 − 2.50 (1 taza mohosa × 5/8) − 1.25 (1 taza no uniforme × 5/8) = 88.50");
  });
  it("a v1 row shows what v1 did: no deduction under five cups -> no line", () => {
    const data = { ...ratings([8, 7, 8, 7, 8, 7, 8, 7]), tazas_defectuosas: [true, false], tazas_no_uniformes: [true, false] };
    const b = calcIndividualBreakdown(data, 2, { rule: "v1" });
    expect(buildScoreLine(b, data, ES)).toBeNull();
  });
  it("a v1 row with five cups shows its deduction (typed 'sin especificar': it never had per-cup types)", () => {
    const data = {
      ...ratings([8, 7, 8, 7, 8, 7, 8, 7]),
      tazas_defectuosas: [true, false, false, false, false],
      tazas_no_uniformes: [true, false, false, false, false],
      defecto_tipo: ["moldy"],
    };
    const b = calcIndividualBreakdown(data, 5, { rule: "v1" });
    expect(buildScoreLine(b, data, ES)).toBe(
      "92.25 − 4 (1 taza defectuosa, sin especificar) − 2 (1 taza no uniforme) = 86.25",
    );
  });
});

describe("buildScoreLine: the last number is always the stored individual score", () => {
  const finalOf = (line: string) => Number(/(\d+(?:\.\d+)?)$/.exec(line)![1]);
  const variants: Array<[string, (n: number) => Record<string, unknown>]> = [
    ["no flags", () => ({})],
    ["one typed defect", (n) => ({ tazas_defectuosas: [true, ...Array(n - 1).fill(false)], [KEY]: ["moldy", ...Array(n - 1).fill(null)] })],
    ["every cup typed", (n) => ({ tazas_defectuosas: Array(n).fill(true), [KEY]: Array(n).fill("phenolic") })],
    ["mixed types + non-uniform", (n) => ({
      tazas_defectuosas: Array.from({ length: n }, (_, i) => i % 2 === 0),
      tazas_no_uniformes: Array.from({ length: n }, (_, i) => i % 3 === 0),
      [KEY]: Array.from({ length: n }, (_, i) => (["potato", "moldy", "phenolic"] as const)[i % 3]),
    })],
    ["non-uniform only", (n) => ({ tazas_no_uniformes: Array(n).fill(true) })],
    ["legacy untyped", (n) => ({ tazas_defectuosas: Array(n).fill(true), tazas_no_uniformes: Array(n).fill(true) })],
  ];
  const ratingSets = [[8, 7, 8, 7, 8, 7, 8, 7], [5], [9], [1], [6, 5, 7, 5, 6, 5, 7, 6], [3, 4, 5]];

  for (const cups of [1, 2, 5, 6, 7, 8]) {
    for (const [name, make] of variants) {
      for (const values of ratingSets) {
        it(`v2, ${cups} cup(s), ${name}, ratings ${values.join("")}`, () => {
          const { data, derived, b } = stored(make(cups), cups, values);
          const line = buildScoreLine(b, data, ES);
          if (line === null) return;
          expect(finalOf(line)).toBe(derived.individualScore);
          expect(finalOf(line)).toBe(b.score);
        });
      }
    }
  }

  for (const cups of [2, 5, 8]) {
    for (const values of ratingSets) {
      it(`v1, ${cups} cup(s), ratings ${values.join("")}`, () => {
        const data = {
          ...ratings(values),
          tazas_defectuosas: Array.from({ length: cups }, (_, i) => i === 0),
          tazas_no_uniformes: Array.from({ length: cups }, (_, i) => i < 2),
        };
        const b = calcIndividualBreakdown(data, cups, { rule: "v1" });
        const line = buildScoreLine(b, data, EN);
        if (line === null) {
          expect(b.uniformityPenalty + b.defectPenalty).toBe(0);
          return;
        }
        expect(finalOf(line)).toBe(b.score);
      });
    }
  }
});

describe("groupScopeLine", () => {
  it("only for pooled cups beyond five under the current rule", () => {
    expect(groupScopeLine(12, "v2", ES.groupScope)).toBe(
      "Entre todos se cataron 12 tazas: el descuento del grupo se reparte entre ellas.",
    );
    expect(groupScopeLine(12, undefined, EN.groupScope)).toBe(
      "Together you cupped 12 cups: the group's deduction is shared across them.",
    );
    expect(groupScopeLine(5, "v2", ES.groupScope)).toBeNull();
    expect(groupScopeLine(0, "v2", ES.groupScope)).toBeNull();
    expect(groupScopeLine(12, "v1", ES.groupScope)).toBeNull();
  });
});
