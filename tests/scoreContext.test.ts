import { describe, it, expect } from "vitest";
import { RANKING_POLICY, type RankValue } from "@/lib/reports/ranking";
import { QUALITY_BY_ATTRIBUTE_MIN_N, panelGates, scoreContext } from "@/lib/scoreContext";

// Package R1a: what is shown beside a score at each number of cuppers
// (docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 0 choice 6 and section 4).

const community = (score: number, n: number, sd: number | null, extra: Partial<RankValue> = {}): RankValue => ({
  score,
  sd,
  basis: "community",
  n,
  total: 8,
  cups: n * 2,
  ...extra,
});

describe("what a panel of n included cuppers shows", () => {
  const ALL_OFF = {
    groupQualityByAttribute: false,
    groupIntensities: false,
    sharedDescriptors: false,
    youAndPanel: false,
    panelLearnings: false,
    difference: false,
    spread: false,
    first: false,
    firm: false,
  };

  it("nobody, or one cupper: nothing of the group beside a person's own values", () => {
    for (const n of [null, undefined, 0, 1, Number.NaN]) expect(panelGates(n)).toEqual(ALL_OFF);
  });

  it("two cuppers: the group's QUALITY values per attribute, and nothing that compares", () => {
    expect(QUALITY_BY_ATTRIBUTE_MIN_N).toBe(2);
    expect(panelGates(2)).toEqual({ ...ALL_OFF, groupQualityByAttribute: true });
  });

  it("three to five: everything, still not firm", () => {
    for (const n of [3, 4, 5]) {
      expect(panelGates(n)).toEqual({
        groupQualityByAttribute: true,
        groupIntensities: true,
        sharedDescriptors: true,
        youAndPanel: true,
        panelLearnings: true,
        difference: true,
        spread: true,
        first: true,
        firm: false,
      });
    }
  });

  it("six or more: firm", () => {
    expect(panelGates(6).firm).toBe(true);
    expect(panelGates(40).firm).toBe(true);
  });

  it("the thresholds are the ranking's own", () => {
    expect(panelGates(RANKING_POLICY.minN - 1).spread).toBe(false);
    expect(panelGates(RANKING_POLICY.minN).spread).toBe(true);
    expect(panelGates(RANKING_POLICY.indicativeBelow - 1).firm).toBe(false);
    expect(panelGates(RANKING_POLICY.indicativeBelow).firm).toBe(true);
  });
});

