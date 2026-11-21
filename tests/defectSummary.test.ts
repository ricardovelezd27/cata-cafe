import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES, SENSORY_DEFECTS } from "@/lib/constants";
import { buildDefectSummary } from "@/lib/reports/defectSummary";

describe("the defects of one sample", () => {
  const full = (v: number) => Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, v]));
  const row = (data: unknown, over: { excluded?: boolean; submitted?: boolean; cups?: number | null } = {}) => ({
    excluded: false,
    submitted: true,
    cups: 2,
    data,
    ...over,
  });

  it("counts the cuppers who flagged a cup, and the cups by type, among the included evaluations", () => {
    const summary = buildDefectSummary({
      format: "combined",
      cupsPerSample: 2,
      evaluations: [
        row({ ...full(6), tazas_defectuosas: [true, false], tazas_defecto_tipo: ["phenolic", null] }),
        row({ ...full(6), tazas_defectuosas: [true, true], tazas_defecto_tipo: ["phenolic", "moldy"] }),
        row({ ...full(6), tazas_defectuosas: [false, false] }),
        row(full(7)),
        // none of these feed anything
        row({ ...full(6), tazas_defectuosas: [true, true] }, { excluded: true }),
        row({ ...full(6), tazas_defectuosas: [true, true] }, { submitted: false }),
        row({ sabor_final: 6, tazas_defectuosas: [true, true] }), // incomplete: not in the group's score
        row(null),
      ],
    });
    expect(summary).toEqual({ n: 4, cuppers: 2, cups: 3, types: [{ type: "phenolic", cups: 2 }, { type: "moldy", cups: 1 }] });
  });

  it("a cup with no type recorded is counted, under no type", () => {
    const summary = buildDefectSummary({
      format: "affective",
      cupsPerSample: 5,
      evaluations: [row({ ...full(6), tazas_defectuosas: [true, false, true, false, false] }, { cups: null })],
    });
    expect(summary).toEqual({ n: 1, cuppers: 1, cups: 2, types: [{ type: null, cups: 2 }] });
  });

  it("reads only the cups the evaluation covers, and a descriptive session has none", () => {
    const flags = { ...full(6), tazas_defectuosas: [true, true, true, true, true] };
    expect(buildDefectSummary({ format: "combined", cupsPerSample: 5, evaluations: [row(flags, { cups: 2 })] })?.cups).toBe(2);
    expect(buildDefectSummary({ format: "descriptive", cupsPerSample: 5, evaluations: [row(flags)] })).toBeNull();
    expect(SENSORY_DEFECTS).toContain("phenolic");
  });
});
