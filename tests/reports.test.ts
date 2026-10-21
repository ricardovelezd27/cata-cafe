import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL } from "@/lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeCupperAlignment, computeMajoritySets } from "@/lib/alignment";
import { canViewGroupResults } from "@/lib/sessionState";
import { NO_EVALUATION } from "@/lib/evaluationState";
import { rankSamples, sessionStats, consensusLine, type RankableSample } from "@/lib/reports/ranking";
import { rowStats, bandFor } from "@/lib/reports/cupperStats";
import { buildParticipantSummary } from "@/lib/reports/participantSummary";
import { buildFichaTecnica } from "@/lib/reports/fichaTecnica";
import { buildTeacherNotes } from "@/lib/reports/teacherNotes";
import type { ReportEvalRow, SessionReportSource } from "@/lib/reports/types";

// ---------------------------------------------------------------------------
// canViewGroupResults — truth table (rule lifted verbatim from results/page.tsx)
// ---------------------------------------------------------------------------
describe("canViewGroupResults", () => {
  const base = {
    isGroup: true,
    ownerRead: false,
    status: "active",
    allSubmitted: false,
    sessionExpired: false,
  };
  it("is never true for a solo session", () => {
    expect(
      canViewGroupResults({ ...base, isGroup: false, ownerRead: true, status: "closed" }),
    ).toBe(false);
  });
  it("is false for a participant on an open, incomplete, unexpired group session", () => {
    expect(canViewGroupResults(base)).toBe(false);
  });
  it("unlocks for each single reason", () => {
    expect(canViewGroupResults({ ...base, ownerRead: true })).toBe(true);
    expect(canViewGroupResults({ ...base, status: "closed" })).toBe(true);
    expect(canViewGroupResults({ ...base, allSubmitted: true })).toBe(true);
    expect(canViewGroupResults({ ...base, sessionExpired: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rankSamples / sessionStats
// ---------------------------------------------------------------------------
function rs(
  id: string,
  community: number | null,
  opts: { sd?: number | null } = {},
): RankableSample {
  return {
    id,
    descriptive: {},
    affective: {},
    combined: {},
    aggregateScore: community === null ? null : { communityScore: community, scoreSd: opts.sd ?? null },
    myEvaluation: NO_EVALUATION,
  };
}
const groupCtx = { format: "combined" as const, isGroup: true, canViewGroup: true, cupsPerSample: 5 };

describe("rankSamples", () => {
  it("excludes the reference, sorts by score desc, ties by position, unscored last", () => {
    const samples = [rs("ref", 79), rs("a", 84), rs("b", 86), rs("c", 84), rs("d", null)];
    const { ranked, referenceSample, referenceRank } = rankSamples(samples, "ref", groupCtx);
    expect(referenceSample?.id).toBe("ref");
    expect(referenceRank?.score).toBe(79);
    expect(ranked.map((r) => r.sample.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("computes Δ vs the reference only on the same basis", () => {
    const samples = [rs("ref", 79), rs("a", 84.5), rs("b", null)];
    const { refDeltas } = rankSamples(samples, "ref", groupCtx);
    expect(refDeltas.get("a")).toBeCloseTo(5.5);
    expect(refDeltas.get("ref")).toBeNull();
    expect(refDeltas.get("b")).toBeNull();
  });

  it("drops the Δ when the bases differ (community vs mine)", () => {
    // Reference has no community score → falls back to "mine" (no own eval → null score).
    const samples = [rs("ref", null), rs("a", 84)];
    const { refDeltas } = rankSamples(samples, "ref", groupCtx);
    expect(refDeltas.get("a")).toBeNull();
  });

  it("attaches sd only with a community score", () => {
    const { ranked } = rankSamples([rs("a", 84, { sd: 1.5 })], null, groupCtx);
    expect(ranked[0].sd).toBe(1.5);
    const solo = rankSamples([rs("a", 84, { sd: 1.5 })], null, { ...groupCtx, canViewGroup: false });
    expect(solo.ranked[0].sd).toBeNull();
    expect(solo.ranked[0].score).toBeNull();
  });

  it("descriptive sessions carry no scores", () => {
    const { ranked } = rankSamples([rs("a", 84)], null, { ...groupCtx, format: "descriptive" });
    expect(ranked[0].score).toBeNull();
  });
});

describe("sessionStats", () => {
  it("averages and best exclude the reference", () => {
    const samples = [rs("ref", 79), rs("a", 90), rs("b", 80)];
    const { ranked } = rankSamples(samples, "ref", groupCtx);
    const st = sessionStats(samples, ranked, "ref", groupCtx);
    expect(st.avgScore).toBe(85);
    expect(st.bestSampleId).toBe("a");
    expect(st.bestScore).toBe(90);
    expect(st.communityAvg).toBe(85);
    expect(st.myAvg).toBeNull();
    expect(st.delta).toBeNull();
  });
});

describe("consensusLine", () => {
  const freq = {
    blocks: { general: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }] },
    summary: { nariz: null, boca: "La mayoría dijo X" } as Record<string, string | null>,
  };
  const labels = { soloTopDescriptors: "Top" };
  it("takes the first block sentence in priority order", () => {
    expect(consensusLine(freq, false, labels)).toBe("La mayoría dijo X");
  });
  it("falls back to the top-3 general labels", () => {
    expect(consensusLine({ ...freq, summary: {} }, false, labels)).toBe("A, B, C");
  });
  it("solo prefixes the label; empty → null", () => {
    expect(consensusLine(freq, true, labels)).toBe("Top: A, B, C");
    expect(consensusLine({ blocks: {}, summary: {} }, true, labels)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cupperStats
// ---------------------------------------------------------------------------
describe("rowStats / bandFor", () => {
  it("is neutral with fewer than two included values", () => {
    expect(rowStats([80, null], [true, true])).toEqual({ mean: 0, sd: 0, count: 1 });
    expect(bandFor(80, rowStats([80], [true]))).toBe("neutral");
  });
  it("ignores excluded rows and uses population SD", () => {
    const st = rowStats([80, 84, 100], [true, true, false]);
    expect(st).toEqual({ mean: 82, sd: 2, count: 2 });
  });
  it("bands at 1 SD (amber) and 2 SD (red)", () => {
    const st = { mean: 80, sd: 2, count: 5 };
    expect(bandFor(81, st)).toBe("green");
    expect(bandFor(82, st)).toBe("amber");
    expect(bandFor(78, st)).toBe("amber");
    expect(bandFor(84, st)).toBe("red");
    expect(bandFor(null, st)).toBe("neutral");
    expect(bandFor(90, { mean: 80, sd: 0, count: 5 })).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// 3-cupper fixture for the report models
// ---------------------------------------------------------------------------
const L1 = FLAVOR_WHEEL.filter((n) => n.level === 1).map((n) => n.id);
const [F1, F2, F3] = L1;

const CUPPERS = {
  A: { id: "uid-cupper-aaa", name: "Alicia Zorrilla" },
  B: { id: "uid-cupper-bbb", name: "Bruno Maldonado" },
  C: { id: "uid-cupper-ccc", name: "Carla Fontanarrosa" },
};

function affective(value: number): Record<string, unknown> {
  return Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value]));
}

function mkEval(
  who: keyof typeof CUPPERS,
  sampleId: string,
  value: number,
  desc: string[],
  notes?: string,
): ReportEvalRow {
  const data = {
    ...affective(value),
    aroma_desc: desc,
    aroma_int: 10,
    ...(notes ? { aroma_notas: notes } : {}),
  };
  return {
    id: `ev-${who}-${sampleId}`,
    cupperId: CUPPERS[who].id,
    displayName: CUPPERS[who].name,
    sessionSampleId: sampleId,
    descriptiveData: {},
    affectiveData: {},
    combinedData: data,
    nonUniformCups: [],
    defectiveCups: [],
  };
}

function fixture(): SessionReportSource {
  const evals: ReportEvalRow[] = [
    // s-ref (blind reference): everyone pinned at 5
    mkEval("A", "s-ref", 5, [F1]),
    mkEval("B", "s-ref", 5, [F1]),
    mkEval("C", "s-ref", 5, [F1]),
    // s-2 (revealed): A and B pick F1+F2, C picks F3
    mkEval("A", "s-2", 8, [F1, F2], "nota privada de A"),
    mkEval("B", "s-2", 7, [F1, F2], "nota de B"),
    mkEval("C", "s-2", 4, [F3], "nota de C"),
    // s-3 (blind)
    mkEval("A", "s-3", 6, [F2]),
    mkEval("B", "s-3", 6, [F2]),
    mkEval("C", "s-3", 6, [F2]),
  ];
  const samples = [
    {
      id: "s-ref",
      label: "Muestra REF",
      position: 1,
      revealed: false,
      isReference: true,
      coffee: null,
      physical: { phys_color: "VERDE-SECRETO" },
      extrinsic: { ext_pais_val: "PAIS-REF" },
    },
    {
      id: "s-2",
      label: "Muestra 2",
      position: 2,
      revealed: true,
      isReference: false,
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
        roastLevel: "Medio",
      },
      physical: { phys_color: "VERDE-SECRETO-2" },
      extrinsic: { ext_pais_val: "Colombia" },
    },
    {
      id: "s-3",
      label: "Muestra 3",
      position: 3,
      revealed: false,
      isReference: false,
      coffee: {
        name: "CAFE-CIEGO-SECRETO",
        deletedAt: null,
        code: "ZZZ999",
        country: null,
        region: null,
        farm: null,
        producer: null,
        variety: null,
        processType: null,
        altitude: null,
        roastLevel: null,
      },
      physical: { phys_color: "VERDE-SECRETO-3" },
      extrinsic: { ext_pais_val: "PAIS-CIEGO" },
    },
  ];
  const excluded = new Set<string>();
  const groupAggBySample: Record<string, GroupAggregate> = {};
  for (const s of samples) {
    groupAggBySample[s.id] = computeGroupAggregate(
      evals
        .filter((e) => e.sessionSampleId === s.id && !excluded.has(e.cupperId))
        .map((e) => ({ data: e.combinedData, nonUniformCups: [], defectiveCups: [] })),
      5,
    );
  }
  const sampleIds = samples.map((s) => ({ id: s.id, label: s.label }));
  const descriptorFrequency = computeSampleBlockFrequencies({
    format: "combined",
    samples: sampleIds,
    evals: evals.map((e) => ({
      cupperId: e.cupperId,
      sessionSampleId: e.sessionSampleId,
      descriptiveData: e.descriptiveData,
      combinedData: e.combinedData,
    })),
    excludedUserIds: excluded,
    blockLabel: (id) => id,
    locale: "es",
  })!;
  const alignInput = {
    format: "combined" as const,
    samples: sampleIds.map((s) => ({ id: s.id })),
    evals: evals.map((e) => ({
      cupperId: e.cupperId,
      sessionSampleId: e.sessionSampleId,
      descriptiveData: e.descriptiveData,
      combinedData: e.combinedData,
      cupper: { displayName: e.displayName },
    })),
    excludedUserIds: excluded,
  };
  return {
    session: {
      id: "sess-1",
      name: "Cata de prueba",
      date: new Date("2026-10-01T12:00:00Z"),
      objective: null,
      format: "combined",
      cupsPerSample: 5,
      isGroup: true,
      status: "closed",
      createdBy: CUPPERS.A.id,
      referenceSampleId: "s-ref",
      closedAt: new Date("2026-10-02T12:00:00Z"),
    },
    ownerName: CUPPERS.A.name,
    samples,
    participants: (["A", "B", "C"] as const).map((k) => ({
      userId: CUPPERS[k].id,
      displayName: CUPPERS[k].name,
      status: k === "A" ? "owner" : "joined",
      excluded: false,
    })),
    evals,
    excludedUserIds: [],
    submittedCupperCount: 3,
    groupAggBySample,
    descriptorFrequency,
    alignmentRows: computeCupperAlignment(alignInput),
    majoritySets: computeMajoritySets(alignInput),
  };
}

const labels = { coffeeDeleted: "Café eliminado", soloTopDescriptors: "Más frecuentes" };

describe("buildParticipantSummary — anonymity invariant", () => {
  const src = fixture();
  const model = buildParticipantSummary(src, { viewerId: CUPPERS.B.id, locale: "es", labels });
  const json = JSON.stringify(model);

  it("contains the viewer's own name but no other cupper's id or name", () => {
    expect(model.header.cupperName).toBe(CUPPERS.B.name);
    for (const other of [CUPPERS.A, CUPPERS.C]) {
      expect(json).not.toContain(other.id);
      expect(json).not.toContain(other.name);
      expect(json).not.toContain(other.name.split(" ")[0]);
    }
    expect(json).not.toContain(CUPPERS.B.id);
  });

  it("carries no physical data and no per-cupper alignment rows", () => {
    expect(json).not.toContain("VERDE-SECRETO");
    expect(json).not.toContain("physical");
    expect(json).not.toContain("phys_");
    expect(model.kpis.myAlignment).not.toBeNull();
    expect(Object.keys(model.kpis.myAlignment!).sort()).toEqual([
      "alignment",
      "matches",
      "opportunities",
    ]);
  });

  it("does not leak other cuppers' notes", () => {
    expect(json).not.toContain("nota privada de A");
    expect(json).not.toContain("nota de C");
    expect(json).toContain("nota de B");
  });

  it("hides the coffee while blind and shows it once revealed", () => {
    expect(json).not.toContain("CAFE-CIEGO-SECRETO");
    const byLabel = Object.fromEntries(model.samples.map((s) => [s.label, s]));
    expect(byLabel["Muestra 3"].coffee).toBeNull();
    expect(byLabel["Muestra 2"].coffee).toBe("Finca Revelada");
  });

  it("orders the reference first and computes Δ vs the reference", () => {
    expect(model.samples[0].isReference).toBe(true);
    expect(model.header.referenceLabel).toBe("Muestra REF");
    expect(model.header.participants).toBe(3);
    const s2 = model.samples.find((s) => s.label === "Muestra 2")!;
    expect(s2.myScore).not.toBeNull();
    expect(s2.communityScore).not.toBeNull();
    expect(s2.deltaVsRef).toBeCloseTo(s2.communityScore! - model.samples[0].communityScore!);
    expect(s2.radar?.mine).toHaveLength(8);
    expect(s2.radar?.community).toHaveLength(8);
    expect(s2.topDescriptors.some((d) => d.mine)).toBe(true);
  });
});

describe("buildFichaTecnica", () => {
  const src = fixture();

  it("participant tier has no appendix and no green block", () => {
    const m = buildFichaTecnica(src, { tier: "participant", locale: "es", labels });
    expect(m.ownerAppendix).toBeUndefined();
    for (const s of m.samples) expect("green" in s).toBe(false);
    const json = JSON.stringify(m);
    expect(json).not.toContain("VERDE-SECRETO");
    for (const c of Object.values(CUPPERS)) {
      expect(json).not.toContain(c.id);
      expect(json).not.toContain(c.name);
    }
  });

  it("participant tier keeps blind coffees and their origin data hidden", () => {
    const m = buildFichaTecnica(src, { tier: "participant", locale: "es", labels });
    const json = JSON.stringify(m);
    expect(json).not.toContain("CAFE-CIEGO-SECRETO");
    expect(json).not.toContain("PAIS-CIEGO");
    expect(json).toContain("Finca Revelada");
  });

  it("owner tier includes green data and the cupper x sample appendix", () => {
    const m = buildFichaTecnica(src, { tier: "owner", locale: "es", labels });
    expect(m.samples.every((s) => s.green !== undefined)).toBe(true);
    expect(m.samples[0].green).toEqual({ phys_color: "VERDE-SECRETO" });
    expect(m.ownerAppendix?.cuppers).toHaveLength(3);
    expect(m.ownerAppendix?.samples.map((s) => s.id)).toEqual(["s-ref", "s-2", "s-3"]);
    expect(m.ownerAppendix?.alignment).toHaveLength(3);
    const idx = m.ownerAppendix!.samples.findIndex((s) => s.id === "s-2");
    // C is the outlier on s-2.
    const c = m.ownerAppendix!.cuppers.find((x) => x.id === CUPPERS.C.id)!;
    expect(c.scores[idx]).not.toBeNull();
    expect(["amber", "red"]).toContain(c.bands[idx]);
  });

  it("reports affective stats with included/submitted", () => {
    const m = buildFichaTecnica(src, { tier: "participant", locale: "es", labels });
    const s2 = m.samples.find((s) => s.identity.label === "Muestra 2")!;
    expect(s2.affective?.included).toBe(3);
    expect(s2.affective?.submitted).toBe(3);
    expect(s2.affective?.attrAverages).toHaveLength(8);
    expect(s2.descriptive?.intensityMeans.find((x) => x.stage === "aroma")?.mean).toBe(10);
    expect(s2.participation).toEqual({ submitted: 3, included: 3, total: 3 });
  });
});

describe("buildTeacherNotes", () => {
  it("flags the dissenting cupper's missed and extra descriptors", () => {
    const notes = buildTeacherNotes(fixture());
    expect(notes).toHaveLength(3);
    const c = notes.find((n) => n.cupperId === CUPPERS.C.id)!;
    const s2 = c.samples.find((s) => s.sampleId === "s-2")!;
    expect(s2.missed.flatMap((m) => m.ids).sort()).toEqual([F1, F2].sort());
    expect(s2.extra.flatMap((m) => m.ids)).toEqual([F3]);
    expect(s2.delta).toBeLessThan(0);
    const a = notes.find((n) => n.cupperId === CUPPERS.A.id)!;
    expect(a.samples.find((s) => s.sampleId === "s-2")!.missed).toEqual([]);
    expect(a.alignment?.overall).toBeGreaterThan(c.alignment!.overall);
  });
});

describe("computeMajoritySets", () => {
  it("matches the sets alignment scores against and is empty for affective", () => {
    const src = fixture();
    expect(src.majoritySets["s-2"].nariz.sort()).toEqual([F1, F2].sort());
    expect(
      computeMajoritySets({
        format: "affective",
        samples: [{ id: "x" }],
        evals: [],
        excludedUserIds: new Set(),
      }),
    ).toEqual({});
  });
});
