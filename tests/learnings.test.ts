import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL, SENSORY_DEFECTS } from "@/lib/constants";
import type { RankValue } from "@/lib/reports/ranking";
import { REPEAT_TOLERANCE } from "@/lib/reports/repeatedSample";
import { buildWheelData, type WheelData } from "@/lib/reports/wheelData";
import {
  LEARNING_CAPS,
  LEARNING_RULES,
  LEARNING_THRESHOLDS,
  REPEATED_COFFEE_FIRST,
  buildDefectSummary,
  buildLearnings,
  learningScope,
  panelLearningsStatus,
  type DefectSummary,
  type Learning,
  type LearningSample,
  type LearningsInput,
} from "@/lib/reports/learnings";

// Package R4a: the fourteen learnings as data
// (docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 7).

const community = (score: number, n = 7, sd: number | null = 3, total: number | null = 8): RankValue => ({
  score,
  sd,
  basis: "community",
  n,
  total,
  cups: n * 2,
});
const own = (score: number | null): RankValue => ({ score, sd: null, basis: score === null ? null : "mine", n: null, total: null });
const sample = (id: string, over: Partial<LearningSample> = {}): LearningSample => ({
  id,
  isReference: false,
  value: community(84),
  mine: null,
  deltaVsReference: null,
  ...over,
});
const session = (samples: LearningSample[], over: Partial<LearningsInput> = {}): LearningsInput => ({
  closed: true,
  isGroup: true,
  groupVisible: true,
  ownerLens: false,
  format: "combined",
  samples,
  referenceId: null,
  ...over,
});
const rules = (list: Learning[]) => list.map((l) => l.rule);
const find = <R extends Learning["rule"]>(list: Learning[], rule: R) =>
  list.find((l): l is Extract<Learning, { rule: R }> => l.rule === rule);
const wheelOf = (direct: Record<string, number>, n: number): WheelData => ({ status: "ok", scope: "group", n, direct, rollup: {}, mine: null });
const defects = (cuppers: number, n: number, cups = cuppers, type: DefectSummary["types"][number]["type"] = "phenolic"): DefectSummary => ({
  n,
  cuppers,
  cups,
  types: cups > 0 ? [{ type, cups }] : [],
});

// The invented cupping of the mock: a pinned reference E and seven ranked coffees.
const MOCK = (): LearningsInput =>
  session(
    [
      sample("E", { isReference: true, pinned: true, value: community(79, 7, null), mine: 79, wheel: wheelOf({ "nutty_cocoa:nutty": 4 }, 7) }),
      sample("G", { value: community(88.75, 7, 2.9), mine: 90.75, deltaVsReference: 9.75, wheel: wheelOf({ "fruity:berry": 6, "floral:floral:jasmine": 4 }, 7) }),
      sample("C", { value: community(88, 7, 4.6), mine: 84.25, deltaVsReference: 9, wheel: wheelOf({ "fruity:berry": 5 }, 7) }),
      sample("A", { value: community(85.5, 7, 2.1), mine: 86.25, deltaVsReference: 6.5 }),
      sample("H", { value: community(84.25, 6, 3.3), mine: 85, deltaVsReference: 5.25 }),
      sample("B", { value: community(83.5, 7, 3), mine: 84.25, deltaVsReference: 4.5 }),
      sample("F", { value: community(82.75, 7, 3.8), mine: 83, deltaVsReference: 3.75 }),
      sample("D", { value: community(78.25, 7, 5.2), mine: 74.25, deltaVsReference: -0.75, defects: defects(2, 7, 2) }),
    ],
    { referenceId: "E", alignment: { matches: 21, opportunities: 34, cuppers: 7 }, repeats: [{ a: "B", b: "F", scoreA: 84.25, scoreB: 83 }] },
  );

describe("the table of rules", () => {
  it("fourteen rules, in the order they are shown", () => {
    expect([...LEARNING_RULES]).toEqual(["G0", "G1", "G2", "G3", "G4", "G5", "P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2"]);
    expect(LEARNING_RULES.map(learningScope)).toEqual([...Array(6).fill("panel"), ...Array(8).fill("mine")]);
  });

  it("the thresholds are named in one place (simulated values, they wait on Kim)", () => {
    expect(LEARNING_THRESHOLDS).toEqual({
      mostSharedMinPeople: 3,
      mostSharedMinShare: 0.5,
      spreadMinRange: 0.5,
      furthestMinPoints: 1,
      attributeMinMeanDifference: 0.5,
      alignmentMinOpportunities: 5,
    });
    expect(LEARNING_CAPS).toEqual({ panel: 4, mine: 5 });
    expect(REPEAT_TOLERANCE).toBe(2);
  });
});

