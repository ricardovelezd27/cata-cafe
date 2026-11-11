import { describe, expect, it } from "vitest";
import { coffeeHistoryRefresh } from "@/lib/historyRules";

describe("S8-28 B-03 coffeeHistoryRefresh", () => {
  it("re-links the surviving evaluation and refreshes both scores", () => {
    expect(coffeeHistoryRefresh({ id: "ev-2", individualScore: 84.5 }, 83)).toEqual({
      evaluationId: "ev-2",
      individualScore: 84.5,
      communityScore: 83,
    });
  });

  it("keeps a null community score null", () => {
    expect(coffeeHistoryRefresh({ id: "e", individualScore: null }, null).communityScore).toBeNull();
  });
});