describe("what is printed beside one score", () => {
  it("a firm community score: spread, n de N, mine, the difference, the delta", () => {
    expect(
      scoreContext({ value: community(88.75, 7, 2.9), mine: 90.75, deltaVsReference: 9.75, noClearGap: true }),
    ).toEqual({
      score: 88.75,
      basis: "community",
      spread: 2.9,
      included: { n: 7, total: 8 },
      mine: 90.75,
      difference: 2,
      deltaVsReference: 9.75,
      indicative: false,
      suppressed: false,
      noClearGap: true,
      canBeFirst: true,
    });
  });

  it("the difference keeps its sign and two decimals", () => {
    expect(scoreContext({ value: community(84.25, 7, 3.3), mine: 83.5 }).difference).toBe(-0.75);
    expect(scoreContext({ value: community(84.3, 7, 3.3), mine: 85.35 }).difference).toBe(1.05);
    expect(Object.is(scoreContext({ value: community(84.25, 7, 3.3), mine: 84.25 }).difference, 0)).toBe(true);
  });

  it("three to five cuppers: the same parts, marked indicativo", () => {
    const c = scoreContext({ value: community(85.5, 4, 2.1), mine: 86 });
    expect(c.indicative).toBe(true);
    expect(c.spread).toBe(2.1);
    expect(c.difference).toBe(0.5);
    expect(c.canBeFirst).toBe(true);
  });

  it("too few pooled cups is indicativo too, whatever the number of cuppers", () => {
    expect(scoreContext({ value: community(85.5, 7, 2.1, { cups: 4 }), mine: null }).indicative).toBe(true);
    expect(scoreContext({ value: community(85.5, 7, 2.1, { cups: 14 }), mine: null }).indicative).toBe(false);
  });

  it("two cuppers: the number and n de N, no spread, no difference, never first", () => {
    // two cuppers with five cups each: enough cups, so only the number of cuppers speaks
    expect(scoreContext({ value: community(86, 2, 1.5, { cups: 10 }), mine: 87.5, deltaVsReference: 7 })).toEqual({
      score: 86,
      basis: "community",
      spread: null,
      included: { n: 2, total: 8 },
      mine: 87.5,
      difference: null,
      deltaVsReference: 7,
      indicative: false,
      suppressed: true,
      noClearGap: false,
      canBeFirst: false,
    });
  });

  it("the two flags are the ranking's own, passed through unchanged", () => {
    // two cuppers, two cups each: too few cuppers AND too few cups. A surface that
    // prints one badge reads either flag as "indicativo", as the participant summary does.
    const c = scoreContext({ value: community(86, 2, 1.5, { cups: 4 }), mine: null });
    expect([c.suppressed, c.indicative]).toEqual([true, true]);
  });

  it("a community score whose n is not known shows the number alone", () => {
    const c = scoreContext({ value: community(86, 7, 2, { n: null }), mine: 87 });
    expect(c.included).toBeNull();
    expect(c.spread).toBeNull();
    expect(c.difference).toBeNull();
    expect(c.canBeFirst).toBe(false);
  });

  it("a solo cupper's own score carries nothing but itself, and can be first of their ranking", () => {
    const mine: RankValue = { score: 84.25, sd: null, basis: "mine", n: null, total: null };
    expect(scoreContext({ value: mine, mine: 84.25, noClearGap: true })).toEqual({
      score: 84.25,
      basis: "mine",
      spread: null,
      included: null,
      mine: null,
      difference: null,
      deltaVsReference: null,
      indicative: false,
      suppressed: false,
      noClearGap: true,
      canBeFirst: true,
    });
  });

  it("a reference is outside the ranking: never first, never tied, no delta against itself", () => {
    const pinned = scoreContext({
      value: community(79, 7, null),
      mine: 79,
      isReference: true,
      noClearGap: true,
      deltaVsReference: 0,
    });
    expect(pinned.canBeFirst).toBe(false);
    expect(pinned.noClearGap).toBe(false);
    expect(pinned.deltaVsReference).toBeNull();
    expect(pinned.spread).toBeNull();
    expect(pinned.included).toEqual({ n: 7, total: 8 });
    // a free reference has an average and a spread like any sample, and stays outside the ranking
    const free = scoreContext({ value: community(81.5, 7, 2.4), mine: 82.75, isReference: true });
    expect(free.spread).toBe(2.4);
    expect(free.difference).toBe(1.25);
    expect(free.canBeFirst).toBe(false);
  });

  it("no score (a descriptive session, an unsent evaluation): nothing", () => {
    const none: RankValue = { score: null, sd: null, basis: null, n: null, total: null };
    expect(scoreContext({ value: none, mine: null, noClearGap: true, deltaVsReference: 3 })).toEqual({
      score: null,
      basis: null,
      spread: null,
      included: null,
      mine: null,
      difference: null,
      deltaVsReference: 3,
      indicative: false,
      suppressed: false,
      noClearGap: false,
      canBeFirst: false,
    });
  });

  it("a score is a number only: no part names or grades it", () => {
    const c = scoreContext({ value: community(92.5, 9, 1.2), mine: 60 });
    expect(Object.keys(c).sort()).toEqual(
      [
        "basis",
        "canBeFirst",
        "deltaVsReference",
        "difference",
        "included",
        "indicative",
        "mine",
        "noClearGap",
        "score",
        "spread",
        "suppressed",
      ].sort(),
    );
    const strings = Object.values(c).filter((v) => typeof v === "string");
    expect(strings).toEqual(["community"]);
    // the same parts for a low score and for a high one
    const low = scoreContext({ value: community(61, 9, 1.2), mine: 60 });
    expect(Object.keys(low).sort()).toEqual(Object.keys(c).sort());
  });

  it("the same input gives byte-identical output", () => {
    const input = { value: community(88.75, 7, 2.9), mine: 90.75, deltaVsReference: 9.75 };
    expect(JSON.stringify(scoreContext(input))).toBe(JSON.stringify(scoreContext({ ...input, value: { ...input.value } })));
  });
});