describe("the mock's cupping", () => {
  it("at most four about the panel and five of the viewer's own, in the table's order", () => {
    // the approved order of the table
    expect(rules(buildLearnings(MOCK(), { repeatedFirst: false }))).toEqual(["G0", "G1", "G2", "G3", "P1", "P2", "P3", "P5", "P6"]);
  });

  it("the repeated coffee comes first among the viewer's own (the built default), so the cap never cuts it", () => {
    expect(REPEATED_COFFEE_FIRST).toBe(true);
    expect(rules(buildLearnings(MOCK()))).toEqual(["G0", "G1", "G2", "G3", "P6", "P1", "P2", "P3", "P5"]);
    expect(rules(buildLearnings(MOCK(), { repeatedFirst: true }))).toEqual(rules(buildLearnings(MOCK())));
    // with five others of the viewer's own, the approved order cuts P6; this one cuts the last instead
    const five = { ...MOCK(), samples: MOCK().samples.map((s) => ({ ...s, attributes: [{ id: "acidez_af", mine: 9, group: 6 }] })) };
    expect(rules(buildLearnings(five, { repeatedFirst: false })).filter((r) => r.startsWith("P"))).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect(rules(buildLearnings(five)).filter((r) => r.startsWith("P"))).toEqual(["P6", "P1", "P2", "P3", "P4"]);
  });

  it("each learning carries the numbers of its sentence", () => {
    const list = buildLearnings(MOCK());
    expect(find(list, "G0")).toEqual({ rule: "G0", about: ["G"], params: { descriptor: "fruity:berry", people: 6, of: 7 } });
    expect(find(list, "G1")).toEqual({ rule: "G1", about: ["A"], params: { spread: 2.1, included: 7, submitted: 8 } });
    expect(find(list, "G2")).toEqual({ rule: "G2", about: ["D"], params: { spread: 5.2, included: 7, submitted: 8 } });
    expect(find(list, "G3")).toEqual({ rule: "G3", about: ["G", "C"], params: { gap: 0.75 } });
    expect(find(list, "P1")).toEqual({ rule: "P1", about: ["D"], params: { mine: 74.25, group: 78.25, difference: -4 } });
    expect(find(list, "P2")).toEqual({ rule: "P2", about: ["F"], params: { mine: 83, group: 82.75, difference: 0.25 } });
    // the design's tile: "5 de 7 muestras ... diferencia media -0.46"
    expect(find(list, "P3")).toEqual({
      rule: "P3",
      about: ["G", "C", "A", "H", "B", "F", "D"],
      params: { above: 5, of: 7, meanDifference: -0.46 },
    });
    expect(find(list, "P5")).toEqual({ rule: "P5", about: [], params: { matches: 21, opportunities: 34, percent: 62 } });
    expect(find(list, "P6")).toEqual({
      rule: "P6",
      about: ["B", "F"],
      params: { scoreA: 84.25, scoreB: 83, difference: 1.25, within: true, tolerance: 2 },
    });
  });

  it("the ones the cap leaves out are computed all the same", () => {
    const input = MOCK();
    // without a wheel there is no G0, so G4 enters the four
    const noWheel = { ...input, samples: input.samples.map((s) => ({ ...s, wheel: null })) };
    const list = buildLearnings(noWheel);
    expect(rules(list).slice(0, 4)).toEqual(["G1", "G2", "G3", "G4"]);
    expect(find(list, "G4")).toEqual({
      rule: "G4",
      about: ["E", "G"],
      params: { referenceScore: 79, above: 6, of: 7, delta: 9.75 },
    });
    // without spreads and ties, G5 enters
    const flat = { ...noWheel, samples: noWheel.samples.map((s, i) => ({ ...s, value: { ...s.value, sd: null, score: s.isReference ? 79 : 90 - i * 3 } })) };
    expect(find(buildLearnings(flat), "G5")).toEqual({
      rule: "G5",
      about: ["D"],
      params: { people: 2, of: 7, cups: 2, types: [{ type: "phenolic", cups: 2 }] },
    });
  });
});

