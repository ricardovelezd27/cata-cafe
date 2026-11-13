import { describe, expect, it } from "vitest";
import { cupScoreHint } from "@/lib/cupHint";

describe("cupScoreHint (review L3)", () => {
  it("states the real cost: 6 for a defective cup (4 with a single cup), 2 for non-uniform only", () => {
    for (const isGroup of [true, false]) {
      const hint = cupScoreHint(isGroup);
      expect(hint).toContain("te resta 6 puntos (4 por el defecto y 2 por no ser uniforme)");
      expect(hint).toContain("con una sola taza, 4");
      expect(hint).toContain("solo no uniforme, 2");
    }
  });

  it("mentions the group only in group sessions", () => {
    expect(cupScoreHint(true)).toContain("Tus tazas se suman a las del grupo.");
    expect(cupScoreHint(false)).not.toContain("grupo");
  });
});
