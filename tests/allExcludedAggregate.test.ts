import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { noIncludedAggregate, rankFor, type RankableSample } from "@/lib/reports/ranking";

// S8-22 B-07: a sample whose cuppers are all excluded has no community score.
describe("noIncludedAggregate (B-07)", () => {
  it("has n = 0, no score, and N counts every submitted evaluation", () => {
    const a = noIncludedAggregate(4);
    expect(a.communityScore).toBeNull();
    expect(a.participantCount).toBe(0);
    expect(a.totalSubmitted).toBe(4);
  });

  it("rankFor never reads it as a community score of 0", () => {
    const sample = {
      id: "s1",
      descriptive: {},
      affective: {},
      combined: {},
      aggregateScore: noIncludedAggregate(4),
      myEvaluation: null,
    } as unknown as RankableSample;
    const r = rankFor(sample, { format: "affective", isGroup: true, canViewGroup: true, cupsPerSample: 5 });
    expect(r.basis).not.toBe("community");
    expect(r.score).not.toBe(0);
  });

  it("the results page uses it instead of the trigger row when every evaluation is excluded", () => {
    const src = readFileSync("app/[locale]/app/sessions/[id]/results/page.tsx", "utf8");
    const i = src.indexOf("noIncludedAggregate(submittedAllBySample.get(s.id) ?? 0)");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(src.indexOf("communityScore: agg.communityScore"));
  });
});