describe("G0, the most shared descriptor", () => {
  const withWheel = (wheel: WheelData | null, over: Partial<LearningsInput> = {}) =>
    buildLearnings(session([sample("A", { wheel })], over));

  it("fires at three cuppers who are half the panel, and not one short of either", () => {
    expect(rules(withWheel(wheelOf({ fruity: 3 }, 6)))).toEqual(["G0"]);
    expect(rules(withWheel(wheelOf({ fruity: 3 }, 7)))).toEqual([]); // 3 of 7 is under half
    expect(rules(withWheel(wheelOf({ fruity: 2 }, 3)))).toEqual([]); // two people
    expect(rules(withWheel(wheelOf({ fruity: 3 }, 3)))).toEqual(["G0"]);
  });

  it("takes the descriptor with the most cuppers over every sample; a larger share breaks a tie", () => {
    const list = buildLearnings(
      session([
        sample("A", { value: community(90), wheel: wheelOf({ fruity: 4, "floral:floral:jasmine": 5 }, 8) }),
        sample("B", { value: community(85), wheel: wheelOf({ "sweet:brown_sugar:honey": 5 }, 6) }),
        sample("C", { value: community(80), wheel: wheelOf({ roasted: 5 }, 8) }),
      ]),
    );
    expect(find(list, "G0")).toEqual({ rule: "G0", about: ["B"], params: { descriptor: "sweet:brown_sugar:honey", people: 5, of: 6 } });
  });

  it("needs a wheel that may be shown: not 'too few', not the viewer's own marks, not an affective session", () => {
    expect(rules(withWheel({ status: "too_few", included: 2 }))).toEqual([]);
    expect(rules(withWheel({ status: "no_wheel", reason: "affective_format" }))).toEqual([]);
    expect(rules(withWheel({ ...wheelOf({ fruity: 1 }, 1), scope: "own" } as WheelData))).toEqual([]);
    expect(rules(withWheel(wheelOf({ fruity: 5 }, 6), { format: "affective" }))).toEqual([]);
    expect(rules(withWheel(null))).toEqual([]);
  });

  it("a descriptive session has no scores and still has it", () => {
    const list = buildLearnings(
      session([sample("A", { value: own(null), wheel: wheelOf({ fruity: 4 }, 5) })], { format: "descriptive" }),
    );
    expect(rules(list)).toEqual(["G0"]);
  });

  it("a reference is never its subject", () => {
    const list = buildLearnings(
      session([
        sample("R", { isReference: true, wheel: wheelOf({ fruity: 7 }, 7) }),
        sample("A", { wheel: wheelOf({ roasted: 4 }, 7) }),
      ]),
    );
    expect(find(list, "G0")?.about).toEqual(["A"]);
  });
});

describe("G1 and G2, the smallest and the largest spread", () => {
  const two = (a: number | null, b: number | null, n = 7) =>
    buildLearnings(session([sample("A", { value: community(90, n, a) }), sample("B", { value: community(80, n, b) })]));

  it("fire together when the two spreads are 0.5 apart, and not at 0.4", () => {
    expect(rules(two(2.6, 2.1))).toEqual(["G1", "G2"]);
    expect(2.3 - 1.8).toBeLessThan(0.5); // 0.4999999999999998 in floating point: the range is rounded first
    expect(rules(two(2.3, 1.8))).toEqual(["G1", "G2"]);
    expect(rules(two(4.1, 3.6))).toEqual(["G1", "G2"]);
    expect(rules(two(2.5, 2.1))).toEqual([]);
    expect(find(two(2.6, 2.1), "G1")?.about).toEqual(["B"]);
    expect(find(two(2.6, 2.1), "G2")?.about).toEqual(["A"]);
  });

  it("need two samples that have a spread", () => {
    expect(rules(two(4, null))).toEqual([]);
    expect(rules(buildLearnings(session([sample("A", { value: community(90, 7, 4) })])))).toEqual([]);
  });

  it("on equal spreads the first of the ranking is named", () => {
    const list = buildLearnings(
      session([
        sample("lo2", { value: community(80, 7, 1) }),
        sample("hi", { value: community(85, 7, 4) }),
        sample("lo1", { value: community(90, 7, 1) }),
      ]),
    );
    expect(find(list, "G1")?.about).toEqual(["lo1"]);
  });
});

describe("G3, the first and the second", () => {
  const top = (a: RankValue, b: RankValue) => buildLearnings(session([sample("B", { value: b }), sample("A", { value: a })]));

  it("fires under one point, not at one point", () => {
    expect(find(top(community(88.75, 7, 1), community(88, 7, 1)), "G3")).toEqual({ rule: "G3", about: ["A", "B"], params: { gap: 0.75 } });
    expect(rules(top(community(88, 7, 1), community(87, 7, 1)))).not.toContain("G3");
  });

  it("fires on the spread too, and on equal scores", () => {
    expect(find(top(community(88, 7, 4.6), community(86, 7, 2)), "G3")?.params).toEqual({ gap: 2 });
    expect(find(top(community(88, 7, 1), community(88, 7, 1)), "G3")?.params).toEqual({ gap: 0 });
  });

  it("is about the two highest scores, whatever order the page lists the samples in", () => {
    const list = buildLearnings(
      session([sample("low", { value: community(70, 7, 1) }), sample("second", { value: community(89.5, 7, 1) }), sample("first", { value: community(90, 7, 1) })]),
    );
    expect(find(list, "G3")?.about).toEqual(["first", "second"]);
  });
});

