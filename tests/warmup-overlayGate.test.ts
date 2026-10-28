import { describe, expect, it } from "vitest";
import { onCuppingStarted, shouldShowWarmupOverlay, START_EXIT_CAP_MS } from "@/lib/warmup/overlayGate";

const base = {
  exerciseId: "eyes",
  seenValue: null,
  hasOwnEvaluation: false,
  isOwner: false,
  isGroup: true,
  isAsync: false,
};

describe("shouldShowWarmupOverlay", () => {
  it.each([
    ["no exercise", { exerciseId: null }, false],
    ["unknown exercise id", { exerciseId: "yoga" }, false],
    ["already seen this exercise", { seenValue: "eyes" }, false],
    ["seen a different exercise → re-armed", { seenValue: "arm-raise" }, true],
    ["has an evaluation already", { hasOwnEvaluation: true }, false],
    ["owner of a live group session", { isOwner: true }, false],
    ["owner of an async group session", { isOwner: true, isAsync: true }, true],
    ["solo owner", { isOwner: true, isGroup: false }, true],
    ["live participant", {}, true],
    ["async participant", { isAsync: true }, true],
  ])("%s", (_name, patch, expected) => {
    expect(shouldShowWarmupOverlay({ ...base, ...patch })).toBe(expected);
  });
});

describe("onCuppingStarted", () => {
  it("pushes unless the player is mid-run", () => {
    expect(onCuppingStarted("closed")).toBe("push");
    expect(onCuppingStarted("intro")).toBe("push");
    expect(onCuppingStarted("ended")).toBe("push");
    expect(onCuppingStarted("run")).toBe("bar");
    expect(START_EXIT_CAP_MS).toBe(30000);
  });
});
