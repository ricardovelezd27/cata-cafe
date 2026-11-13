import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL } from "@/lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeCupperAlignment, computeMajoritySets } from "@/lib/alignment";
import { canViewGroupResults } from "@/lib/sessionState";
import { gateSampleForViewer, communityHidden } from "@/lib/reports/sampleGate";
import { NO_EVALUATION } from "@/lib/evaluationState";
import {
  rankSamples,
  sessionStats,
  consensusLine,
  RANKING_POLICY,
  hasNoClearGap,
  type RankableSample,
} from "@/lib/reports/ranking";
import { rowStats, bandFor } from "@/lib/reports/cupperStats";
import { buildParticipantSummary } from "@/lib/reports/participantSummary";
import { buildFichaTecnica } from "@/lib/reports/fichaTecnica";
import { buildResultsCsv } from "@/lib/reports/resultsCsv";
import { csvCell } from "@/lib/csv";
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
    sessionExpired: false,
  };
  it("is never true for a solo session", () => {
    expect(
      canViewGroupResults({ ...base, isGroup: false, ownerRead: true, status: "closed" }),
    ).toBe(false);
  });
  it("is false for a participant on an open, unexpired group session (S10 C5: even if everyone submitted)", () => {
    expect(canViewGroupResults(base)).toBe(false);
    // The all-submitted shortcut is gone: the input has no such field any more.
    expect(canViewGroupResults({ ...base, allSubmitted: true } as typeof base)).toBe(false);
  });
  it("unlocks for each single reason", () => {
    expect(canViewGroupResults({ ...base, ownerRead: true })).toBe(true);
    expect(canViewGroupResults({ ...base, status: "closed" })).toBe(true);
    expect(canViewGroupResults({ ...base, sessionExpired: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rankSamples / sessionStats
// ---------------------------------------------------------------------------
function rs(
  id: string,
  community: number | null,
  opts: { sd?: number | null; n?: number; total?: number; cups?: number } = {},
): RankableSample {
  return {
    id,
    descriptive: {},
    affective: {},
    combined: {},
    aggregateScore:
      community === null
        ? null
        : {
            communityScore: community,
            scoreSd: opts.sd ?? null,
            participantCount: opts.n,
            totalSubmitted: opts.total,
            totalCups: opts.cups,
          },
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

describe("rankSamples — ranking honesty (S8-12, F-resultados-6)", () => {
  it("equal displayed scores share a rank (1, 1, 3)", () => {
    const samples = [rs("a", 85, { n: 6 }), rs("b", 85, { n: 6 }), rs("c", 80, { n: 6 })];
    const { ranked } = rankSamples(samples, null, groupCtx);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("unscored rows carry no rank", () => {
    const { ranked } = rankSamples([rs("a", 85, { n: 6 }), rs("b", null)], null, groupCtx);
    expect(ranked.map((r) => r.rank)).toEqual([1, null]);
  });

  it("n below the minimum is suppressed: no SD and never 'best'", () => {
    const samples = [rs("a", 90, { n: 1, sd: 2 }), rs("b", 80, { n: 4, sd: 1 })];
    const { ranked } = rankSamples(samples, null, groupCtx);
    expect(ranked[0].sample.id).toBe("a");
    expect(ranked[0].suppressed).toBe(true);
    expect(ranked[0].sd).toBeNull();
    const st = sessionStats(samples, ranked, null, groupCtx);
    expect(st.bestSampleId).toBe("b");
  });

  it("sessionStats: a suppressed sample is out of avg, communityAvg, delta and best alike", () => {
    const mine = {
      myEvaluation: { status: "submitted" as const, complete: true },
      combined: Object.fromEntries(
        [
          "fragancia_af",
          "aroma_af",
          "sabor_af",
          "sabor_residual_af",
          "acidez_af",
          "dulzor_af",
          "sensacion_af",
          "impresion_global",
        ].map((id) => [`${id}_final`, 8]),
      ),
    };
    const samples = [
      { ...rs("a", 90, { n: 1 }), ...mine },
      { ...rs("b", 80, { n: 4 }), ...mine },
      { ...rs("c", 82, { n: 5 }), ...mine },
    ];
    const { ranked } = rankSamples(samples, null, groupCtx);
    expect(ranked.find((r) => r.sample.id === "a")?.suppressed).toBe(true);
    const st = sessionStats(samples, ranked, null, groupCtx);
    expect(st.bestSampleId).toBe("c");
    expect(st.avgScore).toBeCloseTo(81);
    expect(st.communityAvg).toBeCloseTo(81);
    expect(st.myAvg).not.toBeNull();
    expect(st.delta).toBeCloseTo(st.myAvg! - 81);
  });

  it("(WP5b D3) n = 3, 4 and 5 are indicative, n = 6 is firm; n = 2 is suppressed", () => {
    const samples = [
      rs("a", 90, { n: 3 }),
      rs("b", 88, { n: 4 }),
      rs("c", 86, { n: 5 }),
      rs("d", 84, { n: 6 }),
      rs("e", 82, { n: 2 }),
    ];
    const { ranked } = rankSamples(samples, null, groupCtx);
    expect(ranked.map((r) => [r.sample.id, r.indicative, r.suppressed])).toEqual([
      ["a", true, false],
      ["b", true, false],
      ["c", true, false],
      ["d", false, false],
      ["e", false, true],
    ]);
    expect(RANKING_POLICY.minN).toBe(3);
    expect(RANKING_POLICY.indicativeBelow).toBe(6);
  });

  it("(WP1c) indicativo by pooled cups: 1 person x 2 cups yes, 3 people x 2 cups no, in addition to the cupper rule", () => {
    expect(RANKING_POLICY.indicativeBelowCups).toBe(5);
    const samples = [
      rs("a", 90, { n: 1, cups: 2 }), // 1 person, 2 cups: indicative by cups (and suppressed by cuppers)
      rs("b", 88, { n: 3, cups: 6 }), // 3 people x 2 cups: by cups no, by cuppers yes (n < 5)
      rs("c", 86, { n: 6, cups: 4 }), // enough people, fewer than 5 cups pooled (1-cup sessions): by cups yes
      rs("d", 84, { n: 6, cups: 10 }), // neither
      rs("e", 82, { n: 6 }), // cups unknown: only the cupper rule decides
    ];
    const { ranked } = rankSamples(samples, null, groupCtx);
    const byId = Object.fromEntries(ranked.map((r) => [r.sample.id, [r.indicative, r.suppressed]]));
    expect(byId).toEqual({
      a: [true, true],
      b: [true, false],
      c: [true, false],
      d: [false, false],
      e: [false, false],
    });
  });

  it("(WP1c) 3 people x 2 cups with n >= 5 would not be flagged by cups", () => {
    const { ranked } = rankSamples([rs("a", 90, { n: 6, cups: 10 })], null, groupCtx);
    expect(ranked[0].indicative).toBe(false);
  });

  it("flags neighbours closer than half the larger sample SD", () => {
    // population sd 2, n 5 -> sample sd ~2.236 -> threshold ~1.118
    const samples = [
      rs("a", 85, { n: 5, sd: 2 }),
      rs("b", 84.5, { n: 5, sd: 2 }),
      rs("c", 80, { n: 5, sd: 2 }),
    ];
    const { ranked } = rankSamples(samples, null, groupCtx);
    expect(ranked.map((r) => r.noClearGap)).toEqual([true, true, false]);
  });

  it("never flags a 1+ point gap without an SD, and never on the 'mine' basis", () => {
    const { ranked } = rankSamples([rs("a", 87, { n: 5 }), rs("b", 85, { n: 5 })], null, groupCtx);
    expect(ranked.every((r) => !r.noClearGap)).toBe(true);
  });

  it("(WP5b D3) tie rule: the larger of 1 point and half the sample SD", () => {
    // no SD at all: the 1-point floor alone applies (strict: exactly 1.00 is clear)
    expect(hasNoClearGap(0.75, null)).toBe(true);
    expect(hasNoClearGap(1, null)).toBe(false);
    // gap 0.75 with a tiny SD: the floor wins -> no clear gap
    expect(hasNoClearGap(0.75, 0.2)).toBe(true);
    // gap 1.25, sample SD 3: half SD = 1.5 > 1.25 -> no clear gap
    expect(hasNoClearGap(1.25, 3)).toBe(true);
    // gap 1.25, sample SD 2: max(1, 1) = 1 < 1.25 -> clear
    expect(hasNoClearGap(1.25, 2)).toBe(false);
  });

  it("(WP5b D3) the floor flags neighbours without an SD in the ranking", () => {
    const { ranked } = rankSamples(
      [rs("a", 85, { n: 1 }), rs("b", 84.25, { n: 1 }), rs("c", 82, { n: 1 })],
      null,
      groupCtx,
    );
    expect(ranked.map((r) => r.noClearGap)).toEqual([true, true, false]);
  });

  it("carries n of N for the displayed community score", () => {
    const { ranked } = rankSamples([rs("a", 85, { n: 4, total: 6 })], null, groupCtx);
    expect(ranked[0].n).toBe(4);
    expect(ranked[0].total).toBe(6);
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
    cups: 5,
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

describe("participant summary and ficha — n of N (S8-12)", () => {
  it("N counts every submitted evaluation of the sample, excluded cuppers included", () => {
    const src = fixture();
    const model = buildParticipantSummary(
      { ...src, excludedUserIds: [CUPPERS.C.id] },
      { viewerId: CUPPERS.B.id, locale: "es", labels },
    );
    const s2 = model.samples.find((s) => s.label === "Muestra 2")!;
    const submitted = src.evals.filter((e) => e.sessionSampleId === "s-2").length;
    expect(s2.inclusion?.total).toBe(submitted);
    expect(s2.inclusion?.included).toBe(src.groupAggBySample["s-2"].included);
    expect(model.header.viewerExcluded).toBe(false);
  });

  it("tells a cupper their own evaluation was excluded, with no reason or peer identity", () => {
    const src = fixture();
    const model = buildParticipantSummary(
      { ...src, excludedUserIds: [CUPPERS.B.id] },
      { viewerId: CUPPERS.B.id, locale: "es", labels },
    );
    expect(model.header.viewerExcluded).toBe(true);
    const json = JSON.stringify(model);
    expect(json).not.toContain(CUPPERS.A.name);
    expect(json).not.toContain("exclusionReason");
  });

  it("ficha: N is all submitted evaluations and a thin panel is indicative with no SD", () => {
    const src = fixture();
    const m = buildFichaTecnica(src, { tier: "participant", locale: "es", labels });
    for (const [i, s] of m.samples.entries()) {
      if (!s.affective) continue;
      expect(s.affective.submitted).toBe(s.participation.submitted);
      if (s.affective.included < RANKING_POLICY.minN) expect(s.affective.sd).toBeNull();
      expect(s.affective.indicative).toBe(
        s.affective.communityScore != null &&
          (s.affective.included < RANKING_POLICY.indicativeBelow || (src.groupAggBySample[src.samples[i].id]?.totalCups ?? 99) < 5),
      );
    }
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

describe("gateSampleForViewer (S8-02 F-resultados-2)", () => {
  const input = { physical: { phys_color: "green" }, aggregateScore: { communityScore: 85 } };
  const open = { status: "active", sessionExpired: false };

  it("participant of a hidden group session gets no physical and no aggregate", () => {
    const ctx = {
      ownerRead: false,
      isGroup: true,
      canViewGroup: canViewGroupResults({ isGroup: true, ownerRead: false, ...open }),
    };
    expect(communityHidden(ctx)).toBe(true);
    expect(gateSampleForViewer(input, ctx)).toEqual({ physical: {}, aggregateScore: null });
  });
  it("owner and admin lens are unchanged", () => {
    const ctx = {
      ownerRead: true,
      isGroup: true,
      canViewGroup: canViewGroupResults({ isGroup: true, ownerRead: true, ...open }),
    };
    expect(communityHidden(ctx)).toBe(false);
    expect(gateSampleForViewer(input, ctx)).toEqual(input);
  });
  it("solo owner keeps the trigger-row aggregate", () => {
    const ctx = { ownerRead: true, isGroup: false, canViewGroup: false };
    expect(gateSampleForViewer(input, ctx)).toEqual(input);
  });
  it("participant of a closed group session sees the aggregate but never physical", () => {
    const ctx = {
      ownerRead: false,
      isGroup: true,
      canViewGroup: canViewGroupResults({
        isGroup: true,
        ownerRead: false,
        status: "closed",
        sessionExpired: false,
      }),
    };
    expect(gateSampleForViewer(input, ctx)).toEqual({
      physical: {},
      aggregateScore: input.aggregateScore,
    });
  });
  it("owner of a group session can always view, so owner + hidden is unreachable", () => {
    for (const status of ["active", "closed", "draft"]) {
      expect(
        canViewGroupResults({ isGroup: true, ownerRead: true, status, sessionExpired: false }),
      ).toBe(true);
    }
  });
  it("does not mutate its input", () => {
    const copy = structuredClone(input);
    gateSampleForViewer(input, { ownerRead: false, isGroup: true, canViewGroup: false });
    expect(input).toEqual(copy);
  });
});

describe("buildResultsCsv / csvCell (S8-12, F-informes-7)", () => {
  const src = fixture();
  // Codes built by hand: the keyed derivation lives in csvCodes.ts (tested below).
  // Deliberately NOT in name order (Alicia < Bruno < Carla) nor in participant order.
  const codes = new Map([
    [CUPPERS.A.id, "C-ZZ22"],
    [CUPPERS.B.id, "C-AA33"],
    [CUPPERS.C.id, "C-MM44"],
  ]);
  const base = { coffeeDeleted: "Café eliminado", codes };
  const out = buildResultsCsv(src, { locale: "es", ...base });
  // Non-empty lines of a CSV, without its BOM.
  const csvLines = (csv: string) => csv.replace(/^﻿/, "").split("\n").filter(Boolean);
  const rowsOf = (csv: string) => csvLines(csv).slice(1);

  it("starts with a UTF-8 BOM and one row per submitted evaluation", () => {
    expect(out.csv.charCodeAt(0)).toBe(0xfeff);
    const lines = out.csv.trim().split("\n");
    expect(lines).toHaveLength(src.evals.length + 1);
    expect(out.rows).toBe(src.evals.length);
    expect(lines[0]).toContain("puntaje_cafe_sensible");
  });

  it("never prints the coffee of a blind sample", () => {
    expect(out.csv).not.toContain("CAFE-CIEGO-SECRETO");
    expect(out.csv).toContain("Finca Revelada");
  });

  it("names plus a code by default; the no-names variant drops the name and reason columns", () => {
    expect(out.csv).toContain(CUPPERS.A.name);
    expect(csvLines(out.csv)[0]).toMatch(/^catador,codigo,muestra,.*,excluido,motivo_exclusion,/);
    const coded = buildResultsCsv(src, { locale: "en", names: false, ...base });
    expect(coded.csv).not.toContain(CUPPERS.A.name);
    expect(csvLines(coded.csv)[0]).toMatch(/^code,sample,/);
    expect(csvLines(coded.csv)[0]).toContain("excluded");
    expect(csvLines(coded.csv)[0]).not.toContain("exclusion_reason");
    expect(csvLines(coded.csv)[0]).toContain("cafe_sensible_score");
  });

  it("rows follow the sample order, then the CODE: never name, id or join order", () => {
    const rows = rowsOf(buildResultsCsv(src, { locale: "es", names: false, ...base }).csv);
    const bySample = new Map<string, string[]>();
    for (const r of rows) {
      const [code, sample] = r.split(",");
      bySample.set(sample, [...(bySample.get(sample) ?? []), code]);
    }
    for (const list of bySample.values()) expect(list).toEqual([...list].sort());
    // Name order would put C-ZZ22 (Alicia) first; code order puts it last.
    const first = [...bySample.values()].find((l) => l.length === 3)!;
    expect(first).toEqual(["C-AA33", "C-MM44", "C-ZZ22"]);
    // The named variant uses the same order.
    const named = rowsOf(out.csv)
      .filter((r) => r.includes("Muestra REF"))
      .map((r) => r.split(",")[1]);
    expect(named).toEqual([...named].sort());
  });

  it("no-names variant: no display name, user id, email or exclusion reason, even a free text that names someone", () => {
    const people = (["A", "B", "C"] as const).map((k) => CUPPERS[k]);
    const shared = {
      ...src,
      excludedUserIds: [CUPPERS.C.id],
      participants: src.participants.map((p) =>
        p.userId === CUPPERS.C.id
          ? { ...p, excluded: true, exclusionReason: `other:${CUPPERS.B.name} llegó tarde` }
          : p,
      ),
    };
    for (const locale of ["es", "en"] as const) {
      const noNames = buildResultsCsv(shared, { locale, names: false, ...base }).csv;
      for (const c of people) {
        expect(noNames).not.toContain(c.name);
        expect(noNames).not.toContain(c.id);
      }
      expect(noNames).not.toContain("@");
      expect(noNames).not.toContain("llegó tarde");
      expect(noNames).not.toContain("other");
      expect(noNames).not.toContain("protocol");
    }
    // The owner file keeps the full reason.
    expect(buildResultsCsv(shared, { locale: "es", ...base }).csv).toContain("llegó tarde");
  });

  it("the same cupper has the same code in both variants", () => {
    const withNames = rowsOf(out.csv).map((r) => r.split(",")[1]).sort();
    const without = rowsOf(buildResultsCsv(src, { locale: "es", names: false, ...base }).csv)
      .map((r) => r.split(",")[0])
      .sort();
    expect(without).toEqual(withNames);
  });

  it("an excluded cupper is marked in the no-names variant too (without the reason)", () => {
    const sh = buildResultsCsv(
      {
        ...src,
        excludedUserIds: [CUPPERS.C.id],
        participants: src.participants.map((p) =>
          p.userId === CUPPERS.C.id ? { ...p, excluded: true, exclusionReason: "protocol" } : p,
        ),
      },
      { locale: "es", names: false, ...base },
    ).csv;
    expect(rowsOf(sh).filter((r) => r.startsWith("C-MM44,")).every((r) => r.includes(",si,"))).toBe(true);
    expect(sh).not.toContain("protocol");
  });

  it("flags excluded cuppers with their reason (owner file)", () => {
    const withExclusion = buildResultsCsv(
      {
        ...src,
        excludedUserIds: [CUPPERS.C.id],
        participants: src.participants.map((p) =>
          p.userId === CUPPERS.C.id ? { ...p, excluded: true, exclusionReason: "protocol" } : p,
        ),
      },
      { locale: "es", ...base },
    );
    const cLines = withExclusion.csv.split("\n").filter((l) => l.startsWith(CUPPERS.C.name));
    expect(cLines.length).toBeGreaterThan(0);
    expect(cLines.every((l) => l.includes(",si,protocol,"))).toBe(true);
  });

  it("neutralises formula injection and quotes awkward cells", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("plain")).toBe("plain");
  });
});