describe("G4, against the reference", () => {
  const ranked = [
    sample("A", { value: community(86), deltaVsReference: 4.5 }),
    sample("B", { value: community(80), deltaVsReference: -1.5 }),
    sample("C", { value: community(76), deltaVsReference: -5.5 }),
  ];

  it("a fixed reference: how many are above it, and the furthest, with its sign", () => {
    const ref = sample("R", { isReference: true, pinned: true, value: community(79, 7, null) });
    expect(find(buildLearnings(session([ref, ...ranked], { referenceId: "R" })), "G4")).toEqual({
      rule: "G4",
      about: ["R", "C"],
      params: { referenceScore: 79, above: 1, of: 3, delta: -5.5 },
    });
  });

  it("a free reference: its average is used from three cuppers, and not from two", () => {
    const free = (n: number) => sample("R", { isReference: true, pinned: false, value: community(81.5, n, n < 3 ? null : 2.4) });
    expect(find(buildLearnings(session([free(7), ...ranked], { referenceId: "R" })), "G4")?.params.referenceScore).toBe(81.5);
    expect(rules(buildLearnings(session([free(2), ...ranked], { referenceId: "R" })))).not.toContain("G4");
  });

  it("no reference, no sentence; a sample without a delta is not counted", () => {
    expect(rules(buildLearnings(session(ranked)))).not.toContain("G4");
    const ref = sample("R", { isReference: true, pinned: true, value: community(79, 7, null) });
    const list = buildLearnings(session([ref, ranked[0], sample("X", { value: community(70) })], { referenceId: "R" }));
    expect(find(list, "G4")?.params).toMatchObject({ above: 1, of: 1 });
    expect(rules(buildLearnings(session([ref, sample("X", { value: community(70) })], { referenceId: "R" })))).not.toContain("G4");
  });

  it("the id of a sample that is not a reference is not taken as one", () => {
    expect(rules(buildLearnings(session(ranked, { referenceId: "A" })))).not.toContain("G4");
  });
});

describe("G5, defective cups", () => {
  it("names the sample most cuppers flagged; more cups breaks a tie", () => {
    const list = buildLearnings(
      session([
        sample("A", { value: community(90), defects: defects(1, 7, 1) }),
        sample("B", { value: community(85), defects: defects(2, 7, 2) }),
        sample("C", { value: community(80), defects: defects(2, 7, 3, "moldy") }),
        sample("D", { value: community(75), defects: defects(0, 7, 0) }),
      ]),
    );
    expect(find(list, "G5")).toEqual({ rule: "G5", about: ["C"], params: { people: 2, of: 7, cups: 3, types: [{ type: "moldy", cups: 3 }] } });
  });

  it("nobody flagged, or fewer than three included: nothing", () => {
    expect(rules(buildLearnings(session([sample("A", { defects: defects(0, 7, 0) })])))).toEqual([]);
    expect(rules(buildLearnings(session([sample("A", { value: community(84, 2, null), defects: defects(1, 2, 1) })])))).toEqual([]);
  });
});

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

describe("P1, P2 and P3, the viewer beside the group", () => {
  const pair = (mineA: number, mineB: number | null = null) =>
    buildLearnings(
      session([
        sample("A", { value: community(85, 7, null), mine: mineA }),
        ...(mineB === null ? [] : [sample("B", { value: community(80, 7, null), mine: mineB })]),
      ]),
    );

  it("P1 fires at one point of distance, in either direction, and not under it", () => {
    expect(find(pair(86), "P1")?.params).toEqual({ mine: 86, group: 85, difference: 1 });
    expect(find(pair(84), "P1")?.params.difference).toBe(-1);
    expect(rules(pair(85.75))).toEqual(["P3"]);
  });

  it("P2 is the closest one, when it is another sample", () => {
    const list = pair(88, 80.25);
    expect(find(list, "P1")?.about).toEqual(["A"]);
    expect(find(list, "P2")).toEqual({ rule: "P2", about: ["B"], params: { mine: 80.25, group: 80, difference: 0.25 } });
    expect(rules(pair(88))).toEqual(["P1", "P3"]);
    // P2 does not need P1
    expect(rules(pair(85.5, 80.25))).toEqual(["P2", "P3"]);
  });

  it("P3 counts the samples above the group and gives the mean difference with its sign", () => {
    expect(find(pair(86, 78.5), "P3")).toEqual({ rule: "P3", about: ["A", "B"], params: { above: 1, of: 2, meanDifference: -0.25 } });
    expect(find(pair(85), "P3")?.params).toEqual({ above: 0, of: 1, meanDifference: 0 });
  });

  it("uses only samples where the viewer has a score and the group has three cuppers; never a reference", () => {
    const list = buildLearnings(
      session([
        sample("R", { isReference: true, value: community(81, 7, 2), mine: 90 }),
        sample("A", { value: community(85, 7, null), mine: 87 }),
        sample("two", { value: community(80, 2, null), mine: 70 }),
        sample("none", { value: community(75, 7, null), mine: null }),
      ]),
    );
    expect(find(list, "P1")?.about).toEqual(["A"]);
    expect(find(list, "P3")?.about).toEqual(["A"]);
    expect(rules(list)).not.toContain("P2");
  });
});

