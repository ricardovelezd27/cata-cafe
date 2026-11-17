// A-01 / decision 10 (package F2): a cupper's own total is shown only for a SENT
// evaluation. One rule (lib/ownTotal.ts) read by the results page
// (canShowMyScore -> myScoreFor, ScoreTable, drill-down, radar) and by the CVA
// sheet builder (print page + PDF).
import { describe, expect, it } from "vitest";
import { mayShowOwnTotal } from "@/lib/ownTotal";
import {
  canShowMyRatings,
  canShowMyScore,
  deriveMyEvaluation,
  type MyEvaluation,
} from "@/lib/evaluationState";
import { myScoreFor, rankSamples, sessionStats, type RankableSample } from "@/lib/reports/ranking";
import { buildCvaFormData, type CvaFormInput } from "@/lib/pdf/cvaFormData";
import { calcIndividualBreakdown, calcIndividualScore, hasIndividualScore } from "@/lib/scoring";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

const complete: Record<string, unknown> = {
  ...Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 7])),
  tazas_no_uniformes: [false, true, false, false, false],
  tazas_defectuosas: [false, false, false, false, false],
};
// "No evaluado" on aroma, every other section rated: a declared partial.
const declaredPartial: Record<string, unknown> = { ...complete, aroma_af_ne: true };
delete declaredPartial.aroma_af_final;

describe("mayShowOwnTotal (the one rule)", () => {
  it("sent → always", () => {
    expect(mayShowOwnTotal({ sent: true, sessionOpen: true })).toBe(true);
    expect(mayShowOwnTotal({ sent: true, sessionOpen: false })).toBe(true);
    expect(mayShowOwnTotal({ sent: true })).toBe(true);
  });
  it("unsent while the session is open → never", () => {
    expect(mayShowOwnTotal({ sent: false, sessionOpen: true })).toBe(false);
  });
  it("unsent, session state unknown → read as open (fails closed)", () => {
    expect(mayShowOwnTotal({ sent: false })).toBe(false);
  });
  it("unsent, session over → unchanged from before F2 (question pending for the owner)", () => {
    expect(mayShowOwnTotal({ sent: false, sessionOpen: false })).toBe(true);
  });
});

function sample(my: MyEvaluation, affective: Record<string, unknown>, scoreRule?: "v1" | "v2"): RankableSample {
  return {
    id: "s1",
    descriptive: {},
    affective,
    combined: {},
    aggregateScore: null,
    myEvaluation: my,
    ...(scoreRule ? { scoreRule } : {}),
  };
}
const soloCtx = { format: "affective" as const, isGroup: false, canViewGroup: false, cupsPerSample: 5 };

describe("results page: canShowMyScore / myScoreFor", () => {
  it("a complete draft of an open session: ratings yes, total no", () => {
    const my = deriveMyEvaluation("affective", { isDraft: true, data: complete }, { sessionOpen: true });
    expect(canShowMyRatings(my)).toBe(true);
    expect(canShowMyScore(my)).toBe(false);
    expect(myScoreFor(sample(my, complete), "affective", 5)).toBeNull();
    // "Mi promedio" and the solo ranking read myScoreFor: no average from a draft either.
    const samples = [sample(my, complete)];
    const { ranked } = rankSamples(samples, null, soloCtx);
    expect(ranked[0].score).toBeNull();
    expect(sessionStats(samples, ranked, null, soloCtx).myAvg).toBeNull();
  });

  it("a sent evaluation: total", () => {
    const my = deriveMyEvaluation("affective", { isDraft: false, data: complete }, { sessionOpen: true });
    expect(canShowMyScore(my)).toBe(true);
    expect(myScoreFor(sample(my, complete), "affective", 5)).toBe(calcIndividualScore(complete, 5));
  });

  it("a declared partial is unchanged: finished, no total, the 'Parcial' label still shows", () => {
    for (const isDraft of [true, false]) {
      const my = deriveMyEvaluation("affective", { isDraft, data: declaredPartial }, { sessionOpen: true });
      expect(my.complete).toBe(true);
      // The partial label and the radar read the ratings gate, which did not change.
      expect(canShowMyRatings(my)).toBe(true);
      expect(hasIndividualScore(declaredPartial)).toBe(false);
      expect(myScoreFor(sample(my, declaredPartial), "affective", 5)).toBeNull();
    }
  });

  it("an old stored row scored under rule v1 is unchanged", () => {
    const my = deriveMyEvaluation("affective", { isDraft: false, data: complete }, { sessionOpen: false });
    expect(myScoreFor(sample(my, complete, "v1"), "affective", 5)).toBe(
      calcIndividualScore(complete, 5, { rule: "v1" }),
    );
  });
});

function sheetInput(over: { sent?: boolean; sessionOpen?: boolean; affective: Record<string, unknown>; scoreRule?: "v1" | "v2" }): CvaFormInput {
  return {
    ownerView: false,
    ...(over.sessionOpen === undefined ? {} : { sessionOpen: over.sessionOpen }),
    format: "affective",
    sessionName: "Sesión",
    date: "1 oct 2026",
    cupperName: "Ana",
    purpose: "",
    cupsPerSample: 5,
    locale: "es",
    sample: {
      label: "A",
      revealed: false,
      coffeeName: null,
      roastLevel: null,
      ...(over.sent === undefined ? {} : { sent: over.sent }),
      ...(over.scoreRule ? { scoreRule: over.scoreRule } : {}),
      descriptive: {},
      affective: over.affective,
      combined: {},
      physical: {},
      extrinsic: {},
    },
  };
}

describe("print page + CVA PDF: buildCvaFormData", () => {
  it("a complete draft of an open session prints no total and no Σh line", () => {
    const sheet = buildCvaFormData(sheetInput({ sent: false, sessionOpen: true, affective: complete }));
    expect(sheet.scoreState).toBe("unsent");
    expect(sheet.score).toBe("—");
    expect(sheet.breakdown.affectiveSum).toBe(0);
    // The ratings themselves are still on the sheet.
    expect(sheet.affectiveRows.length).toBe(AFFECTIVE_ATTRIBUTES.length);
  });

  it("a caller that passes neither field never prints a draft's total", () => {
    const sheet = buildCvaFormData(sheetInput({ affective: complete }));
    expect(sheet.scoreState).toBe("unsent");
    expect(sheet.score).toBe("—");
  });

  it("a sent evaluation prints its total", () => {
    const sheet = buildCvaFormData(sheetInput({ sent: true, sessionOpen: true, affective: complete }));
    expect(sheet.scoreState).toBe("complete");
    expect(sheet.score).toBe(calcIndividualBreakdown(complete, 5).score);
  });

  it("a declared partial is unchanged", () => {
    for (const sent of [true, false]) {
      const sheet = buildCvaFormData(sheetInput({ sent, sessionOpen: true, affective: declaredPartial }));
      expect(sheet.scoreState).toBe("partial");
      expect(sheet.partialDeclared).toBe(true);
      expect(sheet.score).toBe("—");
    }
  });

  it("an old stored row scored under rule v1 prints its v1 total", () => {
    const sheet = buildCvaFormData(sheetInput({ sent: true, sessionOpen: false, affective: complete, scoreRule: "v1" }));
    expect(sheet.score).toBe(calcIndividualBreakdown(complete, 5, { rule: "v1" }).score);
  });

  it("a draft of a session that is over is unchanged (question pending)", () => {
    const sheet = buildCvaFormData(sheetInput({ sent: false, sessionOpen: false, affective: complete }));
    expect(sheet.scoreState).toBe("complete");
  });
});
