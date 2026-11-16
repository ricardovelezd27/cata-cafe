import { describe, it, expect } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { calcRawScore } from "@/lib/scoring";
import { RANKING_POLICY, rankSamples, type RankableSample } from "@/lib/reports/ranking";
import {
  INTENSITY_SCALE,
  QUALITY_SCALE,
  SCORE_SCALE,
  countBar,
  countBars,
  dotPlotAxis,
  dotPlotRow,
  isOffScoreScale,
  rankStripRow,
  round2,
  scalePct,
  scoreAxis,
  scorePct,
  tieBars,
  tiesWithNext,
  type TieEntry,
} from "@/lib/resultsScales";

// Package R1a: the pure scales of the results page's small drawings
// (docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 0, 2 and 3).

const allAt = (v: number) =>
  Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, v]));

describe("the score scale, 58 to 100", () => {
  it("its three numbers are the formula's own: every attribute at 1, at 5 and at 9", () => {
    expect(calcRawScore(allAt(1))).toBe(SCORE_SCALE.min);
    expect(calcRawScore(allAt(5))).toBe(SCORE_SCALE.neutral);
    expect(calcRawScore(allAt(9))).toBe(SCORE_SCALE.max);
  });

  it("58 is the left end, 100 the right end, and 79 exactly the middle", () => {
    expect(scorePct(58)).toBe(0);
    expect(scorePct(100)).toBe(100);
    expect(scorePct(79)).toBe(50);
    expect(scorePct(88.75)).toBe(73.21);
    expect(scoreAxis()).toEqual([
      { value: 58, pct: 0 },
      { value: 79, pct: 50 },
      { value: 100, pct: 100 },
    ]);
  });

  it("a score under 58 (deductions) sits at the left edge and says so", () => {
    expect(scorePct(52)).toBe(0);
    expect(isOffScoreScale(52)).toBe(true);
    expect(scorePct(101)).toBe(100);
    expect(isOffScoreScale(101)).toBe(true);
    expect(isOffScoreScale(58)).toBe(false);
    expect(isOffScoreScale(100)).toBe(false);
  });

  it("is monotonic, and never produces NaN or -0", () => {
    let prev = -1;
    for (let s = 58; s <= 100; s += 0.25) {
      const p = scorePct(s);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(scorePct(Number.NaN)).toBe(0);
    expect(scalePct(5, 3, 3)).toBe(0);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
  });
});

describe("the ranking strip", () => {
  it("places the group's dot, my ring, the spread and the reference on one scale", () => {
    expect(rankStripRow({ group: 88.75, spread: 2.9, mine: 90.75, reference: 79 })).toEqual({
      neutral: 50,
      reference: 50,
      group: 73.21,
      mine: 77.98,
      whisker: { from: 66.31, to: 80.12, cutLow: false, cutHigh: false },
      offScale: { group: false, mine: false, reference: false },
    });
  });

  it("no spread, no whisker: a pinned reference, two cuppers, a spread of zero", () => {
    expect(rankStripRow({ group: 79, spread: null, mine: 79 }).whisker).toBeNull();
    expect(rankStripRow({ group: 84, spread: 0, mine: null }).whisker).toBeNull();
    expect(rankStripRow({ group: null, spread: 3, mine: 84 }).whisker).toBeNull();
  });

  it("solo: only my ring; an open session: nothing of the group", () => {
    const row = rankStripRow({ group: null, spread: null, mine: 84.25 });
    expect(row.group).toBeNull();
    expect(row.reference).toBeNull();
    expect(row.mine).toBe(62.5);
    expect(row.neutral).toBe(50);
  });

  it("the whisker is cut at the ends of the scale, and says where", () => {
    expect(rankStripRow({ group: 98, spread: 4, mine: null }).whisker).toEqual({
      from: 85.71,
      to: 100,
      cutLow: false,
      cutHigh: true,
    });
    expect(rankStripRow({ group: 59, spread: 3, mine: null }).whisker).toEqual({
      from: 0,
      to: 9.52,
      cutLow: true,
      cutHigh: false,
    });
  });

  it("a score under 58 is drawn at the edge and flagged, so its number can be trusted over its place", () => {
    const row = rankStripRow({ group: 55.5, spread: null, mine: 57.75, reference: 79 });
    expect(row.group).toBe(0);
    expect(row.mine).toBe(0);
    expect(row.offScale).toEqual({ group: true, mine: true, reference: false });
  });
});

describe("the single tie bar", () => {
  const e = (score: number | null, sd: number | null = null, n: number | null = 7): TieEntry => ({ score, sd, n });

  it("the floor: closer than one point is a tie, exactly one point is not", () => {
    expect(tiesWithNext([e(88.75), e(88), e(87)])).toEqual([true, false, false]);
    expect(tiesWithNext([e(85), e(84)])).toEqual([false, false]);
    expect(tiesWithNext([e(85), e(85)])).toEqual([true, false]);
  });

  it("the spread: closer than half the larger sample SD is a tie too", () => {
    // population SD 4.6 of 7 -> sample SD 4.97; half of it is 2.48 points
    expect(tiesWithNext([e(88, 4.6), e(86, 2.1)])).toEqual([true, false]);
    expect(tiesWithNext([e(88, 4.6), e(85.5, 2.1)])).toEqual([false, false]);
    // the larger of the two counts, whichever row carries it
    expect(tiesWithNext([e(88, 2.1), e(86, 4.6)])).toEqual([true, false]);
  });

  it("unscored rows never tie, and the last row has no next", () => {
    expect(tiesWithNext([e(88), e(null), e(null)])).toEqual([false, false, false]);
    expect(tiesWithNext([e(88)])).toEqual([false]);
    expect(tiesWithNext([])).toEqual([]);
  });

  it("one bar per unbroken run of tied neighbours", () => {
    // 88.75 ~ 88 ~ 87.5, then a clear gap, then 85.5 ~ 85, then a clear gap
    const rows = [e(88.75), e(88), e(87.5), e(85.5), e(85), e(82)];
    expect(tiesWithNext(rows)).toEqual([true, true, false, true, false, false]);
    expect(tieBars(rows)).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 4 },
    ]);
    expect(tieBars([e(90), e(85), e(80)])).toEqual([]);
    expect(tieBars([e(90)])).toEqual([]);
    expect(tieBars([])).toEqual([]);
  });

  it("a bar covers every tied pair and nothing else", () => {
    const rows = [e(88.75), e(88), e(87.5), e(85.5), e(85), e(82)];
    const ties = tiesWithNext(rows);
    const covered = new Set<number>();
    for (const bar of tieBars(rows)) {
      expect(bar.to).toBeGreaterThan(bar.from);
      for (let i = bar.from; i < bar.to; i++) covered.add(i);
    }
    ties.forEach((t, i) => expect(covered.has(i)).toBe(t));
  });

  it("is the ranking's own rule: a row is flagged there exactly when it is tied with a neighbour here", () => {
    // a small deterministic generator: the same lists on every run
    let seed = 20261116;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const ctx = { format: "affective" as const, isGroup: true, canViewGroup: true, cupsPerSample: 2 };
    for (let run = 0; run < 150; run++) {
      const samples: RankableSample[] = Array.from({ length: 2 + Math.floor(rnd() * 7) }, (_, i) => {
        const n = 1 + Math.floor(rnd() * 8);
        return {
          id: `s${i}`,
          descriptive: {},
          affective: {},
          combined: {},
          aggregateScore: {
            communityScore: rnd() < 0.1 ? null : 78 + Math.round(rnd() * 48) / 4,
            scoreSd: n < 2 ? null : Math.round(rnd() * 60) / 10,
            participantCount: n,
            totalSubmitted: n + 1,
            totalCups: n * 2,
          },
          myEvaluation: { status: "none", complete: false },
        };
      });
      const { ranked } = rankSamples(samples, null, ctx);
      const ties = tiesWithNext(ranked);
      ranked.forEach((row, i) => {
        expect(row.noClearGap, `run ${run}, row ${i}`).toBe(ties[i] || (i > 0 && ties[i - 1]));
      });
    }
  });

  it("with the rule switched off there is no bar", () => {
    const off = { ...RANKING_POLICY, gapSdFactor: 0, gapFloor: 0 };
    expect(tieBars([e(85, 5), e(85, 5), e(85, 5)], off)).toEqual([]);
  });
});