describe("P4, the attribute furthest from the group", () => {
  const attrs = (pairs: Record<string, [number | null, number | null]>) =>
    Object.entries(pairs).map(([id, [mine, group]]) => ({ id, mine, group }));
  const two = (a: Record<string, [number | null, number | null]>, b: Record<string, [number | null, number | null]>) =>
    buildLearnings(
      session([
        sample("A", { value: community(85, 7, null), mine: 85, attributes: attrs(a) }),
        sample("B", { value: community(80, 7, null), mine: 80, attributes: attrs(b) }),
      ]),
    );

  it("fires at a mean difference of 0.5 and not under it", () => {
    expect(find(two({ acidity: [7, 6.5] }, { acidity: [6, 5.5] }), "P4")).toEqual({
      rule: "P4",
      about: [],
      params: { attribute: "acidity", samples: 2, meanDifference: 0.5 },
    });
    expect(rules(two({ acidity: [7, 6.5] }, { acidity: [6, 5.6] }))).not.toContain("P4");
  });

  it("names the largest one, below the group as well as above", () => {
    const list = two({ acidity: [7, 6.4], flavor: [5, 6.5], aroma: [6, 6] }, { acidity: [7, 6.2], flavor: [5, 6.3] });
    expect(find(list, "P4")?.params).toEqual({ attribute: "flavor", samples: 2, meanDifference: -1.4 });
  });

  it("a row without the group's value, or without the viewer's, is not used", () => {
    const list = two({ acidity: [8, null], flavor: [7, 6] }, { acidity: [null, 6], flavor: [null, 6] });
    expect(find(list, "P4")?.params).toEqual({ attribute: "flavor", samples: 1, meanDifference: 1 });
  });
});

describe("P5, the viewer's own alignment", () => {
  const al = (alignment: LearningsInput["alignment"], over: Partial<LearningsInput> = {}) =>
    buildLearnings(session([sample("A")], { alignment, ...over }));

  it("fires from five majority descriptors, not from four", () => {
    expect(find(al({ matches: 3, opportunities: 5, cuppers: 7 }), "P5")?.params).toEqual({ matches: 3, opportunities: 5, percent: 60 });
    expect(rules(al({ matches: 3, opportunities: 4, cuppers: 7 }))).toEqual([]);
    expect(find(al({ matches: 21, opportunities: 34, cuppers: 7 }), "P5")?.params.percent).toBe(62);
  });

  it("needs three included cuppers, and a format with descriptors", () => {
    expect(rules(al({ matches: 5, opportunities: 5, cuppers: 2 }))).toEqual([]);
    expect(rules(al({ matches: 5, opportunities: 5, cuppers: 2 }, { ownerLens: true }))).toEqual([]);
    expect(rules(al({ matches: 5, opportunities: 5, cuppers: 3 }))).toEqual(["P5"]);
    expect(rules(al({ matches: 5, opportunities: 5, cuppers: 7 }, { format: "affective" }))).toEqual([]);
    expect(rules(al(null))).toEqual([]);
  });
});

describe("P6, the same coffee twice", () => {
  const rep = (scoreA: number, scoreB: number, over: Partial<LearningsInput> = {}) =>
    buildLearnings(session([sample("B", { value: own(scoreA) }), sample("F", { value: own(scoreB) })], { isGroup: false, repeats: [{ a: "B", b: "F", scoreA, scoreB }], ...over }));

  it("two points is within the tolerance, more is outside", () => {
    expect(find(rep(84, 82), "P6")?.params).toEqual({ scoreA: 84, scoreB: 82, difference: 2, within: true, tolerance: 2 });
    expect(find(rep(82, 84.25), "P6")?.params).toMatchObject({ difference: 2.25, within: false });
  });

  it("one sentence per pair, however the pair is given", () => {
    const list = buildLearnings(
      session([sample("B"), sample("F")], {
        repeats: [
          { a: "B", b: "F", scoreA: 84, scoreB: 83 },
          { a: "F", b: "B", scoreA: 83, scoreB: 84 },
          { a: "B", b: "B", scoreA: 84, scoreB: 84 },
        ],
      }),
    );
    expect(list.filter((l) => l.rule === "P6")).toHaveLength(1);
    expect(find(list, "P6")?.about).toEqual(["B", "F"]);
  });

  it("exists in a solo session and with two cuppers: it is the viewer's own data", () => {
    expect(rules(rep(84, 82))).toEqual(["P6", "S1"]);
    const twoCuppers = session([sample("B", { value: community(84, 2, null), mine: 84 }), sample("F", { value: community(82, 2, null), mine: 82 })], {
      repeats: [{ a: "B", b: "F", scoreA: 84, scoreB: 82 }],
    });
    expect(rules(buildLearnings(twoCuppers))).toEqual(["P6"]);
  });
});

