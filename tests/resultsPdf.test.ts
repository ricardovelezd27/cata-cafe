import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL } from "@/lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { buildResultsPdfModel, scoreLines } from "@/lib/reports/resultsPdf";
import { scoreContext } from "@/lib/scoreContext";
import type { ReportEvalRow, SessionReportSource } from "@/lib/reports/types";

// The PDF of the results page is built from the page's own models, so what a
// participant's file holds is what a participant's page holds (counts and
// aggregates only; the wheel hidden under three cuppers; references outside the
// ranking). These tests pin that on the one pure builder.

const F1 = FLAVOR_WHEEL.filter((n) => n.level === 1)[0].id;
const CUPPERS = { A: "uid-aaa", B: "uid-bbb", C: "uid-ccc" } as const;
const NAMES = { A: "Alicia Zorrilla", B: "Bruno Maldonado", C: "Carla Fontanarrosa" } as const;
type Who = keyof typeof CUPPERS;

function evaluation(who: Who, sampleId: string, value: number): ReportEvalRow {
  return {
    id: `ev-${who}-${sampleId}`,
    cupperId: CUPPERS[who],
    displayName: NAMES[who],
    sessionSampleId: sampleId,
    descriptiveData: {},
    affectiveData: {},
    combinedData: {
      ...Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value])),
      aroma_desc: [F1],
      aroma_int: 10,
    },
    nonUniformCups: [],
    defectiveCups: [],
    cups: 5,
  };
}

function source(opts: { cuppers: Who[]; status: string }): SessionReportSource {
  const sampleIds = ["s-ref", "s-2", "s-3"];
  const values: Record<string, number> = { "s-ref": 5, "s-2": 8, "s-3": 6 };
  const evals = sampleIds.flatMap((id) => opts.cuppers.map((who) => evaluation(who, id, values[id])));
  const sample = (id: string, position: number, extra: Record<string, unknown>) => ({
    id,
    label: `Muestra ${position}`,
    position,
    revealed: false,
    isReference: false,
    coffee: null,
    physical: {},
    extrinsic: {},
    ...extra,
  });
  const samples = [
    sample("s-ref", 1, { isReference: true, referenceRank: 1 }),
    sample("s-2", 2, {
      revealed: true,
      coffee: {
        name: "Finca Revelada",
        deletedAt: null,
        code: "K7M3FP",
        country: "Colombia",
        region: null,
        farm: null,
        producer: null,
        variety: null,
        processType: null,
        altitude: null,
        roastLevel: null,
      },
    }),
    sample("s-3", 3, {}),
  ];
  const groupAggBySample: Record<string, GroupAggregate> = {};
  for (const id of sampleIds) {
    groupAggBySample[id] = computeGroupAggregate(
      evals.filter((e) => e.sessionSampleId === id).map((e) => ({ data: e.combinedData, nonUniformCups: [], defectiveCups: [] })),
      5,
    );
  }
  return {
    session: {
      id: "sess-1",
      name: "Cata de prueba",
      date: new Date("2026-11-01T12:00:00Z"),
      objective: null,
      format: "combined",
      cupsPerSample: 5,
      isGroup: true,
      status: opts.status,
      createdBy: "uid-owner",
      referenceSampleId: "s-ref",
      referenceMode: "anchor",
      closedAt: opts.status === "closed" ? new Date("2026-11-02T12:00:00Z") : null,
    },
    ownerName: "Organizadora",
    samples,
    participants: opts.cuppers.map((who) => ({ userId: CUPPERS[who], displayName: NAMES[who], status: "joined", excluded: false })),
    evals,
    excludedUserIds: [],
    submittedCupperCount: opts.cuppers.length,
    groupAggBySample,
    descriptorFrequency: null,
    alignmentRows: [],
    majoritySets: {},
  };
}

const viewer = (canViewGroup: boolean) => ({
  viewerId: CUPPERS.A,
  viewAsId: CUPPERS.A,
  isAdminViewer: false,
  canViewGroup,
  coffeeDeleted: "Café eliminado",
});

describe("buildResultsPdfModel", () => {
  it("a participant on a closed session with three cuppers: the group's numbers, references outside the ranking", () => {
    const model = buildResultsPdfModel(source({ cuppers: ["A", "B", "C"], status: "closed" }), viewer(true));
    expect(model.view.scope).toBe("group");
    expect(model.view.entries.map((e) => e.sample.id)).toEqual(["s-2", "s-3"]);
    expect(model.view.references.map((r) => r.sample.id)).toEqual(["s-ref"]);
    expect(model.view.first.status).toBe("ok");
    expect(model.cards.map((c) => [c.sample.id, c.isReference])).toEqual([
      ["s-ref", true],
      ["s-2", false],
      ["s-3", false],
    ]);
    expect(model.referencePinned).toBe(true);
    // the coffee's name only once revealed
    expect(model.cards.find((c) => c.sample.id === "s-2")?.sample.coffee?.name).toBe("Finca Revelada");
    expect(model.cards.find((c) => c.sample.id === "s-3")?.sample.coffee).toBeNull();
    expect(model.compare?.picked.map((o) => o.id)).toEqual(["s-2", "s-3", "s-ref"]);
  });

  it("the wheel is hidden from a participant under three cuppers", () => {
    const model = buildResultsPdfModel(source({ cuppers: ["A", "B"], status: "closed" }), viewer(true));
    for (const card of model.cards) expect(card.wheel).toEqual({ status: "too_few" });
    expect(model.compare).toBeNull();
  });

  it("no group number leaves a participant's model while the group's results are hidden", () => {
    const model = buildResultsPdfModel(source({ cuppers: ["A", "B", "C"], status: "active" }), viewer(false));
    expect(model.view.scope).toBe("own");
    expect(model.view.ranked).toBe(false);
    expect(model.view.who).toBeNull();
    expect(model.compare).toBeNull();
    for (const card of model.cards) {
      expect(card.sample.aggregateScore).toBeNull();
      expect(card.context?.basis).not.toBe("community");
    }
  });

  it("a participant's model holds no other cupper's key, name or id", () => {
    for (const status of ["closed", "active"]) {
      const model = buildResultsPdfModel(source({ cuppers: ["A", "B", "C"], status }), viewer(status === "closed"));
      const text = JSON.stringify(model);
      for (const who of ["B", "C"] as const) {
        expect(text).not.toContain(NAMES[who]);
        expect(text).not.toContain(CUPPERS[who]);
      }
      expect(text).not.toContain(NAMES.A);
    }
  });
});

describe("scoreLines", () => {
  const strings = {
    spread: "± {sd}",
    included: "{n} de {total} incluidos",
    includedNoTotal: "{n} incluidos",
    mine: "tú {score}",
    difference: "diferencia {difference}",
    deltaVsReference: "Δ {delta} vs. referencia",
    ownScore: "tu puntaje",
    noScore: "sin puntaje",
    indicative: "indicativo",
  };
  it("prints the same lines, in the same order, as the page's ScoreWithContext", () => {
    const context = scoreContext({
      value: { score: 85, sd: 2.94, basis: "community", n: 4, total: 5, cups: 20 },
      mine: 87,
      deltaVsReference: 6,
    });
    expect(scoreLines(context, strings)).toEqual([
      "± 2.9 · 4 de 5 incluidos",
      "tú 87.00 · diferencia +2.00",
      "Δ +6.00 vs. referencia",
      "indicativo",
    ]);
    expect(scoreLines(context, strings, "brief")).toEqual(["± 2.9 · 4 de 5 incluidos", "indicativo"]);
  });
});
