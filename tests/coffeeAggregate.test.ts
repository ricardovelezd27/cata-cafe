import { describe, it, expect } from "vitest";
import { computeCoffeeAggregate, type CoffeeAggregateSampleInput } from "@/lib/coffeeAggregate";

function sample(
  id: string,
  sessionId: string,
  name: string | null,
  score: number,
  evs: { score: number; visible: boolean; at: string }[],
): CoffeeAggregateSampleInput {
  return {
    id,
    sessionId,
    session: { id: sessionId, name, date: name === null ? null : new Date("2026-10-01") },
    aggregateScore: { communityScore: score, participantCount: evs.length, attrAverages: {} },
    evaluations: evs.map((e) => ({
      descriptiveData: {},
      combinedData: {},
      individualScore: e.score,
      submittedAt: new Date(e.at),
      visibleIndividually: e.visible,
    })),
  };
}

describe("computeCoffeeAggregate with viewer-filtered rows (S8-02)", () => {
  const named = sample("a", "s1", "Mi sesión", 90, [
    { score: 90, visible: true, at: "2026-10-02T10:00:00Z" },
    { score: 88, visible: false, at: "2026-10-02T11:00:00Z" },
  ]);
  const stranger = sample("b", "s2", null, 80, [
    { score: 80, visible: false, at: "2026-10-03T10:00:00Z" },
    { score: 80, visible: false, at: "2026-10-03T11:00:00Z" },
  ]);

  it("lists only named sessions but counts every session in the totals", () => {
    const agg = computeCoffeeAggregate([named, stranger]);
    expect(agg.sessionRows.map((r) => r.sessionName)).toEqual(["Mi sesión"]);
    expect(agg.sessionsCount).toBe(2);
    expect(agg.evaluationsCount).toBe(4);
  });

  it("community weighting is unchanged (golden: (90*2 + 80*2) / 4)", () => {
    expect(computeCoffeeAggregate([named, stranger]).communityAvg).toBe(85);
  });

  it("recent tastings carry only individually visible evaluations of named sessions", () => {
    const agg = computeCoffeeAggregate([named, stranger]);
    expect(agg.recentEvaluations).toHaveLength(1);
    expect(agg.recentEvaluations[0].individualScore).toBe(90);
    expect(agg.recentEvaluations[0].sessionName).toBe("Mi sesión");
  });

  it("no result row can carry a null session name", () => {
    const agg = computeCoffeeAggregate([stranger]);
    expect(agg.sessionRows).toEqual([]);
    expect(agg.recentEvaluations).toEqual([]);
    expect(agg.communityAvg).toBe(80);
  });
});