describe("a solo session", () => {
  const soloOf = (samples: LearningSample[], over: Partial<LearningsInput> = {}) =>
    buildLearnings(session(samples, { isGroup: false, groupVisible: false, ...over }));

  it("S1: the highest and the lowest score, and the points between them", () => {
    const list = soloOf([sample("A", { value: own(84.25) }), sample("B", { value: own(88) }), sample("C", { value: own(80.5) })]);
    expect(list).toEqual([{ rule: "S1", about: ["B", "C"], params: { highest: 88, lowest: 80.5, range: 7.5 } }]);
    expect(soloOf([sample("A", { value: own(84.25) })])).toEqual([]);
    expect(soloOf([sample("A", { value: own(84.25) }), sample("B", { value: own(null) })])).toEqual([]);
  });

  it("S2: against the cupper's own reference", () => {
    const list = soloOf(
      [
        sample("R", { isReference: true, pinned: true, value: own(79) }),
        sample("A", { value: own(84.25), deltaVsReference: 5.25 }),
        sample("B", { value: own(78), deltaVsReference: -1 }),
      ],
      { referenceId: "R" },
    );
    expect(find(list, "S2")).toEqual({ rule: "S2", about: ["R"], params: { referenceScore: 79, above: 1, of: 2 } });
    expect(find(list, "S1")?.about).toEqual(["A", "B"]); // the reference is not the highest or the lowest
  });

  it("gets no sentence that needs a panel, whatever is passed", () => {
    const input = { ...MOCK(), isGroup: false };
    expect(rules(buildLearnings(input))).toEqual(["P6"]);
    expect(panelLearningsStatus(input)).toBe("not_applicable");
  });

  it("a group session never gets S1 or S2", () => {
    const list = buildLearnings(MOCK());
    expect(rules(list).some((r) => r.startsWith("S"))).toBe(false);
    // not even when the page shows the viewer only their own scores
    const ownOnly = session(
      [
        sample("R", { isReference: true, pinned: true, value: own(79) }),
        sample("A", { value: own(88), deltaVsReference: 9 }),
        sample("B", { value: own(80), deltaVsReference: 1 }),
      ],
      { groupVisible: false, referenceId: "R" },
    );
    expect(buildLearnings(ownOnly)).toEqual([]);
    expect(rules(buildLearnings({ ...ownOnly, isGroup: false }))).toEqual(["S1", "S2"]);
  });
});

describe("the gates", () => {
  const panelOf = (n: number, over: Partial<LearningsInput> = {}) =>
    session(
      [
        sample("R", { isReference: true, pinned: true, value: community(79, n, null), mine: 79 }),
        sample("A", { value: community(88.5, n, n >= 3 ? 1.5 : null), mine: 90, deltaVsReference: 9.5, wheel: buildWheelDataOf(n), defects: defects(1, n, 1) }),
        sample("B", { value: community(88, n, n >= 3 ? 4 : null), mine: 84, deltaVsReference: 9, attributes: [{ id: "acidity", mine: 8, group: n >= 3 ? 6 : null }] }),
      ],
      { referenceId: "R", alignment: { matches: 4, opportunities: 6, cuppers: n }, ...over },
    );
  /** A real WheelData for a participant, from n cuppers who all picked the same node. */
  function buildWheelDataOf(n: number): WheelData {
    return buildWheelData({
      format: "combined",
      evaluations: Array.from({ length: n }, (_, i) => ({ cupperKey: `k${i}`, excluded: false, submitted: true, data: { sabor_desc: ["fruity:berry"] } })),
      ownerLens: false,
    });
  }

  it("one or two included cuppers: nothing about the panel and nothing beside the group", () => {
    for (const n of [1, 2]) {
      expect(buildLearnings(panelOf(n))).toEqual([]);
      expect(panelLearningsStatus(panelOf(n))).toBe("too_few");
      // the organizer's lens does not open them either
      expect(buildLearnings(panelOf(n, { ownerLens: true }))).toEqual([]);
    }
  });

  it("three, and six: the panel's sentences and the viewer's own", () => {
    for (const n of [3, 6]) {
      expect(rules(buildLearnings(panelOf(n)))).toEqual(["G0", "G1", "G2", "G3", "P1", "P2", "P3", "P4", "P5"]);
      expect(panelLearningsStatus(panelOf(n))).toBe("ok");
    }
  });

  it("an owner-lens wheel of two cuppers handed to a participant's page is not read", () => {
    const ownerWheel = buildWheelData({
      format: "combined",
      evaluations: [0, 1].map((i) => ({ cupperKey: `k${i}`, excluded: false, submitted: true, data: { sabor_desc: ["fruity:berry"] } })),
      ownerLens: true,
    });
    expect(ownerWheel.status).toBe("ok");
    const input = session([sample("A", { wheel: { ...ownerWheel, n: 2 } as WheelData })]);
    expect(rules(buildLearnings(input))).toEqual([]);
  });

  it("not closed: nothing at all", () => {
    expect(buildLearnings({ ...MOCK(), closed: false })).toEqual([]);
    expect(panelLearningsStatus({ ...MOCK(), closed: false })).toBe("not_applicable");
  });

  it("group results not visible: nothing about the panel and nothing beside it", () => {
    const list = buildLearnings({ ...MOCK(), groupVisible: false });
    expect(rules(list)).toEqual(["P6"]);
    expect(panelLearningsStatus({ ...MOCK(), groupVisible: false })).toBe("not_applicable");
  });

  it("an affective session has no learning read from descriptors", () => {
    const list = buildLearnings({ ...MOCK(), format: "affective" });
    expect(rules(list)).not.toContain("G0");
    expect(rules(list)).not.toContain("P5");
    expect(rules(list)).toEqual(["G1", "G2", "G3", "G4", "P6", "P1", "P2", "P3"]);
  });
});