describe("the dot plot", () => {
  it("quality: one fixed 1 to 9 scale", () => {
    expect(dotPlotRow(QUALITY_SCALE, { mine: 1, group: 9 })).toEqual({ mine: 0, group: 100 });
    expect(dotPlotRow(QUALITY_SCALE, { mine: 5, group: 7.1 })).toEqual({ mine: 50, group: 76.25 });
    expect(dotPlotAxis(QUALITY_SCALE)).toEqual([
      { value: 1, pct: 0 },
      { value: 3, pct: 25 },
      { value: 5, pct: 50 },
      { value: 7, pct: 75 },
      { value: 9, pct: 100 },
    ]);
  });

  it("intensities: one fixed 0 to 15 scale", () => {
    expect(dotPlotRow(INTENSITY_SCALE, { mine: 0, group: 15 })).toEqual({ mine: 0, group: 100 });
    expect(dotPlotRow(INTENSITY_SCALE, { mine: 7.5, group: 10 })).toEqual({ mine: 50, group: 66.67 });
    expect(dotPlotAxis(INTENSITY_SCALE).map((t) => t.pct)).toEqual([0, 33.33, 66.67, 100]);
  });

  it("a value that is absent or withheld draws nothing; one off the scale is drawn at its end", () => {
    expect(dotPlotRow(QUALITY_SCALE, { mine: null, group: undefined })).toEqual({ mine: null, group: null });
    expect(dotPlotRow(QUALITY_SCALE, { mine: Number.NaN, group: 6 })).toEqual({ mine: null, group: 62.5 });
    expect(dotPlotRow(QUALITY_SCALE, { mine: 0, group: 12 })).toEqual({ mine: 0, group: 100 });
  });
});

