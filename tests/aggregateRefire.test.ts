import { describe, expect, it } from "vitest";
import { replayOverExisting, submittedRefireArgs } from "@/lib/aggregateRefire";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { historyCommunityScore, historyCupsPerSample, isQuickImpression } from "@/lib/historyRules";

describe("submittedRefireArgs (F-solo-2, F-offline-7)", () => {
  it("targets only an already-submitted row and names isDraft in the SET", () => {
    expect(submittedRefireArgs("ev1")).toEqual({
      where: { id: "ev1", isDraft: false },
      data: { isDraft: false },
    });
  });
});

describe("a draft save never carries isDraft", () => {
  it("computeEvaluationDerived output has no isDraft/submittedAt key", () => {
    const fields = computeEvaluationDerived("affective", { fragancia_af_final: 5 }, 5);
    expect("isDraft" in fields).toBe(false);
    expect("submittedAt" in fields).toBe(false);
  });
});

describe("replayOverExisting", () => {
  it("applies when there is no row or a draft row", () => {
    expect(replayOverExisting({ existingIsDraft: null, force: false, isGroup: true })).toBe("apply");
    expect(replayOverExisting({ existingIsDraft: true, force: false, isGroup: true })).toBe("apply");
  });
  it("group: a submitted row is a conflict unless forced", () => {
    expect(replayOverExisting({ existingIsDraft: false, force: false, isGroup: true })).toBe("conflict");
    expect(replayOverExisting({ existingIsDraft: false, force: true, isGroup: true })).toBe("apply");
  });
  it("solo: replay over the owner's own submitted row applies", () => {
    expect(replayOverExisting({ existingIsDraft: false, force: false, isGroup: false })).toBe("apply");
  });
});

describe("history honesty (F-solo-4, F-express-4)", () => {
  it("community score is null without an included evaluation", () => {
    expect(historyCommunityScore(null)).toBeNull();
    expect(historyCommunityScore({ communityScore: 0, participantCount: 0 })).toBeNull();
    expect(historyCommunityScore({ communityScore: 81.25, participantCount: 2 })).toBe(81.25);
  });
  it("tags a session of exactly one cup per sample, nothing else", () => {
    expect(isQuickImpression(1)).toBe(true);
    expect(isQuickImpression(2)).toBe(false);
    expect(isQuickImpression(4)).toBe(false);
    expect(isQuickImpression(5)).toBe(false);
    expect(isQuickImpression(null)).toBe(false);
  });
  it("cups come from the session, else from the snapshot", () => {
    expect(historyCupsPerSample({ cupsPerSample: 2 }, { cupsPerSample: 5 })).toBe(2);
    expect(historyCupsPerSample(null, { cupsPerSample: 3 })).toBe(3);
    expect(historyCupsPerSample(null, null)).toBeNull();
  });
});