describe("references, in both modes", () => {
  const withReference = (pinned: boolean) =>
    session(
      [
        sample("R", {
          isReference: true,
          pinned,
          value: community(pinned ? 79 : 95, 7, pinned ? null : 0.1),
          mine: pinned ? 79 : 60,
          wheel: wheelOf({ fruity: 7 }, 7),
          defects: defects(7, 7, 14),
          attributes: [{ id: "acidity", mine: 1, group: 9 }],
        }),
        sample("A", { value: community(86, 7, 2), mine: 87, deltaVsReference: pinned ? 7 : -9, wheel: wheelOf({ roasted: 4 }, 7), defects: defects(1, 7, 1) }),
        sample("B", { value: community(82, 7, 3), mine: 82.5, deltaVsReference: pinned ? 3 : -13 }),
      ],
      { referenceId: "R" },
    );

  it.each([true, false])("pinned = %s: the reference is only what G4 compares against", (pinned) => {
    const input = withReference(pinned);
    // all six panel rules, to look at each
    const all = [buildLearnings(input), buildLearnings({ ...input, samples: input.samples.map((s) => ({ ...s, wheel: null })) })].flat();
    for (const l of all) {
      if (l.rule === "G4") expect(l.about[0]).toBe("R");
      else expect(l.about, l.rule).not.toContain("R");
    }
    expect(rules(all)).toContain("G4");
    expect(rules(all)).toContain("G5");
    // it is not the first of the ranking even with the highest score, nor the smallest spread
    expect(find(all, "G1")?.about).toEqual(["A"]);
    expect(find(all, "G0")?.about).toEqual(["A"]);
    expect(find(all, "G5")?.about).toEqual(["A"]);
    expect(find(all, "P3")?.params.of).toBe(2);
    expect(rules(all)).not.toContain("P4"); // the reference's attributes are not read
  });
});

// ── Generated sessions ───────────────────────────────────────────────────────

function generator(seed0: number) {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  return { rnd, pick };
}
const NODE_IDS = FLAVOR_WHEEL.map((n) => n.id);
const ATTR_IDS = AFFECTIVE_ATTRIBUTES.map((a) => a.id);
const quarter = (v: number) => Math.round(v * 4) / 4;

function generated(seed: number): { input: LearningsInput; keys: string[] } {
  const g = generator(seed);
  const format = g.pick(["combined", "combined", "affective", "descriptive"]);
  const isGroup = g.rnd() < 0.8;
  const cuppers = Array.from({ length: 1 + Math.floor(g.rnd() * 8) }, (_, i) => `cupper-${seed}-${i}-7c21`);
  const hasReference = g.rnd() < 0.5;
  const samples: LearningSample[] = Array.from({ length: 1 + Math.floor(g.rnd() * 7) }, (_, i) => {
    const evaluations = cuppers.map((cupperKey) => ({
      cupperKey,
      excluded: g.rnd() < 0.1,
      submitted: g.rnd() < 0.9,
      cups: 2,
      data: {
        ...Object.fromEntries(ATTR_IDS.map((a) => [`${a}_final`, 1 + Math.floor(g.rnd() * 9)])),
        sabor_desc: [g.pick(NODE_IDS), g.pick(NODE_IDS)],
        aroma_desc: g.rnd() < 0.5 ? ["fruity:berry"] : [],
        tazas_defectuosas: [g.rnd() < 0.15, g.rnd() < 0.05],
        cupperId: cupperKey,
        notas: `nota de ${cupperKey}`,
      },
    }));
    const n = Math.floor(g.rnd() * 9);
    const score = quarter(72 + g.rnd() * 20);
    const isReference = hasReference && i === 0;
    const value: RankValue = format === "descriptive" ? own(null) : isGroup ? community(score, n, n >= 3 ? Math.round(g.rnd() * 50) / 10 : null) : own(score);
    return {
      id: `sample-${i}`,
      isReference,
      pinned: isReference && g.rnd() < 0.5,
      value,
      mine: format === "descriptive" || g.rnd() < 0.2 ? null : quarter(72 + g.rnd() * 20),
      deltaVsReference: hasReference && !isReference && format !== "descriptive" ? quarter(g.rnd() * 20 - 10) : null,
      attributes: ATTR_IDS.map((id) => ({ id, mine: 1 + Math.floor(g.rnd() * 9), group: g.rnd() < 0.2 ? null : Math.round(g.rnd() * 80) / 10 + 1 })),
      wheel: buildWheelData({ format, evaluations, ownerLens: g.rnd() < 0.3 }),
      defects: buildDefectSummary({ format, cupsPerSample: 2, evaluations }),
    };
  });
  return {
    keys: cuppers,
    input: {
      closed: g.rnd() < 0.9,
      isGroup,
      groupVisible: g.rnd() < 0.9,
      ownerLens: g.rnd() < 0.3,
      format,
      samples,
      referenceId: hasReference ? "sample-0" : null,
      alignment: g.rnd() < 0.7 ? { matches: Math.floor(g.rnd() * 6), opportunities: 5 + Math.floor(g.rnd() * 10), cuppers: cuppers.length } : null,
      repeats: samples.length > 2 && g.rnd() < 0.4 ? [{ a: "sample-1", b: "sample-2", scoreA: 84, scoreB: quarter(80 + g.rnd() * 8) }] : [],
    },
  };
}