describe("counted bars", () => {
  it("a bar is as long as the share of people", () => {
    expect(countBar(6, 7)).toEqual({ count: 6, n: 7, share: 6 / 7, pct: 85.71 });
    expect(countBar(7, 7)).toEqual({ count: 7, n: 7, share: 1, pct: 100 });
    expect(countBar(0, 7)).toEqual({ count: 0, n: 7, share: 0, pct: 0 });
  });

  it("never longer than its track, never negative, never divided by zero", () => {
    expect(countBar(9, 7)).toEqual({ count: 7, n: 7, share: 1, pct: 100 });
    expect(countBar(-1, 7).pct).toBe(0);
    expect(countBar(3, 0)).toEqual({ count: 0, n: 0, share: 0, pct: 0 });
    expect(countBar(Number.NaN, 7).count).toBe(0);
  });

  it("listed most people first; equal counts keep the order given; nobody is not listed", () => {
    const items = [
      { id: "a", count: 3 },
      { id: "b", count: 6 },
      { id: "c", count: 0 },
      { id: "d", count: 3 },
      { id: "e", count: 6 },
    ];
    expect(countBars(items, 7).map((r) => r.id)).toEqual(["b", "e", "a", "d"]);
    expect(countBars(items, 7, 2).map((r) => r.id)).toEqual(["b", "e"]);
    expect(countBars(items, 7)[0]).toEqual({ id: "b", count: 6, bar: { count: 6, n: 7, share: 6 / 7, pct: 85.71 } });
    expect(countBars([], 7)).toEqual([]);
  });
});

describe("the page and the PDF agree", () => {
  it("the same input gives byte-identical output", () => {
    const strip = () => JSON.stringify(rankStripRow({ group: 85.5, spread: 2.1, mine: 86.25, reference: 81.5 }));
    expect(strip()).toBe(strip());
    const rows = [{ score: 88.75, sd: 2.9, n: 7 }, { score: 88, sd: 4.6, n: 7 }, { score: 85.5, sd: 2.1, n: 7 }];
    expect(JSON.stringify(tieBars(rows))).toBe(JSON.stringify(tieBars(rows.map((r) => ({ ...r })))));
  });

  it("every position has at most two decimals", () => {
    for (let s = 58; s <= 100; s += 0.25) {
      expect(String(scorePct(s))).toMatch(/^\d+(\.\d{1,2})?$/);
    }
    for (let c = 0; c <= 9; c++) expect(String(countBar(c, 9).pct)).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});