describe("on generated sessions", () => {
  const RUNS = 300;

  it("the order is the table's, and the caps hold", () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      // the approved order is the table's...
      const approved = buildLearnings(generated(seed).input, { repeatedFirst: false });
      const index = approved.map((l) => LEARNING_RULES.indexOf(l.rule));
      expect([...index].sort((a, b) => a - b), `seed ${seed}`).toEqual(index);
      // ...and the built default only moves the repeated coffee to the head of the viewer's own
      const list = buildLearnings(generated(seed).input);
      const own = list.filter((l) => learningScope(l.rule) === "mine");
      const rest = own.filter((l) => l.rule !== "P6").map((l) => LEARNING_RULES.indexOf(l.rule));
      expect([...rest].sort((a, b) => a - b), `seed ${seed}`).toEqual(rest);
      expect(own.findIndex((l) => l.rule !== "P6") === -1 || own.slice(own.findIndex((l) => l.rule !== "P6")).every((l) => l.rule !== "P6"), `seed ${seed}`).toBe(true);
      expect(list.filter((l) => learningScope(l.rule) === "panel").length).toBeLessThanOrEqual(LEARNING_CAPS.panel);
      expect(list.filter((l) => learningScope(l.rule) === "mine").length).toBeLessThanOrEqual(LEARNING_CAPS.mine);
      // one learning per rule, except one P6 per repeated pair
      const once = list.filter((l) => l.rule !== "P6").map((l) => l.rule);
      expect(new Set(once).size).toBe(once.length);
    }
  });

  it("nothing identifies a cupper: no key, and every string is a rule, a sample, a wheel node, an attribute or a defect type", () => {
    const allowed = new Set<string>([...LEARNING_RULES, ...NODE_IDS, ...ATTR_IDS, ...SENSORY_DEFECTS]);
    let seen = 0;
    for (let seed = 1; seed <= RUNS; seed++) {
      const { input, keys } = generated(seed);
      const list = buildLearnings(input);
      seen += list.length;
      const json = JSON.stringify(list);
      for (const key of keys) expect(json).not.toContain(key);
      expect(json).not.toMatch(/cupper-|nota de/);
      const sampleIds = new Set(input.samples.map((s) => s.id));
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
        else if (typeof v === "string") expect(allowed.has(v) || sampleIds.has(v), v).toBe(true);
      };
      walk(list);
    }
    expect(seen).toBeGreaterThan(300); // the generator does produce learnings
  });

  it("a score is a number only, and the data is neutral: no word of quality or of fault in any key or value", () => {
    const words = /excel|special|grade|quality|good|bad|best|worst|error|wrong|fault|mistake|calidad|mejor|peor/i;
    for (let seed = 1; seed <= RUNS; seed++) {
      const json = JSON.stringify(buildLearnings(generated(seed).input));
      expect(json).not.toMatch(words);
    }
  });

  it("every rule of the fourteen fires somewhere", () => {
    const fired = new Set<string>();
    for (let seed = 1; seed <= RUNS; seed++) {
      const { input } = generated(seed);
      // look past the caps: each scope alone
      for (const l of buildLearnings(input)) fired.add(l.rule);
      for (const l of buildLearnings({ ...input, samples: input.samples.map((s) => ({ ...s, wheel: null, value: { ...s.value, sd: null } })) })) fired.add(l.rule);
      for (const l of buildLearnings({ ...input, samples: input.samples.map((s) => ({ ...s, mine: null })), alignment: null })) fired.add(l.rule);
    }
    expect([...fired].sort()).toEqual([...LEARNING_RULES].sort());
  });

  it("the same input gives byte-identical output, and the input is not changed", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { input } = generated(seed);
      const before = JSON.stringify(input);
      const a = JSON.stringify(buildLearnings(input));
      const b = JSON.stringify(buildLearnings(JSON.parse(before) as LearningsInput));
      expect(b).toBe(a);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
});

describe("pure", () => {
  it("imports no database, no React, no messages, and holds no sentence", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "lib/reports/learnings.ts"), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      "@/lib/constants",
      "@/lib/cupDefects",
      "@/lib/flavorWheel",
      "@/lib/reports/ranking",
      "@/lib/reports/repeatedSample",
      "@/lib/reports/wheelData",
      "@/lib/resultsScales",
      "@/lib/scoreContext",
      "@/lib/scoring",
    ]);
    expect(src).not.toMatch(/prisma|server-only|next-intl|getTranslations|displayName|cupperId/);
  });
});
